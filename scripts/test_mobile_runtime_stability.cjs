'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const builder = fs.readFileSync('scripts/build_site.py', 'utf8');
const validator = fs.readFileSync('scripts/validate_release.py', 'utf8');
const dialogueRuntime = fs.readFileSync('scripts/npc-dialogue-runtime.js', 'utf8');
const source = fs.readFileSync('index.html', 'utf8');
const smoke = fs.readFileSync('scripts/player-startup-smoke.mjs', 'utf8');

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
  'const installSpatialDynamicCandidateFilter=()=>{',
  'scene.getActiveMeshCandidates=()=>{',
  'spatialSelectionStats.dynamicFilterEnabled=installSpatialDynamicCandidateFilter();',
  'baseGetActiveMeshCandidates.call(scene)',
  'mesh.isInFrustum(scene.frustumPlanes)',
  'scene.skipFrustumClipping',
  'Promise.resolve().then(()=>buildSpatialSelectionOctree())',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionStaticWorldMatrixFreezeMs:spatialSelectionStats.staticWorldMatrixFreezeMs',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
  'spatialVegetationMotionPattern=/^(?:mixedForestTree|treeCanopyWindPivot|fallingTree|fallingForestTree)/i',
  'created-after-octree',
  'octree-initial-dynamic',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'let qualityLabAdaptiveActive=false;',
  'qualityScaleAdaptive:qualityLabAdaptiveActive',
  "const qualityLabEnabled=qualityLabParams.get('debug')==='1';"
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
assert.ok(source.includes('if(!sameIsland&&!grassStreamPromise)') && source.includes('if(sameIsland){grassSameIslandSkipCount++;return;}') && source.includes('grassStreamBuildCount++'), 'Full-island Quality ground cover must only rebuild when the active island changes, not when the player walks across it.');
assert.ok(builder.includes('qualityGrassDensity'), 'The release must keep its full-density Quality grass field.');
assert.ok(builder.includes('phase_timing_helpers') && builder.includes('setWorldUpdatePhase(') && builder.includes('getWorldPhaseTimingSnapshot()'), 'The release must time each existing world-update phase.');
for(const phase of ['environment / island streaming','environment / grass streaming','environment / shadow caster maintenance','environment / settlement integrity','environment / atmosphere','environment / water simulation','environment / wildlife simulation']) assert.ok(builder.includes(phase),'Environment profiling must retain separate measurements: '+phase);
assert.ok(builder.includes('enemy_ai_lod_marker =') && builder.includes("if(isTouchDevice&&dist>18&&e.state!=='attack'&&e.stun<=0){") && builder.includes('const mobileAiInterval=dist>70?1.0:(dist>36?.45:.20);'), 'Distant touch-device enemies must use distance-based AI cadence while nearby combat remains full-rate.');
assert.ok(builder.includes("nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5)") &&
  builder.includes("alignment:{source:'native-Fly-midpoint'") &&
  builder.includes("alignmentDot<.995"), 'Gull orientation must be corrected from the evaluated Fly pose and reject a tilted residual body axis.');
assert.ok(builder.includes('alignAxis=(from,to)') &&
  builder.includes("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;") &&
  builder.includes("rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip") &&
  builder.includes("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to)") &&
  !builder.includes("addFlightTrack(") && !builder.includes("Seagull_Flight_Loop_"),
  'Gulls must use the complete native GLB Fly clip with all anatomical pivots, without a redundant synthetic animation.');
assert.ok(!builder.includes('actor.computeWorldMatrix(true);const worldAxis=B.Vector3.TransformNormal(axis,actor.getWorldMatrix())'), 'Per-frame gull animation must not calculate/invert joint matrices.');
assert.ok(builder.includes('mapDrawMaxMs') && builder.includes('window.__elSinNombreWaterTelemetrySnapshot=()=>({'), 'The release must measure minimap cost and keep water telemetry lightweight.');
assert.ok(builder.includes('auditHabitableStructures.discoveryQueue') && builder.includes('evaluateHabitableStructureCached') && builder.includes('habitableAuditLastCacheHits'), 'The structure audit must discover new buildings incrementally and cache unchanged ground proofs.');
assert.ok(validator.includes('enemyAiRateCapHz:isConstrainedMobile?20:(isTouchDevice?30:60)'), 'Release validation must check the mobile AI budget.');
assert.ok(validator.includes('reportVersion:\'71\',build:\'{EXPECTED_VERSION}\''), 'Release must carry diagnostic report 68.');
assert.ok(validator.includes('EXPECTED_VERSION = "0.6.363"'), 'Release validator must target version 0.6.360.');
assert.ok(builder.includes("const useCpuSkinning=forceCpuSkinning||(!forceGpuSkinning&&softwareSkinningRenderer)") && builder.includes("skinningMode:useCpuSkinning?'cpu':'gpu'"),
  'Hardware mobile GPUs must use GPU skinning by default; CPU remains explicit diagnostics/software fallback, and the exact path is recorded per animal.');
assert.ok(builder.includes("forestPlantingStartedAt") && builder.includes("Plantación inicial de bosque") && builder.includes("await new Promise(resolve=>requestAnimationFrame(resolve))"),
  'The initial forest must be planted in bounded frame slices and expose a startup timing task.');
assert.ok(builder.includes('mobile_memory_policy_marker') && builder.includes('isMobilePeakMemorySensitive'), 'Memory-sensitive scheduling must be independent from the selected graphics profile.');
assert.ok(builder.includes('GLB_IDENTITY_COMPARE_CHUNK_BYTES=256*1024'), 'GLB identity checks must compare bounded chunks instead of duplicating full files into ArrayBuffers.');
assert.ok(builder.includes('player_import_start_marker') && builder.includes('let playerHumanLoadPromise=Promise.resolve(null);'), 'The protagonist GLB import must be deferred until static world construction has finished.');
assert.ok(builder.includes('syncActiveBeachIsland();') && builder.includes('syncActiveTidalFoamIsland();'), 'The active beach, seabed and tidal foam must be created before the game loop starts.');
assert.ok(builder.includes('recordStartupTask(\'Geometría de costa inicial\''), 'Initial coastline construction must be measured as a loading task.');
assert.ok(builder.includes('syncNordicWaterReflectionIsland();') && builder.includes('Lista inicial de reflejos nórdicos'), 'The first full-scene reflection-list scan must complete during loading, not the first gameplay frame.');

assert.ok(builder.includes('identity_start_guard_marker') && builder.includes('identityStartupTriggered=false'), 'The preflight identity gate must be idempotent.');
assert.ok(builder.includes('startup_handoff_marker') &&
  builder.includes("if(!startScreenShown){") && builder.includes("scene.render();") &&
  builder.includes("Promise.resolve().then(()=>buildSpatialSelectionOctree())") && builder.includes("window.__ELSN_SPATIAL_BUILD_PROMISE__=spatialBuildPromise") && builder.includes("showStartScreen();") && builder.includes("window.__elSinNombreStartupSmoke.worldReady=true;"),
  'The startup resource gate must reveal the campaign selector after one verified frame even when the Babylon render-loop callback is throttled.');
assert.ok(builder.includes("continueUnnamedButton.addEventListener('pointerup',startUnnamedIdentity,{once:true})"), 'The anonymous identity action must support touch pointer-up as well as click.');
assert.ok(builder.includes("continueWithNameButton.addEventListener('pointerup',startNamedIdentity,{once:true})"), 'The named identity action must support touch pointer-up as well as click.');
assert.ok(builder.includes('isMobilePeakMemorySensitive=!!(isIOSDevice||isTouchDevice)'), 'The memory policy must serialize large asset imports on every mobile device without switching the graphics profile.');
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

assert.ok(builder.includes('grass_stream_replacement = "if(bestRatio>(onShip?2.0:1.09))currentIsland=-1;"'), 'Destination-island grass prewarm must retain the island during a longer ship approach.');
assert.ok(builder.includes('const centerX=island.x,centerZ=island.z;') && builder.includes('const radius=safeLandRadius;') && builder.includes('const areaFraction=1;'), 'Quality grass must cover the complete dry-land radius at the original per-area density.');
assert.ok(builder.includes('grass_recenter_marker = "const sameIsland=currentIsland===grassStreamActiveIslandIndex;\\n  if(!sameIsland&&!grassStreamPromise){') && !builder.includes('grass_recenter_replacement = "const moved=false;"'), 'The builder must preserve island-change-only grass streaming and never restore player-distance regeneration.');
assert.ok(builder.includes('grass_density_marker = "const qualityGrassDensity=isTouchDevice?(islandIndex===0?8.8:5.8):(islandIndex===0?8.2:5.8);"') && builder.includes('grass_density_replacement = "const qualityGrassDensity=isTouchDevice?(isConstrainedMobile?(islandIndex===0?8.8:5.8):(islandIndex===0?10.4:7.0)):(islandIndex===0?8.8:6.2);"'), 'Flagship Quality must exceed the former grass population while constrained mobile devices retain their prior density.');
assert.ok(builder.includes('mineableRockPlacementStats') && builder.includes('window.__ELSN_ROCK_PLACEMENT__') && builder.includes('const acceptable=(px,pz)=>') && builder.includes('const placedRock=createRock(x,z);if(placedRock)rocks.push(placedRock);'), 'Mineable rocks must be placed only where trunk and rock clearance tests pass.');
assert.ok(builder.includes('for(const rock of rocks){') && builder.includes('const required=(Number(rock.radius)||.7)+.9+.45;') && builder.includes('rockOverlapPairs') && builder.includes('minRockTreeClearanceMeters'), 'Tree placement must also reject rocks that were spawned earlier in the incremental forest/resource loop, and expose a symmetric overlap audit.');
assert.ok(builder.includes("leaf_count_marker = \"const leavesPerClump=isPerformanceMode?8:10;\"") && builder.includes("leavesPerClump=isPerformanceMode?8:12;") && builder.includes("leaf_geometry_marker") && builder.includes("tipTint=tip.tint*1.06"), 'Grass tufts must have 12 tapered blades on Quality with a more efficient 5-vertex profile.');
assert.ok(builder.includes("class NordicGrassWindPlugin extends B.MaterialPluginBase") && builder.includes("CUSTOM_VERTEX_UPDATE_POSITION") && builder.includes("hardBindForSubMesh(uniformBuffer)") && builder.includes("gpu-vertex-displacement"), 'Grass wind must be animated in the shared GPU vertex shader, not by CPU vertex uploads.');
assert.ok(builder.includes("const want=Math.max(1,Math.round(baseWant*(isPerformanceMode?performanceDensity:qualityGrassDensity)*areaFraction));") && builder.includes("grass_density_replacement = \"const qualityGrassDensity=isTouchDevice?(isConstrainedMobile?(islandIndex===0?8.8:5.8):(islandIndex===0?10.4:7.0)):(islandIndex===0?8.8:6.2);\""), 'Both graphics profiles must retain grass, with a larger Quality population and a constrained Performance budget.');
assert.ok(builder.includes('#elsnStartupProgressPanel{position:fixed;inset:0;z-index:2147482000') && builder.includes('document.body.appendChild(panel)') && builder.includes('panel.remove();'), 'The cinematic startup HUD must cover the viewport and be removed once gameplay starts.');
assert.ok(builder.includes("#loading .loadBottom{display:none!important}") && builder.includes("elsn-sp-segments") && builder.includes("elsn-sp-track"), 'The obsolete loading footer must be hidden and replaced by one integrated progress rail, without stacked panels.');
assert.ok(builder.includes('grassLodLeafCounts') &&
  builder.includes('selectGrassLod') &&
  builder.includes('batch.selectLod(batch.x,batch.z,viewFocus.x,viewFocus.z,batch.lod)') &&
  builder.includes('batch.lodVertexData[nextLod].applyToMesh(batch.mesh)'),
  'Grass must use near/mid/far geometry LOD on the same instance buffers, without removing grass positions.');
assert.ok(builder.includes("const freezeSpatialStaticWorldMatrices=async()=>") &&
  builder.includes("mesh.computeWorldMatrix(true);") &&
  builder.includes("mesh.freezeWorldMatrix(worldMatrix);") &&
  builder.includes("const staticWorldMatricesFrozen=await freezeSpatialStaticWorldMatrices();"),
  "The Quality scene must freeze only static transforms after dynamic classification, retaining animated systems.");
assert.ok(builder.includes("mesh.__elsnSpatialDynamic||isSpatialDynamicMesh(mesh)") &&
  builder.includes("mesh.skeleton||mesh.morphTargetManager||Number(mesh.billboardMode)>0"),
  "Static transform freezing must exclude dynamic, skinned, morphed and billboard meshes.");
assert.ok(builder.includes('npcBrainRuntime.fallbackComputeLocomotion') &&
  builder.includes('if(npcBrainMissingMethods.length===0)ambientPeople.forEach'),
  "Missing NPC locomotion must use an NPC-only fallback, while an incompatible brain cannot abort the rest of the world update.");
assert.ok(builder.includes('npcBrainDiagnostics.lastProblemKey'),
  "NPC compatibility failures must be logged once per distinct API mismatch, not once per rendered frame.");
assert.ok(builder.includes('const match=/^Villager_') && dialogueRuntime.includes('function dialogueEligibleNpc(npc)') && dialogueRuntime.includes('parts.faction==="enemy"') && dialogueRuntime.includes('role==="warrior"'), 'Ambient villager cards must never attach to VillageGuard combatants or hostile entities.');
assert.ok(builder.includes('visualBodyLocalPosition:visualBody.position.clone()') && builder.includes('modelRootLocalPosition:modelRoot.position.clone()') && builder.includes('visualBody.parent!==root') && builder.includes('modelRoot.parent!==visualBody') && builder.includes('importedRoot.parent!==modelRoot') && builder.includes('worldMatrix.decompose(worldScale,worldRotation,worldPosition)'), 'Enemy GLB bodies must reattach to the exact combat root using calibrated local transforms.');
assert.ok(builder.includes('rootDetachRepairs') && builder.includes('visualParentRepairs') && builder.includes('importedRootRepairs') && builder.includes('combat_damage_replacement') && builder.includes('enemy_ai_alive_replacement'), 'Enemy diagnostics count broken hierarchy repairs and dead logical entities lose damage authority.');
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
assert.ok(validator.includes('"bootstrapAttempts++<80" in dialogue_runtime_source') &&
  validator.includes('Math.min(1000,125+bootstrapAttempts*25)'),
  'Dialogue startup must retry with a low-frequency bounded poll until the game bridge is ready.');

assert.ok(builder.includes('const targetFrameRate=120;'), 'The Quality diagnostics must target high-refresh 120 Hz devices.');
assert.ok(builder.includes('frame_loop_replacement = frame_loop_marker') && builder.includes('frame_clock_replacement = frame_clock_marker') &&
  dialogueRuntime.includes('renderingGroupId=2') && dialogueRuntime.includes('function positionBubbleAtLiveAnchor(slot,npc,scene)') &&
  dialogueRuntime.includes('slot.mesh.parent=null') && dialogueRuntime.includes('liveAttachmentFrames') &&
  dialogueRuntime.includes('scene.onBeforeRenderObservable.add'),
  'NPC dialogue cards must follow the live actor head/root in world space without changing their visual style.');
assert.ok(smoke.includes('npcDialogueAttachmentMotion') && smoke.includes('displacementMeters >= 1.35') && smoke.includes('__ELSN_DIALOGUE_SMOKE_MOVE__'), 'The player startup smoke test must move an NPC and assert that its dialogue card follows in world space.');
assert.ok(smoke.includes('pointerTargetInsideButton') && smoke.includes('const pointerX = rect.left + rect.width * .82') &&
  smoke.includes('await page.mouse.move(point.x, point.y)') && smoke.includes('await page.mouse.down()') &&
  smoke.includes('await page.mouse.up()') && !smoke.includes('campaignButton.click('),
  'The campaign smoke test must perform a real mouse down/up at a verified hit point without locator stability waits or forced DOM clicks.');
assert.ok(smoke.includes("startupHandoff:window.__ELSN_STARTUP_HANDOFF__") &&
  smoke.includes("spatialBuild:window.__ELSN_SPATIAL_BUILD_PROGRESS__"),
  "A startup timeout must preserve the exact handoff phase and spatial work cursor.");

assert.ok(dialogueRuntime.includes('ctx.font="650 46px system-ui, sans-serif"') &&
  dialogueRuntime.includes('{width:2.12,height:1.06,sideOrientation:BABYLON.Mesh.DOUBLESIDE}'),
  'NPC world dialogues must remain readable at mobile camera distance.');

const weaponAnchorStart=source.indexOf('function syncRealWeaponAnchor(');
const weaponAnchorEnd=source.indexOf('function updateRealWeaponPose(',weaponAnchorStart);
const weaponAnchorSource=source.slice(weaponAnchorStart,weaponAnchorEnd);
assert.ok(weaponAnchorStart>=0&&weaponAnchorEnd>weaponAnchorStart,'The real weapon anchor implementation must remain present.');
assert.ok(builder.includes('weapon_parent_marker')&&builder.includes('realWeaponHolder.parent=socket||realPlayerModelPivot;')&&builder.includes('weapon_sync_parent_marker')&&builder.includes('const holderParent=socket||realPlayerModelPivot;')&&builder.includes('if(realWeaponHolder.parent!==holderParent)realWeaponHolder.parent=holderParent;'),'The weapon must use the animated hand socket for both its actual parent and local-space grip calculations, with the player pivot only as fallback.');
assert.ok(builder.includes('weapon_grip_guard_marker')&&builder.includes('B.Vector3.Distance(gripWorld,pivotPosition)>2.25')&&builder.includes('if(realWeaponHolder.parent!==holderParent)realWeaponHolder.parent=holderParent;'),'The grip must be range-checked and recalibrated if the skeleton socket produces a bad world-space position.');
assert.ok(source.includes("e.parts.alive=false;")&&source.includes("guard.parts.alive=true;"),'Dead and reset guards must synchronize their renderable actor lifecycle state.');
assert.ok(source.includes("setFactionBadge(guard.parts,'friendly');"),'A recruited guard must switch its faction indicator to friendly.');
assert.ok(source.includes('hideFactionBadge(parts);crewman.landed=false;crewman.invaderRef=null;parts.faction=\'enemy\';'),'Crew returned to a ship must not retain a detached enemy marker.');

assert.ok(builder.includes('warrior_mesh_visibility_marker') && builder.includes('meshes.forEach(mesh=>{try{mesh.setEnabled(true);}catch(_){}mesh.isVisible=true;mesh.visibility=1;});'), 'The real warrior GLB must explicitly enable its filtered body meshes instead of leaving invisible imported parts.');
assert.ok(builder.includes('warrior_attach_replacement') && builder.includes('visualBody.setEnabled(true);modelRoot.setEnabled(true);parts.root.setEnabled(true);'), 'The real warrior attachment must restore the actor root, body pivot and model root after mounting.');
assert.ok(builder.includes('npc_visual_lod_replacement') && builder.includes('(wantVisible&&!rootEnabled)'), 'NPC distance visibility must recover an accidentally disabled nearby root without reducing mesh detail.');
assert.ok(builder.includes('club_shaft_replacement') && builder.includes('RealCastawayStickBranch') && builder.includes('1.34,.078,M.woodLight'), 'The starting club must keep a clearly readable full-length wooden shaft and forked branch.');
assert.ok(builder.includes('const forwardCarryAxis=modelForward.clone().scale(.62).add(worldUp.scale(.78)).normalize();') && builder.includes('gripWorld.addInPlace(modelRight.scale(.055));') && builder.includes('club.position.y=0;') && builder.includes("RealCastawayStickShaft',club,[0,.68,0]"), 'The staff master pose is gripped in the palm and raised forward/up.');
assert.ok(builder.includes('function ensureNpcOverlayAnchor(parts,force=false){') && builder.includes('badge.parent=overlayAnchor') && builder.includes('back.parent=overlayAnchor') && builder.includes('maintainNpcOverlayAnchors(now);'), 'NPC badges and health bars share a measured/repaired head anchor.');
assert.ok(dialogueRuntime.includes('slot.mesh.parent=null') && dialogueRuntime.includes('positionBubbleAtLiveAnchor(slot,npc,s.scene)') && dialogueRuntime.includes('scene.onBeforeRenderObservable.add') && dialogueRuntime.includes('restoreNearbyNpcVisibility'), 'Dialogue cards follow live world coordinates each frame and restore nearby LOD-hidden NPCs.');
assert.ok(builder.includes('function updateAmbientGullFlight(nowSeconds){') && builder.includes('updateAmbientGullFlight(now);') && builder.includes('scene.onBeforeRenderObservable.add') && !builder.includes('updateAmbientGullFlight(now*.001);') && builder.includes('b.root.position.set(Math.cos(a)*radius-36,altitude+Math.sin(a*2+phase)*.72+Math.sin(flightElapsed*.41+phase)*.12,Math.sin(a)*radius-18);') && builder.includes('b.flightUpdateTicks=(Number(b.flightUpdateTicks)||0)+1;') && builder.includes("if(typeof b.root.isEnabled==='function'&&!b.root.isEnabled())b.root.setEnabled(true);"), 'The five gulls must update after Babylon animation evaluation, retain independent orbit positions and restart their native flight clip.');
assert.ok(builder.includes('window.getGameVisualActorDiagnostics') && builder.includes('visibleMeshCount') && builder.includes('flightPlaying') && builder.includes('leftWingPose') && builder.includes('hostiles'), 'The release must expose read-only visual proof for the club, home warriors, hostile bodies and gull wing motion.');
assert.ok(builder.includes('function maintainActiveEnemyVisuals(nowMs){')&&builder.includes('maintainActiveEnemyVisuals(now);')&&builder.includes('proceduralFallbackBody')&&builder.includes('nearbyHostiles'), 'Every active hostile near the player must recover its visible 3D body independently of health bars, emblems and AI.');
assert.ok(builder.includes('gullWingFlapObserver=scene.onBeforeRenderObservable.add')&&builder.includes('lastMotionAt')&&builder.includes('state.fallback=true'), 'A stalled native gull wing track must trigger articulated fallback flap motion without replacing the native clip.');
assert.ok(builder.includes("b.root.unfreezeWorldMatrix()") && builder.includes("b.root.computeWorldMatrix(true)") && builder.includes("flightLastStepMeters"), 'Gull root transforms must be actively refreshed and stalled motion measured on every render frame.');
assert.ok(smoke.includes("/^Fly(?:_|$)/i.test(bird.flightName||'')"), 'The startup acceptance must accept the native Fly clip even when the GLB adds a per-bird suffix such as Fly_Gull_0.');

assert.ok(builder.includes("calibrated:String(realWeaponAnchorType||'')==='club-local-player-anchor'"), 'Visual diagnostics must report club calibration using the existing live weapon-anchor state.');
const textureInventoryPauseBlock = `if(testModeEnabled&&renderLoopCountBeforeSnapshot>0){
    engine.stopRenderLoop();
    scene.render();
    renderLoopPausedForInventory=true;
   }`;
assert.ok(!source.includes(textureInventoryPauseBlock) &&
  source.includes('const renderLoopPausedForInventory=false;'),
  'Texture inventory must never stop the live render loop; gameplay animation and actor motion must continue during and after the snapshot.');


assert.ok(builder.includes('const spatialWorkSliceBudgetMs=isTouchDevice?3.25:5.25;') &&
  builder.includes('const yieldSpatialWorkFrame=()=>new Promise(resolve=>') &&
  builder.includes('await yieldSpatialWorkFrame();') &&
  builder.includes('const initialDynamicCount=octree.dynamicContent.length') &&
  !builder.includes('Array.from(octree.dynamicContent)') &&
  !builder.includes('scene.meshes.slice()'),
  'Spatial classification and static-matrix freezing must be frame-budgeted without large temporary scene-array copies.');
assert.ok(builder.includes('meshSelectionBabylonOctreeBuildMs:spatialSelectionStats.babylonOctreeBuildMs') &&
  builder.includes('meshSelectionDynamicClassificationMs:spatialSelectionStats.dynamicClassificationMs'),
  'The report must separate native octree creation time from mesh classification time.');
