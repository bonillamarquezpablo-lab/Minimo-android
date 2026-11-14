'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const builder = fs.readFileSync('scripts/build_site.py', 'utf8');
const validator = fs.readFileSync('scripts/validate_release.py', 'utf8');
const source = fs.readFileSync('index.html', 'utf8');

for (const marker of [
  'const isLiveDynamicTexture=texture=>',
  'updateDynamicTextureSafely(footprintTexture,footprintAtlas.textureData())',
  'updateDynamicTextureSafely(layer.coastalStateTexture,state.rgba)',
  'updateDynamicTextureSafely(skyTexture,false)',
  'layer.index!==activeBeachIslandIndex',
  'beachWorkScheduled=false;',
  'scene.onNewTransformNodeAddedObservable.add',
  'const pendingDiscovery=Array.from(discoveryQueue);discoveryQueue.clear();',
  'Array.from(discoveryQueue).filter',
  'const enemyAiInterval=isTouchDevice?(isConstrainedMobile?.05:(1/30)):(1/60);',
  'const companionAiInterval=isTouchDevice?(isConstrainedMobile?.0667:(1/30)):(1/60);',
  'lastObservedDrawCallsPerFrame',
  'currentDrawTotal-lastObservedDrawCallsTotal',
  'drawCallsCumulativeRaw',
  'diagnostic_ai_budget_marker',
  'diagnostic_ai_budget_replacement',
  'qualityDprCurrent=qualityDpr',
  'qualityScaleLockedForSession:true'
]) {
  assert.ok(builder.includes(marker), 'Missing mobile stability guardrail: ' + marker);
}

assert.ok(builder.includes('audit_discovery_replacement = """'), 'The full scene scan must be replaced with queued root discovery.');
assert.ok(builder.includes('untracked_replacement = "const untrackedRoots=Array.from(discoveryQueue)'), 'The second full scene scan must be replaced with queue diagnostics.');
assert.ok(source.includes('function auditHabitableStructures(applyRepairs=true)'), 'Habitable structure integrity audit must remain present.');
assert.ok(source.includes('function processBeachWorkChunk()'), 'Incremental coastal simulation must remain present.');
assert.ok(source.includes('function animateWater(dt)'), 'Animated water system must remain present.');
assert.ok(source.includes('function updateWildlife(dt)'), 'Wildlife behavior must remain present.');
assert.ok(source.includes('function update(dt){'), 'The full game world update must remain present.');
assert.ok(validator.includes('enemyAiRateCapHz:isConstrainedMobile?20:(isTouchDevice?30:60)'), 'Release validation must check the mobile AI budget.');
assert.ok(validator.includes('reportVersion:\'16\',build:\'0.6.293\''), 'Release must carry the next diagnostic build id.');
assert.ok(validator.includes('EXPECTED_VERSION = "0.6.293"'), 'Release validator must target version 0.6.293.');

console.log('OK mobile runtime stability: stale texture protection, incremental structure discovery, mobile AI cadence, per-frame draw-call telemetry, all visual systems and Quality profile retained.');
