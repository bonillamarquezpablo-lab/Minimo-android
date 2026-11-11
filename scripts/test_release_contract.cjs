'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const buildSite=fs.readFileSync('scripts/build_site.py','utf8');
const serviceWorker=fs.readFileSync('sw.js','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

const expectedVersion=validator.split('EXPECTED_VERSION = "')[1]?.split('"')[0];
const sourceVersion="0.6.274";
const htmlVersion=indexHtml.split('name="el-sin-nombre-build" content="')[1]?.split('"')[0];
const titleVersion=indexHtml.split('Capítulo I: Un hombre sin tierra · ')[1]?.split('<')[0];
const buildVersion=buildSite.split('USER_AGENT = "EL-SIN-NOMBRE-WebBuild/')[1]?.split(' ')[0];
const shellVersion=serviceWorker.split('const SHELL_CACHE = "el-sin-nombre-shell-')[1]?.split('"')[0];

assert.equal(expectedVersion,"0.6.275","The release validator must target the packaged 0.6.275 release.");
for(const [source,version] of Object.entries({sourceHtml:htmlVersion,sourceTitle:titleVersion,sourceBuildUserAgent:buildVersion})) {
  assert.equal(version,sourceVersion,`The source ${source} must remain the 0.6.274 input that build_site upgrades deterministically.`);
}
assert.equal(shellVersion,expectedVersion,"The service-worker cache must be synchronized with the packaged release.");
assert.match(buildSite,/if game_version != "0\.6\.274"/,"The build must only promote the known 0.6.274 source.");
assert.match(buildSite,/html = html\.replace\("0\.6\.274", "0\.6\.275"\)/,"The build must promote every visible source version to 0.6.275.");
assert.match(buildSite,/game_version = "0\.6\.275"/,"The build must validate and package 0.6.275.");
assert.match(deployWorkflow,/group: github-pages-\$\{\{ github\.ref \}\}/,"Pages deployments must be serialized per branch.");
assert.match(deployWorkflow,/uses: actions\/deploy-pages@v5/,"The release must publish through native GitHub Pages.");
assert.ok(!indexHtml.includes('0.6.256'),"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.match(validator,/const backgroundNpcTask=startNpcHumanModels\(\)\.then\(/);
assert.match(validator,/const backgroundFaunaTask=Promise\.resolve\(backgroundNpcTask\)/);
assert.match(validator,/rows=isPerformanceMode\?13/);
assert.doesNotMatch(validator,/resourceResults=await Promise\.allSettled\(\[playerHumanLoadPromise,startNpcHumanModels\(\)\]\)/);
console.log('OK: release validator, HUD, service worker, build and deployment use one synchronized version.');
