"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("安居客模块已接入侧栏、Native Helper 和本机安装同步", () => {
  for (const relative of [
    "extension/src/modules/anjuke-property/module.js",
    "extension/src/modules/anjuke-property/template.js",
    "extension/src/modules/anjuke-property/styles.css",
    "native-helper/anjuke-property.js",
    "skills/anjuke-property-case-fetcher/SKILL.md",
    "skills/anjuke-property-case-fetcher/agents/openai.yaml",
    "skills/anjuke-property-case-fetcher/scripts/fetch_anjuke_property_cases.py",
  ]) assert.ok(fs.existsSync(path.join(repoRoot, relative)), `missing ${relative}`);
  const moduleSource = fs.readFileSync(path.join(repoRoot, "extension/src/modules/anjuke-property/module.js"), "utf8");
  const template = fs.readFileSync(path.join(repoRoot, "extension/src/modules/anjuke-property/template.js"), "utf8");
  const helper = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
  const anjukeHelper = fs.readFileSync(path.join(repoRoot, "native-helper/anjuke-property.js"), "utf8");
  const sidepanel = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
  const html = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/index.html"), "utf8");
  const installer = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
  const skill = fs.readFileSync(path.join(repoRoot, "skills/anjuke-property-case-fetcher/SKILL.md"), "utf8");
  assert.match(moduleSource, /id: "anjuke-property"/);
  assert.match(moduleSource, /run_anjuke_property/);
  assert.match(template, /导入当前网址/);
  assert.match(template, /开始抓取/);
  for (const id of ["openAnjukeProperty", "page-anjuke-property", "anjukePropertyCurrentUrl", "importAnjukePropertyCurrentUrl", "anjukePropertyOutputDirectory", "runAnjukeProperty"]) {
    assert.match(`${html}\n${template}`, new RegExp(`id=\\"${id}\\"`), `missing ${id}`);
  }
  assert.doesNotMatch(template, /anjukePropertyDetailUrls|saveAnjukePropertyParams|openAnjukePropertySource/);
  assert.match(moduleSource, /tabs\.query\(\{ active: true, lastFocusedWindow: true \}\)/);
  assert.match(moduleSource, /scripting\.executeScript/);
  assert.match(moduleSource, /verificationRequired/);
  assert.match(moduleSource, /sp-rent\|rent\|zu/);
  assert.match(moduleSource, /sp-shou\|sale\|shou/);
  assert.match(sidepanel, /import \{ anjukePropertyModule \}/);
  assert.match(sidepanel, /moduleRegistry\.register\(anjukePropertyModule\)/);
  assert.match(helper, /run_anjuke_property/);
  assert.match(helper, /select_anjuke_property_output_directory/);
  assert.match(helper, /ANJUKE_PROPERTY_SCRIPT/);
  assert.match(helper, /--open-only/);
  assert.match(anjukeHelper, /capturedPages/);
  assert.match(anjukeHelper, /safeCoordinate/);
  assert.match(moduleSource, /resultHtmlPath/);
  assert.match(moduleSource, /mapPath/);
  assert.match(moduleSource, /DETAIL_DELAY_MS/);
  assert.match(moduleSource, /xzl-shou\|xzl-zu/);
  assert.match(moduleSource, /isScopedListingUrl/);
  assert.match(moduleSource, /isAnjukeListingUrl/);
  assert.match(moduleSource, /window\.scrollTo/);
  assert.match(moduleSource, /shadowRoot/);
  assert.match(fs.readFileSync(path.join(repoRoot, "skills/anjuke-property-case-fetcher/scripts/fetch_anjuke_property_cases.py"), "utf8"), /page\.locator\("a\[href\]"\)/);
  assert.match(moduleSource, /cardTextOf/);
  assert.match(moduleSource, /skippedInvalidCount/);
  assert.match(skill, /当前标签页/);
  assert.match(installer, /anjuke-property\.js/);
  assert.match(installer, /anjuke-property-case-fetcher\/scripts\/fetch_anjuke_property_cases\.py/);
  assert.match(skill, /A-W/);
  assert.match(skill, /HYPERLINK/);
  assert.doesNotMatch(moduleSource, /arbitraryJavaScript|genericBrowserAutomation/);
});

test("Native Helper rejects unsafe Anjuke output requests without launching the script", () => {
  const nativeHost = path.join(repoRoot, "native-helper/native_host.js");
  const message = Buffer.from(JSON.stringify({
    action: "run_anjuke_property",
    request: { listUrl: "https://hz.sydc.anjuke.com/", outputDirectory: "relative-output" },
  }), "utf8");
  const frame = Buffer.alloc(4 + message.length);
  frame.writeUInt32LE(message.length, 0);
  message.copy(frame, 4);
  const result = spawnSync(process.execPath, [nativeHost], {
    cwd: repoRoot,
    input: frame,
    env: { ...process.env, TIANYUAN_PRINT_SKILLS_DIR: path.join(repoRoot, "skills"), TIANYUAN_PYTHON_BIN: process.env.TIANYUAN_PYTHON_BIN || "python3" },
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const length = result.stdout.readUInt32LE(0);
  const payload = JSON.parse(result.stdout.subarray(4, 4 + length).toString("utf8"));
  assert.equal(payload.action, "run_anjuke_property");
  assert.equal(payload.ok, false);
  assert.equal(payload.reason, "ANJUKE_OUTPUT_DIRECTORY_INVALID");
  assert.deepEqual(payload.security, { credentialsReturned: false });
});

test("Anjuke script writes the required A-W formulas and preserves null fields", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-output-"));
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = String.raw`
import json, sys
from pathlib import Path
sys.path.insert(0, "skills/anjuke-property-case-fetcher/scripts")
from fetch_anjuke_property_cases import CaseRow, write_excel, write_csv, write_json
out = Path(${JSON.stringify(output)})
row = CaseRow("数据库", 1, "中田大厦", 1220000, 100.0, 0.09, "中区/20F", "精装修", None, "2026-06", None, None, None, "办公", 2018, "https://hz.sydc.anjuke.com/x/123", "浙江省杭州市", None, None, None, None, "sale", "122万", "12200元/㎡", None, None, None, None, "测试案例", None, None, "ok")
write_excel([row], out)
write_csv([row], out)
write_json([row], out)
print(json.dumps({"ok": True}))
`;
  try {
    const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.statSync(path.join(output, "cases.xlsx")).size > 0);
    assert.ok(fs.statSync(path.join(output, "cases.csv")).size > 0);
    assert.ok(fs.statSync(path.join(output, "cases.json")).size > 0);
    const inspect = spawnSync(python, ["-c", `from openpyxl import load_workbook; w=load_workbook(r${JSON.stringify(path.join(output, "cases.xlsx"))}, data_only=False); s=w.active; print(s.max_column, s["H2"].value, s["L2"].number_format, s["R2"].value, s["K2"].value)`], { encoding: "utf8" });
    assert.equal(inspect.status, 0, inspect.stderr);
    const [columnCount, formula, dateFormat, hyperlink, nullLayout] = inspect.stdout.trim().split(" ");
    assert.equal(columnCount, "23");
    assert.match(formula, /^=ROUND\(E2\/F2\/\(1\+G2\),0\)$/);
    assert.equal(dateFormat, "@");
    assert.match(hyperlink, /HYPERLINK/);
    assert.equal(nullLayout, "None");
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("Anjuke current-tab snapshots are converted into verified output", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-current-tab-"));
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "sys.path.insert(0, " + JSON.stringify("skills/anjuke-property-case-fetcher/scripts") + ")",
    "from fetch_anjuke_property_cases import run_request",
    "out = Path(" + JSON.stringify(output) + ")",
    "result = run_request({'outputDirectory': str(out), 'caseType': 'sale', 'maxCases': 1, 'capturedPages': [{'url': 'https://hz.sydc.anjuke.com/x/123', 'title': '测试案例', 'location': '杭州市西湖区', 'text': '测试案例 总价：122万元 建筑面积：100㎡ 楼层：中区 交易时间：2026-06'}]})",
    "print(json.dumps({'ok': result['ok'], 'caseCount': result['caseCount'], 'html': Path(result['htmlDirectory']).exists(), 'result': Path(result['resultHtmlPath']).exists(), 'map': Path(result['mapPath']).exists()}))",
  ].join("\n");
  try {
    const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { ok: true, caseCount: 1, html: true, result: true, map: true });
    assert.ok(fs.existsSync(path.join(output, "cases.xlsx")));
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("Anjuke current-tab snapshots reject verification and generic pages", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "anjuke-invalid-pages-"));
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "sys.path.insert(0, " + JSON.stringify("skills/anjuke-property-case-fetcher/scripts") + ")",
    "from fetch_anjuke_property_cases import run_request",
    "out = Path(" + JSON.stringify(output) + ")",
    "result = run_request({'outputDirectory': str(out), 'caseType': 'sale', 'capturedPages': [",
    "{'url': 'https://www.anjuke.com/', 'title': '安居客-房产网', 'text': '安居客-房产网 二手房 安居客小程序'},",
    "{'url': 'https://hz.sydc.anjuke.com/x/124', 'title': '安全验证', 'text': '安全验证 请输入验证码'},",
    "{'url': 'https://hz.sydc.anjuke.com/x/125', 'title': '有效案例', 'location': '杭州市西湖区', 'longitude': 120.12, 'latitude': 30.27, 'text': '有效案例 总价：122万元 建筑面积：100㎡ 楼层：中区 户型：三室'}]})",
    "print(json.dumps({'ok': result['ok'], 'caseCount': result['caseCount'], 'skipped': result['skippedInvalidCount'], 'rows': [row['title'] for row in result['results']]}))",
  ].join("\n");
  try {
    const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { ok: true, caseCount: 1, skipped: 2, rows: ["有效案例"] });
    const cases = JSON.parse(fs.readFileSync(path.join(output, "cases.json"), "utf8"));
    assert.equal(cases.length, 1);
    assert.equal(cases[0].source_url, "https://hz.sydc.anjuke.com/x/125");
    assert.match(fs.readFileSync(path.join(output, "map.html"), "utf8"), /30\.27/);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("Anjuke recognizes commercial detail routes but not the commercial listing route", () => {
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const script = [
    "import sys",
    "sys.path.insert(0, " + JSON.stringify("skills/anjuke-property-case-fetcher/scripts") + ")",
    "from fetch_anjuke_property_cases import canonical_detail_url, is_anjuke_detail_url, is_listing_url, is_scoped_listing_url, is_recommendation_url",
    "assert is_listing_url('https://hz.sydc.anjuke.com/xzl-shou/?from=navigation')",
    "assert is_listing_url('https://hz.sydc.anjuke.com/ditu?catename=zhaozu&zstype=2') is False",
    "assert is_scoped_listing_url('https://hz.sydc.anjuke.com/xzl-shou/xiaoshan/')",
    "assert is_scoped_listing_url('https://hz.sydc.anjuke.com/sp-shou/xihuqu-hzhuanglong/')",
    "assert not is_scoped_listing_url('https://hz.sydc.anjuke.com/xzl-shou/?from=navigation')",
    "assert not is_scoped_listing_url('https://hz.sydc.anjuke.com/ditu?catename=zhaozu&zstype=2')",
    "assert not is_recommendation_url('https://hz.sydc.anjuke.com/xzl-shou/123456/?legoAdClickUrl=redirect')",
    "assert canonical_detail_url('https://hz.sydc.anjuke.com/xzl-shou/123456/?legoAdClickUrl=redirect').endswith('/xzl-shou/123456/')",
    "from fetch_anjuke_property_cases import is_recommendation_url",
    "assert is_anjuke_detail_url('https://hz.sydc.anjuke.com/xzl-shou/xiaoshan/123456')",
    "assert not is_anjuke_detail_url('https://hz.sydc.anjuke.com/xzl-shou/xiaoshan/')",
    "assert is_recommendation_url('https://hz.sydc.anjuke.com/xzl-shou/7433530925/?from=xzlshou_guessrecommend&legoAdClickUrl=redirect')",
    "print('ok')",
  ].join("\n");
  const result = spawnSync(python, ["-c", script], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "ok");
});
