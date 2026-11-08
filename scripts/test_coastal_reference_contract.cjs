'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const captureRunner = fs.readFileSync('scripts/coastal-reference.mjs', 'utf8');
const contactSheet = fs.readFileSync('scripts/create_coastal_contact_sheet.py', 'utf8');
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
for (const api of ['setCamera:', 'setIslandShadowReceiving:', 'setWaterState:', 'diagnostics:', 'snapshot:', 'stop:', 'render:', 'captureCanvas:']) {
  assert.ok(html.includes(api), `Missing deterministic test hook: ${api}`);
}
assert.match(html, /window\.__ELSN_TEST__=\{/);
assert.match(html, /debugForcedTideOffset=tide==='natural'\?null:Number\(tide\)/);
assert.match(html,/function terrainDeformationAt\(islandIndex,x,z\)\{\s*const field=terrainDeformationFields\[islandIndex\];if\(!field\|\|!field\.active\.size\)return 0;/, 'Unchanged islands must skip bilinear foot-deformation sampling in the per-vertex coastal update.');
assert.match(html,/const packedTrailTexture=makePatternTexture\('Packed Norse trail earth','#8c7652'/,"Packed earth trails must use a readable warm-earth albedo rather than a near-black base.");
assert.match(html,/packedTrailMaterial\.emissiveColor=new B\.Color3\(\.13,\.085,\.045\)/,"Packed earth trails must retain a subtle brown ambient floor on shaded ridges.");
assert.match(html,/positions\.push\(x,terrainSurfaceAt\(x,z\)\+\.055,z\)/,"Packed earth trails must remain conformed to the live island terrain.");
console.log('COASTAL REFERENCE CONTRACT OK');

assert.ok(captureRunner.includes('api.captureCanvas()'),
  'Coastal reference images must be read directly from the WebGL canvas, not the HTML page');
assert.ok(!captureRunner.includes('page.screenshot('),
  'Full-page screenshots can include menus/HUD and add unnecessary SwiftShader compositor cost');
assert.ok(captureRunner.includes("assert.equal(boot.build, '0.6.272'"), 'The capture must inspect the exact current 0.6.272 candidate.');
assert.match(html,/name="el-sin-nombre-build" content="0\.6\.272"/, 'The scene capture must use the synchronized 0.6.272 HTML build.');
assert.match(captureRunner, /expectedCaptureCount: 36/,
  'The coastal reference must include 27 coast states plus nine mountain-occlusion states.');
assert.match(captureRunner, /id: 'ridge-occlusion'/,
  'The camera matrix must include a direct view across the main island ridge.');
assert.match(captureRunner, /36\/36 complete/,
  'The runner must assert and report all 36 captured views.');
assert.match(contactSheet, /ridge-occlusion/, 'The contact sheet must include the direct mountain-occlusion views.');
assert.match(contactSheet, /36 CAPTURES/, 'The contact sheet must label all 36 frames.');
assert.match(contactSheet, /ridge-occlusion__t037__natural__no-island-shadows\.png/, 'The contact sheet must include a shadow-isolation A/B panel.');
assert.match(captureRunner, /setIslandShadowReceiving\(false\)/, 'The ridge A/B frame must isolate the main-island shadow receiver.');
assert.match(html, /setIslandShadowReceiving:\(enabled\)=>/, 'Shadow isolation must remain available only through the test-mode hook.');
assert.ok(workflow.includes('cancel-in-progress: false'),
  'A later PR commit must not cancel a long-running 27-image reference capture');
