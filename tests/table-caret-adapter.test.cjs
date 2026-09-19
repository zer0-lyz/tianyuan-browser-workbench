"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "extension/src/injected/page_adapter.js"), "utf8");
const adapterVersion = source.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1];
const requestType = `TIANYUAN_WORKBENCH_GET_CONTEXT:${adapterVersion}`;
const responseType = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${adapterVersion}`;
const actionType = `TIANYUAN_WORKBENCH_RUN_ACTION:${adapterVersion}`;
const actionResponseType = `TIANYUAN_WORKBENCH_ACTION_RESULT:${adapterVersion}`;

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
  set id(value) { this.attributes.id = String(value); }
  get children() { return this.childNodes.filter((child) => child.nodeType === 1); }
  get isContentEditable() { return this.attributes.contenteditable === "true" || this.attributes.contenteditable === ""; }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((child) => child.textContent).join(""); }
  set textContent(value) { this.childNodes = []; if (value !== "") this.appendChild(new FakeNode("#text", value)); }
  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getClientRects() { return [{}]; }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    child.parentNode = this;
    child.parentElement = this.nodeType === 1 ? this : null;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }
  removeChild(child) { const index = this.childNodes.indexOf(child); if (index >= 0) this.childNodes.splice(index, 1); child.parentNode = null; child.parentElement = null; return child; }
  dispatchEvent() { return true; }
  closest(selector) {
    let current = this;
    while (current) {
      if (selector.includes("contenteditable") && current.getAttribute?.("contenteditable") != null) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) { return descendants(this).filter((node) => matchesSelector(node, selector)); }
}

function descendants(root) {
  return root.childNodes.flatMap((child) => child.nodeType === 1 ? [child, ...descendants(child)] : []);
}

function matchesSelector(node, selector) {
  const selectors = String(selector).split(",").map((item) => item.trim());
  return selectors.some((item) => {
    if (/^[a-z]+$/i.test(item)) return node.tagName === item.toUpperCase();
    if (item === "[contenteditable]") return node.getAttribute("contenteditable") !== null;
    if (item === "[role='button']") return node.getAttribute("role") === "button";
    return false;
  });
}

function makeRange() {
  let startContainer = null;
  let startOffset = 0;
  let endContainer = null;
  let endOffset = 0;
  return {
    get commonAncestorContainer() { return startContainer; },
    get collapsed() { return startContainer === endContainer && startOffset === endOffset; },
    get startContainer() { return startContainer; },
    get startOffset() { return startOffset; },
    setStart(node, offset) { startContainer = node; startOffset = offset; if (!endContainer) { endContainer = node; endOffset = offset; } },
    setEnd(node, offset) { endContainer = node; endOffset = offset; },
    collapse(toStart = true) { if (toStart) { endContainer = startContainer; endOffset = startOffset; } },
    selectNodeContents(node) { startContainer = node; startOffset = 0; endContainer = node; endOffset = node.childNodes.length; },
    insertNode(node) {
      const container = startContainer;
      if (!container) return;
      if (container.nodeType === 3) {
        const parent = container.parentNode;
        const index = parent.childNodes.indexOf(container);
        const before = new FakeNode("#text", container.nodeValue.slice(0, startOffset));
        const after = new FakeNode("#text", container.nodeValue.slice(startOffset));
        parent.removeChild(container);
        if (before.nodeValue) parent.childNodes.splice(index, 0, before), before.parentNode = parent, before.parentElement = parent;
        parent.childNodes.splice(index + (before.nodeValue ? 1 : 0), 0, node);
        node.parentNode = parent;
        node.parentElement = parent;
        if (after.nodeValue) { const afterIndex = parent.childNodes.indexOf(node) + 1; parent.childNodes.splice(afterIndex, 0, after); after.parentNode = parent; after.parentElement = parent; }
      } else {
        container.insertBefore(node, container.childNodes[startOffset] || null);
      }
    },
    deleteContents() {},
  };
}

function createHarness(caret) {
  const body = new FakeNode("body", "天源报告");
  const editor = new FakeNode("div", "", { contenteditable: "true", role: "textbox", id: "caret-editor" });
  const first = new FakeNode("p");
  const second = new FakeNode("p");
  first.appendChild(new FakeNode("#text", "甲乙丙"));
  second.appendChild(new FakeNode("#text", "丁戊己"));
  editor.appendChild(first);
  editor.appendChild(second);
  body.appendChild(editor);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  const selection = { rangeCount: 0, isCollapsed: true, anchorNode: null, focusNode: null, range: null, toString() { return ""; }, getRangeAt() { return this.range; }, removeAllRanges() { this.rangeCount = 0; this.anchorNode = null; this.focusNode = null; }, addRange(range) { this.rangeCount = 1; this.isCollapsed = range.collapsed; this.anchorNode = range.startContainer; this.focusNode = range.endContainer; this.range = range; } };
  if (caret) {
    const range = makeRange();
    range.setStart(caret.node, caret.offset);
    range.setEnd(caret.node, caret.offset);
    selection.addRange(range);
  }
  const document = {
    title: "光标表格测试",
    body,
    activeElement: caret ? editor : body,
    addEventListener(type, listener, capture) { documentListeners.set(`${type}:${capture}`, listener); },
    removeEventListener(type, listener, capture) { if (documentListeners.get(`${type}:${capture}`) === listener) documentListeners.delete(`${type}:${capture}`); },
    querySelector(selector) { return selector === ".spreadWrapper" ? null : null; },
    querySelectorAll(selector) { return descendants(body).filter((node) => matchesSelector(node, selector)); },
    contains(node) { let current = node; while (current) { if (current === body) return true; current = current.parentNode; } return false; },
    createElement(tagName) { return new FakeNode(tagName); },
    createTextNode(text) { return new FakeNode("#text", text); },
    createRange: makeRange,
  };
  const window = {
    getSelection() { return selection; },
    getComputedStyle(element) { return element.style; },
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    postMessage(message) { messages.push(message); for (const listener of windowListeners.get("message") || []) listener({ source: window, data: message }); },
  };
  const context = {
    document,
    window,
    location: { href: "https://excel.zhrdc.net/ty/operation/caret-project/page", origin: "https://excel.zhrdc.net", pathname: "/ty/operation/caret-project/page" },
    Event: class { constructor(type) { this.type = type; } },
    InputEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    XMLHttpRequest: class {},
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  function contextSnapshot() {
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "contextListener");
    listener({ source: window, data: { type: requestType, requestId: "caret-context" } });
    return messages.find((message) => message.type === responseType)?.payload;
  }
  async function action(payload) {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "actionListener");
    await listener({ source: window, data: { type: actionType, requestId: "caret-action", payload } });
    return messages.find((message) => message.type === actionResponseType)?.payload;
  }
  return { body, editor, first, second, selection, contextSnapshot, action };
}

function payloadFrom(harness, overrides = {}) {
  const context = harness.contextSnapshot();
  const block = context.editingBlock;
  return { sessionId: "caret-session", bindingId: "caret-binding", projectId: "caret-project", threadId: "caret-thread", tabId: 4, blockId: block.blockId, expectedHash: block.currentHash, caretReference: block.caretReference, tableAction: "insert", rowCount: 1, columnCount: 1, cells: [["测试"]], ...overrides };
}

async function insertAt(offset) {
  const harness = createHarness(null);
  const node = harness.first.childNodes[0];
  const range = makeRange();
  range.setStart(node, offset);
  range.setEnd(node, offset);
  harness.selection.addRange(range);
  const base = payloadFrom(harness);
  const preview = await harness.action({ ...base, action: "table_preview" });
  assert.equal(preview.ok, true);
  assert.equal(preview.block.mode, "caret");
  const execute = await harness.action({ ...base, action: "table_execute", previewActionId: "caret-preview", confirmText: "确认执行表格操作" });
  assert.equal(execute.reason, "TABLE_MEMORY_ONLY");
  assert.equal(execute.readback.ok, true);
  return harness;
}

test("table insertion uses caret at paragraph start, middle and end", async () => {
  for (const offset of [0, 1, 3]) {
    const harness = await insertAt(offset);
    const textNodes = harness.first.childNodes.filter((item) => item.nodeType === 3).map((item) => item.nodeValue);
    assert.deepEqual(textNodes, offset === 0 ? ["甲乙丙"] : offset === 1 ? ["甲", "乙丙"] : ["甲乙丙"]);
    assert.equal(harness.first.childNodes.filter((item) => item.tagName === "TABLE").length, 1);
    const tableIndex = harness.first.childNodes.findIndex((item) => item.tagName === "TABLE");
    assert.equal(tableIndex, offset === 0 ? 0 : offset === 1 ? 1 : 1);
  }
});

test("table insertion at paragraph boundary keeps both paragraphs and inserts between them", async () => {
  const harness = createHarness({ node: null, offset: 1 });
  const range = makeRange();
  range.setStart(harness.editor, 1);
  range.setEnd(harness.editor, 1);
  harness.selection.addRange(range);
  const base = payloadFrom(harness);
  const preview = await harness.action({ ...base, action: "table_preview" });
  assert.equal(preview.ok, true);
  const execute = await harness.action({ ...base, action: "table_execute", previewActionId: "caret-between-preview", confirmText: "确认执行表格操作" });
  assert.equal(execute.reason, "TABLE_MEMORY_ONLY");
  const tableIndex = harness.editor.childNodes.findIndex((item) => item.tagName === "TABLE");
  assert.equal(tableIndex, 1);
  assert.equal(harness.editor.childNodes.filter((item) => item.tagName === "P").length, 2);
});

test("table insertion at a caret preserves the requested 4 by 3 shape", async () => {
  const harness = createHarness(null);
  const node = harness.first.childNodes[0];
  const range = makeRange();
  range.setStart(node, 1);
  range.setEnd(node, 1);
  harness.selection.addRange(range);
  const cells = Array.from({ length: 4 }, (_, rowIndex) => Array.from({ length: 3 }, (_, columnIndex) => `${rowIndex + 1}-${columnIndex + 1}`));
  const base = payloadFrom(harness, { rowCount: 4, columnCount: 3, cells });
  const preview = await harness.action({ ...base, action: "table_preview" });
  assert.equal(preview.ok, true);
  assert.equal(preview.block.mode, "caret");
  const execute = await harness.action({ ...base, action: "table_execute", previewActionId: "caret-4x3-preview", confirmText: "确认执行表格操作" });
  assert.equal(execute.reason, "TABLE_MEMORY_ONLY");
  assert.equal(execute.readback.ok, true);
  assert.equal(execute.readback.after.rowCount, 4);
  assert.equal(execute.readback.after.columnCount, 3);
  assert.equal(harness.first.childNodes.findIndex((item) => item.tagName === "TABLE"), 1);
  assert.equal(execute.readback.after.cells[3][2].text, "4-3");
});

test("table insertion without a captured caret is rejected", async () => {
  const harness = createHarness(null);
  const result = await harness.action({ sessionId: "caret-session", bindingId: "caret-binding", projectId: "caret-project", threadId: "caret-thread", tabId: 4, blockId: "dom-caret:missing", expectedHash: "fnv1a32-00000000", tableAction: "insert", rowCount: 1, columnCount: 1, cells: [["测试"]], action: "table_preview" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TABLE_CARET_NOT_AVAILABLE");
});

console.log("Table caret adapter checks passed.");
