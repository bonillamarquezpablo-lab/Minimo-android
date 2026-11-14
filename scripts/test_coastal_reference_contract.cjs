'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const builder = fs.readFileSync('scripts/build_site.py', 'utf8');
const captureRunner = fs.readFileSync('scripts/coastal-reference.mjs', 'utf8');
const contactSheet = fs.readFileSync('scripts/create_coastal_contact_sheet.py', 'utf8');
const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
const unifiedRunner = fs.readFileSync('scripts/run-unified-inspector.mjs', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const validator = fs.readFileSync('scripts/validate_release.py', 'utf8');

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
assert.match(html, /const groundDebugEnabled=new URLSearchParams\(window\.location\.search\)\.get\('grounddebug'\)==='1'/,
  'Terrain and coastal tuning panels must require explicit ?grounddebug=1, not ordinary performance diagnostics');
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

assert.ok(html.indexOf('<script src="./scripts/nordic/coastal-interaction.js"></script>') < html.indexOf("root.__ELSN_COASTAL_RUNTIME_MODE__='module'"),
  'The coastal module must be loaded before the recovery guard and before the game scene script.');
for (const method of ['seabedHeight','waterDepth','waterOpacity','filmSurfaceHeight','filmCoverage']) {
  assert.ok(html.includes("typeof loaded[name]==='function'") && html.includes(method),
    `The startup guard must validate the complete coastal API, including ${method}.`);
}
assert.match(html, /root\.NorseCoastalInteraction=fallback/);
assert.match(html, /root\.__ELSN_COASTAL_RUNTIME_MODE__='inline-fallback'/,
  'A missing module must be recoverable instead of aborting the world constructor.');
assert.match(serviceWorker, /url\.pathname\.includes\("\/scripts\/nordic\/"\)/,
  'The service worker must intercept same-origin Nordic runtime modules.');
assert.match(serviceWorker, /cacheFirst\(request, SHELL_CACHE\)/,
  'Nordic runtime modules must be restored from the versioned shell cache.');

assert.match(html, /window\.__ELSN_TEST__=\{/);
assert.match(html, /setDiagnosticVariant:\(kind,enabled\)=>/,
  'Twelve independent material/geometry diagnostic switches must be test-only.');
assert.match(html, /diagnosticWashVisibility=new WeakMap\(\)/);
assert.match(html, /diagnosticWaveBodyVisibility=new WeakMap\(\)/);
assert.match(html, /diagnosticMeshVisibility=new WeakMap\(\)/);
assert.match(html, /setDiagnosticMeshVisible=\(mesh,disabled\)=>/);
for (const kind of ['living-beach-layer','submerged-sand','continuous-shore-foam','island-heightfield']) {
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
assert.match(html, /const threshold=\.03,depths=\[\],alphas=\[\]/,
  'The isolated film diagnostic must inspect vertices submerged by more than 3 cm.');
assert.match(html, /getSheetOpacityDepthDiagnostics/,
  'The A/B manifest must report opacity for vertices submerged by more than 3 cm.');
assert.match(html, /if\(washDiagnosticDepths\)washDiagnosticDepths\[vertex\]=waterDepth/,
  'Per-vertex film depth must be recorded through the active foam update scope.');
assert.match(html, /const tideOffset=tide==='natural'\?null:\(tide==='high'\?\.28:\(tide==='low'\?-.28:Number\(tide\)\)\)/, 'Test captures must map high/low tide labels to numeric offsets.');
assert.match(html, /debugForcedTideOffset=tideOffset/);
assert.match(html,/function terrainDeformationAt\(islandIndex,x,z\)\{\s*const field=terrainDeformationFields\[islandIndex\];if\(!field\|\|!field\.active\.size\)return 0;/, 'Unchanged islands must skip bilinear foot-deformation sampling in the per-vertex coastal update.');
assert.match(html,/const crossSegments=Math\.max\(4,Math\.ceil\(width\/\.20\)\),crossRowWidth=crossSegments\+1;/, 'Packed earth ribbons must be subdivided across their full width.');
assert.match(html,/positions\.push\(x,renderedTerrainSurfaceAt\(x,z\)\+\.055,z\)/, 'Every across-width trail vertex must follow the rendered terrain mesh.');
assert.match(html,/function renderedTerrainSurfaceAt\(x,z\)\{[\s\S]*?terrain\.getHeightAtCoordinates\(x,z\)[\s\S]*?return renderedHeight/, 'Packed trails must sample Babylon GroundMesh height in world coordinates.');
assert.doesNotMatch(html,/terrain\.getHeightAtCoordinates\(dx,dz\)[\s\S]{0,100}terrain\.position\.y\+renderedHeight/, 'Do not offset a world-space GroundMesh height a second time.');
assert.match(html,/for\(let cross=0;cross<crossSegments;cross\+\+\)/, 'Trail indices must cover each across-width terrain-following segment.');
assert.match(html,/for\(let cross=0;cross<=crossSegments;cross\+\+\)\{\s*const across=cross\/crossSegments,side=across\*2-1;/, 'Each cross-section must sample the actual terrain height instead of only the edges.');
assert.match(html,/const foamAlphaMask=new Float32Array\(cols\*rows\)/, 'Foam row/noise opacity factors must be precomputed without dropping samples.');
assert.match(html,/retreatResidue=new Float32Array\(segments\+1\),backwashVelocity=new Float32Array\(segments\+1\)/,'Backwash must be tracked independently for every shoreline column.');
assert.match(html,/const shorelineBandFade=smooth01\(\(radialOffsetFromShore\+1\.50\)\/\.18\)\*\(1-smooth01\(\(radialOffsetFromShore-\.58\)\/\.22\)\)/,'Visible foam must fade out beyond the measured coastal band.');
assert.match(html,/positions\[offset\]=x;\s*positions\[offset\+1\]=foamWaterDepth>0\?water\+/,'Animated foam vertices must update world-space X and water height in their correct XYZ components.');
assert.match(html,/physicalBackwashVelocity:\{implemented:true,unit:'m\/s'/,'The diagnostics must expose physical backwash speed in metres per second.');
assert.match(html,/foamAlphaMask\[vertex\]=whiteFoamProfile\*innerFade\*outerFade\*lace/, 'The shoreline foam must reuse its static breakup mask on every update.');
assert.match(html,/waveBodyCrestProfile=new Float32Array\(waveBodyRows\)/, 'Volumetric wave row profiles must be cached once at construction.');
assert.match(html,/washLeadingCellular=new Float32Array\(cols\*washRows\)/, 'Wash breakup factors must be cached per full-resolution vertex.');
assert.match(html,/washFilmCoverage\[vertex\]=window\.NorseCoastalInteraction\.filmCoverage\(washFractions\[row\],washPattern\[vertex\]\)/, 'The water-film coverage function must be evaluated once per static sample.');
assert.match(html,/for\(let step=0;step<5;step\+\+\)\{\s*const delta=sample\(radius\)/, 'The cached shore solver must use a safeguarded secant rather than seven fixed bisections.');
assert.match(html,/const packedTrailTexture=makePatternTexture\('Packed Norse trail earth','#a18a63'/,"Packed earth trails must use a readable warm-earth albedo rather than a near-black base.");
assert.match(html,/packedTrailMaterial\.emissiveColor=new B\.Color3\(\.22,\.15,\.07\)/,"Packed earth trails must retain a subtle brown ambient floor on shaded ridges.");
assert.match(html,/positions\.push\(x,renderedTerrainSurfaceAt\(x,z\)\+\.055,z\)/,"Packed earth trails must remain conformed to the rendered island surface.");
assert.match(workflow,/^  unified-inspector:/m,'All inspection phases must run under the single unified inspector job.');
assert.match(unifiedRunner,/scripts\/player-startup-smoke\.mjs/,'The unified inspector must retain the independent real Viking GLB startup regression.');
console.log('COASTAL REFERENCE CONTRACT OK');

assert.ok(captureRunner.includes('api.captureCanvas()'),
  'Coastal reference images must be read directly from the WebGL canvas, not the HTML page');
assert.match(captureRunner, /const dataUrl = await withCaptureTimeout\(page\.evaluate\(\(\) => \{/,
  'Atmosphere phase captures must use a bounded WebGL canvas readback.');
assert.match(captureRunner, /api\.render\(\);\s*return api\.captureCanvas\(\);/,
  'Atmosphere captures must render and read the animated WebGL canvas directly.');
assert.match(captureRunner, /session\.send\('Page\.captureScreenshot'/,
  'A compositor PNG fallback must remain available when WebGL readback is unavailable.');
assert.ok(!captureRunner.includes("page.locator('#renderCanvas').screenshot"),
  'Do not wait for an animated canvas element to become visually stable before atmosphere captures.');
assert.ok(!captureRunner.includes('page.screenshot('),
  'Full-page screenshots can include menus/HUD and add unnecessary SwiftShader compositor cost');
assert.match(captureRunner, /assert\.equal\(boot\.build, EXPECTED_BUILD,/,
  'The coast capture must validate against the release validator instead of a hard-coded historical version.');
assert.match(captureRunner, /const EXPECTED_BUILD = process\.env\.EXPECTED_GAME_VERSION \|\| fs\.readFileSync\('scripts\/validate_release\.py'/,
  'The visual audit must derive its expected release from the active validator.');
assert.match(validator, /EXPECTED_VERSION = "0\.6\.291"/,
  'The release validator must target the current 0.6.292 candidate.');
assert.match(html,/name="el-sin-nombre-build" content="0\.6\.274"/, 'The source HTML remains 0.6.274 and is promoted to 0.6.292 by the release builder.');
assert.ok(builder.includes('atmosphere-system.js'),'The release builder must package the atmospheric shader module.');
assert.ok(builder.includes('window.__ELSN_ATMOSPHERE_CONTROLS'),'The atmospheric controls must be installed in the game runtime.');
assert.ok(builder.includes('atmosphereSystem.update(dt)'),'The atmosphere clock must be updated once per game frame.');
assert.ok(captureRunner.includes("id: 'dawn'"),'The scene inspector must capture dawn.');
assert.ok(captureRunner.includes("id: 'noon'"),'The scene inspector must capture noon.');
assert.ok(captureRunner.includes("id: 'dusk'"),'The scene inspector must capture dusk.');
assert.ok(captureRunner.includes("id: 'midnight'"),'The scene inspector must capture midnight.');
assert.match(html,/const vegetationTrailPaths=\[\],packedTrailMeshes=\[\]/, 'The game must keep direct references to its packed-trail meshes for deterministic test isolation.');
assert.match(html,/packedTrailMeshes\.push\(mesh\)/, 'Every generated packed trail must be registered for the test-only A/B capture.');
assert.match(html,/setPackedTrailVisible:\(enabled\)=>\{const trails=packedTrailMeshes/, 'The test-only API must isolate the packed-earth ribbon without changing normal gameplay.');
assert.match(captureRunner,/setPackedTrailVisible\(false\)/, 'The coast capture must produce an A/B frame with packed trails hidden.');
assert.match(captureRunner,/no-packed-trails\.png/, 'The no-trail comparison image must be included in the reference artifact.');
assert.match(captureRunner, /expectedCaptureCount: 36/,
  'The coastal reference must include 27 coast states plus nine mountain-occlusion states.');
assert.match(captureRunner, /id: 'surf-20m', distance: 20, height: 5\.5, side: 'sea', targetOffset: -2\.5, targetY: 0\.1/,
  'The 20 m surf view must aim just landward of the true 1.085R waterline.');
assert.match(captureRunner, /const shorelineRadius = island\.r \* 1\.085/);
assert.match(captureRunner, /cameraCase\.side === 'sea' \? shorelineRadius \+ cameraCase\.distance/);
assert.match(captureRunner, /cameraCase\.side === 'sea' \? shorelineRadius \+ cameraCase\.targetOffset/);
assert.match(captureRunner, /id: 'ridge-occlusion'/,
  'The camera matrix must include a direct view across the main island ridge.');
assert.match(captureRunner, /36\/36 complete/,
  'The runner must assert and report all 36 captured views.');
assert.match(captureRunner, /no-shorebreaker-wash/);
assert.match(captureRunner, /no-ocean-normal-map/);
assert.match(captureRunner, /previous-ocean-normal/);
assert.match(captureRunner, /no-ocean-depth-alpha/);
assert.match(captureRunner, /no-ocean-vertex-alpha/);
assert.match(captureRunner, /no-ground-vertex-alpha/);
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
assert.match(captureRunner, /no-ocean-depth-tint/);
assert.match(captureRunner, /no-near-water-detail/);
assert.match(captureRunner, /no-shore-foundation/);
assert.match(captureRunner, /no-village-buildings/);
assert.match(html, /shoreFoundationMeshes\[i\]=shore/);
assert.match(html, /settlementGrounding:/);
assert.match(html, /coastalDiagnosticOverrides=\{disableShortVertexWaves:false,disableNearWaterDetail:false\}/);
assert.match(html, /if\(coastalDiagnosticOverrides.disableNearWaterDetail\)return 0/);
assert.match(html, /diagnosticOceanDepthTintColors=oceanDepthVertexColors.slice\(\)/);
assert.match(captureRunner, /Ensure lazily-created coast meshes exist before snapshotting their original state/);
assert.match(captureRunner, /api\.setWaterState\(\{ time: 37, tide: 'natural' \}\);\s*const variantState = variant\.kind \? api\.setDiagnosticVariant\(variant\.kind, true\) : null;\s*\/\/ Recompute vertex waves after the source toggle/);
assert.match(captureRunner, /const restoredVariantState = variant\.kind \? api\.setDiagnosticVariant\(variant\.kind, false\) : null;/,
  'Diagnostic variants must be restored after the isolated frame.');
assert.match(captureRunner, /diagnosticCaptures\.length, 54/,
  'Three cameras must capture the baseline and seventeen independent A/B variants.');
assert.match(captureRunner, /no-island-heightfield/);
assert.match(captureRunner, /auditIslandGeometry/);
assert.match(captureRunner, /geometry-audit\.json/);
assert.match(contactSheet, /DIAGNOSTIC_VARIANTS/);
assert.ok(contactSheet.includes('36 CAPTURES + 54 DIAGNOSTIC A/B'),
  'The contact sheet must label all 36 baseline frames and 54 diagnostic A/B captures.');
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
  'A new commit must not cancel an active deep graphics audit; keep the latest pending run.');

// The coast solver and static foam profile caches are guarded by the assertions above.

// A/B road isolation is exercised by the 37th diagnostic image.
