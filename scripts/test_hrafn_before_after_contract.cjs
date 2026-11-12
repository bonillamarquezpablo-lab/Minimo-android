'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const capture = fs.readFileSync('scripts/hrafn-before-after.mjs', 'utf8');
const coastal = fs.readFileSync('scripts/coastal-reference.mjs', 'utf8');
const report = fs.readFileSync('scripts/create_hrafn_ab_report.py', 'utf8');
const inspector = fs.readFileSync('scripts/run-unified-inspector.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');

for (const token of [
  'HRAFN_BEFORE_URL', 'HRAFN_AFTER_URL',
  "id: 'dawn'", "id: 'noon'", "id: 'dusk'", "id: 'midnight'",
  'captureCanvas()', 'clock.pause()', 'clock.setTime(hour)',
  '__ELSN_CAPTURE_SEED__', 'prepareCaptureFrame({ timeoutMs: 120000 })',
  'worldReady === true', 'timeout: 240000', 'startupDiagnostics', '#chooseQuality', '#continueUnnamed', '#newGameChoice',
  'Math.imul(1664525, state) + 1013904223'
]) {
  assert.ok(capture.includes(token), 'Missing deterministic A/B capture feature: ' + token);
}

assert.match(capture,/capturePhaseFrame/);
assert.match(capture,/api\.render\(\);/);
assert.match(capture,/Page\.captureScreenshot/);
assert.match(capture,/cdp-composited-frame/);
assert.match(capture,/timeout: 240000/);
assert.match(capture,/startupDiagnostics/);assert.match(capture,/sequential/);assert.match(capture,/safeClosePage/);assert.match(capture,/safeCloseBrowser/);assert.match(capture,/document\.querySelector\('#intro\.open'\)/);assert.match(capture,/testApiMethods/);assert.match(capture,/typeof window\.__ELSN_TEST__\.prepareCaptureFrame/);assert.match(capture,/withTimeout/);assert.match(capture,/width: 960, height: 540/);assert.match(coastal,/withCaptureTimeout/);assert.match(coastal,/15000/);
assert.match(coastal,/captureAtmospherePng/);
assert.match(coastal,/api\.render\(\);/);
assert.match(coastal,/Page\.captureScreenshot/);
assert.match(coastal,/captureMethod: atmosphereCapture\.method/);

for (const token of [
  'ImageChops.difference', 'ANTES', 'DESPUÉS',
  'changedPixelRatio', 'meanAbsoluteRgbDelta',
  'Viewport mismatch', 'report.md'
]) {
  assert.ok(report.includes(token), 'Missing visual report feature: ' + token);
}

for (const token of [
  'scripts/hrafn-before-after.mjs',
  'scripts/create_hrafn_ab_report.py',
  'HRAFN_BEFORE_URL', 'HRAFN_AFTER_URL',
  'artifacts/hrafn-before-after/report.md'
]) {
  assert.ok(inspector.includes(token), 'The unified inspector does not run Hrafn end-to-end: ' + token);
}

for (const token of [
  'feature/unified-atmosphere-system',
  "default: 'feature/unified-atmosphere-system'",
  'Build the baseline game in an isolated worktree',
  '4176',
  "HRAFN_BEFORE_URL: ${{ (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.inspection_level == 'deep')) && 'http://127.0.0.1:4176/' || '' }}",
  'HRAFN_AFTER_URL: http://127.0.0.1:4175/',
  'artifacts/hrafn-before-after/'
]) {
  assert.ok(workflow.includes(token), 'The workflow is missing automatic baseline/candidate integration: ' + token);
}

assert.doesNotMatch(workflow, /^    continue-on-error:\s*true$/m,
  'The inspector job must report failed phases as a failed workflow.');
console.log('HRAFN AUTOMATIC BEFORE/AFTER + UNIFIED INSPECTOR CONTRACT OK');
