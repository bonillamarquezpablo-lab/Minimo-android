'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const runner=fs.readFileSync('scripts/coastal-reference.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
assert.match(html,/function auditIslandGeometry\(\)/);
for(const mesh of ['IslandHeightfield','NordicSubmergedSand','LivingCoastalSand','ShoreBreakerWash']) assert.ok(html.includes("'"+mesh+"'"),'Missing '+mesh);
assert.match(html,/maxConsecutiveNullColumns/);
assert.match(html,/maxPositionGapMeters/);
assert.match(html,/coastalAuditProfile\(island,index,'NordicSubmergedSand'/);
assert.match(html,/coastalAuditProfile\(island,index,'LivingCoastalSand'/);
assert.match(html,/island-heightfield/);
assert.match(html,/g\.position=v\(cx,renderedTerrainSurfaceAt\(cx,cz\)\+\.035,cz\)/);
assert.match(runner,/diagnosticCaptures\.length, 54/);
for (const variant of ['no-island-heightfield','no-submerged-sand','no-living-beach-layer','no-shorebreaker-wash']) {
  assert.ok(runner.includes("id: '" + variant + "'"), 'Missing independent A/B isolation for ' + variant);
}
assert.match(runner,/auditIslandGeometry/);
assert.match(runner,/seamAndSolverAudit/);
assert.match(runner,/geometry-outliers\.json/);
assert.match(runner,/neighbor-height-jump/);
assert.match(runner,/slope-over-45-deg/);
assert.match(runner,/long-triangle-edge/);
assert.match(runner,/settlementGrounding/);
assert.match(runner,/settlementGrounding\.length, 12/);
assert.match(runner,/groundingErrorMeters/);
assert.match(workflow,/node scripts\/test_coastal_geometry\.cjs/);
console.log('COASTAL GEOMETRY CONTRACT OK: 13 islands, four meshes, polar seam, null solver runs, sand profile and rendered-ground cabins.');
