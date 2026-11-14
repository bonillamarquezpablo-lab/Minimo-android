import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PATROL_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/explorer-patrol/report.json');
const RUN_ID = process.env.GITHUB_RUN_ID || null;
const RUN_URL = RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + RUN_ID : null;
const now = () => new Date().toISOString();
const report = {
  schema: 1,
  project: 'EL SIN NOMBRE',
  level: 1,
  mode: 'test-only-read-only-observer-patrol',
  startedAt: now(),
  finishedAt: null,
  build: null,
  renderer: 'Chromium headless + ANGLE SwiftShader',
  query: '?test=1',
  run: { id: RUN_ID, url: RUN_URL, branch: process.env.GITHUB_REF_NAME || null, sha: process.env.GITHUB_SHA || null },
  world: { expectedIslands: 13, visitedIslands: 0, islands: [] },
  startup: null,
  audioNetwork: { requests: [], responses: [], failures: [] },
  agents: [],
  limitations: [
    'La patrulla mueve únicamente la cámara de observación de la API de prueba; no mueve NPCs ni controla la partida normal.',
    'El motor de juego no expone actualmente una orden de locomoción de NPC para recorrer rutas físicas.',
    'Los contadores de pisadas y salpicaduras solo se consideran observados cuando el juego los publica; esta patrulla no inventa pasos.',
    'La cobertura de hierba por isla solo se declara si el motor publica un contador por isla; un contador global no demuestra cobertura individual.',
    'El catálogo de actividades por isla no está expuesto como contrato estructurado; no se inventan actividades ausentes.',
    'Chromium/SwiftShader no representa la GPU Adreno física del dispositivo.'
  ],
  consoleErrors: [],
  pageErrors: [],
  failures: [],
  verdict: 'not-run'
};

function writeReport() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(tmp, OUT);
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function finite(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function findMetric(source, aliases, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 9) return null;
  const normalized = aliases.map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [key, value] of Object.entries(source)) {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes(k)) {
      const n = finite(value);
      if (n !== null) return n;
    }
  }
  for (const value of Object.values(source)) {
    const found = findMetric(value, aliases, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['structures','items','objects','entries','results','rows','candidates']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}
function severityOf(findings, missing) {
  if (findings.some(x => x.severity === 'critical')) return 'critical';
  if (findings.some(x => x.severity === 'warning')) return 'warning';
  return missing.length ? 'unknown' : 'ok';
}
async function readGameBoot(page) {
  return page.evaluate(() => {
    const api = window.__ELSN_TEST__;
    if (!api) throw new Error('La API aislada __ELSN_TEST__ no está disponible en ?test=1.');
    const islands = Array.isArray(api.islands) ? api.islands.map((island, index) => ({
      index, name: island.name || 'Isla ' + (index + 1),
      x: Number(island.x), z: Number(island.z), radius: Number(island.r)
    })) : [];
    return { build: api.build || document.querySelector('meta[name="el-sin-nombre-build"]')?.content || null, islands };
  });
}
async function collectGlobalSensors(page) {
  return page.evaluate(() => {
    const api = window.__ELSN_TEST__;
    const safeCall = (fn, fallback = null) => {
      try { return typeof fn === 'function' ? fn() : fallback; }
      catch (error) { return { sensorError: String(error?.message || error) }; }
    };
    const health = safeCall(window.getGameHealthDebug);
    const runtime = health && typeof health === 'object' ? health.runtime || {} : {};
    const diagnostics = safeCall(api?.diagnostics) || null;
    const water = safeCall(window.__elSinNombreWaterDebugSnapshot) || null;
    const call = name => safeCall(api?.[name]);
    const movementSupported = ['walkRoute','moveNpcAlongPath','moveAgentTo','navigateNpc'].some(name => typeof api?.[name] === 'function');
    return {
      movementSupported,
      health: health ? {
        gameStarted: health.gameStarted ?? null,
        worldUpdateCount: health.worldUpdateCount ?? null,
        runtime: {
          fps: runtime.fps ?? null,
          frameTimingMs: runtime.frameTimingMs ?? null,
          drawCalls: runtime.drawCalls ?? null,
          worldUpdateMs: runtime.worldUpdateMs ?? null,
          renderCpuMs: runtime.renderCpuMs ?? null,
          meshCount: runtime.meshCount ?? null,
          activeMeshes: runtime.activeMeshes ?? null,
          grassInstances: runtime.grassInstances ?? null,
          grassBatches: runtime.grassBatches ?? null,
          grassDebugClumpCount: runtime.grassDebugClumpCount ?? null,
          grassDebugBatchCount: runtime.grassDebugBatchCount ?? null
        }
      } : null,
      diagnostics,
      water,
      structures: {
        habitable: call('habitableStructureAudit'),
        houses: call('settlementGrounding'),
        camps: call('settlementCampGrounding'),
        garrisons: call('garrisonGrounding')
      },
      inventory: call('coastalSceneInventory')
    };
  });
}
async function observeIsland(page, island) {
  return page.evaluate(async ({ island }) => {
    const api = window.__ELSN_TEST__;
    const radius = Number.isFinite(island.radius) ? island.radius : 20;
    const camera = {
      x: island.x + radius + 18, y: 14, z: island.z,
      targetX: island.x, targetY: 0, targetZ: island.z
    };
    api.setCamera(camera);
    if (typeof api.setWaterState === 'function') api.setWaterState({ time: 37, tide: 'natural' });
    if (typeof api.render === 'function') api.render();
    const actual = typeof api.sceneViewSnapshot === 'function' ? api.sceneViewSnapshot() : null;
    const close = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 0.25;
    const actualCamera = actual?.camera || null;
    const actualTarget = actual?.target || null;
    const cameraVerified = !!actualCamera && !!actualTarget &&
      close(actualCamera.x, camera.x) && close(actualCamera.y, camera.y) && close(actualCamera.z, camera.z) &&
      close(actualTarget.x, camera.targetX) && close(actualTarget.y, camera.targetY) && close(actualTarget.z, camera.targetZ);
    const health = typeof window.getGameHealthDebug === 'function' ? window.getGameHealthDebug() : null;
    const runtime = health?.runtime || {};
    const diagnostics = typeof api.diagnostics === 'function' ? api.diagnostics() : null;
    const water = typeof window.__elSinNombreWaterDebugSnapshot === 'function' ? window.__elSinNombreWaterDebugSnapshot() : null;
    return {
      island: { index: island.index, name: island.name, x: island.x, z: island.z, radius },
      observationPoint: camera,
      cameraVerified,
      runtime: {
        fps: runtime.fps ?? null,
        frameTimingMs: runtime.frameTimingMs ?? null,
        drawCalls: runtime.drawCalls ?? null,
        worldUpdateMs: runtime.worldUpdateMs ?? null,
        renderCpuMs: runtime.renderCpuMs ?? null,
        grassInstances: runtime.grassInstances ?? null,
        grassBatches: runtime.grassBatches ?? null,
        grassDebugClumpCount: runtime.grassDebugClumpCount ?? null,
        grassDebugBatchCount: runtime.grassDebugBatchCount ?? null,
        grassByIsland: runtime.grassByIsland ?? runtime.grassInstancesByIsland ?? null
      },
      coast: diagnostics?.coast ?? null,
      water,
      sceneView: actual || null
    };
  }, { island });
}
async function startGame(page) {
  await page.goto(BASE_URL + '?test=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const audioGate = page.locator('#audioGateStart');
  if (await audioGate.isVisible().catch(() => false)) await audioGate.click({ timeout: 30000 });
  await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#chooseQuality').click();
  await page.locator('#continueUnnamed').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#continueUnnamed').click();
  try {
    await page.waitForFunction(() =>
      window.__elSinNombreStartupSmoke?.worldReady === true ||
      document.body.classList.contains('boot-failed'),
    undefined, { timeout: 180000, polling: 250 });
  } catch (error) {
    report.startup = await page.evaluate(() => ({
      worldReady: window.__elSinNombreStartupSmoke?.worldReady === true,
      bootFailed: document.body.classList.contains('boot-failed'),
      bodyClass: document.body.className,
      loadingText: document.querySelector('#loadText')?.textContent || null,
      loadingHelp: document.querySelector('#loadHelp')?.textContent || null
    }));
    throw new Error('El arranque no alcanzó worldReady: ' + JSON.stringify(report.startup) + ' · ' + String(error?.message || error));
  }
  report.startup = await page.evaluate(() => ({
    worldReady: window.__elSinNombreStartupSmoke?.worldReady === true,
    bootFailed: document.body.classList.contains('boot-failed'),
    bodyClass: document.body.className,
    loadingText: document.querySelector('#loadText')?.textContent || null,
    loadingHelp: document.querySelector('#loadHelp')?.textContent || null
  }));
  if (!report.startup.worldReady || report.startup.bootFailed) {
    throw new Error('El juego marcó boot-failed antes de la patrulla: ' + JSON.stringify(report.startup));
  }
  await page.locator('#intro.open').waitFor({ state: 'visible', timeout: 60000 });
  const newGame = page.locator('#newGameChoice');
  await newGame.waitFor({ state: 'visible', timeout: 30000 });
  await newGame.click();
  await page.waitForFunction(() =>
    document.body.classList.contains('game-running') &&
    document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
    undefined, { timeout: 45000, polling: 250 }
  );
  await page.waitForFunction(() => !!window.__ELSN_TEST__?.islands?.length, undefined, { timeout: 30000 });
}
function classifyAgents(global, islandRows) {
  const runtime = global.health?.runtime || {};
  const diagnostic = global.diagnostics || {};
  const water = global.water || {};
  const wetSteps = findMetric([water, diagnostic], ['wetSteps']);
  const emitted = findMetric([water, diagnostic], ['waterParticlesEmitted']);
  const activeSplash = findMetric([water, diagnostic], ['activeSplashParticles','aliveSplashParticles','waterParticlesActive','splashParticlesAlive']);
  const maxShoreStep = findMetric([water, diagnostic], ['maxShoreStepMeters','maximumShoreStepMeters','shorelineStepMeters','maxCoastalStepMeters']);
  const eiraMissing = [];
  const eiraIssues = [];
  if (wetSteps === null) eiraMissing.push('El motor no expone un contador válido de pisadas húmedas.');
  if (activeSplash === null) eiraMissing.push('El motor no expone cuántas partículas de salpicadura siguen vivas.');
  if (maxShoreStep === null) eiraMissing.push('No existe una medición explícita del escalón arena-agua en esta ejecución.');
  if (wetSteps > 0 && activeSplash === 0) eiraIssues.push({ severity: 'warning', title: 'Pisadas húmedas sin salpicaduras activas', detail: 'Se registraron pisadas húmedas, pero el pool de salpicaduras indica cero partículas activas.' });
  if (maxShoreStep !== null && Math.abs(maxShoreStep) > 0.05) eiraIssues.push({ severity: 'critical', title: 'Escalón brusco en la transición de costa', detail: 'La diferencia vertical medida es ' + maxShoreStep.toFixed(3) + ' m; umbral provisional: 0,050 m.' });
  if (wetSteps === 0) eiraMissing.push('No se observaron pisadas húmedas en esta patrulla; no se ha simulado locomoción del personaje.');

  const globalGrass = {
    instances: findMetric(runtime, ['grassInstances','grassDebugClumpCount']),
    batches: findMetric(runtime, ['grassBatches','grassDebugBatchCount'])
  };
  const p95 = findMetric(runtime.frameTimingMs, ['p95','p95Ms','p95FrameTimeMs','frameTimeP95Ms']);
  const drawCalls = finite(runtime.drawCalls);
  const worldCpu = finite(runtime.worldUpdateMs);
  const renderCpu = finite(runtime.renderCpuMs);
  const solMissing = [];
  const solIssues = [];
  if (globalGrass.instances === null) solMissing.push('El motor no publica el número de matas o instancias de hierba.');
  if (globalGrass.batches === null) solMissing.push('El motor no publica el número de lotes de hierba.');
  if (drawCalls === null) solMissing.push('No hay contador de draw calls válido.');
  if (worldCpu === null || renderCpu === null) solMissing.push('Falta tiempo de CPU/JavaScript de una o ambas etapas.');
  const perIslandGrass = islandRows.map(row => {
    const source = row.runtime?.grassByIsland;
    const entry = Array.isArray(source) ? source[row.island.index] : source?.[row.island.index] ?? source?.[String(row.island.index)];
    return { islandIndex: row.island.index, name: row.island.name,
      instances: findMetric(entry, ['instances','grassInstances','clumps']),
      batches: findMetric(entry, ['batches','grassBatches']) };
  });
  if (perIslandGrass.some(row => row.instances === null)) solMissing.push('La cobertura de hierba por isla no está expuesta; el contador global no demuestra las 13 zonas.');
  if (p95 !== null && p95 > (1000 / 60)) solIssues.push({ severity: 'warning', title: 'Frame time p95 por encima de 60 FPS', detail: 'La medición de laboratorio es ' + p95.toFixed(2) + ' ms. Chromium/SwiftShader no equivale a la GPU física del móvil.' });

  const structureRows = [
    ...rowsOf(global.structures.habitable),
    ...rowsOf(global.structures.houses),
    ...rowsOf(global.structures.camps),
    ...rowsOf(global.structures.garrisons)
  ];
  const uLfMeasured = [];
  const ulfIssues = [];
  const ulfMissing = [];
  for (const row of structureRows) {
    const gap = findMetric(row, ['maximumBaseGapMeters','baseAnchorGapMeters','maximumStructuralBaseGapMeters','bottomAboveTerrainMeters','anchorErrorMeters','gapMeters']);
    if (gap === null) continue;
    const islandIndex = finite(row.islandIndex ?? row.nearestIslandIndex);
    uLfMeasured.push({ islandIndex, name: row.name || row.kind || 'Estructura', gapMeters: gap });
    if (Math.abs(gap) > 0.02) ulfIssues.push({ severity: 'critical', title: 'Estructura fuera de tolerancia de 2 cm', detail: (row.name || row.kind || 'Estructura') + ' presenta ' + (gap * 100).toFixed(1) + ' cm de diferencia en su apoyo.', islandIndex });
  }
  if (!uLfMeasured.length) ulfMissing.push('No se encontraron medidas de cimentación con resolución suficiente para aplicar la tolerancia de 2 cm.');
  const movementSupported = global.movementSupported === true;
  if (!movementSupported) ulfMissing.push('La API de prueba no expone locomoción autónoma para recorrer rutas y detectar bloqueos físicos.');

  const activities = findMetric(global.inventory, ['activeActivities','activityCount','activitiesActive']);
  const tyrMissing = [];
  if (activities === null) tyrMissing.push('No existe un catálogo/contador de actividades jugables por isla en la API de prueba.');
  const inventoryCount = findMetric(global.inventory, ['returnedCount','candidateCount']);
  if (inventoryCount === null) tyrMissing.push('El inventario no permite inferir actividades jugables sin un contrato específico.');

  return [
    {
      id: 'eira', name: 'Eira', specialization: 'Costa y pisadas', severity: severityOf(eiraIssues, eiraMissing),
      status: eiraIssues.length ? 'issue-found' : eiraMissing.length ? 'incomplete' : 'measured',
      summary: 'Eira ha comprobado los contadores reales de pisadas, salpicaduras y perfil de la orilla. No simula pasos que el personaje no haya dado.',
      readings: { wetSteps, waterParticlesEmitted: emitted, activeSplashParticles: activeSplash, maxShoreStepMeters: maxShoreStep },
      issues: eiraIssues, missing: eiraMissing
    },
    {
      id: 'sol', name: 'Sól', specialization: 'Vegetación y fluidez', severity: severityOf(solIssues, solMissing),
      status: solIssues.length ? 'issue-found' : solMissing.length ? 'incomplete' : 'measured',
      summary: 'Sól registra hierba, draw calls y tiempos de actualización/render. No declara cobertura por isla si el motor solo entrega totales globales.',
      readings: { grassInstances: globalGrass.instances, grassBatches: globalGrass.batches, drawCalls, worldUpdateMs: worldCpu, renderCpuMs: renderCpu, frameTimeP95Ms: p95, perIslandGrass },
      issues: solIssues, missing: solMissing
    },
    {
      id: 'ulf', name: 'Ulf', specialization: 'Física y cimentación', severity: severityOf(ulfIssues, ulfMissing),
      status: ulfIssues.length ? 'issue-found' : ulfMissing.length ? 'incomplete' : 'measured',
      summary: 'Ulf compara las medidas de apoyo disponibles con la tolerancia solicitada de 2 cm. La patrulla no finge recorrer rutas físicas si falta una API de locomoción.',
      readings: { structuresMeasured: uLfMeasured.length, structures: uLfMeasured, movementSupported },
      issues: ulfIssues, missing: ulfMissing
    },
    {
      id: 'tyr', name: 'Týr', specialization: 'Actividades por isla', severity: severityOf([], tyrMissing),
      status: tyrMissing.length ? 'incomplete' : 'measured',
      summary: 'Týr consulta el inventario disponible. No etiqueta actividades como ausentes sin un catálogo oficial de actividades esperadas.',
      readings: { activityCount: activities, inventoryCount, islandCount: islandRows.length },
      issues: [], missing: tyrMissing
    }
  ];
}
async function main() {
  let browser;
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const isAudioResource = url => String(url || '').includes('/assets/audio/') || /\.(?:ogg|wav|mp3|m4a)(?:[?#]|$)/i.test(String(url || ''));
    page.on('request', request => {
      if (!isAudioResource(request.url())) return;
      report.audioNetwork.requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() });
    });
    page.on('response', response => {
      if (!isAudioResource(response.url())) return;
      report.audioNetwork.responses.push({ url: response.url(), status: response.status(), statusText: response.statusText() });
    });
    page.on('requestfailed', request => {
      if (!isAudioResource(request.url())) return;
      report.audioNetwork.failures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown request failure' });
    });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', error => report.pageErrors.push(String(error?.stack || error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await startGame(page);
    const boot = await readGameBoot(page);
    report.build = boot.build;
    const islands = boot.islands.filter(island => Number.isFinite(island.x) && Number.isFinite(island.z));
    if (islands.length !== 13) report.failures.push({ phase: 'island-roster', expected: 13, actual: islands.length });
    const global = await collectGlobalSensors(page);
    for (const island of islands) {
      try {
        const observation = await observeIsland(page, island);
        if (!observation.cameraVerified) throw new Error('El motor no confirmó la cámara en las coordenadas solicitadas.');
        report.world.islands.push(observation);
        report.world.visitedIslands++;
      } catch (error) {
        report.failures.push({ phase: 'island-observation', islandIndex: island.index, error: String(error?.message || error) });
      }
      await delay(180);
    }
    report.agents = classifyAgents(global, report.world.islands);
    const route = report.world.islands.map(row => ({ islandIndex: row.island.index, island: row.island.name, cameraVerified: row.cameraVerified, observationPoint: row.observationPoint }));
    report.agents.forEach(agent => { agent.patrol = { type: 'camera-observation', visits: route.length, route }; });
    const confirmedIssues = report.agents.reduce((count, agent) => count + agent.issues.length, 0);
    const incompleteAgents = report.agents.filter(agent => agent.status === 'incomplete').length;
    report.verdict = report.failures.length || confirmedIssues ? 'issues-found' : incompleteAgents ? 'partial' : 'passed';
    if (report.pageErrors.length || report.consoleErrors.length) {
      report.verdict = report.verdict === 'passed' ? 'partial' : report.verdict;
    }
  } catch (error) {
    report.failures.push({ phase: 'runner', error: String(error?.stack || error) });
    report.verdict = 'failed';
  } finally {
    report.finishedAt = now();
    writeReport();
    if (browser) await browser.close().catch(() => {});
    console.log('[EXPLORER_PATROL_RESULT] ' + JSON.stringify({
      verdict: report.verdict, visitedIslands: report.world.visitedIslands,
      issues: report.agents.reduce((n, agent) => n + agent.issues.length, 0),
      incompleteAgents: report.agents.filter(agent => agent.status === 'incomplete').length,
      report: OUT
    }));
  }
  if (report.verdict === 'failed' || report.failures.length) process.exitCode = 1;
}
main();
