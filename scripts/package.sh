#!/usr/bin/env bash
# ReelForge — packaging script.
# Builds UGC-Video-Generator.zip containing ONLY what users need:
#   extension/  backend (source only)  docs/  README.md  LICENSE
# The archive is built deterministically (sorted entries, fixed timestamps,
# no OS-specific extra fields) so the SHA-256 is reproducible and the file is
# maximally compatible with Windows/AV scanners.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/package.py
