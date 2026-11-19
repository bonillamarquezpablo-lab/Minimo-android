'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
const runner = fs.readFileSync('scripts/run-unified-inspector.mjs', 'utf8');
const capture = fs.readFileSync('scripts/fauna-visual-capture.mjs', 'utf8');
const sheet = fs.readFileSync('scripts/create_fauna_contact_sheet.py', 'utf8');

assert.match(workflow, /^  push:/m, 'Fauna visual inspection must run automatically after relevant main pushes.');
assert.ok(workflow.includes("'scripts/fauna-visual-capture.mjs'"));
assert.ok(workflow.includes("'scripts/create_fauna_contact_sheet.py'"));
assert.ok(workflow.includes("github.event_name == 'push' && 'complete'"));
assert.ok(workflow.includes('artifacts/fauna-visual-captures/'));
assert.ok(runner.includes('Capturas visuales y diagnóstico de fauna terrestre'));
assert.ok(runner.includes('scripts/fauna-visual-capture.mjs'));
assert.ok(runner.includes('scripts/create_fauna_contact_sheet.py'));
assert.ok(runner.includes('results:{player,texture,grounding,coastal,custom,fauna,beforeAfter}'));
assert.ok(capture.includes('__ELSN_FAUNA_CAPTURE_SCENE__'));
assert.ok(capture.includes('WildlifeActor_'));
assert.ok(capture.includes('RealSeagullActor_'), 'Visual capture must include real gull actors, not only terrestrial animals.');
assert.ok(capture.includes('flightRig'), 'Gull reports must include articulated flight rig evidence.');
assert.ok(capture.includes('gull-flight-rig-incomplete') && capture.includes('gull-flight-animation-stopped'));
assert.ok(capture.includes('getGameWorldInspectionSnapshot'), 'Capture must cross-check the live Inspector wildlife inventory.');
assert.ok(capture.includes('startupDiagnostic') && capture.includes('startup-stalled-before-fauna-actors'),
  'The fauna inspector must preserve partial world/fauna diagnostics when the startup barrier never reaches worldReady.');
assert.ok(capture.includes('FaunaInspectorTemporaryCamera') && capture.includes('temporary-babylon-camera'),
  'The inspector must photograph instantiated animals with a temporary Babylon camera if the game test API is not ready.');
assert.ok(capture.includes("if(!scene||!root)throw new Error("),
  'The temporary Babylon camera fallback must not require the game test API to exist.');
assert.ok(capture.includes('window.__ELSN_FAUNA_CAPTURE_SCENE__||window.BABYLON?.EngineStore?.LastCreatedScene'),
  'The inspector must resolve the live scene even when the render hook has not captured it yet.');
assert.ok(capture.includes('faunaWaitStarted') && capture.includes('actorRoots'));
assert.ok(capture.includes('getChildMeshes'));
assert.ok(capture.includes('minimumWorld') || capture.includes('maximumWorld'));
assert.ok(capture.includes('skinnedVertices'));
assert.ok(capture.includes('animationGroups'));
assert.ok(capture.includes('captureCanvas'));
assert.ok(capture.includes("if(expected!==landAnimals.length||(manifest.startup.worldReady&&expected!==loaded))"),
  'A timed-out startup recorder must not override the number of actors actually mounted in the live scene.');
assert.ok(capture.includes("if(animal.textures.some(texture=>texture.ready===false||texture.ready===null))") &&
  capture.includes("code:'missing-materials'"),
  'Material-only GLBs must not be reported as missing textures; pending textures and missing materials must remain visible.');
assert.ok(sheet.includes('fauna-contact-sheet.jpg'));
assert.ok(sheet.includes('fauna-inspection-report.md'));
console.log('Fauna visual capture contract: PASS (live animal inventory, rig, texture and animation diagnostics, plus four camera-verified views per animal).');
