#!/usr/bin/env python3
"""
ReelForge — deterministic, AV-friendly ZIP builder.

Produces UGC-Video-Generator.zip with:
  - sorted entries, fixed timestamps (no build-time noise)
  - standard deflate, no Unix uid/gid or high-res timestamp extra fields
    (maximum compatibility with Windows Explorer and security scanners)
  - only the files users need: extension/, backend source, docs, README, LICENSE
  - never: .env files, lockfiles, node_modules, dev scripts, OS metadata
"""

import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "UGC-Video-Generator.zip")
FIXED_DATE = (2026, 1, 1, 0, 0, 0)  # deterministic timestamp

# (source path, archive path) pairs — explicit allow-list, nothing else ships.
INCLUDE_FILES = [
    ("README.md", "README.md"),
    ("LICENSE", "LICENSE"),
    ("extension/manifest.json", "extension/manifest.json"),
    ("backend/package.json", "backend/package.json"),
    ("backend/README.md", "backend/README.md"),
    ("backend/env.example.txt", "backend/env.example.txt"),
    ("docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"),
    ("docs/PROVIDERS.md", "docs/PROVIDERS.md"),
    ("docs/SECURITY.md", "docs/SECURITY.md"),
]

INCLUDE_TREES = [
    # (source dir, archive prefix)
    ("extension/src", "extension/src"),
    ("extension/icons", "extension/icons"),
    ("backend/src", "backend/src"),
]

FORBIDDEN_PARTS = {".env", "node_modules", "__MACOSX", ".DS_Store", "Thumbs.db"}
FORBIDDEN_SUFFIX = (".env", ".sh", ".log", ".zip", ".crdownload", ".tmp")


def is_allowed(src_path: str) -> bool:
    parts = src_path.replace("\\", "/").split("/")
    for p in parts:
        if p in FORBIDDEN_PARTS:
            return False
    if src_path.endswith(".env"):
        return False
    name = os.path.basename(src_path)
    if name == "package-lock.json" or name.endswith(FORBIDDEN_SUFFIX):
        return False
    return True


def collect() -> list:
    entries = []
    for src, arc in INCLUDE_FILES:
        full = os.path.join(ROOT, src)
        if not os.path.isfile(full):
            sys.exit(f"MISSING required file: {src}")
        entries.append((full, arc))
    for src_dir, arc_prefix in INCLUDE_TREES:
        base = os.path.join(ROOT, src_dir)
        if not os.path.isdir(base):
            sys.exit(f"MISSING required directory: {src_dir}")
        for root, _dirs, files in os.walk(base):
            for f in sorted(files):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                if not is_allowed(rel):
                    continue
                entries.append((full, rel))
    # sanity: manifest must be present and first-ish
    arcs = [a for _s, a in entries]
    if "extension/manifest.json" not in arcs:
        sys.exit("extension/manifest.json missing from archive set")
    if len(arcs) != len(set(arcs)):
        sys.exit("duplicate archive entries")
    entries.sort(key=lambda e: e[1])
    return entries


def main() -> None:
    entries = collect()
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        # explicit directory entries for Explorer-friendliness
        seen_dirs = set()
        for _src, arc in entries:
            d = os.path.dirname(arc)
            while d and d not in seen_dirs:
                seen_dirs.add(d)
                info = zipfile.ZipInfo(f"{d}/", date_time=FIXED_DATE)
                info.external_attr = 0o40755 << 16 | 0x10  # drwxr-xr-x + DOS dir bit
                z.writestr(info, b"")
                d = os.path.dirname(d)
        for src, arc in entries:
            info = zipfile.ZipInfo(arc, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16  # rw-r--r--
            with open(src, "rb") as fh:
                z.writestr(info, fh.read())

    size = os.path.getsize(OUT)
    print(f"Built UGC-Video-Generator.zip: {len(entries)} files, {size:,} bytes")
    # quick self-check
    with zipfile.ZipFile(OUT) as z:
        bad = z.testzip()
        if bad:
            sys.exit(f"CORRUPT ENTRY: {bad}")
        names = z.namelist()
        for n in names:
            low = n.lower()
            for f in FORBIDDEN_PARTS:
                if f in low.split("/"):
                    sys.exit(f"FORBIDDEN path in archive: {n}")
            if low.endswith((".sh", ".env", "package-lock.json")):
                sys.exit(f"FORBIDDEN file in archive: {n}")
        print(f"Self-check OK: {len(names)} entries, integrity verified")


if __name__ == "__main__":
    main()
