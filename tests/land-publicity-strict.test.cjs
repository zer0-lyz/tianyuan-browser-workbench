"use strict";

// 浙江土地模块严格响应校验与失败传播回归测试。
// 覆盖：HTTP 200 + text/html 不得当成功（行政区与列表）、JSON schema 不匹配、
// 业务 code 失败、请求异常不得转为 []、合法窄条件零结果、
// 全省+不限日期零条高风险门禁、失败运行不生成/不覆盖正式成果。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const landHttp = require(path.join(repoRoot, "native-helper/land-publicity-http.js"));

function respond({ stage, url = "https://www.zjzrzyjy.com/x?currentPage=1&pageSize=2", status = 200, contentType = "application/json", body = "{}" }) {
  return landHttp.validateLandPublicityResponse({ stage, url, status, contentType, body, allowMissingBusinessCode: stage === "REGION" });
}

test("region endpoint rejects HTTP 200 with text/html (anti-bot shell)", () => {
  assert.throws(
    () => respond({ stage: "REGION", contentType: "text/html; charset=utf-8", body: "<!DOCTYPE html><html><head></head></html>" }),
    (error) => error.errorCode === "LAND_REGION_RESPONSE_CONTENT_TYPE_INVALID"
      && error.diagnostics.bodyKind === "html",
  );
});

test("list endpoint rejects HTTP 200 with text/html instead of zero results", () => {
  assert.throws(
    () => respond({ stage: "LIST", contentType: "text/html", body: "<!DOCTYPE html><html></html>" }),
    (error) => error.errorCode === "LAND_LIST_RESPONSE_CONTENT_TYPE_INVALID",
  );
});

test("list endpoint rejects business failure codes", () => {
  assert.throws(
    () => respond({ stage: "LIST", body: JSON.stringify({ code: 40012, message: "抱歉，操作较为繁忙，请稍后重试" }) }),
    (error) => error.errorCode === "LAND_LIST_BUSINESS_CODE_40012",
  );
});

test("list endpoint rejects top-level schema mismatches", () => {
  // 深层 records/total schema 由 python 侧 validate_list_payload 强制（见 runnerGates/list 用例）；
  // JS 侧负责 HTTP/CT/JSON/顶层对象/业务 code 门禁。
  const cases = [
    { body: "[]", stage: "LIST" },
    { body: JSON.stringify({ code: 0, data: { records: [], total: 1 }, ok: false }), stage: "LIST" },
  ];
  for (const item of cases) {
    assert.throws(() => respond(item), (error) => /SCHEMA_INVALID|BUSINESS_OK_FALSE/.test(error.errorCode));
  }
});

test("list endpoint accepts a valid payload with pagination metadata", () => {
  const { payload, diagnostics } = respond({
    stage: "LIST",
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ code: 0, message: "成功", data: { records: [{ landCode: "x" }], total: 44939 } }),
  });
  assert.equal(payload.data.total, 44939);
  assert.equal(diagnostics.businessCode, 0);
  assert.equal(diagnostics.bodyKind, "json");
});

test("region endpoint rejects non-array or malformed catalogs", () => {
  assert.throws(
    () => landHttp.validateLandRegionCatalog({ code: 0, data: { districtCode: "330000" } }),
    (error) => error.errorCode === "LAND_REGION_RESPONSE_SCHEMA_INVALID",
  );
  assert.throws(
    () => landHttp.validateLandRegionCatalog({ code: 0, data: [{ districtCode: "", districtName: "x" }] }),
    (error) => error.errorCode === "LAND_REGION_RESPONSE_SCHEMA_INVALID",
  );
  const tree = landHttp.validateLandRegionCatalog({
    code: 0,
    data: [{ districtCode: "330000", districtName: "浙江省", children: [{ districtCode: "330100", districtName: "杭州市", children: [] }] }],
  });
  assert.equal(tree[0].children[0].districtName, "杭州市");
});

test("transport failures surface as structured source-unavailable errors", async () => {
  await assert.rejects(
    () => landHttp.fetchLandPublicityJson("https://127.0.0.1:9/trade/view/landbidding/querylandbidding", { stage: "LIST", timeoutMs: 1500 }),
    (error) => error.errorCode === "LAND_LIST_SOURCE_UNAVAILABLE" && error.diagnostics.host.startsWith("127.0.0.1"),
  );
});

test("diagnostics redact non-whitelisted query values", () => {
  const { url } = landHttp.sanitizeUrl("https://www.zjzrzyjy.com/a?currentPage=1&pageSize=2&secret=abc");
  assert.ok(url.includes("currentPage=1"));
  assert.ok(url.includes("secret=REDACTED"));
  assert.ok(!url.includes("abc"));
});

const PYTHON_CASES = {
  // 行政区：HTML 壳必须结构化失败
  regionHtml: `
import json, sys
sys.path.insert(0, r"%(skills)s")
import requests, land_http
class FakeResp:
    def __init__(self, status, headers, text):
        self.status_code, self.headers, self.text = status, headers, text
    def raise_for_status(self):
        if self.status_code >= 300:
            raise requests.exceptions.HTTPError(f"HTTP {self.status_code}")
    def json(self):
        return json.loads(self.text)
requests.get = lambda url, headers=None, timeout=None: FakeResp(
    200, {"Content-Type": "text/html; charset=utf-8"}, "<!DOCTYPE html><html></html>")
try:
    land_http.fetch_json("https://www.zjzrzyjy.com/trade/uniportal/index/districtList", "REGION", timeout=5, allow_missing_business_code=True)
    sys.exit("HTML 壳未被拒绝")
except land_http.LandSourceError as error:
    assert error.errorCode == "LAND_REGION_RESPONSE_CONTENT_TYPE_INVALID", error.errorCode
print("ok")
`,
  // 列表：业务失败 code 必须失败
  listBusinessCode: `
import json, sys
sys.path.insert(0, r"%(skills)s")
import requests, land_http
class FakeResp:
    status_code = 200
    headers = {"Content-Type": "application/json"}
    text = json.dumps({"code": 40012, "message": "抱歉，操作较为繁忙，请稍后重试"})
    def raise_for_status(self): pass
requests.get = lambda url, headers=None, timeout=None: FakeResp()
try:
    land_http.fetch_json("https://www.zjzrzyjy.com/x?currentPage=1", "LIST", timeout=5)
    sys.exit("业务失败码未被拒绝")
except land_http.LandSourceError as error:
    assert error.errorCode == "LAND_LIST_BUSINESS_CODE_40012", error.errorCode
print("ok")
`,
  // 列表：请求异常不得转为 []
  listNetworkError: `
import sys
sys.path.insert(0, r"%(skills)s")
import requests, land_http
def boom(url, headers=None, timeout=None):
    raise requests.exceptions.ConnectionError("conn refused")
requests.get = boom
try:
    land_http.fetch_json("https://www.zjzrzyjy.com/x", "LIST", timeout=5)
    sys.exit("网络异常未被拒绝")
except land_http.LandSourceError as error:
    assert error.errorCode == "LAND_LIST_SOURCE_UNAVAILABLE", error.errorCode
print("ok")
`,
  // 列表：合法空列表返回 []（窄条件零结果），有数据返回归一化条数
  listValidEmptyAndData: `
import json, sys
sys.path.insert(0, r"%(skills)s")
import requests
import scrape_zj_land as s
class FakeResp:
    def __init__(self, payload):
        self.status_code = 200
        self.headers = {"Content-Type": "application/json"}
        self.text = json.dumps(payload, ensure_ascii=False)
    def raise_for_status(self): pass
def fake_get(url, headers=None, timeout=None):
    return FakeResp({"code": 0, "message": "成功", "data": {"records": [], "total": 0}})
requests.get = fake_get
empty = s.fetch_land_bidding_records(max_pages=1)
assert empty == [], empty
records = [
    {"landCode": "a", "districtCode": "330100", "districtName": "杭州市", "releaseTime": "2026-09-01 10:00:00", "resourceName": "地块A", "resourceCategory": "TD", "dealPrice": 100},
    {"landCode": "b", "districtCode": "330781", "districtName": "兰溪市", "releaseTime": "2026-09-02 10:00:00", "resourceName": "地块B", "resourceCategory": "TD", "dealPrice": 200},
]
requests.get = lambda url, headers=None, timeout=None: FakeResp({"code": 0, "data": {"records": records, "total": 2}})
got = s.fetch_land_bidding_records(max_pages=1)
assert len(got) == 2, got
narrow = s.fetch_land_bidding_records(district_filter={"name": "兰溪", "exact": False}, max_pages=1)
assert len(narrow) == 1 and narrow[0]["districtName"] == "兰溪市", narrow
print("ok")
`,
  // 列表：HTML 壳必须抛出而非返回 []
  listHtmlShellRaises: `
import json, sys
sys.path.insert(0, r"%(skills)s")
import requests
import scrape_zj_land as s
import land_http
class FakeResp:
    status_code = 200
    headers = {"Content-Type": "text/html"}
    text = "<!DOCTYPE html><html></html>"
    def raise_for_status(self): pass
requests.get = lambda url, headers=None, timeout=None: FakeResp()
try:
    s.fetch_land_bidding_records(max_pages=1)
    sys.exit("HTML 壳被伪装成零结果")
except land_http.LandSourceError as error:
    assert error.errorCode == "LAND_LIST_RESPONSE_CONTENT_TYPE_INVALID", error.errorCode
print("ok")
`,
  // runner：全省+不限日期零条高风险门禁；失败运行不生成/不覆盖正式成果
  runnerGates: `
import hashlib, json, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, r"%(skills)s")
import scrape_zj_land as s
import land_http
import land_publicity_runner as runner

tmp = Path(tempfile.mkdtemp(prefix="ty-land-gate-"))
try:
    # 已有上一轮有效成果
    existing = tmp / "land_publicity_latest.xlsx"
    existing.write_bytes(b"PREVIOUS-VALID-RESULT")
    before = hashlib.sha256(existing.read_bytes()).hexdigest()

    request = {
        "tradeForm": "国有土地",
        "tradeMethods": ["挂牌出让", "拍卖出让"],
        "tradeStages": ["结果公示"],
        "district": "", "county": "", "location": "",
        "provinceWide": True,
        "landUses": [], "startDate": "", "endDate": "",
        "generateMap": False,
        "maxPages": "1",
        "outputDirectory": str(tmp),
    }
    try:
        runner.execute_request(request, fetcher=lambda **kwargs: [])
        sys.exit("全省+不限日期零条未触发高风险门禁")
    except ValueError as error:
        payload = json.loads(str(error))
        assert payload["errorCode"] == "LAND_LIST_PROVINCEWIDE_EMPTY_SUSPICIOUS", payload
    except land_http.LandSourceError:
        raise

    # 数据源失败：结构化上抛
    def failing(**kwargs):
        raise land_http.LandSourceError(
            "LAND_LIST_RESPONSE_CONTENT_TYPE_INVALID",
            "LAND_LIST_RESPONSE_CONTENT_TYPE_INVALID",
            {"stage": "LIST", "bodyKind": "html"})
    try:
        runner.execute_request(request, fetcher=failing)
        sys.exit("数据源失败未结构化上抛")
    except ValueError as error:
        payload = json.loads(str(error))
        assert payload["errorCode"] == "LAND_LIST_RESPONSE_CONTENT_TYPE_INVALID", payload

    # 失败运行不得生成或覆盖正式成果
    assert existing.exists(), "已有成果被删除"
    after = hashlib.sha256(existing.read_bytes()).hexdigest()
    assert before == after, "已有成果哈希改变"
    leftovers = [p.name for p in tmp.iterdir() if p.name not in {"land_publicity_latest.xlsx"}]
    assert not leftovers, f"失败运行留下正式产物: {leftovers}"
    print("ok")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
`,
};

function runPythonCase(name) {
  const skills = path.join(repoRoot, "skills/zj-land-publicity");
  const body = PYTHON_CASES[name].replaceAll("%(skills)s", skills);
  const result = spawnSync("python3", ["-c", body], { encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    throw new Error(`python case ${name} failed:\n${result.stdout}\n${result.stderr}`);
  }
  assert.match(result.stdout, /ok/);
}

test("python region fetch rejects HTML shell with structured error", () => runPythonCase("regionHtml"));
test("python list fetch rejects business failure codes", () => runPythonCase("listBusinessCode"));
test("python list fetch never converts network errors to empty results", () => runPythonCase("listNetworkError"));
test("python list fetch distinguishes valid empty from data", () => runPythonCase("listValidEmptyAndData"));
test("python list fetch raises on HTML shell instead of zero results", () => runPythonCase("listHtmlShellRaises"));
test("runner gates province-wide empty results and preserves prior outputs", () => runPythonCase("runnerGates"));
