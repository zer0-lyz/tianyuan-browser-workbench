"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBridge } = require("../native-helper/connector_bridge.js");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const extensionOrigin = "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-agent-binding-"));
const port = 42000 + Math.floor(Math.random() * 1000);
const credentialsPath = path.join(root, "credentials.json");
const bindingsPath = path.join(root, "connector-bindings.json");
const sourcesPath = path.join(root, "agent-sources.json");
const configDir = path.join(root, "agent-configs");
const compatibilityPath = path.join(root, "runtime-compat.json");
const codexCredential = "codex-test-credential";
const workbuddyCredential = "workbuddy-test-credential";

fs.writeFileSync(credentialsPath, JSON.stringify({ secrets: { codex: codexCredential, workbuddy: workbuddyCredential } }));
fs.writeFileSync(sourcesPath, JSON.stringify({
  version: 1,
  sources: [
    { agentId: "codex", providerId: "codex", displayName: "Codex", installationId: "codex-test", credentialRef: `file:${credentialsPath}#codex`, manual: false },
    { agentId: "workbuddy-local", providerId: "workbuddy", displayName: "WorkBuddy", installationId: "workbuddy-test", credentialRef: `file:${credentialsPath}#workbuddy`, manual: true },
  ],
}));
fs.writeFileSync(bindingsPath, JSON.stringify({
  version: 1,
  bindings: [{
    bindingId: "legacy-codex-binding",
    projectId: "workspace-codex",
    projectName: "Codex Workspace",
    projectPath: "/tmp/codex-workspace",
    threadId: "conversation-codex",
    threadTitle: "Codex Conversation",
    scope: "thread",
    pageKey: "project-a|company-a|asset-draft|",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  }],
}));
fs.writeFileSync(compatibilityPath, JSON.stringify({
  version: 1,
  extensionVersion: "0.7.1",
  bridgeProtocol: "connector-agent-binding-v3",
  buildId: "test-build",
}));

function headers(agent) {
  if (!agent) {
    return {
      Origin: extensionOrigin,
      "content-type": "application/json",
      "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
      "x-tianyuan-extension-version": "0.7.1",
    };
  }
  return {
    "content-type": "application/json",
    "x-tianyuan-agent-provider": agent.providerId,
    "x-tianyuan-agent-installation": agent.installationId,
    "x-tianyuan-agent-credential": agent.credential,
  };
}

async function request(method, pathname, value, agent) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: headers(agent),
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const bridge = createBridge({ bindingsPath, sourcesPath, configDir, compatibilityPath });
  const server = await bridge.start(port);
  const codex = { providerId: "codex", installationId: "codex-test", credential: codexCredential };
  const workbuddy = { providerId: "workbuddy", installationId: "workbuddy-test", credential: workbuddyCredential };
  try {
    const headerOnly = await fetch(`http://127.0.0.1:${port}/api/catalog`, {
      headers: {
        "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
        "x-tianyuan-extension-version": "0.7.1",
      },
    });
    assert.equal(headerOnly.status, 200);
    const staleExtension = await fetch(`http://127.0.0.1:${port}/api/catalog`, {
      headers: {
        "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
        "x-tianyuan-extension-version": "0.7.0",
      },
    });
    const stalePayload = await staleExtension.json();
    assert.equal(staleExtension.status, 426);
    assert.equal(stalePayload.reason, "EXTENSION_RUNTIME_VERSION_MISMATCH");

    const page = { projectId: "project-a", companyId: "company-a", pageType: "asset-draft", tabId: 1 };
    const registered = await request("POST", "/api/sessions/register", { sessionId: "session-a", binding: page, context: { route: { isAssetDraftRoute: true, projectId: "project-a", companyId: "company-a" } } });
    assert.equal(registered.status, 200);
    assert.equal(registered.payload.session.agentBindings[0].providerId, "codex");
    assert.equal(registered.payload.session.agentBindings[0].scope, "conversation");
    assert.equal(registered.payload.session.codexBinding.bindingId, "legacy-codex-binding");

    const codexStatus = await request("GET", "/api/sessions", undefined, codex);
    assert.equal(codexStatus.status, 200);
    assert.equal(codexStatus.payload.sessions.length, 1);

    const readBinding = await request("POST", "/api/sessions/session-a/agent-bindings", {
      providerId: "workbuddy", installationId: "workbuddy-test", workspaceId: "workspace-workbuddy", workspaceName: "WorkBuddy Workspace", conversationId: "conversation-workbuddy", conversationTitle: "Manual Conversation", scope: "conversation", accessMode: "read", manualBinding: true,
    });
    assert.equal(readBinding.status, 200);
    const workbuddyBinding = readBinding.payload.binding;
    assert.equal(workbuddyBinding.accessMode, "read");
    assert.equal(workbuddyBinding.manualBinding, true);

    const readSessions = await request("GET", "/api/sessions", undefined, workbuddy);
    assert.equal(readSessions.status, 200);
    assert.equal(readSessions.payload.sessions.length, 1);
    assert.equal(readSessions.payload.sessions[0].agentBindings.length, 1);
    assert.equal(readSessions.payload.sessions[0].agentBindings[0].providerId, "workbuddy");

    const unregistered = await request("GET", "/api/sessions", undefined, { providerId: "other", installationId: "unknown", credential: "x" });
    assert.equal(unregistered.status, 403);
    assert.equal(unregistered.payload.reason, "AGENT_NOT_REGISTERED");

    const readonlyWrite = await request("POST", "/api/sessions/session-a/actions", {
      action: "set_audit_check_result", bindingId: workbuddyBinding.bindingId, workspaceId: "workspace-workbuddy", conversationId: "conversation-workbuddy", subjectCode: "C1", rowNumber: 2, resultText: "不一致", confirmText: "确认填写核对情况并保存",
    }, workbuddy);
    assert.equal(readonlyWrite.status, 403);
    assert.equal(readonlyWrite.payload.reason, "AGENT_READ_ONLY");

    const bindingMismatch = await request("POST", "/api/sessions/session-a/actions", {
      action: "inspect_audit_check_row", bindingId: "legacy-codex-binding", workspaceId: "workspace-workbuddy", conversationId: "conversation-workbuddy", subjectCode: "C1", rowNumber: 2,
    }, workbuddy);
    assert.equal(bindingMismatch.status, 403);
    assert.equal(bindingMismatch.payload.reason, "AGENT_BINDING_MISMATCH");

    const queued = await request("POST", "/api/sessions/session-a/actions", {
      action: "set_audit_check_result", bindingId: "legacy-codex-binding", projectId: "workspace-codex", threadId: "conversation-codex", subjectCode: "C1", rowNumber: 2, resultText: "不一致", confirmText: "确认填写核对情况并保存",
    }, codex);
    assert.equal(queued.status, 200);
    assert.equal(queued.payload.action.status, "queued");

    const missingConfirm = await request("POST", `/api/sessions/session-a/agent-bindings/${workbuddyBinding.bindingId}/access`, { accessMode: "control" });
    assert.equal(missingConfirm.status, 409);
    assert.equal(missingConfirm.payload.reason, "CONTROL_TRANSFER_CONFIRMATION_REQUIRED");

    const transferred = await request("POST", `/api/sessions/session-a/agent-bindings/${workbuddyBinding.bindingId}/access`, { accessMode: "control", confirmControlTransfer: "确认切换控制权" });
    assert.equal(transferred.status, 200);
    assert.equal(transferred.payload.binding.accessMode, "control");

    const revokedQueue = await request("POST", `/api/sessions/session-a/actions/${queued.payload.action.actionId}/result`, {
      bindingId: "legacy-codex-binding",
      result: { ok: false },
    });
    assert.equal(revokedQueue.status, 409);
    assert.equal(revokedQueue.payload.reason, "AGENT_CONTROL_CONFLICT");

    const cancelled = await request("GET", `/api/sessions/session-a/actions/${queued.payload.action.actionId}?workspaceId=workspace-codex&conversationId=conversation-codex`, undefined, codex);
    assert.equal(cancelled.status, 403);
    assert.equal(cancelled.payload.reason, "AGENT_READ_ONLY");

    const postTransferWrite = await request("POST", "/api/sessions/session-a/actions", {
      action: "set_audit_check_result", bindingId: "legacy-codex-binding", projectId: "workspace-codex", threadId: "conversation-codex", subjectCode: "C1", rowNumber: 2, resultText: "不一致", confirmText: "确认填写核对情况并保存",
    }, codex);
    assert.equal(postTransferWrite.status, 403);
    assert.equal(postTransferWrite.payload.reason, "AGENT_READ_ONLY");

    const second = await request("POST", "/api/sessions/register", { sessionId: "session-codex-only", binding: { projectId: "project-b", companyId: "company-b", pageType: "asset-draft", tabId: 2 } });
    assert.equal(second.status, 200);
    const secondBinding = await request("POST", "/api/sessions/session-codex-only/agent-bindings", {
      providerId: "codex", installationId: "codex-test", workspaceId: "workspace-codex", conversationId: "conversation-codex", scope: "conversation", accessMode: "control",
    });
    assert.equal(secondBinding.status, 200);
    const isolated = await request("GET", "/api/sessions", undefined, workbuddy);
    assert.equal(isolated.payload.sessions.length, 1);

    const agentConfigPath = path.join(root, "codex-agent-config.json");
    fs.writeFileSync(agentConfigPath, JSON.stringify({ providerId: "codex", installationId: "codex-test", credentialRef: `file:${credentialsPath}#codex` }));
    const { stdout: clientOutput } = await execFileAsync(process.execPath, ["plugins/tianyuan-browser-connector/runtime/scripts/agent-tool-call.mjs", "tianyuan.connection_status", JSON.stringify({ sessionId: "session-codex-only", projectId: "workspace-codex", threadId: "conversation-codex" })], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, TIANYUAN_CONNECTOR_BRIDGE_URL: `http://127.0.0.1:${port}`, TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH: agentConfigPath },
      encoding: "utf8",
    });
    const clientResult = JSON.parse(clientOutput);
    assert.equal(clientResult.ok, true);
    assert.equal(clientResult.counts.matched, 1);

    console.log(JSON.stringify({ ok: true, checks: ["installed_extension_header_contract", "extension_version_mismatch", "legacy_codex_migration", "manual_workbuddy_read_binding", "agent_context_isolation", "read_cannot_write", "control_conflict_confirmation", "control_transfer_cancels_queue", "agent_error_codes", "codex_client_identity"], tempRoot: root }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((cause) => { console.error(cause.stack || cause); process.exitCode = 1; });
