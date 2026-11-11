'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const html = fs.readFileSync('index.html', 'utf8');
  const runner = fs.readFileSync('scripts/custom-scene-capture.mjs', 'utf8');
  const plannerSource = fs.readFileSync('scripts/scene-capture-inspection.mjs', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
  const textureSmoke = fs.readFileSync('scripts/texture-readiness-smoke.mjs', 'utf8');
  const unifiedRunner = fs.readFileSync('scripts/run-unified-inspector.mjs', 'utf8');
  const planner = await import('./scene-capture-inspection.mjs');

  assert.match(workflow,/^  pull_request:/m);
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.match(workflow,/^  unified-inspector:/m);
  assert.doesNotMatch(workflow,/^  (texture-smoke|character-startup|custom-capture):/m,
    'All checks must be invoked from one workflow job.');
  assert.doesNotMatch(workflow,/^  push:/m);
  assert.match(workflow,/group: scene-capture-\\$\\{\\{ github\\.event\\.pull_request\\.number \\|\\| github\\.ref \\}\\}/);
  assert.match(workflow,/GITHUB_EVENT_NAME/);
  assert.match(workflow,/workflow_dispatch/);
  assert.doesNotMatch(workflow,/if: false # Phase 1/);

  assert.match(runner,/page\.addInitScript/);
  assert.match(runner,/Math\.imul\(1664525,state\)\+1013904223/);
  assert.match(runner,/prepareCaptureFrame\(\{timeoutMs:120000\}\)/);
  assert.match(runner,/createHash\('sha256'\)/);
  assert.match(runner,/pixelComparison='not-applicable-animated-scene'/);
  assert.match(runner,/const framePng=await page\.evaluate/);
  assert.doesNotMatch(runner,/assert\.equal\(secondHash,firstHash/,'Animated water and vegetation must not be rejected by exact pixel hashes.');
  assert.match(runner,/function writeManifest\(\)/);
  assert.match(runner,/manifest\.lastUpdatedAt/);
  assert.match(runner,/capture-index\.json/);
  assert.match(runner,/cameraReadback/);
  assert.match(runner,/if\(!cameraVerified\)/,'A capture must fail unless the live camera reaches its requested position and target.');
  assert.match(runner,/cameraVerified:prepared\.cameraVerified/,'The camera verification must be saved in the capture manifest.');
  assert.match(runner,/createZoneInspectionShots/);
  assert.match(runner,/__ELSN_TEST__\.inspectScene\(\{inventoryLimit:5000,offshoreLimit:500\}\)/);
  assert.match(runner,/supervisorVisibility=await page\.evaluate/,'The unified scene capture must verify supervisor UI invisibility.');
  assert.match(runner,/visibleDiagnosticElements/,'Visible debug/inspector overlays must be rejected.');
  assert.match(runner,/initialAudit\.errors&&Object\.keys\(initialAudit\.errors\)\.length/,'Any failed scene-inspection section must fail the global capture gate.');
  assert.match(runner,/completeInventory\.returnedCount\)!==Number\(completeInventory\.candidateCount\)/,'The full scene inventory must be untruncated.');
  assert.match(runner,/completeOffshore\.returnedCount\)!==Number\(completeOffshore\.candidateCount\)/,'The offshore structural inventory must be untruncated.');

  assert.match(runner,/assert\.deepEqual\(supervisorVisibility\.visibleDiagnosticElements,\[\]/,'No debug or inspector panel may appear during automated inspection.');
  assert.match(runner,/debugFlagsEnabled/,'The supervisor test must prove debug-only UI flags remain disabled.');

  assert.match(runner,/const rawStructuralCandidates=initialAudit\.structuralCandidates;/,'A missing structural inventory must not be silently converted into an empty list.');
  assert.match(runner,/Array\.isArray\(rawStructuralCandidates\)/,'The read-only scene capture must validate the structural inventory type.');
  assert.match(runner,/completeInventory\.omittedCount\|\|0\)!==0/,'A truncated scene inventory must fail instead of appearing complete.');
  assert.match(runner,/completeOffshore\.omittedCount\|\|0\)!==0/,'A truncated offshore structural inventory must fail instead of appearing complete.');
  assert.match(unifiedRunner,/timedOut=false/,'Timed-out child processes must be tracked separately from ordinary failures.');
  assert.match(unifiedRunner,/detached:process\.platform!==\'win32\'/,'Inspection child processes must have an isolated process group on Unix runners.');
  assert.match(unifiedRunner,/process\.kill\(-child\.pid,signal\)/,'Timeouts must signal the complete child process group, including Chromium.');
  assert.match(unifiedRunner,/signalChildProcessTree\(child,\'SIGKILL\'\)/,'The unified runner must force-stop a child tree that ignores SIGTERM.');
  assert.match(unifiedRunner,/Python report timeout; child terminated/,'Python report phases must wait for termination rather than resolving immediately after SIGTERM.');

  assert.match(unifiedRunner,/scripts\/player-startup-smoke\.mjs/);
  assert.match(unifiedRunner,/scripts\/texture-readiness-smoke\.mjs/);
  assert.match(unifiedRunner,/scripts\/coastal-structure-grounding-smoke\.mjs/);
  assert.match(unifiedRunner,/scripts\/coastal-reference\.mjs/);
  assert.match(unifiedRunner,/scripts\/custom-scene-capture\.mjs/);
  assert.match(unifiedRunner,/Lista de estructuras detectadas/);
  assert.match(textureSmoke,/if\(original\.zone\)/);
  assert.match(textureSmoke,/visualCaptureDeferred===true/);
  assert.match(unifiedRunner,/CAPTURE_SKIP_TEXTURE_SCREENSHOT:'1'/);
  assert.match(textureSmoke,/zone\.observationPoint/);
  assert.doesNotMatch(runner,/api\.(?:auditIslandGeometry|habitableStructureAudit|auditOffshoreStructures|coastalSceneInventory|settlementGrounding)\(/,
    'The runner must call the one unified inspector, not hidden individual audit functions.');
  assert.match(html,/auditOffshoreStructuralRoots\(offshoreLimit\)/);
  assert.match(html,/getCoastalSceneInventory\(inventoryLimit\)/);
  assert.match(unifiedRunner,/create_scene_capture_contact_sheet\.py/,'The single inspector must generate the structure contact sheet.');
  assert.match(fs.readFileSync('scripts/create_scene_capture_contact_sheet.py','utf8'),/inspection-report\.md/);
  assert.match(fs.readFileSync('scripts/create_scene_capture_contact_sheet.py','utf8'),/sceneInspection/);
  assert.match(workflow,/name: 'Inspector único: todas las pruebas, diagnósticos y capturas'/);
  assert.match(workflow,/node scripts\/run-unified-inspector\.mjs/);
  assert.match(workflow,/timeout-minutes: 180/);
  assert.match(workflow,/observationPoint/);
  assert.match(plannerSource,/capturePrefix/);
  assert.doesNotMatch(runner,/repairAndAuditHabitableStructures/,
    'The camera inspection run must not repair or move objects before capturing the original scene.');

  assert.match(plannerSource,/MAX_CAPTURE_SHOTS = 120/);
  assert.match(plannerSource,/Math\.min\(12, Number\(zone\.maxTargets\) \|\| 12\)/);
  assert.match(plannerSource,/structure-low-oblique/);
  assert.match(plannerSource,/structure-high-oblique/);
  assert.match(plannerSource,/structure-top-down/);
  assert.match(plannerSource,/water-surface-angle/);
  assert.match(plannerSource,/coastline-angle/);

  const planned = planner.expandCapturePlan([{
    id:'hrafn-structures',
    zone:{
      islandIndex:0,center:{x:0,y:0,z:0},radiusMeters:25,
      focus:'structures',maxTargets:2,cameraDistanceMeters:9,
      observationPoint:{x:20,y:6,z:50},observationHeightOffsets:[0,2]
    }
  }]);
  assert.equal(planned.shots.length,0,'Zone requests should be expanded after the live world inventory is collected.');
  assert.equal(planned.zones.length,1);
  const candidates = [
    {name:'Hut_A',kind:'WeatheredNorseHut',island:'Hrafn',islandIndex:0,
      position:{x:101,y:1,z:204},bounds:{bottomY:1,topY:5,width:4,depth:4},meshCount:12,vertexCount:900},
    {name:'Camp_B',kind:'IslandOutpost',island:'Hrafn',islandIndex:0,
      position:{x:110,y:1,z:200},bounds:{bottomY:1,topY:4,width:3,depth:3},meshCount:8,vertexCount:500},
    {name:'Far_Hut',kind:'WeatheredNorseHut',island:'Hrafn',islandIndex:0,
      position:{x:150,y:1,z:200},bounds:{bottomY:1,topY:5,width:4,depth:4}}
  ];
  const stableCode=planner.makeStableObjectCode(candidates[0]);
  assert.match(stableCode,/^OBJ-[A-F0-9]{12}$/);
  assert.equal(planner.makeStableObjectCode(candidates[0]),stableCode,'Stable object codes must be repeatable.');
  const resolved = planner.createZoneInspectionShots(planned.zones[0],[{x:100,z:200}],candidates);
  assert.equal(resolved.report.candidateCount,2,'Only structural roots inside the requested zone should be selected.');
  assert.equal(resolved.report.selectedTargetCount,2);
  assert.equal(resolved.report.omittedTargetCount,0);
  assert.equal(resolved.shots.length,18,'Two structures should receive four area views, two offshore overviews, two water views, and bounded local angles.');
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='zone-overview').length,4);
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-low-oblique').length,4);
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-high-oblique').length,4);
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-top-down').length,2);
  const waterOverview=resolved.shots.filter(shot=>shot.inspectionPurpose==='zone-water-overview');
  assert.equal(waterOverview.length,2,'The full bay must also be captured from the fixed offshore viewpoint.');
  const waterShots=resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-water-observation');
  assert.equal(waterShots.length,2,'Every structure should receive one clear observation from the fixed offshore viewpoint.');
  assert.ok(waterShots.every(shot=>shot.camera.x===120&&shot.camera.y===6));
  assert.ok(waterShots.every(shot=>shot.camera.z===250&&shot.subject?.code));
  assert.equal(resolved.report.observationPoint.x,120);
  assert.equal(resolved.report.observationPoint.z,250);
  assert.ok(resolved.shots.every(shot=>shot.camera&&shot.worldTarget&&(['zone-overview','zone-water-overview'].includes(shot.inspectionPurpose)||shot.subject?.code)));
  assert.ok(new Set(resolved.shots.map(shot=>shot.id)).size===resolved.shots.length,'Generated camera IDs must be unique.');
  assert.equal(resolved.report.selectedTargets[0].name,'Hut_A');

  const widePlan=planner.expandCapturePlan([{
    id:'all-structures',
    zone:{islandIndex:0,center:{x:0,y:0,z:0},radiusMeters:30,focus:'structures',maxTargets:12,includeTopDown:false,
      observationPoint:{x:0,y:6,z:80},observationHeightOffsets:[0,2.5]}
  }]);
  const wideCandidates=Array.from({length:13},(_,index)=>({
    name:'Structure_'+index,kind:'NorseHut',island:'Hrafn',islandIndex:0,
    position:{x:100+index,y:1,z:200},bounds:{bottomY:1,topY:5,width:4,depth:4},meshCount:10,vertexCount:600
  }));
  const wide=planner.createZoneInspectionShots(widePlan.zones[0],[{x:100,z:200}],wideCandidates);
  assert.equal(wide.report.selectedTargetCount,12,'The unified inspector should include up to twelve nearby structures.');
  assert.equal(wide.report.omittedTargetCount,1,'Any structure outside the one-run camera budget must be reported explicitly.');
  assert.equal(wide.shots.length,30,'Twelve structures should receive one close view and one water view each, plus four overviews and two water heights.');
  assert.ok(wide.shots.length<=planner.MAX_CAPTURE_SHOTS);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='zone-overview').length,4);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='structure-low-oblique').length,12);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='structure-high-oblique').length,0);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='structure-top-down').length,0);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='structure-water-observation').length,12);
  assert.equal(wide.shots.filter(shot=>shot.inspectionPurpose==='zone-water-overview').length,2);

  const waterPlan = planner.expandCapturePlan([{
    id:'shore-water',
    zone:{center:{x:28,y:0,z:143},radiusMeters:18,focus:'water',times:[0,37],tides:['natural','high']}
  }]);
  const water = planner.createZoneInspectionShots(waterPlan.zones[0],[],[]);
  assert.equal(water.report.stateVariantCount,4);
  assert.ok(water.shots.some(shot=>shot.inspectionPurpose==='water-surface-angle'));
  assert.ok(water.shots.some(shot=>shot.inspectionPurpose==='zone-top-down'));
  assert.ok(water.shots.length<=planner.MAX_CAPTURE_SHOTS);

  const orbit = planner.expandCapturePlan([{
    id:'legacy-orbit',
    camera:{x:0,y:8,z:20,targetX:0,targetY:2,targetZ:0},
    orbit:{count:8,radius:20,elevation:8,targetX:0,targetY:2,targetZ:0}
  }]);
  assert.equal(orbit.shots.length,8,'Existing hand-authored orbit plans must keep working.');

  assert.match(html,/inspectScene:async\(\{inventoryLimit=5000,offshoreLimit=500\}=\{\}\)=>/);
  assert.match(html,/run\('textureReadiness',\(\)=>window\.__ELSN_TEST__\.getTextureReadinessForCamera\(\)\)/);
  assert.match(html,/run\('rockGrounding'/);
  assert.match(html,/run\('outerLandmarkGrounding'/);
  assert.match(html,/run\('sheetOpacityDepth'/);
  assert.match(html,/uniqueId:Number\.isInteger\(node\.uniqueId\)/);
  assert.match(html,/single-unified-scene-inspection/);
  for (const requiredInspectorSection of [
    'auditIslandGeometry()',
    'auditHabitableStructures(false)',
    'auditOffshoreStructuralRoots(offshoreLimit)',
    'getCoastalSceneInventory(inventoryLimit)',
    'settlementGrounding()',
    'settlementCampGrounding()',
    'garrisonGrounding()',
    'getWaterCoastDiagnostics()',
    'window.__elSinNombreWaterDebugSnapshot',
    'diagnostics()'
  ]) {
    assert.ok(html.includes(requiredInspectorSection),'The unified inspector is missing: '+requiredInspectorSection);
  }
  assert.match(html,/unsafeVisibleBeforeRepair/);
  assert.match(html,/visibleInvalidAfterRepair/);
  assert.match(html,/tide==='high'\?\.28:\(tide==='low'\?-.28/);
  assert.match(html,/prepareCaptureFrame:async/);
  assert.match(html,/frameCountNow=renderedFrames/,'Capture convergence must read the live game render-loop frame counter.');
  assert.match(html,/sceneReady=readyFrameStreak>=1/,'Capture must wait for a real post-camera game frame, not freeze the render loop.');
  assert.match(html,/barrierMethod:'render-loop-frame-counter-one-post-camera-frame'/,'The readiness report must identify the actual render-frame barrier.');

  console.log('CAPTURE RELIABILITY + ZONE INSPECTION CONTRACT OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
