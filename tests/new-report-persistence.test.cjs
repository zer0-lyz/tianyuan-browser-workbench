"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "extension/src/injected/page_adapter.js"), "utf8");
const adapterVersion = source.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1];
const buildId = source.match(/const EXTENSION_BUILD_ID = "([^"]+)"/)?.[1];
const contextRequestType = `TIANYUAN_WORKBENCH_GET_CONTEXT:${adapterVersion}`;
const contextResponseType = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${adapterVersion}`;
const actionRequestType = `TIANYUAN_WORKBENCH_RUN_ACTION:${adapterVersion}`;
const actionResponseType = `TIANYUAN_WORKBENCH_ACTION_RESULT:${adapterVersion}`;

class FakeEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
}

class FakeXMLHttpRequest {
  constructor() { this.listeners = new Map(); this.status = 0; this.responseText = ""; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  open(method, url) { this.method = method; this.url = url; }
  send() {
    this.status = this.onSave?.() === false ? 500 : 200;
    this.responseText = JSON.stringify(this.status === 200 ? { code: 200, data: { saved: true } } : { code: 500, message: "保存失败" });
    this.listeners.get("loadend")?.();
  }
}

class FakeNode {
  constructor(tagName, text = "", attributes = {}) {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = tagName.toUpperCase();
    this.nodeValue = this.nodeType === 3 ? String(text) : null;
    this.data = this.nodeValue;
    this.attributes = { ...attributes };
    this.childNodes = [];
    this.parentNode = null;
    this.parentElement = null;
    this.style = { setProperty: (name, value) => { this.style[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value; } };
    this.hidden = false;
    this.offsetWidth = 1;
    this.offsetHeight = 1;
  }
  get id() { return this.attributes.id || ""; }
  get children() { return this.childNodes.filter((child) => child.nodeType === 1); }
  get isContentEditable() {
    if (this.attributes.contenteditable === "false") return false;
    if (this.attributes.contenteditable === "true" || this.attributes.contenteditable === "") return true;
    return this.parentElement?.isContentEditable === true;
  }
  get textContent() {
    return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this.childNodes = [];
    if (value) this.appendChild(new FakeNode("#text", value));
  }
  get innerText() { return this.textContent; }
  get rows() { return this.tagName === "TABLE" ? this.querySelectorAll("tr") : undefined; }
  get cells() { return this.tagName === "TR" ? this.querySelectorAll("th,td") : undefined; }
  getClientRects() { return [{}]; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    child.parentNode = this;
    child.parentElement = this.nodeType === 1 ? this : null;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    child.parentElement = null;
    return child;
  }
  querySelectorAll(selector) { return descendants(this).filter((node) => matchesSelector(node, selector)); }
  closest() { return null; }
  scrollIntoView() {}
  dispatchEvent() { return true; }
  click() { this.onClick?.(); }
}

function descendants(root) {
  return root.childNodes.flatMap((child) => child.nodeType === 1 ? [child, ...descendants(child)] : []);
}

function matchesSelector(node, selector) {
  return String(selector).split(",").map((item) => item.trim()).some((item) => {
    if (/^[a-z]+$/i.test(item)) return node.tagName === item.toUpperCase();
    if (item === "[contenteditable]") return node.getAttribute("contenteditable") !== null;
    if (item === "[role='button']") return node.getAttribute("role") === "button";
    if (item === "[data-action]") return node.getAttribute("data-action") !== null;
    if (item === "[data-command]") return node.getAttribute("data-command") !== null;
    if (item === "[data-event]") return node.getAttribute("data-event") !== null;
    if (item === "[data-testid]") return node.getAttribute("data-testid") !== null;
    if (item === "input[type='button']" || item === "input[type='submit']") return node.tagName === "INPUT";
    return false;
  });
}

function makeRange(node, offset) {
  return {
    startContainer: node,
    startOffset: offset,
    endContainer: node,
    endOffset: offset,
    collapsed: true,
  };
}

function makeModelNode(type, content = [], text = "") {
  return { type, content, text, nodeSize: 1 + content.reduce((sum, child) => sum + Number(child.nodeSize || 1), 0) };
}

function makeTableDom(node) {
  const table = new FakeNode("table");
  const body = new FakeNode("tbody");
  table.appendChild(body);
  for (const rowNode of node.content || []) {
    const row = new FakeNode("tr");
    body.appendChild(row);
    for (const cellNode of rowNode.content || []) {
      const cell = new FakeNode("td");
      const paragraph = cellNode.content?.[0];
      if (paragraph?.text) cell.appendChild(new FakeNode("#text", paragraph.text));
      row.appendChild(cell);
    }
  }
  return table;
}

function makeEmptyTableNode() {
  const cells = () => [makeModelNode("tableCell"), makeModelNode("tableCell"), makeModelNode("tableCell")];
  const rows = Array.from({ length: 4 }, () => makeModelNode("tableRow", cells()));
  return makeModelNode("table", rows);
}

function makeSchema() {
  const schemaNode = (type) => ({ create: (attrs, content) => makeModelNode(type, content || []) });
  return {
    nodes: {
      table: schemaNode("table"),
      tableRow: schemaNode("tableRow"),
      tableCell: schemaNode("tableCell"),
      paragraph: { create: (attrs, content) => makeModelNode("paragraph", content || [], content?.[0]?.text || "") },
    },
    text: (text) => makeModelNode("text", [], text),
  };
}

function createHarness({ saveOk = true, persisted = false, renderTable = true } = {}) {
  let serverHasTable = persisted;
  class HarnessXMLHttpRequest extends FakeXMLHttpRequest {}
  const body = new FakeNode("body");
  const editor = new FakeNode("div", "", { contenteditable: "true", role: "textbox", id: "report-editor" });
  const paragraph = new FakeNode("p");
  const textNode = new FakeNode("#text", "甲乙丙丁");
  paragraph.appendChild(textNode);
  editor.appendChild(paragraph);
  if (persisted) editor.insertBefore(makeTableDom(makeEmptyTableNode()), editor.childNodes[0]);
  body.appendChild(editor);

  const saveButton = new FakeNode("button");
  saveButton.textContent = "保存草稿";
  saveButton.onClick = () => {
    const request = new HarnessXMLHttpRequest();
    request.onSave = () => {
      if (saveOk) serverHasTable = editor.querySelectorAll("table").length === 1;
      return saveOk;
    };
    request.open("POST", "/ty/api/assignment_draft/seq/save");
    request.send();
  };
  body.appendChild(saveButton);

  const selection = {
    rangeCount: 0,
    isCollapsed: true,
    anchorNode: null,
    focusNode: null,
    range: null,
    toString() { return ""; },
    getRangeAt() { return this.range; },
    removeAllRanges() { this.rangeCount = 0; this.anchorNode = null; this.focusNode = null; this.range = null; },
    addRange(range) { this.rangeCount = 1; this.isCollapsed = range.collapsed; this.anchorNode = range.startContainer; this.focusNode = range.endContainer; this.range = range; },
  };
  const documentListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  let directInsertNodeCalls = 0;

  const schema = makeSchema();
  let modelDoc = makeModelNode("doc", [makeModelNode("paragraph", [makeModelNode("text", [], "甲乙丙丁")], "甲乙丙丁")]);
  if (persisted) modelDoc.content.unshift(makeEmptyTableNode());
  const view = {
    dom: editor,
    state: {
      schema,
      get doc() { return modelDoc; },
      get tr() {
        return {
          insert(position, node) { return { kind: "insert", position, node }; },
          replaceRangeWith(from, to, node) { return { kind: "insert", position: from, node }; },
          replaceSelectionWith(node) { return { kind: "insert", position: 1, node }; },
          setSelection(selection) { this.selection = selection; return this; },
          delete(from, to) { return { kind: "delete", from, to }; },
        };
      },
      selection: { empty: true, from: 1 },
      docNodeAt() { return { nodeSize: 1 }; },
    },
    posAtDOM() { return 1; },
    nodeDOM() { return editor.querySelectorAll("table")[0] || null; },
    dispatch(transaction) {
      if (transaction.kind === "insert") {
        modelDoc = makeModelNode("doc", [transaction.node, ...modelDoc.content]);
        if (renderTable) editor.insertBefore(makeTableDom(transaction.node), editor.childNodes[0] || null);
      }
      if (transaction.kind === "delete") {
        modelDoc = makeModelNode("doc", modelDoc.content.filter((node) => node !== modelDoc.content.find((candidate) => candidate.type === "table")));
        const table = editor.querySelectorAll("table")[0];
        if (table) table.parentElement.removeChild(table);
      }
    },
    focus() {},
  };
  editor.__vue__ = { editorView: view };

  const document = {
    title: "天源新报告测试",
    body,
    activeElement: editor,
    addEventListener(type, listener, capture) { documentListeners.set(`${type}:${capture}`, listener); },
    removeEventListener(type, listener, capture) { if (documentListeners.get(`${type}:${capture}`) === listener) documentListeners.delete(`${type}:${capture}`); },
    querySelector(selector) { return selector === ".spreadWrapper" ? null : null; },
    querySelectorAll(selector) {
      if (selector.startsWith("button") || selector.includes("input[type") || selector.includes("[role='button']")) return [saveButton];
      if (selector === "table") return body.querySelectorAll("table");
      return [editor, ...descendants(editor)].filter((node) => matchesSelector(node, selector));
    },
    contains(node) { let current = node; while (current) { if (current === body) return true; current = current.parentNode; } return false; },
    createElement(tagName) { return new FakeNode(tagName); },
    createTextNode(text) { return new FakeNode("#text", text); },
    createRange() { return { setStart() {}, setEnd() {}, collapse() {}, selectNodeContents() {}, insertNode() { directInsertNodeCalls += 1; }, deleteContents() {} }; },
  };
  const window = {
    getSelection() { return selection; },
    getComputedStyle(element) { return element.style; },
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    postMessage(message) { messages.push(message); },
  };
  const context = {
    document,
    window,
    location: { href: "https://excel.zhrdc.net/ty/operation/report-project/report-company/new-report/2/add", origin: "https://excel.zhrdc.net", pathname: "/ty/operation/report-project/report-company/new-report/2/add" },
    Event: FakeEvent,
    InputEvent: FakeEvent,
    MouseEvent: FakeEvent,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    XMLHttpRequest: HarnessXMLHttpRequest,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  function selectCaret() { selection.addRange(makeRange(textNode, 2)); }
  function contextSnapshot() {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "contextListener");
    listener({ source: window, data: { type: contextRequestType, requestId: "new-report-context" } });
    return messages.find((message) => message.type === contextResponseType)?.payload;
  }
  async function action(payload) {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "actionListener");
    await listener({ source: window, data: { type: actionRequestType, requestId: "new-report-action", payload } });
    return messages.find((message) => message.type === actionResponseType)?.payload;
  }
  return {
    editor,
    selectCaret,
    contextSnapshot,
    action,
    serverSnapshot() { return { hasTable: serverHasTable }; },
    modelTableCount() { return modelDoc.content.filter((node) => node.type === "table").length; },
    directInsertNodeCalls() { return directInsertNodeCalls; },
  };
}

function basePayload(context, overrides = {}) {
  return {
    sessionId: "new-report-session",
    bindingId: "new-report-binding",
    projectId: "report-project",
    threadId: "new-report-thread",
    tabId: 12,
    blockId: context.editingBlock.blockId,
    expectedHash: context.editingBlock.currentHash,
    caretReference: context.editingBlock.caretReference,
    tableAction: "insert",
    rowCount: 4,
    columnCount: 3,
    cells: [[], [], [], []],
    ...overrides,
  };
}

test("new report inserts through the editor model, saves through seq/save, and reads back after reload", async () => {
  assert.match(buildId, /^0\.14\.25-2026082803$/);
  const harness = createHarness();
  harness.selectCaret();
  const context = harness.contextSnapshot();
  assert.equal(context.route.isNewReportRoute, true);
  assert.equal(context.editingBlock.blockMode, "caret");
  const payload = basePayload(context);
  const preview = await harness.action({ ...payload, action: "table_preview" });
  assert.equal(preview.ok, true);
  assert.equal(harness.editor.querySelectorAll("table").length, 0);
  const execute = await harness.action({ ...payload, action: "table_execute", previewActionId: "new-report-insert", confirmText: "确认执行表格操作" });
  assert.equal(execute.ok, true);
  assert.equal(execute.save.ok, true);
  assert.equal(execute.save.saveNetwork.some((item) => item.url.includes("/assignment_draft/seq/save")), true);
  assert.equal(execute.readback.afterSave.rowCount, 4);
  assert.equal(execute.readback.afterSave.columnCount, 3);
  assert.equal(execute.modelVerification.verified, true);
  assert.equal(execute.modelVerification.type, "table");
  assert.equal(execute.modelVerification.rowCount, 4);
  assert.equal(execute.modelVerification.columnCount, 3);
  assert.equal(execute.modelVerification.transactionMethod, "replaceSelectionWith");
  assert.equal(harness.directInsertNodeCalls(), 0);
  assert.equal(harness.modelTableCount(), 1);
  assert.equal(execute.persistence.saveEndpoint, "/ty/api/assignment_draft/seq/save");
  assert.equal(execute.persistence.serverSaveConfirmed, true);
  assert.deepEqual(harness.serverSnapshot(), { hasTable: true });
  const repeated = await harness.action({ ...payload, action: "table_execute", previewActionId: "new-report-insert", confirmText: "确认执行表格操作" });
  assert.equal(repeated.ok, true);
  assert.equal(harness.editor.querySelectorAll("table").length, 1);

  const refreshed = createHarness({ persisted: true });
  const afterRefresh = await refreshed.action({
    ...payload,
    action: "table_readback",
    tableId: execute.readback.afterSave.tableId,
    expectedTableHash: execute.readback.afterSave.tableHash,
  });
  assert.equal(afterRefresh.ok, true);
  assert.equal(afterRefresh.table.rowCount, 4);
  assert.equal(afterRefresh.table.columnCount, 3);
  assert.equal(afterRefresh.matchesExpected, true);
});

test("new report rolls back the model table when seq/save fails", async () => {
  const harness = createHarness({ saveOk: false });
  harness.selectCaret();
  const context = harness.contextSnapshot();
  const execute = await harness.action({ ...basePayload(context), action: "table_execute", previewActionId: "new-report-failure", confirmText: "确认执行表格操作" });
  assert.equal(execute.ok, false);
  assert.equal(execute.reason, "REPORT_SAVE_NOT_CONFIRMED");
  assert.equal(execute.save.saveNetwork.some((item) => item.url.includes("/assignment_draft/seq/save")), true);
  assert.equal(execute.rollback.ok, true);
  assert.equal(harness.editor.querySelectorAll("table").length, 0);
  assert.deepEqual(harness.serverSnapshot(), { hasTable: false });
});

test("new report rejects a model-only insert and rolls back when the editor does not render it", async () => {
  const harness = createHarness({ renderTable: false });
  harness.selectCaret();
  const context = harness.contextSnapshot();
  const execute = await harness.action({ ...basePayload(context), action: "table_execute", previewActionId: "new-report-render-missing", confirmText: "确认执行表格操作" });
  assert.equal(execute.ok, false);
  assert.equal(execute.reason, "REPORT_TABLE_MODEL_RENDER_MISSING");
  assert.equal(execute.modelVerification.verified, true);
  assert.equal(execute.modelVerification.rowCount, 4);
  assert.equal(execute.rollback.ok, true);
  assert.equal(harness.modelTableCount(), 0);
  assert.equal(harness.editor.querySelectorAll("table").length, 0);
});
