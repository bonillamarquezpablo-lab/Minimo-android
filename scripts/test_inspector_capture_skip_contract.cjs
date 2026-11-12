'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const runner=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');

assert.match(runner,/INSPECTOR_SKIP_VISUAL_CAPTURES===['"]1['"]/,
  'The one-run visual bypass must be opt-in through an explicit environment flag.');
assert.match(runner,/function phaseSkipReason\(name\)/);
assert.match(runner,/SKIP_VISUAL_CAPTURES&&phaseLevel\(name\)>1/,
  'Only bulk capture phases must be skipped; quick player, texture and structure checks remain enabled.');
assert.match(runner,/Visual capture phases temporarily bypassed for this candidate smoke run/);
assert.match(runner,/visualCapturesSkipped:SKIP_VISUAL_CAPTURES/);
assert.match(runner,/INSPECTOR_LEVEL==='deep'&&!SKIP_VISUAL_CAPTURES/,
  'Hrafn visual comparison must resume automatically when the temporary bypass is removed.');
assert.match(workflow,/INSPECTOR_SKIP_VISUAL_CAPTURES:.*pull_request\.number == 121/);
assert.match(workflow,/visual-skip-once/,
  'The temporary smoke run must not be blocked by the older, long-running capture concurrency group.');
assert.match(workflow,/node scripts\/test_inspector_capture_skip_contract\.cjs/);
assert.match(workflow,/cancel-in-progress: false/,
  'The temporary run must not cancel the existing inspection execution.');
console.log('TEMPORARY VISUAL CAPTURE BYPASS CONTRACT OK');
