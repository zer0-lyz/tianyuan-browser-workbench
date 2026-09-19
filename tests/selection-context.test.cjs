"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createBridge } = require("../native-helper/connector_bridge.js");

const contentSource = fs.readFileSync(path.join(__dirname, "..", "extension/src/content/content.js"), "utf8");
const ADAPTER_VERSION = contentSource.match(/const ADAPTER_VERSION = "([^"]+)"/)?.[1];
const EXTENSION_BUILD_ID = contentSource.match(/const EXTENSION_BUILD_ID = "([^"]+)"/)?.[1];
const REQUEST_TYPE = "TIANYUAN_WORKBENCH_GET_CONTEXT_V2";
const RESPONSE_TYPE = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${ADAPTER_VERSION}`;

function element(tagName, attributes = {}) {
  return {
    tagName,
    value: attributes.value || "",
    innerText: attributes.text || "",
    textContent: attributes.text || "",
    selectionStart: attributes.selectionStart,
    selectionEnd: attributes.selectionEnd,
    isContentEditable: attributes.contentEditable === true,
    parentElement: null,
    id: attributes.id || "",
    hidden: Boolean(attributes.hidden),
    getAttribute(name) { return attributes[name] ?? null; },
    closest(selector) {
      return attributes.contentEditable === true && selector.includes("contenteditable") ? this : null;
    },
  };
}

function createContentHarness() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const document = {
    title: "天源测试页面",
    activeElement: null,
    documentElement: { appendChild(script) { script.onload?.(); } },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) { if (documentListeners.get(type) === listener) documentListeners.delete(type); },
    getElementById() { return null; },
    createElement() { return { id: "", remove() {} }; },
    contains() { return true; },
  };
  const window = {
    getSelection() { return window.selection || { rangeCount: 0, isCollapsed: true, toString() { return ""; } }; },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    setTimeout,
    clearTimeout,
    postMessage(message) {
      if (!message?.requestId) return;
      const listeners = [...(windowListeners.get("message") || [])];
      for (const listener of listeners) listener({ source: window, data: {
        type: RESPONSE_TYPE,
        requestId: message.requestId,
        payload: { adapterVersion: ADAPTER_VERSION, buildId: EXTENSION_BUILD_ID, ok: true, route: { isTianyuanRoute: true } },
      } });
    },
  };
  const runtimeListeners = [];
  const context = {
    chrome: {
      runtime: {
        getURL(value) { return `chrome-extension://test/${value}`; },
        onMessage: { addListener(listener) { runtimeListeners.push(listener); }, removeListener(listener) { const index = runtimeListeners.indexOf(listener); if (index >= 0) runtimeListeners.splice(index, 1); } },
      },
    },
    document,
    location: { href: "https://excel.zhrdc.net/ty/operation/project/page" },
    window,
    URL,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(contentSource, context);
  return { context, document, window, documentListeners, runtimeListeners };
}

function createContentRangeHarness() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const makeText = (value, parent = null) => ({ nodeType: 3, nodeValue: String(value), data: String(value), parentNode: parent, parentElement: parent });
  const makeElement = (tagName, attributes = {}, children = []) => {
    const element = {
      nodeType: 1,
      tagName,
      id: attributes.id || "",
      children: [],
      childNodes: [],
      parentNode: null,
      parentElement: null,
      isContentEditable: attributes.isContentEditable !== false,
      hidden: false,
      getAttribute(name) { return attributes[name] ?? null; },
      appendChild(child) {
        child.parentNode = this;
        child.parentElement = this;
        this.childNodes.push(child);
        if (child.nodeType === 1) this.children.push(child);
        return child;
      },
      closest(selector) {
        let current = this;
        while (current) {
          if (selector.includes("contenteditable") && current.getAttribute?.("contenteditable") != null) return current;
          current = current.parentElement;
        }
        return null;
      },
    };
    Object.defineProperty(element, "textContent", { get: () => element.childNodes.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent).join("") });
    Object.defineProperty(element, "innerText", { get: () => element.textContent });
    for (const child of children) element.appendChild(child);
    return element;
  };

  const body = makeElement("BODY", { isContentEditable: false });
  const editor = makeElement("DIV", { contenteditable: "true", role: "textbox", id: "report-editor" });
  const first = makeElement("P", {}, [makeText("前缀XXXXXX后缀")]);
  const second = makeElement("P", {}, [makeText("第二段提示文字")]);
  editor.appendChild(first);
  editor.appendChild(second);
  body.appendChild(editor);
  const firstText = first.childNodes[0];
  const secondText = second.childNodes[0];
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: firstText,
    focusNode: secondText,
    toString() { return "XXXXXX后缀第二段提示"; },
    range: { commonAncestorContainer: editor, startContainer: firstText, startOffset: 2, endContainer: secondText, endOffset: 5 },
    getRangeAt() { return this.range; },
  };
  const document = {
    title: "天源跨段测试页面",
    activeElement: null,
    documentElement: { appendChild(script) { script.onload?.(); } },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) { if (documentListeners.get(type) === listener) documentListeners.delete(type); },
    getElementById() { return null; },
    createElement() { return { id: "", remove() {} }; },
    contains(node) {
      let current = node;
      while (current) {
        if (current === body) return true;
        current = current.parentNode;
      }
      return false;
    },
  };
  const window = {
    getSelection() { return selection; },
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    setTimeout,
    clearTimeout,
    postMessage(message) {
      if (!message?.requestId) return;
      for (const listener of windowListeners.get("message") || []) listener({ source: window, data: {
        type: RESPONSE_TYPE,
        requestId: message.requestId,
        payload: { adapterVersion: ADAPTER_VERSION, buildId: EXTENSION_BUILD_ID, ok: true, route: { isTianyuanRoute: true } },
      } });
    },
  };
  const runtimeListeners = [];
  const context = {
    chrome: {
      runtime: {
        getURL(value) { return `chrome-extension://test/${value}`; },
        onMessage: { addListener(listener) { runtimeListeners.push(listener); }, removeListener() {} },
      },
    },
    document,
    location: { href: "https://excel.zhrdc.net/ty/operation/project/page" },
    window,
    URL,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(contentSource, context);
  return { document, window, selection, editor, first, second, documentListeners, runtimeListeners };
}

async function getContext(harness, tabId = 7) {
  return await new Promise((resolve) => {
    const listener = harness.runtimeListeners.at(-1);
    listener({ type: REQUEST_TYPE }, { tab: { id: tabId } }, resolve);
  });
}

test("content script captures safe page, contenteditable and input selections", async () => {
  const harness = createContentHarness();
  let result = await getContext(harness);
  assert.equal(JSON.stringify(result.selection), JSON.stringify({ available: false, text: "", source: "", mode: "", pageUrl: "", pageTitle: "", tabId: null, capturedAt: null, element: null, caretReference: null }));

  const paragraph = element("SPAN");
  harness.window.selection = {
    rangeCount: 1, isCollapsed: false, toString() { return "页面选中的文字"; },
    getRangeAt() { return { commonAncestorContainer: { nodeType: 1, parentElement: paragraph } }; },
  };
  harness.documentListeners.get("selectionchange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  result = await getContext(harness, 12);
  assert.equal(result.selection.available, true);
  assert.equal(result.selection.text, "页面选中的文字");
  assert.equal(result.selection.source, "page-text");
  assert.equal(result.selection.tabId, 12);
  assert.equal(result.selection.pageUrl, "https://excel.zhrdc.net/ty/operation/project/page");

  const editor = element("DIV", { contentEditable: true, text: "可编辑块原文" });
  harness.window.selection = {
    rangeCount: 1, isCollapsed: false, toString() { return "可编辑区域文字"; },
    getRangeAt() { return { commonAncestorContainer: { nodeType: 3, parentElement: editor } }; },
  };
  harness.documentListeners.get("selectionchange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  result = await getContext(harness);
  assert.equal(result.selection.source, "contenteditable");
  assert.equal(result.selection.mode, "text");
  assert.equal(result.editingBlock.available, true);
  assert.equal(result.editingBlock.element.tag, "div");
  assert.equal(result.editingBlock.originalText, "可编辑块原文");
  assert.match(result.editingBlock.contentHash, /^fnv1a32-[0-9a-f]{8}$/);
  editor.innerText = "编辑块已被其他操作修改";
  editor.textContent = editor.innerText;
  result = await getContext(harness);
  assert.equal(result.editingBlock.available, true);
  assert.equal(result.editingBlock.valid, false);
  assert.equal(result.editingBlock.stale, true);
  assert.equal(result.editingBlock.reason, "EDIT_BLOCK_CONTENT_CHANGED");

  const input = element("INPUT", { value: "输入框中的选中内容", selectionStart: 0, selectionEnd: 5, type: "text", name: "subject" });
  harness.document.activeElement = input;
  harness.documentListeners.get("select")({ target: input });
  result = await getContext(harness, 13);
  assert.equal(result.selection.source, "input");
  assert.equal(result.selection.text, "输入框中的选中内容".slice(0, 5));
  assert.equal(result.editingBlock.available, false);
});

test("selection clears on sensitive fields and deselection", async () => {
  const harness = createContentHarness();
  const password = element("INPUT", { value: "secret-value", selectionStart: 0, selectionEnd: 6, type: "password", name: "password" });
  harness.document.activeElement = password;
  harness.documentListeners.get("select")({ target: password });
  let result = await getContext(harness);
  assert.equal(result.selection.available, false);
  assert.equal(result.selection.text, "");

  harness.document.activeElement = element("DIV");
  harness.window.selection = { rangeCount: 0, isCollapsed: true, toString() { return ""; } };
  harness.documentListeners.get("selectionchange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  result = await getContext(harness);
  assert.equal(result.selection.available, false);
});

test("content script treats cross-paragraph selection in one contenteditable as one range block", async () => {
  const harness = createContentRangeHarness();
  harness.documentListeners.get("selectionchange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = await getContext(harness, 21);
  assert.equal(result.selection.source, "contenteditable");
  assert.equal(result.editingBlock.available, true);
  assert.equal(result.editingBlock.blockMode, "range");
  assert.match(result.editingBlock.blockId, /^dom-range:dom:report-editor:/);
  assert.equal(result.editingBlock.originalText, "XXXXXX后缀第二段提示");
  assert.equal(result.editingBlock.containerText, "前缀XXXXXX后缀第二段提示文字");
  assert.equal(result.editingBlock.tabId, 21);
});

test("content script captures a collapsed caret reference", async () => {
  const harness = createContentRangeHarness();
  const text = harness.first.childNodes[0];
  harness.document.activeElement = harness.editor;
  harness.window.selection = harness.selection;
  harness.selection.isCollapsed = true;
  harness.selection.toString = () => "";
  harness.selection.anchorNode = text;
  harness.selection.focusNode = text;
  harness.selection.range = { commonAncestorContainer: harness.first, startContainer: text, startOffset: 1, endContainer: text, endOffset: 1, collapsed: true };
  harness.documentListeners.get("selectionchange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = await getContext(harness, 22);
  assert.equal(result.selection.available, true);
  assert.equal(result.selection.mode, "caret");
  assert.equal(result.selection.text, "");
  assert.equal(result.selection.source, "contenteditable-caret");
  assert.equal(result.selection.caretReference.mode, "caret");
  assert.equal(result.selection.caretReference.textOffset, 1);
  assert.equal(result.selection.caretReference.domPath, "node:0/text:0");
  assert.equal(result.editingBlock.available, true);
  assert.equal(result.editingBlock.blockMode, "caret");
  assert.match(result.editingBlock.blockId, /^dom-caret:dom:report-editor:/);
  assert.equal(result.editingBlock.caretReference.mode, "caret");
  assert.equal(result.editingBlock.caretReference.textOffset, 1);
  assert.equal(result.editingBlock.caretReference.domPath, "node:0/text:0");
});

test("Bridge scopes selection to the current session, tab and Agent binding", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-selection-bridge-"));
  const credentialsPath = path.join(root, "credentials.json");
  const bindingsPath = path.join(root, "bindings.json");
  const sourcesPath = path.join(root, "sources.json");
  const compatibilityPath = path.join(root, "compatibility.json");
  const port = 43000 + Math.floor(Math.random() * 500);
  fs.writeFileSync(credentialsPath, JSON.stringify({ secrets: { codex: "selection-test-credential" } }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ sources: [{
    agentId: "codex-selection", providerId: "codex", displayName: "Codex", installationId: "codex-selection-install",
    credentialRef: `file:${credentialsPath}#codex`, manual: false,
  }] }));
  fs.writeFileSync(bindingsPath, JSON.stringify({ bindings: [] }));
  fs.writeFileSync(compatibilityPath, JSON.stringify({ extensionVersion: "0.14.22", runtimeBuildId: "selection-test-build" }));
  const bridge = createBridge({ bindingsPath, sourcesPath, compatibilityPath });
  const server = await bridge.start(port);
  const browserHeaders = {
    origin: "chrome-extension://lkflndcnklpeaejohaacoaolnmhgigoc",
    "content-type": "application/json",
    "x-tianyuan-extension-id": "lkflndcnklpeaejohaacoaolnmhgigoc",
    "x-tianyuan-extension-version": "0.14.22",
    "x-tianyuan-runtime-build-id": "selection-test-build",
  };
  const agentHeaders = {
    "content-type": "application/json",
    "x-tianyuan-agent-provider": "codex",
    "x-tianyuan-agent-installation": "codex-selection-install",
    "x-tianyuan-agent-credential": "selection-test-credential",
  };
  async function request(method, pathname, payload, headers) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, payload: await response.json() };
  }
  try {
    const registered = await request("POST", "/api/sessions/register", {
      sessionId: "selection-session",
      binding: { projectId: "page-project", companyId: "page-company", pageType: "asset-draft", tabId: 21 },
      context: { build: { extensionVersion: "0.14.25", extensionBuildId: EXTENSION_BUILD_ID, contentScriptAdapterVersion: ADAPTER_VERSION, pageAdapterVersion: ADAPTER_VERSION, pageAdapterBuildId: EXTENSION_BUILD_ID, protocolMatch: true }, route: { isTianyuanRoute: true, projectId: "page-project" }, selection: {
        available: true, text: "当前页面选中文字", source: "page-text", pageUrl: "https://excel.zhrdc.net/ty/operation/page",
        pageTitle: "天源测试", tabId: 21, capturedAt: "2026-08-27T00:00:00.000Z", element: { tag: "span" },
      } },
    }, browserHeaders);
    assert.equal(registered.status, 200);
    const bound = await request("POST", "/api/sessions/selection-session/agent-bindings", {
      providerId: "codex", installationId: "codex-selection-install", agentId: "codex-selection", workspaceId: "workspace-selection",
      workspaceName: "选择测试项目", workspacePath: "/tmp/selection-project", conversationId: "conversation-selection",
      conversationTitle: "选区测试对话", scope: "conversation", accessMode: "read",
    }, browserHeaders);
    assert.equal(bound.status, 200);
    const listed = await request("GET", "/api/sessions", undefined, agentHeaders);
    const selection = listed.payload.sessions[0].context.selection;
    assert.equal(selection.text, "当前页面选中文字");
    assert.equal(selection.sessionId, "selection-session");
    assert.equal(selection.bindingId, bound.payload.binding.bindingId);
    assert.equal(selection.tabId, 21);
    assert.equal(selection.projectId, "page-project");
    assert.equal(selection.workspaceId, "workspace-selection");
    assert.equal(selection.conversationId, "conversation-selection");
    assert.equal(selection.threadId, "conversation-selection");
    assert.equal(listed.payload.sessions[0].context.build.pageAdapterVersion, ADAPTER_VERSION);
    assert.equal(listed.payload.sessions[0].context.build.protocolMatch, true);

    const caretReference = { mode: "caret", baseId: "dom:report-editor", blockId: "dom-caret:report-editor:caret", containerPath: "div:1", domPath: "node:0/text:0", textOffset: 2 };
    const caretRegistered = await request("POST", "/api/sessions/register", {
      sessionId: "selection-session",
      binding: { projectId: "page-project", companyId: "page-company", pageType: "asset-draft", tabId: 21 },
      context: { route: { isTianyuanRoute: true, projectId: "page-project" }, selection: { available: true, text: "", source: "contenteditable-caret", mode: "caret", caretReference } },
    }, browserHeaders);
    assert.equal(caretRegistered.status, 200);
    const caretListed = await request("GET", "/api/sessions", undefined, agentHeaders);
    assert.equal(caretListed.payload.sessions[0].context.selection.available, true);
    assert.equal(caretListed.payload.sessions[0].context.selection.mode, "caret");
    assert.deepEqual(caretListed.payload.sessions[0].context.selection.caretReference, caretReference);

    const switched = await request("POST", "/api/sessions/register", {
      sessionId: "selection-session",
      binding: { projectId: "page-project", companyId: "page-company", pageType: "asset-draft", tabId: 22 },
      context: { route: { isTianyuanRoute: true, projectId: "page-project" }, selection: { available: false } },
    }, browserHeaders);
    assert.equal(switched.status, 200);
    const afterSwitch = await request("GET", "/api/sessions", undefined, agentHeaders);
    assert.equal(afterSwitch.payload.sessions[0].context.selection.available, false);
    assert.equal(afterSwitch.payload.sessions[0].context.selection.text, "");
    assert.equal(afterSwitch.payload.sessions[0].context.selection.tabId, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log("Selection context checks passed.");
