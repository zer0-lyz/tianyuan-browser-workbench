import { landPublicityTemplate } from "./template.js";

const FIXED_TRADE_FORM = "国有土地";
const FIXED_TRADE_METHODS = ["挂牌出让", "拍卖出让"];
const FIXED_TRADE_STAGES = ["结果公示"];

const DEFAULT_CONFIG = {
  tradeForm: FIXED_TRADE_FORM,
  tradeMethods: [...FIXED_TRADE_METHODS],
  tradeStages: [...FIXED_TRADE_STAGES],
  district: "",
  county: "",
  provinceWide: false,
  location: "",
  landUses: [],
  startDate: "",
  endDate: "",
  districtExact: false,
  generateMap: true,
  maxPages: "200",
  outputDirectory: "",
};

function elementMap(documentRef) {
  const ids = [
    "openLandPublicity", "backFromLandPublicity", "landPublicityDistrict", "landPublicityCounty", "landPublicityLocation",
    "landPublicityStartDate", "landPublicityEndDate",
    "landPublicityGenerateMap", "landPublicityOutputDirectory", "chooseLandPublicityOutput", "clearLandPublicityFilters", "runLandPublicity",
    "reloadLandPublicityRegions", "landPublicityRegionStatus",
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_CONFIG,
    tradeForm: FIXED_TRADE_FORM,
    tradeMethods: [...FIXED_TRADE_METHODS],
    tradeStages: [...FIXED_TRADE_STAGES],
    district: String(source.district || "").trim(),
    county: String(source.county || "").trim(),
    provinceWide: source.provinceWide === true,
    location: String(source.location || "").trim(),
    landUses: Array.isArray(source.landUses) ? source.landUses : [],
    startDate: String(source.startDate || "").trim(),
    endDate: String(source.endDate || "").trim(),
    districtExact: source.districtExact === true,
    generateMap: source.generateMap !== false,
    maxPages: "200",
    outputDirectory: String(source.outputDirectory || "").trim(),
  };
}

function filterConditionSummary(request) {
  const conditions = [];
  if (request.provinceWide) {
    conditions.push("行政区=全省/不限制行政区");
  } else if (request.district) {
    conditions.push(`行政区=${request.district}`);
  }
  if (!request.provinceWide && request.county) conditions.push(`区县=${request.county}`);
  if (request.location) conditions.push(`位置关键词=${request.location}`);
  conditions.push(`交易形式=${FIXED_TRADE_FORM}`);
  conditions.push(`交易方式=${FIXED_TRADE_METHODS.join("、")}`);
  conditions.push(`交易阶段=${FIXED_TRADE_STAGES.join("、")}`);
  if (request.landUses?.length) conditions.push(`土地用途=${request.landUses.join("、")}`);
  if (request.startDate || request.endDate) conditions.push(`官网查询日期=${request.startDate || "不限"}至${request.endDate || "不限"}`);
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
    let regionCatalog = [];
    let regionLoading = null;

    function regionRoots() {
      const province = regionCatalog.find((item) => item.name === "浙江省" || item.code === "330000");
      return province?.children?.length ? province.children : regionCatalog;
    }

    function selectedCityRegion() {
      return regionRoots().find((item) => item.name === config.district) || null;
    }

    function setRegionStatus(text, kind = "") {
      if (!elements?.landPublicityRegionStatus) return;
      elements.landPublicityRegionStatus.textContent = text;
      elements.landPublicityRegionStatus.dataset.kind = kind;
    }

    function renderRegionOptions() {
      const district = elements?.landPublicityDistrict;
      const county = elements?.landPublicityCounty;
      if (!district || !county) return;
      const cities = regionRoots();
      if (cities.length) {
        district.innerHTML = `<option value="">请选择地市（可不选）</option>${cities.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("")}`;
        district.value = cities.some((item) => item.name === config.district) ? config.district : "";
      }
      const city = selectedCityRegion();
      const counties = city?.children || [];
      county.innerHTML = `<option value="">${city ? "请选择区县（可不选）" : "请先选择地市"}</option>${counties.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("")}`;
      county.disabled = !city;
      county.value = counties.some((item) => item.name === config.county) ? config.county : "";
    }

    async function loadRegionCatalog() {
      if (regionLoading) return regionLoading;
      setRegionStatus("正在从浙江土地市场网加载行政区…");
      regionLoading = context.sendNativeMessage({ action: "list_land_publicity_regions" }, 25000)
        .then((result) => {
          if (!result?.ok || !Array.isArray(result.regions) || !result.regions.length) throw new Error(result?.reason || "LAND_REGION_CATALOG_EMPTY");
          regionCatalog = result.regions;
          renderRegionOptions();
          setRegionStatus(`已加载 ${regionRoots().length} 个地市，可继续选择区县。`, "ok");
          return result;
        })
        .catch((error) => {
          renderRegionOptions();
          setRegionStatus(`行政区加载失败：${error?.message || String(error)}；可点击“刷新行政区”重试。`, "error");
          return null;
        })
        .finally(() => { regionLoading = null; });
      return regionLoading;
    }

    function readConfig() {
      const next = {
        ...DEFAULT_CONFIG,
        tradeForm: FIXED_TRADE_FORM,
        tradeMethods: [...FIXED_TRADE_METHODS],
        tradeStages: [...FIXED_TRADE_STAGES],
        district: elements.landPublicityDistrict.value.trim(),
        county: elements.landPublicityCounty.value.trim(),
        provinceWide: false,
        location: elements.landPublicityLocation.value.trim(),
        landUses: checkedValues(root, "landUse"),
        startDate: elements.landPublicityStartDate.value,
        endDate: elements.landPublicityEndDate.value,
        districtExact: false,
        generateMap: elements.landPublicityGenerateMap.checked,
        maxPages: "200",
        outputDirectory: elements.landPublicityOutputDirectory.value.trim(),
      };
      return next;
    }

    function renderConfig() {
      setCheckedValues(root, "landUse", config.landUses);
      renderRegionOptions();
      elements.landPublicityDistrict.value = config.district || "";
      elements.landPublicityCounty.value = config.county || "";
      elements.landPublicityLocation.value = config.location || "";
      elements.landPublicityStartDate.value = config.startDate || "";
      elements.landPublicityEndDate.value = config.endDate || "";
      elements.landPublicityGenerateMap.checked = Boolean(config.generateMap);
      elements.landPublicityOutputDirectory.value = config.outputDirectory || "";
      elements.landPublicityCounty.disabled = !selectedCityRegion();
    }

    function validateLocal(next) {
      if (!next.outputDirectory) throw new Error("请先选择本机输出目录");
      if (next.startDate && next.endDate && next.startDate > next.endDate) throw new Error("官网查询起始日期不能晚于结束日期");
      const provinceWide = !next.district && !next.county && !next.location;
      const districtExact = Boolean(next.county);
      return {
        ...next,
        district: provinceWide ? "" : next.district,
        county: provinceWide ? "" : next.county,
        districtExact,
        provinceWide,
        tradeForm: FIXED_TRADE_FORM,
        tradeMethods: [...FIXED_TRADE_METHODS],
        tradeStages: [...FIXED_TRADE_STAGES],
        maxPages: 200,
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
      renderConfig();
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
        const filterSummary = filterConditionSummary(request);
        const emptySuggestion = writtenCount === 0
          ? `结果为 0 条。当前筛选条件：${filterConditionSummary(request)}。建议检查官网查询日期、行政区或位置关键词，以及接口是否返回记录。`
          : "";
        setMessage(elements.landPublicityResultMessage, `已完成：Excel ${writtenCount} 条；实际条件：${filterSummary}。无坐标 ${result.noCoordinateCount || 0} 条。${warningCount ? `有 ${warningCount} 项筛选限制已在结果页说明。` : ""}${emptySuggestion}`, warningCount || emptySuggestion ? "warn" : "ok");
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
        context.scope.on(elements.reloadLandPublicityRegions, "click", loadRegionCatalog);
        context.scope.on(elements.landPublicityDistrict, "change", async () => {
          config.district = elements.landPublicityDistrict.value.trim();
          config.county = "";
          config.provinceWide = false;
          config.districtExact = false;
          renderRegionOptions();
          await context.storage.save({ ...config });
        });
        context.scope.on(elements.landPublicityCounty, "change", async () => {
          config.county = elements.landPublicityCounty.value.trim();
          config.provinceWide = false;
          config.districtExact = Boolean(config.county);
          await context.storage.save({ ...config });
        });
        context.scope.on(elements.runLandPublicity, "click", run);
        context.scope.on(elements.openLandPublicityHtml, "click", () => openResultPath(lastResult?.htmlPath, "结果页"));
        context.scope.on(elements.openLandPublicityExcel, "click", () => openResultPath(lastResult?.excelPath, "Excel"));
        context.scope.on(elements.openLandPublicityMap, "click", () => openResultPath(lastResult?.mapPath, "地图"));
        void loadRegionCatalog();
      },
      activate() { renderConfig(); if (!regionCatalog.length) void loadRegionCatalog(); },
      deactivate() {},
      dispose() {},
    };
  },
};
