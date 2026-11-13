import assert from 'node:assert/strict';
import {
  buildDeviceEvidence, classifyFinding, describeMeasurement, finiteOrNull,
  percentile, summarizeFrameTimes, MEASUREMENT_SOURCES
} from './phase1-diagnostics-core.mjs';

assert.equal(finiteOrNull(null), null);
assert.equal(finiteOrNull(''), null);
assert.equal(finiteOrNull('16.7'), 16.7);
assert.equal(finiteOrNull('not-a-number'), null);
assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
assert.equal(percentile([], 0.95), null);

const frame = summarizeFrameTimes([16.6, 16.7, 33.4, 8.3, null, 'bad'], 60);
assert.equal(frame.sampleCount, 4);
assert.equal(frame.overBudgetCount, 2);
assert.equal(frame.severeJankCount, 1);
assert.ok(frame.p95Ms >= frame.medianMs);
assert.equal(summarizeFrameTimes([], 60).p95Ms, null);

assert.deepEqual(describeMeasurement(null, MEASUREMENT_SOURCES.browserApi, 'GB'), {
  value: null, unit: 'GB', source: null, status: 'unavailable'
});

const ci = buildDeviceEvidence({
  environment: 'ci-emulation',
  browser: { deviceMemoryGB: 12, hardwareConcurrency: 8, devicePixelRatio: 3.75, userAgent: 'Chromium test' },
  webgl: { renderer: 'SwiftShader', timerQuery: true, version: 'WebGL 2.0' }
});
assert.equal(ci.physicalDeviceConfirmed, false);
assert.equal(ci.deviceMemoryGB.source, MEASUREMENT_SOURCES.ciEmulation);
assert.equal(ci.gpuTimerQuery, 'extension-available-not-a-timing-measurement');
assert.equal(ci.thermalState.status, 'unavailable-in-browser');
assert.equal(ci.gpuTemperatureC.value, null);

const browser = buildDeviceEvidence({
  environment: 'browser',
  browser: { deviceMemoryGB: 8, hardwareConcurrency: 8 },
  webgl: {}
});
assert.equal(browser.deviceMemoryGB.source, MEASUREMENT_SOURCES.browserApi);
assert.equal(browser.physicalDeviceConfirmed, false);

assert.equal(classifyFinding({ evidenceCount: 0, confidence: 1 }), 'sin-datos-suficientes');
assert.equal(classifyFinding({ evidenceCount: 1, confidence: 0.7 }), 'probable');
assert.equal(classifyFinding({ evidenceCount: 3, repeated: true, confidence: 0.9 }), 'confirmado');
console.log('Phase 1 diagnostic core contracts: OK');
