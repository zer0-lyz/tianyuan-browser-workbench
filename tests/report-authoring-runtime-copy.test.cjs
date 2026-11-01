"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installer = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
const backupFiles = installer.match(/const NATIVE_RUNTIME_BACKUP_FILES = \[([\s\S]*?)\];/)?.[1] || "";
const extensionCopy = installer.match(/copyDir\(\s*path\.join\(repoRoot, "extension"\),[\s\S]*?\n  \);/)?.[0] || "";
const nativeCopy = installer.match(/copyDir\(\s*path\.join\(repoRoot, "native-helper"\),[\s\S]*?\n  \);/)?.[0] || "";

for (const file of ["report-pending.js", "report-snapshot.js"]) {
  assert.ok(backupFiles.includes(`"${file}"`), `${file} must be backed up before root runtime replacement`);
  assert.ok(nativeCopy.includes(`"${file}"`), `${file} must be a required Native Helper runtime file`);
  assert.ok(
    installer.includes(`copyFileAtomic(path.join(repoRoot, "native-helper", "${file}"), path.join(nativeRuntimeRoot, "${file}"));`),
    `${file} must be copied to the root Native Helper runtime`,
  );
}

for (const file of [
  "src/injected/report_adapter.js",
  "src/sidepanel/report-result.mjs",
  "src/core/connector-session-recovery.mjs",
  "src/core/runtime-reload.mjs",
]) {
  assert.ok(extensionCopy.includes(`"${file}"`), `${file} must be required in the installed extension runtime`);
}

console.log("report authoring runtime copy contract tests passed");
