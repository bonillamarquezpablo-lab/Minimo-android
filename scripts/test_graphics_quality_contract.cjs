'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const gameSource=fs.readFileSync('index.html','utf8');

for(const marker of [
  'highTierGpuMatch=',
  'highHeadroomQualityMobile=',
  '!isPerformanceMode&&isTouchDevice&&!constrainedHardware',
  'qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.40:1.80):1.85)',
  'qualityDprStableSamples>=6',
  'qualityDprSlowSamples>=2',
  'engine.setHardwareScalingLevel(1/qualityDprCurrent)',
  'fps<55',
  'fps>=59',
  'size=highHeadroomQualityMobile?1024:512',
  'highHeadroomQualityMobile?2048:1024',
  'const size=highHeadroomQualityMobile?512:256'
]) assert.ok(builder.includes(marker),'Missing graphics-quality guardrail: '+marker);

assert.ok(builder.includes('isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52'),'The dedicated Performance profile must keep its existing resolution safeguards.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"),"Quality profile antialiasing must remain enabled.");
assert.ok(validator.includes('missing_graphics_quality'),'The release validator must reject a missing quality uplift.');
assert.ok(validator.includes('procedural_texture_signature') && validator.includes('highHeadroomQualityMobile'), 'The release validator must accept the built 1K adaptive procedural texture while preserving mipmap checks.');

console.log('OK graphics quality: high-headroom resolution, adaptive FPS protection, high-detail textures and unchanged Performance profile.');
