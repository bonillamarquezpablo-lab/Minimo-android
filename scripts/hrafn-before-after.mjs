#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const beforeUrl = process.env.HRAFN_BEFORE_URL;
const afterUrl = process.env.HRAFN_AFTER_URL;
const output = path.resolve(process.env.HRAFN_COMPARE_OUT || 'artifacts/hrafn-before-after');
const captureSeed = Number.parseInt(process.env.HRAFN_CAPTURE_SEED || process.env.CAPTURE_SEED || '20261110', 10) >>> 0;
const viewport = { width: 1280, height: 720 };
const phases = [
  { id: 'dawn', hour: 6 },
  { id: 'noon', hour: 12 },
  { id: 'dusk', hour: 18 },
  { id: 'midnight', hour: 0 }
];

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

  await page.waitForFunction(
    () => window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke &&
      window.__elSinNombreStartupSmoke.worldReady === true,
    undefined,
    { timeout: 180000, polling: 500 }
  );
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
  const captureResult = await page.evaluate(hour => {
    const clock = window.__ELSN_ATMOSPHERE_CONTROLS;
    const api = window.__ELSN_TEST__;
    clock.pause();
    const clockState = clock.setTime(hour);
    // Change the clock, render and read the WebGL buffer before another RAF can clear it.
    const dataUrl = api.captureCanvas();
    return { clockState, dataUrl };
  }, phase.hour);
  const clockState = captureResult.clockState;

  if (clockState && Number.isFinite(clockState.timeOfDay) &&
      Math.abs(clockState.timeOfDay - phase.hour) > 0.01) {
    throw new Error(label + ' clock did not settle at ' + phase.hour + ':00.');
  }

  const dataUrl = captureResult.dataUrl;
  if (typeof dataUrl !== 'string' || !/^data:image[.]png;base64,/.test(dataUrl)) {
    throw new Error(label + ' ' + phase.id + ': canvas capture did not return PNG data.');
  }
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (bytes.length < 10000 || bytes[0] !== 0x89 || bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error(label + ' ' + phase.id + ': captured PNG is invalid or unexpectedly small.');
  }

  const directory = path.join(output, label);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, phase.id + '.png');
  fs.writeFileSync(file, bytes);
  return {
    label,
    phase: phase.id,
    hour: phase.hour,
    file: path.relative(process.cwd(), file),
    bytes: bytes.length,
    clock: clockState || null
  };
}

let before = null;
let after = null;
try {
  fs.mkdirSync(output, { recursive: true });
  before = await bootGame('before', beforeUrl);
  after = await bootGame('after', afterUrl);

  for (const phase of phases) {
    const beforeCapture = await capture(before.page, 'before', phase);
    const afterCapture = await capture(after.page, 'after', phase);
    manifest.phases.push({
      id: phase.id,
      hour: phase.hour,
      before: beforeCapture,
      after: afterCapture
    });
    saveManifest();
    console.log('[HRAFN_AB_CAPTURE] ' + phase.id +
      ' before=' + beforeCapture.bytes + 'B after=' + afterCapture.bytes + 'B');
  }

  if (before.errors.length || after.errors.length) {
    manifest.warnings.push('One or more page errors were recorded; inspect the build diagnostics before accepting the comparison.');
  }
  saveManifest();
  console.log('[HRAFN_AB_RESULT] ' + JSON.stringify({
    captured: manifest.phases.length,
    seed: captureSeed,
    output
  }));
} catch (error) {
  manifest.failure = String(error && error.stack || error);
  saveManifest();
  console.error('[HRAFN_AB_FATAL]', manifest.failure);
  process.exitCode = 1;
} finally {
  if (before?.page) await before.page.close().catch(() => {});
  if (after?.page) await after.page.close().catch(() => {});
  await browser.close().catch(() => {});
}
