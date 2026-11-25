'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const builder=fs.readFileSync('scripts/build_site.py','utf8');
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
assert.ok(html.includes('const faunaResults=await Promise.allSettled(faunaTasks.map(task=>task.promise))'),
  'Every fauna task must settle before player entry, whether it is terrestrial fauna or Quality gulls.');
assert.ok(builder.includes('optional_fauna_state = "fauna:isPerformanceMode?\'disabled-performance\':\'blocking-optional\'"'),
  'The release builder must recognize the unbuilt source marker before replacing it.');
assert.ok(builder.includes('required_fauna_state = "fauna:\'blocking-required\'"'),
  'The release builder must make terrestrial fauna mandatory in both profiles.');
assert.ok(builder.includes('fauna_blocking_failure = "if(faunaFailures.length){'),
  'Any failed required animal must stop entry with an actionable resource error.');
assert.ok(builder.includes('wildlife_spawn_count_replacement = "const animalCount=idx===0?3:0;"'),
  'Performance must keep the same three terrestrial animal instances.');
assert.ok(builder.includes('if(startupResourceSnapshot.fauna.requested!==3||startupResourceSnapshot.fauna.loaded!==3)'),
  'The final readiness gate must reject entry unless all three terrestrial animals are loaded.');
assert.ok(builder.includes('fauna_telemetry_marker = "npcBackgroundLoad:\'blocking-before-entry\',faunaBackgroundLoad:\'optional-before-entry\'"'),
  'The builder must update the legacy optional fauna telemetry marker.');
assert.ok(builder.includes('fauna_telemetry_required = "npcBackgroundLoad:\'blocking-before-entry\',faunaBackgroundLoad:\'blocking-before-entry\'"'),
  'The generated session report must describe fauna as blocking before entry.');
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
assert.ok(builder.includes('startupAudioPreload.then(async result=>{') &&
  builder.includes('result=await NorseAudio.preloadAll(30000)') &&
  builder.includes('publishStartupAudioReadiness()'),
  'Sound effects must retry asynchronously and publish their eventual readiness.');
assert.ok(builder.includes('audioRequiredForEntry:false') &&
  !builder.includes('audioPreloadResult=await startupAudioPreload'),
  'Sound effects and music must not block the playable scene.');
assert.match(html,/Math\.min\(30000,Number\(maxWaitMs\)\|\|6000\)/,
  'The patrol-only audio preload budget may increase, but normal gameplay must retain its 6500 ms argument.');
assert.doesNotMatch(html,/decodeAudioData\([^)]*menu|decodeAudioData\([^)]*gameplay/i);

// Cache must reject all GLB HTML/redirect substitutions, not only the protagonist asset.
assert.ok(sw.includes('if (!/\\.glb$/i.test(requestedUrl.pathname)) return false;'),'El service worker debe validar todos los GLB.');
assert.match(sw,/response\.redirected/);
assert.match(sw,/contentType\.includes\("text\/html"\)/);

 // The title screen quietly warms only small resources shared by both graphics profiles.
 const preloadStart=html.indexOf('const SHARED_STARTUP_ASSET_PATHS=Object.freeze([');
 const preloadEnd=html.indexOf(']);',preloadStart);
 assert.ok(preloadStart>=0&&preloadEnd>preloadStart,'La portada debe declarar una lista explícita de recursos ligeros compartidos.');
 const preloadListSource=html.slice(preloadStart,preloadEnd);
 const preloadPaths=Array.from(preloadListSource.matchAll(/'([^']+)'/g),match=>match[1]);
 assert.deepEqual(preloadPaths,[
  './manifest.webmanifest',
  './icon.svg',
  './assets/asset-manifest.json',
  './scripts/nordic/beach-state.js',
  './scripts/nordic/coastal-interaction.js',
  './scripts/nordic/navigation-suite.js',
  './scripts/npc-village-brain-core.js',
  './scripts/npc-dialogue.css'
 ],'La precarga inicial debe limitarse a recursos comunes y pequeños.');
 for(const forbidden of ['babylon.js','.glb','assets/models','assets/textures','assets/audio','environmentSpecular']){
  assert.ok(!preloadListSource.includes(forbidden),'La portada no debe precargar recursos pesados: '+forbidden);
 }
 const preloadFunctionStart=html.indexOf('function prepareMinorStartupAssets()',preloadStart);
 const preloadFunctionEnd=html.indexOf('function chooseGraphicsProfile(',preloadFunctionStart);
 assert.ok(preloadFunctionStart>preloadStart&&preloadFunctionEnd>preloadFunctionStart,
  'La función de precarga debe estar separada de la selección del perfil.');
 const preloadFunction=html.slice(preloadFunctionStart,preloadFunctionEnd);
 assert.ok(preloadFunction.includes('requestAnimationFrame'),'La precarga debe esperar al primer fotograma.');
 assert.ok(preloadFunction.includes('Math.min(3,queue.length)'),'La precarga debe limitar las peticiones paralelas.');
 assert.ok(preloadFunction.includes('Promise.all('),'La precarga debe ejecutarse en paralelo y en segundo plano.');
 assert.ok(preloadFunction.includes("cache:'force-cache'"),'Los recursos deben reutilizar la caché.');
 for(const forbidden of ['bootEngine(','startGame(','loadHumanViking','BABYLON','SceneLoader','.glb']){
  assert.ok(!preloadFunction.includes(forbidden),'La precarga no debe iniciar el motor ni importar recursos 3D: '+forbidden);
 }
 const preloadSchedule=html.indexOf('scheduleMinorStartupAssetPreload();');
 const modeChooser=html.indexOf("document.getElementById('chooseQuality').addEventListener");
 assert.ok(preloadSchedule>0&&modeChooser>preloadSchedule,
  'La precarga debe programarse al abrir la portada, antes de elegir Calidad o Rendimiento.');
 assert.ok(html.includes("startPreflightMenuMusic(); // En dispositivos con autoplay permitido, suena antes del primer toque.\nscheduleMinorStartupAssetPreload();"),
  'La precarga silenciosa debe arrancar en la primera apertura de la portada.');
 assert.ok(html.includes('prepareMinorStartupAssets();'),
  'La selección del perfil debe reutilizar la misma precarga, sin duplicarla.');
 assert.ok(!html.includes('await prepareMinorStartupAssets()'),
  'La precarga ligera no puede bloquear la pantalla de identidad ni la carga completa.');
 assert.ok(html.includes('La preparación del mundo comenzará al continuar.'),
  'La pantalla de nombre no debe mostrar una barra de carga para estos recursos invisibles.');
 assert.ok(!html.includes('id="identityPrepBar"'),
  'No debe mostrarse un progreso de precarga que haga parecer que el juego ya está cargando.');
 for(const path of preloadPaths.filter(path=>path!=='./assets/asset-manifest.json')){
  assert.ok(sw.includes(path),'El recurso ligero debe formar parte de la caché compartida offline: '+path);
 }
 assert.ok(sw.includes('url.pathname.includes("/assets/")'),
  'El manifiesto debe quedar atendido por la caché de recursos del service worker.');
 assert.ok(sw.includes('./scripts/npc-village-brain-core.js?v=0.6.357-npcbrain7')&&sw.includes('url.pathname.endsWith("/scripts/npc-village-brain-core.js")')&&
  sw.includes('url.pathname.endsWith("/scripts/npc-dialogue.css")'),
  'Los módulos ligeros precargados deben servirse desde SHELL_CACHE, no solo figurar en la lista de instalación.');

console.log('OK: protagonist + initial-island NPC + scene/shaders block entry; fauna is bounded optional; no deferred import path.');
