import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const BASE_URL = process.env.CAPTURE_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/custom-scene-captures');
const rawPlan = process.env.CAPTURE_PLAN_JSON || '[]';
const plan = JSON.parse(rawPlan);
const MAX_SHOTS = 40;
const CAPTURE_SEED = Number.parseInt(process.env.CAPTURE_SEED || '20261110', 10) >>> 0;
const DEFAULT_VIEWPORT = { width: 1600, height: 900, deviceScaleFactor: 1 };

function finite(value, label) {
  assert.ok(Number.isFinite(value), label + ' debe ser numérico.');
}
function validateCamera(camera, label, relative = false) {
  for (const key of ['x','y','z','targetX','targetY','targetZ']) {
    finite(camera?.[key], label + ': falta ' + key + '.');
  }
  assert.ok(camera.y >= -100 && camera.y <= 500, label + ': altura de cámara fuera de rango.');
  assert.ok(Math.hypot(camera.x-camera.targetX,camera.y-camera.targetY,camera.z-camera.targetZ) > .25,
    label + ': la cámara no puede mirar exactamente desde el objetivo.');
}
function expandPlan(input) {
  assert.ok(Array.isArray(input), 'capture_plan debe ser una lista JSON.');
  const expanded = [];
  for (const [index, shot] of input.entries()) {
    assert.ok(shot && typeof shot === 'object', 'Captura ' + index + ': objeto inválido.');
    const base = shot.camera || shot;
    if (shot.orbit) {
      const orbit = shot.orbit;
      const count = Math.max(1, Math.min(48, Number(orbit.count) || 8));
      const radius = Number(orbit.radius) || Math.hypot(base.x, base.z);
      const elevation = Number(orbit.elevation ?? base.y);
      const target = { x: Number(orbit.targetX ?? base.targetX), y: Number(orbit.targetY ?? base.targetY), z: Number(orbit.targetZ ?? base.targetZ) };
      const start = Number(orbit.startDegrees) || 0;
      const sweep = Number(orbit.sweepDegrees) || 360;
      for (let i=0;i<count;i++) {
        const angle=(start+(count===1?0:sweep*i/count))*Math.PI/180;
        expanded.push({...shot,id:shot.id+'-'+String(i+1).padStart(2,'0'),camera:{
          x:target.x+Math.sin(angle)*radius,y:elevation,z:target.z+Math.cos(angle)*radius,
          targetX:target.x,targetY:target.y,targetZ:target.z
        },orbit:undefined});
      }
    } else if (shot.views && Array.isArray(shot.views)) {
      for (const [viewIndex, view] of shot.views.entries()) {
        expanded.push({...shot,id:shot.id+'-'+String(viewIndex+1).padStart(2,'0'),camera:{...base,...view},views:undefined});
      }
    } else expanded.push(shot);
  }
  assert.ok(expanded.length >= 1 && expanded.length <= MAX_SHOTS,
    'El plan expandido debe contener entre 1 y ' + MAX_SHOTS + ' capturas; contiene ' + expanded.length + '.');
  const ids = new Set();
  for (const [i,shot] of expanded.entries()) {
    assert.match(String(shot.id || ''), /^[a-zA-Z0-9_-]{1,48}$/, 'Captura '+i+': id inválido.');
    assert.ok(!ids.has(shot.id), 'ID repetido: '+shot.id); ids.add(shot.id);
    finite(shot.time ?? 37, shot.id+': time');
    assert.ok(shot.tide === undefined || ['natural','high','low'].includes(shot.tide),shot.id+': tide inválida.');
    if (Number.isInteger(shot.islandIndex)) {
      for (const key of ['x','y','z','targetX','targetY','targetZ']) finite(base[key],shot.id+': offset '+key);
    } else validateCamera(shot.camera || shot,shot.id);
  }
  return expanded;
}
const shots=expandPlan(plan);
const manifest={schema:3,capturedAt:new Date().toISOString(),finishedAt:null,build:null,seed:CAPTURE_SEED,renderer:'Chromium headless + ANGLE SwiftShader',viewport:DEFAULT_VIEWPORT,requestedPlanCount:plan.length,expandedShotCount:shots.length,islands:[],sceneInventory:null,captures:[],failures:[],consoleErrors:[],pageErrors:[],phaseTimingsMs:{},determinism:{tested:0,failed:0},geometryAudit:null,initialPhysicalAudit:null,auditSummary:null};
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
      return {build:api?.build,islands:api?.islands||[],startup:window.__elSinNombreStartupSmoke?.result||null,
        meshCount:api?.diagnostics?.()?.meshCount??null};
    });
    manifest.build=boot.build;
    manifest.islands=boot.islands.map((island,index)=>({index,name:island.name,x:island.x,z:island.z,radiusMeters:island.r}));
    manifest.sceneInventory={islandCount:boot.islands.length,meshCount:boot.meshCount,startup:boot.startup};
    assert.ok(boot.islands.length,'El juego no ha expuesto sus islas.');
    assert.ok(await page.evaluate(()=>!!window.__ELSN_TEST__?.captureCanvas),'No existe captureCanvas en la API de prueba.');

    // One read-only physical audit before camera movement. It is recorded independently
    // from screenshots: audit failures must never discard an otherwise valid PNG.
    const auditStarted=Date.now();
    const initialAudit=await page.evaluate(()=>{const api=window.__ELSN_TEST__,result={};result.geometry=api.auditIslandGeometry();result.structuresBeforeRepair=api.habitableStructureAudit();result.repair=api.repairAndAuditHabitableStructures();result.structuresAfterRepair=api.habitableStructureAudit();for(const [key,method] of Object.entries({huts:api.settlementGrounding,camps:api.settlementCampGrounding,garrisons:api.garrisonGrounding})){try{result[key]=method();}catch(error){result[key+'_error']=String(error.stack||error);}}return result;});
    manifest.phaseTimingsMs.oneTimeGeometryAndPhysicalAudit=Date.now()-auditStarted;
    manifest.initialPhysicalAudit=initialAudit;manifest.geometryAudit=initialAudit.geometry;
    manifest.auditSummary={structureCount:initialAudit.structuresAfterRepair?.total??null,unsafeVisibleBeforeRepair:initialAudit.repair?.unsafeVisibleBeforeRepair??null,visibleInvalidAfterRepair:initialAudit.repair?.visibleInvalidAfterRepair??null,unsafeCount:initialAudit.structuresAfterRepair?.unsafeCount??null,hutCount:initialAudit.huts?.length??null,hutGroundingErrors:initialAudit.huts?.filter(item=>Math.abs(item.groundingErrorMeters??Infinity)>.02).length??null,campCount:initialAudit.camps?.length??null,garrisonCount:initialAudit.garrisons?.length??null};writeManifest();

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
          return {camera,canvas:{width:document.getElementById('renderCanvas')?.width,height:document.getElementById('renderCanvas')?.height}};
        },{shot});
        const firstPng=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
        await page.evaluate(()=>window.__ELSN_TEST__.render());
        const secondPng=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
        const firstMatch=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(firstPng||''),secondMatch=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(secondPng||'');
        assert.ok(firstMatch&&secondMatch,'No se obtuvieron dos PNG deterministas.');
        const buffer=Buffer.from(firstMatch[1],'base64'),secondBuffer=Buffer.from(secondMatch[1],'base64');assert.ok(buffer.length>1000,'PNG vacío o incompleto.');assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
        const firstHash=createHash('sha256').update(buffer).digest('hex'),secondHash=createHash('sha256').update(secondBuffer).digest('hex');manifest.determinism.tested++;if(firstHash!==secondHash)manifest.determinism.failed++;assert.equal(secondHash,firstHash,'Render no determinista en '+shot.id);
        const file=shot.id+'.png';fs.writeFileSync(path.join(OUT,file),buffer);const telemetry=await page.evaluate(()=>({diagnostics:window.__ELSN_TEST__.diagnostics()}));
        manifest.captures.push({id:shot.id,file,camera:prepared.camera,canvas:prepared.canvas,time:shot.time??37,tide:shot.tide??'natural',bytes:buffer.length,sha256:firstHash,durationMs:Date.now()-started,telemetry});
        manifest.phaseTimingsMs.captureTotal=(manifest.phaseTimingsMs.captureTotal||0)+(Date.now()-started);console.log('[scene-capture] '+manifest.captures.length+'/'+shots.length+' '+shot.id);
      } catch(error){manifest.failures.push({id:shot.id,error:String(error.stack||error)});console.error('[scene-capture] failed '+shot.id+': '+error.message);}
      finally{manifest.lastUpdatedAt=new Date().toISOString();writeManifest();}
    }
    // Create a machine-readable index for quick triage, including every structure and
    // the capture IDs that were actually saved even when some shots failed.
    manifest.captureIndex=manifest.captures.map(({id,file,camera,time,tide,bytes,sha256})=>({id,file,camera,time,tide,bytes,sha256}));
    assert.equal(manifest.captures.length,shots.length,'Capturas completas: '+manifest.captures.length+'/'+shots.length);assert.equal(manifest.determinism.failed,0,'Renders no deterministas.');
    assert.ok(manifest.auditSummary?.visibleInvalidAfterRepair===0,'Estructuras inseguras visibles: '+JSON.stringify(manifest.auditSummary));assert.equal(manifest.auditSummary?.structureCount,39);assert.equal(manifest.auditSummary?.hutCount,12);assert.equal(manifest.auditSummary?.campCount,8);assert.equal(manifest.auditSummary?.garrisonCount,9);assert.equal(manifest.geometryAudit?.islandCount,13);assert.ok(manifest.auditSummary?.hutGroundingErrors===0);
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
