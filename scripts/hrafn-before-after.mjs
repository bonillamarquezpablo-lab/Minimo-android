#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const beforeUrl = process.env.HRAFN_BEFORE_URL;
const afterUrl = process.env.HRAFN_AFTER_URL;
const output = path.resolve(process.env.HRAFN_COMPARE_OUT || 'artifacts/hrafn-before-after');
const captureSeed = Number.parseInt(process.env.HRAFN_CAPTURE_SEED || process.env.CAPTURE_SEED || '20261110', 10) >>> 0;
const viewport = { width: 960, height: 540 };

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' exceeded ' + timeoutMs + ' ms')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function safeClosePage(page) {
  if (!page) return;
  try {
    await withTimeout(page.close({ runBeforeUnload: false }), 5000, 'Page close').catch(() => {});
  } catch (_) {}
}
async function safeCloseBrowser(browser) {
  if (!browser) return;
  let closed = false;
  const closing = browser.close().then(() => { closed = true; }).catch(() => {});
  await withTimeout(closing, 7000, 'Browser close').catch(() => {});
  if (!closed) {
    const process = browser.process?.();
    if (process && !process.killed) {
      try { process.kill('SIGKILL'); } catch (_) {}
    }
    await withTimeout(closing, 2000, 'Browser forced shutdown').catch(() => {});
  }
}

const phases = [
  { id: 'dawn', hour: 6 },
  { id: 'noon', hour: 12 },
  { id: 'dusk', hour: 18 },
  { id: 'midnight', hour: 0 }
];


async function capturePhaseFrame(page, hour, label, phaseId) {
  const captureResult = await withTimeout(page.evaluate(hour => {
    const clock = window.__ELSN_ATMOSPHERE_CONTROLS;
    const api = window.__ELSN_TEST__;
    if (!clock || !api || typeof api.render !== 'function' || typeof api.captureCanvas !== 'function') {
      throw new Error('Atmosphere clock or game capture API is unavailable.');
    }
    clock.pause();
    const clockState = clock.setTime(hour);
    api.render();
    let dataUrl = null, canvasError = null;
    try { dataUrl = api.captureCanvas(); }
    catch (error) { canvasError = String(error?.message || error); }
    return { clockState, dataUrl, canvasError };
  }, hour), 20000, label + ' ' + phaseId + ' phase render`);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(captureResult.dataUrl || '');
  let bytes = match ? Buffer.from(match[1], 'base64') : null;
  let method = 'game-canvas-readback';
  const valid = value => Buffer.isBuffer(value) && value.length > 10000 &&
    value.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!valid(bytes)) {
    const session = await withTimeout(page.context().newCDPSession(page), 5000, 'CDP session creation');
    try {
      const shot = await withTimeout(session.send('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true
      }), 15000, label + ' ' + phaseId + ' compositor capture');
      bytes = Buffer.from(shot.data || '', 'base64');
      method = 'cdp-composited-frame';
    } finally {
      await withTimeout(session.detach(), 2000, 'CDP session detach').catch(() => {});
    }
  }
  if (!valid(bytes)) throw new Error(label + ' ' + phaseId + ': neither WebGL readback nor compositor returned a valid PNG. Canvas: ' + (captureResult.canvasError || 'invalid/empty PNG'));
  return { clockState: captureResult.clockState, bytes, method };
}

if (!beforeUrl || !afterUrl) {
  console.error('HRAFN_BEFORE_URL and HRAFN_AFTER_URL are required; refusing to invent a baseline.');
  process.exit(2);
}
for (const value of [beforeUrl, afterUrl]) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('A/B URLs must use HTTP or HTTPS.');
}

const browser = await chromium.launch({
  headless: true,
  timeout: 60000,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--enable-webgl2',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
    '--force-color-profile=srgb'
  ]
});

const manifest = {
  schema: 2,
  createdAt: new Date().toISOString(),
  method: 'same-seed-same-browser-same-viewport-same-game-state-four-clock-phases',
  renderer: 'Chromium headless + ANGLE SwiftShader',
  viewport: { ...viewport, deviceScaleFactor: 1 },
  captureSeed,
  beforeUrl,
  afterUrl,
  builds: {},
  phases: [],
  warnings: [
    'Pixel differences identify changes; they do not decide whether a change is visually better.',
    'Both versions use the same deterministic random seed, menu flow, scene-readiness gate and frozen clock.'
  ]
};

function saveManifest() {
  fs.mkdirSync(output, { recursive: true });
  const temporary = path.join(output, 'manifest.json.tmp');
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temporary, path.join(output, 'manifest.json'));
}

async function bootGame(label, url) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', error => errors.push(String(error && error.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(({ seed }) => {
    if (new URLSearchParams(location.search).get('test') !== '1') return;
    let state = seed >>> 0;
    Math.random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    Object.defineProperty(window, '__ELSN_CAPTURE_SEED__', { value: seed, configurable: false });
  }, { seed: captureSeed });

  const target = new URL(url);
  target.searchParams.set('test', '1');
  target.searchParams.delete('coastref');
  await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 90000 });

  const audioGate = page.locator('#audioGateStart');
  if (await audioGate.isVisible().catch(() => false)) await audioGate.click();
  await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#chooseQuality').click();
  await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#continueUnnamed').click();

  const startupStartedAt = Date.now();
  try {
    await page.waitForFunction(
      () => window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke &&
        window.__elSinNombreStartupSmoke.worldReady === true,
      undefined,
      { timeout: 240000, polling: 500 }
    );
  } catch (error) {
    const startupDiagnostics = await withTimeout(page.evaluate(() => ({
      readyState: document.readyState,
      bodyClass: document.body?.className || '',
      testApiAvailable: !!window.__ELSN_TEST__,
      startupSmoke: window.__elSinNombreStartupSmoke || null,
      qualitySelectorVisible: !!document.querySelector('#chooseQuality'),
      continueButtonVisible: !!document.querySelector('#continueUnnamed'),
      introVisible: !!document.querySelector('#intro'),
      canvasCount: document.querySelectorAll('canvas').length,
      canvasSizes: [...document.querySelectorAll('canvas')].map(canvas => ({
        width: canvas.width, height: canvas.height,
        clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight
      }))
    })), 5000, label + ' startup diagnostics').catch(() => ({ evaluationFailedOrRendererBlocked: true }));
    manifest.builds[label] = {
      url, startupReady: false, startupWaitMs: Date.now() - startupStartedAt,
      pageErrors: errors, consoleErrors, startupDiagnostics
    };
    saveManifest();
    throw new Error(label + ' startup did not reach worldReady after ' +
      (Date.now() - startupStartedAt) + ' ms. Diagnostics: ' +
      JSON.stringify(startupDiagnostics) + '. Original error: ' + String(error?.message || error));
  }
  await page.locator('#intro.open').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#newGameChoice').click();
  await page.waitForFunction(
    () => document.body.classList.contains('game-running') &&
      document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
    undefined,
    { timeout: 30000, polling: 250 }
  );

  const readiness = await page.evaluate(async () => {
    const api = window.__ELSN_TEST__;
    if (!api || typeof api.prepareCaptureFrame !== 'function') {
      throw new Error('The game test API does not expose prepareCaptureFrame().');
    }
    const prepared = await api.prepareCaptureFrame({ timeoutMs: 120000 });
    const clock = window.__ELSN_ATMOSPHERE_CONTROLS;
    if (!clock || typeof clock.pause !== 'function' || typeof clock.setTime !== 'function') {
      throw new Error('The atmosphere clock does not expose pause() and setTime().');
    }
    if (typeof api.captureCanvas !== 'function') {
      throw new Error('The game test API does not expose captureCanvas().');
    }
    return {
      build: api.build || null,
      gameRunning: document.body.classList.contains('game-running'),
      worldReady: window.__elSinNombreStartupSmoke?.worldReady === true,
      readiness: prepared,
      clock: clock.getState?.() || null
    };
  });

  manifest.builds[label] = {
    url,
    build: readiness.build,
    worldReady: readiness.worldReady,
    gameRunning: readiness.gameRunning,
    readiness: readiness.readiness,
    initialClock: readiness.clock,
    pageErrors: errors,
    consoleErrors
  };
  if (!readiness.worldReady || !readiness.gameRunning) {
    throw new Error(label + ' did not reach a fully running, ready game scene.');
  }
  return { page, errors, consoleErrors };
}

async function capture(page, label, phase) {
  const result = await capturePhaseFrame(page, phase.hour, label, phase.id);
  const clockState = result.clockState;
  if (clockState && Number.isFinite(clockState.timeOfDay) &&
      Math.abs(clockState.timeOfDay - phase.hour) > 0.01) {
    throw new Error(label + ' clock did not settle at ' + phase.hour + ':00.');
  }
  const directory = path.join(output, label);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, phase.id + '.png');
  fs.writeFileSync(file, result.bytes);
  return {
    label, phase: phase.id, hour: phase.hour,
    file: path.relative(process.cwd(), file),
    bytes: result.bytes.length, method: result.method,
    clock: clockState || null
  };
}

let before = null;
let after = null;
try {
  fs.mkdirSync(output, { recursive: true });
  const beforeCaptures = [];
  const afterCaptures = [];

  // Do not keep two complete 13-island worlds rendering at once. Sequential
  // capture preserves the same seed, viewport and clock phases while halving
  // peak WebGL/CPU pressure on SwiftShader.
  before = await bootGame('before', beforeUrl);
  for (const phase of phases) {
    const shot = await capture(before.page, 'before', phase);
    beforeCaptures.push(shot);
    manifest.builds.before.captures = beforeCaptures.slice();
    saveManifest();
    console.log('[HRAFN_AB_CAPTURE] before/' + phase.id + ' bytes=' + shot.bytes + ' method=' + shot.method);
  }
  await safeClosePage(before.page);
  before = null;

  after = await bootGame('after', afterUrl);
  for (const phase of phases) {
    const shot = await capture(after.page, 'after', phase);
    afterCaptures.push(shot);
    manifest.builds.after.captures = afterCaptures.slice();
    saveManifest();
    console.log('[HRAFN_AB_CAPTURE] after/' + phase.id + ' bytes=' + shot.bytes + ' method=' + shot.method);
  }
  await safeClosePage(after.page);
  after = null;

  manifest.phases = phases.map((phase, index) => ({
    id: phase.id,
    hour: phase.hour,
    before: beforeCaptures[index],
    after: afterCaptures[index]
  }));
  if (manifest.builds.before.pageErrors?.length || manifest.builds.after.pageErrors?.length ||
      manifest.builds.before.consoleErrors?.length || manifest.builds.after.consoleErrors?.length) {
    manifest.warnings.push('One or more page or console errors were recorded; inspect the build diagnostics before accepting the comparison.');
  }
  saveManifest();
  console.log('[HRAFN_AB_RESULT] ' + JSON.stringify({
    captured: manifest.phases.length,
    seed: captureSeed,
    viewport,
    sequentialBuildCapture: true,
    output
  }));
} catch (error) {
  manifest.failure = String(error && error.stack || error);
  saveManifest();
  console.error('[HRAFN_AB_FATAL]', manifest.failure);
  process.exitCode = 1;
}
} finally {
  if (before?.page) await safeClosePage(before.page);
  if (after?.page) await safeClosePage(after.page);
  await safeCloseBrowser(browser);
}
