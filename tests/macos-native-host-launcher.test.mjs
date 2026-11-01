import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMacNativeHostLauncher } from "../scripts/install-local-runtime.mjs";

const installRoot = "/Users/example/Tianyuan $project's folder";
const nativeRuntimeRoot = `${installRoot}/workbench-runtime/native-helper`;
const logPath = `${nativeRuntimeRoot}/native_host.log`;
const runtimeConfigPath = `${nativeRuntimeRoot}/runtime-config.json`;
const pythonBin = `${installRoot}/workbench-runtime/python/bin/python3`;
const printSkillsRoot = `${installRoot}/workbench-runtime/print-format-skills`;
const nodeBin = `${nativeRuntimeRoot}/node's runtime/bin/node`;

const launcher = buildMacNativeHostLauncher({
  logPath,
  runtimeConfigPath,
  pythonBin,
  printSkillsRoot,
  nodeBin,
  nativeRuntimeRoot,
});
const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;

assert.ok(launcher.includes(`>> ${quote(logPath)}`), "log path must be a shell literal");
assert.ok(
  launcher.includes(`export TIANYUAN_RUNTIME_CONFIG_PATH=${quote(runtimeConfigPath)}`),
  "runtime config path must be a shell literal",
);
assert.ok(
  launcher.includes(`export TIANYUAN_PYTHON_BIN=${quote(pythonBin)}`),
  "configured Python path must be a shell literal",
);
assert.ok(
  launcher.includes(`export TIANYUAN_PRINT_SKILLS_DIR=${quote(printSkillsRoot)}`),
  "skills path must be a shell literal",
);
assert.ok(
  launcher.includes(`exec ${quote(nodeBin)} ${quote(`${nativeRuntimeRoot}/native_host.js`)} 2>> ${quote(logPath)}`),
  "Node and Native Host paths must be separate shell literals",
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compatibilityInstaller = fs.readFileSync(path.join(repoRoot, "native-helper", "install_native_host.sh"), "utf8");
const packagedInstaller = path.join(repoRoot, "release", "macos-arm64", "安装.command");
assert.match(compatibilityInstaller, /PACKAGE_INSTALLER="\$PACKAGE_ROOT\/安装\.command"/);
assert.match(compatibilityInstaller, /exec \/bin\/bash "\$PACKAGE_INSTALLER" "\$@"/);
assert.equal(fs.existsSync(packagedInstaller), true, "the delegated installer source must exist");
for (const buildScriptName of ["build_macos_arm64_release.sh", "build_macos_arm64_lite_release.sh"]) {
  const buildScript = fs.readFileSync(path.join(repoRoot, "release", buildScriptName), "utf8");
  assert.ok(
    buildScript.includes('cp "$ROOT_DIR/release/macos-arm64/安装.command" "$STAGE/安装.command"'),
    buildScriptName + " must place the delegate target at the package root",
  );
}

console.log("macOS Native Host launcher quoting checks passed.");
