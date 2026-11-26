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
  const RECOVERY_STORAGE_KEY = "elsn-game-session-recovery-v1";
  const MAX_RECOVERY_SAMPLES = 360;
  const state = { db: null, opening: null, session: null, sampleTimer: null, persistTimer: null, monitorTimer: null, starting: false, saving: false, sampleQueued: false, sampleHandle: null, sampleHandleKind: null, persistQueued: false, persistHandle: null, persistHandleKind: null, longTaskObserver: null };

  function number(value) {
    if (value === null || value === undefined || typeof value === "boolean" || value === "") return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function text(value, limit) {
    return String(value == null ? "" : value).replace(/[\u0000-\u001F]/g, "").slice(0, limit);
  }

  function writeRecoverySnapshot(report) {
    if (!report || !report.sessionId) return false;
    try {
      const storage = window.localStorage;
      if (!storage) return false;
      const snapshot = typeof window.structuredClone === "function"
        ? window.structuredClone(report) : JSON.parse(JSON.stringify(report));
      const samples = Array.isArray(snapshot.samples) ? snapshot.samples : [];
      const originalSampleCount = Number(snapshot.sampleCount || samples.length);
      const keepOptions = Array.from(new Set([
        Math.min(MAX_RECOVERY_SAMPLES, samples.length),
        Math.min(180, samples.length),
        Math.min(90, samples.length),
        Math.min(30, samples.length),
        0
      ]));
      let lastError = null;
      for (const keepCount of keepOptions) {
        const omittedSamples = Math.max(0, samples.length - keepCount);
        snapshot.samples = keepCount ? samples.slice(-keepCount) : [];
        snapshot.recovery = {
          source: "pagehide-local-storage",
          capturedAt: new Date().toISOString(),
          originalSampleCount,
          retainedSampleCount: keepCount,
          sampleHistoryTruncated: omittedSamples
        };
        try {
          storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({
            schemaVersion: 1,
            savedAt: snapshot.recovery.capturedAt,
            report: snapshot
          }));
          return true;
        } catch (error) {
          lastError = error;
        }
      }
      report.recoveryStorageError = text(lastError && lastError.message || lastError || "No se pudo guardar una copia de emergencia.", 180);
      return false;
    } catch (error) {
      report.recoveryStorageError = text(error && error.message || error, 180);
      return false;
    }
  }

  function clearRecoverySnapshot(sessionId) {
    try {
      const raw = window.localStorage && window.localStorage.getItem(RECOVERY_STORAGE_KEY);
      if (!raw) return;
      const envelope = JSON.parse(raw);
      if (!sessionId || envelope && envelope.report && envelope.report.sessionId === sessionId) {
        window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
      }
    } catch (_) {}
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

  function captureStartupScriptLoads() {
    const entries = Array.isArray(window.__ELSN_RUNTIME_SCRIPT_LOADS) ? window.__ELSN_RUNTIME_SCRIPT_LOADS : [];
    return entries.slice(-16).map(entry => ({
      capturedAt: text(entry && entry.capturedAt, 40),
      url: safeResourcePath(entry && entry.url),
      label: text(entry && entry.label, 80),
      ok: !!(entry && entry.ok),
      source: text(entry && entry.source, 40),
      durationMs: number(entry && entry.durationMs),
      cacheStatus: entry && ["cached", "network", "unknown"].includes(entry.cacheStatus) ? entry.cacheStatus : "unknown",
      transferSize: number(entry && entry.transferSize),
      encodedBodySize: number(entry && entry.encodedBodySize),
      decodedBodySize: number(entry && entry.decodedBodySize),
      reason: text(entry && entry.reason, 180)
    }));
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
      clearRecoverySnapshot(current.sessionId);
      return true;
    } catch (error) {
      if (state.session === current) state.session.storageError = text(error && error.message || error, 180);
      return false;
    } finally {
      if (state.saving === job) state.saving = null;
    }
  }

  function cancelQueuedIdlePersist() {
    if (state.persistHandle !== null && state.persistHandle !== undefined) {
      try {
        if (state.persistHandleKind === "idle" && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(state.persistHandle);
        } else if (state.persistHandleKind === "timeout") {
          window.clearTimeout(state.persistHandle);
        }
      } catch (_) {}
    }
    state.persistHandle = null;
    state.persistHandleKind = null;
    state.persistQueued = false;
  }

  function queueIdlePersist() {
    if (!state.session || state.persistQueued || state.saving) return;
    state.persistQueued = true;
    const run = async deadline => {
      state.persistHandle = null;
      state.persistHandleKind = null;
      state.persistQueued = false;
      if (!state.session) return;
      if (deadline && !deadline.didTimeout &&
          typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 2) {
        queueIdlePersist();
        return;
      }
      try {
        // Database maintenance and report serialization stay outside the gameplay frame path.
        await openDatabase();
        if (!state.prunedForSession) {
          await pruneOldSessions();
          state.prunedForSession = true;
        }
        await saveSession();
      } catch (error) {
        if (state.session) state.session.storageError = text(error && error.message || error, 180);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      state.persistHandleKind = "idle";
      state.persistHandle = window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      state.persistHandleKind = "timeout";
      state.persistHandle = window.setTimeout(() => run(null), 2000);
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

  function readWaterDiagnostics(health) {
    if (typeof window.__elSinNombreWaterDebugSnapshot !== "function") return null;
    try {
      const source = typeof window.__elSinNombreWaterTelemetrySnapshot === "function"
        ? window.__elSinNombreWaterTelemetrySnapshot()
        : window.__elSinNombreWaterDebugSnapshot(health);
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
        const performanceSnapshot = typeof liveAtmosphere.getPerformanceSnapshot === "function"
          ? liveAtmosphere.getPerformanceSnapshot() : null;
        atmosphere = {
          timeOfDay: number(state.timeOfDay),
          night: number(state.night),
          daylight: number(state.daylight),
          twilight: number(state.twilight),
          weather: text(state.weather, 24),
          quality: text(state.quality, 24),
          shadowMode: text(state.shadowMode, 24),
          visualUpdateIntervalMs: number(state.visualUpdateIntervalMs),
          performance: performanceSnapshot
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
          disabledNearbyRootCount: number(state.disabledNearbyRootCount),
          recoveredNearbyRootCount: number(state.recoveredNearbyRootCount),
          invalidSceneRootCount: number(state.invalidSceneRootCount),
          overlayAnchorCount: number(state.overlayAnchorCount),
          overlayAnchorDiagnostics: state.overlayAnchorDiagnostics && typeof state.overlayAnchorDiagnostics === "object" ? state.overlayAnchorDiagnostics : null,
          lastAttachment: state.lastAttachment && typeof state.lastAttachment === "object" ? state.lastAttachment : null,
          bubblesStarted: number(state.bubblesStarted),
          projectionAttempts: number(state.projectionAttempts),
          projectionSuccesses: number(state.projectionSuccesses),
          renderedBubbleCount: number(state.renderedBubbleCount),
          activeBubbleCount: number(state.activeBubbleCount),
          positioningSamples: number(state.positioningSamples),
          positioningP50Ms: number(state.positioningP50Ms),
          positioningP95Ms: number(state.positioningP95Ms),
          positioningP99Ms: number(state.positioningP99Ms),
          lastPositioningMs: number(state.lastPositioningMs),
          maxPositioningMs: number(state.maxPositioningMs),
          lastError: text(state.lastError, 220),
          projectionFailures: state.projectionFailures && typeof state.projectionFailures === "object"
            ? Object.fromEntries(Object.entries(state.projectionFailures).slice(0, 12).map(([key,value])=>[text(key,64),number(value)]))
            : {}
        };
      }
    } catch (_) {}
    let wildlife = null;
    try {
      const wildlifeRuntime = window.__ELSN_WILDLIFE_DIAGNOSTICS__;
      if (wildlifeRuntime && typeof wildlifeRuntime.getSnapshot === "function") {
        const state = wildlifeRuntime.getSnapshot();
        wildlife = {
          samples: number(state.samples),
          ticks: number(state.ticks),
          lastMs: number(state.lastMs),
          p50Ms: number(state.p50Ms),
          p95Ms: number(state.p95Ms),
          p99Ms: number(state.p99Ms),
          maxMs: number(state.maxMs),
          requested: number(state.requested),
          loaded: number(state.loaded),
          complete: state.complete === true,
          byKind: state.byKind && typeof state.byKind === "object" ? state.byKind : {},
          readiness: Array.isArray(state.readiness) ? state.readiness.slice(-6).map(item => ({
            kind: text(item.kind, 24),
            state: text(item.state, 20),
            island: number(item.island),
            meshes: number(item.meshes),
            skinnedVertices: number(item.skinnedVertices),
            skinningMode: text(item.skinningMode, 12),
            bones: number(item.bones),
            textures: number(item.textures),
            textureWaitMs: number(item.textureWaitMs),
            error: text(item.error, 180)
          })) : []
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
        preWorldMaintenanceMs: number(runtime.preWorldMaintenanceMs),
        preWorldMaintenanceTimings: runtime.preWorldMaintenanceTimings && typeof runtime.preWorldMaintenanceTimings === "object" ? runtime.preWorldMaintenanceTimings : null,
        worldUpdateMs: number(runtime.worldUpdateMs),
        renderCpuMs: number(runtime.renderCpuMs)
      },
      gpu: {
        frameMs: number(runtime.engineGpuFrameMs),
        sceneRenderMs: number(runtime.sceneRenderMs),
        timerQueryStatus: text(runtime.gpuTimerQueryStatus, 48),
        timerQueryExtension: text(runtime.gpuTimerQueryExtension, 48),
        timerQuerySupported: runtime.gpuTimerQueryStatus === "supported",
        sceneRenderMeasurement: "CPU-side Babylon instrumentation; not GPU elapsed time",
        detailedProfileEnabled: runtime.profileDiagnosticsEnabled === true,
        device: runtime.gpuDeviceTelemetry && typeof runtime.gpuDeviceTelemetry === "object" ? runtime.gpuDeviceTelemetry : null,
        renderPipeline: runtime.renderPipelineDiagnostics && typeof runtime.renderPipelineDiagnostics === "object" ? runtime.renderPipelineDiagnostics : null,
        contextLifecycle: runtime.gpuContextLifecycle && typeof runtime.gpuContextLifecycle === "object" ? runtime.gpuContextLifecycle : null
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
        meshSelectionDynamicFilterTotalCandidates: number(runtime.meshSelectionDynamicFilterTotalCandidates),
        meshSelectionDynamicFilterTotalCulled: number(runtime.meshSelectionDynamicFilterTotalCulled),
        meshSelectionDynamicFilterTotalMs: number(runtime.meshSelectionDynamicFilterTotalMs),
        meshSelectionDynamicFilterAverageMs: number(runtime.meshSelectionDynamicFilterAverageMs),
        meshSelectionDynamicFilterCullRatio: number(runtime.meshSelectionDynamicFilterCullRatio),
        meshSelectionDynamicFilterLastMs: number(runtime.meshSelectionDynamicFilterLastMs),
        meshSelectionDynamicFilterMaxMs: number(runtime.meshSelectionDynamicFilterMaxMs),
        meshSelectionDynamicFilterErrors: number(runtime.meshSelectionDynamicFilterErrors),
        meshSelectionBuildMs: number(runtime.meshSelectionBuildMs),
        meshSelectionStaticWorldMatrixFreezeMs: number(runtime.meshSelectionStaticWorldMatrixFreezeMs),
        meshSelectionStaticWorldMatricesFrozen: number(runtime.meshSelectionStaticWorldMatricesFrozen),
        meshSelectionStaticWorldMatrixFreezeErrors: number(runtime.meshSelectionStaticWorldMatrixFreezeErrors),
        meshSelectionStaticWorldMatrixFreezeSkipped: number(runtime.meshSelectionStaticWorldMatrixFreezeSkipped)
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
        activeWorldShadowCasters: number(runtime.activeWorldShadowCasters),
        mapDrawMs: number(runtime.mapDrawMs),
        mapDrawMaxMs: number(runtime.mapDrawMaxMs),
        mapDrawSampleCount: number(runtime.mapDrawSampleCount),
        habitableAuditMs: number(runtime.habitableAuditMs),
        habitableAuditMaxMs: number(runtime.habitableAuditMaxMs),
        habitableAuditCount: number(runtime.habitableAuditCount),
        habitableAuditLastCacheHits: number(runtime.habitableAuditLastCacheHits),
        habitableAuditLastCacheMisses: number(runtime.habitableAuditLastCacheMisses),
        worldPhaseTimings: runtime.worldPhaseTimings && typeof runtime.worldPhaseTimings === "object" ? runtime.worldPhaseTimings : null,
        atmosphereVisualUpdateCpu: atmosphere && atmosphere.performance ? atmosphere.performance.visualUpdate : null,
        atmosphereDirectLightingCpu: atmosphere && atmosphere.performance ? atmosphere.performance.directLighting : null,
        atmosphereSkyCloudCpu: atmosphere && atmosphere.performance ? atmosphere.performance.skyAndCloudUniforms : null,
        atmosphereWaterMaterialCpu: atmosphere && atmosphere.performance ? atmosphere.performance.waterMaterial : null,
        atmospherePostProcessingCpu: atmosphere && atmosphere.performance ? atmosphere.performance.postProcessing : null,
        atmosphereHearthSelectionCpu: atmosphere && atmosphere.performance ? atmosphere.performance.hearthSelection : null,
        npcDialoguePositioningCpu: npcDialogue ? {
          samples: npcDialogue.positioningSamples,
          p50Ms: npcDialogue.positioningP50Ms,
          p95Ms: npcDialogue.positioningP95Ms,
          p99Ms: npcDialogue.positioningP99Ms,
          maxMs: npcDialogue.maxPositioningMs
        } : null,
        wildlifeUpdateCpu: wildlife ? {
          samples: wildlife.samples,
          p50Ms: wildlife.p50Ms,
          p95Ms: wildlife.p95Ms,
          p99Ms: wildlife.p99Ms,
          maxMs: wildlife.maxMs
        } : null
      },
      atmosphere,
      npcDialogue,
      wildlife,
      playerPosition: readPlayerLocation(health),
      waterDiagnostics: readWaterDiagnostics(health)
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
      const build = document.querySelector('meta[name="el-sin-nombre-build"]');
      state.prunedForSession = false;
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
        startupScriptLoads: captureStartupScriptLoads(),
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
      // Start collecting immediately. IndexedDB opening, pruning and serialization are idle work.
      state.sampleTimer = window.setInterval(queueIdleSample, SAMPLE_INTERVAL_MS);
      state.persistTimer = window.setInterval(persistSession, PERSIST_INTERVAL_MS);
      window.__ELSN_SESSION_RECORDER_STATUS__ = {
        active: true,
        sessionId: state.session.sessionId,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        persistIntervalMs: PERSIST_INTERVAL_MS,
        persistenceMode: "idle"
      };
      queueIdlePersist();
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
    queueIdlePersist();
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
    const preWorldMaintenance = values(sample => sample.cpu && sample.cpu.preWorldMaintenanceMs);
    const world = values(sample => sample.cpu && sample.cpu.worldUpdateMs);
    const render = values(sample => sample.cpu && sample.cpu.renderCpuMs);
    const telemetryRead = values(sample => sample.diagnosticsReadMs);
    const heapUsedBytes = values(sample => sample.memory && sample.memory.usedJSHeapSizeBytes);
    const heapLimitBytes = values(sample => sample.memory && sample.memory.jsHeapLimitBytes);
    const drawCallsObservedDelta = values(sample => sample.scene && sample.scene.drawCallsObservedDelta);
    const longTasks = Array.isArray(session.longTasks) ? session.longTasks : [];
    const anomalies = Array.isArray(session.anomalies) ? session.anomalies : [];
    const runtimeErrors = Array.isArray(session.runtimeErrors) ? session.runtimeErrors : [];
    const startupScriptLoads = Array.isArray(session.startupScriptLoads) ? session.startupScriptLoads : [];
    const startupScriptLoadSummary = {
      count: startupScriptLoads.length,
      failed: startupScriptLoads.filter(item => item && item.ok === false).length,
      cached: startupScriptLoads.filter(item => item && item.cacheStatus === "cached").length,
      network: startupScriptLoads.filter(item => item && item.cacheStatus === "network").length,
      unknown: startupScriptLoads.filter(item => !item || item.cacheStatus === "unknown").length,
      totalDurationMs: Number(startupScriptLoads.reduce((sum, item) => sum + (number(item && item.durationMs) || 0), 0).toFixed(1)),
      slowest: startupScriptLoads.slice().sort((a, b) => (number(b && b.durationMs) || 0) - (number(a && a.durationMs) || 0)).slice(0, 5)
        .map(item => ({
          label: text(item && item.label, 80),
          url: item && item.url || null,
          ok: !!(item && item.ok),
          durationMs: number(item && item.durationMs),
          cacheStatus: item && item.cacheStatus || "unknown",
          transferSize: number(item && item.transferSize),
          reason: text(item && item.reason, 180)
        }))
    };
    const criticalAnomalies = anomalies.filter(item => item && item.severity === "critical").length;
    const longTaskDurations = longTasks.map(item => number(item.durationMs)).filter(value => value !== null);
    const gpu = values(sample => sample.gpu && sample.gpu.frameMs);
    const sceneRender = values(sample => sample.gpu && sample.gpu.sceneRenderMs);
    const gpuStatusSamples = samples.map(sample => sample.gpu && sample.gpu.timerQueryStatus).filter(Boolean);
    const latestGpuSample = samples.slice().reverse().find(sample => sample && sample.gpu) || null;
    const latestGpuDevice = latestGpuSample && latestGpuSample.gpu && latestGpuSample.gpu.device || null;
    const gpuTimerQueryStatus = gpuStatusSamples.length ? gpuStatusSamples[gpuStatusSamples.length-1] : "not-recorded";
    const activeMeshes = values(sample => sample.sceneTimings && sample.sceneTimings.activeMeshesEvaluationMs);
    const renderTargets = values(sample => sample.sceneTimings && sample.sceneTimings.renderTargetsMs);
    const median = list => percentile(list, .5);
    const medianWorld = median(world), medianRender = median(render), medianGpu = median(gpu);
    const medianSceneRender = median(sceneRender), medianActiveMeshes = median(activeMeshes), medianRenderTargets = median(renderTargets);
    const stages = [
      { name: "mantenimiento-pre-mundo", value: median(preWorldMaintenance), source: "CPU JavaScript (gaviotas, enemigos y overlays NPC)" },
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
    const cumulativeCounterDelta = (rows, key) => {
      let previous = null, total = 0;
      for (const row of rows) {
        const current = number(row && row[key]);
        if (current === null) continue;
        total += previous === null ? current : (current >= previous ? current - previous : current);
        previous = current;
      }
      return total;
    };
    const dialogueSummary = {
      sampleCount: dialogueSamples.length,
      peopleObservedMaximum: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.worldPeopleCount)||0)) : null,
      nearbyMaximum: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.nearbyCount)||0)) : null,
      bubblesStarted: dialogueSamples.length ? Math.max(...dialogueSamples.map(x=>number(x.bubblesStarted)||0)) : null,
      projectionAttempts: latestDialogue ? number(latestDialogue.projectionAttempts) : null,
      projectionSuccesses: latestDialogue ? number(latestDialogue.projectionSuccesses) : null,
      projectionAttemptsDelta: cumulativeCounterDelta(dialogueSamples, "projectionAttempts"),
      projectionSuccessesDelta: cumulativeCounterDelta(dialogueSamples, "projectionSuccesses"),
      latest: latestDialogue
    };
    const latestPhaseSample = samples.slice().reverse().find(sample =>
      sample && sample.subsystems && sample.subsystems.worldPhaseTimings &&
      typeof sample.subsystems.worldPhaseTimings === "object");
    const worldPhaseHotspots = Object.entries(latestPhaseSample?.subsystems?.worldPhaseTimings || {})
      .map(([phase, timing]) => ({
        phase,
        samples: number(timing && timing.samples),
        lastMs: number(timing && timing.lastMs),
        meanMs: number(timing && timing.meanMs),
        p95Ms: number(timing && timing.p95Ms),
        p99Ms: number(timing && timing.p99Ms),
        maxMs: number(timing && timing.maxMs)
      }))
      .sort((a, b) => (b.maxMs || 0) - (a.maxMs || 0))
      .slice(0, 12);
    const expectedSamples = session.startedAt && session.finishedAt
      ? Math.max(1, Math.floor((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / SAMPLE_INTERVAL_MS) + 1)
      : null;
    const frameBudgetMs = targetFps > 0 ? 1000 / targetFps : null;
    // Conservative CPU/GPU attribution: compare independent P95 measurements against the frame budget.
    // CPU world and render timings are kept separate because they may overlap with browser scheduling.
    const cpuPreWorldP95Ms = percentile(preWorldMaintenance, .95);
    const cpuWorldP95Ms = percentile(world, .95);
    const cpuRenderP95Ms = percentile(render, .95);
    const cpuCriticalP95Ms = [cpuPreWorldP95Ms, cpuWorldP95Ms, cpuRenderP95Ms].filter(value => value !== null).reduce((max, value) => Math.max(max, value), 0);
    const gpuP95Ms = percentile(gpu, .95);
    const frameP95Ms = percentile(p95, .95);
    const attributionThresholdMs = frameBudgetMs === null ? null : frameBudgetMs * .65;
    const cpuHigh = attributionThresholdMs !== null && cpuCriticalP95Ms >= attributionThresholdMs;
    const gpuHigh = attributionThresholdMs !== null && gpuP95Ms !== null && gpuP95Ms >= attributionThresholdMs;
    let cpuGpuVerdict = "no-concluyente";
    let cpuGpuReason = "Las muestras no aíslan un cuello de botella dominante con suficiente evidencia.";
    if (gpu.length < 3) {
      if (cpuHigh) {
        cpuGpuVerdict = "cpu-probable";
        cpuGpuReason = "La carga medida de CPU es alta, pero faltan consultas GPU válidas para descartar un límite gráfico simultáneo.";
      } else {
        cpuGpuReason = "No hay suficientes consultas de temporización GPU válidas; no se puede distinguir con seguridad CPU de GPU.";
      }
    } else if (cpuHigh && gpuHigh) {
      cpuGpuVerdict = "mixto";
      cpuGpuReason = "CPU y GPU superan el umbral de coste relativo al presupuesto de fotograma; pueden contribuir ambas.";
    } else if (gpuHigh && (cpuCriticalP95Ms === 0 || gpuP95Ms >= cpuCriticalP95Ms * 1.20)) {
      cpuGpuVerdict = "gpu-probable";
      cpuGpuReason = "El tiempo de GPU P95 es elevado y supera claramente el coste CPU P95 medido.";
    } else if (cpuHigh && (gpuP95Ms === null || cpuCriticalP95Ms >= gpuP95Ms * 1.20)) {
      cpuGpuVerdict = "cpu-probable";
      cpuGpuReason = "El coste CPU P95 supera claramente el tiempo GPU P95 medido.";
    } else if (frameP95Ms !== null && frameBudgetMs !== null && frameP95Ms > frameBudgetMs * 1.20) {
      cpuGpuReason = "Hay fotogramas lentos, pero CPU y GPU no muestran una diferencia suficientemente clara.";
    } else {
      cpuGpuVerdict = "sin-cuello-dominante";
      cpuGpuReason = "Las mediciones disponibles no muestran CPU o GPU claramente por encima del umbral.";
    }
    const cpuGpuDiagnosis = {
      verdict: cpuGpuVerdict,
      explanation: cpuGpuReason,
      frameBudgetMs: frameBudgetMs === null ? null : Number(frameBudgetMs.toFixed(2)),
      frameP95Ms,
      cpuPreWorldP95Ms,
      cpuWorldP95Ms,
      cpuRenderP95Ms,
      cpuCriticalP95Ms: Number(cpuCriticalP95Ms.toFixed(2)),
      gpuP95Ms,
      gpuSampleCount: gpu.length,
      cpuSampleCount: Math.max(preWorldMaintenance.length, world.length, render.length),
      thresholdMs: attributionThresholdMs === null ? null : Number(attributionThresholdMs.toFixed(2)),
      confidence: gpu.length >= 12 && samples.length >= 12 ? "media" : "baja",
      method: "Comparación heurística de percentiles P95; CPU y GPU se miden por separado y no se suman."
    };
    const coverageRate = expectedSamples === null ? null : Math.min(1, samples.length / expectedSamples);
    const averageFps = fps.length ? fps.reduce((sum, value) => sum + value, 0) / fps.length : null;
    const medianP95 = median(p95);
    const phaseLabel = phase => {
      const key = String(phase || "").toLowerCase().replace(/[_\\s]+/g, "-");
      if (/gullflight/.test(key)) return "Vuelo de gaviotas";
      if (phase === "enemyVisualRecovery" || /enemyvisualrecovery/.test(key)) return "Recuperación visual de enemigos";
      if (/npcoverlaymaintenance/.test(key)) return "Anclajes y recuperación visual de NPC";
      if (/npc|dialog|actor|villager|character|ai/.test(key)) return "Personajes e inteligencia";
      if (/path|nav|movement|locomotion/.test(key)) return "Movimiento y navegación";
      if (/phys|collision/.test(key)) return "Físicas y colisiones";
      if (/water|shore|coast|wave|splash/.test(key)) return "Agua y costa";
      if (/grass|veget|foliage|tree/.test(key)) return "Hierba y vegetación";
      if (/shadow|light|atmosphere|sun/.test(key)) return "Iluminación y sombras";
      if (/map|radar/.test(key)) return "Minimapa y mapa";
      if (/structure|habitable|building|audit/.test(key)) return "Construcciones y terreno";
      if (/anim/.test(key)) return "Animaciones";
      if (/render|mesh|scene|camera/.test(key)) return "Preparación de gráficos";
      if (/terrain|island|ground|world/.test(key)) return "Terreno y mundo";
      return "Otras tareas del mundo";
    };
    const worldPhaseCosts = Object.entries(latestPhaseSample?.subsystems?.worldPhaseTimings || {})
      .map(([phase, timing]) => ({
        id: phase,
        label: phaseLabel(phase),
        source: "Fase del mundo",
        samples: number(timing && timing.samples),
        lastMs: number(timing && timing.lastMs),
        meanMs: number(timing && timing.meanMs),
        p95Ms: number(timing && timing.p95Ms),
        p99Ms: number(timing && timing.p99Ms),
        maxMs: number(timing && timing.maxMs)
      }));
    const latestMaintenanceSample = samples.slice().reverse().find(sample =>
      sample && sample.cpu && sample.cpu.preWorldMaintenanceTimings &&
      typeof sample.cpu.preWorldMaintenanceTimings === "object");
    const maintenancePhaseCosts = Object.entries(latestMaintenanceSample?.cpu?.preWorldMaintenanceTimings || {})
      .filter(([phase]) => phase !== "total")
      .map(([phase, timing]) => ({
        id: "maintenance:" + phase,
        label: phaseLabel(phase),
        source: "Mantenimiento previo al mundo",
        samples: number(timing && timing.samples),
        lastMs: number(timing && timing.lastMs),
        meanMs: number(timing && timing.meanMs),
        p95Ms: number(timing && timing.p95Ms),
        p99Ms: number(timing && timing.p99Ms),
        maxMs: number(timing && timing.maxMs)
      }));
    const phaseCosts = [...worldPhaseCosts, ...maintenancePhaseCosts]
      .filter(item => item.meanMs !== null || item.lastMs !== null || item.maxMs !== null)
      .sort((a, b) => (b.meanMs || b.maxMs || 0) - (a.meanMs || a.maxMs || 0));
    const gpuProfilerEnabled = samples.some(sample => sample.gpu && sample.gpu.timerQueryStatus === "supported" && sample.gpu.frameMs !== null);
    const stageRows = [
      { id: "world-update", label: "Actualización del mundo", source: "CPU del juego", list: world },
      { id: "render-preparation", label: "Preparación de gráficos", source: "CPU del motor", list: render },
      { id: "gpu-frame", label: "Procesamiento gráfico", source: "GPU medida", list: gpu, available: gpuProfilerEnabled },
      { id: "scene-render", label: "Dibujo de la escena", source: "Motor gráfico", list: sceneRender },
      { id: "active-meshes", label: "Selección de objetos visibles", source: "Motor gráfico", list: activeMeshes },
      { id: "render-targets", label: "Reflejos y superficies", source: "Motor gráfico", list: renderTargets },
      { id: "water-update", label: "Actualización del agua", source: "Subsistema de agua", list: values(sample => sample.subsystems && sample.subsystems.waterUpdateMs) },
      { id: "map-draw", label: "Dibujo del minimapa", source: "Interfaz del juego", list: values(sample => sample.subsystems && sample.subsystems.mapDrawMs) },
      { id: "structure-audit", label: "Revisión de construcciones", source: "Auditoría del mundo", list: values(sample => sample.subsystems && sample.subsystems.habitableAuditMs) }
    ].filter(item => item.available !== false)
      .map(item => {
        const measured = item.list.filter(value => value !== null && Number.isFinite(value));
        const medianMs = median(measured);
        return {
          id: item.id, label: item.label, source: item.source,
          medianMs, maximumMs: measured.length ? Math.max(...measured) : null,
          sampleCount: measured.length,
          budgetSharePercent: frameBudgetMs && medianMs !== null
            ? Number((medianMs / frameBudgetMs * 100).toFixed(1)) : null
        };
      })
      .filter(item => item.medianMs !== null);
    for (const phase of phaseCosts) {
      if (phase.meanMs === null || phase.meanMs <= 0) continue;
      stageRows.push({
        id: "phase:" + phase.id,
        label: phase.label,
        source: "Fase interna · " + phase.id,
        medianMs: phase.meanMs,
        maximumMs: phase.maxMs,
        sampleCount: phase.samples,
        budgetSharePercent: frameBudgetMs
          ? Number((phase.meanMs / frameBudgetMs * 100).toFixed(1)) : null
      });
    }
    const rankedStages = stageRows.sort((a, b) => b.medianMs - a.medianMs).slice(0, 12);
    const hasFrameDrops = (medianP95 !== null && frameBudgetMs !== null && medianP95 > frameBudgetMs * 1.2) ||
      (averageFps !== null && averageFps < targetFps * 0.8) || anomalies.length > 0;
    const leadingStage = rankedStages.find(item => frameBudgetMs === null || item.medianMs >= frameBudgetMs * 0.12) || null;
    const primaryBottleneck = hasFrameDrops && leadingStage ? {
      id: leadingStage.id,
      label: leadingStage.label,
      source: leadingStage.source,
      medianMs: leadingStage.medianMs,
      maximumMs: leadingStage.maximumMs,
      sampleCount: leadingStage.sampleCount,
      budgetSharePercent: leadingStage.budgetSharePercent,
      confidence: samples.length >= 12 && coverageRate !== null && coverageRate >= 0.55 ? "media" : "baja",
      explanation: "Es la parte con mayor tiempo medido. Es una pista para investigar, no una prueba aislada de causalidad."
    } : null;
    const worstMoments = samples.map((sample, index) => {
      const timing = sample && sample.frameTiming || {};
      const p95Ms = number(timing.p95Ms), p99Ms = number(timing.p99Ms), maxMs = number(timing.maxMs);
      const sampleFps = number(sample && sample.fps);
      const score = Math.max(
        p95Ms !== null && frameBudgetMs ? p95Ms / frameBudgetMs : 0,
        p99Ms !== null && frameBudgetMs ? p99Ms / frameBudgetMs * 0.85 : 0,
        maxMs !== null && frameBudgetMs ? maxMs / frameBudgetMs * 0.35 : 0,
        sampleFps !== null && sampleFps > 0 ? targetFps / sampleFps * 0.85 : 0
      );
      const phaseRows = Object.entries(sample && sample.subsystems && sample.subsystems.worldPhaseTimings || {})
        .map(([id, value]) => ({ id, label: phaseLabel(id), lastMs: number(value && value.lastMs), maxMs: number(value && value.maxMs) }))
        .filter(item => item.lastMs !== null || item.maxMs !== null)
        .sort((a, b) => (b.lastMs || b.maxMs || 0) - (a.lastMs || a.maxMs || 0));
      return {
        index, capturedAt: sample && sample.capturedAt || null,
        fps: sampleFps, p95Ms, p99Ms, maxFrameMs: maxMs,
        score: Number(score.toFixed(3)),
        cpu: sample && sample.cpu || null,
        gpu: sample && sample.gpu || null,
        topPhase: phaseRows[0] || null,
        location: sample && sample.playerPosition || null,
        lighting: sample && sample.atmosphere
          ? (number(sample.atmosphere.night) !== null && number(sample.atmosphere.night) >= 0.55 ? "Noche" : "Día")
          : null
      };
    }).filter(item => item.score >= 1.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ index, ...item }) => item);
    const startTime = Date.parse(session.startedAt || "");
    const inGameLongTasks = longTasks.filter(item => {
      const at = Date.parse(item && item.capturedAt || "");
      return Number.isFinite(at) && (!Number.isFinite(startTime) || at >= startTime);
    }).sort((a, b) => (number(b.durationMs) || 0) - (number(a.durationMs) || 0));
    const topLongTasks = inGameLongTasks.slice(0, 8).map(item => ({
      capturedAt: item.capturedAt || null,
      durationMs: number(item.durationMs),
      attribution: Array.isArray(item.attribution) ? item.attribution.slice(0, 3) : []
    }));
    const errorEvidence = runtimeErrors.slice(-12).map(item => ({
      capturedAt: item.capturedAt || null,
      kind: item.kind || "error",
      message: item.message || "Error sin descripción",
      resourcePath: item.resourcePath || null,
      source: item.source || null,
      line: number(item.line),
      column: number(item.column)
    }));
    const anomalyEvidence = anomalies.slice().sort((a, b) =>
      (number(b.peakP95Ms) || 0) - (number(a.peakP95Ms) || 0)
    ).slice(0, 8).map(item => ({
      startedAt: item.startedAt || null,
      lastSeenAt: item.lastSeenAt || null,
      severity: item.severity || "warning",
      observations: number(item.observations) || 1,
      minimumFps: number(item.minimumFps),
      peakP95Ms: number(item.peakP95Ms),
      peakP99Ms: number(item.peakP99Ms),
      signals: Array.isArray(item.signals) ? item.signals.slice(0, 8) : [],
      playerPosition: item.lastPlayerPosition || item.playerPosition || null,
      relatedLongTasks: Array.isArray(item.relatedLongTasks) ? item.relatedLongTasks.slice(0, 4) : [],
      relatedRuntimeErrors: Array.isArray(item.relatedRuntimeErrors) ? item.relatedRuntimeErrors.slice(0, 4) : []
    }));
    const enoughData = samples.length >= 5 && medianP95 !== null;
    const performanceStatus = !enoughData ? "insufficient-data" :
      hasFrameDrops ? "needs-attention" : "no-major-drop-observed";
    const firstAction = primaryBottleneck
      ? "Revisar «" + primaryBottleneck.label + "» en el mismo tramo de juego, sin bajar la calidad gráfica ni desactivar sistemas."
      : hasFrameDrops && !gpuProfilerEnabled
        ? "Repetir la misma ruta con la medición opcional de GPU para separar el coste del motor y el de la tarjeta gráfica."
        : hasFrameDrops
          ? "Repetir la misma ruta y comparar sus momentos más lentos con las fases internas del mundo."
          : enoughData
            ? "No hay una corrección urgente demostrada por estas lecturas. Mantén esta partida como referencia para comparar cambios."
            : "Jugar una sesión completa y visible para reunir más muestras antes de sacar conclusiones.";
    const diagnosisHeadline = !enoughData ? "Faltan datos para localizar la causa" :
      !hasFrameDrops ? "No se observa una caída importante en esta partida" :
      primaryBottleneck ? "Principal pista: " + primaryBottleneck.label :
        "Se detectan tirones, pero falta evidencia para atribuirlos";
    const diagnosisLimitations = [];
    if (!gpuProfilerEnabled || !gpu.length) diagnosisLimitations.push("No hay una medición válida de GPU; no se puede descartar que el límite esté en la tarjeta gráfica.");
    if (!phaseCosts.length) diagnosisLimitations.push("No se recogió el desglose de las fases internas del mundo.");
    if (coverageRate !== null && coverageRate < 0.7) diagnosisLimitations.push("La partida tiene huecos en las lecturas; algunas caídas pudieron quedar fuera.");
    if (!session.longTaskObserverSupported) diagnosisLimitations.push("Este navegador no ofreció el registro de tareas largas.");
    const performanceDiagnosis = {
      schemaVersion: 1,
      status: performanceStatus,
      headline: diagnosisHeadline,
      explanation: !enoughData
        ? "El informe conserva sus mediciones, pero no hay suficientes ventanas válidas para localizar el origen de los tirones."
        : hasFrameDrops
          ? "Se han encontrado tramos por encima del tiempo disponible para mantener " + Math.round(targetFps) + " FPS. La clasificación de abajo ordena las pistas por tiempo medido; no demuestra por sí sola la causa."
          : "Las lecturas disponibles no muestran una caída importante del ritmo de fotogramas. Esto no descarta defectos visuales, físicos o de funcionamiento.",
      targetFps,
      frameBudgetMs: frameBudgetMs === null ? null : Number(frameBudgetMs.toFixed(2)),
      sampleCount: samples.length,
      coverageRate: coverageRate === null ? null : Number(coverageRate.toFixed(3)),
      confidence: samples.length >= 12 && coverageRate !== null && coverageRate >= 0.55 ? "media" : "baja",
      primaryBottleneck,
      cpuGpuDiagnosis,
      rankedStages,
      phaseCosts,
      worstMoments,
      longTasks: {
        supported: session.longTaskObserverSupported === true,
        count: inGameLongTasks.length,
        maximumMs: inGameLongTasks.length ? Math.max(...inGameLongTasks.map(item => number(item.durationMs) || 0)) : null,
        top: topLongTasks
      },
      runtimeErrors: { count: runtimeErrors.length, recent: errorEvidence },
      anomalies: { count: anomalies.length, criticalCount: criticalAnomalies, worst: anomalyEvidence },
      firstAction,
      limitations: diagnosisLimitations,
      interpretationNote: "Los tiempos de CPU y de cada subsistema pueden solaparse; no deben sumarse. La CPU muestra duración de tareas, no el porcentaje total del procesador. Los datos ausentes no equivalen a cero."
    };
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
      worldPhaseHotspots,
      performanceDiagnosis,
      optimizerPerformance: (() => {
        const latest = latestPhaseSample || {};
        const subs = latest.subsystems || {};
        const scene = latest.scene || {};
        const atm = latest.atmosphere && latest.atmosphere.performance || {};
        const fauna = latest.wildlife || {};
        const dialogue = latest.npcDialogue || {};
        const metric = value => value && typeof value === "object" ? {
          samples: number(value.samples), lastMs: number(value.lastMs),
          p50Ms: number(value.p50Ms), p95Ms: number(value.p95Ms),
          p99Ms: number(value.p99Ms), maxMs: number(value.maxMs)
        } : null;
        return {
          spatialSelection: {
            enabled: scene.meshSelectionOctreeEnabled === true,
            buildMs: number(scene.meshSelectionBuildMs),
            staticWorldMatricesFrozen: number(scene.meshSelectionStaticWorldMatricesFrozen),
            staticWorldMatrixFreezeErrors: number(scene.meshSelectionStaticWorldMatrixFreezeErrors),
            staticWorldMatrixFreezeSkipped: number(scene.meshSelectionStaticWorldMatrixFreezeSkipped),
            dynamicFilterAverageMs: number(scene.meshSelectionDynamicFilterAverageMs),
            dynamicFilterMaxMs: number(scene.meshSelectionDynamicFilterMaxMs),
            candidates: number(scene.meshSelectionDynamicFilterCandidates),
            selected: number(scene.meshSelectionDynamicFilterSelected),
            culled: number(scene.meshSelectionDynamicFilterCulled),
            cullRatio: number(scene.meshSelectionDynamicFilterCullRatio)
          },
          waterAndReflections: {
            updateMs: number(subs.waterUpdateMs), normalMs: number(subs.waterNormalMs),
            reflectionMeshes: number(subs.waterReflectionMeshes),
            reflectionRefreshHz: number(subs.waterReflectionRefreshRate)
          },
          vegetationBatching: {
            instances: number(subs.grassInstances), batches: number(subs.grassBatches)
          },
          shadowCasterManagement: { activeCasters: number(subs.activeWorldShadowCasters) },
          atmosphere: {
            visual: metric(atm.visualUpdate), directLighting: metric(atm.directLighting),
            skyAndClouds: metric(atm.skyAndCloudUniforms), hearthSelection: metric(atm.hearthSelection),
            waterMaterial: metric(atm.waterMaterial), postProcessing: metric(atm.postProcessing)
          },
          wildlife: {
            update: { samples: number(fauna.samples), p50Ms: number(fauna.p50Ms),
              p95Ms: number(fauna.p95Ms), p99Ms: number(fauna.p99Ms), maxMs: number(fauna.maxMs) },
            requested: number(fauna.requested), loaded: number(fauna.loaded),
            complete: fauna.complete === true, readiness: Array.isArray(fauna.readiness) ? fauna.readiness : []
          },
          npcDialogue: {
            positioning: { samples: number(dialogue.positioningSamples),
              p50Ms: number(dialogue.positioningP50Ms), p95Ms: number(dialogue.positioningP95Ms),
              p99Ms: number(dialogue.positioningP99Ms), maxMs: number(dialogue.maxPositioningMs) },
            projectionAttempts: number(dialogue.projectionAttempts),
            projectionSuccesses: number(dialogue.projectionSuccesses)
          },
          minimap: { lastMs: number(subs.mapDrawMs), maxMs: number(subs.mapDrawMaxMs),
            samples: number(subs.mapDrawSampleCount) },
          structureAuditCache: { lastMs: number(subs.habitableAuditMs),
            maxMs: number(subs.habitableAuditMaxMs), cacheHits: number(subs.habitableAuditLastCacheHits),
            cacheMisses: number(subs.habitableAuditLastCacheMisses) },
          worldPhases: phaseCosts
        };
      })(),
      startupScriptLoads: startupScriptLoadSummary,
      mapRendering: {
        lastMs: latestPhaseSample ? number(latestPhaseSample.subsystems.mapDrawMs) : null,
        maximumMs: latestPhaseSample ? number(latestPhaseSample.subsystems.mapDrawMaxMs) : null,
        sampleCount: latestPhaseSample ? number(latestPhaseSample.subsystems.mapDrawSampleCount) : null
      },
      habitableStructureAudit: {
        lastMs: latestPhaseSample ? number(latestPhaseSample.subsystems.habitableAuditMs) : null,
        maximumMs: latestPhaseSample ? number(latestPhaseSample.subsystems.habitableAuditMaxMs) : null,
        runs: latestPhaseSample ? number(latestPhaseSample.subsystems.habitableAuditCount) : null,
        lastCacheHits: latestPhaseSample ? number(latestPhaseSample.subsystems.habitableAuditLastCacheHits) : null,
        lastCacheMisses: latestPhaseSample ? number(latestPhaseSample.subsystems.habitableAuditLastCacheMisses) : null
      },
      gpu: {
        timerQueryStatus: gpuTimerQueryStatus,
        timerQuerySupported: gpuTimerQueryStatus === "supported",
        measurementType: gpu.length ? "driver-timer-query" : "unavailable",
        sceneRenderMeasurement: "CPU-side Babylon instrumentation; not GPU elapsed time",
        p95Ms: gpuP95Ms,
        p99Ms: percentile(gpu,.99),
        validTimerQuerySamples: gpu.length,
        timerQueryExtension: latestGpuSample && latestGpuSample.gpu ? latestGpuSample.gpu.timerQueryExtension : null,
        frameSampleCount: gpu.length,
        frameMedianMs: medianGpu,
        frameP50Ms: percentile(gpu,.50),
        frameP95Ms: percentile(gpu,.95),
        frameP99Ms: percentile(gpu,.99),
        frameMaximumMs: gpu.length ? Math.max(...gpu) : null,
        sceneRenderMedianMs: medianSceneRender,
        device: latestGpuDevice,
        renderPipeline: latestGpuSample && latestGpuSample.gpu ? latestGpuSample.gpu.renderPipeline : null,
        contextLifecycle: latestGpuSample && latestGpuSample.gpu ? latestGpuSample.gpu.contextLifecycle : null,
        measurementNote: gpu.length ? "GPU timer-query values measured by the graphics driver." :
          gpuTimerQueryStatus === "unsupported" ? "GPU timer queries are unavailable on this browser/device; CPU and frame timing remain separate." :
          gpuTimerQueryStatus === "disabled" ? "GPU profiling was not enabled for this session." :
          "No valid GPU timer-query sample was collected; null is not zero."
      },
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
      gpuProfilerEnabled,
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
    cancelQueuedIdlePersist();
    if (!state.session) return;
    const current = state.session;
    current.finishedAt = new Date().toISOString();
    current.lastUpdatedAt = current.finishedAt;
    current.status = reason === "pagehide" ? "interrupted" : "completed";
    current.endReason = reason;
    if (reason !== "pagehide") current.finalWorldInspection = captureFinalWorldInspection();
    stopSessionDiagnostics();
    current.summary = buildSessionSummary(current);
    writeRecoverySnapshot(current);
    const saved = await saveSession();
    if (!saved) writeRecoverySnapshot(current);
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
        saveSession();
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