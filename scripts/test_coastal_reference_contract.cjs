'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /const testModeEnabled=new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'/);
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
