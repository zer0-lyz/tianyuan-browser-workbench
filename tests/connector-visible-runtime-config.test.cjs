"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-bridge-visible-root-"));
const stagedHelper = path.join(tempRoot, "package", "native-helper");
const installRoot = path.join(tempRoot, "visible installation root");
const runtimeConfigPath = path.join(stagedHelper, "runtime-config.json");

try {
  fs.mkdirSync(stagedHelper, { recursive: true });
  for (const name of ["connector_bridge.js", "codex_catalog.js", "directory-picker.js", "report-pending.js", "report-snapshot.js", "report-structure-pending.js"]) {
    fs.copyFileSync(path.join(repoRoot, "native-helper", name), path.join(stagedHelper, name));
  }
  for (const name of ["index.js", "common.js", "windows.js", "macos.js", "unsupported.js"]) {
    const destination = path.join(stagedHelper, "platform", name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, "native-helper", "platform", name), destination);
  }
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({
    installRoot,
    layout: "visible-root-v1",
  }));

  const script = `
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { createBridge } = require(${JSON.stringify(path.join(stagedHelper, "connector_bridge.js"))});
    process.stdout.write(JSON.stringify(createBridge().paths));
  `;
  const env = { ...process.env };
  delete env.TIANYUAN_RUNTIME_CONFIG_PATH;
  delete env.TIANYUAN_INSTALL_ROOT;
  delete env.TIANYUAN_RUNTIME_LAYOUT;
  delete env.TIANYUAN_NATIVE_RUNTIME_ROOT;
  const paths = JSON.parse(execFileSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env,
  }));
  const nativeRuntimeRoot = path.join(installRoot, "workbench-runtime", "native-helper");
  assert.equal(
    paths.bindingsPath,
    path.join(nativeRuntimeRoot, "connector-bindings.json"),
    "ConnectorBridge must read the adjacent runtime config when no env override is present",
  );
  assert.equal(paths.sourcesPath, path.join(nativeRuntimeRoot, "agent-sources.json"));
  assert.equal(paths.configDir, path.join(installRoot, "workbench-runtime", "agent-sources"));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("ConnectorBridge visible-root runtime-config checks passed.");
