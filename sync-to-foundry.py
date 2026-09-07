#!/usr/bin/env python3
"""
Copy this module into Foundry's installed modules folder for local dev/testing.

Foundry loads a module from Data/modules/<id>, so this repo has to be mirrored
there — it does not run in place. Re-run after any edit, then use Foundry's
"Reload All Clients" (or relaunch the world) to pick up script/style changes.

Usage:
    python sync-to-foundry.py              # copy
    python sync-to-foundry.py --dry-run    # show what would happen, change nothing
    python sync-to-foundry.py --dest-root X
    python sync-to-foundry.py --clean      # wipe the installed copy first
"""
from __future__ import annotations

import argparse
import filecmp
import json
import os
import shutil
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
DEFAULT_DEST_ROOT = (
    Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    / "FoundryVTT" / "Data" / "modules"
)

# Repo/dev-only entries that must never end up in the installed module.
SKIP_NAMES = {".git", ".gitattributes", ".gitignore", "__pycache__", "sync-to-foundry.py"}


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def copy_tree(src: Path, dest: Path, *, dry_run: bool, stats: dict) -> None:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_NAMES]
        rel = Path(root).relative_to(src)
        target_dir = dest / rel
        if not dry_run:
            target_dir.mkdir(parents=True, exist_ok=True)
        for name in files:
            if name in SKIP_NAMES:
                continue
            s = Path(root) / name
            d = target_dir / name
            if d.exists() and filecmp.cmp(s, d, shallow=False):
                stats["skipped"] += 1
                continue
            print(f"  copy   {d.relative_to(dest.parent)}  ({human(s.stat().st_size)})")
            if not dry_run:
                shutil.copy2(s, d)
            stats["copied"] += 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest-root", type=Path, default=DEFAULT_DEST_ROOT,
                     help=f"Foundry modules folder (default: {DEFAULT_DEST_ROOT})")
    ap.add_argument("--dry-run", action="store_true", help="print actions without changing anything")
    ap.add_argument("--clean", action="store_true", help="wipe the installed copy before copying")
    args = ap.parse_args()

    manifest_path = SRC / "module.json"
    if not manifest_path.is_file():
        print(f"error: {manifest_path} not found -- run this from the module repo", file=sys.stderr)
        return 1
    module_id = json.loads(manifest_path.read_text(encoding="utf-8"))["id"]

    dest_root: Path = args.dest_root.expanduser()
    dest = dest_root / module_id

    if not dest_root.is_dir():
        print(f"error: Foundry modules folder not found: {dest_root}\n"
              f"       (pass --dest-root if Foundry's user data lives elsewhere)", file=sys.stderr)
        return 1

    print(f"{'DRY RUN -- ' if args.dry_run else ''}syncing")
    print(f"  from {SRC}")
    print(f"  to   {dest}\n")

    if args.clean and dest.exists():
        print(f"  wipe   {dest}")
        if not args.dry_run:
            shutil.rmtree(dest)

    stats = {"copied": 0, "skipped": 0}
    copy_tree(SRC, dest, dry_run=args.dry_run, stats=stats)

    print(f"\ndone: {stats['copied']} copied, {stats['skipped']} unchanged")
    if not args.dry_run and stats["copied"]:
        print("-> reload the Foundry world (Module Management > Reload All Clients, "
              "or relaunch) to load the new code.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
