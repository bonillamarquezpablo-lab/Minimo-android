import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.CAPTURE_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/custom-scene-captures');
const rawPlan = process.env.CAPTURE_PLAN_JSON || '[]';
const plan = JSON.parse(rawPlan);

function validatePlan(value) {
  assert.ok(Array.isArray(value), 'capture_plan debe ser una lista JSON de cámaras.');
  assert.ok(value.length >= 1 && value.length <= 200,
    'El plan debe contener entre 1 y 200 capturas.');
  const ids = new Set();
  for (const [i, shot] of value.entries()) {
    assert.ok(shot && typeof shot === 'object', 'Captura ' + i + ': objeto inválido.');
    assert.match(String(shot.id || ''), /^[a-zA-Z0-9_-]{1,48}$/,
      'Captura ' + i + ': id obligatorio (letras, números, _ o -).');
    assert.ok(!ids.has(shot.id), 'ID repetido: ' + shot.id);
    ids.add(shot.id);
    assert.ok(Number.isFinite(shot.time ?? 37), 'time debe ser numérico.');
    const camera = shot.camera || shot;
    if (Number.isInteger(shot.islandIndex)) {
      for (const key of ['x','y','z','targetX','targetY','targetZ']) {
        assert.ok(Number.isFinite(camera[key] ?? 0), shot.id + ': offset ' + key + ' debe ser numérico.');
      }
    } else {
      for (const key of ['x','y','z','targetX','targetY','targetZ']) {
        assert.ok(Number.isFinite(camera[key]), shot.id + ': falta coordenada absoluta ' + key + '.');
      }
    }
    assert.ok(shot.tide === undefined || ['natural','high','low'].includes(shot.tide),
      shot.id + ': tide debe ser natural, high o low.');
  }
}
validatePlan(plan);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {
    schema: 1,
    capturedAt: new Date().toISOString(),
    build: null,
    renderer: 'Chromium headless + ANGLE SwiftShader',
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    requestedCount: plan.length,
    captures: [],
    failures: [],
    consoleErrors: [],
    pageErrors: []
  };
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: 60000,
      args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
        '--ignore-gpu-blocklist','--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: manifest.viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', e => manifest.pageErrors.push(String(e.stack || e)));
    page.on('console', m => { if (m.type() === 'error') manifest.consoleErrors.push(m.text()); });

    await page.goto(BASE_URL + '?test=1&coastref=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const audioGate = page.locator('#audioGateStart');
    if (await audioGate.isVisible().catch(() => false)) await audioGate.click();
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#continueUnnamed').click();
    await page.waitForFunction(() =>
      window.__ELSN_TEST__ && window.__elSinNombreStartupSmoke?.worldReady === true,
      undefined, { timeout: 180000, polling: 500 });
    await page.locator('#intro.open').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#newGameChoice').click();
    await page.waitForFunction(() => document.body.classList.contains('game-running') &&
      document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
      undefined, { timeout: 30000, polling: 250 });

    const boot = await page.evaluate(() => ({
      build: window.__ELSN_TEST__?.build,
      islands: window.__ELSN_TEST__?.islands || [],
      startup: window.__elSinNombreStartupSmoke?.result || null
    }));
    manifest.build = boot.build;
    manifest.islands = boot.islands.map((island, index) => ({
      index, x: island.x, z: island.z, radius: island.r
    }));
    assert.ok(boot.islands.length, 'El juego no ha expuesto sus islas al sistema de captura.');

    for (const shot of plan) {
      const started = Date.now();
      try {
        const result = await page.evaluate(({ shot }) => {
          const api = window.__ELSN_TEST__;
          const camera = shot.camera || shot;
          let resolvedCamera = { ...camera };
          if (Number.isInteger(shot.islandIndex)) {
            const island = api.islands[shot.islandIndex];
            if (!island) throw new Error('No existe la isla ' + shot.islandIndex);
            resolvedCamera = {
              x: island.x + camera.x, y: camera.y, z: island.z + camera.z,
              targetX: island.x + camera.targetX, targetY: camera.targetY,
              targetZ: island.z + camera.targetZ
            };
          }
          api.setCamera(resolvedCamera);
          api.setWaterState({ time: shot.time ?? 37, tide: shot.tide ?? 'natural' });
          api.render();
          const diagnostics = api.diagnostics?.() || null;
          const audit = api.habitableStructureAudit?.() || null;
          return { png: api.captureCanvas(), diagnostics, audit, camera: resolvedCamera };
        }, { shot });
        const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(result.png || '');
        assert.ok(match, 'No se obtuvo una imagen PNG del lienzo.');
        const buffer = Buffer.from(match[1], 'base64');
        assert.ok(buffer.length > 1000, 'La imagen está vacía o incompleta.');
        assert.equal(buffer.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
        const file = String(shot.id) + '.png';
        fs.writeFileSync(path.join(OUT, file), buffer);
        manifest.captures.push({
          id: shot.id, file, camera: result.camera, time: shot.time ?? 37,
          tide: shot.tide ?? 'natural', bytes: buffer.length,
          durationMs: Date.now() - started,
          diagnostics: result.diagnostics,
          structureAudit: result.audit
        });
        console.log('[scene-capture] ' + manifest.captures.length + '/' + plan.length + ' ' + shot.id);
      } catch (error) {
        manifest.failures.push({ id: shot.id, error: String(error.stack || error) });
        console.error('[scene-capture] failed ' + shot.id + ': ' + error.message);
      }
    }
    assert.equal(manifest.captures.length, plan.length,
      'Se generaron ' + manifest.captures.length + ' de ' + plan.length + ' capturas.');
  } finally {
    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (browser) await browser.close();
  }
  console.log('CUSTOM SCENE CAPTURE OK: ' + manifest.captures.length + ' PNGs.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
