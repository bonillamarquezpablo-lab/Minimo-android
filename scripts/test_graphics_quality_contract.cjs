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
  'qualityDprFloor=fsr1Candidate ? .48',
  'qualityDprCeiling=fsr1Candidate ? .74',
  'qualityDpr=fsr1Candidate?deviceDpr:',
  'fsr1SourcePostProcess._options=fsr1InputScale',
  'renderPipeline.fxaaEnabled=!fsr1Candidate',
  'renderPipeline.imageProcessingEnabled=false',
  'qualityDprStableSamples>=3',
  'qualityDprSlowSamples>=1',
  'fps<32',
  'fps>=57',
  'const targetFrameRate=60',
  'renderPipeline.fxaaEnabled=!fsr1Candidate',
  'renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?1:4,maxSamples))',
  'renderPipeline.sharpenEnabled=true',
  'renderPipeline.sharpen.edgeAmount=.34',
  'list.length<260',
  'nordicWaterMirror.refreshRate=isTouchDevice?(highHeadroomQualityMobile?24:20):8',
  'shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?6:4))',
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

assert.ok(gameSource.includes('FsrEasuF(') && gameSource.includes('FsrRcasF('), 'FSR1 EASU and RCAS shaders must be embedded in the game source.');
assert.ok(gameSource.includes('norseFsr1Easu') && gameSource.includes('norseFsr1Rcas') && gameSource.includes('window.__ELSN_FSR1'), 'FSR1 must expose both real post-process stages and runtime diagnostics.');
assert.ok(gameSource.includes('fsr1SourcePostProcess.samples=Math.max(1,Math.min(2,maxFsrSamples))'), 'The FSR1 source pass must use available MSAA for its anti-aliased input.');
assert.ok(builder.includes('isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52'),'The dedicated Performance profile must keep its existing resolution safeguards.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"),"Quality profile antialiasing must remain enabled.");
assert.ok(validator.includes('missing_graphics_quality'),'The release validator must reject a missing quality uplift.');
assert.ok(validator.includes('procedural_texture_signature') && validator.includes('highHeadroomQualityMobile'), 'The release validator must accept the built 1K adaptive procedural texture while preserving mipmap checks.');

console.log('OK graphics quality: WebGL FSR1 EASU+RCAS, adaptive input scale, conditional FXAA, high-detail textures and unchanged Performance profile.');
