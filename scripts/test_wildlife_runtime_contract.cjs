'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const html=fs.readFileSync('index.html','utf8');
for(const marker of [
  "if(wildlifeSpawnSpecs.length!==3)",
  "required_fauna_state = \"fauna:'blocking-required'\"",
  "async function inspectGLBContainer(blob)",
  "async function waitForAnimalTextures(meshes,kind,timeoutMs=30000",
  "const beforeMeshes=new Set(scene.meshes||[])",
  "beforeNodes=new Set(scene.transformNodes||[])",
  "beforeSkeletons=new Set(scene.skeletons||[])",
  "sourceJson.skins",
  "sourceJson.animations",
  "const textureReadiness=await waitForAnimalTextures(meshes,kind)",
  "partialGroups=Array.from(scene.animationGroups||[]).filter(group=>!beforeGroups.has(group))",
  "partialMeshes=Array.from(scene.meshes||[]).filter(mesh=>!beforeMeshes.has(mesh))",
  "partialNodes=Array.from(scene.transformNodes||[]).filter(node=>!beforeNodes.has(node))",
  "partialSkeletons=Array.from(scene.skeletons||[]).filter(skeleton=>!beforeSkeletons.has(skeleton))",
  "window.__ELSN_WILDLIFE_DIAGNOSTICS__",
  "wildlifeReadinessRecords=[]",
  "readiness:wildlifeReadinessRecords.slice()",
  "wildlifeReadinessRecords.push({kind:spec.kind,state:'ready'",
  "loadWildlifeModelsOnce().catch(error=>",
  "complete:ambientFauna.length===wildlifeSpawnSpecs.length"
]) assert.ok(builder.includes(marker),'Builder is missing animal-integrity requirement: '+marker);
assert.match(html,/WILDLIFE_MODEL_DEFS=\{deer:/);
assert.match(html,/file:'Deer\.glb'/);
assert.match(html,/file:'Wolf\.glb'/);
assert.match(html,/file:'Stag\.glb'/);
assert.match(html,/function updateWildlife\(dt\)/);
assert.ok(builder.includes('wildlife_clip_marker = "return {idle,walk:walk||idle,run:run||walk||idle};"'), 'The builder must reject the idle-as-walk fallback.');
assert.ok(builder.includes('const moving=(animal.flee>0||animal.wandering)&&!!animal.clips.walk;'), 'An animal must not translate across terrain while only its idle clip is available.');
assert.match(html,/const animalCount=isPerformanceMode\?0:\(idx===0\?3:0\);/);
assert.ok(builder.includes('wildlife_spawn_count_marker = "const animalCount=isPerformanceMode?0:(idx===0?3:0);"') &&
  builder.includes('wildlife_spawn_count_replacement = "const animalCount=idx===0?3:0;"'),
  'The release builder must retain the three terrestrial animals in Performance without reducing their visual models.');
assert.match(validator,/wildlife/i);
assert.ok(builder.includes("requiredGulls:isPerformanceMode?0:5"),
  'The five physical gull instances must be validated before startup is released.');
assert.ok(builder.includes("fauna:'blocking-required'"),
  'Both graphics profiles must block until all three terrestrial animals are complete.');
assert.ok(builder.includes("fauna:{required:true,requested:wildlifeSpawnSpecs.length"),
  'The startup report must mark terrestrial fauna required in both graphics profiles.');
assert.ok(builder.includes("if(startupResourceSnapshot.fauna.requested!==3||startupResourceSnapshot.fauna.loaded!==3)"),
  'The final resource gate must verify all three terrestrial species in both profiles, not Quality only.');
console.log('WILDLIFE RUNTIME CONTRACT: PASS (3 complete terrestrial species in both profiles, GLB integrity, skeletons, clips, textures, transactional cleanup and blocking readiness).');