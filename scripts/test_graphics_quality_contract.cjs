'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const gameSource=fs.readFileSync('index.html','utf8');
const atmosphere=fs.readFileSync('scripts/nordic/atmosphere-system.js','utf8');
const qualityLab=fs.readFileSync('scripts/quality-render-lab.js','utf8');

for(const marker of [
  'highTierGpuMatch=',
  'highHeadroomQualityMobile=',
  'qualityDprCurrent=qualityDpr',
  'qualityScaleAdaptive:qualityLabAdaptiveActive',
  'const targetFrameRate=120;',
  'fpsHudTime+=rawFrameMs/1000;fpsHudFrames++',
  'renderedFps=measured',
  'renderedFps||engine.getFps()',
  'qualityScaleFixed:!qualityLabAdaptiveActive',
  'window.__ELSN_RENDER_RESOLUTION=()=>{',
  'const gpuTimerQueryExtensionName=profileDiagnosticsEnabled?',
  'const gpuTimerQueryAutoEnabled=profileDiagnosticsEnabled&&!!gpuTimerQueryExtensionName;',
  'perf_gpu_query_marker',
  "if(perfAuditScenario==='sin seleccionar')return null;",
  'perf_audit_record_marker',
  'perf_render_loop_marker',
  'performanceAuditActive=perfAuditScenario',
  "if(perfAuditScenario==='sin seleccionar')return;",
  'const gpuDebugRendererInfo=profileDiagnosticsEnabled?',
  'gpuTimerQueryStatus:!profileDiagnosticsEnabled?',
  'gpuContextCanvas.addEventListener(\'webglcontextrestored\'',
  'renderPipelineDiagnostics:(()=>{try{const pipeline=renderPipeline||null;',
  'shadowCasterCount:map&&Array.isArray(map.renderList)?map.renderList.length:null',
  'customRenderTargetCount:scene&&Array.isArray(scene.customRenderTargets)?scene.customRenderTargets.length:null',
  'window.__ELSN_GPU_CONTEXT_LIFECYCLE=gpuContextLifecycle;',
  "perfGpuPending.length=0;perfGpuActiveQuery=null;perfGpuExtension=null;perfGpuMode='unavailable';perfGpuDisjoint=false;",
  'physicalPixelCoveragePct',
  'fullNativeResolution:renderWidth===physicalPixelWidth&&renderHeight===physicalPixelHeight',
  'FPS bajo; la escala de Calidad permanece fija',
  'renderPipeline.samples=Math.max(1,Math.min(qualityLabEnabled?qualityLabRequestedMsaa:(isTouchDevice?(highHeadroomQualityMobile?2:1):4),maxSamples))',
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

assert.ok(builder.includes('qualityDprCurrent=qualityDpr') && builder.includes('qualityScaleFixed:!qualityLabAdaptiveActive') && builder.includes('qualityScaleAdaptive:qualityLabAdaptiveActive') && builder.includes('physicalPixelCoveragePct'), 'Quality must preserve the native render scale for the whole session.');
const adaptiveCode=builder.split('quality_adaptive_code = r"""')[1]?.split('"""')[0]||'';
assert.ok(!adaptiveCode.includes('engine.setHardwareScalingLevel') && !adaptiveCode.includes('qualityDprSlowSamples') && !adaptiveCode.includes('qualityDprStableSamples'), 'Runtime pressure must never reduce native Quality resolution; manual debug controls are separate.');
assert.ok(builder.includes('let lastWorldUpdateMs=0,lastRenderCpuMs=0;'), 'Shared frame-loop timing bindings must remain available after the Quality-scale change.');
assert.ok(builder.includes('targetFrameRate=120') && builder.includes('renderDpr:qualityDprCurrent') && builder.includes('qualityScaleFixed:!qualityLabAdaptiveActive'), 'Performance diagnostics must retain the 120 Hz device target and native render scale.');
assert.ok(builder.includes('frame_loop_replacement = frame_loop_marker') && builder.includes('frame_clock_replacement = frame_clock_marker') && !builder.includes('frameIntervalMs=1000/targetFrameRate') && !builder.includes('if(now+.5<nextRenderAt)return'), 'Quality must not throttle Babylon rendering below the display refresh rate.');
assert.ok(builder.includes('window.__ELSN_RENDER_RESOLUTION=()=>') && builder.includes('engine.getRenderWidth()') && builder.includes('engine.getRenderHeight()') && builder.includes('physicalPixelWidth') && builder.includes('physicalPixelHeight') && builder.includes('physicalPixelCoveragePct'), 'The runtime must report actual framebuffer dimensions and physical-panel pixel coverage.');
assert.ok(builder.includes('qualityLabFsr1Requested') && builder.includes('const fsr1InputScale=.87;') && builder.includes('if(fsr1Candidate){'), 'FSR1 must remain available behind the explicit debug opt-in.');
const lab=fs.readFileSync('scripts/quality-render-lab.js','utf8');
for(const marker of ['BENCHMARK_MS=15000','PRESETS=[1.8,2.1,2.5,3.0,3.75]','CROP_ZOOM=2','p95<14','p95>18','navigator.clipboard.writeText'])assert.ok(lab.includes(marker),'Missing quality lab feature: '+marker);
assert.ok(!lab.includes('localStorage'),'The quality lab must not persist settings by default.');
assert.ok(builder.includes('legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"') && builder.includes('html.replace(legacy_fsr_guard, "if(!fsr1Candidate)'), 'The obsolete FSR block must be guarded before scene construction.');
assert.ok(gameSource.includes("antialias:activeGraphicsProfile!=='performance'"), 'Native engine antialiasing must remain enabled in Quality.');
assert.ok(builder.includes('class NordicWaterGpuPlugin extends B.MaterialPluginBase') &&
  builder.includes('CUSTOM_VERTEX_UPDATE_POSITION') && builder.includes('CUSTOM_VERTEX_UPDATE_NORMAL') &&
  builder.includes("ground.setVerticesData('norseWaterCoastalCap',waterCoastalCapStrength,false,1)"),
  'The ocean mesh must deform and rebuild analytical normals in its GPU vertex shader.');
assert.ok(builder.includes('waterLastUploadBytes=0;waterLastNormalMs=0;') &&
  builder.includes('cpuMeshVertexEvaluations:0') && builder.includes('dynamicPositionUploads:0') &&
  builder.includes('dynamicNormalUploads:0'),
  'The animated ocean must not stream per-vertex positions/normals from CPU to GPU.');
assert.ok(builder.includes('waterHeight(x,z,t=oceanTime,detailFade)') &&
  builder.includes("analyticGameplaySampler:'waterHeight'"),
  'The analytic water function must remain the gameplay/shoreline reference while rendering moves to GPU.');
assert.ok(gameSource.includes('targetFps:targetFrameRate') && gameSource.includes('framesOver90BudgetPct'), 'The runtime must report frame-budget diagnostics.');
assert.ok(builder.includes('const gpuTimerQueryAutoEnabled=profileDiagnosticsEnabled&&!!gpuTimerQueryExtensionName;') && builder.includes('const gpuTimerQueryExtensionName=profileDiagnosticsEnabled?') && builder.includes('const gpuDebugRendererInfo=profileDiagnosticsEnabled?'), 'GPU profiling and adapter queries must remain opt-in only through the explicit profile=1 switch, not through test mode or normal gameplay.');
assert.ok(builder.includes("const profileDiagnosticsEnabled=new URLSearchParams(window.location.search).get('profile')==='1';"), 'Only the explicit profile=1 switch may enable detailed profiling.');
assert.ok(!builder.includes('const profileDiagnosticsEnabled=!!(testModeEnabled'), 'The previous test-mode profiling coupling must stay removed.');
assert.ok(builder.includes('gpuTimerQueryStatus:!profileDiagnosticsEnabled?') && builder.includes('gpuContextLifecycle'), 'Runtime diagnostics must distinguish disabled profiling from unsupported timers and record WebGL context loss/restoration.');
assert.ok(builder.includes('perf_gpu_query_marker') && builder.includes("if(perfAuditScenario==='sin seleccionar')return null;") && builder.includes('perf_audit_record_marker') && builder.includes("if(perfAuditScenario==='sin seleccionar')return;"), 'The normal render loop must not initialize GPU timer queries or write audit samples until an explicit performance-audit scenario is selected.');
assert.ok(builder.includes('perf_render_loop_marker') && builder.includes("performanceAuditActive=perfAuditScenario!=='sin seleccionar'") && builder.includes('if(performanceAuditActive){endPerfGpuQuery(perfGpuQuery);recordPerformanceAuditFrame(rawFrameMs);}'), 'The normal render loop must not even call audit helpers unless a diagnostic scenario is explicitly active.');
assert.ok(builder.includes('if(profileDiagnosticsEnabled||gpuTimerQueryAutoEnabled)'), 'The native profiling stack must remain available when diagnostics are explicitly requested.');
assert.ok(builder.includes('Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?deviceDpr:1.45):1.65)') && builder.includes('qualityLabDprOptions=[1.8,2.1,2.5,3.0,3.75]'), 'Preserve the existing flagship-tier DPR policy and expose manual DPR overrides only in the debug lab.');
assert.ok(atmosphere.includes("this.quality === 'mobile-high'"), 'Flagship touch devices must use the dedicated mobile-high atmosphere tier.');
assert.ok(atmosphere.includes('pipeline.fxaaEnabled = !mobileHigh;'), 'The mobile-high tier must not stack FXAA on top of native MSAA.');
assert.ok(atmosphere.includes("this.quality === 'high' && !this.isTouchDevice"), 'Volumetric rays and SSAO must remain desktop-only.');
assert.ok(atmosphere.includes("this.quality === 'low' || this.isTouchDevice"), 'Touch devices must keep one standard shadow map instead of a cascaded shadow pass.');
assert.ok(validator.includes('missing_graphics_quality'), 'The release validator must reject missing mobile rendering guardrails.');
assert.ok(qualityLab.includes('pointer-events:none'), 'The debug quality lab panel must not intercept pointer events on the underlying campaign selector.');
assert.ok(qualityLab.includes("aria-expanded=\"false\"") && qualityLab.includes("data-content hidden") && qualityLab.includes("data-toggle"), 'The render lab must start folded behind a compact launcher.');
assert.ok(qualityLab.includes("pointer-events:none;width:auto") && qualityLab.includes("panel.querySelectorAll('button,select,input,a').forEach(control=>{control.style.pointerEvents='auto';});"), 'The folded lab wrapper must pass through gameplay pointers and expose only real controls.');
assert.ok(qualityLab.includes("setExpanded(false)") && qualityLab.includes("toggle.addEventListener('click'"), 'The render lab must be expandable and foldable without being removed permanently.');
assert.ok(qualityLab.includes("panel.querySelectorAll('button,select,input,a').forEach(control=>{control.style.pointerEvents='auto';});"), 'Only actionable quality-lab controls may receive pointer events.');

assert.ok(validator.includes('this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;'), 'The atmosphere hardware tier must be checked by release validation.');

console.log('OK graphics quality: native WebGL rendering, fixed native-DPR flagship Quality, native 2x MSAA, dedicated mobile-high atmosphere, desktop-only SSAO/god-rays/CSM.');
