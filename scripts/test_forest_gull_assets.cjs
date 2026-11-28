'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const dist=path.join(process.cwd(),'dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const buildSource=fs.readFileSync(path.join(process.cwd(),'scripts','build_site.py'),'utf8');
assert.match(html,/forestTreeAssetSpecs/);
const animalTextureGateStart=html.indexOf('async function waitForAnimalTextures(meshes,kind,timeoutMs=30000){');
const animalTextureGateEnd=html.indexOf('\n }',animalTextureGateStart);
assert.ok(animalTextureGateStart>=0&&animalTextureGateEnd>animalTextureGateStart,'La validación de texturas/rig de fauna debe existir en el build final.');
const animalTextureGate=html.slice(animalTextureGateStart,animalTextureGateEnd);
assert.match(animalTextureGate,/texture\.isReady\(\)/,'La carga previa debe esperar las texturas reales.');
const animalTextureGateCode=animalTextureGate;
assert.doesNotMatch(animalTextureGateCode,/mesh\.isReady\(true\)/,'La carga previa no debe forzar una compilación repetida de cada material animal.');
assert.match(animalTextureGate,/shaderReadiness:'deferred-to-initial-view-warmup'/,'La preparación de shaders debe quedar registrada para la barrera de render de la vista inicial.');
assert.ok(html.includes("typeof window.__ELSN_ADAPTIVE_RESOLUTION__==='function'?window.__ELSN_ADAPTIVE_RESOLUTION__():null"),'The adaptive-resolution diagnostics getter must be called using its exact published name.');
assert.ok(!html.includes("window.__ELSN_ADAPTIVE_RESOLUTION__?window.__ELSN_ADAPTIVE_RESOLUTION():null"),'A mismatched adaptive-resolution getter must never ship.');
assert.match(html,/container\.addAllToScene\(\)/,'Each forest species must be loaded once as a shared template.');
assert.match(html,/sourceMesh\.createInstance\(/,'Placed trees must share template geometry through Babylon InstancedMesh.');
assert.match(html,/window\.__ELSN_FOREST_INSTANCING_STATS__/,'Forest instancing must expose template/instance counts.');
assert.doesNotMatch(html,/spec\.container\.instantiateModelsToScene\(name=>name\+'_Forest_'+serial/,'Tree placement must not clone and re-merge the complete GLB per tree.');
assert.match(html,/await loadForestTreeTemplates\(\)/);
assert.match(html,/targetGullMaxExtentMeters=\.55/);
assert.match(html,/fittedMaxExtent>\.57/);
assert.doesNotMatch(html,/scale=1\.65\/height/);
assert.ok(html.includes('const requiredFlightParts=[leftWing,rightWing,tail,head,neck,leftHindUpLeg,rightHindUpLeg,leftHindLeg,rightHindLeg]'), 'The replacement gull must require all named anatomical flight pivots.');
assert.ok(html.includes('const gullSkinningMeshes=meshes.filter(mesh=>mesh&&mesh.skeleton&&Number(mesh.numBoneInfluencers)>0)') &&
  html.includes('mesh.computeBonesUsingShaders=!useCpuSkinning') &&
  html.includes('const softwareSkinningRenderer=/SwiftShader|llvmpipe|software/i.test(graphicsRenderer)') &&
  html.includes("gullSkeletons.forEach(skeleton=>{try{if(typeof skeleton.prepare==='function')skeleton.prepare();}"),
  'Rigged gulls must use the same explicit CPU/GPU skinning policy as land fauna and prepare their skeletons before rendering.');
assert.ok(html.includes('mesh.material.backFaceCulling=false') && html.includes('mesh.material.twoSidedLighting=true'),
  'The GLB double-sided feather/body material must remain renderable when imported roots contain a mirrored transform.');
assert.ok(html.includes("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;") &&
  html.includes("El GLB de gaviota no contiene un clip Fly válido.") &&
  html.includes("if(group!==nativeFlightClip)group.stop();") &&
  html.includes("flightRig={actor,visualRoot,importedRoots:roots,hierarchyNodes:rigNodes,meshes,skinningMode:useCpuSkinning?'cpu':'gpu',skinnedMeshCount:gullSkinningMeshes.length,skeletonCount:gullSkeletons.length,firstFlightMesh:meshes.find(mesh=>mesh&&mesh.getTotalVertices&&mesh.getTotalVertices()>0)||null,bodyAxis,alignment:{source:'native-Fly-midpoint',pitchResidualDegrees:alignmentPitchDegrees,forwardDot:alignmentDot},leftWing:{node:leftWing},rightWing:{node:rightWing},tail:{node:tail},head:{node:head},neck:{node:neck},leftHindUpLeg:{node:leftHindUpLeg},rightHindUpLeg:{node:rightHindUpLeg},leftHindLeg:{node:leftHindLeg},rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip};") &&
  html.includes("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to);"),
  'Every gull must retain all nine anatomical pivots and start its complete native Fly clip.');
const nativeClipIndex=html.indexOf("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;");
const flightRigIndex=html.indexOf("const flightRig={actor,visualRoot,importedRoots:roots,hierarchyNodes:rigNodes,meshes,skinningMode:useCpuSkinning?'cpu':'gpu',skinnedMeshCount:gullSkinningMeshes.length,skeletonCount:gullSkeletons.length,firstFlightMesh:meshes.find(mesh=>mesh&&mesh.getTotalVertices&&mesh.getTotalVertices()>0)||null,bodyAxis,alignment:{source:");
const nativeClipStartIndex=html.indexOf("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to);");
const nativeFlightPoseIndex=html.indexOf("nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5);");
assert.ok(nativeClipIndex>=0&&nativeClipIndex<nativeClipStartIndex&&nativeClipStartIndex<nativeFlightPoseIndex&&nativeFlightPoseIndex<flightRigIndex,
  'The native Fly clip must be declared and evaluated at its midpoint before measuring the body axis and publishing the completed diagnostic rig.');
assert.ok(!html.includes("if(fly){fly.start")&&!html.includes("animation:fly"),
  'No legacy fly variable or second animation-selection path may remain.');
assert.ok(html.includes("flightRig,animation:nativeFlightClip,phase:i*1.25") && html.includes("alignAxis=(from,to)") &&
  html.includes("visualRoot.rotationQuaternion=alignAxis(bodyAxis,new B.Vector3(0,0,1))") &&
  html.includes("groups.find(group=>/fly/i") &&
  html.includes("animationGroup:nativeFlightClip") &&
  html.includes("flight.speedRatio=.96+.08*Math.sin(flightElapsed*.7+phase)") && html.includes("if(!flight.isPlaying)flight.start(true,1,flight.from,flight.to);") &&
  !html.includes("Seagull_Flight_Loop_") && !html.includes("addFlightTrack("),
  'Each gull must align its body horizontally and animate the entire imported GLB Fly clip without a discarded synthetic rig.');
assert.ok(html.includes("scene.setRenderingAutoClearDepthStencil(1,false,false,false)") && html.includes("footprintMesh.renderingGroupId=1"),
  'Transparent footprints in rendering group 1 must preserve opaque-world depth.');
assert.ok(html.includes("function findForestTreePlacement(x,z,canopyRadius)"),
  'Forest placement must validate the actual canopy radius against previous trees.');
assert.ok(html.includes("Math.max(forestTreeSpacingStats.minGapMeters,(canopyRadius+otherRadius)*1.12)"),
  'Tree crowns must maintain a wider measured clearance based on both canopy bounds.');
assert.ok(html.includes("const conifer=kind==='pine'||kind==='spruce'") && html.includes("Math.min(conifer?5.2:4.6,horizontalSpan*(conifer?0.70:0.62))"),
  'Pine and spruce canopy radii must account for their broader real model bounds.');
assert.ok(html.includes('minGapMeters:6.5') && html.includes('ring<=16') && html.includes('overlapPairs'),
  'Forest placement must use a wider relocation search and expose overlap diagnostics.');
assert.ok(!html.includes('b.leftWing.rotation[b.wingFlapAxis]') && !html.includes('b.rightWing.rotation[b.wingFlapAxis]'),
  'The imported skeleton animation must not be overridden by legacy synthetic wing rotations.');
assert.ok(html.includes('gullWingFlapObserver=scene.onBeforeRenderObservable.add') && html.includes('nativeTarget&&now-state.lastMotionAt<.85') && html.includes('const flap=Math.sin(now*7.1+(Number(bird.phase)||0))*.42*item.sign'), 'When native Fly stops moving a wing pivot, an articulated fallback must flap both wings.');
assert.ok(html.includes('clampGullFlight(Number(b.speed)||.18,.12,.28)') && html.includes('speed:.18+i*.014') && html.includes("b.flightMode=gliding?'glide':'flap';"), 'Gull cruise speed must remain bounded and include natural flap/glide phases.');
assert.ok(html.includes("flightRig={actor,visualRoot,importedRoots:roots,hierarchyNodes:rigNodes,meshes,skinningMode:useCpuSkinning?'cpu':'gpu',skinnedMeshCount:gullSkinningMeshes.length,skeletonCount:gullSkeletons.length,firstFlightMesh:meshes.find(mesh=>mesh&&mesh.getTotalVertices&&mesh.getTotalVertices()>0)||null,bodyAxis,alignment:{source:'native-Fly-midpoint'") &&
  html.includes("alignment:{source:'native-Fly-midpoint',pitchResidualDegrees:alignmentPitchDegrees,forwardDot:alignmentDot}") &&
  html.includes("rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip}"),
  'The live gull diagnostic rig must expose its imported hierarchy, rendered meshes, two wings, tail, head, neck and both articulated legs.');
assert.ok(html.includes("nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5)") &&
  html.includes("alignment:{source:'native-Fly-midpoint'") && html.includes("alignmentDot<.995"),
  'The measured body alignment must come from the actual native Fly pose and reject residual tilt.');
assert.ok(buildSource.includes("alignAxis=(from,to)") && buildSource.includes("visualRoot.rotationQuaternion=alignAxis") &&
  buildSource.includes("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to)") &&
  buildSource.includes("rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip") &&
  !buildSource.includes("addFlightTrack("),
 'The bird body must be aligned horizontally and play the complete native GLB flight clip without constructing a redundant animation.');

function inspectGlb(relative,minimumBytes,requiresTexture){
 const file=path.join(dist,relative);
 assert.ok(fs.existsSync(file),'Falta recurso compilado: '+relative);
 const data=fs.readFileSync(file);
 assert.ok(data.length>=minimumBytes,'GLB demasiado pequeño: '+relative+' ('+data.length+' bytes)');
 assert.equal(data.toString('ascii',0,4),'glTF','Firma GLB inválida: '+relative);
 assert.equal(data.readUInt32LE(4),2,'Versión GLB inesperada: '+relative);
 assert.equal(data.readUInt32LE(8),data.length,'Longitud GLB incoherente: '+relative);
 const jsonLength=data.readUInt32LE(12),jsonType=data.readUInt32LE(16);
 assert.equal(jsonType,0x4e4f534a,'No aparece el chunk JSON GLB: '+relative);
 const json=JSON.parse(data.toString('utf8',20,20+jsonLength));
 assert.ok(Array.isArray(json.meshes)&&json.meshes.length>0,'GLB sin mallas: '+relative);
 assert.ok(Array.isArray(json.materials)&&json.materials.length>0,'GLB sin materiales: '+relative);
 const textureCount=(json.textures||[]).length,imageCount=(json.images||[]).length;
 if(requiresTexture)assert.ok(textureCount>0&&imageCount>0,'El modelo debería incluir mapas de textura: '+relative);
 return {file:relative,bytes:data.length,meshes:json.meshes.length,materials:json.materials.length,textures:textureCount,images:imageCount};
}
const models=[
 inspectGlb('assets/models/forest/mature-scots-pine-tree.glb',500000,true),
 inspectGlb('assets/models/forest/mature-norway-spruce-tree.glb',500000,true),
 inspectGlb('assets/models/forest/oak-textured.glb',1500000,true)
];
assert.ok(models[2].meshes<=8,'Oak source mesh count is not compact enough for a mobile forest');
assert.match(html,/mergeStaticDecorByMaterial\(templateRoot,'NorseForestTemplate_'/,'Each species template must be merged once by PBR material before instances are created');
const gull=path.join(dist,'assets/models/Seagull.glb');
assert.ok(fs.existsSync(gull),'Falta GLB de gaviota');
const gullData=fs.readFileSync(gull);
assert.ok(gullData.length>=2_500_000,'La nueva gaviota anatómica debe conservar el modelo completo de alta definición.');
assert.equal(gullData.toString('ascii',0,4),'glTF','Firma GLB de gaviota inválida');
assert.equal(gullData.readUInt32LE(4),2,'Versión GLB de gaviota inesperada');
assert.equal(gullData.readUInt32LE(8),gullData.length,'Longitud GLB de gaviota incoherente');
const gullJsonLength=gullData.readUInt32LE(12);
assert.equal(gullData.readUInt32LE(16),0x4e4f534a,'Falta el chunk JSON del GLB de gaviota');
const gullJson=JSON.parse(gullData.toString('utf8',20,20+gullJsonLength));
const gullNodeNames=(gullJson.nodes||[]).map(node=>String(node.name||''));
assert.ok(gullNodeNames.some(name=>/^LeftWing(?:_|$)/i.test(name)),'La gaviota debe tener el pivote LeftWing');
assert.ok(gullNodeNames.some(name=>/^RightWing(?:_|$)/i.test(name)),'La gaviota debe tener el pivote RightWing');
assert.ok(gullNodeNames.some(name=>/^Tail(?:_|$)/i.test(name)),'La gaviota debe tener cola articulada');
for(const part of ['Head','Neck','Jaw','LeftHindUpLeg','RightHindUpLeg','LeftHindLeg','RightHindLeg'])assert.ok(gullNodeNames.some(name=>new RegExp('^'+part+'(?:_|$)','i').test(name)),'La gaviota debe incluir la articulación '+part+' para adoptar una postura de vuelo realista.');
assert.ok(gullNodeNames.some(name=>/^LeftHindUpLeg(?:_|$)/i.test(name)) &&
  gullNodeNames.some(name=>/^RightHindUpLeg(?:_|$)/i.test(name)) &&
  gullNodeNames.some(name=>/^LeftHindLeg(?:_|$)/i.test(name)) &&
  gullNodeNames.some(name=>/^RightHindLeg(?:_|$)/i.test(name)),
  'The source model must include both articulated legs for a tucked flight silhouette.');
const gullTriangles=(gullJson.meshes||[]).reduce((total,mesh)=>total+(mesh.primitives||[]).reduce((subtotal,primitive)=>{
  if(primitive.mode!==undefined&&primitive.mode!==4)return subtotal;
  const accessor=primitive.indices===undefined?primitive.attributes?.POSITION:gullJson.accessors?.[primitive.indices];
  const count=primitive.indices===undefined?(gullJson.accessors?.[accessor]?.count||0):(accessor?.count||0);
  return subtotal+Math.floor(count/3);
},0),0);
assert.ok(gullTriangles>0&&gullTriangles<=7000,'La nueva gaviota debe conservar una malla ligera y anatómica (triángulos medidos: '+gullTriangles+').');
assert.ok((gullJson.materials||[]).length>0&&(gullJson.materials||[]).length<=2,'La gaviota debe conservar el material nativo de su plumaje.');
assert.ok(html.includes("b.root.computeWorldMatrix(true)") && html.includes("node.unfreezeWorldMatrix()") && html.includes("flightLastStepMeters") && html.includes("flightLastVisualStepMeters") && html.includes("hierarchyNodes:rigNodes,meshes") && html.includes("mesh.computeWorldMatrix(true)") && html.includes("mesh.isVisible=true;mesh.visibility=1"), 'Gull flight must recover and refresh the imported rig and verify the rendered mesh moves.');
assert.ok(html.includes("scene.onBeforeRenderObservable.add") && html.includes("updateAmbientGullFlight(now)") && !html.includes("updateAmbientGullFlight(now*.001);"), 'Gull root movement must be applied after Babylon animation evaluation, immediately before rendering.');
assert.ok(html.includes("holderParentIsModelPivot") && html.includes("holderHandDistance") && html.includes("equippedWeapon==='club'?realPlayerModelPivot"), 'The starting club must use a model-root anchor recalculated from the animated hand.');
assert.ok(html.includes("renderedMeshPosition:renderedMeshWorld") && html.includes("visualPosition:visual"), 'Gull acceptance must inspect the rendered visual hierarchy world position, not only the actor local position.');
console.log('OK: bosque y mapas PBR intactos; gaviota anatómica con pivotes de alas/cola y escala física máxima 0,55 m.');
console.log(JSON.stringify({models,gullBytes:gullData.length,gullTriangles,gullMaterials:gullJson.materials.length},null,2));

assert.ok(html.includes("actor.position=v(Math.cos(i*1.25)*(18+i*2.5)-36,10+i%3*1.45,Math.sin(i*1.25)*(18+i*2.5)-18)"), 'Each gull must start at its own orbital phase instead of stacking all five roots at the same X/Z coordinate.');
assert.ok(html.includes('function updateAmbientGullFlight(nowSeconds){') && html.includes('window.__ELSN_GULL_FLIGHT_RENDER__={active:true,frameTicks:0,updatedBirds:0,updateErrors:0,worldMatrixRecoveries:0,stalledBirds:0,lastTimestamp:null,lastError:null};') && html.includes('updateAmbientGullFlight(now);') && html.includes("gullFlightRenderState") && html.includes('b.flightUpdateTicks=(Number(b.flightUpdateTicks)||0)+1;') && html.includes('if(!Number.isFinite(b.flightClockOrigin))b.flightClockOrigin=nowSeconds;') && html.includes('flightElapsed=Math.max(0,nowSeconds-b.flightClockOrigin)') && html.includes('flightDistanceMeters') && html.includes('flightStallSeconds') && html.includes('flightVisualStallSeconds') && html.includes('centerX=homeCenterX+8*Math.sin(flightElapsed*.035+phase*.8)') && html.includes("if(typeof node.setEnabled==='function'&&!node.isEnabled())node.setEnabled(true);") && html.includes('if(!flight.isPlaying)flight.start(true,1,flight.from,flight.to);'), 'All live gulls must advance inside the actual engine render loop, recover disabled roots and restart their native Fly clip.');
assert.ok(!html.includes('ambientBirds.forEach(b=>{if(!worldEntityVisualDue(b,b.root.position.x,b.root.position.z))return;'), 'The five-bird flock must not freeze behind the generic world-entity visual cadence.');
