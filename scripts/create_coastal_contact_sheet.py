#!/usr/bin/env python3
"""Build the 36-frame coastal reference, legacy isolation frames, and sixteen same-state diagnostic variants across three cameras."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "coastal-reference"
CAMERAS = ("shore-1m", "surf-20m", "lod-90m", "ridge-occlusion")
TIMES = (0, 37, 91)
TIDES = ("natural", "high", "low")
DIAGNOSTIC_CAMERAS = ("shore-1m", "shoreline-eye", "lod-90m")
DIAGNOSTIC_VARIANTS = (
    ("no-island-heightfield", "sin IslandHeightfield"),
    ("baseline", "baseline"),
    ("no-shorebreaker-wash", "sin ShoreBreakerWash"),
    ("no-volumetric-shore-breaker", "sin VolumetricShoreBreaker"),
    ("no-living-beach-layer", "sin LivingCoastalSand"),
    ("no-submerged-sand", "sin NordicSubmergedSand"),
    ("no-continuous-shore-foam", "sin espuma costera"),
    ("previous-ocean-normal", "normales anteriores"),
    ("no-ocean-depth-alpha", "sin alpha de profundidad"),
    ("no-ocean-vertex-alpha", "sin alpha del agua"),
    ("no-ground-vertex-alpha", "sin alpha de malla"),
    ("no-ocean-normal-map", "sin normales"),
    ("no-ocean-specular", "sin especular"),
    ("no-short-vertex-waves", "sin ondas cortas"),
    ("no-ocean-depth-tint", "sin tinte de profundidad"),
    ("no-near-water-detail", "solo oleaje lejano"),
    ("no-shore-foundation", "sin base bajo isla"),
    ("no-village-buildings", "sin cabañas"),
)
HOTSPOT_VARIANTS = (
    ("baseline", "geometría | base"),
    ("no-island-heightfield", "sin IslandHeightfield"),
    ("no-submerged-sand", "sin NordicSubmergedSand"),
    ("no-living-beach-layer", "sin LivingCoastalSand"),
    ("no-shorebreaker-wash", "sin ShoreBreakerWash"),
)
LEGACY_ISOLATIONS = (
    ("ridge-occlusion__t037__natural__no-island-shadows.png", "ridge | sin sombras isla"),
    ("ridge-occlusion__t037__natural__no-packed-trails.png", "ridge | sin caminos"),
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
    hotspot_expected = [f"geometry-hotspot__t037__natural__{variant}.png" for variant, _ in HOTSPOT_VARIANTS]
    legacy_expected = [name for name, _ in LEGACY_ISOLATIONS]
    missing = [name for name in expected + diagnostic_expected + hotspot_expected + legacy_expected if not (OUT / name).is_file()]
    if missing:
        raise SystemExit("Cannot build contact sheet; missing screenshots: " + ", ".join(missing))

    columns = 6
    width = columns * THUMB_W + (columns - 1) * GAP
    base_rows = len(CAMERAS) * len(TIMES)
    diagnostic_rows_per_camera = (len(DIAGNOSTIC_VARIANTS) + columns - 1) // columns
    diagnostic_rows = len(DIAGNOSTIC_CAMERAS) * diagnostic_rows_per_camera
    hotspot_rows = 1
    legacy_rows = 1
    row_height = LABEL_H + THUMB_H
    height = HEADER_H + GAP + (base_rows + diagnostic_rows + hotspot_rows + legacy_rows) * (row_height + GAP)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    draw.text((8, 7), "EL SIN NOMBRE · 36 CAPTURES + 54 DIAGNOSTIC A/B + 5 GEOMETRY HOTSPOT A/B + LEGACY", fill=TEXT, font=font)
    draw.text((8, 25), "Baseline matrix · same camera, t=037 s, natural tide · coast and settlement source isolation",
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
        for index, (variant, label) in enumerate(DIAGNOSTIC_VARIANTS):
            name = f"{camera}__t037__natural__{variant}.png"
            paste_tile(name, f"{camera} | t037 | {label}", index % columns, row + index // columns)
        row += diagnostic_rows_per_camera

    for col, (variant, label) in enumerate(HOTSPOT_VARIANTS):
        name = f"geometry-hotspot__t037__natural__{variant}.png"
        paste_tile(name, label, col, row)
    row += 1
    for col, (name, label) in enumerate(LEGACY_ISOLATIONS):
        paste_tile(name, label, col, row)

    target = OUT / "contact-sheet.png"
    sheet.save(target, format="PNG", optimize=True)
    print(f"CONTACT SHEET OK: {target} ({width}x{height}; 36 CAPTURES + 54 diagnostic A/B + 5 hotspot A/B + legacy)")


if __name__ == "__main__":
    main()
