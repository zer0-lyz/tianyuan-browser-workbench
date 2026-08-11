#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SERVER_URL = "https://mcp.zhrdc.net/valuation-mcp";
const USER_AGENT = "tianyuan-financial-statement-import/0.1";
const REQUEST_TIMEOUT_MS = 30_000;
const SUPPORTED_STATEMENT_TYPES = new Set(["balance_sheet", "income_statement"]);
const SUPPORTED_READ_TYPES = new Set(["all", "balance_sheet", "income_statement"]);
const SUPPORTED_REPORT_MODES = new Set(["all", "1", "2"]);

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label}_INVALID`, `${label} 文件无法读取或不是合法 JSON。`, { cause: error?.message || String(error) });
  }
}

function loadCredentials() {
  const home = os.homedir();
  const authPath = path.join(home, ".tycpv", "auth.json");
  const tokenPath = path.join(home, ".tycpv", "token.secret.json");
  if (!fs.existsSync(authPath) || !fs.existsSync(tokenPath)) {
    fail("TYCPV_AUTH_REQUIRED", "未找到 tycpv 登录态，请先运行 tycpv login。\n也可以检查 ~/.tycpv/auth.json 和 ~/.tycpv/token.secret.json。" );
  }

  const auth = readJson(authPath, "tycpv 登录态");
  const tokenConfig = readJson(tokenPath, "tycpv 凭据");
  if (auth.expiresAt && Date.now() >= new Date(auth.expiresAt).getTime()) {
    fail("TYCPV_AUTH_EXPIRED", `tycpv 登录态已过期（${String(auth.expiresAt)}），请先运行 tycpv login。`);
  }
  let token = String(tokenConfig.value || "").trim();
  if (tokenConfig.provider === "plain-file") {
    try {
      token = Buffer.from(token, "base64url").toString("utf8").trim();
    } catch {
      fail("TYCPV_TOKEN_INVALID", "tycpv 本机凭据格式无效，请重新运行 tycpv login。" );
    }
  }
  if (!token) fail("TYCPV_TOKEN_INVALID", "tycpv 本机凭据为空，请重新运行 tycpv login。" );
  if (!token.startsWith("Bearer ")) token = `Bearer ${token}`;

  const serverUrl = String(auth.serverUrl || DEFAULT_SERVER_URL).trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    fail("MCP_SERVER_URL_INVALID", "tycpv 登录态中的 MCP 服务地址无效。" );
  }
  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    fail("MCP_SERVER_URL_INVALID", "MCP 服务地址必须使用 HTTP 或 HTTPS。" );
  }
  return { serverUrl: parsedUrl.href, authorization: token };
}

function parseArgs(argv) {
  const command = String(argv[0] || "").trim();
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const item = String(argv[index] || "");
    if (!item.startsWith("--")) fail("ARGUMENT_INVALID", `无法识别参数：${item}`);
    const equalIndex = item.indexOf("=");
    const key = equalIndex >= 0 ? item.slice(2, equalIndex) : item.slice(2);
    if (!key) fail("ARGUMENT_INVALID", "参数名不能为空。" );
    if (equalIndex >= 0) {
      values[key] = item.slice(equalIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith("--")) {
      values[key] = String(next);
      index += 1;
    } else {
      values[key] = true;
    }
  }
  return { command, values };
}

function requiredValue(values, key) {
  const value = String(values[key] ?? "").trim();
  if (!value) fail("ARGUMENT_REQUIRED", `缺少参数 --${key}。`);
  return value;
}

function positiveInteger(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text) || Number(text) <= 0 || !Number.isSafeInteger(Number(text))) {
    fail(`${fieldName.toUpperCase()}_INVALID`, `${fieldName} 必须是正整数。`);
  }
  return Number(text);
}

function parseReportMode(value, defaultValue = 1) {
  const text = String(value ?? defaultValue).trim();
  if (!SUPPORTED_REPORT_MODES.has(text)) fail("REPORT_MODE_INVALID", "reportMode 只能是 1、2 或 all。" );
  return text === "all" ? "all" : Number(text);
}

function parseProtocolMessages(body) {
  const text = String(body || "");
  const messages = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      messages.push(JSON.parse(payload));
    } catch {
      // Ignore non-JSON SSE keepalive data.
    }
  }
  if (messages.length) return messages;
  try {
    return text.trim() ? [JSON.parse(text)] : [];
  } catch {
    return [];
  }
}

function safeHttpFailure(status, body) {
  const text = String(body || "").toLowerCase();
  if (status === 401 || status === 403 || text.includes("unauthorized") || text.includes("invalid token")) {
    fail("MCP_AUTH_REQUIRED", "MCP 登录态无效或已过期，请运行 tycpv login 后重试。" );
  }
  fail("MCP_HTTP_ERROR", `MCP 服务请求失败（HTTP ${status}）。`, { status });
}

function createMcpClient(credentials) {
  let sessionId = "";
  let nextRequestId = 1;

  async function rpc(method, params = {}, { notification = false } = {}) {
    const requestId = notification ? undefined : nextRequestId++;
    const headers = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: credentials.authorization,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(credentials.serverUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(notification ? {} : { id: requestId }),
          method,
          params,
        }),
        signal: controller.signal,
      });
      const returnedSessionId = response.headers.get("mcp-session-id");
      if (returnedSessionId) sessionId = returnedSessionId;
      const body = await response.text();
      if (!response.ok) safeHttpFailure(response.status, body);
      if (notification) return null;
      const messages = parseProtocolMessages(body);
      const message = messages.find((item) => item?.id === requestId) || messages[0];
      if (!message) fail("MCP_EMPTY_RESPONSE", "MCP 服务没有返回有效响应。" );
      if (message.error) {
        fail("MCP_RPC_ERROR", String(message.error.message || "MCP 工具调用失败。"), {
          remoteCode: message.error.code ?? null,
        });
      }
      return message.result ?? message;
    } catch (error) {
      if (error?.name === "AbortError") fail("MCP_TIMEOUT", "MCP 服务响应超时，请稍后重试。" );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function initialize() {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "tianyuan-financial-statement-import", version: "0.1.0" },
    });
    await rpc("notifications/initialized", {}, { notification: true });
    const listed = await rpc("tools/list", {});
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    return { tools };
  }

  async function callTool(name, args) {
    const result = await rpc("tools/call", { name, arguments: args });
    if (result?.isError) fail("MCP_TOOL_ERROR", `远端工具 ${name} 执行失败。` );
    const content = Array.isArray(result?.content) ? result.content : [];
    const textItem = content.find((item) => item?.type === "text" && item.text !== undefined);
    if (!textItem) return result;
    const text = String(textItem.text || "").trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }

  return { initialize, callTool };
}

function ensureRemoteTool(tools, name) {
  if (!tools.some((tool) => tool?.name === name)) {
    fail("MCP_TOOL_NOT_AVAILABLE", `当前 valuation-mcp 未提供工具 ${name}。` );
  }
}

function sourcePayloadFromJson(filePath) {
  if (filePath) {
    const value = readJson(path.resolve(filePath), "报表解析数据");
    return value?.payload && typeof value.payload === "object" ? value.payload : value;
  }
  return null;
}

function validateSheetList(sheetList, statementType) {
  if (!Array.isArray(sheetList) || sheetList.length < 1 || sheetList.length > 10) {
    fail("SHEET_LIST_INVALID", "sheetList 至少需要一个、最多支持十个报表年度。" );
  }
  return sheetList.map((sheet, index) => {
    if (!sheet || typeof sheet !== "object") fail("SHEET_INVALID", `第 ${index + 1} 个工作表数据无效。` );
    const reportYear = Number(sheet.reportYear);
    if (!Number.isInteger(reportYear) || reportYear < 1900 || reportYear > 2100) {
      fail("REPORT_YEAR_INVALID", `第 ${index + 1} 个工作表的 reportYear 无效。` );
    }
    if (!Array.isArray(sheet.detail) || sheet.detail.length < 1 || sheet.detail.length > 5000) {
      fail("DETAIL_INVALID", `第 ${index + 1} 个工作表至少需要一条科目金额。` );
    }
    const detail = sheet.detail.map((item, detailIndex) => {
      if (!item || typeof item !== "object" || !String(item.subjectName || "").trim()) {
        fail("SUBJECT_NAME_INVALID", `第 ${index + 1} 个工作表第 ${detailIndex + 1} 条科目缺少 subjectName。` );
      }
      if (item.amount !== null && item.amount !== undefined && typeof item.amount !== "number" && typeof item.amount !== "string") {
        fail("SUBJECT_AMOUNT_INVALID", `第 ${index + 1} 个工作表第 ${detailIndex + 1} 条金额格式无效。` );
      }
      return {
        subjectName: String(item.subjectName).trim(),
        amount: item.amount === undefined ? null : item.amount,
        ...(item.originName ? { originName: String(item.originName) } : {}),
      };
    });
    const result = {
      reportYear,
      ...(sheet.sourceSheetName ? { sourceSheetName: String(sheet.sourceSheetName) } : {}),
      detail,
    };
    if (statementType === "balance_sheet" && sheet.auditType !== undefined && sheet.auditType !== null) {
      const auditType = Number(sheet.auditType);
      if (![1, 2].includes(auditType)) fail("AUDIT_TYPE_INVALID", "资产负债表 auditType 只能是 1 或 2。" );
      result.auditType = auditType;
    }
    if (sheet.audit && typeof sheet.audit === "object") result.audit = sheet.audit;
    return result;
  });
}

function buildPrepareRequest(values) {
  const filePath = path.resolve(requiredValue(values, "file"));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail("SOURCE_FILE_NOT_FOUND", "报表源文件不存在或不是文件。" );
  if (!/\.(xlsx|xlsm)$/i.test(filePath)) fail("SOURCE_FILE_TYPE_INVALID", "报表源文件必须是 .xlsx 或 .xlsm。" );
  const payload = sourcePayloadFromJson(values.json ? String(values.json) : "");
  const projectId = positiveInteger(values["project-id"] ?? payload?.projectId, "projectId");
  const companyId = positiveInteger(values["company-id"] ?? payload?.companyId, "companyId");
  const statementType = String(values.type ?? payload?.statementType ?? "").trim();
  if (!SUPPORTED_STATEMENT_TYPES.has(statementType)) fail("STATEMENT_TYPE_INVALID", "type 只能是 balance_sheet 或 income_statement。" );
  const reportMode = parseReportMode(values["report-mode"] ?? payload?.reportMode, 1);
  if (reportMode === "all") fail("REPORT_MODE_INVALID", "prepare 必须明确使用单体 1 或合并 2。" );
  const missingSubjectPolicy = String(values["missing-subject-policy"] ?? payload?.missingSubjectPolicy ?? "preserve_existing");
  if (!["preserve_existing", "set_null"].includes(missingSubjectPolicy)) fail("MISSING_SUBJECT_POLICY_INVALID", "missing-subject-policy 只能是 preserve_existing 或 set_null。" );
  if (values.audit !== undefined && ![1, 2].includes(Number(values.audit))) {
    fail("AUDIT_TYPE_INVALID", "--audit 只能是 1 或 2。" );
  }
  const sheetList = validateSheetList(payload?.sheetList, statementType).map((sheet) => {
    if (statementType === "balance_sheet" && values.audit !== undefined && sheet.auditType === undefined) {
      const auditType = Number(values.audit);
      if (![1, 2].includes(auditType)) fail("AUDIT_TYPE_INVALID", "--audit 只能是 1 或 2。" );
      return { ...sheet, auditType };
    }
    return sheet;
  });
  return {
    projectId,
    companyId,
    sourceFileName: String(values["source-file-name"] || path.basename(filePath)),
    statementType,
    reportMode,
    missingSubjectPolicy,
    includeRequestBody: values["include-request-body"] !== "false",
    sheetList,
  };
}

function normalizeOutput(command, payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return { ok: true, command, ...payload };
  return { ok: true, command, result: payload };
}

async function runCommand(command, values) {
  const credentials = loadCredentials();
  const client = createMcpClient(credentials);
  const { tools } = await client.initialize();
  if (command === "tools") return { ok: true, command, tools };

  if (command === "companies") {
    ensureRemoteTool(tools, "get_project_companies");
    const projectId = positiveInteger(values["project-id"], "projectId");
    return normalizeOutput(command, await client.callTool("get_project_companies", { projectId }));
  }

  if (command === "prepare") {
    ensureRemoteTool(tools, "prepare_financial_statement_report_import");
    const request = buildPrepareRequest(values);
    const result = await client.callTool("prepare_financial_statement_report_import", request);
    return normalizeOutput(command, result);
  }

  if (command === "execute") {
    ensureRemoteTool(tools, "execute_financial_statement_report_import");
    const confirmationToken = requiredValue(values, "token");
    return normalizeOutput(command, await client.callTool("execute_financial_statement_report_import", {
      confirmationToken,
      confirmed: true,
    }));
  }

  if (command === "read") {
    ensureRemoteTool(tools, "get_financial_statement_reports");
    const projectId = positiveInteger(values["project-id"], "projectId");
    const companyId = positiveInteger(values["company-id"], "companyId");
    const statementType = String(values.type || "all").trim();
    if (!SUPPORTED_READ_TYPES.has(statementType)) fail("STATEMENT_TYPE_INVALID", "read 的 type 只能是 all、balance_sheet 或 income_statement。" );
    const reportMode = parseReportMode(values["report-mode"], "all");
    const view = String(values.view || "worksheet").trim();
    if (!["worksheet", "table", "raw", "both", "matrix"].includes(view)) fail("VIEW_INVALID", "view 只能是 worksheet、raw、both、table 或 matrix。" );
    return normalizeOutput(command, await client.callTool("get_financial_statement_reports", {
      projectId,
      companyId,
      statementType,
      reportMode,
      view,
      includeEmptySubjects: values["include-empty-subjects"] !== "false",
    }));
  }

  fail("COMMAND_INVALID", "用法：tools、companies、prepare、execute 或 read。" );
}

function printHelp() {
  process.stdout.write([
    "天源财务报表导入",
    "  tools",
    "  companies --project-id <id>",
    "  prepare --project-id <id> --company-id <id> --file <xlsx> --type balance_sheet|income_statement --json <payload.json> [--audit 1|2]",
    "  execute --token <confirmationToken>",
    "  read --project-id <id> --company-id <id> --type all|balance_sheet|income_statement [--report-mode 1|2|all]",
  ].join("\n") + "\n");
}

const { command, values } = parseArgs(process.argv.slice(2));
if (!command || command === "--help" || command === "-h" || values.help) {
  printHelp();
} else {
  runCommand(command, values)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      const payload = {
        ok: false,
        error: {
          code: error?.code || "FINANCIAL_STATEMENT_IMPORT_FAILED",
          message: error?.message || String(error),
          ...(error?.details ? { details: error.details } : {}),
        },
        security: { credentialsReturned: false },
      };
      process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
      process.exitCode = 1;
    });
}
