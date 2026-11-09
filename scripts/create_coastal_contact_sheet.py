#!/usr/bin/env python3
"""Build the 36-frame coastal reference plus the ten same-state diagnostic A/B captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "coastal-reference"
CAMERAS = ("shore-1m", "surf-20m", "lod-90m", "ridge-occlusion")
TIMES = (0, 37, 91)
TIDES = ("natural", "high", "low")
DIAGNOSTIC_CAMERAS = ("shore-1m", "lod-90m")
DIAGNOSTIC_VARIANTS = (
    ("baseline", "baseline"),
    ("no-shorebreaker-wash", "sin ShoreBreakerWash"),
    ("no-ocean-normal-map", "sin normales"),
    ("no-ocean-specular", "sin especular"),
    ("no-short-vertex-waves", "sin ondas cortas"),
)
THUMB_W, THUMB_H = 256, 144
LABEL_H = 24
GAP = 4
HEADER_H = 52
BG = (13, 18, 22)
PANEL = (28, 37, 42)
LINE = (117, 129, 133)
TEXT = (239, 232, 216)
MUTED = (181, 192, 189)


def main() -> None:
    if not OUT.is_dir():
        raise SystemExit(f"Missing screenshot directory: {OUT}")
    expected = [
        f"{camera}__t{time:03d}__{tide}.png"
        for camera in CAMERAS for time in TIMES for tide in TIDES
    ]
    diagnostic_expected = [
        f"{camera}__t037__natural__{variant}.png"
        for camera in DIAGNOSTIC_CAMERAS
        for variant, _ in DIAGNOSTIC_VARIANTS
    ]
    missing = [name for name in expected + diagnostic_expected if not (OUT / name).is_file()]
    if missing:
        raise SystemExit("Cannot build contact sheet; missing screenshots: " + ", ".join(missing))

    columns = 5
    width = columns * THUMB_W + (columns - 1) * GAP
    base_rows = len(CAMERAS) * len(TIMES)
    diagnostic_rows = len(DIAGNOSTIC_CAMERAS)
    row_height = LABEL_H + THUMB_H
    height = HEADER_H + GAP + (base_rows + diagnostic_rows) * (row_height + GAP)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    draw.text((8, 7), "EL SIN NOMBRE · COASTAL REFERENCE · 36 BASE + 10 DIAGNOSTIC A/B", fill=TEXT, font=font)
    draw.text((8, 25), "Baseline matrix above · same-state variants below · t=037 s · natural tide · 960×540 source",
              fill=MUTED, font=font)

    def paste_tile(name: str, label: str, col: int, row: int) -> None:
        x = col * (THUMB_W + GAP)
        tile_y = HEADER_H + GAP + row * (row_height + GAP)
        draw.rounded_rectangle(
            (x, tile_y, x + THUMB_W - 1, tile_y + LABEL_H - 1),
            radius=3, fill=PANEL, outline=LINE
        )
        draw.text((x + 6, tile_y + 7), label[:42], fill=TEXT, font=font)
        with Image.open(OUT / name) as source:
            thumb = source.convert("RGB").resize(
                (THUMB_W, THUMB_H), Image.Resampling.LANCZOS
            )
        image_y = tile_y + LABEL_H
        sheet.paste(thumb, (x, image_y))
        draw.rectangle(
            (x, image_y, x + THUMB_W - 1, image_y + THUMB_H - 1),
            outline=LINE, width=1
        )

    row = 0
    for camera in CAMERAS:
        for time in TIMES:
            for col, tide in enumerate(TIDES):
                name = f"{camera}__t{time:03d}__{tide}.png"
                paste_tile(name, f"{camera} | t={time}s | {tide}", col, row)
            row += 1

    for camera in DIAGNOSTIC_CAMERAS:
        for col, (variant, label) in enumerate(DIAGNOSTIC_VARIANTS):
            name = f"{camera}__t037__natural__{variant}.png"
            paste_tile(name, f"{camera} | t037 | {label}", col, row)
        row += 1

    target = OUT / "contact-sheet.png"
    sheet.save(target, format="PNG", optimize=True)
    print(f"CONTACT SHEET OK: {target} ({width}x{height}; 36 baseline + 10 diagnostic captures)")


if __name__ == "__main__":
    main()
