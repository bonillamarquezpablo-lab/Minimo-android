'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const gameSource=fs.readFileSync('index.html','utf8');
const atmosphere=fs.readFileSync('scripts/nordic/atmosphere-system.js','utf8');

for(const marker of [
  'highTierGpuMatch=',
  'highHeadroomQualityMobile=',
  'qualityDprFloor=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?1.50:1.0):1.15)',
  'qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.45:1.70):1.85)',
  'qualityDprCurrent=qualityDpr',
  'qualityDprStableSamples>=4',
  'const step=fps<severeFps?.12:.06',
  'qualityDprCurrent+.04',
  'qualityDprSlowSamples>=1',
  'severeFps=targetFrameRate>=87?54:38',
  'moderateFps=targetFrameRate>=87?72:50',
  'stableFps=targetFrameRate>=87?86:58',
  'let targetFrameRate=60,observedFpsCeiling=60',
  'engine.setHardwareScalingLevel(1/qualityDprCurrent)',
  'renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))',
  'renderPipeline.sharpen.edgeAmount=.34',
  'list.length<180',
  'nordicWaterMirror.refreshRate=isTouchDevice?12:8',
  'shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?10:4))',
  'reflectionFilteredMeshCount',
  'tinyReflectionDetail=vertexCount<96',
  'size=highHeadroomQualityMobile?1024:512',
  'highHeadroomQualityMobile?2048:1024',
  'const size=highHeadroomQualityMobile?512:256',
  'highHeadroomQualityMobile,reportedMemory',
]) assert.ok(builder.includes(marker),'Missing graphics-quality guardrail: '+marker);

assert.ok(builder.includes('qualityDprCurrent=qualityDpr') && builder.includes('engine.setHardwareScalingLevel(1/qualityDprCurrent)'), 'Flagship phones must adapt native Babylon render scale from the actual initial scale.');
assert.ok(!builder.includes('fsr1Candidate') && !builder.includes('fsr1InputScale'), 'No inactive FSR1 state may override native device resolution.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"), 'Native engine antialiasing must remain enabled in Quality.');
assert.ok(gameSource.includes('const waterNormalLeftOffsets=new Uint32Array(waterBase.length/3)'), 'Water normal neighbour indices must be cached without changing the rendered mesh.');
assert.ok(gameSource.includes('waterNormalInvDx[count]=1/(waterBase[right]-waterBase[left]||1)'), 'Water normal grid spacing must be precomputed when the detail region changes.');
assert.ok(gameSource.includes('const offset=waterActiveVertexOffsets[n],left=waterNormalLeftOffsets[n]'), 'Water normal updates must reuse cached neighbours instead of recalculating grid indices per frame.');
assert.ok(gameSource.includes('targetFps:targetFrameRate') && gameSource.includes('framesOver90BudgetPct'), 'The runtime must report frame-budget diagnostics.');
assert.ok(gameSource.includes('engine.setHardwareScalingLevel') || builder.includes('engine.setHardwareScalingLevel'), 'Adaptive native render scale must be applied through Babylon.');
assert.ok(atmosphere.includes("this.quality === 'mobile-high'"), 'Flagship touch devices must use the dedicated mobile-high atmosphere tier.');
assert.ok(atmosphere.includes('pipeline.fxaaEnabled = !mobileHigh;'), 'The mobile-high tier must not stack FXAA on top of native MSAA.');
assert.ok(atmosphere.includes("this.quality === 'high' && !this.isTouchDevice"), 'Volumetric rays and SSAO must remain desktop-only.');
assert.ok(atmosphere.includes("this.quality === 'low' || this.isTouchDevice"), 'Touch devices must keep one standard shadow map instead of a cascaded shadow pass.');
assert.ok(validator.includes('missing_graphics_quality'), 'The release validator must reject missing mobile rendering guardrails.');
assert.ok(validator.includes('this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;'), 'The atmosphere hardware tier must be checked by release validation.');

console.log('OK graphics quality: native WebGL rendering, 2.45 flagship source scale, native adaptive render scale, native 2x MSAA, dedicated mobile-high atmosphere, desktop-only SSAO/god-rays/CSM.');
