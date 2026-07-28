#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [sourceDirInput, stageDirInput] = process.argv.slice(2);
if (!sourceDirInput || !stageDirInput) {
  throw new Error("Usage: node scripts/prepare-windows-launchers.mjs <source-dir> <stage-dir>");
}

const sourceDir = path.resolve(sourceDirInput);
const stageDir = path.resolve(stageDirInput);
const bom = Buffer.from([0xef, 0xbb, 0xbf]);

function writeBomPowerShell(sourceName, outputNames) {
  const source = fs.readFileSync(path.join(sourceDir, sourceName));
  const body = source.subarray(0, 3).equals(bom) ? source.subarray(3) : source;
  const payload = Buffer.concat([bom, body]);
  for (const outputName of outputNames) {
    fs.writeFileSync(path.join(stageDir, outputName), payload);
  }
}

function writeBomUtf8Text(sourceName, outputNames) {
  const source = fs.readFileSync(path.join(sourceDir, sourceName));
  const body = source.subarray(0, 3).equals(bom) ? source.subarray(3) : source;
  const payload = Buffer.concat([bom, body]);
  for (const outputName of outputNames) {
    fs.writeFileSync(path.join(stageDir, outputName), payload);
  }
}

function writeAsciiCmd(outputNames, powerShellName, successText, failureText) {
  const lines = [
    "@echo off",
    "setlocal",
    "set \"SCRIPT_DIR=%~dp0\"",
    `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT_DIR%${powerShellName}\"`,
    "set \"EXIT_CODE=%ERRORLEVEL%\"",
    "echo.",
    `if \"%EXIT_CODE%\"==\"0\" echo ${successText}`,
    `if not \"%EXIT_CODE%\"==\"0\" echo ${failureText}`,
    "pause",
    "exit /b %EXIT_CODE%",
    "",
  ];
  const payload = Buffer.from(lines.join("\r\n"), "ascii");
  for (const outputName of outputNames) {
    fs.writeFileSync(path.join(stageDir, outputName), payload);
  }
}

fs.mkdirSync(stageDir, { recursive: true });
writeBomPowerShell("install.ps1", ["install.ps1", "安装.ps1"]);
writeBomPowerShell("uninstall.ps1", ["uninstall.ps1"]);
writeBomUtf8Text("安装使用说明.md", ["INSTALL_README.md"]);
writeBomUtf8Text("交给Agent安装.md", ["START_WITH_AGENT.txt", "AGENT_INSTALL_PROMPT.md"]);
writeAsciiCmd(
  ["install.cmd"],
  "install.ps1",
  "Installation completed.",
  "Installation failed. See the PowerShell window and installation report.",
);
writeAsciiCmd(
  ["uninstall.cmd"],
  "uninstall.ps1",
  "Uninstallation completed.",
  "Uninstallation failed. See the PowerShell window for details.",
);

console.log(JSON.stringify({ ok: true, stageDir }, null, 2));
