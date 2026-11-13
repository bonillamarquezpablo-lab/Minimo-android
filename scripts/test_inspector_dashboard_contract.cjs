'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('inspector/index.html','utf8');
const app=fs.readFileSync('inspector/app.js','utf8');
const css=fs.readFileSync('inspector/style.css','utf8');
const runner=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const sampler=fs.readFileSync('scripts/hrafn-before-after.mjs','utf8');
const previewReport=fs.readFileSync('scripts/create_hrafn_ab_report.py','utf8');
new vm.Script(app,{filename:'inspector/app.js'});
const sectionOrder=['control','telemetria','radar','comparativa'].map(id=>html.indexOf('<section class="section" id="'+id+'">'));
assert.ok(sectionOrder.every((position,index)=>position>=0&&(index===0||position>sectionOrder[index-1])),'The actual page sections must follow the guided-tour order: operations, graphs, island radar, comparison.');
for(const [id,label] of [['control','01 · OPERACIONES'],['telemetria','02 · GRÁFICAS'],['radar','03 · MAPA DEL MUNDO'],['comparativa','04 · EVIDENCIA VISUAL']]){
 const start=html.indexOf('<section class="section" id="'+id+'">');
 const next=html.indexOf('</section>',start);
 assert.ok(html.slice(start,next).includes(label),'Incorrect visual section number for '+id);
}
const referencedIds=app.split("$('").slice(1).map(part=>part.split("'")[0]);
for(const id of new Set(referencedIds))assert.ok(html.includes('id=\"'+id+'\"'),'Missing DOM element referenced by app.js: '+id);
for(const marker of [
 'Rápido','Completo','Profundo','id="launchButton"','id="githubToken"',
 'id="compareRange"','id="differenceToggle"','id="radarSvg"','id="telemetryGrid"',
 'id="technicalJson"','id="guideFab"','id="guidePanel"','id="guideStepTitle"','id="guideNext"','id="guidePrev"','id="guideClose"','id="guideFinish"','id="runPhaseStatus"','id="evidenceGrid"','id="evidenceStatus"','id="startInGithub"','id="performanceChart"','id="memoryChart"','id="performanceSummary"','id="memorySummary"','style.css','app.js'
])assert.ok(html.includes(marker),'Missing Inspector Center UI element: '+marker);
for(const marker of [
 "actions/workflows/'+WORKFLOW+'/dispatches","workflow_dispatch","sessionStorage.setItem",
 "inspector-status","clipPath","differenceImage","medianFps","medianWorldUpdateCpuMs","GITHUB_WORKFLOW","openGithubWorkflow","startInGithub","renderEvidence","evidenceGrid","safeEvidenceUrl","phaseGuide",
 "renderRadar","custom?.structures","bottomAboveTerrainMeters","habitableStructures",
 "Amanecer","Mediodía","Atardecer","Noche","renderPerformanceGraph","renderMemoryGraph","heapUsedMB","/39 estructuras detectadas"
])assert.ok(app.includes(marker),'Missing Inspector Center application feature: '+marker);
assert.ok(!app.includes('localStorage'),'The dashboard must not persist GitHub tokens in localStorage.');
assert.ok(app.includes('Authorization:\'Bearer \'+currentToken'),'The token must be sent only in the direct GitHub API request.');
assert.ok(app.includes("$('runArtifactsLink').href=run.html_url?")&&app.includes("run.html_url+'#artifacts'"),'The full evidence archive must remain reachable.');
assert.ok(app.includes("if(!currentToken){openGithubWorkflow();return;}")&&app.includes("window.open(GITHUB_WORKFLOW"),'A no-token user must be able to start from GitHub without creating a personal access token.');
assert.ok(app.includes("$('evidenceGrid').innerHTML=cards")&&app.includes('previews[phase.id]'),'The run card must render available before/after previews inline.');
assert.ok(app.includes("const jobsInterval=run.status==='in_progress'?12000:30000"),'Active runs must refresh real GitHub job steps every 12 seconds.');
assert.ok(app.includes("$('progressValue').textContent=indeterminate?'↻':percent+'%'"),'The progress ring must use a compact activity symbol, not a long status phrase.');
assert.ok(app.includes("runningGuide.title")&&app.includes("runningGuide.detail")&&app.includes('Tiempo en esta fase'),'The status panel must explain the active phase and elapsed time.');
assert.ok(app.includes("v!==null&&v!==undefined&&v!==''")&&app.includes("raw===null||raw===undefined||raw===''"),'Missing telemetry values must remain unavailable, never be plotted as zero.');
assert.ok(app.includes("running.name==='Run the single unified inspector'"),'The monolithic inspector phase must use indeterminate progress, not a misleading percentage.');
assert.ok(app.includes("step.conclusion==='failure'||step.conclusion==='cancelled'"),'Cancelled GitHub steps must not be rendered as successful.');
assert.ok(app.includes('Esperando datos reales'),'Missing job data must be explained without inventing progress.');
assert.ok(css.includes('.progress-track span.indeterminate'),'The dashboard needs a visible indeterminate progress animation.');
for(const marker of ['@media(max-width:720px)','evidence-inline','evidence-pair','progress-ring strong.is-spinning','guide-panel','guide-focus','guide-fab','phase-placeholder','compare-stage','radar-map','metric-card','chart-card','chart-target','chart-help','prefers-reduced-motion'])assert.ok(css.includes(marker),'Missing responsive visual system: '+marker);
assert.ok(runner.includes('publishComparisonPreviews'),'Unified inspector must publish web-readable A/B previews.');
assert.ok(runner.includes('m.islands||[]'),'The 13-island inventory must be included in the published run manifest.');
assert.ok(runner.includes('m.habitableStructures||[]'),'The radar needs measured structure grounding details.');
assert.ok(runner.includes('m.initialPhysicalAudit?.structuralCandidates||[]'),'The radar needs the scene inventory of structural candidates.');
for(const phase of ['dawn','noon','dusk','midnight'])assert.ok(previewReport.includes('phase_id + "-before.jpg"')||previewReport.includes('phase_id + "-" + label + ".jpg"'),'Missing compressed visual previews.');
assert.ok(previewReport.includes('preview_width = 480'),'Preview publication must use bounded image sizes.');
assert.ok(!/gh[pousr]_[A-Za-z0-9_]{20,}/.test(html+app),'No GitHub credential may be embedded in the static dashboard.');
assert.ok(sampler.includes('heapUsedMB')&&sampler.includes('heapInitialMB')&&sampler.includes('heapPeakMB'),'Performance sampling must capture entry and post-entry JavaScript heap readings.');
assert.ok(sampler.includes('__ELSN_INSPECTOR_HEAP_TRACE')&&sampler.includes('setInterval(capture, 250)'),'The heap chart must sample the entry transition as well as the stable play window.');
assert.ok(sampler.includes('performance.memory'),'Heap memory must be measured only through Chromium performance.memory.');
assert.ok(sampler.includes("value!==null&&value!==undefined&&value!==''"),'Missing heap samples must not be converted to zero.');
assert.ok(app.includes("target:'#control .levels'")&&app.includes("title:'1. Elige la prueba'"),'The guided tour must begin at the first actionable control.');
assert.ok(app.indexOf("title:'1. Elige la prueba'")<app.indexOf("title:'2. Pulsa Iniciar inspección'")&&app.indexOf("title:'2. Pulsa Iniciar inspección'")<app.indexOf("title:'3. Mira cómo trabaja'"),'The guided tour must follow choose, launch, monitor order.');
assert.ok(app.includes("window.scrollTo({top:Math.max(0,top),behavior:'smooth'})"),'Guide navigation must align the selected target below the fixed header.');
assert.ok(html.includes('id="guideFab"')&&html.indexOf('id="guideFab"')<html.indexOf('id="connection"'),'Help control must remain visible in the header.');
assert.ok(app.includes("svg.setAttribute('data-live',String(activeRun?.status==='in_progress'))")&&app.includes('radar-sweep-ring'),'Radar animation must be tied to a real active run and real inventory.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'La prueba aún está trabajando."),'Empty performance charts must explain that the inspection is still running.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'Las imágenes aún se están preparando."),'An empty comparison must distinguish waiting from a failed/missing result.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'El inspector aún no ha llegado al inventario del mundo."),'The radar must explain when its data is still being collected.');
console.log('Inspector Center guided-tour, no-token launch, live phase status, embedded evidence and dashboard contracts: OK');
