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
assert.ok(html.includes('window.__ELSN_STARTUP_RESOURCE_GATE__') && html.includes('startupResourceFailures.length'),
  'The player must publish a final readiness gate based on actual resources.');
assert.ok(html.includes("startupResourceSnapshot.world.islands!==13"));

assert.ok(html.includes("coast:window.__ELSN_INITIAL_COAST_WARMUP__||null"),
  'The startup report must include measured initial beach, seabed, foam and reflection readiness.');
assert.ok(html.includes("startupResourceSnapshot.coast.status!=='ready'"),
  'Gameplay must remain blocked until the complete initial coast is ready.');
assert.ok(html.includes("startup_coast_warmup_code")&&
  html.includes("syncActiveBeachIsland()")&&
  html.includes("syncActiveTidalFoamIsland()")&&
  html.includes("syncNordicWaterReflectionIsland()"),
  'The full initial coastal systems must be built before the player enters the world.');

assert.ok(html.includes("startupResourceSnapshot.fauna.loaded!==3"));
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
  'Both native HTMLAudio soundtracks must reach a playable state before entry.');
assert.ok(html.includes('decodedToAudioBuffer:false'),
  'Menu and gameplay music must remain streamed, not decoded into WebAudio AudioBuffers.');
assert.ok(html.indexOf("Preparando fauna de la isla inicial") < html.indexOf("Preparando texturas y shaders de la zona inicial"),
  'Fauna must be imported before the final initial-view shader/material warm-up.');
assert.ok(sw.includes('const WILDLIFE_MODEL_CACHE = "el-sin-nombre-models-wildlife-0128ca51-v1";'));
assert.ok(sw.includes('WILDLIFE_MODEL_CACHE].includes(key)'),
  'Service Worker activation must preserve the persistent wildlife model cache.');
console.log('STARTUP RESOURCE GATE OK: same-origin fauna, persistent cache, HTMLAudio streaming and complete pre-entry readiness.');
