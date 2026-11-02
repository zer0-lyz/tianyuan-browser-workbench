import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyDir, copyFileAtomic } from "../scripts/install-local-runtime.mjs";
import { computeRuntimeBuildId } from "../scripts/runtime-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("isolated runtime copies preserve the complete fingerprint and expose only report inspection", async () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-report-runtime-"));
  let server;
  try {
    for (const name of ["extension", "native-helper", "plugins/tianyuan-browser-connector", "skills/depreciation-capex-forecast", "skills/table-format"]) {
      copyDir(path.join(root, name), path.join(stage, name), name === "extension" ? ["src/injected/report_adapter.js"] : []);
    }
    for (const name of ["scripts/install-local-runtime.mjs", "scripts/runtime-fingerprint.mjs"]) {
      copyFileAtomic(path.join(root, name), path.join(stage, name));
    }
    assert.equal(computeRuntimeBuildId(stage), computeRuntimeBuildId(root));
    const manifest = JSON.parse(fs.readFileSync(path.join(stage, "extension/manifest.json"), "utf8"));
    assert.ok(manifest.web_accessible_resources[0].resources.includes("src/injected/report_adapter.js"));
    const client = await import(pathToFileURL(path.join(stage, "plugins/tianyuan-browser-connector/runtime/apps/shared/client.mjs")).href);
    assert.deepEqual(client.tools.filter((tool) => tool.name.startsWith("tianyuan.report_")).map((tool) => tool.name), [
      "tianyuan.report_inspect",
      "tianyuan.report_capabilities",
      "tianyuan.report_navigate",
      "tianyuan.report_node_read",
      "tianyuan.report_preview",
      "tianyuan.report_execute",
      "tianyuan.report_save",
      "tianyuan.report_editor",
      "tianyuan.report_reload",
      "tianyuan.report_readback",
    ]);
    const preview = client.tools.find((tool) => tool.name === "tianyuan.report_preview");
    const settingsWrite = preview.inputSchema.properties.ops.items.oneOf.find((operation) => operation.properties.kind.const === "settings_write");
    assert.equal(settingsWrite.properties.fields.maxItems, 1);
    assert.equal(settingsWrite.properties.fields.items.properties.label.const, "是否编号");
    assert.equal(settingsWrite.properties.fields.items.properties.value.const, "是");
    for (const operation of preview.inputSchema.properties.ops.items.oneOf) {
      assert.ok(operation.properties.nodeRef.required.includes("candidateId"));
    }
    const nodeRead = client.tools.find((tool) => tool.name === "tianyuan.report_node_read");
    assert.equal(nodeRead.inputSchema.properties.nodeRef.required.includes("candidateId"), false);
    const require = createRequire(import.meta.url);
    const { createBridge } = require(path.join(stage, "native-helper/connector_bridge.js"));
    const bridge = createBridge({ bindingsPath: path.join(stage, "test-bindings.json"), sourcesPath: path.join(stage, "test-sources.json"), configDir: path.join(stage, "test-config"), compatibilityPath: path.join(stage, "test-compat.json") });
    server = http.createServer((request, response) => bridge.handle(request, response));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/protocol`);
    const protocol = await response.json();
    assert.equal(protocol.safety.arbitraryJavaScript, false);
    assert.equal(protocol.safety.genericBrowserAutomation, false);
    assert.equal(protocol.capabilities.reportAuthoring, undefined);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(stage, { recursive: true, force: true });
  }
});
