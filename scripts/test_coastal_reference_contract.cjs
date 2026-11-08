'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const captureRunner = fs.readFileSync('scripts/coastal-reference.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');

assert.match(html, /const testModeEnabled=new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'/);
assert.match(html, /const coastalReferenceMode=new URLSearchParams\(window\.location\.search\)\.get\('coastref'\)==='1'/,
  'Coastal screenshots must use an isolated coast-only startup mode');
assert.match(html, /const playerStartupTestEnabled=new URLSearchParams\(window\.location\.search\)\.get\('playertest'\)==='1'/,
  'Real player GLB verification must have a separate startup-test flag');
assert.match(html, /coastalReferenceMode\?Promise\.resolve\(null\):loadHumanViking\(\)/,
  'Coastal-only runs must not wait for the protagonist GLB');
assert.match(html, /npc:'skipped-coastal-reference'/);
assert.match(html, /fauna:'skipped-coastal-reference'/);
assert.match(html, /window\.__ELSN_PLAYER_STARTUP_SMOKE__/,
  'The independent player startup job needs its own in-page diagnostics');
assert.match(html, /const groundDebugEnabled=new URLSearchParams\(window\.location\.search\)\.get\('debug'\)==='1'/,
  'The existing ground diagnostics must remain controlled only by ?debug=1');
assert.match(html, /const coastalDiagnosticsEnabled=groundDebugEnabled\|\|testModeEnabled/,
  'The test-only coastal metrics must use an independent flag');
assert.doesNotMatch(html, /const groundDebugEnabled=testModeEnabled/,
  'Do not couple the ground and test switches');
assert.match(html, /if\(testModeEnabled\)\{[\s\S]*?window\.__ELSN_TEST__=/,
  'The test hooks must only be created when ?test=1 is present');
assert.match(html, /preserveDrawingBuffer:testModeEnabled/, 'Only test mode may preserve the WebGL drawing buffer for PNG readback');
for (const api of ['setCamera:', 'setWaterState:', 'diagnostics:', 'snapshot:', 'stop:', 'render:', 'captureCanvas:']) {
  assert.ok(html.includes(api), `Missing deterministic test hook: ${api}`);
}
assert.match(html, /window\.__ELSN_TEST__=\{/);
assert.match(html, /debugForcedTideOffset=tide==='natural'\?null:Number\(tide\)/);
console.log('COASTAL REFERENCE CONTRACT OK');

assert.ok(captureRunner.includes('api.captureCanvas()'),
  'Coastal reference images must be read directly from the WebGL canvas, not the HTML page');
assert.ok(!captureRunner.includes('page.screenshot('),
  'Full-page screenshots can include menus/HUD and add unnecessary SwiftShader compositor cost');
assert.ok(workflow.includes('cancel-in-progress: false'),
  'A later PR commit must not cancel a long-running 27-image reference capture');
