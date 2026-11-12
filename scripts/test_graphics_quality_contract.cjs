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
  'const fsr1Candidate=false;',
  'qualityDprFloor=highHeadroomQualityMobile?1.0',
  'qualityDprCeiling=highHeadroomQualityMobile?1.65',
  'highHeadroomQualityMobile?1.50:(isTouchDevice?1.25:1.85)',
  'qualityDprCurrent=qualityDpr',
  'qualityDprStableSamples>=3',
  'qualityDprSlowSamples>=1',
  'severeFps=targetFrameRate>=87?50:36',
  'moderateFps=targetFrameRate>=87?72:48',
  'stableFps=targetFrameRate>=87?87:57',
  'let targetFrameRate=60,observedFpsCeiling=60',
  'engine.setHardwareScalingLevel(1/qualityDprCurrent)',
  'renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))',
  'renderPipeline.sharpen.edgeAmount=.20',
  'list.length<180',
  'nordicWaterMirror.refreshRate=isTouchDevice?(highHeadroomQualityMobile?30:20):8',
  'shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?10:4))',
  'reflectionFilteredMeshCount',
  'tinyReflectionDetail=vertexCount<96',
  'size=highHeadroomQualityMobile?1024:512',
  'highHeadroomQualityMobile?2048:1024',
  'const size=highHeadroomQualityMobile?512:256',
  'highHeadroomQualityMobile,reportedMemory',
]) assert.ok(builder.includes(marker),'Missing graphics-quality guardrail: '+marker);

assert.ok(!builder.includes('const fsr1Candidate=!!('), 'The experimental two-pass FSR path must not be activated on mobile.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"), 'Native engine antialiasing must remain enabled in Quality.');
assert.ok(gameSource.includes('targetFps:targetFrameRate') && gameSource.includes('framesOver90BudgetPct'), 'The runtime must report frame-budget diagnostics.');
assert.ok(gameSource.includes('engine.setHardwareScalingLevel') || builder.includes('engine.setHardwareScalingLevel'), 'Adaptive native render scale must be applied through Babylon.');
assert.ok(atmosphere.includes("this.quality === 'mobile-high'"), 'Flagship touch devices must use the dedicated mobile-high atmosphere tier.');
assert.ok(atmosphere.includes('pipeline.fxaaEnabled = !mobileHigh;'), 'The mobile-high tier must not stack FXAA on top of native MSAA.');
assert.ok(atmosphere.includes("this.quality === 'high' && !this.isTouchDevice"), 'Volumetric rays and SSAO must remain desktop-only.');
assert.ok(atmosphere.includes("this.quality === 'low' || this.isTouchDevice"), 'Touch devices must keep one standard shadow map instead of a cascaded shadow pass.');
assert.ok(validator.includes('missing_graphics_quality'), 'The release validator must reject missing mobile rendering guardrails.');
assert.ok(validator.includes('this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;'), 'The atmosphere hardware tier must be checked by release validation.');

console.log('OK graphics quality: native WebGL rendering, 1.50 flagship starting scale, adaptive 1.0–1.65 range, native 2x MSAA, dedicated mobile-high atmosphere, no mobile FSR1/SSAO/god-rays/CSM.');
