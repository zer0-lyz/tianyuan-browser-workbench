"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("installer lists structure pending helper in all three runtime copy stages", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "install-local-runtime.mjs"), "utf8");
  const backupList = source.match(/const NATIVE_RUNTIME_BACKUP_FILES = \[([\s\S]*?)\n\];/);
  assert.ok(backupList);
  assert.match(backupList[1], /"report-structure-pending\.js"/);
  const projectCopyList = source.match(/path\.join\(repoRoot, "native-helper"\),\s*path\.join\(runtimeProjectRoot, "native-helper"\),\s*\[([\s\S]*?)\],\s*\);/);
  assert.ok(projectCopyList);
  assert.match(projectCopyList[1], /"report-structure-pending\.js"/);
  assert.match(source, /copyFileAtomic\(path\.join\(repoRoot, "native-helper", "report-structure-pending\.js"\),\s*path\.join\(nativeRuntimeRoot, "report-structure-pending\.js"\)\);/);
});

test("isolated installer copies all required Native Host modules before self-test", { skip: process.platform !== "darwin" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-report-installer-"));
  const nativeRoot = path.join(home, "runtime", "native-helper");
  const projectRoot = path.join(home, "runtime", "project");
  const skillsRoot = path.join(home, "runtime", "skills");
  const wrapper = path.join(home, "node-wrapper");
  const isolatedSelfTestHome = path.join(home, "self-test-home");
  const version = JSON.parse(fs.readFileSync(path.join(root, "plugins/tianyuan-browser-connector/.codex-plugin/plugin.json"), "utf8")).version;
  const pluginRoots = [path.join(home, "plugins/tianyuan-browser-connector"), path.join(home, ".codex/plugins/cache/personal/tianyuan-browser-connector", version)];
  const originalConfig = Buffer.from('{"fixture":"preserve-existing-config"}\n');
  for (const pluginRoot of pluginRoots) {
    fs.mkdirSync(path.join(pluginRoot, "runtime"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, "runtime", "agent-config.json"), originalConfig);
    fs.writeFileSync(path.join(pluginRoot, "local-extra.txt"), "preserve-extra");
  }
  const python = process.env.TIANYUAN_PYTHON_BIN || spawnSync("which", ["python3"], { encoding: "utf8" }).stdout.trim();
  fs.mkdirSync(nativeRoot, { recursive: true });
  fs.mkdirSync(isolatedSelfTestHome, { recursive: true });
  fs.mkdirSync(path.join(home, ".tycpv"), { recursive: true });
  fs.writeFileSync(path.join(home, ".tycpv", "auth.json"), JSON.stringify({ expiresAt: "2099-01-01T00:00:00Z", token: "synthetic-secret" }));
  fs.writeFileSync(path.join(home, ".tycpv", "token.secret.json"), JSON.stringify({ token: "synthetic-secret" }));
  fs.writeFileSync(path.join(nativeRoot, "agent-sources.json"), JSON.stringify({ sources: [{ agentId: "test", providerId: "codex", installationId: "synthetic", credentialRef: `file:${home}/unused.json#synthetic` }] }));
  fs.writeFileSync(wrapper, `#!/bin/sh\nif [ "$2" = "--start-connector" ]; then printf '%s\\n' '{"ok":true,"connector":{"ok":true,"synthetic":true}}'; exit 0; fi\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o755 });
  const env = {
    HOME: home,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    TMPDIR: home,
    TIANYUAN_NODE_BIN: wrapper,
    TIANYUAN_PYTHON_BIN: python,
    TIANYUAN_PROJECT_RUNTIME_ROOT: projectRoot,
    TIANYUAN_NATIVE_RUNTIME_ROOT: nativeRoot,
    TIANYUAN_PRINT_SKILLS_ROOT: skillsRoot,
    TIANYUAN_PRINT_SKILLS_DIR: skillsRoot,
    TIANYUAN_DEPRECIATION_SKILL_DIR: path.join(projectRoot, "skills", "depreciation-capex-forecast"),
    TIANYUAN_SELFTEST_ISOLATED_HOME: isolatedSelfTestHome,
    TYCPV_BIN: path.join(home, "missing-cli"),
  };
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/install-local-runtime.mjs")], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.selfTest.ok, true);
    assert.equal(summary.selfTest.cli.authenticated, false);
    assert.equal(result.stdout.includes("synthetic-secret"), false);
    assert.equal(summary.connector.connector.synthetic, true);
    for (const name of ["land-publicity-http.js", "alibaba-lease.js", "native_host.js", "connector_bridge.js", "report-snapshot.js", "report-pending.js", "report-structure-pending.js"]) {
      const sourceBytes = fs.readFileSync(path.join(root, "native-helper", name));
      assert.deepEqual(fs.readFileSync(path.join(nativeRoot, name)), sourceBytes);
      assert.deepEqual(fs.readFileSync(path.join(projectRoot, "native-helper", name)), sourceBytes);
    }
    const structurePending = require(path.join(nativeRoot, "report-structure-pending.js"));
    assert.equal(typeof structurePending.archiveReportStructureAfterReloadReadback, "function");
    assert.ok(fs.existsSync(path.join(projectRoot, "extension", "src", "injected", "report_adapter.js")));
    assert.ok(fs.existsSync(path.join(projectRoot, "extension", "src", "sidepanel", "report-result.mjs")));
    for (const pluginRoot of pluginRoots) assert.deepEqual(fs.readFileSync(path.join(pluginRoot, "runtime", "agent-config.json")), originalConfig);
    const backups = path.join(home, ".tianyuan-workbench", "backups");
    const previous = fs.readdirSync(backups).filter((name) => name.startsWith("connector-plugin-"));
    assert.equal(previous.length, 2);
    for (const name of previous) assert.equal(fs.readFileSync(path.join(backups, name, "previous", "local-extra.txt"), "utf8"), "preserve-extra");
    const configPath = path.join(pluginRoots[0], "runtime", "agent-config.json");
    fs.unlinkSync(configPath);
    fs.symlinkSync("missing-fixture-target", configPath);
    fs.writeFileSync(path.join(pluginRoots[0], "guard.txt"), "unchanged");
    const unsafe = spawnSync(process.execPath, [path.join(root, "scripts/install-local-runtime.mjs")], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stdout + unsafe.stderr, /CONNECTOR_CONFIG_UNSAFE/);
    assert.equal(fs.lstatSync(configPath).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(configPath), "missing-fixture-target");
    assert.equal(fs.readFileSync(path.join(pluginRoots[0], "guard.txt"), "utf8"), "unchanged");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
