"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "win32") {
  console.log("Windows uninstall process ownership check skipped outside Windows.");
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, "..");
const uninstallPath = path.join(repoRoot, "release", "windows-x64", "uninstall.ps1");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-uninstall-ownership-"));
const harnessPath = path.join(tempRoot, "verify-uninstall-process-ownership.ps1");
const bomUninstallPath = path.join(tempRoot, "uninstall-with-bom.ps1");
const uninstallBytes = fs.readFileSync(uninstallPath);
fs.writeFileSync(bomUninstallPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), uninstallBytes]));
const writePowerShellFile = (filePath, source) => {
  fs.writeFileSync(filePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source, "utf8")]));
};

try {
  writePowerShellFile(harnessPath, String.raw`
param([string]$UninstallPath, [string]$TestRoot)
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($UninstallPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ("UNINSTALL_PARSE_FAILED: " + ($errors -join "; ")) }
$functionAst = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Get-OwnedWorkbenchProcesses" }, $true)
if (-not $functionAst) { throw "OWNED_PROCESS_FUNCTION_MISSING" }
Invoke-Expression $functionAst.Extent.Text

$nativeRoot = Join-Path $TestRoot "workbench-runtime\native-helper"
$nativeHostExe = Join-Path $nativeRoot "native_host.exe"
$managedNodeExe = Join-Path $nativeRoot "node\node.exe"
$nativeHostScript = Join-Path $nativeRoot "native_host.js"
$otherNodeExe = Join-Path $TestRoot "other-install\node.exe"
$processes = @(
  [PSCustomObject]@{ ProcessId = 101; Name = "node.exe"; ExecutablePath = $managedNodeExe; CommandLine = ('"{0}" "{1}" --connector-bridge' -f $managedNodeExe, $nativeHostScript) },
  [PSCustomObject]@{ ProcessId = 202; Name = "python.exe"; ExecutablePath = "C:\Other\python.exe"; CommandLine = "python helper --port 40415" },
  [PSCustomObject]@{ ProcessId = 303; Name = "node.exe"; ExecutablePath = $otherNodeExe; CommandLine = ('"{0}" other.js --connector-bridge' -f $otherNodeExe) }
)
$owned = @(Get-OwnedWorkbenchProcesses -NativeHostExe $nativeHostExe -ManagedNodeExe $managedNodeExe -NativeHostScripts @($nativeHostScript) -Processes $processes)
if ($owned.Count -ne 1 -or $owned[0].ProcessId -ne 101) { throw "PROCESS_OWNERSHIP_MISMATCH" }
$none = @(Get-OwnedWorkbenchProcesses -NativeHostExe $nativeHostExe -ManagedNodeExe $managedNodeExe -NativeHostScripts @($nativeHostScript) -Processes @($processes | Where-Object { $_.ProcessId -ne 101 }))
if ($none.Count -ne 0) { throw "UNRELATED_PROCESS_MATCHED" }
Write-Output "Windows uninstall process ownership checks passed."
`);

  const output = execFileSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    harnessPath,
    bomUninstallPath,
    tempRoot,
  ], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /Windows uninstall process ownership checks passed/);

  const packageRoot = path.join(tempRoot, "fresh-package");
  const oldRoot = path.join(tempRoot, "previous-install");
  const oldNativeRoot = path.join(oldRoot, "workbench-runtime", "native-helper");
  const oldManifestPath = path.join(oldNativeRoot, "com.tianyuan.workbench.helper.json");
  const oldRuntimeConfigPath = path.join(oldNativeRoot, "runtime-config.json");
  const sentinelPath = path.join(oldRoot, "workbench-runtime", "do-not-delete-sentinel.txt");
  const copiedUninstallPath = path.join(packageRoot, "uninstall.ps1");
  const discoveryHarnessPath = path.join(tempRoot, "verify-uninstall-root-selection.ps1");
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.mkdirSync(oldNativeRoot, { recursive: true });
  fs.writeFileSync(copiedUninstallPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), uninstallBytes]));
  fs.writeFileSync(oldRuntimeConfigPath, JSON.stringify({ installRoot: oldRoot, layout: "visible-root-v1" }), "utf8");
  fs.writeFileSync(oldManifestPath, JSON.stringify({ path: path.join(oldNativeRoot, "native_host.exe") }), "utf8");
  fs.writeFileSync(sentinelPath, "preserve previous installation\n", "utf8");
  writePowerShellFile(discoveryHarnessPath, String.raw`
param([string]$UninstallPath, [string]$OldManifestPath)
function Get-ItemProperty {
  [CmdletBinding()]
  param([string]$LiteralPath, [string]$Name)
  $value = [PSCustomObject]@{}
  $value | Add-Member -NotePropertyName "(default)" -NotePropertyValue $OldManifestPath
  return $value
}
function Get-CimInstance {
  [CmdletBinding()]
  param([string]$ClassName)
  return @()
}
function Test-Path {
  param([string]$LiteralPath, [string]$PathType)
  if ($LiteralPath -match '(?i)天源工作台\\浏览器扩展路径\.txt$|天源工作台-浏览器扩展\.lnk$') { return $false }
  Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
}
function Remove-Item {
  param([string]$LiteralPath, [switch]$Recurse, [switch]$Force)
  if ($LiteralPath -like "HKCU:*") { return }
  Microsoft.PowerShell.Management\Remove-Item @PSBoundParameters
}
$global:SimulatedMessages = @()
function Write-Host {
  param([object]$Object, [string]$ForegroundColor)
  $global:SimulatedMessages += [string]$Object
  Write-Output $Object
}
& $UninstallPath
if (($global:SimulatedMessages -join [Environment]::NewLine) -match '此目录未安装，未删除') { exit 2 }
exit 0
`);

  const discovery = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    discoveryHarnessPath,
    copiedUninstallPath,
    oldManifestPath,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(discovery.error, undefined, discovery.error?.message);
  assert.equal(discovery.status, 2, `${discovery.stdout}\n${discovery.stderr}`);
  assert.match(discovery.stdout, /此目录未安装，未删除/);
  assert.equal(fs.readFileSync(sentinelPath, "utf8"), "preserve previous installation\n");
  assert.equal(fs.existsSync(oldManifestPath), true, "the simulated existing registration must remain untouched");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Windows uninstall safety tests passed.");
