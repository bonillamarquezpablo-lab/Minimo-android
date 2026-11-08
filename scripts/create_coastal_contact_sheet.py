#!/usr/bin/env python3
"""Build a 36-frame coast/ridge sheet plus four isolated layer comparison frames."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "coastal-reference"
CAMERAS = ("shore-1m", "surf-20m", "lod-90m", "ridge-occlusion")
TIMES = (0, 37, 91)
TIDES = ("natural", "high", "low")
DIAGNOSTICS = (
    ("ridge-occlusion__t037__natural__no-scene-shadows.png", "scene shadows off"),
    ("ridge-occlusion__t037__natural__no-ocean-surface.png", "ocean surface off"),
    ("ridge-occlusion__t037__natural__no-living-beach.png", "living beach off"),
    ("ridge-occlusion__t037__natural__no-terrain-maps.png", "terrain maps off"),
)
THUMB_W, THUMB_H = 320, 180
LABEL_H = 26
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
    expected.extend(name for name, _ in DIAGNOSTICS)
    missing = [name for name in expected if not (OUT / name).is_file()]
    if missing:
        raise SystemExit("Cannot build contact sheet; missing screenshots: " + ", ".join(missing))

    width = 3 * THUMB_W + 2 * GAP
    row_height = LABEL_H + THUMB_H
    diagnostic_rows = (len(DIAGNOSTICS) + 2) // 3
    height = HEADER_H + GAP + (len(CAMERAS) * len(TIMES) + diagnostic_rows) * (row_height + GAP)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    draw.text((8, 7), "EL SIN NOMBRE · COASTAL REFERENCE · 36 CAPTURES + 4 LAYER TESTS", fill=TEXT, font=font)
    draw.text((8, 25), "One game load · 960×540 · Chromium / SwiftShader · columns: natural / high / low",
              fill=MUTED, font=font)

    row = 0
    for camera in CAMERAS:
        for time in TIMES:
            for col, tide in enumerate(TIDES):
                x = col * (THUMB_W + GAP)
                tile_y = HEADER_H + GAP + row * (row_height + GAP)
                name = f"{camera}__t{time:03d}__{tide}.png"
                draw.rounded_rectangle(
                    (x, tile_y, x + THUMB_W - 1, tile_y + LABEL_H - 1),
                    radius=3, fill=PANEL, outline=LINE
                )
                label = f"{camera} | t={time}s | tide={tide}"
                draw.text((x + 7, tile_y + 7), label, fill=TEXT, font=font)
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
            row += 1

    diagnostic_start = row
    for index, (name, label) in enumerate(DIAGNOSTICS):
        col = index % 3
        row_offset = index // 3
        x = col * (THUMB_W + GAP)
        tile_y = HEADER_H + GAP + (diagnostic_start + row_offset) * (row_height + GAP)
        draw.rounded_rectangle(
            (x, tile_y, x + THUMB_W - 1, tile_y + LABEL_H - 1),
            radius=3, fill=PANEL, outline=LINE
        )
        draw.text((x + 7, tile_y + 7), f"ridge-occlusion | {label}", fill=TEXT, font=font)
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

    target = OUT / "contact-sheet.png"
    sheet.save(target, format="PNG", optimize=True)
    print(f"CONTACT SHEET OK: {target} ({width}x{height})")

if __name__ == "__main__":
    main()
