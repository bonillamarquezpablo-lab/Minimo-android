import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT=path.resolve('artifacts/hrafn-geometry');
const FILE=path.join(OUT,'hrafn-geometry-measurements.json');
const BASE_URL=process.env.HRAFN_TEST_URL||'http://127.0.0.1:4176/';
const report={schema:1,build:null,branch:process.env.GITHUB_REF_NAME||null,commit:process.env.GITHUB_SHA||null,
 method:'live Babylon scene geometry; no screenshot-derived measurements',
 conditions:{tide:'high',tideOffsetMeters:0.28,waveTimeSamples:48,waveTimeStepSeconds:1,
 lodCamera:'30 m seaward of runtime coast-radius estimate, 2.5 m above mean sea level',
 ray:'actual Babylon scene.pickWithRay from the offshore camera to the measured structure base'},
 startedAt:new Date().toISOString(),finishedAt:null,sceneCaptured:false,
 meshDiscovery:{waterCandidates:[],terrainCandidates:[]},structures:[],phases:[],errors:[],verdict:'incomplete'};
function save(){fs.mkdirSync(OUT,{recursive:true});const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');fs.renameSync(tmp,FILE);}
async function phase(name,fn){const t=Date.now();try{const v=await fn();report.phases.push({name,status:'completed',durationMs:Date.now()-t});return v;}catch(e){report.phases.push({name,status:'failed',durationMs:Date.now()-t,error:String(e?.stack||e)});throw e;}}
const round=(v,n=4)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(n)):null;

async function main(){
 fs.mkdirSync(OUT,{recursive:true});let browser=null,page=null;
 try{
  browser=await phase('launch chromium',()=>chromium.launch({headless:true,timeout:60000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage']}));
  const context=await browser.newContext({viewport:{width:430,height:768},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
  await page.addInitScript(()=>{
   let BValue;
   const hook=B=>{try{if(!B?.Scene?.prototype||B.Scene.prototype.__elsnMeasureHook)return;const original=B.Scene.prototype.render;Object.defineProperty(B.Scene.prototype,'__elsnMeasureHook',{value:true});B.Scene.prototype.render=function(...args){window.__ELSN_MEASURE_SCENE__=this;window.__ELSN_MEASURE_BABYLON__=B;return original.apply(this,args);};}catch(_){}};
   try{Object.defineProperty(window,'BABYLON',{configurable:true,enumerable:true,get(){return BValue;},set(v){BValue=v;hook(v);}});}catch(_){}
  });
  await phase('load game test runtime',()=>page.goto(BASE_URL+'?test=1',{waitUntil:'domcontentloaded',timeout:90000}));
  const audio=page.locator('#audioGateStart');
  await phase('select full quality',async()=>{if(await audio.isVisible().catch(()=>false))await audio.click();await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});await page.locator('#chooseQuality').click();});
  await phase('continue startup',async()=>{await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});await page.locator('#continueUnnamed').click();});
  await phase('wait for world',()=>page.waitForFunction(()=>window.__ELSN_TEST__&&window.__elSinNombreStartupSmoke?.worldReady===true,undefined,{timeout:180000,polling:500}));
  await phase('start new campaign',async()=>{await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});await page.locator('#newGameChoice').click();await page.waitForFunction(()=>document.body.classList.contains('game-running'),undefined,{timeout:30000,polling:250});});
  report.staticFrame=await phase('stop automatic render loop for deterministic sampling',()=>page.evaluate(()=>window.__ELSN_TEST__.prepareStaticCaptureFrame()));
  const snapshot=await phase('collect live structure and scene data',()=>page.evaluate(()=>{
   const api=window.__ELSN_TEST__,scene=window.__ELSN_MEASURE_SCENE__;
   if(!api)throw new Error('Missing __ELSN_TEST__ API');
   if(!scene||!window.__ELSN_MEASURE_BABYLON__)throw new Error('Babylon Scene hook did not capture the live scene');
   const houses=api.settlementGrounding().filter(x=>x.nearestIslandIndex===3).sort((a,b)=>a.buildingIndex-b.buildingIndex);
   const camps=api.settlementCampGrounding().filter(x=>x.islandIndex===3).sort((a,b)=>String(a.kind).localeCompare(String(b.kind)));
   const island=api.islands?.[3]||{x:28,z:143,r:33,name:'Bahía de Hrafn'};
   const inventory=api.coastalSceneInventory?.(6000)||{objects:[]};
   const waterRx=/(water|ocean|sea.?surface|ocean.?surface)/i,excludeWater=/(foam|spray|reflection|ripple|wash|backwash|shore|seabed|depth.?tint)/i;
   const water=scene.meshes.filter(m=>waterRx.test(m.name||'')&&!excludeWater.test(m.name||'')&&m.getTotalVertices?.()>20);
   const terrain=scene.meshes.filter(m=>{
    if(!/(ground|terrain|island|land|shore)/i.test(m.name||''))return false;
    if(/hut|camp|outpost|garrison|pier|beacon|rock|tree|grass|bush|reed|fire|flag|wall|house|building/i.test(m.name||''))return false;
    const b=m.getBoundingInfo?.()?.boundingBox;if(!b)return false;const s=b.maximumWorld.subtract(b.minimumWorld);
    return m.getTotalVertices?.()>100&&s.x>12&&s.z>12&&Math.abs((b.minimumWorld.x+b.maximumWorld.x)*.5-island.x)<100&&Math.abs((b.minimumWorld.z+b.maximumWorld.z)*.5-island.z)<100;
   });
   const matName=m=>m.material?.name||m.material?.getClassName?.()||null;
   const describe=m=>{const b=m.getBoundingInfo?.()?.boundingBox;const s=b?b.maximumWorld.subtract(b.minimumWorld):null;return {name:m.name,className:m.getClassName?.()||m.constructor?.name||null,material:matName(m),vertices:m.getTotalVertices?.()||0,isPickable:m.isPickable,visible:m.isVisible,enabled:m.isEnabled?.()??true,bounds:s?{x:Number(s.x.toFixed(1)),y:Number(s.y.toFixed(2)),z:Number(s.z.toFixed(1))}:null};};
   const targets=[
    ...houses.map(h=>({id:'HRAF-HUT-'+String(h.buildingIndex+1).padStart(2,'0'),kind:'hut',name:'WeatheredNorseHut',x:h.x,z:h.z,baseY:h.rootY+.02*(h.scale||1),renderedTerrainY:h.sampledTerrainY,analyticTerrainY:h.analyticTerrainY,coastDistanceData:h.distanceToCoastMeters,shorelineRadius:h.measure?.shorelineRadiusMeters,footprintRadius:Math.hypot(2.01*(h.scale||1),2.64*(h.scale||1)),measure:h.measure})),
    ...camps.map(c=>({id:'HRAF-'+String(c.kind).toUpperCase()+'-03',kind:'camp',name:c.kind==='IslandOutpost'?'IslandOutpost_3':'IslandScoutCamp_3',x:c.x,z:c.z,baseY:c.anchorY,renderedTerrainY:c.groundY,analyticTerrainY:c.measure?.analyticTerrainY,coastDistanceData:c.distanceToCoastMeters,shorelineRadius:c.measure?.shorelineRadiusMeters,footprintRadius:c.footprintRadiusMeters,supportPoints:c.supportPoints,measure:c.measure}))
   ];
   return {island:{name:island.name,x:island.x,z:island.z,r:island.r},targets,
    waterCandidates:water.map(describe),terrainCandidates:terrain.map(describe),
    structureInventory:inventory.objects.filter(o=>['WeatheredNorseHut','IslandOutpost_3','IslandScoutCamp_3'].includes(o.name)).slice(0,30).map(o=>({name:o.name,position:o.position,bounds:o.bounds,meshNames:o.meshNames}))};
  }));
  report.sceneCaptured=true;report.meshDiscovery.waterCandidates=snapshot.waterCandidates;report.meshDiscovery.terrainCandidates=snapshot.terrainCandidates;report.island=snapshot.island;
  if(snapshot.targets.length!==5)throw new Error('Expected 5 Hrafn structures; found '+snapshot.targets.length);
  const measured=await phase('measure drawn bases, visible land edge, water extrema and offshore rays',()=>page.evaluate(({targets,island})=>{
   const api=window.__ELSN_TEST__,scene=window.__ELSN_MEASURE_SCENE__,B=window.__ELSN_MEASURE_BABYLON__;
   const waterRx=/(water|ocean|sea.?surface|ocean.?surface)/i,excludeWater=/(foam|spray|reflection|ripple|wash|backwash|shore|seabed|depth.?tint)/i;
   const waterMeshes=scene.meshes.filter(m=>waterRx.test(m.name||'')&&!excludeWater.test(m.name||'')&&m.getTotalVertices?.()>20);
   const terrainMeshes=scene.meshes.filter(m=>{
    if(!/(ground|terrain|island|land|shore)/i.test(m.name||''))return false;
    if(/hut|camp|outpost|garrison|pier|beacon|rock|tree|grass|bush|reed|fire|flag|wall|house|building/i.test(m.name||''))return false;
    const b=m.getBoundingInfo?.()?.boundingBox;if(!b)return false;const s=b.maximumWorld.subtract(b.minimumWorld);
    return m.getTotalVertices?.()>100&&s.x>12&&s.z>12&&Math.abs((b.minimumWorld.x+b.maximumWorld.x)*.5-island.x)<100&&Math.abs((b.minimumWorld.z+b.maximumWorld.z)*.5-island.z)<100;
   });
   const waterSet=new Set(waterMeshes),terrainSet=new Set(terrainMeshes);
   const waterHeightMeshes=waterMeshes.filter(m=>typeof m.getHeightAtCoordinates==='function');
   const terrainHeightMeshes=terrainMeshes.filter(m=>typeof m.getHeightAtCoordinates==='function');
   const heightAt=(meshes,x,z)=>{for(const m of meshes){try{m.computeWorldMatrix(true);const b=m.getBoundingInfo()?.boundingBox;if(!b||x<b.minimumWorld.x||x>b.maximumWorld.x||z<b.minimumWorld.z||z>b.maximumWorld.z)continue;const y=m.getHeightAtCoordinates(x,z);if(Number.isFinite(y))return {y,mesh:m.name};}catch(_){}}return null;};
   const allPickable=scene.meshes.filter(m=>{try{return m.isEnabled()&&m.isVisible!==false&&m.visibility>0&&m.getTotalVertices()>0;}catch(_){return false;}});
   const originalPickable=allPickable.map(m=>[m,m.isPickable]);allPickable.forEach(m=>m.isPickable=true);
   const vertical=(x,z,set,top=40)=>{const ray=new B.Ray(new B.Vector3(x,top,z),new B.Vector3(0,-1,0),100);const hit=scene.pickWithRay(ray,m=>set.has(m),false);return hit?.hit&&hit.pickedPoint?{y:hit.pickedPoint.y,mesh:hit.pickedMesh?.name||null,distance:hit.distance}:null;};
   const meshBounds=m=>{try{m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;return {minY:Number(b.minimumWorld.y.toFixed(4)),maxY:Number(b.maximumWorld.y.toFixed(4))};}catch(_){return null;}};
   const results=[];
   try{
    for(const t of targets){
     const all=[...(scene.transformNodes||[]),...(scene.meshes||[])].filter(n=>n.name===t.name).map(n=>({n,p:n.getAbsolutePosition?n.getAbsolutePosition():n.position})).filter(r=>r.p&&Math.hypot(r.p.x-t.x,r.p.z-t.z)<.8);
     const root=all.sort((a,b)=>Math.hypot(a.p.x-t.x,a.p.z-t.z)-Math.hypot(b.p.x-t.x,b.p.z-t.z))[0]?.n||null;
     if(!root)throw new Error('Could not resolve structure root '+t.id);
     root.computeWorldMatrix?.(true);const children=root.getChildMeshes?.(false)||[];
     const baseMeshes=t.kind==='hut'?children.filter(m=>m.name==='HutDarkStoneFooting'):children.filter(m=>(t.supportPoints||[]).some(p=>p.name===m.name));
     const baseMeshRows=baseMeshes.map(m=>({name:m.name,...(meshBounds(m)||{})}));
     const drawnBaseY=baseMeshRows.length?Math.min(...baseMeshRows.map(m=>m.minY).filter(Number.isFinite)):null;
     const childBounds=children.map(meshBounds).filter(Boolean);
     const overallDrawnLowestY=childBounds.length?Math.min(...childBounds.map(b=>b.minY)):null;
     const dx=0,dz=1;
     let visibleEdge=null;
     const edgeHeightAt=(d)=>heightAt(terrainHeightMeshes,t.x+dx*d,t.z+dz*d);
     if(terrainHeightMeshes.length){
      let last=null,lastD=null,firstMissing=null;
      for(let d=0;d<=75;d+=.25){const q=edgeHeightAt(d);if(q&&q.y>=.28){last={distance:d,y:q.y,mesh:q.mesh};lastD=d;}else if(last&&!firstMissing){firstMissing=d;break;}}
      if(last){let lo=lastD,hi=firstMissing??Math.min(75,lastD+.25);for(let k=0;k<10;k++){const mid=(lo+hi)/2,q=edgeHeightAt(mid);if(q&&q.y>=.28)lo=mid;else hi=mid;}const edge=edgeHeightAt((lo+hi)/2);visibleEdge={distanceFromBaseMeters:Number(((lo+hi)/2).toFixed(2)),edgeTerrainY:edge?.y??null,mesh:edge?.mesh??null,method:'GroundMesh.getHeightAtCoordinates on the rendered island heightfield along the Hrafn sea approach (+Z); last surface above mean high tide (+0.28 m), 0.25 m scan and 10-step binary refinement',direction:{x:0,z:1}};}
     }
     const edgeDistance=visibleEdge?.distanceFromBaseMeters??t.coastDistanceData??30;
     const camera={x:t.x,y:2.5,z:t.z+edgeDistance+30};
     api.setCamera({x:camera.x,y:camera.y,z:camera.z,targetX:t.x,targetY:t.baseY,targetZ:t.z});
     api.setWaterState({time:0,tide:'high'});api.render();
     const origin=new B.Vector3(camera.x,camera.y,camera.z),targetPoint=new B.Vector3(t.x,t.baseY,t.z),direction=targetPoint.subtract(origin),length=direction.length();direction.normalize();
     const ray=new B.Ray(origin,direction,length+.05),hit=scene.pickWithRay(ray,m=>allPickable.includes(m),false);
     const rayResult=hit?.hit?{mesh:hit.pickedMesh?.name||null,material:hit.pickedMesh?.material?.name||null,distanceMeters:Number(hit.distance.toFixed(3)),point:{x:Number(hit.pickedPoint.x.toFixed(3)),y:Number(hit.pickedPoint.y.toFixed(3)),z:Number(hit.pickedPoint.z.toFixed(3))},isTargetMesh:baseMeshes.includes(hit.pickedMesh),targetReached:Math.abs(hit.distance-length)<.08}:null;
     const waveRows=[],footprint=[{x:t.x,z:t.z},{x:t.x+t.footprintRadius*.7,z:t.z},{x:t.x-t.footprintRadius*.7,z:t.z},{x:t.x,z:t.z+t.footprintRadius*.7},{x:t.x,z:t.z-t.footprintRadius*.7}];
     for(let i=0;i<48;i++){const time=i;api.setWaterState({time,tide:'high'});api.render();for(const p of footprint){const q=heightAt(waterHeightMeshes,p.x,p.z);if(q)waveRows.push({time,x:p.x,z:p.z,y:q.y,mesh:q.mesh});}}
     const waterYs=waveRows.map(x=>x.y);
     results.push({...t,drawnBaseMeshHeight:drawnBaseY,overallDrawnLowestY,
      baseMeshRows,baseVsDrawnMeshMeters:drawnBaseY===null?null:Number((t.baseY-drawnBaseY).toFixed(4)),
      cameraOffshore30m:camera,rayFirstHit:rayResult,visibleLandEdge:visibleEdge,
      waterDrawn:{sampleCount:waveRows.length,requestedSamples:48*footprint.length,minY:waterYs.length?Number(Math.min(...waterYs).toFixed(4)):null,maxY:waterYs.length?Number(Math.max(...waterYs).toFixed(4)):null,meshNames:[...new Set(waveRows.map(x=>x.mesh))],timespanSeconds:47,samplePoints:footprint.length,unhitSamples:64*footprint.length-waveRows.length},
      waterVsBase:waterYs.length?{maxAboveBase:Number((Math.max(...waterYs)-t.baseY).toFixed(4)),minAboveBase:Number((Math.min(...waterYs)-t.baseY).toFixed(4)),waterEverAboveBase:Math.max(...waterYs)>t.baseY}:null});
    }
   }finally{originalPickable.forEach(([m,v])=>{m.isPickable=v;});}
   return results;
  },{targets:snapshot.targets,island:snapshot.island}));
  report.structures=measured.map(t=>({id:t.id,kind:t.kind,baseHeight:round(t.baseY),drawnMeshBaseHeight:t.drawnBaseMeshHeight,
   overallDrawnLowestY:t.overallDrawnLowestY,analyticFormulaHeight:round(t.analyticTerrainY),renderedTerrainHeight:round(t.renderedTerrainY),
   analyticVsRenderedMeters:t.measure?.analyticVsRenderedMeters??null,dataDistanceToCoastMeters:round(t.coastDistanceData,3),
   visibleLandEdgeDistanceMeters:t.visibleLandEdge?.distanceFromBaseMeters??null,
   visibleLandEdgeMethod:t.visibleLandEdge?.method??'not measured: rendered GroundMesh height API unavailable',
   waterDrawn:t.waterDrawn,rayCamera:t.cameraOffshore30m,firstRayMesh:t.rayFirstHit,waterVsBase:t.waterVsBase,
   source:t.kind==='hut'?'settlementGrounding() + live mesh bounds':'settlementCampGrounding() + live support-mesh bounds'}));
  report.measurementCoverage={targets:report.structures.length,waterCandidates:report.meshDiscovery.waterCandidates.length,
   terrainCandidates:report.meshDiscovery.terrainCandidates.length,waterMeasured:report.structures.filter(x=>x.waterDrawn?.sampleCount>0).length,
   visibleEdgeMeasured:report.structures.filter(x=>x.visibleLandEdgeDistanceMeters!==null).length,waterHeightFunctionAvailable:report.meshDiscovery.waterCandidates.some(x=>x.className==='GroundMesh'),
   rayMeasured:report.structures.filter(x=>x.firstRayMesh!==null).length};
  report.verdict=report.structures.length===5?'measured':'incomplete';
 }catch(error){report.errors.push(String(error?.stack||error));report.verdict='failed';process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();save();try{await browser?.close();}catch(_){}}
}
main();
