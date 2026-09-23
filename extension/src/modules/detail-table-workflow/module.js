import { detailTableWorkflowTemplate } from "./template.js";

export const DEFAULT_CONFIG = Object.freeze({
  mode: "after_export",
  restoreFormulas: true,
  applyFormat: true,
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
    restoreFormulas: source.restoreFormulas !== false,
    applyFormat: source.applyFormat !== false,
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
    "page-export-detail",
    "backFromExportDetail",
    "detailScopeMount",
    "detailSupportMount",
    "detailTableWorkflowModeAfterExport",
    "detailTableWorkflowModeManual",
    "detailTableWorkflowManualPanel",
    "detailTableWorkflowRestoreFormulas",
    "detailTableWorkflowApplyFormat",
    "detailTableWorkflowExportDirectoryPanel",
    "detailTableWorkflowExportDirectory",
    "chooseDetailTableWorkflowExportDirectory",
    "detailTableWorkflowInputSummary",
    "chooseDetailTableWorkflowFiles",
    "chooseDetailTableWorkflowFolder",
    "detailTableWorkflowOutputMode",
    "detailTableWorkflowOutputDirectoryWrap",
    "detailTableWorkflowOutputDirectory",
    "chooseDetailTableWorkflowOutput",
    "runExportDetail",
    "detailTableWorkflowProgressText",
    "detailTableWorkflowProgressPercent",
    "detailTableWorkflowProgressBar",
    "detailTableWorkflowMessage",
    "detailTableWorkflowResultList",
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
  elements.detailTableWorkflowProgressBar.value = percent;
  elements.detailTableWorkflowProgressPercent.textContent = `${percent}%`;
  elements.detailTableWorkflowProgressText.textContent = payload.message
    || (percent === 100 ? "处理完成" : "等待执行");
}

function renderResults(element, results = []) {
  if (!element) return;
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

export const detailTableWorkflowModule = {
  manifest: {
    id: "detail-table-workflow",
    type: "feature",
    stage: "stable",
    route: "export-detail",
    displayName: "明细表导出与整理",
    messageNamespace: "detail-table-workflow",
    entryElementId: "openExportDetail",
    pageElementId: "page-export-detail",
    mounts: { scope: "detailScopeMount", support: "detailSupportMount" },
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
        mode: elements.detailTableWorkflowModeManual.checked ? "manual_files" : "after_export",
        restoreFormulas: elements.detailTableWorkflowRestoreFormulas.checked,
        applyFormat: elements.detailTableWorkflowApplyFormat.checked,
        exportDirectory: elements.detailTableWorkflowExportDirectory.value,
        outputMode: elements.detailTableWorkflowOutputMode.value,
        outputDirectory: elements.detailTableWorkflowOutputDirectory.value,
      });
    }

    function render() {
      const manual = config.mode === "manual_files";
      elements.detailTableWorkflowModeAfterExport.checked = !manual;
      elements.detailTableWorkflowModeManual.checked = manual;
      elements.detailTableWorkflowRestoreFormulas.checked = config.restoreFormulas;
      elements.detailTableWorkflowApplyFormat.checked = config.applyFormat;
      elements.detailTableWorkflowExportDirectory.value = config.exportDirectory;
      elements.detailTableWorkflowOutputMode.value = config.outputMode;
      elements.detailTableWorkflowOutputDirectory.value = config.outputDirectory;
      elements.detailTableWorkflowManualPanel.classList.toggle("hidden", !manual);
      elements.detailTableWorkflowExportDirectoryPanel.classList.toggle("hidden", manual);
      elements.detailTableWorkflowOutputDirectoryWrap.classList.toggle(
        "hidden",
        !manual || config.outputMode !== "new_directory",
      );
      elements.detailTableWorkflowInputSummary.textContent = inputPaths.length
        ? `${inputPaths.length} 个工作簿已选择`
        : "尚未选择文件或文件夹";
      setMessage(
        elements.detailTableWorkflowMessage,
        `${modeLabel(config.mode)} · ${[
          config.restoreFormulas ? "恢复公式" : "不恢复公式",
          config.applyFormat ? "设置格式" : "不设置格式",
        ].join(" + ")}`,
      );
    }

    function publishConfig() {
      context.eventBus.publish("detail-table-workflow.configChanged", { ...config });
    }

    async function save() {
      config = readForm();
      if (!config.restoreFormulas && !config.applyFormat) {
        setMessage(elements.detailTableWorkflowMessage, "至少需要启用“恢复公式”或“设置格式”中的一项。", "error");
        return;
      }
      if (config.mode === "manual_files" && config.outputMode === "new_directory" && !config.outputDirectory) {
        setMessage(elements.detailTableWorkflowMessage, "手动模式请先选择新的输出文件夹。", "error");
        return;
      }
      await context.storage.save(config);
      publishConfig();
      render();
      context.setStatus("明细表导出整理设置已保存", "ok");
    }

    async function reset() {
      config = normalizeConfig();
      await context.storage.save(config);
      publishConfig();
      render();
      setMessage(elements.detailTableWorkflowMessage, "已恢复推荐设置", "ok");
    }

    async function chooseInputs(kind) {
      try {
        const action = kind === "files" ? "select_print_workbook_files" : "select_print_workbook_directory";
        const result = await context.sendNativeMessage({ action }, 130000);
        if (result?.cancelled || result?.canceled) return;
        if (!result?.ok) throw new Error(result?.reason || "WORKBOOK_SELECTION_FAILED");
        inputPaths = Array.isArray(result.paths) ? result.paths : [];
        render();
        context.setStatus(`已选择 ${inputPaths.length} 个工作簿`, "ok");
      } catch (error) {
        setMessage(elements.detailTableWorkflowMessage, `选择文件失败：${error?.message || String(error)}`, "error");
        context.setStatus("明细表输入选择失败", "error");
      }
    }

    async function chooseDirectory(target) {
      try {
        const result = await context.sendNativeMessage({ action: "select_print_output_directory", directoryName: "明细表导出与整理" }, 130000);
        if (result?.cancelled || result?.canceled) return;
        const selected = result?.outputDirectory || result?.path || result?.paths?.[0] || "";
        if (!result?.ok || !selected) throw new Error(result?.reason || "OUTPUT_DIRECTORY_SELECTION_FAILED");
        target.value = selected;
        if (target === elements.detailTableWorkflowExportDirectory) config.exportDirectory = target.value;
        else config.outputDirectory = target.value;
        setMessage(elements.detailTableWorkflowMessage, `已选择上级目录，并创建专用子文件夹：${result.directoryName || "明细表导出与整理"}。保存设置后生效`, "ok");
      } catch (error) {
        setMessage(elements.detailTableWorkflowMessage, `选择文件夹失败：${error?.message || String(error)}`, "error");
      }
    }

    async function run() {
      if (running) return;
      try {
        config = readForm();
        if (!config.restoreFormulas && !config.applyFormat) throw new Error("至少需要启用一项整理功能。");
        if (config.mode === "after_export") {
          if (!config.exportDirectory) throw new Error("请先选择导出存放路径。");
          if (!/^\d+$/.test(String(context.getCurrentProjectId() || ""))) throw new Error("当前页面未读取到项目 ID。");
        } else {
          if (!inputPaths.length) throw new Error("请先选择文件或文件夹。");
          if (config.outputMode === "new_directory" && !config.outputDirectory) throw new Error("请先选择新的输出文件夹。");
        }
        const health = await context.checkConnections({ probe: true });
        if (health?.ok === false) throw new Error(health.reason || "本机运行组件未连接。");
        const mcpReady = health?.mcp?.connected === true;
        const cliReady = health?.cli?.ok === true && health?.cli?.authenticated === true;
        if (config.mode === "after_export" && !mcpReady && !cliReady) {
          throw new Error("MCP 和天源 CLI 均未完成有效授权，请先在连接配置中完成其中一项授权。");
        }
        const request = {
          action: "run_detail_table_workflow",
          mode: config.mode,
          restoreFormulas: config.restoreFormulas,
          applyFormat: config.applyFormat,
          preferCli: !mcpReady,
          mcpToken: mcpReady ? context.getRuntimeMcpToken?.() : undefined,
          outputMode: config.mode === "after_export" ? "overwrite" : config.outputMode,
          outputDir: config.mode === "after_export" ? "" : config.outputDirectory,
        };
        if (config.mode === "after_export") {
          request.projectId = context.getCurrentProjectId();
          request.companyIds = context.getExportCompanyIds();
          request.outDir = config.exportDirectory;
        } else {
          request.inputPaths = [...inputPaths];
        }
        running = true;
        elements.runExportDetail.disabled = true;
        context.setBusy(true);
        setProgress(elements, { percent: 1, message: "正在准备统一流程" });
        setMessage(elements.detailTableWorkflowMessage, "正在逐步处理并校验，请不要关闭工作台。", "");
        context.setStatus("正在执行明细表导出与整理…", "idle");
        const result = await context.streamNativeMessage(request, (progress) => {
          setProgress(elements, progress);
          if (progress.message) context.setStatus(progress.message, "idle");
          if (progress.results) renderResults(elements.detailTableWorkflowResultList, progress.results);
        });
        setProgress(elements, result);
        renderResults(elements.detailTableWorkflowResultList, result.results);
        if (!result?.ok) throw new Error(result?.reason || "DETAIL_TABLE_WORKFLOW_FAILED");
        setMessage(elements.detailTableWorkflowMessage, `全部完成：${result.successCount || 0} 个文件已导出并整理。`, "ok");
        context.setStatus("明细表导出与整理完成，文件校验通过", "ok");
      } catch (error) {
        setMessage(elements.detailTableWorkflowMessage, `处理失败：${error?.message || String(error)}`, "error");
        context.setStatus(`明细表导出与整理失败：${error?.message || String(error)}`, "error");
      } finally {
        running = false;
        context.setBusy(false);
        elements.runExportDetail.disabled = false;
      }
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const pageRoot = context.document.getElementById(context.manifest.pageElementId);
        if (!pageRoot) throw new Error("DETAIL_TABLE_WORKFLOW_PAGE_MISSING");
        pageRoot.innerHTML = detailTableWorkflowTemplate;
        pageRoot.dataset.moduleId = context.manifest.id;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/detail-table-workflow/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        config = normalizeConfig(await context.storage.load({}));
        render();
        publishConfig();
        context.scope.on(elements.backFromExportDetail, "click", () => context.navigate("home"));
        context.scope.on(elements.detailTableWorkflowModeAfterExport, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.detailTableWorkflowModeManual, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.detailTableWorkflowOutputMode, "change", () => { config = readForm(); render(); });
        context.scope.on(elements.chooseDetailTableWorkflowFiles, "click", () => chooseInputs("files"));
        context.scope.on(elements.chooseDetailTableWorkflowFolder, "click", () => chooseInputs("folder"));
        context.scope.on(elements.chooseDetailTableWorkflowExportDirectory, "click", () => chooseDirectory(elements.detailTableWorkflowExportDirectory));
        context.scope.on(elements.chooseDetailTableWorkflowOutput, "click", () => chooseDirectory(elements.detailTableWorkflowOutputDirectory));
        context.scope.on(elements.runExportDetail, "click", run);
        context.scope.on(elements.saveDetailTableWorkflow, "click", save);
        context.scope.on(elements.resetDetailTableWorkflow, "click", reset);
      },
      activate() { render(); },
      deactivate() {},
      dispose() {},
    };
  },
};
