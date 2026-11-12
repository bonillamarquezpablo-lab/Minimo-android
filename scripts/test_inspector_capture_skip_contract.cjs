'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const runner=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');

// Keep the inspector's own optional visual-skip mode intact for future quick runs.
assert.match(runner,/INSPECTOR_SKIP_VISUAL_CAPTURES===['"]1['"]/);
assert.match(runner,/function phaseSkipReason\(name\)/);
assert.match(runner,/SKIP_VISUAL_CAPTURES&&phaseLevel\(name\)>1/);
assert.match(runner,/INSPECTOR_LEVEL==='deep'&&!SKIP_VISUAL_CAPTURES/,
  'Deep visual comparison must run again when the temporary workflow bypass is removed.');

// Re-enable the full browser inspector after the manual review.
// PR 121 is temporarily build-only while the user manually tests the game.
// Contract validation and the complete site build stay active; browser inspection is skipped.
assert.match(workflow,/manual-game-test-no-inspector/);
assert.match(workflow,/name: Record temporary inspector bypass for manual game test/);
assert.match(workflow,/name: Install report image support\s+if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.number != 121/);
assert.match(workflow,/name: Install Playwright and Chromium\s+if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.number != 121/);
assert.match(workflow,/name: Start baseline and candidate game servers for the unified inspection\s+if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.number != 121/);
assert.match(workflow,/name: Run the single unified inspector\s+if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.number != 121/);
assert.match(workflow,/re_enable_after_manual_game_test: true/);
assert.ok(workflow.includes('node scripts/test_inspector_capture_skip_contract.cjs'));
assert.match(workflow,/cancel-in-progress: false/,
  'The manual-test bypass must not cancel the older inspection execution.');
console.log('TEMPORARY MANUAL-GAME-TEST INSPECTOR BYPASS CONTRACT OK');
