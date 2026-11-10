'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const land=html.match(/const land=\[([\s\S]*?)\];/);
assert.ok(land,'No se encuentra la definición del archipiélago.');
assert.equal((land[1].match(/\{x:/g)||[]).length,13,'El mapa debe contener exactamente trece islas.');
assert.match(html,/<b id="captured">0\/13<\/b>/,'El HUD debe mostrar 0/13 desde el primer fotograma.');
assert.doesNotMatch(html,/<b id="captured">0\/4<\/b>/,'No debe quedar el contador antiguo 0/4.');
assert.match(html,/for\(let islandIndex=4;islandIndex<land\.length;islandIndex\+\+\)makeIslandGarrison\(islandIndex\);/);
assert.match(html,/function makeIslandGarrison\(islandIndex\)/);
assert.match(html,/function findLevelHutFooting\(cx,cz,scale,preferredIslandIndex=-1\)/,'Each hut must search locally for a naturally level four-corner footing within its owning island without modifying terrain.');
assert.match(html,/valid:false/,'A failed local footing search must be represented as invalid, never as a usable fallback.');
assert.match(html,/if\(!footing\.valid\)g\.setEnabled\(false\)/,'A hut with no valid dry-land footing must never render at the generic offshore fallback height.');
assert.match(html,/registerHabitableStructure\(g,'NorseHut'/,'Every village hut must enter the live structure audit, including invalid disabled huts.');
assert.match(html,/maxRelief:\.02,anchorTolerance:\.02/,'Hut repair tolerance must match the 2 cm measured-footing limit.');
assert.match(html,/const centerY=renderedTerrainSurfaceAt\(px,pz\),ys=\[/,'Footing placement must compare all four corners against the center of the rendered GroundMesh.');
assert.match(html,/g\.position=v\(houseX,footing\.centerY-\.02\*scale,houseZ\)/,'Each hut footing must use the measured rendered-ground center height and scaled base offset.');
assert.match(html,/groundingErrorMeters:Number\(Math\.abs\(footingBottomY-sampledTerrainY\)\.toFixed\(4\)\)/,'Every hut must expose its measured rendered-ground footing error.');
assert.match(html,/maxCenterRadius=island\.r\*\.76-footprintRadius-1\.25/,'Every hut candidate must keep its complete footprint inside the dry-land band.');
assert.match(html,/maxRelief:Math\.max\(\.005,Number\(options\.maxRelief\)\|\|\.32\)/,'Small hut footing tolerances must not be silently widened to 8 cm.');
assert.match(html,/GreatHallStoneSupportPier_/,'Skjoldheim Great Hall must use visible stone support piers on uneven terrain.');
assert.match(html,/maxRelief:2\.05/,'The Great Hall audit must allow only the measured, supported natural slope.');
assert.match(html,/hallRootY=Math\.max\(floorY,\.\.\.supportSamples\.map\(point=>point\.groundY\)\)/,'The Great Hall floor must sit level above its highest support point.');

assert.ok(html.includes("function settlementHousePosition(island,x,z,scale=1)"),
  "Every settlement hut must be projected inside its own island's safe dry-land radius.");
assert.ok(html.includes("const houseSpecs=[[x,z,.90],[x-7,z+7,.66],[x+8,z-5,.62]];"),
  "The three original hut offsets and scales must remain intact.");
assert.ok(html.includes("settlementHousePosition(land[index],hx,hz,scale)"),
  "Hut projection must use the owning island, never a nearest-island guess.");
assert.ok(html.includes("house.__settlementProjection={requested:{x:hx,z:hz},projected:position};"),
  "The audit must retain the original and projected coordinates for each hut.");
const placementStart=html.indexOf("function settlementHousePosition(island,x,z,scale=1){");
const placementEnd=html.indexOf("\n function makeVillage",placementStart);
assert.ok(placementStart>=0&&placementEnd>placementStart,
  "The hut projection helper must remain independently testable.");
const placementSource=html.slice(placementStart,placementEnd).trim();
const settlementHousePosition=new Function(placementSource+"; return settlementHousePosition;")();
const testSettlements=[
  {island:{x:0,z:0,r:60},houses:[[31,-17,.90],[24,-10,.66],[39,-22,.62]]},
  {island:{x:135,z:14,r:31},houses:[[135,14,.90],[128,21,.66],[143,9,.62]]},
  {island:{x:-132,z:45,r:33},houses:[[-132,45,.90],[-139,52,.66],[-124,40,.62]]},
  {island:{x:28,z:143,r:33},houses:[[28,143,.90],[21,150,.66],[36,138,.62]]}
];
for(const settlement of testSettlements)for(const [x,z,scale] of settlement.houses){
  const placed=settlementHousePosition(settlement.island,x,z,scale);
  const distance=Math.hypot(placed.x-settlement.island.x,placed.z-settlement.island.z);
  const footprint=Math.hypot(2.01*scale,2.64*scale);
  assert.ok(distance+footprint<=settlement.island.r*.76-1.25+1e-8,
    "The complete hut footprint must remain at least 1.25 m inside the grass/sand transition.");
}
const movedBeachHut=settlementHousePosition(testSettlements[0].island,39,-22,.62);
assert.equal(movedBeachHut.adjusted,true,"The outer Raven village hut must be moved inward off the beach transition.");
assert.ok(Math.hypot(movedBeachHut.x,movedBeachHut.z)<Math.hypot(39,-22),
  "A hut overlapping the coast must be moved toward the island centre.");

const villagePositionStart=html.indexOf("function settlementVillagePosition(island,x,z){");
const villagePositionEnd=html.indexOf("\n function makeVillage",villagePositionStart);
assert.ok(villagePositionStart>=0&&villagePositionEnd>villagePositionStart,
  "The whole-village inland placement helper must remain independently testable.");
const settlementVillagePosition=new Function(html.slice(villagePositionStart,villagePositionEnd).trim()+"; return settlementVillagePosition;")();
const originalRavenVillage={x:31,z:-17};
const movedRavenVillage=settlementVillagePosition({x:0,z:0,r:60},originalRavenVillage.x,originalRavenVillage.z);
assert.equal(movedRavenVillage.adjusted,true,"The Raven village must move inland as one complete settlement.");
assert.ok(Math.hypot(movedRavenVillage.x,movedRavenVillage.z)+14.0<=60*.76-8.0+1e-8,
  "The entire Raven village footprint must retain an eight-metre dry-land buffer.");
assert.ok(Math.abs((movedRavenVillage.x-originalRavenVillage.x)/(movedRavenVillage.z-originalRavenVillage.z)-31/-17)<1e-8,
  "Moving the village must preserve its orientation and spacing by using one shared translation.");
assert.match(html,/settlementVillagePosition\(land\[index\],x,z\)/,
  "All four villages must pass through the shared inland placement helper.");
assert.doesNotMatch(html,/safeVillageRadius=/,'Only individual huts may move; the village center and shared props must stay in place.');
assert.match(html,/g\.position=v\(houseX,footing\.centerY-\.02\*scale,houseZ\)/);
assert.match(html,/type:'rect',x:houseX,z:houseZ/,'The hut collision footprint must follow its corrected rendered position.');
assert.match(html,/const cx=vl\.x,cz=vl\.z\+15/,'Outpost tents must remain beside the village on the island interior.');
assert.match(html,/const scoutX=vl\.x-8,scoutZ=vl\.z\+18/,'Scout supplies must not use the old offshore +19/-16 offset.');
assert.match(html,/settlementCampGrounding:/,'The test API must report both camp anchors and their dry-land footprint.');
assert.match(html,/auditIslandGeometry:\(\)=>auditIslandGeometry\(\)/,'The 13-island geometry audit must be available in test mode.');
assert.match(html,/function claimVillage\(vl,restoring=false\)/);
assert.match(html,/captured\+'\/'\+land\.length/);
assert.match(html,/function updateIslandInvasion\(dt\)/,'La fase naval debe tener una actualización activa.');
assert.match(html,/updateIslandInvasion\(dt\);/,'La actualización naval debe estar conectada al bucle principal.');
assert.match(html,/function spawnIslandInvasionWave\(\)/);
assert.match(html,/function invasionDisembark\(ship,vl\)/);
assert.match(html,/invasionDisembark\(raider,invasionTarget\)/,'Los barcos deben alcanzar la costa y ejecutar el desembarco.');
assert.match(html,/raider\.islandInvasionShip&&raider\.invasionPhase==='sailing'/,'Los barcos deben tener una fase de navegación de invasión.');
assert.match(html,/function loseIslandHolding\(vl\)/,'El asedio debe poder hacer caer un territorio.');
assert.match(html,/if\(attacker\.islandInvader\)return landIslandIndex\(x,z\)===attacker\.targetVillageIndex;/,'Los invasores deben poder combatir en la isla sitiada.');
assert.match(html,/const islandInvaders=enemies\.filter\(g=>g&&g\.alive&&g\.islandInvader&&g\.targetVillageIndex===vl\.index\)/,'Los invasores deben impedir la reconquista hasta ser derrotados.');
assert.match(html,/islandInvasion:snapshotIslandInvasion\(\)/,'El estado de la invasión debe guardarse.');
assert.match(html,/restoreIslandInvasion\(d\.islandInvasion\)/,'El estado de la invasión debe recuperarse.');
assert.match(html,/function snapshotIslandInvasion\(\)/);
assert.match(html,/function resetIslandInvasion\(\)/);

assert.match(html,/function registerHabitableStructure\(root,kind,options=\{\}\)/,'Every roofed structure must register in the shared grounding audit.');
assert.match(html,/function evaluateHabitableStructure\(entry\)/,'The auditor must measure world position, rendered ground, footprint and dry-land margin.');
assert.match(html,/function auditHabitableStructures\(applyRepairs=true\)/,'The live structure audit must be able to hide an unsafe root.');
assert.match(html,/habitableStructureAudit:\(\)=>auditHabitableStructures\(false\)/,'The audit snapshot must be available to Playwright.');
assert.match(html,/const roofedRootPattern=\/\^\(\?:WeatheredNorseHut/,'The runtime auditor must discover unregistered roofed roots by name.');
assert.match(html,/auto-discovered-root/,'Any known roofed root outside the registry must be adopted and audited.');
assert.match(html,/autoRegisteredRootCount/,'The audit report must disclose auto-discovered roots.');
assert.match(html,/habitableStructureAuditAsBoat:/,'The test API must run the live audit in a simulated boat state.');
assert.match(html,/boatVisibleDistance:55/,'Every registered roofed structure must use the 55m offshore visibility cap.');
assert.match(html,/const habitableAuditInterval=onShip \? \.5 : 1\.5/,'The structure audit must run every 0.5 seconds while sailing and every 1.5 seconds on land.');
assert.match(html,/boatVisibleDistance:Math\.max\(30,Number\(options\.boatVisibleDistance\)\|\|55\)/,'Boat mode must hide buildings beyond 55m while preserving the 205m land radius.');
assert.match(html,/limit=onShip\?entry\.boatVisibleDistance:entry\.maxVisibleDistance/,'Offshore roofs must be culled before their island terrain becomes a distant speck.');
assert.match(html,/registerHabitableStructure\(hall,'NorseGreatHall'/,'The outer-island Great Hall must be included, not just village huts.');
assert.match(html,/registerHabitableStructure\(camp,'IslandOutpostCamp'/);
assert.match(html,/registerHabitableStructure\(scout,'IslandScoutCamp'/);
assert.match(html,/registerHabitableStructure\(starterCamp,'StarterCastawayCamp'/);
assert.match(html,/registerHabitableStructure\(forge,'NorseBlacksmithForge'/);
assert.match(html,/registerHabitableStructure\(outpostRoot,'IslandGarrisonOutpost'/);
assert.match(html,/registerHabitableStructure\(tower,'NorseWatchTower'/,'Village watchtowers must also be included in the dry-land audit.');
assert.match(html,/towerSafeRadius=watchIsland\.r\*\.76-1\.35-1\.25/,'Village watchtowers must be projected inside the dry-land margin.');
assert.match(html,/root\.setEnabled\(false\);entry\.hiddenByAudit=true/,'An invalid building must stop rendering.');
assert.match(html,/entry\.lastAction='hidden-no-safe-ground'/,'Unsafe buildings with no safe relocation must be explicitly marked as hidden.');
assert.match(html,/hiddenUnsafe\+\+/,'The audit must count invalid structures it safely hides.');
assert.match(html,/if\(testModeEnabled\)/,'The disposable test harness must keep its non-destructive audit path separate from live-game hiding.');
assert.match(html,/entry\.lastAction='relocation-failed-visible'/,'The test-only branch must report an unsafe synthetic root without mutating the scene.');
assert.match(html,/if\(entry\.collider\)entry\.collider\.active=false/,'A hidden building must not leave an invisible collision wall.');
assert.match(html,/if\(ref&&ref\.active===false\)continue/,'Inactive hidden-structure colliders must be ignored by movement queries.');
assert.match(html,/if\(c\.active===false\)continue/,'Inactive hidden-structure colliders must be ignored by world movement and melee.');
assert.match(html,/withinDryLandBand/);

console.log('OK: 13 islands, 12 projected settlement huts, naval systems, and live dry-land audit for every roofed structure.');
