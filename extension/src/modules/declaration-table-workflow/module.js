import { declarationTableWorkflowTemplate } from "./template.js";

const DEFAULT_CONFIG = Object.freeze({
  mode: "after_export",
  exportDirectory: "",
  outputMode: "copy_in_source",
  outputDirectory: "",
});
const MODES = new Set(["after_export", "manual_files"]);
const OUTPUT_MODES = new Set(["overwrite", "copy_in_source", "new_directory"]);

export function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_CONFIG,
    mode: MODES.has(source.mode) ? source.mode : DEFAULT_CONFIG.mode,
    exportDirectory: String(source.exportDirectory || "").trim(),
    outputMode: OUTPUT_MODES.has(source.outputMode) ? source.outputMode : DEFAULT_CONFIG.outputMode,
    outputDirectory: String(source.outputDirectory || "").trim(),
  };
}

export function modeLabel(mode) {
  return mode === "manual_files" ? "选择文件/文件夹手动整理" : "导出后自动整理";
}

function elementMap(documentRef) {
  const ids = [
    "page-export-declare",
    "declarationTableWorkflowBack",
    "declareScopeMount",
    "declareSupportMount",
    "declarationTableWorkflowModeAfterExport",
    "declarationTableWorkflowModeManual",
    "declarationTableWorkflowManualPanel",
    "declarationTableWorkflowExportDirectoryPanel",
    "declarationTableWorkflowExportDirectory",
    "chooseDeclarationTableWorkflowExportDirectory",
    "declarationTableWorkflowInputSummary",
    "chooseDeclarationTableWorkflowFiles",
    "chooseDeclarationTableWorkflowFolder",
    "declarationTableWorkflowOutputMode",
    "declarationTableWorkflowOutputDirectoryWrap",
    "declarationTableWorkflowOutputDirectory",
    "chooseDeclarationTableWorkflowOutput",
    "runDeclarationTableWorkflow",
    "declarationTableWorkflowProgressText",
    "declarationTableWorkflowProgressPercent",
    "declarationTableWorkflowProgressBar",
    "declarationTableWorkflowMessage",
    "declarationTableWorkflowResultList",
    "saveDeclarationTableWorkflow",
    "resetDeclarationTableWorkflow",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function setMessage(element, text, kind = "") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

function setProgress(elements, payload = {}) {
  const percent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
  elements.declarationTableWorkflowProgressBar.value = percent;
  elements.declarationTableWorkflowProgressPercent.textContent = `${percent}%`;
  elements.declarationTableWorkflowProgressText.textContent = payload.message
    || (percent === 100 ? "处理完成" : "等待执行");
}

function renderResults(element, results = []) {
  element.replaceChildren();
  for (const item of Array.isArray(results) ? results : []) {
    const row = document.createElement("li");
    row.dataset.kind = item.ok ? "ok" : "error";
    row.textContent = item.ok
      ? `${item.sourcePath || "文件"} → ${item.outputPath || "已完成"}`
      : `${item.sourcePath || "文件"}：${item.reason || "处理失败"}`;
    element.appendChild(row);
  }
}

export const declarationTableWorkflowModule = {
  manifest: {
    id: "declaration-table-workflow",
    type: "feature",
    stage: "stable",
    route: "export-declare",
    displayName: "申报表导出与整理",
    messageNamespace: "declaration-table-workflow",
    entryElementId: "openExportDeclare",
    pageElementId: "page-export-declare",
    mounts: { scope: "declareScopeMount", support: "declareSupportMount" },
    storageVersion: 1,
    usesLegacyScope: true,
    scope: { companies: true, subjects: false },
  },

  create() {
    let context;
    let elements;
    let config = normalizeConfig();
    let inputPaths = [];
    let running = false;

    function readForm() {
      return normalizeConfig({
        mode: elements.declarationTableWorkflowModeManual.checked ? "manual_files" : "after_export",
        exportDirectory: elements.declarationTableWorkflowExportDirectory.value,
        outputMode: elements.declarationTableWorkflowOutputMode.value,
        outputDirectory: elements.declarationTableWorkflowOutputDirectory.value,
      });
    }

    function render() {
      const manual = config.mode === "manual_files";
      elements.declarationTableWorkflowModeAfterExport.checked = !manual;
      elements.declarationTableWorkflowModeManual.checked = manual;
      elements.declarationTableWorkflowExportDirectory.value = config.exportDirectory;
      elements.declarationTableWorkflowOutputMode.value = config.outputMode;
      elements.declarationTableWorkflowOutputDirectory.value = config.outputDirectory;
      elements.declarationTableWorkflowManualPanel.classList.toggle("hidden", !manual);
      elements.declarationTableWorkflowExportDirectoryPanel.classList.toggle("hidden", manual);
      elements.declarationTableWorkflowOutputDirectoryWrap.classList.toggle(
        "hidden",
        !manual || config.outputMode !== "new_directory",
      );
      elements.declarationTableWorkflowInputSummary.textContent = inputPaths.length
        ? `${inputPaths.length} 个申报表已选择`
        : "尚未选择文件或文件夹";
      setMessage(
        elements.declarationTableWorkflowMessage,
        `${modeLabel(config.mode)} · 导出后自动设置申报表打印格式`,
      );
    }

    async function save() {
      config = readForm();
      if (config.mode === "manual_files" && config.outputMode === "new_directory" && !config.outputDirectory) {
        setMessage(elements.declarationTableWorkflowMessage, "手动模式请先选择新的输出文件夹。", "error");
        return;
      }
      await context.storage.save(config);
      render();
      context.setStatus("申报表导出整理设置已保存", "ok");
    }

    async function reset() {
      config = normalizeConfig();
      inputPaths = [];
      await context.storage.save(config);
      render();
      setMessage(elements.declarationTableWorkflowMessage, "已恢复推荐设置", "ok");
    }

    async function chooseInputs(kind) {
      try {
        const action = kind === "files" ? "select_print_workbook_files" : "select_print_workbook_directory";
        const result = await context.sendNativeMessage({ action }, 130000);
        if (result?.cancelled || result?.canceled) return;
        if (!result?.ok) throw new Error(result?.reason || "WORKBOOK_SELECTION_FAILED");
        inputPaths = Array.isArray(result.paths) ? result.paths : [];
        render();
        context.setStatus(`已选择 ${inputPaths.length} 个申报表`, "ok");
      } catch (error) {
        setMessage(elements.declarationTableWorkflowMessage, `选择文件失败：${error?.message || String(error)}`, "error");
        context.setStatus("申报表输入选择失败", "error");
      }
    }

    async function chooseDirectory(target) {
      try {
        const result = await context.sendNativeMessage({ action: "select_print_output_directory", directoryName: "申报表导出与整理" }, 130000);
        if (result?.cancelled || result?.canceled) return;
        const selected = result?.outputDirectory || result?.path || result?.paths?.[0] || "";
        if (!result?.ok || !selected) throw new Error(result?.reason || "OUTPUT_DIRECTORY_SELECTION_FAILED");
        target.value = selected;
        if (target === elements.declarationTableWorkflowExportDirectory) config.exportDirectory = target.value;
        else config.outputDirectory = target.value;
        setMessage(elements.declarationTableWorkflowMessage, `已选择上级目录，并创建专用子文件夹：${result.directoryName || "申报表导出与整理"}。保存设置后生效`, "ok");
      } catch (error) {
        setMessage(elements.declarationTableWorkflowMessage, `选择文件夹失败：${error?.message || String(error)}`, "error");
      }
    }

    async function run() {
      if (running) return;
      running = true;
      elements.runDeclarationTableWorkflow.disabled = true;
      context.setBusy(true);
      setProgress(elements, { percent: 1, message: "正在准备申报表导出与整理" });
      setMessage(elements.declarationTableWorkflowMessage, "正在检查本机运行组件，请稍候。", "");
      context.setStatus("正在检查申报表导出与整理环境…", "idle");
      try {
        config = readForm();
        if (config.mode === "after_export") {
          if (!config.exportDirectory) throw new Error("请先选择导出存放路径。");
          if (!/^\d+$/.test(String(context.getCurrentProjectId() || ""))) throw new Error("当前页面未读取到项目 ID。");
        } else {
          if (!inputPaths.length) throw new Error("请先选择文件或文件夹。");
          if (config.outputMode === "new_directory" && !config.outputDirectory) throw new Error("请先选择新的输出文件夹。");
        }
        const health = await context.checkLocalConnections();
        if (health?.ok === false) throw new Error(health.reason || "本机运行组件未连接。");
        const mcpReady = health?.mcp?.connected === true;
        const cliReady = health?.cli?.ok === true && health?.cli?.authenticated === true;
        if (config.mode === "after_export" && !mcpReady && !cliReady) {
          throw new Error("MCP 和天源 CLI 均未完成有效授权，请先在连接配置中完成其中一项授权。");
        }
        const request = {
          action: "run_declaration_table_workflow",
          mode: config.mode,
          outputMode: config.mode === "after_export" ? "overwrite" : config.outputMode,
          outputDir: config.outputDirectory,
          inputPaths: [...inputPaths],
          preferCli: !mcpReady,
          mcpToken: mcpReady ? context.getRuntimeMcpToken?.() : undefined,
        };
        if (config.mode === "after_export") {
          request.projectId = context.getCurrentProjectId();
          request.companyIds = context.getExportCompanyIds();
          request.outDir = config.exportDirectory;
        }
        setMessage(elements.declarationTableWorkflowMessage, "正在逐步处理并校验，请不要关闭工作台。", "");
        context.setStatus("正在执行申报表导出与整理…", "idle");
        const result = await context.streamNativeMessage(request, (progress) => {
          setProgress(elements, progress);
          if (progress.message) context.setStatus(progress.message, "idle");
          if (progress.results) renderResults(elements.declarationTableWorkflowResultList, progress.results);
        });
        setProgress(elements, result);
        renderResults(elements.declarationTableWorkflowResultList, result.results);
        if (!result?.ok) throw new Error(result?.reason || "DECLARATION_TABLE_WORKFLOW_FAILED");
        setMessage(elements.declarationTableWorkflowMessage, `全部完成：${result.successCount || 0} 个文件已导出并整理。`, "ok");
        context.setStatus("申报表导出与整理完成，文件校验通过", "ok");
      } catch (error) {
        setMessage(elements.declarationTableWorkflowMessage, `处理失败：${error?.message || String(error)}`, "error");
        context.setStatus(`申报表导出与整理失败：${error?.message || String(error)}`, "error");
      } finally {
        running = false;
        context.setBusy(false);
        elements.runDeclarationTableWorkflow.disabled = false;
      }
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const pageRoot = context.document.getElementById(context.manifest.pageElementId);
        if (!pageRoot) throw new Error("DECLARATION_TABLE_WORKFLOW_PAGE_MISSING");
        pageRoot.innerHTML = declarationTableWorkflowTemplate;
        pageRoot.dataset.moduleId = context.manifest.id;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/declaration-table-workflow/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        config = normalizeConfig(await context.storage.load({}));
        render();
        context.scope.on(elements.declarationTableWorkflowBack, "click", () => context.navigate("home"));
        context.scope.on(elements.declarationTableWorkflowModeAfterExport, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.declarationTableWorkflowModeManual, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.declarationTableWorkflowOutputMode, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.chooseDeclarationTableWorkflowFiles, "click", () => chooseInputs("files"));
        context.scope.on(elements.chooseDeclarationTableWorkflowFolder, "click", () => chooseInputs("folder"));
        context.scope.on(elements.chooseDeclarationTableWorkflowExportDirectory, "click", () => chooseDirectory(elements.declarationTableWorkflowExportDirectory));
        context.scope.on(elements.chooseDeclarationTableWorkflowOutput, "click", () => chooseDirectory(elements.declarationTableWorkflowOutputDirectory));
        context.scope.on(elements.runDeclarationTableWorkflow, "click", run);
        context.scope.on(elements.saveDeclarationTableWorkflow, "click", save);
        context.scope.on(elements.resetDeclarationTableWorkflow, "click", reset);
      },
      activate() { render(); },
      deactivate() {},
      dispose() {},
    };
  },
};

export { DEFAULT_CONFIG };
