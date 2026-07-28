"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installer = fs.readFileSync(
  path.join(repoRoot, "release", "windows-x64", "install.ps1"),
  "utf8",
);
const runtimeInstaller = fs.readFileSync(
  path.join(repoRoot, "scripts", "install-local-runtime.mjs"),
  "utf8",
);

assert.equal(installer.includes("function Get-TycpvVersionInfo"), true);
assert.equal(installer.includes("& $env:ComSpec /d /s /c $CommandLine"), true);
assert.equal(installer.includes("$VersionInfo = Get-TycpvVersionInfo $ResolvedPath"), true);
assert.equal(installer.includes("天源 CLI 无法运行。"), false);
assert.equal(installer.includes("天源 CLI 已运行安装程序，但没有找到"), false);
assert.equal(installer.includes("CLI 修复失败不会阻断工作台其他组件更新"), true);
assert.equal(installer.includes("待修复（未阻断工作台组件安装）"), true);
assert.equal(installer.includes("Remove-Item Env:TYCPV_BIN"), true);
assert.equal(installer.includes("天源 CLI 状态：$TycpvStatus"), true);
assert.equal(installer.includes("工作台组件更新完成，天源 CLI 待修复"), true);
assert.equal(runtimeInstaller.includes("tycpvBin: process.env.TYCPV_BIN || undefined"), true);
assert.equal(runtimeInstaller.includes("for (let attempt = 1; attempt <= 3; attempt += 1)"), true);
assert.equal(runtimeInstaller.includes("fs.copyFileSync(sourcePath, targetPath)"), true);
assert.equal(runtimeInstaller.includes("COPY_DIRECTORY_FAILED"), true);
assert.equal(runtimeInstaller.includes('action: "install_local_runtime"'), true);
assert.equal(installer.includes("$InstallFailure = $InstallJson | ConvertFrom-Json"), true);

const cliStep = installer.slice(
  installer.indexOf('Write-Step "2/7 安装或检查天源 CLI"'),
  installer.indexOf('Write-Step "3/7 检查已有 Python"'),
);
assert.match(cliStep, /try \{[\s\S]+Start-Process[\s\S]+catch \{/);
assert.equal(/\bthrow "天源 CLI 无法运行/.test(cliStep), false);

console.log("windows installer CLI degrade tests passed");
