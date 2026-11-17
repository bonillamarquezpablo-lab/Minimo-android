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
assert.ok(smoke.includes("page.locator('#intro.open')"),
  'The smoke must wait for the first rendered campaign selector after the resource barrier.');
assert.ok(smoke.includes('manifest.campaignSelector = introReady'),
  'The smoke must record whether the campaign selector became visible.');
assert.match(smoke, /preflight-dom\.html/,
  'Unexpected preflight states must retain the DOM for diagnosis.');
assert.match(smoke, /El selector de perfil no pasó a identidad ni al arranque/,
  'A blocked preflight must fail with actionable state instead of timing out on a hidden button.');
assert.match(smoke, /manifest\.cachedPreflightState = cachedPreflightState/,
  'The warm-cache launch must record its own observed preflight state.'); 
assert.match(smoke, /cachedIdentityFlow = 'returning-player-auto-boot'/,
  'A cached launch with a saved identity must use the returning-player path.'); 
assert.match(smoke, /cachedIdentityFlow = 'first-run-anonymous'/,
  'A cached launch without a saved identity must still support first-run setup.'); 
assert.match(smoke, /cachedPreflightState\.bootFailed/,
  'A cached launch must surface boot-failed rather than timing out opaquely.'); 
assert.match(smoke, /manifest\.cachedPlayerState = cachedPlayerState/,
  'The warm-cache launch must verify the real protagonist readiness again.');
assert.match(smoke, /cachedPlayerState\.player\?\.modelReady, true/,
  'The protagonist model must remain ready after a cached reload.');
assert.match(smoke, /cachedPlayerState\.player\?\.fallbackVisible, false/,
  'The provisional player body must not reappear after a cached reload.');
assert.match(smoke, /cachedPlayerState\.recorder\?\.worldReady, true/,
  'The full startup barrier must be ready after a cached reload.');
const offlineStart = smoke.indexOf("manifest.offlineReload = { enabled: true");
assert.ok(offlineStart >= 0, 'The HTTPS acceptance path must test an offline restart.');
const offlineBlock = smoke.slice(offlineStart);
assert.match(offlineBlock, /await page\.close\(\{ runBeforeUnload: false \}\)/,
  'The offline restart must dispose the busy gameplay renderer before navigating.');
assert.match(offlineBlock, /page = await context\.newPage\(\)/,
  'The offline restart must use a fresh page in the same browser context.');
assert.match(offlineBlock, /offlineNavigationResponse\.fromServiceWorker\(\)/,
  'The offline navigation must prove that the Service Worker served the cached shell.');
assert.match(offlineBlock, /offlineNavigationResponse\.status\(\), 200/,
  'The offline cached shell must return HTTP 200.');
const warmLaunch = smoke.slice(smoke.indexOf('// Repeat in the same browser profile'));
assert.match(warmLaunch, /await page\.close\(\{ runBeforeUnload: false \}\)/,
  'The warm launch must dispose of the previous gameplay renderer.');
assert.match(warmLaunch, /warmNavigationResponse\.status\(\) === 200/,
  'The warm launch must verify the new page navigation response.');

console.log('PLAYER STARTUP FLOW CONTRACT OK: first-run and returning-player paths are both explicit.');
