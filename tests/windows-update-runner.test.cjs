"use strict";

const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWindowsAdapter } = require("../native-helper/platform/windows.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-update-runner-"));
const child = new EventEmitter();
child.pid = 43210;
child.unref = () => {};
const adapter = createWindowsAdapter({
  platform: "win32",
  homeDir: root,
  env: { LOCALAPPDATA: path.join(root, "local-app-data") },
  spawn: () => child,
});
const statusPath = path.join(root, "status.json");
const logPath = path.join(root, "update.log");
const result = adapter.launchWorkbenchInstaller({
  installerPath: path.join(root, "install.ps1"),
  statusPath,
  logPath,
  parentPid: 43211,
  cleanupPath: path.join(root, "staging-update"),
});
const script = fs.readFileSync(result.runnerPath, "utf8");

assert.equal(result.pid, 43210);
assert.match(script, /ErrorActionPreference = 'Stop'/);
assert.match(script, /AddSeconds\(15\)/);
assert.match(script, /UPDATE_PARENT_PROCESS_NOT_EXITED/);
assert.match(script, /stopping_services/);
assert.match(script, /UPDATE_COMPLETION_STATUS_MISSING/);
assert.match(script, /installerPid/);
assert.match(script, /updatedAt/);
assert.match(script, /UTF8Encoding\]::new\(\$false\)/);
assert.match(script, /CleanupPath/);
assert.match(script, /Remove-Item -LiteralPath \$CleanupPath/);
assert.match(script, /trap/);

fs.rmSync(root, { recursive: true, force: true });
console.log("Windows update runner generation tests passed.");
