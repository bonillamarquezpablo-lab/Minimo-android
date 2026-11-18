'use strict';
function isCompletedStartupSnapshot(snapshot) {
  if (!snapshot || snapshot.bootFailed === true) return false;
  const recorder = snapshot.recorder;
  const player = snapshot.player;
  const resourceGate = snapshot.resourceGate;
  if (!recorder || !player) return false;
  const clean = value => Array.isArray(value) && value.length === 0;
  return recorder.worldReady === true &&
    recorder.playerModelReady === true &&
    player.modelReady === true &&
    player.loading === false &&
    Number(player.realPlayerMeshCount) > 0 &&
    player.fallbackVisible === false &&
    (!resourceGate || resourceGate.ready === true) &&
    clean(recorder.consoleErrors) &&
    clean(recorder.runtimeErrors) &&
    clean(recorder.unhandledRejections);
}
module.exports = { isCompletedStartupSnapshot };
