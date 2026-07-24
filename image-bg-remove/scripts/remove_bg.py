#!/usr/bin/env python3
"""
image-bg-remove: AI background removal using rembg (U2Net).
Usage: python remove_bg.py <file-or-dir> [options]
"""

import argparse
import sys
from pathlib import Path

SUPPORTED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description="Remove image background using AI (rembg)")
    parser.add_argument("input", help="Input file or directory")
    parser.add_argument("--recursive", action="store_true", help="Recursively process directories")
    parser.add_argument("--replace", action="store_true", help="Delete original file after success")
    parser.add_argument("--output-dir", help="Output directory (preserves relative structure)")
    parser.add_argument("--alpha-matting", action="store_true", help="Enable alpha matting for fine edges (hair, etc.)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing files")
    return parser.parse_args()


def collect_files(input_path: Path, recursive: bool) -> list:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_EXTS else []
    if input_path.is_dir():
        pattern = "**/*" if recursive else "*"
        return [f for f in input_path.glob(pattern) if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS]
    return []


def resolve_output_path(src, input_root, output_dir):
    stem = src.stem + "_nobg"
    if output_dir:
        try:
            rel = src.relative_to(input_root)
            dest_dir = output_dir / rel.parent
        except ValueError:
            dest_dir = output_dir
        return dest_dir / (stem + ".png")
    return src.parent / (stem + ".png")


def process_file(src, output_path, alpha_matting, dry_run, replace):
    """Returns status string: REMOVED / SKIPPED / DRY-RUN / ERROR:<msg>"""
    if output_path.exists():
        return "SKIPPED"

    if dry_run:
        print(f"  DRY-RUN  {src} -> {output_path}")
        return "DRY-RUN"

    try:
        from rembg import remove

        with open(src, "rb") as f:
            input_data = f.read()

        kwargs = {}
        if alpha_matting:
            kwargs["alpha_matting"] = True
            kwargs["alpha_matting_foreground_threshold"] = 240
            kwargs["alpha_matting_background_threshold"] = 10

        output_data = remove(input_data, **kwargs)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(output_data)

        if replace:
            src.unlink()

        return "REMOVED"

    except ImportError:
        return "ERROR:rembg not installed. Run: pip install rembg"
    except Exception as e:
        return "ERROR:{}".format(e)


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else None

    if not input_path.exists():
        print("ERROR: input not found: {}".format(input_path), file=sys.stderr)
        sys.exit(1)

    input_root = input_path if input_path.is_dir() else input_path.parent
    files = collect_files(input_path, args.recursive)

    if not files:
        print("No supported image files found.")
        sys.exit(0)

    counts = {"REMOVED": 0, "SKIPPED": 0, "DRY-RUN": 0, "ERROR": 0}

    for src in files:
        out_path = resolve_output_path(src, input_root, output_dir)
        status = process_file(src, out_path, args.alpha_matting, args.dry_run, args.replace)

        if status.startswith("ERROR"):
            print("  ERROR    {}  ({})".format(src, status[6:]))
            counts["ERROR"] += 1
        else:
            print("  {:<8} {}".format(status, src))
            counts[status] = counts.get(status, 0) + 1

    print()
    print("Done. REMOVED={}  SKIPPED={}  DRY-RUN={}  ERROR={}".format(
        counts["REMOVED"], counts["SKIPPED"], counts["DRY-RUN"], counts["ERROR"]
    ))

    if counts["ERROR"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
