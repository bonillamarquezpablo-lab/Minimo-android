import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./build_site.py', import.meta.url), 'utf8');
assert.match(source, /profileDiagnosticsEnabled=!!\(testModeEnabled\|\|new URLSearchParams\(window\.location\.search\)\.get\('profile'\)==='1'\)/);
assert.match(source, /if\(!profileDiagnosticsEnabled\|\|!counter\|\|counter\.current===null\|\|counter\.current===undefined\)return null/);
assert.match(source, /engineGpuFrameMs:safePerfCounterValue\(engineInstrumentation&&engineInstrumentation\.gpuFrameTimeCounter,1e6\)/);
assert.doesNotMatch(source, /const value=Number\(counter&&counter\.current\)/, 'Missing counters must never become false 0 ms readings.');
console.log('Phase 1 build-time instrumentation contracts: OK');
