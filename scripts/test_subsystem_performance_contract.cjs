'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const atmosphere=fs.readFileSync('scripts/nordic/atmosphere-system.js','utf8');
const dialogue=fs.readFileSync('scripts/npc-dialogue-runtime.js','utf8');
const recorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const gameHtml=fs.readFileSync('index.html','utf8');
const diagnosticsCore=fs.readFileSync('scripts/phase1-diagnostics-core.mjs','utf8');

assert.ok(builder.includes('map_clock_pattern = r"let last=performance\\.now\\(\\),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;"') &&
  builder.includes('map_clock_replacement = "let last=performance.now(),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;') &&
  builder.includes('lastMapDrawMs=0,mapDrawMaxMs=0,mapDrawSampleCount=0'),
  'Minimap profiling must initialize its timing telemetry without inserting a frame limiter.');

for(const marker of [
  'worldPhaseTimingStats=Object.create(null)',
  'samplesMs:new Float32Array(120)',
  'p50Ms:at(.50)',
  'p95Ms:at(.95)',
  'p99Ms:at(.99)',
  'worldPhases:getWorldPhaseTimingSnapshot()',
  'getPerformanceSnapshot()',
  'window.__ELSN_WILDLIFE_DIAGNOSTICS__',
  'wildlifeUpdatePerfSamples=new Float32Array(120)',
  'npcDialogue:window.__ELSN_NPC_DIALOGUES__',
  'atmosphere:window.__ELSN_ATMOSPHERE'
]) assert.ok(builder.includes(marker),'Subsystem performance report is missing: '+marker);

for(const marker of [
  'visualUpdate: summarize',
  'hearthSelection: summarize',
  'hearthMeshesLastRefresh',
  'this._recordPerformanceSample(\'visual\'',
  'this._recordPerformanceSample(\'fire\''
]) assert.ok(atmosphere.includes(marker),'Atmosphere profiler is missing: '+marker);

for(const marker of [
  'maxPositioningMs',
  'lastProjection',
  'positioningSamples',
  'positioningP50Ms:at(.50)',
  'positioningP95Ms:at(.95)',
  'positioningP99Ms:at(.99)'
]) assert.ok(dialogue.includes(marker),'Dialogue profiler/anchor diagnostics are missing: '+marker);

const anchorBuilder=builder.slice(builder.indexOf('npc_overlay_anchor_code = r"""'),builder.indexOf('if (scene_profile_code.count(npc_overlay_anchor_marker)'));
assert.ok(anchorBuilder.includes('boundingBox') && anchorBuilder.includes('for(let corner=0;corner<8;corner++)') && anchorBuilder.includes('TransformCoordinates(worldPoint,inverse)') && anchorBuilder.includes('inverse.invert()'),
  'NPC overlay height must use all eight mesh-bound corners transformed through complete mesh and root world matrices, including inherited rotation and scale.');
assert.ok(anchorBuilder.includes('function recoverNpcActorVisuals(parts)') && anchorBuilder.includes('lastVisualRecoveryMeshes') && anchorBuilder.includes('proceduralFallbackBody'),
  'Nearby NPCs with zero renderable imported meshes must recover their visual hierarchy or use the existing fallback until the rig is visible.');
assert.ok(anchorBuilder.includes('parts.factionBadge.position.set(0,.34,0)') && anchorBuilder.includes('m.position.set(0,Number.isFinite(Number(e.y))'),
  'Faction emblems and health bars must have their local offsets reasserted on every anchor maintenance pass.');
assert.ok(anchorBuilder.includes('transformFallbacks') && anchorBuilder.includes('healthReattachments'),
  'NPC overlay anchor recovery must expose transform fallback and health-bar reattachment diagnostics.');

assert.ok(dialogue.includes('lastPositioningMs') &&
  dialogue.includes('maxPositioningMs') &&
  dialogue.includes('lastProjection'),
  'NPC dialogue must expose positioning cost and current screen/world anchor telemetry.');

assert.ok(recorder.includes('liveAtmosphere.getPerformanceSnapshot()') &&
  recorder.includes('atmosphereVisualUpdateCpu') &&
  recorder.includes('atmosphereHearthSelectionCpu') &&
  recorder.includes('npcDialoguePositioningCpu') &&
  recorder.includes('wildlifeUpdateCpu') &&
  recorder.includes('positioningP99Ms') &&
  recorder.includes('readiness: Array.isArray(state.readiness)'),
  'Session reports must carry per-subsystem p50/p95/p99 CPU timings and per-animal readiness evidence.');
assert.ok(gameHtml.includes('EXT_disjoint_timer_query_webgl2')&&gameHtml.includes('EXT_disjoint_timer_query'),
  'The GPU timer-query path must remain available when supported.');
assert.ok(builder.includes('gpuTimerQueryExtensionName') && builder.includes('gpuDeviceTelemetry') &&
  builder.includes('gpuTimerQueryStatus') && builder.includes('maxRenderbufferSize') &&
  builder.includes('maxViewportDims'),
  'GPU telemetry must identify timer-query availability, adapter identity when exposed, and hardware limits.');
assert.ok(recorder.includes('frameP95Ms') && recorder.includes('frameP99Ms') &&
  recorder.includes('frameMaximumMs') && recorder.includes('measurementNote') &&
  recorder.includes('timerQueryStatus'),
  'Session reports must summarize GPU timer-query percentiles and distinguish unavailable measurements from zero.');
assert.ok(recorder.includes('cpuGpuDiagnosis') && recorder.includes('cpuWorldP95Ms') && recorder.includes('cpuRenderP95Ms') && recorder.includes('gpuP95Ms') && recorder.includes('cpuGpuVerdict'),
  'Session reports must classify likely CPU, GPU, mixed or inconclusive bottlenecks using independent P95 measurements.');
assert.ok(gameHtml.includes('gpuTimerQuery:\'not measured; scene.render duration is CPU wall-clock only\''),
  'Unavailable GPU timing must not be misreported as zero.');
assert.ok(builder.includes('qualityScaleLockedForSession:true') && builder.includes('qualityScaleAdaptive:false') && builder.includes('nativeResolutionPreserved:true') && !builder.includes('engine.setHardwareScalingLevel(1/qualityDprCurrent)'), 'Quality resolution must remain native and fixed while performance is diagnosed.');
assert.ok(builder.includes("highHeadroomQualityMobile?1.80:1.45"), 'Mobile Quality must retain its original full-resolution scale.');
assert.ok(builder.includes("const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024") && builder.includes("nordicWaterMirror.refreshRate=isTouchDevice?12:8") && builder.includes("list.length<180"), 'The water reflection resolution, cadence and draw-list budget must not be reduced.');
assert.ok(builder.includes("highHeadroomQualityMobile?10:4"), 'Flagship mobile shadow refresh cadence must retain its original setting.');
assert.ok(atmosphere.includes("const poolSize = this.quality === 'low' ? 1 : 2") && atmosphere.includes("this._hearthMeshCache.set(hearth, included)"), 'Both mobile Quality hearth lights must remain active while their static mesh influence sets are cached.');
assert.ok(atmosphere.includes("mobileHigh ? 24") && atmosphere.includes("mobileHigh ? 0.24"), 'Flagship mobile bloom quality must remain unchanged.');
assert.ok(builder.includes("f.light&&typeof f.light.isEnabled==='function'&&!f.light.isEnabled()"),
  'Disabled legacy hearth lights must not be animated every frame.');
assert.ok(builder.includes('sparkDx*sparkDx+sparkDz*sparkDz>140*140') &&
  builder.includes('smokeDx*smokeDx+smokeDz*smokeDz>180*180'),
  'Distant embers and smoke must be culled outside the local visual field while nearby effects remain intact.');

assert.ok(validator.includes('worldPhaseTimings:getWorldPhaseTimingSnapshot()'),
  'Release validation must require the per-phase timing telemetry.');

for(const marker of ['optimizerPerformance:', 'spatialSelection:', 'waterAndReflections:', 'vegetationBatching:', 'shadowCasterManagement:', 'atmosphere:', 'wildlife:', 'npcDialogue:', 'minimap:', 'structureAuditCache:', 'worldPhases: phaseCosts']) {
  assert.ok(recorder.includes(marker),'Session report must expose measured optimizer performance: '+marker);
}

const atmosphereUpdate=atmosphere.slice(atmosphere.indexOf('    update(dt, force) {'),atmosphere.indexOf('    dispose() {'));
assert.doesNotMatch(atmosphereUpdate,/imageProcessing\\.(?:exposure|contrast)\\s*=\\s*lighting\\./,
  'Atmospheric frame updates must not mutate shared image-processing settings.');
assert.ok(atmosphere.includes('const imageConfigs = new Set(') && atmosphere.includes('imageConfig.exposure = 1.035') && atmosphere.includes('imageConfig.contrast = 1.10'),
  'Image-processing settings must be applied once at setup, not rewritten every dusk frame.');

assert.ok(builder.includes('distanceSquared=dx*dx+dz*dz;') &&
  builder.includes('animal.flee=distanceSquared<196?') &&
  builder.includes('if(animal.flee>0&&distanceSquared>.0001)') &&
  builder.includes('if(distanceSquared>(isTouchDevice?13225:27225)){') &&
  !builder.includes('dist=Math.sqrt(distanceSquared)'),
  'Wildlife decision cadence must use squared-distance thresholds and avoid a per-decision square root without changing flee or far-distance ranges.');

for(const marker of ['frameMaintenanceTimingStats=Object.create(null)','getFrameMaintenanceTimingSnapshot()', "recordFrameMaintenanceTiming('gullFlight'", "recordFrameMaintenanceTiming('enemyVisualRecovery'", "recordFrameMaintenanceTiming('npcOverlayMaintenance'", 'preWorldMaintenanceTimings:getFrameMaintenanceTimingSnapshot()']) assert.ok(builder.includes(marker),'Missing pre-world frame timing marker: '+marker);
assert.ok(recorder.includes('preWorldMaintenanceMs') && recorder.includes('cpuPreWorldP95Ms'),'Session recorder must include pre-world CPU in its bottleneck diagnosis.');
assert.ok(diagnosticsCore.includes('preWorldMaintenanceMs'),'Phase 1 diagnostics must retain pre-world maintenance CPU cost.');
console.log('SUBSYSTEM PERFORMANCE CONTRACT: PASS (world phases, pre-world maintenance, atmosphere, hearths, wildlife, NPC dialogue, CPU and GPU timing).');
