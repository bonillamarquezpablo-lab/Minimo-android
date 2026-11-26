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
  'qualityDprCurrent=qualityDpr',
  'qualityScaleAdaptive:false',
  'const targetFrameRate=120;',
  'fpsHudTime+=rawFrameMs/1000;fpsHudFrames++',
  'renderedFps=measured',
  'renderedFps||engine.getFps()',
  'qualityScaleLockedForSession:true',
  'window.__ELSN_RENDER_RESOLUTION=()=>{',
  'nativeResolutionPreserved:!!(window.__ELSN_RENDER_RESOLUTION&&window.__ELSN_RENDER_RESOLUTION().fullNativeResolution)',
  'FPS bajo; la calidad y resolución nativa permanecen bloqueadas.',
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

assert.ok(builder.includes('qualityDprCurrent=qualityDpr') && builder.includes('qualityScaleLockedForSession:true') && builder.includes('qualityScaleAdaptive:false') && builder.includes('nativeResolutionPreserved:!!(window.__ELSN_RENDER_RESOLUTION&&window.__ELSN_RENDER_RESOLUTION().fullNativeResolution)'), 'Quality must preserve the native render scale for the whole session.');
assert.ok(!builder.includes('engine.setHardwareScalingLevel(1/qualityDprCurrent)') && !builder.includes('qualityDprSlowSamples') && !builder.includes('qualityDprStableSamples'), 'Runtime pressure must never reduce native Quality resolution.');
assert.ok(builder.includes('let lastWorldUpdateMs=0,lastRenderCpuMs=0;'), 'Shared frame-loop timing bindings must remain available after the Quality-scale change.');
assert.ok(builder.includes('targetFrameRate=120') && builder.includes('renderDpr:qualityDprCurrent') && builder.includes('qualityScaleLockedForSession:true'), 'Performance diagnostics must retain the 120 Hz device target and native render scale.');
assert.ok(builder.includes('frame_loop_replacement = frame_loop_marker') && builder.includes('frame_clock_replacement = frame_clock_marker') && !builder.includes('frameIntervalMs=1000/targetFrameRate') && !builder.includes('if(now+.5<nextRenderAt)return'), 'Quality must not throttle Babylon rendering below the display refresh rate.');
assert.ok(builder.includes('window.__ELSN_RENDER_RESOLUTION=()=>') && builder.includes('engine.getRenderWidth()') && builder.includes('engine.getRenderHeight()') && builder.includes('nativeResolutionPreserved:!!(window.__ELSN_RENDER_RESOLUTION&&window.__ELSN_RENDER_RESOLUTION().fullNativeResolution)') && !builder.includes('setHardwareScalingLevel(1/qualityDprCurrent)'), 'The runtime must report actual framebuffer dimensions and whether they match the physical panel resolution.');
assert.ok(!builder.includes('fsr1Candidate') && !builder.includes('fsr1InputScale'), 'No inactive FSR1 state may override native device resolution.');
assert.ok(builder.includes('legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"') && builder.includes('html.replace(legacy_fsr_guard, "if(false){", 1)'), 'The obsolete FSR block must be guarded before scene construction.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"), 'Native engine antialiasing must remain enabled in Quality.');
assert.ok(gameSource.includes('const waterNormalLeftOffsets=new Uint32Array(waterBase.length/3)'), 'Water normal neighbour indices must be cached without changing the rendered mesh.');
assert.ok(gameSource.includes('waterNormalInvDx[count]=1/(waterBase[right]-waterBase[left]||1)'), 'Water normal grid spacing must be precomputed when the detail region changes.');
assert.ok(gameSource.includes('const offset=waterActiveVertexOffsets[n],left=waterNormalLeftOffsets[n]'), 'Water normal updates must reuse cached neighbours instead of recalculating grid indices per frame.');
assert.ok(gameSource.includes('targetFps:targetFrameRate') && gameSource.includes('framesOver90BudgetPct'), 'The runtime must report frame-budget diagnostics.');
assert.ok(builder.includes('highHeadroomQualityMobile?deviceDpr:1.45'), 'Flagship Quality must use the physical device DPR, not a capped internal scale.');
assert.ok(atmosphere.includes("this.quality === 'mobile-high'"), 'Flagship touch devices must use the dedicated mobile-high atmosphere tier.');
assert.ok(atmosphere.includes('pipeline.fxaaEnabled = !mobileHigh;'), 'The mobile-high tier must not stack FXAA on top of native MSAA.');
assert.ok(atmosphere.includes("this.quality === 'high' && !this.isTouchDevice"), 'Volumetric rays and SSAO must remain desktop-only.');
assert.ok(atmosphere.includes("this.quality === 'low' || this.isTouchDevice"), 'Touch devices must keep one standard shadow map instead of a cascaded shadow pass.');
assert.ok(validator.includes('missing_graphics_quality'), 'The release validator must reject missing mobile rendering guardrails.');
assert.ok(validator.includes('this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;'), 'The atmosphere hardware tier must be checked by release validation.');

console.log('OK graphics quality: native WebGL rendering, fixed native-DPR flagship Quality, native 2x MSAA, dedicated mobile-high atmosphere, desktop-only SSAO/god-rays/CSM.');
