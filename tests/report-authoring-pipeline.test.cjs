"use strict";

// 报告 v2 动作面管线测试：Bridge HTTP（沿用 report-authoring-bridge 的隔离模式）
// + 侧栏 payload 注入形状模拟 + fixture/page_adapter vm 组合端到端。
// 不访问网络、不触碰生产运行时；所有页面交互发生在 vm fixture 内并记录 journal。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const vm = require("node:vm");
const { createBridge } = require("../native-helper/connector_bridge.js");
const { hasReportPending, markReportPending, canReopenReportSettings, readReportSettingsStage, archiveReportPendingAfterSettingsReadback } = require("../native-helper/report-pending.js");
const { buildReportPage } = require("./helpers/report-page-fixture.cjs");

const root = path.resolve(__dirname, "..");
const PAGE_ADAPTER_VERSION = "2026-10-31-report-tree-controls-v1";
const PAGE_ACTION_TYPE = `TIANYUAN_WORKBENCH_RUN_ACTION:${PAGE_ADAPTER_VERSION}`;
const PAGE_ACTION_RESULT_TYPE = `TIANYUAN_WORKBENCH_ACTION_RESULT:${PAGE_ADAPTER_VERSION}`;
const CONFIRM_EXECUTE_TEXT = "确认执行报告修改";
const CONFIRM_SAVE_TEXT = "确认保存报告";
const BRIDGE_IDENTITY = { projectId: "business-project", companyId: "company", reportType: "2", mode: "add", reportDetailId: "test-report" };
// fixture 页面路由固定为 project-1/company-1/new-report/2/add；测试把 claim payload 的
// reportIdentity 换成 fixture 身份，等价于“浏览器确实停在与绑定一致的新报告页”。
const PAGE_IDENTITY = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add", reportDetailId: "test-report" };
const reportResultSanitizer = import(pathToFileURL(path.join(root, "extension/src/sidepanel/report-result.mjs")).href);
const V2_CONTEXT = {
  adapterVersion: "report-authoring-v2", inspectAvailable: true, treeAvailable: true,
  editorFramework: "contenteditable", editorModelAvailable: false, toolbarAvailable: true,
  structureOpsAvailable: true, settingsAvailable: false, writesSupported: true, livePageVerified: false,
};

async function setupBridge({ gateOpen = false, pendingDirectory } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-report-pipeline-"));
  const credential = "synthetic-pipeline-credential";
  const credentialPath = path.join(directory, "credential.json");
  const agentConfigPath = path.join(directory, "agent-config.json");
  const sourcesPath = path.join(directory, "sources.json");
  const bindingsPath = path.join(directory, "bindings.json");
  const compatibilityPath = path.join(directory, "compatibility.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ secrets: { test: credential } }));
  fs.writeFileSync(agentConfigPath, JSON.stringify({ providerId: "codex", installationId: "pipeline-agent", credentialRef: `file:${credentialPath}#test` }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ version: 1, sources: [
    { agentId: "codex", providerId: "codex", displayName: "Codex", installationId: "pipeline-agent", credentialRef: `file:${credentialPath}#test` },
    { agentId: "workbuddy", providerId: "workbuddy", displayName: "WorkBuddy", installationId: "pipeline-other-agent", credentialRef: `file:${credentialPath}#test` },
  ] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ version: 2, bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({ extensionVersion: "0.14.32", runtimeBuildId: "synthetic-build" }));
  const reportWriteScope = { ...BRIDGE_IDENTITY, workspaceId: "workspace", threadId: "thread", agentId: "codex", tabId: 42 };
  const bridge = createBridge({ sourcesPath, bindingsPath, compatibilityPath, configDir: path.join(directory, "config"), reportWriteGateOpen: gateOpen, reportWriteScope, pendingDirectory });
  let failActionPoll = false; let failActionCancel = false;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const failedPoll = failActionPoll && request.method === "GET" && /\/actions\/action_[^/]+$/.test(pathname);
    const failedCancel = failActionCancel && request.method === "POST" && /\/actions\/action_[^/]+\/cancel$/.test(pathname);
    if (failedPoll || failedCancel) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: false, reason: "SYNTHETIC_NETWORK_FAILURE" })); return; }
    bridge.handle(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browserHeaders = { "content-type": "application/json", origin: "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc", "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc", "x-tianyuan-extension-version": "0.14.32", "x-tianyuan-runtime-build-id": "synthetic-build" };
  const agentHeaders = { "content-type": "application/json", "x-tianyuan-agent-provider": "codex", "x-tianyuan-agent-installation": "pipeline-agent", "x-tianyuan-agent-credential": credential };
  async function request(method, endpoint, bodyValue, headers = agentHeaders) {
    const response = await fetch(`${base}${endpoint}`, { method, headers, body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue) });
    return { status: response.status, body: await response.json() };
  }
  const route = { isNewReportRoute: true, projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: BRIDGE_IDENTITY.reportType, reportMode: BRIDGE_IDENTITY.mode, reportDetailId: BRIDGE_IDENTITY.reportDetailId };
  const page = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: 42 };
  const registered = await request("POST", "/api/sessions/register", { sessionId: "session", binding: page, context: { route } }, browserHeaders);
  assert.equal(registered.status, 200);
  const heartbeat = await request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, browserHeaders);
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.session.context.reportAuthoring.v2.treeAvailable, true);
  const bindingResponse = await request("POST", "/api/sessions/session/agent-bindings", { providerId: "codex", installationId: "pipeline-agent", workspaceId: "workspace", conversationId: "thread", scope: "conversation", accessMode: "control" }, browserHeaders);
  assert.equal(bindingResponse.status, 200);
  const bindingId = bindingResponse.body.binding.bindingId;
  return {
    base,
    directory,
    agentConfigPath,
    bindingId,
    browserHeaders,
    agentHeaders,
    request,
    failActionRequests({ poll = false, cancel = false } = {}) { failActionPoll = poll; failActionCancel = cancel; },
    claimNext() {
      return request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`, undefined, browserHeaders);
    },
    async reportResult(actionId, result) {
      return request("POST", `/api/sessions/session/actions/${encodeURIComponent(actionId)}/result`, { bindingId, result }, browserHeaders);
    },
    async reconnectSession() {
      const reconnected = await request("POST", "/api/sessions/register", { sessionId: "session", binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, browserHeaders);
      assert.equal(reconnected.status, 200);
      const heartbeat = await request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, browserHeaders);
      assert.equal(heartbeat.status, 200);
      return reconnected.body.session.sessionId;
    },
    async cleanup() {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

// fixture + page_adapter 组合：在 fixture 的 vm 上下文里装载 page_adapter.js，
// 通过其 message 监听器驱动 runAction，并以 postMessage 捕获响应 —— 与浏览器通道形状一致。
function createPipelinePage(options = {}) {
  const page = buildReportPage({ detailId: "test-report", ...options });
  const listeners = [];
  const outgoing = [];
  const windowObject = page.context.window;
  windowObject.addEventListener = (type, handler) => { if (type === "message") listeners.push(handler); };
  windowObject.removeEventListener = (type, handler) => {
    const index = listeners.indexOf(handler);
    if (index >= 0) listeners.splice(index, 1);
  };
  windowObject.postMessage = (message) => { outgoing.push(message); };
  const pageAdapterSource = fs.readFileSync(path.join(root, "extension/src/injected/page_adapter.js"), "utf8");
  vm.runInContext(pageAdapterSource, page.context);
  let sequence = 0;
  return {
    page,
    journal: page.journal,
    helpers: page.helpers,
    async dispatch(payload) {
      const requestId = `pipeline-${++sequence}`;
      const before = outgoing.length;
      const event = { source: windowObject, data: { type: PAGE_ACTION_TYPE, requestId, payload } };
      for (const listener of [...listeners]) listener(event);
      const deadline = Date.now() + 30000;
      for (;;) {
        const message = outgoing.slice(before).find((item) => item?.type === PAGE_ACTION_RESULT_TYPE && item.requestId === requestId);
        if (message) return message.payload;
        if (Date.now() > deadline) throw new Error("page adapter did not respond in time");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
  };
}

// 侧栏代演：claim → 复验后转发 payload（写类动作且 confirmText 已下发时注入 writeAuthorized）
// → 在 fixture 页面执行 → 回报结果 → 按 agent 身份读取最终动作。
const REPORT_WRITE_ACTIONS = new Set(["report_execute", "report_save", "report_editor_command", "report_editor_save"]);
async function runThroughPage(pipeline, api, actionBody, { sanitizeFailure = false } = {}) {
  const submitted = await api.request("POST", "/api/sessions/session/actions", actionBody);
  if (submitted.status !== 200) return { submitted };
  const claimed = await api.claimNext();
  assert.ok(claimed.body.action, `expected action to claim for ${actionBody.action}`);
  assert.equal(claimed.body.action.type, actionBody.action);
  const payload = { ...claimed.body.action.payload };
  payload.reportIdentity = PAGE_IDENTITY;
  // 侧栏注入形状：写类动作且 confirmText 已随 action 下发时，注入 writeAuthorized:true
  if (REPORT_WRITE_ACTIONS.has(actionBody.action) && typeof payload.confirmText === "string" && payload.confirmText) {
    payload.writeAuthorized = true;
  }
  const pageResult = await pipeline.dispatch(payload);
  const resultForBridge = sanitizeFailure && !pageResult?.ok
    ? (await reportResultSanitizer).sanitizeReportFailure(pageResult, actionBody.action)
    : pageResult;
  await api.reportResult(submitted.body.action.actionId, resultForBridge);
  const finalResponse = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(submitted.body.action.actionId)}?projectId=workspace&threadId=thread`);
  return { submitted: submitted.body.action, claimed: claimed.body.action, payload, pageResult, resultForBridge, final: finalResponse.body.action };
}

function collapsedFixtureTree(nodes) {
  return nodes.map((node) => ({
    label: node.label,
    dataKey: node.dataKey,
    expanded: false,
    selected: false,
    lazy: false,
    ...(node.editor ? { editor: { framework: node.editor.framework, text: node.editor.text } } : {}),
    children: collapsedFixtureTree(node.children),
  }));
}

test("association diagnostics pass through the bound report pipeline without identifiers", async () => {
  const api = await setupBridge();
  try {
    const pipeline = createPipelinePage({ editors: "all" });
    const editor = pipeline.page.state.nodes[0].children[0].editorEl;
    editor.parentElement.setAttribute("data-node-key", "fixture-house-a");
    const result = await runThroughPage(pipeline, api, { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, action: "report_inspect" });
    assert.equal(result.final.status, "completed");
    const diagnostics = result.final.result.editor.associationDiagnostics;
    assert.equal(diagnostics.attributes["data-node-key"].uniquelyMatchedNodes, 1);
    assert.equal(JSON.stringify(diagnostics).includes("fixture-house-a"), false);
    assert.equal(diagnostics.evidenceOnly, true);
  } finally {
    await api.cleanup();
  }
});

test("write status reflects only the active exact report scope and control binding", async () => {
  for (const gateOpen of [false, true]) {
    const api = await setupBridge({ gateOpen });
    try {
      const sessions = await api.request("GET", "/api/sessions");
      const gate = sessions.body.sessions[0].agentBindings[0].reportWriteGate;
      assert.equal(gate.open, gateOpen);
      assert.equal(gate.scopeMatches, gateOpen);
      const route = { isNewReportRoute: true, projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: BRIDGE_IDENTITY.reportType, reportMode: BRIDGE_IDENTITY.mode, reportDetailId: "different-report" };
      const page = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: 42 };
      await api.request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, api.browserHeaders);
      const mismatch = await api.request("GET", "/api/sessions");
      assert.equal(mismatch.body.sessions[0].agentBindings[0].reportWriteGate.scopeMatches, false);
    } finally { await api.cleanup(); }
  }
});

test("search and clear pass through the bound Bridge and page adapter", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const pipeline = createPipelinePage();
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, action: "report_navigate" };
    const found = await runThroughPage(pipeline, api, { ...base, op: "search", keyword: "房屋" });
    assert.equal(found.final.status, "completed");
    assert.equal(found.payload.op, "search");
    const cleared = await runThroughPage(pipeline, api, { ...base, op: "clear_search" });
    assert.equal(cleared.final.status, "completed");
    assert.equal(cleared.payload.op, "clear_search");
    assert.ok(cleared.pageResult.tree.nodes.some((node) => node.label === "二、评估结论"));
  } finally {
    await api.cleanup();
  }
});

test("Bridge preserves a scoped editor formatting command in preview", async () => {
  const api = await setupBridge();
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_command", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" }, command: "bold", find: "测试文字" }] });
    assert.equal(submitted.status, 200);
    const claimed = await api.claimNext();
    assert.equal(claimed.body.action.payload.ops[0].kind, "editor_command");
    assert.equal(claimed.body.action.payload.ops[0].command, "bold");
    assert.equal(claimed.body.action.payload.ops[0].find, "测试文字");
  } finally {
    await api.cleanup();
  }
});

test("Bridge accepts only an explicit six-digit color and preserves it without reinterpretation", async () => {
  const api = await setupBridge();
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试", candidateId: "node-1" };
    const invalid = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_command", nodeRef, command: "font_color", color: "token=secret" }] });
    assert.equal(invalid.body.reason, "REPORT_COLOR_INVALID");
    const valid = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_command", nodeRef, command: "font_color", color: "#ABCDEF" }] });
    assert.equal(valid.status, 200);
    const claimed = await api.claimNext();
    assert.equal(claimed.body.action.payload.ops[0].color, "#abcdef");
  } finally {
    await api.cleanup();
  }
});

test("Bridge stages, reloads, and reads back every supported structure kind through the sidepanel sanitizer", async () => {
  const scenarios = [
    {
      kind: "structure_add_child",
      nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" },
      title: "子结构管线测试",
      fixture: { inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true, newNodeModelAvailable: true },
    },
    {
      kind: "structure_add_sibling",
      nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" },
      title: "同级结构管线测试",
      fixture: { inlineIcons: "tianyuan", inlineSiblingNoDialog: true, inlineBlankStructureNodes: true, newNodeModelAvailable: true },
    },
    {
      kind: "structure_delete",
      nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" },
      opConfirm: true,
      fixture: {},
    },
  ];
  for (const scenario of scenarios) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const pipeline = createPipelinePage(scenario.fixture);
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const expanded = await runThroughPage(pipeline, api, { ...base, action: "report_navigate", op: "expand_all" });
      assert.equal(expanded.final.status, "completed", `${scenario.kind}: expand_all`);
      const op = { kind: scenario.kind, nodeRef: scenario.nodeRef, ...(scenario.title ? { title: scenario.title } : {}), ...(scenario.opConfirm ? { opConfirm: true } : {}) };
      const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [op] });
      assert.equal(preview.final.status, "completed", `${scenario.kind}: ${preview.final.result?.reason || "preview"}`);
      assert.equal(preview.pageResult.confirmationRequired, "确认执行报告结构修改");
      assert.equal(preview.final.result.snapshotReady, true);
      assert.equal(preview.final.result.treeSnapshots.length, 1);
      assert.equal(JSON.stringify(preview.final).includes("privateTreeSnapshots"), false);
      const wrong = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
      assert.equal(wrong.body.reason, "REPORT_CONFIRM_TEXT_INVALID");
      const execute = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: "确认执行报告结构修改" }, { sanitizeFailure: true });
      assert.equal(execute.pageResult.ok, false, `${scenario.kind}: result should remain pending verification`);
      assert.equal(execute.pageResult.status, "pendingVerify");
      assert.equal(execute.resultForBridge.planHash, undefined, "the sidepanel sanitizer omits the page-supplied plan hash");
      assert.equal(execute.resultForBridge.planHashConsumed, true);
      assert.equal(execute.final.result.structurePending.status, "staged", `${scenario.kind}: ${JSON.stringify(execute.final.result)}`);

      const reloadRequest = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef: scenario.nodeRef, confirmText: "确认刷新并核验已保存报告" });
      assert.equal(reloadRequest.status, 200, `${scenario.kind}: ${reloadRequest.body.reason || "reload request"}`);
      const reload = await api.claimNext();
      assert.equal(reload.body.action.type, "report_reload");
      const reloadResult = await api.reportResult(reload.body.action.actionId, { ok: true, action: "report_reload", reloadRequested: true, security: { readOnly: true, writesPerformed: false } });
      assert.equal(reloadResult.body.action.status, "completed");

      const reloaded = createPipelinePage({
        tree: collapsedFixtureTree(pipeline.page.state.nodes),
        detailId: "test-report",
        documentTimeOrigin: pipeline.page.context.window.performance.timeOrigin + 100,
      });
      assert.equal(reloaded.page.state.nodes[0].expanded, false);
      const readback = await runThroughPage(reloaded, api, { ...base, action: "report_node_read", nodeRef: scenario.nodeRef, include: ["structure"], verifySaved: true });
      assert.ok(readback.pageResult.structureReadback, JSON.stringify({ pageResult: readback.pageResult, final: readback.final }));
      assert.equal(readback.pageResult.structureReadback.complete, true);
      assert.equal(readback.pageResult.uiStateChanged, true);
      assert.equal(reloaded.page.state.nodes[0].expanded, true);
      assert.equal(readback.final.result.structureVerification.verified, true, `${scenario.kind}: ${readback.final.result.reason || "readback"}`);
      assert.equal(readback.final.result.structureVerification.operationComplete, true);
    } finally {
      await api.cleanup();
    }
  }
});

test("failed new-node title remains pending after reload and blocks a duplicate add", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const pipeline = createPipelinePage({ inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true });
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" };
    await runThroughPage(pipeline, api, { ...base, action: "report_navigate", op: "expand_all" });
    const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "structure_add_child", nodeRef, title: "不会写入的标题" }] });
    assert.equal(preview.final.status, "completed");
    const execute = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: "确认执行报告结构修改" }, { sanitizeFailure: true });
    assert.equal(execute.final.result.structurePending.status, "staged");
    assert.equal(execute.pageResult.status, "pendingVerify");
    assert.equal(execute.pageResult.results[0].error, "REPORT_STRUCTURE_TITLE_MODEL_UNAVAILABLE");
    assert.equal(pipeline.journal.filter((entry) => entry.kind === "inline-click" && entry.op === "add-child").length, 1);

    const reloadRequest = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(reloadRequest.status, 200);
    const reload = await api.claimNext();
    await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true });
    const reloaded = createPipelinePage({
      tree: collapsedFixtureTree(pipeline.page.state.nodes),
      detailId: "test-report",
      documentTimeOrigin: pipeline.page.context.window.performance.timeOrigin + 100,
    });
    const readback = await runThroughPage(reloaded, api, { ...base, action: "report_node_read", nodeRef, include: ["structure"], verifySaved: true });
    assert.equal(readback.pageResult.structureReadback.complete, true);
    assert.equal(readback.final.result.structureVerification.verified, true);
    assert.equal(readback.final.result.structureVerification.titlePending, true);
    assert.equal(readback.final.result.structureVerification.operationComplete, false);
    assert.equal(readback.final.result.status, "pendingVerify");
    assert.equal(hasReportPending(path.join(api.directory, "report-pending"), BRIDGE_IDENTITY), true);

    const duplicate = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: "确认执行报告结构修改" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.reason, "REPORT_PENDING_VERIFY");
    assert.equal(pipeline.journal.filter((entry) => entry.kind === "inline-click" && entry.op === "add-child").length, 1);
  } finally {
    await api.cleanup();
  }
});

test("fresh composite readback archives a legacy placeholder partial and permits same-node title preview", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const pipeline = createPipelinePage({ inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true });
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const parentRef = { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" };
    await runThroughPage(pipeline, api, { ...base, action: "report_navigate", op: "expand_all" });
    const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "structure_add_child", nodeRef: parentRef, title: "恢复标题" }] });
    const execute = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: "确认执行报告结构修改" }, { sanitizeFailure: true });
    assert.equal(execute.final.result.structurePending.status, "staged");
    assert.equal(pipeline.journal.filter((entry) => entry.kind === "inline-click" && entry.op === "add-child").length, 1);

    const reloadRequest = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef: parentRef, confirmText: "确认刷新并核验已保存报告" });
    const reload = await api.claimNext();
    await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true });
    const reloadedTree = collapsedFixtureTree(pipeline.page.state.nodes);
    const markCreated = (nodes) => nodes.forEach((node) => {
      if (node.dataKey === "fixture-new-node") { node.newAdd = true; node.label = "节点1"; node.selected = true; }
      markCreated(node.children || []);
    });
    markCreated(reloadedTree);
    const reloaded = createPipelinePage({
      tree: reloadedTree, detailId: "test-report", newNodeRequiresActivation: true,
      newNodeActivationRequiresDoubleClick: true, newNodeModelAvailable: true,
      documentTimeOrigin: pipeline.page.context.window.performance.timeOrigin + 100,
    });
    const partialReadback = await runThroughPage(reloaded, api, { ...base, action: "report_node_read", nodeRef: parentRef, include: ["structure"], verifySaved: true });
    const createdNodeRef = partialReadback.final.result.structureVerification.createdNodeRef;
    assert.equal(partialReadback.final.result.structureVerification.titlePending, true);
    assert.equal(hasReportPending(path.join(api.directory, "report-pending"), BRIDGE_IDENTITY), true);
    const createdNode = reloaded.page.state.nodes.flatMap(function flatten(node) { return [node, ...node.children.flatMap(flatten)]; })
      .find((node) => node.dataKey === createdNodeRef.candidateId);
    assert.ok(createdNode?.editorEl?.editorView);
    const editorContainer = createdNode.editorEl.parentElement;
    editorContainer.setAttribute("id", `content_${createdNodeRef.candidateId}`);
    editorContainer.setAttribute("data-node-key", createdNodeRef.candidateId);
    const blankModel = { type: "doc", content: [{ type: "paragraph", attrs: { indent: 2, lineHeight: 2, textAlign: "justify" } }] };
    createdNode.editorEl.editorView.state.doc.toJSON = () => blankModel;
    createdNode.editorEl.editorView.editable = false;
    createdNode.editorEl.setAttribute("contenteditable", "false");
    for (const link of createdNode.editorEl.parentElement.querySelectorAll("a")) link.style.display = "none";
    reloaded.page.context.TextEncoder = TextEncoder;

    const readNodeRef = { ...createdNodeRef, label: "节点1" };
    const originalCrypto = reloaded.page.context.window.crypto;
    reloaded.page.context.window.crypto = { subtle: { digest: async (...args) => {
      const digest = await originalCrypto.subtle.digest(...args);
      createdNode.labelEl.textContent = "节点2";
      return digest;
    } } };
    const raced = await runThroughPage(reloaded, api, { ...base, action: "report_node_read", nodeRef: readNodeRef, include: ["structure", "editor"], verifySaved: true });
    assert.equal(raced.pageResult.reason, "REPORT_PENDING_READBACK_MISMATCH");
    assert.equal(hasReportPending(path.join(api.directory, "report-pending"), BRIDGE_IDENTITY), true);
    reloaded.page.context.window.crypto = originalCrypto;
    createdNode.labelEl.textContent = "节点1";
    const settled = await runThroughPage(reloaded, api, { ...base, action: "report_node_read", nodeRef: readNodeRef, include: ["structure", "editor"], verifySaved: true });
    assert.equal(settled.claimed.payload.structurePartialRead, true);
    assert.equal(settled.pageResult.structureReadback?.complete, true, JSON.stringify(settled.pageResult));
    assert.equal(settled.pageResult.editor.association, "node-id");
    assert.equal(settled.pageResult.editor.modelEditable, false);
    assert.equal(settled.pageResult.editor.saveControlAvailable, false);
    assert.equal(settled.final.status, "completed", JSON.stringify(settled.final.result));
    assert.equal(settled.final.result.status, "partial");
    assert.equal(settled.final.result.structureVerification.titleNotExecuted, true);
    assert.equal(settled.final.result.structureVerification.operationComplete, false);
    assert.equal(settled.final.result.structureVerification.structurePendingReleased, true);
    assert.equal(hasReportPending(path.join(api.directory, "report-pending"), BRIDGE_IDENTITY), false);
    assert.equal(JSON.stringify(settled.final.result).includes('"type":"doc"'), false);

    const replay = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: "确认执行报告结构修改" });
    assert.equal(replay.status, 409);
    assert.equal(replay.body.reason, "REPORT_PLAN_STALE");
    for (const link of createdNode.editorEl.parentElement.querySelectorAll("a")) link.style.display = "";
    const opened = await runThroughPage(reloaded, api, { ...base, action: "report_editor_open", nodeRef: readNodeRef });
    assert.equal(opened.final.status, "completed", JSON.stringify(opened.final.result));
    assert.equal(createdNode.editorEl.editorView.editable, true);
    const titlePreview = await runThroughPage(reloaded, api, { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef: readNodeRef, mode: "append", replace: "恢复标题" }] });
    assert.equal(titlePreview.pageResult.ok, true, JSON.stringify(titlePreview.pageResult));
    assert.equal(titlePreview.claimed.payload.ops[0].nodeRef.candidateId, createdNodeRef.candidateId);
    assert.equal(titlePreview.claimed.payload.ops[0].kind, "editor_text");
  } finally {
    await api.cleanup();
  }
});

test("report preview stores model privately without returning it to the agent", async () => {
  const api = await setupBridge({ gateOpen: false });
  try {
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const submitted = await api.request("POST", "/api/sessions/session/actions", { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "新增" }] });
    assert.equal(submitted.status, 200);
    const claimed = await api.claimNext();
    const result = await api.reportResult(claimed.body.action.actionId, { ok: true, planHash: `plan-${"a".repeat(32)}`, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "合成私密正文" }] }] } }] });
    assert.equal(result.status, 200);
    assert.equal(result.body.action.status, "completed");
    assert.equal(JSON.stringify(result.body).includes("合成私密正文"), false);
    const snapshot = result.body.action.result.snapshots[0];
    const saved = JSON.parse(fs.readFileSync(path.join(api.directory, "report-snapshots", `${snapshot.snapshotId}.json`), "utf8"));
    assert.equal(saved.model.content[0].content[0].text, "合成私密正文");
  } finally {
    await api.cleanup();
  }
});

test("a verified single-node staged edit permits one bound save without clearing its journal", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const planHash = `plan-${"a".repeat(32)}`;
    const modelHash = `sha256:${"a".repeat(64)}`;
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "测试" }] });
    const preview = await api.claimNext();
    await api.reportResult(preview.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", content: [{ type: "paragraph" }] } }] });
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    const execution = await api.claimNext();
    await api.reportResult(execution.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, security: { writesPerformed: true }, results: [{ index: 0, status: "pendingVerify", readback: { modelHash } }] });
    const wrong = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef: { ...nodeRef, candidateId: "other" }, confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(wrong.body.reason, "REPORT_PENDING_VERIFY");
    const save = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(save.status, 200);
    const claimedSave = await api.claimNext();
    assert.equal(claimedSave.body.action.payload.expectedModelHash, modelHash);
    const repeat = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(repeat.body.reason, "REPORT_PENDING_VERIFY");
  } finally { await api.cleanup(); }
});

test("saved readback requires reload and privately archives the exact model", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const { createHash } = require("node:crypto");
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const model = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "私有测试正文" }] }] };
    const modelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    const planHash = `plan-${"9".repeat(32)}`;
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "测试" }] });
    const preview = await api.claimNext();
    await api.reportResult(preview.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model }] });
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    const execution = await api.claimNext();
    await api.reportResult(execution.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, security: { writesPerformed: true }, results: [{ index: 0, status: "pendingVerify", readback: { modelHash } }] });
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
    const save = await api.claimNext();
    await api.reportResult(save.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_SAVE_UNVERIFIED", security: { writesPerformed: true }, documentTimeOrigin: 100 });
    const deniedReload = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "" });
    assert.equal(deniedReload.body.reason, "REPORT_PENDING_VERIFY");
    const requestedReload = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(requestedReload.status, 200);
    const reload = await api.claimNext();
    assert.equal(reload.body.action.type, "report_reload");
    await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true });
    const repeatReload = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(repeatReload.status, 200);
    assert.equal((await api.claimNext()).body.action, null);
    async function verify(documentTimeOrigin, actualModel = model) {
      await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_node_read", nodeRef, include: ["editor"], verifySaved: true });
      const claimed = await api.claimNext();
      assert.equal(claimed.body.action.payload.verifySaved, true);
      return api.reportResult(claimed.body.action.actionId, { ok: true, node: nodeRef, editor: { modelHash, modelEditable: false, domEditable: "false" }, privateSavedVerification: { model: actualModel, documentTimeOrigin } });
    }
    assert.equal((await verify(100)).body.action.result.reason, "REPORT_RELOAD_REQUIRED");
    assert.equal((await verify(101, { type: "doc" })).body.action.result.reason, "REPORT_PENDING_READBACK_MISMATCH");
    const verified = await verify(101);
    assert.equal(verified.body.action.result.savedVerification.verified, true);
    assert.equal(JSON.stringify(verified.body).includes("私有测试正文"), false);
  } finally { await api.cleanup(); }
});

test("orphaned editor-save journal can be recovered through exact node snapshot and one reload", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const model = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "recovery test" }] }] };
    const { createHash } = require("node:crypto");
    const modelHash = `sha256:${createHash("sha256").update(JSON.stringify(model)).digest("hex")}`;
    const orphanSaveActionId = "action_orphaned_save";
    markReportPending({ directory: path.join(api.directory, "report-pending"), reportIdentity: BRIDGE_IDENTITY, actionId: orphanSaveActionId, action: "report_editor_save" });

    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_node_read", nodeRef, include: ["editor"], verifySaved: true });
    const stage = await api.claimNext();
    assert.equal(stage.body.action.payload.verifySaved, true);
    const stagedResult = await api.reportResult(stage.body.action.actionId, { ok: true, node: nodeRef, editor: { modelHash, modelEditable: true, domEditable: "true" }, privateSavedVerification: { model, documentTimeOrigin: 101 } });
    assert.equal(stagedResult.body.action.result.recoveryStaged, true, JSON.stringify(stagedResult.body.action.result));
    assert.equal(JSON.stringify(stagedResult.body).includes("recovery test"), false);

    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    const reload = await api.claimNext();
    await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true });
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_node_read", nodeRef, include: ["editor"], verifySaved: true });
    const verify = await api.claimNext();
    const verified = await api.reportResult(verify.body.action.actionId, { ok: true, node: nodeRef, editor: { modelHash, modelEditable: false, domEditable: "false" }, privateSavedVerification: { model, documentTimeOrigin: 102 } });
    assert.equal(verified.body.action.result.savedVerification.verified, true);
    assert.equal(JSON.stringify(verified.body).includes("recovery test"), false);
  } finally { await api.cleanup(); }
});

test("report_editor_save without an existing staged node is rejected without creating an orphan journal", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const request = await api.request("POST", "/api/sessions/session/actions", {
      bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY,
      action: "report_editor_save", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "node-1" }, confirmText: CONFIRM_SAVE_TEXT,
    });
    assert.equal(request.status, 409);
    assert.equal(request.body.reason, "REPORT_SAVE_STAGE_REQUIRED");
    assert.equal((await api.claimNext()).body.action, null);
    assert.equal(fs.existsSync(path.join(api.directory, "config", "report-pending")), false);
  } finally { await api.cleanup(); }
});

test("inline staged save requires explicit target and verified model scope", async () => {
  for (const [command, verified] of [["bold", false], ["bold", true], ["italic", true], ["underline", true], ["strikethrough", true]]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
      const planHash = `plan-${"d".repeat(32)}`;
      const modelHash = `sha256:${"b".repeat(64)}`;
      await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_command", nodeRef, command, find: "测试" }] });
      const preview = await api.claimNext();
      await api.reportResult(preview.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", content: [{ type: "paragraph" }] } }] });
      await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
      const execution = await api.claimNext();
      await api.reportResult(execution.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, security: { writesPerformed: true }, results: [{ index: 0, status: "pendingVerify", readback: { modelHash, formatScopeVerified: verified } }] });
      const save = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
      if (!verified) assert.equal(save.body.reason, "REPORT_PENDING_VERIFY");
      else {
        assert.equal(save.status, 200);
        assert.equal((await api.claimNext()).body.action.payload.expectedModelHash, modelHash);
      }
    } finally { await api.cleanup(); }
  }
});

test("uncertain or malformed edit evidence never authorizes a staged save", async () => {
  for (const variant of ["write-error", "missing-hash", "multiple-results"]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
      const planHash = `plan-${"b".repeat(32)}`;
      await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "测试" }] });
      const preview = await api.claimNext();
      await api.reportResult(preview.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", content: [{ type: "paragraph" }] } }] });
      await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
      const execution = await api.claimNext();
      const entry = { index: 0, status: "pendingVerify", readback: { modelHash: `sha256:${"b".repeat(64)}` } };
      if (variant === "write-error") entry.error = "REPORT_EDITOR_DISPATCH_UNCERTAIN";
      if (variant === "missing-hash") delete entry.readback.modelHash;
      const results = variant === "multiple-results" ? [entry, { index: 1, status: "skipped" }] : [entry];
      await api.reportResult(execution.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, security: { writesPerformed: true }, results });
      const save = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
      assert.equal(save.body.reason, "REPORT_PENDING_VERIFY", variant);
    } finally { await api.cleanup(); }
  }
});

test("legacy save recovery checks private snapshots and still permits only one save", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const { saveReportSnapshot } = require("../native-helper/report-snapshot.js");
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const planHash = `plan-${"c".repeat(32)}`;
    const model = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "追加" }] });
    const preview = await api.claimNext();
    const previewResult = await api.reportResult(preview.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: model("原文") }] });
    const originalSnapshot = previewResult.body.action.result.snapshots[0];
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    const execution = await api.claimNext();
    await api.reportResult(execution.body.action.actionId, { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, security: { writesPerformed: true }, results: [{ index: 0, status: "pendingVerify" }] });
    const snapshotDirectory = path.join(api.directory, "report-snapshots");
    const currentSnapshot = saveReportSnapshot({ directory: snapshotDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, model: model("原文追加") });
    const recovery = { actionId: execution.body.action.actionId, appendedText: "追加", originalSnapshot, currentSnapshot };
    const save = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT, legacyRecovery: recovery });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(JSON.stringify(save.body).includes("原文"), false);
    const claimed = await api.claimNext();
    assert.match(claimed.body.action.payload.expectedModelHash, /^sha256:[0-9a-f]{64}$/);
    const repeat = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT, legacyRecovery: recovery });
    assert.notEqual(repeat.status, 200);
  } finally { await api.cleanup(); }
});

test("snapshot storage failure rejects the preview without disclosing its model", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    fs.writeFileSync(path.join(api.directory, "report-snapshots"), "not a directory");
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "测试" }] });
    const claimed = await api.claimNext();
    const result = await api.reportResult(claimed.body.action.actionId, { ok: true, planHash: `plan-${"f".repeat(32)}`, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", text: "合成私密正文" } }] });
    assert.equal(result.body.action.status, "failed");
    assert.equal(result.body.action.result.reason, "REPORT_SNAPSHOT_FAILED");
    assert.equal(JSON.stringify(result.body).includes("合成私密正文"), false);
    const execute = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: `plan-${"f".repeat(32)}`, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execute.body.reason, "REPORT_PLAN_STALE");
    assert.equal(submitted.status, 200);
  } finally {
    await api.cleanup();
  }
});

test("report execute refuses a snapshot altered after preview", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace: "测试" }] });
    const claimed = await api.claimNext();
    const result = await api.reportResult(claimed.body.action.actionId, { ok: true, planHash: `plan-${"e".repeat(32)}`, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef, model: { type: "doc", content: [] } }] });
    assert.equal(result.body.action.result.snapshotReady, true);
    const snapshotId = result.body.action.result.snapshots[0].snapshotId;
    fs.writeFileSync(path.join(api.directory, "report-snapshots", `${snapshotId}.json`), "changed");
    const execution = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: `plan-${"e".repeat(32)}`, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execution.body.reason, "REPORT_SNAPSHOT_REQUIRED");
    assert.equal((await api.claimNext()).body.action, null);
    assert.equal(submitted.status, 200);
  } finally {
    await api.cleanup();
  }
});

test("safety: preview plans expire on rebinding and cannot be queued twice", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const ops = [{ kind: "editor_text", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" }, mode: "append", replace: "测试" }];
    async function makePlan(planHash) {
      const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops });
      assert.equal(submitted.status, 200);
      assert.equal((await api.claimNext()).body.action.actionId, submitted.body.action.actionId);
      assert.equal((await api.reportResult(submitted.body.action.actionId, { ok: true, planHash, confirmationRequired: CONFIRM_EXECUTE_TEXT, privateSnapshots: [{ nodeRef: ops[0].nodeRef, model: { type: "doc", content: [] } }] })).status, 200);
    }
    const first = `plan-${"a".repeat(32)}`;
    await makePlan(first);
    const rebinding = await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(api.bindingId)}/access`, { accessMode: "control" }, api.browserHeaders);
    assert.equal(rebinding.status, 200);
    const stale = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: first, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(stale.body.reason, "REPORT_PLAN_STALE");
    const transferred = `plan-${"c".repeat(32)}`;
    await makePlan(transferred);
    const other = await api.request("POST", "/api/sessions/session/agent-bindings", { providerId: "workbuddy", installationId: "pipeline-other-agent", workspaceId: "other", conversationId: "other-thread", scope: "conversation", accessMode: "read" }, api.browserHeaders);
    const otherId = other.body.binding.bindingId;
    assert.equal((await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(otherId)}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" }, api.browserHeaders)).status, 200);
    assert.equal((await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(api.bindingId)}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" }, api.browserHeaders)).status, 200);
    assert.equal((await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: transferred, confirmText: CONFIRM_EXECUTE_TEXT })).body.reason, "REPORT_PLAN_STALE");
    const reconnected = `plan-${"d".repeat(32)}`;
    await makePlan(reconnected);
    const page = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: 42 };
    const route = { isNewReportRoute: true, projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: BRIDGE_IDENTITY.reportType, reportMode: BRIDGE_IDENTITY.mode };
    assert.equal((await api.request("POST", "/api/sessions/register", { sessionId: "session", binding: page, context: { route } }, api.browserHeaders)).status, 200);
    assert.equal((await api.request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, api.browserHeaders)).status, 200);
    assert.equal((await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: reconnected, confirmText: CONFIRM_EXECUTE_TEXT })).body.reason, "REPORT_PLAN_STALE");
    const second = `plan-${"b".repeat(32)}`;
    await makePlan(second);
    const body = { ...base, action: "report_execute", planHash: second, confirmText: CONFIRM_EXECUTE_TEXT };
    assert.equal((await api.request("POST", "/api/sessions/session/actions", { ...body, confirmText: "确认执行报告结构修改" })).body.reason, "REPORT_CONFIRM_TEXT_INVALID");
    assert.equal((await api.request("POST", "/api/sessions/session/actions", body)).status, 200);
    assert.equal((await api.request("POST", "/api/sessions/session/actions", body)).body.reason, "REPORT_PLAN_STALE");
  } finally {
    await api.cleanup();
  }
});

test("safety: queued report actions are cancelled if the tab or report route changes before claim", async () => {
  for (const change of ["tab", "route"]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const pending = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" }, mode: "append", replace: "新" }] });
      assert.equal(pending.status, 200);
      const page = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: change === "tab" ? 43 : 42 };
      const route = { isNewReportRoute: true, projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: change === "route" ? "3" : BRIDGE_IDENTITY.reportType, reportMode: BRIDGE_IDENTITY.mode };
      assert.equal((await api.request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: V2_CONTEXT } }, api.browserHeaders)).status, 200);
      assert.equal((await api.claimNext()).body.action, null);
      const readback = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(pending.body.action.actionId)}?projectId=workspace&threadId=thread`);
      assert.equal(readback.body.action.status, "cancelled");
      assert.equal(readback.body.action.cancellationReason, "REPORT_TARGET_OR_CONTROL_CHANGED");
    } finally {
      await api.cleanup();
    }
  }
});

test("safety: interrupted claimed report saves are pending verification rather than cancelled", async () => {
  for (const interruption of ["transfer", "reconnect"]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
      assert.equal(submitted.status, 200);
      assert.equal((await api.claimNext()).body.action.actionId, submitted.body.action.actionId);
      if (interruption === "transfer") {
        const other = await api.request("POST", "/api/sessions/session/agent-bindings", { providerId: "workbuddy", installationId: "pipeline-other-agent", workspaceId: "other", conversationId: "other-thread", scope: "conversation", accessMode: "read" }, api.browserHeaders);
        assert.equal((await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(other.body.binding.bindingId)}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" }, api.browserHeaders)).status, 200);
      } else {
        const page = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: 42 };
        const route = { isNewReportRoute: true, projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: BRIDGE_IDENTITY.reportType, reportMode: BRIDGE_IDENTITY.mode };
        assert.equal((await api.request("POST", "/api/sessions/register", { sessionId: "session", binding: page, context: { route } }, api.browserHeaders)).status, 200);
      }
      const result = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(submitted.body.action.actionId)}?projectId=workspace&threadId=thread`);
      assert.equal(result.status, 200);
      assert.equal(result.body.action.status, "pendingVerify");
      assert.equal(result.body.action.result.reason, "REPORT_ACTION_OUTCOME_UNKNOWN");
      assert.equal(result.body.action.result.security.credentialsReturned, false);
    } finally {
      await api.cleanup();
    }
  }
});

test("verified precondition failure releases the pending journal without a write", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
    const claimed = await api.claimNext();
    assert.equal(claimed.body.action.actionId, submitted.body.action.actionId);
    const result = await api.reportResult(claimed.body.action.actionId, { ok: false, reason: "REPORT_SAVE_TARGET_UNVERIFIED", security: { readOnly: true, writesPerformed: false } });
    assert.equal(result.body.action.result.reason, "REPORT_SAVE_TARGET_UNVERIFIED");
    const next = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" } });
    assert.equal(next.status, 200);
  } finally { await api.cleanup(); }
});

test("editor opening releases its journal only after unchanged-model evidence", async () => {
  for (const verified of [false, true]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
      const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_open", nodeRef });
      const claimed = await api.claimNext();
      assert.equal(claimed.body.action.actionId, submitted.body.action.actionId);
      await api.reportResult(claimed.body.action.actionId, { ok: true, modelUnchangedVerified: verified, security: { writesPerformed: false } });
      const next = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_navigate", op: "select", nodeRef });
      assert.equal(verified ? next.status : next.body.reason, verified ? 200 : "REPORT_PENDING_VERIFY");
    } finally { await api.cleanup(); }
  }
});

test("editor closing retains its journal unless the closed model is verified unchanged", async () => {
  for (const verified of [false, true]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
      const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_close", nodeRef });
      const claimed = await api.claimNext();
      assert.equal(claimed.body.action.actionId, submitted.body.action.actionId);
      await api.reportResult(claimed.body.action.actionId, { ok: true, editorClosed: true, modelUnchangedVerified: verified, security: { writesPerformed: true } });
      const next = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_navigate", op: "select", nodeRef });
      assert.equal(verified ? next.status : next.body.reason, verified ? 200 : "REPORT_PENDING_VERIFY");
    } finally { await api.cleanup(); }
  }
});

test("editor close releases its journal on a proven pre-click rejection", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_editor_close", nodeRef });
    const claimed = await api.claimNext();
    await api.reportResult(claimed.body.action.actionId, { ok: false, reason: "REPORT_EDITOR_NOT_FOUND", security: { readOnly: true, writesPerformed: false } });
    const next = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_navigate", op: "select", nodeRef });
    assert.equal(next.status, 200);
  } finally { await api.cleanup(); }
});

test("claimed report write stays blocked after Bridge restart while reads remain available", async () => {
  const pendingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "report-pending-restart-"));
  let first;
  let second;
  try {
    first = await setupBridge({ gateOpen: true, pendingDirectory });
    const base = (api) => ({ bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY });
    const write = await first.request("POST", "/api/sessions/session/actions", { ...base(first), action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(write.status, 200);
    assert.equal((await first.claimNext()).body.action.actionId, write.body.action.actionId);
    await first.cleanup();
    first = null;
    second = await setupBridge({ gateOpen: true, pendingDirectory });
    const blocked = await second.request("POST", "/api/sessions/session/actions", { ...base(second), action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" } });
    assert.equal(blocked.body.reason, "REPORT_PENDING_VERIFY");
    const read = await second.request("POST", "/api/sessions/session/actions", { ...base(second), action: "report_node_read", nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" } });
    assert.equal(read.status, 200);
  } finally {
    if (first) await first.cleanup();
    if (second) await second.cleanup();
    fs.rmSync(pendingDirectory, { recursive: true, force: true });
  }
});

test("safety: stopping a timed-out report action distinguishes queued and claimed states", async () => {
  for (const claim of [false, true]) {
    const api = await setupBridge({ gateOpen: true });
    try {
      const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
      const submitted = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
      assert.equal(submitted.status, 200);
      if (claim) assert.equal((await api.claimNext()).body.action.actionId, submitted.body.action.actionId);
      const endpoint = `/api/sessions/session/actions/${encodeURIComponent(submitted.body.action.actionId)}/cancel`;
      const otherHeaders = { ...api.agentHeaders, "x-tianyuan-agent-provider": "workbuddy", "x-tianyuan-agent-installation": "pipeline-other-agent" };
      const forbidden = await api.request("POST", endpoint, { projectId: "workspace", threadId: "thread" }, otherHeaders);
      assert.equal(forbidden.status, 403);
      const stopped = await api.request("POST", endpoint, { projectId: "workspace", threadId: "thread" });
      assert.equal(stopped.status, 200);
      assert.equal(stopped.body.action.status, claim ? "pendingVerify" : "cancelled");
      if (claim) assert.equal(stopped.body.action.result.reason, "REPORT_ACTION_OUTCOME_UNKNOWN");
      else assert.equal((await api.claimNext()).body.action, null);
      const replay = await api.request("POST", endpoint, { projectId: "workspace", threadId: "thread" });
      assert.equal(replay.body.action.status, stopped.body.action.status);
    } finally {
      await api.cleanup();
    }
  }
});

test("MCP client returns pending verification after control is transferred during a claimed save", async () => {
  const api = await setupBridge({ gateOpen: true });
  const originalConfig = process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH;
  const originalBridge = process.env.TIANYUAN_CONNECTOR_BRIDGE_URL;
  try {
    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = api.agentConfigPath;
    process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = api.base;
    const clientPath = path.join(root, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs");
    const client = await import(`${pathToFileURL(clientPath).href}?pending-test=${Date.now()}`);
    const pending = client.executeTool("tianyuan.report_save", { sessionId: "session", bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, confirmText: CONFIRM_SAVE_TEXT });
    let claimed = null;
    for (let attempt = 0; attempt < 100 && !claimed; attempt += 1) {
      claimed = (await api.claimNext()).body.action;
      if (!claimed) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(claimed?.type, "report_save");
    const other = await api.request("POST", "/api/sessions/session/agent-bindings", { providerId: "workbuddy", installationId: "pipeline-other-agent", workspaceId: "other", conversationId: "other-thread", scope: "conversation", accessMode: "read" }, api.browserHeaders);
    assert.equal((await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(other.body.binding.bindingId)}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" }, api.browserHeaders)).status, 200);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.action.status, "pendingVerify");
    assert.equal(result.action.result.reason, "REPORT_ACTION_OUTCOME_UNKNOWN");
  } finally {
    if (originalConfig === undefined) delete process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH; else process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = originalConfig;
    if (originalBridge === undefined) delete process.env.TIANYUAN_CONNECTOR_BRIDGE_URL; else process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = originalBridge;
    await api.cleanup();
  }
});

test("MCP client stops queued actions on polling failure and reports unknown if cancellation fails", async () => {
  for (const cancelFails of [false, true]) {
    const api = await setupBridge({ gateOpen: true });
    const originalConfig = process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH;
    const originalBridge = process.env.TIANYUAN_CONNECTOR_BRIDGE_URL;
    try {
      process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = api.agentConfigPath;
      process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = api.base;
      api.failActionRequests({ poll: true, cancel: cancelFails });
      const clientPath = path.join(root, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs");
      const client = await import(`${pathToFileURL(clientPath).href}?failure-test=${Date.now()}-${cancelFails}`);
      const result = await client.executeTool("tianyuan.report_save", { sessionId: "session", bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, confirmText: CONFIRM_SAVE_TEXT });
      assert.equal(result.ok, false);
      assert.equal(result.action.status, cancelFails ? "pendingVerify" : "cancelled");
      if (cancelFails) assert.equal(result.action.result.reason, "REPORT_ACTION_OUTCOME_UNKNOWN");
      else assert.equal((await api.claimNext()).body.action, null);
    } finally {
      if (originalConfig === undefined) delete process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH; else process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = originalConfig;
      if (originalBridge === undefined) delete process.env.TIANYUAN_CONNECTOR_BRIDGE_URL; else process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = originalBridge;
      await api.cleanup();
    }
  }
});

test("MCP client cancels an unclaimed report inspection on polling failure", async () => {
  const api = await setupBridge({ gateOpen: false });
  const originalConfig = process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH;
  const originalBridge = process.env.TIANYUAN_CONNECTOR_BRIDGE_URL;
  try {
    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = api.agentConfigPath;
    process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = api.base;
    api.failActionRequests({ poll: true });
    const clientPath = path.join(root, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs");
    const client = await import(`${pathToFileURL(clientPath).href}?inspect-failure=${Date.now()}`);
    const result = await client.executeTool("tianyuan.report_inspect", { sessionId: "session", bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY });
    assert.equal(result.ok, false);
    assert.equal(result.action.status, "cancelled");
    assert.equal((await api.claimNext()).body.action, null);
  } finally {
    if (originalConfig === undefined) delete process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH; else process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = originalConfig;
    if (originalBridge === undefined) delete process.env.TIANYUAN_CONNECTOR_BRIDGE_URL; else process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = originalBridge;
    await api.cleanup();
  }
});

test("safety: Bridge rejects discard even with the write gate disabled", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const api = await setupBridge({ gateOpen: false });
  try {
    const result = await api.request("POST", "/api/sessions/session/actions", {
      bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42,
      reportIdentity: BRIDGE_IDENTITY, action: "report_editor_close", discardConfirmed: true,
      nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" },
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.reason, "REPORT_DISCARD_UNSUPPORTED");
    const next = await api.claimNext();
    assert.equal(next.body.action, null);
  } finally {
    await api.cleanup();
  }
});

test("safety: Bridge preserves candidate identity for node reads", async () => {
  const api = await setupBridge({ gateOpen: false });
  try {
    const result = await api.request("POST", "/api/sessions/session/actions", {
      bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42,
      reportIdentity: BRIDGE_IDENTITY, action: "report_node_read",
      nodeRef: { nodePathKey: "0/1", label: "同名节点", candidateId: "node-b" },
    });
    assert.equal(result.status, 200);
    const claimed = await api.claimNext();
    assert.equal(claimed.body.action.payload.nodeRef.candidateId, "node-b");
  } finally {
    await api.cleanup();
  }
});

test("safety: Bridge rejects a write preview without a candidate identity", async () => {
  const api = await setupBridge({ gateOpen: false });
  try {
    const result = await api.request("POST", "/api/sessions/session/actions", {
      bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42,
      reportIdentity: BRIDGE_IDENTITY, action: "report_preview",
      ops: [{ kind: "editor_text", nodeRef: { nodePathKey: "0", label: "测试节点" }, mode: "append", replace: "测试" }],
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.reason, "REPORT_NODE_ID_REQUIRED");
    assert.equal((await api.claimNext()).body.action, null);
  } finally {
    await api.cleanup();
  }
});

test("safety: Bridge rejects sensitive or oversized preview content without truncating it", async () => {
  const api = await setupBridge({ gateOpen: false });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "node-1" };
    for (const replace of ["password=synthetic-secret", "x".repeat(20001)]) {
      const result = await api.request("POST", "/api/sessions/session/actions", {
        ...base, action: "report_preview", ops: [{ kind: "editor_text", nodeRef, mode: "append", replace }],
      });
      assert.equal(result.status, 400);
      assert.equal(result.body.reason, "REPORT_INPUT_INVALID");
      assert.equal(JSON.stringify(result.body).includes("synthetic-secret"), false);
    }
    const next = await api.claimNext();
    assert.equal(next.body.action, null);
  } finally {
    await api.cleanup();
  }
});

test("safety: Bridge rejects invalid explicit readback references and preserves omitted filters", async () => {
  const api = await setupBridge({ gateOpen: false });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const invalid = await api.request("POST", "/api/sessions/session/actions", {
      ...base, action: "report_readback", nodeRefs: [{ nodePathKey: "0", label: "测试", candidateId: "bad id" }],
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.reason, "REPORT_NODE_REFS_INVALID");
    const unfiltered = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_readback" });
    assert.equal(unfiltered.status, 200);
    const claimed = await api.claimNext();
    assert.equal(claimed.body.action.type, "report_readback");
    assert.equal(claimed.body.action.payload.nodeRefs, undefined);
  } finally {
    await api.cleanup();
  }
});

test("safety: navigation and editor lifecycle cannot alter UI when gate is closed", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const api = await setupBridge({ gateOpen: false });
  try {
    for (const action of ["report_navigate", "report_editor_open", "report_editor_close"]) {
      const result = await api.request("POST", "/api/sessions/session/actions", {
        bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42,
        reportIdentity: BRIDGE_IDENTITY, action, op: "select",
        nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" },
      });
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, "REPORT_WRITE_GATE_CLOSED");
    }
    const next = await api.claimNext();
    assert.equal(next.body.action, null);
  } finally {
    await api.cleanup();
  }
});

test("safety: open gate rejects writes to another report or absent detail identity", async () => {
  const api = await setupBridge({ gateOpen: true });
  try {
    const request = {
      bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42,
      action: "report_editor_command", command: "bold", confirmText: CONFIRM_EXECUTE_TEXT,
      nodeRef: { nodePathKey: "0", label: "测试", candidateId: "node-1" },
    };
    for (const reportIdentity of [
      { ...BRIDGE_IDENTITY, reportDetailId: "different-report" },
      { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, reportType: BRIDGE_IDENTITY.reportType, mode: BRIDGE_IDENTITY.mode },
    ]) {
      const result = await api.request("POST", "/api/sessions/session/actions", { ...request, reportIdentity });
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, "REPORT_WRITE_SCOPE_MISMATCH");
    }
    const next = await api.claimNext();
    assert.equal(next.body.action, null);
  } finally {
    await api.cleanup();
  }
});

test("报告写门禁关闭时 execute/save 一律 REPORT_WRITE_GATE_CLOSED 且零副作用", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const api = await setupBridge({ gateOpen: false });
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
    const execute = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: "plan-12345678", confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execute.status, 403);
    assert.equal(execute.body.reason, "REPORT_WRITE_GATE_CLOSED");
    const save = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(save.status, 403);
    assert.equal(save.body.reason, "REPORT_WRITE_GATE_CLOSED");
    const next = await api.claimNext();
    assert.equal(next.body.action, null, "rejected write actions must leave the queue untouched");
  } finally {
    await api.cleanup();
  }
});

test("写门禁可经环境变量 TIANYUAN_REPORT_WRITE_GATE_OPEN=1 打开", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN = "1";
  let api = null;
  try {
    api = await setupBridge({ gateOpen: false });
    const save = await api.request("POST", "/api/sessions/session/actions", { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY, action: "report_save", confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(save.status, 200);
    assert.equal(save.body.action.type, "report_save");
    assert.equal(save.body.action.target.confirmTextMasked, "已提供");
    assert.equal(JSON.stringify(save.body.action).includes(CONFIRM_SAVE_TEXT), false, "publicAction must not echo confirmText");
  } finally {
    delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
    if (api) await api.cleanup();
  }
});

test("门禁打开的隔离 Bridge：preview→execute 全链与全部防护语义", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const api = await setupBridge({ gateOpen: true });
  const pipeline = createPipelinePage();
  try {
    const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };

    // 目标身份不匹配
    const mismatch = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: "plan-12345678", confirmText: CONFIRM_EXECUTE_TEXT, tabId: 43 });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.reason, "REPORT_TARGET_MISMATCH");
    const wrongIdentity = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: "plan-12345678", confirmText: CONFIRM_EXECUTE_TEXT, reportIdentity: { ...BRIDGE_IDENTITY, companyId: "other" } });
    assert.equal(wrongIdentity.body.reason, "REPORT_TARGET_MISMATCH");

    // execute 缺 planHash / 缺 confirmText，save 缺 confirmText
    const noPlan = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(noPlan.status, 400);
    assert.equal(noPlan.body.reason, "REPORT_PLAN_REQUIRED");
    const longPlan = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: "p".repeat(129), confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(longPlan.body.reason, "REPORT_PLAN_REQUIRED");
    const noConfirm = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: "plan-12345678" });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.reason, "REPORT_CONFIRM_REQUIRED");
    const saveNoConfirm = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save" });
    assert.equal(saveNoConfirm.body.reason, "REPORT_CONFIRM_REQUIRED");

    // preview → execute 全链（确认文本正确才过）。fixture 的唯一可见编辑器只归属选中节点，
    // 因此先走一遍真实的 report_navigate 选中 0/0。
    const selectRun = await runThroughPage(pipeline, api, { ...base, action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" } });
    assert.equal(selectRun.final.status, "completed", selectRun.pageResult?.reason || "");
    assert.equal(selectRun.pageResult.ok, true);
    assert.equal(pipeline.page.helpers.selectedPath(), "0/0");
    const previewOps = [{ kind: "editor_text", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" }, mode: "append", replace: "（管线验证）" }];
    const previewRun = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: previewOps });
    assert.equal(previewRun.final.status, "completed", JSON.stringify(previewRun.pageResult));
    assert.equal(previewRun.pageResult.ok, true);
    assert.match(previewRun.pageResult.planHash, /^plan-[0-9a-f]{32}$/);
    assert.equal(previewRun.claimed.payload.ops[0].kind, "editor_text", "ops must survive target sanitization");
    assert.equal(previewRun.claimed.payload.ops[0].nodeRef.label, "1.1 房屋建筑物");
    const planHash = previewRun.pageResult.planHash;

    const executeRun = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(executeRun.body.reason, "REPORT_SNAPSHOT_REQUIRED");
    assert.equal(pipeline.helpers.editorText("0/0").endsWith("（管线验证）"), false);

    // confirmText 错误被拒：Bridge 放行（仅要求存在），页面适配器拒绝并使动作 failed
    const preview2 = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: previewOps });
    assert.equal(preview2.final.status, "completed");
    const wrongConfirm = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview2.pageResult.planHash, confirmText: "确认" });
    assert.equal(wrongConfirm.submitted.status, 400);
    assert.equal(wrongConfirm.submitted.body.reason, "REPORT_CONFIRM_TEXT_INVALID");
    assert.equal(pipeline.helpers.editorText("0/0").endsWith("（管线验证）（管线验证）"), false);

    // 同一绑定串行（现有机制语义）：Bridge 按 FIFO 逐个下发，每次认领取走最旧的一个；
    // 第二个动作保持 queued 等待，直到第一个完成后才被下一次认领取走。
    // （同一时刻只执行一个动作由侧栏 processConnectorActionQueue 的 connectorActionBusy 守卫保证。）
    const navigateBody = { ...base, action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0", label: "一、评估对象与范围" } };
    const first = await api.request("POST", "/api/sessions/session/actions", navigateBody);
    const second = await api.request("POST", "/api/sessions/session/actions", navigateBody);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const claimA = await api.claimNext();
    assert.equal(claimA.body.action.actionId, first.body.action.actionId);
    const secondWhileBusy = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(second.body.action.actionId)}?projectId=workspace&threadId=thread`);
    assert.equal(secondWhileBusy.body.action.status, "queued", "second action must wait queued while the first is unresolved");
    await api.reportResult(first.body.action.actionId, { ok: true, action: "report_navigate", selected: true });
    const claimB = await api.claimNext();
    assert.equal(claimB.body.action.actionId, second.body.action.actionId);
    await api.reportResult(second.body.action.actionId, { ok: true, action: "report_navigate", selected: true });

    // 控制绑定被撤销后，队列中的动作被取消并标记 AGENT_CONTROL_REVOKED
    const pending = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_preview", ops: previewOps });
    assert.equal(pending.status, 200);
    const otherBinding = await api.request("POST", "/api/sessions/session/agent-bindings", { providerId: "workbuddy", installationId: "pipeline-other-agent", workspaceId: "other-workspace", conversationId: "other-thread", scope: "conversation", accessMode: "read" }, api.browserHeaders);
    const otherBindingId = otherBinding.body.binding.bindingId;
    const transfer = await api.request("POST", `/api/sessions/session/agent-bindings/${encodeURIComponent(otherBindingId)}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" }, api.browserHeaders);
    assert.equal(transfer.status, 200);
    const cancelled = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(pending.body.action.actionId)}?projectId=workspace&threadId=thread`);
    assert.equal(cancelled.body.action.status, "cancelled");
    assert.equal(cancelled.body.action.cancellationReason, "AGENT_CONTROL_REVOKED");
  } finally {
    await pipeline.page.helpers.closeDialog();
    await api.cleanup();
  }
});

test("静态契约：writeAuthorized 注入、通道版本一致、长超时清单与门禁默认关闭", () => {
  const sidepanel = fs.readFileSync(path.join(root, "extension/src/sidepanel/sidepanel.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "extension/src/content/content.js"), "utf8");
  const pageAdapter = fs.readFileSync(path.join(root, "extension/src/injected/page_adapter.js"), "utf8");
  const bridge = fs.readFileSync(path.join(root, "native-helper/connector_bridge.js"), "utf8");

  // sidepanel 对写类动作注入 writeAuthorized（仅当动作来自 Bridge 且 confirmText 已随 action 下发）
  assert.match(sidepanel, /REPORT_WRITE_ACTION_TYPES\.includes\(claimedAction\.type\) && typeof reportPayload\.confirmText === "string" && reportPayload\.confirmText/);
  assert.match(sidepanel, /reportPayload\.writeAuthorized = true;/);
  // 同一绑定串行：侧栏动作队列由 connectorActionBusy 守卫，同一时间只执行一个动作
  assert.match(sidepanel, /if \(\s*\n\s*connectorActionBusy\s*\n\s*\|\|/);

  // content 与 page_adapter 的消息通道版本必须一致
  const versionOf = (source) => source.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1] || "";
  assert.equal(versionOf(content), versionOf(pageAdapter));
  assert.equal(versionOf(content), PAGE_ADAPTER_VERSION);

  // content 长超时列表包含新写动作与回读
  assert.match(content, /const actionTimeout = \[[^\]]*"report_execute", "report_save", "report_readback"/);

  // Bridge：写门禁默认关闭，仅 options/env 显式打开；写类动作先过门禁
  assert.match(bridge, /options\.reportWriteGateOpen === true \|\| process\.env\.TIANYUAN_REPORT_WRITE_GATE_OPEN === "1"/);
  assert.match(bridge, /REPORT_WRITE_ACTIONS\.includes\(type\) && !reportWriteGateOpen\(\)/);
  assert.match(bridge, /"report_execute", "report_save", "report_editor_command", "report_editor_save"\]/);
  // 编辑器动作白名单：open/close 控制类，command/save 写类
  assert.match(bridge, /"report_editor_open", "report_editor_close"\]/);
  assert.match(bridge, /type === "report_editor_command"/);
  assert.match(bridge, /action\.target\.confirmTextMasked = /);
});

test("fixture+page_adapter 端到端：preview→execute（侧栏注入 writeAuthorized 形状）→readback", async () => {
  const pipeline = createPipelinePage();
  // fixture 的唯一可见编辑器只归属当前选中节点：先真实选中 0/0，再打开属性对话框
  const selected = await pipeline.dispatch({ action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" }, reportIdentity: PAGE_IDENTITY });
  assert.equal(selected.ok, true, selected.reason || "");
  pipeline.page.helpers.openSettings("0/1");
  const before = pipeline.page.helpers.snapshot();
  const ops = [
    { kind: "settings_write", nodeRef: { nodePathKey: "0/1", label: "1.1 房屋建筑物", candidateId: "fixture-house-b" }, fields: [{ label: "是否编号", value: "是" }] },
    { kind: "editor_text", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" }, mode: "append", replace: "（端到端校验）" },
  ];
  const preview = await pipeline.dispatch({ action: "report_preview", reportIdentity: PAGE_IDENTITY, ops });
  assert.equal(preview.ok, true, preview.reason || "");
  assert.equal(preview.adapterVersion, PAGE_ADAPTER_VERSION, "response must echo the channel version");
  assert.match(preview.planHash, /^plan-[0-9a-f]{32}$/);
  assert.deepEqual(pipeline.page.helpers.snapshot(), before, "preview must not change anything");

  // 与侧栏注入后的 payload 形状一致：planHash + confirmText + writeAuthorized + reportIdentity
  const execute = await pipeline.dispatch({
    action: "report_execute",
    planHash: preview.planHash,
    confirmText: CONFIRM_EXECUTE_TEXT,
    writeAuthorized: true,
    reportIdentity: PAGE_IDENTITY,
  });
  assert.equal(execute.ok, false, JSON.stringify(execute.results || execute));
  assert.equal(execute.planHashConsumed, true);
  const statuses = execute.results.map((item) => item.status);
  assert.equal(statuses.length, 2);
  assert.deepEqual(Array.from(statuses), ["pendingVerify", "skipped"]);
  assert.equal(pipeline.page.state.persistedSettingsByPath.get("0/1").是否编号, "是");
  assert.equal(pipeline.page.helpers.editorText("0/0").endsWith("（端到端校验）"), false);

  const readback = await pipeline.dispatch({
    action: "report_readback",
    nodeRefs: [{ nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" }],
    reportIdentity: PAGE_IDENTITY,
  });
  assert.equal(readback.ok, true);
  assert.equal(readback.contentHash, execute.contentHashAfter);
  assert.equal(readback.nodes.length, 1);
  assert.equal(readback.nodes[0].textPreview.includes("（端到端校验）"), false);

  // 页面适配器不识别的报告动作返回 REPORT_ACTION_UNSUPPORTED
  const unknown = await pipeline.dispatch({ action: "report_frobnicate", reportIdentity: PAGE_IDENTITY });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, "REPORT_ACTION_UNSUPPORTED");
  assert.equal(unknown.action, "report_frobnicate");
});

test("编辑器生命周期经 Bridge 链路：open→command（门禁/参数/白名单）→save→close（未保存保护）", async () => {
  delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const nodeRef = { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" };
  const base = (api) => ({ bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY });

  // 门禁关闭：editor_command 属写类，一律 REPORT_WRITE_GATE_CLOSED（零副作用）
  const closed = await setupBridge({ gateOpen: false });
  try {
    const gated = await closed.request("POST", "/api/sessions/session/actions", { ...base(closed), action: "report_editor_command", command: "bold", nodeRef });
    assert.equal(gated.status, 403);
    assert.equal(gated.body.reason, "REPORT_WRITE_GATE_CLOSED");
  } finally {
    await closed.cleanup();
  }

  const api = await setupBridge({ gateOpen: true });
  const pipeline = createPipelinePage();
  try {
    // Bridge 参数校验：command 缺失 / nodeRef 缺失 / save 缺确认文本
    const noCommand = await api.request("POST", "/api/sessions/session/actions", { ...base(api), action: "report_editor_command", nodeRef });
    assert.equal(noCommand.status, 400);
    assert.equal(noCommand.body.reason, "REPORT_COMMAND_REQUIRED");
    const noNodeRef = await api.request("POST", "/api/sessions/session/actions", { ...base(api), action: "report_editor_command", command: "bold" });
    assert.equal(noNodeRef.body.reason, "REPORT_NODE_REF_REQUIRED");
    const saveNoConfirm = await api.request("POST", "/api/sessions/session/actions", { ...base(api), action: "report_editor_save", nodeRef });
    assert.equal(saveNoConfirm.body.reason, "REPORT_CONFIRM_REQUIRED");

    // 真实选中节点后 open 编辑框（open 属控制类，不受门禁约束）
    const selectRun = await runThroughPage(pipeline, api, { ...base(api), action: "report_navigate", op: "select", nodeRef });
    assert.equal(selectRun.final.status, "completed", selectRun.pageResult?.reason || "");
    assert.equal(pipeline.helpers.selectedPath(), "0/0");
    const openRun = await runThroughPage(pipeline, api, { ...base(api), action: "report_editor_open", nodeRef });
    assert.equal(openRun.final.status, "completed", JSON.stringify(openRun.pageResult));
    assert.equal(openRun.pageResult.ok, true);
    assert.equal(openRun.pageResult.editorOpen, true);

    assert.equal(openRun.pageResult.modelUnchangedVerified, false);
    const blocked = await api.request("POST", "/api/sessions/session/actions", { ...base(api), action: "report_editor_command", command: "bold", nodeRef, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(blocked.body.reason, "REPORT_PENDING_VERIFY");
  } finally {
    await pipeline.page.helpers.closeDialog?.();
    await api.cleanup();
  }
});

test("numbering settings remain pending until same-target post-reload readback is archived", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "report-settings-stage-"));
  const pendingDirectory = path.join(tempRoot, "pending");
  const api = await setupBridge({ gateOpen: true, pendingDirectory });
  const pipeline = createPipelinePage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false,
    treeEditInitiallyActive: true, inlineIconsRequireTreeEditMode: true, reloadClosesTreeEditMode: true });
  const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
  const nodeRef = { nodePathKey: "0/1", label: "1.1 房屋建筑物", candidateId: "fixture-house-b" };
  try {
    const initialOpenPreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    const initialOpen = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: initialOpenPreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(initialOpen.final.status, "completed", JSON.stringify(initialOpen.final.result));
    const initialArchiveCount = fs.readdirSync(path.join(pendingDirectory, "resolved")).length;
    const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_write", nodeRef, fields: [{ label: "是否编号", value: "是" }] }] });
    assert.equal(preview.pageResult.ok, true, JSON.stringify(preview.pageResult));
    assert.equal(preview.final.result.snapshotReady, true);
    const execution = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execution.pageResult.status, "pendingVerify");
    assert.equal(execution.pageResult.reason, "REPORT_PERSISTENCE_UNVERIFIED");
    assert.equal(execution.pageResult.submissionAttempted, true);
    assert.equal(execution.pageResult.results[0].readback.settingsDialogClosed, true);
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);
    const pendingFile = fs.readdirSync(pendingDirectory).find((name) => name.endsWith(".json"));
    const pendingRecord = JSON.parse(fs.readFileSync(path.join(pendingDirectory, pendingFile), "utf8"));
    assert.deepEqual(pendingRecord.settingsStage.expectedFields, [{ label: "是否编号", value: "是" }]);
    assert.equal(pendingRecord.settingsStage.submitActionId, execution.submitted.actionId);
    assert.equal(pendingRecord.settingsStage.submissionAttempted, true);
    const beforeReloadOwner = { ...pendingRecord.settingsStage.owner, sessionEpoch: "not-yet-reloaded-epoch" };
    assert.equal(canReopenReportSettings({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: beforeReloadOwner }), false);
    assert.throws(() => readReportSettingsStage({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: beforeReloadOwner }), /REPORT_PENDING_VERIFY/);

    const prematureRead = await runThroughPage(pipeline, api, { ...base, action: "report_node_read", nodeRef, include: ["settings"], verifySaved: true });
    assert.equal(prematureRead.final.result.reason, "REPORT_RELOAD_REQUIRED");
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);
    assert.equal(fs.readdirSync(path.join(pendingDirectory, "resolved")).length, initialArchiveCount);

    const reloadRequest = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(reloadRequest.status, 200);
    const reload = await api.claimNext();
    assert.equal(reload.body.action.type, "report_reload");
    pipeline.helpers.reloadSettings();
    const reloadResult = await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true, security: { readOnly: true, writesPerformed: false } });
    assert.equal(reloadResult.body.action.result.ok, true);
    const reloadConfirmedRecord = JSON.parse(fs.readFileSync(path.join(pendingDirectory, pendingFile), "utf8"));
    const reloadedStage = reloadConfirmedRecord.settingsStage;
    const restartedOwner = { ...reloadedStage.owner, sessionEpoch: "bridge-restart-epoch" };
    assert.equal(reloadedStage.reloadRequested, true);
    assert.equal(canReopenReportSettings({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: restartedOwner }), true);
    assert.equal(readReportSettingsStage({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: restartedOwner }).reloadActionId, reloadedStage.reloadActionId);
    const syntheticReadback = { available: true, fields: [{ label: "是否编号", selected: ["是"] }] };
    for (const [key, value] of Object.entries({ sessionId: "other-session", bindingId: "other-binding", controlEpoch: "other-control", tabId: 43 })) {
      const changedOwner = { ...restartedOwner, [key]: value };
      assert.equal(canReopenReportSettings({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: changedOwner }), false, key);
      assert.throws(() => readReportSettingsStage({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: changedOwner }), /REPORT_PENDING_VERIFY/, key);
      assert.throws(() => archiveReportPendingAfterSettingsReadback({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: changedOwner,
        reloadActionId: reloadedStage.reloadActionId, documentTimeOrigin: 1100, settings: syntheticReadback }), /REPORT_PENDING_READBACK_MISMATCH/, key);
    }
    const wrongNodeRef = { ...nodeRef, candidateId: "other-node" };
    assert.equal(canReopenReportSettings({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef: wrongNodeRef, owner: restartedOwner }), false);
    assert.throws(() => readReportSettingsStage({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef: wrongNodeRef, owner: restartedOwner }), /REPORT_PENDING_VERIFY/);
    const syntheticArchiveArgs = { directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, nodeRef, owner: restartedOwner,
      reloadActionId: reloadedStage.reloadActionId, documentTimeOrigin: 1100, settings: syntheticReadback };
    assert.throws(() => archiveReportPendingAfterSettingsReadback({ ...syntheticArchiveArgs, reloadActionId: "action_wrong_reload" }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.throws(() => archiveReportPendingAfterSettingsReadback({ ...syntheticArchiveArgs, documentTimeOrigin: reloadedStage.documentTimeOrigin }), /REPORT_PENDING_READBACK_MISMATCH/);
    assert.throws(() => archiveReportPendingAfterSettingsReadback({ ...syntheticArchiveArgs,
      settings: { available: true, fields: [{ label: "是否编号", selected: ["否"] }] } }), /REPORT_PENDING_READBACK_MISMATCH/);
    const duplicateReload = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(duplicateReload.status, 200);
    const duplicateClaim = await api.claimNext();
    assert.equal(duplicateClaim.body.action, null);
    const duplicateResult = await api.request("GET", `/api/sessions/session/actions/${encodeURIComponent(duplicateReload.body.action.actionId)}?projectId=workspace&threadId=thread`);
    assert.equal(duplicateResult.body.action.status, "failed");
    assert.equal(duplicateResult.body.action.result.reason, "REPORT_PENDING_VERIFY");
    assert.equal(pipeline.helpers.treeEditMode(), false);
    assert.equal(pipeline.page.context.document.querySelectorAll(".node-inline-icon").length, 0);
    const oldEpochPreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    assert.equal(oldEpochPreview.pageResult.ok, true);
    assert.equal(await api.reconnectSession(), "session");
    const staleEpochExecute = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute",
      planHash: oldEpochPreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(staleEpochExecute.status, 409);
    assert.equal(staleEpochExecute.body.reason, "REPORT_PLAN_STALE");

    const wrongNodePreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" } }] });
    assert.equal(wrongNodePreview.pageResult.ok, true);
    const wrongNodeOpen = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: wrongNodePreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(wrongNodeOpen.status, 409);
    assert.equal(wrongNodeOpen.body.reason, "REPORT_PENDING_VERIFY");
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);

    const blockedWriteReplay = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute",
      planHash: preview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(blockedWriteReplay.status, 409);
    assert.equal(blockedWriteReplay.body.reason, "REPORT_PENDING_VERIFY");
    const blockedSaveReplay = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_save", nodeRef, confirmText: CONFIRM_SAVE_TEXT });
    assert.equal(blockedSaveReplay.status, 409);
    assert.equal(blockedSaveReplay.body.reason, "REPORT_PENDING_VERIFY");

    const reopenPreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    assert.equal(reopenPreview.pageResult.ok, true);
    assert.equal(reopenPreview.pageResult.ops[0].before, "树浏览态；属性设置弹窗关闭");
    assert.equal(reopenPreview.pageResult.ops[0].after, "进入树编辑态；属性设置弹窗打开并核对目标节点");
    const reopened = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: reopenPreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(reopened.final.status, "completed", JSON.stringify(reopened.final.result));
    assert.equal(pipeline.helpers.treeEditMode(), true);
    assert.equal(pipeline.journal.some((entry) => entry.kind === "tree-edit-mode" && entry.active === true), true);
    assert.equal(pipeline.journal.some((entry) => entry.kind === "inline-click" && entry.op === "settings" && entry.path === "0/1"), true);
    const readback = await runThroughPage(pipeline, api, { ...base, action: "report_node_read", nodeRef, include: ["settings"], verifySaved: true });
    assert.equal(readback.final.status, "completed", JSON.stringify(readback.final.result));
    assert.equal(readback.final.result.settingsVerification.verified, true);
    assert.deepEqual(readback.final.result.settingsVerification.fields, [{ label: "是否编号", value: "是" }]);
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), false);
    const archives = fs.readdirSync(path.join(pendingDirectory, "resolved"));
    assert.equal(archives.length, initialArchiveCount + 1);
    const archived = archives.map((name) => JSON.parse(fs.readFileSync(path.join(pendingDirectory, "resolved", name), "utf8")))
      .find((record) => record.actionId === execution.submitted.actionId);
    assert.ok(archived);
    assert.equal(archived.actionId, execution.submitted.actionId);
    assert.equal(archived.resolution.type, "settings-saved-after-reload-readback");
    assert.equal(archived.resolution.documentTimeOrigin > archived.settingsStage.documentTimeOrigin, true);
  } finally {
    pipeline.helpers.closeDialog();
    await api.cleanup();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("settings confirmation timeout keeps pending and mismatched refreshed fields never verify saved", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "report-settings-mismatch-"));
  const pendingDirectory = path.join(tempRoot, "pending");
  const api = await setupBridge({ gateOpen: true, pendingDirectory });
  const pipeline = createPipelinePage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false, settingsConfirmMode: "stay-open" });
  const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
  const nodeRef = { nodePathKey: "0/1", label: "1.1 房屋建筑物", candidateId: "fixture-house-b" };
  try {
    const initialOpenPreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    const initialOpen = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: initialOpenPreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(initialOpen.final.status, "completed", JSON.stringify(initialOpen.final.result));
    const initialArchiveCount = fs.readdirSync(path.join(pendingDirectory, "resolved")).length;
    const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_write", nodeRef, fields: [{ label: "是否编号", value: "是" }] }] });
    const execution = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execution.pageResult.results[0].error, "REPORT_SETTINGS_CONFIRM_TIMEOUT");
    assert.equal(execution.pageResult.submissionAttempted, true);
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);

    const reloadRequest = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_reload", nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(reloadRequest.status, 200);
    const reload = await api.claimNext();
    pipeline.helpers.reloadSettings();
    const reloadResult = await api.reportResult(reload.body.action.actionId, { ok: true, reloadRequested: true, security: { readOnly: true, writesPerformed: false } });
    assert.equal(reloadResult.body.action.result.ok, true);
    const reopenPreview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    const reopened = await runThroughPage(pipeline, api, { ...base, action: "report_execute", planHash: reopenPreview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(reopened.final.status, "completed");
    const readback = await runThroughPage(pipeline, api, { ...base, action: "report_node_read", nodeRef, include: ["settings"], verifySaved: true });
    assert.equal(readback.final.result.reason, "REPORT_PENDING_READBACK_MISMATCH");
    assert.equal(readback.final.result.settingsVerification, undefined);
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);
    const archives = fs.readdirSync(path.join(pendingDirectory, "resolved"));
    assert.equal(archives.length, initialArchiveCount);
    assert.equal(archives.map((name) => JSON.parse(fs.readFileSync(path.join(pendingDirectory, "resolved", name), "utf8")))
      .some((record) => record.resolution?.type === "settings-saved-after-reload-readback"), false);
  } finally {
    pipeline.helpers.closeDialog();
    await api.cleanup();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("untyped legacy report journal cannot be recovered by a settings-open plan", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "report-settings-legacy-"));
  const pendingDirectory = path.join(tempRoot, "pending");
  const api = await setupBridge({ gateOpen: true, pendingDirectory });
  const pipeline = createPipelinePage({ settingsDialogDataNodeKey: false });
  const base = { bindingId: api.bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity: BRIDGE_IDENTITY };
  const nodeRef = { nodePathKey: "0/1", label: "1.1 房屋建筑物", candidateId: "fixture-house-b" };
  try {
    markReportPending({ directory: pendingDirectory, reportIdentity: BRIDGE_IDENTITY, actionId: "action_untyped_legacy", action: "report_execute" });
    const preview = await runThroughPage(pipeline, api, { ...base, action: "report_preview", ops: [{ kind: "settings_open", nodeRef }] });
    assert.equal(preview.pageResult.ok, true);
    const execute = await api.request("POST", "/api/sessions/session/actions", { ...base, action: "report_execute", planHash: preview.pageResult.planHash, confirmText: CONFIRM_EXECUTE_TEXT });
    assert.equal(execute.status, 409);
    assert.equal(execute.body.reason, "REPORT_PENDING_VERIFY");
    assert.equal(hasReportPending(pendingDirectory, BRIDGE_IDENTITY), true);
    const journalFile = fs.readdirSync(pendingDirectory).find((name) => name.endsWith(".json"));
    const journal = JSON.parse(fs.readFileSync(path.join(pendingDirectory, journalFile), "utf8"));
    assert.equal(journal.actionId, "action_untyped_legacy");
    assert.equal(journal.settingsStage, undefined);
    assert.equal(fs.existsSync(path.join(pendingDirectory, "resolved")), false);
  } finally {
    pipeline.helpers.closeDialog();
    await api.cleanup();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Bridge capability exposes only the verified settings writer allowlist", async () => {
  const api = await setupBridge({ gateOpen: false });
  const binding = { projectId: BRIDGE_IDENTITY.projectId, companyId: BRIDGE_IDENTITY.companyId, pageType: "new-report", tabId: 42 };
  const route = {
    isNewReportRoute: true,
    projectId: BRIDGE_IDENTITY.projectId,
    companyId: BRIDGE_IDENTITY.companyId,
    reportType: BRIDGE_IDENTITY.reportType,
    reportMode: BRIDGE_IDENTITY.mode,
    reportDetailId: BRIDGE_IDENTITY.reportDetailId,
  };
  try {
    const supported = await api.request("POST", "/api/sessions/session/heartbeat", {
      binding,
      context: { route, reportAuthoring: { ...V2_CONTEXT, settingsAvailable: true, settingsWriteSupported: true, settingsWritableFields: ["节点类型=目录", "是否编号=是"] } },
    }, api.browserHeaders);
    assert.deepEqual(supported.body.session.context.reportAuthoring.v2.settingsWritableFields, ["是否编号=是"]);
    assert.equal(supported.body.session.context.reportAuthoring.v2.settingsWriteSupported, true);
    const unsupported = await api.request("POST", "/api/sessions/session/heartbeat", {
      binding,
      context: { route, reportAuthoring: { ...V2_CONTEXT, settingsAvailable: true, settingsWriteSupported: true, settingsWritableFields: ["节点类型=目录"] } },
    }, api.browserHeaders);
    assert.deepEqual(unsupported.body.session.context.reportAuthoring.v2.settingsWritableFields, []);
    assert.equal(unsupported.body.session.context.reportAuthoring.v2.settingsWriteSupported, false);
  } finally { await api.cleanup(); }
});
