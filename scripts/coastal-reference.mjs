import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.COASTAL_TEST_URL || 'http://127.0.0.1:4173/';
const OUT = path.resolve('artifacts/coastal-reference');
const CAMERAS = [
  { id: 'shore-1m', distance: 1, height: 2.8 },
  { id: 'surf-20m', distance: 20, height: 8 },
  { id: 'lod-90m', distance: 90, height: 22 }
];
const TIMES = [0, 37, 91];
const TIDES = [
  { id: 'natural', value: 'natural' },
  { id: 'high', value: 0.28 },
  { id: 'low', value: -0.28 }
];
const manifest = {
  schema: 2,
  build: null,
  capturedAt: new Date().toISOString(),
  renderer: 'Chromium headless + ANGLE SwiftShader',
  viewport: { width: 960, height: 540, deviceScaleFactor: 1 },
  gamePageLoads: 0,
  cameraCases: CAMERAS,
  timesSeconds: TIMES,
  tides: TIDES.map(t => ({ id: t.id, value: t.value })),
  expectedCaptureCount: 27,
  startup: null,
  player: null,
  captures: [],
  consoleErrors: [],
  pageErrors: [],
  failure: null
};


async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
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

  try {
    // One navigation only: all 27 cases are driven through the in-page test API.
    manifest.gamePageLoads = 1;
    await page.goto(BASE_URL + '?test=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () => window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke &&
        window.__elSinNombreStartupSmoke.worldReady === true,
      undefined,
      { timeout: 240000, polling: 500 }
    );

    // Give the real protagonist GLB a generous first attempt; retry the asset in-place once.
    let playerReady = await page.waitForFunction(
      () => window.__ELSN_TEST__ && window.__ELSN_TEST__.diagnostics().playerModelReady === true,
      undefined,
      { timeout: 150000, polling: 500 }
    ).then(() => true).catch(() => false);

    if (!playerReady) {
      await page.evaluate(() => window.__ELSN_TEST__.retryViking());
      playerReady = await page.waitForFunction(
        () => window.__ELSN_TEST__ && window.__ELSN_TEST__.diagnostics().playerModelReady === true,
        undefined,
        { timeout: 150000, polling: 500 }
      ).then(() => true).catch(() => false);
    }

    const boot = await page.evaluate(() => {
      const api = window.__ELSN_TEST__;
      api.stop();
      return {
        build: api.build,
        startup: window.__elSinNombreStartupSmoke.result,
        islands: api.islands,
        diagnostics: api.diagnostics()
      };
    });
    manifest.build = boot.build;
    manifest.startup = boot.startup;
    manifest.player = {
      ready: boot.diagnostics.playerModelReady,
      realPlayerMeshCount: boot.diagnostics.realPlayerMeshCount,
      fallbackVisible: boot.diagnostics.fallbackVisible
    };

    assert.equal(boot.build, '0.6.271', 'La referencia debe ser exactamente 0.6.271');
    assert.equal(boot.startup.worldReady, true, 'El mundo no terminó de cargar');
    assert.ok(playerReady && boot.diagnostics.playerModelReady,
      'El GLB real del vikingo no está listo tras un reintento en la misma página');
    assert.ok(boot.diagnostics.realPlayerMeshCount > 0,
      'El modelo GLB real del vikingo no contiene mallas visibles');
    assert.equal(boot.diagnostics.fallbackVisible, false,
      'El personaje de reserva sigue visible; se cancela la referencia');
    assert.ok(boot.islands.length >= 1, 'No se encontró ninguna isla');
    assert.equal(boot.startup.consoleErrors, 0, 'El arranque registró errores de consola');
    assert.equal(boot.startup.runtimeErrors, 0, 'El arranque registró errores JavaScript');
    assert.equal(boot.startup.unhandledRejections, 0, 'El arranque registró promesas rechazadas');

    await page.addStyleTag({
      content: '#loading,#intro,#hud,#controls,#map,#waterShoreDebugPanel,#groundPhaseADebugPanel{display:none!important}'
    });

    const mainIsland = boot.islands[0];
    const shoreRadius = mainIsland.r * 0.92;
    for (const cameraCase of CAMERAS) {
      for (const time of TIMES) {
        for (const tide of TIDES) {
          const file = cameraCase.id + '__t' + String(time).padStart(3, '0') + '__' + tide.id + '.png';
          const result = await page.evaluate(({ cameraCase, time, tide, island, shoreRadius }) => {
            const api = window.__ELSN_TEST__;
            const targetX = island.x + shoreRadius - 0.5;
            api.setCamera({
              x: island.x + shoreRadius + cameraCase.distance,
              y: cameraCase.height,
              z: island.z,
              targetX,
              targetY: 1.0,
              targetZ: island.z
            });
            api.setWaterState({ time, tide: tide.value });
            api.render();
            return api.diagnostics();
          }, { cameraCase, time, tide, island: mainIsland, shoreRadius });

          await page.screenshot({
            path: path.join(OUT, file),
            animations: 'disabled',
            timeout: 60000
          });
          manifest.captures.push({
            file,
            camera: cameraCase.id,
            timeSeconds: time,
            tide: tide.id,
            diagnostics: result
          });
        }
      }
    }

    assert.equal(manifest.gamePageLoads, 1, 'El juego debe cargarse exactamente una vez');
    assert.equal(manifest.captures.length, 27, 'No se han generado las 27 capturas');
    assert.equal(manifest.consoleErrors.length, 0,
      'Errores de consola: ' + manifest.consoleErrors.join(' | '));
    assert.equal(manifest.pageErrors.length, 0,
      'Errores JavaScript: ' + manifest.pageErrors.join(' | '));
  } catch (error) {
    manifest.failure = String(error && error.stack || error);
    throw error;
  } finally {
    manifest.consoleErrors = [...manifest.consoleErrors];
    manifest.pageErrors = [...manifest.pageErrors];
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await browser.close();
  }
  console.log('COASTAL REFERENCE OK: one game load and 27 screenshots plus JSON manifest.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
