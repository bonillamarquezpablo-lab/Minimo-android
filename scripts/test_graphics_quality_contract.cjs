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
  'qualityDprFloor=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?1.50:1.60):1.65)',
  'qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.85:1.80):1.85)',
  'qualityDprStableSamples>=3',
  'qualityDprSlowSamples>=1',
  'fps<32',
  'fps>=57',
  'const targetFrameRate=60',
  'renderPipeline.fxaaEnabled=!highHeadroomQualityMobile',
  'renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))',
  'shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?3:4))',
  'reflectionFilteredMeshCount',
  'tinyReflectionDetail=vertexCount<96',
  'engine.setHardwareScalingLevel(1/qualityDprCurrent)',
  'fps<32',
  'fps<46',
  'fps>=57',
  'size=highHeadroomQualityMobile?1024:512',
  'highHeadroomQualityMobile?2048:1024',
  'const size=highHeadroomQualityMobile?512:256'
]) assert.ok(builder.includes(marker),'Missing graphics-quality guardrail: '+marker);

assert.ok(builder.includes('isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52'),'The dedicated Performance profile must keep its existing resolution safeguards.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"),"Quality profile antialiasing must remain enabled.");
assert.ok(validator.includes('missing_graphics_quality'),'The release validator must reject a missing quality uplift.');
assert.ok(validator.includes('procedural_texture_signature') && validator.includes('highHeadroomQualityMobile'), 'The release validator must accept the built 1K adaptive procedural texture while preserving mipmap checks.');

console.log('OK graphics quality: high-headroom resolution, adaptive FPS protection, high-detail textures and unchanged Performance profile.');
