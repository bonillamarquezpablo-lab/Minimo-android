'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /const testModeEnabled=new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'/);
assert.match(html, /testModeEnabled\|\|new URLSearchParams\(window\.location\.search\)\.get\('debug'\)==='1'/);
assert.match(html, /if\(testModeEnabled\)\{[\s\S]*?window\.__ELSN_TEST__=/);
for (const api of ['setCamera:', 'setWaterState:', 'diagnostics:', 'stop:', 'render:']) {
  assert.ok(html.includes(api), `Missing deterministic test hook: ${api}`);
}
assert.match(html, /window\.__ELSN_TEST__=\{/);
assert.match(html, /debugForcedTideOffset=tide==='natural'\?null:Number\(tide\)/);
console.log('COASTAL REFERENCE CONTRACT OK');
