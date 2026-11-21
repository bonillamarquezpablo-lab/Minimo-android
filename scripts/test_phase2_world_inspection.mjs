import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyzeWorldInspectionSnapshot } from './phase2-world-inspection-core.mjs';

const runtimeSource = fs.readFileSync(new URL('./nordic/world-inspection.js', import.meta.url), 'utf8');
const context = { window: {}, console };
vm.runInNewContext(runtimeSource, context, { filename: 'world-inspection.js' });
const capture = context.window.ELSNWorldInspection.capture;

const mesh = {
  uniqueId: 7, name: 'TestMesh', id: 'mesh-7',
  position: { x: 3, y: 2, z: -4 },
  rotation: { x: 0, y: 0, z: 0 },
  scaling: { x: 1, y: 1, z: 1 },
  isVisible: true, checkCollisions: true, visibility: 1,
  material: { name: 'wood' },
  getTotalVertices: () => 24, getTotalIndices: () => 36,
  computeWorldMatrix() {},
  getBoundingInfo: () => ({ boundingBox: {
    minimumWorld: { x: 2, y: 1.5, z: -5 },
    maximumWorld: { x: 4, y: 3, z: -3 }
  } })
};

const buriedMesh = {
  ...mesh, uniqueId: 8, name: 'BuriedProp', id: 'buried-prop',
  position: { x: 9, y: -2.5, z: 8 },
  getBoundingInfo: () => ({ boundingBox: {
    minimumWorld: { x: 8.5, y: -3, z: 7.5 },
    maximumWorld: { x: 9.5, y: -2, z: 8.5 }
  } })
};
const penetratingMesh = {
  ...mesh, uniqueId: 9, name: 'EmbeddedCrate', id: 'embedded-crate',
  position: { x: 10, y: 1, z: 8 },
  getBoundingInfo: () => ({ boundingBox: {
    minimumWorld: { x: 9.5, y: 0.4, z: 7.5 },
    maximumWorld: { x: 10.5, y: 1.6, z: 8.5 }
  } })
};
const footprintOverlay = {
  ...mesh, uniqueId: 10, name: 'NorseMovingFootprints', id: 'footprint-overlay',
  position: { x: 0, y: 0, z: 0 },
  getBoundingInfo: () => ({ boundingBox: {
    minimumWorld: { x: -8, y: 0, z: -8 },
    maximumWorld: { x: 8, y: 0, z: 8 }
  } })
};
const offshoreProp = {
  ...mesh, uniqueId: 11, name: 'OffshoreMooring', id: 'offshore-mooring',
  position: { x: 1000, y: -1, z: 1000 },
  getBoundingInfo: () => ({ boundingBox: {
    minimumWorld: { x: 999.5, y: -2, z: 999.5 },
    maximumWorld: { x: 1000.5, y: -1, z: 1000.5 }
  } })
};
const textureReady = { name: 'ready', isReady: () => true, getSize: () => ({ width: 512, height: 512 }) };
const texturePending = { name: 'pending', isReady: () => false, getSize: () => ({ width: 256, height: 256 }) };
const root = { name: 'PlayerRoot', position: { x: 3, y: 2, z: -4 }, isEnabled: () => true };
const snapshot = capture({
  scene: {
    meshes: [mesh, buriedMesh, penetratingMesh, footprintOverlay, offshoreProp], transformNodes: [root], materials: [{ name: 'wood' }],
    textures: [textureReady, texturePending], animationGroups: [{ name: 'Walk', isPlaying: true, targetedAnimations: [{}] }],
    collisionsEnabled: true, getActiveMeshes: () => ({ length: 1 }), getTotalVertices: () => 24
  },
  land: Array.from({ length: 13 }, (_, index) => ({ name: 'Island ' + index, x: index * 10, z: 0, r: 20 })),
  islandTerrainMeshes: [{ name: 'Terrain' }],
  player: { root }, villages: [{ name: 'Village A', x: 2, z: 4, claimed: true, guards: [] }],
  enemies: [], campGuards: [], companions: [], ambientFauna: [], ambientPeople: [],
  worldColliders: [{ type: 'circle', x: 3, z: 4, r: 1, active: true }], enemyShips: [{ crew: [{ parts: { root: { name: 'RaiderCrew', position: { x: 8, y: 1, z: 2 } } }, alive: true }] }], ambientBirds: [], habitableStructureRegistry: [],
  lastHabitableStructureAudit: {
    schema: 2, total: 1, groundedCount: 0, unsafeCount: 1, untrackedRootCount: 0,
    structures: [{ safe: false, enabled: true, name: 'Unsafe Hut', kind: 'NorseHut', island: 'Island 0', islandIndex: 0, x: 3, z: 5, reason: 'anchor-error' }]
  },
  terrainHeightAt: () => 1.25,
  runtime: { gameStarted: true, worldUpdateCount: 42, fps: 60, graphicsProfile: 'quality' }
});
assert.equal(snapshot.kind, 'babylon-world-inspection');
assert.equal(snapshot.islands.count, 13);
assert.equal(snapshot.scene.pendingTextureCount, 1);
assert.equal(snapshot.meshes.items[0].bounds.finite, true);
assert.equal(snapshot.terrainObjects.fullyBuriedCount, 1);
assert.equal(snapshot.terrainObjects.penetratingCount, 1);
assert.equal(snapshot.terrainObjects.items[0].name, 'BuriedProp');
assert.equal(snapshot.terrainObjects.items[0].worldPosition.x, 9);
assert.equal(snapshot.terrainObjects.items[0].terrain.centerGroundY, 1.25);
assert.equal(snapshot.terrainObjects.items[0].bounds.max.y, -2);
assert.equal(snapshot.terrainObjects.items[0].terrain.objectBottomY, -3);
assert.equal(snapshot.terrainObjects.items[0].terrain.terrainClearanceSamples.length, 5);
assert.ok(snapshot.terrainObjects.items[0].terrain.penetrationDepthMeters > 0.08);
assert.equal(snapshot.terrainObjects.candidateCount, 2,
  'Surface overlays and offshore props must not be reported as land-grounding defects.');
assert.ok(snapshot.terrainObjects.items.every(item => item.nearestIsland !== null));
assert.equal(snapshot.terrainObjects.meshInventoryCount, 5);
assert.equal(snapshot.terrainObjects.meshInventoryReturned, 5);
assert.equal(snapshot.terrainObjects.complete, true);


assert.equal(snapshot.actors.player.groundY, 1.25);
assert.equal(snapshot.actors.player.modelReady, false);
assert.equal(snapshot.terrain.islandsSampled, 13);
assert.equal(snapshot.terrain.sampleCount, 221);
assert.equal(snapshot.islands.items[0].terrainHeights.validSampleCount, 17);
assert.equal(snapshot.collisions.customColliderCount, 1);
assert.equal(snapshot.collisions.invalidPositionCount, 0);
assert.equal(snapshot.actors.enemyShipCrew.count, 1);
assert.equal(snapshot.actors.enemyShipCrew.returned[0].name, 'RaiderCrew');
assert.equal(snapshot.animations.playingCount, 1);
const report = analyzeWorldInspectionSnapshot(snapshot);
assert.equal(report.status, 'findings');
assert.ok(report.findings.some(item => item.code === 'unsafe-structure-visible'));
assert.ok(report.findings.some(item => item.code === 'visible-meshes-below-terrain'));
assert.ok(report.findings.some(item => item.code === 'visible-meshes-intersect-terrain'));

assert.ok(report.findings.some(item => item.code === 'textures-pending-at-capture'));

const truncated = capture({
  scene: { meshes: [mesh, mesh], transformNodes: [], materials: [], textures: [], animationGroups: [], collisionsEnabled: false },
  land: [], player: null, villages: [], enemies: [], campGuards: [], companions: [], ambientFauna: [], ambientPeople: [],
  worldColliders: [], habitableStructureRegistry: [], lastHabitableStructureAudit: null
}, { maxMeshes: 100 });
assert.equal(truncated.islands.complete, false);
assert.equal(analyzeWorldInspectionSnapshot(truncated).status, 'findings');
assert.equal(analyzeWorldInspectionSnapshot(null).status, 'unavailable');

const wildlifeSnapshot = {
  schemaVersion: 1, kind: 'babylon-world-inspection',
  actors: { wildlife: { count: 1, truncated: 0, returned: [{
    name: 'Wolf_0', kind: 'wolf', activeMode: 'walk', activeAnimation: 'Walk',
    meshCount: 2, skinnedMeshCount: 1, skeletons: [{name:'WolfRig',boneCount:24}],
    playingAnimationGroups: 0, animationGroups: [{name:'Walk',playing:false}],
    textureReadiness: {count:2,ready:2,pending:0},
    visualIntegrity: {hasMeshes:true,hasSkinnedMesh:true,hasSkeleton:true,hasFinitePosition:true,hasVisibleGeometry:true},
    position:{x:1,y:0,z:2}, meshes:[]
  }]}}
};
const wildlifeFindings = analyzeWorldInspectionSnapshot(wildlifeSnapshot).findings;
assert.ok(wildlifeFindings.some(item => item.code === 'wildlife-animation-not-playing'),
  'Wildlife capture must flag an active animation mode with no playing group.');
const brokenWildlifeSnapshot = structuredClone(wildlifeSnapshot);
brokenWildlifeSnapshot.actors.wildlife.returned[0].visualIntegrity.hasSkinnedMesh = false;
assert.ok(analyzeWorldInspectionSnapshot(brokenWildlifeSnapshot).findings.some(item => item.code === 'wildlife-visual-rig-invalid'),
  'Wildlife capture must flag missing skinned geometry.');
const wolfTextureReady={name:'wolf-albedo',isReady:()=>true,getSize:()=>({width:1024,height:1024})};
const wolfTexturePending={name:'wolf-normal',isReady:()=>false,getSize:()=>({width:512,height:512})};
const wolfSkeleton={name:'WolfRig',bones:Array.from({length:24},()=>({}))};
const wolfBounds={
 minimum:{x:-.45,y:-.01,z:-.65},maximum:{x:.45,y:.85,z:.65},
 // Deliberately reproduce Babylon's stale GPU-skinned world AABB from the failed release smoke.
 minimumWorld:{x:-2.246,y:2.351,z:21.593},maximumWorld:{x:5.295,y:3.814,z:38.372}
};
const wolfMesh={...mesh,uniqueId:70,name:'WolfBody',id:'wolf-body',skeleton:wolfSkeleton,
 material:{name:'WolfMaterial',getActiveTextures:()=>[wolfTextureReady,wolfTexturePending]},
 getTotalVertices:()=>920,getTotalIndices:()=>1840,
 getWorldMatrix:()=>({m:[1,0,0,0,0,1,0,0,0,0,1,0,1.55,.03,1.75,1]}),
 getBoundingInfo:()=>({boundingBox:wolfBounds})};
const wolfRoot={name:'Wolf_0',position:{x:1.5,y:.03,z:1.7},getChildMeshes:()=>[wolfMesh],isEnabled:()=>true};
const wolfWalk={name:'Walk',isPlaying:false,targetedAnimations:[{}],from:0,to:1,speedRatio:.82};
const wolfActor={kind:'wolf',root:wolfRoot,groups:[wolfWalk],activeAnimation:wolfWalk,activeMode:'walk',
 homeIslandIndex:0,groundOffset:.03,heading:1.2,textureReadiness:{count:2,waitedMs:12}};
const wildlifeCaptured=capture({
 scene:{meshes:[mesh,wolfMesh],transformNodes:[wolfRoot],materials:[wolfMesh.material],
  textures:[wolfTextureReady,wolfTexturePending],animationGroups:[wolfWalk],collisionsEnabled:false,
  getActiveMeshes:()=>({length:2}),getTotalVertices:()=>944},
 land:[],player:null,villages:[],enemies:[],campGuards:[],companions:[],ambientFauna:[wolfActor],
 ambientPeople:[],ambientBirds:[],enemyShips:[],worldColliders:[],habitableStructureRegistry:[],lastHabitableStructureAudit:null
});
const inspectedWolf=wildlifeCaptured.actors.wildlife.returned[0];
assert.equal(inspectedWolf.kind,'wolf');
assert.equal(inspectedWolf.meshCount,1);
assert.equal(inspectedWolf.skinnedMeshCount,1);
assert.equal(inspectedWolf.skeletons[0].boneCount,24);
assert.equal(inspectedWolf.activeAnimation,'Walk');
assert.equal(inspectedWolf.playingAnimationGroups,0);
assert.equal(inspectedWolf.textureReadiness.count,2);
assert.equal(inspectedWolf.textureReadiness.ready,1);
assert.equal(inspectedWolf.textureReadiness.pending,1);
assert.equal(inspectedWolf.bounds.size.y,.86);
assert.equal(inspectedWolf.visualIntegrity.plausibleBounds,true);
assert.ok(inspectedWolf.meshes[0].bounds.finite);
assert.equal(inspectedWolf.meshes[0].bounds.basis,'skinned-bind-pose-local',
  'Skinned meshes must use the local bind-pose AABB transformed once by their live world matrix, not stale GPU world AABBs.');
 assert.equal(inspectedWolf.bounds.size.x,.9);
assert.equal(inspectedWolf.bounds.size.z,1.3);
assert.ok(analyzeWorldInspectionSnapshot(wildlifeCaptured).findings.some(item=>item.code==='wildlife-animation-not-playing'));
assert.ok(analyzeWorldInspectionSnapshot(wildlifeCaptured).findings.some(item=>item.code==='wildlife-textures-not-ready'));

console.log('Phase 2 Babylon world inspection contracts: OK');
