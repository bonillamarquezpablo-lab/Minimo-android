'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

const start=html.indexOf("setLoadingProgress(82,'Preparando protagonista y NPC de la isla inicial…');");
const ready=html.indexOf('startupAssetsReady=true;',start);
assert.ok(start>=0&&ready>start,'La barrera de carga debe preceder a startupAssetsReady.');
const barrier=html.slice(start,ready);

for(const marker of [
  'const npcStartupPromise=coastalReferenceMode?Promise.resolve(0):startNpcHumanModels();',
  'await Promise.all([playerHumanLoadPromise,npcStartupPromise])',
  'scene.whenReadyAsync()',
  'scene.compileMaterialsAsync()',
  'sceneReadyTimeout',
  'RECURSO OBLIGATORIO: efectos de sonido',
  "loadWildlifeModels()"
]) assert.ok(barrier.includes(marker),'Falta una dependencia de arranque obligatorio/medido: '+marker);

assert.match(html,/throw new Error\('RECURSO OBLIGATORIO: Vikingo protagonista/);
assert.match(html,/const warriorPartsToLoad=humanEnemyParts\.filter\(p=>\/\^VillageGuard0_\//);
assert.match(html,/const civilianPartsToLoad=humanCivilianParts\.slice\(0,lowMemoryNpcBudget\?1:2\)/);
assert.match(html,/if\(!requiredReady\)throw new Error\('NPC obligatorios de la isla inicial incompletos/);
assert.match(html,/if\(startupAssetsReady\|\|gameStarted\)throw new Error\('No se permiten importaciones GLB después de entrar en la partida\.'/);
assert.match(html,/estimatedWorkingSetBytes/);
assert.match(html,/const VIKING_WEB_CACHE='el-sin-nombre-models-'/);
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

// Music remains HTMLAudio; effects use the Web Audio context only after unlock.
assert.match(html,/new Audio\(\);audio\.preload='none';audio\.src=SOURCE/);
assert.match(html,/preflightMenuMusic\.preload='none'/);
assert.match(html,/preflightMenuMusic\\.preload='none'/);
assert.match(html,/const startupAudioPreload=NorseAudio\.preloadAll\(6500\)/);
assert.doesNotMatch(html,/decodeAudioData\([^)]*menu|decodeAudioData\([^)]*gameplay/i);

// Cache must reject all GLB HTML/redirect substitutions, not only the protagonist asset.
assert.ok(sw.includes('if (!/\\.glb$/i.test(requestedUrl.pathname)) return false;'),'El service worker debe validar todos los GLB.');
assert.match(sw,/response\.redirected/);
assert.match(sw,/contentType\.includes\("text\/html"\)/);
console.log('OK: protagonist + initial-island NPC + scene/shaders block entry; fauna is bounded optional; no deferred import path.');
