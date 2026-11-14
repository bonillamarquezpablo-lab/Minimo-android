'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

const start=html.indexOf("setLoadingProgress(82,'Preparando protagonista y NPC de la isla inicial…');");
const ready=html.indexOf('startupAssetsReady=true;',start);
assert.ok(start>=0&&ready>start,'La barrera de carga debe preceder a startupAssetsReady.');
const barrier=html.slice(start,ready);

// Shared startup state must be initialized before diagnostic panels and GLB loaders can read it.
const startupStateDeclaration='let onShip=false,gameStarted=false,startupAssetsReady=false;';
const startupStatePosition=html.indexOf(startupStateDeclaration);
assert.ok(startupStatePosition>=0&&startupStatePosition<html.indexOf('function getWaterCoastDiagnostics()'),
  'onShip must be initialized before the first coast diagnostics refresh.');
assert.ok(startupStatePosition<html.indexOf('async function loadHumanViking(file=null)'),
  'gameStarted/startupAssetsReady must be initialized before the protagonist loader runs.');
assert.doesNotMatch(html,/let health=100,[^\\r\\n]*onShip=false/,
  'onShip must not be redeclared later in the game-state declaration.');
assert.doesNotMatch(html,/let gameStarted=false/,'gameStarted must have a single early initialization.');
assert.doesNotMatch(html,/firstFrameRendered=false,startupAssetsReady=false/,
  'startupAssetsReady must not be redeclared after the protagonist loader.');

for(const marker of [
  'const npcStartupPromise=coastalReferenceMode?Promise.resolve(0):startNpcHumanModels();',
  'await Promise.all([playerHumanLoadPromise,npcStartupPromise])',
  'scene.whenReadyAsync()',
  'scene.compileMaterialsAsync()',
  'sceneReadyTimeout',
  'RECURSO OBLIGATORIO: efectos de sonido',
  "loadWildlifeModels()",
  "faunaTasks.push({name:\'Gaviotas 3D\',promise:loadRiggedCoastalGulls()})",
  "await Promise.allSettled(faunaTasks.map(task=>task.promise))"
]) assert.ok(barrier.includes(marker),'Falta una dependencia de arranque obligatorio/medido: '+marker);

assert.match(html,/throw new Error\('RECURSO OBLIGATORIO: Vikingo protagonista/);
assert.match(html,/const warriorPartsToLoad=humanEnemyParts\.filter\(p=>\/\^VillageGuard0_\//);
assert.match(html,/const civilianPartsToLoad=humanCivilianParts\.slice\(0,lowMemoryNpcBudget\?1:2\)/);
assert.match(html,/if\(!requiredReady\)throw new Error\('NPC obligatorios de la isla inicial incompletos/);
assert.match(html,/if\(startupAssetsReady\|\|gameStarted\)throw new Error\('No se permiten importaciones GLB después de entrar en la partida\.'/);
assert.match(html,/estimatedWorkingSetBytes/);
assert.match(html,/const VIKING_WEB_CACHE='el-sin-nombre-models-'/);
assert.match(html,/async function readVikingFromWebCache\(\)[\s\S]*?caches\.open\(VIKING_WEB_CACHE\)[\s\S]*?cache\.match\(VIKING_GLB_URL\)/,
  'The official protagonist lookup must read only the exact build-versioned Cache API bucket.');
assert.doesNotMatch(html,/caches\.match\(VIKING_GLB_URL\)/,
  'A global cache search must not bypass the protagonist cache version.');
assert.match(html,/function disposeLateGlbResult\(result,model,stage\)/);
assert.match(html,/pending\.then\(result=>\{if\(timedOut\)disposeLateGlbResult\(result,model,stage\);?\},\(\)=>\{\}\)/,
  'Timed-out SceneLoader imports must be disposed if Babylon resolves them late.');
assert.match(html,/const faunaResults=await Promise\.allSettled\(faunaTasks\.map\(task=>task\.promise\)\)/, 'Every optional fauna task must settle before player entry, even when one task fails.');
assert.doesNotMatch(html,/RECURSO OBLIGATORIO: importación de fauna sin finalizar/,
  'Fauna timeout/failure is optional and must not block game entry.');
assert.match(html,/fauna:isPerformanceMode\?'disabled-performance':'blocking-optional'/);
assert.match(html,/npcBackgroundLoad:'blocking-before-entry',faunaBackgroundLoad:'optional-before-entry'/);
assert.match(html,/No se pudo identificar un roster obligatorio de guardianes y aldeanos/);
assert.doesNotMatch(html,/cached=await readVikingFromBrowser\(\)/,'El GLB oficial del protagonista no debe duplicarse en IndexedDB.');
assert.match(html,/async function saveCivilianHumanCache\(blob\)[\s\S]*?caches\.open\(VIKING_WEB_CACHE\)/,'El GLB civil debe usar Cache API y no duplicarse en IndexedDB.');
assert.match(html,/RECURSO OBLIGATORIO: escena y shaders · agotado el plazo de 90 segundos/);
assert.match(html,/timer=setTimeout\(\(\)=>controller\.abort\(\),45000\)/);

// No deferred NPC/fauna task is allowed to be started after the playable screen is released.
assert.doesNotMatch(html,/setTimeout\(startDeferredWorldModels/);
assert.doesNotMatch(html,/function startDeferredWorldModels\(\)/,'No debe existir una ruta de carga diferida de NPC/fauna.');
assert.match(html,/await Promise\.all\(\[playerHumanLoadPromise,npcStartupPromise\]\)/);

// Keep the constrained-device budgets and Quality grass behavior.
assert.match(html,/const lowMemoryNpcBudget=!!\(isUltraLowEndMobile\|\|isGalaxyA12LowEndMobile\|\|isGalaxyA12NachoPerformance\)/);
assert.match(html,/await createRealGrass\(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ\)/);
assert.match(html,/console\.info\('Hierba desactivada en modo Rendimiento\.'/);
assert.match(html,/const animalCount=isPerformanceMode\?0:\(idx===0\?3:0\)/);
assert.doesNotMatch(html,/loadRiggedCoastalGulls\(\);/,'The gull GLB must not be imported in a fire-and-forget task.');
assert.ok(!html.includes('CoastalGull_'),'Procedural gull stand-ins must not be displayed.');

// Music remains HTMLAudio; effects use the Web Audio context only after unlock.
assert.match(html,/new Audio\(\);audio\.preload='none';audio\.src=SOURCE/);
assert.match(html,/preflightMenuMusic\.preload='none'/);

assert.doesNotMatch(html,/rel="preload" as="audio"/,'Music must not be preloaded as a full audio resource.');
assert.match(html,/let startupAudioPreload=NorseAudio\.preloadAll\(new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'\?30000:6500\)/);
assert.match(html,/if\(audioPreloadResult\.pending&&!audioPreloadResult\.failed\)[\s\S]*?audioPreloadResult=await NorseAudio\.preloadAll\(30000\)/,
  'A pending early preload must be retried at the blocking entry barrier, after the user has interacted with the page.');
assert.match(html,/Math\.min\(30000,Number\(maxWaitMs\)\|\|6000\)/,
  'The patrol-only audio preload budget may increase, but normal gameplay must retain its 6500 ms argument.');
assert.doesNotMatch(html,/decodeAudioData\([^)]*menu|decodeAudioData\([^)]*gameplay/i);

// Cache must reject all GLB HTML/redirect substitutions, not only the protagonist asset.
assert.ok(sw.includes('if (!/\\.glb$/i.test(requestedUrl.pathname)) return false;'),'El service worker debe validar todos los GLB.');
assert.match(sw,/response\.redirected/);
assert.match(sw,/contentType\.includes\("text\/html"\)/);
console.log('OK: protagonist + initial-island NPC + scene/shaders block entry; fauna is bounded optional; no deferred import path.');
