(() => {
  const ADAPTER_VERSION = "2026-08-28-edit-block-caret-v1";
  const EXTENSION_VERSION = "0.14.25";
  const EXTENSION_BUILD_ID = "0.14.25-2026082803";
  const ADAPTER_STATE_KEY = "__tianyuanWorkbenchPageAdapterState";
  const REQUEST_TYPE = `TIANYUAN_WORKBENCH_GET_CONTEXT:${ADAPTER_VERSION}`;
  const RESPONSE_TYPE = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${ADAPTER_VERSION}`;
  const ACTION_REQUEST_TYPE = `TIANYUAN_WORKBENCH_RUN_ACTION:${ADAPTER_VERSION}`;
  const ACTION_RESPONSE_TYPE = `TIANYUAN_WORKBENCH_ACTION_RESULT:${ADAPTER_VERSION}`;
  const FIELD_TITLE = "查证资料索引";
  const MAX_HEADER_COLUMNS = 120;
  const MAX_EDIT_BLOCK_TEXT = 200000;
  const EDIT_BLOCK_CONFIRM_TEXT = "确认修改编辑块";
  const EDIT_BLOCK_FORMAT_CONFIRM_TEXT = "确认设置编辑格式";
  const TABLE_CONFIRM_TEXT = "确认执行表格操作";
  const MAX_TABLE_ROWS = 50;
  const MAX_TABLE_COLUMNS = 20;
  const MAX_TABLE_CELL_TEXT = 5000;
  const EDIT_BLOCK_SENSITIVE_FIELD_PATTERN = /(password|passwd|pwd|token|secret|authorization|cookie|credential|验证码|校验码|动态码|口令|密钥)/i;
  const EDIT_BLOCK_SENSITIVE_TEXT_PATTERN = /(?:bearer\s+|authorization\s*[:=]|access[_-]?token\s*[:=]|mcp\s*token\s*[:=]|密码\s*[:：=]|验证码\s*[:：=])/i;

  function textOf(element) {
    return (element?.innerText || element?.textContent || element?.value || element?.getAttribute?.("aria-label") || element?.title || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function colName(index) {
    let n = index + 1;
    let s = "";
    while (n > 0) {
      const mod = (n - 1) % 26;
      s = String.fromCharCode(65 + mod) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function resolveSheet(spread, requestedName = "") {
    const active = spread?.getActiveSheet?.();
    const name = String(requestedName || "").trim();
    if (!name) return active;
    const count = Number(spread?.getSheetCount?.() || 0);
    for (let index = 0; index < Math.min(count, 80); index += 1) {
      const sheet = spread.getSheet?.(index);
      if (sheet?.name?.() === name) return sheet;
    }
    return null;
  }

  function parseRoute() {
    const operationMatch = location.pathname.match(/\/ty\/operation\/([^/]+)/);
    const draftMatch = location.pathname.match(/\/ty\/operation\/([^/]+)\/([^/]+)\/asset-based-approach\/draft/);
    const newReportMatch = location.pathname.match(/\/ty\/operation\/([^/]+)\/([^/]+)\/new-report\/([^/]+)\/(add|edit)/);
    const params = new URLSearchParams(location.search);
    return {
      isTianyuanOperationRoute: Boolean(operationMatch),
      isEquityListRoute: /\/ty\/operation\/[^/]+\/equity\/list/.test(location.pathname),
      isAssetDraftRoute: Boolean(draftMatch),
      isNewReportRoute: Boolean(newReportMatch),
      projectId: draftMatch?.[1] || operationMatch?.[1] || null,
      companyId: draftMatch?.[2] || null,
      reportCompanyId: newReportMatch?.[2] || null,
      reportType: newReportMatch?.[3] || null,
      reportMode: newReportMatch?.[4] || null,
      detailId: params.get("detailId"),
      subjectCode: params.get("subjectCode"),
    };
  }

  function getVisibleControls() {
    return [...document.querySelectorAll("button,.el-button,[role='button'],a,span,label")]
      .filter(isVisible)
      .map((element) => ({
        text: textOf(element),
        tag: element.tagName,
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        element,
      }))
      .filter((item) => item.text);
  }

  function serializeControl(item) {
    return {
      text: item.text,
      tag: item.tag,
      disabled: item.disabled,
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeEditBlockText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_EDIT_BLOCK_TEXT);
  }

  function editBlockHash(value) {
    let hash = 2166136261;
    const text = normalizeEditBlockText(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function cssPixelValue(value) {
    const text = String(value || "").trim();
    if (!text || text === "normal" || text === "auto") return null;
    const number = Number.parseFloat(text);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  function cssValue(element, property) {
    const inline = element?.style?.[property];
    if (inline) return String(inline);
    return String(window.getComputedStyle?.(element)?.[property] || "");
  }

  function normalizeCssColor(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text || text === "transparent" || text === "none" || text === "rgba(0, 0, 0, 0)") return "transparent";
    const hex = text.match(/^#([0-9a-f]{6})$/i);
    if (hex) return `#${hex[1].toLowerCase()}`;
    const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i);
    if (!rgb) return text;
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (alpha === 0) return "transparent";
    if (alpha !== 1) return text;
    return `#${[rgb[1], rgb[2], rgb[3]].map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
  }

  function readEditBlockFormat(element) {
    return {
      fontWeight: cssValue(element, "fontWeight") || "normal",
      fontStyle: cssValue(element, "fontStyle") || "normal",
      textDecoration: cssValue(element, "textDecoration") || "none",
      textAlign: cssValue(element, "textAlign") || "left",
      fontSizePx: cssPixelValue(cssValue(element, "fontSize")),
      color: cssValue(element, "color") || "",
      highlightColor: normalizeCssColor(cssValue(element, "backgroundColor")),
      lineHeightPx: cssPixelValue(cssValue(element, "lineHeight")),
      indentPx: cssPixelValue(cssValue(element, "textIndent")) ?? 0,
    };
  }

  function normalizeEditableFormat(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_REQUIRED" };
    const result = {};
    const allowed = new Set(["fontWeight", "fontStyle", "textDecoration", "textAlign", "fontSizePx", "color", "highlightColor", "lineHeightPx", "indentPx"]);
    if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false, reason: "EDIT_BLOCK_FORMAT_FIELD_NOT_ALLOWED" };
    if (value.fontWeight !== undefined) {
      if (!["normal", "bold"].includes(value.fontWeight)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_FONT_WEIGHT_INVALID" };
      result.fontWeight = value.fontWeight;
    }
    if (value.fontStyle !== undefined) {
      if (!["normal", "italic"].includes(value.fontStyle)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_FONT_STYLE_INVALID" };
      result.fontStyle = value.fontStyle;
    }
    if (value.textDecoration !== undefined) {
      if (!["none", "underline", "line-through"].includes(value.textDecoration)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_DECORATION_INVALID" };
      result.textDecoration = value.textDecoration;
    }
    if (value.textAlign !== undefined) {
      if (!["left", "center", "right", "justify"].includes(value.textAlign)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_ALIGNMENT_INVALID" };
      result.textAlign = value.textAlign;
    }
    for (const key of ["fontSizePx", "lineHeightPx", "indentPx"]) {
      if (value[key] === undefined) continue;
      const number = Number(value[key]);
      const ranges = { fontSizePx: [8, 72], lineHeightPx: [12, 200], indentPx: [0, 400] };
      if (!Number.isInteger(number) || number < ranges[key][0] || number > ranges[key][1]) return { ok: false, reason: `EDIT_BLOCK_FORMAT_${key.toUpperCase()}_INVALID` };
      result[key] = number;
    }
    if (value.color !== undefined) {
      if (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)) return { ok: false, reason: "EDIT_BLOCK_FORMAT_COLOR_INVALID" };
      result.color = value.color.toLowerCase();
    }
    if (value.highlightColor !== undefined) {
      if (typeof value.highlightColor !== "string") return { ok: false, reason: "EDIT_BLOCK_FORMAT_HIGHLIGHT_COLOR_INVALID" };
      const highlightColor = value.highlightColor.trim().toLowerCase();
      if (["transparent", "none"].includes(highlightColor)) result.highlightColor = "transparent";
      else if (/^#[0-9a-f]{6}$/i.test(highlightColor)) result.highlightColor = highlightColor;
      else return { ok: false, reason: "EDIT_BLOCK_FORMAT_HIGHLIGHT_COLOR_INVALID" };
    }
    if (!Object.keys(result).length) return { ok: false, reason: "EDIT_BLOCK_FORMAT_REQUIRED" };
    return { ok: true, format: result };
  }

  function formatChanges(before, after, requested) {
    return Object.fromEntries(Object.keys(requested).map((key) => [key, { before: before?.[key] ?? null, after: after?.[key] ?? null }]));
  }

  function editBlockElement(element) {
    if (!element) return false;
    const contentEditable = String(element.getAttribute?.("contenteditable") || "").toLowerCase();
    return contentEditable !== "false" && (element.isContentEditable === true || ["", "true", "plaintext-only"].includes(contentEditable));
  }

  function childNodesOf(node) {
    return node?.childNodes ? [...node.childNodes] : node?.children ? [...node.children] : [];
  }

  function editBlockText(element) {
    return normalizeEditBlockText(element?.textContent || element?.innerText || element?.value || "");
  }

  function editBlockTextLength(node) {
    if (!node) return 0;
    if (node.nodeType === 3) return String(node.nodeValue ?? node.data ?? "").length;
    return childNodesOf(node).reduce((total, child) => total + editBlockTextLength(child), 0);
  }

  function nodeContains(root, node) {
    if (!root || !node) return false;
    let current = node;
    for (let depth = 0; current && depth < 80; depth += 1, current = current.parentNode || current.parentElement) {
      if (current === root) return true;
    }
    return false;
  }

  function rangeBoundaryOffset(root, container, offset) {
    if (!nodeContains(root, container)) return null;
    let total = 0;
    let result = null;
    const visit = (node) => {
      if (result !== null) return;
      if (node === container) {
        if (node.nodeType === 3) {
          result = total + Math.max(0, Math.min(Number(offset) || 0, editBlockTextLength(node)));
          return;
        }
        const children = childNodesOf(node);
        const boundary = Math.max(0, Math.min(Number(offset) || 0, children.length));
        for (let index = 0; index < boundary; index += 1) total += editBlockTextLength(children[index]);
        result = total;
        return;
      }
      if (node.nodeType === 3) {
        total += editBlockTextLength(node);
        return;
      }
      for (const child of childNodesOf(node)) visit(child);
    };
    visit(root);
    return result;
  }

  function rangeOffsets(range, root, selectedText = "") {
    const start = rangeBoundaryOffset(root, range?.startContainer, range?.startOffset);
    const end = rangeBoundaryOffset(root, range?.endContainer, range?.endOffset);
    if (start !== null && end !== null && end >= start) return { start, end };
    const text = editBlockText(root);
    const index = selectedText ? text.indexOf(selectedText) : -1;
    return index >= 0 ? { start: index, end: index + selectedText.length } : null;
  }

  function findTextOffsets(text, target, preferredStart = 0, prefix = "", suffix = "") {
    const source = String(text || "");
    const needle = String(target || "");
    if (!needle) return null;
    let from = 0;
    let best = null;
    while (from <= source.length) {
      const index = source.indexOf(needle, from);
      if (index < 0) break;
      const before = source.slice(Math.max(0, index - prefix.length), index);
      const after = source.slice(index + needle.length, index + needle.length + suffix.length);
      const score = (before === prefix ? 2 : 0) + (after === suffix ? 2 : 0) - Math.abs(index - preferredStart) / Math.max(1, source.length);
      if (!best || score > best.score) best = { start: index, end: index + needle.length, score };
      from = index + Math.max(1, needle.length);
    }
    return best ? { start: best.start, end: best.end } : null;
  }

  function editableRootForNode(node) {
    let current = node?.nodeType === 1 ? node : node?.parentElement || node?.parentNode;
    let fallback = null;
    for (let depth = 0; current && depth < 20 && current !== document.body; depth += 1, current = current.parentElement || current.parentNode) {
      if (!editBlockElement(current)) continue;
      fallback = current;
      if (current.getAttribute?.("contenteditable") != null) return current;
    }
    return fallback;
  }

  function isEditBlockLike(element, root = null) {
    if (!element || element === root || !editBlockElement(element)) return false;
    const tag = String(element.tagName || "").toUpperCase();
    return ["MARK", "P", "LI", "TD", "TH", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "DIV"].includes(tag)
      || element.getAttribute?.("role") === "paragraph"
      || ["data-block-id", "data-field-id", "data-field-key"].some((name) => element.getAttribute?.(name));
  }

  function editBlockForNode(node, root = null) {
    let current = node?.nodeType === 1 ? node : node?.parentElement || node?.parentNode;
    let fallback = null;
    for (let depth = 0; current && depth < 20 && current !== document.body; depth += 1, current = current.parentElement || current.parentNode) {
      if (!editBlockElement(current)) continue;
      if (!fallback) fallback = current;
      if (isEditBlockLike(current, root)) return current;
      if (current === root) break;
    }
    return root && fallback ? root : fallback;
  }

  function isBroadEditContainer(element) {
    const tag = String(element?.tagName || "").toUpperCase();
    const role = String(element?.getAttribute?.("role") || "").toLowerCase();
    return role === "textbox" || (tag === "DIV" && element?.getAttribute?.("contenteditable") != null
      && !["data-block-id", "data-field-id", "data-field-key"].some((name) => element.getAttribute?.(name)));
  }

  function editBlockDomPath(element) {
    const parts = [];
    let current = element;
    for (let depth = 0; current && depth < 20 && current !== document.body; depth += 1, current = current.parentElement) {
      const tag = String(current.tagName || "element").toLowerCase();
      const siblings = current.parentElement?.children
        ? [...current.parentElement.children].filter((item) => String(item.tagName || "").toLowerCase() === tag)
        : [];
      const index = siblings.indexOf(current);
      parts.unshift(`${tag}:${index >= 0 ? index + 1 : 1}`);
    }
    return parts.join("/") || String(element?.tagName || "element").toLowerCase();
  }

  function editBlockNodePath(root, node) {
    if (!root || !node || !nodeContains(root, node)) return "";
    const parts = [];
    let current = node;
    while (current && current !== root && parts.length < 40) {
      const parent = current.parentNode || current.parentElement;
      if (!parent) return "";
      const index = childNodesOf(parent).indexOf(current);
      if (index < 0) return "";
      parts.unshift(`${current.nodeType === 3 ? "text" : "node"}:${index}`);
      current = parent;
    }
    return current === root ? parts.join("/") || "root" : "";
  }

  function resolveEditBlockNode(root, path) {
    if (!root || !path || path === "root") return path === "root" ? root : null;
    let current = root;
    for (const token of String(path).split("/")) {
      const match = token.match(/^(?:text|node):(\d+)$/);
      if (!match) return null;
      current = childNodesOf(current)[Number(match[1])] || null;
      if (!current) return null;
    }
    return current;
  }

  function editBlockId(element) {
    const explicit = ["data-block-id", "data-field-id", "data-field-key", "data-testid", "id", "name", "aria-label"]
      .map((name) => String(element?.getAttribute?.(name) || "").trim())
      .find(Boolean);
    return (explicit ? `dom:${explicit}` : `dom-path:${editBlockDomPath(element)}`).slice(0, 500);
  }

  function makeEditBlockReference(element, range, selectedText = "", forceRange = false) {
    if (!element) return null;
    const fullText = editBlockText(element);
    const offsets = rangeOffsets(range, element, selectedText) || { start: 0, end: fullText.length };
    let start = Math.max(0, Math.min(offsets.start, fullText.length));
    let end = Math.max(start, Math.min(offsets.end, fullText.length));
    let actualSelectedText = fullText.slice(start, end);
    if (!actualSelectedText && selectedText && !range?.startContainer) {
      actualSelectedText = fullText;
      start = 0;
      end = fullText.length;
    }
    const isCaret = Boolean(range && (range.collapsed === true || (!selectedText && start === end)));
    const isWhole = !isCaret && !forceRange && start === 0 && end === fullText.length;
    const baseId = editBlockId(element);
    const prefix = fullText.slice(Math.max(0, start - 80), start);
    const suffix = fullText.slice(end, end + 80);
    const signature = editBlockHash(`${prefix}\u0000${actualSelectedText}\u0000${suffix}`);
    const caretPath = isCaret ? editBlockNodePath(element, range.startContainer) : "";
    const caretOffset = isCaret ? Math.max(0, Number(range.startOffset) || 0) : null;
    const caretSignature = isCaret ? editBlockHash(`${baseId}\u0000${caretPath}\u0000${caretOffset}\u0000${fullText}`) : "";
    return {
      element,
      baseId,
      blockId: isCaret ? `dom-caret:${baseId}:${caretSignature}`.slice(0, 500) : isWhole ? baseId : `dom-range:${baseId}:${signature}`.slice(0, 500),
      mode: isCaret ? "caret" : isWhole ? "element" : "range",
      rangeStart: start,
      rangeEnd: end,
      selectedText: actualSelectedText,
      prefix,
      suffix,
      broadContainer: isBroadEditContainer(element),
      caretContainerPath: isCaret ? editBlockDomPath(element) : "",
      caretPath,
      caretOffset,
    };
  }

  function emptyEditBlock(reason = "") {
    return {
      available: false,
      valid: false,
      stale: Boolean(reason),
      reason: String(reason || ""),
      blockId: "",
      tabId: null,
      pageUrl: "",
      pageTitle: "",
      element: null,
      editable: false,
      originalText: "",
      currentText: "",
      contentHash: "",
      currentHash: "",
      capturedAt: null,
      paragraphHint: "",
      fieldHint: "",
      containerText: "",
      containerHash: "",
      rangeStart: null,
      rangeEnd: null,
      selectedText: "",
      blockMode: "",
      broadContainer: false,
      caretReference: null,
      format: {},
    };
  }

  function editBlockHint(element) {
    const candidate = isEditBlockLike(element) ? element : element?.closest?.("[data-field-label],[data-field],[data-field-key],p,li,td,th") || element?.parentElement;
    const value = String(candidate?.innerText || candidate?.textContent || "").replace(/\s+/g, " ").trim();
    return value && !EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(value) ? value.slice(0, 300) : "";
  }

  function referenceOffsets(reference, element) {
    const fullText = editBlockText(element);
    if (reference?.mode === "caret") {
      const offset = Number(reference.rangeStart ?? reference.caretTextOffset ?? 0);
      const bounded = Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, fullText.length));
      return { start: bounded, end: bounded };
    }
    if (reference?.mode !== "range") return { start: 0, end: fullText.length };
    const start = Number(reference.rangeStart);
    const end = Number(reference.rangeEnd);
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start && fullText.slice(start, end) === reference.selectedText) {
      return { start: Math.min(start, fullText.length), end: Math.min(end, fullText.length) };
    }
    return findTextOffsets(fullText, reference.selectedText, Number.isInteger(start) ? start : 0, reference.prefix, reference.suffix)
      || { start: Math.max(0, Math.min(start || 0, fullText.length)), end: Math.max(0, Math.min(end || 0, fullText.length)) };
  }

  function readEditBlock(target, payload = {}) {
    const reference = target?.element ? target : { element: target, mode: "element" };
    const element = reference.element;
    if (!editBlockElement(element)) return emptyEditBlock("EDIT_BLOCK_NOT_EDITABLE");
    const attributes = ["type", "name", "id", "autocomplete", "aria-label", "placeholder", "data-testid"]
      .map((name) => String(element.getAttribute?.(name) || "")).join(" ");
    const type = String(element.getAttribute?.("type") || "").toLowerCase();
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true" || type === "hidden" || type === "password" || EDIT_BLOCK_SENSITIVE_FIELD_PATTERN.test(attributes)) return emptyEditBlock("EDIT_BLOCK_SENSITIVE_FIELD");
    const containerText = editBlockText(element);
    const offsets = referenceOffsets(reference, element);
    const originalText = containerText.slice(offsets.start, offsets.end);
    if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(originalText)) return emptyEditBlock("EDIT_BLOCK_SENSITIVE_TEXT");
    const descriptor = {
      tag: String(element.tagName || "").toLowerCase(),
      id: String(element.id || "").trim() || null,
      name: String(element.getAttribute?.("name") || "").trim() || null,
      role: String(element.getAttribute?.("role") || "").trim() || null,
      contentEditable: true,
    };
    const contentHash = reference.mode === "caret" ? editBlockHash(containerText) : editBlockHash(originalText);
    const caretReference = reference.mode === "caret" ? {
      mode: "caret",
      baseId: reference.baseId || editBlockId(element),
      blockId: reference.blockId || "",
      containerPath: reference.caretContainerPath || editBlockDomPath(element),
      domPath: reference.caretPath || "",
      textOffset: Number.isInteger(reference.caretOffset) ? reference.caretOffset : Number(reference.rangeStart) || 0,
    } : null;
    return {
      available: true,
      valid: true,
      stale: false,
      reason: "",
      blockId: reference.blockId || editBlockId(element),
      tabId: Number.isInteger(payload.tabId) ? payload.tabId : null,
      pageUrl: `${location.origin}${location.pathname}`.slice(0, 1000),
      pageTitle: String(document.title || "").slice(0, 300),
      element: { ...descriptor, blockId: reference.blockId || editBlockId(element), stablePath: editBlockDomPath(element), scope: reference.mode === "range" ? "text-range" : reference.mode === "caret" ? "caret" : "element" },
      editable: element.isContentEditable !== false && String(element.getAttribute?.("contenteditable") || "").toLowerCase() !== "false",
      originalText,
      currentText: originalText,
      contentHash,
      currentHash: contentHash,
      capturedAt: new Date().toISOString(),
      paragraphHint: editBlockHint(element),
      fieldHint: String(element.getAttribute?.("data-field-label") || element.getAttribute?.("aria-label") || "").slice(0, 200),
      containerText,
      containerHash: editBlockHash(containerText),
      rangeStart: offsets.start,
      rangeEnd: offsets.end,
      selectedText: originalText,
      blockMode: reference.mode || "element",
      broadContainer: Boolean(reference.broadContainer),
      caretReference,
      format: readEditBlockFormat(element),
    };
  }

  function selectedEditBlock() {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount < 1) return null;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (document.contains && (!document.contains(selection.anchorNode || container) || !document.contains(selection.focusNode || container))) return null;
    const anchorRoot = editableRootForNode(selection.anchorNode || container);
    const focusRoot = editableRootForNode(selection.focusNode || container);
    if (anchorRoot !== focusRoot && (anchorRoot || focusRoot)) return { reason: "EDIT_BLOCK_CROSS_BLOCK_SELECTION" };
    const root = anchorRoot || focusRoot || editBlockForNode(container);
    const collapsed = Boolean(selection.isCollapsed || range.collapsed);
    if (collapsed) {
      if (!root || !nodeContains(root, range.startContainer)) return null;
      return { reference: makeEditBlockReference(root, range, "", true) };
    }
    const anchor = editBlockForNode(selection.anchorNode || container, root);
    const focus = editBlockForNode(selection.focusNode || container, root);
    const sharedEditableRoot = Boolean(anchorRoot || focusRoot);
    if (!sharedEditableRoot && anchor && focus && anchor !== root && focus !== root && editBlockId(anchor) !== editBlockId(focus)) {
      return { reason: "EDIT_BLOCK_CROSS_BLOCK_SELECTION" };
    }
    const element = sharedEditableRoot ? root : anchor && anchor !== root ? anchor : focus && focus !== root ? focus : root;
    if (!element) return null;
    const selectedText = normalizeEditBlockText(selection.toString?.() || "");
    return { reference: makeEditBlockReference(element, range, selectedText, isBroadEditContainer(element)) };
  }

  let lastEditBlockElement = null;
  let lastEditBlockReference = null;
  let lastEditBlockSnapshot = null;
  const tableOperationRegistry = new Map();

  function currentEditBlock(payload = {}) {
    const selected = selectedEditBlock();
    if (selected?.reason) return emptyEditBlock(selected.reason);
    let reference = selected?.reference || lastEditBlockReference || (lastEditBlockElement ? { element: lastEditBlockElement, mode: "element" } : null);
    if (reference && (!reference.element || !document.contains?.(reference.element))) {
      reference = rebindEditBlockReference(reference);
      if (reference) {
        lastEditBlockReference = reference;
        lastEditBlockElement = reference.element;
      }
    }
    const element = reference?.element;
    if (!element || !document.contains?.(element)) return lastEditBlockSnapshot ? { ...lastEditBlockSnapshot, available: false, valid: false, stale: true, reason: "EDIT_BLOCK_NOT_FOUND" } : emptyEditBlock();
    const current = readEditBlock(reference, payload);
    if (!current.available) return current;
    if (!lastEditBlockSnapshot || lastEditBlockSnapshot.blockId !== current.blockId) {
      lastEditBlockElement = element;
      lastEditBlockReference = reference;
      lastEditBlockSnapshot = current;
      return current;
    }
    const stale = current.contentHash !== lastEditBlockSnapshot.contentHash;
    return {
      ...lastEditBlockSnapshot,
      pageUrl: current.pageUrl,
      pageTitle: current.pageTitle,
      element: current.element,
      tabId: current.tabId,
      currentText: current.currentText,
      currentHash: current.contentHash,
      blockMode: current.blockMode,
      broadContainer: current.broadContainer,
      rangeStart: current.rangeStart,
      rangeEnd: current.rangeEnd,
      selectedText: current.selectedText,
      containerText: current.containerText,
      containerHash: current.containerHash,
      valid: !stale,
      stale,
      reason: stale ? "EDIT_BLOCK_CONTENT_CHANGED" : "",
    };
  }

  function findVisibleElementByText(label, selector = "button,.el-button,[role='button'],a,span,label") {
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .find((element) => textOf(element) === label);
  }

  function findVisibleElementsByText(label, selector = "button,.el-button,[role='button'],a,span,label") {
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .filter((element) => textOf(element) === label);
  }

  function isPageSaveControl(button, includeDisabled = false) {
    const outsideDialog = button.closest ? !button.closest(".el-dialog,[role='dialog']") : true;
    if (!isVisible(button) || !outsideDialog) return false;
    if (!includeDisabled && (button.disabled || button.getAttribute?.("aria-disabled") === "true")) return false;
    const labels = [
      textOf(button),
      button.getAttribute?.("aria-label"),
      button.getAttribute?.("title"),
      button.getAttribute?.("data-testid"),
      button.getAttribute?.("data-action"),
      button.getAttribute?.("data-command"),
    ].map((value) => String(value || "").replace(/\s+/g, " ").trim());
    return labels.some((label) => /^(?:保存|保存草稿|保存报告|保存内容|save|save draft|save report|save content)$/i.test(label));
  }

  function findPageSaveButtons(includeDisabled = false) {
    return [...document.querySelectorAll("button,.el-button,[role='button']")]
      .filter((element) => isPageSaveControl(element, includeDisabled));
  }

  function isNewReportRoute() {
    return Boolean(parseRoute().isNewReportRoute);
  }

  function reportActionValue(element) {
    return [
      element?.getAttribute?.("data-action"),
      element?.getAttribute?.("data-command"),
      element?.getAttribute?.("data-event"),
      element?.getAttribute?.("data-testid"),
    ].map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function reportControlLabel(element) {
    return [
      textOf(element),
      element?.value,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
    ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean) || "";
  }

  function findNewReportActionControl(actionName) {
    const wanted = String(actionName || "").trim().toUpperCase();
    if (!wanted) return null;
    const candidates = [...document.querySelectorAll("button,input[type='button'],input[type='submit'],[role='button'],[data-action],[data-command],[data-event],[data-testid]")];
    const aliases = wanted === "SAVE_DRAFT"
      ? new Set(["SAVE_DRAFT", "SAVE", "SAVEDRAFT", "SAVE_REPORT"])
      : new Set(["CONFIRM_SAVE_DRAFT", "CONFIRM", "CONFIRM_SAVE"]);
    const exact = candidates.find((element) => aliases.has(reportActionValue(element).toUpperCase().replace(/[ -]/g, "_")) && !element.disabled && element.getAttribute?.("aria-disabled") !== "true");
    if (exact) return exact;
    const labels = {
      SAVE_DRAFT: /^(?:保存|保存草稿|保存报告|保存内容|保存并保存|save|save draft|save report|save content)$/i,
      CONFIRM_SAVE_DRAFT: /^(?:确定|确认|确认保存|确定保存|confirm)$/i,
    };
    return candidates.find((element) => !element.disabled && element.getAttribute?.("aria-disabled") !== "true"
      && isVisible(element) && labels[wanted]?.test(reportControlLabel(element))) || null;
  }

  function editorViewLike(value) {
    return Boolean(value && typeof value.dispatch === "function" && value.dom && value.state
      && value.state.schema && value.state.tr);
  }

  function safeProperty(value, key) {
    try {
      return value?.[key];
    } catch {
      return null;
    }
  }

  function findReportEditorController(root) {
    if (!root) return null;
    const queue = [];
    const seen = new Set();
    const add = (value, depth) => {
      if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value) || depth > 4) return;
      seen.add(value);
      queue.push({ value, depth });
    };
    let element = root;
    for (let depth = 0; element && depth < 8; depth += 1, element = element.parentElement) {
      for (const key of ["editorView", "__editorView", "_editorView", "view", "editor", "__tiptapEditor", "__vue__", "__vueParentComponent"]) add(safeProperty(element, key), 0);
      for (const key of Object.getOwnPropertyNames(element)) if (/editor|view|vue|react/i.test(key)) add(safeProperty(element, key), 0);
    }
    while (queue.length) {
      const item = queue.shift();
      const value = item.value;
      if (editorViewLike(value)) {
        const dom = safeProperty(value, "dom");
        if (dom === root || nodeContains(root, dom) || nodeContains(dom, root)) return { kind: "prosemirror", view: value, dom };
      }
      if (item.depth >= 4) continue;
      for (const key of ["editorView", "__editorView", "_editorView", "view", "editor", "__tiptapEditor", "__vue__", "__vueParentComponent", "proxy", "setupState", "ctx", "instance", "stateNode", "memoizedProps", "pendingProps", "return"]) add(safeProperty(value, key), item.depth + 1);
    }
    return null;
  }

  function activeEditBlockElement() {
    const selected = selectedEditBlock();
    return selected?.reference?.element || lastEditBlockElement || null;
  }

  function reportEditorDescriptor(blockElement = activeEditBlockElement()) {
    if (!isNewReportRoute()) return null;
    const controller = findReportEditorController(blockElement);
    const save = findNewReportActionControl("SAVE_DRAFT");
    const confirm = findNewReportActionControl("CONFIRM_SAVE_DRAFT");
    return {
      route: "new-report",
      stateModel: controller?.kind || "unavailable",
      modelAvailable: Boolean(controller),
      editorRootPath: controller?.dom ? editBlockDomPath(controller.dom) : "",
      saveStrategy: "SAVE_DRAFT/CONFIRM_SAVE_DRAFT",
      saveAction: save ? reportActionValue(save) || "label" : null,
      saveVisible: Boolean(save && isVisible(save)),
      saveEnabled: Boolean(save && !save.disabled && save.getAttribute?.("aria-disabled") !== "true"),
      confirmAvailable: Boolean(confirm),
    };
  }

  function findVisibleElementByAnyText(labels, selector = "button,.el-button,[role='button'],a,span,label,div") {
    const normalized = labels.map((label) => String(label).trim()).filter(Boolean);
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .find((element) => {
        const text = textOf(element);
        if (!text || text.length > 80) return false;
        return normalized.some((label) => text === label || text.includes(label));
      });
  }

  function elementDepth(element) {
    let depth = 0;
    let current = element;
    while (current?.parentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function findVisibleUploadDialog() {
    const candidates = new Set();
    const inputs = [...document.querySelectorAll('input[type="file"]:not([disabled])')];
    for (const input of inputs) {
      let current = input.parentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        if (isVisible(current)) {
          const text = textOf(current);
          const hasSave = [...current.querySelectorAll("button,.el-button,[role='button']")]
            .filter(isVisible)
            .some((button) => textOf(button) === "保存");
          const hasClose = Boolean(current.querySelector(
            ".el-dialog__headerbtn,.el-dialog__close,[aria-label='Close'],[aria-label='关闭'],[title='关闭'],[class*='__close'],[class$='-close']"
          )) || [...current.querySelectorAll("button,[role='button'],a,span,i,svg")]
            .filter(isVisible)
            .some((element) => ["×", "✕", "关闭", "Close"].includes(textOf(element)));
          if (hasSave && hasClose && /上传/.test(text)) candidates.add(current);
        }
        current = current.parentElement;
      }
    }
    return [...candidates]
      .sort((left, right) => {
        const inputDelta = right.querySelectorAll('input[type="file"]:not([disabled])').length
          - left.querySelectorAll('input[type="file"]:not([disabled])').length;
        return inputDelta || elementDepth(right) - elementDepth(left);
      })[0] || null;
  }

  function findLatestVisibleDialog() {
    const uploadDialog = findVisibleUploadDialog();
    if (uploadDialog) return uploadDialog;
    const dialogs = [...document.querySelectorAll(".el-dialog,[role='dialog']")]
      .filter(isVisible);
    return dialogs[dialogs.length - 1] || null;
  }

  function clickElement(element) {
    element.scrollIntoView?.({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }

  function findBodyHints() {
    const bodyText = document.body?.innerText || "";
    const lockMatch = bodyText.match(/.{0,20}编辑锁.{0,80}/);
    const permissionMatch = bodyText.match(/.{0,20}(无权限|权限不足|只读|不可编辑).{0,80}/);
    const loginLikely = /登录|Login/.test(bodyText) && !/资产基础法底稿/.test(bodyText);

    return {
      loginLikely,
      lockText: lockMatch?.[0]?.replace(/\s+/g, " ").trim() || null,
      permissionText: permissionMatch?.[0]?.replace(/\s+/g, " ").trim() || null,
    };
  }

  function getSpreadContext() {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    if (!host || !spread) {
      return {
        found: false,
        reason: host ? "SPREAD_CONTROL_NOT_READY" : "SPREAD_WRAPPER_NOT_FOUND",
      };
    }

    const sheet = spread.getActiveSheet?.();
    if (!sheet) {
      return {
        found: false,
        reason: "ACTIVE_SHEET_NOT_FOUND",
      };
    }

    const sheetCount = Number(spread.getSheetCount?.() || 0);
    const sheetNames = [];
    for (let i = 0; i < Math.min(sheetCount, 80); i += 1) {
      const candidate = spread.getSheet?.(i);
      if (candidate?.name) {
        sheetNames.push({
          index: i,
          name: candidate.name(),
          visible: candidate.visible?.() !== false,
        });
      }
    }

    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const rowCount = Number(sheet.getRowCount?.() || 0);
    const activeRow = Number(sheet.getActiveRowIndex?.());
    const activeCol = Number(sheet.getActiveColumnIndex?.());
    const safeActiveRow = Number.isFinite(activeRow) && activeRow >= 0 ? activeRow : null;
    const safeActiveCol = Number.isFinite(activeCol) && activeCol >= 0 ? activeCol : null;

    const headers = [];
    const cappedColumnCount = Math.min(columnCount, MAX_HEADER_COLUMNS);
    let fieldColumn = -1;

    for (let col = 0; col < cappedColumnCount; col += 1) {
      const title = String(sheet.getText?.(0, col) || sheet.getValue?.(0, col) || "").trim();
      headers.push({ col, name: colName(col), title });
      if (title === FIELD_TITLE) fieldColumn = col;
    }

    const targetRow = safeActiveRow === null || safeActiveRow < 1 ? 1 : safeActiveRow;
    const activeCell = safeActiveRow === null || safeActiveCol === null
      ? null
      : {
          row: safeActiveRow,
          col: safeActiveCol,
          address: `${colName(safeActiveCol)}${safeActiveRow + 1}`,
          text: sheet.getText?.(safeActiveRow, safeActiveCol) ?? null,
          value: sheet.getValue?.(safeActiveRow, safeActiveCol) ?? null,
        };

    let auditField = {
      title: FIELD_TITLE,
      found: fieldColumn >= 0,
      col: fieldColumn >= 0 ? fieldColumn : null,
      columnName: fieldColumn >= 0 ? colName(fieldColumn) : null,
      targetRow,
      targetAddress: fieldColumn >= 0 ? `${colName(fieldColumn)}${targetRow + 1}` : null,
    };

    if (fieldColumn >= 0) {
      const cellType = sheet.getCellType?.(targetRow, fieldColumn);
      auditField = {
        ...auditField,
        text: sheet.getText?.(targetRow, fieldColumn) ?? null,
        value: sheet.getValue?.(targetRow, fieldColumn) ?? null,
        tag: sheet.getTag?.(targetRow, fieldColumn) ?? null,
        cellType: cellType
          ? {
              constructorName: cellType.constructor?.name || null,
              domId: cellType.domId || null,
              isReadOnly: Boolean(cellType.isReadOnly),
              hasActivateEditor: typeof cellType.activateEditor === "function",
              isOperationUploadCell: cellType.domId === "operation-upload-cell",
            }
          : null,
      };
    }

    return {
      found: true,
      sheetName: sheet.name?.() || null,
      sheetNames,
      rowCount,
      columnCount,
      activeCell,
      headers,
      headersTruncated: columnCount > MAX_HEADER_COLUMNS,
      auditField,
    };
  }

  function collectVisibleSubjects(route, spread) {
    const subjects = [];
    const seen = new Set();

    function addSubject(subject) {
      const code = String(subject.subjectCode || "").trim();
      const key = `${code}|${subject.name || ""}`;
      if (!code || seen.has(key)) return;
      seen.add(key);
      subjects.push(subject);
    }

    if (route.subjectCode) {
      addSubject({
        subjectCode: route.subjectCode,
        name: spread?.sheetName || route.subjectCode,
        source: "current-url",
        active: true,
      });
    }

    const bodyText = document.body?.innerText || "";
    const codeMatches = bodyText.match(/\b[A-Z]\d+(?:-\d+){0,4}\b/g) || [];
    for (const code of codeMatches.slice(0, 80)) {
      addSubject({
        subjectCode: code,
        name: code,
        source: "visible-text",
        active: code === route.subjectCode,
      });
    }

    return subjects;
  }

  function collectSubjectTreeItems() {
    const subjectTreeSelectors = [".el-tree", "[role='tree']", ".subject-tree"];
    const activeText = textOf(document.querySelector(".is-current,.is-active,.el-tree-node.is-current,.el-tree-node__content.is-current"));
    const subjectNamePattern = /(资产|负债|权益|货币|银行|应收|应付|预付|预收|票据|账款|存货|借款|合同|税费|长期|短期|固定|无形|递延|资本|公积|利润|费用|收入|成本|工程|设备|房屋|土地|车辆|电子|办公|其他|一年内|流动|非流动)/;
    const excludedText = new Set([
      "阶段",
      "开始",
      "公式",
      "视图",
      "评估作业",
      "导入数据",
      "导出底稿",
      "科目通用文件",
      "汇率填充",
      "科目重分类",
      "科目重命名",
      "二级表",
      "关联数据同步",
      "显示/隐藏",
      "跳转汇总表",
      "保存",
      "刷新",
      "退出编辑",
    ]);
    const rootContainers = subjectTreeSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);

    const structuredItems = [];
    const seen = new Set();

    function cleanSubjectText(value) {
      return String(value || "")
        .trim();
    }
    function pushItem(text, depth, leaf, element, pathKey = "", pathTexts = [], subjectCode = "") {
      const cleanedText = cleanSubjectText(text);
      if (!cleanedText || cleanedText.length > 40 || /[：:]/.test(cleanedText)) return;
      if (excludedText.has(cleanedText)) return;
      const key = pathKey || `${cleanedText}|${depth}|${leaf ? 1 : 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      structuredItems.push({
        text: cleanedText,
        active: Boolean(
          element?.closest?.(".is-current,.is-active") ||
          element?.classList?.contains("is-current") ||
          element?.classList?.contains("is-active") ||
          (activeText && cleanedText === activeText)
        ),
        left: Number.isFinite(element?.getBoundingClientRect?.().left) ? Math.round(element.getBoundingClientRect().left) : 0,
        depth,
        leaf,
        path: pathTexts.join("/"),
        subjectCode: /^C\d+(?:-\d+)*$/.test(subjectCode) ? subjectCode : "",
        displayed: true,
      });
    }

    function readNodeText(nodeElement, content, label, component) {
      const data = component?.node?.data || component?.node?.raw || component?.data || {};
      const candidates = [
        data.subjectName,
        data.subject_name,
        data.name,
        data.label,
        data.text,
        data.title,
        data.accountName,
        data.account_name,
        content ? textOf(content) : "",
        label ? textOf(label) : "",
        textOf(nodeElement),
      ];
      return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
    }

    function readNodeCode(nodeElement, component) {
      const data = component?.node?.data || component?.node?.raw || component?.data || {};
      const candidates = [
        data.subjectCode,
        data.subject_code,
        data.assetSubjectCode,
        data.asset_subject_code,
        data.accountCode,
        data.account_code,
        data.code,
        data.value,
        data.id,
        data.key,
        data.route?.query?.subjectCode,
        data.query?.subjectCode,
        component?.node?.key,
        nodeElement?.getAttribute?.("data-subject-code"),
        nodeElement?.getAttribute?.("data-code"),
        nodeElement?.getAttribute?.("node-key"),
        nodeElement?.querySelector?.('a[href*="subjectCode="]')?.getAttribute?.("href"),
      ];
      for (const value of candidates) {
        const match = String(value || "").match(/\bC\d+(?:-\d+)*\b/);
        if (match) return match[0];
      }
      return "";
    }

  function arrayFromTreeChildren(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value[Symbol.iterator] === "function") return [...value];
    if (typeof value === "object") return Object.values(value).filter(Boolean);
    return [];
  }

    function walkNode(nodeElement, depth = 0, pathKey = "", pathTexts = []) {
      if (!nodeElement || !isVisible(nodeElement)) return;
      const component = nodeElement.__vue__ || nodeElement.__vueParentComponent?.proxy || null;
      const content = nodeElement.querySelector?.(":scope > .el-tree-node__content") || nodeElement.querySelector?.(".el-tree-node__content");
      const label = content?.querySelector?.(".el-tree-node__label")
        || nodeElement.querySelector?.(":scope > .el-tree-node__content .el-tree-node__label")
        || nodeElement.querySelector?.(".el-tree-node__content .el-tree-node__label");
      const text = cleanSubjectText(readNodeText(nodeElement, content, label, component));
      const childContainer = nodeElement.querySelector?.(":scope > .el-tree-node__children") || nodeElement.querySelector?.(".el-tree-node__children");
      const childNodes = childContainer ? [...childContainer.children].filter((child) => child.classList?.contains("el-tree-node")) : [];
      const componentChildren = arrayFromTreeChildren(component?.node?.childNodes || component?.childNodes).filter(Boolean);
      const leaf = !childNodes.length && !componentChildren.length
        || Boolean(content?.classList?.contains("is-leaf"))
        || Boolean(component?.node?.isLeaf)
        || Boolean(component?.data?.isLeaf);
      pushItem(text, depth, leaf, content || label || nodeElement, pathKey, pathTexts, readNodeCode(nodeElement, component));
      const nextChildren = childNodes.length ? childNodes : componentChildren.map((child) => child?.$el || child?.el || child?.vnode?.el).filter(Boolean);
      const nextPathTexts = text ? [...pathTexts, text] : pathTexts;
      for (const [index, child] of nextChildren.entries()) {
        walkNode(child, depth + 1, `${pathKey}.${index}`, nextPathTexts);
      }
    }

    for (const [containerIndex, container] of rootContainers.entries()) {
      const rootNodes = [...container.children].filter((child) => child.classList?.contains("el-tree-node"));
      if (!rootNodes.length) continue;
      for (const [index, rootNode] of rootNodes.entries()) {
        walkNode(rootNode, 0, `${containerIndex}.${index}`);
      }
    }

    if (structuredItems.length) {
      return structuredItems;
    }

    const candidates = [...document.querySelectorAll(".el-tree-node__content, .el-tree-node__label, [role='treeitem'], li, .subject-tree span, span, div")]
      .filter(isVisible)
      .map((element) => {
        const text = cleanSubjectText(textOf(element));
        const rect = element.getBoundingClientRect();
        const active = Boolean(
          element.closest(".is-current,.is-active") ||
          element.classList.contains("is-current") ||
          element.classList.contains("is-active") ||
          (activeText && text === activeText)
        );
        return { text, active, left: Math.round(rect.left) };
      })
      .filter((item) => {
        if (!item.text || item.text.length > 40 || /[：:]/.test(item.text)) return false;
        if (excludedText.has(item.text)) return false;
        if (item.left > 360) return false;
        return subjectNamePattern.test(item.text)
          || /(原材料|产成品|库存商品|在产品|半成品|周转材料|开发支出|商誉|长期股权投资|交易性金融资产|其他债权投资|债权投资|使用权资产)/.test(item.text);
      });

    const fallbackSeen = new Set();
    const unique = candidates
      .filter((item) => {
        const key = `${item.text}|${item.left}`;
        if (fallbackSeen.has(key)) return false;
        fallbackSeen.add(key);
        return true;
      })
      .slice(0, 120);
    const leftLevels = [...new Set(unique.map((item) => item.left))]
      .sort((a, b) => a - b);
    return unique.map((item, index) => {
      const next = unique[index + 1];
      const depth = Math.max(0, leftLevels.findIndex((left) => left === item.left));
      return {
        ...item,
        depth,
        leaf: !(next && next.left > item.left),
        displayed: true,
      };
    });
  }

  function isScrollableElement(element) {
    if (!element || !isVisible(element)) return false;
    const style = window.getComputedStyle?.(element);
    if (!style) return false;
    const overflowY = String(style.overflowY || style.overflow || "").toLowerCase();
    return (element.scrollHeight - element.clientHeight) > 4 && !["visible", "clip"].includes(overflowY);
  }

  function getTreeScrollTargets(rootContainers) {
    const targets = [];
    const seen = new Set();

    for (const container of rootContainers) {
      let current = container;
      while (current && current !== document.body) {
        if (isScrollableElement(current)) {
          const key = current === document.documentElement ? "documentElement" : current;
          if (!seen.has(key)) {
            seen.add(key);
            targets.push(current);
          }
          break;
        }
        current = current.parentElement;
      }
    }

    return targets;
  }

  async function expandSubjectTreeForCollection() {
    let clicked = 0;
    const rootContainers = [".el-tree", "[role='tree']", ".subject-tree"]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);
    for (let round = 0; round < 10; round += 1) {
      const toggles = [...new Set(rootContainers.flatMap((container) => [
        ...container.querySelectorAll(".el-tree-node__expand-icon,[class*='tree-node'][class*='expand'],[role='treeitem'] .el-icon-caret-right"),
      ]))]
        .filter(isVisible)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.left > 340) return false;
          const className = String(element.className || "");
          if (/is-leaf/.test(className)) return false;
          const node = element.closest?.(".el-tree-node,[role='treeitem'],li");
          const nodeText = textOf(node);
          if (!nodeText || nodeText.length > 120) return false;
          const expanded = node?.classList?.contains("is-expanded")
            || node?.getAttribute?.("aria-expanded") === "true"
            || element.getAttribute?.("aria-expanded") === "true";
          return !expanded;
        });
      if (!toggles.length) break;
      for (const toggle of toggles.slice(0, 40)) {
        clickElement(toggle);
        clicked += 1;
        await sleep(80);
      }
      await sleep(300);
    }
    return clicked;
  }

  async function listAssetDraftSubjects() {
    const before = collectSubjectTreeItems();
    const clicked = await expandSubjectTreeForCollection();
    const after = await collectSubjectTreeItemsByScrolling();
    return {
      ok: true,
      action: "list_asset_draft_subjects",
      collectedAt: new Date().toISOString(),
      url: location.href,
      subjects: after,
      expanded: clicked > 0,
      expandedClickCount: clicked,
      beforeCount: before.length,
    };
  }

  async function collectSubjectTreeItemsByScrolling() {
    const baseItems = collectSubjectTreeItems();
    const rootContainers = [".el-tree", "[role='tree']", ".subject-tree"]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);
    const scrollTargets = getTreeScrollTargets(rootContainers);

    if (!scrollTargets.length) {
      return baseItems;
    }

    const merged = [...baseItems];
    const seen = new Set(baseItems.map((item) => `${item.path || ""}|${item.text}|${item.depth}|${item.leaf ? 1 : 0}`));

    function mergeItems(items) {
      for (const item of items) {
        const key = `${item.path || ""}|${item.text}|${item.depth}|${item.leaf ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }

    for (const target of scrollTargets) {
      const originalTop = target.scrollTop;
      let lastTop = -1;
      let stuckCount = 0;

      for (let round = 0; round < 30; round += 1) {
        mergeItems(collectSubjectTreeItems());
        const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
        if (target.scrollTop >= maxTop - 2) break;

        const nextTop = Math.min(maxTop, target.scrollTop + Math.max(120, Math.floor(target.clientHeight * 0.8)));
        if (nextTop === target.scrollTop || nextTop === lastTop) {
          stuckCount += 1;
          if (stuckCount >= 2) break;
        } else {
          stuckCount = 0;
        }
        lastTop = target.scrollTop;
        target.scrollTop = nextTop;
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(160);
      }

      mergeItems(collectSubjectTreeItems());
      target.scrollTop = originalTop;
      target.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(80);
    }

    return merged;
  }

  function collectContext(options = {}) {
    const route = parseRoute();
    const controls = getVisibleControls();
    const saveButtons = findPageSaveButtons(true);
    const bodyHints = findBodyHints();
    const spread = getSpreadContext();
    const includeTree = Boolean(options.includeSubjectTree);
    const editingBlock = currentEditBlock();

    return {
      ok: true,
      collectedAt: new Date().toISOString(),
      build: { extensionVersion: EXTENSION_VERSION, extensionBuildId: EXTENSION_BUILD_ID, adapterVersion: ADAPTER_VERSION },
      url: location.href,
      title: document.title,
      route,
      page: {
        hasAssetDraftText: (document.body?.innerText || "").includes("资产基础法底稿"),
        saveButton: {
          visible: saveButtons.length > 0,
          count: saveButtons.length,
          disabled: saveButtons.length > 0 && saveButtons.every((button) => button.disabled),
          enabled: saveButtons.some((button) => !button.disabled && button.getAttribute?.("aria-disabled") !== "true"),
        },
        ...bodyHints,
      },
      spread,
      editingBlock,
      reportEditor: reportEditorDescriptor(activeEditBlockElement()),
      subjects: collectVisibleSubjects(route, spread),
      subjectTree: includeTree ? collectSubjectTreeItems() : [],
      controlsPreview: controls.slice(0, 24).map(serializeControl),
      security: {
        readOnlyContext: true,
        fixedWriteActionsEnabled: true,
        writesPerformed: false,
        credentialsCaptured: false,
      },
    };
  }

  function dialogVisibilityRoot(dialog) {
    if (!dialog) return null;
    return dialog.closest?.(".el-dialog__wrapper,.el-overlay,[role='presentation']") || dialog;
  }

  function isDialogOpen(dialog) {
    const root = dialogVisibilityRoot(dialog);
    if (!dialog?.isConnected || !root?.isConnected) return false;
    for (const element of [dialog, root]) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || element.getAttribute("aria-hidden") === "true") {
        return false;
      }
    }
    return isVisible(dialog) && isVisible(root);
  }

  async function waitForDialogClosed(dialog, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isDialogOpen(dialog)) return true;
      await sleep(100);
    }
    return !isDialogOpen(dialog);
  }

  function dialogCloseCandidates(dialog) {
    const standardSelectors = [
      ".el-dialog__headerbtn",
      ".el-dialog__close",
      "button[aria-label='Close']",
      "button[aria-label='关闭']",
      "[role='button'][aria-label='Close']",
      "[role='button'][aria-label='关闭']",
      "button[title='关闭']",
      "[class*='dialog-close']",
      "[class*='modal-close']",
      "[class*='__close']",
      "[class$='-close']",
    ].join(",");
    const semanticSelectors = "button,.el-button,[role='button'],a,span,i,svg";
    const candidates = [...dialog.querySelectorAll(standardSelectors)];
    for (const element of dialog.querySelectorAll(semanticSelectors)) {
      const label = String(
        element.getAttribute?.("aria-label")
        || element.getAttribute?.("title")
        || textOf(element)
        || ""
      ).trim();
      if (["×", "✕", "关闭", "Close"].includes(label)) candidates.push(element);
    }
    const expanded = [];
    for (const candidate of candidates) {
      const clickable = candidate.closest?.("button,.el-button,[role='button'],a") || candidate;
      expanded.push(clickable, candidate);
    }
    return [...new Set(expanded)].filter((element) => element && isVisible(element));
  }

  async function closeDialogWithoutConfirm(targetDialog = null) {
    const dialog = targetDialog || findLatestVisibleDialog();
    if (!dialog || !isDialogOpen(dialog)) return { closed: true, closedBy: "not_open", attempts: [] };
    const attempts = [];
    const closeCandidates = dialogCloseCandidates(dialog);
    for (const close of closeCandidates) {
      attempts.push("close_button");
      clickElement(close);
      if (await waitForDialogClosed(dialog, 700)) {
        return { closed: true, closedBy: "close_button", attempts };
      }
    }
    const cancel = [...dialog.querySelectorAll("button,.el-button,[role='button']")]
      .filter(isVisible)
      .find((button) => ["取消", "关闭"].includes(textOf(button)));
    if (cancel) {
      attempts.push("cancel");
      clickElement(cancel);
      if (await waitForDialogClosed(dialog, 700)) return { closed: true, closedBy: "cancel", attempts };
    }
    attempts.push("escape");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    if (await waitForDialogClosed(dialog, 700)) {
      return { closed: true, closedBy: "escape", attempts };
    }
    const wrapper = dialogVisibilityRoot(dialog);
    if (wrapper && wrapper !== dialog) {
      attempts.push("overlay");
      clickElement(wrapper);
    }
    return {
      closed: await waitForDialogClosed(dialog),
      closedBy: attempts.includes("overlay") ? "overlay" : "escape",
      attempts,
    };
  }

  async function listCompaniesFromSelector() {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "list_asset_draft_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      companies: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    const more = findVisibleElementByAnyText(["选择更多", "公司主体", "公司列表", "股权结构"], "button,.el-button,[role='button'],a,span,div");
    if (!more) {
      return {
        ...result,
        ok: false,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(900);

    const dialog = findLatestVisibleDialog() || document.body;
    const labelNodes = [...dialog.querySelectorAll(".el-checkbox__label")];
    const rawSource = labelNodes.length ? labelNodes : [...dialog.querySelectorAll(".el-checkbox,label,tr,li")];
    const rawItems = rawSource
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const box = element.closest?.(".el-checkbox") || element;
        const input = box.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || box.classList?.contains("is-checked") || box.querySelector?.(".is-checked"));
        const attrs = readElementDataset(element);
        const attrText = Object.values(attrs).join(" ");
        const code = pickCompanyCodeFromText(`${attrText} ${element.getAttribute?.("title") || ""} ${element.getAttribute?.("aria-label") || ""} ${text}`);
        return { text, checked, code, attrs };
      })
      .filter((item) => item.text && item.text.length <= 80 && !["全选", "全不选", "确定", "取消", "交叉关联"].includes(item.text));

    const seen = new Set();
    result.companies = rawItems
      .filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      })
      .map((item, index) => ({
        id: String(index + 1),
        label: item.text,
        code: item.code || "",
        selected: item.checked,
        raw: { attrs: item.attrs },
      }));
    result.dialogText = textOf(dialog).slice(0, 1500);
    result.close = await closeDialogWithoutConfirm(dialog);
    result.ok = Boolean(result.close.closed);
    result.reason = result.ok ? null : "DIALOG_CLOSE_FAILED";
    return result;
  }

  async function openCompanySelector() {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "open_company_selector",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
    };

    if (!gate.ok) return result;

    const more = findVisibleElementByAnyText(["选择更多", "公司主体", "公司列表", "股权结构"], "button,.el-button,[role='button'],a,span,div");
    if (!more) {
      return {
        ...result,
        ok: false,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(800);
    result.dialogText = textOf(findLatestVisibleDialog()).slice(0, 1500);
    result.ok = true;
    return result;
  }

  async function readSelectedCompaniesFromOpenDialog({ confirm = false } = {}) {
    const dialog = findLatestVisibleDialog();
    const result = {
      ok: Boolean(dialog),
      action: "read_selected_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      companies: [],
      confirmed: false,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!dialog) {
      return { ...result, reason: "COMPANY_DIALOG_NOT_OPEN" };
    }

    const items = [...dialog.querySelectorAll(".el-checkbox,label,tr,li")]
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const input = element.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || element.classList?.contains("is-checked") || element.querySelector?.(".is-checked"));
        return { text, checked };
      })
      .filter((item) => item.text && !["全选", "全不选", "确定", "取消"].includes(item.text));

    const seen = new Set();
    result.companies = items
      .filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      })
      .map((item, index) => ({
        id: String(index + 1),
        label: item.text,
        selected: item.checked,
      }));
    result.dialogText = textOf(dialog).slice(0, 1500);

    if (confirm) {
      const okButton = findVisibleElementByText("确定", "button,.el-button");
      if (!okButton) {
        return { ...result, ok: false, reason: "CONFIRM_BUTTON_NOT_FOUND" };
      }
      clickElement(okButton);
      await sleep(800);
      result.confirmed = true;
      result.security.writesPerformed = true;
    }

    return result;
  }

  function readCellText(cell) {
    const inner = cell?.querySelector?.(".cell") || cell;
    return (
      inner?.getAttribute?.("title") ||
      inner?.innerText ||
      inner?.textContent ||
      ""
    ).replace(/\s+/g, " ").trim();
  }

  function readElementDataset(element) {
    const result = {};
    for (const node of [element, element?.parentElement, element?.closest?.(".el-checkbox,.el-tree-node,tr,li")].filter(Boolean)) {
      for (const attr of node.getAttributeNames?.() || []) {
        if (/code|编码|no|seq|index|sort|level|tree/i.test(attr)) {
          result[attr] = node.getAttribute(attr);
        }
      }
    }
    return result;
  }

  function pickCompanyCodeFromText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const match = clean.match(/(?:^|[^\d])([1-9]\d{0,1}(?:-\d{1,2}){0,6})(?=\s|[^\d]|$)/);
    return match?.[1] || "";
  }

  function findHeaderIndex(headers, labels) {
    return headers.findIndex((header) => labels.some((label) => header === label || header.includes(label)));
  }

  async function listEquityTableCompanies() {
    const result = {
      ok: true,
      action: "list_equity_table_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      companies: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    function isInFixedTable(node) {
      return Boolean(node?.closest?.(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right"));
    }

    function scopedElements(container, selector, options = {}) {
      return [...container.querySelectorAll(selector)]
        .filter((node) => !options.excludeFixed || !isInFixedTable(node));
    }

    function collectTableHeaders(container, options = {}) {
      return scopedElements(container, ".el-table__header-wrapper th,thead th", options)
        .map(readCellText)
        .filter(Boolean);
    }

    function collectTableRows(container, options = {}) {
      return scopedElements(container, ".el-table__body-wrapper tbody tr,tbody tr", options)
        .filter(isVisible)
        .map((row) => [...row.querySelectorAll("td")].map(readCellText));
    }

    function rowsFromSingleTable(table) {
      const headers = collectTableHeaders(table, { excludeFixed: true });
      const codeIndex = findHeaderIndex(headers, ["编码", "公司编号", "层级编码", "序号"]);
      const nameIndex = findHeaderIndex(headers, ["公司名称", "企业名称"]);
      const shortNameIndex = findHeaderIndex(headers, ["公司简称", "简称"]);
      const parentIndex = findHeaderIndex(headers, ["上级母公司", "上级公司", "母公司"]);
      if (codeIndex < 0 || (nameIndex < 0 && shortNameIndex < 0)) return [];

      return collectTableRows(table, { excludeFixed: true }).map((cells) => ({
        code: cells[codeIndex] || "",
        name: nameIndex >= 0 ? cells[nameIndex] || "" : "",
        shortName: shortNameIndex >= 0 ? cells[shortNameIndex] || "" : "",
        parentName: parentIndex >= 0 ? cells[parentIndex] || "" : "",
        raw: { cells, headers },
        source: "equity-table",
      })).filter((item) => item.code && (item.name || item.shortName));
    }

    function rowsFromSplitElementTable(table) {
      const fixedTables = [...table.querySelectorAll(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right")]
        .filter(isVisible);

      const codeSource = fixedTables.find((node) => collectTableHeaders(node).some((header) => /编码|公司编号|层级编码|序号/.test(header)));
      const detailSource = table;
      if (!codeSource) return [];

      const codeHeaders = collectTableHeaders(codeSource);
      const detailHeaders = collectTableHeaders(detailSource, { excludeFixed: true });
      const codeIndex = findHeaderIndex(codeHeaders, ["编码", "公司编号", "层级编码", "序号"]);
      const nameIndex = findHeaderIndex(detailHeaders, ["公司名称", "企业名称"]);
      const shortNameIndex = findHeaderIndex(detailHeaders, ["公司简称", "简称"]);
      const parentIndex = findHeaderIndex(detailHeaders, ["上级母公司", "上级公司", "母公司"]);
      if (codeIndex < 0 || (nameIndex < 0 && shortNameIndex < 0)) return [];

      const codeRows = collectTableRows(codeSource);
      const detailRows = collectTableRows(detailSource, { excludeFixed: true }).filter((cells) => cells.length >= Math.min(detailHeaders.length, 1));
      return detailRows.map((cells, index) => ({
        code: codeRows[index]?.[codeIndex] || "",
        name: nameIndex >= 0 ? cells[nameIndex] || "" : "",
        shortName: shortNameIndex >= 0 ? cells[shortNameIndex] || "" : "",
        parentName: parentIndex >= 0 ? cells[parentIndex] || "" : "",
        raw: { cells, codeCells: codeRows[index] || [], headers: detailHeaders, codeHeaders },
        source: "equity-table-split",
      })).filter((item) => item.code && (item.name || item.shortName));
    }

    function rowsFromLooseTable(table) {
      return collectTableRows(table)
        .map((cells) => {
          const cleanCells = cells.map((cell) => String(cell || "").trim()).filter(Boolean);
          const code = cleanCells.map(pickCompanyCodeFromText).find(Boolean) || "";
          if (!code) return null;
          const names = cleanCells.filter((cell) => cell !== code && /[\u4e00-\u9fa5]/.test(cell));
          const preferredName = names.find((cell) => /公司|芯|科|光电|半导体|智算|扶摇|力通|迪吉/.test(cell)) || names[0] || "";
          return {
            code,
            name: preferredName,
            shortName: preferredName,
            parentName: "",
            raw: { cells, headers: collectTableHeaders(table) },
            source: "equity-table-loose",
          };
        })
        .filter((item) => item?.code && (item.name || item.shortName));
    }

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (document.querySelector(".el-table__body-wrapper tbody tr,tbody tr")) break;
      await sleep(300);
    }

    const tables = [...document.querySelectorAll(".el-table,table")].filter(isVisible);
    result.tableDiagnostics = tables.slice(0, 8).map((table, index) => ({
      index,
      className: table.className || "",
      headers: collectTableHeaders(table).slice(0, 30),
      headersWithoutFixed: collectTableHeaders(table, { excludeFixed: true }).slice(0, 30),
      fixedHeaders: [...table.querySelectorAll(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right")]
        .filter(isVisible)
        .map((node) => collectTableHeaders(node).slice(0, 30)),
      rowCount: collectTableRows(table).length,
      rowCountWithoutFixed: collectTableRows(table, { excludeFixed: true }).length,
    }));
    for (const table of tables) {
      result.companies = rowsFromSingleTable(table);
      if (!result.companies.length) result.companies = rowsFromSplitElementTable(table);
      if (!result.companies.length) result.companies = rowsFromLooseTable(table);

      if (result.companies.length) {
        result.headers = result.companies[0]?.raw?.headers || [];
        result.codeHeaders = result.companies[0]?.raw?.codeHeaders || [];
        break;
      }
    }

    if (!result.companies.length) {
      result.ok = false;
      result.reason = "EQUITY_TABLE_COMPANIES_NOT_FOUND";
      result.title = document.title;
      result.route = parseRoute();
      result.controlsPreview = getVisibleControls().slice(0, 80).map(serializeControl);
    }
    return result;
  }

  function assertDraftPage(context) {
    if (!context.route?.isAssetDraftRoute) {
      return { ok: false, reason: "NOT_ASSET_DRAFT_ROUTE" };
    }
    if (!context.page?.hasAssetDraftText) {
      return { ok: false, reason: "ASSET_DRAFT_TEXT_NOT_FOUND" };
    }
    if (!context.page?.saveButton?.visible) {
      return { ok: false, reason: "SAVE_BUTTON_NOT_FOUND" };
    }
    if (context.page.loginLikely) {
      return { ok: false, reason: "LOGIN_REQUIRED" };
    }
    return { ok: true };
  }

  function readDialogCompanyItems(dialog) {
    const primary = [...dialog.querySelectorAll(".el-checkbox,label")].filter(isVisible);
    const source = primary.length ? primary : [...dialog.querySelectorAll("tr,li")].filter(isVisible);
    const seen = new Set();
    return source
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const box = element.closest?.(".el-checkbox") || element;
        const input = box.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || box.classList?.contains("is-checked") || box.querySelector?.(".is-checked"));
        const attrs = readElementDataset(element);
        const attrText = Object.values(attrs).join(" ");
        const title = element.getAttribute?.("title") || "";
        const ariaLabel = element.getAttribute?.("aria-label") || "";
        const code = pickCompanyCodeFromText(`${attrText} ${title} ${ariaLabel} ${text}`);
        return { element, box, input, text, checked, attrs, code };
      })
      .filter((item) => item.text && item.text.length <= 120 && !["全选", "全不选", "确定", "取消", "交叉关联"].includes(item.text))
      .filter((item) => {
        const key = item.input || item.box || item.element;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizeMatchText(value) {
    return String(value || "")
      .replace(/[（(].*?[）)]/g, "")
      .replace(/有限公司|有限责任公司|股份有限公司|科技发展|科技|公司|\s|\.{3}|…/g, "")
      .trim();
  }

  function companySelectionTokens(company) {
    if (typeof company === "string") return [company].map(String).filter(Boolean);
    if (!company || typeof company !== "object") return [];
    return [
      company.code,
      company.shortName,
      company.name,
      company.title,
      company.id,
      company.value,
    ].map((value) => String(value || "").trim()).filter(Boolean);
  }

  function companyItemMatchesSelection(item, selection) {
    const tokens = companySelectionTokens(selection);
    const itemText = String(item.text || "").trim();
    const itemNormalized = normalizeMatchText(itemText);
    const itemAttrText = Object.values(item.attrs || {}).join(" ");
    return tokens.some((token) => {
      if (!token) return false;
      if (item.code && token === item.code) return true;
      if (itemText === token || itemText.includes(token)) return true;
      if (itemAttrText.includes(token)) return true;
      const normalized = normalizeMatchText(token);
      return normalized && (itemNormalized === normalized || itemNormalized.includes(normalized) || normalized.includes(itemNormalized));
    });
  }

  async function selectCompanyScope(scope, filters, selectedCompanies = []) {
    if (scope === "current") {
      return {
        ok: true,
        scope,
        action: "kept_current_company_scope",
      };
    }

    const more = findVisibleElementByText("选择更多");
    if (!more) {
      return {
        ok: false,
        scope,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(800);

    if (scope === "all") {
      const selectAll = findVisibleElementByText("全选");
      if (!selectAll) {
        return {
          ok: false,
          scope,
          reason: "SELECT_ALL_NOT_FOUND",
          dialogText: textOf(findLatestVisibleDialog()).slice(0, 1500),
        };
      }
      clickElement(selectAll);
      await sleep(500);
    } else if (scope === "partial") {
      const selections = (selectedCompanies || []).length
        ? selectedCompanies
        : (filters || []).map((item) => String(item).trim()).filter(Boolean);
      if (!selections.length) {
        return { ok: false, scope, reason: "PARTIAL_FILTERS_EMPTY" };
      }

      const clearButtons = ["清空", "取消全选", "重置"]
        .map((label) => findVisibleElementByText(label))
        .filter(Boolean);
      if (clearButtons[0]) {
        clickElement(clearButtons[0]);
        await sleep(300);
      }

      const dialog = findLatestVisibleDialog() || document.body;

      const clicked = [];
      const missing = [];
      for (const selection of selections) {
        const candidates = readDialogCompanyItems(dialog);
        const match = candidates.find((item) => companyItemMatchesSelection(item, selection));
        if (!match) {
          missing.push(selection);
          continue;
        }
        if (!match.checked) {
          const checkbox = match.input || match.box || match.element.closest?.("label") || match.element;
          clickElement(checkbox);
          await sleep(150);
        }
        clicked.push({
          text: match.text.slice(0, 120),
          code: match.code || "",
          expected: companySelectionTokens(selection).slice(0, 4),
        });
      }

      if (missing.length) {
        return {
          ok: false,
          scope,
          reason: "PARTIAL_COMPANY_NOT_FOUND",
          missing: missing.map((item) => companySelectionTokens(item).slice(0, 4)),
          selected: clicked,
          dialogText: textOf(dialog).slice(0, 1500),
        };
      }

      let candidates = readDialogCompanyItems(dialog);
      for (const item of candidates) {
        const shouldBeChecked = selections.some((selection) => companyItemMatchesSelection(item, selection));
        if (item.checked !== shouldBeChecked) {
          const checkbox = item.input || item.box || item.element.closest?.("label") || item.element;
          clickElement(checkbox);
          await sleep(120);
        }
      }

      const selectedAfter = readDialogCompanyItems(dialog)
        .filter((item) => item.checked)
        .map((item) => ({ text: item.text.slice(0, 120), code: item.code || "" }));
      const missingAfter = selections.filter((selection) => !selectedAfter.some((item) => companyItemMatchesSelection(item, selection)));
      const extraAfter = selectedAfter.filter((item) => !selections.some((selection) => companyItemMatchesSelection(item, selection)));
      if (missingAfter.length || extraAfter.length) {
        return {
          ok: false,
          scope,
          reason: "ACTUAL_COMPANY_SELECTION_MISMATCH",
          selected: clicked,
          selectedAfter,
          missingAfter: missingAfter.map((item) => companySelectionTokens(item).slice(0, 4)),
          extraAfter,
          dialogText: textOf(dialog).slice(0, 1500),
        };
      }

      return await confirmCompanySelection({ scope, selected: clicked, selectedAfter });
    }

    return await confirmCompanySelection({ scope });
  }

  async function confirmCompanySelection(extra = {}) {
    const okButton = findVisibleElementByText("确定");
    if (!okButton) {
      return {
        ok: false,
        ...extra,
        reason: "CONFIRM_BUTTON_NOT_FOUND",
        dialogText: textOf(findLatestVisibleDialog()).slice(0, 1500),
      };
    }

    clickElement(okButton);
    await sleep(1000);
    return {
      ok: true,
      ...extra,
      action: "company_scope_confirmed",
    };
  }

  function getPageMessages() {
    return [...document.querySelectorAll(".el-message,.el-notification,.el-message-box,.el-dialog")]
      .filter(isVisible)
      .map((element) => textOf(element))
      .filter(Boolean)
      .slice(-10);
  }

  function isTrackedSaveRequest(url, method = "GET") {
    const normalizedMethod = String(method || "GET").toUpperCase();
    const normalizedUrl = String(url || "").split("?")[0];
    if (isNewReportRoute() && window.__tianyuanWorkbenchTrackNewReportSave
      && ["POST", "PUT", "PATCH"].includes(normalizedMethod)
      && /\/ty\/api\//i.test(normalizedUrl)) return true;
    if (/attach\/upload|cell_file\/classify_upload|assignment_draft\/save/i.test(normalizedUrl)) return true;
    if (!["POST", "PUT", "PATCH"].includes(normalizedMethod)) return false;
    return /(?:^|[\/_-])(?:save|submit|commit)(?:[\/.?_-]|$)/i.test(normalizedUrl)
      || /(?:report|draft|document|content)[^?#]{0,80}(?:save|submit|commit)/i.test(normalizedUrl)
      || /(?:save|submit|commit)[^?#]{0,80}(?:report|draft|document|content)/i.test(normalizedUrl);
  }

  function installUploadNetworkMonitor() {
    if (window.__tianyuanWorkbenchUploadNetworkPatched) {
      window.__tianyuanWorkbenchUploadNetworkUnpatch?.();
      if (window.__tianyuanWorkbenchUploadNetworkPatched) window.__tianyuanWorkbenchUploadNetworkPatched = false;
    }
    if (window.__tianyuanWorkbenchUploadNetworkPatched) return;
    const XHR = typeof XMLHttpRequest === "function" ? XMLHttpRequest : null;
    if (!XHR?.prototype && typeof window.fetch !== "function") {
      window.__tianyuanWorkbenchUploadNetworkPatched = false;
      return;
    }
    window.__tianyuanWorkbenchUploadNetworkPatched = true;
    if (!Array.isArray(window.__tianyuanWorkbenchUploadNetworkLog)) window.__tianyuanWorkbenchUploadNetworkLog = [];

    const push = (item) => {
      try {
        if (!isTrackedSaveRequest(item.url, item.method)) return;
        window.__tianyuanWorkbenchUploadNetworkLog.push({
          method: String(item.method || "").toUpperCase(),
          url: String(item.url || ""),
          status: Number(item.status || 0),
          response: String(item.response || "").slice(0, 1600),
          at: new Date().toISOString(),
        });
      } catch {
        // Network evidence is best effort and never contains request credentials.
      }
    };

    const originalOpen = XHR?.prototype?.open;
    const originalSend = XHR?.prototype?.send;
    if (XHR?.prototype) {
      XHR.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__tianyuanWorkbenchRequest = { method, url: String(url) };
        return originalOpen.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function patchedSend(...args) {
        this.addEventListener("loadend", () => {
          push({
            ...this.__tianyuanWorkbenchRequest,
            status: this.status,
            response: this.responseText,
          });
        }, { once: true });
        return originalSend.apply(this, args);
      };
    }

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = async function patchedFetch(input, init) {
        const response = await originalFetch.call(this, input, init);
        const url = typeof input === "string" ? input : input?.url;
        const method = init?.method || input?.method || "GET";
        if (isTrackedSaveRequest(url, method)) {
          const clone = response.clone();
          clone.text().then((responseText) => push({
            method,
            url,
            status: response.status,
            response: responseText,
          })).catch(() => {});
        }
        return response;
      };
    }
    window.__tianyuanWorkbenchUploadNetworkUnpatch = () => {
      if (XHR?.prototype) {
        XHR.prototype.open = originalOpen;
        XHR.prototype.send = originalSend;
      }
      if (typeof originalFetch === "function") window.fetch = originalFetch;
      window.__tianyuanWorkbenchUploadNetworkPatched = false;
      window.__tianyuanWorkbenchUploadNetworkUnpatch = null;
    };
  }

  function parseNetworkResponse(responseText) {
    try {
      const parsed = JSON.parse(responseText || "{}");
      return {
        parsed,
        success: parsed?.ok === true
          || parsed?.success === true
          || parsed?.code === 0
          || parsed?.code === "0"
          || parsed?.code === 200
          || parsed?.code === "200"
          || /成功/.test(String(parsed?.message || parsed?.msg || "")),
      };
    } catch {
      return { parsed: null, success: false };
    }
  }

  function networkEvidenceSince(startIndex) {
    return (window.__tianyuanWorkbenchUploadNetworkLog || [])
      .slice(startIndex)
      .filter((item) => isTrackedSaveRequest(item.url, item.method))
      .map((item) => {
        const parsed = parseNetworkResponse(item.response);
        const responseBody = parsed.parsed && typeof parsed.parsed === "object" ? parsed.parsed : {};
        const classificationValue = /cell_file\/classify_upload/.test(item.url || "")
          ? findClassificationValue(responseBody)
          : "";
        return {
          method: item.method,
          url: item.url,
          status: item.status,
          businessSuccess: parsed.success,
          businessCode: responseBody.code ?? responseBody.status ?? null,
          businessMessage: String(responseBody.msg || responseBody.message || responseBody.error || "").slice(0, 300),
          classificationValue,
          response: item.response,
          at: item.at,
        };
      });
  }

  function findClassificationValue(value, depth = 0) {
    if (depth > 6 || value === null || value === undefined) return "";
    if (typeof value === "string") {
      return value.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] || "";
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findClassificationValue(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      const preferredKeys = ["batchId", "batchNo", "batchValue", "classifyId", "classificationId", "data", "result"];
      for (const key of preferredKeys) {
        if (!Object.hasOwn(value, key)) continue;
        const found = findClassificationValue(value[key], depth + 1);
        if (found) return found;
      }
      for (const nested of Object.values(value)) {
        const found = findClassificationValue(nested, depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  async function saveDraftWithNetworkEvidence(networkStart, waitMs = 7000) {
    const pageSave = findPageSaveButtons()[0];
    if (!pageSave) return { ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", saveNetwork: [] };
    clickElement(pageSave);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(waitMs);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const ok = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && (item.businessSuccess || !String(item.response || "").trim())
    );
    return { ok, reason: ok ? null : "DRAFT_SAVE_NOT_CONFIRMED", saveNetwork, messages: getPageMessages() };
  }

  async function waitForUploadClassification(networkStart, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const evidence = networkEvidenceSince(networkStart);
      const attach = evidence.find((item) =>
        /attach\/upload/.test(item.url || "")
        && item.status >= 200
        && item.status < 300
        && item.businessSuccess
      );
      const classify = evidence.find((item) =>
        /cell_file\/classify_upload/.test(item.url || "")
        && item.status >= 200
        && item.status < 300
        && item.businessSuccess
      );
      if (attach && classify) return evidence;
      await sleep(200);
    }
    return networkEvidenceSince(networkStart);
  }

  function uploadConfirmationSummary(evidence) {
    const latest = (pattern) => [...evidence].reverse().find((item) => pattern.test(item.url || "")) || null;
    const summarize = (item) => item ? {
      url: item.url,
      status: item.status,
      businessSuccess: Boolean(item.businessSuccess),
      businessCode: item.businessCode,
      businessMessage: item.businessMessage || "",
      at: item.at,
    } : null;
    return {
      attach: summarize(latest(/attach\/upload/)),
      classify: summarize(latest(/cell_file\/classify_upload/)),
    };
  }

  async function waitForUploadDialogSettled(timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!findVisibleUploadDialog()) {
        await sleep(350);
        if (!findVisibleUploadDialog()) return true;
      }
      await sleep(150);
    }
    return !findVisibleUploadDialog();
  }

  function findDialogFileInputs(dialog) {
    return [...(dialog?.querySelectorAll?.('input[type="file"]') || [])]
      .filter((input) => !input.disabled);
  }

  function describeDialogFileInputs(dialog) {
    return findDialogFileInputs(dialog).map((input, index) => {
      let owner = input.parentElement;
      for (let depth = 0; depth < 4 && owner; depth += 1, owner = owner.parentElement) {
        const ownerText = textOf(owner);
        if (ownerText && ownerText.length <= 160) {
          return {
            index,
            accept: input.accept || "",
            multiple: Boolean(input.multiple),
            label: ownerText,
          };
        }
      }
      return {
        index,
        accept: input.accept || "",
        multiple: Boolean(input.multiple),
        label: "",
      };
    });
  }

  function directTextOf(node) {
    return [...(node?.childNodes || [])]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => String(child.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function describeDialogUploadPositions(dialog) {
    const blocked = new Set(["保存", "取消", "确定", "确认", "批量删除", "关联", "下载"]);
    const dialogTitle = textOf(dialog.querySelector(".el-dialog__title,[role='heading']"));
    const candidates = [...dialog.querySelectorAll("label,.el-form-item__label,[role='option'],li,span,div")]
      .filter(isVisible)
      .map((node) => directTextOf(node))
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length >= 1 && text.length <= 40)
      .filter((text) => text !== dialogTitle && !/-上传$/.test(text))
      .filter((text) => !blocked.has(text))
      .filter((text) => !/支持扩展名|上传文件|取消选择|请选择/.test(text))
      .filter((text) => !/\.(pdf|docx?|xlsx?|xlsm|jpg|jpeg|png)$/i.test(text))
      .filter((text) => !/^[\d\s.,:/_-]+$/.test(text));
    const unique = [...new Set(candidates)];
    const inputCount = findDialogFileInputs(dialog).length;
    const fallback = Array.from({ length: inputCount }, (_, index) => `位置 ${index + 1}`);
    return Array.from({ length: inputCount }, (_, index) => ({
      index,
      label: unique[index] || fallback[index],
    }));
  }

  function selectedDialogFiles(dialog) {
    return findDialogFileInputs(dialog).flatMap((input, inputIndex) =>
      [...(input.files || [])].map((file) => ({
        inputIndex,
        name: file.name || "",
        size: Number(file.size || 0),
        type: file.type || "",
      }))
    );
  }

  async function clearDialogFileInputs(dialog) {
    const before = selectedDialogFiles(dialog);
    for (const input of findDialogFileInputs(dialog)) {
      try {
        input.value = "";
        const emptyTransfer = new DataTransfer();
        input.files = emptyTransfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        // File input clearing is best effort; rendered filenames remain the final residual gate.
      }
    }
    await sleep(250);
    return {
      before,
      after: selectedDialogFiles(dialog),
    };
  }

  function chooseDialogFileInput(dialog, payload) {
    const inputs = findDialogFileInputs(dialog);
    const requestedName = String(payload?.moduleName || "").trim();
    if (requestedName) {
      const described = describeDialogFileInputs(dialog);
      const match = inputs
        .map((input, index) => ({ input, index, text: described[index]?.label || textOf(input.parentElement?.parentElement || input.parentElement) }))
        .find((item) => item.text.includes(requestedName));
      if (match) return match;
    }
    const index = Number.isInteger(payload?.moduleIndex) ? payload.moduleIndex : 0;
    return inputs[index] ? { input: inputs[index], index } : null;
  }

  async function waitForVisibleDialog(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dialog = findLatestVisibleDialog();
      if (dialog) return dialog;
      await sleep(100);
    }
    return null;
  }

  function locateAuditUploadCell(payload) {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = resolveSheet(spread, payload?.sheetName);
    if (!host || !spread || !sheet) {
      return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    }
    const fieldTitle = String(payload?.fieldTitle || FIELD_TITLE).trim();
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const requestedColumn = Number(payload?.fieldColumn);
    let col = Number.isInteger(requestedColumn) && requestedColumn >= 0 && requestedColumn < columnCount
      ? requestedColumn
      : -1;
    if (col < 0) {
      for (let candidate = 0; candidate < columnCount; candidate += 1) {
        const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
        if (title === fieldTitle) {
          col = candidate;
          break;
        }
      }
    }
    if (col < 0) return { ok: false, reason: "FIELD_NOT_FOUND", fieldTitle };

    const rowNumber = Number(payload?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
      return { ok: false, reason: "ROW_NUMBER_INVALID", rowNumber };
    }
    const row = rowNumber - 1;
    const cellType = sheet.getCellType?.(row, col);
    const location = {
      sheet,
      spread,
      sheetName: sheet.name?.() || "",
      row,
      col,
      address: `${colName(col)}${rowNumber}`,
      fieldTitle,
      text: sheet.getText?.(row, col) ?? null,
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
      cellType: cellType ? {
        domId: cellType.domId || null,
        isReadOnly: Boolean(cellType.isReadOnly),
        hasActivateEditor: typeof cellType.activateEditor === "function",
      } : null,
    };
    if (!cellType || cellType.domId !== "operation-upload-cell" || typeof cellType.activateEditor !== "function") {
      return { ok: false, reason: "NOT_UPLOAD_CELL", location };
    }
    return { ok: true, ...location, rawCellType: cellType };
  }

  async function inspectBatchUploadTarget(payload = {}) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    if (!gate.ok) return { ok: false, action: "inspect_batch_upload_target", gate, reason: gate.reason };
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = resolveSheet(spread, payload.sheetName);
    if (!host || !spread || !sheet) {
      return { ok: false, action: "inspect_batch_upload_target", reason: "SHEET_NOT_FOUND", sheets: context.spread?.sheetNames || [] };
    }
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const rowCount = Number(sheet.getRowCount?.() || 0);
    const columns = [];
    const sampleRows = [];
    for (let row = 1; row < Math.min(rowCount, 16); row += 1) sampleRows.push(row);
    for (let col = 0; col < Math.min(columnCount, MAX_HEADER_COLUMNS); col += 1) {
      const title = String(sheet.getText?.(0, col) || sheet.getValue?.(0, col) || "").trim();
      const samples = sampleRows.map((row) => {
        const cellType = sheet.getCellType?.(row, col);
        return {
          row: row + 1,
          domId: cellType?.domId || null,
          isReadOnly: Boolean(cellType?.isReadOnly),
          hasActivateEditor: typeof cellType?.activateEditor === "function",
        };
      });
      const uploadSample = samples.find((item) => item.domId === "operation-upload-cell" && item.hasActivateEditor);
      const manualOnly = title === "查证核对情况";
      columns.push({
        col,
        address: colName(col),
        title,
        uploadCapable: !manualOnly && Boolean(uploadSample),
        manualOnly,
        sampleRow: uploadSample?.row || null,
        reason: manualOnly
          ? "该列暂由人工填写"
          : (uploadSample ? null : (title ? "未识别为 operation-upload-cell" : "列标题为空")),
      });
    }
    return {
      ok: true,
      action: "inspect_batch_upload_target",
      route: context.route,
      sheetName: sheet.name?.() || "",
      sheets: context.spread?.sheetNames || [],
      rowCount,
      columns,
      security: { readOnly: true, writesPerformed: false, credentialsCaptured: false },
    };
  }

  async function inspectBatchUploadPositions(payload = {}) {
    const preview = await prepareAuditAttachmentUpload(payload);
    return {
      ...preview,
      action: "inspect_batch_upload_positions",
      positions: preview.dialog?.positions || [],
      security: {
        ...(preview.security || {}),
        readOnly: true,
        writesPerformed: false,
        credentialsCaptured: false,
      },
    };
  }

  async function ensureAuditProcedureForRow(spread, sheet, row, procedureText) {
    const requested = String(procedureText || "").trim();
    if (!requested) return { ok: true, skipped: true, reason: "PROCEDURE_TEXT_EMPTY" };
    const procedureInfo = findFieldColumn(sheet, "查证类核实程序");
    if (procedureInfo.col < 0) return { ok: false, reason: "AUDIT_PROCEDURE_FIELD_NOT_FOUND" };
    const before = getSheetCellSnapshot(sheet, row, procedureInfo.col);
    if (cellHasContent(before)) {
      return {
        ok: true,
        skipped: true,
        reason: "PROCEDURE_ALREADY_FILLED",
        address: `${colName(procedureInfo.col)}${row + 1}`,
        before,
      };
    }
    const cellType = sheet.getCellType?.(row, procedureInfo.col);
    if (cellType?.isReadOnly) {
      return {
        ok: false,
        reason: "AUDIT_PROCEDURE_CELL_READONLY",
        address: `${colName(procedureInfo.col)}${row + 1}`,
        before,
      };
    }
    sheet.setValue(row, procedureInfo.col, requested);
    sheet.setActiveCell(row, procedureInfo.col);
    sheet.setSelection(row, procedureInfo.col, 1, 1);
    spread?.focus?.();
    await sleep(300);
    let after = getSheetCellSnapshot(sheet, row, procedureInfo.col);
    if (typeof cellType?.activateEditor === "function") {
      try {
        await cellType.activateEditor(true, null, null, {
          sheet,
          row,
          col: procedureInfo.col,
        });
        await sleep(300);
        const optionElement = findVisibleElementByAnyText(
          [requested],
          ".el-select-dropdown__item,[role='option'],li,button,.el-button,span,div",
        );
        if (optionElement) {
          clickElement(optionElement);
          await sleep(500);
          after = getSheetCellSnapshot(sheet, row, procedureInfo.col);
        }
      } catch {
        // Direct value assignment remains the fallback; classify/save evidence decides success.
      }
    }
    return {
      ok: true,
      skipped: false,
      address: `${colName(procedureInfo.col)}${row + 1}`,
      before,
      after,
    };
  }

  async function prepareAuditAttachmentUpload(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "preview_audit_attachment_upload",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const target = locateAuditUploadCell(payload);
    result.target = target.ok ? {
      sheetName: target.sheetName,
      row: target.row,
      col: target.col,
      address: target.address,
      fieldTitle: target.fieldTitle,
      before: { text: target.text, value: target.value, tag: target.tag },
      cellType: target.cellType,
    } : target.location;
    if (!target.ok) return { ...result, ok: false, reason: target.reason };
    if (target.cellType?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return {
        ...result,
        ok: false,
        reason: "READONLY_OR_LOCKED",
        lockText: context.page?.lockText || null,
        permissionText: context.page?.permissionText || null,
      };
    }

    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await target.rawCellType.activateEditor(true, null, null, {
      sheet: target.sheet,
      row: target.row,
      col: target.col,
    });
    const dialog = await waitForVisibleDialog();
    if (!dialog) return { ...result, ok: false, reason: "DIALOG_NOT_OPENED" };
    result.dialog = {
      text: textOf(dialog).slice(0, 1600),
      inputs: describeDialogFileInputs(dialog),
      positions: describeDialogUploadPositions(dialog),
    };
    result.steps = [{ ok: true, step: "locate_upload_dialog", message: "已打开评估核实附件分类弹窗，未注入文件。" }];
    result.dialogClose = await closeDialogWithoutConfirm(dialog);
    result.ok = Boolean(result.dialogClose.closed);
    result.reason = result.ok ? null : "UPLOAD_DIALOG_CLOSE_FAILED";
    return result;
  }

  function fileFromBase64(filePayload) {
    const raw = String(filePayload?.base64 || "");
    if (!raw) throw new Error("ATTACHMENT_DATA_EMPTY");
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], String(filePayload.name || "attachment"), {
      type: String(filePayload.type || "application/octet-stream"),
      lastModified: Date.now(),
    });
  }

  async function uploadAuditAttachment(payload) {
    const initialDialogClose = await closeDialogWithoutConfirm();
    await sleep(200);
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "upload_audit_attachment",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (!initialDialogClose.closed && findLatestVisibleDialog()) {
      return { ...result, ok: false, reason: "UPLOAD_DIALOG_BLOCKING_NEXT", dialogClose: initialDialogClose };
    }
    if (payload?.confirmText !== "确认上传并保存") {
      return { ...result, ok: false, reason: "UPLOAD_CONFIRM_TEXT_REQUIRED" };
    }
    const target = locateAuditUploadCell(payload);
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target: target.location };
    const procedure = await ensureAuditProcedureForRow(target.spread, target.sheet, target.row, payload?.procedureText);
    result.target = {
      sheetName: target.sheetName,
      row: target.row,
      col: target.col,
      address: target.address,
      fieldTitle: target.fieldTitle,
      before: { text: target.text, value: target.value, tag: target.tag },
      procedure,
    };
    if (!procedure.ok) return { ...result, ok: false, reason: procedure.reason, target: result.target };
    if (target.cellType?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return {
        ...result,
        ok: false,
        reason: "READONLY_OR_LOCKED",
        lockText: context.page?.lockText || null,
        permissionText: context.page?.permissionText || null,
      };
    }
    if (!payload.file?.base64 || !payload.file?.name) {
      return { ...result, ok: false, reason: "ATTACHMENT_FILE_PAYLOAD_MISSING" };
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    if (payload?.procedureText && !procedure.skipped) {
      const procedureSave = await saveDraftWithNetworkEvidence(networkStart, 3500);
      result.procedureSave = procedureSave;
      if (!procedureSave.ok) {
        return { ...result, ok: false, reason: procedureSave.reason || "AUDIT_PROCEDURE_SAVE_FAILED" };
      }
    }
    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await target.rawCellType.activateEditor(true, null, null, {
      sheet: target.sheet,
      row: target.row,
      col: target.col,
    });
    const dialog = await waitForVisibleDialog();
    if (!dialog) return { ...result, ok: false, reason: "DIALOG_NOT_OPENED" };
    const residualCleanup = await clearDialogFileInputs(dialog);
    const residualFiles = residualCleanup.after;
    const dialogTextBeforeInject = textOf(dialog).slice(0, 1600);
    const renderedResidualFiles = residualCleanup.before.filter((file) =>
      file.name && dialogTextBeforeInject.includes(file.name)
    );
    if (renderedResidualFiles.length || (payload.file?.name && dialogTextBeforeInject.includes(payload.file.name))) {
      await closeDialogWithoutConfirm(dialog);
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_DIALOG_HAS_RESIDUAL_FILES",
        residualFiles: renderedResidualFiles,
        residualCleanup,
        dialogText: dialogTextBeforeInject,
      };
    }
    result.residualCleanup = {
      clearedCount: residualCleanup.before.length - residualFiles.length,
      hiddenResidualCount: residualFiles.length,
    };
    const selected = chooseDialogFileInput(dialog, payload);
    if (!selected) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_MODULE_NOT_FOUND",
        modules: describeDialogFileInputs(dialog),
      };
    }
    findDialogFileInputs(dialog).forEach((input, index) => {
      if (index === selected.index) return;
      try {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        // Some browsers disallow programmatic file input clearing; upload proof will catch any duplicate side effect.
      }
    });
    const file = fileFromBase64(payload.file);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    selected.input.files = transfer.files;
    selected.input.dispatchEvent(new Event("input", { bubbles: true }));
    selected.input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(900);
    result.steps.push({
      ok: true,
      step: "inject_file",
      moduleIndex: selected.index,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    const saveDialogButton = [...dialog.querySelectorAll("button,.el-button")]
      .filter(isVisible)
      .find((button) => textOf(button) === "保存");
    if (!saveDialogButton || saveDialogButton.disabled) {
      return { ...result, ok: false, reason: "UPLOAD_DIALOG_SAVE_NOT_AVAILABLE", dialogText: textOf(dialog).slice(0, 1600) };
    }
    clickElement(saveDialogButton);
    result.security.uploadPerformed = true;
    result.steps.push({ ok: true, step: "click_upload_dialog_save" });
    const afterUploadNetwork = await waitForUploadClassification(networkStart);
    result.uploadNetwork = afterUploadNetwork;
    result.uploadConfirmation = uploadConfirmationSummary(afterUploadNetwork);
    const attach = afterUploadNetwork.find((item) =>
      /attach\/upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    const classify = afterUploadNetwork.find((item) =>
      /cell_file\/classify_upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    if (!attach || !classify) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_OR_CLASSIFY_NOT_CONFIRMED",
        procedureAfterUpload: result.target?.procedure || null,
        dialogText: dialog ? textOf(dialog).slice(0, 1600) : "",
        dialogMessages: getPageMessages(),
        uploadConfirmation: result.uploadConfirmation,
      };
    }
    result.classificationValue = classify.classificationValue || "";
    result.steps.push({ ok: true, step: "upload_and_classify", attachmentUploaded: true, classificationGenerated: true });
    try {
      selected.input.value = "";
      selected.input.dispatchEvent(new Event("input", { bubbles: true }));
      selected.input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      // The completed request evidence is authoritative even if the browser refuses to clear the file input.
    }
    result.dialogClose = await closeDialogWithoutConfirm(dialog);
    result.dialogSettled = await waitForUploadDialogSettled();
    result.dialogCloseWarning = result.dialogSettled ? null : "UPLOAD_DIALOG_CLOSE_PENDING";

    const finalNetwork = networkEvidenceSince(networkStart);
    const after = locateAuditUploadCell(payload);
    const afterText = after.ok ? { text: after.text, value: after.value, tag: after.tag } : null;
    const afterMessages = getPageMessages();
    result.saveNetwork = finalNetwork.filter((item) => /assignment_draft\/save/.test(item.url || ""));
    result.after = afterText;
    result.messages = afterMessages;
    result.readbackConsistent = Boolean(afterText?.text || afterText?.value || afterText?.tag);
    if (payload?.deferSave) {
      result.saveDeferred = true;
      result.security.writesPerformed = false;
      result.ok = Boolean(attach && classify);
      result.reason = result.ok ? null : "UPLOAD_OR_CLASSIFY_NOT_CONFIRMED";
      return result;
    }
    const draftSaveResult = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const draftSave = draftSaveResult.saveNetwork.find((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    result.saveNetwork = [...result.saveNetwork, ...draftSaveResult.saveNetwork];
    result.readbackConsistent = Boolean(draftSave && (afterText?.text || afterText?.value || afterText?.tag));
    result.security.writesPerformed = Boolean(draftSave);
    result.ok = Boolean(draftSave && result.readbackConsistent);
    result.reason = result.ok ? null : (draftSave ? "DRAFT_CELL_READBACK_EMPTY" : "DRAFT_SAVE_NOT_CONFIRMED");
    return result;
  }

  async function saveBatchUploadDraft(payload = {}) {
    const dialogClose = await closeDialogWithoutConfirm();
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "save_batch_upload_draft",
      collectedAt: new Date().toISOString(),
      gate,
      security: { credentialsCaptured: false, uploadPerformed: false, writesPerformed: false },
    };
    if (!gate.ok) return result;
    result.dialogClose = dialogClose;
    if (!dialogClose.closed && findLatestVisibleDialog()) {
      return { ...result, ok: false, reason: "UPLOAD_DIALOG_BLOCKING_SAVE" };
    }
    if (payload?.confirmText !== "确认批量上传并保存") {
      return { ...result, ok: false, reason: "BATCH_UPLOAD_CONFIRM_TEXT_REQUIRED" };
    }
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const rowNumbers = [...new Set((Array.isArray(payload.rowNumbers) ? payload.rowNumbers : [])
      .map(Number)
      .filter((row) => Number.isInteger(row) && row >= 2))];
    if (!rowNumbers.length) return { ...result, ok: false, reason: "BATCH_UPLOAD_ROWS_REQUIRED" };
    const expectedByRow = new Map();
    for (const item of Array.isArray(payload.expectedIndexValues) ? payload.expectedIndexValues : []) {
      const rowNumber = Number(item && typeof item === "object" ? item.rowNumber : 0);
      const value = String(item && typeof item === "object" ? item.value : item || "").trim();
      if (!Number.isInteger(rowNumber) || rowNumber < 2 || !value) continue;
      if (!expectedByRow.has(rowNumber)) expectedByRow.set(rowNumber, new Set());
      expectedByRow.get(rowNumber).add(value);
    }
    if (!expectedByRow.size || rowNumbers.some((rowNumber) => !expectedByRow.has(rowNumber))) {
      return { ...result, ok: false, reason: "BATCH_UPLOAD_EXPECTED_READBACK_REQUIRED" };
    }
    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    const save = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const readbacks = rowNumbers.map((rowNumber) => {
      const target = locateAuditUploadCell({ ...payload, rowNumber });
      const after = target.ok ? { text: target.text, value: target.value, tag: target.tag } : null;
      const serialized = JSON.stringify(after || {});
      const expectedValues = [...(expectedByRow.get(rowNumber) || [])];
      const matchedValues = expectedValues.filter((value) => serialized.includes(value));
      return {
        rowNumber,
        ok: Boolean(target.ok && expectedValues.length && matchedValues.length === expectedValues.length),
        expectedValues,
        matchedValues,
        after,
      };
    });
    const readbackConsistent = readbacks.every((item) => item.ok);
    result.saveNetwork = save.saveNetwork || [];
    result.readbacks = readbacks;
    result.readbackConsistent = Boolean(save.ok && readbackConsistent);
    result.security.writesPerformed = Boolean(save.ok);
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (save.ok ? "BATCH_UPLOAD_READBACK_MISMATCH" : save.reason || "DRAFT_SAVE_NOT_CONFIRMED");
    return result;
  }

  async function batchUploadAuditAttachments(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "batch_upload_audit_attachments",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认批量上传并保存") {
      return { ...result, ok: false, reason: "BATCH_UPLOAD_CONFIRM_TEXT_REQUIRED" };
    }
    const rowNumber = Number(payload?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
      return { ...result, ok: false, reason: "ROW_NUMBER_INVALID", rowNumber };
    }
    const files = (Array.isArray(payload?.files) ? payload.files : [])
      .filter((item) => item?.base64 && item?.name)
      .slice(0, 20);
    if (!files.length) return { ...result, ok: false, reason: "BATCH_UPLOAD_FILES_REQUIRED" };

    const target = locateAuditUploadCell(payload);
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target: target.location };
    result.target = {
      sheetName: target.sheetName,
      row: target.row,
      rowNumber,
      col: target.col,
      address: target.address,
      fieldTitle: target.fieldTitle,
      before: { text: target.text, value: target.value, tag: target.tag },
    };
    if (cellHasContent(result.target.before)) {
      return { ...result, ok: false, reason: "BATCH_UPLOAD_ROW_ALREADY_HAS_INDEX", target: result.target };
    }
    if (target.cellType?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return {
        ...result,
        ok: false,
        reason: "READONLY_OR_LOCKED",
        lockText: context.page?.lockText || null,
        permissionText: context.page?.permissionText || null,
      };
    }

    const procedureNames = [...new Set(files.map((item) => String(item.moduleName || "").trim()).filter(Boolean))];
    const procedureText = String(payload?.procedureText || procedureNames.join("/")).trim();
    const procedure = await ensureAuditProcedureForRow(target.spread, target.sheet, target.row, procedureText);
    result.target.procedure = procedure;
    if (!procedure.ok) return { ...result, ok: false, reason: procedure.reason, target: result.target };

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    if (procedureText && !procedure.skipped) {
      const procedureSave = await saveDraftWithNetworkEvidence(networkStart, 3500);
      result.procedureSave = procedureSave;
      if (!procedureSave.ok) return { ...result, ok: false, reason: procedureSave.reason || "AUDIT_PROCEDURE_SAVE_FAILED" };
    }

    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await target.rawCellType.activateEditor(true, null, null, {
      sheet: target.sheet,
      row: target.row,
      col: target.col,
    });
    const dialog = await waitForVisibleDialog();
    if (!dialog) return { ...result, ok: false, reason: "DIALOG_NOT_OPENED" };
    const existingDialogFiles = selectedDialogFiles(dialog);
    const existingDialogText = textOf(dialog).slice(0, 2000);
    if (existingDialogFiles.length || files.some((item) => existingDialogText.includes(item.name))) {
      await closeDialogWithoutConfirm(dialog);
      return {
        ...result,
        ok: false,
        reason: "BATCH_UPLOAD_ROW_ALREADY_HAS_ATTACHMENTS",
        residualFiles: existingDialogFiles,
        dialogText: existingDialogText,
      };
    }
    await clearDialogFileInputs(dialog);
    const inputGroups = new Map();
    for (const filePayload of files) {
      const selected = chooseDialogFileInput(dialog, filePayload);
      if (!selected) {
        await closeDialogWithoutConfirm(dialog);
        return {
          ...result,
          ok: false,
          reason: "UPLOAD_MODULE_NOT_FOUND",
          fileName: filePayload.name,
          moduleName: filePayload.moduleName || "",
          modules: describeDialogFileInputs(dialog),
        };
      }
      if (!inputGroups.has(selected.input)) inputGroups.set(selected.input, []);
      inputGroups.get(selected.input).push(filePayload);
    }
    for (const [input, groupFiles] of inputGroups) {
      if (groupFiles.length > 1 && !input.multiple) {
        await closeDialogWithoutConfirm(dialog);
        return {
          ...result,
          ok: false,
          reason: "UPLOAD_MODULE_MULTIPLE_FILES_NOT_SUPPORTED",
          moduleName: groupFiles[0]?.moduleName || "",
          fileNames: groupFiles.map((item) => item.name),
        };
      }
      const transfer = new DataTransfer();
      for (const filePayload of groupFiles) transfer.items.add(fileFromBase64(filePayload));
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(1200);
    const dialogTextAfterInject = textOf(dialog).slice(0, 4000);
    const missingRenderedFiles = files
      .filter((item) => !dialogTextAfterInject.includes(item.name))
      .map((item) => item.name);
    if (missingRenderedFiles.length) {
      await closeDialogWithoutConfirm(dialog);
      return {
        ...result,
        ok: false,
        reason: "BATCH_UPLOAD_FILES_NOT_RENDERED",
        missingRenderedFiles,
        dialogText: dialogTextAfterInject,
      };
    }
    result.steps = [{
      ok: true,
      step: "inject_row_files",
      rowNumber,
      fileCount: files.length,
      modules: procedureNames,
    }];

    const saveDialogButton = [...dialog.querySelectorAll("button,.el-button")]
      .filter(isVisible)
      .find((button) => textOf(button) === "保存");
    if (!saveDialogButton || saveDialogButton.disabled) {
      return { ...result, ok: false, reason: "UPLOAD_DIALOG_SAVE_NOT_AVAILABLE", dialogText: textOf(dialog).slice(0, 2000) };
    }
    clickElement(saveDialogButton);
    result.security.uploadPerformed = true;
    result.steps.push({ ok: true, step: "click_upload_dialog_save_once" });

    const afterUploadNetwork = await waitForUploadClassification(networkStart, 30000);
    const successfulUploads = afterUploadNetwork.filter((item) =>
      /attach\/upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    const successfulClassifications = afterUploadNetwork.filter((item) =>
      /cell_file\/classify_upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    const failedUploads = afterUploadNetwork.filter((item) =>
      /attach\/upload/.test(item.url || "")
      && !(item.status >= 200 && item.status < 300 && item.businessSuccess)
    );
    result.uploadNetwork = afterUploadNetwork;
    result.uploadConfirmation = uploadConfirmationSummary(afterUploadNetwork);
    if (!successfulUploads.length || failedUploads.length || !successfulClassifications.length) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_OR_CLASSIFY_NOT_CONFIRMED",
        expectedUploadCount: files.length,
        successfulUploadCount: successfulUploads.length,
        failedUploadCount: failedUploads.length,
        dialogText: textOf(dialog).slice(0, 2000),
        dialogMessages: getPageMessages(),
        uploadConfirmation: result.uploadConfirmation,
      };
    }
    const classify = successfulClassifications.at(-1);
    result.classificationValue = classify.classificationValue || "";
    result.dialogClose = await closeDialogWithoutConfirm(dialog);
    result.dialogSettled = await waitForUploadDialogSettled();
    const after = locateAuditUploadCell(payload);
    result.after = after.ok ? { text: after.text, value: after.value, tag: after.tag } : null;
    result.readbackConsistent = Boolean(result.classificationValue
      && JSON.stringify(result.after || {}).includes(result.classificationValue));
    result.saveDeferred = Boolean(payload?.deferSave);
    result.security.writesPerformed = false;
    result.ok = Boolean(result.classificationValue && result.readbackConsistent);
    result.reason = result.ok ? null : "BATCH_UPLOAD_CLASSIFICATION_READBACK_MISMATCH";
    result.summary = {
      rowNumber,
      fileCount: files.length,
      uploadSuccessCount: successfulUploads.length,
      classificationCount: successfulClassifications.length,
    };
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  function normalizeCellOptions(values) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    return source.map((item) => {
      if (item && typeof item === "object") {
        const text = String(item.text ?? item.label ?? item.name ?? item.value ?? "").trim();
        const value = item.value ?? item.code ?? item.id ?? text;
        return { text, value };
      }
      return { text: String(item ?? "").trim(), value: item };
    }).filter((item) => {
      if (!item.text || seen.has(item.text)) return false;
      seen.add(item.text);
      return true;
    });
  }

  function inspectCellOptions(sheet, row, col, cellType) {
    const optionSources = [];
    try {
      if (typeof cellType?.items === "function") optionSources.push(cellType.items());
      else if (Array.isArray(cellType?.items)) optionSources.push(cellType.items);
    } catch {
      // Optional cell type metadata.
    }
    let validator = null;
    try {
      validator = sheet.getDataValidator?.(row, col) || null;
      if (typeof validator?.getValidList === "function") {
        optionSources.push(validator.getValidList(sheet, row, col));
      }
    } catch {
      // Optional validator metadata.
    }
    return {
      options: normalizeCellOptions(optionSources.flat()),
      validator: validator ? {
        constructorName: validator.constructor?.name || "",
        formula1: typeof validator.formula1 === "function" ? String(validator.formula1() || "") : "",
        type: typeof validator.type === "function" ? validator.type() : null,
      } : null,
      prototypeMethods: cellType
        ? Object.getOwnPropertyNames(Object.getPrototypeOf(cellType)).filter((name) => name !== "constructor").slice(0, 80)
        : [],
    };
  }

  function locateFieldCell(payload, allowedTitle) {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = spread?.getActiveSheet?.();
    if (!host || !spread || !sheet) return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    const fieldTitle = String(payload?.fieldTitle || allowedTitle).trim();
    if (fieldTitle !== allowedTitle) return { ok: false, reason: "FIELD_TITLE_NOT_ALLOWED", fieldTitle };
    const rowNumber = Number(payload?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
      return { ok: false, reason: "ROW_NUMBER_INVALID", rowNumber };
    }
    let col = -1;
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const headers = [];
    for (let candidate = 0; candidate < columnCount; candidate += 1) {
      const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
      headers.push({ col: candidate, address: colName(candidate), title });
      if (title === fieldTitle) col = candidate;
    }
    if (col < 0) return { ok: false, reason: "FIELD_NOT_FOUND", fieldTitle, headers: headers.slice(0, 160) };
    const row = rowNumber - 1;
    const cellType = sheet.getCellType?.(row, col);
    const optionInfo = inspectCellOptions(sheet, row, col, cellType);
    return {
      ok: true,
      spread,
      sheet,
      row,
      col,
      rowNumber,
      fieldTitle,
      address: `${colName(col)}${rowNumber}`,
      text: sheet.getText?.(row, col) ?? null,
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
      cellType,
      cellTypeSummary: cellType ? {
        constructorName: cellType.constructor?.name || "",
        domId: cellType.domId || "",
        isReadOnly: Boolean(cellType.isReadOnly),
        hasActivateEditor: typeof cellType.activateEditor === "function",
      } : null,
      ...optionInfo,
      nearbyHeaders: headers.slice(Math.max(0, col - 4), Math.min(headers.length, col + 5)),
    };
  }

  function findFieldColumn(sheet, fieldTitle) {
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const headers = [];
    let col = -1;
    for (let candidate = 0; candidate < columnCount; candidate += 1) {
      const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
      headers.push({ col: candidate, address: colName(candidate), title });
      if (title === fieldTitle) col = candidate;
    }
    return { col, headers };
  }

  function getSheetCellSnapshot(sheet, row, col) {
    if (col < 0) return { text: "", value: null, tag: null };
    return {
      text: sheet.getText?.(row, col) ?? "",
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
    };
  }

  function tagHasContent(tag) {
    if (tag === null || tag === undefined) return false;
    if (typeof tag === "string") return Boolean(tag.trim());
    if (typeof tag !== "object") return Boolean(String(tag).trim());
    if (tag.isClear === true && !tag.fileId && !tag.fileIds && !tag.batchId && !tag.value) return false;
    return Boolean(tag.fileId || tag.fileIds || tag.batchId || tag.value);
  }

  function cellHasContent(snapshot) {
    return Boolean(
      String(snapshot?.text ?? "").trim()
      || String(snapshot?.value ?? "").trim()
      || tagHasContent(snapshot?.tag)
    );
  }

  function getCurrentSheet() {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = spread?.getActiveSheet?.();
    if (!host || !spread || !sheet) return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    return { ok: true, spread, sheet };
  }

  function collectAuditIndexRows(payload = {}) {
    const current = getCurrentSheet();
    if (!current.ok) return current;
    const { sheet } = current;
    const procedureInfo = findFieldColumn(sheet, "查证类核实程序");
    const indexInfo = findFieldColumn(sheet, "查证资料索引");
    const checkInfo = findFieldColumn(sheet, "查证核对情况");
    if (indexInfo.col < 0) return { ok: false, reason: "AUDIT_INDEX_FIELD_NOT_FOUND", headers: indexInfo.headers.slice(0, 160) };
    if (checkInfo.col < 0) return { ok: false, reason: "AUDIT_CHECK_FIELD_NOT_FOUND", headers: checkInfo.headers.slice(0, 160) };

    const rowCount = Number(sheet.getRowCount?.() || 0);
    const maxRows = Math.max(2, Math.min(Number(payload.maxRows || 500), 5000));
    const lastRow = Math.min(rowCount - 1, maxRows - 1);
    const rows = [];
    const rowsWithIndex = [];
    const rowsNeedingCheck = [];
    for (let row = 1; row <= lastRow; row += 1) {
      const indexCell = getSheetCellSnapshot(sheet, row, indexInfo.col);
      const checkCell = getSheetCellSnapshot(sheet, row, checkInfo.col);
      const procedureCell = getSheetCellSnapshot(sheet, row, procedureInfo.col);
      const hasIndex = cellHasContent(indexCell);
      const hasCheck = cellHasContent(checkCell);
      const item = {
        row,
        rowNumber: row + 1,
        indexAddress: `${colName(indexInfo.col)}${row + 1}`,
        checkAddress: `${colName(checkInfo.col)}${row + 1}`,
        index: indexCell,
        check: checkCell,
        procedure: procedureCell,
        hasIndex,
        hasCheck,
        hasProcedure: cellHasContent(procedureCell),
      };
      rows.push(item);
      if (hasIndex) rowsWithIndex.push(item);
      if (hasIndex && !hasCheck) rowsNeedingCheck.push(item);
    }
    return {
      ok: true,
      spread: current.spread,
      sheet,
      sheetName: sheet.name?.() || "",
      rowCount,
      scannedRows: Math.max(0, lastRow),
      truncated: rowCount > maxRows,
      columns: {
        auditProcedure: { col: procedureInfo.col, address: procedureInfo.col >= 0 ? colName(procedureInfo.col) : null, title: "查证类核实程序" },
        auditIndex: { col: indexInfo.col, address: colName(indexInfo.col), title: "查证资料索引" },
        auditCheck: { col: checkInfo.col, address: colName(checkInfo.col), title: "查证核对情况" },
      },
      rows,
      rowsWithIndex,
      rowsNeedingCheck,
    };
  }

  async function scanAuditIndexCheckRows(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "scan_audit_index_check_rows",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    return {
      ...result,
      ok: true,
      sheetName: scan.sheetName,
      rowCount: scan.rowCount,
      scannedRows: scan.scannedRows,
      truncated: scan.truncated,
      columns: scan.columns,
      rowsWithIndex: scan.rowsWithIndex.map((row) => ({
        rowNumber: row.rowNumber,
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
        index: row.index,
        check: row.check,
        procedure: row.procedure,
        hasCheck: row.hasCheck,
        hasProcedure: row.hasProcedure,
      })),
      rowsWithCleanupData: scan.rows
        .filter((row) => row.hasIndex || row.hasProcedure)
        .map((row) => ({
          rowNumber: row.rowNumber,
          indexAddress: row.indexAddress,
          checkAddress: row.checkAddress,
          index: row.index,
          check: row.check,
          procedure: row.procedure,
          hasIndex: row.hasIndex,
          hasCheck: row.hasCheck,
          hasProcedure: row.hasProcedure,
        })),
      rowsNeedingCheck: scan.rowsNeedingCheck.map((row) => ({
        rowNumber: row.rowNumber,
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
        index: row.index,
      })),
      summary: {
        rowsWithIndex: scan.rowsWithIndex.length,
        rowsNeedingCheck: scan.rowsNeedingCheck.length,
      },
      adapterVersion: ADAPTER_VERSION,
    };
  }

  async function batchSetAuditCheckResults(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "batch_set_audit_check_results",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认批量填写核对情况并保存") {
      return { ...result, ok: false, reason: "BATCH_AUDIT_CHECK_CONFIRM_TEXT_REQUIRED" };
    }
    const requestedText = String(payload?.resultText || "").trim();
    if (!requestedText || requestedText.length > 80) return { ...result, ok: false, reason: "AUDIT_CHECK_RESULT_INVALID" };
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    const requestedRows = Array.isArray(payload?.rowNumbers) && payload.rowNumbers.length
      ? new Set(payload.rowNumbers.map((row) => Number(row)).filter((row) => Number.isInteger(row) && row >= 2))
      : null;
    const candidates = (requestedRows
      ? scan.rowsWithIndex.filter((row) => requestedRows.has(row.rowNumber))
      : scan.rowsNeedingCheck
    ).filter((row) => row.hasIndex);
    if (!candidates.length) {
      return {
        ...result,
        ok: true,
        sheetName: scan.sheetName,
        columns: scan.columns,
        updatedRows: [],
        skippedReason: "NO_ROWS_NEED_UPDATE",
        summary: {
          rowsWithIndex: scan.rowsWithIndex.length,
          rowsNeedingCheck: scan.rowsNeedingCheck.length,
          updatedRows: 0,
        },
        adapterVersion: ADAPTER_VERSION,
      };
    }
    const checkCellType = scan.sheet.getCellType?.(candidates[0].row, scan.columns.auditCheck.col);
    const optionInfo = inspectCellOptions(scan.sheet, candidates[0].row, scan.columns.auditCheck.col, checkCellType);
    if (optionInfo.options.length && !optionInfo.options.some((item) =>
      item.text === requestedText || item.text.includes(requestedText) || requestedText.includes(item.text)
    )) {
      return { ...result, ok: false, reason: "AUDIT_CHECK_OPTION_NOT_ALLOWED", options: optionInfo.options };
    }
    const nextValue = optionInfo.options.length
      ? (optionInfo.options.find((item) => item.text === requestedText)
        || optionInfo.options.find((item) => item.text.includes(requestedText) || requestedText.includes(item.text)))?.value
      : requestedText;

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    const updatedRows = [];
    for (const row of candidates) {
      const cellType = scan.sheet.getCellType?.(row.row, scan.columns.auditCheck.col);
      if (cellType?.isReadOnly) {
        updatedRows.push({ rowNumber: row.rowNumber, ok: false, reason: "CELL_READONLY", before: row.check });
        continue;
      }
      scan.sheet.setValue(row.row, scan.columns.auditCheck.col, nextValue);
      updatedRows.push({
        rowNumber: row.rowNumber,
        ok: true,
        before: row.check,
        afterSet: getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditCheck.col),
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
      });
    }
    scan.sheet.setActiveCell(candidates[0].row, scan.columns.auditCheck.col);
    scan.sheet.setSelection(candidates[0].row, scan.columns.auditCheck.col, candidates.length, 1);
    scan.spread.focus?.();
    await sleep(500);
    result.steps.push({ ok: true, step: "batch_set_audit_check_results", requestedText, updatedRows });
    const saveButtons = findPageSaveButtons(true);
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!saveButton) return { ...result, ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", updatedRows };
    clickElement(saveButton);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(7000);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const saveSuccess = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    const readback = candidates.map((row) => {
      const after = getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditCheck.col);
      const matches = String(after.text ?? after.value ?? "").trim() === requestedText
        || String(after.text ?? "").includes(requestedText);
      return {
        rowNumber: row.rowNumber,
        checkAddress: row.checkAddress,
        after,
        matches,
      };
    });
    result.sheetName = scan.sheetName;
    result.columns = scan.columns;
    result.updatedRows = updatedRows;
    result.readback = readback;
    result.saveNetwork = saveNetwork;
    result.saveSuccess = saveSuccess;
    result.readbackConsistent = Boolean(saveSuccess && readback.every((row) => row.matches));
    result.security.writesPerformed = saveSuccess;
    result.summary = {
      rowsWithIndex: scan.rowsWithIndex.length,
      rowsNeedingCheck: scan.rowsNeedingCheck.length,
      updatedRows: updatedRows.filter((row) => row.ok).length,
    };
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveSuccess ? "BATCH_AUDIT_CHECK_READBACK_MISMATCH" : "DRAFT_SAVE_NOT_CONFIRMED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  async function clearAuditTestRows(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "clear_audit_test_rows",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      rows: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认清理测试数据并保存") {
      return { ...result, ok: false, reason: "CLEAR_TEST_DATA_CONFIRM_TEXT_REQUIRED" };
    }
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    const rowNumbers = Array.isArray(payload?.rowNumbers)
      ? [...new Set(payload.rowNumbers.map((row) => Number(row)).filter((row) => Number.isInteger(row) && row >= 2))]
      : [];
    if (!rowNumbers.length || rowNumbers.length > 100) {
      return { ...result, ok: false, reason: "CLEAR_TEST_ROWS_INVALID" };
    }
    const expectedIndexValues = new Set((Array.isArray(payload?.expectedIndexValues) ? payload.expectedIndexValues : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean));
    const rowIndexes = rowNumbers.map((rowNumber) => rowNumber - 1);
    const columns = {
      auditProcedure: scan.columns.auditProcedure.col,
      auditIndex: scan.columns.auditIndex.col,
      auditCheck: scan.columns.auditCheck.col,
    };
    if (columns.auditProcedure < 0 || columns.auditIndex < 0 || columns.auditCheck < 0) {
      return { ...result, ok: false, reason: "CLEAR_TEST_REQUIRED_FIELDS_NOT_FOUND", columns: scan.columns };
    }

    const snapshots = rowIndexes.map((row) => ({
      row,
      rowNumber: row + 1,
      procedure: getSheetCellSnapshot(scan.sheet, row, columns.auditProcedure),
      index: getSheetCellSnapshot(scan.sheet, row, columns.auditIndex),
      check: getSheetCellSnapshot(scan.sheet, row, columns.auditCheck),
    }));
    if (expectedIndexValues.size) {
      const mismatches = snapshots.filter((item) => {
        const current = String(item.index.text || item.index.value || "").trim();
        return current && !expectedIndexValues.has(current);
      });
      if (mismatches.length) {
        return {
          ...result,
          ok: false,
          reason: "CLEAR_TEST_INDEX_VALUE_MISMATCH",
          mismatches: mismatches.map((item) => ({ rowNumber: item.rowNumber, index: item.index })),
        };
      }
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    for (const item of snapshots) {
      scan.sheet.setValue(item.row, columns.auditProcedure, "");
      scan.sheet.setValue(item.row, columns.auditIndex, null);
      scan.sheet.setTag?.(item.row, columns.auditIndex, { fileId: null, isClear: true });
      scan.sheet.setValue(item.row, columns.auditCheck, "");
      result.rows.push({
        rowNumber: item.rowNumber,
        before: item,
        addresses: {
          procedure: `${colName(columns.auditProcedure)}${item.rowNumber}`,
          index: `${colName(columns.auditIndex)}${item.rowNumber}`,
          check: `${colName(columns.auditCheck)}${item.rowNumber}`,
        },
      });
    }
    scan.sheet.setActiveCell(rowIndexes[0], columns.auditIndex);
    scan.sheet.setSelection(rowIndexes[0], columns.auditProcedure, rowIndexes.length, 3);
    scan.spread.focus?.();
    await sleep(500);
    const saveResult = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const readback = snapshots.map((item) => {
      const after = {
        procedure: getSheetCellSnapshot(scan.sheet, item.row, columns.auditProcedure),
        index: getSheetCellSnapshot(scan.sheet, item.row, columns.auditIndex),
        check: getSheetCellSnapshot(scan.sheet, item.row, columns.auditCheck),
      };
      return {
        rowNumber: item.rowNumber,
        after,
        cleared: !cellHasContent(after.procedure) && !cellHasContent(after.index) && !cellHasContent(after.check),
      };
    });
    result.sheetName = scan.sheetName;
    result.columns = scan.columns;
    result.saveNetwork = saveResult.saveNetwork || [];
    result.saveSuccess = Boolean(saveResult.ok);
    result.readback = readback;
    result.readbackConsistent = Boolean(saveResult.ok && readback.every((row) => row.cleared));
    result.security.writesPerformed = Boolean(saveResult.ok);
    result.summary = {
      requestedRows: rowNumbers.length,
      clearedRows: readback.filter((row) => row.cleared).length,
    };
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveResult.ok ? "CLEAR_TEST_READBACK_NOT_EMPTY" : saveResult.reason || "DRAFT_SAVE_NOT_CONFIRMED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  async function clearAuditAttachments(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "clear_audit_attachments",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      rows: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认批量清理附件并保存") {
      return { ...result, ok: false, reason: "CLEAR_ATTACHMENTS_CONFIRM_TEXT_REQUIRED" };
    }
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    const rowNumbers = [...new Set((Array.isArray(payload?.rowNumbers) ? payload.rowNumbers : [])
      .map(Number)
      .filter((row) => Number.isInteger(row) && row >= 2))];
    if (!rowNumbers.length || rowNumbers.length > 100) {
      return { ...result, ok: false, reason: "CLEAR_ATTACHMENTS_ROWS_INVALID" };
    }
    const expectedByRow = new Map((Array.isArray(payload?.expectedCleanupValues) ? payload.expectedCleanupValues : [])
      .map((item) => [
        Number(item?.rowNumber),
        {
          indexValue: String(item?.indexValue || "").trim(),
          procedureValue: String(item?.procedureValue || "").trim(),
        },
      ])
      .filter(([rowNumber]) => Number.isInteger(rowNumber) && rowNumber >= 2));
    if (rowNumbers.some((rowNumber) => !expectedByRow.has(rowNumber))) {
      return { ...result, ok: false, reason: "CLEAR_ATTACHMENTS_EXPECTED_VALUES_REQUIRED" };
    }
    const requested = new Set(rowNumbers);
    const candidates = scan.rows.filter((row) =>
      requested.has(row.rowNumber) && (row.hasIndex || row.hasProcedure)
    );
    if (candidates.length !== rowNumbers.length) {
      return { ...result, ok: false, reason: "CLEAR_ATTACHMENTS_ROWS_CHANGED" };
    }
    const mismatches = candidates.filter((row) => {
      const expected = expectedByRow.get(row.rowNumber);
      const currentIndex = String(row.index.text || row.index.value || "").trim();
      const currentProcedure = String(row.procedure.text || row.procedure.value || "").trim();
      return currentIndex !== expected.indexValue || currentProcedure !== expected.procedureValue;
    });
    if (mismatches.length) {
      return {
        ...result,
        ok: false,
        reason: "CLEAR_ATTACHMENTS_INDEX_VALUE_MISMATCH",
        mismatches: mismatches.map((row) => ({ rowNumber: row.rowNumber, index: row.index })),
      };
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    for (const row of candidates) {
      scan.sheet.setValue(row.row, scan.columns.auditProcedure.col, "");
      scan.sheet.setValue(row.row, scan.columns.auditIndex.col, null);
      scan.sheet.setTag?.(row.row, scan.columns.auditIndex.col, { fileId: null, isClear: true });
      result.rows.push({
        rowNumber: row.rowNumber,
        address: row.indexAddress,
        before: row.index,
        beforeProcedure: row.procedure,
        preservedCheck: row.check,
      });
    }
    scan.sheet.setActiveCell(candidates[0].row, scan.columns.auditIndex.col);
    scan.sheet.setSelection(candidates[0].row, scan.columns.auditIndex.col, 1, 1);
    scan.spread.focus?.();
    await sleep(400);
    const saveResult = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const readback = candidates.map((row) => {
      const index = getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditIndex.col);
      const procedure = getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditProcedure.col);
      const check = getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditCheck.col);
      return {
        rowNumber: row.rowNumber,
        address: row.indexAddress,
        index,
        procedure,
        cleared: !cellHasContent(index) && !cellHasContent(procedure),
        preserved: {
          check: JSON.stringify(check) === JSON.stringify(row.check),
        },
      };
    });
    result.sheetName = scan.sheetName;
    result.columns = scan.columns;
    result.saveNetwork = saveResult.saveNetwork || [];
    result.saveSuccess = Boolean(saveResult.ok);
    result.readback = readback;
    result.readbackConsistent = Boolean(saveResult.ok && readback.every((row) =>
      row.cleared && row.preserved.check
    ));
    result.security.writesPerformed = Boolean(saveResult.ok);
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveResult.ok ? "CLEAR_ATTACHMENTS_READBACK_MISMATCH" : "DRAFT_SAVE_NOT_CONFIRMED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  async function inspectAuditCheckRow(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "inspect_audit_check_row",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const target = locateFieldCell(payload, "查证核对情况");
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target };
    return {
      ...result,
      ok: true,
      target: {
        sheetName: target.sheet.name?.() || "",
        row: target.row,
        col: target.col,
        address: target.address,
        fieldTitle: target.fieldTitle,
        text: target.text,
        value: target.value,
        tag: target.tag,
        cellType: target.cellTypeSummary,
        options: target.options,
        validator: target.validator,
        prototypeMethods: target.prototypeMethods,
        nearbyHeaders: target.nearbyHeaders,
      },
    };
  }

  function findOptionValue(target, requestedText) {
    const requested = String(requestedText || "").trim();
    const option = target.options.find((item) => item.text === requested)
      || target.options.find((item) => item.text.includes(requested) || requested.includes(item.text));
    return option ? option.value : requested;
  }

  async function setAuditCheckResult(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "set_audit_check_result",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认填写核对情况并保存") {
      return { ...result, ok: false, reason: "AUDIT_CHECK_CONFIRM_TEXT_REQUIRED" };
    }
    const requestedText = String(payload?.resultText || "").trim();
    if (!requestedText || requestedText.length > 80) {
      return { ...result, ok: false, reason: "AUDIT_CHECK_RESULT_INVALID" };
    }
    const target = locateFieldCell(payload, "查证核对情况");
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target };
    if (target.cellTypeSummary?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    if (target.options.length && !target.options.some((item) =>
      item.text === requestedText || item.text.includes(requestedText) || requestedText.includes(item.text)
    )) {
      return {
        ...result,
        ok: false,
        reason: "AUDIT_CHECK_OPTION_NOT_ALLOWED",
        options: target.options,
      };
    }

    const before = { text: target.text, value: target.value, tag: target.tag };
    const nextValue = findOptionValue(target, requestedText);
    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    target.sheet.setValue(target.row, target.col, nextValue);
    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await sleep(500);
    let afterSet = {
      text: target.sheet.getText?.(target.row, target.col) ?? null,
      value: target.sheet.getValue?.(target.row, target.col) ?? null,
      tag: target.sheet.getTag?.(target.row, target.col) ?? null,
    };

    if (String(afterSet.text || "").trim() !== requestedText && typeof target.cellType?.activateEditor === "function") {
      await target.cellType.activateEditor(true, null, null, {
        sheet: target.sheet,
        row: target.row,
        col: target.col,
      });
      await sleep(300);
      const optionElement = findVisibleElementByAnyText(
        [requestedText],
        ".el-select-dropdown__item,[role='option'],li,button,.el-button,span,div",
      );
      if (optionElement) {
        clickElement(optionElement);
        await sleep(500);
        afterSet = {
          text: target.sheet.getText?.(target.row, target.col) ?? null,
          value: target.sheet.getValue?.(target.row, target.col) ?? null,
          tag: target.sheet.getTag?.(target.row, target.col) ?? null,
        };
      }
    }

    result.steps.push({ ok: true, step: "set_audit_check_result", requestedText, before, afterSet });
    const saveButtons = findPageSaveButtons(true);
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!saveButton) return { ...result, ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", before, afterSet };
    clickElement(saveButton);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(7000);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const saveSuccess = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    const after = locateFieldCell(payload, "查证核对情况");
    const readback = after.ok ? { text: after.text, value: after.value, tag: after.tag } : null;
    const displayMatches = String(readback?.text ?? readback?.value ?? "").trim() === requestedText
      || String(readback?.text ?? "").includes(requestedText);
    result.before = before;
    result.after = readback;
    result.options = target.options;
    result.saveNetwork = saveNetwork;
    result.saveSuccess = saveSuccess;
    result.readbackConsistent = Boolean(saveSuccess && displayMatches);
    result.security.writesPerformed = saveSuccess;
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveSuccess ? "AUDIT_CHECK_READBACK_MISMATCH" : "DRAFT_SAVE_NOT_CONFIRMED");
    return result;
  }

  async function saveCurrentDraft(payload) {
    const mode = payload?.mode === "execute" ? "execute" : "dry_run";
    const companyScope = payload?.companyScope || "current";
    const companyFilters = Array.isArray(payload?.companyFilters) ? payload.companyFilters : [];
    const selectedCompanies = Array.isArray(payload?.selectedCompanies) ? payload.selectedCompanies : [];
    const before = collectContext();
    const gate = assertDraftPage(before);

    const result = {
      ok: gate.ok,
      action: "save_asset_draft_current_subject",
      mode,
      companyScope,
      companyFilters,
      selectedCompanies,
      collectedAt: new Date().toISOString(),
      url: location.href,
      before,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    if (mode === "dry_run") {
      result.steps.push({
        ok: true,
        step: "dry_run_only",
        message: "已定位保存按钮和页面上下文，未点击保存。",
      });
      result.ok = true;
      return result;
    }

    if (payload?.confirmText !== "确认保存") {
      result.ok = false;
      result.gate = { ok: false, reason: "CONFIRM_TEXT_REQUIRED" };
      return result;
    }

    const companySelection = await selectCompanyScope(companyScope, companyFilters, selectedCompanies);
    result.steps.push({ step: "select_company_scope", ...companySelection });
    if (!companySelection.ok) {
      result.ok = false;
      return result;
    }

    const saveButtons = findPageSaveButtons(true);
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true") || saveButtons[0];
    if (!saveButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "click_save", reason: "SAVE_BUTTON_NOT_FOUND" });
      return result;
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    clickElement(saveButton);
    result.steps.push({ ok: true, step: "click_save", buttonText: textOf(saveButton) });
    await sleep(1800);

    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      result.steps.push({ ok: true, step: "confirm_dialog", buttonText: textOf(confirm) });
      await sleep(1500);
    }

    await sleep(2500);
    await sleep(500);
    const after = collectContext();
    const bodyText = document.body?.innerText || "";
    const messages = getPageMessages();
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const saveNetworkSuccess = saveNetwork.some((item) => item.status >= 200 && item.status < 300 && item.businessSuccess);
    const saveSuccessTextFound = bodyText.includes("保存成功") || messages.some((message) => message.includes("保存成功"));
    result.after = after;
    result.messages = messages;
    result.saveNetwork = saveNetwork.map((item) => ({
      method: item.method,
      url: item.url,
      status: item.status,
      businessSuccess: item.businessSuccess,
      businessCode: item.businessCode,
      businessMessage: item.businessMessage,
    }));
    result.saveSuccessTextFound = saveSuccessTextFound;
    result.saveNetworkSuccess = saveNetworkSuccess;
    result.security.writesPerformed = Boolean(saveNetworkSuccess || saveSuccessTextFound);
    result.ok = result.security.writesPerformed;
    result.reason = result.ok ? null : "DRAFT_SAVE_SUCCESS_EVIDENCE_NOT_FOUND";
    return result;
  }

  async function exitEditCurrentSubject(payload) {
    const mode = payload?.mode === "execute" ? "execute" : "dry_run";
    const companyScope = payload?.companyScope || "current";
    const companyFilters = Array.isArray(payload?.companyFilters) ? payload.companyFilters : [];
    const selectedCompanies = Array.isArray(payload?.selectedCompanies) ? payload.selectedCompanies : [];
    const before = collectContext();
    const gate = assertDraftPage(before);

    const result = {
      ok: gate.ok,
      action: "exit_edit_current_subject",
      mode,
      companyScope,
      companyFilters,
      selectedCompanies,
      collectedAt: new Date().toISOString(),
      url: location.href,
      before,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    const locateExitButton = () => {
      const exitButtons = findVisibleElementsByText("退出编辑", "button,.el-button,[role='button'],a,span");
      return exitButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true") || exitButtons[0];
    };

    let exitButton = locateExitButton();
    if (!exitButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "locate_exit_edit", reason: "EXIT_EDIT_BUTTON_NOT_FOUND" });
      return result;
    }

    if (mode === "dry_run") {
      result.steps.push({
        ok: true,
        step: "dry_run_only",
        buttonText: textOf(exitButton),
        message: "已定位退出编辑按钮和页面上下文，未点击退出编辑。",
      });
      result.ok = true;
      return result;
    }

    if (payload?.confirmText !== "确认退出编辑") {
      result.ok = false;
      result.gate = { ok: false, reason: "EXIT_CONFIRM_TEXT_REQUIRED" };
      return result;
    }

    const companySelection = await selectCompanyScope(companyScope, companyFilters, selectedCompanies);
    result.steps.push({ step: "select_company_scope", ...companySelection });
    if (!companySelection.ok) {
      result.ok = false;
      return result;
    }

    exitButton = locateExitButton();
    if (!exitButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "locate_exit_edit_after_company_scope", reason: "EXIT_EDIT_BUTTON_NOT_FOUND" });
      return result;
    }

    clickElement(exitButton);
    result.steps.push({ ok: true, step: "click_exit_edit", buttonText: textOf(exitButton) });
    await sleep(1200);

    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      result.steps.push({ ok: true, step: "confirm_dialog", buttonText: textOf(confirm) });
      await sleep(1500);
    }

    await sleep(2000);
    const after = collectContext();
    const bodyText = document.body?.innerText || "";
    result.after = after;
    result.messages = getPageMessages();
    result.exitSuccessTextFound = /退出编辑成功|退出成功|操作成功/.test(bodyText)
      || result.messages.some((message) => /退出编辑成功|退出成功|操作成功/.test(message));
    result.security.writesPerformed = result.exitSuccessTextFound;
    result.ok = result.exitSuccessTextFound;
    result.reason = result.ok ? null : "EXIT_EDIT_SUCCESS_EVIDENCE_NOT_FOUND";
    return result;
  }

  function editBlockPageGate(context) {
    if (!context?.route?.isTianyuanOperationRoute) return { ok: false, reason: "NOT_TIANYUAN_PAGE" };
    if (context.page?.loginLikely) return { ok: false, reason: "LOGIN_REQUIRED" };
    return { ok: true };
  }

  function editBlockCandidates() {
    const selector = "mark,p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,div,[contenteditable],[data-block-id],[data-field-id],[data-field-key]";
    return [...new Set([...document.querySelectorAll(selector)].filter((element) => editBlockElement(element)))];
  }

  function rebindEditBlockReference(reference) {
    if (!reference) return null;
    if (reference.element && document.contains?.(reference.element)) return reference;
    const baseId = reference.baseId || editBlockId(reference.element);
    const candidates = editBlockCandidates();
    const candidate = candidates.find((element) => editBlockId(element) === baseId)
      || (reference.selectedText && candidates.find((element) => {
        const text = editBlockText(element);
        const offsets = findTextOffsets(text, reference.selectedText, reference.rangeStart, reference.prefix, reference.suffix);
        return Boolean(offsets);
      }));
    return candidate ? { ...reference, element: candidate } : null;
  }

  function locateEditBlockReference(blockId, hint = {}) {
    const target = String(blockId || "").trim();
    if (!target) return null;
    const selected = selectedEditBlock();
    if (selected?.reference?.blockId === target) return rebindEditBlockReference(selected.reference) || selected.reference;
    if (lastEditBlockReference?.blockId === target) {
      const rebound = rebindEditBlockReference(lastEditBlockReference);
      if (rebound) {
        lastEditBlockReference = rebound;
        lastEditBlockElement = rebound.element;
        return rebound;
      }
    }
    if (target.startsWith("dom-caret:")) {
      const caret = hint?.caretReference;
      const baseId = String(caret?.baseId || "").trim();
      const containerPath = String(caret?.containerPath || "").trim();
      const domPath = String(caret?.domPath || "").trim();
      const textOffset = Number(caret?.textOffset);
      if (!baseId || !containerPath || !domPath || !Number.isInteger(textOffset) || textOffset < 0) return null;
      const element = editBlockCandidates().find((candidate) => editBlockId(candidate) === baseId
        && editBlockDomPath(candidate) === containerPath);
      if (!element) return null;
      const fullText = editBlockText(element);
      const boundedOffset = Math.min(textOffset, fullText.length);
      return {
        element,
        baseId,
        blockId: target,
        mode: "caret",
        rangeStart: boundedOffset,
        rangeEnd: boundedOffset,
        selectedText: "",
        prefix: fullText.slice(Math.max(0, boundedOffset - 80), boundedOffset),
        suffix: fullText.slice(boundedOffset, boundedOffset + 80),
        broadContainer: isBroadEditContainer(element),
        caretContainerPath: containerPath,
        caretPath: domPath,
        caretOffset: textOffset,
      };
    }
    const element = editBlockCandidates().find((candidate) => editBlockId(candidate) === target);
    return element ? makeEditBlockReference(element, null, "", false) : null;
  }

  function locateEditBlock(blockId) {
    return locateEditBlockReference(blockId)?.element || null;
  }

  function editBlockSelectionGate(payload) {
    const selected = selectedEditBlock();
    const target = String(payload?.blockId || "").trim();
    if (selected?.reason) return { ok: false, reason: selected.reason };
    const selectedCaretMatches = selected?.reference?.mode === "caret"
      && target.startsWith("dom-caret:")
      && selected.reference.baseId === payload?.caretReference?.baseId
      && Number(selected.reference.rangeStart) === Number(payload?.caretReference?.textOffset)
      && editBlockDomPath(selected.reference.element) === String(payload?.caretReference?.containerPath || "");
    if (selected?.reference && selected.reference.blockId !== target && !selectedCaretMatches) return { ok: false, reason: "EDIT_BLOCK_SELECTION_MISMATCH" };
    if (!selected?.reference && lastEditBlockReference?.blockId !== target && target.startsWith("dom-caret:") && !payload?.caretReference) return { ok: false, reason: "TABLE_CARET_NOT_AVAILABLE" };
    return { ok: true };
  }

  function editBlockDiff(originalText, replacementText) {
    const original = normalizeEditBlockText(originalText);
    const replacement = normalizeEditBlockText(replacementText);
    let prefixLength = 0;
    while (prefixLength < original.length && prefixLength < replacement.length && original[prefixLength] === replacement[prefixLength]) prefixLength += 1;
    let suffixLength = 0;
    while (suffixLength < original.length - prefixLength && suffixLength < replacement.length - prefixLength
      && original[original.length - suffixLength - 1] === replacement[replacement.length - suffixLength - 1]) suffixLength += 1;
    return {
      unchangedPrefix: original.slice(0, prefixLength),
      removed: original.slice(prefixLength, original.length - suffixLength),
      added: replacement.slice(prefixLength, replacement.length - suffixLength),
      unchangedSuffix: suffixLength ? original.slice(original.length - suffixLength) : "",
    };
  }

  function editBlockPayloadGate(payload, context, block) {
    if (!payload?.sessionId || !payload?.bindingId || !payload?.projectId || !payload?.threadId) return { ok: false, reason: "EDIT_BLOCK_BINDING_REQUIRED" };
    if (!Number.isInteger(payload.tabId)) return { ok: false, reason: "EDIT_BLOCK_TAB_REQUIRED" };
    if (context.route?.projectId && String(context.route.projectId) !== String(payload.projectId)) return { ok: false, reason: "EDIT_BLOCK_PROJECT_MISMATCH" };
    if (!block?.available) return { ok: false, reason: block?.reason || "EDIT_BLOCK_NOT_FOUND" };
    if (block.blockId !== String(payload.blockId || "")) return { ok: false, reason: "EDIT_BLOCK_ID_MISMATCH" };
    if (!block.editable) return { ok: false, reason: "EDIT_BLOCK_NOT_EDITABLE" };
    return { ok: true };
  }

  function editBlockTargetPage(context) {
    return {
      url: `${location.origin}${location.pathname}`.slice(0, 1000),
      title: String(document.title || "").slice(0, 300),
      pageType: "tianyuan-page",
      route: context.route,
    };
  }

  function editBlockSecurity(writesPerformed = false) {
    return {
      readOnly: !writesPerformed,
      writesPerformed,
      arbitraryJavaScript: false,
      genericBrowserAutomation: false,
      credentialsCaptured: false,
    };
  }

  function dispatchControlledBeforeInput(element, inputType, data = "") {
    let accepted = true;
    try {
      accepted = element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data }));
    } catch {
    }
    return accepted !== false;
  }

  function dispatchControlledInput(element, inputType, data = "") {
    try {
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function dispatchControlledEditEvent(element, inputType, data = "") {
    if (!dispatchControlledBeforeInput(element, inputType, data)) return false;
    dispatchControlledInput(element, inputType, data);
    return true;
  }

  function rangeBoundaryAtOffset(root, offset) {
    const target = Math.max(0, Number(offset) || 0);
    let total = 0;
    let lastText = null;
    let result = null;
    const visit = (node) => {
      if (result) return;
      if (node.nodeType === 3) {
        const textLength = editBlockTextLength(node);
        lastText = node;
        if (target <= total + textLength) result = { node, offset: Math.max(0, Math.min(target - total, textLength)) };
        total += textLength;
        return;
      }
      for (const child of childNodesOf(node)) visit(child);
    };
    visit(root);
    if (result) return result;
    if (lastText) return { node: lastText, offset: editBlockTextLength(lastText) };
    return { node: root, offset: childNodesOf(root).length };
  }

  function createEditBlockRange(reference) {
    const element = reference?.element;
    const range = document.createRange?.();
    if (!element || !range) return null;
    if (reference.mode === "caret" && reference.caretPath) {
      const caretNode = resolveEditBlockNode(element, reference.caretPath);
      const caretOffset = Number(reference.caretOffset);
      if (caretNode && Number.isInteger(caretOffset)) {
        const maximum = caretNode.nodeType === 3 ? editBlockTextLength(caretNode) : childNodesOf(caretNode).length;
        range.setStart(caretNode, Math.max(0, Math.min(caretOffset, maximum)));
        range.collapse(true);
        return range;
      }
      return null;
    }
    const offsets = referenceOffsets(reference, element);
    if (typeof range.setStart !== "function" || typeof range.setEnd !== "function") {
      if (offsets.start === 0 && offsets.end === editBlockText(element).length && typeof range.selectNodeContents === "function") {
        range.selectNodeContents(element);
        return range;
      }
      return null;
    }
    const start = rangeBoundaryAtOffset(element, offsets.start);
    const end = rangeBoundaryAtOffset(element, offsets.end);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  function setStyleProperty(element, property, value, important = false) {
    if (typeof element?.style?.setProperty === "function") {
      element.style.setProperty(property, value, important ? "important" : "");
      return;
    }
    element.style[property.replace(/-([a-z])/g, (match, character) => character.toUpperCase())] = value;
  }

  function applyEditBlockFormat(element, requested) {
    const normalized = normalizeEditableFormat(requested);
    if (!normalized.ok) return normalized;
    if (!element?.style) return { ok: false, reason: "EDIT_BLOCK_FORMAT_UNAVAILABLE" };
    const before = readEditBlockFormat(element);
    if (!dispatchControlledBeforeInput(element, "formatBlock", "")) return { ok: false, reason: "EDIT_BLOCK_EDITOR_REJECTED" };
    const styleProperties = {
      fontWeight: "fontWeight",
      fontStyle: "fontStyle",
      textDecoration: "textDecoration",
      textAlign: "textAlign",
      color: "color",
    };
    for (const [key, property] of Object.entries(styleProperties)) {
      if (normalized.format[key] !== undefined) element.style[property] = normalized.format[key];
    }
    if (normalized.format.fontSizePx !== undefined) element.style.fontSize = `${normalized.format.fontSizePx}px`;
    if (normalized.format.lineHeightPx !== undefined) element.style.lineHeight = `${normalized.format.lineHeightPx}px`;
    if (normalized.format.indentPx !== undefined) element.style.textIndent = `${normalized.format.indentPx}px`;
    if (normalized.format.highlightColor !== undefined) {
      setStyleProperty(element, "background-color", normalized.format.highlightColor, true);
    }
    dispatchControlledInput(element, "formatBlock", "");
    const after = readEditBlockFormat(element);
    return { ok: true, before, after, changes: formatChanges(before, after, normalized.format), format: normalized.format };
  }

  function isDescendant(node, parent) {
    let current = node;
    for (let depth = 0; current && depth < 40; depth += 1, current = current.parentElement) {
      if (current === parent) return true;
    }
    return false;
  }

  function tableId(table) {
    const explicit = ["data-tianyuan-table-id", "data-table-id", "id", "aria-label"]
      .map((name) => String(table?.getAttribute?.(name) || "").trim())
      .find(Boolean);
    return (explicit ? `table:${explicit}` : `table-path:${editBlockDomPath(table)}`).slice(0, 500);
  }

  function tableElementsInBlock(block) {
    if (!block) return [];
    return [...document.querySelectorAll("table")]
      .filter((table) => isDescendant(table, block) && !isDescendant(table.parentElement?.closest?.("table"), block));
  }

  function locateTable(block, requestedId) {
    const target = String(requestedId || "").trim();
    if (!target) return null;
    return tableElementsInBlock(block).find((table) => tableId(table) === target) || null;
  }

  function tableRows(table) {
    if (table?.rows) return [...table.rows];
    return [...(table?.querySelectorAll?.("tr") || [])];
  }

  function tableCells(row) {
    if (row?.cells) return [...row.cells];
    return [...(row?.querySelectorAll?.("th,td") || [])];
  }

  function normalizeTableCellText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_TABLE_CELL_TEXT);
  }

  function emptyTable(reason = "") {
    return {
      available: false,
      valid: false,
      stale: Boolean(reason),
      reason: String(reason || ""),
      tableId: "",
      blockId: "",
      tabId: null,
      pageUrl: "",
      pageTitle: "",
      rowCount: 0,
      columnCount: 0,
      cells: [],
      tableHash: "",
      currentHash: "",
      capturedAt: null,
      format: {},
      cellFormat: {},
      rowFormat: {},
    };
  }

  function readTableFormat(element) {
    return {
      rowHeightPx: cssPixelValue(cssValue(element, "height") || cssValue(element, "minHeight")),
      columnWidthPx: cssPixelValue(cssValue(element, "width")),
      borderStyle: cssValue(element, "borderStyle") || "",
      borderColor: cssValue(element, "borderColor") || "",
      textAlign: cssValue(element, "textAlign") || "",
      verticalAlign: cssValue(element, "verticalAlign") || "",
      fontSizePx: cssPixelValue(cssValue(element, "fontSize")),
      color: cssValue(element, "color") || "",
      fontWeight: cssValue(element, "fontWeight") || "",
      fontStyle: cssValue(element, "fontStyle") || "",
    };
  }

  function readTable(table, block, payload = {}) {
    if (!table || !isDescendant(table, block)) return emptyTable("TABLE_NOT_FOUND");
    const rows = tableRows(table).slice(0, MAX_TABLE_ROWS);
    const cells = rows.map((row, rowIndex) => tableCells(row).slice(0, MAX_TABLE_COLUMNS).map((cell, columnIndex) => ({
      rowIndex,
      columnIndex,
      tag: String(cell.tagName || "td").toLowerCase(),
      text: normalizeTableCellText(cell.innerText ?? cell.textContent ?? cell.value ?? ""),
    })));
    const flattened = cells.flat();
    if (flattened.some((cell) => EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(cell.text))) return emptyTable("TABLE_SENSITIVE_TEXT");
    const tableKey = tableId(table);
    const tableHash = editBlockHash(JSON.stringify({ tableId: tableKey, cells }));
    const firstRow = rows[0] || null;
    const firstCell = firstRow ? tableCells(firstRow)[0] : null;
    return {
      available: true,
      valid: true,
      stale: false,
      reason: "",
      tableId: tableKey,
      blockId: payload.blockId || editBlockId(block),
      tabId: Number.isInteger(payload.tabId) ? payload.tabId : null,
      pageUrl: `${location.origin}${location.pathname}`.slice(0, 1000),
      pageTitle: String(document.title || "").slice(0, 300),
      rowCount: cells.length,
      columnCount: Math.max(0, ...cells.map((row) => row.length)),
      cells,
      tableHash,
      currentHash: tableHash,
      capturedAt: new Date().toISOString(),
      format: readTableFormat(table),
      cellFormat: readTableFormat(firstCell),
      rowFormat: readTableFormat(firstRow),
    };
  }

  function normalizeTableFormat(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "TABLE_FORMAT_REQUIRED" };
    const allowed = new Set(["rowHeightPx", "columnWidthPx", "borderStyle", "borderColor", "textAlign", "verticalAlign", "fontSizePx", "color", "fontWeight", "fontStyle"]);
    if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false, reason: "TABLE_FORMAT_FIELD_NOT_ALLOWED" };
    const result = {};
    const numericRanges = { rowHeightPx: [16, 160], columnWidthPx: [24, 600], fontSizePx: [8, 72] };
    for (const key of Object.keys(numericRanges)) {
      if (value[key] === undefined) continue;
      const number = Number(value[key]);
      if (!Number.isInteger(number) || number < numericRanges[key][0] || number > numericRanges[key][1]) return { ok: false, reason: `TABLE_FORMAT_${key.toUpperCase()}_INVALID` };
      result[key] = number;
    }
    const enums = {
      borderStyle: ["none", "solid", "dashed", "dotted"],
      textAlign: ["left", "center", "right", "justify"],
      verticalAlign: ["top", "middle", "bottom"],
      fontWeight: ["normal", "bold"],
      fontStyle: ["normal", "italic"],
    };
    for (const [key, values] of Object.entries(enums)) {
      if (value[key] === undefined) continue;
      if (!values.includes(value[key])) return { ok: false, reason: `TABLE_FORMAT_${key.toUpperCase()}_INVALID` };
      result[key] = value[key];
    }
    for (const key of ["borderColor", "color"]) {
      if (value[key] === undefined) continue;
      if (typeof value[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(value[key])) return { ok: false, reason: `TABLE_FORMAT_${key.toUpperCase()}_INVALID` };
      result[key] = value[key].toLowerCase();
    }
    if (!Object.keys(result).length) return { ok: false, reason: "TABLE_FORMAT_REQUIRED" };
    return { ok: true, format: result };
  }

  function normalizeTableRequest(payload = {}) {
    const tableAction = String(payload.tableAction || "").trim();
    if (!["insert", "update_cell", "format"].includes(tableAction)) return { ok: false, reason: "TABLE_ACTION_INVALID" };
    const request = { tableAction, tableId: String(payload.tableId || "").trim(), blockId: String(payload.blockId || "").trim() };
    if (tableAction === "update_cell") {
      if (!request.tableId) return { ok: false, reason: "TABLE_ID_REQUIRED" };
      if (!Number.isInteger(Number(payload.rowIndex)) || Number(payload.rowIndex) < 0 || Number(payload.rowIndex) >= MAX_TABLE_ROWS) return { ok: false, reason: "TABLE_ROW_INDEX_INVALID" };
      if (!Number.isInteger(Number(payload.columnIndex)) || Number(payload.columnIndex) < 0 || Number(payload.columnIndex) >= MAX_TABLE_COLUMNS) return { ok: false, reason: "TABLE_COLUMN_INDEX_INVALID" };
      request.rowIndex = Number(payload.rowIndex);
      request.columnIndex = Number(payload.columnIndex);
      request.cellText = normalizeTableCellText(payload.cellText);
      if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(request.cellText)) return { ok: false, reason: "TABLE_SENSITIVE_TEXT" };
    }
    if (tableAction === "format") {
      if (!request.tableId) return { ok: false, reason: "TABLE_ID_REQUIRED" };
      const format = normalizeTableFormat(payload.tableFormat);
      if (!format.ok) return format;
      request.tableFormat = format.format;
      request.formatScope = ["table", "row", "cell"].includes(payload.formatScope) ? payload.formatScope : "table";
      if (request.formatScope !== "table") {
        if (!Number.isInteger(Number(payload.rowIndex)) || Number(payload.rowIndex) < 0 || Number(payload.rowIndex) >= MAX_TABLE_ROWS) return { ok: false, reason: "TABLE_ROW_INDEX_INVALID" };
        request.rowIndex = Number(payload.rowIndex);
      }
      if (request.formatScope === "cell") {
        if (!Number.isInteger(Number(payload.columnIndex)) || Number(payload.columnIndex) < 0 || Number(payload.columnIndex) >= MAX_TABLE_COLUMNS) return { ok: false, reason: "TABLE_COLUMN_INDEX_INVALID" };
        request.columnIndex = Number(payload.columnIndex);
      }
    }
    if (tableAction === "insert") {
      const cells = Array.isArray(payload.cells) ? payload.cells.slice(0, MAX_TABLE_ROWS).map((row) => Array.isArray(row) ? row.slice(0, MAX_TABLE_COLUMNS).map(normalizeTableCellText) : []) : [];
      const rowCount = Number(payload.rowCount || cells.length);
      const columnCount = Number(payload.columnCount || Math.max(0, ...cells.map((row) => row.length)));
      if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > MAX_TABLE_ROWS) return { ok: false, reason: "TABLE_ROW_COUNT_INVALID" };
      if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > MAX_TABLE_COLUMNS) return { ok: false, reason: "TABLE_COLUMN_COUNT_INVALID" };
      if (cells.some((row) => row.some((cell) => EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(cell)))) return { ok: false, reason: "TABLE_SENSITIVE_TEXT" };
      request.rowCount = rowCount;
      request.columnCount = columnCount;
      request.cells = cells;
      if (payload.tableFormat) {
        const format = normalizeTableFormat(payload.tableFormat);
        if (!format.ok) return format;
        request.tableFormat = format.format;
      }
    }
    return { ok: true, request };
  }

  function tableOperationTargets(table, request) {
    const rows = tableRows(table);
    if (request.formatScope === "row") return rows[request.rowIndex] ? [rows[request.rowIndex]] : [];
    if (request.formatScope === "cell") {
      const cell = rows[request.rowIndex] && tableCells(rows[request.rowIndex])[request.columnIndex];
      return cell ? [cell] : [];
    }
    return [table];
  }

  function applyTableFormat(table, block, request) {
    const normalized = normalizeTableFormat(request.tableFormat);
    if (!normalized.ok) return normalized;
    const targets = tableOperationTargets(table, request);
    if (!targets.length) return { ok: false, reason: "TABLE_FORMAT_TARGET_NOT_FOUND" };
    const rows = tableRows(table);
    const cells = rows.flatMap((row) => tableCells(row));
    const formatTargets = request.formatScope === "table"
      ? [table, ...rows, ...cells]
      : request.formatScope === "row"
        ? [targets[0], ...tableCells(targets[0])]
        : targets;
    const before = readTable(table, block, { tabId: request.tabId });
    if (!dispatchControlledBeforeInput(table, "formatBlock", "")) return { ok: false, reason: "TABLE_EDITOR_REJECTED" };
    for (const target of formatTargets) {
      if (!target?.style) return { ok: false, reason: "TABLE_FORMAT_UNAVAILABLE" };
      const style = target.style;
      if (normalized.format.rowHeightPx !== undefined && ["TR", "TD", "TH"].includes(target.tagName)) {
        style.height = `${normalized.format.rowHeightPx}px`;
        style.minHeight = `${normalized.format.rowHeightPx}px`;
      }
      if (normalized.format.columnWidthPx !== undefined && (target.tagName === "TD" || target.tagName === "TH")) style.width = `${normalized.format.columnWidthPx}px`;
      if (normalized.format.borderStyle !== undefined) {
        style.borderStyle = normalized.format.borderStyle;
        style.borderWidth = normalized.format.borderStyle === "none" ? "0px" : "1px";
      }
      if (normalized.format.borderColor !== undefined) style.borderColor = normalized.format.borderColor;
      for (const key of ["textAlign", "verticalAlign", "color", "fontWeight", "fontStyle"]) if (normalized.format[key] !== undefined) style[key] = normalized.format[key];
      if (normalized.format.fontSizePx !== undefined) style.fontSize = `${normalized.format.fontSizePx}px`;
    }
    if (request.formatScope === "table" && normalized.format.columnWidthPx !== undefined) for (const cell of cells) cell.style.width = `${normalized.format.columnWidthPx}px`;
    if (request.formatScope === "table" && normalized.format.rowHeightPx !== undefined) for (const row of rows) { row.style.height = `${normalized.format.rowHeightPx}px`; row.style.minHeight = `${normalized.format.rowHeightPx}px`; }
    dispatchControlledInput(table, "formatBlock", "");
    const after = readTable(table, block, { tabId: request.tabId });
    return { ok: after.available, reason: after.available ? "" : after.reason, before, after };
  }

  function replaceTableCell(cell, value) {
    const replacement = normalizeTableCellText(value);
    if (!cell || EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(replacement)) return { ok: false, reason: "TABLE_SENSITIVE_TEXT" };
    const selection = window.getSelection?.();
    const range = document.createRange?.();
    if (!selection || !range) return { ok: false, reason: "TABLE_SELECTION_UNAVAILABLE" };
    range.selectNodeContents(cell);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!dispatchControlledBeforeInput(cell, "insertText", replacement)) return { ok: false, reason: "TABLE_EDITOR_REJECTED" };
    let currentText = normalizeTableCellText(cell.innerText ?? cell.textContent ?? cell.value ?? "");
    if (currentText !== replacement) {
      const fallbackRange = document.createRange();
      fallbackRange.selectNodeContents(cell);
      fallbackRange.deleteContents();
      fallbackRange.insertNode(document.createTextNode(replacement));
      currentText = normalizeTableCellText(cell.innerText ?? cell.textContent ?? cell.value ?? "");
    }
    dispatchControlledInput(cell, "insertText", replacement);
    return { ok: currentText === replacement, currentText };
  }


  function reportModelNodeName(node) {
    return String(node?.type?.name || node?.type?.spec?.tableRole || node?.type || "").toLowerCase();
  }

  function reportModelChildren(node) {
    if (!node) return [];
    if (Array.isArray(node.content)) return node.content;
    if (typeof node.forEach === "function") {
      const children = [];
      node.forEach((child) => children.push(child));
      return children;
    }
    if (Number.isInteger(node.childCount) && typeof node.child === "function") {
      return Array.from({ length: node.childCount }, (_, index) => node.child(index)).filter(Boolean);
    }
    return [];
  }

  function reportModelNodeText(node) {
    if (!node) return "";
    if (typeof node.textContent === "string") return normalizeTableCellText(node.textContent);
    if (typeof node.text === "string") return normalizeTableCellText(node.text);
    return reportModelChildren(node).map((child) => reportModelNodeText(child)).join("");
  }

  function reportModelTableEntries(controller) {
    const view = controller?.view;
    const doc = view?.state?.doc;
    if (!doc) return [];
    const entries = [];
    const visit = (node, position, root = false) => {
      if (!root && reportModelNodeName(node) === "table") entries.push({ node, position });
      let childPosition = root ? 0 : position + 1;
      for (const child of reportModelChildren(node)) {
        visit(child, childPosition, false);
        childPosition += Number(child?.nodeSize || 1);
      }
    };
    visit(doc, 0, true);
    return entries;
  }

  function reportModelTableMatchesRequest(entry, request) {
    if (!entry?.node || reportModelNodeName(entry.node) !== "table") return false;
    const rows = reportModelChildren(entry.node);
    if (rows.length !== request.rowCount) return false;
    return rows.every((row, rowIndex) => {
      const cells = reportModelChildren(row);
      if (cells.length !== request.columnCount) return false;
      return cells.every((cell, columnIndex) => reportModelNodeText(cell) === normalizeTableCellText(request.cells[rowIndex]?.[columnIndex] || ""));
    });
  }

  function reportModelTableNearPosition(controller, position, request, maxDistance = 4) {
    return reportModelTableEntries(controller)
      .filter((entry) => reportModelTableMatchesRequest(entry, request) && Math.abs(entry.position - Number(position)) <= maxDistance)
      .sort((left, right) => Math.abs(left.position - position) - Math.abs(right.position - position))[0] || null;
  }

  function reportModelTableSummary(entry) {
    if (!entry?.node) return null;
    const rows = reportModelChildren(entry.node);
    return {
      verified: true,
      type: reportModelNodeName(entry.node),
      position: entry.position,
      rowCount: rows.length,
      columnCount: Math.max(0, ...rows.map((row) => reportModelChildren(row).length)),
    };
  }

  function reportTableDomElements(block, controller) {
    const roots = [controller?.dom, block].filter(Boolean);
    const candidates = new Set();
    for (const root of roots) {
      for (const table of root.querySelectorAll?.("table") || []) candidates.add(table);
    }
    for (const table of document.querySelectorAll?.("table") || []) {
      if (roots.some((root) => isDescendant(table, root))) candidates.add(table);
    }
    return [...candidates].filter((table) => roots.some((root) => isDescendant(table, root)));
  }

  function reportTableDomForModel(controller, entry, block) {
    const view = controller?.view;
    const direct = typeof view?.nodeDOM === "function" ? view.nodeDOM(entry?.position) : null;
    if (direct?.tagName?.toLowerCase?.() === "table" && isDescendant(direct, controller?.dom || block)) return direct;
    return reportTableDomElements(block, controller).find((table) => {
      if (typeof view?.posAtDOM !== "function") return false;
      try {
        return Math.abs(view.posAtDOM(table, 0) - Number(entry?.position)) <= 2;
      } catch {
        return false;
      }
    }) || null;
  }

  function reportTableModelPosition(controller, block, reference) {
    const view = controller?.view;
    if (!view?.state) return null;
    if (reference?.mode === "caret" && typeof view.posAtDOM === "function") {
      const node = resolveEditBlockNode(block, reference.caretPath);
      const offset = Number(reference.caretOffset);
      if (node && Number.isInteger(offset)) {
        try {
          const position = view.posAtDOM(node, offset);
          if (Number.isInteger(position)) return position;
        } catch {
        }
      }
    }
    const selection = view.state.selection;
    if (selection?.empty && Number.isInteger(selection.from)) return selection.from;
    return null;
  }

  function reportTableModelNode(controller, request) {
    const schema = controller?.view?.state?.schema;
    const nodes = schema?.nodes || {};
    const tableType = nodes.table;
    const rowType = nodes.tableRow;
    const cellType = nodes.tableCell || nodes.tableHeader;
    if (!schema || !tableType || !rowType || !cellType) return { ok: false, reason: "REPORT_TABLE_SCHEMA_UNSUPPORTED" };
    const createModelNode = (type, content) => {
      try {
        return type.create(null, content);
      } catch {
        try {
          return typeof type.createAndFill === "function" ? type.createAndFill(null, content) : null;
        } catch {
          return null;
        }
      }
    };
    const makeCell = (text) => {
      const normalizedText = normalizeTableCellText(text);
      const paragraphType = nodes.paragraph;
      if (paragraphType) {
        const content = normalizedText && typeof schema.text === "function" ? [schema.text(normalizedText)] : null;
        const paragraph = createModelNode(paragraphType, content);
        return paragraph ? createModelNode(cellType, [paragraph]) : null;
      }
      return createModelNode(cellType, null);
    };
    const rows = [];
    for (let rowIndex = 0; rowIndex < request.rowCount; rowIndex += 1) {
      const cells = [];
      for (let columnIndex = 0; columnIndex < request.columnCount; columnIndex += 1) {
        const cell = makeCell(request.cells[rowIndex]?.[columnIndex] || "");
        if (!cell) return { ok: false, reason: "REPORT_TABLE_CELL_SCHEMA_UNSUPPORTED" };
        cells.push(cell);
      }
      try {
        const row = createModelNode(rowType, cells);
        if (!row) return { ok: false, reason: "REPORT_TABLE_ROW_SCHEMA_UNSUPPORTED" };
        rows.push(row);
      } catch {
        return { ok: false, reason: "REPORT_TABLE_ROW_SCHEMA_UNSUPPORTED" };
      }
    }
    try {
      const table = createModelNode(tableType, rows);
      return table ? { ok: true, node: table } : { ok: false, reason: "REPORT_TABLE_SCHEMA_UNSUPPORTED" };
    } catch {
      return { ok: false, reason: "REPORT_TABLE_SCHEMA_UNSUPPORTED" };
    }
  }

  function reportTableMatchesRequest(table, block, request) {
    const snapshot = readTable(table, block, {});
    if (!snapshot.available || snapshot.rowCount !== request.rowCount || snapshot.columnCount !== request.columnCount) return false;
    return snapshot.cells.every((row, rowIndex) => row.every((cell, columnIndex) => cell.text === normalizeTableCellText(request.cells[rowIndex]?.[columnIndex] || "")));
  }

  function reportTableAtModelPosition(block, controller, position, request) {
    const view = controller?.view;
    const modelEntry = reportModelTableNearPosition(controller, position, request);
    const modelTable = reportTableDomForModel(controller, modelEntry, block);
    if (modelTable && reportTableMatchesRequest(modelTable, block, request)) return modelTable;
    return reportTableDomElements(block, controller).find((table) => {
      if (!reportTableMatchesRequest(table, block, request)) return false;
      if (typeof view?.posAtDOM !== "function") return true;
      try {
        const tablePosition = Number(view.posAtDOM(table, 0));
        return Number.isInteger(tablePosition) && Math.abs(tablePosition - position) <= 2;
      } catch {
        return false;
      }
    }) || null;
  }

  function makeReportTableTransaction(controller, position, tableNode) {
    const view = controller?.view;
    const state = view?.state;
    const transaction = state?.tr;
    if (!transaction) return { ok: false, reason: "REPORT_EDITOR_TRANSACTION_UNAVAILABLE" };
    if (typeof transaction.replaceSelectionWith === "function") {
      let selectionSet = false;
      try {
        const resolved = typeof state.doc?.resolve === "function" ? state.doc.resolve(position) : null;
        const Selection = state.selection?.constructor;
        if (resolved && typeof Selection?.near === "function" && typeof transaction.setSelection === "function") {
          transaction.setSelection(Selection.near(resolved));
          selectionSet = true;
        }
      } catch {
      }
      if (selectionSet || state.selection?.empty && Number(state.selection.from) === Number(position)) {
        try {
          const applied = transaction.replaceSelectionWith(tableNode, false);
          return { ok: true, transaction: applied || transaction, method: "replaceSelectionWith" };
        } catch {
        }
      }
    }
    if (typeof transaction.replaceRangeWith === "function") {
      try {
        const applied = transaction.replaceRangeWith(position, position, tableNode);
        return { ok: true, transaction: applied || transaction, method: "replaceRangeWith" };
      } catch {
      }
    }
    if (typeof transaction.insert === "function") {
      try {
        const applied = transaction.insert(position, tableNode);
        return { ok: true, transaction: applied || transaction, method: "insert" };
      } catch {
      }
    }
    return { ok: false, reason: "REPORT_EDITOR_TRANSACTION_REJECTED" };
  }

  function modelTableEntryForRollback(controller, insertedModel, position, request) {
    const entries = reportModelTableEntries(controller);
    return entries.find((entry) => entry.node === insertedModel?.node)
      || entries.find((entry) => reportModelTableMatchesRequest(entry, request) && Math.abs(entry.position - position) <= 2)
      || null;
  }

  function rollbackReportTableModel(controller, insertedModel, position, request) {
    try {
      const view = controller?.view;
      const entry = modelTableEntryForRollback(controller, insertedModel, position, request);
      const currentPosition = Number.isInteger(entry?.position) ? entry.position : position;
      const nodeSize = Number(entry?.node?.nodeSize || insertedModel?.node?.nodeSize || 0);
      if (!Number.isInteger(currentPosition) || nodeSize < 1 || typeof view?.state?.tr?.delete !== "function") {
        return { ok: false, reason: "REPORT_ROLLBACK_POSITION_UNAVAILABLE" };
      }
      const transaction = view.state.tr.delete(currentPosition, currentPosition + nodeSize);
      view.dispatch(transaction);
      const remaining = modelTableEntryForRollback(controller, insertedModel, position, request);
      return { ok: !remaining, modelPosition: currentPosition };
    } catch {
      return { ok: false, reason: "REPORT_ROLLBACK_FAILED" };
    }
  }

  async function waitForReportTableRender(block, controller, modelEntry, request, timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    do {
      const table = reportTableDomForModel(controller, modelEntry, block)
        || reportTableAtModelPosition(block, controller, modelEntry?.position, request);
      if (table && reportTableMatchesRequest(table, block, request)) return table;
      if (Date.now() < deadline) await sleep(50);
    } while (Date.now() < deadline);
    return null;
  }

  async function insertReportTableThroughModel(block, request, reference, operationId = "") {
    const controller = findReportEditorController(block);
    if (!controller) return { ok: false, reason: "REPORT_EDITOR_STATE_UNAVAILABLE" };
    const view = controller.view;
    const existingOperation = operationId && reportTableDomElements(block, controller).find((table) => table.getAttribute?.("data-tianyuan-workbench-operation") === operationId);
    if (existingOperation && reportTableMatchesRequest(existingOperation, block, request)) return { ok: true, table: readTable(existingOperation, block, {}), idempotent: true, model: controller.kind };
    const position = reportTableModelPosition(controller, block, reference);
    if (!Number.isInteger(position)) return { ok: false, reason: "REPORT_CARET_MODEL_POSITION_UNAVAILABLE" };
    const existingModel = reportModelTableNearPosition(controller, position, request);
    if (existingModel) {
      const existing = await waitForReportTableRender(block, controller, existingModel, request, 500);
      if (existing) return { ok: true, table: readTable(existing, block, {}), idempotent: true, model: controller.kind, modelPosition: existingModel.position };
      return { ok: false, reason: "REPORT_TABLE_MODEL_RENDER_MISSING", modelStateUpdated: true, modelTable: reportModelTableSummary(existingModel) };
    }
    const tableNodeResult = reportTableModelNode(controller, request);
    if (!tableNodeResult.ok) return tableNodeResult;
    const beforeModelNodes = new Set(reportModelTableEntries(controller).map((entry) => entry.node));
    const transactionResult = makeReportTableTransaction(controller, position, tableNodeResult.node);
    if (!transactionResult.ok) return transactionResult;
    try {
      view.dispatch(transactionResult.transaction);
    } catch {
      return { ok: false, reason: "REPORT_EDITOR_TRANSACTION_REJECTED" };
    }
    const insertedModel = reportModelTableEntries(controller).find((entry) => !beforeModelNodes.has(entry.node) && reportModelTableMatchesRequest(entry, request));
    if (!insertedModel) return { ok: false, reason: "REPORT_TABLE_MODEL_INSERT_NOT_CONFIRMED", modelStateUpdated: false };
    const rollback = () => rollbackReportTableModel(controller, insertedModel, position, request);
    const table = await waitForReportTableRender(block, controller, insertedModel, request);
    if (!table) return { ok: false, reason: "REPORT_TABLE_MODEL_RENDER_MISSING", modelStateUpdated: true, modelTable: { ...reportModelTableSummary(insertedModel), transactionMethod: transactionResult.method }, rollback };
    table.setAttribute?.("data-tianyuan-workbench-table", "true");
    if (operationId) table.setAttribute?.("data-tianyuan-workbench-operation", operationId);
    return { ok: true, table: readTable(table, block, {}), model: controller.kind, idempotent: false, rollback, position, modelPosition: insertedModel.position, transactionMethod: transactionResult.method, modelTable: { ...reportModelTableSummary(insertedModel), transactionMethod: transactionResult.method } };
  }
  async function insertControlledTable(block, request, reference = null, operationId = "") {
    if (isNewReportRoute()) {
      if (!dispatchControlledBeforeInput(block, "insertTable", "")) return { ok: false, reason: "REPORT_EDITOR_REJECTED" };
      return insertReportTableThroughModel(block, request, reference, operationId);
    }
    if (!block?.appendChild || !document.createElement) return { ok: false, reason: "TABLE_INSERT_UNAVAILABLE" };
    if (!dispatchControlledBeforeInput(block, "insertTable", "")) return { ok: false, reason: "TABLE_EDITOR_REJECTED" };
    const table = document.createElement("table");
    const tableKey = `workbench-${editBlockHash(`${editBlockId(block)}|${Date.now()}|${Math.random()}`).slice(8)}`;
    table.setAttribute("data-tianyuan-table-id", tableKey);
    table.setAttribute("data-tianyuan-workbench-table", "true");
    table.style.borderCollapse = "collapse";
    const body = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < request.rowCount; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < request.columnCount; columnIndex += 1) {
        const cell = document.createElement("td");
        const text = request.cells[rowIndex]?.[columnIndex] || "";
        cell.appendChild(document.createTextNode(text));
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    table.appendChild(body);
    if (reference?.mode === "caret") {
      const selection = window.getSelection?.();
      const range = createEditBlockRange(reference);
      if (!selection || !range || typeof range.insertNode !== "function") return { ok: false, reason: "TABLE_CARET_REFERENCE_INVALID" };
      selection.removeAllRanges();
      selection.addRange(range);
      range.insertNode(table);
    } else {
      block.appendChild(table);
    }
    if (request.tableFormat) {
      const formatted = applyTableFormat(table, block, { ...request, formatScope: "table", tabId: request.tabId });
      if (!formatted.ok) {
        block.removeChild?.(table);
        return formatted;
      }
    }
    dispatchControlledInput(block, "insertTable", "");
    const inserted = readTable(table, block, { tabId: request.tabId, blockId: request.blockId });
    return { ok: inserted.available, table: inserted, reason: inserted.available ? "" : inserted.reason };
  }

  function tablePageSession(payload) {
    return { sessionId: payload.sessionId, bindingId: payload.bindingId, projectId: payload.projectId, threadId: payload.threadId, tabId: payload.tabId };
  }

  function tablePageGate(context) {
    return editBlockPageGate(context);
  }

  function tablePayloadGate(payload, context, block) {
    const gate = editBlockPayloadGate(payload, context, block);
    if (!gate.ok) return gate;
    if (!block?.blockId || block.blockId !== String(payload.blockId || "")) return { ok: false, reason: "EDIT_BLOCK_ID_MISMATCH" };
    if (payload.tableAction === "insert" && block.blockMode === "caret") {
      if (!String(payload.expectedHash || "").trim()) return { ok: false, reason: "TABLE_CARET_HASH_REQUIRED" };
      if (String(payload.expectedHash).trim() !== block.currentHash) return { ok: false, reason: "TABLE_CARET_HASH_MISMATCH", currentHash: block.currentHash, expectedHash: payload.expectedHash };
      const caret = payload.caretReference;
      const actual = block.caretReference;
      if (caret && (!actual || caret.mode !== "caret" || String(caret.domPath || "") !== String(actual.domPath || "") || Number(caret.textOffset) !== Number(actual.textOffset) || String(caret.containerPath || "") !== String(actual.containerPath || ""))) return { ok: false, reason: "TABLE_CARET_REFERENCE_MISMATCH" };
    }
    if (payload.tableAction === "insert" && payload.caretReference?.mode === "caret" && block.blockMode !== "caret") return { ok: false, reason: "TABLE_CARET_REFERENCE_MISMATCH" };
    return { ok: true };
  }

  async function previewEditBlock(payload = {}) {
    const context = collectContext();
    const gate = editBlockPageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockSnapshot = selectionGate.ok ? blockReference && readEditBlock(blockReference, payload) : emptyEditBlock(selectionGate.reason);
    const result = {
      ok: gate.ok,
      action: "edit_block_preview",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, ok: false, gate: selectionGate, reason: selectionGate.reason };
    const payloadGate = editBlockPayloadGate(payload, context, blockSnapshot);
    if (!payloadGate.ok) return { ...result, ok: false, gate: payloadGate, reason: payloadGate.reason };
    const editBlock = blockSnapshot;
    const replacementText = normalizeEditBlockText(payload.replacementText);
    if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(replacementText)) return { ...result, ok: false, reason: "EDIT_BLOCK_SENSITIVE_TEXT" };
    const expectedHash = String(payload.expectedHash || "").trim();
    const expectedText = payload.expectedText === undefined ? null : normalizeEditBlockText(payload.expectedText);
    const hashMismatch = Boolean(expectedHash && expectedHash !== editBlock.currentHash);
    const textMismatch = expectedText !== null && expectedText !== editBlock.currentText;
    return {
      ...result,
      editBlock,
      originalText: editBlock.currentText,
      replacementText,
      diff: editBlockDiff(editBlock.currentText, replacementText),
      currentHash: editBlock.currentHash,
      expectedHash: expectedHash || null,
      editable: editBlock.editable,
      needsSave: Boolean(context.page?.saveButton?.visible),
      conflictRisk: hashMismatch || textMismatch || editBlock.stale,
      conflictReason: hashMismatch ? "EDIT_BLOCK_HASH_MISMATCH" : textMismatch ? "EDIT_BLOCK_TEXT_MISMATCH" : editBlock.reason || null,
      pageSession: { sessionId: payload.sessionId, bindingId: payload.bindingId, projectId: payload.projectId, threadId: payload.threadId, tabId: payload.tabId },
      security: editBlockSecurity(false),
    };
  }

  function replaceEditBlockContents(reference, replacementText) {
    const element = reference?.element || reference;
    const selection = window.getSelection?.();
    const range = createEditBlockRange(reference?.element ? reference : { element, mode: "element" });
    if (!selection || !range) return { ok: false, reason: "EDIT_BLOCK_SELECTION_UNAVAILABLE" };
    selection.removeAllRanges();
    selection.addRange(range);
    let beforeAccepted = true;
    try {
      beforeAccepted = element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: replacementText }));
    } catch {
    }
    if (beforeAccepted === false) return { ok: false, reason: "EDIT_BLOCK_EDITOR_REJECTED" };
    let usedEditorCommand = false;
    try {
      usedEditorCommand = typeof document.execCommand === "function" && document.execCommand("insertText", false, replacementText) === true;
    } catch {
    }
    const offsets = referenceOffsets(reference?.element ? reference : { element, mode: "element" }, element);
    const updatedReference = reference?.element
      ? { ...reference, rangeStart: offsets.start, rangeEnd: offsets.start + normalizeEditBlockText(replacementText).length, selectedText: normalizeEditBlockText(replacementText) }
      : { element, mode: "element" };
    let currentText = readEditBlock(updatedReference).currentText;
    if (currentText !== replacementText) {
      const fallbackRange = document.createRange();
      if (typeof fallbackRange.setStart === "function" && typeof fallbackRange.setEnd === "function") {
        const fallbackStart = rangeBoundaryAtOffset(element, offsets.start);
        const fallbackEnd = rangeBoundaryAtOffset(element, offsets.end);
        fallbackRange.setStart(fallbackStart.node, fallbackStart.offset);
        fallbackRange.setEnd(fallbackEnd.node, fallbackEnd.offset);
      } else if (typeof fallbackRange.selectNodeContents === "function") {
        fallbackRange.selectNodeContents(element);
      }
      fallbackRange.deleteContents();
      fallbackRange.insertNode(document.createTextNode(replacementText));
      currentText = readEditBlock(updatedReference).currentText;
    }
    try {
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacementText }));
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: currentText === replacementText, usedEditorCommand, currentText, reference: updatedReference };
  }

  async function executeEditBlock(payload = {}) {
    const context = collectContext();
    const gate = editBlockPageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    const result = {
      ok: false,
      action: "edit_block_execute",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
      writesPerformed: false,
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, reason: selectionGate.reason, gate: selectionGate };
    const payloadGate = editBlockPayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ...result, reason: payloadGate.reason, gate: payloadGate };
    if (payload.confirmText !== EDIT_BLOCK_CONFIRM_TEXT) return { ...result, reason: "EDIT_BLOCK_CONFIRM_TEXT_REQUIRED" };
    const expectedHash = String(payload.expectedHash || "").trim();
    const expectedText = payload.expectedText === undefined ? null : normalizeEditBlockText(payload.expectedText);
    if (!expectedHash && expectedText === null) return { ...result, reason: "EDIT_BLOCK_EXPECTED_CONTENT_REQUIRED" };
    if (expectedHash && expectedHash !== block.currentHash) return { ...result, reason: "EDIT_BLOCK_HASH_MISMATCH", editBlock: block, currentHash: block.currentHash, expectedHash, conflictRisk: true };
    if (expectedText !== null && expectedText !== block.currentText) return { ...result, reason: "EDIT_BLOCK_TEXT_MISMATCH", editBlock: block, currentHash: block.currentHash, conflictRisk: true };
    const replacementText = normalizeEditBlockText(payload.replacementText);
    if (EDIT_BLOCK_SENSITIVE_TEXT_PATTERN.test(replacementText)) return { ...result, reason: "EDIT_BLOCK_SENSITIVE_TEXT" };
    const changed = replaceEditBlockContents(blockReference, replacementText);
    const afterEdit = readEditBlock(changed.reference || blockReference, payload);
    const readback = { ok: changed.ok && afterEdit.currentText === replacementText, editBlock: afterEdit, expectedText: replacementText, currentText: afterEdit.currentText, currentHash: afterEdit.currentHash };
    if (!readback.ok) return { ...result, reason: changed.reason || "EDIT_BLOCK_READBACK_MISMATCH", readback, security: editBlockSecurity(true), writesPerformed: true };
    await sleep(120);
    const afterEditContext = collectContext();
    const saveAvailable = Boolean(afterEditContext.page?.saveButton?.enabled);
    if (!saveAvailable) return { ...result, ok: false, reason: "EDIT_BLOCK_MEMORY_ONLY", message: "已修改页面内存状态，尚未确认服务端保存。请不要关闭页面；如需回滚，可重新加载页面。", readback, rollback: "重新加载当前页面可恢复未保存状态。", security: editBlockSecurity(true), writesPerformed: true };
    installUploadNetworkMonitor();
    const save = await saveDraftWithNetworkEvidence(window.__tianyuanWorkbenchUploadNetworkLog.length, 7000);
    const savedBlock = locateEditBlockReference(payload.blockId, payload);
    const savedReadback = savedBlock ? readEditBlock(savedBlock, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND_AFTER_SAVE");
    if (!save.ok || !savedReadback.available || savedReadback.currentText !== replacementText) {
      return { ...result, reason: "EDIT_BLOCK_SAVE_NOT_CONFIRMED", readback: { ...readback, afterSave: savedReadback }, save, rollback: "保存未确认；请重新加载当前页面恢复未保存状态，再重新预演。", security: editBlockSecurity(true), writesPerformed: true };
    }
    return { ...result, ok: true, reason: null, readback: { ...readback, afterSave: savedReadback }, save, security: editBlockSecurity(true), writesPerformed: true };
  }

  async function readbackEditBlock(payload = {}) {
    const context = collectContext();
    const gate = editBlockPageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const element = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    if (!selectionGate.ok) return { ok: false, action: "edit_block_readback", reason: selectionGate.reason, editBlock: emptyEditBlock(selectionGate.reason), security: editBlockSecurity(false) };
    const payloadGate = editBlockPayloadGate(payload, context, block);
    if (!gate.ok || !payloadGate.ok) return { ok: false, action: "edit_block_readback", reason: gate.ok ? payloadGate.reason : gate.reason, editBlock: block, security: editBlockSecurity(false) };
    const expectedHash = String(payload.expectedHash || "").trim();
    const expectedText = payload.expectedText === undefined ? null : normalizeEditBlockText(payload.expectedText);
    const matchesExpected = (!expectedHash || expectedHash === block.currentHash) && (expectedText === null || expectedText === block.currentText);
    return { ok: true, action: "edit_block_readback", editBlock: block, matchesExpected, expectedHash: expectedHash || null, security: editBlockSecurity(false) };
  }

  async function previewEditBlockFormat(payload = {}) {
    const context = collectContext();
    const gate = editBlockPageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    const format = normalizeEditableFormat(payload.format);
    const result = {
      ok: gate.ok,
      action: "edit_block_format_preview",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, ok: false, reason: selectionGate.reason, gate: selectionGate };
    const payloadGate = editBlockPayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ...result, ok: false, reason: payloadGate.reason, gate: payloadGate };
    if (!format.ok) return { ...result, ok: false, reason: format.reason };
    const expectedHash = String(payload.expectedHash || "").trim();
    const expectedText = payload.expectedText === undefined ? null : normalizeEditBlockText(payload.expectedText);
    const hashMismatch = Boolean(expectedHash && expectedHash !== block.currentHash);
    const textMismatch = expectedText !== null && expectedText !== block.currentText;
    const replacementFormat = { ...block.format, ...format.format };
    return {
      ...result,
      editBlock: block,
      originalFormat: block.format,
      replacementFormat,
      formatChanges: formatChanges(block.format, replacementFormat, format.format),
      currentHash: block.currentHash,
      expectedHash: expectedHash || null,
      expectedText,
      editable: block.editable,
      needsSave: Boolean(context.page?.saveButton?.visible),
      conflictRisk: hashMismatch || textMismatch || block.stale,
      conflictReason: hashMismatch ? "EDIT_BLOCK_HASH_MISMATCH" : textMismatch ? "EDIT_BLOCK_TEXT_MISMATCH" : block.reason || null,
      pageSession: tablePageSession(payload),
      security: editBlockSecurity(false),
    };
  }

  function editBlockFormatMatches(actual, expected) {
    return Object.entries(expected || {}).every(([key, value]) => String(actual?.[key] ?? "").toLowerCase() === String(value).toLowerCase());
  }

  async function executeEditBlockFormat(payload = {}) {
    const context = collectContext();
    const gate = editBlockPageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    const format = normalizeEditableFormat(payload.format);
    const result = {
      ok: false,
      action: "edit_block_format_execute",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
      writesPerformed: false,
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, reason: selectionGate.reason, gate: selectionGate };
    const payloadGate = editBlockPayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ...result, reason: payloadGate.reason, gate: payloadGate };
    if (!format.ok) return { ...result, reason: format.reason };
    if (payload.confirmText !== EDIT_BLOCK_FORMAT_CONFIRM_TEXT) return { ...result, reason: "EDIT_BLOCK_FORMAT_CONFIRM_TEXT_REQUIRED" };
    const expectedHash = String(payload.expectedHash || "").trim();
    const expectedText = payload.expectedText === undefined ? null : normalizeEditBlockText(payload.expectedText);
    if (!expectedHash && expectedText === null) return { ...result, reason: "EDIT_BLOCK_EXPECTED_CONTENT_REQUIRED" };
    if (expectedHash && expectedHash !== block.currentHash) return { ...result, reason: "EDIT_BLOCK_HASH_MISMATCH", editBlock: block, currentHash: block.currentHash, expectedHash, conflictRisk: true };
    if (expectedText !== null && expectedText !== block.currentText) return { ...result, reason: "EDIT_BLOCK_TEXT_MISMATCH", editBlock: block, currentHash: block.currentHash, conflictRisk: true };
    const changed = applyEditBlockFormat(blockElement, format.format);
    const afterEdit = readEditBlock(blockReference, payload);
    const readback = { ok: changed.ok && editBlockFormatMatches(afterEdit.format, format.format), editBlock: afterEdit, originalFormat: block.format, replacementFormat: afterEdit.format, format: format.format };
    if (!readback.ok) return { ...result, reason: changed.reason || "EDIT_BLOCK_FORMAT_READBACK_MISMATCH", readback, security: editBlockSecurity(true), writesPerformed: true };
    await sleep(120);
    const afterEditContext = collectContext();
    const saveAvailable = Boolean(afterEditContext.page?.saveButton?.visible);
    if (!saveAvailable) return { ...result, ok: false, reason: "EDIT_BLOCK_MEMORY_ONLY", message: "已设置页面内存格式，尚未确认服务端保存。请不要关闭页面；如需回滚，可重新加载页面。", readback, rollback: "重新加载当前页面可恢复未保存状态。", security: editBlockSecurity(true), writesPerformed: true };
    installUploadNetworkMonitor();
    const save = await saveDraftWithNetworkEvidence(window.__tianyuanWorkbenchUploadNetworkLog.length, 7000);
    const savedBlock = locateEditBlockReference(payload.blockId, payload);
    const savedReadback = savedBlock ? readEditBlock(savedBlock, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND_AFTER_SAVE");
    if (!save.ok || !savedReadback.available || !editBlockFormatMatches(savedReadback.format, format.format)) {
      return { ...result, reason: "EDIT_BLOCK_FORMAT_SAVE_NOT_CONFIRMED", readback: { ...readback, afterSave: savedReadback }, save, rollback: "保存未确认；请重新加载当前页面恢复未保存状态，再重新预演。", security: editBlockSecurity(true), writesPerformed: true };
    }
    return { ...result, ok: true, reason: null, readback: { ...readback, afterSave: savedReadback }, save, security: editBlockSecurity(true), writesPerformed: true };
  }

  async function readbackEditBlockFormat(payload = {}) {
    const result = await readbackEditBlock(payload);
    return { ...result, action: "edit_block_format_readback", format: result.editBlock?.format || {} };
  }

  async function previewTable(payload = {}) {
    const context = collectContext();
    const gate = tablePageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    const request = normalizeTableRequest(payload);
    const result = {
      ok: gate.ok,
      action: "table_preview",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, ok: false, reason: selectionGate.reason, gate: selectionGate };
    const payloadGate = tablePayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ...result, ok: false, reason: payloadGate.reason, gate: payloadGate };
    if (!request.ok) return { ...result, ok: false, reason: request.reason };
    const target = request.request.tableAction === "insert" ? null : locateTable(blockElement, request.request.tableId);
    if (request.request.tableAction !== "insert" && !target) return { ...result, ok: false, reason: "TABLE_NOT_FOUND" };
    const table = target ? readTable(target, blockElement, payload) : null;
    if (target && !table.available) return { ...result, ok: false, reason: table.reason, table };
    const expectedTableHash = String(payload.expectedTableHash || "").trim();
    const hashMismatch = Boolean(expectedTableHash && table && expectedTableHash !== table.tableHash);
    const operation = { ...request.request };
    if (operation.tableAction === "update_cell") {
      const cell = table.cells[operation.rowIndex]?.[operation.columnIndex];
      if (!cell) return { ...result, ok: false, reason: "TABLE_CELL_NOT_FOUND", table };
      operation.originalText = cell.text;
      operation.replacementText = operation.cellText;
    }
    if (operation.tableAction === "format") {
      const targets = tableOperationTargets(target, operation);
      if (!targets.length) return { ...result, ok: false, reason: "TABLE_FORMAT_TARGET_NOT_FOUND", table };
      operation.originalFormat = table.format;
      operation.format = operation.tableFormat;
    }
    return {
      ...result,
      block: { blockId: block.blockId, mode: block.blockMode, editable: block.editable, currentHash: block.currentHash, caretReference: block.caretReference },
      table,
      operation,
      expectedHash: String(payload.expectedHash || "").trim() || null,
      caretReference: block.caretReference,
      expectedTableHash: expectedTableHash || null,
      currentTableHash: table?.tableHash || null,
      conflictRisk: hashMismatch,
      conflictReason: hashMismatch ? "TABLE_HASH_MISMATCH" : null,
      needsSave: Boolean(context.page?.saveButton?.visible),
      pageSession: tablePageSession(payload),
      security: editBlockSecurity(false),
    };
  }

  function tableFormatActual(table, request) {
    const rows = tableRows(table);
    const firstRow = rows[0];
    const firstCell = firstRow && tableCells(firstRow)[0];
    const targets = tableOperationTargets(table, request);
    const target = targets[0] || table;
    const actual = { ...(readTableFormat(request.formatScope === "cell" || request.formatScope === "row" ? target : table)) };
    if (request.tableFormat?.rowHeightPx !== undefined) actual.rowHeightPx = cssPixelValue(cssValue(request.formatScope === "table" ? firstRow : target, "height"));
    if (request.tableFormat?.columnWidthPx !== undefined) actual.columnWidthPx = cssPixelValue(cssValue(request.formatScope === "table" ? firstCell : target, "width"));
    if (request.formatScope === "table") {
      const cellFormat = readTableFormat(firstCell);
      for (const key of ["textAlign", "verticalAlign", "fontSizePx", "color", "fontWeight", "fontStyle"]) if (request.tableFormat?.[key] !== undefined) actual[key] = cellFormat[key];
    }
    return actual;
  }

  function tableFormatMatches(table, request) {
    return Object.entries(request.tableFormat || {}).every(([key, expected]) => {
      const actual = tableFormatActual(table, request)[key];
      return String(actual ?? "").toLowerCase() === String(expected).toLowerCase();
    });
  }


  function reportSaveNetworkItems(startIndex) {
    return networkEvidenceSince(startIndex).filter((item) => /(?:assignment_draft\/(?:seq\/)?save|new-report|report|draft|detail|document|content|editor)/i.test(item.url || ""));
  }

  function reportSaveSuccessEvidence(saveNetwork, messages) {
    const network = saveNetwork.some((item) => item.status >= 200 && item.status < 300 && (item.businessSuccess || !String(item.response || "").trim()));
    const page = messages.some((message) => /保存成功|草稿已保存|保存完成|已保存/i.test(message));
    return { network, page, ok: network || page };
  }

  async function saveNewReportDraftWithEvidence(networkStart) {
    const saveControl = findNewReportActionControl("SAVE_DRAFT");
    if (!saveControl) return { ok: false, reason: "REPORT_SAVE_ACTION_NOT_AVAILABLE", saveNetwork: [], pageSuccessTextFound: false };
    const previousTracking = Boolean(window.__tianyuanWorkbenchTrackNewReportSave);
    window.__tianyuanWorkbenchTrackNewReportSave = true;
    try {
      clickElement(saveControl);
      await sleep(350);
      const confirm = findNewReportActionControl("CONFIRM_SAVE_DRAFT");
      if (confirm && confirm !== saveControl) {
        clickElement(confirm);
        await sleep(350);
      }
      await sleep(3500);
      const saveNetwork = reportSaveNetworkItems(networkStart)
        .filter((item) => /assignment_draft\/seq\/save/i.test(item.url || ""));
      const messages = getPageMessages();
      const evidence = reportSaveSuccessEvidence(saveNetwork, messages);
      return {
        ok: evidence.ok,
        reason: evidence.ok ? null : saveNetwork.length ? "REPORT_SAVE_NOT_CONFIRMED" : confirm ? "REPORT_SAVE_NOT_CONFIRMED" : "REPORT_SAVE_CONFIRMATION_NOT_AVAILABLE",
        saveNetwork,
        saveEndpoint: saveNetwork.at(-1)?.url || "/ty/api/assignment_draft/seq/save",
        pageSuccessTextFound: evidence.page,
        networkSuccess: evidence.network,
        messages,
        saveControl: { action: reportActionValue(saveControl) || "label", visible: isVisible(saveControl) },
        confirmControlFound: Boolean(confirm),
      };
    } finally {
      window.__tianyuanWorkbenchTrackNewReportSave = previousTracking;
    }
  }
  async function executeTable(payload = {}) {
    const context = collectContext();
    const gate = tablePageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    const request = normalizeTableRequest(payload);
    const result = {
      ok: false,
      action: "table_execute",
      collectedAt: new Date().toISOString(),
      targetPage: editBlockTargetPage(context),
      gate,
      security: editBlockSecurity(false),
      writesPerformed: false,
    };
    if (!gate.ok) return result;
    if (!selectionGate.ok) return { ...result, reason: selectionGate.reason, gate: selectionGate };
    const payloadGate = tablePayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ...result, reason: payloadGate.reason, gate: payloadGate };
    if (!request.ok) return { ...result, reason: request.reason };
    if (payload.confirmText !== TABLE_CONFIRM_TEXT) return { ...result, reason: "TABLE_CONFIRM_TEXT_REQUIRED" };
    const operation = request.request;
    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    const reportPage = isNewReportRoute();
    const target = operation.tableAction === "insert" ? null : locateTable(blockElement, operation.tableId);
    if (operation.tableAction !== "insert" && !target) return { ...result, reason: "TABLE_NOT_FOUND" };
    const before = target ? readTable(target, blockElement, payload) : null;
    if (target && !before.available) return { ...result, reason: before.reason, table: before };
    const expectedTableHash = String(payload.expectedTableHash || "").trim();
    if (operation.tableAction !== "insert" && !expectedTableHash) return { ...result, reason: "TABLE_EXPECTED_HASH_REQUIRED" };
    if (expectedTableHash && before?.tableHash !== expectedTableHash) return { ...result, reason: "TABLE_HASH_MISMATCH", table: before, currentTableHash: before?.tableHash || null, expectedTableHash, conflictRisk: true };
    let changed;
    if (operation.tableAction === "insert") changed = await insertControlledTable(blockElement, { ...operation, tabId: payload.tabId, blockId: block.blockId }, blockReference, String(payload.previewActionId || ""));
    else if (operation.tableAction === "update_cell") {
      const cell = tableRows(target)[operation.rowIndex] && tableCells(tableRows(target)[operation.rowIndex])[operation.columnIndex];
      if (!cell) return { ...result, reason: "TABLE_CELL_NOT_FOUND", table: before };
      changed = replaceTableCell(cell, operation.cellText);
    } else changed = applyTableFormat(target, blockElement, { ...operation, tabId: payload.tabId });
    const after = operation.tableAction === "insert" ? changed.table : readTable(target, blockElement, payload);
    const readbackOk = changed.ok && after?.available && (
      operation.tableAction === "insert"
        || operation.tableAction === "format" && tableFormatMatches(target, operation)
        || operation.tableAction === "update_cell" && after.cells[operation.rowIndex]?.[operation.columnIndex]?.text === operation.cellText
    );
    const readback = { ok: readbackOk, before, after, table: after || null };
    if (!readback.ok) {
      const readbackRollback = operation.tableAction === "insert" && typeof changed.rollback === "function" && !changed.idempotent
        ? changed.rollback()
        : null;
      return { ...result, reason: changed.reason || "TABLE_READBACK_MISMATCH", readback, modelVerification: changed.modelTable || null, rollback: readbackRollback, security: editBlockSecurity(true), writesPerformed: true };
    }
    await sleep(120);
    if (reportPage) {
      const save = await saveNewReportDraftWithEvidence(networkStart);
      const savedReference = locateEditBlockReference(payload.blockId, payload);
      const savedBlockElement = savedReference?.element || blockElement;
      const savedTarget = operation.tableAction === "insert" ? locateTable(savedBlockElement, after.tableId) : locateTable(savedBlockElement, operation.tableId);
      const savedReadback = savedTarget ? readTable(savedTarget, savedBlockElement, payload) : emptyTable("TABLE_NOT_FOUND_AFTER_SAVE");
      const savedOk = save.ok && savedReadback.available && (
        operation.tableAction === "insert"
          ? reportTableMatchesRequest(savedTarget, savedBlockElement, operation)
          : operation.tableAction === "format" && tableFormatMatches(savedTarget, operation)
            || operation.tableAction === "update_cell" && savedReadback.cells[operation.rowIndex]?.[operation.columnIndex]?.text === operation.cellText
      );
      if (!savedOk) {
        const rollback = changed.idempotent ? { ok: true, skipped: true } : changed.rollback?.() || { ok: false, reason: "REPORT_ROLLBACK_UNAVAILABLE" };
        return { ...result, reason: save.reason || "TABLE_SAVE_NOT_CONFIRMED", readback: { ...readback, afterSave: savedReadback }, modelVerification: changed.modelTable || null, save, rollback, security: editBlockSecurity(true), writesPerformed: true };
      }
      const operationKey = `${block.blockId}|${String(payload.previewActionId || "")}`;
      if (operation.tableAction === "insert" && payload.previewActionId) tableOperationRegistry.set(operationKey, { tableId: savedReadback.tableId, saved: true });
      return {
        ...result,
        ok: true,
        reason: null,
        readback: { ...readback, afterSave: savedReadback },
        modelVerification: changed.modelTable || null,
        save,
        persistence: {
          stateModel: "prosemirror",
          modelStateUpdated: true,
          saveEndpoint: save.saveEndpoint || "/ty/api/assignment_draft/seq/save",
          serverSaveConfirmed: true,
          refreshReadback: {
            action: "table_readback",
            blockId: block.blockId,
            caretReference: block.caretReference,
            tableId: savedReadback.tableId,
            expectedTableHash: savedReadback.tableHash,
          },
        },
        security: editBlockSecurity(true),
        writesPerformed: true,
      };
    }
    const saveAvailable = Boolean(collectContext().page?.saveButton?.enabled);
    if (!saveAvailable) return { ...result, ok: false, reason: "TABLE_MEMORY_ONLY", message: "已修改页面内存状态，尚未确认服务端保存。请不要关闭页面；如需回滚，可重新加载页面。", readback, rollback: "重新加载当前页面可恢复未保存状态。", security: editBlockSecurity(true), writesPerformed: true };
    const save = await saveDraftWithNetworkEvidence(networkStart, 7000);
    const savedTarget = operation.tableAction === "insert" ? locateTable(blockElement, after.tableId) : locateTable(blockElement, operation.tableId);
    const savedReadback = savedTarget ? readTable(savedTarget, blockElement, payload) : emptyTable("TABLE_NOT_FOUND_AFTER_SAVE");
    const savedOk = save.ok && savedReadback.available && (
      operation.tableAction === "insert"
        || operation.tableAction === "format" && tableFormatMatches(savedTarget, operation)
        || operation.tableAction === "update_cell" && savedReadback.cells[operation.rowIndex]?.[operation.columnIndex]?.text === operation.cellText
    );
    if (!savedOk) return { ...result, reason: "TABLE_SAVE_NOT_CONFIRMED", readback: { ...readback, afterSave: savedReadback }, save, rollback: "保存未确认；请重新加载当前页面恢复未保存状态，再重新预演。", security: editBlockSecurity(true), writesPerformed: true };
    return { ...result, ok: true, reason: null, readback: { ...readback, afterSave: savedReadback }, save, security: editBlockSecurity(true), writesPerformed: true };
  }

  async function readbackTable(payload = {}) {
    const context = collectContext();
    const gate = tablePageGate(context);
    const selectionGate = editBlockSelectionGate(payload);
    const blockReference = selectionGate.ok ? locateEditBlockReference(payload.blockId, payload) : null;
    const blockElement = blockReference?.element || null;
    const block = blockReference ? readEditBlock(blockReference, payload) : emptyEditBlock("EDIT_BLOCK_NOT_FOUND");
    if (!gate.ok) return { ok: false, action: "table_readback", reason: gate.reason, security: editBlockSecurity(false) };
    if (!selectionGate.ok) return { ok: false, action: "table_readback", reason: selectionGate.reason, security: editBlockSecurity(false) };
    const payloadGate = tablePayloadGate(payload, context, block);
    if (!payloadGate.ok) return { ok: false, action: "table_readback", reason: payloadGate.reason, security: editBlockSecurity(false) };
    const table = locateTable(blockElement, payload.tableId);
    if (!table) return { ok: false, action: "table_readback", reason: "TABLE_NOT_FOUND", table: emptyTable("TABLE_NOT_FOUND"), security: editBlockSecurity(false) };
    const snapshot = readTable(table, blockElement, payload);
    const expectedTableHash = String(payload.expectedTableHash || "").trim();
    return { ok: snapshot.available, action: "table_readback", reason: snapshot.available ? null : snapshot.reason, table: snapshot, matchesExpected: !expectedTableHash || expectedTableHash === snapshot.tableHash, expectedTableHash: expectedTableHash || null, security: editBlockSecurity(false) };
  }

  async function activateSubjectByLabel(label) {
    const target = String(label || "").trim();
    const result = {
      ok: false,
      action: "activate_subject_by_label",
      label: target,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };

    if (!target) return { ...result, reason: "LABEL_EMPTY" };

    const candidates = [...document.querySelectorAll(".el-tree-node__content, .el-tree-node__label, [role='treeitem'], li, .subject-tree span, span")]
      .filter(isVisible)
      .map((element) => ({ element, text: textOf(element) }))
      .filter((item) => item.text === target);

    const match = candidates[0];
    if (!match) {
      return {
        ...result,
        reason: "SUBJECT_LABEL_NOT_FOUND",
        visibleSubjects: collectSubjectTreeItems().slice(0, 120),
      };
    }

    clickElement(match.element);
    await sleep(1800);
    result.ok = true;
    result.after = collectContext();
    return result;
  }

  async function activateSubjectByPath(path) {
    const targetPath = String(path || "").trim();
    const result = {
      ok: false,
      action: "activate_subject_by_path",
      path: targetPath,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };
    if (!targetPath) return { ...result, reason: "PATH_EMPTY" };

    // A fresh draft route can restore the subject tree with all parents
    // collapsed. Expand it before matching a path so every selected subject
    // gets a real navigation attempt during batch execution.
    const expandedClickCount = await expandSubjectTreeForCollection();
    result.expandedClickCount = expandedClickCount;

    function directNodeText(node) {
      const content = node?.querySelector?.(":scope > .el-tree-node__content")
        || node?.querySelector?.(".el-tree-node__content");
      return textOf(content || node);
    }

    function nodePath(node) {
      const parts = [];
      let current = node;
      while (current) {
        if (current.classList?.contains("el-tree-node")) {
          const text = directNodeText(current);
          if (text) parts.unshift(text);
        }
        current = current.parentElement?.closest?.(".el-tree-node") || null;
      }
      return parts.join("/");
    }

    function normalizePath(value) {
      return String(value || "")
        .split("/")
        .map((part) => part.replace(/\s+/g, "").trim())
        .filter(Boolean)
        .join("/");
    }

    const normalizedTargetPath = normalizePath(targetPath);
    function findMatch() {
      return [...document.querySelectorAll(".el-tree-node")]
        .filter(isVisible)
        .map((node) => ({
          node,
          path: nodePath(node),
          content: node.querySelector?.(":scope > .el-tree-node__content")
            || node.querySelector?.(".el-tree-node__content"),
        }))
        .find((item) => {
          const normalizedPath = normalizePath(item.path);
          return normalizedPath === normalizedTargetPath || normalizedPath.endsWith(`/${normalizedTargetPath}`);
        });
    }

    let match = findMatch();
    const rootContainers = [".el-tree", "[role='tree']", ".subject-tree"]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);
    const scrollTargets = getTreeScrollTargets(rootContainers);

    for (const target of scrollTargets) {
      if (match) break;
      const originalTop = target.scrollTop;
      for (let round = 0; round < 30 && !match; round += 1) {
        match = findMatch();
        const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
        if (target.scrollTop >= maxTop - 2) break;
        target.scrollTop = Math.min(maxTop, target.scrollTop + Math.max(120, Math.floor(target.clientHeight * 0.8)));
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(120);
      }
      if (!match) {
        target.scrollTop = originalTop;
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    }

    if (!match?.content) {
      return { ...result, reason: "SUBJECT_PATH_NOT_FOUND", visibleSubjects: collectSubjectTreeItems().slice(0, 120) };
    }

    clickElement(match.content);
    await sleep(1800);
    result.ok = true;
    result.after = collectContext();
    return result;
  }

  async function runAction(payload) {
    if (payload?.action === "save_asset_draft_current_subject") {
      return await saveCurrentDraft(payload);
    }
    if (payload?.action === "exit_edit_current_subject") {
      return await exitEditCurrentSubject(payload);
    }
    if (payload?.action === "list_asset_draft_companies") {
      return await listCompaniesFromSelector();
    }
    if (payload?.action === "list_asset_draft_subjects") {
      return await listAssetDraftSubjects();
    }
    if (payload?.action === "open_company_selector") {
      return await openCompanySelector();
    }
    if (payload?.action === "read_selected_companies") {
      return await readSelectedCompaniesFromOpenDialog(payload || {});
    }
    if (payload?.action === "list_equity_table_companies") {
      return await listEquityTableCompanies();
    }
    if (payload?.action === "activate_subject_by_label") {
      return await activateSubjectByLabel(payload?.label);
    }
    if (payload?.action === "activate_subject_by_path") {
      return await activateSubjectByPath(payload?.path);
    }
    if (payload?.action === "preview_audit_attachment_upload") {
      return await prepareAuditAttachmentUpload(payload);
    }
    if (payload?.action === "inspect_batch_upload_target") {
      return await inspectBatchUploadTarget(payload);
    }
    if (payload?.action === "inspect_batch_upload_positions") {
      return await inspectBatchUploadPositions(payload);
    }
    if (payload?.action === "upload_audit_attachment") {
      return await uploadAuditAttachment(payload);
    }
    if (payload?.action === "save_batch_upload_draft") {
      return await saveBatchUploadDraft(payload);
    }
    if (payload?.action === "batch_upload_audit_attachments") {
      return await batchUploadAuditAttachments(payload);
    }
    if (payload?.action === "inspect_audit_check_row") {
      return await inspectAuditCheckRow(payload);
    }
    if (payload?.action === "set_audit_check_result") {
      return await setAuditCheckResult(payload);
    }
    if (payload?.action === "scan_audit_index_check_rows") {
      return await scanAuditIndexCheckRows(payload);
    }
    if (payload?.action === "batch_set_audit_check_results") {
      return await batchSetAuditCheckResults(payload);
    }
    if (payload?.action === "clear_audit_test_rows") {
      return await clearAuditTestRows(payload);
    }
    if (payload?.action === "clear_audit_attachments") {
      return await clearAuditAttachments(payload);
    }
    if (payload?.action === "edit_block_preview") {
      return await previewEditBlock(payload);
    }
    if (payload?.action === "edit_block_execute") {
      return await executeEditBlock(payload);
    }
    if (payload?.action === "edit_block_readback") {
      return await readbackEditBlock(payload);
    }
    if (payload?.action === "edit_block_format_preview") {
      return await previewEditBlockFormat(payload);
    }
    if (payload?.action === "edit_block_format_execute") {
      return await executeEditBlockFormat(payload);
    }
    if (payload?.action === "edit_block_format_readback") {
      return await readbackEditBlockFormat(payload);
    }
    if (payload?.action === "table_preview") {
      return await previewTable(payload);
    }
    if (payload?.action === "table_execute") {
      return await executeTable(payload);
    }
    if (payload?.action === "table_readback") {
      return await readbackTable(payload);
    }

    return {
      ok: false,
      reason: "UNKNOWN_ACTION",
      action: payload?.action || null,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };
  }

  const previousAdapterState = window[ADAPTER_STATE_KEY];
  if (previousAdapterState?.contextListener) {
    window.removeEventListener("message", previousAdapterState.contextListener);
  }
  if (previousAdapterState?.actionListener) {
    window.removeEventListener("message", previousAdapterState.actionListener);
  }
  if (previousAdapterState?.selectionListeners) {
    for (const item of previousAdapterState.selectionListeners) {
      document.removeEventListener(item.type, item.listener, item.capture);
    }
  }
  window.__tianyuanWorkbenchPageAdapterInstalled = true;
  window.__tianyuanWorkbenchPageAdapterVersion = ADAPTER_VERSION;
  installUploadNetworkMonitor();

  function rememberSelectedEditBlock() {
    const selected = selectedEditBlock();
    if (selected?.reason) {
      lastEditBlockElement = null;
      lastEditBlockReference = null;
      lastEditBlockSnapshot = null;
      return;
    }
    if (!selected?.reference) {
      if (window.getSelection?.()?.rangeCount > 0) return;
      lastEditBlockElement = null;
      lastEditBlockReference = null;
      lastEditBlockSnapshot = null;
      return;
    }
    const snapshot = readEditBlock(selected.reference);
    lastEditBlockElement = snapshot.available ? selected.reference.element : null;
    lastEditBlockReference = snapshot.available ? selected.reference : null;
    lastEditBlockSnapshot = snapshot.available ? snapshot : null;
  }

  const selectionListeners = [
    { type: "mouseup", listener: rememberSelectedEditBlock, capture: true },
    { type: "selectionchange", listener: rememberSelectedEditBlock, capture: true },
    { type: "keyup", listener: rememberSelectedEditBlock, capture: true },
  ];
  for (const item of selectionListeners) document.addEventListener(item.type, item.listener, item.capture);

  const contextListener = (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE) return;

    let payload;
    try {
      payload = collectContext();
    } catch (error) {
      payload = {
        ok: false,
        reason: "PAGE_ADAPTER_COLLECT_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
      };
    }

    payload = { ...payload, adapterVersion: ADAPTER_VERSION, buildId: EXTENSION_BUILD_ID };
    window.postMessage({ type: RESPONSE_TYPE, requestId: data.requestId, payload }, "*");
  };

  const actionListener = async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== ACTION_REQUEST_TYPE) return;

    let payload;
    try {
      payload = await runAction(data.payload || {});
    } catch (error) {
      payload = {
        ok: false,
        reason: "PAGE_ADAPTER_ACTION_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
      };
    }

    payload = { ...payload, adapterVersion: ADAPTER_VERSION, buildId: EXTENSION_BUILD_ID };
    window.postMessage({ type: ACTION_RESPONSE_TYPE, requestId: data.requestId, payload }, "*");
  };

  window.addEventListener("message", contextListener);
  window.addEventListener("message", actionListener);
  window[ADAPTER_STATE_KEY] = {
    adapterVersion: ADAPTER_VERSION,
    buildId: EXTENSION_BUILD_ID,
    contextListener,
    actionListener,
    selectionListeners,
  };
})();
