'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const builder=fs.readFileSync('scripts/build_site.py','utf8');
const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const html=fs.readFileSync('index.html','utf8');
const worldInspection=fs.readFileSync('scripts/nordic/world-inspection.js','utf8');
const worldInspectionCore=fs.readFileSync('scripts/phase2-world-inspection-core.mjs','utf8');
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
assert.ok(builder.includes('def bake_procedural_animal_vertex_colors(path: Path, label: str) -> int:') &&
  builder.includes('primitive.setdefault("attributes", {})["COLOR_0"] = accessor_index') &&
  builder.includes('coat.get("algorithm") != "procedural-vertex-coat-v2"') &&
  builder.includes('coverage < 0.90'),
  'Every terrestrial animal must ship with a valid, sufficiently complete vertex-colour coat stream; a technically loaded but flat unshaded GLB must fail release validation.');
assert.match(html,/WILDLIFE_MODEL_DEFS=\{deer:/);
assert.match(html,/file:'Deer\.glb'/);
assert.match(html,/file:'Wolf\.glb'/);
assert.match(html,/file:'Stag\.glb'/);
assert.match(html,/function updateWildlife\(dt\)/);
for(const marker of ['visualIntegrity','playingAnimationGroups','textureReadiness','maxExtentMeters','result.meshes'])assert.ok(worldInspection.includes(marker),'Inspector per-animal capture is missing '+marker);
assert.ok(worldInspection.includes('function transformedLocalBounds(mesh, box)') &&
  worldInspection.includes("'skinned-bind-pose-local'") &&
  worldInspection.includes('const bindPoseBounds = isSkinned ? transformedLocalBounds(mesh, box) : null'),
  'Skinned wildlife diagnostics must transform local bind-pose bounds once, never use stale GPU world AABBs.');
assert.ok(html.includes('function transformedSkinnedBounds(mesh,boundingBox)') &&
  html.includes('const localBounds=isSkinned?transformedSkinnedBounds(mesh,bb):null') &&
  html.includes('if(isSkinned&&!localBounds)throw new Error'),
  'Wildlife normalization must transform local bind-pose bounds once and preserve the GLB root world transform.');
const boundsStart=html.indexOf(' function transformedSkinnedBounds(mesh,boundingBox){');
const boundsEnd=html.indexOf('function makeHeldEnemySword',boundsStart);
assert.ok(boundsStart>=0&&boundsEnd>boundsStart,'Production wildlife bounds functions must be available for deterministic scale regression.');
class Vec3 { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} clone(){return new Vec3(this.x,this.y,this.z);} }
const boundsSandbox={B:{Vector3:Vec3},scene:{incrementRenderId(){}},mesh:null};
const regressionBox={minimum:{x:-.5,y:0,z:-.4},maximum:{x:.5,y:1,z:.4},
  minimumWorld:{x:-80,y:-2,z:-30},maximumWorld:{x:80,y:142,z:30}};
boundsSandbox.mesh={skeleton:{name:'DeerRig'},numBoneInfluencers:4,computeWorldMatrix(){},
  getWorldMatrix(){return {m:[.8,0,0,0,0,1.42,0,0,0,0,.9,0,12,1.25,-3,1]};},
  getBoundingInfo(){return {boundingBox:regressionBox};}};
vm.runInNewContext(html.slice(boundsStart,boundsEnd)+String.fromCharCode(10)+'this.__measured=boundsForMeshes([mesh]);',boundsSandbox);
assert.equal(Number(boundsSandbox.__measured.height.toFixed(3)),1.42,'A stale 142 m GPU world AABB must not distort the 1.42 m local bind-pose deer during normalization.');
assert.equal(Number(boundsSandbox.__measured.width.toFixed(3)),.8);
assert.equal(Number(boundsSandbox.__measured.depth.toFixed(3)),.72);
assert.equal(Number(boundsSandbox.__measured.min.y.toFixed(3)),1.25);
const unskinnedSandbox={B:{Vector3:Vec3},scene:{incrementRenderId(){}},mesh:{
  computeWorldMatrix(){},getBoundingInfo(){return {boundingBox:{minimum:{x:0,y:0,z:0},maximum:{x:1,y:1,z:1},
    minimumWorld:{x:2,y:3,z:4},maximumWorld:{x:4,y:6,z:8}}};}
}};
vm.runInNewContext(html.slice(boundsStart,boundsEnd)+String.fromCharCode(10)+'this.__measured=boundsForMeshes([mesh]);',unskinnedSandbox);
assert.equal(unskinnedSandbox.__measured.width,2,'Unskinned meshes must retain Babylon native world bounds.');
assert.equal(unskinnedSandbox.__measured.height,3);
assert.ok(html.includes('for(let parent=mesh&&mesh.parent;parent;parent=parent.parent)ancestors.unshift(parent)') &&
  worldInspection.includes('for (let parent = mesh && mesh.parent; parent; parent = parent.parent) ancestors.unshift(parent)'),
  'Runtime and inspection bounds must refresh every ancestor matrix before measuring skinned children.');
assert.ok(html.includes("root.setParent(actor,true,true)") &&
  html.includes("heightError>heightTolerance") &&
  html.includes("renderedDimensions:{width:Number(finalBounds.width.toFixed(3))"),
  'Wildlife import must preserve GLB root world transforms and reject final bodies that miss their configured physical height.');
for(const marker of ['wildlife-species-missing','wildlife-animation-not-playing','wildlife-animation-clips-missing','wildlife-textures-not-ready'])assert.ok(worldInspectionCore.includes(marker),'Wildlife analysis is missing '+marker);
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
assert.ok(builder.includes("const softwareSkinningRenderer=/SwiftShader|llvmpipe|software/i.test(graphicsRenderer)") && builder.includes("const forceCpuSkinning=window.__ELSN_FORCE_CPU_SKINNING__===true,forceGpuSkinning=window.__ELSN_FORCE_GPU_SKINNING__===true") && builder.includes("if(forceCpuSkinning&&forceGpuSkinning)throw new Error") && builder.includes("const useCpuSkinning=forceCpuSkinning") && builder.includes("mesh.computeBonesUsingShaders=!useCpuSkinning") && builder.includes("mesh.alwaysSelectAsActiveMesh=true") && builder.includes("skeleton.prepare()"), "GPU skinning is the runtime default on every renderer; CPU skinning is opt-in diagnostics only. Mutually exclusive CPU/GPU overrides exist and skinned meshes avoid stale-bounds frustum culling.");
assert.ok(builder.includes("const useCpuSkinning=forceCpuSkinning||(!forceGpuSkinning&&softwareSkinningRenderer)") && !builder.includes("const useCpuSkinning=forceCpuSkinning||(!forceGpuSkinning&&(isTouchDevice||softwareSkinningRenderer))"), "Hardware mobile devices must use GPU skinning by default; CPU skinning remains an explicit diagnostic override and a software-renderer fallback only.");
assert.ok(html.includes("meshes.forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=!!(mesh.skeleton||Number(mesh.numBoneInfluencers)>0);});") && !html.includes("meshes.forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=false;});"), "The final fauna mesh setup must preserve alwaysSelectAsActiveMesh for every skinned mesh so animated bodies cannot disappear behind bind-pose bounding boxes.");
assert.ok(builder.includes("clips.walk===clips.idle||clips.run===clips.walk||clips.run===clips.idle"), "Animals must not silently substitute idle for walking or walking for galloping.");
assert.ok(builder.includes("nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5)") &&
  builder.includes("alignment:{source:'native-Fly-midpoint'") &&
  builder.includes("alignmentDot<.995"),
  "The gull body axis must be aligned from the evaluated native Fly pose, then rejected if residual pitch is not horizontal.");
assert.ok(builder.includes('("idle", "walk", "gallop")'), "Every terrestrial species must provide the real Idle, Walk and Gallop GLB clips.");
console.log('WILDLIFE RUNTIME CONTRACT: PASS (3 complete terrestrial species in both profiles, GLB integrity, skeletons, clips, textures, transactional cleanup and blocking readiness).');
