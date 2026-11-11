import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL=process.env.STRUCTURE_TEST_URL||'http://127.0.0.1:4176/';
const OUT=path.resolve('artifacts/structure-grounding');
const startedAt=Date.now();
const report={schema:2,startedAt:new Date().toISOString(),finishedAt:null,build:null,renderer:'Chromium headless + ANGLE SwiftShader',mode:'full normal-campaign runtime structure audit plus automatic-repair observation in a disposable test renderer',testRendererOnlyMutations:true,productionDataModified:false,phases:[],consoleErrors:[],pageErrors:[],baseline:null,postAutomaticAudit:null,runtimeRepairSimulation:null,habitableStructures:null,settlementHouses:null,settlementCamps:null,garrisons:null,summary:null,screenshot:null,verdict:'not-run',failure:null};
function writeReport(){fs.mkdirSync(OUT,{recursive:true});const tmp=path.join(OUT,'structure-grounding.json.tmp');fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');fs.renameSync(tmp,path.join(OUT,'structure-grounding.json'));}
async function phase(name,fn){const start=Date.now(),row={name,startedAt:new Date().toISOString(),status:'in-progress'};report.phases.push(row);console.log('[STRUCTURE_AUDIT] START '+name);try{const result=await fn();row.status='completed';return result;}catch(error){row.status='failed';row.error=String(error?.stack||error);throw error;}finally{row.finishedAt=new Date().toISOString();row.durationMs=Date.now()-start;console.log('[STRUCTURE_AUDIT] END '+name+' '+row.status+' '+row.durationMs+'ms');}}
function collectStructureSnapshot(){
 const api=window.__ELSN_TEST__;
 if(!api)throw new Error('The game inspection API is not available.');
 const structures=api.habitableStructureAudit();
 if(typeof api.auditOffshoreStructures!=='function')throw new Error('The full-runtime offshore structural-root audit is unavailable.');
 const offshore=api.auditOffshoreStructures(1000);
 const houses=api.settlementGrounding();
 const camps=api.settlementCampGrounding();
 const garrisons=api.garrisonGrounding();
 const view=typeof api.sceneViewSnapshot==='function'?api.sceneViewSnapshot():null;
 const projectedCandidates=(offshore.candidates||[]).map(item=>{
  const x=Number(item.position?.x),z=Number(item.position?.z),bottomY=Number(item.bounds?.bottomY??item.position?.y),topY=Number(item.bounds?.topY??item.position?.y);
  const centerY=Number.isFinite(bottomY)&&Number.isFinite(topY)?(bottomY+topY)*.5:Number(item.position?.y)||0;
  const baseProjection=typeof api.projectWorldPoint==='function'?api.projectWorldPoint({x,y:bottomY,z}):null;
  const centerProjection=typeof api.projectWorldPoint==='function'?api.projectWorldPoint({x,y:centerY,z}):null;
  const topProjection=typeof api.projectWorldPoint==='function'?api.projectWorldPoint({x,y:topY,z}):null;
  return {name:item.name,kind:item.kind,registered:item.registered,visible:item.visible,enabled:item.enabled,island:item.island,islandIndex:item.islandIndex,position:item.position,bounds:item.bounds,offshore:item.offshore,issue:item.issue,distanceToIslandCenterMeters:item.distanceToIslandCenterMeters,dryFootprintSampleCount:item.dryFootprintSampleCount,dryFootprintSampleTotal:item.dryFootprintSampleTotal,baseProjection,centerProjection,topProjection};
 });
 const inventory=typeof api.coastalSceneInventory==='function'?api.coastalSceneInventory(5000):null;
 const structureRoots=(inventory?.objects||[]).filter(item=>(item.category==='structure'||item.category==='unidentified-structure')&&!(item.parentChain||[]).length&&Number(item.meshCount)>0);
 const inventoryStructuralCandidates=structureRoots.map(item=>({name:item.name,category:item.category,role:item.structuralRole||'unclassified',confidence:item.classificationConfidence||'unknown',position:item.position,bounds:item.bounds,visible:item.visible,enabled:item.enabled,meshCount:item.meshCount,vertexCount:item.vertexCount,meshNames:item.meshNames,materials:item.materials,structuralEvidence:item.structuralEvidence,metadata:item.metadata}));
 const navigationPoint={x:46.6,z:254.4,confidence:'approximate X inferred from the expanded-map player marker; Z read from the coordinate strip',zone:'MAR ABIERTO'};
 const pointCandidates=[...projectedCandidates.map(item=>({...item,source:'offshore-structural-audit'})),...inventoryStructuralCandidates.map(item=>({...item,source:'scene-inventory'}))]
  .map(item=>{const p=item.position||{};return {...item,distanceToNavigationPointMeters:Number(Math.hypot((Number(p.x)||0)-navigationPoint.x,(Number(p.z)||0)-navigationPoint.z).toFixed(2))};})
  .filter(item=>item.distanceToNavigationPointMeters<=150)
  .sort((a,b)=>a.distanceToNavigationPointMeters-b.distanceToNavigationPointMeters);
 const navigationPointAudit={target:navigationPoint,nearbyCandidateCount:pointCandidates.length,nearbyCandidates:pointCandidates};
 const cuervoIsland=(api.islands||[]).find(item=>/cuervo/i.test(item.name))||(api.islands||[])[0]||{x:0,z:0,name:'unknown'};
 const cuervoSceneRoots=structureRoots.map(item=>{
  const p=item.position||{},distance=Math.hypot((Number(p.x)||0)-cuervoIsland.x,(Number(p.z)||0)-cuervoIsland.z);
  const audit=(offshore.candidates||[]).find(row=>row.name===item.name);
  return {name:item.name,category:item.category,role:item.structuralRole||'unclassified',confidence:item.classificationConfidence||'unknown',island:audit?.island||cuervoIsland.name,distanceToIslandCenterMeters:Number(distance.toFixed(2)),position:item.position,bounds:item.bounds,visible:item.visible,enabled:item.enabled,meshCount:item.meshCount,vertexCount:item.vertexCount,meshNames:item.meshNames,materials:item.materials,structuralEvidence:item.structuralEvidence,grounding:audit?{offshore:audit.offshore,issue:audit.issue,dryFootprintSampleCount:audit.dryFootprintSampleCount,dryFootprintSampleTotal:audit.dryFootprintSampleTotal,bottomAboveWaterMeters:audit.bottomAboveWaterMeters,bottomAboveTerrainMeters:audit.bottomAboveTerrainMeters}:null};
 });
 const nearbyCuervoStructureRoots=cuervoSceneRoots.filter(item=>item.distanceToIslandCenterMeters<=110).sort((a,b)=>a.distanceToIslandCenterMeters-b.distanceToIslandCenterMeters);

 const houseOutliers=houses.filter(item=>Math.abs(Number(item.groundingErrorMeters)||0)>.02||Number(item.maximumFootingGapMeters)>.02||Number(item.dryLandFootprintMarginMeters)<1.25);
 const campOutliers=camps.filter(item=>item.withinDryLandBand===false||Math.abs(Number(item.anchorErrorMeters)||0)>.02);
 const garrisonOutliers=garrisons.filter(item=>Number(item.outpostErrorMeters)>.02||Number(item.flagErrorMeters)>.02||Number(item.guardErrorMeters)>.06);
 return {
  structures,offshore,houses,camps,garrisons,view,projectedCandidates,inventoryStructuralCandidates,navigationPointAudit,cuervoSceneRoots,nearbyCuervoStructureRoots,inventorySummary:inventory?{candidateCount:inventory.candidateCount,categoryCounts:inventory.categoryCounts,sceneCounts:inventory.sceneCounts}:null,
  summary:{
   structuresTotal:structures.total,grounded:structures.groundedCount,unsafe:structures.unsafeCount,
   unsafeVisibleBeforeAudit:structures.unsafeVisibleBeforeRepair,visibleInvalid:structures.visibleInvalidAfterRepair,
   autoRegisteredRoots:structures.autoRegisteredRootCount,untrackedRoots:structures.untrackedRootCount,
   offshoreIslandCount:offshore.islandCount,offshoreRootsScanned:offshore.transformNodesScanned,
   structuralCandidates:offshore.candidateCount,unregisteredStructuralCandidates:offshore.unregisteredCandidates,
   offshoreStructures:offshore.offshoreCount,visibleOffshoreStructures:offshore.visibleOffshoreCount,
   houseCount:houses.length,houseOutliers:houseOutliers.length,
   houseOutlierNames:houseOutliers.map(item=>({village:item.village,buildingIndex:item.buildingIndex,groundingErrorMeters:item.groundingErrorMeters,maximumFootingGapMeters:item.maximumFootingGapMeters,dryLandFootprintMarginMeters:item.dryLandFootprintMarginMeters,footingCorners:item.footingCorners})),
   campCount:camps.length,campOutliers:campOutliers.length,campOutlierDetails:campOutliers,
   garrisonCount:garrisons.length,garrisonOutliers:garrisonOutliers.length,garrisonOutlierDetails:garrisonOutliers
  }
 };
}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});let browser=null,page=null;
 try{
  const meta=fs.existsSync('dist/index.html')?fs.readFileSync('dist/index.html','utf8'):'';
  const marker='name="el-sin-nombre-build" content="',at=meta.indexOf(marker);
  report.build=at>=0?meta.slice(at+marker.length).split('"')[0]:null;
  browser=await phase('launch chromium',()=>chromium.launch({headless:true,timeout:60000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage']}));
  const context=await browser.newContext({viewport:{width:430,height:768},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>report.pageErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  await phase('load full normal game runtime',()=>page.goto(BASE_URL+'?test=1',{waitUntil:'domcontentloaded',timeout:90000}));
  const audio=page.locator('#audioGateStart');
  await phase('pass audio gate and select full quality',async()=>{if(await audio.isVisible().catch(()=>false))await audio.click();await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});await page.locator('#chooseQuality').click();});
  await phase('continue into game startup',async()=>{await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});await page.locator('#continueUnnamed').click();});
  await phase('wait for world setup',()=>page.waitForFunction(()=>window.__ELSN_TEST__&&window.__elSinNombreStartupSmoke?.worldReady===true,undefined,{timeout:180000,polling:500}));
  await phase('start a new campaign',async()=>{await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});await page.locator('#newGameChoice').click();await page.waitForFunction(()=>document.body.classList.contains('game-running')&&document.querySelector('#intro')?.getAttribute('aria-hidden')==='true',undefined,{timeout:30000,polling:250});});
  report.localNavigationVerification=await phase('verify live local minimap, compact coordinates and default follow camera',async()=>{
   await page.waitForFunction(()=>{const coords=document.getElementById('mapCoords');return coords&&(coords.textContent||'').startsWith('X ');},undefined,{timeout:15000,polling:200});
   const result=await page.evaluate(()=>{
    const map=document.getElementById('map'),coords=document.getElementById('mapCoords'),rect=map?.getBoundingClientRect();
    const cameraMode=window.__ELSN_CAMERA_CONTROL?.getMode?.()||null;
    const navigation=window.__NorseNavigationSuite?.getStatus?.()||null;
    const pixel=map?.getContext('2d')?.getImageData(240,172,1,1)?.data||null;
    return {mapExists:!!map,mapExpanded:!!map?.classList.contains('expanded'),mapCssWidth:Number((rect?.width||0).toFixed(1)),mapCssHeight:Number((rect?.height||0).toFixed(1)),coordinates:coords?.textContent||'',coordinatesVisible:!!coords&&getComputedStyle(coords).display!=='none',cameraMode,navigationMode:navigation?.mode,centrePixel:pixel?Array.from(pixel):null};
   });
   if(!result.mapExists||result.mapExpanded||!result.coordinatesVisible||!result.coordinates.startsWith('X '))throw new Error('Local minimap did not initialise correctly: '+JSON.stringify(result));
   if(result.cameraMode!=='follow')throw new Error('The campaign did not start in follow-camera mode: '+JSON.stringify(result));
   if(result.mapCssWidth<130||result.mapCssWidth>180)throw new Error('Unexpected minimap size: '+JSON.stringify(result));
   const file=path.join(OUT,'live-local-minimap.png');
   const shot=await page.screenshot({path:file,timeout:20000,animations:'disabled'});
   return {...result,screenshot:path.basename(file),screenshotBytes:shot.length};
  });
  report.mapMarkerVerification=await phase('verify expanded map click returns world coordinates',async()=>page.evaluate(()=>{
   const map=document.getElementById('map');if(!map)throw new Error('The tactical map canvas is missing.');
   if(!map.classList.contains('expanded'))map.click();
   const rect=map.getBoundingClientRect(),style=getComputedStyle(map),expected={x:400,z:250},logicalX=184+expected.x*.235,logicalY=174+expected.z*.235;
   const borderLeft=parseFloat(style.borderLeftWidth)||0,borderRight=parseFloat(style.borderRightWidth)||0,borderTop=parseFloat(style.borderTopWidth)||0,borderBottom=parseFloat(style.borderBottomWidth)||0;
   const contentWidth=Math.max(1,rect.width-borderLeft-borderRight),contentHeight=Math.max(1,rect.height-borderTop-borderBottom);
   const objectScale=Math.min(contentWidth/map.width,contentHeight/map.height),drawnWidth=map.width*objectScale,drawnHeight=map.height*objectScale;
   const offsetX=borderLeft+(contentWidth-drawnWidth)*.5,offsetY=borderTop+(contentHeight-drawnHeight)*.5;
   const clientX=rect.left+offsetX+logicalX/480*drawnWidth,clientY=rect.top+offsetY+logicalY/344*drawnHeight;
   map.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX,clientY}));
   const actual=window.__ELSN_TEST__?.mapTarget?.();
   const toleranceWorldUnits=3.2;if(!actual||Math.abs(actual.x-expected.x)>toleranceWorldUnits||Math.abs(actual.z-expected.z)>toleranceWorldUnits)throw new Error('Map tap projection mismatch: '+JSON.stringify({expected,actual,toleranceWorldUnits,rect:{width:rect.width,height:rect.height,borderLeft,borderRight,borderTop,borderBottom,drawnWidth,drawnHeight}}));
   return {expected,actual,expanded:map.classList.contains('expanded'),footer:map.getContext('2d')? 'canvas-rendered':'missing'};
  }));
  await phase('capture expanded full navigation chart',async()=>{
   const file=path.join(OUT,'expanded-navigation-chart.png');
   const shot=await page.screenshot({path:file,timeout:20000,animations:'disabled'});
   report.expandedNavigationChart={file:path.basename(file),bytes:shot.length};
  });
  await phase('close map after coordinate projection test',()=>page.evaluate(()=>{const close=document.getElementById('mapClose');if(close)close.click();else document.getElementById('map')?.classList.remove('expanded');document.getElementById('mapBackdrop')?.classList.remove('open');}));
  const baseline=await phase('measure baseline structure grounding before repairs',()=>page.evaluate(collectStructureSnapshot));
  const repairPass=await phase('run the game repair system in the disposable test renderer',()=>page.evaluate(()=>window.__ELSN_TEST__.repairAndAuditHabitableStructures()));
  await phase('allow repaired transforms and colliders to settle',()=>page.waitForTimeout(800));
  const settled=await phase('remeasure structures after the repair pass',()=>page.evaluate(collectStructureSnapshot));
  report.baseline=baseline;report.repairPass=repairPass;report.postAutomaticAudit=settled;
  report.runtimeRepairSimulation={testMode:true,waitMs:800,usesGameRepairSystem:true,explicitRepairApiCalled:true,productionDataModified:false,repairSummary:repairPass?{total:repairPass.total,groundedCount:repairPass.groundedCount,unsafeCount:repairPass.unsafeCount,repaired:repairPass.repaired,hiddenUnsafe:repairPass.hiddenUnsafe,visibleInvalidAfterRepair:repairPass.visibleInvalidAfterRepair}:null};
  report.habitableStructures=settled.structures;report.offshoreAudit=settled.offshore;report.settlementHouses=settled.houses;report.settlementCamps=settled.camps;report.garrisons=settled.garrisons;report.summary=settled.summary;
  report.initialPlayerCamera=settled.view;
 // Visually inspect each nearby structure/unknown geometry cluster from a dedicated camera.
 // This catches invasion/endgame props even when their imported node names are meaningless.
 report.objectInspectionCaptures=[];
 const inspectionTargetRows=[...(settled.nearbyCuervoStructureRoots||[]),...(settled.navigationPointAudit?.nearbyCandidates||[])];
 const inspectionTargets=Array.from(new Map(inspectionTargetRows.map(item=>[String(item.name||'unnamed')+'|'+Number(item.position?.x||0).toFixed(1)+'|'+Number(item.position?.z||0).toFixed(1),item])).values()).filter(item=>item.visible!==false&&item.enabled!==false).slice(0,48);
 for(let index=0;index<inspectionTargets.length;index++){
  const item=inspectionTargets[index],p=item.position||{},bounds=item.bounds||{},targetY=Number.isFinite(Number(bounds.bottomY))&&Number.isFinite(Number(bounds.topY))?(Number(bounds.bottomY)+Number(bounds.topY))*.5:(Number(p.y)||0)+2.5;
  const camera={x:(Number(p.x)||0)+26,y:Math.max(8,targetY+12),z:(Number(p.z)||0)+26,targetX:Number(p.x)||0,targetY,targetZ:Number(p.z)||0};
  const safeName=String(item.name||('object-'+index)).replace(/[^a-z0-9_-]+/gi,'-').slice(0,64);
  const file=path.join(OUT,'cuervo-object-'+String(index+1).padStart(2,'0')+'-'+safeName+'.png');
  try{
   const cameraState=await page.evaluate(args=>window.__ELSN_TEST__.setCamera(args),camera);
   await page.waitForTimeout(350);
   const shot=await page.screenshot({path:file,timeout:20000,animations:'disabled'});
   report.objectInspectionCaptures.push({index:index+1,file:path.basename(file),bytes:shot.length,name:item.name,role:item.role,classificationConfidence:item.confidence,position:item.position,bounds:item.bounds,meshNames:item.meshNames,materials:item.materials,grounding:item.grounding,camera:cameraState});
  }catch(error){report.objectInspectionCaptures.push({index:index+1,name:item.name,role:item.role,position:item.position,error:String(error?.message||error)});}
 }
  report.navigationPointAudit=settled.navigationPointAudit;
  report.projectedStructuralCandidates=settled.projectedCandidates;
  report.inventoryStructuralCandidates=settled.inventoryStructuralCandidates;
  report.inventorySummary=settled.inventorySummary;
  const screenshotFile=path.join(OUT,'structure-grounding-default-player-view.png');
  try{
   const screenshot=await phase('capture portrait player view without WebGL canvas readback',()=>page.screenshot({path:screenshotFile,timeout:20000,animations:'disabled'}));
   report.screenshot={file:path.basename(screenshotFile),bytes:screenshot.length,method:'playwright-page-screenshot',view:'default-new-campaign-player-camera'};
  }catch(error){report.screenshotError=String(error?.message||error);}
  // Capture the same Cuervo hut cluster from three offshore camera positions. These are
  // diagnostic-only camera overrides in the disposable ?test=1 renderer; no world entity moves.
  const cuervoHuts=(settled.houses||[]).filter(item=>item.nearestIslandIndex===0);
  const targetX=25.0,targetZ=-5.0;
  const seaViews=[
   {id:'west-sea',x:-65,y:11,z:-5},
   {id:'south-sea',x:25,y:12,z:72},
   {id:'east-sea',x:88,y:11,z:-5},
   {id:'north-sea',x:25,y:12,z:-78}
  ];
  report.coastalStructureViews=[];
  for(const view of seaViews){
   const file=path.join(OUT,'cuervo-huts-'+view.id+'.png');
   try{
    const camera=await page.evaluate(({x,y,z,targetX,targetZ})=>{
     const targetY=2.5;
     window.__ELSN_TEST__.setCamera({x,y,z,targetX,targetY,targetZ});
     return window.__ELSN_TEST__.sceneViewSnapshot();
    },{...view,targetX,targetZ});
    await page.waitForTimeout(450);
    const shot=await page.screenshot({path:file,timeout:20000,animations:'disabled'});
    report.coastalStructureViews.push({id:view.id,file:path.basename(file),bytes:shot.length,camera,target:{x:targetX,y:2.5,z:targetZ},hutCount:cuervoHuts.length});
   }catch(error){report.coastalStructureViews.push({id:view.id,error:String(error?.message||error)});}
  }
  const initialRows=baseline.structures.structures||[];
  const initialUnsafe=initialRows.filter(item=>item.safe!==true);
  const repairedRows=Array.isArray(repairPass?.structures)?repairPass.structures:[];
  const verifiedSafeAfter=initialRows.reduce((count,item,index)=>count+(item.safe!==true&&repairedRows[index]?.safe===true?1:0),0);
  const gate={
   fullRuntime:true,
   structuresTotal:report.summary.structuresTotal,
   expectedMinimumStructures:39,
   allInitialUnsafeVerifiedSafe:verifiedSafeAfter===initialUnsafe.length,
   initialUnsafeCount:initialUnsafe.length,
   verifiedSafeAfterCount:verifiedSafeAfter,
   unsafeAfter:report.summary.unsafe,
   visibleInvalidAfter:report.summary.visibleInvalid,
   untrackedRootsAfter:report.summary.untrackedRoots,
   unregisteredStructuralCandidatesAfter:report.summary.unregisteredStructuralCandidates,
   offshoreStructuresAfter:report.summary.offshoreStructures,
   visibleOffshoreStructuresAfter:report.summary.visibleOffshoreStructures,
   offshoreIslandCount:report.summary.offshoreIslandCount,
   houseCount:report.summary.houseCount,houseOutliers:report.summary.houseOutliers,
   campCount:report.summary.campCount,campOutliers:report.summary.campOutliers,
   garrisonCount:report.summary.garrisonCount,garrisonOutliers:report.summary.garrisonOutliers
  };
  report.fullRuntimeStructureGate=gate;
  const passed=report.summary.structuresTotal>=39&&gate.allInitialUnsafeVerifiedSafe&&gate.unsafeAfter===0&&
   gate.visibleInvalidAfter===0&&gate.untrackedRootsAfter===0&&gate.unregisteredStructuralCandidatesAfter===0&&
   gate.offshoreStructuresAfter===0&&gate.visibleOffshoreStructuresAfter===0&&gate.offshoreIslandCount===13&&gate.houseCount>=12&&
   gate.houseOutliers===0&&gate.campCount>=8&&gate.campOutliers===0&&gate.garrisonCount>=9&&gate.garrisonOutliers===0;
  report.verdict=passed?'measured':'issues-found';
  if(!passed)throw new Error('Full normal-runtime structure safety gate failed: '+JSON.stringify(gate));
 }catch(error){report.failure=String(error?.stack||error);report.verdict='fail';
 }finally{
  report.finishedAt=new Date().toISOString();report.elapsedMs=Date.now()-startedAt;writeReport();
  if(browser){try{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);}catch(_){}}
 }
 console.log('[STRUCTURE_AUDIT_RESULT] '+JSON.stringify({verdict:report.verdict,summary:report.summary,elapsedMs:report.elapsedMs,failure:report.failure}));
 if(report.verdict!=='measured')process.exitCode=2;
}
main().catch(error=>{report.failure=String(error?.stack||error);report.verdict='fail';report.finishedAt=new Date().toISOString();report.elapsedMs=Date.now()-startedAt;try{writeReport();}catch(_){}console.error(error);process.exitCode=2;});
