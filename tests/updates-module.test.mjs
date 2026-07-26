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
globalThis.window = fakeWindow;

const elementIds = [
  "page-updates",
  "openUpdatesTop",
  "updateTopStatus",
  "openUpdates",
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
  "downloadUpdate",
  "openReleasePage",
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
const moduleInstance = updatesModule.create();
const updateScope = new ModuleScope();
await moduleInstance.initialize({
  chrome: {
    runtime: {
      getURL(relativePath) {
        return `chrome-extension://test/${relativePath}`;
      },
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
  async sendNativeMessage() {
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
assert.equal(documentRef.head.children.length, 1);
assert.equal(
  documentRef.head.children[0].href,
  "chrome-extension://test/src/modules/updates/styles.css",
);
assert.equal(elements.get("updateHeadline").textContent, "已是最新版本");
assert.equal(elements.get("updateCurrentVersion").textContent, "v0.11.0");
assert.equal(elements.get("updateLatestVersion").textContent, "v0.11.0");

elements.get("openUpdates").dispatchEvent(new Event("click"));
elements.get("backFromUpdates").dispatchEvent(new Event("click"));
assert.deepEqual(navigation, ["updates", "home"]);
assert.equal(statuses.length, 0);
assert.equal(connections.at(-1).text, "v0.11.0");

updateScope.dispose();
globalThis.window = originalWindow;
console.log("Updates module tests passed.");
