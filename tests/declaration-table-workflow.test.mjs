import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONFIG,
  declarationTableWorkflowModule,
  modeLabel,
  normalizeConfig,
} from "../extension/src/modules/declaration-table-workflow/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(repoRoot, "extension", "src", "modules", "declaration-table-workflow");
const template = fs.readFileSync(path.join(moduleRoot, "template.js"), "utf8");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const sidepanel = fs.readFileSync(path.join(repoRoot, "extension", "src", "sidepanel", "sidepanel.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8");

assert.equal(declarationTableWorkflowModule.manifest.id, "declaration-table-workflow");
assert.equal(declarationTableWorkflowModule.manifest.route, "export-declare");
assert.equal(declarationTableWorkflowModule.manifest.entryElementId, "openExportDeclare");
assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
assert.deepEqual(normalizeConfig({
  mode: "manual_files",
  outputMode: "new_directory",
  outputDirectory: " /tmp/output ",
}), {
  ...DEFAULT_CONFIG,
  mode: "manual_files",
  outputMode: "new_directory",
  outputDirectory: "/tmp/output",
});
assert.equal(modeLabel("after_export"), "导出后自动整理");
assert.equal(modeLabel("manual_files"), "选择文件/文件夹手动整理");

for (const id of [
  "declarationTableWorkflowModeAfterExport",
  "declarationTableWorkflowModeManual",
  "declarationTableWorkflowManualPanel",
  "declarationTableWorkflowExportDirectory",
  "chooseDeclarationTableWorkflowFiles",
  "chooseDeclarationTableWorkflowFolder",
  "runDeclarationTableWorkflow",
  "saveDeclarationTableWorkflow",
]) assert.match(template, new RegExp(`id="${id}"`));

assert.match(nativeHost, /async function runDeclarationTableWorkflow\(message, emit\)/);
assert.match(nativeHost, /message\?\.action === "run_declaration_table_workflow"/);
assert.match(nativeHost, /formatType: "declaration"/);
assert.match(nativeHost, /DECLARATION_WORKFLOW_PARTIAL_FAILURE/);
assert.match(nativeHost, /normalizeWorkflowExportFiles\(exportPayload\.outputFiles/);
assert.match(nativeHost, /outputMode = "overwrite"/);
assert.match(installer, /src\/modules\/declaration-table-workflow\/module\.js/);
assert.match(installer, /src\/modules\/declaration-table-workflow\/template\.js/);
assert.match(installer, /src\/modules\/declaration-table-workflow\/styles\.css/);
assert.match(sidepanel, /declarationTableWorkflowModule/);
const runStart = moduleSource.indexOf("running = true;");
const connectionCheck = moduleSource.indexOf("const health = await context.checkLocalConnections");
assert.ok(runStart >= 0 && connectionCheck > runStart);

const exportPanelStart = template.indexOf('id="declarationTableWorkflowExportDirectoryPanel"');
const runButton = template.indexOf('id="runDeclarationTableWorkflow"');
assert.ok(exportPanelStart >= 0 && runButton > exportPanelStart);
assert.equal(template.slice(exportPanelStart, runButton).includes("</section>"), true);

console.log("Declaration table workflow module tests passed.");
