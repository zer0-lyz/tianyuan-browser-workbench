"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { createBridge } = require("../native-helper/connector_bridge.js");

test("report inspection is bound to the live adapter, agent, tab and report route", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-report-bridge-"));
  const credential = "synthetic-test-credential";
  const credentialPath = path.join(directory, "credential.json");
  const sourcesPath = path.join(directory, "sources.json");
  const bindingsPath = path.join(directory, "bindings.json");
  const compatibilityPath = path.join(directory, "compatibility.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ secrets: { test: credential } }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ version: 1, sources: [
    { agentId: "codex", providerId: "codex", displayName: "Codex", installationId: "test-agent", credentialRef: `file:${credentialPath}#test` },
    { agentId: "workbuddy", providerId: "workbuddy", displayName: "WorkBuddy", installationId: "test-other-agent", credentialRef: `file:${credentialPath}#test` },
  ] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ version: 2, bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({ extensionVersion: "0.14.32", runtimeBuildId: "synthetic-build" }));
  const agentConfigPath = path.join(directory, "agent-config.json");
  fs.writeFileSync(agentConfigPath, JSON.stringify({ providerId: "codex", installationId: "test-agent", credentialRef: `file:${credentialPath}#test` }));
  const priorWriteGate = process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
  const bridge = createBridge({ sourcesPath, bindingsPath, compatibilityPath, configDir: path.join(directory, "config"), reportWriteScope: { workspaceId: "workspace", threadId: "thread", agentId: "codex", tabId: 42, projectId: "business-project", companyId: "company", reportType: "2", mode: "add", reportDetailId: "report-detail" } });
  const server = http.createServer((request, response) => bridge.handle(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browserHeaders = { "content-type": "application/json", origin: "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc", "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc", "x-tianyuan-extension-version": "0.14.32", "x-tianyuan-runtime-build-id": "synthetic-build" };
  const agentHeaders = { "content-type": "application/json", "x-tianyuan-agent-provider": "codex", "x-tianyuan-agent-installation": "test-agent", "x-tianyuan-agent-credential": credential };
  async function request(method, endpoint, body, headers = browserHeaders) {
    const response = await fetch(`${base}${endpoint}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  try {
    const route = { isNewReportRoute: true, projectId: "business-project", companyId: "company", reportType: "2", reportMode: "add", reportDetailId: "report-detail" };
    const page = { projectId: "business-project", companyId: "company", pageType: "new-report", tabId: 42 };
    const reportIdentity = { projectId: "business-project", companyId: "company", reportType: "2", mode: "add", reportDetailId: "report-detail" };
    const registration = await request("POST", "/api/sessions/register", { sessionId: "session", binding: page, context: { route } });
    assert.equal(registration.status, 200);
    const bindingResponse = await request("POST", "/api/sessions/session/agent-bindings", { providerId: "codex", installationId: "test-agent", workspaceId: "workspace", conversationId: "thread", scope: "conversation", accessMode: "control" });
    assert.equal(bindingResponse.status, 200);
    const bindingId = bindingResponse.body.binding.bindingId;
    const action = { action: "report_inspect", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity };

    const unavailable = await request("POST", "/api/sessions/session/actions", action, agentHeaders);
    assert.equal(unavailable.status, 409);
    assert.equal(unavailable.body.reason, "REPORT_ADAPTER_NOT_AVAILABLE");
    const heartbeat = await request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: { adapterVersion: "report-inspect-v1", inspectAvailable: true, writeEnabled: true } } });
    assert.equal(heartbeat.body.session.context.reportAuthoring.writeEnabled, false);
    assert.equal(heartbeat.body.session.context.reportAuthoring.v2, undefined);
    const v2Heartbeat = await request("POST", "/api/sessions/session/heartbeat", { binding: page, context: { route, reportAuthoring: { adapterVersion: "report-authoring-v2", inspectAvailable: true, treeAvailable: true, editorFramework: "contenteditable", editorModelAvailable: false, toolbarAvailable: true, structureOpsAvailable: true, structureOperations: { addChild: true, addSibling: true, copy: true, delete: true, moveUp: false, moveDown: true }, settingsAvailable: false, writesSupported: true, livePageVerified: false, writeEnabled: true } } });
    assert.equal(v2Heartbeat.body.session.context.reportAuthoring.writeEnabled, false);
    assert.equal(v2Heartbeat.body.session.context.reportAuthoring.v2.treeAvailable, true);
    assert.equal(v2Heartbeat.body.session.context.reportAuthoring.v2.editorFramework, "contenteditable");
    assert.deepEqual(v2Heartbeat.body.session.context.reportAuthoring.v2.structureOperations, { addChild: true, addSibling: true, copy: true, delete: true, moveUp: false, moveDown: true });
    const mismatch = await request("POST", "/api/sessions/session/actions", { ...action, tabId: 43 }, agentHeaders);
    assert.equal(mismatch.body.reason, "REPORT_TARGET_MISMATCH");
    const otherProject = await request("POST", "/api/sessions/session/actions", { ...action, projectId: "business-project" }, agentHeaders);
    assert.equal(otherProject.body.reason, "AGENT_BINDING_MISMATCH");
    const wrongIdentity = await request("POST", "/api/sessions/session/actions", { ...action, reportIdentity: { ...reportIdentity, companyId: "other" } }, agentHeaders);
    assert.equal(wrongIdentity.body.reason, "REPORT_TARGET_MISMATCH");
    const gated = await request("POST", "/api/sessions/session/actions", { ...action, action: "report_execute" }, agentHeaders);
    assert.equal(gated.status, 403);
    assert.equal(gated.body.reason, "REPORT_WRITE_GATE_CLOSED");
    const gatedSave = await request("POST", "/api/sessions/session/actions", { ...action, action: "report_save", confirmText: "确认保存报告" }, agentHeaders);
    assert.equal(gatedSave.status, 403);
    assert.equal(gatedSave.body.reason, "REPORT_WRITE_GATE_CLOSED");

    const queued = await request("POST", "/api/sessions/session/actions", { ...action, replacementText: "must-not-pass-through" }, agentHeaders);
    assert.equal(queued.status, 200);
    const claimed = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
    assert.equal(claimed.body.action.type, "report_inspect");
    assert.deepEqual(claimed.body.action.payload.reportIdentity, reportIdentity);
    assert.equal(claimed.body.action.payload.tabId, 42);
    assert.equal(claimed.body.action.payload.replacementText, undefined);
    const complete = await request("POST", `/api/sessions/session/actions/${queued.body.action.actionId}/result`, { bindingId, result: { ok: true, security: { writesPerformed: false } } });
    assert.equal(complete.status, 200);
    const readback = await request("GET", `/api/sessions/session/actions/${queued.body.action.actionId}?projectId=workspace&threadId=thread`, undefined, agentHeaders);
    assert.equal(readback.body.action.status, "completed");
    assert.equal(readback.body.action.result.security.writesPerformed, false);

    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = agentConfigPath;
    process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = base;
    const clientPath = path.join(__dirname, "../plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs");
    const client = await import(pathToFileURL(clientPath).href);
    const status = await client.executeTool("tianyuan.connection_status", { projectId: "workspace", threadId: "thread", onlyOnline: true });
    assert.equal(status.ok, true);
    assert.equal(status.recommendedSession.capabilities.reportAuthoring.supported, true);
    assert.equal(status.recommendedSession.capabilities.reportAuthoring.writeEnabled, false);
    assert.equal(status.recommendedSession.capabilities.reportAuthoring.livePageVerified, false);
    const pending = client.executeTool("tianyuan.report_inspect", { sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity });
    let browserAction;
    for (let attempt = 0; attempt < 40 && !browserAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      browserAction = next.body.action;
      if (!browserAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(browserAction?.type, "report_inspect");
    assert.equal(browserAction?.target.inspectOffset, 0);
    assert.equal(browserAction?.target.inspectLimit, 50);
    await request("POST", `/api/sessions/session/actions/${browserAction.actionId}/result`, { bindingId, result: { ok: true, action: "report_inspect", tree: { complete: false }, security: { writesPerformed: false } } });
    const inspected = await pending;
    assert.equal(inspected.ok, true);
    assert.equal(inspected.action.result.tree.complete, false);
    assert.equal(inspected.action.result.security.writesPerformed, false);

    process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN = "1";
    const structureNodeRef = { nodePathKey: "0", candidateId: "fixture-node", label: "父节点" };
    const structurePreviewPromise = client.executeTool("tianyuan.report_preview", {
      sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity,
      ops: [{ kind: "structure_add_child", nodeRef: structureNodeRef, title: "Connector临时节点" }],
    });
    let structurePreviewAction;
    for (let attempt = 0; attempt < 40 && !structurePreviewAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      structurePreviewAction = next.body.action;
      if (!structurePreviewAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(structurePreviewAction?.type, "report_preview");
    const planHash = `plan-${"a".repeat(32)}`;
    const scopeRef = { kind: "node", scopePath: "0", nodePathKey: "0", candidateId: "fixture-node", label: "父节点" };
    const scopeTarget = { nodePathKey: "0", candidateId: "fixture-node", label: "父节点", expanded: true };
    const treeSnapshot = { complete: true, operationIndex: 0, operationKind: "structure_add_child", scopePath: "0", scopeRef, scopeTarget, target: scopeTarget, siblings: [] };
    await request("POST", `/api/sessions/session/actions/${structurePreviewAction.actionId}/result`, { bindingId, result: { ok: true, action: "report_preview", planHash, confirmationRequired: "确认执行报告结构修改", privateTreeSnapshots: [{ nodeRef: structureNodeRef, operationIndex: 0, operationKind: "structure_add_child", treeSnapshot, origin: { documentTimeOrigin: 100, pageOrigin: "https://excel.zhrdc.net" } }], security: { readOnly: true, writesPerformed: false } } });
    const structurePreview = await structurePreviewPromise;
    assert.equal(structurePreview.ok, true);
    const executePromise = client.executeTool("tianyuan.report_execute", { sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity, planHash, confirmText: "确认执行报告结构修改" });
    let executeAction;
    for (let attempt = 0; attempt < 40 && !executeAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      executeAction = next.body.action;
      if (!executeAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(executeAction?.type, "report_execute");
    await request("POST", `/api/sessions/session/actions/${executeAction.actionId}/result`, { bindingId, result: { ok: false, reason: "REPORT_STRUCTURE_CONTROL_NOT_FOUND", executed: 1, results: [{ index: 0, status: "failed", error: "REPORT_STRUCTURE_CONTROL_NOT_FOUND" }], security: { readOnly: true, writesPerformed: false, credentialsReturned: false } } });
    const execution = await executePromise;
    assert.equal(execution.ok, false);
    assert.equal(execution.action.result.reason, "REPORT_STRUCTURE_CONTROL_NOT_FOUND");
    assert.equal(require("../native-helper/report-pending.js").hasReportPending(path.join(directory, "report-pending"), reportIdentity), false);

    const secondPreviewPromise = client.executeTool("tianyuan.report_preview", {
      sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity,
      ops: [{ kind: "structure_add_child", nodeRef: structureNodeRef, title: "Connector持久化测试" }],
    });
    let secondPreviewAction;
    for (let attempt = 0; attempt < 40 && !secondPreviewAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      secondPreviewAction = next.body.action;
      if (!secondPreviewAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const secondPlanHash = `plan-${"b".repeat(32)}`;
    await request("POST", `/api/sessions/session/actions/${secondPreviewAction.actionId}/result`, { bindingId, result: { ok: true, action: "report_preview", planHash: secondPlanHash, confirmationRequired: "确认执行报告结构修改", privateTreeSnapshots: [{ nodeRef: structureNodeRef, operationIndex: 0, operationKind: "structure_add_child", treeSnapshot, origin: { documentTimeOrigin: 100, pageOrigin: "https://excel.zhrdc.net" } }], security: { readOnly: true, writesPerformed: false } } });
    assert.equal((await secondPreviewPromise).ok, true);
    const secondExecutePromise = client.executeTool("tianyuan.report_execute", { sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity, planHash: secondPlanHash, confirmText: "确认执行报告结构修改" });
    let secondExecuteAction;
    for (let attempt = 0; attempt < 40 && !secondExecuteAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      secondExecuteAction = next.body.action;
      if (!secondExecuteAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await request("POST", `/api/sessions/session/actions/${secondExecuteAction.actionId}/result`, { bindingId, result: { ok: false, status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED", executed: 1, planHash: secondPlanHash, results: [{ index: 0, kind: "structure_add_child", status: "pendingVerify" }], security: { readOnly: false, writesPerformed: true, credentialsReturned: false } } });
    const secondExecution = await secondExecutePromise;
    assert.equal(secondExecution.action.result.structurePending.status, "staged");
    assert.equal(require("../native-helper/report-pending.js").hasReportPending(path.join(directory, "report-pending"), reportIdentity), true);

    const reloadPromise = client.executeTool("tianyuan.report_reload", { sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity, nodeRef: structureNodeRef, confirmText: "确认刷新并核验已保存报告" });
    let reloadAction;
    for (let attempt = 0; attempt < 40 && !reloadAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      reloadAction = next.body.action;
      if (!reloadAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await request("POST", `/api/sessions/session/actions/${reloadAction.actionId}/result`, { bindingId, result: { ok: true, action: "report_reload", reloadRequested: true, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } } });
    assert.equal((await reloadPromise).action.result.reloadRequested, true);

    const structureReadPromise = client.executeTool("tianyuan.report_node_read", { sessionId: "session", bindingId, projectId: "workspace", threadId: "thread", tabId: 42, reportIdentity, nodeRef: structureNodeRef, include: ["structure"], verifySaved: true });
    let structureReadAction;
    for (let attempt = 0; attempt < 40 && !structureReadAction; attempt += 1) {
      const next = await request("GET", `/api/sessions/session/actions/next?bindingId=${encodeURIComponent(bindingId)}`);
      structureReadAction = next.body.action;
      if (!structureReadAction) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(structureReadAction.payload.structureScopeRead, true);
    assert.deepEqual(structureReadAction.payload.scopeRef, scopeRef);
    await request("POST", `/api/sessions/session/actions/${structureReadAction.actionId}/result`, { bindingId, result: { ok: true, action: "report_node_read", documentTimeOrigin: 200, structureReadback: { complete: true, operationIndex: 0, operationKind: "structure_scope_read", scopePath: "0", scopeRef, target: scopeTarget, siblings: [{ nodePathKey: "0/0", candidateId: "created", label: "Connector持久化测试", expanded: false, children: [] }] }, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } } });
    const structureRead = await structureReadPromise;
    assert.equal(structureRead.action.result.structureVerification.structureStatus, "saved");
    assert.equal(structureRead.action.result.structureVerification.actionComplete, true);
    assert.equal(require("../native-helper/report-pending.js").hasReportPending(path.join(directory, "report-pending"), reportIdentity), false);

    const otherBinding = await request("POST", "/api/sessions/session/agent-bindings", { providerId: "workbuddy", installationId: "test-other-agent", workspaceId: "other-workspace", conversationId: "other-thread", scope: "conversation", accessMode: "read" });
    const otherBindingId = otherBinding.body.binding.bindingId;
    const otherHeaders = { ...agentHeaders, "x-tianyuan-agent-provider": "workbuddy", "x-tianyuan-agent-installation": "test-other-agent" };
    const readOnly = await request("POST", "/api/sessions/session/actions", { ...action, bindingId: otherBindingId, projectId: "other-workspace", threadId: "other-thread" }, otherHeaders);
    assert.equal(readOnly.body.reason, "REPORT_CONTROL_BINDING_REQUIRED");
    const pendingTransfer = await request("POST", "/api/sessions/session/actions", action, agentHeaders);
    assert.equal(pendingTransfer.status, 200);
    const transfer = await request("POST", `/api/sessions/session/agent-bindings/${otherBindingId}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" });
    assert.equal(transfer.status, 200);
    const cancelled = await request("GET", `/api/sessions/session/actions/${pendingTransfer.body.action.actionId}?projectId=workspace&threadId=thread`, undefined, agentHeaders);
    assert.equal(cancelled.body.action.status, "cancelled");
    assert.equal(cancelled.body.action.cancellationReason, "AGENT_CONTROL_REVOKED");
  } finally {
    delete process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH;
    delete process.env.TIANYUAN_CONNECTOR_BRIDGE_URL;
    if (priorWriteGate === undefined) delete process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN;
    else process.env.TIANYUAN_REPORT_WRITE_GATE_OPEN = priorWriteGate;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
