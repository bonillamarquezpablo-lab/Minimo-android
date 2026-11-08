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
  { id: 'surf-20m', distance: 20, height: 8, side: 'sea', targetOffset: -0.5, targetY: 1.0 },
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
  playerValidation: 'separate-character-startup-job',
  campaignStart: null,
  captures: [],
  layerIsolationCaptures: [],
  shadowIsolationCapture: null,
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
    manifest.playerValidation = {
      status: 'not-run-in-coastal-job',
      delegatedTo: 'character-startup job',
      coastModeBackgroundModels: boot.backgroundModels
    };
    manifest.sceneWarmup = boot.sceneWarmup;

    assert.equal(boot.build, '0.6.271', 'La referencia debe ser exactamente 0.6.271');
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
            const targetX = ridge ? island.x - 25 : island.x + shoreRadius + cameraCase.targetOffset;
            const targetZ = ridge ? island.z - 22 : island.z;
            api.setCamera({
              x: ridge ? island.x + 75 : island.x + shoreRadius + (cameraCase.side === 'land' ? -cameraCase.distance : cameraCase.distance),
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
    // Layer isolation A/B frames use the exact same ridge camera, time and tide.
    // Each layer is disabled only for its own capture and restored immediately afterwards.
    const ridgeCase = CAMERAS.find(cameraCase => cameraCase.id === 'ridge-occlusion');
    const pngPrefix = 'data:image/png;base64,';
    const isolationModes = [
      { mode: 'scene-shadows', file: 'ridge-occlusion__t037__natural__no-scene-shadows.png', label: 'scene shadows disabled' },
      { mode: 'ocean-surface', file: 'ridge-occlusion__t037__natural__no-ocean-surface.png', label: 'ocean surface disabled' },
      { mode: 'living-beach', file: 'ridge-occlusion__t037__natural__no-living-beach.png', label: 'living beach disabled' },
      { mode: 'terrain-maps', file: 'ridge-occlusion__t037__natural__no-terrain-maps.png', label: 'terrain albedo and normal maps disabled' }
    ];
    for (const isolation of isolationModes) {
      const frame = await page.evaluate(({ cameraCase, island, mode }) => {
        const api = window.__ELSN_TEST__;
        api.setCamera({
          x: island.x + 75, y: cameraCase.height, z: island.z - 22,
          targetX: island.x - 25, targetY: cameraCase.targetY, targetZ: island.z - 22
        });
        api.setWaterState({ time: 37, tide: 'natural' });
        let disabled = false, restored = false, canvasPng = null;
        try {
          if (mode === 'scene-shadows') disabled = api.setSceneShadowsEnabled(false);
          else if (mode === 'ocean-surface') disabled = api.setOceanSurfaceEnabled(false);
          else if (mode === 'living-beach') disabled = api.setLivingBeachEnabled(false);
          else if (mode === 'terrain-maps') disabled = api.setTerrainTextureMapsEnabled(false);
          api.render();
          canvasPng = api.captureCanvas();
        } finally {
          if (mode === 'scene-shadows') restored = api.setSceneShadowsEnabled(true);
          else if (mode === 'ocean-surface') restored = api.setOceanSurfaceEnabled(true);
          else if (mode === 'living-beach') restored = api.setLivingBeachEnabled(true);
          else if (mode === 'terrain-maps') restored = api.setTerrainTextureMapsEnabled(true);
          api.render();
        }
        return { disabled, restored, canvasPng };
      }, { cameraCase: ridgeCase, island: mainIsland, mode: isolation.mode });
      assert.ok(frame.disabled && frame.restored,
        'Layer isolation must disable and restore: ' + isolation.mode);
      assert.ok(typeof frame.canvasPng === 'string' && frame.canvasPng.startsWith(pngPrefix),
        'Layer-isolation canvas readback did not return a PNG: ' + isolation.mode);
      const pngBuffer = Buffer.from(frame.canvasPng.slice(pngPrefix.length), 'base64');
      assert.ok(pngBuffer.length > 1000, 'Layer-isolation PNG was empty: ' + isolation.mode);
      assert.equal(pngBuffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
        'Layer-isolation capture does not have a valid PNG signature: ' + isolation.mode);
      fs.writeFileSync(path.join(OUT, isolation.file), pngBuffer);
      manifest.layerIsolationCaptures.push({
        file: isolation.file,
        mode: isolation.mode,
        disabled: true,
        restored: true,
        camera: 'ridge-occlusion',
        timeSeconds: 37,
        tide: 'natural',
        label: isolation.label
      });
      console.log('[coastal-reference] layer isolation captured: ' + isolation.mode);
    }
    manifest.shadowIsolationCapture =
      manifest.layerIsolationCaptures.find(frame => frame.mode === 'scene-shadows') || null;
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
