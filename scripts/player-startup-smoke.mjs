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
  url: BASE_URL + '?playertest=1&debug=1',
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
    await page.goto(BASE_URL + '?playertest=1&debug=1', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    manifest.navigationMs = Number((performance.now() - stepStartedAt).toFixed(1));

    // The game boots only after the user chooses a profile and completes the identity screen.
    stepStartedAt = performance.now();
    const audioGate = page.locator('#audioGateStart');
    if (await audioGate.isVisible().catch(() => false)) await audioGate.click({ timeout: 30000 });
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#continueUnnamed').click();
    manifest.menuFlowMs = Number((performance.now() - stepStartedAt).toFixed(1));

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

    // Wait for the complete blocking startup barrier, then audit every import/network
    // entry point across the first 20 seconds of actual gameplay.
    const blockingBarrierStartedAt = performance.now();
    await page.waitForFunction(() => window.__elSinNombreStartupSmoke?.worldReady === true,
      undefined, { timeout: 180000, polling: 250 });
    manifest.blockingStartupMs = Number((performance.now() - blockingBarrierStartedAt).toFixed(1));
    manifest.memoryEstimate = await page.evaluate(() => window.__elSinNombreStartupMemoryEstimate || null);
    const npcRoster = await page.evaluate(() => window.__elSinNombreStartupNpcRoster || null);
    assert.ok(npcRoster && npcRoster.ready === true,
      'Los NPC GLB obligatorios de la isla inicial no están listos: ' + JSON.stringify(npcRoster));

    await page.evaluate(() => {
      const audit = window.__startupPostEntryAudit = { calls: [], network: [] };
      const isGlb = value => /\\.glb(?:$|[?#])/i.test(String(value || ''));
      const recordImport = (kind, value) => {
        if (document.body.classList.contains('game-running')) {
          audit.calls.push({ kind, value: String(value).slice(0, 500), at: performance.now() });
        }
      };
      const recordNetwork = (kind, value) => {
        if (document.body.classList.contains('game-running') && isGlb(value)) {
          audit.network.push({ kind, value: String(value).slice(0, 500), at: performance.now() });
        }
      };
      const loader = window.BABYLON && window.BABYLON.SceneLoader;
      if (loader) {
        for (const name of ['ImportMeshAsync', 'LoadAssetContainerAsync', 'AppendAsync']) {
          if (typeof loader[name] !== 'function') continue;
          const original = loader[name];
          loader[name] = function (...args) {
            recordImport('SceneLoader.' + name, args.map(String).join(' '));
            return original.apply(this, args);
          };
        }
      }
      const originalFetch = window.fetch.bind(window);
      window.fetch = function (input, ...args) {
        const url = typeof input === 'string' ? input : input && input.url;
        recordNetwork('fetch', url);
        return originalFetch(input, ...args);
      };
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        recordNetwork('XMLHttpRequest', url);
        return originalOpen.call(this, method, url, ...args);
      };
    });

    await page.locator('#newGameChoice').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#newGameChoice').click();
    await page.waitForFunction(() => document.body.classList.contains('game-running'),
      undefined, { timeout: 30000, polling: 100 });
    const perf20s = await page.evaluate(async () => {
      const start = performance.now();
      let frames = 0, totalFrameMs = 0, maxFrameMs = 0, last = start;
      while (performance.now() - start < 20000) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = performance.now(), frameMs = now - last;
        last = now; frames++; totalFrameMs += frameMs; maxFrameMs = Math.max(maxFrameMs, frameMs);
      }
      const memory = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapLimit: performance.memory.jsHeapSizeLimit
      } : null;
      return {
        durationMs: Number((performance.now() - start).toFixed(1)),
        frames,
        averageFps: Number((frames / ((performance.now() - start) / 1000)).toFixed(1)),
        averageFrameMs: Number((totalFrameMs / Math.max(1, frames)).toFixed(2)),
        maxFrameMs: Number(maxFrameMs.toFixed(2)),
        jsHeap: memory
      };
    });
    manifest.performanceFirst20s = perf20s;
    manifest.postEntryAudit = await page.evaluate(() => window.__startupPostEntryAudit);
    assert.equal(manifest.postEntryAudit.calls.length, 0,
      'Se invocó un importador GLB después de entrar: ' + JSON.stringify(manifest.postEntryAudit.calls));
    assert.equal(manifest.postEntryAudit.network.length, 0,
      'Se descargó un GLB después de entrar: ' + JSON.stringify(manifest.postEntryAudit.network));
    const postEntryPlayer = await page.evaluate(() => window.__ELSN_PLAYER_STARTUP_SMOKE__?.state() || null);
    assert.ok(postEntryPlayer && postEntryPlayer.modelReady && !postEntryPlayer.fallbackVisible,
      'El personaje provisional sigue visible después de entrar: ' + JSON.stringify(postEntryPlayer));
    const finalErrors = await page.evaluate(() => ({
      consoleErrors: window.__elSinNombreStartupSmoke?.consoleErrors?.length || 0,
      runtimeErrors: window.__elSinNombreStartupSmoke?.runtimeErrors?.length || 0,
      unhandledRejections: window.__elSinNombreStartupSmoke?.unhandledRejections?.length || 0
    }));
    manifest.postEntryErrors = finalErrors;
    assert.deepEqual(finalErrors, { consoleErrors: 0, runtimeErrors: 0, unhandledRejections: 0 },
      'Se detectaron errores durante los primeros 20 segundos de partida.');
    // Repeat in the same browser profile to measure the Service Worker/Cache API warm path.
    const cachedLaunchStartedAt = performance.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    const cachedAudioGate = page.locator('#audioGateStart');
    if (await cachedAudioGate.isVisible().catch(() => false)) await cachedAudioGate.click({ timeout: 30000 });
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#continueUnnamed').click();
    const cachedBarrierStartedAt = performance.now();
    await page.waitForFunction(() => window.__elSinNombreStartupSmoke?.worldReady === true,
      undefined, { timeout: 180000, polling: 250 });
    manifest.cachedNavigationAndProfileMs = Number((cachedBarrierStartedAt - cachedLaunchStartedAt).toFixed(1));
    manifest.cachedBlockingStartupMs = Number((performance.now() - cachedBarrierStartedAt).toFixed(1));
    manifest.cachedMemoryEstimate = await page.evaluate(() => window.__elSinNombreStartupMemoryEstimate || null);
    console.log('[player-startup] first/cached startup + first 20s: ' +
      JSON.stringify({ npcRoster, memoryEstimate: manifest.memoryEstimate, cachedMemoryEstimate: manifest.cachedMemoryEstimate, perf20s, postEntryAudit: manifest.postEntryAudit, postEntryErrors: finalErrors, cachedNavigationAndProfileMs: manifest.cachedNavigationAndProfileMs, cachedBlockingStartupMs: manifest.cachedBlockingStartupMs }));
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
