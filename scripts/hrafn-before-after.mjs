#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const beforeUrl = process.env.HRAFN_BEFORE_URL;
const afterUrl = process.env.HRAFN_AFTER_URL;
const output = path.resolve(process.env.HRAFN_COMPARE_OUT || 'artifacts/hrafn-before-after');
const captureSeed = Number.parseInt(process.env.HRAFN_CAPTURE_SEED || process.env.CAPTURE_SEED || '20261110', 10) >>> 0;
const viewport = { width: 384, height: 832 };
const deviceScaleFactor = 3.75;
const deviceProfile = { name: 'Samsung Galaxy S26 Ultra (emulado)', model: 'SM-S948B', deviceScaleFactor, deviceMemoryGB: 12, hardwareConcurrency: 8, touch: true, rendererLimit: 'CI usa ANGLE SwiftShader, no la GPU Adreno física' };

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
  const clockState = await withTimeout(page.evaluate(hour => {
    const clock = window.__ELSN_ATMOSPHERE_CONTROLS;
    const api = window.__ELSN_TEST__;
    if (!clock || !api || typeof api.captureCanvas !== 'function') {
      throw new Error('Atmosphere clock or game capture API is unavailable.');
    }
    clock.pause();
    return clock.setTime(hour);
  }, hour), 15000, label + ' ' + phaseId + ' clock update');
  // Let the normal render loop present the changed lighting. Do not force a second
  // synchronous scene.render(): on SwiftShader that duplicates the heaviest frame
  // and can block the Playwright protocol for tens of seconds.
  await page.waitForTimeout(750);
  const captureResult = await withTimeout(page.evaluate(() => {
    const api = window.__ELSN_TEST__;
    if (!api || typeof api.captureCanvas !== 'function') {
      throw new Error('The game canvas capture API is unavailable.');
    }
    let dataUrl = null, canvasError = null;
    try { dataUrl = api.captureCanvas(); }
    catch (error) { canvasError = String(error?.message || error); }
    return { dataUrl, canvasError };
  }), 60000, label + ' ' + phaseId + ' canvas readback');
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
  return { clockState, bytes, method };
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
  method: 'same-seed-same-browser-same-S26-Ultra-mobile-emulation-same-game-state-four-clock-phases-plus-performance-sampling',
  renderer: 'Chromium headless + ANGLE SwiftShader (software; no es benchmark físico del S26 Ultra)',
  deviceProfile,
  viewport: { ...viewport, deviceScaleFactor },
  captureSeed,
  beforeUrl,
  afterUrl,
  builds: {},
  phases: [],
  warnings: [
    'Pixel differences identify changes; edge energy is an auxiliary sharpness indicator, not a subjective quality verdict.',
    'Performance values use S26 Ultra capability emulation on SwiftShader; they are not physical Adreno measurements.',
    'Both versions use the same deterministic random seed, menu flow, scene-readiness gate and frozen clock.'
  ]
};

function saveManifest() {
  fs.mkdirSync(output, { recursive: true });
  const temporary = path.join(output, 'manifest.json.tmp');
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temporary, path.join(output, 'manifest.json'));
}


async function sampleGraphicsPerformance(page, label, startupHeapTrace = []) {
  const samples = (startupHeapTrace || []).map(sample => ({...sample, sampleLabel:'Carga / entrada'}));
  const sampleStartedAt = Date.now();
  const collect = async () => withTimeout(page.evaluate(() => {
    if (typeof window.getGameHealthDebug !== 'function') throw new Error('getGameHealthDebug() is unavailable.');
    const health = window.getGameHealthDebug(), runtime = health.runtime || {}, fsr = window.__ELSN_FSR1 || null;
    const water = typeof window.__elSinNombreWaterDebugSnapshot === 'function' ? window.__elSinNombreWaterDebugSnapshot() : null;
    const memory = performance.memory && typeof performance.memory === 'object' ? performance.memory : null;
    const toMB = value => value!==null&&value!==undefined&&Number.isFinite(Number(value)) ? Number((Number(value) / 1048576).toFixed(2)) : null;
    return {
      build: document.querySelector('meta[name="el-sin-nombre-build"]')?.content || null,
      profile: runtime.graphicsProfile || null, fps: runtime.fps ?? health.fps ?? null,
      frameTiming: runtime.frameTimingMs || null, performanceAssessment: runtime.performanceAssessment || null,
      renderDpr: runtime.renderDpr ?? null, renderWidth: runtime.renderWidth ?? null, renderHeight: runtime.renderHeight ?? null,
      drawCalls: runtime.drawCalls ?? null, activeMeshes: runtime.activeMeshes ?? null, totalVertices: runtime.totalVertices ?? null,
      worldUpdateMs: runtime.worldUpdateMs ?? null, renderCpuMs: runtime.renderCpuMs ?? null,
      gpuRenderer: runtime.gpuRenderer || null, gpuVendor: runtime.gpuVendor || null, webglVersion: runtime.webglVersion || null,
      devicePixelRatio: runtime.devicePixelRatio ?? window.devicePixelRatio, isTouchDevice: runtime.isTouchDevice ?? null,
      deviceMemory: runtime.deviceMemory ?? navigator.deviceMemory ?? null, hardwareConcurrency: runtime.hardwareConcurrency ?? navigator.hardwareConcurrency ?? null,
      heapUsedMB: memory ? toMB(memory.usedJSHeapSize) : null,
      heapTotalMB: memory ? toMB(memory.totalJSHeapSize) : null,
      heapLimitMB: memory ? toMB(memory.jsHeapSizeLimit) : null,
      fsr1: fsr ? { enabled:fsr.enabled===true, method:fsr.method||null, outputDpr:fsr.outputDpr??null,
        inputScale:typeof fsr.inputScale==='function'?fsr.inputScale():null,
        effectiveSourceDpr:typeof fsr.effectiveSourceDpr==='function'?fsr.effectiveSourceDpr():null,
        source:typeof fsr.source==='function'?fsr.source():null, output:typeof fsr.output==='function'?fsr.output():null,
        reason:fsr.reason||null } : null,
      waterTimings: water?.timings || null
    };
  }), 10000, label + ' graphics telemetry sample');
  const initial = await collect();
  samples.push({...initial, elapsedMs:0, sampleLabel:'Entrada'});
  await page.waitForTimeout(8000);
  for (let index = 0; index < 8; index++) {
    const sample = await collect();
    samples.push({...sample, elapsedMs:Date.now()-sampleStartedAt, sampleLabel:'Estable '+(index+1)});
    if (index < 7) await page.waitForTimeout(1000);
  }
  const median = values => { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b); if(!sorted.length)return null; const m=Math.floor(sorted.length/2); return Number((sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2).toFixed(3)); };
  const values = key => samples.map(sample=>sample[key]).filter(value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))).map(Number);
  const fpsValues=values('fps'),p95Values=samples.map(s=>s.frameTiming?.p95).filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number),p99Values=samples.map(s=>s.frameTiming?.p99).filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number);
  const heapValues=values('heapUsedMB'),last=samples[samples.length-1]||{};
  return {label,sampleCount:samples.length,medianFps:median(fpsValues),minimumFps:fpsValues.length?Math.min(...fpsValues):null,
    medianFrameP95Ms:median(p95Values),medianFrameP99Ms:median(p99Values),medianWorldUpdateCpuMs:median(values('worldUpdateMs')),
    medianRenderSubmissionCpuMs:median(values('renderCpuMs')),medianDrawCalls:median(values('drawCalls')),
    heapInitialMB:samples[0]?.heapUsedMB??null,heapPeakMB:heapValues.length?Math.max(...heapValues):null,
    heapFinalMB:last.heapUsedMB??null,heapSampleCount:heapValues.length,
    profile:last.profile,build:last.build,renderDpr:last.renderDpr,renderWidth:last.renderWidth,renderHeight:last.renderHeight,
    gpuRenderer:last.gpuRenderer,gpuVendor:last.gpuVendor,webglVersion:last.webglVersion,devicePixelRatio:last.devicePixelRatio,
    isTouchDevice:last.isTouchDevice,deviceMemory:last.deviceMemory,hardwareConcurrency:last.hardwareConcurrency,
    fsr1:last.fsr1,performanceAssessment:last.performanceAssessment,samples};
}

async function bootGame(label, url) {
  const page = await browser.newPage({ viewport, deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 17; SM-S948B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', error => errors.push(String(error && error.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(({ seed }) => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'deviceMemory', { configurable: true, get: () => 12 });
    Object.defineProperty(Object.getPrototypeOf(navigator), 'hardwareConcurrency', { configurable: true, get: () => 8 });
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
      () => window.__elSinNombreStartupSmoke?.worldReady === true ||
        !!document.querySelector('#intro.open'),
      undefined,
      { timeout: 240000, polling: 500 }
    );
    // Older baseline builds may expose the visible ready intro a frame before
    // their optional test API is attached. Treat UI readiness and test-API
    // readiness as separate gates so failures are attributed accurately.
    await page.waitForFunction(
      () => !!window.__ELSN_TEST__ &&
        typeof window.__ELSN_TEST__.prepareCaptureFrame === 'function' &&
        typeof window.__ELSN_TEST__.captureCanvas === 'function',
      undefined,
      { timeout: 30000, polling: 250 }
    );
  } catch (error) {
    const startupDiagnostics = await withTimeout(page.evaluate(() => ({
      readyState: document.readyState,
      bodyClass: document.body?.className || '',
      testApiAvailable: !!window.__ELSN_TEST__,
      testApiMethods: window.__ELSN_TEST__ ? Object.keys(window.__ELSN_TEST__).filter(key => /capture|render|prepare/i.test(key)) : [],
      introOpen: !!document.querySelector('#intro.open'),
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
  // Start a bounded 250 ms heap trace before the player enters the world.
  // It records the transition into the playable scene, not device-wide RAM/VRAM.
  await page.evaluate(() => {
    const trace = { startedAt: performance.now(), samples: [], timer: null };
    const capture = () => {
      const memory = performance.memory;
      if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return;
      trace.samples.push({
        elapsedMs: Math.round(performance.now() - trace.startedAt),
        heapUsedMB: Number((memory.usedJSHeapSize / 1048576).toFixed(2)),
        heapTotalMB: Number((memory.totalJSHeapSize / 1048576).toFixed(2)),
        heapLimitMB: Number((memory.jsHeapSizeLimit / 1048576).toFixed(2))
      });
    };
    capture();
    trace.timer = window.setInterval(capture, 250);
    window.__ELSN_INSPECTOR_HEAP_TRACE = trace;
  });
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

  const startupHeapTrace = await page.evaluate(() => {
    const trace = window.__ELSN_INSPECTOR_HEAP_TRACE;
    if (!trace) return [];
    if (trace.timer) window.clearInterval(trace.timer);
    const memory = performance.memory;
    if (memory && Number.isFinite(memory.usedJSHeapSize)) {
      trace.samples.push({
        elapsedMs: Math.round(performance.now() - trace.startedAt),
        heapUsedMB: Number((memory.usedJSHeapSize / 1048576).toFixed(2)),
        heapTotalMB: Number((memory.totalJSHeapSize / 1048576).toFixed(2)),
        heapLimitMB: Number((memory.jsHeapSizeLimit / 1048576).toFixed(2))
      });
    }
    return trace.samples;
  });
  const performance = await sampleGraphicsPerformance(page, label, startupHeapTrace);
  manifest.builds[label] = {
    url,
    build: readiness.build,
    performance,
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
  if (manifest.builds.before.build && manifest.builds.after.build && manifest.builds.before.build === manifest.builds.after.build) {
    throw new Error('A/B comparison refused: before and after resolve to the same game release ' + manifest.builds.after.build + '.');
  }
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
} finally {
  if (before?.page) await safeClosePage(before.page);
  if (after?.page) await safeClosePage(after.page);
  await safeCloseBrowser(browser);
}
