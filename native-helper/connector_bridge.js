"use strict";

const { execFileSync } = require("node:child_process");
const { createServer } = require("node:http");
const { randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROTOCOL_VERSION = "connector-agent-binding-v2";
const ACTION_TTL_MS = 5 * 60 * 1000;
const ACTION_RESULT_TTL_MS = 15 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".zip", ".rar"]);
const EXTENSION_ORIGINS = new Set([
  "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
  "chrome-extension://fdbllnmaaklkcmoacoapbibiggnndkfpa",
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
function safeContext(value = {}) {
  const route = value.route && typeof value.route === "object" ? value.route : {};
  const spread = value.spread && typeof value.spread === "object" ? value.spread : {};
  const page = value.page && typeof value.page === "object" ? value.page : {};
  return {
    route: { isTianyuanRoute: Boolean(route.isTianyuanRoute), isAssetDraftRoute: Boolean(route.isAssetDraftRoute), isEquityListRoute: Boolean(route.isEquityListRoute), projectId: limited(route.projectId, 80), companyId: limited(route.companyId, 80), subjectCode: limited(route.subjectCode, 120) },
    spread: { found: Boolean(spread.found), sheetName: limited(spread.sheetName, 160), activeRow: Number.isInteger(spread.activeRow) ? spread.activeRow : null, activeColumn: Number.isInteger(spread.activeColumn) ? spread.activeColumn : null },
    gates: { loginLikely: Boolean(page.loginLikely), saveVisible: Boolean(page.saveButton?.visible), saveDisabled: Boolean(page.saveButton?.disabled), hasLockText: Boolean(limited(page.lockText)), hasPermissionText: Boolean(limited(page.permissionText)) },
  };
}
function safeClient(value = {}) { return { name: limited(value.name || "tianyuan-browser-workbench", 120), version: limited(value.version, 80), extensionId: limited(value.extensionId, 120) }; }
function publicSource(source) {
  return source ? { agentId: source.agentId, providerId: source.providerId, displayName: source.displayName, installationId: source.installationId, manual: Boolean(source.manual), createdAt: source.createdAt || null, updatedAt: source.updatedAt || null, lastSeenAt: source.lastSeenAt || null } : null;
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
function isBrowser(req) { return EXTENSION_ORIGINS.has(String(req.headers.origin || "")); }
function allowedOrigin(req) { const origin = String(req.headers.origin || ""); return isBrowser(req) ? origin : ""; }
function json(res, status, payload, origin = "") { const body = JSON.stringify({ ...payload, security: { credentialsReturned: false, ...(payload.security || {}) } }); res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-allow-headers": "content-type,x-tianyuan-agent-provider,x-tianyuan-agent-installation,x-tianyuan-agent-credential", ...(origin ? { "access-control-allow-origin": origin } : {}) }); res.end(body); }
function fail(res, cause, origin = "") { json(res, cause?.status || 500, { ok: false, reason: cause?.code || cause?.message || String(cause) }, origin); }
function body(req, limit = 1024 * 1024) { return new Promise((resolve, reject) => { let text = ""; req.setEncoding("utf8"); req.on("data", (chunk) => { text += chunk; if (Buffer.byteLength(text, "utf8") > limit) { req.destroy(); reject(error("CONNECTOR_REQUEST_TOO_LARGE", 413)); } }); req.on("end", () => { if (!text.trim()) return resolve({}); try { resolve(JSON.parse(text)); } catch { reject(error("CONNECTOR_INVALID_JSON")); } }); req.on("error", reject); }); }

function resolveCredential(reference) {
  const ref = String(reference || "");
  if (ref.startsWith("keychain:")) {
    const [, service, account] = ref.split(":");
    if (!service || !account) return "";
    try { return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
  }
  if (ref.startsWith("file:")) {
    const [filePart, key] = ref.slice(5).split("#");
    try { const values = readJson(filePart, {}); return String(values?.secrets?.[key] || values?.[key] || ""); } catch { return ""; }
  }
  return "";
}

function createBridge(options = {}) {
  const home = os.homedir();
  const bindingsPath = options.bindingsPath || process.env.TIANYUAN_CONNECTOR_BINDINGS_PATH || path.join(home, ".tianyuan-workbench", "native-helper", "connector-bindings.json");
  const sourcesPath = options.sourcesPath || process.env.TIANYUAN_CONNECTOR_AGENT_SOURCES_PATH || path.join(home, ".tianyuan-workbench", "native-helper", "agent-sources.json");
  const configDir = options.configDir || process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_DIR || path.join(home, ".tianyuan-workbench", "agent-sources");
  const codexStatePath = options.codexStatePath || process.env.TIANYUAN_CODEX_GLOBAL_STATE_PATH || path.join(home, ".codex", ".codex-global-state.json");
  const platformUrl = process.env.TIANYUAN_CONNECTOR_PLATFORM_URL || "http://127.0.0.1:40315";
  const sessions = new Map(); const actions = new Map(); const bindings = new Map(); const sources = new Map();
  let loaded = false; let migrated = false;

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
    const related = agent ? session.agentBindings.filter((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId) : session.agentBindings;
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
    agentSourceRegistration: { supported: true, level: "routing", label: "已注册 Agent 来源" }, agentBinding: { supported: true, level: "routing", label: "工作区或对话页面绑定" }, sharedRead: { supported: true, level: "read", label: "多 Agent 只读访问" }, exclusiveControl: { supported: true, level: "confirm", label: "页面唯一控制权" }, contextRead: { supported: true, level: "read", label: "读取当前页面上下文" }, previewAuditAttachmentUpload: { supported: true, level: "preview", label: "评估核实附件上传预演" }, executeAuditAttachmentUpload: { supported: true, level: "confirm", label: "确认后上传评估核实附件并保存" }, inspectAuditCheckRow: { supported: true, level: "read", label: "读取查证核对情况" }, executeAuditCheckResult: { supported: true, level: "confirm", label: "确认后填写查证核对情况并保存" }, genericBrowserAutomation: { supported: false, level: "unsupported", label: "任意浏览器自动操作" }, arbitraryJavaScript: { supported: false, level: "unsupported", label: "任意 JavaScript 执行" } }; }
  function prune() { const instant = Date.now(); for (const [key, session] of sessions) if (instant - Date.parse(session.lastSeenAt) > 120000) sessions.delete(key); for (const [key, action] of actions) { const age = Date.parse(action.completedAt || action.createdAt); const ttl = action.completedAt ? ACTION_RESULT_TTL_MS : ACTION_TTL_MS; if (!Number.isFinite(age) || instant - age > ttl) actions.delete(key); } }
  function attachment(filePath) { const resolved = path.resolve(String(filePath || "")); if (!path.isAbsolute(String(filePath || ""))) throw error("ATTACHMENT_PATH_MUST_BE_ABSOLUTE"); const stat = fs.statSync(resolved); if (!stat.isFile()) throw error("ATTACHMENT_NOT_A_FILE"); if (stat.size <= 0) throw error("ATTACHMENT_FILE_EMPTY"); if (stat.size > MAX_ATTACHMENT_BYTES) throw error("ATTACHMENT_FILE_TOO_LARGE"); const extension = path.extname(resolved).toLowerCase(); if (!ATTACHMENT_EXTENSIONS.has(extension)) throw error("ATTACHMENT_FILE_TYPE_NOT_ALLOWED"); return { path: resolved, name: path.basename(resolved), size: stat.size, type: "application/octet-stream" }; }
  function actionIsWrite(type) { return ["upload_audit_attachment", "batch_upload_audit_attachments", "clear_audit_test_rows", "set_audit_check_result", "batch_set_audit_check_results"].includes(type); }
  function createAction(session, agent, input) {
    const type = limited(input.action, 80); const allowed = new Set(["preview_audit_attachment_upload", "upload_audit_attachment", "batch_upload_audit_attachments", "inspect_audit_check_row", "set_audit_check_result", "scan_audit_index_check_rows", "batch_set_audit_check_results", "clear_audit_test_rows"]); if (!allowed.has(type)) throw error("ACTION_NOT_ALLOWED");
    const binding = authorize(session, agent, input, actionIsWrite(type)); if (session.status !== "online") throw error("SESSION_NOT_ONLINE", 409); if (!session.binding.projectId || !session.binding.companyId || session.binding.pageType !== "asset-draft") throw error("ASSET_DRAFT_SESSION_REQUIRED", 409);
    const rowNumbers = Array.isArray(input.rowNumbers) ? input.rowNumbers.map(Number).filter((row) => Number.isInteger(row) && row >= 2 && row <= 100000) : [];
    const rowNumber = Number(input.rowNumber); if (!rowNumbers.length && !["scan_audit_index_check_rows"].includes(type) && (!Number.isInteger(rowNumber) || rowNumber < 2)) throw error("ROW_NUMBER_INVALID");
    const subjectCode = limited(input.subjectCode === "current" ? "" : input.subjectCode || session.binding.subjectCode, 120); if (subjectCode && !/^C\d+(?:-\d+)*$/.test(subjectCode)) throw error("SUBJECT_CODE_INVALID");
    if (["upload_audit_attachment", "batch_upload_audit_attachments"].includes(type) && input.confirmText !== (type === "batch_upload_audit_attachments" ? "确认批量上传并保存" : "确认上传并保存")) throw error("UPLOAD_CONFIRM_TEXT_REQUIRED");
    if (type === "clear_audit_test_rows" && input.confirmText !== "确认清理测试数据并保存") throw error("CLEAR_TEST_DATA_CONFIRM_TEXT_REQUIRED");
    if (type === "set_audit_check_result" && input.confirmText !== "确认填写核对情况并保存") throw error("AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    if (type === "batch_set_audit_check_results" && input.confirmText !== "确认批量填写核对情况并保存") throw error("BATCH_AUDIT_CHECK_CONFIRM_TEXT_REQUIRED");
    const action = { actionId: id("action"), sessionId: session.sessionId, bindingId: binding.bindingId, agentId: agent.agentId, providerId: agent.providerId, installationId: agent.installationId, controlEpoch: binding.updatedAt, type, status: "queued", target: { projectId: session.binding.projectId, companyId: session.binding.companyId, subjectCode, rowNumber: rowNumbers.length ? 0 : rowNumber, rowNumbers, expectedIndexValues: Array.isArray(input.expectedIndexValues) ? input.expectedIndexValues.map((value) => limited(value, 120)) : [], fieldTitle: limited(input.fieldTitle || (type.includes("check") ? "查证核对情况" : "查证资料索引"), 80), resultText: limited(input.resultText, 80), procedureText: limited(input.procedureText, 80), moduleName: limited(input.moduleName, 80), moduleIndex: Number.isInteger(input.moduleIndex) ? input.moduleIndex : 0, maxRows: Math.max(2, Math.min(Number(input.maxRows || 500), 5000)) }, file: ["upload_audit_attachment", "batch_upload_audit_attachments"].includes(type) ? attachment(input.filePath) : null, confirmText: limited(input.confirmText, 80), createdAt: now() }; actions.set(action.actionId, action); return action;
  }
  function publicAction(action) { return action ? { actionId: action.actionId, sessionId: action.sessionId, bindingId: action.bindingId, type: action.type, status: action.status, target: action.target, file: action.file ? { name: action.file.name, size: action.file.size, type: action.file.type } : null, createdAt: action.createdAt, claimedAt: action.claimedAt || null, completedAt: action.completedAt || null, cancellationReason: action.cancellationReason || null, result: action.result || null } : null; }

  function cancelControllerActions(bindingId) { for (const action of actions.values()) if (action.bindingId === bindingId && ["queued", "claimed", "running"].includes(action.status)) { action.status = "cancelled"; action.cancellationReason = "AGENT_CONTROL_REVOKED"; action.completedAt = now(); } }
  function createBinding(session, input) {
    const source = requireSource(input); const previous = input.bindingId ? bindings.get(String(input.bindingId)) : null; const scope = input.scope === "workspace" || input.scope === "project" ? "workspace" : "conversation"; const accessMode = input.accessMode === "control" ? "control" : "read";
    const binding = { bindingId: limited(input.bindingId || previous?.bindingId || randomUUID(), 200), agentId: source.agentId, providerId: source.providerId, displayName: limited(input.displayName || source.displayName, 120), installationId: source.installationId, workspaceId: limited(input.workspaceId ?? input.projectId ?? previous?.workspaceId, 200), workspaceName: limited(input.workspaceName ?? input.projectName ?? previous?.workspaceName, 200), workspacePath: normalizePath(input.workspacePath ?? input.projectPath ?? previous?.workspacePath), conversationId: scope === "workspace" ? "" : limited(input.conversationId ?? input.threadId ?? previous?.conversationId, 200), conversationTitle: scope === "workspace" ? "" : limited(input.conversationTitle ?? input.threadTitle ?? previous?.conversationTitle, 300), scope, accessMode, pageKey: pageKey(session.binding), manualBinding: Boolean(input.manualBinding || source.manual), createdAt: previous?.createdAt || now(), updatedAt: now() };
    if (!binding.workspaceId && !binding.conversationId) throw error("AGENT_WORKSPACE_OR_CONVERSATION_REQUIRED"); if (scope === "conversation" && !binding.conversationId) throw error("AGENT_CONVERSATION_BINDING_REQUIRED");
    const controller = currentController(session);
    if (accessMode === "control" && controller && controller.bindingId !== binding.bindingId) {
      if (input.confirmControlTransfer !== "确认切换控制权") throw error("CONTROL_TRANSFER_CONFIRMATION_REQUIRED", 409);
      controller.accessMode = "read"; controller.updatedAt = now(); bindings.set(controller.bindingId, controller); cancelControllerActions(controller.bindingId);
    }
    bindings.set(binding.bindingId, binding); saveBindings(); syncSession(session); return binding;
  }
  function createCredentialRef(providerId, installationId) {
    const service = `com.tianyuan.workbench.agent.${providerId}.${installationId}`;
    const account = "connector-bridge";
    const secret = randomBytes(32).toString("base64url");
    if (process.platform === "darwin") {
      try {
        execFileSync("security", ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret], { stdio: ["ignore", "ignore", "ignore"] });
        return `keychain:${service}:${account}`;
      } catch {
        // Fall through to the restricted local runtime.
      }
    }
    const credentialPath = path.join(path.dirname(sourcesPath), "agent-credentials.json");
    const key = `${providerId}-${installationId}`;
    const values = readJson(credentialPath, { secrets: {} });
    values.secrets = values.secrets || {};
    values.secrets[key] = secret;
    writeJson(credentialPath, values);
    return `file:${credentialPath}#${key}`;
  }
  function manualSource(input) {
    const providerId = limited(input.providerId || "workbuddy", 80).toLowerCase(); if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(providerId)) throw error("AGENT_PROVIDER_ID_INVALID");
    const installationId = limited(input.installationId || `manual-${randomUUID()}`, 160); const key = `${providerId}|${installationId}`; if (sources.has(key)) throw error("AGENT_SOURCE_ALREADY_REGISTERED", 409);
    const source = { agentId: limited(input.agentId || `${providerId}-${randomUUID()}`, 160), providerId, displayName: limited(input.displayName || providerId, 120), installationId, credentialRef: createCredentialRef(providerId, installationId), manual: true, createdAt: now(), updatedAt: now(), lastSeenAt: null };
    sources.set(key, source); saveSources(); fs.mkdirSync(configDir, { recursive: true, mode: 0o700 }); const configPath = path.join(configDir, `${providerId}-${installationId}.json`); writeJson(configPath, { providerId, installationId, credentialRef: source.credentialRef }); return { source, configPath };
  }
  async function codexCatalog() {
    try { const response = await fetch(`${platformUrl}/api/catalog`); const payload = await response.json(); if (response.ok && payload?.ok) return { projects: Array.isArray(payload.projects) ? payload.projects : [], threads: Array.isArray(payload.threads) ? payload.threads : [], updatedAt: payload.updatedAt || null, source: "connector-platform" }; } catch { /* local fallback */ }
    const state = readJson(codexStatePath, {}); const projects = new Map(); const add = (item = {}) => { const projectId = limited(item.projectId || item.id, 200); if (!projectId) return; const projectPath = normalizePath(item.projectPath || item.path || item.cwd || item.rootPaths?.[0]); projects.set(projectId, { projectId, projectName: limited(item.projectName || item.name || path.basename(projectPath) || projectId, 200), projectPath, path: projectPath, updatedAt: Number(item.updatedAt || 0) || null }); };
    for (const value of Object.values(state["local-projects"] || {})) add(value); for (const value of Object.values(state["thread-project-assignments"] || {})) add(value);
    const threads = Object.entries(state["thread-project-assignments"] || {}).map(([threadId, item]) => { const project = projects.get(String(item?.projectId || "")); if (!threadId || !project) return null; return { threadId, title: limited(item?.title || item?.threadTitle || `Codex 对话 ${threadId.slice(0, 8)}`, 300), projectId: project.projectId, projectName: project.projectName, projectPath: normalizePath(item?.cwd || item?.path || project.projectPath), cwd: normalizePath(item?.cwd || item?.path || project.projectPath), recencyAt: project.updatedAt }; }).filter(Boolean);
    return { projects: [...projects.values()], threads, updatedAt: now(), source: "local-codex-state" };
  }

  async function handle(req, res) {
    const origin = allowedOrigin(req); const suppliedOrigin = String(req.headers.origin || ""); if (suppliedOrigin && !origin) return fail(res, error("CONNECTOR_ORIGIN_FORBIDDEN", 403)); if (req.method === "OPTIONS") return json(res, 204, { ok: true }, origin); prune(); loadBindings(); const url = new URL(req.url, "http://127.0.0.1"); const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "tianyuan-connector-bridge", protocolVersion: PROTOCOL_VERSION, adapter: "tianyuan-browser", mode: "local", sessionCount: sessions.size, bindingCount: bindings.size, agentSourceCount: sources.size }, origin);
      if (req.method === "GET" && url.pathname === "/api/protocol") return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, adapter: "tianyuan-browser", capabilities: capabilities(), safety: { genericBrowserAutomation: false, arbitraryJavaScript: false, editLockRequired: true, explicitConfirmationRequired: true, agentBindingRequired: true, singleControlAgentPerPage: true, credentialsStored: false } }, origin);
      if (req.method === "POST" && url.pathname === "/api/agent-sources/register") { const agent = identity(req, true); return json(res, 200, { ok: true, agentIdentity: agent }, origin); }
      if (req.method === "GET" && url.pathname === "/api/agent-sources") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); return json(res, 200, { ok: true, sources: [...sources.values()].map(publicSource) }, origin); }
      if (req.method === "POST" && url.pathname === "/api/agent-sources/manual") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const created = manualSource(await body(req)); return json(res, 200, { ok: true, source: publicSource(created.source), workbuddyConfig: { transport: "stdio", command: "node", args: ["~/plugins/tianyuan-browser-connector/runtime/apps/mcp/server.mjs"], env: { TIANYUAN_CONNECTOR_BRIDGE_URL: "http://127.0.0.1:40415", TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH: created.configPath } } }, origin); }
      if (req.method === "GET" && url.pathname === "/api/catalog") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); return json(res, 200, { ok: true, ...(await codexCatalog()) }, origin); }
      if (req.method === "POST" && url.pathname === "/api/sessions/register") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const input = await body(req); const sessionId = limited(input.sessionId || id("tianyuan"), 200); const existing = sessions.get(sessionId); const session = { sessionId, status: "online", registeredAt: existing?.registeredAt || now(), lastSeenAt: now(), binding: safePage(input.binding), client: safeClient(input.client), context: safeContext(input.context), capabilities: capabilities() }; sessions.set(sessionId, session); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "GET" && url.pathname === "/api/sessions") { const agent = isBrowser(req) ? null : identity(req, true); const result = [...sessions.values()].filter((session) => !agent || bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)).map((session) => publicSession(session, agent)); return json(res, 200, { ok: true, sessions: result }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "heartbeat") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); session.lastSeenAt = now(); if (input.binding) session.binding = safePage(input.binding); if (input.context) session.context = safeContext(input.context); return json(res, 200, { ok: true, session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = createBinding(session, await body(req)); return json(res, 200, { ok: true, binding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "agent-bindings" && parts[5] === "access") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const previous = bindings.get(parts[4]); if (!previous || previous.pageKey !== pageKey(session.binding)) throw error("AGENT_BINDING_MISMATCH", 404); const changed = createBinding(session, { ...previous, ...input, bindingId: previous.bindingId, providerId: previous.providerId, installationId: previous.installationId, agentId: previous.agentId }); return json(res, 200, { ok: true, binding: publicBinding(changed), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { ...input, providerId: "codex", installationId: source.installationId, agentId: source.agentId, workspaceId: input.projectId, workspaceName: input.projectName, workspacePath: input.projectPath, conversationId: input.threadId, conversationTitle: input.threadTitle, scope: input.scope === "project" ? "workspace" : "conversation", accessMode: input.accessMode || "control" }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), session: publicSession(session) }, origin); }
      if (req.method === "POST" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding" && parts[4] === "current-thread") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const catalog = await codexCatalog(); const candidate = catalog.threads.find((thread) => (input.projectId && thread.projectId === input.projectId) || (input.projectPath && normalizePath(thread.projectPath) === normalizePath(input.projectPath))) || null; if (!candidate) throw error("CURRENT_THREAD_NOT_FOUND", 404); const source = [...sources.values()].find((item) => item.providerId === "codex"); if (!source) throw error("AGENT_NOT_REGISTERED", 409); const binding = createBinding(session, { providerId: "codex", installationId: source.installationId, workspaceId: candidate.projectId, workspaceName: candidate.projectName, workspacePath: candidate.projectPath, conversationId: candidate.threadId, conversationTitle: candidate.title, scope: "conversation", accessMode: "control", confirmControlTransfer: input.confirmControlTransfer }); return json(res, 200, { ok: true, binding: codexCompatibility(binding), agentBinding: publicBinding(binding), thread: candidate, session: publicSession(session) }, origin); }
      if (req.method === "DELETE" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "binding") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const target = bindingsFor(session.binding).find((binding) => binding.providerId === "codex"); if (target) { bindings.delete(target.bindingId); cancelControllerActions(target.bindingId); saveBindings(); } return json(res, 200, { ok: true, cleared: Boolean(target), session: publicSession(session) }, origin); }
      if (parts.length === 3 && parts[0] === "api" && parts[1] === "sessions" && req.method === "GET") { const session = sessionForBinding(parts[2]); const agent = isBrowser(req) ? null : identity(req, true); if (agent && !bindingsFor(session.binding).some((binding) => binding.agentId === agent.agentId && binding.providerId === agent.providerId && binding.installationId === agent.installationId)) throw error("AGENT_BINDING_MISMATCH", 403); return json(res, 200, { ok: true, session: publicSession(session, agent) }, origin); }
      if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = createAction(session, agent, await body(req)); return json(res, 200, { ok: true, action: publicAction(action), security: { fileContentsReturned: false } }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[4] === "next") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const binding = browserBinding(session, url.searchParams.get("bindingId"), false); const action = [...actions.values()].filter((item) => item.sessionId === session.sessionId && item.bindingId === binding.bindingId && item.status === "queued").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null; if (!action) return json(res, 200, { ok: true, action: null }, origin); if (actionIsWrite(action.type)) browserBinding(session, binding.bindingId, true); action.status = "claimed"; action.claimedAt = now(); const file = action.file ? { name: action.file.name, size: action.file.size, type: action.file.type, base64: fs.readFileSync(action.file.path).toString("base64") } : null; return json(res, 200, { ok: true, action: { ...publicAction(action), payload: { action: action.type, ...action.target, confirmText: action.confirmText, file } }, security: { filePathReturned: false, fileContentsEphemeral: Boolean(file) } }, origin); }
      if (req.method === "POST" && parts.length === 6 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions" && parts[5] === "result") { if (!isBrowser(req)) throw error("BROWSER_EXTENSION_REQUIRED", 403); const session = sessionForBinding(parts[2]); const input = await body(req); const action = actions.get(parts[4]); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); browserBinding(session, input.bindingId, actionIsWrite(action.type)); if (action.status === "cancelled") throw error("AGENT_CONTROL_REVOKED", 409); if (!["claimed", "running"].includes(action.status)) throw error("ACTION_NOT_CLAIMED", 409); action.result = input.result && typeof input.result === "object" ? input.result : {}; action.status = action.result.ok ? "completed" : "failed"; action.completedAt = now(); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "sessions" && parts[3] === "actions") { const agent = identity(req, true); const session = sessionForBinding(parts[2]); const action = actions.get(parts[4]); if (!action || action.sessionId !== session.sessionId) throw error("ACTION_NOT_FOUND", 404); authorize(session, agent, { bindingId: action.bindingId, workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("projectId") || "", conversationId: url.searchParams.get("conversationId") || url.searchParams.get("threadId") || "" }, actionIsWrite(action.type)); return json(res, 200, { ok: true, action: publicAction(action) }, origin); }
      throw error("NOT_FOUND", 404);
    } catch (cause) { return fail(res, cause, origin); }
  }
  return { async start(port) { const server = createServer((req, res) => { handle(req, res).catch((cause) => fail(res, cause)); }); await new Promise((resolve) => server.listen(Number(port || 40415), "127.0.0.1", resolve)); return server; }, handle, paths: { bindingsPath, sourcesPath, configDir } };
}

async function health(port = 40415) { try { const response = await fetch(`http://127.0.0.1:${Number(port)}/health`); return response.ok ? await response.json() : { ok: false, reason: `CONNECTOR_HTTP_${response.status}` }; } catch { return { ok: false, reason: "CONNECTOR_NOT_RUNNING" }; } }
async function start(options = {}) { const bridge = createBridge(options); const port = Number(options.port || process.env.TIANYUAN_CONNECTOR_PORT || 40415); const server = await bridge.start(port); process.stdout.write(`Tianyuan connector bridge listening on http://127.0.0.1:${port}\n`); return { bridge, server }; }
module.exports = { PROTOCOL_VERSION, createBridge, health, start };
