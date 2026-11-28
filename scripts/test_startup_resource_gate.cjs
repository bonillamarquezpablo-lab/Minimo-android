'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const indexPath = path.resolve('dist/index.html');
const manifestPath = path.resolve('dist/assets/asset-manifest.json');
const swPath = path.resolve('dist/sw.js');
assert.ok(fs.existsSync(indexPath), 'dist/index.html is missing');
assert.ok(fs.existsSync(manifestPath), 'dist/assets/asset-manifest.json is missing');
assert.ok(fs.existsSync(swPath), 'dist/sw.js is missing');

const html = fs.readFileSync(indexPath, 'utf8');
const sw = fs.readFileSync(swPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const assetPaths = new Set((manifest.assets || []).map(asset => asset.path));
const requiredWildlife = [
  'assets/models/Seagull.glb',
  'assets/models/wildlife/Deer.glb',
  'assets/models/wildlife/Stag.glb',
  'assets/models/wildlife/Wolf.glb'
];

for (const asset of requiredWildlife) {
  assert.ok(assetPaths.has(asset), 'Asset manifest is missing ' + asset);
  const minimumBytes = asset.endsWith('/Seagull.glb') ? 50000 : 100000;
  assert.ok(fs.statSync(path.resolve('dist', asset)).size > minimumBytes, 'Bundled animal GLB is missing or too small: ' + asset);
}
assert.ok(html.includes("const WILDLIFE_ASSET_ROOT=new URL('./assets/models/wildlife/',document.baseURI).href;"),
  'Wildlife must be loaded from the same-origin package.');
assert.ok(!html.includes('https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline'),
  'The player must not fetch animal GLBs from GitHub Raw during startup.');
assert.ok(html.includes('const WILDLIFE_MODEL_CACHE=\'el-sin-nombre-models-wildlife-0128ca51-v1\';'),
  'The wildlife GLBs need a persistent Cache API bucket.');
assert.ok(html.includes("wildlifeCacheOperation") &&
  html.includes("Math.max(500,timeoutMs)") &&
  html.includes("Promise.race([pending,timeout])") &&
  html.includes("cache-open") &&
  html.includes("cache-match") &&
  html.includes("cache-write") &&
  html.includes("window.__ELSN_WILDLIFE_STARTUP_TRACE__"),
  'Persistent wildlife cache reads and writes must be bounded and expose their live stage, so a stalled Cache API cannot hold startup indefinitely.');
assert.ok(html.includes("glb-container-inspection") &&
  html.includes("babylon-import-ready") &&
  html.includes("texture-readiness") &&
  html.includes("rig-validation") &&
  html.includes("network-fetch-start") &&
  html.includes("glb-stream-read") &&
  html.includes("cache-persist"),
  'Wildlife startup evidence must identify the exact model stage that is waiting.');
assert.ok(html.includes('window.__ELSN_STARTUP_RESOURCE_GATE__') && html.includes('startupResourceFailures.length'),
  'The player must publish a final readiness gate based on actual resources.');
assert.ok(html.includes("startupResourceSnapshot.world.islands!==13"));

assert.ok(html.includes("coast:window.__ELSN_INITIAL_COAST_WARMUP__||null"),
  'The startup report must include measured initial beach, seabed, foam and reflection readiness.');
assert.ok(html.includes("!['ready','degraded','degraded-timeout'].includes(startupResourceSnapshot.coast.status)"),
  'The final gate must accept a diagnosed degraded coast after its fixed deadline.');
assert.ok(html.includes("budgetMs:coastBudgetMs")&&html.includes("degraded-timeout")&&
  html.includes("syncActiveBeachIsland")&&html.includes("syncActiveTidalFoamIsland")&&
  html.includes("syncNordicWaterReflectionIsland")&&html.includes("forceCompilationAsync(mesh)")&&
  html.includes("KHR_parallel_shader_compile")&&html.includes("long-animation-frame")&&
  html.includes("frameDiagnostics:window.__ELSN_FRAME_DIAGNOSTICS__"),
  'Coast diagnostics must measure the three stages, enforce 8 seconds, warm reflection shaders asynchronously and export Long Animation Frame evidence.');
assert.ok(html.includes("window.__ELSN_INITIAL_COAST_WARMUP__=coastReport")&&
  html.includes("runCoastStage('syncActiveBeachIsland',()=>syncActiveBeachIsland())")&&
  html.includes("runCoastStage('syncActiveTidalFoamIsland',()=>syncActiveTidalFoamIsland())")&&
  html.includes("runCoastStage('syncNordicWaterReflectionIsland',()=>syncNordicWaterReflectionIsland())"),
  'All three initial coastal preparation routines must run and be measured before world entry, with the coast-specific fallback handled separately.');

assert.ok(html.includes("coastCompileGeneration=0")&&
  html.includes("attempts:0,maxAttempts:2,timeoutMs:4000")&&
  html.includes("Promise.race([compileWork,timeoutWork])")&&
  html.includes("coastCompilePromise=null")&&
  html.includes("compileState.status='deferred'")&&
  html.includes("setCoastReflectionEnabled(true)"),
  'A stalled shader warm-up must time out, permit one fresh recovery attempt, and restore the mirror instead of retaining a pending promise forever.');
assert.ok(html.includes("coastCompilePromise===attemptPromise")&&
  html.includes("attempt!==coastCompileGeneration")&&
  html.includes("coastReport.shaderCompile.status!=='deferred'"),
  'Late shader attempts must not overwrite a newer recovery and a deferred mirror must not be disabled again by the startup gate.');

assert.ok(html.includes("startupResourceSnapshot.fauna.loaded!==3"));
assert.ok(html.includes("glbTimings:glbTimingRecords.slice(-40)") &&
  html.includes("recordGlbTiming('Caballero ") &&
  html.includes("recordGlbTiming('Aldeano ") &&
  html.includes("instanciación y montaje"),
  'Startup diagnostics must expose bounded per-model humanoid import/rig timings without running the Inspector.');
assert.ok(html.includes("setWaterState:({time,tide})=>") &&
  html.includes("tidalFoamAccumulator=Math.max(tidalFoamAccumulator,TIDAL_FOAM_UPDATE_STEP)") &&
  html.includes("animateWater(0)"),
  'The island inspector must set the GPU water clock through the current shoreline update path.');
for (const legacyWaterSymbol of [
  'waterAccumulator','waterNormalAccumulator','waterFarAccumulator',
  'waterVertexStep','waterNormalStep','waterFarStep'
]) {
  assert.ok(!html.includes(legacyWaterSymbol),
    'The generated GPU runtime must not retain stale CPU water cadence variable: ' + legacyWaterSymbol);
}
assert.ok(html.includes("startupResourceSnapshot.fauna.loadedGulls!==5"));
assert.ok(html.includes("startupResourceSnapshot.world.grassClumps<=0"));
assert.ok(html.includes("fauna:'blocking-required'"),
  'Both Quality and Performance must wait for all three terrestrial animals before entry.');
assert.ok(html.includes("fauna:{required:true,requested:wildlifeSpawnSpecs.length"),
  'The startup report must mark terrestrial fauna as required in both profiles.');
assert.ok(html.includes("startupResourceSnapshot.fauna.requested!==3||startupResourceSnapshot.fauna.loaded!==3"),
  'The final readiness gate must verify all three terrestrial species in both profiles.');
assert.ok(html.includes("npcBackgroundLoad:'blocking-before-entry',faunaBackgroundLoad:'blocking-before-entry'"),
  'The session report must not describe required fauna as optional or deferred.');
assert.ok(html.includes("const animalCount=idx===0?3:0;"),
  'The runtime must spawn the same three terrestrial animal instances in both profiles.');
assert.ok(html.includes('waitForPlayableAudio') &&
  html.includes('MenuMusic.preload()') && html.includes('GameplayMusic.preload()'),
  'Both native HTMLAudio soundtracks must remain scheduled for asynchronous preload.');
assert.ok(html.includes('publishStartupAudioReadiness') &&
  html.includes('audioRequiredForEntry:false') &&
  html.includes('startupTimeline:getStartupTimelineSnapshot()'),
  'Audio readiness must be reported after entry and startup phase timings must remain inspectable.');
assert.doesNotMatch(html,/await startupAudioPreload|RECURSO OBLIGATORIO: efectos de sonido/,
  'Audio availability must not block a visually complete playable world.');
assert.ok(html.includes('decodedToAudioBuffer:false'),
  'Menu and gameplay music must remain streamed, not decoded into WebAudio AudioBuffers.');
assert.ok(html.indexOf("Preparando fauna de la isla inicial") < html.indexOf("Preparando texturas y shaders de la zona inicial"),
  'Fauna must be imported before the final initial-view shader/material warm-up.');
assert.ok(sw.includes('const WILDLIFE_MODEL_CACHE = "el-sin-nombre-models-wildlife-0128ca51-v1";'));
assert.ok(sw.includes('WILDLIFE_MODEL_CACHE].includes(key)'),
  'Service Worker activation must preserve the persistent wildlife model cache.');
console.log('STARTUP RESOURCE GATE OK: same-origin fauna, persistent cache, HTMLAudio streaming and bounded coastal readiness fallback.');
