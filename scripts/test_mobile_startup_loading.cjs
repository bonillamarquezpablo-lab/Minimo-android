'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const build=fs.readFileSync('scripts/build_site.py','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/game-startup-validation.yml','utf8');
const index=fs.readFileSync('index.html','utf8');
const recorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
const inspector=fs.readFileSync('inspector/unified-workbench.js','utf8');

assert.ok(build.includes('fetchpriority="high"'),'Babylon engine and GLTF loader must be preloaded at high priority.');
assert.ok(build.includes('BABYLON_VERSION = "9.35.0"'));
assert.ok(build.includes('r"7\\.54\\.3"'),'Fallback mirrors must be normalized to the bundled Babylon version.');
assert.ok(build.includes('same-origin-native-script'),'Same-origin Babylon must use a native script URL, not a JS string/Blob copy.');
assert.ok(build.includes("script.async=false;script.fetchPriority='high';script.src=url;"),'Critical Babylon scripts must execute in insertion order and retain high fetch priority.');
assert.ok(build.includes('function loadEngine(url,timeoutMs=30000,check=null)'), 'Native engine script loading must use a bounded 30-second default timeout.');
for (const marker of ['window.__ELSN_RUNTIME_SCRIPT_LOADS','cacheStatus','transferSize','encodedBodySize','decodedBodySize','durationMs']) {
  assert.ok(build.includes(marker), 'Missing native script-load telemetry: ' + marker);
}
assert.ok(index.includes('id="retryEngine"') && index.includes("retryButton.addEventListener('click',retryGameStartup)") &&
  index.includes("retryButton.addEventListener('pointerup',retryGameStartup)"),
  'The player must have a visible, touch-safe retry action after a blocking startup failure.');
assert.ok(recorder.includes('captureStartupScriptLoads') && recorder.includes('startupScriptLoads: captureStartupScriptLoads()') &&
  recorder.includes('startupScriptLoadSummary'), 'Startup transfer/cache diagnostics must be saved with the match report.');
assert.ok(inspector.includes('Arranque del motor 3D') && inspector.includes('startupScriptLoads'),
  'Inspector Center must show the recorded engine startup timings and cache source.');
assert.ok(build.includes("const horizontalMin=Math.max(.055,sourceBounds.height*.045)"),'Animal GLB validation must tolerate valid asymmetric body proportions.');
assert.ok(build.includes("horizontalMajor=Math.max(.18,sourceBounds.height*.14)"),'Animal GLB validation must still reject near-degenerate geometry.');
assert.ok(smoke.includes("document.body.classList.contains('boot-failed')"),'The startup smoke must fail fast with the actual boot error instead of timing out opaquely.');

assert.ok(smoke.includes('identityClickDiagnostics') && smoke.includes('__ELSN_IDENTITY_START_COUNT'), 'The smoke must capture whether the first-run identity button actually started the engine.');
assert.ok(build.includes('identityStartupTriggered=false') && build.includes("continueUnnamedButton.addEventListener('pointerup',startUnnamedIdentity,{once:true})"), 'The identity start controls must be idempotent and pointer-safe.');
assert.ok(build.includes('GLB_IDENTITY_COMPARE_CHUNK_BYTES=256*1024'),'Mobile model integrity checks must compare GLB files in bounded memory blocks.');
assert.ok(build.includes('civilianWarmupPromise=civilianTotal&&!isMobilePeakMemorySensitive'),'The mobile startup must not prefetch both NPC GLBs simultaneously on iOS/Adreno 650.');
assert.ok(build.includes('wildlifeBlobs.delete(kind)'),'Each wildlife GLB source must be released after all its actors are instantiated.');
assert.ok(build.includes('npcStartupPromise=startNpcHumanModels();'),'Protagonist and NPC GLB imports must be staged on memory-sensitive mobile devices.');
assert.ok(build.includes('async function prepareAmbientSmokePuffs()') && build.includes("await prepareAmbientSmokePuffs();"),'All existing ambient smoke pools must be prepared before releasing the loading screen.');
assert.ok(build.includes('habitableAuditAccumulator=0') && build.includes('const initialHabitableAuditStartedAt=performance.now();'), 'The initial building integrity audit must run before the loading screen closes.');
assert.ok(build.includes("recordStartupTask('Auditoría inicial de asentamientos'"), 'The initial audit work must be included in startup timing and diagnostics.');
assert.ok(build.includes('await new Promise(resolve=>requestAnimationFrame(()=>resolve()))'),'Ambient smoke pool creation must yield between small batches to avoid a long task.');
assert.ok(build.includes('isMobilePeakMemorySensitive=!!(isIOSDevice'),'Memory-sensitive scheduling must be selected independently of the Quality/Performance profile.');
assert.ok(!build.includes('qualityDpr=isMobilePeakMemorySensitive'),'The memory policy must not lower the selected graphics profile or render scale.');

assert.ok(build.includes('loadEngineWithCache(url,30000,check,segmentStart,segmentEnd,label)'),
  'Local engine and GLTF script compilation must have a mobile-safe bounded timeout.');
assert.ok(build.includes('loadEngine(url,20000,check)'),
  'Embedded browser fallback must have a bounded but non-aggressive timeout.');
assert.ok(smoke.includes('PLAYER_TEST_MOBILE'));
assert.ok(smoke.includes('Xiaomi 12X emulation'));
assert.ok(smoke.includes('deviceScaleFactor: MOBILE_PROFILE ? 2.75 : 1'));
assert.ok(workflow.includes('Test Xiaomi 12X-class Android mobile startup and cached restart'));
console.log('MOBILE STARTUP LOADING CONTRACT OK');
