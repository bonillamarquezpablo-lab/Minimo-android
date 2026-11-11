#!/usr/bin/env python3
"""Create a compact visual index for all automated scene-inspection captures."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("artifacts/custom-scene-captures")
MANIFEST = OUT / "manifest.json"
THUMB_W, THUMB_H = 224, 126
LABEL_H = 42
GAP = 8
HEADER_H = 58
COLUMNS = 5
BG = (15, 20, 24)
PANEL = (31, 40, 45)
TEXT = (242, 238, 225)
MUTED = (184, 196, 195)


def main() -> None:
    if not MANIFEST.is_file():
        raise SystemExit(f"Capture manifest not found: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    captures = manifest.get("captures") or []
    if not captures:
        raise SystemExit("No successful captures are available for the contact sheet.")

    available = []
    missing = []
    for entry in captures:
        image_path = OUT / str(entry.get("file", ""))
        if image_path.is_file():
            available.append((entry, image_path))
        else:
            missing.append(str(entry.get("file", "")))
    if not available:
        raise SystemExit("No capture PNG files were found.")
    available.sort(key=lambda pair: (
        str(pair[0].get("zoneId") or ""),
        str((pair[0].get("subject") or {}).get("code") or ""),
        str(pair[0].get("inspectionPurpose") or ""),
        str(pair[0].get("id") or ""),
    ))

    rows = math.ceil(len(available) / COLUMNS)
    tile_w = THUMB_W
    tile_h = LABEL_H + THUMB_H
    width = COLUMNS * tile_w + (COLUMNS - 1) * GAP
    height = HEADER_H + GAP + rows * (tile_h + GAP)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    build = manifest.get("build") or "unknown build"
    draw.text((8, 8), f"EL SIN NOMBRE · AUTOMATED SCENE INSPECTION · {len(available)} CAPTURES",
              fill=TEXT, font=font)
    draw.text((8, 28), f"Build: {build} · read-only scene capture · grouped by zone and object",
              fill=MUTED, font=font)

    for index, (entry, image_path) in enumerate(available):
        col, row = index % COLUMNS, index // COLUMNS
        x = col * (tile_w + GAP)
        y = HEADER_H + GAP + row * (tile_h + GAP)
        draw.rounded_rectangle((x, y, x + tile_w - 1, y + LABEL_H - 1),
                               radius=3, fill=PANEL)
        subject = entry.get("subject") or {}
        zone = entry.get("zoneLabel") or entry.get("zoneId") or "manual camera"
        purpose = entry.get("inspectionPurpose") or "manual-camera"
        title = str(subject.get("name") or zone)
        code = str(subject.get("code") or entry.get("id") or "")
        line1 = f"{title[:29]}  [{code[:16]}]"
        line2 = f"{purpose[:25]} · {zone[:24]}"
        draw.text((x + 5, y + 5), line1[:43], fill=TEXT, font=font)
        draw.text((x + 5, y + 22), line2[:43], fill=MUTED, font=font)
        with Image.open(image_path) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
            tile = Image.new("RGB", (THUMB_W, THUMB_H), BG)
            tile.paste(thumb, ((THUMB_W - thumb.width) // 2, (THUMB_H - thumb.height) // 2))
            sheet.paste(tile, (x, y + LABEL_H))
        draw.rectangle((x, y + LABEL_H, x + THUMB_W - 1, y + LABEL_H + THUMB_H - 1),
                       outline=(100, 115, 120), width=1)

    target = OUT / "contact-sheet.png"
    sheet.save(target, format="PNG", optimize=True)
    summary = {
        "schema": 1,
        "manifest": str(MANIFEST),
        "contactSheet": target.name,
        "successfulCaptures": len(available),
        "missingCaptureFiles": missing,
        "zones": manifest.get("zoneInspections") or [],
        "captures": manifest.get("captureIndex") or [],
    }
    (OUT / "vision-review-index.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\\n",
        encoding="utf-8",
    )
    print(f"SCENE CONTACT SHEET OK: {target} ({width}x{height}; {len(available)} captures)")
    if missing:
        print("WARN Missing PNGs: " + ", ".join(missing))


if __name__ == "__main__":
    main()
