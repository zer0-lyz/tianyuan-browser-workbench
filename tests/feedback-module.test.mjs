import assert from "node:assert/strict";
import { ModuleScope } from "../extension/src/core/module-scope.js";
import {
  feedbackMarkdown,
  feedbackModule,
  issueUrl,
  validateFeedbackDraft,
} from "../extension/src/modules/feedback/module.js";

class FakeClassList {
  toggle() {}
}

class FakeElement extends EventTarget {
  constructor(id = "") {
    super();
    this.id = id;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.checked = false;
    this.href = "";
    this.innerHTML = "";
    this.rel = "";
    this.textContent = "";
    this.value = "";
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }
}

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const fakeWindow = new EventTarget();
fakeWindow.setTimeout = setTimeout;
fakeWindow.clearTimeout = clearTimeout;
globalThis.window = fakeWindow;

const elementIds = [
  "page-feedback",
  "openFeedbackTop",
  "backFromFeedback",
  "feedbackDraftStatus",
  "feedbackType",
  "feedbackTitle",
  "feedbackDescription",
  "feedbackSteps",
  "feedbackIncludeDiagnostics",
  "feedbackPrivacyConfirm",
  "feedbackMessage",
  "submitFeedback",
  "copyFeedback",
  "clearFeedback",
  "feedbackDeliveryMode",
  "feedbackChannelStatus",
];
const elements = new Map(elementIds.map((id) => [id, new FakeElement(id)]));
const documentRef = {
  head: new FakeElement("head"),
  getElementById(id) {
    return elements.get(id) || null;
  },
  createElement() {
    return new FakeElement();
  },
};
globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return {
      schemaVersion: 1,
      deliveryMode: "copy",
      endpoint: "",
      githubRepository: "zer0-lyz/tianyuan-browser-workbench-feedback",
      githubIssuesEnabled: false,
      publicChannel: false,
    };
  },
});

const storage = {
  saved: null,
  async load() {
    return {
      type: "bug",
      title: "草稿标题",
      description: "草稿说明",
      steps: "",
      includeDiagnostics: true,
    };
  },
  async save(value) {
    this.saved = value;
  },
  async clear() {
    this.saved = null;
  },
};
const navigation = [];
const copied = [];
const statuses = [];
const scope = new ModuleScope();
const instance = feedbackModule.create();
await instance.initialize({
  chrome: {
    runtime: {
      getURL(relativePath) {
        return `chrome-extension://test/${relativePath}`;
      },
    },
  },
  document: documentRef,
  manifest: feedbackModule.manifest,
  navigate(route) {
    navigation.push(route);
  },
  scope,
  storage,
  async getSafeDiagnostics() {
    return {
      version: "0.12.2",
      buildNumber: 2026072701,
      platform: "mac",
      architecture: "arm64",
      connectorConnected: true,
      mcpStatus: "connected",
      cliStatus: "connected",
    };
  },
  async copyText(value) {
    copied.push(value);
  },
  setStatus(text, kind) {
    statuses.push({ text, kind });
  },
});

assert.match(elements.get("page-feedback").innerHTML, /id="submitFeedback"/);
assert.equal(documentRef.head.children.length, 1);
assert.equal(
  documentRef.head.children[0].href,
  "chrome-extension://test/src/modules/feedback/styles.css",
);
assert.equal(elements.get("feedbackTitle").value, "草稿标题");
assert.equal(elements.get("submitFeedback").disabled, true);

elements.get("openFeedbackTop").dispatchEvent(new Event("click"));
elements.get("backFromFeedback").dispatchEvent(new Event("click"));
assert.deepEqual(navigation, ["feedback", "home"]);

elements.get("feedbackPrivacyConfirm").checked = true;
elements.get("copyFeedback").dispatchEvent(new Event("click"));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(copied.length, 1);
assert.match(copied[0], /草稿标题/);
assert.match(copied[0], /"version": "0.12.2"/);
assert.equal(copied[0].includes("projectId"), false);
assert.equal(statuses.at(-1).kind, "ok");

assert.equal(
  validateFeedbackDraft({
    type: "bug",
    title: "包含敏感信息",
    description: "Authorization: Bearer abcdefghijklmnop",
    steps: "",
  }, true),
  "检测到疑似 token、鉴权信息或本机文件路径，请删除后再提交",
);
assert.equal(
  validateFeedbackDraft({
    type: "bug",
    title: "",
    description: "说明",
    steps: "",
  }, true),
  "请填写反馈标题",
);

const markdown = feedbackMarkdown({
  type: "feature",
  title: "建议",
  description: "增加筛选",
  steps: "",
}, null);
assert.match(markdown, /功能建议/);
assert.equal(
  issueUrl({
    deliveryMode: "github-issues",
    githubIssuesEnabled: true,
    githubRepository: "zer0-lyz/tianyuan-browser-workbench-feedback",
  }, {
    type: "feature",
    title: "建议",
  }, markdown).startsWith(
    "https://github.com/zer0-lyz/tianyuan-browser-workbench-feedback/issues/new?",
  ),
  true,
);
assert.equal(
  issueUrl({
    deliveryMode: "github-issues",
    githubIssuesEnabled: true,
    githubRepository: "invalid repository",
  }, {
    type: "feature",
    title: "建议",
  }, markdown),
  "",
);

scope.dispose();
globalThis.window = originalWindow;
globalThis.fetch = originalFetch;
console.log("Feedback module tests passed.");
