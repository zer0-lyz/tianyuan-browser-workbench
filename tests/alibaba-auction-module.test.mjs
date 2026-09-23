import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { alibabaAuctionModule, alibabaPageReady, directCandidateInScope, directMergeListingEvidence, directPageBeforeRequestedRange, directParseDetail, isAlibabaVerificationUrl, normalizeConfig, readAlibabaPageWithManualVerification } from "../extension/src/modules/alibaba-auction/module.js";
import {
  browserPageReady,
  candidateInScope,
  DETAIL_EXTRACT_SCRIPT,
  LIST_EXTRACT_SCRIPT,
  listHistory,
  loadHistory,
  matchesRequest,
  normalizeRequest,
  pageBeforeRequestedRange,
  parseDetail,
  writeResultArtifacts,
} from "../native-helper/alibaba-auction.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(repoRoot, "extension/src/modules/alibaba-auction");
const template = fs.readFileSync(path.join(moduleRoot, "template.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");

assert.equal(alibabaAuctionModule.manifest.id, "alibaba-auction");
assert.equal(alibabaAuctionModule.manifest.route, "alibaba-auction");
assert.equal(alibabaAuctionModule.manifest.stage, "stable");
assert.match(template, /网络抓取/);
assert.match(template, /历史抓取数据/);
assert.ok(template.indexOf('class="section alibaba-auction-output"') < template.indexOf('class="section alibaba-auction-network-action"'));
assert.match(template, /网络抓取前先选择上级目录/);
assert.match(moduleSource, /load_alibaba_auction_history/);
assert.match(moduleSource, /write_alibaba_auction_result/);
assert.match(moduleSource, /runCurrentTabScrape\(context, \{/);
assert.match(moduleSource, /request\.historyPath/);
assert.match(moduleSource, /尚未选择输出目录/);
assert.match(moduleSource, /readAlibabaPageWithManualVerification/);
assert.equal(isAlibabaVerificationUrl("https://sec.taobao.com/verify"), true);
assert.equal(isAlibabaVerificationUrl("https://login.taobao.com/member/login.jhtml"), true);
assert.equal(isAlibabaVerificationUrl("https://sf.taobao.com/list/50025969__2.htm"), false);
const finishedRequest = normalizeConfig({ status: "finished", propertyType: "residential", cityCode: "330100" });
assert.equal(directParseDetail({ transactionAmount: "319119", hasSoldText: true, hasExplicitSoldPrice: true, hasEndedText: true, hasInvalidStatus: false, bidCount: "" }, finishedRequest).valid, true);
assert.equal(directParseDetail({ transactionAmount: "319119", hasSoldText: false, hasExplicitSoldPrice: false, hasEndedText: true, hasInvalidStatus: false, bidCount: "" }, finishedRequest).valid, false);
const tenThousandCase = directParseDetail({ transactionAmount: "当前价：31.9119万", hasSoldText: true, hasExplicitSoldPrice: true, hasEndedText: true, hasInvalidStatus: false, bidCount: "1" }, finishedRequest);
assert.equal(tenThousandCase.valid, true);
assert.equal(tenThousandCase.transactionAmount, 319119);
assert.equal(directParseDetail({ pageText: "结束时间 2026/06/05 10:00:00\\n当前价：31.9119万\\n本场已结束！", hasInvalidStatus: false }, finishedRequest).valid, true);
const collapsedDetailCase = directParseDetail(directMergeListingEvidence({ hasInvalidStatus: false }, { listedAmount: "拍下价 ¥628,320 元", listedBidCount: 1, listedHasEndedText: true, listedHasExplicitSoldPrice: true }), finishedRequest);
assert.equal(collapsedDetailCase.valid, true);
assert.equal(collapsedDetailCase.transactionAmount, 628320);
const pageTextOnlyCase = directParseDetail({ pageText: "结束时间 2026/06/18 10:31:30\\n拍下价：285,600 元\\n本场已结束！", hasInvalidStatus: false }, finishedRequest);
assert.equal(pageTextOnlyCase.valid, true);
assert.equal(pageTextOnlyCase.transactionAmount, 285600);
assert.equal(pageTextOnlyCase.transactionTime, "2026-06-18");
assert.equal(directParseDetail({ pageText: "结束时间：2026年6月18日 10:31:30\\n成交价：285,600 元\\n本场已结束！", hasInvalidStatus: false }, finishedRequest).transactionTime, "2026-06-18");
const nativePageTextOnlyCase = parseDetail({ pageText: "结束时间 2026/06/18 10:31:30\\n拍下价：285,600 元\\n本场已结束！", hasInvalidStatus: false }, normalizeRequest({ status: "finished", propertyType: "residential" }));
assert.equal(nativePageTextOnlyCase.valid, true);
assert.equal(nativePageTextOnlyCase.transactionAmount, 285600);
assert.equal(parseDetail({ pageText: "结束时间：2026年6月18日 10:31:30\\n成交价：285,600 元\\n本场已结束！", hasInvalidStatus: false }, normalizeRequest({ status: "finished", propertyType: "residential" })).transactionTime, "2026-06-18");
assert.equal(parseDetail({ transactionAmount: "当前价：31.9119万", hasSoldText: true, hasExplicitSoldPrice: true, hasEndedText: true, hasInvalidStatus: false, bidCount: "" }, normalizeRequest({ status: "finished", propertyType: "residential" })).valid, true);
assert.equal(parseDetail({ pageText: "结束时间 2026/06/05 10:00:00\\n当前价：31.9119万\\n本场已结束！", hasInvalidStatus: false }, normalizeRequest({ status: "finished", propertyType: "residential" })).valid, true);
assert.equal(parseDetail({ transactionAmount: "", hasSoldText: false, hasExplicitSoldPrice: false, hasEndedText: true, hasInvalidStatus: false, bidCount: "" }, normalizeRequest({ status: "finished", propertyType: "residential" })).valid, false);
const screenshotCase = parseDetail({
  title: "位于宜昌市西陵区樊湖二路54号的一宗住宅房地产",
  pageText: "结束时间 2026/06/05 10:00:00\\n成交价 319,119 元\\n本场已结束！",
  hasInvalidStatus: false,
}, normalizeRequest({ status: "finished", propertyType: "residential", startDate: "2026-06-01", endDate: "2026-06-30" }));
assert.equal(screenshotCase.propertyType, "住宅用房");
assert.equal(screenshotCase.valid, true);
assert.equal(screenshotCase.transactionAmount, 319119);
assert.equal(screenshotCase.transactionTime, "2026-06-05");
assert.equal(matchesRequest(screenshotCase, normalizeRequest({ status: "finished", propertyType: "residential", startDate: "2026-06-01", endDate: "2026-06-30" })), true);

const noTitleDetail = { url: "https://sf.taobao.com/sf_item/123", title: "", pageText: "标的物位置 杭州市西湖区 结束时间 2026/06/05 成交价 319,119 元 本场已结束" };
assert.equal(alibabaPageReady(noTitleDetail, noTitleDetail.url), true);
assert.equal(browserPageReady(noTitleDetail, noTitleDetail.url), true);
assert.match(moduleSource, /querySelectorAll\('\[class\*="captcha"/);
assert.match(moduleSource, /\.some\(isVisible\)/);
assert.match(LIST_EXTRACT_SCRIPT, /\.some\(isVisible\)/);
assert.match(DETAIL_EXTRACT_SCRIPT, /\.some\(isVisible\)/);
assert.match(DETAIL_EXTRACT_SCRIPT, /#J_desc/);
assert.match(DETAIL_EXTRACT_SCRIPT, /detailContentReady/);
assert.doesNotMatch(LIST_EXTRACT_SCRIPT, /verificationRequired:\s*Boolean\(document\.querySelector/);
assert.doesNotMatch(DETAIL_EXTRACT_SCRIPT, /verificationRequired:\s*Boolean\(document\.querySelector/);
const hiddenVerificationParent = {
  parentElement: null,
  hasAttribute: (name) => name === "hidden",
  getAttribute: () => null,
};
const hiddenVerificationNode = {
  parentElement: hiddenVerificationParent,
  hasAttribute: (name) => name === "hidden",
  getAttribute: () => null,
  getBoundingClientRect: () => ({ width: 100, height: 100 }),
  getClientRects: () => [{ width: 100, height: 100 }],
};
const visibleListAnchor = {
  parentElement: null,
  href: "https://sf.taobao.com/sf_item/123",
  innerText: "住宅案例 成交价 319,119 元",
  textContent: "住宅案例 成交价 319,119 元",
  id: "",
  className: "",
  hasAttribute: () => false,
  getAttribute: () => null,
  getBoundingClientRect: () => ({ width: 100, height: 20 }),
  getClientRects: () => [{ width: 100, height: 20 }],
};
const extractionDocument = {
  title: "",
  body: { innerText: "标的物 结束时间 2026/06/05 成交价 319,119 元 本场已结束" },
  scripts: [],
  querySelector: () => null,
  querySelectorAll: (selector) => {
    if (selector.startsWith('a[href*="/sf_item/"]')) return [visibleListAnchor];
    if (selector.includes("captcha") || selector.includes("slider") || selector.includes("verify")) return [hiddenVerificationNode];
    return [];
  },
};
const extractionContext = {
  document: extractionDocument,
  location: { href: "https://sf.taobao.com/sf_item/123" },
  window: { getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }) },
};
const extractedListWithHiddenVerification = vm.runInNewContext(LIST_EXTRACT_SCRIPT, extractionContext);
const extractedDetailWithHiddenVerification = await vm.runInNewContext(DETAIL_EXTRACT_SCRIPT, extractionContext);
assert.equal(extractedListWithHiddenVerification.verificationRequired, false);
assert.equal(extractedDetailWithHiddenVerification.verificationRequired, false);
assert.equal(extractedDetailWithHiddenVerification.detailContentReady, true);
assert.equal(extractedListWithHiddenVerification.items.length, 1);
const detailRootDocument = (text) => ({
  ...extractionDocument,
  querySelector: (selector) => selector === "#J_desc" ? { innerText: text, textContent: text } : null,
});
assert.equal((await vm.runInNewContext(DETAIL_EXTRACT_SCRIPT, {
  ...extractionContext,
  document: detailRootDocument("加载中......"),
})).detailContentReady, false);
assert.equal((await vm.runInNewContext(DETAIL_EXTRACT_SCRIPT, {
  ...extractionContext,
  document: detailRootDocument("建筑面积为89.92平方米，所在楼层为7/12层。"),
})).detailContentReady, true);
assert.equal((await vm.runInNewContext(DETAIL_EXTRACT_SCRIPT, {
  ...extractionContext,
  document: detailRootDocument("房屋尚未腾退，房主在该房屋居住。"),
})).detailContentReady, true);
const noticeSection = { innerText: "竞买公告 公告详情加载中......", textContent: "竞买公告 公告详情加载中......" };
const dynamicNoticeDocument = {
  ...extractionDocument,
  body: { get innerText() { return `标的物 结束时间 2026/08/15 成交价 381,510 元 本场已结束 ${noticeSection.innerText}`; } },
  querySelector: (selector) => {
    if (selector === "#J_desc") return { innerText: "拍卖标的调查情况表", textContent: "拍卖标的调查情况表" };
    if (selector === "#NoticeDetail") return noticeSection;
    if (selector === '#J_DetailTabMenu a[href="#NoticeDetail"]') return {
      scrollIntoView: () => {},
      click: () => {
        noticeSection.innerText = "竞买公告 一、拍卖标的 建筑面积为96.7㎡，所在楼层为4/24层。";
        noticeSection.textContent = noticeSection.innerText;
      },
    };
    return null;
  },
};
const dynamicNoticeDetail = await vm.runInNewContext(DETAIL_EXTRACT_SCRIPT, {
  document: dynamicNoticeDocument,
  location: extractionContext.location,
  window: extractionContext.window,
  setTimeout,
});
assert.equal(dynamicNoticeDetail.buildingArea, "96.7");
assert.equal(dynamicNoticeDetail.floor, "4");
assert.equal(dynamicNoticeDetail.totalFloors, "24");
const dynamicNoticeParsed = directParseDetail(dynamicNoticeDetail, finishedRequest);
assert.equal(dynamicNoticeParsed.buildingArea, 96.7);
assert.equal(dynamicNoticeParsed.floor, "4");
assert.equal(dynamicNoticeParsed.totalFloors, 24);
const asyncDetail = {
  url: "https://sf-item.taobao.com/sf_item/1057771171410.htm",
  pageText: "结束时间 2026/07/03 10:38:14\n拍下价 376,000 元\n本场已结束",
  detailContentText: "该房屋为钢混结构，所在楼层为7/12层。建筑面积为89.92平方米。",
  detailContentReady: true,
  transactionAmount: "拍下价 376,000 元",
  bidCount: "31",
  hasSoldText: true,
  hasExplicitSoldPrice: true,
  hasEndedText: true,
  hasInvalidStatus: false,
};
const asyncExtensionCase = directParseDetail(asyncDetail, finishedRequest);
assert.equal(asyncExtensionCase.buildingArea, 89.92);
assert.equal(asyncExtensionCase.floor, "7");
assert.equal(asyncExtensionCase.totalFloors, 12);
const asyncNativeCase = parseDetail(asyncDetail, normalizeRequest({ status: "finished", propertyType: "residential" }));
assert.equal(asyncNativeCase.buildingArea, 89.92);
assert.equal(asyncNativeCase.floor, "7");
assert.equal(asyncNativeCase.totalFloors, 12);
assert.equal(alibabaPageReady({ ...noTitleDetail, detailContentReady: false }, noTitleDetail.url), false);
assert.equal(browserPageReady({ ...noTitleDetail, detailContentReady: false }, noTitleDetail.url), false);
assert.equal(alibabaPageReady({ ...noTitleDetail, detailContentReady: true }, noTitleDetail.url), true);
assert.equal(browserPageReady({ ...noTitleDetail, detailContentReady: true }, noTitleDetail.url), true);
const cardWithUnreliableState = { text: "距结束 00:12:30 2026/06/30 至 2026/07/02" };
const dateLockedRequest = normalizeRequest({ status: "finished", propertyType: "residential", startDate: "2026-06-01", endDate: "2026-06-30" });
assert.equal(directCandidateInScope(cardWithUnreliableState, dateLockedRequest), true);
assert.equal(candidateInScope(cardWithUnreliableState, dateLockedRequest), true);
assert.equal(directPageBeforeRequestedRange([cardWithUnreliableState], dateLockedRequest), false);
assert.equal(pageBeforeRequestedRange([cardWithUnreliableState], dateLockedRequest), false);
const endedDetailAfterUnreliableCard = directParseDetail(directMergeListingEvidence({
  pageText: "结束时间 2026/06/05 10:00:00\\n成交价 319,119 元\\n本场已结束",
  hasInvalidStatus: false,
}, cardWithUnreliableState), dateLockedRequest);
assert.equal(endedDetailAfterUnreliableCard.valid, true);
assert.equal(endedDetailAfterUnreliableCard.transactionAmount, 319119);
const nativeEndedDetailAfterUnreliableCard = parseDetail({
  pageText: "结束时间 2026/06/05 10:00:00\\n成交价 319,119 元\\n本场已结束",
  hasInvalidStatus: false,
}, dateLockedRequest);
assert.equal(nativeEndedDetailAfterUnreliableCard.valid, true);
assert.equal(nativeEndedDetailAfterUnreliableCard.transactionAmount, 319119);

assert.equal(alibabaPageReady({ url: "https://sf.taobao.com/verify", title: "验证", pageText: "请完成滑块验证", verificationRequired: true }, "https://sf.taobao.com/sf_item/123"), false);
const verificationTarget = "https://sf.taobao.com/sf_item/123";
const verificationValues = [
  { url: "https://sf.taobao.com/redirecting", title: "正在跳转", pageText: "请稍候" },
  { url: verificationTarget, title: "测试成交案例", pageText: "标的物 结束时间 2026/06/05 成交价 319,119 元 本场已结束" },
];
let restoredVerificationUrl = "";
const verificationChrome = {
  tabs: {
    get: async (id) => ({ id, url: "https://sec.taobao.com/verify" }),
    query: async () => [{ id: 11, url: "https://sec.taobao.com/verify" }],
    update: async (id, changes) => { restoredVerificationUrl = changes.url; return { id, ...changes }; },
  },
  scripting: {
    executeScript: async () => [{ result: verificationValues.shift() }],
  },
};
const resumed = await readAlibabaPageWithManualVerification(
  { chrome: verificationChrome },
  { id: 11, url: "https://sec.taobao.com/verify" },
  () => ({}),
  () => {},
  "核验详情",
  null,
  { expectedUrl: verificationTarget, pageKind: "detail", pollIntervalMs: 1, timeoutMs: 100 },
);
assert.equal(resumed.value.url, verificationTarget);
assert.equal(resumed.tab.id, 11);
assert.equal(restoredVerificationUrl, verificationTarget);

let replacementGets = 0;
const replacementValues = [
  { url: "https://sf.taobao.com/redirecting", title: "正在跳转", pageText: "请稍候" },
  { url: verificationTarget, title: "替换后的详情", pageText: "标的物 结束时间 2026/06/05 成交价 319,119 元 本场已结束" },
];
const replacementChrome = {
  tabs: {
    get: async (id) => {
      replacementGets += 1;
      if (id === 1 && replacementGets >= 3) throw new Error("TAB_REPLACED");
      return { id, url: "https://sec.taobao.com/verify" };
    },
    query: async () => [{ id: 2, url: "https://sec.taobao.com/verify" }],
  },
  scripting: {
    executeScript: async ({ target }) => [{ result: replacementValues.shift(), target }],
  },
};
const replaced = await readAlibabaPageWithManualVerification(
  { chrome: replacementChrome },
  { id: 1, url: "https://sec.taobao.com/verify" },
  () => ({}),
  () => {},
  "核验详情",
  null,
  { expectedUrl: verificationTarget, pageKind: "detail", pollIntervalMs: 1, timeoutMs: 100 },
);
assert.equal(replaced.value.url, verificationTarget);
assert.equal(replaced.tab.id, 2);

const activeReplacementChrome = {
  tabs: {
    get: async (id) => ({ id, url: "https://sec.taobao.com/verify" }),
    query: async (queryInfo) => queryInfo?.active
      ? [{ id: 22, url: verificationTarget, active: true }]
      : [{ id: 11, url: "https://sec.taobao.com/verify" }, { id: 22, url: verificationTarget, active: true }],
  },
  scripting: {
    executeScript: async ({ target }) => [{ result: target.tabId === 22 ? {
      url: verificationTarget,
      title: "",
      pageText: "标的物位置 杭州市西湖区 结束时间 2026/06/05 成交价 319,119 元 本场已结束",
    } : { url: "https://sec.taobao.com/verify", title: "验证", pageText: "请完成滑块验证", verificationRequired: true } }],
  },
};
const activeReplacement = await readAlibabaPageWithManualVerification(
  { chrome: activeReplacementChrome },
  { id: 11, url: "https://sec.taobao.com/verify" },
  () => ({}),
  () => {},
  "核验详情",
  null,
  { expectedUrl: verificationTarget, pageKind: "detail", pollIntervalMs: 1, timeoutMs: 100 },
);
assert.equal(activeReplacement.value.url, verificationTarget);
assert.equal(activeReplacement.tab.id, 22);

const loadingValues = [
  { url: verificationTarget, title: "详情加载中", pageText: "标的物", detailContentReady: false },
  { url: verificationTarget, title: "测试成交案例", pageText: "标的物位置 杭州市西湖区 结束时间 2026/06/05 成交价 319,119 元 本场已结束", detailContentReady: true },
];
const loadingMessages = [];
const loadingChrome = {
  tabs: {
    get: async (id) => ({ id, url: verificationTarget }),
    query: async () => [{ id: 12, url: verificationTarget }],
  },
  scripting: {
    executeScript: async () => [{ result: loadingValues.shift() }],
  },
};
const loadedAfterWait = await readAlibabaPageWithManualVerification(
  { chrome: loadingChrome },
  { id: 12, url: verificationTarget },
  () => ({}),
  (payload) => loadingMessages.push(payload.message),
  "核验详情",
  null,
  { expectedUrl: verificationTarget, pageKind: "detail", pollIntervalMs: 1, timeoutMs: 100 },
);
assert.equal(loadedAfterWait.value.detailContentReady, true);
assert.ok(loadingMessages.some((message) => message.includes("关键字段加载完成")));
assert.ok(loadingMessages.every((message) => !message.includes("完成滑块验证")));

const timeoutChrome = {
  tabs: {
    get: async (id) => ({ id, url: "https://sec.taobao.com/verify" }),
    query: async () => [{ id: 3, url: "https://sec.taobao.com/verify" }],
  },
  scripting: {
    executeScript: async () => [{ result: { url: "https://sec.taobao.com/verify", title: "验证", pageText: "请完成滑块验证", verificationRequired: true } }],
  },
};
await assert.rejects(
  readAlibabaPageWithManualVerification(
    { chrome: timeoutChrome },
    { id: 3, url: "https://sec.taobao.com/verify" },
    () => ({}),
    () => {},
    "核验详情",
    null,
    { expectedUrl: verificationTarget, pageKind: "detail", pollIntervalMs: 1, timeoutMs: 5 },
  ),
  (error) => error?.code === "ALIBABA_VERIFICATION_TIMEOUT",
);
assert.match(nativeHost, /list_alibaba_auction_history/);
assert.match(nativeHost, /load_alibaba_auction_history/);
assert.match(nativeHost, /write_alibaba_auction_result/);
assert.match(nativeHost, /run_alibaba_auction/);
assert.match(installer, /alibaba-auction\.js/);

const config = normalizeConfig({ historyDirectory: "/tmp/history", historyPath: "/tmp/history/latest_history.json" });
assert.equal(config.historyDirectory, "/tmp/history");
assert.equal(config.historyPath, "/tmp/history/latest_history.json");
assert.equal(config.historyRefresh, true);

const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-alibaba-test-"));
try {
  const request = normalizeRequest({
    outputDirectory,
    sourceUrl: "https://sf.taobao.com/list/50025969__2.htm",
    generateMap: false,
  });
  const results = [{
    title: "测试成交案例",
    city: "杭州市",
    district: "西湖区",
    propertyType: "住宅用房",
    address: "测试地址",
    transactionAmount: "1000000",
    url: "https://sf.taobao.com/auction/123",
  }];
  const artifacts = await writeResultArtifacts(results, request, { candidates: 2, skipped: 1 });
  assert.ok(artifacts.historyPath);
  assert.equal(fs.existsSync(artifacts.historyPath), true);
  const catalog = listHistory(outputDirectory);
  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].recordCount, 1);
  assert.equal(catalog.items[0].canRefresh, true);
  const loaded = loadHistory(artifacts.historyPath);
  assert.equal(loaded.results.length, 1);
  assert.equal(loaded.results[0].url, "https://sf.taobao.com/auction/123");
  assert.equal(loaded.request.outputDirectory, outputDirectory);
  assert.equal(loaded.htmlPath, artifacts.htmlPath);
} finally {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
}

const historyMapDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-alibaba-history-map-"));
try {
  const historyPath = path.join(historyMapDirectory, "latest_history.json");
  const oldMapPath = path.join(historyMapDirectory, "latest_map.html");
  const historyPayload = {
    type: "alibaba-auction-history",
    version: 1,
    request: { outputDirectory: "/obsolete/path", generateMap: true, city: "宜昌市" },
    outputs: { map: "latest_map.html" },
    results: [{
      title: "历史住宅案例",
      propertyType: "住宅用房",
      address: "宜昌市西陵区测试路1号",
      transactionTime: "2026-06-05",
      transactionAmount: 319119,
      longitude: 111.286,
      latitude: 30.691,
      url: "https://sf.taobao.com/auction/history-1",
    }],
  };
  fs.writeFileSync(historyPath, `${JSON.stringify(historyPayload, null, 2)}\n`);
  fs.writeFileSync(oldMapPath, "<html>legacy map</html>");
  const before = fs.readFileSync(historyPath);
  const loaded = loadHistory(historyPath);
  assert.equal(loaded.mapRebuilt, true);
  assert.equal(loaded.mapGeneration, "rebuilt-from-history");
  assert.equal(loaded.mapPath, path.join(fs.realpathSync(historyMapDirectory), "latest_map.html"));
  assert.equal(loaded.mapPath, fs.realpathSync(oldMapPath));
  assert.deepEqual(fs.readFileSync(historyPath), before);
  const rebuiltMap = fs.readFileSync(loaded.mapPath, "utf8");
  assert.doesNotMatch(rebuiltMap, /legacy map/);
  assert.match(rebuiltMap, /id="land-map-parity"/);
  assert.match(rebuiltMap, /id="map-provider-select"/);
  assert.match(rebuiltMap, /class="work-panel collapsed"/);
  assert.match(rebuiltMap, /id="case-sort"/);
  assert.match(rebuiltMap, /ArcGIS World Street Map/);
  assert.match(rebuiltMap, /高德地图（公开瓦片）/);
  assert.match(rebuiltMap, /OpenStreetMap/);
  assert.match(rebuiltMap, /tileLayer\.on\("tileerror"/);
  assert.match(rebuiltMap, /tianyuan-alibaba-auction-map-provider-v1/);
  assert.match(rebuiltMap, /reference-marker-edit/);
  assert.match(rebuiltMap, /marker\.dragging\?\.disable\(\)/);
  assert.match(rebuiltMap, /renderDistanceResults/);

  historyPayload.request.generateMap = false;
  fs.writeFileSync(historyPath, `${JSON.stringify(historyPayload, null, 2)}\n`);
  const disabledBefore = fs.readFileSync(historyPath);
  const disabled = loadHistory(historyPath);
  assert.equal(disabled.mapPath, "");
  assert.equal(disabled.mapRebuilt, false);
  assert.equal(disabled.mapGeneration, "disabled-by-history-request");
  assert.deepEqual(fs.readFileSync(historyPath), disabledBefore);
} finally {
  fs.rmSync(historyMapDirectory, { recursive: true, force: true });
}

console.log("Alibaba auction module tests passed.");
