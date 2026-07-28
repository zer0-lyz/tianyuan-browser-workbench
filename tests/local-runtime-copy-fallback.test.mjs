import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { copyDir } from "../scripts/install-local-runtime.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-copy-fallback-"));
const source = path.join(tempRoot, "source");
const destination = path.join(tempRoot, "destination");
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(source, "new.txt"), "new");
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
assert.equal(fs.existsSync(path.join(destination, "old.txt")), false);
assert.deepEqual(
  fs.readdirSync(tempRoot).filter((name) => name.includes(".backup-")),
  [],
);

const retryDestination = path.join(tempRoot, "retry-destination");
const originalCpSync = fs.cpSync;
let skippedStagingCopy = false;
fs.cpSync = (from, to, options) => {
  if (!skippedStagingCopy && String(to).includes(".staging-")) {
    skippedStagingCopy = true;
    return;
  }
  return originalCpSync(from, to, options);
};
try {
  copyDir(source, retryDestination, ["new.txt"]);
} finally {
  fs.cpSync = originalCpSync;
}

assert.equal(skippedStagingCopy, true);
assert.equal(fs.readFileSync(path.join(retryDestination, "new.txt"), "utf8"), "new");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("local runtime copy fallback tests passed");
