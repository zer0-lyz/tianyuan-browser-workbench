import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  copyDir,
  directoryTreeSnapshot,
} from "../scripts/install-local-runtime.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-copy-safety-"));
const source = path.join(tempRoot, "source");
fs.mkdirSync(path.join(source, "nested"), { recursive: true });
fs.writeFileSync(path.join(source, "nested", "keep.txt"), "keep");

try {
  const before = directoryTreeSnapshot(source);
  copyDir(source, source, ["nested/keep.txt"]);
  assert.deepEqual(directoryTreeSnapshot(source), before, "source=destination must validate and skip replacement");

  if (process.platform === "win32") {
    const caseVariant = source.toUpperCase();
    copyDir(source, caseVariant, ["nested/keep.txt"]);
    assert.deepEqual(directoryTreeSnapshot(source), before, "Windows path casing must resolve to the same directory");
  }

  assert.throws(
    () => copyDir(source, path.join(source, "nested", "future"), ["nested/keep.txt"]),
    /COPY_DIRECTORY_TARGET_OVERLAP/,
  );
  assert.deepEqual(directoryTreeSnapshot(source), before, "overlap rejection must preserve the source tree");

  const junction = path.join(tempRoot, "source-alias");
  fs.symlinkSync(source, junction, process.platform === "win32" ? "junction" : "dir");
  try {
    assert.throws(
      () => copyDir(source, path.join(junction, "missing", "two-levels"), ["nested/keep.txt"]),
      /COPY_DIRECTORY_TARGET_OVERLAP/,
      "canonicalize a junction or symlink ancestor before appending missing child segments",
    );
    assert.deepEqual(directoryTreeSnapshot(source), before);
  } finally {
    fs.rmSync(junction, { recursive: true, force: true });
  }

  const separate = path.join(tempRoot, "separate");
  copyDir(source, separate, ["nested/keep.txt"]);
  assert.deepEqual(directoryTreeSnapshot(separate), before, "independent target directories still copy normally");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("local runtime copy safety tests passed");
