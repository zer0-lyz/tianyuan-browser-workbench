#!/usr/bin/env node

const http = require("node:http");
const { execFile } = require("node:child_process");

const DEFAULT_PORT = 8765;
const DEFAULT_MCP_URL = "https://mcp.zhrdc.net/valuation-mcp";
const COMPANY_HIERARCHY_CODE_KEYS = [
  "displayCode",
  "display_code",
  "treeCode",
  "tree_code",
  "hierarchyCode",
  "hierarchy_code",
  "levelCode",
  "level_code",
  "nodeCode",
  "node_code",
  "relationCode",
  "relation_code",
  "sortCode",
  "sort_code",
  "sortNo",
  "sort_no",
  "serialNo",
  "serial_no",
  "serialNumber",
  "serial_number",
  "sequence",
  "seq",
  "seqNo",
  "seq_no",
  "orderNo",
  "order_no",
  "ordinal",
  "index",
  "idx",
  "rowNo",
  "row_no",
  "num",
  "number",
  "codeNo",
  "code_no",
  "编码",
  "公司编号",
  "层级编码",
  "序号",
];

const port = Number(process.env.TIANYUAN_HELPER_PORT || DEFAULT_PORT);
const mcpUrl = process.env.VALUATION_MCP_URL || DEFAULT_MCP_URL;
const token = process.env.VALUATION_MCP_TOKEN || "";

let nextId = 1;
let sessionId = null;
let initialized = false;

function withTimeout(promise, ms, timeoutReason) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutReason)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function checkCli() {
  return new Promise((resolve) => {
    execFile("/usr/local/bin/tycpv", ["--version"], { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          reason: error.code === "ENOENT" ? "TYCPV_NOT_FOUND" : "TYCPV_VERSION_FAILED",
        });
        return;
      }
      resolve({
        ok: true,
        version: String(stdout || stderr || "").trim().split(/\r?\n/)[0] || "可用",
      });
    });
  });
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  res.end(body);
}

function errorResponse(res, statusCode, reason, extra = {}) {
  jsonResponse(res, statusCode, {
    ok: false,
    reason,
    ...extra,
    security: {
      credentialsReturned: false,
    },
  });
}

function parseSseOrJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (!dataLines.length) {
    throw new Error("MCP_EMPTY_OR_UNSUPPORTED_RESPONSE");
  }

  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function rpc(method, params, { notification = false } = {}) {
  if (!token) {
    throw new Error("VALUATION_MCP_TOKEN_NOT_SET");
  }

  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const payload = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: nextId++, method, params };

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const responseSession = response.headers.get("mcp-session-id");
  if (responseSession) sessionId = responseSession;

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP_HTTP_${response.status}`);
  }
  if (notification) return null;

  const parsed = parseSseOrJson(text);
  if (parsed?.error) {
    throw new Error(parsed.error.message || parsed.error.code || "MCP_RPC_ERROR");
  }
  return parsed?.result ?? parsed;
}

async function ensureInitialized() {
  if (initialized && sessionId) return;

  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "tianyuan-browser-workbench-helper",
      version: "0.1.0",
    },
  });
  await rpc("notifications/initialized", {}, { notification: true });
  initialized = true;
}

function parseToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const textItem = content.find((item) => item.type === "text" && item.text);
  if (!textItem) return result;

  const raw = String(textItem.text).trim();
  if (!raw) return result;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function callTool(name, args) {
  await ensureInitialized();
  const result = await rpc("tools/call", {
    name,
    arguments: args || {},
  });
  return parseToolResult(result);
}

function parseNumericId(value, fieldName) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${fieldName}_INVALID`);
  return Number(text);
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const preferredKeys = [
    "data",
    "list",
    "records",
    "rows",
    "companies",
    "subjects",
    "items",
    "result",
  ];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) return item;
  }
  return [];
}

function flattenItems(value, depth = 0) {
  if (depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenItems(item, depth + 1));
  if (!value || typeof value !== "object") return [value];

  const nested = [];
  for (const key of ["data", "list", "records", "rows", "companies", "subjects", "items", "result", "children", "tree"]) {
    if (Array.isArray(value[key])) nested.push(...flattenItems(value[key], depth + 1));
  }
  const hasOwnLabel = ["id", "companyId", "companyName", "name", "label", "subjectCode", "subjectName", "code", "text", "title"]
    .some((key) => value[key] !== null && value[key] !== undefined);
  return hasOwnLabel ? [value, ...nested] : nested;
}

function pickString(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function pickSubjectName(object, code) {
  const direct = pickString(object, ["subjectName", "subject_name", "name", "label", "title", "text", "sheetName", "sheet_name", "accountName", "account_name", "assetSubjectName", "asset_subject_name"]);
  if (direct && direct !== code) return direct;
  for (const [key, value] of Object.entries(object || {})) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text || text === code || text.length > 60) continue;
    if (/(Name|name|名称|科目|account|subject)/.test(key) && /[\u4e00-\u9fa5]/.test(text)) return text;
  }
  return direct || "";
}

function isSubjectCode(value) {
  return /^C\d+(?:-\d+)*$/.test(String(value || "").trim());
}

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null);
}

function isDisplayedSubject(object) {
  const hiddenValue = firstDefined([
    object.hidden,
    object.isHidden,
    object.is_hidden,
    object.hide,
    object.isHide,
    object.is_hide,
    object.hiddenFlag,
    object.hidden_flag,
  ]);
  if (hiddenValue === true || hiddenValue === 1 || hiddenValue === "1" || String(hiddenValue).toLowerCase() === "true") {
    return false;
  }

  const displayValue = firstDefined([
    object.visible ??
    object.isShow ??
    object.is_show ??
    object.show ??
    object.isDisplay ??
    object.is_display ??
    object.display ??
    object.displayed ??
    object.displayFlag ??
    object.display_flag ??
    object.displayStatus ??
    object.display_status ??
    object.showFlag ??
    object.show_flag ??
    object.visibleFlag ??
    object.visible_flag ??
    object.checked ??
    object.isChecked ??
    object.is_checked ??
    object.selected ??
    object.isSelected ??
    object.is_selected,
  ]);

  if (displayValue === undefined || displayValue === null || displayValue === "") return true;
  if (displayValue === false || displayValue === 0 || displayValue === "0") return false;
  const text = String(displayValue).trim().toLowerCase();
  return !["false", "hidden", "hide", "隐藏", "不显示", "未显示", "否", "no", "n", "disabled"].includes(text);
}

function normalizeCompanies(raw) {
  const seen = new Set();
  return flattenItems(raw).map((item, index) => {
    const object = item && typeof item === "object" ? item : { name: item };
    const id = pickString(object, ["companyId", "company_id", "id", "value", "enterpriseId", "enterprise_id", "company_id_str", "subjectId"]);
    const name = pickString(object, ["companyName", "company_name", "name", "label", "title", "text", "enterpriseName", "enterprise_name", "subjectName"]);
    const code = pickString(object, [
      ...COMPANY_HIERARCHY_CODE_KEYS,
      "companyCode",
      "company_code",
      "code",
      "enterpriseCode",
      "enterprise_code",
      "companyNo",
      "company_no",
      "no",
    ]);
    const shortName = pickString(object, ["shortName", "short_name", "companyShortName", "company_short_name", "abbrName", "abbr_name", "abbreviation", "companyAbbr", "company_abbr"]);
    return {
      id: id || name || String(index + 1),
      name: name || id || String(index + 1),
      code,
      shortName,
      raw: object,
    };
  }).filter((item) => {
    const key = `${item.id}|${item.name}`;
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSubjects(raw) {
  const seen = new Set();
  return flattenItems(raw).map((item, index) => {
    const object = item && typeof item === "object" ? item : { name: item };
    const code = pickString(object, ["subjectCode", "subject_code", "code", "accountCode", "account_code", "assetSubjectCode", "asset_subject_code", "value"]);
    if (!isSubjectCode(code)) return null;
    const name = pickSubjectName(object, code);
    const parentCode = pickString(object, ["parentSubjectCode", "parent_subject_code", "parentCode", "parent_code", "pSubjectCode", "pidCode"]);
    const parentName = pickString(object, ["parentSubjectName", "parent_subject_name", "parentName", "parent_name", "pSubjectName"]);
    const path = pickString(object, ["fullPath", "full_path", "path", "subjectPath", "subject_path", "namePath", "name_path"]);
    const visible = isDisplayedSubject(object);
    return {
      code,
      name: name || code || String(index + 1),
      parentCode: isSubjectCode(parentCode) ? parentCode : "",
      parentName,
      path,
      visible,
      raw: object,
    };
  }).filter((item) => {
    if (!item) return false;
    const key = `${item.code}|${item.name}`;
    if ((!item.code && !item.name) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    jsonResponse(res, 204, {});
    return;
  }
  if (req.method !== "GET") {
    errorResponse(res, 405, "METHOD_NOT_ALLOWED");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  try {
    if (url.pathname === "/health") {
      const probe = url.searchParams.get("probe") === "1";
      let mcp = {
        ok: Boolean(token),
        configured: Boolean(token),
        connected: Boolean(sessionId && initialized),
        reason: token ? (sessionId && initialized ? null : "MCP_NOT_PROBED") : "VALUATION_MCP_TOKEN_NOT_SET",
      };
      if (probe && token) {
        try {
          await withTimeout(ensureInitialized(), 8000, "MCP_PROBE_TIMEOUT");
          mcp = {
            ok: true,
            configured: true,
            connected: true,
            reason: null,
          };
        } catch (error) {
          mcp = {
            ok: false,
            configured: true,
            connected: false,
            reason: error?.message || String(error),
          };
        }
      }

      jsonResponse(res, 200, {
        ok: true,
        service: "tianyuan-native-helper",
        mcpConfigured: Boolean(token),
        mcpUrl,
        sessionReady: Boolean(sessionId && initialized),
        mcp,
        cli: await checkCli(),
        security: {
          credentialsReturned: false,
        },
      });
      return;
    }

    if (parts.length === 3 && parts[0] === "projects" && parts[2] === "companies") {
      const projectId = parseNumericId(parts[1], "projectId");
      const raw = await callTool("get_project_companies", { projectId });
      jsonResponse(res, 200, {
        ok: true,
        projectId,
        companies: normalizeCompanies(raw),
        rawShape: Array.isArray(raw) ? "array" : typeof raw,
        security: {
          credentialsReturned: false,
        },
      });
      return;
    }

    if (
      parts.length === 5 &&
      parts[0] === "projects" &&
      parts[2] === "companies" &&
      parts[4] === "asset-subjects"
    ) {
      const projectId = parseNumericId(parts[1], "projectId");
      const companyId = parseNumericId(parts[3], "companyId");
      const raw = await callTool("get_company_asset_based_approach_subjects", { projectId, companyId });
      jsonResponse(res, 200, {
        ok: true,
        projectId,
        companyId,
        subjects: normalizeSubjects(raw),
        rawShape: Array.isArray(raw) ? "array" : typeof raw,
        security: {
          credentialsReturned: false,
        },
      });
      return;
    }

    errorResponse(res, 404, "NOT_FOUND");
  } catch (error) {
    errorResponse(res, 500, error?.message || String(error));
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    errorResponse(res, 500, error?.message || String(error));
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Tianyuan native helper listening on http://127.0.0.1:${port}\n`);
});
