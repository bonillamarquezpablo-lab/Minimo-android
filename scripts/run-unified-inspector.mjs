#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT=process.cwd();
const ARTIFACTS=path.resolve('artifacts');
const OUT=path.join(ARTIFACTS,'unified-inspector');
const BASE_URL=process.env.INSPECTOR_TEST_URL||process.env.CAPTURE_TEST_URL||'http://127.0.0.1:4175/';
const PLAN=process.env.CAPTURE_PLAN_JSON||fs.readFileSync(path.join(ROOT,'scripts/scene-capture-plan.json'),'utf8');
const phases=[];
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
function runNodePhase(name,script,env={},timeoutMs=25*60*1000){
  return new Promise(resolve=>{
    const row={name,script,startedAt:new Date().toISOString(),status:'running',durationMs:null,exitCode:null,error:null};
    phases.push(row);writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});
    console.log('\n[UNIFIED_INSPECTOR] START '+name+' — '+script);
    const phaseStarted=Date.now();
    let child;
    try{child=spawn(process.execPath,[script],{cwd:ROOT,env:{...process.env,...env},stdio:'inherit'});}
    catch(error){row.status='failed';row.error=String(error?.stack||error);row.durationMs=Date.now()-phaseStarted;writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});return resolve(row);}
    let settled=false;
    const finish=(status,code,error=null)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      Object.assign(row,{status,exitCode:code,error,finishedAt:new Date().toISOString(),durationMs:Date.now()-phaseStarted});
      writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});
      console.log('[UNIFIED_INSPECTOR] END '+name+' — '+status+' ('+row.durationMs+' ms)');
      resolve(row);
    };
    const timer=setTimeout(()=>{
      try{child.kill('SIGTERM');}catch{}
      finish('timed_out',null,'Exceeded phase timeout of '+timeoutMs+' ms.');
    },timeoutMs);
    child.once('error',error=>finish('failed',null,String(error?.stack||error)));
    child.once('close',(code,signal)=>finish(code===0?'passed':'failed',code,code===0?null:'exit='+code+' signal='+(signal||'none')));
  });
}
function runPythonPhase(name,script,arg,timeoutMs=5*60*1000){
  return new Promise(resolve=>{
    const row={name,script,startedAt:new Date().toISOString(),status:'running',durationMs:null,exitCode:null,error:null};
    phases.push(row);
    const phaseStarted=Date.now();
    const child=spawn(process.env.PYTHON||'python3',[script,arg],{cwd:ROOT,env:process.env,stdio:'inherit'});
    let settled=false;
    const finish=(status,code,error=null)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      Object.assign(row,{status,exitCode:code,error,finishedAt:new Date().toISOString(),durationMs:Date.now()-phaseStarted});
      writeJson(path.join(OUT,'manifest.json'),{schema:1,startedAt,phases,finishedAt:null});
      resolve(row);
    };
    const timer=setTimeout(()=>{try{child.kill('SIGTERM');}catch{}finish('timed_out',null,'Python report timeout');},timeoutMs);
    child.once('error',error=>finish('failed',null,String(error?.stack||error)));
    child.once('close',(code,signal)=>finish(code===0?'passed':'failed',code,code===0?null:'exit='+code+' signal='+(signal||'none')));
  });
}
function summaryFrom(file,selector){
  try{return selector(JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')));}catch{return null;}
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const common={PLAYER_TEST_URL:BASE_URL,CAPTURE_TEST_URL:BASE_URL,STRUCTURE_TEST_URL:BASE_URL,COASTAL_TEST_URL:BASE_URL};
  await runNodePhase('Arranque del juego y modelo vikingo real','scripts/player-startup-smoke.mjs',common,20*60*1000);
  await runNodePhase('Texturas, carga y preparación de cámara','scripts/texture-readiness-smoke.mjs',{...common,CAPTURE_PLAN_JSON:PLAN,CAPTURE_TEXTURE_TIMEOUT_MS:'20000',CAPTURE_CANVAS_TIMEOUT_MS:'15000',CAPTURE_CDP_TIMEOUT_MS:'8000'},15*60*1000);
  await runNodePhase('Cimentación, estructuras y simulación de reparación en entorno desechable','scripts/coastal-structure-grounding-smoke.mjs',common,15*60*1000);
  await runNodePhase('Referencias costeras, agua, visibilidad y capturas de entorno','scripts/coastal-reference.mjs',common,35*60*1000);
  await runNodePhase('Inventario completo, identidades y cámaras desde el agua','scripts/custom-scene-capture.mjs',{...common,CAPTURE_PLAN_JSON:PLAN},35*60*1000);
  await runPythonPhase('Informe visual unificado de estructuras','scripts/create_scene_capture_contact_sheet.py','artifacts/custom-scene-captures');
  await runPythonPhase('Lámina de referencias costeras','scripts/create_coastal_contact_sheet.py','artifacts/coastal-reference');

  const custom=summaryFrom('artifacts/custom-scene-captures/manifest.json',m=>({
    build:m.build,counts:m.auditSummary,structures:m.initialPhysicalAudit?.structuralCandidates||[],
    inspectionErrors:m.initialPhysicalAudit?.errors||{},shots:{planned:m.expandedShotCount,captured:m.captures?.length,failed:m.failures?.length},
    zones:m.zoneInspections,readiness:m.readiness,textures:m.initialPhysicalAudit?.textures,water:m.initialPhysicalAudit?.water,environment:m.initialPhysicalAudit?.environment
  }));
  const texture=summaryFrom('artifacts/texture-readiness-smoke/manifest.json',m=>({verdict:m.verdict,readiness:m.readiness,textureDiagnostics:m.textureDiagnostics,failure:m.failure}));
  const grounding=summaryFrom('artifacts/structure-grounding/manifest.json',m=>({verdict:m.verdict,summary:m.summary,failure:m.failure}));
  const coastal=summaryFrom('artifacts/coastal-reference/manifest.json',m=>({captureCount:m.captures?.length,structureVisibility:m.structureVisibility?.length,failure:m.failure}));
  const player=summaryFrom('artifacts/player-startup/manifest.json',m=>({modelReady:m.finalState?.modelReady,realPlayerMeshCount:m.finalState?.realPlayerMeshCount,failure:m.failure}));
  const report={
    schema:1,mode:'single-entrypoint-multi-phase-inspection',readOnlyForMainCapture:true,
    note:'Las comprobaciones de reparación se ejecutan en navegadores de prueba desechables; no modifican la partida ni los archivos publicados.',
    startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-started,
    baseUrl:BASE_URL,phases,results:{player,texture,grounding,coastal,custom},
    files:[
      'player-startup/manifest.json','texture-readiness-smoke/manifest.json',
      'structure-grounding/manifest.json','coastal-reference/manifest.json',
      'custom-scene-captures/manifest.json','custom-scene-captures/inspection-report.md',
      'custom-scene-captures/contact-sheet.png','custom-scene-captures/vision-review-index.json'
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
  const failures=phases.filter(row=>row.status!=='passed');
  console.log('\n[UNIFIED_INSPECTOR_RESULT] '+JSON.stringify({verdict:failures.length?'issues-found':'pass',passed:phases.length-failures.length,failed:failures.length,structures:custom?.structures?.length??null,captures:custom?.shots??null}));
  if(failures.length)process.exitCode=2;
}
main().catch(error=>{console.error('[UNIFIED_INSPECTOR_FATAL]',error);process.exitCode=1;});
