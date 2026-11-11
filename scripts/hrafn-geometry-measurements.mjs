import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT=path.resolve('artifacts/hrafn-geometry');
const FILE=path.join(OUT,'hrafn-geometry-measurements.json');
const BASE_URL=process.env.HRAFN_TEST_URL||'http://127.0.0.1:4176/';
const report={schema:1,build:null,branch:process.env.HRAFN_PR_HEAD_BRANCH||process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME||null,commit:process.env.HRAFN_PR_HEAD_SHA||process.env.GITHUB_SHA||null,
 method:'live Babylon scene geometry; no screenshot-derived measurements',
 conditions:{tide:'high',tideOffsetMeters:0.28,waveTimeSamples:32,waveTimeStepSeconds:1.5,
 lodCamera:'30 m seaward of the live visible shoreline, along the same radial bearing used by the coast-distance measurement, 2.5 m above mean sea level',
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
   api.setWaterState({time:0,tide:'high'});
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
   const smokeAlignment=h=>{
    const root=[...(scene.transformNodes||[]),...(scene.meshes||[])].find(n=>n.name==='WeatheredNorseHut'&&Math.hypot((n.getAbsolutePosition?n.getAbsolutePosition().x:n.position.x)-h.x,(n.getAbsolutePosition?n.getAbsolutePosition().z:n.position.z)-h.z)<.8);
    const emitter=root?.__norseSmokeEmitter;
    if(!emitter||!root)return null;
    const rootY=(root.getAbsolutePosition?root.getAbsolutePosition().y:root.position.y),mouthY=rootY+2.83*(h.scale||1);
    const expected=.09*(h.scale||1),gap=emitter.y-mouthY;
    return {emitterY:Number(emitter.y.toFixed(4)),chimneyMouthCenterY:Number(mouthY.toFixed(4)),verticalGap:Number(gap.toFixed(4)),expectedGap:Number(expected.toFixed(4)),errorMeters:Number((gap-expected).toFixed(4)),withinTwoCm:Math.abs(gap-expected)<=.02};
   };
   const targets=[
    ...houses.map(h=>({id:'HRAF-HUT-'+String(h.buildingIndex+1).padStart(2,'0'),kind:'hut',name:'WeatheredNorseHut',x:h.x,z:h.z,scale:h.scale,smokeEmitterAlignment:smokeAlignment(h),baseY:h.rootY+.02*(h.scale||1),renderedTerrainY:h.sampledTerrainY,analyticTerrainY:h.analyticTerrainY,coastDistanceData:h.distanceToCoastMeters,shorelineRadius:h.measure?.shorelineRadiusMeters,footprintRadius:Math.hypot(2.01*(h.scale||1),2.64*(h.scale||1)),measure:h.measure})),
    ...camps.map(c=>({id:'HRAF-'+String(c.kind).toUpperCase()+'-03',kind:'camp',name:c.kind==='IslandOutpost'?'IslandOutpost_3':'IslandScoutCamp_3',x:c.x,z:c.z,baseY:c.anchorY,renderedTerrainY:c.groundY,analyticTerrainY:c.measure?.analyticTerrainY,coastDistanceData:c.distanceToCoastMeters,shorelineRadius:c.measure?.shorelineRadiusMeters,footprintRadius:c.footprintRadiusMeters,supportPoints:c.supportPoints,measure:c.measure}))
   ];
   return {build:document.querySelector('meta[name="el-sin-nombre-build"]')?.content||null,island:{name:island.name,x:island.x,z:island.z,r:island.r},targets,
    waterCandidates:water.map(describe),terrainCandidates:terrain.map(describe),
    structureInventory:inventory.objects.filter(o=>['WeatheredNorseHut','IslandOutpost_3','IslandScoutCamp_3'].includes(o.name)).slice(0,30).map(o=>({name:o.name,position:o.position,bounds:o.bounds,meshNames:o.meshNames}))};
  }));
  report.sceneCaptured=true;report.build=snapshot.build||null;report.meshDiscovery.waterCandidates=snapshot.waterCandidates;report.meshDiscovery.terrainCandidates=snapshot.terrainCandidates;report.island=snapshot.island;
  if(snapshot.targets.length!==5)throw new Error('Expected 5 Hrafn structures; found '+snapshot.targets.length);
  const measured=await phase('measure drawn bases, visible land edge, water extrema and offshore rays',()=>page.evaluate(({targets,island})=>{
   const api=window.__ELSN_TEST__,scene=window.__ELSN_MEASURE_SCENE__,B=window.__ELSN_MEASURE_BABYLON__;
   const roundPage=(value,digits=3)=>Number.isFinite(Number(value))?Number(Number(value).toFixed(digits)):null;
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
   const allHeightfields=scene.meshes.filter(m=>/^IslandHeightfield_\d+$/.test(m.name||'')&&typeof m.getHeightAtCoordinates==='function');
   const visibleHeightfields=allHeightfields.filter(m=>{try{return m.isEnabled()&&m.isVisible!==false&&m.visibility>0;}catch(_){return false;}});
   const heightAt=(meshes,x,z)=>{for(const m of meshes){try{m.computeWorldMatrix(true);const b=m.getBoundingInfo()?.boundingBox;if(!b||x<b.minimumWorld.x||x>b.maximumWorld.x||z<b.minimumWorld.z||z>b.maximumWorld.z)continue;const y=m.getHeightAtCoordinates(x,z);if(Number.isFinite(y))return {y,mesh:m.name,islandIndex:Number(m.metadata?.islandIndex??String(m.name).split('_').pop())};}catch(_){}}return null;};
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
     let dx=t.x-island.x,dz=t.z-island.z,len=Math.hypot(dx,dz);
     if(len<.01){dx=0;dz=1;len=1;}dx/=len;dz/=len;
     let visibleEdge=null;
     const edgeHeightAt=(d)=>heightAt(terrainHeightMeshes,t.x+dx*d,t.z+dz*d);
     if(terrainHeightMeshes.length){
      let last=null,lastD=null,firstMissing=null;
      for(let d=0;d<=75;d+=.25){const q=edgeHeightAt(d);if(q&&q.y>=.28){last={distance:d,y:q.y,mesh:q.mesh};lastD=d;}else if(last&&!firstMissing){firstMissing=d;break;}}
      if(last){let lo=lastD,hi=firstMissing??Math.min(75,lastD+.25);for(let k=0;k<10;k++){const mid=(lo+hi)/2,q=edgeHeightAt(mid);if(q&&q.y>=.28)lo=mid;else hi=mid;}const edge=edgeHeightAt((lo+hi)/2);visibleEdge={distanceFromBaseMeters:Number(((lo+hi)/2).toFixed(2)),edgeTerrainY:edge?.y??null,mesh:edge?.mesh??null,method:'GroundMesh.getHeightAtCoordinates on the rendered island heightfield along the same radial bearing as the coast-distance measurement; last surface above mean high tide (+0.28 m), 0.25 m scan and 10-step binary refinement',direction:{x:Number(dx.toFixed(4)),z:Number(dz.toFixed(4))}};}
     }
     const edgeDistance=visibleEdge?.distanceFromBaseMeters??t.coastDistanceData??30;
     const camera={x:t.x+dx*(edgeDistance+30),y:2.5,z:t.z+dz*(edgeDistance+30)};
     api.setCamera({x:camera.x,y:camera.y,z:camera.z,targetX:t.x,targetY:t.baseY,targetZ:t.z});
     api.setWaterState({time:0,tide:'high'});
     const origin=new B.Vector3(camera.x,camera.y,camera.z),targetPoint=new B.Vector3(t.x,t.baseY,t.z),direction=targetPoint.subtract(origin),length=direction.length();direction.normalize();
     const ray=new B.Ray(origin,direction,length+.05),hit=scene.pickWithRay(ray,m=>allPickable.includes(m),false);
     const rayResult=hit?.hit?{mesh:hit.pickedMesh?.name||null,material:hit.pickedMesh?.material?.name||null,distanceMeters:Number(hit.distance.toFixed(3)),point:{x:Number(hit.pickedPoint.x.toFixed(3)),y:Number(hit.pickedPoint.y.toFixed(3)),z:Number(hit.pickedPoint.z.toFixed(3))},isTargetMesh:baseMeshes.includes(hit.pickedMesh),targetReached:Math.abs(hit.distance-length)<.08,targetDistanceMeters:Number(length.toFixed(3))}:null;
     const waveRows=[],footprint=[{x:t.x,z:t.z},{x:t.x+t.footprintRadius*.7,z:t.z},{x:t.x-t.footprintRadius*.7,z:t.z},{x:t.x,z:t.z+t.footprintRadius*.7},{x:t.x,z:t.z-t.footprintRadius*.7}];
     for(let i=0;i<32;i++){const time=i*1.5;api.setWaterState({time,tide:'high'});for(const p of footprint){const q=heightAt(waterHeightMeshes,p.x,p.z);if(q)waveRows.push({time,x:p.x,z:p.z,y:q.y,mesh:q.mesh});}}
     const waterYs=waveRows.map(x=>x.y);
     api.setWaterState({time:0,tide:'high'});
     const wetAlignedEdgeAt=d=>{
      const x=t.x+dx*d,z=t.z+dz*d,ground=heightAt(terrainHeightMeshes,x,z),water=heightAt(waterHeightMeshes,x,z);
      return ground&&water?{dry:ground.y>=water.y,groundY:ground.y,waterY:water.y,mesh:ground.mesh}:null;
     };
     let wetLast=null,wetFirst=null;
     for(let d=0;d<=75;d+=.25){const q=wetAlignedEdgeAt(d);if(q?.dry)wetLast=d;else if(wetLast!==null){wetFirst=d;break;}}
     let wetAlignedEdge=null;
     if(wetLast!==null){let lo=wetLast,hi=wetFirst??Math.min(75,wetLast+.25);for(let k=0;k<12;k++){const mid=(lo+hi)/2,q=wetAlignedEdgeAt(mid);if(q?.dry)lo=mid;else hi=mid;}const q=wetAlignedEdgeAt((lo+hi)/2);wetAlignedEdge={distanceFromBaseMeters:Number(((lo+hi)/2).toFixed(3)),groundY:q?.groundY??null,waterY:q?.waterY??null,mesh:q?.mesh??null,method:'rendered GroundMesh vs rendered ocean height, high tide at time=0'};}
     results.push({...t,drawnBaseMeshHeight:drawnBaseY,overallDrawnLowestY,
      baseMeshRows,baseVsDrawnMeshMeters:drawnBaseY===null?null:Number((t.baseY-drawnBaseY).toFixed(4)),
      cameraOffshore30m:camera,rayFirstHit:rayResult,visibleLandEdge:visibleEdge,wetAlignedEdge,
      fixedEdgeMinusDataMeters:visibleEdge?.distanceFromBaseMeters!=null&&t.coastDistanceData!=null?Number((visibleEdge.distanceFromBaseMeters-t.coastDistanceData).toFixed(3)):null,
      waveAlignedEdgeMinusDataMeters:wetAlignedEdge?.distanceFromBaseMeters!=null&&t.coastDistanceData!=null?Number((wetAlignedEdge.distanceFromBaseMeters-t.coastDistanceData).toFixed(3)):null,
      waterDrawn:{sampleCount:waveRows.length,requestedSamples:32*footprint.length,minY:waterYs.length?Number(Math.min(...waterYs).toFixed(4)):null,maxY:waterYs.length?Number(Math.max(...waterYs).toFixed(4)):null,meshNames:[...new Set(waveRows.map(x=>x.mesh))],timespanSeconds:46.5,samplePoints:footprint.length,unhitSamples:32*footprint.length-waveRows.length},
      waterVsBase:waterYs.length?{maxAboveBase:Number((Math.max(...waterYs)-t.baseY).toFixed(4)),minAboveBase:Number((Math.min(...waterYs)-t.baseY).toFixed(4)),waterEverAboveBase:Math.max(...waterYs)>t.baseY}:null});
    }

    const crow=(api.islands||[])[0]||{x:0,z:0,r:60,name:'Isla del Cuervo'};
    const span=Math.hypot(crow.x-island.x,crow.z-island.z),towardCrow={x:(crow.x-island.x)/span,z:(crow.z-island.z)/span};
    const terrainByIsland=allHeightfields.map(m=>{
     const index=Number(m.metadata?.islandIndex??String(m.name).split('_').pop()),b=m.getBoundingInfo?.()?.boundingBox;
     return {index,name:m.name,subdivisions:m.metadata?.subdivisions??null,vertices:m.getTotalVertices?.()||0,
      enabled:m.isEnabled?.()??true,visible:m.isVisible!==false,visibility:Number(m.visibility??1),
      bounds:b?{minY:Number(b.minimumWorld.y.toFixed(3)),maxY:Number(b.maximumWorld.y.toFixed(3))}:null};
    }).filter(x=>x.index===0||x.index===3);
    const cameraTests=[];
    for(const offsetMeters of [60,90,120]){
     const x=island.x+towardCrow.x*offsetMeters,z=island.z+towardCrow.z*offsetMeters;
     const ground=heightAt(visibleHeightfields,x,z),water=heightAt(waterHeightMeshes,x,z),supportedByLand=!!(ground&&(!water||ground.y>water.y));
     const surfaceY=supportedByLand?ground.y:(water?.y??.28),camera={x,y:surfaceY+1.7,z};
     api.setCamera({x:camera.x,y:camera.y,z:camera.z,targetX:island.x,targetY:1.2,targetZ:island.z});
     api.setWaterState({time:0,tide:'high'});
     const waterLodDiagnostics=api.diagnostics()?.coast||null;
     const waterDetailRadius=Number(waterLodDiagnostics?.waterLodBoundary?.radiusMeters)||null;
     const detailFadeAt=(px,pz)=>{
      if(!waterDetailRadius)return null;
      const distance=Math.hypot(px-camera.x,pz-camera.z),r2=waterDetailRadius*waterDetailRadius,start=r2*.55;
      const t=Math.max(0,Math.min(1,(r2-distance*distance)/(r2-start)));
      return {distanceMeters:Number(distance.toFixed(3)),fade:Number((t*t*(3-2*t)).toFixed(4))};
     };
     const viewRows=[];
     for(const t of targets.filter(item=>item.kind==='hut')){
      const targetPoint=new B.Vector3(t.x,t.baseY,t.z),origin=new B.Vector3(camera.x,camera.y,camera.z);
      const delta=targetPoint.subtract(origin),targetDistance=delta.length();delta.normalize();
      const viewDirection={x:(camera.x-t.x)/targetDistance,z:(camera.z-t.z)/targetDistance};
      api.setCamera({x:camera.x,y:camera.y,z:camera.z,targetX:t.x,targetY:t.baseY,targetZ:t.z});
      const viewRay=new B.Ray(origin,delta,targetDistance+.05),viewHit=scene.pickWithRay(viewRay,m=>allPickable.includes(m),false);
      const first=viewHit?.hit?{mesh:viewHit.pickedMesh?.name||null,material:viewHit.pickedMesh?.material?.name||null,
       distanceFromCameraMeters:Number(viewHit.distance.toFixed(3)),
       distanceFromBaseMeters:Number(Math.max(0,targetDistance-viewHit.distance).toFixed(3)),
       point:{x:Number(viewHit.pickedPoint.x.toFixed(3)),y:Number(viewHit.pickedPoint.y.toFixed(3)),z:Number(viewHit.pickedPoint.z.toFixed(3))},
       isTargetMesh:(viewHit.pickedMesh?.name||'')==='HutDarkStoneFooting',
       isTerrain:/^IslandHeightfield_\d+$/.test(viewHit.pickedMesh?.name||''),isWater:(viewHit.pickedMesh?.name||'')==='ocean'}:null;
      const samples=[],step=.5;
      const stateAt=d=>{
       const px=t.x+viewDirection.x*d,pz=t.z+viewDirection.z*d,g=heightAt(visibleHeightfields,px,pz),
        allG=heightAt(allHeightfields,px,pz),w=heightAt(waterHeightMeshes,px,pz);
       return {d,ground:g,allGround:allG,water:w,dry:!!(g&&(!w||g.y>=w.y)),
        submerged:!!(g&&w&&g.y<w.y),hidden:!!(!g&&allG),
        terrainAboveWater:g&&w?Number((g.y-w.y).toFixed(4)):null};
      };
      let firstLandExit=null,secondLandEntry=null,previousDry=null,seenWater=false,submergedCount=0,hiddenCount=0,minClearance=Infinity,maxAnalyticDelta=0,analyticSamples=0;
      for(let d=0;d<=targetDistance;d+=step){
       const q=stateAt(d);samples.push(q);
       if(q.submerged)submergedCount++;if(q.hidden)hiddenCount++;
       if(Number.isFinite(q.terrainAboveWater))minClearance=Math.min(minClearance,q.terrainAboveWater);
       if(q.dry&&q.allGround&&Math.abs(d/5-Math.round(d/5))<.051){
        const measured=api.measureRenderedFootprint({islandIndex:q.allGround.islandIndex,x:t.x+viewDirection.x*d,z:t.z+viewDirection.z*d,baseY:q.allGround.y,offsets:[]});
        if(Number.isFinite(measured?.analyticVsRenderedMeters)){maxAnalyticDelta=Math.max(maxAnalyticDelta,Math.abs(measured.analyticVsRenderedMeters));analyticSamples++;}
       }
       if(previousDry===true&&!q.dry&&!firstLandExit){firstLandExit={distanceFromBaseMeters:Number(d.toFixed(2)),lastDryDistanceMeters:Number((d-step).toFixed(2)),groundY:q.allGround?.y??null,waterY:q.water?.y??null};seenWater=true;}
       if(seenWater&&q.dry&&!secondLandEntry){secondLandEntry={distanceFromBaseMeters:Number(d.toFixed(2)),mesh:q.ground?.mesh||null,islandIndex:q.ground?.islandIndex??null};}
       previousDry=q.dry;
      }
      const dryRuns=[];let runStart=null,runIsland=null;
      for(const q of samples){if(q.dry){if(runStart===null){runStart=q.d;runIsland=q.ground?.islandIndex??null;}}else if(runStart!==null){dryRuns.push({start:Number(runStart.toFixed(2)),end:Number((q.d-step).toFixed(2)),islandIndex:runIsland});runStart=null;runIsland=null;}}
      if(runStart!==null)dryRuns.push({start:Number(runStart.toFixed(2)),end:Number(targetDistance.toFixed(2)),islandIndex:runIsland});
      const clearances=samples.filter(q=>Number.isFinite(q.terrainAboveWater)).map(q=>q.terrainAboveWater);
      const targetState=stateAt(0);
      viewRows.push({structureId:t.id,base:{x:roundPage(t.x,3),y:roundPage(t.baseY,4),z:roundPage(t.z,3)},
       camera:{...camera,eyeHeightMeters:1.7,supportSurface:supportedByLand?'rendered island ground':'rendered ocean surface',
        supportMesh:supportedByLand?ground.mesh:(water?.mesh??null),supportSurfaceY:roundPage(surfaceY,4)},
       cameraToBaseDistanceMeters:roundPage(targetDistance,3),waterDetailAtBase:detailFadeAt(t.x,t.z),
       firstRayHit:first,visibleLandEdgeFromBaseTowardCrow:firstLandExit,secondDryLandEntryFromBase:secondLandEntry,
       nearestLandEdgeDistanceMeters:firstLandExit?.lastDryDistanceMeters??null,
       dryLandRunsAlongView:dryRuns,submergedTerrainSamples:submergedCount,hiddenTerrainSamples:hiddenCount,
       sampledPoints:samples.length,minVisibleTerrainMinusWaterMeters:Number.isFinite(minClearance)?roundPage(minClearance,4):null,
       maxAbsRenderedVsAnalyticTerrainMeters:roundPage(maxAnalyticDelta,4),analyticComparisonSamples:analyticSamples,
       targetTerrainState:targetState.ground?{mesh:targetState.ground.mesh,terrainMinusWater:targetState.terrainAboveWater}:null});
     }
     cameraTests.push({distanceFromHrafnCentreMeters:offsetMeters,cameraPosition:camera,terrainSupport:supportedByLand?'land':'water',
      crowCentreDistanceMeters:roundPage(Math.hypot(x-crow.x,z-crow.z),3),hrafnCentreDistanceMeters:offsetMeters,
      crowBeachRelation:roundPage(Math.hypot(x-crow.x,z-crow.z)-crow.r*1.085,3),crowCoastApproximateSignedDistanceMeters:roundPage(Math.hypot(x-crow.x,z-crow.z)-crow.r*1.085,3),
      cameraAboveLocalSurfaceMeters:1.7,viewRows,terrainMeshes:terrainByIsland,
      waterDetailRadiusMeters:waterDetailRadius,waterLodDiagnostics:waterLodDiagnostics?.waterLodBoundary??null,
      waterLodDiagnosticsAt90Meters:waterLodDiagnostics?.waterLodBoundary90??null,
      renderedWaterVertexAgreement:waterLodDiagnostics?.renderedVertexAgreement??null,
      streamingDiagnostics:window.__ELSN_ISLAND_STREAMING__||window.__elSinNombreIslandStreaming||null});
    }
   return {measurements:results,cameraTests};
   }finally{originalPickable.forEach(([m,v])=>{m.isPickable=v;});}
  },{targets:snapshot.targets,island:snapshot.island}));
  report.cameraVisibilityTests=measured.cameraTests;
  report.structures=measured.measurements.map(t=>({id:t.id,kind:t.kind,baseHeight:round(t.baseY),drawnMeshBaseHeight:t.drawnBaseMeshHeight,
   overallDrawnLowestY:t.overallDrawnLowestY,baseMeshRows:t.baseMeshRows,baseVsDrawnMeshMeters:t.baseVsDrawnMeshMeters,analyticFormulaHeight:round(t.analyticTerrainY),renderedTerrainHeight:round(t.renderedTerrainY),
   analyticVsRenderedMeters:t.measure?.analyticVsRenderedMeters??null,dataDistanceToCoastMeters:round(t.coastDistanceData,3),
   visibleLandEdgeDistanceMeters:t.visibleLandEdge?.distanceFromBaseMeters??null,
   waveAlignedVisibleLandEdgeDistanceMeters:t.wetAlignedEdge?.distanceFromBaseMeters??null,
   fixedEdgeMinusFormulaMeters:t.fixedEdgeMinusDataMeters??null,waveAlignedEdgeMinusFormulaMeters:t.waveAlignedEdgeMinusDataMeters??null,
   visibleLandEdgeMethod:t.visibleLandEdge?.method??'not measured: rendered GroundMesh height API unavailable',
   waterDrawn:t.waterDrawn,rayCamera:t.cameraOffshore30m,firstRayMesh:t.rayFirstHit,waterVsBase:t.waterVsBase,
   maximumBaseGapMeters:round(t.measure?.maximumBaseGapMeters,4),highTideDryMarginMeters:round(t.measure?.highTideDryMarginMeters,4),
   baseWithinTwoCm:Number.isFinite(Number(t.measure?.maximumBaseGapMeters))&&Number(t.measure.maximumBaseGapMeters)<=.02,
   dryAtHighTide:Number.isFinite(Number(t.measure?.highTideDryMarginMeters))&&Number(t.measure.highTideDryMarginMeters)>=.22,
   smokeEmitterAlignment:t.smokeEmitterAlignment||null,
   hypotheses:{a_waterDrawnAboveBase:!!(t.waterDrawn?.maxY!==null&&t.waterDrawn?.maxY>t.baseY),
    b_visibleMeshLowerThanAnalytic:!!(t.overallDrawnLowestY!==null&&t.analyticTerrainY!==null&&t.overallDrawnLowestY<t.analyticTerrainY-.02),
    b_baseMeshLowerThanAnalytic:!!(t.drawnBaseMeshHeight!==null&&t.analyticTerrainY!==null&&t.drawnBaseMeshHeight<t.analyticTerrainY-.02),
    c_visibleEdgeFartherThanData:!!(t.visibleLandEdge?.distanceFromBaseMeters!==null&&t.coastDistanceData!==null&&t.visibleLandEdge.distanceFromBaseMeters>t.coastDistanceData+.02),
    d_externalMeshBlocksRay:!!(t.rayFirstHit&&!t.rayFirstHit.isTargetMesh&&!t.rayFirstHit.targetReached)},
   source:t.kind==='hut'?'settlementGrounding() + live mesh bounds':'settlementCampGrounding() + live support-mesh bounds'}));
  report.measurementCoverage={targets:report.structures.length,waterCandidates:report.meshDiscovery.waterCandidates.length,
   terrainCandidates:report.meshDiscovery.terrainCandidates.length,waterMeasured:report.structures.filter(x=>x.waterDrawn?.sampleCount>0).length,
   visibleEdgeMeasured:report.structures.filter(x=>x.visibleLandEdgeDistanceMeters!==null).length,waveAlignedEdgeMeasured:report.structures.filter(x=>x.waveAlignedVisibleLandEdgeDistanceMeters!==null).length,waterHeightFunctionAvailable:report.meshDiscovery.waterCandidates.some(x=>x.className==='GroundMesh'),
   rayMeasured:report.structures.filter(x=>x.firstRayMesh!==null).length,
   baseWithinTwoCm:report.structures.filter(x=>x.baseWithinTwoCm).length,dryAtHighTide:report.structures.filter(x=>x.dryAtHighTide).length,
   smokeEmitters:report.structures.filter(x=>x.smokeEmitterAlignment).length,smokeEmittersWithinTwoCm:report.structures.filter(x=>x.smokeEmitterAlignment?.withinTwoCm).length,
   cameraDistancesMeters:report.cameraVisibilityTests.map(x=>x.distanceFromHrafnCentreMeters),cameraViewRows:report.cameraVisibilityTests.reduce((n,x)=>n+x.viewRows.length,0)};
  const groundingFailures=report.structures.filter(x=>!x.baseWithinTwoCm||!x.dryAtHighTide);
  const smokeFailures=report.structures.filter(x=>x.smokeEmitterAlignment&&!x.smokeEmitterAlignment.withinTwoCm);
  if(groundingFailures.length||smokeFailures.length){report.errors.push('2 cm / high-tide / chimney alignment gate failed: '+JSON.stringify({groundingFailures:groundingFailures.map(x=>x.id),smokeFailures:smokeFailures.map(x=>x.id)}));report.verdict='failed';process.exitCode=1;}
  else report.verdict=report.structures.length===5?'measured':'incomplete';
 }catch(error){report.errors.push(String(error?.stack||error));report.verdict='failed';process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();save();try{await browser?.close();}catch(_){}}
}
main();
