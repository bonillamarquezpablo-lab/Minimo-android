import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

const BASE_URL = process.env.COASTAL_TEST_URL || 'http://127.0.0.1:4173/';
const OUT = path.resolve('artifacts/coastal-reference');

async function captureAtmospherePng(page, phaseId) {
  const attempts = [];
  const validPng = bytes => Buffer.isBuffer(bytes) && bytes.length > 1000 &&
    bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const dataUrl = await page.evaluate(() => {
        const api = window.__ELSN_TEST__;
        if (!api || typeof api.render !== 'function' || typeof api.captureCanvas !== 'function') return null;
        api.render();
        return api.captureCanvas();
      });
      const match = /^data:image\\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || '');
      if (match) {
        const bytes = Buffer.from(match[1], 'base64');
        if (validPng(bytes)) return { bytes, method: 'game-canvas-readback', attempts };
      }
      attempts.push({ attempt, method: 'game-canvas-readback', success: false, resultType: typeof dataUrl });
    } catch (error) {
      attempts.push({ attempt, method: 'game-canvas-readback', success: false, error: String(error?.message || error) });
    }
    await page.waitForTimeout(80 * attempt);
  }
  // The independent compositor channel preserves the visible game frame when WebGL
  // readback is unavailable. It does not modify the scene or its rendering quality.
  let session;
  try {
    session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true
    });
    const bytes = Buffer.from(shot.data || '', 'base64');
    if (validPng(bytes)) return { bytes, method: 'cdp-composited-frame', attempts };
    attempts.push({ method: 'cdp-composited-frame', success: false, bytes: bytes.length });
  } catch (error) {
    attempts.push({ method: 'cdp-composited-frame', success: false, error: String(error?.message || error) });
  } finally {
    if (session) await session.detach().catch(() => {});
  }
  throw new Error('No valid PNG could be captured for ' + phaseId + ': ' + JSON.stringify(attempts));
}

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
  atmosphereAudit: null,
  atmosphereCaptures: [],
  shadowIsolationCapture: null,
  trailIsolationCapture: null,
  diagnosticCaptures: [],
  sheetOpacityDiagnostics: {},
  structureVisibility: [],
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
        coastalRuntimeMode: window.__ELSN_COASTAL_RUNTIME_MODE__ || null,
        coastalApiReady: ['seabedHeight','waterDepth','waterOpacity','filmSurfaceHeight','filmCoverage'].every(name => typeof window.NorseCoastalInteraction?.[name] === 'function'),
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

    // Verify the integrated sky shader and the four astronomical phases in the actual WebGL scene.
    stepStartedAt = performance.now();
    await page.waitForFunction(() =>
      window.__ELSN_ATMOSPHERE_CONTROLS &&
      typeof window.__ELSN_ATMOSPHERE_CONTROLS.setTime === 'function' &&
      window.__ELSN_ATMOSPHERE &&
      typeof window.__ELSN_ATMOSPHERE.update === 'function',
      undefined,
      { timeout: 45000, polling: 100 }
    );
    await page.waitForFunction(() => {
      const a = window.__ELSN_ATMOSPHERE;
      return !!(a && a.skyMaterial && a.skyDome &&
        a.skyDome.material === a.skyMaterial &&
        a.skyMaterial.isReady(a.skyDome));
    }, undefined, { timeout: 60000, polling: 200 });
    const atmosphereReady = await page.evaluate(() => {
      const a = window.__ELSN_ATMOSPHERE, controls = window.__ELSN_ATMOSPHERE_CONTROLS;
      controls.pause();
      return {
        version: 1,
        quality: a.quality,
        skyMaterial: a.skyDome.material && a.skyDome.material.name,
        shaderReady: a.skyMaterial.isReady(a.skyDome),
        godRaysAvailable: !!a.godRays,
        shadowMode: a.shadowMode || 'standard',
        ssaoAvailable: !!a.ssaoPipeline,
        ssrAvailable: !!a.ssrPipeline
      };
    });
    assert.equal(atmosphereReady.shaderReady, true, 'The atmospheric sky shader must compile and be ready before the phase captures.');
    assert.equal(atmosphereReady.skyMaterial, 'NorseAtmosphereSkyMaterial', 'The flat sky fallback must be replaced by the unified atmosphere shader.');
    const atmosphereCases = [
      { id: 'dawn', hour: 6, daylightMin: 0.20, twilightMin: 0.80, nightMin: 0.0 },
      { id: 'noon', hour: 12, daylightMin: 0.99, twilightMin: 0.0, nightMin: 0.0 },
      { id: 'dusk', hour: 18, daylightMin: 0.20, twilightMin: 0.80, nightMin: 0.0 },
      { id: 'midnight', hour: 0, daylightMin: 0.0, twilightMin: 0.0, nightMin: 0.99 }
    ];
    for (const phase of atmosphereCases) {
      const state = await page.evaluate(hour => {
        const controls = window.__ELSN_ATMOSPHERE_CONTROLS;
        const a = window.__ELSN_ATMOSPHERE;
        const result = controls.setTime(hour);
        window.__ELSN_TEST__?.render();
        return {
          ...result,
          sunEnabled: !!a.sunLight.isEnabled(),
          moonEnabled: !!a.moonLight?.isEnabled(),
          shaderReady: a.skyMaterial.isReady(a.skyDome),
          sunDirection: { x: a.sunLight.direction.x, y: a.sunLight.direction.y, z: a.sunLight.direction.z },
          moonIntensity: a.moonLight ? a.moonLight.intensity : 0
        };
      }, phase.hour);
      assert.ok(state.shaderReady, 'Atmosphere shader lost readiness at ' + phase.id);
      assert.ok(state.daylight >= phase.daylightMin, 'Unexpected daylight factor at ' + phase.id + ': ' + JSON.stringify(state));
      assert.ok(state.twilight >= phase.twilightMin, 'Twilight envelope is missing at ' + phase.id + ': ' + JSON.stringify(state));
      assert.ok(state.night >= phase.nightMin, 'Night factor is missing at ' + phase.id + ': ' + JSON.stringify(state));
      if (phase.id === 'noon') {
        assert.ok(state.sunEnabled && !state.moonEnabled, 'At noon only the sun light should be active.');
      }
      if (phase.id === 'midnight') {
        assert.ok(!state.sunEnabled && state.moonEnabled, 'At midnight the sun must be off and moonlight must be active.');
      }
      await page.waitForTimeout(120);
      const phaseFile = 'atmosphere/atmosphere-' + phase.id + '.png';
      fs.mkdirSync(path.join(OUT, 'atmosphere'), { recursive: true });
      // Re-render immediately before readback, then use an independent compositor
      // fallback if Chromium exposes an empty WebGL drawing buffer for this phase.
      const atmosphereCapture = await captureAtmospherePng(page, phase.id);
      const png = atmosphereCapture.bytes;
      fs.writeFileSync(path.join(OUT, phaseFile), png);
      manifest.atmosphereCaptures.push({
        file: phaseFile, phase: phase.id, hour: phase.hour,
        captureMethod: atmosphereCapture.method,
        captureAttempts: atmosphereCapture.attempts,
        daylight: state.daylight, twilight: state.twilight, night: state.night,
        sunEnabled: state.sunEnabled, moonEnabled: state.moonEnabled,
        moonIntensity: state.moonIntensity,
        sunDirection: state.sunDirection
      });
    }
    await page.evaluate(() => {
      const controls = window.__ELSN_ATMOSPHERE_CONTROLS;
      controls.setTime(9);
      controls.pause();
    });
    manifest.atmosphereAudit = {
      ...atmosphereReady,
      phases: manifest.atmosphereCaptures,
      dayDurationSeconds: 300,
      verifiedControls: ['setTime', 'pause', 'resume', 'setSpeed', 'setDayDuration', 'setWeather', 'setClimate']
    };
    manifest.timingsMs.atmosphereAudit = Number((performance.now() - stepStartedAt).toFixed(1));
    console.log('[coastal-reference] unified atmosphere passed dawn/noon/dusk/midnight captures');


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
        coastalRuntimeMode: window.__ELSN_COASTAL_RUNTIME_MODE__ || null,
        coastalApiReady: ['seabedHeight','waterDepth','waterOpacity','filmSurfaceHeight','filmCoverage'].every(name => typeof window.NorseCoastalInteraction?.[name] === 'function'),
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

    assert.equal(boot.build, '0.6.276', 'La referencia debe ser exactamente 0.6.276');
    assert.equal(boot.coastalRuntimeMode, 'module', 'El módulo costero externo debe cargarse desde dist; el respaldo inline no debe ocultar un error de empaquetado.');
    assert.equal(boot.coastalApiReady, true, 'Falta una o más funciones de la API costera al construir la escena.');
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
            const structureAudit = (time === 0 && tide.id === 'natural')
              ? api.repairAndAuditHabitableStructures()
              : null;
            api.setWaterState({ time, tide: tide.value });
            api.render();
            return {
              diagnostics: api.diagnostics(),
              structureAudit: structureAudit ? {
                total: structureAudit.total,
                hiddenByDistance: structureAudit.hiddenByDistance,
                hiddenUnsafe: structureAudit.hiddenUnsafe,
                visibleInvalidCount: structureAudit.visibleInvalidCount,
                untrackedRootCount: structureAudit.untrackedRootCount,
                structures: structureAudit.structures
              } : null,
              canvasPng: api.captureCanvas()
            };
          }, { cameraCase, time, tide, island: mainIsland, shoreRadius });
          if (result.structureAudit) {
            const audit = result.structureAudit;
            assert.equal(audit.total, 39, 'La vista debe auditar las 39 construcciones registradas.');
            assert.equal(audit.untrackedRootCount, 0, 'La vista detectó una construcción techada sin registrar.');
            assert.equal(audit.visibleInvalidCount, 0, 'Una construcción insegura sigue visible desde ' + cameraCase.id);
            for (const structure of audit.structures) {
              assert.ok(!structure.enabled || (
                structure.safe &&
                structure.distanceToCameraMeters <= structure.visibilityLimitMeters + 0.02
              ), 'Una construcción lejana sigue visible desde ' + cameraCase.id + ': ' + JSON.stringify(structure));
            }
            manifest.structureVisibility.push({
              camera: cameraCase.id,
              total: audit.total,
              hiddenByDistance: audit.hiddenByDistance,
              hiddenUnsafe: audit.hiddenUnsafe,
              visibleCount: audit.structures.filter(structure => structure.enabled).length,
              visibleInvalidCount: audit.visibleInvalidCount,
              structures: audit.structures
            });
          }
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
      { id: 'no-near-water-detail', kind: 'near-water-detail' },
      { id: 'no-island-heightfield', kind: 'island-heightfield' },
      { id: 'no-shore-foundation', kind: 'shore-foundation' },
      { id: 'no-village-buildings', kind: 'village-buildings' }
    ];
    let foamCorridorResult = null;
    for (const cameraId of ['shore-1m', 'shoreline-eye', 'lod-90m']) {
      const cameraCase = cameraId === 'shoreline-eye'
        ? { id: 'shoreline-eye', distance: 6, height: 2.1, side: 'land', targetOffset: 24, targetY: 0.25 }
        : CAMERAS.find(item => item.id === cameraId);
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
          if (!foamCorridorResult) foamCorridorResult = { visibleFoamVertices, outsideFoamVertices, coast };
          manifest.foamCorridorAssessment = { visibleFoamVertices, outsideFoamVertices, outsideFraction: visibleFoamVertices ? Number((outsideFoamVertices/visibleFoamVertices).toFixed(4)) : null, allowedOffshoreMeters: 0.80, allowedLandwardMeters: 1.50 };
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
          'no-island-heightfield': ['islandHeightfieldVisible', 'IslandHeightfield'],
          'no-shorebreaker-wash': ['shoreBreakerWashVisible', 'ShoreBreakerWash'],
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
    assert.equal(manifest.diagnosticCaptures.length, 54,
      'The three diagnostic cameras must each contain a baseline and seventeen isolated variants');
    console.log('[coastal-reference] 54 same-state A/B captures complete; four coastal meshes, shoreline, vertex-alpha and sheet-depth metrics recorded');

    // Focused same-state A/B at the measured outlier sector on Isla del Cuervo.
    const hotspotVariants = [
      { id: 'baseline', kind: null },
      { id: 'no-island-heightfield', kind: 'island-heightfield' },
      { id: 'no-submerged-sand', kind: 'submerged-sand' },
      { id: 'no-living-beach-layer', kind: 'living-beach-layer' },
      { id: 'no-shorebreaker-wash', kind: 'shore-breaker-wash' }
    ];
    manifest.hotspotCaptures = [];
    for (const variant of hotspotVariants) {
      const result = await page.evaluate(({ variant, island }) => {
        const api = window.__ELSN_TEST__;
        api.setCamera({
          x: island.x + 47, y: 3.4, z: island.z - 31,
          targetX: island.x + 55, targetY: -2.2, targetZ: island.z - 37
        });
        api.setWaterState({ time: 37, tide: 'natural' });
        const variantState = variant.kind ? api.setDiagnosticVariant(variant.kind, true) : null;
        api.setWaterState({ time: 37, tide: 'natural' });
        api.render();
        const canvasPng = api.captureCanvas();
        const restoredVariantState = variant.kind ? api.setDiagnosticVariant(variant.kind, false) : null;
        api.setWaterState({ time: 37, tide: 'natural' });
        api.render();
        return { canvasPng, variantState, restoredVariantState };
      }, { variant, island: mainIsland });
      const prefix = 'data:image/png;base64,';
      assert.ok(typeof result.canvasPng === 'string' && result.canvasPng.startsWith(prefix),
        'Geometry hotspot A/B did not return a PNG: ' + variant.id);
      const png = Buffer.from(result.canvasPng.slice(prefix.length), 'base64');
      assert.ok(png.length > 1000, 'Geometry hotspot PNG is empty: ' + variant.id);
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      if (variant.kind) {
        const field = {
          'island-heightfield': 'islandHeightfieldVisible',
          'submerged-sand': 'submergedSandVisible',
          'living-beach-layer': 'livingBeachLayerVisible',
          'shore-breaker-wash': 'shoreBreakerWashVisible'
        }[variant.kind];
        assert.equal(result.variantState?.[field], 0, 'Hotspot failed to hide ' + variant.kind);
        assert.ok(result.restoredVariantState?.[field] >= 1, 'Hotspot failed to restore ' + variant.kind);
      }
      const file = 'geometry-hotspot__t037__natural__' + variant.id + '.png';
      fs.writeFileSync(path.join(OUT, file), png);
      manifest.hotspotCaptures.push({
        file, camera: 'geometry-hotspot', timeSeconds: 37, tide: 'natural',
        variant: variant.id, disabledSource: variant.kind,
        variantState: result.variantState, restoredVariantState: result.restoredVariantState
      });
    }
    assert.equal(manifest.hotspotCaptures.length, 5,
      'El sector geométrico debe tener una captura base y cuatro aislamientos independientes.');


    stepStartedAt = performance.now();
    const geometryAudit = await page.evaluate(() => window.__ELSN_TEST__.auditIslandGeometry());
    manifest.geometryAudit = geometryAudit;
    fs.writeFileSync(path.join(OUT, 'geometry-audit.json'), JSON.stringify(geometryAudit, null, 2) + '\n');
    assert.equal(geometryAudit?.islandCount, 13, 'La auditoría debe inspeccionar las trece islas.');
    assert.equal(geometryAudit.thresholds.heightJumpMeters.NordicSubmergedSand, .80);
    assert.equal(geometryAudit.thresholds.heightJumpMeters.LivingCoastalSand, .90);

    const meshContinuityAudit = await page.evaluate(() => window.__ELSN_TEST__.auditCoastalMeshContinuity());
    manifest.meshContinuityAudit = meshContinuityAudit;
    fs.writeFileSync(path.join(OUT, 'coastal-mesh-continuity.json'), JSON.stringify(meshContinuityAudit, null, 2) + '\n');
    assert.equal(meshContinuityAudit?.islandCount, 13, 'La continuidad debe comprobar las trece islas.');
    assert.equal(meshContinuityAudit?.thresholdMeters, .05, 'El límite entre mallas contiguas debe ser 5 cm.');
    assert.equal(meshContinuityAudit?.passed, true,
      'Hay una discontinuidad mayor de 5 cm entre mallas costeras contiguas: ' + JSON.stringify(meshContinuityAudit.islands.filter(island => !island.passed)));
    for (const island of meshContinuityAudit.islands) {
      assert.equal(island.pairs.length, 3, 'Falta una unión costera en ' + island.island);
      for (const pair of island.pairs) {
        assert.ok(pair.sampleCount >= 12, 'No hay suficientes muestras para ' + island.island + '/' + pair.name);
        assert.ok(pair.maxAbsoluteGapMeters <= .05 + 1e-6,
          'Unión costera separada más de 5 cm: ' + island.island + '/' + pair.name + ' ' + JSON.stringify(pair.worstSample));
      }
    }


    // First isolate the polar seam and null coast-solver hypothesis on all four meshes.
    // IslandHeightfield is Cartesian, so it is explicitly reported as non-polar.
    const seamAndSolverAudit = geometryAudit.islands.map(island => ({
      island: island.island,
      meshes: island.meshes.map(mesh => ({
        mesh: mesh.name,
        seam: mesh.seam,
        heightfieldSeamNotApplicable: mesh.name === 'IslandHeightfield' && !mesh.seam.applicable
      })),
      shorelineSolver: island.shorelineSolver
    }));
    manifest.seamAndSolverAudit = seamAndSolverAudit;
    for (const island of geometryAudit.islands) {
      assert.equal(island.meshes.length, 4, 'Cada isla debe incluir las cuatro mallas: ' + island.island);
      for (const mesh of island.meshes) assert.equal(mesh.available, true, 'Falta ' + mesh.name + ' en ' + island.island);
      for (const mesh of island.meshes) if (mesh.seam.applicable) {
        assert.ok(mesh.seam.maxPositionGapMeters <= .002,
          'Costura polar abierta: ' + island.island + '/' + mesh.name + ' ' + JSON.stringify(mesh.seam));
      }
      assert.ok(island.meshes.find(mesh => mesh.name === 'IslandHeightfield')?.seam?.applicable === false,
        'La malla cartesiana debe declarar explícitamente que no tiene costura polar: ' + island.island);
    }

    // Then list every measured geometric outlier with island, mesh and world coordinates.
    const geometryOutliers = [];
    for (const island of geometryAudit.islands) {
      for (const mesh of island.meshes) {
        for (const sample of mesh.heightJump.samples || []) geometryOutliers.push({
          type: 'neighbor-height-jump', island: island.island, mesh: mesh.name, ...sample
        });
        for (const sample of mesh.slope.samples || []) geometryOutliers.push({
          type: 'slope-over-45-deg', island: island.island, mesh: mesh.name, ...sample
        });
        for (const sample of mesh.triangleEdgeLength.samples || []) geometryOutliers.push({
          type: 'long-triangle-edge', island: island.island, mesh: mesh.name, ...sample
        });
      }
      for (const profile of island.analyticProfileChecks) assert.equal(profile.violationCount, 0,
        'Arena por encima del perfil analítico: ' + island.island + '/' + profile.name + ' ' + JSON.stringify(profile));
    }
    manifest.geometryOutliers = geometryOutliers;
    fs.writeFileSync(path.join(OUT, 'geometry-outliers.json'), JSON.stringify({
      schema: 1, islandCount: 13, outlierCount: geometryOutliers.length, outliers: geometryOutliers
    }, null, 2) + '\n');
    for (const island of geometryAudit.islands) for (const mesh of island.meshes) {
      assert.ok(mesh.heightJump.maxMeters <= mesh.heightJump.thresholdMeters + 1e-6,
        'Salto de altura fuera de umbral: ' + island.island + '/' + mesh.name + ' ' + JSON.stringify(mesh.heightJump));
    }
    manifest.timingsMs.geometryAudit = Number((performance.now() - stepStartedAt).toFixed(1));
    const settlementGrounding = await page.evaluate(() => window.__ELSN_TEST__.settlementGrounding());
    manifest.settlementGrounding = {
      houseCount: settlementGrounding.length,
      maximumErrorMeters: settlementGrounding.reduce((max,item)=>Math.max(max,item.groundingErrorMeters),0),
      maximumAnalyticVsRenderedMeters: settlementGrounding.reduce((max,item)=>Math.max(max,Math.abs(item.analyticVsRenderedMeters)),0),
      houses: settlementGrounding
    };
    assert.equal(settlementGrounding.length, 12, 'Deben comprobarse individualmente las doce cabañas de los cuatro poblados.');
    for (const house of settlementGrounding) {
      assert.ok(Number.isFinite(house.groundingErrorMeters) && house.groundingErrorMeters < .02,
        'Base de cabaña separada más de 2 cm del terreno renderizado: ' + JSON.stringify(house));
      assert.ok(Number.isFinite(house.maximumFootingGapMeters) && house.maximumFootingGapMeters < .02,
        'La base de la cabaña no apoya en sus cuatro esquinas (tolerancia inferior a 2 cm): ' + JSON.stringify(house));
      assert.ok(Number.isFinite(house.dryLandFootprintMarginMeters) && house.dryLandFootprintMarginMeters >= 1.25,
        'La huella completa de la cabaña debe conservar al menos 1,25 m respecto al borde de playa: ' + JSON.stringify(house));
    }
    const settlementCamps = await page.evaluate(() => window.__ELSN_TEST__.settlementCampGrounding());
    manifest.settlementCamps = settlementCamps;
    assert.equal(settlementCamps.length, 8,
      'Deben comprobarse los dos campamentos de cada uno de los cuatro asentamientos.');
    for (const camp of settlementCamps) {
      assert.ok(Number.isFinite(camp.anchorErrorMeters) && camp.anchorErrorMeters < .02,
        'El campamento no coincide con la altura de la malla dibujada: ' + JSON.stringify(camp));
      assert.equal(camp.withinDryLandBand, true,
        'Una tienda o refugio está fuera de la huella seca de su isla: ' + JSON.stringify(camp));
    }
    const garrisonGrounding = await page.evaluate(() => window.__ELSN_TEST__.garrisonGrounding());
    manifest.garrisonGrounding = {
      outpostCount: garrisonGrounding.length,
      maximumAnchorErrorMeters: garrisonGrounding.reduce((max,item)=>Math.max(max,item.maximumAnchorErrorMeters),0),
      outposts: garrisonGrounding
    };
    assert.equal(garrisonGrounding.length, 9, 'Deben comprobarse los nueve puestos de las islas secundarias.');
    for (const outpost of garrisonGrounding) assert.ok(Number.isFinite(outpost.maximumAnchorErrorMeters) && outpost.maximumAnchorErrorMeters < .02,
      'Puesto, guardia o bandera despegados más de 2 cm de su isla: ' + JSON.stringify(outpost));
    const floatingHutProbe = await page.evaluate(() => window.__ELSN_TEST__.probeFloatingHutAudit());
    manifest.floatingHutProbe = floatingHutProbe;
    assert.equal(floatingHutProbe.detected, true, 'El auditor no descubrió una cabaña flotante sin registrar.');
    assert.equal(floatingHutProbe.autoDiscovered, true, 'La cabaña flotante no entró en el registro compartido de estructuras.');
    const floatingHutSafeOutcome =
      (floatingHutProbe.hidden === true && floatingHutProbe.lastAction === 'hidden-no-safe-ground') ||
      (floatingHutProbe.hidden === false && floatingHutProbe.lastAction === 'relocated-to-dry-ground' && floatingHutProbe.lastStatus === 'grounded');
    assert.equal(floatingHutSafeOutcome, true,
      'La cabaña sintética debe terminar oculta sin terreno seguro o recolocada y asentada en terreno seco: ' + JSON.stringify(floatingHutProbe));
    const habitableAuditRepair = await page.evaluate(() => window.__ELSN_TEST__.repairAndAuditHabitableStructures());
    manifest.habitableAuditRepair = habitableAuditRepair;
    const habitableAudit = await page.evaluate(() => window.__ELSN_TEST__.habitableStructureAudit());
    manifest.habitableStructureAudit = habitableAudit;
    assert.equal(habitableAudit.total, 39,
      'El inventario debe cubrir 12 cabañas, 9 puestos, 8 campamentos, 4 forjas, 4 torres de vigilancia, el gran salón y el campamento inicial: ' + JSON.stringify(habitableAudit));
    assert.equal(habitableAudit.untrackedRootCount, 0,
      'Hay estructuras con tejado fuera del registro de auditoría: ' + JSON.stringify(habitableAudit.untrackedRoots));
    assert.equal(habitableAudit.visibleInvalidCount, 0,
      'Hay construcciones inseguras que siguen visibles: ' + JSON.stringify(habitableAudit.structures.filter(s=>!s.safe&&s.enabled)));
    for (const structure of habitableAudit.structures) {
      if (structure.safe) {
        assert.ok(Number.isFinite(structure.anchorErrorMeters) && structure.anchorErrorMeters < .02,
          'Estructura fuera del terreno renderizado: ' + JSON.stringify(structure));
        assert.ok(Number.isFinite(structure.dryLandMarginMeters) && structure.dryLandMarginMeters >= 0,
          'Estructura fuera de la huella seca de su isla: ' + JSON.stringify(structure));
      } else {
        assert.equal(structure.enabled, false,
          'Una estructura sin parcela válida no se ha ocultado: ' + JSON.stringify(structure));
      }
    }
    const boatHabitableAudit = await page.evaluate(() => window.__ELSN_TEST__.habitableStructureAuditAsBoat({x:80,z:80}));
    manifest.boatHabitableStructureAudit = boatHabitableAudit;
    assert.equal(boatHabitableAudit.total,39,'El control de barco debe auditar el mismo inventario completo de 39 estructuras.');
    assert.equal(boatHabitableAudit.untrackedRootCount,0,'No debe quedar ninguna estructura con tejado fuera del inventario durante la navegación.');
    assert.ok(boatHabitableAudit.hiddenByDistance>0,'La simulación de navegación debe ocultar estructuras fuera del radio de 55m.');
    for (const structure of boatHabitableAudit.structures) {
      assert.ok(!structure.enabled || (structure.safe && structure.distanceToCameraMeters <= structure.visibilityLimitMeters),
        'Una construcción aparece en el mar sin estar dentro del radio visual permitido: ' + JSON.stringify(structure));
      if (structure.distanceToCameraMeters > structure.visibilityLimitMeters) assert.equal(structure.enabled,false,
        'Una construcción lejana no se ocultó al navegar: ' + JSON.stringify(structure));
    }
    assert.ok(foamCorridorResult && foamCorridorResult.visibleFoamVertices > 0,
      'The baseline must measure visible foam vertices');
    assert.equal(foamCorridorResult.outsideFoamVertices, 0,
      'Visible foam must remain inside the 0.8 m seaward / 1.5 m landward corridor: ' + JSON.stringify(foamCorridorResult.coast));

    assert.equal(manifest.gamePageLoads, 1, 'El juego debe cargarse exactamente una vez');
    assert.equal(manifest.captures.length, 36, 'No se han generado las 36 capturas (27 estados costeros + 9 vistas de oclusión de montaña)');
    assert.equal(manifest.structureVisibility.length, CAMERAS.length,
      'Cada cámara costera debe volver a aplicar la visibilidad de construcciones antes de capturar.');

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
  console.log('COASTAL REFERENCE OK: one game load, 36 coast/water screenshots, 4 atmosphere phases and JSON manifest.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
