#!/usr/bin/env bash
# ReelForge — packaging script.
# Builds UGC-Video-Generator.zip containing:
#   extension/  backend/  docs/  README.md  LICENSE
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
  docs README.md LICENSE scripts/package.sh

# keep the zip lean: strip OS noise + any accidental .env
zip -qd "${OUT}.zip" "*__MACOSX*" "*/.env" "*/.DS_Store" 2>/dev/null || true

echo "Built ${OUT}.zip:"
unzip -l "${OUT}.zip" | tail -3
