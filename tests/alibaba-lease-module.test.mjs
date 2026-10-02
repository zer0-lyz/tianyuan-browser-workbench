import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CONFIG,
  alibabaLeaseModule,
  buildSourceUrl,
  candidateInScope,
  canonicalDetailUrl,
  listPageMatchesRequest,
  listPageUrl,
  locationScopeCode,
  matchesRequest,
  mergeListingEvidence,
  normalizeConfig,
  pageBeforeRequestedRange,
  parseLeaseDetail,
  skipReason,
} from "../extension/src/modules/alibaba-lease/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(repoRoot, "extension/src/modules/alibaba-lease");
const template = fs.readFileSync(path.join(moduleRoot, "template.js"), "utf8");
const styles = fs.readFileSync(path.join(moduleRoot, "styles.css"), "utf8");
const moduleSource = fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8");
const sidepanel = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "extension/manifest.json"), "utf8"));
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");

// ---- 静态契约：模块文件、注册、路由、卡片、native 路由与权限 ----

assert.equal(alibabaLeaseModule.manifest.id, "alibaba-lease");
assert.equal(alibabaLeaseModule.manifest.route, "alibaba-lease");
assert.equal(alibabaLeaseModule.manifest.messageNamespace, "alibaba-lease");
assert.equal(alibabaLeaseModule.manifest.entryElementId, "openAlibabaLease");
assert.equal(alibabaLeaseModule.manifest.pageElementId, "page-alibaba-lease");
assert.equal(alibabaLeaseModule.manifest.stage, "stable");
assert.ok(fs.existsSync(path.join(moduleRoot, "template.js")));
assert.ok(fs.existsSync(path.join(moduleRoot, "styles.css")));

assert.match(sidepanel, /import \{ alibabaLeaseModule \} from "\.\.\/modules\/alibaba-lease\/module\.js";/);
assert.match(sidepanel, /moduleRegistry\.register\(alibabaLeaseModule\);/);
assert.match(indexHtml, /id="openAlibabaLease"/);
assert.match(indexHtml, /id="page-alibaba-lease"/);
assert.match(styles, /\[data-module-id="alibaba-lease"\]/);
assert.match(manifest.host_permissions.join("\n"), /https:\/\/zc-paimai\.taobao\.com\/\*/);
assert.match(manifest.host_permissions.join("\n"), /https:\/\/zc-item\.taobao\.com\/\*/);

assert.match(moduleSource, /write_alibaba_lease_result/);
assert.match(moduleSource, /write_alibaba_lease_excel/);
assert.match(moduleSource, /open_alibaba_lease_path/);
assert.match(moduleSource, /select_alibaba_lease_output_directory/);
assert.match(moduleSource, /readPageWithManualVerification/);
assert.match(moduleSource, /extractLeaseListPage/);
assert.match(moduleSource, /extractLeaseDetailPage/);
assert.match(nativeHost, /require\("\.\/alibaba-lease\.js"\)/);
assert.match(nativeHost, /select_alibaba_lease_output_directory/);
assert.match(nativeHost, /write_alibaba_lease_result/);
assert.match(nativeHost, /write_alibaba_lease_excel/);
assert.match(nativeHost, /open_alibaba_lease_path/);
assert.match(nativeHost, /阿里资产租赁/);

// 模板引用的元素 id 必须与 module.js elementMap 完全一致；
// 入口按钮与路由页 id 来自 index.html，不在模块模板中。
const templateIds = [...template.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(templateIds).size, templateIds.length, "lease template contains duplicate ids");
const elementMapIds = (moduleSource.match(/"(openAlibabaLease|page-alibaba-lease|backFromAlibabaLease|alibabaLease[A-Za-z]*|saveAlibabaLeaseParams|resetAlibabaLeaseParams|chooseAlibabaLeaseOutput|runAlibabaLease|pauseAlibabaLease|stopAlibabaLease|clearAlibabaLeaseResults)"/g) || [])
  .map((value) => value.replaceAll('"', ""))
  .filter((id) => !["openAlibabaLease", "page-alibaba-lease"].includes(id));
for (const id of elementMapIds) {
  assert.equal(templateIds.includes(id), true, `elementMap id missing in template: ${id}`);
}

// ---- 参数归一化与检索网址构建 ----

assert.deepEqual(
  Object.keys(DEFAULT_CONFIG).slice(0, 3),
  ["province", "provinceCode", "city"],
);

const config = normalizeConfig({ districtCode: "330102", status: "finished" });
assert.equal(config.province, "浙江省");
assert.equal(config.city, "杭州市");
assert.equal(config.district, "上城区");
assert.equal(locationScopeCode(config), "330102");

assert.throws(() => normalizeConfig({ provinceCode: "999999" }), /ALIBABA_LEASE_PROVINCE_CODE_UNKNOWN/);
assert.equal(normalizeConfig({ maxPages: 99 }).maxPages, 5);
assert.equal(normalizeConfig({ maxPages: "x" }).maxPages, 1);

const sourceUrl = new URL(buildSourceUrl(config));
assert.equal(sourceUrl.origin + sourceUrl.pathname, "https://zc-paimai.taobao.com/wow/pm/default/pc/zichansearch");
assert.equal(sourceUrl.searchParams.get("disableNav"), "YES");
assert.equal(sourceUrl.searchParams.get("page"), "1");
assert.equal(sourceUrl.searchParams.get("fcatV4Ids"), '["206060601"]');
assert.equal(sourceUrl.searchParams.get("h_t_mode"), "[2,3]");
assert.equal(sourceUrl.searchParams.get("structFieldMap"), '{"h_t_mode":"[2,3]"}');
assert.equal(sourceUrl.searchParams.get("statusOrders"), '["2"]');
assert.equal(sourceUrl.searchParams.get("locationCodes"), '["330102"]');
assert.equal(new URL(buildSourceUrl(normalizeConfig({ status: "all" }))).searchParams.get("statusOrders"), null);
assert.equal(new URL(buildSourceUrl(config, 3)).searchParams.get("page"), "3");

const cityScopeConfig = normalizeConfig({ cityCode: "330100", districtCode: "" });
assert.equal(locationScopeCode(cityScopeConfig), "330100");
assert.equal(new URL(buildSourceUrl(cityScopeConfig)).searchParams.get("locationCodes"), '["330100"]');

assert.equal(listPageUrl(buildSourceUrl(config), 2).includes("page=2"), true);
assert.equal(listPageMatchesRequest(sourceUrl.href, config), true);
assert.equal(listPageMatchesRequest("https://zc-paimai.taobao.com/wow/pm/default/pc/zichansearch?locationCodes=%5B%22330103%22%5D", config), false);
assert.equal(listPageMatchesRequest("https://sf.taobao.com/list/50025969__2.htm", config), false);

// ---- 详情链接规范化与候选范围 ----

assert.equal(canonicalDetailUrl("//zc-item.taobao.com/auction/1083334193009.htm?spm=a2129.1"), "https://zc-item.taobao.com/auction/1083334193009.htm");
assert.equal(canonicalDetailUrl("https://item-paimai.taobao.com/auction/1073938855188.htm"), "https://item-paimai.taobao.com/auction/1073938855188.htm");
assert.equal(canonicalDetailUrl("https://sf-item.taobao.com/sf_item/1073938855188.htm"), "");
assert.equal(canonicalDetailUrl("https://zc-item.taobao.com/auction/abc.htm"), "");

assert.equal(candidateInScope({ title: "杭州市上城区景芳东区7-3-501室住宅使用权", text: "使用权" }, {}), true);
assert.equal(candidateInScope({ title: "杭州市平海公寓3幢1002室", text: "当前价 766万" }, {}), false);

// ---- 详情解析：成交、流拍、进行中、字段归一 ----

const baseDetail = {
  url: "https://zc-item.taobao.com/auction/1081356663322.htm?spm=x",
  title: "第一次 杭州市上城区三里亭一区2-2-101住宅用房使用权",
  location: "浙江省 杭州市 上城区三里亭一区2-2-101",
  transferMode: "出租",
  propertyType: "住宅用房",
  houseUsage: "普通住宅",
  community: "三里亭一区",
  orientation: "南北",
  layout: "一居室一厅一卫",
  buildingArea: "32.07",
  floor: "1",
  totalFloors: "7",
  decoration: "毛坯",
  transactionAmount: "16,300",
  startPrice: "15,300",
  valuationAmount: "",
  depositAmount: "7,650",
  monthlyUnitPrice: "",
  leaseTermYears: "5",
  rentPaymentTerms: "租金半年一付，先付后用。",
  rentEscalation: "第二年起，每年租金较上一年递增3%。",
  hasSoldText: true,
  hasExplicitSoldPrice: true,
  hasEndedText: true,
  failedNoBids: false,
  bidCount: 2,
  signupCount: 2,
  viewCount: 1194,
  endTime: "2026/09/23 10:04:32",
  location: "浙江省 杭州市 上城区三里亭一区2-2-101",
  longitude: 120.15,
  latitude: 30.28,
  coordinateSource: "detail-script",
};
const request = normalizeConfig({ districtCode: "330102", status: "finished" });
const parsed = parseLeaseDetail(mergeListingEvidence(baseDetail, { listedEndDate: "2026-09-23" }), request);
assert.equal(parsed.valid, true);
assert.equal(parsed.transactionAmount, 16300);
assert.equal(parsed.endTime, "2026-09-23");
assert.equal(parsed.buildingArea, 32.07);
assert.equal(parsed.url, "https://zc-item.taobao.com/auction/1081356663322.htm");
assert.equal(parsed.location, "浙江省 杭州市 上城区三里亭一区2-2-101");
assert.equal(parsed.resultStatus, "成交");
assert.equal(parsed.platform, "阿里资产");
assert.equal(parsed.coordinateStatus.includes("已定位"), true);
// 月租金单价 = 16300 / (5*12) / 32.07 ≈ 8.47 元/m²·月
assert.equal(parsed.monthlyUnitPrice, Math.round((16300 / 60 / 32.07) * 100) / 100);
assert.equal(matchesRequest(parsed, { ...request, startDate: "2026-09-01", endDate: "2026-09-30" }), true);
assert.equal(matchesRequest(parsed, { startDate: "2026-10-01" }), false);
assert.equal(matchesRequest(parsed, { keyword: "三里亭" }), true);
assert.equal(matchesRequest(parsed, { keyword: "景芳" }), false);

const noBidDetail = { ...baseDetail, hasExplicitSoldPrice: false, bidCount: 0, failedNoBids: true, transactionAmount: "16,300" };
const noBidParsed = parseLeaseDetail(noBidDetail, request);
assert.equal(noBidParsed.valid, false);
assert.equal(noBidParsed.resultStatus, "流拍");
assert.match(skipReason(noBidDetail, noBidParsed, request), /流拍/);

const runningDetail = { ...baseDetail, hasEndedText: false, hasExplicitSoldPrice: false, bidCount: 0, failedNoBids: false };
assert.equal(parseLeaseDetail(runningDetail, request).valid, false);
assert.match(skipReason(runningDetail, parseLeaseDetail(runningDetail, request), request), /尚未结束/);

const endedNoBidDetail = { ...baseDetail, hasExplicitSoldPrice: false, bidCount: 0, failedNoBids: false };
assert.equal(parseLeaseDetail(endedNoBidDetail, request).valid, false);
assert.match(skipReason(endedNoBidDetail, parseLeaseDetail(endedNoBidDetail, request), request), /出价次数为 0/);

// 未知租期/面积时单价留空而不是猜测。
const sparseParsed = parseLeaseDetail({ ...baseDetail, buildingArea: "", leaseTermYears: "", monthlyUnitPrice: "" }, request);
assert.equal(sparseParsed.monthlyUnitPrice, "");

// ---- 翻页提前停止 ----

assert.equal(pageBeforeRequestedRange([
  { listedEndDate: "2026年08月01日" },
  { listedEndDate: "2026年07月20日" },
], { startDate: "2026-09-01" }), true);
assert.equal(pageBeforeRequestedRange([{ listedEndDate: "2026年09月24日" }], { startDate: "2026-09-01" }), false);
assert.equal(pageBeforeRequestedRange([{ listedEndDate: "" }], { startDate: "2026-09-01" }), false);

console.log("alibaba-lease module tests passed.");
