(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" || !window.indexedDB) return;
  // Ignore the Inspector Center's embedded diagnostic game; only direct player sessions belong in this history.
  if (window.top !== window.self) return;

  const DB_NAME = "elsn-game-session-reports";
  const DB_VERSION = 1;
  const STORE = "sessions";
  const SAMPLE_INTERVAL_MS = 10000;
  const MAX_SAMPLES_PER_SESSION = 360;
  const MAX_STORED_SESSIONS = 20;
  const state = { db: null, opening: null, session: null, sampleTimer: null, monitorTimer: null, starting: false, saving: false };

  function number(value) {
    if (value === null || value === undefined || typeof value === "boolean" || value === "") return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function text(value, limit) {
    return String(value == null ? "" : value).replace(/[\u0000-\u001F]/g, "").slice(0, limit);
  }

  function openDatabase() {
    if (state.db) return Promise.resolve(state.db);
    if (state.opening) return state.opening;
    state.opening = new Promise((resolve, reject) => {
      let request;
      try { request = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "sessionId" });
      };
      request.onsuccess = () => {
        state.db = request.result;
        state.db.onversionchange = () => { state.db.close(); state.db = null; };
        resolve(state.db);
      };
      request.onerror = () => reject(request.error || new Error("No se pudo abrir el archivo local de sesiones."));
      request.onblocked = () => reject(new Error("El archivo de sesiones está bloqueado por otra pestaña."));
    }).finally(() => { state.opening = null; });
    return state.opening;
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Error al guardar el informe de partida."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del informe."));
    });
  }

  async function saveSession() {
    if (!state.session) return false;
    if (state.saving) {
      await state.saving.catch(() => false);
      if (!state.session) return false;
    }
    const current = state.session;
    const snapshot = JSON.parse(JSON.stringify(current));
    const job = (async () => {
      const db = await openDatabase();
      const transaction = db.transaction(STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(STORE).put(snapshot);
      await done;
      return true;
    })();
    state.saving = job;
    try {
      await job;
      return true;
    } catch (error) {
      if (state.session === current) state.session.storageError = text(error && error.message || error, 180);
      return false;
    } finally {
      if (state.saving === job) state.saving = null;
    }
  }

  async function pruneOldSessions() {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const reports = Array.isArray(request.result) ? request.result : [];
        reports.sort((a, b) => Date.parse(b.startedAt || "") - Date.parse(a.startedAt || ""));
        for (const report of reports.slice(MAX_STORED_SESSIONS)) store.delete(report.sessionId);
      };
      await transactionDone(transaction);
    } catch (_) {}
  }

  function readWaterDiagnostics() {
    if (typeof window.__elSinNombreWaterDebugSnapshot !== "function") return null;
    try {
      const source = window.__elSinNombreWaterDebugSnapshot();
      if (!source || typeof source !== "object") return null;
      const allowed = ["wetSteps", "waterParticlesEmitted", "activeSplashParticles", "aliveSplashParticles", "maxShoreStepMeters", "maximumShoreStepMeters"];
      const measurements = {};
      for (const key of allowed) {
        const value = number(source[key]);
        if (value !== null) measurements[key] = value;
      }
      const timings = {};
      if (source.timings && typeof source.timings === "object") {
        for (const [key, value] of Object.entries(source.timings).slice(0, 16)) {
          const metric = number(value);
          if (metric !== null) timings[text(key, 64)] = metric;
        }
      }
      return { available: true, measurements, timings };
    } catch (_) {
      return { available: false, measurements: {}, timings: {} };
    }
  }

  function readPlayerLocation(health) {
    const player = health && health.player;
    const candidates = [
      player && player.position,
      player && player.worldPosition,
      player && player.root && player.root.position,
      player && player.actor && player.actor.position,
      player
    ];
    const position = candidates.find(value =>
      value && number(value.x) !== null && number(value.y) !== null && number(value.z) !== null
    );
    if (!position) return null;
    return {
      x: Number(number(position.x).toFixed(3)),
      y: Number(number(position.y).toFixed(3)),
      z: Number(number(position.z).toFixed(3)),
      islandIndex: number(player && (player.islandIndex ?? player.nearestIslandIndex))
    };
  }

  function readSample() {
    if (document.visibilityState !== "visible" || typeof window.getGameHealthDebug !== "function") return null;
    let health;
    try { health = window.getGameHealthDebug(); } catch (_) { return null; }
    if (!health || !document.body || !document.body.classList.contains("game-running")) return null;
    const runtime = health.runtime && typeof health.runtime === "object" ? health.runtime : {};
    const rawFrame = runtime.frameTimingMs && typeof runtime.frameTimingMs === "object" ? runtime.frameTimingMs : {};
    return {
      capturedAt: new Date().toISOString(),
      targetFps: number(runtime.performanceAssessment && runtime.performanceAssessment.targetFps),
      fps: number(runtime.fps ?? health.fps),
      frameTiming: {
        sampleCount: number(rawFrame.samples),
        averageMs: number(rawFrame.average),
        p50Ms: number(rawFrame.p50),
        p95Ms: number(rawFrame.p95),
        p99Ms: number(rawFrame.p99),
        maxMs: number(rawFrame.max)
      },
      cpu: {
        worldUpdateMs: number(runtime.worldUpdateMs),
        renderCpuMs: number(runtime.renderCpuMs)
      },
      gpu: {
        frameMs: number(runtime.engineGpuFrameMs),
        sceneRenderMs: number(runtime.sceneRenderMs)
      },
      sceneTimings: {
        frameMs: number(runtime.sceneFrameMs),
        activeMeshesEvaluationMs: number(runtime.activeMeshesEvaluationMs),
        renderTargetsMs: number(runtime.renderTargetsMs),
        cameraRenderMs: number(runtime.cameraRenderMs),
        shaderCompilationMs: number(runtime.shaderCompilationMs)
      },
      scene: {
        drawCalls: number(runtime.drawCalls ?? runtime.sceneDrawCalls),
        activeMeshes: number(runtime.activeMeshes),
        meshCount: number(runtime.meshCount),
        totalVertices: number(runtime.totalVertices),
        renderWidth: number(runtime.renderWidth),
        renderHeight: number(runtime.renderHeight),
        renderDpr: number(runtime.renderDpr),
        graphicsProfile: text(runtime.graphicsProfile, 40),
        profileDiagnosticsEnabled: runtime.profileDiagnosticsEnabled === true,
        engineBackend: text(runtime.engineBackend, 32),
        gpuRenderer: text(runtime.gpuRenderer, 120)
      },
      playerPosition: readPlayerLocation(health),
      waterDiagnostics: readWaterDiagnostics()
    };
  }

  async function beginSession() {
    if (state.session || state.starting || !document.body || !document.body.classList.contains("game-running")) return;
    state.starting = true;
    try {
      const initial = readSample();
      if (!initial) {
        if (!state.monitorTimer) state.monitorTimer = window.setInterval(monitorGameState, 2500);
        return;
      }
      if (state.monitorTimer) window.clearInterval(state.monitorTimer);
      state.monitorTimer = null;
      await openDatabase();
      await pruneOldSessions();
      const build = document.querySelector('meta[name="el-sin-nombre-build"]');
      state.session = {
        schemaVersion: 1,
        sessionId: window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "session-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
        startedAt: initial.capturedAt,
        lastUpdatedAt: initial.capturedAt,
        finishedAt: null,
        status: "active",
        gameBuild: build ? text(build.content, 40) : null,
        device: {
          userAgent: text(window.navigator && window.navigator.userAgent, 220),
          devicePixelRatio: number(window.devicePixelRatio),
          hardwareConcurrency: number(window.navigator && window.navigator.hardwareConcurrency)
        },
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        sampleCount: 0,
        truncatedSamples: 0,
        samples: []
      };
      appendSample(initial);
      await saveSession();
      state.sampleTimer = window.setInterval(sampleAndSave, SAMPLE_INTERVAL_MS);
      window.__ELSN_SESSION_RECORDER_STATUS__ = { active: true, sessionId: state.session.sessionId, sampleIntervalMs: SAMPLE_INTERVAL_MS };
    } catch (error) {
      window.__ELSN_SESSION_RECORDER_STATUS__ = { active: false, error: text(error && error.message || error, 180) };
    } finally {
      state.starting = false;
    }
  }

  function appendSample(sample) {
    if (!state.session || !sample) return;
    state.session.samples.push(sample);
    state.session.sampleCount++;
    if (state.session.samples.length > MAX_SAMPLES_PER_SESSION) {
      state.session.samples.shift();
      state.session.truncatedSamples++;
    }
    state.session.lastUpdatedAt = sample.capturedAt;
  }

  async function sampleAndSave() {
    if (!state.session) return;
    if (!document.body || !document.body.classList.contains("game-running")) {
      await finishSession("game-stopped");
      return;
    }
    const sample = readSample();
    if (!sample) return;
    appendSample(sample);
    await saveSession();
  }

  function percentile(values, ratio) {
    const valid = values.filter(value => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
    if (!valid.length) return null;
    const index = (valid.length - 1) * ratio;
    const lower = Math.floor(index), upper = Math.ceil(index);
    return Number((valid[lower] + (valid[upper] - valid[lower]) * (index - lower)).toFixed(2));
  }

  function buildSessionSummary(session) {
    const samples = Array.isArray(session.samples) ? session.samples : [];
    const values = key => samples.map(sample => number(key(sample))).filter(value => value !== null);
    const fps = values(sample => sample.fps);
    const p95 = values(sample => sample.frameTiming && sample.frameTiming.p95Ms);
    const p99 = values(sample => sample.frameTiming && sample.frameTiming.p99Ms);
    const world = values(sample => sample.cpu && sample.cpu.worldUpdateMs);
    const render = values(sample => sample.cpu && sample.cpu.renderCpuMs);
    const gpu = values(sample => sample.gpu && sample.gpu.frameMs);
    const sceneRender = values(sample => sample.gpu && sample.gpu.sceneRenderMs);
    const activeMeshes = values(sample => sample.sceneTimings && sample.sceneTimings.activeMeshesEvaluationMs);
    const renderTargets = values(sample => sample.sceneTimings && sample.sceneTimings.renderTargetsMs);
    const median = list => percentile(list, .5);
    const medianWorld = median(world), medianRender = median(render), medianGpu = median(gpu);
    const medianSceneRender = median(sceneRender), medianActiveMeshes = median(activeMeshes), medianRenderTargets = median(renderTargets);
    const stages = [
      { name: "actualizacion-del-mundo", value: medianWorld, source: "CPU del juego" },
      { name: "preparacion-render-CPU", value: medianRender, source: "CPU del navegador/motor" },
      { name: "evaluacion-mallas-activas", value: medianActiveMeshes, source: "Babylon SceneInstrumentation" },
      { name: "render-targets", value: medianRenderTargets, source: "Babylon SceneInstrumentation" },
      { name: "render-escena", value: medianSceneRender, source: "Babylon SceneInstrumentation" },
      { name: "GPU", value: medianGpu, source: "Babylon EngineInstrumentation" }
    ].filter(item => item.value !== null).sort((a, b) => b.value - a.value);
    const targetFps = percentile(values(sample => sample.targetFps), .5) || 60;
    return {
      sampleCount: samples.length,
      durationSeconds: session.startedAt && session.finishedAt
        ? Math.max(0, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000)) : null,
      targetFps,
      fps: { minimum: fps.length ? Math.min(...fps) : null, average: fps.length ? Number((fps.reduce((sum, value) => sum + value, 0) / fps.length).toFixed(2)) : null, median: median(fps), p10: percentile(fps, .1) },
      frameTimeMs: { p95Median: median(p95), p99Median: median(p99), worstP95: p95.length ? Math.max(...p95) : null },
      stutterIntervalsOver33ms: p95.filter(value => value > 33.33).length,
      cpu: { worldUpdateMedianMs: medianWorld, renderPreparationMedianMs: medianRender },
      gpu: { frameMedianMs: medianGpu, sceneRenderMedianMs: medianSceneRender },
      sceneTimings: { activeMeshesEvaluationMedianMs: medianActiveMeshes, renderTargetsMedianMs: medianRenderTargets },
      probableBottleneck: stages.length && stages[0].value >= 4 ? stages[0].name : "sin-atribucion-suficiente",
      bottleneckEvidence: stages,
      gpuProfilerEnabled: samples.some(sample => sample.scene && sample.scene.profileDiagnosticsEnabled === true),
      caveat: "Atribución orientativa basada en medianas disponibles; los contadores ausentes no se interpretan como cero."
    };
  }

  function captureFinalWorldInspection() {
    if (typeof window.getGameWorldInspectionSnapshot !== "function") return null;
    try {
      const snapshot = window.getGameWorldInspectionSnapshot({ maxMeshes: 10000, maxActors: 500, includeMeshes: true });
      const terrain = snapshot && snapshot.terrainObjects;
      return {
        capturedAt: snapshot && snapshot.capturedAt || new Date().toISOString(),
        source: snapshot && snapshot.source || "Babylon.js runtime",
        scene: snapshot && snapshot.scene || null,
        terrainObjects: terrain ? {
          checkedCount: terrain.checkedCount,
          candidateCount: terrain.candidateCount,
          fullyBuriedCount: terrain.fullyBuriedCount,
          penetratingCount: terrain.penetratingCount,
          unmeasurableCount: terrain.unmeasurableCount,
          complete: terrain.complete,
          terrainHeightSource: terrain.terrainHeightSource,
          items: (terrain.items || []).slice(0, 100)
        } : null,
        structureAudit: snapshot && snapshot.structures && snapshot.structures.audit || null,
        terrain: snapshot && snapshot.terrain || null,
        islands: snapshot && snapshot.islands || null
      };
    } catch (error) {
      return { error: text(error && error.message || error, 240), capturedAt: new Date().toISOString() };
    }
  }

  async function finishSession(reason) {
    if (state.sampleTimer) window.clearInterval(state.sampleTimer);
    state.sampleTimer = null;
    if (!state.session) return;
    const current = state.session;
    current.finishedAt = new Date().toISOString();
    current.lastUpdatedAt = current.finishedAt;
    current.status = reason === "pagehide" ? "interrupted" : "completed";
    current.endReason = reason;
    current.summary = buildSessionSummary(current);
    if (reason !== "pagehide") current.finalWorldInspection = captureFinalWorldInspection();
    await saveSession();
    window.__ELSN_SESSION_RECORDER_STATUS__ = {
      active: false,
      sessionId: current.sessionId,
      sampleCount: current.sampleCount,
      status: current.status,
      summary: current.summary,
      terrainObjectCandidates: current.finalWorldInspection && current.finalWorldInspection.terrainObjects
        ? current.finalWorldInspection.terrainObjects.candidateCount : null
    };
    state.session = null;
  }

  function monitorGameState() {
    if (document.body && document.body.classList.contains("game-running")) {
      if (!state.session && !state.starting) beginSession();
    } else {
      if (state.monitorTimer) window.clearInterval(state.monitorTimer);
      state.monitorTimer = null;
      if (state.session) finishSession("game-stopped");
    }
  }

  function start() {
    if (!document.body) return;
    const observer = new MutationObserver(monitorGameState);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        monitorGameState();
        if (state.session) sampleAndSave();
      }
    });
    window.addEventListener("pagehide", () => {
      if (state.monitorTimer) window.clearInterval(state.monitorTimer);
      finishSession("pagehide");
    }, { once: true });
    monitorGameState();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();