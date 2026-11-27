(function installQualityRenderLab(root){
 'use strict';
 const PRESETS=[1.8,2.1,2.5,3.0,3.75];
 const BENCHMARK_MS=15000;
 const CROP_ZOOM=2;
 function install(ctx){
  if(!ctx||!ctx.enabled||typeof document==='undefined'||document.getElementById('elsnQualityLab'))return;
  const panel=document.createElement('section');
  panel.id='elsnQualityLab';
  panel.style.cssText='position:fixed;z-index:99999;top:8px;left:8px;pointer-events:none;width:auto;max-height:none;overflow:visible;background:transparent;color:#f3f5f2;border:0;border-radius:0;padding:0;font:12px/1.4 system-ui;box-shadow:none';
  panel.innerHTML='<button type="button" data-toggle aria-expanded="false" aria-controls="elsnQualityLabContent" style="pointer-events:auto;background:rgba(10,19,24,.92);color:#f3f5f2;border:1px solid #8ba5a0;border-radius:7px;padding:5px 9px;font:700 11px/1.2 system-ui;box-shadow:0 3px 12px #0008">LAB</button><div id="elsnQualityLabContent" data-content hidden style="pointer-events:none;margin-top:6px;width:min(330px,calc(100vw - 16px));max-height:80dvh;overflow:auto;background:rgba(10,19,24,.96);color:#f3f5f2;border:1px solid #8ba5a0;border-radius:10px;padding:10px;font:12px/1.4 system-ui;box-shadow:0 6px 28px #0008"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>LABORATORIO DE RENDER · DEBUG</strong><button type="button" data-close aria-label="Plegar laboratorio" style="pointer-events:auto;background:#344b50;color:white;border:0;border-radius:5px;padding:4px 7px">×</button></div><div style="margin:7px 0">DPR renderizado <select data-dpr></select></div><div style="margin:7px 0">FSR 1 · EASU + RCAS <select data-fsr><option value="0">Apagado</option><option value="1">Activado (recarga)</option></select></div><div style="margin:7px 0">MSAA <select data-msaa><option value="2">2×</option><option value="4">4×</option></select></div><div style="margin:7px 0">Nitidez RCAS <select data-sharpen><option value="1">Activada</option><option value="0">Desactivada</option></select></div><label style="display:block;margin:8px 0"><input type="checkbox" data-adaptive> Escalado adaptativo opcional (P95 &lt;14 ms sube; &gt;18 ms baja; mínimo 1,8)</label><button type="button" data-run style="width:100%;padding:8px;background:#d2dfd6;color:#132126;border:0;border-radius:6px;font-weight:700">Prueba de nitidez · 15 s</button><pre data-status style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto"></pre><button type="button" data-copy disabled style="padding:6px;background:#344b50;color:white;border:0;border-radius:5px">Copiar informe</button> <a data-image hidden style="color:#bcd9f0">PNG 2× (recorte central)</a><div style="opacity:.7;margin-top:6px">No se guardan preferencias. Cambiar FSR recarga la escena; conserva el punto de inicio y el encuadre inicial.</div></div>';
  document.body.appendChild(panel);
  // The panel stays folded by default; the small launcher is the only visible overlay.
  // The wrapper and content surface never intercept the game. Only real controls do.
  const $=selector=>panel.querySelector(selector);
  const content=$('[data-content]'),toggle=$('[data-toggle]');
  const setExpanded=expanded=>{content.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'LAB · PLEGAR':'LAB';};
  toggle.addEventListener('click',()=>setExpanded(content.hidden));
  $('[data-close]').addEventListener('click',()=>setExpanded(false));
  panel.querySelectorAll('button,select,input,a').forEach(control=>{control.style.pointerEvents='auto';});
  const dpr=$('[data-dpr]'),fsr=$('[data-fsr]'),msaa=$('[data-msaa]'),sharp=$('[data-sharpen]'),adaptive=$('[data-adaptive]'),status=$('[data-status]'),copy=$('[data-copy]'),imageLink=$('[data-image]'),run=$('[data-run]');
  for(const value of PRESETS){const option=document.createElement('option');option.value=String(value);option.textContent=value.toFixed(2);dpr.appendChild(option);}
  dpr.value=String(PRESETS.reduce((best,value)=>Math.abs(value-ctx.getDpr())<Math.abs(best-ctx.getDpr())?value:best,PRESETS[0]));
  fsr.value=ctx.getFsr()?'1':'0';msaa.value=String(ctx.getMsaa()>=4?4:2);sharp.value=ctx.getSharpen()?'1':'0';adaptive.checked=ctx.getAdaptive();
  dpr.addEventListener('change',()=>{const actual=ctx.setDpr(Number(dpr.value));const url=new URL(location.href);url.searchParams.set('renderDpr',String(actual));history.replaceState(null,'',url.toString());status.textContent='DPR aplicado: '+actual.toFixed(2)+'.';});
  fsr.addEventListener('change',()=>{const next=new URL(location.href);next.searchParams.set('debug','1');if(fsr.value==='1')next.searchParams.set('fsr1','1');else next.searchParams.delete('fsr1');location.assign(next.toString());});
  msaa.addEventListener('change',()=>{const actual=ctx.setMsaa(Number(msaa.value));const url=new URL(location.href);url.searchParams.set('msaa',String(msaa.value));history.replaceState(null,'',url.toString());status.textContent='MSAA aplicado: '+actual+'× (límite real del dispositivo).';});
  sharp.addEventListener('change',()=>{ctx.setSharpen(sharp.value==='1');const url=new URL(location.href);url.searchParams.set('sharpen',sharp.value);history.replaceState(null,'',url.toString());status.textContent='Nitidez RCAS: '+(sharp.value==='1'?'activada':'desactivada')+'. Solo afecta cuando FSR1 está activo.';});
  adaptive.addEventListener('change',()=>{ctx.setAdaptive(adaptive.checked);if(adaptive.checked)startAdaptive();});
  panel.addEventListener('elsn:quality-lab-dispose',()=>ctx.setAdaptive(false),{once:true});
  let adaptiveRunning=false,adaptiveFrames=[],adaptiveLast=0,adaptiveLastChange=0;
  function startAdaptive(){
   if(adaptiveRunning||!ctx.getAdaptive())return;
   adaptiveRunning=true;
   const tick=now=>{
    if(!ctx.getAdaptive()){adaptiveRunning=false;adaptiveFrames=[];return;}
    if(adaptiveLast)adaptiveFrames.push(now-adaptiveLast);
    if(adaptiveFrames.length>120)adaptiveFrames.shift();
    adaptiveLast=now;
    if(adaptiveFrames.length>=60&&now-adaptiveLastChange>=2000){
     const sorted=adaptiveFrames.slice().sort((a,b)=>a-b),p95=sorted[Math.floor((sorted.length-1)*.95)],current=ctx.getDpr();
     let target=current;
     if(p95<14){const next=PRESETS.find(value=>value>current+.001&&value<=ctx.deviceDpr);if(next)target=next;}
     else if(p95>18){const lower=PRESETS.filter(value=>value<current-.001&&value>=1.8).pop();if(lower)target=lower;}
     if(target!==current){ctx.setDpr(target);dpr.value=String(PRESETS.reduce((best,value)=>Math.abs(value-target)<Math.abs(best-target)?value:best,PRESETS[0]));adaptiveLastChange=now;status.textContent='Adaptativo: P95 '+p95.toFixed(2)+' ms · DPR '+current.toFixed(2)+' → '+target.toFixed(2);}
     adaptiveFrames=[];
    }
    requestAnimationFrame(tick);
   };
   requestAnimationFrame(tick);
  }
  let lastReport=null,lastImageUrl=null;
  function percentile(values,p){const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null;}
  function cropPng(dataUrl){
   return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
     try{
      const output=document.createElement('canvas');
      const sourceX=image.width*.25,sourceY=image.height*.25,sourceWidth=image.width*.5,sourceHeight=image.height*.5;
      output.width=Math.round(sourceWidth*CROP_ZOOM);output.height=Math.round(sourceHeight*CROP_ZOOM);
      output.getContext('2d',{alpha:false}).drawImage(image,sourceX,sourceY,sourceWidth,sourceHeight,0,0,output.width,output.height);
      output.toBlob(blob=>blob?resolve(URL.createObjectURL(blob)):reject(new Error('No se pudo generar el PNG.')),'image/png');
     }catch(error){reject(error);}
    };
    image.onerror=()=>reject(new Error('No se pudo decodificar la captura.'));
    image.src=dataUrl;
   });
  }
  run.addEventListener('click',async()=>{
   run.disabled=true;copy.disabled=true;imageLink.hidden=true;
   status.textContent='Midiendo 15 segundos… Mantén la misma escena y encuadre; no muevas cámara ni personaje.';
   const frameTimes=[],started=performance.now();let previous=0;
   await new Promise(resolve=>{
    const sample=now=>{if(previous)frameTimes.push(now-previous);previous=now;if(now-started<BENCHMARK_MS)requestAnimationFrame(sample);else resolve();};
    requestAnimationFrame(sample);
   });
   const elapsed=performance.now()-started,meanFps=frameTimes.length*1000/Math.max(1,elapsed),p95=percentile(frameTimes,.95),p99=percentile(frameTimes,.99);
   let screenshot='no disponible';
   try{
    const raw=ctx.canvas.toDataURL('image/png');
    if(lastImageUrl)URL.revokeObjectURL(lastImageUrl);
    lastImageUrl=await cropPng(raw);screenshot='captura-2x.png';imageLink.href=lastImageUrl;imageLink.download=screenshot;imageLink.hidden=false;
   }catch(error){screenshot='no disponible: '+String(error&&error.message||error);}
   lastReport={schema:'elsn-quality-render-benchmark-v1',durationMs:Math.round(elapsed),frames:frameTimes.length,meanFps:Number(meanFps.toFixed(2)),p95FrameMs:p95===null?null:Number(p95.toFixed(2)),p99FrameMs:p99===null?null:Number(p99.toFixed(2)),p95Fps:p95?Number((1000/p95).toFixed(2)):null,p99Fps:p99?Number((1000/p99).toFixed(2)):null,configuration:{renderDpr:ctx.getDpr(),fsr1:ctx.getFsr(),msaa:ctx.getMsaa(),rcasSharpen:ctx.getSharpen(),adaptive:ctx.getAdaptive()},resolution:ctx.getResolution(),gpu:ctx.gpuInfo(),screenshot};
   status.textContent=JSON.stringify(lastReport,null,2);copy.disabled=false;run.disabled=false;
  });
  copy.addEventListener('click',async()=>{
   if(!lastReport)return;
   const report=JSON.stringify(lastReport,null,2);
   try{await navigator.clipboard.writeText(report);status.textContent='Informe copiado.\n'+report;}
   catch(_){const field=document.createElement('textarea');field.value=report;panel.appendChild(field);field.select();document.execCommand('copy');field.remove();status.textContent='Informe copiado.\n'+report;}
  });
  root.__ELSN_QUALITY_LAB={version:1,benchmarkMs:BENCHMARK_MS,run:()=>run.click(),getReport:()=>lastReport};
 }
 root.__ELSN_QUALITY_LAB_INSTALL=install;
 if(root.__ELSN_QUALITY_LAB_PENDING_CONTEXT)install(root.__ELSN_QUALITY_LAB_PENDING_CONTEXT);
})(window);
