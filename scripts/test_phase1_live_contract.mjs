import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../inspector/phase1-live.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../inspector/index.html', import.meta.url), 'utf8');
assert.match(source, /normalizeGameTelemetry/);
assert.match(source, /analyzeFrameStability/);
assert.match(source, /phase1-diagnostics=1&profile=1/);
assert.match(source, /physicalDeviceUserDeclared/);
assert.doesNotMatch(source, /canvas\.getContext\(/, 'The inspector must not request a WebGL context from the game canvas.');
assert.match(source, /visibilityState/);
assert.match(source, /__elSinNombreWaterDebugSnapshot/);
assert.match(source, /liveDownloadReport/);
assert.match(source, /180000/);
for (const id of [
  'liveP50','liveP95','liveP99','liveWorldCpu','liveRenderCpu','liveGpu',
  'liveSceneRender','liveDrawCalls','liveActiveMeshes','liveRenderSize','liveHeap',
  'liveEnableGpuProfiler','liveDownloadReport','liveFindingStatus','liveFindingSeverity','liveFindingPriority','liveFindingInterpretation','liveFindingCauses','liveFindingNextSteps'
]) {
  assert.ok(html.includes('id="' + id + '"'), 'Inspector HTML is missing ' + id);
  assert.ok(source.includes("'" + id + "'"), 'Inspector script does not use ' + id);
}
assert.match(html, /phase1-live\.js\?v=3/);
console.log('Phase 1 live inspector contracts: OK');
