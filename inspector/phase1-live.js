import { buildDeviceEvidence, classifyFinding } from '../scripts/phase1-diagnostics-core.mjs';

(() => {
  const $ = id => document.getElementById(id);
  const frame = $('liveGameFrame');
  const history = [];
  let timer = null;
  let startedAt = null;
  let lastSnapshot = null;

  const fmt = (value, digits = 1, suffix = '') =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits }) + suffix;

  function setStatus(message) { $('liveDiagnosticStatus').textContent = message; }

  function readSnapshot() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== window.location.origin) return null;
      if (typeof win.getGameHealthDebug !== 'function') return null;
      const health = win.getGameHealthDebug();
      const runtime = health?.runtime || {};
      const memory = win.performance?.memory || null;
      const canvas = win.document.querySelector('canvas');
      let webgl = {};
      if (canvas) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          webgl = {
            version: gl.getParameter(gl.VERSION),
            vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
            renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
            timerQuery: !!(gl.getExtension('EXT_disjoint_timer_query_webgl2') || gl.getExtension('EXT_disjoint_timer_query'))
          };
        }
      }
      const ua = win.navigator.userAgent || '';
      const physicalConfirmed = $('livePhysicalDevice').checked;
      const deviceEvidence = buildDeviceEvidence({
        environment: 'browser',
        physicalDeviceConfirmed: physicalConfirmed,
        browser: {
          userAgent: ua,
          platform: win.navigator.platform,
          deviceMemoryGB: win.navigator.deviceMemory,
          hardwareConcurrency: win.navigator.hardwareConcurrency,
          devicePixelRatio: win.devicePixelRatio
        },
        webgl
      });
      const timing = runtime.frameTimingMs || {};
      const sample = {
        capturedAt: new Date().toISOString(),
        gameStarted: health?.gameStarted ?? null,
        fps: Number.isFinite(Number(runtime.fps ?? health?.fps)) ? Number(runtime.fps ?? health.fps) : null,
        frameTiming: {
          samples: timing.samples ?? null,
          averageMs: timing.average ?? null,
          p50Ms: timing.p50 ?? null,
          p95Ms: timing.p95 ?? null,
          p99Ms: timing.p99 ?? null
        },
        worldUpdateMs: runtime.worldUpdateMs ?? null,
        renderCpuMs: runtime.renderCpuMs ?? null,
        heapUsedMB: memory?.usedJSHeapSize ? Number((memory.usedJSHeapSize / 1048576).toFixed(2)) : null,
        heapLimitMB: memory?.jsHeapSizeLimit ? Number((memory.jsHeapSizeLimit / 1048576).toFixed(2)) : null,
        drawCalls: runtime.drawCalls ?? null,
        activeMeshes: runtime.activeMeshes ?? null,
        renderWidth: runtime.renderWidth ?? null,
        renderHeight: runtime.renderHeight ?? null,
        graphicsProfile: runtime.graphicsProfile ?? null,
        performanceAssessment: runtime.performanceAssessment ?? null,
        device: deviceEvidence,
        evidence: {
          fps: 'game-runtime',
          frameTiming: 'game-runtime',
          cpuTimings: 'game-runtime-javascript-wall-clock',
          heap: memory ? 'browser-performance.memory' : 'unavailable',
          gpuTiming: 'not-measured'
        }
      };
      return sample;
    } catch (error) {
      setStatus('No se pudo leer el juego: ' + String(error?.message || error));
      return null;
    }
  }

  function render(sample) {
    $('liveFps').textContent = fmt(sample.fps, 0);
    $('liveP95').textContent = fmt(sample.frameTiming.p95Ms, 2, ' ms');
    $('liveP99').textContent = fmt(sample.frameTiming.p99Ms, 2, ' ms');
    $('liveWorldCpu').textContent = fmt(sample.worldUpdateMs, 2, ' ms');
    $('liveRenderCpu').textContent = fmt(sample.renderCpuMs, 2, ' ms');
    $('liveHeap').textContent = fmt(sample.heapUsedMB, 1, ' MB');
    $('liveDiagnosticJson').textContent = JSON.stringify({
      schemaVersion: 1,
      sessionStartedAt: startedAt,
      sampleCount: history.length,
      status: classifyFinding({ evidenceCount: history.length, repeated: history.length >= 3, confidence: history.length >= 3 ? 0.9 : 0.6 }),
      latest: sample,
      recentSamples: history.slice(-30),
      limitations: [
        'FPS y frame timing proceden del diagnóstico interno del juego.',
        'Los tiempos CPU son duraciones de trabajo JavaScript; no son porcentajes de CPU.',
        'WebGL timer query disponible no equivale a una medición GPU.',
        'Temperatura, RAM total y VRAM no están disponibles desde este navegador.',
        'La confirmación de dispositivo físico es una declaración manual del usuario.'
      ]
    }, null, 2);
    const source = sample.device.physicalDeviceConfirmed
      ? 'Dispositivo físico confirmado manualmente · ' + sample.device.userAgent
      : 'Sesión de navegador no confirmada como dispositivo físico · ' + (sample.device.userAgent || 'UA no disponible');
    $('liveDiagnosticSource').textContent = source + '. La medición GPU, temperatura y RAM total no están disponibles aquí.';
  }

  function takeSample() {
    const sample = readSnapshot();
    if (!sample) {
      setStatus('Esperando a que el juego termine de iniciar y publique sus datos de diagnóstico.');
      return;
    }
    lastSnapshot = sample;
    history.push(sample);
    if (history.length > 120) history.shift();
    render(sample);
    setStatus('Midiendo · ' + history.length + ' muestras · última lectura ' + new Date(sample.capturedAt).toLocaleTimeString('es-ES'));
  }

  function startSampling() {
    if (timer) return;
    startedAt = new Date().toISOString();
    history.length = 0;
    $('liveGameSample').disabled = false;
    $('liveGameStop').disabled = false;
    takeSample();
    timer = window.setInterval(takeSample, 1000);
  }

  function stopSampling() {
    if (timer) window.clearInterval(timer);
    timer = null;
    $('liveGameStop').disabled = true;
    $('liveGameSample').disabled = !lastSnapshot;
    setStatus('Medición detenida · ' + history.length + ' muestras conservadas en esta sesión.');
  }

  $('liveGameStart').addEventListener('click', () => {
    stopSampling();
    history.length = 0;
    lastSnapshot = null;
    $('liveDiagnosticJson').textContent = 'Esperando muestras todavía.';
    $('liveGameFrameWrap').hidden = false;
    $('liveGameFrame').src = '../?phase1-diagnostics=1';
    $('liveGameStart').disabled = true;
    $('liveGameStop').disabled = true;
    $('liveGameSample').disabled = true;
    setStatus('Cargando el juego. Cuando aparezca, inicia una partida y la medición comenzará automáticamente.');
  });

  frame.addEventListener('load', () => {
    if ($('liveGameFrameWrap').hidden) return;
    setStatus('Juego cargado. Inicia una partida; el Inspector empezará a medir cuando el juego exponga su diagnóstico.');
    const wait = window.setInterval(() => {
      const sample = readSnapshot();
      if (sample && sample.gameStarted) {
        window.clearInterval(wait);
        startSampling();
      }
    }, 1000);
    window.setTimeout(() => window.clearInterval(wait), 180000);
  });

  $('liveGameSample').addEventListener('click', takeSample);
  $('liveGameStop').addEventListener('click', stopSampling);
  window.addEventListener('beforeunload', stopSampling);
})();
