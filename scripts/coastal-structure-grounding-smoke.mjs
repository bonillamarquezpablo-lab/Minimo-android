import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL=process.env.STRUCTURE_TEST_URL||'http://127.0.0.1:4176/';
const OUT=path.resolve('artifacts/structure-grounding');
const startedAt=Date.now();
const report={schema:2,startedAt:new Date().toISOString(),finishedAt:null,build:null,renderer:'Chromium headless + ANGLE SwiftShader',mode:'baseline audit plus automatic-repair observation in a disposable test renderer',testRendererOnlyMutations:true,productionDataModified:false,phases:[],consoleErrors:[],pageErrors:[],baseline:null,postAutomaticAudit:null,runtimeRepairSimulation:null,habitableStructures:null,settlementHouses:null,settlementCamps:null,garrisons:null,summary:null,screenshot:null,verdict:'not-run',failure:null};
function writeReport(){fs.mkdirSync(OUT,{recursive:true});const tmp=path.join(OUT,'structure-grounding.json.tmp');fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');fs.renameSync(tmp,path.join(OUT,'structure-grounding.json'));}
async function phase(name,fn){const start=Date.now(),row={name,startedAt:new Date().toISOString(),status:'in-progress'};report.phases.push(row);console.log('[STRUCTURE_AUDIT] START '+name);try{const result=await fn();row.status='completed';return result;}catch(error){row.status='failed';row.error=String(error?.stack||error);throw error;}finally{row.finishedAt=new Date().toISOString();row.durationMs=Date.now()-start;console.log('[STRUCTURE_AUDIT] END '+name+' '+row.status+' '+row.durationMs+'ms');}}
function collectStructureSnapshot(){
 const api=window.__ELSN_TEST__;
 if(!api)throw new Error('The game inspection API is not available.');
 const structures=api.habitableStructureAudit();
 const houses=api.settlementGrounding();
 const camps=api.settlementCampGrounding();
 const garrisons=api.garrisonGrounding();
 const houseOutliers=houses.filter(item=>Math.abs(Number(item.groundingErrorMeters)||0)>.02||Number(item.maximumFootingGapMeters)>.02||Number(item.dryLandFootprintMarginMeters)<1.25);
 const campOutliers=camps.filter(item=>item.withinDryLandBand===false||Math.abs(Number(item.anchorErrorMeters)||0)>.02);
 const garrisonOutliers=garrisons.filter(item=>Number(item.maximumAnchorErrorMeters)>.02);
 return {
  structures,houses,camps,garrisons,
  summary:{
   structuresTotal:structures.total,grounded:structures.groundedCount,unsafe:structures.unsafeCount,
   unsafeVisibleBeforeAudit:structures.unsafeVisibleBeforeRepair,visibleInvalid:structures.visibleInvalidAfterRepair,
   autoRegisteredRoots:structures.autoRegisteredRootCount,untrackedRoots:structures.untrackedRootCount,
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
  const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1});
  page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>report.pageErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  await phase('load coast-only game',()=>page.goto(BASE_URL+'?test=1&coastref=1',{waitUntil:'domcontentloaded',timeout:90000}));
  const audio=page.locator('#audioGateStart');
  await phase('pass audio gate and select full quality',async()=>{if(await audio.isVisible().catch(()=>false))await audio.click();await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});await page.locator('#chooseQuality').click();});
  await phase('continue into game startup',async()=>{await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});await page.locator('#continueUnnamed').click();});
  await phase('wait for world setup',()=>page.waitForFunction(()=>window.__ELSN_TEST__&&window.__elSinNombreStartupSmoke?.worldReady===true,undefined,{timeout:180000,polling:500}));
  await phase('start a new campaign',async()=>{await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});await page.locator('#newGameChoice').click();await page.waitForFunction(()=>document.body.classList.contains('game-running')&&document.querySelector('#intro')?.getAttribute('aria-hidden')==='true',undefined,{timeout:30000,polling:250});});
  const baseline=await phase('measure baseline structure grounding before repairs',()=>page.evaluate(collectStructureSnapshot));
  const repairPass=await phase('run the game repair system in the disposable test renderer',()=>page.evaluate(()=>window.__ELSN_TEST__.repairAndAuditHabitableStructures()));
  await phase('allow repaired transforms and colliders to settle',()=>page.waitForTimeout(800));
  const settled=await phase('remeasure structures after the repair pass',()=>page.evaluate(collectStructureSnapshot));
  report.baseline=baseline;report.repairPass=repairPass;report.postAutomaticAudit=settled;
  report.runtimeRepairSimulation={testMode:true,waitMs:800,usesGameRepairSystem:true,explicitRepairApiCalled:true,productionDataModified:false,repairSummary:repairPass?{total:repairPass.total,groundedCount:repairPass.groundedCount,unsafeCount:repairPass.unsafeCount,repaired:repairPass.repaired,hiddenUnsafe:repairPass.hiddenUnsafe,visibleInvalidAfterRepair:repairPass.visibleInvalidAfterRepair}:null};
  report.habitableStructures=settled.structures;report.settlementHouses=settled.houses;report.settlementCamps=settled.camps;report.garrisons=settled.garrisons;report.summary=settled.summary;
  report.inspectionCamera=await phase('aim inspection camera at Cuervo settlement',()=>page.evaluate(()=>window.__ELSN_TEST__.setCamera({x:31,y:12,z:17,targetX:31,targetY:3,targetZ:-17})));
  await phase('settle Cuervo inspection view',()=>page.waitForTimeout(500));
  const screenshotDataUrl=await phase('capture the resulting WebGL scene',()=>page.evaluate(()=>window.__ELSN_TEST__?.captureCanvas?.()||null));
  if(typeof screenshotDataUrl!=='string'||!screenshotDataUrl.startsWith('data:image/png;base64,'))throw new Error('The game canvas did not return a valid PNG data URL.');
  const screenshot=Buffer.from(screenshotDataUrl.slice('data:image/png;base64,'.length),'base64');
  if(screenshot.length<1000||screenshot.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('The captured game canvas is not a valid PNG.');
  const screenshotFile=path.join(OUT,'structure-grounding-scene.png');fs.writeFileSync(screenshotFile,screenshot);
  report.screenshot={file:path.basename(screenshotFile),bytes:screenshot.length,method:'webgl-canvas-readback'};
  report.verdict=settled.summary.structuresTotal>0?'measured':'inconclusive';
  if(report.verdict==='inconclusive')throw new Error('No registered habitable structures were returned by the inspection API.');
 }catch(error){report.failure=String(error?.stack||error);report.verdict='fail';
 }finally{
  report.finishedAt=new Date().toISOString();report.elapsedMs=Date.now()-startedAt;writeReport();
  if(browser){try{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);}catch(_){}}
 }
 console.log('[STRUCTURE_AUDIT_RESULT] '+JSON.stringify({verdict:report.verdict,summary:report.summary,elapsedMs:report.elapsedMs,failure:report.failure}));
 if(report.verdict!=='measured')process.exitCode=2;
}
main().catch(error=>{report.failure=String(error?.stack||error);report.verdict='fail';report.finishedAt=new Date().toISOString();report.elapsedMs=Date.now()-startedAt;try{writeReport();}catch(_){}console.error(error);process.exitCode=2;});
