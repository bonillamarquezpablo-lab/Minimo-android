'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const source=fs.readFileSync('index.html','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
const recorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

for(const marker of [
  'const spatialActorRootPattern=',
    'const spatialVegetationMotionPattern=/^(?:mixedForestTree|treeCanopyWindPivot|fallingTree|fallingForestTree)/i;',
  'const spatialWaterMotionPattern=',
  'const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|NorseMovingFootprints|SunHalo|SunDisc|NordicSkyDome|WindborneLeaf|HearthFlame|HearthSpark|',
  "if(/^GroundSplashParticleBatch(?:$|[_-])/i.test(name)){if(mesh)mesh.alwaysSelectAsActiveMesh=true;return 'particle-or-effect';}",
  'const spatialEffectMotionPattern=',
  'const spatialDynamicReasonForMesh=',
  'const isSpatialDynamicMesh=mesh=>',
  'scene.createOrUpdateSelectionOctree(64,3)',
  'scene.selectionOctree!==octree',
  "typeof octree.select!=='function'",
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  "scene.onNewMeshAddedObservable.add(mesh=>{if(spatialSelectionOctree)addSpatialDynamicMesh(mesh,spatialDynamicReasonForMesh(mesh)||'created-after-octree',true);});",
  "mesh.__elsnSpatialDynamicReason=spatialDynamicReasonForMesh(mesh)||'octree-initial-dynamic'",
  'async function buildSpatialSelectionOctree()',
  'const freezeSpatialStaticWorldMatrices=async()=>{',
  'mesh.computeWorldMatrix(true)',
  'mesh.freezeWorldMatrix(worldMatrix)',
  'mesh.isWorldMatrixFrozen===true',
  'staticWorldMatrixFreezeMs=Number((performance.now()-startedAt).toFixed(2))',
  'mesh.unfreezeWorldMatrix()',
  'spatialSelectionStats.staticWorldMatricesFrozen=frozen',
  'await freezeSpatialStaticWorldMatrices();',
  'const installSpatialDynamicCandidateFilter=()=>{',
  'const baseGetActiveMeshCandidates=scene.getActiveMeshCandidates;',
  'scene.getActiveMeshCandidates=()=>{',
  'spatialSelectionStats.dynamicFilterEnabled=installSpatialDynamicCandidateFilter();',
  "mesh.__elsnSpatialDynamicReason!=='actor-or-vehicle'",
  'mesh.alwaysSelectAsActiveMesh',
  'mesh.skeleton||mesh.morphTargetManager||Number(mesh.billboardMode)>0',
  'mesh.computeWorldMatrix()',
  'mesh.isInFrustum(scene.frustumPlanes)',
  'scene.skipFrustumClipping',
  'Promise.resolve().then(()=>buildSpatialSelectionOctree())',
  'meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled',
  "get:()=>({...spatialSelectionStats})",
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'meshSelectionBabylonOctreeBuildMs:spatialSelectionStats.babylonOctreeBuildMs',
  'meshSelectionDynamicClassificationMs:spatialSelectionStats.dynamicClassificationMs',
  'meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
  'meshSelectionInitialDynamicCount:spatialSelectionStats.babylonInitialDynamicCount',
  'meshSelectionBuildMs:spatialSelectionStats.buildMs',
  'meshSelectionStaticWorldMatrixFreezeMs:spatialSelectionStats.staticWorldMatrixFreezeMs'
]) assert.ok(builder.includes(marker),'Missing dynamic-safe spatial selection guard: '+marker);

assert.ok(builder.includes("EnemyHumanFallPivot_\\d+|VillageGuard\\d+_\\d+|Villager_\\d+_\\d+|RaiderLongship_\\d+"),
  'Numeric NPC, guard and ship root names must be classified with working regular expressions.');
assert.ok(builder.includes('const spatialDynamicUngroupedMeshSet=new Set()') &&
  builder.includes('const spatialActorBoundsGroups=[]') &&
  builder.includes('scene.selectionOctree!==octree') && builder.includes('octree.dynamicContent=spatialEmptyDynamicContent') &&
  builder.includes('dynamicProviderSuppressed=octree.dynamicContent===spatialEmptyDynamicContent') &&
  builder.includes('base.data[writeIndex++]=mesh') && builder.includes('base.length=writeIndex'),
  'The candidate provider must isolate the static octree, maintain explicit grouped/ungrouped dynamic sets and compact only static candidates in place.');
const freezeStart=builder.indexOf('const freezeSpatialStaticWorldMatrices=async()=>{');
const freezeEnd=builder.indexOf('const updateSpatialSelectionCounts=',freezeStart);
assert.ok(freezeStart>=0&&freezeEnd>freezeStart,'Static transform freezing must use a bounded, inspectable helper.');
const freezeSource=builder.slice(freezeStart,freezeEnd);
const movingVisualPattern='const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|NorseMovingFootprints|SunHalo|SunDisc|NordicSkyDome|WindborneLeaf|HearthFlame|HearthSpark|';
assert.ok(builder.includes(movingVisualPattern), 'Footprints, moving sun sprites, windborne leaves, hearth flames and sparks must remain dynamic and must never have their world matrices frozen.');
assert.ok(freezeSource.includes('mesh.__elsnSpatialDynamic')&&freezeSource.includes('isSpatialDynamicMesh(mesh)')&&freezeSource.includes('mesh.computeWorldMatrix(true)')&&freezeSource.includes('mesh.freezeWorldMatrix(worldMatrix)')&&freezeSource.includes('mesh.isWorldMatrixFrozen===true'),
  'Only spatially classified static meshes may have their world transforms frozen.');
const dynamicPromotion=builder.indexOf('mesh.unfreezeWorldMatrix()');
const freezeInvocation=builder.indexOf('await freezeSpatialStaticWorldMatrices();');
const dynamicClassification=builder.indexOf('const classificationStartedAt=performance.now();');
assert.ok(dynamicPromotion>0&&freezeInvocation>dynamicClassification,
  'Dynamic meshes must be unfrozen when promoted, and the static pass must run only after dynamic classification.');
const dynamicAddStart=builder.indexOf('const addSpatialDynamicMesh=');
const dynamicAddEnd=builder.indexOf('const removeSpatialDynamicMesh=',dynamicAddStart);
assert.ok(dynamicAddStart>=0&&dynamicAddEnd>dynamicAddStart,'Dynamic mesh registration must remain present.');
const dynamicAddSource=builder.slice(dynamicAddStart,dynamicAddEnd);
assert.ok(dynamicAddSource.includes('mesh.__elsnSpatialDynamic')&&dynamicAddSource.includes('dynamic.push(mesh)')&&!dynamicAddSource.includes('dynamic.indexOf(mesh)'),'Dynamic mesh registration must use the existing per-mesh O(1) duplicate flag instead of a repeated linear search.');
assert.ok(dynamicAddSource.includes('deferStats=false') && dynamicAddSource.includes('if(!deferStats)updateSpatialSelectionCounts();') &&
  builder.includes('addSpatialDynamicMesh(mesh,null,false,true);') &&
  builder.includes('const classificationStartedAt=performance.now();') &&
  builder.includes('for(let index=0;index<meshCount;index++){') &&
  builder.includes('const staticWorldMatricesFrozen=await freezeSpatialStaticWorldMatrices();') &&
  builder.includes('updateSpatialSelectionCounts();'),
  'Initial dynamic mesh registration must batch global statistics once after the sliced scene scan; live objects must still update stats immediately.');

for(const marker of [
  'scene.createOrUpdateSelectionOctree(64,3)',
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled'
]) assert.ok(validator.includes(marker),'Release validator does not require '+marker);

assert.ok(smoke.includes('window.__ELSN_SPATIAL_SELECTION__'),'Real campaign smoke must read the runtime spatial selection state.');
for (const field of ['meshSelectionDynamicFilterTotalCandidates','meshSelectionDynamicFilterTotalMs','meshSelectionDynamicFilterAverageMs','meshSelectionDynamicFilterCullRatio']) {
  const marker = field + ': number(runtime.' + field + '),';
  assert.ok(recorder.includes(marker), 'Session report must preserve ' + field + '.');
}
assert.ok(smoke.includes('manifest.spatialSelection?.enabled === true'),'Real campaign smoke must read the runtime spatial selection state.');
assert.ok(smoke.includes('manifest.spatialSelection.staticIndexedMeshCount'),'Real campaign smoke must verify static octree indexing.');
assert.ok(smoke.includes('manifest.spatialSelection.dynamicFilterEnabled, true'),'Real gameplay smoke must require the live dynamic candidate filter.');
assert.ok(smoke.includes('dynamicFilterPasses') && smoke.includes('dynamicFilterLastCandidates') && smoke.includes('dynamicFilterLastCulled'),'Real gameplay smoke must verify candidate filtering and capture actual cull counts.');
assert.ok(builder.includes('const installSpatialDynamicCandidateFilter=()=>{') && builder.includes('scene.getActiveMeshCandidates=()=>{') && builder.includes('baseGetActiveMeshCandidates.call(scene)'), 'Dynamic filtering must use Babylon scene candidate-provider while leaving native octree selection intact.');
assert.ok(!builder.includes('octree.select=function(') && !builder.includes('const installSpatialDynamicFrustumFilter=octree=>'), 'The renderer must never patch the static octree selector itself.');
assert.ok(workflow.includes('node scripts/test_quality_spatial_selection.cjs'),'The Pages build must run the spatial selection contract.');
assert.ok(source.includes('function update(dt){'),'World update must remain present.');
assert.ok(source.includes("addSpatialDynamicMesh(mesh,'falling-tree',true)"),'Felled trees must leave static octree cells before their fall animation.');
for(const marker of ['function animateWater(dt)','function updateWildlife(dt)','function updateActiveIslandGrass(dt)','function updateManagedWorldShadowCasters()','function auditHabitableStructures']) {
  assert.ok(source.includes(marker),'A gameplay or visual subsystem was removed: '+marker);
}
assert.ok(builder.includes('Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?deviceDpr:1.45):1.65)') && builder.includes('qualityLabDprOptions=[1.8,2.1,2.5,3.0,3.75]'),'The current S26 flagship-tier policy must remain unchanged; manual DPR overrides are debug-only.');
assert.ok(builder.includes('renderPipeline.samples=Math.max(1,Math.min(qualityLabEnabled?qualityLabRequestedMsaa:(isTouchDevice?(highHeadroomQualityMobile?2:1):4),maxSamples))'),'Mobile AA quality must remain unchanged.');
assert.ok(!builder.includes('scene.freezeActiveMeshes('),'The optimization must not freeze the active list and stop dynamic rendering.');
assert.ok(!builder.includes('scene.skipFrustumClipping=true'),'The optimization must not disable frustum culling.');

assert.ok(recorder.includes('meshSelectionStaticWorldMatrixFreezeMs: number(runtime.meshSelectionStaticWorldMatrixFreezeMs)'), 'Session reports must preserve static-matrix freeze cost.');
assert.ok(recorder.includes('forestInstancing: typeof window.__ELSN_FOREST_INSTANCING_STATS__') && recorder.includes('rockInstancing: typeof window.__ELSN_ROCK_INSTANCING__'), 'Session reports must persist actual shared forest and rock geometry instance counters.');
for (const field of ['meshSelectionDynamicFilterMode','meshSelectionDynamicProviderSuppressed','meshSelectionDynamicFilterStaticCandidates','meshSelectionDynamicFilterStaticDynamicDuplicates','meshSelectionDynamicFilterGroupChecks','meshSelectionDynamicFilterUngroupedChecks','meshSelectionDynamicUngroupedMeshCount']) {
  assert.ok(recorder.includes(field + ':'), 'Session reports must preserve structural selection evidence: ' + field);
}
const dynamicFilterStart=builder.indexOf('const installSpatialDynamicCandidateFilter=()=>{');
const dynamicFilterEnd=builder.indexOf('spatialSelectionStats.dynamicFilterEnabled=installSpatialDynamicCandidateFilter();',dynamicFilterStart);
assert.ok(dynamicFilterStart>=0&&dynamicFilterEnd>dynamicFilterStart,'The live dynamic candidate filter must remain inspectable.');
const dynamicFilterSource=builder.slice(dynamicFilterStart,dynamicFilterEnd);
assert.ok(dynamicFilterSource.includes('currentRenderId=scene.getRenderId();')&&dynamicFilterSource.includes('mesh.__elsnSpatialFreshUntilRenderId>=currentRenderId'),'The render id must be read once per filter pass and reused for freshness checks.');
assert.ok(dynamicFilterSource.includes('octree.dynamicContent=spatialEmptyDynamicContent') &&
  dynamicFilterSource.includes('for(const group of spatialActorBoundsGroups)') &&
  dynamicFilterSource.includes('for(const mesh of spatialDynamicUngroupedMeshSet)') &&
  dynamicFilterSource.includes('culled=Math.max(0,dynamicCandidates-selected)'),
  'The render path must traverse actor groups and a bounded ungrouped fallback, not every dynamic mesh candidate.');
assert.equal(dynamicFilterSource.split('scene.getRenderId()').length-1,1,'Do not call Scene.getRenderId more than once per filter pass.');
assert.ok(builder.includes('const buildSpatialActorBoundsGroups=async()=>{') && builder.includes('for(let node=mesh;node&&node!==scene;node=node.parent)') && builder.includes('animatedTransformTargets.has(node)') && builder.includes('mesh.__elsnSpatialActorBoundsGroup=group;') && builder.includes('actorBoundsNestedGroupedMeshes'), 'Rigid actor components, including nested neutral GLB pivots, must be grouped once under their common moving root.');
assert.ok(builder.includes('mesh.skeleton||mesh.morphTargetManager||Number(mesh.billboardMode)>0') && builder.includes('animatedTransformTargets.has(node)') && builder.includes('(Array.isArray(node.animations)&&node.animations.length)'), 'Skinned, morph-driven, billboard and independently animated components must remain on the safe per-mesh path.');
assert.ok(dynamicFilterSource.includes('group.lastRenderId!==currentRenderId||group.lastCamera!==scene.activeCamera') &&
  dynamicFilterSource.includes('plane.normal.x*center.x') &&
  dynamicFilterSource.includes('if(!visible)continue;') &&
  dynamicFilterSource.includes('mesh.isInFrustum(scene.frustumPlanes)') &&
  builder.includes('mesh.alwaysSelectAsActiveMesh=true') &&
  builder.includes('mesh.__elsnPreviousAlwaysSelectAsActiveMesh'),
  'Actor-level conservative sphere culling must run once per camera/render, skip whole out-of-frustum groups, and prevent redundant per-member frustum tests while preserving original flags.');
assert.ok(builder.includes('meshSelectionActorBoundsGroupCount:spatialSelectionStats.actorBoundsGroupCount') && builder.includes('meshSelectionActorBoundsGroupsCulled:spatialSelectionStats.actorBoundsGroupsCulled') && builder.includes('meshSelectionDynamicProviderSuppressed:!!spatialSelectionStats.dynamicProviderSuppressed') && builder.includes('meshSelectionDynamicFilterUngroupedChecks:spatialSelectionStats.dynamicFilterLastUngroupedChecks||0') && builder.includes('delete mesh.__elsnSpatialActorBoundsGroup'), 'Actor-group diagnostics and mesh removal cleanup must be included.');
console.log('OK Babylon spatial selection: safe static Octree, dynamic meshes tracked separately, no false dynamic-frustum claim, native Quality resolution and antialiasing retained.');


assert.ok(builder.includes("const spatialBuildProgress=window.__ELSN_SPATIAL_BUILD_PROGRESS__") &&
  builder.includes("timer=setTimeout(finish,20)") &&
  builder.includes("phase='native-octree-build'") &&
  builder.includes("phase='tracking-initial-dynamic'") &&
  builder.includes("phase='classifying-dynamic-meshes'") &&
  builder.includes("phase='freezing-static-matrices'") &&
  builder.includes("phase='complete'"),
  "The time-sliced spatial startup must expose each bounded phase and cap background yields when rAF is throttled.");

assert.ok(builder.includes('const spatialWorkSliceBudgetMs=isTouchDevice?3.25:5.25;') &&
  builder.includes('await yieldSpatialWorkFrame();') &&
  builder.includes('const initialDynamicCount=octree.dynamicContent.length') &&
  !builder.includes('Array.from(octree.dynamicContent)') &&
  !builder.includes('scene.meshes.slice()'),
  'The spatial index preparation must yield between bounded work slices and avoid full-size temporary arrays.');


assert.ok(builder.includes('await yieldSpatialWorkFrame()') &&
  builder.includes('const initialDynamicCount=octree.dynamicContent.length') &&
  !builder.includes('Array.from(octree.dynamicContent)') &&
  !builder.includes('scene.meshes.slice()'),
  'The spatial builder must use frame-budgeted live-collection passes instead of copying the complete scene arrays.');
