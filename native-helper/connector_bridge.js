"use strict";

const { execFileSync } = require("node:child_process");
const { createServer } = require("node:http");
const { randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPlatformAdapter } = require("./platform/index.js");
const { filterRetainedCatalog, readCodexCatalog } = require("./codex_catalog.js");

const platformAdapter = createPlatformAdapter();

const PROTOCOL_VERSION = "connector-agent-binding-v3";
const BUILD_ID = "2026-08-27-browser-contract-v3-edit-highlight";
const ACTION_TTL_MS = 5 * 60 * 1000;
const ACTION_RESULT_TTL_MS = 15 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".zip", ".rar"]);
const MAX_EDIT_BLOCK_TEXT = 200000;
const MAX_TABLE_ROWS = 50;
const MAX_TABLE_COLUMNS = 20;
const MAX_TABLE_CELL_TEXT = 5000;
const EDIT_BLOCK_SENSITIVE_TEXT_PATTERN = /(?:bearer\s+|authorization\s*[:=]|access[_-]?token\s*[:=]|mcp\s*token\s*[:=]|密码\s*[:：=]|验证码\s*[:：=])/i;
const EXTENSION_ORIGINS = new Set([
  "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
  "chrome-extension://fdbllnmaaklkcmoacoapbibiggnndkfpa",
]);
const EXTENSION_IDS = new Set([
  "lkflndcnklpeaejohaacoaolnmhgigoc",
  "fdbllnmaaklkcmoacoapbibiggnndkfpa",
]);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${randomUUID()}`; }
function limited(value, max = 200) { return String(value || "").trim().slice(0, max); }
function normalizePath(value) { return limited(value, 1000).replace(/[\\/]+$/, ""); }
function pageKey(page = {}) {
  const projectId = limited(page.projectId, 80);
  const companyId = limited(page.companyId, 80);
  const pageType = limited(page.pageType, 120);
  const url = limited(page.url, 1000);
  return [projectId, companyId, pageType, projectId || companyId || pageType ? "" : url].join("|");
}
function safePage(value = {}) {
  return {
    projectId: limited(value.projectId, 80), projectName: limited(value.projectName, 160),
    companyId: limited(value.companyId, 80), subjectCode: limited(value.subjectCode, 120),
    subjectPath: limited(value.subjectPath, 500), pageType: limited(value.pageType, 120),
    url: limited(value.url, 1000), tabId: Number.isInteger(value.tabId) ? value.tabId : null,
    operationScope: limited(value.operationScope || "context-read", 120),
  };
}
function safeSelection(value = {}) {
  const mode = value.mode === "caret" ? "caret" : "text";
  const caretReference = safeCaretReference(value.caretReference);
  const available = Boolean(value.available && (limited(value.text, 10000) || mode === "caret" && caretReference));
  const element = value.element && typeof value.element === "object" ? value.element : null;
  return {
    available,
    text: available ? limited(value.text, 10000) : "",
    source: available ? limited(value.source, 80) : "",
    mode: available ? mode : "",
    pageUrl: available ? limited(value.pageUrl, 1000) : "",
    pageTitle: available ? limited(value.pageTitle, 300) : "",
    tabId: available && Number.isInteger(value.tabId) ? value.tabId : null,
    capturedAt: available ? limited(value.capturedAt, 80) || null : null,
    element: available && element ? {
      tag: limited(element.tag, 40), id: limited(element.id, 160) || null,
      name: limited(element.name, 160) || null, role: limited(element.role, 80) || null,
      contentEditable: Boolean(element.contentEditable),
    } : null,
    sessionId: available ? limited(value.sessionId, 200) || null : null,
    bindingId: available ? limited(value.bindingId, 200) || null : null,
    workspaceId: available ? limited(value.workspaceId, 200) || null : null,
    projectId: available ? limited(value.projectId, 200) || null : null,
    conversationId: available ? limited(value.conversationId, 200) || null : null,
    threadId: available ? limited(value.threadId, 200) || null : null,
    caretReference: available ? caretReference : null,
  };
}
function safeCaretReference(value) {
  if (!value || typeof value !== "object" || value.mode !== "caret") return null;
  const textOffset = Number(value.textOffset);
  if (!Number.isInteger(textOffset) || textOffset < 0) return null;
  if (!limited(value.containerPath, 1000) || !limited(value.domPath, 1000)) return null;
  const result = {
    mode: "caret",
    baseId: limited(value.baseId, 500),
    blockId: limited(value.blockId, 500),
    containerPath: limited(value.containerPath, 1000),
    domPath: limited(value.domPath, 1000),
    textOffset,
  };
  if (Number.isInteger(value.containerTextOffset)) result.containerTextOffset = value.containerTextOffset;
  if (value.available !== undefined) result.available = Boolean(value.available);
  return result;
}
function safeEditingBlock(value = {}) {
  const originalText = limited(value.originalText, MAX_EDIT_BLOCK_TEXT);
  const currentText = limited(value.currentText, MAX_EDIT_BLOCK_TEXT);
  const available = Boolean(value.available && limited(value.blockId, 500) && !EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(originalText) && !EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(currentText));
  const element = value.element && typeof value.element === "object" ? value.element : null;
  return {
    available,
    valid: available && value.valid !== false,
    stale: available ? Boolean(value.stale) : Boolean(value.reason),
    reason: limited(value.reason, 120),
    blockId: available ? limited(value.blockId, 500) : "",
    tabId: available && Number.isInteger(value.tabId) ? value.tabId : null,
    pageUrl: available ? limited(value.pageUrl, 1000) : "",
    pageTitle: available ? limited(value.pageTitle, 300) : "",
    element: available && element ? {
      tag: limited(element.tag, 40), id: limited(element.id, 160) || null,
      name: limited(element.name, 160) || null, role: limited(element.role, 80) || null,
      contentEditable: Boolean(element.contentEditable), blockId: limited(element.blockId, 500) || null,
      stablePath: limited(element.stablePath, 1000) || null, scope: limited(element.scope, 40) || null,
    } : null,
    editable: available && value.editable !== false,
    originalText: available ? originalText : "",
    currentText: available ? currentText : "",
    contentHash: available ? limited(value.contentHash, 80) : "",
    currentHash: available ? limited(value.currentHash, 80) : "",
    capturedAt: available ? limited(value.capturedAt, 80) || null : null,
    paragraphHint: available ? limited(value.paragraphHint, 300) : "",
    fieldHint: available ? limited(value.fieldHint, 200) : "",
    blockMode: available ? limited(value.blockMode, 20) : "",
    rangeStart: available && Number.isInteger(value.rangeStart) ? value.rangeStart : null,
    rangeEnd: available && Number.isInteger(value.rangeEnd) ? value.rangeEnd : null,
    selectedText: available ? limited(value.selectedText, MAX_EDIT_BLOCK_TEXT) : "",
    caretReference: available ? safeCaretReference(value.caretReference) : null,
    format: available && value.format && typeof value.format === "object" ? {
      fontWeight: limited(value.format.fontWeight, 30), fontStyle: limited(value.format.fontStyle, 30),
      textDecoration: limited(value.format.textDecoration, 40), textAlign: limited(value.format.textAlign, 30),
      fontSizePx: Number.isInteger(value.format.fontSizePx) ? value.format.fontSizePx : null,
      color: limited(value.format.color, 30), lineHeightPx: Number.isInteger(value.format.lineHeightPx) ? value.format.lineHeightPx : null,
      highlightColor: limited(value.format.highlightColor, 30),
      indentPx: Number.isInteger(value.format.indentPx) ? value.format.indentPx : null,
    } : {},
  };
}
function safeContext(value = {}) {
  const route = value.route && typeof value.route === "object" ? value.route : {};
  const spread = value.spread && typeof value.spread === "object" ? value.spread : {};
  const page = value.page && typeof value.page === "object" ? value.page : {};
  const build = value.build && typeof value.build === "object" ? value.build : {};
  return {
    build: { extensionVersion: limited(build.extensionVersion, 80), extensionBuildId: limited(build.extensionBuildId, 120), adapterVersion: limited(build.adapterVersion, 120), contentScriptAdapterVersion: limited(build.contentScriptAdapterVersion, 120), pageAdapterVersion: limited(build.pageAdapterVersion, 120), pageAdapterBuildId: limited(build.pageAdapterBuildId, 120), protocolMatch: Boolean(build.protocolMatch) },
    route: { isTianyuanRoute: Boolean(route.isTianyuanRoute || route.isTianyuanOperationRoute), isTianyuanOperationRoute: Boolean(route.isTianyuanOperationRoute || route.isTianyuanRoute), isAssetDraftRoute: Boolean(route.isAssetDraftRoute), isEquityListRoute: Boolean(route.isEquityListRoute), projectId: limited(route.projectId, 80), companyId: limited(route.companyId, 80), subjectCode: limited(route.subjectCode, 120) },
    spread: { found: Boolean(spread.found), sheetName: limited(spread.sheetName, 160), activeRow: Number.isInteger(spread.activeRow) ? spread.activeRow : null, activeColumn: Number.isInteger(spread.activeColumn) ? spread.activeColumn : null },
    gates: { loginLikely: Boolean(page.loginLikely), saveVisible: Boolean(page.saveButton?.visible), saveDisabled: Boolean(page.saveButton?.disabled), hasLockText: Boolean(limited(page.lockText)), hasPermissionText: Boolean(limited(page.permissionText)) },
    selection: safeSelection(value.selection),
    editingBlock: safeEditingBlock(value.editingBlock),
  };
}
function contextForAgent(session, binding = null) {
  const context = session.context && typeof session.context === "object" ? { ...session.context } : {};
  const selection = safeSelection(context.selection);
  const editingBlock = safeEditingBlock(context.editingBlock);
  const scoped = { ...context, selection, editingBlock };
  if (!selection.available && !editingBlock.available) return scoped;
  return { ...scoped, selection: {
    ...selection,
    sessionId: session.sessionId,
    tabId: session.binding.tabId,
    bindingId: binding?.bindingId || null,
    workspaceId: binding?.workspaceId || null,
    projectId: session.binding.projectId || null,
    conversationId: binding?.conversationId || null,
    threadId: binding?.conversationId || null,
  }, editingBlock: editingBlock.available ? {
    ...editingBlock,
    sessionId: session.sessionId,
    tabId: session.binding.tabId,
    bindingId: binding?.bindingId || null,
    workspaceId: binding?.workspaceId || null,
    projectId: session.binding.projectId || null,
    conversationId: binding?.conversationId || null,
    threadId: binding?.conversationId || null,
  } : editingBlock };
}
function safeClient(value = {}) { return { name: limited(value.name || "tianyuan-browser-workbench", 120), version: limited(value.version, 80), extensionId: limited(value.extensionId, 120) }; }
function publicSource(source) {
  return source ? { agentId: source.agentId, providerId: source.providerId, displayName: source.displayName, installationId: source.installationId, local: Boolean(source.local), manual: Boolean(source.manual), createdAt: source.createdAt || null, updatedAt: source.updatedAt || null, lastSeenAt: source.lastSeenAt || null } : null;
}
function publicBinding(binding) {
  return binding ? { bindingId: binding.bindingId, agentId: binding.agentId, providerId: binding.providerId, displayName: binding.displayName, installationId: binding.installationId, workspaceId: binding.workspaceId, workspaceName: binding.workspaceName, workspacePath: binding.workspacePath, pageProjectId: binding.pageProjectId || String(binding.pageKey || "").split("|")[0], conversationId: binding.conversationId, conversationTitle: binding.conversationTitle, scope: binding.scope, accessMode: binding.accessMode, pageKey: binding.pageKey, manualBinding: Boolean(binding.manualBinding), createdAt: binding.createdAt || null, updatedAt: binding.updatedAt || null } : null;
}
function codexCompatibility(binding) {
  if (!binding || binding.providerId !== "codex") return null;
  return { bindingId: binding.bindingId, projectId: binding.workspaceId || "", projectName: binding.workspaceName || "", projectPath: binding.workspacePath || "", threadId: binding.conversationId || "", threadTitle: binding.conversationTitle || "", scope: binding.scope === "workspace" ? "project" : "thread", createdAt: binding.createdAt || null, updatedAt: binding.updatedAt || null };
}
function error(code, status = 400) { const value = new Error(code); value.code = code; value.status = status; return value; }
function equal(a, b) { const left = Buffer.from(String(a || "")); const right = Buffer.from(String(b || "")); return left.length === right.length && timingSafeEqual(left, right); }
function normalizeFormat(value, table = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error(table ? "TABLE_FORMAT_REQUIRED" : "EDIT_BLOCK_FORMAT_REQUIRED");
  const fields = table
    ? ["rowHeightPx", "columnWidthPx", "borderStyle", "borderColor", "textAlign", "verticalAlign", "fontSizePx", "color", "fontWeight", "fontStyle"]
    : ["fontWeight", "fontStyle", "textDecoration", "textAlign", "fontSizePx", "color", "highlightColor", "lineHeightPx", "indentPx"];
  if (Object.keys(value).some((key) => !fields.includes(key))) throw error(table ? "TABLE_FORMAT_FIELD_NOT_ALLOWED" : "EDIT_BLOCK_FORMAT_FIELD_NOT_ALLOWED");
  const output = {};
  const numericRanges = table
    ? { rowHeightPx: [16, 160], columnWidthPx: [24, 600], fontSizePx: [8, 72] }
    : { fontSizePx: [8, 72], lineHeightPx: [12, 200], indentPx: [0, 400] };
  for (const [key, range] of Object.entries(numericRanges)) {
    if (value[key] === undefined) continue;
    const number = Number(value[key]);
    if (!Number.isInteger(number) || number < range[0] || number > range[1]) throw error(`${table ? "TABLE" : "EDIT_BLOCK"}_FORMAT_${key.toUpperCase()}_INVALID`);
    output[key] = number;
  }
  const enums = table
    ? { borderStyle: ["none", "solid", "dashed", "dotted"], textAlign: ["left", "center", "right", "justify"], verticalAlign: ["top", "middle", "bottom"], fontWeight: ["normal", "bold"], fontStyle: ["normal", "italic"] }
    : { fontWeight: ["normal", "bold"], fontStyle: ["normal", "italic"], textDecoration: ["none", "underline", "line-through"], textAlign: ["left", "center", "right", "justify"] };
  for (const [key, values] of Object.entries(enums)) {
    if (value[key] === undefined) continue;
    if (!values.includes(value[key])) throw error(`${table ? "TABLE" : "EDIT_BLOCK"}_FORMAT_${key.toUpperCase()}_INVALID`);
    output[key] = value[key];
  }
  const colors = table ? ["borderColor", "color"] : ["color", "highlightColor"];
  for (const key of colors) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string") {
      const errorKey = key === "highlightColor" ? "HIGHLIGHT_COLOR" : key.toUpperCase();
      throw error(`${table ? "TABLE" : "EDIT_BLOCK"}_FORMAT_${errorKey}_INVALID`);
    }
    const color = value[key].trim().toLowerCase();
    if (!table && key === "highlightColor" && ["transparent", "none"].includes(color)) {
      output[key] = "transparent";
    } else if (/^#[0-9a-f]{6}$/i.test(color)) {
      output[key] = color;
    } else {
      const errorKey = key === "highlightColor" ? "HIGHLIGHT_COLOR" : key.toUpperCase();
      throw error(`${table ? "TABLE" : "EDIT_BLOCK"}_FORMAT_${errorKey}_INVALID`);
    }
  }
  if (!Object.keys(output).length) throw error(table ? "TABLE_FORMAT_REQUIRED" : "EDIT_BLOCK_FORMAT_REQUIRED");
  return output;
}
function normalizeTableCells(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TABLE_ROWS) throw error("TABLE_CELLS_INVALID");
  return value.slice(0, MAX_TABLE_ROWS).map((row) => {
    if (!Array.isArray(row) || row.length > MAX_TABLE_COLUMNS) throw error("TABLE_CELLS_INVALID");
    return row.slice(0, MAX_TABLE_COLUMNS).map((cell) => {
      const text = limited(cell, MAX_TABLE_CELL_TEXT);
      if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(text)) throw error("TABLE_SENSITIVE_TEXT");
      return text;
    });
  });
}
function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (cause) { if (cause?.code === "ENOENT") return fallback; throw cause; } }
function writeJson(filePath, payload) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); const temporary = `${filePath}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, filePath); }
function allowedOrigin(req) { const origin = String(req.headers.origin || ""); return EXTENSION_ORIGINS.has(origin) ? origin : ""; }
function hasExtensionCandidate(req) {
  return EXTENSION_IDS.has(String(req.headers["x-tianyuan-extension-id"] || ""))
    || EXTENSION_ORIGINS.has(String(req.headers.origin || ""));
}
function json(res, status, payload, origin = "") { const body = JSON.stringify({ ...payload, security: { credentialsReturned: false, ...(payload.security || {}) } }); res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-allow-headers": "content-type,x-tianyuan-extension-id,x-tianyuan-extension-version,x-tianyuan-runtime-build-id,x-tianyuan-agent-provider,x-tianyuan-agent-installation,x-tianyuan-agent-credential", ...(origin ? { "access-control-allow-origin": origin } : {}) }); res.end(body); }
function fail(res, cause, origin = "") { json(res, cause?.status || 500, { ok: false, reason: cause?.code || cause?.message || String(cause) }, origin); }
function body(req, limit = 1024 * 1024) { return new Promise((resolve, reject) => { let text = ""; req.setEncoding("utf8"); req.on("data", (chunk) => { text += chunk; if (Buffer.byteLength(text, "utf8") > limit) { req.destroy(); reject(error("CONNECTOR_REQUEST_TOO_LARGE", 413)); } }); req.on("end", () => { if (!text.trim()) return resolve({}); try { resolve(JSON.parse(text)); } catch { reject(error("CONNECTOR_INVALID_JSON")); } }); req.on("error", reject); }); }

function resolveCredential(reference) {
  return platformAdapter.resolveCredentialReference(reference);
}

function createBridge(options = {}) {
  const home = os.homedir();
  const runtimeRoot = platformAdapter.runtimeRoot;
  const bindingsPath = options.bindingsPath || process.env.TIANYUAN_CONNECTOR_BINDINGS_PATH || path.join(runtimeRoot, "native-helper", "connector-bindings.json");
  const sourcesPath = options.sourcesPath || process.env.TIANYUAN_CONNECTOR_AGENT_SOURCES_PATH || path.join(runtimeRoot, "native-helper", "agent-sources.json");
  const configDir = options.configDir || process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_DIR || path.join(runtimeRoot, "agent-sources");
  const codexStatePath = options.codexStatePath || process.env.TIANYUAN_CODEX_GLOBAL_STATE_PATH || path.join(home, ".codex", ".codex-global-state.json");
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(home, ".codex");
  const projectsPath = options.projectsPath || process.env.OFFICE_CONNECTOR_PROJECTS || path.join(home, ".local", "share", "office-connector", "runtime", "config", "projects.local.json");
  const threadsPath = options.threadsPath || process.env.OFFICE_CONNECTOR_THREADS || path.join(home, ".local", "share", "office-connector", "runtime", "config", "threads.local.json");
  const processesPath = options.processesPath || path.join(codexHome, "process_manager", "chat_processes.json");
  const sqlitePath = options.sqlitePath || path.join(codexHome, "sqlite", "codex-dev.db");
  const workbuddyDbPath = options.workbuddyDbPath || process.env.TIANYUAN_WORKBUDDY_DB_PATH || path.join(home, ".workbuddy", "workbuddy.db");
  const compatibilityPath = options.compatibilityPath || process.env.TIANYUAN_CONNECTOR_RUNTIME_COMPATIBILITY_PATH || path.join(__dirname, "runtime-compat.json");
  const officeBridgeUrl = options.officeBridgeUrl || process.env.OFFICE_CONNECTOR_BRIDGE_URL || "http://127.0.0.1:40115";
  const platformUrl = process.env.TIANYUAN_CONNECTOR_PLATFORM_URL || "http://127.0.0.1:40315";
  const sessions = new Map(); const actions = new Map(); const bindings = new Map(); const sources = new Map();
  let loaded = false; let migrated = false;
  const compatibility = readJson(compatibilityPath, {
    extensionVersion: "",
    bridgeProtocol: PROTOCOL_VERSION,
    buildId: BUILD_ID,
  });

  function browserIdentity(req, required = false) {
    const extensionId = String(req.headers["x-tianyuan-extension-id"] || "");
    const extensionVersion = limited(req.headers["x-tianyuan-extension-version"], 80);
    const runtimeBuildId = limited(req.headers["x-tianyuan-runtime-build-id"], 128);
    if (!extensionId) {
      if (EXTENSION_ORIGINS.has(String(req.headers.origin || ""))) {
        if (required) throw error("EXTENSION_RELOAD_REQUIRED", 426);
        return null;
      }
      if (required) throw error("BROWSER_EXTENSION_REQUIRED", 403);
      return null;
    }
    if (!EXTENSION_IDS.has(extensionId)) {
      if (required) throw error("BROWSER_EXTENSION_REQUIRED", 403);
      return null;
    }
    const expectedVersion = limited(compatibility.extensionVersion, 80);
    if (expectedVersion && extensionVersion !== expectedVersion) {
      if (required) throw error("EXTENSION_RUNTIME_VERSION_MISMATCH", 426);
      return null;
    }
    const expectedRuntimeBuildId = limited(compatibility.runtimeBuildId, 128);
    if (expectedRuntimeBuildId && runtimeBuildId !== expectedRuntimeBuildId) {
      if (required) throw error("EXTENSION_RUNTIME_BUILD_MISMATCH", 426);
      return null;
    }
    return { extensionId, extensionVersion, runtimeBuildId };
  }
  function requireBrowser(req) { return browserIdentity(req, true); }
  function isBrowser(req) { return Boolean(browserIdentity(req, false)); }
  function sourceConnection(source) {
    const lastSeenMs = Date.parse(source.lastSeenAt || "");
    const lastSeenSecondsAgo = Number.isFinite(lastSeenMs)
      ? Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000))
      : null;
    return {
      mcpConnected: Number.isInteger(lastSeenSecondsAgo) && lastSeenSecondsAgo <= 90,
      lastSeenAt: source.lastSeenAt || null,
      lastSeenSecondsAgo,
    };
  }

  function saveSources() { writeJson(sourcesPath, { version: 1, updatedAt: now(), sources: [...sources.values()] }); }
  function loadSources() { if (sources.size) return; const payload = readJson(sourcesPath, { sources: [] }); for (const source of Array.isArray(payload.sources) ? payload.sources : []) { if (source?.providerId && source?.installationId && source?.agentId) sources.set(`${source.providerId}|${source.installationId}`, source); } }
  function sourceFor(providerId, installationId) { loadSources(); return sources.get(`${providerId}|${installationId}`) || null; }
  function requireSource(input = {}) {
    const providerId = limited(input.providerId, 80); const installationId = limited(input.installationId, 160); const source = sourceFor(providerId, installationId);
    if (!source) throw error("AGENT_NOT_REGISTERED", 403); return source;
  }
  function identity(req, required = true) {
    const providerId = limited(req.headers["x-tianyuan-agent-provider"], 80); const installationId = limited(req.headers["x-tianyuan-agent-installation"], 160); const credential = String(req.headers["x-tianyuan-agent-credential"] || "");
    if (!providerId && !installationId && !credential) { if (!required) return null; throw error("AGENT_IDENTITY_REQUIRED", 401); }
    const source = sourceFor(providerId, installationId); if (!source) throw error("AGENT_NOT_REGISTERED", 403);
    const expected = resolveCredential(source.credentialRef); if (!expected) throw error("AGENT_CREDENTIAL_UNAVAILABLE", 503);
    if (!equal(expected, credential)) throw error("AGENT_AUTH_INVALID", 403);
    source.lastSeenAt = now(); source.updatedAt = source.lastSeenAt; saveSources();
    return { agentId: source.agentId, providerId: source.providerId, installationId: source.installationId, displayName: source.displayName };
  }

  function legacyBinding(value, codexSource) {
    const createdAt = value.createdAt || now();
    return { bindingId: limited(value.bindingId || randomUUID(), 200), agentId: codexSource?.agentId || "codex", providerId: "codex", displayName: codexSource?.displayName || "Codex", installationId: codexSource?.installationId || "legacy-codex", workspaceId: limited(value.projectId, 200), workspaceName: limited(value.projectName, 200), workspacePath: normalizePath(value.projectPath), pageProjectId: limited(value.pageProjectId || String(value.pageKey || "").split("|")[0], 80), conversationId: limited(value.threadId, 200), conversationTitle: limited(value.threadTitle, 300), scope: value.scope === "project" ? "workspace" : "conversation", accessMode: value.accessMode === "read" ? "read" : "control", pageKey: limited(value.pageKey, 1200), manualBinding: false, createdAt, updatedAt: value.updatedAt || createdAt, migratedFrom: "codexBinding-v1" };
  }
  function loadBindings() {
    if (loaded) return; loaded = true; loadSources();
    const payload = readJson(bindingsPath, { bindings: [] }); const codexSource = [...sources.values()].find((entry) => entry.providerId === "codex");
    for (const item of Array.isArray(payload.bindings) ? payload.bindings : []) {
      const binding = item?.providerId ? { ...item, pageProjectId: item.pageProjectId || String(item.pageKey || "").split("|")[0] } : legacyBinding(item || {}, codexSource);
      if (!item?.providerId) migrated = true;
      if (binding.bindingId && binding.pageKey) bindings.set(binding.bindingId, binding);
    }
    if (migrated) saveBindings();
  }
  function saveBindings(source = bindings) { writeJson(bindingsPath, { version: 2, updatedAt: now(), bindings: [...source.values()] }); }
  function bindingSort(left, right) {
    if (left.accessMode !== right.accessMode) return left.accessMode === "control" ? -1 : 1;
    return String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""));
  }
  function bindingsFor(page) { loadBindings(); const key = pageKey(page); return [...bindings.values()].filter((binding) => binding.pageKey === key).sort(bindingSort); }
  function preferredBinding(entries = []) { return [...entries].sort(bindingSort)[0] || null; }
  function syncSession(session) {
    const entries = bindingsFor(session.binding); session.agentBindings = entries.map(publicBinding);
    const codex = preferredBinding(entries.filter((binding) => binding.providerId === "codex"));
    session.codexBinding = codexCompatibility(codex);
    return session;
  }
  function publicSession(session, agent = null, includeContext = true) {
    if (!session) return null; syncSession(session);
    const related = agent ? session.agentBindings.filter((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId) : session.agentBindings;
    const copy = { sessionId: session.sessionId, status: session.status, registeredAt: session.registeredAt, lastSeenAt: session.lastSeenAt, binding: session.binding, client: session.client, agentBindings: related, capabilities: session.capabilities };
    if (!agent || agent.providerId === "codex") copy.codexBinding = agent ? codexCompatibility(preferredBinding(related.filter((binding) => binding.providerId === "codex"))) : session.codexBinding;
    if (includeContext) copy.context = contextForAgent(session, preferredBinding(related));
    return copy;
  }
  function sessionForBinding(sessionId) { const session = sessions.get(sessionId); if (!session) throw error("SESSION_NOT_FOUND", 404); return session; }
  function bindingForAgent(session, agent, bindingId) {
    syncSession(session); const selected = bindings.get(String(bindingId || ""));
    if (!selected || selected.pageKey !== pageKey(session.binding) || selected.agentId !== agent.agentId || selected.providerId !== agent.providerId || selected.installationId !== agent.installationId) throw error("AGENT_BINDING_MISMATCH", 403);
    return selected;
  }
  function ensureBindingInput(session, binding, input = {}) {
    if (input.workspaceId && String(input.workspaceId) !== binding.workspaceId) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.projectId && ![binding.workspaceId, binding.pageProjectId, session.binding.projectId].filter(Boolean).includes(String(input.projectId))) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.workspacePath && normalizePath(input.workspacePath) !== normalizePath(binding.workspacePath)) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.projectPath && normalizePath(input.projectPath) !== normalizePath(binding.workspacePath)) throw error("AGENT_BINDING_MISMATCH", 403);
    const conversation = input.conversationId || input.threadId;
    if (binding.scope === "conversation" && String(conversation || "") !== binding.conversationId) throw error("AGENT_BINDING_MISMATCH", 403);
    if (conversation && binding.conversationId && String(conversation) !== binding.conversationId) throw error("AGENT_BINDING_MISMATCH", 403);
  }
  function currentController(session) { syncSession(session); const current = [...bindings.values()].filter((binding) => binding.pageKey === pageKey(session.binding) && binding.accessMode === "control").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); return current[0] || null; }
  function authorize(session, agent, input, control = false) {
    const binding = bindingForAgent(session, agent, input.bindingId); ensureBindingInput(session, binding, input);
    if (control) { if (binding.accessMode !== "control") throw error("AGENT_READ_ONLY", 403); const controller = currentController(session); if (!controller || controller.bindingId !== binding.bindingId) throw error("AGENT_CONTROL_CONFLICT", 409); }
    return binding;
  }
  function browserBinding(session, bindingId, control = false, expectedControlEpoch = "") {
    const binding = bindings.get(String(bindingId || "")); if (!binding || binding.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 403);
    if (control && (binding.accessMode !== "control" || currentController(session)?.bindingId !== binding.bindingId)) throw error("AGENT_CONTROL_CONFLICT", 409);
    if (control && expectedControlEpoch && binding.updatedAt !== expectedControlEpoch) throw error("AGENT_CONTROL_CONFLICT", 409);
    return binding;
  }
  function capabilities() { return {
    agentSourceRegistration: { supported: true, level: "routing", label: "已注册 Agent 来源" },
    agentBinding: { supported: true, level: "routing", label: "绑定 Agent 工作区或对话" },
    contextRead: { supported: true, level: "read", label: "读取当前页面上下文" },
    selectionRead: { supported: true, level: "read", label: "读取当前页面选中内容" },
    editBlockPreview: { supported: true, level: "preview", label: "编辑块预演" },
    editBlockExecute: { supported: true, level: "confirm", label: "确认后执行编辑块" },
    editBlockReadback: { supported: true, level: "read", label: "编辑块回读" },
    editBlockFormatPreview: { supported: true, level: "preview", label: "编辑块格式预演" },
    editBlockFormatExecute: { supported: true, level: "confirm", label: "确认后设置编辑块格式" },
    editBlockFormatReadback: { supported: true, level: "read", label: "编辑块格式回读" },
    editBlockHighlight: { supported: true, level: "confirm", label: "文本高亮及取消高亮" },
    tablePreview: { supported: true, level: "preview", label: "表格操作预演" },
    tableExecute: { supported: true, level: "confirm", label: "确认后执行表格操作" },
    tableReadback: { supported: true, level: "read", label: "表格回读" },
    tableCaretInsert: { supported: true, level: "confirm", label: "按光标位置插入表格" },
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
    clearAuditAttachments: { supported: true, level: "confirm", label: "确认后批量清理资料索引附件关联" },
    clearAuditTestRows: { supported: true, level: "confirm", label: "确认后清理测试数据并保存" },
    inspectAuditCheckRow: { supported: true, level: "read", label: "读取查证核对情况" },
    executeAuditCheckResult: { supported: true, level: "confirm", label: "确认后填写查证核对情况并保存" },
    scanAuditIndexCheckRows: { supported: true, level: "read", label: "批量扫描查证资料索引核查状态" },
    batchAuditCheckResult: { supported: true, level: "confirm", label: "确认后批量填写查证核对情况并保存" },
    cliExport: { supported: true, level: "local", label: "CLI 表格导出" },
    printFormat: { supported: true, level: "local", label: "本地打印格式处理" },
    genericBrowserAutomation: { supported: false, level: "unsupported", label: "任意浏览器自动操作" },
    arbitraryJavaScript: { supported: false, level: "unsupported", label: "任意 JavaScript 执行" },
  }; }
  function prune() { const instant = Date.now(); for (const [key, session] of sessions) if (instant - Date.parse(session.lastSeenAt) > 120000) sessions.delete(key); for (const [key, action] of actions) { const age = Date.parse(action.completedAt || action.createdAt); const ttl = action.completedAt ? ACTION_RESULT_TTL_MS : ACTION_TTL_MS; if (!Number.isFinite(age) || instant - age > ttl) actions.delete(key); } }
  function attachment(filePath) { const resolved = path.resolve(String(filePath || "")); if (!path.isAbsolute(String(filePath || ""))) throw error("ATTACHMENT_PATH_MUST_BE_ABSOLUTE"); const stat = fs.statSync(resolved); if (!stat.isFile()) throw error("ATTACHMENT_NOT_A_FILE"); if (stat.size <= 0) throw error("ATTACHMENT_FILE_EMPTY"); if (stat.size > MAX_ATTACHMENT_BYTES) throw error("ATTACHMENT_FILE_TOO_LARGE"); const extension = path.extname(resolved).toLowerCase(); if (!ATTACHMENT_EXTENSIONS.has(extension)) throw error("ATTACHMENT_FILE_TYPE_NOT_ALLOWED"); return { path: resolved, name: path.basename(resolved), size: stat.size, type: "application/octet-stream" }; }
  function actionIsWrite(type) {
    return ["upload_audit_attachment", "batch_upload_audit_attachments", "save_batch_upload_draft", "clear_audit_attachments", "clear_audit_test_rows", "set_audit_check_result", "batch_set_audit_check_results", "batch_save_asset_draft", "batch_exit_edit", "edit_block_execute", "edit_block_format_execute", "table_execute"].includes(type);
  }
  function normalizeBatchSubjectCode(value) {
    const subject = limited(value, 240);
    if (/^C\d+(?:-\d+)*$/.test(subject)) return subject;
    if (/^tree:(?!\s*$).+/.test(subject) || /^treepath:(?!\s*$).+/.test(subject)) return subject;
    throw error("SUBJECT_CODE_INVALID");
  }
  function normalizedSelection(value, max = 100) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, max).map((item) => typeof item === "object" && item !== null
      ? {
          value: limited(item.value, 160), id: limited(item.id, 160), code: limited(item.code, 160),
          shortName: limited(item.shortName, 200), name: limited(item.name, 200), title: limited(item.title, 240),
        }
      : limited(item, 160));
  }
  function createAction(session, agent, input) {
    const type = limited(input.action, 80);
    const allowed = new Set(["preview_batch_save", "batch_save_asset_draft", "preview_batch_exit_edit", "batch_exit_edit", "preview_audit_attachment_upload", "upload_audit_attachment", "batch_upload_audit_attachments", "save_batch_upload_draft", "inspect_audit_check_row", "set_audit_check_result", "scan_audit_index_check_rows", "batch_set_audit_check_results", "clear_audit_attachments", "clear_audit_test_rows", "edit_block_preview", "edit_block_execute", "edit_block_readback", "edit_block_format_preview", "edit_block_format_execute", "edit_block_format_readback", "table_preview", "table_execute", "table_readback"]);
    if (!allowed.has(type)) throw error("ACTION_NOT_ALLOWED");
    const binding = authorize(session, agent, input, actionIsWrite(type));
    if (session.status !== "online") throw error("SESSION_NOT_ONLINE", 409);
    const isEditBlockAction = ["edit_block_preview", "edit_block_execute", "edit_block_readback", "edit_block_format_preview", "edit_block_format_execute", "edit_block_format_readback", "table_preview", "table_execute", "table_readback"].includes(type);
    const isEditBlockFormatAction = ["edit_block_format_preview", "edit_block_format_execute"].includes(type);
    const isTableAction = ["table_preview", "table_execute", "table_readback"].includes(type);
    if (!isEditBlockAction && (!session.binding.projectId || !session.binding.companyId || session.binding.pageType !== "asset-draft")) throw error("ASSET_DRAFT_SESSION_REQUIRED", 409);
    if (isEditBlockAction) {
      if (input.sessionId && String(input.sessionId) !== session.sessionId) throw error("EDIT_BLOCK_SESSION_MISMATCH", 403);
      if (!input.projectId || !input.threadId || !Number.isInteger(Number(input.tabId)) || Number(input.tabId) !== session.binding.tabId) throw error("EDIT_BLOCK_BINDING_REQUIRED", 403);
      if (!limited(input.blockId, 500)) throw error("EDIT_BLOCK_ID_REQUIRED");
      const expectedHash = limited(input.expectedHash, 80);
      const expectedText = input.expectedText === undefined ? "" : limited(input.expectedText, MAX_EDIT_BLOCK_TEXT);
      const readOnlyBlockAction = ["edit_block_readback", "edit_block_format_readback", "table_readback"].includes(type);
      if (!readOnlyBlockAction && !isTableAction && !expectedHash && input.expectedText === undefined) throw error("EDIT_BLOCK_EXPECTED_CONTENT_REQUIRED");
      if ((expectedHash && !/^fnv1a32-[0-9a-f]{8}$/i.test(expectedHash)) || EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(expectedText)) throw error("EDIT_BLOCK_EXPECTED_CONTENT_INVALID");
      if (["edit_block_preview", "edit_block_execute"].includes(type)) {
        if (input.replacementText === undefined) throw error("EDIT_BLOCK_REPLACEMENT_REQUIRED");
        if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(limited(input.replacementText, MAX_EDIT_BLOCK_TEXT))) throw error("EDIT_BLOCK_SENSITIVE_TEXT");
      }
      if (type === "edit_block_execute") {
        if (input.confirmText !== "确认修改编辑块") throw error("EDIT_BLOCK_CONFIRM_TEXT_REQUIRED");
        const previewAction = actions.get(String(input.previewActionId || ""));
        if (!previewAction || previewAction.type !== "edit_block_preview" || previewAction.sessionId !== session.sessionId || previewAction.bindingId !== binding.bindingId || previewAction.status !== "completed" || previewAction.result?.ok !== true) throw error("EDIT_BLOCK_PREVIEW_REQUIRED", 409);
        const previewTarget = previewAction.target || {};
        if (previewTarget.blockId !== limited(input.blockId, 500) || previewTarget.tabId !== Number(input.tabId) || previewTarget.projectId !== session.binding.projectId || previewTarget.threadId !== limited(input.threadId, 200) || previewTarget.expectedHash !== expectedHash || previewTarget.expectedText !== (input.expectedText === undefined ? null : limited(input.expectedText, MAX_EDIT_BLOCK_TEXT)) || previewTarget.replacementText !== limited(input.replacementText, MAX_EDIT_BLOCK_TEXT)) throw error("EDIT_BLOCK_PREVIEW_MISMATCH", 409);
      }
      if (isEditBlockFormatAction) {
        const format = normalizeFormat(input.format);
        if (type === "edit_block_format_execute") {
          if (input.confirmText !== "确认设置编辑格式") throw error("EDIT_BLOCK_FORMAT_CONFIRM_TEXT_REQUIRED");
          const previewAction = actions.get(String(input.previewActionId || ""));
          if (!previewAction || previewAction.type !== "edit_block_format_preview" || previewAction.sessionId !== session.sessionId || previewAction.bindingId !== binding.bindingId || previewAction.status !== "completed" || previewAction.result?.ok !== true) throw error("EDIT_BLOCK_FORMAT_PREVIEW_REQUIRED", 409);
          const previewTarget = previewAction.target || {};
          if (previewTarget.blockId !== limited(input.blockId, 500) || previewTarget.tabId !== Number(input.tabId) || previewTarget.projectId !== session.binding.projectId || previewTarget.threadId !== limited(input.threadId, 200) || previewTarget.expectedHash !== expectedHash || previewTarget.expectedText !== (input.expectedText === undefined ? null : limited(input.expectedText, MAX_EDIT_BLOCK_TEXT)) || !sameJson(previewTarget.format, format)) throw error("EDIT_BLOCK_FORMAT_PREVIEW_MISMATCH", 409);
        }
      }
      if (isTableAction) {
        const tableAction = limited(input.tableAction, 40);
        const caretReference = input.caretReference === undefined ? null : safeCaretReference(input.caretReference);
        if (input.caretReference !== undefined && !caretReference) throw error("TABLE_CARET_REFERENCE_INVALID");
        if (tableAction === "insert" && caretReference && !limited(input.expectedHash, 80)) throw error("TABLE_CARET_HASH_REQUIRED");
        if (!["insert", "update_cell", "format"].includes(tableAction) && type !== "table_readback") throw error("TABLE_ACTION_INVALID");
        if (!limited(input.blockId, 500)) throw error("EDIT_BLOCK_ID_REQUIRED");
        if (type === "table_readback") {
          if (!limited(input.tableId, 500)) throw error("TABLE_ID_REQUIRED");
          if (input.expectedTableHash && !/^fnv1a32-[0-9a-f]{8}$/i.test(String(input.expectedTableHash))) throw error("TABLE_EXPECTED_HASH_INVALID");
        } else if (tableAction === "insert") {
          const cells = normalizeTableCells(input.cells);
          const rowCount = Number(input.rowCount || cells.length);
          const columnCount = Number(input.columnCount || Math.max(0, ...cells.map((row) => row.length)));
          if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > MAX_TABLE_ROWS) throw error("TABLE_ROW_COUNT_INVALID");
          if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > MAX_TABLE_COLUMNS) throw error("TABLE_COLUMN_COUNT_INVALID");
          if (input.tableFormat !== undefined) normalizeFormat(input.tableFormat, true);
        } else {
          if (!limited(input.tableId, 500)) throw error("TABLE_ID_REQUIRED");
          if (!input.expectedTableHash || !/^fnv1a32-[0-9a-f]{8}$/i.test(String(input.expectedTableHash))) throw error("TABLE_EXPECTED_HASH_REQUIRED");
          const rowIndex = Number(input.rowIndex);
          if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= MAX_TABLE_ROWS) throw error("TABLE_ROW_INDEX_INVALID");
          if (tableAction === "update_cell") {
            const columnIndex = Number(input.columnIndex);
            if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= MAX_TABLE_COLUMNS) throw error("TABLE_COLUMN_INDEX_INVALID");
            if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(limited(input.cellText, MAX_TABLE_CELL_TEXT))) throw error("TABLE_SENSITIVE_TEXT");
          } else {
            normalizeFormat(input.tableFormat, true);
            if (!["table", "row", "cell"].includes(input.formatScope || "table")) throw error("TABLE_FORMAT_SCOPE_INVALID");
            if ((input.formatScope === "cell") && (!Number.isInteger(Number(input.columnIndex)) || Number(input.columnIndex) < 0 || Number(input.columnIndex) >= MAX_TABLE_COLUMNS)) throw error("TABLE_COLUMN_INDEX_INVALID");
          }
        }
        if (type === "table_execute") {
          if (input.confirmText !== "确认执行表格操作") throw error("TABLE_CONFIRM_TEXT_REQUIRED");
          const previewAction = actions.get(String(input.previewActionId || ""));
          if (!previewAction || previewAction.type !== "table_preview" || previewAction.sessionId !== session.sessionId || previewAction.bindingId !== binding.bindingId || previewAction.status !== "completed" || previewAction.result?.ok !== true) throw error("TABLE_PREVIEW_REQUIRED", 409);
          const previewTarget = previewAction.target || {};
          const expectedTableHash = input.expectedTableHash ? String(input.expectedTableHash) : null;
          if (previewTarget.blockId !== limited(input.blockId, 500) || previewTarget.tabId !== Number(input.tabId) || previewTarget.projectId !== session.binding.projectId || previewTarget.threadId !== limited(input.threadId, 200) || previewTarget.tableAction !== limited(input.tableAction, 40) || previewTarget.tableId !== limited(input.tableId, 500) || previewTarget.expectedHash !== limited(input.expectedHash, 80) || previewTarget.caretReference?.domPath !== caretReference?.domPath || previewTarget.caretReference?.textOffset !== caretReference?.textOffset || previewTarget.caretReference?.containerPath !== caretReference?.containerPath || previewTarget.expectedTableHash !== expectedTableHash || previewTarget.rowIndex !== (input.rowIndex === undefined ? null : Number(input.rowIndex)) || previewTarget.columnIndex !== (input.columnIndex === undefined ? null : Number(input.columnIndex)) || previewTarget.cellText !== (input.cellText === undefined ? null : limited(input.cellText, MAX_TABLE_CELL_TEXT)) || !sameJson(previewTarget.tableFormat, input.tableFormat === undefined ? null : normalizeFormat(input.tableFormat, true))) throw error("TABLE_PREVIEW_MISMATCH", 409);
        }
      }
    }
    const isBatchSubjectAction = ["preview_batch_save", "batch_save_asset_draft", "preview_batch_exit_edit", "batch_exit_edit"].includes(type);
    const isBatchPageAction = isBatchSubjectAction;
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers.map(Number).filter((row) => Number.isInteger(row) && row >= 2 && row <= 100000) : [];
    const rowNumber = Number(input.rowNumber);
    if (!isEditBlockAction && !isBatchPageAction && !rowNumbers.length && !["scan_audit_index_check_rows"].includes(type) && (!Number.isInteger(rowNumber) || rowNumber < 2)) throw error("ROW_NUMBER_INVALID");
    const subjectCode = limited(input.subjectCode === "current" ? "" : input.subjectCode || session.binding.subjectCode, 120);
    if (subjectCode && !/^C\d+(?:-\d+)*$/.test(subjectCode)) throw error("SUBJECT_CODE_INVALID");
    const subjectCodes = isBatchSubjectAction
      ? (Array.isArray(input.subjectCodes) ? input.subjectCodes.map(normalizeBatchSubjectCode) : [])
      : [];
    if (isBatchSubjectAction && (!subjectCodes.length || subjectCodes.length > 100)) throw error(subjectCodes.length > 100 ? "SUBJECT_CODES_TOO_MANY" : "SUBJECT_CODES_REQUIRED");
    const companyScope = limited(input.companyScope || "current", 20);
    if (!["current", "partial", "all"].includes(companyScope)) throw error("COMPANY_SCOPE_INVALID");
    if (["batch_save_asset_draft", "batch_exit_edit"].includes(type)) {
      const expected = type === "batch_save_asset_draft" ? "确认批量保存" : "确认批量退出编辑";
      if (input.confirmText !== expected) throw error(type === "batch_save_asset_draft" ? "BATCH_SAVE_CONFIRM_TEXT_REQUIRED" : "BATCH_EXIT_CONFIRM_TEXT_REQUIRED");
    }
    if (["upload_audit_attachment", "batch_upload_audit_attachments", "save_batch_upload_draft"].includes(type) && input.confirmText !== (type === "upload_audit_attachment" ? "确认上传并保存" : "确认批量上传并保存")) throw error("UPLOAD_CONFIRM_TEXT_REQUIRED");
    if (type === "clear_audit_test_rows" && input.confirmText !== "确认清理测试数据并保存") throw error("CLEAR_TEST_DATA_CONFIRM_TEXT_REQUIRED");
    if (type === "clear_audit_attachments" && input.confirmText !== "确认批量清理附件并保存") throw error("CLEAR_ATTACHMENTS_CONFIRM_TEXT_REQUIRED");
    if (type === "set_audit_check_result" && input.confirmText !== "确认填写核对情况并保存") throw error("AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    if (type === "batch_set_audit_check_results" && input.confirmText !== "确认批量填写核对情况并保存") throw error("BATCH_AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    const expectedIndexValues = (Array.isArray(input.expectedIndexValues) ? input.expectedIndexValues : [])
      .map((item) => item && typeof item === "object"
        ? { rowNumber: Number(item.rowNumber), value: limited(item.value, 120) }
        : { rowNumber: 0, value: limited(item, 120) })
      .filter((item) => item.value && (item.rowNumber === 0 || (Number.isInteger(item.rowNumber) && item.rowNumber >= 2)));
    const expectedCleanupValues = (Array.isArray(input.expectedCleanupValues) ? input.expectedCleanupValues : [])
      .map((item) => ({
        rowNumber: Number(item?.rowNumber),
        indexValue: limited(item?.indexValue, 120),
        procedureValue: limited(item?.procedureValue, 200),
      }))
      .filter((item) => Number.isInteger(item.rowNumber) && item.rowNumber >= 2);
    const file = type === "upload_audit_attachment" ? attachment(input.filePath) : null;
    const files = type === "batch_upload_audit_attachments"
      ? (Array.isArray(input.files) ? input.files : []).slice(0, 20).map((item) => ({
          ...attachment(item?.filePath),
          moduleName: limited(item?.moduleName, 80),
          moduleIndex: Number.isInteger(item?.moduleIndex) ? item.moduleIndex : Number(item?.moduleIndex || 0),
        }))
      : [];
    if (type === "batch_upload_audit_attachments" && !files.length) throw error("BATCH_UPLOAD_FILES_REQUIRED");
    const caretReference = isTableAction && input.caretReference !== undefined ? safeCaretReference(input.caretReference) : null;
    const action = { actionId: id("action"), sessionId: session.sessionId, bindingId: binding.bindingId, agentId: agent.agentId, providerId: agent.providerId, installationId: agent.installationId, controlEpoch: binding.updatedAt, type, status: "queued", target: { projectId: session.binding.projectId, companyId: session.binding.companyId, threadId: isEditBlockAction ? limited(input.threadId || binding.conversationId, 200) : "", subjectCode, subjectCodes, companyScope, companyFilters: normalizedSelection(input.companyFilters), selectedCompanies: normalizedSelection(input.selectedCompanies), companyValues: normalizedSelection(input.companyValues), mode: ["batch_save_asset_draft", "batch_exit_edit"].includes(type) ? "execute" : "dry_run", rowNumber: rowNumbers.length ? 0 : rowNumber, rowNumbers, expectedIndexValues, expectedCleanupValues, fieldTitle: limited(input.fieldTitle || (type.includes("check") ? "查证核对情况" : "查证资料索引"), 80), fieldColumn: Number.isInteger(input.fieldColumn) ? input.fieldColumn : null, sheetName: limited(input.sheetName, 200), resultText: limited(input.resultText, 80), procedureText: limited(input.procedureText, 80), moduleName: limited(input.moduleName, 80), moduleIndex: Number.isInteger(input.moduleIndex) ? input.moduleIndex : 0, deferSave: Boolean(input.deferSave), maxRows: Math.max(2, Math.min(Number(input.maxRows || 500), 5000)), tabId: isEditBlockAction ? Number(input.tabId) : null, blockId: isEditBlockAction ? limited(input.blockId, 500) : "", expectedHash: isEditBlockAction ? limited(input.expectedHash, 80) : "", expectedText: isEditBlockAction && input.expectedText !== undefined ? limited(input.expectedText, MAX_EDIT_BLOCK_TEXT) : null, replacementText: isEditBlockAction && input.replacementText !== undefined ? limited(input.replacementText, MAX_EDIT_BLOCK_TEXT) : "", previewActionId: isEditBlockAction ? limited(input.previewActionId, 200) : "", format: isEditBlockFormatAction ? normalizeFormat(input.format) : null, tableAction: isTableAction && type !== "table_readback" ? limited(input.tableAction, 40) : "", tableId: isTableAction ? limited(input.tableId, 500) : "", caretReference, expectedTableHash: isTableAction && input.expectedTableHash ? limited(input.expectedTableHash, 80) : null, rowIndex: isTableAction && input.rowIndex !== undefined ? Number(input.rowIndex) : null, columnIndex: isTableAction && input.columnIndex !== undefined ? Number(input.columnIndex) : null, cellText: isTableAction && input.cellText !== undefined ? limited(input.cellText, MAX_TABLE_CELL_TEXT) : null, rowCount: isTableAction && input.rowCount !== undefined ? Number(input.rowCount) : null, columnCount: isTableAction && input.columnCount !== undefined ? Number(input.columnCount) : null, cells: isTableAction && type !== "table_readback" ? normalizeTableCells(input.cells) : [], tableFormat: isTableAction && input.tableFormat !== undefined ? normalizeFormat(input.tableFormat, true) : null, formatScope: isTableAction ? limited(input.formatScope || "table", 20) : "" }, file, files, confirmText: limited(input.confirmText, 80), createdAt: now() }; actions.set(action.actionId, action); return action;
  }
  function publicAction(action) { return action ? { actionId: action.actionId, sessionId: action.sessionId, bindingId: action.bindingId, type: action.type, status: action.status, controlEpoch: action.controlEpoch, target: action.target, file: action.file ? { name: action.file.name, size: action.file.size, type: action.file.type } : null, files: (action.files || []).map((item) => ({ name: item.name, size: item.size, type: item.type, moduleName: item.moduleName, moduleIndex: item.moduleIndex })), createdAt: action.createdAt, claimedAt: action.claimedAt || null, completedAt: action.completedAt || null, cancellationReason: action.cancellationReason || null, result: action.result || null } : null; }

  function cancelControllerActions(bindingId) { for (const action of actions.values()) if (action.bindingId === bindingId && ["queued", "claimed", "running"].includes(action.status)) { action.status = "cancelled"; action.cancellationReason = "AGENT_CONTROL_REVOKED"; action.completedAt = now(); } }
  function sameAgentBinding(binding, source) {
    return binding?.agentId === source.agentId
      && binding?.providerId === source.providerId
      && binding?.installationId === source.installationId;
  }
  function createBinding(session, input) {
    const source = requireSource(input);
    const pageBindings = bindingsFor(session.binding);
    const requestedBindingId = String(input.bindingId || "").trim();
    const explicit = requestedBindingId ? bindings.get(requestedBindingId) : null;
    if (requestedBindingId && (!explicit || explicit.pageKey !== pageKey(session.binding) || !sameAgentBinding(explicit, source))) {
      throw error("AGENT_BINDING_MISMATCH", 403);
    }
    const previous = explicit || preferredBinding(pageBindings.filter((entry) => sameAgentBinding(entry, source)));
    const scope = input.scope === "workspace" || input.scope === "project" ? "workspace" : "conversation";
    const accessMode = input.accessMode === "control" ? "control" : "read";
    const binding = {
      bindingId: limited(previous?.bindingId || requestedBindingId || randomUUID(), 200),
      agentId: source.agentId,
      providerId: source.providerId,
      displayName: limited(input.displayName || source.displayName, 120),
      installationId: source.installationId,
      workspaceId: limited(input.workspaceId ?? input.projectId ?? previous?.workspaceId, 200),
      workspaceName: limited(input.workspaceName ?? input.projectName ?? previous?.workspaceName, 200),
      workspacePath: normalizePath(input.workspacePath ?? input.projectPath ?? previous?.workspacePath),
      conversationId: scope === "workspace" ? "" : limited(input.conversationId ?? input.threadId ?? previous?.conversationId, 200),
      conversationTitle: scope === "workspace" ? "" : limited(input.conversationTitle ?? input.threadTitle ?? previous?.conversationTitle, 300),
      scope,
      accessMode,
      pageProjectId: limited(input.pageProjectId || input.tianyuanProjectId || session.binding.projectId, 80),
      pageKey: pageKey(session.binding),
      manualBinding: Boolean(input.manualBinding || source.manual),
      createdAt: previous?.createdAt || now(),
      updatedAt: now(),
    };
    if (!binding.workspaceId && !binding.conversationId) throw error("AGENT_WORKSPACE_OR_CONVERSATION_REQUIRED");
    if (scope === "conversation" && !binding.conversationId) throw error("AGENT_CONVERSATION_BINDING_REQUIRED");
    const controller = currentController(session);
    const next = new Map(bindings);
    const cancelledBindingIds = new Set();
    for (const entry of pageBindings) {
      if (entry.bindingId !== binding.bindingId && sameAgentBinding(entry, source)) {
        next.delete(entry.bindingId);
        cancelledBindingIds.add(entry.bindingId);
      }
    }
    if (accessMode === "control" && controller && controller.bindingId !== binding.bindingId) {
      if (input.confirmControlTransfer !== "确认切换控制权") throw error("CONTROL_TRANSFER_CONFIRMATION_REQUIRED", 409);
      next.set(controller.bindingId, { ...controller, accessMode: "read", updatedAt: now() });
      cancelledBindingIds.add(controller.bindingId);
    }
    next.set(binding.bindingId, binding);
    saveBindings(next);
    bindings.clear();
    for (const [key, value] of next) bindings.set(key, value);
    for (const bindingId of cancelledBindingIds) cancelControllerActions(bindingId);
    syncSession(session);
    return binding;
  }
  function createCredentialRef(providerId, installationId) {
    const service = `com.tianyuan.workbench.agent.${providerId}.${installationId}`;
    const account = "connector-bridge";
    const secret = randomBytes(32).toString("base64url");
    const credentialPath = path.join(path.dirname(sourcesPath), "agent-credentials.json");
    const key = `${providerId}-${installationId}`;
    return platformAdapter.createCredentialReference({
      service,
      account,
      fallbackPath: credentialPath,
      key,
      secret,
    });
  }
  function manualSource(input) {
    const providerId = limited(input.providerId || "workbuddy", 80).toLowerCase(); if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(providerId)) throw error("AGENT_PROVIDER_ID_INVALID");
    const installationId = limited(input.installationId || `manual-${randomUUID()}`, 160); const key = `${providerId}|${installationId}`; if (sources.has(key)) throw error("AGENT_SOURCE_ALREADY_REGISTERED", 409);
    const source = { agentId: limited(input.agentId || `${providerId}-${randomUUID()}`, 160), providerId, displayName: limited(input.displayName || providerId, 120), installationId, credentialRef: createCredentialRef(providerId, installationId), manual: true, createdAt: now(), updatedAt: now(), lastSeenAt: null };
    sources.set(key, source); saveSources(); fs.mkdirSync(configDir, { recursive: true, mode: 0o700 }); const configPath = path.join(configDir, `${providerId}-${installationId}.json`); writeJson(configPath, { providerId, installationId, credentialRef: source.credentialRef }); return { source, configPath };
  }
  function localScriptSource(extensionId) {
    const providerId = "tianyuan-local-script";
    const installationId = `extension-${limited(extensionId, 120)}`;
    const key = `${providerId}|${installationId}`;
    const existing = sources.get(key);
    const timestamp = now();
    const source = {
      agentId: existing?.agentId || `local-script-${limited(extensionId, 120)}`,
      providerId,
      displayName: "天源工作台本机脚本",
      installationId,
      local: true,
      manual: false,
      credentialRef: "extension-bound",
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      lastSeenAt: timestamp,
    };
    sources.set(key, source);
    saveSources();
    return source;
  }
  async function codexCatalog() {
    try {
      const response = await fetch(`${platformUrl}/api/catalog`);
      const payload = await response.json();
      if (response.ok && payload?.ok && (payload.projects?.length || payload.threads?.length)) {
        return filterRetainedCatalog({
          projects: Array.isArray(payload.projects) ? payload.projects : [],
          threads: Array.isArray(payload.threads) ? payload.threads : [],
          updatedAt: payload.updatedAt || null,
          source: "connector-platform",
          diagnostics: payload.diagnostics || null,
        }, { projectsPath, threadsPath });
      }
    } catch {
      // Fall through to the Connector Suite bridge.
    }
    try {
      const [projectsResponse, threadsResponse] = await Promise.all([
        fetch(`${officeBridgeUrl}/api/projects`),
        fetch(`${officeBridgeUrl}/api/threads`),
      ]);
      const projectsPayload = await projectsResponse.json();
      const threadsPayload = await threadsResponse.json();
      if (projectsResponse.ok && threadsResponse.ok && projectsPayload?.ok && threadsPayload?.ok
        && (projectsPayload.projects?.length || threadsPayload.threads?.length)) {
        return filterRetainedCatalog({
          projects: Array.isArray(projectsPayload.projects) ? projectsPayload.projects : [],
          threads: Array.isArray(threadsPayload.threads) ? threadsPayload.threads : [],
          updatedAt: new Date().toISOString(),
          source: "connector-suite-bridge",
          diagnostics: {
            projects: projectsPayload.diagnostics || null,
            threads: threadsPayload.diagnostics || null,
          },
        }, { projectsPath, threadsPath });
      }
    } catch {
      // Fall through to the same local metadata sources used by Connector Suite.
    }
    return filterRetainedCatalog(readCodexCatalog({
      codexHome,
      codexStatePath,
      projectsPath,
      threadsPath,
      processesPath,
      sqlitePath,
    }), { projectsPath, threadsPath });
  }

  function sqliteRows(query) {
    if (!fs.existsSync(workbuddyDbPath)) throw error("WORKBUDDY_CATALOG_UNAVAILABLE", 503);
    try {
      const output = execFileSync("sqlite3", ["-json", workbuddyDbPath, query], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return output ? JSON.parse(output) : [];
    } catch {
      throw error("WORKBUDDY_CATALOG_UNAVAILABLE", 503);
    }
  }

  async function workbuddyCatalog() {
    const workspaces = sqliteRows("SELECT path, last_opened_at FROM workspaces ORDER BY last_opened_at DESC LIMIT 100;");
    const sessions = sqliteRows("SELECT id, cwd, COALESCE(NULLIF(custom_title, ''), NULLIF(title, ''), '') AS title, status, created_at, updated_at, last_activity_at, project_id FROM sessions WHERE deleted_at IS NULL ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC LIMIT 200;");
    const projects = new Map();
    const addProject = (input = {}) => {
      const projectPath = normalizePath(input.path || input.cwd);
      const explicitId = limited(input.projectId, 200);
      const projectId = explicitId || (projectPath ? `workbuddy-workspace:${projectPath}` : "");
      if (!projectId) return null;
      const projectName = limited(input.projectName || path.basename(projectPath) || projectId, 200);
      const previous = projects.get(projectId);
      const project = {
        projectId,
        projectName,
        projectPath,
        path: projectPath,
        updatedAt: Number(input.updatedAt || previous?.updatedAt || 0) || null,
        source: explicitId ? "workbuddy-db" : "workbuddy-derived-local",
      };
      projects.set(projectId, project);
      return project;
    };

    for (const workspace of workspaces) {
      addProject({ path: workspace?.path, updatedAt: workspace?.last_opened_at });
    }

    const threads = sessions.map((session) => {
      const project = addProject({
        projectId: session?.project_id,
        cwd: session?.cwd,
        updatedAt: session?.last_activity_at || session?.updated_at || session?.created_at,
      });
      if (!session?.id || !project) return null;
      return {
        threadId: limited(session.id, 200),
        title: limited(session.title || `WorkBuddy 对话 ${String(session.id).slice(0, 8)}`, 300),
        projectId: project.projectId,
        projectName: project.projectName,
        projectPath: project.projectPath,
        cwd: project.projectPath,
        status: limited(session.status, 80),
        recencyAt: Number(session.last_activity_at || session.updated_at || session.created_at || 0) || null,
        source: "workbuddy-db",
      };
    }).filter(Boolean);

    return {
      projects: [...projects.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
      threads,
      updatedAt: now(),
      source: "workbuddy-local-db",
    };
  }

  async function agentCatalog(providerId = "codex") {
    return providerId === "workbuddy" ? workbuddyCatalog() : codexCatalog();
  }

  async function handle(req, res) {
    const origin = allowedOrigin(req); const suppliedOrigin = String(req.headers.origin || ""); if (suppliedOrigin && !origin) return fail(res, error("CONNECTOR_ORIGIN_FORBIDDEN", 403)); if (req.method === "OPTIONS") return json(res, 204, { ok: true }, origin); prune(); loadBindings(); const url = new URL(req.url, "http://127.0.0.1"); const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "tianyuan-connector-bridge", pid: process.pid, protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID, runtimeCompatibility: compatibility, adapter: "tianyuan-browser", mode: "local", sessionCount: sessions.size, bindingCount: bindings.size, agentSourceCount: sources.size }, origin);
      if (req.method === "GET" && url.pathname === "/api/protocol") return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID, runtimeCompatibility: compatibility, adapter: "tianyuan-browser", capabilities: capabilities(), safety: { genericBrowserAutomation: false, arbitraryJavaScript: false, editLockRequired: true, explicitConfirmationRequired: true, agentBindingRequired: true, singleControlAgentPerPage: true, credentialsStored: false } }, origin);
      if (req.method === "POST" && url.pathname === "/api/agent-sources/register") { const agent = identity(req, true); return json(res, 200, { ok: true, agentIdentity: agent }, origin); }
      if (req.method === "POST" && url.pathname === "/api/agent-sources/local") { const browser = requireBrowser(req); return json(res, 200, { ok: true, source: publicSource(localScriptSource(browser.extensionId)) }, origin); }
      if (req.method === "GET" && url.pathname === "/api/agent-sources") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); return json(res, 200, { ok: true, sources: [...sources.values()].map((source) => ({ ...publicSource(source), connection: sourceConnection(source) })) }, origin); }
      if (req.method === "POST" && url.pathname === "/api/agent-sources/manual") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const created = manualSource(await body(req)); return json(res, 200, { ok: true, source: publicSource(created.source), workbuddyConfig: { transport: "stdio", command: "node", args: ["~/plugins/tianyuan-browser-connector/runtime/apps/mcp/server.mjs"], env: { TIANYUAN_CONNECTOR_BRIDGE_URL: "http://127.0.0.1:40415", TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH: created.configPath } } }, origin); }
      if (req.method === "GET" && url.pathname === "/api/catalog") { requireBrowser(req); const providerId = limited(url.searchParams.get("providerId") || "codex", 80).toLowerCase(); if (!["codex", "workbuddy"].includes(providerId)) throw error("AGENT_PROVIDER_UNSUPPORTED", 400); return json(res, 200, { ok: true, providerId, ...(await agentCatalog(providerId)) }, origin); }
      if (req.method === "POST" && url.pathname === "/api/sessions/register") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const input = await body(req); const sessionId = limited(input.sessionId || id("tianyuan"), 200); const existing = sessions.get(sessionId); const session = { sessionId, status: "online", registeredAt: existing?.registeredAt || now(), lastSeenAt: now(), binding: safePage(input.binding), client: safeClient(input.client), context: safeContext(input.context), capabilities: capabilities() }; sessions.set(sessionId, session); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "GET" && url.pathname === "/api/sessions") { const agent = isBrowser(req) ? null : identity(req, true); const result = [...sessions.values()].filter((session) => !agent || bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)).map((session) => publicSession(session, agent)); return json(res, 200, { ok: true, sessions: result }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "heartbeat") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); session.lastSeenAt = now(); if (input.binding) session.binding = safePage(input.binding); if (input.context) session.context = safeContext(input.context); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = createBinding(session, await body(req)); return json(res, 200, { ok: true, binding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "DELETE" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = bindings.get(parts[4]); if (!binding || binding.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 404); bindings.delete(binding.bindingId); cancelControllerActions(binding.bindingId); saveBindings(); syncSession(session); return json(res, 200, { ok: true, cleared: true, bindingId: binding.bindingId, session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings" && parts[5] === "access") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const previous = bindings.get(parts[4]); if (!previous || previous.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 404); const changed = createBinding(session, { ...previous, ...input, bindingId: previous.bindingId, providerId: previous.providerId, installationId: previous.installationId, agentId: previous.agentId }); return json(res, 200, { ok: true, binding: publicBinding(changed), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { ...input, providerId: "codex", installationId: source.installationId, agentId: source.agentId, workspaceId: input.projectId, workspaceName: input.projectName, workspacePath: input.projectPath, conversationId: input.threadId, conversationTitle: input.threadTitle, scope: input.scope === "project" ? "workspace" : "conversation", accessMode: input.accessMode || "control", confirmControlTransfer: input.confirmControlTransfer }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding" && parts[4] === "current-thread") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const catalog = await codexCatalog(); const candidate = catalog.threads.find((thread) => (input.projectId && thread.projectId === input.projectId) || (input.projectPath && normalizePath(thread.projectPath) === normalizePath(input.projectPath))) || null; if (!candidate) throw error("CURRENT_THREAD_NOT_FOUND", 404); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { providerId: "codex", installationId: source.installationId, workspaceId: candidate.projectId, workspaceName: candidate.projectName, workspacePath: candidate.projectPath, conversationId: candidate.threadId, conversationTitle: candidate.title, scope: "conversation", accessMode: "control", confirmControlTransfer: input.confirmControlTransfer }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), thread: candidate, session: publicSession(session) }, origin); }
      if (req.method === "DELETE" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const target = bindingsFor(session.binding).find((binding) => binding.providerId === "codex"); if (target) { bindings.delete(target.bindingId); cancelControllerActions(target.bindingId); saveBindings(); } return json(res, 200, { ok: true, cleared: Boolean(target), session: publicSession(session) }, origin); }
      if (parts.length === 3 && parts[0] === "api" && parts[1] === "sessions" && req.method === "GET") { const session = sessionForBinding(parts[2]); const agent = isBrowser(req) ? null : identity(req, true); if (agent && !bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)) throw error("AGENT_BINDING_MISMATCH", 403); return json(res, 200, { ok: true, session: publicSession(session, agent) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = createAction(session, agent, await body(req)); return json(res, 200, { ok: true, action: publicAction(action), security: { fileContentsReturned: false } }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "ui-actions") { requireBrowser(req); const session = sessionForBinding(parts[2]); const controller = currentController(session); if (!controller) throw error("AGENT_CONTROL_CONFLICT", 409); const input = await body(req); const agent = { agentId: controller.agentId, providerId: controller.providerId, installationId: controller.installationId, displayName: controller.displayName }; const action = createAction(session, agent, { ...input, bindingId: controller.bindingId, projectId: input.projectId || controller.workspaceId, threadId: input.threadId || controller.conversationId }); return json(res, 200, { ok: true, action: publicAction(action), security: { fileContentsReturned: false } }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[4] === "next") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = browserBinding(session, url.searchParams.get("bindingId"), false); const action = [...actions.values()].filter((item) => item.sessionId === session.sessionId && item.bindingId === binding.bindingId && item.status === "queued").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null; if (!action) return json(res, 200, { ok: true, action: null }, origin); if (actionIsWrite(action.type)) browserBinding(session, binding.bindingId, true, action.controlEpoch); action.status = "claimed"; action.claimedAt = now(); const file = action.file ? { name: action.file.name, size: action.file.size, type: action.file.type, base64: fs.readFileSync(action.file.path).toString("base64") } : null; const files = (action.files || []).map((item) => ({ name: item.name, size: item.size, type: item.type, moduleName: item.moduleName, moduleIndex: item.moduleIndex, base64: fs.readFileSync(item.path).toString("base64") })); return json(res, 200, { ok: true, action: { ...publicAction(action), payload: { sessionId: action.sessionId, bindingId: action.bindingId, agentId: action.agentId, providerId: action.providerId, installationId: action.installationId, controlEpoch: action.controlEpoch, action: action.type, ...action.target, confirmText: action.confirmText, file, files } }, security: { filePathReturned: false, fileContentsEphemeral: Boolean(file || files.length) } }, origin); }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[5] === "result") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const action = actions.get(parts[4]); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); browserBinding(session, input.bindingId, actionIsWrite(action.type), action.controlEpoch); if (action.status === "cancelled") throw error("AGENT_CONTROL_REVOKED", 409); if (!["claimed", "running"].includes(action.status)) throw error("ACTION_NOT_CLAIMED", 409); action.result = input.result && typeof input.result === "object" ? input.result : {}; action.status = action.result.ok ? "completed" : "failed"; action.completedAt = now(); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "ui-actions") { requireBrowser(req); const session = sessionForBinding(parts[2]); const action = actions.get(parts[4]); const controller = currentController(session); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); if (!controller || action.bindingId !== controller.bindingId) throw error("AGENT_CONTROL_CONFLICT", 409); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = actions.get(parts[4]); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); authorize(session, agent, { bindingId: action.bindingId, workspaceId: url.searchParams.get("workspaceId") || "", projectId: url.searchParams.get("projectId") || "", conversationId: url.searchParams.get("conversationId") || "", threadId: url.searchParams.get("threadId") || "" }, actionIsWrite(action.type)); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      throw error("NOT_FOUND", 404);
    } catch (cause) { return fail(res, cause, origin); }
  }
  return { async start(port) { const server = createServer((req, res) => { handle(req, res).catch((cause) => fail(res, cause)); }); await new Promise((resolve) => server.listen(Number(port || 40415), "127.0.0.1", resolve)); return server; }, handle, paths: { bindingsPath, sourcesPath, configDir, workbuddyDbPath } };
}

async function health(port = 40415) { try { const response = await fetch(`http://127.0.0.1:${Number(port)}/health`); return response.ok ? await response.json() : { ok: false, reason: `CONNECTOR_HTTP_${response.status}` }; } catch { return { ok: false, reason: "CONNECTOR_NOT_RUNNING" }; } }
async function start(options = {}) { const bridge = createBridge(options); const port = Number(options.port || process.env.TIANYUAN_CONNECTOR_PORT || 40415); const server = await bridge.start(port); process.stdout.write(`Tianyuan connector bridge listening on http://127.0.0.1:${port}\n`); return { bridge, server }; }
module.exports = { BUILD_ID, PROTOCOL_VERSION, createBridge, health, start };
