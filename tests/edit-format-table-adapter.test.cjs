"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "extension/src/injected/page_adapter.js"), "utf8");
const adapterVersion = source.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1];
const actionType = `TIANYUAN_WORKBENCH_RUN_ACTION:${adapterVersion}`;
const responseType = `TIANYUAN_WORKBENCH_ACTION_RESULT:${adapterVersion}`;

class FakeEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
}

class FakeXMLHttpRequest {
  constructor() { this.listeners = new Map(); this.status = 0; this.responseText = ""; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  open(method, url) { this.method = method; this.url = url; }
  send() { this.status = 200; this.responseText = JSON.stringify({ ok: true }); this.listeners.get("loadend")?.(); }
}

class FakeElement {
  constructor(tagName, text = "") {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.innerText = text;
    this.textContent = text;
    this.value = "";
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.isContentEditable = false;
    this.hidden = false;
    this.offsetWidth = 1;
    this.offsetHeight = 1;
    this.events = [];
  }
  get id() { return this.attributes.id || ""; }
  set id(value) { this.attributes.id = value; }
  get rows() { return this.tagName === "TABLE" ? this.querySelectorAll("tr") : undefined; }
  get cells() { return ["TR"].includes(this.tagName) ? this.querySelectorAll("th,td") : undefined; }
  getClientRects() { return [{}]; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); child.parentElement = this; if (child.tagName === "#TEXT") { this.innerText = child.textContent; this.textContent = child.textContent; } return child; }
  click() { this.onClick?.(); }
  querySelectorAll(selector) {
    const result = [];
    const wanted = selector.split(",").map((item) => item.trim().toUpperCase());
    const visit = (node) => {
      for (const child of node.children) {
        if (wanted.includes(child.tagName)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  closest() { return null; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
}

function createHarness(options = {}) {
  class HarnessXMLHttpRequest extends FakeXMLHttpRequest {}
  const block = new FakeElement("mark", "原文段落");
  block.id = "format-table-block";
  block.style.backgroundColor = "rgb(255, 255, 0)";
  block.isContentEditable = true;
  const body = new FakeElement("body", "资产基础法底稿");
  body.appendChild(block);
  const saveButton = new FakeElement("button", "保存");
  saveButton.onClick = () => {
    const request = new HarnessXMLHttpRequest();
    request.open("POST", "/ty/api/assignment_draft/save");
    request.send();
  };
  if (options.withSaveButton) body.appendChild(saveButton);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  const selection = { rangeCount: 0, isCollapsed: true, anchorNode: null, focusNode: null, toString() { return ""; }, removeAllRanges() { this.rangeCount = 0; this.isCollapsed = true; }, addRange() { this.rangeCount = 1; this.isCollapsed = false; } };
  const document = {
    title: "格式与表格测试",
    body,
    addEventListener(type, listener, capture) { documentListeners.set(`${type}:${capture}`, listener); },
    removeEventListener(type, listener, capture) { if (documentListeners.get(`${type}:${capture}`) === listener) documentListeners.delete(`${type}:${capture}`); },
    querySelector(selector) { return selector === ".spreadWrapper" ? null : null; },
    querySelectorAll(selector) {
      if (selector.startsWith("button")) return options.withSaveButton ? [saveButton] : [];
      if (selector.startsWith("mark,")) return [block];
      if (selector === "table") return body.querySelectorAll("table");
      return [];
    },
    contains(node) { return node === body || node === block || body.querySelectorAll("table,tr,td,th").includes(node); },
    createElement(tagName) { return new FakeElement(tagName); },
    createTextNode(text) { return new FakeElement("#text", String(text)); },
    createRange() {
      let target = null;
      return {
        selectNodeContents(element) { target = element; },
        deleteContents() { if (target) { target.innerText = ""; target.textContent = ""; target.children = []; } },
        insertNode(node) { if (target) { target.innerText = node.textContent; target.textContent = node.textContent; } },
      };
    },
  };
  const window = {
    getSelection() { return selection; },
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    postMessage(message) { messages.push(message); },
    getComputedStyle(element) { return element.style; },
  };
  const context = {
    document, window, location: { href: "https://excel.zhrdc.net/ty/operation/page-project/page", origin: "https://excel.zhrdc.net", pathname: "/ty/operation/page-project/page" },
    Event: FakeEvent, InputEvent: FakeEvent, MouseEvent: FakeEvent, URLSearchParams, setTimeout, clearTimeout,
    XMLHttpRequest: HarnessXMLHttpRequest,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  function select(element = block) {
    selection.rangeCount = 1;
    selection.isCollapsed = false;
    selection.anchorNode = element;
    selection.focusNode = element;
    selection.toString = () => element.innerText || "";
    selection.getRangeAt = () => ({ commonAncestorContainer: element });
  }
  async function action(payload) {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "actionListener");
    assert.ok(listener);
    await listener({ source: window, data: { type: actionType, requestId: "format-table-test", payload } });
    return messages.find((message) => message.type === responseType)?.payload;
  }
  return { block, select, action };
}

function basePayload(overrides = {}) {
  return { sessionId: "session-format-table", bindingId: "binding-format-table", projectId: "page-project", threadId: "thread-format-table", tabId: 9, blockId: "dom:format-table-block", expectedText: "原文段落", ...overrides };
}

test("page adapter supports controlled text formatting", async () => {
  const harness = createHarness();
  harness.select();
  const preview = await harness.action({ ...basePayload(), action: "edit_block_format_preview", format: { fontWeight: "bold", fontSizePx: 18, lineHeightPx: 30, indentPx: 24, color: "#123456" } });
  assert.equal(preview.ok, true);
  assert.equal(preview.security.writesPerformed, false);
  const execute = await harness.action({ ...basePayload(), action: "edit_block_format_execute", format: { fontWeight: "bold", fontSizePx: 18, lineHeightPx: 30, indentPx: 24, color: "#123456" }, previewActionId: "preview-format", confirmText: "确认设置编辑格式" });
  assert.equal(execute.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(execute.readback.ok, true);
  assert.equal(execute.readback.editBlock.format.fontWeight, "bold");
  assert.equal(execute.readback.editBlock.format.fontSizePx, 18);
  assert.equal(execute.readback.editBlock.format.lineHeightPx, 30);
  assert.equal(execute.readback.editBlock.format.indentPx, 24);
});

test("page adapter supports transparent and colored text highlighting without changing text formats", async () => {
  const harness = createHarness();
  harness.select();
  const before = await harness.action({ ...basePayload(), action: "edit_block_format_readback" });
  const preview = await harness.action({ ...basePayload(), action: "edit_block_format_preview", format: { highlightColor: "none" } });
  assert.equal(preview.ok, true);
  assert.equal(preview.originalFormat.highlightColor, "#ffff00");
  assert.equal(preview.replacementFormat.highlightColor, "transparent");
  const execute = await harness.action({ ...basePayload(), action: "edit_block_format_execute", format: { highlightColor: "none" }, previewActionId: "preview-highlight", confirmText: "确认设置编辑格式" });
  assert.equal(execute.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(execute.readback.ok, true);
  assert.equal(execute.readback.editBlock.currentText, before.editBlock.currentText);
  assert.equal(execute.readback.editBlock.format.highlightColor, "transparent");
  assert.equal(execute.readback.editBlock.format.fontWeight, before.editBlock.format.fontWeight);
  const color = await harness.action({ ...basePayload(), action: "edit_block_format_execute", format: { highlightColor: "#00ff00" }, previewActionId: "preview-highlight-color", confirmText: "确认设置编辑格式" });
  assert.equal(color.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(color.readback.editBlock.format.highlightColor, "#00ff00");
});

test("page adapter saves highlighted format when the report page exposes a usable save button", async () => {
  const harness = createHarness({ withSaveButton: true });
  harness.select();
  const execute = await harness.action({ ...basePayload(), action: "edit_block_format_execute", format: { highlightColor: "transparent" }, previewActionId: "preview-highlight-save", confirmText: "确认设置编辑格式" });
  assert.equal(execute.ok, true);
  assert.equal(execute.reason, null);
  assert.notEqual(execute.reason, "DRAFT_SAVE_BUTTON_NOT_AVAILABLE");
  assert.equal(execute.save.ok, true);
  assert.equal(execute.readback.afterSave.format.highlightColor, "transparent");
});

test("page adapter supports controlled table insert, cell update and formatting", async () => {
  const harness = createHarness();
  harness.select();
  const insert = { ...basePayload(), action: "table_execute", tableAction: "insert", rowCount: 2, columnCount: 2, cells: [["项目", "金额"], ["测试", "100"]], previewActionId: "preview-insert", confirmText: "确认执行表格操作" };
  const inserted = await harness.action(insert);
  assert.equal(inserted.reason, "TABLE_MEMORY_ONLY");
  assert.equal(inserted.readback.ok, true);
  const tableId = inserted.readback.after.tableId;
  const tableHash = inserted.readback.after.tableHash;
  const update = await harness.action({ ...basePayload(), action: "table_execute", tableAction: "update_cell", tableId, rowIndex: 1, columnIndex: 1, cellText: "200", expectedTableHash: tableHash, previewActionId: "preview-update", confirmText: "确认执行表格操作" });
  assert.equal(update.reason, "TABLE_MEMORY_ONLY");
  assert.equal(update.readback.after.cells[1][1].text, "200");
  const format = await harness.action({ ...basePayload(), action: "table_execute", tableAction: "format", tableId, expectedTableHash: update.readback.after.tableHash, tableFormat: { rowHeightPx: 28, columnWidthPx: 120, borderStyle: "solid", borderColor: "#999999", textAlign: "right", verticalAlign: "middle", fontSizePx: 14 }, formatScope: "table", previewActionId: "preview-format-table", confirmText: "确认执行表格操作" });
  assert.equal(format.reason, "TABLE_MEMORY_ONLY");
  assert.equal(format.readback.ok, true);
  assert.equal(format.readback.after.rowCount, 2);
  assert.equal(format.readback.after.cells[1][1].text, "200");
  const readback = await harness.action({ ...basePayload(), action: "table_readback", tableId });
  assert.equal(readback.ok, true);
  assert.equal(readback.table.cells[1][1].text, "200");
});

console.log("Edit-format and table adapter checks passed.");
