import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

const BASE_URL = process.env.COASTAL_TEST_URL || 'http://127.0.0.1:4173/';
const OUT = path.resolve('artifacts/coastal-reference');
const CAMERAS = [
  // The close view stands one metre inland and looks out across the wet sand into the sea.
  // The two wider views remain offshore and look back toward the island.
  { id: 'shore-1m', distance: 1, height: 4.8, side: 'land', targetOffset: 10, targetY: 0.15 },
  { id: 'surf-20m', distance: 20, height: 5.5, side: 'sea', targetOffset: -2.5, targetY: 0.1 },
  { id: 'lod-90m', distance: 90, height: 22, side: 'sea', targetOffset: -0.5, targetY: 1.0 },
  // Explicit sightline across the main island ridge: catches water/foam leaking through opaque high ground.
  { id: 'ridge-occlusion', distance: 100, height: 18, side: 'ridge', targetOffset: 0, targetY: 6.5 }
];
const TIMES = [0, 37, 91];
const TIDES = [
  { id: 'natural', value: 'natural' },
  { id: 'high', value: 0.28 },
  { id: 'low', value: -0.28 }
];
const runStartedAt = performance.now();
const manifest = {
  schema: 3,
  build: null,
  capturedAt: new Date().toISOString(),
  renderer: 'Chromium headless + ANGLE SwiftShader',
  viewport: { width: 960, height: 540, deviceScaleFactor: 1 },
  testMode: 'coastal-reference-only; character startup is validated in a separate job',
  gamePageLoads: 0,
  cameraCases: CAMERAS,
  timesSeconds: TIMES,
  tides: TIDES.map(t => ({ id: t.id, value: t.value })),
  expectedCaptureCount: 36,
  startup: null,
  campaignStart: null,
  captures: [],
  shadowIsolationCapture: null,
  trailIsolationCapture: null,
  diagnosticCaptures: [],
  sheetOpacityDiagnostics: {},
  timingsMs: {},
  consoleErrors: [],
  pageErrors: [],
  failure: null
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser = null;
  try {
    let stepStartedAt = performance.now();
    browser = await chromium.launch({
      headless: true,
      timeout: 60000,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage'
      ]
    });
    manifest.timingsMs.browserLaunch = Number((performance.now() - stepStartedAt).toFixed(1));
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1
    });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', error => manifest.pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') manifest.consoleErrors.push(message.text());
    });

    // Exactly one page navigation. The coast-only boot flag does not load player/NPC/fauna GLBs.
    stepStartedAt = performance.now();
    manifest.gamePageLoads = 1;
    await page.goto(BASE_URL + '?test=1&coastref=1', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    manifest.timingsMs.navigationToDomContentLoaded = Number((performance.now() - stepStartedAt).toFixed(1));

    // Reproduce the real preflight path: enter, choose full Quality, continue without a name.
    stepStartedAt = performance.now();
    const audioGate = page.locator('#audioGateStart');
    if (await audioGate.isVisible().catch(() => false)) await audioGate.click({ timeout: 30000 });
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#continueUnnamed').click();
    manifest.timingsMs.menuFlow = Number((performance.now() - stepStartedAt).toFixed(1));
    console.log('[coastal-reference] preflight menu completed in ' + manifest.timingsMs.menuFlow + ' ms');

    stepStartedAt = performance.now();
    try {
      await page.waitForFunction(
        () => window.__ELSN_TEST__ &&
          window.__elSinNombreStartupSmoke &&
          window.__elSinNombreStartupSmoke.worldReady === true,
        undefined,
        { timeout: 180000, polling: 500 }
      );
    } catch (waitError) {
      manifest.startupWaitDiagnostic = await page.evaluate(() => ({
        testApiReady: !!window.__ELSN_TEST__,
        smoke: window.__elSinNombreStartupSmoke ? {
          worldReady: window.__elSinNombreStartupSmoke.worldReady,
          playerModelReady: window.__elSinNombreStartupSmoke.playerModelReady,
          completedAt: window.__elSinNombreStartupSmoke.completedAt,
          consoleErrors: window.__elSinNombreStartupSmoke.consoleErrors?.slice(-10),
          runtimeErrors: window.__elSinNombreStartupSmoke.runtimeErrors?.slice(-10),
          unhandledRejections: window.__elSinNombreStartupSmoke.unhandledRejections?.slice(-10)
        } : null,
        sceneWarmup: window.__elSinNombreStartupSceneWarmup || null,
        backgroundModels: window.__elSinNombreBackgroundModelTasks || null,
        loadingText: document.querySelector('#loading')?.innerText || null,
        lastRuntimeError: window.__elSinNombreLastRuntimeError || null
      })).catch(() => ({ diagnosticReadFailed: true }));
      throw waitError;
    }
    manifest.timingsMs.coastalWorldReadyWait = Number((performance.now() - stepStartedAt).toFixed(1));
    console.log('[coastal-reference] coast-only scene ready after ' +
      manifest.timingsMs.coastalWorldReadyWait + ' ms');

    // worldReady means the 3D scene is prepared, not that the campaign has started.
    // Enter a real new campaign so the intro/menu overlay cannot contaminate coast captures.
    stepStartedAt = performance.now();
    await page.locator('#intro.open').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#newGameChoice').click();
    await page.waitForFunction(() =>
      document.body.classList.contains('game-running') &&
      document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
      undefined,
      { timeout: 30000, polling: 250 }
    );
    manifest.timingsMs.startNewCampaign = Number((performance.now() - stepStartedAt).toFixed(1));
    manifest.campaignStart = await page.evaluate(() => ({
      gameRunning: document.body.classList.contains('game-running'),
      introHidden: document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
      introOpen: document.querySelector('#intro')?.classList.contains('open') === true
    }));
    assert.equal(manifest.campaignStart.gameRunning, true, 'La partida nueva no llegó a iniciarse');
    assert.equal(manifest.campaignStart.introHidden, true, 'El selector de campaña sigue visible');
    assert.equal(manifest.campaignStart.introOpen, false, 'El selector de campaña conserva la clase open');
    console.log('[coastal-reference] new campaign started; intro overlay closed');

    // Wait for the active shoreline meshes, then populate the actual wash-depth probes.
    // Player wetness is unrelated to readiness: the player may be inland.
    stepStartedAt = performance.now();
    await page.waitForFunction(() => {
      const d = window.__ELSN_TEST__?.diagnostics?.();
      return Number.isInteger(d?.activeTidalFoamIslandIndex) && d.activeTidalFoamIslandIndex >= 0;
    }, undefined, { timeout: 45000, polling: 200 });
    const beachWarmup = await page.evaluate(() => {
      const api = window.__ELSN_TEST__;
      let diagnostics = null;
      for (let pass = 0; pass < 4; pass++) {
        api.setWaterState({ time: 37 + pass * 0.25, tide: 'natural' });
        diagnostics = api.sheetOpacityDepth();
        if (diagnostics.submergedVertices > 0) break;
      }
      return diagnostics;
    });
    manifest.beachWarmup = {
      durationMs: Number((performance.now() - stepStartedAt).toFixed(1)),
      thresholdDepthMeters: beachWarmup.thresholdDepthMeters,
      submergedVertices: beachWarmup.submergedVertices,
      depthRangeMeters: beachWarmup.depthRangeMeters
    };
    assert.ok(beachWarmup.submergedVertices > 0,
      'La sonda de la lámina no encontró vértices sumergidos más de 3 cm; la prueba no puede aislar alpha.');
    console.log('[coastal-reference] wash depth probes populated: ' + beachWarmup.submergedVertices + ' submerged vertices');

    stepStartedAt = performance.now();
    const boot = await page.evaluate(() => {
      const api = window.__ELSN_TEST__;
      api.stop();
      return {
        build: api.build,
        startup: window.__elSinNombreStartupSmoke.result,
        islands: api.islands,
        diagnostics: api.diagnostics(),
        backgroundModels: window.__elSinNombreBackgroundModelTasks || null,
        sceneWarmup: window.__elSinNombreStartupSceneWarmup || null
      };
    });
    manifest.timingsMs.readStartupDiagnostics = Number((performance.now() - stepStartedAt).toFixed(1));
    manifest.build = boot.build;
    manifest.startup = boot.startup;
    manifest.backgroundModels = boot.backgroundModels;
    manifest.sceneWarmup = boot.sceneWarmup;

    assert.equal(boot.build, '0.6.273', 'La referencia debe ser exactamente 0.6.273');
    assert.equal(boot.startup.worldReady, true, 'La escena costera no terminó de prepararse');
    assert.ok(boot.islands.length >= 1, 'No se encontró ninguna isla');
    assert.equal(boot.startup.consoleErrors, 0, 'El arranque registró errores de consola');
    assert.equal(boot.startup.runtimeErrors, 0, 'El arranque registró errores JavaScript');
    assert.equal(boot.startup.unhandledRejections, 0, 'El arranque registró promesas rechazadas');
    assert.equal(boot.backgroundModels?.npc, 'skipped-coastal-reference',
      'La sesión costera no aisló las importaciones de NPC');
    assert.equal(boot.backgroundModels?.fauna, 'skipped-coastal-reference',
      'La sesión costera no aisló las importaciones de fauna');

    // Read pixels directly from the WebGL canvas. A full-page screenshot also includes
    // HTML overlays (campaign menu/HUD) and triggers a slow full-page compositor readback.
    // The game was launched with ?test=1, so preserveDrawingBuffer is enabled for this CI-only path.
    manifest.captureMethod = 'WebGL canvas.toDataURL("image/png")';
    manifest.canvasDimensions = null;

    const mainIsland = boot.islands[0];
    const shoreRadius = mainIsland.r * 0.92;
    stepStartedAt = performance.now();
    for (const cameraCase of CAMERAS) {
      for (const time of TIMES) {
        for (const tide of TIDES) {
          const caseStartedAt = performance.now();
          const file = cameraCase.id + '__t' + String(time).padStart(3, '0') + '__' + tide.id + '.png';
          const renderStartedAt = performance.now();
          const result = await page.evaluate(({ cameraCase, time, tide, island, shoreRadius }) => {
            const api = window.__ELSN_TEST__;
            const ridge = cameraCase.side === 'ridge';
            const shorelineRadius = island.r * 1.085;
            const targetX = ridge ? island.x - 25 : island.x + (cameraCase.side === 'sea' ? shorelineRadius + cameraCase.targetOffset : shoreRadius + cameraCase.targetOffset);
            const targetZ = ridge ? island.z - 22 : island.z;
            api.setCamera({
              x: ridge ? island.x + 75 : island.x + (cameraCase.side === 'sea' ? shorelineRadius + cameraCase.distance : shoreRadius - cameraCase.distance),
              y: cameraCase.height,
              z: ridge ? island.z - 22 : island.z,
              targetX,
              targetY: cameraCase.targetY,
              targetZ
            });
            api.setWaterState({ time, tide: tide.value });
            api.render();
            return { diagnostics: api.diagnostics(), canvasPng: api.captureCanvas() };
          }, { cameraCase, time, tide, island: mainIsland, shoreRadius });
          const coastMetrics = result.diagnostics?.coast;
          const agreement = coastMetrics?.renderedVertexAgreement;
          assert.equal(agreement?.requested, 100, 'Request 100 analytic vertex samples');
          assert.equal(agreement?.sampled, 100, 'Complete all 100 analytic vertex samples');
          assert.ok(Number.isFinite(agreement?.maxAbsErrorMeters) && agreement.maxAbsErrorMeters < 0.01,
            'Analytic/drawn water surface differs by 1 cm or more: ' + JSON.stringify(agreement));
          const lodBoundary90 = coastMetrics?.waterLodBoundary90;
          assert.equal(lodBoundary90?.radiusMeters, 90, 'The required mobile LOD boundary must be exactly 90 m');
          assert.equal(lodBoundary90?.samples, 36, 'Check 36 directions at the 90 m LOD boundary');
          assert.ok(Number.isFinite(lodBoundary90?.maxHeightContinuityErrorMeters) && lodBoundary90.maxHeightContinuityErrorMeters < 0.01,
            'Height seam at the 90 m LOD boundary: ' + JSON.stringify(lodBoundary90));
          assert.ok(Number.isFinite(lodBoundary90?.maxRadialSlopeDifference) && lodBoundary90.maxRadialSlopeDifference < 0.005,
            'Radial slope is not continuous at the 90 m LOD boundary: ' + JSON.stringify(lodBoundary90));
          assert.ok(Number.isFinite(lodBoundary90?.maxNormalDiscontinuityDegrees) && lodBoundary90.maxNormalDiscontinuityDegrees < 0.5,
            'Normals are not continuous at the 90 m LOD boundary: ' + JSON.stringify(lodBoundary90));
          const lodBoundary = coastMetrics?.waterLodBoundary;
          assert.equal(lodBoundary?.samples, 36, 'Check 36 directions at the LOD boundary');
          assert.ok(Number.isFinite(lodBoundary?.maxHeightContinuityErrorMeters) && lodBoundary.maxHeightContinuityErrorMeters < 0.01,
            'Height seam at LOD boundary: ' + JSON.stringify(lodBoundary));
          assert.ok(Number.isFinite(lodBoundary?.maxRadialSlopeDifference) && lodBoundary.maxRadialSlopeDifference < 0.005,
            'Radial slope is not continuous at the LOD boundary: ' + JSON.stringify(lodBoundary));
          assert.ok(Number.isFinite(lodBoundary?.maxNormalDiscontinuityDegrees) && lodBoundary.maxNormalDiscontinuityDegrees < 0.5,
            'Normals are not continuous at the LOD boundary: ' + JSON.stringify(lodBoundary));
          const renderMs = Number((performance.now() - renderStartedAt).toFixed(1));

          const screenshotStartedAt = performance.now();
          const pngMatch = new RegExp('^data:image/png;base64,([A-Za-z0-9+/]+={0,2})$').exec(result.canvasPng || '');
          assert.ok(pngMatch, 'Canvas readback did not return a PNG data URL for ' + file);
          const pngBuffer = Buffer.from(pngMatch[1], 'base64');
          assert.ok(pngBuffer.length > 1000, 'PNG readback was empty or truncated for ' + file);
          assert.equal(pngBuffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
            'Canvas readback did not contain a valid PNG signature for ' + file);
          const width = pngBuffer.readUInt32BE(16);
          const height = pngBuffer.readUInt32BE(20);
          assert.ok(width > 0 && height > 0, 'Canvas PNG has invalid dimensions for ' + file);
          manifest.canvasDimensions = manifest.canvasDimensions || { width, height };
          assert.deepEqual({ width, height }, manifest.canvasDimensions,
            'Canvas dimensions changed between deterministic capture states');
          fs.writeFileSync(path.join(OUT, file), pngBuffer);
          const screenshotMs = Number((performance.now() - screenshotStartedAt).toFixed(1));
          manifest.captures.push({
            file,
            camera: cameraCase.id,
            timeSeconds: time,
            tide: tide.id,
            renderMs,
            screenshotMs,
            canvasBytes: pngBuffer.length,
            durationMs: Number((performance.now() - caseStartedAt).toFixed(1)),
            diagnostics: result.diagnostics
          });
          if (manifest.captures.length % 3 === 0) {
            console.log('[coastal-reference] captured ' + manifest.captures.length +
              '/36; latest render=' + renderMs + ' ms, canvas readback=' + screenshotMs + ' ms');
          }
        }
      }
    }
    manifest.timingsMs.captureAll36 = Number((performance.now() - stepStartedAt).toFixed(1));
    // Diagnostic A/B frame: same ridge camera, wave time and tide, but with main-island
    // terrain shadow receiving disabled temporarily. This isolates shadow-map streaks from water.
    const ridgeCase = CAMERAS.find(cameraCase => cameraCase.id === 'ridge-occlusion');
    const shadowIsolation = await page.evaluate(({ cameraCase, island }) => {
      const api = window.__ELSN_TEST__;
      const disabled = api.setIslandShadowReceiving(false);
      api.setCamera({
        x: island.x + 75, y: cameraCase.height, z: island.z - 22,
        targetX: island.x - 25, targetY: cameraCase.targetY, targetZ: island.z - 22
      });
      api.setWaterState({ time: 37, tide: 'natural' });
      api.render();
      const canvasPng = api.captureCanvas();
      const restored = api.setIslandShadowReceiving(true);
      return { disabled, restored, canvasPng };
    }, { cameraCase: ridgeCase, island: mainIsland });
    const pngPrefix = 'data:image/png;base64,';
    assert.ok(typeof shadowIsolation.canvasPng === 'string' &&
      shadowIsolation.canvasPng.startsWith(pngPrefix),
      'Shadow-isolation canvas readback did not return a PNG');
    assert.ok(shadowIsolation.disabled && shadowIsolation.restored,
      'The main-island shadow receiver must disable and restore for the diagnostic A/B frame');
    const shadowPng = Buffer.from(shadowIsolation.canvasPng.slice(pngPrefix.length), 'base64');
    assert.ok(shadowPng.length > 1000, 'Shadow-isolation PNG was empty');
    assert.equal(shadowPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
      'Shadow-isolation capture does not have a valid PNG signature');
    const shadowFile = 'ridge-occlusion__t037__natural__no-island-shadows.png';
    fs.writeFileSync(path.join(OUT, shadowFile), shadowPng);
    manifest.shadowIsolationCapture = {
      file: shadowFile,
      camera: 'ridge-occlusion',
      timeSeconds: 37,
      tide: 'natural',
      mainIslandTerrainReceivesShadows: false,
      receiverRestoredAfterCapture: true
    };
    // Diagnostic A/B frame: same camera and water state, with packed-earth trail meshes hidden.
    // This isolates the ribbon from terrain/shadow artifacts without changing the island mesh.
    const trailIsolation = await page.evaluate(({ cameraCase, island }) => {
      const api = window.__ELSN_TEST__;
      const hidden = api.setPackedTrailVisible(false);
      console.log('[coastal-reference] trail isolation state:', JSON.stringify(hidden));
      api.setCamera({
        x: island.x + 75, y: cameraCase.height, z: island.z - 22,
        targetX: island.x - 25, targetY: cameraCase.targetY, targetZ: island.z - 22
      });
      api.setWaterState({ time: 37, tide: 'natural' });
      api.render();
      const canvasPng = api.captureCanvas();
      const restored = api.setPackedTrailVisible(true);
      return { hidden, restored, canvasPng };
    }, { cameraCase: ridgeCase, island: mainIsland });
    manifest.trailIsolationDiagnostic = trailIsolation.hidden;
    assert.ok(trailIsolation.hidden.count >= 1 && trailIsolation.hidden.visible === true,
      'Packed-earth trail meshes must be hideable for a diagnostic A/B frame: ' + JSON.stringify(trailIsolation.hidden));
    assert.ok(trailIsolation.restored.count === trailIsolation.hidden.count && trailIsolation.restored.visible === true,
      'Every packed-earth trail must be restored after diagnostic capture');
    assert.ok(typeof trailIsolation.canvasPng === 'string' && trailIsolation.canvasPng.startsWith(pngPrefix),
      'Trail-isolation canvas readback did not return a PNG');
    const trailPng = Buffer.from(trailIsolation.canvasPng.slice(pngPrefix.length), 'base64');
    assert.ok(trailPng.length > 1000, 'Trail-isolation PNG was empty');
    const trailFile = 'ridge-occlusion__t037__natural__no-packed-trails.png';
    fs.writeFileSync(path.join(OUT, trailFile), trailPng);
    manifest.trailIsolationCapture = { file: trailFile, camera: 'ridge-occlusion', timeSeconds: 37, tide: 'natural', trailMeshesHidden: trailIsolation.hidden.count, restoredAfterCapture: true };

    // Same-state A/B isolation: identical camera, t=37 s and natural tide; each coastal source is disabled independently.
    const diagnosticVariants = [
      { id: 'baseline', kind: null },
      { id: 'no-shorebreaker-wash', kind: 'shore-breaker-wash' },
      { id: 'no-volumetric-shore-breaker', kind: 'volumetric-shore-breaker' },
      { id: 'no-living-beach-layer', kind: 'living-beach-layer' },
      { id: 'no-submerged-sand', kind: 'submerged-sand' },
      { id: 'no-continuous-shore-foam', kind: 'continuous-shore-foam' },
      { id: 'previous-ocean-normal', kind: 'previous-ocean-normal' },
      { id: 'no-ocean-depth-alpha', kind: 'ocean-depth-alpha' },
      { id: 'no-ocean-vertex-alpha', kind: 'ocean-vertex-alpha' },
      { id: 'no-ground-vertex-alpha', kind: 'ground-vertex-alpha' },
      { id: 'no-ocean-normal-map', kind: 'ocean-normal-map' },
      { id: 'no-ocean-specular', kind: 'ocean-specular' },
      { id: 'no-short-vertex-waves', kind: 'short-vertex-waves' },
      { id: 'no-ocean-depth-tint', kind: 'ocean-depth-tint' },
      { id: 'no-near-water-detail', kind: 'near-water-detail' }
    ];
    for (const cameraId of ['shore-1m', 'lod-90m']) {
      const cameraCase = CAMERAS.find(item => item.id === cameraId);
      for (const variant of diagnosticVariants) {
        const diagnostic = await page.evaluate(({ cameraCase, variant, island, shoreRadius }) => {
          const api = window.__ELSN_TEST__;
          const ridge = cameraCase.side === 'ridge';
          const shorelineRadius = island.r * 1.085;
          api.setCamera({
            x: ridge ? island.x + 75 : island.x + (cameraCase.side === 'sea' ? shorelineRadius + cameraCase.distance : shoreRadius - cameraCase.distance),
            y: cameraCase.height,
            z: ridge ? island.z - 22 : island.z,
            targetX: ridge ? island.x - 25 : island.x + (cameraCase.side === 'sea' ? shorelineRadius + cameraCase.targetOffset : shoreRadius + cameraCase.targetOffset),
            targetY: cameraCase.targetY,
            targetZ: ridge ? island.z - 22 : island.z
          });
          // Ensure lazily-created coast meshes exist before snapshotting their original state.
          api.setWaterState({ time: 37, tide: 'natural' });
          const variantState = variant.kind ? api.setDiagnosticVariant(variant.kind, true) : null;
          // Recompute vertex waves after the source toggle.
          api.setWaterState({ time: 37, tide: 'natural' });
          api.render();
          const sheetOpacity = api.sheetOpacityDepth();
          const diagnostics = api.diagnostics();
          const canvasPng = api.captureCanvas();
          const restoredVariantState = variant.kind ? api.setDiagnosticVariant(variant.kind, false) : null;
          api.setWaterState({ time: 37, tide: 'natural' });
          api.render();
          return { sheetOpacity, diagnostics, canvasPng, variantState, restoredVariantState };
        }, { cameraCase, variant, island: mainIsland, shoreRadius });
        if (variant.id === 'baseline') {
          const depth = diagnostic.sheetOpacity;
          assert.equal(depth?.thresholdDepthMeters, 0.03,
            'The film diagnostic must use the requested 3 cm depth threshold: ' + JSON.stringify(depth));
          assert.ok(Number.isFinite(depth?.submergedVertices) && depth.submergedVertices > 0,
            'The 3 cm film probe must include submerged vertices: ' + JSON.stringify(depth));
          assert.ok(Number.isFinite(depth?.meanVertexAlpha) && depth.meanVertexAlpha >= 0 && depth.meanVertexAlpha <= 1,
            'The 3 cm film probe must return a finite normalized mean alpha: ' + JSON.stringify(depth));
          assert.ok(depth?.depthRangeMeters?.min > 0.03,
            'Every sampled film vertex must be deeper than 3 cm: ' + JSON.stringify(depth));
          const coast = diagnostic.diagnostics?.coast;
          const visibleFoamVertices = Number(coast?.foamVerticesChecked) || 0;
          const outsideFoamVertices = Number(coast?.foamVerticesOutsideBand) || 0;
          assert.ok(visibleFoamVertices > 0, 'The baseline must measure visible foam vertices: ' + JSON.stringify(coast));
          assert.equal(outsideFoamVertices, 0, 'Visible foam must remain inside the 0.8 m seaward / 1.5 m landward corridor: ' + JSON.stringify(coast));
          assert.ok(Number(coast?.foamMaxOffshoreDistanceMeters) <= 0.80, 'Visible foam may not extend more than 0.8 m offshore: ' + JSON.stringify(coast));
          assert.equal(coast?.physicalBackwashVelocity?.implemented, true, 'The coast must report measured backwash speed: ' + JSON.stringify(coast?.physicalBackwashVelocity));
          assert.ok(Number.isFinite(coast?.physicalBackwashVelocity?.peakMetersPerSecond), 'Backwash speed must be finite: ' + JSON.stringify(coast?.physicalBackwashVelocity));
        }
        if (variant.id === 'no-ocean-depth-tint') {
          assert.equal(diagnostic.variantState?.oceanDepthTintEnabled, false,
            'Ocean RGB depth tint must be neutralized while alpha remains enabled');
          assert.equal(diagnostic.restoredVariantState?.oceanDepthTintEnabled, true,
            'Ocean RGB depth tint must be restored after its isolation capture');
          assert.equal(diagnostic.variantState?.groundVertexAlphaEnabled, true,
            'The tint-only test must retain the ocean alpha channel');
        }
        if (variant.id === 'no-near-water-detail') {
          assert.equal(diagnostic.variantState?.nearWaterDetailEnabled, false,
            'Near-water detail must be disabled in the far-wave isolation frame');
          assert.equal(diagnostic.restoredVariantState?.nearWaterDetailEnabled, true,
            'Near-water detail must be restored after its isolation capture');
        }
        const isolationChecks = {
          'no-volumetric-shore-breaker': ['volumetricShoreBreakerVisible', 'VolumetricShoreBreaker'],
          'no-living-beach-layer': ['livingBeachLayerVisible', 'LivingCoastalSand'],
          'no-submerged-sand': ['submergedSandVisible', 'NordicSubmergedSand'],
          'no-continuous-shore-foam': ['continuousShoreFoamVisible', 'ContinuousOrganicShoreFoam'],
          'no-ocean-vertex-alpha': ['oceanVertexAlphaEnabled'],
          'no-ground-vertex-alpha': ['groundVertexAlphaEnabled']
        };
        if (variant.id === 'no-ocean-depth-alpha') {
          assert.equal(diagnostic.variantState?.oceanVertexAlphaEnabled, false,
            'Combined depth-alpha isolation must disable ocean material vertex alpha');
          assert.equal(diagnostic.variantState?.groundVertexAlphaEnabled, false,
            'Combined depth-alpha isolation must disable ocean mesh vertex alpha');
          assert.equal(diagnostic.restoredVariantState?.oceanVertexAlphaEnabled, true,
            'Combined depth-alpha isolation must restore ocean material vertex alpha');
          assert.equal(diagnostic.restoredVariantState?.groundVertexAlphaEnabled, true,
            'Combined depth-alpha isolation must restore ocean mesh vertex alpha');
        } else if (isolationChecks[variant.id]) {
          const [field, meshName] = isolationChecks[variant.id];
          if (field.endsWith('AlphaEnabled')) {
            assert.equal(diagnostic.variantState?.[field], false, field + ' must be disabled in its isolation capture');
            assert.equal(diagnostic.restoredVariantState?.[field], true, field + ' must be restored after its isolation capture');
          } else {
            assert.equal(diagnostic.variantState?.[field], 0, `${meshName} must be hidden in its isolation capture`);
            assert.ok(diagnostic.restoredVariantState?.[field] >= 1, `${meshName} visibility must be restored after its isolation capture`);
          }
        }
        const prefix = 'data:image/png;base64,';
        assert.ok(typeof diagnostic.canvasPng === 'string' && diagnostic.canvasPng.startsWith(prefix),
          'Diagnostic A/B capture did not return a PNG: ' + cameraId + '/' + variant.id);
        const png = Buffer.from(diagnostic.canvasPng.slice(prefix.length), 'base64');
        assert.ok(png.length > 1000, 'Diagnostic A/B PNG was empty: ' + cameraId + '/' + variant.id);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
          'Diagnostic A/B capture does not contain a valid PNG: ' + cameraId + '/' + variant.id);
        const file = cameraId + '__t037__natural__' + variant.id + '.png';
        fs.writeFileSync(path.join(OUT, file), png);
        manifest.diagnosticCaptures.push({
          file, camera: cameraId, timeSeconds: 37, tide: 'natural',
          variant: variant.id, disabledSource: variant.kind,
          sheetOpacity: diagnostic.sheetOpacity,
          variantState: diagnostic.variantState,
          restoredVariantState: diagnostic.restoredVariantState,
          diagnostics: diagnostic.diagnostics
        });
        if (variant.id === 'baseline') manifest.sheetOpacityDiagnostics[cameraId] = diagnostic.sheetOpacity;
      }
    }
    assert.equal(manifest.diagnosticCaptures.length, 30,
      'The two cameras must each contain a baseline and all twelve isolated variants');
    console.log('[coastal-reference] 26 same-state A/B captures complete; separate vertex-alpha and sheet-depth metrics recorded');

    assert.equal(manifest.gamePageLoads, 1, 'El juego debe cargarse exactamente una vez');
    assert.equal(manifest.captures.length, 36, 'No se han generado las 36 capturas (27 estados costeros + 9 vistas de oclusión de montaña)');
    assert.equal(manifest.consoleErrors.length, 0,
      'Errores de consola: ' + manifest.consoleErrors.join(' | '));
    assert.equal(manifest.pageErrors.length, 0,
      'Errores JavaScript: ' + manifest.pageErrors.join(' | '));
    console.log('[coastal-reference] 36/36 complete in ' + manifest.timingsMs.captureAll36 + ' ms');
  } catch (error) {
    manifest.failure = String(error && error.stack || error);
    throw error;
  } finally {
    manifest.consoleErrors = [...manifest.consoleErrors];
    manifest.pageErrors = [...manifest.pageErrors];
    manifest.timingsMs.totalRunner = Number((performance.now() - runStartedAt).toFixed(1));
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (browser) await browser.close();
  }
  console.log('COASTAL REFERENCE OK: one game load, 36 screenshots (27 coast + 9 ridge-occlusion) and JSON manifest.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
