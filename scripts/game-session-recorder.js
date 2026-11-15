(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" || !window.indexedDB) return;
  // Ignore the Inspector Center's embedded diagnostic game; only direct player sessions belong in this history.
  if (window.top !== window.self) return;

  const DB_NAME = "elsn-game-session-reports";
  const DB_VERSION = 1;
  const STORE = "sessions";
  const SAMPLE_INTERVAL_MS = 2500;
  const PERSIST_INTERVAL_MS = 10000;
  const MAX_SAMPLES_PER_SESSION = 1440;
  const MAX_ANOMALIES_PER_SESSION = 120;
  const MAX_RUNTIME_ERRORS_PER_SESSION = 80;
  const MAX_STORED_SESSIONS = 20;
  const state = { db: null, opening: null, session: null, sampleTimer: null, persistTimer: null, monitorTimer: null, starting: false, saving: false, sampleQueued: false, sampleHandle: null, sampleHandleKind: null, longTaskObserver: null };

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

  function recordDeviceEvent(type) {
    if (!state.session) return;
    if (!Array.isArray(state.session.deviceEvents)) state.session.deviceEvents = [];
    state.session.deviceEvents.push({
      type: text(type, 48),
      capturedAt: new Date().toISOString(),
      visibility: text(document.visibilityState, 16)
    });
    if (state.session.deviceEvents.length > 64) state.session.deviceEvents.shift();
  }

  function recordRuntimeError(kind, message, details) {
    if (!state.session) return;
    if (!Array.isArray(state.session.runtimeErrors)) state.session.runtimeErrors = [];
    const entry = {
      capturedAt: new Date().toISOString(),
      kind: text(kind, 40),
      message: text(message || "Error sin mensaje", 240),
      resourcePath: details && details.resourcePath ? text(details.resourcePath, 180) : null,
      resourceTag: details && details.resourceTag ? text(details.resourceTag, 24) : null,
      source: details && details.source ? text(details.source, 180) : null,
      line: details ? number(details.line) : null,
      column: details ? number(details.column) : null
    };
    const previous = state.session.runtimeErrors[state.session.runtimeErrors.length - 1];
    if (previous && previous.kind === entry.kind && previous.message === entry.message &&
        Date.parse(entry.capturedAt) - Date.parse(previous.capturedAt) < 1000) return;
    state.session.runtimeErrors.push(entry);
    if (state.session.runtimeErrors.length > MAX_RUNTIME_ERRORS_PER_SESSION) state.session.runtimeErrors.shift();
  }

  function safeResourcePath(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), window.location && window.location.href);
      return url.origin + url.pathname;
    } catch (_) {
      return text(value, 180).split("?")[0].split("#")[0];
    }
  }

  function handleRuntimeError(event) {
    if (!state.session || !event) return;
    const target = event.target;
    if (target && target !== window) {
      const tag = text(target.tagName || "resource", 24).toLowerCase();
      const url = target.currentSrc || target.src || target.href || "";
      recordRuntimeError("resource-load", "No se pudo cargar un recurso " + tag, {
        resourcePath: safeResourcePath(url),
        resourceTag: tag
      });
      return;
    }
    recordRuntimeError("javascript-error", event.message || "Error JavaScript", {
      source: safeResourcePath(event.filename),
      line: event.lineno,
      column: event.colno
    });
  }

  function handleUnhandledRejection(event) {
    if (!state.session) return;
    const reason = event && event.reason;
    recordRuntimeError("unhandled-rejection",
      reason && reason.message ? reason.message : String(reason || "Promesa rechazada sin detalle"));
  }

  function installLongTaskObserver() {
    if (typeof window.PerformanceObserver !== "function") return;
    try {
      const supported = window.PerformanceObserver.supportedEntryTypes;
      if (Array.isArray(supported) && !supported.includes("longtask")) return;
      const observer = new window.PerformanceObserver(list => {
        if (!state.session) return;
        if (!Array.isArray(state.session.longTasks)) state.session.longTasks = [];
        for (const entry of list.getEntries()) {
          const origin = number(window.performance && window.performance.timeOrigin);
          const start = number(entry.startTime);
          const at = origin !== null && start !== null ? new Date(origin + start).toISOString() : new Date().toISOString();
          const attribution = Array.from(entry.attribution || []).slice(0, 3).map(item => ({
            name: text(item.name, 80),
            containerType: text(item.containerType, 32),
            containerName: text(item.containerName, 80),
            containerId: text(item.containerId, 80)
          }));
          state.session.longTasks.push({
            capturedAt: at,
            durationMs: Number(Math.max(0, Number(entry.duration) || 0).toFixed(2)),
            name: text(entry.name, 48),
            attribution
          });
          if (state.session.longTasks.length > 64) state.session.longTasks.shift();
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      state.longTaskObserver = observer;
      if (state.session) state.session.longTaskObserverSupported = true;
    } catch (_) {
      state.longTaskObserver = null;
    }
  }

  function stopSessionDiagnostics() {
    if (state.longTaskObserver) {
      try { state.longTaskObserver.disconnect(); } catch (_) {}
      state.longTaskObserver = null;
    }
  }

  async function saveSession() {
    if (!state.session) return false;
    if (state.saving) {
      await state.saving.catch(() => false);
      if (!state.session) return false;
    }
    const current = state.session;
    const snapshot = typeof window.structuredClone === "function" ? window.structuredClone(current) : JSON.parse(JSON.stringify(current));
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
    const readStartedAt = window.performance && typeof window.performance.now === "function" ? window.performance.now() : 0;
    let health;
    try { health = window.getGameHealthDebug(); } catch (_) { return null; }
    if (!health || !document.body || !document.body.classList.contains("game-running")) return null;
    const runtime = health.runtime && typeof health.runtime === "object" ? health.runtime : {};
    const rawFrame = runtime.frameTimingMs && typeof runtime.frameTimingMs === "object" ? runtime.frameTimingMs : {};
    const browserMemory = window.performance && window.performance.memory && typeof window.performance.memory === "object"
      ? window.performance.memory : null;
    let atmosphere = null;
    try {
      const liveAtmosphere = window.__ELSN_ATMOSPHERE;
      if (liveAtmosphere && typeof liveAtmosphere.getState === "function") {
        const state = liveAtmosphere.getState();
        atmosphere = {
          timeOfDay: number(state.timeOfDay),
          night: number(state.night),
          daylight: number(state.daylight),
          twilight: number(state.twilight),
          weather: text(state.weather, 24),
          quality: text(state.quality, 24),
          shadowMode: text(state.shadowMode, 24),
          visualUpdateIntervalMs: number(state.visualUpdateIntervalMs)
        };
      }
    } catch (_) {}
    let npcDialogue = null;
    try {
      const dialogueRuntime = window.__ELSN_NPC_DIALOGUES__;
      if (dialogueRuntime && typeof dialogueRuntime.getSnapshot === "function") {
        const state = dialogueRuntime.getSnapshot();
        npcDialogue = {
          bridgeReady: state.bridgeReady === true,
          active: state.active === true,
          bridgeActive: state.bridgeActive === true,
          worldPeopleCount: number(state.worldPeopleCount),
          nearbyCount: number(state.nearbyCount),
          bubblesStarted: number(state.bubblesStarted),
          projectionAttempts: number(state.projectionAttempts),
          projectionSuccesses: number(state.projectionSuccesses),
          renderedBubbleCount: number(state.renderedBubbleCount),
          activeBubbleCount: number(state.activeBubbleCount),
          lastError: text(state.lastError, 220),
          projectionFailures: state.projectionFailures && typeof state.projectionFailures === "object"
            ? Object.fromEntries(Object.entries(state.projectionFailures).slice(0, 12).map(([key,value])=>[text(key,64),number(value)]))
            : {}
        };
      }
    } catch (_) {}
    const sample = {
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
      worldUpdateCount: number(health.worldUpdateCount),
      worldUpdatePhase: text(health.worldUpdatePhase, 64),
      lastWorldUpdateFailure: text(health.lastWorldUpdateFailure, 220),
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
        activeIndices: number(runtime.activeIndices),
        activeBones: number(runtime.activeBones),
        renderWidth: number(runtime.renderWidth),
        renderHeight: number(runtime.renderHeight),
        renderDpr: number(runtime.renderDpr),
        graphicsProfile: text(runtime.graphicsProfile, 40),
        profileDiagnosticsEnabled: runtime.profileDiagnosticsEnabled === true,
        engineBackend: text(runtime.engineBackend, 32),
        gpuRenderer: text(runtime.gpuRenderer, 120),
        drawCallsCounterSemantics: "raw-runtime-counter",
        meshSelectionOctreeEnabled: runtime.meshSelectionOctreeEnabled === true,
        meshSelectionSceneMeshCount: number(runtime.meshSelectionSceneMeshCount),
        meshSelectionDynamicMeshCount: number(runtime.meshSelectionDynamicMeshCount),
        meshSelectionStaticIndexedMeshCount: number(runtime.meshSelectionStaticIndexedMeshCount),
        meshSelectionDynamicContentRatio: number(runtime.meshSelectionDynamicContentRatio),
        meshSelectionInitialDynamicCount: number(runtime.meshSelectionInitialDynamicCount),
        meshSelectionDynamicReasons: runtime.meshSelectionDynamicReasons || null,
        meshSelectionDynamicSamplesByReason: runtime.meshSelectionDynamicSamplesByReason || null,
        meshSelectionDynamicFrustumEnabled: runtime.meshSelectionDynamicFrustumEnabled === true,
        meshSelectionDynamicFilterPasses: number(runtime.meshSelectionDynamicFilterPasses),
        meshSelectionDynamicFilterCandidates: number(runtime.meshSelectionDynamicFilterCandidates),
        meshSelectionDynamicFilterSelected: number(runtime.meshSelectionDynamicFilterSelected),
        meshSelectionDynamicFilterCulled: number(runtime.meshSelectionDynamicFilterCulled),
        meshSelectionDynamicFilterCulledPeak: number(runtime.meshSelectionDynamicFilterCulledPeak),
        meshSelectionDynamicFilterTotalCulled: number(runtime.meshSelectionDynamicFilterTotalCulled),
        meshSelectionDynamicFilterLastMs: number(runtime.meshSelectionDynamicFilterLastMs),
        meshSelectionDynamicFilterMaxMs: number(runtime.meshSelectionDynamicFilterMaxMs),
        meshSelectionDynamicFilterErrors: number(runtime.meshSelectionDynamicFilterErrors),
        meshSelectionDynamicFrustumEnabled: runtime.meshSelectionDynamicFrustumEnabled === true,
        meshSelectionDynamicFilterPasses: number(runtime.meshSelectionDynamicFilterPasses),
        meshSelectionDynamicFilterCandidates: number(runtime.meshSelectionDynamicFilterCandidates),
        meshSelectionDynamicFilterSelected: number(runtime.meshSelectionDynamicFilterSelected),
        meshSelectionDynamicFilterCulled: number(runtime.meshSelectionDynamicFilterCulled),
        meshSelectionDynamicFilterCulledPeak: number(runtime.meshSelectionDynamicFilterCulledPeak),
        meshSelectionDynamicFilterTotalCulled: number(runtime.meshSelectionDynamicFilterTotalCulled),
        meshSelectionDynamicFilterLastMs: number(runtime.meshSelectionDynamicFilterLastMs),
        meshSelectionDynamicFilterMaxMs: number(runtime.meshSelectionDynamicFilterMaxMs),
        meshSelectionDynamicFilterErrors: number(runtime.meshSelectionDynamicFilterErrors),
        meshSelectionBuildMs: number(runtime.meshSelectionBuildMs)
      },
      memory: {
        usedJSHeapSizeBytes: number(browserMemory && browserMemory.usedJSHeapSize),
        totalJSHeapSizeBytes: number(browserMemory && browserMemory.totalJSHeapSize),
        jsHeapLimitBytes: number(browserMemory && browserMemory.jsHeapSizeLimit)
      },
      subsystems: {
        waterUpdateMs: number(runtime.waterUpdateMs),
        waterNormalMs: number(runtime.waterNormalMs),
        waterReflectionMeshes: number(runtime.waterReflectionMeshes),
        waterReflectionRefreshRate: number(runtime.waterReflectionRefreshRate),
        grassInstances: number(runtime.grassInstances),
        grassBatches: number(runtime.grassBatches),
        activeWorldShadowCasters: number(runtime.activeWorldShadowCasters)
      },
      atmosphere,
      npcDialogue,
      playerPosition: readPlayerLocation(health),
      waterDiagnostics: readWaterDiagnostics()
    };
    sample.diagnosticsReadMs = readStartedAt > 0 ? Number(Math.max(0, window.performance.now() - readStartedAt).toFixed(2)) : null;
    return sample;
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
          hardwareConcurrency: number(window.navigator && window.navigator.hardwareConcurrency),
          deviceMemoryGB: number(window.navigator && window.navigator.deviceMemory),
          maxTouchPoints: number(window.navigator && window.navigator.maxTouchPoints),
          screen: {
            width: number(window.screen && window.screen.width),
            height: number(window.screen && window.screen.height)
          },
          viewport: {
            width: number(window.innerWidth),
            height: number(window.innerHeight)
          },
          connectionType: text(window.navigator && window.navigator.connection && window.navigator.connection.effectiveType, 24) || null
        },
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        persistIntervalMs: PERSIST_INTERVAL_MS,
        sampleCount: 0,
        truncatedSamples: 0,
        samples: [],
        anomalies: [],
        runtimeErrors: [],
        longTasks: [],
        longTaskObserverSupported: false,
        deviceEvents: []
      };
      installLongTaskObserver();
      appendSample(initial);
      await saveSession();
      state.sampleTimer = window.setInterval(queueIdleSample, SAMPLE_INTERVAL_MS);
      state.persistTimer = window.setInterval(persistSession, PERSIST_INTERVAL_MS);
      window.__ELSN_SESSION_RECORDER_STATUS__ = {
        active: true,
        sessionId: state.session.sessionId,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        persistIntervalMs: PERSIST_INTERVAL_MS
      };
    } catch (error) {
      window.__ELSN_SESSION_RECORDER_STATUS__ = { active: false, error: text(error && error.message || error, 180) };
    } finally {
      state.starting = false;
    }
  }

  function recordPerformanceAnomaly(sample) {
    if (!state.session || !sample) return;
    const targetFps = number(sample.targetFps);
    const frameBudgetMs = targetFps !== null && targetFps > 0 ? 1000 / targetFps : null;
    const p95 = number(sample.frameTiming && sample.frameTiming.p95Ms);
    const p99 = number(sample.frameTiming && sample.frameTiming.p99Ms);
    const max = number(sample.frameTiming && sample.frameTiming.maxMs);
    const fps = number(sample.fps);
    const signals = [];
    if (frameBudgetMs !== null && p95 !== null && p95 >= frameBudgetMs * 1.5) signals.push("p95-supera-1.5x-presupuesto");
    if (frameBudgetMs !== null && p99 !== null && p99 >= frameBudgetMs * 2) signals.push("p99-supera-2x-presupuesto");
    if (frameBudgetMs !== null && max !== null && max >= frameBudgetMs * 3) signals.push("pico-maximo-supera-3x-presupuesto");
    if (targetFps !== null && fps !== null && fps < targetFps * 0.75) signals.push("fps-por-debajo-del-75%-objetivo");
    if (!signals.length) return;
    const critical = (frameBudgetMs !== null && ((p95 !== null && p95 >= frameBudgetMs * 2.5) ||
      (p99 !== null && p99 >= frameBudgetMs * 3))) || (targetFps !== null && fps !== null && fps < targetFps * 0.45);
    const severity = critical ? "critical" : "warning";
    sample.performanceAnomaly = { severity, signals };
    const anomalies = state.session.anomalies || (state.session.anomalies = []);
    const capturedAt = sample.capturedAt || new Date().toISOString();
    const eventTime = Date.parse(capturedAt);
    const relatedLongTasks = (state.session.longTasks || []).filter(item =>
      Math.abs(Date.parse(item.capturedAt || "") - eventTime) <= 5000
    ).slice(-8);
    const relatedRuntimeErrors = (state.session.runtimeErrors || []).filter(item =>
      Math.abs(Date.parse(item.capturedAt || "") - eventTime) <= 10000
    ).slice(-8);
    const previous = anomalies[anomalies.length - 1];
    if (previous && Date.parse(capturedAt) - Date.parse(previous.lastSeenAt || previous.startedAt) <= 6500) {
      previous.lastSeenAt = capturedAt;
      previous.observations = Number(previous.observations || 1) + 1;
      previous.severity = previous.severity === "critical" || critical ? "critical" : "warning";
      previous.signals = Array.from(new Set([...(previous.signals || []), ...signals])).slice(0, 8);
      previous.peakP95Ms = Math.max(Number(previous.peakP95Ms || 0), p95 || 0) || null;
      previous.peakP99Ms = Math.max(Number(previous.peakP99Ms || 0), p99 || 0) || null;
      previous.peakMaxFrameMs = Math.max(Number(previous.peakMaxFrameMs || 0), max || 0) || null;
      previous.minimumFps = previous.minimumFps === null || previous.minimumFps === undefined
        ? fps : (fps === null ? previous.minimumFps : Math.min(previous.minimumFps, fps));
      previous.lastPlayerPosition = sample.playerPosition || previous.lastPlayerPosition || null;
      previous.lastScene = sample.scene || previous.lastScene || null;
      previous.relatedLongTasks = Array.from(new Map(
        [...(previous.relatedLongTasks || []), ...relatedLongTasks].map(item => [item.capturedAt, item])
      ).values()).slice(-8);
      previous.relatedRuntimeErrors = Array.from(new Map(
        [...(previous.relatedRuntimeErrors || []), ...relatedRuntimeErrors].map(item => [item.capturedAt, item])
      ).values()).slice(-8);
      return;
    }
    anomalies.push({
      startedAt: capturedAt,
      lastSeenAt: capturedAt,
      severity,
      observations: 1,
      signals,
      targetFps,
      frameBudgetMs: frameBudgetMs === null ? null : Number(frameBudgetMs.toFixed(2)),
      peakP95Ms: p95,
      peakP99Ms: p99,
      peakMaxFrameMs: max,
      minimumFps: fps,
      cpu: sample.cpu || null,
      gpu: sample.gpu || null,
      sceneTimings: sample.sceneTimings || null,
      subsystems: sample.subsystems || null,
      waterDiagnostics: sample.waterDiagnostics || null,
      relatedLongTasks,
      relatedRuntimeErrors,
      playerPosition: sample.playerPosition || null,
      scene: sample.scene || null
    });
    if (anomalies.length > MAX_ANOMALIES_PER_SESSION) anomalies.shift();
  }

  function appendSample(sample) {
    if (!state.session || !sample) return;
    const previous = state.session.samples[state.session.samples.length - 1] || null;
    const currentDrawCalls = number(sample.scene && sample.scene.drawCalls);
    const previousDrawCalls = number(previous && previous.scene && previous.scene.drawCalls);
    const elapsedSeconds = previous && previous.capturedAt
      ? Math.max(0, (Date.parse(sample.capturedAt) - Date.parse(previous.capturedAt)) / 1000) : 0;
    if (currentDrawCalls !== null && previousDrawCalls !== null &&
        currentDrawCalls >= previousDrawCalls && elapsedSeconds > 0) {
      sample.scene.drawCallsObservedDelta = currentDrawCalls - previousDrawCalls;
      sample.scene.drawCallsCounterSemantics = "monotonic-across-sampled-observations-semantics-unverified";
    } else {
      sample.scene.drawCallsObservedDelta = null;
      sample.scene.drawCallsCounterSemantics = "raw-runtime-counter-unclassified";
    }
    sample.longTaskCountAtSample = Array.isArray(state.session.longTasks) ? state.session.longTasks.length : 0;
    state.session.samples.push(sample);
    state.session.sampleCount++;
    if (state.session.samples.length > MAX_SAMPLES_PER_SESSION) {
      state.session.samples.shift();
      state.session.truncatedSamples++;
    }
    state.session.lastUpdatedAt = sample.capturedAt;
    recordPerformanceAnomaly(sample);
  }

  function cancelQueuedIdleSample() {
    if (state.sampleHandle !== null && state.sampleHandle !== undefined) {
      try {
        if (state.sampleHandleKind === "idle" && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(state.sampleHandle);
        } else if (state.sampleHandleKind === "timeout") {
          window.clearTimeout(state.sampleHandle);
        }
      } catch (_) {}
    }
    state.sampleHandle = null;
    state.sampleHandleKind = null;
    state.sampleQueued = false;
  }

  function queueIdleSample() {
    if (!state.session || state.sampleQueued || document.visibilityState !== "visible") return;
    state.sampleQueued = true;
    const run = deadline => {
      state.sampleHandle = null;
      state.sampleHandleKind = null;
      state.sampleQueued = false;
      if (!state.session || document.visibilityState !== "visible") return;
      // Do not run a diagnostic read when Chrome has no idle budget available.
      if (deadline && !deadline.didTimeout &&
          typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 2) {
        queueIdleSample();
        return;
      }
      sampleAndAppend().catch(error => {
        if (state.session) state.session.storageError = text(error && error.message || error, 180);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      state.sampleHandleKind = "idle";
      state.sampleHandle = window.requestIdleCallback(run, { timeout: 1600 });
    } else {
      state.sampleHandleKind = "timeout";
      state.sampleHandle = window.setTimeout(() => run(null), 1000);
    }
  }

  async function sampleAndAppend() {
    if (!state.session) return;
    if (!document.body || !document.body.classList.contains("game-running")) {
      await finishSession("game-stopped");
      return;
    }
    const sample = readSample();
    if (!sample) return;
    appendSample(sample);
  }

  function persistSession() {
    if (!state.session || state.saving) return;
    saveSession();
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
    const frameMax = values(sample => sample.frameTiming && sample.frameTiming.maxMs);
    const world = values(sample => sample.cpu && sample.cpu.worldUpdateMs);
    const render = values(sample => sample.cpu && sample.cpu.renderCpuMs);
    const telemetryRead = values(sample => sample.diagnosticsReadMs);
    const heapUsedBytes = values(sample => sample.memory && sample.memory.usedJSHeapSizeBytes);
    const heapLimitBytes = values(sample => sample.memory && sample.memory.jsHeapLimitBytes);
    const drawCallsObservedDelta = values(sample => sample.scene && sample.scene.drawCallsObservedDelta);
    const longTasks = Array.isArray(session.longTasks) ? session.longTasks : [];
    const anomalies = Array.isArray(session.anomalies) ? session.anomalies : [];
    const runtimeErrors = Array.isArray(session.runtimeErrors) ? session.runtimeErrors : [];
    const criticalAnomalies = anomalies.filter(item => item && item.severity === "critical").length;
    const longTaskDurations = longTasks.map(item => number(item.durationMs)).filter(value => value !== null);
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
    const lightingGroup = night => {
      const selected = samples.filter(sample => sample.atmosphere &&
        Number.isFinite(Number(sample.atmosphere.night)) &&
        (Number(sample.atmosphere.night) >= 0.55) === night);
      const groupFps = selected.map(sample => number(sample.fps)).filter(value => value !== null);
      const groupP95 = selected.map(sample => number(sample.frameTiming && sample.frameTiming.p95Ms)).filter(value => value !== null);
      return {
        sampleCount: selected.length,
        fpsAverage: groupFps.length ? Number((groupFps.reduce((sum,value)=>sum+value,0)/groupFps.length).toFixed(2)) : null,
        fpsMinimum: groupFps.length ? Math.min(...groupFps) : null,
        p95MedianMs: percentile(groupP95,0.5),
        timeOfDayRange: selected.length ? {
          first: number(selected[0].atmosphere.timeOfDay),
          last: number(selected[selected.length-1].atmosphere.timeOfDay)
        } : null
      };
    };
    const lightingConditions = { day: lightingGroup(false), night: lightingGroup(true) };
    const dialogueSamples = samples.map(sample=>sample.npcDialogue).filter(Boolean);
    const latestDialogue = dialogueSamples.length ? dialogueSamples[dialogueSamples.length-1] : null;
    const dialogueSummary = {
      sampleCount: dialogueSamples.length,
      peopleObservedMaximum: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.worldPeopleCount)||0)) : null,
      nearbyMaximum: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.nearbyCount)||0)) : null,
      bubblesStarted: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.bubblesStarted)||0)) : null,
      projectionAttempts: dialogueSamples.reduce((sum,x)=>sum+(number(x.projectionAttempts)||0),0),
      projectionSuccesses: dialogueSamples.reduce((sum,x)=>sum+(number(x.projectionSuccesses)||0),0),
      latest: latestDialogue
    };
    const expectedSamples = session.startedAt && session.finishedAt
      ? Math.max(1, Math.floor((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / SAMPLE_INTERVAL_MS) + 1)
      : null;
    return {
      sampleCount: samples.length,
      durationSeconds: session.startedAt && session.finishedAt
        ? Math.max(0, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000)) : null,
      targetFps,
      fps: { minimum: fps.length ? Math.min(...fps) : null, average: fps.length ? Number((fps.reduce((sum, value) => sum + value, 0) / fps.length).toFixed(2)) : null, median: median(fps), p10: percentile(fps, .1) },
      lightingConditions,
      npcDialogue: dialogueSummary,
      frameTimeMs: {
        p95Median: median(p95),
        p99Median: median(p99),
        worstP95: p95.length ? Math.max(...p95) : null,
        worstP99: p99.length ? Math.max(...p99) : null,
        worstFrameMax: frameMax.length ? Math.max(...frameMax) : null
      },
      stutterIntervalsOver33ms: p95.filter(value => value > 33.33).length,
      stutterIntervalsOverBudget: p95.filter(value => value > 1000 / targetFps * 1.5).length,
      anomalyEvents: anomalies.length,
      criticalAnomalyEvents: criticalAnomalies,
      runtimeErrorCount: runtimeErrors.length,
      sampleIntervalMs: number(session.sampleIntervalMs),
      persistIntervalMs: number(session.persistIntervalMs),
      sampleCoverage: {
        recorded: samples.length,
        expected: expectedSamples,
        coverageRate: expectedSamples === null ? null : Number(Math.min(1, samples.length / expectedSamples).toFixed(3)),
        truncatedSamples: number(session.truncatedSamples) || 0
      },
      memory: {
        jsHeapUsedMedianMB: heapUsedBytes.length ? Number((percentile(heapUsedBytes, .5) / 1048576).toFixed(2)) : null,
        jsHeapUsedMaximumMB: heapUsedBytes.length ? Number((Math.max(...heapUsedBytes) / 1048576).toFixed(2)) : null,
        jsHeapLimitMB: heapLimitBytes.length ? Number((percentile(heapLimitBytes, .5) / 1048576).toFixed(2)) : null,
        measurementAvailable: heapUsedBytes.length > 0
      },
      cpu: { worldUpdateMedianMs: medianWorld, renderPreparationMedianMs: medianRender },
      gpu: { frameMedianMs: medianGpu, sceneRenderMedianMs: medianSceneRender },
      sceneTimings: { activeMeshesEvaluationMedianMs: medianActiveMeshes, renderTargetsMedianMs: medianRenderTargets },
      diagnostics: { medianReadMs: median(telemetryRead), maximumReadMs: telemetryRead.length ? Math.max(...telemetryRead) : null },
      sceneCounters: {
        drawCallsCounterSemantics: samples.find(sample => sample.scene && sample.scene.drawCallsCounterSemantics && sample.scene.drawCallsCounterSemantics !== "raw-runtime-counter-unclassified")?.scene.drawCallsCounterSemantics || "unclassified",
        drawCallsObservedDeltaMedian: median(drawCallsObservedDelta),
        drawCallsObservedDeltaMaximum: drawCallsObservedDelta.length ? Math.max(...drawCallsObservedDelta) : null
      },
      longTasks: {
        supported: session.longTaskObserverSupported === true,
        count: longTasks.length,
        totalDurationMs: Number(longTaskDurations.reduce((sum, value) => sum + value, 0).toFixed(2)),
        maximumDurationMs: longTaskDurations.length ? Math.max(...longTaskDurations) : null
      },
      deviceEvents: Array.isArray(session.deviceEvents) ? session.deviceEvents.length : 0,
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
      const meshInventory = snapshot && snapshot.meshes;
      const meshItems = Array.isArray(meshInventory && meshInventory.items) ? meshInventory.items : [];
      const largestMeshes = meshItems.filter(item => item && item.visible !== false && item.enabled !== false)
        .slice().sort((a, b) => (number(b.vertices) || 0) - (number(a.vertices) || 0)).slice(0, 120)
        .map(item => ({
          uniqueId: number(item.uniqueId), name: text(item.name, 120), id: text(item.id, 120),
          parent: text(item.parent, 120), material: text(item.material, 120),
          vertices: number(item.vertices), indices: number(item.indices),
          position: item.position || null, bounds: item.bounds || null,
          checkCollisions: item.checkCollisions === true,
          skeleton: item.skeleton || null
        }));
      const actors = snapshot && snapshot.actors || {};
      const compactActors = {};
      for (const key of ["player", "hostileVillageGuards", "campGuards", "companions", "wildlife", "ambientPeople", "ambientBirds", "enemyShipCrew"]) {
        const group = actors[key];
        if (!group) continue;
        compactActors[key] = Array.isArray(group.returned)
          ? { count: number(group.count), truncated: number(group.truncated), returned: group.returned.slice(0, 120) }
          : group;
      }
      const collisions = snapshot && snapshot.collisions;
      const textures = snapshot && snapshot.textures;
      return {
        schemaVersion: 1,
        capturedAt: snapshot && snapshot.capturedAt || new Date().toISOString(),
        source: snapshot && snapshot.source || "Babylon.js runtime",
        scene: snapshot && snapshot.scene || null,
        meshes: meshInventory ? {
          count: number(meshInventory.count), returned: number(meshInventory.returned),
          truncated: number(meshInventory.truncated), included: meshInventory.included === true,
          invalidTransformCount: number(meshInventory.invalidTransformCount),
          invalidTransforms: (meshInventory.invalidTransforms || []).slice(0, 100),
          largestVisibleMeshes: largestMeshes
        } : null,
        collisions: collisions ? {
          sceneCollisionsEnabled: collisions.sceneCollisionsEnabled === true,
          collisionEnabledMeshCount: number(collisions.collisionEnabledMeshCount),
          customColliderCount: number(collisions.customColliderCount),
          returned: number(collisions.returned), truncated: number(collisions.truncated),
          invalidPositionCount: number(collisions.invalidPositionCount),
          items: (collisions.items || []).slice(0, 500)
        } : null,
        actors: compactActors,
        animations: snapshot && snapshot.animations ? {
          count: number(snapshot.animations.count), playingCount: number(snapshot.animations.playingCount),
          items: (snapshot.animations.items || []).slice(0, 200)
        } : null,
        textures: textures ? {
          count: number(textures.count), pendingCount: number(textures.pendingCount),
          unknownReadinessCount: number(textures.unknownReadinessCount),
          items: (textures.items || []).slice(0, 200)
        } : null,
        terrainObjects: terrain ? {
          checkedCount: terrain.checkedCount,
          candidateCount: terrain.candidateCount,
          fullyBuriedCount: terrain.fullyBuriedCount,
          penetratingCount: terrain.penetratingCount,
          unmeasurableCount: terrain.unmeasurableCount,
          complete: terrain.complete,
          terrainHeightSource: terrain.terrainHeightSource,
          items: (terrain.items || []).slice(0, 200)
        } : null,
        structureAudit: snapshot && snapshot.structures && snapshot.structures.audit || null,
        structures: snapshot && snapshot.structures ? {
          registeredCount: number(snapshot.structures.registeredCount),
          registered: (snapshot.structures.registered || []).slice(0, 300)
        } : null,
        terrain: snapshot && snapshot.terrain || null,
        islands: snapshot && snapshot.islands || null,
        dataQuality: snapshot && snapshot.dataQuality || null
      };
    } catch (error) {
      return { error: text(error && error.message || error, 240), capturedAt: new Date().toISOString() };
    }
  }

  async function finishSession(reason) {
    if (state.sampleTimer) window.clearInterval(state.sampleTimer);
    if (state.persistTimer) window.clearInterval(state.persistTimer);
    state.sampleTimer = null;
    state.persistTimer = null;
    cancelQueuedIdleSample();
    if (!state.session) return;
    const current = state.session;
    current.finishedAt = new Date().toISOString();
    current.lastUpdatedAt = current.finishedAt;
    current.status = reason === "pagehide" ? "interrupted" : "completed";
    current.endReason = reason;
    if (reason !== "pagehide") current.finalWorldInspection = captureFinalWorldInspection();
    stopSessionDiagnostics();
    current.summary = buildSessionSummary(current);
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
      recordDeviceEvent("visibility-" + document.visibilityState);
      if (document.visibilityState === "visible") {
        monitorGameState();
        queueIdleSample();
      } else {
        cancelQueuedIdleSample();
        persistSession();
      }
    });
    window.addEventListener("error", handleRuntimeError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("blur", () => recordDeviceEvent("window-blur"));
    window.addEventListener("focus", () => {
      recordDeviceEvent("window-focus");
      queueIdleSample();
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