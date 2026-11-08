'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const buildSite=fs.readFileSync('scripts/build_site.py','utf8');
const serviceWorker=fs.readFileSync('sw.js','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

const expectedVersion=validator.split('EXPECTED_VERSION = "')[1]?.split('"')[0];
const htmlVersion=indexHtml.split('name="el-sin-nombre-build" content="')[1]?.split('"')[0];
const titleVersion=indexHtml.split('Capítulo I: Un hombre sin tierra · ')[1]?.split('<')[0];
const buildVersion=buildSite.split('USER_AGENT = "EL-SIN-NOMBRE-WebBuild/')[1]?.split(' ')[0];
const shellVersion=serviceWorker.split('const SHELL_CACHE = "el-sin-nombre-shell-')[1]?.split('"')[0];
const concurrencyGroup=deployWorkflow.split('github-pages-release-')[1]?.split(/[\s\n]/)[0];
const deployVersion=concurrencyGroup?.replaceAll('-', '.');

for(const [source,version] of Object.entries({validator:expectedVersion,html:htmlVersion,title:titleVersion,build:buildVersion,serviceWorker:shellVersion,deployWorkflow:deployVersion})) {
  assert.ok(version, `Could not read the release version from ${source}`);
  assert.equal(version, expectedVersion, `Release version mismatch in ${source}: expected ${expectedVersion}, got ${version}`);
}
assert.ok(!indexHtml.includes('0.6.256'),"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.match(validator,/const backgroundNpcTask=startNpcHumanModels\(\)\.then\(/);
assert.match(validator,/const backgroundFaunaTask=Promise\.resolve\(backgroundNpcTask\)/);
assert.match(validator,/rows=isPerformanceMode\?13/);
assert.doesNotMatch(validator,/resourceResults=await Promise\.allSettled\(\[playerHumanLoadPromise,startNpcHumanModels\(\)\]\)/);
console.log('OK: release validator, HUD, service worker, build and deployment use one synchronized version.');
