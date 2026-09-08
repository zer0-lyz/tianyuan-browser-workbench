"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const helper = require(path.join(repoRoot, "native-helper/alibaba-auction.js"));

test("alibaba auction module is wired for deterministic current-tab scraping", () => {
  for (const relative of [
    "extension/src/modules/alibaba-auction/module.js",
    "extension/src/modules/alibaba-auction/template.js",
    "extension/src/modules/alibaba-auction/styles.css",
    "extension/src/modules/alibaba-auction/regions.js",
    "native-helper/alibaba-auction.js",
  ]) assert.ok(fs.existsSync(path.join(repoRoot, relative)), `missing ${relative}`);

  const moduleSource = fs.readFileSync(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"), "utf8");
  const helperSource = fs.readFileSync(path.join(repoRoot, "native-helper/alibaba-auction.js"), "utf8");
  const sidepanel = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
  const html = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/index.html"), "utf8");
  const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
  const installer = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
  assert.match(moduleSource, /id: "alibaba-auction"/);
  assert.match(moduleSource, /stage: "stable"/);
  assert.match(moduleSource, /runCurrentTabScrape/);
  assert.match(moduleSource, /synchronizeAlibabaAuctionStatus/);
  assert.match(moduleSource, /syncStatusOnCurrentPage/);
  assert.match(moduleSource, /ALIBABA_STATUS_CONTROL_NOT_FOUND/);
  assert.match(moduleSource, /phase: "syncing_filters"/);
  assert.match(moduleSource, /write_alibaba_auction_result/);
  assert.match(moduleSource, /open_alibaba_auction_path/);
  assert.match(moduleSource, /htmlPath/);
  assert.match(moduleSource, /mapPath: String\(saved\?\.mapPath/);
  assert.match(moduleSource, /directFirstDistrict/);
  assert.match(moduleSource, /stripLocationPrefixes/);
  assert.match(moduleSource, /hasEndedText/);
  assert.match(moduleSource, /装修及其他介绍/);
  assert.match(moduleSource, /租赁情况/);
  assert.match(moduleSource, /directNormalizeLease/);
  assert.match(moduleSource, /fetchAlibabaAttachmentBuffersFromBrowser/);
  assert.match(moduleSource, /world: "MAIN"/);
  assert.match(moduleSource, /tabs\.create\(\{ url: "https:\/\/sf\.taobao\.com\//);
  assert.match(helperSource, /downloadAttachmentWithBrowser/);
  assert.match(helperSource, /ALIBABA_BROWSER_TARGET_MISMATCH/);
  assert.match(helperSource, /browserTargetArgs\(page\.target\)/);
  assert.match(helperSource, /context\.target/);
  assert.match(helperSource, /enrichDetailFromAttachments/);
  assert.match(helperSource, /enrichDetailFromAttachmentBuffers/);
  assert.match(helperSource, /PDF_OCR_SCRIPT/);
  assert.match(helperSource, /rapidocr_onnxruntime/);
  assert.match(helperSource, /extractPdfTextWithOcr/);
  assert.match(helperSource, /OCR_MAX_PAGES/);
  assert.match(helper.DETAIL_EXTRACT_SCRIPT, /download_attach/);
  assert.doesNotMatch(moduleSource, /alibabaAuctionResultBody/);
  assert.match(sidepanel, /import \{ alibabaAuctionModule \}/);
  assert.match(sidepanel, /moduleRegistry\.register\(alibabaAuctionModule\)/);
  assert.match(html, /id="openAlibabaAuction"/);
  assert.match(html, /id="page-alibaba-auction"/);
  const template = fs.readFileSync(path.join(repoRoot, "extension/src/modules/alibaba-auction/template.js"), "utf8");
  const styles = fs.readFileSync(path.join(repoRoot, "extension/src/modules/alibaba-auction/styles.css"), "utf8");
  assert.match(template, /id="alibabaAuctionStartDate" type="date"/);
  assert.match(template, /id="alibabaAuctionEndDate" type="date"/);
  assert.match(template, /value="residential">住宅用房/);
  assert.match(template, /value="commercial">商业房/);
  assert.match(template, /<select id="alibabaAuctionProvince"/);
  assert.match(template, /<select id="alibabaAuctionCity"/);
  assert.match(template, /<select id="alibabaAuctionDistrict"/);
  assert.match(template, /id="alibabaAuctionProgressBar"/);
  assert.match(template, /id="alibabaAuctionProgressPercent"/);
  assert.match(template, /id="alibabaAuctionProgressVerified"/);
  assert.match(template, /id="pauseAlibabaAuction"/);
  assert.match(template, /id="stopAlibabaAuction"/);
  assert.match(template, /id="alibabaAuctionParameterState"/);
  assert.match(template, /确认并应用参数/);
  assert.match(template, /确认并应用参数[\s\S]*打开并登录[\s\S]*开始抓取[\s\S]*恢复默认/);
  assert.match(template, /id="openAlibabaAuctionSource"[^>]*>打开并登录</);
  assert.match(template, /id="runAlibabaAuction"[^>]*>开始抓取</);
  assert.doesNotMatch(template, /当前页打开并登录|在当前页开始抓取/);
  assert.doesNotMatch(template, /保存参数/);
  assert.match(moduleSource, /parameterSnapshot/);
  assert.match(moduleSource, /requireAppliedParameters/);
  assert.match(moduleSource, /参数有改动，需重新应用/);
  assert.match(moduleSource, /sourceUrl: buildSourceUrl\(requestConfig\)/);
  assert.match(moduleSource, /runCurrentTabScrape/);
  assert.match(moduleSource, /executeCurrentTab/);
  assert.match(moduleSource, /navigateCurrentTab/);
  assert.match(moduleSource, /directPageBeforeRequestedRange/);
  assert.match(moduleSource, /第 \$\{page\} 页日期已早于所选起始日/);
  assert.match(moduleSource, /waitForManualVerification/);
  assert.match(moduleSource, /waitForRunResume/);
  assert.match(moduleSource, /ALIBABA_SCRAPE_STOPPED/);
  assert.match(moduleSource, /phase: "stopped"/);
  assert.match(moduleSource, /正在终止当前抓取/);
  assert.match(moduleSource, /togglePause/);
  assert.match(moduleSource, /verification_required/);
  assert.match(moduleSource, /ALIBABA_VERIFICATION_TIMEOUT/);
  assert.match(moduleSource, /当前浏览器/);
  assert.match(moduleSource, /function renderProgress/);
  assert.match(moduleSource, /phase: "completed"/);
  assert.match(moduleSource, /generating_results/);
  assert.match(moduleSource, /locating_coordinates/);
  assert.match(moduleSource, /正在完成本地结果写入，完成后终止/);
  assert.match(nativeHost, /geocodeRequested/);
  assert.match(nativeHost, /geocodeCacheHits/);
  assert.match(nativeHost, /geocodeDurationMs/);
  assert.doesNotMatch(template, /行政区代码|330102|alibabaAuctionLocationCode/);
  assert.doesNotMatch(template, /目标案例数|最多检索页数|alibabaAuctionTargetCount|alibabaAuctionMaxPages/);
  assert.doesNotMatch(moduleSource, /alibabaAuctionLocationCode|targetCount|maxPages/);
  assert.doesNotMatch(template, /alibabaAuction.*Picker|data-date-action|data-date-target/);
  assert.match(template, /alibaba-auction-keyword-field/);
  assert.match(styles, /max-width: 640px[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /alibaba-auction-keyword-field[\s\S]*grid-column: 1 \/ -1/);
  assert.doesNotMatch(template, /class="[^"]*alibaba-auction-date-picker"/);
  assert.match(moduleSource, /addEventListener|scope\.on/);
  assert.match(moduleSource, /syncConfigFromInputs/);
  assert.match(nativeHost, /message\?\.action === "run_alibaba_auction"/);
  assert.match(nativeHost, /message\?\.action === "open_alibaba_auction"/);
  assert.match(nativeHost, /message\?\.action === "enrich_alibaba_auction_detail"/);
  assert.match(nativeHost, /message\?\.action === "open_alibaba_auction_path"/);
  assert.match(nativeHost, /message\?\.action === "write_alibaba_auction_result"/);
  assert.match(nativeHost, /message\?\.action === "write_alibaba_auction_excel"/);
  assert.match(nativeHost, /message\?\.action === "select_alibaba_auction_output_directory"/);
  assert.match(manifestSource(path.join(repoRoot, "extension/manifest.json")), /sf\.taobao\.com/);
  assert.match(installer, /alibaba-auction\.js/);
  assert.match(template, /id="openAlibabaAuctionResult"/);
  assert.match(template, /id="exportAlibabaAuctionExcel"/);
  assert.match(template, /id="openAlibabaAuctionExcel"/);
  assert.match(template, /id="alibabaAuctionOutputDirectory"/);
  assert.match(template, /id="chooseAlibabaAuctionOutput"/);
  assert.match(template, /id="alibabaAuctionGenerateMap"/);
  assert.match(template, /id="openAlibabaAuctionMap"/);
  assert.doesNotMatch(template, /<table|alibabaAuctionResultBody/);
  assert.doesNotMatch(helper.LIST_EXTRACT_SCRIPT, /fetch\s*\(/);
  assert.doesNotMatch(helper.DETAIL_EXTRACT_SCRIPT, /cookie|authorization|password|token/i);
});

function manifestSource(readPath) {
  return fs.readFileSync(readPath, "utf8");
}

class AlibabaFixtureClassList {
  constructor(value = "") {
    this.values = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  contains(value) {
    return this.values.has(value);
  }

  add(...values) {
    for (const value of values) this.values.add(value);
  }

  remove(...values) {
    for (const value of values) this.values.delete(value);
  }

  toggle(value, force) {
    const shouldAdd = force === undefined ? !this.contains(value) : Boolean(force);
    if (shouldAdd) this.add(value);
    else this.remove(value);
    return shouldAdd;
  }

  toString() {
    return [...this.values].join(" ");
  }
}

class AlibabaFixtureElement {
  constructor(tagName, options = {}) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = { ...(options.attributes || {}) };
    this.id = options.id || this.attributes.id || "";
    this._text = String(options.text || "");
    this._classList = new AlibabaFixtureClassList(options.className || "");
    this.style = { display: options.display || "", visibility: "", opacity: "" };
    this.listeners = new Map();
    if (this.id) this.attributes.id = this.id;
    if (options.role) this.attributes.role = options.role;
  }

  get className() {
    return this._classList.toString();
  }

  set className(value) {
    this._classList = new AlibabaFixtureClassList(value);
  }

  get classList() {
    return this._classList;
  }

  get textContent() {
    return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join("");
  }

  set textContent(value) {
    this._text = String(value || "");
    this.children = [];
  }

  get innerText() {
    return this.textContent;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return children.at(-1);
  }

  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  focus() {
    this.dispatchEvent(new this.ownerWindow.MouseEvent("focus", { bubbles: false }));
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name === "class") return this.className || null;
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
    if (name === "class") this.className = String(value);
  }

  matches(selector) {
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      if (!value) return false;
      if (value === "*") return true;
      const id = value.match(/#([A-Za-z0-9_-]+)/);
      if (id && this.id !== id[1]) return false;
      const tag = value.match(/^([A-Za-z][A-Za-z0-9-]*)/);
      if (tag && this.tagName !== tag[1].toUpperCase()) return false;
      const role = value.match(/\[role=["']?([^"'\]]+)/);
      if (role && this.getAttribute("role") !== role[1]) return false;
      if (value.includes("[aria-haspopup")) {
        if (this.getAttribute("aria-haspopup") === null) return false;
      }
      const classMatch = value.match(/\.([A-Za-z0-9_-]+)/);
      if (classMatch && !this.classList.contains(classMatch[1])) return false;
      if (value.includes("[id^=\"ks-content-\"]") && !this.id.startsWith("ks-content-")) return false;
      return Boolean(id || tag || role || classMatch || value.includes("[aria-haspopup") || value.includes("[id^="));
    });
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 150, bottom: 30, width: 150, height: 30 };
  }
}

class AlibabaFixtureOption extends AlibabaFixtureElement {
  constructor(label, value) {
    super("option", { text: label });
    this.value = value;
    this.selected = false;
  }
}

class AlibabaFixtureSelect extends AlibabaFixtureElement {
  constructor(options) {
    super("select", { id: "J_AuctionStatusSort", className: "pai-select", display: "none" });
    this.options = options;
  }

  get selectedOptions() {
    return this.options.filter((option) => option.selected);
  }

  get value() {
    return this.options.find((option) => option.selected)?.value || "";
  }

  set value(value) {
    const next = this.options.find((option) => String(option.value) === String(value));
    for (const option of this.options) option.selected = option === next;
  }
}

class AlibabaFixtureEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.defaultPrevented = false;
    Object.assign(this, init);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

function createAlibabaStatusFixture({ updateOnClick = true, placeholderOnAll = true, mountDelayMs = 0 } = {}) {
  const documentRef = new AlibabaFixtureElement("document");
  documentRef.body = documentRef;
  const locationRef = {
    href: "https://sf.taobao.com/list/50025969__-1___%BA%BC%D6%DD.htm?auction_start_seg=0",
  };
  const windowRef = {
    Event: AlibabaFixtureEvent,
    MouseEvent: AlibabaFixtureEvent,
    PointerEvent: undefined,
    location: locationRef,
    history: {
      state: null,
      replaceState(_state, _title, url) {
        locationRef.href = new URL(url, locationRef.href).href;
      },
    },
    setTimeout,
    clearTimeout,
    getComputedStyle(element) {
      return element.style;
    },
  };
  const linkWindow = (element) => {
    element.ownerWindow = windowRef;
    for (const child of element.children) linkWindow(child);
  };
  const trigger = new AlibabaFixtureElement("div", {
    id: "ks-component875",
    className: "bf-select bf-menu-button bf-button",
    role: "button",
    attributes: { tabindex: "0", "aria-expanded": "false", "aria-haspopup": "ks-component945" },
  });
  const content = new AlibabaFixtureElement("div", {
    id: "ks-content-ks-component875",
    className: "bf-select-content bf-menu-button-content bf-button-content",
    text: "拍卖状态",
  });
  const menu = new AlibabaFixtureElement("div", {
    id: "ks-component945",
    className: "bf-popupmenu bf-menu bf-popupmenu-hidden bf-menu-hidden",
    role: "menu",
  });
  const optionLabels = [
    ["不限", ""],
    ["正在进行", "正在进行"],
    ["即将开始", "即将开始"],
    ["已结束", "已结束"],
    ["中止", "中止"],
    ["撤回", "撤回"],
  ];
  const select = new AlibabaFixtureSelect(optionLabels.map(([label, value]) => new AlibabaFixtureOption(label, value)));
  select.options[0].selected = true;
  const menuItems = optionLabels.map(([label]) => new AlibabaFixtureElement("div", {
    id: "menu-" + label,
    text: label,
    className: "bf-menuitem ks-component-child944",
    role: "menuitem",
  }));
  const row = new AlibabaFixtureElement("li", { className: "block select auction-sort-select" });
  trigger.append(content);
  row.append(trigger, select);
  menu.append(...menuItems);
  if (mountDelayMs > 0) windowRef.setTimeout(() => documentRef.append(row, menu), mountDelayMs);
  else documentRef.append(row, menu);
  linkWindow(documentRef);

  const events = { trigger: [], finished: [], all: [] };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "focus"]) {
    trigger.addEventListener(type, () => events.trigger.push(type));
  }
  for (const item of menuItems) {
    const bucket = item.innerText === "已结束" ? events.finished : item.innerText === "不限" ? events.all : null;
    if (!bucket) continue;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      item.addEventListener(type, () => bucket.push(type));
    }
  }
  trigger.addEventListener("click", () => {
    trigger.setAttribute("aria-expanded", "true");
    menu.className = "bf-popupmenu bf-menu";
  });
  for (const item of menuItems) {
    item.addEventListener("click", () => {
      if (!updateOnClick) return;
      const selected = select.options.find((option) => option.innerText === item.innerText);
      select.value = selected.value;
      for (const menuItem of menuItems) menuItem.classList.toggle("bf-menuitem-selected", menuItem === item);
      content.textContent = item.innerText === "不限" && placeholderOnAll ? "拍卖状态" : item.innerText;
      trigger.setAttribute("aria-expanded", "false");
      menu.className = "bf-popupmenu bf-menu bf-popupmenu-hidden bf-menu-hidden";
    });
  }

  documentRef.getElementById = (id) => {
    if (documentRef.id === id) return documentRef;
    return [documentRef, ...documentRef.querySelectorAll("*")].find((element) => element.id === id) || null;
  };
  linkWindow(row);
  linkWindow(menu);
  return { document: documentRef, window: windowRef, trigger, select, menu, events, location: locationRef };
}

test("Alibaba status sync uses the custom menu fixture and verifies visible/native readback", async () => {
  const fixture = createAlibabaStatusFixture();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  try {
    globalThis.document = fixture.document;
    globalThis.window = fixture.window;
    const { synchronizeAlibabaAuctionStatus } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));

    const initialAll = await synchronizeAlibabaAuctionStatus("all");
    assert.equal(initialAll.ok, true);
    assert.equal(initialAll.changed, false);
    assert.equal(initialAll.label, "不限");
    assert.deepEqual(initialAll.readback, { triggerLabel: "拍卖状态", selectLabel: "不限" });
    assert.equal(new URL(fixture.location.href).searchParams.get("auction_start_seg"), "-1");

    const finished = await synchronizeAlibabaAuctionStatus("finished");
    assert.equal(finished.ok, true);
    assert.equal(finished.changed, true);
    assert.equal(finished.label, "已结束");
    assert.deepEqual(finished.readback, { triggerLabel: "已结束", selectLabel: "已结束" });
    assert.deepEqual(finished.eventSequence, [
      "pointerdown", "mousedown", "focus", "pointerup", "mouseup", "click",
      "pointerdown", "mousedown", "pointerup", "mouseup", "click",
    ]);
    assert.equal(fixture.trigger.querySelector(".bf-select-content").innerText, "已结束");
    assert.equal(fixture.select.value, "已结束");
    assert.equal(fixture.menu.classList.contains("bf-menu-hidden"), true);
    assert.equal(new URL(fixture.location.href).searchParams.get("auction_start_seg"), "0");

    fixture.events.trigger.length = 0;
    fixture.events.all.length = 0;
    const all = await synchronizeAlibabaAuctionStatus("all");
    assert.equal(all.ok, true);
    assert.equal(all.label, "不限");
    assert.deepEqual(all.readback, { triggerLabel: "拍卖状态", selectLabel: "不限" });
    assert.equal(fixture.trigger.querySelector(".bf-select-content").innerText, "拍卖状态");
    assert.equal(fixture.select.value, "");
    assert.equal(new URL(fixture.location.href).searchParams.get("auction_start_seg"), "-1");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("Alibaba status sync fails closed when the custom control does not echo the target", async () => {
  const fixture = createAlibabaStatusFixture({ updateOnClick: false });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  try {
    globalThis.document = fixture.document;
    globalThis.window = fixture.window;
    const { synchronizeAlibabaAuctionStatus } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
    const result = await synchronizeAlibabaAuctionStatus("finished");
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ALIBABA_STATUS_READBACK_FAILED");
    assert.match(result.reason, /未回显目标值/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("Alibaba status sync waits for a delayed real control mount", async () => {
  const fixture = createAlibabaStatusFixture({ mountDelayMs: 120 });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  try {
    globalThis.document = fixture.document;
    globalThis.window = fixture.window;
    const { synchronizeAlibabaAuctionStatus } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
    const result = await synchronizeAlibabaAuctionStatus("finished");
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.readback, { triggerLabel: "已结束", selectLabel: "已结束" });
    assert.equal(fixture.select.value, "已结束");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("Alibaba status sync is idempotent across consecutive finished calls", async () => {
  const fixture = createAlibabaStatusFixture();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  try {
    globalThis.document = fixture.document;
    globalThis.window = fixture.window;
    const { synchronizeAlibabaAuctionStatus } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
    const first = await synchronizeAlibabaAuctionStatus("finished");
    const finishedEventsAfterFirstCall = fixture.events.finished.length;
    const second = await synchronizeAlibabaAuctionStatus("finished");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.state, "finished");
    assert.equal(second.state, "finished");
    assert.equal(first.label, "已结束");
    assert.equal(second.label, "已结束");
    assert.equal(second.changed, false);
    assert.equal(fixture.events.finished.length, finishedEventsAfterFirstCall);
    assert.equal(new URL(fixture.location.href).searchParams.get("auction_start_seg"), "0");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("current-page opening retries status synchronization once after a slow page mount", async () => {
  const previousWindow = globalThis.window;
  const outcomes = [
    { ok: false, errorCode: "ALIBABA_STATUS_CONTROL_NOT_FOUND", reason: "slow mount" },
    { ok: true, changed: false, state: "finished", label: "已结束" },
  ];
  let executeCount = 0;
  try {
    globalThis.window = { setTimeout, clearTimeout };
    const { synchronizeAlibabaAuctionStatusOnTab } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
    const chromeRef = {
      scripting: {
        async executeScript() {
          executeCount += 1;
          return [{ result: outcomes.shift() }];
        },
      },
      tabs: { async get(tabId) { return { id: tabId }; } },
    };
    const result = await synchronizeAlibabaAuctionStatusOnTab(chromeRef, { id: 7 }, "finished");
    assert.equal(result.statusSync.ok, true);
    assert.equal(executeCount, 2);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("result generation progress switches phase at 99 percent without mentioning coordinates when map is disabled", async () => {
  const { hasDirectCoordinates, resultGenerationProgress } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  const results = [{ longitude: 120.1, latitude: 30.2 }, { address: "杭州市测试路 1 号" }];
  assert.equal(hasDirectCoordinates(results[0]), true);
  assert.equal(hasDirectCoordinates(results[1]), false);
  const withMap = resultGenerationProgress(results, { generateMap: true }, { fetched: 2, verified: 1, skipped: 1 });
  assert.equal(withMap.phase, "locating_coordinates");
  assert.equal(withMap.percent, 99);
  assert.match(withMap.message, /1 条缺失坐标/);
  assert.equal(withMap.verified, 1);
  const withoutMap = resultGenerationProgress(results, { generateMap: false }, { fetched: 2, verified: 1, skipped: 1 });
  assert.equal(withoutMap.phase, "generating_results");
  assert.equal(withoutMap.percent, 99);
  assert.equal(withoutMap.message, "正在生成结果页");
  assert.doesNotMatch(withoutMap.message, /坐标|地图/);
});

test("parameter snapshots distinguish applied values from later edits", async () => {
  const { normalizeConfig, parameterSnapshotMatches } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  const applied = normalizeConfig({
    provinceCode: "330000",
    cityCode: "330100",
    districtCode: "330102",
    propertyType: "residential",
    status: "finished",
    keyword: "测试路",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    outputDirectory: "/tmp/alibaba-auction",
    generateMap: true,
  });
  assert.equal(parameterSnapshotMatches(applied, { ...applied }), true);
  assert.equal(parameterSnapshotMatches({ ...applied, status: "all" }, applied), false);
  assert.equal(parameterSnapshotMatches({ ...applied, keyword: "另一条路" }, applied), false);
  assert.equal(parameterSnapshotMatches({ ...applied, outputDirectory: "/tmp/other" }, applied), false);
  assert.equal(parameterSnapshotMatches(applied, null), false);
});

test("source category and request validation stay deterministic", async () => {
  const { buildSourceUrl, directCandidateInScope, directExtractBuildingAreaFromText, directExtractFloorFieldsFromText, directPageBeforeRequestedRange, isAlibabaListPage, listPageMatchesRequest, normalizeConfig, statusFilterMatchesRequest, statusFilterLabels, usableDistricts } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  for (const [propertyType, category] of [
    ["residential", "50025969"],
    ["commercial", "200782003"],
  ]) {
    const url = new URL(buildSourceUrl(normalizeConfig({ propertyType, provinceCode: "330000", cityCode: "330100", districtCode: "330102" })));
    assert.equal(url.pathname, `/list/${category}__2___%BA%BC%D6%DD.htm`);
    assert.equal(url.searchParams.get("location_code"), "330102");
  }
  const provinceOnly = new URL(buildSourceUrl(normalizeConfig({ provinceCode: "330000", cityCode: "", districtCode: "" })));
  assert.equal(provinceOnly.pathname, "/list/50025969__2.htm");
  assert.equal(provinceOnly.searchParams.get("location_code"), "330000");
  assert.equal(normalizeConfig({ provinceCode: "330000", cityCode: "", districtCode: "" }).city, "");
  const cityOnly = new URL(buildSourceUrl(normalizeConfig({ provinceCode: "330000", cityCode: "330100", districtCode: "" })));
  assert.equal(cityOnly.pathname, "/list/50025969__2___%BA%BC%D6%DD.htm");
  assert.equal(cityOnly.searchParams.has("location_code"), false);
  const cityAllStatus = new URL(buildSourceUrl(normalizeConfig({ status: "all", provinceCode: "330000", cityCode: "330100", districtCode: "330102" })));
  assert.equal(cityAllStatus.pathname, "/list/50025969__-1___%BA%BC%D6%DD.htm");
  const provinceAllStatus = new URL(buildSourceUrl(normalizeConfig({ status: "all", provinceCode: "330000", cityCode: "", districtCode: "" })));
  assert.equal(provinceAllStatus.pathname, "/list/50025969__-1.htm");
  const dateUrl = new URL(buildSourceUrl(normalizeConfig({ startDate: "2026-09-01", endDate: "2026-09-05" })));
  assert.equal(dateUrl.searchParams.get("auction_start_from"), "2026-09-01");
  assert.equal(dateUrl.searchParams.get("auction_start_to"), "2026-09-05");
  assert.equal(dateUrl.searchParams.has("auction_end_from"), false);
  assert.equal(dateUrl.searchParams.has("auction_end_to"), false);
  assert.equal(dateUrl.searchParams.get("auction_start_seg"), "0");
  const allStatusDateUrl = new URL(buildSourceUrl(normalizeConfig({ status: "all", startDate: "2026-09-01", endDate: "2026-09-05" })));
  assert.equal(allStatusDateUrl.searchParams.get("auction_start_from"), "2026-09-01");
  assert.equal(allStatusDateUrl.searchParams.get("auction_start_to"), "2026-09-05");
  assert.equal(allStatusDateUrl.searchParams.get("auction_start_seg"), "-1");
  const finishedRequest = normalizeConfig({ status: "finished", provinceCode: "330000", cityCode: "330100", districtCode: "330102", startDate: "2026-09-01", endDate: "2026-09-05" });
  const finishedUrl = buildSourceUrl(finishedRequest);
  assert.equal(listPageMatchesRequest(finishedUrl, finishedRequest), true);
  assert.equal(listPageMatchesRequest(finishedUrl.replace("auction_start_seg=0", "auction_start_seg=-1"), finishedRequest), false);
  assert.deepEqual(statusFilterLabels("finished"), ["已结束"]);
  assert.equal(statusFilterMatchesRequest("已结束", "finished"), true);
  assert.equal(statusFilterMatchesRequest("拍卖状态", "finished"), false);
  assert.equal(statusFilterMatchesRequest("不限", "all"), true);
  assert.equal(statusFilterMatchesRequest("已结束", "all"), false);
  assert.equal(isAlibabaListPage("https://sf.taobao.com/list/50025969__2.htm?auction_start_seg=-1"), true);
  assert.equal(isAlibabaListPage("https://sf-item.taobao.com/sf_item/1.htm"), false);
  assert.equal(normalizeConfig({ propertyType: "industrial" }).propertyType, "residential");
  assert.deepEqual(usableDistricts({ children: [
    { code: "all", name: "全市" },
    { code: "city-area", name: "市辖区" },
    { code: "330102", name: "上城区" },
  ] }), [{ code: "330102", name: "上城区" }]);
  assert.throws(() => helper.normalizeRequest({ sourceUrl: "https://example.com/evil" }), /ALIBABA_SOURCE_URL_NOT_ALLOWED/);
  const normalized = helper.normalizeRequest({ targetCount: 9999, maxPages: 9999, locationCode: "330102" });
  assert.equal(normalized.propertyType, "residential");
  assert.equal(Object.hasOwn(normalized, "targetCount"), false);
  assert.equal(Object.hasOwn(normalized, "maxPages"), false);
  assert.equal(Object.hasOwn(normalized, "locationCode"), false);
  assert.equal(helper.normalizeRequest({ status: "all" }).status, "all");
  assert.equal(directCandidateInScope({ text: "距开始 3 天" }, normalizeConfig({ status: "finished" })), false);
  assert.equal(directCandidateInScope({ text: "成交 2026-09-03" }, normalizeConfig({ status: "finished", startDate: "2026-09-01", endDate: "2026-09-05" })), true);
  assert.equal(directPageBeforeRequestedRange([{ text: "成交 2026-08-31" }], normalizeConfig({ status: "finished", startDate: "2026-09-01" })), true);
  assert.equal(directExtractBuildingAreaFromText("房屋建筑面积为49.04平方米"), 49.04);
  assert.deepEqual(directExtractFloorFieldsFromText("该建筑总层数为7层\n所在层为5层"), { floor: "5", totalFloors: "7层" });
});

test("OpenCLI child process receives Node paths even with a minimal GUI PATH", () => {
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = "/usr/bin:/bin";
    const environment = helper.commandEnvironment("/Users/test/.npm-global/bin/opencli");
    const entries = environment.PATH.split(path.delimiter);
    assert.ok(entries.includes("/usr/local/bin"));
    assert.ok(entries.includes("/opt/homebrew/bin"));
    assert.ok(entries.includes("/Users/test/.npm-global/bin"));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("detail parser only accepts completed cases with bids", () => {
  const valid = helper.parseDetail({
    url: "https://sf-item.taobao.com/sf_item/942168320500.htm?track_id=secret-like-id",
    title: "杭州市新风路676号",
    statusText: ["本场已结束"],
    location: "浙江省 杭州市 上城区新风路676号",
    usage: "1、商业用房 2、国有出让（商业用地）",
    buildingArea: "242.82",
    floor: "1-2",
    totalFloors: "19",
    transactionAmount: "2,667,000",
    valuationAmount: "3,780,000",
    transactionTime: "2025/07/08 11:24:07",
    decoration: "精装",
    leaseStatus: "无租赁",
    hasEndedText: true,
    bidCount: "56",
    hasSoldText: true,
    hasInvalidStatus: false,
  }, { propertyType: "commercial", province: "浙江省", city: "杭州市", district: "上城区", status: "finished" });
  assert.equal(valid.valid, true);
  assert.equal(valid.transactionAmount, 2667000);
  assert.equal(valid.buildingArea, 242.82);
  assert.equal(valid.unitPrice, 10983.44);
  assert.equal(valid.city, "杭州市");
  assert.equal(valid.district, "上城区");
  assert.equal(valid.address, "新风路676号");
  assert.equal(valid.transactionTime, "2025-07-08");
  assert.equal(valid.decoration, "精装");
  assert.equal(valid.leaseStatus, "空置");
  assert.equal(valid.url, "https://sf-item.taobao.com/sf_item/942168320500.htm");
  assert.equal(valid.verificationStatus, "详情核验通过");
  assert.equal(helper.matchesRequest(valid, { propertyType: "commercial", keyword: "新风路", startDate: "2025-01-01", endDate: "2025-12-31" }), true);
  assert.equal(helper.matchesRequest(valid, { propertyType: "commercial", keyword: "不存在", startDate: "2025-01-01", endDate: "2025-12-31" }), false);
  assert.equal(helper.matchesRequest(valid, { propertyType: "commercial", startDate: "2026-01-01" }), false);

  const rejected = helper.parseDetail({ ...valid, transactionAmount: "", bidCount: "0", hasSoldText: false }, { propertyType: "commercial" });
  assert.equal(rejected.valid, false);
  assert.equal(rejected.verificationStatus, "未通过成交核验");
});

test("building area extraction accepts Alibaba detail-page label variants", () => {
  for (const [source, expected] of [
    ["建筑面积：89.53平方米", 89.53],
    ["建筑面积约 1,234.56㎡", 1234.56],
    ["建筑面积（平方米）：105.2", 105.2],
    ["房屋建筑面积 (㎡) 76.8", 76.8],
    ["标的物介绍 建筑面积\n 42.00 m²", 42],
    ["房屋建筑面积约为：89.53 平方米", 89.53],
    ["房产证建筑面积（㎡）76.8", 76.8],
    ["总建筑面积=1,234.56㎡", 1234.56],
    ["房屋面积：42.00 平方公尺", 42],
    ["建筑面积：49.04，土地使用权面积：7", 49.04],
  ]) assert.equal(helper.extractBuildingAreaFromText(source), expected, source);
  assert.equal(helper.extractBuildingAreaFromText("建筑面积：详见评估报告"), null);
});

test("floor extraction accepts Alibaba labelled fields", () => {
  assert.deepEqual(helper.extractFloorFieldsFromText([
    "所在楼层",
    "8~9层",
    "总层数",
    "32层",
  ].join("\n")), { floor: "8~9", totalFloors: "32层" });
  assert.deepEqual(helper.extractFloorFieldsFromText("所在楼层：负1层\n总层数: 18"), {
    floor: "负1",
    totalFloors: "18",
  });
  assert.deepEqual(helper.extractFloorFieldsFromText("该建筑总层数为7层\n所在层为5层"), {
    floor: "5",
    totalFloors: "7层",
  });
  for (const [source, expected] of [
    ["房屋所在楼层为第5层，总层数共18层", { floor: "5", totalFloors: "18层" }],
    ["所在层位于1-2层，总楼层：4", { floor: "1-2", totalFloors: "4" }],
    ["楼层：负1层/18层", { floor: "负1", totalFloors: "18" }],
    ["楼层：地上1层（共3层）", { floor: "地上1", totalFloors: "3层" }],
    ["楼层：顶层", { floor: "顶层", totalFloors: "" }],
  ]) assert.deepEqual(helper.extractFloorFieldsFromText(source), expected, source);
});

test("extension-side direct extraction covers residential and commercial variants", async () => {
  const { directExtractBuildingAreaFromText, directExtractFloorFieldsFromText } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  for (const [source, expected] of [
    ["建筑面积约为：89.53平方米", 89.53],
    ["总建筑面积=1,234.56㎡", 1234.56],
    ["建筑面积：49.04，土地使用权面积：7", 49.04],
  ]) assert.equal(directExtractBuildingAreaFromText(source), expected, source);
  for (const [source, expected] of [
    ["房屋所在楼层为第5层，总层数共18层", { floor: "5", totalFloors: "18层" }],
    ["所在层位于1-2层，总楼层：4", { floor: "1-2", totalFloors: "4" }],
    ["楼层：负1层/18层", { floor: "负1", totalFloors: "18" }],
  ]) assert.deepEqual(directExtractFloorFieldsFromText(source), expected, source);
});

test("extension-side detail parser infers a floor from a room number", async () => {
  const moduleSource = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  const parsed = moduleSource.directParseDetail({
    title: "凯旋门公寓2幢2单元1602室不动产",
    location: "浙江省 杭州市 上城区",
    usage: "住宅用房",
    buildingArea: "77.35",
    pageText: "",
    transactionAmount: "3900500",
    valuationAmount: "4815000",
    bidCount: "1",
    hasSoldText: true,
    hasEndedText: true,
    hasInvalidStatus: false,
    url: "https://sf-item.taobao.com/sf_item/room-floor-test.htm",
  }, { propertyType: "residential", status: "finished", province: "浙江省", city: "杭州市" });
  assert.equal(parsed.floor, "16");
});

test("real Alibaba residential and commercial samples keep area and floor fields separate", async () => {
  const samples = JSON.parse(fs.readFileSync(path.join(repoRoot, "tests/fixtures/alibaba-auction-detail-fields.json"), "utf8"));
  const { directExtractBuildingAreaFromText, directExtractFloorFieldsFromText } = await import(path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js"));
  const comparableTotal = (value) => String(value || "").replace(/[层楼]/g, "");
  assert.equal(samples.filter((sample) => sample.sourceType === "evaluation-report-attachment").length, 2);
  for (const sample of samples) {
    assert.equal(helper.extractBuildingAreaFromText(sample.text), sample.buildingArea, `${sample.sourceId} native area`);
    assert.equal(directExtractBuildingAreaFromText(sample.text), sample.buildingArea, `${sample.sourceId} extension area`);
    const nativeFloor = helper.extractFloorFieldsFromText(sample.text);
    const extensionFloor = directExtractFloorFieldsFromText(sample.text);
    assert.equal(nativeFloor.floor, sample.floor, `${sample.sourceId} native floor`);
    assert.equal(extensionFloor.floor, sample.floor, `${sample.sourceId} extension floor`);
    assert.equal(comparableTotal(nativeFloor.totalFloors), sample.totalFloors, `${sample.sourceId} native total floors`);
    assert.equal(comparableTotal(extensionFloor.totalFloors), sample.totalFloors, `${sample.sourceId} extension total floors`);
  }
});

test("detail parser falls back to labelled floor fields when normalized values are absent", () => {
  const parsed = helper.parseDetail({
    title: "楼层字段测试",
    pageText: "所在楼层\n8~9层\n总层数\n32层",
    transactionAmount: "100000",
    buildingArea: "80",
    bidCount: "1",
    hasSoldText: true,
    hasEndedText: true,
    hasInvalidStatus: false,
    url: "https://sf-item.taobao.com/sf_item/floor-test.htm",
  }, { propertyType: "residential", status: "finished", province: "浙江省", city: "杭州市" });
  assert.equal(parsed.floor, "8~9");
  assert.equal(parsed.totalFloors, 32);
});

test("native detail parser falls back to page text for missing structured fields", () => {
  const parsed = helper.parseDetail({
    title: "Native 正文回退测试",
    pageText: "该建筑总层数为7层，所在层为5层，房屋建筑面积为49.04平方米。",
    buildingArea: "",
    floor: "",
    totalFloors: "",
    transactionAmount: "100000",
    bidCount: "1",
    hasSoldText: true,
    hasEndedText: true,
    hasInvalidStatus: false,
    url: "https://sf-item.taobao.com/sf_item/native-text-test.htm",
  }, { propertyType: "residential", status: "finished", province: "浙江省", city: "杭州市" });
  assert.equal(parsed.buildingArea, 49.04);
  assert.equal(parsed.floor, "5");
  assert.equal(parsed.totalFloors, 7);
});

test("native detail parser infers a residential floor from an explicit room number", () => {
  const parsed = helper.parseDetail({
    title: "杭州市上城区凯旋门公寓2幢2单元1602室不动产",
    pageText: "",
    buildingArea: "77.35",
    floor: "",
    totalFloors: "",
    transactionAmount: "3900500",
    bidCount: "1",
    hasSoldText: true,
    hasEndedText: true,
    hasInvalidStatus: false,
    url: "https://sf-item.taobao.com/sf_item/room-floor-test.htm",
  }, { propertyType: "residential", status: "finished", province: "浙江省", city: "杭州市" });
  assert.equal(parsed.floor, "16");
  assert.equal(parsed.totalFloors, null);
});

test("image-only PDF OCR fallback recovers area and floor fields", async () => {
  const pdfPath = "/tmp/alibaba-attach-107194.pdf";
  if (!fs.existsSync(pdfPath) || process.platform !== "darwin") {
    assert.ok(true, "macOS OCR fixture is optional on other platforms");
    return;
  }
  const text = await helper.extractPdfText(fs.readFileSync(pdfPath));
  assert.match(text, /55[.]38/);
  assert.equal(helper.extractBuildingAreaFromText(text), 55.38);
  const floors = helper.extractFloorFieldsFromText(text);
  assert.equal(floors.floor, "9");
  assert.equal(floors.totalFloors, "34层");
});

test("current-tab attachment bridge enriches missing fields through local OCR", async () => {
  const pdfPath = "/tmp/alibaba-attach-107194.pdf";
  if (!fs.existsSync(pdfPath) || process.platform !== "darwin") {
    assert.ok(true, "macOS OCR fixture is optional on other platforms");
    return;
  }
  const detail = {
    title: "当前页附件桥接测试",
    pageText: "",
    buildingArea: "",
    floor: "",
    totalFloors: "",
  };
  const enriched = await helper.enrichDetailFromAttachmentBuffers(detail, [{
    name: "评估报告.pdf",
    base64: fs.readFileSync(pdfPath).toString("base64"),
  }]);
  assert.equal(enriched.buildingArea, "55.38");
  assert.equal(enriched.floor, "9");
  assert.equal(enriched.totalFloors, "34层");
  assert.equal(enriched.attachmentCount, 1);
});

test("OpenCLI JSON parsing tolerates notices without returning page text", () => {
  const parsed = helper.parseJsonOutput(String.raw`OpenCLI notice
{"items":[{"href":"https://sf-item.taobao.com/sf_item/1.htm"}]}
Update available`);
  assert.equal(parsed.items[0].href, "https://sf-item.taobao.com/sf_item/1.htm");
});

test("browser extraction keeps every command on the page opened for that URL", () => {
  assert.deepEqual(helper.browserTargetArgs("page-1"), ["--tab", "page-1"]);
  assert.deepEqual(helper.browserTargetArgs(""), []);
  assert.equal(helper.openedBrowserTarget("notice\n{\"url\":\"https://sf-item.taobao.com/sf_item/1.htm\",\"page\":\"page-1\"}"), "page-1");
  assert.equal(helper.browserUrlsMatch(
    "https://sf-item.taobao.com/sf_item/1.htm?track_id=temporary",
    "https://sf-item.taobao.com/sf_item/1.htm",
  ), true);
  assert.equal(helper.browserUrlsMatch(
    "https://sf-item.taobao.com/sf_item/2.htm",
    "https://sf-item.taobao.com/sf_item/1.htm",
  ), false);
});

test("standalone result HTML contains the verified case table and source link", () => {
  const html = helper.renderResultHtml([{
    title: "测试标的",
    province: "浙江省",
    city: "杭州市",
    district: "上城区",
    propertyType: "住宅用房",
    address: "杭州市测试路 1 号",
    transactionTime: "2026-09-05 10:00:00",
    transactionAmount: 1234567,
    valuationAmount: 1500000,
    buildingArea: 100.5,
    unitPrice: 12284.75,
    floor: "3",
    totalFloors: 18,
    platform: "阿里拍卖",
    bidCount: 6,
    verificationStatus: "详情核验通过",
    url: "https://sf-item.taobao.com/sf_item/1.htm",
  }], {
    sourceUrl: "https://sf.taobao.com/list/50025969__2.htm?location_code=330102",
    propertyType: "住宅用房",
    keyword: "",
    startDate: "",
    endDate: "",
  }, { candidates: 4, skipped: 3 });
  assert.match(html, /阿里司法拍卖成交案例/);
  assert.match(html, /测试标的/);
  assert.match(html, /<span>区县<\/span>/);
  assert.match(html, /上城区/);
  assert.match(html, /1,234,567/);
  assert.doesNotMatch(html, /2026-09-05 10:00:00/);
  assert.match(html, /https:\/\/sf\.taobao\.com\/list\/50025969__2\.htm/);
  assert.match(html, /location_code=330102/);
  assert.match(html, /打开详情/);
  assert.match(html, /候选记录：<strong>4<\/strong>/);
  assert.match(html, /id="alibaba-map-frame"/);
  assert.match(html, /id="result-table"/);
  assert.match(html, /show-selected-distances/);
  assert.match(html, /ALIBABA_MAP_DISTANCE_REQUEST/);
  assert.match(html, /class="result-select"/);
  assert.match(html, /class="column-filter-trigger"/);
  assert.match(html, /ALIBABA_MAP_SET_SELECTED/);
  assert.match(html, /ALIBABA_MAP_FOCUS/);
  assert.match(html, /map-resize-handle/);
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  for (const script of inlineScripts) assert.doesNotThrow(() => new (require("node:vm").Script)(script));
});

test("custom output directory creates stable result and map artifacts", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-output-"));
  try {
    const artifacts = await helper.writeResultArtifacts([{
      id: "case-1",
      title: "测试住宅",
      city: "杭州市",
      propertyType: "住宅用房",
      address: "杭州市测试路 1 号",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 1234567,
      buildingArea: 100.5,
      longitude: 120.1,
      latitude: 30.2,
      url: "https://sf-item.taobao.com/sf_item/1.htm?track_id=temporary",
    }, {
      id: "case-2",
      title: "未定位商业",
      city: "杭州市",
      propertyType: "商业房",
      address: "杭州市测试路 2 号",
      transactionTime: "2026-09-05 11:00:00",
      transactionAmount: 2000000,
      buildingArea: 80,
      url: "https://sf-item.taobao.com/sf_item/2.htm",
    }], {
      outputDirectory,
      generateMap: true,
      geocodeMissing: false,
      city: "杭州市",
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    }, { candidates: 2, skipped: 0 });
    assert.deepEqual(fs.readdirSync(outputDirectory).sort(), ["latest.html", "latest_coords.json", "latest_map.html", "latest_points.js"]);
    assert.equal(artifacts.locatedCount, 1);
    assert.equal(artifacts.unlocatedCount, 1);
    const mapHtml = fs.readFileSync(artifacts.mapPath, "utf8");
    assert.match(mapHtml, /阿里司法拍卖地图/);
    assert.match(mapHtml, /未定位商业/);
    assert.match(mapHtml, /leaflet\.js/);
    assert.match(mapHtml, /markerCluster/);
    assert.match(mapHtml, /ALIBABA_MAP_SET_SELECTED/);
    assert.match(mapHtml, /ALIBABA_MAP_FOCUS/);
    assert.match(mapHtml, /ResizeObserver/);
  assert.match(mapHtml, /id="work-toggle"/);
  assert.match(mapHtml, /class="legend"/);
  assert.match(mapHtml, /id="add-reference-marker"/);
  assert.match(mapHtml, /插入位置标记/);
  assert.match(mapHtml, /id="clear-reference-markers"/);
  assert.match(mapHtml, /reference-marker-edit/);
  assert.match(mapHtml, /setReferenceMarkerEditing/);
  assert.match(mapHtml, /marker\.dragging\?\.disable\(\)/);
  assert.match(mapHtml, /位置已锁定/);
  assert.match(mapHtml, /marker-dialog-name/);
  assert.match(mapHtml, /marker-dialog-note/);
  assert.match(mapHtml, /distanceKm/);
  assert.match(mapHtml, /ALIBABA_MAP_DISTANCE_REQUEST/);
  assert.match(mapHtml, /tianyuan-alibaba-auction-map-reference-v2/);
  assert.match(mapHtml, /\.work-panel\{left:12px/);
  const scripts = [...mapHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.equal(scripts.length, 2);
    const vm = require("node:vm");
    for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
    assert.doesNotMatch(mapHtml, /track_id/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(outputDirectory, "latest_coords.json"), "utf8")).length, 1);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("map assets are removed when map generation is disabled", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-no-map-"));
  try {
    const withoutMap = await helper.writeResultArtifacts([{
      title: "测试案例",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 100,
      buildingArea: 10,
      longitude: 120.1,
      latitude: 30.2,
      url: "https://sf-item.taobao.com/sf_item/3.htm",
    }], { outputDirectory, generateMap: true, sourceUrl: helper.DEFAULT_SOURCE_URL });
    await helper.writeResultArtifacts([{
      title: "测试案例",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 100,
      buildingArea: 10,
      url: "https://sf-item.taobao.com/sf_item/3.htm",
    }], { outputDirectory, generateMap: false, sourceUrl: helper.DEFAULT_SOURCE_URL });
    assert.equal(withoutMap.geocodeRequested, 0);
    assert.equal(withoutMap.geocodeCacheHits, 0);
    assert.equal(withoutMap.geocodeResolved, 0);
    assert.equal(withoutMap.geocodeDurationMs, 0);
    assert.deepEqual(fs.readdirSync(outputDirectory).sort(), ["latest.html"]);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("missing coordinates can be filled by searching the stripped location", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-"));
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-cache-"));
  const cachePath = path.join(cacheDirectory, "alibaba-auction-geocode.json");
  const originalFetch = global.fetch;
  const originalCachePath = process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
  try {
    process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = cachePath;
    let queriedUrl = "";
    global.fetch = async (url) => {
      queriedUrl = String(url);
      return {
        ok: true,
        async json() {
          return [{ lon: "120.155", lat: "30.274" }];
        },
      };
    };
    const artifacts = await helper.writeResultArtifacts([{
      title: "坐落搜索测试",
      province: "浙江省",
      city: "杭州市",
      district: "上城区",
      address: "测试路 8 号",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 100,
      buildingArea: 10,
      url: "https://sf-item.taobao.com/sf_item/geocode-test.htm",
    }], {
      outputDirectory,
      generateMap: true,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    });
    const query = new URL(queriedUrl).searchParams.get("words") || new URL(queriedUrl).searchParams.get("q");
    assert.match(query, /浙江省/);
    assert.match(query, /测试路/);
    assert.equal(artifacts.results[0].coordinateStatus, "已定位（坐落位置搜索）");
    assert.equal(artifacts.results[0].coordinateSource, "address-search");
    assert.match(fs.readFileSync(artifacts.htmlPath, "utf8"), /已定位（坐落位置搜索）/);
    assert.equal(JSON.parse(fs.readFileSync(artifacts.coordsPath, "utf8")).length, 1);
    assert.equal(artifacts.geocodeRequested, 1);
    assert.equal(artifacts.geocodeCacheHits, 0);
    assert.equal(artifacts.geocodeResolved, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalCachePath === undefined) delete process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
    else process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = originalCachePath;
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

test("AMap POI coordinates are preferred for a location and retained with provenance", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-amap-geocode-"));
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-amap-cache-"));
  const cachePath = path.join(cacheDirectory, "alibaba-auction-geocode.json");
  const originalFetch = global.fetch;
  const originalCachePath = process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
  try {
    process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = cachePath;
    let requestUrl = "";
    global.fetch = async (url) => {
      requestUrl = String(url);
      return {
        ok: true,
        async json() {
          return {
            data: {
              tip_list: [{ tip: {
                name: "建国南苑",
                address: "河坊街413号望江路与建国南路交叉口",
                district: "浙江省杭州市上城区",
                x: "120.176460",
                y: "30.237899",
                poiid: "public-poi-id",
              } }],
            },
          };
        },
      };
    };
    const artifacts = await helper.writeResultArtifacts([{
      title: "高德 POI 测试",
      province: "浙江省",
      city: "杭州市",
      district: "上城区",
      address: "建国南苑",
      transactionTime: "2026-09-05",
      transactionAmount: 100,
      buildingArea: 10,
      url: "https://sf-item.taobao.com/sf_item/amap-test.htm",
    }], {
      outputDirectory,
      generateMap: true,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
      provinceCode: "330000",
      cityCode: "330100",
      districtCode: "330102",
    });
    const result = artifacts.results[0];
    assert.match(requestUrl, /www\.amap\.com\/service\/poiTips/);
    assert.match(new URL(requestUrl).searchParams.get("words"), /建国南苑/);
    assert.equal(result.coordinateStatus, "已定位（坐落位置搜索）");
    assert.equal(result.coordinateSource, "address-search");
    assert.equal(result.coordinateProvider, "amap");
    assert.equal(result.coordinatePrecision, "poi");
    assert.ok(Math.abs(result.longitude - 120.171824) < 0.001);
    assert.ok(Math.abs(result.latitude - 30.240283) < 0.001);
    assert.equal(artifacts.locatedCount, 1);
    const mapHtml = fs.readFileSync(artifacts.mapPath, "utf8");
    assert.match(mapHtml, /高德坐落位置搜索/);
  } finally {
    global.fetch = originalFetch;
    if (originalCachePath === undefined) delete process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
    else process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = originalCachePath;
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

test("geocode cache survives helper reload and stores only public address coordinates", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-cache-output-"));
  const secondOutputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-cache-output-"));
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-cache-"));
  const cachePath = path.join(cacheDirectory, "alibaba-auction-geocode.json");
  const originalFetch = global.fetch;
  const originalCachePath = process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
  const helperModulePath = require.resolve(path.join(repoRoot, "native-helper/alibaba-auction.js"));
  try {
    process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = cachePath;
    fs.writeFileSync(cachePath, "{ damaged cache", "utf8");
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return [{ lon: "120.155", lat: "30.274" }];
        },
      };
    };
    const input = {
      title: "持久化缓存测试",
      province: "浙江省",
      city: "杭州市",
      district: "上城区",
      address: "缓存测试路 8 号",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 100,
      buildingArea: 10,
      url: "https://sf-item.taobao.com/sf_item/geocode-cache-test.htm",
    };
    const first = await helper.writeResultArtifacts([input], {
      outputDirectory,
      generateMap: true,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    });
    assert.equal(first.geocodeRequested, 1);
    assert.equal(first.geocodeCacheHits, 0);
    assert.equal(first.geocodeResolved, 1);
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    assert.equal(cache.version, 1);
    assert.equal(Object.keys(cache.entries).length, 1);
    assert.deepEqual(Object.keys(Object.values(cache.entries)[0]).sort(), ["latitude", "longitude"]);
    assert.match(Object.keys(cache.entries)[0], /缓存测试路 8 号/);
    assert.deepEqual(fs.readdirSync(cacheDirectory).sort(), ["alibaba-auction-geocode.json"]);

    delete require.cache[helperModulePath];
    const reloadedHelper = require(helperModulePath);
    const second = await reloadedHelper.writeResultArtifacts([input], {
      outputDirectory: secondOutputDirectory,
      generateMap: true,
      sourceUrl: reloadedHelper.DEFAULT_SOURCE_URL,
    });
    assert.equal(fetchCalls, 1);
    assert.equal(second.geocodeRequested, 0);
    assert.equal(second.geocodeCacheHits, 1);
    assert.equal(second.geocodeResolved, 1);
    assert.equal(second.results[0].coordinateSource, "address-search");
  } finally {
    global.fetch = originalFetch;
    if (originalCachePath === undefined) delete process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
    else process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = originalCachePath;
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.rmSync(secondOutputDirectory, { recursive: true, force: true });
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

test("geocode failure and timeout still generate result HTML and Excel", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-failure-"));
  const timeoutOutputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-timeout-"));
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-auction-geocode-cache-"));
  const cachePath = path.join(cacheDirectory, "alibaba-auction-geocode.json");
  const originalFetch = global.fetch;
  const originalCachePath = process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
  try {
    process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = cachePath;
    global.fetch = async () => {
      throw new Error("simulated geocoder outage");
    };
    const input = {
      title: "失败仍生成测试",
      province: "浙江省",
      city: "杭州市",
      address: "失败测试路 1 号",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 100,
      buildingArea: 10,
      url: "https://sf-item.taobao.com/sf_item/geocode-failure-test.htm",
    };
    const failed = await helper.writeResultArtifacts([input], {
      outputDirectory,
      generateMap: true,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    });
    assert.equal(failed.geocodeRequested, 1);
    assert.equal(failed.geocodeFailed, 1);
    assert.equal(failed.geocodeResolved, 0);
    assert.ok(fs.statSync(failed.htmlPath).size > 0);
    assert.ok(fs.statSync(failed.mapPath).size > 0);

    global.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("simulated timeout")), { once: true });
    });
    const timedOut = await helper.writeResultArtifacts([{
      ...input,
      title: "超时仍生成测试",
      address: "超时测试路 2 号",
    }], {
      outputDirectory: timeoutOutputDirectory,
      generateMap: true,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    });
    assert.equal(timedOut.geocodeRequested, 1);
    assert.equal(timedOut.geocodeTimedOut, 1);
    assert.equal(timedOut.geocodeResolved, 0);
    assert.ok(timedOut.geocodeDurationMs <= helper.GEOCODE_TOTAL_BUDGET_MS + 500);
    assert.ok(fs.statSync(timedOut.htmlPath).size > 0);
    assert.ok(fs.statSync(timedOut.mapPath).size > 0);
    const excel = await helper.writeResultExcel(timedOut.results, {
      outputDirectory: timeoutOutputDirectory,
      sourceUrl: helper.DEFAULT_SOURCE_URL,
    }, { candidates: 1, skipped: 0 }, path.join(fs.realpathSync(timeoutOutputDirectory), "latest.xlsx"));
    assert.equal(excel.ok, true);
  } finally {
    global.fetch = originalFetch;
    if (originalCachePath === undefined) delete process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH;
    else process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH = originalCachePath;
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.rmSync(timeoutOutputDirectory, { recursive: true, force: true });
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

test("Excel export writes a verified local workbook with the same result columns", async () => {
  const outputPath = path.join(helper.RESULT_ROOT, `.test-${process.pid}-${Date.now()}.xlsx`);
  try {
    const exported = await helper.writeResultExcel([{
      title: "测试标的",
      province: "浙江省",
      city: "杭州市",
      propertyType: "住宅用房",
      address: "杭州市测试路 1 号",
      transactionTime: "2026-09-05 10:00:00",
      transactionAmount: 1234567,
      valuationAmount: 1500000,
      buildingArea: 100.5,
      unitPrice: 12284.75,
      floor: "3",
      totalFloors: 18,
      decoration: "精装",
      leaseStatus: "无租赁",
      platform: "阿里拍卖",
      bidCount: 6,
      verificationStatus: "详情核验通过",
      url: "https://sf-item.taobao.com/sf_item/1.htm",
    }], { sourceUrl: helper.DEFAULT_SOURCE_URL }, { candidates: 1 }, outputPath);
    assert.equal(exported.ok, true);
    assert.equal(exported.rowCount, 1);
    assert.equal(exported.readbackOk, true);
    assert.ok(exported.fileSize > 0);
    assert.equal(helper.validateResultPath(outputPath), outputPath);
  } finally {
    fs.rmSync(outputPath, { force: true });
    fs.rmSync(`${outputPath}.tmp.xlsx`, { force: true });
  }
});

test("result path validation rejects files outside the local output root", () => {
  assert.throws(() => helper.validateResultPath(path.join(os.tmpdir(), "alibaba-auction.html")), /ALIBABA_RESULT_PATH_NOT_ALLOWED/);
});
