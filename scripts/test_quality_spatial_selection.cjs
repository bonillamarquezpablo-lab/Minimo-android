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
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  "scene.onNewMeshAddedObservable.add(mesh=>{if(spatialSelectionOctree)addSpatialDynamicMesh(mesh,'created-after-octree',true);});",
  "mesh.__elsnSpatialDynamicReason='octree-initial-dynamic'",
  'function buildSpatialSelectionOctree()',
  'const freezeSpatialStaticWorldMatrices=()=>{',
  'mesh.computeWorldMatrix(true)',
  'mesh.freezeWorldMatrix(worldMatrix)',
  'mesh.isWorldMatrixFrozen===true',
  'staticWorldMatrixFreezeMs=Number((performance.now()-startedAt).toFixed(2))',
  'mesh.unfreezeWorldMatrix()',
  'spatialSelectionStats.staticWorldMatricesFrozen=frozen',
  'freezeSpatialStaticWorldMatrices();',
  'spatialSelectionStats.dynamicFilterEnabled=false;',
  'buildSpatialSelectionOctree();',
  'meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled',
  "get:()=>({...spatialSelectionStats})",
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
  'meshSelectionInitialDynamicCount:spatialSelectionStats.babylonInitialDynamicCount',
  'meshSelectionBuildMs:spatialSelectionStats.buildMs',
  'meshSelectionStaticWorldMatrixFreezeMs:spatialSelectionStats.staticWorldMatrixFreezeMs'
]) assert.ok(builder.includes(marker),'Missing dynamic-safe spatial selection guard: '+marker);

const freezeStart=builder.indexOf('const freezeSpatialStaticWorldMatrices=()=>{');
const freezeEnd=builder.indexOf('const updateSpatialSelectionCounts=',freezeStart);
assert.ok(freezeStart>=0&&freezeEnd>freezeStart,'Static transform freezing must use a bounded, inspectable helper.');
const freezeSource=builder.slice(freezeStart,freezeEnd);
const movingVisualPattern='const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|NorseMovingFootprints|SunHalo|SunDisc|NordicSkyDome|WindborneLeaf|HearthFlame|HearthSpark|';
assert.ok(builder.includes(movingVisualPattern), 'Footprints, moving sun sprites, windborne leaves, hearth flames and sparks must remain dynamic and must never have their world matrices frozen.');
assert.ok(freezeSource.includes('mesh.__elsnSpatialDynamic')&&freezeSource.includes('isSpatialDynamicMesh(mesh)')&&freezeSource.includes('mesh.computeWorldMatrix(true)')&&freezeSource.includes('mesh.freezeWorldMatrix(worldMatrix)')&&freezeSource.includes('mesh.isWorldMatrixFrozen===true'),
  'Only spatially classified static meshes may have their world transforms frozen.');
const dynamicPromotion=builder.indexOf('mesh.unfreezeWorldMatrix()');
const freezeInvocation=builder.indexOf('freezeSpatialStaticWorldMatrices();');
const dynamicClassification=builder.indexOf('for(const mesh of scene.meshes.slice())if(isSpatialDynamicMesh(mesh))addSpatialDynamicMesh(mesh,null,false,true);');
assert.ok(dynamicPromotion>0&&freezeInvocation>dynamicClassification,
  'Dynamic meshes must be unfrozen when promoted, and the static pass must run only after dynamic classification.');
const dynamicAddStart=builder.indexOf('const addSpatialDynamicMesh=');
const dynamicAddEnd=builder.indexOf('const removeSpatialDynamicMesh=',dynamicAddStart);
assert.ok(dynamicAddStart>=0&&dynamicAddEnd>dynamicAddStart,'Dynamic mesh registration must remain present.');
const dynamicAddSource=builder.slice(dynamicAddStart,dynamicAddEnd);
assert.ok(dynamicAddSource.includes('mesh.__elsnSpatialDynamic')&&dynamicAddSource.includes('dynamic.push(mesh)')&&!dynamicAddSource.includes('dynamic.indexOf(mesh)'),'Dynamic mesh registration must use the existing per-mesh O(1) duplicate flag instead of a repeated linear search.');
assert.ok(dynamicAddSource.includes('deferStats=false') && dynamicAddSource.includes('if(!deferStats)updateSpatialSelectionCounts();') &&
  builder.includes('addSpatialDynamicMesh(mesh,null,false,true);') &&
  builder.includes('for(const mesh of scene.meshes.slice())if(isSpatialDynamicMesh(mesh))addSpatialDynamicMesh(mesh,null,false,true);\n   const staticWorldMatricesFrozen=freezeSpatialStaticWorldMatrices();\n   updateSpatialSelectionCounts();'),
  'Initial dynamic mesh registration must batch global statistics once after the scene scan; live objects must still update stats immediately.');

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
assert.ok(smoke.includes('Dynamic frustum filtering is intentionally not enabled'),'Smoke must not claim dynamic culling before it is integrated into Babylon dynamicContent.');
assert.ok(!builder.includes('const installSpatialDynamicFrustumFilter=octree=>') && !builder.includes('octree.select=function(frustumPlanes,allowDuplicate)'), 'The renderer must not wrap static octree selection as a dynamic-content filter.');
assert.ok(workflow.includes('node scripts/test_quality_spatial_selection.cjs'),'The Pages build must run the spatial selection contract.');
assert.ok(source.includes('function update(dt){'),'World update must remain present.');
assert.ok(source.includes("addSpatialDynamicMesh(mesh,'falling-tree',true)"),'Felled trees must leave static octree cells before their fall animation.');
for(const marker of ['function animateWater(dt)','function updateWildlife(dt)','function updateActiveIslandGrass(dt)','function updateManagedWorldShadowCasters()','function auditHabitableStructures']) {
  assert.ok(source.includes(marker),'A gameplay or visual subsystem was removed: '+marker);
}
assert.ok(builder.includes('highHeadroomQualityMobile?1.80:1.45'),'The S26 native Quality render scale must preserve the original full-resolution profile.');
assert.ok(builder.includes('renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))'),'Mobile AA quality must remain unchanged.');
assert.ok(!builder.includes('scene.freezeActiveMeshes('),'The optimization must not freeze the active list and stop dynamic rendering.');
assert.ok(!builder.includes('scene.skipFrustumClipping=true'),'The optimization must not disable frustum culling.');

assert.ok(recorder.includes('meshSelectionStaticWorldMatrixFreezeMs: number(runtime.meshSelectionStaticWorldMatrixFreezeMs)'), 'Session reports must preserve static-matrix freeze cost.');
console.log('OK Babylon spatial selection: safe static Octree, dynamic meshes tracked separately, no false dynamic-frustum claim, native Quality resolution and antialiasing retained.');
