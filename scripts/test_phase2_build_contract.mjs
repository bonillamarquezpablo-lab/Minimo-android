import assert from 'node:assert/strict';
import fs from 'node:fs';

const build = fs.readFileSync(new URL('./build_site.py', import.meta.url), 'utf8');
const validator = fs.readFileSync(new URL('./validate_release.py', import.meta.url), 'utf8');
const serviceWorker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../inspector/phase1-live.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../inspector/index.html', import.meta.url), 'utf8');
const smoke = fs.readFileSync(new URL('./player-startup-smoke.mjs', import.meta.url), 'utf8');
const game = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const marker of [
  'world_inspection_source = ROOT / "scripts" / "nordic" / "world-inspection.js"',
  'world_inspection_tag = \'<script src="./scripts/nordic/world-inspection.js"></script>\'',
  'world_snapshot_marker = " window.copyGameHealthDebug=()=>{"',
  'window.getGameWorldInspectionSnapshot=(options={})=>',
  'terrainHeightAt:(x,z)=>renderedTerrainSurfaceAt(x,z)',
  'playerDiagnostics:health?.player||null',
  'enemyShips,ambientFauna,ambientPeople,ambientBirds',
  'World inspection runtime JavaScript syntax validation failed:'
]) assert.ok(build.includes(marker), 'Build step missing: ' + marker);

assert.ok(validator.includes('"scripts/nordic/world-inspection.js"'));
assert.ok(validator.includes('root.ELSNWorldInspection'));
assert.ok(serviceWorker.includes('"./scripts/nordic/world-inspection.js"'));
assert.ok(live.includes('getGameWorldInspectionSnapshot'));
assert.ok(live.includes('analyzeWorldInspectionSnapshot'));
for (const id of ['worldInspectionCapture','worldInspectionJson','worldInspectionFindings','worldInspectionDownload']) {
  assert.ok(html.includes('id="' + id + '"'), 'Inspector is missing ' + id);
}
assert.match(smoke, /identityFlow = 'first-run-anonymous'/,
  'The world-inspection smoke must support first-run identity setup.');
assert.match(smoke, /identityFlow = 'returning-player-auto-boot'/,
  'The world-inspection smoke must support saved-player automatic boot.');
assert.ok(smoke.includes("page.locator('#intro.open')"),
  'The smoke must wait for the real intro overlay before selecting a campaign.');
assert.match(smoke, /manifest\.worldInspection\.gameStarted, true/,
  'The Babylon snapshot must be captured after a real campaign starts.');
assert.match(smoke, /cachedIdentityFlow = 'returning-player-auto-boot'/,
  'The warm-cache launch must validate the saved-player path.');
assert.match(smoke, /manifest\.cachedPlayerState = cachedPlayerState/,
  'The world-inspection smoke must revalidate the protagonist after cached startup.');
assert.match(smoke, /cachedPlayerState\.player\?\.modelReady, true/,
  'The player model must remain ready after a cached reload.');
assert.match(smoke, /cachedPlayerState\.recorder\?\.worldReady, true/,
  'The resource barrier must be complete after a cached reload.');
assert.match(smoke, /cachedPlayerState\.player\?\.fallbackVisible, false/,
  'The provisional player must not reappear after a cached reload.');
assert.ok(game.includes('perfAuditFrameCounter%15!==0'),
  'The world-inspection branch must use the initialized performance audit frame counter.');
assert.ok(!game.includes('perfGpuFrameCounter'),
  'The undefined GPU frame counter must not be referenced by the game runtime.');
assert.match(smoke, /Number\(health\?\.worldUpdateCount\) > 0/,
  'The world-inspection smoke must wait for a live world update tick before capturing Babylon.');
assert.match(smoke, /worldInspection\.worldUpdateCount > 0/,
  'The captured Babylon snapshot must contain at least one completed world update.');
console.log('Phase 2 world inspection build and offline contracts: OK');
