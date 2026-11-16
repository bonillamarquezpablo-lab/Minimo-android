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
    'const spatialVegetationMotionPattern=/^(?:treeCanopyWindPivot|fallingTree|fallingForestTree)/i;',
  'const spatialWaterMotionPattern=',
  'const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|',
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
  'spatialSelectionStats.dynamicFilterEnabled=false;',
  'buildSpatialSelectionOctree();',
  'meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled',
  "get:()=>({...spatialSelectionStats})",
  'Diagnostics are read through the on-demand getter; no publication or allocation here.',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
  'meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason',
  'meshSelectionInitialDynamicCount:spatialSelectionStats.babylonInitialDynamicCount',
  'meshSelectionBuildMs:spatialSelectionStats.buildMs'
]) assert.ok(builder.includes(marker),'Missing dynamic-safe spatial selection guard: '+marker);

for(const marker of [
  'scene.createOrUpdateSelectionOctree(64,3)',
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled'
]) assert.ok(validator.includes(marker),'Release validator does not require '+marker);

assert.ok(smoke.includes('window.__ELSN_SPATIAL_SELECTION__'),'Real campaign smoke must read the runtime spatial selection state.');
for(const field of ['meshSelectionDynamicFilterTotalCandidates','meshSelectionDynamicFilterTotalMs','meshSelectionDynamicFilterAverageMs','meshSelectionDynamicFilterCullRatio']) assert.ok(recorder.includes(field+': number(runtime.'+field+'))','Session report must preserve '+field+'.');
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
assert.ok(builder.includes('highHeadroomQualityMobile?2.10:1.45'),'The S26 native Quality render scale must remain unchanged.');
assert.ok(builder.includes('renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))'),'Mobile AA quality must remain unchanged.');
assert.ok(!builder.includes('scene.freezeActiveMeshes('),'The optimization must not freeze the active list and stop dynamic rendering.');
assert.ok(!builder.includes('scene.skipFrustumClipping=true'),'The optimization must not disable frustum culling.');

console.log('OK Babylon spatial selection: safe static Octree, dynamic meshes tracked separately, no false dynamic-frustum claim, Quality resolution and antialiasing unchanged.');
