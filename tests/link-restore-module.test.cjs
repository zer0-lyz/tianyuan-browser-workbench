"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("asset-link-restore skill package is integrated", () => {
  for (const relative of [
    "skills/asset-link-restore/SKILL.md",
    "skills/asset-link-restore/scripts/restore_links.py",
    "skills/asset-link-restore/scripts/audit_restore.py",
    "skills/asset-link-restore/scripts/verify_formulas.py",
    "skills/asset-link-restore/references/structure.md",
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, relative)), `missing ${relative}`);
  }
  const restoreSource = fs.readFileSync(
    path.join(repoRoot, "skills/asset-link-restore/scripts/restore_links.py"),
    "utf8",
  );
  assert.match(restoreSource, /_链接恢复\.xlsx/);
  assert.match(restoreSource, /_链接恢复对比报告\.xlsx/);
});

test("native host exposes run_link_restore wiring", () => {
  const source = fs.readFileSync(path.join(repoRoot, "native-helper/native_host.js"), "utf8");
  assert.match(source, /const LINK_RESTORE_SCRIPT = path\.join\(/);
  assert.match(source, /function uniqueLinkRestoreTarget\(/);
  assert.match(source, /async function runLinkRestore\(message, emit\)/);
  assert.match(source, /message\?\.action === "run_link_restore"/);
  assert.match(source, /linkRestore: fs\.existsSync\(LINK_RESTORE_SCRIPT\)/);
  assert.match(source, /-链接恢复\$\{extension\}/);
  assert.match(source, /_链接恢复\$\{path\.extname\(tempInput\)\}/);
});

test("installers and local runtime copy asset-link-restore skill", () => {
  const installSh = fs.readFileSync(path.join(repoRoot, "native-helper/install_native_host.sh"), "utf8");
  assert.match(installSh, /asset-link-restore\/scripts/);
  assert.match(installSh, /restore_links\.py/);
  const runtime = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
  assert.match(runtime, /"asset-link-restore"/);
});

test("sidepanel includes link restore page and wiring", () => {
  const html = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/index.html"), "utf8");
  assert.match(html, /id="openLinkRestore"/);
  assert.match(html, /id="page-link-restore"/);
  assert.match(html, /data-route="link-restore"/);
  for (const id of [
    "chooseLinkRestoreFiles",
    "chooseLinkRestoreFolder",
    "linkRestoreInputSummary",
    "linkRestoreOutputMode",
    "linkRestoreOutputPath",
    "linkRestoreProgressBar",
    "runLinkRestore",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  const sidepanel = fs.readFileSync(path.join(repoRoot, "extension/src/sidepanel/sidepanel.js"), "utf8");
  assert.match(sidepanel, /openLinkRestore: document\.getElementById\("openLinkRestore"\)/);
  assert.match(sidepanel, /link: \{ inputPaths: \[\] \}/);
  assert.match(sidepanel, /formatType === "link"/);
  assert.match(sidepanel, /"run_link_restore"/);
  assert.match(sidepanel, /"batch_link_restore"/);
  assert.match(sidepanel, /chooseLinkRestoreFiles, "click"/);
  assert.match(sidepanel, /runLinkRestore, "click"/);

  const legacyModules = fs.readFileSync(
    path.join(repoRoot, "extension/src/app/legacy-feature-modules.js"),
    "utf8",
  );
  assert.match(legacyModules, /route: "link-restore"/);
  assert.match(legacyModules, /entryElementId: "openLinkRestore"/);
  assert.match(legacyModules, /pageElementId: "page-link-restore"/);
});
