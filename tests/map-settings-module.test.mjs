import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { mapSettingsModule } from "../extension/src/modules/map-settings/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("map settings module exposes a local-only official API entry", () => {
  assert.equal(mapSettingsModule.manifest.id, "map-settings");
  assert.equal(mapSettingsModule.manifest.route, "map-settings");
  assert.equal(mapSettingsModule.manifest.stage, "stable");
  assert.equal(mapSettingsModule.manifest.type, "feature");
  assert.equal(mapSettingsModule.manifest.countInModuleBadge, false);
  const template = fs.readFileSync(path.join(repoRoot, "extension/src/modules/map-settings/template.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(repoRoot, "extension/src/modules/map-settings/module.js"), "utf8");
  assert.match(template, /默认使用现有公共底图/);
  assert.match(template, /Web 端（JS API）Key/);
  assert.match(template, /https:\/\/console\.amap\.com\/dev\/key\/app/);
  assert.match(template, /打开高德 API 配置页面/);
  assert.match(template, /应用管理 → 我的应用/);
  assert.match(template, /不会上传或写入 GitHub/);
  assert.match(moduleSource, /get_map_config/);
  assert.match(moduleSource, /save_map_config/);
  assert.match(moduleSource, /clear_map_config/);
  assert.match(moduleSource, /preserveExisting/);
});

function callNative(nativeHost, message, configPath) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32LE(body.length, 0);
  body.copy(frame, 4);
  const result = spawnSync(process.execPath, [nativeHost], {
    cwd: repoRoot,
    input: frame,
    env: { ...process.env, TIANYUAN_MAP_CONFIG_PATH: configPath },
    encoding: "buffer",
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const length = result.stdout.readUInt32LE(0);
  return JSON.parse(result.stdout.subarray(4, 4 + length).toString("utf8"));
}

test("native map configuration persists only a masked summary", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-map-config-"));
  const configPath = path.join(directory, "map-config.json");
  const nativeHost = path.join(repoRoot, "native-helper/native_host.js");
  try {
    const initial = callNative(nativeHost, { action: "get_map_config" }, configPath);
    assert.equal(initial.configured, false);
    const saved = callNative(nativeHost, {
      action: "save_map_config",
      config: { amap: { enabled: true, webKey: "test-web-key-1234", securityJsCode: "test-security" } },
    }, configPath);
    assert.equal(saved.configured, true);
    assert.equal(saved.enabled, true);
    assert.equal(saved.webKeyMasked.endsWith("1234"), true);
    assert.equal(saved.webKeyMasked.includes("test-web-key"), false);
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(raw.amap.webKey, "test-web-key-1234");
    assert.equal(raw.amap.securityJsCode, "test-security");
    const cleared = callNative(nativeHost, { action: "clear_map_config" }, configPath);
    assert.equal(cleared.configured, false);
    assert.equal(fs.existsSync(configPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

console.log("Map settings tests passed.");
