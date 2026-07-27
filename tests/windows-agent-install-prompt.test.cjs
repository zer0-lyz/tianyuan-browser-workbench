"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const promptPath = path.join(repoRoot, "release", "windows-x64", "交给Agent安装.md");
const launcherScriptPath = path.join(repoRoot, "scripts", "prepare-windows-launchers.mjs");
const prompt = fs.readFileSync(promptPath, "utf8");
const launcherScript = fs.readFileSync(launcherScriptPath, "utf8");

for (const requiredText of [
  "不要只提供说明，请实际执行",
  "tianyuan-browser-workbench-releases",
  "tianyuan-workbench-v*-windows-x64.zip",
  "update-manifest.json",
  "SHA-256",
  "安装.cmd",
  "install.cmd",
  "%LOCALAPPDATA%\\TianyuanWorkbench\\安装检查结果.txt",
  "%LOCALAPPDATA%\\TianyuanWorkbench\\projects\\天源评估系统\\extension",
  "lkflndcnklpeaejohaacoaolnmhgigoc",
  "connection_status",
  "list_capabilities",
  "get_context",
  "不得执行上传、保存、清理附件、退出编辑",
  "不得要求用户把 token 发送到聊天中",
]) {
  assert.equal(prompt.includes(requiredText), true, `missing agent prompt text: ${requiredText}`);
}

assert.equal(
  launcherScript.includes('"START_WITH_AGENT.txt"'),
  true,
  "Windows package must include a copyable plain-text Agent prompt",
);

console.log("Windows Agent install prompt tests passed.");
