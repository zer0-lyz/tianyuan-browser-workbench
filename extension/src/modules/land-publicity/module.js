import { landPublicityTemplate } from "./template.js";

const FIXED_TRADE_FORM = "国有土地";
const FIXED_TRADE_METHODS = ["挂牌出让", "拍卖出让"];
const FIXED_TRADE_STAGES = ["结果公示"];

const DEFAULT_CONFIG = {
  tradeForm: FIXED_TRADE_FORM,
  tradeMethods: [...FIXED_TRADE_METHODS],
  tradeStages: [...FIXED_TRADE_STAGES],
  district: "",
  provinceWide: false,
  location: "",
  landUses: [],
  startDate: "",
  endDate: "",
  districtExact: false,
  generateMap: true,
  maxPages: "50",
  outputDirectory: "",
};

function elementMap(documentRef) {
  const ids = [
    "openLandPublicity", "backFromLandPublicity", "landPublicityDistrict", "landPublicityProvinceWide", "landPublicityLocation",
    "landPublicityDistrictExact", "landPublicityStartDate", "landPublicityEndDate",
    "landPublicityGenerateMap", "landPublicityOutputDirectory", "chooseLandPublicityOutput", "clearLandPublicityFilters", "runLandPublicity",
    "openLandPublicityHtml", "openLandPublicityExcel", "openLandPublicityMap", "landPublicityProgressText",
    "landPublicityProgressPercent", "landPublicityProgressBar", "landPublicityFetchedCount", "landPublicityFilteredCount",
    "landPublicityWrittenCount", "landPublicityResultMessage",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function checkedValues(root, name) {
  return [...root.querySelectorAll(`input[name="${name}"]:checked`)]
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

function setCheckedValues(root, name, values) {
  const selected = new Set(Array.isArray(values) ? values : []);
  root.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function setMessage(element, text, kind = "") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_CONFIG,
    tradeForm: FIXED_TRADE_FORM,
    tradeMethods: [...FIXED_TRADE_METHODS],
    tradeStages: [...FIXED_TRADE_STAGES],
    district: String(source.district || "").trim(),
    provinceWide: source.provinceWide === true,
    location: String(source.location || "").trim(),
    landUses: Array.isArray(source.landUses) ? source.landUses : [],
    startDate: String(source.startDate || "").trim(),
    endDate: String(source.endDate || "").trim(),
    districtExact: source.districtExact === true,
    generateMap: source.generateMap !== false,
    maxPages: "50",
    outputDirectory: String(source.outputDirectory || "").trim(),
  };
}

function filterConditionSummary(request) {
  const conditions = [];
  if (request.provinceWide) {
    conditions.push("行政区=全省/不限制行政区");
  } else if (request.district) {
    conditions.push(`行政区=${request.district}${request.districtExact ? "（districtName精确匹配）" : ""}`);
  }
  if (request.location) conditions.push(`位置关键词=${request.location}`);
  conditions.push(`交易形式=${FIXED_TRADE_FORM}`);
  conditions.push(`交易方式=${FIXED_TRADE_METHODS.join("、")}`);
  conditions.push(`交易阶段=${FIXED_TRADE_STAGES.join("、")}`);
  if (request.landUses?.length) conditions.push(`土地用途=${request.landUses.join("、")}`);
  if (request.startDate || request.endDate) conditions.push(`成交公示日期=${request.startDate || "不限"}至${request.endDate || "不限"}`);
  conditions.push("抓取页数上限=50");
  return conditions.join("；") || "未设置额外筛选条件";
}

export const landPublicityModule = {
  manifest: {
    id: "land-publicity",
    type: "feature",
    stage: "stable",
    route: "land-publicity",
    displayName: "浙江土地成交公示",
    messageNamespace: "land-publicity",
    entryElementId: "openLandPublicity",
    pageElementId: "page-land-publicity",
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let root;
    let elements;
    let config = { ...DEFAULT_CONFIG };
    let lastResult = null;
    let running = false;

    function readConfig() {
      const next = {
        ...DEFAULT_CONFIG,
        tradeForm: FIXED_TRADE_FORM,
        tradeMethods: [...FIXED_TRADE_METHODS],
        tradeStages: [...FIXED_TRADE_STAGES],
        district: elements.landPublicityDistrict.value.trim(),
        provinceWide: elements.landPublicityProvinceWide.checked,
        location: elements.landPublicityLocation.value.trim(),
        landUses: checkedValues(root, "landUse"),
        startDate: elements.landPublicityStartDate.value,
        endDate: elements.landPublicityEndDate.value,
        districtExact: elements.landPublicityDistrictExact.checked,
        generateMap: elements.landPublicityGenerateMap.checked,
        maxPages: "50",
        outputDirectory: elements.landPublicityOutputDirectory.value.trim(),
      };
      return next;
    }

    function renderConfig() {
      setCheckedValues(root, "landUse", config.landUses);
      elements.landPublicityDistrict.value = config.district || "";
      elements.landPublicityProvinceWide.checked = Boolean(config.provinceWide);
      elements.landPublicityLocation.value = config.location || "";
      elements.landPublicityDistrictExact.checked = Boolean(config.districtExact);
      elements.landPublicityStartDate.value = config.startDate || "";
      elements.landPublicityEndDate.value = config.endDate || "";
      elements.landPublicityGenerateMap.checked = Boolean(config.generateMap);
      elements.landPublicityOutputDirectory.value = config.outputDirectory || "";
      elements.landPublicityDistrict.disabled = Boolean(config.provinceWide);
      elements.landPublicityDistrictExact.disabled = Boolean(config.provinceWide);
    }

    function validateLocal(next) {
      if (!next.outputDirectory) throw new Error("请先选择本机输出目录");
      if (!next.provinceWide && !next.district && !next.location) throw new Error("请至少选择行政区、填写位置关键词，或勾选全省/不限制行政区");
      if (!next.startDate || !next.endDate) throw new Error("请填写成交公示起始日期和结束日期");
      if (next.startDate > next.endDate) throw new Error("成交公示起始日期不能晚于结束日期");
      return {
        ...next,
        tradeForm: FIXED_TRADE_FORM,
        tradeMethods: [...FIXED_TRADE_METHODS],
        tradeStages: [...FIXED_TRADE_STAGES],
        maxPages: 50,
      };
    }

    function renderProgress(payload = {}) {
      const percent = Math.max(0, Math.min(100, Number(payload.percent || 0)));
      elements.landPublicityProgressBar.style.width = `${percent}%`;
      elements.landPublicityProgressPercent.textContent = `${percent}%`;
      if (payload.message) elements.landPublicityProgressText.textContent = payload.message;
      if (payload.fetched !== undefined) elements.landPublicityFetchedCount.textContent = String(payload.fetched);
      if (payload.filtered !== undefined) elements.landPublicityFilteredCount.textContent = String(payload.filtered);
      if (payload.written !== undefined) elements.landPublicityWrittenCount.textContent = String(payload.written);
    }

    function setResultButtons(result) {
      lastResult = result || null;
      elements.openLandPublicityHtml.disabled = !result?.htmlPath;
      elements.openLandPublicityExcel.disabled = !result?.excelPath;
      elements.openLandPublicityMap.disabled = !result?.mapPath;
    }

    async function openResultPath(path, label) {
      if (!path) return;
      try {
        const result = await context.sendNativeMessage({ action: "open_land_publicity_path", path }, 15000);
        if (!result?.ok) throw new Error(result?.reason || "打开失败");
        context.setStatus(`${label}已打开`, "ok");
      } catch (error) {
        context.setStatus(`${label}打开失败：${error?.message || String(error)}`, "error");
      }
    }

    async function chooseOutputDirectory() {
      try {
        const result = await context.sendNativeMessage({ action: "select_land_publicity_output_directory" }, 130000);
        const selected = result?.paths?.[0] || "";
        if (!result?.ok || !selected) {
          if (!result?.cancelled) setMessage(elements.landPublicityResultMessage, result?.reason || "未选择输出目录", "warn");
          return;
        }
        config.outputDirectory = selected;
        elements.landPublicityOutputDirectory.value = selected;
        await context.storage.save(config);
        const folderMessage = result.directoryName
          ? `${result.createdDirectory === false ? "已选择" : "已创建并选择"}专用子文件夹：${result.directoryName}`
          : "输出目录已选择";
        setMessage(elements.landPublicityResultMessage, `${folderMessage}，请检查参数后开始抓取`, "ok");
      } catch (error) {
        setMessage(elements.landPublicityResultMessage, `选择目录失败：${error?.message || String(error)}`, "error");
      }
    }

    async function clearFilters() {
      if (running) return;
      const outputDirectory = elements.landPublicityOutputDirectory.value.trim() || config.outputDirectory || "";
      config = normalizeConfig({ outputDirectory });
      renderConfig();
      setResultButtons(null);
      renderProgress({ percent: 0, message: "筛选已清空，尚未运行", fetched: 0, filtered: 0, written: 0 });
      setMessage(elements.landPublicityResultMessage, outputDirectory ? "筛选已清空；输出目录已保留。" : "筛选已清空；请先选择输出目录。", outputDirectory ? "ok" : "warn");
      try {
        await context.storage.save(config);
      } catch (error) {
        setMessage(elements.landPublicityResultMessage, `清空后保存失败：${error?.message || String(error)}`, "error");
      }
    }

    async function run() {
      if (running) return;
      let request;
      try {
        request = validateLocal(readConfig());
      } catch (error) {
        setMessage(elements.landPublicityResultMessage, error?.message || String(error), "error");
        context.setStatus(`土地公示参数无效：${error?.message || String(error)}`, "error");
        return;
      }
      config = request;
      await context.storage.save(config);
      running = true;
      setResultButtons(null);
      elements.runLandPublicity.disabled = true;
      renderProgress({ percent: 1, message: "正在准备受控土地公示抓取", fetched: 0, filtered: 0, written: 0 });
      setMessage(elements.landPublicityResultMessage, "列表 API 参数已校验；正在流式读取阶段进度…", "");
      context.setStatus("正在抓取浙江土地成交公示…", "idle");
      try {
        const result = await context.streamNativeMessage({ action: "run_land_publicity", request }, (progress) => {
          renderProgress(progress);
          context.setStatus(progress.message || "土地公示处理中…", "idle");
        });
        if (!result?.ok) throw new Error(result?.reason || "LAND_PUBLICITY_RUN_FAILED");
        renderProgress({ ...result, fetched: result.fetchedCount, filtered: result.filteredCount, written: result.writtenCount, message: `完成：已写出 ${result.writtenCount || 0} 条，结果文件回读通过` });
        setResultButtons(result);
        const writtenCount = Number(result.writtenCount || 0);
        const warningCount = (result.filterSummary?.warnings || []).length + (result.filterSummary?.unsupportedFilters || []).length;
        const emptySuggestion = writtenCount === 0
          ? `结果为 0 条。当前筛选条件：${filterConditionSummary(request)}。建议检查成交公示日期、行政区或位置关键词，以及接口是否返回记录。`
          : "";
        setMessage(elements.landPublicityResultMessage, `已完成：Excel ${writtenCount} 条；无坐标 ${result.noCoordinateCount || 0} 条。${warningCount ? `有 ${warningCount} 项筛选限制已在结果页说明。` : ""}${emptySuggestion}`, warningCount || emptySuggestion ? "warn" : "ok");
        await openResultPath(result.htmlPath, "结果页");
        context.setStatus("浙江土地成交公示抓取完成，Excel/HTML 已回读", "ok");
      } catch (error) {
        renderProgress({ percent: 0, message: `抓取失败：${error?.message || String(error)}` });
        setMessage(elements.landPublicityResultMessage, error?.message || String(error), "error");
        context.setStatus(`土地公示抓取失败：${error?.message || String(error)}`, "error");
      } finally {
        running = false;
        elements.runLandPublicity.disabled = false;
      }
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        root = context.document.getElementById(context.manifest.pageElementId);
        if (!root) throw new Error("LAND_PUBLICITY_PAGE_MISSING");
        root.dataset.moduleId = context.manifest.id;
        root.innerHTML = landPublicityTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/land-publicity/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        config = normalizeConfig(await context.storage.load({}));
        renderConfig();
        context.scope.on(elements.openLandPublicity, "click", () => context.navigate("land-publicity"));
        context.scope.on(elements.backFromLandPublicity, "click", () => context.navigate("home"));
        context.scope.on(elements.chooseLandPublicityOutput, "click", chooseOutputDirectory);
        context.scope.on(elements.clearLandPublicityFilters, "click", clearFilters);
        context.scope.on(elements.landPublicityProvinceWide, "change", () => {
          config.provinceWide = elements.landPublicityProvinceWide.checked;
          elements.landPublicityDistrict.disabled = config.provinceWide;
          elements.landPublicityDistrictExact.disabled = config.provinceWide;
        });
        context.scope.on(elements.runLandPublicity, "click", run);
        context.scope.on(elements.openLandPublicityHtml, "click", () => openResultPath(lastResult?.htmlPath, "结果页"));
        context.scope.on(elements.openLandPublicityExcel, "click", () => openResultPath(lastResult?.excelPath, "Excel"));
        context.scope.on(elements.openLandPublicityMap, "click", () => openResultPath(lastResult?.mapPath, "地图"));
      },
      activate() { renderConfig(); },
      deactivate() {},
      dispose() {},
    };
  },
};
