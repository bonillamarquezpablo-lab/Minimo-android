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
assert.ok(html.includes('leftWing,rightWing,tail,wingFlapAxis'), 'The replacement gull must expose its named articulated anatomy.');
assert.ok(html.includes("bodyFlightAxis=wingFlapAxis==='z'?'x':'z'") && html.includes('visualRoot.rotation[bodyFlightAxis]=bodyFlightPitch') && html.includes('flightYawOffset'), 'The entire gull body must be pitched into a horizontal flight attitude, with heading aligned to its flight path.');
assert.ok(html.includes("const groups=inst.animationGroups||[];groups.forEach(group=>{try{group.stop();}catch(_){}});const fly=null;"),
  'The gull must not select a walk/idle body clip; it uses explicit articulated wing flight.');
assert.ok(!html.includes("groups.find(g=>/walk|fly|flap/i.test(g.name)"),
  'A walking animation must never be selected as the gull flight clip.');
assert.ok(html.includes("function findForestTreePlacement(x,z,canopyRadius)"),
  'Forest placement must validate the actual canopy radius against previous trees.');
assert.ok(html.includes("Math.max(forestTreeSpacingStats.minGapMeters,(canopyRadius+otherRadius)*1.12)"),
  'Tree crowns must maintain a wider measured clearance based on both canopy bounds.');
assert.ok(html.includes("const conifer=kind==='pine'||kind==='spruce'") && html.includes("Math.min(conifer?5.2:4.6,horizontalSpan*(conifer?0.70:0.62))"),
  'Pine and spruce canopy radii must account for their broader real model bounds.');
assert.ok(html.includes('minGapMeters:6.5') && html.includes('ring<=16') && html.includes('overlapPairs'),
  'Forest placement must use a wider relocation search and expose overlap diagnostics.');
assert.ok(html.includes('b.leftWing.rotation[b.wingFlapAxis]') && html.includes('b.rightWing.rotation[b.wingFlapAxis]'),
  'The new gull wings must flap around their actual pivot axis.');
assert.ok(html.includes('const flap=Math.sin(elapsed*8.8+b.phase)*.82,open=.78;') && html.includes('b.leftWingBaseRotation-open-flap') && html.includes('b.rightWingBaseRotation+open+flap'),
  'The gull must hold a visibly spread glide pose and use a broad, continuous wing stroke rather than a folded idle silhouette.');
assert.ok(buildSource.includes('node.rotationQuaternion.toEulerAngles()') && buildSource.includes('node.rotationQuaternion=null'),
 'Imported GLB quaternion rotations must be preserved before wing pivots switch to Euler animation.');

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
const gullTriangles=(gullJson.meshes||[]).reduce((total,mesh)=>total+(mesh.primitives||[]).reduce((subtotal,primitive)=>{
  if(primitive.mode!==undefined&&primitive.mode!==4)return subtotal;
  const accessor=primitive.indices===undefined?primitive.attributes?.POSITION:gullJson.accessors?.[primitive.indices];
  const count=primitive.indices===undefined?(gullJson.accessors?.[accessor]?.count||0):(accessor?.count||0);
  return subtotal+Math.floor(count/3);
},0),0);
assert.ok(gullTriangles>0&&gullTriangles<=7000,'La nueva gaviota debe conservar una malla ligera y anatómica (triángulos medidos: '+gullTriangles+').');
assert.ok((gullJson.materials||[]).length>0&&(gullJson.materials||[]).length<=2,'La gaviota debe conservar el material nativo de su plumaje.');
console.log('OK: bosque y mapas PBR intactos; gaviota anatómica con pivotes de alas/cola y escala física máxima 0,55 m.');
console.log(JSON.stringify({models,gullBytes:gullData.length,gullTriangles,gullMaterials:gullJson.materials.length},null,2));
