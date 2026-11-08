import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

const BASE_URL = process.env.PLAYER_TEST_URL || 'http://127.0.0.1:4174/';
const OUT = path.resolve('artifacts/player-startup');
const startedAt = performance.now();
const manifest = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  url: BASE_URL + '?playertest=1',
  renderer: null,
  navigationMs: null,
  helperReadyMs: null,
  firstAttemptMs: null,
  retryMs: null,
  totalMs: null,
  initialState: null,
  finalState: null,
  glbResponses: [],
  glbFailures: [],
  consoleErrors: [],
  pageErrors: [],
  failure: null
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser = null;
  try {
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
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1
    });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    const requests = new Map();
    page.on('request', request => {
      if (/\.glb(?:$|[?#])/i.test(request.url())) requests.set(request, performance.now());
    });
    page.on('response', response => {
      if (/\.glb(?:$|[?#])/i.test(response.url())) {
        const request = response.request();
        const begin = requests.get(request);
        manifest.glbResponses.push({
          url: response.url(),
          status: response.status(),
          durationMs: begin === undefined ? null : Number((performance.now() - begin).toFixed(1))
        });
      }
    });
    page.on('requestfailed', request => {
      if (/\.glb(?:$|[?#])/i.test(request.url())) {
        manifest.glbFailures.push({
          url: request.url(),
          failure: request.failure()?.errorText || 'unknown request failure'
        });
      }
    });
    page.on('pageerror', error => manifest.pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') manifest.consoleErrors.push(message.text());
    });

    let stepStartedAt = performance.now();
    await page.goto(BASE_URL + '?playertest=1', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    manifest.navigationMs = Number((performance.now() - stepStartedAt).toFixed(1));

    stepStartedAt = performance.now();
    await page.waitForFunction(() => !!window.__ELSN_PLAYER_STARTUP_SMOKE__, undefined, {
      timeout: 90000,
      polling: 250
    });
    manifest.helperReadyMs = Number((performance.now() - stepStartedAt).toFixed(1));

    manifest.renderer = await page.evaluate(() => {
      const canvas = document.getElementById('renderCanvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      if (!gl) return 'WebGL context unavailable';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'renderer extension unavailable';
    });

    stepStartedAt = performance.now();
    await page.waitForFunction(() => {
      const helper = window.__ELSN_PLAYER_STARTUP_SMOKE__;
      if (!helper) return false;
      const state = helper.state();
      return state.modelReady === true || state.loading === false;
    }, undefined, { timeout: 180000, polling: 250 }).catch(() => null);
    manifest.firstAttemptMs = Number((performance.now() - stepStartedAt).toFixed(1));
    manifest.initialState = await page.evaluate(() => window.__ELSN_PLAYER_STARTUP_SMOKE__.state());

    if (manifest.initialState.modelReady !== true) {
      stepStartedAt = performance.now();
      await page.evaluate(() => window.__ELSN_PLAYER_STARTUP_SMOKE__.retry());
      await page.waitForFunction(() => {
        const helper = window.__ELSN_PLAYER_STARTUP_SMOKE__;
        if (!helper) return false;
        const state = helper.state();
        return state.modelReady === true || state.loading === false;
      }, undefined, { timeout: 180000, polling: 250 }).catch(() => null);
      manifest.retryMs = Number((performance.now() - stepStartedAt).toFixed(1));
    }

    manifest.finalState = await page.evaluate(() => window.__ELSN_PLAYER_STARTUP_SMOKE__.state());
    assert.equal(manifest.finalState.modelReady, true,
      'El GLB real del vikingo no quedó listo después de un reintento. Estado: ' +
      JSON.stringify(manifest.finalState));
    assert.ok(manifest.finalState.realPlayerMeshCount > 0,
      'El GLB del vikingo no contiene mallas visibles');
    assert.equal(manifest.finalState.fallbackVisible, false,
      'El personaje de reserva sigue visible aunque el GLB figura como listo');
    assert.equal(manifest.consoleErrors.length, 0,
      'Errores de consola: ' + manifest.consoleErrors.join(' | '));
    assert.equal(manifest.pageErrors.length, 0,
      'Errores JavaScript: ' + manifest.pageErrors.join(' | '));
    console.log('[player-startup] real Viking GLB ready: ' + JSON.stringify(manifest.finalState));
  } catch (error) {
    manifest.failure = String(error && error.stack || error);
    throw error;
  } finally {
    manifest.totalMs = Number((performance.now() - startedAt).toFixed(1));
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (browser) await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
