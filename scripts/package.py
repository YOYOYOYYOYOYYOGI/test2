#!/usr/bin/env python3
"""
ReelForge — deterministic, AV-friendly ZIP builder.

Builds the production ZIP with ONLY what the Chrome extension needs to run:
    extension/ (manifest + src + icons) · README.md · LICENSE
No backend, no docs, no scripts, no lockfiles, no .env, no node_modules, no
VCS files — nothing beyond what the extension requires.

Deterministic: sorted entries, fixed timestamps, standard deflate, no Unix
uid/gid or high-resolution timestamp extra fields — maximum compatibility
with Windows Explorer and security scanners, reproducible SHA-256.
"""

import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("RF_ZIP_NAME", "UGC-Video-Generator-CLEAN-v1.0.0.zip")
OUT_PATH = os.path.join(ROOT, OUT)
FIXED_DATE = (2026, 1, 1, 0, 0, 0)

INCLUDE_FILES = [
    ("README.md", "README.md"),
    ("LICENSE", "LICENSE"),
    ("extension/manifest.json", "extension/manifest.json"),
]

INCLUDE_TREES = [
    ("extension/src", "extension/src"),
    ("extension/icons", "extension/icons"),
]

FORBIDDEN_PARTS = {".env", "node_modules", "__MACOSX", ".DS_Store", "Thumbs.db", ".git"}
FORBIDDEN_SUFFIX = (".env", ".sh", ".log", ".zip", ".crdownload", ".tmp",
                    ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".bin")


def is_allowed(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    for p in parts:
        if p in FORBIDDEN_PARTS:
            return False
    name = os.path.basename(rel_path)
    if name == "package-lock.json" or name.endswith(FORBIDDEN_SUFFIX):
        return False
    return True


def collect():
    entries = []
    for src, arc in INCLUDE_FILES:
        full = os.path.join(ROOT, src)
        if not os.path.isfile(full):
            sys.exit(f"MISSING required file: {src}")
        entries.append((full, arc))
    for src_dir, _arc_prefix in INCLUDE_TREES:
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
    arcs = [a for _s, a in entries]
    if "extension/manifest.json" not in arcs:
        sys.exit("extension/manifest.json missing from archive set")
    if len(arcs) != len(set(arcs)):
        sys.exit("duplicate archive entries")
    entries.sort(key=lambda e: e[1])
    return entries


def main():
    entries = collect()
    if os.path.exists(OUT_PATH):
        os.remove(OUT_PATH)
    with zipfile.ZipFile(OUT_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        seen_dirs = set()
        for _src, arc in entries:
            d = os.path.dirname(arc)
            while d and d not in seen_dirs:
                seen_dirs.add(d)
                info = zipfile.ZipInfo(f"{d}/", date_time=FIXED_DATE)
                info.external_attr = 0o40755 << 16 | 0x10
                z.writestr(info, b"")
                d = os.path.dirname(d)
        for src, arc in entries:
            info = zipfile.ZipInfo(arc, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(src, "rb") as fh:
                z.writestr(info, fh.read())

    size = os.path.getsize(OUT_PATH)
    print(f"Built {OUT}: {len(entries)} files, {size:,} bytes")
    with zipfile.ZipFile(OUT_PATH) as z:
        if z.testzip():
            sys.exit("CORRUPT ENTRY")
        names = z.namelist()
        for n in names:
            low = n.lower()
            for f in FORBIDDEN_PARTS:
                if f in low.split("/"):
                    sys.exit(f"FORBIDDEN path in archive: {n}")
            if low.endswith((".sh", ".env", "package-lock.json", ".exe", ".dll", ".bat", ".cmd", ".ps1")):
                sys.exit(f"FORBIDDEN file in archive: {n}")
        print(f"Self-check OK: {len(names)} entries, integrity verified")


if __name__ == "__main__":
    main()
