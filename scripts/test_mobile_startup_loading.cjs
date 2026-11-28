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
assert.ok(build.includes("progress_replacement =") && build.includes("currentLoadProgress=targetLoadProgress;") &&
  build.includes("loadProgressLabel.textContent=Math.floor(currentLoadProgress)+'%'") &&
  build.includes("loadProgressTrack.setAttribute('aria-valuenow'"),
  'Every startup milestone must update the visible percentage and accessibility value synchronously, not only queue a future animation frame.');
for (const marker of ['elsnStartupProgressPanel','startupProgressSteps','elsnStartupProgressElapsed','elsnStartupProgressTrack','elsnStartupProgressFill','elsn-sp-segments']) {
  assert.ok(build.includes(marker), 'The loading screen must expose the single cinematic progress HUD: ' + marker);
}
assert.ok(build.includes("#loading .loadBottom{display:none!important}") && build.includes("elsn-sp-content") && build.includes("elsn-sp-track"),
  'The obsolete loading footer must be hidden so only the new cinematic HUD remains visible.');
assert.ok(!build.includes("En esta fase:") && !build.includes(".elsn-sp-grid") && !build.includes("elsn-sp-step"),
  'The loading screen must not reintroduce overlapping text or boxed phase cards.');
assert.ok(smoke.includes("loading-screen-layout.png") && smoke.includes("#elsnStartupProgressPanel .elsn-sp-content") && smoke.includes("loadingScreenLayoutCapture"),
  'The real-player startup smoke must preserve a rendered screenshot of the loading HUD for visual review.');
assert.ok(build.includes("await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));") &&
  build.includes("Yield once before synchronous world construction"),
  'The browser must paint the 40% world-building milestone before synchronous scene generation starts.');

assert.ok(build.includes('BABYLON_VERSION = "9.35.0"'));
assert.ok(build.includes('r"7\\.54\\.3"'),'Fallback mirrors must be normalized to the bundled Babylon version.');
assert.ok(build.includes('same-origin-native-script'),'Same-origin Babylon must use the browser native script loader.');
assert.ok(build.includes("script.async=false;script.fetchPriority='high';script.src=url;"),'Critical Babylon scripts must execute in insertion order and retain high fetch priority.');
assert.ok(build.includes('function loadEngine(url,timeoutMs=30000,check=null)'), 'Native engine script loading must use a bounded 30-second default timeout.');
const nativeLoaderMatch=build.match(/native_loader = r"""([\s\S]*?)\n"""/);
assert.ok(nativeLoaderMatch,'The generated engine loader must be present.');
const nativeLoader=nativeLoaderMatch[1];
assert.ok(nativeLoader.includes("const source=sameOrigin?'same-origin-native-script':'external-script'"),'The engine loader must identify native same-origin script execution.');
assert.ok(nativeLoader.includes('result=await loadEngine(resolved.href,timeoutMs,check)'),'The engine must be executed from its same-origin URL by the browser.');
assert.ok(nativeLoader.includes("setLoadingProgress(progressStart,label+' · carga nativa del navegador…')"),'The loading screen must identify the native browser loading stage.');
assert.ok(!nativeLoader.includes('fetch(') && !nativeLoader.includes('response.body') && !nativeLoader.includes('reader.read()'),'The engine loader must not buffer the script with Fetch streams.');
assert.ok(!nativeLoader.includes('new Blob') && !nativeLoader.includes('URL.createObjectURL') && !nativeLoader.includes('new TextDecoder'),'The engine loader must not duplicate the bundle through Blob or text copies.');
for (const marker of ['window.__ELSN_RUNTIME_SCRIPT_LOADS','cacheStatus','transferSize','encodedBodySize','decodedBodySize','durationMs']) {
  assert.ok(build.includes(marker), 'Missing native script-load telemetry: ' + marker);
}
const terrainStart=index.indexOf('async function createIslandTerrain(');
const terrainEnd=index.indexOf("\n }\n for(let i=0;i<land.length;i++)",terrainStart);
assert.ok(terrainStart>=0 && terrainEnd>terrainStart,'All 13 island heightfields must use the asynchronous startup builder.');
const terrainBuilder=index.slice(terrainStart,terrainEnd);
assert.ok(terrainBuilder.includes('new Float32Array((positions.length/3)*4)'), 'Terrain vertex colours must use a preallocated typed buffer rather than a growing boxed array.');
assert.ok(terrainBuilder.includes('terrainStartupSliceBudgetMs=isConstrainedMobile?4:7'), 'Terrain generation must yield according to a bounded mobile CPU time slice.');
assert.ok(terrainBuilder.includes('await yieldStartupFrame()') && terrainBuilder.includes('setLoadingProgress(40+'), 'Terrain generation must yield to paint the loading screen and report real island progress.');
assert.ok(index.includes('const terrainMesh=await createIslandTerrain(is,i)') && index.includes("recordStartupTask('Terreno 3D · isla '+(i+1)"), 'The 13 initial island heightfields must be awaited and timed independently before player entry.');

assert.ok(index.includes('id="retryEngine"') && index.includes("retryButton.addEventListener('click',retryGameStartup)") &&
  index.includes("retryButton.addEventListener('pointerup',retryGameStartup)"),
  'The player must have a visible, touch-safe retry action after a blocking startup failure.');
assert.ok(recorder.includes('captureStartupScriptLoads') && recorder.includes('startupScriptLoads: captureStartupScriptLoads()') &&
  recorder.includes('startupScriptLoadSummary'), 'Startup transfer/cache diagnostics must be saved with the match report.');
assert.ok(inspector.includes('Arranque del motor 3D') && inspector.includes('startupScriptLoads'),
  'Inspector Center must show the recorded engine startup timings and cache source.');
assert.ok(build.includes("const horizontalMin=Math.max(.055,sourceBounds.height*.045)"),'Animal GLB validation must tolerate valid asymmetric body proportions.');
assert.ok(build.includes("horizontalMajor=Math.max(.18,sourceBounds.height*.14)"),'Animal GLB validation must still reject near-degenerate geometry.');
assert.ok(smoke.includes('startupTimeline = await page.evaluate') && smoke.includes('getGameHealthDebug'), 'The startup smoke must preserve per-task startup timing evidence in its report.');
assert.ok(smoke.includes("document.body.classList.contains('boot-failed')"),'The startup smoke must fail fast with the actual boot error instead of timing out opaquely.');

assert.ok(smoke.includes('identityClickDiagnostics') && smoke.includes('__ELSN_IDENTITY_START_COUNT'), 'The smoke must capture whether the first-run identity button actually started the engine.');
assert.ok(smoke.includes('startupTimeoutDiagnostics') && smoke.includes('elsnStartupProgressStage') &&
  smoke.includes('readiness:safe') && smoke.includes('actorRoots'),
  'A blocked world startup must preserve its exact loading stage, scene readiness and partial fauna state.');
assert.ok(smoke.includes('const IDENTITY_START_WAIT_MS = 45000') && smoke.includes('timeout: IDENTITY_START_WAIT_MS'), 'The identity-start assertion must tolerate the measured mobile main-thread stall instead of failing after 3.5 seconds.');
assert.ok(build.includes('identityStartupTriggered=false') && build.includes("continueUnnamedButton.addEventListener('pointerup',startUnnamedIdentity,{once:true})"), 'The identity start controls must be idempotent and pointer-safe.');
assert.ok(build.includes('GLB_IDENTITY_COMPARE_CHUNK_BYTES=256*1024'),'Mobile model integrity checks must compare GLB files in bounded memory blocks.');
assert.ok(build.includes('let playerHumanLoadPromise=Promise.resolve(null);') && build.includes('playerHumanLoadPromise=loadHumanViking();'), 'Large protagonist GLB import must start only after the static world has been constructed.');
assert.ok(build.includes('syncActiveBeachIsland();') && build.includes('syncActiveTidalFoamIsland();'), 'The first island beach and foam must be prepared before player entry.');
assert.ok(build.includes('syncNordicWaterReflectionIsland();'), 'The active island reflection list must be prepared before the first rendered gameplay frame.');
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
assert.ok(workflow.includes('Test Android-class mobile startup and first 20 seconds of gameplay'), 'The main startup workflow must run the Android-class mobile gameplay smoke.');
console.log('MOBILE STARTUP LOADING CONTRACT OK');
