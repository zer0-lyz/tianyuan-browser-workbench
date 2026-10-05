import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { landPublicityModule } from "../toolbox-extension/src/modules/land-publicity/module.js";
import { alibabaAuctionModule } from "../toolbox-extension/src/modules/alibaba-auction/module.js";
import { alibabaLeaseModule } from "../toolbox-extension/src/modules/alibaba-lease/module.js";
import { anjukePropertyModule } from "../toolbox-extension/src/modules/anjuke-property/module.js";
import { tableFormatModule } from "../toolbox-extension/src/modules/table-format/module.js";
import { mapSettingsModule } from "../toolbox-extension/src/modules/map-settings/module.js";
import { updatesModule } from "../toolbox-extension/src/modules/updates/module.js";
import { depreciationCapexModule } from "../toolbox-extension/src/modules/depreciation-capex-forecast/module.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolboxRoot = path.join(repoRoot, "toolbox-extension");
const EXPECTED_EXTENSION_ID = "aamfmhcbjgofhmannejoiilkkpchfkgm";

const definitions = [
  landPublicityModule,
  alibabaAuctionModule,
  alibabaLeaseModule,
  anjukePropertyModule,
  tableFormatModule,
  mapSettingsModule,
  updatesModule,
  depreciationCapexModule,
];

test("toolbox manifest pins the expected stable extension id", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(toolboxRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "评估工具箱");
  assert.ok(manifest.key, "manifest key required for stable extension id");
  const der = Buffer.from(manifest.key, "base64");
  const digest = createHash("sha256").update(der).digest("hex").slice(0, 32);
  const extensionId = [...digest]
    .map((ch) => String.fromCharCode("a".charCodeAt(0) + Number.parseInt(ch, 16)))
    .join("");
  assert.equal(extensionId, EXPECTED_EXTENSION_ID);
  assert.deepEqual(manifest.permissions, [
    "activeTab", "nativeMessaging", "sidePanel", "scripting", "storage", "tabs",
  ]);
  for (const pattern of ["*.taobao.com", "*.alicdn.com", "*.alibaba-inc.com", "*.anjuke.com"]) {
    assert.ok(
      manifest.host_permissions.some((item) => item.includes(pattern)),
      `host_permissions missing ${pattern}`,
    );
  }
  assert.equal(manifest.side_panel.default_path, "src/shell/index.html");
});

test("toolbox keeps the decoupled feature modules", () => {
  assert.equal(definitions.length, 8);
  assert.equal(new Set(definitions.map((item) => item.manifest.id)).size, 8);
  assert.equal(new Set(definitions.map((item) => item.manifest.route)).size, 8);
  for (const definition of definitions) {
    assert.equal(definition.manifest.stage, "stable", `${definition.manifest.id} must ship enabled`);
    assert.ok(definition.manifest.messageNamespace.startsWith(definition.manifest.id));
    assert.ok(definition.manifest.entryElementId);
    assert.ok(definition.manifest.pageElementId);
  }
});

test("toolbox shell hosts every module entry and page element", () => {
  const html = fs.readFileSync(path.join(toolboxRoot, "src/shell/index.html"), "utf8");
  const shell = fs.readFileSync(path.join(toolboxRoot, "src/shell/shell.js"), "utf8");
  for (const definition of definitions) {
    assert.ok(html.includes(`id="${definition.manifest.entryElementId}"`),
      `shell home missing card ${definition.manifest.entryElementId}`);
    assert.ok(html.includes(`id="${definition.manifest.pageElementId}"`),
      `shell missing page ${definition.manifest.pageElementId}`);
    assert.ok(shell.includes(`modules/${definition.manifest.id}/module.js`),
      `shell not registering ${definition.manifest.id}`);
  }
  // 外壳不得接入天源页面绑定/连接诊断接线；updates 需要的 setConnection 只是判空桩。
  for (const forbidden of [
    "zhrdc",
    "checkConnections",
    "checkLocalConnections",
    "openConnections",
    "getRuntimeMcpToken",
    "setConnection(",
  ]) {
    assert.ok(!shell.includes(forbidden), `shell must not reference ${forbidden}`);
  }
});

test("toolbox modules keep the boundary rules and never import each other", () => {
  const moduleIds = new Set(definitions.map((item) => item.manifest.id));
  for (const definition of definitions) {
    const dir = path.join(toolboxRoot, "src/modules", definition.manifest.id);
    for (const entry of fs.readdirSync(dir, { recursive: true })) {
      if (!String(entry).endsWith(".js")) continue;
      const source = fs.readFileSync(path.join(dir, entry), "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      for (const spec of imports) {
        if (spec.startsWith(`../modules/`)) {
          const target = spec.split("/")[2];
          assert.ok(!moduleIds.has(target) || target === definition.manifest.id,
            `${definition.manifest.id} must not import module ${target}`);
        }
        assert.ok(!spec.includes("sidepanel"), `${definition.manifest.id} must not import sidepanel internals`);
      }
    }
  }
});

test("toolbox core uses its own storage namespace", () => {
  const flags = fs.readFileSync(path.join(toolboxRoot, "src/core/feature-flags.js"), "utf8");
  const storage = fs.readFileSync(path.join(toolboxRoot, "src/core/module-storage.js"), "utf8");
  assert.match(flags, /appraisalToolboxFeatureFlags/);
  assert.match(storage, /appraisalToolboxModule:/);
  assert.ok(!flags.includes("tianyuanWorkbench"));
  assert.ok(!storage.includes("tianyuanWorkbench"));
});

test("native host installers whitelist the toolbox extension id", () => {
  const installer = fs.readFileSync(
    path.join(repoRoot, "native-helper/install_native_host.sh"), "utf8");
  const runtime = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
  assert.match(installer, new RegExp(EXPECTED_EXTENSION_ID));
  assert.match(installer, /TOOLBOX_EXTENSION_ID/);
  assert.match(runtime, new RegExp(EXPECTED_EXTENSION_ID));
});

test("toolbox updates module uses its own feed and never installs in place", () => {
  const source = fs.readFileSync(path.join(toolboxRoot, "src/modules/updates/module.js"), "utf8");
  assert.match(source, /updateManifestUrls: TOOLBOX_UPDATE_MANIFEST_URLS/);
  assert.match(source, /toolbox-update-manifest\.json/);
  assert.match(source, /PAGE_INSTALL_SUPPORTED = false/);
  // 守卫必须在任何 install/test 请求发出之前返回（文件内函数顺序：test → waitFor → install）
  const testFn = source.slice(
    source.indexOf("async function testUpdateModule"),
    source.indexOf("async function waitForInstallComplete"),
  );
  assert.ok(
    testFn.indexOf("PAGE_INSTALL_SUPPORTED") < testFn.indexOf("test_workbench_update"),
    "test guard must precede native test call",
  );
  const installFn = source.slice(
    source.indexOf("async function installCompleteUpdate"),
    source.indexOf("async function openUrl"),
  );
  assert.ok(
    installFn.indexOf("PAGE_INSTALL_SUPPORTED") < installFn.indexOf("install_workbench_update"),
    "install guard must precede native install call",
  );
  const version = JSON.parse(fs.readFileSync(path.join(toolboxRoot, "version.json"), "utf8"));
  assert.equal(version.productVersion, "0.1.0");
  assert.equal(version.bridgeProtocol, "connector-agent-binding-v3");
  const compat = JSON.parse(fs.readFileSync(path.join(toolboxRoot, "runtime-compat.json"), "utf8"));
  assert.equal(compat.extensionVersion, "0.1.0");
  const shell = fs.readFileSync(path.join(toolboxRoot, "src/shell/shell.js"), "utf8");
  assert.match(shell, /isBusy: \(\) => false/);
  assert.match(shell, /setConnection/);
  assert.match(shell, /connectorProtocolVersion: CONNECTOR_PROTOCOL_VERSION/);
});

test("toolbox module pages and assets ship with the package", () => {
  for (const relative of [
    "src/styles/shell.css",
    "src/data/china-regions.js",
    "src/modules/depreciation-capex-forecast/input.html",
    "src/modules/depreciation-capex-forecast/results.html",
    "src/modules/depreciation-capex-forecast/details.html",
    "src/modules/depreciation-capex-forecast/assets/折旧摊销预测输入模板.xlsx",
  ]) {
    assert.ok(fs.existsSync(path.join(toolboxRoot, relative)), `missing ${relative}`);
  }
  const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
  assert.match(gitignore, /toolbox-extension\/\.keys\//);
});
