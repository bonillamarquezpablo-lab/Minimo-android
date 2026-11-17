'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const atmosphere=fs.readFileSync('scripts/nordic/atmosphere-system.js','utf8');
const dialogue=fs.readFileSync('scripts/npc-dialogue-runtime.js','utf8');
const recorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const gameHtml=fs.readFileSync('index.html','utf8');

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
assert.ok(gameHtml.includes('gpuTimerQuery:\'not measured; scene.render duration is CPU wall-clock only\''),
  'Unavailable GPU timing must not be misreported as zero.');
assert.ok(!builder.includes('qualityDprFloor')&&!builder.includes('qualityDprCeiling')&&
  !builder.includes('engine.setHardwareScalingLevel(1/qualityDprCurrent)'),
  'The Quality profile must not downscale resolution automatically to hide frame-time spikes.');
assert.ok(validator.includes('worldPhaseTimings:getWorldPhaseTimingSnapshot()'),
  'Release validation must require the per-phase timing telemetry.');

console.log('SUBSYSTEM PERFORMANCE CONTRACT: PASS (world phases, atmosphere, hearths, wildlife, NPC dialogue, CPU and GPU timing).');
