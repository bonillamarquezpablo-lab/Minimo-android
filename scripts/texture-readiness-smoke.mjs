import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL=process.env.CAPTURE_TEST_URL||'http://127.0.0.1:4176/';
const OUT=path.resolve('artifacts/texture-readiness-smoke');
const TIMEOUT_MS=Math.max(1000,Math.min(60000,Number(process.env.CAPTURE_TEXTURE_TIMEOUT_MS)||15000));
const rawPlan=process.env.CAPTURE_PLAN_JSON||fs.readFileSync('scripts/scene-capture-plan.json','utf8');
const plan=JSON.parse(rawPlan);
const manifest={schema:1,startedAt:new Date().toISOString(),finishedAt:null,build:null,timeoutMs:TIMEOUT_MS,renderer:'Chromium headless + ANGLE SwiftShader',camera:null,readiness:null,textureDiagnostics:null,networkEvents:[],consoleErrors:[],pageErrors:[],screenshot:null,verdict:'not-run',failure:null};
function writeManifest(){fs.mkdirSync(OUT,{recursive:true});const target=path.join(OUT,'manifest.json'),temporary=target+'.tmp';fs.writeFileSync(temporary,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(temporary,target);}
function pickFirstShot(input){if(!Array.isArray(input)||!input.length)throw new Error('El plan no contiene cámaras.');const original=input[0],shot={...original};let base={...(original.camera||original)};if(Array.isArray(original.views)&&original.views.length)base={...base,...original.views[0]};if(original.orbit){const orbit=original.orbit,target={x:Number(orbit.targetX??base.targetX),y:Number(orbit.targetY??base.targetY),z:Number(orbit.targetZ??base.targetZ)},radius=Number(orbit.radius)||Math.hypot(base.x,base.z),angle=(Number(orbit.startDegrees)||0)*Math.PI/180;shot.camera={x:target.x+Math.sin(angle)*radius,y:Number(orbit.elevation??base.y),z:target.z+Math.cos(angle)*radius,targetX:target.x,targetY:target.y,targetZ:target.z};}else shot.camera=base;delete shot.orbit;delete shot.views;return shot;}
const shot=pickFirstShot(plan);
async function main(){fs.mkdirSync(OUT,{recursive:true});let browser=null,page=null;try{
 browser=await chromium.launch({headless:true,timeout:60000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--enable-webgl2','--force-color-profile=srgb']});
 const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',error=>manifest.pageErrors.push(String(error?.stack||error)));page.on('console',message=>{if(message.type()==='error')manifest.consoleErrors.push(message.text());});
 page.on('requestfailed',request=>manifest.networkEvents.push({kind:'request-failed',url:request.url(),method:request.method(),error:request.failure()?.errorText||'unknown'}));
 page.on('response',response=>{if(response.status()>=400)manifest.networkEvents.push({kind:'http-error',url:response.url(),status:response.status(),statusText:response.statusText()});});
 await page.addInitScript(()=>{if(new URLSearchParams(location.search).get('test')!=='1')return;let state=20261110;Math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};});
 const started=Date.now();await page.goto(BASE_URL+'?test=1&coastref=1',{waitUntil:'domcontentloaded',timeout:90000});
 const audioGate=page.locator('#audioGateStart');if(await audioGate.isVisible().catch(()=>false))await audioGate.click();
 await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});await page.locator('#chooseQuality').click();
 await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});await page.locator('#continueUnnamed').click();
 await page.waitForFunction(()=>window.__ELSN_TEST__&&window.__elSinNombreStartupSmoke?.worldReady===true,undefined,{timeout:180000,polling:500});
 await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});await page.locator('#newGameChoice').click();
 await page.waitForFunction(()=>document.body.classList.contains('game-running')&&document.querySelector('#intro')?.getAttribute('aria-hidden')==='true',undefined,{timeout:30000,polling:250});manifest.startupDurationMs=Date.now()-started;
 const prepared=await page.evaluate(shot=>{const api=window.__ELSN_TEST__,base=shot.camera||shot;let camera={...base};if(Number.isInteger(shot.islandIndex)){const island=api.islands[shot.islandIndex];if(!island)throw new Error('No existe la isla '+shot.islandIndex);camera={x:island.x+base.x,y:base.y,z:island.z+base.z,targetX:island.x+base.targetX,targetY:base.targetY,targetZ:island.z+base.targetZ};}api.setCamera(camera);api.setWaterState({time:shot.time??37,tide:shot.tide??'natural'});api.render();return {camera};},shot);
 manifest.camera=prepared.camera;manifest.build=await page.evaluate(()=>window.__ELSN_TEST__?.build||null);
 manifest.readiness=await page.evaluate(timeoutMs=>window.__ELSN_TEST__.prepareCaptureFrame({timeoutMs}),TIMEOUT_MS);
 manifest.textureDiagnostics=manifest.readiness?.textureDiagnostics||await page.evaluate(()=>window.__ELSN_TEST__?.getTextureReadinessForCamera?.()||null);
 if(manifest.textureDiagnostics?.pendingTextures)for(const texture of manifest.textureDiagnostics.pendingTextures)texture.relatedNetworkEvents=manifest.networkEvents.filter(event=>texture.url&&event.url&&event.url.includes(texture.url));
 const data=await page.evaluate(()=>{window.__ELSN_TEST__.render();return window.__ELSN_TEST__.captureCanvas();});const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data||'');
 if(match){const buffer=Buffer.from(match[1],'base64');if(buffer.length>1000&&buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){const file='smoke-first-camera.png';fs.writeFileSync(path.join(OUT,file),buffer);manifest.screenshot={file,bytes:buffer.length};}else manifest.failure='PNG vacío o incompleto.';}else manifest.failure='No se recibió un PNG válido.';
 manifest.verdict=manifest.readiness?.ready===true&&manifest.screenshot&&!manifest.failure?'pass':(manifest.readiness?.texturePending?'texture-pending':'failed');
}catch(error){manifest.failure=String(error?.stack||error);try{if(page){manifest.textureDiagnostics=await page.evaluate(()=>window.__ELSN_TEST__?.getTextureReadinessForCamera?.()||null);if(!manifest.screenshot){const data=await page.evaluate(()=>{const api=window.__ELSN_TEST__;if(!api?.captureCanvas)return null;api.render();return api.captureCanvas();});const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data||'');if(match){const buffer=Buffer.from(match[1],'base64');if(buffer.length>1000){const file='smoke-first-camera.png';fs.writeFileSync(path.join(OUT,file),buffer);manifest.screenshot={file,bytes:buffer.length,capturedAfterFailure:true};}}}}}catch(diagnosticError){manifest.diagnosticFailure=String(diagnosticError?.stack||diagnosticError);}manifest.verdict='failed';
}finally{manifest.finishedAt=new Date().toISOString();writeManifest();if(browser)await browser.close();}
 if(manifest.verdict!=='pass'){console.error('TEXTURE READINESS SMOKE FAILED: '+manifest.verdict+'; PNG='+(manifest.screenshot?.file||'none'));process.exitCode=2;}else console.log('TEXTURE READINESS SMOKE PASSED: '+manifest.camera.x+','+manifest.camera.y+','+manifest.camera.z);
}
main().catch(error=>{manifest.failure=String(error?.stack||error);manifest.verdict='failed';manifest.finishedAt=new Date().toISOString();writeManifest();console.error(error);process.exitCode=1;});
