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
    minimumWorld: { x: 2, y: 1, z: -5 },
    maximumWorld: { x: 4, y: 3, z: -3 }
  } })
};
const textureReady = { name: 'ready', isReady: () => true, getSize: () => ({ width: 512, height: 512 }) };
const texturePending = { name: 'pending', isReady: () => false, getSize: () => ({ width: 256, height: 256 }) };
const root = { name: 'PlayerRoot', position: { x: 3, y: 2, z: -4 }, isEnabled: () => true };
const snapshot = capture({
  scene: {
    meshes: [mesh], transformNodes: [root], materials: [{ name: 'wood' }],
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
assert.ok(report.findings.some(item => item.code === 'textures-pending-at-capture'));

const truncated = capture({
  scene: { meshes: [mesh, mesh], transformNodes: [], materials: [], textures: [], animationGroups: [], collisionsEnabled: false },
  land: [], player: null, villages: [], enemies: [], campGuards: [], companions: [], ambientFauna: [], ambientPeople: [],
  worldColliders: [], habitableStructureRegistry: [], lastHabitableStructureAudit: null
}, { maxMeshes: 100 });
assert.equal(truncated.islands.complete, false);
assert.equal(analyzeWorldInspectionSnapshot(truncated).status, 'findings');
assert.equal(analyzeWorldInspectionSnapshot(null).status, 'unavailable');
console.log('Phase 2 Babylon world inspection contracts: OK');
