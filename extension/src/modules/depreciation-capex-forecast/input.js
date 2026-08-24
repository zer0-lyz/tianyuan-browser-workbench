import {
  ACTIONS,
  escapeHtml,
  nativeRequest,
  parsePastedTable,
  requiredHeadersFor,
  rowsAsRecords,
  renderTable,
  setMessage,
  templateUrl,
} from "./page-common.js";

const kind = new URLSearchParams(window.location.search).get("kind") === "added" ? "added" : "stock";
const requiredHeaders = requiredHeadersFor(kind);
const title = kind === "added" ? "新增资产" : "存量资产";
const elements = {
  pageTitle: document.getElementById("pageTitle"),
  kindTitle: document.getElementById("kindTitle"),
  requiredHeaders: document.getElementById("requiredHeaders"),
  inputText: document.getElementById("inputText"),
  inputMessage: document.getElementById("inputMessage"),
  inputErrors: document.getElementById("inputErrors"),
  preview: document.getElementById("preview"),
  rowCount: document.getElementById("rowCount"),
  inputStatus: document.getElementById("inputStatus"),
  saveInput: document.getElementById("saveInput"),
  downloadTemplate: document.getElementById("downloadTemplate"),
  pasteFromClipboard: document.getElementById("pasteFromClipboard"),
  parseInput: document.getElementById("parseInput"),
  importWorkbook: document.getElementById("importWorkbook"),
  clearInput: document.getElementById("clearInput"),
};

let parsed = { headers: [], rows: [], errors: [] };

function renderErrors(errors) {
  elements.inputErrors.replaceChildren();
  elements.inputErrors.hidden = !errors.length;
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error;
    elements.inputErrors.appendChild(item);
  }
}

function parse() {
  parsed = parsePastedTable(elements.inputText.value, requiredHeaders);
  renderErrors(parsed.errors);
  elements.rowCount.textContent = `${parsed.rows.length} 行`;
  renderTable(elements.preview, { headers: parsed.headers, rows: parsed.rows }, { maxRows: 30, emptyText: "没有可预览的数据" });
  elements.saveInput.disabled = Boolean(parsed.errors.length) || !parsed.headers.length;
  if (parsed.errors.length) {
    setMessage(elements.inputMessage, `校验失败：${parsed.errors.length} 个问题`, "error");
    elements.inputStatus.textContent = "校验失败";
  } else {
    setMessage(elements.inputMessage, `解析成功：${parsed.rows.length} 行，${parsed.headers.length} 列`, "ok");
    elements.inputStatus.textContent = "已解析";
  }
}

async function save() {
  if (parsed.errors.length || !parsed.headers.length) return;
  elements.saveInput.disabled = true;
  try {
    const result = await nativeRequest({
      action: kind === "added" ? "write_added" : ACTIONS.writeAssets,
      kind,
      assetType: kind,
      headers: parsed.headers,
      rows: parsed.rows,
      records: rowsAsRecords(parsed.headers, parsed.rows),
      values: rowsAsRecords(parsed.headers, parsed.rows),
    }, 120_000);
    setMessage(elements.inputMessage, result.message || `${title}已保存到当前工作簿`, "ok");
    elements.inputStatus.textContent = "已保存";
  } catch (error) {
    setMessage(elements.inputMessage, error.message, "error");
    elements.inputStatus.textContent = "保存失败";
  } finally {
    elements.saveInput.disabled = false;
  }
}

async function importWorkbook() {
  elements.importWorkbook.disabled = true;
  try {
    const selected = await nativeRequest({ action: ACTIONS.selectWorkbook }, 130_000);
    const selectedPath = selected.path || selected.sourcePath;
    if (selected.cancelled || selected.canceled || !selectedPath) {
      setMessage(elements.inputMessage, "已取消导入", "");
      return;
    }
    const result = await nativeRequest({ action: ACTIONS.importWorkbook, sourcePath: selectedPath, path: selectedPath }, 60_000);
    setMessage(elements.inputMessage, result.message || "已导入为当前工作簿。若需修改，请粘贴第 3 行表头数据后保存。", "ok");
    elements.inputStatus.textContent = "工作簿已导入";
  } catch (error) {
    setMessage(elements.inputMessage, error.message, "error");
    elements.inputStatus.textContent = "导入失败";
  } finally {
    elements.importWorkbook.disabled = false;
  }
}

elements.pageTitle.textContent = `${title}输入`;
elements.kindTitle.textContent = title;
elements.downloadTemplate.href = templateUrl();
elements.requiredHeaders.innerHTML = requiredHeaders.map((header) => `<li>${escapeHtml(header)}</li>`).join("");
elements.pasteFromClipboard.addEventListener("click", async () => {
  try {
    elements.inputText.value = await navigator.clipboard.readText();
    parse();
  } catch (error) {
    setMessage(elements.inputMessage, `读取剪贴板失败，请直接粘贴：${error.message || error}`, "error");
  }
});
elements.parseInput.addEventListener("click", parse);
elements.saveInput.addEventListener("click", save);
elements.importWorkbook.addEventListener("click", importWorkbook);
elements.clearInput.addEventListener("click", () => {
  parsed = { headers: [], rows: [], errors: [] };
  elements.inputText.value = "";
  elements.preview.innerHTML = "<div class=\"empty-state\">尚未解析</div>";
  elements.inputErrors.replaceChildren();
  elements.inputErrors.hidden = true;
  elements.rowCount.textContent = "0 行";
  elements.inputStatus.textContent = "未读取";
  elements.saveInput.disabled = true;
  setMessage(elements.inputMessage, "已清空", "");
});
