"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const promptPath = path.join(repoRoot, "release", "windows-x64", "交给Agent安装.md");
const launcherScriptPath = path.join(repoRoot, "scripts", "prepare-windows-launchers.mjs");
const installerPath = path.join(repoRoot, "release", "windows-x64", "install.ps1");
const releaseHandoffPath = path.join(repoRoot, "WINDOWS_CODEX_HANDOFF.md");
const prompt = fs.readFileSync(promptPath, "utf8");
const launcherScript = fs.readFileSync(launcherScriptPath, "utf8");
const installer = fs.readFileSync(installerPath, "utf8");
const releaseHandoff = fs.readFileSync(releaseHandoffPath, "utf8");
const userGuide = fs.readFileSync(path.join(repoRoot, "release", "windows-x64", "安装使用说明.md"), "utf8");

for (const requiredText of [
  "不要只提供说明，请实际执行",
  "tianyuan-browser-workbench-releases",
  "tianyuan-workbench-v*-windows-x64.zip",
  "update-manifest.json",
  "SHA-256",
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
assert.equal(
  launcherScript.includes('"AGENT_INSTALL_PROMPT.md"'),
  true,
  "Windows package must include a Markdown Agent prompt",
);
assert.equal(
  launcherScript.includes('"INSTALL_README.md"'),
  true,
  "Windows package must include an ASCII-named install README",
);
assert.equal(
  launcherScript.includes('["install.ps1", "安装.ps1"]'),
  true,
  "Windows package must keep the legacy updater bootstrap alias",
);
for (const requiredHandoffText of [
  "macOS 主线负责开发并推送源码",
  "TianyuanWorkbench",
  "install-agent.cmd",
  "generate-update-manifest.mjs",
  "gh release upload",
]) {
  assert.equal(releaseHandoff.includes(requiredHandoffText), true, `Release handoff missing: ${requiredHandoffText}`);
}

for (const requiredRuntimeText of [
  "%TEMP%\\TW-install",
  "Node.js、Python 及全部业务依赖",
  "pythonDependencies",
  "桌面“天源工作台-浏览器扩展”入口",
]) {
  assert.equal(prompt.includes(requiredRuntimeText), true, `Agent prompt missing: ${requiredRuntimeText}`);
}
for (const requiredGuideText of [
  "不会只复制浏览器扩展",
  "python-docx",
  "天源工作台-浏览器扩展.lnk",
  "安装检查结果.json",
]) {
  assert.equal(userGuide.includes(requiredGuideText), true, `Windows guide missing: ${requiredGuideText}`);
}

assert.equal(installer.includes("天源工作台-浏览器扩展.lnk"), true);
assert.equal(installer.includes("浏览器扩展路径.txt"), true);
assert.equal(
  installer.includes("import openpyxl, et_xmlfile, lxml, docx, typing_extensions"),
  true,
  "Windows installer must verify the actual Python runtime dependencies",
);

console.log("Windows Agent install prompt tests passed.");
