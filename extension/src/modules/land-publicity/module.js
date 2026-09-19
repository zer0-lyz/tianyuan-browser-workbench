import { landPublicityTemplate } from "./template.js";

const DEFAULT_CONFIG = {
  tradeForm: "",
  tradeMethods: [],
  tradeStages: ["结果公示"],
  district: "",
  provinceWide: false,
  location: "",
  landUses: [],
  startDate: "",
  startYear: "2025",
  quotePreset: "all",
  quoteStartDate: "",
  quoteEndDate: "",
  startPriceMin: "",
  startPriceMax: "",
  areaMin: "",
  areaMax: "",
  areaUnit: "mu",
  districtExact: false,
  generateMap: true,
  maxPages: "50",
  outputDirectory: "",
};

function elementMap(documentRef) {
  const ids = [
    "openLandPublicity", "backFromLandPublicity", "landPublicityDistrict", "landPublicityProvinceWide", "landPublicityLocation",
    "landPublicityDistrictExact", "landPublicityStartDate", "landPublicityStartYear", "landPublicityQuotePreset",
    "landPublicityQuoteStartDate", "landPublicityQuoteEndDate", "landPublicityMaxPages", "landPublicityStartPriceMin",
    "landPublicityStartPriceMax", "landPublicityAreaMin", "landPublicityAreaMax", "landPublicityAreaUnit",
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

function numberOrEmpty(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}必须是非负数字`);
  return number;
}

function filterConditionSummary(request) {
  const conditions = [];
  if (request.provinceWide) {
    conditions.push("行政区=全省/不限制行政区");
  } else if (request.district) {
    conditions.push(`行政区=${request.district}${request.districtExact ? "（districtName精确匹配）" : ""}`);
  }
  if (request.location) conditions.push(`位置关键词=${request.location}`);
  if (request.tradeForm) conditions.push(`交易形式=${request.tradeForm}`);
  if (request.tradeMethods?.length) conditions.push(`交易方式=${request.tradeMethods.join("、")}`);
  if (request.tradeStages?.length) conditions.push(`交易阶段=${request.tradeStages.join("、")}`);
  if (request.landUses?.length) conditions.push(`土地用途=${request.landUses.join("、")}`);
  if (request.startDate) conditions.push(`起始日期≥${request.startDate}`);
  if (request.startYear) conditions.push(`起始年份≥${request.startYear}`);
  if (request.quotePreset && request.quotePreset !== "all") {
    const quoteLabels = {
      today: "今天",
      future_3_days: "未来三天",
      future_7_days: "未来七天",
      future_30_days: "未来三十天",
      custom: "自定义",
    };
    let quoteText = quoteLabels[request.quotePreset] || request.quotePreset;
    if (request.quoteStartDate || request.quoteEndDate) quoteText += `（${request.quoteStartDate || "不限"}至${request.quoteEndDate || "不限"}）`;
    conditions.push(`报价开始时间=${quoteText}`);
  }
  if (request.startPriceMin !== "" || request.startPriceMax !== "") {
    conditions.push(`起始价=${request.startPriceMin === "" ? "不限" : request.startPriceMin}至${request.startPriceMax === "" ? "不限" : request.startPriceMax}`);
  }
  if (request.areaMin !== "" || request.areaMax !== "") {
    const unit = request.areaUnit === "mu" ? "亩" : "平方米";
    conditions.push(`出让面积=${request.areaMin === "" ? "不限" : request.areaMin}至${request.areaMax === "" ? "不限" : request.areaMax}${unit}`);
  }
  if (request.maxPages) conditions.push(`抓取页数上限=${request.maxPages}`);
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
        ...config,
        tradeForm: root.querySelector('input[name="landTradeForm"]:checked')?.value || "",
        tradeMethods: checkedValues(root, "landTradeMethod"),
        tradeStages: checkedValues(root, "landTradeStage"),
        district: elements.landPublicityDistrict.value.trim(),
        provinceWide: elements.landPublicityProvinceWide.checked,
        location: elements.landPublicityLocation.value.trim(),
        landUses: checkedValues(root, "landUse"),
        startDate: elements.landPublicityStartDate.value,
        startYear: elements.landPublicityStartYear.value.trim(),
        quotePreset: elements.landPublicityQuotePreset.value,
        quoteStartDate: elements.landPublicityQuoteStartDate.value,
        quoteEndDate: elements.landPublicityQuoteEndDate.value,
        startPriceMin: elements.landPublicityStartPriceMin.value.trim(),
        startPriceMax: elements.landPublicityStartPriceMax.value.trim(),
        areaMin: elements.landPublicityAreaMin.value.trim(),
        areaMax: elements.landPublicityAreaMax.value.trim(),
        areaUnit: elements.landPublicityAreaUnit.value,
        districtExact: elements.landPublicityDistrictExact.checked,
        generateMap: elements.landPublicityGenerateMap.checked,
        maxPages: elements.landPublicityMaxPages.value,
        outputDirectory: elements.landPublicityOutputDirectory.value.trim(),
      };
      return next;
    }

    function renderConfig() {
      const selectedForm = [...root.querySelectorAll('input[name="landTradeForm"]')]
        .find((input) => input.value === (config.tradeForm || ""));
      if (selectedForm) selectedForm.checked = true;
      setCheckedValues(root, "landTradeMethod", config.tradeMethods);
      setCheckedValues(root, "landTradeStage", config.tradeStages);
      setCheckedValues(root, "landUse", config.landUses);
      elements.landPublicityDistrict.value = config.district || "";
      elements.landPublicityProvinceWide.checked = Boolean(config.provinceWide);
      elements.landPublicityLocation.value = config.location || "";
      elements.landPublicityDistrictExact.checked = Boolean(config.districtExact);
      elements.landPublicityStartDate.value = config.startDate || "";
      elements.landPublicityStartYear.value = config.startYear || "";
      elements.landPublicityQuotePreset.value = config.quotePreset || "all";
      elements.landPublicityQuoteStartDate.value = config.quoteStartDate || "";
      elements.landPublicityQuoteEndDate.value = config.quoteEndDate || "";
      elements.landPublicityStartPriceMin.value = config.startPriceMin ?? "";
      elements.landPublicityStartPriceMax.value = config.startPriceMax ?? "";
      elements.landPublicityAreaMin.value = config.areaMin ?? "";
      elements.landPublicityAreaMax.value = config.areaMax ?? "";
      elements.landPublicityAreaUnit.value = config.areaUnit || "sqm";
      elements.landPublicityGenerateMap.checked = Boolean(config.generateMap);
      elements.landPublicityMaxPages.value = String(config.maxPages || "50");
      elements.landPublicityOutputDirectory.value = config.outputDirectory || "";
      elements.landPublicityDistrict.disabled = Boolean(config.provinceWide);
      elements.landPublicityDistrictExact.disabled = Boolean(config.provinceWide);
    }

    function validateLocal(next) {
      if (!next.outputDirectory) throw new Error("请先选择本机输出目录");
      if (!next.provinceWide && !next.district && !next.location) throw new Error("请至少选择行政区、填写位置关键词，或勾选全省/不限制行政区");
      if (!next.startDate && !next.startYear) throw new Error("请填写成交公示起始日期或起始年份");
      if (next.startDate && next.startYear) {
        // Both are allowed; the exact date is the stricter boundary.
      }
      if (next.quotePreset === "custom" && !next.quoteStartDate && !next.quoteEndDate) {
        throw new Error("自定义报价开始时间至少填写一个日期");
      }
      const priceMin = numberOrEmpty(next.startPriceMin, "最低起始价");
      const priceMax = numberOrEmpty(next.startPriceMax, "最高起始价");
      const areaMin = numberOrEmpty(next.areaMin, "最低出让面积");
      const areaMax = numberOrEmpty(next.areaMax, "最高出让面积");
      if (priceMin !== "" && priceMax !== "" && priceMin > priceMax) throw new Error("起始价区间最小值不能大于最大值");
      if (areaMin !== "" && areaMax !== "" && areaMin > areaMax) throw new Error("出让面积区间最小值不能大于最大值");
      return {
        ...next,
        startPriceMin: priceMin,
        startPriceMax: priceMax,
        areaMin,
        areaMax,
        maxPages: Number(next.maxPages),
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
        setMessage(elements.landPublicityResultMessage, "输出目录已选择，请检查参数后开始抓取", "ok");
      } catch (error) {
        setMessage(elements.landPublicityResultMessage, `选择目录失败：${error?.message || String(error)}`, "error");
      }
    }

    async function clearFilters() {
      if (running) return;
      const outputDirectory = elements.landPublicityOutputDirectory.value.trim() || config.outputDirectory || "";
      config = { ...DEFAULT_CONFIG, outputDirectory };
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
      if (request.maxPages === 1 && !request.provinceWide && (request.district || request.location)) {
        request.maxPages = 50;
        elements.landPublicityMaxPages.value = "50";
        setMessage(elements.landPublicityResultMessage, "行政区/位置筛选不会可靠命中最新第 1 页，已自动扩展到 50 页。", "warn");
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
          ? `结果为 0 条。当前筛选条件：${filterConditionSummary(request)}。${Number(request.maxPages) === 1 && (request.district || request.location) ? "当前只抓第 1 页；目标行政区可能不在最新 50 条中，请改为 50 页（行政区推荐）后重试。" : "建议检查起始年份/日期、行政区码或区县名称、抓取页数上限，以及接口返回是否存在记录。"}`
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
        config = { ...DEFAULT_CONFIG, ...(await context.storage.load({})) };
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
