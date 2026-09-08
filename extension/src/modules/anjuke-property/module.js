import { anjukePropertyTemplate } from "./template.js";

const DEFAULT_PROFILE_PATH = "~/.tianyuan-workbench/dependencies/anjuke-property-profile";
const DETAIL_DELAY_MS = 2200;
const DEFAULT_CONFIG = {
  currentUrl: "",
  listUrls: [],
  detailUrls: [],
  caseType: "auto",
  maxCases: 10,
  screenshot: false,
  waitVerification: true,
  verificationTimeout: 300,
  headed: true,
  userDataDir: DEFAULT_PROFILE_PATH,
  outputDirectory: "",
};

function elementMap(documentRef) {
  const ids = [
    "openAnjukeProperty", "backFromAnjukeProperty", "anjukePropertyCurrentUrl", "importAnjukePropertyCurrentUrl",
    "anjukePropertyCaseType", "anjukePropertyMaxCases", "anjukePropertyWaitVerification", "anjukePropertyScreenshot",
    "runAnjukeProperty", "resetAnjukePropertyParams", "anjukePropertyParameterState", "anjukePropertyParameterMessage",
    "anjukePropertyOutputDirectory", "chooseAnjukePropertyOutput", "openAnjukePropertyExcel", "openAnjukePropertyCsv",
    "openAnjukePropertyHtml", "openAnjukePropertyResult", "openAnjukePropertyMap", "clearAnjukePropertyResults", "anjukePropertyResultCount", "anjukePropertyResultStatus",
    "anjukePropertyProgressPhase", "anjukePropertyProgressPercent", "anjukePropertyProgressBar", "anjukePropertyProgressFetched",
    "anjukePropertyProgressWritten", "anjukePropertyResultMessage",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function setMessage(element, text, kind = "") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

function normalizeAnjukeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || !/(^|\.)anjuke\.com$/i.test(url.hostname)) return "";
  return url.href;
}

function isScopedListingUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { return false; }
  if (url.protocol !== "https:" || !/(^|\.)anjuke\.com$/i.test(url.hostname)) return false;
  const pathname = url.pathname.replace(/\/+$/, "");
  return /^\/(?:xzl-shou|xzl-zu|sp-shou|sp-zu|sp-rent)\/[^/]+(?:\/[^/]+)*$/i.test(pathname)
    && !/\/\d+$/i.test(pathname);
}

function isAnjukeListingUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { return false; }
  if (url.protocol !== "https:" || !/(^|\.)anjuke\.com$/i.test(url.hostname)) return false;
  const pathname = url.pathname.replace(/\/+$/, "");
  return /^\/(?:xzl-shou|xzl-zu|sp-shou|sp-zu|sp-rent)(?:\/[^/]+)*$/i.test(pathname)
    && !/\/\d+$/i.test(pathname);
}

function isAnjukeDetailUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && /(^|\.)anjuke\.com$/i.test(url.hostname)
    && (/\/prop\/view\/[A-Za-z0-9_-]+/i.test(url.pathname)
      || /\/(?:fang5|sale|rent)\/[A-Za-z0-9_-]+/i.test(url.pathname)
      || /\/(?:xzl-shou|xzl-zu|sp-shou|sp-zu|sp-rent)\/(?:[^/]+\/)*\d+(?:\/|$)/i.test(url.pathname)
      || /\/\d+(?:\/|$)/.test(url.pathname)
      || /\.html(?:$|\?)/i.test(url.pathname));
}

function inferCaseType(url) {
  const path = String(url || "").toLowerCase();
  if (/(sp-rent|rent|zu)/.test(path)) return "rent";
  if (/(sp-shou|sale|shou)/.test(path)) return "sale";
  return "auto";
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const legacyUrl = Array.isArray(source.listUrls) ? source.listUrls[0] : (Array.isArray(source.detailUrls) ? source.detailUrls[0] : "");
  const currentUrl = normalizeAnjukeUrl(source.currentUrl || legacyUrl);
  return {
    ...DEFAULT_CONFIG,
    currentUrl,
    listUrls: currentUrl ? [currentUrl] : [],
    detailUrls: [],
    caseType: ["auto", "sale", "rent"].includes(source.caseType) ? source.caseType : inferCaseType(currentUrl),
    maxCases: Math.max(1, Math.min(100, Number(source.maxCases || 10))),
    screenshot: source.screenshot === true,
    waitVerification: source.waitVerification !== false,
    verificationTimeout: Math.max(1, Math.min(900, Number(source.verificationTimeout || 300))),
    headed: true,
    userDataDir: String(source.userDataDir || DEFAULT_PROFILE_PATH).trim(),
    outputDirectory: String(source.outputDirectory || "").trim(),
  };
}

function comparableConfig(config) {
  const normalized = normalizeConfig(config);
  return JSON.stringify({
    currentUrl: normalized.currentUrl,
    caseType: normalized.caseType,
    maxCases: normalized.maxCases,
    screenshot: normalized.screenshot,
    waitVerification: normalized.waitVerification,
    outputDirectory: normalized.outputDirectory,
  });
}

function parseResultPaths(result) {
  return {
    excelPath: String(result?.excelPath || "").trim(),
    csvPath: String(result?.csvPath || "").trim(),
    htmlDirectory: String(result?.htmlDirectory || "").trim(),
    resultHtmlPath: String(result?.resultHtmlPath || "").trim(),
    mapPath: String(result?.mapPath || "").trim(),
  };
}

async function captureAnjukeCurrentTab(options = {}) {
  const maxCases = Math.max(1, Math.min(100, Number(options.maxCases || 10)));
  const candidateLimit = Math.min(100, maxCases + 10);
  const keyword = String(options.keyword || "").trim();
  const verificationMarkers = ["验证码", "访问过于频繁", "安全验证", "滑块", "人机验证", "请完成验证", "请拖动滑块", "验证后继续", "风险验证", "人机校验"];
  const bodyText = () => String(document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim();
  const blocked = (text) => verificationMarkers.some((marker) => text.includes(marker));
  const isDetailUrl = (url) => /\/prop\/view\/[A-Za-z0-9_-]+/i.test(url.pathname)
    || /\/(?:fang5|sale|rent)\/[A-Za-z0-9_-]+/i.test(url.pathname)
    || /\/(?:xzl-shou|xzl-zu|sp-shou|sp-zu|sp-rent)\/(?:[^/]+\/)*\d+(?:\/|$)/i.test(url.pathname)
    || /\/\d+(?:\/|$)/.test(url.pathname)
    || /\.html(?:$|\?)/i.test(url.pathname);
  const currentText = bodyText();
  const sourcePath = location.pathname.replace(/\/+$/, "");
  if (!/^\/(?:xzl-shou|xzl-zu|sp-shou|sp-zu|sp-rent)(?:\/[^/]+)*$/i.test(sourcePath)
    || /\/\d+$/i.test(sourcePath)) {
    return { ok: false, errorCode: "ANJUKE_LIST_PAGE_REQUIRED", reason: "当前页面不是安居客列表页，请先打开列表页。" };
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    window.scrollTo(0, document.body?.scrollHeight || 0);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
  }
  window.scrollTo(0, 0);
  if (blocked(currentText)) {
    return { ok: false, verificationRequired: true, errorCode: "ANJUKE_VERIFICATION_REQUIRED", reason: "当前安居客标签页正在等待验证。" };
  }
  const detailUrls = [];
  const seen = new Set();
  const listPath = location.pathname.replace(/\/$/, "");
  const anchors = [];
  const visitedRoots = new Set();
  const collectAnchors = (root) => {
    if (!root || visitedRoots.has(root)) return;
    visitedRoots.add(root);
    if (root.querySelectorAll) {
      anchors.push(...root.querySelectorAll("a[href]"));
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) collectAnchors(element.shadowRoot);
      }
    }
  };
  collectAnchors(document);
  const isRecommendationUrl = (url) => /(?:guessrecommend|recommend|history|similar|related)/i.test(url.search || "");
  const canonicalDetailUrl = (url) => {
    const clean = new URL(url.href);
    clean.search = "";
    clean.hash = "";
    return clean;
  };
  const cardTextOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const cardOf = (anchor) => {
    let node = anchor;
    for (let level = 0; node && level < 8; level += 1, node = node.parentElement) {
      const text = cardTextOf(node);
      if (text.length >= 40 && text.length <= 2200 && /(?:㎡|平米|平方米)/.test(text) && /(?:万|元\/㎡|元\/月)/.test(text)) return node;
    }
    return anchor.parentElement;
  };
  for (const anchor of anchors) {
    const card = cardOf(anchor);
    const cardText = cardTextOf(card);
    if (!card || !/(?:㎡|平米|平方米)/.test(cardText) || !/(?:万|元\/㎡|元\/月)/.test(cardText)) continue;
    const candidates = Array.from(card.querySelectorAll("a[href]")).map((candidate) => {
      try {
        const url = new URL(candidate.href, location.href);
        url.hash = "";
        return url;
      } catch {
        return null;
      }
    }).filter((url) => url && url.protocol === "https:" && /(^|\.)anjuke\.com$/i.test(url.hostname)
      && url.pathname.replace(/\/$/, "") !== listPath
      && new RegExp(`/${sourcePath.split("/")[1]}/`, "i").test(url.pathname)
      && !isRecommendationUrl(url)
      );
    const url = canonicalDetailUrl(candidates.find((candidate) => isDetailUrl(candidate)) || candidates[0]);
    if (!url || (keyword && !cardText.includes(keyword) && !url.href.includes(keyword))) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    detailUrls.push(url.href);
    if (detailUrls.length >= candidateLimit) break;
  }
  if (!detailUrls.length) {
    return { ok: false, verificationRequired: blocked(currentText), errorCode: "ANJUKE_NO_DETAIL_URLS", reason: "当前安居客页面没有找到详情案例链接。" };
  }
  return { ok: true, detailUrls };
}

function readAnjukeDetailTab() {
  const text = String(document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60000);
  const verificationMarkers = ["验证码", "访问过于频繁", "安全验证", "滑块", "人机验证", "请完成验证", "请拖动滑块", "验证后继续", "风险验证", "人机校验"];
  const verificationSelectors = [
    "iframe[src*='captcha' i]", "iframe[src*='verify' i]", "[id*='captcha' i]", "[class*='captcha' i]",
    "[id*='verify' i]", "[class*='verify' i]", "[class*='slider' i]", ".geetest_panel", ".nc-container", "#nc_1_wrapper",
  ];
  const detailMarkers = ["总价", "售价", "参考售价", "报价", "租金", "建筑面积", "房屋单价", "单价", "户型", "楼层", "朝向", "装修", "房源编号", "写字楼", "商铺"];
  const source = String(document.documentElement?.outerHTML || "").slice(0, 400000);
  const coordinate = (name, minimum, maximum) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`(?:["']?${escapedName}["']?|data-${escapedName})[^0-9-]{0,24}(-?\\d+(?:\\.\\d+)?)`, "i"));
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
  };
  const verificationRequired = verificationMarkers.some((marker) => text.includes(marker))
    || verificationSelectors.some((selector) => document.querySelector(selector));
  const detailSignalCount = detailMarkers.filter((marker) => text.includes(marker)).length;
  const detailAvailable = !verificationRequired && detailSignalCount >= 2;
  return {
    pageUrl: location.href,
    text,
    title: String(document.querySelector("h1,.title,.house-title,.main-title")?.innerText || document.title || "").trim().slice(0, 300),
    location: String(document.querySelector(".address,.addr,[class*=address],[class*=addr]")?.innerText || "").trim().slice(0, 300),
    longitude: coordinate("longitude", -180, 180) ?? coordinate("lng", -180, 180) ?? coordinate("lon", -180, 180),
    latitude: coordinate("latitude", -90, 90) ?? coordinate("lat", -90, 90),
    verificationRequired,
    verificationSource: verificationRequired ? "text-or-verification-dom" : "",
    detailAvailable,
    detailSignalCount,
    errorCode: detailAvailable ? "" : (verificationRequired ? "ANJUKE_DETAIL_VERIFICATION_REQUIRED" : "ANJUKE_DETAIL_PAGE_NOT_CASE"),
  };
}

export const anjukePropertyModule = {
  manifest: {
    id: "anjuke-property",
    type: "feature",
    stage: "stable",
    route: "anjuke-property",
    displayName: "安居客数据",
    messageNamespace: "anjuke-property",
    entryElementId: "openAnjukeProperty",
    pageElementId: "page-anjuke-property",
    storageVersion: 2,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let config = { ...DEFAULT_CONFIG };
    let results = [];
    let paths = { excelPath: "", csvPath: "", htmlDirectory: "", resultHtmlPath: "", mapPath: "" };
    let running = false;

    function state() {
      return { ...config, results, ...paths };
    }

    function readConfig() {
      return normalizeConfig({
        currentUrl: elements.anjukePropertyCurrentUrl.value,
        caseType: elements.anjukePropertyCaseType.value,
        maxCases: elements.anjukePropertyMaxCases.value,
        screenshot: elements.anjukePropertyScreenshot.checked,
        waitVerification: elements.anjukePropertyWaitVerification.checked,
        outputDirectory: elements.anjukePropertyOutputDirectory.value,
        userDataDir: config.userDataDir,
      });
    }

    function renderParameterState() {
      const ready = Boolean(config.currentUrl) && Boolean(config.outputDirectory);
      elements.anjukePropertyParameterState.textContent = config.currentUrl ? "网址已导入" : "未导入网址";
      elements.anjukePropertyParameterState.dataset.kind = ready ? "ok" : (config.currentUrl ? "warn" : "pending");
    }

    function renderConfig() {
      elements.anjukePropertyCurrentUrl.value = config.currentUrl;
      elements.anjukePropertyCaseType.value = config.caseType;
      elements.anjukePropertyMaxCases.value = String(config.maxCases);
      elements.anjukePropertyScreenshot.checked = config.screenshot;
      elements.anjukePropertyWaitVerification.checked = config.waitVerification;
      elements.anjukePropertyOutputDirectory.value = config.outputDirectory;
      renderParameterState();
    }

    function renderProgress(payload = {}) {
      const percent = Math.max(0, Math.min(100, Number(payload.percent || 0)));
      const phases = { opening: "正在启动浏览器", capturing: "正在抓取详情并归档证据", writing: "正在生成输出", completed: "抓取完成", failed: "抓取失败" };
      elements.anjukePropertyProgressPhase.textContent = phases[payload.phase] || "正在处理";
      elements.anjukePropertyProgressPercent.textContent = `${percent}%`;
      elements.anjukePropertyProgressBar.style.width = `${percent}%`;
      elements.anjukePropertyProgressBar.parentElement.setAttribute("aria-valuenow", String(percent));
      elements.anjukePropertyProgressFetched.textContent = String(payload.fetched ?? 0);
      elements.anjukePropertyProgressWritten.textContent = String(payload.written ?? 0);
      if (payload.message) elements.anjukePropertyResultStatus.textContent = payload.message;
    }

    function renderResults() {
      elements.anjukePropertyResultCount.textContent = `${results.length} 条`;
      elements.openAnjukePropertyExcel.disabled = !paths.excelPath;
      elements.openAnjukePropertyCsv.disabled = !paths.csvPath;
      elements.openAnjukePropertyHtml.disabled = !paths.htmlDirectory;
      elements.openAnjukePropertyResult.disabled = !paths.resultHtmlPath;
      elements.openAnjukePropertyMap.disabled = !paths.mapPath;
      elements.clearAnjukePropertyResults.disabled = !results.length;
    }

    async function importCurrentUrl() {
      try {
        const [tab] = await context.chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const currentUrl = normalizeAnjukeUrl(tab?.url);
        if (!currentUrl) {
          setMessage(elements.anjukePropertyParameterMessage, "当前标签页不是可用的安居客网页，请先在安居客上选好范围。", "warn");
          return;
        }
        if (!isAnjukeListingUrl(currentUrl)) {
          setMessage(elements.anjukePropertyParameterMessage, `当前页面不是安居客列表页：${currentUrl}。请先进入列表页后再导入。`, "warn");
          return;
        }
        config = normalizeConfig({ ...config, currentUrl, caseType: elements.anjukePropertyCaseType.value || inferCaseType(currentUrl) });
        await context.storage.save(state());
        renderConfig();
        setMessage(elements.anjukePropertyParameterMessage, `已导入当前列表页${isScopedListingUrl(currentUrl) ? "（已带区域条件）" : "（将按页面当前筛选条件）"}：${currentUrl}。现在可以开始抓取。`, "ok");
      } catch (error) {
        setMessage(elements.anjukePropertyParameterMessage, `导入当前网址失败：${error?.message || String(error)}`, "error");
      }
    }

    async function chooseOutput() {
      const result = await context.sendNativeMessage({ action: "select_anjuke_property_output_directory" }, 130000);
      const selected = result?.paths?.[0] || "";
      if (!result?.ok || !selected) {
        if (!result?.cancelled) setMessage(elements.anjukePropertyParameterMessage, result?.reason || "未选择输出目录", "warn");
        return;
      }
      config.outputDirectory = selected;
      renderConfig();
      await context.storage.save(state());
      setMessage(elements.anjukePropertyParameterMessage, `已选择专用子文件夹：${result.directoryName || "安居客物业案例"}。`, "ok");
    }

    function buildRequest() {
      config = readConfig();
      renderConfig();
      if (!config.currentUrl) {
        setMessage(elements.anjukePropertyParameterMessage, "请先点击“导入当前网址”。", "warn");
        return null;
      }
      if (!isAnjukeListingUrl(config.currentUrl)) {
        setMessage(elements.anjukePropertyParameterMessage, "当前网址不是安居客列表页，已阻止抓取；请重新导入列表页。", "warn");
        return null;
      }
      if (!config.outputDirectory) {
        setMessage(elements.anjukePropertyParameterMessage, "请先选择本机输出目录。", "warn");
        return null;
      }
      return { ...config, listUrls: [config.currentUrl], detailUrls: [] };
    }

    function waitForTabLoaded(tabId, timeoutMs = 60000) {
      return new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
          context.chrome.tabs.onUpdated.removeListener(onUpdated);
          if (timer) window.clearTimeout(timer);
        };
        const finish = (callback, value) => {
          cleanup();
          callback(value);
        };
        const onUpdated = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") finish(resolve, true);
        };
        context.chrome.tabs.onUpdated.addListener(onUpdated);
        timer = window.setTimeout(() => finish(reject, new Error("ANJUKE_TAB_LOAD_TIMEOUT")), timeoutMs);
        context.chrome.tabs.get(tabId).then((tab) => {
          if (tab?.status === "complete") finish(resolve, true);
        }).catch((error) => finish(reject, error));
      });
    }

    async function readCurrentDetail(tabId, detailUrl, request) {
      const deadline = Date.now() + (request.waitVerification ? request.verificationTimeout * 1000 : 10000);
      const contentSettleDeadline = Math.min(deadline, Date.now() + 15000);
      while (Date.now() < deadline) {
        const allTabs = await context.chrome.tabs.query({});
        const verificationPopup = allTabs.some((candidate) => {
          if (candidate.id === tabId) return false;
          try {
            const candidateUrl = new URL(candidate.url || "");
            return /(^|\.)anjuke\.com$/i.test(candidateUrl.hostname)
              && /(captcha|verify|verification|security|安全验证|验证码)/i.test(`${candidate.url || ""} ${candidate.title || ""}`);
          } catch {
            return false;
          }
        });
        if (verificationPopup) {
          if (!request.waitVerification) throw new Error("ANJUKE_DETAIL_VERIFICATION_REQUIRED");
          setMessage(elements.anjukePropertyResultMessage, "安居客验证页面已打开，请完成验证，脚本会继续等待。", "warn");
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          continue;
        }
        const [result] = await context.chrome.scripting.executeScript({ target: { tabId }, func: readAnjukeDetailTab });
        const detail = result?.result;
        if (detail?.verificationRequired) {
          if (!request.waitVerification) throw new Error("ANJUKE_DETAIL_VERIFICATION_REQUIRED");
          setMessage(elements.anjukePropertyResultMessage, "详情页需要验证，请在当前标签页完成验证，脚本会继续等待。", "warn");
          renderProgress({ phase: "capturing", percent: 12, fetched: 0, written: 0, message: "等待当前标签页完成详情页验证…" });
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          continue;
        }
        if (!isAnjukeDetailUrl(detail?.pageUrl)) throw new Error("ANJUKE_DETAIL_ROUTE_INVALID");
        if (!detail?.detailAvailable) {
          if (Date.now() < contentSettleDeadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            continue;
          }
          throw new Error(detail?.errorCode || "ANJUKE_DETAIL_PAGE_NOT_CASE");
        }
        if (detail?.text) return { url: detail.pageUrl || detailUrl, ...detail };
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      throw new Error("ANJUKE_DETAIL_CONTENT_EMPTY");
    }

    async function captureCurrentTab(request) {
      const [tab] = await context.chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const activeUrl = normalizeAnjukeUrl(tab?.url);
      if (!tab?.id || !activeUrl) throw new Error("当前标签页不是可用的安居客网页。");
      if (activeUrl !== request.currentUrl) throw new Error("当前标签页网址已变化，请重新点击“导入当前网址”。");
      if (!isAnjukeListingUrl(activeUrl)) throw new Error("ANJUKE_LIST_PAGE_REQUIRED");
      if (request.screenshot) throw new Error("当前浏览器标签页模式暂不支持详情页全页截图，请取消勾选“保存全页截图”。");
      const deadline = Date.now() + (request.waitVerification ? request.verificationTimeout * 1000 : 0);
      while (true) {
        const [result] = await context.chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureAnjukeCurrentTab,
          args: [{ maxCases: request.maxCases }],
        });
        const capture = result?.result;
        if (capture?.ok) {
          const pages = [];
          let skippedInvalidCount = 0;
          try {
            for (const [index, detailUrl] of capture.detailUrls.entries()) {
              if (index > 0) await new Promise((resolve) => window.setTimeout(resolve, DETAIL_DELAY_MS));
              await context.chrome.tabs.update(tab.id, { url: detailUrl });
              await waitForTabLoaded(tab.id);
              try {
                pages.push(await readCurrentDetail(tab.id, detailUrl, request));
              } catch (error) {
                const reason = String(error?.message || error || "");
                if (["ANJUKE_DETAIL_ROUTE_INVALID", "ANJUKE_DETAIL_PAGE_NOT_CASE"].some((code) => reason.startsWith(code))) {
                  skippedInvalidCount += 1;
                  renderProgress({ phase: "capturing", percent: 8 + Math.round((index + 1) / capture.detailUrls.length * 80), fetched: capture.detailUrls.length, written: pages.length, message: "已跳过非案例页面，继续检查详情 " + (index + 1) + "/" + capture.detailUrls.length });
                  continue;
                }
                throw error;
              }
              renderProgress({ phase: "capturing", percent: 8 + Math.round((index + 1) / capture.detailUrls.length * 80), fetched: capture.detailUrls.length, written: pages.length, message: "已读取当前标签页详情 " + (index + 1) + "/" + capture.detailUrls.length });
            }
            if (!pages.length) throw new Error("ANJUKE_NO_VALID_DETAIL_CASES");
            return { tab, capture: { pages, skippedInvalidCount } };
          } finally {
            await context.chrome.tabs.update(tab.id, { url: request.currentUrl }).catch(() => {});
          }
        }
        if (!capture?.verificationRequired || Date.now() >= deadline) {
          throw new Error(capture?.reason || capture?.errorCode || "ANJUKE_CURRENT_TAB_CAPTURE_FAILED");
        }
        setMessage(elements.anjukePropertyResultMessage, "请在当前安居客标签页完成验证，脚本会继续等待，不会关闭页面。", "warn");
        renderProgress({ phase: "capturing", percent: 5, fetched: 0, written: 0, message: "等待当前标签页完成安居客验证…" });
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    }

    async function run() {
      if (running) return;
      const request = buildRequest();
      if (!request) return;
      running = true;
      renderProgress({ phase: "opening", percent: 1, fetched: 0, written: 0, message: "正在读取当前安居客标签页…" });
      setMessage(elements.anjukePropertyResultMessage, "抓取将在当前浏览器标签页中执行；遇到验证会等待人工完成。", "warn");
      context.setStatus("安居客脚本正在运行", "busy");
      try {
        const { tab, capture } = await captureCurrentTab(request);
        renderProgress({ phase: "capturing", percent: 8, fetched: capture.pages.length, written: 0, message: "当前标签页已读取 " + capture.pages.length + " 个详情案例，正在生成输出…" });
        const result = await context.streamNativeMessage({
          action: "run_anjuke_property",
          request: { ...request, tabId: tab.id, skippedInvalidCount: capture.skippedInvalidCount || 0, capturedPages: capture.pages },
        }, (progress) => renderProgress(progress));
        if (!result?.ok) throw new Error(result?.reason || result?.errorCode || "ANJUKE_CAPTURE_FAILED");
        results = Array.isArray(result.results) ? result.results : [];
        paths = parseResultPaths(result);
        config = normalizeConfig({ ...config, ...request });
        renderProgress({ phase: "completed", percent: 100, fetched: results.length, written: results.length, message: "抓取完成，输出文件回读通过。" });
        await context.storage.save(state());
        renderConfig();
        renderResults();
        setMessage(elements.anjukePropertyResultMessage, `已完成 ${results.length} 条；结果表格、地图、Excel、CSV、JSON 和原始 HTML 已写入本机。${result.skippedInvalidCount ? `已排除 ${result.skippedInvalidCount} 个非案例页面。` : ""}`, result.skippedInvalidCount ? "warn" : "ok");
        context.setStatus(`安居客抓取完成：${results.length} 条`, "ok");
      } catch (error) {
        renderProgress({ phase: "failed", percent: 0, message: "抓取失败" });
        setMessage(elements.anjukePropertyResultMessage, `抓取未完成：${error?.message || String(error)}`, "error");
        context.setStatus("安居客抓取失败", "error");
      } finally {
        running = false;
      }
    }

    async function openPath(value, label) {
      if (!value) return;
      const result = await context.sendNativeMessage({ action: "open_anjuke_property_path", path: value, outputDirectory: config.outputDirectory }, 15000);
      setMessage(elements.anjukePropertyResultMessage, result?.ok ? `已打开${label}。` : `${label}打开失败：${result?.reason || "未知错误"}`, result?.ok ? "ok" : "error");
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const root = context.document.getElementById(context.manifest.pageElementId);
        if (!root) throw new Error("ANJUKE_PROPERTY_PAGE_MISSING");
        root.dataset.moduleId = context.manifest.id;
        root.innerHTML = anjukePropertyTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/anjuke-property/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        const stored = await context.storage.load({});
        config = normalizeConfig({ ...stored, userDataDir: stored.userDataDir || DEFAULT_PROFILE_PATH });
        results = Array.isArray(stored?.results) ? stored.results : [];
        paths = { excelPath: String(stored?.excelPath || ""), csvPath: String(stored?.csvPath || ""), htmlDirectory: String(stored?.htmlDirectory || ""), resultHtmlPath: String(stored?.resultHtmlPath || ""), mapPath: String(stored?.mapPath || "") };
        renderConfig();
        renderResults();
        context.scope.on(elements.openAnjukeProperty, "click", () => context.navigate("anjuke-property"));
        context.scope.on(elements.backFromAnjukeProperty, "click", () => context.navigate("home"));
        context.scope.on(elements.importAnjukePropertyCurrentUrl, "click", importCurrentUrl);
        context.scope.on(elements.chooseAnjukePropertyOutput, "click", chooseOutput);
        context.scope.on(elements.runAnjukeProperty, "click", run);
        context.scope.on(elements.openAnjukePropertyExcel, "click", () => openPath(paths.excelPath, "Excel"));
        context.scope.on(elements.openAnjukePropertyCsv, "click", () => openPath(paths.csvPath, "CSV"));
        context.scope.on(elements.openAnjukePropertyHtml, "click", () => openPath(paths.htmlDirectory, "原始网页目录"));
        context.scope.on(elements.openAnjukePropertyResult, "click", () => openPath(paths.resultHtmlPath, "结果表格"));
        context.scope.on(elements.openAnjukePropertyMap, "click", () => openPath(paths.mapPath, "地图"));
        context.scope.on(elements.resetAnjukePropertyParams, "click", async () => {
          config = normalizeConfig({ ...DEFAULT_CONFIG, outputDirectory: config.outputDirectory, userDataDir: config.userDataDir });
          await context.storage.save(state());
          renderConfig();
          setMessage(elements.anjukePropertyParameterMessage, "已清除当前网址，请重新导入安居客当前页面。", "warn");
        });
        context.scope.on(elements.clearAnjukePropertyResults, "click", async () => {
          results = [];
          paths = { excelPath: "", csvPath: "", htmlDirectory: "", resultHtmlPath: "", mapPath: "" };
          await context.storage.save(state());
          renderResults();
          setMessage(elements.anjukePropertyResultMessage, "已清空本地结果记录，原始文件未自动删除。", "ok");
        });
        for (const id of ["anjukePropertyCaseType", "anjukePropertyMaxCases", "anjukePropertyWaitVerification", "anjukePropertyScreenshot"]) {
          context.scope.on(elements[id], "input", () => {
            config = readConfig();
            renderParameterState();
          });
          context.scope.on(elements[id], "change", () => {
            config = readConfig();
            renderParameterState();
          });
        }
      },
      activate() { renderConfig(); renderResults(); },
      deactivate() {},
      dispose() {},
    };
  },
};
