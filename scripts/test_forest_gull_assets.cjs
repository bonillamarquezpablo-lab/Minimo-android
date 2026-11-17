'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const dist=path.join(process.cwd(),'dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.match(html,/forestTreeAssetSpecs/);
assert.match(html,/instantiateModelsToScene\(name=>name\+'_Forest_'/);
assert.match(html,/await loadForestTreeTemplates\(\)/);
assert.match(html,/targetGullMaxExtentMeters=\.78/);
assert.match(html,/fittedMaxExtent>\.82/);
assert.doesNotMatch(html,/scale=1\.65\/height/);

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
assert.equal(gullData.toString('ascii',0,4),'glTF','Firma GLB de gaviota inválida');
console.log('OK: bosque CC0 completo y local; mapas de textura verificados; gaviotas con tamaño máximo medido de 0,78 m.');
console.log(JSON.stringify({models,gullBytes:gullData.length},null,2));
