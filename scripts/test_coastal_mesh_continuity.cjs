'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const build=fs.readFileSync('scripts/build_site.py','utf8');
const release=fs.readFileSync('scripts/validate_release.py','utf8');
const runner=fs.readFileSync('scripts/coastal-reference.mjs','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const validate=fs.readFileSync('.github/workflows/validate-pr.yml','utf8');

assert.ok(build.includes('const y=shoreHeight;'),
  'NordicSubmergedSand must reuse terrainHeightOnIsland; it must not apply seabedHeight twice.');
assert.ok(build.includes('const seabedY=analyticalHeight-.003;'),
  'IslandHeightfield skirt must sit under the same once-evaluated seabed profile.');
assert.ok(build.includes('rows=isPerformanceMode?10:(isTouchDevice?64:96)'),
  'Quality radial density must be increased while Performance keeps its established budget.');
assert.ok(build.includes('function auditCoastalMeshContinuity(onlyIslandIndex=null)'),
  'The runtime must expose the cross-mesh continuity audit.');
assert.ok(build.includes("probe.position=v(land[0].x,.42,land[0].z+land[0].r*1.40);"),
  'The synthetic offshore-hut probe must remain inside the test camera visibility radius after safe-ground relocation.');
assert.ok(build.includes('thresholdMeters=.05'),
  'Cross-mesh seam tolerance must be fixed at 5 cm.');
assert.ok(build.includes('auditCoastalMeshContinuity:(islandIndex=null)=>auditCoastalMeshContinuity(islandIndex)'),
  'The browser test API must expose the cross-mesh audit.');
assert.ok(release.includes('EXPECTED_VERSION = "0.6.280"'));
assert.ok(build.includes('html = html.replace("0.6.274", "0.6.280")'));
assert.ok(release.includes('SAGA DEL NORTE · CAPÍTULO I · 0.6.280'));
assert.ok(release.includes('Capítulo I: Un hombre sin tierra · 0.6.280'));

assert.ok(release.includes('function auditCoastalMeshContinuity(onlyIslandIndex=null)'));
assert.ok(runner.includes("auditCoastalMeshContinuity()"));
assert.ok(runner.includes("meshContinuityAudit?.thresholdMeters, .05"));
assert.ok(runner.includes("meshContinuityAudit?.passed, true"));
assert.ok(deploy.includes('node scripts/test_coastal_mesh_continuity.cjs'));
assert.ok(validate.includes('node scripts/test_coastal_mesh_continuity.cjs'));
console.log('COASTAL MESH CONTINUITY CONTRACT OK: single seabed profile, 5 cm cross-mesh seam audit, 0.6.280 release.');
