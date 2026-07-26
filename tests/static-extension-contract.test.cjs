"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const html = fs.readFileSync(path.join(extensionRoot, "src", "sidepanel", "index.html"), "utf8");
const sidepanel = fs.readFileSync(path.join(extensionRoot, "src", "sidepanel", "sidepanel.js"), "utf8");
const content = fs.readFileSync(path.join(extensionRoot, "src", "content", "content.js"), "utf8");
const adapter = fs.readFileSync(path.join(extensionRoot, "src", "injected", "page_adapter.js"), "utf8");
const bridge = fs.readFileSync(path.join(repoRoot, "native-helper", "connector_bridge.js"), "utf8");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
const updateChecker = fs.readFileSync(path.join(repoRoot, "native-helper", "update_checker.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const nativeInstaller = fs.readFileSync(path.join(repoRoot, "native-helper", "install_native_host.sh"), "utf8");
const versionConfig = JSON.parse(fs.readFileSync(path.join(extensionRoot, "version.json"), "utf8"));
const pluginServer = fs.readFileSync(path.join(repoRoot, "plugins", "tianyuan-browser-connector", "runtime", "apps", "mcp", "server.mjs"), "utf8");
const pluginReadme = fs.readFileSync(path.join(repoRoot, "plugins", "tianyuan-browser-connector", "README.md"), "utf8");

function quotedConstant(source, name) {
  return source.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1] || "";
}

function referencedManifestFiles() {
  return [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...(manifest.content_scripts || []).flatMap((item) => item.js || []),
    ...(manifest.web_accessible_resources || []).flatMap((item) => item.resources || []),
  ].filter(Boolean);
}

for (const relativePath of referencedManifestFiles()) {
  assert.equal(fs.existsSync(path.join(extensionRoot, relativePath)), true, `manifest file missing: ${relativePath}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "sidepanel HTML contains duplicate ids");
const referencedIds = [...sidepanel.matchAll(/document\.getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
for (const id of referencedIds) {
  assert.equal(ids.includes(id), true, `sidepanel references missing HTML id: ${id}`);
}

assert.equal(quotedConstant(content, "ADAPTER_VERSION"), quotedConstant(adapter, "ADAPTER_VERSION"));
assert.equal(quotedConstant(sidepanel, "EXPECTED_CONNECTOR_PROTOCOL_VERSION"), quotedConstant(bridge, "PROTOCOL_VERSION"));
assert.equal(quotedConstant(nativeHost, "CONNECTOR_PROTOCOL_VERSION"), quotedConstant(bridge, "PROTOCOL_VERSION"));
assert.equal(manifest.version, versionConfig.chromeVersion);
assert.equal(manifest.version_name, versionConfig.versionName);
assert.equal(versionConfig.productVersion, "0.9.0");
assert.equal(versionConfig.repository, "zer0-lyz/tianyuan-browser-workbench-releases");

const installerPluginVersion = quotedConstant(installer, "CONNECTOR_VERSION");
assert.ok(installerPluginVersion);
assert.equal(pluginServer.includes(`version: "${installerPluginVersion}"`), true);
assert.equal(pluginReadme.includes(`版本 \`${installerPluginVersion}\``), true);

for (const resource of manifest.web_accessible_resources || []) {
  for (const match of resource.matches || []) {
    assert.match(match, /^(https?|file|\*):\/\/[^/]+\/.*$/);
    assert.equal(match.includes("/ty/**"), false, `invalid Chrome match pattern: ${match}`);
  }
}

assert.equal(installer.includes("sourceBuildDigest"), true);
assert.equal(installer.includes(".staging-"), true);
assert.equal(installer.includes("runtimeBuildId"), true);
assert.equal(sidepanel.includes("x-tianyuan-runtime-build-id"), true);
assert.equal(sidepanel.includes('runtimeContractMissing ? "路径不正确"'), true);
assert.equal(sidepanel.includes("当前扩展加载路径不正确"), true);
assert.equal(sidepanel.includes("groupBatchUploadMappingsByRow"), true);
assert.equal(sidepanel.includes("preflightBatchUploadRows"), true);
assert.equal(sidepanel.includes("runBatchCleanup"), true);
assert.equal(sidepanel.includes("batchCleanupState.running"), true);
assert.equal(sidepanel.includes("async function inspectBatchCleanupTarget"), true);
assert.equal(sidepanel.includes("batchCleanupState.running = true;"), true);
assert.equal(adapter.includes("BATCH_UPLOAD_ROW_ALREADY_HAS_INDEX"), true);
assert.equal(adapter.includes("click_upload_dialog_save_once"), true);
assert.equal(adapter.includes("clearAuditAttachments"), true);
assert.equal(adapter.includes("CLEAR_ATTACHMENTS_INDEX_VALUE_MISMATCH"), true);
assert.equal(adapter.includes("rowsWithCleanupData"), true);
assert.equal(sidepanel.includes("expectedCleanupValues"), true);
assert.equal(html.includes('id="page-updates"'), true);
assert.equal(html.includes('id="checkForUpdates"'), true);
assert.equal(html.includes('<span class="badge">9 个模块</span>'), true);
assert.equal(sidepanel.includes("check_github_update"), true);
assert.equal(sidepanel.includes("maybeAutoCheckUpdates"), true);
assert.equal(nativeHost.includes('message?.action === "check_github_update"'), true);
assert.equal(updateChecker.includes("api.github.com"), true);
assert.equal(updateChecker.includes("DEFAULT_REPOSITORY"), true);
assert.equal(updateChecker.includes("tianyuan-browser-workbench-releases"), true);
assert.equal(updateChecker.includes("tokenUsed: false"), true);
assert.equal(installer.includes('copyFileAtomic(path.join(repoRoot, "native-helper", "update_checker.js")'), true);
assert.equal(installer.includes('entry.name === ".DS_Store"'), true);
assert.equal(nativeInstaller.includes("update_checker.js"), true);
assert.equal(nativeInstaller.includes("connector_bridge.js"), true);
assert.equal(bridge.includes("EXTENSION_RUNTIME_BUILD_MISMATCH"), true);
assert.equal(nativeHost.includes("return connectorBridge.start({"), true);
assert.equal(/\bconnectorHandle\s*\(/.test(nativeHost.slice(nativeHost.indexOf("function startConnectorBridge()"))), false);

let activeContentListener = null;
const context = {
  chrome: {
    runtime: {
      getURL(value) { return `chrome-extension://test/${value}`; },
      onMessage: {
        addListener(listener) { activeContentListener = listener; },
        removeListener(listener) {
          if (activeContentListener === listener) activeContentListener = null;
        },
      },
    },
  },
  document: {},
  location: { href: "https://excel.zhrdc.net/ty/test" },
  window: {},
};
context.globalThis = context;
vm.runInNewContext(content, context);
const firstListener = activeContentListener;
vm.runInNewContext(content, context);
assert.equal(typeof activeContentListener, "function");
assert.notEqual(activeContentListener, firstListener);

for (const source of [content, adapter, sidepanel, bridge, nativeHost, installer]) {
  assert.equal(source.includes("/Users/zer0y/Library/CloudStorage/OneDrive"), false, "runtime code points into OneDrive");
}

console.log("Static extension contract checks passed.");
