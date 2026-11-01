"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const PYTHON_BIN = process.env.TIANYUAN_TEST_PYTHON_BIN || "python3";
const SCRIPT_PATH = path.join(repoRoot, "skills/anjuke-property-case-fetcher/scripts/fetch_anjuke_property_cases.py");
const HELPER_PATH = path.join(repoRoot, "native-helper/anjuke-property.js");

const DRIVER = `
import importlib.util, json, sys
from pathlib import Path

script_path, request_path, result_path = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location("anjuke_fetcher_contract", script_path)
mod = importlib.util.module_from_spec(spec)
sys.modules["anjuke_fetcher_contract"] = mod
spec.loader.exec_module(mod)

try:
    import openpyxl  # noqa: F401
    openpyxl_available = True
except Exception:
    openpyxl_available = False

request = json.loads(Path(request_path).read_text(encoding="utf-8"))
candidates = request.pop("fixtureCandidates")
progress = []
result = mod.run_captured_request(request, candidates, lambda payload: progress.append(payload))

facts = {"result": result, "progress": progress, "openpyxlAvailable": openpyxl_available}
excel_path = result.get("excelPath")
if openpyxl_available and result.get("ok") and excel_path and Path(excel_path).exists():
    from openpyxl import load_workbook
    workbook = load_workbook(excel_path)
    sheet = workbook.active
    facts["excel"] = {
        "h2": sheet.cell(2, 8).value,
        "h3": sheet.cell(3, 8).value,
        "l2Format": sheet.cell(2, 12).number_format,
        "r2": sheet.cell(2, 18).value,
        "caseNumbers": [sheet.cell(row, 3).value for row in range(2, sheet.max_row + 1)],
    }
Path(result_path).write_text(json.dumps(facts, ensure_ascii=False), encoding="utf-8")
`;


function runFixture(request) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-contract-"));
  const requestPath = path.join(workspace, "request.json");
  const resultPath = path.join(workspace, "result.json");
  fs.writeFileSync(requestPath, JSON.stringify(request), "utf8");
  const execution = spawnSync(PYTHON_BIN, ["-c", DRIVER, SCRIPT_PATH, requestPath, resultPath], {
    cwd: repoRoot, encoding: "utf8",
  });
  assert.equal(execution.status, 0, `driver failed: ${execution.stderr}`);
  return { workspace, facts: JSON.parse(fs.readFileSync(resultPath, "utf8")) };
}


function saleOutcome(sequence) {
  return {
    url: `https://hz.sydc.anjuke.com/xzl-shou/xihuqu/75624979${sequence}`,
    title: `测试大厦${sequence}`,
    location: `西湖区 测试大厦${sequence}`,
    text: "总价：120万 建筑面积：60㎡ 户型：2房2厅 楼层：中区/20F 朝向：南 装修：精装修 建筑结构：钢混 写字楼出售",
    html: `<html><body>real page ${sequence}</body></html>`,
    longitude: 120.1,
    latitude: 30.2,
    captureStatus: "ok",
    errorCode: "",
  };
}


let workspaceRoot = "";

function newRunRoot(name) {
  if (!workspaceRoot) workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-contract-"));
  return path.join(workspaceRoot, name);
}


function baseRequest(outputDirectory, candidates, overrides = {}) {
  return {
    outputDirectory,
    caseType: "sale",
    maxCases: 10,
    mapAssetsDir: "",
    fixtureCandidates: candidates,
    ...overrides,
  };
}


test("候选证据契约：混合候选输出 evidence.json、真实 HTML 与部分完成状态", () => {
  const blocked = {
    url: "https://hz.sydc.anjuke.com/xzl-shou/xihuqu/7562497924",
    title: "验证页",
    location: "",
    text: "请完成安全验证 滑块",
    html: "<html><body>captcha page</body></html>",
    captureStatus: "blocked_verification",
    errorCode: "ANJUKE_DETAIL_VERIFICATION_REQUIRED",
  };
  const notCase = {
    url: "https://hz.sydc.anjuke.com/xzl-shou/",
    title: "推荐页",
    location: "",
    text: "随便看看",
    captureStatus: "not_case",
    errorCode: "ANJUKE_DETAIL_PAGE_NOT_CASE",
  };
  const runDirectory = newRunRoot("run-mixed");
  const { workspace, facts } = runFixture(baseRequest(runDirectory, [saleOutcome(101), blocked, notCase], {
    runStatus: "partial",
    restoreStatus: "restored",
  }));
  const result = facts.result;
  assert.equal(result.ok, true);
  assert.equal(result.status, "partial");
  assert.equal(result.caseCount, 1);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.blockedVerificationCount, 1);
  assert.equal(result.skippedInvalidCount, 1);

  const evidence = JSON.parse(fs.readFileSync(path.join(runDirectory, "evidence.json"), "utf8"));
  assert.equal(evidence.type, "anjuke-property-evidence");
  assert.equal(evidence.runStatus, "partial");
  assert.equal(evidence.restoreStatus, "restored");
  assert.equal(evidence.candidates.length, 3);
  for (const candidate of evidence.candidates) {
    for (const key of ["detail_url", "case_type", "capture_status", "error_code"]) {
      assert.ok(Object.hasOwn(candidate, key), `missing ${key}`);
    }
  }
  assert.equal(evidence.candidates[0].capture_status, "ok");
  assert.equal(evidence.candidates[1].capture_status, "blocked_verification");
  assert.equal(evidence.candidates[2].capture_status, "not_case");
  const blockedHtml = fs.readFileSync(evidence.candidates[1].html_file, "utf8");
  assert.equal(blockedHtml, "<html><body>captcha page</body></html>", "blocked evidence must be the real page HTML");

  const resultHtml = fs.readFileSync(path.join(runDirectory, "result.html"), "utf8");
  assert.match(resultHtml, /部分完成/);
  assert.match(resultHtml, /候选证据索引/);
  assert.match(resultHtml, /地图使用本地 Leaflet 资产生成。|地图降级/);

  const progress = facts.progress;
  assert.ok(progress.some((item) => item.skipped === 1 && item.blocked === 1), "progress must carry skipped and blocked counts");
  assert.ok(fs.existsSync(path.join(workspace, "request.json")));
  assert.ok(!fs.existsSync(path.join(runDirectory, "map.html")) || fs.existsSync(path.join(runDirectory, "map-assets", "leaflet.js")));
});


test("全部成功：状态 complete、案例序号连续、Excel 公式与文本格式契约", () => {
  const runDirectory = newRunRoot("run-complete");
  const { facts } = runFixture(baseRequest(runDirectory, [saleOutcome(201), saleOutcome(202)], {
    runStatus: "complete",
    restoreStatus: "restored",
    mapAssetsDir: "",
  }));
  const result = facts.result;
  assert.equal(result.ok, true);
  assert.equal(result.status, "complete");
  assert.equal(result.caseCount, 2);
  if (facts.openpyxlAvailable && facts.excel) {
    assert.equal(facts.excel.h2, "=ROUND(E2/F2/(1+G2),0)");
    assert.equal(facts.excel.h3, "=ROUND(E3/F3/(1+G3),0)");
    assert.equal(facts.excel.l2Format, "@");
    assert.match(String(facts.excel.r2), /=HYPERLINK\("https:\/\/hz\.sydc\.anjuke\.com\/xzl-shou\/xihuqu\/75624979201"/);
    assert.deepEqual(facts.excel.caseNumbers, [1, 2]);
  } else {
    assert.ok(true, "openpyxl unavailable on this machine; Excel contract covered by CSV/JSON");
  }
  const rows = JSON.parse(fs.readFileSync(path.join(runDirectory, "cases.json"), "utf8"));
  assert.deepEqual(rows.map((row) => row.case_number), [1, 2]);
  for (const row of rows) {
    for (const key of ["total_price_text", "sale_unit_price_text", "rent_total_text", "rent_unit_price_text", "rent_pricing_basis", "payment_terms_text", "capture_status"]) {
      assert.ok(Object.hasOwn(row, key), `missing ${key}`);
    }
    assert.equal(row.capture_status, "ok");
  }
});


test("全部非案例：不生成案例文件但保留证据索引", () => {
  const runDirectory = newRunRoot("run-empty");
  const notCase = { url: "https://hz.sydc.anjuke.com/xzl-shou/", title: "推荐页", text: "随便看看", captureStatus: "not_case", errorCode: "ANJUKE_DETAIL_PAGE_NOT_CASE" };
  const { facts } = runFixture(baseRequest(runDirectory, [notCase], { runStatus: "partial" }));
  const result = facts.result;
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.ok(fs.existsSync(path.join(runDirectory, "evidence.json")));
  assert.ok(!fs.existsSync(path.join(runDirectory, "cases.csv")));
  assert.ok(!fs.existsSync(path.join(runDirectory, "cases.xlsx")));
});


test("终止状态：runStatus=stopped 保留部分结果并标注已终止", () => {
  const runDirectory = newRunRoot("run-stopped");
  const { facts } = runFixture(baseRequest(runDirectory, [saleOutcome(301)], { runStatus: "stopped", restoreStatus: "restored" }));
  const result = facts.result;
  assert.equal(result.ok, true);
  assert.equal(result.status, "stopped");
  assert.match(result.reason, /已终止/);
  const resultHtml = fs.readFileSync(path.join(runDirectory, "result.html"), "utf8");
  assert.match(resultHtml, /已终止/);
});


test("本地地图资产：提供资产目录时本地引用、缺失时显式降级", () => {
  const withAssets = newRunRoot("run-map-assets");
  const assetsDirectory = path.join(withAssets, "assets");
  fs.mkdirSync(path.join(assetsDirectory, "images"), { recursive: true });
  fs.writeFileSync(path.join(assetsDirectory, "leaflet.js"), "//leaflet");
  fs.writeFileSync(path.join(assetsDirectory, "leaflet.css"), "/*leaflet*/");
  const withAssetsResult = runFixture(baseRequest(withAssets, [saleOutcome(401)], { mapAssetsDir: assetsDirectory })).facts.result;
  assert.equal(withAssetsResult.ok, true);
  assert.equal(withAssetsResult.mapGeneration, "local-assets");
  const mapHtml = fs.readFileSync(withAssetsResult.mapPath, "utf8");
  assert.match(mapHtml, /map-assets\/leaflet\.js/);
  assert.doesNotMatch(mapHtml, /unpkg\.com/);

  const withoutAssets = newRunRoot("run-map-degraded");
  const degraded = runFixture(baseRequest(withoutAssets, [saleOutcome(402)], { mapAssetsDir: "" })).facts.result;
  assert.equal(degraded.ok, true);
  assert.equal(degraded.mapPath, "");
  assert.equal(degraded.mapGeneration, "degraded-missing-local-map-assets");
  for (const value of [degraded.csvPath, degraded.jsonPath, degraded.excelPath, degraded.resultHtmlPath]) {
    assert.ok(value, "degraded map must not remove other outputs");
  }
  const resultHtml = fs.readFileSync(degraded.resultHtmlPath, "utf8");
  assert.match(resultHtml, /地图降级：本地 Leaflet 资产缺失/);
});


test("Native Helper 规范化：候选状态白名单、非法网址剔除与本地地图资产目录", () => {
  const helper = require(HELPER_PATH);
  const outputDirectory = path.join(os.tmpdir(), "anjuke-helper-normalize");
  const normalized = helper.normalizeRequest({
    listUrls: ["https://hz.sydc.anjuke.com/xzl-shou/jingan/"],
    outputDirectory,
    maxCases: 5,
    runStatus: "bogus",
    restoreStatus: "restored",
    candidateOutcomes: [
      { url: "https://hz.sydc.anjuke.com/xzl-shou/jingan/1/", captureStatus: "ok", html: "<html>x</html>" },
      { url: "https://evil.example.com/page", captureStatus: "ok" },
      { url: "https://hz.sydc.anjuke.com/xzl-shou/jingan/2/", captureStatus: "weird" },
    ],
  });
  assert.equal(normalized.candidateOutcomes.length, 2);
  assert.equal(normalized.candidateOutcomes[0].captureStatus, "ok");
  assert.equal(normalized.candidateOutcomes[1].captureStatus, "read_failed");
  assert.equal(normalized.runStatus, "partial");
  assert.equal(normalized.restoreStatus, "restored");
  const mapAssets = helper.mapAssetsDir();
  if (fs.existsSync(path.join(repoRoot, "native-helper/map-assets/leaflet.js"))) {
    assert.ok(mapAssets, "mapAssetsDir should resolve when map-assets exist");
  }
  assert.throws(() => helper.normalizeRequest({ listUrls: ["https://evil.example.com/"], outputDirectory }));
});


test("大载荷回归：多候选整页 HTML 经临时文件传给 Python，不再受 execve 参数上限限制", () => {
  const nativeHost = path.join(repoRoot, "native-helper/native_host.js");
  const bigHtml = `<html>${"x".repeat(150 * 1024)}</html>`;
  const candidateOutcomes = Array.from({ length: 8 }, (_, index) => ({
    url: `https://hz.sydc.anjuke.com/xzl-shou/xihuqu/756249792${index}`,
    title: `大厦${index}`,
    location: "西湖区",
    text: "总价：150万 建筑面积：100㎡ 户型：开间 楼层：高区 朝向：南 装修：精装修",
    html: bigHtml,
    captureStatus: "ok",
    errorCode: "",
  }));
  const request = {
    listUrls: ["https://hz.sydc.anjuke.com/xzl-shou/gongshu/"],
    detailUrls: [],
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-e2big-")),
    maxCases: 10,
    caseType: "sale",
    waitVerification: false,
    runStatus: "complete",
    restoreStatus: "restored",
    candidateOutcomes,
  };
  const message = Buffer.from(JSON.stringify({ action: "run_anjuke_property", request }), "utf8");
  const frame = Buffer.alloc(4 + message.length);
  frame.writeUInt32LE(message.length, 0);
  message.copy(frame, 4);
  const result = spawnSync(process.execPath, [nativeHost], {
    cwd: repoRoot,
    input: frame,
    env: { ...process.env, TIANYUAN_PRINT_SKILLS_DIR: path.join(repoRoot, "skills"), TIANYUAN_PYTHON_BIN: process.env.TIANYUAN_PYTHON_BIN || "python3" },
    timeout: 120000,
  });
  assert.equal(result.status, 0, result.stderr.toString().slice(0, 400));
  // 进度事件与最终结果都是独立帧，取 event === "complete" 的那一帧。
  let offset = 0;
  let payload = null;
  while (result.stdout.length >= offset + 4) {
    const frameLength = result.stdout.readUInt32LE(offset);
    if (result.stdout.length < offset + 4 + frameLength) break;
    const candidate = JSON.parse(result.stdout.subarray(offset + 4, offset + 4 + frameLength).toString("utf8"));
    if (candidate.event === "complete" || candidate.phase === "failed") payload = candidate;
    offset += 4 + frameLength;
  }
  assert.ok(payload, "run must produce a final frame");
  assert.equal(payload.ok, true, `expected ok: ${payload.reason}`);
  assert.equal(payload.status, "complete");
  assert.equal(payload.caseCount, 8);
  assert.ok(payload.evidencePath, "evidence index must be written");
  assert.ok(payload.excelPath, "excel must be written");
});
