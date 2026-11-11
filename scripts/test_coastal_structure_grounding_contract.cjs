const assert = require('node:assert/strict');
const fs = require('node:fs');
const source=fs.readFileSync('scripts/coastal-structure-grounding-smoke.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
const html=fs.readFileSync('index.html','utf8');
const navigation=fs.readFileSync('scripts/nordic/navigation-suite.js','utf8');
const builder=fs.readFileSync('scripts/build_site.py','utf8');
assert.match(source,/\?test=1['\"]?/);
assert.doesNotMatch(source,/\?test=1&coastref=1/);
assert.match(source,/habitableStructureAudit\(\)/);
assert.match(source,/settlementGrounding\(\)/);
assert.match(source,/settlementCampGrounding\(\)/);
assert.match(source,/garrisonGrounding\(\)/);
assert.ok(builder.includes('local_flag_base_y = "flagBaseY:flagY+3.55-outpostGroundY"'));
assert.ok(builder.includes('local_flag_reset = "if(vl.flagGroup){vl.flagGroup.position.y=vl.flagBaseY??(terrainSurfaceAt(vl.x,vl.z)+4.65);'));
assert.ok(builder.includes('local_capture_raise = "village.flagGroup.position.y=(village.islandGarrison?2.15-(village.outpostRoot?.position?.y||0):2.15)+2.5*ease;"'));
assert.ok(builder.includes('garrison.flagBaseY=garrisonFlagGroup.position.y'));
assert.ok(builder.includes("bedroll_grounding_marker = \"for(const bedroll of camp.__groundingBedrolls||[])placeBoxBase(bedroll,.08);\""));
assert.ok(builder.includes("const placeRotatedBedrollBase=(mesh)=>{"));
assert.ok(builder.includes("boundingBox?.vectors"));
assert.ok(builder.includes("BABYLON.Vector3.TransformCoordinates(corner,mesh.getWorldMatrix())"));
assert.ok(builder.includes("requiredBottomY=Math.max(...terrainSamples.map(point=>point.terrainY))"));
assert.ok(builder.includes("placeRotatedBedrollBase(bedroll)"));
assert.ok(builder.includes("Outpost bedroll grounding produced a non-finite correction"));
assert.ok(builder.includes("new_structure_pattern = \"const structureNamePattern=/(?:norsethingstead|norsecoastalpier|norsecoastalbeacon|weatherednorsehut|\""));
assert.ok(builder.includes("outerLandmarkGrounding:()=>"));
assert.ok(builder.includes("renderedTerrainSurfaceAt(x,z),circle=newGroup('NorseThingstead_'"));
assert.ok(builder.includes("renderedTerrainSurfaceAt(startX,startZ)+.10"));
assert.ok(builder.includes("renderedTerrainSurfaceAt(x,z),tower=newGroup('NorseCoastalBeacon_'"));


assert.match(source,/structure-grounding\.json/);
assert.match(source,/testRendererOnlyMutations:true/);
assert.match(source,/productionDataModified:false/);
assert.match(html,/findLevelHutFooting\(cx,cz,scale,preferredIslandIndex=-1\)/);
assert.match(html,/enableAfterRelocation:options\.enableAfterRelocation===true/);
assert.match(html,/relocatable:true,enableAfterRelocation:!footing\.valid/);
assert.match(html,/const outpostGroundY=root\?renderedTerrainSurfaceAt\(root\.x,root\.z\):NaN/);
assert.match(source,/postAutomaticAudit/);
assert.match(source,/repairAndAuditHabitableStructures\(\)/);
assert.match(source,/explicitRepairApiCalled:true/);
assert.match(source,/waitForTimeout\(800\)/);
assert.doesNotMatch(source,/probeFloatingHutAudit|\.setEnabled\(|\.position\.set\(/);
assert.match(source,/usesGameRepairSystem:true/);
assert.match(source,/initialPlayerCamera/);
assert.match(source,/projectedStructuralCandidates/);
assert.match(source,/inventoryStructuralCandidates/);assert.match(source,/unregisteredCandidateReview/);assert.match(source,/player-avatar-geometry/);assert.match(source,/equipped-weapon-assembly/);assert.match(source,/hearth-prop/);assert.match(source,/firewood-rack-prop/);assert.match(source,/intentional-outer-island-landmark/);assert.match(source,/candidateReviewComplete/);
assert.match(source,/sceneViewSnapshot/);
assert.match(source,/projectWorldPoint/);
assert.match(source,/width:430,height:768/);
assert.match(source,/captureCompositedPage\(page,file,\{gameCanvas:true\}\)/);
assert.match(source,/newCDPSession\(page\)/);assert.match(source,/page\.screenshot\(\{type:'png'/);assert.match(source,/page\.evaluate\(\(\)=>window\.__ELSN_TEST__\?\.captureCanvas/);assert.match(source,/bounded\(session\.send\('Page\.captureScreenshot'/);assert.match(source,/bounded\(page\.screenshot/);assert.match(source,/10000/);assert.match(source,/control\.setMode\('free'\)/);assert.match(source,/prepareStaticCaptureFrame/);assert.match(source,/const actualPosition=actualView\?\.camera\|\|null/);assert.match(source,/cameraVerified/);assert.match(source,/physicallyUnsafe=metrics=>/);
assert.match(html,/sceneViewSnapshot:\(\)=>/);
assert.match(html,/projectWorldPoint:\(\{x,y,z\}\)=>/);
assert.match(workflow,/unified-inspector:/);
assert.match(workflow,/node scripts\/run-unified-inspector\.mjs/);
assert.match(fs.readFileSync('scripts/run-unified-inspector.mjs','utf8'),/Cimentación, estructuras y simulación de reparación en entorno desechable/);
assert.match(workflow,/if: always\(\)/);
assert.match(workflow,/artifacts\/structure-grounding\//);

assert.match(source,/auditOffshoreStructures\(1000\)/);
assert.match(source,/full normal game runtime/);
assert.match(source,/offshoreIslandCount:offshore\.islandCount/);
assert.match(source,/unregisteredStructuralCandidates:offshore\.unregisteredCandidates/);
assert.match(source,/allInitialUnsafeVerifiedSafe/);
// Intentional regatta buoys are permitted offshore; all other offshore structures still fail.
assert.match(source,/intentionalRegattaBuoys/);
assert.match(source,/unexpectedOffshoreStructures/);
assert.match(source,/unexpectedOffshoreStructures===0/);
assert.match(source,/unregisteredStructuralCandidatesAfter/);
assert.match(source,/offshoreIslandCount===13/);
assert.match(source,/report\.offshoreAudit=settled\.offshore/);
assert.match(source,/offshoreRootsScanned/);
assert.match(source,/structuralCandidates/);
assert.match(source,/visibleOffshoreStructuresAfter/);
assert.match(source,/mode:'full normal-campaign runtime structure audit plus automatic-repair observation in a disposable test renderer'/);
assert.match(source,/report\.baseline=baseline;report\.repairPass=repairPass;report\.postAutomaticAudit=settled/);
assert.match(source,/fullRuntimeStructureGate/);
assert.match(workflow,/timeout-minutes: 180/);
assert.match(fs.readFileSync('scripts/run-unified-inspector.mjs','utf8'),/scripts\/coastal-structure-grounding-smoke\.mjs/);
assert.match(source,/offshoreStructuresAfter:report\.summary\.offshoreStructures/);
assert.match(source,/gate\.unexpectedOffshoreStructures===0/);

// Offshore repair must search the owning island's full safe interior, keep clearance,
// and re-enable known habitable roots instead of leaving them stranded or hidden.
const anchorStart=html.indexOf("function findSafeHabitableAnchor(entry,origin){");
const anchorEnd=html.indexOf("\n function evaluateHabitableStructure(entry){",anchorStart);
assert.ok(anchorStart>=0&&anchorEnd>anchorStart,"The island-wide safe-anchor solver must remain inspectable.");
const anchorSource=html.slice(anchorStart,anchorEnd);
assert.match(anchorSource,/for\(let dz=-safeCenterRadius/);
assert.match(anchorSource,/collisionGrid/);
assert.match(anchorSource,/other\.footprintRadius/);
assert.match(html,/node\.__footingPlacement\?\.islandIndex/);
assert.match(html,/relocatable:true,enableAfterRelocation:true,onRelocate:/);
assert.match(html,/entry\.enabledAtRegistration=true;entry\.lastAction='auto-discovered-root'/);
assert.match(html,/root\.setAbsolutePosition\(targetPosition\)/);
assert.match(html,/registerHabitableStructure\(hall,'NorseGreatHall'.*?relocatable:true/);
assert.match(html,/registerHabitableStructure\(starterCamp,'StarterCastawayCamp'.*?relocatable:true/);

console.log('COASTAL STRUCTURE GROUNDING CONTRACT OK');

assert.match(html,/dryFootprintSampleCount===dryFootprintSamples\.length/);
assert.match(html,/const insideIslandEnvelope=radial<=nearest\.r\*1\.09/);
assert.match(html,/insideIslandEnvelope\?coastalWaterHeight\(point\.x,point\.z,oceanTime\):waterHeight\(point\.x,point\.z,oceanTime\)/);
assert.match(html,/dry:insideIslandEnvelope&&Number\.isFinite\(terrain\)&&terrain>=water\+\.22/);
assert.match(html,/centerInsideIslandEnvelope\?coastalWaterHeight\(absolute\.x,absolute\.z,oceanTime\):waterHeight\(absolute\.x,absolute\.z,oceanTime\)/);
assert.match(html,/footprintDrySamples:9/);
assert.match(html,/minimumDryTerrainAboveWaterMeters:\.22/);

assert.match(html,/let mapTargetWorld=null/);
assert.match(html,/objectScale=Math\.min\(contentWidth\/map\.width,contentHeight\/map\.height\)/);
assert.match(html,/logicalX=\(e\.clientX-rect\.left-offsetX\)\/drawnWidth\*480,logicalY=\(e\.clientY-rect\.top-offsetY\)\/drawnHeight\*344/);
assert.match(html,/mapTargetWorld=\{x:Number\(\(\(logicalX-cx\)\/scale\)\.toFixed\(1\)\),z:Number\(\(\(logicalY-cy\)\/scale\)\.toFixed\(1\)\)\}/);
assert.match(html,/TOCA EL MAR PARA MARCAR/);
assert.match(html,/mapTarget:\(\)=>mapTargetWorld\?\{x:mapTargetWorld\.x,z:mapTargetWorld\.z\}:null/);
assert.match(html,/const focus=onShip\?ship\.position:player\.root\.position/);
assert.doesNotMatch(html,/cameraYaw=B\.Scalar\.Lerp\(cameraYaw,ship\.rotation\.y/);
assert.match(html,/cameraYaw=ship\.rotation\.y;cameraPitch=\.36;cameraDistance=13\.2/);
assert.match(html,/const sensitivity=onShip\?/);
assert.match(html,/cameraYaw-=dx\*sensitivity/);
assert.match(html,/cameraObstructionBlend=1/);

assert.match(source,/verify expanded map click returns world coordinates/);
assert.match(source,/window\.__ELSN_TEST__\?\.mapTarget\?\.\(\)/);
assert.match(source,/Map tap projection mismatch/);
assert.match(source,/expected=\{x:400,z:250\}/);
assert.match(source,/const objectScale=Math\.min\(contentWidth\/map\.width,contentHeight\/map\.height\)/);
assert.match(source,/clientX=rect\.left\+offsetX\+logicalX\/480\*drawnWidth/);

// En barco, todos los perfiles usan el límite de visibilidad propio del barco para no mostrar cabañas sin su isla.
assert.match(html,/limit=onShip\?entry\.boatVisibleDistance:entry\.maxVisibleDistance/);
assert.match(html,/visibilityLimitMeters=onShip\?entry\.boatVisibleDistance:entry\.maxVisibleDistance/);
assert.doesNotMatch(html,/limit=onShip&&ultraLowEndIslandStreaming/);

// Habitable huts must stay above the maximum coastal water/run-up envelope plus a dry-ground margin.
assert.match(html,/minimumDryGroundY=\(Number\(ground\.position\.y\)\|\|0\)\+\.60/);
assert.match(html,/centerY<minimumDryGroundY/);
assert.match(html,/minGroundY>=minimumDryGroundY/);
assert.match(html,/minimumDryClearanceMeters/);

// Identify structures from both names and grouped geometry, including unknown object roots.
assert.match(html,/unknownRootSet=new Set\(\)/);
assert.match(html,/unknownAssemblyExclusions/);
assert.match(html,/unidentified-structure/);
assert.match(html,/secondary-island-outpost/);
assert.match(html,/scout-supply-camp/);
assert.match(html,/watchtower/);
assert.match(html,/island-garrison/);
assert.match(html,/structuralEvidence/);
assert.match(html,/camera\.rotationQuaternion=null/);

// The capture report must retain semantic root identities and all nearby Cuervo structures.
assert.match(source,/nearbyCuervoStructureRoots/);
assert.match(source,/item\.structuralRole/);
assert.match(source,/classificationConfidence/);

// Offshore audit must include anonymous grouped GLB assemblies, not only name-matched buildings.
assert.match(html,/unknownAssemblyExclusions=\/\(/);
assert.match(html,/bush\|shrub\|broadleaf\|reed/);
assert.match(html,/unidentifiedGeometryRoots=new Set\(\)/);
assert.match(html,/unidentifiedGeometryRoots\.add\(node\);candidates\.add\(node\)/);
assert.match(html,/unidentified-geometry-cluster/);
assert.match(html,/structuralClassification/);


// Live local minimap: nearby area, player/ship centring, heading arrow, and compact coordinates.
assert.match(html,/function drawLocalMap\(\)/);
assert.match(html,/if\(!map\.classList\.contains\('expanded'\)\)\{drawLocalMap\(\);return;\}/);
assert.match(html,/focus=playerPos\(\),heading=onShip\?ship\.rotation\.y:yaw/);
assert.match(html,/mapHeading=onShip\?ship\.rotation\.y:yaw/);
assert.match(html,/id="mapCoords"/);
assert.match(html,/mapCoords\.textContent=coordinates/);
assert.match(html,/mapRefreshInterval=document\.body\.classList\.contains\('map-open'\)\?\.42:\.20/);

// Ship camera follows the vessel with a wider default framing; camera mode selection is wired to gameplay.
assert.match(html,/cameraMode='follow'/);
assert.match(html,/cameraDistance\*\(onShip\?2\.12:1\)/);
assert.match(html,/cameraMode!=='free'/);
assert.match(html,/window\.__ELSN_CAMERA_CONTROL=/);
assert.match(html,/cameraMode='follow';cameraManualLookUntil=0/);
assert.match(navigation,/window\.__ELSN_CAMERA_CONTROL/);
assert.match(navigation,/control\.setMode\(mode\)/);
assert.match(navigation,/applyMode\("follow"\)/);

console.log('OK: live local minimap, compass heading, coordinates and integrated follow/ship camera controls.');

// One original map only: the navigation helper must not create a duplicate overlay.
assert.match(html, /id="map"/);
assert.match(html, /rangeX=145/);
assert.match(html, /Math\.PI-heading/);
assert.match(html, /Math\.PI-mapHeading/);
assert.match(html, /cameraFocus=focus/);
assert.match(html, /onShip\?2\.12:1/);
assert.match(navigation, /originalMap:!!document\.getElementById\("map"\)/);
assert.doesNotMatch(navigation, /norse-nav-root|norse-nav-panel|norse-nav-map-large/);
assert.match(navigation, /applyMode\("follow"\)/);


// Portrait minimap stays compact despite legacy later CSS width rules and keeps coordinates aligned.
assert.ok(html.includes('width:clamp(124px,31vw,144px)!important'));
assert.ok(html.includes('clamp(95px,22.5vw,108px) + 5px'));
assert.ok(!html.includes('width:clamp(164px,42vw,190px)!important'));

// The camera can lower to a near-horizon/upward-looking angle on land and while aboard the ship.
assert.ok(html.includes('const pitchMin=onShip?-.02:-.06,pitchMax=onShip?.92:.94'));
assert.ok(html.includes('onShip?Math.max(cameraPitch,-.02):cameraPitch'));
assert.ok(html.includes('width:clamp(164px,42vw,190px)'));

// Hrafn hut mesh merge must happen at identity, before the root position/scale is applied.
// Babylon bakes child world matrices during MergeMeshes; a transformed parent would be applied twice.
const hutStart=html.indexOf("function buildHouse(cx,cz");
const hutEnd=html.indexOf("function settlementHousePosition",hutStart);
const hutBody=html.slice(hutStart,hutEnd);
assert.ok(hutStart>=0&&hutEnd>hutStart,"Hut builder must remain inspectable");
// Merge is intentionally performed while the group is identity; asymmetric roof/decoration bounds are not a double transform.
assert.match(hutBody,/mergeStaticDecorByMaterial\(g,'NorseHutStatic',\['HutDarkStoneFooting'\]\)/);
assert.ok(hutBody.indexOf("mergeStaticDecorByMaterial(g,'NorseHutStatic'")<hutBody.indexOf("g.scaling=v(scale,scale,scale);g.position=v(houseX"));
assert.match(hutBody,/g\.__norseGeometryMergeSpace='local-before-root-transform'/);
assert.match(html,/mergeSpace!==\x27local-before-root-transform\x27/);
assert.ok(hutBody.includes("g.scaling=v(scale,scale,scale);g.position=v(houseX,footing.centerY-.02*scale,houseZ)"));
assert.ok(hutBody.indexOf("g.scaling=v(scale,scale,scale);g.position=v(houseX")>hutBody.indexOf("HutDarkStoneFooting"));

// The two Hrafn camp roots are placed through the existing safe-anchor solver and remain functional.
// Their tent poles, bedrolls, supply crate and embers are seated independently on the drawn heightfield.
assert.ok(html.includes("const outpostEntry=registerHabitableStructure(camp,'IslandOutpostCamp'"));
assert.ok(html.includes("const scoutEntry=registerHabitableStructure(scout,'IslandScoutCamp'"));
assert.ok(html.includes("findSafeHabitableAnchor(outpostEntry,{x:cx,y:gy,z:cz})"));
assert.ok(html.includes("findSafeHabitableAnchor(scoutEntry,{x:scoutX,y:scoutY,z:scoutZ})"));
assert.ok(html.includes("camp.__groundingSupportPoints=[]"));
assert.ok(html.includes("scout.__groundingSupportPoints=[]"));
assert.ok(html.includes("recordContact(pole.name,worldX,worldZ,terrainY)"));

// The grounding contract measures actual Babylon heightfield samples, analytical-vs-rendered delta,
// beach deformation, distance to the sampled coast, and the conservative +0.38m high-water cap
// plus the required additional 0.22m dry margin.
assert.ok(html.includes("function measureRenderedFootprint(islandIndex,x,z,baseY,offsets=[])"));
assert.ok(html.includes("highWaterY=meanSeaLevel+.38"));
assert.ok(html.includes("const highTideSafe=highTideDryMarginMeters>=.22"));
assert.ok(html.includes("const distanceToCoastMeters=Number.isFinite(shorelineRadius)"));
assert.ok(/footingMeshBaseGapMeters=/.test(html));
assert.ok(/maximumStructuralBaseGapMeters=/.test(html));
assert.ok(html.includes("visualCenterOffsetMeters"));
assert.ok(html.includes("const supportPoints=(group?.__groundingSupportMeshes||[])"));
assert.ok(html.includes("supportPoints:measure?.samples?.filter(point=>point.name)||[]"));
assert.ok(html.includes("supportMeshCount:"));

// High-tide smoke, live before/after measurements, and per-object captures are mandatory.
assert.ok(source.includes("setWaterState({time:0,tide:'high'})"));
assert.ok(source.includes("hrafnBaseline"));
assert.ok(source.includes("beforeHouseByIndex"));
assert.ok(source.includes("beforeCampByKind"));
assert.doesNotMatch(source,/legacyHrafnBefore|legacyById/);
assert.match(source,/visualCenterOffsetMeters:item\.visualCenterOffsetMeters/);
assert.ok(source.includes("hrafnRepairComparison"));
assert.ok(source.includes("hrafnRepairGate"));
assert.ok(source.includes("habitableStructureAuditAsBoat"));
assert.ok(source.includes("boatVisibilityRegression"));
assert.ok(source.includes("boatVisibilityViolations===0"));
assert.ok(source.includes("withinDryLandBand:item.withinDryLandBand"));
assert.ok(source.includes("withinDryLandBand:row.after.withinDryLandBand===true"));
assert.ok(source.includes("maximumBaseGapMeters"));
assert.ok(source.includes("highTideSafe"));
assert.ok(source.includes("distanceToCoastMeters"));
assert.ok(source.includes("hrafn-final-"));
assert.ok(source.includes("objectInspectionCaptures.length===5"));
console.log('OK: Hrafn source transform, safe camp placement, rendered-ground + high-tide contract and before/after captures.');
