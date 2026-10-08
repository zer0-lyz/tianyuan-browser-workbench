"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const helper = require(path.join(repoRoot, "native-helper/alibaba-lease.js"));

const PYTHON_BIN = process.env.TIANYUAN_TEST_PYTHON_BIN || "python3";

const sampleResults = [
  {
    title: "第一次 杭州市上城区三里亭一区2-2-101住宅用房使用权",
    province: "浙江省",
    city: "杭州市",
    district: "上城区",
    community: "三里亭一区",
    location: "浙江省 杭州市 上城区三里亭一区2-2-101",
    transferMode: "出租",
    propertyType: "住宅用房",
    houseUsage: "普通住宅",
    buildingArea: "32.07",
    transactionAmount: "16,300",
    startPrice: "15,300",
    valuationAmount: "",
    monthlyUnitPrice: "",
    leaseTermYears: "5",
    rentPaymentTerms: "租金半年一付，先付后用。",
    rentEscalation: "第二年起，每年租金较上一年递增3%。",
    depositAmount: "7,650",
    orientation: "南北",
    layout: "一居室一厅一卫",
    floor: "1",
    totalFloors: "7",
    decoration: "毛坯",
    bidCount: "2",
    signupCount: "2",
    viewCount: "1194",
    endTime: "2026/09/23 10:04:32",
    resultStatus: "成交",
    longitude: 120.15,
    latitude: 30.28,
    coordinateStatus: "已定位（详情页坐标）",
    verificationStatus: "已核验",
    url: "https://zc-item.taobao.com/auction/1081356663322.htm?spm=x&session=secret",
  },
  {
    title: "无坐标流拍记录",
    district: "上城区",
    endTime: "2026年9月24日",
    resultStatus: "流拍",
    longitude: "not-a-number",
    latitude: null,
  },
];

// 产物测试统一走离线 stub：定位接口返回空候选，未定位记录显式降级。
function installOfflineGeocodeStub() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("alibaba lease native request validation", () => {
  const request = helper.normalizeRequest({
    outputDirectory: "/tmp/lease-out",
    status: "all",
    maxPages: 9,
    sourceUrl: "https://zc-paimai.taobao.com/wow/pm/default/pc/zichansearch?page=1",
  });
  assert.equal(request.status, "all");
  assert.equal(request.maxPages, 5);
  assert.equal(request.outputDirectory, path.resolve("/tmp/lease-out"));
  assert.equal(request.generateMap, true);
  assert.throws(() => helper.normalizeRequest({ outputDirectory: "relative/path" }), /ALIBABA_LEASE_OUTPUT_DIRECTORY_INVALID/);
  assert.throws(() => helper.normalizeRequest({ outputDirectory: "/tmp/ok", sourceUrl: "https://evil.example.com/x" }), /ALIBABA_LEASE_SOURCE_URL_HOST_NOT_ALLOWED/);
  assert.throws(() => helper.normalizeRequest({ outputDirectory: "/tmp/ok", sourceUrl: "not a url" }), /ALIBABA_LEASE_SOURCE_URL_INVALID/);
  assert.equal(helper.normalizeRequest({}).outputDirectory, helper.RESULT_ROOT);
  assert.equal(helper.normalizeRequest({ status: "finished" }).status, "finished");
});

test("alibaba lease normalizeResultRow coerces fields and strips unsafe url params", () => {
  const row = helper.normalizeResultRow(sampleResults[0]);
  assert.equal(row.transactionAmount, 16300);
  assert.equal(row.buildingArea, 32.07);
  assert.equal(row.endTime, "2026-09-23");
  assert.equal(row.monthlyUnitPrice, Math.round((16300 / 60 / 32.07) * 100) / 100);
  assert.equal(row.url, "https://zc-item.taobao.com/auction/1081356663322.htm?spm=x");
  assert.equal(row.platform, "阿里资产");
  assert.equal(row.longitude, 120.15);

  const disclaimed = helper.normalizeResultRow({ location: "浙江省 杭州市 上城区XX小区1幢101室 地图标注仅供参考，具体位置以标的物实际为准" });
  assert.equal(disclaimed.location, "浙江省 杭州市 上城区XX小区1幢101室");

  const invalid = helper.normalizeResultRow(sampleResults[1]);
  assert.equal(invalid.longitude, null);
  assert.equal(invalid.latitude, null);
  assert.equal(invalid.endTime, "2026-09-24");
  assert.equal(invalid.resultStatus, "流拍");
  assert.equal(invalid.coordinateStatus, "未定位");
  assert.equal(helper.normalizeResultRow({ buildingArea: "80.00 平方米" }).buildingArea, 80);
});

test("alibaba lease writeResultArtifacts writes json/html/history and degrades map explicitly", async () => {
  const restoreFetch = installOfflineGeocodeStub();
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lease-native-test-"));
  try {
    const request = helper.normalizeRequest({ outputDirectory, districtCode: "330102" });
    const artifacts = await helper.writeResultArtifacts(sampleResults, request, { candidates: 5, skipped: 2 });
    assert.equal(fs.existsSync(artifacts.htmlPath), true);
    assert.equal(fs.existsSync(artifacts.historyPath), true);
    assert.equal(artifacts.mapGeneration, "generated");
    assert.equal(fs.existsSync(artifacts.mapPath), true);
    assert.equal(fs.existsSync(artifacts.coordsPath), true);

    const html = fs.readFileSync(artifacts.htmlPath, "utf8");
    assert.match(html, /阿里资产租赁抓取结果/);
    assert.match(html, /三里亭一区/);
    assert.match(html, /月租金单价/);
    assert.match(html, /latest_map\.html/);

    const history = JSON.parse(fs.readFileSync(artifacts.historyPath, "utf8"));
    assert.equal(history.type, "alibaba-lease-history");
    assert.equal(history.results.length, 2);
    assert.equal(history.metadata.candidates, 5);
    assert.equal(history.metadata.skipped, 2);

    const jsonPayload = JSON.parse(fs.readFileSync(path.join(outputDirectory, "latest.json"), "utf8"));
    assert.equal(jsonPayload.type, "alibaba-lease-result");
    assert.equal(jsonPayload.results[0].transactionAmount, 16300);

    const mapHtml = fs.readFileSync(artifacts.mapPath, "utf8");
    assert.match(mapHtml, /window\.ALIBABA_LEASE_POINTS|const DATA=/);
    assert.match(mapHtml, /阿里资产租赁地图/);
  } finally {
    restoreFetch();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("alibaba lease writeResultArtifacts skips map without coordinates and honors generateMap=false", async () => {
  const restoreFetch = installOfflineGeocodeStub();
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lease-native-test-"));
  try {
    const request = helper.normalizeRequest({ outputDirectory });
    const noCoords = await helper.writeResultArtifacts([sampleResults[1]], request, {});
    assert.equal(noCoords.mapPath, "");
    assert.equal(noCoords.mapGeneration, "skipped_no_coordinates");
    assert.equal(fs.existsSync(noCoords.htmlPath), true);
    assert.match(fs.readFileSync(noCoords.htmlPath, "utf8"), /本次未生成地图/);

    const disabled = await helper.writeResultArtifacts(sampleResults, helper.normalizeRequest({ outputDirectory, generateMap: false }), {});
    assert.equal(disabled.mapPath, "");
    assert.equal(disabled.mapGeneration, "disabled");
  } finally {
    restoreFetch();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("alibaba lease geocode utilities stay offline-safe", async () => {
  const wgs = helper.gcj02ToWgs84(120.15, 30.28);
  assert.ok(Math.abs(wgs.longitude - 120.145282) < 1e-5);
  assert.ok(Math.abs(wgs.latitude - 30.282331) < 1e-5);
  // 有效范围（经度 70–140）内但中国边界外：原样返回不做偏移。
  assert.equal(helper.gcj02ToWgs84(139, 45).longitude, 139);
  const variants = helper.addressSearchVariants("上城区三里亭一区2-2-101", { province: "浙江省", city: "杭州市", district: "上城区" });
  assert.ok(variants[0].startsWith("浙江省 杭州市 上城区"));
  assert.ok(variants.length >= 2);
  const amapPayload = { data: { tip_list: [{ name: "三里亭一区", x: 120.166, y: 30.29, district: "上城区" }] } };
  const parsed = helper.parseAmapCoordinate(amapPayload, "浙江省 杭州市 上城区 三里亭一区", { city: "杭州市", district: "上城区" }, "上城区三里亭一区");
  assert.equal(parsed.coordinateProvider, "amap");
  assert.ok(parsed.longitude > 120 && parsed.longitude < 121);
  assert.equal(helper.parseNominatimCoordinate([]), null);

  // geocodeAddress：stub 接口永远无候选时返回 null 且不抛错。
  const restoreFetch = installOfflineGeocodeStub();
  try {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lease-geocode-cache-"));
    process.env.TIANYUAN_ALIBABA_LEASE_GEOCODE_CACHE_PATH = path.join(cacheDir, "cache.json");
    try {
      const lookup = await helper.geocodeAddress("上城区三里亭一区", { province: "浙江省", city: "杭州市", district: "上城区", districtCode: "330102", cityCode: "330100" }, { deadlineAt: Date.now() + 9000 });
      assert.equal(lookup.result, null);
      assert.equal(lookup.requested > 0, true);
    } finally {
      delete process.env.TIANYUAN_ALIBABA_LEASE_GEOCODE_CACHE_PATH;
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  } finally {
    restoreFetch();
  }
});

test("alibaba lease renderResultHtml formats numeric cells with thousand separators", () => {
  const html = helper.renderResultHtml(
    [{ title: "千分位案例", transactionAmount: 16300, buildingArea: "32.07", valuationAmount: "", monthlyUnitPrice: 8.47 }],
    helper.normalizeRequest({}),
    {},
  );
  assert.match(html, /16,300/);
  assert.match(html, /32\.07/);
  assert.match(html, /8\.47/);
  assert.equal(html.includes(">16300<"), false);
});

test("alibaba lease map page ships the enhanced auction-parity features", () => {
  const mapHtml = helper.renderLeaseMapHtml({
    stats: { total: 1, located: 1, unlocated: 0 },
    points: [{ id: "1", title: "冠盛大厦1306室", address: "上城区望江东路299号", district: "上城区", community: "冠盛大厦", houseUsage: "办公", propertyType: "商业用房", endTime: "2026-09-30", transactionAmount: 43586.84, monthlyUnitPrice: 69.96, buildingArea: 51.92, leaseTermYears: 1, resultStatus: "成交", coordinateStatus: "已定位", longitude: 120.2, latitude: 30.28, url: "https://zc-item.taobao.com/auction/1.htm" }],
    unlocated: [],
    mapConfig: { amapEnabled: false, amapWebKey: "" },
  }, { district: "上城区" });
  for (const marker of [
    "阿里资产租赁地图", "map-provider-select", "tile-status", "marker-dialog", "distance-panel",
    "reference-marker-list", "ALIBABA_MAP_DISTANCE_REQUEST", "ALIBABA_MAP_SELECTION_CHANGED",
    "ALIBABA_MAP_SET_SELECTED", "tianyuan-alibaba-lease-map-reference-v1", "成交价（首年租金）",
    "月租金单价：", "首年租金：高到低", "租期：",
  ]) assert.ok(mapHtml.includes(marker), `map missing ${marker}`);
  assert.equal(mapHtml.includes("阿里司法拍卖"), false);
  assert.equal(mapHtml.includes("tianyuan-alibaba-auction"), false);
});

test("alibaba lease result page embeds the map with selection and distance wiring", () => {
  const html = helper.renderResultHtml(
    [
      { title: "定位案例", transactionAmount: 43586.84, endTime: "2026-09-30", longitude: 120.2, latitude: 30.28, url: "https://zc-item.taobao.com/auction/1.htm" },
      { title: "未定位案例", transactionAmount: 16300, endTime: "2026-09-24", longitude: null, latitude: null, url: "" },
    ],
    helper.normalizeRequest({ startDate: "2026-01-01", endDate: "2026-10-02" }),
    { candidates: 5, skipped: 2 },
  );
  for (const marker of [
    "alibaba-lease-map-frame", "alibaba-lease-map-resize-handle", "show-selected-distances",
    "clear-selection", "clear-filters", "result-select", "ALIBABA_MAP_SET_SELECTED",
    "ALIBABA_MAP_DISTANCE_REQUEST", "ALIBABA_MAP_SELECTION_CHANGED", "16,300", "43,586.84",
    "该记录没有坐标，无法在地图上定位",
  ]) assert.ok(html.includes(marker), `result page missing ${marker}`);
  assert.match(html, /地图（1 条可定位结果）/);
  // 未定位记录不渲染 iframe 时按钮仍存在但禁用态由脚本控制；iframe 缺失时显示提示。
  const emptyHtml = helper.renderResultHtml([], helper.normalizeRequest({ generateMap: false }), {});
  assert.match(emptyHtml, /本次未生成地图/);
});

test("alibaba lease renderResultHtml escapes untrusted text", () => {
  const html = helper.renderResultHtml(
    [{ title: '<script>alert("x")</script>', url: "javascript:alert(1)" }],
    helper.normalizeRequest({}),
    {},
  );
  assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes("<script>alert"), false);
  // javascript: 链接会被安全域名白名单剔除。
  assert.equal(html.includes('href="javascript:'), false);
});

test("alibaba lease excel export writes a readable workbook when python openpyxl is available", async () => {
  let openpyxlAvailable = false;
  try {
    await new Promise((resolve, reject) => {
      const { execFile } = require("node:child_process");
      execFile(PYTHON_BIN, ["-c", "import openpyxl"], (error) => (error ? reject(error) : resolve()));
    });
    openpyxlAvailable = true;
  } catch {
    openpyxlAvailable = false;
  }
  if (!openpyxlAvailable) {
    console.log("alibaba lease excel export skipped: openpyxl unavailable");
    return;
  }
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lease-native-test-"));
  try {
    const request = helper.normalizeRequest({ outputDirectory });
    const result = await helper.writeResultExcel(sampleResults, request, { candidates: 2, skipped: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.rowCount, 2);
    const stat = fs.statSync(result.excelPath);
    assert.equal(stat.isFile(), true);
    assert.ok(stat.size > 0);
    // 回读校验列头契约与数值格式。
    await new Promise((resolve, reject) => {
      const { execFile } = require("node:child_process");
      const script = [
        "import json,sys",
        "from openpyxl import load_workbook",
        "sheet = load_workbook(sys.argv[1]).active",
        "headers = [cell.value for cell in sheet[1]]",
        "print(json.dumps({'headers': headers, 'a2': sheet['A2'].value, 'i2': sheet['I2'].value}, ensure_ascii=False))",
      ].join("\n");
      execFile(PYTHON_BIN, ["-c", script, result.excelPath], { encoding: "utf8" }, (error, stdout) => {
        if (error) { reject(error); return; }
        const payload = JSON.parse(stdout);
        assert.equal(payload.headers[0], "标的名称");
        assert.equal(payload.headers[4], "标的物位置");
        assert.equal(payload.headers[5], "流转方式");
        assert.equal(payload.headers.includes("小区名称"), false);
        assert.equal(payload.headers.includes("物业类型"), false);
        assert.equal(payload.headers.includes("房屋用途"), true);
        assert.equal(payload.headers.includes("月租金单价（元/m²·月）"), true);
        assert.equal(payload.headers.includes("案例网址"), true);
        assert.equal(payload.a2, sampleResults[0].title);
        assert.equal(payload.i2, 16300);
        resolve();
      });
    });
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("alibaba lease excel export rejects empty results and outside paths", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lease-native-test-"));
  try {
    const request = helper.normalizeRequest({ outputDirectory });
    await assert.rejects(() => helper.writeResultExcel([], request, {}), /ALIBABA_LEASE_EXCEL_NO_RESULTS/);
    await assert.rejects(
      () => helper.writeResultExcel(sampleResults, request, {}, "/tmp/outside-latest.xlsx"),
      /ALIBABA_LEASE_RESULT_PATH_NOT_ALLOWED/,
    );
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
