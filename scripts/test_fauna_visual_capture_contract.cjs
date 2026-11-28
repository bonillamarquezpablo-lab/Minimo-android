'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
const releaseWorkflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const runner = fs.readFileSync('scripts/run-unified-inspector.mjs', 'utf8');
const capture = fs.readFileSync('scripts/fauna-visual-capture.mjs', 'utf8');
const game = fs.readFileSync('index.html', 'utf8');
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
const primaryFaunaStart=releaseWorkflow.indexOf('- name: Verify mobile fauna rigs on CPU skinning, animations, textures and four-view visuals before publish');
const primaryFaunaEnd=releaseWorkflow.indexOf('- name: Diagnostic A/B capture with GPU skinning fallback',primaryFaunaStart);
assert.ok(primaryFaunaStart>=0&&primaryFaunaEnd>primaryFaunaStart&&releaseWorkflow.slice(primaryFaunaStart,primaryFaunaEnd).includes('FAUNA_SKINNING_MODE: cpu')&&releaseWorkflow.slice(primaryFaunaStart,primaryFaunaEnd).includes('timeout-minutes: 25') && releaseWorkflow.slice(primaryFaunaStart,primaryFaunaEnd).includes('python scripts/create_fauna_contact_sheet.py'),
  'Release acceptance must validate all fauna using the stable CPU skinning path with enough time for the full four-view capture.');
assert.ok(releaseWorkflow.includes('timeout-minutes: 30') && releaseWorkflow.includes('# The capture script has a 22-minute global deadline and per-evaluation watchdogs.'),
  'The complete fauna job and its main capture step must have hard upper time bounds.');
assert.ok(capture.includes('const FAUNA_CAPTURE_MAX_RUNTIME_MS = 22 * 60 * 1000') &&
  capture.includes('async function evaluateWithTimeout') && capture.includes('[FAUNA_EVALUATE_TIMEOUT]') &&
  capture.includes('[FAUNA_PROGRESS]') && capture.includes('manifest.currentCapture'),
  'Fauna capture must publish incremental progress and fail with a diagnostic instead of waiting indefinitely in a Playwright evaluation.');
assert.ok(capture.includes('const FAUNA_PAGE_EVALUATE_TIMEOUT_MS = 150000') &&
  capture.includes('const sceneMeshVisibility=(scene.meshes||[]).map(mesh=>({') &&
  capture.includes('const subjectMeshes=new Set(meshes)') &&
  capture.includes('entry.mesh.isVisible=false') && capture.includes('entry.mesh.visibility=0') &&
  capture.includes('entry.mesh.isVisible=entry.isVisible') && capture.includes('entry.mesh.visibility=entry.visibility'),
  'Each fauna view must render only the target animal and restore every original scene-mesh visibility flag afterwards.');
const cpuDiagnosticStart=releaseWorkflow.indexOf('- name: Diagnostic A/B capture with GPU skinning fallback');
const cpuDiagnosticEnd=releaseWorkflow.indexOf('- name: Preserve GPU skinning fallback diagnostic evidence',cpuDiagnosticStart);
assert.ok(releaseWorkflow.includes("id: playwright_install"), 'Playwright installation must be identifiable before optional diagnostic captures.');
assert.ok(cpuDiagnosticStart>=0&&cpuDiagnosticEnd>cpuDiagnosticStart&&releaseWorkflow.slice(cpuDiagnosticStart,cpuDiagnosticEnd).includes('FAUNA_SKINNING_MODE: gpu')&&releaseWorkflow.slice(cpuDiagnosticStart,cpuDiagnosticEnd).includes("if: always() && steps.playwright_install.outcome == 'success'"),
  'The GPU path must remain separately measured as a non-blocking A/B diagnostic; it must not be confused with the required mobile CPU path.');
assert.ok(capture.includes('__ELSN_FAUNA_CAPTURE_SCENE__'));
assert.ok(capture.includes('const number=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(4)):null;\n          const ancestorsContain='),
  'Every isolated Playwright page.evaluate callback must define its own numeric formatter; helpers in prior evaluate contexts are not shared.');
assert.ok(capture.includes("'view '+animal.id+'/'+angle.id,FAUNA_PAGE_EVALUATE_TIMEOUT_MS") &&
  capture.includes("logProgress('view-capture-complete'"),
  'Every individual fauna camera view must have its own timeout and a visible completion marker.');
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
assert.ok(capture.includes('const subjectMeshes=new Set(meshes)') &&
  capture.includes('const sceneMeshVisibility=(scene.meshes||[]).map(mesh=>({') &&
  capture.includes('if(!subjectMeshes.has(entry.mesh))') &&
  capture.includes('entry.mesh.isVisible=false') &&
  capture.includes('entry.mesh.visibility=0') &&
  capture.includes('entry.mesh.isVisible=entry.isVisible') &&
  capture.includes('entry.mesh.visibility=entry.visibility'),
  'Per-animal captures must isolate only the target meshes and restore all other scene meshes exactly after each view.');
assert.ok(capture.includes('minimumWorld') || capture.includes('maximumWorld'));
assert.ok(capture.includes("mesh.skeleton?.getTransformMatrices?.(mesh)") && capture.includes("boundsBasis='babylon-bone-matrices-world'") &&
  capture.includes("typeof mesh.setPositionsForCPUSkinning==='function'") && capture.includes('mesh.setPositionsForCPUSkinning()'),
  'Skinned fauna acceptance must measure original vertices through Babylon bone matrices exactly once, not stale GPU bind-pose bounds or double-skinned CPU vertices.');
assert.ok(capture.includes('Math.min(d.width,d.depth)') && capture.includes('d.height*.30') && capture.includes('minimumBodyDepth'),
  'Fauna visual acceptance must reject limb/antler-only actors with a collapsed body depth even when their maximum extent looks plausible.');
assert.ok(capture.includes('skinnedVertices'));
assert.ok(capture.includes("const skinned=!!mesh.skeleton&&Number(mesh.numBoneInfluencers)>0;"),
  'Rigid accessory meshes that only carry a skeleton reference but have no bone-weight influences must retain native bounds instead of requiring skinning buffers.');
assert.ok(capture.includes('alwaysSelectAsActiveMesh') && capture.includes("code:'skinned-mesh-frustum-culling-enabled'"), 'Fauna acceptance must inspect the final Babylon frustum-protection flag and reject any skinned animal mesh that remains cullable against stale bind-pose bounds.');
assert.ok(capture.includes('maxExtent>.1&&maxExtent<=1.0'), 'A real gull with a measured 0.834 m span must pass the realistic 1 m size ceiling while giant outliers remain rejected.');
assert.ok(game.includes("m.alwaysSelectAsActiveMesh=!!(m.skeleton||Number(m.numBoneInfluencers)>0)"), 'The real coastal gull loader must protect imported skinned body meshes from frustum culling against stale bounds.');
assert.ok(capture.includes("const sampleGullWorldPositions=()=>page.evaluate") &&
  capture.includes("await new Promise(resolve=>setTimeout(resolve,2200))") &&
  capture.includes("visualMeshDisplacementMeters") &&
  capture.includes("code:'gull-flight-translation-stalled'") &&
  capture.includes("requiredDisplacementMeters:.35"),
  'Fauna acceptance must prove real world-space translation of both the gull actor and a rendered mesh; wing animation alone is insufficient.');
assert.ok(capture.includes('animationGroups'));
assert.ok(capture.includes('captureCanvas'));
const rasterCaptureStart=capture.indexOf('const actorWasEnabled=root.isEnabled?.()!==false;');
const rasterCaptureEnd=capture.indexOf('if(backgroundPng){',rasterCaptureStart);
const rasterCaptureBlock=capture.slice(rasterCaptureStart,rasterCaptureEnd);
assert.ok(capture.includes("source:'same-frame-projected-animal-bounds-raster-diff'") &&
  capture.includes('changedPixels>=140') && capture.includes('rasterFillRatio>=.015') && capture.includes('projectedFillRatio:number(projectedFillRatio)') && capture.includes('rasterBoundsSamples') &&
  capture.includes('B.Vector3.Project') && capture.includes('backgroundPng=captureFrame();') &&
  rasterCaptureStart>=0 && rasterCaptureEnd>rasterCaptureStart &&
  !rasterCaptureBlock.includes('requestAnimationFrame') &&
  capture.includes('view.imageIntegrity?.valid===true'),
  'Four-view fauna captures must compare actor-visible and actor-hidden pixels, validate actual raster silhouette density, retain projected-AABB ratio diagnostics, and reject empty captures.');
assert.ok(capture.includes('measuredBounds:animal.bounds') &&
  capture.includes('const min=measuredBounds?.min,max=measuredBounds?.max'),
  'The capture camera must frame the same corrected skinned world bounds as the anatomical report, not stale bind-pose AABBs.');

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
assert.ok(sheet.includes('raster_invalid') && sheet.includes('Capturas sin evidencia raster suficiente') &&
  sheet.includes('rasterVerifiedCount'),
  'The contact sheet must preserve incomplete images and explicitly report their missing visual evidence rather than silently treating them as verified.');

console.log('Fauna visual capture contract: PASS (live animal inventory, rig, texture and animation diagnostics, plus four camera-verified views per animal).');
