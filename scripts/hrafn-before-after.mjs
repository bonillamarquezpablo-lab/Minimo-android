#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const beforeUrl=process.env.HRAFN_BEFORE_URL;
const afterUrl=process.env.HRAFN_AFTER_URL;
const out=path.resolve(process.env.HRAFN_COMPARE_OUT||'artifacts/hrafn-before-after');
const phases=[{id:'dawn',hour:6},{id:'noon',hour:12},{id:'dusk',hour:18},{id:'midnight',hour:0}];
if(!beforeUrl||!afterUrl) {
  console.error('Set HRAFN_BEFORE_URL and HRAFN_AFTER_URL to equivalent game builds.');
  process.exit(2);
}
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const manifest={schema:1,createdAt:new Date().toISOString(),method:'same-browser-same-viewport-same-clock-phases',viewport:{width:1280,height:720,deviceScaleFactor:1},beforeUrl,afterUrl,phases:[],warnings:['Visual pixel differences are evidence for human review, not an automatic quality verdict.','The two URLs must point to equivalent scenes and compatible test hooks.']};
async function capture(label,url,phase){
  const page=await browser.newPage({viewport:manifest.viewport,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const target=new URL(url);
  target.searchParams.set('test','1');
  await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>!!window.__ELSN_TEST__&&!!window.__ELSN_ATMOSPHERE_CONTROLS,undefined,{timeout:90000});
  await page.waitForFunction(()=>window.__ELSN_TEST__?.diagnostics?.()?.worldReady!==false,undefined,{timeout:45000}).catch(()=>{});
  await page.evaluate(async hour=>{
    const clock=window.__ELSN_ATMOSPHERE_CONTROLS;
    clock.pause();clock.setTime(hour);
    const api=window.__ELSN_TEST__;
    if(typeof api.render==='function')api.render();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },phase.hour);
  const data=await page.evaluate(()=>window.__ELSN_TEST__.captureCanvas());
  if(typeof data!=='string'||!/^data:image[.]png;base64,/.test(data))throw new Error(label+' '+phase.id+': canvas capture did not return PNG data.');
  const dir=path.join(out,label);fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,phase.id+'.png');
  fs.writeFileSync(file,Buffer.from(data.slice(data.indexOf(',')+1),'base64'));
  const row={label,phase:phase.id,hour:phase.hour,file:path.relative(process.cwd(),file),pageErrors:errors};
  await page.close();return row;
}
try{
  for(const phase of phases){
    const before=await capture('before',beforeUrl,phase);
    const after=await capture('after',afterUrl,phase);
    manifest.phases.push({id:phase.id,hour:phase.hour,before,after});
    fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\\n');
    console.log('[HRAFN_AB_CAPTURE] '+phase.id+' before='+before.file+' after='+after.file);
  }
}finally{await browser.close();}
console.log('[HRAFN_AB_RESULT] '+JSON.stringify({captured:manifest.phases.length,output:out}));
