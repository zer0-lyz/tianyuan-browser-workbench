(() => {
const ADAPTER_VERSION = "2026-08-28-edit-block-caret-v1";
const EXTENSION_VERSION = "0.14.25";
const EXTENSION_BUILD_ID = "0.14.25-2026082803";
const PAGE_ADAPTER_STATE_KEY = "__tianyuanWorkbenchPageAdapterState";
const CONTENT_STATE_KEY = "__tianyuanWorkbenchContentScriptState";
const INJECTED_SCRIPT_ID = `tianyuan-workbench-page-adapter-${ADAPTER_VERSION}`;
const EXT_REQUEST_TYPE = "TIANYUAN_WORKBENCH_GET_CONTEXT_V2";
const EXT_ACTION_REQUEST_TYPE = "TIANYUAN_WORKBENCH_RUN_ACTION_V2";
const PAGE_REQUEST_TYPE = `TIANYUAN_WORKBENCH_GET_CONTEXT:${ADAPTER_VERSION}`;
const PAGE_RESPONSE_TYPE = `TIANYUAN_WORKBENCH_CONTEXT_RESULT:${ADAPTER_VERSION}`;
const PAGE_ACTION_REQUEST_TYPE = `TIANYUAN_WORKBENCH_RUN_ACTION:${ADAPTER_VERSION}`;
const PAGE_ACTION_RESPONSE_TYPE = `TIANYUAN_WORKBENCH_ACTION_RESULT:${ADAPTER_VERSION}`;
const MAX_SELECTION_TEXT = 10000;
const MAX_EDIT_BLOCK_TEXT = 200000;
const SENSITIVE_FIELD_PATTERN = /(password|passwd|pwd|token|secret|authorization|cookie|credential|验证码|校验码|动态码|口令|密钥)/i;
const SENSITIVE_TEXT_PATTERN = /(?:bearer\s+|authorization\s*[:=]|access[_-]?token\s*[:=]|mcp\s*token\s*[:=]|密码\s*[:：=]|验证码\s*[:：=])/i;

function safePageUrl() {
  try {
    const url = new URL(location.href);
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return String(location.href || "").slice(0, 1000);
  }
}

function cleanText(value) {
  return String(value || "").slice(0, MAX_SELECTION_TEXT).trim();
}

function normalizeBlockText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_EDIT_BLOCK_TEXT);
}

function hashText(value) {
  let hash = 2166136261;
  const text = normalizeBlockText(value);
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

function readEditingBlockFormat(element) {
  const style = element?.style || {};
  const computed = window.getComputedStyle?.(element) || {};
  const value = (property) => String(style[property] || computed[property] || "");
  return {
    fontWeight: value("fontWeight") || "normal",
    fontStyle: value("fontStyle") || "normal",
    textDecoration: value("textDecoration") || "none",
    textAlign: value("textAlign") || "left",
    fontSizePx: cssPixelValue(value("fontSize")),
    color: value("color") || "",
    highlightColor: normalizeCssColor(value("backgroundColor")),
    lineHeightPx: cssPixelValue(value("lineHeight")),
    indentPx: cssPixelValue(value("textIndent")) ?? 0,
  };
}

function elementAttributes(element) {
  return [
    element?.getAttribute?.("type"),
    element?.getAttribute?.("name"),
    element?.getAttribute?.("id"),
    element?.getAttribute?.("autocomplete"),
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("placeholder"),
    element?.getAttribute?.("data-testid"),
  ].filter(Boolean).join(" ");
}

function isSensitiveElement(element) {
  let current = element;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    const tag = String(current.tagName || "").toUpperCase();
    const type = String(current.getAttribute?.("type") || "").toLowerCase();
    if (current.hidden || current.getAttribute?.("aria-hidden") === "true" || type === "hidden" || type === "password") return true;
    if ((tag === "INPUT" || tag === "TEXTAREA") && SENSITIVE_FIELD_PATTERN.test(elementAttributes(current))) return true;
  }
  return false;
}

function looksSensitiveText(text) {
  return SENSITIVE_TEXT_PATTERN.test(text) || /^(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{48,})$/.test(text);
}

function describeElement(element) {
  if (!element) return null;
  const tag = String(element.tagName || "").toLowerCase();
  const id = String(element.id || "").trim().slice(0, 160);
  const name = String(element.getAttribute?.("name") || "").trim().slice(0, 160);
  const role = String(element.getAttribute?.("role") || "").trim().slice(0, 80);
  return {
    tag,
    id: id || null,
    name: name || null,
    role: role || null,
    contentEditable: element.isContentEditable === true || element.getAttribute?.("contenteditable") === "true",
  };
}

function isEditableElement(element) {
  if (!element) return false;
  const contentEditable = String(element.getAttribute?.("contenteditable") || "").toLowerCase();
  return contentEditable !== "false" && (element.isContentEditable === true || ["", "true", "plaintext-only"].includes(contentEditable));
}

function contentText(element) {
  return normalizeBlockText(element?.textContent || element?.innerText || element?.value || "");
}

function contentTextLength(node) {
  if (!node) return 0;
  if (node.nodeType === 3) return String(node.nodeValue ?? node.data ?? "").length;
  const children = node.childNodes ? [...node.childNodes] : node.children ? [...node.children] : [];
  return children.reduce((total, child) => total + contentTextLength(child), 0);
}

function contentNodeContains(root, node) {
  let current = node;
  for (let depth = 0; current && depth < 80; depth += 1, current = current.parentNode || current.parentElement) {
    if (current === root) return true;
  }
  return false;
}

function contentRangeOffset(root, container, offset) {
  if (!contentNodeContains(root, container)) return null;
  let total = 0;
  let result = null;
  const visit = (node) => {
    if (result !== null) return;
    if (node === container) {
      if (node.nodeType === 3) {
        result = total + Math.max(0, Math.min(Number(offset) || 0, contentTextLength(node)));
        return;
      }
      const children = node.childNodes ? [...node.childNodes] : node.children ? [...node.children] : [];
      for (let index = 0; index < Math.max(0, Math.min(Number(offset) || 0, children.length)); index += 1) total += contentTextLength(children[index]);
      result = total;
      return;
    }
    if (node.nodeType === 3) {
      total += contentTextLength(node);
      return;
    }
    const children = node.childNodes ? [...node.childNodes] : node.children ? [...node.children] : [];
    for (const child of children) visit(child);
  };
  visit(root);
  return result;
}

function contentReferenceOffsets(root, range, selectedText) {
  const start = contentRangeOffset(root, range?.startContainer, range?.startOffset);
  const end = contentRangeOffset(root, range?.endContainer, range?.endOffset);
  if (start !== null && end !== null && end >= start) return { start, end };
  const text = contentText(root);
  const index = selectedText ? text.indexOf(selectedText) : -1;
  return index >= 0 ? { start: index, end: index + selectedText.length } : null;
}

function isBroadEditableContainer(element) {
  const tag = String(element?.tagName || "").toUpperCase();
  const role = String(element?.getAttribute?.("role") || "").toLowerCase();
  return role === "textbox" || (tag === "DIV" && element?.getAttribute?.("contenteditable") != null
    && !["data-block-id", "data-field-id", "data-field-key"].some((name) => element.getAttribute?.(name)));
}

function editableRootForNode(node) {
  let current = node?.nodeType === 1 ? node : node?.parentElement || node?.parentNode;
  let fallback = null;
  for (let depth = 0; current && depth < 20 && current !== document.body; depth += 1, current = current.parentElement || current.parentNode) {
    if (!isEditableElement(current)) continue;
    fallback = current;
    if (current.getAttribute?.("contenteditable") != null) return current;
  }
  return fallback;
}

function isEditableBlockLike(element, root = null) {
  if (!element || element === root || !isEditableElement(element)) return false;
  const tag = String(element.tagName || "").toUpperCase();
  return ["MARK", "P", "LI", "TD", "TH", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "DIV"].includes(tag)
    || element.getAttribute?.("role") === "paragraph"
    || ["data-block-id", "data-field-id", "data-field-key"].some((name) => element.getAttribute?.(name));
}

function editableBlockForNode(node, root = null) {
  let current = node?.nodeType === 1 ? node : node?.parentElement || node?.parentNode;
  let fallback = null;
  for (let depth = 0; current && depth < 20 && current !== document.body; depth += 1, current = current.parentElement || current.parentNode) {
    if (!isEditableElement(current)) continue;
    if (!fallback) fallback = current;
    if (isEditableBlockLike(current, root)) return current;
    if (current === root) break;
  }
  return root && fallback ? root : fallback;
}

function domPath(element) {
  const parts = [];
  let current = element;
  for (let depth = 0; current && depth < 12 && current !== document.body; depth += 1, current = current.parentElement) {
    const tag = String(current.tagName || "element").toLowerCase();
    const siblings = current.parentElement?.children
      ? [...current.parentElement.children].filter((item) => String(item.tagName || "").toLowerCase() === tag)
      : [];
    const index = siblings.indexOf(current);
    parts.unshift(`${tag}:${index >= 0 ? index + 1 : 1}`);
  }
  return parts.join("/") || String(element?.tagName || "element").toLowerCase();
}

function nodePath(root, node) {
  if (!root || !node || !contentNodeContains(root, node)) return "";
  const parts = [];
  let current = node;
  while (current && current !== root && parts.length < 40) {
    const parent = current.parentNode || current.parentElement;
    if (!parent) return "";
    const children = parent.childNodes ? [...parent.childNodes] : parent.children ? [...parent.children] : [];
    const index = children.indexOf(current);
    if (index < 0) return "";
    parts.unshift(`${current.nodeType === 3 ? "text" : "node"}:${index}`);
    current = parent;
  }
  return current === root ? parts.join("/") || "root" : "";
}

function stableBlockId(element) {
  const explicit = ["data-block-id", "data-field-id", "data-field-key", "data-testid", "id", "name", "aria-label"]
    .map((name) => String(element?.getAttribute?.(name) || "").trim())
    .find(Boolean);
  return (explicit ? `dom:${explicit}` : `dom-path:${domPath(element)}`).slice(0, 500);
}

function editableBlockReference(element, range, selectedText = "") {
  const fullText = contentText(element);
  const offsets = contentReferenceOffsets(element, range, selectedText) || { start: 0, end: fullText.length };
  let start = Math.max(0, Math.min(offsets.start, fullText.length));
  let end = Math.max(start, Math.min(offsets.end, fullText.length));
  let actualText = fullText.slice(start, end);
  if (!actualText && selectedText && !range?.startContainer) {
    actualText = fullText;
    start = 0;
    end = fullText.length;
  }
  const forceRange = isBroadEditableContainer(element);
  const isCaret = Boolean(range && (range.collapsed === true || (!selectedText && start === end)));
  const baseId = stableBlockId(element);
  const isWhole = !isCaret && !forceRange && start === 0 && end === fullText.length;
  const prefix = fullText.slice(Math.max(0, start - 80), start);
  const suffix = fullText.slice(end, end + 80);
  const signature = hashText(`${prefix}\u0000${actualText}\u0000${suffix}`);
  return {
    element,
    baseId,
    blockId: isCaret ? `dom-caret:${baseId}:${hashText(`${baseId}\u0000${nodePath(element, range.startContainer)}\u0000${Number(range.startOffset) || 0}\u0000${fullText}`)}`.slice(0, 500) : isWhole ? baseId : `dom-range:${baseId}:${signature}`.slice(0, 500),
    mode: isCaret ? "caret" : isWhole ? "element" : "range",
    rangeStart: start,
    rangeEnd: end,
    selectedText: actualText,
    prefix,
    suffix,
    broadContainer: forceRange,
    caretContainerPath: isCaret ? domPath(element) : "",
    caretPath: isCaret ? nodePath(element, range.startContainer) : "",
    caretOffset: isCaret ? Math.max(0, Number(range.startOffset) || 0) : null,
  };
}

function rebindEditableBlock(reference) {
  if (!reference) return null;
  if (reference.element && document.contains?.(reference.element)) return reference;
  const candidates = [...(document.querySelectorAll?.("mark,p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,div,[contenteditable],[data-block-id],[data-field-id],[data-field-key]") || [])]
    .filter((element) => isEditableElement(element));
  const baseId = reference.baseId || stableBlockId(reference.element);
  const candidate = candidates.find((element) => stableBlockId(element) === baseId)
    || (reference.selectedText && candidates.find((element) => contentText(element).includes(reference.selectedText)));
  return candidate ? { ...reference, element: candidate } : null;
}

function safeHint(element) {
  const candidate = isEditableBlockLike(element) ? element : element?.closest?.("[data-field-label],[data-field],[data-field-key],p,li,td,th") || element?.parentElement;
  const value = String(candidate?.innerText || candidate?.textContent || "").replace(/\s+/g, " ").trim();
  if (!value || SENSITIVE_TEXT_PATTERN.test(value)) return "";
  return value.slice(0, 300);
}

function emptyEditingBlock(reason = "") {
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

function makeEditingBlock(target, reference = {}) {
  const element = reference?.element || target;
  if (!isEditableElement(element)) return emptyEditingBlock("EDIT_BLOCK_NOT_EDITABLE");
  const descriptor = describeElement(element);
  const type = String(element.getAttribute?.("type") || "").toLowerCase();
  const attributes = elementAttributes(element);
  if (element.hidden || element.getAttribute?.("aria-hidden") === "true" || type === "hidden" || type === "password" || SENSITIVE_FIELD_PATTERN.test(attributes)) {
    return emptyEditingBlock("EDIT_BLOCK_SENSITIVE_FIELD");
  }
  const containerText = contentText(element);
  const start = reference?.mode === "range" || reference?.mode === "caret" ? Math.max(0, Math.min(Number(reference.rangeStart) || 0, containerText.length)) : 0;
  const end = reference?.mode === "caret" ? start : reference?.mode === "range" ? Math.max(start, Math.min(Number(reference.rangeEnd) || 0, containerText.length)) : containerText.length;
  const originalText = containerText.slice(start, end);
  if (SENSITIVE_TEXT_PATTERN.test(originalText)) return emptyEditingBlock("EDIT_BLOCK_SENSITIVE_TEXT");
  const contentHash = reference?.mode === "caret" ? hashText(containerText) : hashText(originalText);
  const caretReference = reference?.mode === "caret" ? {
    mode: "caret",
    baseId: reference.baseId || stableBlockId(element),
    blockId: reference.blockId || "",
    containerPath: reference.caretContainerPath || domPath(element),
    domPath: reference.caretPath || "",
    textOffset: Number.isInteger(reference.caretOffset) ? reference.caretOffset : start,
  } : null;
  return {
    available: true,
    valid: true,
    stale: false,
    reason: "",
    blockId: reference.blockId || stableBlockId(element),
    tabId: null,
    pageUrl: safePageUrl(),
    pageTitle: String(document.title || "").slice(0, 300),
    element: { ...descriptor, blockId: reference.blockId || stableBlockId(element), stablePath: domPath(element), scope: reference.mode === "range" ? "text-range" : reference.mode === "caret" ? "caret" : "element" },
    editable: true,
    originalText,
    currentText: originalText,
    contentHash,
    currentHash: contentHash,
    capturedAt: new Date().toISOString(),
    paragraphHint: safeHint(element),
    fieldHint: String(element.getAttribute?.("data-field-label") || element.getAttribute?.("aria-label") || "").slice(0, 200),
    containerText,
    containerHash: hashText(containerText),
    rangeStart: start,
    rangeEnd: end,
    selectedText: originalText,
    blockMode: reference.mode || "element",
    broadContainer: Boolean(reference.broadContainer),
    caretReference,
    format: readEditingBlockFormat(element),
  };
}

function emptySelection() {
  return {
    available: false,
    text: "",
    source: "",
    mode: "",
    pageUrl: "",
    pageTitle: "",
    tabId: null,
    capturedAt: null,
    element: null,
    caretReference: null,
  };
}

function makeSelection(text, source, element, mode = "text") {
  const cleaned = cleanText(text);
  if (!cleaned || looksSensitiveText(cleaned) || isSensitiveElement(element)) return null;
  return {
    available: true,
    text: cleaned,
    source: String(source || "page-text").slice(0, 80),
    mode: String(mode || "text").slice(0, 20),
    pageUrl: safePageUrl(),
    pageTitle: String(document.title || "").slice(0, 300),
    tabId: null,
    capturedAt: new Date().toISOString(),
    element: describeElement(element),
    caretReference: null,
  };
}

function makeCaretSelection(reference, element) {
  if (!reference || reference.mode !== "caret" || !reference.caretPath || !reference.caretContainerPath) return null;
  if (isSensitiveElement(element)) return null;
  return {
    available: true,
    text: "",
    source: "contenteditable-caret",
    mode: "caret",
    pageUrl: safePageUrl(),
    pageTitle: String(document.title || "").slice(0, 300),
    tabId: null,
    capturedAt: new Date().toISOString(),
    element: describeElement(element),
    caretReference: {
      mode: "caret",
      baseId: reference.baseId || stableBlockId(element),
      blockId: reference.blockId || "",
      containerPath: reference.caretContainerPath,
      domPath: reference.caretPath,
      textOffset: Number.isInteger(reference.caretOffset) ? reference.caretOffset : 0,
    },
  };
}

function inputSelection(element) {
  if (!element || !["INPUT", "TEXTAREA"].includes(String(element.tagName || "").toUpperCase())) return null;
  const start = Number(element.selectionStart);
  const end = Number(element.selectionEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  const source = String(element.tagName).toLowerCase() === "textarea" ? "textarea" : "input";
  return makeSelection(String(element.value || "").slice(start, end), source, element);
}

function documentSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container?.nodeType === 1 ? container : container?.parentElement;
  if (document.contains && !document.contains(container)) return null;
  const source = element?.closest?.("[contenteditable='true'],[contenteditable='']") ? "contenteditable" : "page-text";
  return makeSelection(selection.toString(), source, element);
}

function currentSelection(target = null) {
  const active = target || document.activeElement;
  const input = inputSelection(active);
  if (input) return input;
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1) return documentSelection();
  const range = selection.getRangeAt(0);
  if (!selection.isCollapsed && !range.collapsed) return documentSelection();
  const root = editableRootForNode(range.startContainer);
  if (!root || !contentNodeContains(root, range.startContainer)) return null;
  const reference = editableBlockReference(root, range, "");
  return makeCaretSelection(reference, root);
}

const existingContentState = globalThis[CONTENT_STATE_KEY];
if (existingContentState?.listener) {
  try {
    chrome.runtime.onMessage.removeListener(existingContentState.listener);
  } catch {
  }
}
if (existingContentState?.eventListeners) {
  for (const item of existingContentState.eventListeners) {
    try {
      document.removeEventListener(item.type, item.listener, item.capture);
    } catch {
    }
  }
}

let selectionState = existingContentState?.selectionState?.available
  ? { ...emptySelection(), ...existingContentState.selectionState }
  : currentSelection() || null;
let editingBlockState = existingContentState?.editingBlockState?.snapshot?.available
  ? existingContentState.editingBlockState
  : null;
let adapterInjectionPromise = null;

function currentEditingBlock() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const anchorRoot = editableRootForNode(selection.anchorNode || container);
  const focusRoot = editableRootForNode(selection.focusNode || container);
  if (anchorRoot !== focusRoot && (anchorRoot || focusRoot)) return { reason: "EDIT_BLOCK_CROSS_BLOCK_SELECTION" };
  const root = anchorRoot || focusRoot || editableBlockForNode(container);
  const collapsed = Boolean(selection.isCollapsed || range.collapsed);
  if (collapsed) {
    if (!root || !contentNodeContains(root, range.startContainer)) return null;
    return { element: root, reference: editableBlockReference(root, range, "") };
  }
  const anchor = editableBlockForNode(selection.anchorNode || container, root);
  const focus = editableBlockForNode(selection.focusNode || container, root);
  const sharedEditableRoot = Boolean(anchorRoot || focusRoot);
  if (!sharedEditableRoot && anchor && focus && anchor !== root && focus !== root && stableBlockId(anchor) !== stableBlockId(focus)) {
    return { reason: "EDIT_BLOCK_CROSS_BLOCK_SELECTION" };
  }
  const element = sharedEditableRoot ? root : anchor && anchor !== root ? anchor : focus && focus !== root ? focus : root;
  if (!element) return null;
  const selectedText = normalizeBlockText(selection.toString?.() || "");
  return { element, reference: editableBlockReference(element, range, selectedText) };
}

function editingBlockSnapshot() {
  const reference = editingBlockState?.reference || (editingBlockState?.elementRef ? { element: editingBlockState.elementRef, mode: "element" } : null);
  const rebound = reference && (!reference.element || !document.contains?.(reference.element)) ? rebindEditableBlock(reference) : reference;
  if (!rebound?.element || !document.contains?.(rebound.element)) {
    return editingBlockState ? { ...editingBlockState.snapshot, available: false, valid: false, stale: true, reason: "EDIT_BLOCK_NOT_FOUND" } : emptyEditingBlock();
  }
  editingBlockState = { ...editingBlockState, elementRef: rebound.element, reference: rebound };
  const current = makeEditingBlock(rebound, rebound);
  if (!current.available) return current;
  const snapshot = editingBlockState.snapshot;
  const stale = current.contentHash !== snapshot.contentHash;
  return {
    ...snapshot,
    pageUrl: current.pageUrl,
    pageTitle: current.pageTitle,
    element: current.element,
    currentText: current.currentText,
    currentHash: current.contentHash,
    valid: !stale,
    stale,
    reason: stale ? "EDIT_BLOCK_CONTENT_CHANGED" : "",
  };
}

function refreshSelection(target = null) {
  const next = currentSelection(target);
  selectionState = next;
  const activeTag = String((target || document.activeElement)?.tagName || "").toUpperCase();
  const block = ["INPUT", "TEXTAREA"].includes(activeTag) ? null : currentEditingBlock();
  if (block?.element) {
    const snapshot = makeEditingBlock(block.reference || block.element, block.reference || {});
    editingBlockState = snapshot.available ? { snapshot, elementRef: block.element, reference: block.reference } : null;
  } else if (block?.reason) {
    editingBlockState = { snapshot: emptyEditingBlock(block.reason), elementRef: null };
  } else {
    editingBlockState = null;
  }
  if (globalThis[CONTENT_STATE_KEY]) globalThis[CONTENT_STATE_KEY].selectionState = selectionState;
  if (globalThis[CONTENT_STATE_KEY]) globalThis[CONTENT_STATE_KEY].editingBlockState = editingBlockState;
}

function scheduleSelectionRefresh(event) {
  const schedule = window.setTimeout || globalThis.setTimeout;
  const refresh = () => {
    const activeBlock = editableBlockForNode(document.activeElement);
    if (!currentSelection() && editingBlockState?.elementRef && event?.type === "selectionchange" && activeBlock === editingBlockState.elementRef) return;
    refreshSelection(event?.target || null);
  };
  if (typeof schedule === "function") schedule(refresh, 0);
  else refresh();
}

function captureInputSelection(event) {
  refreshSelection(event?.target || null);
}

const eventListeners = [
  { type: "mouseup", listener: scheduleSelectionRefresh, capture: true },
  { type: "selectionchange", listener: scheduleSelectionRefresh, capture: true },
  { type: "keyup", listener: scheduleSelectionRefresh, capture: true },
  { type: "select", listener: captureInputSelection, capture: true },
  { type: "input", listener: () => editingBlockSnapshot(), capture: true },
];
for (const item of eventListeners) {
  document.addEventListener?.(item.type, item.listener, item.capture);
}

function injectPageAdapter() {
  const previousAdapterState = window[PAGE_ADAPTER_STATE_KEY];
  if (previousAdapterState && (previousAdapterState.adapterVersion !== ADAPTER_VERSION || previousAdapterState.buildId !== EXTENSION_BUILD_ID)) {
    window.removeEventListener?.("message", previousAdapterState.contextListener);
    window.removeEventListener?.("message", previousAdapterState.actionListener);
    for (const item of previousAdapterState.selectionListeners || []) document.removeEventListener?.(item.type, item.listener, item.capture);
    try {
      delete window[PAGE_ADAPTER_STATE_KEY];
    } catch {
    }
  }
  adapterInjectionPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(INJECTED_SCRIPT_ID);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = INJECTED_SCRIPT_ID;
    script.src = `${chrome.runtime.getURL("src/injected/page_adapter.js")}?v=${encodeURIComponent(ADAPTER_VERSION)}`;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      adapterInjectionPromise = null;
      script.remove();
      reject(new Error("PAGE_ADAPTER_INJECT_FAILED"));
    };
    (document.documentElement || document.head).appendChild(script);
  });

  return adapterInjectionPromise;
}

async function requestPageAdapter(type, responseType, payload = {}, timeoutMs = 8000) {
  await injectPageAdapter();
  const requestId = `tywb-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      adapterInjectionPromise = null;
      window.removeEventListener("message", onMessage);
      resolve({
        ok: false,
        reason: `${type}_TIMEOUT`,
        collectedAt: new Date().toISOString(),
        url: location.href,
      });
    }, timeoutMs);

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== responseType || data.requestId !== requestId) return;
      if (data.payload?.adapterVersion !== ADAPTER_VERSION || data.payload?.buildId !== EXTENSION_BUILD_ID) return;

      window.clearTimeout(timeout);
      adapterInjectionPromise = Promise.resolve();
      window.removeEventListener("message", onMessage);
      resolve(data.payload);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type, requestId, payload: { ...payload, minAdapterVersion: ADAPTER_VERSION, minBuildId: EXTENSION_BUILD_ID } }, "*");
  });
}

function contextWithSelection(payload, sender) {
  const editingBlock = Object.prototype.hasOwnProperty.call(payload || {}, "editingBlock")
    ? { ...(payload.editingBlock || emptyEditingBlock("EDIT_BLOCK_NOT_FOUND")) }
    : editingBlockSnapshot();
  const selection = selectionState?.available
    ? { ...selectionState }
    : editingBlock.blockMode === "caret" && editingBlock.caretReference
      ? {
        available: true,
        text: "",
        source: "contenteditable-caret",
        mode: "caret",
        pageUrl: editingBlock.pageUrl,
        pageTitle: editingBlock.pageTitle,
        tabId: editingBlock.tabId,
        capturedAt: editingBlock.capturedAt,
        element: editingBlock.element,
        caretReference: editingBlock.caretReference,
      }
      : emptySelection();
  if (selection.available && Number.isInteger(sender?.tab?.id)) selection.tabId = sender.tab.id;
  if (editingBlock.available && Number.isInteger(sender?.tab?.id)) editingBlock.tabId = sender.tab.id;
  return {
    ...payload,
    build: {
      extensionVersion: EXTENSION_VERSION,
      extensionBuildId: EXTENSION_BUILD_ID,
      contentScriptAdapterVersion: ADAPTER_VERSION,
      pageAdapterVersion: payload?.adapterVersion || null,
      pageAdapterBuildId: payload?.buildId || null,
      protocolMatch: payload?.adapterVersion === ADAPTER_VERSION && payload?.buildId === EXTENSION_BUILD_ID,
    },
    selection,
    editingBlock,
  };
}

const contentMessageListener = (message, sender, sendResponse) => {
  if (message?.type !== EXT_REQUEST_TYPE && message?.type !== EXT_ACTION_REQUEST_TYPE) return false;

  const actionTimeout = ["upload_audit_attachment", "batch_upload_audit_attachments", "set_audit_check_result", "batch_set_audit_check_results"].includes(message.payload?.action)
    ? 120000
    : 45000;
  const actionPayload = message.type === EXT_ACTION_REQUEST_TYPE
    ? { ...(message.payload || {}), ...(Number.isInteger(sender?.tab?.id) ? { tabId: sender.tab.id } : {}) }
    : {};
  const adapterRequest = message.type === EXT_ACTION_REQUEST_TYPE
    ? requestPageAdapter(PAGE_ACTION_REQUEST_TYPE, PAGE_ACTION_RESPONSE_TYPE, actionPayload, actionTimeout)
    : requestPageAdapter(PAGE_REQUEST_TYPE, PAGE_RESPONSE_TYPE);

  adapterRequest
    .then((payload) => sendResponse(message.type === EXT_REQUEST_TYPE ? contextWithSelection(payload, sender) : payload))
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: message.type === EXT_ACTION_REQUEST_TYPE ? "CONTENT_ACTION_ERROR" : "CONTENT_CONTEXT_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
        ...(message.type === EXT_REQUEST_TYPE ? { selection: emptySelection() } : {}),
        ...(message.type === EXT_REQUEST_TYPE ? { editingBlock: emptyEditingBlock("CONTENT_CONTEXT_ERROR") } : {}),
      });
    });

  return true;
};

chrome.runtime.onMessage.addListener(contentMessageListener);
globalThis[CONTENT_STATE_KEY] = {
  adapterVersion: ADAPTER_VERSION,
  listener: contentMessageListener,
  eventListeners,
  selectionState,
  editingBlockState,
};
})();
