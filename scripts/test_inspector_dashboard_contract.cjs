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
const referencedIds=app.split("$('").slice(1).map(part=>part.split("'")[0]);
for(const id of new Set(referencedIds))assert.ok(html.includes('id=\"'+id+'\"'),'Missing DOM element referenced by app.js: '+id);
for(const marker of [
 'Rápido','Completo','Profundo','id="launchButton"','id="githubToken"',
 'id="compareRange"','id="differenceToggle"','id="radarSvg"','id="telemetryGrid"',
 'id="technicalJson"','id="guideStart"','id="guideFab"','id="guidePanel"','id="guideStepTitle"','id="guideNext"','id="guidePrev"','id="guideClose"','id="guideFinish"','id="performanceChart"','id="memoryChart"','id="performanceSummary"','id="memorySummary"','style.css','app.js'
])assert.ok(html.includes(marker),'Missing Inspector Center UI element: '+marker);
for(const marker of [
 "actions/workflows/'+WORKFLOW+'/dispatches","workflow_dispatch","sessionStorage.setItem",
 "inspector-status","clipPath","differenceImage","medianFps","medianWorldUpdateCpuMs",
 "renderRadar","custom?.structures","bottomAboveTerrainMeters","habitableStructures",
 "Amanecer","Mediodía","Atardecer","Noche","renderPerformanceGraph","renderMemoryGraph","heapUsedMB","/39 estructuras detectadas"
])assert.ok(app.includes(marker),'Missing Inspector Center application feature: '+marker);
assert.ok(!app.includes('localStorage'),'The dashboard must not persist GitHub tokens in localStorage.');
assert.ok(app.includes('Authorization:\'Bearer \'+currentToken'),'The token must be sent only in the direct GitHub API request.');
assert.ok(app.includes("$('runArtifactsLink').href=run.html_url?")&&app.includes("run.html_url+'#artifacts'"),'The evidence link must open the active run artifacts.');
assert.ok(app.includes("const jobsInterval=run.status==='in_progress'?12000:30000"),'Active runs must refresh real GitHub job steps every 12 seconds.');
assert.ok(app.includes("$('progressValue').textContent=indeterminate?'En curso':percent+'%'"),'A single long-running step must not be displayed as a misleading 0%.');
assert.ok(app.includes("v!==null&&v!==undefined&&v!==''")&&app.includes("raw===null||raw===undefined||raw===''"),'Missing telemetry values must remain unavailable, never be plotted as zero.');
assert.ok(app.includes("running.name==='Run the single unified inspector'"),'The monolithic inspector phase must use indeterminate progress, not a misleading percentage.');
assert.ok(app.includes("step.conclusion==='failure'||step.conclusion==='cancelled'"),'Cancelled GitHub steps must not be rendered as successful.');
assert.ok(app.includes('Esperando datos verificables'),'Missing job data must be explained without inventing progress.');
assert.ok(css.includes('.progress-track span.indeterminate'),'The dashboard needs a visible indeterminate progress animation.');
for(const marker of ['@media(max-width:720px)','guide-panel','guide-focus','guide-fab','phase-placeholder','compare-stage','radar-map','metric-card','chart-card','chart-target','chart-help','prefers-reduced-motion'])assert.ok(css.includes(marker),'Missing responsive visual system: '+marker);
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
assert.ok((app.match(/target:'#(?:overview|control|telemetria|radar|comparativa)|target:'.run-panel|target:'.tokenDetails'/g)||[]).length>=7,'The guided tour must explain every major Inspector section.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'La prueba aún está trabajando."),'Empty performance charts must explain that the inspection is still running.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'Las imágenes aún se están preparando."),'An empty comparison must distinguish waiting from a failed/missing result.');
assert.ok(app.includes("activeRun?.status==='in_progress'?'El inspector aún no ha llegado al inventario del mundo."),'The radar must explain when its data is still being collected.');
console.log('Inspector Center guided-tour, plain-language states, visual dashboard, secure launch and evidence contracts: OK');
