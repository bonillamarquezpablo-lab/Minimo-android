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
  identityPreferencePersisted: null,
  cachedIdentityPreferencePersisted: null,
  serviceWorkerBeforeOfflineReload: null,
  serviceWorkerAfterOfflineReload: null,
  offlineReload: null,
  worldUpdateWaitMs: null,
  worldUpdateWaitDiagnostic: null,
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
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
        '--disable-dev-shm-usage'
      ]
    });
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
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

    // Follow the real first-run/returning-player flow. Returning players already have
    // an identity and the game moves directly from the profile selector into booting;
    // first-run players see the identity dialog and must explicitly continue without a name.
    stepStartedAt = performance.now();
    const audioGate = page.locator('#audioGateStart');
    if (await audioGate.isVisible().catch(() => false)) await audioGate.click({ timeout: 30000 });
    await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#chooseQuality').click();

    const readPreflightState = () => page.evaluate(() => {
      const identity = document.getElementById('identitySetup');
      const mode = document.getElementById('modeSelect');
      const loading = document.getElementById('loading');
      const continueButton = document.getElementById('continueUnnamed');
      const visible = element => !!element &&
        getComputedStyle(element).display !== 'none' &&
        getComputedStyle(element).visibility !== 'hidden';
      return {
        bodyClass: document.body.className,
        identityAriaHidden: identity?.getAttribute('aria-hidden') ?? null,
        identityVisible: visible(identity) && identity?.getAttribute('aria-hidden') !== 'true',
        continueUnnamedVisible: visible(continueButton),
        modeAriaHidden: mode?.getAttribute('aria-hidden') ?? null,
        booting: document.body.classList.contains('booting'),
        bootFailed: document.body.classList.contains('boot-failed'),
        loadingVisible: visible(loading),
        identityStored: localStorage.getItem('el-sin-nombre-identity-main-v1') !== null,
        legacyCampaignStored: localStorage.getItem('el-sin-nombre-campaign-v1') !== null
      };
    });

    try {
      await page.waitForFunction(() => {
        const identity = document.getElementById('identitySetup');
        const loading = document.getElementById('loading');
        const identityVisible = !!identity &&
          identity.getAttribute('aria-hidden') !== 'true' &&
          getComputedStyle(identity).display !== 'none';
        const booting = document.body.classList.contains('booting') ||
          (!!loading && getComputedStyle(loading).display !== 'none');
        return identityVisible || booting || document.body.classList.contains('boot-failed');
      }, undefined, { timeout: 15000, polling: 50 });
    } catch (error) {
      const diagnostics = await readPreflightState();
      await fs.promises.writeFile(path.join(OUT, 'preflight-dom.html'), await page.content());
      await page.screenshot({ path: path.join(OUT, 'preflight-failure.png'), fullPage: true }).catch(() => {});
      throw new Error('El selector de perfil no pasó a identidad ni al arranque. Estado: ' +
        JSON.stringify(diagnostics) + ' · ' + String(error?.message || error));
    }

    const preflightState = await readPreflightState();
    manifest.preflightState = preflightState;
    if (preflightState.bootFailed) {
      throw new Error('El juego marcó boot-failed antes de iniciar el motor: ' +
        JSON.stringify(preflightState));
    }
    if (preflightState.identityVisible && preflightState.continueUnnamedVisible) {
      await page.locator('#continueUnnamed').click({ timeout: 15000 });
      manifest.identityFlow = 'first-run-anonymous';
    } else if (preflightState.booting) {
      manifest.identityFlow = 'returning-player-auto-boot';
    } else {
      await fs.promises.writeFile(path.join(OUT, 'preflight-dom.html'), await page.content());
      throw new Error('El estado del preflight no coincide con primera partida ni retorno: ' +
        JSON.stringify(preflightState));
    }

    await page.waitForFunction(() => document.body.classList.contains('booting') ||
      document.body.classList.contains('boot-failed'), undefined, {
      timeout: 15000,
      polling: 50
    });
    manifest.menuFlowMs = Number((performance.now() - stepStartedAt).toFixed(1));

    stepStartedAt = performance.now();
    // No convertir un fallo de arranque en una espera opaca de 90 s.
    // El boot-failed y el recorder global contienen el recurso/etapa que detuvo el juego.
    await page.waitForFunction(() => !!window.__ELSN_PLAYER_STARTUP_SMOKE__ ||
      document.body.classList.contains('boot-failed'), undefined, {
      timeout: 180000,
      polling: 250
    }).catch(async error => {
      const diagnostics = await page.evaluate(() => ({
        bodyClass: document.body.className,
        progress: document.querySelector('#loadingProgress')?.style.width || null,
        loadText: document.querySelector('#loadText')?.textContent || null,
        loadHelp: document.querySelector('#loadHelp')?.textContent || null,
        recorder: window.__elSinNombreStartupSmoke || null
      }));
      throw new Error('El arranque no registró el helper ni mostró el panel de error: ' +
        JSON.stringify(diagnostics) + ' · ' + String(error?.message || error));
    });
    const bootstrap = await page.evaluate(() => ({
      helperReady: !!window.__ELSN_PLAYER_STARTUP_SMOKE__,
      bootFailed: document.body.classList.contains('boot-failed'),
      loadHelp: document.querySelector('#loadHelp')?.textContent || null,
      recorder: window.__elSinNombreStartupSmoke || null
    }));
    manifest.bootstrap = bootstrap;
    assert.ok(bootstrap.helperReady,
      'El juego mostró un fallo antes de preparar el modelo protagonista: ' +
      JSON.stringify(bootstrap));
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

    const secureOrigin = new URL(BASE_URL).protocol === 'https:';
    manifest.identityPreferencePersisted = await page.evaluate(() => {
      const key = document.documentElement.dataset.guestMode === 'true'
        ? 'el-sin-nombre-identity-guest-v8'
        : 'el-sin-nombre-identity-main-v1';
      return localStorage.getItem(key) !== null;
    });
    if (secureOrigin) {
      assert.equal(manifest.identityPreferencePersisted, true,
        'La selección de identidad no se guardó antes del reinicio.');

      await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, {
        timeout: 60000, polling: 250
      });
      manifest.serviceWorkerBeforeOfflineReload = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const cacheNames = await caches.keys();
        const cacheStats = await Promise.all(cacheNames.map(async name => ({
          name, entries: (await (await caches.open(name)).keys()).length
        })));
        return {
          supported: 'serviceWorker' in navigator,
          controlled: !!navigator.serviceWorker.controller,
          controllerScript: navigator.serviceWorker.controller?.scriptURL || null,
          controllerState: navigator.serviceWorker.controller?.state || null,
          registrationState: registration?.active?.state || null,
          cacheNames, cacheStats
        };
      });
      assert.equal(manifest.serviceWorkerBeforeOfflineReload.supported, true,
        'Service Worker API no disponible en HTTPS.');
      assert.equal(manifest.serviceWorkerBeforeOfflineReload.controlled, true,
        'El juego no está controlado por su Service Worker.');
      assert.equal(manifest.serviceWorkerBeforeOfflineReload.registrationState, 'activated',
        'El Service Worker no está activado antes del reinicio offline.');
      assert.ok(manifest.serviceWorkerBeforeOfflineReload.cacheNames.some(name =>
        name.startsWith('el-sin-nombre-shell-')),
        'No se instaló la caché del shell: ' + JSON.stringify(manifest.serviceWorkerBeforeOfflineReload));
      assert.ok(manifest.serviceWorkerBeforeOfflineReload.cacheNames.some(name =>
        name.startsWith('el-sin-nombre-assets-')),
        'No se creó la caché de recursos del juego: ' + JSON.stringify(manifest.serviceWorkerBeforeOfflineReload));
      const shellCache = manifest.serviceWorkerBeforeOfflineReload.cacheStats.find(entry =>
        entry.name.startsWith('el-sin-nombre-shell-'));
      const assetCache = manifest.serviceWorkerBeforeOfflineReload.cacheStats.find(entry =>
        entry.name.startsWith('el-sin-nombre-assets-'));
      assert.ok(shellCache && shellCache.entries > 0, 'La caché del shell está vacía.');
      assert.ok(assetCache && assetCache.entries > 0, 'La caché de recursos está vacía.');
    }

    await page.evaluate(() => {
      const audit = window.__startupPostEntryAudit = { calls: [], network: [], resources: [], entryAt: null };
      const isAudioStream = value => /\.(?:mp3|ogg|wav|m4a)(?:$|[?#])/i.test(String(value || ''));
      const isGlb = value => /\.glb(?:$|[?#])/i.test(String(value || ''));
      const entryObserver = new MutationObserver(() => {
        if (!audit.entryAt && document.body.classList.contains('game-running')) audit.entryAt = performance.now();
      });
      entryObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      const resourceObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (audit.entryAt !== null && entry.startTime >= audit.entryAt && !isAudioStream(entry.name)) {
            audit.resources.push({ name: entry.name.slice(0, 500), initiatorType: entry.initiatorType, startTime: entry.startTime });
          }
        }
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
      const recordImport = (kind, value) => {
        if (document.body.classList.contains('game-running')) {
          audit.calls.push({ kind, value: String(value).slice(0, 500), at: performance.now() });
        }
      };
      const recordNetwork = (kind, value) => {
        if (document.body.classList.contains('game-running') && !isAudioStream(value)) {
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

    // worldReady means resources are prepared; wait for the real rendered intro before selecting a campaign.
    await page.locator('#intro.open').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#newGameChoice').waitFor({ state: 'visible', timeout: 30000 });
    // Keep the stricter first-render/intro validation already present on main.
    const introReady = await page.evaluate(() => ({
      bodyClass: document.body.className,
      ariaHidden: document.getElementById('intro')?.getAttribute('aria-hidden') ?? null,
      open: document.getElementById('intro')?.classList.contains('open') ?? false,
      newGameVisible: (() => {
        const button = document.getElementById('newGameChoice');
        return !!button && getComputedStyle(button).display !== 'none' &&
          getComputedStyle(button).visibility !== 'hidden';
      })()
    }));
    manifest.campaignSelector = introReady;
    if (!introReady.open || introReady.ariaHidden === 'true' || !introReady.newGameVisible) {
      throw new Error('La barrera de recursos terminó pero el selector de campaña no se mostró: ' +
        JSON.stringify(introReady));
    }
    await page.locator('#newGameChoice').click();
    await page.waitForFunction(() => document.body.classList.contains('game-running') &&
      document.querySelector('#intro')?.getAttribute('aria-hidden') === 'true',
      undefined, { timeout: 30000, polling: 100 });

    // Snapshot only after an actual campaign has started and the world update loop has run.
    // game-running is set synchronously by beginSaga(); wait for at least one real update tick
    // so the capture cannot race the first render-loop callback.
    manifest.worldInspectionCapturedAfterEntry = true;
    const worldUpdateWaitStartedAt = performance.now();
    try {
      await page.waitForFunction(() => {
        if (!document.body.classList.contains('game-running') ||
            typeof window.getGameHealthDebug !== 'function') return false;
        const health = window.getGameHealthDebug();
        return Number(health?.worldUpdateCount) > 0;
      }, undefined, { timeout: 60000, polling: 100 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const health = typeof window.getGameHealthDebug === 'function'
          ? window.getGameHealthDebug() : null;
        const runtime = health?.runtime || {};
        const canvas = document.getElementById('renderCanvas');
        return {
          bodyClass: document.body.className,
          introAriaHidden: document.getElementById('intro')?.getAttribute('aria-hidden') ?? null,
          gameStarted: health?.gameStarted ?? null,
          worldUpdateCount: health?.worldUpdateCount ?? null,
          worldUpdatePhase: health?.worldUpdatePhase ?? null,
          lastWorldUpdateFailure: health?.lastWorldUpdateFailure ?? null,
          fps: health?.fps ?? runtime.fps ?? null,
          worldUpdateMs: runtime.worldUpdateMs ?? null,
          renderCpuMs: runtime.renderCpuMs ?? null,
          canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
          recorder: window.__elSinNombreStartupSmoke || null
        };
      });
      manifest.worldUpdateWaitDiagnostic = diagnostics;
      await page.screenshot({ path: path.join(OUT, 'world-update-stall.png'), fullPage: true }).catch(() => {});
      throw new Error('El mundo no registró un tick de actualización en 60 s después de entrar. Diagnóstico: ' +
        JSON.stringify(diagnostics) + ' · ' + String(error?.message || error));
    }
    manifest.worldUpdateWaitMs = Number((performance.now() - worldUpdateWaitStartedAt).toFixed(1));
    manifest.worldUpdateCountAtCapture = await page.evaluate(() =>
      window.getGameHealthDebug()?.worldUpdateCount ?? null);
    // Verify the inspector is connected to the real Babylon scene, not a mocked snapshot.
    manifest.worldInspection = await page.evaluate(() => {
      if (typeof window.getGameWorldInspectionSnapshot !== 'function') {
        return { available: false, reason: 'getGameWorldInspectionSnapshot is not exposed by the built game.' };
      }
      const snapshot = window.getGameWorldInspectionSnapshot({
        includeMeshes: true, maxMeshes: 10000, maxActors: 180
      });
      const actorCounts = Object.fromEntries(
        ['hostileVillageGuards','campGuards','companions','enemyShipCrew','wildlife','ambientPeople','ambientBirds']
          .map(key => [key, snapshot.actors?.[key]?.count ?? null])
      );
      return {
        available: true,
        kind: snapshot.kind,
        schemaVersion: snapshot.schemaVersion,
        gameStarted: snapshot.runtime?.gameStarted ?? null,
        worldUpdateCount: snapshot.runtime?.worldUpdateCount ?? null,
        fps: snapshot.runtime?.fps ?? null,
        scene: {
          meshCount: snapshot.scene?.meshCount ?? null,
          transformNodeCount: snapshot.scene?.transformNodeCount ?? null,
          textureCount: snapshot.scene?.textureCount ?? null,
          animationGroupCount: snapshot.scene?.animationGroupCount ?? null
        },
        islands: {
          count: snapshot.islands?.count ?? null,
          complete: snapshot.islands?.complete ?? false
        },
        terrain: snapshot.terrain,
        terrainObjects: snapshot.terrainObjects ? {
          checkedCount: snapshot.terrainObjects.checkedCount,
          candidateCount: snapshot.terrainObjects.candidateCount,
          fullyBuriedCount: snapshot.terrainObjects.fullyBuriedCount,
          penetratingCount: snapshot.terrainObjects.penetratingCount,
          unmeasurableCount: snapshot.terrainObjects.unmeasurableCount,
          complete: snapshot.terrainObjects.complete,
          truncated: snapshot.terrainObjects.truncated,
          terrainHeightSource: snapshot.terrainObjects.terrainHeightSource,
          items: snapshot.terrainObjects.items
        } : null,
        collisions: {
          sceneCollisionsEnabled: snapshot.collisions?.sceneCollisionsEnabled ?? null,
          collisionEnabledMeshCount: snapshot.collisions?.collisionEnabledMeshCount ?? null,
          customColliderCount: snapshot.collisions?.customColliderCount ?? null,
          invalidPositionCount: snapshot.collisions?.invalidPositionCount ?? null
        },
        meshInventory: {
          count: snapshot.meshes?.count ?? null,
          returned: snapshot.meshes?.returned ?? null,
          truncated: snapshot.meshes?.truncated ?? null,
          invalidTransformCount: snapshot.meshes?.invalidTransformCount ?? null
        },
        structures: {
          registeredCount: snapshot.structures?.registeredCount ?? null,
          auditAvailable: snapshot.structures?.auditAvailable ?? false,
          auditTotal: snapshot.structures?.audit?.total ?? null
        },
        player: snapshot.actors?.player ?? null,
        actorCounts
      };
    });
    assert.equal(manifest.worldInspection.available, true,
      'La página construida no expone la API de inspección de Babylon.js: ' +
      JSON.stringify(manifest.worldInspection));
    assert.equal(manifest.worldInspection.kind, 'babylon-world-inspection');
    assert.equal(manifest.worldInspection.gameStarted, true,
      'La captura Babylon debe tomarse después de iniciar la campaña real.');
    assert.ok(manifest.worldInspection.worldUpdateCount > 0,
      'La captura Babylon debe observar al menos un tick real del bucle de actualización.');
    assert.equal(manifest.worldInspection.islands.count, 13,
      'La captura del mundo no contiene las 13 islas.');
    assert.equal(manifest.worldInspection.islands.complete, true);
    assert.equal(manifest.worldInspection.terrain.islandsSampled, 13,
      'No se pudieron muestrear las alturas de las 13 islas.');
    assert.ok(manifest.worldInspection.terrainObjects,
      'No se obtuvo la auditoría de objetos frente al terreno.');
    assert.equal(manifest.worldInspection.terrainObjects.complete, true,
      'La auditoría no cubrió todo el inventario de mallas.');
    assert.ok(manifest.worldInspection.terrainObjects.items.every(item =>
      Number.isFinite(item.worldPosition?.x) &&
      Number.isFinite(item.worldPosition?.y) &&
      Number.isFinite(item.worldPosition?.z) &&
      Number.isFinite(item.bounds?.min?.y) &&
      Number.isFinite(item.bounds?.max?.y) &&
      Number.isFinite(item.terrain?.centerGroundY)),
      'Un candidato del terreno no tiene coordenadas y alturas mundiales verificables.');

    assert.ok(manifest.worldInspection.scene.meshCount > 0,
      'La escena de Babylon no contiene mallas en el snapshot.');
    assert.ok(manifest.worldInspection.meshInventory.returned > 0,
      'No se devolvió el inventario de mallas.');
    assert.ok(manifest.worldInspection.player,
      'El jugador no aparece en el snapshot del mundo.');

    const perf20s = await page.evaluate(async () => {
      const start = performance.now();
      let frames = 0, totalFrameMs = 0, maxFrameMs = 0, last = start, lastDiagnostic = start;
      const runtimeSamples = [];
      const captureRuntime = () => {
        if (typeof window.getGameHealthDebug !== "function") return;
        const health = window.getGameHealthDebug();
        const runtime = health?.runtime || {};
        const frame = runtime.frameTimingMs || {};
        runtimeSamples.push({
          capturedAt: new Date().toISOString(),
          fps: runtime.fps ?? health?.fps ?? null,
          targetFps: runtime.performanceAssessment?.targetFps ?? null,
          frameTiming: {
            p50Ms: frame.p50 ?? null, p95Ms: frame.p95 ?? null,
            p99Ms: frame.p99 ?? null, maxMs: frame.max ?? null
          },
          cpu: {
            worldUpdateMs: runtime.worldUpdateMs ?? null,
            renderCpuMs: runtime.renderCpuMs ?? null
          },
          sceneTimings: {
            frameMs: runtime.sceneFrameMs ?? null,
            activeMeshesEvaluationMs: runtime.activeMeshesEvaluationMs ?? null,
            renderTargetsMs: runtime.renderTargetsMs ?? null,
            cameraRenderMs: runtime.cameraRenderMs ?? null,
            shaderCompilationMs: runtime.shaderCompilationMs ?? null
          },
          gpu: {
            frameMs: runtime.engineGpuFrameMs ?? null,
            sceneRenderMs: runtime.sceneRenderMs ?? null
          },
          scene: {
            drawCalls: runtime.drawCalls ?? runtime.sceneDrawCalls ?? null,
            activeMeshes: runtime.activeMeshes ?? null,
            meshCount: runtime.meshCount ?? null,
            totalVertices: runtime.totalVertices ?? null,
            graphicsProfile: runtime.graphicsProfile ?? null,
            profileDiagnosticsEnabled: runtime.profileDiagnosticsEnabled ?? false,
            engineBackend: runtime.engineBackend ?? null,
            gpuRenderer: runtime.gpuRenderer ?? null
          }
        });
      };
      while (performance.now() - start < 20000) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = performance.now(), frameMs = now - last;
        last = now; frames++; totalFrameMs += frameMs; maxFrameMs = Math.max(maxFrameMs, frameMs);
        if (now - lastDiagnostic >= 1000) {
          captureRuntime();
          lastDiagnostic = now;
        }
      }
      captureRuntime();
      const memory = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapLimit: performance.memory.jsHeapSizeLimit
      } : null;
      const median = getter => {
        const values = runtimeSamples.map(getter).filter(value => typeof value === "number" && Number.isFinite(value)).sort((a,b)=>a-b);
        if (!values.length) return null;
        const mid = Math.floor(values.length / 2);
        return Number((values.length % 2 ? values[mid] : (values[mid-1]+values[mid])/2).toFixed(3));
      };
      return {
        durationMs: Number((performance.now() - start).toFixed(1)),
        frames,
        averageFps: Number((frames / ((performance.now() - start) / 1000)).toFixed(1)),
        averageFrameMs: Number((totalFrameMs / Math.max(1, frames)).toFixed(2)),
        maxFrameMs: Number(maxFrameMs.toFixed(2)),
        runtimeSampleCount: runtimeSamples.length,
        runtimeSamples,
        runtimeStageMedians: {
          worldUpdateMs: median(sample => sample.cpu.worldUpdateMs),
          renderCpuMs: median(sample => sample.cpu.renderCpuMs),
          sceneFrameMs: median(sample => sample.sceneTimings.frameMs),
          activeMeshesEvaluationMs: median(sample => sample.sceneTimings.activeMeshesEvaluationMs),
          renderTargetsMs: median(sample => sample.sceneTimings.renderTargetsMs),
          cameraRenderMs: median(sample => sample.sceneTimings.cameraRenderMs),
          shaderCompilationMs: median(sample => sample.sceneTimings.shaderCompilationMs),
          gpuFrameMs: median(sample => sample.gpu.frameMs),
          sceneRenderMs: median(sample => sample.gpu.sceneRenderMs),
          p95Ms: median(sample => sample.frameTiming.p95Ms),
          p99Ms: median(sample => sample.frameTiming.p99Ms)
        },
        jsHeap: memory
      };
    });
    manifest.performanceFirst20s = perf20s;
    manifest.postEntryAudit = await page.evaluate(() => window.__startupPostEntryAudit);
    assert.equal(manifest.postEntryAudit.calls.length, 0,
      'Se invocó un importador GLB después de entrar: ' + JSON.stringify(manifest.postEntryAudit.calls));
    assert.equal(manifest.postEntryAudit.network.length, 0,
      'Se inició una petición de red no musical después de entrar: ' + JSON.stringify(manifest.postEntryAudit.network));
    assert.equal(manifest.postEntryAudit.resources.length, 0,
      'El navegador descargó un recurso no musical después de entrar: ' + JSON.stringify(manifest.postEntryAudit.resources));
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

    // A warm launch has a saved identity: it can enter booting directly and must not
    // wait for the first-run-only "continue without name" button.
    await page.waitForFunction(() => {
      const identity = document.getElementById('identitySetup');
      const loading = document.getElementById('loading');
      const visible = element => !!element &&
        getComputedStyle(element).display !== 'none' &&
        getComputedStyle(element).visibility !== 'hidden';
      const identityVisible = visible(identity) && identity?.getAttribute('aria-hidden') !== 'true';
      const booting = document.body.classList.contains('booting') ||
        (visible(loading) && !document.body.classList.contains('boot-failed'));
      return identityVisible || booting || document.body.classList.contains('boot-failed');
    }, undefined, { timeout: 30000, polling: 50 });
    const cachedPreflightState = await page.evaluate(() => {
      const identity = document.getElementById('identitySetup');
      const loading = document.getElementById('loading');
      const continueButton = document.getElementById('continueUnnamed');
      const visible = element => !!element &&
        getComputedStyle(element).display !== 'none' &&
        getComputedStyle(element).visibility !== 'hidden';
      return {
        bodyClass: document.body.className,
        identityVisible: visible(identity) && identity?.getAttribute('aria-hidden') !== 'true',
        continueUnnamedVisible: visible(continueButton),
        booting: document.body.classList.contains('booting') || visible(loading),
        bootFailed: document.body.classList.contains('boot-failed'),
        identityStored: localStorage.getItem('el-sin-nombre-identity-main-v1') !== null
      };
    });
    manifest.cachedPreflightState = cachedPreflightState;
    manifest.cachedIdentityPreferencePersisted = cachedPreflightState.identityStored;
    if (new URL(BASE_URL).protocol === 'https:') {
      assert.equal(manifest.cachedIdentityPreferencePersisted, true,
        'La identidad elegida no sobrevivió al reinicio con caché.');
    }
    if (cachedPreflightState.bootFailed) {
      throw new Error('El arranque con caché falló antes de preparar el mundo: ' +
        JSON.stringify(cachedPreflightState));
    }
    if (cachedPreflightState.identityVisible && cachedPreflightState.continueUnnamedVisible) {
      await page.locator('#continueUnnamed').click({ timeout: 15000 });
      manifest.cachedIdentityFlow = 'first-run-anonymous';
    } else if (cachedPreflightState.booting) {
      manifest.cachedIdentityFlow = 'returning-player-auto-boot';
    } else {
      throw new Error('El segundo arranque no coincide con primera partida ni jugador guardado: ' +
        JSON.stringify(cachedPreflightState));
    }
    const cachedBarrierStartedAt = performance.now();
    await page.waitForFunction(() => window.__elSinNombreStartupSmoke?.worldReady === true ||
      document.body.classList.contains('boot-failed'),
      undefined, { timeout: 180000, polling: 250 });
    if (await page.evaluate(() => document.body.classList.contains('boot-failed'))) {
      throw new Error('El arranque con caché terminó en boot-failed: ' +
        JSON.stringify(await page.evaluate(() => ({
          loadHelp: document.querySelector('#loadHelp')?.textContent || null,
          recorder: window.__elSinNombreStartupSmoke || null
        }))));
    }
    const cachedPlayerState = await page.evaluate(() => ({
      player: window.__ELSN_PLAYER_STARTUP_SMOKE__?.state() || null,
      recorder: window.__elSinNombreStartupSmoke || null,
      bootFailed: document.body.classList.contains('boot-failed')
    }));
    manifest.cachedPlayerState = cachedPlayerState;
    assert.equal(cachedPlayerState.bootFailed, false,
      'El segundo arranque marcó boot-failed.');
    assert.equal(cachedPlayerState.player?.modelReady, true,
      'El protagonista real no quedó listo en el arranque con caché: ' +
      JSON.stringify(cachedPlayerState.player));
    assert.ok(cachedPlayerState.player?.realPlayerMeshCount > 0,
      'El segundo arranque no contiene mallas reales del protagonista.');
    assert.equal(cachedPlayerState.player?.fallbackVisible, false,
      'El personaje provisional sigue visible en el arranque con caché.');
    assert.equal(cachedPlayerState.recorder?.worldReady, true,
      'La barrera completa no quedó lista en el arranque con caché.');
    assert.equal((cachedPlayerState.recorder?.consoleErrors || []).length, 0,
      'Errores de consola en el segundo arranque: ' +
      JSON.stringify(cachedPlayerState.recorder?.consoleErrors || []));
    assert.equal((cachedPlayerState.recorder?.runtimeErrors || []).length, 0,
      'Errores de ejecución en el segundo arranque: ' +
      JSON.stringify(cachedPlayerState.recorder?.runtimeErrors || []));
    assert.equal((cachedPlayerState.recorder?.unhandledRejections || []).length, 0,
      'Promesas rechazadas en el segundo arranque: ' +
      JSON.stringify(cachedPlayerState.recorder?.unhandledRejections || []));
    assert.equal(manifest.consoleErrors.length, 0,
      'Errores de consola del navegador tras ambos arranques: ' + manifest.consoleErrors.join(' | '));
    assert.equal(manifest.pageErrors.length, 0,
      'Errores JavaScript del navegador tras ambos arranques: ' + manifest.pageErrors.join(' | '));
    manifest.cachedNavigationAndProfileMs = Number((cachedBarrierStartedAt - cachedLaunchStartedAt).toFixed(1));
    manifest.cachedBlockingStartupMs = Number((performance.now() - cachedBarrierStartedAt).toFixed(1));
    manifest.cachedMemoryEstimate = await page.evaluate(() => window.__elSinNombreStartupMemoryEstimate || null);

    if (secureOrigin) {
      const offlineStartedAt = performance.now();
      manifest.offlineReload = { enabled: true, navigation: 'pending', worldReady: false };
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      manifest.offlineReload.navigation = 'loaded-from-service-worker-cache';

      const offlineAudioGate = page.locator('#audioGateStart');
      if (await offlineAudioGate.isVisible().catch(() => false)) {
        await offlineAudioGate.click({ timeout: 30000 });
      }
      await page.locator('#chooseQuality').waitFor({ state: 'visible', timeout: 60000 });
      await page.locator('#chooseQuality').click();
      await page.waitForFunction(() => {
        const identity = document.getElementById('identitySetup');
        const loading = document.getElementById('loading');
        const visible = element => !!element &&
          getComputedStyle(element).display !== 'none' &&
          getComputedStyle(element).visibility !== 'hidden';
        const identityVisible = visible(identity) && identity?.getAttribute('aria-hidden') !== 'true';
        const booting = document.body.classList.contains('booting') ||
          (visible(loading) && !document.body.classList.contains('boot-failed'));
        return identityVisible || booting || document.body.classList.contains('boot-failed');
      }, undefined, { timeout: 30000, polling: 100 });

      const offlinePreflight = await page.evaluate(() => {
        const identity = document.getElementById('identitySetup');
        const loading = document.getElementById('loading');
        const continueButton = document.getElementById('continueUnnamed');
        const visible = element => !!element &&
          getComputedStyle(element).display !== 'none' &&
          getComputedStyle(element).visibility !== 'hidden';
        return {
          bodyClass: document.body.className,
          identityVisible: visible(identity) && identity?.getAttribute('aria-hidden') !== 'true',
          continueUnnamedVisible: visible(continueButton),
          booting: document.body.classList.contains('booting') || visible(loading),
          bootFailed: document.body.classList.contains('boot-failed')
        };
      });
      manifest.offlineReload.preflight = offlinePreflight;
      if (offlinePreflight.bootFailed) {
        throw new Error('El arranque offline falló antes de completar el preflight: ' +
          JSON.stringify(offlinePreflight));
      }
      if (offlinePreflight.identityVisible && offlinePreflight.continueUnnamedVisible) {
        await page.locator('#continueUnnamed').click({ timeout: 15000 });
      } else if (!offlinePreflight.booting) {
        throw new Error('El arranque offline no coincide con identidad nueva ni jugador guardado: ' +
          JSON.stringify(offlinePreflight));
      }

      await page.waitForFunction(() => window.__elSinNombreStartupSmoke?.worldReady === true ||
        document.body.classList.contains('boot-failed'),
        undefined, { timeout: 180000, polling: 250 });
      const offlinePlayerState = await page.evaluate(() => ({
        player: window.__ELSN_PLAYER_STARTUP_SMOKE__?.state() || null,
        recorder: window.__elSinNombreStartupSmoke || null,
        bootFailed: document.body.classList.contains('boot-failed')
      }));
      manifest.offlineReload.playerState = offlinePlayerState;
      assert.equal(offlinePlayerState.bootFailed, false,
        'El reinicio offline terminó en boot-failed: ' + JSON.stringify(offlinePlayerState));
      assert.equal(offlinePlayerState.recorder?.worldReady, true,
        'La barrera de recursos no se completó en el reinicio offline.');
      assert.equal(offlinePlayerState.player?.modelReady, true,
        'El protagonista real no quedó listo en el reinicio offline.');
      assert.ok(offlinePlayerState.player?.realPlayerMeshCount > 0,
        'El reinicio offline no contiene las mallas del protagonista.');
      assert.equal(offlinePlayerState.player?.fallbackVisible, false,
        'El personaje provisional reapareció en el reinicio offline.');
      assert.equal((offlinePlayerState.recorder?.runtimeErrors || []).length, 0,
        'Errores de runtime en el reinicio offline: ' +
        JSON.stringify(offlinePlayerState.recorder?.runtimeErrors || []));
      assert.equal((offlinePlayerState.recorder?.unhandledRejections || []).length, 0,
        'Promesas rechazadas en el reinicio offline: ' +
        JSON.stringify(offlinePlayerState.recorder?.unhandledRejections || []));

      manifest.serviceWorkerAfterOfflineReload = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const cacheNames = await caches.keys();
        const cacheStats = await Promise.all(cacheNames.map(async name => ({
          name, entries: (await (await caches.open(name)).keys()).length
        })));
        return {
          online: navigator.onLine,
          controlled: !!navigator.serviceWorker.controller,
          controllerState: navigator.serviceWorker.controller?.state || null,
          registrationState: registration?.active?.state || null,
          cacheNames, cacheStats
        };
      });
      assert.equal(manifest.serviceWorkerAfterOfflineReload.online, false,
        'La prueba offline recuperó inesperadamente la conexión.');
      assert.equal(manifest.serviceWorkerAfterOfflineReload.controlled, true,
        'El reinicio offline perdió el control del Service Worker.');
      assert.equal(manifest.serviceWorkerAfterOfflineReload.registrationState, 'activated',
        'El Service Worker no siguió activo tras el reinicio offline.');
      const offlineAssetCache = manifest.serviceWorkerAfterOfflineReload.cacheStats.find(entry =>
        entry.name.startsWith('el-sin-nombre-assets-'));
      assert.ok(offlineAssetCache && offlineAssetCache.entries > 0,
        'La caché de recursos desapareció en el reinicio offline.');
      manifest.offlineReload.worldReady = true;
      manifest.offlineReload.durationMs = Number((performance.now() - offlineStartedAt).toFixed(1));
      manifest.offlineReload.bodyClass = await page.locator('body').getAttribute('class');
      manifest.offlineReload.offlineConsoleErrors = manifest.consoleErrors.slice();
      manifest.offlineReload.pageErrors = manifest.pageErrors.slice();
      assert.equal(manifest.pageErrors.length, 0,
        'Errores JavaScript tras el reinicio offline: ' + manifest.pageErrors.join(' | '));
    } else {
      manifest.offlineReload = {
        enabled: false,
        reason: 'El reinicio offline requiere HTTPS; este runner usa HTTP.'
      };
    }

    console.log('[player-startup] first/cached/offline startup + first 20s: ' +
      JSON.stringify({ npcRoster, identityPreferencePersisted: manifest.identityPreferencePersisted,
        memoryEstimate: manifest.memoryEstimate, cachedMemoryEstimate: manifest.cachedMemoryEstimate,
        perf20s, postEntryAudit: manifest.postEntryAudit, postEntryErrors: finalErrors,
        serviceWorkerBeforeOfflineReload: manifest.serviceWorkerBeforeOfflineReload,
        serviceWorkerAfterOfflineReload: manifest.serviceWorkerAfterOfflineReload,
        offlineReload: manifest.offlineReload, worldUpdateWaitMs: manifest.worldUpdateWaitMs,
        cachedNavigationAndProfileMs: manifest.cachedNavigationAndProfileMs,
        cachedBlockingStartupMs: manifest.cachedBlockingStartupMs }));
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
