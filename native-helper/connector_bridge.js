"use strict";

const { execFileSync } = require("node:child_process");
const { createServer } = require("node:http");
const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPlatformAdapter } = require("./platform/index.js");
const { filterRetainedCatalog, readCodexCatalog } = require("./codex_catalog.js");
const { saveReportSnapshot, saveReportTreeSnapshot, readReportSnapshot, readReportTreeSnapshot } = require("./report-snapshot.js");
const { hasReportPending, orphanReportSaveActionId, markReportPending, clearReportPendingAfterNoWrite, stageReportPending, readReportStage, claimReportStageSave, stageLegacyAppend, recordReportSaveDocument, verifyReportSavedAfterReload, claimReportReload, stageOrphanReportSave, recordReportSettingsStage, canReopenReportSettings, readReportSettingsStage, recordReportReloadRequested, archiveReportPendingAfterSettingsOpen, archiveReportPendingAfterSettingsReadback } = require("./report-pending.js");
const { stageReportStructurePending, readCurrentReportStructureStage, readCurrentReportStructurePartialStage, claimReportStructureReload, recordReportStructureReloadRequested, archiveReportStructureAfterReloadReadback, archiveReportStructurePartialAfterReadback } = require("./report-structure-pending.js");

const RUNTIME_CONFIG_PATH = process.env.TIANYUAN_RUNTIME_CONFIG_PATH
  || path.join(__dirname, "runtime-config.json");

function readRuntimeConfig(configPath = RUNTIME_CONFIG_PATH) {
  try {
    const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const runtimeConfig = readRuntimeConfig();
const platformAdapter = createPlatformAdapter({
  runtimeConfig,
  runtimeConfigPath: RUNTIME_CONFIG_PATH,
});

const PROTOCOL_VERSION = "connector-agent-binding-v3";
const BUILD_ID = "2026-07-24-browser-contract-v2-capability-matrix";
const ACTION_TTL_MS = 5 * 60 * 1000;
const ACTION_RESULT_TTL_MS = 15 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".zip", ".rar"]);
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
const REPORT_CONTROL_ACTIONS = ["report_inspect", "report_navigate", "report_node_read", "report_preview", "report_readback", "report_editor_open", "report_editor_close", "report_reload"];
const REPORT_WRITE_ACTIONS = ["report_execute", "report_save", "report_editor_command", "report_editor_save"];
const REPORT_UI_CONTROL_ACTIONS = ["report_navigate", "report_editor_open", "report_editor_close", "report_reload"];
const REPORT_ACTIONS = [...REPORT_CONTROL_ACTIONS, ...REPORT_WRITE_ACTIONS];
const REPORT_ADAPTER_VERSIONS = ["report-inspect-v1", "report-authoring-v2"];
const SENSITIVE_TEXT_PATTERN = /(?:cookie|authorization|token|password|密码|验证码)/i;

function reportAuthoringCapability(route, report) {
  const adapterVersion = limited(report.adapterVersion, 80);
  const settingsWritableFields = report.settingsAvailable && report.settingsWriteSupported === true && Array.isArray(report.settingsWritableFields)
    ? [...new Set(report.settingsWritableFields.filter((field) => field === "是否编号=是"))]
    : [];
  const capability = {
    adapterVersion,
    inspectAvailable: Boolean(route.isNewReportRoute && REPORT_ADAPTER_VERSIONS.includes(adapterVersion) && report.inspectAvailable),
    writeEnabled: false,
  };
  if (adapterVersion === "report-authoring-v2") {
    // v2 能力摘要：仅透传页面适配器真实检测字段，writeEnabled 恒为 false（写门禁在 Bridge 侧）。
    capability.v2 = {
      treeAvailable: Boolean(report.treeAvailable),
      treeEditModeAvailable: Boolean(report.treeEditModeAvailable),
      editorFramework: limited(report.editorFramework, 40),
      editorModelAvailable: Boolean(report.editorModelAvailable),
      toolbarAvailable: Boolean(report.toolbarAvailable),
      structureOpsAvailable: Boolean(report.structureOpsAvailable),
      structureOperations: {
        addChild: Boolean(report.structureOperations?.addChild),
        addSibling: Boolean(report.structureOperations?.addSibling),
        copy: Boolean(report.structureOperations?.copy),
        delete: Boolean(report.structureOperations?.delete),
        moveUp: Boolean(report.structureOperations?.moveUp),
        moveDown: Boolean(report.structureOperations?.moveDown),
      },
      settingsAvailable: Boolean(report.settingsAvailable),
      settingsWriteSupported: settingsWritableFields.length > 0,
      settingsWritableFields,
      writesSupported: Boolean(report.writesSupported && report.livePageVerified),
      livePageVerified: Boolean(report.livePageVerified),
    };
  }
  return capability;
}

function safeContext(value = {}) {
  const route = value.route && typeof value.route === "object" ? value.route : {};
  const spread = value.spread && typeof value.spread === "object" ? value.spread : {};
  const page = value.page && typeof value.page === "object" ? value.page : {};
  const report = value.reportAuthoring && typeof value.reportAuthoring === "object" ? value.reportAuthoring : {};
  return {
    route: { isTianyuanRoute: Boolean(route.isTianyuanRoute || route.isTianyuanOperationRoute), isAssetDraftRoute: Boolean(route.isAssetDraftRoute), isEquityListRoute: Boolean(route.isEquityListRoute), isNewReportRoute: Boolean(route.isNewReportRoute), projectId: limited(route.projectId, 80), companyId: limited(route.companyId, 80), subjectCode: limited(route.subjectCode, 120), reportType: limited(route.reportType, 80), reportMode: limited(route.reportMode, 20), reportDetailId: /^[A-Za-z0-9_-]{1,100}$/.test(route.reportDetailId || "") ? route.reportDetailId : "" },
    reportAuthoring: reportAuthoringCapability(route, report),
    spread: { found: Boolean(spread.found), sheetName: limited(spread.sheetName, 160), activeRow: Number.isInteger(spread.activeRow) ? spread.activeRow : null, activeColumn: Number.isInteger(spread.activeColumn) ? spread.activeColumn : null },
    gates: { loginLikely: Boolean(page.loginLikely), saveVisible: Boolean(page.saveButton?.visible), saveDisabled: Boolean(page.saveButton?.disabled), hasLockText: Boolean(limited(page.lockText)), hasPermissionText: Boolean(limited(page.permissionText)) },
  };
}
function safeClient(value = {}) { return { name: limited(value.name || "tianyuan-browser-workbench", 120), version: limited(value.version, 80), extensionId: limited(value.extensionId, 120) }; }
function publicSource(source) {
  return source ? { agentId: source.agentId, providerId: source.providerId, displayName: source.displayName, installationId: source.installationId, local: Boolean(source.local), manual: Boolean(source.manual), createdAt: source.createdAt || null, updatedAt: source.updatedAt || null, lastSeenAt: source.lastSeenAt || null } : null;
}
function publicBinding(binding) {
  return binding ? { bindingId: binding.bindingId, agentId: binding.agentId, providerId: binding.providerId, displayName: binding.displayName, installationId: binding.installationId, workspaceId: binding.workspaceId, workspaceName: binding.workspaceName, workspacePath: binding.workspacePath, conversationId: binding.conversationId, conversationTitle: binding.conversationTitle, scope: binding.scope, accessMode: binding.accessMode, pageKey: binding.pageKey, manualBinding: Boolean(binding.manualBinding), createdAt: binding.createdAt || null, updatedAt: binding.updatedAt || null } : null;
}
function codexCompatibility(binding) {
  if (!binding || binding.providerId !== "codex") return null;
  return { bindingId: binding.bindingId, projectId: binding.workspaceId || "", projectName: binding.workspaceName || "", projectPath: binding.workspacePath || "", threadId: binding.conversationId || "", threadTitle: binding.conversationTitle || "", scope: binding.scope === "workspace" ? "project" : "thread", createdAt: binding.createdAt || null, updatedAt: binding.updatedAt || null };
}
function error(code, status = 400) { const value = new Error(code); value.code = code; value.status = status; return value; }
function equal(a, b) { const left = Buffer.from(String(a || "")); const right = Buffer.from(String(b || "")); return left.length === right.length && timingSafeEqual(left, right); }

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

function resolveCredential(reference, adapter = platformAdapter) {
  return adapter.resolveCredentialReference(reference);
}

function createBridge(options = {}) {
  const home = options.homeDir || os.homedir();
  const bridgePlatformAdapter = options.platformAdapter || (options.runtimeConfig
    ? createPlatformAdapter({
        platform: options.platform,
        homeDir: home,
        env: options.env,
        runtimeConfig: options.runtimeConfig,
        runtimeConfigPath: options.runtimeConfigPath || RUNTIME_CONFIG_PATH,
      })
    : platformAdapter);
  const runtimeRoot = bridgePlatformAdapter.runtimeRoot;
  const bindingsPath = options.bindingsPath || process.env.TIANYUAN_CONNECTOR_BINDINGS_PATH || path.join(runtimeRoot, "native-helper", "connector-bindings.json");
  const snapshotDirectory = options.snapshotDirectory || path.join(path.dirname(bindingsPath), "report-snapshots");
  const pendingDirectory = options.pendingDirectory || path.join(path.dirname(bindingsPath), "report-pending");
  const sourcesPath = options.sourcesPath || process.env.TIANYUAN_CONNECTOR_AGENT_SOURCES_PATH || path.join(runtimeRoot, "native-helper", "agent-sources.json");
  const configDir = options.configDir || process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_DIR || path.join(runtimeRoot, "agent-sources");
  const codexStatePath = options.codexStatePath || process.env.TIANYUAN_CODEX_GLOBAL_STATE_PATH || path.join(home, ".codex", ".codex-global-state.json");
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(home, ".codex");
  const projectsPath = options.projectsPath || process.env.OFFICE_CONNECTOR_PROJECTS || path.join(home, ".local", "share", "office-connector", "runtime", "config", "projects.local.json");
  const threadsPath = options.threadsPath || process.env.OFFICE_CONNECTOR_THREADS || path.join(home, ".local", "share", "office-connector", "runtime", "config", "threads.local.json");
  const processesPath = options.processesPath || path.join(codexHome, "process_manager", "chat_processes.json");
  const sqlitePath = options.sqlitePath || path.join(codexHome, "sqlite", "codex-dev.db");
  const workbuddyDbPath = options.workbuddyDbPath || process.env.TIANYUAN_WORKBUDDY_DB_PATH || path.join(home, ".workbuddy", "workbuddy.db");
  const zcodeDbPath = options.zcodeDbPath || process.env.TIANYUAN_ZCODE_DB_PATH || path.join(home, ".zcode", "cli", "db", "db.sqlite");
  const compatibilityPath = options.compatibilityPath || process.env.TIANYUAN_CONNECTOR_RUNTIME_COMPATIBILITY_PATH || path.join(__dirname, "runtime-compat.json");
  const officeBridgeUrl = options.officeBridgeUrl || process.env.OFFICE_CONNECTOR_BRIDGE_URL || "http://127.0.0.1:40115";
  const platformUrl = process.env.TIANYUAN_CONNECTOR_PLATFORM_URL || "http://127.0.0.1:40315";
  const sessions = new Map(); const actions = new Map(); const bindings = new Map(); const sources = new Map(); const reportPlans = new Map();
  let loaded = false; let migrated = false;
  const compatibility = readJson(compatibilityPath, {
    extensionVersion: "",
    bridgeProtocol: PROTOCOL_VERSION,
    buildId: BUILD_ID,
  });
  // 报告写门禁：默认关闭（生产只读）。仅在 options 显式打开或环境变量 TIANYUAN_REPORT_WRITE_GATE_OPEN=1 时放行写类报告动作。
  const reportWriteGateOpen = () => options.reportWriteGateOpen === true || process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN === "1";
  function reportWriteScope() {
    if (options.reportWriteScope && typeof options.reportWriteScope === "object") return options.reportWriteScope;
    try { return JSON.parse(process.env.TIANYUAN_REPORT_WRITE_SCOPE || "null"); } catch { return null; }
  }

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
    const expected = resolveCredential(source.credentialRef, bridgePlatformAdapter); if (!expected) throw error("AGENT_CREDENTIAL_UNAVAILABLE", 503);
    if (!equal(expected, credential)) throw error("AGENT_AUTH_INVALID", 403);
    source.lastSeenAt = now(); source.updatedAt = source.lastSeenAt; saveSources();
    return { agentId: source.agentId, providerId: source.providerId, installationId: source.installationId, displayName: source.displayName };
  }

  function legacyBinding(value, codexSource) {
    const createdAt = value.createdAt || now();
    return { bindingId: limited(value.bindingId || randomUUID(), 200), agentId: codexSource?.agentId || "codex", providerId: "codex", displayName: codexSource?.displayName || "Codex", installationId: codexSource?.installationId || "legacy-codex", workspaceId: limited(value.projectId, 200), workspaceName: limited(value.projectName, 200), workspacePath: normalizePath(value.projectPath), conversationId: limited(value.threadId, 200), conversationTitle: limited(value.threadTitle, 300), scope: value.scope === "project" ? "workspace" : "conversation", accessMode: value.accessMode === "read" ? "read" : "control", pageKey: limited(value.pageKey, 1200), manualBinding: false, createdAt, updatedAt: value.updatedAt || createdAt, migratedFrom: "codexBinding-v1" };
  }
  function loadBindings() {
    if (loaded) return; loaded = true; loadSources();
    const payload = readJson(bindingsPath, { bindings: [] }); const codexSource = [...sources.values()].find((entry) => entry.providerId === "codex");
    for (const item of Array.isArray(payload.bindings) ? payload.bindings : []) {
      const binding = item?.providerId ? item : legacyBinding(item || {}, codexSource);
      if (!item?.providerId) migrated = true;
      if (binding.bindingId && binding.pageKey) bindings.set(binding.bindingId, binding);
    }
    if (migrated) saveBindings();
  }
  function saveBindings() { writeJson(bindingsPath, { version: 2, updatedAt: now(), bindings: [...bindings.values()] }); }
  function bindingsFor(page) { loadBindings(); const key = pageKey(page); return [...bindings.values()].filter((binding) => binding.pageKey === key).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); }
  function syncSession(session) {
    const entries = bindingsFor(session.binding); session.agentBindings = entries.map(publicBinding);
    const codex = entries.filter((binding) => binding.providerId === "codex").sort((a, b) => (a.accessMode === "control" ? -1 : 1))[0] || null;
    session.codexBinding = codexCompatibility(codex);
    return session;
  }
  function publicSession(session, agent = null, includeContext = true) {
    if (!session) return null; syncSession(session);
    const selected = agent ? session.agentBindings.filter((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId) : session.agentBindings;
    const scope = reportWriteScope();
    const route = session.context?.route || {};
    const related = selected.map((binding) => {
      const scopeMatches = Boolean(agent && scope && session.status === "online" && session.binding.pageType === "new-report" && route.isNewReportRoute
        && binding.scope === "conversation" && binding.accessMode === "control" && currentController(session)?.bindingId === binding.bindingId
        && scope.workspaceId === binding.workspaceId && scope.threadId === binding.conversationId && scope.agentId === binding.agentId
        && scope.tabId === session.binding.tabId && scope.projectId === route.projectId && scope.companyId === route.companyId
        && scope.reportType === route.reportType && scope.mode === route.reportMode && route.reportDetailId && scope.reportDetailId === route.reportDetailId);
      return { ...binding, reportWriteGate: { open: reportWriteGateOpen(), scopeMatches: scopeMatches && reportWriteGateOpen() } };
    });
    const copy = { sessionId: session.sessionId, status: session.status, registeredAt: session.registeredAt, lastSeenAt: session.lastSeenAt, binding: session.binding, client: session.client, agentBindings: related, capabilities: session.capabilities };
    if (!agent || agent.providerId === "codex") copy.codexBinding = agent ? codexCompatibility(related.find((binding) => binding.providerId === "codex") || null) : session.codexBinding;
    if (includeContext) copy.context = session.context;
    return copy;
  }
  function sessionForBinding(sessionId) { const session = sessions.get(sessionId); if (!session) throw error("SESSION_NOT_FOUND", 404); return session; }
  function bindingForAgent(session, agent, bindingId) {
    syncSession(session); const selected = bindings.get(String(bindingId || ""));
    if (!selected || selected.pageKey !== pageKey(session.binding) || selected.agentId !== agent.agentId || selected.providerId !== agent.providerId || selected.installationId !== agent.installationId) throw error("AGENT_BINDING_MISMATCH", 403);
    return selected;
  }
  function ensureBindingInput(binding, input = {}) {
    if (input.workspaceId && String(input.workspaceId) !== binding.workspaceId) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.projectId && String(input.projectId) !== binding.workspaceId) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.workspacePath && normalizePath(input.workspacePath) !== normalizePath(binding.workspacePath)) throw error("AGENT_BINDING_MISMATCH", 403);
    if (input.projectPath && normalizePath(input.projectPath) !== normalizePath(binding.workspacePath)) throw error("AGENT_BINDING_MISMATCH", 403);
    const conversation = input.conversationId || input.threadId;
    if (binding.scope === "conversation" && String(conversation || "") !== binding.conversationId) throw error("AGENT_BINDING_MISMATCH", 403);
    if (conversation && binding.conversationId && String(conversation) !== binding.conversationId) throw error("AGENT_BINDING_MISMATCH", 403);
  }
  function currentController(session) { syncSession(session); const current = [...bindings.values()].filter((binding) => binding.pageKey === pageKey(session.binding) && binding.accessMode === "control").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); return current[0] || null; }
  function authorize(session, agent, input, control = false) {
    const binding = bindingForAgent(session, agent, input.bindingId); ensureBindingInput(binding, input);
    if (control) { if (binding.accessMode !== "control") throw error("AGENT_READ_ONLY", 403); const controller = currentController(session); if (!controller || controller.bindingId !== binding.bindingId) throw error("AGENT_CONTROL_CONFLICT", 409); }
    return binding;
  }
  function browserBinding(session, bindingId, control = false) {
    const binding = bindings.get(String(bindingId || "")); if (!binding || binding.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 403);
    if (control && (binding.accessMode !== "control" || currentController(session)?.bindingId !== binding.bindingId)) throw error("AGENT_CONTROL_CONFLICT", 409);
    return binding;
  }
  function capabilities() { return {
    agentSourceRegistration: { supported: true, level: "routing", label: "已注册 Agent 来源" },
    agentBinding: { supported: true, level: "routing", label: "绑定 Agent 工作区或对话" },
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
    return ["upload_audit_attachment", "batch_upload_audit_attachments", "save_batch_upload_draft", "clear_audit_attachments", "clear_audit_test_rows", "set_audit_check_result", "batch_set_audit_check_results", "batch_save_asset_draft", "batch_exit_edit", ...REPORT_WRITE_ACTIONS].includes(type);
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
  function safeLabel(value) {
    const raw = limited(value, 240);
    return SENSITIVE_TEXT_PATTERN.test(raw) ? "[已隐藏]" : raw;
  }
  function safeNodeRef(value) {
    if (!value || typeof value !== "object") return null;
    const nodePathKey = limited(value.nodePathKey, 200);
    const label = safeLabel(value.label);
    if (typeof value.nodePathKey !== "string" || nodePathKey !== value.nodePathKey
      || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(nodePathKey)
      || typeof value.label !== "string" || value.label !== label || !label || SENSITIVE_TEXT_PATTERN.test(label)) return null;
    const candidateId = limited(value.candidateId, 200);
    if (value.candidateId !== undefined && (!/^[A-Za-z0-9:_-]{1,200}$/.test(candidateId) || SENSITIVE_TEXT_PATTERN.test(candidateId) || candidateId !== value.candidateId)) return null;
    return { nodePathKey, label, ...(candidateId ? { candidateId } : {}) };
  }
  function safeNodeRefs(value, max = 200) {
    if (!Array.isArray(value)) throw error("REPORT_NODE_REFS_INVALID");
    if (value.length > max) throw error("REPORT_NODE_REFS_INVALID");
    const refs = value.map(safeNodeRef);
    if (refs.some((ref) => !ref)) throw error("REPORT_NODE_REFS_INVALID");
    return refs;
  }
  function safePreviewOps(value) {
    if (!Array.isArray(value)) return [];
    if (value.length > 50) throw error("REPORT_PLAN_INVALID");
    return value.map((op) => {
      const kind = limited(op?.kind, 40);
      const sanitized = { kind, nodeRef: safeNodeRef(op?.nodeRef) };
      if (!sanitized.nodeRef) throw error("REPORT_NODE_REF_INVALID");
      if (!sanitized.nodeRef.candidateId) throw error("REPORT_NODE_ID_REQUIRED");
      if (Array.isArray(op?.fields)) {
        if (op.fields.length > 12) throw error("REPORT_INPUT_INVALID");
        sanitized.fields = op.fields.map((field) => {
          if (typeof field?.label !== "string" || typeof field?.value !== "string"
            || field.label.length > 240 || field.value.length > 240
            || SENSITIVE_TEXT_PATTERN.test(field.label) || SENSITIVE_TEXT_PATTERN.test(field.value)) throw error("REPORT_INPUT_INVALID");
          return { label: field.label, value: field.value };
        });
      }
      if (typeof op?.mode === "string") sanitized.mode = limited(op.mode, 20);
      if (typeof op?.command === "string") sanitized.command = limited(op.command, 40);
      if (op?.color !== undefined) {
        if (typeof op.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(op.color)) throw error("REPORT_COLOR_INVALID");
        sanitized.color = op.color.toLowerCase();
      }
      for (const key of ["find", "replace"]) {
        if (typeof op?.[key] !== "string") continue;
        if (op[key].length > 20000 || SENSITIVE_TEXT_PATTERN.test(op[key])) throw error("REPORT_INPUT_INVALID");
        sanitized[key] = op[key];
      }
      if (typeof op?.title === "string") {
        if (op.title.length > 240 || SENSITIVE_TEXT_PATTERN.test(op.title)) throw error("REPORT_INPUT_INVALID");
        sanitized.title = op.title;
      }
      if (op?.position === "child" || op?.position === "after" || op?.position === "before") sanitized.position = op.position;
      if (op?.direction === "up" || op?.direction === "down") sanitized.direction = op.direction;
      sanitized.opConfirm = op?.opConfirm === true;
      return sanitized;
    });
  }
  function reportPendingOwner(session, binding) {
    return { sessionId: session.sessionId, sessionEpoch: session.sessionEpoch, bindingId: binding.bindingId, controlEpoch: binding.controlEpoch || binding.updatedAt, tabId: session.binding.tabId };
  }
  function createAction(session, agent, input) {
    let stagedNodeRef = null;
    let stagedRequiresFormatVerification = false;
    let stagedSave = null;
    let pendingSettingsReopen = false;
    let settingsOpenAction = null;
    let settingsWriteIntent = null;
    let structureIntent = null;
    let structureReload = null;
    let structureScopeRead = null;
    let structurePartialRead = false;
    const type = limited(input.action, 80);
    const allowed = new Set(["preview_batch_save", "batch_save_asset_draft", "preview_batch_exit_edit", "batch_exit_edit", "preview_audit_attachment_upload", "upload_audit_attachment", "batch_upload_audit_attachments", "save_batch_upload_draft", "inspect_audit_check_row", "set_audit_check_result", "scan_audit_index_check_rows", "batch_set_audit_check_results", "clear_audit_attachments", "clear_audit_test_rows", "inspect_page_structure", ...REPORT_ACTIONS]);
    if (!allowed.has(type)) throw error("ACTION_NOT_ALLOWED");
    const isReadOnlyInspect = ["inspect_page_structure", ...REPORT_CONTROL_ACTIONS].includes(type);
    const isReportAction = REPORT_ACTIONS.includes(type);
    if (REPORT_WRITE_ACTIONS.includes(type) && !reportWriteGateOpen()) throw error("REPORT_WRITE_GATE_CLOSED", 403);
    if (type === "report_editor_close" && input.discardConfirmed === true) throw error("REPORT_DISCARD_UNSUPPORTED", 403);
    if (REPORT_UI_CONTROL_ACTIONS.includes(type) && !reportWriteGateOpen()) throw error("REPORT_WRITE_GATE_CLOSED", 403);
    const binding = authorize(session, agent, input, actionIsWrite(type));
    if (session.status !== "online") throw error("SESSION_NOT_ONLINE", 409);
    if (isReportAction) {
      if (!session.context?.reportAuthoring?.inspectAvailable) throw error("REPORT_ADAPTER_NOT_AVAILABLE", 409);
      if (binding.accessMode !== "control" || currentController(session)?.bindingId !== binding.bindingId) throw error("REPORT_CONTROL_BINDING_REQUIRED", 409);
      const route = session.context.route;
      const expected = input.reportIdentity || {};
      if (session.binding.pageType !== "new-report" || !route.isNewReportRoute || !Number.isInteger(input.tabId) || input.tabId !== session.binding.tabId
        || ["projectId", "companyId", "reportType", "mode"].some((key) => !expected[key] || String(expected[key]) !== String((key === "mode" ? route.reportMode : route[key]) || ""))) throw error("REPORT_TARGET_MISMATCH", 409);
      if (REPORT_WRITE_ACTIONS.includes(type) || REPORT_UI_CONTROL_ACTIONS.includes(type)) {
        const scope = reportWriteScope();
        const required = ["projectId", "companyId", "reportType", "mode", "reportDetailId"];
        if (!scope || !scope.workspaceId || !scope.threadId || !scope.agentId || !Number.isInteger(scope.tabId)
          || binding.scope !== "conversation" || scope.workspaceId !== binding.workspaceId || scope.threadId !== binding.conversationId
          || scope.agentId !== binding.agentId || scope.tabId !== session.binding.tabId
          || required.some((key) => typeof scope[key] !== "string" || !scope[key] || String(expected[key] || "") !== scope[key])
          || !/^[A-Za-z0-9_-]{1,100}$/.test(scope.reportDetailId)) throw error("REPORT_WRITE_SCOPE_MISMATCH", 403);
        try {
          if (type === "report_reload" && (input.confirmText !== "确认刷新并核验已保存报告" || !hasReportPending(pendingDirectory, expected))) throw error("REPORT_PENDING_VERIFY", 409);
          if (type === "report_reload") {
            try {
              structureReload = readCurrentReportStructureStage({ directory: pendingDirectory, reportIdentity: expected, nodeRef: safeNodeRef(input.nodeRef), owner: reportPendingOwner(session, binding), expectedStatus: "staged" });
            } catch {}
          }
          if (hasReportPending(pendingDirectory, expected)) {
            if (type === "report_execute") {
              const pendingPlan = reportPlans.get(String(input.planHash || ""));
              if (pendingPlan?.settingsOpenNodeRef) {
                pendingSettingsReopen = canReopenReportSettings({ directory: pendingDirectory, reportIdentity: expected, nodeRef: pendingPlan.settingsOpenNodeRef, owner: reportPendingOwner(session, binding) });
              }
            }
            if (type !== "report_reload" && type !== "report_editor_save" && !pendingSettingsReopen) throw error("REPORT_PENDING_VERIFY", 409);
            if (type === "report_editor_save") {
            const owner = reportPendingOwner(session, binding);
            const nodeRef = safeNodeRef(input.nodeRef);
            if (input.legacyRecovery) {
              const recovery = input.legacyRecovery;
              stageLegacyAppend({ directory: pendingDirectory, reportIdentity: expected, nodeRef, owner, actionId: recovery.actionId, snapshotDirectory, originalSnapshot: recovery.originalSnapshot, currentSnapshot: recovery.currentSnapshot, appendedText: recovery.appendedText, confirmText: input.confirmText });
            }
            const stage = readReportStage({ directory: pendingDirectory, reportIdentity: expected, nodeRef, owner });
            stagedSave = { owner, nodeRef, modelHash: stage.modelHash };
            }
          }
        }
        catch (cause) { if (cause.code === "REPORT_PENDING_VERIFY" || cause.code === "REPORT_SAVE_STAGE_REQUIRED") throw cause; if (cause.message === "REPORT_PENDING_VERIFY") throw error("REPORT_PENDING_VERIFY", 409); throw error("REPORT_PENDING_JOURNAL_FAILED", 503); }
      }
      if (type === "report_execute") {
        const planHash = typeof input.planHash === "string" ? input.planHash.trim() : "";
        if (!planHash || planHash.length > 128) throw error("REPORT_PLAN_REQUIRED");
        if (!limited(input.confirmText, 80)) throw error("REPORT_CONFIRM_REQUIRED");
        const plan = reportPlans.get(planHash);
        if (!plan || plan.sessionId !== session.sessionId || plan.sessionEpoch !== session.sessionEpoch || plan.bindingId !== binding.bindingId
          || plan.controlEpoch !== (binding.controlEpoch || binding.updatedAt)
          || plan.tabId !== session.binding.tabId || ["projectId", "companyId", "reportType", "mode", "reportDetailId"].some((key) => String(plan.reportIdentity[key] || "") !== String(expected[key] || ""))) throw error("REPORT_PLAN_STALE", 409);
        if (hasReportPending(pendingDirectory, expected) && !pendingSettingsReopen) throw error("REPORT_PENDING_VERIFY", 409);
        if (input.confirmText !== plan.confirmationRequired) throw error("REPORT_CONFIRM_TEXT_INVALID", 400);
        if (!plan.snapshotReady) throw error("REPORT_SNAPSHOT_REQUIRED", 409);
        try {
          for (const record of plan.snapshots) readReportSnapshot({ directory: snapshotDirectory, snapshot: record.snapshot, reportIdentity: plan.reportIdentity, nodeRef: record.nodeRef });
          for (const record of plan.treeSnapshots) readReportTreeSnapshot({ directory: snapshotDirectory, snapshot: record.snapshot, reportIdentity: plan.reportIdentity, nodeRef: record.nodeRef, operationIndex: record.operationIndex, operationKind: record.operationKind });
        } catch { throw error("REPORT_SNAPSHOT_REQUIRED", 409); }
        stagedNodeRef = plan.stagedNodeRef || null;
        stagedRequiresFormatVerification = plan.stagedRequiresFormatVerification === true;
        const owner = reportPendingOwner(session, binding);
        if (plan.structureIntent) structureIntent = { ...plan.structureIntent, owner };
        if (plan.settingsOpenNodeRef) settingsOpenAction = { nodeRef: plan.settingsOpenNodeRef, planHash };
        if (plan.settingsWriteIntent) settingsWriteIntent = { ...plan.settingsWriteIntent, planHash, owner };
        reportPlans.delete(planHash);
      }
      if (type === "report_save" && !limited(input.confirmText, 80)) throw error("REPORT_CONFIRM_REQUIRED");
      if (type === "report_editor_command") {
        const command = limited(input.command, 40);
        if (!command) throw error("REPORT_COMMAND_REQUIRED");
        if (!input.nodeRef || typeof input.nodeRef !== "object") throw error("REPORT_NODE_REF_REQUIRED");
        if (input.confirmText !== "确认执行报告修改") throw error("REPORT_CONFIRM_TEXT_INVALID");
      }
      if (type === "report_editor_save") {
        if (!limited(input.confirmText, 80)) throw error("REPORT_CONFIRM_REQUIRED");
        if (!input.nodeRef || typeof input.nodeRef !== "object") throw error("REPORT_NODE_REF_REQUIRED");
        if (!hasReportPending(pendingDirectory, expected)) throw error("REPORT_SAVE_STAGE_REQUIRED", 409);
      }
    }
    if (!isReadOnlyInspect && !isReportAction && (!session.binding.projectId || !session.binding.companyId || session.binding.pageType !== "asset-draft")) throw error("ASSET_DRAFT_SESSION_REQUIRED", 409);
    const isBatchSubjectAction = ["preview_batch_save", "batch_save_asset_draft", "preview_batch_exit_edit", "batch_exit_edit"].includes(type);
    const isBatchPageAction = isBatchSubjectAction;
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers.map(Number).filter((row) => Number.isInteger(row) && row >= 2 && row <= 100000) : [];
    const rowNumber = Number(input.rowNumber);
    if (!isBatchPageAction && !isReadOnlyInspect && !isReportAction && !rowNumbers.length && !["scan_audit_index_check_rows"].includes(type) && (!Number.isInteger(rowNumber) || rowNumber < 2)) throw error("ROW_NUMBER_INVALID");
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
    const action = { actionId: id("action"), sessionId: session.sessionId, bindingId: binding.bindingId, agentId: agent.agentId, providerId: agent.providerId, installationId: agent.installationId, controlEpoch: binding.controlEpoch || binding.updatedAt, type, status: "queued", target: { projectId: session.binding.projectId, companyId: session.binding.companyId, subjectCode, subjectCodes, companyScope, companyFilters: normalizedSelection(input.companyFilters), selectedCompanies: normalizedSelection(input.selectedCompanies), companyValues: normalizedSelection(input.companyValues), mode: ["batch_save_asset_draft", "batch_exit_edit"].includes(type) ? "execute" : "dry_run", rowNumber: rowNumbers.length ? 0 : rowNumber, rowNumbers, expectedIndexValues, expectedCleanupValues, fieldTitle: limited(input.fieldTitle || (type.includes("check") ? "查证核对情况" : "查证资料索引"), 80), fieldColumn: Number.isInteger(input.fieldColumn) ? input.fieldColumn : null, sheetName: limited(input.sheetName, 200), resultText: limited(input.resultText, 80), procedureText: limited(input.procedureText, 80), moduleName: limited(input.moduleName, 80), moduleIndex: Number.isInteger(input.moduleIndex) ? input.moduleIndex : 0, deferSave: Boolean(input.deferSave), maxRows: Math.max(2, Math.min(Number(input.maxRows || 500), 5000)) }, file, files, confirmText: limited(input.confirmText, 80), createdAt: now() };
    action.stagedNodeRef = stagedNodeRef;
    action.stagedRequiresFormatVerification = stagedRequiresFormatVerification;
    action.stagedSave = stagedSave;
    action.pendingSettingsReopen = pendingSettingsReopen;
    action.settingsOpen = settingsOpenAction;
    action.settingsWriteIntent = settingsWriteIntent;
    if (isReportAction) {
      action.sessionEpoch = session.sessionEpoch;
      const route = session.context.route;
      action.target.tabId = session.binding.tabId;
      action.target.reportIdentity = { projectId: route.projectId, companyId: route.companyId, reportType: route.reportType, mode: route.reportMode };
      // detailId（报告明细身份）可选比对：Bridge 仅按格式校验后透传，与页面 URL 查询串真实 detailId 的比对在页面适配器完成
      const reportDetailId = input.reportIdentity?.reportDetailId;
      if (typeof reportDetailId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(reportDetailId)) {
        action.target.reportIdentity.reportDetailId = reportDetailId;
      }
      if (type === "report_inspect") {
        action.target.inspectOffset = Number.isInteger(input.offset) ? Math.max(0, Math.min(input.offset, 5000)) : 0;
        action.target.inspectLimit = Number.isInteger(input.limit) ? Math.max(1, Math.min(input.limit, 100)) : 50;
      }
      if (type === "report_navigate") {
        action.target.op = ["expand", "select", "reveal", "enter_edit_mode"].includes(input.op) ? input.op : limited(input.op, 20);
        action.target.nodeRef = safeNodeRef(input.nodeRef);
        // search op 的关键词：与 ops 文本同样的脱敏规则（命中敏感模式一律掩码）
        action.target.keyword = typeof input.keyword === "string" && input.keyword.trim() ? safeLabel(input.keyword) : null;
        action.target.timeoutMs = Number.isInteger(input.timeoutMs) ? Math.max(200, Math.min(input.timeoutMs, 30000)) : null;
      }
      if (type === "report_node_read") {
        action.target.nodeRef = safeNodeRef(input.nodeRef);
        action.target.include = Array.isArray(input.include) ? input.include.map((item) => limited(item, 20)).filter(Boolean).slice(0, 4) : [];
        action.target.verifySaved = input.verifySaved === true;
        if (action.target.verifySaved && (!action.target.nodeRef?.candidateId || (!action.target.include.includes("editor") && !action.target.include.includes("settings") && !action.target.include.includes("structure")))) throw error("REPORT_NODE_REF_INVALID");
        if (action.target.verifySaved && action.target.include.includes("structure") && action.target.include.includes("editor") && !action.target.include.includes("settings")) {
          try {
            const owner = reportPendingOwner(session, binding);
            const stage = readCurrentReportStructurePartialStage({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, owner });
            structureScopeRead = { ...stage, owner };
            structurePartialRead = true;
          } catch { throw error("REPORT_PENDING_VERIFY", 409); }
        } else if (action.target.verifySaved && action.target.include.includes("structure") && !action.target.include.includes("editor") && !action.target.include.includes("settings")) {
          try {
            const stage = readCurrentReportStructureStage({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, owner: reportPendingOwner(session, binding), expectedStatus: "reloadRequested" });
            structureScopeRead = { ...stage, owner: reportPendingOwner(session, binding) };
          } catch { throw error("REPORT_PENDING_VERIFY", 409); }
        }
      }
      if (type === "report_reload") {
        action.target.nodeRef = safeNodeRef(input.nodeRef);
        if (!action.target.nodeRef?.candidateId) throw error("REPORT_NODE_REF_INVALID");
        if (structureReload) action.target.structureReload = structureReload;
      }
      if (type === "report_preview") action.target.ops = safePreviewOps(input.ops);
      if (type === "report_readback" && input.nodeRefs !== undefined) action.target.nodeRefs = safeNodeRefs(input.nodeRefs);
      // 编辑器生命周期动作：open/close 属控制类，command/save 属写类；command 必须在页面适配器白名单内（此处仅透传，页面会再次校验）
      if (type === "report_editor_open" || type === "report_editor_command" || type === "report_editor_save" || type === "report_editor_close") {
        action.target.nodeRef = safeNodeRef(input.nodeRef);
        action.target.timeoutMs = Number.isInteger(input.timeoutMs) ? Math.max(200, Math.min(input.timeoutMs, 30000)) : null;
        if (type === "report_editor_command") action.target.command = limited(input.command, 40);
        // close 遇未保存更改默认拒绝，仅显式 discardConfirmed 才确认丢弃
        if (type === "report_editor_close") action.target.discardConfirmed = input.discardConfirmed === true;
      }
      // 写类动作：target 仅记录 planHash 与 confirmText 掩码；真实 confirmText 只随 claim 下发，绝不进入 publicAction 的任何 GET 响应。
      if (REPORT_WRITE_ACTIONS.includes(type)) {
        if (type === "report_execute") action.target.planHash = limited(input.planHash, 128);
        action.target.confirmTextMasked = limited(input.confirmText, 80) ? "已提供" : "未提供";
      }
        if (structureIntent) action.structureIntent = structureIntent;
        if (structureReload) action.structureReload = structureReload;
        if (structureScopeRead) action.structureScopeRead = structureScopeRead;
        if (structurePartialRead) action.structurePartialRead = true;
    }
    actions.set(action.actionId, action); return action;
  }
  function publicAction(action) { return action ? { actionId: action.actionId, sessionId: action.sessionId, bindingId: action.bindingId, type: action.type, status: action.status, target: action.target, file: action.file ? { name: action.file.name, size: action.file.size, type: action.file.type } : null, files: (action.files || []).map((item) => ({ name: item.name, size: item.size, type: item.type, moduleName: item.moduleName, moduleIndex: item.moduleIndex })), createdAt: action.createdAt, claimedAt: action.claimedAt || null, completedAt: action.completedAt || null, cancellationReason: action.cancellationReason || null, result: action.result || null } : null; }

  function reportClaimIsCurrent(action, session, binding) {
    const route = session.context?.route || {};
    const expected = action.target.reportIdentity || {};
    return action.sessionEpoch === session.sessionEpoch && action.controlEpoch === (binding.controlEpoch || binding.updatedAt)
      && binding.accessMode === "control" && currentController(session)?.bindingId === binding.bindingId
      && session.binding.pageType === "new-report" && session.binding.tabId === action.target.tabId && route.isNewReportRoute
      && ["projectId", "companyId", "reportType", "mode"].every((key) => String(expected[key] || "") !== "" && String(expected[key]) === String((key === "mode" ? route.reportMode : route[key]) || ""));
  }

  function stopAction(action, reason) {
    const uncertain = ["claimed", "running"].includes(action.status) && [...REPORT_WRITE_ACTIONS, ...REPORT_UI_CONTROL_ACTIONS].includes(action.type);
    action.status = uncertain ? "pendingVerify" : "cancelled";
    action.cancellationReason = reason;
    if (uncertain) action.result = { ok: false, status: "pendingVerify", reason: "REPORT_ACTION_OUTCOME_UNKNOWN", security: { credentialsReturned: false } };
    action.completedAt = now();
  }
  function cancelControllerActions(bindingId) { for (const action of actions.values()) if (action.bindingId === bindingId && ["queued", "claimed", "running"].includes(action.status)) stopAction(action, "AGENT_CONTROL_REVOKED"); }
  function createBinding(session, input) {
    const source = requireSource(input); const previous = input.bindingId ? bindings.get(String(input.bindingId)) : null; const scope = input.scope === "workspace" || input.scope === "project" ? "workspace" : "conversation"; const accessMode = input.accessMode === "control" ? "control" : "read";
    const binding = { bindingId: limited(input.bindingId || previous?.bindingId || randomUUID(), 200), agentId: source.agentId, providerId: source.providerId, displayName: limited(input.displayName || source.displayName, 120), installationId: source.installationId, workspaceId: limited(input.workspaceId ?? input.projectId ?? previous?.workspaceId, 200), workspaceName: limited(input.workspaceName ?? input.projectName ?? previous?.workspaceName, 200), workspacePath: normalizePath(input.workspacePath ?? input.projectPath ?? previous?.workspacePath), conversationId: scope === "workspace" ? "" : limited(input.conversationId ?? input.threadId ?? previous?.conversationId, 200), conversationTitle: scope === "workspace" ? "" : limited(input.conversationTitle ?? input.threadTitle ?? previous?.conversationTitle, 300), scope, accessMode, pageKey: pageKey(session.binding), manualBinding: Boolean(input.manualBinding || source.manual), createdAt: previous?.createdAt || now(), updatedAt: now() };
    if (!binding.workspaceId && !binding.conversationId) throw error("AGENT_WORKSPACE_OR_CONVERSATION_REQUIRED"); if (scope === "conversation" && !binding.conversationId) throw error("AGENT_CONVERSATION_BINDING_REQUIRED");
    const controller = currentController(session);
    binding.controlEpoch = randomUUID();
    if (accessMode === "control" && controller && controller.bindingId !== binding.bindingId) {
      if (input.confirmControlTransfer !== "确认切换控制权") throw error("CONTROL_TRANSFER_CONFIRMATION_REQUIRED", 409);
      controller.accessMode = "read"; controller.updatedAt = now(); bindings.set(controller.bindingId, controller); cancelControllerActions(controller.bindingId);
    }
    if (previous) cancelControllerActions(previous.bindingId);
    bindings.set(binding.bindingId, binding); saveBindings(); syncSession(session); return binding;
  }
  function createCredentialRef(providerId, installationId) {
    const service = `com.tianyuan.workbench.agent.${providerId}.${installationId}`;
    const account = "connector-bridge";
    const secret = randomBytes(32).toString("base64url");
    const credentialPath = path.join(path.dirname(sourcesPath), "agent-credentials.json");
    const key = `${providerId}-${installationId}`;
    return bridgePlatformAdapter.createCredentialReference({
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

  function zcodeRows(query) {
    if (!fs.existsSync(zcodeDbPath)) throw error("ZCODE_CATALOG_UNAVAILABLE", 503);
    try {
      const output = execFileSync("sqlite3", ["-json", zcodeDbPath, query], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return output ? JSON.parse(output) : [];
    } catch {
      throw error("ZCODE_CATALOG_UNAVAILABLE", 503);
    }
  }

  function zcodeCatalog() {
    const rows = zcodeRows("SELECT id, project_id, COALESCE(NULLIF(directory, ''), NULLIF(path, '')) AS directory, title, task_type, time_updated FROM session WHERE time_archived IS NULL AND parent_id IS NULL ORDER BY time_updated DESC LIMIT 300;");
    const projects = new Map();
    const threads = [];
    for (const row of rows) {
      const projectPath = normalizePath(row?.directory);
      // Zcode 的 project_id 由路径去中文字符生成，中文目录名会互相碰撞
      // （如 .../Codex/天源评估系统 与 .../Codex/飞书 同为 proj_users-…-codex），
      // 因此按目录路径去重，project_id 仅作回退。
      const projectId = projectPath ? `zcode-project:${projectPath}` : limited(row?.project_id, 200);
      if (!row?.id || !projectId) continue;
      const projectName = limited(path.basename(projectPath) || projectId, 200);
      if (!projects.has(projectId)) {
        projects.set(projectId, {
          projectId,
          projectName,
          projectPath,
          path: projectPath,
          updatedAt: Number(row.time_updated || 0) || null,
          source: "zcode-local-db",
        });
      }
      threads.push({
        threadId: limited(row.id, 200),
        title: limited(row.title || `Zcode 对话 ${String(row.id).slice(-8)}`, 300),
        projectId,
        projectName,
        projectPath,
        cwd: projectPath,
        status: limited(row.task_type, 80),
        recencyAt: Math.floor(Number(row.time_updated || 0) / 1000) || null,
        source: "zcode-local-db",
      });
    }
    return {
      projects: [...projects.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
      threads,
      updatedAt: now(),
      source: "zcode-local-db",
    };
  }

  async function agentCatalog(providerId = "codex") {
    if (providerId === "workbuddy") return workbuddyCatalog();
    if (providerId === "zcode") return zcodeCatalog();
    return codexCatalog();
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
      if (req.method === "GET" && url.pathname === "/api/catalog") { requireBrowser(req); const providerId = limited(url.searchParams.get("providerId") || "codex", 80).toLowerCase(); if (!["codex", "workbuddy", "zcode"].includes(providerId)) throw error("AGENT_PROVIDER_UNSUPPORTED", 400); return json(res, 200, { ok: true, providerId, ...(await agentCatalog(providerId)) }, origin); }
      if (req.method === "POST" && url.pathname === "/api/sessions/register") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const input = await body(req); const sessionId = limited(input.sessionId || id("tianyuan"), 200); const existing = sessions.get(sessionId); if (existing) for (const action of actions.values()) if (action.sessionId === sessionId && ["queued", "claimed", "running"].includes(action.status)) stopAction(action, "SESSION_RECONNECTED"); const session = { sessionId, sessionEpoch: randomUUID(), status: "online", registeredAt: existing?.registeredAt || now(), lastSeenAt: now(), binding: safePage(input.binding), client: safeClient(input.client), context: safeContext(input.context), capabilities: capabilities() }; sessions.set(sessionId, session); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "GET" && url.pathname === "/api/sessions") { const agent = isBrowser(req) ? null : identity(req, true); const result = [...sessions.values()].filter((session) => !agent || bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)).map((session) => publicSession(session, agent)); return json(res, 200, { ok: true, sessions: result }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "heartbeat") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); session.lastSeenAt = now(); if (input.binding) session.binding = safePage(input.binding); if (input.context) session.context = safeContext(input.context); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = createBinding(session, await body(req)); return json(res, 200, { ok: true, binding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "DELETE" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = bindings.get(parts[4]); if (!binding || binding.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 404); bindings.delete(binding.bindingId); cancelControllerActions(binding.bindingId); saveBindings(); syncSession(session); return json(res, 200, { ok: true, cleared: true, bindingId: binding.bindingId, session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings" && parts[5] === "access") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const previous = bindings.get(parts[4]); if (!previous || previous.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 404); const changed = createBinding(session, { ...previous, ...input, bindingId: previous.bindingId, providerId: previous.providerId, installationId: previous.installationId, agentId: previous.agentId }); return json(res, 200, { ok: true, binding: publicBinding(changed), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { ...input, providerId: "codex", installationId: source.installationId, agentId: source.agentId, workspaceId: input.projectId, workspaceName: input.projectName, workspacePath: input.projectPath, conversationId: input.threadId, conversationTitle: input.threadTitle, scope: input.scope === "project" ? "workspace" : "conversation", accessMode: input.accessMode || "control" }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding" && parts[4] === "current-thread") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const catalog = await codexCatalog(); const candidate = catalog.threads.find((thread) => (input.projectId && thread.projectId === input.projectId) || (input.projectPath && normalizePath(thread.projectPath) === normalizePath(input.projectPath))) || null; if (!candidate) throw error("CURRENT_THREAD_NOT_FOUND", 404); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { providerId: "codex", installationId: source.installationId, workspaceId: candidate.projectId, workspaceName: candidate.projectName, workspacePath: candidate.projectPath, conversationId: candidate.threadId, conversationTitle: candidate.title, scope: "conversation", accessMode: "control", confirmControlTransfer: input.confirmControlTransfer }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), thread: candidate, session: publicSession(session) }, origin); }
      if (req.method === "DELETE" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const target = bindingsFor(session.binding).find((binding) => binding.providerId === "codex"); if (target) { bindings.delete(target.bindingId); cancelControllerActions(target.bindingId); saveBindings(); } return json(res, 200, { ok: true, cleared: Boolean(target), session: publicSession(session) }, origin); }
      if (parts.length === 3 && parts[0] === "api" && parts[1] === "sessions" && req.method === "GET") { const session = sessionForBinding(parts[2]); const agent = isBrowser(req) ? null : identity(req, true); if (agent && !bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)) throw error("AGENT_BINDING_MISMATCH", 403); return json(res, 200, { ok: true, session: publicSession(session, agent) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = createAction(session, agent, await body(req)); return json(res, 200, { ok: true, action: publicAction(action), security: { fileContentsReturned: false } }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "ui-actions") { requireBrowser(req); const session = sessionForBinding(parts[2]); const controller = currentController(session); if (!controller) throw error("AGENT_CONTROL_CONFLICT", 409); const input = await body(req); const agent = { agentId: controller.agentId, providerId: controller.providerId, installationId: controller.installationId, displayName: controller.displayName }; const action = createAction(session, agent, { ...input, bindingId: controller.bindingId, projectId: input.projectId || controller.workspaceId, threadId: input.threadId || controller.conversationId }); return json(res, 200, { ok: true, action: publicAction(action), security: { fileContentsReturned: false } }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[4] === "next") {
        if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403);
        const session = sessionForBinding(parts[2]); const binding = browserBinding(session, url.searchParams.get("bindingId"), false);
        const action = [...actions.values()].filter((item) => item.sessionId === session.sessionId && item.bindingId === binding.bindingId && item.status === "queued").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
        if (!action) return json(res, 200, { ok: true, action: null }, origin);
        if (REPORT_ACTIONS.includes(action.type) && !reportClaimIsCurrent(action, session, binding)) {
          action.status = "cancelled"; action.cancellationReason = "REPORT_TARGET_OR_CONTROL_CHANGED"; action.completedAt = now();
          return json(res, 200, { ok: true, action: null }, origin);
        }
        if (REPORT_WRITE_ACTIONS.includes(action.type) || REPORT_UI_CONTROL_ACTIONS.includes(action.type)) {
          try {
            if (action.type === "report_reload") {
              if (action.structureReload) {
                const stage = action.structureReload;
                claimReportStructureReload({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: stage.actionId,
                  operation: stage.operation, nodeRef: stage.nodeRef, scopeRef: stage.scopeRef, owner: stage.owner, reloadActionId: action.actionId });
              } else {
                claimReportReload({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, bindingId: action.bindingId, tabId: action.target.tabId, actionId: action.actionId });
              }
            }
            else if (action.type === "report_editor_save" && action.stagedSave) {
              const modelHash = claimReportStageSave({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.stagedSave.nodeRef, owner: action.stagedSave.owner, actionId: action.actionId });
              if (modelHash !== action.stagedSave.modelHash) throw new Error("REPORT_PENDING_VERIFY");
              action.target.expectedModelHash = modelHash;
            }
            else if (action.type === "report_editor_save") throw new Error("REPORT_SAVE_STAGE_REQUIRED");
            else if (action.type === "report_execute" && action.pendingSettingsReopen) {
              if (!action.settingsOpen || !canReopenReportSettings({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.settingsOpen.nodeRef, owner: reportPendingOwner(session, binding) })) throw new Error("REPORT_PENDING_VERIFY");
            }
            else if (action.type === "report_execute" && action.settingsOpen) markReportPending({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId, action: action.type, settingsOpen: { ...action.settingsOpen, owner: reportPendingOwner(session, binding) } });
            else if (action.type === "report_execute" && action.settingsWriteIntent) markReportPending({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId, action: action.type, settingsWriteIntent: action.settingsWriteIntent });
            else if (REPORT_WRITE_ACTIONS.includes(action.type) || ["report_editor_open", "report_editor_close"].includes(action.type)) markReportPending({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId, action: action.type });
            else if (hasReportPending(pendingDirectory, action.target.reportIdentity)) throw new Error("REPORT_PENDING_VERIFY");
          } catch (cause) {
            action.status = "failed"; action.completedAt = now();
            action.result = { ok: false, reason: cause.message === "REPORT_PENDING_VERIFY" ? "REPORT_PENDING_VERIFY" : cause.message === "REPORT_SAVE_STAGE_REQUIRED" ? "REPORT_SAVE_STAGE_REQUIRED" : "REPORT_PENDING_JOURNAL_FAILED" };
            return json(res, 200, { ok: true, action: null }, origin);
          }
        }
        if (actionIsWrite(action.type)) browserBinding(session, binding.bindingId, true);
        action.status = "claimed"; action.claimedAt = now();
        const file = action.file ? { name: action.file.name, size: action.file.size, type: action.file.type, base64: fs.readFileSync(action.file.path).toString("base64") } : null;
        const files = (action.files || []).map((item) => ({ name: item.name, size: item.size, type: item.type, moduleName: item.moduleName, moduleIndex: item.moduleIndex, base64: fs.readFileSync(item.path).toString("base64") }));
        const claimTarget = action.type === "report_inspect" ? { ...action.target, offset: action.target.inspectOffset, limit: action.target.inspectLimit } : action.type === "report_node_read" && action.structureScopeRead
          ? { ...action.target, structureScopeRead: true, structurePartialRead: action.structurePartialRead === true, scopeRef: action.structureScopeRead.scopeRef, operationIndex: action.structureScopeRead.operationIndex }
          : action.target;
        return json(res, 200, { ok: true, action: { ...publicAction(action), payload: { action: action.type, ...claimTarget, confirmText: action.confirmText, file, files } }, security: { filePathReturned: false, fileContentsEphemeral: Boolean(file || files.length) } }, origin);
      }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[5] === "cancel") {
        const agent = identity(req, true); const session = sessionForBinding(parts[2]); const input = await body(req); const action = actions.get(parts[4]);
        if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404);
        if (!REPORT_ACTIONS.includes(action.type)) throw error("ACTION_CANCEL_UNSUPPORTED", 400);
        authorize(session, agent, { ...input, bindingId: action.bindingId }, false);
        if (["queued", "claimed", "running"].includes(action.status)) stopAction(action, "AGENT_WAIT_INTERRUPTED");
        return json(res, 200, { ok: true, action: publicAction(action) }, origin);
      }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[5] === "result") {
        if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403);
        const session = sessionForBinding(parts[2]); const input = await body(req, 5 * 1024 * 1024); const action = actions.get(parts[4]);
        if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404);
        if (action.bindingId !== input.bindingId) throw error("AGENT_BINDING_MISMATCH", 403);
        const binding = browserBinding(session, input.bindingId, actionIsWrite(action.type) || action.type === "report_preview");
        if (action.status === "cancelled") throw error("AGENT_CONTROL_REVOKED", 409);
        if (!["claimed", "running"].includes(action.status)) throw error("ACTION_NOT_CLAIMED", 409);
        if (REPORT_ACTIONS.includes(action.type) && (action.sessionEpoch !== session.sessionEpoch || action.controlEpoch !== (binding.controlEpoch || binding.updatedAt))) throw error("AGENT_CONTROL_REVOKED", 409);
        action.result = input.result && typeof input.result === "object" ? input.result : {};
        if (action.type === "report_reload" && action.result.ok === true && action.result.reloadRequested === true) {
          try {
            if (action.structureReload) {
              const stage = action.structureReload;
              recordReportStructureReloadRequested({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: stage.actionId,
                operation: stage.operation, nodeRef: stage.nodeRef, scopeRef: stage.scopeRef, owner: stage.owner, reloadActionId: action.actionId,
                documentTimeOrigin: stage.origin.documentTimeOrigin });
            } else {
              recordReportReloadRequested({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, bindingId: action.bindingId, tabId: action.target.tabId, actionId: action.actionId });
            }
          }
          catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", security: { readOnly: true, writesPerformed: false, credentialsReturned: false } }; }
        }
        if (action.type === "report_editor_save" && action.stagedSave && action.result.security?.writesPerformed === true && Number.isFinite(action.result.documentTimeOrigin)) {
          try { recordReportSaveDocument({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId, documentTimeOrigin: action.result.documentTimeOrigin }); }
          catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", security: { writesPerformed: true, credentialsReturned: false } }; }
        }
        if (action.type === "report_node_read" && action.structureScopeRead) {
          const observed = action.result;
          const stage = action.structureScopeRead;
          if (action.structurePartialRead) {
            const editorModel = observed.privateSavedVerification;
            delete observed.privateSavedVerification;
            try {
              if (observed.ok !== true || !observed.structureReadback || !observed.node || !observed.editor || !editorModel
                || !Number.isFinite(observed.documentTimeOrigin)) throw error("REPORT_PENDING_READBACK_MISMATCH");
              const verified = archiveReportStructurePartialAfterReadback({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity,
                nodeRef: action.target.nodeRef, owner: stage.owner, snapshotDirectory, snapshot: stage.snapshot,
                observedTreeSnapshot: observed.structureReadback, observedNode: observed.node, editor: observed.editor, editorModel,
                documentTimeOrigin: observed.documentTimeOrigin, security: observed.security });
              action.result = {
                ok: true, action: "report_node_read", status: "partial", node: { nodePathKey: observed.node.nodePathKey, label: observed.node.label, candidateId: observed.node.candidateId },
                structureVerification: { verified: true, structureStatus: verified.structureStatus, partial: true, titlePending: true,
                  titleNotExecuted: true, operationComplete: false, actionComplete: false, structurePendingReleased: verified.structurePendingReleased,
                  reportPendingRetained: verified.reportPendingRetained, createdNodeRef: verified.createdNodeRef, archiveId: verified.archiveId },
                security: { readOnly: true, writesPerformed: false, ...(observed.uiStateChanged ? { uiStateChanged: true } : {}), credentialsReturned: false },
              };
            } catch (cause) {
              action.result = { ok: false, status: "pendingVerify", reason: /^REPORT_[A-Z0-9_]+$/.test(cause.message) ? cause.message : "REPORT_PENDING_READBACK_MISMATCH",
                ...(observed.node ? { node: { nodePathKey: observed.node.nodePathKey, label: observed.node.label, candidateId: observed.node.candidateId } } : {}),
                ...(observed.editor ? { editor: { modelAvailable: observed.editor.modelAvailable, modelHash: observed.editor.modelHash, modelEditable: observed.editor.modelEditable, domEditable: observed.editor.domEditable, saveControlAvailable: observed.editor.saveControlAvailable } } : {}),
                security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
            }
          } else {
            try {
              if (observed.ok !== true || !observed.structureReadback || !Number.isFinite(observed.documentTimeOrigin)) throw error("REPORT_PENDING_READBACK_MISMATCH");
              const verified = archiveReportStructureAfterReloadReadback({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity,
                actionId: stage.actionId, operation: stage.operation, nodeRef: stage.nodeRef, scopeRef: stage.scopeRef, owner: stage.owner,
                reloadActionId: stage.reloadActionId, snapshotDirectory, snapshot: stage.snapshot, observedTreeSnapshot: observed.structureReadback,
                origin: { documentTimeOrigin: observed.documentTimeOrigin, ...(stage.origin.pageOrigin ? { pageOrigin: stage.origin.pageOrigin } : {}) } });
              action.result.structureVerification = {
                verified: true, structureStatus: verified.structureStatus, titlePending: verified.titlePending,
                operationComplete: verified.operationComplete, actionComplete: verified.actionComplete,
                ...(verified.createdNodeRef ? { createdNodeRef: verified.createdNodeRef } : {}),
              };
              if (verified.titlePending) action.result.status = "pendingVerify";
            } catch (cause) {
              action.result = { ok: false, status: "pendingVerify", reason: /^REPORT_[A-Z0-9_]+$/.test(cause.message) ? cause.message : "REPORT_PENDING_READBACK_MISMATCH",
                ...(observed.structureReadback ? { structureReadback: observed.structureReadback } : {}),
                security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
            }
          }
        }
        const savedVerification = action.type === "report_node_read" && action.target.verifySaved ? action.result.privateSavedVerification : null;
        delete action.result.privateSavedVerification;
        if (action.type === "report_node_read" && action.target.verifySaved && action.target.include.includes("settings")) {
          const observed = action.result;
          try {
            if (observed.ok !== true || observed.node?.candidateId !== action.target.nodeRef.candidateId || observed.node?.nodePathKey !== action.target.nodeRef.nodePathKey) throw error("REPORT_NODE_REF_INVALID");
            const owner = reportPendingOwner(session, binding);
            const stage = readReportSettingsStage({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, owner });
            if (!stage.reloadActionId || !stage.reloadRequested) throw error("REPORT_RELOAD_REQUIRED");
            const verified = archiveReportPendingAfterSettingsReadback({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, owner, reloadActionId: stage.reloadActionId, documentTimeOrigin: observed.documentTimeOrigin, settings: observed.settings });
            action.result.settingsVerification = { verified: true, fields: verified.settings, archiveId: verified.archiveId };
          } catch (cause) {
            const reason = /^REPORT_[A-Z0-9_]+$/.test(cause.message) ? cause.message : "REPORT_PENDING_READBACK_MISMATCH";
            action.result = { ok: false, status: "pendingVerify", reason, ...(observed.node ? { node: observed.node } : {}), ...(observed.settings ? { settings: observed.settings } : {}), security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
          }
        }
        if (action.type === "report_node_read" && action.target.verifySaved && !action.target.include.includes("settings") && !action.structureScopeRead && action.result.ok) {
          try {
            if (action.result.node?.candidateId !== action.target.nodeRef.candidateId
              || action.result.node?.nodePathKey !== action.target.nodeRef.nodePathKey) throw error("REPORT_NODE_REF_INVALID");
            const orphanSaveActionId = orphanReportSaveActionId({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity });
            if (orphanSaveActionId) {
              if (!savedVerification?.model || savedVerification.model.type !== "doc") throw error("REPORT_PRIVATE_SNAPSHOT_MISSING");
              const observedModelHash = action.result.editor?.modelHash;
              const actualModelHash = `sha256:${createHash("sha256").update(JSON.stringify(savedVerification.model)).digest("hex")}`;
              if (observedModelHash !== actualModelHash) throw error("REPORT_MODEL_HASH_MISMATCH");
              const owner = { sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, bindingId: action.bindingId, controlEpoch: action.controlEpoch, tabId: action.target.tabId };
              const snapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, model: savedVerification.model });
              stageOrphanReportSave({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, owner, actionId: orphanSaveActionId, modelHash: actualModelHash, documentTimeOrigin: savedVerification.documentTimeOrigin });
              action.result = { ok: true, action: "report_node_read", recoveryStaged: true, node: action.result.node, pendingRecovery: { modelHash: actualModelHash, snapshotId: snapshot.snapshotId, snapshotSha256: snapshot.sha256, snapshotBytes: snapshot.bytes }, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
            } else {
              if (action.result.editor?.modelEditable !== false || action.result.editor?.domEditable !== "false") throw error("REPORT_READBACK_UNVERIFIED");
              const verified = verifyReportSavedAfterReload({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, nodeRef: action.target.nodeRef, snapshotDirectory, model: savedVerification?.model, observedModelHash: action.result.editor?.modelHash, documentTimeOrigin: savedVerification?.documentTimeOrigin, bindingId: action.bindingId, tabId: action.target.tabId });
              action.result.savedVerification = { verified: true, modelHash: verified.modelHash, archiveId: verified.archiveId };
            }
          } catch (cause) {
            const recoveryErrors = new Set(["REPORT_READBACK_UNVERIFIED", "REPORT_NODE_REF_INVALID", "REPORT_PRIVATE_SNAPSHOT_MISSING", "REPORT_MODEL_HASH_MISMATCH", "REPORT_RELOAD_REQUIRED", "REPORT_PENDING_READBACK_MISMATCH", "REPORT_PENDING_RECOVERY_MISMATCH", "REPORT_SNAPSHOT_IDENTITY_INVALID", "REPORT_SNAPSHOT_MODEL_INVALID", "REPORT_SNAPSHOT_DIRECTORY_UNSAFE", "REPORT_SNAPSHOT_TOO_LARGE"]);
            action.result = { ok: false, reason: recoveryErrors.has(cause.message) || /^REPORT_[A-Z0-9_]+$/.test(cause.message) ? cause.message : "REPORT_READBACK_UNVERIFIED", security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
          }
        }
        if (action.type === "report_execute" && action.stagedNodeRef && action.result.reason === "REPORT_PERSISTENCE_UNVERIFIED"
          && action.result.executed === 1 && action.result.security?.writesPerformed === true && action.result.results?.length === 1
          && action.result.results[0]?.status === "pendingVerify" && !action.result.results[0]?.error
          && (!action.stagedRequiresFormatVerification || action.result.results[0]?.readback?.formatScopeVerified === true)
          && /^sha256:[0-9a-f]{64}$/.test(action.result.results[0]?.readback?.modelHash || "")) {
          const owner = { sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, bindingId: action.bindingId, controlEpoch: action.controlEpoch, tabId: action.target.tabId };
          try { stageReportPending({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId, nodeRef: action.stagedNodeRef, owner, modelHash: action.result.results[0].readback.modelHash }); }
          catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", security: { writesPerformed: true, credentialsReturned: false } }; }
        }
        if (action.type === "report_execute" && action.structureIntent && action.result.reason === "REPORT_PERSISTENCE_UNVERIFIED"
          && action.result.executed === 1 && action.target.planHash === action.structureIntent.planHash
          && action.result.results?.length === 1 && action.result.results[0]?.index === action.structureIntent.operationIndex
          && action.result.results[0]?.status === "pendingVerify" && action.result.security?.writesPerformed === true) {
          const expectedKind = action.structureIntent.operation === "structure_add_sibling" ? "structure_add" : action.structureIntent.operation;
          if (action.result.results[0]?.kind === expectedKind) {
            try {
              const staged = stageReportStructurePending({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity,
                actionId: action.actionId, operation: action.structureIntent.operation, nodeRef: action.structureIntent.nodeRef,
                scopeRef: action.structureIntent.scopeRef, snapshotDirectory, snapshot: action.structureIntent.snapshot,
                operationIndex: action.structureIntent.operationIndex, owner: action.structureIntent.owner,
                origin: action.structureIntent.origin, intendedTitle: action.structureIntent.intendedTitle });
              action.result.structurePending = { status: staged.status, operation: staged.operation, actionId: action.actionId };
            } catch {
              action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", executed: 1,
                security: { readOnly: false, writesPerformed: true, credentialsReturned: false } };
            }
          }
        }
        if (action.type === "report_execute" && action.settingsWriteIntent && action.result.reason === "REPORT_PERSISTENCE_UNVERIFIED"
          && action.result.executed === 1 && action.result.status === "pendingVerify" && action.result.security?.writesPerformed === true
          && action.result.results?.length === 1 && action.result.results[0]?.kind === "settings_write"
          && action.result.results[0]?.status === "pendingVerify" && action.result.submissionAttempted === true
          && action.result.documentTimeOrigin > 0 && Number.isFinite(action.result.documentTimeOrigin)
          && JSON.stringify(action.result.expectedFields) === JSON.stringify(action.settingsWriteIntent.expectedFields)
          && action.result.results[0]?.readback?.fields?.some((field) => field?.label === "是否编号" && JSON.stringify(field.selected) === JSON.stringify(["是"]))) {
          try {
            recordReportSettingsStage({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId,
              nodeRef: action.settingsWriteIntent.nodeRef, owner: action.settingsWriteIntent.owner, planHash: action.settingsWriteIntent.planHash,
              expectedFields: action.settingsWriteIntent.expectedFields, submissionAttempted: action.result.submissionAttempted,
              documentTimeOrigin: action.result.documentTimeOrigin, submitActionId: action.actionId });
          } catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", executed: 1, submissionAttempted: true, documentTimeOrigin: action.result.documentTimeOrigin, security: { writesPerformed: true, credentialsReturned: false } }; }
        }
        if (action.type === "report_execute" && action.settingsOpen && !action.pendingSettingsReopen && action.result.ok === true
          && action.result.executed === 1 && action.result.security?.writesPerformed === false && action.result.results?.length === 1
          && action.result.results[0]?.kind === "settings_open" && action.result.results[0]?.status === "verified"
          && action.result.results[0]?.readback?.settingsDialogOpen === true && action.result.results[0]?.readback?.targetVerified === true) {
          try {
            const archived = archiveReportPendingAfterSettingsOpen({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId,
              nodeRef: action.settingsOpen.nodeRef, owner: reportPendingOwner(session, binding), planHash: action.settingsOpen.planHash,
              dialogOpen: action.result.results[0].readback.settingsDialogOpen, targetVerified: action.result.results[0].readback.targetVerified });
            action.result.settingsOpenVerification = { verified: true, saved: false, archiveId: archived.archiveId };
          } catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED", executed: 1, security: { readOnly: false, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } }; }
        }
        if (action.type === "report_execute" && !action.settingsOpen && !action.pendingSettingsReopen && action.result.ok === false && action.result.security?.readOnly === true && action.result.security?.writesPerformed === false) {
          try { clearReportPendingAfterNoWrite({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId }); }
          catch { action.result = { ok: false, reason: "REPORT_PENDING_JOURNAL_FAILED", security: { readOnly: true, writesPerformed: false, credentialsReturned: false } }; }
        }
        if (action.type === "report_editor_open" && action.result.modelUnchangedVerified === true && action.result.status !== "pendingVerify" && action.result.security?.writesPerformed === false) {
          try { clearReportPendingAfterNoWrite({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId }); }
          catch { action.result = { ok: false, reason: "REPORT_PENDING_JOURNAL_FAILED" }; }
        }
        if (action.type === "report_editor_close" && action.result.ok === true && action.result.editorClosed === true && action.result.modelUnchangedVerified === true) {
          try { clearReportPendingAfterNoWrite({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId }); }
          catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED" }; }
        }
        if (action.type === "report_editor_close" && action.result.ok === false && action.result.security?.readOnly === true && action.result.security?.writesPerformed === false
          && ["REPORT_TREE_NOT_FOUND", "REPORT_EDITOR_NOT_FOUND", "REPORT_NODE_NOT_FOUND", "REPORT_NODE_CHANGED", "REPORT_NODE_AMBIGUOUS", "REPORT_EDITOR_AMBIGUOUS", "REPORT_EDITOR_IDENTITY_UNVERIFIED", "REPORT_DISCARD_UNSUPPORTED", "REPORT_TARGET_MISMATCH"].includes(action.result.reason)) {
          try { clearReportPendingAfterNoWrite({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId }); }
          catch { action.result = { ok: false, status: "pendingVerify", reason: "REPORT_PENDING_JOURNAL_FAILED" }; }
        }
        if (REPORT_WRITE_ACTIONS.includes(action.type) && action.result.ok === false && action.result.security?.readOnly === true && action.result.security?.writesPerformed === false
          && ["REPORT_PREVIEW_REQUIRED", "REPORT_COMMAND_UNSUPPORTED", "REPORT_CONFIRM_TEXT_INVALID", "REPORT_SAVE_TARGET_UNVERIFIED"].includes(action.result.reason)) {
          try { clearReportPendingAfterNoWrite({ directory: pendingDirectory, reportIdentity: action.target.reportIdentity, actionId: action.actionId }); }
          catch { action.result = { ok: false, reason: "REPORT_PENDING_JOURNAL_FAILED" }; }
        }
        const privateSnapshots = action.type === "report_preview" && Array.isArray(action.result.privateSnapshots) ? action.result.privateSnapshots : [];
        const privateTreeSnapshots = action.type === "report_preview" && Array.isArray(action.result.privateTreeSnapshots) ? action.result.privateTreeSnapshots : [];
        delete action.result.privateSnapshots;
        delete action.result.privateTreeSnapshots;
        if (action.type === "report_preview" && action.result.ok) {
          const structureCount = action.target.ops.filter((op) => typeof op.kind === "string" && op.kind.startsWith("structure_")).length;
          const confirmationRequired = structureCount ? "确认执行报告结构修改" : "确认执行报告修改";
          const supportedStructureOps = new Set(["structure_add_child", "structure_add_sibling", "structure_delete"]);
          const structureUnsupported = structureCount > 0 && (structureCount !== 1 || action.target.ops.length !== 1 || !supportedStructureOps.has(action.target.ops[0]?.kind));
          if (!/^plan-[0-9a-f]{32}$/.test(action.result.planHash || "") || (structureCount && structureCount !== action.target.ops.length) || structureUnsupported || action.result.confirmationRequired !== confirmationRequired) action.result = { ok: false, reason: structureUnsupported ? "REPORT_STRUCTURE_OPERATION_UNSUPPORTED" : "REPORT_ADAPTER_INCOMPATIBLE" };
          else {
            const snapshotResults = [];
            const snapshotRecords = [];
            const seen = new Set();
            const treeSnapshotResults = [];
            const treeSnapshotRecords = [];
            const seenTreeIndexes = new Set();
            try {
              if (privateSnapshots.length > action.target.ops.length) throw error("REPORT_SNAPSHOT_INVALID");
              for (const snapshot of privateSnapshots) {
                const ref = snapshot?.nodeRef;
                if (!ref || seen.has(ref.candidateId) || !action.target.ops.some((op) => op.nodeRef?.candidateId === ref.candidateId && op.nodeRef?.nodePathKey === ref.nodePathKey && ["editor_text", "editor_command"].includes(op.kind))) throw error("REPORT_SNAPSHOT_INVALID");
                seen.add(ref.candidateId);
                const saved = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity: action.target.reportIdentity, nodeRef: ref, model: snapshot.model });
                snapshotResults.push(saved);
                snapshotRecords.push({ snapshot: saved, nodeRef: { nodePathKey: ref.nodePathKey, candidateId: ref.candidateId } });
              }
              if (privateTreeSnapshots.length > action.target.ops.length) throw error("REPORT_SNAPSHOT_INVALID");
              for (const snapshot of privateTreeSnapshots) {
                const ref = snapshot?.nodeRef;
                const operationIndex = snapshot?.operationIndex;
                const operationKind = snapshot?.operationKind;
                const op = Number.isInteger(operationIndex) ? action.target.ops[operationIndex] : null;
                if (!ref || seenTreeIndexes.has(operationIndex) || !op || !["settings_open", "settings_write", "structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"].includes(op.kind)
                  || op.kind !== operationKind || op.nodeRef?.candidateId !== ref.candidateId || op.nodeRef?.nodePathKey !== ref.nodePathKey || snapshot.treeSnapshot?.complete !== true
                  || op.kind.startsWith("structure_") && (!Number.isFinite(snapshot.origin?.documentTimeOrigin) || snapshot.origin.documentTimeOrigin <= 0 || typeof snapshot.origin.pageOrigin !== "string")) throw error("REPORT_SNAPSHOT_INVALID");
                seenTreeIndexes.add(operationIndex);
                const saved = saveReportTreeSnapshot({ directory: snapshotDirectory, reportIdentity: action.target.reportIdentity, nodeRef: ref, operationIndex, operationKind, treeSnapshot: snapshot.treeSnapshot });
                treeSnapshotResults.push(saved);
                treeSnapshotRecords.push({ snapshot: saved, nodeRef: { nodePathKey: ref.nodePathKey, candidateId: ref.candidateId }, operationIndex, operationKind, ...(snapshot.origin ? { origin: snapshot.origin } : {}) });
              }
            } catch {
              action.result = { ok: false, reason: "REPORT_SNAPSHOT_FAILED" };
            }
            if (!action.result.ok) {
              action.status = "failed"; action.completedAt = now();
              return json(res, 200, { ok: true, action: publicAction(action) }, origin);
            }
            action.result.snapshots = snapshotResults;
            action.result.treeSnapshots = treeSnapshotResults;
            while (reportPlans.size >= 256) reportPlans.delete(reportPlans.keys().next().value);
            const snapshotReady = action.target.ops.every((op, index) => ["editor_text", "editor_command"].includes(op.kind)
              ? seen.has(op.nodeRef.candidateId)
              : ["settings_open", "settings_write", "structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"].includes(op.kind) && seenTreeIndexes.has(index));
            action.result.snapshotReady = snapshotReady;
            const singleOp = action.target.ops.length === 1 ? action.target.ops[0] : null;
            const stagedRequiresFormatVerification = singleOp?.kind === "editor_command" && ["bold", "italic", "underline", "strikethrough"].includes(singleOp.command) && typeof singleOp.find === "string" && singleOp.find.length > 0;
            const stagedNodeRef = singleOp && (singleOp.kind === "editor_text" || stagedRequiresFormatVerification) ? singleOp.nodeRef : null;
            const settingsOpenNodeRef = singleOp?.kind === "settings_open" ? singleOp.nodeRef : null;
            const settingsWriteIntent = singleOp?.kind === "settings_write" && singleOp.fields?.length === 1 && singleOp.fields[0]?.label === "是否编号" && singleOp.fields[0]?.value === "是"
              ? { nodeRef: singleOp.nodeRef, expectedFields: [{ label: "是否编号", value: "是" }] }
              : null;
            let structureIntent = null;
            if (structureCount === 1 && singleOp && ["structure_add_child", "structure_add_sibling", "structure_delete"].includes(singleOp.kind)) {
              const record = treeSnapshotRecords.find((item) => item.operationIndex === 0);
              if (record) {
                try {
                  const baseline = readReportTreeSnapshot({ directory: snapshotDirectory, snapshot: record.snapshot, reportIdentity: action.target.reportIdentity,
                    nodeRef: record.nodeRef, operationIndex: record.operationIndex, operationKind: record.operationKind });
                  const pageOrigin = new URL(record.origin?.pageOrigin || "");
                  if (!baseline.scopeRef || !Object.hasOwn(baseline, "scopeTarget") || !Number.isFinite(record.origin?.documentTimeOrigin)
                    || record.origin.documentTimeOrigin <= 0 || !["http:", "https:"].includes(pageOrigin.protocol) || pageOrigin.origin !== record.origin.pageOrigin) throw error("REPORT_SNAPSHOT_TARGET_MISMATCH");
                  structureIntent = { operation: singleOp.kind, operationIndex: 0, nodeRef: singleOp.nodeRef,
                    scopeRef: baseline.scopeRef, snapshot: record.snapshot, origin: record.origin, intendedTitle: singleOp.title, planHash: action.result.planHash };
                } catch { action.result = { ok: false, reason: "REPORT_SNAPSHOT_FAILED" }; }
              } else action.result = { ok: false, reason: "REPORT_SNAPSHOT_FAILED" };
            }
            if (action.result.ok) reportPlans.set(action.result.planHash, { sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, bindingId: action.bindingId, controlEpoch: action.controlEpoch, tabId: action.target.tabId, reportIdentity: action.target.reportIdentity, confirmationRequired, snapshotReady, snapshots: snapshotRecords, treeSnapshots: treeSnapshotRecords, stagedNodeRef, stagedRequiresFormatVerification, settingsOpenNodeRef, settingsWriteIntent, structureIntent });
          }
        }
        action.status = action.result.ok ? "completed" : "failed"; action.completedAt = now();
        return json(res, 200, { ok: true, action: publicAction(action) }, origin);
      }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "ui-actions") { requireBrowser(req); const session = sessionForBinding(parts[2]); const action = actions.get(parts[4]); const controller = currentController(session); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); if (!controller || action.bindingId !== controller.bindingId) throw error("AGENT_CONTROL_CONFLICT", 409); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = actions.get(parts[4]); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); authorize(session, agent, { bindingId: action.bindingId, workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("projectId") || "", conversationId: url.searchParams.get("conversationId") || url.searchParams.get("threadId") || "" }, REPORT_ACTIONS.includes(action.type) ? false : actionIsWrite(action.type)); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      throw error("NOT_FOUND", 404);
    } catch (cause) { return fail(res, cause, origin); }
  }
  return { async start(port) { const server = createServer((req, res) => { handle(req, res).catch((cause) => fail(res, cause)); }); await new Promise((resolve) => server.listen(Number(port || 40415), "127.0.0.1", resolve)); return server; }, handle, paths: { bindingsPath, sourcesPath, configDir, workbuddyDbPath, zcodeDbPath } };
}

async function health(port = 40415) { try { const response = await fetch(`http://127.0.0.1:${Number(port)}/health`); return response.ok ? await response.json() : { ok: false, reason: `CONNECTOR_HTTP_${response.status}` }; } catch { return { ok: false, reason: "CONNECTOR_NOT_RUNNING" }; } }
async function start(options = {}) { const bridge = createBridge(options); const port = Number(options.port || process.env.TIANYUAN_CONNECTOR_PORT || 40415); const server = await bridge.start(port); process.stdout.write(`Tianyuan connector bridge listening on http://127.0.0.1:${port}\n`); return { bridge, server }; }
module.exports = { BUILD_ID, PROTOCOL_VERSION, createBridge, health, start };
