#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageDraw

root=Path(sys.argv[1] if len(sys.argv)>1 else 'artifacts/hrafn-before-after')
manifest=json.loads((root/'manifest.json').read_text())
for phase in manifest['phases']:
    before=Image.open(root/phase['before']['file'].split('before/',1)[-1]).convert('RGB')
    after=Image.open(root/phase['after']['file'].split('after/',1)[-1]).convert('RGB')
    if before.size != after.size:
        after=after.resize(before.size)
    diff=ImageChops.difference(before,after)
    amplified=ImageEnhance.Contrast(diff).enhance(3)
    w,h=before.size
    sheet=Image.new('RGB',(w*2,h+44),'#171717')
    sheet.paste(before,(0,44));sheet.paste(after,(w,44))
    draw=ImageDraw.Draw(sheet)
    draw.text((12,14),f"ANTES — {phase['id'].upper()}",fill='white')
    draw.text((w+12,14),f"DESPUÉS — {phase['id'].upper()}",fill='white')
    sheet.save(root/f"comparison-{phase['id']}.jpg",quality=92)
    amplified.save(root/f"difference-{phase['id']}.png")
print('HRAFN A/B contact sheets and difference maps created.')
