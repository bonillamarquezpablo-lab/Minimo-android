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
const pushStart=triggers.indexOf('  push:')+'  push:'.length;
const pushEnd=triggers.indexOf('  # Runs the complete cloud lab');
const pushBlock=triggers.slice(pushStart,pushEnd);
assert.ok(pushBlock.includes('branches: [main]')&&pushBlock.includes('paths:'),'Automatic Inspector runs must be restricted to the fauna-capture implementation paths.');
for(const file of ['scripts/fauna-visual-capture.mjs','scripts/create_fauna_contact_sheet.py','scripts/run-unified-inspector.mjs','scripts/test_fauna_visual_capture_contract.cjs','.github/workflows/coastal-reference.yml']){
  assert.ok(pushBlock.includes(file),'Scoped fauna capture trigger is missing path: '+file);
}
assert.ok(!/^  pull_request:/m.test(triggers),'Pull requests must not launch the full Inspector.');
assert.doesNotMatch(workflow,/manual-game-test-no-inspector|Record temporary inspector bypass|pull_request\.number\s*[!=]=\s*121/);
for(const step of ['Install Playwright and Chromium','Start candidate game server (and baseline only for Deep)','Run the single unified inspector']){
  const p=workflow.indexOf('- name: '+step);
  assert.ok(p>=0,'Missing full inspector step: '+step);
  assert.doesNotMatch(workflow.slice(p,p+220),/if:.*pull_request\.number/);
}
console.log('FULL VISUAL INSPECTOR — manual/scheduled plus scoped fauna-path push only; optional local skip mode retained.');
