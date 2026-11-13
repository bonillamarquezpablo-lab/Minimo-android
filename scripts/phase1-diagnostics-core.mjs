/**
 * EL SIN NOMBRE · Phase 1 diagnostic core
 *
 * Pure helpers. Missing, stale or contradictory evidence is never converted
 * into a healthy value or an automatic root-cause diagnosis.
 */
export const DIAGNOSTIC_SCHEMA_VERSION = 2;
export const DEFAULT_TARGET_FPS = 120;

export const MEASUREMENT_SOURCES = Object.freeze({
  gameRuntime: 'game-runtime',
  browserApi: 'browser-api',
  ciEmulation: 'ci-emulation',
  externalDevice: 'external-device'
});

export function finiteOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeOrNull(value) {
  const number = finiteOrNull(value);
  return number !== null && number >= 0 ? number : null;
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  const sorted = values.map(nonNegativeOrNull).filter(value => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return Number(sorted[lower].toFixed(3));
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Number(value.toFixed(3));
}

export function summarizeFrameTimes(frameTimesMs, targetFps = DEFAULT_TARGET_FPS) {
  const values = Array.isArray(frameTimesMs)
    ? frameTimesMs.map(nonNegativeOrNull).filter(value => value !== null && value > 0)
    : [];
  const validTarget = Number.isFinite(targetFps) && targetFps > 0;
  const targetFrameMs = validTarget ? 1000 / targetFps : null;
  const overBudget = targetFrameMs === null ? null : values.filter(value => value > targetFrameMs).length;
  const severeJank = targetFrameMs === null ? null : values.filter(value => value > targetFrameMs * 2).length;
  const averageMs = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    sampleCount: values.length,
    targetFps: validTarget ? targetFps : null,
    targetFrameMs: targetFrameMs === null ? null : Number(targetFrameMs.toFixed(3)),
    averageMs: averageMs === null ? null : Number(averageMs.toFixed(3)),
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length ? Number(Math.max(...values).toFixed(3)) : null,
    overBudgetCount: overBudget,
    severeJankCount: severeJank,
    overBudgetRate: values.length && overBudget !== null ? Number((overBudget / values.length).toFixed(4)) : null,
    severeJankRate: values.length && severeJank !== null ? Number((severeJank / values.length).toFixed(4)) : null
  };
}

export function normalizeFrameTiming(raw = {}) {
  const sampleValue = nonNegativeOrNull(raw?.samples);
  const sampleCount = sampleValue === null ? null : Math.floor(sampleValue);
  const hasSamples = sampleCount !== null && sampleCount > 0;
  const read = key => hasSamples ? nonNegativeOrNull(raw?.[key]) : null;
  const timing = {
    sampleCount: hasSamples ? sampleCount : 0,
    averageMs: read('average'),
    p50Ms: read('p50'),
    p95Ms: read('p95'),
    p99Ms: read('p99')
  };
  const warnings = [];
  if (!hasSamples) warnings.push('El motor todavía no ha publicado una ventana válida de tiempos de fotograma.');
  if (hasSamples && timing.p50Ms === null && timing.p95Ms === null && timing.p99Ms === null) {
    warnings.push('El contador informa de muestras, pero no entrega percentiles utilizables.');
  }
  if (timing.p50Ms !== null && timing.p95Ms !== null && timing.p95Ms < timing.p50Ms) {
    warnings.push('Datos incoherentes: p95 es inferior a p50.');
  }
  if (timing.p95Ms !== null && timing.p99Ms !== null && timing.p99Ms < timing.p95Ms) {
    warnings.push('Datos incoherentes: p99 es inferior a p95.');
  }
  return { ...timing, warnings };
}

export function describeMeasurement(value, source, unit = null) {
  const normalized = finiteOrNull(value);
  return {
    value: normalized,
    unit,
    source: normalized === null ? null : source,
    status: normalized === null ? 'unavailable' : 'measured'
  };
}

export function buildDeviceEvidence(input = {}) {
  const isCi = input.environment === 'ci-emulation';
  const browser = input.browser || {};
  const webgl = input.webgl || {};
  const source = isCi ? MEASUREMENT_SOURCES.ciEmulation : MEASUREMENT_SOURCES.browserApi;
  return {
    environment: isCi ? 'ci-emulation' : (input.environment || 'unknown'),
    physicalDeviceUserDeclared: input.physicalDeviceUserDeclared === true,
    physicalDeviceVerified: false,
    userAgent: typeof browser.userAgent === 'string' ? browser.userAgent : null,
    platform: typeof browser.platform === 'string' ? browser.platform : null,
    reportedDeviceMemoryGB: describeMeasurement(browser.deviceMemoryGB, source, 'GB-estimados-del-navegador'),
    reportedLogicalProcessors: describeMeasurement(browser.hardwareConcurrency, source, 'procesadores-logicos-reportados'),
    devicePixelRatio: describeMeasurement(browser.devicePixelRatio, MEASUREMENT_SOURCES.browserApi, 'ratio'),
    webglVersion: typeof webgl.version === 'string' ? webgl.version : null,
    gpuVendor: typeof webgl.vendor === 'string' ? webgl.vendor : null,
    gpuRenderer: typeof webgl.renderer === 'string' ? webgl.renderer : null,
    thermalState: { value: null, source: null, status: 'unavailable-in-browser' },
    systemRamUsedMB: { value: null, source: null, status: 'unavailable-in-browser' },
    vramUsedMB: { value: null, source: null, status: 'unavailable-in-browser' },
    gpuTemperatureC: { value: null, source: null, status: 'unavailable-in-browser' }
  };
}

export function normalizeGameTelemetry(health, browser = {}, options = {}) {
  const available = !!health && typeof health === 'object';
  const runtime = available && health.runtime && typeof health.runtime === 'object' ? health.runtime : {};
  const frameTiming = normalizeFrameTiming(runtime.frameTimingMs);
  const worldUpdateCount = nonNegativeOrNull(health?.worldUpdateCount);
  const reportedFps = finiteOrNull(runtime.fps ?? health?.fps);
  const memory = options.memory && typeof options.memory === 'object' ? options.memory : {};
  const heapUsedBytes = nonNegativeOrNull(memory.usedJSHeapSize);
  const heapLimitBytes = nonNegativeOrNull(memory.jsHeapSizeLimit);
  const device = buildDeviceEvidence({
    environment: options.environment || 'browser',
    physicalDeviceUserDeclared: options.physicalDeviceUserDeclared === true,
    browser: {
      userAgent: browser.userAgent,
      platform: browser.platform,
      deviceMemoryGB: browser.deviceMemory,
      hardwareConcurrency: browser.hardwareConcurrency,
      devicePixelRatio: browser.devicePixelRatio
    },
    webgl: {
      version: runtime.webglVersion,
      vendor: runtime.gpuVendor,
      renderer: runtime.gpuRenderer
    }
  });
  const measurements = {
    fps: reportedFps,
    worldUpdateMs: nonNegativeOrNull(runtime.worldUpdateMs),
    renderCpuMs: nonNegativeOrNull(runtime.renderCpuMs),
    gpuFrameMs: nonNegativeOrNull(runtime.engineGpuFrameMs),
    sceneFrameMs: nonNegativeOrNull(runtime.sceneFrameMs),
    sceneRenderMs: nonNegativeOrNull(runtime.sceneRenderMs),
    activeMeshesEvaluationMs: nonNegativeOrNull(runtime.activeMeshesEvaluationMs),
    renderTargetsMs: nonNegativeOrNull(runtime.renderTargetsMs),
    cameraRenderMs: nonNegativeOrNull(runtime.cameraRenderMs),
    shaderCompilationMs: nonNegativeOrNull(runtime.shaderCompilationMs),
    drawCalls: nonNegativeOrNull(runtime.drawCalls ?? runtime.sceneDrawCalls),
    activeMeshes: nonNegativeOrNull(runtime.activeMeshes),
    meshCount: nonNegativeOrNull(runtime.meshCount),
    totalVertices: nonNegativeOrNull(runtime.totalVertices),
    renderWidth: nonNegativeOrNull(runtime.renderWidth),
    renderHeight: nonNegativeOrNull(runtime.renderHeight),
    renderDpr: nonNegativeOrNull(runtime.renderDpr),
    jsHeapUsedMB: heapUsedBytes === null ? null : Number((heapUsedBytes / 1048576).toFixed(2)),
    jsHeapLimitMB: heapLimitBytes === null ? null : Number((heapLimitBytes / 1048576).toFixed(2))
  };
  const warnings = [...frameTiming.warnings];
  if (!available) warnings.push('No se ha podido acceder a getGameHealthDebug().');
  if (available && typeof health.gameStarted !== 'boolean') warnings.push('El estado de partida no está definido por el motor.');
  if (runtime.profileDiagnosticsEnabled !== true) warnings.push('La instrumentación detallada de Babylon no está activada; los contadores GPU pueden no estar disponibles.');
  if (measurements.gpuFrameMs === null) warnings.push('No hay un tiempo GPU medido; no se puede atribuir el cuello de botella a la GPU.');
  if (measurements.worldUpdateMs === null || measurements.renderCpuMs === null) warnings.push('Faltan tiempos de trabajo de CPU del juego; no se puede atribuir un cuello de botella a CPU.');
  if (heapUsedBytes === null) warnings.push('El navegador no expone el heap JavaScript en esta sesión.');
  return {
    gameStarted: typeof health?.gameStarted === 'boolean' ? health.gameStarted : null,
    worldUpdateCount,
    worldUpdatePhase: typeof health?.worldUpdatePhase === 'string' ? health.worldUpdatePhase : null,
    lastWorldUpdateFailure: typeof health?.lastWorldUpdateFailure === 'string' ? health.lastWorldUpdateFailure : null,
    graphicsProfile: typeof runtime.graphicsProfile === 'string' ? runtime.graphicsProfile : null,
    reportedGameTargetFps: finiteOrNull(runtime.performanceAssessment?.targetFps),
    profileDiagnosticsEnabled: runtime.profileDiagnosticsEnabled === true,
    frameTiming,
    measurements,
    device,
    dataQuality: {
      healthApiAvailable: available,
      validFrameWindow: frameTiming.sampleCount > 0 && frameTiming.p95Ms !== null,
      warnings
    },
    source: {
      fps: 'game-runtime',
      frameTiming: 'game-runtime-frame-window',
      cpuTimings: 'game-runtime-javascript-wall-clock',
      gpuTiming: measurements.gpuFrameMs === null ? 'unavailable-or-not-sampled' : 'babylon-engine-instrumentation',
      heap: heapUsedBytes === null ? 'unavailable' : 'browser-performance.memory'
    }
  };
}

export function classifyFinding({ evidenceCount = 0, repeated = false, confidence = 0, independentSessions = 1 } = {}) {
  if (!Number.isFinite(evidenceCount) || evidenceCount < 3) return 'sin-datos-suficientes';
  if (!Number.isFinite(confidence) || confidence < 0.55) return 'sin-datos-suficientes';
  if (repeated === true && independentSessions >= 2 && evidenceCount >= 5 && confidence >= 0.85) return 'confirmado';
  return 'probable';
}

export function analyzeFrameStability(samples, targetFps = DEFAULT_TARGET_FPS, independentSessions = 1) {
  const targetFrameMs = Number.isFinite(targetFps) && targetFps > 0 ? 1000 / targetFps : null;
  const valid = Array.isArray(samples) ? samples.filter(sample =>
    sample?.game?.frameTiming?.sampleCount > 0 &&
    sample.game.frameTiming.p50Ms !== null &&
    sample.game.frameTiming.p95Ms !== null
  ) : [];
  const medianBreaches = targetFrameMs === null ? [] : valid.filter(sample => sample.game.frameTiming.p50Ms > targetFrameMs);
  const tailBreaches = targetFrameMs === null ? [] : valid.filter(sample => sample.game.frameTiming.p95Ms > targetFrameMs);
  const medianBreachRate = valid.length ? medianBreaches.length / valid.length : null;
  const tailBreachRate = valid.length ? tailBreaches.length / valid.length : null;
  const repeated = (medianBreaches.length >= 3 && medianBreachRate >= 0.7) ||
    (tailBreaches.length >= 3 && tailBreachRate >= 0.7);
  const strongestRate = medianBreachRate === null ? (tailBreachRate || 0) : Math.max(medianBreachRate, tailBreachRate || 0);
  const confidence = valid.length ? Math.min(0.99, strongestRate * (0.70 + Math.min(valid.length, 10) * 0.03)) : 0;
  const evidenceStatus = repeated
    ? classifyFinding({ evidenceCount: valid.length, repeated, confidence, independentSessions })
    : valid.length >= 3 && medianBreaches.length === 0 && tailBreaches.length === 0
      ? 'sin-incidencia-observada'
      : 'sin-datos-suficientes';
  const medianP50Ms = percentile(valid.map(sample => sample.game.frameTiming.p50Ms), 0.5);
  const medianP95Ms = percentile(valid.map(sample => sample.game.frameTiming.p95Ms), 0.5);
  const medianP99Ms = percentile(valid.map(sample => sample.game.frameTiming.p99Ms), 0.5);
  const medianStage = key => percentile(valid.map(sample => sample.game.measurements?.[key]), 0.5);
  const medianWorldUpdateMs = medianStage('worldUpdateMs');
  const medianRenderCpuMs = medianStage('renderCpuMs');
  const medianGpuFrameMs = medianStage('gpuFrameMs');
  const hasEvidence = valid.length >= 3;
  let severity = 'sin-determinar';
  let priority = 'sin-asignar';
  if (hasEvidence && evidenceStatus === 'sin-incidencia-observada') {
    severity = 'sin-incidencia-observada';
    priority = 'sin-accion';
  } else if (hasEvidence && medianP50Ms !== null && medianP50Ms >= targetFrameMs * 2) {
    severity = 'critica';
    priority = 'P1';
  } else if (hasEvidence && medianBreaches.length >= 3 && medianBreachRate >= 0.7) {
    severity = 'alta';
    priority = 'P1';
  } else if (hasEvidence && tailBreaches.length >= 3 && tailBreachRate >= 0.7) {
    severity = 'media';
    priority = 'P2';
  } else if (hasEvidence && (medianBreaches.length || tailBreaches.length)) {
    severity = 'baja';
    priority = 'P3';
  }
  const possibleCauses = [];
  const stageThreshold = targetFrameMs === null ? null : targetFrameMs * 0.8;
  if (hasEvidence && stageThreshold !== null && medianGpuFrameMs !== null && medianGpuFrameMs >= stageThreshold) {
    possibleCauses.push('El contador de tiempo GPU consume una parte importante del presupuesto; investigar carga de shaders, reflejos, sombras y efectos.');
  }
  if (hasEvidence && stageThreshold !== null && medianWorldUpdateMs !== null && medianWorldUpdateMs >= stageThreshold) {
    possibleCauses.push('La actualización del mundo consume una parte importante del presupuesto; investigar simulación, IA y lógica por fotograma.');
  }
  if (hasEvidence && stageThreshold !== null && medianRenderCpuMs !== null && medianRenderCpuMs >= stageThreshold) {
    possibleCauses.push('El envío de render consume una parte importante del presupuesto; revisar draw calls, mallas y preparación de escena.');
  }
  if (hasEvidence && evidenceStatus !== 'sin-incidencia-observada' && possibleCauses.length === 0) {
    possibleCauses.push('La telemetría actual no permite atribuir la causa a CPU o GPU; se necesitan mediciones adicionales.');
  }
  const recommendedChecks = evidenceStatus === 'sin-incidencia-observada'
    ? ['Repetir la medición en otras islas y estados del mundo.', 'Comparar con otra sesión en el mismo perfil gráfico.']
    : [
        'Repetir la prueba con la misma isla, cámara, perfil y estado del mundo.',
        'Comparar una sesión normal con otra usando el perfilador GPU opcional.',
        'No modificar calidad ni funciones hasta identificar una causa con evidencia.'
      ];
  return {
    targetFps,
    targetFrameMs: targetFrameMs === null ? null : Number(targetFrameMs.toFixed(3)),
    validIntervals: valid.length,
    medianBreachIntervals: medianBreaches.length,
    p95BreachIntervals: tailBreaches.length,
    medianBreachRate: medianBreachRate === null ? null : Number(medianBreachRate.toFixed(3)),
    p95BreachRate: tailBreachRate === null ? null : Number(tailBreachRate.toFixed(3)),
    medianP50Ms,
    medianP95Ms,
    medianP99Ms,
    medianWorldUpdateMs,
    medianRenderCpuMs,
    medianGpuFrameMs,
    status: evidenceStatus,
    severity,
    priority,
    possibleCauses,
    causeAttribution: possibleCauses.length ? 'candidata-no-confirmada' : 'sin-atribucion',
    recommendedChecks,
    interpretation: valid.length < 3
      ? 'Se necesitan al menos tres intervalos válidos para valorar estabilidad.'
      : evidenceStatus === 'sin-incidencia-observada'
        ? 'Las muestras disponibles no muestran una pérdida del presupuesto de fotograma.'
        : medianBreaches.length >= 3 && medianBreachRate >= 0.7
          ? 'La mediana supera repetidamente el presupuesto; la incidencia de rendimiento es probable, pero la causa raíz aún no está confirmada.'
          : tailBreaches.length >= 3 && tailBreachRate >= 0.7
            ? 'La mediana puede mantenerse dentro del presupuesto, pero el p95 supera repetidamente el límite; hay una pérdida probable de estabilidad.'
            : 'Hay lecturas fuera del presupuesto, pero aún no se repiten lo suficiente para confirmar una incidencia.'
  };
}
