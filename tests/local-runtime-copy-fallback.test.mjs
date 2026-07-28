import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyDir,
  copyFileAtomic,
  directoryTreeSnapshot,
} from "../scripts/install-local-runtime.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-copy-fallback-"));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(tempRoot, "source");
const destination = path.join(tempRoot, "destination");
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(destination, { recursive: true });
fs.mkdirSync(path.join(source, "nested", "empty"), { recursive: true });
fs.writeFileSync(path.join(source, "new.txt"), "new");
fs.writeFileSync(path.join(source, "nested", "child.txt"), "child");
fs.writeFileSync(path.join(destination, "old.txt"), "old");

const originalRenameSync = fs.renameSync;
let injectedRenameFailure = false;
fs.renameSync = (from, to) => {
  if (!injectedRenameFailure && from.includes(".staging-") && to === destination) {
    injectedRenameFailure = true;
    const error = new Error("simulated staging rename disappearance");
    error.code = "ENOENT";
    throw error;
  }
  return originalRenameSync(from, to);
};
try {
  copyDir(source, destination, ["new.txt"]);
} finally {
  fs.renameSync = originalRenameSync;
}

assert.equal(injectedRenameFailure, true);
assert.equal(fs.readFileSync(path.join(destination, "new.txt"), "utf8"), "new");
assert.equal(fs.readFileSync(path.join(destination, "nested", "child.txt"), "utf8"), "child");
assert.equal(fs.existsSync(path.join(destination, "old.txt")), false);
assert.deepEqual(directoryTreeSnapshot(destination), directoryTreeSnapshot(source));
assert.deepEqual(
  fs.readdirSync(tempRoot).filter((name) => name.includes(".backup-")),
  [],
);

const originalCpSync = fs.cpSync;
fs.cpSync = () => {
  throw new Error("fs.cpSync must not be used");
};
try {
  const deterministicDestination = path.join(tempRoot, "deterministic-destination");
  copyDir(source, deterministicDestination, ["new.txt"]);
  assert.deepEqual(
    directoryTreeSnapshot(deterministicDestination),
    directoryTreeSnapshot(source),
  );
  for (const relativeSource of [
    "extension",
    "native-helper",
    "skills",
    "plugins/tianyuan-browser-connector",
  ]) {
    const actualSource = path.join(repoRoot, relativeSource);
    const actualDestination = path.join(
      tempRoot,
      `actual-${relativeSource.replaceAll("/", "-")}`,
    );
    copyDir(actualSource, actualDestination);
    assert.deepEqual(
      directoryTreeSnapshot(actualDestination),
      directoryTreeSnapshot(actualSource),
    );
  }
} finally {
  fs.cpSync = originalCpSync;
}

const fileSource = path.join(tempRoot, "source-file.txt");
const fileDestination = path.join(tempRoot, "destination-file.txt");
fs.writeFileSync(fileSource, "replacement");
fs.writeFileSync(fileDestination, "old");
let injectedFileRenameFailure = false;
fs.renameSync = (from, to) => {
  if (!injectedFileRenameFailure && from.includes(".tmp-") && to === fileDestination) {
    injectedFileRenameFailure = true;
    const error = new Error("simulated file rename failure");
    error.code = "EPERM";
    throw error;
  }
  return originalRenameSync(from, to);
};
try {
  copyFileAtomic(fileSource, fileDestination);
} finally {
  fs.renameSync = originalRenameSync;
}
assert.equal(injectedFileRenameFailure, true);
assert.equal(fs.readFileSync(fileDestination, "utf8"), "replacement");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("local runtime copy fallback tests passed");
