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
    this._innerHTML = "";
    this.rel = "";
    this.textContent = "";
    this.children = [];
    this.value = 0;
    this.hidden = false;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? "");
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    if (selector !== "summary") return null;
    this.summary ||= new FakeElement(`${this.id}-summary`);
    return this.summary;
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
  "updatePrimaryAction",
  "updateTestNote",
  "updateMoreActions",
  "updateNotesDetails",
  "updateNotesRemainingDetails",
  "updateNotesRemaining",
  "updateTechnicalDetails",
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
  "copyUpdateDiagnostics",
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
  notes: ["模块化测试 1", "模块化测试 2", "模块化测试 3", "模块化测试 4", "模块化测试 5", "模块化测试 6", "模块化测试 7"],
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
const diagnosticCopies = [];
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      async writeText(value) {
        diagnosticCopies.push(value);
      },
    },
  },
});
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
assert.match(elements.get("page-updates").innerHTML, /id="updatePrimaryAction"/);
assert.match(elements.get("page-updates").innerHTML, /id="updateMoreActions"/);
assert.match(elements.get("page-updates").innerHTML, /id="copyUpdateDiagnostics"/);
assert.match(elements.get("page-updates").innerHTML, /id="updateNotesRemainingDetails"/);
assert.equal(documentRef.head.children.length, 1);
assert.equal(
  documentRef.head.children[0].href,
  "chrome-extension://test/src/modules/updates/styles.css",
);
assert.equal(elements.get("updateHeadline").textContent, "已是最新版本");
assert.equal(elements.get("updateCurrentVersion").textContent, "v0.11.0");
assert.equal(elements.get("updateLatestVersion").textContent, "v0.11.0");
assert.equal(elements.get("updatePrimaryAction").textContent, "重新检查");
assert.equal(elements.get("updateAssetSize").textContent, "120.0 MB");
assert.match(elements.get("updateTestNote").textContent, /当前平台安装包（120\.0 MB）/);
assert.doesNotMatch(elements.get("updateTestNote").textContent, /完整包/);
assert.equal(elements.get("updateNotes").children.length, 5);
assert.equal(elements.get("updateNotesRemaining").children.length, 2);
assert.equal(elements.get("updateNotesRemainingDetails").hidden, false);
assert.equal(elements.get("updateNotesRemainingDetails").summary.textContent, "查看其余 2 条");
assert.equal(elements.get("testUpdate").disabled, false);
assert.equal(elements.get("installUpdate").disabled, true);

elements.get("openUpdatesTop").dispatchEvent(new Event("click"));
elements.get("backFromUpdates").dispatchEvent(new Event("click"));
assert.deepEqual(navigation, ["updates", "home"]);
assert.equal(statuses.length, 0);
assert.equal(connections.at(-1).text, "v0.11.0");

elements.get("copyUpdateDiagnostics").dispatchEvent(new Event("click"));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(diagnosticCopies.length, 1);
assert.equal(JSON.parse(diagnosticCopies[0]).currentVersion, "0.11.0");

elements.get("updatePrimaryAction").dispatchEvent(new Event("click"));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(
  nativeMessages.some((message) => message.action === "check_github_update"),
  true,
);

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
if (originalNavigatorDescriptor) {
  Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
} else {
  delete globalThis.navigator;
}
console.log("Updates module tests passed.");
