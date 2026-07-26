#!/usr/bin/env node

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const readline = require("node:readline");
const { randomUUID } = require("node:crypto");
const connectorBridge = (() => {
  try {
    return require("./connector_bridge.js");
  } catch (cause) {
    try {
      return createRequire(path.join(path.dirname(process.execPath), "native_host.js"))("./connector_bridge.js");
    } catch {
      throw cause;
    }
  }
})();
const updateChecker = (() => {
  try {
    return require("./update_checker.js");
  } catch (cause) {
    try {
      return createRequire(path.join(path.dirname(process.execPath), "native_host.js"))("./update_checker.js");
    } catch {
      throw cause;
    }
  }
})();
const platformAdapter = (() => {
  try {
    return require("./platform/index.js");
  } catch (cause) {
    try {
      return createRequire(path.join(path.dirname(process.execPath), "native_host.js"))("./platform/index.js");
    } catch {
      throw cause;
    }
  }
})().createPlatformAdapter();

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") {
    process.exit(0);
  }
});

const DEFAULT_MCP_URL = "https://mcp.zhrdc.net/valuation-mcp";
const DEFAULT_CONNECTOR_PORT = 40415;
const CONNECTOR_PROTOCOL_VERSION = "connector-agent-binding-v3";
const CONNECTOR_PLATFORM_URL = process.env.TIANYUAN_CONNECTOR_PLATFORM_URL || "http://127.0.0.1:40315";
const CODEX_GLOBAL_STATE_PATH = process.env.TIANYUAN_CODEX_GLOBAL_STATE_PATH
  || path.join(os.homedir(), ".codex", ".codex-global-state.json");
const CONNECTOR_BINDINGS_PATH = process.env.TIANYUAN_CONNECTOR_BINDINGS_PATH
  || path.join(os.homedir(), ".tianyuan-workbench", "native-helper", "connector-bindings.json");
const CONNECTOR_ACTION_TTL_MS = 5 * 60 * 1000;
const CONNECTOR_ACTION_RESULT_TTL_MS = 15 * 60 * 1000;
const CONNECTOR_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const CONNECTOR_ATTACHMENT_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm",
  ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".zip", ".rar",
]);
const CONNECTOR_ALLOWED_EXTENSION_ORIGINS = new Set([
  "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
  "chrome-extension://fdbllnmaaklkcmoacoapbibiggnndkfpa",
]);
const IS_WINDOWS = platformAdapter.isWindows;
const RUNTIME_CONFIG_PATH = process.env.TIANYUAN_RUNTIME_CONFIG_PATH
  || path.join(path.dirname(process.execPath), "runtime-config.json");

function loadRuntimeConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const runtimeConfig = loadRuntimeConfig();

function firstExistingPath(values, fallback) {
  for (const value of values) {
    if (value && fs.existsSync(value)) return value;
  }
  return fallback;
}

const CLI_BIN = process.env.TYCPV_BIN
  || runtimeConfig.tycpvBin
  || firstExistingPath(platformAdapter.cliCandidates, platformAdapter.cliFallback);
const PYTHON_BIN = process.env.TIANYUAN_PYTHON_BIN
  || runtimeConfig.pythonBin
  || platformAdapter.defaultPythonBin;
const PRINT_SKILLS_DIR = process.env.TIANYUAN_PRINT_SKILLS_DIR || runtimeConfig.printSkillsDir
  || platformAdapter.defaultPrintSkillsDir;
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
const mcpUrl = process.env.VALUATION_MCP_URL || DEFAULT_MCP_URL;
const envToken = process.env.VALUATION_MCP_TOKEN || "";

let nextId = 1;
let sessionId = null;
let initialized = false;
let runtimeToken = "";
const connectorSessions = new Map();
const connectorBindings = new Map();
const connectorActions = new Map();
let connectorBindingsLoaded = false;

const CLI_EXPORT_COMMANDS = Object.freeze({
  asset_detail_table: {
    command: "export-asset-detail-table",
    label: "资产基础法明细表",
  },
  asset_declare_table: {
    command: "export-asset-declare-table",
    label: "资产基础法申报表",
  },
});
const PRINT_FORMAT_SCRIPTS = Object.freeze({
  detail: path.join(
    PRINT_SKILLS_DIR,
    "appraisal-detail-print-format",
    "scripts",
    "adjust_appraisal_detail_print.py",
  ),
  declaration: path.join(
    PRINT_SKILLS_DIR,
    "appraisal-declaration-print-format",
    "scripts",
    "adjust_appraisal_declaration_print.py",
  ),
});
const PRINT_OUTPUT_MODES = new Set(["overwrite", "copy_in_source", "new_directory"]);

function getToken() {
  return runtimeToken || envToken;
}

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function connectorJson(res, statusCode, payload, origin = "*") {
  const body = JSON.stringify(payload);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  res.writeHead(statusCode, headers);
  res.end(body);
}

function connectorError(res, statusCode, reason, extra = {}, origin = "*") {
  connectorJson(res, statusCode, {
    ok: false,
    reason,
    ...extra,
    security: { credentialsReturned: false },
  }, origin);
}

function connectorOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return "";
  if (CONNECTOR_ALLOWED_EXTENSION_ORIGINS.has(origin)) return origin;
  if (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:")) return origin;
  return null;
}

function connectorRequestBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("CONNECTOR_REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("CONNECTOR_INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function connectorId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function connectorSessionId(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return connectorId("tianyuan");
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(candidate)) throw new Error("CONNECTOR_SESSION_ID_INVALID");
  return candidate;
}

function connectorSafeBinding(value) {
  const binding = value && typeof value === "object" ? value : {};
  return {
    projectId: String(binding.projectId || "").slice(0, 80),
    projectName: String(binding.projectName || "").slice(0, 160),
    companyId: String(binding.companyId || "").slice(0, 80),
    subjectCode: String(binding.subjectCode || "").slice(0, 120),
    subjectPath: String(binding.subjectPath || "").slice(0, 500),
    pageType: String(binding.pageType || "").slice(0, 120),
    url: String(binding.url || "").slice(0, 1000),
    tabId: Number.isInteger(binding.tabId) ? binding.tabId : null,
    operationScope: String(binding.operationScope || "context-read").slice(0, 120),
  };
}

function connectorPageKey(binding = {}) {
  const projectId = String(binding.projectId || "").trim();
  const companyId = String(binding.companyId || "").trim();
  const pageType = String(binding.pageType || "").trim();
  const url = String(binding.url || "").trim();
  return [projectId, companyId, pageType, projectId || companyId || pageType ? "" : url].join("|");
}

function connectorSafeCodexBinding(value, previous = null) {
  const binding = value && typeof value === "object" ? value : {};
  const now = new Date().toISOString();
  const threadId = String(binding.threadId ?? previous?.threadId ?? "").trim().slice(0, 200);
  const projectId = String(binding.projectId ?? previous?.projectId ?? "").trim().slice(0, 200);
  const scope = binding.scope === "project" ? "project" : "thread";
  if (scope === "thread" && !threadId) throw new Error("CONNECTOR_THREAD_BINDING_REQUIRED");
  if (!projectId && !threadId) throw new Error("CONNECTOR_PROJECT_OR_THREAD_REQUIRED");
  return {
    bindingId: String(binding.bindingId || previous?.bindingId || randomUUID()).slice(0, 200),
    projectId,
    projectName: String(binding.projectName ?? previous?.projectName ?? "").trim().slice(0, 200),
    projectPath: String(binding.projectPath ?? previous?.projectPath ?? "").trim().slice(0, 1000),
    threadId,
    threadTitle: String(binding.threadTitle ?? previous?.threadTitle ?? "").trim().slice(0, 300),
    scope,
    pageKey: String(binding.pageKey || previous?.pageKey || "").slice(0, 1200),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

async function connectorLoadBindings() {
  if (connectorBindingsLoaded) return;
  connectorBindingsLoaded = true;
  try {
    const raw = await fs.promises.readFile(CONNECTOR_BINDINGS_PATH, "utf8");
    const payload = JSON.parse(raw);
    for (const item of Array.isArray(payload?.bindings) ? payload.bindings : []) {
      if (item?.bindingId) connectorBindings.set(String(item.bindingId), item);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") process.stderr.write(`Connector binding load failed: ${error?.message || error}\n`);
  }
}

async function connectorSaveBindings() {
  await fs.promises.mkdir(path.dirname(CONNECTOR_BINDINGS_PATH), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    bindings: [...connectorBindings.values()],
  };
  const temporaryPath = `${CONNECTOR_BINDINGS_PATH}.tmp`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.promises.rename(temporaryPath, CONNECTOR_BINDINGS_PATH);
}

function connectorFindPersistedBinding(pageBinding) {
  const pageKey = connectorPageKey(pageBinding);
  return [...connectorBindings.values()]
    .filter((item) => item.pageKey === pageKey)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function connectorPublicCodexBinding(binding) {
  if (!binding) return null;
  return {
    bindingId: binding.bindingId,
    projectId: binding.projectId || "",
    projectName: binding.projectName || "",
    projectPath: binding.projectPath || "",
    threadId: binding.threadId || "",
    threadTitle: binding.threadTitle || "",
    scope: binding.scope || "thread",
    createdAt: binding.createdAt || null,
    updatedAt: binding.updatedAt || null,
  };
}

async function connectorFetchCodexCatalog() {
  try {
    const response = await fetch(`${CONNECTOR_PLATFORM_URL}/api/catalog`);
    if (!response.ok) throw new Error(`CODEX_CATALOG_HTTP_${response.status}`);
    const payload = await response.json();
    if (!payload?.ok) throw new Error(payload?.reason || "CODEX_CATALOG_UNAVAILABLE");
    return {
      projects: Array.isArray(payload.projects) ? payload.projects : [],
      threads: Array.isArray(payload.threads) ? payload.threads : [],
      updatedAt: payload.updatedAt || null,
      source: "connector-platform",
    };
  } catch {
    return connectorReadLocalCodexCatalog();
  }
}

function connectorReadLocalCodexCatalog() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(CODEX_GLOBAL_STATE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`CODEX_LOCAL_CATALOG_UNAVAILABLE: ${error?.message || error}`);
  }

  const projectsById = new Map();
  const addProject = (input = {}) => {
    const projectId = String(input.projectId || input.id || "").trim();
    if (!projectId) return;
    const projectPath = String(
      input.projectPath || input.path || input.cwd || input.rootPaths?.[0] || "",
    ).trim().replace(/[\\/]+$/, "");
    const projectName = String(input.projectName || input.name || "").trim()
      || path.basename(projectPath)
      || projectId;
    const previous = projectsById.get(projectId);
    projectsById.set(projectId, {
      projectId,
      projectName,
      projectPath,
      path: projectPath,
      updatedAt: Number(input.updatedAt || previous?.updatedAt || 0) || null,
    });
  };

  for (const project of Object.values(state["local-projects"] || {})) addProject(project);

  const assignments = state["thread-project-assignments"] || {};
  for (const assignment of Object.values(assignments)) addProject({
    projectId: assignment?.projectId,
    projectPath: assignment?.cwd || assignment?.path,
    projectName: assignment?.projectName,
  });

  const threads = Object.entries(assignments)
    .map(([threadId, assignment]) => {
      const projectId = String(assignment?.projectId || "").trim();
      if (!threadId || !projectId) return null;
      const project = projectsById.get(projectId);
      const projectPath = String(
        assignment?.cwd || assignment?.path || project?.projectPath || "",
      ).trim().replace(/[\\/]+$/, "");
      return {
        threadId,
        title: String(assignment?.title || assignment?.threadTitle || "").trim()
          || `Codex 对话 ${threadId.slice(0, 8)}`,
        projectId,
        projectName: project?.projectName || path.basename(projectPath) || projectId,
        projectPath,
        cwd: projectPath,
        recencyAt: project?.updatedAt || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.recencyAt || 0) - Number(a.recencyAt || 0));

  return {
    projects: [...projectsById.values()]
      .sort((a, b) => String(a.projectName).localeCompare(String(b.projectName), "zh-CN")),
    threads,
    updatedAt: new Date().toISOString(),
    source: "local-codex-state",
  };
}

function connectorApplyCodexBinding(session, binding) {
  session.codexBinding = binding ? { ...binding } : null;
  return session.codexBinding;
}

function connectorSafeClient(value) {
  const client = value && typeof value === "object" ? value : {};
  return {
    name: String(client.name || "tianyuan-browser-workbench").slice(0, 120),
    version: String(client.version || "").slice(0, 80),
    extensionId: String(client.extensionId || "").slice(0, 120),
  };
}

function connectorPrune() {
  const now = Date.now();
  for (const [id, session] of connectorSessions) {
    if (now - Date.parse(session.lastSeenAt) > 120000) connectorSessions.delete(id);
  }
  for (const [id, action] of connectorActions) {
    const reference = Date.parse(action.completedAt || action.createdAt);
    const ttl = action.completedAt ? CONNECTOR_ACTION_RESULT_TTL_MS : CONNECTOR_ACTION_TTL_MS;
    if (!Number.isFinite(reference) || now - reference > ttl) connectorActions.delete(id);
  }
}

function connectorCapabilities() {
  return {
    codexProjectBinding: { supported: true, level: "routing", label: "绑定 Codex 项目" },
    codexThreadBinding: { supported: true, level: "routing", label: "绑定 Codex 对话" },
    contextRead: { supported: true, level: "read", label: "读取当前页面上下文" },
    projectBinding: { supported: true, level: "read", label: "绑定项目与标签页" },
    companyList: { supported: true, level: "read", label: "读取公司清单" },
    subjectList: { supported: true, level: "read", label: "读取科目清单" },
    subjectTreeMirror: { supported: true, level: "read", label: "镜像页面显示科目树" },
    previewBatchSave: { supported: true, level: "preview", label: "批量保存预演" },
    previewExitEdit: { supported: true, level: "preview", label: "批量退出编辑预演" },
    executeBatchSave: { supported: true, level: "confirm", label: "确认后批量保存" },
    executeExitEdit: { supported: true, level: "confirm", label: "确认后批量退出编辑" },
    previewAuditAttachmentUpload: { supported: true, level: "preview", label: "评估核实附件上传预演" },
    executeAuditAttachmentUpload: { supported: true, level: "confirm", label: "确认后上传评估核实附件并保存" },
    batchAuditAttachmentUpload: { supported: true, level: "confirm", label: "确认后批量上传评估核实附件并保存" },
    inspectAuditCheckRow: { supported: true, level: "read", label: "读取查证核对情况" },
    executeAuditCheckResult: { supported: true, level: "confirm", label: "确认后填写查证核对情况并保存" },
    scanAuditIndexCheckRows: { supported: true, level: "read", label: "批量扫描查证资料索引核查状态" },
    batchAuditCheckResult: { supported: true, level: "confirm", label: "确认后批量填写查证核对情况并保存" },
    cliExport: { supported: true, level: "local", label: "CLI 表格导出" },
    printFormat: { supported: true, level: "local", label: "本地打印格式处理" },
    genericBrowserAutomation: { supported: false, level: "unsupported", label: "任意浏览器自动操作" },
    arbitraryJavaScript: { supported: false, level: "unsupported", label: "任意 JavaScript 执行" },
    agentChat: { supported: false, level: "deferred", label: "浏览器内 Agent 对话" },
  };
}

function connectorRequireActionSession(sessionId, input = {}) {
  const session = connectorSessions.get(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (!session.codexBinding) throw new Error("SESSION_NOT_BOUND");
  if (String(input.bindingId || "") !== session.codexBinding.bindingId) throw new Error("BINDING_MISMATCH");
  if (input.projectId && String(input.projectId) !== session.codexBinding.projectId) {
    throw new Error("PROJECT_BINDING_MISMATCH");
  }
  if (session.codexBinding.scope === "thread") {
    if (!input.threadId || String(input.threadId) !== session.codexBinding.threadId) {
      throw new Error("THREAD_BINDING_MISMATCH");
    }
  } else if (input.threadId && session.codexBinding.threadId && String(input.threadId) !== session.codexBinding.threadId) {
    throw new Error("THREAD_BINDING_MISMATCH");
  }
  if (session.status !== "online") throw new Error("SESSION_NOT_ONLINE");
  if (!session.binding?.projectId || !session.binding?.companyId || session.binding?.pageType !== "asset-draft") {
    throw new Error("ASSET_DRAFT_SESSION_REQUIRED");
  }
  return session;
}

function connectorSafeActionResult(value) {
  const text = JSON.stringify(value && typeof value === "object" ? value : {});
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024) throw new Error("ACTION_RESULT_TOO_LARGE");
  return JSON.parse(text);
}

function connectorPublicAction(action) {
  if (!action) return null;
  return {
    actionId: action.actionId,
    sessionId: action.sessionId,
    bindingId: action.bindingId,
    type: action.type,
    status: action.status,
    target: action.target,
    file: action.file ? {
      name: action.file.name,
      size: action.file.size,
      type: action.file.type,
    } : null,
    createdAt: action.createdAt,
    claimedAt: action.claimedAt || null,
    completedAt: action.completedAt || null,
    result: action.result || null,
  };
}

function connectorAttachmentMime(extension) {
  return {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
  }[extension] || "application/octet-stream";
}

async function connectorBuildAttachmentFile(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  if (!path.isAbsolute(String(filePath || ""))) throw new Error("ATTACHMENT_PATH_MUST_BE_ABSOLUTE");
  const stats = await fs.promises.stat(resolved);
  if (!stats.isFile()) throw new Error("ATTACHMENT_NOT_A_FILE");
  if (stats.size <= 0) throw new Error("ATTACHMENT_FILE_EMPTY");
  if (stats.size > CONNECTOR_MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_FILE_TOO_LARGE");
  const extension = path.extname(resolved).toLowerCase();
  if (!CONNECTOR_ATTACHMENT_EXTENSIONS.has(extension)) throw new Error("ATTACHMENT_FILE_TYPE_NOT_ALLOWED");
  return {
    path: resolved,
    name: path.basename(resolved),
    size: stats.size,
    type: connectorAttachmentMime(extension),
  };
}

async function connectorCreateAction(sessionId, input) {
  const session = connectorRequireActionSession(sessionId, input);
  const type = String(input.action || "");
  if (![
    "preview_audit_attachment_upload",
    "upload_audit_attachment",
    "batch_upload_audit_attachments",
    "inspect_audit_check_row",
    "set_audit_check_result",
    "scan_audit_index_check_rows",
    "batch_set_audit_check_results",
    "clear_audit_test_rows",
  ].includes(type)) {
    throw new Error("ACTION_NOT_ALLOWED");
  }
  const rowNumber = Number(input.rowNumber);
  const isBatchAction = ["batch_upload_audit_attachments", "scan_audit_index_check_rows", "batch_set_audit_check_results", "clear_audit_test_rows"].includes(type);
  if (!isBatchAction && (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000)) throw new Error("ROW_NUMBER_INVALID");
  const fieldTitle = String(input.fieldTitle || "查证资料索引").trim();
  const expectedFieldTitle = ["inspect_audit_check_row", "set_audit_check_result", "batch_set_audit_check_results"].includes(type)
    ? "查证核对情况"
    : "查证资料索引";
  if (fieldTitle !== expectedFieldTitle) throw new Error("FIELD_TITLE_NOT_ALLOWED");
  const requestedSubjectCode = String(input.subjectCode || session.binding.subjectCode || "").trim();
  const subjectCode = requestedSubjectCode === "current" ? "" : requestedSubjectCode;
  if (subjectCode && !/^C\d+(?:-\d+)*$/.test(subjectCode)) throw new Error("SUBJECT_CODE_INVALID");
  const moduleIndex = Number.isInteger(input.moduleIndex) ? input.moduleIndex : Number(input.moduleIndex || 0);
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex > 20) throw new Error("MODULE_INDEX_INVALID");
  const moduleName = String(input.moduleName || "").trim().slice(0, 80);
  const procedureText = String(input.procedureText || "").trim().slice(0, 80);
  let file = null;
  if (type === "upload_audit_attachment" || type === "batch_upload_audit_attachments") {
    if (input.confirmText !== (type === "batch_upload_audit_attachments" ? "确认批量上传并保存" : "确认上传并保存")) {
      throw new Error(type === "batch_upload_audit_attachments" ? "BATCH_UPLOAD_CONFIRM_TEXT_REQUIRED" : "UPLOAD_CONFIRM_TEXT_REQUIRED");
    }
    file = await connectorBuildAttachmentFile(input.filePath);
  }
  if (type === "batch_upload_audit_attachments") {
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers : [];
    if (!rowNumbers.length) throw new Error("BATCH_UPLOAD_ROWS_REQUIRED");
    if (rowNumbers.length > 50) throw new Error("ROW_NUMBERS_TOO_MANY");
    for (const row of rowNumbers) {
      const n = Number(row);
      if (!Number.isInteger(n) || n < 2 || n > 100000) throw new Error("ROW_NUMBER_INVALID");
    }
  }
  const resultText = String(input.resultText || "").trim().slice(0, 80);
  if (type === "set_audit_check_result") {
    if (input.confirmText !== "确认填写核对情况并保存") throw new Error("AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    if (!resultText) throw new Error("AUDIT_CHECK_RESULT_INVALID");
  }
  if (type === "batch_set_audit_check_results") {
    if (input.confirmText !== "确认批量填写核对情况并保存") throw new Error("BATCH_AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    if (!resultText) throw new Error("AUDIT_CHECK_RESULT_INVALID");
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers : [];
    if (rowNumbers.length > 1000) throw new Error("ROW_NUMBERS_TOO_MANY");
    for (const row of rowNumbers) {
      const n = Number(row);
      if (!Number.isInteger(n) || n < 2 || n > 100000) throw new Error("ROW_NUMBER_INVALID");
    }
  }
  if (type === "clear_audit_test_rows") {
    if (input.confirmText !== "确认清理测试数据并保存") throw new Error("CLEAR_TEST_DATA_CONFIRM_TEXT_REQUIRED");
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers : [];
    if (!rowNumbers.length || rowNumbers.length > 100) throw new Error("CLEAR_TEST_ROWS_INVALID");
    for (const row of rowNumbers) {
      const n = Number(row);
      if (!Number.isInteger(n) || n < 2 || n > 100000) throw new Error("ROW_NUMBER_INVALID");
    }
  }
  const maxRows = Math.max(2, Math.min(Number(input.maxRows || 500), 5000));
  const actionId = connectorId("action");
  const now = new Date().toISOString();
  const action = {
    actionId,
    sessionId,
    bindingId: session.codexBinding.bindingId,
    type,
    status: "queued",
    target: {
      projectId: session.binding.projectId,
      companyId: session.binding.companyId,
      subjectCode,
      rowNumber: isBatchAction ? 0 : rowNumber,
      fieldTitle,
      moduleName,
      moduleIndex,
      resultText,
      procedureText,
      rowNumbers: Array.isArray(input.rowNumbers) ? input.rowNumbers.map((row) => Number(row)).filter(Number.isInteger) : [],
      expectedIndexValues: Array.isArray(input.expectedIndexValues) ? input.expectedIndexValues.map((value) => String(value || "").slice(0, 120)) : [],
      maxRows,
    },
    file,
    confirmText: type === "upload_audit_attachment" || type === "batch_upload_audit_attachments"
      ? (type === "batch_upload_audit_attachments" ? "确认批量上传并保存" : "确认上传并保存")
      : (type === "set_audit_check_result"
        ? "确认填写核对情况并保存"
        : (type === "batch_set_audit_check_results"
          ? "确认批量填写核对情况并保存"
          : (type === "clear_audit_test_rows" ? "确认清理测试数据并保存" : ""))),
    createdAt: now,
  };
  connectorActions.set(actionId, action);
  return action;
}

function connectorSafeContext(value) {
  const context = value && typeof value === "object" ? value : {};
  const route = context.route && typeof context.route === "object" ? context.route : {};
  const spread = context.spread && typeof context.spread === "object" ? context.spread : {};
  const page = context.page && typeof context.page === "object" ? context.page : {};
  return {
    route: {
      isTianyuanRoute: Boolean(route.isTianyuanRoute),
      isAssetDraftRoute: Boolean(route.isAssetDraftRoute),
      isEquityListRoute: Boolean(route.isEquityListRoute),
      projectId: String(route.projectId || "").slice(0, 80),
      companyId: String(route.companyId || "").slice(0, 80),
      subjectCode: String(route.subjectCode || "").slice(0, 120),
    },
    spread: {
      found: Boolean(spread.found),
      sheetName: String(spread.sheetName || "").slice(0, 160),
      activeRow: Number.isInteger(spread.activeRow) ? spread.activeRow : null,
      activeColumn: Number.isInteger(spread.activeColumn) ? spread.activeColumn : null,
    },
    gates: {
      loginLikely: Boolean(page.loginLikely),
      saveVisible: Boolean(page.saveButton?.visible),
      saveDisabled: Boolean(page.saveButton?.disabled),
      hasLockText: Boolean(String(page.lockText || "").trim()),
      hasPermissionText: Boolean(String(page.permissionText || "").trim()),
    },
  };
}

async function connectorHandle(req, res) {
  const requestOrigin = String(req.headers.origin || "");
  const origin = connectorOrigin(req);
  if (requestOrigin && !origin) {
    connectorError(res, 403, "CONNECTOR_ORIGIN_FORBIDDEN", {}, "");
    return;
  }
  if (req.method === "OPTIONS") {
    connectorJson(res, 204, {}, origin);
    return;
  }
  connectorPrune();
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      connectorJson(res, 200, {
        ok: true,
        service: "tianyuan-connector-bridge",
        protocolVersion: CONNECTOR_PROTOCOL_VERSION,
        adapter: "tianyuan-browser",
        mode: "local",
        sessionCount: connectorSessions.size,
        bindingCount: connectorBindings.size,
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/protocol") {
      connectorJson(res, 200, {
        ok: true,
        protocolVersion: CONNECTOR_PROTOCOL_VERSION,
        adapter: "tianyuan-browser",
        capabilities: connectorCapabilities(),
        safety: {
          genericBrowserAutomation: false,
          arbitraryJavaScript: false,
          editLockRequired: true,
          explicitConfirmationRequired: true,
          bindingIdRequiredForCodexRouting: true,
          defaultBindingScope: "thread",
          credentialsStored: false,
        },
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      connectorJson(res, 200, {
        ok: true,
        sessions: [...connectorSessions.values()],
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/catalog") {
      const catalog = await connectorFetchCodexCatalog();
      connectorJson(res, 200, {
        ok: true,
        ...catalog,
        source: catalog.source || "connector-platform",
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/project-bindings") {
      await connectorLoadBindings();
      connectorJson(res, 200, {
        ok: true,
        bindings: [...connectorBindings.values()].map(connectorPublicCodexBinding),
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sessions/register") {
      const input = await connectorRequestBody(req);
      const sessionId = connectorSessionId(input.sessionId);
      const now = new Date().toISOString();
      const pageBinding = connectorSafeBinding(input.binding);
      await connectorLoadBindings();
      const persistedBinding = connectorFindPersistedBinding(pageBinding);
      const session = {
        sessionId,
        status: "online",
        registeredAt: connectorSessions.get(sessionId)?.registeredAt || now,
        lastSeenAt: now,
        binding: pageBinding,
        codexBinding: connectorPublicCodexBinding(persistedBinding),
        client: connectorSafeClient(input.client),
        context: connectorSafeContext(input.context),
        capabilities: connectorCapabilities(),
      };
      connectorSessions.set(sessionId, session);
      connectorJson(res, 200, { ok: true, session, security: { credentialsReturned: false } }, origin);
      return;
    }
    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "heartbeat"
    ) {
      const input = await connectorRequestBody(req);
      const session = connectorSessions.get(parts[2]);
      if (!session) {
        connectorError(res, 404, "SESSION_NOT_FOUND", {}, origin);
        return;
      }
      session.lastSeenAt = new Date().toISOString();
      if (input.binding) session.binding = connectorSafeBinding(input.binding);
      if (input.context) session.context = connectorSafeContext(input.context);
      connectorJson(res, 200, { ok: true, session, security: { credentialsReturned: false } }, origin);
      return;
    }
    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "binding"
    ) {
      const session = connectorSessions.get(parts[2]);
      if (!session) {
        connectorError(res, 404, "SESSION_NOT_FOUND", {}, origin);
        return;
      }
      await connectorLoadBindings();
      const input = await connectorRequestBody(req);
      const previous = session.codexBinding
        ? connectorBindings.get(session.codexBinding.bindingId) || session.codexBinding
        : connectorFindPersistedBinding(session.binding);
      const next = connectorSafeCodexBinding({
        ...input,
        pageKey: connectorPageKey(session.binding),
      }, previous);
      connectorBindings.set(next.bindingId, next);
      connectorApplyCodexBinding(session, next);
      await connectorSaveBindings();
      connectorJson(res, 200, {
        ok: true,
        session,
        binding: connectorPublicCodexBinding(next),
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "binding" &&
      parts[4] === "current-thread"
    ) {
      const session = connectorSessions.get(parts[2]);
      if (!session) {
        connectorError(res, 404, "SESSION_NOT_FOUND", {}, origin);
        return;
      }
      const input = await connectorRequestBody(req);
      const catalog = await connectorFetchCodexCatalog();
      const projectId = String(input.projectId || "").trim();
      const projectPath = String(input.projectPath || "").trim().replace(/[\\/]+$/, "");
      const projectName = String(input.projectName || "").trim();
      const candidates = catalog.threads.filter((thread) => {
        const threadPath = String(thread.projectPath || "").replace(/[\\/]+$/, "");
        return (
          (projectId && thread.projectId === projectId) ||
          (projectPath && threadPath === projectPath) ||
          (projectName && thread.projectName === projectName)
        );
      }).sort((a, b) =>
        Number(b.recencyAt || b.updatedAt || 0) - Number(a.recencyAt || a.updatedAt || 0)
      );
      const thread = candidates[0];
      if (!thread?.threadId) {
        connectorError(res, 404, "CURRENT_THREAD_NOT_FOUND", {}, origin);
        return;
      }
      await connectorLoadBindings();
      const previous = session.codexBinding
        ? connectorBindings.get(session.codexBinding.bindingId) || session.codexBinding
        : connectorFindPersistedBinding(session.binding);
      const next = connectorSafeCodexBinding({
        projectId: projectId || thread.projectId || "",
        projectName: projectName || thread.projectName || "",
        projectPath: projectPath || thread.projectPath || "",
        threadId: thread.threadId,
        threadTitle: thread.title || "",
        scope: "thread",
        pageKey: connectorPageKey(session.binding),
      }, previous);
      connectorBindings.set(next.bindingId, next);
      connectorApplyCodexBinding(session, next);
      await connectorSaveBindings();
      connectorJson(res, 200, {
        ok: true,
        session,
        binding: connectorPublicCodexBinding(next),
        thread,
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (
      req.method === "DELETE" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "binding"
    ) {
      const session = connectorSessions.get(parts[2]);
      if (!session) {
        connectorError(res, 404, "SESSION_NOT_FOUND", {}, origin);
        return;
      }
      await connectorLoadBindings();
      const bindingId = session.codexBinding?.bindingId || "";
      const pageKey = connectorPageKey(session.binding);
      let cleared = false;
      for (const [id, binding] of connectorBindings) {
        if ((bindingId && id === bindingId) || binding.pageKey === pageKey) {
          connectorBindings.delete(id);
          cleared = true;
        }
      }
      connectorApplyCodexBinding(session, null);
      await connectorSaveBindings();
      connectorJson(res, 200, {
        ok: true,
        session,
        cleared,
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "actions"
    ) {
      const input = await connectorRequestBody(req);
      const action = await connectorCreateAction(parts[2], input);
      connectorJson(res, 200, {
        ok: true,
        action: connectorPublicAction(action),
        security: {
          credentialsReturned: false,
          fileContentsReturned: false,
        },
      }, origin);
      return;
    }
    if (
      req.method === "GET" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "actions" &&
      parts[4] === "next"
    ) {
      const auth = {
        bindingId: url.searchParams.get("bindingId") || "",
        projectId: url.searchParams.get("projectId") || "",
        threadId: url.searchParams.get("threadId") || "",
      };
      connectorRequireActionSession(parts[2], auth);
      const action = [...connectorActions.values()]
        .filter((item) => item.sessionId === parts[2] && item.status === "queued")
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
      if (!action) {
        connectorJson(res, 200, { ok: true, action: null, security: { credentialsReturned: false } }, origin);
        return;
      }
      action.status = "claimed";
      action.claimedAt = new Date().toISOString();
      let filePayload = null;
      if (action.file) {
        const data = await fs.promises.readFile(action.file.path);
        filePayload = {
          name: action.file.name,
          size: action.file.size,
          type: action.file.type,
          base64: data.toString("base64"),
        };
      }
      connectorJson(res, 200, {
        ok: true,
        action: {
          ...connectorPublicAction(action),
          payload: {
            action: action.type,
            ...action.target,
            confirmText: action.confirmText,
            file: filePayload,
          },
        },
        security: {
          credentialsReturned: false,
          filePathReturned: false,
          fileContentsEphemeral: Boolean(filePayload),
        },
      }, origin);
      return;
    }
    if (
      req.method === "POST" &&
      parts.length === 6 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "actions" &&
      parts[5] === "result"
    ) {
      const input = await connectorRequestBody(req);
      const session = connectorRequireActionSession(parts[2], input);
      const action = connectorActions.get(parts[4]);
      if (!action || action.sessionId !== session.sessionId) {
        connectorError(res, 404, "ACTION_NOT_FOUND", {}, origin);
        return;
      }
      if (!["claimed", "running"].includes(action.status)) throw new Error("ACTION_NOT_CLAIMED");
      action.result = connectorSafeActionResult(input.result);
      action.status = action.result?.ok ? "completed" : "failed";
      action.completedAt = new Date().toISOString();
      connectorJson(res, 200, {
        ok: true,
        action: connectorPublicAction(action),
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (
      req.method === "GET" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "sessions" &&
      parts[3] === "actions"
    ) {
      const action = connectorActions.get(parts[4]);
      if (!action || action.sessionId !== parts[2]) {
        connectorError(res, 404, "ACTION_NOT_FOUND", {}, origin);
        return;
      }
      connectorRequireActionSession(parts[2], {
        bindingId: url.searchParams.get("bindingId") || "",
        projectId: url.searchParams.get("projectId") || "",
        threadId: url.searchParams.get("threadId") || "",
      });
      connectorJson(res, 200, {
        ok: true,
        action: connectorPublicAction(action),
        security: { credentialsReturned: false },
      }, origin);
      return;
    }
    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "sessions") {
      const session = connectorSessions.get(parts[2]);
      if (!session) {
        connectorError(res, 404, "SESSION_NOT_FOUND", {}, origin);
        return;
      }
      connectorJson(res, 200, { ok: true, session, security: { credentialsReturned: false } }, origin);
      return;
    }
    connectorError(res, 404, "NOT_FOUND", {}, origin);
  } catch (error) {
    connectorError(res, 500, error?.message || String(error), {}, origin);
  }
}

function startConnectorBridge() {
  return connectorBridge.start({
    port: Number(process.env.TIANYUAN_CONNECTOR_PORT || DEFAULT_CONNECTOR_PORT),
  });
}

async function connectorBridgeHealth() {
  return connectorBridge.health(Number(process.env.TIANYUAN_CONNECTOR_PORT || DEFAULT_CONNECTOR_PORT));
}

async function connectorBridgeListenerPids() {
  return await platformAdapter.listenerPids(DEFAULT_CONNECTOR_PORT);
}

async function stopConnectorBridgeAction() {
  const existing = await connectorBridgeHealth();
  if (!existing?.ok) {
    return { ok: true, stopped: false, reason: "CONNECTOR_NOT_RUNNING", security: { credentialsReturned: false } };
  }
  if (existing.service !== "tianyuan-connector-bridge") {
    return { ok: false, stopped: false, reason: "CONNECTOR_PORT_OCCUPIED_BY_OTHER_SERVICE", security: { credentialsReturned: false } };
  }
  const pids = [...new Set([
    Number(existing.pid || 0),
    ...(await connectorBridgeListenerPids()),
  ].filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid))];
  if (!pids.length) {
    return { ok: false, stopped: false, reason: "CONNECTOR_PROCESS_NOT_FOUND", security: { credentialsReturned: false } };
  }
  for (const pid of pids) {
    await platformAdapter.terminateProcess(pid);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const health = await connectorBridgeHealth();
    if (!health?.ok) {
      return { ok: true, stopped: true, pids, security: { credentialsReturned: false } };
    }
  }
  return { ok: false, stopped: false, reason: "CONNECTOR_STOP_TIMEOUT", pids, security: { credentialsReturned: false } };
}

async function startConnectorBridgeAction({ forceRestart = false } = {}) {
  const existing = await connectorBridgeHealth();
  let restart = null;
  if (existing?.ok && !forceRestart) {
    return { ok: true, started: false, connector: existing, security: { credentialsReturned: false } };
  }
  if (existing?.ok && forceRestart) {
    restart = await stopConnectorBridgeAction();
    if (!restart.ok) return restart;
  }
  const childArgs = IS_WINDOWS
    ? ["--connector-bridge"]
    : [process.argv[1], "--connector-bridge"];
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      TIANYUAN_CONNECTOR_PORT: String(DEFAULT_CONNECTOR_PORT),
    },
  });
  child.unref();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const health = await connectorBridgeHealth();
    if (health?.ok) {
      return { ok: true, started: true, restarted: Boolean(restart?.stopped), connector: health, security: { credentialsReturned: false } };
    }
  }
  return { ok: false, reason: "CONNECTOR_START_TIMEOUT", security: { credentialsReturned: false } };
}

function readMessages(onMessage) {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      const raw = buffer.slice(4, 4 + length).toString("utf8");
      buffer = buffer.slice(4 + length);
      onMessage(JSON.parse(raw));
    }
  });
}

function withTimeout(promise, ms, timeoutReason) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutReason)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function checkCli() {
  return new Promise((resolve) => {
    execFile(CLI_BIN, ["--version"], { timeout: 3000 }, (error, stdout, stderr) => {
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

function startCliLogin() {
  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, ["login"], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        reason: error.code === "ENOENT" ? "TYCPV_NOT_FOUND" : (error?.message || String(error)),
        security: { credentialsReturned: false },
      });
    });

    child.unref();
    resolve({
      ok: true,
      action: "cli_login_started",
      message: "已打开 tycpv 授权流程",
      security: { credentialsReturned: false },
    });
  });
}

async function chooseDirectory(prompt) {
  return await platformAdapter.chooseDirectory(prompt);
}

async function chooseExportDirectory() {
  const result = await chooseDirectory("选择天源表格导出目录");
  const selectedPath = result.paths?.[0] || "";
  return {
    ...result,
    action: "export_directory_selected",
    path: selectedPath ? selectedPath.replace(/[\\/]+$/, "") || path.parse(selectedPath).root : "",
  };
}

async function chooseWorkbookFiles() {
  const result = await platformAdapter.chooseWorkbookFiles();
  return {
    ...result,
    action: "print_workbook_files_selected",
  };
}

async function chooseWorkbookDirectory() {
  const result = await chooseDirectory("选择包含待处理 Excel 文件的文件夹");
  return {
    ...result,
    action: "print_workbook_directory_selected",
  };
}

async function chooseBatchUploadDirectory() {
  const result = await chooseDirectory("选择批量上传文件夹");
  const selectedPath = result.paths?.[0] || "";
  return {
    ...result,
    action: "batch_upload_directory_selected",
    path: selectedPath ? selectedPath.replace(/[\\/]+$/, "") || path.parse(selectedPath).root : "",
  };
}

function collectBatchUploadFiles(rootPath, results, relativeRoot = "") {
  if (results.length >= 200) return;
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= 200) return;
    const fullPath = path.join(rootPath, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      collectBatchUploadFiles(fullPath, results, relativePath);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!CONNECTOR_ATTACHMENT_EXTENSIONS.has(extension)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.size <= 0 || stat.size > CONNECTOR_MAX_ATTACHMENT_BYTES) continue;
    results.push({
      name: entry.name,
      relativePath,
      filePath: fs.realpathSync(fullPath),
      size: stat.size,
      extension,
      type: connectorAttachmentMime(extension),
    });
  }
}

function listBatchUploadDirectory(input = {}) {
  const rawPath = String(input.path || "").trim();
  if (!rawPath || !path.isAbsolute(rawPath)) throw new Error("BATCH_UPLOAD_DIRECTORY_MUST_BE_ABSOLUTE");
  const rootPath = fs.realpathSync(rawPath);
  if (!fs.statSync(rootPath).isDirectory()) throw new Error("BATCH_UPLOAD_DIRECTORY_NOT_FOUND");
  const files = [];
  collectBatchUploadFiles(rootPath, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN"));
  return {
    ok: true,
    action: "batch_upload_directory_listed",
    path: rootPath,
    files,
    truncated: files.length >= 200,
    security: { credentialsReturned: false, fileContentsReturned: false },
  };
}

async function choosePrintOutputDirectory() {
  const result = await chooseDirectory("选择打印版文件的存放位置");
  return {
    ...result,
    action: "print_output_directory_selected",
  };
}

function isWorkbookPath(value) {
  const extension = path.extname(String(value || "")).toLowerCase();
  return extension === ".xlsx" || extension === ".xlsm";
}

function shouldSkipWorkbook(filePath) {
  const name = path.basename(filePath);
  return name.startsWith("~$")
    || name.includes(".打印格式调整前备份-")
    || name.includes(".申报表转换前备份-")
    || /-打印版(?:\s*\(\d+\))?\.(xlsx|xlsm)$/i.test(name);
}

function walkWorkbookFiles(rootPath, results) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= 500) throw new Error("PRINT_INPUT_LIMIT_EXCEEDED");
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      walkWorkbookFiles(fullPath, results);
    } else if (entry.isFile() && isWorkbookPath(fullPath) && !shouldSkipWorkbook(fullPath)) {
      results.push(fs.realpathSync(fullPath));
    }
  }
}

function collectWorkbookFiles(inputPaths) {
  const results = [];
  const seen = new Set();
  for (const value of Array.isArray(inputPaths) ? inputPaths : []) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("PRINT_INPUT_INVALID");
    const resolved = fs.realpathSync(raw);
    const stat = fs.statSync(resolved);
    const candidates = [];
    if (stat.isDirectory()) {
      walkWorkbookFiles(resolved, candidates);
    } else if (stat.isFile() && isWorkbookPath(resolved) && !path.basename(resolved).startsWith("~$")) {
      candidates.push(resolved);
    }
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      results.push(candidate);
    }
  }
  if (!results.length) throw new Error("NO_PRINT_WORKBOOKS_FOUND");
  return results;
}

function uniquePrintTarget(directory, sourcePath) {
  const extension = path.extname(sourcePath);
  const stem = path.basename(sourcePath, extension);
  let target = path.join(directory, `${stem}-打印版${extension}`);
  let index = 2;
  while (fs.existsSync(target)) {
    target = path.join(directory, `${stem}-打印版 (${index})${extension}`);
    index += 1;
  }
  return target;
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

async function verifyWorkbookArchive(filePath) {
  const verificationCode = [
    "import sys, zipfile",
    "path = sys.argv[1]",
    "with zipfile.ZipFile(path, 'r') as workbook:",
    "    bad = workbook.testzip()",
    "if bad:",
    "    raise SystemExit('CORRUPT_ZIP_MEMBER:' + bad)",
  ].join("\n");
  await execFilePromise(PYTHON_BIN, ["-c", verificationCode, filePath], { timeout: 120000 });
}

function replaceProcessedFile(temporaryPath, finalPath) {
  if (!fs.existsSync(finalPath)) {
    fs.renameSync(temporaryPath, finalPath);
    return;
  }

  const backupPath = path.join(
    path.dirname(finalPath),
    `.${path.basename(finalPath)}.tianyuan-replace-${randomUUID()}`,
  );
  fs.renameSync(finalPath, backupPath);
  try {
    fs.renameSync(temporaryPath, finalPath);
    fs.unlinkSync(backupPath);
  } catch (error) {
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, finalPath);
    throw error;
  }
}

function runPythonPrintScript({ scriptPath, workbookPath, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath, workbookPath, "--no-backup"], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        TIANYUAN_DETAIL_PRINT_SCRIPT: PRINT_FORMAT_SCRIPTS.detail,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logLines = [];
    const consume = (line, stream) => {
      const text = String(line || "").trim();
      if (!text) return;
      logLines.push({ stream, text });
      onLine?.(text, stream);
    };
    readline.createInterface({ input: child.stdout }).on("line", (line) => consume(line, "stdout"));
    readline.createInterface({ input: child.stderr }).on("line", (line) => consume(line, "stderr"));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ code, signal: signal || null, logLines });
      } else {
        const error = new Error("PRINT_SCRIPT_FAILED");
        error.exitCode = code;
        error.signal = signal || null;
        error.logLines = logLines;
        reject(error);
      }
    });
  });
}

async function runPrintFormat(message, emit) {
  const formatType = String(message?.formatType || "");
  const scriptPath = PRINT_FORMAT_SCRIPTS[formatType];
  const outputMode = String(message?.outputMode || "");
  const results = [];
  try {
    if (!scriptPath || !fs.existsSync(scriptPath)) throw new Error("PRINT_SCRIPT_NOT_FOUND");
    if (!PRINT_OUTPUT_MODES.has(outputMode)) throw new Error("PRINT_OUTPUT_MODE_INVALID");
    const sourceFiles = collectWorkbookFiles(message.inputPaths);
    const outputDir = outputMode === "new_directory"
      ? validateExportDirectory(message.outputDir)
      : "";
    emit({
      ok: true,
      event: "progress",
      phase: "ready",
      percent: 3,
      current: 0,
      total: sourceFiles.length,
      message: `已发现 ${sourceFiles.length} 个工作簿`,
    });

    for (let index = 0; index < sourceFiles.length; index += 1) {
      const sourcePath = sourceFiles[index];
      const destinationDirectory = outputMode === "new_directory"
        ? outputDir
        : path.dirname(sourcePath);
      const finalPath = outputMode === "overwrite"
        ? sourcePath
        : uniquePrintTarget(destinationDirectory, sourcePath);
      const temporaryPath = path.join(
        path.dirname(finalPath),
        `.${path.basename(finalPath, path.extname(finalPath))}.tianyuan-${randomUUID()}${path.extname(finalPath)}`,
      );
      const startPercent = 5 + Math.round(index / sourceFiles.length * 90);
      emit({
        ok: true,
        event: "progress",
        phase: "processing",
        percent: startPercent,
        current: index + 1,
        total: sourceFiles.length,
        sourcePath,
        outputPath: finalPath,
        message: `正在处理 ${path.basename(sourcePath)}`,
      });

      fs.copyFileSync(sourcePath, temporaryPath);
      try {
        const scriptResult = await runPythonPrintScript({
          scriptPath,
          workbookPath: temporaryPath,
          onLine: (text, stream) => emit({
            ok: true,
            event: "progress",
            phase: "processing",
            percent: Math.min(94, startPercent + 2),
            current: index + 1,
            total: sourceFiles.length,
            sourcePath,
            outputPath: finalPath,
            message: text,
            stream,
          }),
        });
        await verifyWorkbookArchive(temporaryPath);
        replaceProcessedFile(temporaryPath, finalPath);
        results.push({
          ok: true,
          sourcePath,
          outputPath: finalPath,
          overwritten: outputMode === "overwrite",
          logLines: scriptResult.logLines,
          archiveVerified: true,
        });
        emit({
          ok: true,
          event: "progress",
          phase: "verified",
          percent: 5 + Math.round((index + 1) / sourceFiles.length * 90),
          current: index + 1,
          total: sourceFiles.length,
          sourcePath,
          outputPath: finalPath,
          message: `已完成并校验 ${path.basename(finalPath)}`,
        });
      } catch (error) {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        results.push({
          ok: false,
          sourcePath,
          outputPath: finalPath,
          reason: error?.message || String(error),
          exitCode: error?.exitCode ?? null,
          logLines: error?.logLines || [],
        });
        emit({
          ok: false,
          event: "progress",
          phase: "file_failed",
          percent: 5 + Math.round((index + 1) / sourceFiles.length * 90),
          current: index + 1,
          total: sourceFiles.length,
          sourcePath,
          outputPath: finalPath,
          message: `${path.basename(sourcePath)} 处理失败`,
        });
      }
    }

    const successCount = results.filter((item) => item.ok).length;
    const finalOk = successCount === results.length;
    emit({
      ok: finalOk,
      event: "complete",
      phase: finalOk ? "completed" : "completed_with_errors",
      percent: 100,
      formatType,
      outputMode,
      outputDir: outputDir || null,
      total: results.length,
      successCount,
      failedCount: results.length - successCount,
      results,
      reason: finalOk ? null : "PRINT_BATCH_PARTIAL_FAILURE",
      security: { credentialsReturned: false },
    });
  } catch (error) {
    emit({
      ok: false,
      event: "complete",
      phase: "failed",
      percent: 0,
      formatType,
      outputMode,
      reason: error?.message || String(error),
      results,
      security: { credentialsReturned: false },
    });
  }
}

function validateExportDirectory(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) {
    throw new Error("EXPORT_DIRECTORY_INVALID");
  }
  const resolved = fs.realpathSync(raw);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error("EXPORT_DIRECTORY_NOT_DIRECTORY");
  return resolved;
}

function parseCompanyIds(values) {
  const ids = Array.isArray(values) ? values : [];
  return [...new Set(ids.map((value) => String(value || "").trim()).filter(Boolean))].map((value) => {
    if (!/^\d+$/.test(value)) throw new Error("companyIds_INVALID");
    return value;
  });
}

function exportProgressFromLine(line, state) {
  const text = String(line || "").trim();
  if (!text) return state.percent;
  if (text.includes("[mcp] connecting")) return Math.max(state.percent, 8);
  if (text.includes("loading project contexts")) return Math.max(state.percent, 14);
  if (text.includes("project loaded")) return Math.max(state.percent, 20);
  if (text.includes("loading company tree")) return Math.max(state.percent, 24);
  const companiesMatch = text.match(/\[export\] companies=(\d+)/);
  if (companiesMatch) {
    state.totalCompanies = Number(companiesMatch[1]) || state.totalCompanies;
    return Math.max(state.percent, 30);
  }
  if (/^\[\d+\].+(?:detail|declare) exporting\.\.\.$/.test(text)) {
    state.currentCompany += 1;
    const total = Math.max(state.totalCompanies, state.currentCompany, 1);
    return Math.max(state.percent, 30 + Math.round((state.currentCompany - 1) / total * 55));
  }
  if (text.includes("] writing ")) {
    const total = Math.max(state.totalCompanies, state.currentCompany, 1);
    return Math.max(state.percent, 30 + Math.round(state.currentCompany / total * 45));
  }
  if (text.includes("] wrote ")) {
    const total = Math.max(state.totalCompanies, state.currentCompany, 1);
    return Math.max(state.percent, 30 + Math.round(state.currentCompany / total * 60));
  }
  if (text.includes("导出完成")) return 98;
  return state.percent;
}

function cliExportFailure(logLines) {
  const text = logLines.map((item) => String(item?.text || "")).join("\n");
  if (/本地登录凭证已过期|请先运行\s*tycpv login|(?:登录|授权).*(?:过期|失效)|缺少\s*MCP token/i.test(text)) {
    return {
      reason: "TYCPV_AUTH_REQUIRED",
      userMessage: "CLI 授权已过期或缺失。请进入“连接配置”，点击“授权 CLI”，完成登录后点击“启动/检查”，再重新导出。",
    };
  }
  if (/unauthorized|invalid token|MCP token|VALUATION_MCP_TOKEN/i.test(text)) {
    return {
      reason: "MCP_TOKEN_REQUIRED",
      userMessage: "MCP token 未配置或已失效。请在“连接配置”中由使用者本人重新配置 MCP token，再重新导出。",
    };
  }
  if (/forbidden|权限不足|无权访问/i.test(text)) {
    return {
      reason: "TYCPV_PERMISSION_DENIED",
      userMessage: "当前 CLI 账号没有导出权限。请确认登录账号拥有该项目的导出权限后再试。",
    };
  }
  return {
    reason: "TYCPV_EXPORT_FAILED",
    userMessage: "",
  };
}

function runCliExport(message, emit) {
  let exportConfig;
  try {
    exportConfig = CLI_EXPORT_COMMANDS[String(message?.exportType || "")];
    if (!exportConfig) throw new Error("EXPORT_TYPE_NOT_ALLOWED");
    const projectId = String(parseNumericId(message.projectId, "projectId"));
    const companyIds = parseCompanyIds(message.companyIds);
    if (!companyIds.length) throw new Error("companyIds_REQUIRED");
    const outDir = validateExportDirectory(message.outDir);
    const args = [
      exportConfig.command,
      "--project-id",
      projectId,
      "--company-ids",
      companyIds.join(","),
      "--out-dir",
      outDir,
    ];
    const progressState = {
      percent: 3,
      currentCompany: 0,
      totalCompanies: companyIds.length,
    };
    const outputFiles = new Set();
    const logLines = [];
    let completed = false;

    function complete(payload) {
      if (completed) return;
      completed = true;
      emit(payload);
    }

    emit({
      ok: true,
      event: "progress",
      phase: "starting",
      percent: progressState.percent,
      message: `准备导出${exportConfig.label}`,
      outDir,
    });

    const child = spawn(CLI_BIN, args, {
      cwd: outDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    function consumeLine(line, stream) {
      const text = String(line || "").trim();
      if (!text) return;
      logLines.push({ stream, text });
      const wroteMatch = text.match(/\] wrote (.+\.(?:xlsx|xlsm))$/i);
      if (wroteMatch) outputFiles.add(wroteMatch[1]);
      if (/^\s*(?:\/|[A-Za-z]:[\\/]).+\.(?:xlsx|xlsm)$/i.test(line)) outputFiles.add(text);
      progressState.percent = exportProgressFromLine(text, progressState);
      emit({
        ok: true,
        event: "progress",
        phase: "running",
        percent: progressState.percent,
        currentCompany: progressState.currentCompany,
        totalCompanies: progressState.totalCompanies,
        message: text,
        stream,
      });
    }

    readline.createInterface({ input: child.stdout }).on("line", (line) => consumeLine(line, "stdout"));
    readline.createInterface({ input: child.stderr }).on("line", (line) => consumeLine(line, "stderr"));

    child.on("error", (error) => {
      complete({
        ok: false,
        event: "complete",
        phase: "failed",
        percent: progressState.percent,
        reason: error.code === "ENOENT" ? "TYCPV_NOT_FOUND" : (error?.message || String(error)),
        outputFiles: [...outputFiles],
        outDir,
        security: { credentialsReturned: false },
      });
    });

    child.on("close", (code, signal) => {
      if (completed) return;
      const ok = code === 0;
      const failure = ok ? null : cliExportFailure(logLines);
      complete({
        ok,
        event: "complete",
        phase: ok ? "completed" : "failed",
        percent: ok ? 100 : progressState.percent,
        exitCode: code,
        signal: signal || null,
        exportType: message.exportType,
        label: exportConfig.label,
        projectId,
        companyIds,
        outDir,
        outputFiles: [...outputFiles],
        logLines,
        reason: failure?.reason || null,
        userMessage: failure?.userMessage || "",
        security: { credentialsReturned: false },
      });
    });
  } catch (error) {
    emit({
      ok: false,
      event: "complete",
      phase: "failed",
      percent: 0,
      reason: error?.message || String(error),
      security: { credentialsReturned: false },
    });
  }
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

  if (!dataLines.length) throw new Error("MCP_EMPTY_OR_UNSUPPORTED_RESPONSE");
  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function rpc(method, params, { notification = false } = {}) {
  const token = getToken();
  if (!token) throw new Error("VALUATION_MCP_TOKEN_NOT_SET");

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
    if (response.status === 400 && /no valid session/i.test(text)) {
      throw new Error("MCP_SESSION_EXPIRED");
    }
    throw new Error(`MCP_HTTP_${response.status}`);
  }
  if (notification) return null;

  const parsed = parseSseOrJson(text);
  if (parsed?.error) throw new Error(parsed.error.message || parsed.error.code || "MCP_RPC_ERROR");
  return parsed?.result ?? parsed;
}

async function ensureInitialized() {
  if (initialized && sessionId) return;
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "tianyuan-browser-workbench-native-host",
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
  try {
    await ensureInitialized();
    const result = await rpc("tools/call", { name, arguments: args || {} });
    return parseToolResult(result);
  } catch (error) {
    if (error?.message !== "MCP_SESSION_EXPIRED") throw error;
    sessionId = null;
    initialized = false;
    await ensureInitialized();
    const result = await rpc("tools/call", { name, arguments: args || {} });
    return parseToolResult(result);
  }
}

function parseNumericId(value, fieldName) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${fieldName}_INVALID`);
  return Number(text);
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["data", "list", "records", "rows", "companies", "subjects", "items", "result", "children", "tree"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return Object.values(value).find(Array.isArray) || [];
}

function flattenItems(value, depth = 0) {
  if (depth > 8) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenItems(item, depth + 1));
  }
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
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function pickSubjectName(object, code) {
  const direct = pickString(object, [
    "subjectName",
    "subject_name",
    "name",
    "label",
    "title",
    "text",
    "sheetName",
    "sheet_name",
    "accountName",
    "account_name",
    "assetSubjectName",
    "asset_subject_name",
  ]);
  if (direct && direct !== code) return direct;

  for (const [key, value] of Object.entries(object || {})) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text || text === code || text.length > 60) continue;
    if (/(Name|name|名称|科目|account|subject)/.test(key) && /[\u4e00-\u9fa5]/.test(text)) {
      return text;
    }
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
    const code = pickString(object, [
      "subjectCode",
      "subject_code",
      "code",
      "accountCode",
      "account_code",
      "assetSubjectCode",
      "asset_subject_code",
      "value",
    ]);
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

async function health({ probe = false } = {}) {
  const token = getToken();
  let mcp = {
    ok: Boolean(token),
    configured: Boolean(token),
    connected: Boolean(sessionId && initialized),
    reason: token ? (sessionId && initialized ? null : "MCP_NOT_PROBED") : "VALUATION_MCP_TOKEN_NOT_SET",
  };
  if (probe && token) {
    try {
      await withTimeout(ensureInitialized(), 8000, "MCP_PROBE_TIMEOUT");
      mcp = { ok: true, configured: true, connected: true, reason: null };
    } catch (error) {
      mcp = {
        ok: false,
        configured: true,
        connected: false,
        reason: error?.message || String(error),
      };
    }
  }

  return {
    ok: true,
    service: "tianyuan-native-host",
    transport: "native_messaging",
    mcpConfigured: Boolean(token),
    mcpUrl,
    sessionReady: Boolean(sessionId && initialized),
    mcp,
    cli: await checkCli(),
    security: {
      credentialsReturned: false,
    },
  };
}

async function handle(message) {
  if (typeof message?.mcpToken === "string" && message.mcpToken.trim()) {
    const nextToken = message.mcpToken.trim();
    if (nextToken !== runtimeToken) {
      runtimeToken = nextToken;
      sessionId = null;
      initialized = false;
    }
  }

  if (message?.action === "health") {
    return await health({ probe: message.probe === true });
  }
  if (message?.action === "start_connector_bridge") {
    return await startConnectorBridgeAction({ forceRestart: message.forceRestart === true });
  }
  if (message?.action === "check_github_update") {
    return await updateChecker.checkGithubUpdate({
      currentVersion: message.currentVersion,
      currentBuildNumber: message.currentBuildNumber,
      currentRuntimeBuildId: message.currentRuntimeBuildId,
      platform: process.platform,
      architecture: process.arch,
    });
  }
  if (message?.action === "cli_login") {
    return await startCliLogin();
  }
  if (message?.action === "select_export_directory") {
    return await chooseExportDirectory();
  }
  if (message?.action === "select_print_workbook_files") {
    return await chooseWorkbookFiles();
  }
  if (message?.action === "select_print_workbook_directory") {
    return await chooseWorkbookDirectory();
  }
  if (message?.action === "select_batch_upload_directory") {
    return await chooseBatchUploadDirectory();
  }
  if (message?.action === "list_batch_upload_directory") {
    return listBatchUploadDirectory(message);
  }
  if (message?.action === "select_print_output_directory") {
    return await choosePrintOutputDirectory();
  }
  if (message?.action === "get_project_companies") {
    const projectId = parseNumericId(message.projectId, "projectId");
    const raw = await callTool("get_project_companies", { projectId });
    return {
      ok: true,
      projectId,
      companies: normalizeCompanies(raw),
      rawShape: Array.isArray(raw) ? "array" : typeof raw,
      security: { credentialsReturned: false },
    };
  }
  if (message?.action === "get_asset_subjects") {
    const projectId = parseNumericId(message.projectId, "projectId");
    const companyId = parseNumericId(message.companyId, "companyId");
    const raw = await callTool("get_company_asset_based_approach_subjects", { projectId, companyId });
    return {
      ok: true,
      projectId,
      companyId,
      subjects: normalizeSubjects(raw),
      rawShape: Array.isArray(raw) ? "array" : typeof raw,
      security: { credentialsReturned: false },
    };
  }
  return {
    ok: false,
    reason: "UNKNOWN_ACTION",
    security: { credentialsReturned: false },
  };
}

async function runSelfTest() {
  const cli = await checkCli();
  const platform = platformAdapter.diagnostics();
  return {
    ok: fs.existsSync(PYTHON_BIN)
      && fs.existsSync(PRINT_FORMAT_SCRIPTS.detail)
      && fs.existsSync(PRINT_FORMAT_SCRIPTS.declaration)
      && platform.supported,
    service: "tianyuan-native-host",
    platform: process.platform,
    architecture: process.arch,
    platformAdapter: platform,
    pythonAvailable: fs.existsSync(PYTHON_BIN),
    printScriptsAvailable: {
      detail: fs.existsSync(PRINT_FORMAT_SCRIPTS.detail),
      declaration: fs.existsSync(PRINT_FORMAT_SCRIPTS.declaration),
    },
    cli,
    security: { credentialsReturned: false },
  };
}

if (process.argv.includes("--connector-bridge")) {
  startConnectorBridge();
} else if (process.argv.includes("--self-test")) {
  runSelfTest()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.ok ? 0 : 1;
    })
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({
        ok: false,
        reason: error?.message || String(error),
        security: { credentialsReturned: false },
      })}\n`);
      process.exitCode = 1;
    });
} else {
  readMessages((message) => {
    if (message?.action === "run_cli_export") {
      runCliExport(message, writeMessage);
      return;
    }
    if (message?.action === "run_print_format") {
      runPrintFormat(message, writeMessage);
      return;
    }
    handle(message)
      .then((payload) => writeMessage(payload))
      .catch((error) => writeMessage({
        ok: false,
        reason: error?.message || String(error),
        security: { credentialsReturned: false },
      }));
  });
}
