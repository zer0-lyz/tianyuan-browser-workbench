"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");

const PYTHON_BIN = process.env.TIANYUAN_PYTHON_BIN
  || process.env.PYTHON_BIN
  || (process.platform === "win32" ? "python.exe" : (fs.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3"));
const DEFAULT_SESSION = "alibaba-auction";
const DEFAULT_SOURCE_URL = "https://sf.taobao.com/list/50025969__2.htm";
const RESULT_ROOT = path.join(os.homedir(), ".tianyuan-workbench", "outputs", "alibaba-auction");
const RESULT_HTML_NAME = "latest.html";
const RESULT_EXCEL_NAME = "latest.xlsx";
const RESULT_COORDS_NAME = "latest_coords.json";
const RESULT_POINTS_NAME = "latest_points.js";
const RESULT_MAP_NAME = "latest_map.html";
const GEOCODE_CACHE_VERSION = 1;
const DEFAULT_GEOCODE_CACHE_PATH = path.join(
  os.homedir(),
  ".tianyuan-workbench",
  "cache",
  "alibaba-auction-geocode.json",
);
const GEOCODE_REQUEST_TIMEOUT_MS = 4500;
const GEOCODE_TOTAL_BUDGET_MS = 12000;
const GEOCODE_MIN_INTERVAL_MS = 300;
const AMAP_GEOCODE_ENDPOINT = "https://www.amap.com/service/poiTips";
const NOMINATIM_GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const SAFE_MAX_PAGES = 50;
const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_BROWSER_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_TIMEOUT_MS = 30000;
const OCR_TIMEOUT_MS = 120000;
const OCR_MAX_PAGES = 20;
const OCR_MAX_TEXT_LENGTH = 200000;
const PROPERTY_LABELS = {
  residential: "住宅用房",
  commercial: "商业房",
};
const RESULT_EXCEL_COLUMNS = Object.freeze([
  ["案例标题", "title"],
  ["省份", "province"],
  ["城市", "city"],
  ["区县", "district"],
  ["物业类型", "propertyType"],
  ["坐落位置", "address"],
  ["交易时间", "transactionTime"],
  ["交易金额（元）", "transactionAmount"],
  ["评估价", "valuationAmount"],
  ["建筑面积（m²）", "buildingArea"],
  ["单价", "unitPrice"],
  ["所在楼层", "floor"],
  ["总层数", "totalFloors"],
  ["装修", "decoration"],
  ["租赁情况", "leaseStatus"],
  ["案例平台", "platform"],
  ["出价次数", "bidCount"],
  ["核验状态", "verificationStatus"],
  ["坐标状态", "coordinateStatus"],
  ["经度", "longitude"],
  ["纬度", "latitude"],
  ["案例网址", "url"],
]);
const RESULT_EXCEL_NUMERIC_FIELDS = new Set([
  "longitude", "latitude", "transactionAmount", "valuationAmount", "buildingArea", "unitPrice", "totalFloors", "bidCount",
]);
const PDF_TEXT_SCRIPT = String.raw`
import json
import sys

pdf_path = sys.argv[1]
extractors = []

try:
    from pypdf import PdfReader
    extractors.append(lambda: "\n".join((page.extract_text() or "") for page in PdfReader(pdf_path).pages))
except Exception:
    pass

try:
    from PyPDF2 import PdfReader as PyPdf2Reader
    extractors.append(lambda: "\n".join((page.extract_text() or "") for page in PyPdf2Reader(pdf_path).pages))
except Exception:
    pass

try:
    import pdfplumber
    def pdfplumber_extract():
        with pdfplumber.open(pdf_path) as pdf:
            return "\n".join((page.extract_text() or "") for page in pdf.pages)
    extractors.append(pdfplumber_extract)
except Exception:
    pass

for extractor in extractors:
    try:
        text = extractor()
        print(json.dumps({"ok": True, "text": text[:200000]}, ensure_ascii=False))
        break
    except Exception:
        continue
else:
    print(json.dumps({"ok": False, "error": "PDF_TEXT_EXTRACTOR_UNAVAILABLE"}, ensure_ascii=False))
`;
const PDF_OCR_SCRIPT = String.raw`
import json
import os
import re
import sys

pdf_path = sys.argv[1]
page_limit = max(1, int(sys.argv[2] if len(sys.argv) > 2 else 20))
page_texts = []

try:
    import fitz
    from rapidocr_onnxruntime import RapidOCR

    document = fitz.open(pdf_path)
    page_count = min(document.page_count, page_limit)
    engine = RapidOCR()
    for page_index in range(page_count):
        image_path = os.path.join(os.path.dirname(pdf_path), "ocr-page-" + str(page_index + 1) + ".png")
        try:
            pixmap = document[page_index].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            pixmap.save(image_path)
            result, _ = engine(image_path)
            if result:
                page_texts.append("\n".join(str(item[1]) for item in result if len(item) > 1 and item[1]))
                recognized = "\n\n".join(page_texts)
                has_area = re.search(r"(?:建筑|房屋|产权)?面积[^\d]{0,80}\d+(?:[.,]\d+)?\s*(?:平方米|平米|㎡|m²|m2)", recognized, re.I)
                has_floor = re.search(r"(?:所在|总|建筑物|建筑|房屋)?(?:楼层|层数|总楼层)[^\d一二两三四五六七八九十百零]{0,40}[\d一二两三四五六七八九十百零]+\s*层?", recognized)
                if has_area and has_floor:
                    break
        finally:
            try:
                os.remove(image_path)
            except OSError:
                pass
    document.close()
    print(json.dumps({
        "ok": True,
        "engine": "rapidocr_onnxruntime",
        "pages": page_count,
        "text": "\n\n".join(page_texts)[:200000],
    }, ensure_ascii=False))
except Exception as error:
    print(json.dumps({
        "ok": False,
        "error": "PDF_OCR_UNAVAILABLE",
        "detail": type(error).__name__,
    }, ensure_ascii=False))
`;
const BROWSER_ATTACHMENT_SCRIPT = String.raw`(async (href) => {
  const response = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", href, true);
    request.responseType = "arraybuffer";
    request.withCredentials = true;
    request.onload = () => resolve(request);
    request.onerror = () => reject(new Error("ALIBABA_BROWSER_ATTACHMENT_REQUEST_FAILED"));
    request.ontimeout = () => reject(new Error("ALIBABA_BROWSER_ATTACHMENT_TIMEOUT"));
    request.timeout = 30000;
    request.send();
  });
  const bytes = new Uint8Array(response.response || new ArrayBuffer(0));
  if (bytes.length > 20971520) return { ok: false, error: "ALIBABA_ATTACHMENT_TOO_LARGE" };
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  return {
    ok: response.status === 200 && bytes.length > 0,
    status: response.status,
    contentType: response.getResponseHeader("content-type") || "",
    base64: btoa(binary),
  };
})`;
const BROWSER_LOCATION_SCRIPT = String.raw`(() => ({
  url: location.href,
  readyState: document.readyState,
}))()`;
const RESULT_EXCEL_SCRIPT = String.raw`
import json
import os
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

payload_path, target_path = sys.argv[1:3]
with open(payload_path, "r", encoding="utf-8") as stream:
    payload = json.load(stream)

columns = payload["columns"]
numeric_fields = set(payload["numericFields"])
rows = payload["rows"]
temporary_path = target_path + ".tmp.xlsx"
os.makedirs(os.path.dirname(target_path), exist_ok=True)

try:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "成交案例"
    sheet.sheet_view.showGridLines = False
    header_fill = PatternFill("solid", fgColor="EAF1F8")
    header_font = Font(name="宋体", size=10, bold=True, color="1F2328")
    body_font = Font(name="宋体", size=10, color="1F2328")
    right_alignment = Alignment(horizontal="right", vertical="center")
    left_alignment = Alignment(horizontal="left", vertical="center", wrap_text=False)

    for column_index, (label, _) in enumerate(columns, 1):
        cell = sheet.cell(row=1, column=column_index, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row_index, row in enumerate(rows, 2):
        for column_index, (_, field) in enumerate(columns, 1):
            value = row.get(field)
            if value == "":
                value = None
            cell = sheet.cell(row=row_index, column=column_index, value=value)
            cell.font = body_font
            cell.alignment = right_alignment if field in numeric_fields else left_alignment
            if field in numeric_fields and value is not None:
                cell.number_format = "#,##0.##"
            if field == "url" and value:
                cell.hyperlink = value
                cell.style = "Hyperlink"

    sheet.freeze_panes = "A2"
    if rows:
        sheet.auto_filter.ref = sheet.dimensions
    widths = [32, 10, 10, 12, 12, 32, 20, 16, 16, 14, 14, 12, 10, 10, 14, 12, 10, 16, 24, 12, 12, 52]
    for column_index, width in enumerate(widths, 1):
        sheet.column_dimensions[chr(64 + column_index) if column_index <= 26 else "A"].width = width
    sheet.row_dimensions[1].height = 22
    workbook.properties.creator = "Tianyuan Workbench"
    workbook.save(temporary_path)
    workbook.close()

    check_workbook = load_workbook(temporary_path, read_only=True, data_only=True)
    check_sheet = check_workbook["成交案例"]
    if check_sheet.max_row != len(rows) + 1 or check_sheet.max_column != len(columns):
        raise RuntimeError("ALIBABA_EXCEL_READBACK_FAILED")
    check_workbook.close()
    os.replace(temporary_path, target_path)
finally:
    if os.path.exists(temporary_path):
        os.remove(temporary_path)
`;

const LIST_EXTRACT_SCRIPT = String.raw`(() => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const items = [];
  const seen = new Set();
  for (const anchor of document.querySelectorAll('a[href*="/sf_item/"]')) {
    const href = anchor.href || "";
    if (!href || seen.has(href)) continue;
    const text = clean(anchor.innerText || anchor.textContent || "");
    if (!text) continue;
    seen.add(href);
    items.push({ href, text });
  }
  const body = document.body?.innerText || "";
  const totalMatch = body.match(/共找到\\s*([\\d,]+)\\s*条/);
  return {
    url: location.href,
    title: document.title,
    total: totalMatch ? totalMatch[1] : "",
    items,
    pageText: clean(body.slice(0, 1200)),
  };
})()`;

const DETAIL_EXTRACT_SCRIPT = String.raw`(() => {
  const clean = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const coordinate = (value, minimum, maximum) => {
    const number = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
  };
  const pair = (longitude, latitude, source) => {
    const lng = coordinate(longitude, 70, 140);
    const lat = coordinate(latitude, 3, 55);
    return lng !== null && lat !== null ? { longitude: lng, latitude: lat, coordinateSource: source } : null;
  };
  const fromText = (value, source) => {
    const text = String(value || "");
    const patterns = [
      /(?:longitude|lng|lon|经度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)["'\s,;，；\]}]{0,80}(?:latitude|lat|纬度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i,
      /(?:latitude|lat|纬度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)["'\s,;，；\]}]{0,80}(?:longitude|lng|lon|经度)\s*["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i,
      /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    ];
    for (const [index, pattern] of patterns.entries()) {
      const match = text.match(pattern);
      if (!match) continue;
      const result = index === 1 ? pair(match[2], match[1], source) : pair(match[1], match[2], source);
      if (result) return result;
    }
    return null;
  };
  const extractBuildingArea = (value) => {
    const text = clean(value).replace(/[，]/g, ",").replace(/[：]/g, ":");
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
      if (match) return match[1].replace(/\s+/g, " ").trim();
    }
    return "";
  };
  let coordinates = null;
  for (const element of document.querySelectorAll("[data-lng], [data-lat], [data-longitude], [data-latitude], [longitude], [latitude], [经度], [纬度]")) {
    coordinates = pair(
      element.getAttribute("data-lng") || element.getAttribute("data-longitude") || element.getAttribute("longitude") || element.getAttribute("经度"),
      element.getAttribute("data-lat") || element.getAttribute("data-latitude") || element.getAttribute("latitude") || element.getAttribute("纬度"),
      "detail-dom",
    );
    if (coordinates) break;
  }
  if (!coordinates) {
    for (const element of document.querySelectorAll("iframe[src], a[href]")) {
      coordinates = fromText(element.getAttribute("src") || element.getAttribute("href"), "detail-url");
      if (coordinates) break;
    }
  }
  if (!coordinates) {
    for (const script of document.scripts) {
      coordinates = fromText(script.textContent, "detail-script");
      if (coordinates) break;
    }
  }
  const body = document.body?.innerText || "";
  const scriptText = [...document.scripts].map((script) => script.textContent || "").join("\n");
  const detailText = body + "\n" + scriptText;
  const attachments = [];
  const attachmentSeen = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.href || "";
    const name = clean(anchor.innerText || anchor.textContent || "附件");
    if (!href || (!/download_attach\.do/i.test(href) && !/\.pdf(?:$|[?#])/i.test(href))) continue;
    if (attachmentSeen.has(href)) continue;
    attachmentSeen.add(href);
    attachments.push({ name: name.slice(0, 120), href });
  }
  const normalizeFloorValue = (value) => {
    let normalized = clean(value).replace(/[（(][^）)]*[）)]/g, "").replace(/第/g, "").trim();
    if (!normalized || /^(?:总|共|建筑|层数|楼层|总层数|总楼层)$/.test(normalized)) return "";
    const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const toNumber = (text) => {
      if (/^\d+$/.test(text)) return text;
      if (text === "十") return "10";
      const ten = text.indexOf("十");
      if (ten >= 0) {
        const tens = ten === 0 ? 1 : digits[text[ten - 1]];
        const ones = ten === text.length - 1 ? 0 : digits[text[ten + 1]];
        if (Number.isInteger(tens) && Number.isInteger(ones)) return String(tens * 10 + ones);
      }
      return text.length === 1 && Number.isInteger(digits[text]) ? String(digits[text]) : text;
    };
    normalized = normalized.replace(/(地下|地上|负)?([一二两三四五六七八九十百零]+)/g, (match, prefix, number) => (prefix || "") + toNumber(number));
    if (/^(顶|底|中|高|低)(层)?$/.test(normalized)) return normalized.endsWith("层") ? normalized : normalized + "层";
    return normalized.replace(/[层楼]\s*$/, "").trim();
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
  const locationMatch = body.match(/标的物位置\s*([\s\S]{0,180}?)地图标注仅供参考/);
  const usageMatch = body.match(/房屋用途及\s*土地性质\s*([\s\S]{0,140}?)(?:钥匙|使用情况|拍卖权利限制情况)/);
  const buildingArea = extractBuildingArea(detailText);
  const decorationMatch = detailText.match(/(?:装修及其他介绍|装修情况|装修)\s*[：:\s]+([^\n\r|；;]{1,40})/i);
  const leaseMatch = detailText.match(/(?:租赁情况|租赁状态|是否有租赁|租赁)\s*[：:\s]+([^\n\r|；;]{1,60})/i);
  const floorValue = readLabeledValue(["所在楼层", "所在楼层（层）", "所在楼层(层)", "房屋所在楼层", "所在层次", "所在层数", "所在层", "房屋楼层", "楼层"]);
  const totalFloorsValue = readLabeledValue(["建筑总层数", "房屋总层数", "总层数", "总楼层", "楼层数"]);
  const floorMatch = body.match(/(?:所在楼层|所在层次|所在层数|所在层|房屋所在楼层|房屋楼层)\s*(?:为|是|位于|在|：|:|=)?\s*([^，。；;()（）\n]{1,30}?)\s*层/)
    || body.match(/(?:位于|处于)[^，,。；;()（）\n]{0,30}?(?:第\s*)?([负地下上第\d一二两三四五六七八九十百零]+(?:\s*[至\-—~～]\s*[负地下上第\d一二两三四五六七八九十百零]+)?)\s*层/);
  const totalFloorMatch = body.match(/(?:建筑物|建筑|房屋)?(?:地上|地下)?总(?:层数|楼层)\s*(?:为|是|约|共|：|:|=)?\s*([\d一二两三四五六七八九十百零]+)\s*(层)?/)
    || body.match(/共\s*([\d一二两三四五六七八九十百零]+)\s*(层)?/);
  const transactionMatch = body.match(/成交价\s*[：:]?\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)\s*元/);
  const valuationMatch = body.match(/评估价\s*[：:]?\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)\s*元?/);
  const timeMatch = body.match(/结束时间\s*([0-9]{4}[\/-][0-9]{1,2}[\/-][0-9]{1,2}\s+[0-9:]{4,8})/);
  const bidMatch = body.match(/竞买记录\s*[（(]\s*(\d+)\s*[）)]/);
  return {
    url: location.href,
    title: clean(heading),
    statusText: statusText.map(clean).slice(0, 5),
    location: clean(locationMatch?.[1] || ""),
    usage: clean(usageMatch?.[1] || ""),
    buildingArea,
    floor: normalizeFloorValue(floorValue || floorMatch?.[1] || ""),
    totalFloors: clean(totalFloorsValue || totalFloorMatch?.[1] || ""),
    pageText: body.slice(0, 12000),
    attachments: attachments.slice(0, 8),
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
  };
})()`;

function security() {
  return { credentialsReturned: false };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function normalizeRequest(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const sourceUrl = String(source.sourceUrl || DEFAULT_SOURCE_URL).trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("ALIBABA_SOURCE_URL_INVALID");
  }
  if (!/^https?:$/.test(parsedUrl.protocol) || !/(^|\.)sf\.taobao\.com$/.test(parsedUrl.hostname)) {
    throw new Error("ALIBABA_SOURCE_URL_NOT_ALLOWED");
  }
  const outputDirectory = String(source.outputDirectory || RESULT_ROOT).trim();
  if (!outputDirectory || outputDirectory.includes("\0") || !path.isAbsolute(outputDirectory)) {
    throw new Error("ALIBABA_OUTPUT_DIRECTORY_INVALID");
  }
  return {
    session: String(source.session || DEFAULT_SESSION).trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || DEFAULT_SESSION,
    sourceUrl: parsedUrl.href,
    propertyType: ["residential", "commercial"].includes(source.propertyType)
      ? source.propertyType
      : "residential",
    status: ["finished", "all"].includes(source.status) ? source.status : "finished",
    keyword: String(source.keyword || "").trim().slice(0, 100),
    startDate: String(source.startDate || "").trim().slice(0, 20),
    endDate: String(source.endDate || "").trim().slice(0, 20),
    province: String(source.province || "").trim().slice(0, 40),
    city: String(source.city || "").trim().slice(0, 40),
    district: String(source.district || "").trim().slice(0, 40),
    outputDirectory,
    generateMap: source.generateMap !== false,
  };
}

function executableCandidates() {
  const home = os.homedir();
  const configured = [process.env.TIANYUAN_OPENCLI_BIN, process.env.OPENCLI_BIN].filter(Boolean);
  const platformCandidates = process.platform === "win32"
    ? [path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "npm", "opencli.cmd")]
    : [
        path.join(home, ".npm-global", "bin", "opencli"),
        path.join(home, ".local", "bin", "opencli"),
        "/opt/homebrew/bin/opencli",
        "/usr/local/bin/opencli",
      ];
  return [...new Set([...configured, ...platformCandidates, "opencli"])]
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function commandArgs(binary, args) {
  if (process.platform === "win32" && /\.cmd$/i.test(binary)) {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", binary, ...args] };
  }
  return { command: binary, args };
}

function commandEnvironment(binary) {
  const home = os.homedir();
  const configuredNodeBins = [process.env.TIANYUAN_NODE_BIN, process.env.NODE_BIN]
    .filter(Boolean)
    .map((value) => path.dirname(String(value)));
  const platformNodeBins = process.platform === "win32"
    ? [path.dirname(process.execPath), path.join(process.env.ProgramFiles || "", "nodejs")]
    : [
        path.dirname(process.execPath),
        path.join(home, ".npm-global", "bin"),
        path.join(home, ".local", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ];
  const binaryDirectory = path.dirname(binary);
  const currentPath = String(process.env.PATH || "").split(path.delimiter);
  const pathEntries = [...configuredNodeBins, ...platformNodeBins, binaryDirectory, ...currentPath]
    .filter((value) => value && value !== ".");
  return {
    ...process.env,
    PATH: [...new Set(pathEntries)].join(path.delimiter),
  };
}

function runCommand(binary, args, options = {}) {
  const launch = commandArgs(binary, args);
  return new Promise((resolve, reject) => {
    execFile(launch.command, launch.args, {
      timeout: options.timeout || 45000,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
      windowsHide: true,
      env: commandEnvironment(binary),
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = String(stdout || "");
        error.stderr = String(stderr || "");
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function isAllowedAttachmentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "sf.taobao.com"
      || hostname.endsWith(".taobao.com")
      || hostname.endsWith(".alicdn.com")
      || hostname.endsWith(".alibaba-inc.com");
  } catch {
    return false;
  }
}

function downloadAttachment(value, redirectCount = 0) {
  if (!isAllowedAttachmentUrl(value)) throw new Error("ALIBABA_ATTACHMENT_URL_NOT_ALLOWED");
  if (redirectCount > 3) throw new Error("ALIBABA_ATTACHMENT_REDIRECT_LIMIT");
  const url = new URL(String(value));
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    };
    const request = client.get(url, {
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        "User-Agent": "Mozilla/5.0 TianyuanWorkbench",
      },
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        finish(null, downloadAttachment(new URL(response.headers.location, url).href, redirectCount + 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        finish(new Error(`ALIBABA_ATTACHMENT_HTTP_${status || "ERROR"}`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_ATTACHMENT_BYTES) {
          response.destroy();
          finish(new Error("ALIBABA_ATTACHMENT_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (size === 0) {
          finish(new Error("ALIBABA_ATTACHMENT_EMPTY"));
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
          finish(new Error("ALIBABA_ATTACHMENT_NOT_PDF"));
          return;
        }
        finish(null, buffer);
      });
      response.on("error", (error) => finish(error));
    });
    request.setTimeout(ATTACHMENT_TIMEOUT_MS, () => {
      request.destroy(new Error("ALIBABA_ATTACHMENT_TIMEOUT"));
    });
    request.on("error", (error) => finish(error));
  });
}

function commandCandidates(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

async function runFirstAvailableCommand(candidates, args, options = {}) {
  let lastError = null;
  for (const candidate of commandCandidates(candidates)) {
    try {
      return await runCommand(candidate, args, options);
    } catch (error) {
      lastError = error;
      if (!["ENOENT", "ENOTDIR"].includes(error?.code)) throw error;
    }
  }
  throw lastError || new Error("OCR_COMMAND_NOT_FOUND");
}

function ocrBinaryCandidates(kind) {
  if (kind === "pdftoppm") {
    return commandCandidates([
      process.env.TIANYUAN_PDFTOPPM_BIN,
      process.env.PDFTOPPM_BIN,
      process.platform === "win32" ? path.join(process.env.ProgramFiles || "", "poppler", "Library", "bin", "pdftoppm.exe") : "",
      process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || "", "Programs", "poppler", "Library", "bin", "pdftoppm.exe") : "",
      "/opt/homebrew/bin/pdftoppm",
      "/usr/local/bin/pdftoppm",
      "pdftoppm",
    ]);
  }
  return commandCandidates([
    process.env.TIANYUAN_TESSERACT_BIN,
    process.env.TESSERACT_BIN,
    process.platform === "win32" ? path.join(process.env.ProgramFiles || "", "Tesseract-OCR", "tesseract.exe") : "",
    process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || "", "Programs", "Tesseract-OCR", "tesseract.exe") : "",
    "/opt/homebrew/bin/tesseract",
    "/usr/local/bin/tesseract",
    "tesseract",
  ]);
}

async function extractPdfTextWithTesseract(pdfPath, tempDirectory) {
  const pageDirectory = path.join(tempDirectory, "ocr-pages");
  fs.mkdirSync(pageDirectory, { recursive: true, mode: 0o700 });
  const pagePrefix = path.join(pageDirectory, "page");
  await runFirstAvailableCommand(ocrBinaryCandidates("pdftoppm"), [
    "-f", "1",
    "-l", String(OCR_MAX_PAGES),
    "-png",
    "-r", "180",
    pdfPath,
    pagePrefix,
  ], { timeout: OCR_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
  const pagePaths = fs.readdirSync(pageDirectory)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((left, right) => Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0))
    .slice(0, OCR_MAX_PAGES)
    .map((name) => path.join(pageDirectory, name));
  const texts = [];
  for (const pagePath of pagePaths) {
    let result;
    try {
      result = await runFirstAvailableCommand(ocrBinaryCandidates("tesseract"), [
        pagePath,
        "stdout",
        "--psm", "6",
        "-l", process.env.TIANYUAN_TESSERACT_LANG || "chi_sim+eng",
      ], { timeout: OCR_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      if (!/chi_sim|language|traineddata/i.test(String(error?.stderr || error?.message || ""))) throw error;
      result = await runFirstAvailableCommand(ocrBinaryCandidates("tesseract"), [
        pagePath,
        "stdout",
        "--psm", "6",
        "-l", "eng",
      ], { timeout: OCR_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
    }
    if (result?.stdout) texts.push(result.stdout);
  }
  return texts.join("\n\n").slice(0, OCR_MAX_TEXT_LENGTH);
}

async function extractPdfTextWithOcr(pdfPath, tempDirectory) {
  try {
    const result = await runCommand(PYTHON_BIN, ["-c", PDF_OCR_SCRIPT, pdfPath, String(OCR_MAX_PAGES)], {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: 3 * 1024 * 1024,
    });
    const payload = parseJsonOutput(result.stdout);
    if (payload?.ok === true && String(payload.text || "").trim()) return String(payload.text).slice(0, OCR_MAX_TEXT_LENGTH);
  } catch {
    // A missing RapidOCR runtime falls through to an installed native OCR tool.
  }
  try {
    return await extractPdfTextWithTesseract(pdfPath, tempDirectory);
  } catch {
    return "";
  }
}

async function extractPdfText(buffer) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-alibaba-pdf-"));
  const pdfPath = path.join(tempDirectory, "attachment.pdf");
  try {
    fs.writeFileSync(pdfPath, buffer, { mode: 0o600 });
    let text = "";
    try {
      const result = await runCommand(PYTHON_BIN, ["-c", PDF_TEXT_SCRIPT, pdfPath], {
        timeout: ATTACHMENT_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
      });
      const payload = parseJsonOutput(result.stdout);
      text = payload?.ok === true ? String(payload.text || "") : "";
    } catch {
      // OCR below can still recover image-only PDFs when the Python text layer is unavailable.
    }
    const textFloors = extractFloorFieldsFromText(text);
    const needsOcr = !text.trim()
      || !extractBuildingAreaFromText(text)
      || !textFloors.floor
      || !textFloors.totalFloors;
    if (!needsOcr) return text;
    const ocrText = await extractPdfTextWithOcr(pdfPath, tempDirectory);
    if (!ocrText.trim()) return text;
    return [text, ocrText].filter((value) => String(value || "").trim()).join("\n\n").slice(0, OCR_MAX_TEXT_LENGTH);
  } catch {
    return "";
  } finally {
    try {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    } catch {
      // Temporary attachment files are best-effort cleaned after extraction.
    }
  }
}

async function downloadAttachmentWithBrowser(session, href, restoreUrl, target = "") {
  if (!session || !isAllowedAttachmentUrl(href)) throw new Error("ALIBABA_BROWSER_ATTACHMENT_UNAVAILABLE");
  let attachmentTarget = String(target || "").trim();
  try {
    const opened = await openBrowserPage(session, "https://sf.taobao.com/", {
      window: "background",
      target: attachmentTarget,
    });
    attachmentTarget = opened.target || attachmentTarget;
    const targetArgs = browserTargetArgs(attachmentTarget);
    const script = BROWSER_ATTACHMENT_SCRIPT + "(" + JSON.stringify(href) + ")";
    const result = await runOpenCli(["browser", session, "eval", script, ...targetArgs], {
      timeout: ATTACHMENT_TIMEOUT_MS,
      maxBuffer: MAX_BROWSER_ATTACHMENT_BYTES * 2,
    });
    const payload = parseJsonOutput(result.stdout);
    if (payload?.ok !== true || !payload.base64) throw new Error("ALIBABA_BROWSER_ATTACHMENT_REQUEST_FAILED");
    const buffer = Buffer.from(String(payload.base64), "base64");
    if (buffer.length > MAX_BROWSER_ATTACHMENT_BYTES || buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("ALIBABA_BROWSER_ATTACHMENT_NOT_PDF");
    }
    return buffer;
  } finally {
    if (restoreUrl) {
      try {
        await openBrowserPage(session, restoreUrl, {
          window: "background",
          target: attachmentTarget,
        });
      } catch {
        // Restoring the detail page is best-effort after a failed attachment read.
      }
    }
  }
}

async function enrichDetailFromAttachments(detail = {}, context = {}) {
  const attachments = Array.isArray(detail.attachments) ? detail.attachments : [];
  if (!attachments.length) return detail;
  const currentText = String(detail.pageText || "");
  const currentArea = parseAmount(detail.buildingArea) || extractBuildingAreaFromText(currentText);
  const currentFloors = extractFloorFieldsFromText(currentText);
  if (currentArea && currentFloors.floor && currentFloors.totalFloors) return detail;

  let combinedText = currentText;
  let attachmentCount = 0;
  const orderedAttachments = [...attachments]
    .sort((left, right) => {
      const score = (item) => {
        const name = String(item?.name || "");
        if (/评估|估价|房地产估价|assessment/i.test(name)) return 0;
        if (/权证|产权证|不动产权证/i.test(name)) return 2;
        return 1;
      };
      return score(left) - score(right);
    })
    .slice(0, MAX_ATTACHMENT_COUNT);
  for (const attachment of orderedAttachments) {
    const href = String(attachment?.href || "").trim();
    if (!href || !/download_attach\.do|\.pdf(?:$|[?#])/i.test(href) || !isAllowedAttachmentUrl(href)) continue;
    try {
      let buffer;
      try {
        buffer = await downloadAttachment(href);
      } catch {
        buffer = await downloadAttachmentWithBrowser(context.session, href, context.restoreUrl, context.target);
      }
      const text = await extractPdfText(buffer);
      if (!text.trim()) continue;
      combinedText += `\n\n附件 ${String(attachment?.name || "PDF").slice(0, 80)}\n${text}`;
      attachmentCount += 1;
      const area = parseAmount(detail.buildingArea) || extractBuildingAreaFromText(combinedText);
      const floors = extractFloorFieldsFromText(combinedText);
      if (area && !detail.buildingArea) detail.buildingArea = String(area);
      if (floors.floor && !detail.floor) detail.floor = floors.floor;
      if (floors.totalFloors && !detail.totalFloors) detail.totalFloors = floors.totalFloors;
      if (area && floors.floor && floors.totalFloors) break;
    } catch {
      // A missing or unreadable attachment must not discard an otherwise valid detail page.
    }
  }
  return attachmentCount ? { ...detail, pageText: combinedText, attachmentCount } : detail;
}

async function enrichDetailFromAttachmentBuffers(detail = {}, attachmentBuffers = []) {
  const currentText = String(detail.pageText || "");
  const currentArea = parseAmount(detail.buildingArea) || extractBuildingAreaFromText(currentText);
  const currentFloors = extractFloorFieldsFromText(currentText);
  if (currentArea && currentFloors.floor && currentFloors.totalFloors) return detail;

  let combinedText = currentText;
  let attachmentCount = 0;
  for (const attachment of (Array.isArray(attachmentBuffers) ? attachmentBuffers : []).slice(0, MAX_ATTACHMENT_COUNT)) {
    const base64 = String(attachment?.base64 || "").trim();
    if (!base64) continue;
    try {
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length <= 0 || buffer.length > MAX_ATTACHMENT_BYTES || buffer.subarray(0, 4).toString("ascii") !== "%PDF") continue;
      const text = await extractPdfText(buffer);
      if (!text.trim()) continue;
      combinedText += `\n\n附件 ${String(attachment?.name || "PDF").slice(0, 80)}\n${text}`;
      attachmentCount += 1;
      const area = parseAmount(detail.buildingArea) || extractBuildingAreaFromText(combinedText);
      const floors = extractFloorFieldsFromText(combinedText);
      if (area && !detail.buildingArea) detail.buildingArea = String(area);
      if (floors.floor && !detail.floor) detail.floor = floors.floor;
      if (floors.totalFloors && !detail.totalFloors) detail.totalFloors = floors.totalFloors;
      if (area && floors.floor && floors.totalFloors) break;
    } catch {
      // An unreadable attachment must not discard the valid detail-page fields.
    }
  }
  return attachmentCount ? { ...detail, pageText: combinedText, attachmentCount } : detail;
}

async function runOpenCli(args, options = {}) {
  let lastError = null;
  for (const candidate of executableCandidates()) {
    try {
      const result = await runCommand(candidate, args, options);
      return { ...result, binary: candidate };
    } catch (error) {
      lastError = error;
      if (!(["ENOENT", "ENOTDIR"].includes(error?.code))) break;
    }
  }
  if (lastError?.code === "ENOENT" || lastError?.code === "ENOTDIR") {
    throw new Error("OPENCLI_NOT_FOUND");
  }
  throw lastError || new Error("OPENCLI_EXEC_FAILED");
}

function parseJsonOutput(output) {
  const text = String(output || "");
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const expected = character === "}" ? "{" : "[";
        if (stack.pop() !== expected) break;
        if (!stack.length) {
          try {
            return JSON.parse(text.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("OPENCLI_JSON_INVALID");
}

function browserTargetArgs(target) {
  const page = String(target || "").trim();
  return page ? ["--tab", page] : [];
}

function openedBrowserTarget(output) {
  try {
    const payload = parseJsonOutput(output);
    return String(payload?.page || "").trim();
  } catch {
    return "";
  }
}

function browserUrlsMatch(actual, expected) {
  const left = canonicalUrl(actual);
  const right = canonicalUrl(expected);
  if (left === right) return true;
  try {
    const actualUrl = new URL(left);
    const expectedUrl = new URL(right);
    return actualUrl.origin === expectedUrl.origin
      && actualUrl.pathname.replace(/\/$/, "") === expectedUrl.pathname.replace(/\/$/, "")
      && actualUrl.search === expectedUrl.search;
  } catch {
    return false;
  }
}

async function openBrowserPage(session, url, options = {}) {
  const expectedUrl = canonicalUrl(url);
  const requestedTarget = String(options.target || "").trim();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const opened = await runOpenCli([
        "browser", session, "open", "--window", options.window || "background", expectedUrl,
        ...browserTargetArgs(requestedTarget),
      ], { timeout: 60000 });
      const target = requestedTarget || openedBrowserTarget(opened.stdout);
      const targetArgs = browserTargetArgs(target);
      await runOpenCli(["browser", session, "wait", "time", "1", ...targetArgs], { timeout: 10000 });
      const location = parseJsonOutput((await runOpenCli([
        "browser", session, "eval", BROWSER_LOCATION_SCRIPT, ...targetArgs,
      ], { timeout: 30000 })).stdout);
      if (browserUrlsMatch(location.url, expectedUrl)) return { target, url: canonicalUrl(location.url) };
      lastError = new Error("ALIBABA_BROWSER_TARGET_MISMATCH");
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) {
      await runOpenCli(["browser", session, "wait", "time", String(attempt + 1)], { timeout: 10000 }).catch(() => {});
    }
  }
  throw lastError || new Error("ALIBABA_BROWSER_TARGET_MISMATCH");
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.searchParams.delete("track_id");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
}

function parseAmount(value) {
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function chineseFloorNumber(value) {
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

function normalizeFloorValue(value) {
  let normalized = String(value || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/第/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^(?:总|共|建筑|层数|楼层|总层数|总楼层)$/.test(normalized)) return "";
  normalized = normalized.replace(/(地下|地上|负)?([一二两三四五六七八九十百零]+)/g, (match, prefix, number) => `${prefix || ""}${chineseFloorNumber(number)}`);
  if (/^(顶|底|中|高|低)(层)?$/.test(normalized)) return normalized.endsWith("层") ? normalized : `${normalized}层`;
  return normalized.replace(/[层楼]\s*$/, "").trim();
}

function normalizeTotalFloorValue(value) {
  const original = String(value || "").replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim();
  if (!original) return "";
  const hasUnit = /[层楼]/.test(original);
  const numberText = original.replace(/[层楼]/g, "").replace(/^(?:共|约|为|是)\s*/, "").trim();
  const number = chineseFloorNumber(numberText);
  return /^\d+$/.test(number) ? `${number}${hasUnit ? "层" : ""}` : original;
}

function inferFloorFromPropertyText(value) {
  const text = String(value || "");
  const match = text.match(/(?:^|[^\d])(\d{3,4})\s*(?:室|号)(?!\d)/);
  if (!match) return "";
  const floor = match[1].slice(0, -2).replace(/^0+/, "");
  return floor ? floor : "0";
}

function extractBuildingAreaFromText(value) {
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
    if (match) return parseAmount(match[1]);
  }
  return null;
}

function extractFloorFieldsFromText(value) {
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
  const normalizeFloor = normalizeFloorValue;
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
  const totalFloors = normalizeTotalFloorValue(totalRaw);
  return { floor: floorFallback, totalFloors };
}

function parseCoordinate(value, minimum, maximum) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function normalizeDate(value) {
  const match = String(value || "").match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(value || "").trim();
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function firstCity(value) {
  const match = String(value || "").match(/(?:浙江省)?\s*([^省市县区]{1,16})市/);
  return match?.[1] ? `${match[1]}市` : "";
}

function firstDistrict(value, request = {}) {
  const text = String(value || "");
  if (request.district && text.includes(request.district)) return request.district;
  const match = text.match(/(?:市|地区)\s*([\u4e00-\u9fa5]{1,12}(?:区|县|市))/);
  return match?.[1] || "";
}

function stripLocationPrefixes(value, prefixes) {
  const original = String(value || "").replace(/\s+/g, " ").trim();
  let result = original;
  const names = [...new Set(prefixes.map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (let index = 0; index < 6; index += 1) {
    const prefix = names.find((name) => result.startsWith(name));
    if (!prefix) break;
    result = result.slice(prefix.length).replace(/^[\s,，、;；:：-]+/, "").trim();
  }
  return result || original;
}

function normalizeLease(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/无租赁|未出租|空置|无承租/.test(text)) return "空置";
  if (/带租|出租|租赁期限|租期|租金/.test(text)) return "出租中";
  if (/占有|占用|未腾空/.test(text)) return "占用";
  return text;
}

function firstPropertyType(value) {
  const text = String(value || "");
  if (text.includes("住宅用房") || text.includes("住宅房")) return "住宅用房";
  if (text.includes("商业房") || text.includes("商业用房")) return "商业房";
  return "";
}

function parseDetail(detail, request) {
  const transactionAmount = parseAmount(detail.transactionAmount);
  const valuationAmount = parseAmount(detail.valuationAmount);
  const buildingArea = parseAmount(detail.buildingArea) || extractBuildingAreaFromText(`${detail.buildingArea || ""}\n${detail.pageText || ""}`);
  const floorFields = extractFloorFieldsFromText(detail.pageText);
  const inferredFloor = inferFloorFromPropertyText([detail.title, detail.location].filter(Boolean).join(" "));
  const bidCount = boundedInteger(detail.bidCount, 0, 0, 1000000);
  const finished = detail.hasSoldText === true && detail.hasInvalidStatus !== true
    && (request.status !== "finished" || detail.hasEndedText === true)
    && Boolean(transactionAmount) && bidCount > 0;
  const rawLocation = String(detail.location || "").trim();
  const city = firstCity(rawLocation) || String(request.city || "").trim();
  const district = firstDistrict(rawLocation, request);
  const location = stripLocationPrefixes(rawLocation, [request.province, city, district]);
  const propertyType = firstPropertyType(detail.usage) || request.propertyType;
  return {
    title: String(detail.title || "").trim(),
    province: String(request.province || "浙江省").trim(),
    city,
    district,
    propertyType,
    address: location,
    coordinateStatus: parseCoordinate(detail.longitude, 70, 140) !== null && parseCoordinate(detail.latitude, 3, 55)
      !== null ? "已定位（详情页坐标）" : "未定位（详情页未返回坐标）",
    coordinateSource: detail.coordinateSource || "",
    coordinatePrecision: detail.coordinateSource ? "exact" : "",
    longitude: parseCoordinate(detail.longitude, 70, 140),
    latitude: parseCoordinate(detail.latitude, 3, 55),
    transactionTime: normalizeDate(detail.transactionTime),
    transactionAmount,
    valuationAmount,
    buildingArea,
    unitPrice: transactionAmount && buildingArea ? Math.round((transactionAmount / buildingArea) * 100) / 100 : null,
    floor: normalizeFloorValue(floorFields.floor || detail.floor || inferredFloor),
    totalFloors: parseAmount(normalizeTotalFloorValue(floorFields.totalFloors || detail.totalFloors)),
    decoration: String(detail.decoration || "").trim(),
    leaseStatus: normalizeLease(detail.leaseStatus),
    platform: "阿里拍卖",
    bidCount,
    verificationStatus: finished ? "详情核验通过" : "未通过成交核验",
    url: canonicalUrl(detail.url),
    valid: finished,
  };
}

function matchesRequest(record, request) {
  const keyword = String(request.keyword || "").trim();
  const searchable = `${record.title || ""} ${record.address || ""}`;
  if (keyword && !searchable.includes(keyword)) return false;
  const expectedProperty = PROPERTY_LABELS[request.propertyType];
  if (expectedProperty && record.propertyType && record.propertyType !== expectedProperty) return false;
  const date = String(record.transactionTime || "").slice(0, 10);
  if (request.startDate && (!date || date < request.startDate)) return false;
  if (request.endDate && (!date || date > request.endDate)) return false;
  return true;
}

function candidateInScope(item, request) {
  const text = String(item?.text || "");
  if (request.status === "finished" && /距开始|距开拍|距结束|尚未开始|未开始|即将开始|立即报名|报名中|竞买中/.test(text)) {
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

function pageBeforeRequestedRange(items, request) {
  if (request.status !== "finished" || !request.startDate) return false;
  const dates = (Array.isArray(items) ? items : [])
    .flatMap((item) => String(item?.text || "").match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [])
    .map((value) => value.replaceAll("/", "-"));
  return dates.length > 0 && dates.every((date) => date < request.startDate);
}

function listPageUrl(sourceUrl, page) {
  const url = new URL(sourceUrl);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return url.href;
}

function pageLooksBlocked(value) {
  const text = `${value?.title || ""} ${value?.pageText || ""}`;
  if (/验证码|滑块|安全验证|访问验证|captcha|punish/i.test(text)) return "ALIBABA_VERIFICATION_REQUIRED";
  if (/登录淘宝|请登录|login\.taobao/i.test(text)) return "ALIBABA_LOGIN_REQUIRED";
  return "";
}

function safeError(error) {
  const output = [error?.stderr, error?.stdout]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    || String(error?.message || error || "OPENCLI_EXEC_FAILED");
  const message = output
    .replace(/(?:token|cookie|authorization|password|验证码)\s*[:=]?\s*[^\s;,]+/gi, "[已隐藏]")
    .replace(/-EncodedCommand\s+\S+/gi, "-EncodedCommand [已隐藏]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
  return message || "OPENCLI_EXEC_FAILED";
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

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return String(value);
}

function renderResultHtml(results, request, metadata = {}) {
  const columns = [
    ["案例标题", "title"], ["省份", "province"], ["城市", "city"], ["区县", "district"],
    ["物业类型", "propertyType"], ["坐落位置", "address"], ["交易时间", "transactionTime"],
    ["交易金额（元）", "transactionAmount"], ["评估价", "valuationAmount"], ["建筑面积（m²）", "buildingArea"],
    ["单价", "unitPrice"], ["所在楼层", "floor"], ["总层数", "totalFloors"], ["装修", "decoration"],
    ["租赁情况", "leaseStatus"], ["案例平台", "platform"], ["出价次数", "bidCount"],
    ["核验状态", "verificationStatus"], ["坐标状态", "coordinateStatus"], ["经度", "longitude"],
    ["纬度", "latitude"], ["案例网址", "url"],
  ];
  const numericFields = new Set(["transactionAmount", "valuationAmount", "buildingArea", "unitPrice", "totalFloors", "bidCount", "longitude", "latitude"]);
 const header = columns.map(([label], index) => `<th><div class="table-header-cell"><span>${escapeHtml(label)}</span><button class="column-filter-trigger" type="button" data-column="${index + 1}" aria-label="筛选${escapeHtml(label)}" title="筛选${escapeHtml(label)}"><span class="filter-funnel" aria-hidden="true"></span></button></div></th>`).join("");
  const rows = (Array.isArray(results) ? results : []).map((item, rowIndex) => {
    const mapKey = String(rowIndex + 1);
    const hasCoordinate = mapNumber(item?.longitude, 70, 140) !== null && mapNumber(item?.latitude, 3, 55) !== null;
    const checkbox = `<input class="result-select" type="checkbox" data-map-key="${mapKey}" aria-label="选择第 ${rowIndex + 1} 条案例"${hasCoordinate ? "" : " disabled title=\"该记录没有坐标，无法在地图上定位\""}>`;
    const cells = columns.map(([label, field]) => {
      const value = field === "transactionTime" ? normalizeDate(item?.[field]) : item?.[field];
      const cellClass = numericFields.has(field) ? "numeric-cell" : "";
      if (field === "url" && value) {
        return `<td class="${cellClass}"><a href="${escapeHtml(safeExportUrl(value))}" target="_blank" rel="noopener noreferrer">打开详情</a></td>`;
      }
      return `<td class="${cellClass}">${escapeHtml(displayValue(value))}</td>`;
    }).join("");
    return `<tr data-map-key="${mapKey}"${hasCoordinate ? "" : " class=\"no-coordinate\""}><td class="select-cell">${checkbox}</td>${cells}</tr>`;
  }).join("");
  const sourceUrl = escapeHtml(safeExportUrl(request.sourceUrl));
  const generatedAt = escapeHtml(new Date().toLocaleString("zh-CN", { hour12: false }));
  const skipped = Number(metadata.skipped || 0);
  const mapName = request.generateMap === false ? "" : "latest_map.html";
  const mapLink = mapName
    ? `<a class="button secondary" href="${mapName}" target="_blank" rel="noopener noreferrer">打开独立地图</a>`
    : '<button class="button secondary" type="button" disabled>本次未生成地图</button>';
  const mapPreview = mapName
    ? `<div class="map-frame-shell" aria-label="可调整大小的地图区域"><iframe id="alibaba-map-frame" title="阿里司法拍卖地图" src="${mapName}"></iframe><div id="alibaba-map-resize-handle" class="map-resize-handle" role="separator" aria-orientation="vertical" aria-label="拖动调整地图高度" title="拖动调整地图高度"></div></div>`
    : '<div class="map-empty">本次未生成地图；结果表仍保留坐标状态。</div>';
  const excelActions = '<div class="actions"><a class="button" href="latest.xlsx" download>下载 Excel</a><a class="button secondary" href="latest.xlsx" target="_blank" rel="noopener noreferrer">打开 Excel</a></div>';
  const emptyNotice = results.length ? "" : '<div class="inline-notice"><strong>暂未找到符合条件的成交案例</strong><p>请检查地区、拍卖状态、物业类型和成交日期。</p></div>';
  const filterScript = `<script>
(() => {
  const frame = document.getElementById("alibaba-map-frame");
  const shell = document.querySelector(".map-frame-shell");
  const resizeHandle = document.getElementById("alibaba-map-resize-handle");
  const filter = document.getElementById("result-filter");
  const count = document.getElementById("result-count");
  const clearSelection = document.getElementById("clear-selection");
  const clearFilters = document.getElementById("clear-filters");
  const rows = Array.from(document.querySelectorAll("#result-table tbody tr[data-map-key]"));
  const triggers = Array.from(document.querySelectorAll(".column-filter-trigger"));
  const popover = document.getElementById("column-filter-popover");
  const popoverLabel = document.getElementById("column-filter-label");
  const popoverInput = document.getElementById("column-filter-input");
  const clearColumn = document.getElementById("clear-column-filter");
  const closeColumn = document.getElementById("close-column-filter");
  const selected = new Set();
  const columnFilters = new Map();
  let activeColumn = null;
  let resizeState = null;
  function send(message) { if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, "*"); }
  function updateSelection() {
    document.querySelectorAll(".result-select").forEach((input) => input.closest("tr")?.classList.toggle("selected-row", input.checked));
    if (count) count.textContent = \`显示 \${rows.filter((row) => !row.hidden).length} 条，已选 \${selected.size} 条\`;
    if (clearSelection) clearSelection.disabled = selected.size === 0;
    send({ type: "ALIBABA_MAP_SET_SELECTED", ids: [...selected] });
  }
  function applyFilters() {
    const query = String(filter?.value || "").trim().toLowerCase();
    const active = [...columnFilters.entries()].filter(([, value]) => value).map(([index, value]) => ({ index, value: value.toLowerCase() }));
    rows.forEach((row) => {
      const globalMatch = !query || row.textContent.toLowerCase().includes(query);
      const columnMatch = active.every(({ index, value }) => String(row.cells[index]?.textContent || "").toLowerCase().includes(value));
      row.hidden = !(globalMatch && columnMatch);
    });
    updateSelection();
  }
  function syncTriggerState() { triggers.forEach((item) => item.classList.toggle("active", Boolean(columnFilters.get(Number(item.dataset.column))))); }
  function closePopover() { if (popover) popover.hidden = true; triggers.forEach((item) => item.closest("th")?.classList.remove("filter-open")); activeColumn = null; }
  function openPopover(trigger) {
    if (!popover || !popoverInput) return;
    activeColumn = Number(trigger.dataset.column);
    popoverLabel.textContent = trigger.getAttribute("aria-label") || "列筛选";
    popoverInput.value = columnFilters.get(activeColumn) || "";
    triggers.forEach((item) => item.closest("th")?.classList.toggle("filter-open", item === trigger));
    popover.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const width = 230;
   popover.style.left = \`\${Math.min(Math.max(8, rect.left - 150), Math.max(8, window.innerWidth - width - 8))}px\`;
   popover.style.top = \`\${Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 90))}px\`;
    popoverInput.focus(); popoverInput.select();
  }
  function stopResize(event) {
    if (!resizeState) return;
    resizeHandle?.releasePointerCapture?.(event?.pointerId);
    resizeState = null;
    document.body.classList.remove("resizing-map");
  }
  resizeHandle?.addEventListener("pointerdown", (event) => {
    if (!shell) return;
    event.preventDefault();
    resizeState = { y: event.clientY, height: shell.getBoundingClientRect().height };
    resizeHandle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("resizing-map");
  });
  resizeHandle?.addEventListener("pointermove", (event) => {
    if (!resizeState || !shell) return;
   shell.style.height = \`\${Math.max(window.innerWidth < 820 ? 320 : 380, Math.round(resizeState.height + event.clientY - resizeState.y))}px\`;
  });
  resizeHandle?.addEventListener("pointerup", stopResize);
  resizeHandle?.addEventListener("pointercancel", stopResize);
  rows.forEach((row) => {
    const checkbox = row.querySelector(".result-select");
    checkbox?.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.mapKey;
      if (!key) return;
      if (event.currentTarget.checked) selected.add(key); else selected.delete(key);
      updateSelection();
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("input, a, button")) return;
      send({ type: "ALIBABA_MAP_FOCUS", ids: [row.dataset.mapKey] });
    });
  });
  filter?.addEventListener("input", applyFilters);
  triggers.forEach((trigger) => trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!popover.hidden && activeColumn === Number(trigger.dataset.column)) closePopover(); else openPopover(trigger);
  }));
  popoverInput?.addEventListener("input", () => {
    if (activeColumn === null) return;
    const value = popoverInput.value.trim();
    if (value) columnFilters.set(activeColumn, value); else columnFilters.delete(activeColumn);
    syncTriggerState(); applyFilters();
  });
  clearColumn?.addEventListener("click", () => {
    if (activeColumn !== null) columnFilters.delete(activeColumn);
    if (popoverInput) popoverInput.value = "";
    syncTriggerState(); applyFilters();
  });
  closeColumn?.addEventListener("click", closePopover);
  clearFilters?.addEventListener("click", () => {
    if (filter) filter.value = "";
    columnFilters.clear();
    if (popoverInput) popoverInput.value = "";
    syncTriggerState(); closePopover(); applyFilters();
  });
  clearSelection?.addEventListener("click", () => {
    selected.clear();
    document.querySelectorAll(".result-select").forEach((input) => { input.checked = false; });
    updateSelection();
  });
  frame?.addEventListener("load", () => send({ type: "ALIBABA_MAP_SET_SELECTED", ids: [...selected] }));
  document.addEventListener("click", (event) => { if (!event.target.closest(".column-filter-popover, .column-filter-trigger")) closePopover(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });
  applyFilters();
})();
</script>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阿里司法拍卖成交案例</title>
<style>
 :root{color-scheme:light;--text:#1c2430;--muted:#667085;--line:#e5e9f0;--soft:#f8fafc;--blue:#2457c5}
 *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:var(--text);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1480px;margin:0 auto;padding:16px 20px 28px}h1{margin:0;font-size:21px}h2{margin:0;font-size:16px}.muted{color:var(--muted)}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:8px}.head p{margin:4px 0;color:var(--muted)}.head-right{text-align:right;color:var(--muted);font-size:12px}.summary-strip{display:flex;flex-wrap:wrap;gap:7px 16px;padding:8px 10px;margin-bottom:8px;background:#fff;border:1px solid var(--line);border-radius:8px;color:var(--muted)}.summary-strip strong{color:var(--text)}.source{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source a,a{color:var(--blue);text-decoration:none}.source a:hover,a:hover{text-decoration:underline}.card{background:#fff;border:1px solid var(--line);border-radius:9px;box-shadow:0 3px 12px rgba(29,41,57,.04);padding:10px;margin:8px 0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.actions{display:flex;gap:7px;flex-wrap:wrap}.button{display:inline-block;padding:6px 10px;border:0;border-radius:7px;background:var(--blue);color:#fff;text-decoration:none;font-size:12px;white-space:nowrap;cursor:pointer}.button.secondary{background:#eef3ff;color:var(--blue)}.button:disabled{opacity:.5;cursor:default}.map-frame-shell{position:relative;width:100%;height:440px;min-height:380px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#f8fafc}.map-frame-shell iframe{display:block;width:100%;height:100%;border:0;border-radius:inherit}.map-resize-handle{position:absolute;z-index:4;left:0;right:0;bottom:0;height:14px;cursor:ns-resize;touch-action:none;background:linear-gradient(to bottom,transparent 0,transparent 45%,rgba(36,87,197,.15) 46%,rgba(36,87,197,.15) 54%,transparent 55%)}.map-resize-handle:after{content:"";position:absolute;left:50%;bottom:4px;width:34px;height:3px;transform:translateX(-50%);border-radius:4px;background:#98a2b3}.map-empty,.inline-notice{padding:12px;color:var(--muted);background:#f8fafc;border-radius:7px}.inline-notice{margin-bottom:8px;color:#8b5e00;background:#fff8e6}.inline-notice p{margin:3px 0 0}.table-toolbar{display:flex;align-items:center;gap:7px;margin:-1px 0 8px}.result-filter{width:300px;max-width:100%;padding:6px 8px;border:1px solid #d0d7e2;border-radius:7px;font:inherit;font-size:12px}.result-filter:focus,.column-filter-popover input:focus{outline:2px solid #c7d7ff;border-color:var(--blue)}.result-count{color:var(--muted);font-size:12px}.table-toolbar .clear-selection{margin-left:auto}.clear-selection,.clear-filters{border:0;border-radius:7px;padding:6px 9px;background:#eef3ff;color:var(--blue);font-size:12px;cursor:pointer}.clear-selection:disabled{opacity:.45;cursor:default}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:7px}table{border-collapse:collapse;width:100%;min-width:1800px;white-space:nowrap}th,td{padding:7px 8px;border-bottom:1px solid #edf0f5;text-align:left;vertical-align:middle}th{position:sticky;top:0;z-index:3;background:var(--soft);font-weight:700}td.numeric-cell{text-align:right;font-variant-numeric:tabular-nums}th:first-child,td.select-cell{width:36px;text-align:center;padding-left:6px;padding-right:6px}.result-select{width:14px;height:14px;accent-color:#f97316}tr[data-map-key]{cursor:pointer}tr[data-map-key]:hover{background:#f5f8ff}tr.selected-row{background:#fff4df!important}tr.no-coordinate{background:#fffaf0}.table-header-cell{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0}.table-header-cell>span{overflow:hidden;text-overflow:ellipsis}.column-filter-trigger{display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:#98a2b3;cursor:pointer}.column-filter-trigger:hover,.column-filter-trigger.active{background:#eaf1ff;color:var(--blue)}.filter-funnel{position:relative;display:block;width:11px;height:12px}.filter-funnel:before{content:"";position:absolute;left:1px;top:1px;width:9px;height:5px;background:currentColor;clip-path:polygon(0 0,100% 0,62% 100%,38% 100%)}.filter-funnel:after{content:"";position:absolute;left:5px;top:6px;width:2px;height:5px;background:currentColor;border-radius:1px}.column-filter-popover{position:fixed;z-index:10000;width:230px;padding:9px;background:#fff;border:1px solid #dbe3ef;border-radius:8px;box-shadow:0 10px 26px rgba(15,23,42,.18)}.column-filter-popover[hidden]{display:none}.column-filter-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;color:#344054;font-size:12px;font-weight:700}.column-filter-popover-close{border:0;background:transparent;color:#98a2b3;font-size:17px;line-height:1;cursor:pointer}.column-filter-popover input{width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:12px}.column-filter-actions{display:flex;justify-content:flex-end;margin-top:7px}.column-filter-actions button{border:0;border-radius:6px;padding:5px 8px;background:#eef3ff;color:var(--blue);font-size:11px;cursor:pointer}.foot{margin-top:8px;color:var(--muted);font-size:12px}body.resizing-map{user-select:none;cursor:ns-resize}body.resizing-map iframe{pointer-events:none}@media (max-width:820px){main{padding:12px}.head{display:block}.head-right{text-align:left}.map-frame-shell{height:360px;min-height:320px}.table-toolbar{flex-wrap:wrap}.table-toolbar .clear-selection{margin-left:0}}
 </style></head><body><main>
 <div class="head"><div><h1>阿里司法拍卖成交案例</h1><p>本地脚本读取已打开页面并逐条核验详情，不使用 AI 自动判断。</p></div><div class="head-right">生成时间：${generatedAt}</div></div>
 <div class="summary-strip"><span>有效案例：<strong>${results.length}</strong> 条</span><span>候选记录：<strong>${Number(metadata.candidates || 0)}</strong> 条</span><span>跳过记录：<strong>${skipped}</strong> 条</span><span>拍卖状态：<strong>${escapeHtml(request.status === "finished" ? "已结束" : "全部状态")}</strong></span><span>物业类型：<strong>${escapeHtml(request.propertyType || "全部不动产")}</strong></span><span>成交日期：<strong>${escapeHtml(request.startDate || "不限")} 至 ${escapeHtml(request.endDate || "不限")}</strong></span></div>
 <div class="summary-strip source">列表来源：<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceUrl}</a></div>
 <section class="card"><div class="section-heading"><h2>地图（${results.filter((item) => mapNumber(item?.longitude, 70, 140) !== null && mapNumber(item?.latitude, 3, 55) !== null).length} 条可定位结果）</h2><div class="actions">${mapLink}</div></div>${mapPreview}</section>
 <section class="card"><div class="section-heading"><h2>成交案例明细</h2>${excelActions}</div>${emptyNotice}<div class="table-toolbar"><input id="result-filter" class="result-filter" type="search" placeholder="筛选标题、位置、行政区、物业类型……" aria-label="筛选成交案例"><span id="result-count" class="result-count"></span><button id="clear-filters" class="clear-filters" type="button">清除筛选</button><button id="clear-selection" class="clear-selection" type="button" disabled>清除勾选</button></div><div id="column-filter-popover" class="column-filter-popover" hidden><div class="column-filter-popover-head"><span id="column-filter-label">列筛选</span><button id="close-column-filter" class="column-filter-popover-close" type="button" aria-label="关闭">×</button></div><input id="column-filter-input" type="search" placeholder="输入关键词"><div class="column-filter-actions"><button id="clear-column-filter" type="button">清除当前列</button></div></div><div class="table-wrap"><table id="result-table"><thead><tr><th>选择</th>${header}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + 1}" class="empty">暂未找到符合条件的成交案例</td></tr>`}</tbody></table></div></section>
 <div class="foot">成交案例仅保留详情页显示成交且出价次数大于 0 的记录；点击行可在地图中定位，勾选有坐标的案例可在地图上突出显示。</div>
 ${filterScript}</main></body></html>`;
}

function outputDirectoryFor(request = {}) {
  const raw = String(request.outputDirectory || RESULT_ROOT).trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("ALIBABA_OUTPUT_DIRECTORY_INVALID");
  fs.mkdirSync(raw, { recursive: true, mode: 0o700 });
  const resolved = fs.realpathSync(raw);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("ALIBABA_OUTPUT_DIRECTORY_NOT_DIRECTORY");
  return resolved;
}

function writeUtf8Atomic(target, content) {
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
}

function mapNumber(value, minimum, maximum) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function mapRowsFromResults(results) {
  return (Array.isArray(results) ? results : []).map((item, index) => ({
    id: String(index + 1),
    title: String(item?.title || "").trim(),
    province: String(item?.province || "").trim(),
    city: String(item?.city || "").trim(),
    district: String(item?.district || "").trim(),
    propertyType: String(item?.propertyType || "").trim(),
    address: String(item?.address || "").trim(),
    transactionTime: normalizeDate(item?.transactionTime),
    transactionAmount: item?.transactionAmount ?? "",
    valuationAmount: item?.valuationAmount ?? "",
    buildingArea: item?.buildingArea ?? "",
    unitPrice: item?.unitPrice ?? "",
    bidCount: item?.bidCount ?? "",
    coordinateStatus: String(item?.coordinateStatus || (item?.longitude != null && item?.latitude != null ? "已定位（详情页坐标）" : "未定位（详情页未返回坐标）")).trim(),
    coordinateSource: String(item?.coordinateSource || "").trim(),
    coordinateProvider: String(item?.coordinateProvider || "").trim(),
    coordinatePrecision: String(item?.coordinatePrecision || "").trim(),
    longitude: mapNumber(item?.longitude, 70, 140),
    latitude: mapNumber(item?.latitude, 3, 55),
    url: safeExportUrl(item?.url),
  }));
}

const geocodeCache = new Map();
const geocodeFailureCache = new Set();
let geocodeCacheLoadedPath = "";
let geocodeCacheDirty = false;
let lastGeocodeAt = 0;

const emptyGeocodeStats = () => ({
  geocodeRequested: 0,
  geocodeCacheHits: 0,
  geocodeResolved: 0,
  geocodeFailed: 0,
  geocodeTimedOut: 0,
  geocodeDurationMs: 0,
});

function geocodeCachePath() {
  const configured = String(process.env.TIANYUAN_ALIBABA_GEOCODE_CACHE_PATH || "").trim();
  return configured && path.isAbsolute(configured) ? configured : DEFAULT_GEOCODE_CACHE_PATH;
}

function validCoordinatePair(value) {
  const longitude = mapNumber(value?.longitude, 70, 140);
  const latitude = mapNumber(value?.latitude, 3, 55);
  return longitude !== null && latitude !== null ? { longitude, latitude } : null;
}

function normalizeGeocodeText(value) {
  return String(value || "")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/[，,、；;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressSearchVariants(address, request = {}) {
  const raw = normalizeGeocodeText(address);
  if (!raw) return [];
  const context = [request.province, request.city, request.district]
    .map(normalizeGeocodeText)
    .filter(Boolean);
  const full = normalizeGeocodeText([...context, raw].join(" "));
  const noParenthetical = normalizeGeocodeText(raw.replace(/[（(][^）)]{0,100}[）)]/g, " "));
  const coarse = normalizeGeocodeText(noParenthetical
    .replace(/\d{1,5}\s*(?:号|幢|栋|座|单元|室|层|楼)/g, " ")
    .replace(/(?:第\s*)?\d{1,5}\s*(?:号楼|号院)/g, " "));
  const firstPart = normalizeGeocodeText(noParenthetical.split(/[。]/)[0]);
  const variants = [
    full,
    normalizeGeocodeText([...context, noParenthetical].join(" ")),
    normalizeGeocodeText([...context, coarse].join(" ")),
    normalizeGeocodeText([request.city, request.district, coarse].filter(Boolean).join(" ")),
    normalizeGeocodeText([request.city, firstPart].filter(Boolean).join(" ")),
    raw,
  ];
  return [...new Set(variants.filter(Boolean))];
}

function outOfChina(longitude, latitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude, latitude) {
  const value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
    + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  return value + (20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3
    + (20 * Math.sin(latitude * Math.PI) + 40 * Math.sin(latitude / 3 * Math.PI)) * 2 / 3
    + (160 * Math.sin(latitude / 12 * Math.PI) + 320 * Math.sin(latitude * Math.PI / 30)) * 2 / 3;
}

function transformLongitude(longitude, latitude) {
  const value = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
    + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  return value + (20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3
    + (20 * Math.sin(longitude * Math.PI) + 40 * Math.sin(longitude / 3 * Math.PI)) * 2 / 3
    + (150 * Math.sin(longitude / 12 * Math.PI) + 300 * Math.sin(longitude / 30 * Math.PI)) * 2 / 3;
}

function gcj02ToWgs84(longitude, latitude) {
  const pair = validCoordinatePair({ longitude, latitude });
  if (!pair || outOfChina(pair.longitude, pair.latitude)) return pair;
  const dLatitude = transformLatitude(pair.longitude - 105, pair.latitude - 35);
  const dLongitude = transformLongitude(pair.longitude - 105, pair.latitude - 35);
  const radLatitude = pair.latitude / 180 * Math.PI;
  let magic = Math.sin(radLatitude);
  magic = 1 - 0.00669342162296594323 * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  return {
    longitude: Number((pair.longitude - (dLongitude * 180 / (6378245 * sqrtMagic * Math.cos(radLatitude) * Math.PI))).toFixed(6)),
    latitude: Number((pair.latitude - (dLatitude * 180 / (6335552.717 * magic * sqrtMagic * Math.PI))).toFixed(6)),
  };
}

function amapCityCode(request = {}) {
  for (const value of [request.districtCode, request.cityCode]) {
    if (/^\d{6}$/.test(String(value || "").trim())) return String(value).trim();
  }
  return "";
}

function amapCandidates(payload) {
  const list = payload?.data?.tip_list;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => entry?.tip || entry).filter((entry) => entry && typeof entry === "object");
}

function candidateScore(candidate, query, request = {}, address = "") {
  const text = normalizeGeocodeText([
    candidate?.name, candidate?.address, candidate?.district, candidate?.cityname,
  ].filter(Boolean).join(" "));
  const compactText = text.replace(/\s+/g, "");
  const compactAddress = normalizeGeocodeText(address).replace(/\s+/g, "");
  const compactQuery = normalizeGeocodeText(query).replace(/\s+/g, "");
  let score = 0;
  if (compactAddress && (compactText.includes(compactAddress) || compactAddress.includes(compactText))) score += 40;
  if (compactQuery && compactText.includes(compactQuery)) score += 30;
  for (const value of [request.city, request.district]) {
    const token = normalizeGeocodeText(value).replace(/[省市区县]$/g, "");
    if (!token) continue;
    if (text.includes(token)) score += 12;
    else score -= 12;
  }
  if (candidate?.name && compactAddress && compactAddress.includes(normalizeGeocodeText(candidate.name).replace(/\s+/g, ""))) score += 8;
  return score;
}

function parseAmapCoordinate(payload, query, request = {}, address = "") {
  const candidates = amapCandidates(payload)
    .map((candidate) => ({
      candidate,
      coordinates: gcj02ToWgs84(candidate?.x, candidate?.y),
      score: candidateScore(candidate, query, request, address),
    }))
    .filter((entry) => entry.coordinates)
    .sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    ...selected.coordinates,
    coordinateSource: "address-search",
    coordinateProvider: "amap",
    coordinatePrecision: selected.score >= 40 ? "poi" : "address",
  };
}

function parseNominatimCoordinate(payload) {
  const first = Array.isArray(payload) ? payload[0] : null;
  const result = validCoordinatePair({ longitude: first?.lon, latitude: first?.lat });
  return result ? { ...result, coordinateSource: "address-search", coordinateProvider: "nominatim", coordinatePrecision: "address" } : null;
}

function loadPersistentGeocodeCache() {
  const target = geocodeCachePath();
  if (geocodeCacheLoadedPath === target) return;
  geocodeCache.clear();
  geocodeFailureCache.clear();
  geocodeCacheLoadedPath = target;
  geocodeCacheDirty = false;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    if (parsed?.version !== GEOCODE_CACHE_VERSION || !parsed.entries || typeof parsed.entries !== "object") return;
    for (const [key, value] of Object.entries(parsed.entries)) {
      const cacheKey = String(key || "").trim();
      const coordinates = validCoordinatePair(value);
      if (cacheKey && coordinates) geocodeCache.set(cacheKey, coordinates);
    }
  } catch {
    // A missing or damaged cache is non-fatal. The next successful lookup
    // writes a fresh versioned file atomically.
  }
}

function persistGeocodeCache() {
  if (!geocodeCacheDirty) return;
  const target = geocodeCachePath();
  const entries = {};
  for (const [key, value] of geocodeCache.entries()) {
    const coordinates = validCoordinatePair(value);
    if (coordinates) entries[key] = coordinates;
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeUtf8Atomic(target, `${JSON.stringify({ version: GEOCODE_CACHE_VERSION, entries }, null, 2)}\n`);
    geocodeCacheDirty = false;
  } catch {
    // Coordinate lookup must never prevent the result HTML/map from being
    // generated. Keep the in-memory value for this run and retry next time.
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function timeoutError() {
  const error = new Error("GEOCODE_TIMEOUT");
  error.code = "GEOCODE_TIMEOUT";
  return error;
}

function withTimeout(value, timeoutMs, controller) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      reject(timeoutError());
    }, Math.max(1, timeoutMs));
  });
  return Promise.race([Promise.resolve(value), timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

async function geocodeAddress(address, request = {}, options = {}) {
  const rawAddress = String(address || "").replace(/\s+/g, " ").trim();
  const queries = addressSearchVariants(rawAddress, request);
  if (!rawAddress || !queries.length || typeof fetch !== "function") {
    return { result: null, cacheHit: false, requested: false, timedOut: false };
  }
  loadPersistentGeocodeCache();
  const deadlineAt = Number.isFinite(Number(options.deadlineAt))
    ? Number(options.deadlineAt)
    : Date.now() + GEOCODE_TOTAL_BUDGET_MS;
  const providers = [
    {
      name: "amap",
      endpoint: AMAP_GEOCODE_ENDPOINT,
      buildEndpoint(query) {
        const endpoint = new URL(AMAP_GEOCODE_ENDPOINT);
        endpoint.searchParams.set("words", query);
        endpoint.searchParams.set("datatype", "poi");
        const cityCode = amapCityCode(request);
        if (cityCode) endpoint.searchParams.set("city", cityCode);
        return endpoint;
      },
      parse(payload, query) {
        const amapResult = parseAmapCoordinate(payload, query, request, rawAddress);
        // Test doubles and older compatible endpoints may return the
        // Nominatim shape even when the request is sent to the AMap gateway.
        return amapResult || parseNominatimCoordinate(payload);
      },
    },
    {
      name: "nominatim",
      endpoint: NOMINATIM_GEOCODE_ENDPOINT,
      buildEndpoint(query) {
        const endpoint = new URL(NOMINATIM_GEOCODE_ENDPOINT);
        endpoint.searchParams.set("format", "jsonv2");
        endpoint.searchParams.set("limit", "1");
        endpoint.searchParams.set("countrycodes", "cn");
        endpoint.searchParams.set("q", query);
        return endpoint;
      },
      parse: parseNominatimCoordinate,
    },
  ];
  let requested = 0;
  let cacheHits = 0;
  let timedOut = false;
  for (const provider of providers) {
    for (const query of queries) {
      const cacheKey = `${provider.name}:${query.toLowerCase()}`;
      const legacyCacheKey = query.toLowerCase();
      const cachedValue = geocodeCache.get(cacheKey) || geocodeCache.get(legacyCacheKey);
      if (cachedValue) {
        cacheHits += 1;
        return {
          result: { ...cachedValue, coordinateSource: "address-search", coordinateProvider: provider.name },
          cacheHit: true,
          requested: requested > 0 ? 1 : 0,
          timedOut,
        };
      }
      if (geocodeFailureCache.has(cacheKey)) continue;
      if (Date.now() >= deadlineAt) return { result: null, cacheHit: cacheHits > 0, requested: requested > 0 ? 1 : 0, timedOut: true };

      const waitForRateLimit = GEOCODE_MIN_INTERVAL_MS - (Date.now() - lastGeocodeAt);
      if (waitForRateLimit > 0) {
        if (Date.now() + waitForRateLimit >= deadlineAt) return { result: null, cacheHit: cacheHits > 0, requested: requested > 0 ? 1 : 0, timedOut: true };
        await wait(waitForRateLimit);
      }
      if (Date.now() >= deadlineAt) return { result: null, cacheHit: cacheHits > 0, requested: requested > 0 ? 1 : 0, timedOut: true };

      lastGeocodeAt = Date.now();
      const controller = new AbortController();
      const requestDeadlineAt = Date.now() + Math.max(1, Math.min(GEOCODE_REQUEST_TIMEOUT_MS, deadlineAt - Date.now()));
      try {
        const endpoint = provider.buildEndpoint(query);
        const response = await withTimeout(fetch(endpoint, {
          headers: {
            accept: "application/json",
            "accept-language": "zh-CN",
            "user-agent": "TianyuanWorkbench local map export",
          },
          signal: controller.signal,
        }), requestDeadlineAt - Date.now(), controller);
        requested += 1;
        if (!response.ok) throw new Error(`GEOCODE_HTTP_${response.status}`);
        const payload = await withTimeout(response.json(), requestDeadlineAt - Date.now(), controller);
        const result = provider.parse(payload, query);
        if (!result) {
          geocodeFailureCache.add(cacheKey);
          continue;
        }
        const coordinates = validCoordinatePair(result);
        if (!coordinates) {
          geocodeFailureCache.add(cacheKey);
          continue;
        }
        const cached = { ...coordinates };
        geocodeCache.set(cacheKey, cached);
        geocodeFailureCache.delete(cacheKey);
        geocodeCacheDirty = true;
        persistGeocodeCache();
        return { result: { ...coordinates, ...result, coordinateSource: "address-search", coordinateProvider: result.coordinateProvider || provider.name }, cacheHit: cacheHits > 0, requested: requested > 0 ? 1 : 0, timedOut };
      } catch (error) {
        requested += 1;
        timedOut = timedOut || error?.code === "GEOCODE_TIMEOUT" || controller.signal.aborted;
        geocodeFailureCache.add(cacheKey);
      }
    }
  }
  return { result: null, cacheHit: cacheHits > 0, requested: requested > 0 ? 1 : 0, timedOut };
}

async function enrichResultsWithCoordinates(results, request = {}) {
  const startedAt = Date.now();
  const output = (Array.isArray(results) ? results : []).map((item) => ({
    ...item,
    transactionTime: normalizeDate(item?.transactionTime),
  }));
  const stats = emptyGeocodeStats();
  if (request.geocodeMissing === false) return { results: output, stats };

  loadPersistentGeocodeCache();
  geocodeFailureCache.clear();
  const deadlineAt = startedAt + GEOCODE_TOTAL_BUDGET_MS;
  for (const item of output) {
    if (mapNumber(item.longitude, 70, 140) !== null && mapNumber(item.latitude, 3, 55) !== null) continue;
    const address = String(item.address || "").trim();
    if (!address) continue;
    if (Date.now() >= deadlineAt) {
      stats.geocodeTimedOut += 1;
      break;
    }
    const lookup = await geocodeAddress(address, {
      ...request,
      province: item.province || request.province,
      city: item.city || request.city,
      district: item.district || request.district,
    }, { deadlineAt });
    stats.geocodeRequested += Number(lookup.requested || 0);
    if (lookup.cacheHit && lookup.result) stats.geocodeCacheHits += 1;
    if (lookup.timedOut) stats.geocodeTimedOut += 1;
    if (lookup.requested && !lookup.result && !lookup.timedOut) stats.geocodeFailed += 1;
    if (!lookup.result) continue;
    item.longitude = lookup.result.longitude;
    item.latitude = lookup.result.latitude;
    item.coordinateStatus = "已定位（坐落位置搜索）";
    item.coordinateSource = lookup.result.coordinateSource || "address-search";
    item.coordinateProvider = lookup.result.coordinateProvider || "";
    item.coordinatePrecision = lookup.result.coordinatePrecision || "address";
    stats.geocodeResolved += 1;
  }
  const attempted = stats.geocodeRequested || stats.geocodeCacheHits || stats.geocodeResolved || stats.geocodeFailed || stats.geocodeTimedOut;
  stats.geocodeDurationMs = attempted ? Date.now() - startedAt : 0;
  return { results: output, stats };
}

function renderMapHtml(mapData, request = {}) {
  const dataJson = JSON.stringify(mapData, (_key, value) => value === undefined ? null : value)
    .replace(/<\//g, "<\\/");
  const title = escapeHtml(request.city || request.district || "浙江省");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阿里司法拍卖地图</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
<style>
html,body,#map{height:100%;margin:0}body{font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2937}#map{background:#eef2f7}.map-header,.map-panel{position:absolute;z-index:1000;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.28);box-shadow:0 4px 16px rgba(15,23,42,.12);border-radius:9px}.map-header{top:12px;left:12px;padding:9px 11px;min-width:220px}.map-header strong{display:block;font-size:14px}.map-header span{display:block;margin-top:2px;color:#64748b}.legend{display:flex;gap:10px;margin-top:6px;color:#475569}.legend i{display:inline-block;width:8px;height:8px;margin-right:3px;border-radius:50%}.legend .residential{background:#2563eb}.legend .commercial{background:#16a34a}.legend .selected{background:#f97316}.map-panel{top:12px;right:12px;width:292px;max-width:calc(100vw - 32px);padding:8px}.map-panel.collapsed{width:auto}.map-panel.collapsed .panel-body{display:none}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 1px 7px;color:#344054;font-weight:700}.panel-head button{border:0;border-radius:6px;padding:4px 7px;background:#eef3ff;color:#2457c5;font-size:11px;cursor:pointer}.map-tabs{display:flex;gap:4px;margin-bottom:7px}.map-tab{border:0;border-radius:6px;padding:5px 8px;background:#f1f5f9;color:#475569;cursor:pointer}.map-tab.active{background:#e8f0ff;color:#1d4ed8;font-weight:700}.map-search{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}.map-list{max-height:calc(100vh - 138px);overflow:auto;margin:6px 0 0;padding:0;list-style:none}.map-list li{padding:7px 4px;border-bottom:1px solid #eef2f7;cursor:pointer}.map-list li:hover,.map-list li.selected{background:#fff4df}.map-list strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-list span{display:block;margin-top:2px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-count{color:#64748b;margin:5px 0}.empty{padding:12px 4px;color:#64748b}.case-pin{background:transparent;border:0}.case-pin span{display:block;width:16px;height:16px;border:2px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 2px 7px rgba(15,23,42,.35);transform:rotate(-45deg)}.case-pin span.residential{background:#2563eb}.case-pin span.commercial{background:#16a34a}.case-pin span.selected{background:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,.25),0 2px 7px rgba(15,23,42,.35)}.case-popup-title{font-weight:700;margin-bottom:5px}.case-popup-meta{color:#475569;line-height:1.55}.case-popup-meta a{color:#2563eb;text-decoration:none}.leaflet-popup-content{min-width:230px;max-width:320px}
</style></head><body><div id="map"></div>
<div class="map-header"><strong>阿里司法拍卖地图</strong><span>${title} · 共 ${mapData.stats.total} 条，已定位 ${mapData.stats.located} 条</span><div class="legend"><span><i class="residential"></i>住宅</span><span><i class="commercial"></i>商业</span><span><i class="selected"></i>已选</span></div></div>
<div class="map-panel" id="map-panel"><div class="panel-head"><span>案例清单</span><button id="toggle-panel" type="button">收起清单</button></div><div class="panel-body"><div class="map-tabs"><button class="map-tab active" id="located-tab" type="button">案例 <span>${mapData.stats.located}</span></button><button class="map-tab" id="unlocated-tab" type="button">未定位 <span>${mapData.stats.unlocated}</span></button></div><input id="map-search" class="map-search" type="search" placeholder="搜索标题、地址或物业类型" aria-label="搜索案例"><div id="map-count" class="map-count"></div><ul id="map-list" class="map-list"></ul></div></div>
<script>const DATA=${dataJson};</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
const map=L.map("map",{preferCanvas:true,zoomControl:false}).setView([30.25,120.16],9);L.control.zoom({position:"bottomright"}).addTo(map);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
const group=window.L&&L.markerClusterGroup?L.markerClusterGroup({disableClusteringAtZoom:15,showCoverageOnHover:false}):L.layerGroup();const markers=new Map();const located=DATA.points||[];const unlocated=DATA.unlocated||[];const selectedKeys=new Set();const esc=v=>String(v??"").replace(/[&<>"']/g,m=>m==="&"?"&amp;":m==="<"?"&lt;":m===">"?"&gt;":m.charCodeAt(0)===34?"&quot;":"&#39;");const numberText=v=>{const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n.toLocaleString("zh-CN",{maximumFractionDigits:2}):esc(v)};const markerKind=item=>String(item.propertyType||"").includes("商业")?"commercial":"residential";
  function iconFor(item){return L.divIcon({className:"case-pin",html:"<span class='"+(selectedKeys.has(item.id)?"selected":markerKind(item))+"'></span>",iconSize:[20,20],iconAnchor:[10,18]})}
function popup(item){const coordinateSource=item.coordinateProvider==="amap"?"高德坐落位置搜索":item.coordinateProvider==="nominatim"?"Nominatim 备用搜索":item.coordinateSource==="address-search"?"坐落位置搜索":"详情页明确坐标";const precision=item.coordinatePrecision==="poi"?"POI 精确点":item.coordinatePrecision==="address"?"地址点":"详情页坐标";return "<div class='case-popup-title'>"+esc(item.title||"阿里拍卖案例")+"</div><div class='case-popup-meta'>物业类型："+esc(item.propertyType||"未填写")+"<br>坐落位置："+esc(item.address||"未填写")+"<br>交易时间："+esc(item.transactionTime||"未填写")+"<br>成交金额："+numberText(item.transactionAmount||"")+" 元<br>建筑面积："+numberText(item.buildingArea||"")+" m²<br>所在楼层："+esc(item.floor||"未填写")+"<br>坐标来源："+coordinateSource+"（"+precision+"）<br><a href='"+esc(item.url||"#")+"' target='_blank' rel='noopener noreferrer'>打开详情页</a></div>"}
located.forEach(item=>{const marker=L.marker([item.latitude,item.longitude],{icon:iconFor(item)});marker.bindPopup(popup(item));markers.set(item.id,marker);group.addLayer(marker)});map.addLayer(group);const bounds=located.map(item=>[item.latitude,item.longitude]);if(bounds.length)map.fitBounds(bounds,{padding:[30,30]});
const list=document.getElementById("map-list"),search=document.getElementById("map-search"),count=document.getElementById("map-count"),locatedTab=document.getElementById("located-tab"),unlocatedTab=document.getElementById("unlocated-tab"),panel=document.getElementById("map-panel"),togglePanel=document.getElementById("toggle-panel");let mode="located";
function focus(item){const marker=markers.get(item?.id);if(!marker)return;const show=()=>{map.flyTo(marker.getLatLng(),Math.max(map.getZoom(),15),{duration:.45});marker.openPopup()};if(group.zoomToShowLayer)group.zoomToShowLayer(marker,show);else show()}
function render(){const query=String(search.value||"").trim().toLowerCase();const rows=(mode==="located"?located:unlocated).filter(item=>!query||[item.title,item.address,item.propertyType,item.transactionTime,item.district].join(" ").toLowerCase().includes(query));count.textContent="共 "+rows.length+" 条";list.innerHTML=rows.map(item=>"<li class='"+(selectedKeys.has(item.id)?"selected":"")+"' data-id='"+esc(item.id)+"'><strong>"+esc(item.title||item.address||"未填写标题")+"</strong><span>"+esc([item.propertyType,item.address,item.transactionTime].filter(Boolean).join(" · "))+"</span></li>").join("")||"<li class='empty'>没有匹配记录</li>";list.querySelectorAll("li[data-id]").forEach(node=>node.addEventListener("click",()=>focus((mode==="located"?located:unlocated).find(item=>item.id===node.dataset.id))))}
function updateMarkers(){located.forEach(item=>{const marker=markers.get(item.id);if(marker)marker.setIcon(iconFor(item))});render()}
locatedTab.addEventListener("click",()=>{mode="located";locatedTab.classList.add("active");unlocatedTab.classList.remove("active");render()});unlocatedTab.addEventListener("click",()=>{mode="unlocated";unlocatedTab.classList.add("active");locatedTab.classList.remove("active");render()});search.addEventListener("input",render);togglePanel.addEventListener("click",()=>{const collapsed=panel.classList.toggle("collapsed");togglePanel.textContent=collapsed?"展开清单":"收起清单"});
window.addEventListener("message",event=>{const message=event.data||{};if(message.type==="ALIBABA_MAP_SET_SELECTED"){selectedKeys.clear();(Array.isArray(message.ids)?message.ids:[]).forEach(id=>selectedKeys.add(String(id)));updateMarkers()}if(message.type==="ALIBABA_MAP_FOCUS"){const id=Array.isArray(message.ids)?String(message.ids[0]||""):String(message.id||"");focus(located.find(item=>String(item.id)===id))}});if(window.parent!==window)window.parent.postMessage({type:"ALIBABA_MAP_READY"},"*");if(window.ResizeObserver)new ResizeObserver(()=>map.invalidateSize()).observe(document.body);render();
</script></body></html>`;
}

function writeMapAssets(results, request = {}) {
  const outputDirectory = outputDirectoryFor(request);
  const rows = mapRowsFromResults(results);
  const points = rows.filter((item) => item.longitude !== null && item.latitude !== null);
  const unlocated = rows.filter((item) => item.longitude === null || item.latitude === null);
  const mapData = {
    stats: { total: rows.length, located: points.length, unlocated: unlocated.length },
    points,
    unlocated,
  };
  const coordsPath = path.join(outputDirectory, RESULT_COORDS_NAME);
  const pointsJsPath = path.join(outputDirectory, RESULT_POINTS_NAME);
  const mapPath = path.join(outputDirectory, RESULT_MAP_NAME);
  writeUtf8Atomic(coordsPath, `${JSON.stringify(points, null, 2)}\n`);
  writeUtf8Atomic(pointsJsPath, `window.ALIBABA_AUCTION_POINTS = ${JSON.stringify(points)};\n`);
  writeUtf8Atomic(mapPath, renderMapHtml(mapData, request));
  return { coordsPath, pointsJsPath, mapPath, locatedCount: points.length, unlocatedCount: unlocated.length };
}

function removeMapAssets(request = {}) {
  const outputDirectory = outputDirectoryFor(request);
  for (const name of [RESULT_COORDS_NAME, RESULT_POINTS_NAME, RESULT_MAP_NAME]) {
    try { fs.unlinkSync(path.join(outputDirectory, name)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

async function writeResultArtifacts(results, request, metadata = {}) {
  const baseResults = Array.isArray(results) ? results : [];
  let enrichedResults = baseResults;
  let geocodeStats = emptyGeocodeStats();
  if (request.generateMap !== false) {
    try {
      const enrichment = await enrichResultsWithCoordinates(baseResults, request);
      enrichedResults = enrichment.results;
      geocodeStats = enrichment.stats;
    } catch {
      // Keep result generation fail-open if a public geocoder or its cache
      // encounters an unexpected error.
      enrichedResults = baseResults.map((item) => ({
        ...item,
        transactionTime: normalizeDate(item?.transactionTime),
      }));
      geocodeStats = emptyGeocodeStats();
    }
  }
  const htmlPath = writeResultHtml(enrichedResults, request, metadata);
  if (request.generateMap === false) {
    removeMapAssets(request);
    return {
      htmlPath,
      results: enrichedResults,
      mapPath: "",
      coordsPath: "",
      pointsJsPath: "",
      locatedCount: 0,
      unlocatedCount: enrichedResults.length,
      ...emptyGeocodeStats(),
    };
  }
  return { htmlPath, results: enrichedResults, ...writeMapAssets(enrichedResults, request), ...geocodeStats };
}

function writeResultHtml(results, request, metadata = {}) {
  const target = path.join(outputDirectoryFor(request), RESULT_HTML_NAME);
  writeUtf8Atomic(target, renderResultHtml(results, request, metadata));
  return target;
}

function isInsideDirectory(root, value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function validateResultOutputPath(value, outputDirectory = RESULT_ROOT) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("ALIBABA_RESULT_PATH_INVALID");
  const resolved = path.resolve(raw);
  let root;
  try { root = fs.realpathSync(outputDirectory); } catch { throw new Error("ALIBABA_OUTPUT_DIRECTORY_INVALID"); }
  if (!isInsideDirectory(root, resolved) || path.extname(resolved).toLowerCase() !== ".xlsx") {
    throw new Error("ALIBABA_RESULT_PATH_NOT_ALLOWED");
  }
  return resolved;
}

function normalizeExcelCell(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return String(value).slice(0, 4000);
}

function safeExportUrl(value) {
  try {
    const url = new URL(canonicalUrl(value));
    for (const key of [...url.searchParams.keys()]) {
      if (/token|cookie|authorization|password|secret|access[_-]?token|session|signature|sign|auth/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  } catch {
    return "";
  }
}

function normalizeExcelRows(results) {
  return (Array.isArray(results) ? results : []).map((item) => Object.fromEntries(
    RESULT_EXCEL_COLUMNS.map(([, field]) => [
      field,
      field === "url"
        ? safeExportUrl(item?.[field])
        : field === "transactionTime"
          ? normalizeDate(item?.[field])
          : normalizeExcelCell(item?.[field]),
    ]),
  ));
}

async function writeResultExcel(results, request, metadata = {}, outputPath = "") {
  const rows = normalizeExcelRows(results);
  if (!rows.length) throw new Error("ALIBABA_EXCEL_NO_RESULTS");
  const outputDirectory = outputDirectoryFor(request);
  const target = validateResultOutputPath(outputPath || path.join(outputDirectory, RESULT_EXCEL_NAME), outputDirectory);
  const payloadPath = path.join(outputDirectory, `.excel-export-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({
    columns: RESULT_EXCEL_COLUMNS,
    numericFields: [...RESULT_EXCEL_NUMERIC_FIELDS],
    rows,
    metadata: {
      candidates: Number(metadata.candidates || rows.length),
      skipped: Number(metadata.skipped || 0),
    },
  }), { encoding: "utf8", mode: 0o600 });
  try {
    await runCommand(PYTHON_BIN, ["-c", RESULT_EXCEL_SCRIPT, payloadPath, target], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size <= 0) throw new Error("ALIBABA_EXCEL_READBACK_FAILED");
    return {
      ok: true,
      action: "write_alibaba_auction_excel",
      excelPath: target,
      rowCount: rows.length,
      fileSize: stat.size,
      readbackOk: true,
      security: security(),
    };
  } catch (error) {
    const wrapped = new Error(`ALIBABA_EXCEL_EXPORT_FAILED: ${safeError(error)}`);
    wrapped.code = "ALIBABA_EXCEL_EXPORT_FAILED";
    throw wrapped;
  } finally {
    try {
      fs.unlinkSync(payloadPath);
    } catch {
      // The temporary payload is best-effort cleaned after a failed export.
    }
  }
}

function validateResultPath(value, outputDirectory = RESULT_ROOT) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("ALIBABA_RESULT_PATH_INVALID");
  const resolved = path.resolve(raw);
  let root;
  try { root = fs.realpathSync(outputDirectory); } catch { throw new Error("ALIBABA_OUTPUT_DIRECTORY_INVALID"); }
  if (!isInsideDirectory(root, resolved) || ![".html", ".xlsx"].includes(path.extname(resolved).toLowerCase())) {
    throw new Error("ALIBABA_RESULT_PATH_NOT_ALLOWED");
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size <= 0) throw new Error("ALIBABA_RESULT_NOT_FOUND");
  return resolved;
}

async function scrape(requestInput, emit = () => {}) {
  const request = normalizeRequest(requestInput);
  const progress = (payload) => emit({ security: security(), ...payload });
  const candidates = [];
  const seen = new Set();
  let prefiltered = 0;

  progress({ phase: "opening", percent: 2, message: "正在打开阿里拍卖列表页…", fetched: 0, verified: 0, skipped: 0 });
  try {
    await ensureBound(request.session);
  } catch (error) {
    const reason = safeError(error);
    return { ok: false, phase: "failed", errorCode: reason, reason, candidates: 0, results: [], security: security() };
  }
  for (let page = 1; page <= SAFE_MAX_PAGES; page += 1) {
    const pageUrl = listPageUrl(request.sourceUrl, page);
    try {
      const page = await openBrowserPage(request.session, pageUrl, { window: "background" });
      const extracted = parseJsonOutput((await runOpenCli([
        "browser", request.session, "eval", LIST_EXTRACT_SCRIPT, ...browserTargetArgs(page.target),
      ], { timeout: 30000 })).stdout);
      const blocked = pageLooksBlocked(extracted);
      if (blocked) throw new Error(blocked);
      const pageItems = Array.isArray(extracted.items) ? extracted.items : [];
      let newItems = 0;
      for (const item of pageItems) {
        const url = canonicalUrl(item.href);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        newItems += 1;
        if (!candidateInScope(item, request)) {
          prefiltered += 1;
          continue;
        }
        candidates.push({ url, title: String(item.text || "").split("\n")[0].trim() });
      }
      progress({
        phase: "listing",
        percent: Math.min(35, 5 + Math.round((page / SAFE_MAX_PAGES) * 30)),
        message: `已读取第 ${page} 页候选记录，共 ${candidates.length} 条，准备详情核验…`,
        page,
        pages: SAFE_MAX_PAGES,
        fetched: candidates.length,
        verified: 0,
        skipped: prefiltered,
      });
      if (pageBeforeRequestedRange(pageItems, request)) {
        progress({
          phase: "listing",
          percent: Math.min(35, 5 + Math.round((page / SAFE_MAX_PAGES) * 30)),
          message: `第 ${page} 页日期已早于所选起始日，停止继续翻页。`,
          page,
          pages: SAFE_MAX_PAGES,
          fetched: candidates.length,
          verified: 0,
          skipped: prefiltered,
        });
        break;
      }
      if (!pageItems.length || newItems === 0) break;
    } catch (error) {
      const reason = safeError(error);
      return { ok: false, phase: "failed", errorCode: reason, reason, candidates: candidates.length, results: [], security: security() };
    }
  }

  if (!candidates.length) {
    return { ok: false, phase: "failed", errorCode: "ALIBABA_LIST_EMPTY", reason: prefiltered ? "当前列表记录均不在所选交易状态或日期范围内。" : "未读取到阿里拍卖候选记录。请确认页面已登录且没有出现验证页。", candidates: 0, results: [], skipped: prefiltered, security: security() };
  }

  const results = [];
  let skipped = prefiltered;
  const attempted = new Set();
  for (const candidate of candidates) {
    if (attempted.has(candidate.url)) continue;
    attempted.add(candidate.url);
    try {
      const detailPage = await openBrowserPage(request.session, candidate.url, { window: "background" });
      let detail = parseJsonOutput((await runOpenCli([
        "browser", request.session, "eval", DETAIL_EXTRACT_SCRIPT, ...browserTargetArgs(detailPage.target),
      ], { timeout: 30000 })).stdout);
      const blocked = pageLooksBlocked(detail);
      if (blocked) throw new Error(blocked);
      const detailFloors = extractFloorFieldsFromText(detail.pageText);
      const needsAttachmentFields = !parseAmount(detail.buildingArea)
        || !detailFloors.floor
        || !detailFloors.totalFloors;
      if (needsAttachmentFields && Array.isArray(detail.attachments) && detail.attachments.length) {
        progress({
          phase: "reading_attachments",
          percent: Math.min(98, 35 + Math.round((attempted.size / candidates.length) * 63)),
          message: "详情页字段不完整，正在读取评估报告附件，必要时进行 OCR 补充建筑面积和楼层…",
          fetched: candidates.length,
          verified: results.length,
          skipped,
          current: detail.title || candidate.title,
        });
        detail = await enrichDetailFromAttachments(detail, {
          session: request.session,
          restoreUrl: candidate.url,
          target: detailPage.target,
        });
      }
      const parsed = parseDetail(detail, request);
      if (parsed.valid && matchesRequest(parsed, request)) results.push(parsed);
      else skipped += 1;
      progress({
        phase: "verifying",
        percent: Math.min(98, 35 + Math.round((attempted.size / candidates.length) * 63)),
        message: parsed.valid ? `已核验成交案例 ${results.length} 条。` : `已跳过未通过成交核验的记录 ${skipped} 条。`,
        fetched: candidates.length,
        verified: results.length,
        skipped,
        current: parsed.title || candidate.title,
      });
    } catch (error) {
      skipped += 1;
      const reason = safeError(error);
      if (["ALIBABA_LOGIN_REQUIRED", "ALIBABA_VERIFICATION_REQUIRED"].includes(reason)) {
        return { ok: false, phase: "failed", errorCode: reason, reason: reason === "ALIBABA_LOGIN_REQUIRED" ? "阿里拍卖页面需要登录，请先在浏览器完成登录后重试。" : "阿里拍卖页面出现验证，请在浏览器完成验证后重试。", candidates: candidates.length, results, skipped, security: security() };
      }
      progress({ phase: "verifying", percent: Math.min(98, 35 + Math.round((attempted.size / candidates.length) * 63)), message: `详情读取失败，已跳过 ${skipped} 条。`, fetched: candidates.length, verified: results.length, skipped, current: candidate.title });
    }
  }
  const htmlPath = results.length ? writeResultHtml(results, request, { candidates: candidates.length, skipped }) : "";
  return {
    ok: results.length > 0,
    phase: "completed",
    errorCode: results.length ? "" : "ALIBABA_NO_VALID_CASES",
    reason: results.length ? "阿里拍卖成交案例已完成详情核验。" : "候选记录中没有找到满足成交且出价次数大于 0 的案例。",
    candidates: candidates.length,
    results,
    htmlPath,
    skipped,
    security: security(),
  };
}

async function openPage(requestInput) {
  const request = normalizeRequest(requestInput);
  await ensureBound(request.session);
  await openBrowserPage(request.session, request.sourceUrl, { window: "foreground" });
  return {
    ok: true,
    action: "open_alibaba_auction",
    session: request.session,
    sourceUrl: request.sourceUrl,
    message: "已打开阿里拍卖列表页；如出现登录或验证，请先在浏览器完成后再开始抓取。",
    security: security(),
  };
}

async function ensureBound(session) {
  try {
    await runOpenCli(["browser", session, "state"], { timeout: 15000 });
  } catch {
    await runOpenCli(["browser", session, "bind"], { timeout: 30000 });
  }
}

module.exports = {
  DEFAULT_SESSION,
  DEFAULT_SOURCE_URL,
  DETAIL_EXTRACT_SCRIPT,
  LIST_EXTRACT_SCRIPT,
  RESULT_ROOT,
  RESULT_HTML_NAME,
  DEFAULT_GEOCODE_CACHE_PATH,
  GEOCODE_REQUEST_TIMEOUT_MS,
  GEOCODE_TOTAL_BUDGET_MS,
  GEOCODE_MIN_INTERVAL_MS,
  canonicalUrl,
  browserTargetArgs,
  browserUrlsMatch,
  openedBrowserTarget,
  commandEnvironment,
  normalizeRequest,
  openPage,
  parseDetail,
  matchesRequest,
  parseJsonOutput,
  renderResultHtml,
  renderMapHtml,
  writeMapAssets,
  writeResultArtifacts,
  outputDirectoryFor,
  safeError,
  scrape,
  validateResultPath,
  validateResultOutputPath,
  writeResultExcel,
  writeResultHtml,
  extractBuildingAreaFromText,
  extractFloorFieldsFromText,
  extractPdfText,
  extractPdfTextWithOcr,
  enrichDetailFromAttachments,
  enrichDetailFromAttachmentBuffers,
};
