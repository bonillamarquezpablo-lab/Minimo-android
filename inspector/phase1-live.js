import {
  DIAGNOSTIC_SCHEMA_VERSION, DEFAULT_TARGET_FPS, analyzeFrameStability, normalizeGameTelemetry
} from '../scripts/phase1-diagnostics-core.mjs';

(() => {
  const $ = id => document.getElementById(id);
  const frame = $('liveGameFrame');
  const history = [];
  const MAX_SAMPLES = 180;
  const SAMPLE_INTERVAL_MS = 1000;
  let sampleTimer = null;
  let waitTimer = null;
  let sessionStartedAt = null;
  let lastSnapshot = null;
  let lastWorldUpdateCount = null;
  let unchangedWorldPolls = 0;
  let lastReadError = null;

  const fmt = (value, digits = 1, suffix = '') =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits }) + suffix;

  function setStatus(message) {
    const target = $('liveDiagnosticStatus');
    if (target) target.textContent = message;
  }

  function setMetric(id, value) {
    const target = $(id);
    if (target) target.textContent = value;
  }

  function readSnapshot() {
    try {
      const win = frame?.contentWindow;
      if (!win || win.location.origin !== window.location.origin) {
        lastReadError = 'El juego todavía no está disponible o no comparte el origen del Inspector.';
        return null;
      }
      if (typeof win.getGameHealthDebug !== 'function') {
        lastReadError = 'El juego no ha publicado getGameHealthDebug().';
        return null;
      }
      const health = win.getGameHealthDebug();
      if (!health || typeof health !== 'object') {
        lastReadError = 'El motor ha devuelto una respuesta de diagnóstico vacía.';
        return null;
      }
      const memory = win.performance?.memory || null;
      const game = normalizeGameTelemetry(health, win.navigator || {}, {
        memory,
        physicalDeviceUserDeclared: $('livePhysicalDevice').checked,
        environment: 'browser'
      });
      const worldCount = game.worldUpdateCount;
      if (worldCount !== null && worldCount === lastWorldUpdateCount) unchangedWorldPolls++;
      else unchangedWorldPolls = 0;
      lastWorldUpdateCount = worldCount;
      const qualityWarnings = [...game.dataQuality.warnings];
      if (unchangedWorldPolls >= 3 && game.gameStarted === true && document.visibilityState === 'visible') {
        qualityWarnings.push('El contador de actualización del mundo no avanza en tres lecturas; puede existir una pausa o telemetría detenida.');
      }
      const longTasks = typeof win.performance?.getEntriesByType === 'function'
        ? win.performance.getEntriesByType('longtask') : null;
      const longTaskSummary = Array.isArray(longTasks)
        ? {
            supported: true,
            count: longTasks.length,
            totalDurationMs: Number(longTasks.reduce((sum, entry) => sum + (Number(entry.duration) || 0), 0).toFixed(2)),
            maximumDurationMs: longTasks.length ? Number(Math.max(...longTasks.map(entry => Number(entry.duration) || 0)).toFixed(2)) : 0
          }
        : { supported: false, count: null, totalDurationMs: null, maximumDurationMs: null };
      lastReadError = null;
      return {
        capturedAt: new Date().toISOString(),
        visible: document.visibilityState === 'visible',
        game,
        longTasks: longTaskSummary,
        qualityWarnings,
        gameBuild: win.document.querySelector('meta[name="el-sin-nombre-build"]')?.content || null,
        gameUrl: win.location.href
      };
    } catch (error) {
      lastReadError = String(error?.message || error);
      return null;
    }
  }

  function sessionAnalysis() {
    return analyzeFrameStability(history, DEFAULT_TARGET_FPS, 1);
  }

  function buildReport(latest = lastSnapshot) {
    return {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      project: 'EL SIN NOMBRE',
      sessionStartedAt,
      generatedAt: new Date().toISOString(),
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      sampleCount: history.length,
      objective: { fps: DEFAULT_TARGET_FPS, frameBudgetMs: Number((1000 / DEFAULT_TARGET_FPS).toFixed(3)) },
      sessionFinding: sessionAnalysis(),
      latest,
      recentSamples: history.slice(-60),
      measurementContract: {
        fpsAndFrameTiming: 'Game runtime. Real device measurements only when the game itself is running on that device.',
        cpuTimings: 'JavaScript/Babylon wall-clock stage durations, not operating-system CPU utilization.',
        gpuTiming: 'Optional Babylon EngineInstrumentation timer. Null means not measured; it is never treated as 0 ms.',
        memory: 'Only JavaScript heap exposed by Chromium, not Android system RAM or GPU VRAM.',
        deviceIdentity: 'The device checkbox is a user declaration, not hardware attestation.',
        temperature: 'Android SoC/GPU temperature is not exposed by this web page.'
      },
      limitations: [
        'Chromium CI / SwiftShader results are emulation and cannot be presented as Galaxy S26 Ultra GPU performance.',
        'Browser APIs do not expose total CPU utilization, Android system RAM usage, VRAM usage or SoC/GPU temperature.',
        'A GPU timer value is shown only when the optional profiler is enabled and Babylon publishes a valid counter.',
        'A single session can produce a probable finding; confirmation requires at least two independent sessions.',
        'Visual quality requires synchronized captures and inspection; FPS alone cannot prove a visual defect.'
      ]
    };
  }

  function render(sample) {
    const game = sample.game;
    const values = game.measurements;
    const timing = game.frameTiming;
    setMetric('liveFps', fmt(values.fps, 0));
    setMetric('liveP50', fmt(timing.p50Ms, 2, ' ms'));
    setMetric('liveP95', fmt(timing.p95Ms, 2, ' ms'));
    setMetric('liveP99', fmt(timing.p99Ms, 2, ' ms'));
    setMetric('liveWorldCpu', fmt(values.worldUpdateMs, 2, ' ms'));
    setMetric('liveRenderCpu', fmt(values.renderCpuMs, 2, ' ms'));
    setMetric('liveGpu', fmt(values.gpuFrameMs, 2, ' ms'));
    setMetric('liveSceneRender', fmt(values.sceneRenderMs, 2, ' ms'));
    setMetric('liveDrawCalls', fmt(values.drawCalls, 0));
    setMetric('liveActiveMeshes', fmt(values.activeMeshes, 0));
    setMetric('liveRenderSize', values.renderWidth !== null && values.renderHeight !== null
      ? fmt(values.renderWidth, 0) + ' × ' + fmt(values.renderHeight, 0) : '—');
    setMetric('liveHeap', fmt(values.jsHeapUsedMB, 1, ' MB'));
    const analysis = sessionAnalysis();
    $('liveDiagnosticJson').textContent = JSON.stringify(buildReport(sample), null, 2);
    $('liveDiagnosticSource').textContent =
      'Origen: juego en navegador · Perfil: ' + (game.graphicsProfile || 'no informado') +
      ' · Diagnóstico GPU: ' + (game.profileDiagnosticsEnabled ? 'instrumentación solicitada' : 'no activada') +
      ' · Dispositivo: ' + (game.device.physicalDeviceUserDeclared ? 'declarado por el usuario, no verificado' : 'no declarado') +
      ' · Estabilidad: ' + analysis.status + '. Temperatura y memoria total del sistema: no disponibles desde esta página.';
  }

  function takeSample() {
    if (document.visibilityState !== 'visible') {
      setStatus('Medición pausada: la pestaña está en segundo plano y sus tiempos no serían representativos.');
      return;
    }
    const sample = readSnapshot();
    if (!sample) {
      setStatus(lastReadError || 'Esperando a que el juego publique sus datos.');
      return;
    }
    lastSnapshot = sample;
    if (sample.game.gameStarted === true && sample.game.dataQuality.validFrameWindow) {
      history.push(sample);
      if (history.length > MAX_SAMPLES) history.shift();
    }
    render(sample);
    setStatus(sample.game.gameStarted === true
      ? 'Midiendo · ' + history.length + ' intervalos válidos · lectura ' + new Date(sample.capturedAt).toLocaleTimeString('es-ES')
      : 'Juego cargado, pero todavía no hay una partida activa. Inicia la partida para medir.');
  }

  function startSampling() {
    if (sampleTimer) return;
    sessionStartedAt = new Date().toISOString();
    history.length = 0;
    lastWorldUpdateCount = null;
    unchangedWorldPolls = 0;
    $('liveGameSample').disabled = false;
    $('liveGameStop').disabled = false;
    takeSample();
    sampleTimer = window.setInterval(takeSample, SAMPLE_INTERVAL_MS);
  }

  function stopSampling() {
    if (sampleTimer) window.clearInterval(sampleTimer);
    if (waitTimer) window.clearInterval(waitTimer);
    sampleTimer = null;
    waitTimer = null;
    $('liveGameStop').disabled = true;
    $('liveGameSample').disabled = !lastSnapshot;
    setStatus('Medición detenida · ' + history.length + ' intervalos válidos conservados en esta sesión.');
  }

  function beginGameLoad() {
    stopSampling();
    history.length = 0;
    sessionStartedAt = null;
    lastSnapshot = null;
    lastReadError = null;
    $('liveDiagnosticJson').textContent = 'Esperando a que el juego publique los datos.';
    $('liveGameFrameWrap').hidden = false;
    $('liveGameStart').disabled = true;
    $('liveGameSample').disabled = true;
    $('liveGameStop').disabled = true;
    lastWorldUpdateCount = null;
    unchangedWorldPolls = 0;
    const profiler = $('liveEnableGpuProfiler').checked;
    const query = profiler ? '?phase1-diagnostics=1&profile=1' : '?phase1-diagnostics=1';
    frame.src = '../' + query;
    setStatus(profiler
      ? 'Cargando el juego con instrumentación GPU opcional. Puede añadir algo de carga al diagnóstico.'
      : 'Cargando el juego en modo normal. Se medirá el rendimiento sin activar el perfilador detallado.');
  }

  function beginWaitingForGame() {
    if (waitTimer) window.clearInterval(waitTimer);
    let elapsed = 0;
    waitTimer = window.setInterval(() => {
      elapsed += SAMPLE_INTERVAL_MS;
      const sample = readSnapshot();
      if (sample && sample.game.gameStarted === true) {
        window.clearInterval(waitTimer);
        waitTimer = null;
        startSampling();
      } else if (elapsed >= 180000) {
        window.clearInterval(waitTimer);
        waitTimer = null;
        setStatus(lastReadError || 'No se ha detectado una partida activa en tres minutos. No se han inventado métricas.');
      }
    }, SAMPLE_INTERVAL_MS);
  }

  $('liveGameStart').addEventListener('click', beginGameLoad);
  $('liveGameSample').addEventListener('click', takeSample);
  $('liveGameStop').addEventListener('click', stopSampling);
  frame.addEventListener('load', () => {
    if ($('liveGameFrameWrap').hidden) return;
    $('liveGameStart').disabled = false;
    $('liveGameSample').disabled = false;
    setStatus('Juego cargado. Inicia una partida; la medición comenzará automáticamente cuando el motor lo confirme.');
    beginWaitingForGame();
  });
  frame.addEventListener('error', () => {
    $('liveGameStart').disabled = false;
    setStatus('No se pudo cargar el juego en el Inspector. Puedes volver a intentarlo.');
  });
  $('liveDownloadReport').addEventListener('click', () => {
    const report = buildReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'el-sin-nombre-diagnostico-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') setStatus('Medición pausada en segundo plano para evitar datos sesgados.');
    else if (sampleTimer) takeSample();
  });
  window.addEventListener('beforeunload', stopSampling);
})();
