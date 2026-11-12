'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const smoke=fs.readFileSync('scripts/player-startup-smoke.mjs','utf8');
assert.match(html,/installStartupSmokeRecorder/);
assert.match(html,/console\.error=function\(\.\.\.args\)/);
assert.match(html,/addEventListener\('error'/);
assert.match(html,/addEventListener\('unhandledrejection'/);
assert.match(html,/Object\.defineProperty\(player,'modelReady'/);
assert.match(html,/window\.__elSinNombreStartupSmoke\.result=/);
assert.match(html,/playerModelReady:\!\!player\.modelReady/);
assert.doesNotMatch(html,/resourceResults/, 'The removed blocking NPC load result must not be referenced.');
assert.match(smoke,/document\.body\.classList\.contains\('boot-failed'\)/,
  'The browser smoke must stop waiting when the game presents a startup error.');
assert.match(smoke,/querySelector\('#loadHelp'\)\?\.textContent/,
  'The browser smoke must expose the resource/phase error shown to the player.');
assert.match(smoke,/timeout: 180000/,
  'The startup wait must have a bounded, explicit deadline.');

console.log('OK: startup error recorder and player.modelReady check are installed.');
