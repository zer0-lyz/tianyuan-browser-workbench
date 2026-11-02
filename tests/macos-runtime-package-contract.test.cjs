"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fullBuilder = fs.readFileSync(path.join(repoRoot, "release/build_macos_arm64_release.sh"), "utf8");
const liteBuilder = fs.readFileSync(path.join(repoRoot, "release/build_macos_arm64_lite_release.sh"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "release/macos-arm64/安装.command"), "utf8");
const runtimeInstaller = fs.readFileSync(path.join(repoRoot, "scripts/install-local-runtime.mjs"), "utf8");
const builders = [fullBuilder, liteBuilder];
const runtimeWheels = [
  ["requests==2.32.5", "requests-2.32.5-py3-none-any.whl"],
  ["urllib3==2.6.3", "urllib3-2.6.3-py3-none-any.whl"],
  ["certifi==2026.10.23", "certifi-2026.10.23-py3-none-any.whl"],
  ["charset-normalizer==3.5.2", "charset_normalizer-3.5.2-py3-none-any.whl"],
  ["idna==3.20", "idna-3.20-py3-none-any.whl"],
];

for (const [index, builder] of builders.entries()) {
  const label = index === 0 ? "full" : "lite";
  assert.ok(builder.includes('/usr/bin/ditto "$ROOT_DIR/extension" "$STAGE/extension"'), `${label} package must copy the complete extension tree`);
  assert.ok(builder.includes('/usr/bin/ditto "$ROOT_DIR/native-helper" "$STAGE/native-helper"'), `${label} package must copy the complete Native Helper tree`);
  for (const flag of ["--platform any", "--implementation py", "--abi none", "--python-version 39", "--no-deps"]) {
    assert.ok(builder.includes(flag), `${label} package must force Python-3 universal wheels`);
  }
  for (const [pin, wheelGlob] of runtimeWheels) {
    assert.ok(builder.includes(`"${pin}"`), `${label} package must download ${pin}`);
    assert.ok(builder.includes(`"$WHEEL_CACHE"/${wheelGlob}`), `${label} package must include ${wheelGlob}`);
  }
}

const runtimeImport = "import requests, urllib3, certifi, charset_normalizer, idna, docx, et_xmlfile, lxml, openpyxl, typing_extensions";
assert.ok(runtimeImport.includes("import requests"));
assert.ok(installer.includes(runtimeImport), "Mac installer must install-check every runtime import");
assert.ok(runtimeInstaller.includes(runtimeImport), "local runtime importer must require the same dependencies");
for (const [pin] of runtimeWheels) {
  assert.ok(installer.includes(`"${pin}"`), `Mac installer must install ${pin} from bundled wheels`);
}

const settingsRoot = path.join(repoRoot, "extension/src/modules/map-settings");
for (const name of ["module.js", "styles.css", "template.js"]) {
  assert.equal(fs.existsSync(path.join(settingsRoot, name)), true, `missing Workbench map-settings file: ${name}`);
}

console.log("macOS runtime package contract tests passed.");
