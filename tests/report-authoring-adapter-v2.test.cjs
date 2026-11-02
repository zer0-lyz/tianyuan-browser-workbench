"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const adapterSource = fs.readFileSync(path.join(root, "extension/src/injected/report_adapter.js"), "utf8");
const { buildReportPage } = require("./helpers/report-page-fixture.cjs");

const identity = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add" };

function createPage(options = {}) {
  const page = buildReportPage(options);
  return page;
}

function ref(nodePathKey, label) {
  return { nodePathKey, label };
}

// 适配器返回值来自 vm 沙箱，deepEqual 前先转为本域普通对象
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const nodeRef = {
  firstHouse: () => ({ ...ref("0/0", "1.1 房屋建筑物"), candidateId: "fixture-house-a" }),
  secondHouse: () => ({ ...ref("0/1", "1.1 房屋建筑物"), candidateId: "fixture-house-b" }),
  lazy: () => ({ ...ref("0/2", "1.2 设备及车辆"), candidateId: "fixture-lazy" }),
  conclusion: () => ({ ...ref("1", "二、评估结论"), candidateId: "fixture-conclusion" }),
  root: () => ({ ...ref("0", "一、评估对象与范围"), candidateId: "fixture-root" }),
};

test("safety: ambiguous nodes cannot be used for editing", async () => {
  const page = createPage();
  const result = await page.adapter.dispatch({ action: "report_node_read", nodeRef: ref("0/0", "1.1 房屋建筑物"), reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_NODE_AMBIGUOUS");
  assert.equal(page.journal.some((entry) => entry.kind === "save"), false);
});

test("inspection does not advertise unverified write actions as supported", () => {
  const result = createPage().adapter.inspect({ reportIdentity: identity });
  assert.deepEqual(plain(result.supportedActions), ["inspect"]);
  assert.equal(result.supportedActions.includes("execute"), false);
  assert.equal(result.conditionalActions.includes("node_read"), true);
  assert.equal(result.writeEnabled, false);
});

test("search inspection exposes only allowlisted component event names", () => {
  const page = createPage();
  const input = page.context.document.querySelectorAll("input")[0];
  input.__vue__ = { $listeners: { input() {}, keyup() {}, token() {}, password() {} } };
  input._vei = { onInput() {}, onClick() {}, onToken() {} };
  input[Symbol("_vei")] = { onChange() { return "report body"; }, onBlur() { return "credential=fixture"; }, onKeydown() {}, onPassword() {} };
  input.onclick = () => {};
  input.__vueParentComponent = {};
  input.__reactProps$fixture = { onChange() {}, onPassword() {} };
  const result = page.adapter.inspect({ reportIdentity: identity });
  assert.equal(result.tree.searchDiagnostics.available, true);
  assert.deepEqual(plain(result.tree.searchDiagnostics.components), [{ depth: 0, events: ["input", "keyup"] }]);
  assert.deepEqual(plain(result.tree.searchDiagnostics.elements[0]), { depth: 0, tag: "INPUT", nativeEvents: ["click"], vueEvents: ["input", "click", "change", "blur", "keydown"], reactEvents: ["change"], vue3: true });
  assert.equal(JSON.stringify(result.tree.searchDiagnostics).includes("token"), false);
  assert.equal(JSON.stringify(result.tree.searchDiagnostics).includes("report body"), false);
  assert.equal(JSON.stringify(result.tree.searchDiagnostics).includes("credential=fixture"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "search-filter"), false);
});

test("safety: unverified report save and discard do not act on the page", async () => {
  const page = createPage();
  const saved = await page.adapter.dispatch({ action: "report_save", confirmText: "确认保存报告", writeAuthorized: true, reportIdentity: identity });
  const discarded = await page.adapter.dispatch({ action: "report_editor_close", discardConfirmed: true, reportIdentity: identity });
  assert.equal(saved.reason, "REPORT_SAVE_TARGET_UNVERIFIED");
  assert.equal(discarded.reason, "REPORT_DISCARD_UNSUPPORTED");
  assert.equal(page.journal.some((entry) => entry.kind === "save"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-closed"), false);
});

test("safety: ambiguous preview cannot create an executable plan", async () => {
  const page = createPage();
  const preview = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_delete", nodeRef: ref("0/0", "1.1 房屋建筑物"), opConfirm: true }],
  });
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, "REPORT_PLAN_INVALID");
  assert.equal(preview.ops[0].error, "REPORT_NODE_AMBIGUOUS");
  assert.equal(preview.planHash, undefined);
  assert.equal(page.journal.some((entry) => entry.kind === "inline-click"), false);
});

test("write preview requires an explicit node identity even for a unique title", () => {
  const page = createPage({ tree: [{ label: "唯一节点", dataKey: "stable-node", selected: true, editor: { framework: "contenteditable", text: "原文" } }] });
  const op = { kind: "editor_text", nodeRef: { nodePathKey: "0", label: "唯一节点" }, mode: "append", replace: "测试" };
  const missing = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [op] });
  assert.equal(missing.ops[0].error, "REPORT_NODE_ID_REQUIRED");
  assert.equal(missing.planHash, undefined);
  const present = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ ...op, nodeRef: { ...op.nodeRef, candidateId: "stable-node" } }] });
  assert.equal(present.ok, true);
});

test("safety: same-label nodes require the matching unique candidate identity", () => {
  const page = createPage({ tree: [
    { label: "报告", dataKey: "report-parent", expanded: true, children: [
      { label: "同名节点", dataKey: "node-a" },
      { label: "同名节点", dataKey: "node-b" },
    ] },
  ] });
  const op = (candidateId) => ({ kind: "structure_delete", nodeRef: { nodePathKey: "0/0", label: "同名节点", candidateId }, opConfirm: true });
  const valid = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [op("node-a")] });
  const changed = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [op("node-b")] });
  assert.equal(valid.ok, true);
  assert.equal(valid.ops[0].nodeRef.candidateId, "node-a");
  assert.equal(changed.ok, false);
  assert.equal(changed.ops[0].error, "REPORT_NODE_CHANGED");
  assert.equal(changed.planHash, undefined);
});

test("safety: readback refuses a same-label node with a mismatched identity", () => {
  const page = createPage({ tree: [
    { label: "报告", expanded: true, children: [
      { label: "同名节点", dataKey: "node-a" },
      { label: "同名节点", dataKey: "node-b" },
    ] },
  ] });
  const good = page.adapter.dispatch({ action: "report_readback", reportIdentity: identity,
    nodeRefs: [{ nodePathKey: "0/0", label: "同名节点", candidateId: "node-a" }] });
  const stale = page.adapter.dispatch({ action: "report_readback", reportIdentity: identity,
    nodeRefs: [{ nodePathKey: "0/0", label: "同名节点", candidateId: "node-b" }] });
  assert.equal(good.ok, true);
  assert.equal(good.nodes[0].candidateId, "node-a");
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "REPORT_NODE_CHANGED");
  assert.equal(stale.nodes, undefined);
});

test("safety: explicit readback reaches a valid target beyond the first 200 nodes", () => {
  const page = createPage({ tree: Array.from({ length: 205 }, (_, index) => ({
    label: `节点 ${index}`, dataKey: `id-${index}`,
  })) });
  const result = page.adapter.dispatch({ action: "report_readback", reportIdentity: identity,
    nodeRefs: [{ nodePathKey: "204", label: "节点 204", candidateId: "id-204" }] });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, false);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].candidateId, "id-204");
});

test("safety: editor command requires authorization and confirmation", async () => {
  const page = createPage();
  const unauthorized = await page.adapter.dispatch({ action: "report_editor_command", command: "bold", reportIdentity: identity });
  const unconfirmed = await page.adapter.dispatch({ action: "report_editor_command", command: "bold", reportIdentity: identity, writeAuthorized: true });
  assert.equal(unauthorized.reason, "REPORT_WRITE_NOT_AUTHORIZED");
  assert.equal(unconfirmed.reason, "REPORT_CONFIRM_TEXT_INVALID");
  assert.equal(page.journal.some((entry) => entry.kind === "editor-command"), false);
});

test("safety: separately previewed replacements cannot overwrite each other's plans", async () => {
  const page = createPage();
  const selected = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(selected.ok, true);
  const makePlan = (replacement) => page.adapter.dispatch({
    action: "report_preview", reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: replacement }],
  });
  const first = makePlan("甲");
  const second = makePlan("乙");
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.planHash, second.planHash);
  const result = await page.adapter.dispatch({
    action: "report_execute", reportIdentity: identity, planHash: first.planHash,
    writeAuthorized: true, confirmText: "确认执行报告修改",
  });
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(page.helpers.editorText("0/0").endsWith("甲"), true);
  assert.equal(page.helpers.editorText("0/0").endsWith("乙"), false);
});

test("settings preview rejects unsupported fields before any mutation", async () => {
  const page = createPage();
  page.helpers.openSettings("0/1");
  const fields = [{ label: "节点类型", value: "目录" }];
  const preview = page.adapter.dispatch({
    action: "report_preview", reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields }],
  });
  assert.equal(preview.ok, false);
  assert.equal(preview.ops[0].error, "REPORT_SETTINGS_FIELD_UNSUPPORTED");
  assert.equal(preview.planHash, undefined);
  fields[0].value = "附注";
  assert.equal(page.state.settingsByPath.get("0/1").节点类型, "正文");
  assert.equal(page.journal.some((entry) => ["radio-click", "select-change", "settings-confirm"].includes(entry.kind)), false);
});

test("settings preview rejects an unverified or wrong-node dialog", async () => {
  const page = createPage();
  const dialog = page.helpers.openSettings("0/0");
  const ops = [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "节点类型", value: "目录" }] }];
  const wrong = page.adapter.preview({ reportIdentity: identity, ops });
  assert.equal(wrong.ops[0].error, "REPORT_SETTINGS_TARGET_UNVERIFIED");
  assert.equal(wrong.planHash, undefined);
  const readback = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.secondHouse(), include: ["settings"] });
  assert.equal(readback.settings.reason, "REPORT_SETTINGS_TARGET_UNVERIFIED");
  assert.equal(readback.settings.fields.length, 0);
  dialog.removeAttribute("data-node-key");
  const unknown = page.adapter.preview({ reportIdentity: identity, ops: [{ ...ops[0], nodeRef: nodeRef.firstHouse() }] });
  assert.equal(unknown.ops[0].error, "REPORT_SETTINGS_TARGET_UNVERIFIED");
  assert.equal(unknown.planHash, undefined);
  assert.equal(page.journal.some((entry) => ["radio-click", "select-change"].includes(entry.kind)), false);
});

test("settings preview checks every field before any change", () => {
  const page = createPage();
  page.helpers.openSettings("0/1");
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }, { label: "编号样式", value: "不存在" }] }] });
  assert.equal(plan.ops[0].error, "REPORT_SETTINGS_FIELD_UNSUPPORTED");
  assert.equal(plan.planHash, undefined);
  assert.equal(page.journal.some((entry) => ["radio-click", "select-change"].includes(entry.kind)), false);
});

test("safety: uncertain persistence stops the rest of a batch", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand", nodeRef: nodeRef.lazy(), reportIdentity: identity, timeoutMs: 1500 });
  const preview = page.adapter.dispatch({
    action: "report_preview", reportIdentity: identity,
    ops: [
      { kind: "structure_delete", nodeRef: nodeRef.conclusion(), opConfirm: true },
      { kind: "structure_delete", nodeRef: nodeRef.root(), opConfirm: true },
    ],
  });
  assert.equal(preview.ok, true);
  const result = await page.adapter.dispatch({
    action: "report_execute", reportIdentity: identity, planHash: preview.planHash,
    writeAuthorized: true, confirmText: "确认执行报告结构修改",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(plain(result.results.map((item) => item.status)), ["pendingVerify", "skipped"]);
});

test("safety: editor save toast is not persistent readback evidence", async () => {
  const page = createPage({ tree: [
    { label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "contenteditable", text: "原文" } },
  ] });
  const node = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
  const opened = await page.adapter.dispatch({ action: "report_editor_open", nodeRef: node, reportIdentity: identity });
  assert.equal(opened.ok, true, opened.reason);
  const result = await page.adapter.dispatch({
    action: "report_editor_save", nodeRef: node, reportIdentity: identity,
    writeAuthorized: true, confirmText: "确认保存报告", timeoutMs: 300,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.reason, "REPORT_SAVE_UNVERIFIED");
  assert.equal(result.security.writesPerformed, true);
});

test("read-only discovery recognizes an associated ProseMirror view without returning its contents", () => {
  const page = createPage({ tree: [
    { label: "测试节点", selected: true, editor: { framework: "prosemirror", text: "内部文本" } },
  ] });
  const editor = page.state.nodes[0].editorEl;
  assert.ok(editor);
  editor.__vue__ = { editor: { view: { dom: editor, state: { schema: {}, tr: {} }, dispatch() {} } } };
  const result = page.adapter.inspect({ reportIdentity: identity });
  assert.equal(result.editor.framework, "prosemirror");
  assert.equal(result.editor.modelAvailable, true);
  assert.equal(result.editor.contentRead, false);
  assert.equal(JSON.stringify(result.editor).includes("内部文本"), false);
  assert.equal(result.security.writesPerformed, false);
  editor.__vue__ = { editor: { view: { dom: {}, state: { schema: {}, tr: {} }, dispatch() {} } } };
  const unrelated = page.adapter.inspect({ reportIdentity: identity });
  assert.equal(unrelated.editor.modelAvailable, false);
});

test("read-only discovery chooses the focused editor, not the first visible editor", () => {
  const page = createPage({ editors: "all", tree: [
    { label: "第一节点", selected: true, editor: { framework: "prosemirror", text: "第一段" } },
    { label: "第二节点", editor: { framework: "prosemirror", text: "第二段" } },
  ] });
  const second = page.state.nodes[1].editorEl;
  second.__vue__ = { editor: { view: { dom: second, state: { schema: {}, tr: {} }, dispatch() {} } } };
  const ambiguous = page.adapter.inspect({ reportIdentity: identity });
  assert.equal(ambiguous.editor.editorSelection, "ambiguous");
  assert.equal(ambiguous.editor.modelAvailable, false);
  second.focus();
  const focused = page.adapter.inspect({ reportIdentity: identity });
  assert.equal(focused.editor.editorSelection, "identified");
  assert.equal(focused.editor.modelAvailable, true);
  assert.equal(focused.security.writesPerformed, false);
  assert.equal(JSON.stringify(focused.editor).includes("第二段"), false);
});

test("ProseMirror text edits use bounded model transactions and remain pending verification", async () => {
  const page = createPage({ tree: [{ label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "prosemirror", text: "甲乙甲" } }] });
  const editor = page.state.nodes[0].editorEl;
  let current = "甲乙甲";
  let dispatches = 0;
  const view = {
    dom: editor,
    get state() {
      const paragraph = { isTextblock: true, childCount: 1, child: () => ({ isText: true }), textContent: current, content: { size: current.length } };
      const transaction = { value: current, insertText(replacement, from, to) { this.value = this.value.slice(0, from - 1) + replacement + this.value.slice(to - 1); return this; } };
      return { schema: {}, doc: { childCount: 1, child: () => paragraph, value: current, eq(other) { return this.value === other.value; } }, tr: transaction };
    },
    dispatch(transaction) { dispatches += 1; current = transaction.value; editor.textContent = current; },
  };
  editor.__vue__ = { editor: { view } };
  const target = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "editor_text", nodeRef: target, mode: "replace_all", find: "甲", replace: "丙" }] });
  assert.equal(plan.ok, true);
  const result = await page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改", planHash: plan.planHash });
  assert.equal(result.reason, "REPORT_PERSISTENCE_UNVERIFIED");
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(current, "丙乙丙");
  assert.equal(dispatches, 1);
});

test("ProseMirror refuses non-text nodes and uncertain dispatch is not treated as failed-safe", async () => {
  const page = createPage({ tree: [{ label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "prosemirror", text: "原文" } }] });
  const editor = page.state.nodes[0].editorEl;
  let containsAtom = true; let dispatches = 0;
  const view = { dom: editor, get state() { return { schema: {}, doc: { childCount: 1, child: () => ({ isTextblock: true, childCount: 1, child: () => ({ isText: !containsAtom }), textContent: "原文", content: { size: 2 } }), containsAtom, eq(other) { return this.containsAtom === other.containsAtom; } }, tr: { insertText() { return this; } } }; }, dispatch() { dispatches += 1; throw new Error("uncertain"); } };
  editor.__vue__ = { editor: { view } };
  const target = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
  const run = async () => {
    const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "editor_text", nodeRef: target, mode: "append", replace: "新" }] });
    if (!plan.ok) return { results: plan.ops };
    return page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改", planHash: plan.planHash });
  };
  const unsupported = await run();
  assert.equal(unsupported.results[0].error, "REPORT_COMPLEX_CONTENT_UNSUPPORTED");
  assert.equal(dispatches, 0);
  containsAtom = false;
  const uncertain = await run();
  assert.equal(uncertain.results[0].status, "pendingVerify");
  assert.equal(uncertain.results[0].error, "REPORT_EDITOR_DISPATCH_UNCERTAIN");
  assert.equal(dispatches, 1);
});

test("ProseMirror preview rejects a formatting-only model change", async () => {
  const page = createPage({ tree: [{ label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "prosemirror", text: "原文" } }] });
  const editor = page.state.nodes[0].editorEl;
  let formatting = "plain"; let dispatches = 0;
  const view = { dom: editor, get state() { return { schema: {}, doc: { formatting, childCount: 1, child: () => ({ isTextblock: true, childCount: 1, child: () => ({ isText: true }), textContent: "原文", content: { size: 2 } }), eq(other) { return this.formatting === other.formatting; } }, tr: {} }; }, dispatch() { dispatches += 1; } };
  editor.__vue__ = { editor: { view } };
  const target = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "editor_text", nodeRef: target, mode: "append", replace: "新" }] });
  assert.equal(plan.ok, true);
  formatting = "bold";
  const result = await page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改", planHash: plan.planHash });
  assert.equal(result.results[0].error, "REPORT_CONTENT_CHANGED");
  assert.equal(dispatches, 0);
});

test("adapter v2 exports dispatch alongside inspect with the report-authoring-v2 version", () => {
  const page = createPage();
  assert.equal(page.adapter.version, "report-authoring-v2");
  for (const name of ["status", "inspect", "dispatch", "navigate", "nodeRead", "preview", "execute", "save", "readback"]) {
    assert.equal(typeof page.adapter[name], "function", name);
  }
  const dispatched = page.adapter.dispatch({ action: "report_inspect", reportIdentity: identity });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.reportAdapterVersion, "report-authoring-v2");
  assert.equal(page.adapter.dispatch({ action: "report_unknown", reportIdentity: identity }).reason, "REPORT_ACTION_UNKNOWN");
});

test("nodePathKey distinguishes same-label nodes and navigate matches path plus label", async () => {
  const page = createPage();
  const inspect = page.adapter.dispatch({ action: "report_inspect", reportIdentity: identity });
  const houses = inspect.tree.nodes.filter((node) => node.label === "1.1 房屋建筑物");
  assert.equal(houses.length, 2);
  assert.deepEqual(plain(houses.map((node) => node.nodePathKey)), ["0/0", "0/1"]);
  assert.notEqual(houses[0].nodePathKey, houses[1].nodePathKey);

  const selectSecond = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.secondHouse(), reportIdentity: identity });
  assert.equal(selectSecond.ok, true);
  assert.equal(selectSecond.nodeRef.nodePathKey, "0/1");
  assert.equal(selectSecond.selected, true);
  assert.equal(page.helpers.selectedPath(), "0/1");

  const labelMismatch = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: { nodePathKey: "0/1", label: "1.2 设备及车辆" }, reportIdentity: identity });
  assert.equal(labelMismatch.ok, false);
  assert.equal(labelMismatch.reason, "REPORT_NODE_CHANGED");
  assert.equal(page.helpers.selectedPath(), "0/1");

  const missing = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: { nodePathKey: "9/9", label: "不存在" }, reportIdentity: identity });
  assert.equal(missing.reason, "REPORT_NODE_CHANGED");
  const malformed = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: { label: "无路径" }, reportIdentity: identity });
  assert.equal(malformed.reason, "REPORT_NODE_REF_INVALID");
});

test("navigate select journals a real click sequence instead of mutating state directly", async () => {
  const page = createPage();
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(result.ok, true);
  assert.equal(result.selected, true);
  assert.equal(page.helpers.selectedPath(), "0/0");
  const clicks = page.journal.filter((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "tree-node-content" && entry.target.path === "0/0");
  assert.equal(clicks.length, 1);
  const types = page.journal.filter((entry) => entry.kind === "event" && entry.target?.kind === "tree-node-content" && entry.target.path === "0/0").map((entry) => entry.eventType);
  assert.deepEqual(types, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  assert.ok(page.journal.some((entry) => entry.kind === "select" && entry.path === "0/0"));
});

test("navigate expand loads lazy children through the expand icon", async () => {
  const page = createPage();
  assert.equal(page.helpers.treeLabels().includes("1.2.1 空调设备"), false);
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "expand", nodeRef: nodeRef.lazy(), reportIdentity: identity, timeoutMs: 1500 });
  assert.equal(result.ok, true);
  assert.equal(result.expanded, true);
  const labels = page.helpers.treeLabels();
  assert.ok(labels.includes("1.2.1 空调设备"));
  assert.ok(labels.includes("1.2.2 电梯设备"));
  assert.ok(page.journal.some((entry) => entry.kind === "lazy-load" && entry.path === "0/2"));
  const iconClicks = page.journal.filter((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "tree-expand-icon" && entry.target.path === "0/2");
  assert.equal(iconClicks.length, 1);
});

test("navigate expand times out with REPORT_EXPAND_TIMEOUT when the page does not respond", async () => {
  const page = createPage({ unresponsive: true });
  const startedAt = Date.now();
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "expand", nodeRef: nodeRef.lazy(), reportIdentity: identity, timeoutMs: 300 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_EXPAND_TIMEOUT");
  assert.ok(Date.now() - startedAt < 5000, "timeout path should not wait the 8s default");
  assert.equal(page.helpers.treeLabels().includes("1.2.1 空调设备"), false);
});

test("navigate reveal expands the ancestor chain and selects the deep node", async () => {
  const page = createPage();
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "reveal", nodeRef: ref("0/2/1", "1.2.2 电梯设备"), reportIdentity: identity, timeoutMs: 2000 });
  assert.equal(result.ok, true, result.reason || "");
  assert.equal(result.selected, true);
  assert.equal(page.helpers.selectedPath(), "0/2/1");
  assert.ok(page.journal.some((entry) => entry.kind === "lazy-load" && entry.path === "0/2"));
});

test("node_read detects contenteditable and configured framework editors with stable contentHash", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const editable = await page.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(editable.ok, true);
  assert.equal(editable.editor.framework, "contenteditable");
  assert.equal(editable.editor.modelAvailable, false);
  assert.ok(editable.editor.textPreview.length <= 300);
  const quillNode = ref("2", "三、特殊事项说明");
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: quillNode, reportIdentity: identity });
  const quill = await page.adapter.dispatch({ action: "report_node_read", nodeRef: quillNode, reportIdentity: identity });
  assert.equal(quill.ok, true);
  assert.equal(quill.editor.framework, "quill");
  assert.equal(quill.editor.modelAvailable, true);
  const again = await page.adapter.dispatch({ action: "report_node_read", nodeRef: quillNode, reportIdentity: identity });
  assert.equal(again.editor.contentHash, quill.editor.contentHash);
  assert.match(quill.editor.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(editable.settings.available, false);
  assert.equal(editable.settings.reason, "REPORT_SETTINGS_NOT_OPEN");
});

test("node_read exposes bounded ProseMirror schema names without values", async () => {
  const page = createPage({ editorModelEditable: true, tree: [
    { label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "prosemirror", text: "原文" } },
  ] });
  const editor = page.dom.editorPanel.querySelector(".ProseMirror");
  editor.editorView.state.schema = {
    nodes: { doc: {}, paragraph: { spec: { attrs: { align: {}, indent: {}, authorization: {} } } }, table: {}, text: {}, tokenPayload: {} },
    marks: { strong: {}, textStyle: { spec: { attrs: { fontSize: {}, color: {}, secretValue: {} } } }, underline: {}, secretValue: {} },
  };
  const result = await page.adapter.dispatch({ action: "report_node_read", nodeRef: { nodePathKey: "0", label: "测试节点", candidateId: "test-node" }, reportIdentity: identity, include: ["editor"] });
  assert.equal(result.editor.modelSchema.available, true);
  assert.deepEqual(plain(result.editor.modelSchema.nodeNames), ["doc", "paragraph", "table", "text"]);
  assert.deepEqual(plain(result.editor.modelSchema.markNames), ["strong", "textStyle", "underline"]);
  assert.deepEqual(plain(result.editor.modelSchema.nodeAttributes.paragraph), ["align", "indent"]);
  assert.deepEqual(plain(result.editor.modelSchema.markAttributes.textStyle), ["color", "fontSize"]);
  assert.equal(JSON.stringify(result.editor.modelSchema).includes("tokenPayload"), false);
  assert.equal(JSON.stringify(result.editor.modelSchema).includes("secretValue"), false);
});

test("node_read reports REPORT_EDITOR_AMBIGUOUS when several editors are visible", async () => {
  const page = createPage({ editors: "all" });
  const result = await page.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_EDITOR_AMBIGUOUS");
});

test("node_read associates multiple editors only through a unique matching node key", async () => {
  const page = createPage({ editors: "all" });
  const first = page.state.nodes[0].children[0].editorEl;
  const second = page.state.nodes[0].children[1].editorEl;
  first.parentElement.setAttribute("data-node-key", "fixture-house-a");
  second.parentElement.setAttribute("data-node-key", "fixture-house-b");
  first.parentElement.setAttribute("id", "editor-fixture-house-a");
  const firstRead = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.firstHouse(), include: ["editor"] });
  const secondRead = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.secondHouse(), include: ["editor"] });
  assert.equal(firstRead.ok, true);
  assert.equal(secondRead.ok, true);
  assert.notEqual(firstRead.editor.contentHash, secondRead.editor.contentHash);
  assert.ok(firstRead.editor.textPreview.includes("示例路"));
  assert.ok(secondRead.editor.textPreview.includes("第二处"));
  second.parentElement.setAttribute("data-node-key", "fixture-house-a");
  const ambiguous = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.firstHouse(), include: ["editor"] });
  assert.equal(ambiguous.reason, "REPORT_EDITOR_AMBIGUOUS");
});

test("network diagnostics expose only bounded same-origin paths and no response data", () => {
  const page = createPage();
  page.context.window.__tianyuanWorkbenchUploadNetworkLog = [
    { method: "POST", url: "https://excel.zhrdc.net/ty/api/report/123456/save?token=syntheticsecret", status: 200, response: "password=syntheticsecret" },
    { method: "POST", url: "https://evil.example/ty/api/report/save", status: 200 },
    { method: "GET", url: "/ty/api/other/list", status: 200 },
  ];
  page.context.window.performance = { timeOrigin: 1700000000000, getEntriesByType() { return [{ initiatorType: "fetch", name: "https://excel.zhrdc.net/ty/api/report/list?token=syntheticsecret", startTime: 2000 }]; } };
  const diagnostics = page.adapter.inspect({ reportIdentity: identity }).networkDiagnostics;
  assert.equal(diagnostics.events.length, 2);
  assert.equal(diagnostics.events[0].path, "/ty/api/report/{id}/save");
  assert.equal(diagnostics.events[1].path, "/ty/api/report/list");
  assert.equal(diagnostics.events[1].atEpochMs, 1700000002000);
  assert.equal(diagnostics.persistenceVerified, false);
  assert.equal(JSON.stringify(diagnostics).includes("syntheticsecret"), false);
});

test("editor association diagnostics return aggregate evidence without node IDs or text", () => {
  const page = createPage({ editors: "all" });
  const first = page.state.nodes[0].children[0].editorEl;
  const second = page.state.nodes[0].children[1].editorEl;
  first.parentElement.setAttribute("data-node-key", "fixture-house-a");
  second.parentElement.setAttribute("data-node-key", "fixture-house-b");
  const result = page.adapter.inspect({ reportIdentity: identity });
  const diagnostics = result.editor.associationDiagnostics;
  assert.equal(diagnostics.evidenceOnly, true);
  assert.equal(diagnostics.attributes["data-node-key"].uniquelyMatchedNodes, 2);
  assert.equal(diagnostics.attributes["data-node-key"].ambiguousMatchedNodes, 0);
  assert.equal(diagnostics.ancestorAttributes["data-node-key"].uniquelyMatchedNodes, 2);
  assert.equal(diagnostics.embeddedNodeIds.uniquelyMatchedNodes, 0);
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("fixture-house"), false);
  assert.equal(serialized.includes("示例路"), false);
  second.parentElement.setAttribute("data-node-key", "fixture-house-a");
  const ambiguous = page.adapter.inspect({ reportIdentity: identity }).editor.associationDiagnostics;
  assert.equal(ambiguous.attributes["data-node-key"].ambiguousMatchedNodes, 1);
  assert.equal(ambiguous.attributes["data-node-key"].uniquelyMatchedNodes, 0);
  assert.equal(ambiguous.ancestorAttributes["data-node-key"].ambiguousMatchedNodes, 1);
});

test("editor diagnostics count delimited node identities without disclosing them", () => {
  const page = createPage({ tree: [{ label: "测试节点", dataKey: "123456789012", selected: true, editor: { framework: "contenteditable", text: "测试正文" } }] });
  page.state.nodes[0].editorEl.parentElement.setAttribute("id", "editor-123456789012");
  const diagnostics = page.adapter.inspect({ reportIdentity: identity }).editor.associationDiagnostics;
  assert.equal(diagnostics.embeddedNodeIds.uniquelyMatchedNodes, 1);
  assert.equal(JSON.stringify(diagnostics).includes("123456789012"), false);
  page.state.nodes[0].editorEl.parentElement.setAttribute("id", "editor-9123456789012");
  assert.equal(page.adapter.inspect({ reportIdentity: identity }).editor.associationDiagnostics.embeddedNodeIds.uniquelyMatchedNodes, 0);
});

test("node editor mapping requires unique embedded identity and matching visible label", async () => {
  const page = createPage({ editors: "all", tree: [
    { label: "甲节点", dataKey: "123456789012", selected: true, editor: { framework: "contenteditable", text: "甲节点的正文" } },
    { label: "乙节点", dataKey: "123456789013", editor: { framework: "contenteditable", text: "乙节点的正文" } },
  ] });
  const first = page.state.nodes[0].editorEl;
  const second = page.state.nodes[1].editorEl;
  first.parentElement.setAttribute("id", "editor-123456789012");
  second.parentElement.setAttribute("id", "editor-123456789013");
  first.__vue__ = { $listeners: { dblclick: "synthetic-secret" }, $options: { methods: { openEditor() {}, tokenOpen() {}, unrelated() {} } } };
  first.__reactProps$test = { onMouseDown() {} };
  first[Symbol("_vei")] = { onClick: () => "synthetic-secret" };
  const target = { nodePathKey: "0", label: "甲节点", candidateId: "123456789012" };
  const matched = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: target, include: ["editor"] });
  assert.equal(matched.ok, true);
  assert.equal(matched.editor.association, "node-id-token");
  assert.equal(typeof matched.editor.saveControlAvailable, "boolean");
  assert.ok(Array.isArray(matched.editor.nearbyControls));
  assert.equal(matched.editor.toolbarDiagnostics.evidenceOnly, true);
  assert.equal(JSON.stringify(matched.editor.toolbarDiagnostics).includes("甲节点的正文"), false);
  assert.equal(JSON.stringify(matched.editor.nearbyControls).includes("甲节点"), false);
  assert.equal(matched.editor.activationDiagnostics.ancestors[0].handlers.dblclick, true);
  assert.equal(matched.editor.activationDiagnostics.ancestors[0].handlers.mousedown, true);
  assert.equal(matched.editor.activationDiagnostics.ancestors[0].handlers.click, true);
  assert.deepEqual(plain(matched.editor.activationDiagnostics.ancestors[0].componentMethods), ["openEditor"]);
  assert.equal(JSON.stringify(matched.editor.activationDiagnostics).includes("synthetic-secret"), false);
  first.textContent = "错误正文";
  const mismatch = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: target, include: ["editor"] });
  assert.equal(mismatch.reason, "REPORT_EDITOR_IDENTITY_UNVERIFIED");
  first.textContent = "甲节点的正文";
  second.parentElement.setAttribute("id", "editor-123456789012");
  const duplicate = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: target, include: ["editor"] });
  assert.equal(duplicate.reason, "REPORT_EDITOR_AMBIGUOUS");
});

test("empty new node maps only through its exact content container", async () => {
  const page = createPage({ editors: "all", tree: [
    { label: "节点1", dataKey: "123456789012", selected: true, editor: { framework: "contenteditable", text: "" } },
  ] });
  const node = page.state.nodes[0];
  const name = page.context.document.createElement("div");
  name.setAttribute("class", "name new-add");
  node.contentEl.append(name);
  node.editorEl.parentElement.setAttribute("id", "content_123456789012");
  const payload = { reportIdentity: identity, nodeRef: { nodePathKey: "0", label: "节点1", candidateId: "123456789012" }, include: ["editor"] };
  const empty = await page.adapter.nodeRead(payload);
  assert.equal(empty.ok, true);
  node.editorEl.textContent = "123";
  assert.equal((await page.adapter.nodeRead(payload)).ok, true);
  node.editorEl.parentElement.setAttribute("id", "other_123456789012");
  assert.equal((await page.adapter.nodeRead(payload)).reason, "REPORT_EDITOR_IDENTITY_UNVERIFIED");
  node.editorEl.parentElement.setAttribute("id", "content_123456789012");
  name.setAttribute("class", "name");
  assert.equal((await page.adapter.nodeRead(payload)).reason, "REPORT_EDITOR_IDENTITY_UNVERIFIED");
});

test("node_read without any visible editor reports REPORT_EDITOR_NOT_FOUND", async () => {
  const page = createPage({ editors: "none" });
  const result = await page.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_EDITOR_NOT_FOUND");
});

test("node_read reads whitelisted fields when the settings dialog is open", async () => {
  const page = createPage();
  page.helpers.openSettings("0/1");
  const result = await page.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.secondHouse(), reportIdentity: identity, include: ["settings"] });
  assert.equal(result.ok, true);
  assert.equal(result.settings.available, true);
  const labels = result.settings.fields.map((field) => field.label);
  // 真实页面属性对话框含"编号样式"字段（任务三 fixture 扩展），白名单随之一并读取
  assert.deepEqual(plain(labels).sort(), ["是否分段", "是否编号", "编号样式", "是否设置分隔符", "大纲级别", "节点类型", "节点条件"].sort());
  const nodeType = result.settings.fields.find((field) => field.label === "节点类型");
  assert.deepEqual(plain(nodeType.selected), ["正文"]);
});

test("structure control discovery is bounded, read-only, and omits node content", async () => {
  const page = createPage();
  const before = page.helpers.snapshot();
  const result = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.firstHouse(), include: ["structure"] });
  assert.equal(result.ok, true);
  assert.equal(result.structureDiagnostics.evidenceOnly, true);
  assert.ok(result.structureDiagnostics.controls.some((control) => control.labels.includes("新建子节点")));
  assert.equal(JSON.stringify(result.structureDiagnostics).includes("同名节点的第二处正文"), false);
  assert.deepEqual(page.helpers.snapshot(), before);
});

test("structure scope readback resolves the surviving parent without resolving a deleted target", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const result = await page.adapter.dispatch({ action: "report_node_read", reportIdentity: identity,
    nodeRef: { nodePathKey: "0/1", label: "已删除目标", candidateId: "deleted-target" }, include: ["structure"],
    structureScopeRead: true, scopeRef: { kind: "node", scopePath: "0", nodePathKey: "0", candidateId: "fixture-root", label: "一、评估对象与范围" }, operationIndex: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.node, undefined);
  assert.equal(result.structureReadback.operationKind, "structure_scope_read");
  assert.equal(result.structureReadback.target.candidateId, "fixture-root");
  assert.deepEqual(plain(result.structureReadback.siblings.map((node) => node.candidateId)), ["fixture-house-a", "fixture-house-b", "fixture-lazy"]);
  assert.equal(result.structureReadback.siblings[2].children[0].candidateId, "fixture-lazy-air");
});

test("control diagnostics expose only allowlisted semantic hints and SVG references", async () => {
  const page = createPage();
  const row = [...page.dom.tree.querySelectorAll(".el-tree-node")].find((item) => item.getAttribute("data-node-key") === "fixture-house-a");
  const icon = [...row.querySelectorAll("[aria-label]")].find((item) => item.getAttribute("aria-label") === "新建子节点");
  icon.setAttribute("data-icon", "tree-add-child");
  icon.setAttribute("data-token", "must-not-leak");
  icon.__vueParentComponent = { props: { iconName: "addChild", label: "新建子节点", authorization: "must-not-leak" } };
  assert.equal(icon.getAttribute("data-icon"), "tree-add-child");
  const svg = page.context.document.createElement("svg");
  const use = page.context.document.createElement("use");
  use.setAttribute("href", "#icon-add-child");
  svg.append(use);
  icon.append(svg);
  const result = await page.adapter.nodeRead({ reportIdentity: identity, nodeRef: nodeRef.firstHouse(), include: ["structure"] });
  const control = result.structureDiagnostics.controls.find((item) => item.labels.includes("新建子节点"));
  assert.ok(control.semanticHints.includes("data-icon:tree-add-child"), JSON.stringify({ attr: icon.getAttribute("data-icon"), control }));
  assert.ok(control.semanticHints.includes("vue.iconName:addChild"));
  assert.ok(control.semanticHints.includes("vue.label:新建子节点"));
  assert.deepEqual(plain(control.svgReferences), ["#icon-add-child"]);
  assert.equal(JSON.stringify(result.structureDiagnostics).includes("must-not-leak"), false);
});

test("preview leaves tree, content and dialog untouched and returns plan and content hashes", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  page.helpers.openSettings("0/1");
  const before = page.helpers.snapshot();
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [
      { kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] },
      { kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "（补充）" },
    ],
  });
  assert.equal(plan.ok, true);
  assert.match(plan.planHash, /^plan-[0-9a-f]{32}$/);
  assert.match(plan.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.deepEqual(plain(plan.requires), ["execute"]);
  assert.deepEqual(page.helpers.snapshot(), before, "preview must not change anything");
  const structurePlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "structure_add", nodeRef: nodeRef.lazy(), position: "child", title: "1.2.3 新设备" }] });
  const addOp = structurePlan.ops[0];
  assert.equal(addOp.risk, "medium");
  assert.deepEqual(plain(addOp.linkage), { renumberAffected: false, tocAffected: false, observedPattern: "none" });
});

test("preview reports numbering linkage for structure ops on numbered siblings", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_move", nodeRef: nodeRef.conclusion(), direction: "up" }],
  });
  assert.equal(plan.ok, true);
  const linkage = plan.ops[0].linkage;
  assert.equal(linkage.observedPattern, "一、");
  assert.equal(linkage.renumberAffected, true);
  assert.equal(linkage.tocAffected, true);
});

test("preview truncates before and after to 200 characters and marks delete as high risk", () => {
  const longText = "长".repeat(400);
  const page = createPage({ tree: [
    { label: "甲、长文节点", dataKey: "long-node", selected: true, editor: { framework: "contenteditable", text: longText } },
    { label: "乙、待删除节点", dataKey: "delete-node" },
  ] });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [
      { kind: "editor_text", nodeRef: { ...ref("0", "甲、长文节点"), candidateId: "long-node" }, mode: "append", replace: "尾" },
    ],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.ops[0].before.length, 200);
  assert.ok(plan.ops[0].after.length <= 200);
  assert.equal(plan.ops[0].change.mode, "append");
  assert.equal(plan.ops[0].change.inserted, "尾");
  assert.equal(plan.ops[0].change.insertedLength, 1);
  const deletion = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: { ...ref("1", "乙、待删除节点"), candidateId: "delete-node" } }] });
  assert.equal(deletion.ops[0].risk, "high");
});

test("preview rejects invalid ops without registering a plan", () => {
  const page = createPage();
  const badKind = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: "structure_explode", nodeRef: nodeRef.root() }] });
  assert.equal(badKind.ok, false);
  assert.equal(badKind.reason, "REPORT_OP_INVALID");
  const noOps = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [] });
  assert.equal(noOps.reason, "REPORT_PLAN_INVALID");
  const badNode = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: ref("8/8", "不存在") }] });
  assert.equal(badNode.ok, false);
  assert.equal(badNode.ops[0].error, "REPORT_NODE_CHANGED");
  assert.equal(badNode.planHash, undefined);
});

test("structure actions require a separate preview and explicit structure confirmation", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const mixed = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: nodeRef.conclusion(), opConfirm: true }, { kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "测试" }] });
  assert.equal(mixed.reason, "REPORT_STRUCTURE_BATCH_SEPARATION_REQUIRED");
  assert.equal(mixed.planHash, undefined);
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: nodeRef.conclusion(), opConfirm: true }] });
  assert.equal(plan.confirmationRequired, "确认执行报告结构修改");
  const before = page.helpers.snapshot();
  const denied = await page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改", planHash: plan.planHash });
  assert.equal(denied.reason, "REPORT_CONFIRM_TEXT_INVALID");
  assert.deepEqual(page.helpers.snapshot(), before);
  const correct = await page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告结构修改", planHash: plan.planHash });
  assert.equal(correct.results[0].status, "pendingVerify");
});

test("execute rejects missing authorization, wrong confirm text and unknown plans without any change", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "（新）" }],
  });
  const before = page.helpers.snapshot();
  const unauthorized = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: false, reportIdentity: identity });
  assert.equal(unauthorized.reason, "REPORT_WRITE_NOT_AUTHORIZED");
  const wrongConfirm = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认", writeAuthorized: true, reportIdentity: identity });
  assert.equal(wrongConfirm.reason, "REPORT_CONFIRM_TEXT_INVALID");
  const stale = await page.adapter.dispatch({ action: "report_execute", planHash: "plan-00000000", confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(stale.reason, "REPORT_PLAN_STALE");
  assert.deepEqual(page.helpers.snapshot(), before);
});

test("execute rejects the plan when page content changed after preview", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "set", replace: "全新正文。" }],
  });
  assert.ok(page.helpers.setText("0/0", "页面已被外部修改。"));
  const before = page.helpers.snapshot();
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_CONTENT_CHANGED");
  assert.deepEqual(page.helpers.snapshot(), before);
  const replayAfterChange = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(replayAfterChange.reason, "REPORT_CONTENT_CHANGED");
});

test("execute rejects whitespace-only edits after preview", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "测试" }] });
  assert.equal(plan.ok, true);
  assert.ok(page.helpers.setText("0/0", `${page.helpers.editorText("0/0")} `));
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.reason, "REPORT_CONTENT_CHANGED");
  assert.ok(page.helpers.editorText("0/0").endsWith(" "));
});

test("execute rejects settings changes made after preview", async () => {
  const page = createPage();
  const dialog = page.helpers.openSettings("0/1");
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  assert.equal(plan.ok, true);
  const row = [...dialog.querySelectorAll(".el-form-item")].find((element) => element.querySelector(".el-form-item__label")?.textContent === "是否编号");
  const radios = [...row.querySelectorAll("input[type='radio']")];
  assert.equal(radios.length, 2);
  const selected = radios.find((radio) => radio.checked);
  const other = radios.find((radio) => !radio.checked);
  assert.ok(selected && other);
  selected.checked = false;
  other.checked = true;
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.reason, "REPORT_CONTENT_CHANGED");
  assert.equal(page.journal.some((entry) => entry.kind === "radio-click"), false);
});

test("execute stops after an in-memory settings change awaits persistence", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  page.helpers.openSettings("0/1");
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [
      { kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] },
      { kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "（补充说明）" },
    ],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.planHashConsumed, true);
  assert.equal(result.executed, 1);
  assert.deepEqual(plain(result.results.map((item) => item.status)), ["pendingVerify", "skipped"]);
  assert.equal(page.state.persistedSettingsByPath.get("0/1").是否编号, "是");
  assert.equal(page.helpers.editorText("0/0").endsWith("（补充说明）"), false);
  assert.ok(page.journal.some((entry) => entry.kind === "radio-click" && entry.field === "是否编号" && entry.value === "是"));
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 1);
  assert.equal(page.journal.some((entry) => entry.kind === "execCommand" && entry.command === "insertText"), false);
  const readback = page.adapter.dispatch({ action: "report_readback", nodeRefs: [nodeRef.firstHouse()], reportIdentity: identity });
  assert.equal(readback.nodes[0].textPreview.includes("（补充说明）"), false);
});

test("execute replace modes work through the real editor model or commands", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "replace_all", find: "示例", replace: "目标" }],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.ok(page.helpers.editorText("0/0").includes("房屋建筑物位于目标路 1 号"));
  assert.equal(page.helpers.editorText("0/0").includes("示例"), false);

  const missing = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "replace_first", find: "不存在的文本", replace: "x" }],
  });
  assert.equal(missing.ops[0].error, "REPORT_EDITOR_FIND_TEXT_NOT_FOUND");
});

test("execute via the quill model writes through the framework instance", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: ref("2", "三、特殊事项说明"), reportIdentity: identity });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: { ...ref("2", "三、特殊事项说明"), candidateId: "fixture-special" }, mode: "append", replace: "已补充。" }],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.ok(page.journal.some((entry) => entry.kind === "model-call" && entry.framework === "quill" && entry.method === "setText"));
  assert.equal(page.helpers.editorText("2"), "本节说明特殊事项。已补充。");
});

test("model setter that throws after mutation is pending verification and never retried", async () => {
  const page = createPage();
  const target = { ...ref("2", "三、特殊事项说明"), candidateId: "fixture-special" };
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: target, reportIdentity: identity });
  const editor = page.state.nodes[2].editorEl;
  let calls = 0;
  page.context.window.Quill.find = () => ({ getText() { return editor.textContent; }, setText(value) { calls += 1; editor.textContent = value; throw new Error("unknown model result"); } });
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "editor_text", nodeRef: target, mode: "append", replace: "测试" }] });
  assert.equal(plan.ok, true);
  const result = await page.adapter.execute({ reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改", planHash: plan.planHash });
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_EDITOR_DISPATCH_UNCERTAIN");
  assert.equal(calls, 1);
  assert.ok(editor.textContent.endsWith("测试"));
});

test("preview rejects a batch whose first editor is unavailable", async () => {
  const page = createPage();
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [
      { kind: "editor_text", nodeRef: nodeRef.conclusion(), mode: "append", replace: "x" },
      { kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "y" },
    ],
  });
  const before = page.helpers.snapshot();
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "REPORT_PLAN_INVALID");
  assert.equal(plan.ops[0].error, "REPORT_EDITOR_NOT_FOUND");
  assert.equal(plan.planHash, undefined);
  assert.deepEqual(page.helpers.snapshot(), before);
});

test("execute refuses delete without opConfirm and consumes the plan for replays", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_delete", nodeRef: nodeRef.conclusion() }],
  });
  const before = page.helpers.snapshot();
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].error, "REPORT_OP_CONFIRM_REQUIRED");
  assert.deepEqual(page.helpers.snapshot(), before);
  const replay = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(replay.reason, "REPORT_PLAN_ALREADY_EXECUTED");

  const confirmedPlan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_delete", nodeRef: nodeRef.conclusion(), opConfirm: true }],
  });
  const confirmed = await page.adapter.dispatch({ action: "report_execute", planHash: confirmedPlan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(confirmed.ok, false, JSON.stringify(confirmed.results));
  assert.equal(confirmed.results[0].status, "pendingVerify");
  assert.equal(page.helpers.treeLabels().includes("二、评估结论"), false);
  assert.ok(page.journal.some((entry) => entry.kind === "structure" && entry.op === "delete"));
});

test("execute structure_add inserts nodes through the row inline icon dialog", async () => {
  const page = createPage();
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add", nodeRef: nodeRef.lazy(), position: "child", title: "1.2.3 新增设备" }],
  });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand", nodeRef: nodeRef.lazy(), reportIdentity: identity, timeoutMs: 1500 });
  const plan2 = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add", nodeRef: nodeRef.lazy(), position: "child", title: "1.2.3 新增设备" }],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan2.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.ok(page.helpers.treeLabels().includes("1.2.3 新增设备"));
  assert.ok(page.journal.some((entry) => entry.kind === "structure" && entry.op === "add" && entry.title === "1.2.3 新增设备"));
  // 真实页面语义：结构操作经节点行内 ⊕ 图标（点击行内图标弹出对话框）
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "node-inline-icon" && entry.target.op === "add-child"));
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "add-child"));
  assert.ok(page.journal.some((entry) => entry.kind === "execCommand" && entry.command === "insertText" && entry.value === "1.2.3 新增设备"));
  assert.equal(plan.ok, false);
  assert.equal(plan.ops[0].error, "REPORT_TREE_SNAPSHOT_INCOMPLETE");
  assert.equal(page.adapter.dispatch({ action: "report_readback", reportIdentity: identity }).ok, true);
});

test("save refuses an unverified report-level control even when a toast or network is available", async () => {
  const page = createPage();
  const wrongConfirm = await page.adapter.dispatch({ action: "report_save", confirmText: "保存", writeAuthorized: true, reportIdentity: identity });
  assert.equal(wrongConfirm.reason, "REPORT_CONFIRM_TEXT_INVALID");
  const unauthorized = await page.adapter.dispatch({ action: "report_save", confirmText: "确认保存报告", writeAuthorized: false, reportIdentity: identity });
  assert.equal(unauthorized.reason, "REPORT_WRITE_NOT_AUTHORIZED");
  assert.equal(page.state.savedAt, null);

  const result = await page.adapter.dispatch({ action: "report_save", confirmText: "确认保存报告", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_SAVE_TARGET_UNVERIFIED");
  assert.equal(page.journal.some((entry) => entry.kind === "save"), false);
  const saveClicks = page.journal.filter((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "toolbar-button" && entry.target.op === "save");
  assert.equal(saveClicks.length, 0);
});

test("save without a verified target never clicks a control", async () => {
  const page = createPage({ saveToast: false, saveNetwork: false });
  const result = await page.adapter.dispatch({ action: "report_save", confirmText: "确认保存报告", writeAuthorized: true, reportIdentity: identity, timeoutMs: 300 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_SAVE_TARGET_UNVERIFIED");
  const saveClicks = page.journal.filter((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "toolbar-button" && entry.target.op === "save");
  assert.equal(saveClicks.length, 0);
});

test("readback returns fresh hashes and never claims persistence", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: nodeRef.firstHouse(), mode: "append", replace: "（回读校验）" }],
  });
  await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  const result = page.adapter.dispatch({ action: "report_readback", nodeRefs: [nodeRef.firstHouse(), nodeRef.secondHouse()], reportIdentity: identity });
  assert.equal(result.ok, true);
  assert.match(result.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(result.nodes.length, 2);
  for (const node of result.nodes) {
    assert.match(node.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
    assert.ok(node.textPreview.length <= 300);
  }
  assert.ok(result.nodes[0].textPreview.includes("（回读校验）"));
  const serialized = JSON.stringify(result);
  assert.equal(/persist/i.test(serialized), false);
  assert.equal(serialized.includes("持久化成功"), false);
  assert.equal(serialized.includes('"saved":true'), false);
});

test("status reports the capability matrix from real detection only", () => {
  const full = createPage();
  const matrix = full.adapter.status();
  assert.equal(matrix.adapterVersion, "report-authoring-v2");
  assert.equal(matrix.inspectAvailable, true);
  assert.equal(matrix.treeAvailable, true);
  assert.equal(matrix.editorFramework, "contenteditable");
  assert.equal(matrix.editorModelAvailable, false);
  assert.equal(matrix.toolbarAvailable, true);
  assert.equal(matrix.structureOpsAvailable, true);
  assert.deepEqual(plain(matrix.structureOperations), { addChild: true, addSibling: true, copy: true, delete: true, moveUp: true, moveDown: true });
  assert.equal(matrix.settingsAvailable, true);
  assert.equal(matrix.settingsWriteSupported, true);
  assert.deepEqual(plain(matrix.settingsWritableFields), ["是否编号=是"]);
  assert.equal(matrix.writeGateOpen, false);
  assert.equal(matrix.writesSupported, false);
  assert.equal(matrix.livePageVerified, false);
  assert.equal(matrix.writeEnabled, false);

  const bare = createPage({ toolbar: false, inlineIcons: false });
  const bareMatrix = bare.adapter.status();
  // 结构工具栏关闭后页面仍有编辑器工具栏；toolbarAvailable 反映真实检测，结构操作能力必须为 false
  assert.equal(bareMatrix.toolbarAvailable, true);
  assert.equal(bareMatrix.structureOpsAvailable, false);

  const disabled = createPage({ toolbar: { disabled: ["delete"] }, inlineIcons: false });
  assert.equal(disabled.adapter.status().structureOpsAvailable, true);
  assert.equal(disabled.adapter.status().structureOperations.delete, false);
  assert.equal(disabled.adapter.status().structureOperations.moveUp, true);

  // 行内图标存在即具备结构操作能力（工具栏缺失或禁用不影响）
  const inlineOnly = createPage({ toolbar: false });
  assert.equal(inlineOnly.adapter.status().structureOpsAvailable, true);
  assert.deepEqual(plain(inlineOnly.adapter.status().structureOperations), { addChild: true, addSibling: true, copy: true, delete: true, moveUp: false, moveDown: false });

  const withDialog = createPage();
  withDialog.helpers.openSettings("0");
  assert.equal(withDialog.adapter.status().settingsAvailable, true);

  const offRoute = createPage({ pathname: "/ty/operation/project-1/company-1/asset-based-approach/draft" });
  const offMatrix = offRoute.adapter.status();
  assert.equal(offMatrix.inspectAvailable, false);
  assert.equal(offMatrix.treeAvailable, false);
  assert.equal(offMatrix.editorFramework, "unknown");
  assert.equal(offMatrix.structureOpsAvailable, false);
  assert.equal(offMatrix.settingsWriteSupported, false);
  assert.deepEqual(plain(offMatrix.settingsWritableFields), []);
});

test("unlabelled Tianyuan tree-row controls map sibling, child, settings and delete by observed position", async () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan", assignCreatedIds: true });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const capabilities = page.adapter.status();
  assert.equal(capabilities.structureOpsAvailable, true);
  assert.deepEqual(plain(capabilities.structureOperations), { addChild: true, addSibling: true, copy: false, delete: true, moveUp: false, moveDown: false });
  assert.equal(capabilities.settingsAvailable, true);

  const siblingPlan = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "structure_add_sibling", nodeRef: nodeRef.conclusion(), title: "Connector同级演示" }] });
  const sibling = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: siblingPlan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true });
  assert.equal(sibling.results[0].createdNodeRef.label, "Connector同级演示");
  assert.ok(page.helpers.treeLabels().includes("Connector同级演示"));
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "add-sibling"));

  const childPlan = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "Connector子节点演示" }] });
  const child = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: childPlan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true });
  assert.equal(child.results[0].createdNodeRef.label, "Connector子节点演示");
  assert.ok(page.helpers.treeLabels().includes("Connector子节点演示"));
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "add-child"));

  const settingsPlan = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "settings_open", nodeRef: nodeRef.firstHouse() }] });
  assert.equal(settingsPlan.ok, true, JSON.stringify(settingsPlan.ops));
  const settings = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: settingsPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(settings.results[0].status, "verified");
  assert.equal(settings.security.writesPerformed, false);
  assert.equal(settings.security.uiStateChanged, true);
  const fields = await page.adapter.dispatch({ reportIdentity: identity, action: "report_node_read", nodeRef: nodeRef.firstHouse(), include: ["settings"] });
  assert.equal(fields.settings.available, true);
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "settings"));

  page.helpers.closeDialog();
  const deletePlan = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "structure_delete", nodeRef: nodeRef.secondHouse(), opConfirm: true }] });
  const deleted = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: deletePlan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true });
  assert.equal(deleted.results[0].status, "pendingVerify");
  assert.equal(page.helpers.treeLabels().filter((label) => label === "1.1 房屋建筑物").length, 1);
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "delete"));
});

test("status scans visible rows instead of assuming the first tree row owns controls", () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan" });
  page.state.nodes[0].contentEl.querySelector(".opt-area").remove();
  const capabilities = page.adapter.status();
  assert.deepEqual(plain(capabilities.structureOperations), { addChild: true, addSibling: true, copy: false, delete: true, moveUp: false, moveDown: false });
  assert.equal(capabilities.settingsAvailable, true);
});

test("unrelated node title metadata does not hide unlabelled tree actions", () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan" });
  page.state.nodes[0].contentEl.querySelector(".custom-tree-node").setAttribute("title", "报告正文节点");
  const capabilities = page.adapter.status();
  assert.equal(capabilities.structureOperations.addChild, true);
  assert.equal(capabilities.structureOperations.addSibling, true);
  assert.equal(capabilities.structureOperations.copy, false);
  assert.equal(capabilities.structureOperations.delete, true);
});

test("unlabelled Tianyuan tree-row controls fail closed when the delete control is missing", async () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan", treeRowControlsCount: 3 });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  assert.equal(page.adapter.status().structureOperations.delete, false);
  const plan = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "structure_delete", nodeRef: nodeRef.secondHouse(), opConfirm: true }] });
  const result = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true });
  assert.equal(result.results[0].error, "REPORT_TREE_ROW_CONTROL_LAYOUT_MISMATCH");
  assert.equal(result.security.readOnly, true);
  assert.equal(result.security.writesPerformed, false);
  assert.equal(page.helpers.treeLabels().includes("1.1 房屋建筑物"), true);
  assert.equal(page.journal.some((entry) => entry.kind === "inline-click"), false);
});

test("no response ever leaks the sensitive sample text planted in the fixture page", async () => {
  const secrets = ["Bearer super-secret-token-abc", "password=机密密码-123456", "验证码 998877"];
  const page = createPage({ tree: [
    {
      label: "一、密码与授权说明", expanded: true,
      editor: { framework: "contenteditable", text: `登录样例：Authorization: ${secrets[0]}；${secrets[1]}；${secrets[2]}。` },
      children: [{ label: "1.1 普通节点", editor: { framework: "contenteditable", text: "普通正文。" } }],
    },
    { label: "二、普通结论", editor: { framework: "quill", text: "结论正文。" } },
  ] });
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: ref("0/0", "1.1 普通节点"), reportIdentity: identity });
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: ref("0", "一、密码与授权说明"), reportIdentity: identity, timeoutMs: 2000 }).catch(() => {});
  const responses = [];
  responses.push(page.adapter.dispatch({ action: "report_inspect", reportIdentity: identity }));
  responses.push(await page.adapter.dispatch({ action: "report_node_read", nodeRef: ref("0/0", "1.1 普通节点"), reportIdentity: identity }));
  responses.push(page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "editor_text", nodeRef: ref("0/0", "1.1 普通节点"), mode: "append", replace: "x" }],
  }));
  responses.push(page.adapter.dispatch({ action: "report_readback", reportIdentity: identity }));
  responses.push(page.adapter.status());
  for (const secret of secrets) {
    for (const response of responses) {
      assert.equal(JSON.stringify(response).includes(secret), false, `leaked: ${secret}`);
    }
  }
  const inspect = responses[0];
  const hidden = inspect.tree.nodes.find((node) => node.nodePathKey === "0");
  assert.equal(hidden.label, "[已隐藏]");
});

// ———— v2 扩展能力：detailId / 行内结构操作 / 编辑器生命周期 / navigate 扩展 ————

test("identity exposes reportDetailId from location and every action verifies it when provided", async () => {
  const page = createPage({ detailId: "DET-42" });
  const inspect = page.adapter.dispatch({ action: "report_inspect", reportIdentity: { ...identity, reportDetailId: "DET-42" } });
  assert.equal(inspect.ok, true);
  assert.equal(inspect.reportIdentity.reportDetailId, "DET-42");
  // detailId 一致时动作放行
  const navigate = await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: { ...identity, reportDetailId: "DET-42" } });
  assert.equal(navigate.ok, true);
  // detailId 不一致 → REPORT_TARGET_MISMATCH
  const mismatch = page.adapter.dispatch({ action: "report_inspect", reportIdentity: { ...identity, reportDetailId: "OTHER-1" } });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "REPORT_TARGET_MISMATCH");
  // 页面无 detailId 时 identity 不含该字段；调用方提供则同样不匹配
  const bare = createPage();
  assert.equal("reportDetailId" in bare.adapter.dispatch({ action: "report_inspect", reportIdentity: identity }).reportIdentity, false);
  const forced = bare.adapter.dispatch({ action: "report_inspect", reportIdentity: { ...identity, reportDetailId: "DET-42" } });
  assert.equal(forced.ok, false);
  assert.equal(forced.reason, "REPORT_TARGET_MISMATCH");
});

test("structure_add_child clicks the row inline ⊕ icon and reads back the created child", async () => {
  const page = createPage();
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "1.1.3 新增房屋" }],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.ops[0].risk, "medium");
  assert.equal(plan.ops[0].summaryPath, "row-inline-add");
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].readback.exact, true);
  assert.equal(result.results[0].readback.childCountAfter, result.results[0].readback.childCountBefore + 1);
  assert.equal(result.results[0].createdNodeRef.label, "1.1.3 新增房屋");
  assert.equal(result.results[0].createdNodeRef.nodePathKey, "0/0/0");
  assert.ok(page.helpers.treeLabels().includes("1.1.3 新增房屋"));
  assert.equal(page.helpers.treeEditMode(), true);
  assert.equal(page.journal.filter((entry) => entry.kind === "tree-edit-mode").length, 1);
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "node-inline-icon" && entry.target.op === "add-child" && entry.target.path === "0/0"));
  assert.ok(page.journal.some((entry) => entry.kind === "structure" && entry.op === "add" && entry.position === "child"));
  // 拒绝：nodeRef 变化（label 不匹配）
  const stale = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add_child", nodeRef: { nodePathKey: "0/0", label: "已被改名的节点" }, title: "x" }],
  });
  assert.equal(stale.ops[0].error, "REPORT_NODE_CHANGED");
});

test("add-child preview requires the exact row action and a unique candidateId", () => {
  const missingControl = createPage({ toolbar: false, inlineIcons: "tianyuan", treeRowControlsCount: 1 });
  assert.equal(missingControl.adapter.status().structureOperations.addChild, false);
  const unavailable = missingControl.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "新增子节点" }],
  });
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.ops[0].error, /CONTROL|LAYOUT/);
  assert.equal(missingControl.journal.some((entry) => entry.kind === "inline-click"), false);

  const missingId = createPage().adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: ref("1", "二、评估结论"), title: "新增子节点" }],
  });
  assert.equal(missingId.ops[0].error, "REPORT_NODE_ID_REQUIRED");

  const duplicateIdPage = createPage();
  const duplicateRow = [...duplicateIdPage.dom.tree.querySelectorAll(".el-tree-node")]
    .find((element) => element.getAttribute("data-node-key") === "fixture-house-b");
  duplicateRow.setAttribute("data-node-key", "fixture-house-a");
  const duplicateId = duplicateIdPage.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "新增子节点" }],
  });
  assert.equal(duplicateId.ops[0].error, "REPORT_NODE_CHANGED");
});

test("add-child targets nested Vue click handlers and reports exact scoped tree readback", async () => {
  const page = createPage({
    toolbar: false,
    inlineIcons: "tianyuan",
    nestedAddChildHandler: true,
    svgTagNameLowercase: true,
    treeEditInitiallyActive: true,
    selectedPath: "0/0",
  });
  assert.equal(page.adapter.status().structureOperations.addChild, true);
  const plan = page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "嵌套事件子节点" }],
  });
  assert.equal(plan.ok, true, plan.ops?.[0]?.error);
  const result = await page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_execute",
    planHash: plan.planHash,
    confirmText: "确认执行报告结构修改",
    writeAuthorized: true,
    timeoutMs: 500,
  });
  const operation = result.results[0];
  assert.equal(result.status, "pendingVerify", "page-tree readback must not be reported as persistence verification");
  assert.equal(operation.readback.exact, true);
  assert.deepEqual(plain(operation.readback.children.map(({ nodePathKey, label }) => ({ nodePathKey, label }))), [
    { nodePathKey: "0/0/0", label: "嵌套事件子节点" },
  ]);
  assert.deepEqual(plain(operation.createdNodeRef), { nodePathKey: "0/0/0", label: "嵌套事件子节点", candidateId: null });
  assert.equal(page.helpers.treeLabels().filter((label) => label === "嵌套事件子节点").length, 1);
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "add-child" && entry.path === "0/0"));

  const repeated = await page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_execute",
    planHash: plan.planHash,
    confirmText: "确认执行报告结构修改",
    writeAuthorized: true,
  });
  assert.equal(repeated.reason, "REPORT_PLAN_ALREADY_EXECUTED");
  const duplicatePlan = page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "嵌套事件子节点" }],
  });
  assert.equal(duplicatePlan.ops[0].error, "REPORT_NODE_ALREADY_EXISTS");
  assert.equal(page.helpers.treeLabels().filter((label) => label === "嵌套事件子节点").length, 1);
});

test("add-child serializes concurrent plans for one parent", async () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan", treeEditInitiallyActive: true, selectedPath: "0/0" });
  const makePlan = () => page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "并发防重子节点" }],
  });
  const firstPlan = makePlan();
  const secondPlan = makePlan();
  const execute = (plan) => page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_execute",
    planHash: plan.planHash,
    confirmText: "确认执行报告结构修改",
    writeAuthorized: true,
    timeoutMs: 500,
  });
  const [first, second] = await Promise.all([execute(firstPlan), execute(secondPlan)]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.results?.[0]?.readback?.exact === true).length, 1);
  assert.equal(results.filter((item) => item.results?.[0]?.error === "REPORT_STRUCTURE_ADD_CHILD_IN_PROGRESS").length, 1);
  assert.equal(page.helpers.treeLabels().filter((label) => label === "并发防重子节点").length, 1);
});

test("add-child returns promptly on action timeout and never retries the consumed plan", async () => {
  const page = createPage({
    toolbar: false,
    inlineIcons: "tianyuan",
    treeEditInitiallyActive: true,
    selectedPath: "0/0",
    structureAddDelayMs: 400,
  });
  const plan = page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "延迟落树子节点" }],
  });
  const startedAt = Date.now();
  const timedOut = await page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_execute",
    planHash: plan.planHash,
    confirmText: "确认执行报告结构修改",
    writeAuthorized: true,
    timeoutMs: 220,
  });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(timedOut.results[0].status, "pendingVerify");
  assert.equal(timedOut.results[0].error, "REPORT_STRUCTURE_ADD_CHILD_TIMEOUT");
  assert.ok(elapsedMs < 1000, `timed out after ${elapsedMs}ms`);
  assert.equal(page.helpers.treeLabels().includes("延迟落树子节点"), false);

  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(page.helpers.treeLabels().filter((label) => label === "延迟落树子节点").length, 1);
  const repeated = await page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_execute",
    planHash: plan.planHash,
    confirmText: "确认执行报告结构修改",
    writeAuthorized: true,
  });
  assert.equal(repeated.reason, "REPORT_PLAN_ALREADY_EXECUTED");
  const duplicatePlan = page.adapter.dispatch({
    reportIdentity: identity,
    action: "report_preview",
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "延迟落树子节点" }],
  });
  assert.equal(duplicatePlan.ops[0].error, "REPORT_NODE_ALREADY_EXISTS");
});

test("structure operations reacquire the stable node after selection rerenders the tree row", async () => {
  const page = createPage({ toolbar: false, inlineIcons: "tianyuan", rerenderTreeOnSelect: true });
  const node = nodeRef.firstHouse();
  const preview = page.adapter.dispatch({ reportIdentity: identity, action: "report_preview", ops: [{ kind: "structure_add_child", nodeRef: node, title: "子节点重绘回归" }] });
  assert.equal(preview.ok, true, preview.ops?.[0]?.error);
  const result = await page.adapter.dispatch({ reportIdentity: identity, action: "report_execute", planHash: preview.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true });
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].readback?.via, "inline-icon");
  assert.equal(page.helpers.treeLabels().includes("子节点重绘回归"), true);
});

test("structure_add_sibling inserts after the siblingAnchor through the parent row path", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const missingAnchor = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add_sibling", nodeRef: null, title: "二点五、补充结论" }],
  });
  assert.equal(missingAnchor.ops[0].error, "REPORT_NODE_REF_INVALID");
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add_sibling", nodeRef: nodeRef.conclusion(), title: "二点五、补充结论" }],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.ops[0].summaryPath, "parent-row-add");
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  const labels = page.helpers.treeLabels();
  assert.ok(labels.includes("二点五、补充结论"));
  assert.ok(labels.indexOf("二点五、补充结论") > labels.indexOf("二、评估结论"));
  assert.ok(labels.indexOf("二点五、补充结论") < labels.indexOf("三、特殊事项说明"));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "node-inline-icon" && entry.target.op === "add-sibling" && entry.target.path === "1"));
});

test("structure_add_sibling recognizes a blank inline row without waiting for a title dialog", async () => {
  const page = createPage({ inlineIcons: "tianyuan", inlineSiblingNoDialog: true });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const anchor = nodeRef.conclusion();
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: "structure_add_sibling", nodeRef: anchor, title: "456" }] });
  assert.equal(plan.ok, true);
  const started = Date.now();
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity, timeoutMs: 250 });
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED");
  assert.equal(result.results[0].createdNodeRef.nodePathKey, "2");
  assert.equal(result.results[0].createdNodeRef.label, "节点1");
  assert.ok(result.results[0].createdNodeRef);
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "add-sibling"));
});

test("blank child and sibling nodes receive titles only through the exact content-ID model, save, and close", async () => {
  const cases = [
    { kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), path: "0/0/0" },
    { kind: "structure_add_sibling", nodeRef: nodeRef.conclusion(), path: "2" },
  ];
  for (const item of cases) {
    const page = createPage({
      inlineIcons: "tianyuan",
      inlineChildNoDialog: true,
      inlineSiblingNoDialog: true,
      inlineBlankStructureNodes: true,
      newNodeModelAvailable: true,
      newNodeModelDelayMs: 80,
      newNodeRequiresActivation: true,
      newNodeActivationRequiresDoubleClick: true,
    });
    await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 500 });
    const title = `新建标题-${item.kind}`;
    const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: item.kind, nodeRef: item.nodeRef, title }] });
    assert.equal(plan.ok, true, plan.ops?.[0]?.error);
    const result = await page.adapter.dispatch({
      action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true,
      reportIdentity: identity, timeoutMs: 500,
    });
    const operation = result.results[0];
    assert.equal(result.status, "pendingVerify", "reload persistence readback remains required");
    assert.equal(operation.error, undefined);
    assert.equal(operation.readback.exact, true);
    assert.equal(operation.readback.titleWrite.exactContentId, true);
    assert.equal(operation.readback.titleWrite.modelInput, true);
    assert.equal(operation.readback.titleWrite.saveToastVerified, true);
    assert.equal(operation.readback.titleWrite.editorClosed, true);
    const structureIndex = page.journal.findIndex((entry) => entry.kind === "structure" && entry.op === "add");
    const modelIndex = page.journal.findIndex((entry) => entry.kind === "editor-view-mounted" && entry.candidateId === "fixture-new-node");
    const activationIndex = page.journal.findIndex((entry) => entry.kind === "editor-activated" && entry.candidateId === "fixture-new-node");
    const inputIndex = page.journal.findIndex((entry) => entry.kind === "model-dispatch" && entry.candidateId === "fixture-new-node");
    assert.ok(structureIndex < modelIndex && modelIndex < activationIndex && activationIndex < inputIndex);
    const scrollIndex = page.journal.findIndex((entry) => entry.kind === "editor-scroll-into-view" && entry.candidateId === "fixture-new-node");
    const clickIndex = page.journal.findIndex((entry) => entry.kind === "editor-activation-attempt" && entry.candidateId === "fixture-new-node");
    const doubleClickIndex = page.journal.findIndex((entry) => entry.kind === "editor-activation-dblclick" && entry.candidateId === "fixture-new-node");
    assert.ok(scrollIndex < clickIndex && clickIndex < doubleClickIndex && doubleClickIndex < activationIndex && activationIndex < inputIndex);
    assert.equal(page.journal.filter((entry) => entry.kind === "editor-activation-attempt" && entry.candidateId === "fixture-new-node").length, 2);
    assert.equal(page.journal.filter((entry) => entry.kind === "editor-activation-dblclick" && entry.candidateId === "fixture-new-node").length, 1);
    assert.deepEqual(plain(operation.createdNodeRef), { nodePathKey: item.path, candidateId: "fixture-new-node", label: title });
    assert.ok(page.journal.some((entry) => entry.kind === "model-dispatch" && entry.candidateId === "fixture-new-node"));
    assert.ok(page.journal.some((entry) => entry.kind === "editor-save"));
    assert.ok(page.journal.some((entry) => entry.kind === "editor-closed" && entry.via === "close-link"));
  }
});

test("blank-node title write refuses duplicate IDs before model input or save", async () => {
  const page = createPage({
    inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true,
    newNodeModelAvailable: true, newNodeCandidateId: "fixture-house-a", newNodeRequiresActivation: true,
  });
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [
    { kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "不应写入的标题" },
  ] });
  assert.equal(plan.ok, true, plan.ops?.[0]?.error);
  const result = await page.adapter.dispatch({
    action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true,
    reportIdentity: identity, timeoutMs: 500,
  });
  assert.equal(result.status, "pendingVerify");
  assert.match(result.results[0].error, /^REPORT_STRUCTURE_(?:ADD_CHILD_TIMEOUT|CREATED_ID_UNVERIFIED)$/);
  assert.equal(page.journal.some((entry) => entry.kind === "model-dispatch"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-save"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-closed"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-activation-attempt"), false);
});

test("blank-node title refuses a pre-existing non-empty model before input or save", async () => {
  const page = createPage({
    inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true,
    newNodeModelAvailable: true, newNodeModelInitialText: "既有正文", newNodeRequiresActivation: true,
  });
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [
    { kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "不得覆盖" },
  ] });
  const result = await page.adapter.dispatch({
    action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true,
    reportIdentity: identity, timeoutMs: 500,
  });
  assert.equal(result.results[0].error, "REPORT_STRUCTURE_TITLE_EDITOR_NOT_EMPTY");
  assert.equal(page.journal.some((entry) => entry.kind === "model-dispatch"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-save"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-closed"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-activation-attempt"), false);
});

test("blank-node title times out before a delayed EditorView mounts and never writes afterward", async () => {
  const page = createPage({
    inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true,
    newNodeModelAvailable: true, newNodeModelDelayMs: 380,
  });
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [
    { kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "超时不得写入" },
  ] });
  const result = await page.adapter.dispatch({
    action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true,
    reportIdentity: identity, timeoutMs: 220,
  });
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_STRUCTURE_TITLE_MODEL_UNAVAILABLE");
  assert.equal(page.journal.some((entry) => entry.kind === "model-dispatch"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-save"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-closed"), false);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.ok(page.journal.some((entry) => entry.kind === "editor-view-mounted" && entry.candidateId === "fixture-new-node"));
  assert.equal(page.journal.some((entry) => entry.kind === "model-dispatch"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-save"), false);
});

test("blank-node title remains pending when exact read-only model does not activate", async () => {
  const page = createPage({
    inlineIcons: "tianyuan", inlineChildNoDialog: true, inlineBlankStructureNodes: true,
    newNodeModelAvailable: true, newNodeRequiresActivation: true, newNodeActivationRequiresDoubleClick: true, newNodeActivationDisabled: true,
  });
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [
    { kind: "structure_add_child", nodeRef: nodeRef.firstHouse(), title: "激活失败不得写入" },
  ] });
  const result = await page.adapter.dispatch({
    action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true,
    reportIdentity: identity, timeoutMs: 220,
  });
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_STRUCTURE_TITLE_ACTIVATION_UNVERIFIED");
  assert.equal(page.journal.filter((entry) => entry.kind === "editor-activation-attempt").length, 2);
  assert.equal(page.journal.filter((entry) => entry.kind === "editor-activation-dblclick").length, 1);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-activated"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "model-dispatch"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-save"), false);
  assert.equal(page.journal.some((entry) => entry.kind === "editor-closed"), false);
});

test("structure_delete clicks the row 🗑 icon and confirms the real dialog", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_delete", nodeRef: nodeRef.secondHouse(), opConfirm: true }],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(page.helpers.treeLabels().filter((label) => label === "1.1 房屋建筑物").length, 1);
  // 行内 🗑 点击 + 真实确认弹窗的确认按钮点击
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "node-inline-icon" && entry.target.op === "delete" && entry.target.path === "0/1"));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "dialog-button" && entry.target.dialog === "delete-confirm" && entry.target.role === "confirm"));
  // 拒绝：缺少 opConfirm
  const unconfirmed = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_delete", nodeRef: nodeRef.firstHouse() }],
  });
  const rejected = await page.adapter.dispatch({ action: "report_execute", planHash: unconfirmed.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(rejected.results[0].error, "REPORT_OP_CONFIRM_REQUIRED");
});

test("structure_delete verifies the target disappears when the page has no confirmation dialog", async () => {
  const page = createPage({ inlineIcons: "tianyuan", deleteConfirm: false });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const target = nodeRef.secondHouse();
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: target, opConfirm: true }] });
  assert.equal(plan.ok, true);
  const started = Date.now();
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity, timeoutMs: 250 });
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(page.helpers.treeLabels().filter((label) => label === "1.1 房屋建筑物").length, 1);
  assert.ok(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "delete"));
});

test("structure_delete refuses to use an unrelated dialog as its confirmation", async () => {
  const page = createPage({ inlineIcons: "tianyuan" });
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  page.helpers.openSettings("0/1");
  const plan = page.adapter.dispatch({ action: "report_preview", reportIdentity: identity, ops: [{ kind: "structure_delete", nodeRef: nodeRef.secondHouse(), opConfirm: true }] });
  assert.equal(plan.ok, true);
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.results[0].error, "REPORT_STRUCTURE_UNRELATED_DIALOG_OPEN");
  assert.equal(page.helpers.treeLabels().filter((label) => label === "1.1 房屋建筑物").length, 2);
});

test("structure_copy works through the inline copy icon and returns the new nodeRef", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_copy", nodeRef: nodeRef.conclusion() }],
  });
  assert.equal(plan.ok, true);
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].createdNodeRef.label, "二、评估结论（副本）");
  const labels = page.helpers.treeLabels();
  assert.ok(labels.includes("二、评估结论（副本）"));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "node-inline-icon" && entry.target.op === "copy" && entry.target.path === "1"));
  // 拒绝：nodeRef 变化
  const stale = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_copy", nodeRef: { nodePathKey: "9", label: "不存在" } }],
  });
  assert.equal(stale.ops[0].error, "REPORT_NODE_CHANGED");
});

test("settings_write only confirms 是否编号=是 and rejects other settings fields", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  page.helpers.openSettings("0/1");
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }],
  });
  assert.equal(plan.ok, true);
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.submissionAttempted, true);
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 1);
  // 编号联动范围：同级（0/0、0/1 均为"1.x"编号标题）
  assert.equal(result.results[0].linkage.renumberAffected, true);
  assert.equal(result.results[0].linkage.tocAffected, true);
  assert.equal(page.state.persistedSettingsByPath.get("0/1").是否编号, "是");
  page.helpers.openSettings("0/1");
  const unsupported = page.adapter.preview({
    reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "节点类型", value: "目录" }] }],
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.ops[0].error, "REPORT_SETTINGS_FIELD_UNSUPPORTED");
  assert.equal(unsupported.planHash, undefined);
  assert.equal(page.state.settingsByPath.get("0/1").节点类型, "正文");
  const disableNumbering = page.adapter.preview({
    reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "否" }] }],
  });
  assert.equal(disableNumbering.ops[0].error, "REPORT_SETTINGS_FIELD_UNSUPPORTED");
  assert.equal(disableNumbering.planHash, undefined);
  // 拒绝：白名单外字段
  const unknown = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "自定义字段", value: "x" }] }],
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.ops[0].error, "REPORT_SETTINGS_FIELD_UNKNOWN");
  assert.equal(unknown.planHash, undefined);
});

test("settings_open binds the nested Element dialog to the exact controlled node without data-node-key", async () => {
  const page = createPage({ settingsDialogDataNodeKey: false });
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.firstHouse() }] });
  assert.equal(plan.ok, true);
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].kind, "settings_open");
  assert.deepEqual(plain(result.results[0].readback), { settingsDialogOpen: true, targetVerified: true });
  const dialog = page.context.document.querySelector(".el-dialog");
  assert.equal(dialog.classList.contains("c-setting-module-attr"), true);
  assert.equal(dialog.parentElement.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("data-node-key"), null);
});

test("settings_open waits for strict row controls after re-entering tree edit mode", async () => {
  const page = createPage({ treeEditInitiallyActive: true, inlineIcons: "tianyuan", inlineIconsRequireTreeEditMode: true, inlineRowControlsDelayMs: 80, reloadClosesTreeEditMode: true });
  page.helpers.reloadSettings();
  assert.equal(page.helpers.treeEditMode(), false);
  assert.equal(page.context.document.querySelectorAll(".node-inline-icon").length, 0);
  const preview = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  assert.equal(preview.ok, true, JSON.stringify(plain(preview)));
  assert.equal(preview.ops[0].before, "树浏览态；属性设置弹窗关闭");
  assert.equal(preview.ops[0].after, "进入树编辑态；属性设置弹窗打开并核对目标节点");
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: preview.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.ok, true, JSON.stringify(plain(result)));
  assert.equal(result.results[0].status, "verified");
  assert.deepEqual(plain(result.results[0].readback), { settingsDialogOpen: true, targetVerified: true });
  assert.equal(page.helpers.treeEditMode(), true);
  assert.equal(page.journal.some((entry) => entry.kind === "tree-edit-mode" && entry.active === true), true);
  assert.equal(page.journal.some((entry) => entry.kind === "inline-click" && entry.op === "settings" && entry.path === "0/1"), true);
  const modeIndex = page.journal.findIndex((entry) => entry.kind === "tree-edit-mode" && entry.active === true);
  const controlsIndex = page.journal.findIndex((entry) => entry.kind === "tree-row-controls-mounted");
  const settingsIndex = page.journal.findIndex((entry) => entry.kind === "inline-click" && entry.op === "settings" && entry.path === "0/1");
  assert.ok(modeIndex < controlsIndex && controlsIndex < settingsIndex);
  assert.equal(page.journal.filter((entry) => entry.kind === "tree-edit-mode" && entry.active === true).length, 1);
});

test("numbering yes waits for the async radio readback, confirms exactly once, and remains pending until reload readback", async () => {
  const page = createPage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false, asyncSettingsRadio: true });
  const openPlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  const opened = await page.adapter.execute({ reportIdentity: identity, planHash: openPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(opened.ok, true);
  const dialog = page.context.document.querySelector(".el-dialog");
  assert.equal(dialog.querySelector("input[type='radio'][value='true']").checked, false);
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.reason, "REPORT_PERSISTENCE_UNVERIFIED");
  assert.equal(result.submissionAttempted, true);
  assert.equal(result.documentTimeOrigin, 1000);
  assert.deepEqual(plain(result.expectedFields), [{ label: "是否编号", value: "是" }]);
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].readback.settingsDialogClosed, true);
  assert.equal(result.results[0].readback.submissionAttempted, true);
  assert.deepEqual(plain(result.results[0].readback.fields.find((field) => field.label === "是否编号").selected), ["是"]);
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 1);
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-cancel").length, 0);
  assert.equal(page.state.persistedSettingsByPath.get("0/1").是否编号, "是");
  const origin = page.helpers.reloadSettings();
  assert.equal(origin, 1100);
  assert.equal(page.state.settingsByPath.get("0/1").是否编号, "是");
});

test("numbering yes remains pending and does not confirm when async radio readback times out", async () => {
  const page = createPage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false, asyncSettingsRadio: "never" });
  const openPlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  const opened = await page.adapter.execute({ reportIdentity: identity, planHash: openPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(opened.ok, true);
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, "pendingVerify");
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_SETTINGS_READBACK_MISMATCH");
  assert.equal(result.submissionAttempted, false);
  assert.equal(result.results[0].readback.submissionAttempted, false);
  assert.deepEqual(plain(result.results[0].readback.fields.find((field) => field.label === "是否编号").selected), ["否"]);
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 0);
  assert.equal(page.state.persistedSettingsByPath.get("0/1").是否编号, "否");
});

test("settings confirmation attempts never claim saved when dispatch fails or close times out", async () => {
  const failedClick = createPage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false });
  const failedOpenPlan = failedClick.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  const failedOpen = await failedClick.adapter.execute({ reportIdentity: identity, planHash: failedOpenPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(failedOpen.ok, true);
  const failedPlan = failedClick.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  const failedDialog = failedClick.context.document.querySelector(".el-dialog");
  const failedConfirm = failedDialog.querySelectorAll("button").find((button) => button.textContent === "确认");
  const originalDispatch = failedConfirm.dispatchEvent;
  failedConfirm.dispatchEvent = (event) => {
    if (event.type === "click") throw new Error("fixture click dispatch failed");
    return originalDispatch(event);
  };
  const failed = await failedClick.adapter.execute({ reportIdentity: identity, planHash: failedPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(failed.status, "pendingVerify");
  assert.equal(failed.results[0].status, "pendingVerify");
  assert.equal(failed.results[0].error, "REPORT_SETTINGS_CONFIRM_CLICK_FAILED");
  assert.equal(failed.submissionAttempted, true);
  assert.equal(failedClick.state.persistedSettingsByPath.get("0/1").是否编号, "否");

  const timedOut = createPage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false, settingsConfirmMode: "stay-open" });
  const timeoutOpenPlan = timedOut.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  const timeoutOpen = await timedOut.adapter.execute({ reportIdentity: identity, planHash: timeoutOpenPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(timeoutOpen.ok, true);
  const timeoutPlan = timedOut.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  const timeout = await timedOut.adapter.execute({ reportIdentity: identity, planHash: timeoutPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(timeout.status, "pendingVerify");
  assert.equal(timeout.results[0].status, "pendingVerify");
  assert.equal(timeout.results[0].error, "REPORT_SETTINGS_CONFIRM_TIMEOUT");
  assert.equal(timeout.results[0].readback.settingsDialogClosed, false);
  assert.equal(timeout.submissionAttempted, true);
  assert.equal(timedOut.journal.filter((entry) => entry.kind === "settings-confirm").length, 1);
  assert.equal(timedOut.state.persistedSettingsByPath.get("0/1").是否编号, "否");
});

test("cancelled settings dialog cannot be confirmed or attributed to its prior node after DOM reuse", async () => {
  const page = createPage({ settingsDialogDataNodeKey: false, reuseSettingsDialog: true });
  const openPlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.firstHouse() }] });
  const opened = await page.adapter.execute({ reportIdentity: identity, planHash: openPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(opened.ok, true);
  const originalDialog = page.context.document.querySelector(".el-dialog");
  const cancel = originalDialog.querySelectorAll("button").find((button) => button.textContent === "取消");
  cancel.dispatchEvent({ type: "pointerdown", bubbles: true });
  cancel.dispatchEvent({ type: "click", bubbles: true });
  const reusedDialog = page.helpers.openSettings("0/1");
  assert.equal(reusedDialog, originalDialog);
  const writePlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.firstHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  assert.equal(writePlan.ok, false);
  assert.equal(writePlan.ops[0].error, "REPORT_SETTINGS_TARGET_UNVERIFIED");
  const reopenedNodePlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  assert.equal(reopenedNodePlan.ok, false);
  assert.equal(reopenedNodePlan.ops[0].error, "REPORT_SETTINGS_TARGET_UNVERIFIED");
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 0);
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-cancel").length, 1);
});

test("settings_write refuses multiple exact confirmation buttons without dispatching any", async () => {
  const page = createPage({ settings: { "0/1": { 是否编号: "否" } }, settingsDialogDataNodeKey: false });
  const openPlan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_open", nodeRef: nodeRef.secondHouse() }] });
  await page.adapter.execute({ reportIdentity: identity, planHash: openPlan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  const dialog = page.context.document.querySelector(".el-dialog");
  const duplicate = page.context.document.createElement("button");
  duplicate.textContent = "确认";
  dialog.append(duplicate);
  const plan = page.adapter.preview({ reportIdentity: identity, ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }] });
  const result = await page.adapter.execute({ reportIdentity: identity, planHash: plan.planHash, confirmText: "确认执行报告修改", writeAuthorized: true });
  assert.equal(result.submissionAttempted, false);
  assert.equal(result.results[0].status, "pendingVerify");
  assert.equal(result.results[0].error, "REPORT_SETTINGS_CONFIRM_NOT_FOUND");
  assert.equal(page.journal.filter((entry) => entry.kind === "settings-confirm").length, 0);
  assert.equal(page.state.persistedSettingsByPath.get("0/1").是否编号, "否");
});

test("settings_write rejects an unassociated dialog even when its node is selected", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "select", nodeRef: nodeRef.secondHouse(), reportIdentity: identity });
  const dialog = page.helpers.openSettings("0/1");
  dialog.removeAttribute("data-node-key");
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "settings_write", nodeRef: nodeRef.secondHouse(), fields: [{ label: "是否编号", value: "是" }] }],
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.ops[0].error, "REPORT_SETTINGS_TARGET_UNVERIFIED");
});

test("editor_open clicks the node, verifies the three links and toolbar buttons", async () => {
  const page = createPage();
  const result = await page.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(result.ok, true, result.reason || "");
  assert.equal(result.editorOpen, true);
  assert.deepEqual(plain(result.links), { close: true, save: true, preview: true });
  assert.equal(result.association, "selected-panel");
  for (const command of ["bold", "italic", "underline", "strikethrough", "font_increase", "font_decrease", "font_color", "align_center", "align_left", "align_right", "align_justify", "indent", "outdent", "table", "image", "formula", "field", "reference", "list_ordered", "list_unordered", "undo", "redo", "subscript", "superscript"]) {
    assert.ok(result.toolbarButtons.includes(command), command);
  }
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "tree-node-content" && entry.target.path === "0/0"));
  assert.ok(page.journal.some((entry) => entry.kind === "select" && entry.path === "0/0"));
  // 拒绝：多个编辑器可见时歧义
  const ambiguous = createPage({ editors: "all" });
  const ambiguousResult = await ambiguous.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity, timeoutMs: 500 });
  assert.equal(ambiguousResult.ok, false);
  assert.equal(ambiguousResult.reason, "REPORT_EDITOR_AMBIGUOUS");
  assert.equal(ambiguousResult.security.uiStateChanged, true);
  // 拒绝：无编辑器
  const none = createPage({ editors: "none" });
  const noneResult = await none.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity, timeoutMs: 500 });
  assert.equal(noneResult.ok, false);
  assert.equal(noneResult.reason, "REPORT_EDITOR_NOT_FOUND");
  assert.equal(noneResult.security.uiStateChanged, true);
});

test("editor_open accepts a verified editable model without a recognized toolbar", async () => {
  const page = createPage({ toolbar: false, editorToolbar: false, editorModelEditable: true, tree: [
    { label: "测试节点", dataKey: "test-node", selected: true, editor: { framework: "prosemirror", text: "原文" } },
  ] });
  const nodeRef = { nodePathKey: "0", label: "测试节点", candidateId: "test-node" };
  const result = await page.adapter.dispatch({ action: "report_editor_open", nodeRef, reportIdentity: identity, timeoutMs: 500 });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(plain(result.toolbarButtons), []);
  const unverified = createPage({ toolbar: false, editorToolbar: false });
  const rejected = await unverified.adapter.dispatch({ action: "report_editor_open", nodeRef: { nodePathKey: "0/0", label: "1.1 房屋建筑物", candidateId: "fixture-house-a" }, reportIdentity: identity, timeoutMs: 500 });
  assert.equal(rejected.reason, "REPORT_EDITOR_NOT_FOUND");
});

test("direct editor commands require a preview and never click the toolbar", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const bold = await page.adapter.dispatch({ action: "report_editor_command", command: "bold", reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改" });
  assert.equal(bold.reason, "REPORT_PREVIEW_REQUIRED");
  const table = await page.adapter.dispatch({ action: "report_editor_command", command: "table", reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改" });
  assert.equal(table.reason, "REPORT_PREVIEW_REQUIRED");
  const undo = await page.adapter.dispatch({ action: "report_editor_command", command: "undo", reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改" });
  assert.equal(undo.reason, "REPORT_COMMAND_UNSUPPORTED");
  const unsupported = await page.adapter.dispatch({ action: "report_editor_command", command: "tt", reportIdentity: identity, writeAuthorized: true, confirmText: "确认执行报告修改" });
  assert.equal(unsupported.reason, "REPORT_COMMAND_UNSUPPORTED");
  assert.equal(page.journal.some((entry) => entry.kind === "editor-command"), false);
});

test("editor_save clicks the save link once and reports pendingVerify without evidence", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const unauthorized = await page.adapter.dispatch({ action: "report_editor_save", writeAuthorized: false, confirmText: "确认保存报告", reportIdentity: identity });
  assert.equal(unauthorized.reason, "REPORT_WRITE_NOT_AUTHORIZED");
  const result = await page.adapter.dispatch({ action: "report_editor_save", writeAuthorized: true, confirmText: "确认保存报告", reportIdentity: identity, timeoutMs: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, "pendingVerify");
  assert.ok(result.uiEvidence.sample.includes("保存成功"));
  assert.ok(page.journal.some((entry) => entry.kind === "editor-save" && entry.path === "0/0"));
  // 失败模式：toast 为"保存失败"，证据不足 → pendingVerify，绝不重试
  const failing = createPage({ editorSaveMode: "fail" });
  await failing.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const failed = await failing.adapter.dispatch({ action: "report_editor_save", writeAuthorized: true, confirmText: "确认保存报告", reportIdentity: identity, timeoutMs: 500 });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, "pendingVerify");
  assert.equal(failed.reason, "REPORT_SAVE_UNVERIFIED");
  const saves = failing.journal.filter((entry) => entry.kind === "editor-save");
  assert.equal(saves.length, 1);
  // 超时模式：无任何指示 → pendingVerify
  const timing = createPage({ editorSaveMode: "timeout" });
  await timing.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const timedOut = await timing.adapter.dispatch({ action: "report_editor_save", writeAuthorized: true, confirmText: "确认保存报告", reportIdentity: identity, timeoutMs: 300 });
  assert.equal(timedOut.status, "pendingVerify");
});

test("editor_close collapses the editor and asks the caller about unsaved changes", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const result = await page.adapter.dispatch({ action: "report_editor_close", reportIdentity: identity });
  assert.equal(result.ok, true);
  assert.equal(result.editorClosed, true);
  assert.equal(result.discarded, false);
  assert.ok(page.journal.some((entry) => entry.kind === "editor-closed" && entry.path === "0/0"));
  // 回读：编辑框已收起（node_read 不再能定位编辑器）
  const readbackAfterClose = await page.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(readbackAfterClose.ok, false);

  // 有未保存更改确认框：默认不代决 → REPORT_UNSAVED_CHANGES 且编辑框保持原样
  const confirmPage = createPage({ editorCloseConfirm: true });
  await confirmPage.adapter.dispatch({ action: "report_editor_open", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  const ask = await confirmPage.adapter.dispatch({ action: "report_editor_close", reportIdentity: identity, timeoutMs: 1000 });
  assert.equal(ask.ok, false);
  assert.equal(ask.reason, "REPORT_UNSAVED_CHANGES");
  assert.equal(ask.confirmDialogPresent, true);
  assert.ok(confirmPage.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "editor-link" && entry.target.link === "close"));
  assert.equal(confirmPage.helpers.editorText("0/0"), "房屋建筑物位于示例路 1 号。");
  // discardConfirmed：点击真实"不保存"按钮后收起
  const discard = await confirmPage.adapter.dispatch({ action: "report_editor_close", discardConfirmed: true, reportIdentity: identity, timeoutMs: 1000 });
  assert.equal(discard.ok, false, JSON.stringify(discard));
  assert.equal(discard.reason, "REPORT_DISCARD_UNSUPPORTED");
  assert.equal(confirmPage.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "dialog-button" && entry.target.dialog === "close-confirm" && entry.target.role === "discard"), false);
  // 丢弃后编辑框已收起
  const readbackAfterDiscard = await confirmPage.adapter.dispatch({ action: "report_node_read", nodeRef: nodeRef.firstHouse(), reportIdentity: identity });
  assert.equal(readbackAfterDiscard.ok, true);
});

test("navigate expand_all and collapse_all click the real header buttons", async () => {
  const page = createPage();
  const expand = await page.adapter.dispatch({ action: "report_navigate", op: "expand_all", reportIdentity: identity, timeoutMs: 1500 });
  assert.equal(expand.ok, true, expand.reason || "");
  assert.equal(expand.expandedAll, true);
  assert.ok(page.helpers.treeLabels().includes("1.2.1 空调设备"));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "tree-control" && entry.target.op === "expand-all"));
  assert.ok(page.journal.some((entry) => entry.kind === "expand-all"));
  const collapse = await page.adapter.dispatch({ action: "report_navigate", op: "collapse_all", reportIdentity: identity });
  assert.equal(collapse.ok, true, collapse.reason || "");
  assert.equal(collapse.collapsedAll, true);
  assert.equal(page.helpers.treeLabels().includes("1.1 房屋建筑物"), false);
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "click" && entry.target?.kind === "tree-control" && entry.target.op === "collapse-all"));
  // 拒绝：无关键词的 search
  const badSearch = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "   ", reportIdentity: identity });
  assert.equal(badSearch.ok, false);
  assert.equal(badSearch.reason, "REPORT_NAVIGATE_OP_INVALID");
});

test("navigate enter_edit_mode uses the exact tree edit control and verifies the mode change", async () => {
  const page = createPage();
  const entered = await page.adapter.dispatch({ action: "report_navigate", op: "enter_edit_mode", reportIdentity: identity });
  assert.equal(entered.ok, true);
  assert.equal(entered.treeEditMode, "active");
  assert.equal(page.helpers.treeEditMode(), true);
  assert.equal(page.journal.filter((entry) => entry.kind === "tree-edit-mode").length, 1);
  const again = await page.adapter.dispatch({ action: "report_navigate", op: "enter_edit_mode", reportIdentity: identity });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyActive, true);
  assert.equal(page.journal.filter((entry) => entry.kind === "tree-edit-mode").length, 1);
});

test("navigate search filters through the real input event and reads back the filtered tree", async () => {
  const page = createPage();
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "房屋", reportIdentity: identity, timeoutMs: 1500 });
  assert.equal(result.ok, true, result.reason || "");
  assert.equal(result.keyword, "房屋");
  const labels = result.tree.nodes.map((node) => node.label);
  assert.deepEqual(plain(labels), ["一、评估对象与范围", "1.1 房屋建筑物", "1.1 房屋建筑物"]);
  // 真实 input 事件 journal
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "input" && entry.target?.kind === "node-search-input"));
  assert.ok(page.journal.some((entry) => entry.kind === "search-filter" && entry.keyword === "房屋"));
  // 未展开结果外的节点：树中不应出现懒加载子节点
  assert.equal(labels.includes("1.2.1 空调设备"), false);
  // 恢复：清空关键词后树复原
  const reset = await page.adapter.dispatch({ action: "report_navigate", op: "clear_search", reportIdentity: identity });
  assert.equal(reset.ok, true);
  assert.ok(reset.tree.nodes.some((node) => node.label === "二、评估结论"));
  const empty = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "不存在的节点", reportIdentity: identity });
  assert.equal(empty.ok, true);
  assert.equal(empty.tree.nodes.length, 0);
  const clear = await page.adapter.dispatch({ action: "report_navigate", op: "clear_search", reportIdentity: identity });
  assert.equal(clear.ok, true);
  const unchanged = createPage({ unresponsive: true });
  const unverified = await unchanged.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "不存在的节点", reportIdentity: identity, timeoutMs: 300 });
  assert.equal(unverified.ok, false);
  assert.equal(unverified.reason, "REPORT_SEARCH_UNVERIFIED");
  assert.equal(unverified.uiStateChanged, true);
});

test("navigate search and clear_search use Enter keyCode 13 and wait for delayed filtering", async () => {
  const page = createPage({
    tree: [{ label: "456 待筛选标题" }, { label: "其他标题" }],
    searchRequiresEnter: true,
    searchDelayMs: 90,
  });
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "456", reportIdentity: identity, timeoutMs: 1200 });
  assert.equal(result.ok, true, result.reason || "");
  assert.deepEqual(plain(result.tree.nodes.map((node) => node.label)), ["456 待筛选标题"]);
  assert.ok(page.journal.some((entry) => entry.kind === "search-keydown" && entry.keyCode === 13 && entry.which === 13));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "change" && entry.target?.kind === "node-search-input"));
  assert.ok(page.journal.some((entry) => entry.kind === "event" && entry.eventType === "blur" && entry.target?.kind === "node-search-input"));
  assert.ok(page.journal.some((entry) => entry.kind === "search-filter" && entry.keyword === "456"));

  const cleared = await page.adapter.dispatch({ action: "report_navigate", op: "clear_search", reportIdentity: identity, timeoutMs: 1200 });
  assert.equal(cleared.ok, true, cleared.reason || "");
  assert.equal(cleared.treeRestored, true);
  assert.ok(cleared.tree.nodes.some((node) => node.label === "其他标题"));
});

test("navigate search remains unverified when input events never filter the tree", async () => {
  const page = createPage({ searchRequiresEnter: true, searchEnterEnabled: false });
  const before = page.helpers.treeLabels();
  const result = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "456", reportIdentity: identity, timeoutMs: 300 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REPORT_SEARCH_UNVERIFIED");
  assert.deepEqual(page.helpers.treeLabels(), before);
  assert.equal(page.journal.some((entry) => entry.kind === "search-filter"), false);
});

test("clear_search remains unverified when the filtered tree is not restored", async () => {
  const page = createPage({
    tree: [{ label: "456 待清除标题" }, { label: "其他标题" }],
    searchRequiresEnter: true,
    searchDelayMs: 20,
  });
  const filtered = await page.adapter.dispatch({ action: "report_navigate", op: "search", keyword: "456", reportIdentity: identity, timeoutMs: 1200 });
  assert.equal(filtered.ok, true, filtered.reason || "");
  page.helpers.setUnresponsive(true);
  const cleared = await page.adapter.dispatch({ action: "report_navigate", op: "clear_search", reportIdentity: identity, timeoutMs: 300 });
  assert.equal(cleared.ok, false);
  assert.equal(cleared.reason, "REPORT_SEARCH_UNVERIFIED");
  assert.equal(cleared.treeRestored, false);
});

test("structure ops work after lazy children are loaded", async () => {
  const page = createPage();
  await page.adapter.dispatch({ action: "report_navigate", op: "expand", nodeRef: nodeRef.lazy(), reportIdentity: identity, timeoutMs: 1500 });
  const plan = page.adapter.dispatch({
    action: "report_preview",
    reportIdentity: identity,
    ops: [{ kind: "structure_add_child", nodeRef: nodeRef.lazy(), title: "1.2.3 懒加载后新增" }],
  });
  const result = await page.adapter.dispatch({ action: "report_execute", planHash: plan.planHash, confirmText: "确认执行报告结构修改", writeAuthorized: true, reportIdentity: identity });
  assert.equal(result.ok, false, JSON.stringify(result.results));
  assert.equal(result.results[0].status, "pendingVerify");
  assert.ok(page.helpers.treeLabels().includes("1.2.3 懒加载后新增"));
  assert.equal(result.results[0].createdNodeRef.nodePathKey, "0/2/2");
});

test("fixture and adapter sources contain no eval or Function constructor", () => {
  for (const source of [adapterSource, fs.readFileSync(path.join(root, "tests/helpers/report-page-fixture.cjs"), "utf8")]) {
    assert.equal(/\beval\s*\(/.test(source), false);
    assert.equal(/\bnew\s+Function\b/.test(source), false);
    assert.equal(/\bFunction\s*\(\s*["']/.test(source), false);
  }
});
