'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
  try {
    await page.goto(BASE_URL + '?test=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke &&
        window.__elSinNombreStartupSmoke.worldReady === true,
      undefined,
      { timeout: 180000 }
    );

    const boot = await page.evaluate(() => {
      const api = window.__ELSN_TEST__;
      const startup = window.__elSinNombreStartupSmoke;
      api.stop();
      return {
        build: api.build,
        startup: startup.result,
        islands: api.islands,
        diagnostics: api.diagnostics()
      };
    });
    assert.equal(boot.build, '0.6.271', 'Reference build must be exactly 0.6.271');
    assert.equal(boot.startup.worldReady, true, 'World must be fully ready before capture');
    assert.equal(boot.startup.playerModelReady, true, 'Player GLB must be ready before capture');
    assert.ok(boot.islands.length >= 1, 'At least one island must be available');
    assert.equal(pageErrors.length, 0, 'No uncaught browser page errors during startup');

    await page.addStyleTag({ content: '#loading,#intro,#hud,#controls,#map,#waterShoreDebugPanel,#groundPhaseADebugPanel{display:none!important}' });

    const mainIsland = boot.islands[0];
    const shoreRadius = mainIsland.r * 0.92;
    const manifest = {
      schema: 1,
      build: boot.build,
      capturedAt: new Date().toISOString(),
      renderer: 'Chromium headless + ANGLE SwiftShader',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      cameraCases: CAMERAS,
      timesSeconds: TIMES,
      tides: TIDES.map(t => ({ id: t.id, value: t.value })),
      expectedCaptureCount: CAMERAS.length * TIMES.length * TIDES.length,
      startup: boot.startup,
      captures: []
    };

    for (const cameraCase of CAMERAS) {
      for (const time of TIMES) {
        for (const tide of TIDES) {
          const file = `${cameraCase.id}__t${String(time).padStart(3, '0')}__${tide.id}.png`;
          const result = await page.evaluate(({ cameraCase, time, tide, island, shoreRadius }) => {
            const api = window.__ELSN_TEST__;
            const targetX = island.x + shoreRadius - 0.5;
            const targetZ = island.z;
            api.setCamera({
              x: island.x + shoreRadius + cameraCase.distance,
              y: cameraCase.height,
              z: island.z,
              targetX,
              targetY: 1.0,
              targetZ
            });
            api.setWaterState({ time, tide: tide.value });
            api.render();
            return api.diagnostics();
          }, { cameraCase, time, tide, island: mainIsland, shoreRadius });
          await page.screenshot({ path: path.join(OUT, file), animations: 'disabled' });
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

    assert.equal(manifest.captures.length, 27, 'All 27 camera/time/tide combinations must be captured');
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`COASTAL REFERENCE OK: ${manifest.captures.length} screenshots saved to ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
