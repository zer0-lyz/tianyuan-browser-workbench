"use strict";

// 报告页 vm 沙箱 fixture：模拟 Element UI 风格的报告树、属性对话框、编辑器与工具栏，
// 供 report_adapter.js（report-authoring-v2）的离线测试与后续 Bridge/集成测试复用。
// 约束：不使用 eval/Function 构造器、不访问网络；所有交互记录到 journal。

const fs = require("node:fs");
const { webcrypto } = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");

const ADAPTER_SOURCE_PATH = path.resolve(__dirname, "../../extension/src/injected/report_adapter.js");

const DEFAULT_IDENTITY = { projectId: "project-1", companyId: "company-1", reportType: "2", mode: "add" };

const SETTINGS_FIELDS = [
  { label: "节点条件", type: "radio", options: ["且", "或"] },
  { label: "节点类型", type: "radio", options: ["正文", "目录", "附注"] },
  { label: "大纲级别", type: "select", options: ["1级", "2级", "3级", "4级"] },
  { label: "是否分段", type: "radio", options: ["是", "否"] },
  { label: "是否编号", type: "radio", options: ["是", "否"] },
  { label: "编号样式", type: "select", options: ["无", "一、", "1.", "1.1"] },
  { label: "是否设置分隔符", type: "radio", options: ["是", "否"] },
];

const DEFAULT_SETTINGS = { 节点条件: "且", 节点类型: "正文", 大纲级别: "1级", 是否分段: "是", 是否编号: "是", 编号样式: "1.", 是否设置分隔符: "否" };

const DEFAULT_TREE = [
  {
    label: "一、评估对象与范围", dataKey: "fixture-root", expanded: true, selected: true,
    editor: { framework: "contenteditable", text: "评估对象为示例资产组，范围涵盖房屋与设备。" },
    children: [
      { label: "1.1 房屋建筑物", dataKey: "fixture-house-a", editor: { framework: "contenteditable", text: "房屋建筑物位于示例路 1 号。" } },
      { label: "1.1 房屋建筑物", dataKey: "fixture-house-b", editor: { framework: "contenteditable", text: "同名节点的第二处正文。" } },
      { label: "1.2 设备及车辆", dataKey: "fixture-lazy", lazy: true, lazyChildren: [{ label: "1.2.1 空调设备", dataKey: "fixture-lazy-air" }, { label: "1.2.2 电梯设备", dataKey: "fixture-lazy-lift" }] },
    ],
  },
  { label: "二、评估结论", dataKey: "fixture-conclusion" },
  { label: "三、特殊事项说明", dataKey: "fixture-special", editor: { framework: "quill", text: "本节说明特殊事项。" } },
];

// ———— 迷你 DOM：选择器引擎 ————
function descendantsOf(base) {
  const out = [];
  const visit = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType !== 1) continue;
      out.push(child);
      visit(child);
    }
  };
  visit(base);
  return out;
}

function matchSimple(element, simple) {
  let rest = simple;
  const tagMatch = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  if (tagMatch) {
    if (String(element.tagName).toUpperCase() !== tagMatch[0].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  } else if (rest[0] === "*") {
    rest = rest.slice(1);
  }
  while (rest.length) {
    if (rest[0] === ".") {
      const matched = rest.match(/^\.([A-Za-z0-9_-]+)/);
      if (!matched || !element.classList.contains(matched[1])) return false;
      rest = rest.slice(matched[0].length);
    } else if (rest[0] === "[") {
      const matched = rest.match(/^\[([A-Za-z_:][A-Za-z0-9_:-]*)(?:='([^']*)'|="([^"]*)")?\]/);
      if (!matched) return false;
      const value = element.getAttribute(matched[1]);
      if (value === null) return false;
      const expected = matched[2] !== undefined ? matched[2] : matched[3];
      if (expected !== undefined && value !== expected) return false;
      rest = rest.slice(matched[0].length);
    } else if (rest.startsWith(":checked")) {
      if (!element.checked) return false;
      rest = rest.slice(":checked".length);
    } else {
      return false;
    }
  }
  return true;
}

function querySelectorAllImpl(base, selector) {
  const results = [];
  const seen = new Set();
  for (const part of String(selector).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let candidates;
    if (trimmed.startsWith(":scope")) {
      const simple = trimmed.replace(/^:scope\s*>\s*/, "");
      candidates = (base.childNodes || []).filter((node) => node.nodeType === 1 && matchSimple(node, simple));
    } else {
      candidates = descendantsOf(base).filter((element) => matchSimple(element, trimmed));
    }
    for (const candidate of candidates) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        results.push(candidate);
      }
    }
  }
  return results;
}

// ———— 迷你 DOM：元素 ————
function describeElement(element) {
  if (!element) return "unknown";
  if (element.eventTag) return element.eventTag;
  const classes = String(element.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
  return `${String(element.tagName || "div").toLowerCase()}${classes ? `.${classes}` : ""}`;
}

function createTextNode(data) {
  return {
    nodeType: 3,
    data: String(data),
    parentElement: null,
    get textContent() { return this.data; },
    set textContent(value) { this.data = String(value); },
  };
}

class FixtureEvent {
  constructor(type, options = {}) {
    this.type = String(type);
    this.bubbles = Boolean(options.bubbles);
    this.cancelable = Boolean(options.cancelable);
  }

  stopPropagation() { this.__fixtureStopped = true; }
}

class FixtureKeyboardEvent extends FixtureEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.key = String(options.key || "");
    this.code = String(options.code || "");
    this.keyCode = Number(options.keyCode) || 0;
    this.which = Number(options.which) || 0;
    this.charCode = Number(options.charCode) || 0;
  }
}

function createElement(tagName, options, page) {
  const attributes = {};
  for (const [name, value] of Object.entries(options?.attributes || {})) {
    if (value !== undefined && value !== null) attributes[String(name)] = String(value);
  }
  const element = {
    nodeType: 1,
    tagName: page?.svgTagNameLowercase && String(tagName).toUpperCase() === "SVG" ? "svg" : String(tagName || "DIV").toUpperCase(),
    attributes,
    childNodes: [],
    parentElement: null,
    listeners: new Map(),
    style: { display: options?.hidden ? "none" : "", visibility: "" },
    disabled: Boolean(options?.disabled),
    checked: false,
    selected: false,
    eventTag: options?.eventTag || null,
    fixturePage: page,
  };
  Object.defineProperties(element, {
    className: {
      get() { return this.attributes.class || ""; },
      set(value) { this.attributes.class = String(value); },
    },
    classList: {
      value: {
        contains(name) { return String(element.attributes.class || "").split(/\s+/).includes(name); },
        add(...names) {
          const set = new Set(String(element.attributes.class || "").split(/\s+/).filter(Boolean));
          for (const name of names) set.add(name);
          element.attributes.class = [...set].join(" ");
        },
        remove(...names) {
          const set = new Set(String(element.attributes.class || "").split(/\s+/).filter(Boolean));
          for (const name of names) set.delete(name);
          element.attributes.class = [...set].join(" ");
        },
        toggle(name, force) {
          const has = this.contains(name);
          const next = force === undefined ? !has : Boolean(force);
          if (next) this.add(name); else this.remove(name);
          return next;
        },
      },
    },
    children: { get() { return element.childNodes.filter((node) => node.nodeType === 1); } },
    parentNode: { get() { return element.parentElement; } },
    offsetWidth: { get() { return element.style.display === "none" || element.style.visibility === "hidden" ? 0 : 1; } },
    offsetHeight: { get() { return element.style.display === "none" || element.style.visibility === "hidden" ? 0 : 1; } },
    innerText: { get() { return element.textContent; } },
    textContent: {
      get() { return element.childNodes.map((node) => node.textContent).join(""); },
      set(value) {
        const node = createTextNode(value);
        node.parentElement = element;
        element.childNodes = [node];
      },
    },
  });
  element.getAttribute = (name) => (Object.prototype.hasOwnProperty.call(element.attributes, String(name)) ? element.attributes[String(name)] : null);
  element.getAttributeNames = () => Object.keys(element.attributes);
  element.setAttribute = (name, value) => { element.attributes[String(name)] = String(value); };
  element.removeAttribute = (name) => { delete element.attributes[String(name)]; };
  element.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(element.attributes, String(name));
  element.append = (...nodes) => {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.removeChild(node);
      node.parentElement = element;
      element.childNodes.push(node);
    }
  };
  element.removeChild = (node) => {
    const index = element.childNodes.indexOf(node);
    if (index >= 0) element.childNodes.splice(index, 1);
    node.parentElement = null;
    return node;
  };
  element.remove = () => { if (element.parentElement) element.parentElement.removeChild(element); };
  element.contains = (node) => {
    let current = node;
    let guard = 0;
    while (current && guard++ < 500) {
      if (current === element) return true;
      current = current.parentElement;
    }
    return false;
  };
  element.getClientRects = () => [{}];
  element.getBoundingClientRect = () => ({ width: 1, height: 1, top: 0, left: 0 });
  element.addEventListener = (type, handler) => {
    const list = element.listeners.get(type) || [];
    list.push(handler);
    element.listeners.set(type, list);
  };
  element.removeEventListener = (type, handler) => {
    const list = (element.listeners.get(type) || []).filter((item) => item !== handler);
    element.listeners.set(type, list);
  };
  element.dispatchEvent = (event) => {
    page.journal.push({ kind: "event", eventType: String(event?.type || ""), target: describeElement(element) });
    if (event && typeof event.stopPropagation !== "function") {
      event.stopPropagation = () => { event.__fixtureStopped = true; };
    }
    let node = element;
    let guard = 0;
    while (node && guard++ < 200) {
      const handlers = node.listeners ? node.listeners.get(String(event?.type || "")) : null;
      if (handlers) for (const handler of [...handlers]) handler(event);
      if (event?.bubbles === false || event?.__fixtureStopped) break;
      node = node.parentElement;
    }
    return true;
  };
  element.focus = () => {
    page.document.activeElement = element;
    page.journal.push({ kind: "focus", target: describeElement(element) });
  };
  element.blur = () => {
    if (page.document.activeElement === element) page.document.activeElement = null;
    element.dispatchEvent(new FixtureEvent("blur", { bubbles: false, cancelable: false }));
  };
  if (["INPUT", "TEXTAREA"].includes(element.tagName)) element.select = () => { element.inputSelected = true; };
  element.querySelectorAll = (selector) => querySelectorAllImpl(element, selector);
  element.querySelector = (selector) => querySelectorAllImpl(element, selector)[0] || null;
  element.closest = (selector) => {
    let current = element;
    let guard = 0;
    while (current && guard++ < 200) {
      for (const part of String(selector).split(",")) {
        const trimmed = part.trim();
        if (trimmed.startsWith(":scope")) continue;
        if (matchSimple(current, trimmed)) return current;
      }
      current = current.parentElement;
    }
    return null;
  };
  if (element.tagName === "SELECT") {
    Object.defineProperties(element, {
      options: { get() { return element.childNodes.filter((node) => node.nodeType === 1 && node.tagName === "OPTION"); } },
      selectedOptions: { get() { return element.options.filter((option) => option.selected); } },
      value: {
        get() { const chosen = element.options.find((option) => option.selected); return chosen ? chosen.value : ""; },
        set(value) { for (const option of element.options) option.selected = String(option.value) === String(value); },
      },
    });
  }
  if (element.tagName === "OPTION") {
    Object.defineProperty(element, "value", {
      get() { return element.getAttribute("value") ?? element.textContent; },
      set(value) { element.setAttribute("value", value); },
    });
  }
  return element;
}

// ———— 树状态 ————
function materializeNodes(specs, prefix) {
  return (specs || []).map((spec, index) => {
    const nodePath = prefix ? `${prefix}/${index}` : String(index);
    return {
      path: nodePath,
      label: String(spec?.label ?? ""),
      dataKey: spec?.dataKey || null,
      newAdd: spec?.newAdd === true,
      expanded: Boolean(spec?.expanded),
      selected: Boolean(spec?.selected),
      lazy: Boolean(spec?.lazy),
      lazyChildren: Array.isArray(spec?.lazyChildren) ? spec.lazyChildren : [],
      loaded: !spec?.lazy,
      loading: false,
      editor: spec?.editor ? { framework: String(spec.editor.framework || "contenteditable"), text: String(spec.editor.text ?? "") } : null,
      children: materializeNodes(spec?.children || [], nodePath),
      el: null,
      contentEl: null,
      iconEl: null,
      childrenContainerEl: null,
      editorEl: null,
      labelEl: null,
    };
  });
}

function forEachNode(nodes, visitor) {
  for (const node of nodes) {
    visitor(node);
    forEachNode(node.children, visitor);
  }
}

function cloneNodePlain(node) {
  return {
    label: node.label,
    dataKey: node.dataKey,
    expanded: node.expanded,
    lazy: false,
    lazyChildren: [],
    loaded: true,
    loading: false,
    editor: node.editor ? { framework: node.editor.framework, text: node.editor.text } : null,
    children: node.children.map(cloneNodePlain),
  };
}

// ———— 主入口 ————
function buildReportPage(options = {}) {
  const journal = [];
  const resources = [];
  const identity = { ...DEFAULT_IDENTITY, ...(options.identity || {}) };
  const page = { journal, resources, unresponsive: Boolean(options.unresponsive), svgTagNameLowercase: Boolean(options.svgTagNameLowercase), document: null };
  let generatedNodeSequence = 0;

  const location = {
    protocol: options.protocol || "https:",
    hostname: options.hostname || "excel.zhrdc.net",
    origin: `${options.protocol || "https:"}//${options.hostname || "excel.zhrdc.net"}`,
    pathname: options.pathname || `/ty/operation/${identity.projectId}/${identity.companyId}/new-report/${identity.reportType}/${identity.mode}`,
    // 真实页面 detailId 位于查询串，是报告明细身份
    search: options.detailId ? `?detailId=${options.detailId}` : "",
  };

  const state = {
    nodes: materializeNodes(options.tree || DEFAULT_TREE, ""),
    selectedNode: null,
    savedAt: null,
    saveCount: 0,
    settingsByPath: new Map(),
    persistedSettingsByPath: new Map(),
    settingsConfirmMode: options.settingsConfirmMode || "close",
    saveToast: options.saveToast !== false,
    saveNetwork: options.saveNetwork !== false,
    showAllEditors: options.editors === "all",
    // 关键词过滤（真实页面"节点关键词查询"输入框触发）；null 表示未过滤
    filter: null,
    // 编辑器保存模式：ok 显示"保存成功"，fail 显示"保存失败"，timeout 无任何指示
    editorSaveMode: options.editorSaveMode || "ok",
    // 编辑器关闭时是否弹出"有未保存更改"确认框
    editorCloseConfirm: options.editorCloseConfirm === true,
    // 行内节点操作点击 🗑 后是否弹出确认弹窗（默认弹）
    deleteConfirm: options.deleteConfirm !== false,
  };
  forEachNode(state.nodes, (node) => {
    if (!state.selectedNode && node.selected) state.selectedNode = node;
    const override = options.settings?.[node.path];
    const settings = { ...DEFAULT_SETTINGS, ...(override || {}) };
    state.settingsByPath.set(node.path, settings);
    state.persistedSettingsByPath.set(node.path, { ...settings });
  });
  if (!state.selectedNode && options.selectedPath) {
    state.selectedNode = findNode(options.selectedPath);
  }
  state.selectedPath = state.selectedNode?.path ?? null;

  // ———— 树面板头部：全部展开/全部折叠/关键词查询（贴近真实页面顶栏） ————
  function expandAllNodes() {
    if (page.unresponsive) return;
    forEachNode(state.nodes, (node) => {
      if (node.lazy && !node.loaded) {
        node.loading = false;
        node.loaded = true;
        node.children = materializeNodes(node.lazyChildren, node.path);
        journal.push({ kind: "lazy-load", path: node.path, children: node.children.length });
      }
      if (node.children.length) node.expanded = true;
    });
    journal.push({ kind: "expand-all" });
    renderTree();
    renderEditorPanel();
  }

  function collapseAllNodes() {
    if (page.unresponsive) return;
    forEachNode(state.nodes, (node) => { node.expanded = false; });
    journal.push({ kind: "collapse-all" });
    renderTree();
    renderEditorPanel();
  }

  const treeHeader = createElement("div", { attributes: { class: "report-tree-header" }, eventTag: { kind: "tree-header" } }, page);
  let treeEditMode = options.treeEditInitiallyActive === true;
  let inlineIconsReady = true;
  const treeEditButton = createElement("button", { attributes: { type: "button", class: "tree-control-button", "aria-label": treeEditMode ? "完成编辑" : "编辑" }, eventTag: { kind: "tree-control", op: "edit-mode" } }, page);
  treeEditButton.textContent = treeEditMode ? "完成编辑" : "编辑";
  treeEditButton.addEventListener("click", () => {
    if (page.unresponsive) return;
    treeEditMode = true;
    treeEditButton.textContent = "完成编辑";
    treeEditButton.setAttribute("aria-label", "完成编辑");
    journal.push({ kind: "tree-edit-mode", active: true });
    const controlDelayMs = options.inlineIconsRequireTreeEditMode === true ? Math.max(0, Number(options.inlineRowControlsDelayMs) || 0) : 0;
    inlineIconsReady = controlDelayMs === 0;
    renderTree();
    if (controlDelayMs > 0) setTimeout(() => {
      inlineIconsReady = true;
      if (treeEditMode) {
        renderTree();
        journal.push({ kind: "tree-row-controls-mounted" });
      }
    }, controlDelayMs);
  });
  const expandAllButton = createElement("button", { attributes: { type: "button", class: "tree-control-button", "aria-label": "全部展开" }, eventTag: { kind: "tree-control", op: "expand-all" } }, page);
  expandAllButton.textContent = "全部展开";
  expandAllButton.addEventListener("click", expandAllNodes);
  const collapseAllButton = createElement("button", { attributes: { type: "button", class: "tree-control-button", "aria-label": "全部折叠" }, eventTag: { kind: "tree-control", op: "collapse-all" } }, page);
  collapseAllButton.textContent = "全部折叠";
  collapseAllButton.addEventListener("click", collapseAllNodes);
  const searchInput = createElement("input", {
    attributes: { type: "text", class: "node-search-input", placeholder: "节点关键词查询", "aria-label": "节点关键词查询" },
    eventTag: { kind: "node-search-input" },
  }, page);
  searchInput.value = "";
  const applySearchFilter = (keyword) => {
    state.filter = keyword || null;
    journal.push({ kind: "search-filter", keyword });
    renderTree();
    renderEditorPanel();
  };
  searchInput.addEventListener("input", () => {
    if (page.unresponsive) return;
    const keyword = String(searchInput.value || "").trim();
    if (options.searchRequiresEnter === true) return;
    applySearchFilter(keyword);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (options.searchRequiresEnter !== true) return;
    journal.push({ kind: "search-keydown", keyCode: event.keyCode, which: event.which });
    if (page.unresponsive || options.searchEnterEnabled === false || event.keyCode !== 13) return;
    const delayMs = Math.max(0, Number(options.searchDelayMs) || 0);
    setTimeout(() => {
      if (!page.unresponsive) applySearchFilter(String(searchInput.value || "").trim());
    }, delayMs);
  });
  // treeHeader 的 DOM 挂载推迟到骨架区（treePanel 创建之后）

  function findNode(nodePath) {
    let found = null;
    forEachNode(state.nodes, (node) => { if (node.path === nodePath) found = node; });
    return found;
  }

  function findNodeByEditorElement(element) {
    let found = null;
    forEachNode(state.nodes, (node) => { if (node.editorEl === element) found = node; });
    return found;
  }

  // ———— DOM 骨架 ————
  const pageRoot = createElement("div", { attributes: { id: "fixture-page-root", class: "fixture-page" }, eventTag: { kind: "page-root" } }, page);
  const workbench = createElement("div", { attributes: { class: "report-workbench" }, eventTag: { kind: "workbench" } }, page);
  const treePanel = createElement("div", { attributes: { class: "report-tree-panel" }, eventTag: { kind: "tree-panel" } }, page);
  const treeRoot = createElement("div", { attributes: { class: "el-tree" }, eventTag: { kind: "tree" } }, page);
  const editorPanel = createElement("div", { attributes: { class: "report-editor-panel" }, eventTag: { kind: "editor-panel" } }, page);
  const dialogHost = createElement("div", { attributes: { class: "fixture-dialog-host" }, eventTag: { kind: "dialog-host" } }, page);
  treePanel.append(treeRoot);
  // 树面板头部（全部展开/全部折叠/关键词查询）挂在树之前，贴近真实页面顶栏
  treeHeader.append(treeEditButton, expandAllButton, collapseAllButton, searchInput);
  treePanel.childNodes.unshift(treeHeader);
  workbench.append(treePanel, editorPanel);
  pageRoot.append(workbench, dialogHost);

  let toolbar = null;
  if (options.toolbar !== false) {
    toolbar = createElement("div", { attributes: { class: "report-toolbar", role: "toolbar" }, eventTag: { kind: "toolbar" } }, page);
    const toolbarOptions = typeof options.toolbar === "object" && options.toolbar !== null ? options.toolbar : {};
    const disabledList = Array.isArray(toolbarOptions.disabled) ? toolbarOptions.disabled : [];
    const defs = [
      { op: "add", label: "新增节点" },
      { op: "copy", label: "复制节点" },
      { op: "up", label: "上移" },
      { op: "down", label: "下移" },
      { op: "delete", label: "删除节点" },
      { op: "save", label: "保存" },
    ];
    for (const def of defs) {
      const button = createElement("button", {
        attributes: { type: "button", class: "toolbar-button" },
        disabled: disabledList.includes(def.op),
        eventTag: { kind: "toolbar-button", op: def.op, label: def.label },
      }, page);
      button.textContent = def.label;
      button.addEventListener("click", () => performToolbarOp(def.op));
      toolbar.append(button);
    }
    pageRoot.append(toolbar);
  }

  // ———— 树渲染（保持节点元素身份，展开/选中就地更新） ————
  function isLeafNode(node) {
    return !node.children.length && !node.lazy;
  }

  function iconClassName(node) {
    return "el-tree-node__expand-icon"
      + (isLeafNode(node) ? " is-leaf" : "")
      + (node.expanded ? " is-expanded" : "")
      + (node.loading ? " is-loading" : "");
  }

  // ———— 过滤视图：关键词过滤下仅保留匹配节点与其祖先链 ————
  function nodeMatchesFilter(node) {
    if (!state.filter) return true;
    if (String(node.label).includes(state.filter)) return true;
    return node.children.some(nodeMatchesFilter);
  }

  // 自身不匹配但后代匹配的祖先节点：过滤期间强制展开以便看到匹配后代
  function filterForcedExpand(node) {
    return Boolean(state.filter) && !String(node.label).includes(state.filter) && node.children.some(nodeMatchesFilter);
  }

  function renderChildrenContainer(node) {
    const showChildren = node.expanded || filterForcedExpand(node);
    const container = createElement("div", { attributes: { class: "el-tree-node__children" }, hidden: !showChildren, eventTag: { kind: "children-container", path: node.path } }, page);
    if (showChildren) {
      for (const child of node.children) {
        if (!nodeMatchesFilter(child)) continue;
        child.el = renderNodeElement(child);
        container.append(child.el);
      }
    }
    return container;
  }

  function renderNodeElement(node) {
    const element = createElement("div", {
      attributes: {
        class: "el-tree-node" + (node.selected ? " is-current" : ""),
        "aria-expanded": String(Boolean(node.expanded)),
        ...(node.selected ? { "aria-selected": "true" } : {}),
        ...(node.dataKey ? { "data-node-key": node.dataKey } : {}),
      },
      eventTag: { kind: "tree-node", path: node.path },
    }, page);
    const content = createElement("div", { attributes: { class: "el-tree-node__content" }, eventTag: { kind: "tree-node-content", path: node.path } }, page);
    const icon = createElement("span", { attributes: { class: iconClassName(node) }, eventTag: { kind: "tree-expand-icon", path: node.path } }, page);
    const label = createElement("span", { attributes: { class: "el-tree-node__label" }, eventTag: { kind: "tree-node-label", path: node.path } }, page);
    label.textContent = node.label;
    node.labelEl = label;
    icon.addEventListener("click", (event) => {
      // 贴近 Element UI：展开图标点击不触发节点选中
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      onExpandClick(node);
    });
    content.addEventListener("click", () => onSelectClick(node));
    const inlineIconsMounted = options.inlineIconsRequireTreeEditMode !== true || (treeEditMode && inlineIconsReady);
    if (inlineIconsMounted && options.inlineIcons === "tianyuan") {
      const customNode = createElement("div", { attributes: { class: "custom-tree-node" } }, page);
      const nameArea = createElement("div", { attributes: { class: "name-area" } }, page);
      const name = createElement("div", { attributes: { class: node.newAdd ? "name new-add" : "name" } }, page);
      const optionArea = createElement("div", { attributes: { class: "opt-area" } }, page);
      name.append(label);
      nameArea.append(name);
      customNode.append(nameArea, optionArea);
      content.append(icon, customNode);
      const optionDefs = [
        { op: "add-sibling", tag: "i", handler: () => options.inlineSiblingNoDialog ? addChildNode(node, "after", options.inlineBlankStructureNodes ? "" : "节点1", null, options.inlineBlankStructureNodes === true) : openStructureDialog("add", node, "after") },
        { op: "add-child", tag: "svg", handler: () => options.inlineChildNoDialog ? addChildNode(node, "child", options.inlineBlankStructureNodes ? "" : "节点1", null, options.inlineBlankStructureNodes === true) : openStructureDialog("add", node, "child") },
        { op: "settings", tag: "i", handler: () => openSettings(node.path) },
        { op: "delete", tag: "i", handler: () => onDeleteClick(node) },
      ].slice(0, Number.isInteger(options.treeRowControlsCount) ? options.treeRowControlsCount : 4);
      for (const def of optionDefs) {
        const control = createElement(def.tag, {
          attributes: { class: def.tag === "i" ? "el-icon opt-icon" : "" },
          eventTag: { kind: "node-inline-icon", path: node.path, op: def.op },
        }, page);
        const handlerTarget = def.op === "add-child" && options.nestedAddChildHandler
          ? createElement("path", { eventTag: { kind: "node-inline-icon", path: node.path, op: def.op } }, page)
          : control;
        if (handlerTarget !== control) control.append(handlerTarget);
        handlerTarget.addEventListener("click", (event) => {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (page.unresponsive) return;
          journal.push({ kind: "inline-click", op: def.op, path: node.path });
          def.handler();
        });
        handlerTarget[Symbol("_vei")] = { onClick: { value: def.handler } };
        optionArea.append(control);
      }
    } else {
      content.append(icon, label);
    }
    if (inlineIconsMounted && options.inlineIcons !== false && options.inlineIcons !== "tianyuan") {
      const inlineDefs = [
        { op: "add-sibling", className: "node-inline-icon node-inline-sibling", aria: "新建同级节点", glyph: "⊕", handler: () => options.inlineSiblingNoDialog ? addChildNode(node, "after", "节点1", null) : openStructureDialog("add", node, "after") },
        { op: "add-child", className: "node-inline-icon node-inline-add", aria: "新建子节点", glyph: "⊕", handler: () => openStructureDialog("add", node, "child") },
        { op: "copy", className: "node-inline-icon node-inline-copy", aria: "复制节点", glyph: "⧉", handler: () => copyNode(node, `${node.label}（副本）`) },
        { op: "settings", className: "node-inline-icon node-inline-settings", aria: "节点设置", glyph: "⚙", handler: () => openSettings(node.path) },
        { op: "delete", className: "node-inline-icon node-inline-delete", aria: "删除节点", glyph: "🗑", handler: () => onDeleteClick(node) },
      ];
      for (const def of inlineDefs) {
        const inline = createElement("span", {
          attributes: { class: def.className, "aria-label": def.aria, role: "button" },
          eventTag: { kind: "node-inline-icon", path: node.path, op: def.op },
        }, page);
        inline.textContent = def.glyph;
        inline.addEventListener("click", (event) => {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (page.unresponsive) return;
          journal.push({ kind: "inline-click", op: def.op, path: node.path });
          def.handler();
        });
        content.append(inline);
      }
    }
    element.append(content);
    node.el = element;
    node.contentEl = content;
    node.iconEl = icon;
    node.childrenContainerEl = null;
    if (node.children.length) {
      node.childrenContainerEl = renderChildrenContainer(node);
      element.append(node.childrenContainerEl);
    } else if (!node.lazy) {
      // 折叠的非叶节点保留一个隐藏空子容器，贴近 Element UI 的 DOM 形态
      node.childrenContainerEl = createElement("div", { attributes: { class: "el-tree-node__children" }, hidden: true, eventTag: { kind: "children-container", path: node.path } }, page);
      element.append(node.childrenContainerEl);
    }
    return element;
  }

  function renderTree() {
    treeRoot.childNodes = [];
    for (const root of state.nodes) {
      if (!nodeMatchesFilter(root)) continue;
      root.el = renderNodeElement(root);
      treeRoot.append(root.el);
    }
  }

  function syncNodeDom(node) {
    if (!node.el) return;
    node.el.setAttribute("aria-expanded", String(Boolean(node.expanded)));
    node.iconEl.setAttribute("class", iconClassName(node));
    if (node.childrenContainerEl) node.el.removeChild(node.childrenContainerEl);
    node.childrenContainerEl = null;
    if (node.children.length) {
      node.childrenContainerEl = renderChildrenContainer(node);
      node.el.append(node.childrenContainerEl);
    } else if (!node.lazy) {
      node.childrenContainerEl = createElement("div", { attributes: { class: "el-tree-node__children" }, hidden: true, eventTag: { kind: "children-container", path: node.path } }, page);
      node.el.append(node.childrenContainerEl);
    }
  }

  function onExpandClick(node) {
    if (page.unresponsive) return;
    if (node.lazy && !node.loaded) {
      node.loading = true;
      journal.push({ kind: "lazy-load-start", path: node.path });
      syncNodeDom(node);
      setTimeout(() => {
        node.loading = false;
        node.loaded = true;
        node.children = materializeNodes(node.lazyChildren, node.path);
        node.expanded = true;
        journal.push({ kind: "lazy-load", path: node.path, children: node.children.length });
        syncNodeDom(node);
        renderEditorPanel();
      }, 15);
      return;
    }
    node.expanded = !node.expanded;
    journal.push({ kind: "expand", path: node.path, expanded: node.expanded });
    syncNodeDom(node);
  }

  function selectNodeInternal(node) {
    forEachNode(state.nodes, (other) => {
      other.selected = false;
      if (other.el) {
        other.el.classList.remove("is-current");
        other.el.removeAttribute("aria-selected");
      }
    });
    node.selected = true;
    // 真实语义：点击节点行会打开该节点的编辑框
    node.editorOpen = true;
    if (node.el) {
      node.el.classList.add("is-current");
      node.el.setAttribute("aria-selected", "true");
    }
    state.selectedNode = node;
    state.selectedPath = node.path;
    renderEditorPanel();
  }

  function onSelectClick(node) {
    if (page.unresponsive) return;
    selectNodeInternal(node);
    journal.push({ kind: "select", path: node.path });
    if (options.rerenderTreeOnSelect) renderTree();
  }

  // ———— 编辑器面板 ————
  // 工具栏命令全集（与真实页面截图一一对应）；insert 类命令写入占位文本并可撤销
  const EDITOR_COMMAND_DEFS = [
    { command: "bold", label: "加粗" },
    { command: "italic", label: "斜体" },
    { command: "underline", label: "下划线" },
    { command: "strikethrough", label: "删除线" },
    { command: "font_increase", label: "字号增大" },
    { command: "font_decrease", label: "字号减小" },
    { command: "font_color", label: "字体颜色" },
    { command: "align_center", label: "居中对齐" },
    { command: "align_left", label: "左对齐" },
    { command: "align_right", label: "右对齐" },
    { command: "align_justify", label: "两端对齐" },
    { command: "indent", label: "增加缩进" },
    { command: "outdent", label: "减少缩进" },
    { command: "tt", label: "正文格式" },
    { command: "table", label: "表格" },
    { command: "image", label: "图片" },
    { command: "formula", label: "公式" },
    { command: "field", label: "动态字段" },
    { command: "reference", label: "引用" },
    { command: "list_ordered", label: "有序列表" },
    { command: "list_unordered", label: "无序列表" },
    { command: "undo", label: "撤销" },
    { command: "redo", label: "重做" },
    { command: "subscript", label: "下标" },
    { command: "superscript", label: "上标" },
  ];
  const EDITOR_INSERT_TEXT = {
    table: "［表格］", image: "［图片］", formula: "［公式］", field: "［动态字段］", reference: "［引用］",
  };

  function editorHistoryOf(node) {
    if (!Array.isArray(node.editorHistory)) {
      node.editorHistory = [String(node.editor?.text ?? "")];
      node.editorRedoStack = [];
    }
    return node.editorHistory;
  }

  function applyEditorCommand(node, command) {
    journal.push({ kind: "editor-command", command, path: node.path });
    if (!node.editor) return;
    const history = editorHistoryOf(node);
    const insert = EDITOR_INSERT_TEXT[command];
    if (insert) {
      history.push(node.editor.text);
      node.editorRedoStack = [];
      node.editor.text = node.editor.text + insert;
      if (node.editorEl) node.editorEl.textContent = node.editor.text;
      journal.push({ kind: "editor-text-change", path: node.path, via: "editor-command", command });
      return;
    }
    if (command === "undo") {
      if (history.length > 1) {
        node.editorRedoStack = Array.isArray(node.editorRedoStack) ? node.editorRedoStack : [];
        node.editorRedoStack.push(node.editor.text);
        history.pop();
        node.editor.text = history[history.length - 1];
        if (node.editorEl) node.editorEl.textContent = node.editor.text;
        journal.push({ kind: "editor-undo", path: node.path });
      }
      return;
    }
    if (command === "redo") {
      node.editorRedoStack = Array.isArray(node.editorRedoStack) ? node.editorRedoStack : [];
      if (node.editorRedoStack.length) {
        history.push(node.editor.text);
        node.editor.text = node.editorRedoStack.pop();
        if (node.editorEl) node.editorEl.textContent = node.editor.text;
        journal.push({ kind: "editor-redo", path: node.path });
      }
    }
  }

  function openEditorFor(node) {
    node.editorOpen = true;
    renderEditorPanel();
    journal.push({ kind: "editor-open", path: node.path });
  }

  function closeEditorFor(node, via) {
    node.editorOpen = false;
    renderEditorPanel();
    journal.push({ kind: "editor-closed", path: node.path, via: via || "close-link" });
  }

  function editorSaveFor(node) {
    if (page.unresponsive) return;
    journal.push({ kind: "editor-save", path: node.path });
    const mode = state.editorSaveMode;
    if (mode === "timeout") return;
    const toast = createElement("div", { attributes: { class: mode === "ok" ? "el-message el-message--success" : "el-message el-message--error" }, eventTag: { kind: "toast" } }, page);
    toast.textContent = mode === "ok" ? "保存成功" : "保存失败";
    pageRoot.append(toast);
    if (mode === "ok") {
      state.savedAt = Date.now();
      state.saveCount += 1;
    }
  }

  function buildEditorElement(node) {
    const framework = node.editor.framework;
    const activationRequired = options.newNodeRequiresActivation === true && node.newAdd;
    const shared = { attributes: { contenteditable: activationRequired ? "false" : "true" }, eventTag: { kind: "editor", path: node.path, framework } };
    let editorElement;
    if (framework === "quill") {
      editorElement = createElement("div", { ...shared, attributes: { ...shared.attributes, class: "ql-editor node-editor" } }, page);
    } else if (framework === "ckeditor") {
      editorElement = createElement("div", { ...shared, attributes: { ...shared.attributes, class: "ck-editor__editable node-editor" } }, page);
    } else if (framework === "tiptap" || framework === "prosemirror") {
      editorElement = createElement("div", {
        ...shared,
        attributes: { ...shared.attributes, class: "ProseMirror node-editor", ...(framework === "tiptap" ? { "data-tiptap-editor": "true" } : {}) },
      }, page);
    } else {
      editorElement = createElement("div", { ...shared, attributes: { ...shared.attributes, class: "node-editor" } }, page);
    }
    editorElement.textContent = node.editor.text;
    if (activationRequired && options.newNodeActivationRequiresDoubleClick === true) {
      const paragraph = createElement("p", {}, page);
      const segment = createElement("span", {}, page);
      paragraph.append(segment);
      editorElement.append(paragraph);
      page.newNodeActivationHit = segment;
    }
    if (options.newNodeModelAvailable === true && node.newAdd && (framework === "prosemirror" || framework === "tiptap")) {
      const mountModel = () => {
      const makeDoc = (value) => {
        const content = String(value);
        const paragraph = {
          isTextblock: true,
          textContent: content,
          content: { size: content.length },
          childCount: content ? 1 : 0,
          child(index) { return index === 0 && content ? { isText: true, textContent: content } : null; },
        };
        return {
          textContent: content,
          childCount: 1,
          lastChild: paragraph,
          child(index) { return index === 0 ? paragraph : null; },
          descendants(visitor) { visitor(paragraph, 0, this); },
          eq(other) { return Boolean(other && other.textContent === content); },
        };
      };
      const state = {
        schema: {},
        doc: makeDoc(node.editor.text),
        get tr() {
          const current = this.doc.textContent;
          return { insertText: (text, from, to) => ({ text: String(text), from, to, base: current }) };
        },
      };
      editorElement.editorView = {
        dom: editorElement,
        editable: !activationRequired,
        state,
        dispatch(transaction) {
          if (transaction.base !== state.doc.textContent || transaction.from !== 1 || transaction.to !== 1) throw new Error("fixture model changed");
          node.editor.text = transaction.text;
          state.doc = makeDoc(transaction.text);
          editorElement.textContent = transaction.text;
          node.label = transaction.text;
          if (node.labelEl) node.labelEl.textContent = transaction.text;
          journal.push({ kind: "model-dispatch", framework: "prosemirror", method: "insertText", path: node.path, candidateId: node.dataKey });
        },
      };
        journal.push({ kind: "editor-view-mounted", candidateId: node.dataKey });
      };
      const modelDelayMs = Math.max(0, Number(options.newNodeModelDelayMs) || 0);
      if (modelDelayMs > 0) setTimeout(mountModel, modelDelayMs);
      else mountModel();
    }
    if (options.editorModelEditable === true && (framework === "prosemirror" || framework === "tiptap")) {
      editorElement.editorView = { dom: editorElement, editable: true, state: { schema: {}, tr: {} }, dispatch() {} };
    }
    // 编辑框每次打开都重置内容栈（undo/redo 基于打开时内容）
    node.editorHistory = [String(node.editor.text)];
    node.editorRedoStack = [];
    if (framework === "quill") {
      page.window.Quill = {
        find: (target) => (target === editorElement ? {
          getText: () => node.editor.text,
          setText: (value) => {
            node.editor.text = String(value);
            editorElement.textContent = String(value);
            journal.push({ kind: "model-call", framework: "quill", method: "setText", path: node.path });
          },
        } : null),
      };
    }
    if (framework === "ckeditor") {
      editorElement.ckeditorInstance = {
        getData: () => node.editor.text,
        setData: (value) => {
          node.editor.text = String(value);
          editorElement.textContent = String(value);
          journal.push({ kind: "model-call", framework: "ckeditor", method: "setData", path: node.path });
        },
      };
    }
    return editorElement;
  }

  function renderEditorPanel() {
    editorPanel.childNodes = [];
    if (options.editors === "none") return;
    const targets = state.showAllEditors
      ? (() => { const list = []; forEachNode(state.nodes, (node) => { if (node.editor && node.editorOpen !== false) list.push(node); }); return list; })()
      : (state.selectedNode?.editor && state.selectedNode.editorOpen !== false ? [state.selectedNode] : []);
    for (const node of targets) {
      const wrapper = createElement("div", { attributes: { class: "editor-wrapper", "data-editor-for": node.path, ...(node.newAdd && node.dataKey ? { id: `content_${node.dataKey}` } : {}) }, eventTag: { kind: "editor-wrapper", path: node.path } }, page);
      // 编辑框上方三链接：关闭 | 保存 | 预览
      const linksRow = createElement("div", { attributes: { class: "editor-links" }, eventTag: { kind: "editor-links", path: node.path } }, page);
      const linkDefs = [
        { link: "close", label: "关闭", handler: () => onCloseClick(node) },
        { link: "save", label: "保存", handler: () => editorSaveFor(node) },
        { link: "preview", label: "预览", handler: () => journal.push({ kind: "editor-preview", path: node.path }) },
      ];
      for (const def of linkDefs) {
        const anchor = createElement("a", { attributes: { class: "editor-link", "data-link": def.link }, eventTag: { kind: "editor-link", path: node.path, link: def.link } }, page);
        anchor.textContent = def.label;
        anchor.addEventListener("click", (event) => {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          def.handler();
        });
        linksRow.append(anchor);
        if (def.link !== "preview") {
          const separator = createElement("span", { attributes: { class: "editor-link-separator" } }, page);
          separator.textContent = " | ";
          linksRow.append(separator);
        }
      }
      wrapper.append(linksRow);
      const activationRequired = options.newNodeRequiresActivation === true && node.newAdd;
      if (activationRequired) linksRow.style.display = "none";
      // 编辑框上方工具栏（可配置 disabled）
      if (options.editorToolbar !== false) {
        const toolbarOptions = options.editorToolbar && typeof options.editorToolbar === "object" ? options.editorToolbar : {};
        const disabledList = Array.isArray(toolbarOptions.disabled) ? toolbarOptions.disabled : [];
        const toolbarElement = createElement("div", { attributes: { class: "editor-toolbar", role: "toolbar", "aria-label": "编辑器工具栏" }, eventTag: { kind: "editor-toolbar", path: node.path } }, page);
        for (const def of EDITOR_COMMAND_DEFS) {
          const button = createElement("button", {
            attributes: { type: "button", class: "editor-toolbar-button", "aria-label": def.label, title: def.label },
            disabled: disabledList.includes(def.command),
            eventTag: { kind: "editor-toolbar-button", path: node.path, command: def.command },
          }, page);
          button.textContent = def.label;
          button.addEventListener("click", (event) => {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            if (page.unresponsive) return;
            applyEditorCommand(node, def.command);
          });
          toolbarElement.append(button);
        }
        wrapper.append(toolbarElement);
      }
      node.editorEl = buildEditorElement(node);
      if (activationRequired) {
        const activateEditor = () => {
          if (options.newNodeActivationDisabled === true || !node.editorEl.editorView) return;
          node.editorEl.editorView.editable = true;
          node.editorEl.setAttribute("contenteditable", "true");
          linksRow.style.display = "";
          journal.push({ kind: "editor-activated", candidateId: node.dataKey });
        };
        node.editorEl.scrollIntoView = () => journal.push({ kind: "editor-scroll-into-view", candidateId: node.dataKey });
        node.editorEl.addEventListener("click", () => {
          journal.push({ kind: "editor-activation-attempt", candidateId: node.dataKey });
          if (options.newNodeActivationRequiresDoubleClick !== true) activateEditor();
        });
        if (options.newNodeActivationRequiresDoubleClick === true) {
          const activateOnDoubleClick = () => {
            journal.push({ kind: "editor-activation-dblclick", candidateId: node.dataKey });
            activateEditor();
          };
          node.editorEl.addEventListener("dblclick", activateOnDoubleClick);
          node.editorEl[Symbol("_vei")] = { onDblclick: { value: activateOnDoubleClick } };
        }
      }
      wrapper.append(node.editorEl);
      editorPanel.append(wrapper);
    }
  }

  // ———— 结构操作与工具栏状态机 ————
  function reassignPaths(nodes, prefix) {
    nodes.forEach((node, index) => {
      node.path = prefix ? `${prefix}/${index}` : String(index);
      reassignPaths(node.children, node.path);
    });
  }

  function listContaining(node) {
    if (node.path.indexOf("/") === -1) return { list: state.nodes, index: Number(node.path) };
    const parentPath = node.path.slice(0, node.path.lastIndexOf("/"));
    const parent = findNode(parentPath);
    if (!parent) return { list: null, index: -1 };
    return { list: parent.children, index: Number(node.path.slice(node.path.lastIndexOf("/") + 1)) };
  }

  function makeSimpleNode(label, editor) {
    return {
      path: "", label: String(label), dataKey: null, expanded: false, selected: false,
      lazy: false, lazyChildren: [], loaded: true, loading: false,
      editor: editor ? { framework: "contenteditable", text: String(editor) } : null,
      children: [], el: null, contentEl: null, iconEl: null, childrenContainerEl: null, editorEl: null,
    };
  }

  function afterStructureChange(op, detail) {
    reassignPaths(state.nodes, "");
    state.selectedPath = state.selectedNode?.path ?? null;
    renderTree();
    renderEditorPanel();
    journal.push({ kind: "structure", ...detail });
  }

  function moveNode(node, delta) {
    const { list, index } = listContaining(node);
    if (!list) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) {
      journal.push({ kind: "structure-ignored", op: delta < 0 ? "up" : "down", path: node.path });
      return;
    }
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    afterStructureChange(delta < 0 ? "up" : "down", { op: delta < 0 ? "up" : "down", path: node.path });
  }

  function deleteNode(node) {
    const { list, index } = listContaining(node);
    if (!list) return;
    list.splice(index, 1);
    if (state.selectedNode === node) state.selectedNode = null;
    afterStructureChange("delete", { op: "delete", path: node.path });
  }

  function addChildNode(node, position, title, template, blankForTitle = false) {
    const child = makeSimpleNode(title, template);
    if (options.assignCreatedIds === true && !child.dataKey) child.dataKey = `fixture-added-${++generatedNodeSequence}`;
    if (blankForTitle) {
      child.dataKey = String(options.newNodeCandidateId || "fixture-new-node");
      child.editor = { framework: "prosemirror", text: String(options.newNodeModelInitialText || "") };
      child.newAdd = true;
    }
    if (position === "child") {
      node.children.push(child);
      node.expanded = true;
    } else {
      const { list, index } = listContaining(node);
      if (!list) return;
      list.splice(position === "before" ? index : index + 1, 0, child);
    }
    state.selectedNode = child;
    afterStructureChange("add", { op: "add", position, title, path: node.path });
  }

  function copyNode(node, title) {
    const copy = makeSimpleNode(title, node.editor?.text ?? "");
    copy.children = node.children.map(cloneNodePlain);
    const { list, index } = listContaining(node);
    if (!list) return;
    list.splice(index + 1, 0, copy);
    state.selectedNode = copy;
    afterStructureChange("copy", { op: "copy", path: node.path, title });
  }

  function closeDialog() {
    for (const child of dialogHost.childNodes) child.parentElement = null;
    dialogHost.childNodes = [];
  }

  // ———— 删除确认弹窗与编辑器关闭确认弹窗 ————
  function onDeleteClick(node) {
    if (!state.deleteConfirm) {
      deleteNode(node);
      return;
    }
    closeDialog();
    const dialog = createElement("div", { attributes: { class: "el-dialog" }, eventTag: { kind: "delete-confirm-dialog", path: node.path } }, page);
    const titleElement = createElement("div", { attributes: { class: "el-dialog__title" } }, page);
    titleElement.textContent = "删除节点";
    const body = createElement("div", { attributes: { class: "el-dialog__body" } }, page);
    const message = createElement("div", { attributes: { class: "delete-confirm-message" } }, page);
    message.textContent = `确定删除节点「${node.label}」吗？`;
    const actions = createElement("div", { attributes: { class: "dialog-actions" } }, page);
    actions.append(
      dialogButton("确认", { kind: "dialog-button", dialog: "delete-confirm", role: "confirm" }, () => {
        deleteNode(node);
        closeDialog();
      }),
      dialogButton("取消", { kind: "dialog-button", dialog: "delete-confirm", role: "cancel" }, () => closeDialog()),
    );
    body.append(message, actions);
    dialog.append(titleElement, body);
    dialogHost.append(dialog);
  }

  function onCloseClick(node) {
    journal.push({ kind: "editor-close", path: node.path });
    if (!state.editorCloseConfirm) {
      closeEditorFor(node, "close-link");
      return;
    }
    closeDialog();
    const dialog = createElement("div", { attributes: { class: "el-dialog" }, eventTag: { kind: "close-confirm-dialog", path: node.path } }, page);
    const titleElement = createElement("div", { attributes: { class: "el-dialog__title" } }, page);
    titleElement.textContent = "未保存提示";
    const body = createElement("div", { attributes: { class: "el-dialog__body" } }, page);
    const message = createElement("div", { attributes: { class: "close-confirm-message" } }, page);
    message.textContent = "当前编辑框有未保存的更改，关闭将丢弃这些更改。";
    const actions = createElement("div", { attributes: { class: "dialog-actions" } }, page);
    actions.append(
      dialogButton("不保存", { kind: "dialog-button", dialog: "close-confirm", role: "discard" }, () => {
        closeDialog();
        closeEditorFor(node, "discard");
      }),
      dialogButton("取消", { kind: "dialog-button", dialog: "close-confirm", role: "cancel" }, () => closeDialog()),
    );
    body.append(message, actions);
    dialog.append(titleElement, body);
    dialogHost.append(dialog);
  }

  function dialogButton(label, eventTag, handler) {
    const button = createElement("button", { attributes: { type: "button", class: "dialog-button" }, eventTag }, page);
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function openStructureDialog(kind, node, initialPosition = "child") {
    closeDialog();
    const dialog = createElement("div", { attributes: { class: "el-dialog" }, eventTag: { kind: "structure-dialog", dialog: kind, path: node.path } }, page);
    const titleElement = createElement("div", { attributes: { class: "el-dialog__title" } }, page);
    titleElement.textContent = kind === "add" ? "新增节点" : "复制节点";
    const body = createElement("div", { attributes: { class: "el-dialog__body" } }, page);
    // 白名单字段：节点名称（行内表单/对话框的标题输入）
    const nameLabel = createElement("label", { attributes: { class: "dialog-field-label", for: "dialog-node-title" }, eventTag: { kind: "dialog-field-label", label: "节点名称" } }, page);
    nameLabel.textContent = "节点名称";
    const input = createElement("input", { attributes: { type: "text", class: "el-input__inner", id: "dialog-node-title", name: "节点名称", placeholder: "节点标题" }, eventTag: { kind: "dialog-input", dialog: kind } }, page);
    input.value = kind === "copy" ? `${node.label}（副本）` : "";
    body.append(nameLabel, input);
    let position = initialPosition;
    if (kind === "add") {
      const group = createElement("div", { attributes: { class: "position-group" } }, page);
      const inputs = [];
      const options = [["child", "新增子节点"], ["after", "在下方插入"], ["before", "在上方插入"]];
      for (const [value, label] of options) {
        const wrap = createElement("label", { attributes: { class: "position-option" }, eventTag: { kind: "position-option", value } }, page);
        const radio = createElement("input", { attributes: { type: "radio", name: "position" }, eventTag: { kind: "position-radio", value } }, page);
        radio.checked = value === position;
        const span = createElement("span", {}, page);
        span.textContent = label;
        wrap.append(radio, span);
        inputs.push({ radio, value });
        group.append(wrap);
      }
      for (const { radio, value } of inputs) {
        radio.addEventListener("click", () => {
          for (const item of inputs) item.radio.checked = false;
          radio.checked = true;
          position = value;
          journal.push({ kind: "radio-click", field: "position", value });
        });
      }
      body.append(group);
    }
    const actions = createElement("div", { attributes: { class: "dialog-actions" } }, page);
    actions.append(
      dialogButton("确认", { kind: "dialog-button", dialog: kind, role: "confirm" }, () => {
        const finalTitle = String(input.value || (kind === "add" ? "新增节点" : `${node.label}（副本）`));
        if (kind === "add" && Number(options.structureAddDelayMs) > 0) {
          closeDialog();
          setTimeout(() => addChildNode(node, position, finalTitle, null), Number(options.structureAddDelayMs));
          return;
        }
        if (kind === "add") addChildNode(node, position, finalTitle, null);
        else copyNode(node, finalTitle);
        closeDialog();
      }),
      dialogButton("取消", { kind: "dialog-button", dialog: kind, role: "cancel" }, () => closeDialog()),
    );
    body.append(actions);
    dialog.append(titleElement, body);
    dialogHost.append(dialog);
  }

  function performToolbarOp(op) {
    const node = state.selectedNode || findNode(state.selectedPath || "");
    if (!node) {
      journal.push({ kind: "toolbar-no-selection", op });
      return;
    }
    if (op === "save") {
      if (page.unresponsive) return;
      state.savedAt = Date.now();
      state.saveCount += 1;
      journal.push({ kind: "save", savedAt: state.savedAt, count: state.saveCount });
      if (state.saveToast) {
        const toast = createElement("div", { attributes: { class: "el-message el-message--success" }, eventTag: { kind: "toast" } }, page);
        toast.textContent = "保存成功";
        pageRoot.append(toast);
      }
      if (state.saveNetwork) {
        resources.push({ name: "https://excel.zhrdc.net/api/report/save?draft=1", entryType: "resource", initiatorType: "xhr" });
      }
      return;
    }
    if (op === "up") return moveNode(node, -1);
    if (op === "down") return moveNode(node, 1);
    if (op === "delete") return deleteNode(node);
    if (op === "add") return openStructureDialog("add", node);
    if (op === "copy") return openStructureDialog("copy", node);
  }

  // ———— 属性对话框 ————
  let reusableSettingsLayer = null;
  let reusableSettingsDialog = null;

  function openSettings(nodePath) {
    closeDialog();
    const node = typeof nodePath === "string" ? findNode(nodePath) : nodePath;
    if (!node) return null;
    const settings = state.settingsByPath.get(node.path) || { ...DEFAULT_SETTINGS };
    state.settingsByPath.set(node.path, settings);
    const reuseDialog = options.reuseSettingsDialog === true && reusableSettingsLayer && reusableSettingsDialog;
    const layer = reuseDialog ? reusableSettingsLayer : createElement("div", { attributes: { role: "dialog", "aria-modal": "true" } }, page);
    const dialog = reuseDialog ? reusableSettingsDialog : createElement("div", { attributes: { class: "el-dialog c-setting-module-attr" }, eventTag: { kind: "settings-dialog", path: node.path } }, page);
    if (reuseDialog) {
      for (const child of dialog.childNodes) child.parentElement = null;
      dialog.childNodes = [];
      dialog.attributes.class = "el-dialog c-setting-module-attr";
      delete dialog.attributes["data-node-key"];
      dialog.eventTag = { kind: "settings-dialog", path: node.path };
    }
    if (node.dataKey && options.settingsDialogDataNodeKey !== false) dialog.setAttribute("data-node-key", node.dataKey);
    const titleElement = createElement("div", { attributes: { class: "el-dialog__title" } }, page);
    titleElement.textContent = "模块属性设置";
    const body = createElement("div", { attributes: { class: "el-dialog__body" } }, page);
    const form = createElement("div", { attributes: { class: "el-form" } }, page);
    for (const field of SETTINGS_FIELDS) {
      const row = createElement("div", { attributes: { class: "el-form-item" }, eventTag: { kind: "settings-row", label: field.label } }, page);
      const rowLabel = createElement("label", { attributes: { class: "el-form-item__label" }, eventTag: { kind: "settings-label", label: field.label } }, page);
      rowLabel.textContent = field.label;
      const content = createElement("div", { attributes: { class: "el-form-item__content" } }, page);
      if (field.type === "select") {
        const select = createElement("select", { eventTag: { kind: "settings-select", label: field.label } }, page);
        for (const optionText of field.options) {
          const option = createElement("option", { attributes: { value: optionText }, eventTag: { kind: "settings-option", label: field.label, value: optionText } }, page);
          option.textContent = optionText;
          option.selected = settings[field.label] === optionText;
          select.append(option);
        }
        select.addEventListener("change", () => {
          settings[field.label] = select.value;
          journal.push({ kind: "select-change", path: node.path, field: field.label, value: select.value });
        });
        content.append(select);
      } else {
        const inputs = [];
        for (const optionText of field.options) {
          const wrap = createElement("label", { attributes: { class: "setting-option" }, eventTag: { kind: "settings-radio", label: field.label, value: optionText } }, page);
          const radioValue = field.label === "是否编号" ? (optionText === "是" ? "true" : "false") : optionText;
          const radio = createElement("input", { attributes: { type: "radio", name: field.label, value: radioValue }, eventTag: { kind: "settings-radio-input", label: field.label, value: optionText } }, page);
          radio.checked = settings[field.label] === optionText;
          const span = createElement("span", {}, page);
          span.textContent = optionText;
          wrap.append(radio, span);
          inputs.push({ radio, optionText });
          content.append(wrap);
        }
        for (const { radio, optionText } of inputs) {
          radio.addEventListener("click", () => {
            const updateSelection = () => {
              for (const item of inputs) item.radio.checked = false;
              radio.checked = true;
              settings[field.label] = optionText;
              journal.push({ kind: "radio-click", path: node.path, field: field.label, value: optionText });
            };
            if (options.asyncSettingsRadio === true) Promise.resolve().then(updateSelection);
            else if (options.asyncSettingsRadio !== "never") updateSelection();
          });
        }
      }
      row.append(rowLabel, content);
      form.append(row);
    }
    body.append(form);
    const actions = createElement("div", { attributes: { class: "el-dialog__footer" } }, page);
    actions.append(
      dialogButton("确认", { kind: "dialog-button", dialog: "settings", role: "confirm" }, () => {
        journal.push({ kind: "settings-confirm", path: node.path });
        if (state.settingsConfirmMode === "stay-open") return;
        state.persistedSettingsByPath.set(node.path, { ...settings });
        closeDialog();
      }),
      dialogButton("取消", { kind: "dialog-button", dialog: "settings", role: "cancel" }, () => {
        journal.push({ kind: "settings-cancel", path: node.path });
        state.settingsByPath.set(node.path, { ...state.persistedSettingsByPath.get(node.path) });
        closeDialog();
      }),
    );
    dialog.append(titleElement, body, actions);
    layer.append(dialog);
    dialogHost.append(layer);
    if (options.reuseSettingsDialog === true && !reusableSettingsLayer) {
      reusableSettingsLayer = layer;
      reusableSettingsDialog = dialog;
    }
    return dialog;
  }

  // ———— Selection / execCommand（真实浏览器命令的模拟入口） ————
  const selection = {
    rangeCount: 0,
    range: null,
    removeAllRanges() { this.rangeCount = 0; this.range = null; },
    addRange(range) { this.rangeCount = 1; this.range = range; },
    getRangeAt() { return this.range; },
    isCollapsed: false,
    toString() { return ""; },
  };

  let documentTimeOrigin = Number.isFinite(options.documentTimeOrigin) && options.documentTimeOrigin > 0 ? options.documentTimeOrigin : 1000;
  const windowObject = {
    crypto: webcrypto,
    location,
    performance: { get timeOrigin() { return documentTimeOrigin; } },
    getComputedStyle(element) {
      return { display: element?.style?.display || "block", visibility: element?.style?.visibility || "visible" };
    },
    getSelection: () => selection,
  };
  page.window = windowObject;

  const documentObject = {
    body: pageRoot,
    documentElement: pageRoot,
    activeElement: null,
    title: "报告编辑（fixture）",
    querySelectorAll: (selector) => querySelectorAllImpl(pageRoot, selector),
    querySelector: (selector) => querySelectorAllImpl(pageRoot, selector)[0] || null,
    createElement: (tag) => createElement(tag, {}, page),
    createRange: () => ({
      element: null,
      mode: "all",
      selectNodeContents(element) { this.element = element; this.mode = "all"; },
      collapse(toStart) { this.mode = toStart ? "start" : "end"; },
      setStart() {},
      setEnd() {},
    }),
    execCommand: (command, _ui, value) => {
      const range = selection.range;
      const target = documentObject.activeElement?.inputSelected ? documentObject.activeElement : range?.element || null;
      journal.push({ kind: "execCommand", command, value: String(value ?? ""), rangeMode: range?.mode || null, target: describeElement(target) });
      if (!["insertText", "delete"].includes(command) || !target) return false;
      const text = String(value ?? "");
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        target.value = command === "delete" ? "" : range?.mode === "end" && !target.inputSelected ? String(target.value || "") + text : text;
        target.inputSelected = false;
        journal.push({ kind: "input-text-change", value: target.value });
        return true;
      }
      const node = findNodeByEditorElement(target);
      if (!node || !node.editor) return false;
      node.editor.text = range.mode === "end" ? node.editor.text + text : text;
      target.textContent = node.editor.text;
      // 经 execCommand 的写入同样进入内容栈，保证 undo 可回退
      const history = editorHistoryOf(node);
      history.push(node.editor.text);
      node.editorRedoStack = [];
      journal.push({ kind: "editor-text-change", path: node.path, via: "execCommand" });
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  page.document = documentObject;
  if (options.newNodeActivationRequiresDoubleClick === true) {
    windowObject.innerWidth = 1024;
    windowObject.innerHeight = 768;
    documentObject.elementFromPoint = () => page.newNodeActivationHit || null;
  }

  // ———— 初始渲染 ————
  renderTree();
  if (state.selectedNode) selectNodeInternal(state.selectedNode);
  renderEditorPanel();

  // ———— 测试辅助 ————
  const helpers = {
    nodeByPath: findNode,
    openSettings,
    closeDialog,
    clickToolbar: performToolbarOp,
    treeLabels() {
      return querySelectorAllImpl(treeRoot, ".el-tree-node__label").map((element) => element.textContent);
    },
    selectedPath: () => state.selectedNode?.path ?? null,
    treeEditMode: () => treeEditMode,
    editorText(nodePath) {
      const node = findNode(nodePath);
      return node?.editor?.text ?? null;
    },
    setText(nodePath, value) {
      const node = findNode(nodePath);
      if (!node?.editor) return false;
      node.editor.text = String(value);
      renderEditorPanel();
      journal.push({ kind: "fixture-set-text", path: node.path });
      return true;
    },
    setUnresponsive(value) { page.unresponsive = Boolean(value); },
    reloadSettings() {
      closeDialog();
      for (const [nodePath, settings] of state.persistedSettingsByPath) state.settingsByPath.set(nodePath, { ...settings });
      if (options.reloadClosesTreeEditMode === true) {
        treeEditMode = false;
        treeEditButton.textContent = "编辑";
        treeEditButton.setAttribute("aria-label", "编辑");
        renderTree();
      }
      documentTimeOrigin += 100;
      return documentTimeOrigin;
    },
    snapshot() {
      const nodes = [];
      const visit = (list) => {
        for (const node of list) {
          nodes.push({
            path: node.path, label: node.label, expanded: node.expanded, selected: node.selected,
            lazy: node.lazy, loaded: node.loaded,
            editor: node.editor ? { framework: node.editor.framework, text: node.editor.text } : null,
          });
          visit(node.children);
        }
      };
      visit(state.nodes);
      return { nodes, selectedPath: state.selectedPath, savedAt: state.savedAt, saveCount: state.saveCount };
    },
  };

  // ———— vm 沙箱装载适配器 ————
  const context = {
    window: windowObject,
    document: documentObject,
    location,
    Event: FixtureEvent,
    KeyboardEvent: FixtureKeyboardEvent,
    performance: { getEntriesByType: (type) => (type === "resource" ? [...resources] : []) },
    setTimeout,
    clearTimeout,
  };
  const adapterSource = fs.readFileSync(ADAPTER_SOURCE_PATH, "utf8");
  vm.runInNewContext(adapterSource, context);

  return {
    journal,
    resources,
    state,
    context,
    adapter: context.window.__tianyuanReportAuthoringAdapter,
    dom: { root: pageRoot, tree: treeRoot, toolbar, editorPanel, dialogHost },
    helpers,
  };
}

module.exports = { buildReportPage, SETTINGS_FIELDS, DEFAULT_SETTINGS };
