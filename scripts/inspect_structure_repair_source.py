#!/usr/bin/env python3
"""Print focused, read-only source excerpts for the habitable-structure repair path."""
from pathlib import Path
built_source = Path("dist/index.html")
source_path = built_source if built_source.is_file() else Path("index.html")
source = source_path.read_text(encoding="utf-8")
print("INSPECTED_RUNTIME_SOURCE=" + str(source_path))
markers = [
    "probeFloatingHutAudit",
    "relocation-failed-visible",
    "hidden-no-safe-ground",
    "repairAndAuditHabitableStructures",
    "auditHabitableStructures",
    "findLevelHutFooting",
    "hiddenByAudit",
    "relocatable",
    "lastAction",
    "function auditOffshoreStructuralRoots",
    "IslandGarrisonFlagpole_",
    "IslandGarrisonOutpost_",
    "function updatePerformanceIslandStreaming",
    "garrisonFlagpole",
    "garrisonOutpost",
    "function createIslandGarrison",
    "garrisonGrounding",
    "flagPosition",
    "flagLocalPosition",
    "flagErrorMeters",
    "flagBaseY",
    "flagBaseY",
    "flagErrorMeters",
    "function makeIslandGarrison(islandIndex)",
]
output = []
for marker in markers:
    hits = []
    start = 0
    while len(hits) < 4:
        at = source.find(marker, start)
        if at < 0:
            break
        hits.append(at)
        start = at + len(marker)
    output.append("\\n===== "+marker+" ("+str(len(hits))+" hits shown) =====")
    if not hits:
        output.append("NOT FOUND")
        continue
    for index, at in enumerate(hits, 1):
        left = max(0, at - 1800)
        right = min(len(source), at + 5200)
        output.append("--- occurrence "+str(index)+" @ "+str(at)+" ---")
        output.append(source[left:right].replace("\\n", " ")[:6500])
report = "\\n".join(output)
print(report)
target = Path("artifacts/texture-readiness-smoke/structure-repair-source-excerpts.txt")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(report, encoding="utf-8")
