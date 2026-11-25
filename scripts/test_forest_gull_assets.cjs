'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const dist=path.join(process.cwd(),'dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const buildSource=fs.readFileSync(path.join(process.cwd(),'scripts','build_site.py'),'utf8');
assert.match(html,/forestTreeAssetSpecs/);
assert.match(html,/instantiateModelsToScene\(name=>name\+'_Forest_'/);
assert.match(html,/await loadForestTreeTemplates\(\)/);
assert.match(html,/targetGullMaxExtentMeters=\.55/);
assert.match(html,/fittedMaxExtent>\.57/);
assert.doesNotMatch(html,/scale=1\.65\/height/);
assert.ok(html.includes('const requiredFlightParts=[leftWing,rightWing,tail,head,neck,leftHindUpLeg,rightHindUpLeg,leftHindLeg,rightHindLeg]'), 'The replacement gull must require all named anatomical flight pivots.');
assert.ok(html.includes("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;") &&
  html.includes("El GLB de gaviota no contiene un clip Fly válido.") &&
  html.includes("if(group!==nativeFlightClip)group.stop();") &&
  html.includes("flightRig={actor,visualRoot,bodyAxis,alignment:{source:'native-Fly-midpoint',pitchResidualDegrees:alignmentPitchDegrees,forwardDot:alignmentDot},leftWing:{node:leftWing},rightWing:{node:rightWing},tail:{node:tail},head:{node:head},neck:{node:neck},leftHindUpLeg:{node:leftHindUpLeg},rightHindUpLeg:{node:rightHindUpLeg},leftHindLeg:{node:leftHindLeg},rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip};") &&
  html.includes("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to);"),
  'Every gull must retain all nine anatomical pivots and start its complete native Fly clip.');
const nativeClipIndex=html.indexOf("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;");
const flightRigIndex=html.indexOf("const flightRig={actor,visualRoot,bodyAxis,alignment:{source:'native-Fly-midpoint'");
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
assert.ok(html.includes('Math.max(.18,Number(b.speed))') && html.includes('speed:.18+i*.014'), 'Gull motion must stay perceptible rather than almost static.');
assert.ok(html.includes("flightRig={actor,visualRoot,bodyAxis,alignment:{source:'native-Fly-midpoint'") &&
  html.includes("flightRig={actor,visualRoot,bodyAxis,alignment:{source:'native-Fly-midpoint',pitchResidualDegrees:alignmentPitchDegrees,forwardDot:alignmentDot}") &&
  html.includes("rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip}"),
  'The live gull diagnostic rig must expose the two wings, tail, head, neck and both articulated legs.');
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
assert.match(html,/mergeStaticDecorByMaterial/,'Each static GLB tree must be merged by PBR material before rendering');
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
assert.ok(html.includes("b.root.computeWorldMatrix(true)") && html.includes("node.unfreezeWorldMatrix()") && html.includes("flightLastStepMeters"), 'Gull flight must refresh its world transform, recover frozen matrices and expose a per-frame movement watchdog.');
assert.ok(html.includes("b.root.getChildMeshes(false)") &&
  html.includes("b.flightTransformNodes=descendants.filter(node=>node&&typeof node.computeWorldMatrix==='function')") &&
  html.includes("for(const node of b.flightTransformNodes)node.computeWorldMatrix(true)") &&
  html.includes("worldPosition:world?{x:world.x,y:world.y,z:world.z}:null"),
  'Gull flight must recover frozen imported visual nodes and expose actual visual-root world movement.');
console.log('OK: bosque y mapas PBR intactos; gaviota anatómica con pivotes de alas/cola y escala física máxima 0,55 m.');
console.log(JSON.stringify({models,gullBytes:gullData.length,gullTriangles,gullMaterials:gullJson.materials.length},null,2));

assert.ok(html.includes("actor.position=v(Math.cos(i*1.25)*(18+i*2.5)-36,10+i%3*1.45,Math.sin(i*1.25)*(18+i*2.5)-18)"), 'Each gull must start at its own orbital phase instead of stacking all five roots at the same X/Z coordinate.');
assert.ok(html.includes('function updateAmbientGullFlight(nowSeconds){') && html.includes('window.__ELSN_GULL_FLIGHT_RENDER__={active:true,frameTicks:0,updatedBirds:0,updateErrors:0,worldMatrixRecoveries:0,stalledBirds:0,lastTimestamp:null,lastError:null};') && html.includes('updateAmbientGullFlight(now*.001);') && html.includes('b.flightUpdateTicks=(Number(b.flightUpdateTicks)||0)+1;') && html.includes('flightElapsed=Math.max(0,nowSeconds-b.flightClockOrigin)') && html.includes("if(typeof b.root.isEnabled==='function'&&!b.root.isEnabled())b.root.setEnabled(true);") && html.includes('if(!flight.isPlaying)flight.start(true,1,flight.from,flight.to);'), 'All live gulls must advance inside the actual engine render loop, recover disabled roots and restart their native Fly clip.');
assert.ok(!html.includes('ambientBirds.forEach(b=>{if(!worldEntityVisualDue(b,b.root.position.x,b.root.position.z))return;'), 'The five-bird flock must not freeze behind the generic world-entity visual cadence.');
