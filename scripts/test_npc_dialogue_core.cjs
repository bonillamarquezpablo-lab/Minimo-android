"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),Core=require("./npc-dialogue-core.js"),Brain=require("./npc-village-brain-core.js");
assert.equal(Core.MAX_VISIBLE_BUBBLES,4);assert.equal(Core.MAX_RANGE_METERS,26);assert.equal(Core.POSITION_UPDATE_MS,100);assert.equal(Core.SCHEDULER_INTERVAL_MS,1200);
assert.deepEqual(Core.ROLES.map(r=>r.id),["fisher","farmer","smith","trader"]);
for(let v=0;v<8;v++){assert.ok(Core.roleForVariant(v).name);const m=Core.chooseAmbientMessage({parts:{variant:v}},{isWalking:v%2===0},()=>.75);assert.ok(["thought","speech","action"].includes(m.kind));assert.ok(m.text.length>5&&m.text.length<=120);}
assert.deepEqual(Brain.ROLE_IDS,["fisher","farmer","smith","trader"]);
const brainState=Brain.createState("Villager_0_0",0,10);
assert.equal(Brain.chooseMode({now:11,threatNearby:true},brainState),"flee");
const socialState=Brain.createState("Villager_0_1",1,0);socialState.nextSocialAt=0;
socialState.mode=Brain.chooseMode({now:1,playerNearby:true,claimed:true},socialState);
assert.equal(socialState.mode,"social");
assert.equal(Brain.chooseMode({now:2,playerNearby:true,claimed:true},socialState),"social","A villager must retain a social approach briefly instead of switching modes every tick.");
assert.equal(Brain.chooseMode({now:30,playerNearby:false,claimed:true},socialState),"work");
const restState=Brain.createState("Villager_0_2",2,0);
assert.equal(Brain.chooseMode({now:2,night:true},restState),"rest");
const plannedGoal=Brain.chooseGoal({mode:"work",homeX:0,homeZ:0,x:-3,z:3,variant:0,seed:restState.seed,homeAngle:0},()=>true);
assert.ok(plannedGoal&&Number.isFinite(plannedGoal.x)&&Number.isFinite(plannedGoal.z),"The role planner must produce a finite village waypoint.");
const directStep=Brain.chooseStep({x:0,z:0,targetX:0,targetZ:5,step:1},()=>true);
assert.equal(directStep.z,1);
const detourStep=Brain.chooseStep({x:0,z:0,targetX:0,targetZ:5,step:1,side:1},(x,z)=>x>.1);
assert.ok(detourStep&&detourStep.x>.1,"When the direct step is blocked, steering must select an allowed local alternative.");
assert.ok(Math.abs(Brain.smoothAngle(3.12,-3.12,.1,8))>3.12,"NPC turns must interpolate across the shortest angular path.");
const night=Core.chooseAmbientMessage({parts:{variant:0}},{night:true},()=>0,{});
assert.equal(night.topic,"night");assert.match(night.text,/noche|oscuridad|fuego/i);
const danger=Core.chooseAmbientMessage({parts:{variant:1}},{enemyNearby:true},()=>0,{});
assert.equal(danger.topic,"danger");
const stone=Core.chooseAmbientMessage({parts:{variant:2}},{stone:0},()=>0,{});
assert.equal(stone.topic,"stone");assert.match(stone.text,/piedra|granito|pico/i);
const measuredMissing=Core.contextualLines(Core.roleForVariant(2),{wood:null,stone:null});
assert.equal(measuredMissing.filter(line=>line.topic==="wood"||line.topic==="stone").length,0,
  "Unmeasured wood and stone reserves must not be treated as zero.");
const stoneOnly=Core.contextualLines(Core.roleForVariant(2),{wood:null,stone:20});
assert.equal(stoneOnly.some(line=>line.topic==="wood"),false,
  "A measured stone reserve must not make a missing wood reserve appear empty.");
assert.equal(stoneOnly.some(line=>line.topic==="stone"),false);
const lowStoneOnly=Core.contextualLines(Core.roleForVariant(2),{wood:null,stone:0});
assert.equal(lowStoneOnly.some(line=>line.topic==="stone"),true,
  "A measured zero stone reserve must still produce a relevant warning.");
assert.equal(lowStoneOnly.some(line=>line.topic==="wood"),false);
const remembered=Core.chooseAmbientMessage({parts:{variant:0}},{night:true},()=>0,{recentTopics:["night"]});
assert.notEqual(remembered.topic,"night","An NPC must not repeat the same contextual topic immediately.");
const ex=Core.chooseExchange({parts:{variant:0}},{parts:{variant:3}},()=>0,{night:true});assert.equal(ex.length,4);assert.ok(ex.every(x=>x.kind==="speech"&&x.topic==="night"&&x.text));
const repeatedExchange=Core.chooseExchange({parts:{variant:0}},{parts:{variant:3}},()=>0,{night:true},{rapport:3,exchanges:4,recentTopics:["night"]});assert.equal(repeatedExchange.length,4);assert.notEqual(repeatedExchange[0].topic,"night","Pair memory must steer NPCs away from repeating their last conversation topic.");assert.match(repeatedExchange[1].text,/noticias|oro|islas|viento/i);
const input=Array.from({length:9},(_,i)=>({id:"npc-"+i,distance:i+1,priority:i===7?4:1,visible:true})),visible=Core.selectVisibleBubbles(input,99);assert.equal(visible.length,4);assert.equal(visible[0].id,"npc-7");assert.ok(visible.every(x=>x.distance<=26));assert.deepEqual(Core.selectVisibleBubbles(input,0),[]);
const villageBrainSource=fs.readFileSync("scripts/npc-village-brain-core.js","utf8");assert.doesNotMatch(villageBrainSource,/new B\.Mesh|MeshBuilder|BABYLON\.Mesh|requestAnimationFrame/,"The NPC brain must stay pure and must not create meshes or a frame loop.");
const viewport={left:0,top:0,right:360,bottom:1000},bubbleSize={width:140,height:70};
const bubbleA=Core.placeBubble({x:180,y:500},bubbleSize,viewport,[]);
assert.ok(bubbleA,"A visible NPC must receive a bubble placement.");
assert.ok(Math.abs((bubbleA.left+bubbleSize.width/2)-180)<1&&Math.abs((bubbleA.bottom+14)-500)<1,
 "A dialogue bubble must remain centered directly above its current NPC world anchor.");
assert.equal(Core.placeBubble({x:180,y:500},bubbleSize,viewport,[bubbleA]),null,
 "An overlapping bubble must hide instead of jumping sideways or drifting.");
assert.equal(Core.placeBubble({x:4,y:4},bubbleSize,viewport,[]),null,
 "When no directly anchored position is available, the bubble must hide.");
assert.equal(Core.isSegmentOccluded({x:0,y:2,z:0},{x:10,y:2,z:0},[{x:5,z:0,radius:1,bottomY:0,topY:6}]),true,
 "A tree crossing the line of sight must occlude the dialogue.");
assert.equal(Core.isSegmentOccluded({x:0,y:8,z:0},{x:10,y:8,z:0},[{x:5,z:0,radius:1,bottomY:0,topY:6}]),false,
 "An obstacle below the line of sight must not hide the NPC.");
assert.equal(Core.isSegmentOccluded({x:0,y:2,z:0},{x:10,y:2,z:0},[{x:12,z:0,radius:1,bottomY:0,topY:6}]),false,
 "Geometry beyond the NPC must not occlude the dialogue.");
const runtime=fs.readFileSync("scripts/npc-dialogue-runtime.js","utf8"),builder=fs.readFileSync("scripts/build_site.py","utf8"),worker=fs.readFileSync("sw.js","utf8"),validator=fs.readFileSync("scripts/validate_release.py","utf8");
assert.match(runtime,/for\(let i=0;i<MAX_BUBBLES;i\+\+\)slots\.push\(makeSlot\(i\)\)/);assert.match(runtime,/BABYLON\.Vector3\.Project/);assert.match(runtime,/Core\.POSITION_UPDATE_MS/);assert.match(runtime,/Core\.SCHEDULER_INTERVAL_MS/);
assert.match(runtime,/BABYLON\.MeshBuilder\.CreatePlane/,"NPC conversations must render as 3D world-space cards, not fixed DOM overlays.");
assert.match(runtime,/new BABYLON\.DynamicTexture/,"World dialogue cards must draw their text into a texture.");
assert.match(runtime,/BABYLON\.Mesh\.BILLBOARDMODE_ALL/,"World dialogue cards must face the active camera while retaining their NPC world position.");
assert.match(runtime,/mesh.parent=anchor/,"Each dialogue card must be parented to the speaking NPC's head transform.");
assert.match(runtime,/mesh.isPickable=false/,"Dialogue cards must not intercept gameplay input.");
assert.doesNotMatch(runtime,/document\.createElement|position:\s*["']fixed["']/,"Dialogue runtime must not create screen-fixed DOM cards.");
assert.doesNotMatch(runtime,/requestAnimationFrame/);
assert.ok(runtime.includes("root.computeWorldMatrix(true)")&&runtime.includes("anchor.computeWorldMatrix(true)"),"Only the visible NPC root/head anchor is refreshed for screen-space projection.");
assert.equal((runtime.match(/const camera=s\.scene\.activeCamera\|\|s\.camera;/g)||[]).length,3,"NPC bubble projection must use the active scene camera, with the snapshot camera only as fallback.");
assert.doesNotMatch(runtime,/!s\.camera/,"A missing snapshot camera must not block projection when scene.activeCamera exists.");
assert.match(runtime,/RANGE_SQUARED/,"Nearby NPC filtering must use squared distances before sorting the small visible set.");
assert.match(runtime,/function updateWorldBubble\(slot,s\)/,"The dialogue renderer must update a world-space NPC attachment.");
assert.match(runtime,/Core\.isSegmentOccluded\(cameraPosition,world,worldOcclusionBounds\(s\)\)/,"World dialogue cards must still respect line-of-sight occlusion.");
assert.match(runtime,/snapshotFailures/,"Dialogue runtime must surface bridge snapshot errors for diagnosis.");
assert.match(runtime,/bridgeReportedActive/,"Dialogue runtime must expose the bridge's active-game signal.");
assert.match(runtime,/missingRootCount/,"Dialogue diagnostics must count existing NPCs without a usable world position.");
assert.match(runtime,/resolvedPeopleCount/,"Dialogue diagnostics must count NPCs with a resolved world position.");
assert.match(runtime,/missingIdentityCount/,"Dialogue diagnostics must count NPCs that cannot be identified.");
assert.match(runtime,/nearestNpcDistanceMeters/,"Dialogue diagnostics must report the nearest resolved NPC distance.");
assert.match(runtime,/activeBubbleTexts/,"Dialogue diagnostics must expose the currently visible NPC conversation text.");
assert.match(runtime,/BUBBLE_DURATION_MS=6000/,"NPC speech bubbles must remain visible long enough to read.");
const dialogueFocusStart=builder.indexOf("let focus=null;");
const dialoguePlayerFallback=builder.indexOf("player&&player.root&&player.root.position",dialogueFocusStart);
assert.ok(dialogueFocusStart>=0&&dialoguePlayerFallback>dialogueFocusStart,
 "Dialogue bridge must safely resolve the active player's world position.");
assert.match(runtime,/function remember\(state,content\)/);
assert.match(runtime,/function bindSceneRenderObserver\(s\)/,"Speech bubbles must be reprojected on Babylon's render cycle, not only on a slow wall-clock timer.");
assert.match(runtime,/onAfterRenderObservable/,"Speech bubbles must be reprojected after Babylon renders the camera frame.");
assert.match(runtime,/render\(lastSnapshot,true\)/,"Bubble projection must use the current frame matrices without refreshing them after render.");
assert.doesNotMatch(runtime,/onBeforeRenderObservable/,"Bubble projection must not use pre-render camera matrices.");
assert.match(runtime,/orientationchange/);assert.match(runtime,/visualViewport/);assert.match(runtime,/ResizeObserver/);
assert.match(runtime,/s\.engine\.resize\(\)/,"A device orientation change must resize Babylon before reprojection.");
assert.match(runtime,/function render\(s,matricesReady=false\)/,"The render-cycle projection must reuse the current camera matrices.");
assert.equal((runtime.match(/const camera=s\.scene\.activeCamera\|\|s\.camera/g)||[]).length,3,"Matrix refresh, visibility checks and final bubble placement must use the currently active Babylon camera.");
assert.match(runtime,/function refreshProjectionMatrices\(s\).*?const camera=s\.scene\.activeCamera\|\|s\.camera/,"Matrix refresh must target the same active camera used for projection.");
assert.match(runtime,/slot\.mesh\.position\.set\(0,anchor===root\?2\.12:\.48\+slot\.index\*\.08,0\)/,"Dialogue cards must maintain a local offset above the NPC head.");
assert.match(runtime,/function positionTick\(\)\{const s=snapshot\(\);if\(!s\)return;bindSceneRenderObserver\(s\);bindViewportObservers\(s\);render\(s\);\}/,"The 100 ms position tick must remain a fallback even when an after-render observer exists, so bubbles cannot freeze if that observer stops firing.");
assert.match(runtime,/function isProjectable\(npc,s\)/,"The scheduler must reject NPCs whose head anchors are outside the active camera view.");
assert.match(runtime,/inView=nearby\.filter\(x=>isProjectable\(x\.npc,s\)\)/,"Ambient dialogue must only be scheduled for on-screen NPCs.");
assert.match(runtime,/schedule\(now,nearby,s\)/);
assert.match(runtime,/Core\.chooseAmbientMessage\(chosen\.npc,context,random,state\)/);
assert.match(runtime,/Core\.chooseExchange\(chosen\.npc,partner\.npc,random,context,pair\)/);assert.match(runtime,/exchange\.length>=4/);assert.match(runtime,/elsn-npc-social-memory-v1/);assert.match(runtime,/relationships=new Map\(\)/);assert.match(runtime,/function pairMemory\(a,b\)/);assert.match(runtime,/function rememberPair\(pair,topic\)/);assert.match(runtime,/queueReply\(chosen\.npc,exchange\[2\],now\+3100\)/);assert.match(runtime,/recentCaptureUntil/);
assert.match(builder,/world:\{night:/);
assert.match(builder,/enemyNearby:typeof nearEnemies/);
assert.ok(builder.includes("healthLow:typeof health!=='undefined'&&Number(health)<=35"),"Dialogue context must expose measured player health.");
assert.ok(builder.includes("stone:typeof stoneCount!=='undefined'?Number(stoneCount):null"),"Dialogue context must expose the measured stone reserve without inventing zero.");
assert.match(builder,/CreateIcoSphere\('graniteBoulder'/);
assert.ok(builder.includes("mineableGraniteMaterial"),"The mineable granite rock must reuse its existing material.");
assert.match(builder,/r\.isPickable=true/);assert.match(builder,/cap\.isPickable=true/);
assert.match(builder,/footprint_surface_replacement/);
assert.match(builder,/collisionGrid\.get\(collisionCellKey\(Math\.floor\(x\/COLLISION_CELL_SIZE/);
assert.match(builder,/entry\.kind==='tree'/);
assert.match(builder,/entry\.kind==='rock'/);
assert.match(builder,/entry\.kind==='world'/);
assert.match(builder,/for\(const rock of rocks\)/);
assert.match(builder,/for\(const collider of worldColliders\)/);
assert.match(runtime,/bootstrapAttempts\+\+<80/);assert.match(runtime,/projectionFailures/);assert.match(runtime,/projectionScratch/,"Bubble projection should reuse its scratch vector and identity matrix.");
assert.match(builder,/dialogue_bridge_marker = " window\.copyGameHealthDebug=\(\)=>\{"/,"Dialogue bridge must be inserted in the same lexical scope as the Babylon scene.");assert.match(builder,/__ELSN_GAME_DIALOGUE_BRIDGE__/);assert.match(builder,/npc-village-brain-core\.js/);assert.match(builder,/npc-dialogue-core\.js/);assert.match(builder,/npc-dialogue-runtime\.js/);assert.match(builder,/npc-dialogue\.css/);assert.match(builder,/maxVisibleBubbles:4/);assert.match(builder,/scene,engine,camera:scene\.activeCamera/,"Dialogue bridge must expose Babylon engine required for camera projection.");assert.match(builder,/dialogueAmbientByRoot=new Map\(\)/,"Dialogue bridge must reuse original civilian actors.");assert.match(builder,/actualParts=ambientActor&&ambientActor\.parts/,"Dialogue roles must come from each civilian actual profession variant.");assert.match(builder,/npcVillageBrain\.chooseMode\(/);assert.match(builder,/npcVillageBrain\.chooseGoal\(/);assert.match(builder,/npcVillageBrain\.chooseStep\(/);assert.match(builder,/npc_behavior_pattern/);
assert.ok(builder.includes("const active=!!(document.body&&document.body.classList.contains('game-running'));")&&builder.includes("    active,"),"Dialogue bridge must use the same active-game signal as the gameplay and acceptance flow.");assert.match(builder,/let dialoguePeopleCache=null/,"Dialogue actor roots must be cached after entry rather than rescanned on every position tick.");
assert.match(builder,/head=descendants\.find\(child=>child&&\/head\/i/,"Dialogue anchors should use the NPC head transform when the rig exposes one.");
assert.match(builder,/scene\.transformNodes\)\?scene\.transformNodes:\[\]/,"Dialogue must enumerate existing Babylon transform roots.");
assert.ok(builder.includes("found.push({name,root:node,villageIndex,parts:"),"NPC snapshots must preserve their village identity so conversations stay within the same settlement.");
assert.ok(builder.includes("Villager_")&&builder.includes("VillageGuard")&&builder.includes(".exec(name)"),"Dialogue must select existing civilian and guard roots by their stable scene names.");
assert.doesNotMatch(builder,/ambientPeople\.concat/,"Dialogue bridge cannot reference the removed ambientPeople global.");const dialogueStyle=fs.readFileSync("scripts/npc-dialogue.css","utf8");assert.match(dialogueStyle,/z-index:1200/);assert.match(dialogueStyle,/max-width:min\(144px,calc\(100vw - 20px\)\)/);assert.match(dialogueStyle,/font-size:10px/);assert.match(dialogueStyle,/padding:4px 6px 5px/);assert.match(dialogueStyle,/-webkit-line-clamp:3/);assert.match(runtime,/window\.__ELSN_NPC_DIALOGUES_RUNTIME_ACTIVE__/);assert.match(runtime,/matchMedia\("\(max-width: 700px\)"\)\.matches\?1:MAX_BUBBLES/);assert.match(runtime,/slice\(0,69\)/);
assert.match(worker,/\.\/scripts\/npc-village-brain-core\.js/);assert.match(worker,/\.\/scripts\/npc-dialogue-core\.js/);assert.match(worker,/\.\/scripts\/npc-dialogue-runtime\.js/);assert.match(worker,/\.\/scripts\/npc-dialogue\.css/);assert.match(validator,/scripts\/npc-dialogue-core\.js/);assert.match(validator,/maxVisibleBubbles:4/);
console.log("NPC ambient dialogue contract: PASS (four-bubble limit, range, scheduling, projection and offline packaging).");

const dialogueRuntime=fs.readFileSync(__dirname+"/npc-dialogue-runtime.js","utf8");
assert.ok(dialogueRuntime.includes("render(lastSnapshot,true)"),
 "Post-render dialogue projection must reuse the matrices that produced the just-rendered frame.");
assert.ok(dialogueRuntime.includes('root.computeWorldMatrix(true)'),
 "A moving NPC root must refresh its own world matrix before screen-space projection.");
assert.ok(dialogueRuntime.includes('anchor.computeWorldMatrix(true)'),
 "The head-bone anchor must refresh its own world matrix before its screen position is calculated.");
assert.ok(dialogueRuntime.includes('lastProjection'));
assert.ok(dialogueRuntime.includes('BABYLON.MeshBuilder.CreatePlane')&&dialogueRuntime.includes('new BABYLON.DynamicTexture'),
  'The visible dialogue card must be a Babylon plane with its own text texture.');
assert.ok(dialogueRuntime.includes('slot.mesh.parent=anchor')&&dialogueRuntime.includes('slot.mesh.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL'),
  'The card must follow the actual NPC head in world space and face the camera.');
assert.ok(!dialogueRuntime.includes('elsn-npc-dialogue-layer')&&!dialogueRuntime.includes('slot.node.style.left'),
  'The legacy viewport-fixed HTML overlay must be absent.');
assert.ok(dialogueRuntime.includes('lastPositioningMs'));
assert.ok(dialogueRuntime.includes('const positioningSamples=new Float32Array(120)') &&
  dialogueRuntime.includes('positioningPercentiles()') &&
  dialogueRuntime.includes('positioningP50Ms:at(.50)') &&
  dialogueRuntime.includes('positioningP95Ms:at(.95)') &&
  dialogueRuntime.includes('positioningP99Ms:at(.99)'),
  'NPC dialogue projection must expose bounded p50/p95/p99 CPU timing samples.');
assert.ok(dialogueRuntime.includes('slot.mesh.position.set(0,anchor===root?2.12:.48+slot.index*.08,0)'), 'NPC speech cards must use a stable local head offset.');
assert.ok(dialogueRuntime.includes('slot.mesh.setEnabled(true)')&&dialogueRuntime.includes('slot.mesh.setEnabled(false)'), 'World dialogue cards must toggle visibility with NPC activity and camera visibility.');
assert.ok(dialogueRuntime.includes('slot.mesh.parent=anchor'), 'Dialogue billboard must remain parented to the live NPC transform.');
assert.ok(dialogueRuntime.includes('material.disableDepthWrite=true')&&dialogueRuntime.includes('material.useAlphaFromDiffuseTexture=true'), 'World-space dialogue material must blend transparently while keeping scene depth testing.');
console.log("NPC screen-space projection freshness and timing contract: PASS.");

// Legacy coordinate helper remains pure; the active renderer no longer positions DOM overlays.
assert.deepEqual(Core.toOverlayPoint({x:320,y:480},{left:20,top:40}),{x:300,y:440});
assert.deepEqual(Core.toOverlayPoint({x:320,y:480},{left:-12,top:8}),{x:332,y:472});
assert.equal(Core.toOverlayPoint({x:NaN,y:10},{left:0,top:0}),null);
assert.ok(dialogueRuntime.includes('const world=new BABYLON.Vector3(Number(ap.x),Number(ap.y)+(anchor===root?2.12:.48),Number(ap.z))'), 'The bubble anchor must be a real NPC head point in world coordinates.');
assert.ok(dialogueRuntime.includes('BABYLON.Vector3.Project(world,projectionIdentity,s.scene.getTransformMatrix(),viewport)'), 'Camera projection may cull off-screen NPCs but must not determine a fixed DOM placement.');
assert.ok(dialogueRuntime.includes('Core.isSegmentOccluded(cameraPosition,world,worldOcclusionBounds(s))'), 'Dialogue bubbles must hide when geometry blocks the camera-to-NPC line of sight.');
assert.ok(builder.includes('occluders:trees,naturalOccluders:naturalShrubs'), 'The game bridge must supply tree and shrub occluders.');
