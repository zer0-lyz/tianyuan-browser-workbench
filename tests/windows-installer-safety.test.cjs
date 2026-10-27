"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const installer = fs.readFileSync(
  path.join(repoRoot, "release", "windows-x64", "install.ps1"),
  "utf8",
);
const launcher = fs.readFileSync(
  path.join(repoRoot, "scripts", "prepare-windows-launchers.mjs"),
  "utf8",
);
const nativeHost = fs.readFileSync(
  path.join(repoRoot, "native-helper", "native_host.js"),
  "utf8",
);
const cliRuntime = fs.readFileSync(
  path.join(repoRoot, "native-helper", "cli-runtime.js"),
  "utf8",
);

const cliBlock = installer.slice(
  installer.indexOf("function Add-TycpvPathCandidates"),
  installer.indexOf("function Get-PythonCandidates"),
);

assert.match(installer, /param\(\s*\[switch\]\$Agent/);
assert.match(installer, /\$AgentMode = \$Agent\.IsPresent/);
assert.match(cliBlock, /\[IO\.Path\]::GetFileName\(\$ResolvedPath\) -notin @\("tycpv\.exe", "tycpv\.cmd"\)/);
assert.match(cliBlock, /WaitForExit\(\$TimeoutSeconds \* 1000\)/);
assert.match(cliBlock, /taskkill\.exe \/PID \$Process\.Id \/T \/F/);
assert.match(cliBlock, /\$ProcessInfo\.Arguments = "--help"/);
assert.doesNotMatch(cliBlock, /Get-ChildItem[\s\S]*-Recurse/);
assert.doesNotMatch(cliBlock, /--version/);
assert.match(installer, /安装检查结果\.json/);
assert.match(installer, /installation = \[ordered\]@\{ status = "success"/);
assert.match(installer, /manualActions/);
assert.match(installer, /packageSha256/);
assert.match(installer, /\$AgentMode -and \$BrowserExe/);
assert.match(installer, /exit \$FailureExitCode/);
assert.match(launcher, /install-agent\.cmd/);
assert.match(launcher, /-NonInteractive/);
assert.match(launcher, /-Agent/);
assert.equal(launcher.includes('"if \\"%AGENT_MODE%\\"==\\"0\\" pause"'), true);
assert.match(nativeHost, /const probeArgs = IS_WINDOWS \? \["--help"\] : \["--version"\]/);
assert.match(nativeHost, /discoverWindowsCliCandidates/);
assert.match(nativeHost, /timeoutMs: IS_WINDOWS \? 15_000 : 5_000/);
assert.match(nativeHost, /maxDurationMs: IS_WINDOWS \? 30_000 : 5_000/);
assert.match(cliRuntime, /maxDurationMs = 30_000/);
assert.match(cliRuntime, /reason === "TYCPV_TIMEOUT"/);
assert.match(cliRuntime, /taskkill\.exe/);

console.log("Windows installer safety tests passed.");
