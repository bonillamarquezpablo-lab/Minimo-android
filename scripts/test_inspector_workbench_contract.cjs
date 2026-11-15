"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("inspector/index.html","utf8");
const js=fs.readFileSync("inspector/unified-workbench.js","utf8");
const css=fs.readFileSync("inspector/unified-workbench.css","utf8");
new Function(js);
for(const id of ["diagnostico-en-vivo","telemetria","mundo","radar","comparativa","inteligencia-npc","patrulla-exploradores","control"])
  assert.ok(html.includes('id="'+id+'"'),"Existing Inspector capability must remain: "+id);
assert.ok(js.includes('id="wbReportSpecialists"'),"Unified report must include specialist findings.");
assert.ok(js.includes("function renderSpecialistIntelligence") && js.includes("function buildSpecialistIntelligence"),"Specialist findings must be rendered and hydrated from the shared memory.");
assert.ok(js.includes("API.remember") && js.includes("specialistIntelligence"),"The report must persist per-session specialist diagnoses and export them.");
assert.ok(js.includes("automaticCodeChanges: false") || js.includes("No cambian el mundo"),"Specialist analysis must remain read-only.");
for(const id of ["wbReportMetrics","wbReportVerdict","wbReportIntegrity","wbReportActions","wbReportFindings","wbReportJson","wbReportImport","wbReportSpecialists","wbSpecialistSummary","wbSpecialistCards"])
  assert.ok(js.includes(id),"Unified report view missing: "+id);
for(const marker of ["workbench-tabs","workbench-deck","scroll-snap-type:x mandatory","overflow-x:auto","wb-report-metrics"])
  assert.ok(css.includes(marker),"Horizontal unified layout missing: "+marker);
for(const marker of ["sampleCoverage","gpuProfilerEnabled","drawCallsCounterSemantics","finalWorldInspection","longTasks","grassInstances","activeWorldShadowCasters"])
  assert.ok(js.includes(marker),"Advanced report analysis missing: "+marker);
assert.ok(js.includes("No se usa para decidir qué optimizar hasta calibrar el contador"),"Unverified draw-call counters must not guide optimization.");
assert.ok(js.includes("La mediana del percentil 95 por ventana"),"The report must explain frame-time percentiles in plain language.");
console.log("Unified horizontal Inspector workbench + understandable advanced session report: PASS");