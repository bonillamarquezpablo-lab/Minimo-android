(() => {
  'use strict';
  const OWNER='bonillamarquezpablo-lab', REPO='Minimo-android', WORKFLOW='coastal-reference.yml';
  const STATUS_BRANCH='inspector-status';
  const API='https://api.github.com/repos/'+OWNER+'/'+REPO;
  const RAW='https://raw.githubusercontent.com/'+OWNER+'/'+REPO+'/'+STATUS_BRANCH;
  const PHASES=[
    {id:'dawn',label:'Amanecer',time:'06:00',short:'Alba'},
    {id:'noon',label:'Mediodía',time:'12:00',short:'Día'},
    {id:'dusk',label:'Atardecer',time:'18:00',short:'Ocaso'},
    {id:'midnight',label:'Noche',time:'00:00',short:'Noche'}
  ];
  const LEVELS={quick:'Rápido',complete:'Completo',deep:'Profundo'};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const niceDate=value=>value?new Date(value).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'}):'—';
  const number=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toLocaleString('es-ES',{maximumFractionDigits:d}):'—';
  const formatElapsed=ms=>{if(!Number.isFinite(ms)||ms<0)return '—';const s=Math.round(ms/1000);if(s<60)return s+' s';const m=Math.floor(s/60),r=s%60;return m+' min '+String(r).padStart(2,'0')+' s';};
  let chosenLevel='deep',activeRun=null,progressData=null,jobsData=null,activePhase='dawn',comparePosition=50,differenceVisible=false,radarData=null,selectedIsland=null,selectedStructure=null;
  let currentToken='',refreshTimer=null,fetchBusy=false,launching=false,latestRuns=[],lastError=null,lastRunsFetchAt=0,lastJobsFetchAt=0,jobsRunId=null;

  function setConnection(text,online){$('connection').textContent=text;$('connection').classList.toggle('online',!!online);}
  function setMessage(text,type=''){const node=$('launchMessage');node.textContent=text;node.className='inline-state'+(type?' '+type:'');}
  function setLevel(level){
    chosenLevel=level;
    document.querySelectorAll('[data-level]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.level===level)));
    $('selectedLevel').textContent=LEVELS[level];
  }
  document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>setLevel(button.dataset.level)));

  function loadSessionToken(){
    try{currentToken=sessionStorage.getItem('elsn_inspector_token')||'';}catch(_){currentToken='';}
    if(currentToken){$('githubToken').value=currentToken;$('sessionKeep').checked=true;$('tokenState').textContent='Token disponible en esta sesión';}
  }
  function saveToken(){
    const value=$('githubToken').value.trim();
    if(!value){currentToken='';try{sessionStorage.removeItem('elsn_inspector_token');}catch(_){}$('tokenState').textContent='No hay token cargado.';return;}
    if(!/^github_pat_[A-Za-z0-9_]+$/.test(value)&&!/^gh[pousr]_[A-Za-z0-9_]+$/.test(value)){
      $('tokenState').textContent='El formato no parece un token personal de GitHub.';return;
    }
    currentToken=value;
    if($('sessionKeep').checked){try{sessionStorage.setItem('elsn_inspector_token',value);}catch(_){$('tokenState').textContent='El navegador no permite guardar la sesión; el token solo se conserva en memoria.';return;}}
    else{try{sessionStorage.removeItem('elsn_inspector_token');}catch(_){}}
    $('tokenState').textContent=$('sessionKeep').checked?'Token guardado hasta cerrar esta pestaña.':'Token cargado solo en memoria hasta salir o recargar.';
  }
  $('saveToken').addEventListener('click',saveToken);
  $('clearToken').addEventListener('click',()=>{$('githubToken').value='';currentToken='';try{sessionStorage.removeItem('elsn_inspector_token');}catch(_){}$('tokenState').textContent='Token eliminado de esta sesión.';});
  $('toggleToken').addEventListener('click',()=>{const input=$('githubToken');input.type=input.type==='password'?'text':'password';$('toggleToken').textContent=input.type==='password'?'Mostrar':'Ocultar';});
  $('sessionKeep').addEventListener('change',()=>{if(currentToken)saveToken();});
  $('githubToken').addEventListener('input',()=>{currentToken='';$('tokenState').textContent='Guarda el token para habilitar el inicio directo.';});

  function statusInfo(run){
    if(!run)return {label:'Sin ejecuciones',kind:'',done:false};
    if(run.status!=='completed')return {label:run.status==='in_progress'?'En ejecución':'En cola',kind:'running',done:false};
    if(run.conclusion==='success')return {label:'Superada',kind:'success',done:true};
    if(run.conclusion==='cancelled')return {label:'Cancelada',kind:'failure',done:true};
    if(run.conclusion==='timed_out')return {label:'Tiempo agotado',kind:'failure',done:true};
    return {label:'Fallida',kind:'failure',done:true};
  }
  function renderRunShell(run){
    $('overviewRun').textContent=run?'#'+run.run_number:'—';
    $('overviewRunFoot').textContent=run?(run.head_branch||'Rama desconocida'):'Sin ejecuciones registradas';
    if(!run){
      $('runState').textContent='Sin ejecuciones';$('runState').className='status-pill';
      $('runNumber').textContent='—';$('runBranch').textContent='Aún no hay auditorías registradas.';
      $('runDate').textContent='Pulsa “Iniciar inspección” para comenzar desde aquí.';
      $('runPhaseTitle').textContent='Esperando la primera ejecución';$('runPhaseDescription').textContent='El panel mostrará cada fase sin tener que abrir GitHub.';
      $('progressValue').textContent='0%';$('progressCircle').style.strokeDashoffset=188.5;$('progressTrack').style.width='0%';
      $('stepList').innerHTML='<div class="empty-state"><div><strong>El historial está vacío</strong>La primera ejecución aparecerá aquí automáticamente.</div></div>';
      return;
    }
    const state=statusInfo(run);
    $('runState').textContent=state.label;$('runState').className='status-pill '+state.kind;
    $('runNumber').innerHTML='#'+esc(run.run_number)+' <span>· Inspector único</span>';
    $('runBranch').textContent='Rama: '+(run.head_branch||'—')+' · '+(run.event==='workflow_dispatch'?'Inicio desde el panel':run.event==='pull_request'?'Pull request':'Ejecución automática');
    $('runDate').textContent='Iniciada: '+niceDate(run.created_at)+' · Commit '+String(run.head_sha||'').slice(0,8);
    $('runTechnicalLink').href=run.html_url||'#';
  }

  function renderSteps(phases,jobSteps){
    const normalized=phases?.length?phases.map(p=>({name:p.name||p.script,status:p.status==='completed'?'passed':p.status,startedAt:p.startedAt,durationMs:p.durationMs,error:p.error})):
      (jobSteps||[]).map(step=>({name:step.name,status:step.status==='completed'?(step.conclusion==='success'?'passed':step.conclusion==='failure'?'failed':step.conclusion==='skipped'?'skipped':'completed'):step.status==='in_progress'?'running':'pending',startedAt:step.started_at,completedAt:step.completed_at,conclusion:step.conclusion}));
    const done=normalized.filter(p=>['passed','completed','skipped'].includes(p.status)).length;
    const failed=normalized.filter(p=>p.status==='failed'||p.status==='timed_out').length;
    const running=normalized.find(p=>p.status==='running'||p.status==='in_progress');
    const percent=normalized.length?Math.round(done/normalized.length*100):0;
    $('progressValue').textContent=percent+'%';
    $('overviewProgress').textContent=percent+'%';
    $('progressCircle').style.strokeDashoffset=188.5-(188.5*percent/100);
    $('progressTrack').style.width=percent+'%';
    $('runPhaseTitle').textContent=failed?failed+' fase(s) requieren revisión':running?running.name:done===normalized.length&&normalized.length?'Inspección completada':'Preparando el entorno';
    $('runPhaseDescription').textContent=running?'En curso ahora mismo · '+formatElapsed(Date.now()-Date.parse(running.startedAt||new Date().toISOString())):failed?'El informe conserva los errores concretos para poder corregirlos.':done===normalized.length&&normalized.length?'Todas las fases publicadas han terminado.':'Los pasos del runner ya están disponibles; el detalle de cada fase aparecerá conforme se publique.';
    if(!normalized.length){$('stepList').innerHTML='<div class="empty-state"><div><strong>Preparando la auditoría</strong>GitHub ha aceptado la ejecución. Los pasos aparecerán en cuanto arranque el runner.</div></div>';return;}
    $('stepList').innerHTML=normalized.map(p=>{
      const done=['passed','completed','skipped'].includes(p.status),bad=['failed','timed_out'].includes(p.status),now=['running','in_progress'].includes(p.status);
      const icon=done?'✓':bad?'!':now?'<span class="spin"></span>':'·';
      return '<div class="step '+(done?'done':bad?'failed':now?'current':'')+'"><span class="step-icon">'+icon+'</span><span class="step-name">'+esc(p.name||'Fase')+(p.error?'<br><small>'+esc(p.error)+'</small>':'')+'</span><span class="step-time">'+(p.durationMs!=null?formatElapsed(p.durationMs):statusName(p.status))+'</span></div>';
    }).join('');
  }
  function statusName(s){return ({pending:'Pendiente',queued:'En cola',running:'En curso',in_progress:'En curso',skipped:'Omitida'})[s]||s||'Pendiente';}

  async function apiGet(url){
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};if(currentToken)headers.Authorization='Bearer '+currentToken;
    const response=await fetch(url,{headers,cache:'no-store'});
    if(!response.ok)throw new Error('GitHub API '+response.status);
    return response.json();
  }
  async function fetchProgress(run){
    try{
      const response=await fetch(RAW+'/runs/'+run.id+'.json?cache='+Date.now(),{cache:'no-store'});
      if(response.ok)return await response.json();
    }catch(_){}
    return null;
  }
  function findLatestInspectorRun(runs){
    return (runs||[]).find(run=>run.name?.includes('Inspector único')||run.path?.includes(WORKFLOW))||null;
  }
  async function refreshDashboard(force=false){
    if(fetchBusy&&!force)return;fetchBusy=true;
    try{
      const now=Date.now();
      const metadataInterval=currentToken?25000:90000;
      const needRunRefresh=force||!activeRun||now-lastRunsFetchAt>=metadataInterval;
      if(needRunRefresh){
        const list=await apiGet(API+'/actions/workflows/'+WORKFLOW+'/runs?per_page=12');
        latestRuns=list.workflow_runs||[];
        activeRun=findLatestInspectorRun(latestRuns);
        lastRunsFetchAt=Date.now();
        renderRunShell(activeRun);
      }
      const run=activeRun;
      if(!run){
        renderRunShell(null);renderCompare(null);renderRadar(null);renderTelemetry(null);
        $('updatedAt').textContent='Sin ejecuciones recientes';
        setConnection('GitHub conectado',true);lastError=null;return;
      }
      const manifest=await fetchProgress(run);
      progressData=manifest;
      let jobs={jobs:[]};
      // Progress manifests are published as static JSON every phase transition; only
      // ask the Actions API for step-level detail when the runner has not published one.
      const needsJobFallback=!manifest?.phases?.length;
      const jobsInterval=currentToken?20000:90000;
      if(needsJobFallback&&(force||now-lastJobsFetchAt>=jobsInterval)){
        jobs=await apiGet(API+'/actions/runs/'+run.id+'/jobs?per_page=100').catch(()=>({jobs:[]}));
        lastJobsFetchAt=Date.now();jobsData=jobs;jobsRunId=run.id;
      }else if(jobsData&&jobsRunId===run.id){
        jobs=jobsData;
      }
      const phases=manifest?.phases||[];
      const allSteps=(jobs.jobs||[]).flatMap(job=>(job.steps||[]).map(step=>({...step,jobName:job.name})));
      renderSteps(phases,allSteps);
      renderCompare(manifest);
      renderRadar(manifest);
      renderTelemetry(manifest);
      const latest=jobs.jobs?.find(job=>job.status==='in_progress');
      const current=latest?.steps?.find(step=>step.status==='in_progress');
      $('runPhaseDescription').textContent=phases.length
        ?$('runPhaseDescription').textContent
        :current?'Fase activa: '+current.name+' · El inspector está trabajando dentro del navegador de pruebas.':'La auditoría está preparando el entorno.';
      $('updatedAt').textContent='Datos actualizados '+new Date().toLocaleTimeString('es-ES')+' · progreso en vivo';
      $('runArtifactsLink').href=run.html_url?run.html_url+'#artifacts':'#';
      setConnection('GitHub conectado',true);lastError=null;
    }catch(error){
      lastError=error;setConnection('Sin conexión',false);
      $('updatedAt').textContent='No se pudo actualizar: '+error.message;
      if(!activeRun)$('runPhaseDescription').textContent='No se pudo consultar GitHub. Comprueba la conexión e inténtalo de nuevo.';
    }finally{fetchBusy=false;}
  }
  async function findNewDispatch(existingIds,ref,clickedAt){
    const until=Date.now()+35000;
    while(Date.now()<until){
      try{
        const list=await apiGet(API+'/actions/workflows/'+WORKFLOW+'/runs?per_page=15');
        const found=(list.workflow_runs||[]).find(r=>!existingIds.has(r.id)&&r.event==='workflow_dispatch'&&r.head_branch===ref&&Date.parse(r.created_at)>=clickedAt-90000);
        if(found){activeRun=found;renderRunShell(found);return found;}
      }catch(_){}
      await new Promise(resolve=>setTimeout(resolve,2200));
    }
    return null;
  }
  async function launchInspection(){
    if(launching)return;
    saveToken();
    if(!currentToken){$('tokenDetails').open=true;setMessage('Añade un token de acceso fino con permiso Actions: write para este repositorio. No saldrás del Inspector Center.','error');return;}
    const ref=$('targetBranch').value.trim()||'main';
    const beforeRef=$('beforeRef').value.trim();
    if(!/^[A-Za-z0-9._/-]+$/.test(ref)){setMessage('La rama contiene caracteres no válidos.','error');return;}
    launching=true;$('launchButton').disabled=true;$('launchButton').innerHTML='<span class="spin"></span> Enviando auditoría…';
    setMessage('Enviando la orden a GitHub Actions desde esta página…');
    const existingIds=new Set(latestRuns.map(run=>run.id)),clickedAt=Date.now();
    const inputs={inspection_level:chosenLevel};
    if(beforeRef)inputs.before_ref=beforeRef;
    try{
      const response=await fetch(API+'/actions/workflows/'+WORKFLOW+'/dispatches',{
        method:'POST',
        headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+currentToken,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
        body:JSON.stringify({ref,inputs})
      });
      if(!response.ok){const body=await response.text();throw new Error('GitHub rechazó el inicio ('+response.status+'): '+body.slice(0,260));}
      setMessage('Solicitud aceptada. Localizando la ejecución y conectando su progreso…','success');
      const run=await findNewDispatch(existingIds,ref,clickedAt);
      if(run){setMessage('Auditoría iniciada correctamente. El progreso se actualizará en esta misma página.','success');await refreshDashboard(true);}
      else{setMessage('GitHub aceptó la orden, pero todavía no ha publicado el identificador de ejecución. Se está comprobando el estado en segundo plano.','success');await refreshDashboard(true);}
    }catch(error){setMessage(error.message,'error');}
    finally{launching=false;$('launchButton').disabled=false;$('launchButton').innerHTML='Iniciar inspección <span aria-hidden="true">↗</span>';}
  }
  $('launchButton').addEventListener('click',launchInspection);

  function metricDelta(before,after,direction){
    if(!Number.isFinite(Number(before))||!Number.isFinite(Number(after)))return {label:'Sin comparación',kind:'neutral'};
    if(Number(before)===0)return {label:Number(after)===0?'Sin cambio':'Nueva medición: '+number(after),kind:'neutral'};
    const pct=(Number(after)-Number(before))/Math.abs(Number(before))*100;
    const good=direction==='higher'?pct>0:pct<0;
    if(Math.abs(pct)<.5)return {label:'Prácticamente igual',kind:'neutral'};
    return {label:(pct>0?'+':'')+number(pct,0)+'% · '+(good?'mejora':'empeora'),kind:good?'good':'bad'};
  }
  function renderTelemetry(manifest){
    const data=manifest?.results?.beforeAfter,builds=data?.builds||{},before=builds.before?.performance,after=builds.after?.performance;
    const defs=[
      {key:'medianFps',label:'FPS medianas',unit:'fps',direction:'higher',icon:'◴',digits:0},
      {key:'medianFrameP95Ms',label:'Frame time p95',unit:'ms · menor es mejor',direction:'lower',icon:'⌁',digits:1},
      {key:'medianWorldUpdateCpuMs',label:'CPU mundo',unit:'ms · menor es mejor',direction:'lower',icon:'◇',digits:1},
      {key:'medianRenderSubmissionCpuMs',label:'CPU render',unit:'ms · menor es mejor',direction:'lower',icon:'▧',digits:1}
    ];
    $('telemetryGrid').innerHTML=defs.map(def=>{
      const a=before?.[def.key],b=after?.[def.key],delta=metricDelta(a,b,def.direction),max=Math.max(1,Number(a)||0,Number(b)||0);
      const w1=Math.max(2,Math.min(100,(Number(a)||0)/max*100)),w2=Math.max(2,Math.min(100,(Number(b)||0)/max*100));
      return '<article class="metric-card"><div class="metric-head"><span class="metric-icon">'+def.icon+'</span><span class="metric-name">'+def.label+'</span></div><div class="metric-value">'+number(b,def.digits)+' <span class="metric-unit">'+def.unit+'</span></div><span class="metric-delta '+delta.kind+'">'+esc(delta.label)+'</span><div class="metric-bars"><div class="metric-bar-row"><span>Antes</span><div class="metric-bar-track"><div class="metric-bar-fill" style="width:'+w1+'%"></div></div><b>'+number(a,def.digits)+'</b></div><div class="metric-bar-row"><span>Ahora</span><div class="metric-bar-track"><div class="metric-bar-fill after" style="width:'+w2+'%"></div></div><b>'+number(b,def.digits)+'</b></div></div></article>';
    }).join('');
    const renderer=data?.renderer||'Sin datos de renderizador';
    $('telemetryCaveat').textContent=renderer.includes('SwiftShader')
      ?'Importante: esta comparativa emula el perfil del S26 Ultra, pero se ejecuta con Chromium + ANGLE SwiftShader en software. No representa FPS físicos de la GPU Adreno. Los tiempos extremos de render deben interpretarse como limitación del entorno CI, no como benchmark del teléfono.'
      :'Los valores pertenecen al entorno indicado por el informe. No se atribuyen al hardware físico sin una medición en el dispositivo.';
    const diagnostics={run:activeRun?.id,level:manifest?.level,renderer,builds,results:manifest?.results,phases:manifest?.phases};
    $('technicalJson').textContent=JSON.stringify(diagnostics,null,2);
  }

  function renderCompare(manifest){
    const data=manifest?.results?.beforeAfter,previews=data?.previews||{};
    $('beforeBuild').textContent=data?.builds?.before?.build||'—';
    $('afterBuild').textContent=data?.builds?.after?.build||'—';
    const ready=PHASES.filter(p=>previews[p.id]?.before&&previews[p.id]?.after);
    document.querySelectorAll('[data-phase]').forEach(button=>{
      const p=PHASES.find(x=>x.id===button.dataset.phase),item=previews[p?.id];
      button.disabled=!(item?.before&&item?.after);
      button.setAttribute('aria-pressed',String(button.dataset.phase===activePhase));
      const img=button.querySelector('img');
      if(img&&item?.after){img.src=item.after;img.alt=p.label+' — después';}
    });
    const selected=previews[activePhase];
    const beforeImage=$('beforeImage'),afterImage=$('afterImage'),differenceImage=$('differenceImage');
    if(!selected?.before||!selected?.after){
      beforeImage.removeAttribute('src');afterImage.removeAttribute('src');differenceImage.removeAttribute('src');
      $('compareEmpty').hidden=false;$('compareStage').hidden=true;$('compareEmpty').textContent=manifest?'Esta ejecución no publicó miniaturas para el comparador. Inicia una auditoría profunda para generar las cuatro fases.':'Cuando termine una auditoría profunda aparecerán aquí las cuatro comparativas, sin enlaces externos.';
      $('phaseMeta').textContent=ready.length+' / 4 fases disponibles';
      return;
    }
    $('compareEmpty').hidden=true;$('compareStage').hidden=false;
    beforeImage.src=selected.before;afterImage.src=selected.after;
    if(selected.difference)differenceImage.src=selected.difference;else differenceImage.removeAttribute('src');
    $('phaseName').textContent=PHASES.find(p=>p.id===activePhase)?.label||activePhase;
    $('phaseTime').textContent=PHASES.find(p=>p.id===activePhase)?.time||'';
    $('beforeTag').textContent='ANTES · '+(data?.builds?.before?.build||'versión anterior');
    $('afterTag').textContent='DESPUÉS · '+(data?.builds?.after?.build||'candidata');
    const comparison=data?.phases?.find(p=>p.id===activePhase)?.comparison;
    $('phaseMeta').textContent=ready.length+' / 4 fases · '+(comparison?.changedPixelRatio!=null?number(comparison.changedPixelRatio*100,1)+'% de píxeles distintos':'comparación visual capturada');
    updateCompareOverlay();
  }
  function updateCompareOverlay(){
    $('afterImage').style.clipPath='inset(0 '+(100-comparePosition)+'% 0 0)';
    $('compareDivider').style.left=comparePosition+'%';
    $('compareRange').value=String(comparePosition);
    $('compareStage').classList.toggle('show-difference',differenceVisible&&!!$('differenceImage').src);
    $('differenceToggle').checked=differenceVisible;
  }
  document.querySelectorAll('[data-phase]').forEach(button=>button.addEventListener('click',()=>{activePhase=button.dataset.phase;document.querySelectorAll('[data-phase]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));renderCompare(progressData);}));
  $('compareRange').addEventListener('input',event=>{comparePosition=Number(event.target.value)||50;updateCompareOverlay();});
  $('differenceToggle').addEventListener('change',event=>{differenceVisible=event.target.checked;updateCompareOverlay();});

  function coordinate(item){const x=Number(item?.position?.x??item?.x),z=Number(item?.position?.z??item?.z);return Number.isFinite(x)&&Number.isFinite(z)?{x,z}:null;}
  function measuredGrounding(structure,grounding){
    const pos=coordinate(structure);if(!pos)return {state:'unknown',delta:null,source:'No hay coordenadas válidas.'};
    const rows=[...(grounding?.habitableStructures||[]),...(grounding?.settlementHouses||[]),...(grounding?.settlementCamps||[]),...(grounding?.garrisons||[])];
    let match=null,best=Infinity;
    for(const row of rows){const p=coordinate(row);if(!p)continue;const distance=Math.hypot(p.x-pos.x,p.z-pos.z);if(distance<best&&distance<1.1){best=distance;match=row;}}
    const explicit=match?.maximumBaseGapMeters??match?.baseAnchorGapMeters??match?.maximumStructuralBaseGapMeters;
    const fallback=structure.bottomAboveTerrainMeters;
    const delta=explicit!=null&&Number.isFinite(Number(explicit))?Number(explicit):fallback!=null&&Number.isFinite(Number(fallback))?Number(fallback):null;
    if(delta==null)return {state:'unknown',delta:null,source:'Inventariada; falta medición de apoyo a escala centimétrica.'};
    return {state:Math.abs(delta)<=.02?'grounded':'misaligned',delta,source:match?'Auditoría de cimentación / terreno renderizado':'Auditoría geométrica de la escena'};
  }

  function renderRadar(manifest){
    const custom=manifest?.results?.custom,grounding=manifest?.results?.grounding;
    const islands=custom?.islands||[],structures=(custom?.structures||[]).filter(item=>['structure','unidentified-structure'].includes(item.category)&&coordinate(item));
    radarData={islands,structures,grounding};
    if(!islands.length){
      $('radarSvg').innerHTML='';
      $('radarEmpty').hidden=false;
      $('radarEmpty').textContent='El inventario de las 13 islas todavía no está disponible en esta ejecución. El radar se completará al terminar la inspección unificada; no se dibujan posiciones estimadas.';
      $('radarDetail').innerHTML='<div class="empty-state"><div><strong>Sin inventario geométrico</strong>Se necesitan coordenadas reales del motor Babylon.</div></div>';
      $('radarStats').textContent='Pendiente de datos';
      return;
    }
    $('radarEmpty').hidden=true;
    const svg=$('radarSvg'),ns='http://www.w3.org/2000/svg';svg.innerHTML='';
    const minX=Math.min(...islands.map(i=>Number(i.x)||0)),maxX=Math.max(...islands.map(i=>Number(i.x)||0));
    const minZ=Math.min(...islands.map(i=>Number(i.z)||0)),maxZ=Math.max(...islands.map(i=>Number(i.z)||0));
    const pad=76,w=900,h=540,spanX=Math.max(1,maxX-minX),spanZ=Math.max(1,maxZ-minZ);
    const scale=Math.min((w-pad*2)/spanX,(h-pad*2)/spanZ);
    const mapX=x=>pad+(x-minX)*scale+(w-pad*2-spanX*scale)/2;
    const mapY=z=>h-pad-(z-minZ)*scale-(h-pad*2-spanZ*scale)/2;
    const make=(tag,attrs={})=>{const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));return node;};
    const bg=make('rect',{x:0,y:0,width:w,height:h,fill:'transparent'});svg.appendChild(bg);
    const ring=make('circle',{cx:w/2,cy:h/2,r:205,fill:'none',stroke:'#4d7190','stroke-opacity':'.2','stroke-dasharray':'4 8'});svg.appendChild(ring);
    const labels=[];
    islands.forEach((island,index)=>{
      const islandRadius=Number(island.r??island.radiusMeters)||18,x=mapX(Number(island.x)||0),y=mapY(Number(island.z)||0),radius=Math.max(15,Math.min(43,islandRadius*scale*.36));
      const owned=structures.filter(s=>Number(s.islandIndex)===index||s.island===island.name);
      const states=owned.map(s=>measuredGrounding(s,grounding).state);
      const hasBad=states.includes('misaligned'),allMeasured=states.length>0&&states.every(s=>s!=='unknown'),state=hasBad?'misaligned':allMeasured?'grounded':'unknown';
      const g=make('g',{tabindex:'0',role:'button','aria-label':'Seleccionar '+(island.name||('Isla '+(index+1))),'data-island':index});
      const outline=make('ellipse',{cx:x,cy:y,rx:radius*1.2,ry:radius*.83,transform:'rotate('+(index*17-30)+' '+x+' '+y+')',class:'island-shape '+(index===selectedIsland?'selected':'')});
      const node=make('circle',{cx:x,cy:y,r:6.5,class:'island-node'});
      const label=make('text',{x:x,y:y+radius+19,'text-anchor':'middle',class:'island-label'});label.textContent=(index+1)+'. '+(island.name||'Isla');
      g.append(outline,node,label);g.addEventListener('click',()=>selectIsland(index));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectIsland(index);}});svg.appendChild(g);
      const statusCircle=make('circle',{cx:x+radius*.9,cy:y-radius*.6,r:5.5,fill:state==='grounded'?'#52d5a0':state==='misaligned'?'#ff777f':'#91a5bd',stroke:'#091522','stroke-width':2});svg.appendChild(statusCircle);
      owned.forEach((s,j)=>{
        const p=coordinate(s),m=measuredGrounding(s,grounding),angle=((j*137.508)+index*23)*Math.PI/180;
        const sx=mapX(p.x)+Math.cos(angle)*Math.min(15,(j%4)*3),sy=mapY(p.z)+Math.sin(angle)*Math.min(15,(j%4)*3);
        const circle=make('circle',{cx:sx,cy:sy,r:4.2,class:'structure-node '+m.state,tabindex:'0',role:'button','aria-label':(s.kind||s.name)+' · '+(m.state==='grounded'?'apoyo correcto':m.state==='misaligned'?'desnivel detectado':'sin medir')});
        circle.addEventListener('click',event=>{event.stopPropagation();selectStructure(s,index);});
        circle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStructure(s,index);}});
        svg.appendChild(circle);
      });
    });
    const grounded=structures.filter(s=>measuredGrounding(s,grounding).state==='grounded').length;
    const misaligned=structures.filter(s=>measuredGrounding(s,grounding).state==='misaligned').length;
    const unknown=structures.length-grounded-misaligned;
    $('radarStats').textContent=islands.length+' islas · '+structures.length+' objetos candidatos';
    $('overviewIslands').textContent=String(islands.length);
    $('overviewStructures').textContent=String(structures.length);
    $('overviewStructuresFoot').textContent='Candidatos detectados en escena';
    $('radarCounts').innerHTML='<div class="radar-count"><b style="color:var(--green)">'+grounded+'</b><span>Apoyo ≤ 2 cm</span></div><div class="radar-count"><b style="color:var(--red)">'+misaligned+'</b><span>Desnivel &gt; 2 cm</span></div><div class="radar-count"><b>'+unknown+'</b><span>Sin medición</span></div>';
    if(selectedIsland==null||selectedIsland>=islands.length)selectedIsland=3<islands.length?3:0;
    selectIsland(selectedIsland);
  }
  function selectIsland(index){selectedIsland=index;selectedStructure=null;if(!radarData)return;document.querySelectorAll('[data-island]').forEach(node=>node.querySelector('.island-shape')?.classList.toggle('selected',Number(node.dataset.island)===index));renderRadarDetail();}
  function selectStructure(structure,index){selectedIsland=index;selectedStructure=structure;document.querySelectorAll('[data-island]').forEach(node=>node.querySelector('.island-shape')?.classList.toggle('selected',Number(node.dataset.island)===index));renderRadarDetail();}
  function renderRadarDetail(){
    const island=radarData?.islands?.[selectedIsland];if(!island)return;
    const rows=radarData.structures.filter(s=>Number(s.islandIndex)===selectedIsland||s.island===island.name).sort((a,b)=>String(a.name||a.kind).localeCompare(String(b.name||b.kind)));
    const chosen=selectedStructure||rows[0]||null,m=chosen?measuredGrounding(chosen,radarData.grounding):null;
    const selectedTitle=chosen?(chosen.kind||chosen.name||'Estructura'):'Sin estructuras candidatas en el inventario';
    const deltaText=m?.delta==null?'Apoyo pendiente de medición':Math.abs(m.delta*100).toFixed(1).replace('.',',')+' cm '+(m.delta<0?'por debajo': 'respecto al terreno');
    const detail='<div class="radar-selected"><span class="step-label">Isla seleccionada</span><h3>'+esc(island.name||('Isla '+(selectedIsland+1)))+'</h3><p>Centro X '+number(island.x,1)+' · Z '+number(island.z,1)+' · Radio '+number(island.r,1)+' m</p></div>'+
      '<div class="radar-counts"><div class="radar-count"><b>'+rows.length+'</b><span>Objetos</span></div><div class="radar-count"><b style="color:'+(m?.state==='grounded'?'var(--green)':m?.state==='misaligned'?'var(--red)':'var(--muted)')+'">'+(m?.state==='grounded'?'OK':m?.state==='misaligned'?'!':'—')+'</b><span>Seleccionado</span></div><div class="radar-count"><b>'+ (m?.delta==null?'—':number(m.delta*100,1))+'</b><span>Delta cm</span></div></div>'+
      (chosen?'<div class="phase-stat"><span>Estructura seleccionada</span><strong>'+esc(selectedTitle)+'</strong><div class="meta">'+esc(chosen.code||('ID '+(chosen.nativeId??chosen.uniqueId??'—')))+'</div><div class="meta">'+esc(deltaText)+'</div><div class="meta">'+esc(m.source)+'</div></div>':'')+
      '<div class="step-label" style="margin:14px 0 7px">Estructuras y objetos detectados</div><div class="structure-list">'+(rows.length?rows.map(row=>{const status=measuredGrounding(row,radarData.grounding);return '<button class="structure-row '+(row===chosen?'selected':'')+'" data-structure-code="'+esc(row.code||row.uniqueId||row.name)+'"><span class="status-dot '+status.state+'"></span><span class="structure-row-text"><strong>'+esc(row.kind||row.name||'Objeto sin nombre')+'</strong><small>'+esc(row.classificationConfidence||row.structuralRole||'Tipo pendiente')+'</small></span><span class="structure-delta '+status.state+'">'+(status.delta==null?'—':number(status.delta*100,1)+' cm')+'</span></button>';}).join(''):'<div class="empty-state">No hay nodos estructurales registrados para esta isla.</div>')+'</div>';
    $('radarDetail').innerHTML=detail;
    $('radarDetail').querySelectorAll('[data-structure-code]').forEach(button=>button.addEventListener('click',()=>{const code=button.dataset.structureCode;selectedStructure=rows.find(r=>String(r.code||r.uniqueId||r.name)===code)||null;renderRadarDetail();}));
  }

  function bindEvents(){
    $('refreshNow').addEventListener('click',()=>refreshDashboard(true));
    $('artifactsLink').addEventListener('click',()=>{if(activeRun?.html_url)window.open(activeRun.html_url+'#artifacts','_blank','noopener');});
  }
  loadSessionToken();setLevel('deep');bindEvents();refreshDashboard(true);
  refreshTimer=setInterval(()=>refreshDashboard(false),12000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDashboard(true);});
})();
