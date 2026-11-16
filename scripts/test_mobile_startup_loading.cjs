'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const build=fs.readFileSync('scripts/build_site.py','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/game-startup-validation.yml','utf8');

assert.ok(build.includes('fetchpriority="high"'),'Babylon engine and GLTF loader must be preloaded at high priority.');
assert.ok(build.includes('BABYLON_VERSION = "9.35.0"'));
assert.ok(build.includes('r"7\\.54\\.3"'),'Fallback mirrors must be normalized to the bundled Babylon version.');
assert.ok(build.includes('same-origin-native-script'),'Same-origin Babylon must use a native script URL, not a JS string/Blob copy.');
assert.ok(build.includes("const horizontalMin=Math.max(.055,sourceBounds.height*.045)"),'Animal GLB validation must tolerate valid asymmetric body proportions.');
assert.ok(build.includes("const horizontalMajor=Math.max(.18,sourceBounds.height*.14)"),'Animal GLB validation must still reject near-degenerate geometry.');
assert.ok(smoke.includes("document.body.classList.contains('boot-failed')"),'The startup smoke must fail fast with the actual boot error instead of timing out opaquely.');

assert.ok(build.includes('loadEngineWithCache(url,30000,check,segmentStart,segmentEnd,label)'),
  'Local engine and GLTF script compilation must have a mobile-safe bounded timeout.');
assert.ok(build.includes('loadEngine(url,20000,check)'),
  'Embedded browser fallback must have a bounded but non-aggressive timeout.');
assert.ok(smoke.includes('PLAYER_TEST_MOBILE'));
assert.ok(smoke.includes('Xiaomi 12X emulation'));
assert.ok(smoke.includes('deviceScaleFactor: MOBILE_PROFILE ? 2.75 : 1'));
assert.ok(workflow.includes('Test Xiaomi 12X-class Android mobile startup and cached restart'));
console.log('MOBILE STARTUP LOADING CONTRACT OK');
