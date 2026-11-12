#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT=process.cwd();
const ARTIFACTS=path.resolve('artifacts');
const OUT=path.join(ARTIFACTS,'unified-inspector');
const BASE_URL=process.env.INSPECTOR_TEST_URL||process.env.CAPTURE_TEST_URL||'http://127.0.0.1:4175/';
const HRAFN_BEFORE_URL=process.env.HRAFN_BEFORE_URL||'';
const HRAFN_AFTER_URL=process.env.HRAFN_AFTER_URL||'';
const PLAN=process.env.CAPTURE_PLAN_JSON||fs.readFileSync(path.join(ROOT,'scripts/scene-capture-plan.json'),'utf8');
const phases=[];
const INSPECTOR_LEVEL=process.env.INSPECTOR_LEVEL||'deep';
const LEVEL_RANK={quick:1,complete:2,deep:3};
if(!(INSPECTOR_LEVEL in LEVEL_RANK))throw new Error('INSPECTOR_LEVEL must be quick, complete or deep.');
function phaseLevel(name){
  if(/Comparación visual ANTES\/DESPUÉS|Informe visual ANTES\/DESPUÉS/.test(name))return 3;
  if(/Referencias costeras|Inventario completo|Informe visual unificado|Lámina de referencias/.test(name))return 2;
  return 1;
}
const startedAt=new Date().toISOString();
const started=Date.now();

function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temporary,file);
}
function readJson(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
function signalChildProcessTree(child,signal){
  if(process.platform!=='win32'&&Number.isInteger(child?.pid)){
    try{process.kill(-child.pid,signal);return true;}
    catch(error){if(error?.code!=='ESRCH')throw error;}
  }
  try{return !!child?.kill(signal);}catch{return false;}
}
function runNodePhase(name,script,env={},timeoutMs=25*60*1000){
  return new Promise(resolve=>{
    const row={name,script,startedAt:new Date().toISOString(),status:'running',durationMs:null,exitCode:null,error:null};
    phases.push(row);
    if(phaseLevel(name)>LEVEL_RANK[INSPECTOR_LEVEL]){Object.assign(row,{status:'skipped',finishedAt:new Date().toISOString(),durationMs:0,error:'Not required by '+INSPECTOR_LEVEL+' inspection level.'});writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,level:INSPECTOR_LEVEL,phases,finishedAt:null});console.log('[UNIFIED_INSPECTOR] SKIP '+name+' — level '+INSPECTOR_LEVEL);return resolve(row);}
    writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,level:INSPECTOR_LEVEL,phases,finishedAt:null});
    console.log('\\n[UNIFIED_INSPECTOR] START '+name+' — '+script);
    const phaseStarted=Date.now();
    let child;
    try{child=spawn(process.execPath,[script],{cwd:ROOT,env:{...process.env,...env},stdio:'inherit',detached:process.platform!=='win32'});}
    catch(error){row.status='failed';row.error=String(error?.stack||error);row.durationMs=Date.now()-phaseStarted;writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});return resolve(row);}
    let settled=false,timedOut=false,timer=null,forceTimer=null,finalTimer=null;
    const timeoutMessage='Exceeded phase timeout of '+timeoutMs+' ms.';
    const finish=(status,code,error=null)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);clearTimeout(forceTimer);clearTimeout(finalTimer);
      Object.assign(row,{status,exitCode:code,error,finishedAt:new Date().toISOString(),durationMs:Date.now()-phaseStarted});
      writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});
      console.log('[UNIFIED_INSPECTOR] END '+name+' — '+status+' ('+row.durationMs+' ms)');
      resolve(row);
    };
    timer=setTimeout(()=>{
      timedOut=true;
      console.error('[UNIFIED_INSPECTOR] TIMEOUT '+name+' — sending SIGTERM to its process tree.');
      try{signalChildProcessTree(child,'SIGTERM');}
      catch(error){finish('timed_out',null,timeoutMessage+' SIGTERM failed: '+String(error?.message||error));return;}
      forceTimer=setTimeout(()=>{
        console.error('[UNIFIED_INSPECTOR] FORCE STOP '+name+' — sending SIGKILL.');
        try{signalChildProcessTree(child,'SIGKILL');}catch(_){}
        finalTimer=setTimeout(()=>finish('timed_out',null,timeoutMessage+' The child did not close after SIGKILL.'),2000);
      },5000);
    },timeoutMs);
    child.once('error',error=>finish(timedOut?'timed_out':'failed',null,timedOut?timeoutMessage+' '+String(error?.stack||error):String(error?.stack||error)));
    child.once('close',(code,signal)=>finish(
      timedOut?'timed_out':code===0?'passed':'failed',
      timedOut?null:code,
      timedOut?timeoutMessage+' Child terminated with '+(signal||'an unknown signal')+'.':code===0?null:'exit='+code+' signal='+(signal||'none')
    ));
  });
}
function runPythonPhase(name,script,arg,timeoutMs=5*60*1000){
  return new Promise(resolve=>{
    const row={name,script,startedAt:new Date().toISOString(),status:'running',durationMs:null,exitCode:null,error:null};
    phases.push(row);
    if(phaseLevel(name)>LEVEL_RANK[INSPECTOR_LEVEL]){Object.assign(row,{status:'skipped',finishedAt:new Date().toISOString(),durationMs:0,error:'Not required by '+INSPECTOR_LEVEL+' inspection level.'});writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,level:INSPECTOR_LEVEL,phases,finishedAt:null});console.log('[UNIFIED_INSPECTOR] SKIP '+name+' — level '+INSPECTOR_LEVEL);return resolve(row);}
    const phaseStarted=Date.now();
    const child=spawn(process.env.PYTHON||'python3',[script,arg],{cwd:ROOT,env:process.env,stdio:'inherit',detached:process.platform!=='win32'});
    let settled=false,timedOut=false,timer=null,forceTimer=null,finalTimer=null;
    const finish=(status,code,error=null)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);clearTimeout(forceTimer);clearTimeout(finalTimer);
      Object.assign(row,{status,exitCode:code,error,finishedAt:new Date().toISOString(),durationMs:Date.now()-phaseStarted});
      writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});
      resolve(row);
    };
    timer=setTimeout(()=>{
      timedOut=true;
      console.error('[UNIFIED_INSPECTOR] TIMEOUT '+name+' — sending SIGTERM to its process tree.');
      try{signalChildProcessTree(child,'SIGTERM');}catch(_){}
      forceTimer=setTimeout(()=>{
        console.error('[UNIFIED_INSPECTOR] FORCE STOP '+name+' — sending SIGKILL.');
        try{signalChildProcessTree(child,'SIGKILL');}catch(_){}
        finalTimer=setTimeout(()=>finish('timed_out',null,'Python report timeout; child tree did not close after SIGKILL.'),2000);
      },5000);
    },timeoutMs);
    child.once('error',error=>finish('failed',null,String(error?.stack||error)));
    child.once('close',(code,signal)=>finish(
      timedOut?'timed_out':code===0?'passed':'failed',
      timedOut?null:code,
      timedOut?'Python report timeout; child terminated with '+(signal||'an unknown signal')+'.':code===0?null:'exit='+code+' signal='+(signal||'none')
    ));
  });
}
function summaryFrom(file,selector){
  try{return selector(JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')));}catch{return null;}
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const common={PLAYER_TEST_URL:BASE_URL,CAPTURE_TEST_URL:BASE_URL,STRUCTURE_TEST_URL:BASE_URL,COASTAL_TEST_URL:BASE_URL};
  await runNodePhase('Arranque del juego y modelo vikingo real','scripts/player-startup-smoke.mjs',common,20*60*1000);
  await runNodePhase('Texturas, carga y preparación de cámara','scripts/texture-readiness-smoke.mjs',{...common,CAPTURE_PLAN_JSON:PLAN,CAPTURE_TEXTURE_TIMEOUT_MS:'30000',CAPTURE_CANVAS_TIMEOUT_MS:'15000',CAPTURE_CDP_TIMEOUT_MS:'8000',CAPTURE_SKIP_TEXTURE_SCREENSHOT:'1'},10*60*1000);
  await runNodePhase('Cimentación, estructuras y simulación de reparación en entorno desechable','scripts/coastal-structure-grounding-smoke.mjs',common,15*60*1000);
  await runNodePhase('Referencias costeras, agua, visibilidad y capturas de entorno','scripts/coastal-reference.mjs',common,35*60*1000);
  await runNodePhase('Inventario completo, identidades y cámaras desde el agua','scripts/custom-scene-capture.mjs',{...common,CAPTURE_PLAN_JSON:PLAN},20*60*1000);
  await runPythonPhase('Informe visual unificado de estructuras','scripts/create_scene_capture_contact_sheet.py','artifacts/custom-scene-captures');
  await runPythonPhase('Lámina de referencias costeras','scripts/create_coastal_contact_sheet.py','artifacts/coastal-reference');

  // The A/B comparator is a mandatory phase of this one-entrypoint inspection.
  // Missing baseline/candidate URLs fail the inspector instead of silently skipping the comparison.
  await runNodePhase('Comparación visual ANTES/DESPUÉS — cuatro fases horarias','scripts/hrafn-before-after.mjs',{
    HRAFN_BEFORE_URL,HRAFN_AFTER_URL,
    HRAFN_COMPARE_OUT:'artifacts/hrafn-before-after',
    HRAFN_CAPTURE_SEED:process.env.CAPTURE_SEED||'20261110'
  },35*60*1000);
  await runPythonPhase('Informe visual ANTES/DESPUÉS y mapas de diferencias','scripts/create_hrafn_ab_report.py','artifacts/hrafn-before-after');

  const custom=summaryFrom('artifacts/custom-scene-captures/manifest.json',m=>({
    build:m.build,counts:m.auditSummary,structures:m.initialPhysicalAudit?.structuralCandidates||[],
    inspectionErrors:m.initialPhysicalAudit?.errors||{},shots:{planned:m.expandedShotCount,captured:m.captures?.length,failed:m.failures?.length},
    zones:m.zoneInspections,readiness:m.readiness,textures:m.initialPhysicalAudit?.textures,water:m.initialPhysicalAudit?.water,environment:m.initialPhysicalAudit?.environment
  }));
  const texture=summaryFrom('artifacts/texture-readiness-smoke/manifest.json',m=>({verdict:m.verdict,readiness:m.readiness,textureDiagnostics:m.textureDiagnostics,cameraVerification:m.cameraVerification,actualCamera:m.actualCamera,failure:m.failure}));
  const grounding=summaryFrom('artifacts/structure-grounding/manifest.json',m=>({verdict:m.verdict,summary:m.summary,failure:m.failure}));
  const coastal=summaryFrom('artifacts/coastal-reference/manifest.json',m=>({captureCount:m.captures?.length,atmosphereAudit:m.atmosphereAudit,atmosphereCaptureCount:m.atmosphereCaptures?.length,structureVisibility:m.structureVisibility?.length,failure:m.failure}));
  const player=summaryFrom('artifacts/player-startup/manifest.json',m=>({modelReady:m.finalState?.modelReady,realPlayerMeshCount:m.finalState?.realPlayerMeshCount,failure:m.failure}));
  const beforeAfter=summaryFrom('artifacts/hrafn-before-after/manifest.json',m=>({method:m.method,seed:m.captureSeed,phases:m.phases?.map(p=>({id:p.id,hour:p.hour,comparison:p.comparison||null})),warnings:m.warnings,failure:m.failure}));
  const report={
    schema:1,mode:'tiered-single-entrypoint-inspection',level:INSPECTOR_LEVEL,readOnlyForMainCapture:true,
    note:'Las comprobaciones de reparación se ejecutan en navegadores de prueba desechables; no modifican la partida ni los archivos publicados.',
    startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-started,
    baseUrl:BASE_URL,phases,results:{player,texture,grounding,coastal,custom,beforeAfter},
    files:[
      'player-startup/manifest.json','texture-readiness-smoke/manifest.json',
      'structure-grounding/manifest.json','coastal-reference/manifest.json',
      'custom-scene-captures/manifest.json','custom-scene-captures/inspection-report.md',
      'custom-scene-captures/contact-sheet.png','custom-scene-captures/vision-review-index.json',
      'hrafn-before-after/manifest.json','hrafn-before-after/report.md',
      'hrafn-before-after/before/','hrafn-before-after/after/',
      'hrafn-before-after/comparison-dawn.jpg','hrafn-before-after/comparison-noon.jpg',
      'hrafn-before-after/comparison-dusk.jpg','hrafn-before-after/comparison-midnight.jpg',
      'hrafn-before-after/difference-dawn.png','hrafn-before-after/difference-noon.png',
      'hrafn-before-after/difference-dusk.png','hrafn-before-after/difference-midnight.png'
    ]
  };
  writeJson(path.join(OUT,'manifest.json'),report);
  const lines=[
    '# EL SIN NOMBRE — Inspector único','',
    '- Una sola entrada ejecuta todas las comprobaciones y capturas.',
    '- La inspección principal del mundo es de solo lectura: no mueve, oculta ni elimina construcciones.',
    '- Las pruebas de reparación se ejecutan en un navegador de prueba independiente y desechable.',
    '- Build: **'+(custom?.build||texture?.readiness?.build||'no disponible')+'**',
    '- Duración: **'+report.durationMs+' ms**','',
    '## Resultado de cada fase','','| Fase | Estado | Duración | Código |','|---|---|---:|---:|'
  ];
  for(const row of phases)lines.push('| '+row.name+' | '+row.status+' | '+(row.durationMs??'—')+' ms | '+(row.exitCode??'—')+' |');
  lines.push('','## Inventario de estructuras','',
    '- Islas: **'+(custom?.counts?.islands??'no disponible')+'**',
    '- Objetos estructurales candidatos: **'+(custom?.structures?.length??'no disponible')+'**',
    '- Cabañas registradas: **'+(custom?.counts?.huts??'no disponible')+'**',
    '- Campamentos: **'+(custom?.counts?.camps??'no disponible')+'**',
    '- Guarniciones: **'+(custom?.counts?.garrisons??'no disponible')+'**',
    '- Texturas pendientes detectadas: **'+(custom?.textures?.readiness?.pendingTextures?.length??'no disponible')+'**',
    '- Cámaras: **'+(custom?.shots?.captured??0)+' / '+(custom?.shots?.planned??0)+'**',
    '- Fallos de cámara: **'+(custom?.shots?.failed??0)+'**','',
    '## Comparación visual antes/después','',
    '- Fases capturadas: **'+(beforeAfter?.phases?.length??0)+' / 4**',
    '- Semilla compartida: **'+(beforeAfter?.seed??'no disponible')+'**',
    '- Informe: **artifacts/hrafn-before-after/report.md**','',
    '## Lista de estructuras detectadas','','| Código | ID interno | Nombre | Tipo | Isla | X | Y | Z | Mallas |',
    '|---|---:|---|---|---|---:|---:|---:|---:|'
  );
  for(const item of (custom?.structures||[])){
    const p=item.position||{};
    lines.push('| '+(item.code||'—')+' | '+(item.nativeId??item.uniqueId??'—')+' | '+String(item.name||'sin nombre').replaceAll('|','/')+' | '+(item.kind||item.structuralRole||'sin clasificar')+' | '+(item.island||'sin isla')+' | '+(p.x??'—')+' | '+(p.y??'—')+' | '+(p.z??'—')+' | '+(item.meshCount??'—')+' |');
  }
  lines.push('','## Archivos de salida','',...report.files.map(file=>'- artifacts/'+file),'',
    '## Observaciones','',
    '- Cada estructura conserva su código, nombre, ID interno si está disponible, isla, coordenadas y geometría.',
    '- Las estructuras que no se puedan clasificar quedan como candidatas pendientes; no se descartan silenciosamente.',
    '- Un resultado fallido o incompleto se conserva en el informe y en el manifiesto.'
  );
  fs.writeFileSync(path.join(OUT,'inspection-report.md'),lines.join('\n')+'\n');
  console.log('[TEXTURE_READINESS_SUMMARY] '+JSON.stringify(texture));
  const failures=phases.filter(row=>row.status!=='passed'&&row.status!=='skipped');
  console.log('\n[UNIFIED_INSPECTOR_RESULT] '+JSON.stringify({verdict:failures.length?'issues-found':'pass',passed:phases.filter(row=>row.status==='passed').length,skipped:phases.filter(row=>row.status==='skipped').length,failed:failures.length,structures:custom?.structures?.length??null,captures:custom?.shots??null}));
  if(failures.length)process.exitCode=2;
}
main().catch(error=>{console.error('[UNIFIED_INSPECTOR_FATAL]',error);process.exitCode=1;});
