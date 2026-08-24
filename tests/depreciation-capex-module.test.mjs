import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADDED_HEADERS,
  STOCK_HEADERS,
  parsePastedTable,
  rowsAsRecords,
} from "../extension/src/modules/depreciation-capex-forecast/page-common.js";
import { depreciationCapexModule } from "../extension/src/modules/depreciation-capex-forecast/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(repoRoot, "extension", "src", "modules", "depreciation-capex-forecast");

assert.equal(depreciationCapexModule.manifest.id, "depreciation-capex-forecast");
assert.equal(depreciationCapexModule.manifest.messageNamespace, "depreciation-capex-forecast");
assert.equal(depreciationCapexModule.manifest.route, "depreciation-capex-forecast");
assert.equal(depreciationCapexModule.manifest.stage, "stable");
assert.equal(depreciationCapexModule.manifest.entryElementId, "openDepreciationCapex");
assert.equal(STOCK_HEADERS.length, 19);
assert.equal(ADDED_HEADERS.length, 15);
assert.equal(new Set(STOCK_HEADERS).size, STOCK_HEADERS.length);
assert.equal(new Set(ADDED_HEADERS).size, ADDED_HEADERS.length);

const stockText = [
  STOCK_HEADERS.concat(["项目编号"]).join("\t"),
  ["1", "正常", "甲公司", "机器设备", "设备 A", "100", "80", "90", "2020-01-01", "10", "12", "5", "10", "12", "0.05", "制造费用", "是", "0.13", "否", "P-01"].join("\t"),
].join("\n");
const stock = parsePastedTable(stockText, STOCK_HEADERS);
assert.deepEqual(stock.errors, []);
assert.equal(stock.rows.length, 1);
assert.equal(stock.headers.at(-1), "项目编号");
assert.equal(rowsAsRecords(stock.headers, stock.rows)[0]["项目编号"], "P-01");

const duplicate = parsePastedTable(
  [STOCK_HEADERS.slice(0, 18).concat(["名称"]).join("\t"), "1"].join("\n"),
  STOCK_HEADERS,
);
assert.ok(duplicate.errors.some((message) => message.includes("表头“名称”重复")));
assert.ok(duplicate.errors.some((message) => message.includes("是否需要更新")));

const missing = parsePastedTable("序号\t名称\n1\t设备", STOCK_HEADERS);
assert.ok(missing.errors.length >= 17);

const empty = parsePastedTable("", ADDED_HEADERS);
assert.deepEqual(empty.rows, []);
assert.equal(empty.errors.length, 1);

for (const relativePath of [
  "module.js", "template.js", "styles.css", "page-common.js", "page.css",
  "input.html", "input.js", "results.html", "results.js", "details.html", "details.js",
  "assets/折旧摊销预测输入模板.xlsx",
]) {
  assert.equal(fs.existsSync(path.join(moduleRoot, relativePath)), true, `missing module resource: ${relativePath}`);
}

const inputPage = fs.readFileSync(path.join(moduleRoot, "input.html"), "utf8");
const resultsPage = fs.readFileSync(path.join(moduleRoot, "results.html"), "utf8");
const detailsPage = fs.readFileSync(path.join(moduleRoot, "details.html"), "utf8");
assert.match(inputPage, /从剪贴板读取/);
assert.match(inputPage, /选择 \.xlsx 导入/);
assert.match(inputPage, /保存到当前工作簿/);
assert.match(resultsPage, /检查结果/);
assert.match(resultsPage, /预测汇总/);
assert.match(resultsPage, /费用科目汇总/);
assert.match(resultsPage, /导出底稿/);
assert.match(detailsPage, /资产结果明细（年度）/);
assert.match(detailsPage, /资产结果明细（月度）/);
assert.match(detailsPage, /单资产详细过程/);
assert.match(fs.readFileSync(path.join(moduleRoot, "details.js"), "utf8"), /columnCount/);
assert.match(fs.readFileSync(path.join(moduleRoot, "details.js"), "utf8"), /pageSize/);

console.log("Depreciation capex module tests passed.");
