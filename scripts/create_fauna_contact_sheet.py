#!/usr/bin/env python3
"""Create an image sheet and readable report for live animal captures."""
from __future__ import annotations
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("artifacts/fauna-visual-captures")
manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
captures = manifest.get("captures") or []
columns, thumb_w, thumb_h = 4, 400, 225
label_h, gap, header_h = 44, 10, 72
available, missing = [], []
raster_invalid = [
    {
        "file": entry.get("file"),
        "subject": entry.get("subject"),
        "angle": entry.get("angle"),
        "integrity": entry.get("imageIntegrity") or None,
    }
    for entry in captures
    if entry.get("angle") in {"front", "left", "rear", "right"}
    and (entry.get("imageIntegrity") or {}).get("valid") is not True
]
for entry in captures:
    source = OUT / str(entry.get("file") or "")
    (available if source.is_file() else missing).append((entry, source) if source.is_file() else str(entry.get("file") or ""))
rows = max(1, math.ceil(len(available) / columns))
tile_h = label_h + thumb_h
background = (12, 18, 23)
sheet = Image.new("RGB", (columns * thumb_w + (columns - 1) * gap, header_h + gap + rows * (tile_h + gap)), background)
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default()
draw.text((12, 10), "EL SIN NOMBRE · INSPECTOR CENTER · FAUNA 3D", fill=(244, 238, 220), font=font)
draw.text((12, 31), f"Build: {manifest.get('gameVersion') or 'unknown'} · {len(manifest.get('fauna') or [])} animals · {len(available)}/{len(captures)} verified views", fill=(182, 194, 198), font=font)
for index, (entry, source_path) in enumerate(available):
    col, row = index % columns, index // columns
    x, y = col * (thumb_w + gap), header_h + gap + row * (tile_h + gap)
    draw.rounded_rectangle((x, y, x + thumb_w - 1, y + label_h - 1), radius=4, fill=(30, 42, 49))
    title = str(entry.get("subject") or "animal")
    integrity = entry.get("imageIntegrity") or {}
    raster_label = (
        f" · raster {integrity.get('changedPixels', 0)} px · fill {float(integrity.get('fillRatio') or 0):.3f}"
        if integrity else " · raster sin medir"
    )
    detail = str(entry.get("angle") or "view") + " · " + str(entry.get("kind") or "unknown") + raster_label
    draw.text((x + 8, y + 6), title[:58], fill=(244, 238, 220), font=font)
    draw.text((x + 8, y + 25), detail[:58], fill=(182, 194, 198), font=font)
    with Image.open(source_path) as source:
        image = source.convert("RGB")
        image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (thumb_w, thumb_h), background)
        tile.paste(image, ((thumb_w - image.width) // 2, (thumb_h - image.height) // 2))
        sheet.paste(tile, (x, y + label_h))
    draw.rectangle((x, y + label_h, x + thumb_w - 1, y + label_h + thumb_h - 1), outline=(87, 109, 120), width=1)
sheet.save(OUT / "fauna-contact-sheet.jpg", quality=92, optimize=True)

lines = [
    "# EL SIN NOMBRE — Auditoría visual de fauna", "",
    f"- Build: **{manifest.get('gameVersion') or 'no disponible'}**",
    f"- Animales: **{len(manifest.get('fauna') or [])}**",
    f"- Vistas PNG presentes: **{len(available)} / {len(captures)}**",
    f"- Siluetas raster verificadas: **{len(captures) - len(raster_invalid)} / {len(captures)}**",
    f"- Vistas con silueta insuficiente o métrica ausente: **{len(raster_invalid)}**",
    f"- Veredicto: **{manifest.get('verdict') or 'incomplete'}**",
    "- Método: capturas reales del canvas Babylon, cuatro ángulos por actor.",
    "- Modo: cámara y lectura temporal de escena; no se guardan ni modifican partidas.", "",
    "## Inventario por animal", "",
    "| Actor | Especie | Rig | Mallas visibles/total | Vértices skin | Huesos | Texturas listas/total | Clips | Ancho × alto × fondo (m) |",
    "|---|---|---|---:|---:|---:|---:|---:|---|"
]
for animal in manifest.get("fauna") or []:
    d = (animal.get("bounds") or {}).get("dimensions") or {}
    textures = animal.get("textures") or []
    ready = sum(1 for item in textures if item.get("ready") is True)
    flight = animal.get("flightRig") or {}
    rig_label = (f"Vuelo {flight.get('partCount','—')}/{flight.get('expectedPartCount','—')} pivotes · "
                 f"{'reproduciéndose' if flight.get('animationPlaying') else 'detenido'}") if animal.get("role") == "ambient-bird" else "Óseo"
    lines.append(
        f"| {animal.get('id')} | {animal.get('kind')} | {rig_label} | {animal.get('visibleMeshCount')}/{animal.get('meshCount')} "
        f"| {animal.get('skinnedVertices')} | {animal.get('boneCount')} | {ready}/{len(textures)} "
        f"| {len(animal.get('animationGroups') or [])} "
        f"| {d.get('width','—')} × {d.get('height','—')} × {d.get('depth','—')} |"
    )
lines += ["", "## Capturas sin evidencia raster suficiente", ""]
if raster_invalid:
    for item in raster_invalid:
        lines.append(
            "- **" + str(item.get("subject")) + " / " + str(item.get("angle")) +
            "** · " + json.dumps(item.get("integrity"), ensure_ascii=False)
        )
else:
    lines.append("- Todas las vistas cardinales tienen una métrica raster válida.")
lines += ["", "## Avisos", ""]
if manifest.get("warnings"):
    for warning in manifest["warnings"]:
        lines.append("- **" + str(warning.get("code") or "warning") + "** · " + json.dumps(warning, ensure_ascii=False))
else:
    lines.append("- No se detectaron avisos en las comprobaciones automáticas.")
lines += ["", "## Errores", ""]
if manifest.get("failures"):
    lines.extend("- " + str(item) for item in manifest["failures"])
else:
    lines.append("- Ninguno.")
lines += ["", "## Capturas", "", "- Lámina: **fauna-contact-sheet.jpg**"]
lines.extend("- " + str(entry.get("file")) + " · " + str(entry.get("subject")) + " · " + str(entry.get("angle")) for entry, _ in available)
(OUT / "fauna-inspection-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
summary = {
    "schema": 1,
    "gameVersion": manifest.get("gameVersion"),
    "verdict": manifest.get("verdict"),
    "animalCount": len(manifest.get("fauna") or []),
    "captureCount": len(available),
    "rasterVerifiedCount": len(captures) - len(raster_invalid),
    "rasterInvalidCaptures": raster_invalid,
    "missingCaptures": missing,
    "warnings": manifest.get("warnings") or [],
    "failures": manifest.get("failures") or [],
    "animals": manifest.get("fauna") or []
}
(OUT / "fauna-visual-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
