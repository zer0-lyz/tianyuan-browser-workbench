"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativeHost = path.join(repoRoot, "native-helper", "native_host.js");

function readNativeMessage(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("NATIVE_HOST_PROTOCOL_TIMEOUT"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      clearTimeout(timer);
      resolve(JSON.parse(buffer.slice(4, 4 + length).toString("utf8")));
      child.kill("SIGTERM");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function run() {
  const child = spawn(process.execPath, [nativeHost], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TIANYUAN_UPDATE_MANIFEST_URLS: "" },
  });
  const payload = Buffer.from(JSON.stringify({ action: "get_workbench_update_status" }), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  child.stdin.end(Buffer.concat([header, payload]));

  const response = await readNativeMessage(child);
  assert.equal(typeof response, "object");
  assert.equal(response.security?.credentialsReturned, false);
  console.log("Native host lifecycle test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
