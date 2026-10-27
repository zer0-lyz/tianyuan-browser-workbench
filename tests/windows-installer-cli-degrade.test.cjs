"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installer = fs.readFileSync(path.join(repoRoot, "release", "windows-x64", "install.ps1"), "utf8");
const runtimeInstaller = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const fullBuilder = fs.readFileSync(path.join(repoRoot, "release", "build_windows_x64_release.sh"), "utf8");
const candidateBuilder = fs.readFileSync(path.join(repoRoot, "release", "build_windows_x64_candidate.ps1"), "utf8");
const updater = fs.readFileSync(path.join(repoRoot, "native-helper", "update_installer.js"), "utf8");
const windowsAdapter = fs.readFileSync(path.join(repoRoot, "native-helper", "platform", "windows.js"), "utf8");

assert.match(installer, /function Find-Tycpv/);
assert.match(installer, /Find-Tycpv/);
assert.match(installer, /optionalDependencies\s*=\s*\[ordered\]@\{/);
assert.match(installer, /cli\s*=\s*\[ordered\]@\{ required = \$false/);
assert.match(installer, /REQUIRED_COMPONENT_VALIDATION_FAILED/);
assert.match(installer, /LITE_INSTALL_ROOT_UNKNOWN/);
assert.match(installer, /TIANYUAN_RUNTIME_LAYOUT/);
assert.match(installer, /workbench-runtime/);
assert.doesNotMatch(installer, /runtime\\tycpv-setup-0\.1\.0-win-x64\.exe/);
assert.doesNotMatch(installer, /Start-Process -FilePath \$TycpvInstaller/);

assert.match(runtimeInstaller, /function resolveTycpvBin\(runtimeConfigPath\)/);
assert.match(runtimeInstaller, /installRoot: configuredInstallRoot/);
assert.match(runtimeInstaller, /layout: runtimeLayout/);
assert.match(runtimeInstaller, /cli-runtime\.js/);
assert.match(runtimeInstaller, /COPY_DIRECTORY_TARGET_OVERLAP/);
assert.match(runtimeInstaller, /function classifyDirectoryCopyTarget/);
assert.match(runtimeInstaller, /function ensureNodeRuntime\(\)/);

assert.doesNotMatch(fullBuilder, /TYCPV_SOURCE/);
assert.doesNotMatch(fullBuilder, /tycpv-setup-0\.1\.0-win-x64\.exe/);
assert.match(candidateBuilder, /runtime\/tycpv/);
assert.match(updater, /installRoot: platformAdapter\.installRoot/);
assert.match(windowsAdapter, /TIANYUAN_INSTALL_ROOT/);
assert.match(windowsAdapter, /AppendAllText\(\$LogPath, \[string\]\$InstallerOutput, \$Utf8NoBom\)/);
assert.match(windowsAdapter, /-Agent -InstallRoot \$InstallRoot/);

console.log("Windows installer optional CLI and visible runtime layout checks passed");
