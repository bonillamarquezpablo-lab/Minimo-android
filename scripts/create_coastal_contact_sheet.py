#!/usr/bin/env python3
"""Build a 27-frame, three-tide contact sheet from the coastal reference PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "coastal-reference"
CAMERAS = ("shore-1m", "surf-20m", "lod-90m")
TIMES = (0, 37, 91)
TIDES = ("natural", "high", "low")
THUMB_W, THUMB_H = 320, 180
LABEL_H = 30
GAP = 4
HEADER_H = 54
COLORS = {
    "background": (13, 18, 22),
    "panel": (28, 37, 42),
    "line": (117, 129, 133),
    "text": (239, 232, 216),
    "muted": (181, 192, 189),
}

def main() -> None:
    if not OUT.is_dir():
        raise SystemExit(f"Missing screenshot directory: {OUT}")
    expected = [
        f"{camera}__t{time:03d}__{tide}.png"
        for camera in CAMERAS for time in TIMES for tide in TIDES
    ]
    missing = [name for name in expected if not (OUT / name).is_file()]
    if missing:
        raise SystemExit("Cannot build contact sheet; missing screenshots: " + ", ".join(missing))

    width = 3 * THUMB_W + 2 * GAP
    row_height = LABEL_H + THUMB_H
    height = HEADER_H + 9 * row_height + 10 * GAP
    sheet = Image.new("RGB", (width, height), COLORS["background"])
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    draw.text((10, 8), "EL SIN NOMBRE · COASTAL REFERENCE · 27 CAPTURES", fill=COLORS["text"], font=font)
    draw.text((10, 26), "One game load · 960×540 · Chromium / SwiftShader · tide columns: natural / high / low",
              fill=COLORS["muted"], font=font)

    for col, tide in enumerate(TIDES):
        x = col * (THUMB_W + GAP)
        draw.rounded_rectangle((x, HEADER_H - 2, x + THUMB_W, HEADER_H + LABEL_H - 4),
                               radius=3, fill=COLORS["panel"], outline=COLORS["line"])
        draw.text((x + 9, HEADER_H + 7), f"TIDE: {tide.upper()}", fill=COLORS["text"], font=font)

    row = 0
    for camera in CAMERAS:
        for time in TIMES:
            y = HEADER_H + LABEL_H + GAP + row * (row_height + GAP)
            draw.text((5, y - LABEL_H + 7), f"{camera}  |  t={time}s", fill=COLORS["muted"], font=font)
            for col, tide in enumerate(TIDES):
                x = col * (THUMB_W + GAP)
                name = f"{camera}__t{time:03d}__{tide}.png"
                with Image.open(OUT / name) as source:
                    thumb = source.convert("RGB").resize((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
                sheet.paste(thumb, (x, y))
                draw.rectangle((x, y, x + THUMB_W - 1, y + THUMB_H - 1), outline=COLORS["line"], width=1)
            row += 1

    target = OUT / "contact-sheet.png"
    sheet.save(target, format="PNG", optimize=True)
    print(f"CONTACT SHEET OK: {target} ({width}x{height})")

if __name__ == "__main__":
    main()
