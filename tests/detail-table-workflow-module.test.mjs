import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONFIG,
  detailTableWorkflowModule,
  modeLabel,
  normalizeConfig,
} from "../extension/src/modules/detail-table-workflow/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(repoRoot, "extension", "src", "modules", "detail-table-workflow");
const template = fs.readFileSync(path.join(moduleRoot, "template.js"), "utf8");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const html = fs.readFileSync(path.join(repoRoot, "extension", "src", "sidepanel", "index.html"), "utf8");
const legacy = fs.readFileSync(path.join(repoRoot, "extension", "src", "app", "legacy-feature-modules.js"), "utf8");

assert.equal(detailTableWorkflowModule.manifest.id, "detail-table-workflow");
assert.equal(detailTableWorkflowModule.manifest.route, "export-detail");
assert.equal(detailTableWorkflowModule.manifest.entryElementId, "openExportDetail");
assert.equal(detailTableWorkflowModule.manifest.usesLegacyScope, true);
assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
assert.deepEqual(normalizeConfig({
  mode: "manual_files",
  restoreFormulas: false,
  applyFormat: true,
  exportDirectory: " /tmp/export ",
  outputMode: "new_directory",
  outputDirectory: " /tmp/output ",
}), {
  mode: "manual_files",
  restoreFormulas: false,
  applyFormat: true,
  exportDirectory: "/tmp/export",
  outputMode: "new_directory",
  outputDirectory: "/tmp/output",
});
assert.equal(modeLabel("after_export"), "导出后自动整理");
assert.equal(modeLabel("manual_files"), "选择文件/文件夹手动整理");
for (const id of [
  "detailTableWorkflowModeAfterExport",
  "detailTableWorkflowModeManual",
  "detailTableWorkflowRestoreFormulas",
  "detailTableWorkflowApplyFormat",
  "chooseDetailTableWorkflowFiles",
  "chooseDetailTableWorkflowFolder",
  "runExportDetail",
  "saveDetailTableWorkflow",
]) assert.match(template, new RegExp(`id="${id}"`));
assert.match(html, /id="openExportDetail"/);
assert.match(html, /明细表导出与整理/);
assert.doesNotMatch(legacy, /id: "export-detail"/);
assert.match(nativeHost, /message\?\.action === "run_detail_table_workflow"/);
assert.match(nativeHost, /async function runDetailTableWorkflow\(message, emit\)/);
assert.match(nativeHost, /preferCli: message\?\.preferCli !== false/);
assert.match(nativeHost, /const preferCli = message\?\.preferCli === true/);
assert.match(nativeHost, /cliExportFailure\(logLines, \{ cliMode: true \}\)/);
assert.match(nativeHost, /async function processDetailWorkflowFile/);
assert.match(nativeHost, /DETAIL_WORKFLOW_PARTIAL_FAILURE/);
assert.match(nativeHost, /const originalConsole = \{/);
assert.match(nativeHost, /console\.log = \(\.\.\.args\) => captureEngineLog\("stdout", args\)/);
assert.match(nativeHost, /console\.error = \(\.\.\.args\) => captureEngineLog\("stderr", args\)/);
assert.match(nativeHost, /console\.log = originalConsole\.log/);
assert.match(nativeHost, /message: `导出引擎：\$\{text\}`/);
assert.match(fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8"), /checkConnections\(\{ probe: true \}\)/);
assert.match(fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8"), /const mcpReady = health\?\.mcp\?\.connected === true/);
assert.match(fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8"), /preferCli: !mcpReady/);
assert.match(nativeHost, /tianyuan-workflow-/);
assert.match(nativeHost, /replaceProcessedFile\(stagePath, finalPath\)/);
assert.match(nativeHost, /for \(const candidate of \[stagePath, reportTempPath\]/);
const processSource = nativeHost.slice(nativeHost.indexOf("async function processDetailWorkflowFile"));
const restoreIndex = processSource.indexOf("if (restoreFormulas)");
const formatIndex = processSource.indexOf("if (applyFormat)");
const commitIndex = processSource.indexOf("replaceProcessedFile(stagePath, finalPath)");
assert.ok(restoreIndex >= 0 && formatIndex > restoreIndex && commitIndex > formatIndex);
assert.match(installer, /src\/modules\/detail-table-workflow\/module\.js/);
assert.match(installer, /src\/modules\/detail-table-workflow\/template\.js/);
assert.match(installer, /src\/modules\/detail-table-workflow\/styles\.css/);
console.log("Detail table workflow module tests passed.");
