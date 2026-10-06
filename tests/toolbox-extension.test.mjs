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
  const template = fs.readFileSync(path.join(toolboxRoot, "src/modules/updates/template.js"), "utf8");
  assert.match(source, /updateManifestUrls: TOOLBOX_UPDATE_MANIFEST_URLS/);
  assert.match(source, /repository: TOOLBOX_UPDATE_REPOSITORY/);
  assert.match(source, /appraisal-toolbox-releases/);
  // 页内安装/自测动作彻底移除：不得出现主工作台安装 action 或对应 UI 文案。
  for (const forbidden of [
    "install_workbench_update",
    "test_workbench_update",
    "PAGE_INSTALL_SUPPORTED",
    "更新全部组件",
    "测试更新模块",
    "天源浏览器工作台",
    "Bridge",
    "Connector",
    "Agent 插件缓存",
    "MCP token",
    "GitHub Release",
  ]) {
    assert.ok(!source.includes(forbidden), `updates module must not contain ${forbidden}`);
    assert.ok(!template.includes(forbidden), `updates template must not contain ${forbidden}`);
  }
  assert.match(source, /product: "评估工具箱"/);
  assert.match(template, /打开发布页/);
  assert.match(template, /评估工具箱专属发布源/);
  // 无正式 Release 时显示“尚未发布”而非检查失败。
  assert.match(source, /尚未发布/);
  const version = JSON.parse(fs.readFileSync(path.join(toolboxRoot, "version.json"), "utf8"));
  assert.equal(version.productVersion, "0.1.0");
  assert.equal(version.bridgeProtocol, "connector-agent-binding-v3");
  const compat = JSON.parse(fs.readFileSync(path.join(toolboxRoot, "runtime-compat.json"), "utf8"));
  assert.equal(compat.extensionVersion, "0.1.0");
  const shell = fs.readFileSync(path.join(toolboxRoot, "src/shell/shell.js"), "utf8");
  assert.match(shell, /isBusy: \(\) => false/);
  assert.match(shell, /setConnection/);
  assert.match(shell, /connectorProtocolVersion: CONNECTOR_PROTOCOL_VERSION/);
  // 主工作台的更新行为不受影响：extension 侧仍保留页内安装能力。
  const workbenchUpdates = fs.readFileSync(
    path.join(repoRoot, "extension/src/modules/updates/module.js"), "utf8");
  assert.match(workbenchUpdates, /install_workbench_update/);
  assert.match(workbenchUpdates, /更新全部组件/);
});

test("toolbox home groups six business tools and two auxiliary entries", () => {
  const html = fs.readFileSync(path.join(toolboxRoot, "src/shell/index.html"), "utf8");
  const cards = [...html.matchAll(/id="open([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.equal(cards.length, 8);
  const registry = fs.readFileSync(path.join(toolboxRoot, "src/core/module-registry.js"), "utf8");
  assert.match(registry, /个业务工具/);
  // 地图配置与版本更新不计入业务工具徽标 → 徽标数 = 6。
  const notCounted = ["updates", "map-settings"];
  for (const id of notCounted) {
    const source = fs.readFileSync(
      path.join(toolboxRoot, `src/modules/${id}/module.js`), "utf8");
    assert.match(source, /countInModuleBadge: false/, `${id} must not count into business badge`);
  }
  const counted = definitions.filter((item) => item.manifest.countInModuleBadge !== false);
  assert.equal(counted.length, 6);
  // 分组：业务工具区块包含 6 张卡片，辅助配置区块包含 2 张。
  const businessSection = html.slice(html.indexOf("moduleSectionTitle"), html.indexOf("moduleSectionUtilityTitle"));
  const utilitySection = html.slice(html.indexOf("moduleSectionUtilityTitle"));
  const businessCards = [...businessSection.matchAll(/id="open[A-Za-z]+"/g)].length;
  const utilityCards = [...utilitySection.matchAll(/id="open[A-Za-z]+"/g)].length;
  assert.equal(businessCards, 6);
  assert.equal(utilityCards, 2);
  // 警告三角形图标不得再出现在首页图标中。
  assert.ok(!html.includes("8.25 14.25"), "warning triangle path must be gone");
  // 土地卡片带健康状态标记（由真实请求结果驱动）。
  assert.match(html, /id="landPublicityHealth" hidden/);
});

test("table-format and anjuke gate their primary actions on preconditions", () => {
  for (const [id, buttonId, gateId] of [
    ["table-format", "runTableFormat", "tableFormatGate"],
    ["anjuke-property", "runAnjukeProperty", "anjukePropertyGate"],
  ]) {
    const source = fs.readFileSync(
      path.join(toolboxRoot, `src/modules/${id}/module.js`), "utf8");
    const template = fs.readFileSync(
      path.join(toolboxRoot, `src/modules/${id}/template.js`), "utf8");
    assert.match(source, new RegExp(`renderRunGate`), `${id} must implement run gate`);
    assert.match(template, new RegExp(`id="${gateId}"`), `${id} template must carry gate reason`);
    assert.match(template, new RegExp(`id="${buttonId}"`));
  }
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
