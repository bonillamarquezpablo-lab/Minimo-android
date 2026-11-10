import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.CAPTURE_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/custom-scene-captures');
const rawPlan = process.env.CAPTURE_PLAN_JSON || '[]';
const plan = JSON.parse(rawPlan);
const MAX_SHOTS = 200;
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

function safeCall(fn) { try { return { value: fn(), error: null }; } catch (error) { return { value: null, error: String(error.stack || error) }; } }
async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  const manifest={
    schema:2,capturedAt:new Date().toISOString(),finishedAt:null,build:null,
    renderer:'Chromium headless + ANGLE SwiftShader',
    viewport:DEFAULT_VIEWPORT,requestedPlanCount:plan.length,expandedShotCount:shots.length,
    islands:[],sceneInventory:null,captures:[],failures:[],consoleErrors:[],pageErrors:[],
    auditSummary:null
  };
  let browser;
  try {
    browser=await chromium.launch({headless:true,timeout:60000,args:[
      '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
      '--disable-dev-shm-usage','--enable-webgl2','--force-color-profile=srgb'
    ]});
    const context=await browser.newContext({viewport:{width:DEFAULT_VIEWPORT.width,height:DEFAULT_VIEWPORT.height},deviceScaleFactor:DEFAULT_VIEWPORT.deviceScaleFactor});
    const page=await context.newPage();
    page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
    page.on('pageerror',e=>manifest.pageErrors.push(String(e.stack||e)));
    page.on('console',m=>{if(m.type()==='error')manifest.consoleErrors.push(m.text());});
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
    await page.waitForTimeout(1200);

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
    const initialAudit=await page.evaluate(()=>{
      const api=window.__ELSN_TEST__,result={};
      for(const [key,method] of Object.entries({
        structures:api.habitableStructureAudit,
        huts:api.settlementGrounding,
        camps:api.settlementCampGrounding,
        garrisons:api.garrisonGrounding
      })) {
        try { result[key]=typeof method==='function'?method():null; }
        catch(error){result[key+'_error']=String(error.stack||error);}
      }
      return result;
    });
    manifest.initialPhysicalAudit=initialAudit;
    const structureRows=initialAudit.structures?.structures||[];
    manifest.auditSummary={
      structureCount:structureRows.length,
      unsafeCount:initialAudit.structures?.unsafeCount??null,
      visibleInvalidCount:initialAudit.structures?.visibleInvalidCount??null,
      hutCount:initialAudit.huts?.length??null,
      hutGroundingErrors:initialAudit.huts?.filter(item=>Math.abs(item.groundingErrorMeters??Infinity)>.08).length??null
    };

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
        // Let the renderer settle after camera/water changes, then save the image first.
        await page.waitForTimeout(Number.isFinite(shot.settleMs)?Math.max(0,Math.min(5000,shot.settleMs)):180);
        const pngResult=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
        const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(pngResult||'');
        assert.ok(match,'No se obtuvo PNG.');
        const buffer=Buffer.from(match[1],'base64');
        assert.ok(buffer.length>1000,'PNG vacío o incompleto.');
        assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
        const file=shot.id+'.png';fs.writeFileSync(path.join(OUT,file),buffer);

        const telemetry=await page.evaluate(()=>{
          const api=window.__ELSN_TEST__,out={};
          for(const [key,method] of Object.entries({
            diagnostics:api.diagnostics,structures:api.habitableStructureAudit,
            huts:api.settlementGrounding,camps:api.settlementCampGrounding,garrisons:api.garrisonGrounding
          })){
            try{out[key]=typeof method==='function'?method():null;}
            catch(error){out[key+'_error']=String(error.stack||error);}
          }
          return out;
        });
        manifest.captures.push({
          id:shot.id,file,camera:prepared.camera,canvas:prepared.canvas,
          time:shot.time??37,tide:shot.tide??'natural',bytes:buffer.length,
          durationMs:Date.now()-started,telemetry
        });
        console.log('[scene-capture] '+manifest.captures.length+'/'+shots.length+' '+shot.id);
      } catch(error) {
        manifest.failures.push({id:shot.id,error:String(error.stack||error)});
        console.error('[scene-capture] failed '+shot.id+': '+error.message);
      }
    }
    // Create a machine-readable index for quick triage, including every structure and
    // the capture IDs that were actually saved even when some shots failed.
    manifest.captureIndex=manifest.captures.map(({id,file,camera,time,tide,bytes})=>({id,file,camera,time,tide,bytes}));
    assert.ok(manifest.captures.length>0,'No se pudo guardar ninguna imagen.');
  } finally {
    manifest.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    if(browser)await browser.close();
  }
  if(manifest.failures.length) {
    console.error('CUSTOM SCENE CAPTURE PARTIAL: '+manifest.captures.length+'/'+shots.length+' PNGs; '+manifest.failures.length+' fallos.');
    process.exitCode=2;
  } else console.log('CUSTOM SCENE CAPTURE OK: '+manifest.captures.length+' PNGs.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
