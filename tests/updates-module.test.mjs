import assert from "node:assert/strict";
import { ModuleScope } from "../extension/src/core/module-scope.js";
import { updatesModule } from "../extension/src/modules/updates/module.js";

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
    this.href = "";
    this.innerHTML = "";
    this.rel = "";
    this.textContent = "";
    this.children = [];
    this.value = 0;
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
const fakeWindow = new EventTarget();
fakeWindow.setTimeout = setTimeout;
fakeWindow.clearTimeout = clearTimeout;
fakeWindow.setInterval = setInterval;
fakeWindow.clearInterval = clearInterval;
fakeWindow.confirm = () => true;
globalThis.window = fakeWindow;

const elementIds = [
  "page-updates",
  "openUpdatesTop",
  "updateTopStatus",
  "backFromUpdates",
  "updateHeadline",
  "updateDescription",
  "updateBadge",
  "updateCurrentVersion",
  "updateLatestVersion",
  "updateChannel",
  "updateBuildNumber",
  "updatePlatform",
  "updateCheckedAt",
  "updateFeedback",
  "checkForUpdates",
  "testUpdate",
  "installUpdate",
  "downloadUpdate",
  "openReleasePage",
  "updateProgressPanel",
  "updateProgressBar",
  "updateProgressText",
  "updateNotes",
  "updateAssetName",
  "updateAssetSize",
  "updateAssetSha",
];
const elements = new Map(elementIds.map((id) => [id, new FakeElement(id)]));
const documentRef = {
  visibilityState: "visible",
  head: new FakeElement("head"),
  getElementById(id) {
    return elements.get(id) || null;
  },
  createElement() {
    return new FakeElement();
  },
};
const savedResult = {
  ok: true,
  releasePublished: true,
  updateAvailable: false,
  latestVersion: "0.11.0",
  currentVersion: "0.11.0",
  currentBuildNumber: 0,
  currentRuntimeBuildId: "",
  checkedAt: new Date().toISOString(),
  channel: "development",
  platform: "macos-arm64",
  asset: {
    name: "tianyuan-workbench-v0.11.0-macos-arm64.zip",
    url: "https://github.com/example/update.zip",
    size: 120 * 1024 * 1024,
    sha256: "a".repeat(64),
  },
  notes: ["模块化测试"],
};
const storage = {
  saved: null,
  async migrateLegacy() {
    return savedResult;
  },
  async save(value) {
    this.saved = value;
  },
};
const navigation = [];
const statuses = [];
const connections = [];
const nativeMessages = [];
const moduleInstance = updatesModule.create();
const updateScope = new ModuleScope();
await moduleInstance.initialize({
  chrome: {
    runtime: {
      getURL(relativePath) {
        return `chrome-extension://test/${relativePath}`;
      },
      reload() {},
    },
    tabs: {
      async create() {},
    },
  },
  connectorProtocolVersion: "connector-agent-binding-v3",
  document: documentRef,
  extensionManifest: {
    version: "0.11.0",
    version_name: "0.11.0",
  },
  isBusy() {
    return true;
  },
  manifest: updatesModule.manifest,
  navigate(route) {
    navigation.push(route);
  },
  scope: updateScope,
  async sendNativeMessage(message) {
    nativeMessages.push(message);
    if (message.action === "test_workbench_update") {
      return {
        ok: true,
        action: "test_workbench_update",
        mode: "test",
        phase: "test_complete",
        percent: 100,
        installed: false,
        packageValid: true,
        message: "更新模块测试通过",
      };
    }
    return savedResult;
  },
  setConnection(_element, text, kind) {
    connections.push({ text, kind });
  },
  setStatus(text, kind) {
    statuses.push({ text, kind });
  },
  storage,
});

assert.match(elements.get("page-updates").innerHTML, /id="checkForUpdates"/);
assert.match(elements.get("page-updates").innerHTML, /id="testUpdate"/);
assert.equal(documentRef.head.children.length, 1);
assert.equal(
  documentRef.head.children[0].href,
  "chrome-extension://test/src/modules/updates/styles.css",
);
assert.equal(elements.get("updateHeadline").textContent, "已是最新版本");
assert.equal(elements.get("updateCurrentVersion").textContent, "v0.11.0");
assert.equal(elements.get("updateLatestVersion").textContent, "v0.11.0");

elements.get("openUpdatesTop").dispatchEvent(new Event("click"));
elements.get("backFromUpdates").dispatchEvent(new Event("click"));
assert.deepEqual(navigation, ["updates", "home"]);
assert.equal(statuses.length, 0);
assert.equal(connections.at(-1).text, "v0.11.0");

elements.get("testUpdate").dispatchEvent(new Event("click"));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(
  nativeMessages.some((message) => message.action === "test_workbench_update"),
  true,
);
assert.match(elements.get("updateFeedback").textContent, /测试通过/);
assert.equal(elements.get("testUpdate").textContent, "测试更新模块");
assert.equal(elements.get("testUpdate").disabled, false);

updateScope.dispose();
globalThis.window = originalWindow;
console.log("Updates module tests passed.");
