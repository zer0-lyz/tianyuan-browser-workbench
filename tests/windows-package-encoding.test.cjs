"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "release", "windows-x64");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-windows-launchers-"));
const stageDir = path.join(tempRoot, "stage");

execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "prepare-windows-launchers.mjs"),
  sourceDir,
  stageDir,
], { stdio: "pipe" });

const bom = Buffer.from([0xef, 0xbb, 0xbf]);
for (const name of ["install.ps1", "uninstall.ps1"]) {
  const payload = fs.readFileSync(path.join(stageDir, name));
  assert.equal(payload.subarray(0, 3).equals(bom), true, `${name} must have UTF-8 BOM`);
}

for (const name of ["START_WITH_AGENT.txt", "AGENT_INSTALL_PROMPT.md", "INSTALL_README.md"]) {
  const payload = fs.readFileSync(path.join(stageDir, name));
  assert.equal(payload.subarray(0, 3).equals(bom), true, `${name} must have UTF-8 BOM`);
}
assert.equal(
  fs.readFileSync(path.join(stageDir, "START_WITH_AGENT.txt")).toString("utf8").includes("不要只提供说明，请实际执行"),
  true,
);

for (const name of ["install.cmd", "uninstall.cmd"]) {
  const payload = fs.readFileSync(path.join(stageDir, name));
  assert.equal([...payload].every((value) => value < 128), true, `${name} must be ASCII only`);
  const text = payload.toString("ascii");
  assert.equal(/(^|[^\r])\n/.test(text), false, `${name} must use CRLF only`);
  assert.equal(text.includes("chcp 65001"), false, `${name} must not depend on code page changes`);
  assert.equal(text.includes("powershell.exe -NoLogo -NoProfile"), true);
}

for (const name of fs.readdirSync(stageDir)) {
  assert.equal([...Buffer.from(name)].every((value) => value < 128), true, `${name} must use an ASCII filename`);
}

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Windows package encoding tests passed.");
