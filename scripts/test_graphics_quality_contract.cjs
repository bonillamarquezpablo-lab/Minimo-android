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
  'const fsr1Candidate=!!(!isPerformanceMode&&highHeadroomQualityMobile',
  'qualityDprFloor=fsr1Candidate ? .72',
  'qualityDprCeiling=fsr1Candidate ? .92',
  'highHeadroomQualityMobile?2.45:(isTouchDevice?1.80:1.85)',
  'qualityDprCurrent=fsr1Candidate?fsr1InputScale:qualityDpr',
  'qualityDprStableSamples>=3',
  'qualityDprSlowSamples>=1',
  'severeFps=targetFrameRate>=87?50:36',
  'moderateFps=targetFrameRate>=87?72:48',
  'stableFps=targetFrameRate>=87?87:57',
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

assert.ok(builder.includes('fsr1Candidate=!!(!isPerformanceMode&&highHeadroomQualityMobile'), 'Flagship phones must use the validated high-resolution FSR1 path.');
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
assert.ok(builder.includes("if(sameIsland)return;") && builder.includes("if(!sameIsland&&!grassStreamPromise)"), "Quality grass must stay resident across same-island traversal.");
assert.ok(builder.includes("const grassIsland=land[index]") && builder.includes("grassStreamCenterX=grassIsland.x"), "Quality grass streaming must anchor a generated field to the island, not the moving player.");
assert.ok(gameSource.includes("const qualityGrassDensity=isTouchDevice?(islandIndex===0?8.8:5.8):(islandIndex===0?8.2:5.8);"), "The grass density must remain unchanged while preventing costly rebuilds.");
assert.ok(atmosphere.includes("this.moonLight.intensity = 0.28 * state.night"), "Night lighting must retain enough moonlight to read the playable world.");
assert.ok(atmosphere.includes("this.hemiLight.intensity = 0.25 + 0.65 * state.daylight + 0.045 * state.twilight"), "Night ambient fill must not collapse to near zero.");
assert.ok(atmosphere.includes("mix(1.12, 1.08, state.daylight)"), "Night exposure must remain readable without changing daylight exposure.");
assert.ok(atmosphere.includes("this._sunVector = new B.Vector3(0, 1, 0)"), "The atmosphere must reuse vector/color scratch objects instead of allocating them each frame.");


console.log('OK graphics quality: native WebGL rendering, 2.45 flagship source scale, adaptive FSR1 input range, native 2x MSAA, dedicated mobile-high atmosphere, desktop-only SSAO/god-rays/CSM.');
