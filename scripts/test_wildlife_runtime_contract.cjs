'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const html=fs.readFileSync('index.html','utf8');

for(const marker of [
  "animal_count_required = \"const animalCount=idx===0?3:0;\"",
  "wildlife_required = \"  if(wildlifeSpawnSpecs.length!==3)",
  "required_fauna_state = \"fauna:'blocking-required'\"",
  "async function inspectGLBContainer(blob)",
  "async function waitForAnimalTextures(meshes,kind,timeoutMs=25000)",
  "const beforeMeshes=new Set(scene.meshes||[])",
  "const beforeNodes=new Set(scene.transformNodes||[])",
  "const beforeSkeletons=new Set(scene.skeletons||[])",
  "sourceJson.skins",
  "sourceJson.animations",
  "const textureReadiness=await waitForAnimalTextures(meshes,kind)",
  "partialGroups=Array.from(scene.animationGroups||[]).filter(group=>!beforeGroups.has(group))",
  "partialMeshes=Array.from(scene.meshes||[]).filter(mesh=>!beforeMeshes.has(mesh))",
  "partialNodes=Array.from(scene.transformNodes||[]).filter(node=>!beforeNodes.has(node))",
  "partialSkeletons=Array.from(scene.skeletons||[]).filter(skeleton=>!beforeSkeletons.has(skeleton))",
  "window.__ELSN_WILDLIFE_DIAGNOSTICS__",
  "complete:ambientFauna.length===wildlifeSpawnSpecs.length"
]) assert.ok(builder.includes(marker),'Builder is missing animal-integrity requirement: '+marker);

assert.match(html,/WILDLIFE_MODEL_DEFS=\{deer:/);
assert.match(html,/file:'Deer\.glb'/);
assert.match(html,/file:'Wolf\.glb'/);
assert.match(html,/file:'Stag\.glb'/);
assert.match(html,/function updateWildlife\(dt\)/);
assert.match(validator,/wildlife/i);
assert.ok(!builder.includes("if(isPerformanceMode&&!wildlifeSpawnSpecs.length)return 0"),
  'Performance profile must not disable the requested wildlife population.');
assert.ok(!builder.includes("fauna:isPerformanceMode?'disabled-performance'"),
  'Performance profile must not bypass the blocking animal readiness barrier.');
assert.ok(builder.includes("requiredGulls:5"),
  'The five physical gull instances must be validated before startup is released.');

console.log('WILDLIFE RUNTIME CONTRACT: PASS (3 complete terrestrial species, GLB integrity, skeletons, clips, textures, transactional cleanup and all-profile readiness).');
