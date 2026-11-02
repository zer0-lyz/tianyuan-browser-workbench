(() => {
  const VERSION = "report-authoring-v2";
  const CONFIRM_EXECUTE_TEXT = "确认执行报告修改";
  const CONFIRM_STRUCTURE_TEXT = "确认执行报告结构修改";
  const CONFIRM_SAVE_TEXT = "确认保存报告";
  const REPORT_ROUTE = /^\/ty\/operation\/([^/]+)\/([^/]+)\/new-report\/([^/]+)\/(add|edit)\/?$/;
  const SETTING_LABELS = new Set(["节点条件", "节点类型", "大纲级别", "是否分段", "是否编号", "编号样式", "是否设置分隔符"]);
  const SETTINGS_WRITABLE_FIELDS = ["是否编号=是"];
  const SAFE_CLASS = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
  const NUMBERED_TITLE_PATTERN = /^第?[0-9一二三四五六七八九十百]+[章节条、.．]/;
  const OP_KINDS = new Set(["settings_open", "settings_write", "editor_text", "editor_command", "structure_add", "structure_add_child", "structure_add_sibling", "structure_copy", "structure_move", "structure_delete"]);
  const INLINE_FORMAT_COMMANDS = new Set(["bold", "italic", "underline", "strikethrough", "subscript", "superscript", "font_increase", "font_decrease", "font_color"]);
  const PARAGRAPH_FORMAT_COMMANDS = new Set(["align_left", "align_center", "align_right", "align_justify", "indent", "outdent"]);
  const STRUCTURE_CONTROL_PATTERNS = {
    structure_add: /新增|添加|插入|add/i,
    structure_copy: /复制|copy/i,
    structure_move_up: /上移|move\s*up/i,
    structure_move_down: /下移|move\s*down/i,
    // 精确匹配"删除节点"，避免误点编辑器工具栏的"删除线"
    structure_delete: /删除节点|^删除$|delete|remove/i,
  };
  // 行内节点操作图标（真实页面：每行右侧 ⊕/复制/🗑）
  const INLINE_ICON_ARIA = { "add-sibling": "新建同级节点", "add-child": "新建子节点", settings: "节点设置", copy: "复制节点", delete: "删除节点" };
  const TREE_ROW_CONTROL_INDEX = { "add-sibling": 0, "add-child": 1, settings: 2, delete: 3 };
  const TREE_ROW_CONTROL_TAGS = ["I", "SVG", "I", "I"];
  // 编辑器工具栏命令白名单（对应真实页面截图按钮；"正文格式"Tt 不在白名单内）
  const EDITOR_COMMAND_LABELS = {
    bold: ["加粗"],
    italic: ["斜体"],
    underline: ["下划线"],
    strikethrough: ["删除线"],
    font_increase: ["字号增大", "增大字号"],
    font_decrease: ["字号减小", "减小字号"],
    font_color: ["字体颜色"],
    align_center: ["居中对齐", "居中"],
    align_left: ["左对齐"],
    align_right: ["右对齐"],
    align_justify: ["两端对齐"],
    indent: ["增加缩进"],
    outdent: ["减少缩进"],
    table: ["表格"],
    image: ["图片"],
    formula: ["公式"],
    field: ["动态字段"],
    reference: ["引用"],
    list_ordered: ["有序列表"],
    list_unordered: ["无序列表"],
    undo: ["撤销"],
    redo: ["重做"],
    subscript: ["下标"],
    superscript: ["上标"],
  };
  const EDITOR_COMMANDS = new Set(Object.keys(EDITOR_COMMAND_LABELS));
  const SUPPORTED_ACTIONS = ["inspect"];
  let settingsTarget = null;
  let settingsTargetObserver = null;
  let settingsInternalClickDepth = 0;
  const settingsInteractionRoot = document.documentElement;

  function clearSettingsTarget() {
    try { settingsTargetObserver?.disconnect(); } catch {}
    settingsTargetObserver = null;
    settingsTarget = null;
  }

  function invalidateSettingsTargetOnExternalAction() {
    if (settingsInternalClickDepth === 0) clearSettingsTarget();
  }

  for (const eventType of ["pointerdown", "mousedown", "click", "keydown"]) {
    try { settingsInteractionRoot?.addEventListener?.(eventType, invalidateSettingsTargetOnExternalAction, true); } catch {}
  }

  function associateSettingsTarget(dialog, element, root) {
    clearSettingsTarget();
    settingsTarget = { dialog, candidateId: candidateId(element), nodePathKey: nodePathKeyOf(element, root) };
    if (typeof MutationObserver !== "function") return;
    try {
      const observer = new MutationObserver(() => {
        if (settingsTarget?.dialog === dialog && (!visible(dialog) || !dialog.parentElement?.contains?.(dialog))) clearSettingsTarget();
      });
      const layer = dialog.closest?.("[role='dialog']") || dialog.parentElement;
      if (layer) observer.observe(layer, { attributes: true, attributeFilter: ["aria-hidden", "class", "style"], childList: true });
      observer.observe(dialog, { attributes: true, attributeFilter: ["aria-hidden", "class", "style", "data-node-key"], childList: true });
      settingsTargetObserver = observer;
    } catch { clearSettingsTarget(); }
  }

  // ———— 基础工具（沿用 v1，语义不变） ————
  function visible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden"
      && Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function sanitize(value, max = 120) {
    const raw = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return /(?:cookie|authorization|token|password|密码|验证码)/i.test(raw) ? "[已隐藏]" : raw.slice(0, max);
  }

  function text(element, max = 120) {
    return sanitize(element?.innerText || element?.textContent || "", max);
  }

  function identity() {
    if (location.protocol !== "https:" || location.hostname !== "excel.zhrdc.net") return null;
    const match = location.pathname.match(REPORT_ROUTE);
    if (!match) return null;
    if (![match[1], match[2], match[3]].every((value) => /^[A-Za-z0-9_-]{1,100}$/.test(value))) return null;
    // detailId 是报告明细身份，位于查询串；格式非法时按缺失处理（不强制，向后兼容）
    const detail = /(?:^|[?&])detailId=([A-Za-z0-9_-]{1,100})(?:&|$)/.exec(String(location.search || ""));
    return {
      projectId: match[1], companyId: match[2], reportType: match[3], mode: match[4], reportId: null,
      ...(detail ? { reportDetailId: detail[1] } : {}),
    };
  }

  function candidateId(element) {
    const value = String(element?.getAttribute("data-node-key") || element?.getAttribute("data-key") || element?.getAttribute("data-id") || "");
    return /^[A-Za-z0-9:_-]{1,200}$/.test(value) && !/(?:cookie|authorization|token|password|验证码)/i.test(value) ? value : null;
  }

  function safeClassNames(element) {
    const value = typeof element?.className === "string" ? element.className : "";
    return value.split(/\s+/).filter((item) => SAFE_CLASS.test(item)).slice(0, 6);
  }

  function controlSemanticHints(element, knownLabels) {
    const hints = [];
    const references = [];
    let current = element;
    for (let depth = 0; depth < 3 && current; depth += 1, current = current.parentElement) {
      for (const attribute of ["aria-label", "title", "data-tooltip", "data-tippy-content"]) {
        const value = String(current.getAttribute?.(attribute) || "").trim();
        const hint = knownLabels.has(value) ? `${attribute}:${value}` : "";
        if (hint && !hints.includes(hint)) hints.push(hint);
      }
      for (const attribute of ["data-command", "data-icon", "data-action", "data-name"]) {
        const value = String(current.getAttribute?.(attribute) || "").trim();
        const hint = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(value) ? `${attribute}:${value}` : "";
        if (hint && !hints.includes(hint)) hints.push(hint);
      }
      try {
        const propSets = [current.__vueParentComponent?.props, current.__vueParentComponent?.vnode?.props, current.__vue__?.$props];
        for (const props of propSets) for (const key of ["command", "icon", "iconName", "name", "action", "label", "ariaLabel", "title"]) {
          const value = typeof props?.[key] === "string" ? props[key].trim() : "";
          const safeValue = knownLabels.has(value) || /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(value) ? value : "";
          const hint = safeValue ? `vue.${key}:${safeValue}` : "";
          if (hint && !hints.includes(hint)) hints.push(hint);
        }
      } catch {}
    }
    try {
      const svgs = String(element?.tagName || "").toLowerCase() === "svg" ? [element] : [...(element?.querySelectorAll?.("svg") || [])];
      for (const svg of svgs.slice(0, 4)) for (const use of [...svg.querySelectorAll("use")].slice(0, 4)) {
        const href = String(use.getAttribute("href") || use.getAttribute("xlink:href") || "");
        const reference = /^#[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(href) ? href : "";
        if (reference && !references.includes(reference)) references.push(reference);
      }
    } catch {}
    return { semanticHints: hints.slice(0, 20), svgReferences: references.slice(0, 8) };
  }

  function structureOf(element) {
    const children = [...(element?.children || [])].slice(0, 8);
    const names = typeof element?.getAttributeNames === "function" ? element.getAttributeNames() : [];
    return {
      tag: String(element?.tagName || "unknown").toLowerCase().slice(0, 20),
      classes: safeClassNames(element),
      childTags: children.map((child) => String(child?.tagName || "unknown").toLowerCase().slice(0, 20)),
      childClasses: children.map((child) => safeClassNames(child)),
      attributeNames: names.filter((name) => /^(?:role|aria-[a-z-]+|data-[a-z0-9-]+)$/.test(name)).slice(0, 12),
      textLength: Math.min(String(element?.textContent || "").length, 10000),
    };
  }

  // ———— 哈希与等待（纯 JS，同步可算） ————
  function normalizeContent(value) {
    return String(value == null ? "" : value).replace(/\r\n?/g, "\n").replace(/[ \t\f\v]+/g, " ").trim();
  }

  function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function hashText(value) {
    return `fnv1a32:${fnv1a32(normalizeContent(value)).toString(16).padStart(8, "0")}`;
  }

  function combineHash(parts) {
    return hashText(parts.join("\u0001"));
  }

  function wait(ms) {
    return new Promise((resolve) => {
      if (typeof setTimeout === "function") setTimeout(resolve, Math.max(0, Math.min(Number(ms) || 0, 5000)));
      else resolve();
    });
  }

  function clampTimeout(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(200, Math.min(Math.round(num), 30000)) : 8000;
  }

  async function waitFor(check, timeoutMs, intervalMs = 40) {
    const budget = clampTimeout(timeoutMs);
    const startedAt = Date.now();
    for (let polls = 0; polls < 600; polls += 1) {
      let ok = false;
      try { ok = Boolean(check()); } catch { ok = false; }
      if (ok) return true;
      if (Date.now() - startedAt >= budget) return false;
      await wait(Math.min(intervalMs, Math.max(1, budget)));
    }
    return false;
  }

  async function waitForValue(check, timeoutMs, intervalMs = 30) {
    const budget = clampTimeout(timeoutMs);
    const startedAt = Date.now();
    for (let polls = 0; polls < 600; polls += 1) {
      let value = null;
      try { value = check(); } catch { value = null; }
      if (value) return value;
      if (Date.now() - startedAt >= budget) return null;
      await wait(Math.min(intervalMs, Math.max(1, budget)));
    }
    return null;
  }

  // ———— 真实鼠标事件序列与控件识别 ————
  function mouseEvent(type, point, detail = 1) {
    const init = {
      type, bubbles: true, cancelable: true, view: null, detail, button: 0,
      buttons: type === "pointerdown" || type === "mousedown" ? 1 : 0, isTrusted: false,
    };
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) { init.clientX = point.x; init.clientY = point.y; }
    if (type.startsWith("pointer") && typeof PointerEvent === "function") {
      try { return new PointerEvent(type, init); } catch {}
    }
    if (typeof MouseEvent === "function") {
      try { return new MouseEvent(type, init); } catch { /* 环境不可用时退回普通事件对象 */ }
    }
    return init;
  }

  function dispatchRealClick(element, point, detail = 1) {
    if (!element || typeof element.dispatchEvent !== "function") return false;
    settingsInternalClickDepth += 1;
    try {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        try { element.dispatchEvent(mouseEvent(type, point, detail)); } catch { return false; }
      }
      return true;
    } finally { settingsInternalClickDepth -= 1; }
  }

  function catchQuery(element, selector) {
    try { return element?.querySelector(selector) || null; } catch { return null; }
  }

  function classListOf(element) {
    return typeof element?.classList?.contains === "function" ? element.classList : null;
  }

  function isControlDisabled(element) {
    return Boolean(element?.disabled) || element?.getAttribute?.("aria-disabled") === "true";
  }

  function controlLabel(element) {
    return sanitize(element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || element?.textContent || "", 80);
  }

  function nativeCommandHints(element) {
    const allowed = ["toggleBold", "toggleItalic", "toggleUnderline", "toggleStrike", "setColor", "setTextAlign", "toggleBulletList", "toggleOrderedList", "insertTable", "setImage", "undo", "redo", "setSubscript", "setSuperscript"];
    const hints = [];
    try {
      const symbols = Object.getOwnPropertySymbols(element).filter((key) => String(key.description || "") === "_vei").slice(0, 2);
      for (const symbol of symbols) for (const invoker of Object.values(element[symbol] || {})) {
        const values = Array.isArray(invoker?.value) ? invoker.value : [invoker?.value];
        for (const value of values) if (typeof value === "function") {
          const source = Function.prototype.toString.call(value).slice(0, 5000);
          for (const command of allowed) if (new RegExp(`\\b${command}\\b`).test(source) && !hints.includes(command)) hints.push(command);
        }
      }
    } catch {}
    return hints;
  }

  function controlMatchesEditorCommand(control, command) {
    const label = controlLabel(control);
    if (label) return EDITOR_COMMAND_LABELS[command]?.includes(label) === true;
    const expected = { bold: "toggleBold", italic: "toggleItalic", underline: "toggleUnderline", strikethrough: "toggleStrike" }[command];
    if (!expected || !classListOf(control)?.contains("el-tiptap-editor__command-button")) return false;
    const hints = nativeCommandHints(control);
    return hints.length === 1 && hints[0] === expected;
  }

  // ———— 树：定位、nodePathKey、完整性 ————
  function findTreeRoot() {
    const roots = [...document.querySelectorAll(".el-tree,[role='tree']")].filter(visible);
    return roots.length === 1 ? roots[0] : null;
  }

  function isTreeNodeElement(element) {
    const classes = classListOf(element);
    if (!classes) return false;
    return classes.contains("el-tree-node") || element.getAttribute("role") === "treeitem";
  }

  function treeNodesOf(root) {
    return [...root.querySelectorAll(".el-tree-node,[role='treeitem']")].filter(visible);
  }

  function nodeContentOf(element) {
    return catchQuery(element, ":scope > .el-tree-node__content")
      || catchQuery(element, ":scope > [role='treeitem']")
      || element;
  }

  function nodeLabelOf(element) {
    const content = nodeContentOf(element);
    const labelElement = content.querySelector(".el-tree-node__label,[data-node-label],[data-label]") || content || element;
    return text(labelElement);
  }

  function isNodeExpanded(element) {
    return element.getAttribute("aria-expanded") === "true" || Boolean(classListOf(element)?.contains("is-expanded"));
  }

  function isNodeSelected(element) {
    return element.getAttribute("aria-selected") === "true" || Boolean(classListOf(element)?.contains("is-current"));
  }

  function hasChildContainer(element) {
    return Boolean(catchQuery(element, ".el-tree-node__children"));
  }

  function loadingNodeOf(elements) {
    return elements.find((element) => Boolean(catchQuery(element, ".el-tree-node__expand-icon.is-loading"))) || null;
  }

  function siblingIndexAmongTreeNodes(element) {
    const parent = element?.parentElement;
    if (!parent || !parent.children) return -1;
    const nodes = [...parent.children].filter(isTreeNodeElement);
    return nodes.indexOf(element);
  }

  function treeAncestorsOf(element, root) {
    const chain = [];
    let current = element;
    let guard = 0;
    while (current && guard++ < 64) {
      chain.unshift(current);
      if (current === root) break;
      const parent = typeof current.parentElement?.closest === "function"
        ? current.parentElement.closest(".el-tree-node,[role='treeitem']")
        : null;
      if (!parent || (typeof root?.contains === "function" && !root.contains(parent))) break;
      current = parent;
    }
    return chain;
  }

  function nodePathKeyOf(element, root) {
    const parts = [];
    for (const node of treeAncestorsOf(element, root)) {
      const index = siblingIndexAmongTreeNodes(node);
      if (index < 0) return "";
      parts.push(String(index));
    }
    return parts.length ? parts.join("/") : "";
  }

  function parseNodePathKey(value) {
    if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(value)) return null;
    return value.split("/").map((part) => Number(part));
  }

  function walkByIndexes(root, indexes) {
    let container = root;
    let element = null;
    for (const index of indexes) {
      const candidates = [...(container?.children || [])].filter(isTreeNodeElement);
      element = candidates[index] || null;
      if (!element) return null;
      container = catchQuery(element, ".el-tree-node__children");
    }
    return element;
  }

  // nodePathKey + label 双重匹配；任一不符按节点已变化处理
  function resolveNodeRef(root, nodeRef) {
    if (!root) return { error: "REPORT_TREE_NOT_FOUND" };
    const indexes = parseNodePathKey(nodeRef?.nodePathKey);
    if (!indexes || typeof nodeRef?.label !== "string" || !nodeRef.label) return { error: "REPORT_NODE_REF_INVALID" };
    const element = walkByIndexes(root, indexes);
    if (!element || !visible(element) || nodeLabelOf(element) !== nodeRef.label) return { error: "REPORT_NODE_CHANGED" };
    const nodes = treeNodesOf(root);
    const actualId = candidateId(element);
    if (nodeRef.candidateId) {
      if (!actualId || actualId !== nodeRef.candidateId || nodes.filter((node) => candidateId(node) === actualId).length !== 1) return { error: "REPORT_NODE_CHANGED" };
    } else if (nodes.filter((node) => nodeLabelOf(node) === nodeRef.label).length !== 1) {
      return { error: "REPORT_NODE_AMBIGUOUS" };
    }
    return { element, nodePathKey: nodeRef.nodePathKey, label: nodeRef.label, candidateId: candidateId(element) };
  }

  function completenessOf(elements, hasMore) {
    if (hasMore) return { complete: false, reason: "REPORT_TREE_PAGE_PARTIAL", completeBasis: "paged" };
    if (loadingNodeOf(elements)) return { complete: false, reason: "REPORT_TREE_LAZY_LOADING", completeBasis: "lazy-loading" };
    let collapsed = false;
    for (const element of elements) {
      const icon = catchQuery(element, ".el-tree-node__expand-icon");
      if (!icon) continue;
      const classes = classListOf(icon);
      const isLeaf = classes ? classes.contains("is-leaf") : false;
      if (isLeaf || isNodeExpanded(element)) continue;
      // 带展开箭头但无子容器：懒加载尚未挂出子节点
      if (!hasChildContainer(element)) return { complete: false, reason: "REPORT_TREE_LAZY_LOADING", completeBasis: "lazy-unloaded" };
      collapsed = true;
    }
    if (collapsed) return { complete: false, reason: "REPORT_TREE_HAS_COLLAPSED_NODES", completeBasis: "collapsed-nodes" };
    return { complete: false, reason: "REPORT_TREE_COMPLETENESS_UNVERIFIED", completeBasis: "visible-tree-only" };
  }

  function inspectTree(options = {}) {
    const root = findTreeRoot();
    if (!root) {
      const roots = [...document.querySelectorAll(".el-tree,[role='tree']")].filter(visible);
      return { available: false, complete: false, reason: roots.length ? "REPORT_TREE_AMBIGUOUS" : "REPORT_TREE_NOT_FOUND", nodes: [] };
    }
    const elements = treeNodesOf(root);
    const offset = Number.isInteger(options.offset) ? Math.max(0, Math.min(options.offset, 5000)) : 0;
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(options.limit, 100)) : 50;
    const page = elements.slice(offset, offset + limit);
    const hasMore = offset + page.length < elements.length;
    const completeness = completenessOf(elements, offset > 0 || hasMore);
    const entries = page.map((element) => {
      const content = nodeContentOf(element);
      const labelElement = content.querySelector(".el-tree-node__label,[data-node-label],[data-label]") || content || element;
      return {
        nodePathKey: nodePathKeyOf(element, root),
        candidateId: candidateId(element),
        parentCandidateId: candidateOfParent(element, root),
        label: text(labelElement),
        selected: isNodeSelected(element),
        expanded: isNodeExpanded(element),
      };
    });
    const ids = new Set();
    const duplicates = new Set();
    for (const entry of entries) {
      if (!entry.candidateId) continue;
      if (ids.has(entry.candidateId)) duplicates.add(entry.candidateId);
      ids.add(entry.candidateId);
    }
    const structureDiagnostics = page.filter((element, index) => !entries[index].label).slice(0, 5).map(structureOf);
    return {
      available: true,
      complete: completeness.complete,
      ...(completeness.reason ? { reason: completeness.reason } : {}),
      completeBasis: completeness.completeBasis,
      identityVerified: false,
      offset,
      limit,
      totalVisibleCandidates: elements.length,
      hasMore,
      duplicateCandidateIds: [...duplicates],
      structureDiagnostics,
      searchDiagnostics: inspectSearchControl(),
      nodes: entries,
    };
  }

  function candidateOfParent(element, root) {
    const parent = typeof element.parentElement?.closest === "function"
      ? element.parentElement.closest(".el-tree-node,[role='treeitem']")
      : null;
    return parent && root.contains(parent) ? candidateId(parent) : null;
  }

  // ———— 属性对话框（白名单字段） ————
  function findSettingsDialog() {
    const dialogs = [...document.querySelectorAll(".el-dialog")].filter(visible);
    const matching = dialogs.filter((item) => text(item.querySelector(".el-dialog__title,[role='heading']"), 80) === "模块属性设置");
    return matching.length === 1 ? matching[0] : null;
  }

  function settingsDialogMatches(dialog, element, root) {
    if (settingsTarget?.dialog === dialog && !visible(dialog)) clearSettingsTarget();
    const nodeId = candidateId(element);
    const dialogNodeId = String(dialog?.getAttribute?.("data-node-key") || "");
    if (!nodeId || !root || treeNodesOf(root).filter((node) => candidateId(node) === nodeId).length !== 1) return false;
    if (dialogNodeId) return dialogNodeId === nodeId;
    return settingsTarget?.dialog === dialog && settingsTarget.candidateId === nodeId
      && settingsTarget.nodePathKey === nodePathKeyOf(element, root);
  }

  function readSettingsFields(dialog) {
    const fields = [];
    for (const row of dialog.querySelectorAll(".el-form-item,[role='group']")) {
      const label = text(row.querySelector(".el-form-item__label,label,legend"), 40).replace(/[：:]$/, "").trim();
      if (!SETTING_LABELS.has(label)) continue;
      const choices = [...row.querySelectorAll("input[type='radio']:checked,input[type='checkbox']:checked")]
        .map((item) => text(item.closest("label"), 40)).filter(Boolean);
      const select = row.querySelector("select");
      const selected = select ? [...select.selectedOptions].map((item) => text(item, 40)).filter(Boolean) : [];
      fields.push({ label, selected: [...choices, ...selected], valueAvailable: Boolean(choices.length || selected.length) });
    }
    return fields;
  }

  function inspectSettings() {
    const dialog = findSettingsDialog();
    if (!dialog) return { available: false, reason: "REPORT_SETTINGS_NOT_OPEN", fields: [] };
    return { available: true, fields: readSettingsFields(dialog), associatedNodeId: null, identityVerified: false, complete: false, reason: "REPORT_SETTINGS_VALUES_PARTIAL" };
  }

  function findSettingsRow(dialog, label) {
    for (const row of dialog.querySelectorAll(".el-form-item,[role='group']")) {
      const rowLabel = text(row.querySelector(".el-form-item__label,label,legend"), 40).replace(/[：:]$/, "").trim();
      if (rowLabel === label) return row;
    }
    return null;
  }

  // ———— 编辑器：框架识别与节点关联 ————
  function visibleEditors() {
    return [...document.querySelectorAll("[contenteditable='true'],.ProseMirror")].filter(visible);
  }

  function activeEditor(editors) {
    const focused = document.activeElement;
    const matches = focused ? editors.filter((editor) => editor === focused || safeContains(editor, focused)) : [];
    if (matches.length === 1) return matches[0];
    const editable = editors.filter((editor) => editor.getAttribute?.("contenteditable") === "true");
    if (editable.length === 1) return editable[0];
    return editors.length === 1 ? editors[0] : null;
  }

  function toolbarElements() {
    return [...document.querySelectorAll("[role='toolbar'],.editor-toolbar,.tiptap-toolbar,.ql-toolbar,.el-tiptap-editor__menu-bar")].filter(visible);
  }

  function findProseMirrorView(root) {
    const queue = [];
    const seen = new Set();
    const keys = ["editorView", "__editorView", "_editorView", "view", "editor", "__tiptapEditor", "__vue__", "__vueParentComponent", "proxy", "setupState", "ctx", "instance", "stateNode", "memoizedProps", "pendingProps", "return"];
    const add = (value, depth) => {
      if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value) || depth > 4 || seen.size >= 200) return;
      seen.add(value);
      queue.push({ value, depth });
    };
    const read = (value, key) => {
      try { return value?.[key]; } catch { return null; }
    };
    let element = root;
    for (let depth = 0; element && depth < 8; depth += 1, element = element.parentElement) {
      for (const key of keys.slice(0, 8)) add(read(element, key), 0);
      let properties = [];
      try { properties = Object.getOwnPropertyNames(element); } catch { properties = []; }
      for (const key of properties) {
        if (/^(?:__reactFiber|__reactInternalInstance|__vue|__tiptapEditor)/.test(key)) add(read(element, key), 0);
      }
    }
    while (queue.length) {
      const item = queue.shift();
      const view = item.value;
      const dom = read(view, "dom");
      const state = read(view, "state");
      if (typeof read(view, "dispatch") === "function" && dom && state
        && read(state, "schema") && read(state, "tr")
        && (dom === root || safeContains(root, dom) || safeContains(dom, root))) return view;
      if (item.depth < 4) for (const key of keys) add(read(view, key), item.depth + 1);
    }
    return null;
  }

  function editorFrameworkOf(element) {
    if (!element) return { framework: "unknown", modelAvailable: false, model: null };
    const classes = classListOf(element);
    if (classes?.contains("ql-editor")) {
      const model = typeof window.Quill?.find === "function" ? window.Quill.find(element) : null;
      const usable = Boolean(model && typeof model.getText === "function" && typeof model.setText === "function");
      return { framework: "quill", modelAvailable: usable, model: usable ? model : null };
    }
    if (element.ckeditorInstance && typeof element.ckeditorInstance.getData === "function" && typeof element.ckeditorInstance.setData === "function") {
      return { framework: "ckeditor", modelAvailable: true, model: element.ckeditorInstance };
    }
    if (classes?.contains("ProseMirror")) {
      const model = findProseMirrorView(element);
      return { framework: element.getAttribute("data-tiptap-editor") === "true" ? "tiptap" : "prosemirror", modelAvailable: Boolean(model), model };
    }
    if (element.getAttribute && element.getAttribute("contenteditable") === "true") {
      return { framework: "contenteditable", modelAvailable: false, model: null };
    }
    return { framework: "unknown", modelAvailable: false, model: null };
  }

  function modelSchemaSummary(model) {
    const schema = model?.state?.schema;
    if (!schema || typeof schema !== "object") return { available: false, nodeNames: [], markNames: [] };
    const schemaEntries = (collection) => {
      try {
        const names = Object.keys(collection || {})
          .filter((name) => /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name) && !/(?:cookie|authorization|token|password|secret)/i.test(name))
          .sort()
          .slice(0, 80);
        return {
          names,
          attributes: Object.fromEntries(names.slice(0, 40).map((name) => [
            name,
            Object.keys(collection[name]?.spec?.attrs || {})
              .filter((key) => /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(key) && !/(?:cookie|authorization|token|password|secret)/i.test(key))
              .sort()
              .slice(0, 20),
          ])),
        };
      } catch { return { names: [], attributes: {} }; }
    };
    const nodes = schemaEntries(schema.nodes);
    const marks = schemaEntries(schema.marks);
    return { available: true, nodeNames: nodes.names, nodeAttributes: nodes.attributes, markNames: marks.names, markAttributes: marks.attributes };
  }

  function safeContains(scope, element) {
    try { return Boolean(scope?.contains?.(element)); } catch { return false; }
  }

  function locateEditorForNode(nodeElement) {
    const editors = visibleEditors();
    const inside = editors.filter((element) => safeContains(nodeElement, element));
    if (inside.length === 1) return { ok: true, element: inside[0], association: "containment" };
    if (inside.length > 1) return { ok: false, reason: "REPORT_EDITOR_AMBIGUOUS", candidates: inside.length };
    const nodeId = candidateId(nodeElement);
    if (nodeId) {
      const associated = editors.filter((editor) => {
        try { return editor.closest?.("[data-node-key]")?.getAttribute("data-node-key") === nodeId; } catch { return false; }
      });
      if (associated.length === 1) return { ok: true, element: associated[0], association: "node-id" };
      if (associated.length > 1) return { ok: false, reason: "REPORT_EDITOR_AMBIGUOUS", candidates: associated.length };
      const root = findTreeRoot();
      const counts = new Map();
      if (root) for (const node of treeNodesOf(root)) {
        const id = candidateId(node);
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      if (counts.get(nodeId) === 1) {
        const matching = [];
        for (const editor of editors) {
          const ids = new Set();
          let ancestor = editor;
          for (let depth = 0; depth < 16 && ancestor && ancestor !== document.body; depth += 1, ancestor = ancestor.parentElement) {
            const value = String(ancestor.getAttribute?.("id") || "");
            if (!/^[A-Za-z0-9:_-]{1,200}$/.test(value) || /(?:cookie|authorization|token|password|验证码)/i.test(value)) continue;
            for (const token of value.split(/[:_-]+/)) if (counts.get(token) === 1) ids.add(token);
          }
          if (ids.has(nodeId)) matching.push({ editor, ids });
        }
        if (matching.length > 1 || matching.some((entry) => entry.ids.size !== 1)) return { ok: false, reason: "REPORT_EDITOR_AMBIGUOUS", candidates: matching.length };
        if (matching.length === 1) {
          const label = nodeLabelOf(nodeElement);
          const content = String(matching[0].editor.textContent || "").replace(/\s+/g, " ").trim();
          const newNodeIdentity = Boolean(catchQuery(nodeContentOf(nodeElement), ".name.new-add"))
            && matching[0].editor.closest?.("[id]")?.getAttribute("id") === `content_${nodeId}`;
          if (!label || label === "[已隐藏]" || (!content.includes(label) && !newNodeIdentity)) return { ok: false, reason: "REPORT_EDITOR_IDENTITY_UNVERIFIED" };
          return { ok: true, element: matching[0].editor, association: "node-id-token" };
        }
      }
    }
    // 页面级（如主编辑面板）扫描：多个可见编辑器一律按歧义拒绝；
    // 唯一可见编辑器只归属当前选中节点，避免把其他节点的正文误认为目标节点内容
    let scope = nodeElement.parentElement;
    for (let level = 0; level < 16 && scope && scope !== document.body; level += 1) {
      const near = editors.filter((element) => safeContains(scope, element));
      if (near.length > 1) return { ok: false, reason: "REPORT_EDITOR_AMBIGUOUS", candidates: near.length };
      if (near.length === 1) {
        if (isNodeSelected(nodeElement)) return { ok: true, element: near[0], association: "selected-panel" };
        return { ok: false, reason: "REPORT_EDITOR_NOT_FOUND" };
      }
      scope = scope.parentElement;
    }
    return { ok: false, reason: "REPORT_EDITOR_NOT_FOUND" };
  }

  function readNodeContent(nodeElement) {
    const association = locateEditorForNode(nodeElement);
    const label = nodeLabelOf(nodeElement);
    if (!association.ok) {
      return { editorAvailable: false, reason: association.reason, contentHash: hashText(label), textPreview: sanitize(label, 300) };
    }
    const raw = String(association.element.textContent ?? "");
    return {
      editorAvailable: true,
      contentHash: hashText(`${label}\n${raw}`),
      textPreview: text(association.element, 300),
    };
  }

  function editorSelectionSnapshot(editor, view, requireFocus = true) {
    try {
      const selection = window.getSelection?.();
      const modelSelection = view?.state?.selection;
      if (!selection || selection.rangeCount !== 1 || !modelSelection || !Number.isInteger(modelSelection.from) || !Number.isInteger(modelSelection.to) || modelSelection.from >= modelSelection.to) return null;
      const range = selection.getRangeAt(0);
      if (!safeContains(editor, range.startContainer) || !safeContains(editor, range.endContainer)) return null;
      if (requireFocus && !(document.activeElement === editor || safeContains(editor, document.activeElement))) return null;
      const text = String(selection.toString());
      if (!text || typeof view.state.doc?.textBetween !== "function" || view.state.doc.textBetween(modelSelection.from, modelSelection.to, "\n") !== text) return null;
      return { startContainer: range.startContainer, startOffset: range.startOffset, endContainer: range.endContainer, endOffset: range.endOffset, from: modelSelection.from, to: modelSelection.to, text };
    } catch { return null; }
  }

  function sameEditorSelection(left, right) {
    return Boolean(left && right && left.startContainer === right.startContainer && left.startOffset === right.startOffset
      && left.endContainer === right.endContainer && left.endOffset === right.endOffset
      && left.from === right.from && left.to === right.to && left.text === right.text);
  }

  function explicitTextSelection(view, target) {
    if (typeof target !== "string" || !target || target.length > 20000 || !view?.state?.doc || typeof view.state.doc.descendants !== "function") return null;
    const matches = [];
    try {
      const doc = view.state.doc;
      doc.descendants((node, position, parent) => {
        if (!node.isTextblock) return true;
        const value = String(node.textContent || "");
        let index = value.indexOf(target);
        while (index >= 0) {
          matches.push({ node, parent, from: position + 1 + index, to: position + 1 + index + target.length, text: target });
          index = value.indexOf(target, index + 1);
        }
        return false;
      });
      if (matches.length !== 1) return null;
      const match = matches[0];
      if (match.parent !== doc || match.node.content?.size !== match.node.textContent.length) return null;
      for (let index = 0; index < match.node.childCount; index += 1) if (!match.node.child(index).isText) return null;
      if (doc.textBetween(match.from, match.to, "\n") !== target) return null;
      const original = view.state.selection;
      if (!Number.isInteger(original?.from) || !Number.isInteger(original?.to)) return null;
      return { explicit: true, from: match.from, to: match.to, text: target, initialFrom: original.from, initialTo: original.to };
    } catch { return null; }
  }

  function selectedParagraph(view) {
    try {
      const selection = view.state.selection;
      const paragraph = selection.$from.parent;
      if (!paragraph?.isTextblock || paragraph !== selection.$to.parent || selection.$from.depth !== 1 || selection.$to.depth !== 1) return null;
      for (let index = 0; index < paragraph.childCount; index += 1) if (!paragraph.child(index).isText) return null;
      return { text: String(paragraph.textContent ?? "") };
    } catch { return null; }
  }

  function pageContentHash() {
    const parts = [];
    const root = findTreeRoot();
    if (root) {
      for (const element of treeNodesOf(root)) {
        parts.push([nodePathKeyOf(element, root), nodeLabelOf(element), candidateId(element) || "", isNodeExpanded(element) ? "1" : "0", isNodeSelected(element) ? "1" : "0"].join("|"));
      }
    }
    for (const element of visibleEditors()) {
      parts.push(`editor|${hashText(String(element.textContent ?? ""))}`);
    }
    return hashText(parts.join("\n"));
  }

  function pageContentSnapshot() {
    const root = findTreeRoot();
    const nodes = root ? treeNodesOf(root).map((element) => [nodePathKeyOf(element, root), nodeLabelOf(element), candidateId(element), isNodeExpanded(element), isNodeSelected(element)]) : null;
    const editors = visibleEditors().map((element) => String(element.textContent ?? ""));
    const dialog = findSettingsDialog();
    const settings = dialog ? readSettingsFields(dialog) : null;
    return JSON.stringify({ nodes, editors, settings });
  }

  function insertTextViaCommand(element, value, atEnd) {
    if (typeof element?.focus !== "function" || typeof document.execCommand !== "function") return false;
    if (["INPUT", "TEXTAREA"].includes(element.tagName)) {
      if (typeof element.select !== "function") return false;
      try {
        element.focus();
        if (atEnd) {
          if (typeof element.setSelectionRange !== "function") return false;
          const end = String(element.value || "").length;
          element.setSelectionRange(end, end);
        } else element.select();
        const expected = atEnd ? String(element.value || "") + String(value) : String(value);
        if (!expected && !element.value) return true;
        if (document.execCommand(value === "" ? "delete" : "insertText", false, String(value)) === false) return false;
        return String(element.value || "") === expected;
      } catch { return false; }
    }
    if (typeof document.createRange !== "function") return false;
    const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
    if (!selection || typeof selection.removeAllRanges !== "function" || typeof selection.addRange !== "function") return false;
    try {
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      if (atEnd && typeof range.collapse === "function") range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      return document.execCommand("insertText", false, String(value)) !== false;
    } catch {
      return false;
    }
  }

  // ———— 动作门禁 ————
  function reject(reason) {
    return { ok: false, reason, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
  }

  function targetGuard(payload) {
    const report = identity();
    if (!report) return reject("REPORT_TARGET_MISMATCH");
    const expected = payload?.reportIdentity || {};
    if (["projectId", "companyId", "reportType", "mode"].some((key) => !expected[key] || String(expected[key]) !== report[key])) {
      return reject("REPORT_TARGET_MISMATCH");
    }
    // detailId 为报告明细身份：调用方提供时必须与页面一致（不提供则不强制，向后兼容）
    if (expected.reportDetailId !== undefined && String(expected.reportDetailId) !== String(report.reportDetailId || "")) {
      return reject("REPORT_TARGET_MISMATCH");
    }
    return null;
  }

  // ———— navigate ————
  async function expandNode(element, timeoutMs) {
    const icon = catchQuery(element, ".el-tree-node__expand-icon");
    if (!icon) return { ok: false, error: "REPORT_EXPAND_CONTROL_NOT_FOUND" };
    const classes = classListOf(icon);
    if (classes?.contains("is-leaf")) return { ok: false, error: "REPORT_EXPAND_LEAF_NODE" };
    if (isNodeExpanded(element)) return { ok: true };
    if (!dispatchRealClick(icon)) return { ok: false, error: "REPORT_EXPAND_FAILED" };
    if (!(await waitFor(() => isNodeExpanded(element), timeoutMs))) return { ok: false, error: "REPORT_EXPAND_TIMEOUT" };
    return { ok: true };
  }

  async function selectNode(element, timeoutMs) {
    if (isNodeSelected(element)) return { ok: true };
    const content = nodeContentOf(element);
    if (!content || typeof content.dispatchEvent !== "function") return { ok: false, error: "REPORT_SELECT_FAILED" };
    if (!dispatchRealClick(content)) return { ok: false, error: "REPORT_SELECT_FAILED" };
    if (!(await waitFor(() => isNodeSelected(element), timeoutMs))) return { ok: false, error: "REPORT_SELECT_TIMEOUT" };
    return { ok: true };
  }

  // ———— 树面板顶栏控件（全部展开/全部折叠/关键词查询） ————
  function findTopLevelControl(pattern) {
    for (const control of [...document.querySelectorAll("button,[role='button']")]) {
      if (!visible(control) || isControlDisabled(control)) continue;
      if (pattern.test(controlLabel(control))) return control;
    }
    return null;
  }

  function treeEditModeControls() {
    const labels = new Set(["编辑", "完成编辑", "退出编辑", "取消编辑"]);
    return [...document.querySelectorAll("button,[role='button']")].filter((control) => visible(control) && labels.has(controlLabel(control)));
  }

  function treeStructureControlsActive(root) {
    const nodes = treeNodesOf(root);
    const sample = nodes.find((element) => !classListOf(catchQuery(element, ".el-tree-node__expand-icon"))?.contains("is-leaf")) || nodes[0];
    return Boolean(sample && inlineIconOf(sample, "add-sibling")?.element && inlineIconOf(sample, "add-child")?.element && inlineIconOf(sample, "delete")?.element);
  }

  function semanticTreeActionCount(root) {
    const labels = new Set(["新建子节点", "复制节点", "删除节点", "节点设置", "设置"]);
    return [...root.querySelectorAll("button,[role='button'],[aria-label],[title]")]
      .filter((control) => visible(control) && labels.has(control.getAttribute("aria-label") || control.getAttribute("title") || controlLabel(control))).length;
  }

  let treeEditModeVerified = false;

  async function enterTreeEditMode(root, timeoutMs) {
    const controls = treeEditModeControls();
    const active = controls.filter((control) => ["完成编辑", "退出编辑", "取消编辑"].includes(controlLabel(control)));
    if (active.length === 1) { treeEditModeVerified = true; return { ok: true, alreadyActive: true }; }
    if (treeEditModeVerified && treeStructureControlsActive(root)) return { ok: true, alreadyActive: true };
    const edit = controls.filter((control) => controlLabel(control) === "编辑");
    if (edit.length !== 1 || controls.length !== 1) {
      if (!controls.length && treeStructureControlsActive(root)) { treeEditModeVerified = true; return { ok: true, alreadyActive: true }; }
      return { ok: false, error: edit.length || controls.length ? "REPORT_TREE_EDIT_CONTROL_AMBIGUOUS" : "REPORT_TREE_EDIT_CONTROL_NOT_FOUND" };
    }
    const beforeTree = visibleTreeSignature();
    const beforeActionCount = semanticTreeActionCount(root);
    if (!dispatchRealClick(edit[0])) return { ok: false, error: "REPORT_CONTROL_CLICK_FAILED" };
    const changed = await waitFor(() => {
      const afterControls = treeEditModeControls();
      return afterControls.some((control) => ["完成编辑", "退出编辑", "取消编辑"].includes(controlLabel(control)))
        || semanticTreeActionCount(findTreeRoot() || root) > beforeActionCount
        || treeStructureControlsActive(findTreeRoot() || root);
    }, timeoutMs, 50);
    if (visibleTreeSignature() !== beforeTree) return { ok: false, error: "REPORT_TREE_CHANGED" };
    if (!changed) return { ok: false, error: "REPORT_TREE_EDIT_MODE_UNVERIFIED", uiStateChanged: true };
    treeEditModeVerified = true;
    return { ok: true, alreadyActive: false };
  }

  function findSearchInput() {
    for (const input of [...document.querySelectorAll("input")]) {
      if (!visible(input) || (input.getAttribute("type") && input.getAttribute("type") !== "text")) continue;
      const hint = `${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`;
      if (/节点关键词|关键词查询|搜索节点|search/i.test(hint)) return input;
    }
    return null;
  }

  function inspectSearchControl() {
    const input = findSearchInput();
    if (!input) return { available: false };
    const allowed = new Set(["input", "change", "blur", "search", "keydown", "keyup", "click"]);
    const components = [];
    const elements = [];
    let element = input;
    for (let depth = 0; element && depth < 6; depth += 1, element = element.parentElement) {
      try {
        const nativeEvents = [...allowed].filter((name) => typeof element[`on${name}`] === "function");
        const veiHandlers = [element._vei];
        for (const symbol of Object.getOwnPropertySymbols(element)) {
          if (String(symbol) === "Symbol(_vei)") veiHandlers.push(element[symbol]);
        }
        const vueEvents = [];
        for (const handlers of veiHandlers) {
          for (const name of Object.keys(handlers || {})) {
            const eventName = name.replace(/^on/, "").toLowerCase();
            if (allowed.has(eventName) && !vueEvents.includes(eventName)) vueEvents.push(eventName);
          }
        }
        const reactKey = Object.keys(element).find((key) => key.startsWith("__reactProps$"));
        const reactEvents = reactKey ? Object.keys(element[reactKey] || {}).map((name) => name.replace(/^on/, "").toLowerCase()).filter((name) => allowed.has(name)) : [];
        elements.push({ depth, tag: ["INPUT", "DIV", "SPAN", "BUTTON", "LABEL"].includes(element.tagName) ? element.tagName : "OTHER", nativeEvents, vueEvents, reactEvents, vue3: Boolean(element.__vueParentComponent) });
        const component = element.__vue__;
        if (!component) continue;
        const listeners = component.$listeners || component.$options?._parentListeners || {};
        const events = Object.keys(listeners).filter((name) => allowed.has(name)).sort();
        components.push({ depth, events });
      } catch {
        components.push({ depth, unavailable: true });
      }
    }
    return { available: true, components, elements, evidenceOnly: true };
  }

  function dispatchInputEvent(element) {
    if (!element || typeof element.dispatchEvent !== "function") return false;
    if (typeof Event === "function") {
      try { return element.dispatchEvent(new Event("input", { bubbles: true, cancelable: false })) !== false; } catch { /* 环境不可用时退回普通事件对象 */ }
    }
    try { return element.dispatchEvent({ type: "input", bubbles: true, cancelable: false }); } catch { return false; }
  }

  function dispatchSearchEnter(element) {
    if (typeof KeyboardEvent !== "function" || typeof element?.dispatchEvent !== "function") return false;
    try {
      for (const type of ["keydown", "keyup"]) {
        element.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, charCode: 0, bubbles: true, cancelable: true }));
      }
      return true;
    } catch { return false; }
  }

  function dispatchSearchCommit(element) {
    if (!element || typeof element.dispatchEvent !== "function") return false;
    try {
      const changeEvent = typeof Event === "function" ? new Event("change", { bubbles: true, cancelable: false }) : { type: "change", bubbles: true, cancelable: false };
      if (element.dispatchEvent(changeEvent) === false) return false;
      if (typeof element.blur === "function") {
        element.blur();
        return true;
      }
      const blurEvent = typeof FocusEvent === "function"
        ? new FocusEvent("blur", { bubbles: false, cancelable: false })
        : typeof Event === "function" ? new Event("blur", { bubbles: false, cancelable: false }) : { type: "blur", bubbles: false, cancelable: false };
      return element.dispatchEvent(blurEvent) !== false;
    } catch { return false; }
  }

  function visibleTreeSignature() {
    const root = findTreeRoot();
    if (!root) return "";
    return treeNodesOf(root).map((element) => `${nodePathKeyOf(element, root)}|${nodeLabelOf(element)}|${isNodeExpanded(element) ? "1" : "0"}`).join("\n");
  }

  function treeExpansionSettled(wantExpanded) {
    const root = findTreeRoot();
    if (!root) return false;
    const nodes = treeNodesOf(root);
    if (!nodes.length) return false;
    for (const element of nodes) {
      const icon = catchQuery(element, ".el-tree-node__expand-icon");
      if (!icon) continue;
      if (classListOf(icon)?.contains("is-leaf")) continue;
      if (isNodeExpanded(element) !== wantExpanded) return false;
    }
    return true;
  }

  async function navigate(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const op = payload.op;
    const timeoutMs = clampTimeout(payload.timeoutMs);
    if (op === "expand_all" || op === "collapse_all") {
      const wantExpanded = op === "expand_all";
      const button = findTopLevelControl(wantExpanded ? /^全部展开$/ : /^全部折叠$/);
      if (!button) return reject("REPORT_NAVIGATE_CONTROL_NOT_FOUND");
      // 真实点击顶栏按钮，等待树进入目标展开状态
      if (!dispatchRealClick(button)) return reject("REPORT_CONTROL_CLICK_FAILED");
      if (!(await waitFor(() => treeExpansionSettled(wantExpanded), timeoutMs, 60))) {
        return reject(wantExpanded ? "REPORT_EXPAND_TIMEOUT" : "REPORT_COLLAPSE_TIMEOUT");
      }
      return {
        ok: true, action: "report_navigate", op,
        [wantExpanded ? "expandedAll" : "collapsedAll"]: true, uiStateChanged: true,
        security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false },
      };
    }
    if (op === "enter_edit_mode") {
      const entered = await enterTreeEditMode(root, timeoutMs);
      if (!entered.ok) return { ...reject(entered.error), uiStateChanged: entered.uiStateChanged === true };
      return {
        ok: true, action: "report_navigate", op, treeEditMode: "active", alreadyActive: entered.alreadyActive,
        uiStateChanged: !entered.alreadyActive,
        security: { readOnly: true, writesPerformed: false, uiStateChanged: !entered.alreadyActive, credentialsReturned: false },
      };
    }
    if (op === "search" || op === "clear_search") {
      const keyword = op === "clear_search" ? "" : typeof payload.keyword === "string" ? payload.keyword.trim() : "";
      if (op === "search" && !keyword) return reject("REPORT_NAVIGATE_OP_INVALID");
      const input = findSearchInput();
      if (!input) return reject("REPORT_NAVIGATE_CONTROL_NOT_FOUND");
      const before = visibleTreeSignature();
      const hadKeyword = Boolean(String(input.value || "").trim());
      // 真实输入（execCommand insertText）+ 真实 input 事件，绝不直接改页面状态
      if (!insertTextViaCommand(input, keyword, false)) return reject("REPORT_SEARCH_INPUT_FAILED");
      if (!dispatchInputEvent(input) || !dispatchSearchCommit(input)) return reject("REPORT_SEARCH_INPUT_FAILED");
      // 等待过滤结果连续两轮稳定，再回读过滤后的树
      let previous = null;
      const settled = await waitFor(() => {
        if (!findTreeRoot()) return false;
        const signature = visibleTreeSignature();
        if (previous !== null && signature === previous) return true;
        previous = signature;
        return false;
      }, timeoutMs, 60);
      if (!settled) return reject("REPORT_SEARCH_TIMEOUT");
      if (op === "search" && previous === before) {
        if (!dispatchSearchEnter(input) || !(await waitFor(() => visibleTreeSignature() !== before, Math.min(timeoutMs, 1200), 60))) {
          return { ...reject("REPORT_SEARCH_UNVERIFIED"), uiStateChanged: true };
        }
      }
      let treeRestored = previous !== before;
      if (op === "clear_search" && hadKeyword && !treeRestored && dispatchSearchEnter(input)) {
        treeRestored = await waitFor(() => visibleTreeSignature() !== before, Math.min(timeoutMs, 1200), 60);
      }
      if (op === "clear_search" && hadKeyword && !treeRestored) {
        return { ...reject("REPORT_SEARCH_UNVERIFIED"), uiStateChanged: true, treeRestored: false };
      }
      const tree = inspectTree({ limit: 100 });
      return {
        ok: true, action: "report_navigate", op, keyword,
        ...(op === "clear_search" ? { treeRestored: hadKeyword ? treeRestored : null } : {}),
        tree: { available: tree.available, complete: tree.complete, totalVisibleCandidates: tree.totalVisibleCandidates, nodes: tree.nodes },
        uiStateChanged: true,
        security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false },
      };
    }
    if (!["expand", "select", "reveal"].includes(op)) return reject("REPORT_NAVIGATE_OP_INVALID");
    const indexes = parseNodePathKey(payload.nodeRef?.nodePathKey);
    if (!indexes || typeof payload.nodeRef?.label !== "string" || !payload.nodeRef.label) {
      return { ...reject("REPORT_NODE_REF_INVALID"), nodeRef: payload.nodeRef || null };
    }
    let element;
    let resolvedRef;
    if (op === "reveal") {
      // reveal：深层节点在祖先展开前不可见，先逐层展开祖先链，再解析目标
      const topElement = walkByIndexes(root, indexes.slice(0, 1));
      if (!topElement || !visible(topElement)) return { ...reject("REPORT_NODE_CHANGED"), nodeRef: { ...payload.nodeRef } };
      for (let depth = 1; depth < indexes.length; depth += 1) {
        const ancestor = walkByIndexes(root, indexes.slice(0, depth));
        if (!ancestor) return { ...reject("REPORT_NODE_CHANGED"), nodeRef: { ...payload.nodeRef } };
        const expanded = await expandNode(ancestor, timeoutMs);
        if (!expanded.ok) return { ...reject(expanded.error), nodeRef: { ...payload.nodeRef }, op };
      }
      element = walkByIndexes(root, indexes);
    } else {
      element = walkByIndexes(root, indexes);
    }
    if (!element || !visible(element) || nodeLabelOf(element) !== payload.nodeRef.label) {
      return { ...reject("REPORT_NODE_CHANGED"), nodeRef: { ...payload.nodeRef } };
    }
    const verifiedNode = resolveNodeRef(root, payload.nodeRef);
    if (verifiedNode.error) return { ...reject(verifiedNode.error), nodeRef: { ...payload.nodeRef } };
    resolvedRef = { nodePathKey: payload.nodeRef.nodePathKey, label: payload.nodeRef.label, candidateId: candidateId(element) };
    if (op === "expand") {
      const expanded = await expandNode(element, timeoutMs);
      if (!expanded.ok) return { ...reject(expanded.error), nodeRef: resolvedRef, op };
      return {
        ok: true, action: "report_navigate", op, nodeRef: resolvedRef,
        expanded: isNodeExpanded(element), selected: isNodeSelected(element), uiStateChanged: true,
        security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false },
      };
    }
    const selected = await selectNode(element, timeoutMs);
    if (!selected.ok) return { ...reject(selected.error), nodeRef: resolvedRef, op };
    return {
      ok: true, action: "report_navigate", op, nodeRef: resolvedRef,
      expanded: isNodeExpanded(element), selected: isNodeSelected(element), uiStateChanged: true,
      security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false },
    };
  }

  // ———— node_read ————
  async function nodeRead(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const include = Array.isArray(payload.include) && payload.include.length ? payload.include : ["settings", "editor"];
    let scopeReadback = null;
    let scopeUiStateChanged = false;
    if (payload.structureScopeRead === true) {
      if (!treeExpansionSettled(true)) {
        const expanded = await navigate({ action: "report_navigate", op: "expand_all", reportIdentity: payload.reportIdentity, timeoutMs: payload.timeoutMs });
        if (!expanded.ok) return { ...reject(expanded.reason || "REPORT_TREE_SNAPSHOT_INCOMPLETE"), ...(expanded.uiStateChanged ? { uiStateChanged: true } : {}), security: { readOnly: true, writesPerformed: false, ...(expanded.uiStateChanged ? { uiStateChanged: true } : {}), credentialsReturned: false } };
        scopeUiStateChanged = expanded.uiStateChanged === true;
      }
      scopeReadback = treeSnapshotForScope(findTreeRoot(), payload.scopeRef, payload.operationIndex);
      if (!scopeReadback.complete) return { ...reject("REPORT_TREE_SNAPSHOT_INCOMPLETE"), ...(scopeUiStateChanged ? { uiStateChanged: true } : {}), security: { readOnly: true, writesPerformed: false, ...(scopeUiStateChanged ? { uiStateChanged: true } : {}), credentialsReturned: false } };
      if (payload.structurePartialRead !== true) return {
        ok: true, action: "report_node_read", structureReadback: scopeReadback, ...(scopeUiStateChanged ? { uiStateChanged: true } : {}),
        documentTimeOrigin: Number.isFinite(window.performance?.timeOrigin) ? window.performance.timeOrigin : null,
        security: { readOnly: true, writesPerformed: false, ...(scopeUiStateChanged ? { uiStateChanged: true } : {}), credentialsReturned: false },
      };
      if (!include.includes("editor") || payload.verifySaved !== true) return reject("REPORT_READBACK_UNVERIFIED");
    }
    const resolved = resolveNodeRef(root, payload.nodeRef);
    if (resolved.error) return { ...reject(resolved.error), nodeRef: payload.nodeRef || null };
    const node = {
      nodePathKey: resolved.nodePathKey,
      label: resolved.label,
      candidateId: resolved.candidateId,
      candidate: true,
      selected: isNodeSelected(resolved.element),
      expanded: isNodeExpanded(resolved.element),
    };
    const result = { ok: true, action: "report_node_read", node };
    if (include.includes("structure") && !scopeReadback) {
      result.structureDiagnostics = structureControlDiagnostics(resolved.element);
      result.structureReadback = treeSnapshotForOperation(root, resolved.element, node, "structure_add_child", 0);
      result.documentTimeOrigin = Number.isFinite(window.performance?.timeOrigin) ? window.performance.timeOrigin : null;
    }
    if (scopeReadback) {
      result.structureReadback = scopeReadback;
      result.documentTimeOrigin = Number.isFinite(window.performance?.timeOrigin) ? window.performance.timeOrigin : null;
    }
    if (scopeUiStateChanged) result.uiStateChanged = true;
    if (include.includes("settings")) {
      const dialog = findSettingsDialog();
      result.settings = !dialog
        ? { available: false, reason: "REPORT_SETTINGS_NOT_OPEN", fields: [] }
        : settingsDialogMatches(dialog, resolved.element, root)
          ? { available: true, fields: readSettingsFields(dialog) }
          : { available: false, reason: "REPORT_SETTINGS_TARGET_UNVERIFIED", fields: [] };
      if (payload.verifySaved === true) result.documentTimeOrigin = Number.isFinite(window.performance?.timeOrigin) && window.performance.timeOrigin > 0 ? window.performance.timeOrigin : null;
    }
    if (include.includes("editor")) {
      const association = locateEditorForNode(resolved.element);
      if (!association.ok) return { ...reject(association.reason), node };
      const framework = editorFrameworkOf(association.element);
      const raw = String(association.element.textContent ?? "");
      let modelHash = null;
      let modelSnapshot = null;
      try {
        if (framework.model?.state?.doc && typeof framework.model.state.doc.toJSON === "function" && window.crypto?.subtle && typeof TextEncoder === "function") {
          const documentSnapshot = framework.model.state.doc;
          modelSnapshot = documentSnapshot.toJSON();
          const bytes = new TextEncoder().encode(JSON.stringify(modelSnapshot));
          const digest = await window.crypto.subtle.digest("SHA-256", bytes);
          if (!framework.model.state.doc.eq(documentSnapshot)) return reject("REPORT_CONTENT_CHANGED");
          modelHash = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        }
      } catch { modelHash = null; modelSnapshot = null; }
      if (payload.structurePartialRead === true) {
        const latestScopeReadback = treeSnapshotForScope(findTreeRoot(), payload.scopeRef, payload.operationIndex);
        if (!latestScopeReadback.complete || structureScopeFingerprint(latestScopeReadback) !== structureScopeFingerprint(scopeReadback)) return reject("REPORT_PENDING_READBACK_MISMATCH");
        scopeReadback = latestScopeReadback;
      }
      node.contentHash = hashText(`${resolved.label}\n${raw}`);
      result.editor = {
        framework: framework.framework,
        modelAvailable: framework.modelAvailable,
        modelSchema: modelSchemaSummary(framework.model),
        modelHash,
        modelEditable: typeof framework.model?.editable === "boolean" ? framework.model.editable : null,
        domEditable: association.element.getAttribute?.("contenteditable") || null,
        association: association.association || null,
        saveControlAvailable: editorLinksOf(association.element).found.some((item) => item.link === "save"),
        nearbyControls: editorControlDiagnostics(association.element),
        toolbarDiagnostics: editorToolbarDiagnostics(association.element),
        activationDiagnostics: editorActivationDiagnostics(association.element),
        textPreview: text(association.element, 300),
        contentHash: node.contentHash,
      };
      if (payload.verifySaved === true) {
        if (!modelHash || !modelSnapshot || !Number.isFinite(window.performance?.timeOrigin) || window.performance.timeOrigin <= 0) return reject("REPORT_READBACK_UNVERIFIED");
        result.privateSavedVerification = { model: modelSnapshot, documentTimeOrigin: window.performance.timeOrigin };
      }
    }
    if (payload.structurePartialRead === true) {
      result.security = { readOnly: true, writesPerformed: false, ...(scopeUiStateChanged ? { uiStateChanged: true } : {}), credentialsReturned: false };
    }
    return result;
  }

  function structureControlDiagnostics(element) {
    const content = nodeContentOf(element);
    const controls = [];
    const rowDiagnostics = [];
    const knownLabels = new Set([...Object.values(INLINE_ICON_ARIA), "新增", "新增节点", "添加", "添加节点", "设置", "节点设置", "复制", "删除"]);
    try {
      for (const control of [...content.querySelectorAll("button,[role='button'],[aria-label],[title],svg,i")].slice(0, 80)) {
        const labels = [control.getAttribute?.("aria-label"), control.getAttribute?.("title")].filter((value) => knownLabels.has(value));
        const handler = hasClickHandler(control);
        const handlerHints = [];
        try {
          const callbacks = [control.onclick];
          for (const key of Object.getOwnPropertySymbols(control)) if (String(key.description || "") === "_vei") {
            for (const [name, invoker] of Object.entries(control[key] || {})) if (/^onClick/.test(name)) callbacks.push(invoker?.value || invoker);
          }
          const source = callbacks.filter((value) => typeof value === "function").map((value) => Function.prototype.toString.call(value)).join(" ");
          for (const name of ["addNode", "addChild", "createNode", "copyNode", "deleteNode", "removeNode", "editNode", "setNode", "openSettings"]) if (new RegExp(`\\b${name}\\b`).test(source)) handlerHints.push(name);
        } catch {}
        const parents = [];
        for (let parent = control.parentElement, depth = 0; parent && parent !== content && depth < 3; parent = parent.parentElement, depth += 1) {
          const hints = [parent.getAttribute?.("aria-label"), parent.getAttribute?.("title")].filter((value) => knownLabels.has(value));
          parents.push({ tag: String(parent.tagName || "").toLowerCase(), classes: safeClassNames(parent).filter((value) => !/(?:token|cookie|auth|secret|password)/i.test(value)), labels: hints });
        }
        controls.push({ tag: String(control.tagName || "").toLowerCase(), classes: safeClassNames(control).filter((value) => !/(?:token|cookie|auth|secret|password)/i.test(value)), ...controlSemanticHints(control, knownLabels), visible: visible(control), disabled: isControlDisabled(control), labels, clickHandlerPresent: handler, handlerHints, parents });
      }
      for (const row of [...content.querySelectorAll(".custom-tree-node")].filter(visible).slice(0, 3)) {
        const areas = [...row.querySelectorAll(":scope > .opt-area, .opt-area")].filter(visible);
        rowDiagnostics.push({
          rowCount: [...content.querySelectorAll(".custom-tree-node")].filter(visible).length,
          optAreaCount: areas.length,
          directControls: areas.length === 1 ? [...areas[0].children].slice(0, 8).map((control) => ({
            tag: String(control.tagName || "").toUpperCase(),
            classes: safeClassNames(control),
            visible: visible(control),
            disabled: isControlDisabled(control),
            clickHandlerPresent: hasClickHandler(control),
          })) : [],
        });
      }
    } catch { return { evidenceOnly: true, available: false, controls: [], rowDiagnostics: [] }; }
    return { evidenceOnly: true, available: true, controls, rowDiagnostics };
  }

  function hasClickHandler(control) {
    try {
      const callbacks = [control?.onclick];
      for (const key of Object.getOwnPropertySymbols(control || {})) if (String(key.description || "") === "_vei") {
        for (const [name, invoker] of Object.entries(control[key] || {})) if (/^onClick/.test(name)) callbacks.push(invoker?.value || invoker);
      }
      return callbacks.some((value) => typeof value === "function");
    } catch { return false; }
  }

  function treeRowClickTarget(control) {
    if (hasClickHandler(control)) return control;
    const nested = [...control.querySelectorAll("*")].filter(hasClickHandler);
    return nested.length === 1 ? nested[0] : null;
  }

  // ———— preview / execute ————
  const planRegistry = new Map();
  const consumedPlans = new Set();
  const activeChildAddTargets = new Set();
  const PLAN_LIMIT = 20;

  function truncate(text, max = 200) {
    return sanitize(text, max);
  }

  function linkFor(labels) {
    const numbered = labels.filter((label) => NUMBERED_TITLE_PATTERN.test(label));
    if (!numbered.length) return { renumberAffected: false, tocAffected: false, observedPattern: "none" };
    const observedPattern = numbered[0].match(NUMBERED_TITLE_PATTERN)[0];
    return { renumberAffected: true, tocAffected: true, observedPattern };
  }

  function siblingLabels(root, indexes) {
    // indexes 定位到父节点后需下钻其子容器（Element UI 的子节点挂在 .el-tree-node__children 内）
    const element = indexes.length ? walkByIndexes(root, indexes) : null;
    const container = element ? (catchQuery(element, ".el-tree-node__children") || element) : root;
    if (!container) return null;
    return [...(container.children || [])].filter(isTreeNodeElement).map(nodeLabelOf);
  }

  function childrenLabels(root, indexes) {
    const element = walkByIndexes(root, indexes);
    const container = element ? catchQuery(element, ".el-tree-node__children") : null;
    if (!container) return [];
    return [...container.children].filter(isTreeNodeElement).map(nodeLabelOf);
  }

  function directTreeChildren(container) {
    return [...(container?.children || [])].filter(isTreeNodeElement);
  }

  function snapshotTreeNodeShallow(element, root, state, requireId = false, allowEmptyLabel = false) {
    const id = candidateId(element);
    const label = nodeLabelOf(element);
    const indexes = parseNodePathKey(nodePathKeyOf(element, root));
    let idCount = 0;
    try { idCount = [...root.querySelectorAll(".el-tree-node,[role='treeitem']")].filter((node) => candidateId(node) === id).length; } catch {}
    if ((requireId && !id) || (!allowEmptyLabel && !label) || !indexes || id && idCount !== 1) state.complete = false;
    return { nodePathKey: indexes?.join("/") || "", candidateId: id || "", label, expanded: isNodeExpanded(element) };
  }

  function snapshotTreeNode(element, root, depth = 0, state = { count: 0, complete: true }, requireId = false, allowEmptyLabel = false) {
    state.count += 1;
    if (!element || depth > 64 || state.count > 5000) {
      state.complete = false;
      return null;
    }
    const snapshot = snapshotTreeNodeShallow(element, root, state, requireId, allowEmptyLabel);
    const childContainer = catchQuery(element, ".el-tree-node__children");
    const expandIcon = catchQuery(element, ".el-tree-node__expand-icon");
    const childNodes = directTreeChildren(childContainer);
    if (!childContainer && expandIcon && !classListOf(expandIcon)?.contains("is-leaf")) state.complete = false;
    if (classListOf(expandIcon)?.contains("is-loading")) state.complete = false;
    const children = childNodes.map((child) => snapshotTreeNode(child, root, depth + 1, state, requireId, allowEmptyLabel)).filter(Boolean);
    return { ...snapshot, children };
  }

  function treeSnapshotForOperation(root, element, nodeRef, operationKind, operationIndex, position = null, settingsFields = null) {
    const indexes = parseNodePathKey(nodeRef?.nodePathKey);
    if (!indexes || !element) return { complete: false };
    const childScope = operationKind === "structure_add_child" || operationKind === "structure_add" && position === "child";
    const parentIndexes = childScope ? indexes : indexes.slice(0, -1);
    const parent = childScope ? element : indexes.length > 1 ? walkByIndexes(root, parentIndexes) : null;
    const container = childScope ? catchQuery(element, ".el-tree-node__children") : parent ? catchQuery(parent, ".el-tree-node__children") : root;
    const siblings = directTreeChildren(container);
    const structureScope = typeof operationKind === "string" && operationKind.startsWith("structure_");
    const targetExpandIcon = catchQuery(element, ".el-tree-node__expand-icon");
    const knownEmptyChildList = childScope && siblings.length === 0 && (!targetExpandIcon || classListOf(targetExpandIcon)?.contains("is-leaf"));
    const state = { count: 0, complete: siblings.length > 0 || knownEmptyChildList };
    const nodes = structureScope
      ? siblings.map((node) => snapshotTreeNode(node, root, 0, state, true)).filter(Boolean)
      : siblings.map((node) => snapshotTreeNodeShallow(node, root, state, true));
    const deepTarget = ["structure_delete", "structure_copy", "structure_move"].includes(operationKind);
    const target = deepTarget ? snapshotTreeNode(element, root, 0, state, true) : snapshotTreeNodeShallow(element, root, state, true);
    const scopeTarget = structureScope && parent ? snapshotTreeNodeShallow(parent, root, state, true) : null;
    const scopeRef = !structureScope ? undefined : parent
      ? { kind: "node", scopePath: parentIndexes.join("/"), nodePathKey: parentIndexes.join("/"), candidateId: candidateId(parent), label: nodeLabelOf(parent) }
      : { kind: "treeRoot", scopePath: "" };
    if (settingsFields) {
      const dialog = findSettingsDialog();
      if (!dialog || !settingsDialogMatches(dialog, element, root)) state.complete = false;
    }
    return {
      complete: state.complete && Boolean(target) && (childScope || nodes.some((node) => node.candidateId === candidateId(element))),
      operationIndex,
      operationKind,
      scopePath: parentIndexes.join("/"),
      ...(structureScope ? { scopeRef, scopeTarget } : {}),
      target,
      siblings: nodes,
      settingsFields: settingsFields ? settingsFields.map((field) => ({ label: field.label, selected: field.selected })) : undefined,
    };
  }

  function treeSnapshotForScope(root, scopeRef, operationIndex) {
    if (!scopeRef || !Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex >= 50) return { complete: false };
    let parent = null;
    let scopePath = "";
    if (scopeRef.kind === "treeRoot" && scopeRef.scopePath === "") {
      scopePath = "";
    } else if (scopeRef.kind === "node") {
      const indexes = parseNodePathKey(scopeRef.nodePathKey);
      const element = indexes ? walkByIndexes(root, indexes) : null;
      const id = candidateId(element);
      const allNodes = [...root.querySelectorAll(".el-tree-node,[role='treeitem']")];
      if (!element || scopeRef.scopePath !== scopeRef.nodePathKey || nodePathKeyOf(element, root) !== scopeRef.nodePathKey
        || !id || id !== scopeRef.candidateId || allNodes.filter((node) => candidateId(node) === id).length !== 1
        || typeof scopeRef.label === "string" && nodeLabelOf(element) !== scopeRef.label) return { complete: false };
      parent = element;
      scopePath = scopeRef.nodePathKey;
    } else return { complete: false };
    const container = parent ? catchQuery(parent, ".el-tree-node__children") : root;
    if (!container) return { complete: false };
    const children = directTreeChildren(container);
    const state = { count: 0, complete: true };
    if (parent) {
      const expandIcon = catchQuery(parent, ".el-tree-node__expand-icon");
      if (!children.length && expandIcon && !classListOf(expandIcon)?.contains("is-leaf")) state.complete = false;
      if (classListOf(expandIcon)?.contains("is-loading")) state.complete = false;
    }
    const siblings = children.map((node) => snapshotTreeNode(node, root, 0, state, true, true)).filter(Boolean);
    const scopeTarget = parent ? snapshotTreeNodeShallow(parent, root, state, true) : null;
    const actualScopeRef = parent
      ? { kind: "node", scopePath, nodePathKey: scopePath, candidateId: candidateId(parent), label: nodeLabelOf(parent) }
      : { kind: "treeRoot", scopePath: "" };
    return { complete: state.complete && siblings.length === children.length, operationIndex, operationKind: "structure_scope_read", scopePath, scopeRef: actualScopeRef, target: scopeTarget, siblings };
  }

  function structureScopeFingerprint(snapshot) {
    const stableNode = (node) => node ? {
      nodePathKey: node.nodePathKey,
      candidateId: node.candidateId,
      label: node.label,
      children: Array.isArray(node.children) ? node.children.map(stableNode) : [],
    } : null;
    const scopeRef = snapshot?.scopeRef;
    return JSON.stringify({
      complete: snapshot?.complete,
      operationIndex: snapshot?.operationIndex,
      operationKind: snapshot?.operationKind,
      scopePath: snapshot?.scopePath,
      scopeRef: scopeRef ? { kind: scopeRef.kind, scopePath: scopeRef.scopePath, nodePathKey: scopeRef.nodePathKey, candidateId: scopeRef.candidateId, label: scopeRef.label } : null,
      target: stableNode(snapshot?.target),
      siblings: Array.isArray(snapshot?.siblings) ? snapshot.siblings.map(stableNode) : null,
    });
  }

  function riskOf(kind) {
    if (kind === "structure_delete") return "high";
    if (kind === "editor_text" || kind === "editor_command") return "medium";
    if (kind === "structure_add" || kind === "structure_add_child" || kind === "structure_add_sibling" || kind === "structure_copy") return "medium";
    return "low";
  }

  function preview(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    const ops = payload.ops;
    if (!Array.isArray(ops) || !ops.length || ops.length > 50) return reject("REPORT_PLAN_INVALID");
    const structureCount = ops.filter((op) => typeof op?.kind === "string" && op.kind.startsWith("structure_")).length;
    if (structureCount && structureCount !== ops.length) return reject("REPORT_STRUCTURE_BATCH_SEPARATION_REQUIRED");
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const planned = [];
    const execOps = [];
    for (const [index, op] of ops.entries()) {
      const kind = op?.kind;
      if (!OP_KINDS.has(kind)) return reject("REPORT_OP_INVALID");
      const base = { index, kind, risk: riskOf(kind) };
      let modelSnapshot = null;
      let selectionSnapshot = null;
      let treeSnapshot = null;
      const indexes = parseNodePathKey(op.nodeRef?.nodePathKey);
      const validRef = indexes && typeof op.nodeRef?.label === "string" && op.nodeRef.label;
      if (!validRef) {
        base.nodeRef = op.nodeRef || null;
        base.error = "REPORT_NODE_REF_INVALID";
        planned.push(base);
        execOps.push({ ...op, kind, index });
        continue;
      }
      const element = walkByIndexes(root, indexes);
      const label = element && visible(element) ? nodeLabelOf(element) : null;
      if (!label || label !== op.nodeRef.label) {
        base.nodeRef = { ...op.nodeRef };
        base.error = "REPORT_NODE_CHANGED";
        planned.push(base);
        execOps.push({ ...op, kind, index });
        continue;
      }
      const resolved = resolveNodeRef(root, op.nodeRef);
      if (resolved.error) {
        base.nodeRef = { ...op.nodeRef };
        base.error = resolved.error;
        planned.push(base);
        execOps.push({ ...op, kind, index });
        continue;
      }
      if (!op.nodeRef.candidateId || !resolved.candidateId) {
        base.nodeRef = { ...op.nodeRef };
        base.error = "REPORT_NODE_ID_REQUIRED";
        planned.push(base);
        execOps.push({ ...op, kind, index });
        continue;
      }
      base.nodeRef = { nodePathKey: op.nodeRef.nodePathKey, label, candidateId: candidateId(element) };
      const ancestorIndexes = indexes.slice(0, -1);
      if (kind === "settings_open") {
        const dialog = findSettingsDialog();
        const settingsControl = inlineIconOf(element, "settings");
        const editControls = treeEditModeControls();
        const canEnterTreeEditMode = editControls.length === 1 && controlLabel(editControls[0]) === "编辑" && !isControlDisabled(editControls[0]);
        const requiresTreeEditMode = !dialog && !settingsControl?.element && canEnterTreeEditMode;
        if (dialog && !settingsDialogMatches(dialog, element, root)) base.error = "REPORT_SETTINGS_TARGET_UNVERIFIED";
        else if (!dialog && !settingsControl?.element && !canEnterTreeEditMode) base.error = "REPORT_SETTINGS_CONTROL_NOT_FOUND";
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index);
        if (!treeSnapshot.complete && !base.error) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
        base.summary = `打开节点"${label}"的属性设置`;
        base.before = requiresTreeEditMode ? "树浏览态；属性设置弹窗关闭" : "属性设置弹窗关闭";
        base.after = requiresTreeEditMode ? "进入树编辑态；属性设置弹窗打开并核对目标节点" : "属性设置弹窗打开并核对目标节点";
      } else if (kind === "settings_write") {
        if (!Array.isArray(op.fields) || !op.fields.length) return reject("REPORT_OP_INVALID");
        const dialog = findSettingsDialog();
        if (!dialog) base.error = "REPORT_SETTINGS_NOT_OPEN";
        else if (!settingsDialogMatches(dialog, element, root)) base.error = "REPORT_SETTINGS_TARGET_UNVERIFIED";
        else {
          const prepared = prepareSettingsWrite(dialog, op.fields);
          if (prepared.error) base.error = prepared.error;
        }
        const current = dialog ? readSettingsFields(dialog) : [];
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index, null, current.filter((field) => op.fields.some((wanted) => wanted.label === field.label)));
        if (!treeSnapshot.complete && !base.error) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
        base.summary = `写入节点"${label}"属性：${op.fields.map((field) => field.label).join("、")}`;
        base.before = truncate(JSON.stringify(op.fields.map((field) => ({ label: field.label, selected: current.find((item) => item.label === field.label)?.selected || null }))));
        base.after = truncate(JSON.stringify(op.fields.map((field) => ({ label: field.label, selected: [String(field.value)] }))));
      } else if (kind === "editor_text") {
        const mode = op.mode;
        if (!["replace_first", "replace_all", "append", "set"].includes(mode)) return reject("REPORT_OP_INVALID");
        if (typeof op.replace !== "string") return reject("REPORT_OP_INVALID");
        if (["replace_first", "replace_all"].includes(mode) && (typeof op.find !== "string" || !op.find)) return reject("REPORT_OP_INVALID");
        const association = locateEditorForNode(element);
        if (!association.ok) {
          base.error = association.reason;
          planned.push(base);
          execOps.push({ ...op, kind, index });
          continue;
        }
        const current = String(association.element.textContent ?? "");
        const framework = editorFrameworkOf(association.element);
        if (framework.framework === "prosemirror" || framework.framework === "tiptap") {
          try { modelSnapshot = framework.model?.state?.doc || null; } catch { modelSnapshot = null; }
          if (!modelSnapshot || typeof modelSnapshot.eq !== "function") base.error = "REPORT_EDITOR_MODEL_UNAVAILABLE";
          else if (framework.model.editable === false || association.element.getAttribute?.("contenteditable") === "false") base.error = "REPORT_EDITOR_READ_ONLY";
          else {
            const preparation = prepareProseMirrorText(op, association.element, framework.model);
            if (preparation.error) base.error = preparation.error;
          }
        }
        let expected = null;
        if (mode === "set") expected = op.replace;
        else if (mode === "append") expected = current + op.replace;
        else {
          if (!current.includes(op.find)) base.error = "REPORT_EDITOR_FIND_TEXT_NOT_FOUND";
          else expected = mode === "replace_all" ? current.split(op.find).join(op.replace) : current.replace(op.find, op.replace);
        }
        base.summary = `编辑节点"${label}"正文（${mode}）`;
        base.before = truncate(current);
        base.after = expected === null ? "" : truncate(expected);
        base.change = { mode, inserted: truncate(op.replace), insertedLength: op.replace.length };
        if (typeof op.find === "string") {
          base.change.matched = truncate(op.find);
          base.change.matchedLength = op.find.length;
        }
      } else if (kind === "editor_command") {
        if (!INLINE_FORMAT_COMMANDS.has(op.command) && !PARAGRAPH_FORMAT_COMMANDS.has(op.command)) return reject("REPORT_COMMAND_UNSUPPORTED");
        if (op.command === "font_color" && (typeof op.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(op.color))) return reject("REPORT_COLOR_INVALID");
        const association = locateEditorForNode(element);
        if (!association.ok) base.error = association.reason;
        else {
          const framework = editorFrameworkOf(association.element);
          try { modelSnapshot = framework.model?.state?.doc || null; } catch { modelSnapshot = null; }
          if (!modelSnapshot || typeof modelSnapshot.eq !== "function") base.error = "REPORT_EDITOR_MODEL_UNAVAILABLE";
          else if (framework.model.editable === false || association.element.getAttribute?.("contenteditable") === "false") base.error = "REPORT_EDITOR_READ_ONLY";
          else {
            selectionSnapshot = typeof op.find === "string" && INLINE_FORMAT_COMMANDS.has(op.command)
              ? explicitTextSelection(framework.model, op.find)
              : editorSelectionSnapshot(association.element, framework.model);
            if (typeof op.find === "string" && !INLINE_FORMAT_COMMANDS.has(op.command)) base.error = "REPORT_COMMAND_UNSUPPORTED";
            if (!selectionSnapshot) base.error = "REPORT_SELECTION_UNVERIFIED";
            if (!base.error && PARAGRAPH_FORMAT_COMMANDS.has(op.command)) {
              const paragraph = selectedParagraph(framework.model);
              if (!paragraph) base.error = "REPORT_PARAGRAPH_SCOPE_UNVERIFIED";
              else { base.scope = "paragraph"; base.paragraphBefore = truncate(paragraph.text); }
            }
            const toolbar = editorToolbarOf(association.element);
            const controls = toolbar ? [...toolbar.querySelectorAll("button,[role='button'],.el-tiptap-editor__command-button")].filter((control) => visible(control) && !isControlDisabled(control) && controlMatchesEditorCommand(control, op.command)) : [];
            if (!base.error && controls.length !== 1) base.error = controls.length ? "REPORT_COMMAND_AMBIGUOUS" : "REPORT_COMMAND_UNSUPPORTED";
            if (!base.error && op.command === "font_color") {
              const popupId = controls[0].getAttribute("aria-controls") || "";
              const popupType = controls[0].getAttribute("aria-haspopup") || "";
              if (!/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(popupId) || !["menu", "listbox"].includes(popupType)) base.error = "REPORT_COLOR_PICKER_UNVERIFIED";
            }
          }
        }
        base.summary = `对节点"${label}"当前选区执行 ${op.command}`;
        if (INLINE_FORMAT_COMMANDS.has(op.command)) base.scope = "selection";
        if (PARAGRAPH_FORMAT_COMMANDS.has(op.command)) base.summary = `对节点"${label}"当前完整段落执行 ${op.command}`;
        base.before = selectionSnapshot ? truncate(selectionSnapshot.text) : "";
        base.after = "格式改变，需保存并回读核实";
        if (op.command === "font_increase" || op.command === "font_decrease") base.after = `${op.command === "font_increase" ? "字号增大" : "字号减小"}；实际字号待回读核实`;
        if (op.command === "font_color") base.after = `字体颜色 ${op.color.toLowerCase()}；实际颜色待回读核实`;
      } else if (kind === "structure_add" || kind === "structure_add_child" || kind === "structure_add_sibling") {
        // structure_add_child ≙ structure_add(child)；structure_add_sibling 的 nodeRef 即 siblingAnchor（新节点插入其下方）
        const position = kind === "structure_add_child" ? "child" : kind === "structure_add_sibling" ? "after" : op.position;
        if (!["child", "after", "before"].includes(position) || typeof op.title !== "string" || !op.title.trim()) return reject("REPORT_OP_INVALID");
        if (kind === "structure_add_child") {
          const control = inlineIconOf(element, "add-child");
          if (!control?.element) base.error = control?.disabled ? "REPORT_CONTROL_DISABLED" : control?.error || "REPORT_STRUCTURE_CONTROL_NOT_FOUND";
          if (childrenLabels(root, indexes).includes(op.title)) base.error = "REPORT_NODE_ALREADY_EXISTS";
        }
        base.summary = kind === "structure_add_sibling"
          ? `在锚点节点"${label}"下方新增同级节点："${op.title}"（经其父行新增入口）`
          : `在节点"${label}"${position === "child" ? "下新增子节点" : position === "after" ? "后插入同级节点" : "前插入同级节点"}："${op.title}"`;
        base.summaryPath = kind === "structure_add_sibling" ? "parent-row-add" : "row-inline-add";
        base.before = truncate((position === "child" ? childrenLabels(root, indexes) : siblingLabels(root, ancestorIndexes) || []).join(" / "));
        base.after = truncate(position === "child"
          ? [...childrenLabels(root, indexes), op.title].join(" / ")
          : (() => {
            const labels = siblingLabels(root, ancestorIndexes) || [];
            const at = indexes[indexes.length - 1];
            return (position === "after"
              ? [...labels.slice(0, at + 1), op.title, ...labels.slice(at + 1)]
              : [...labels.slice(0, at), op.title, ...labels.slice(at)]).join(" / ");
          })());
        base.linkage = position === "child"
          ? linkFor(childrenLabels(root, indexes))
          : linkFor(siblingLabels(root, ancestorIndexes) || []);
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index, position);
        if (!treeSnapshot.complete && !base.error) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
      } else if (kind === "structure_copy") {
        base.summary = `复制节点"${label}"${op.title ? ` 为"${op.title}"` : ""}`;
        const labels = siblingLabels(root, ancestorIndexes) || [];
        base.before = truncate(labels.join(" / "));
        base.after = truncate(op.title ? [...labels.slice(0, indexes[indexes.length - 1] + 1), op.title, ...labels.slice(indexes[indexes.length - 1] + 1)].join(" / ") : "");
        base.linkage = linkFor(labels);
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index);
        if (!treeSnapshot.complete) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
      } else if (kind === "structure_move") {
        if (!["up", "down"].includes(op.direction)) return reject("REPORT_OP_INVALID");
        base.summary = `将节点"${label}"${op.direction === "up" ? "上移" : "下移"}`;
        const labels = siblingLabels(root, ancestorIndexes) || [];
        base.before = truncate(labels.join(" / "));
        base.after = truncate(labels.join(" / "));
        base.linkage = linkFor(labels);
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index);
        if (!treeSnapshot.complete) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
      } else {
        base.summary = `删除节点"${label}"`;
        const labels = siblingLabels(root, ancestorIndexes) || [];
        base.before = truncate(labels.join(" / "));
        base.after = truncate(labels.filter((item) => item !== label).join(" / "));
        base.linkage = linkFor(labels);
        treeSnapshot = treeSnapshotForOperation(root, element, op.nodeRef, kind, index);
        if (!treeSnapshot.complete) base.error = "REPORT_TREE_SNAPSHOT_INCOMPLETE";
      }
      planned.push(base);
      execOps.push({
        kind: kind === "structure_add_sibling" ? "structure_add" : kind,
        index,
        nodeRef: { ...base.nodeRef },
        fields: Array.isArray(op.fields) ? op.fields.map((field) => ({ label: field.label, value: field.value })) : undefined,
        find: op.find,
        replace: op.replace,
        mode: op.mode,
        command: op.command,
        color: op.command === "font_color" ? op.color.toLowerCase() : undefined,
        position: kind === "structure_add_child" ? "child" : kind === "structure_add_sibling" ? "after" : op.position,
        title: op.title,
        direction: op.direction,
        inline: kind === "structure_add_child" || kind === "structure_add_sibling" || op.inline === true,
        opConfirm: op.opConfirm === true,
        modelSnapshot,
        selectionSnapshot,
        treeSnapshot,
        treeSnapshotKind: kind,
      });
    }
    if (planned.some((item) => item.error)) {
      return { ok: false, action: "report_preview", reason: "REPORT_PLAN_INVALID", ops: planned, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
    }
    const privateSnapshots = [];
    const privateTreeSnapshots = [];
    const snapshotNodes = new Set();
    for (const op of execOps) {
      if (!op.modelSnapshot || typeof op.modelSnapshot.toJSON !== "function" || snapshotNodes.has(op.nodeRef.candidateId)) continue;
      try {
        privateSnapshots.push({ nodeRef: { nodePathKey: op.nodeRef.nodePathKey, candidateId: op.nodeRef.candidateId }, model: op.modelSnapshot.toJSON() });
        snapshotNodes.add(op.nodeRef.candidateId);
      } catch { return reject("REPORT_SNAPSHOT_MODEL_INVALID"); }
    }
    for (const op of execOps) {
      if (!op.treeSnapshot) continue;
      if (op.treeSnapshot.complete !== true) return reject("REPORT_TREE_SNAPSHOT_INCOMPLETE");
      privateTreeSnapshots.push({ nodeRef: { nodePathKey: op.nodeRef.nodePathKey, candidateId: op.nodeRef.candidateId }, operationIndex: op.index, operationKind: op.treeSnapshotKind, treeSnapshot: op.treeSnapshot,
        origin: { documentTimeOrigin: Number(window.performance?.timeOrigin), pageOrigin: String(window.location?.origin || "") } });
    }
    const contentHash = pageContentHash();
    if (!window.crypto || typeof window.crypto.getRandomValues !== "function") return reject("REPORT_SECURE_RANDOM_UNAVAILABLE");
    const randomBytes = new Uint8Array(16);
    window.crypto.getRandomValues(randomBytes);
    const planHash = `plan-${Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    if (planRegistry.has(planHash) || consumedPlans.has(planHash)) return reject("REPORT_PLAN_ID_COLLISION");
    while (planRegistry.size >= PLAN_LIMIT) {
      planRegistry.delete(planRegistry.keys().next().value);
    }
    planRegistry.set(planHash, { ops: execOps, contentHash, contentSnapshot: pageContentSnapshot(), reportIdentity: identity(), createdAt: Date.now() });
    return {
      ok: true,
      action: "report_preview",
      planHash,
      contentHash,
      confirmationRequired: structureCount ? CONFIRM_STRUCTURE_TEXT : CONFIRM_EXECUTE_TEXT,
      ops: planned,
      privateSnapshots,
      privateTreeSnapshots,
      requires: ["execute"],
      security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
    };
  }

  function findStructureControl(kind) {
    const pattern = STRUCTURE_CONTROL_PATTERNS[kind];
    if (!pattern) return null;
    for (const toolbar of toolbarElements()) {
      for (const control of [...toolbar.querySelectorAll("button,[role='button']")]) {
        if (!visible(control) || isControlDisabled(control)) continue;
        if (pattern.test(controlLabel(control))) return control;
      }
    }
    return null;
  }

  function confirmButtonIn(dialog) {
    for (const control of [...dialog.querySelectorAll("button,[role='button']")]) {
      if (!visible(control) || isControlDisabled(control)) continue;
      if (/确认|确定|ok|confirm/i.test(controlLabel(control))) return control;
    }
    return null;
  }

  function settingsConfirmButtonIn(dialog) {
    const buttons = [...dialog.querySelectorAll("button,[role='button']")]
      .filter((control) => visible(control) && !isControlDisabled(control) && controlLabel(control) === "确认");
    return buttons.length === 1 ? buttons[0] : null;
  }

  const POSITION_LABEL_PATTERNS = { child: /子节点|child/i, after: /下方|之后|after/i, before: /上方|之前|before/i };

  async function fillStructureDialog(op, timeoutMs) {
    const opened = await waitForValue(() => [...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible) || null, timeoutMs, 30);
    if (!opened) return { ok: false, error: "REPORT_STRUCTURE_DIALOG_TIMEOUT" };
    const input = opened.querySelector("input");
    const isAdd = op.kind === "structure_add" || op.kind === "structure_add_child";
    const wantedTitle = isAdd ? String(op.title || "") : op.title ? String(op.title) : null;
    if (wantedTitle !== null) {
      if (!input) return { ok: false, error: "REPORT_STRUCTURE_DIALOG_INPUT_MISSING" };
      if (!insertTextViaCommand(input, wantedTitle, false)) return { ok: false, error: "REPORT_EDITOR_WRITE_FAILED" };
    }
    if (op.kind === "structure_add" && op.position !== "child") {
      const pattern = POSITION_LABEL_PATTERNS[op.position];
      let done = false;
      for (const label of [...opened.querySelectorAll("label")]) {
        const radio = label.querySelector("input[type='radio']");
        if (!radio || !pattern.test(text(label, 40))) continue;
        if (!dispatchRealClick(radio)) return { ok: false, error: "REPORT_CONTROL_CLICK_FAILED" };
        done = true;
        break;
      }
      if (!done) return { ok: false, error: "REPORT_STRUCTURE_POSITION_OPTION_NOT_FOUND" };
    }
    const confirm = confirmButtonIn(opened);
    if (!confirm) return { ok: false, error: "REPORT_STRUCTURE_CONFIRM_MISSING" };
    if (!dispatchRealClick(confirm)) return { ok: false, error: "REPORT_CONTROL_CLICK_FAILED" };
    if (!(await waitFor(() => !([...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible)), timeoutMs, 30))) {
      return { ok: false, error: "REPORT_STRUCTURE_DIALOG_CONFIRM_TIMEOUT" };
    }
    return { ok: true };
  }

  function prepareSettingsWrite(dialog, fields) {
    if (!Array.isArray(fields) || fields.some((field) => !field || !SETTING_LABELS.has(field.label))) return { error: "REPORT_SETTINGS_FIELD_UNKNOWN" };
    if (fields.length !== 1 || fields[0].label !== "是否编号" || fields[0].value !== "是") return { error: "REPORT_SETTINGS_FIELD_UNSUPPORTED" };
    const controls = [];
    const labels = new Set();
    for (const field of fields) {
      const value = String(field.value);
      if (!SETTING_LABELS.has(field.label) || labels.has(field.label)) return { error: "REPORT_SETTINGS_FIELD_UNKNOWN" };
      labels.add(field.label);
      const row = findSettingsRow(dialog, field.label);
      if (!row) return { error: "REPORT_SETTINGS_FIELD_NOT_FOUND" };
      const optionLabels = [...row.querySelectorAll("label")].filter((label) => label.querySelector("input[type='radio'],input[type='checkbox']"));
      const option = optionLabels.map((label) => ({ label, value: text(label, 40) })).find((item) => {
        if (item.value !== value) return false;
        const input = item.label.querySelector("input[type='radio'],input[type='checkbox']");
        return field.label !== "是否编号" || value !== "是" || input?.getAttribute("value") === "true";
      });
      if (option) {
        const input = option.label.querySelector("input[type='radio'],input[type='checkbox']");
        if (isControlDisabled(input)) return { error: "REPORT_CONTROL_DISABLED" };
        controls.push({ kind: "choice", input });
        continue;
      }
      const select = row.querySelector("select");
      if (!select) return { error: "REPORT_SETTINGS_OPTION_NOT_FOUND" };
      const optionElement = [...select.querySelectorAll("option")].find((item) => text(item, 40) === value || item.getAttribute("value") === value);
      if (!optionElement) return { error: "REPORT_SETTINGS_OPTION_NOT_FOUND" };
      if (isControlDisabled(select) || isControlDisabled(optionElement)) return { error: "REPORT_CONTROL_DISABLED" };
      controls.push({ kind: "select", select, value: optionElement.getAttribute("value") || value });
    }
    return { controls };
  }

  async function execSettingsOpen(op, element, root, writeState) {
    const existing = findSettingsDialog();
    if (existing) return settingsDialogMatches(existing, element, root)
      ? { status: "verified", readback: { settingsDialogOpen: true, targetVerified: true } }
      : { status: "failed", error: "REPORT_SETTINGS_TARGET_UNVERIFIED" };
    let control = inlineIconOf(element, "settings");
    if (control?.disabled) return { status: "failed", error: "REPORT_CONTROL_DISABLED" };
    if (!control?.element) {
      const editControls = treeEditModeControls();
      if (editControls.length !== 1 || controlLabel(editControls[0]) !== "编辑" || isControlDisabled(editControls[0])) {
        return { status: "failed", error: control?.error || "REPORT_SETTINGS_CONTROL_NOT_FOUND" };
      }
      const entered = await enterTreeEditMode(root, clampTimeout(undefined));
      if (!entered.ok) {
        if (entered.uiStateChanged || entered.error === "REPORT_TREE_CHANGED") writeState.uiStateChanged = true;
        return { status: writeState.uiStateChanged ? "pendingVerify" : "failed", error: entered.error, ...(writeState.uiStateChanged ? { uiStateChanged: true } : {}) };
      }
      if (!entered.alreadyActive) writeState.uiStateChanged = true;
      const expectedTarget = {
        nodePathKey: op.nodeRef?.nodePathKey,
        label: op.nodeRef?.label,
        candidateId: op.nodeRef?.candidateId || candidateId(element),
      };
      let readinessError = "REPORT_SETTINGS_CONTROL_NOT_FOUND";
      const ready = await waitForValue(() => {
        const freshRoot = findTreeRoot();
        if (!freshRoot) { readinessError = "REPORT_TREE_NOT_FOUND"; return null; }
        const freshNode = resolveNodeRef(freshRoot, op.nodeRef);
        if (freshNode.error) return { error: freshNode.error };
        if (freshNode.nodePathKey !== expectedTarget.nodePathKey || freshNode.label !== expectedTarget.label
          || freshNode.candidateId !== expectedTarget.candidateId) return { error: "REPORT_NODE_CHANGED" };
        const freshControl = inlineIconOf(freshNode.element, "settings");
        if (freshControl?.disabled) return { error: "REPORT_CONTROL_DISABLED" };
        if (freshControl?.element) return { root: freshRoot, node: freshNode, control: freshControl };
        readinessError = freshControl?.error || "REPORT_SETTINGS_CONTROL_NOT_FOUND";
        return null;
      }, clampTimeout(undefined), 30);
      if (ready?.error) return { status: writeState.uiStateChanged ? "pendingVerify" : "failed", error: ready.error, ...(writeState.uiStateChanged ? { uiStateChanged: true } : {}) };
      if (!ready) return { status: writeState.uiStateChanged ? "pendingVerify" : "failed", error: readinessError, ...(writeState.uiStateChanged ? { uiStateChanged: true } : {}) };
      root = ready.root;
      element = ready.node.element;
      control = ready.control;
    }
    writeState.uiStateChanged = true;
    settingsTarget = null;
    if (!dispatchRealClick(control.element)) return { status: "pendingVerify", error: "REPORT_CONTROL_CLICK_FAILED" };
    const dialog = await waitForValue(() => {
      const freshRoot = findTreeRoot();
      const freshNode = freshRoot ? resolveNodeRef(freshRoot, op.nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
      const candidate = findSettingsDialog();
      if (!freshNode.error && candidate && !candidate.getAttribute?.("data-node-key")) {
        associateSettingsTarget(candidate, freshNode.element, freshRoot);
      }
      return !freshNode.error && candidate && settingsDialogMatches(candidate, freshNode.element, freshRoot) ? candidate : null;
    }, clampTimeout(undefined), 30);
    if (!dialog) return { status: "pendingVerify", error: "REPORT_SETTINGS_OPEN_UNVERIFIED" };
    return { status: "verified", readback: { settingsDialogOpen: true, targetVerified: true } };
  }

  async function execSettingsWrite(op, element, root, writeState) {
    const dialog = findSettingsDialog();
    if (!dialog) return { status: "failed", error: "REPORT_SETTINGS_NOT_OPEN" };
    if (!settingsDialogMatches(dialog, element, root)) return { status: "failed", error: "REPORT_SETTINGS_TARGET_UNVERIFIED" };
    const prepared = prepareSettingsWrite(dialog, op.fields);
    if (prepared.error) return { status: "failed", error: prepared.error };
    let attempted = false;
    for (const control of prepared.controls) {
      if (findSettingsDialog() !== dialog || !settingsDialogMatches(dialog, element, root)) return { status: attempted ? "pendingVerify" : "failed", error: "REPORT_SETTINGS_TARGET_UNVERIFIED" };
      attempted = true;
      if (control.kind === "choice") {
        writeState.started = true;
        if (!dispatchRealClick(control.input)) return { status: "pendingVerify", error: "REPORT_CONTROL_CLICK_FAILED" };
        continue;
      }
      try {
        control.select.value = control.value;
        const event = typeof Event === "function" ? new Event("change", { bubbles: true }) : { type: "change", bubbles: true, cancelable: false };
        writeState.started = true;
        control.select.dispatchEvent(event);
      } catch {
        return { status: "pendingVerify", error: "REPORT_CONTROL_CLICK_FAILED" };
      }
    }
    const confirmsNumbering = op.fields.length === 1 && op.fields[0].label === "是否编号" && op.fields[0].value === "是";
    const readNumberingReadback = () => {
      if (findSettingsDialog() !== dialog || !settingsDialogMatches(dialog, element, root)) return { error: "REPORT_SETTINGS_TARGET_UNVERIFIED" };
      const fields = readSettingsFields(dialog);
      const numberingFields = fields.filter((field) => field.label === "是否编号");
      if (numberingFields.length > 1) return { error: "REPORT_SETTINGS_READBACK_MISMATCH" };
      if (numberingFields.length !== 1 || numberingFields[0].selected.length !== 1 || numberingFields[0].selected[0] !== "是") return null;
      return { fields };
    };
    const numberingReadback = confirmsNumbering ? await waitForValue(readNumberingReadback, 1500, 30) : null;
    const after = numberingReadback?.fields || readSettingsFields(dialog);
    const verified = confirmsNumbering
      ? Boolean(numberingReadback?.fields)
      : op.fields.every((field) => after.find((item) => item.label === field.label)?.selected.includes(String(field.value)));
    // 编号字段写入后，受影响兄弟节点（编号联动范围）在 linkage 中返回
    const result = { status: verified ? "saved" : "pendingVerify", readback: { fields: after.map((item) => ({ label: item.label, selected: item.selected })) } };
    if (confirmsNumbering) {
      result.status = "pendingVerify";
      result.expectedFields = [{ label: "是否编号", value: "是" }];
      result.documentTimeOrigin = Number.isFinite(window.performance?.timeOrigin) && window.performance.timeOrigin > 0 ? window.performance.timeOrigin : null;
      result.submissionAttempted = false;
      result.readback.submissionAttempted = false;
      if (!verified) result.error = numberingReadback?.error || "REPORT_SETTINGS_READBACK_MISMATCH";
      else {
        const currentReadback = readNumberingReadback();
        const confirm = settingsConfirmButtonIn(dialog);
        if (currentReadback?.error) result.error = currentReadback.error;
        else if (!currentReadback?.fields) result.error = "REPORT_SETTINGS_READBACK_MISMATCH";
        else if (!confirm) result.error = "REPORT_SETTINGS_CONFIRM_NOT_FOUND";
        else {
          result.submissionAttempted = true;
          result.readback.submissionAttempted = result.submissionAttempted;
          const clicked = dispatchRealClick(confirm);
          result.readback.settingsDialogClosed = clicked ? await waitFor(() => findSettingsDialog() !== dialog, 1200, 30) : false;
          if (result.readback.settingsDialogClosed) clearSettingsTarget();
          if (!clicked) result.error = "REPORT_SETTINGS_CONFIRM_CLICK_FAILED";
          else if (!result.readback.settingsDialogClosed) result.error = "REPORT_SETTINGS_CONFIRM_TIMEOUT";
        }
      }
    }
    if (op.fields.some((field) => field.label === "是否编号" || field.label === "编号样式") && root && element) {
      const indexes = parseNodePathKey(op.nodeRef.nodePathKey) || [];
      result.linkage = linkFor(siblingLabels(root, indexes.slice(0, -1)) || []);
    }
    return result;
  }

  async function execEditorText(op, element, writeState) {
    const association = locateEditorForNode(element);
    if (!association.ok) return { status: "failed", error: association.reason };
    const editorElement = association.element;
    const framework = editorFrameworkOf(editorElement);
    if (framework.framework === "prosemirror" || framework.framework === "tiptap") {
      if (!framework.modelAvailable) return { status: "failed", error: "REPORT_EDITOR_MODEL_UNAVAILABLE" };
      return execProseMirrorText(op, editorElement, framework.model, writeState);
    }
    if (editorElement.children?.length || editorElement.querySelector?.("table,img,svg,math,video,audio,iframe,[data-field],[data-formula],.ProseMirror")) {
      return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
    }
    const current = String(editorElement.textContent ?? "");
    const mode = op.mode;
    let expected;
    if (mode === "set") expected = String(op.replace ?? "");
    else if (mode === "append") expected = current + String(op.replace ?? "");
    else {
      if (typeof op.find !== "string" || !op.find) return { status: "failed", error: "REPORT_EDITOR_FIND_TEXT_REQUIRED" };
      if (!current.includes(op.find)) return { status: "failed", error: "REPORT_EDITOR_FIND_TEXT_NOT_FOUND" };
      expected = mode === "replace_all" ? current.split(op.find).join(String(op.replace ?? "")) : current.replace(op.find, String(op.replace ?? ""));
    }
    let applied = false;
    if (framework.modelAvailable && framework.model) {
      try {
        if (typeof framework.model.setText === "function") { writeState.started = true; framework.model.setText(expected); applied = true; }
        else if (typeof framework.model.setData === "function") { writeState.started = true; framework.model.setData(expected); applied = true; }
      } catch { return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" }; }
    }
    if (!applied) {
      if (typeof editorElement?.focus !== "function" || typeof document.execCommand !== "function" || typeof document.createRange !== "function") return { status: "failed", error: "REPORT_EDITOR_WRITE_FAILED" };
      writeState.started = true;
      applied = insertTextViaCommand(editorElement, expected, false);
      if (!applied) return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" };
    }
    const after = String(editorElement.textContent ?? "");
    const verified = after === expected;
    return { status: "pendingVerify", ...(verified ? {} : { error: "REPORT_EDITOR_READBACK_MISMATCH" }), readback: { textPreview: truncate(after), hash: hashText(after) } };
  }

  function prepareProseMirrorText(op, editorElement, view) {
    let current;
    try {
      if (view.editable === false || editorElement.getAttribute?.("contenteditable") === "false") return { status: "failed", error: "REPORT_EDITOR_READ_ONLY" };
      const doc = view.state.doc;
      if (!doc) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
      const blocks = [];
      let offset = 0;
      const addBlock = (node, position, parent) => {
        if (!node.isTextblock) return true;
        const value = String(node.textContent ?? "");
        blocks.push({ node, start: position + 1, offset, length: value.length, topLevel: !parent || parent === doc });
        offset += value.length;
        return false;
      };
      if (typeof doc.descendants === "function") doc.descendants(addBlock);
      else if (doc.childCount === 1) addBlock(doc.child(0), 0);
      if (!blocks.length) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
      current = typeof doc.textContent === "string" ? doc.textContent : blocks.map((block) => String(block.node.textContent ?? "")).join("");
      if (offset !== current.length || current !== String(editorElement.textContent ?? "")) return { status: "failed", error: "REPORT_EDITOR_MODEL_MISMATCH" };
      if (op.mode === "set") return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
      if (typeof op.replace !== "string") return { status: "failed", error: "REPORT_OP_INVALID" };
      const ranges = [];
      if (op.mode === "append") {
        const last = blocks[blocks.length - 1];
        if (!last.topLevel || (typeof doc.lastChild !== "undefined" && doc.lastChild !== last.node)) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
        ranges.push({ block: last, from: last.start + last.length, to: last.start + last.length });
      }
      else if (op.mode === "replace_first" || op.mode === "replace_all") {
        if (typeof op.find !== "string" || !op.find) return { status: "failed", error: "REPORT_EDITOR_FIND_TEXT_REQUIRED" };
        let position = current.indexOf(op.find);
        while (position !== -1) {
          const block = blocks.find((item) => position >= item.offset && position < item.offset + item.length && position + op.find.length <= item.offset + item.length);
          if (!block) return { status: "failed", error: "REPORT_CROSS_BLOCK_UNSUPPORTED" };
          if (!block.topLevel) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
          ranges.push({ block, from: block.start + position - block.offset, to: block.start + position - block.offset + op.find.length });
          if (op.mode === "replace_first") break;
          position = current.indexOf(op.find, position + op.find.length);
        }
        if (!ranges.length) return { status: "failed", error: "REPORT_EDITOR_FIND_TEXT_NOT_FOUND" };
      } else return { status: "failed", error: "REPORT_OP_INVALID" };
      for (const { block } of ranges) {
        if (!block.node.content || block.node.content.size !== block.length) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
        for (let index = 0; index < block.node.childCount; index += 1) {
          if (!block.node.child(index).isText) return { status: "failed", error: "REPORT_COMPLEX_CONTENT_UNSUPPORTED" };
        }
      }
      return { current, ranges };
    } catch {
      return { status: "failed", error: "REPORT_EDITOR_MODEL_UNAVAILABLE" };
    }
  }

  async function execProseMirrorText(op, editorElement, view, writeState) {
    const preparation = prepareProseMirrorText(op, editorElement, view);
    if (preparation.error) return preparation;
    const { current, ranges } = preparation;
    let transaction;
    try {
      transaction = view.state.tr;
      if (typeof transaction?.insertText !== "function") return { status: "failed", error: "REPORT_EDITOR_MODEL_UNAVAILABLE" };
      for (const range of ranges.reverse()) transaction = transaction.insertText(op.replace, range.from, range.to);
    } catch {
      return { status: "failed", error: "REPORT_EDITOR_MODEL_UNAVAILABLE" };
    }
    const expected = op.mode === "append" ? current + op.replace : op.mode === "replace_all" ? current.split(op.find).join(op.replace) : current.replace(op.find, op.replace);
    try {
      writeState.started = true;
      view.dispatch(transaction);
      const modelText = typeof view.state.doc.textContent === "string" ? view.state.doc.textContent : String(view.state.doc.child(0).textContent ?? "");
      const after = String(editorElement.textContent ?? "");
      if (modelText !== expected || after !== expected) return { status: "pendingVerify", error: "REPORT_EDITOR_READBACK_MISMATCH" };
      let modelHash = null;
      const documentSnapshot = view.state.doc;
      if (typeof documentSnapshot?.toJSON === "function" && window.crypto?.subtle && typeof TextEncoder === "function") {
        const bytes = new TextEncoder().encode(JSON.stringify(documentSnapshot.toJSON()));
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        if (!view.state.doc.eq(documentSnapshot) || String(editorElement.textContent ?? "") !== expected) return { status: "pendingVerify", error: "REPORT_CONTENT_CHANGED" };
        modelHash = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      }
      return { status: "pendingVerify", readback: { textPreview: truncate(after), hash: hashText(after), modelHash } };
    } catch {
      return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" };
    }
  }

  async function execInlineFormat(op, element, writeState) {
    const association = locateEditorForNode(element);
    if (!association.ok) return { status: "failed", error: association.reason };
    const framework = editorFrameworkOf(association.element);
    const view = framework.model;
    if (view?.editable === false || association.element.getAttribute?.("contenteditable") === "false") return { status: "failed", error: "REPORT_EDITOR_READ_ONLY" };
    try {
      if (!view?.state?.doc?.eq(op.modelSnapshot)) return { status: "failed", error: "REPORT_CONTENT_CHANGED" };
    } catch { return { status: "failed", error: "REPORT_CONTENT_CHANGED" }; }
    const toolbar = editorToolbarOf(association.element);
    const controls = toolbar ? [...toolbar.querySelectorAll("button,[role='button'],.el-tiptap-editor__command-button")].filter((control) => visible(control) && !isControlDisabled(control) && controlMatchesEditorCommand(control, op.command)) : [];
    if (controls.length !== 1) return { status: "failed", error: controls.length ? "REPORT_COMMAND_AMBIGUOUS" : "REPORT_COMMAND_UNSUPPORTED" };
    const control = controls[0];
    let expectedFormatModel = null;
    const verifiedMarkNames = { bold: ["strong", "bold"], italic: ["em", "italic"], underline: ["underline"], strikethrough: ["strike", "strikethrough"] };
    if (verifiedMarkNames[op.command] && op.selectionSnapshot?.explicit) {
      try {
        const marks = view.state.schema?.marks;
        const markTypes = verifiedMarkNames[op.command].map((name) => marks?.[name]).filter(Boolean);
        const { from, to } = op.selectionSnapshot;
        if (markTypes.length === 1) expectedFormatModel = view.state.doc.rangeHasMark(from, to, markTypes[0])
          ? view.state.tr.removeMark(from, to, markTypes[0]).doc
          : view.state.tr.addMark(from, to, markTypes[0].create()).doc;
      } catch { expectedFormatModel = null; }
      if (!expectedFormatModel) return { status: "failed", error: "REPORT_FORMAT_MODEL_UNSUPPORTED" };
    }
    if (op.selectionSnapshot?.explicit) {
      const expected = op.selectionSnapshot;
      if (view.state.selection?.from !== expected.initialFrom || view.state.selection?.to !== expected.initialTo) return { status: "failed", error: "REPORT_SELECTION_CHANGED" };
      try {
        const constructor = view.state.selection?.constructor;
        if (typeof constructor?.create !== "function" || typeof view.state.tr?.setSelection !== "function" || typeof view.focus !== "function") return { status: "failed", error: "REPORT_SELECTION_UNSUPPORTED" };
        const selection = constructor.create(view.state.doc, expected.from, expected.to);
        if (selection.from !== expected.from || selection.to !== expected.to || selection.$from?.parent !== selection.$to?.parent || !selection.$from?.parent?.isTextblock) return { status: "failed", error: "REPORT_SELECTION_UNSUPPORTED" };
        view.dispatch(view.state.tr.setSelection(selection));
        view.focus();
        const actual = editorSelectionSnapshot(association.element, view);
        if (!view.state.doc.eq(op.modelSnapshot) || actual?.from !== expected.from || actual?.to !== expected.to || actual?.text !== expected.text) return { status: "pendingVerify", error: "REPORT_SELECTION_CHANGED" };
        op.selectionSnapshot = actual;
      } catch { return { status: "pendingVerify", error: "REPORT_SELECTION_CHANGED" }; }
    } else if (!sameEditorSelection(editorSelectionSnapshot(association.element, view), op.selectionSnapshot)) return { status: "failed", error: "REPORT_SELECTION_CHANGED" };
    if (op.command === "font_color") {
      const popupId = control.getAttribute("aria-controls") || "";
      const popupType = control.getAttribute("aria-haspopup") || "";
      if (!/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(popupId) || !["menu", "listbox"].includes(popupType)) return { status: "failed", error: "REPORT_COLOR_PICKER_UNVERIFIED" };
      if (control.getAttribute("aria-expanded") !== "true" && !dispatchRealClick(control)) return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" };
      const popup = await waitForValue(() => {
        const candidates = [...document.querySelectorAll("[id]")].filter((item) => item.getAttribute("id") === popupId);
        return candidates.length === 1 && visible(candidates[0]) && candidates[0].getAttribute("role") === popupType ? candidates[0] : null;
      }, 1000, 40);
      if (!popup) return { status: "pendingVerify", error: "REPORT_COLOR_PICKER_UNVERIFIED" };
      try {
        if (!view.state.doc.eq(op.modelSnapshot) || !sameEditorSelection(editorSelectionSnapshot(association.element, view, false), op.selectionSnapshot)) return { status: "pendingVerify", error: "REPORT_SELECTION_CHANGED" };
      } catch { return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" }; }
      const choices = [...popup.querySelectorAll("[data-color]")].filter((item) => visible(item) && !isControlDisabled(item) && ["option", "menuitem"].includes(item.getAttribute("role")) && String(item.getAttribute("data-color") || "").toLowerCase() === op.color);
      if (choices.length !== 1) return { status: "pendingVerify", error: choices.length ? "REPORT_COLOR_OPTION_AMBIGUOUS" : "REPORT_COLOR_OPTION_NOT_FOUND" };
      writeState.started = true;
      if (!dispatchRealClick(choices[0])) return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" };
    } else {
      writeState.started = true;
      if (!dispatchRealClick(control)) return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" };
    }
    try {
      const modelChanged = !view.state.doc.eq(op.modelSnapshot);
      const readback = { modelChanged };
      if (modelChanged && expectedFormatModel && view.state.doc.eq(expectedFormatModel) && window.crypto?.subtle && typeof TextEncoder === "function") {
        const current = view.state.doc;
        const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(current.toJSON())));
        if (!view.state.doc.eq(current)) return { status: "pendingVerify", error: "REPORT_CONTENT_CHANGED" };
        readback.modelHash = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        readback.formatScopeVerified = true;
      }
      return { status: "pendingVerify", readback };
    } catch { return { status: "pendingVerify", error: "REPORT_EDITOR_DISPATCH_UNCERTAIN" }; }
  }

  function expectedSiblingOrder(before, index, op) {
    const at = index;
    if (op.kind === "structure_move") {
      const target = op.direction === "up" ? at - 1 : at + 1;
      if (target < 0 || target >= before.length) return null;
      const after = [...before];
      const [moved] = after.splice(at, 1);
      after.splice(target, 0, moved);
      return after;
    }
    if (op.kind === "structure_delete") return before.filter((item, position) => position !== at);
    if (op.kind === "structure_add") {
      return op.position === "after"
        ? [...before.slice(0, at + 1), op.title, ...before.slice(at + 1)]
        : [...before.slice(0, at), op.title, ...before.slice(at)];
    }
    if (op.kind === "structure_copy") {
      return op.title ? [...before.slice(0, at + 1), String(op.title), ...before.slice(at + 1)] : null;
    }
    return null;
  }

  function treeRowControlOf(content, kind) {
    const index = TREE_ROW_CONTROL_INDEX[kind];
    if (!Number.isInteger(index)) return null;
    const rows = [...content.querySelectorAll(".custom-tree-node")].filter(visible);
    if (rows.length !== 1) return { error: "REPORT_TREE_ROW_CONTROL_ROW_AMBIGUOUS" };
    const areas = [...rows[0].querySelectorAll(".opt-area")].filter(visible);
    if (areas.length !== 1) return { error: "REPORT_TREE_ROW_CONTROL_AREA_AMBIGUOUS" };
    const controls = [...areas[0].children];
    if (controls.length !== TREE_ROW_CONTROL_TAGS.length) return { error: "REPORT_TREE_ROW_CONTROL_LAYOUT_MISMATCH" };
    const clickTargets = [];
    for (let position = 0; position < controls.length; position += 1) {
      const control = controls[position];
      if (!visible(control) || String(control.tagName || "").toUpperCase() !== TREE_ROW_CONTROL_TAGS[position]) return { error: "REPORT_TREE_ROW_CONTROL_LAYOUT_MISMATCH" };
      const clickTarget = kind === "add-child" ? treeRowClickTarget(control) : hasClickHandler(control) ? control : null;
      if (!clickTarget) return { error: "REPORT_TREE_ROW_CONTROL_HANDLER_MISSING" };
      clickTargets.push(clickTarget);
      if (control.tagName === "I" && (!classListOf(control)?.contains("el-icon") || !classListOf(control)?.contains("opt-icon"))) return { error: "REPORT_TREE_ROW_CONTROL_LAYOUT_MISMATCH" };
    }
    const target = controls[index];
    if (isControlDisabled(target) || isControlDisabled(clickTargets[index])) return { disabled: true };
    return { element: clickTargets[index], via: "inline-icon" };
  }

  function hasTreeRowControl(nodes, kind) {
    for (const node of nodes) {
      if (inlineIconOf(node, kind)?.element) return true;
      const content = nodeContentOf(node);
      const result = treeRowControlOf(content, kind);
      if (result?.element) return true;
    }
    return false;
  }

  function inlineIconOf(nodeElement, kind) {
    const wanted = INLINE_ICON_ARIA[kind];
    if (!wanted) return null;
    const content = nodeContentOf(nodeElement);
    if (!content || typeof content.querySelectorAll !== "function") return null;
    let disabledPresent = false;
    const accessibleControls = [...content.querySelectorAll("[aria-label],[title]")].filter(visible);
    const operationLabels = new Set(Object.values(INLINE_ICON_ARIA));
    for (const control of accessibleControls) {
      const label = control.getAttribute("aria-label") || control.getAttribute("title");
      if (label !== wanted) continue;
      if (isControlDisabled(control)) { disabledPresent = true; continue; }
      return { element: control, via: "inline-icon" };
    }
    if (disabledPresent || accessibleControls.some((control) => operationLabels.has(control.getAttribute("aria-label") || control.getAttribute("title")))) {
      return disabledPresent ? { disabled: true } : null;
    }
    const controls = [...content.querySelectorAll(".custom-tree-node .opt-area > *")].filter(visible);
    for (const control of controls) {
      const label = control.getAttribute("aria-label") || control.getAttribute("title");
      if (label !== wanted) continue;
      if (isControlDisabled(control)) { disabledPresent = true; continue; }
      return { element: control, via: "inline-icon" };
    }
    if (disabledPresent) return { disabled: true };
    if (controls.some((control) => String(control.getAttribute("aria-label") || control.getAttribute("title") || "").trim())) return null;
    return treeRowControlOf(content, kind);
  }

  async function confirmDeleteDialog(timeoutMs, targetLabel) {
    const findDeleteDialog = () => {
      const dialogs = [...document.querySelectorAll(".el-dialog,[role='dialog']")].filter(visible);
      const matching = dialogs.filter((dialog) => {
        const heading = text(dialog.querySelector(".el-dialog__title,[role='heading']"), 80);
        const body = text(dialog, 240);
        return /删除/.test(`${heading} ${body}`) && (!targetLabel || !body.includes("「") || body.includes(targetLabel));
      });
      return { dialog: matching.length === 1 ? matching[0] : null, ambiguous: matching.length > 1 };
    };
    const found = await waitForValue(() => {
      const result = findDeleteDialog();
      return result.dialog || result.ambiguous ? result : null;
    }, Math.min(clampTimeout(timeoutMs), 300), 25);
    if (!found) return { ok: true, confirmed: false };
    if (found.ambiguous) return { ok: false, error: "REPORT_STRUCTURE_CONFIRM_AMBIGUOUS" };
    const dialog = found.dialog;
    if (!dialog) return { ok: false, error: "REPORT_STRUCTURE_CONFIRM_TARGET_MISMATCH" };
    const confirm = confirmButtonIn(dialog);
    if (!confirm) return { ok: false, error: "REPORT_STRUCTURE_CONFIRM_MISSING" };
    if (!dispatchRealClick(confirm)) return { ok: false, error: "REPORT_CONTROL_CLICK_FAILED" };
    if (!(await waitFor(() => !([...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible)), timeoutMs, 30))) {
      return { ok: false, error: "REPORT_STRUCTURE_DIALOG_CONFIRM_TIMEOUT" };
    }
    return { ok: true, confirmed: true };
  }

  function structureChildRows(root, parent) {
    const container = catchQuery(parent, ".el-tree-node__children");
    return directTreeChildren(container).map((node) => ({
      element: node,
      nodePathKey: nodePathKeyOf(node, root),
      candidateId: candidateId(node),
      label: nodeLabelOf(node),
    }));
  }

  function structureSiblingRows(root, nodeElement) {
    const indexes = parseNodePathKey(nodePathKeyOf(nodeElement, root));
    if (!indexes) return [];
    const parent = indexes.length > 1 ? walkByIndexes(root, indexes.slice(0, -1)) : null;
    const container = parent ? catchQuery(parent, ".el-tree-node__children") : root;
    return directTreeChildren(container).map((node) => ({
      element: node,
      nodePathKey: nodePathKeyOf(node, root),
      candidateId: candidateId(node),
      label: nodeLabelOf(node),
    }));
  }

  function siblingAdditionProbe(root, nodeRef, before) {
    const target = root ? resolveNodeRef(root, nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
    if (target.error) return { exact: false, error: target.error, siblings: [] };
    const siblings = structureSiblingRows(root, target.element);
    let previousIndex = 0;
    const added = [];
    const matched = [];
    for (let index = 0; index < siblings.length; index += 1) {
      const current = siblings[index];
      const previous = before[previousIndex];
      if (previous && current.candidateId === previous.candidateId && current.label === previous.label) {
        matched.push(index);
        previousIndex += 1;
      } else added.push({ ...current, index });
    }
    const anchorIndex = before.findIndex((item) => item.nodePathKey === nodeRef.nodePathKey && item.candidateId === nodeRef.candidateId);
    return {
      exact: siblings.length === before.length + 1 && previousIndex === before.length && added.length === 1
        && anchorIndex >= 0 && added[0].index === anchorIndex + 1,
      siblings,
      added,
    };
  }

  function childCreationProbe(root, nodeRef, before) {
    const target = root ? resolveNodeRef(root, nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
    if (target.error) return { exact: false, error: target.error, children: [] };
    const children = structureChildRows(root, target.element);
    const matched = new Set();
    let lastIndex = -1;
    for (const previous of before) {
      let matchIndex = -1;
      for (let index = lastIndex + 1; index < children.length; index += 1) {
        const current = children[index];
        const sameId = previous.candidateId || current.candidateId
          ? previous.candidateId === current.candidateId
          : previous.label === current.label;
        if (sameId && previous.label === current.label) { matchIndex = index; break; }
      }
      if (matchIndex < 0) return { exact: false, children, beforeCount: before.length, afterCount: children.length };
      matched.add(matchIndex);
      lastIndex = matchIndex;
    }
    const added = children.filter((_child, index) => !matched.has(index));
    return {
      exact: children.length === before.length + 1 && added.length === 1,
      children,
      added,
      beforeCount: before.length,
      afterCount: children.length,
    };
  }

  function childAdditionProbe(root, nodeRef, before, title) {
    const probe = childCreationProbe(root, nodeRef, before);
    return { ...probe, exact: probe.exact && probe.added[0].label === title };
  }

  function exactNewNodeEditor(root, nodePathKey, nodeId, requireNewMarker = true) {
    const indexes = parseNodePathKey(nodePathKey);
    const element = indexes ? walkByIndexes(root, indexes) : null;
    if (!element || !visible(element) || candidateId(element) !== nodeId
      || treeNodesOf(root).filter((node) => candidateId(node) === nodeId).length !== 1) {
      return { error: "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED" };
    }
    if (requireNewMarker && !catchQuery(nodeContentOf(element), ".name.new-add")) return { error: "REPORT_STRUCTURE_NEW_NODE_MARKER_UNVERIFIED" };
    const contentId = `content_${nodeId}`;
    const containers = [...document.querySelectorAll("[id]")].filter((item) => item.getAttribute("id") === contentId);
    const editors = visibleEditors().filter((editor) => editor.closest?.("[id]")?.getAttribute("id") === contentId);
    if (containers.length !== 1 || editors.length !== 1 || !safeContains(containers[0], editors[0])) {
      return { error: "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED" };
    }
    const framework = editorFrameworkOf(editors[0]);
    const view = framework.model;
    if (!view || !["prosemirror", "tiptap"].includes(framework.framework) || view.editable !== true
      || editors[0].getAttribute?.("contenteditable") !== "true" || !view.state?.doc
      || typeof view.state.doc.textContent !== "string" || typeof view.state.doc.eq !== "function") {
      return { error: "REPORT_STRUCTURE_TITLE_MODEL_UNAVAILABLE" };
    }
    return { element, editor: editors[0], view };
  }

  async function writeNewNodeTitle(root, created, title, writeState, timeoutMs) {
    if (!created?.candidateId || !created.nodePathKey || typeof title !== "string" || !title) return { ok: false, error: "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED" };
    let readinessError = "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED";
    let activationAttempted = false;
    const inspectCreatedEditor = () => {
      const freshRoot = findTreeRoot();
      if (!freshRoot) { readinessError = "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED"; return null; }
      const indexes = parseNodePathKey(created.nodePathKey);
      const element = indexes ? walkByIndexes(freshRoot, indexes) : null;
      if (!element || !visible(element)) { readinessError = "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED"; return null; }
      if (candidateId(element) !== created.candidateId
        || treeNodesOf(freshRoot).filter((node) => candidateId(node) === created.candidateId).length !== 1) {
        return { error: "REPORT_STRUCTURE_CREATED_ID_UNVERIFIED" };
      }
      if (!catchQuery(nodeContentOf(element), ".name.new-add")) {
        readinessError = "REPORT_STRUCTURE_NEW_NODE_MARKER_UNVERIFIED";
        return null;
      }
      const contentId = `content_${created.candidateId}`;
      const containers = [...document.querySelectorAll("[id]")].filter((item) => item.getAttribute("id") === contentId);
      if (containers.length > 1) return { error: "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED" };
      const editors = visibleEditors().filter((editor) => editor.closest?.("[id]")?.getAttribute("id") === contentId);
      if (editors.length > 1) return { error: "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED" };
      if (!containers.length || !editors.length) {
        readinessError = "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED";
        return null;
      }
      if (!safeContains(containers[0], editors[0])) return { error: "REPORT_STRUCTURE_TITLE_EDITOR_IDENTITY_UNVERIFIED" };
      const editor = editors[0];
      const framework = editorFrameworkOf(editor);
      if (!["prosemirror", "tiptap"].includes(framework.framework)) return { error: "REPORT_STRUCTURE_TITLE_MODEL_UNAVAILABLE" };
      const view = framework.model;
      const doc = view?.state?.doc;
      if (String(editor.textContent ?? "") !== "" || (doc && typeof doc.textContent === "string" && doc.textContent !== "")) {
        return { error: "REPORT_STRUCTURE_TITLE_EDITOR_NOT_EMPTY" };
      }
      if (!view || !doc || typeof doc.textContent !== "string" || typeof doc.eq !== "function") {
        readinessError = "REPORT_STRUCTURE_TITLE_MODEL_UNAVAILABLE";
        return null;
      }
      if (view.editable !== true || editor.getAttribute?.("contenteditable") !== "true") return { activationRequired: true, root: freshRoot, element, editor, view };
      const exact = exactNewNodeEditor(freshRoot, created.nodePathKey, created.candidateId);
      if (exact.error) return { error: exact.error };
      return exact;
    };
    let before = await waitForValue(inspectCreatedEditor, timeoutMs, 30);
    if (before?.error) return { ok: false, error: before.error };
    if (!before) return { ok: false, error: readinessError };
    if (before.activationRequired) {
      if (activationAttempted) return { ok: false, error: "REPORT_STRUCTURE_TITLE_ACTIVATION_UNVERIFIED" };
      activationAttempted = true;
      const originalDoc = before.view.state.doc;
      const findOpened = () => {
        const current = inspectCreatedEditor();
        if (!current || current.activationRequired) return null;
        if (current.error) return current;
        if (!current.view.state.doc.eq(originalDoc)) return { error: "REPORT_STRUCTURE_TITLE_MODEL_READBACK_MISMATCH" };
        return current;
      };
      let activation;
      try {
        activation = await openEditorByVerifiedDoubleClick(before.editor, before.view, originalDoc, timeoutMs, findOpened);
      } catch {
        writeState.uiStateChanged = true;
        return { ok: false, error: "REPORT_STRUCTURE_TITLE_ACTIVATION_FAILED" };
      }
      if (activation.ambiguous) return { ok: false, error: "REPORT_STRUCTURE_TITLE_ACTIVATION_AMBIGUOUS" };
      if (activation.handled) writeState.uiStateChanged = true;
      if (!activation.handled || !activation.opened) return { ok: false, error: "REPORT_STRUCTURE_TITLE_ACTIVATION_UNVERIFIED" };
      if (activation.opened.error) return { ok: false, error: activation.opened.error };
      before = activation.opened;
    }
    const beforeDoc = before.view.state.doc;
    if (beforeDoc.textContent !== "" || String(before.editor.textContent ?? "") !== "") return { ok: false, error: "REPORT_STRUCTURE_TITLE_EDITOR_NOT_EMPTY" };
    const typed = await execProseMirrorText({ mode: "append", replace: title }, before.editor, before.view, writeState);
    if (typed.error || typed.status !== "pendingVerify" || before.view.state.doc.textContent !== title || String(before.editor.textContent ?? "") !== title) {
      return { ok: false, error: typed.error || "REPORT_STRUCTURE_TITLE_MODEL_READBACK_MISMATCH" };
    }
    const titled = await waitForValue(() => {
      const freshRoot = findTreeRoot();
      const fresh = walkByIndexes(freshRoot, parseNodePathKey(created.nodePathKey));
      return fresh && visible(fresh) && candidateId(fresh) === created.candidateId && nodeLabelOf(fresh) === title
        ? { root: freshRoot, element: fresh } : null;
    }, timeoutMs, 30);
    if (!titled) return { ok: false, error: "REPORT_STRUCTURE_TITLE_NODE_READBACK_MISMATCH" };
    let current = exactNewNodeEditor(titled.root, created.nodePathKey, created.candidateId, false);
    if (current.error || current.view.state.doc.textContent !== title || String(current.editor.textContent ?? "") !== title) {
      return { ok: false, error: current.error || "REPORT_STRUCTURE_TITLE_MODEL_READBACK_MISMATCH" };
    }
    const links = editorLinksOf(current.editor);
    const saveLink = links.found.find((item) => item.link === "save")?.element;
    const closeLink = links.found.find((item) => item.link === "close")?.element;
    if (links.missing.length || !saveLink || !closeLink) return { ok: false, error: "REPORT_STRUCTURE_TITLE_EDITOR_CONTROLS_UNVERIFIED" };
    const priorToasts = new Set([...document.querySelectorAll(".el-message,.el-notification,[role='alert']")]);
    if (!dispatchRealClick(saveLink)) return { ok: false, error: "REPORT_STRUCTURE_TITLE_SAVE_CLICK_FAILED" };
    const saveToast = await waitForValue(() => [...document.querySelectorAll(".el-message,.el-notification,[role='alert']")]
      .find((item) => !priorToasts.has(item) && visible(item) && text(item, 80).includes("保存成功")) || null, timeoutMs, 40);
    if (!saveToast || current.view.state.doc.textContent !== title) return { ok: false, error: "REPORT_STRUCTURE_TITLE_SAVE_UNVERIFIED" };
    current = exactNewNodeEditor(findTreeRoot(), created.nodePathKey, created.candidateId, false);
    if (current.error || current.view.state.doc.textContent !== title || nodeLabelOf(current.element) !== title) {
      return { ok: false, error: current.error || "REPORT_STRUCTURE_TITLE_READBACK_MISMATCH" };
    }
    const refreshedLinks = editorLinksOf(current.editor);
    const refreshedClose = refreshedLinks.found.find((item) => item.link === "close")?.element;
    if (refreshedLinks.missing.length || !refreshedClose || !dispatchRealClick(refreshedClose)) {
      return { ok: false, error: "REPORT_STRUCTURE_TITLE_CLOSE_CLICK_FAILED" };
    }
    const closeOutcome = await waitForValue(() => {
      const dialog = [...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible);
      if (dialog) return { dialog };
      const exactEditors = visibleEditors().filter((editor) => editor.closest?.("[id]")?.getAttribute("id") === `content_${created.candidateId}`);
      if (!exactEditors.length) return { closed: true };
      if (exactEditors.length !== 1) return { ambiguous: true };
      const editor = exactEditors[0];
      const model = editorFrameworkOf(editor).model;
      if (model?.editable === false && editor.getAttribute?.("contenteditable") === "false" && editorLinksOf(editor).missing.length === 3) return { closed: true };
      return null;
    }, timeoutMs, 40);
    if (!closeOutcome || closeOutcome.dialog || closeOutcome.ambiguous || !closeOutcome.closed) {
      return { ok: false, error: closeOutcome?.dialog ? "REPORT_STRUCTURE_TITLE_CLOSE_CONFIRMATION_REQUIRED" : "REPORT_STRUCTURE_TITLE_CLOSE_UNVERIFIED" };
    }
    const finalRoot = findTreeRoot();
    const finalNode = walkByIndexes(finalRoot, parseNodePathKey(created.nodePathKey));
    if (!finalNode || candidateId(finalNode) !== created.candidateId || nodeLabelOf(finalNode) !== title || before.view.state.doc.textContent !== title) {
      return { ok: false, error: "REPORT_STRUCTURE_TITLE_FINAL_READBACK_MISMATCH" };
    }
    return { ok: true, createdNodeRef: { nodePathKey: created.nodePathKey, candidateId: created.candidateId, label: title }, evidence: { exactContentId: true, modelInput: true, saveToastVerified: true, editorClosed: true } };
  }

  async function execStructure(op, element, root, writeState, requestedTimeoutMs) {
    if (op.kind === "structure_delete" && !op.opConfirm) return { status: "failed", error: "REPORT_OP_CONFIRM_REQUIRED" };
    const siblingInlineAdd = (op.treeSnapshotKind || op.kind) === "structure_add_sibling" && op.kind === "structure_add";
    const timeoutMs = op.kind === "structure_add_child" || siblingInlineAdd ? clampTimeout(requestedTimeoutMs ?? 1800) : clampTimeout(undefined);
    const editMode = await enterTreeEditMode(root, timeoutMs);
    if (!editMode.ok) return { status: "failed", error: editMode.error };
    root = findTreeRoot();
    const refreshed = root ? resolveNodeRef(root, op.nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
    if (refreshed.error) return { status: "failed", error: refreshed.error };
    element = refreshed.element;
    const operationKind = op.treeSnapshotKind || op.kind;
    const currentTree = op.treeSnapshot ? treeSnapshotForOperation(root, element, op.nodeRef, operationKind, op.index, op.position) : null;
    if (op.treeSnapshot && JSON.stringify(currentTree) !== JSON.stringify(op.treeSnapshot)) return { status: "failed", error: "REPORT_TREE_CHANGED" };
    if (!isNodeSelected(element)) {
      const selected = await selectNode(element, timeoutMs);
      if (!selected.ok) return { status: "failed", error: selected.error };
    }
    root = findTreeRoot();
    const selectedTarget = root ? resolveNodeRef(root, op.nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
    if (selectedTarget.error) return { status: "failed", error: selectedTarget.error };
    element = selectedTarget.element;
    const indexes = parseNodePathKey(op.nodeRef.nodePathKey);
    const childScope = op.kind === "structure_add_child" || op.kind === "structure_add" && op.position === "child";
    const contextIndexes = childScope ? indexes : indexes.slice(0, -1);
    const beforeLabels = childScope ? childrenLabels(root, indexes) : (siblingLabels(root, contextIndexes) || []);
    const beforeChildRows = op.kind === "structure_add_child" ? structureChildRows(root, element) : [];
    const beforeSiblingRows = siblingInlineAdd ? structureSiblingRows(root, element) : [];
    if (op.kind === "structure_add_child" && beforeChildRows.some((child) => child.label === op.title)) {
      return { status: "failed", error: "REPORT_NODE_ALREADY_EXISTS" };
    }
    const controlKind = op.kind === "structure_move" ? `structure_move_${op.direction === "down" ? "down" : "up"}` : op.kind;
    // 真实页面语义：结构操作优先点击节点行内图标（⊕/复制/🗑），行内不可用时回退工具栏
    const inlineKind = op.kind === "structure_add" ? (op.position === "child" ? "add-child" : "add-sibling")
      : op.kind === "structure_copy" ? "copy"
      : op.kind === "structure_delete" ? "delete"
      : null;
    let control = null;
    let via = null;
    if (op.kind === "structure_add_child") {
      const inline = inlineIconOf(element, "add-child");
      if (inline?.element) { control = inline.element; via = "inline-icon"; }
      else if (inline?.disabled) return { status: "failed", error: "REPORT_CONTROL_DISABLED" };
      else return { status: "failed", error: inline?.error || "REPORT_STRUCTURE_CONTROL_NOT_FOUND" };
    } else if (inlineKind) {
      const inline = inlineIconOf(element, inlineKind);
      if (inline?.element) { control = inline.element; via = "inline-icon"; }
      else if (inline?.disabled) return { status: "failed", error: "REPORT_CONTROL_DISABLED" };
      else if (inline?.error) return { status: "failed", error: inline.error };
    }
    if (!control && op.kind !== "structure_add_child") {
      control = findStructureControl(controlKind);
      if (control) via = "toolbar";
    }
    if (!control) {
      if (op.kind === "structure_add_child") return { status: "failed", error: "REPORT_STRUCTURE_CONTROL_NOT_FOUND" };
      const toolbars = toolbarElements();
      const presentDisabled = toolbars.some((toolbar) => [...toolbar.querySelectorAll("button,[role='button']")].some((item) => visible(item) && isControlDisabled(item) && STRUCTURE_CONTROL_PATTERNS[controlKind].test(controlLabel(item))));
      return { status: "failed", error: presentDisabled ? "REPORT_CONTROL_DISABLED" : "REPORT_STRUCTURE_CONTROL_NOT_FOUND" };
    }
    if (op.kind === "structure_delete" && [...document.querySelectorAll(".el-dialog,[role='dialog']")].some(visible)) {
      return { status: "failed", error: "REPORT_STRUCTURE_UNRELATED_DIALOG_OPEN" };
    }
    if (["structure_add", "structure_add_child"].includes(op.kind)
      && [...document.querySelectorAll(".el-dialog,[role='dialog']")].some(visible)) {
      return { status: "failed", error: "REPORT_STRUCTURE_UNRELATED_DIALOG_OPEN" };
    }
    writeState.started = true;
    if (!dispatchRealClick(control)) return { status: "failed", error: "REPORT_CONTROL_CLICK_FAILED" };
    if (siblingInlineAdd && via === "inline-icon") {
      const signal = await waitForValue(() => {
        const dialog = [...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible);
        if (dialog) return { dialog };
        const probe = siblingAdditionProbe(findTreeRoot(), op.nodeRef, beforeSiblingRows);
        return probe.exact ? { probe } : null;
      }, timeoutMs, 25);
      if (!signal) return { status: "pendingVerify", error: "REPORT_STRUCTURE_ADD_SIBLING_TIMEOUT" };
      if (signal.probe) {
        const created = signal.probe.added[0];
        const titleWrite = await writeNewNodeTitle(findTreeRoot(), created, op.title, writeState, timeoutMs);
        const finalProbe = siblingAdditionProbe(findTreeRoot(), op.nodeRef, beforeSiblingRows);
        return {
          status: "pendingVerify",
          ...(!titleWrite.ok ? { error: titleWrite.error } : !finalProbe.exact || finalProbe.added[0]?.label !== op.title ? { error: "REPORT_STRUCTURE_TITLE_READBACK_MISMATCH" } : {}),
          readback: {
            exact: Boolean(titleWrite.ok && finalProbe.exact && finalProbe.added[0]?.label === op.title),
            anchorNodeRef: { ...op.nodeRef },
            siblingCountBefore: beforeSiblingRows.length,
            siblingCountAfter: finalProbe.siblings.length,
            siblings: finalProbe.siblings.map(({ nodePathKey, candidateId, label }) => ({ nodePathKey, candidateId, label })),
            ...(titleWrite.ok ? { titleWrite: titleWrite.evidence } : {}),
            via,
          },
          createdNodeRef: titleWrite.createdNodeRef || { nodePathKey: created.nodePathKey, label: created.label, candidateId: created.candidateId },
        };
      }
      const dialog = await fillStructureDialog(op, timeoutMs);
      if (!dialog.ok) return { status: "pendingVerify", error: dialog.error };
    } else if (op.kind === "structure_add" || (op.kind === "structure_copy" && (op.title || via === "toolbar"))) {
      const dialog = await fillStructureDialog(op, timeoutMs);
      if (!dialog.ok) return { status: writeState.started ? "pendingVerify" : "failed", error: dialog.error };
    }
    if (op.kind === "structure_add_child") {
      const signal = await waitForValue(() => {
        const dialog = [...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible);
        if (dialog) return { dialog };
        const probe = childCreationProbe(findTreeRoot(), op.nodeRef, beforeChildRows);
        return probe.exact ? { probe } : null;
      }, timeoutMs, 25);
      if (!signal) return { status: "pendingVerify", error: "REPORT_STRUCTURE_ADD_CHILD_TIMEOUT" };
      if (signal.probe) {
        const created = signal.probe.added[0];
        const titleWrite = await writeNewNodeTitle(findTreeRoot(), created, op.title, writeState, timeoutMs);
        const finalProbe = childAdditionProbe(findTreeRoot(), op.nodeRef, beforeChildRows, op.title);
        return {
          status: "pendingVerify",
          ...(!titleWrite.ok ? { error: titleWrite.error } : !finalProbe.exact ? { error: "REPORT_STRUCTURE_TITLE_READBACK_MISMATCH" } : {}),
          readback: {
            exact: Boolean(titleWrite.ok && finalProbe.exact),
            parentNodeRef: { ...op.nodeRef },
            childCountBefore: beforeChildRows.length,
            childCountAfter: finalProbe.afterCount,
            children: finalProbe.children.map(({ nodePathKey, candidateId, label }) => ({ nodePathKey, candidateId, label })),
            ...(titleWrite.ok ? { titleWrite: titleWrite.evidence } : {}),
            via,
          },
          createdNodeRef: titleWrite.createdNodeRef || { nodePathKey: created.nodePathKey, label: created.label, candidateId: created.candidateId },
        };
      }
      const dialog = await fillStructureDialog(op, timeoutMs);
      if (!dialog.ok) return { status: writeState.started ? "pendingVerify" : "failed", error: dialog.error };
      const verified = await waitForValue(() => {
        const freshRoot = findTreeRoot();
        const probe = childAdditionProbe(freshRoot, op.nodeRef, beforeChildRows, op.title);
        return probe.exact ? probe : null;
      }, timeoutMs, 25);
      const freshRoot = findTreeRoot();
      const finalProbe = childAdditionProbe(freshRoot, op.nodeRef, beforeChildRows, op.title);
      if (!verified) {
        const changed = finalProbe.afterCount !== beforeChildRows.length;
        return {
          status: "pendingVerify",
          error: changed ? "REPORT_TREE_READBACK_MISMATCH" : finalProbe.error || "REPORT_STRUCTURE_ADD_CHILD_TIMEOUT",
          readback: {
            exact: false,
            childCountBefore: beforeChildRows.length,
            childCountAfter: finalProbe.afterCount,
            children: finalProbe.children.map(({ nodePathKey, candidateId, label }) => ({ nodePathKey, candidateId, label })),
            via,
          },
        };
      }
      const created = verified.added[0];
      return {
        status: "saved",
        readback: {
          exact: true,
          parentNodeRef: { ...op.nodeRef },
          childCountBefore: verified.beforeCount,
          childCountAfter: verified.afterCount,
          children: verified.children.map(({ nodePathKey, candidateId, label }) => ({ nodePathKey, candidateId, label })),
          via,
        },
        createdNodeRef: { nodePathKey: created.nodePathKey, label: created.label, candidateId: created.candidateId },
      };
    }
    if (op.kind === "structure_delete" && via === "inline-icon") {
      const confirmed = await confirmDeleteDialog(clampTimeout(undefined), op.nodeRef.label);
      if (!confirmed.ok) return { status: "failed", error: confirmed.error };
    }
    const freshRoot = findTreeRoot();
    if (!freshRoot) return { status: "pendingVerify", error: "REPORT_TREE_NOT_FOUND" };
    // 即时回读：按同级标题顺序比对预期变换
    const afterElement = walkByIndexes(freshRoot, indexes);
    const afterLabels = childScope
      ? (afterElement ? childrenLabels(freshRoot, indexes) : [])
      : (siblingLabels(freshRoot, contextIndexes) || []);
    const expected = expectedSiblingOrder(beforeLabels, childScope ? beforeLabels.length : indexes[indexes.length - 1], op);
    if (op.kind === "structure_delete") {
      // 存在同名兄弟时按预期顺序精确比对，否则按"label 消失"判定
      const expectedAfterDelete = beforeLabels.filter((item, position) => position !== indexes[indexes.length - 1]);
      const gone = JSON.stringify(afterLabels) === JSON.stringify(expectedAfterDelete)
        || (beforeLabels.length !== afterLabels.length && !afterLabels.includes(op.nodeRef.label));
      return { status: gone ? "saved" : "pendingVerify", readback: { labels: afterLabels.slice(0, 10), via } };
    }
    // 行内复制不经过对话框，页面用"（副本）/+1"等副本标记命名：按"原位之后多出一个以原标签开头的新节点"宽松回读
    if (op.kind === "structure_copy" && expected === null) {
      const at = indexes[indexes.length - 1];
      const copyLabel = afterLabels[at + 1] || "";
      const copied = afterLabels.length === beforeLabels.length + 1 && copyLabel.startsWith(op.nodeRef.label);
      const result = { status: copied ? "saved" : "pendingVerify", readback: { labels: afterLabels.slice(0, 10), via } };
      if (copied) {
        const freshIndexes = [...indexes.slice(0, -1), at + 1];
        const created = walkByIndexes(freshRoot, freshIndexes);
        if (created && nodeLabelOf(created) === copyLabel) {
          result.createdNodeRef = { nodePathKey: freshIndexes.join("/"), label: copyLabel, candidateId: candidateId(created) };
        }
      }
      return result;
    }
    if (expected === null) return { status: "pendingVerify", readback: { labels: afterLabels.slice(0, 10), via } };
    const verified = JSON.stringify(afterLabels) === JSON.stringify(expected);
    const result = { status: verified ? "saved" : "pendingVerify", readback: { labels: afterLabels.slice(0, 10), via } };
    // structure_add：回读新节点的 nodePathKey，方便调用方定位
    if (verified && op.kind === "structure_add" && afterElement) {
      const freshIndexes = childScope ? [...indexes, afterLabels.length - 1] : [...indexes.slice(0, -1), indexes[indexes.length - 1] + (op.position === "before" ? 0 : 1)];
      const created = walkByIndexes(freshRoot, freshIndexes);
      if (created && nodeLabelOf(created) === op.title) {
        result.createdNodeRef = { nodePathKey: freshIndexes.join("/"), label: nodeLabelOf(created), candidateId: candidateId(created) };
      }
    }
    return result;
  }

  async function execute(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    if (payload.writeAuthorized !== true) return reject("REPORT_WRITE_NOT_AUTHORIZED");
    const planHash = typeof payload.planHash === "string" ? payload.planHash : "";
    if (!planHash) return reject("REPORT_PLAN_INVALID");
    if (consumedPlans.has(planHash)) return reject("REPORT_PLAN_ALREADY_EXECUTED");
    const plan = planRegistry.get(planHash);
    if (!plan) return reject("REPORT_PLAN_STALE");
    const expectedConfirmation = plan.ops.every((op) => op.kind.startsWith("structure_")) ? CONFIRM_STRUCTURE_TEXT : CONFIRM_EXECUTE_TEXT;
    if (payload.confirmText !== expectedConfirmation) return reject("REPORT_CONFIRM_TEXT_INVALID");
    if (JSON.stringify(identity()) !== JSON.stringify(plan.reportIdentity)) return reject("REPORT_PLAN_STALE");
    if (pageContentSnapshot() !== plan.contentSnapshot) return reject("REPORT_CONTENT_CHANGED");
    consumedPlans.add(planHash);
    const results = [];
    let stop = false;
    let executed = 0;
    let settingsSubmissionAttempted;
    let settingsDocumentTimeOrigin;
    let settingsExpectedFields;
    const writeState = { started: false, uiStateChanged: false };
    for (const op of plan.ops) {
      if (stop) { results.push({ index: op.index, status: "skipped" }); continue; }
      let outcome;
      const root = findTreeRoot();
      const resolved = root ? resolveNodeRef(root, op.nodeRef) : { error: "REPORT_TREE_NOT_FOUND" };
      if (resolved.error) outcome = { status: "failed", error: resolved.error };
      else if (op.treeSnapshot) {
        const dialog = op.treeSnapshotKind === "settings_write" ? findSettingsDialog() : null;
        const currentFields = dialog ? readSettingsFields(dialog).filter((field) => op.fields?.some((wanted) => wanted.label === field.label)) : null;
        const current = treeSnapshotForOperation(root, resolved.element, op.nodeRef, op.treeSnapshotKind || op.kind, op.index, op.position, currentFields);
        outcome = JSON.stringify(current) === JSON.stringify(op.treeSnapshot)
          ? null
          : { status: "failed", error: "REPORT_TREE_CHANGED" };
      }
      if (!outcome && op.kind === "settings_open") outcome = await execSettingsOpen(op, resolved.element, root, writeState);
      else if (!outcome && op.kind === "settings_write") outcome = await execSettingsWrite(op, resolved.element, root, writeState);
      else if (!outcome && op.kind === "editor_text") {
        const association = locateEditorForNode(resolved.element);
        let sameModel = !op.modelSnapshot;
        if (op.modelSnapshot && association.ok) {
          try { sameModel = Boolean(editorFrameworkOf(association.element).model?.state?.doc?.eq(op.modelSnapshot)); } catch { sameModel = false; }
        }
        outcome = sameModel ? await execEditorText(op, resolved.element, writeState) : { status: "failed", error: "REPORT_CONTENT_CHANGED" };
      }
      else if (!outcome && op.kind === "editor_command") outcome = await execInlineFormat(op, resolved.element, writeState);
      else if (!outcome && op.kind === "structure_add_child") {
        const report = identity() || {};
        const lockKey = [report.projectId, report.companyId, report.reportType, report.mode, report.reportDetailId || "", op.nodeRef.candidateId].join(":");
        if (activeChildAddTargets.has(lockKey)) outcome = { status: "failed", error: "REPORT_STRUCTURE_ADD_CHILD_IN_PROGRESS" };
        else {
          activeChildAddTargets.add(lockKey);
          try { outcome = await execStructure(op, resolved.element, root, writeState, payload.timeoutMs); }
          finally { activeChildAddTargets.delete(lockKey); }
        }
      }
      else if (!outcome) outcome = await execStructure(op, resolved.element, root, writeState);
      executed += 1;
      const entry = { index: op.index, kind: op.kind, status: outcome.status === "saved" ? "pendingVerify" : outcome.status };
      if (outcome.error) entry.error = outcome.error;
      if (outcome.readback) entry.readback = outcome.readback;
      if (typeof outcome.submissionAttempted === "boolean") settingsSubmissionAttempted = outcome.submissionAttempted;
      if (Number.isFinite(outcome.documentTimeOrigin) && outcome.documentTimeOrigin > 0) settingsDocumentTimeOrigin = outcome.documentTimeOrigin;
      if (Array.isArray(outcome.expectedFields)) settingsExpectedFields = outcome.expectedFields;
      if (outcome.linkage) entry.linkage = outcome.linkage;
      if (outcome.createdNodeRef) entry.createdNodeRef = outcome.createdNodeRef;
      results.push(entry);
      if (outcome.status === "failed" || outcome.status === "pendingVerify" || outcome.status === "saved") stop = true;
    }
    const failed = results.some((item) => item.status === "failed" || item.status === "pendingVerify");
    const pending = results.some((item) => item.status === "pendingVerify");
    return {
      ok: !failed,
      action: "report_execute",
      ...(pending ? { status: "pendingVerify", reason: "REPORT_PERSISTENCE_UNVERIFIED" } : {}),
      executed,
      results,
      planHash,
      planHashConsumed: true,
      ...(typeof settingsSubmissionAttempted === "boolean" ? { submissionAttempted: settingsSubmissionAttempted } : {}),
      ...(Number.isFinite(settingsDocumentTimeOrigin) ? { documentTimeOrigin: settingsDocumentTimeOrigin } : {}),
      ...(settingsExpectedFields ? { expectedFields: settingsExpectedFields } : {}),
      contentHashAfter: pageContentHash(),
      security: { readOnly: !writeState.started && !writeState.uiStateChanged, writesPerformed: writeState.started, uiStateChanged: writeState.uiStateChanged, credentialsReturned: false },
    };
  }

  // ———— save ————
  function resourceEntryNames() {
    try {
      if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return [];
      return performance.getEntriesByType("resource").map((entry) => String(entry?.name || ""));
    } catch {
      return [];
    }
  }

  function urlPathOnly(name) {
    return String(name || "").replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").split("?")[0].split("#")[0];
  }

  function saveToastText() {
    for (const element of [...document.querySelectorAll(".el-message,.el-notification,[role='alert']")]) {
      if (!visible(element)) continue;
      const value = text(element, 80);
      if (value.includes("保存成功")) return value;
    }
    return "";
  }

  async function save(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    if (payload.writeAuthorized !== true) return reject("REPORT_WRITE_NOT_AUTHORIZED");
    if (payload.confirmText !== CONFIRM_SAVE_TEXT) return reject("REPORT_CONFIRM_TEXT_INVALID");
    return reject("REPORT_SAVE_TARGET_UNVERIFIED");
  }

  // ———— 编辑器生命周期：open / command / save / close ————
  // 解析编辑器动作的目标节点：nodeRef 提供则复验；否则取当前选中节点
  function resolveEditorContext(payload, root) {
    if (payload.nodeRef) {
      const resolved = resolveNodeRef(root, payload.nodeRef);
      if (resolved.error) return { error: resolved.error, nodeRef: payload.nodeRef };
      return {
        element: resolved.element,
        nodeRef: { nodePathKey: payload.nodeRef.nodePathKey, label: payload.nodeRef.label, candidateId: resolved.candidateId },
      };
    }
    const selected = treeNodesOf(root).find(isNodeSelected);
    if (!selected) return { error: "REPORT_NODE_NOT_SELECTED" };
    return {
      element: selected,
      nodeRef: { nodePathKey: nodePathKeyOf(selected, root), label: nodeLabelOf(selected), candidateId: candidateId(selected) },
    };
  }

  // 编辑框上方的"关闭 | 保存 | 预览"三链接（与节点的关联经 DOM 邻近判定：编辑元素的直接容器）
  function editorLinksOf(editorElement) {
    const wanted = [["close", /^关闭$/], ["save", /^保存$/], ["preview", /^预览$/]];
    const editors = visibleEditors();
    let scope = editorElement?.parentElement || null;
    for (let depth = 0; depth < 4 && scope && scope !== document.body; depth += 1, scope = scope.parentElement) {
      if (editors.filter((element) => safeContains(scope, element)).length !== 1) break;
      const found = [];
      for (const [key, pattern] of wanted) {
        const candidates = [...scope.querySelectorAll("a,button,[role='button'],span")].filter((control) => visible(control) && !isControlDisabled(control) && pattern.test(text(control, 20)));
        if (candidates.length === 1) found.push({ link: key, element: candidates[0] });
      }
      if (found.length === wanted.length) return { found, missing: [], scope };
    }
    return { found: [], missing: wanted.map(([key]) => key), scope: null };
  }

  function editorControlDiagnostics(editorElement) {
    const editors = visibleEditors();
    const output = [];
    let scope = editorElement?.parentElement || null;
    for (let depth = 1; depth <= 8 && scope && scope !== document.body; depth += 1, scope = scope.parentElement) {
      if (editors.filter((editor) => safeContains(scope, editor)).length !== 1) break;
      const counts = { edit: 0, save: 0, close: 0, preview: 0 };
      for (const control of [...scope.querySelectorAll("a,button,[role='button']")]) {
        if (!visible(control) || isControlDisabled(control)) continue;
        const label = controlLabel(control);
        if (label === "编辑") counts.edit += 1;
        if (label === "保存") counts.save += 1;
        if (label === "关闭") counts.close += 1;
        if (label === "预览") counts.preview += 1;
      }
      output.push({ depth, ...counts });
    }
    return output;
  }

  function editorActivationDiagnostics(editorElement) {
    const editors = visibleEditors();
    const output = [];
    const hitTest = { paragraphCount: 0, center: "unavailable", hitTag: null, interactive: null };
    try {
      hitTest.paragraphCount = [...editorElement.querySelectorAll("p")].filter(visible).length;
      const rect = editorElement.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) hitTest.center = "offscreen";
      else {
        const hit = document.elementFromPoint(x, y);
        hitTest.center = !hit ? "none" : hit === editorElement ? "editor" : safeContains(editorElement, hit) ? "descendant" : safeContains(hit, editorElement) ? "ancestor" : "other";
        const tag = String(hit?.tagName || "").toLowerCase();
        hitTest.hitTag = ["span", "p", "div", "a", "button", "input", "svg", "img"].includes(tag) ? tag : null;
        hitTest.interactive = hit ? Boolean(hit.closest?.("a,button,input,[role='button'],[data-field],[data-formula]")) : null;
      }
    } catch { hitTest.center = "unavailable"; }
    const handlerPresent = (element, name) => {
      try {
        const property = `on${name}`;
        const propName = { click: "onClick", dblclick: "onDoubleClick", mousedown: "onMouseDown", pointerdown: "onPointerDown", focus: "onFocus", focusin: "onFocusIn" }[name];
        const vueName = `on${name[0].toUpperCase()}${name.slice(1)}`;
        const vue = element.__vue__;
        const vnodeProps = element.__vueParentComponent?.vnode?.props;
        const reactProps = Object.getOwnPropertyNames(element).filter((key) => /^__reactProps\$/.test(key)).slice(0, 2).map((key) => element[key]);
        const invokers = Object.getOwnPropertySymbols(element).filter((key) => String(key.description || "") === "_vei").slice(0, 2).map((key) => element[key]);
        return typeof element[property] === "function" || Boolean(vue?.$listeners?.[name]) || Boolean(vnodeProps?.[propName]) || Boolean(vnodeProps?.[vueName])
          || reactProps.some((props) => typeof props?.[propName] === "function")
          || invokers.some((map) => map && typeof map === "object" && Object.keys(map).some((key) => [propName, vueName].some((prefix) => key === prefix || key.startsWith(`${prefix}Once`) || key.startsWith(`${prefix}Capture`) || key.startsWith(`${prefix}Passive`))));
      } catch { return false; }
    };
    const names = ["click", "dblclick", "mousedown", "pointerdown", "focus", "focusin"];
    let element = editorElement;
    for (let depth = 0; depth < 12 && element && element !== document.body; depth += 1, element = element.parentElement) {
      const associatedEditorCount = editors.filter((editor) => safeContains(element, editor)).length;
      const handlers = {};
      let componentMethods = [];
      for (const name of names) handlers[name] = handlerPresent(element, name);
      try {
        const vue = element.__vue__;
        const component = element.__vueParentComponent;
        const containers = [vue?.$options?.methods, component?.type?.methods, component?.setupState];
        componentMethods = [...new Set(containers.flatMap((value) => value && typeof value === "object" ? Object.keys(value) : []))]
          .filter((key) => /^[A-Za-z_$][A-Za-z0-9_$]{0,59}$/.test(key) && /edit|focus|open|click|lock/i.test(key) && !/token|cookie|auth|secret|password/i.test(key))
          .slice(0, 20);
      } catch { componentMethods = []; }
      output.push({ depth, associatedEditorCount, handlers, componentMethods });
    }
    const descendantHandlers = [];
    try {
      for (const element of [...editorElement.querySelectorAll("p,span")].slice(0, 100)) {
        const handlers = Object.fromEntries(names.map((name) => [name, handlerPresent(element, name)]));
        if (Object.values(handlers).some(Boolean)) descendantHandlers.push({ tag: String(element.tagName || "").toLowerCase(), handlers });
        if (descendantHandlers.length >= 20) break;
      }
    } catch {}
    return { evidenceOnly: true, hitTest, ancestors: output, descendantHandlers };
  }

  function editorToolbarDiagnostics(editorElement) {
    const editors = visibleEditors();
    let scope = editorElement?.parentElement || null;
    const containers = [];
    const knownLabels = new Set([...Object.values(EDITOR_COMMAND_LABELS).flat(), "粗体", "字体", "字号", "字体大小", "文字颜色", "高亮", "正文格式", "文本格式", "左对齐", "居中对齐", "右对齐", "两端对齐"]);
    for (let depth = 1; depth <= 8 && scope && scope !== document.body; depth += 1, scope = scope.parentElement) {
      if (editors.filter((editor) => safeContains(scope, editor)).length !== 1) break;
      const candidates = [...scope.querySelectorAll("button,[role='button'],svg,i,[data-tippy-content],[data-tooltip]")]
        .filter((element) => visible(element) && !safeContains(editorElement, element)).slice(0, 80);
      const controls = candidates.map((element) => {
        const tag = String(element.tagName || "").toLowerCase();
        const classes = safeClassNames(element).filter((value) => !/(?:token|cookie|auth|secret|password)/i.test(value));
        const attrs = typeof element.getAttributeNames === "function" ? element.getAttributeNames().filter((name) => /^(?:role|aria-label|title|data-[a-z0-9-]+)$/.test(name) && !/(?:token|cookie|auth|secret|password)/i.test(name)).slice(0, 12) : [];
        const parents = [];
        let parent = element.parentElement;
        for (let level = 0; level < 3 && parent && parent !== scope; level += 1, parent = parent.parentElement) {
          const attrNames = typeof parent.getAttributeNames === "function" ? parent.getAttributeNames().filter((name) => /^(?:role|aria-[a-z-]+|title|data-[a-z0-9-]+)$/.test(name) && !/(?:token|cookie|auth|secret|password)/i.test(name)).slice(0, 12) : [];
          const labelHints = [];
          for (const attribute of ["aria-label", "title", "data-tooltip", "data-tippy-content"]) {
            const value = String(parent.getAttribute?.(attribute) || "").trim();
            if (knownLabels.has(value) && !labelHints.includes(value)) labelHints.push(value);
          }
          try {
            const propSets = [parent.__vueParentComponent?.props, parent.__vueParentComponent?.vnode?.props, parent.__vue__?.$props];
            for (const props of propSets) for (const key of ["content", "title", "tooltip", "ariaLabel", "label"]) {
              const value = typeof props?.[key] === "string" ? props[key].trim() : "";
              if (knownLabels.has(value) && !labelHints.includes(value)) labelHints.push(value);
            }
          } catch {}
          const commandHints = nativeCommandHints(parent);
          parents.push({ tag: String(parent.tagName || "").toLowerCase(), classes: safeClassNames(parent).filter((value) => !/(?:token|cookie|auth|secret|password)/i.test(value)), attrNames, labelHints, commandHints });
        }
        return { tag, classes, attrs, ...controlSemanticHints(element, knownLabels), parents };
      });
      containers.push({ depth, controls });
    }
    return { evidenceOnly: true, containers };
  }

  function editorToolbarOf(editorElement) {
    const scope = editorElement?.parentElement;
    const local = scope && typeof scope.querySelectorAll === "function"
      ? [...scope.querySelectorAll("[role='toolbar'],.editor-toolbar,.el-tiptap-editor__menu-bar")].find(visible)
      : null;
    if (local) return local;
    // 真实页面工具栏可能与编辑框同级邻近：仅当全局唯一工具栏时才认定归属，避免误点无关工具栏
    const globals = toolbarElements();
    return globals.length === 1 ? globals[0] : null;
  }

  function detectToolbarCommands(toolbar) {
    const found = [];
    if (!toolbar) return found;
    for (const control of [...toolbar.querySelectorAll("button,[role='button'],.el-tiptap-editor__command-button")]) {
      if (!visible(control)) continue;
      for (const command of Object.keys(EDITOR_COMMAND_LABELS)) {
        if (controlMatchesEditorCommand(control, command) && !found.includes(command)) found.push(command);
      }
    }
    return found;
  }

  async function openEditorByVerifiedDoubleClick(editorElement, view, originalDoc, timeoutMs, findOpened) {
    const evidence = editorActivationDiagnostics(editorElement);
    const handlers = evidence.ancestors.filter((item) => item.associatedEditorCount === 1 && item.handlers.dblclick);
    if (handlers.length > 1) return { handled: true, ambiguous: true };
    editorElement.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "instant" });
    if (!view.state.doc.eq(originalDoc)) throw new Error("model changed");
    const rect = editorElement.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = point.x >= 0 && point.y >= 0 && point.x < window.innerWidth && point.y < window.innerHeight ? document.elementFromPoint(point.x, point.y) : null;
    if (handlers.length !== 1 || !hit || !["p", "span"].includes(String(hit.tagName || "").toLowerCase()) || !safeContains(editorElement, hit)
      || hit.closest("a,button,input,[role='button'],[data-field],[data-formula]")) return { handled: false };
    let opened = null;
    for (const detail of [1, 2]) {
      if (!dispatchRealClick(hit, point, detail)) throw new Error("click failed");
      if (!view.state.doc.eq(originalDoc)) throw new Error("model changed");
      opened = findOpened();
      if (opened) break;
    }
    if (!opened) {
      if (!view.state.doc.eq(originalDoc) || view.editable !== false) throw new Error("editor changed");
      hit.dispatchEvent(mouseEvent("dblclick", point, 2));
      opened = await waitForValue(findOpened, timeoutMs, 40);
    }
    if (!opened && (!view.state.doc.eq(originalDoc) || view.editable !== false)) throw new Error("editor changed");
    return { handled: true, opened };
  }

  async function editorOpen(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const ctx = resolveEditorContext(payload, root);
    if (ctx.error) return { ...reject(ctx.error), nodeRef: payload.nodeRef || null };
    const initialAssociation = locateEditorForNode(ctx.element);
    const initialView = initialAssociation.ok ? editorFrameworkOf(initialAssociation.element).model : null;
    const originalDoc = initialView?.state?.doc || null;
    const modelUnchanged = () => {
      try {
        const association = locateEditorForNode(ctx.element);
        const currentView = association.ok ? editorFrameworkOf(association.element).model : null;
        return Boolean(originalDoc && typeof originalDoc.eq === "function" && initialView?.state?.doc?.eq(originalDoc) && currentView?.state?.doc?.eq(originalDoc));
      } catch { return false; }
    };
    // 真实点击节点内容打开编辑框
    const directlyAssociated = initialAssociation.ok && ["node-id-token", "node-id"].includes(initialAssociation.association) && Boolean(ctx.nodeRef.candidateId);
    if (!directlyAssociated) {
      const selected = await selectNode(ctx.element, clampTimeout(payload.timeoutMs));
      if (!selected.ok) return { ...reject(selected.error), nodeRef: ctx.nodeRef };
    }
    const timeoutMs = clampTimeout(payload.timeoutMs);
    const findOpened = () => {
      const association = locateEditorForNode(ctx.element);
      if (!association.ok) return null;
      const framework = editorFrameworkOf(association.element);
      if (framework.model?.editable === false || association.element.getAttribute?.("contenteditable") === "false") return null;
      const links = editorLinksOf(association.element);
      if (links.missing.length) return null;
      const toolbar = editorToolbarOf(association.element);
      if (!toolbar && !(framework.modelAvailable && framework.model?.editable === true && association.element.getAttribute?.("contenteditable") === "true")) return null;
      return { association, links, toolbar };
    };
    let opened = await waitForValue(findOpened, Math.min(timeoutMs, 600), 40);
    if (!opened) {
      const association = locateEditorForNode(ctx.element);
      const framework = association.ok ? editorFrameworkOf(association.element) : null;
      if (association.ok && ["node-id-token", "node-id"].includes(association.association) && ctx.nodeRef.candidateId
        && framework?.model?.editable === false && framework.model?.state?.doc && typeof framework.model.state.doc.eq === "function") {
        const original = framework.model.state.doc;
        let doubleHandled = false;
        try {
          const activation = await openEditorByVerifiedDoubleClick(association.element, framework.model, original, timeoutMs, findOpened);
          if (activation.ambiguous) return { ...reject("REPORT_EDITOR_AMBIGUOUS"), nodeRef: ctx.nodeRef, uiStateChanged: true, modelUnchangedVerified: modelUnchanged(), security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
          doubleHandled = activation.handled;
          opened = activation.opened || opened;
        } catch { return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } }; }
        if (!doubleHandled) {
        if (!dispatchRealClick(association.element)) return { ...reject("REPORT_CONTROL_CLICK_FAILED"), nodeRef: ctx.nodeRef, uiStateChanged: true, security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
        opened = await waitForValue(findOpened, timeoutMs, 40);
        if (!opened) {
          let paragraphs = [];
          try {
            const current = locateEditorForNode(ctx.element);
            if (!current.ok || current.element !== association.element || !framework.model.state.doc.eq(original)) return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } };
            if (framework.model.editable !== false || association.element.getAttribute?.("contenteditable") !== "false") return { ...reject("REPORT_EDITOR_NOT_FOUND"), nodeRef: ctx.nodeRef, uiStateChanged: true, modelUnchangedVerified: modelUnchanged(), security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
            paragraphs = [...association.element.querySelectorAll("p")].filter((element) => visible(element));
          } catch { return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } }; }
          if (paragraphs.length === 1) {
            let point = null;
            try {
              const rect = association.element.getBoundingClientRect();
              const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              if (center.x >= 0 && center.y >= 0 && center.x < window.innerWidth && center.y < window.innerHeight && document.elementFromPoint(center.x, center.y) === paragraphs[0]) point = center;
            } catch { point = null; }
            if (!dispatchRealClick(paragraphs[0], point)) return { ...reject("REPORT_CONTROL_CLICK_FAILED"), nodeRef: ctx.nodeRef, uiStateChanged: true, security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
            opened = await waitForValue(findOpened, timeoutMs, 40);
          }
          if (!opened) {
            try {
              const current = locateEditorForNode(ctx.element);
              if (!current.ok || current.element !== association.element || !framework.model.state.doc.eq(original)) return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } };
              if (framework.model.editable === false && association.element.getAttribute?.("contenteditable") === "false") {
                const rect = association.element.getBoundingClientRect();
                const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                const hit = point.x >= 0 && point.y >= 0 && point.x < window.innerWidth && point.y < window.innerHeight ? document.elementFromPoint(point.x, point.y) : null;
                if (hit && hit !== association.element && hit !== paragraphs[0] && String(hit.tagName || "").toLowerCase() === "span" && safeContains(association.element, hit) && !hit.closest("a,button,input,[role='button'],[data-field],[data-formula]")) {
                  if (!dispatchRealClick(hit, point)) return { ...reject("REPORT_CONTROL_CLICK_FAILED"), nodeRef: ctx.nodeRef, uiStateChanged: true, security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
                  opened = await waitForValue(findOpened, timeoutMs, 40);
                }
              }
            } catch { return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } }; }
          }
        }
        }
        try {
          const openedModel = opened ? editorFrameworkOf(opened.association.element).model : null;
          if (!framework.model.state.doc.eq(original) || (openedModel?.state?.doc && !openedModel.state.doc.eq(original))) return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } };
        } catch { return { ok: false, reason: "REPORT_EDITOR_OPEN_OUTCOME_UNKNOWN", status: "pendingVerify", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } }; }
      }
    }
    if (!opened) {
      const association = locateEditorForNode(ctx.element);
      return { ...reject(association.ok ? "REPORT_EDITOR_NOT_FOUND" : association.reason), nodeRef: ctx.nodeRef, uiStateChanged: true, modelUnchangedVerified: modelUnchanged(), security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false } };
    }
    const framework = editorFrameworkOf(opened.association.element);
    return {
      ok: true,
      action: "report_editor_open",
      editorOpen: true,
      nodeRef: ctx.nodeRef,
      association: opened.association.association,
      links: { close: true, save: true, preview: true },
      toolbarButtons: detectToolbarCommands(opened.toolbar),
      editorFramework: framework.framework,
      uiStateChanged: true,
      modelUnchangedVerified: modelUnchanged(),
      security: { readOnly: true, writesPerformed: false, uiStateChanged: true, credentialsReturned: false },
    };
  }

  async function editorCommand(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    if (payload.writeAuthorized !== true) return reject("REPORT_WRITE_NOT_AUTHORIZED");
    if (payload.confirmText !== CONFIRM_EXECUTE_TEXT) return reject("REPORT_CONFIRM_TEXT_INVALID");
    const command = typeof payload.command === "string" ? payload.command : "";
    if (!EDITOR_COMMANDS.has(command)) return reject("REPORT_COMMAND_UNSUPPORTED");
    if (["undo", "redo"].includes(command)) return reject("REPORT_COMMAND_UNSUPPORTED");
    return reject("REPORT_PREVIEW_REQUIRED");
  }

  async function editorSave(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    if (payload.writeAuthorized !== true) return reject("REPORT_WRITE_NOT_AUTHORIZED");
    if (payload.confirmText !== CONFIRM_SAVE_TEXT) return reject("REPORT_CONFIRM_TEXT_INVALID");
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const ctx = resolveEditorContext(payload, root);
    if (ctx.error) return { ...reject(ctx.error), nodeRef: payload.nodeRef || null };
    const association = locateEditorForNode(ctx.element);
    if (!association.ok) return { ...reject(association.reason), nodeRef: ctx.nodeRef };
    if (payload.expectedModelHash !== undefined) {
      if (!/^sha256:[0-9a-f]{64}$/.test(payload.expectedModelHash)) return reject("REPORT_CONTENT_CHANGED");
      const framework = editorFrameworkOf(association.element);
      const documentSnapshot = framework.model?.state?.doc;
      if (!documentSnapshot || typeof documentSnapshot.toJSON !== "function" || !window.crypto?.subtle || typeof TextEncoder !== "function") return reject("REPORT_EDITOR_MODEL_UNAVAILABLE");
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(documentSnapshot.toJSON()));
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        const actual = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        if (actual !== payload.expectedModelHash || !framework.model.state.doc.eq(documentSnapshot)) return reject("REPORT_CONTENT_CHANGED");
      } catch { return reject("REPORT_EDITOR_MODEL_UNAVAILABLE"); }
    }
    const links = editorLinksOf(association.element);
    const saveLink = links.found.find((item) => item.link === "save")?.element || null;
    if (!saveLink) return { ...reject("REPORT_EDITOR_NOT_FOUND"), nodeRef: ctx.nodeRef };
    // 只点击一次，绝不自动重试
    if (!dispatchRealClick(saveLink)) {
      return { ok: false, action: "report_editor_save", status: "pendingVerify", reason: "REPORT_SAVE_UNVERIFIED", nodeRef: ctx.nodeRef, uiEvidence: { present: false, sample: "" }, security: { readOnly: false, writesPerformed: false, credentialsReturned: false } };
    }
    await waitFor(() => Boolean(saveToastText()), clampTimeout(payload.timeoutMs), 60);
    const ui = saveToastText();
    return {
      ok: false,
      action: "report_editor_save",
      status: "pendingVerify",
      reason: "REPORT_SAVE_UNVERIFIED",
      nodeRef: ctx.nodeRef,
      uiEvidence: { present: Boolean(ui), sample: ui },
      documentTimeOrigin: Number.isFinite(window.performance?.timeOrigin) ? window.performance.timeOrigin : null,
      security: { readOnly: false, writesPerformed: true, credentialsReturned: false },
    };
  }

  async function editorClose(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    if (payload.discardConfirmed === true) return reject("REPORT_DISCARD_UNSUPPORTED");
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const ctx = resolveEditorContext(payload, root);
    if (ctx.error) return { ...reject(ctx.error), nodeRef: payload.nodeRef || null };
    const association = locateEditorForNode(ctx.element);
    if (!association.ok) return { ...reject(association.reason), nodeRef: ctx.nodeRef };
    const links = editorLinksOf(association.element);
    const closeLink = links.found.find((item) => item.link === "close")?.element || null;
    if (!closeLink) return { ...reject("REPORT_EDITOR_NOT_FOUND"), nodeRef: ctx.nodeRef };
    const before = editorFrameworkOf(association.element).model?.state?.doc || null;
    if (!dispatchRealClick(closeLink)) return { ok: false, action: "report_editor_close", status: "pendingVerify", reason: "REPORT_EDITOR_CLOSE_OUTCOME_UNKNOWN", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } };
    const timeoutMs = clampTimeout(payload.timeoutMs);
    const editorGone = () => {
      const fresh = locateEditorForNode(ctx.element);
      if (!fresh.ok) return fresh.reason === "REPORT_EDITOR_NOT_FOUND";
      try {
        const model = editorFrameworkOf(fresh.element).model;
        return Boolean(before && typeof before.eq === "function" && model?.state?.doc?.eq(before)
          && model.editable === false && fresh.element.getAttribute?.("contenteditable") === "false"
          && editorLinksOf(fresh.element).missing.length === 3);
      } catch { return false; }
    };
    const outcome = await waitForValue(() => {
      const dialog = [...document.querySelectorAll(".el-dialog,[role='dialog']")].find(visible);
      if (dialog) return { confirm: dialog };
      if (editorGone()) return { closed: true };
      return null;
    }, timeoutMs, 40);
    if (!outcome) {
      return { ok: false, action: "report_editor_close", status: "pendingVerify", reason: "REPORT_EDITOR_CLOSE_TIMEOUT", nodeRef: ctx.nodeRef, security: { readOnly: false, writesPerformed: false, writeOutcomeUncertain: true, credentialsReturned: false } };
    }
    if (outcome.closed) {
      let modelUnchangedVerified = false;
      try {
        const fresh = locateEditorForNode(ctx.element);
        const model = fresh.ok ? editorFrameworkOf(fresh.element).model : null;
        modelUnchangedVerified = Boolean(before && typeof before.eq === "function" && model?.state?.doc?.eq(before) && model.editable === false && fresh.element.getAttribute?.("contenteditable") === "false");
      } catch { modelUnchangedVerified = false; }
      return {
        ok: true, action: "report_editor_close", editorClosed: true, discarded: false, nodeRef: ctx.nodeRef, modelUnchangedVerified,
        security: { readOnly: false, writesPerformed: true, credentialsReturned: false },
      };
    }
    // 出现未保存确认框：默认不代决策，交调用方（discardConfirmed===true 时才确认丢弃）
    if (payload.discardConfirmed !== true) {
      return {
        ok: false, action: "report_editor_close", reason: "REPORT_UNSAVED_CHANGES", confirmDialogPresent: true, nodeRef: ctx.nodeRef,
        security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
      };
    }
    const discard = [...outcome.confirm.querySelectorAll("button,[role='button']")].find((item) => visible(item) && !isControlDisabled(item) && /不保存|放弃|丢弃|discard/i.test(controlLabel(item)));
    if (!discard) return { ...reject("REPORT_CONFIRM_CONTROL_NOT_FOUND"), nodeRef: ctx.nodeRef };
    if (!dispatchRealClick(discard)) return { ...reject("REPORT_CONTROL_CLICK_FAILED"), nodeRef: ctx.nodeRef };
    if (!(await waitFor(editorGone, timeoutMs, 40))) {
      return { ok: false, action: "report_editor_close", reason: "REPORT_EDITOR_CLOSE_TIMEOUT", nodeRef: ctx.nodeRef, security: { readOnly: true, writesPerformed: false, credentialsReturned: false } };
    }
    return {
      ok: true, action: "report_editor_close", editorClosed: true, discarded: true, nodeRef: ctx.nodeRef,
      security: { readOnly: false, writesPerformed: true, credentialsReturned: false },
    };
  }

  // ———— readback ————
  function readback(payload = {}) {
    const guard = targetGuard(payload);
    if (guard) return guard;
    const root = findTreeRoot();
    if (!root) return reject("REPORT_TREE_NOT_FOUND");
    const wanted = Array.isArray(payload.nodeRefs) ? payload.nodeRefs : null;
    let elements;
    if (wanted) {
      elements = [];
      for (const nodeRef of wanted) {
        const resolved = resolveNodeRef(root, nodeRef);
        if (resolved.error) return { ...reject(resolved.error), action: "report_readback", nodeRef };
        elements.push(resolved.element);
      }
    } else {
      elements = treeNodesOf(root).slice(0, 200);
    }
    const nodes = [];
    for (const element of elements) {
      const nodePathKey = nodePathKeyOf(element, root);
      const label = nodeLabelOf(element);
      const content = readNodeContent(element);
      nodes.push({ nodePathKey, label, candidateId: candidateId(element), contentHash: content.contentHash, textPreview: content.textPreview });
    }
    return {
      ok: true,
      action: "report_readback",
      contentHash: pageContentHash(),
      truncated: !wanted && treeNodesOf(root).length > 200,
      nodes,
      security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
    };
  }

  // ———— status 能力矩阵（全部来自真实检测） ————
  function status() {
    const matrix = {
      adapterVersion: VERSION,
      inspectAvailable: false,
      treeAvailable: false,
      editorFramework: "unknown",
      editorModelAvailable: false,
      toolbarAvailable: false,
      structureOpsAvailable: false,
      structureOperations: { addChild: false, addSibling: false, copy: false, delete: false, moveUp: false, moveDown: false },
      treeEditModeAvailable: false,
      settingsAvailable: false,
      settingsWriteSupported: false,
      settingsWritableFields: [],
      writeGateOpen: false,
      writesSupported: false,
      livePageVerified: false,
      writeEnabled: false,
    };
    if (!identity()) return matrix;
    const root = findTreeRoot();
    const editors = visibleEditors();
    const targetEditor = activeEditor(editors);
    const framework = targetEditor ? editorFrameworkOf(targetEditor) : { framework: "unknown", modelAvailable: false };
    const toolbars = toolbarElements();
    const nodes = root ? treeNodesOf(root) : [];
    const addChild = hasTreeRowControl(nodes, "add-child") || Boolean(findStructureControl("structure_add"));
    const addSibling = hasTreeRowControl(nodes, "add-sibling") || Boolean(findStructureControl("structure_add"));
    const copy = hasTreeRowControl(nodes, "copy") || Boolean(findStructureControl("structure_copy"));
    const remove = hasTreeRowControl(nodes, "delete") || Boolean(findStructureControl("structure_delete"));
    const moveUp = Boolean(findStructureControl("structure_move_up"));
    const moveDown = Boolean(findStructureControl("structure_move_down"));
    const structureOperations = { addChild, addSibling, copy, delete: remove, moveUp, moveDown };
    matrix.inspectAvailable = true;
    matrix.treeAvailable = Boolean(root);
    matrix.editorFramework = framework.framework;
    matrix.editorModelAvailable = Boolean(framework.modelAvailable);
    matrix.toolbarAvailable = toolbars.length > 0;
    matrix.structureOperations = structureOperations;
    matrix.structureOpsAvailable = Object.values(structureOperations).some(Boolean);
    matrix.treeEditModeAvailable = treeEditModeControls().length === 1;
    matrix.settingsAvailable = Boolean(findSettingsDialog() || hasTreeRowControl(nodes, "settings"));
    matrix.settingsWritableFields = matrix.settingsAvailable ? SETTINGS_WRITABLE_FIELDS.slice() : [];
    matrix.settingsWriteSupported = matrix.settingsWritableFields.length > 0;
    return matrix;
  }

  function inspect(payload = {}) {
    const report = identity();
    if (!report) return { ok: false, reason: "REPORT_TARGET_MISMATCH", security: { readOnly: true, writesPerformed: false } };
    const expected = payload.reportIdentity || {};
    if (["projectId", "companyId", "reportType", "mode"].some((key) => !expected[key] || String(expected[key]) !== report[key])) {
      return { ok: false, reason: "REPORT_TARGET_MISMATCH", security: { readOnly: true, writesPerformed: false } };
    }
    // detailId 同样参与身份校验（不提供则不强制）
    if (expected.reportDetailId !== undefined && String(expected.reportDetailId) !== String(report.reportDetailId || "")) {
      return { ok: false, reason: "REPORT_TARGET_MISMATCH", security: { readOnly: true, writesPerformed: false } };
    }
    return {
      ok: true,
      action: "report_inspect",
      reportAdapterVersion: VERSION,
      reportIdentity: report,
      reportIdentityVerified: false,
      tree: inspectTree(payload),
      settings: inspectSettings(),
      editor: inspectEditors(),
      networkDiagnostics: inspectSaveNetworkEvidence(),
      supportedActions: SUPPORTED_ACTIONS,
      conditionalActions: ["node_read", "preview", "readback"],
      writeEnabled: false,
      security: { readOnly: true, writesPerformed: false, credentialsReturned: false },
    };
  }

  function inspectSaveNetworkEvidence() {
    const log = Array.isArray(window.__tianyuanWorkbenchUploadNetworkLog) ? window.__tianyuanWorkbenchUploadNetworkLog : [];
    const events = [];
    function addEvidence(item, source) {
      const match = String(item?.url || "").match(/^(?:https:\/\/excel\.zhrdc\.net)?(\/ty\/api\/[A-Za-z0-9_\/-]{1,200})(?:[?#].*)?$/i);
      if (!match || !/(?:report|save|draft)/i.test(match[1])) return;
      const segments = match[1].split("/").map((part) => {
        if (!part) return part;
        return /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/.test(part) && !/(?:cookie|authorization|token|password|secret)/i.test(part) ? part : "{id}";
      });
      const method = String(item?.method || "").toUpperCase();
      const status = Number(item?.status);
      if (source === "monitor" && (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) || !Number.isInteger(status) || status < 0 || status > 599)) return;
      const event = { source, path: segments.join("/") };
      if (source === "monitor") { event.method = method; event.status = status; }
      if (Number.isFinite(item?.atEpochMs) && item.atEpochMs > 0) event.atEpochMs = Math.floor(item.atEpochMs / 1000) * 1000;
      events.push(event);
    }
    for (const item of log.slice(-1000)) addEvidence(item, "monitor");
    let performanceAvailable = false;
    try {
      const perf = window.performance;
      if (typeof perf?.getEntriesByType === "function") {
        performanceAvailable = true;
        for (const entry of perf.getEntriesByType("resource").slice(-1000)) {
          if (!["fetch", "xmlhttprequest"].includes(String(entry?.initiatorType || "").toLowerCase())) continue;
          addEvidence({ url: entry.name, atEpochMs: Number(perf.timeOrigin) + Number(entry.startTime) }, "performance");
        }
      }
    } catch {}
    return { available: Array.isArray(window.__tianyuanWorkbenchUploadNetworkLog) || performanceAvailable, events: events.slice(-30), evidenceOnly: true, persistenceVerified: false };
  }

  function inspectEditors() {
    const editors = visibleEditors();
    const toolbars = toolbarElements();
    const controls = toolbars.flatMap((toolbar) => [...toolbar.querySelectorAll("button,[role='button']")]
      .filter(visible)
      .map((item) => ({
        label: text({ textContent: item.getAttribute("aria-label") || item.getAttribute("title") || "" }, 80),
        disabled: isControlDisabled(item),
      })))
      .filter((item) => item.label)
      .slice(0, 100);
    const targetEditor = activeEditor(editors);
    const framework = targetEditor ? editorFrameworkOf(targetEditor) : { framework: "unknown", modelAvailable: false };
    const root = findTreeRoot();
    const nodeCounts = new Map();
    if (root) for (const node of treeNodesOf(root)) {
      const id = candidateId(node);
      if (id) nodeCounts.set(id, (nodeCounts.get(id) || 0) + 1);
    }
    const associations = {};
    for (const attribute of ["data-node-key", "data-key", "data-id"]) {
      const matches = new Map();
      let keyedEditors = 0;
      for (const editor of editors) {
        let value = "";
        try { value = String(editor.closest?.(`[${attribute}]`)?.getAttribute(attribute) || ""); } catch { value = ""; }
        if (!/^[A-Za-z0-9:_-]{1,200}$/.test(value) || /(?:cookie|authorization|token|password|验证码)/i.test(value)) continue;
        keyedEditors += 1;
        if (nodeCounts.get(value) === 1) matches.set(value, (matches.get(value) || 0) + 1);
      }
      associations[attribute] = { keyedEditors, uniquelyMatchedNodes: [...matches.values()].filter((count) => count === 1).length, ambiguousMatchedNodes: [...matches.values()].filter((count) => count > 1).length };
    }
    const ancestorAssociations = {};
    const embeddedIdMatches = new Map();
    for (const attribute of ["data-node-key", "data-key", "data-id", "id"]) {
      const matches = new Map();
      let keyedEditors = 0;
      for (const editor of editors) {
        const ids = new Set();
        let element = editor;
        for (let depth = 0; depth < 16 && element && element !== document.body; depth += 1, element = element.parentElement) {
          const value = String(element.getAttribute?.(attribute) || "");
          if (/^[A-Za-z0-9:_-]{1,200}$/.test(value) && !/(?:cookie|authorization|token|password|验证码)/i.test(value)) ids.add(value);
        }
        if (ids.size) keyedEditors += 1;
        for (const id of ids) if (nodeCounts.get(id) === 1) matches.set(id, (matches.get(id) || 0) + 1);
        if (attribute === "id") {
          const matched = new Set();
          for (const value of ids) {
            for (const token of value.split(/[:_-]+/)) {
              if (nodeCounts.get(token) === 1) matched.add(token);
            }
          }
          for (const id of matched) embeddedIdMatches.set(id, (embeddedIdMatches.get(id) || 0) + 1);
        }
      }
      ancestorAssociations[attribute] = { keyedEditors, uniquelyMatchedNodes: [...matches.values()].filter((count) => count === 1).length, ambiguousMatchedNodes: [...matches.values()].filter((count) => count > 1).length };
    }
    return {
      visibleEditorCount: editors.length,
      editorSelection: targetEditor ? "identified" : editors.length ? "ambiguous" : "none",
      associationDiagnostics: { uniqueTreeNodeKeys: [...nodeCounts.values()].filter((count) => count === 1).length, attributes: associations, ancestorAttributes: ancestorAssociations, embeddedNodeIds: { uniquelyMatchedNodes: [...embeddedIdMatches.values()].filter((count) => count === 1).length, ambiguousMatchedNodes: [...embeddedIdMatches.values()].filter((count) => count > 1).length }, evidenceOnly: true },
      framework: framework.framework,
      modelAvailable: Boolean(framework.modelAvailable),
      model: "unverified",
      toolbarAvailable: toolbars.length > 0,
      controls,
      selectionAvailable: false,
      contentRead: false,
    };
  }

  // ———— dispatch：页面适配器按 payload.action 调用 ————
  function dispatch(payload = {}) {
    switch (payload?.action) {
      case "report_inspect": return inspect(payload);
      case "report_navigate": return navigate(payload);
      case "report_node_read": return nodeRead(payload);
      case "report_preview": return preview(payload);
      case "report_execute": return execute(payload);
      case "report_save": return save(payload);
      case "report_readback": return readback(payload);
      case "report_editor_open": return editorOpen(payload);
      case "report_editor_command": return editorCommand(payload);
      case "report_editor_save": return editorSave(payload);
      case "report_editor_close": return editorClose(payload);
      default: return { ok: false, reason: "REPORT_ACTION_UNKNOWN", action: payload?.action || null };
    }
  }

  window.__tianyuanReportAuthoringAdapter = Object.freeze({
    version: VERSION,
    status,
    inspect,
    dispatch,
    navigate,
    nodeRead,
    preview,
    execute,
    save,
    readback,
    editorOpen,
    editorCommand,
    editorSave,
    editorClose,
  });
})();
