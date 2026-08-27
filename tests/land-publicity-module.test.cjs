"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("land publicity module and skill package are wired", () => {
  for (const relative of [
    "extension/src/modules/land-publicity/module.js",
    "extension/src/modules/land-publicity/template.js",
    "extension/src/modules/land-publicity/styles.css",
    "skills/zj-land-publicity/SKILL.md",
    "skills/zj-land-publicity/scrape_zj_land.py",
    "skills/zj-land-publicity/land_publicity_runner.py",
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, relative)), `missing ${relative}`);
  }
  const moduleSource = fs.readFileSync(path.join(repoRoot, "extension/src/modules/land-publicity/module.js"), "utf8");
  const template = fs.readFileSync(path.join(repoRoot, "extension/src/modules/land-publicity/template.js"), "utf8");
  const html = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/index.html"), "utf8");
  const sidepanel = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
  assert.match(moduleSource, /id: "land-publicity"/);
  assert.match(moduleSource, /route: "land-publicity"/);
  assert.match(moduleSource, /stage: "beta"/);
  assert.match(moduleSource, /streamNativeMessage/);
  assert.match(moduleSource, /if \(!result\?\.ok\) throw/);
  for (const id of [
    "openLandPublicity", "page-land-publicity", "landPublicityDistrict", "landPublicityStartYear",
    "landPublicityQuotePreset", "landPublicityStartPriceMin", "landPublicityAreaMin",
    "landPublicityDistrictExact", "landPublicityProvinceWide", "landPublicityGenerateMap", "runLandPublicity",
    "clearLandPublicityFilters",
    "openLandPublicityHtml", "openLandPublicityExcel", "openLandPublicityMap",
  ]) assert.match(`${html}\n${template}`, new RegExp(`id=\\"${id}\\"`), `missing ${id}`);
  assert.match(sidepanel, /import \{ landPublicityModule \}/);
  assert.match(sidepanel, /moduleRegistry\.register\(landPublicityModule\)/);
  assert.match(sidepanel, /streamNativeMessage,/);
  const styles = fs.readFileSync(path.join(repoRoot, "extension/src/modules/land-publicity/styles.css"), "utf8");
  assert.match(styles, /\[data-module-id="land-publicity"\]/);
});

test("Native Helper validates land action and emits a complete protocol message", () => {
  const nativeHost = path.join(repoRoot, "native-helper/native_host.js");
  const message = Buffer.from(JSON.stringify({
    action: "run_land_publicity",
    request: { outputDirectory: "relative-output", startYear: "2025" },
  }), "utf8");
  const frame = Buffer.alloc(4 + message.length);
  frame.writeUInt32LE(message.length, 0);
  message.copy(frame, 4);
  const result = spawnSync(process.execPath, [nativeHost], {
    cwd: repoRoot,
    input: frame,
    env: {
      ...process.env,
      TIANYUAN_PRINT_SKILLS_DIR: path.join(repoRoot, "skills"),
      TIANYUAN_PYTHON_BIN: process.env.TIANYUAN_PYTHON_BIN || "python3",
    },
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.ok(result.stdout.length >= 4, "Native Helper returned no frame");
  const payloadLength = result.stdout.readUInt32LE(0);
  const payload = JSON.parse(result.stdout.subarray(4, 4 + payloadLength).toString("utf8"));
  assert.equal(payload.event, "complete");
  assert.equal(payload.action, "run_land_publicity");
  assert.equal(payload.ok, false);
  assert.equal(payload.reason, "LAND_OUTPUT_DIRECTORY_INVALID");
  assert.deepEqual(payload.security, { credentialsReturned: false });
});

test("mock land data is filtered and written to Excel, HTML, and map assets", () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "land-publicity-test-"));
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = String.raw`
import json, os, sys
from pathlib import Path
sys.path.insert(0, "skills/zj-land-publicity")
from land_publicity_runner import execute_request
out = Path(os.environ["LAND_TEST_OUTPUT"])
records = [
  {"publicityId":"GS1","sourceCode":"3301-001","districtName":"杭州","releaseTime":"2025-04-17","sourceId":"s1","content":"<table><tr><td>地块位置</td><td>滨江街道</td></tr><tr><td>土地用途</td><td>住宅</td></tr><tr><td>土地面积</td><td>1.5亩</td></tr><tr><td>出让年限</td><td>70年</td></tr><tr><td>成交结果</td><td>2500万元</td></tr><tr><td>受让单位</td><td>甲公司</td></tr></table>"},
  {"publicityId":"GS2","sourceCode":"3301-002","districtName":"杭州","releaseTime":"2025-04-18","sourceId":"s2","content":"<table><tr><td>地块位置</td><td>其他位置</td></tr><tr><td>土地用途</td><td>住宅</td></tr><tr><td>土地面积</td><td>2亩</td></tr></table>"},
]
detail = {
  "s1": {"resourceCoordinate":{"locationType":"CGCS2000","center":{"lng":120.1,"lat":30.2,"originLng":120,"originLat":30},"pointGroups":[{"points":[{"lng":120.1,"lat":30.2}]}]},"assignmentArea":"1000","startPrice":"2000","dealPrice":"2500","resourceLocation":"滨江街道","assignmentPurpose":"住宅"},
  "s2": {"resourceCoordinate":"","assignmentArea":"1333.34","startPrice":"500","resourceLocation":"其他位置","assignmentPurpose":"住宅"},
}
request = {"outputDirectory":str(out),"startYear":"2025","district":"杭州","districtExact":True,"landUses":["住宅用地"],"generateMap":True,"maxPages":1}
result = execute_request(request, fetcher=lambda **kwargs: records, detail_fetcher=lambda source_id: detail[source_id], progress=lambda *args, **kwargs: None)
print(json.dumps(result, ensure_ascii=False))
`;
  try {
    const result = spawnSync(python, ["-c", script], {
      cwd: repoRoot,
      env: { ...process.env, LAND_TEST_OUTPUT: outputDirectory },
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.ok, true);
    assert.equal(payload.fetchedCount, 2);
    assert.equal(payload.filteredCount, 2);
    assert.equal(payload.writtenCount, 2);
    assert.equal(payload.noCoordinateCount, 1);
    for (const key of ["excelPath", "htmlPath", "coordsPath", "pointsJsPath", "mapPath"]) {
      assert.ok(fs.statSync(payload[key]).size > 0, `${key} should be non-empty`);
    }
    const html = fs.readFileSync(payload.htmlPath, "utf8");
    assert.match(html, /下载 Excel/);
    assert.match(html, /查看地图/);
    assert.match(html, /成交公示明细/);
    assert.match(html, /打开详情/);
    assert.match(html, /受让单位/);
    const coords = JSON.parse(fs.readFileSync(payload.coordsPath, "utf8"));
    assert.equal(coords.length, 1);
    assert.match(html, /无坐标（详情接口未返回）/);
    assert.ok(fs.readFileSync(payload.excelPath).subarray(0, 2).equals(Buffer.from("PK")));
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("district city codes match county records and province-wide mode is explicit", () => {
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = String.raw`
import json, os, sys
sys.path.insert(0, "skills/zj-land-publicity")
from land_publicity_runner import filter_records, validate_request

base_request = {
  "tradeForm": "", "provinceWide": False, "location": "", "startDate": "", "startYear": "2025",
  "districtExact": False, "tradeMethods": [], "tradeStages": [], "landUses": [],
  "quotePreset": "all", "quoteStartDate": "", "quoteEndDate": "",
  "startPriceMin": None, "startPriceMax": None, "areaMin": None, "areaMax": None,
  "areaUnit": "sqm",
}
records = [
  {"districtCode": "330100", "districtName": "临安区", "releaseTime": "2025-01-01"},
  {"districtCode": "3301", "districtName": "淳安县", "releaseTime": "2025-01-02"},
  {"districtCode": "330200", "districtName": "宁波市", "releaseTime": "2025-01-03"},
]
enriched = [{"record": record, "detail": {}, "location": "", "start_price": None, "area_sqm": None, "area_mu": None} for record in records]
city = {**base_request, "district": "杭州市"}
county = {**base_request, "district": "临安区", "districtExact": True}
province = {**base_request, "district": "", "provinceWide": True}
city_rows, _ = filter_records(enriched, city)
county_rows, _ = filter_records(enriched, county)
province_rows, _ = filter_records(enriched, province)
validated = validate_request({"outputDirectory": os.getcwd(), "startYear": "2025", "provinceWide": True})
print(json.dumps({"city": len(city_rows), "county": len(county_rows), "province": len(province_rows), "validatedProvinceWide": validated["provinceWide"]}, ensure_ascii=False))
`;
  const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    city: 2,
    county: 1,
    province: 3,
    validatedProvinceWide: true,
  });
});

test("trade method codes map to the selected Chinese filters", () => {
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = String.raw`
import json, sys
sys.path.insert(0, "skills/zj-land-publicity")
from land_publicity_runner import filter_records

base_request = {
  "tradeForm": "", "district": "", "provinceWide": True, "location": "", "startDate": "", "startYear": "2025",
  "districtExact": False, "tradeStages": [], "landUses": [], "quotePreset": "all", "quoteStartDate": "", "quoteEndDate": "",
  "startPriceMin": None, "startPriceMax": None, "areaMin": None, "areaMax": None, "areaUnit": "sqm",
}
records = [
  {"districtName": "杭州", "districtCode": "3301", "releaseTime": "2025-01-01", "tradeType": "GP"},
  {"districtName": "杭州", "districtCode": "3301", "releaseTime": "2025-01-02", "tradeType": "PM"},
  {"districtName": "杭州", "districtCode": "3301", "releaseTime": "2025-01-03", "tradeType": "GPZL"},
  {"districtName": "杭州", "districtCode": "3301", "releaseTime": "2025-01-04", "tradeType": "PMZL"},
]
enriched = [{"record": record, "detail": {}, "location": "", "start_price": None, "area_sqm": None, "area_mu": None} for record in records]
mapping = {}
for method, code in (("挂牌出让", "GP"), ("拍卖出让", "PM"), ("挂牌租赁", "GPZL"), ("拍卖租赁", "PMZL")):
  rows, _ = filter_records(enriched, {**base_request, "tradeMethods": [method]})
  mapping[code] = len(rows)
print(json.dumps(mapping, ensure_ascii=False))
`;
  const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { GP: 1, PM: 1, GPZL: 1, PMZL: 1 });
});

test("zero-row result HTML records the active filter conditions", () => {
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "land-publicity-empty-html-"));
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = String.raw`
import os, sys
from pathlib import Path
sys.path.insert(0, "skills/zj-land-publicity")
from land_publicity_runner import write_result_html
request = {"district": "杭州市", "districtExact": False, "provinceWide": False, "location": "", "tradeForm": "", "tradeMethods": ["挂牌出让"], "tradeStages": ["结果公示"], "landUses": [], "startDate": "", "startYear": "2025", "quotePreset": "all", "quoteStartDate": "", "quoteEndDate": "", "startPriceMin": None, "startPriceMax": None, "areaMin": None, "areaMax": None, "areaUnit": "sqm", "maxPages": 5}
write_result_html(Path(os.environ["LAND_EMPTY_HTML"]), [], request, {"fetched": 2, "warnings": [], "unsupportedFilters": []}, {"excel": "result.xlsx", "map": ""})
`;
  const htmlPath = path.join(outputPath, "result.html");
  try {
    const result = spawnSync(python, ["-c", script], {
      cwd: repoRoot,
      env: { ...process.env, LAND_EMPTY_HTML: htmlPath },
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(html, /结果为 0 条/);
    assert.match(html, /当前筛选条件/);
    assert.match(html, /交易方式=挂牌出让/);
  } finally {
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
});

test("land publicity auto-opens HTML and clears filters without clearing output directory", async () => {
  const { pathToFileURL } = require("node:url");
  const { ModuleScope } = await import(pathToFileURL(path.join(repoRoot, "extension/src/core/module-scope.js")).href);
  const { landPublicityModule } = await import(pathToFileURL(path.join(repoRoot, "extension/src/modules/land-publicity/module.js")).href);
  const elements = new Map();
  function element() {
    return {
      dataset: {}, value: "", checked: false, hidden: false, disabled: false,
      textContent: "", style: {}, classList: { toggle() {} }, listeners: new Map(),
      toggleAttribute(name, value) { if (name === "hidden") this.hidden = Boolean(value); },
      addEventListener(name, listener) { this.listeners.set(name, listener); },
      removeEventListener(name) { this.listeners.delete(name); },
      remove() {},
      dispatch(name) { return this.listeners.get(name)?.({ type: name }); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }
  const documentRef = {
    head: { appendChild() {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement() { return element(); },
  };
  const saved = [];
  const nativeMessages = [];
  const context = {
    manifest: landPublicityModule.manifest,
    document: documentRef,
    chrome: { runtime: { getURL(value) { return value; } } },
    scope: new ModuleScope(),
    storage: {
      async load() { return {}; },
      async save(value) { saved.push({ ...value }); },
    },
    navigate() {},
    setStatus() {},
    async sendNativeMessage(message) { nativeMessages.push(message); return { ok: true }; },
    async streamNativeMessage() {
      return {
        ok: true, htmlPath: "/tmp/land-result.html", excelPath: "/tmp/land-result.xlsx", mapPath: "",
        fetchedCount: 3, filteredCount: 0, writtenCount: 0, noCoordinateCount: 0,
        filterSummary: { warnings: [], unsupportedFilters: [] },
      };
    },
  };
  const instance = landPublicityModule.create();
  await instance.initialize(context);
  const selectedTradeMethod = { value: "挂牌出让", checked: true };
  documentRef.getElementById("page-land-publicity").querySelectorAll = (selector) => (
    selector.includes('name="landTradeMethod"') ? [selectedTradeMethod] : []
  );
  const outputDirectory = "/tmp/land-publicity-output";
  documentRef.getElementById("landPublicityDistrict").value = "杭州市";
  documentRef.getElementById("landPublicityOutputDirectory").value = outputDirectory;
  await documentRef.getElementById("runLandPublicity").dispatch("click");
  assert.ok(nativeMessages.some((message) => message.action === "open_land_publicity_path" && message.path === "/tmp/land-result.html"));
  assert.match(documentRef.getElementById("landPublicityResultMessage").textContent, /结果为 0 条/);
  assert.match(documentRef.getElementById("landPublicityResultMessage").textContent, /当前筛选条件：.*交易方式=挂牌出让/);
  assert.equal(documentRef.getElementById("openLandPublicityHtml").disabled, false);

  documentRef.getElementById("landPublicityDistrict").value = "临安区";
  documentRef.getElementById("landPublicityStartYear").value = "2024";
  await documentRef.getElementById("clearLandPublicityFilters").dispatch("click");
  assert.equal(documentRef.getElementById("landPublicityOutputDirectory").value, outputDirectory);
  assert.equal(documentRef.getElementById("landPublicityDistrict").value, "");
  assert.equal(documentRef.getElementById("landPublicityStartYear").value, "2025");
  assert.equal(documentRef.getElementById("landPublicityFetchedCount").textContent, "0");
  assert.equal(documentRef.getElementById("landPublicityFilteredCount").textContent, "0");
  assert.equal(documentRef.getElementById("landPublicityWrittenCount").textContent, "0");
  assert.equal(documentRef.getElementById("landPublicityProgressPercent").textContent, "0%");
  assert.equal(documentRef.getElementById("openLandPublicityHtml").disabled, true);
  assert.equal(saved.at(-1).outputDirectory, outputDirectory);
  context.scope.dispose();
});

test("installers include the land publicity skill", () => {
  const installer = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
  const nativeInstaller = fs.readFileSync(path.join(repoRoot, "native-helper/install_native_host.sh"), "utf8");
  assert.match(installer, /"zj-land-publicity"/);
  assert.match(nativeInstaller, /zj-land-publicity\/land_publicity_runner\.py/);
  const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
  assert.match(nativeHost, /message\?\.action === "run_land_publicity"/);
  assert.match(nativeHost, /TY_LAND_PROGRESS/);
  assert.match(nativeHost, /provinceWide: request\.provinceWide === true/);
  assert.match(nativeHost, /LAND_OUTPUT_OUTSIDE_DIRECTORY/);
});

console.log("Land publicity module tests passed.");
