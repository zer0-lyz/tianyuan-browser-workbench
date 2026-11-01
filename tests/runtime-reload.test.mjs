import assert from "node:assert/strict";
import test from "node:test";
import { shouldReloadExtensionForRuntime } from "../extension/src/core/runtime-reload.mjs";

const protocol = {
  protocolVersion: "connector-agent-binding-v3",
  runtimeCompatibility: {
    extensionVersion: "0.14.32",
    runtimeBuildId: "build-new",
  },
};
const runtimeContract = {
  extensionVersion: "0.14.32",
  bridgeProtocol: "connector-agent-binding-v3",
  runtimeBuildId: "build-new",
};

test("auto-reload only runs when installed files match Bridge and loaded build is stale", () => {
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId: "build-old" }), true);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId: "" }), true);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId: "build-new" }), false);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId: "", attemptedRuntimeBuildId: "build-new" }), false);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId: "build-old", attemptedRuntimeBuildId: "build-new" }), false);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract: { ...runtimeContract, runtimeBuildId: "build-other" }, protocol, activeRuntimeBuildId: "build-old" }), false);
  assert.equal(shouldReloadExtensionForRuntime({ runtimeContract, protocol: { ...protocol, runtimeCompatibility: { ...protocol.runtimeCompatibility, extensionVersion: "0.14.31" } }, activeRuntimeBuildId: "build-old" }), false);
});
