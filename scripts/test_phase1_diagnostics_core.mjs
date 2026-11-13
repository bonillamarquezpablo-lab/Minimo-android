import assert from 'node:assert/strict';
import {
  analyzeFrameStability, buildDeviceEvidence, classifyFinding, describeMeasurement,
  finiteOrNull, normalizeFrameTiming, normalizeGameTelemetry, percentile,
  summarizeFrameTimes, MEASUREMENT_SOURCES, DEFAULT_TARGET_FPS
} from './phase1-diagnostics-core.mjs';

assert.equal(DEFAULT_TARGET_FPS, 120);
assert.equal(finiteOrNull(null), null);
assert.equal(finiteOrNull(undefined), null);
assert.equal(finiteOrNull(''), null);
assert.equal(finiteOrNull('   '), null);
assert.equal(finiteOrNull(true), null);
assert.equal(finiteOrNull(false), null);
assert.equal(finiteOrNull('16.7'), 16.7);
assert.equal(finiteOrNull('not-a-number'), null);
assert.equal(finiteOrNull({ value: 3 }), null);

assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
assert.equal(percentile([], 0.95), null);
assert.equal(percentile([null, '', 'bad', -1], 0.95), null);

const summary = summarizeFrameTimes([8.2, 8.4, 16.7, 4.1, null, 'bad'], 120);
assert.equal(summary.sampleCount, 4);
assert.equal(summary.targetFrameMs, 8.333);
assert.equal(summary.overBudgetCount, 2);
assert.equal(summary.severeJankCount, 1);
assert.ok(summary.p95Ms >= summary.medianMs);
assert.equal(summarizeFrameTimes([], 120).p95Ms, null);
assert.equal(summarizeFrameTimes([16.7], 0).targetFrameMs, null);

assert.deepEqual(describeMeasurement(null, MEASUREMENT_SOURCES.browserApi, 'GB'), {
  value: null, unit: 'GB', source: null, status: 'unavailable'
});

const invalidTiming = normalizeFrameTiming({ samples: 0, average: 0, p50: 0, p95: 0, p99: 0 });
assert.equal(invalidTiming.sampleCount, 0);
assert.equal(invalidTiming.p95Ms, null);
assert.ok(invalidTiming.warnings.length > 0);

const inconsistentTiming = normalizeFrameTiming({ samples: 10, p50: 12, p95: 10, p99: 9 });
assert.ok(inconsistentTiming.warnings.some(value => value.includes('p95')));
assert.ok(inconsistentTiming.warnings.some(value => value.includes('p99')));

const ci = buildDeviceEvidence({
  environment: 'ci-emulation',
  physicalDeviceUserDeclared: true,
  browser: { deviceMemoryGB: 12, hardwareConcurrency: 8, devicePixelRatio: 3.75, userAgent: 'Chromium test' },
  webgl: { renderer: 'SwiftShader', timerQuery: true, version: 'WebGL 2.0' }
});
assert.equal(ci.physicalDeviceUserDeclared, true);
assert.equal(ci.physicalDeviceVerified, false);
assert.equal(ci.reportedDeviceMemoryGB.source, MEASUREMENT_SOURCES.ciEmulation);
assert.equal(ci.thermalState.status, 'unavailable-in-browser');
assert.equal(ci.systemRamUsedMB.value, null);
assert.equal(ci.vramUsedMB.value, null);

const normalized = normalizeGameTelemetry({
  gameStarted: true,
  worldUpdateCount: 42,
  runtime: {
    fps: null,
    frameTimingMs: { samples: 120, average: 8.6, p50: 8.2, p95: 12.4, p99: 17.1 },
    worldUpdateMs: 2.1,
    renderCpuMs: 3.2,
    engineGpuFrameMs: null,
    graphicsProfile: 'Quality',
    profileDiagnosticsEnabled: true,
    drawCalls: 300,
    activeMeshes: 180,
    renderWidth: 1440,
    renderHeight: 3200
  }
}, { userAgent: 'Chrome Mobile', platform: 'Android', deviceMemory: 12, hardwareConcurrency: 8, devicePixelRatio: 3.75 }, {
  memory: { usedJSHeapSize: 10485760, jsHeapSizeLimit: 268435456 },
  physicalDeviceUserDeclared: true
});
assert.equal(normalized.gameStarted, true);
assert.equal(normalized.measurements.fps, null, 'null must not become a fake 0 FPS');
assert.equal(normalized.measurements.gpuFrameMs, null);
assert.equal(normalized.measurements.jsHeapUsedMB, 10);
assert.equal(normalized.frameTiming.p95Ms, 12.4);
assert.equal(normalized.device.physicalDeviceVerified, false);
assert.equal(normalized.device.physicalDeviceUserDeclared, true);
assert.ok(normalized.dataQuality.warnings.some(value => value.includes('tiempo GPU')));

assert.equal(classifyFinding({ evidenceCount: 0, confidence: 1 }), 'sin-datos-suficientes');
assert.equal(classifyFinding({ evidenceCount: 2, repeated: true, confidence: 0.99, independentSessions: 5 }), 'sin-datos-suficientes');
assert.equal(classifyFinding({ evidenceCount: 3, repeated: true, confidence: 0.9, independentSessions: 1 }), 'probable');
assert.equal(classifyFinding({ evidenceCount: 5, repeated: true, confidence: 0.9, independentSessions: 2 }), 'confirmado');

const sample = p50 => ({ game: { frameTiming: { sampleCount: 120, p50Ms: p50, p95Ms: p50 * 1.4, p99Ms: p50 * 1.8 } } });
const tooShort = analyzeFrameStability([sample(10), sample(11)], 120);
assert.equal(tooShort.status, 'sin-datos-suficientes');
const probable = analyzeFrameStability([sample(10), sample(11), sample(10), sample(9)], 120);
assert.equal(probable.status, 'probable');
assert.equal(probable.medianBreachIntervals, 4);
assert.equal(probable.severity, 'alta');
assert.equal(probable.priority, 'P1');
assert.equal(probable.causeAttribution, 'sin-atribucion');
const confirmed = analyzeFrameStability([sample(10), sample(11), sample(10), sample(9), sample(10)], 120, 2);
assert.equal(confirmed.status, 'confirmado');
const tailOnly = analyzeFrameStability([
  { game: { frameTiming: { sampleCount: 120, p50Ms: 7.8, p95Ms: 12, p99Ms: 15 } } },
  { game: { frameTiming: { sampleCount: 120, p50Ms: 7.9, p95Ms: 13, p99Ms: 16 } } },
  { game: { frameTiming: { sampleCount: 120, p50Ms: 8.0, p95Ms: 12, p99Ms: 17 } } }
], 120);
assert.match(tailOnly.interpretation, /p95/);
assert.equal(tailOnly.severity, 'media');
assert.equal(tailOnly.priority, 'P2');

const stagePressure = analyzeFrameStability([
  { game: { frameTiming: { sampleCount: 120, p50Ms: 10, p95Ms: 13, p99Ms: 17 }, measurements: { worldUpdateMs: 7.4, renderCpuMs: 2, gpuFrameMs: null } } },
  { game: { frameTiming: { sampleCount: 120, p50Ms: 10, p95Ms: 13, p99Ms: 17 }, measurements: { worldUpdateMs: 7.2, renderCpuMs: 2.1, gpuFrameMs: null } } },
  { game: { frameTiming: { sampleCount: 120, p50Ms: 10, p95Ms: 13, p99Ms: 17 }, measurements: { worldUpdateMs: 7.6, renderCpuMs: 2.2, gpuFrameMs: null } } }
], 120);
assert.equal(stagePressure.status, 'probable');
assert.equal(stagePressure.causeAttribution, 'candidata-no-confirmada');
assert.ok(stagePressure.possibleCauses.some(value => value.includes('actualización del mundo')));

const noIssue = analyzeFrameStability([sample(7.5), sample(7.8), sample(7.9)], 120);
assert.equal(noIssue.status, 'sin-incidencia-observada');
assert.equal(noIssue.severity, 'sin-incidencia-observada');

console.log('Phase 1 diagnostic core contracts: OK');
