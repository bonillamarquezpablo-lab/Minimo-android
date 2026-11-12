'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const ready=html.indexOf('startupAssetsReady=true;');
const start=html.indexOf("setLoadingProgress(82,");
assert.ok(start>=0&&ready>start,'La barrera de arranque debe empezar antes de habilitar el menú o la partida.');
const barrier=html.slice(start,ready);

// Solo los recursos imprescindibles para entrar siguen bloqueando: protagonista y escena.
for(const marker of [
  'await playerHumanLoadPromise',
  'await scene.whenReadyAsync()',
  'requestAnimationFrame(()=>requestAnimationFrame(resolve))'
]) assert.ok(barrier.includes(marker),'Falta la dependencia principal de arranque: '+marker);
assert.ok(html.includes('await createRealGrass(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ);'),'La hierba inicial de Calidad debe permanecer lista antes de entrar.');
assert.ok(html.includes("recordStartupTask('Hierba 3D inicial de Calidad'"),'El tiempo de generación de la hierba inicial debe quedar medido.');

// Audio still preloads; it no longer holds the first playable screen.
assert.ok(html.includes('startupAudioPreload.then('),'La precarga de audio debe seguir ejecutándose.');
assert.doesNotMatch(barrier,/await startupAudioPreload/,'La partida no debe esperar a cada efecto de audio.');

// NPC and fauna GLBs start after the selector is visible; procedural stand-ins already exist.
assert.match(html,/function startDeferredWorldModels\(\)/);
assert.match(html,/setTimeout\(startDeferredWorldModels,180\)/);
assert.match(html,/const backgroundNpcTask=startNpcHumanModels\(\)/);
assert.match(html,/const backgroundFaunaTask=Promise\.resolve\(backgroundNpcTask\)/);
assert.match(html,/Promise\.allSettled\(\[backgroundNpcTask,backgroundFaunaTask\]\)\.then\(/);
assert.doesNotMatch(barrier,/startNpcHumanModels\(\)|loadWildlifeModels\(\)|await Promise\.allSettled\(\[backgroundNpcTask,backgroundFaunaTask\]\)/,'Los modelos secundarios no deben bloquear la apertura del selector.');
assert.match(html,/npcBackgroundLoad:'deferred-after-selector'/);
assert.match(html,/faunaBackgroundLoad:'deferred-after-selector'/);
assert.match(html,/if\(gameStarted\|\|!enemyHumanModelsStarted\)return false/);
assert.match(html,/if\(gameStarted\|\|!enemyHumanModelsStarted\|\|enemyHumanRetryAttempts/);

// The protagonist cache/online retry and frame-time diagnostics remain intact.
assert.match(html,/window\.__retryVikingModel=\(\)=>\{if\(!startupAssetsReady&&!gameStarted/);
assert.match(html,/startupTimeline\.gameStartedAt=performance\.now\(\)/);
assert.match(html,/anchor:sinceGameStart<=20000\?'game-start':'first-frame'/);
assert.match(html,/sceneWarmupStatus='ready'/);
assert.match(html,/blocking:true,warmupFrames:2/);
console.log('OK: protagonist, initial quality grass and scene stay on the critical path; audio/NPC/fauna preload without blocking entry.');
