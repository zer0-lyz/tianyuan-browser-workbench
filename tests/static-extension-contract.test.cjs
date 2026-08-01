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
const updatesModule = fs.readFileSync(path.join(extensionRoot, "src", "modules", "updates", "module.js"), "utf8");
const updatesTemplate = fs.readFileSync(path.join(extensionRoot, "src", "modules", "updates", "template.js"), "utf8");
const feedbackModule = fs.readFileSync(path.join(extensionRoot, "src", "modules", "feedback", "module.js"), "utf8");
const feedbackTemplate = fs.readFileSync(path.join(extensionRoot, "src", "modules", "feedback", "template.js"), "utf8");
const feedbackConfig = JSON.parse(fs.readFileSync(path.join(extensionRoot, "feedback.json"), "utf8"));
const moduleRegistry = fs.readFileSync(path.join(extensionRoot, "src", "core", "module-registry.js"), "utf8");
const legacyFeatureModules = fs.readFileSync(path.join(extensionRoot, "src", "app", "legacy-feature-modules.js"), "utf8");
const content = fs.readFileSync(path.join(extensionRoot, "src", "content", "content.js"), "utf8");
const adapter = fs.readFileSync(path.join(extensionRoot, "src", "injected", "page_adapter.js"), "utf8");
const bridge = fs.readFileSync(path.join(repoRoot, "native-helper", "connector_bridge.js"), "utf8");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
const nativeHostBootstrap = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host_bootstrap.js"), "utf8");
const processLauncher = fs.readFileSync(path.join(repoRoot, "native-helper", "process_launcher.js"), "utf8");
const updateChecker = fs.readFileSync(path.join(repoRoot, "native-helper", "update_checker.js"), "utf8");
const updateInstaller = fs.readFileSync(path.join(repoRoot, "native-helper", "update_installer.js"), "utf8");
const platformIndex = fs.readFileSync(path.join(repoRoot, "native-helper", "platform", "index.js"), "utf8");
const windowsPlatform = fs.readFileSync(path.join(repoRoot, "native-helper", "platform", "windows.js"), "utf8");
const macosPlatform = fs.readFileSync(path.join(repoRoot, "native-helper", "platform", "macos.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const nativeInstaller = fs.readFileSync(path.join(repoRoot, "native-helper", "install_native_host.sh"), "utf8");
const windowsInstaller = fs.readFileSync(path.join(repoRoot, "release", "windows-x64", "install.ps1"), "utf8");
const macosLiteBuilder = fs.readFileSync(path.join(repoRoot, "release", "build_macos_arm64_lite_release.sh"), "utf8");
const declarationPrintScript = fs.readFileSync(path.join(repoRoot, "skills", "appraisal-declaration-print-format", "scripts", "adjust_appraisal_declaration_print.py"), "utf8");
const versionConfig = JSON.parse(fs.readFileSync(path.join(extensionRoot, "version.json"), "utf8"));
const pluginServer = fs.readFileSync(path.join(repoRoot, "plugins", "tianyuan-browser-connector", "runtime", "apps", "mcp", "server.mjs"), "utf8");
const pluginReadme = fs.readFileSync(path.join(repoRoot, "plugins", "tianyuan-browser-connector", "README.md"), "utf8");
const pluginManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "plugins", "tianyuan-browser-connector", ".codex-plugin", "plugin.json"), "utf8"));

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

const ids = [html, updatesTemplate, feedbackTemplate]
  .flatMap((source) => [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
assert.equal(new Set(ids).size, ids.length, "sidepanel HTML contains duplicate ids");
const referencedIds = [sidepanel, updatesModule, feedbackModule, moduleRegistry]
  .flatMap((source) =>
    [...source.matchAll(/(?:document|documentRef|context\.document)\.getElementById\("([^"]+)"\)/g)]
      .map((match) => match[1])
  );
for (const id of referencedIds) {
  assert.equal(ids.includes(id), true, `sidepanel references missing HTML id: ${id}`);
}

assert.equal(quotedConstant(content, "ADAPTER_VERSION"), quotedConstant(adapter, "ADAPTER_VERSION"));
assert.equal(quotedConstant(sidepanel, "EXPECTED_CONNECTOR_PROTOCOL_VERSION"), quotedConstant(bridge, "PROTOCOL_VERSION"));
assert.equal(quotedConstant(nativeHost, "CONNECTOR_PROTOCOL_VERSION"), quotedConstant(bridge, "PROTOCOL_VERSION"));
assert.equal(manifest.version, versionConfig.chromeVersion);
assert.equal(manifest.version_name, versionConfig.versionName);
assert.match(versionConfig.productVersion, /^\d+\.\d+\.\d+$/);
assert.equal(versionConfig.repository, "zer0-lyz/tianyuan-browser-workbench-releases");

assert.equal(pluginServer.includes(`version: "${pluginManifest.version}"`), true);
assert.equal(pluginReadme.includes(`版本 \`${pluginManifest.version}\``), true);
assert.equal(installer.includes('".codex-plugin", "plugin.json"'), true);

for (const resource of manifest.web_accessible_resources || []) {
  for (const match of resource.matches || []) {
    assert.match(match, /^(https?|file|\*):\/\/[^/]+\/.*$/);
    assert.equal(match.includes("/ty/**"), false, `invalid Chrome match pattern: ${match}`);
  }
}

assert.equal(installer.includes("sourceBuildDigest"), true);
assert.equal(installer.includes(".staging-"), true);
assert.equal(installer.includes("runtimeBuildId"), true);
assert.equal(installer.includes("unblockWindowsFile"), true);
assert.equal(installer.includes("WINDOWS_NATIVE_HOST_EXECUTION_BLOCKED"), true);
assert.equal(windowsInstaller.includes("function Unblock-WorkbenchPath"), true);
assert.equal(windowsInstaller.includes("Unblock-WorkbenchPath $RootDir"), true);
assert.equal(windowsInstaller.includes("Unblock-WorkbenchPath $NativeHelperDir"), true);
assert.equal(sidepanel.includes("x-tianyuan-runtime-build-id"), true);
assert.equal(sidepanel.includes('runtimeContractMissing ? "路径不正确"'), true);
assert.equal(sidepanel.includes("当前扩展加载路径不正确"), true);
assert.equal(sidepanel.includes('const MCP_CONNECT_URL = "https://mcp.zhrdc.net/connect?source=valuation"'), true);
assert.equal(sidepanel.includes("CLI_AUTH_URL"), false);
assert.equal(sidepanel.includes("authorizationUrl"), true);
assert.equal(sidepanel.includes("focusOrOpenCliAuthorizationPage"), true);
assert.equal(sidepanel.includes("copyCliAuthorizationLink"), true);
assert.equal(html.includes('id="cliAuthorizationFallback"'), true);
assert.equal(html.includes('id="cliAuthorizationLink"'), true);
assert.equal(html.includes('id="copyCliAuthorizationLink"'), true);
assert.equal(manifest.host_permissions.includes("https://mcp.zhrdc.net/*"), true);
assert.equal(sidepanel.includes("async function openConnectionPage(url, label)"), true);
assert.equal(sidepanel.includes("chrome.tabs.create({ url, active: true })"), true);
assert.equal(sidepanel.includes('on(elements.openMcpConnectPage, "click"'), true);
assert.equal(html.includes('id="openMcpConnectPage"'), true);
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
assert.equal(updatesTemplate.includes('id="checkForUpdates"'), true);
assert.equal(updatesTemplate.includes('id="testUpdate"'), true);
assert.equal(updatesTemplate.includes('id="installUpdate"'), true);
assert.equal(html.includes('<span id="moduleCountBadge" class="badge">8 个模块</span>'), true);
assert.equal(html.includes('id="openFeedbackTop"'), true);
assert.equal(html.includes('id="openUpdatesTop"'), true);
assert.equal(html.includes('id="openFeedback"'), false);
assert.equal(html.includes('id="openUpdates"'), false);
assert.equal(html.includes('<script type="module" src="./sidepanel.js"></script>'), true);
assert.equal(updatesModule.includes("check_github_update"), true);
assert.equal(updatesModule.includes("function safeReleaseUrl"), true);
assert.equal(updatesModule.includes('"gitee.com"'), true);
assert.equal(updatesModule.includes("test_workbench_update"), true);
assert.equal(updatesModule.includes("install_workbench_update"), true);
assert.equal(updatesModule.includes("get_workbench_update_status"), true);
assert.equal(updatesModule.includes("runtime.reload"), true);
assert.equal(updatesModule.includes("maybeAutoCheck"), true);
assert.equal(updatesModule.includes("cacheMatchesRuntime"), true);
assert.equal(sidepanel.includes("check_github_update"), false);
assert.equal(sidepanel.includes("function checkForUpdates"), false);
assert.equal(sidepanel.includes("moduleRegistry.register(updatesModule)"), true);
assert.equal(sidepanel.includes("moduleRegistry.register(feedbackModule)"), true);
assert.equal(updatesModule.includes('type: "utility"'), true);
assert.equal(feedbackModule.includes('type: "utility"'), true);
assert.equal(sidepanel.includes("function feedbackMarkdown"), false);
assert.equal(sidepanel.includes("function validateFeedbackDraft"), false);
assert.equal(feedbackModule.includes("getSafeDiagnostics"), true);
assert.equal(feedbackModule.includes("privacyConfirmed: true"), true);
assert.equal(feedbackModule.includes("projectId"), false);
assert.equal(feedbackModule.includes("companyId"), false);
assert.equal(feedbackModule.includes("subjectCode"), false);
assert.equal(feedbackConfig.deliveryMode, "service");
assert.equal(feedbackConfig.publicChannel, false);
assert.equal(feedbackConfig.endpoint, "https://feedback.zer0y.com/api/feedback");
assert.equal(manifest.host_permissions.includes("https://feedback.zer0y.com/*"), true);
assert.equal(moduleRegistry.includes("MODULE_ALREADY_REGISTERED"), true);
assert.equal(moduleRegistry.includes("module.activated"), true);
assert.equal(legacyFeatureModules.includes('id: "batch-save"'), true);
assert.equal(legacyFeatureModules.includes('id: "batch-cleanup"'), true);
assert.equal(nativeHost.includes('message?.action === "check_github_update"'), true);
assert.equal(nativeHost.includes('message?.action === "test_workbench_update"'), true);
assert.equal(nativeHost.includes('message?.action === "install_workbench_update"'), true);
assert.equal(nativeHost.includes('message?.action === "get_workbench_update_status"'), true);
assert.equal(nativeHost.includes('message?.action === "cli_login"'), true);
assert.equal(nativeHost.includes('message?.action === "cli_login_status"'), true);
assert.equal(nativeHost.includes('stdio: ["ignore", "pipe", "pipe"]'), true);
assert.equal(nativeHost.includes("CLI_AUTHORIZATION_URL_TIMEOUT"), true);
assert.equal(updateChecker.includes("api.github.com"), true);
assert.equal(updateChecker.includes("gitee.com"), true);
assert.equal(updateChecker.includes("DEFAULT_REPOSITORY"), true);
assert.equal(updateChecker.includes("tianyuan-browser-workbench-releases"), true);
assert.equal(updateChecker.includes("tokenUsed: false"), true);
assert.equal(macosLiteBuilder.includes("package_type=lite-update"), true);
assert.equal(macosLiteBuilder.includes("runtime/python-wheels"), true);
assert.equal(macosLiteBuilder.includes("tycpv-setup-0.1.0-macos-arm64.pkg"), false);
assert.equal(macosLiteBuilder.includes("python-3.14.6-macos11.pkg"), false);
assert.equal(updateInstaller.includes("UPDATE_SHA256_MISMATCH"), true);
assert.equal(updateInstaller.includes('phase: "test_complete"'), true);
assert.equal(updateInstaller.includes("UPDATE_DOWNLOAD_SIZE_MISMATCH"), true);
assert.equal(declarationPrintScript.includes("autoPageBreaks = False"), true);
assert.equal(declarationPrintScript.includes("fitToWidth = 1"), true);
assert.equal(declarationPrintScript.includes("fitToHeight = 0"), true);
assert.equal(updateInstaller.includes("tianyuan-browser-connector"), true);
assert.equal(installer.includes('copyFileAtomic(path.join(repoRoot, "native-helper", "native_host_bootstrap.js")'), true);
assert.equal(installer.includes('copyFileAtomic(path.join(repoRoot, "native-helper", "update_checker.js")'), true);
assert.equal(installer.includes('copyFileAtomic(path.join(repoRoot, "native-helper", "update_installer.js")'), true);
assert.equal(installer.includes('copyFileAtomic(path.join(repoRoot, "native-helper", "process_launcher.js")'), true);
assert.equal(installer.includes('"src/core/module-registry.js"'), true);
assert.equal(installer.includes('"src/modules/updates/template.js"'), true);
assert.equal(installer.includes('"feedback.json"'), true);
assert.equal(installer.includes('"src/modules/feedback/template.js"'), true);
assert.equal(installer.includes('entry.name === ".DS_Store"'), true);
assert.equal(nativeInstaller.includes("update_checker.js"), true);
assert.equal(nativeInstaller.includes("update_installer.js"), true);
assert.equal(nativeInstaller.includes("connector_bridge.js"), true);
assert.equal(nativeInstaller.includes("process_launcher.js"), true);
assert.equal(nativeInstaller.includes('cp -R "$ROOT_DIR/native-helper/platform"'), true);
assert.equal(windowsInstaller.includes("function Install-DirectoryAtomic"), true);
assert.equal(windowsInstaller.includes("function Stop-ExistingConnector"), true);
assert.equal(windowsInstaller.includes("install-local-runtime.mjs"), true);
assert.equal(windowsInstaller.includes("Restore-PreviousDirectory"), true);
assert.equal(windowsInstaller.includes("codexConnectorCachePath"), true);
assert.equal(windowsInstaller.includes("function Test-TycpvExecutableCandidate"), true);
assert.equal(windowsInstaller.includes("function Get-TycpvVersionInfo"), true);
assert.equal(windowsInstaller.includes('"tycpv.cmd"'), true);
assert.equal(windowsInstaller.includes('[IO.Path]::GetFileName($IconPath) -in @("tycpv.exe", "tycpv.cmd")'), true);
assert.equal(bridge.includes("EXTENSION_RUNTIME_BUILD_MISMATCH"), true);
assert.equal(nativeHost.includes("return connectorBridge.start({"), true);
assert.equal(nativeHost.includes("platformAdapter.chooseDirectory"), true);
assert.equal(nativeHost.includes("platformAdapter.listenerPids"), true);
assert.equal(nativeHost.includes('process.argv.includes("--start-connector")'), true);
assert.equal(nativeHost.includes("powershell.exe"), false);
assert.equal(nativeHost.includes("/usr/bin/osascript"), false);
assert.equal(nativeHost.includes("processLauncher.selfLaunchSpec"), true);
assert.equal(nativeHost.includes("processLauncher.commandLaunchSpec"), true);
assert.equal(nativeHostBootstrap.includes('runtimeRequire("./native_host.js")'), true);
assert.equal(installer.includes('const nativeHostExe = path.join(nativeRuntimeRoot, "native_host.exe")'), true);
assert.equal(installer.includes('path: manifestHostPath'), true);
assert.equal(installer.includes('copyFileAtomic(packagedNativeHostExe, path.join(nativeRuntimeRoot, "native_host.exe"))'), true);
assert.equal(installer.includes('const selfTestCommand = isWindows && fs.existsSync(path.join(nativeRuntimeRoot, "native_host.exe"))'), true);
assert.equal(windowsInstaller.includes('Native Host：$NativeHostLauncher'), true);
assert.equal(nativeHost.includes("const childArgs = IS_WINDOWS"), false);
assert.equal(nativeHost.includes("shell: true"), false);
assert.equal(processLauncher.includes("TIANYUAN_PROCESS_PAYLOAD"), true);
assert.equal(processLauncher.includes("normalizeRuntimeConfig"), true);
assert.equal(bridge.includes("platformAdapter.createCredentialReference"), true);
assert.equal(platformIndex.includes('platform === "win32"'), true);
assert.equal(platformIndex.includes('platform === "darwin"'), true);
assert.equal(windowsPlatform.includes("windows-dpapi"), true);
assert.equal(windowsPlatform.includes("AddSeconds(5)"), true);
assert.equal(windowsPlatform.includes("while ((Get-Date) -lt $Deadline"), true);
assert.equal(macosPlatform.includes("+ 5"), true);
assert.equal(nativeHost.includes('process.stdin.on("end"'), true);
assert.equal(windowsPlatform.includes('"tycpv.cmd"'), true);
assert.equal(macosPlatform.includes("macos-keychain"), true);
assert.equal(installer.includes('"--start-connector", "--force-restart"'), true);
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

for (const source of [
  content,
  adapter,
  sidepanel,
  updatesModule,
  updatesTemplate,
  feedbackModule,
  feedbackTemplate,
  moduleRegistry,
  legacyFeatureModules,
  bridge,
  nativeHost,
  processLauncher,
  updateInstaller,
  installer,
  windowsInstaller,
]) {
  assert.equal(source.includes("/Users/zer0y/Library/CloudStorage/OneDrive"), false, "runtime code points into OneDrive");
}

console.log("Static extension contract checks passed.");
