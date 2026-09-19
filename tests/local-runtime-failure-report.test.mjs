import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-runtime-failure-"));

fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
fs.mkdirSync(
  path.join(tempRoot, "plugins", "tianyuan-browser-connector", ".codex-plugin"),
  { recursive: true },
);
fs.copyFileSync(
  path.join(repoRoot, "scripts", "install-local-runtime.mjs"),
  path.join(tempRoot, "scripts", "install-local-runtime.mjs"),
);
// 安装器 import 了共享指纹模块 scripts/runtime-fingerprint.mjs，fixture 必须一并复制，
// 否则安装器在输出失败报告前就会因 ERR_MODULE_NOT_FOUND 直接崩溃。
fs.copyFileSync(
  path.join(repoRoot, "scripts", "runtime-fingerprint.mjs"),
  path.join(tempRoot, "scripts", "runtime-fingerprint.mjs"),
);
// 可选的指纹封装脚本按存在性复制，保持 fixture 对 scripts 目录文件增减稳健。
const optionalFingerprintScript = path.join(repoRoot, "scripts", "print-runtime-build-id.mjs");
if (fs.existsSync(optionalFingerprintScript)) {
  fs.copyFileSync(
    optionalFingerprintScript,
    path.join(tempRoot, "scripts", "print-runtime-build-id.mjs"),
  );
}
fs.cpSync(
  path.join(repoRoot, "native-helper"),
  path.join(tempRoot, "native-helper"),
  { recursive: true },
);
fs.copyFileSync(
  path.join(repoRoot, "plugins", "tianyuan-browser-connector", ".codex-plugin", "plugin.json"),
  path.join(tempRoot, "plugins", "tianyuan-browser-connector", ".codex-plugin", "plugin.json"),
);

const result = spawnSync(
  process.execPath,
  [path.join(tempRoot, "scripts", "install-local-runtime.mjs")],
  { encoding: "utf8" },
);

assert.equal(result.status, 1);
assert.equal(result.stderr, "");
const payload = JSON.parse(result.stdout);
assert.equal(payload.ok, false);
assert.equal(payload.action, "install_local_runtime");
assert.match(payload.reason, /extension manifest not found/);
assert.deepEqual(payload.security, {
  credentialsReturned: false,
  tokenUsed: false,
});

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("local runtime failure report tests passed");
