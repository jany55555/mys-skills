#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageFilter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove edge-connected near-black background from sticker sheets and optionally split components."
    )
    parser.add_argument("image_path", help="Source image path")
    parser.add_argument("--threshold", type=int, default=24, help="Color distance threshold for background detection")
    parser.add_argument("--bg-color", type=str, default=None, help="Background color: 'auto' (detect from corners), 'white', 'black', or R,G,B (e.g. '255,255,255')")
    parser.add_argument("--min-area", type=int, default=400, help="Ignore foreground components smaller than this")
    parser.add_argument("--feather", type=int, default=1, help="Gaussian blur radius for alpha edge softening")
    parser.add_argument("--pad", type=int, default=8, help="Padding around exported stickers")
    parser.add_argument("--merge-gap", type=int, default=120, help="Maximum distance for merging small nearby accessory components")
    parser.add_argument("--accessory-max-area", type=int, default=5000, help="Treat components up to this area as accessories that can merge into a nearby main sticker")
    parser.add_argument("--split", dest="split", action="store_true", default=True, help="Export connected components as separate PNG files")
    parser.add_argument("--no-split", dest="split", action="store_false", help="Only export the transparent sheet")
    return parser.parse_args()


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.array(image.convert("RGB"), dtype=np.uint8)


def compute_near_black_mask(rgb: np.ndarray, threshold: int) -> np.ndarray:
    return np.all(rgb <= threshold, axis=2)


def compute_bg_mask(rgb: np.ndarray, threshold: int, bg_color: np.ndarray) -> np.ndarray:
    """Compute background mask based on color distance to bg_color."""
    diff = np.abs(rgb.astype(np.int16) - bg_color.astype(np.int16))
    return np.all(diff <= threshold, axis=2)


def detect_bg_color(rgb: np.ndarray) -> np.ndarray:
    """Auto-detect background color by sampling corners."""
    h, w = rgb.shape[:2]
    corners = np.array([
        rgb[0, 0], rgb[0, w - 1],
        rgb[h - 1, 0], rgb[h - 1, w - 1],
    ], dtype=np.float64)
    return np.round(corners.mean(axis=0)).astype(np.uint8)


def parse_bg_color(value: str | None, rgb: np.ndarray) -> np.ndarray | None:
    """Parse --bg-color argument into an RGB array, or None for legacy black mode."""
    if value is None:
        return None
    value = value.strip().lower()
    if value == "black":
        return None
    if value == "white":
        return np.array([255, 255, 255], dtype=np.uint8)
    if value == "auto":
        return detect_bg_color(rgb)
    parts = value.split(",")
    if len(parts) == 3:
        return np.array([int(p) for p in parts], dtype=np.uint8)
    raise SystemExit(f"Invalid --bg-color value: '{value}'. Use 'auto', 'white', 'black', or R,G,B")


def flood_fill_edge_background(background_mask: np.ndarray) -> np.ndarray:
    height, width = background_mask.shape
    visited = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    def try_push(y: int, x: int) -> None:
        if 0 <= y < height and 0 <= x < width and background_mask[y, x] and not visited[y, x]:
            visited[y, x] = True
            queue.append((y, x))

    for x in range(width):
        try_push(0, x)
        try_push(height - 1, x)
    for y in range(height):
        try_push(y, 0)
        try_push(y, width - 1)

    while queue:
        y, x = queue.popleft()
        try_push(y - 1, x)
        try_push(y + 1, x)
        try_push(y, x - 1)
        try_push(y, x + 1)

    return visited


def alpha_from_foreground(foreground_mask: np.ndarray, feather: int) -> np.ndarray:
    alpha = Image.fromarray((foreground_mask.astype(np.uint8) * 255), mode="L")
    if feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(radius=feather))
    return np.array(alpha, dtype=np.uint8)


def compose_rgba(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def checkerboard_preview(rgba: Image.Image, tile: int = 24) -> Image.Image:
    width, height = rgba.size
    y_idx, x_idx = np.indices((height, width))
    base = (((x_idx // tile) + (y_idx // tile)) % 2) * 40 + 200
    board = np.stack([base, base, base], axis=2).astype(np.uint8)
    board_img = Image.fromarray(board, mode="RGB").convert("RGBA")
    return Image.alpha_composite(board_img, rgba)


def connected_components(mask: np.ndarray, min_area: int) -> list[dict[str, int]]:
    height, width = mask.shape
    visited = np.zeros((height, width), dtype=bool)
    components: list[dict[str, int]] = []

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue

            queue: deque[tuple[int, int]] = deque([(y, x)])
            visited[y, x] = True
            area = 0
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                cy, cx = queue.popleft()
                area += 1
                if cx < min_x:
                    min_x = cx
                if cx > max_x:
                    max_x = cx
                if cy < min_y:
                    min_y = cy
                if cy > max_y:
                    max_y = cy

                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))

            if area >= min_area:
                components.append(
                    {
                        "x": int(min_x),
                        "y": int(min_y),
                        "width": int(max_x - min_x + 1),
                        "height": int(max_y - min_y + 1),
                        "area": int(area),
                    }
                )

    components.sort(key=lambda item: (item["y"], item["x"]))
    return components


def padded_box(component: dict[str, int], width: int, height: int, pad: int) -> tuple[int, int, int, int]:
    left = max(0, component["x"] - pad)
    top = max(0, component["y"] - pad)
    right = min(width, component["x"] + component["width"] + pad)
    bottom = min(height, component["y"] + component["height"] + pad)
    return left, top, right, bottom


def box_gap(a: dict[str, int], b: dict[str, int]) -> int:
    a_left = a["x"]
    a_top = a["y"]
    a_right = a["x"] + a["width"]
    a_bottom = a["y"] + a["height"]
    b_left = b["x"]
    b_top = b["y"]
    b_right = b["x"] + b["width"]
    b_bottom = b["y"] + b["height"]

    dx = max(0, max(a_left - b_right, b_left - a_right))
    dy = max(0, max(a_top - b_bottom, b_top - a_bottom))
    return max(dx, dy)


def merge_components(components: list[dict[str, int]], accessory_max_area: int, merge_gap: int) -> list[dict[str, int]]:
    main_components = [component.copy() for component in components if component["area"] > accessory_max_area]
    accessory_components = [component.copy() for component in components if component["area"] <= accessory_max_area]

    if not main_components:
        return components

    for accessory in accessory_components:
        closest_index = -1
        closest_gap = None
        for index, main in enumerate(main_components):
            gap = box_gap(accessory, main)
            if closest_gap is None or gap < closest_gap:
                closest_gap = gap
                closest_index = index

        if closest_gap is not None and closest_gap <= merge_gap:
            main = main_components[closest_index]
            left = min(main["x"], accessory["x"])
            top = min(main["y"], accessory["y"])
            right = max(main["x"] + main["width"], accessory["x"] + accessory["width"])
            bottom = max(main["y"] + main["height"], accessory["y"] + accessory["height"])
            main["x"] = left
            main["y"] = top
            main["width"] = right - left
            main["height"] = bottom - top
            main["area"] += accessory["area"]
        else:
            main_components.append(accessory)

    main_components.sort(key=lambda item: (item["y"], item["x"]))
    return main_components


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def save_manifest(output_dir: Path, source_path: Path, threshold: int, min_area: int, feather: int, pad: int, merge_gap: int, accessory_max_area: int, components: Iterable[dict[str, int]]) -> None:
    component_list = list(components)
    payload = {
        "source": str(source_path),
        "threshold": threshold,
        "min_area": min_area,
        "feather": feather,
        "pad": pad,
        "merge_gap": merge_gap,
        "accessory_max_area": accessory_max_area,
        "count": len(component_list),
        "components": component_list,
    }
    (output_dir / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    source_path = Path(args.image_path).expanduser().resolve()
    if not source_path.exists():
        raise SystemExit(f"Source image not found: {source_path}")

    rgb = load_rgb(source_path)
    bg_color = parse_bg_color(args.bg_color, rgb)
    if bg_color is None:
        background_candidates = compute_near_black_mask(rgb, args.threshold)
    else:
        background_candidates = compute_bg_mask(rgb, args.threshold, bg_color)
    edge_background = flood_fill_edge_background(background_candidates)
    foreground_mask = ~edge_background
    alpha = alpha_from_foreground(foreground_mask, args.feather)
    rgba = compose_rgba(rgb, alpha)

    output_dir = source_path.parent / f"{source_path.stem}_cutout"
    stickers_dir = output_dir / "stickers"
    ensure_dir(output_dir)
    if args.split:
        ensure_dir(stickers_dir)

    sheet_path = output_dir / "sheet.png"
    preview_path = output_dir / "preview.png"
    rgba.save(sheet_path)
    checkerboard_preview(rgba).save(preview_path)

    raw_components = connected_components(alpha > 0, args.min_area)
    components = merge_components(raw_components, args.accessory_max_area, args.merge_gap)

    if args.split:
        width, height = rgba.size
        for index, component in enumerate(components, start=1):
            crop_box = padded_box(component, width, height, args.pad)
            sticker = rgba.crop(crop_box)
            sticker.save(stickers_dir / f"sticker-{index:02d}.png")

    save_manifest(
        output_dir,
        source_path,
        args.threshold,
        args.min_area,
        args.feather,
        args.pad,
        args.merge_gap,
        args.accessory_max_area,
        components,
    )

    print(json.dumps({
        "output_dir": str(output_dir),
        "sheet": str(sheet_path),
        "preview": str(preview_path),
        "stickers_dir": str(stickers_dir) if args.split else None,
        "count": len(components),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
