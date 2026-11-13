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
  const number=(v,d=1)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('es-ES',{maximumFractionDigits:d}):'—';
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
      $('runArtifactsLink').href=API+'/actions';
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
    $('runArtifactsLink').href=run.html_url?(run.html_url+'#artifacts'):(API+'/actions');
  }

  function renderSteps(phases,jobSteps){
    const normalized=phases?.length?phases.map(p=>({name:p.name||p.script,status:p.status==='completed'?'passed':p.status,startedAt:p.startedAt,durationMs:p.durationMs,error:p.error})):
      (jobSteps||[]).map(step=>({name:step.name,status:step.status==='completed'?(step.conclusion==='success'?'passed':step.conclusion==='failure'||step.conclusion==='cancelled'?'failed':step.conclusion==='skipped'?'skipped':'completed'):step.status==='in_progress'?'running':'pending',startedAt:step.started_at,completedAt:step.completed_at,conclusion:step.conclusion}));
    const done=normalized.filter(p=>['passed','completed','skipped'].includes(p.status)).length;
    const failed=normalized.filter(p=>p.status==='failed'||p.status==='timed_out').length;
    const running=normalized.find(p=>p.status==='running'||p.status==='in_progress');
    const percent=normalized.length?Math.round(done/normalized.length*100):0;
    const indeterminate=!!running&&(running.name==='Run the single unified inspector'||(done===0&&normalized.length===1));
    $('progressValue').textContent=indeterminate?'En curso':percent+'%';
    $('progressValue').classList.toggle('is-label',indeterminate);
    $('overviewProgress').textContent=indeterminate?'En curso':percent+'%';
    $('progressCircle').style.strokeDashoffset=indeterminate?141.4:188.5-(188.5*percent/100);
    $('progressTrack').style.width=indeterminate?'':percent+'%';
    $('progressTrack').classList.toggle('indeterminate',indeterminate);
    $('runPhaseTitle').textContent=failed?failed+' fase(s) requieren revisión':running?running.name:done===normalized.length&&normalized.length?'Inspección completada':'Preparando el entorno';
    $('runPhaseDescription').textContent=running?'En curso ahora mismo · '+formatElapsed(Date.now()-Date.parse(running.startedAt||new Date().toISOString())):failed?'El informe conserva los errores concretos para poder corregirlos.':done===normalized.length&&normalized.length?'Todas las fases publicadas han terminado.':'Los pasos del runner ya están disponibles; el detalle de cada fase aparecerá conforme se publique.';
    if(!normalized.length){$('stepList').innerHTML='<div class="empty-state"><div><strong>Esperando datos verificables</strong>El panel no inventará fases ni porcentajes. Consultará el estado real de GitHub y mostrará aquí los pasos en cuanto estén disponibles.</div></div>';return;}
    $('stepList').innerHTML=normalized.map(p=>{
      const done=['passed','completed','skipped'].includes(p.status),bad=['failed','timed_out'].includes(p.status),now=['running','in_progress'].includes(p.status);
      const icon=done?'✓':bad?'!':now?'<span class="spin"></span>':'·';
      return '<div class="step '+(done?'done':bad?'failed':now?'current':'')+'"><span class="step-icon">'+icon+'</span><span class="step-name">'+esc(p.name||'Fase')+(p.error?'<br><small>'+esc(p.error)+'</small>':'')+'</span><span class="step-time">'+(p.durationMs!=null?formatElapsed(p.durationMs):statusName(p.status))+'</span></div>';
    }).join('');
  }
  function statusName(s){return ({pending:'Pendiente',queued:'En cola',running:'En curso',in_progress:'En curso',skipped:'Omitida',failed:'Fallida'})[s]||s||'Pendiente';}

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
      const metadataInterval=currentToken?25000:150000;
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
      let jobs={jobs:[]},jobsError=null;
      // A pull_request run cannot safely publish a progress manifest with a write token.
      // Poll the public Actions jobs endpoint frequently instead of leaving a stale
      // "Preparación" card on screen for minutes.
      const jobsInterval=run.status==='in_progress'?12000:30000;
      const shouldRefreshJobs=force||jobsRunId!==run.id||now-lastJobsFetchAt>=jobsInterval;
      if(shouldRefreshJobs){
        try{
          jobs=await apiGet(API+'/actions/runs/'+run.id+'/jobs?per_page=100');
          jobsData=jobs;jobsRunId=run.id;lastJobsFetchAt=Date.now();
        }catch(error){
          jobsError=error;
          if(jobsData&&jobsRunId===run.id)jobs=jobsData;
        }
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
      if(!phases.length&&!allSteps.length&&run.status==='in_progress'){
        $('runPhaseTitle').textContent='Runner activo · detalle pendiente';
        $('runPhaseDescription').textContent=jobsError
          ?'GitHub no ha permitido leer los pasos ('+jobsError.message+'). La ejecución sigue marcada como activa; no se inventa un porcentaje.'
          :'El runner está activo, pero GitHub aún no ha devuelto sus pasos. Se volverán a consultar en 12 segundos.';
        $('progressValue').textContent='En curso';
        $('overviewProgress').textContent='En curso';
        $('progressCircle').style.strokeDashoffset='141.4';
        $('progressTrack').style.width='';
        $('progressTrack').classList.add('indeterminate');
        $('stepList').innerHTML='<div class="empty-state"><div><strong>Auditoría en ejecución</strong>Esperando los pasos reales de GitHub Actions. No se muestra un 0% engañoso ni se inventan fases.</div></div>';
      }else if(!phases.length&&current){
        $('runPhaseDescription').textContent='Paso activo: '+current.name+'. GitHub Actions todavía no expone las subfases internas del proceso.';
      }else if(!phases.length&&run.status==='queued'){
        $('runPhaseDescription').textContent='En cola de GitHub Actions. El runner aún no ha comenzado.';
      }
      $('updatedAt').textContent='Actualizado '+new Date().toLocaleTimeString('es-ES')+' · '+(phases.length?'telemetría interna':allSteps.length?'pasos de GitHub Actions':'estado de ejecución');
      // The run card links to the workflow directly; no separate artifacts element exists.
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
  function chartLine(samples,key,nestedKey=null){
    return (samples||[]).map(sample=>{
      const raw=nestedKey?sample?.[nestedKey]?.[key]:sample?.[key];
      if(raw===null||raw===undefined||raw==='')return null;
      const value=Number(raw);
      return Number.isFinite(value)?{value}:null;
    }).filter(Boolean).map((point,index)=>({...point,index}));
  }
  function svgLine(points,mapY,color,dash=''){
    if(!points.length)return '';
    const width=628,left=48,right=676,top=18,bottom=178;
    const lastIndex=Math.max(1,points[points.length-1]?.index||0);
    const coords=points.map(point=>{
      const x=left+(points.length===1?(right-left)/2:point.index/lastIndex*(right-left));
      return x.toFixed(1)+','+mapY(point.value,top,bottom).toFixed(1);
    }).join(' ');
    return '<polyline points="'+coords+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" '+(dash?'stroke-dasharray="'+dash+'"':'')+'/>';
  }
  function renderPerformanceGraph(before,after){
    const svg=$('performanceChart');
    const bf=chartLine(before?.samples,'fps'),af=chartLine(after?.samples,'fps');
    const bm=chartLine(before?.samples,'p95','frameTiming'),am=chartLine(after?.samples,'p95','frameTiming');
    const allFps=[...bf,...af].map(p=>p.value),allMs=[...bm,...am].map(p=>p.value);
    if(!allFps.length&&!allMs.length){
      svg.innerHTML='<text x="360" y="112" text-anchor="middle" class="chart-empty">La inspección profunda todavía no ha publicado muestras.</text>';
      $('performanceSummary').textContent=activeRun?.status==='in_progress'?'La prueba aún está trabajando. Las muestras aparecerán al llegar a la fase de rendimiento.':'Esta ejecución no publicó muestras de rendimiento. Consulta sus evidencias.';
      return;
    }
    const maxFps=Math.max(75,Math.ceil(Math.max(60,...allFps)/15)*15);
    const maxMs=Math.max(33.2,Math.ceil(Math.max(16.6,...allMs)/10)*10);
    const yFps=v=>178-(v/maxFps)*160,yMs=v=>178-(v/maxMs)*160;
    const grid=[0,1,2,3,4].map(i=>{
      const y=18+i*40;
      return '<line x1="48" y1="'+y+'" x2="676" y2="'+y+'" class="chart-grid-line"/>';
    }).join('');
    const fpsTarget=yFps(60),msTarget=yMs(16.6);
    svg.innerHTML=grid+
      '<line x1="48" y1="'+fpsTarget+'" x2="676" y2="'+fpsTarget+'" class="chart-target"/>'+
      '<line x1="48" y1="'+msTarget+'" x2="676" y2="'+msTarget+'" class="chart-target chart-target-alt"/>'+
      '<text x="8" y="22" class="chart-axis">FPS</text><text x="712" y="22" text-anchor="end" class="chart-axis">ms</text>'+
      '<text x="50" y="'+(fpsTarget-6)+'" class="chart-target-label">60 FPS</text>'+
      '<text x="674" y="'+(msTarget-6)+'" text-anchor="end" class="chart-target-label">16,6 ms</text>'+
      '<text x="48" y="204" class="chart-axis">Entrada</text><text x="676" y="204" text-anchor="end" class="chart-axis">Muestras posteriores</text>'+
      svgLine(bf,yFps,'#7596bf','7 6')+svgLine(af,yFps,'#65dbe1')+
      svgLine(bm,yMs,'#a27ec5','7 6')+svgLine(am,yMs,'#f4bd68');
    const currentFps=after?.medianFps,currentMs=after?.medianFrameP95Ms;
    $('performanceSummary').textContent='Actual: '+number(currentFps,0)+' FPS · '+number(currentMs,1)+' ms p95. Valores objetivo: ≥60 FPS y ≤16,6 ms.';
  }
  function renderMemoryGraph(before,after){
    const svg=$('memoryChart'),bf=chartLine(before?.samples,'heapUsedMB'),af=chartLine(after?.samples,'heapUsedMB');
    const all=[...bf,...af].map(p=>p.value);
    if(!all.length){
      svg.innerHTML='<text x="360" y="100" text-anchor="middle" class="chart-empty">Chromium no ha expuesto lecturas del heap en esta ejecución.</text>';
      $('memorySummary').textContent=activeRun?.status==='in_progress'?'Aún no se han tomado muestras. La lectura llega durante la entrada al mundo.':'Chromium no publicó lecturas del heap en esta ejecución; no equivale a RAM ni GPU.';
      return;
    }
    const max=Math.max(32,Math.ceil(Math.max(...all)*1.18/16)*16),y=v=>158-(v/max)*135;
    const grid=[0,1,2,3].map(i=>'<line x1="48" y1="'+(18+i*45)+'" x2="676" y2="'+(18+i*45)+'" class="chart-grid-line"/>').join('');
    svg.innerHTML=grid+'<text x="8" y="20" class="chart-axis">MB</text><text x="48" y="184" class="chart-axis">Entrada</text><text x="676" y="184" text-anchor="end" class="chart-axis">Después</text>'+
      svgLine(bf,y,'#7596bf','7 6')+svgLine(af,y,'#65dbe1');
    const peak=Math.max(...all),first=af[0]?.value??bf[0]?.value,last=af.at(-1)?.value??bf.at(-1)?.value;
    $('memorySummary').textContent='Entrada: '+number(first,1)+' MB · pico: '+number(peak,1)+' MB · última lectura: '+number(last,1)+' MB.';
  }
  function renderTelemetry(manifest){
    const data=manifest?.results?.beforeAfter,builds=data?.builds||{},before=builds.before?.performance,after=builds.after?.performance;
    renderPerformanceGraph(before,after);
    renderMemoryGraph(before,after);
    $('worldCpuValue').textContent=after?.medianWorldUpdateCpuMs==null?'—':number(after.medianWorldUpdateCpuMs,2)+' ms';
    $('renderCpuValue').textContent=after?.medianRenderSubmissionCpuMs==null?'—':number(after.medianRenderSubmissionCpuMs,2)+' ms';
    $('worldCpuUnit').textContent=after?.medianWorldUpdateCpuMs==null?(activeRun?.status==='in_progress'?'Esperando la fase de rendimiento':'Esta ejecución no informó esta lectura'):'Tiempo de actualización · menor es mejor';
    $('renderCpuUnit').textContent=after?.medianRenderSubmissionCpuMs==null?(activeRun?.status==='in_progress'?'Esperando la fase de rendimiento':'Esta ejecución no informó esta lectura'):'Tiempo de envío a render · menor es mejor';
    const renderer=data?.renderer||'Sin datos de renderizador';
    $('telemetryCaveat').textContent=renderer.includes('SwiftShader')
      ?'CI usa Chromium + ANGLE SwiftShader. Esta emulación no mide la GPU Adreno física, la VRAM ni la RAM total del S26 Ultra. La gráfica de memoria, cuando existe, solo mide el heap JavaScript que Chromium expone.'
      :'Las lecturas pertenecen al entorno indicado por el informe; no se atribuyen al hardware físico sin una medición en el dispositivo.';
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
      const placeholder=button.querySelector('.phase-placeholder');
      if(placeholder)placeholder.textContent=item?.before&&item?.after?'Lista':'Pendiente';
    });
    const selected=previews[activePhase];
    const beforeImage=$('beforeImage'),afterImage=$('afterImage'),differenceImage=$('differenceImage');
    if(!selected?.before||!selected?.after){
      beforeImage.removeAttribute('src');afterImage.removeAttribute('src');differenceImage.removeAttribute('src');
      $('compareEmpty').hidden=false;$('compareStage').hidden=true;$('compareEmpty').textContent=activeRun?.status==='in_progress'?'Las imágenes aún se están preparando. Aparecerán cuando la inspección llegue a la comparación visual. No tienes que hacer nada.':manifest?'Esta ejecución terminó sin publicar miniaturas. Revisa sus evidencias o inicia una inspección profunda.':'Cuando termine una inspección profunda aparecerán aquí las cuatro comparativas.';
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
      $('radarEmpty').textContent=activeRun?.status==='in_progress'?'El inspector aún no ha llegado al inventario del mundo. Las 13 islas y sus estructuras aparecerán cuando termine esa fase. No tienes que tocar nada.':'Esta ejecución no publicó el inventario de islas. Revisa sus evidencias; no se dibujan posiciones estimadas.';
      $('radarDetail').innerHTML='<div class="empty-state"><div><strong>'+(activeRun?.status==='in_progress'?'Esperando el inventario':'Sin inventario geométrico')+'</strong>'+(activeRun?.status==='in_progress'?'La auditoría todavía está recopilando los datos de la escena.':'Esta ejecución no contiene coordenadas reales del motor Babylon.')+'</div></div>';
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
    $('radarStats').textContent=islands.length+' islas · '+structures.length+'/39 estructuras detectadas';
    $('overviewIslands').textContent=String(islands.length);
    $('overviewStructures').textContent=String(structures.length);
    $('overviewStructuresFoot').textContent='Detectadas · objetivo 39';
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


  const GUIDE_STEPS=[
    {target:'#overview',title:'1. El resumen: ¿cómo está el juego?',text:'Aquí ves la última inspección, su estado y cuántas islas y estructuras ha encontrado. “En curso” significa que la prueba sigue trabajando; no es un resultado malo.'},
    {target:'#control .levels',title:'2. Elige qué quieres comprobar',text:'Rápido: comprueba el arranque. Completo: revisa mundo, estructuras, agua y vegetación. Profundo: añade la comparación visual y las cuatro horas del día. Para una revisión general, usa Profundo.'},
    {target:'#tokenDetails',title:'3. Autoriza y lanza la prueba',text:'Pulsa “Iniciar inspección”. Para lanzarla desde esta página necesitas un token personal de GitHub limitado a este repositorio, con permiso Actions: Read and write. No compartas ese token con nadie. Después pulsa “Aplicar token” y vuelve a iniciar.'},
    {target:'.run-panel',title:'4. Mira si está trabajando',text:'Esta tarjeta es el seguimiento. “En ejecución” significa que sigue activa; la fase indica qué está haciendo. Usa “Actualizar ahora” para consultar el estado. Al terminar, abre “Capturas y evidencias” para ver los archivos.'},
    {target:'#telemetria',title:'5. Entiende las gráficas',text:'FPS: más alto es mejor; el objetivo es 60. Frame time: más bajo es mejor; 16,6 ms equivale a 60 FPS. La memoria mide solo el heap JavaScript de Chromium, no toda la RAM ni la GPU. Un guion (—) significa “sin dato”, nunca cero.'},
    {target:'#radar',title:'6. Revisa las islas',text:'Toca una isla para ver sus datos y después toca un punto para ver una estructura. Verde: apoyo dentro de 2 cm. Rojo: desnivel mayor de 2 cm. Gris: todavía no se ha medido. El objetivo del inventario es 13 islas y 39 estructuras.'},
    {target:'#comparativa',title:'7. Compara antes y después',text:'Elige amanecer, mediodía, atardecer o noche. Cuando haya capturas, mueve la barra para revelar la versión DESPUÉS y activa el mapa de diferencias para localizar cambios. Si ves “Pendiente”, la inspección aún no ha publicado esa imagen.'}
  ];
  let guideIndex=0,guideActive=false,guideHighlighted=null;
  function clearGuideHighlight(){
    if(guideHighlighted)guideHighlighted.classList.remove('guide-focus');
    guideHighlighted=null;
  }
  function showGuideStep(index){
    guideIndex=Math.max(0,Math.min(GUIDE_STEPS.length-1,index));
    const step=GUIDE_STEPS[guideIndex];
    $('guideStepMeta').textContent='PASO '+(guideIndex+1)+' DE '+GUIDE_STEPS.length;
    $('guideStepTitle').textContent=step.title;
    $('guideStepText').textContent=step.text;
    $('guideProgress').style.width=((guideIndex+1)/GUIDE_STEPS.length*100)+'%';
    $('guidePrev').disabled=guideIndex===0;
    $('guideNext').textContent=guideIndex===GUIDE_STEPS.length-1?'Volver al principio ↺':'Siguiente →';
    clearGuideHighlight();
    const target=document.querySelector(step.target);
    if(target){
      guideHighlighted=target;
      target.classList.add('guide-focus');
      if(step.target==='#tokenDetails'&&!currentToken)$('tokenDetails').open=true;
      target.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }
  function openGuide(){
    guideActive=true;
    $('guidePanel').hidden=false;
    $('guideFab').hidden=true;
    document.body.classList.add('guide-open');
    showGuideStep(0);
  }
  function closeGuide(){
    guideActive=false;
    clearGuideHighlight();
    $('guidePanel').hidden=true;
    $('guideFab').hidden=false;
    document.body.classList.remove('guide-open');
  }
  $('guideStart').addEventListener('click',openGuide);
  $('guideFab').addEventListener('click',openGuide);
  $('guideClose').addEventListener('click',closeGuide);
  $('guideFinish').addEventListener('click',closeGuide);
  $('guidePrev').addEventListener('click',()=>showGuideStep(guideIndex-1));
  $('guideNext').addEventListener('click',()=>guideIndex===GUIDE_STEPS.length-1?showGuideStep(0):showGuideStep(guideIndex+1));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&guideActive)closeGuide();});

  function bindEvents(){
    $('refreshNow').addEventListener('click',()=>refreshDashboard(true));
    $('artifactsLink').addEventListener('click',()=>{if(activeRun?.html_url)window.open(activeRun.html_url+'#artifacts','_blank','noopener');});
  }
  loadSessionToken();setLevel('deep');bindEvents();refreshDashboard(true);
  refreshTimer=setInterval(()=>refreshDashboard(false),12000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDashboard(true);});
})();
