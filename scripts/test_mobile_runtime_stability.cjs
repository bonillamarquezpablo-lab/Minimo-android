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
  'spatialSelectionStats.dynamicFilterEnabled=false;',
  'Do not wrap octree.select(): that method selects static octree blocks',
  'buildSpatialSelectionOctree();',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
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
assert.ok(builder.includes('enemy_ai_lod_marker =') && builder.includes("if(isTouchDevice&&dist>18&&e.state!=='attack'&&e.stun<=0){") && builder.includes('const mobileAiInterval=dist>70?1.0:(dist>36?.45:.20);'), 'Distant touch-device enemies must use distance-based AI cadence while nearby combat remains full-rate.');
assert.ok(builder.includes('makeRotationPart=(node,worldAxis)') && builder.includes('applyRotation(part,angle)'), 'Gull joint axes must be cached at model load.');
assert.ok(!builder.includes('actor.computeWorldMatrix(true);const worldAxis=B.Vector3.TransformNormal(axis,actor.getWorldMatrix())'), 'Per-frame gull animation must not calculate/invert joint matrices.');
assert.ok(builder.includes('mapDrawMaxMs') && builder.includes('window.__elSinNombreWaterTelemetrySnapshot=()=>({'), 'The release must measure minimap cost and keep water telemetry lightweight.');
assert.ok(builder.includes('auditHabitableStructures.discoveryQueue') && builder.includes('evaluateHabitableStructureCached') && builder.includes('habitableAuditLastCacheHits'), 'The structure audit must discover new buildings incrementally and cache unchanged ground proofs.');
assert.ok(validator.includes('enemyAiRateCapHz:isConstrainedMobile?20:(isTouchDevice?30:60)'), 'Release validation must check the mobile AI budget.');
assert.ok(validator.includes('reportVersion:\'35\',build:\'0.6.321\''), 'Release must carry the next diagnostic build id.');
assert.ok(validator.includes('EXPECTED_VERSION = "0.6.321"'), 'Release validator must target version 0.6.321.');
assert.ok(builder.includes('mobile_memory_policy_marker') && builder.includes('isMobilePeakMemorySensitive'), 'Memory-sensitive scheduling must be independent from the selected graphics profile.');
assert.ok(builder.includes('GLB_IDENTITY_COMPARE_CHUNK_BYTES=256*1024'), 'GLB identity checks must compare bounded chunks instead of duplicating full files into ArrayBuffers.');
assert.ok(builder.includes('player_import_start_marker') && builder.includes('let playerHumanLoadPromise=Promise.resolve(null);'), 'The protagonist GLB import must be deferred until static world construction has finished.');
assert.ok(builder.includes('syncActiveBeachIsland();') && builder.includes('syncActiveTidalFoamIsland();'), 'The active beach, seabed and tidal foam must be created before the game loop starts.');
assert.ok(builder.includes('recordStartupTask(\'Geometría de costa inicial\''), 'Initial coastline construction must be measured as a loading task.');
assert.ok(builder.includes('syncNordicWaterReflectionIsland();') && builder.includes('Lista inicial de reflejos nórdicos'), 'The first full-scene reflection-list scan must complete during loading, not the first gameplay frame.');

assert.ok(builder.includes('identity_start_guard_marker') && builder.includes('identityStartupTriggered=false'), 'The preflight identity gate must be idempotent.');
assert.ok(builder.includes("continueUnnamedButton.addEventListener('pointerup',startUnnamedIdentity,{once:true})"), 'The anonymous identity action must support touch pointer-up as well as click.');
assert.ok(builder.includes("continueWithNameButton.addEventListener('pointerup',startNamedIdentity,{once:true})"), 'The named identity action must support touch pointer-up as well as click.');
assert.ok(builder.includes('isMobilePeakMemorySensitive=!!(isIOSDevice') && builder.includes('/Adreno.*650/i.test(graphicsRenderer)'), 'The memory policy must cover iOS Safari and Adreno 650 without switching the graphics profile.');
assert.ok(builder.includes('civilianWarmupPromise=civilianTotal&&!isMobilePeakMemorySensitive'), 'iOS/Adreno 650 startup must not prefetch a second large NPC GLB concurrently.');
assert.ok(builder.includes('wildlifeBlobs.delete(kind)') && builder.includes('startupWildlifeCompressedBytes'), 'Wildlife source GLBs must be released after their complete species batch is imported.');
assert.ok(builder.includes('npcStartupPromise=startNpcHumanModels();'), 'Memory-sensitive startup must load the protagonist before importing the NPC roster.');
assert.ok(builder.includes('prepareAmbientSmokePuffs') && builder.includes("await prepareAmbientSmokePuffs();"), 'Smoke particle meshes and materials must be prepared during loading rather than the first ambient update.');
assert.ok(builder.includes('habitableAuditAccumulator=0'), 'The periodic structure audit must not force a full repair scan on the first gameplay frame.');
assert.ok(builder.includes("const initialHabitableAudit=auditHabitableStructures(true)"), 'The initial structure repair must complete while the loading screen is still active.');
assert.ok(builder.includes("recordStartupTask('Auditoría inicial de asentamientos'"), 'The startup report must record the initial structure-integrity pass.');
assert.ok(builder.includes('if(!source.puffs)createAmbientSmokePuffs(source,si);'), 'The ambient update may only create a late smoke pool as a fallback; prewarmed emitters must reuse it.');
assert.ok(builder.includes('faunaFailures.push({name:\'Gaviotas 3D\''), 'Memory-sensitive startup must stage all birds after the full wildlife set instead of overlapping import peaks.');
assert.ok(validator.includes('mobilePeakMemorySensitive:isMobilePeakMemorySensitive'), 'Packaged session reports must expose the memory scheduling policy.');
assert.ok(validator.includes('wildlifeCompressedBytesReleased:startupWildlifeCompressedBytes'), 'Packaged reports must retain measured wildlife source-byte totals after releasing blobs.');
assert.ok(!builder.includes('qualityDpr=isMobilePeakMemorySensitive'), 'Memory scheduling must never lower or replace the Quality render scale.');
assert.ok(builder.includes('beach_diagnostic_replacements'), 'Beach timing must distinguish actual sliced CPU from elapsed duration.');
assert.ok(builder.includes('beachWorkProgress:{active:!!beachWorkLayer'), 'Beach diagnostics must expose cell and vertex cursor progress.');
assert.ok(builder.includes('beachRenderDiagnostics'), 'Beach reports must inspect the active shader material and texture readiness.');
assert.ok(validator.includes('renderDiagnostics:beachRenderDiagnostics'), 'The packaged report must include beach render diagnostics.');
assert.ok(validator.includes('elapsedUpdateLastMs:Number(beachUpdateLastMs.toFixed(3))'), 'The packaged report must label wall-clock beach duration separately.');

assert.ok(builder.includes('grass_stream_replacement = "if(bestRatio>(onShip?1.55:1.09))currentIsland=-1;"'), 'Quality grass must be staged for the destination island while the player approaches by ship.');
assert.ok(builder.includes('(onShip?Math.max(96,GRASS_STREAM_RECENTER_DISTANCE):GRASS_STREAM_RECENTER_DISTANCE)'), 'Grass streaming must not rebuild repeatedly during short ship movements.');
console.log('OK mobile runtime stability: stale texture protection, incremental structure discovery, mobile AI cadence, per-frame draw-call telemetry, all visual systems and Quality profile retained.');
assert.ok(builder.includes('gull_scale_marker =') && builder.includes('targetGullMaxExtentMeters=.55') &&
  builder.includes('sourceMaxExtent=Math.max(sourceWidth,sourceHeight,sourceDepth)') &&
  builder.includes('visualRoot.position.copyFrom(sourceCenter.scale(-1))') &&
  builder.includes('fittedMaxExtent>.57'),
  'Gulls must be centered and normalized by all three measured model bounds, then checked after scaling.');
assert.ok(builder.includes('smith_hammer_marker') && builder.includes('SmithHammer_') &&
  builder.includes('Keep the smith\'s hands clear'),
  'Rigid civilian hammer geometry must be removed from animated hand/forearm bones.');
assert.ok(builder.includes('tree_rebuild_start =') &&
  builder.includes('mature-scots-pine-tree.glb') &&
  builder.includes('mature-norway-spruce-tree.glb') &&
  builder.includes('oak-textured.glb') &&
  builder.includes('mergeStaticDecorByMaterial') &&
  builder.includes('await loadForestTreeTemplates()') &&
  builder.includes("instantiateModelsToScene(name=>name+'_Forest_'+serial,false)") &&
  builder.includes('requiresTexture:true'),
  'The procedural triangle foliage must be replaced by three required, locally packaged CC0 tree models with texture maps.');
assert.ok(builder.includes('gull_material_registry_replacement = "    const realBirds=[];"') &&
  builder.includes('gull_material_style_start = "const subduedMaterials=new Set();"') &&
  builder.includes('gull_material_style_end = "const sourceBounds=boundsForMeshes(meshes)"') &&
  builder.includes('html = html[:style_start] + html[style_end:]'),
  'The five gull instances must retain the native source material and colour without legacy per-instance tinting.');
assert.ok(builder.includes('wildlife_update_marker = "function updateWildlife(dt){"') &&
  builder.includes('_wildlifeNextDecisionAt') && builder.includes('_wildlifeVelocityX'),
  'Wildlife pathfinding/collision decisions must be throttled while root motion remains frame-integrated.');
assert.ok(builder.includes('rows=isPerformanceMode?10:(isTouchDevice?32:48)') &&
  builder.includes('rows=isPerformanceMode?13:(isTouchDevice?32:48)'),
  'Quality coast meshes must avoid the fourfold radial oversampling previously applied to touch devices.');


assert.ok(!source.includes('worldColliders.push({'), 'Structures must not bypass the live spatial-hash collider registrar.');
assert.ok(source.includes('habitableColliderBackfillCount'), 'Unregistered habitable roots must receive a conservative collision footprint.');
assert.ok(source.includes('fallbackShorelineRadius(island)'), 'The foam solver must retain a valid shoreline anchor when a numerical bracket disappears.');
assert.ok(validator.includes('bootstrapAttempts++<80'), 'Dialogue startup must retry until the game bridge is ready.');

assert.ok(builder.includes('const targetFrameRate=60;'), 'The Quality runtime must target 60 frames per second.');
assert.ok(builder.includes('frameIntervalMs=1000/targetFrameRate') && builder.includes('if(now+.5<nextRenderAt)return') && builder.includes('nextRenderAt+=frameIntervalMs'), 'Babylon rendering and world simulation must be paced at the 60 Hz target on high-refresh displays.');
assert.ok(builder.includes('fpsHudTime+=rawFrameMs/1000;fpsHudFrames++') && builder.includes('renderedFps=measured'), 'The FPS HUD and health report must count rendered game frames, not browser requestAnimationFrame callbacks.');
assert.ok(builder.includes("meter.title='Objetivo: '+targetFrameRate+' FPS."), 'The FPS tooltip must show the enforced target and correct frame budget.');
