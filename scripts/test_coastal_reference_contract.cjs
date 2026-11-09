'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const captureRunner = fs.readFileSync('scripts/coastal-reference.mjs', 'utf8');
const contactSheet = fs.readFileSync('scripts/create_coastal_contact_sheet.py', 'utf8');
const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');

assert.match(html, /const testModeEnabled=new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'/);
assert.match(html, /const coastalReferenceMode=new URLSearchParams\(window\.location\.search\)\.get\('coastref'\)==='1'/,
  'Coastal screenshots must use an isolated coast-only startup mode');
assert.match(html, /const playerStartupTestEnabled=new URLSearchParams\(window\.location\.search\)\.get\('playertest'\)==='1'/,
  'Real player GLB verification must have a separate startup-test flag');
assert.match(html, /coastalReferenceMode\?Promise\.resolve\(null\):loadHumanViking\(\)/,
  'Coastal-only runs must not wait for the protagonist GLB');
assert.match(html, /npc:'skipped-coastal-reference'/);
assert.match(html, /fauna:'skipped-coastal-reference'/);
assert.match(html, /window\.__ELSN_PLAYER_STARTUP_SMOKE__/,
  'The independent player startup job needs its own in-page diagnostics');
assert.match(html, /const groundDebugEnabled=new URLSearchParams\(window\.location\.search\)\.get\('debug'\)==='1'/,
  'The existing ground diagnostics must remain controlled only by ?debug=1');
assert.match(html, /const coastalDiagnosticsEnabled=groundDebugEnabled\|\|testModeEnabled/,
  'The test-only coastal metrics must use an independent flag');
assert.doesNotMatch(html, /const groundDebugEnabled=testModeEnabled/,
  'Do not couple the ground and test switches');
assert.match(html, /if\(testModeEnabled\)\{[\s\S]*?window\.__ELSN_TEST__=/,
  'The test hooks must only be created when ?test=1 is present');
assert.match(html, /preserveDrawingBuffer:testModeEnabled/, 'Only test mode may preserve the WebGL drawing buffer for PNG readback');
for (const api of ['setCamera:', 'setIslandShadowReceiving:', 'setWaterState:', 'diagnostics:', 'snapshot:', 'stop:', 'render:', 'captureCanvas:']) {
  assert.ok(html.includes(api), `Missing deterministic test hook: ${api}`);
}
assert.match(html, /window\.__ELSN_TEST__=\{/);
assert.match(html, /setDiagnosticVariant:\(kind,enabled\)=>/,
  'Eight independent material/geometry diagnostic switches must be test-only.');
assert.match(html, /diagnosticWashVisibility=new WeakMap\(\)/);
assert.match(html, /diagnosticWaveBodyVisibility=new WeakMap\(\)/);
assert.match(html, /diagnosticMeshVisibility=new WeakMap\(\)/);
assert.match(html, /setDiagnosticMeshVisible=\(mesh,disabled\)=>/);
for (const kind of ['living-beach-layer','submerged-sand','continuous-shore-foam']) {
  assert.ok(html.includes(`kind==='${kind}'`), `Missing isolated coastal mesh switch: ${kind}`);
}
assert.match(html, /kind==='volumetric-shore-breaker'/,
  'The translucent VolumetricShoreBreaker mesh must have its own test-only isolation switch.');
assert.match(html, /diagnosticWashNormalMaps=new WeakMap\(\)/);
assert.match(html, /diagnosticWashSpeculars=new WeakMap\(\)/);
assert.match(html, /rememberDiagnosticWashMesh\(foam\)/,
  'Lazily-created shoreline meshes must be saved by identity before isolation.');
assert.match(html, /disableShortVertexWaves\?0:1/,
  'Short vertex waves must be independently suppressible in the diagnostic render.');
assert.match(html, /washDiagnosticDepths=coastalDiagnosticsEnabled\?new Float32Array/,
  'Sheet depth probes must only allocate in diagnostic/test mode.');
assert.match(html, /getSheetOpacityDepthDiagnostics/,
  'The A/B manifest must report opacity for vertices submerged by more than 3 cm.');
assert.match(html, /if\(washDiagnosticDepths\)washDiagnosticDepths\[vertex\]=water-terrainY/,
  'Per-vertex film depth must be recorded through the active foam update scope.');
assert.match(html, /debugForcedTideOffset=tide==='natural'\?null:Number\(tide\)/);
assert.match(html,/function terrainDeformationAt\(islandIndex,x,z\)\{\s*const field=terrainDeformationFields\[islandIndex\];if\(!field\|\|!field\.active\.size\)return 0;/, 'Unchanged islands must skip bilinear foot-deformation sampling in the per-vertex coastal update.');
assert.match(html,/const crossSegments=Math\.max\(4,Math\.ceil\(width\/\.20\)\),crossRowWidth=crossSegments\+1;/, 'Packed earth ribbons must be subdivided across their full width.');
assert.match(html,/positions\.push\(x,renderedTerrainSurfaceAt\(x,z\)\+\.055,z\)/, 'Every across-width trail vertex must follow the rendered terrain mesh.');
assert.match(html,/function renderedTerrainSurfaceAt\(x,z\)\{[\s\S]*?terrain\.getHeightAtCoordinates\(x,z\)[\s\S]*?return renderedHeight/, 'Packed trails must sample Babylon GroundMesh height in world coordinates.');
assert.doesNotMatch(html,/terrain\.getHeightAtCoordinates\(dx,dz\)[\s\S]{0,100}terrain\.position\.y\+renderedHeight/, 'Do not offset a world-space GroundMesh height a second time.');
assert.match(html,/for\(let cross=0;cross<crossSegments;cross\+\+\)/, 'Trail indices must cover each across-width terrain-following segment.');
assert.match(html,/for\(let cross=0;cross<=crossSegments;cross\+\+\)\{\s*const across=cross\/crossSegments,side=across\*2-1;/, 'Each cross-section must sample the actual terrain height instead of only the edges.');
assert.match(html,/const foamAlphaMask=new Float32Array\(cols\*rows\)/, 'Foam row/noise opacity factors must be precomputed without dropping samples.');
assert.match(html,/foamAlphaMask\[vertex\]=whiteFoamProfile\*innerFade\*outerFade\*lace/, 'The shoreline foam must reuse its static breakup mask on every update.');
assert.match(html,/waveBodyCrestProfile=new Float32Array\(waveBodyRows\)/, 'Volumetric wave row profiles must be cached once at construction.');
assert.match(html,/washLeadingCellular=new Float32Array\(cols\*washRows\)/, 'Wash breakup factors must be cached per full-resolution vertex.');
assert.match(html,/washFilmCoverage\[vertex\]=window\.NorseCoastalInteraction\.filmCoverage\(washFractions\[row\],washPattern\[vertex\]\)/, 'The water-film coverage function must be evaluated once per static sample.');
assert.match(html,/for\(let step=0;step<5;step\+\+\)\{\s*const delta=sample\(radius\)/, 'The cached shore solver must use a safeguarded secant rather than seven fixed bisections.');
assert.match(html,/const packedTrailTexture=makePatternTexture\('Packed Norse trail earth','#a18a63'/,"Packed earth trails must use a readable warm-earth albedo rather than a near-black base.");
assert.match(html,/packedTrailMaterial\.emissiveColor=new B\.Color3\(\.22,\.15,\.07\)/,"Packed earth trails must retain a subtle brown ambient floor on shaded ridges.");
assert.match(html,/positions\.push\(x,renderedTerrainSurfaceAt\(x,z\)\+\.055,z\)/,"Packed earth trails must remain conformed to the rendered island surface.");
console.log('COASTAL REFERENCE CONTRACT OK');

assert.ok(captureRunner.includes('api.captureCanvas()'),
  'Coastal reference images must be read directly from the WebGL canvas, not the HTML page');
assert.ok(!captureRunner.includes('page.screenshot('),
  'Full-page screenshots can include menus/HUD and add unnecessary SwiftShader compositor cost');
assert.ok(captureRunner.includes("assert.equal(boot.build, '0.6.273'"), 'The capture must inspect the exact current 0.6.273 candidate.');
assert.match(html,/name="el-sin-nombre-build" content="0\.6\.272"/, 'The scene capture must use the synchronized 0.6.273 HTML build.');
assert.match(html,/const vegetationTrailPaths=\[\],packedTrailMeshes=\[\]/, 'The game must keep direct references to its packed-trail meshes for deterministic test isolation.');
assert.match(html,/packedTrailMeshes\.push\(mesh\)/, 'Every generated packed trail must be registered for the test-only A/B capture.');
assert.match(html,/setPackedTrailVisible:\(enabled\)=>\{const trails=packedTrailMeshes/, 'The test-only API must isolate the packed-earth ribbon without changing normal gameplay.');
assert.match(captureRunner,/setPackedTrailVisible\(false\)/, 'The coast capture must produce an A/B frame with packed trails hidden.');
assert.match(captureRunner,/no-packed-trails\.png/, 'The no-trail comparison image must be included in the reference artifact.');
assert.match(captureRunner, /expectedCaptureCount: 36/,
  'The coastal reference must include 27 coast states plus nine mountain-occlusion states.');
assert.match(captureRunner, /id: 'ridge-occlusion'/,
  'The camera matrix must include a direct view across the main island ridge.');
assert.match(captureRunner, /36\/36 complete/,
  'The runner must assert and report all 36 captured views.');
assert.match(captureRunner, /no-shorebreaker-wash/);
assert.match(captureRunner, /no-ocean-normal-map/);
assert.match(captureRunner, /no-volumetric-shore-breaker/);
assert.match(captureRunner, /no-living-beach-layer/);
assert.match(captureRunner, /no-submerged-sand/);
assert.match(captureRunner, /no-continuous-shore-foam/);
assert.match(captureRunner, /'no-volumetric-shore-breaker': \['volumetricShoreBreakerVisible', 'VolumetricShoreBreaker'\]/,
  'The translucent breaker visibility must be checked in its isolated frame.');
assert.match(captureRunner, /assert.equal\(diagnostic.variantState\?\.\[field\], 0/);
assert.match(captureRunner, /assert.ok\(diagnostic.restoredVariantState\?\.\[field\] >= 1/);
assert.match(captureRunner, /oceanVertexAlphaEnabled/);
assert.match(captureRunner, /no-ocean-specular/);
assert.match(captureRunner, /no-short-vertex-waves/);
assert.match(captureRunner, /Ensure lazily-created coast meshes exist before snapshotting their original state/);
assert.match(captureRunner, /api\.setWaterState\(\{ time: 37, tide: 'natural' \}\);\s*const variantState = variant\.kind \? api\.setDiagnosticVariant\(variant\.kind, true\) : null;\s*\/\/ Recompute vertex waves after the source toggle/);
assert.match(captureRunner, /const restoredVariantState = variant\.kind \? api\.setDiagnosticVariant\(variant\.kind, false\) : null;/,
  'Diagnostic variants must be restored after the isolated frame.');
assert.match(captureRunner, /diagnosticCaptures\.length, 18/,
  'Both cameras must capture the baseline and ten controlled A/B variants.');
assert.match(contactSheet, /DIAGNOSTIC_VARIANTS/);
assert.ok(contactSheet.includes('36 CAPTURES + 22 DIAGNOSTIC A/B'),
  'The contact sheet must label all 36 baseline frames and 18 diagnostic A/B captures.');
assert.match(contactSheet, /ridge-occlusion/, 'The contact sheet must include the direct mountain-occlusion views.');
assert.match(contactSheet, /36 CAPTURES/, 'The contact sheet must label all 36 frames.');
assert.match(contactSheet, /no-volumetric-shore-breaker/,
  'The contact sheet must include the isolated translucent breaker sheet.');
assert.match(contactSheet, /no-living-beach-layer/);
assert.match(contactSheet, /no-submerged-sand/);
assert.match(contactSheet, /no-continuous-shore-foam/);
assert.match(contactSheet, /ridge-occlusion__t037__natural__no-island-shadows\.png/, 'The contact sheet must include a shadow-isolation A/B panel.');
assert.match(captureRunner, /setIslandShadowReceiving\(false\)/, 'The ridge A/B frame must isolate the main-island shadow receiver.');
assert.match(html, /setIslandShadowReceiving:\(enabled\)=>/, 'Shadow isolation must remain available only through the test-mode hook.');
assert.ok(workflow.includes('cancel-in-progress: false'),
  'A later PR commit must not cancel a long-running 27-image reference capture');

// The coast solver and static foam profile caches are guarded by the assertions above.

// A/B road isolation is exercised by the 37th diagnostic image.
