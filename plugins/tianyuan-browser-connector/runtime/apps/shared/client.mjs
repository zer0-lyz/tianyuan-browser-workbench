import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridgeUrl = (process.env.TIANYUAN_CONNECTOR_BRIDGE_URL || "http://127.0.0.1:40415").replace(/\/$/, "");

export const tools = [
  {
    name: "tianyuan.connection_status",
    description: "检查当前 Codex 项目或对话绑定的天源浏览器 session。必须先调用此工具再读取页面。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        projectPath: { type: "string" },
        threadId: { type: "string" },
        onlyOnline: { type: "boolean", default: true },
        includeSessions: { type: "boolean", default: true }
      },
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.list_sessions",
    description: "列出当前本机 Connector Bridge 中的天源浏览器 session 和绑定摘要。",
    inputSchema: {
      type: "object",
      properties: {
        includeContext: { type: "boolean", default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.get_context",
    description: "读取一个已确认 session 的天源页面轻量上下文。必须同时传入 sessionId 和 bindingId。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" }
      },
      required: ["sessionId", "bindingId"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.list_capabilities",
    description: "读取天源浏览器连接器的能力矩阵和安全边界。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.preview_audit_attachment_upload",
    description: "通过已绑定的天源浏览器页面预演评估核实附件上传。只定位科目、行和查证资料索引上传分类，不注入文件、不上传、不保存。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.upload_audit_attachment",
    description: "通过已绑定的天源浏览器页面，将一个本地附件上传到资产基础法底稿评估核实的查证资料索引分类，并点击底稿保存。必须明确确认，且编辑锁、上传、分类、保存和单元格回读全部通过才算成功。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 },
        filePath: { type: "string" },
        confirmText: { type: "string", const: "确认上传并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber", "filePath", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.batch_upload_audit_attachments",
    description: "通过已绑定的天源浏览器页面，按行顺序批量上传同一个本地测试附件到多行查证资料索引，并对每行分别验证上传、分类、保存和回读。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示使用浏览器当前打开的科目，不主动导航。" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, minItems: 1, maxItems: 50 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        procedureText: { type: "string", description: "可选。若目标行“查证类核实程序”为空，先填写该程序再上传。" },
        moduleName: { type: "string" },
        moduleIndex: { type: "integer", minimum: 0, maximum: 20, default: 0 },
        filePath: { type: "string" },
        confirmText: { type: "string", const: "确认批量上传并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumbers", "filePath", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.clear_audit_test_rows",
    description: "仅清理指定行已确认的测试资料索引、查证类核实程序和查证核对情况，保存并逐行回读。必须提供当前资料索引值以防误清理。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, minItems: 1, maxItems: 100 },
        expectedIndexValues: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        confirmText: { type: "string", const: "确认清理测试数据并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumbers", "expectedIndexValues", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.inspect_audit_check_row",
    description: "读取当前或指定科目某一行的查证核对情况、单元格类型、下拉选项和相邻表头，不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.set_audit_check_result",
    description: "将当前或指定科目某一行的查证核对情况设置为系统允许的选项，点击底稿保存并回读。只允许修改查证核对情况字段。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        rowNumber: { type: "integer", minimum: 2 },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" },
        resultText: { type: "string" },
        confirmText: { type: "string", const: "确认填写核对情况并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "rowNumber", "resultText", "confirmText"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.scan_audit_index_check_rows",
    description: "批量扫描当前或指定科目的查证资料索引和查证核对情况，只读取，不修改底稿。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        fieldTitle: { type: "string", const: "查证资料索引", default: "查证资料索引" },
        maxRows: { type: "integer", minimum: 2, maximum: 5000, default: 500 }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode"],
      additionalProperties: false
    }
  },
  {
    name: "tianyuan.batch_set_audit_check_results",
    description: "批量将有查证资料索引但查证核对情况为空的行填写为指定结论，点击底稿保存并回读。只允许修改查证核对情况字段。",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        bindingId: { type: "string" },
        projectId: { type: "string" },
        threadId: { type: "string" },
        subjectCode: { type: "string", description: "目标科目代码；传 current 表示当前打开科目。" },
        fieldTitle: { type: "string", const: "查证核对情况", default: "查证核对情况" },
        resultText: { type: "string" },
        rowNumbers: { type: "array", items: { type: "integer", minimum: 2 }, maxItems: 1000 },
        maxRows: { type: "integer", minimum: 2, maximum: 5000, default: 500 },
        confirmText: { type: "string", const: "确认批量填写核对情况并保存" }
      },
      required: ["sessionId", "bindingId", "projectId", "threadId", "subjectCode", "resultText", "confirmText"],
      additionalProperties: false
    }
  }
];

let agentIdentityPromise = null;
let agentRegistrationPromise = null;

function readAgentConfig() {
  const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const candidates = [
    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH,
    path.join(runtimeRoot, "agent-config.json"),
    path.resolve(process.cwd(), "runtime", "agent-config.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (value?.providerId && value?.installationId && value?.credentialRef) return value;
    } catch {
      // Continue to the next local runtime configuration candidate.
    }
  }
  return {
    providerId: process.env.TIANYUAN_CONNECTOR_PROVIDER_ID || "",
    installationId: process.env.TIANYUAN_CONNECTOR_INSTALLATION_ID || "",
    credentialRef: process.env.TIANYUAN_CONNECTOR_CREDENTIAL_REF || "",
  };
}

function resolveCredential(reference) {
  const ref = String(reference || "");
  if (ref.startsWith("keychain:")) {
    const [, service, account] = ref.split(":");
    if (!service || !account) return "";
    try {
      return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  }
  if (ref.startsWith("file:")) {
    const [filePath, key] = ref.slice(5).split("#");
    try {
      const values = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return String(values?.secrets?.[key] || values?.[key] || "");
    } catch {
      return "";
    }
  }
  return "";
}

async function getAgentIdentity() {
  if (!agentIdentityPromise) {
    agentIdentityPromise = Promise.resolve().then(() => {
      const config = readAgentConfig();
      if (!config.providerId || !config.installationId || !config.credentialRef) {
        throw Object.assign(new Error("Agent runtime configuration is missing."), { code: "AGENT_CONFIG_NOT_FOUND" });
      }
      const credential = resolveCredential(config.credentialRef);
      if (!credential) {
        throw Object.assign(new Error("Agent credential is unavailable from its local credentialRef."), { code: "AGENT_CREDENTIAL_UNAVAILABLE" });
      }
      return {
        providerId: String(config.providerId),
        installationId: String(config.installationId),
        credential,
      };
    });
  }
  return agentIdentityPromise;
}

async function request(pathname, options = {}) {
  const identity = await getAgentIdentity();
  const response = await fetch(`${bridgeUrl}${pathname}`, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      "x-tianyuan-agent-provider": identity.providerId,
      "x-tianyuan-agent-installation": identity.installationId,
      "x-tianyuan-agent-credential": identity.credential,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const failure = new Error(payload?.reason || `TIANYUAN_CONNECTOR_HTTP_${response.status}`);
    failure.code = payload?.reason || "TIANYUAN_CONNECTOR_REQUEST_FAILED";
    failure.details = payload;
    throw failure;
  }
  return payload;
}

async function ensureAgentRegistered() {
  if (!agentRegistrationPromise) {
    agentRegistrationPromise = registerAgentSource()
      .catch((cause) => {
        agentRegistrationPromise = null;
        throw cause;
      });
  }
  return agentRegistrationPromise;
}

export async function registerAgentSource() {
  return await request("/api/agent-sources/register", { method: "POST", body: "{}" });
}

function bindingFor(session) {
  const bindings = Array.isArray(session?.agentBindings) ? session.agentBindings : [];
  return bindings[0] || session?.codexBinding || null;
}

function actionAuthQuery(input) {
  return new URLSearchParams({
    workspaceId: input.workspaceId || input.projectId || "",
    conversationId: input.conversationId || input.threadId || "",
    projectId: input.projectId || "",
    threadId: input.threadId || "",
  }).toString();
}

async function waitForAction(sessionId, actionId, input, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const query = actionAuthQuery(input);
  while (Date.now() < deadline) {
    const payload = await request(`/api/sessions/${encodeURIComponent(sessionId)}/actions/${encodeURIComponent(actionId)}?${query}`);
    if (["completed", "failed", "cancelled"].includes(payload.action?.status)) return payload.action;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Object.assign(new Error("等待天源浏览器页面执行超时。请确认工作台侧栏保持打开。"), { code: "TIANYUAN_BROWSER_ACTION_TIMEOUT" });
}

async function runBrowserAction(name, input) {
  const sessionsPayload = await request("/api/sessions");
  requireBoundSession(sessionsPayload.sessions || [], input);
  const action = {
    "tianyuan.upload_audit_attachment": "upload_audit_attachment",
    "tianyuan.batch_upload_audit_attachments": "batch_upload_audit_attachments",
    "tianyuan.clear_audit_test_rows": "clear_audit_test_rows",
    "tianyuan.preview_audit_attachment_upload": "preview_audit_attachment_upload",
    "tianyuan.inspect_audit_check_row": "inspect_audit_check_row",
    "tianyuan.set_audit_check_result": "set_audit_check_result",
    "tianyuan.scan_audit_index_check_rows": "scan_audit_index_check_rows",
    "tianyuan.batch_set_audit_check_results": "batch_set_audit_check_results",
  }[name];
  const submitted = await request(`/api/sessions/${encodeURIComponent(input.sessionId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ ...input, action }),
  });
  const result = await waitForAction(
    input.sessionId,
    submitted.action.actionId,
    input,
    ["upload_audit_attachment", "batch_upload_audit_attachments", "clear_audit_test_rows", "set_audit_check_result", "batch_set_audit_check_results"].includes(action) ? 150000 : 60000,
  );
  return {
    ok: result.status === "completed" && result.result?.ok === true,
    action: result,
    security: { browserScriptExecution: true, arbitraryJavaScript: false, credentialsReturned: false },
  };
}

function sessionSummary(session, includeContext = false) {
  const page = session.binding || {};
  const binding = bindingFor(session);
  const summary = {
    sessionId: session.sessionId,
    status: session.status,
    lastSeenAt: session.lastSeenAt,
    page: {
      projectId: page.projectId || "",
      companyId: page.companyId || "",
      subjectCode: page.subjectCode || "",
      pageType: page.pageType || "",
      tabId: page.tabId ?? null,
    },
    binding: binding ? {
      bindingId: binding.bindingId,
      agentId: binding.agentId || "",
      providerId: binding.providerId || "codex",
      displayName: binding.displayName || "Codex",
      installationId: binding.installationId || "",
      workspaceId: binding.workspaceId || binding.projectId || "",
      workspaceName: binding.workspaceName || binding.projectName || "",
      workspacePath: binding.workspacePath || binding.projectPath || "",
      conversationId: binding.conversationId || binding.threadId || "",
      conversationTitle: binding.conversationTitle || binding.threadTitle || "",
      scope: binding.scope || "conversation",
      accessMode: binding.accessMode || "read",
    } : null,
    capabilities: session.capabilities || {},
  };
  if (session.codexBinding) summary.codexBinding = session.codexBinding;
  if (includeContext) summary.context = session.context || {};
  return summary;
}

function normalizePath(value) { return String(value || "").replace(/[\\/]+$/, ""); }

function matchesBinding(session, input = {}) {
  const binding = bindingFor(session);
  if (!binding) return false;
  if (input.sessionId && session.sessionId !== input.sessionId) return false;
  if (input.bindingId && binding.bindingId !== input.bindingId) return false;
  if (input.workspaceId && (binding.workspaceId || binding.projectId) !== input.workspaceId) return false;
  if (input.projectId && (binding.workspaceId || binding.projectId) !== input.projectId) return false;
  if (input.workspacePath && normalizePath(binding.workspacePath || binding.projectPath) !== normalizePath(input.workspacePath)) return false;
  if (input.projectPath && normalizePath(binding.workspacePath || binding.projectPath) !== normalizePath(input.projectPath)) return false;
  if (binding.scope !== "workspace" && input.conversationId && (binding.conversationId || binding.threadId) !== input.conversationId) return false;
  if (binding.scope !== "workspace" && input.threadId && (binding.conversationId || binding.threadId) !== input.threadId) return false;
  return true;
}

function requireBoundSession(sessions, input) {
  const session = sessions.find((item) => item.sessionId === input.sessionId);
  if (!session) throw Object.assign(new Error(`Session not found: ${input.sessionId}`), { code: "SESSION_NOT_FOUND" });
  const binding = bindingFor(session);
  if (!binding) throw Object.assign(new Error("The Tianyuan session is not bound to this registered Agent."), { code: "AGENT_BINDING_MISMATCH" });
  if (binding.bindingId !== input.bindingId) throw Object.assign(new Error("bindingId does not match the selected Agent binding."), { code: "AGENT_BINDING_MISMATCH" });
  if (!matchesBinding(session, input)) throw Object.assign(new Error("workspace or conversation does not match the selected Agent binding."), { code: "AGENT_BINDING_MISMATCH" });
  return session;
}

async function connectionStatus(input = {}) {
  await ensureAgentRegistered();
  const payload = await request("/api/sessions");
  const allSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const onlineSessions = allSessions.filter((session) => session.status === "online");
  const boundSessions = onlineSessions.filter((session) => bindingFor(session));
  const matches = boundSessions.filter((session) => matchesBinding(session, input));
  const issues = [];
  if (!onlineSessions.length) issues.push({ code: "NO_ONLINE_SESSIONS", message: "没有当前 Agent 有权访问的在线天源浏览器 session。" });
  else if (!boundSessions.length) issues.push({ code: "NO_AGENT_BINDINGS", message: "在线天源页面尚未绑定当前 Agent。" });
  else if (!matches.length) issues.push({ code: "NO_MATCHING_BINDING", message: "没有找到与当前工作区或对话匹配的天源页面。" });
  else if (matches.length > 1 && !input.sessionId && !input.bindingId) issues.push({ code: "MULTIPLE_MATCHING_SESSIONS", message: "匹配到多个天源页面，请明确 sessionId 或 bindingId。" });
  const recommendedSession = matches.length === 1 ? sessionSummary(matches[0], true) : null;
  return {
    ok: issues.length === 0,
    bridge: { url: bridgeUrl, online: true },
    counts: { online: onlineSessions.length, bound: boundSessions.length, matched: matches.length },
    issues,
    recommendedSession,
    sessions: input.includeSessions === false ? undefined : matches.map((session) => sessionSummary(session, false)),
    routingRule: "后续调用必须复用 recommendedSession 的 sessionId 和 bindingId；Bridge 只返回当前已注册 Agent 有权访问的页面。",
  };
}

export async function executeTool(name, input = {}) {
  await ensureAgentRegistered();
  if (name === "tianyuan.connection_status") return connectionStatus(input);
  if (name === "tianyuan.list_sessions") {
    const payload = await request("/api/sessions");
    return { ok: true, sessions: (payload.sessions || []).map((session) => sessionSummary(session, input.includeContext === true)) };
  }
  if (name === "tianyuan.get_context") {
    const payload = await request("/api/sessions");
    const session = requireBoundSession(payload.sessions || [], input);
    return { ok: true, session: sessionSummary(session, true), security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
  }
  if (name === "tianyuan.list_capabilities") {
    const payload = await request("/api/protocol");
    return { ok: true, protocolVersion: payload.protocolVersion, adapter: payload.adapter, capabilities: payload.capabilities, safety: payload.safety };
  }
  if ([
    "tianyuan.preview_audit_attachment_upload",
    "tianyuan.upload_audit_attachment",
    "tianyuan.batch_upload_audit_attachments",
    "tianyuan.clear_audit_test_rows",
    "tianyuan.inspect_audit_check_row",
    "tianyuan.set_audit_check_result",
    "tianyuan.scan_audit_index_check_rows",
    "tianyuan.batch_set_audit_check_results",
  ].includes(name)) return runBrowserAction(name, input);
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: "UNKNOWN_TOOL" });
}
