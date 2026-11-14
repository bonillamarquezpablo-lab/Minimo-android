"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const beach = fs.readFileSync("scripts/nordic/beach-state.js", "utf8");
const dialogue = fs.readFileSync("scripts/npc-dialogue-runtime.js", "utf8");
const recorder = fs.readFileSync("scripts/game-session-recorder.js", "utf8");
const inspection = fs.readFileSync("scripts/nordic/world-inspection.js", "utf8");

assert.match(html, /function makeCivilianLook\([\s\S]*?profiledHumanMesh\('PeasantWoolTunic_/);
assert.match(html, /PeasantWoolSleeveL_/);
assert.match(html, /PeasantWoolSleeveR_/);
assert.doesNotMatch(html, /PeasantShortWoolTunic|delantal corto y estrecho/,
  "Civilian torso clothing must not regress to the short apron-like capsule.");

assert.match(beach, /const halfLength = 0\.19/);
assert.match(beach, /toeCapDistance/);
assert.match(beach, /heelCapDistance/);
assert.doesNotMatch(beach, /toeOffsets|toeCenters|toeRadii/,
  "Footprint toe lobes must remain removed.");

assert.match(dialogue, /core-no-disponible/);
assert.match(dialogue, /lastBlockReason/);
assert.match(dialogue, /projectionHiddenReasons/);
assert.match(dialogue, /npc-outside-camera-frustum/);
assert.match(dialogue, /between\(1200,2800\)/);
assert.doesNotMatch(dialogue, /new BABYLON\.Mesh|MeshBuilder|new B\.Mesh|requestAnimationFrame/);

assert.match(recorder, /npcDialogues: readNpcDialogueDiagnostics\(\)/);
assert.match(recorder, /groundDynamics/);
assert.match(recorder, /snapshot && snapshot\.collisions/);
assert.match(recorder, /structureCandidates/);
assert.match(recorder, /actors\.ambientPeople/);
assert.match(inspection, /collisions: \{/);
assert.match(inspection, /worldColliderCount/);
assert.match(inspection, /terrainObjects/);

console.log("Runtime issue diagnostics: PASS (civilian tunics, natural footprints, dialogue visibility, collisions and session evidence).");
