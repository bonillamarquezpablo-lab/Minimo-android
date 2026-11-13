'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const runner=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
assert.match(runner,/INSPECTOR_SKIP_VISUAL_CAPTURES===['"]1['"]/);
assert.match(runner,/function phaseSkipReason\(name\)/);
assert.match(runner,/SKIP_VISUAL_CAPTURES&&phaseLevel\(name\)>1/);
assert.match(runner,/INSPECTOR_LEVEL==='deep'&&!SKIP_VISUAL_CAPTURES/);
const triggers=workflow.slice(workflow.indexOf('on:\n'),workflow.indexOf('\npermissions:'));
assert.ok(triggers.includes('workflow_dispatch:'),'The full Inspector must have a manual trigger.');
assert.ok(!/^  (push|pull_request):/m.test(triggers),'The full Inspector must only run when manually requested.');
assert.doesNotMatch(workflow,/manual-game-test-no-inspector|Record temporary inspector bypass|pull_request\.number\s*[!=]=\s*121/);
for(const step of ['Install Playwright and Chromium','Start baseline and candidate game servers for the unified inspection','Run the single unified inspector']){
  const p=workflow.indexOf('- name: '+step);
  assert.ok(p>=0,'Missing full inspector step: '+step);
  assert.doesNotMatch(workflow.slice(p,p+220),/if:.*pull_request\.number/);
}
console.log('FULL VISUAL INSPECTOR MANUAL-ONLY — optional local skip mode retained.');
