import { alibabaAuctionTemplate } from "./template.js";
import { ALIBABA_REGION_CATALOG } from "./regions.js";

const PROPERTY_TYPE_CATEGORY = {
  residential: "50025969",
  commercial: "200782003",
};
// 阿里列表页的城市路径使用 GBK 百分号编码，不能用 encodeURIComponent 代替。
const ALIBABA_CITY_PATH_SUFFIX = {
  "330100": "%BA%BC%D6%DD",
  "330200": "%C4%FE%B2%A8",
  "330300": "%CE%C2%D6%DD",
  "330400": "%BC%CE%D0%CB",
  "330500": "%BA%FE%D6%DD",
  "330600": "%C9%DC%D0%CB",
  "330700": "%BD%F0%BB%AA",
  "330800": "%E1%E9%D6%DD",
  "330900": "%D6%DB%C9%BD",
  "331000": "%CC%A8%D6%DD",
  "331100": "%C0%F6%CB%AE",
};
const DEFAULT_SOURCE_URL = "https://sf.taobao.com/list/50025969__2.htm";
const DEFAULT_CONFIG = {
  province: "浙江省",
  provinceCode: "330000",
  city: "杭州市",
  cityCode: "330100",
  district: "",
  districtCode: "",
  propertyType: "residential",
  status: "finished",
  keyword: "",
  startDate: "",
  endDate: "",
  outputDirectory: "",
  generateMap: true,
};

const ALIBABA_PARAMETER_SNAPSHOT_FIELDS = [
  "province", "provinceCode", "city", "cityCode", "district", "districtCode",
  "propertyType", "status", "keyword", "startDate", "endDate", "outputDirectory", "generateMap",
];

function parameterSnapshotMatches(config, snapshot) {
  if (!config || !snapshot) return false;
  const current = normalizeConfig(config);
  const confirmed = normalizeConfig(snapshot);
  return ALIBABA_PARAMETER_SNAPSHOT_FIELDS.every((field) => current[field] === confirmed[field]);
}

const RESULT_FIELDS = [
  "title", "province", "city", "district", "propertyType", "address", "coordinateStatus", "longitude", "latitude", "transactionTime",
  "transactionAmount", "valuationAmount", "buildingArea", "unitPrice", "floor",
  "totalFloors", "decoration", "leaseStatus", "platform", "bidCount", "verificationStatus", "url",
];

function elementMap(documentRef) {
  const ids = [
    "openAlibabaAuction", "page-alibaba-auction", "backFromAlibabaAuction",
    "alibabaAuctionProvince", "alibabaAuctionCity", "alibabaAuctionDistrict", "alibabaAuctionPropertyType",
    "alibabaAuctionStatus", "alibabaAuctionKeyword", "alibabaAuctionStartDate",
    "alibabaAuctionEndDate", "alibabaAuctionSourceUrl", "openAlibabaAuctionSource", "runAlibabaAuction",
    "saveAlibabaAuctionParams", "resetAlibabaAuctionParams", "alibabaAuctionParameterState", "alibabaAuctionParameterMessage",
    "alibabaAuctionOutputDirectory", "chooseAlibabaAuctionOutput", "alibabaAuctionGenerateMap",
    "alibabaAuctionResultCount", "alibabaAuctionResultStatus", "openAlibabaAuctionResult", "exportAlibabaAuctionExcel", "openAlibabaAuctionExcel", "openAlibabaAuctionMap", "pauseAlibabaAuction", "stopAlibabaAuction",
    "clearAlibabaAuctionResults", "alibabaAuctionResultMessage", "alibabaAuctionProgressPhase",
    "alibabaAuctionProgressPercent", "alibabaAuctionProgressBar", "alibabaAuctionProgressFetched",
    "alibabaAuctionProgressVerified", "alibabaAuctionProgressSkipped",
  ];
  return Object.fromEntries(ids.map((id) => [id, documentRef.getElementById(id)]));
}

function setMessage(element, text, kind = "") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

function usableDistricts(cityRegion) {
  return (cityRegion?.children || []).filter((item) => !["全市", "市辖区"].includes(item?.name));
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const province = ALIBABA_REGION_CATALOG.find((item) => item.code === String(source.provinceCode || "") || item.name === String(source.province || ""))
    || ALIBABA_REGION_CATALOG.find((item) => item.code === DEFAULT_CONFIG.provinceCode);
  const hasCitySelection = Object.hasOwn(source, "cityCode") || Object.hasOwn(source, "city");
  const city = province?.children?.find((item) => item.code === String(source.cityCode || "") || item.name === String(source.city || ""))
    || (!hasCitySelection && province?.code === DEFAULT_CONFIG.provinceCode ? province.children.find((item) => item.code === DEFAULT_CONFIG.cityCode) : null);
  const district = usableDistricts(city).find((item) => item.code === String(source.districtCode || "") || item.name === String(source.district || "")) || null;
  return {
    ...DEFAULT_CONFIG,
    province: province?.name || DEFAULT_CONFIG.province,
    provinceCode: province?.code || DEFAULT_CONFIG.provinceCode,
    city: city?.name || "",
    cityCode: city?.code || "",
    district: district?.name || "",
    districtCode: district?.code || "",
    propertyType: ["residential", "commercial"].includes(source.propertyType)
      ? source.propertyType
      : DEFAULT_CONFIG.propertyType,
    status: ["finished", "all"].includes(source.status) ? source.status : DEFAULT_CONFIG.status,
    keyword: String(source.keyword || "").trim().slice(0, 100),
    startDate: String(source.startDate || "").trim(),
    endDate: String(source.endDate || "").trim(),
    outputDirectory: String(source.outputDirectory || "").trim(),
    generateMap: source.generateMap !== false,
  };
}

function buildSourceUrl(config) {
  const category = PROPERTY_TYPE_CATEGORY[config.propertyType] || PROPERTY_TYPE_CATEGORY.residential;
  const citySuffix = ALIBABA_CITY_PATH_SUFFIX[String(config.cityCode || "")] || "";
  // The numeric segment is part of Alibaba's real list path as well as the
  // query-string state.  Keeping it in the first navigation prevents the
  // page from loading a generic list and then racing a second navigation
  // triggered by the status control.
  const status = config.status === "all" ? "all" : "finished";
  const statusPathSegment = status === "finished" ? "2" : "-1";
  const listPath = citySuffix
    ? `${category}__${statusPathSegment}___${citySuffix}.htm`
    : `${category}__${statusPathSegment}.htm`;
  const url = new URL(`https://sf.taobao.com/list/${listPath}`);
  const selectedProvince = ALIBABA_REGION_CATALOG.find((item) => item.code === String(config.provinceCode || ""));
  const selectedCity = selectedProvince?.children?.find((item) => item.code === String(config.cityCode || ""));
  const cityScopeCode = selectedCity?.children?.find((item) => item.name === "市辖区")?.code || "";
  const locationCode = String(citySuffix
    ? config.districtCode || ""
    : config.districtCode || cityScopeCode || config.cityCode || config.provinceCode || "").trim();
  if (locationCode) url.searchParams.set("location_code", locationCode);
  url.searchParams.set("auction_source", "0");
  url.searchParams.set("st_param", "-1");
  // 阿里列表页的时间筛选对应“开拍时间”。插件中的“成交时间起/止”作为
  // 页面筛选的起止边界传入；正式抓取时仍优先复用用户当前已加载的列表页。
  if (config.startDate) url.searchParams.set("auction_start_from", config.startDate);
  if (config.endDate) url.searchParams.set("auction_start_to", config.endDate);
  // 阿里页面用 auction_start_seg=0 表示已结束，-1 表示不限制状态。
  // 不能固定写 -1，否则侧栏选择“已结束”只会显示在结果元数据里，实际列表仍可能包含进行中案例。
  url.searchParams.set("auction_start_seg", status === "finished" ? "0" : "-1");
  return url.href;
}

function propertyTypeLabel(value) {
  return {
    residential: "住宅用房",
    commercial: "商业房",
  }[value] || value || "";
}

// 用户在阿里页面完成筛选后，插件只读取当前已经加载的这一页，不擅自继续翻页。
const MAX_DIRECT_PAGES = 1;
const MANUAL_VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

async function waitForRunResume(control, emit) {
  if (control?.stopped) throw new Error("ALIBABA_SCRAPE_STOPPED");
  if (!control?.paused) return;
  emit({
    phase: "paused",
    percent: control.percent || 0,
    message: "抓取已暂停；点击“继续抓取”后会从当前进度继续。",
  });
  await new Promise((resolve) => control.resumeResolvers.push(resolve));
  if (control?.stopped) throw new Error("ALIBABA_SCRAPE_STOPPED");
}

function extractAlibabaListPage() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const items = [];
  const seen = new Set();
  const isVisible = (element) => {
    if (!element || element.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isRecommended = (element) => {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const marker = `${current.id || ""} ${current.className || ""} ${current.getAttribute?.("aria-label") || ""}`;
      if (/recommend|guess|猜你喜欢|为您推荐|推荐更多/i.test(marker)) return true;
    }
    return false;
  };
  for (const anchor of [...document.querySelectorAll('a[href*="/sf_item/"]')].filter((item) => isVisible(item) && !isRecommended(item))) {
    const href = anchor.href || "";
    if (!href || seen.has(href)) continue;
    let text = clean(anchor.innerText || anchor.textContent || "");
    let parent = anchor.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
      const parentText = clean(parent.innerText || parent.textContent || "");
      if (parentText.length > text.length && parentText.length <= 1200) text = parentText;
      if (parentText.length <= 1200 && /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|距开始|距结束|成交价|起拍价/.test(parentText)) break;
    }
    if (!text) continue;
    seen.add(href);
    items.push({ href, text });
  }
  const body = document.body?.innerText || "";
  const totalMatch = body.match(/共找到\s*([\d,]+)\s*条/);
  return {
    url: location.href,
    title: document.title,
    total: totalMatch ? totalMatch[1] : "",
    items,
    pageText: clean(body.slice(0, 1200)),
  };
}

function extractAlibabaDetailPage() {
  const clean = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const coordinate = (value, minimum, maximum) => {
    const number = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
  };
  const coordinatePair = (longitude, latitude, source) => {
    const lng = coordinate(longitude, 70, 140);
    const lat = coordinate(latitude, 3, 55);
    return lng !== null && lat !== null ? { longitude: lng, latitude: lat, coordinateSource: source } : null;
  };
  const coordinateFromText = (value, source) => {
    const text = String(value || "");
    const patterns = [
      /(?:longitude|lng|lon|经度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)["']?["'\s,;，；\]}]{0,80}(?:latitude|lat|纬度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i,
      /(?:latitude|lat|纬度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)["']?["'\s,;，；\]}]{0,80}(?:longitude|lng|lon|经度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i,
      /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    ];
    for (const [index, pattern] of patterns.entries()) {
      const match = text.match(pattern);
      if (!match) continue;
      const pair = index === 1
        ? coordinatePair(match[2], match[1], source)
        : coordinatePair(match[1], match[2], source);
      if (pair) return pair;
    }
    return null;
  };
  const extractBuildingArea = (value) => {
    const text = clean(value).replace(/[，]/g, ",").replace(/[：]/g, ":");
    const patterns = [
      /(?:房屋|房产|不动产|建筑物)?(?:总)?建筑面积\s*(?:[（(][^）)]{0,20}[）)])?\s*(?:(?:约|大约)\s*)?(?:为|是|等于|合计|共计)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
      /(?:房屋|房产|不动产|建筑物)?(?:总)?建筑面积\s*[（(]\s*(?:平方米|平米|㎡|m²|m2|平方公尺)\s*[）)]\s*(?:(?:约|大约)\s*)?(?:为|是|等于|合计|共计)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)/i,
      /(?:房屋|房产|不动产|建筑物)?(?:建筑|房屋|房产|产权)面积\s*(?:约|大约|合计|共计|为|是|等于)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
      /(?:房屋|房产|不动产|建筑物)?(?:总)?建筑面积\s*(?:[（(][^）)]{0,20}[）)])?\s*(?:(?:约|大约|合计|共计)\s*)?(?:为|是|等于)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?=$|[,。；;])/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].replace(/\s+/g, " ").trim();
    }
    return "";
  };
  let coordinates = null;
  const elementsWithCoordinates = document.querySelectorAll(
    "[data-lng], [data-lat], [data-longitude], [data-latitude], [longitude], [latitude], [经度], [纬度]",
  );
  for (const element of elementsWithCoordinates) {
    coordinates = coordinatePair(
      element.getAttribute("data-lng") || element.getAttribute("data-longitude") || element.getAttribute("longitude") || element.getAttribute("经度"),
      element.getAttribute("data-lat") || element.getAttribute("data-latitude") || element.getAttribute("latitude") || element.getAttribute("纬度"),
      "detail-dom",
    );
    if (coordinates) break;
  }
  if (!coordinates) {
    for (const element of document.querySelectorAll("iframe[src], a[href]")) {
      coordinates = coordinateFromText(element.getAttribute("src") || element.getAttribute("href"), "detail-url");
      if (coordinates) break;
    }
  }
  if (!coordinates) {
    for (const script of document.scripts) {
      coordinates = coordinateFromText(script.textContent, "detail-script");
      if (coordinates) break;
    }
  }
  const body = document.body?.innerText || "";
  const scriptText = [...document.scripts].map((script) => script.textContent || "").join("\n");
  const detailText = `${body}\n${scriptText}`;
  const attachments = [];
  const attachmentSeen = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.href || "";
    const name = clean(anchor.innerText || anchor.textContent || "评估报告附件");
    if (!href || (!/download_attach\.do/i.test(href) && !/\.pdf(?:$|[?#])/i.test(href))) continue;
    if (attachmentSeen.has(href)) continue;
    attachmentSeen.add(href);
    attachments.push({ name: name.slice(0, 120), href });
  }
  const normalizeFloorValue = (value) => {
    const normalized = clean(value).replace(/第/g, "").trim();
    if (/^(顶|底|中|高|低)(层)?$/.test(normalized)) return normalized.endsWith("层") ? normalized : normalized + "层";
    return normalized.replace(/([\d一二三四五六七八九十百零])\s*[层楼]$/, "$1").trim();
  };
  const readLabeledValue = (labels) => {
    const wanted = labels.map((label) => String(label));
    const valueFromText = (value) => {
      const text = clean(value);
      if (!text || text.length > 120) return "";
      const label = wanted.find((item) => text === item || text.startsWith(item));
      if (!label || text === label) return "";
      return text.slice(label.length).replace(/^[\s:：-]*(?:为|是)?\s*/, "").trim();
    };
    const valueFromNode = (node) => valueFromText(node?.innerText || node?.textContent || "");
    for (const node of document.querySelectorAll("th,td,dt,dd,label,span,div,p")) {
      const text = clean(node.innerText || node.textContent || "");
      if (!text || text.length > 120) continue;
      const inline = valueFromText(text);
      if (inline) return inline;
      if (!wanted.includes(text)) continue;
      const row = node.closest("tr");
      const cells = row ? [...row.children] : [];
      const cellIndex = cells.indexOf(node.closest("th,td"));
      const candidates = [
        cellIndex >= 0 ? cells[cellIndex + 1] : null,
        node.nextElementSibling,
        node.parentElement?.nextElementSibling,
        ...(node.parentElement ? [...node.parentElement.children].slice([...node.parentElement.children].indexOf(node) + 1) : []),
      ];
      for (const candidate of candidates) {
        const value = valueFromNode(candidate);
        if (value && !wanted.includes(value)) return value;
      }
    }
    const lines = body.split(/\r?\n/).map(clean).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const inline = valueFromText(line);
      if (inline) return inline;
      if (wanted.includes(line) && lines[index + 1] && !wanted.includes(lines[index + 1])) return lines[index + 1];
    }
    return "";
  };
  const heading = document.querySelector("h1")?.innerText || "";
  const statusText = detailText.match(/(?:本场|拍卖)?已结束|本场已流拍|本场已撤回|本场已中止|报名截止|预计[^\n]{0,30}结束/gi) || [];
  const locationMatch = body.match(/标的物位置\s*[：:]?\s*([\s\S]{0,180}?)(?:地图标注仅供参考|标的物介绍|房屋用途)/);
  const usageMatch = body.match(/房屋用途及?\s*土地性质\s*[：:]?\s*([\s\S]{0,140}?)(?:钥匙|使用情况|拍卖权利限制情况|建筑面积)/);
  const buildingArea = extractBuildingArea(detailText);
  const decorationMatch = detailText.match(/(?:装修及其他介绍|装修情况|装修)\s*[：:\s]+([^\n\r|；;]{1,40})/i);
  const leaseMatch = detailText.match(/(?:租赁情况|租赁状态|是否有租赁|租赁)\s*[：:\s]+([^\n\r|；;]{1,60})/i);
  const floorValue = readLabeledValue(["所在楼层", "所在楼层（层）", "所在楼层(层)", "房屋所在楼层", "所在层", "房屋楼层", "楼层"]);
  const totalFloorsValue = readLabeledValue(["建筑总层数", "房屋总层数", "总层数", "总楼层", "楼层数"]);
  const floorMatch = body.match(/(?:位于第|所在楼层|所在层|房屋所在楼层|房屋楼层|楼层)\s*(?:为|是|位于|在|：|:|=)?\s*([^，。；;()（）\n]{1,30}?)\s*层/);
  const totalFloorMatch = body.match(/(?:建筑总层数|房屋总层数|总层数|总楼层|楼层数|共)\s*(?:为|是|约|共|：|:|=)?\s*(\d+)\s*层?/);
  const transactionMatch = body.match(/(?:成交价|拍下价|最终成交价|成交金额)\s*[：:]?\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)\s*(?:元)?/);
  const valuationMatch = body.match(/(?:评估价|评估总价|议价价)\s*[：:]?\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)\s*(?:元)?/);
  const timeMatch = body.match(/(?:结束时间|成交时间|交易时间)\s*[：:]?\s*([0-9]{4}[\/-][0-9]{1,2}[\/-][0-9]{1,2}(?:\s+[0-9:]{4,8})?)/);
  const bidMatch = body.match(/(?:竞买记录|应买记录|出价次数|出价记录)\s*[：:]?\s*[（(]?\s*(\d+)\s*(?:次出价)?\s*[）)]?/) || body.match(/(\d+)\s*次出价/);
  return {
    url: location.href,
    title: clean(heading),
    statusText: statusText.map(clean).slice(0, 5),
    location: clean(locationMatch?.[1] || body.match(/标的物位置\s*[：:]?\s*([^\n]{1,180})/)?.[1] || ""),
    usage: clean(usageMatch?.[1] || body.match(/房屋用途[^\n]{0,80}/)?.[0] || ""),
    buildingArea,
    floor: normalizeFloorValue(floorValue || floorMatch?.[1] || ""),
    totalFloors: clean(totalFloorsValue || totalFloorMatch?.[1] || ""),
    transactionAmount: transactionMatch?.[1] || "",
    valuationAmount: valuationMatch?.[1] || "",
    transactionTime: timeMatch?.[1] || "",
    bidCount: bidMatch?.[1] || "",
    longitude: coordinates?.longitude ?? null,
    latitude: coordinates?.latitude ?? null,
    coordinateSource: coordinates?.coordinateSource || "",
    hasSoldText: /成交价|竞价结果确认书|竞买记录/.test(body),
    hasInvalidStatus: statusText.some((value) => /流拍|撤回|中止/.test(value)),
    hasEndedText: /(?:本场|拍卖)?已结束|成交价|竞价结果确认书/.test(detailText),
    decoration: clean(decorationMatch?.[1] || ""),
    leaseStatus: clean(leaseMatch?.[1] || ""),
    pageText: body.slice(0, 12000),
    attachments: attachments.slice(0, 8),
  };
}

function directCanonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.searchParams.delete("track_id");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
}

function directParseAmount(value) {
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function directParseCoordinate(value, minimum, maximum) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function directChineseFloorNumber(value) {
  const text = String(value || "").trim();
  if (!text || /^\d+$/.test(text)) return text;
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^[一二两三四五六七八九十百零]+$/.test(text)) {
    if (text === "十") return "10";
    const tenIndex = text.indexOf("十");
    if (tenIndex >= 0) {
      const tens = tenIndex === 0 ? 1 : digits[text[tenIndex - 1]];
      const ones = tenIndex === text.length - 1 ? 0 : digits[text[tenIndex + 1]];
      if (Number.isInteger(tens) && Number.isInteger(ones)) return String(tens * 10 + ones);
    }
    if (text.length === 1 && Number.isInteger(digits[text])) return String(digits[text]);
  }
  return text;
}

function directNormalizeFloorValue(value) {
  let normalized = String(value || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/第/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^(?:总|共|建筑|层数|楼层|总层数|总楼层)$/.test(normalized)) return "";
  normalized = normalized.replace(/(地下|地上|负)?([一二两三四五六七八九十百零]+)/g, (match, prefix, number) => `${prefix || ""}${directChineseFloorNumber(number)}`);
  if (/^(顶|底|中|高|低)(层)?$/.test(normalized)) return normalized.endsWith("层") ? normalized : `${normalized}层`;
  return normalized.replace(/[层楼]\s*$/, "").trim();
}

function directNormalizeTotalFloorValue(value) {
  const original = String(value || "").replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim();
  if (!original) return "";
  const hasUnit = /[层楼]/.test(original);
  const numberText = original.replace(/[层楼]/g, "").replace(/^(?:共|约|为|是)\s*/, "").trim();
  const number = directChineseFloorNumber(numberText);
  return /^\d+$/.test(number) ? `${number}${hasUnit ? "层" : ""}` : original;
}

function directExtractBuildingAreaFromText(value) {
  const text = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /(?<!项目)(?<!总)(?:房产证|证载|房屋|房产|不动产|建筑物|产权)?建筑面积\s*(?:[（(][^）)]{0,20}[）)])?\s*(?:(?:约|大约)\s*)?(?:为|是|等于|合计|共计)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
    /(?<!项目)(?<!总)(?:房产证|证载|房屋|房产|不动产|建筑物|产权)?建筑面积\s*[（(]\s*(?:平方米|平米|㎡|m²|m2|平方公尺)\s*[）)]\s*(?:(?:约|大约)\s*)?(?:为|是|等于|合计|共计)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)/i,
    /(?<!项目)(?<!总)(?:房产证|证载|房屋|房产|不动产|建筑物|产权)?建筑面积\s*(?:约|大约|合计|共计|为|是|等于)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
    /(?<!项目)(?<!总)(?:房产证|证载|房屋|房产|不动产|建筑物|产权)?建筑面积\s*(?:[（(][^）)]{0,20}[）)])?\s*(?:(?:约|大约|合计|共计)\s*)?(?:为|是|等于)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?=$|[,。；;])/i,
    /(?:房屋|房产|不动产|建筑物)?(?:建筑|房屋|房产|产权)面积\s*(?:约|大约|合计|共计|为|是|等于)?\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
    /(?:^|[；;。\n]|\d[、.])\s*面积\s*[:=\-]?\s*([\d][\d,，\s]*(?:\.\d+)?)\s*(?:平方米|平米|㎡|m²|m2|平方公尺)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return directParseAmount(match[1]);
  }
  return null;
}

function directExtractFloorFieldsFromText(value) {
  const lines = String(value || "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const floorLabels = ["所在楼层", "所在楼层（层）", "所在楼层(层)", "房屋所在楼层", "所在层次", "所在层数", "所在层", "房屋楼层", "楼层"];
  const totalLabels = ["建筑总层数", "房屋总层数", "总层数", "总楼层", "楼层数"];
  const read = (labels) => {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const label = labels.find((item) => line === item || line.startsWith(`${item}：`) || line.startsWith(`${item}:`) || line.startsWith(`${item}为`) || line.startsWith(`${item}是`));
      if (!label) continue;
      const inline = line.slice(label.length).replace(/^[\s:：-]*(?:为|是)?\s*/, "").trim();
      if (inline) return inline;
      if (lines[index + 1] && !labels.includes(lines[index + 1])) return lines[index + 1];
    }
    return "";
  };
  const normalizeFloor = directNormalizeFloorValue;
  const text = lines.join(" ");
  const pair = text.match(/(?:所在楼层|所在层|房屋所在楼层|房屋楼层|楼层)\s*(?:[\/／]\s*(?:建筑)?(?:总层数|总楼层))?\s*[:=：]?\s*([^\/／，,]+?)\s*[\/／]\s*(\d+)\s*层?/);
  const floorFromSentence = text.match(/(?:所在楼层|所在层次|所在层数|所在层|房屋所在楼层|房屋楼层)\s*(?:为|是|位于|在|[:=：])?\s*([^，,。；;()（）\n]+?)\s*层/);
  const floorFromBareLabel = text.match(/(?:所在层次|所在层数)\s*(?:为|是|位于|在|[:=：])?\s*(?:第\s*)?(\d+(?:\s*[至\-—~～]\s*\d+)?)(?!\s*层)/);
  const floorFromPosition = text.match(/(?:位于|处于)[^，,。；;()（）\n]{0,30}?(?:第\s*)?([负地下上第\d一二两三四五六七八九十百零]+(?:\s*[至\-—~～]\s*[负地下上第\d一二两三四五六七八九十百零]+)?)\s*层/);
  const totalFromSentence = text.match(/(?:建筑物|建筑|房屋)?(?:地上|地下)?总(?:层数|楼层)\s*(?:为|是|约|共|[:=：])?\s*([\d一二两三四五六七八九十百零]+)\s*(层)?/)
    || text.match(/共\s*([\d一二两三四五六七八九十百零]+)\s*(层)?/);
  const floor = normalizeFloor(pair?.[1] || floorFromSentence?.[1] || floorFromPosition?.[1] || read(floorLabels));
  const floorFallback = floor || normalizeFloor(floorFromBareLabel?.[1] || "");
  const totalRaw = pair?.[2] ? pair[2] : (totalFromSentence?.[1] ? `${totalFromSentence[1]}${totalFromSentence[2] || ""}` : read(totalLabels));
  const totalFloors = directNormalizeTotalFloorValue(totalRaw);
  return { floor: floorFallback, totalFloors };
}

function directNormalizeDate(value) {
  const match = String(value || "").match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(value || "").trim();
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function directFirstCity(value) {
  const match = String(value || "").match(/(?:浙江省)?\s*([^省市县区]{1,16})市/);
  return match?.[1] ? `${match[1]}市` : "";
}

function directFirstDistrict(value, request = {}) {
  const text = String(value || "");
  if (request.district && text.includes(request.district)) return request.district;
  const province = ALIBABA_REGION_CATALOG.find((item) => item.name === request.province);
  const city = province?.children?.find((item) => item.name === request.city);
  return usableDistricts(city)
    .sort((left, right) => String(right.name || "").length - String(left.name || "").length)
    .find((item) => text.includes(item.name))?.name || "";
}

function stripLocationPrefixes(value, prefixes) {
  const original = String(value || "").replace(/\s+/g, " ").trim();
  let result = original;
  const names = [...new Set(prefixes.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (let index = 0; index < 6; index += 1) {
    const prefix = names.find((name) => result.startsWith(name));
    if (!prefix) break;
    result = result.slice(prefix.length).replace(/^[\s,，、;；:：-]+/, "").trim();
  }
  return result || original;
}

function directNormalizeLease(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/无租赁|未出租|空置|无承租/.test(text)) return "空置";
  if (/带租|出租|租赁期限|租期|租金/.test(text)) return "出租中";
  if (/占有|占用|未腾空/.test(text)) return "占用";
  return text;
}

function directFirstPropertyType(value) {
  const text = String(value || "");
  if (text.includes("住宅用房") || text.includes("住宅房")) return "住宅用房";
  if (text.includes("商业房") || text.includes("商业用房")) return "商业房";
  return "";
}

function directInferFloorFromPropertyText(value) {
  const match = String(value || "").match(/(?:^|[^\d])(\d{3,4})\s*(?:室|号)(?!\d)/);
  if (!match) return "";
  const floor = match[1].slice(0, -2).replace(/^0+/, "");
  return floor || "0";
}

function directParseDetail(detail, request) {
  const transactionAmount = directParseAmount(detail.transactionAmount);
  const valuationAmount = directParseAmount(detail.valuationAmount);
  const buildingArea = directParseAmount(detail.buildingArea) || directExtractBuildingAreaFromText(`${detail.buildingArea || ""}\n${detail.pageText || ""}`);
  const floorFields = directExtractFloorFieldsFromText(detail.pageText);
  const inferredFloor = directInferFloorFromPropertyText([detail.title, detail.location].filter(Boolean).join(" "));
  const bidCount = Number.isInteger(Number(detail.bidCount)) ? Number(detail.bidCount) : 0;
  const finished = detail.hasSoldText === true && detail.hasInvalidStatus !== true
    && (request.status !== "finished" || detail.hasEndedText === true)
    && Boolean(transactionAmount) && bidCount > 0;
  const rawLocation = String(detail.location || "").trim();
  const city = directFirstCity(rawLocation) || request.city || "";
  const district = directFirstDistrict(rawLocation, request);
  const location = stripLocationPrefixes(rawLocation, [request.province, city, district]);
  const propertyType = directFirstPropertyType(detail.usage) || propertyTypeLabel(request.propertyType);
  return {
    title: String(detail.title || "").trim(),
    province: request.province || "浙江省",
    city,
    district,
    propertyType,
    address: location,
    coordinateStatus: directParseCoordinate(detail.longitude, 70, 140) !== null && directParseCoordinate(detail.latitude, 3, 55) !== null ? "已定位（详情页坐标）" : "未定位（详情页未返回坐标）",
    coordinateSource: detail.coordinateSource || "",
    longitude: directParseCoordinate(detail.longitude, 70, 140),
    latitude: directParseCoordinate(detail.latitude, 3, 55),
    transactionTime: directNormalizeDate(detail.transactionTime),
    transactionAmount,
    valuationAmount,
    buildingArea,
    unitPrice: transactionAmount && buildingArea ? Math.round((transactionAmount / buildingArea) * 100) / 100 : null,
    floor: directNormalizeFloorValue(floorFields.floor || detail.floor || inferredFloor),
    totalFloors: directParseAmount(directNormalizeTotalFloorValue(floorFields.totalFloors || detail.totalFloors)),
    decoration: String(detail.decoration || "").trim(),
    leaseStatus: directNormalizeLease(detail.leaseStatus),
    platform: "阿里拍卖",
    bidCount,
    verificationStatus: finished ? "详情核验通过" : "未通过成交核验",
    url: directCanonicalUrl(detail.url),
    valid: finished,
  };
}

function directMatchesRequest(record, request) {
  const keyword = String(request.keyword || "").trim();
  const searchable = `${record.title || ""} ${record.province || ""} ${record.city || ""} ${record.district || ""} ${record.address || ""}`;
  if (keyword && !searchable.includes(keyword)) return false;
  const expectedProperty = propertyTypeLabel(request.propertyType);
  if (expectedProperty && record.propertyType && record.propertyType !== expectedProperty) return false;
  const date = String(record.transactionTime || "").slice(0, 10);
  if (request.startDate && (!date || date < request.startDate)) return false;
  if (request.endDate && (!date || date > request.endDate)) return false;
  return true;
}

function directPageLooksBlocked(value) {
  const text = `${value?.title || ""} ${value?.pageText || ""} ${value?.url || ""}`;
  if (/验证码|滑块|安全验证|访问验证|captcha|punish/i.test(text)) return "ALIBABA_VERIFICATION_REQUIRED";
  if (/登录淘宝|请登录|会员登录|扫码登录|登录页面|login\.taobao|\/login(?:[/?]|$)|login_jump/i.test(text)) return "ALIBABA_LOGIN_REQUIRED";
  return "";
}

function directListPageUrl(sourceUrl, page) {
  const url = new URL(sourceUrl);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return url.href;
}

function isAlibabaListPage(value) {
  try {
    const url = new URL(String(value || ""));
    return url.hostname === "sf.taobao.com" && /^\/list\//.test(url.pathname);
  } catch {
    return false;
  }
}

function listPageMatchesRequest(value, request) {
  if (!isAlibabaListPage(value)) return false;
  try {
    const current = new URL(value);
    const expected = new URL(buildSourceUrl(request));
    if (current.pathname !== expected.pathname) return false;
    for (const key of ["location_code", "auction_start_from", "auction_start_to", "auction_start_seg"]) {
      if ((current.searchParams.get(key) || "") !== (expected.searchParams.get(key) || "")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function statusFilterLabels(status) {
  return status === "finished" ? ["已结束"] : ["不限", "全部", "全部状态"];
}

function statusFilterMatchesRequest(value, status) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  return statusFilterLabels(status).some((label) => text === label || text.includes(label));
}

function directCandidateInScope(item, request) {
  const text = String(item?.text || "");
  if (request.status === "finished" && /距开始|距开拍|距结束|尚未开始|未开始|即将开始|立即报名|报名中|竞买中|进行中|正在拍卖|竞价中|拍卖中/.test(text)) {
    return false;
  }
  const dates = text.match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [];
  if ((request.startDate || request.endDate) && dates.length) {
    return dates.some((value) => {
      const date = value.replaceAll("/", "-");
      return (!request.startDate || date >= request.startDate) && (!request.endDate || date <= request.endDate);
    });
  }
  return true;
}

function directPageBeforeRequestedRange(items, request) {
  if (request.status !== "finished" || !request.startDate) return false;
  const dates = (Array.isArray(items) ? items : [])
    .flatMap((item) => String(item?.text || "").match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [])
    .map((value) => value.replaceAll("/", "-"));
  return dates.length > 0 && dates.every((date) => date < request.startDate);
}

function hasDirectCoordinates(item) {
  const longitude = Number(String(item?.longitude ?? "").replace(/,/g, "").trim());
  const latitude = Number(String(item?.latitude ?? "").replace(/,/g, "").trim());
  return Number.isFinite(longitude) && longitude >= 70 && longitude <= 140
    && Number.isFinite(latitude) && latitude >= 3 && latitude <= 55;
}

function resultGenerationProgress(results, request = {}, counts = {}) {
  const missingCoordinateCount = request.generateMap === false
    ? 0
    : (Array.isArray(results) ? results : []).filter((item) => !hasDirectCoordinates(item)).length;
  return {
    phase: request.generateMap === false ? "generating_results" : "locating_coordinates",
    percent: 99,
    message: request.generateMap === false
      ? "正在生成结果页"
      : `详情核验完成，正在定位 ${missingCoordinateCount} 条缺失坐标并生成结果页/地图…`,
    ...counts,
  };
}

function waitForCurrentTab(chromeRef, tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      chromeRef.tabs.onUpdated.removeListener(onUpdated);
      window.setTimeout(resolve, 900);
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    chromeRef.tabs.onUpdated.addListener(onUpdated);
  });
}

async function navigateCurrentTab(chromeRef, tab, url) {
  if (!tab?.id) throw new Error("ALIBABA_CURRENT_TAB_UNAVAILABLE");
  if (tab.url === url) {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    return await chromeRef.tabs.get(tab.id);
  }
  const loaded = waitForCurrentTab(chromeRef, tab.id);
  await chromeRef.tabs.update(tab.id, { active: true, url });
  await loaded;
  return await chromeRef.tabs.get(tab.id);
}

async function executeCurrentTab(chromeRef, tabId, func, args = []) {
  const output = await chromeRef.scripting.executeScript({ target: { tabId }, func, args });
  return output?.[0]?.result || {};
}

async function fetchAlibabaAttachmentBuffers(attachments) {
  const allowed = (value) => {
    try {
      const url = new URL(String(value || ""));
      const hostname = url.hostname.toLowerCase();
      return /^https?:$/.test(url.protocol)
        && (hostname === "sf.taobao.com" || hostname.endsWith(".taobao.com")
          || hostname.endsWith(".alicdn.com") || hostname.endsWith(".alibaba-inc.com"));
    } catch {
      return false;
    }
  };
  const output = [];
  for (const attachment of (Array.isArray(attachments) ? attachments : []).slice(0, 3)) {
    const href = String(attachment?.href || "").trim();
    if (!href || !allowed(href)) continue;
    try {
      const response = await fetch(href, { credentials: "include" });
      if (!response.ok) {
        output.push({ name: attachment?.name || "PDF", href, error: `HTTP_${response.status}` });
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length <= 0 || bytes.length > 20 * 1024 * 1024) {
        output.push({ name: attachment?.name || "PDF", href, error: "ALIBABA_ATTACHMENT_TOO_LARGE" });
        continue;
      }
      const header = String.fromCharCode(...bytes.subarray(0, 4));
      if (header !== "%PDF") {
        output.push({ name: attachment?.name || "PDF", href, error: "ALIBABA_ATTACHMENT_NOT_PDF" });
        continue;
      }
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      }
      output.push({ name: attachment?.name || "PDF", href, base64: btoa(binary), size: bytes.length });
    } catch {
      output.push({ name: attachment?.name || "PDF", href, error: "ALIBABA_ATTACHMENT_FETCH_FAILED" });
    }
  }
  return output;
}

async function executeCurrentPageMain(chromeRef, tabId, func, args = []) {
  const output = await chromeRef.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args,
  });
  return output?.[0]?.result || [];
}

async function fetchAlibabaAttachmentBuffersFromBrowser(chromeRef, attachments) {
  const tab = await chromeRef.tabs.create({ url: "https://sf.taobao.com/", active: false });
  if (!tab?.id) throw new Error("ALIBABA_ATTACHMENT_TAB_UNAVAILABLE");
  try {
    await waitForCurrentTab(chromeRef, tab.id);
    return await executeCurrentPageMain(chromeRef, tab.id, fetchAlibabaAttachmentBuffers, [attachments]);
  } finally {
    try {
      await chromeRef.tabs.remove(tab.id);
    } catch {
      // The temporary same-origin attachment tab is best-effort cleaned up.
    }
  }
}

// 阿里列表页不会因为 URL 中带有 auction_start_seg 就把自定义下拉框回显出来。
// 真实控件是 li.auction-sort-select 内的隐藏 select#J_AuctionStatusSort、
// 动态 ID 的 [role=button][aria-haspopup] 触发器和同 ID 的 [role=menu] 弹层。
// 这里必须操作该组件本身并回读可见触发器与原生选项，不能用 URL/OCR 代替回读。
async function synchronizeAlibabaAuctionStatus(requestedStatus) {
  const desired = requestedStatus === "finished" ? "finished" : "all";
  const targetLabels = desired === "finished" ? ["已结束"] : ["不限", "全部", "全部状态"];
  const CONTROL_WAIT_TIMEOUT_MS = 8000;
  const CONTROL_POLL_INTERVAL_MS = 100;
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const compact = (value) => clean(value).replace(/\s+/g, "");
  const isTargetLabel = (value) => targetLabels.some((label) => compact(value) === compact(label));
  const expectedAuctionStartSegment = desired === "finished" ? "0" : "-1";
  const isVisible = (element) => {
    if (!element || element.closest?.('[aria-hidden="true"]')) return false;
    if (element.getAttribute?.("aria-hidden") === "true") return false;
    const className = String(element.className || "");
    if (/\b(?:bf-popupmenu-hidden|bf-menu-hidden)\b/.test(className)) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(element) : {};
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  };
  const textOf = (element) => clean(element?.innerText || element?.textContent || "");
  const triggerLabel = (trigger) => {
    if (!trigger) return "";
    const content = trigger.querySelector?.(".bf-select-content")
      || trigger.querySelector?.('[id^="ks-content-"]');
    return textOf(content) || textOf(trigger);
  };
  const selectedOptionLabel = (select) => {
    if (!select) return "";
    const selected = select.selectedOptions?.[0]
      || [...(select.options || [])].find((option) => option.selected);
    return textOf(selected) || clean(select.value);
  };
  const findMenu = (trigger) => {
    const menuId = trigger?.getAttribute?.("aria-haspopup");
    if (menuId) {
      const linked = document.getElementById(menuId);
      if (linked) return linked;
    }
    return [...document.querySelectorAll('[role="menu"]')].find((menu) => isVisible(menu)) || null;
  };
  const findStatusControls = () => {
    const select = document.querySelector("#J_AuctionStatusSort");
    const row = select?.closest?.("li") || select?.parentElement || null;
    const rowTrigger = [...(row?.querySelectorAll?.('[role="button"][aria-haspopup], [role="combobox"]') || [])]
      .find((element) => isVisible(element)) || null;
    const fallbackTrigger = [...document.querySelectorAll('[role="button"][aria-haspopup], [role="combobox"]')]
      .find((element) => isVisible(element) && (compact(triggerLabel(element)) === "拍卖状态" || isTargetLabel(triggerLabel(element)))) || null;
    const trigger = rowTrigger || fallbackTrigger;
    const menu = findMenu(trigger);
    const nativeOptions = [...(select?.options || [])];
    const nativeOption = nativeOptions.find((option) => targetLabels.some((label) => compact(textOf(option)) === compact(label)));
    return { select, row, trigger, menu, nativeOptions, nativeOption };
  };
  const waitForStatusControls = async () => {
    const startedAt = Date.now();
    let controls = findStatusControls();
    while ((!controls.select || !controls.trigger || !controls.nativeOption)
      && Date.now() - startedAt < CONTROL_WAIT_TIMEOUT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, CONTROL_POLL_INTERVAL_MS));
      controls = findStatusControls();
    }
    return controls;
  };
  const state = (controls = findStatusControls()) => ({
    triggerLabel: triggerLabel(controls.trigger),
    selectLabel: selectedOptionLabel(controls.select),
    triggerExpanded: controls.trigger?.getAttribute?.("aria-expanded") || "",
    triggerId: controls.trigger?.id || "",
    selectId: controls.select?.id || "",
    menuId: controls.trigger?.getAttribute?.("aria-haspopup") || controls.menu?.id || "",
    hasTrigger: Boolean(controls.trigger),
    hasSelect: Boolean(controls.select),
  });
  const matchesTarget = (current) => {
    // The visible custom trigger is the authoritative page control. If the
    // hidden native select exists, it must agree with it as a second signal.
    // Alibaba intentionally keeps the custom trigger as the placeholder
    // “拍卖状态” when the native select is at “不限”; that is the real
    // representation of the all-status state. Finished still requires both
    // visible and native labels to be “已结束”.
    const triggerMatches = !current.hasTrigger
      || isTargetLabel(current.triggerLabel)
      || (desired === "all" && compact(current.triggerLabel) === "拍卖状态" && isTargetLabel(current.selectLabel));
    const selectMatches = !current.hasSelect || isTargetLabel(current.selectLabel);
    return triggerMatches && selectMatches;
  };
  const ensureStatusUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("auction_start_seg", expectedAuctionStartSegment);
      window.history.replaceState(window.history.state, "", url.href);
      const finalUrl = new URL(window.location.href);
      const actual = finalUrl.searchParams.get("auction_start_seg") || "";
      if (actual !== expectedAuctionStartSegment) {
        return {
          ok: false,
          reason: `阿里页面状态已回读，但 URL 的 auction_start_seg 仍为“${actual || "空"}”，目标应为“${expectedAuctionStartSegment}”。`,
        };
      }
      return { ok: true, auctionStartSegment: actual, url: finalUrl.href };
    } catch (error) {
      return { ok: false, reason: `无法将阿里页面 URL 状态统一为“${expectedAuctionStartSegment}”：${error?.message || String(error)}` };
    }
  };
  const success = (changed, current, eventSequence = []) => ({
    ...(() => {
      const urlState = ensureStatusUrl();
      const base = {
        ok: urlState.ok,
        changed,
        state: desired,
        label: isTargetLabel(current.triggerLabel) ? current.triggerLabel : current.selectLabel || current.triggerLabel,
        controlFound: true,
        controlId: current.triggerId,
        selectId: current.selectId,
        menuId: current.menuId,
        readback: {
          triggerLabel: current.triggerLabel,
          selectLabel: current.selectLabel,
        },
        eventSequence,
        urlState,
      };
      return urlState.ok
        ? base
        : {
          ...base,
          errorCode: "ALIBABA_STATUS_URL_SYNC_FAILED",
          reason: urlState.reason,
        };
    })(),
  });
  const controls = await waitForStatusControls();
  if (!controls.select || !controls.trigger) {
    return { ok: false, changed: false, errorCode: "ALIBABA_STATUS_CONTROL_NOT_FOUND", reason: "未找到阿里页面的“拍卖状态”控件。请确认列表页已加载完成后重试。" };
  }
  if (!controls.nativeOption) {
    return { ok: false, changed: false, errorCode: "ALIBABA_STATUS_OPTION_NOT_FOUND", reason: `阿里页面没有找到“${targetLabels[0]}”选项。` };
  }
  const before = state(controls);
  if (matchesTarget(before)) return success(false, before);

  const dispatched = [];
  const dispatchCompleteClick = (element, focus = false) => {
    if (!element?.dispatchEvent) return;
    const dispatch = (type, pointer = false) => {
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: type === "click" || type === "mouseup" ? 1 : 0,
        button: 0,
        buttons: /down|move/.test(type) ? 1 : 0,
      };
      const EventConstructor = pointer && typeof window.PointerEvent === "function"
        ? window.PointerEvent
        : typeof window.MouseEvent === "function"
          ? window.MouseEvent
          : window.Event;
      element.dispatchEvent(new EventConstructor(type, init));
      dispatched.push(type);
    };
    dispatch("pointerdown", true);
    dispatch("mousedown");
    if (focus && typeof element.focus === "function") {
      element.focus();
      dispatched.push("focus");
    }
    dispatch("pointerup", true);
    dispatch("mouseup");
    dispatch("click");
  };
  let trigger = controls.trigger;
  let select = controls.select;
  let menu = controls.menu;
  const menuIsOpen = () => {
    const currentControls = findStatusControls();
    return currentControls.trigger?.getAttribute?.("aria-expanded") === "true"
      || Boolean(currentControls.menu && isVisible(currentControls.menu))
      || Boolean(menu && isVisible(menu));
  };
  if (!menuIsOpen()) {
    trigger = findStatusControls().trigger || trigger;
    dispatchCompleteClick(trigger, true);
  }

  const waitForOption = async (timeoutMs = 1600) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const currentControls = findStatusControls();
      const currentMenu = currentControls.menu || findMenu(currentControls.trigger || trigger) || menu;
      const option = [...(currentMenu?.querySelectorAll?.('[role="menuitem"]') || [])]
        .find((item) => targetLabels.some((label) => compact(textOf(item)) === compact(label)));
      if (option && isVisible(currentMenu) && isVisible(option)) return option;
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    return null;
  };
  if (trigger) {
    const option = await waitForOption();
    if (!option) {
      return { ok: false, changed: false, errorCode: "ALIBABA_STATUS_OPTION_NOT_FOUND", reason: `阿里页面没有找到“${targetLabels[0]}”选项，或状态弹层未成功打开。` };
    }
    dispatchCompleteClick(option);
  } else {
    // Fallback for a future native-select variant. The real Alibaba page uses
    // the custom trigger branch above, so this path still requires readback.
    select.value = controls.nativeOption.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 1800) {
    const current = state();
    if (matchesTarget(current)) return success(true, current, dispatched);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  const after = state();
  return {
    ok: false,
    changed: true,
    errorCode: "ALIBABA_STATUS_READBACK_FAILED",
    reason: `已操作阿里页面“拍卖状态”，但页面控件未回显目标值“${targetLabels[0]}”（触发器显示“${after.triggerLabel || "空"}”，原生选项显示“${after.selectLabel || "空"}”）。`,
    controlFound: true,
    controlId: after.triggerId,
    selectId: after.selectId,
    menuId: after.menuId,
    readback: {
      triggerLabel: after.triggerLabel,
      selectLabel: after.selectLabel,
    },
    eventSequence: dispatched,
  };
}

// 选择菜单项会按阿里原生 option 的 url 触发一次列表页导航。第一次
// executeScript 返回的是导航前的同步结果，因此在抓取/打开流程中再执行一次
// 页面回读，确保新页面的可见触发器已经显示目标值。
async function settleAlibabaAuctionStatus(chromeRef, tab, requestedStatus, statusSync) {
  if (!statusSync?.changed) return { tab, statusSync };
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 900 : 700));
    try {
      const refreshedTab = await chromeRef.tabs.get(tab.id);
      const readback = await executeCurrentTab(chromeRef, refreshedTab.id, synchronizeAlibabaAuctionStatus, [requestedStatus]);
      if (readback?.ok) return { tab: refreshedTab, statusSync: readback };
      const error = new Error(readback?.reason || "阿里页面拍卖状态回读失败");
      error.code = readback?.errorCode || "ALIBABA_STATUS_READBACK_FAILED";
      lastError = error;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("ALIBABA_STATUS_READBACK_FAILED");
}

async function synchronizeAlibabaAuctionStatusOnTab(chromeRef, tab, requestedStatus) {
  let lastError = null;
  // Opening the current page can return before Alibaba mounts the second
  // status-control tree. Retry once in the same tab so the user does not
  // need to press “当前页打开并登录” a second time.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const statusSync = await executeCurrentTab(chromeRef, tab.id, synchronizeAlibabaAuctionStatus, [requestedStatus]);
      if (statusSync?.ok) return settleAlibabaAuctionStatus(chromeRef, tab, requestedStatus, statusSync);
      const failure = new Error(statusSync?.reason || "阿里页面拍卖状态同步失败");
      failure.code = statusSync?.errorCode || "ALIBABA_STATUS_SYNC_FAILED";
      lastError = failure;
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw lastError || new Error("ALIBABA_STATUS_SYNC_FAILED");
}

async function getCurrentBrowserTab(chromeRef) {
  const [tab] = await chromeRef.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("ALIBABA_CURRENT_TAB_UNAVAILABLE");
  return tab;
}

async function waitForManualVerification(context, tab, extractor, emit, description, control) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MANUAL_VERIFICATION_TIMEOUT_MS) {
    await waitForRunResume(control, emit);
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    emit({
      phase: "verification_required",
      percent: 35,
      message: `检测到阿里拍卖验证，请在当前标签页完成滑块验证；完成后脚本会自动继续${description}。已等待 ${elapsedSeconds} 秒。`,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    try {
      const current = await executeCurrentTab(context.chrome, tab.id, extractor);
      if (!directPageLooksBlocked(current)) return current;
    } catch {
      // Keep polling while the page is navigating during the manual verification.
    }
  }
  throw new Error("ALIBABA_VERIFICATION_TIMEOUT");
}

async function runCurrentTabScrape(context, request, emit = () => {}, control = null) {
  const chromeRef = context.chrome;
  let tab = await getCurrentBrowserTab(chromeRef);
  const currentListMatchesRequest = listPageMatchesRequest(tab.url, request);
  let listSourceUrl = currentListMatchesRequest ? tab.url : directListPageUrl(request.sourceUrl, 1);
  let firstPage = 1;
  try {
    const currentPage = Number(new URL(listSourceUrl).searchParams.get("page"));
    if (Number.isInteger(currentPage) && currentPage > 0) firstPage = currentPage;
  } catch {
    // The fallback source URL is validated by the navigation path below.
  }
  const candidates = [];
  const seen = new Set();
  let prefiltered = 0;
  const progress = (payload) => emit({ security: { credentialsReturned: false }, ...payload });
  progress({ phase: "opening", percent: 2, message: isAlibabaListPage(tab.url) ? "正在读取当前阿里拍卖筛选结果…" : "正在当前浏览器打开阿里拍卖列表页…", fetched: 0, verified: 0, skipped: 0 });

  for (let page = firstPage; page < firstPage + MAX_DIRECT_PAGES; page += 1) {
    try {
      await waitForRunResume(control, progress);
      if (control) control.percent = Math.min(35, 5 + Math.round(((page - firstPage + 1) / MAX_DIRECT_PAGES) * 30));
      if (page !== firstPage || !listPageMatchesRequest(tab.url, request)) {
        tab = await navigateCurrentTab(chromeRef, tab, directListPageUrl(listSourceUrl, page));
      }
      let extracted = await executeCurrentTab(chromeRef, tab.id, extractAlibabaListPage);
      let blocked = directPageLooksBlocked(extracted);
      if (blocked === "ALIBABA_VERIFICATION_REQUIRED") {
        extracted = await waitForManualVerification(context, tab, extractAlibabaListPage, progress, "读取列表", control);
        blocked = directPageLooksBlocked(extracted);
      }
      if (blocked) throw new Error(blocked);
      progress({
        phase: "syncing_filters",
        percent: Math.min(35, 8 + Math.round(((page - firstPage + 1) / MAX_DIRECT_PAGES) * 27)),
        message: `正在同步阿里页面“拍卖状态”：${request.status === "finished" ? "已结束" : "全部状态"}…`,
        page,
        pages: MAX_DIRECT_PAGES,
        fetched: 0,
        verified: 0,
        skipped: prefiltered,
      });
      const settled = await synchronizeAlibabaAuctionStatusOnTab(chromeRef, tab, request.status);
      const statusSync = settled.statusSync;
      if (statusSync.changed) {
        tab = settled.tab;
        extracted = await executeCurrentTab(chromeRef, tab.id, extractAlibabaListPage);
        blocked = directPageLooksBlocked(extracted);
        if (blocked === "ALIBABA_VERIFICATION_REQUIRED") {
          extracted = await waitForManualVerification(context, tab, extractAlibabaListPage, progress, "读取同步后的列表", control);
          blocked = directPageLooksBlocked(extracted);
        }
        if (blocked) throw new Error(blocked);
      }
      const pageItems = Array.isArray(extracted.items) ? extracted.items : [];
      let newItems = 0;
      for (const item of pageItems) {
        const url = directCanonicalUrl(item.href);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        newItems += 1;
        if (!directCandidateInScope(item, request)) {
          prefiltered += 1;
          continue;
        }
        candidates.push({ url, title: String(item.text || "").split("\n")[0].trim() });
      }
      progress({
        phase: "listing",
        percent: Math.min(35, 5 + Math.round(((page - firstPage + 1) / MAX_DIRECT_PAGES) * 30)),
        message: `已读取当前筛选结果第 ${page} 页，共发现 ${candidates.length} 条页面记录，准备详情核验…`,
        page,
        pages: MAX_DIRECT_PAGES,
        fetched: candidates.length,
        verified: 0,
        skipped: prefiltered,
      });
      if (directPageBeforeRequestedRange(pageItems, request)) {
        progress({
          phase: "listing",
          percent: Math.min(35, 5 + Math.round(((page - firstPage + 1) / MAX_DIRECT_PAGES) * 30)),
          message: `第 ${page} 页日期已早于所选起始日，停止继续翻页。`,
          page,
          pages: MAX_DIRECT_PAGES,
          fetched: candidates.length,
          verified: 0,
          skipped: prefiltered,
        });
        break;
      }
      if (!pageItems.length || newItems === 0) break;
    } catch (error) {
      const reason = String(error?.message || error);
      const errorCode = String(error?.code || (reason === "ALIBABA_SCRAPE_STOPPED" ? reason : "ALIBABA_SCRAPE_FAILED"));
      return { ok: false, phase: reason === "ALIBABA_SCRAPE_STOPPED" ? "stopped" : "failed", errorCode, reason, stopped: reason === "ALIBABA_SCRAPE_STOPPED", candidates: candidates.length, results: [], security: { credentialsReturned: false } };
    }
  }

  if (!candidates.length) {
    return { ok: false, phase: "failed", errorCode: "ALIBABA_LIST_EMPTY", reason: prefiltered ? "当前列表记录均不在所选交易状态或日期范围内。" : "当前浏览器页面未读取到阿里拍卖候选记录。请确认已登录且没有出现验证页。", candidates: 0, results: [], skipped: prefiltered, security: { credentialsReturned: false } };
  }

  const results = [];
  let skipped = prefiltered;
  for (const [index, candidate] of candidates.entries()) {
    try {
      await waitForRunResume(control, progress);
      if (control) control.percent = Math.min(98, 35 + Math.round(((index + 1) / candidates.length) * 63));
      tab = await navigateCurrentTab(chromeRef, tab, candidate.url);
      let detail = await executeCurrentTab(chromeRef, tab.id, extractAlibabaDetailPage);
      let blocked = directPageLooksBlocked(detail);
      if (blocked === "ALIBABA_VERIFICATION_REQUIRED") {
        detail = await waitForManualVerification(context, tab, extractAlibabaDetailPage, progress, "核验当前详情", control);
        blocked = directPageLooksBlocked(detail);
      }
      if (blocked) throw new Error(blocked);
      const detailFloors = directExtractFloorFieldsFromText(detail.pageText);
      const needsAttachmentFields = !directParseAmount(detail.buildingArea)
        || !detailFloors.floor
        || !detailFloors.totalFloors;
      if (needsAttachmentFields && Array.isArray(detail.attachments) && detail.attachments.length) {
        progress({
          phase: "reading_attachments",
          percent: Math.min(98, 35 + Math.round(((index + 1) / candidates.length) * 63)),
          message: "详情页字段不完整，正在读取评估报告附件，必要时进行 OCR 补充建筑面积和楼层…",
          fetched: candidates.length,
          verified: results.length,
          skipped,
          current: detail.title || candidate.title,
        });
        try {
          const fetchedAttachments = await fetchAlibabaAttachmentBuffersFromBrowser(chromeRef, detail.attachments);
          const usableAttachments = (Array.isArray(fetchedAttachments) ? fetchedAttachments : [])
            .filter((item) => String(item?.base64 || "").trim())
            .slice(0, 3);
          if (usableAttachments.length) {
            const enriched = await context.sendNativeMessage({
              action: "enrich_alibaba_auction_detail",
              detail,
              attachments: usableAttachments,
            }, 180000);
            if (enriched?.ok && enriched.detail) detail = { ...detail, ...enriched.detail };
          }
        } catch {
          // Keep the detail-page result when an optional report/OCR read fails.
        }
      }
      const parsed = directParseDetail(detail, request);
      if (parsed.valid && directMatchesRequest(parsed, request)) results.push(parsed);
      else skipped += 1;
      progress({
        phase: "verifying",
        percent: Math.min(98, 35 + Math.round(((index + 1) / candidates.length) * 63)),
        message: parsed.valid ? `已核验成交案例 ${results.length} 条。` : `已跳过未通过成交核验的记录 ${skipped} 条。`,
        fetched: candidates.length,
        verified: results.length,
        skipped,
        current: parsed.title || candidate.title,
      });
    } catch (error) {
      const reason = String(error?.message || error);
      skipped += 1;
      if (reason === "ALIBABA_SCRAPE_STOPPED") {
        return { ok: false, phase: "stopped", errorCode: reason, reason, stopped: true, candidates: candidates.length, results, skipped, security: { credentialsReturned: false } };
      }
      if (["ALIBABA_LOGIN_REQUIRED", "ALIBABA_VERIFICATION_REQUIRED"].includes(reason)) {
        return { ok: false, phase: "failed", errorCode: reason, reason: reason === "ALIBABA_LOGIN_REQUIRED" ? "阿里拍卖页面需要登录，请先在当前浏览器完成登录后重试。" : "阿里拍卖页面出现验证，请在当前浏览器完成验证后重试。", candidates: candidates.length, results, skipped, security: { credentialsReturned: false } };
      }
      progress({ phase: "verifying", percent: Math.min(98, 35 + Math.round(((index + 1) / candidates.length) * 63)), message: `详情读取失败，已跳过 ${skipped} 条。`, fetched: candidates.length, verified: results.length, skipped, current: candidate.title });
    }
  }

  if (control) control.percent = 99;
  progress(resultGenerationProgress(results, request, {
    fetched: candidates.length,
    verified: results.length,
    skipped,
  }));
  const saved = await context.sendNativeMessage({
    action: "write_alibaba_auction_result",
    request,
    results,
    candidates: candidates.length,
    skipped,
  }, 180000);
  const finalizedAfterStop = Boolean(control?.stopped);
  return {
    ok: !finalizedAfterStop && results.length > 0 && saved?.ok !== false,
    phase: finalizedAfterStop ? "stopped" : "completed",
    stopped: finalizedAfterStop,
    finalized: finalizedAfterStop,
    errorCode: results.length ? "" : "ALIBABA_NO_VALID_CASES",
    reason: finalizedAfterStop
      ? "本地结果写入完成，抓取已终止。"
      : results.length
        ? "阿里拍卖成交案例已完成详情核验。"
        : "候选记录中没有找到满足成交且出价次数大于 0 的案例。",
    candidates: candidates.length,
    results: Array.isArray(saved?.results) ? saved.results : results,
    htmlPath: String(saved?.htmlPath || ""),
    mapPath: String(saved?.mapPath || ""),
    skipped,
    geocodeRequested: Number(saved?.geocodeRequested || 0),
    geocodeCacheHits: Number(saved?.geocodeCacheHits || 0),
    geocodeResolved: Number(saved?.geocodeResolved || 0),
    geocodeFailed: Number(saved?.geocodeFailed || 0),
    geocodeTimedOut: Number(saved?.geocodeTimedOut || 0),
    geocodeDurationMs: Number(saved?.geocodeDurationMs || 0),
    security: { credentialsReturned: false },
  };
}

export const alibabaAuctionModule = {
  manifest: {
    id: "alibaba-auction",
    type: "feature",
    stage: "stable",
    route: "alibaba-auction",
    displayName: "阿里司法拍卖",
    messageNamespace: "alibaba-auction",
    entryElementId: "openAlibabaAuction",
    pageElementId: "page-alibaba-auction",
    storageVersion: 1,
    usesLegacyScope: false,
    scope: { companies: false, subjects: false },
  },

  create() {
    let context;
    let elements;
    let config = { ...DEFAULT_CONFIG };
    let appliedConfig = null;
    let results = [];
    let htmlPath = "";
    let excelPath = "";
    let mapPath = "";
    let running = false;
    let opening = false;
    let exporting = false;
    let runControl = null;
    let progressState = { phase: "idle", percent: 0, fetched: 0, verified: 0, skipped: 0, message: "等待开始" };

    function storageState() {
      return {
        ...config,
        parameterSnapshot: appliedConfig ? { ...appliedConfig } : null,
        results,
        htmlPath,
        excelPath,
        mapPath,
      };
    }

    function parametersApplied() {
      return Boolean(appliedConfig) && parameterSnapshotMatches(config, appliedConfig);
    }

    function renderParameterState() {
      const state = elements?.alibabaAuctionParameterState;
      if (!state) return;
      const applied = parametersApplied();
      state.textContent = applied ? "参数已应用" : "参数有改动，需重新应用";
      state.dataset.kind = applied ? "ok" : "warn";
    }

    function readConfig() {
      return normalizeConfig({
        provinceCode: elements.alibabaAuctionProvince.value,
        cityCode: elements.alibabaAuctionCity.value,
        districtCode: elements.alibabaAuctionDistrict.value,
        propertyType: elements.alibabaAuctionPropertyType.value,
        status: elements.alibabaAuctionStatus.value,
        keyword: elements.alibabaAuctionKeyword.value,
        startDate: elements.alibabaAuctionStartDate.value,
        endDate: elements.alibabaAuctionEndDate.value,
        outputDirectory: elements.alibabaAuctionOutputDirectory.value,
        generateMap: elements.alibabaAuctionGenerateMap.checked,
      });
    }

    function renderConfig() {
      renderRegionOptions();
      elements.alibabaAuctionPropertyType.value = config.propertyType;
      elements.alibabaAuctionStatus.value = config.status;
      elements.alibabaAuctionKeyword.value = config.keyword;
      elements.alibabaAuctionStartDate.value = config.startDate;
      elements.alibabaAuctionEndDate.value = config.endDate;
      elements.alibabaAuctionOutputDirectory.value = config.outputDirectory;
      elements.alibabaAuctionGenerateMap.checked = Boolean(config.generateMap);
      elements.alibabaAuctionSourceUrl.value = buildSourceUrl(config);
      renderParameterState();
    }

    function renderRegionOptions() {
      const province = elements.alibabaAuctionProvince;
      const city = elements.alibabaAuctionCity;
      const district = elements.alibabaAuctionDistrict;
      province.innerHTML = ALIBABA_REGION_CATALOG
        .map((item) => `<option value="${item.code}">${item.name}</option>`)
        .join("");
      province.value = config.provinceCode;
      const provinceRegion = ALIBABA_REGION_CATALOG.find((item) => item.code === config.provinceCode);
      const cities = provinceRegion?.children || [];
      city.innerHTML = `<option value="">全省</option>${cities.map((item) => `<option value="${item.code}">${item.name}</option>`).join("")}`;
      city.value = config.cityCode;
      const cityRegion = cities.find((item) => item.code === config.cityCode);
      const districts = usableDistricts(cityRegion);
      district.innerHTML = `<option value="">${cityRegion ? "不限定区县" : "请先选择城市"}</option>${districts.map((item) => `<option value="${item.code}">${item.name}</option>`).join("")}`;
      district.disabled = !cityRegion || !districts.length;
      district.value = config.districtCode;
    }

    function syncConfigFromInputs() {
      config = readConfig();
      renderConfig();
      if (!parametersApplied()) setMessage(elements.alibabaAuctionParameterMessage, "参数有改动，需重新应用。", "warn");
    }

    function markConfigDirtyFromInputs() {
      config = readConfig();
      renderParameterState();
      if (!parametersApplied()) setMessage(elements.alibabaAuctionParameterMessage, "参数有改动，需重新应用。", "warn");
    }

    function renderResults() {
      elements.alibabaAuctionResultCount.textContent = `${results.length} 条`;
      elements.clearAlibabaAuctionResults.disabled = !results.length;
      elements.openAlibabaAuctionResult.disabled = !htmlPath;
      elements.exportAlibabaAuctionExcel.disabled = !results.length || running || exporting;
      elements.openAlibabaAuctionExcel.disabled = !excelPath;
      elements.openAlibabaAuctionMap.disabled = !mapPath;
      if (!running) {
        elements.alibabaAuctionResultStatus.textContent = htmlPath && excelPath && mapPath
          ? "结果页、Excel 和地图已生成，可在普通应用中打开。"
          : htmlPath && excelPath
            ? "结果页和 Excel 已生成，可在普通应用中打开。"
          : htmlPath
            ? "结果页已生成，可在普通浏览器中打开；需要表格时点击“导出 Excel”。"
            : "尚未读取结果";
      }
    }

    function renderProgress(payload = {}) {
      progressState = { ...progressState, ...payload };
      const percent = Math.max(0, Math.min(100, Number(progressState.percent || 0)));
      const phaseLabels = {
        idle: "等待开始",
        opening: "正在打开页面",
        listing: "正在读取列表",
        syncing_filters: "正在同步页面筛选",
        verifying: "正在核验详情",
        generating_results: "正在生成结果页",
        locating_coordinates: "正在定位坐标并生成地图",
        verification_required: "等待人工验证",
        paused: "已暂停",
        stopped: "已终止",
        completed: "抓取完成",
        failed: "抓取失败",
      };
      elements.alibabaAuctionProgressPhase.textContent = phaseLabels[progressState.phase] || "正在处理";
      elements.alibabaAuctionProgressPercent.textContent = `${percent}%`;
      elements.alibabaAuctionProgressBar.style.width = `${percent}%`;
      elements.alibabaAuctionProgressBar.parentElement.setAttribute("aria-valuenow", String(percent));
      elements.alibabaAuctionProgressFetched.textContent = String(progressState.fetched ?? 0);
      elements.alibabaAuctionProgressVerified.textContent = String(progressState.verified ?? 0);
      elements.alibabaAuctionProgressSkipped.textContent = String(progressState.skipped ?? 0);
      if (progressState.message) elements.alibabaAuctionResultStatus.textContent = progressState.message;
      if (running && progressState.fetched !== undefined) {
        elements.alibabaAuctionResultCount.textContent = `${progressState.fetched} 条页面记录`;
      }
    }

    async function openResultPage() {
      if (!htmlPath) return;
      try {
        const result = await context.sendNativeMessage({ action: "open_alibaba_auction_path", path: htmlPath, outputDirectory: config.outputDirectory }, 15000);
        if (!result?.ok) throw new Error(result?.reason || "打开结果页失败");
        setMessage(elements.alibabaAuctionResultMessage, "已在普通浏览器中打开独立结果页。", "ok");
        context.setStatus("阿里拍卖结果页已打开", "ok");
      } catch (error) {
        setMessage(elements.alibabaAuctionResultMessage, `结果页打开失败：${error?.message || String(error)}`, "error");
        context.setStatus("阿里拍卖结果页打开失败", "error");
      }
    }

    async function openExcel() {
      if (!excelPath) return;
      try {
        const result = await context.sendNativeMessage({ action: "open_alibaba_auction_path", path: excelPath, outputDirectory: config.outputDirectory }, 15000);
        if (!result?.ok) throw new Error(result?.reason || "打开 Excel 失败");
        setMessage(elements.alibabaAuctionResultMessage, "已打开本机 Excel 导出文件。", "ok");
        context.setStatus("阿里拍卖 Excel 已打开", "ok");
      } catch (error) {
        setMessage(elements.alibabaAuctionResultMessage, `Excel 打开失败：${error?.message || String(error)}`, "error");
        context.setStatus("阿里拍卖 Excel 打开失败", "error");
      }
    }

    async function openMap() {
      if (!mapPath) return;
      try {
        const result = await context.sendNativeMessage({ action: "open_alibaba_auction_path", path: mapPath, outputDirectory: config.outputDirectory }, 15000);
        if (!result?.ok) throw new Error(result?.reason || "打开地图失败");
        setMessage(elements.alibabaAuctionResultMessage, "已在普通浏览器中打开独立地图。", "ok");
        context.setStatus("阿里拍卖地图已打开", "ok");
      } catch (error) {
        setMessage(elements.alibabaAuctionResultMessage, `地图打开失败：${error?.message || String(error)}`, "error");
        context.setStatus("阿里拍卖地图打开失败", "error");
      }
    }

    async function exportExcel() {
      if (exporting || running || !results.length) return;
      const requestConfig = requireAppliedParameters();
      if (!requestConfig) return;
      exporting = true;
      renderResults();
      setMessage(elements.alibabaAuctionResultMessage, "正在生成 Excel，并回读校验文件内容…", "warn");
      context.setStatus("正在导出阿里拍卖 Excel", "busy");
      try {
        const result = await context.sendNativeMessage({
          action: "write_alibaba_auction_excel",
          request: { ...requestConfig, sourceUrl: buildSourceUrl(requestConfig) },
          results,
          candidates: results.length,
        }, 180000);
        if (!result?.ok || !result.excelPath) throw new Error(result?.reason || "ALIBABA_EXCEL_EXPORT_FAILED");
        excelPath = String(result.excelPath).trim();
        await context.storage.save(storageState());
        renderResults();
        setMessage(elements.alibabaAuctionResultMessage, `Excel 已导出并完成校验，共 ${result.rowCount || results.length} 条；点击“打开 Excel”查看。`, "ok");
        context.setStatus("阿里拍卖 Excel 导出完成", "ok");
      } catch (error) {
        setMessage(elements.alibabaAuctionResultMessage, `Excel 导出失败：${error?.message || String(error)}`, "error");
        context.setStatus("阿里拍卖 Excel 导出失败", "error");
      } finally {
        exporting = false;
        renderResults();
      }
    }

    function requireAppliedParameters() {
      config = readConfig();
      renderParameterState();
      if (!parametersApplied()) {
        const reason = appliedConfig ? "参数有改动，需重新应用。" : "请先点击“确认并应用参数”，再继续。";
        setMessage(elements.alibabaAuctionParameterMessage, reason, "warn");
        context.setStatus("阿里司法拍卖参数尚未应用", "warn");
        return null;
      }
      return { ...appliedConfig };
    }

    async function applyParameters() {
      const nextConfig = readConfig();
      if (!nextConfig.outputDirectory) {
        setMessage(elements.alibabaAuctionParameterMessage, "请先选择本机输出目录。", "warn");
        return false;
      }
      if (nextConfig.startDate && nextConfig.endDate && nextConfig.startDate > nextConfig.endDate) {
        setMessage(elements.alibabaAuctionParameterMessage, "成交时间起不能晚于成交时间止。", "error");
        return false;
      }
      config = nextConfig;
      appliedConfig = { ...nextConfig };
      await context.storage.save(storageState());
      renderConfig();
      setMessage(elements.alibabaAuctionParameterMessage, "参数已应用。", "ok");
      context.setStatus("阿里司法拍卖参数已应用", "ok");
      return true;
    }

    async function chooseOutputDirectory() {
      try {
        const result = await context.sendNativeMessage({ action: "select_alibaba_auction_output_directory" }, 130000);
        const selected = result?.paths?.[0] || "";
        if (!result?.ok || !selected) {
          if (!result?.cancelled) setMessage(elements.alibabaAuctionParameterMessage, result?.reason || "未选择输出目录", "warn");
          return;
        }
        config.outputDirectory = selected;
        elements.alibabaAuctionOutputDirectory.value = selected;
        renderConfig();
        await context.storage.save(storageState());
        const folderMessage = result.directoryName
          ? `${result.createdDirectory === false ? "已选择" : "已创建并选择"}专用子文件夹：${result.directoryName}`
          : "输出目录已选择";
        const parameterMessage = parametersApplied() ? "" : "参数有改动，需重新应用。";
        setMessage(elements.alibabaAuctionParameterMessage, `${folderMessage}，结果页、Excel 和地图会保存到这里。${parameterMessage}`, parametersApplied() ? "ok" : "warn");
      } catch (error) {
        setMessage(elements.alibabaAuctionParameterMessage, `选择目录失败：${error?.message || String(error)}`, "error");
      }
    }

    async function openSource() {
      if (opening || running) return;
      opening = true;
      elements.openAlibabaAuctionSource.disabled = true;
      try {
        const requestConfig = requireAppliedParameters();
        if (!requestConfig) return;
        let tab = await getCurrentBrowserTab(context.chrome);
        tab = await navigateCurrentTab(context.chrome, tab, buildSourceUrl(requestConfig));
        const settled = await synchronizeAlibabaAuctionStatusOnTab(context.chrome, tab, requestConfig.status);
        tab = settled.tab;
        setMessage(elements.alibabaAuctionParameterMessage, `已打开阿里拍卖列表页，并同步“拍卖状态”为${requestConfig.status === "finished" ? "已结束" : "全部状态"}。等待结果加载完成后即可开始抓取。`, "ok");
        context.setStatus("阿里拍卖检索页已在当前浏览器打开", "ok");
      } catch (error) {
        const errorCode = error?.code && error.code !== error?.message ? `${error.code}：` : "";
        setMessage(elements.alibabaAuctionParameterMessage, `当前浏览器打开失败：${errorCode}${error?.message || String(error)}`, "error");
        context.setStatus("阿里拍卖页面打开失败", "error");
      } finally {
        opening = false;
        elements.openAlibabaAuctionSource.disabled = running;
      }
    }

    async function syncStatusOnCurrentPage() {
      try {
        const requestConfig = requireAppliedParameters();
        if (!requestConfig) return { ok: false, errorCode: "ALIBABA_PARAMETERS_NOT_APPLIED", reason: "参数有改动，需重新应用。" };
        let tab = await getCurrentBrowserTab(context.chrome);
        if (!isAlibabaListPage(tab.url)) return { ok: false, skipped: true };
        const settled = await synchronizeAlibabaAuctionStatusOnTab(context.chrome, tab, requestConfig.status);
        tab = settled.tab;
        setMessage(elements.alibabaAuctionParameterMessage, `已同步阿里页面“拍卖状态”为${requestConfig.status === "finished" ? "已结束" : "全部状态"}。`, "ok");
        return settled.statusSync;
      } catch (error) {
        const errorCode = error?.code && error.code !== error?.message ? `${error.code}：` : "";
        setMessage(elements.alibabaAuctionParameterMessage, `网页状态同步失败：${errorCode}${error?.message || String(error)}`, "error");
        return { ok: false, errorCode: error?.code || "ALIBABA_STATUS_SYNC_FAILED", reason: error?.message || String(error) };
      }
    }

    async function runScrape() {
      if (running) return;
      const requestConfig = requireAppliedParameters();
      if (!requestConfig) return;
      running = true;
      runControl = { paused: false, percent: 0, resumeResolvers: [] };
      renderProgress({ phase: "opening", percent: 0, fetched: 0, verified: 0, skipped: 0, message: "正在准备抓取…" });
      elements.runAlibabaAuction.disabled = true;
      elements.openAlibabaAuctionSource.disabled = true;
      elements.pauseAlibabaAuction.disabled = false;
      elements.stopAlibabaAuction.disabled = false;
      elements.pauseAlibabaAuction.textContent = "暂停抓取";
      elements.clearAlibabaAuctionResults.disabled = true;
      renderResults();
      setMessage(elements.alibabaAuctionResultMessage, "脚本正在通过浏览器读取列表并逐条核验详情；无需 AI 介入。", "warn");
      context.setStatus("阿里拍卖脚本正在运行", "busy");
      try {
        const result = await runCurrentTabScrape(context, {
          ...requestConfig,
          sourceUrl: buildSourceUrl(requestConfig),
        }, (payload) => {
          renderProgress(payload);
          if (["generating_results", "locating_coordinates"].includes(payload.phase)) {
            elements.pauseAlibabaAuction.disabled = true;
          }
          elements.alibabaAuctionResultStatus.dataset.kind = "";
        }, runControl);
        if (result?.stopped && result?.finalized) {
          results = Array.isArray(result.results) ? result.results : [];
          htmlPath = String(result.htmlPath || "").trim();
          mapPath = String(result.mapPath || "").trim();
          excelPath = "";
          renderProgress({ phase: "stopped", percent: 100, fetched: result.candidates || 0, verified: results.length, skipped: result.skipped || 0, message: "本地结果写入完成，抓取已终止。" });
          await context.storage.save(storageState());
          renderResults();
          elements.alibabaAuctionResultStatus.textContent = htmlPath
            ? `本地结果写入完成，抓取已终止；已保留 ${results.length} 条有效成交案例。`
            : "本地结果写入完成，抓取已终止。";
          setMessage(elements.alibabaAuctionResultMessage, htmlPath
            ? `抓取已终止，但本次结果已写入本机；页面记录 ${result.candidates || 0} 条，核验通过 ${results.length} 条，跳过 ${result.skipped || 0} 条。`
            : "抓取已终止，未生成可打开的结果文件。", "warn");
          context.setStatus("阿里拍卖结果已写入，抓取已终止", "warn");
          return;
        }
        if (result?.stopped) {
          renderProgress({ phase: "stopped", message: "抓取已终止；未生成本次半成品结果。" });
          setMessage(elements.alibabaAuctionResultMessage, `抓取已终止，已读取 ${result.candidates || 0} 条页面记录。可以重新开始。`, "warn");
          elements.alibabaAuctionResultStatus.textContent = "抓取已终止";
          context.setStatus("阿里拍卖抓取已终止", "warn");
          return;
        }
        if (!result?.ok) {
          const failure = new Error(result?.reason || result?.errorCode || "ALIBABA_AUCTION_FAILED");
          failure.code = result?.errorCode || "ALIBABA_AUCTION_FAILED";
          throw failure;
        }
        results = Array.isArray(result.results) ? result.results : [];
        htmlPath = String(result.htmlPath || "").trim();
        mapPath = String(result.mapPath || "").trim();
        excelPath = "";
        renderProgress({ phase: "completed", percent: 100, fetched: result.candidates || 0, verified: results.length, skipped: result.skipped || 0, message: "抓取完成，结果页正在打开…" });
        await context.storage.save(storageState());
        renderResults();
        elements.alibabaAuctionResultStatus.textContent = `已完成详情核验：${results.length} 条有效成交案例`;
        const coordinateSummary = requestConfig.generateMap && (result.geocodeRequested || result.geocodeCacheHits || result.geocodeResolved || result.geocodeFailed || result.geocodeTimedOut)
          ? `坐标查询 ${result.geocodeRequested || 0} 次，缓存命中 ${result.geocodeCacheHits || 0} 条，定位 ${result.geocodeResolved || 0} 条。`
          : "";
        setMessage(elements.alibabaAuctionResultMessage, `抓取完成：页面记录 ${result.candidates || 0} 条，核验通过 ${results.length} 条，跳过 ${result.skipped || 0} 条。${coordinateSummary}`, "ok");
        await openResultPage();
        context.setStatus(`阿里拍卖抓取完成：${results.length} 条有效案例`, "ok");
      } catch (error) {
        renderProgress({ phase: "failed", message: "抓取失败，请按提示处理后重试" });
        const errorCode = error?.code && error.code !== error?.message ? `${error.code}：` : "";
        setMessage(elements.alibabaAuctionResultMessage, `抓取未完成：${errorCode}${error?.message || String(error)}`, "error");
        elements.alibabaAuctionResultStatus.textContent = "抓取失败，请按提示处理后重试";
        elements.alibabaAuctionResultStatus.dataset.kind = "error";
        context.setStatus("阿里拍卖抓取失败", "error");
      } finally {
        running = false;
        if (runControl) {
          runControl.paused = false;
          for (const resolve of runControl.resumeResolvers.splice(0)) resolve();
        }
        runControl = null;
        elements.runAlibabaAuction.disabled = false;
        elements.openAlibabaAuctionSource.disabled = false;
        elements.pauseAlibabaAuction.disabled = true;
        elements.stopAlibabaAuction.disabled = true;
        elements.pauseAlibabaAuction.textContent = "暂停抓取";
        elements.clearAlibabaAuctionResults.disabled = !results.length;
        renderResults();
      }
    }

    function togglePause() {
      if (!running || !runControl) return;
      if (runControl.paused) {
        runControl.paused = false;
        elements.pauseAlibabaAuction.textContent = "暂停抓取";
        for (const resolve of runControl.resumeResolvers.splice(0)) resolve();
        setMessage(elements.alibabaAuctionResultMessage, "已继续抓取，将从当前进度继续。", "ok");
        return;
      }
      runControl.paused = true;
      runControl.percent = Number(progressState.percent || 0);
      elements.pauseAlibabaAuction.textContent = "继续抓取";
      renderProgress({ phase: "paused", message: "抓取已暂停；点击“继续抓取”后会从当前进度继续。" });
      setMessage(elements.alibabaAuctionResultMessage, "抓取已暂停，当前标签页可以保留在原位置。", "warn");
    }

    function stopScrape() {
      if (!running || !runControl) return;
      const finalizationPhase = ["generating_results", "locating_coordinates"].includes(progressState.phase);
      runControl.stopped = true;
      runControl.paused = false;
      for (const resolve of runControl.resumeResolvers.splice(0)) resolve();
      elements.stopAlibabaAuction.disabled = true;
      elements.pauseAlibabaAuction.disabled = true;
      if (finalizationPhase) {
        renderProgress({ phase: progressState.phase, percent: 99, message: "正在完成本地结果写入，完成后终止" });
        setMessage(elements.alibabaAuctionResultMessage, "正在完成本地结果写入，完成后终止", "warn");
      } else {
        renderProgress({ phase: "stopped", message: "正在终止当前抓取，请稍候…" });
        setMessage(elements.alibabaAuctionResultMessage, "正在终止抓取，不会继续打开新的详情页。", "warn");
      }
    }

    return {
      async initialize(nextContext) {
        context = nextContext;
        const root = context.document.getElementById(context.manifest.pageElementId);
        if (!root) throw new Error("ALIBABA_AUCTION_PAGE_MISSING");
        root.dataset.moduleId = context.manifest.id;
        root.innerHTML = alibabaAuctionTemplate;
        const stylesheet = context.document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = context.chrome.runtime.getURL("src/modules/alibaba-auction/styles.css");
        context.document.head.appendChild(stylesheet);
        context.scope.add(() => stylesheet.remove());
        elements = elementMap(context.document);
        const stored = await context.storage.load({});
        config = normalizeConfig(stored);
        appliedConfig = stored?.parameterSnapshot ? normalizeConfig(stored.parameterSnapshot) : null;
        results = Array.isArray(stored?.results) ? stored.results : [];
        htmlPath = String(stored?.htmlPath || "").trim();
        excelPath = String(stored?.excelPath || "").trim();
        mapPath = String(stored?.mapPath || "").trim();
        progressState = results.length
          ? { phase: "completed", percent: 100, fetched: results.length, verified: results.length, skipped: 0, message: `已保留上次结果：${results.length} 条有效案例` }
          : { phase: "idle", percent: 0, fetched: 0, verified: 0, skipped: 0, message: "等待开始" };
        context.scope.on(elements.openAlibabaAuction, "click", () => context.navigate("alibaba-auction"));
        context.scope.on(elements.backFromAlibabaAuction, "click", () => context.navigate("home"));
        context.scope.on(elements.openAlibabaAuctionSource, "click", openSource);
        context.scope.on(elements.openAlibabaAuctionResult, "click", openResultPage);
        context.scope.on(elements.exportAlibabaAuctionExcel, "click", exportExcel);
        context.scope.on(elements.openAlibabaAuctionExcel, "click", openExcel);
        context.scope.on(elements.openAlibabaAuctionMap, "click", openMap);
        context.scope.on(elements.chooseAlibabaAuctionOutput, "click", chooseOutputDirectory);
        context.scope.on(elements.runAlibabaAuction, "click", runScrape);
        context.scope.on(elements.pauseAlibabaAuction, "click", togglePause);
        context.scope.on(elements.stopAlibabaAuction, "click", stopScrape);
        context.scope.on(elements.saveAlibabaAuctionParams, "click", applyParameters);
        context.scope.on(elements.resetAlibabaAuctionParams, "click", async () => {
          config = { ...DEFAULT_CONFIG, outputDirectory: config.outputDirectory };
          excelPath = "";
          mapPath = "";
          await context.storage.save(storageState());
          renderConfig();
          setMessage(elements.alibabaAuctionParameterMessage, "已恢复默认参数；请点击“确认并应用参数”。", "warn");
        });
        context.scope.on(elements.clearAlibabaAuctionResults, "click", async () => {
          results = [];
          htmlPath = "";
          excelPath = "";
          mapPath = "";
          await context.storage.save(storageState());
          renderResults();
          setMessage(elements.alibabaAuctionResultMessage, "已清空本地结果。", "");
        });
        for (const id of [
          "alibabaAuctionPropertyType", "alibabaAuctionKeyword",
          "alibabaAuctionStartDate", "alibabaAuctionEndDate",
        ]) {
          context.scope.on(elements[id], "change", syncConfigFromInputs);
          if (["alibabaAuctionKeyword", "alibabaAuctionStartDate", "alibabaAuctionEndDate"].includes(id)) {
            context.scope.on(elements[id], "input", markConfigDirtyFromInputs);
          }
        }
        context.scope.on(elements.alibabaAuctionStatus, "change", syncConfigFromInputs);
        context.scope.on(elements.alibabaAuctionGenerateMap, "change", syncConfigFromInputs);
        context.scope.on(elements.alibabaAuctionProvince, "change", () => {
          config = normalizeConfig({ ...config, provinceCode: elements.alibabaAuctionProvince.value, city: "", cityCode: "", district: "", districtCode: "" });
          renderConfig();
          setMessage(elements.alibabaAuctionParameterMessage, "参数有改动，需重新应用。", "warn");
        });
        context.scope.on(elements.alibabaAuctionCity, "change", () => {
          config = normalizeConfig({ ...config, city: "", cityCode: elements.alibabaAuctionCity.value, district: "", districtCode: "" });
          renderConfig();
          setMessage(elements.alibabaAuctionParameterMessage, "参数有改动，需重新应用。", "warn");
        });
        context.scope.on(elements.alibabaAuctionDistrict, "change", syncConfigFromInputs);
        renderConfig();
        renderResults();
        renderProgress();
      },
      activate() {
        renderConfig();
        renderResults();
      },
      deactivate() {},
      dispose() {},
    };
  },
};

export {
  DEFAULT_CONFIG,
  RESULT_FIELDS,
  buildSourceUrl,
  directCandidateInScope,
  directPageBeforeRequestedRange,
  hasDirectCoordinates,
  resultGenerationProgress,
  directExtractBuildingAreaFromText,
  directExtractFloorFieldsFromText,
  directParseDetail,
  listPageMatchesRequest,
  statusFilterLabels,
  statusFilterMatchesRequest,
  isAlibabaListPage,
  normalizeConfig,
  parameterSnapshotMatches,
  propertyTypeLabel,
  synchronizeAlibabaAuctionStatus,
  synchronizeAlibabaAuctionStatusOnTab,
  usableDistricts,
};
