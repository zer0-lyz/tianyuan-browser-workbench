import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Single source of truth for the runtime fingerprint (runtimeBuildId), shared
// by scripts/generate-update-manifest.mjs and scripts/install-local-runtime.mjs.
// The digest used to live in both files and drifted apart, and relative paths
// were hashed with platform separators (backslashes on Windows), so a Windows
// machine could never reproduce an id generated on macOS. Keep the root list,
// exclusion rules, and forward-slash normalization in this one module only.
const FINGERPRINT_ROOTS = [
  "extension",
  "native-helper",
  "plugins/tianyuan-browser-connector",
  "scripts/install-local-runtime.mjs",
  "scripts/runtime-fingerprint.mjs",
  "skills/depreciation-capex-forecast",
  "skills/table-format",
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export function computeRuntimeBuildId(repoRoot) {
  const files = [];
  for (const relativeRoot of FINGERPRINT_ROOTS) {
    const absoluteRoot = path.join(repoRoot, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    const stats = fs.statSync(absoluteRoot);
    if (stats.isFile()) {
      files.push(toPosix(relativeRoot));
      continue;
    }
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".DS_Store" || entry.name.startsWith("._") || entry.name === "runtime-compat.json") continue;
        if (entry.isDirectory() && entry.name === "__pycache__") continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolutePath);
        else if (entry.isFile()) {
          const relativePath = toPosix(path.relative(repoRoot, absolutePath));
          if (relativePath !== "native-helper/native_host.exe") files.push(relativePath);
        }
      }
    };
    visit(absoluteRoot);
  }
  const hash = createHash("sha256");
  for (const relativePath of files.sort()) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(repoRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
