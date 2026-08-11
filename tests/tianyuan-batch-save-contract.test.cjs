const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const { createBridge } = require(path.join(repoRoot, "native-helper", "connector_bridge.js"));

function request(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }),
        ...headers,
      },
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, payload: text ? JSON.parse(text) : {} }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("batch save tools and browser action contract are aligned", async () => {
  const clientSource = fs.readFileSync(path.join(repoRoot, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs"), "utf8");
  const sidepanelSource = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
  const adapterSource = fs.readFileSync(path.join(repoRoot, "extension/src/injected/page_adapter.js"), "utf8");
  const nativeHostSource = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(repoRoot, "native-helper/connector_bridge.js"), "utf8");

  for (const name of [
    "tianyuan.preview_batch_save",
    "tianyuan.execute_batch_save",
    "tianyuan.preview_batch_exit_edit",
    "tianyuan.execute_batch_exit_edit",
  ]) assert.match(clientSource, new RegExp(`name: "${name.replaceAll(".", "\\.")}"`));
  assert.match(clientSource, /"tianyuan\.execute_batch_save": "batch_save_asset_draft"/);
  assert.match(clientSource, /"tianyuan\.execute_batch_exit_edit": "batch_exit_edit"/);
  assert.match(sidepanelSource, /runConnectorBatchSubjectAction/);
  assert.match(sidepanelSource, /readBatchDraftContext/);
  assert.match(sidepanelSource, /attemptedSubjectCount/);
  assert.match(sidepanelSource, /preview_batch_save/);
  assert.match(sidepanelSource, /batch_exit_edit/);
  assert.match(sidepanelSource, /PAGE_SUBJECT_TREE_EMPTY/);
  assert.match(sidepanelSource, /为避免误处理隐藏或无内容科目/);
  assert.match(sidepanelSource, /页面显示科目镜像为空/);
  assert.match(sidepanelSource, /subjectListSource = "page-tree"/);
  assert.match(sidepanelSource, /不能使用旧的或 MCP 全量科目/);
  assert.match(sidepanelSource, /Do not resurrect a pre-fix or MCP-only full list/);
  assert.match(sidepanelSource, /subjectListSource !== "page-tree"/);
  assert.match(sidepanelSource, /availableSubjects = \[\];/);
  assert.doesNotMatch(sidepanelSource, /: enrichSubjectHierarchyNames\(displayedMcpSubjects, allMcpSubjects\)/);
  assert.match(sidepanelSource, /nameCandidates/);
  assert.match(adapterSource, /DRAFT_SAVE_SUCCESS_EVIDENCE_NOT_FOUND/);
  assert.match(adapterSource, /EXIT_EDIT_SUCCESS_EVIDENCE_NOT_FOUND/);
  assert.match(adapterSource, /产成品/);
  assert.match(adapterSource, /expandSubjectTreeForCollection\(\)/);
  assert.match(nativeHostSource, /SUBJECT_CODES_REQUIRED/);
  assert.match(bridgeSource, /SUBJECT_CODES_REQUIRED/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-batch-save-contract-"));
  const port = 43000 + Math.floor(Math.random() * 500);
  const credentialsPath = path.join(root, "credentials.json");
  const sourcesPath = path.join(root, "agent-sources.json");
  const bindingsPath = path.join(root, "bindings.json");
  const configDir = path.join(root, "agent-configs");
  const compatibilityPath = path.join(root, "runtime-compat.json");
  fs.writeFileSync(credentialsPath, JSON.stringify({ secrets: { codex: "batch-save-test-credential" } }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [{
    agentId: "codex-batch-test",
    providerId: "codex-batch-test",
    displayName: "Batch Save Test Agent",
    installationId: "batch-save-installation",
    credentialRef: `file:${credentialsPath}#codex`,
  }] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({ extensionVersion: "", runtimeBuildId: "" }));

  const bridge = createBridge({ bindingsPath, sourcesPath, configDir, compatibilityPath });
  const server = await bridge.start(port);
  const browserHeaders = {
    "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
  };
  const agentHeaders = {
    "x-tianyuan-agent-provider": "codex-batch-test",
    "x-tianyuan-agent-installation": "batch-save-installation",
    "x-tianyuan-agent-credential": "batch-save-test-credential",
  };

  try {
    const session = await request(port, "POST", "/api/sessions/register", {
      sessionId: "batch-save-session",
      binding: { projectId: "172663087562752", companyId: "172667588050945", pageType: "asset-draft", tabId: 7 },
    }, browserHeaders);
    assert.equal(session.status, 200);
    const binding = await request(port, "POST", "/api/sessions/batch-save-session/agent-bindings", {
      providerId: "codex-batch-test",
      installationId: "batch-save-installation",
      workspaceId: "172663087562752",
      conversationId: "batch-save-thread",
      scope: "conversation",
      accessMode: "control",
    }, browserHeaders);
    assert.equal(binding.status, 200);
    const bindingId = binding.payload.binding.bindingId;
    const preview = await request(port, "POST", "/api/sessions/batch-save-session/actions", {
      action: "preview_batch_save",
      bindingId,
      projectId: "172663087562752",
      threadId: "batch-save-thread",
      subjectCodes: ["C3-1-2", "treepath:流动资产/货币资金"],
      companyScope: "current",
    }, agentHeaders);
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.payload.action.target.subjectCodes, ["C3-1-2", "treepath:流动资产/货币资金"]);
    assert.equal(preview.payload.action.target.mode, "dry_run");

    const invalidExecute = await request(port, "POST", "/api/sessions/batch-save-session/actions", {
      action: "batch_save_asset_draft",
      bindingId,
      projectId: "172663087562752",
      threadId: "batch-save-thread",
      subjectCodes: ["C3-1-2"],
      confirmText: "确认保存",
    }, agentHeaders);
    assert.equal(invalidExecute.status, 400);
    assert.equal(invalidExecute.payload.reason, "BATCH_SAVE_CONFIRM_TEXT_REQUIRED");

    const execute = await request(port, "POST", "/api/sessions/batch-save-session/actions", {
      action: "batch_save_asset_draft",
      bindingId,
      projectId: "172663087562752",
      threadId: "batch-save-thread",
      subjectCodes: ["C3-1-2"],
      confirmText: "确认批量保存",
    }, agentHeaders);
    assert.equal(execute.status, 200);
    assert.equal(execute.payload.action.target.mode, "execute");
    assert.equal(execute.payload.action.confirmText, undefined);

  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
