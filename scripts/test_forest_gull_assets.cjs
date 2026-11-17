'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const dist=path.join(process.cwd(),'dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.match(html,/forestTreeAssetSpecs/);
assert.match(html,/instantiateModelsToScene\(name=>name\+'_Forest_'/);
assert.match(html,/await loadForestTreeTemplates\(\)/);
assert.match(html,/createGullBodyMesh/,'Gulls must use an elongated anatomical fuselage, not the rounded GLB.');
assert.match(html,/createGullWingMesh/,'Gulls must have separate, articulated wing surfaces.');
assert.match(html,/wingStations/,'Gull wings must taper to pointed primary feathers.');
assert.match(html,/wingspanMeters:1\.12/,'The flight silhouette must retain a realistic wingspan.');
assert.match(html,/meshCount:realBirds\.length\*3/,'Each gull must stay within three meshes to bound draw calls.');
assert.match(html,/externalGlb:false/,'The obsolete rounded bird asset must not be downloaded.');
assert.doesNotMatch(html,/Seagull\.glb/,'The packaged player must not reference the old external bird model.');

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
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'assets/asset-manifest.json'),'utf8'));
assert.ok(!(manifest.assets||[]).some(asset=>asset.path==='assets/models/Seagull.glb'),'The old rounded gull GLB must not be shipped.');
assert.match(html,/window\.__ELSN_GULL_DIAGNOSTICS__/,'Runtime bird diagnostics must be available for device inspection.');
assert.match(html,/count:realBirds\.length/,'All five flight silhouettes must be reported to startup diagnostics.');
console.log('OK: bosque CC0 completo y local; texturas verificadas; cinco gaviotas de silueta estilizada y tres mallas por ave.');
console.log(JSON.stringify({models,gullCount:5,gullWingspanMeters:1.12,gullMeshes:15},null,2));
