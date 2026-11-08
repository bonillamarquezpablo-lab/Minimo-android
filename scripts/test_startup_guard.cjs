'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const ready=html.indexOf('startupAssetsReady=true;');
const start=html.indexOf("setLoadingProgress(82,");
assert.ok(start>=0&&ready>start,'La barrera de arranque debe empezar antes de habilitar el menú o la partida.');
const barrier=html.slice(start,ready);
for(const marker of [
  'await playerHumanLoadPromise',
  'await startupAudioPreload',
  'const backgroundNpcTask=startNpcHumanModels().then(',
  'const backgroundFaunaTask=Promise.resolve(backgroundNpcTask)',
  'await Promise.allSettled([backgroundNpcTask,backgroundFaunaTask])',
  'await scene.whenReadyAsync()',
  'requestAnimationFrame(()=>requestAnimationFrame(resolve))'
]) assert.ok(barrier.includes(marker),'Falta la dependencia de arranque obligatoria: '+marker);
assert.doesNotMatch(barrier,/protagonistStageTimer|55000\)|STARTUP_SCENE_WARMUP_TIMEOUT_MS|Promise\.race\s*\(/,'No se puede abrir el juego por timeout ni dejar una carga principal en segundo plano.');
assert.doesNotMatch(html.slice(ready),/const backgroundNpcTask=startNpcHumanModels|const backgroundFaunaTask=Promise\.resolve\(backgroundNpcTask\)|loadWildlifeModels\(\)/,'No deben iniciarse modelos después de startupAssetsReady.');
assert.match(html,/if\(startupAssetsReady\|\|gameStarted\|\|!enemyHumanModelsStarted\)return false/);
assert.match(html,/if\(startupAssetsReady\|\|gameStarted\|\|!enemyHumanModelsStarted\|\|enemyHumanRetryAttempts/);
assert.match(html,/window\.__retryVikingModel=\(\)=>\{if\(!startupAssetsReady&&!gameStarted/);
assert.match(html,/startupTimeline\.gameStartedAt=performance\.now\(\)/);
assert.match(html,/anchor:sinceGameStart<=20000\?'game-start':'first-frame'/);
assert.match(html,/sceneWarmupStatus='ready'/);
assert.match(html,/blocking:true,warmupFrames:2/);
assert.match(html,/npcBackgroundLoad:'completed-before-opening'/);
assert.match(html,/faunaBackgroundLoad:'completed-before-opening'/);
console.log('OK: all model/audio/shader tasks complete before startupAssetsReady; FPS spikes measured after game start.');
