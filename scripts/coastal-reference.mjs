import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.COASTAL_TEST_URL || 'http://127.0.0.1:4173/';
const OUT = path.resolve('artifacts/coastal-reference');
const VIEWPORT = { width: 960, height: 540 };
const CAMERAS = [
  { id: 'shore-1m', distance: 1, height: 2.8, targetInland: 2, targetAlongshore: 9, targetHeight: 1 },
  { id: 'surf-20m', distance: 20, height: 8, targetInland: 11, targetAlongshore: 28, targetHeight: 1.4 },
  { id: 'lod-90m', distance: 90, height: 22, targetInland: 0.5, targetAlongshore: 0, targetHeight: 1 }
];
const TIMES = [0, 37, 91];
const TIDES = [
  { id: 'natural', value: 'natural' },
  { id: 'high', value: 0.28 },
  { id: 'low', value: -0.28 }
];

async function retryOnce(label, operation) {
  let firstError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 2) {
        error.message = `${label} failed after one retry: ${error.message}`;
        if (firstError) error.cause = firstError;
        throw error;
      }
      firstError = error;
      console.warn(`${label}: attempt 1 failed; retrying once without reloading the page: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage'
    ]
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    // Exactly one navigation and one full game boot. All later cases reuse this page.
    await retryOnce('Open the game once', async () => {
      await page.goto(BASE_URL + '?test=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
    });
    await page.locator('#audioGateStart').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#audioGateStart').click({ timeout: 60000 });
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click({ timeout: 60000 });
    await page.locator('#playerNameInput').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#playerNameInput').fill('Coastal Test');
    await page.locator('#continueWithName').click({ timeout: 60000 });

    await page.waitForFunction(
      () => window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke &&
        window.__elSinNombreStartupSmoke.worldReady === true,
      undefined,
      { timeout: 300000, polling: 500 }
    );
    await page.locator('#newGameChoice').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#newGameChoice').click({ timeout: 60000 });
    await page.locator('#intro').waitFor({ state: 'hidden', timeout: 60000 });

    const boot = await page.evaluate(() => {
      const api = window.__ELSN_TEST__;
      const startup = window.__elSinNombreStartupSmoke;
      api.stop();
      return {
        build: api.build,
        startup: startup.result,
        playerModelReady: !!window.__elSinNombrePlayer?.modelReady,
        islands: api.islands,
        diagnostics: api.diagnostics()
      };
    });

    assert.equal(boot.build, '0.6.271', 'Reference build must be exactly 0.6.271');
    assert.equal(boot.startup.worldReady, true, 'World must be fully ready before capture');
    assert.equal(boot.startup.playerModelReady, true, 'The real rigged Viking GLB must be loaded');
    assert.equal(boot.playerModelReady, true, 'Player is using the reserve model; refusing to capture');
    assert.equal(boot.startup.consoleErrors, 0, 'Startup recorded console.error messages');
    assert.equal(boot.startup.runtimeErrors, 0, 'Startup recorded uncaught window errors');
    assert.equal(boot.startup.unhandledRejections, 0, 'Startup recorded unhandled promise rejections');
    assert.ok(boot.islands.length >= 1, 'At least one island must be available');
    assert.equal(pageErrors.length, 0, 'No uncaught browser page errors during startup');
    assert.equal(consoleErrors.length, 0, 'No browser console errors during startup');

    await page.addStyleTag({
      content: '#loading,#intro,#hud,#controls,#map,#waterShoreDebugPanel,#groundPhaseADebugPanel{display:none!important}'
    });

    const mainIsland = boot.islands[0];
    const shoreRadius = mainIsland.r * 0.92;
    const manifest = {
      schema: 2,
      build: boot.build,
      capturedAt: new Date().toISOString(),
      renderer: 'Chromium headless + ANGLE SwiftShader',
      loadCount: 1,
      viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
      cameraCases: CAMERAS,
      timesSeconds: TIMES,
      tides: TIDES.map(t => ({ id: t.id, value: t.value })),
      expectedCaptureCount: CAMERAS.length * TIMES.length * TIDES.length,
      startup: boot.startup,
      startupPlayerModelReady: boot.playerModelReady,
      captures: [],
      consoleErrors: [],
      pageErrors: []
    };

    for (const cameraCase of CAMERAS) {
      for (const time of TIMES) {
        for (const tide of TIDES) {
          const file = `${cameraCase.id}__t${String(time).padStart(3, '0')}__${tide.id}.png`;
          const capture = await retryOnce(`Capture ${file}`, async () => {
            const result = await page.evaluate(({ cameraCase, time, tide, island, shoreRadius }) => {
              const api = window.__ELSN_TEST__;
              const targetX = island.x + shoreRadius - cameraCase.targetInland;
              const targetZ = island.z + cameraCase.targetAlongshore;
              api.setCamera({
                x: island.x + shoreRadius + cameraCase.distance,
                y: cameraCase.height,
                z: island.z,
                targetX,
                targetY: cameraCase.targetHeight,
                targetZ
              });
              api.setWaterState({ time, tide: tide.value });
              api.render();
              return api.diagnostics();
            }, { cameraCase, time, tide, island: mainIsland, shoreRadius });
            const pngDataUrl = await page.evaluate(() => window.__ELSN_TEST__.captureCanvas());
            const prefix = 'data:image/png;base64,';
            assert.ok(pngDataUrl.startsWith(prefix), 'The WebGL canvas did not return a PNG data URL');
            fs.writeFileSync(path.join(OUT, file), Buffer.from(pngDataUrl.slice(prefix.length), 'base64'));
            return result;
          });

          manifest.captures.push({
            file,
            camera: cameraCase.id,
            timeSeconds: time,
            tide: tide.id,
            diagnostics: capture
          });
        }
      }
    }

    assert.equal(manifest.captures.length, 27, 'All 27 camera/time/tide combinations must be captured');
    assert.equal(pageErrors.length, 0, 'No uncaught browser page errors during captures');
    assert.equal(consoleErrors.length, 0, 'No browser console errors during captures');

    manifest.consoleErrors = consoleErrors.slice();
    manifest.pageErrors = pageErrors.slice();
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`COASTAL REFERENCE OK: one game load, ${manifest.captures.length} captures, viewport ${VIEWPORT.width}x${VIEWPORT.height}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
