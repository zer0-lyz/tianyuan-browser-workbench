"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createBridge } = require("../native-helper/connector_bridge.js");

function makeHeaders() {
  return {
    origin: "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
    "content-type": "application/json",
    "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
  };
}

function agentHeaders(providerId, installationId, credential) {
  return {
    "content-type": "application/json",
    "x-tianyuan-agent-provider": providerId,
    "x-tianyuan-agent-installation": installationId,
    "x-tianyuan-agent-credential": credential,
  };
}

test("Bridge enforces controlled edit-block routing and preview handoff", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-edit-block-"));
  const credentialsPath = path.join(root, "credentials.json");
  const bindingsPath = path.join(root, "bindings.json");
  const sourcesPath = path.join(root, "sources.json");
  const compatibilityPath = path.join(root, "compatibility.json");
  const port = 43500 + Math.floor(Math.random() * 300);
  fs.writeFileSync(credentialsPath, JSON.stringify({ secrets: { codex: "codex-edit-secret", workbuddy: "workbuddy-edit-secret" } }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [
    { agentId: "codex-edit", providerId: "codex", displayName: "Codex", installationId: "codex-edit-install", credentialRef: `file:${credentialsPath}#codex` },
    { agentId: "workbuddy-edit", providerId: "workbuddy", displayName: "WorkBuddy", installationId: "workbuddy-edit-install", credentialRef: `file:${credentialsPath}#workbuddy` },
  ] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({}));
  const bridge = createBridge({ bindingsPath, sourcesPath, compatibilityPath });
  const server = await bridge.start(port);
  async function request(method, pathname, payload, headers) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, payload: await response.json() };
  }
  const browser = makeHeaders();
  const codex = agentHeaders("codex", "codex-edit-install", "codex-edit-secret");
  const workbuddy = agentHeaders("workbuddy", "workbuddy-edit-install", "workbuddy-edit-secret");
  try {
    const registered = await request("POST", "/api/sessions/register", {
      sessionId: "edit-session",
      binding: { projectId: "page-project", companyId: "page-company", pageType: "tianyuan-page", tabId: 17 },
      context: {
        route: { isTianyuanOperationRoute: true, projectId: "page-project" },
        editingBlock: {
          available: true, valid: true, blockId: "dom:production-mode", tabId: 17,
          pageUrl: "https://excel.zhrdc.net/ty/operation/page", pageTitle: "镇洋股份出资评估",
          editable: true, originalText: "原文", currentText: "原文", contentHash: "fnv1a32-12345678", currentHash: "fnv1a32-12345678",
          capturedAt: "2026-08-27T00:00:00.000Z", element: { tag: "mark", contentEditable: true },
        },
      },
    }, browser);
    assert.equal(registered.status, 200);
    const codexBinding = await request("POST", "/api/sessions/edit-session/agent-bindings", {
      providerId: "codex", installationId: "codex-edit-install", workspaceId: "workspace-edit", workspaceName: "编辑测试项目",
      conversationId: "conversation-edit", conversationTitle: "编辑测试对话", scope: "conversation", accessMode: "control",
    }, browser);
    assert.equal(codexBinding.status, 200);
    const bindingId = codexBinding.payload.binding.bindingId;
    const scoped = await request("GET", "/api/sessions", undefined, codex);
    const scopedBlock = scoped.payload.sessions[0].context.editingBlock;
    assert.equal(scopedBlock.blockId, "dom:production-mode");
    assert.equal(scopedBlock.sessionId, "edit-session");
    assert.equal(scopedBlock.bindingId, bindingId);
    assert.equal(scopedBlock.tabId, 17);

    const base = {
      sessionId: "edit-session", bindingId, projectId: "page-project", threadId: "conversation-edit", tabId: 17,
      blockId: "dom:production-mode", expectedText: "原文", replacementText: "新文",
    };
    const preview = await request("POST", "/api/sessions/edit-session/actions", { ...base, action: "edit_block_preview" }, codex);
    assert.equal(preview.status, 200);
    assert.equal(preview.payload.action.type, "edit_block_preview");
    assert.equal(preview.payload.action.status, "queued");
    const previewId = preview.payload.action.actionId;
    const claimed = await request("GET", `/api/sessions/edit-session/actions/next?bindingId=${bindingId}`, undefined, browser);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.payload.action.payload.sessionId, "edit-session");
    assert.equal(claimed.payload.action.payload.bindingId, bindingId);
    assert.equal(claimed.payload.action.payload.projectId, "page-project");
    assert.equal(claimed.payload.action.payload.threadId, "conversation-edit");
    assert.equal(claimed.payload.action.payload.tabId, 17);
    const previewResult = await request("POST", `/api/sessions/edit-session/actions/${previewId}/result`, {
      bindingId, controlEpoch: claimed.payload.action.controlEpoch, result: { ok: true, conflictRisk: false, writesPerformed: false },
    }, browser);
    assert.equal(previewResult.status, 200);
    assert.equal(previewResult.payload.action.status, "completed");

    const missingPreview = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, action: "edit_block_execute", previewActionId: "missing", confirmText: "确认修改编辑块",
    }, codex);
    assert.equal(missingPreview.status, 409);
    assert.equal(missingPreview.payload.reason, "EDIT_BLOCK_PREVIEW_REQUIRED");
    const execute = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, action: "edit_block_execute", previewActionId: previewId, confirmText: "确认修改编辑块",
    }, codex);
    assert.equal(execute.status, 200);
    assert.equal(execute.payload.action.type, "edit_block_execute");
    const changedPreview = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, action: "edit_block_execute", previewActionId: previewId, replacementText: "另一份新文", confirmText: "确认修改编辑块",
    }, codex);
    assert.equal(changedPreview.status, 409);
    assert.equal(changedPreview.payload.reason, "EDIT_BLOCK_PREVIEW_MISMATCH");

    const wrongTab = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, tabId: 18, action: "edit_block_preview",
    }, codex);
    assert.equal(wrongTab.status, 403);
    assert.equal(wrongTab.payload.reason, "EDIT_BLOCK_BINDING_REQUIRED");

    const readBinding = await request("POST", "/api/sessions/edit-session/agent-bindings", {
      providerId: "workbuddy", installationId: "workbuddy-edit-install", workspaceId: "workspace-workbuddy", workspaceName: "WorkBuddy 编辑项目",
      conversationId: "conversation-workbuddy", conversationTitle: "WorkBuddy 编辑对话", scope: "conversation", accessMode: "read", manualBinding: true,
    }, browser);
    assert.equal(readBinding.status, 200);
    const readonly = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, bindingId: readBinding.payload.binding.bindingId, projectId: "workspace-workbuddy", threadId: "conversation-workbuddy", action: "edit_block_execute", previewActionId: previewId, confirmText: "确认修改编辑块",
    }, workbuddy);
    assert.equal(readonly.status, 403);
    assert.equal(readonly.payload.reason, "AGENT_READ_ONLY");
    const readback = await request("POST", "/api/sessions/edit-session/actions", {
      ...base, bindingId: readBinding.payload.binding.bindingId, projectId: "workspace-workbuddy", threadId: "conversation-workbuddy", action: "edit_block_readback",
    }, workbuddy);
    assert.equal(readback.status, 200);
    assert.equal(readback.payload.action.type, "edit_block_readback");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
