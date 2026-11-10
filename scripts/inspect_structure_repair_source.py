#!/usr/bin/env python3
"""Print focused, read-only source excerpts for the habitable-structure repair path."""
from pathlib import Path
source = Path("index.html").read_text(encoding="utf-8")
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
]
for marker in markers:
    hits = []
    start = 0
    while len(hits) < 4:
        at = source.find(marker, start)
        if at < 0:
            break
        hits.append(at)
        start = at + len(marker)
    print("\\n===== "+marker+" ("+str(len(hits))+" hits shown) =====")
    if not hits:
        print("NOT FOUND")
        continue
    for index, at in enumerate(hits, 1):
        left = max(0, at - 1800)
        right = min(len(source), at + 2600)
        print("--- occurrence "+str(index)+" @ "+str(at)+" ---")
        print(source[left:right].replace("\\n", " ")[:4500])
