'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('inspector/index.html','utf8');
const app=fs.readFileSync('inspector/app.js','utf8');
const css=fs.readFileSync('inspector/style.css','utf8');
const runner=fs.readFileSync('scripts/run-unified-inspector.mjs','utf8');
const previewReport=fs.readFileSync('scripts/create_hrafn_ab_report.py','utf8');
new vm.Script(app,{filename:'inspector/app.js'});
for(const marker of [
 'Rápido','Completo','Profundo','id="launchButton"','id="githubToken"',
 'id="compareRange"','id="differenceToggle"','id="radarSvg"','id="telemetryGrid"',
 'id="technicalJson"','style.css','app.js'
])assert.ok(html.includes(marker),'Missing Inspector Center UI element: '+marker);
for(const marker of [
 "actions/workflows/'+WORKFLOW+'/dispatches","workflow_dispatch","sessionStorage.setItem",
 "inspector-status","clipPath","differenceImage","medianFps","medianWorldUpdateCpuMs",
 "renderRadar","structuralCandidates","bottomAboveTerrainMeters","habitableStructures",
 "Amanecer","Mediodía","Atardecer","Noche"
])assert.ok(app.includes(marker),'Missing Inspector Center application feature: '+marker);
assert.ok(!app.includes('localStorage'),'The dashboard must not persist GitHub tokens in localStorage.');
assert.ok(app.includes('Authorization:\'Bearer \'+currentToken'),'The token must be sent only in the direct GitHub API request.');
assert.ok(app.includes('Actions:')===false,'Permission guidance stays in the authored UI, not in untrusted API data.');
for(const marker of ['@media(max-width:720px)','compare-stage','radar-map','metric-card','prefers-reduced-motion'])assert.ok(css.includes(marker),'Missing responsive visual system: '+marker);
assert.ok(runner.includes('publishComparisonPreviews'),'Unified inspector must publish web-readable A/B previews.');
assert.ok(runner.includes('m.islands||[]'),'The 13-island inventory must be included in the published run manifest.');
assert.ok(runner.includes('m.habitableStructures||[]'),'The radar needs measured structure grounding details.');
for(const phase of ['dawn','noon','dusk','midnight'])assert.ok(previewReport.includes('phase_id + "-before.jpg"')||previewReport.includes('phase_id + "-" + label + ".jpg"'),'Missing compressed visual previews.');
assert.ok(previewReport.includes('preview_width = 480'),'Preview publication must use bounded image sizes.');
assert.ok(!/gh[pousr]_[A-Za-z0-9_]{20,}/.test(html+app),'No GitHub credential may be embedded in the static dashboard.');
console.log('Inspector Center visual dashboard, direct launch, secure token handling, A/B previews and island radar contract: OK');
