'use strict';
const assert = require('node:assert/strict');
const { isCompletedStartupSnapshot } = require('./startup-readiness-core.cjs');
const ready = {
  bootFailed: false, resourceGate: { ready: true },
  recorder: { worldReady: true, playerModelReady: true, consoleErrors: [], runtimeErrors: [], unhandledRejections: [] },
  player: { modelReady: true, loading: false, realPlayerMeshCount: 1, fallbackVisible: false }
};
assert.equal(isCompletedStartupSnapshot(ready), true);
assert.equal(isCompletedStartupSnapshot({ ...ready, bootFailed: true }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, resourceGate: { ready: false } }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, recorder: { ...ready.recorder, worldReady: false } }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, recorder: { ...ready.recorder, runtimeErrors: ['boom'] } }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, player: { ...ready.player, fallbackVisible: true } }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, player: { ...ready.player, realPlayerMeshCount: 0 } }), false);
assert.equal(isCompletedStartupSnapshot({ ...ready, player: { ...ready.player, loading: true } }), false);
assert.equal(isCompletedStartupSnapshot(null), false);
console.log('Startup readiness core: PASS');
