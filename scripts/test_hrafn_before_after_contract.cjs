'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const capture=fs.readFileSync('scripts/hrafn-before-after.mjs','utf8');
const report=fs.readFileSync('scripts/create_hrafn_ab_report.py','utf8');
const inspector=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
for(const token of ['HRAFN_BEFORE_URL','HRAFN_AFTER_URL',"id: 'dawn'","id: 'noon'","id: 'dusk'","id: 'midnight'","captureCanvas()","clock.pause()","clock.setTime(hour)","__ELSN_CAPTURE_SEED__","prepareCaptureFrame({ timeoutMs: 120000 })","worldReady === true","#chooseQuality","#continueUnnamed","#newGameChoice","sampleGraphicsPerformance","medianFps","medianFrameP95Ms","ANGLE SwiftShader"]){
  assert.ok(capture.includes(token),'Missing deterministic mobile A/B capture feature: '+token);
}
assert.match(capture,/width: 384, height: 832/);
assert.match(capture,/deviceScaleFactor = 3\.75/);
assert.match(capture,/isMobile: true, hasTouch: true/);
assert.match(capture,/SM-S948B/);
assert.match(capture,/deviceMemory/);
assert.match(capture,/hardwareConcurrency/);
assert.match(capture,/capturePhaseFrame/);
assert.match(capture,/60000, label \+ ' ' \+ phaseId \+ ' canvas readback'/);
assert.match(capture,/750\);\s*const captureResult/);
assert.doesNotMatch(capture.slice(capture.indexOf('async function capturePhaseFrame'),capture.indexOf("if (!beforeUrl")),/api\.render\(\)/,'A/B must not force a duplicate synchronous render on SwiftShader.');
assert.match(capture,/Page\.captureScreenshot/);
assert.match(capture,/medianFrameP95Ms/);
assert.match(capture,/manifest\.builds\.before\.build === manifest\.builds\.after\.build/);
assert.match(capture,/A\/B comparison refused: before and after resolve to the same game release/);
for(const token of ['ImageChops.difference','ANTES','DESPUÉS','changedPixelRatio','meanAbsoluteRgbDelta','beforeEdgeEnergy','afterEdgeEnergy','edgeEnergyDeltaPct','Frame time p95 (ms)','DPR efectivo de entrada FSR1','Viewport mismatch','report.md']){
  assert.ok(report.includes(token),'Missing visual/performance report feature: '+token);
}
for(const token of ['scripts/hrafn-before-after.mjs','scripts/create_hrafn_ab_report.py','HRAFN_BEFORE_URL','HRAFN_AFTER_URL','artifacts/hrafn-before-after/report.md','Comparación gráfica móvil S26 Ultra']){
  assert.ok(inspector.includes(token),'Unified inspector missing A/B phase: '+token);
}
for(const token of ['Build the baseline game in an isolated worktree','git rev-parse "$GITHUB_SHA^"','for attempt in 1 2 3 4 5 6 7 8; do','No distinct buildable baseline found in the eight-commit recovery window','4176','HRAFN_BEFORE_URL:','HRAFN_AFTER_URL: http://127.0.0.1:4175/','artifacts/hrafn-before-after/']){
  assert.ok(workflow.includes(token),'Workflow missing exact parent baseline/mobile A/B wiring: '+token);
}
assert.doesNotMatch(workflow,/feature\/unified-atmosphere-system/);
assert.doesNotMatch(workflow,/manual-game-test-no-inspector|pull_request\.number\s*[!=]=\s*121/);
assert.doesNotMatch(workflow,/^    continue-on-error:\s*true$/m);
console.log('S26 ULTRA MOBILE A/B + PERFORMANCE + VISUAL INSPECTOR CONTRACT OK');
