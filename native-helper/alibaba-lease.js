"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

// 阿里资产租赁模块的本地产物层：写结果 JSON/HTML/地图/历史清单与 Excel 导出。
// 与阿里司法拍卖模块职责相同但互不依赖；地图点位直接来自详情页明确坐标，
// 不做地理编码，未定位记录显式降级而不是猜测位置。

const PYTHON_BIN = process.env.TIANYUAN_PYTHON_BIN
  || process.env.PYTHON_BIN
  || "python3";

const RESULT_ROOT = path.join(os.homedir(), ".tianyuan-workbench", "outputs", "alibaba-lease");
const RESULT_HTML_NAME = "latest.html";
const RESULT_EXCEL_NAME = "latest.xlsx";
const RESULT_JSON_NAME = "latest.json";
const RESULT_COORDS_NAME = "latest_coords.json";
const RESULT_POINTS_NAME = "latest_points.js";
const RESULT_MAP_NAME = "latest_map.html";
const RESULT_HISTORY_NAME = "latest_history.json";
const MAP_ASSET_RELATIVE_PATHS = Object.freeze([
  "leaflet.js",
  "leaflet.css",
  "leaflet.markercluster.js",
  "MarkerCluster.css",
  "MarkerCluster.Default.css",
  "images/layers.png",
  "images/layers-2x.png",
  "images/marker-icon.png",
  "images/marker-icon-2x.png",
  "images/marker-shadow.png",
]);
const MAP_ASSET_SOURCE_DIRECTORY = path.join(__dirname, "map-assets");
const DEFAULT_MAP_CONFIG_PATH = path.join(os.homedir(), ".tianyuan-workbench", "map-config.json");

// 详情页脚本里的坐标并不稳定（同一条目首访与复访都可能不同），因此未带坐标的
// 记录会退回“标的物位置”文本搜索定位：高德 poiTips（免钥）为主、Nominatim 兜底。
// 与阿里司法拍卖模块同一套公开接口，缓存与预算逻辑保持一致，避免慢查询拖住产物生成。
const GEOCODE_CACHE_VERSION = 1;
const DEFAULT_GEOCODE_CACHE_PATH = path.join(os.homedir(), ".tianyuan-workbench", "cache", "alibaba-lease-geocode.json");
const GEOCODE_REQUEST_TIMEOUT_MS = 4500;
const GEOCODE_TOTAL_BUDGET_MS = 12000;
const GEOCODE_MIN_INTERVAL_MS = 300;
const AMAP_GEOCODE_ENDPOINT = "https://www.amap.com/service/poiTips";
const NOMINATIM_GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";

const geocodeCache = new Map();
const geocodeFailureCache = new Set();
let geocodeCacheLoadedPath = "";
let geocodeCacheDirty = false;
let lastGeocodeAt = 0;

const RESULT_EXCEL_COLUMNS = Object.freeze([
  ["标的名称", "title"], ["省份", "province"], ["城市", "city"], ["区县", "district"],
  ["小区名称", "community"], ["标的物位置", "location"], ["流转方式", "transferMode"], ["物业类型", "propertyType"], ["房屋用途", "houseUsage"],
  ["建筑面积（m²）", "buildingArea"], ["成交价（首年租金，元）", "transactionAmount"], ["起始价（元）", "startPrice"],
  ["评估价（元）", "valuationAmount"], ["月租金单价（元/m²·月）", "monthlyUnitPrice"], ["租期（年）", "leaseTermYears"],
  ["租金支付方式", "rentPaymentTerms"], ["租金递增", "rentEscalation"], ["押金（元）", "depositAmount"],
  ["朝向", "orientation"], ["户型", "layout"], ["所在楼层", "floor"], ["总楼层", "totalFloors"], ["装修程度", "decoration"],
  ["出价次数", "bidCount"], ["报名人数", "signupCount"], ["围观次数", "viewCount"],
  ["结束时间", "endTime"], ["结果状态", "resultStatus"],
  ["坐标状态", "coordinateStatus"], ["经度", "longitude"], ["纬度", "latitude"],
  ["案例平台", "platform"], ["核验状态", "verificationStatus"], ["案例网址", "url"],
]);

const RESULT_EXCEL_NUMERIC_FIELDS = new Set([
  "buildingArea", "transactionAmount", "startPrice", "valuationAmount", "monthlyUnitPrice",
  "depositAmount", "floor", "totalFloors", "bidCount", "signupCount", "viewCount",
  "longitude", "latitude",
]);

const RESULT_EXCEL_SCRIPT = String.raw`
import json
import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

payload_path, target_path = sys.argv[1:3]
with open(payload_path, "r", encoding="utf-8") as stream:
    payload = json.load(stream)

columns = payload["columns"]
numeric_fields = set(payload["numericFields"])
rows = payload["rows"]
temporary_path = target_path + ".tmp.xlsx"
os.makedirs(os.path.dirname(target_path), exist_ok=True)

workbook = Workbook()
sheet = workbook.active
sheet.title = "租赁案例"
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
widths = [34, 9, 9, 10, 16, 30, 9, 10, 10, 12, 16, 12, 12, 16, 9, 18, 20, 12, 8, 12, 9, 8, 10, 9, 9, 9, 12, 8, 16, 12, 12, 9, 9, 46]
for column_index, width in enumerate(widths, 1):
    sheet.column_dimensions[chr(64 + column_index) if column_index <= 26 else "A"].width = width
sheet.row_dimensions[1].height = 22
workbook.properties.creator = "Tianyuan Workbench"

try:
    workbook.save(temporary_path)
    os.replace(temporary_path, target_path)
except Exception:
    if os.path.exists(temporary_path):
        os.remove(temporary_path)
    raise

print(json.dumps({"ok": True, "rows": len(rows)}, ensure_ascii=False))
`;

function security() {
  return { credentialsReturned: false };
}

function safeText(value, max = 400) {
  return String(value || "").replace(/cookie|authorization|password|验证码|token/gi, "[REDACTED]").slice(0, max);
}

function safeError(error) {
  return safeText(error?.message || String(error));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
}

function numericOrEmpty(value) {
  if (value === null || value === undefined || value === "") return "";
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return "";
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : "";
}

function safeExportUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)taobao\.com$/i.test(url.hostname)) return "";
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

function normalizeRequest(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const outputDirectory = String(source.outputDirectory || RESULT_ROOT).trim();
  if (!outputDirectory || outputDirectory.includes("\0") || !path.isAbsolute(outputDirectory)) {
    throw new Error("ALIBABA_LEASE_OUTPUT_DIRECTORY_INVALID");
  }
  const sourceUrl = String(source.sourceUrl || "").trim();
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (!/^https:$/.test(url.protocol) || url.hostname.toLowerCase() !== "zc-paimai.taobao.com") {
        throw new Error("ALIBABA_LEASE_SOURCE_URL_HOST_NOT_ALLOWED");
      }
    } catch (error) {
      if (error?.message === "ALIBABA_LEASE_SOURCE_URL_HOST_NOT_ALLOWED") throw error;
      throw new Error("ALIBABA_LEASE_SOURCE_URL_INVALID");
    }
  }
  return {
    province: safeText(source.province, 40),
    provinceCode: safeText(source.provinceCode, 12),
    city: safeText(source.city, 40),
    cityCode: safeText(source.cityCode, 12),
    district: safeText(source.district, 40),
    districtCode: safeText(source.districtCode, 12),
    status: source.status === "all" ? "all" : "finished",
    keyword: safeText(source.keyword, 100),
    startDate: normalizeDate(source.startDate),
    endDate: normalizeDate(source.endDate),
    maxPages: boundedNumber(source.maxPages, 1, 1, 5),
    outputDirectory: path.resolve(outputDirectory),
    generateMap: source.generateMap !== false,
    sourceUrl,
  };
}

function isInsideDirectory(root, value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function outputDirectoryFor(request = {}) {
  const raw = String(request.outputDirectory || RESULT_ROOT).trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("ALIBABA_LEASE_OUTPUT_DIRECTORY_INVALID");
  fs.mkdirSync(raw, { recursive: true, mode: 0o700 });
  const resolved = fs.realpathSync(raw);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("ALIBABA_LEASE_OUTPUT_DIRECTORY_NOT_DIRECTORY");
  return resolved;
}

function writeUtf8Atomic(target, content) {
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
}

function normalizeResultRow(item) {
  const longitude = Number(item?.longitude);
  const latitude = Number(item?.latitude);
  const hasCoordinate = Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= 70 && longitude <= 140 && latitude >= 3 && latitude <= 55;
  const buildingArea = numericOrEmpty(item?.buildingArea);
  const transactionAmount = numericOrEmpty(item?.transactionAmount);
  const leaseTermYears = numericOrEmpty(item?.leaseTermYears);
  const monthlyUnitPrice = buildingArea !== "" && transactionAmount !== "" && leaseTermYears !== "" && Number(leaseTermYears) > 0
    ? Math.round((Number(transactionAmount) / (Number(leaseTermYears) * 12) / Number(buildingArea)) * 100) / 100
    : numericOrEmpty(item?.monthlyUnitPrice);
  return {
    title: safeText(item?.title, 200),
    province: safeText(item?.province, 40),
    city: safeText(item?.city, 40),
    district: safeText(item?.district, 40),
    community: safeText(item?.community, 80),
    location: safeText(item?.location, 120),
    transferMode: safeText(item?.transferMode, 20),
    propertyType: safeText(item?.propertyType, 40),
    houseUsage: safeText(item?.houseUsage, 40),
    buildingArea,
    transactionAmount,
    startPrice: numericOrEmpty(item?.startPrice),
    valuationAmount: numericOrEmpty(item?.valuationAmount),
    monthlyUnitPrice,
    leaseTermYears,
    rentPaymentTerms: safeText(item?.rentPaymentTerms, 80),
    rentEscalation: safeText(item?.rentEscalation, 80),
    depositAmount: numericOrEmpty(item?.depositAmount),
    orientation: safeText(item?.orientation, 20),
    layout: safeText(item?.layout, 30),
    floor: safeText(item?.floor, 20),
    totalFloors: safeText(item?.totalFloors, 20),
    decoration: safeText(item?.decoration, 30),
    bidCount: numericOrEmpty(item?.bidCount),
    signupCount: numericOrEmpty(item?.signupCount),
    viewCount: numericOrEmpty(item?.viewCount),
    endTime: normalizeDate(item?.endTime),
    resultStatus: item?.resultStatus === "流拍" ? "流拍" : item?.resultStatus === "未成交" ? "未成交" : "成交",
    longitude: hasCoordinate ? longitude : null,
    latitude: hasCoordinate ? latitude : null,
    coordinateStatus: hasCoordinate ? safeText(item?.coordinateStatus, 60) || "已定位（详情页坐标）" : "未定位",
    coordinateProvider: safeText(item?.coordinateProvider, 20),
    coordinatePrecision: safeText(item?.coordinatePrecision, 20),
    platform: "阿里资产",
    verificationStatus: safeText(item?.verificationStatus, 20) || "已核验",
    url: safeExportUrl(item?.url),
  };
}

function loadMapConfig() {
  const candidates = [
    String(process.env.TIANYUAN_MAP_CONFIG_PATH || "").trim(),
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "TianyuanWorkbench", "map-config.json")
      : "",
    DEFAULT_MAP_CONFIG_PATH,
  ].filter(Boolean);
  for (const configPath of candidates) {
    try {
      const payload = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const amap = payload?.amap && typeof payload.amap === "object" ? payload.amap : {};
      const webKey = String(amap.webKey || amap.key || "").trim();
      return {
        amapEnabled: amap.enabled === true && Boolean(webKey),
        amapWebKey: amap.enabled === true ? webKey : "",
      };
    } catch {
      // Continue to the next local configuration candidate.
    }
  }
  return { amapEnabled: false, amapWebKey: "" };
}

function mapRowsFromResults(results) {
  return (Array.isArray(results) ? results : []).map((item, index) => ({
    id: String(index + 1),
    title: String(item?.title || "").trim(),
    district: String(item?.district || "").trim(),
    community: String(item?.community || "").trim(),
    address: String(item?.location || [item?.community, item?.district].filter(Boolean).join(" ")).trim(),
    propertyType: String(item?.propertyType || "").trim(),
    transactionAmount: item?.transactionAmount ?? "",
    monthlyUnitPrice: item?.monthlyUnitPrice ?? "",
    buildingArea: item?.buildingArea ?? "",
    leaseTermYears: item?.leaseTermYears ?? "",
    endTime: normalizeDate(item?.endTime),
    resultStatus: String(item?.resultStatus || "").trim(),
    coordinateStatus: String(item?.coordinateStatus || "").trim(),
    longitude: item?.longitude ?? null,
    latitude: item?.latitude ?? null,
    url: safeExportUrl(item?.url),
  }));
}

function renderLeaseMapHtml(mapData, request = {}) {
  const dataJson = JSON.stringify(mapData, (_key, value) => value === undefined ? null : value)
    .replace(/<\//g, "<\\/");
  const title = escapeHtml(request.district || request.city || request.province || "全部区域");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阿里资产租赁地图</title>
<link rel="stylesheet" href="leaflet.css">
<link rel="stylesheet" href="MarkerCluster.css">
<link rel="stylesheet" href="MarkerCluster.Default.css">
<style>
html,body,#map{height:100%;margin:0}body{font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2937}#map{background:#eef2f7}.map-header,.map-panel{position:absolute;z-index:1000;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.28);box-shadow:0 4px 16px rgba(15,23,42,.12);border-radius:9px}.map-header{top:12px;left:12px;padding:9px 11px;min-width:220px}.map-header strong{display:block;font-size:14px}.map-header span{display:block;margin-top:2px;color:#64748b}.map-panel{top:12px;right:12px;width:286px;max-width:calc(100vw - 32px);padding:8px;box-sizing:border-box}.map-panel.collapsed{width:auto}.map-panel.collapsed .panel-body{display:none}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 1px 7px;color:#344054;font-weight:700}.panel-head button{border:0;border-radius:6px;padding:4px 7px;background:#eef3ff;color:#2457c5;font-size:11px;cursor:pointer}.map-search{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}.map-list{max-height:calc(100vh - 140px);overflow:auto;margin:6px 0 0;padding:0;list-style:none}.map-list li{padding:7px 4px;border-bottom:1px solid #eef2f7;cursor:pointer}.map-list li:hover,.map-list li.selected{background:#fff4df}.map-list strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-list span{display:block;margin-top:2px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-count{color:#64748b;margin:5px 0}.empty{padding:12px 4px;color:#64748b}.lease-pin{background:transparent;border:0}.lease-pin span{display:block;width:16px;height:16px;border:2px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 2px 7px rgba(15,23,42,.35);transform:rotate(-45deg);background:#0e7490}.lease-pin span.failed{background:#94a3b8}.lease-popup-title{font-weight:700;margin-bottom:5px}.lease-popup-meta{color:#475569;line-height:1.55}.lease-popup-meta a{color:#2563eb;text-decoration:none}.leaflet-popup-content{min-width:230px;max-width:340px}
</style></head><body><div id="map"></div>
<div class="map-header"><strong>阿里资产租赁地图</strong><span>${title} · 共 ${mapData.stats.total} 条，已定位 ${mapData.stats.located} 条，未定位 ${mapData.stats.unlocated} 条</span></div>
<div class="map-panel" id="map-panel"><div class="panel-head"><span>案例清单</span><button id="toggle-panel" type="button">收起清单</button></div><div class="panel-body"><input id="map-search" class="map-search" type="search" placeholder="搜索标题、小区或区县" aria-label="搜索案例"><div id="map-count" class="map-count"></div><ul id="map-list" class="map-list"></ul></div></div>
<script>const DATA=${dataJson};</script>
<script src="leaflet.js"></script><script src="leaflet.markercluster.js"></script>
<script>
const map=L.map("map",{preferCanvas:true,zoomControl:false}).setView([30.25,120.16],9);L.control.zoom({position:"bottomright"}).addTo(map);L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"&copy; Esri, Maxar, Earthstar Geographics"}).addTo(map);
const cluster=window.L&&L.markerClusterGroup?L.markerClusterGroup({disableClusteringAtZoom:15,showCoverageOnHover:false}):L.layerGroup();const markers=new Map();const located=DATA.points||[];const unlocated=DATA.unlocated||[];const esc=v=>String(v??"").replace(/[&<>"']/g,m=>m==="&"?"&amp;":m==="<"?"&lt;":m===">"?"&gt;":m.charCodeAt(0)===34?"&quot;":"&#39;");const numberText=v=>{const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n.toLocaleString("zh-CN",{maximumFractionDigits:2}):esc(v)};
function iconFor(item){return L.divIcon({className:"lease-pin",html:"<span class='"+(item.resultStatus==="成交"?"":"failed")+"'></span>",iconSize:[20,20],iconAnchor:[10,18]})}
function popup(item){return "<div class='lease-popup-title'>"+esc(item.title||"租赁案例")+"</div><div class='lease-popup-meta'>"+[["小区",item.community],["物业类型",item.propertyType],["结束时间",item.endTime],["成交价（首年租金）",item.transactionAmount?numberText(item.transactionAmount)+" 元":""],["月租金单价",item.monthlyUnitPrice?numberText(item.monthlyUnitPrice)+" 元/m²·月":""],["建筑面积",item.buildingArea?numberText(item.buildingArea)+" m²":""],["租期",item.leaseTermYears?item.leaseTermYears+" 年":""],["结果状态",item.resultStatus],["坐标状态",item.coordinateStatus]].filter(([,value])=>value!==""&&value!==undefined&&value!==null).map(([label,value])=>label+"："+esc(value)).join("<br>")+"<br><a href='"+esc(item.url||"#")+"' target='_blank' rel='noopener noreferrer'>打开详情页</a></div>"}
located.forEach(item=>{const marker=L.marker([item.latitude,item.longitude],{icon:iconFor(item)});marker.bindPopup(popup(item));markers.set(item.id,marker);cluster.addLayer(marker)});map.addLayer(cluster);const bounds=located.map(item=>[item.latitude,item.longitude]);if(bounds.length)map.fitBounds(bounds,{padding:[30,30]});
const list=document.getElementById("map-list"),search=document.getElementById("map-search"),count=document.getElementById("map-count"),panel=document.getElementById("map-panel"),togglePanel=document.getElementById("toggle-panel");
function focus(item){const marker=markers.get(String(item?.id));if(!marker)return;const show=()=>{map.flyTo(marker.getLatLng(),Math.max(map.getZoom(),15),{duration:.45});marker.openPopup()};if(cluster.zoomToShowLayer)cluster.zoomToShowLayer(marker,show);else show()}
function render(){const query=String(search.value||"").trim().toLowerCase();const rows=located.concat(unlocated).filter(item=>!query||[item.title,item.community,item.district,item.endTime].join(" ").toLowerCase().includes(query));count.textContent="共 "+rows.length+" 条";list.innerHTML=rows.map(item=>"<li data-id='"+esc(item.id)+"'><strong>"+esc(item.title||"未填写标题")+"</strong><span>"+esc([item.community,item.district,item.endTime,item.resultStatus].filter(Boolean).join(" · "))+"</span></li>").join("")||"<li class='empty'>没有匹配记录</li>";list.querySelectorAll("li[data-id]").forEach(node=>node.addEventListener("click",()=>focus(located.find(item=>String(item.id)===node.dataset.id))))}
search.addEventListener("input",render);togglePanel.addEventListener("click",()=>{const collapsed=panel.classList.toggle("collapsed");togglePanel.textContent=collapsed?"展开清单":"收起清单"});render();
</script></body></html>`;
}

function writeMapAssets(results, request = {}) {
  for (const relativePath of MAP_ASSET_RELATIVE_PATHS) {
    const source = path.join(MAP_ASSET_SOURCE_DIRECTORY, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`ALIBABA_LEASE_MAP_ASSET_MISSING: ${relativePath}`);
  }
  const outputDirectory = outputDirectoryFor(request);
  for (const relativePath of MAP_ASSET_RELATIVE_PATHS) {
    const source = path.join(MAP_ASSET_SOURCE_DIRECTORY, relativePath);
    const target = path.join(outputDirectory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.tmp-${process.pid}`;
    fs.copyFileSync(source, temporary);
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, target);
  }
  const rows = mapRowsFromResults(results);
  const points = rows.filter((item) => item.longitude !== null && item.latitude !== null);
  const unlocated = rows.filter((item) => item.longitude === null || item.latitude === null);
  const mapData = {
    stats: { total: rows.length, located: points.length, unlocated: unlocated.length },
    points,
    unlocated,
    mapConfig: loadMapConfig(),
  };
  const coordsPath = path.join(outputDirectory, RESULT_COORDS_NAME);
  const pointsJsPath = path.join(outputDirectory, RESULT_POINTS_NAME);
  const mapPath = path.join(outputDirectory, RESULT_MAP_NAME);
  writeUtf8Atomic(coordsPath, `${JSON.stringify(points, null, 2)}\n`);
  writeUtf8Atomic(pointsJsPath, `window.ALIBABA_LEASE_POINTS = ${JSON.stringify(points)};\n`);
  writeUtf8Atomic(mapPath, renderLeaseMapHtml(mapData, request));
  return { coordsPath, pointsJsPath, mapPath, locatedCount: points.length, unlocatedCount: unlocated.length };
}

function removeMapAssets(request = {}) {
  const outputDirectory = outputDirectoryFor(request);
  for (const name of [RESULT_COORDS_NAME, RESULT_POINTS_NAME, RESULT_MAP_NAME, ...MAP_ASSET_RELATIVE_PATHS]) {
    try { fs.unlinkSync(path.join(outputDirectory, name)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  try { fs.rmdirSync(path.join(outputDirectory, "images")); } catch (error) { if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error; }
}

function renderResultHtml(results, request, metadata = {}) {
  const columns = RESULT_EXCEL_COLUMNS;
  const numericFields = RESULT_EXCEL_NUMERIC_FIELDS;
  const header = columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = (Array.isArray(results) ? results : []).map((item, rowIndex) => {
    const cells = columns.map(([, field]) => {
      const value = field === "url" && item?.[field] && safeExportUrl(item[field])
        ? `<a href="${escapeHtml(safeExportUrl(item[field]))}" target="_blank" rel="noopener noreferrer">打开详情</a>`
        : escapeHtml(item?.[field] === null || item?.[field] === undefined ? "" : item[field]);
      return `<td class="${numericFields.has(field) ? "numeric-cell" : ""}">${value}</td>`;
    }).join("");
    return `<tr><td class="sequence-cell">${rowIndex + 1}</td>${cells}</tr>`;
  }).join("");
  const locatedCount = (Array.isArray(results) ? results : []).filter((item) => item?.longitude != null && item?.latitude != null).length;
  const sourceUrl = escapeHtml(safeExportUrl(request.sourceUrl));
  const generatedAt = escapeHtml(new Date().toLocaleString("zh-CN", { hour12: false }));
  const skipped = Number(metadata.skipped || 0);
  const candidates = Number(metadata.candidates || results.length);
  const mapName = request.generateMap === false || !locatedCount ? "" : "latest_map.html";
  const mapLink = mapName
    ? `<a class="button secondary" href="${mapName}" target="_blank" rel="noopener noreferrer">打开独立地图</a>`
    : '<span class="inline-muted">本次未生成地图（未勾选生成，或详情页未返回任何坐标）。</span>';
  const emptyNotice = results.length ? "" : '<div class="inline-notice"><strong>暂未找到符合条件的租赁成交案例</strong><p>请检查地区、标的状态、结束时间范围，或确认候选列表中存在“使用权/租金”条目。</p></div>';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阿里资产租赁抓取结果</title>
<style>
body{margin:0;padding:18px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2937;background:#f6f8fb}.banner{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}.banner h1{margin:0;font-size:18px}.banner .meta{color:#64748b}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}.button{display:inline-block;padding:7px 12px;border-radius:7px;border:1px solid #2563eb;background:#2563eb;color:#fff;text-decoration:none;font-size:12px}.button.secondary{border-color:#cbd5e1;background:#fff;color:#2457c5}.summary{display:flex;gap:16px;flex-wrap:wrap;padding:10px 12px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;margin-bottom:12px}.summary strong{font-size:15px}.inline-notice{padding:14px;border:1px dashed #cbd5e1;border-radius:9px;background:#fff;color:#64748b;margin-bottom:12px}.inline-muted{color:#64748b;font-size:12px}.table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:9px;background:#fff;max-height:62vh}table{border-collapse:collapse;white-space:nowrap;font-size:12px;width:max-content;min-width:100%}th,td{padding:7px 9px;border-bottom:1px solid #eef2f7;text-align:left}th{position:sticky;top:0;background:#f1f5f9;z-index:1}td.numeric-cell{text-align:right;font-variant-numeric:tabular-nums}td.sequence-cell{color:#64748b}a{color:#2563eb}
</style></head><body>
<div class="banner"><h1>阿里资产租赁抓取结果</h1><span class="meta">生成于 ${generatedAt} · 区域：${escapeHtml([request.province, request.city, request.district].filter(Boolean).join(" "))} · 状态：${request.status === "finished" ? "已结束" : "全部状态"}</span><div class="actions"><a class="button" href="${RESULT_JSON_NAME}" download>下载 JSON</a>${mapLink}</div></div>
<div class="summary"><span>页面记录 <strong>${candidates}</strong> 条</span><span>核验通过 <strong>${results.length}</strong> 条</span><span>跳过 <strong>${skipped}</strong> 条</span><span>已定位 <strong>${locatedCount}</strong> 条</span>${sourceUrl ? `<span class="inline-muted">检索网址：<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">打开</a></span>` : ""}</div>
${emptyNotice}
<div class="table-wrap"><table><thead><tr><th>#</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
</body></html>`;
}

function writeResultHtml(results, request, metadata) {
  const target = path.join(outputDirectoryFor(request), RESULT_HTML_NAME);
  writeUtf8Atomic(target, renderResultHtml(results, request, metadata));
  return target;
}

function writeHistoryManifest(results, request, metadata = {}, outputs = {}) {
  const outputDirectory = outputDirectoryFor(request);
  const target = path.join(outputDirectory, RESULT_HISTORY_NAME);
  const payload = {
    type: "alibaba-lease-history",
    version: 1,
    generatedAt: new Date().toISOString(),
    request: { ...request },
    metadata: {
      candidates: Number(metadata.candidates || results.length),
      skipped: Number(metadata.skipped || 0),
      locatedCount: Number(outputs.locatedCount || 0),
    },
    outputs: {
      html: outputs.html ? path.basename(outputs.html) : RESULT_HTML_NAME,
      json: RESULT_JSON_NAME,
      map: outputs.map ? path.basename(outputs.map) : "",
      coords: outputs.coords ? path.basename(outputs.coords) : "",
    },
    results,
  };
  writeUtf8Atomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

function validCoordinatePair(value) {
  const longitude = Number(value?.longitude);
  const latitude = Number(value?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < 70 || longitude > 140 || latitude < 3 || latitude > 55) return null;
  return { longitude, latitude };
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
  const variants = [
    full,
    normalizeGeocodeText([...context, noParenthetical].join(" ")),
    normalizeGeocodeText([...context, coarse].join(" ")),
    normalizeGeocodeText([request.city, request.district, coarse].filter(Boolean).join(" ")),
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

function geocodeCachePath() {
  const configured = String(process.env.TIANYUAN_ALIBABA_LEASE_GEOCODE_CACHE_PATH || "").trim();
  return configured && path.isAbsolute(configured) ? configured : DEFAULT_GEOCODE_CACHE_PATH;
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
    // 缓存缺失或损坏不致命，下次成功查询会原子重写。
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
    // 定位失败不阻塞结果生成；本次内存值保留，下次重试。
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(value, timeoutMs, controller) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      const error = new Error("GEOCODE_TIMEOUT");
      error.code = "GEOCODE_TIMEOUT";
      reject(error);
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
      buildEndpoint(query) {
        const endpoint = new URL(AMAP_GEOCODE_ENDPOINT);
        endpoint.searchParams.set("words", query);
        endpoint.searchParams.set("datatype", "poi");
        const cityCode = amapCityCode(request);
        if (cityCode) endpoint.searchParams.set("city", cityCode);
        return endpoint;
      },
      parse(payload, query) {
        return parseAmapCoordinate(payload, query, request, rawAddress) || parseNominatimCoordinate(payload);
      },
    },
    {
      name: "nominatim",
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
      const cachedValue = geocodeCache.get(cacheKey);
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
        geocodeCache.set(cacheKey, { ...coordinates });
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

const emptyGeocodeStats = () => ({
  geocodeRequested: 0,
  geocodeCacheHits: 0,
  geocodeResolved: 0,
  geocodeFailed: 0,
  geocodeTimedOut: 0,
  geocodeDurationMs: 0,
});

function geocodeQueryFor(item, request = {}) {
  return String(item?.location || "").trim()
    || [item?.community, request.district, request.city].filter(Boolean).join(" ");
}

async function enrichResultsWithCoordinates(results, request = {}) {
  const startedAt = Date.now();
  const output = (Array.isArray(results) ? results : []).map((item) => ({
    ...item,
    endTime: normalizeDate(item?.endTime),
  }));
  const stats = emptyGeocodeStats();
  loadPersistentGeocodeCache();
  geocodeFailureCache.clear();
  const deadlineAt = startedAt + GEOCODE_TOTAL_BUDGET_MS;
  for (const item of output) {
    if (item.longitude != null && item.latitude != null) continue;
    const address = geocodeQueryFor(item, request);
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

async function writeResultArtifacts(results, request, metadata = {}) {
  const baseResults = (Array.isArray(results) ? results : []).map(normalizeResultRow);
  let enrichedResults = baseResults;
  let geocodeStats = emptyGeocodeStats();
  if (request.generateMap !== false) {
    try {
      const enrichment = await enrichResultsWithCoordinates(baseResults, request);
      enrichedResults = enrichment.results;
      geocodeStats = enrichment.stats;
    } catch {
      // 定位管线异常不阻塞结果产物生成。
      enrichedResults = baseResults.map((item) => ({ ...item, endTime: normalizeDate(item?.endTime) }));
      geocodeStats = emptyGeocodeStats();
    }
  }
  const outputDirectory = outputDirectoryFor(request);
  const jsonPath = path.join(outputDirectory, RESULT_JSON_NAME);
  writeUtf8Atomic(jsonPath, `${JSON.stringify({
    type: "alibaba-lease-result",
    version: 1,
    generatedAt: new Date().toISOString(),
    request: { ...request },
    metadata: { ...metadata, ...geocodeStats },
    results: enrichedResults,
  }, null, 2)}\n`);
  const htmlPath = writeResultHtml(enrichedResults, request, metadata);
  let mapArtifacts = { mapPath: "", coordsPath: "", pointsJsPath: "", locatedCount: 0, unlocatedCount: enrichedResults.length };
  if (request.generateMap === false) {
    removeMapAssets(request);
  } else {
    const located = enrichedResults.filter((item) => item.longitude != null && item.latitude != null).length;
    if (!located) {
      removeMapAssets(request);
    } else {
      try {
        mapArtifacts = writeMapAssets(enrichedResults, request);
      } catch (error) {
        if (!String(error?.message || "").startsWith("ALIBABA_LEASE_MAP_ASSET_MISSING")) throw error;
        mapArtifacts = { mapPath: "", coordsPath: "", pointsJsPath: "", locatedCount: located, unlocatedCount: enrichedResults.length - located };
      }
    }
  }
  const historyPath = writeHistoryManifest(enrichedResults, request, metadata, mapArtifacts);
  return {
    htmlPath,
    jsonPath,
    historyPath,
    results: enrichedResults,
    ...mapArtifacts,
    ...geocodeStats,
    mapGeneration: mapArtifacts.mapPath
      ? "generated"
      : request.generateMap === false
        ? "disabled"
        : "skipped_no_coordinates",
  };
}

function validateResultOutputPath(value, outputDirectory = RESULT_ROOT, extensions = [".html", ".xlsx"]) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\0") || !path.isAbsolute(raw)) throw new Error("ALIBABA_LEASE_RESULT_PATH_INVALID");
  const resolved = path.resolve(raw);
  let root;
  try { root = fs.realpathSync(outputDirectory); } catch { throw new Error("ALIBABA_LEASE_OUTPUT_DIRECTORY_INVALID"); }
  if (!isInsideDirectory(root, resolved) || !extensions.includes(path.extname(resolved).toLowerCase())) {
    throw new Error("ALIBABA_LEASE_RESULT_PATH_NOT_ALLOWED");
  }
  return resolved;
}

function normalizeExcelRows(results) {
  return (Array.isArray(results) ? results : []).map(normalizeResultRow);
}

async function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, {
      timeout: options.timeout || 180000,
      maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env },
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

async function writeResultExcel(results, request, metadata = {}, outputPath = "") {
  const rows = normalizeExcelRows(results);
  if (!rows.length) throw new Error("ALIBABA_LEASE_EXCEL_NO_RESULTS");
  const outputDirectory = outputDirectoryFor(request);
  const target = validateResultOutputPath(outputPath || path.join(outputDirectory, RESULT_EXCEL_NAME), outputDirectory, [".xlsx"]);
  const payloadPath = path.join(outputDirectory, `.lease-excel-export-${process.pid}-${Date.now()}.json`);
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
    const execution = await runCommand(PYTHON_BIN, ["-c", RESULT_EXCEL_SCRIPT, payloadPath, target], { timeout: 180000 });
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size <= 0) throw new Error("ALIBABA_LEASE_EXCEL_READBACK_FAILED");
    return {
      ok: true,
      action: "write_alibaba_lease_excel",
      excelPath: target,
      rowCount: rows.length,
      fileSize: stat.size,
      pythonEngine: String(execution.stdout || "").trim(),
      security: security(),
    };
  } catch (error) {
    if (String(error?.message || "").startsWith("ALIBABA_LEASE_")) throw error;
    const failure = new Error(`ALIBABA_LEASE_EXCEL_EXPORT_FAILED: ${safeError(error)}`.slice(0, 400));
    failure.code = "ALIBABA_LEASE_EXCEL_EXPORT_FAILED";
    throw failure;
  } finally {
    try { fs.unlinkSync(payloadPath); } catch { /* already removed */ }
  }
}

function openResultPath(value, outputDirectory = RESULT_ROOT) {
  return validateResultOutputPath(value, outputDirectory, [".html", ".xlsx", ".json"]);
}

module.exports = {
  RESULT_ROOT,
  RESULT_EXCEL_COLUMNS,
  addressSearchVariants,
  gcj02ToWgs84,
  geocodeAddress,
  enrichResultsWithCoordinates,
  normalizeRequest,
  normalizeResultRow,
  normalizeDate,
  outputDirectoryFor,
  parseAmapCoordinate,
  parseNominatimCoordinate,
  renderResultHtml,
  renderLeaseMapHtml,
  writeResultArtifacts,
  writeResultExcel,
  openResultPath,
  safeError,
  security,
};
