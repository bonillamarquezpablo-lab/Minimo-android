'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const builder = fs.readFileSync('scripts/build_site.py', 'utf8');
const validator = fs.readFileSync('scripts/validate_release.py', 'utf8');
const source = fs.readFileSync('index.html', 'utf8');

for (const marker of [
  'const isLiveDynamicTexture=texture=>',
  'const dynamicTexturePrototype=B.DynamicTexture&&B.DynamicTexture.prototype;',
  '__elsnSafeOwnerEngine',
  '__elsnSafeUpdate',
  '__ELSN_DYNAMIC_TEXTURE_ENGINE_RECOVERIES',
  'textureEngine===engine',
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
  'scene.createOrUpdateSelectionOctree(64,3)',
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  'function buildSpatialSelectionOctree()',
  'buildSpatialSelectionOctree();',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
  'const installSpatialDynamicFrustumFilter=octree=>',
  'octree.select=function(frustumPlanes,allowDuplicate)',
  'sphere&&sphere.centerWorld',
  'meshSelectionDynamicFilterCulledPeak:spatialSelectionStats.dynamicFilterCulledPeak',
  'mesh.__elsnSpatialFreshUntilRenderId',
  'plane.dotCoordinate(center)<-paddedRadius',
  'spatialVegetationMotionPattern=/^(?:treeCanopyWindPivot|fallingTree|fallingForestTree)/i',
  'created-after-octree',
  'octree-initial-dynamic',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'qualityScaleLockedForSession:true'
]) {
  assert.ok(builder.includes(marker), 'Missing mobile stability guardrail: ' + marker);
}

assert.ok(builder.includes('audit_discovery_replacement = """'), 'The full scene scan must be replaced with queued root discovery.');
assert.ok(builder.includes('untracked_replacement = "const untrackedRoots=Array.from(discoveryQueue)'), 'The second full scene scan must be replaced with queue diagnostics.');
assert.ok(builder.includes('beach_cancel_api_marker = '), 'The build must expose coastal cancellation through GroundDynamics, which owns the private job state.');
assert.ok(builder.includes('GroundDynamics.cancelBeachWorkForIsland(previousIndex);'), 'Island switches must cancel coastal work through the owning subsystem API.');
assert.ok(!builder.includes('if(beachWorkLayer&&beachWorkLayer.index===previousIndex)'), 'The outer island switch must never access the IIFE-private beachWorkLayer variable.');
assert.ok(validator.includes('cancelBeachWorkForIsland:index=>'), 'Release validation must require the scoped coastal cancellation API.');
assert.ok(source.includes('function auditHabitableStructures(applyRepairs=true)'), 'Habitable structure integrity audit must remain present.');
assert.ok(source.includes('function processBeachWorkChunk()'), 'Incremental coastal simulation must remain present.');
assert.ok(source.includes('function animateWater(dt)'), 'Animated water system must remain present.');
assert.ok(source.includes('const groundRecoveryRetryState=new WeakMap()'), 'Failed ground recovery must be cached per actor to avoid repeating expensive shoreline searches every frame.');
assert.ok(source.includes('GROUND_RECOVERY_RETRY_MS=900'), 'Ground recovery retries must be time-bounded while preserving eventual recovery.');
assert.ok(source.includes('candidates.sort((a,b)=>a.score-b.score)'), 'Safe landing candidates must be tested nearest-first and stop at the first valid point.');
assert.ok(source.includes('if(!onShip&&!playerAirborne&&recoverGroundActor(player.root,realPlayerReady?REAL_PLAYER_ROOT_GROUND_OFFSET:.08,.70))'), 'The player update must use the throttled recovery path instead of repeating an exhaustive search every frame.');
assert.ok(source.includes('groundRecovery:{...groundRecoveryDiagnostics'), 'Ground recovery search cost and retry counters must be included in runtime diagnostics.');
assert.ok(source.includes('function updateWildlife(dt)'), 'Wildlife behavior must remain present.');
assert.ok(source.includes('function update(dt){'), 'The full game world update must remain present.');
assert.ok(builder.includes('phase_timing_helpers') && builder.includes('setWorldUpdatePhase(') && builder.includes('getWorldPhaseTimingSnapshot()'), 'The release must time each existing world-update phase.');
assert.ok(builder.includes('mapDrawMaxMs') && builder.includes('window.__elSinNombreWaterTelemetrySnapshot=()=>({'), 'The release must measure minimap cost and keep water telemetry lightweight.');
assert.ok(builder.includes('auditHabitableStructures.discoveryQueue') && builder.includes('evaluateHabitableStructureCached') && builder.includes('habitableAuditLastCacheHits'), 'The structure audit must discover new buildings incrementally and cache unchanged ground proofs.');
assert.ok(validator.includes('enemyAiRateCapHz:isConstrainedMobile?20:(isTouchDevice?30:60)'), 'Release validation must check the mobile AI budget.');
assert.ok(validator.includes('reportVersion:\'28\',build:\'0.6.309\''), 'Release must carry the next diagnostic build id.');
assert.ok(validator.includes('EXPECTED_VERSION = "0.6.309"'), 'Release validator must target version 0.6.309.');

console.log('OK mobile runtime stability: stale texture protection, incremental structure discovery, mobile AI cadence, per-frame draw-call telemetry, all visual systems and Quality profile retained.');

assert.ok(!source.includes('worldColliders.push({'), 'Structures must not bypass the live spatial-hash collider registrar.');
assert.ok(source.includes('habitableColliderBackfillCount'), 'Unregistered habitable roots must receive a conservative collision footprint.');
assert.ok(source.includes('fallbackShorelineRadius(island)'), 'The foam solver must retain a valid shoreline anchor when a numerical bracket disappears.');
assert.ok(validator.includes('bootstrapAttempts++<80'), 'Dialogue startup must retry until the game bridge is ready.');
