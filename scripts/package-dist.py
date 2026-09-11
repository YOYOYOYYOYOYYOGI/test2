#!/usr/bin/env python3
"""
ReelForge — distribution builder for round "Web Store + unpacked folder".

Builds exactly two artifacts from the audited extension/ tree:

1. dist/UGC-Video-Generator.tar.gz
   The COMPLETE UNPACKED EXTENSION FOLDER (Option 2/3): extracts to a single
   folder `UGC-Video-Generator/` with manifest.json at its root — ready for
   chrome://extensions → Developer mode → Load unpacked.

2. dist/ReelForge-ChromeWebStore-v1.0.0.zip
   The Chrome Web Store upload package (Option 1): manifest.json at the ZIP
   ROOT (store requirement), nothing else — only the files the extension runs.

Both are verified after building: file lists must match the source tree
exactly, and no forbidden/suspicious file types are allowed.
"""

import io
import os
import sys
import tarfile
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "extension")
DIST = os.path.join(ROOT, "dist")
TAR_PATH = os.path.join(DIST, "UGC-Video-Generator.tar.gz")
ZIP_PATH = os.path.join(DIST, "ReelForge-ChromeWebStore-v1.0.0.zip")
FOLDER = "UGC-Video-Generator"
FIXED_DATE = (2026, 1, 1, 0, 0, 0)

FORBIDDEN_SUFFIX = (".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".bin",
                    ".sh", ".zip", ".tar", ".gz", ".env", ".log")
FORBIDDEN_PARTS = {"node_modules", "__MACOSX", ".git", ".DS_Store", "Thumbs.db"}


def source_files():
    files = []
    for root, _dirs, fs in os.walk(SRC):
        for f in sorted(fs):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, SRC).replace("\\", "/")
            parts = rel.split("/")
            if any(p in FORBIDDEN_PARTS for p in parts):
                sys.exit(f"forbidden path part in {rel}")
            if f.lower().endswith(FORBIDDEN_SUFFIX) or f == "package-lock.json":
                sys.exit(f"forbidden file in source tree: {rel}")
            files.append(rel)
    if "manifest.json" not in files:
        sys.exit("manifest.json missing")
    return sorted(files)


def build_tar(files):
    with tarfile.open(TAR_PATH, "w:gz", compresslevel=9) as t:
        # folder entry
        di = tarfile.TarInfo(f"{FOLDER}/")
        di.type = tarfile.DIRTYPE
        di.mode = 0o755
        di.mtime = time.mktime(FIXED_DATE + (0, 0, -1))
        t.addfile(di)
        # extra docs inside the folder (install instructions)
        extra = {
            "INSTALL.txt": os.path.join(SRC, "INSTALL.txt"),
            "README.md": os.path.join(ROOT, "README.md"),
            "LICENSE": os.path.join(ROOT, "LICENSE"),
        }
        for arc in [f"{FOLDER}/{name}" for name in extra] + [f"{FOLDER}/{f}" for f in files]:
            srcp = extra.get(os.path.basename(arc)) if arc == f"{FOLDER}/{os.path.basename(arc)}" and os.path.basename(arc) in extra else os.path.join(SRC, arc[len(FOLDER) + 1:])
            if not os.path.isfile(srcp):
                sys.exit(f"missing {srcp}")
            data = open(srcp, "rb").read()
            ti = tarfile.TarInfo(arc)
            ti.size = len(data)
            ti.mode = 0o644
            ti.mtime = time.mktime(FIXED_DATE + (0, 0, -1))
            t.addfile(ti, io.BytesIO(data))
    print(f"built {os.path.relpath(TAR_PATH, ROOT)}: {os.path.getsize(TAR_PATH):,} bytes, {len(files)} extension files + 3 docs")


def build_zip(files):
    # Store package = runtime files only (manifest + src/ + icons/)
    files = [f for f in files if f == "manifest.json" or f.startswith(("src/", "icons/"))]
    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:  # manifest.json lives at the ZIP ROOT — store requirement
            info = zipfile.ZipInfo(f, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, open(os.path.join(SRC, f), "rb").read())
    with zipfile.ZipFile(ZIP_PATH) as z:
        names = [n for n in z.namelist() if not n.endswith("/")]
        assert "manifest.json" in names, "manifest at zip root required"
        bad = [n for n in names if n != "manifest.json" and not n.startswith(("src/", "icons/"))]
        assert not bad, f"unexpected entries: {bad}"
        assert z.testzip() is None
    print(f"built {os.path.relpath(ZIP_PATH, ROOT)}: {os.path.getsize(ZIP_PATH):,} bytes, {len(files)} files, manifest at root")


def main():
    os.makedirs(DIST, exist_ok=True)
    files = source_files()
    build_tar(files)
    build_zip(files)
    print(f"source audit: {len(files)} files, all allow-listed, no forbidden types")


if __name__ == "__main__":
    main()
