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
