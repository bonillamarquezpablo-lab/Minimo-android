'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const html = fs.readFileSync('index.html', 'utf8');
  const runner = fs.readFileSync('scripts/custom-scene-capture.mjs', 'utf8');
  const plannerSource = fs.readFileSync('scripts/scene-capture-inspection.mjs', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/coastal-reference.yml', 'utf8');
  const planner = await import('./scene-capture-inspection.mjs');

  assert.match(workflow,/^  pull_request:/m);
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^  push:/m);
  assert.match(workflow,/group: scene-capture-\$\{\{ github\.sha \}\}/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow,/if: false # Phase 1/);

  assert.match(runner,/page\.addInitScript/);
  assert.match(runner,/Math\.imul\(1664525,state\)\+1013904223/);
  assert.match(runner,/prepareCaptureFrame\(\{timeoutMs:120000\}\)/);
  assert.match(runner,/__ELSN_TEST__\.render\(\)/);
  assert.match(runner,/createHash\('sha256'\)/);
  assert.match(runner,/assert\.equal\(secondHash,firstHash/);
  assert.match(runner,/function writeManifest\(\)/);
  assert.match(runner,/manifest\.lastUpdatedAt/);
  assert.match(runner,/capture-index\.json/);
  assert.match(runner,/cameraReadback/);
  assert.match(runner,/createZoneInspectionShots/);
  assert.match(runner,/auditOffshoreStructures\(1000\)/);
  assert.match(runner,/coastalSceneInventory\(2000\)/);
  assert.match(workflow,/create_scene_capture_contact_sheet\\.py/);
  assert.match(workflow,/needs: texture-smoke/);
  assert.match(plannerSource,/capturePrefix/);
  assert.doesNotMatch(runner,/repairAndAuditHabitableStructures/,
    'The camera inspection run must not repair or move objects before capturing the original scene.');

  assert.match(plannerSource,/MAX_CAPTURE_SHOTS = 120/);
  assert.match(plannerSource,/structure-low-oblique/);
  assert.match(plannerSource,/structure-high-oblique/);
  assert.match(plannerSource,/structure-top-down/);
  assert.match(plannerSource,/water-surface-angle/);
  assert.match(plannerSource,/coastline-angle/);

  const planned = planner.expandCapturePlan([{
    id:'hrafn-structures',
    zone:{
      islandIndex:0,center:{x:0,y:0,z:0},radiusMeters:25,
      focus:'structures',maxTargets:2,cameraDistanceMeters:9
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
  const resolved = planner.createZoneInspectionShots(planned.zones[0],[{x:100,z:200}],candidates);
  assert.equal(resolved.report.candidateCount,2,'Only structural roots inside the requested zone should be selected.');
  assert.equal(resolved.report.selectedTargetCount,2);
  assert.equal(resolved.report.omittedTargetCount,0);
  assert.equal(resolved.shots.length,34,'Two structures should receive 8 overview + 13 inspection views each.');
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-low-oblique').length,16);
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-high-oblique').length,8);
  assert.equal(resolved.shots.filter(shot=>shot.inspectionPurpose==='structure-top-down').length,2);
  assert.ok(resolved.shots.every(shot=>shot.subject?.code&&shot.camera&&shot.worldTarget));
  assert.ok(new Set(resolved.shots.map(shot=>shot.id)).size===resolved.shots.length,'Generated camera IDs must be unique.');
  assert.equal(resolved.report.selectedTargets[0].name,'Hut_A');

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

  assert.match(html,/unsafeVisibleBeforeRepair/);
  assert.match(html,/visibleInvalidAfterRepair/);
  assert.match(html,/tide==='high'\?\.28:\(tide==='low'\?-.28/);
  assert.match(html,/prepareCaptureFrame:async/);
  assert.match(html,/scene\.onAfterRenderObservable\.add\(/);
  assert.match(html,/renderedFrames>=2/);
  assert.match(html,/Only freeze after two actual frames/);

  console.log('CAPTURE RELIABILITY + ZONE INSPECTION CONTRACT OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
