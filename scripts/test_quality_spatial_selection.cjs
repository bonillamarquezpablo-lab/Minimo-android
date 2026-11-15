'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const source=fs.readFileSync('index.html','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

for(const marker of [
  'const spatialActorNamePattern=',
  'const spatialActorCamelNamePattern=',
  'const spatialVegetationMotionPattern=',
  'const spatialWaterMotionPattern=',
  'const spatialEffectMotionPattern=',
  'const spatialDynamicReasonForMesh=',
  'const isSpatialDynamicMesh=mesh=>',
  'scene.createOrUpdateSelectionOctree(64,3)',
  'scene.onNewMeshAddedObservable.add',
  'scene.onMeshRemovedObservable.add',
  'function buildSpatialSelectionOctree()',
  'buildSpatialSelectionOctree();',
  'meshSelectionOctreeEnabled:spatialSelectionStats.enabled',
  'meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount',
  'meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount',
  'meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio',
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
assert.ok(smoke.includes('manifest.spatialSelection?.enabled === true'),'Real campaign smoke must fail if spatial selection is not active.');
assert.ok(smoke.includes('manifest.spatialSelection.staticIndexedMeshCount') && smoke.includes('dynamicContentRatio'), 'Real campaign smoke must fail when most meshes are dynamically selected.');
assert.ok(smoke.includes('sceneCount') && smoke.includes(' * 0.35') && smoke.includes(' < 0.65'), 'Startup acceptance must require at least 35% of scene meshes to be static.');
assert.ok(workflow.includes('node scripts/test_quality_spatial_selection.cjs'),'The Pages build must run the spatial selection contract.');
assert.ok(source.includes('function update(dt){'),'World update must remain present.');
for(const marker of ['function animateWater(dt)','function updateWildlife(dt)','function updateActiveIslandGrass(dt)','function updateManagedWorldShadowCasters()','function auditHabitableStructures']) {
  assert.ok(source.includes(marker),'A gameplay or visual subsystem was removed: '+marker);
}
assert.ok(builder.includes('highHeadroomQualityMobile?2.10:1.45'),'The S26 native Quality render scale must remain unchanged.');
assert.ok(builder.includes('renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))'),'Mobile AA quality must remain unchanged.');
assert.ok(!builder.includes('scene.freezeActiveMeshes('),'The optimization must not freeze the active list and stop dynamic rendering.');
assert.ok(!builder.includes('scene.skipFrustumClipping=true'),'The optimization must not disable frustum culling.');

console.log('OK Babylon spatial selection: dynamic meshes tracked, all game systems preserved, Quality resolution and antialiasing unchanged.');
