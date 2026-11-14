'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const smoke = fs.readFileSync('scripts/player-startup-smoke.mjs', 'utf8');

assert.match(smoke, /identityVisible \|\| booting \|\| document\.body\.classList\.contains\('boot-failed'\)/,
  'The startup smoke must detect both the first-run identity screen and returning-player boot path.');
assert.match(smoke, /identityFlow = 'first-run-anonymous'/,
  'The first-run path must explicitly continue without a name.');
assert.match(smoke, /identityFlow = 'returning-player-auto-boot'/,
  'A saved identity must be allowed to proceed directly into boot.');
assert.match(smoke, /preflightState: preflightState|manifest\.preflightState = preflightState/,
  'The startup manifest must preserve the observed preflight state.');
assert.match(smoke, /#intro\\.open/,
  'The smoke must wait for the first rendered campaign selector after the resource barrier.');
assert.match(smoke, /manifest\\.campaignSelector = introReady/,
  'The smoke must record whether the campaign selector became visible.');
assert.match(smoke, /preflight-dom\.html/,
  'Unexpected preflight states must retain the DOM for diagnosis.');
assert.match(smoke, /El selector de perfil no pasó a identidad ni al arranque/,
  'A blocked preflight must fail with actionable state instead of timing out on a hidden button.');
console.log('PLAYER STARTUP FLOW CONTRACT OK: first-run and returning-player paths are both explicit.');
