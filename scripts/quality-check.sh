#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

while IFS= read -r file; do
  node --check "$file"
done < <(find native-helper scripts extension/src -type f \( -name '*.js' -o -name '*.mjs' \) -print | sort)
node --test tests/*.test.cjs tests/*.test.mjs
git diff --check
if git grep -nEI '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY-----)' -- ':!docs/test-evidence/**'; then
  echo 'Potential credential literal found in tracked source.' >&2
  exit 1
fi
echo "Quality checks passed."

