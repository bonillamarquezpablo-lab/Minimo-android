import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import startupReadiness from './startup-readiness-core.cjs';

const { isCompletedStartupSnapshot } = startupReadiness;

const BASE_URL = process.env.PLAYER_TEST_URL || 'http://127.0.0.1:4174/';
const MOBILE_PROFILE = process.env.PLAYER_TEST_MOBILE === '1';
const OUT = path.resolve(process.env.PLAYER_TEST_ARTIFACT_DIR || 'artifacts/player-startup');
const startedAt = performance.now();
// On mobile the real game can occupy the main thread for several seconds while bootEngine builds the first scene.
// The input handler may already have fired; give Chromium time to resume and evaluate the queued assertion.
const IDENTITY_START_WAIT_MS = 45000;
// Full world boot takes ~134–166 s on the CI SwiftShader runner; keep a bounded 4-minute restart window.
const STARTUP_RESTART_TIMEOUT_MS = 240000;
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
  cachedStartupWaitDiagnostic: null,
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

async function readStartupSnapshot(page) {
  return page.evaluate(() => {
    const safe=(fn,fallback=null)=>{try{return fn();}catch(_){return fallback;}};
    const babylon=window.BABYLON||null;
    const scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||babylon?.EngineStore?.LastCreatedScene||null;
    const roots=scene?(scene.transformNodes||[]).filter(node=>
      /^(?:WildlifeActor_(?:deer|stag|wolf)_\d+|RealSeagullActor_\d+)$/.test(String(node?.name||''))&&!node.isDisposed?.()
    ):[];
    const world=typeof window.getGameWorldInspectionSnapshot==='function'
      ?safe(()=>window.getGameWorldInspectionSnapshot({includeMeshes:false,maxActors:100}),null):null;
    const progress={
      percent:document.getElementById('elsnStartupProgressPercent')?.textContent||
        document.getElementById('loadProgressLabel')?.textContent||null,
      stage:document.getElementById('elsnStartupProgressStage')?.textContent||null,
      action:document.getElementById('elsnStartupProgressAction')?.textContent||
        document.getElementById('loadText')?.textContent||null,
      elapsed:document.getElementById('elsnStartupProgressElapsed')?.textContent||null,
      trackWidth:document.getElementById('loadProgressBar')?.style.width||
        document.getElementById('loadingProgress')?.style.width||null,
      help:document.getElementById('loadHelp')?.textContent||null
    };
    const summarizeActors=inventory=>({
      count:Number(inventory?.count)||0,
      returned:(inventory?.returned||[]).map(actor=>({
        name:actor?.name||null,kind:actor?.kind||null,meshCount:actor?.meshCount??null,
        visibleMeshCount:actor?.visibleMeshCount??null,
        boneCount:actor?.totalBones??actor?.skeletons?.reduce?.((sum,item)=>sum+(Number(item?.boneCount)||0),0)??null,
        animationGroups:actor?.animationGroups?.map(group=>({name:group.name,playing:group.playing,targetedAnimations:group.targetedAnimations}))||[],
        textures:actor?.textureReadiness||null,flightRig:actor?.flightRig||null
      }))
    });
    return {
      bodyClass:document.body.className,
      bootFailed:document.body.classList.contains('boot-failed'),
      booting:document.body.classList.contains('booting'),
      introOpen:document.body.classList.contains('intro-open'),
      introVisible:!!document.getElementById('intro')&&document.getElementById('intro').classList.contains('open')&&document.getElementById('intro').getAttribute('aria-hidden')!=='true',
      gameRunning:document.body.classList.contains('game-running'),
      loadingVisible:!!document.getElementById('loading')&&getComputedStyle(document.getElementById('loading')).display!=='none',
      loadingText:document.getElementById('loadText')?.textContent||document.querySelector('#loading')?.textContent||null,
      loadingHelp:progress.help,progress,
      recorder:window.__elSinNombreStartupSmoke||null,
      player:window.__ELSN_PLAYER_STARTUP_SMOKE__?.state?.()||null,
      resourceGate:window.__ELSN_STARTUP_RESOURCE_GATE__||null,
      scene:scene?{
        available:true,meshCount:scene.meshes?.length||0,transformNodeCount:scene.transformNodes?.length||0,
        materialCount:scene.materials?.length||0,textureCount:scene.textures?.length||0,
        pendingTextures:(scene.textures||[]).filter(texture=>safe(()=>texture.isReady?.(),false)===false).length,
        animationGroupCount:scene.animationGroups?.length||0,
        playingAnimationGroups:(scene.animationGroups||[]).filter(group=>group?.isPlaying).length,
        waitingItems:safe(()=>scene.getWaitingItemsCount?.(),null),
        fps:safe(()=>scene.getEngine?.().getFps?.(),null)
      }:{available:false},
      fauna:{
        readiness:safe(()=>window.__ELSN_WILDLIFE_DIAGNOSTICS__?.getSnapshot?.(),null),
        actorRoots:roots.map(root=>({
          name:String(root.name||''),enabled:safe(()=>root.isEnabled?.(),null),
          position:root.position?{x:root.position.x,y:root.position.y,z:root.position.z}:null,
          meshCount:safe(()=>root.getChildMeshes?.(false)?.length,0)
        })),
        landInventory:summarizeActors(world?.actors?.wildlife),
        birdInventory:summarizeActors(world?.actors?.ambientBirds)
      },
      sceneWarmup:window.__elSinNombreStartupSceneWarmup||null,
      backgroundModels:window.__elSinNombreBackgroundModelTasks||null,
      serviceWorker:{
        controlled:!!navigator.serviceWorker?.controller,
        state:navigator.serviceWorker?.controller?.state||null
      }
    };
  });
}

async function waitForWorldReadyWithRecovery(page, phase) {
  const startedAt = performance.now();
  try {
    await page.waitForFunction(() =>
      window.__elSinNombreStartupSmoke?.worldReady === true ||
      document.body.classList.contains('boot-failed'),
    undefined, { timeout: STARTUP_RESTART_TIMEOUT_MS, polling: 250 });
    return { recoveredAfterWaitTimeout: false, waitTimeoutMs: STARTUP_RESTART_TIMEOUT_MS,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)), snapshot: null };
  } catch (error) {
    const snapshot = await readStartupSnapshot(page);
    if (isCompletedStartupSnapshot(snapshot)) {
      return { recoveredAfterWaitTimeout: true, waitTimeoutMs: STARTUP_RESTART_TIMEOUT_MS,
        elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
        waitError: String(error?.message || error), snapshot };
    }
    throw new Error(phase + ' no alcanzó un estado de arranque completo dentro de ' +
      STARTUP_RESTART_TIMEOUT_MS + ' ms. Estado: ' + JSON.stringify(snapshot) +
      ' · ' + String(error?.message || error));
  }
}

async function waitForStartupPresentation(page, phase) {
  const startedAt=performance.now();
  await page.waitForFunction(()=>{
    const intro=document.getElementById('intro');
    const loading=document.getElementById('loading');
    return document.body.classList.contains('intro-open') &&
      !document.body.classList.contains('booting') &&
      !document.body.classList.contains('boot-failed') &&
      !!intro && intro.classList.contains('open') &&
      intro.getAttribute('aria-hidden')==='false' &&
      (!loading || getComputedStyle(loading).display==='none');
  },undefined,{timeout:30000,polling:100});
  const state=await page.evaluate(()=>({
    bodyClass:document.body.className,
    introOpen:document.body.classList.contains('intro-open'),
    introVisible:!!document.getElementById('intro')&&document.getElementById('intro').classList.contains('open')&&document.getElementById('intro').getAttribute('aria-hidden')==='false',
    loadingVisible:!!document.getElementById('loading')&&getComputedStyle(document.getElementById('loading')).display!=='none',
    booting:document.body.classList.contains('booting'),
    bootFailed:document.body.classList.contains('boot-failed')
  }));
  assert.equal(state.booting,false,phase+' dejó el body en booting después de la barrera de recursos: '+JSON.stringify(state));
  assert.equal(state.bootFailed,false,phase+' terminó en boot-failed: '+JSON.stringify(state));
  assert.equal(state.introOpen,true,phase+' no mostró el selector real de campaña: '+JSON.stringify(state));
  assert.equal(state.introVisible,true,phase+' mantiene oculto el selector de campaña: '+JSON.stringify(state));
  assert.equal(state.loadingVisible,false,phase+' conserva la pantalla de carga después de iniciar: '+JSON.stringify(state));
  return {elapsedMs:Number((performance.now()-startedAt).toFixed(1)),...state};
}

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
      viewport: MOBILE_PROFILE ? { width: 393, height: 873 } : { width: 960, height: 540 },
      deviceScaleFactor: MOBILE_PROFILE ? 2.75 : 1,
      ...(MOBILE_PROFILE ? {
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 12; 2201123G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
      } : {}),
      ignoreHTTPSErrors: true
    });
    manifest.deviceProfile = MOBILE_PROFILE
      ? { name: 'Xiaomi 12X emulation', viewport: '393x873 CSS px', deviceScaleFactor: 2.75, userAgent: 'Android 12 / 2201123G' }
      : { name: 'Desktop Chromium', viewport: '960x540 CSS px', deviceScaleFactor: 1 };
    let page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    const requests = new Map();
    const attachPageDiagnostics = target => {
      target.on('request', request => {
        if (/\.glb(?:$|[?#])/i.test(request.url())) requests.set(request, performance.now());
      });
      target.on('response', response => {
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
      target.on('requestfailed', request => {
        if (/\.glb(?:$|[?#])/i.test(request.url())) {
          manifest.glbFailures.push({
            url: request.url(),
            failure: request.failure()?.errorText || 'unknown request failure'
          });
        }
      });
      target.on('pageerror', error => manifest.pageErrors.push(String(error && error.stack || error)));
      target.on('console', message => {
        if (message.type() === 'error') manifest.consoleErrors.push(message.text());
      });
    };
    attachPageDiagnostics(page);

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
      try {
        await page.waitForFunction(() => Number(window.__ELSN_IDENTITY_START_COUNT || 0) > 0 ||
          document.body.classList.contains('booting') || document.body.classList.contains('boot-failed'),
          undefined, { timeout: IDENTITY_START_WAIT_MS, polling: 25 });
      } catch (error) {
        const clickDiagnostics = await page.evaluate(() => {
          const button = document.getElementById('continueUnnamed');
          const style = button ? getComputedStyle(button) : null;
          return {
            bodyClass: document.body.className,
            identityStartCount: window.__ELSN_IDENTITY_START_COUNT || 0,
            identityStartAt: window.__ELSN_IDENTITY_START_AT || null,
            buttonExists: !!button,
            buttonDisabled: button ? !!button.disabled : null,
            buttonHtml: button ? button.outerHTML : null,
            pointerEvents: style ? style.pointerEvents : null,
            visibility: style ? style.visibility : null,
            display: style ? style.display : null,
            activeElement: document.activeElement ? document.activeElement.id : null,
            duplicateContinueIds: document.querySelectorAll('#continueUnnamed').length
          };
        });
        manifest.identityClickDiagnostics = clickDiagnostics;
        await fs.promises.writeFile(path.join(OUT, 'preflight-dom.html'), await page.content());
        await page.screenshot({ path: path.join(OUT, 'identity-click-failure.png'), fullPage: true }).catch(() => {});
        throw new Error('El botón de inicio no ejecutó beginLoadingWithIdentity. Diagnóstico: ' +
          JSON.stringify(clickDiagnostics) + ' · ' + String(error?.message || error));
      }
      manifest.identityStartCount = await page.evaluate(() => window.__ELSN_IDENTITY_START_COUNT || 0);
    } else if (preflightState.booting) {
      manifest.identityFlow = 'returning-player-auto-boot';
    } else {
      await fs.promises.writeFile(path.join(OUT, 'preflight-dom.html'), await page.content());
      throw new Error('El estado del preflight no coincide con primera partida ni retorno: ' +
        JSON.stringify(preflightState));
    }

    // Do not wait for a CSS class here: the game intentionally performs blocking scene setup
    // after bootEngine() and may occupy the main thread while creating the first world frame.
    // The identity-start counter proves the input handler ran; the next wait observes the actual
    // startup recorder or an explicit boot-failed state, including browser-side long stalls.
    manifest.identityStartCount = await page.evaluate(() => window.__ELSN_IDENTITY_START_COUNT || 0);
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
    try {
      manifest.startupWait = await waitForWorldReadyWithRecovery(page,'El arranque');
      if(manifest.startupWait.recoveredAfterWaitTimeout){
        manifest.startupRecoveredFromDelayedEvaluation = true;
      }
    } catch (error) {
      manifest.blockingStartupMs = Number((performance.now() - blockingBarrierStartedAt).toFixed(1));
      manifest.startupTimeoutDiagnostics = await readStartupSnapshot(page);
      manifest.startupTimeoutDiagnostics.failure = String(error?.message||error);
      await fs.promises.writeFile(path.join(OUT,'startup-timeout-diagnostics.json'),
        JSON.stringify(manifest.startupTimeoutDiagnostics,null,2));
      await page.screenshot({path:path.join(OUT,'startup-timeout-screen.png'),fullPage:true}).catch(()=>{});
      throw new Error('El arranque no alcanzó worldReady. Diagnóstico de etapa, escena y fauna: '+
        JSON.stringify(manifest.startupTimeoutDiagnostics)+' · '+String(error?.message||error));
    }
    manifest.startupPresentation=await waitForStartupPresentation(page,'Primer arranque');
    manifest.blockingStartupMs = Number((performance.now() - blockingBarrierStartedAt).toFixed(1));
    manifest.startupBarrierState = await page.evaluate(() => ({
      bootFailed: document.body.classList.contains('boot-failed'),
      bodyClass: document.body.className,
      loadingText: document.querySelector('#loadText')?.textContent || null,
      loadingHelp: document.querySelector('#loadHelp')?.textContent || null,
      resourceGate: window.__ELSN_STARTUP_RESOURCE_GATE__ || null,
      startupRecorder: window.__elSinNombreStartupSmoke || null
    }));
    assert.equal(manifest.startupBarrierState.bootFailed, false,
      'La pantalla de carga bloqueó la entrada por un recurso obligatorio: ' + JSON.stringify(manifest.startupBarrierState));
    assert.equal(manifest.startupBarrierState.startupRecorder?.worldReady, true,
      'El arranque no liberó el mundo después de preparar sus recursos: ' + JSON.stringify(manifest.startupBarrierState));
    manifest.startupResourceGate = await page.evaluate(() => window.__ELSN_STARTUP_RESOURCE_GATE__ || null);
    assert.ok(manifest.startupResourceGate && manifest.startupResourceGate.ready === true,
      'La barrera final no confirmó todos los recursos obligatorios: ' + JSON.stringify(manifest.startupResourceGate));
    const startupResources = manifest.startupResourceGate.resources || {};
    assert.equal(startupResources.engineReady, true, 'El motor Babylon no figura como listo.');
    assert.equal(startupResources.gltfImporterReady, true, 'El importador GLB no figura como listo.');
    assert.equal(startupResources.protagonistReady, true, 'El protagonista GLB no figura como listo.');
    assert.equal(startupResources.npcRoster?.ready, true, 'El roster NPC obligatorio no figura como listo.');
    assert.equal(startupResources.soundEffects?.pending, 0, 'Quedan efectos de sonido pendientes.');
    assert.equal(startupResources.soundEffects?.failed, 0, 'Hay efectos de sonido fallidos.');
    assert.equal(startupResources.music?.menuReady, true, 'La música del menú no está en estado reproducible.');
    assert.equal(startupResources.music?.gameplayReady, true, 'La música de partida no está en estado reproducible.');
    assert.equal(startupResources.music?.decodedToAudioBuffer, false, 'La música no debe decodificarse a AudioBuffer.');
    assert.equal(startupResources.scene?.status, 'ready', 'La vista inicial y sus shaders no están listos.');
    assert.equal(startupResources.world?.islands, 13, 'El mundo no expone las 13 islas.');
    assert.equal(startupResources.world?.profile, 'quality', 'El smoke debe verificar el perfil Calidad sin degradaciones.');
    assert.equal(startupResources.fauna?.requested, 3, 'No se prepararon los tres animales de la isla inicial.');
    assert.equal(startupResources.fauna?.loaded, 3, 'No se montaron los tres animales de la isla inicial.');
    assert.equal(startupResources.fauna?.loadedGulls, 5, 'No se montaron las cinco gaviotas 3D.');
    assert.ok(startupResources.world?.grassClumps > 0 && startupResources.world?.grassBatches > 0,
      'La hierba 3D de la zona inicial no se preparó antes de entrar.');
    manifest.wildlifeCache = await page.evaluate(async () => {
      const name = 'el-sin-nombre-models-wildlife-6d6de54a-v1';
      const cache = await caches.open(name);
      const paths = (await cache.keys()).map(request => new URL(request.url).pathname);
      return { name, paths: paths.filter(value => /\/(Deer|Stag|Wolf)\.glb$/i.test(value)) };
    });
    for (const species of ['Deer.glb', 'Stag.glb', 'Wolf.glb']) {
      assert.ok(manifest.wildlifeCache.paths.some(value => value.endsWith('/' + species)),
        'Falta la caché persistente del modelo ' + species + ': ' + JSON.stringify(manifest.wildlifeCache));
    }
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
    await page.waitForFunction(() => {
      const state = window.__ELSN_NPC_DIALOGUES__?.getSnapshot?.();
      return !!state && state.active === true;
    }, undefined, { timeout: 10000, polling: 100 }).catch(async error => {
      const diagnostics = await page.evaluate(() => {
        let bridge = null, bridgeError = '';
        try { bridge = window.__ELSN_GAME_DIALOGUE_BRIDGE__?.getSnapshot?.() ?? null; }
        catch (failure) { bridgeError = String(failure?.stack || failure); }
        return {
          bodyClass: document.body.className,
          introAriaHidden: document.getElementById('intro')?.getAttribute('aria-hidden') ?? null,
          bridgeError,
          bridgeActive: bridge?.active ?? null,
          peopleInWorld: bridge?.people?.length ?? null,
          playerPosition: bridge?.playerPosition ?? null,
          gameHealth: (() => {
            try {
              const health = window.getGameHealthDebug?.();
              return { gameStarted: health?.gameStarted ?? null, worldUpdateCount: health?.worldUpdateCount ?? null };
            } catch (failure) { return { error: String(failure) }; }
          })(),
          runtime: window.__ELSN_NPC_DIALOGUES__?.getSnapshot?.() ?? null
        };
      });
      manifest.npcDialogueWaitDiagnostic = diagnostics;
      await fs.promises.writeFile(path.join(OUT, 'npc-dialogue-wait-diagnostic.json'),
        JSON.stringify(diagnostics, null, 2));
      await page.screenshot({ path: path.join(OUT, 'npc-dialogue-wait-failure.png'), fullPage: true }).catch(() => {});
      throw new Error('El runtime de diálogos no detectó la partida activa: ' +
        JSON.stringify(diagnostics) + ' · ' + String(error?.message || error));
    });
    // Move one real NPC into range only in this isolated browser test, then restore it.
    // Validate the billboard's live mesh and DynamicTexture directly. A compositor screenshot
    // is deliberately non-blocking: SwiftShader can stall Chromium's screenshot compositor
    // even while Babylon reports a live, rendered dialogue mesh.
    const npcDialogueVisualProbe = await page.evaluate(() => {
      const bridge = window.__ELSN_GAME_DIALOGUE_BRIDGE__;
      const snapshot = bridge?.getSnapshot?.();
      const npc = snapshot?.people?.find(person => person?.root &&
        typeof person.root.getAbsolutePosition === 'function' &&
        typeof person.root.setAbsolutePosition === 'function');
      if (!npc) return { ready: false, reason: 'no-movable-npc-root' };
      const root = npc.root;
      const original = root.getAbsolutePosition().clone();
      const player = snapshot.playerPosition;
      const BABYLON = window.BABYLON;
      const camera = snapshot.camera;
      let forward = new BABYLON.Vector3(0, 0, 1);
      try {
        if (camera && typeof camera.getDirection === 'function')
          forward = camera.getDirection(BABYLON.Axis.Z).normalize();
      } catch (_) {}
      const probePosition = new BABYLON.Vector3(
        Number(player.x) + forward.x * 3.6,
        Number(player.y) || original.y,
        Number(player.z) + forward.z * 3.6
      );
      window.__ELSN_DIALOGUE_SMOKE_RESTORE__ = () => {
        try { root.setAbsolutePosition(original); root.computeWorldMatrix(true); } catch (_) {}
        delete window.__ELSN_DIALOGUE_SMOKE_RESTORE__;
      };
      root.setAbsolutePosition(probePosition);
      root.computeWorldMatrix(true);
      return {
        ready: true,
        npc: String(npc.name || root.name || 'NPC'),
        original: { x: original.x, y: original.y, z: original.z },
        probe: { x: probePosition.x, y: probePosition.y, z: probePosition.z },
        player: { x: player.x, y: player.y, z: player.z }
      };
    });
    manifest.npcDialogueVisualProbe = npcDialogueVisualProbe;
    assert.ok(npcDialogueVisualProbe.ready,
      'No se pudo preparar un NPC real para probar la burbuja: ' + JSON.stringify(npcDialogueVisualProbe));
    const smokeBubbleTriggered=await page.evaluate(id=>
      window.__ELSN_NPC_DIALOGUES__?.triggerSmokeBubble?.(id)===true,
      npcDialogueVisualProbe.npc
    );
    assert.ok(smokeBubbleTriggered,
      'El modo de prueba no pudo solicitar un diálogo inmediato para el NPC seleccionado: ' +
      JSON.stringify({npc:npcDialogueVisualProbe.npc,dialogue:await page.evaluate(()=>window.__ELSN_NPC_DIALOGUES__?.getSnapshot?.()||null)}));
    try {
      let dialogueVisualPollTimedOut=false;
      try {
        await page.waitForFunction(() => {
        const api = window.__ELSN_NPC_DIALOGUES__;
        const state = api?.getSnapshot?.();
        const proof = api?.captureVisualProof?.();
        return Number(state?.bubblesStarted) > 0 &&
          Number(state?.renderedBubbleCount) > 0 &&
          Array.isArray(state?.activeBubbleTexts) &&
          state.activeBubbleTexts.some(item => typeof item?.text === 'string' && item.text.trim().length > 0) &&
          proof?.ready === true &&
          proof?.meshEnabled === true &&
          proof?.meshVisible === true &&
          proof?.meshReady === true &&
          proof?.screenInViewport === true &&
          proof?.messagePainted === true &&
          proof?.texture?.width === 768 &&
          proof?.texture?.height === 384 &&
          proof?.texture?.vScale === 1 &&
          proof?.texture?.vOffset === 0 &&
          proof?.uploadInvertY === true;
        }, undefined, { timeout: 15000, polling: 100 });
      } catch(pollError) {
        // SwiftShader can starve Playwright's polling loop while a complete frame is
        // being composited. Re-read the real Babylon billboard below and accept only
        // if the final mesh, text, texture and viewport checks all pass synchronously.
        dialogueVisualPollTimedOut=true;
        manifest.npcDialogueVisualPollWarning=String(pollError?.message||pollError);
      }
      const visualEvidence = await page.evaluate(() => {
        const state = window.__ELSN_NPC_DIALOGUES__.getSnapshot();
        const proof = window.__ELSN_NPC_DIALOGUES__.captureVisualProof(true);
        const { dataUrl, ...metadata } = proof;
        return { state, proof: metadata, dataUrl };
      });
      assert.ok(visualEvidence.proof?.ready && visualEvidence.proof?.meshEnabled === true &&
        visualEvidence.proof?.meshVisible === true && visualEvidence.proof?.meshReady === true &&
        visualEvidence.proof?.screenInViewport === true && visualEvidence.proof?.messagePainted === true &&
        visualEvidence.proof?.texture?.width === 768 && visualEvidence.proof?.texture?.height === 384 &&
        visualEvidence.proof?.texture?.vScale === 1 && visualEvidence.proof?.texture?.vOffset === 0 &&
        visualEvidence.proof?.uploadInvertY === true && visualEvidence.proof?.screenPosition &&
        visualEvidence.dataUrl?.startsWith('data:image/png;base64,'),
        'La burbuja NPC no está realmente visible y renderizable dentro del viewport: ' +
        JSON.stringify({pollTimedOut:dialogueVisualPollTimedOut,state:visualEvidence.state,proof:visualEvidence.proof}));
      // Chromium's full-page compositor screenshot can stall for 20s under SwiftShader,
      // even after Babylon confirms the billboard is enabled, ready and inside the viewport.
      // Keep that optional evidence separate from the deterministic live-render proof.
      let dialogueScreenshotCaptured=false;
      try{
        const dialogueScreen=await page.screenshot({path:path.join(OUT,'npc-dialogue-screen.png'),timeout:3000,animations:'disabled'});
        dialogueScreenshotCaptured=dialogueScreen.length>5000;
      }catch(screenshotError){
        manifest.npcDialogueScreenshotWarning=String(screenshotError?.message||screenshotError);
      }
      manifest.npcDialogueSmoke = {
        ...visualEvidence.state,
        billboardTextureReady: true,
        textureUploadOrientationVerified: true,
        renderedBubbleVerified: visualEvidence.proof.ready===true && visualEvidence.proof.meshEnabled===true && visualEvidence.proof.meshVisible===true && visualEvidence.proof.meshReady===true && visualEvidence.proof.screenInViewport===true && visualEvidence.proof.messagePainted===true,
        visualScreenshotCaptured: dialogueScreenshotCaptured,
        visualEvidenceFile: 'npc-dialogue-texture.png',
        visualScreenshotFile: dialogueScreenshotCaptured?'npc-dialogue-screen.png':null,
        visualScreenshotIsOptionalUnderSoftwareRenderer:true,
        visualPollingRecoveredAfterTimeout:dialogueVisualPollTimedOut,
        visualProof: visualEvidence.proof,
        visualProbe: 'temporary-npc-near-player'
      };
      await fs.promises.writeFile(
        path.join(OUT, 'npc-dialogue-texture.png'),
        Buffer.from(visualEvidence.dataUrl.slice('data:image/png;base64,'.length), 'base64')
      );
      await fs.promises.writeFile(
        path.join(OUT, 'npc-dialogue-render-state.json'),
        JSON.stringify(manifest.npcDialogueSmoke, null, 2)
      );
    } catch (error) {
      manifest.npcDialogueSmoke = await page.evaluate(() => ({
        ...window.__ELSN_NPC_DIALOGUES__?.getSnapshot?.(),
        billboardTextureReady: false,
        textureUploadOrientationVerified: false,
        renderedBubbleVerified: false,
        visualProof: window.__ELSN_NPC_DIALOGUES__?.captureVisualProof?.() || null
      }));
      await fs.promises.writeFile(path.join(OUT, 'npc-dialogue-render-state-failure.json'),
        JSON.stringify(manifest.npcDialogueSmoke, null, 2));
      throw new Error('La burbuja NPC no superó la comprobación de malla y textura: ' +
        JSON.stringify(manifest.npcDialogueSmoke) + ' · ' + String(error?.message || error));
    } finally {
      await page.evaluate(() => {
        try { window.__ELSN_DIALOGUE_SMOKE_RESTORE__?.(); } catch (_) {}
      });
    }
    // Wait for the real campaign world to finish its first selection/update cycles.
    const spatialFilterWaitStartedAt = performance.now();
    await page.waitForFunction(() => {
      const state = window.__ELSN_SPATIAL_SELECTION__;
      return !!state && state.enabled === true &&
        Number(state.sceneMeshCount) >= 512 &&
        Number(state.staticIndexedMeshCount) >= 512;
    }, undefined, { timeout: 30000, polling: 100 });
    manifest.spatialSelectionWaitMs = Number((performance.now() - spatialFilterWaitStartedAt).toFixed(1));
    manifest.spatialSelection = await page.evaluate(() => window.__ELSN_SPATIAL_SELECTION__ || null);
    assert.ok(manifest.spatialSelection?.enabled === true,
      'La compilación no activó la selección espacial Babylon en la escena principal: ' +
      JSON.stringify(manifest.spatialSelection));
    assert.ok(Number(manifest.spatialSelection.sceneMeshCount) >= 512,
      'La selección espacial se construyó antes de terminar el montaje de la escena.');
    assert.ok(Number(manifest.spatialSelection.dynamicMeshCount) > 0,
      'No se registraron meshes dinámicos; los actores y efectos podrían quedar fuera de la selección.');
    assert.ok(Number(manifest.spatialSelection.staticIndexedMeshCount) >= Number(manifest.spatialSelection.sceneMeshCount) * 0.20,
      'El octree no está indexando una base suficiente de geometría estática: ' +
      JSON.stringify(manifest.spatialSelection));
    assert.ok(Number(manifest.spatialSelection.dynamicContentRatio) < 0.80,
      'La lista dinámica supera el presupuesto validado para la escena: ' +
      JSON.stringify(manifest.spatialSelection));
    assert.equal(manifest.spatialSelection.dynamicFilterEnabled, false,
      'Dynamic frustum filtering is intentionally not enabled until Babylon dynamicContent evaluation is safely integrated.');
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
        wildlife: snapshot.actors?.wildlife ?? null,
        ambientBirds: snapshot.actors?.ambientBirds ?? null,
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
    assert.equal(manifest.worldInspection.actorCounts.wildlife, 3,
      'La captura de arranque debe contener los tres animales terrestres obligatorios.');
    assert.equal(manifest.worldInspection.wildlife?.returned?.length, 3,
      'La captura debe incluir el inventario individual de los tres animales.');
    assert.deepEqual([...new Set(manifest.worldInspection.wildlife.returned.map(animal => animal.kind))].sort(),
      ['deer','stag','wolf'], 'La isla inicial debe contener ciervo, ciervo macho y lobo.');
    for (const animal of manifest.worldInspection.wildlife.returned) {
      assert.ok(animal.visualIntegrity?.hasMeshes && animal.visualIntegrity?.hasSkinnedMesh &&
        animal.visualIntegrity?.hasSkeleton && animal.visualIntegrity?.hasFinitePosition &&
        animal.visualIntegrity?.hasVisibleGeometry && animal.visualIntegrity?.hasFiniteBounds &&
        animal.visualIntegrity?.plausibleBounds,
        'Fauna con rig, geometría, límites o escala incorrectos: ' + JSON.stringify(animal));
      assert.ok(animal.skeletons?.some(skeleton => Number(skeleton.boneCount) >= 12),
        'Fauna sin esqueleto suficiente: ' + JSON.stringify(animal));
      assert.ok(Array.isArray(animal.animationGroups) && animal.animationGroups.length > 0 &&
        animal.animationGroups.some(group => Number(group.targetedAnimations) > 0),
        'Fauna sin clips dirigidos al esqueleto: ' + JSON.stringify(animal));
      const textureState=animal.textureReadiness||{};
      assert.equal(textureState.complete,true,
        'La comprobación de carga de texturas no se completó: ' + JSON.stringify(animal));
      // Some GLBs are intentionally material-coloured and contain no image textures.
      // Null counters mean "no active texture objects", not pending/unknown textures.
      assert.equal(Number(textureState.pending??0),0,
        'La fauna no puede entrar con texturas pendientes: ' + JSON.stringify(animal));
      assert.equal(Number(textureState.unknown??0),0,
        'La disponibilidad de texturas debe ser verificable: ' + JSON.stringify(animal));
      if(Number(textureState.count)>0)assert.equal(Number(textureState.ready),Number(textureState.count),
        'Hay texturas activas que no terminaron de prepararse: ' + JSON.stringify(animal));
      const drawableMeshes=(animal.meshes||[]).filter(mesh=>Number(mesh.vertices)>0);
      assert.ok(drawableMeshes.length>0&&drawableMeshes.every(mesh=>!!mesh.material),
        'La fauna tiene geometría sin material asignado: ' + JSON.stringify(animal));
    }
    assert.equal(manifest.worldInspection.actorCounts.ambientBirds,5,
      'La captura debe contener las cinco gaviotas reales del perfil Calidad.');
    assert.equal(manifest.worldInspection.ambientBirds?.returned?.length,5,
      'La captura debe conservar la ficha individual de cada gaviota.');
    for(const bird of manifest.worldInspection.ambientBirds.returned){
      assert.ok(bird.visualIntegrity?.hasMeshes&&bird.visualIntegrity?.hasFinitePosition&&
        bird.visualIntegrity?.hasVisibleGeometry&&bird.visualIntegrity?.hasFiniteBounds&&
        bird.visualIntegrity?.plausibleBounds,
        'Gaviota con geometría, posición o límites inválidos: '+JSON.stringify(bird));
      assert.equal(bird.flightRig?.complete,true,
        'La gaviota no tiene sus nueve articulaciones de vuelo: '+JSON.stringify(bird));
      assert.equal(bird.flightRig?.partCount,9,
        'El rig de vuelo debe contener nueve pivotes: '+JSON.stringify(bird.flightRig));
      assert.equal(bird.flightRig?.animationPlaying,true,
        'La animación de vuelo de una gaviota está detenida: '+JSON.stringify(bird.flightRig));
      assert.ok(Number(bird.flightRig?.targetedAnimations)>=100,
        'La animación de vuelo no tiene pistas dirigidas: '+JSON.stringify(bird.flightRig));
      assert.match(String(bird.flightRig?.animationGroupName||''),/fly/i,
        'La gaviota no está reproduciendo el clip Fly nativo del GLB: '+JSON.stringify(bird.flightRig));
      const textureState=bird.textureReadiness||{};
      assert.equal(Number(textureState.pending??0),0,
        'La gaviota tiene texturas pendientes: '+JSON.stringify(bird));
      assert.equal(Number(textureState.unknown??0),0,
        'La disponibilidad de texturas de la gaviota no se puede verificar: '+JSON.stringify(bird));
    }
    manifest.wildlifeVisualCapture = {
      file: 'wildlife-world-capture.png',
      capturedAt: new Date().toISOString(),
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio }))
    };
    await page.screenshot({ path: path.join(OUT, 'wildlife-world-capture.png'), fullPage: false });
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
    // NPC dialogue visibility is deliberately not a CI acceptance criterion:
    // do not teleport the player or steer the camera to force a bubble. The player checks this in-game.
    manifest.npcDialoguePlayerValidation = {
      owner: 'manual-player',
      automatedVisualAcceptance: false,
      diagnostics: await page.evaluate(() => ({
        runtime: window.__ELSN_NPC_DIALOGUES__?.getSnapshot?.() ?? null,
        nearbyNPCs: window.__ELSN_GAME_DIALOGUE_BRIDGE__?.getSnapshot?.()?.people?.length ?? null
      }))
    };
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
    if (process.env.PLAYER_TEST_SKIP_WARM_RESTART === '1') {
      // The dedicated HTTPS runtime-acceptance workflow owns warm and offline restart.
      // Keep this run focused on a cold first boot and the first gameplay interval;
      // avoid repeating a second 5,183-mesh scene load on the same constrained runner.
      manifest.cachedRestart = {
        enabled: false,
        delegatedTo: 'Game runtime acceptance — EL SIN NOMBRE',
        reason: 'Dedicated HTTPS workflow validates warm start and Service Worker offline restart.'
      };
      manifest.offlineReload = {
        enabled: false,
        delegatedTo: 'Game runtime acceptance — EL SIN NOMBRE'
      };
      return;
    }
    // Repeat in the same browser profile to measure the Service Worker/Cache API warm path.
    const cachedLaunchStartedAt = performance.now();
    // Dispose of the renderer that just completed the 5,000+ mesh gameplay
    // session before measuring the warm launch. Keep the same browser context so
    // localStorage, Cache API and the Service Worker remain intact.
    await page.close({ runBeforeUnload: false });
    page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    attachPageDiagnostics(page);
    const warmNavigationResponse = await page.goto(BASE_URL + '?playertest=1&debug=1', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    assert.ok(warmNavigationResponse && warmNavigationResponse.status() === 200,
      'El arranque con caché no respondió HTTP 200: ' +
      JSON.stringify({ status: warmNavigationResponse?.status(), url: warmNavigationResponse?.url() }));
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
    const cachedStartupWait = await waitForWorldReadyWithRecovery(page, 'El arranque con caché');
    manifest.cachedStartupPresentation=await waitForStartupPresentation(page,'Arranque con caché');
    manifest.cachedStartupWaitRecoveredAfterRendererStall = cachedStartupWait.recoveredAfterWaitTimeout;
    manifest.cachedStartupWaitDiagnostic = cachedStartupWait.recoveredAfterWaitTimeout
      ? { ...cachedStartupWait.snapshot, recoveredAfterWaitTimeout: true,
          waitTimeoutMs: cachedStartupWait.waitTimeoutMs, elapsedMs: cachedStartupWait.elapsedMs,
          waitError: cachedStartupWait.waitError }
      : { recoveredAfterWaitTimeout: false, elapsedMs: cachedStartupWait.elapsedMs };
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
      // Do not reload the gameplay tab in place: its renderer may still be busy with the
      // just-finished 5,000+ mesh scene (especially under SwiftShader). Close that client
      // and create a cold browser tab in the SAME context so localStorage, Cache API and
      // the active Service Worker are preserved while the renderer starts clean.
      await page.close({ runBeforeUnload: false });
      page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(90000);
      attachPageDiagnostics(page);
      const offlineNavigationResponse = await page.goto(BASE_URL + '?playertest=1&debug=1', {
        waitUntil: 'commit',
        timeout: 60000
      });
      assert.ok(offlineNavigationResponse,
        'La navegación offline no devolvió una respuesta principal.');
      manifest.offlineReload.navigationResponse = {
        status: offlineNavigationResponse.status(),
        fromServiceWorker: offlineNavigationResponse.fromServiceWorker(),
        url: offlineNavigationResponse.url()
      };
      assert.equal(offlineNavigationResponse.status(), 200,
        'El shell offline no respondió HTTP 200: ' + JSON.stringify(manifest.offlineReload.navigationResponse));
      assert.equal(offlineNavigationResponse.fromServiceWorker(), true,
        'La página nueva no se sirvió desde el Service Worker: ' +
        JSON.stringify(manifest.offlineReload.navigationResponse));
      manifest.offlineReload.navigation = 'loaded-from-service-worker-cache';

      const offlineAudioGate = page.locator('#audioGateStart');
      if (await offlineAudioGate.isVisible().catch(() => false)) {
        await offlineAudioGate.click({ timeout: 30000 });
      }
      // Offline reload can restore the saved player and enter booting immediately.
      // In that valid returning-player path the quality selector is intentionally hidden.
      // Wait for either the first-run selector or an already-started/failed boot; never
      // require a hidden UI control after the Service Worker has restored the app shell.
      await page.waitForFunction(() => {
        const quality = document.getElementById('chooseQuality');
        const identity = document.getElementById('identitySetup');
        const loading = document.getElementById('loading');
        const visible = element => !!element &&
          getComputedStyle(element).display !== 'none' &&
          getComputedStyle(element).visibility !== 'hidden';
        const qualityVisible = visible(quality);
        const identityVisible = visible(identity) && identity?.getAttribute('aria-hidden') !== 'true';
        const booting = document.body.classList.contains('booting') ||
          (visible(loading) && !document.body.classList.contains('boot-failed'));
        return qualityVisible || identityVisible || booting ||
          document.body.classList.contains('boot-failed');
      }, undefined, { timeout: 60000, polling: 100 });
      if (await page.locator('#chooseQuality').isVisible().catch(() => false)) {
        await page.locator('#chooseQuality').click();
      }
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

      const offlineStartupWait = await waitForWorldReadyWithRecovery(page, 'El reinicio offline');
      manifest.offlineReload.startupPresentation=await waitForStartupPresentation(page,'Reinicio offline');
      manifest.offlineReload.startupWaitRecoveredAfterRendererStall = offlineStartupWait.recoveredAfterWaitTimeout;
      manifest.offlineReload.startupWaitDiagnostic = offlineStartupWait.recoveredAfterWaitTimeout
        ? { ...offlineStartupWait.snapshot, recoveredAfterWaitTimeout: true,
            waitTimeoutMs: offlineStartupWait.waitTimeoutMs, elapsedMs: offlineStartupWait.elapsedMs,
            waitError: offlineStartupWait.waitError }
        : { recoveredAfterWaitTimeout: false, elapsedMs: offlineStartupWait.elapsedMs };
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
