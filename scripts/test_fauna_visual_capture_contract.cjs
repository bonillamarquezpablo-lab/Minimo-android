'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
const releaseWorkflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
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
assert.ok(releaseWorkflow.includes('Diagnostic A/B capture with GPU skinning') && releaseWorkflow.includes('FAUNA_SKINNING_MODE: gpu') && releaseWorkflow.includes('FAUNA_CAPTURE_OUTPUT: artifacts/fauna-visual-captures-gpu'),
  'Release validation must retain an independent GPU-skinning fauna diagnostic run.');
const gpuDiagnosticStart=releaseWorkflow.indexOf('- name: Diagnostic A/B capture with GPU skinning');
const gpuDiagnosticEnd=releaseWorkflow.indexOf('- name: Preserve GPU skinning diagnostic evidence',gpuDiagnosticStart);
assert.ok(releaseWorkflow.includes("id: playwright_install"), 'Playwright installation must be identifiable before optional diagnostic captures.');
assert.ok(gpuDiagnosticStart>=0&&gpuDiagnosticEnd>gpuDiagnosticStart&&releaseWorkflow.slice(gpuDiagnosticStart,gpuDiagnosticEnd).includes("if: always() && steps.playwright_install.outcome == 'success'"),
  'GPU skinning diagnostics must still run when the primary CPU-fauna visual acceptance fails.');
assert.ok(capture.includes('__ELSN_FAUNA_CAPTURE_SCENE__'));
assert.ok(capture.includes('const number=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(4)):null;\n          const ancestorsContain='),
  'Every isolated Playwright page.evaluate callback must define its own numeric formatter; helpers in prior evaluate contexts are not shared.');
assert.ok(capture.includes("const SKINNING_MODE = String(process.env.FAUNA_SKINNING_MODE || 'cpu').toLowerCase()") && capture.includes("process.env.FAUNA_CAPTURE_OUTPUT"),
  'Fauna captures must support an explicit CPU/GPU diagnostic mode and isolated output folders.');
assert.ok(capture.includes("window.__ELSN_FORCE_CPU_SKINNING__=mode==='cpu'") && capture.includes("window.__ELSN_FORCE_GPU_SKINNING__=mode==='gpu'") && capture.includes('{mode:SKINNING_MODE}') && capture.includes('hasTouch:true'),
  'The visual inspector must force exactly one requested skinning path before game scripts execute.');
assert.ok(capture.indexOf('window.__ELSN_FORCE_GPU_SKINNING__=mode===\'gpu\'')<capture.indexOf("await page.goto(BASE_URL+'?test=1&fauna-inspector=1'"),
  'Both skinning overrides must be set before the game loads.');
assert.ok(capture.includes('WildlifeActor_'));
assert.ok(capture.includes('RealSeagullActor_'), 'Visual capture must include real gull actors, not only terrestrial animals.');
assert.ok(capture.includes('flightRig'), 'Gull reports must include articulated flight rig evidence.');
assert.ok(capture.includes('gull-flight-rig-incomplete') && capture.includes('gull-flight-animation-stopped'));
assert.ok(capture.includes('gull-native-flight-clip-missing') && capture.includes('gull-native-flight-tracks-incomplete'),
  'The Inspector must reject the former partial wing-only animation when the full native Fly clip is not active.');
assert.ok(capture.includes("Number(animal.flightRig?.targetedAnimations)<100"),
  'The visual report must require the complete native gull animation track set.');
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
assert.ok(capture.includes("return window.__elSinNombreStartupSmoke?.worldReady===true||") &&
  !capture.includes("document.body.classList.contains('boot-failed')||land>=3||birds>=1"),
  'The animal roots must never short-circuit the mandatory startup barrier before worldReady.');
assert.ok(capture.includes("if(!manifest.startup.worldReady||manifest.startup.bootFailed||manifest.startupDiagnostic.resourceGate?.ready===false)") &&
  capture.includes("manifest.verdict='startup-stalled-before-world-ready'") &&
  capture.includes("No se permite aceptar fauna ni capturas mientras el juego siga en booting"),
  'Fauna visual acceptance must fail before taking animal captures when the full game startup/resource gate is not ready.');
assert.ok(capture.includes("previousActiveCameras=scene.activeCameras") &&
  capture.includes("scene.activeCameras=[]") &&
  capture.includes("scene.activeCamera=temporaryCamera") &&
  capture.includes("scene.activeCamera===temporaryCamera") &&
  capture.includes("scene.activeCameras=previousActiveCameras") &&
  capture.includes("const activeCamera=scene.activeCamera") &&
  capture.includes("activeCamera?.getTarget?.()") &&
  capture.includes("source:'active-babylon-camera'") &&
  !capture.includes("readback=api.sceneViewSnapshot?.()||null"),
  'Temporary fauna captures must verify the actual Babylon render camera rather than the unrelated player-camera snapshot, then restore the prior camera configuration.');
assert.ok(capture.includes('const FAUNA_ROSTER_TIMEOUT_MS = 240000') && capture.includes('timeout:FAUNA_ROSTER_TIMEOUT_MS'),
  'Fauna inspection must allow the complete blocking startup window before declaring the roster missing.');
assert.ok(capture.includes('getChildMeshes'));
assert.ok(capture.includes("if(other!==root&&(/^(?:WildlifeActor_(?:deer|stag|wolf)_\\d+|RealSeagullActor_\\d+)$/.test"),
  'Per-animal captures must hide every other wildlife actor using digit-matching IDs, not a literal backslash sequence.');
assert.ok(capture.includes('minimumWorld') || capture.includes('maximumWorld'));
assert.ok(capture.includes('skinnedVertices'));
assert.ok(capture.includes('animationGroups'));
assert.ok(capture.includes('captureCanvas'));
assert.ok(capture.includes('const visualCaptureCount=manifest.captures.filter(capture=>ANGLES.some(angle=>angle.id===capture.angle)).length') &&
  capture.includes("capture.angle==='bindpose-no-skinning'"),
  'Four cardinal camera views must be counted separately from optional bind-pose diagnostic images.');
assert.ok(capture.includes('assert.equal(manifest.warnings.length,0'),
  'Fauna visual acceptance must fail on unresolved count, geometry, rig, animation, material or texture anomalies.');
assert.ok(capture.includes("if(expected!==landAnimals.length||(manifest.startup.worldReady&&expected!==loaded))"),
  'A timed-out startup recorder must not override the number of actors actually mounted in the live scene.');
assert.ok(capture.includes("if(animal.textures.some(texture=>texture.ready===false||texture.ready===null))") &&
  capture.includes("code:'missing-materials'"),
  'Material-only GLBs must not be reported as missing textures; pending textures and missing materials must remain visible.');
assert.ok(sheet.includes('fauna-contact-sheet.jpg'));
assert.ok(sheet.includes('fauna-inspection-report.md'));
console.log('Fauna visual capture contract: PASS (live animal inventory, rig, texture and animation diagnostics, plus four camera-verified views per animal).');
