// Inline-injected by build_site.py in the game runtime scope. Temporary diagnostics only.
(()=>{
 if(!debugRenderClarityMode||isPerformanceMode)return;
 const dprs=[1.8,2.1,2.5,3.0,3.75],fmt=v=>Number(v).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
 const maxSamples=Math.max(1,Number(engine.getCaps&&engine.getCaps().maxMSAASamples)||1);
 const state=debugRenderClarityState,make=(tag,attrs,text)=>{const n=document.createElement(tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
 const style=make('style',{id:'elsn-clarity-style'});
 style.textContent='#elsn-clarity-launch{position:fixed;right:12px;bottom:12px;z-index:2147483000;background:#101d2c;color:#fff;border:1px solid #7895af;border-radius:10px;padding:10px 13px;font:600 13px system-ui}'+
 '#elsn-clarity-panel{position:fixed;right:10px;bottom:56px;z-index:2147483001;width:min(92vw,380px);max-height:78vh;overflow:auto;box-sizing:border-box;background:rgba(9,18,29,.97);color:#eef4fa;border:1px solid #52677d;border-radius:14px;padding:13px;font:12px/1.4 system-ui;display:none;box-shadow:0 12px 36px #000a}'+
 '#elsn-clarity-panel *{box-sizing:border-box}#elsn-clarity-panel header,#elsn-clarity-panel .actions{display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap}'+
 '#elsn-clarity-panel .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}#elsn-clarity-panel label{display:block;color:#bdcbd9}'+
 '#elsn-clarity-panel select,#elsn-clarity-panel button{width:100%;margin-top:3px;padding:7px;border:1px solid #61768b;border-radius:8px;background:#192b3d;color:#f3f7fb;font:inherit}'+
 '#elsn-clarity-panel button{width:auto;cursor:pointer}#elsn-clarity-panel button:disabled,#elsn-clarity-panel select:disabled{opacity:.5}'+
 '#elsn-clarity-panel .muted{color:#9fb0c2;font-size:11px}#elsn-clarity-panel .status{min-height:18px;margin:7px 0}'+
 '#elsn-clarity-panel .progress{height:7px;background:#26394d;border-radius:20px;overflow:hidden}#elsn-clarity-panel .progress span{display:block;width:0;height:100%;background:#74b3e8}'+
 '#elsn-clarity-panel textarea{width:100%;min-height:125px;background:#08121d;color:#dce8f3;border:1px solid #445a70;border-radius:8px;padding:8px;font:10px/1.35 monospace}'+
 '#elsn-clarity-panel .captures{max-height:120px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:5px}#elsn-clarity-panel a{color:#9cd2ff;font-size:10px;overflow-wrap:anywhere}';
 document.head.appendChild(style);
 const launcher=make('button',{id:'elsn-clarity-launch',type:'button'},'Nitidez · DEBUG');
 const panel=make('section',{id:'elsn-clarity-panel'});
 panel.innerHTML='<header><strong>Laboratorio de nitidez · Calidad</strong><button id="cl-close" type="button">Cerrar</button></header>'+
 '<p class="muted">Temporal y sin persistencia. No modifica valores por defecto ni el perfil Rendimiento.</p>'+
 '<div class="grid"><label>Render DPR<select id="cl-dpr"></select></label><label>FSR 1<select id="cl-fsr"><option value="off">Apagado · predeterminado</option><option value="on">EASU + RCAS · experimental</option></select></label>'+
 '<label>MSAA<select id="cl-msaa"></select></label><label>Sharpen<select id="cl-sharp"><option value="on">Activado</option><option value="off">Desactivado</option></select></label></div>'+
 '<div class="muted" id="cl-current"></div><div class="actions"><button id="cl-apply" type="button">Aplicar selección</button><button id="cl-run" type="button">Prueba de nitidez · 40 perfiles</button><button id="cl-cancel" type="button" disabled>Detener</button></div>'+
 '<p class="muted">40 combinaciones · 15 s por perfil + calentamiento (≈10 min). Cámara y simulación bloqueadas; el teléfono puede calentarse.</p>'+
 '<div class="status" id="cl-status">Valores por defecto conservados; FSR apagado.</div><div class="progress"><span id="cl-progress"></span></div><div class="status" id="cl-progress-label">Sin prueba ejecutada.</div>'+
 '<div class="muted">FPS medio y tiempos P95/P99 en ms. Captura: recorte central PNG ampliado 2×.</div><div class="actions"><button id="cl-copy" type="button">Copiar informe</button></div>'+
 '<textarea id="cl-report" readonly placeholder="El informe aparecerá aquí."></textarea><div class="muted">Capturas PNG · descarga cada enlace.</div><div class="captures" id="cl-captures"></div>';
 document.body.appendChild(launcher);document.body.appendChild(panel);
 const el=id=>panel.querySelector('#'+id),dpr=el('cl-dpr'),fsr=el('cl-fsr'),msaa=el('cl-msaa'),sharp=el('cl-sharp');
 const status=el('cl-status'),report=el('cl-report'),bar=el('cl-progress'),progressLabel=el('cl-progress-label'),captures=el('cl-captures');
 const runButton=el('cl-run'),cancelButton=el('cl-cancel'),applyButton=el('cl-apply');
 const add=(select,value,label,disabled=false)=>{const o=make('option',{value:String(value)},label);o.disabled=disabled;select.appendChild(o);};
 const exact=dprs.find(x=>Math.abs(x-state.renderDpr)<.006);if(!exact)add(dpr,state.renderDpr,'Actual · '+fmt(state.renderDpr));
 dprs.forEach(x=>add(dpr,x,fmt(x)+'×'));dpr.value=String(exact||state.renderDpr);
 if(state.msaa!==2&&state.msaa!==4)add(msaa,state.msaa,'Actual · '+state.msaa+'×');
 add(msaa,2,'2×'+(maxSamples<2?' · no disponible':''),maxSamples<2);add(msaa,4,'4×'+(maxSamples<4?' · no disponible':''),maxSamples<4);
 msaa.value=String(state.msaa);fsr.value='off';sharp.value=state.sharpen?'on':'off';sharp.disabled=!(renderPipeline&&renderPipeline.sharpen);
 const resolution=()=>{try{return window.__ELSN_RENDER_RESOLUTION?window.__ELSN_RENDER_RESOLUTION():null;}catch(_){return null;}};
 const updateCurrent=()=>{const r=resolution();if(r)el('cl-current').textContent='DPR físico '+fmt(r.physicalDevicePixelRatio||r.devicePixelRatio)+' · renderDpr '+fmt(r.renderDpr)+' · buffer '+r.renderWidth+'×'+r.renderHeight+' · '+r.pixelCoveragePercent+'% de píxeles físicos';};
 const selection=()=>({renderDpr:Number(dpr.value),fsr1:fsr.value==='on',msaa:Number(msaa.value),sharpen:sharp.value==='on'});
 const applySettings=async config=>{
  if(!document.body.classList.contains('game-running'))throw new Error('Inicia una partida antes de cambiar los parámetros.');
  state.renderDpr=Number(config.renderDpr);state.msaa=Math.max(1,Number(config.msaa)||1);state.sharpen=!!config.sharpen;
  qualityDprCurrent=state.renderDpr;window.__ELSN_RENDER_DPR_CURRENT__=state.renderDpr;engine.setHardwareScalingLevel(1/state.renderDpr);engine.resize();
  const caps=Math.max(1,Number(engine.getCaps&&engine.getCaps().maxMSAASamples)||1),effectiveMsaa=Math.max(1,Math.min(state.msaa,caps));
  if(renderPipeline)renderPipeline.samples=effectiveMsaa;if(fsr1SourcePostProcess)fsr1SourcePostProcess.samples=effectiveMsaa;
  if(config.fsr1&&!fsr1Active){debugRenderClarityBaseline={imageProcessingEnabled:renderPipeline?renderPipeline.imageProcessingEnabled:null,fxaaEnabled:renderPipeline?renderPipeline.fxaaEnabled:null};if(!initializeFsr1Debug())throw new Error(window.__ELSN_FSR1&&window.__ELSN_FSR1.reason||'No se pudo inicializar FSR 1.');}
  else if(!config.fsr1&&fsr1Active)disposeFsr1Debug();
  state.fsr1=!!config.fsr1&&!!fsr1Active;
  if(renderPipeline){renderPipeline.sharpenEnabled=state.fsr1?false:state.sharpen;if(renderPipeline.sharpen&&state.sharpen&&!state.fsr1){renderPipeline.sharpen.edgeAmount=.34;renderPipeline.sharpen.colorAmount=.92;}}
  updateCurrent();return {effectiveMsaa};
 };
 const applyManual=async()=>{applyButton.disabled=true;try{const result=await applySettings(selection());status.textContent='Aplicado · DPR '+fmt(state.renderDpr)+' · MSAA '+result.effectiveMsaa+'× · FSR '+(state.fsr1?'EASU + RCAS':'apagado')+' · sharpen '+(state.sharpen?'on':'off');}catch(e){fsr.value='off';state.fsr1=false;status.textContent='No se pudo aplicar: '+String(e&&e.message||e);}finally{applyButton.disabled=false;updateCurrent();}};
 applyButton.addEventListener('click',applyManual);launcher.addEventListener('click',()=>{panel.style.display=panel.style.display==='block'?'none':'block';updateCurrent();});el('cl-close').addEventListener('click',()=>{panel.style.display='none';});
 let cancelled=false,running=false;
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const percentile=(values,p)=>{if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);return Number(sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1))].toFixed(3));};
 const waitFrames=(count,timeout=15000)=>new Promise(resolve=>{let n=0,done=false,timer=0,observer=null;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);if(observer)scene.onAfterRenderObservable.remove(observer);resolve(ok);};observer=scene.onAfterRenderObservable.add(()=>{if(++n>=count)finish(true);});timer=setTimeout(()=>finish(false),timeout);});
 const capture2x=()=>new Promise((resolve,reject)=>{
  const source=engine.getRenderingCanvas();if(!source||!source.width||!source.height){reject(new Error('Canvas de renderizado no disponible.'));return;}
  const cw=Math.max(1,Math.floor(source.width*.5)),ch=Math.max(1,Math.floor(source.height*.5)),sx=Math.floor((source.width-cw)*.5),sy=Math.floor((source.height-ch)*.5);
  const out=document.createElement('canvas');out.width=cw*2;out.height=ch*2;const ctx=out.getContext('2d');if(!ctx){reject(new Error('No se pudo crear el canvas PNG.'));return;}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  try{ctx.drawImage(source,sx,sy,cw,ch,0,0,out.width,out.height);out.toBlob(blob=>{out.width=1;out.height=1;blob?resolve(blob):reject(new Error('No se pudo exportar PNG.'));},'image/png');}catch(e){reject(e);}
 });
 const measure=async duration=>{
  const values=[];let last=null;const observer=scene.onAfterRenderObservable.add(()=>{const now=performance.now();if(last!==null){const dt=now-last;if(Number.isFinite(dt)&&dt>0&&dt<1000)values.push(dt);}last=now;});
  const start=performance.now(),deadline=start+duration;while(!cancelled&&performance.now()<deadline)await sleep(100);scene.onAfterRenderObservable.remove(observer);
  const mean=values.length?values.reduce((sum,x)=>sum+x,0)/values.length:null;
  return {sampleFrames:values.length,elapsedMs:Number((performance.now()-start).toFixed(1)),averageFps:mean?Number((1000/mean).toFixed(2)):null,meanFrameMs:mean?Number(mean.toFixed(3)):null,p95FrameMs:percentile(values,.95),p99FrameMs:percentile(values,.99)};
 };
 const label=c=>'DPR '+fmt(c.renderDpr)+' · FSR '+(c.fsr1?'EASU+RCAS':'off')+' · MSAA '+c.msaa+'× · sharpen '+(c.sharpen?'on':'off');
 const makeReport=(started,items,finalStatus)=>{
  const r=resolution(),head=['EL SIN NOMBRE · PRUEBA DE NITIDEZ · '+(document.querySelector('meta[name="el-sin-nombre-build"]')?.content||'build desconocido'),'Fecha: '+started,'Renderer: '+String(graphicsRenderer||'no disponible'),'DPR físico: '+(r&&r.physicalDevicePixelRatio||window.devicePixelRatio||'desconocido'),'Viewport CSS: '+(r?r.canvasCssWidth+'×'+r.canvasCssHeight:'desconocido'),'Pixel coverage: '+(r?r.pixelCoveragePercent+'%':'desconocido'),'Método: 60 frames de calentamiento; 15 s; scene.onAfterRenderObservable; recorte central PNG 2×.','Cámara y simulación bloqueadas durante la matriz; sin persistencia.','Estado: '+finalStatus,'','DPR | FSR | MSAA pedido/aplicado | Sharpen | frames | FPS medio | P95 ms | P99 ms | captura/estado'];
  return head.concat(items.map(x=>[fmt(x.config.renderDpr),x.config.fsr1?'EASU+RCAS':'off',x.config.msaa+'×/'+(x.effectiveMsaa??'—')+'×',x.config.sharpen?'on':'off',x.sampleFrames??'—',x.averageFps??'—',x.p95FrameMs??'—',x.p99FrameMs??'—',x.captureName||x.error||x.status||'—'].join(' | '))).join('\n');
 };
 const runMatrix=async()=>{
  if(running)return;if(!document.body.classList.contains('game-running')){status.textContent='Inicia una partida para fijar escena y encuadre.';return;}
  if(!window.confirm('40 perfiles · 15 s por perfil (≈10 minutos más calentamientos). El móvil puede calentarse. ¿Iniciar?'))return;
  running=true;cancelled=false;runButton.disabled=true;applyButton.disabled=true;cancelButton.disabled=false;for(const s of [dpr,fsr,msaa,sharp])s.disabled=true;captures.innerHTML='';
  const started=new Date().toISOString(),items=[],original={renderDpr:state.renderDpr,fsr1:state.fsr1,msaa:state.msaa,sharpen:state.sharpen};
  const animations=scene.animationsEnabled,canvas=engine.getRenderingCanvas(),pointer=canvas?canvas.style.pointerEvents:'';
  const pos=camera.position.clone(),rot=camera.rotation.clone(),quat=camera.rotationQuaternion?camera.rotationQuaternion.clone():null;
  const lock=scene.onBeforeRenderObservable.add(()=>{camera.position.copyFrom(pos);if(quat)camera.rotationQuaternion.copyFrom(quat);else camera.rotation.copyFrom(rot);camera.computeWorldMatrix(true);});
  const configs=[];dprs.forEach(dp=>[false,true].forEach(f=>[2,4].forEach(m=>[false,true].forEach(sh=>configs.push({renderDpr:dp,fsr1:f,msaa:m,sharpen:sh})))));
  window.__ELSN_RENDER_CLARITY_TEST_ACTIVE__=true;scene.animationsEnabled=false;if(canvas)canvas.style.pointerEvents='none';let finalStatus='completed';
  try{
   for(let i=0;i<configs.length;i++){
    if(cancelled){finalStatus='cancelled';break;}
    const config=configs[i],item={config,status:'running'};bar.style.width=(i/configs.length*100).toFixed(1)+'%';progressLabel.textContent=(i+1)+' / 40 · '+label(config);
    try{
     const applied=await applySettings(config);item.effectiveMsaa=applied.effectiveMsaa;if(!await waitFrames(60))throw new Error('No se estabilizaron 60 frames de calentamiento.');
     const blob=await capture2x(),name='nitidez-'+String(i+1).padStart(2,'0')+'-dpr'+fmt(config.renderDpr).replace('.','_')+'-fsr'+(config.fsr1?'on':'off')+'-msaa'+config.msaa+'-sharp'+(config.sharpen?'on':'off')+'.png';
     item.captureName=name;const url=URL.createObjectURL(blob),link=make('a',{href:url,download:name},name);captures.appendChild(link);
     Object.assign(item,await measure(15000),{status:cancelled?'partial':'complete',effectiveSharpen:state.fsr1?'RCAS integrado':state.sharpen?'nativo':'off'});
    }catch(e){item.status='error';item.error=String(e&&e.message||e);}
    items.push(item);bar.style.width=(items.length/configs.length*100).toFixed(1)+'%';report.value=makeReport(started,items,cancelled?'cancelled / partial':'running');
    progressLabel.textContent=items.length+' / 40 perfiles completados'+(cancelled?' · deteniendo…':'');if(cancelled){finalStatus='cancelled';break;}
   }
  }finally{
   scene.onBeforeRenderObservable.remove(lock);camera.position.copyFrom(pos);camera.rotation.copyFrom(rot);if(quat)camera.rotationQuaternion.copyFrom(quat);
   scene.animationsEnabled=animations;window.__ELSN_RENDER_CLARITY_TEST_ACTIVE__=false;if(canvas)canvas.style.pointerEvents=pointer;
   try{await applySettings(original);}catch(e){status.textContent='Aviso al restaurar: '+String(e&&e.message||e);}
   for(const s of [dpr,fsr,msaa,sharp])s.disabled=false;dpr.value=String(state.renderDpr);fsr.value=state.fsr1?'on':'off';msaa.value=String(state.msaa);sharp.value=state.sharpen?'on':'off';
   running=false;runButton.disabled=false;applyButton.disabled=false;cancelButton.disabled=true;progressLabel.textContent=items.length+' / 40 · '+finalStatus;
   report.value=makeReport(started,items,finalStatus);status.textContent='Matriz '+finalStatus+'. Configuración inicial restaurada.';window.__ELSN_RENDER_CLARITY_REPORT__=report.value;
  }
 };
 runButton.addEventListener('click',runMatrix);cancelButton.addEventListener('click',()=>{cancelled=true;cancelButton.disabled=true;progressLabel.textContent+=' · esperando fin del perfil actual';});
 el('cl-copy').addEventListener('click',async()=>{const value=report.value||'Todavía no hay informe.';try{await navigator.clipboard.writeText(value);status.textContent='Informe copiado.';}catch(_){report.focus();report.select();try{document.execCommand('copy');status.textContent='Informe seleccionado para copiar.';}catch(__){status.textContent='Selecciona y copia el informe.';}}});
 updateCurrent();
})();
