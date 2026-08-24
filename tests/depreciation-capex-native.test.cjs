"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  REQUIRED_FILES,
  createDepreciationCapexForecastService,
} = require("../native-helper/depreciation-capex-forecast.js");

const repoRoot = path.resolve(__dirname, "..");
const skillRoot = path.join(repoRoot, "skills", "depreciation-capex-forecast");

function digest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("depreciation native helper runs the bundled workbook engine end to end", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-depreciation-native-"));
  const runtimeDirectory = path.join(root, "native-helper");
  const exportDirectory = path.join(root, "exports");
  fs.mkdirSync(exportDirectory, { recursive: true });
  const picker = {
    async chooseDirectory() {
      return { ok: true, paths: [exportDirectory] };
    },
  };
  const service = createDepreciationCapexForecastService({
    runtimeDirectory,
    skillRoot,
    pythonBin: process.env.TIANYUAN_TEST_PYTHON_BIN || "python3",
    platformAdapter: picker,
  });

  assert.equal(service.selfTest().ok, true);
  assert.deepEqual(
    REQUIRED_FILES.filter((relativePath) => !fs.existsSync(path.join(skillRoot, relativePath))),
    [],
  );
  const nativeHostSource = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
  for (const action of [
    "depreciation_capex_forecast_prepare",
    "depreciation_capex_forecast_status",
    "depreciation_capex_forecast_write_params",
    "depreciation_capex_forecast_write_stock",
    "depreciation_capex_forecast_write_added",
    "depreciation_capex_forecast_preflight",
    "depreciation_capex_forecast_run_with_details",
    "depreciation_capex_forecast_read_monthly",
    "depreciation_capex_forecast_export_readback",
  ]) {
    assert.equal(nativeHostSource.includes(action), true, `missing native action route: ${action}`);
  }

  const prepared = await service.handle({ operation: "prepare" });
  assert.equal(prepared.ok, true);
  assert.match(prepared.workbookPath, /projects[\\/]天源评估系统[\\/]workbooks[\\/]折旧摊销预测输入模板\.xlsx$/);
  assert.equal(prepared.workbookPath.startsWith(path.join(root, "projects")), true);
  assert.equal(fs.existsSync(prepared.workbookPath), true);

  const statusBefore = await service.handle({ operation: "status" });
  assert.equal(statusBefore.ok, true);
  assert.deepEqual(statusBefore.parameters.valuationDate, "2024-05-31");
  assert.equal(statusBefore.parameters.endDate, "2029-12-31");
  assert.equal(statusBefore.counts.stock, 0);
  assert.equal(statusBefore.counts.added, 0);

  const params = await service.handle({
    operation: "write_params",
    values: {
      评估基准日: "2024-05-31",
      结束日期: "2029-12-31",
      折现率: 0.1,
      最低尚可使用年限: 1,
    },
  });
  assert.equal(params.ok, true);
  const stock = await service.handle({
    operation: "write_stock",
    values: [{
      序号: "S-1",
      情形描述: "测试情形",
      公司主体: "中显",
      资产科目: "机器设备",
      名称: "存量设备",
      账面原值: 100,
      账面净值: 80,
      评估原值: 100,
      启用时间: "2022-05-31",
      折旧年限: 4,
      经济耐用年限: 10,
      预计尚可使用年限: 8,
      更新后折旧年限: 4,
      更新后经济耐用年限: 10,
      残值率: 0,
      费用科目: "主营业务成本",
      折旧摊销: "折旧",
      进项税率: 0.13,
      是否需要更新: "是",
    }],
  });
  assert.equal(stock.ok, true);
  const added = await service.handle({
    operation: "write_added",
    values: [{
      序号: "A-1",
      情形描述: "测试情形",
      公司主体: "中显",
      资产科目: "在建工程",
      名称: "新增设备",
      在建工程账面价值: 0,
      "总投资额（不含税）": 120,
      预计投入使用时间: "2025-01-31",
      更新后折旧年限: 10,
      更新后经济耐用年限: 10,
      残值率: 0,
      费用科目: "管理费用",
      折旧摊销: "折旧",
      进项税率: 0.13,
      是否需要更新: "是",
    }],
  });
  assert.equal(added.ok, true);

  const statusAfterInput = await service.handle({ operation: "status" });
  assert.equal(statusAfterInput.parameters.valuationDate, "2024-05-31");
  assert.equal(statusAfterInput.counts.stock, 1);
  assert.equal(statusAfterInput.counts.added, 1);

  const preflight = await service.handle({ operation: "preflight" });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.compatible, true);
  assert.equal(preflight.errors.length, 0);

  const run = await service.handle({ operation: "run_with_details" });
  assert.equal(run.ok, true);
  assert.equal(run.include_details, true);

  const result = await service.handle({ operation: "result" });
  assert.equal(result.ok, true);
  assert.equal(result.inputValid, true);
  assert.ok(result.tables["预测汇总"]);
  assert.ok(result.tables["费用科目汇总"]);
  assert.ok(result.tables["检查结果"]);
  assert.ok(result.summary.expense_summary.rows.length >= 1);

  const annual = await service.handle({ operation: "read_annual", page: 1, pageSize: 4 });
  assert.equal(annual.ok, true);
  assert.ok(annual.rows.length > 0);
  assert.ok(annual.total_rows > 0);

  const monthly = await service.handle({
    operation: "read_monthly",
    page: 1,
    pageSize: 2,
    columnStart: 10,
    columnCount: 12,
  });
  assert.equal(monthly.ok, true);
  assert.equal(monthly.headers.length, 12);
  assert.equal(monthly.requested_column_start, 10);
  assert.equal(monthly.requested_column_count, 12);

  const detail = await service.handle({
    operation: "read_detail_process",
    assetId: "S-1",
    assetKind: "存量",
    page: 1,
    pageSize: 3,
    columnStart: 1,
    columnCount: 20,
  });
  assert.equal(detail.ok, true);
  assert.ok(detail.headers.includes("日期列表"));
  assert.ok(detail.rows.length > 0);

  const sourceDigest = digest(prepared.workbookPath);
  const selected = await service.handle({ operation: "select_output_directory" });
  assert.equal(selected.ok, true);
  assert.equal(selected.path, exportDirectory);
  const exported = await service.handle({ operation: "export_readback", outputDirectory: selected.path });
  assert.equal(exported.ok, true);
  assert.equal(exported.sourceOverwritten, false);
  assert.equal(exported.outputExists, true);
  assert.equal(exported.readbackOk, true);
  assert.ok(exported.outputSize > 0);
  assert.equal(digest(prepared.workbookPath), sourceDigest);
  assert.equal(fs.existsSync(exported.output_path), true);
});
