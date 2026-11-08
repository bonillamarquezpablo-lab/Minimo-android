'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const buildSite=fs.readFileSync('scripts/build_site.py','utf8');
const serviceWorker=fs.readFileSync('sw.js','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const expectedVersion=validator.match(/EXPECTED_VERSION = "(\\d+\\.\\d+\\.\\d+)"/)?.[1];
const htmlVersion=indexHtml.match(/<meta\\s+name=["']el-sin-nombre-build["']\\s+content=["'](\\d+\\.\\d+\\.\\d+)["']/i)?.[1];
const titleVersion=indexHtml.match(/<title>[^<]* · (\\d+\\.\\d+\\.\\d+)<\\/title>/)?.[1];
const buildVersion=buildSite.match(/USER_AGENT = "EL-SIN-NOMBRE-WebBuild\\/(\\d+\\.\\d+\\.\\d+)/)?.[1];
const shellVersion=serviceWorker.match(/const SHELL_CACHE = "el-sin-nombre-shell-(\\d+\\.\\d+\\.\\d+)"/)?.[1];
const deployVersion=deployWorkflow.match(/github-pages-release-(\\d+-\\d+-\\d+)/)?.[1]?.replaceAll('-', '.');
for(const [source,version] of Object.entries({validator:expectedVersion,html:htmlVersion,title:titleVersion,build:buildVersion,serviceWorker:shellVersion,deployWorkflow:deployVersion})) {
  assert.ok(version, `Could not read the release version from ${source}`);
  assert.equal(version, expectedVersion, `Release version mismatch in ${source}: expected ${expectedVersion}, got ${version}`);
}
assert.doesNotMatch(indexHtml,/0\\.6\\.256/,"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.match(validator,/const backgroundNpcTask=startNpcHumanModels\(\)\.then\(/);
assert.match(validator,/const backgroundFaunaTask=Promise\.resolve\(backgroundNpcTask\)/);
assert.match(validator,/rows=isPerformanceMode\?13/);
assert.doesNotMatch(validator,/resourceResults=await Promise\.allSettled\(\[playerHumanLoadPromise,startNpcHumanModels\(\)\]\)/);
console.log('OK: release validator matches the non-blocking 0.6.261 startup architecture.');
