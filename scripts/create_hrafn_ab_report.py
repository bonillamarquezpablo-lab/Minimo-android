#!/usr/bin/env python3
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageDraw, ImageFilter, ImageStat

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
    before_edge_energy = ImageStat.Stat(before.convert('L').filter(ImageFilter.FIND_EDGES)).mean[0]
    after_edge_energy = ImageStat.Stat(after.convert('L').filter(ImageFilter.FIND_EDGES)).mean[0]
    edge_energy_delta_pct = ((after_edge_energy / before_edge_energy) - 1) * 100 if before_edge_energy > 0 else None

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
        "beforeEdgeEnergy": round(before_edge_energy, 4),
        "afterEdgeEnergy": round(after_edge_energy, 4),
        "edgeEnergyDeltaPct": round(edge_energy_delta_pct, 2) if edge_energy_delta_pct is not None else None,
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

before_perf = (manifest.get("builds", {}).get("before") or {}).get("performance") or {}
after_perf = (manifest.get("builds", {}).get("after") or {}).get("performance") or {}
report_lines.extend([
    "",
    "## Rendimiento — emulación móvil S26 Ultra",
    "",
    "| Métrica | Antes | Después |",
    "|---|---:|---:|",
])
for label, before_value, after_value in (
    ("FPS mediana", before_perf.get("medianFps"), after_perf.get("medianFps")),
    ("FPS mínimo muestreado", before_perf.get("minimumFps"), after_perf.get("minimumFps")),
    ("Frame time p95 (ms)", before_perf.get("medianFrameP95Ms"), after_perf.get("medianFrameP95Ms")),
    ("Frame time p99 (ms)", before_perf.get("medianFrameP99Ms"), after_perf.get("medianFrameP99Ms")),
    ("CPU actualización mundo (ms)", before_perf.get("medianWorldUpdateCpuMs"), after_perf.get("medianWorldUpdateCpuMs")),
    ("CPU envío de render (ms)", before_perf.get("medianRenderSubmissionCpuMs"), after_perf.get("medianRenderSubmissionCpuMs")),
    ("Draw calls", before_perf.get("medianDrawCalls"), after_perf.get("medianDrawCalls")),
    ("DPR efectivo de entrada FSR1", (before_perf.get("fsr1") or {}).get("effectiveSourceDpr"), (after_perf.get("fsr1") or {}).get("effectiveSourceDpr")),
):
    report_lines.append("| " + label + " | " + (str(before_value) if before_value is not None else "n/d") + " | " + (str(after_value) if after_value is not None else "n/d") + " |")
report_lines.extend([
    "",
    "Renderer de CI: ANGLE SwiftShader (software). El perfil móvil de alta capacidad se emula, pero no se mide la GPU Adreno física.",
    "",
    "## Indicador auxiliar de detalle",
    "",
    "| Fase | Energía de bordes antes | Energía de bordes después | Cambio |",
    "|---|---:|---:|---:|",
])
for phase in manifest["phases"]:
    comparison = phase.get("comparison") or {}
    report_lines.append(
        "| " + str(phase.get("id")) + " | " + str(comparison.get("beforeEdgeEnergy", "n/d")) +
        " | " + str(comparison.get("afterEdgeEnergy", "n/d")) +
        " | " + str(comparison.get("edgeEnergyDeltaPct", "n/d")) + "% |"
    )
report_lines.extend([
    "",
    "## Interpretación",
    "",
    "El mapa de diferencias amplifica los píxeles modificados. La energía de bordes es un indicador auxiliar: un valor mayor no demuestra por sí solo una mejora; hay que revisar las imágenes lado a lado y los diagnósticos.",
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
