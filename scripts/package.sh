#!/usr/bin/env bash
# ReelForge — packaging script.
# Builds UGC-Video-Generator.zip containing ONLY what users need:
#   extension/  backend (source only)  docs/  README.md  LICENSE
# Excluded on purpose: dev scripts, lockfiles, node_modules, .env, OS noise.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="UGC-Video-Generator"
rm -f "${OUT}.zip"

# sanity: everything the README promises must exist
for f in extension/manifest.json extension/src/dashboard/index.html backend/src/server.js \
         backend/.env.example docs/ARCHITECTURE.md docs/PROVIDERS.md docs/SECURITY.md README.md LICENSE; do
  [ -f "$f" ] || { echo "MISSING: $f" >&2; exit 1; }
done

zip -qr "${OUT}.zip" \
  extension \
  backend/src backend/package.json backend/README.md backend/.env.example \
  docs README.md LICENSE \
  -x "extension/scripts/*" "*package-lock.json" "*.sh" "*/.env" "*__MACOSX*" "*/.DS_Store"

echo "Built ${OUT}.zip:"
unzip -l "${OUT}.zip" | tail -3
