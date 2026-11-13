import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../inspector/phase1-live.js', import.meta.url), 'utf8');
assert.match(source, /normalizeGameTelemetry/);
assert.match(source, /analyzeFrameStability/);
assert.match(source, /phase1-diagnostics=1&profile=1/);
assert.match(source, /physicalDeviceVerified/);
assert.doesNotMatch(source, /canvas\.getContext\(/, 'The inspector must not request a WebGL context from the game canvas.');
assert.match(source, /visibilityState/);
assert.match(source, /liveDownloadReport/);
assert.match(source, /180000/);
console.log('Phase 1 live inspector contracts: OK');
