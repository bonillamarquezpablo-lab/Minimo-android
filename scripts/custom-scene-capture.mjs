import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { expandCapturePlan, createZoneInspectionShots, makeStableObjectCode, MAX_CAPTURE_SHOTS } from './scene-capture-inspection.mjs';

const BASE_URL = process.env.CAPTURE_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/custom-scene-captures');
const rawPlan = process.env.CAPTURE_PLAN_JSON || '[]';
const plan = JSON.parse(rawPlan);
const MAX_SHOTS = MAX_CAPTURE_SHOTS;
const CAPTURE_SEED = Number.parseInt(process.env.CAPTURE_SEED || '20261110', 10) >>> 0;
const DEFAULT_VIEWPORT = { width: 1600, height: 900, deviceScaleFactor: 1 };
const expandedPlan = expandCapturePlan(plan);
let shots = [...expandedPlan.shots];
const manifest={schema:4,capturedAt:new Date().toISOString(),finishedAt:null,build:null,seed:CAPTURE_SEED,renderer:'Chromium headless + ANGLE SwiftShader',viewport:DEFAULT_VIEWPORT,requestedPlanCount:plan.length,expandedShotCount:shots.length,islands:[],sceneInventory:null,readOnlyCapture:true,objectInventory:null,zoneInspections:[],captures:[],failures:[],consoleErrors:[],pageErrors:[],phaseTimingsMs:{},determinism:{tested:0,failed:0},geometryAudit:null,initialPhysicalAudit:null,auditSummary:null};
function writeManifest(){const target=path.join(OUT,'manifest.json'),temporary=target+'.tmp';fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(temporary,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(temporary,target);}
async function main(){fs.mkdirSync(OUT,{recursive:true});let browser;
  try {
    browser=await chromium.launch({headless:true,timeout:60000,args:[
      '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
      '--disable-dev-shm-usage','--enable-webgl2','--force-color-profile=srgb'
    ]});
    const context=await browser.newContext({viewport:{width:DEFAULT_VIEWPORT.width,height:DEFAULT_VIEWPORT.height},deviceScaleFactor:DEFAULT_VIEWPORT.deviceScaleFactor});
    const page=await context.newPage();
    page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
    await page.addInitScript(({seed})=>{if(new URLSearchParams(location.search).get('test')!=='1')return;let state=seed>>>0;Math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};Object.defineProperty(window,'__ELSN_CAPTURE_SEED__',{value:seed,configurable:false});},{seed:CAPTURE_SEED});
    page.on('pageerror',e=>manifest.pageErrors.push(String(e.stack||e)));
    page.on('console',m=>{if(m.type()==='error')manifest.consoleErrors.push(m.text());});
    const bootStarted=Date.now();
    await page.goto(BASE_URL+'?test=1&coastref=1',{waitUntil:'domcontentloaded',timeout:90000});
    const audioGate=page.locator('#audioGateStart');
    if(await audioGate.isVisible().catch(()=>false)) await audioGate.click();
    await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});
    await page.locator('#continueUnnamed').click();
    await page.waitForFunction(()=>window.__ELSN_TEST__&&window.__elSinNombreStartupSmoke?.worldReady===true,undefined,{timeout:180000,polling:500});
    await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});
    await page.locator('#newGameChoice').click();
    await page.waitForFunction(()=>document.body.classList.contains('game-running')&&document.querySelector('#intro')?.getAttribute('aria-hidden')==='true',undefined,{timeout:30000,polling:250});
    const readiness=await page.evaluate(async()=>window.__ELSN_TEST__.prepareCaptureFrame({timeoutMs:120000}));
    manifest.phaseTimingsMs.startupAndReadiness=Date.now()-bootStarted;manifest.readiness=readiness;manifest.phaseTimingsMs.readiness=readiness.elapsedMs;

    const boot=await page.evaluate(()=>{
      const api=window.__ELSN_TEST__;
      return {build:api?.build,islands:api?.islands||[],startup:window.__elSinNombreStartupSmoke?.result||null};
    });
    manifest.build=boot.build;
    manifest.islands=boot.islands.map((island,index)=>({index,name:island.name,x:island.x,z:island.z,radiusMeters:island.r}));
    manifest.sceneInventory={islandCount:boot.islands.length,meshCount:boot.meshCount,startup:boot.startup};
    assert.ok(boot.islands.length,'El juego no ha expuesto sus islas.');
    assert.ok(await page.evaluate(()=>!!window.__ELSN_TEST__?.captureCanvas),'No existe captureCanvas en la API de prueba.');

    // Inspect the untouched runtime first. This capture path is strictly read-only:
    // screenshots must show the scene as it exists, never a repaired simulation.
    const auditStarted=Date.now();
    const initialAudit=await page.evaluate(()=>window.__ELSN_TEST__.inspectScene({inventoryLimit:5000,offshoreLimit:500}));
    manifest.phaseTimingsMs.initialReadOnlyAudit=Date.now()-auditStarted;
    initialAudit.structuralCandidates=(initialAudit.structuralCandidates||[]).map(item=>({...item,code:item.code||makeStableObjectCode(item)}));
    manifest.initialPhysicalAudit=initialAudit;
    manifest.geometryAudit=initialAudit.geometry;
    manifest.objectInventory={
      readOnly:true,
      habitableStructureAudit:initialAudit.habitableStructures,
      offshoreAudit:initialAudit.offshore,
      completeSceneInventory:initialAudit.sceneInventory,
      structuralCandidates:initialAudit.structuralCandidates
    };
    manifest.auditSummary=initialAudit.counts;
    manifest.sceneInventory={...manifest.sceneInventory,meshCount:initialAudit.runtime?.meshCount??null,returnedObjectCount:initialAudit.sceneInventory?.returnedCount??null,structuralCandidateCount:initialAudit.structuralCandidates.length};
    manifest.unifiedInspection={
      schema:initialAudit.schema,
      mode:initialAudit.mode,
      readOnly:initialAudit.readOnly,
      sceneChanges:initialAudit.sceneChanges,
      capturedAt:initialAudit.capturedAt,
      durationMs:initialAudit.durationMs,
      counts:initialAudit.counts,
      phaseTimingsMs:initialAudit.phaseTimingsMs,
      errors:initialAudit.errors
    };
    if(!initialAudit.structuralCandidates)throw new Error('La inspección unificada no ha devuelto el inventario de estructuras.');
    if(initialAudit.errors&&Object.keys(initialAudit.errors).length){
      console.warn('[scene-inspection] Secciones con errores:',JSON.stringify(initialAudit.errors));
    }

    // Resolve each requested zone against the inventory from this exact game run.
    for(const zoneRequest of expandedPlan.zones){
      const resolved=createZoneInspectionShots(zoneRequest,boot.islands,initialAudit.structuralCandidates);
      shots.push(...resolved.shots);
      manifest.zoneInspections.push(resolved.report);
    }
    const globalCaptureIds=new Set();
    for(const shot of shots){
      if(globalCaptureIds.has(shot.id))throw new Error('ID de captura duplicado entre cámaras y zonas: '+shot.id);
      globalCaptureIds.add(shot.id);
    }
    if(shots.length<1||shots.length>MAX_SHOTS){
      throw new Error('El plan final debe generar entre 1 y '+MAX_SHOTS+' capturas; ha generado '+shots.length+'. Reduce maxTargets, angles, times o tides.');
    }
    manifest.expandedShotCount=shots.length;
    manifest.phaseTimingsMs.inspectionPlanResolution=Date.now()-auditStarted;
    writeManifest();

    for(const shot of shots) {
      const started=Date.now();
      try {
        const prepared=await page.evaluate(({shot})=>{
          const api=window.__ELSN_TEST__,base=shot.camera||shot;
          let camera={...base};
          if(Number.isInteger(shot.islandIndex)){
            const island=api.islands[shot.islandIndex];if(!island)throw new Error('No existe la isla '+shot.islandIndex);
            camera={x:island.x+base.x,y:base.y,z:island.z+base.z,targetX:island.x+base.targetX,targetY:base.targetY,targetZ:island.z+base.targetZ};
          }
          api.setCamera(camera);
          api.setWaterState({time:shot.time??37,tide:shot.tide??'natural'});
          api.render();
          return {camera,cameraReadback:api.sceneViewSnapshot?.()??null,
            canvas:{width:document.getElementById('renderCanvas')?.width,height:document.getElementById('renderCanvas')?.height}};
        },{shot});
        const capturedAt=new Date().toISOString();
        const firstPng=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
        await page.evaluate(()=>window.__ELSN_TEST__.render());
        const secondPng=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
        const firstMatch=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(firstPng||''),secondMatch=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(secondPng||'');
        assert.ok(firstMatch&&secondMatch,'No se obtuvieron dos PNG deterministas.');
        const buffer=Buffer.from(firstMatch[1],'base64'),secondBuffer=Buffer.from(secondMatch[1],'base64');assert.ok(buffer.length>1000,'PNG vacío o incompleto.');assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
        const firstHash=createHash('sha256').update(buffer).digest('hex'),secondHash=createHash('sha256').update(secondBuffer).digest('hex');manifest.determinism.tested++;if(firstHash!==secondHash)manifest.determinism.failed++;assert.equal(secondHash,firstHash,'Render no determinista en '+shot.id);
        const file=shot.id+'.png';fs.writeFileSync(path.join(OUT,file),buffer);const telemetry=await page.evaluate(()=>({diagnostics:window.__ELSN_TEST__.diagnostics()}));
        manifest.captures.push({id:shot.id,file,capturedAt,camera:prepared.camera,cameraReadback:prepared.cameraReadback,
          canvas:prepared.canvas,time:shot.time??37,tide:shot.tide??'natural',
          zoneId:shot.zoneId??null,zoneLabel:shot.zoneLabel??null,inspectionFocus:shot.inspectionFocus??null,
          inspectionPurpose:shot.inspectionPurpose??'manual-camera',worldTarget:shot.worldTarget??null,subject:shot.subject??null,
          bytes:buffer.length,sha256:firstHash,durationMs:Date.now()-started,telemetry});
        manifest.phaseTimingsMs.captureTotal=(manifest.phaseTimingsMs.captureTotal||0)+(Date.now()-started);console.log('[scene-capture] '+manifest.captures.length+'/'+shots.length+' '+shot.id);
      } catch(error){manifest.failures.push({id:shot.id,error:String(error.stack||error)});console.error('[scene-capture] failed '+shot.id+': '+error.message);}
      finally{manifest.lastUpdatedAt=new Date().toISOString();writeManifest();}
    }
    // Create a machine-readable index for quick triage, including every structure and
    // the capture IDs that were actually saved even when some shots failed.
    manifest.captureIndex=manifest.captures.map(({id,file,camera,cameraReadback,time,tide,bytes,sha256,zoneId,zoneLabel,inspectionFocus,inspectionPurpose,worldTarget,subject})=>
      ({id,file,camera,cameraReadback,time,tide,bytes,sha256,zoneId,zoneLabel,inspectionFocus,inspectionPurpose,worldTarget,subject}));
    fs.writeFileSync(path.join(OUT,'capture-index.json'),JSON.stringify({schema:1,build:manifest.build,zoneInspections:manifest.zoneInspections,captures:manifest.captureIndex},null,2)+'\n');
    assert.equal(manifest.captures.length,shots.length,'Capturas completas: '+manifest.captures.length+'/'+shots.length);
    assert.equal(manifest.determinism.failed,0,'Renders no deterministas.');
    assert.equal(manifest.geometryAudit?.islandCount,13,'La auditoría geométrica no ha reconocido las 13 islas.');
    assert.ok(manifest.objectInventory?.structuralCandidates,'No se pudo generar el inventario de estructuras.');
  } finally {
    manifest.finishedAt=new Date().toISOString();writeManifest();
    if(browser)await browser.close();
  }
  if(manifest.failures.length) {
    console.error('CUSTOM SCENE CAPTURE PARTIAL: '+manifest.captures.length+'/'+shots.length+' PNGs; '+manifest.failures.length+' fallos.');
    process.exitCode=2;
  } else console.log('CUSTOM SCENE CAPTURE OK: '+manifest.captures.length+' PNGs.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
