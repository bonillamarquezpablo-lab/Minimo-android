'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/function loadWildlifeModels\(\)\s*\{\s*if\(!wildlifeModelsLoadPromise\)wildlifeModelsLoadPromise=loadWildlifeModelsOnce\(\)/);
assert.match(html,/await Promise\.all\(\[playerHumanLoadPromise,npcStartupPromise\]\)/);
assert.match(html,/const npcStartupPromise=coastalReferenceMode\?Promise\.resolve\(0\):startNpcHumanModels\(\)/);
assert.match(html,/if\(!requiredReady\)throw new Error\('NPC obligatorios de la isla inicial incompletos/);
assert.match(html,/const faunaTasks=\[\{name:'Fauna terrestre',promise:loadWildlifeModels\(\)\}\]/);
assert.match(html,/faunaTasks\.push\(\{name:'Gaviotas 3D',promise:loadRiggedCoastalGulls\(\)\}\)/);
assert.match(html,/await Promise\.allSettled\(faunaTasks\.map\(task=>task\.promise\)\)/);
assert.match(html,/const assetUrl=urls\[index\],controller=new AbortController\(\),timeout=setTimeout\(\(\)=>controller\.abort\(\),30000\)/);
assert.doesNotMatch(html,/const warriorPartsToLoad=isPerformanceMode\s*\?\s*\[\]/);
assert.doesNotMatch(html,/const civilianPartsToLoad=isPerformanceMode\s*\?\s*\[\]/);
assert.ok(html.includes('const animalCount=isPerformanceMode?0:(idx===0?3:0);'),'Quality fauna is limited to the initial island and Performance disables it.');
assert.match(html,/function timedGlbStage\(/);
assert.match(html,/function disposeLateGlbResult\(result,model,stage\)/);
assert.match(html,/pending\.then\(result=>\{if\(timedOut\)disposeLateGlbResult\(result,model,stage\);?\},\(\)=>\{\}\)/,
  'A GLB import that resolves after its timeout must be cleaned up.');
assert.doesNotMatch(html,/RECURSO OBLIGATORIO: importación de fauna sin finalizar/,
  'A timed-out optional wildlife load cannot keep the player at the loading screen.');
assert.match(html,/timeoutMs=60000/);
assert.match(html,/agotó el plazo de '\+timeoutMs\+' ms/);
assert.match(html,/window\.__elSinNombreGlbTimings=glbTimingRecords/);
assert.match(html,/originalFallback:true/);
console.log('OK: timed GLB stages clean up late imports; required NPC block entry and fauna remains optional.');
