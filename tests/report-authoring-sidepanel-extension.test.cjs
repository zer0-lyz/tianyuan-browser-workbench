"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { createBridge } = require("../native-helper/connector_bridge.js");

const deps = process.env.TIANYUAN_PROSEMIRROR_TEST_DEPS;
const browserPath = process.env.TIANYUAN_EXTENSION_TEST_BROWSER;
const extensionTest = deps && browserPath ? test : test.skip;

extensionTest("isolated extension sidepanel routes MCP preview and execution through real content scripts", { timeout: 45000 }, async () => {
  const { chromium } = createRequire(path.join(deps, "package.json"))("playwright-core");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-sidepanel-integration-"));
  const extension = path.join(root, "extension");
  const originalConfig = process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH;
  const originalBridge = process.env.TIANYUAN_CONNECTOR_BRIDGE_URL;
  let bridge;
  let context;
  const server = http.createServer((request, response) => bridge ? bridge.handle(request, response) : response.writeHead(503).end());
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    fs.cpSync(path.join(__dirname, "../extension"), extension, { recursive: true });
    const manifestPath = path.join(extension, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const extensionVersion = manifest.version;
    manifest.permissions = manifest.permissions.filter((permission) => permission !== "nativeMessaging");
    manifest.host_permissions = ["https://excel.zhrdc.net/ty/*", "http://127.0.0.1/*"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const sidepanelPath = path.join(extension, "src/sidepanel/sidepanel.js");
    const sidepanelSource = fs.readFileSync(sidepanelPath, "utf8");
    assert.ok(sidepanelSource.includes('const CONNECTOR_BASE_URL = "http://127.0.0.1:40415";'));
    fs.writeFileSync(sidepanelPath, sidepanelSource.replace('const CONNECTOR_BASE_URL = "http://127.0.0.1:40415";', `const CONNECTOR_BASE_URL = "${base}";`).replace('const HELPER_BASE_URL = "http://127.0.0.1:8765";', 'const HELPER_BASE_URL = "http://127.0.0.1:0";'));
    fs.writeFileSync(path.join(extension, "runtime-compat.json"), JSON.stringify({ extensionVersion, runtimeBuildId: "isolated-build", bridgeProtocol: "connector-agent-binding-v3" }));
    context = await chromium.launchPersistentContext(path.join(root, "profile"), { executablePath: browserPath, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    await context.addInitScript(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
    const extensionId = new URL(worker.url()).hostname;
    assert.equal(extensionId, "lkflndcnklpeaejohaacoaolnmhgigoc");
    const page = await context.newPage();
    const url = "https://excel.zhrdc.net/ty/operation/project-1/company-1/new-report/2/add?detailId=test-report";
    const html = '<div class="el-tree"><div class="el-tree-node is-current" data-key="test-node" aria-selected="true"><div class="el-tree-node__content"><span class="el-tree-node__label">测试节点</span></div><div id="editor"></div></div></div><div role="toolbar"><button aria-label="加粗">加粗</button><button aria-label="字号增大">字号增大</button><button aria-label="字体颜色" aria-haspopup="listbox" aria-controls="palette" aria-expanded="false">字体颜色</button></div><div id="palette" role="listbox" style="display:none"><button id="black-option" role="option" data-color="#000000">黑色</button></div>';
    await context.route("**/*", (route) => {
      const target = route.request().url();
      if (target === url) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      if (target.startsWith("chrome-extension://") || target.startsWith(`${base}/`)) return route.continue();
      return route.abort();
    });
    await page.goto(url);
    const bundle = await createRequire(path.join(deps, "package.json"))("esbuild").build({ stdin: { resolveDir: deps, contents: `
      const { Schema } = require('prosemirror-model');
      const { EditorState, TextSelection } = require('prosemirror-state');
      const { EditorView } = require('prosemirror-view');
      const schema = new Schema({ nodes: { doc: { content: 'block+' }, paragraph: { content: 'inline*', group: 'block', toDOM() { return ['p', 0]; } }, text: { group: 'inline' } }, marks: { strong: { toDOM() { return ['strong', 0]; } }, fontSize: { attrs: { px: {} }, toDOM(mark) { return ['span', { style: 'font-size:' + mark.attrs.px + 'px' }, 0]; } }, textColor: { attrs: { hex: {} }, toDOM(mark) { return ['span', { style: 'color:' + mark.attrs.hex }, 0]; } } } });
      const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('甲乙丙丁')])]);
      let view;
      view = new EditorView(document.getElementById('editor'), { state: EditorState.create({schema, doc}), dispatchTransaction(transaction) { view.updateState(view.state.apply(transaction)); } });
      view.dom.__vue__ = { editor: { view } };
      window.fixtureView = view;
      window.fixtureSelect = () => { view.focus(); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 4))); };
      document.querySelector('[aria-label="加粗"]').addEventListener('click', () => { const selection = view.state.selection; view.dispatch(view.state.tr.addMark(selection.from, selection.to, schema.mark('strong'))); });
      document.querySelector('[aria-label="字号增大"]').addEventListener('click', () => { const selection = view.state.selection; view.dispatch(view.state.tr.addMark(selection.from, selection.to, schema.mark('fontSize', { px: 14 }))); });
      document.querySelector('[aria-label="字体颜色"]').addEventListener('click', (event) => { document.getElementById('palette').style.display = 'block'; event.currentTarget.setAttribute('aria-expanded', 'true'); });
      document.getElementById('black-option').addEventListener('click', () => { const selection = view.state.selection; view.dispatch(view.state.tr.addMark(selection.from, selection.to, schema.mark('textColor', { hex: '#000000' }))); });
    ` }, bundle: true, platform: "browser", write: false });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const tabId = await worker.evaluate(async (target) => (await chrome.tabs.query({})).find((tab) => tab.url === target)?.id, url);
    assert.ok(Number.isInteger(tabId));
    const credentialPath = path.join(root, "credential.json");
    const sourcePath = path.join(root, "sources.json");
    const bindingPath = path.join(root, "bindings.json");
    const configPath = path.join(root, "agent.json");
    const compatibilityPath = path.join(root, "compat.json");
    const credentialRef = `file:${credentialPath}#test`;
    fs.writeFileSync(credentialPath, JSON.stringify({ secrets: { test: "synthetic-test-only" } }));
    fs.writeFileSync(configPath, JSON.stringify({ providerId: "codex", installationId: "isolated-agent", credentialRef }));
    fs.writeFileSync(sourcePath, JSON.stringify({ sources: [{ agentId: "codex", providerId: "codex", displayName: "Codex", installationId: "isolated-agent", credentialRef }] }));
    fs.writeFileSync(bindingPath, JSON.stringify({ bindings: [] }));
    fs.writeFileSync(compatibilityPath, JSON.stringify({ extensionVersion, runtimeBuildId: "isolated-build" }));
    const scope = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add", reportDetailId: "test-report", workspaceId: "workspace", threadId: "thread", agentId: "codex", tabId };
    bridge = createBridge({ sourcesPath: sourcePath, bindingsPath: bindingPath, compatibilityPath, configDir: path.join(root, "config"), reportWriteGateOpen: true, reportWriteScope: scope });
    const browserHeaders = { "content-type": "application/json", origin: `chrome-extension://${extensionId}`, "x-tianyuan-extension-id": extensionId, "x-tianyuan-extension-version": extensionVersion, "x-tianyuan-runtime-build-id": "isolated-build" };
    async function request(endpoint, body) {
      const response = await fetch(`${base}${endpoint}`, { method: "POST", headers: browserHeaders, body: JSON.stringify(body) });
      const value = await response.json();
      assert.equal(response.ok, true, JSON.stringify(value));
      return value;
    }
    const reportIdentity = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add", reportDetailId: "test-report" };
    const binding = { projectId: reportIdentity.projectId, companyId: reportIdentity.companyId, pageType: "new-report", tabId };
    const route = { isNewReportRoute: true, projectId: reportIdentity.projectId, companyId: reportIdentity.companyId, reportType: reportIdentity.reportType, reportMode: reportIdentity.mode };
    await request("/api/sessions/register", { sessionId: "isolated-session", binding, context: { route } });
    await request("/api/sessions/isolated-session/heartbeat", { binding, context: { route, reportAuthoring: { adapterVersion: "report-authoring-v2", inspectAvailable: true } } });
    const bound = await request("/api/sessions/isolated-session/agent-bindings", { providerId: "codex", installationId: "isolated-agent", workspaceId: "workspace", conversationId: "thread", scope: "conversation", accessMode: "control" });
    await worker.evaluate(() => chrome.storage.local.set({
      tianyuanWorkbenchConnectorSessionId: "isolated-session",
      tianyuanWorkbenchActiveRuntimeBuildId: "isolated-build",
      tianyuanWorkbenchRuntimeReloadAttemptBuildId: "isolated-build",
    }));
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await page.bringToFront();
    await panel.waitForFunction(() => document.querySelector("#connectorSessionId")?.textContent === "isolated-session", null, { timeout: 12000 });
    process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = configPath;
    process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = base;
    const client = await import(`${pathToFileURL(path.join(__dirname, "../plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs")).href}?actual-sidepanel=${Date.now()}`);
    const pending = client.executeTool("tianyuan.report_inspect", { sessionId: "isolated-session", bindingId: bound.binding.bindingId, projectId: "workspace", threadId: "thread", tabId, reportIdentity });
    let deadline;
    const result = await Promise.race([pending, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("SIDEPANEL_ACTION_TIMEOUT")), 12000); })]).finally(() => clearTimeout(deadline));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.action.result.tree.nodes[0].label, "测试节点");
    assert.equal(result.action.result.security.writesPerformed, false);
    await page.evaluate(() => window.fixtureSelect());
    const input = { sessionId: "isolated-session", bindingId: bound.binding.bindingId, projectId: "workspace", threadId: "thread", tabId, reportIdentity };
    const preview = await client.executeTool("tianyuan.report_preview", { ...input, ops: [{ kind: "editor_command", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "test-node" }, command: "bold" }] });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    const execution = await client.executeTool("tianyuan.report_execute", { ...input, planHash: preview.action.result.planHash, confirmText: "确认执行报告修改" });
    assert.equal(execution.ok, false);
    assert.equal(execution.action.result.status, "pendingVerify", JSON.stringify(execution));
    assert.equal(execution.action.result.results[0].readback.modelChanged, true);
    assert.equal(await page.evaluate(() => window.fixtureView.dom.querySelector("strong")?.textContent), "乙丙");
    await page.evaluate(() => window.fixtureSelect());
    const sizePreview = await client.executeTool("tianyuan.report_preview", { ...input, ops: [{ kind: "editor_command", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "test-node" }, command: "font_increase" }] });
    assert.equal(sizePreview.ok, true, JSON.stringify(sizePreview));
    assert.equal(sizePreview.action.result.ops[0].scope, "selection");
    await assert.rejects(client.executeTool("tianyuan.report_execute", { ...input, planHash: sizePreview.action.result.planHash, confirmText: "确认执行报告修改" }), { code: "REPORT_PENDING_VERIFY" });
    await page.evaluate(() => window.fixtureSelect());
    const colorPreview = await client.executeTool("tianyuan.report_preview", { ...input, ops: [{ kind: "editor_command", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "test-node" }, command: "font_color", color: "#000000" }] });
    assert.equal(colorPreview.ok, true, JSON.stringify(colorPreview));
    assert.match(colorPreview.action.result.ops[0].after, /#000000/);
    await assert.rejects(client.executeTool("tianyuan.report_execute", { ...input, planHash: colorPreview.action.result.planHash, confirmText: "确认执行报告修改" }), { code: "REPORT_PENDING_VERIFY" });
    const pendingDirectory = path.join(root, "report-pending");
    const pendingFile = path.join(pendingDirectory, fs.readdirSync(pendingDirectory).find((file) => file.endsWith(".json")));
    const pendingRecord = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
    pendingRecord.stage = { nodeRef, owner: { bindingId: bound.binding.bindingId, tabId }, modelHash: `sha256:${"a".repeat(64)}` };
    pendingRecord.saveActionId = "action_save_fixture";
    pendingRecord.saveDocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    fs.writeFileSync(pendingFile, JSON.stringify(pendingRecord));
    const oldOrigin = pendingRecord.saveDocumentTimeOrigin;
    const reload = await client.executeTool("tianyuan.report_reload", { ...input, nodeRef, confirmText: "确认刷新并核验已保存报告" });
    assert.equal(reload.ok, true, JSON.stringify(reload));
    assert.equal(reload.action.result.reloadRequested, true);
    await page.waitForFunction((origin) => performance.timeOrigin > origin, oldOrigin);
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
    if (originalConfig === undefined) delete process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH; else process.env.TIANYUAN_CONNECTOR_AGENT_CONFIG_PATH = originalConfig;
    if (originalBridge === undefined) delete process.env.TIANYUAN_CONNECTOR_BRIDGE_URL; else process.env.TIANYUAN_CONNECTOR_BRIDGE_URL = originalBridge;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
