'use strict';
const fs=require('node:fs');
const path=require('node:path');
const { chromium }=require('playwright');

const baselineUrl=process.env.BASELINE_URL||'https://bonillamarquezpablo-lab.github.io/Minimo-android/guest/?v=0.6.271&debug=1';
const previewUrl=process.env.PREVIEW_URL||'http://127.0.0.1:4173/guest/?debug=1';
const outputDir=process.env.OUTPUT_DIR||'artifacts/water-reference';
fs.mkdirSync(outputDir,{recursive:true});

async function capture(browser,url,label){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage();
 const consoleErrors=[];
 page.on('pageerror',error=>consoleErrors.push(String(error)));
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});
 await page.locator('#audioGateStart').waitFor({state:'visible',timeout:120000});
 await page.locator('#audioGateStart').click();
 await page.locator('#chooseQuality').waitFor({state:'visible',timeout:30000});
 await page.locator('#chooseQuality').click();
 await page.locator('#playerNameInput').waitFor({state:'visible',timeout:30000});
 await page.locator('#playerNameInput').fill('Water Audit');
 await page.locator('#continueWithName').click();
 // The campaign chooser is revealed only after the first rendered frame and optional
 // startup warm-up. Trigger its real registered button handler once the world API exists;
 // this avoids treating the delayed visual overlay as a scene-readiness signal in headless CI.
 await page.waitForFunction(()=>typeof window.getGameHealthDebug==='function',undefined,{timeout:360000});
 await page.evaluate(()=>{
  const button=document.getElementById('newGameChoice');
  if(!button)throw new Error('Campaign start control is missing from the loaded page.');
  button.click();
 });
 await page.waitForFunction(()=>window.getGameHealthDebug?.().gameStarted===true,undefined,{timeout:120000});
 await page.locator('#waterShoreDebugPanel').waitFor({state:'visible',timeout:30000});
 await page.getByRole('button',{name:'MAREA ALTA'}).click();
 await page.waitForTimeout(10000);
 if(typeof window.__elSinNombreWaterDebugRefresh==='function')await page.evaluate(()=>window.__elSinNombreWaterDebugRefresh());
 const report=await page.evaluate(()=>{
  const health=window.getGameHealthDebug?.()||null;
  return {
   url:location.href,build:document.querySelector('meta[name="el-sin-nombre-build"]')?.content||null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
   debugPanel:document.querySelector('#waterShoreDebugPanel')?.innerText||null,
   waterDebug:window.__elSinNombreWaterDebug||null,
   snapshot:window.__elSinNombreWaterDebugSnapshot?.()||null,
   health,canvas:{width:document.querySelector('#renderCanvas')?.width||null,height:document.querySelector('#renderCanvas')?.height||null}
  };
 });
 report.label=label;report.consoleErrors=consoleErrors;
 const suffix=label.toLowerCase().replace(/[^a-z0-9]+/g,'-');
 fs.writeFileSync(path.join(outputDir,suffix+'.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:path.join(outputDir,suffix+'.png'),animations:'disabled'});
 await context.close();
 return {label,ok:report.health?.gameStarted===true,build:report.build||'baseline',fps:report.health?.runtime?.fps??null,frameTimingMs:report.health?.runtime?.frameTimingMs??null,errors:consoleErrors.length,screenshot:suffix+'.png'};
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const baseline=await capture(browser,baselineUrl,'baseline-0.6.271');
  const candidate=await capture(browser,previewUrl,'stage0-diagnostics');
  fs.writeFileSync(path.join(outputDir,'summary.json'),JSON.stringify({viewport:{width:1440,height:900},deviceScaleFactor:1,profile:'CALIDAD',forcedTide:'MAREA ALTA',waitAfterStartMs:10000,baseline,candidate,deviceClass:'Chromium CI / SwiftShader; not Galaxy S26 Ultra hardware'},null,2));
  if(!baseline.ok||!candidate.ok)throw new Error('Playwright did not reach the playable scene for both baseline and candidate.');
  console.log(JSON.stringify({baseline,candidate},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
