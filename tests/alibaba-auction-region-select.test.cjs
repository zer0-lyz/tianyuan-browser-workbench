"use strict";

// 阿里拍卖模块“省份切换”挂载级测试。
// 通过轻量 DOM stub 真实执行 module.js 的 initialize()（renderConfig →
// renderRegionOptions 全部跑通），再模拟用户把省份下拉切到外省并触发
// change，验证省份选择不会回退成浙江省、城市/区县联动正确。

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const modulePath = path.join(repoRoot, "extension/src/modules/alibaba-auction/module.js");
const templatePath = path.join(repoRoot, "extension/src/modules/alibaba-auction/template.js");

// ---------------------------------------------------------------------------
// 轻量 DOM stub
// ---------------------------------------------------------------------------

class RegionFixtureElement {
  constructor(tagName, { id = "", text = "", attributes = {} } = {}) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.attributes = { ...attributes };
    this._text = String(text);
    this._innerHTML = "";
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value ?? "");
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? "");
  }

  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) listener.call(this, event);
    return true;
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }
}

// 极简 select 模拟：innerHTML 赋值时解析 <option value="x">文本</option>，
// value 读写遵循真实语义——赋不存在的值时取消选中（读回空串）。
class RegionFixtureSelect extends RegionFixtureElement {
  constructor(id, options = [], attributes = {}) {
    super("select", { id, attributes });
    this.options = options;
    this.#syncSelectionFromAttributes();
    if (this._pendingValue !== undefined) this.value = this._pendingValue;
  }

  #syncSelectionFromAttributes() {
    const selected = this.options.find((option) => option.selected);
    for (const option of this.options) option.selected = option === selected;
    if (!selected && this.options.length) this.options[0].selected = true;
  }

  set innerHTML(html) {
    this._innerHTML = String(html ?? "");
    const optionPattern = /<option\b([^>]*)>([^<]*)<\/option>/g;
    const options = [];
    let match;
    while ((match = optionPattern.exec(this._innerHTML)) !== null) {
      const value = match[1].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
      const option = new RegionFixtureElement("option", { text: match[2] });
      option.value = value;
      option.selected = /\bselected\b/.test(match[1]);
      options.push(option);
    }
    this.options = options;
    this.#syncSelectionFromAttributes();
  }

  get value() {
    if (!this.options) return this._pendingValue ?? "";
    return this.options.find((option) => option.selected)?.value ?? "";
  }

  set value(next) {
    if (!this.options) {
      // 基类构造函数会先赋 value="";此时选项尚未就绪,暂存待选项列表就绪后再生效。
      this._pendingValue = String(next);
      return;
    }
    const matched = this.options.find((option) => option.value === String(next));
    for (const option of this.options) option.selected = option === matched;
  }

  optionValues() {
    return this.options.map((option) => option.value);
  }

  optionTexts() {
    return this.options.map((option) => option.textContent);
  }
}

class RegionFixtureDocument {
  constructor() {
    this.head = new RegionFixtureElement("head");
    this.registry = new Map();
    this.root = new RegionFixtureElement("div", { id: "page-alibaba-auction" });
    this.registry.set(this.root.id, this.root);
  }

  getElementById(id) {
    if (this.registry.has(id)) return this.registry.get(id);
    // 真实页面里 openAlibabaAuction 等元素来自侧栏首页模板；stub 里按需补一个通用元素。
    const element = new RegionFixtureElement("div", { id });
    this.registry.set(id, element);
    return element;
  }

  createElement(tagName) {
    return new RegionFixtureElement(tagName);
  }

  // 根容器 innerHTML 赋值（模块 initialize 的第一步）触发模板解析注册。
  mountTemplate(html) {
    const selectPattern = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
    let match;
    while ((match = selectPattern.exec(html)) !== null) {
      const id = match[1].match(/\bid="([^"]+)"/)?.[1];
      if (!id) continue;
      const optionPattern = /<option\b([^>]*)>([^<]*)<\/option>/g;
      const options = [];
      let optionMatch;
      while ((optionMatch = optionPattern.exec(match[2])) !== null) {
        const option = new RegionFixtureElement("option", { text: optionMatch[2] });
        option.value = optionMatch[1].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
        option.selected = /\bselected\b/.test(optionMatch[1]);
        options.push(option);
      }
      this.registry.set(id, new RegionFixtureSelect(id, options, { id }));
    }
    const inputPattern = /<input\b([^>]*)>/g;
    while ((match = inputPattern.exec(html)) !== null) {
      const id = match[1].match(/\bid="([^"]+)"/)?.[1];
      if (!id || this.registry.has(id)) continue;
      const element = new RegionFixtureElement("input", { id, attributes: { type: match[1].match(/\btype="([^"]*)"/)?.[1] || "text" } });
      if (/\bchecked\b/.test(match[1])) element.checked = true;
      if (/\breadonly\b/.test(match[1])) element.setAttribute("readonly", "");
      this.registry.set(id, element);
    }
    const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
    while ((match = buttonPattern.exec(html)) !== null) {
      const id = match[1].match(/\bid="([^"]+)"/)?.[1];
      if (!id || this.registry.has(id)) continue;
      const element = new RegionFixtureElement("button", { id, text: match[2].trim() });
      element.disabled = /\bdisabled\b/.test(match[1]);
      this.registry.set(id, element);
    }
    const textPattern = /<(span|div|strong|p|h2)\b([^>]*)>([^<]*)<\/\1>/g;
    while ((match = textPattern.exec(html)) !== null) {
      const id = match[2].match(/\bid="([^"]+)"/)?.[1];
      if (!id || this.registry.has(id)) continue;
      this.registry.set(id, new RegionFixtureElement(match[1], { id, text: match[3] }));
    }
    // 进度条父容器（renderProgress 会向 parentElement 写 aria-valuenow）。
    for (const element of this.registry.values()) {
      if (!element.parentElement) element.parentElement = this.root;
    }
  }
}

function createScopeStub() {
  const cleanups = [];
  return {
    add(cleanup) {
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    on(target, eventName, listener) {
      if (!target?.addEventListener) return listener;
      target.addEventListener(eventName, listener);
      cleanups.push(() => target.removeEventListener(eventName, listener));
      return listener;
    },
  };
}

// 挂载 harness：真实执行 module.js 的 create().initialize(context)。
async function mountAlibabaAuctionModule({ stored = {} } = {}) {
  const [{ alibabaAuctionModule }, { alibabaAuctionTemplate }] = await Promise.all([
    import(modulePath),
    import(templatePath),
  ]);
  const documentRef = new RegionFixtureDocument();
  const savedStates = [];
  const storage = {
    async load() {
      return stored;
    },
    async save(state) {
      savedStates.push(state);
    },
  };
  const context = {
    document: documentRef,
    chrome: { runtime: { getURL: (resource) => `chrome-extension://tianyuan-fixture/${resource}` } },
    manifest: alibabaAuctionModule.manifest,
    scope: createScopeStub(),
    storage,
    navigate() {},
    setStatus() {},
    sendNativeMessage: async () => ({ ok: true }),
  };
  const instance = alibabaAuctionModule.create();
  documentRef.mountTemplate(alibabaAuctionTemplate); // 先注册模板元素，模块 initialize 会重新赋 root.innerHTML
  await instance.initialize(context);
  return {
    instance,
    document: documentRef,
    province: documentRef.getElementById("alibabaAuctionProvince"),
    city: documentRef.getElementById("alibabaAuctionCity"),
    district: documentRef.getElementById("alibabaAuctionDistrict"),
    sourceUrl: documentRef.getElementById("alibabaAuctionSourceUrl"),
    savedStates,
  };
}

function changeValue(select, value) {
  select.value = value;
  select.dispatchEvent({ type: "change" });
}

// ---------------------------------------------------------------------------
// 复现与回归用例
// ---------------------------------------------------------------------------

test("mounting the alibaba auction module renders the full province catalog", async () => {
  const view = await mountAlibabaAuctionModule();
  assert.equal(view.province.value, "330000");
  assert.ok(view.province.optionValues().includes("440000"), "省份下拉应包含广东省");
  assert.ok(view.province.optionValues().includes("650000"), "省份下拉应包含新疆维吾尔自治区");
  assert.ok(view.city.optionTexts().includes("杭州市"), "默认城市应为杭州市");
  assert.equal(view.district.disabled, false, "默认杭州市在目录中有区县，区县下拉应可用");
});

test("selecting Guangdong keeps the province selected instead of reverting to Zhejiang", async () => {
  const view = await mountAlibabaAuctionModule();
  changeValue(view.province, "440000");
  assert.equal(view.province.value, "440000", "切到广东省后省份下拉不应回退浙江省");
  assert.ok(view.city.optionValues().includes("440100"), "城市下拉应出现广州");
  assert.ok(view.city.optionValues().includes("440300"), "城市下拉应出现深圳");
  assert.ok(!view.city.optionValues().includes("330100"), "城市下拉不应再出现浙江城市");
  const url = new URL(view.sourceUrl.value);
  assert.equal(url.searchParams.get("location_code"), "440000", "配置状态应停留在广东省而非回退浙江");
});

test("selecting Beijing keeps the province selected", async () => {
  const view = await mountAlibabaAuctionModule();
  changeValue(view.province, "110000");
  assert.equal(view.province.value, "110000", "切到北京市后省份下拉不应回退");
  assert.ok(view.city.optionValues().includes("110100"), "城市下拉应为北京市辖区");
  const url = new URL(view.sourceUrl.value);
  assert.equal(url.searchParams.get("location_code"), "110000");
});

test("selecting Xinjiang keeps the province selected instead of reverting to Zhejiang", async () => {
  const view = await mountAlibabaAuctionModule();
  changeValue(view.province, "650000");
  assert.equal(view.province.value, "650000", "切到新疆后省份下拉不应回退浙江省");
  assert.ok(view.city.optionValues().includes("650100"), "城市下拉应出现乌鲁木齐市");
  const url = new URL(view.sourceUrl.value);
  assert.equal(url.searchParams.get("location_code"), "650000", "配置状态应停留在新疆而非回退浙江");
});

test("selecting a Guangdong city takes effect and updates the source URL", async () => {
  const view = await mountAlibabaAuctionModule();
  changeValue(view.province, "440000");
  changeValue(view.city, "440100");
  assert.equal(view.province.value, "440000", "选择城市后省份应保持广东省");
  assert.equal(view.city.value, "440100", "城市选择应生效");
  const url = new URL(view.sourceUrl.value);
  assert.equal(url.pathname, "/list/50025969__2___%B9%E3%D6%DD.htm", "广州应生成城市路径后缀的列表 URL");
  // regions.js 目前只给浙江省城市维护了区县 children，广州暂无区县数据，
  // 因此区县下拉按现有逻辑保持禁用（首选项显示“不限定区县”）。
  assert.equal(view.district.optionTexts()[0], "不限定区县");
  assert.equal(view.district.disabled, true);

  // 对照组：浙江杭州具备区县数据，同样的联动应把区县下拉置为可用。
  changeValue(view.province, "330000");
  changeValue(view.city, "330100");
  assert.equal(view.district.disabled, false, "杭州应保持区县下拉可用");
  assert.ok(view.district.optionValues().includes("330102"), "杭州区县应包含上城区");
});

test("normalizeConfig resolves province by code first and rejects unknown codes", async () => {
  const { normalizeConfig } = await import(modulePath);
  // 模块切换省份时旧的省份名会随 { ...config } 一起传入，代码必须优先于名称。
  const staleName = normalizeConfig({ provinceCode: "440000", province: "浙江省" });
  assert.equal(staleName.provinceCode, "440000");
  assert.equal(staleName.province, "广东省");
  // 仅传名称的旧存储路径仍应按名称解析。
  const nameOnly = normalizeConfig({ provinceCode: "", province: "广东省" });
  assert.equal(nameOnly.provinceCode, "440000");
  // 空配置保持默认浙江省。
  assert.equal(normalizeConfig({}).provinceCode, "330000");
  // 传入目录中不存在的省份代码必须抛错，不得静默回退成浙江省。
  assert.throws(() => normalizeConfig({ provinceCode: "999999" }), /ALIBABA_PROVINCE_CODE_UNKNOWN:999999/);
});

test("restoring a stored non-Zhejiang config keeps the province after remount", async () => {
  const { normalizeConfig } = await import(modulePath);
  const stored = {
    ...normalizeConfig({ provinceCode: "440000", cityCode: "440100" }),
    parameterSnapshot: null,
    results: [],
    htmlPath: "",
    excelPath: "",
    mapPath: "",
  };
  const view = await mountAlibabaAuctionModule({ stored });
  assert.equal(view.province.value, "440000", "重新挂载后省份应恢复为广东省");
  assert.equal(view.city.value, "440100", "重新挂载后城市应恢复为广州");
  assert.equal(view.district.disabled, true);
});
