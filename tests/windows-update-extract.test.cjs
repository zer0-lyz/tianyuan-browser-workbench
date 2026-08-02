"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWindowsAdapter } = require("../native-helper/platform/windows.js");

function decodePowerShellScript(args) {
  const encoded = args[args.indexOf("-EncodedCommand") + 1];
  return Buffer.from(encoded, "base64").toString("utf16le");
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-windows-extract-"));
  let lastPowerShell = null;
  const adapter = createWindowsAdapter({
    platform: "win32",
    homeDir: root,
    env: {
      LOCALAPPDATA: path.join(root, "local-app-data"),
      TEMP: path.join(root, "temp"),
    },
    execFile: (file, args, options, callback) => {
      lastPowerShell = { file, args, options };
      callback(
        Object.assign(new Error("Command failed: powershell.exe -EncodedCommand [hidden]"), { code: 1 }),
        "",
        `TIANYUAN_UPDATE_ERROR:${JSON.stringify({
          ok: false,
          errorCode: "UPDATE_PATH_TOO_LONG",
          stage: "validating_zip",
          message: "更新包解压失败",
          reason: "entry=deep/file.xlsx|rootLength=80|targetLength=265",
          zipPath: "C:\\temp\\update.zip",
          destination: "C:\\TianyuanUpdate\\ab12cd34",
        })}`,
      );
    },
  });

  const stagingRoot = adapter.createUpdateStagingRoot({ mode: "test", shortId: "ab12cd34" });
  assert.equal(path.basename(stagingRoot), "ab12cd34");
  assert.equal(stagingRoot.includes("self-test-v"), false);
  assert.equal(fs.existsSync(stagingRoot), true);

  await assert.rejects(
    adapter.extractZip(path.join(root, "update.zip"), path.join(stagingRoot, "extracted")),
    (error) => {
      assert.equal(error.code, "UPDATE_PATH_TOO_LONG");
      assert.equal(error.stage, "validating_zip");
      assert.match(error.message, /UPDATE_PATH_TOO_LONG/);
      assert.match(error.message, /targetLength=265/);
      assert.doesNotMatch(error.message, /-EncodedCommand [A-Za-z0-9+/=]{20,}/);
      return true;
    },
  );
  assert.equal(lastPowerShell.file, "powershell.exe");
  const script = decodePowerShellScript(lastPowerShell.args);
  assert.match(script, /System\.IO\.Compression\.ZipFile/);
  assert.match(script, /UPDATE_ZIP_PATH_TRAVERSAL/);
  assert.match(script, /UPDATE_PATH_TOO_LONG/);
  assert.match(script, /Expand-Archive/);
  assert.equal(lastPowerShell.options.env.TIANYUAN_UPDATE_ZIP_PATH.endsWith("update.zip"), true);

  let traversalAdapter = createWindowsAdapter({
    platform: "win32",
    homeDir: root,
    env: { LOCALAPPDATA: path.join(root, "local-app-data") },
    execFile: (_file, _args, _options, callback) => callback(
      Object.assign(new Error("Command failed"), { code: 1 }),
      "",
      `TIANYUAN_UPDATE_ERROR:${JSON.stringify({
        ok: false,
        errorCode: "UPDATE_ZIP_PATH_TRAVERSAL",
        stage: "validating_zip",
        reason: "../evil.txt",
      })}`,
    ),
  });
  await assert.rejects(
    traversalAdapter.extractZip("C:\\temp\\unsafe.zip", path.join(root, "extract")),
    (error) => error.code === "UPDATE_ZIP_PATH_TRAVERSAL",
  );

  fs.rmSync(root, { recursive: true, force: true });
  console.log("Windows update extraction tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
