import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const outputDir = path.resolve('artifacts/coastal-reference');
await fs.mkdir(outputDir, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '4173', '--directory', 'dist'], { stdio: 'ignore' });
const baseUrl = 'http://127.0.0.1:4173';
let serverReady = false;
for (let attempt = 0; attempt < 80; attempt++) {
  try {
    const response = await fetch(baseUrl);
    if (response.ok) { serverReady = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!serverReady) {
  server.kill('SIGTERM');
  throw new Error('El servidor local de la build no ha arrancado.');
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader'
  ]
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block'
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const cameras = ['shore', 'mid', 'lod'];
const instants = [0, 60, 180];
const tides = ['high', 'low', 'natural'];
const captures = [];
const sourceSha = process.env.APP_REF_SHA || 'unknown';
const harnessSha = process.env.HARNESS_SHA || 'unknown';
const expectedVersion = '0.6.271';

function makeUrl(camera, seconds, tide) {
  const params = new URLSearchParams({
    debug: '1',
    test: '1',
    seed: '20261108',
    t: String(seconds),
    tide,
    cam: camera
  });
  return baseUrl + '/?' + params.toString();
}

try {
  const initialUrl = makeUrl('shore', instants[0], tides[0]);
  const response = await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (!response || !response.ok()) throw new Error('La página de referencia no ha cargado: ' + initialUrl);

  // El juego no crea la escena hasta completar el selector de audio, perfil e identidad.
  if (await page.locator('#audioGateStart').isVisible().catch(() => false)) {
    await page.locator('#audioGateStart').click({ timeout: 30000 });
  }
  await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#chooseQuality').click();
  await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#continueUnnamed').click();

  try {
    await page.waitForFunction(
      () => window.__ELSN_WATER_REFERENCE_API__?.ready === true,
      null,
      { timeout: 600000 }
    );
  } catch (error) {
    throw new Error(
      'El mundo no terminó de cargar o no expuso la API de referencia. Errores de página: ' +
      pageErrors.join(' | ') + '. Errores de consola: ' + consoleErrors.slice(-20).join(' | ') +
      '. Motivo: ' + String(error)
    );
  }

  for (const camera of cameras) {
    for (const seconds of instants) {
      for (const tide of tides) {
        const url = makeUrl(camera, seconds, tide);
        const snapshot = await page.evaluate(urlValue => {
          const next = new URL(urlValue);
          history.replaceState(null, '', next.pathname + next.search);
          return window.__ELSN_WATER_REFERENCE_API__.setScenarioFromUrl();
        }, url);

        if (snapshot.buildVersion !== expectedVersion) throw new Error('Versión incorrecta: ' + snapshot.buildVersion);
        if (snapshot.profile !== 'Calidad') throw new Error('La referencia debe ejecutarse en Calidad; perfil: ' + snapshot.profile);
        if (snapshot.waterMesh.subdivisions < 256) throw new Error('La malla no está en resolución Calidad: ' + snapshot.waterMesh.subdivisions);
        if (snapshot.analyticalVsDrawnVertices.actual !== 100) {
          throw new Error('La muestra analítica no contiene 100 vértices: ' + snapshot.analyticalVsDrawnVertices.actual);
        }
        if (snapshot.lodBoundary.boundaryPairs < 1) {
          throw new Error('La cámara no ha producido pares de vértices a ambos lados del límite LOD.');
        }
        if (snapshot.shorelineSolver.samples < 36) {
          throw new Error('El solver de costa no ha devuelto suficientes cruces: ' + snapshot.shorelineSolver.samples);
        }

        await page.evaluate(() => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }));

        const scenarioId = camera + '_t' + seconds + '_' + tide;
        const imagePath = path.join(outputDir, scenarioId + '.png');
        await page.locator('#renderCanvas').screenshot({
          path: imagePath,
          animations: 'disabled',
          timeout: 60000
        });
        const finalSnapshot = await page.evaluate(() => window.__ELSN_WATER_REFERENCE_API__.snapshot());
        if (!String(finalSnapshot.webgl.renderer).toLowerCase().includes('swiftshader')) {
          throw new Error('Chromium no confirma SwiftShader: ' + finalSnapshot.webgl.renderer);
        }
        captures.push({
          id: scenarioId,
          screenshot: scenarioId + '.png',
          url,
          sourceCommit: sourceSha,
          harnessCommit: harnessSha,
          camera,
          simulationSeconds: seconds,
          tide,
          data: finalSnapshot
        });
        console.log('CAPTURED ' + scenarioId + ' · ' + finalSnapshot.webgl.renderer);
      }
    }
  }

  if (captures.length !== 27) throw new Error('Se esperaban 27 capturas; generadas: ' + captures.length);
  if (pageErrors.length) throw new Error('Errores JavaScript: ' + pageErrors.join('\n'));

  const manifest = {
    title: 'EL SIN NOMBRE · referencia visual del agua costera',
    baselineVersion: expectedVersion,
    baselineCommit: sourceSha,
    harnessCommit: harnessSha,
    capturedAt: new Date().toISOString(),
    environment: {
      browser: 'Playwright Chromium headless',
      renderer: 'SwiftShader software WebGL',
      viewport: { width: 1440, height: 900 },
      profile: 'Calidad',
      seed: 20261108,
      simulationClock: 'congelado; establecido mediante ?t= segundos',
      tides: { high: 0.28, low: -0.28, natural: 'marea armónica del juego' },
      instantsSeconds: instants,
      cameras: {
        shore: 'cámara situada a 1 m mar adentro respecto al cruce costero de referencia',
        mid: 'cámara a 35 m horizontales de la orilla',
        lod: 'cámara a 90 m horizontales de la orilla, en el límite del LOD táctil'
      }
    },
    ciPerformancePolicy: 'FPS y tiempos de fotograma no medidos en SwiftShader; medir en Galaxy S26 Ultra mediante ?debug=1.',
    captures
  };
  await fs.writeFile(path.join(outputDir, 'reference.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('REFERENCE COMPLETE: ' + captures.length + ' PNG + reference.json');
} finally {
  await context.close();
  await browser.close();
  server.kill('SIGTERM');
}
