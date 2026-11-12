#!/usr/bin/env python3
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageDraw, ImageStat

root = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/hrafn-before-after")
manifest_path = root / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if len(manifest.get("phases", [])) != 4:
    raise SystemExit("Expected four complete day/night comparison phases.")

report_lines = [
    "# Hrafn — comparación visual antes/después",
    "",
    "- Método: " + str(manifest.get("method", "not recorded")),
    "- Semilla determinista: " + str(manifest.get("captureSeed", "not recorded")),
    "- Resolución: " + str(manifest.get("viewport", {}).get("width")) + " × " + str(manifest.get("viewport", {}).get("height")),
    "",
    "| Fase | Hora | Píxeles distintos | Diferencia media RGB | Comparativa | Mapa de diferencias |",
    "|---|---:|---:|---:|---|---|"
]

for phase in manifest["phases"]:
    phase_id = phase["id"]
    before_path = root / "before" / (phase_id + ".png")
    after_path = root / "after" / (phase_id + ".png")
    if not before_path.is_file() or not after_path.is_file():
        raise SystemExit("Missing before/after capture for phase: " + phase_id)

    with Image.open(before_path) as image:
        before = image.convert("RGB")
    with Image.open(after_path) as image:
        after = image.convert("RGB")
    if before.size != after.size:
        raise SystemExit(
            "Viewport mismatch in " + phase_id + ": before=" +
            str(before.size) + ", after=" + str(after.size) +
            ". The report will not resize or conceal an invalid comparison."
        )

    difference = ImageChops.difference(before, after)
    enhanced = ImageEnhance.Contrast(difference).enhance(3.0)
    histogram = difference.convert("L").histogram()
    total_pixels = before.width * before.height
    changed_pixels = sum(histogram[1:])
    changed_ratio = changed_pixels / max(1, total_pixels)
    mean_rgb_delta = sum(ImageStat.Stat(difference).mean) / 3

    sheet = Image.new("RGB", (before.width * 2, before.height + 52), "#171717")
    sheet.paste(before, (0, 52))
    sheet.paste(after, (before.width, 52))
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 18), "ANTES — " + phase_id.upper(), fill="white")
    draw.text((before.width + 14, 18), "DESPUÉS — " + phase_id.upper(), fill="white")
    comparison_name = "comparison-" + phase_id + ".jpg"
    difference_name = "difference-" + phase_id + ".png"
    sheet.save(root / comparison_name, quality=94, optimize=True)
    enhanced.save(root / difference_name, optimize=True)

    phase["comparison"] = {
        "width": before.width,
        "height": before.height,
        "changedPixels": changed_pixels,
        "totalPixels": total_pixels,
        "changedPixelRatio": round(changed_ratio, 6),
        "meanAbsoluteRgbDelta": round(mean_rgb_delta, 4),
        "comparisonImage": comparison_name,
        "differenceImage": difference_name
    }
    report_lines.append(
        "| " + phase_id + " | " + str(phase.get("hour")) + ":00 | " +
        str(changed_pixels) + " / " + str(total_pixels) + " (" +
        str(round(changed_ratio * 100, 2)) + "%) | " +
        str(round(mean_rgb_delta, 4)) + " | [" + comparison_name + "](" +
        comparison_name + ") | [" + difference_name + "](" +
        difference_name + ") |"
    )

report_lines.extend([
    "",
    "## Interpretación",
    "",
    "El mapa de diferencias amplifica los píxeles modificados. Una diferencia alta no significa automáticamente una mejora o un empeoramiento: hay que revisar las imágenes lado a lado y los diagnósticos del inspector.",
    "",
    "## Builds comparadas",
    "",
    "- Antes: " + str(manifest.get("beforeUrl")),
    "- Después: " + str(manifest.get("afterUrl")),
    "",
    "Los PNG originales están en las carpetas before/ y after/. Este informe no modifica el juego ni sus partidas."
])
(root / "report.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")
manifest["reportGeneratedAt"] = datetime.now(timezone.utc).isoformat()
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print("HRAFN A/B report created: four side-by-side images, four difference maps and report.md")
