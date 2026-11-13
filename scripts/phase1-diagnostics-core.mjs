/**
 * EL SIN NOMBRE · Phase 1 diagnostic core
 *
 * Pure, dependency-free helpers for normalizing telemetry and classifying evidence.
 * Values are never inferred: unavailable measurements remain null.
 */
export const DIAGNOSTIC_SCHEMA_VERSION = 1;

export const MEASUREMENT_SOURCES = Object.freeze({
  gameRuntime: 'game-runtime',
  browserApi: 'browser-api',
  ciEmulation: 'ci-emulation',
  externalDevice: 'external-device'
});

export function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  const sorted = values.map(finiteOrNull).filter(value => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return Number(sorted[lower].toFixed(3));
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Number(value.toFixed(3));
}

export function summarizeFrameTimes(frameTimesMs, targetFps = 60) {
  const values = Array.isArray(frameTimesMs)
    ? frameTimesMs.map(finiteOrNull).filter(value => value !== null && value >= 0)
    : [];
  const targetFrameMs = Number.isFinite(targetFps) && targetFps > 0 ? 1000 / targetFps : null;
  const overBudget = targetFrameMs === null ? null : values.filter(value => value > targetFrameMs).length;
  const severeJank = targetFrameMs === null ? null : values.filter(value => value > targetFrameMs * 2).length;
  return {
    sampleCount: values.length,
    targetFps,
    targetFrameMs: targetFrameMs === null ? null : Number(targetFrameMs.toFixed(3)),
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
  return {
    environment: isCi ? 'ci-emulation' : (input.environment || 'unknown'),
    physicalDeviceConfirmed: input.physicalDeviceConfirmed === true,
    userAgent: typeof browser.userAgent === 'string' ? browser.userAgent : null,
    platform: typeof browser.platform === 'string' ? browser.platform : null,
    deviceMemoryGB: describeMeasurement(browser.deviceMemoryGB, isCi ? MEASUREMENT_SOURCES.ciEmulation : MEASUREMENT_SOURCES.browserApi, 'GB'),
    hardwareConcurrency: describeMeasurement(browser.hardwareConcurrency, isCi ? MEASUREMENT_SOURCES.ciEmulation : MEASUREMENT_SOURCES.browserApi, 'logical-cores'),
    devicePixelRatio: describeMeasurement(browser.devicePixelRatio, MEASUREMENT_SOURCES.browserApi, 'ratio'),
    webglVersion: typeof webgl.version === 'string' ? webgl.version : null,
    gpuVendor: typeof webgl.vendor === 'string' ? webgl.vendor : null,
    gpuRenderer: typeof webgl.renderer === 'string' ? webgl.renderer : null,
    gpuTimerQuery: webgl.timerQuery === true ? 'extension-available-not-a-timing-measurement' : 'unavailable',
    thermalState: { value: null, source: null, status: 'unavailable-in-browser' },
    gpuTemperatureC: { value: null, source: null, status: 'unavailable-in-browser' },
    systemRamUsedMB: { value: null, source: null, status: 'unavailable-in-browser' },
    vramUsedMB: { value: null, source: null, status: 'unavailable-in-browser' }
  };
}

export function classifyFinding({ evidenceCount = 0, repeated = false, confidence = 0 } = {}) {
  if (!Number.isFinite(evidenceCount) || evidenceCount < 1) return 'sin-datos-suficientes';
  if (repeated === true && confidence >= 0.85) return 'confirmado';
  if (confidence >= 0.55) return 'probable';
  return 'sin-datos-suficientes';
}
