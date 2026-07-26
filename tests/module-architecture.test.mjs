import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legacyFeatureModules } from "../extension/src/app/legacy-feature-modules.js";
import { EventBus } from "../extension/src/core/event-bus.js";
import { ModuleRegistry } from "../extension/src/core/module-registry.js";
import { ModuleScope } from "../extension/src/core/module-scope.js";
import { ModuleStorage } from "../extension/src/core/module-storage.js";
import { updatesModule } from "../extension/src/modules/updates/module.js";
import { feedbackModule } from "../extension/src/modules/feedback/module.js";

const definitions = [...legacyFeatureModules, updatesModule, feedbackModule];
assert.equal(definitions.length, 10);
assert.equal(definitions.filter((item) => item.manifest.type === "feature").length, 8);
assert.equal(definitions.filter((item) => item.manifest.type === "utility").length, 2);
assert.equal(new Set(definitions.map((item) => item.manifest.id)).size, definitions.length);
assert.equal(new Set(definitions.map((item) => item.manifest.route)).size, definitions.length);
for (const definition of definitions) {
  assert.match(definition.manifest.id, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(definition.manifest.displayName);
  assert.ok(definition.manifest.messageNamespace.startsWith(definition.manifest.id));
  assert.ok(definition.manifest.entryElementId);
  assert.ok(definition.manifest.pageElementId);
}

const cleanupOrder = [];
const scope = new ModuleScope();
scope.add(() => cleanupOrder.push("first"));
scope.add(() => cleanupOrder.push("second"));
scope.dispose();
assert.deepEqual(cleanupOrder, ["second", "first"]);

const published = [];
const eventBus = new EventBus();
const unsubscribe = eventBus.subscribe("test.event", (payload) => published.push(payload));
eventBus.publish("test.event", { ok: true });
unsubscribe();
eventBus.publish("test.event", { ok: false });
assert.deepEqual(published, [{ ok: true }]);

const storageValues = {};
const chromeApi = {
  storage: {
    local: {
      get(keys, callback) {
        callback(Object.fromEntries(keys.map((key) => [key, storageValues[key]])));
      },
      set(values, callback) {
        Object.assign(storageValues, values);
        callback();
      },
      remove(keys, callback) {
        for (const key of keys) delete storageValues[key];
        callback();
      },
    },
  },
};
const moduleStorage = new ModuleStorage(chromeApi, "test-feature", 2);
await moduleStorage.save({ selected: [1, 2] });
assert.equal(moduleStorage.key, "tianyuanWorkbenchModule:test-feature:v2");
assert.deepEqual(await moduleStorage.load(), { selected: [1, 2] });

const lifecycle = [];
const fakeElements = new Map();
function fakeElement(id) {
  if (!fakeElements.has(id)) {
    fakeElements.set(id, {
      id,
      dataset: {},
      textContent: "",
      classList: { toggle() {} },
      toggleAttribute() {},
    });
  }
  return fakeElements.get(id);
}
const registry = new ModuleRegistry({
  featureFlags: {
    async load() {},
    isEnabled() { return true; },
  },
  eventBus: new EventBus(),
  storageFactory: () => ({}),
  documentRef: { getElementById: fakeElement },
});
for (const id of ["one", "two"]) {
  registry.register({
    manifest: {
      id,
      route: id,
      displayName: id,
      messageNamespace: id,
      type: "feature",
      entryElementId: `${id}-entry`,
      pageElementId: `${id}-page`,
    },
    create() {
      return {
        initialize() { lifecycle.push(`${id}:initialize`); },
        activate() { lifecycle.push(`${id}:activate`); },
        deactivate() { lifecycle.push(`${id}:deactivate`); },
      };
    },
  });
}
await registry.initialize({});
await registry.activateRoute("one");
await registry.activateRoute("two");
assert.deepEqual(lifecycle, [
  "one:initialize",
  "two:initialize",
  "one:activate",
  "one:deactivate",
  "two:activate",
]);
assert.equal(fakeElement("moduleCountBadge").textContent, "2 个模块");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesRoot = path.join(repoRoot, "extension", "src", "modules");
for (const moduleDir of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
  if (!moduleDir.isDirectory()) continue;
  const sourcePath = path.join(modulesRoot, moduleDir.name, "module.js");
  if (!fs.existsSync(sourcePath)) continue;
  const source = fs.readFileSync(sourcePath, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value.includes("/modules/"));
  for (const value of imports) {
    assert.equal(
      value.includes(`/modules/${moduleDir.name}/`),
      true,
      `${moduleDir.name} imports another module internals`,
    );
  }
}

console.log("Module architecture tests passed.");
