'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const build=fs.readFileSync('scripts/build_site.py','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/game-startup-validation.yml','utf8');

assert.match(build,/fetchpriority="high"/,'Babylon engine and GLTF loader must be preloaded at high priority.');
assert.match(build,/BABYLON_VERSION = "9\\.35\\.0"/);
assert.match(build,/loadSameOriginScriptWithProgress/,'The source must identify the old loader block for replacement.');
assert.match(build,/same-origin-native-script/,'Same-origin Babylon must use a native script URL, not a JS string/Blob copy.');
assert.match(build,/loadEngineWithCache\\(url,30000,check,segmentStart,segmentEnd,label\\)/,
  'Local engine and GLTF script compilation must have a mobile-safe bounded timeout.');
assert.match(build,/loadEngine\\(url,20000,check\\)/,
  'Embedded browser fallback must have a bounded but non-aggressive timeout.');
assert.match(build,/fallback_version_count < 4/,'Every Babylon fallback mirror must match the packaged engine version.');
assert.match(smoke,/PLAYER_TEST_MOBILE/);
assert.match(smoke,/Xiaomi 12X emulation/);
assert.match(smoke,/deviceScaleFactor: MOBILE_PROFILE \\? 2\\.75 : 1/);
assert.match(workflow,/Test Xiaomi 12X-class Android mobile startup and cached restart/);
console.log('MOBILE STARTUP LOADING CONTRACT OK');
