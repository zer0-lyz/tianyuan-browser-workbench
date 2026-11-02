"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");

const deps = process.env.TIANYUAN_PROSEMIRROR_TEST_DEPS;
const browserPath = process.env.TIANYUAN_EXTENSION_TEST_BROWSER;
const extensionTest = deps && browserPath ? test : test.skip;

extensionTest("isolated Chrome extension forwards report preview and execution through real content scripts", async () => {
  const load = createRequire(path.join(deps, "package.json"));
  const { chromium } = load("playwright-core");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-extension-integration-"));
  const extension = path.join(root, "extension");
  fs.cpSync(path.join(__dirname, "../extension"), extension, { recursive: true });
  const manifestPath = path.join(extension, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.permissions = manifest.permissions.filter((permission) => permission !== "nativeMessaging");
  manifest.host_permissions = ["https://excel.zhrdc.net/ty/*"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const bundle = await load("esbuild").build({ stdin: { resolveDir: deps, contents: `
    const { Schema } = require('prosemirror-model');
    const { EditorState, TextSelection } = require('prosemirror-state');
    const { EditorView } = require('prosemirror-view');
    const schema = new Schema({ nodes: { doc: { content: 'block+' }, paragraph: { content: 'inline*', group: 'block', toDOM() { return ['p', 0]; } }, text: { group: 'inline' } }, marks: { strong: { toDOM() { return ['strong', 0]; } } } });
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('甲乙丙丁')])]);
    let view;
    view = new EditorView(document.getElementById('editor'), { state: EditorState.create({schema, doc}), dispatchTransaction(transaction) { view.updateState(view.state.apply(transaction)); } });
    view.dom.__vue__ = { editor: { view } };
    window.fixtureView = view;
    window.fixtureSelect = () => { view.focus(); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 4))); };
    document.querySelector('[aria-label="加粗"]').addEventListener('click', () => { const selection = view.state.selection; view.dispatch(view.state.tr.addMark(selection.from, selection.to, schema.mark('strong'))); });
  ` }, bundle: true, platform: "browser", write: false });
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(root, "profile"), { executablePath: browserPath, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await context.newPage();
    const url = "https://excel.zhrdc.net/ty/operation/project-1/company-1/new-report/2/add?detailId=test-report";
    const html = '<div class="el-tree"><div class="el-tree-node is-current" data-key="test-node" aria-selected="true"><div class="el-tree-node__content"><span class="el-tree-node__label">测试节点</span></div><div id="editor"></div></div></div><div role="toolbar"><button aria-label="加粗">加粗</button></div>';
    await context.route("**/*", (route) => {
      const requestUrl = route.request().url();
      if (requestUrl === url) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      if (requestUrl.startsWith("chrome-extension://")) return route.continue();
      return route.abort();
    });
    await page.goto(url);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const tabId = await worker.evaluate(async (target) => (await chrome.tabs.query({})).find((tab) => tab.url === target)?.id, url);
    assert.ok(Number.isInteger(tabId));
    async function action(payload) {
      let lastError;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try { return await worker.evaluate(({ id, payload }) => chrome.tabs.sendMessage(id, { type: "TIANYUAN_WORKBENCH_RUN_ACTION_V2", payload }), { id: tabId, payload }); }
        catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 50)); }
      }
      throw lastError;
    }
    const reportIdentity = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add", reportDetailId: "test-report" };
    const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
    const inspect = await action({ action: "report_inspect", reportIdentity });
    assert.equal(inspect.ok, true, JSON.stringify(inspect));
    assert.equal(inspect.editor.modelAvailable, true);
    await page.evaluate(() => window.fixtureSelect());
    const preview = await action({ action: "report_preview", reportIdentity, ops: [{ kind: "editor_command", nodeRef, command: "bold" }] });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    const execution = await action({ action: "report_execute", reportIdentity, planHash: preview.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
    assert.equal(execution.status, "pendingVerify", JSON.stringify(execution));
    assert.equal(execution.results[0].readback.modelChanged, true);
    assert.equal(await page.evaluate(() => window.fixtureView.dom.querySelector("strong")?.textContent), "乙丙");
  } finally {
    if (context) await context.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
