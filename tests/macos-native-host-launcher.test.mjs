import assert from "node:assert/strict";

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

console.log("macOS Native Host launcher quoting checks passed.");
