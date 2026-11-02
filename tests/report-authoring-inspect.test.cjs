"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "extension/src/injected/report_adapter.js"), "utf8");
const identity = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add" };

function element(attributes = {}, label = "", options = {}) {
  const result = {
    attributes,
    tagName: options.tagName || "DIV",
    className: options.className || "",
    children: options.children || [],
    offsetWidth: 1,
    offsetHeight: 1,
    classList: { contains(name) { return String(this.owner?.className || "").split(/\s+/).includes(name); }, owner: null },
    getClientRects() { return [{}]; },
    getAttribute(name) { return this.attributes[name] || null; },
    getAttributeNames() { return Object.keys(this.attributes); },
    querySelector(selector) {
      if (options.querySelector) return options.querySelector(selector);
      return label && !selector.startsWith(":scope") ? { textContent: label } : null;
    },
    querySelectorAll() { return []; },
    parentElement: { closest() { return null; } },
    get textContent() { return label; },
  };
  result.classList.owner = result;
  return result;
}

function setup(options = {}) {
  const nodes = options.nodes || [];
  const tree = element();
  tree.querySelectorAll = () => nodes;
  tree.contains = () => true;
  const document = {
    querySelectorAll(selector) {
      if (selector === ".el-tree,[role='tree']") return options.tree === false ? [] : [tree];
      if (selector.includes("dialog")) return [];
      if (selector === "[contenteditable='true'],.ProseMirror") return options.editors || [];
      if (selector === "[role='toolbar'],.editor-toolbar,.tiptap-toolbar,.ql-toolbar,.el-tiptap-editor__menu-bar") return options.toolbars || [];
      if (selector === "input") return [];
      throw new Error(`Unexpected selector ${selector}`);
    },
  };
  const window = { getComputedStyle() { return { display: "block", visibility: "visible" }; } };
  const context = { window, document, location: { protocol: options.protocol || "https:", hostname: options.hostname || "excel.zhrdc.net", pathname: options.pathname || "/ty/operation/project-1/company-1/new-report/2/add" } };
  vm.runInNewContext(source, context);
  return context.window.__tianyuanReportAuthoringAdapter;
}

test("report inspection fails closed on a different host, route or target", () => {
  const wrongHost = setup({ hostname: "example.org" });
  assert.equal(wrongHost.status().inspectAvailable, false);
  assert.equal(wrongHost.inspect({ reportIdentity: identity }).reason, "REPORT_TARGET_MISMATCH");
  assert.equal(setup({ protocol: "http:" }).inspect({ reportIdentity: identity }).reason, "REPORT_TARGET_MISMATCH");
  const wrongRoute = setup({ pathname: "/ty/operation/project-1/company-1/asset-based-approach/draft" });
  assert.equal(wrongRoute.inspect({ reportIdentity: identity }).reason, "REPORT_TARGET_MISMATCH");
  const adapter = setup();
  assert.equal(adapter.inspect({ reportIdentity: { ...identity, companyId: "company-2" } }).reason, "REPORT_TARGET_MISMATCH");
  assert.equal(adapter.inspect({}).reason, "REPORT_TARGET_MISMATCH");
});

test("report inspection is explicitly partial, read-only and identifies duplicate candidate IDs", () => {
  const nodes = [element({ "data-node-key": "same" }, "一、声明"), element({ "data-node-key": "same" }, "二、声明"), element({ "data-id": "token-private" }, "验证码 123456")];
  const adapter = setup({ nodes, editors: [element()] });
  const result = adapter.inspect({ reportIdentity: identity });
  assert.equal(result.ok, true);
  assert.equal(result.reportIdentityVerified, false);
  assert.equal(result.reportIdentity.reportId, null);
  assert.equal(result.tree.complete, false);
  assert.equal(result.tree.identityVerified, false);
  assert.equal(result.tree.nodes.length, 3);
  assert.equal(result.tree.duplicateCandidateIds[0], "same");
  assert.equal(result.tree.nodes[2].label, "[已隐藏]");
  assert.equal(result.tree.nodes[2].candidateId, null);
  assert.equal(result.editor.model, "unverified");
  assert.equal(result.editor.contentRead, false);
  assert.equal(result.writeEnabled, false);
  assert.equal(result.security.writesPerformed, false);
});

test("custom Element tree content and data-key are surfaced only as unverified candidates", () => {
  const content = element({}, "自定义节点标题", { tagName: "SPAN", className: "custom-node-title" });
  const node = element({ "data-key": "node-17" }, "", { className: "el-tree-node", querySelector(selector) { return selector === ":scope > .el-tree-node__content" ? content : null; } });
  const result = setup({ nodes: [node] }).inspect({ reportIdentity: identity });
  assert.equal(result.tree.nodes[0].label, "自定义节点标题");
  assert.equal(result.tree.nodes[0].candidateId, "node-17");
  assert.equal(result.tree.identityVerified, false);
  assert.equal(result.tree.complete, false);
  assert.equal(result.tree.reason, "REPORT_TREE_COMPLETENESS_UNVERIFIED");
});

test("tree results are paginated and structural diagnostics omit node text", () => {
  const nodes = Array.from({ length: 7 }, (_, index) => {
    const privateText = `内部内容 ${index} authorization=secret-value`;
    const emptyContent = element({}, "", { tagName: "SPAN", className: "node-renderer" });
    return element({ "data-key": `k${index}` }, "", {
      tagName: "DIV",
      className: "el-tree-node",
      children: [emptyContent],
      querySelector(selector) { return selector === ":scope > .el-tree-node__content" ? emptyContent : null; },
      get textContent() { return privateText; },
    });
  });
  const result = setup({ nodes }).inspect({ reportIdentity: identity, offset: 2, limit: 3 });
  assert.equal(result.tree.offset, 2);
  assert.equal(result.tree.limit, 3);
  assert.equal(result.tree.totalVisibleCandidates, 7);
  assert.equal(result.tree.hasMore, true);
  assert.deepEqual(Array.from(result.tree.nodes, (node) => node.candidateId), ["k2", "k3", "k4"]);
  const lastPage = setup({ nodes }).inspect({ reportIdentity: identity, offset: 6, limit: 3 });
  assert.equal(lastPage.tree.hasMore, false);
  assert.equal(lastPage.tree.complete, false);
  assert.equal(lastPage.tree.reason, "REPORT_TREE_PAGE_PARTIAL");
  assert.equal(result.tree.structureDiagnostics.length, 3);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
  assert.equal(JSON.stringify(result).includes("内部内容"), false);
});

test("missing tree, closed settings and absent toolbar are not reported as discovered", () => {
  const result = setup({ tree: false }).inspect({ reportIdentity: identity });
  assert.equal(result.tree.available, false);
  assert.equal(result.tree.reason, "REPORT_TREE_NOT_FOUND");
  assert.equal(result.settings.available, false);
  assert.equal(result.settings.reason, "REPORT_SETTINGS_NOT_OPEN");
  assert.equal(result.editor.toolbarAvailable, false);
  assert.equal(result.editor.selectionAvailable, false);
});

test("report adapter is included in injection and runtime copy requirements", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
  const content = fs.readFileSync(path.join(root, "extension/src/content/content.js"), "utf8");
  const sidepanel = fs.readFileSync(path.join(root, "extension/src/sidepanel/sidepanel.js"), "utf8");
  const installer = fs.readFileSync(path.join(root, "scripts/install-local-runtime.mjs"), "utf8");
  assert.ok(manifest.web_accessible_resources[0].resources.includes("src/injected/report_adapter.js"));
  assert.ok(content.indexOf('"src/injected/report_adapter.js"') < content.indexOf('"src/injected/page_adapter.js"'));
  assert.match(content, /if \(adapterInjectionPromise\) return adapterInjectionPromise;/);
  assert.match(sidepanel, /const REPORT_ACTION_TYPES = \["report_inspect", "report_navigate", "report_node_read", "report_preview", "report_execute", "report_save", "report_readback", "report_editor_open", "report_editor_command", "report_editor_save", "report_editor_close", "report_reload"\]/);
  assert.match(sidepanel, /REPORT_ACTION_TYPES\.includes\(claimedAction\.type\)/);
  assert.match(sidepanel, /reportPayload\.writeAuthorized = true/);
  assert.ok(installer.includes('"src/injected/report_adapter.js"'));
});

test("MCP declares only implemented report inspection with separate identities and bounded paging", async () => {
  const clientPath = path.join(root, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs");
  const { tools } = await import(pathToFileURL(clientPath).href);
  const reportTools = tools.filter((item) => item.name.startsWith("tianyuan.report_"));
  assert.deepEqual(reportTools.map((item) => item.name), [
    "tianyuan.report_inspect",
    "tianyuan.report_capabilities",
    "tianyuan.report_navigate",
    "tianyuan.report_node_read",
    "tianyuan.report_preview",
    "tianyuan.report_execute",
    "tianyuan.report_save",
    "tianyuan.report_editor",
    "tianyuan.report_reload",
    "tianyuan.report_readback",
  ]);
  const schema = reportTools[0].inputSchema;
  assert.ok(schema.required.includes("projectId"));
  assert.ok(schema.required.includes("reportIdentity"));
  assert.equal(schema.properties.limit.maximum, 100);
  assert.equal(schema.properties.offset.maximum, 5000);
  assert.ok(schema.properties.reportIdentity.required.includes("projectId"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.reportIdentity.additionalProperties, false);
  const navigate = reportTools.find((item) => item.name === "tianyuan.report_navigate");
  assert.ok(navigate.inputSchema.properties.op.enum.includes("clear_search"));
  assert.ok(navigate.inputSchema.properties.op.enum.includes("enter_edit_mode"));
  assert.match(navigate.description, /都不修改节点结构/);
  const execute = reportTools.find((item) => item.name === "tianyuan.report_execute");
  const preview = reportTools.find((item) => item.name === "tianyuan.report_preview");
  assert.match(preview.description, /节点树编辑包括新增子节点/);
  const editorOp = preview.inputSchema.properties.ops.items.oneOf.find((item) => item.properties.kind.const === "editor_text");
  assert.equal(editorOp.properties.find.maxLength, 20000);
  assert.equal(editorOp.properties.replace.maxLength, 20000);
  const colorOp = preview.inputSchema.properties.ops.items.oneOf.find((item) => item.properties.command?.const === "font_color");
  assert.equal(colorOp.properties.color.pattern, "^#[0-9a-fA-F]{6}$");
  assert.ok(colorOp.required.includes("color"));
  assert.deepEqual(execute.inputSchema.properties.confirmText.enum, ["确认执行报告修改", "确认执行报告结构修改"]);
  assert.equal(execute.inputSchema.properties.planHash.maxLength, 128);
  const save = reportTools.find((item) => item.name === "tianyuan.report_save");
  assert.equal(save.inputSchema.properties.confirmText.const, "确认保存报告");
  const capabilities = reportTools.find((item) => item.name === "tianyuan.report_capabilities");
  assert.deepEqual(capabilities.inputSchema.required, ["sessionId", "bindingId", "projectId", "threadId", "tabId", "reportIdentity"]);
  assert.equal(capabilities.inputSchema.additionalProperties, false);
});
