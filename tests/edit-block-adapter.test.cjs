"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "extension/src/injected/page_adapter.js"), "utf8");
const adapterVersion = source.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1];
const actionType = `TIANYUAN_WORKBENCH_RUN_ACTION:${adapterVersion}`;
const contextResponseType = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${adapterVersion}`;
const responseType = `TIANYUAN_WORKBENCH_ACTION_RESULT:${adapterVersion}`;

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

function makeElement(tagName, text, id) {
  const attributes = { contenteditable: "true", id };
  const element = {
    nodeType: 1,
    tagName,
    id,
    innerText: text,
    textContent: text,
    isContentEditable: true,
    hidden: false,
    offsetWidth: 1,
    offsetHeight: 1,
    parentElement: null,
    children: [],
    events: [],
    getClientRects() { return [{}]; },
    getAttribute(name) { return attributes[name] ?? null; },
    closest() { return null; },
    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    },
  };
  return element;
}

function createHarness() {
  const blockA = makeElement("MARK", "原文 A", "block-a");
  const blockB = makeElement("MARK", "原文 B", "block-b");
  const body = {
    nodeType: 1,
    tagName: "BODY",
    innerText: "资产基础法底稿",
    textContent: "资产基础法底稿",
    children: [blockA, blockB],
    parentElement: null,
    getAttribute() { return null; },
  };
  blockA.parentElement = body;
  blockB.parentElement = body;

  const documentListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  const selection = { rangeCount: 0, isCollapsed: true, toString() { return ""; }, removeAllRanges() {}, addRange() {} };
  const document = {
    title: "镇洋股份出资评估",
    body,
    addEventListener(type, listener, capture) { documentListeners.set(`${type}:${capture}`, listener); },
    removeEventListener(type, listener, capture) {
      if (documentListeners.get(`${type}:${capture}`) === listener) documentListeners.delete(`${type}:${capture}`);
    },
    querySelector(selector) { return selector === ".spreadWrapper" ? null : null; },
    querySelectorAll(selector) {
      if (selector.startsWith("button")) return [];
      if (selector.startsWith("mark,")) return [blockA, blockB];
      return [];
    },
    contains(node) { return node === body || node === blockA || node === blockB; },
    createRange() {
      let target = null;
      return {
        selectNodeContents(element) { target = element; },
        deleteContents() {
          if (target) {
            target.innerText = "";
            target.textContent = "";
          }
        },
        insertNode(node) {
          if (target) {
            target.innerText = String(node.textContent || "");
            target.textContent = target.innerText;
          }
        },
      };
    },
    createTextNode(text) { return { textContent: text }; },
  };
  const window = {
    getSelection() { return selection; },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    postMessage(message) { messages.push(message); },
    getComputedStyle() { return { display: "block", visibility: "visible" }; },
  };
  const context = {
    document,
    window,
    location: { href: "https://excel.zhrdc.net/ty/operation/page-project/page", origin: "https://excel.zhrdc.net", pathname: "/ty/operation/page-project/page" },
    Event: FakeEvent,
    InputEvent: FakeEvent,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  function select(anchor, focus = anchor) {
    selection.rangeCount = 1;
    selection.isCollapsed = false;
    selection.anchorNode = anchor;
    selection.focusNode = focus;
    selection.toString = () => `${anchor.innerText} ${focus.innerText}`;
    selection.getRangeAt = () => ({ commonAncestorContainer: anchor });
  }

  function clearSelection() {
    selection.rangeCount = 0;
    selection.isCollapsed = true;
    selection.anchorNode = null;
    selection.focusNode = null;
    selection.toString = () => "";
  }

  async function action(payload) {
    messages.length = 0;
    const listeners = [...(windowListeners.get("message") || [])];
    const listener = listeners.find((candidate) => candidate.name === "actionListener");
    assert.ok(listener, "page adapter action listener is installed");
    await listener({ source: window, data: { type: actionType, requestId: "edit-test", payload } });
    return messages.find((message) => message.type === responseType)?.payload;
  }

  return { blockA, blockB, select, clearSelection, action };
}

function basePayload(overrides = {}) {
  return {
    sessionId: "session-edit",
    bindingId: "binding-edit",
    projectId: "page-project",
    threadId: "thread-edit",
    tabId: 11,
    blockId: "dom:block-a",
    expectedText: "原文 A",
    replacementText: "新文 A",
    ...overrides,
  };
}

test("page adapter enforces edit-block selection and content gates", async () => {
  const harness = createHarness();
  harness.select(harness.blockA);

  const preview = await harness.action({ ...basePayload(), action: "edit_block_preview" });
  assert.equal(preview.ok, true);
  assert.equal(preview.originalText, "原文 A");
  assert.equal(preview.replacementText, "新文 A");
  assert.equal(preview.security.writesPerformed, false);

  harness.clearSelection();
  const readbackAfterFocusTransfer = await harness.action({ ...basePayload(), action: "edit_block_readback" });
  assert.equal(readbackAfterFocusTransfer.ok, true);
  assert.equal(readbackAfterFocusTransfer.editBlock.currentText, "原文 A");

  harness.blockA.innerText = "已变化 A";
  harness.blockA.textContent = "已变化 A";
  const hashConflict = await harness.action({ ...basePayload(), action: "edit_block_execute", confirmText: "确认修改编辑块", previewActionId: "preview" });
  assert.equal(hashConflict.reason, "EDIT_BLOCK_TEXT_MISMATCH");

  harness.blockA.innerText = "原文 A";
  harness.blockA.textContent = "原文 A";
  harness.select(harness.blockA, harness.blockB);
  for (const actionName of ["edit_block_preview", "edit_block_execute", "edit_block_readback"]) {
    const result = await harness.action({ ...basePayload(), action: actionName, confirmText: "确认修改编辑块", previewActionId: "preview" });
    assert.equal(result.reason, "EDIT_BLOCK_CROSS_BLOCK_SELECTION");
  }

  harness.select(harness.blockB);
  const selectionMismatch = await harness.action({ ...basePayload(), action: "edit_block_preview" });
  assert.equal(selectionMismatch.reason, "EDIT_BLOCK_SELECTION_MISMATCH");

  harness.select(harness.blockA);
  const memoryOnly = await harness.action({ ...basePayload(), action: "edit_block_execute", confirmText: "确认修改编辑块", previewActionId: "preview" });
  assert.equal(memoryOnly.ok, false);
  assert.equal(memoryOnly.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(memoryOnly.writesPerformed, true);
  assert.equal(memoryOnly.readback.ok, true);
  assert.equal(harness.blockA.innerText, "新文 A");
  assert.equal(memoryOnly.security.arbitraryJavaScript, false);
});

function createRangeSelectionHarness() {
  const allElements = new Set();
  const makeText = (value, parent = null) => {
    const node = { nodeType: 3, parentNode: parent, parentElement: parent };
    Object.defineProperty(node, "nodeValue", { get: () => node.value, set: (next) => { node.value = String(next); } });
    Object.defineProperty(node, "data", { get: () => node.value, set: (next) => { node.value = String(next); } });
    Object.defineProperty(node, "textContent", { get: () => node.value, set: (next) => { node.value = String(next); } });
    node.value = String(value);
    return node;
  };
  const makeElement = (tagName, attributes = {}, children = []) => {
    const element = {
      nodeType: 1,
      tagName,
      id: attributes.id || "",
      isContentEditable: attributes.contenteditable === "true" || attributes.contenteditable === "" || attributes.isContentEditable !== false,
      hidden: false,
      offsetWidth: 1,
      offsetHeight: 1,
      parentElement: null,
      parentNode: null,
      children: [],
      childNodes: [],
      style: {},
      events: [],
      getAttribute(name) { return attributes[name] ?? null; },
      getClientRects() { return [{}]; },
      dispatchEvent(event) { this.events.push(event.type); return true; },
      appendChild(child) {
        child.parentElement = this;
        child.parentNode = this;
        this.childNodes.push(child);
        if (child.nodeType === 1) this.children.push(child);
        return child;
      },
      removeChild(child) {
        this.childNodes = this.childNodes.filter((item) => item !== child);
        this.children = this.children.filter((item) => item !== child);
        child.parentElement = null;
        child.parentNode = null;
        return child;
      },
      closest(selector) {
        let current = this;
        while (current) {
          if (selector.includes("contenteditable") && current.getAttribute?.("contenteditable") != null) return current;
          if (selector.includes("[role='textbox']") && current.getAttribute?.("role") === "textbox") return current;
          current = current.parentElement;
        }
        return null;
      },
    };
    Object.defineProperty(element, "textContent", {
      get: () => element.childNodes.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent || "").join(""),
      set: (value) => {
        element.childNodes = [makeText(value, element)];
        element.children = [];
      },
    });
    Object.defineProperty(element, "innerText", { get: () => element.textContent, set: (value) => { element.textContent = value; } });
    for (const child of children) element.appendChild(child);
    allElements.add(element);
    return element;
  };

  const body = makeElement("BODY", { isContentEditable: false }, []);
  const editor = makeElement("DIV", { contenteditable: "true", role: "textbox", id: "report-editor" }, []);
  const first = makeElement("DIV", {}, [makeText("前缀XXXXXX后缀", null)]);
  const second = makeElement("DIV", {}, [makeText("第二段提示文字", null)]);
  editor.appendChild(first);
  editor.appendChild(second);
  body.appendChild(editor);
  const firstText = first.childNodes[0];
  const secondText = second.childNodes[0];
  let selectedRange = { commonAncestorContainer: firstText, startContainer: firstText, startOffset: 2, endContainer: firstText, endOffset: 8 };
  let selectedText = "XXXXXX";
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: firstText,
    focusNode: firstText,
    anchorOffset: 2,
    focusOffset: 8,
    toString() { return selectedText; },
    getRangeAt() { return selectedRange; },
    removeAllRanges() { this.rangeCount = 0; },
    addRange(range) { this.rangeCount = 1; this.range = range; },
  };
  const documentListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  const document = {
    title: "镇洋股份出资评估",
    body,
    addEventListener(type, listener, capture) { documentListeners.set(`${type}:${capture}`, listener); },
    removeEventListener(type, listener, capture) { if (documentListeners.get(`${type}:${capture}`) === listener) documentListeners.delete(`${type}:${capture}`); },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector.includes("button") || selector === "table") return [];
      return [...allElements];
    },
    contains(node) {
      for (const element of allElements) {
        if (element === node) return true;
        if (element.childNodes.some((child) => child === node)) return true;
      }
      return false;
    },
    createRange() {
      const range = {
        startContainer: null,
        startOffset: 0,
        endContainer: null,
        endOffset: 0,
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
        selectNodeContents(element) {
          const node = element.childNodes.find((child) => child.nodeType === 3) || element.childNodes[0];
          this.startContainer = node || element;
          this.endContainer = node || element;
          this.startOffset = 0;
          this.endOffset = node?.nodeType === 3 ? node.nodeValue.length : element.childNodes.length;
        },
        deleteContents() {
          if (this.startContainer?.nodeType !== 3 || this.endContainer?.nodeType !== 3) return;
          const textNodes = [];
          const collectTextNodes = (node) => {
            if (node?.nodeType === 3) textNodes.push(node);
            else for (const child of node?.childNodes || []) collectTextNodes(child);
          };
          collectTextNodes(editor);
          const startIndex = textNodes.indexOf(this.startContainer);
          const endIndex = textNodes.indexOf(this.endContainer);
          if (startIndex < 0 || endIndex < startIndex) return;
          if (startIndex === endIndex) {
            this.startContainer.nodeValue = `${this.startContainer.nodeValue.slice(0, this.startOffset)}${this.startContainer.nodeValue.slice(this.endOffset)}`;
          } else {
            this.startContainer.nodeValue = this.startContainer.nodeValue.slice(0, this.startOffset);
            this.endContainer.nodeValue = this.endContainer.nodeValue.slice(this.endOffset);
            for (let index = startIndex + 1; index < endIndex; index += 1) textNodes[index].nodeValue = "";
          }
          this.endContainer = this.startContainer;
          this.endOffset = this.startOffset;
        },
        insertNode(node) {
          if (this.startContainer?.nodeType !== 3) return;
          const text = this.startContainer.nodeValue;
          this.startContainer.nodeValue = `${text.slice(0, this.startOffset)}${node.textContent}${text.slice(this.startOffset)}`;
          this.endOffset = this.startOffset + String(node.textContent || "").length;
        },
      };
      return range;
    },
    createTextNode(value) { return makeText(value); },
  };
  const window = {
    getSelection() { return selection; },
    getComputedStyle() { return { display: "block", visibility: "visible" }; },
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    postMessage(message) { messages.push(message); },
  };
  const context = {
    document,
    window,
    location: { href: "https://excel.zhrdc.net/ty/operation/page-project/page", origin: "https://excel.zhrdc.net", pathname: "/ty/operation/page-project/page" },
    Event: FakeEvent,
    InputEvent: FakeEvent,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  async function contextResult() {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "contextListener");
    await listener({ source: window, data: { type: `TIANYUAN_WORKBENCH_GET_CONTEXT:${adapterVersion}`, requestId: "context-test" } });
    return messages.find((message) => message.type === contextResponseType)?.payload;
  }

  async function action(payload) {
    messages.length = 0;
    const listener = [...(windowListeners.get("message") || [])].find((candidate) => candidate.name === "actionListener");
    await listener({ source: window, data: { type: actionType, requestId: "range-test", payload } });
    return messages.find((message) => message.type === responseType)?.payload;
  }

  function rerenderFirstBlock() {
    const replacement = makeElement("DIV", {}, [makeText("前缀XXXXXX后缀", null)]);
    editor.removeChild(first);
    allElements.delete(first);
    editor.childNodes.splice(0, 0, replacement);
    editor.children.splice(0, 0, replacement);
    replacement.parentElement = editor;
    replacement.parentNode = editor;
    allElements.add(replacement);
    return replacement;
  }

  function selectAcrossParagraphs() {
    selectedText = "XXXXXX后缀第二段提示";
    selectedRange = {
      commonAncestorContainer: editor,
      startContainer: firstText,
      startOffset: 2,
      endContainer: secondText,
      endOffset: 5,
    };
    selection.anchorNode = firstText;
    selection.focusNode = secondText;
  }

  return { contextResult, action, first, second, editor, selectAcrossParagraphs, rerenderFirstBlock };
}

test("page adapter scopes a broad textbox selection to one block range", async () => {
  const harness = createRangeSelectionHarness();
  const context = await harness.contextResult();
  assert.equal(context.editingBlock.available, true);
  assert.equal(context.editingBlock.blockMode, "range");
  assert.match(context.editingBlock.blockId, /^dom-range:/);
  assert.equal(context.editingBlock.originalText, "XXXXXX");
  assert.equal(context.editingBlock.containerText, "前缀XXXXXX后缀第二段提示文字");
  assert.equal(context.editingBlock.element.role, "textbox");

  const base = {
    sessionId: "session-edit", bindingId: "binding-edit", projectId: "page-project", threadId: "thread-edit", tabId: 11,
    blockId: context.editingBlock.blockId, expectedText: "XXXXXX", replacementText: "已替换文本",
  };
  const preview = await harness.action({ ...base, action: "edit_block_preview" });
  assert.equal(preview.ok, true);
  assert.equal(preview.originalText, "XXXXXX");
  assert.equal(preview.editBlock.blockMode, "range");
  const rerendered = harness.rerenderFirstBlock();
  const rebound = await harness.action({ ...base, action: "edit_block_readback", expectedText: "XXXXXX" });
  assert.equal(rebound.ok, true);
  assert.equal(rebound.editBlock.blockId, base.blockId);
  const execute = await harness.action({ ...base, action: "edit_block_execute", confirmText: "确认修改编辑块", previewActionId: "preview" });
  assert.equal(execute.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(rerendered.textContent, "前缀已替换文本后缀");
  assert.equal(harness.second.textContent, "第二段提示文字");
});

test("page adapter accepts a cross-paragraph selection in one contenteditable root", async () => {
  const harness = createRangeSelectionHarness();
  harness.selectAcrossParagraphs();
  const context = await harness.contextResult();
  assert.equal(context.editingBlock.available, true);
  assert.equal(context.editingBlock.blockMode, "range");
  assert.match(context.editingBlock.blockId, /^dom-range:dom:report-editor:/);
  assert.equal(context.editingBlock.originalText, "XXXXXX后缀第二段提示");
  assert.equal(context.editingBlock.containerText, "前缀XXXXXX后缀第二段提示文字");

  const payload = {
    sessionId: "session-edit", bindingId: "binding-edit", projectId: "page-project", threadId: "thread-edit", tabId: 11,
    blockId: context.editingBlock.blockId, expectedText: "XXXXXX后缀第二段提示", replacementText: "替换后的跨段内容",
  };
  const preview = await harness.action({ ...payload, action: "edit_block_preview" });
  assert.equal(preview.ok, true);
  assert.equal(preview.originalText, "XXXXXX后缀第二段提示");
  assert.equal(preview.security.writesPerformed, false);
  const execute = await harness.action({ ...payload, action: "edit_block_execute", confirmText: "确认修改编辑块", previewActionId: "preview" });
  assert.equal(execute.reason, "EDIT_BLOCK_MEMORY_ONLY");
  assert.equal(execute.readback.ok, true);
  assert.equal(harness.editor.children.length, 2);
  assert.equal(harness.first.textContent, "前缀替换后的跨段内容");
  assert.equal(harness.second.textContent, "文字");
});

console.log("Edit-block adapter checks passed.");
