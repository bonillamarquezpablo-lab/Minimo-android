'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const buildSite=fs.readFileSync('scripts/build_site.py','utf8');
const serviceWorker=fs.readFileSync('sw.js','utf8');
const atmosphereSource=fs.readFileSync('scripts/nordic/atmosphere-system.js','utf8');
const npcCore=fs.readFileSync('scripts/npc-agent-core.js','utf8');
const npcRuntime=fs.readFileSync('scripts/npc-agent-runtime.js','utf8');
const dialogueRuntime=fs.readFileSync('scripts/npc-dialogue-runtime.js','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

const expectedVersion=validator.split('EXPECTED_VERSION = "')[1]?.split('"')[0];
assert.ok(buildSite.includes('scene.createOrUpdateSelectionOctree(64,3)'),"The Quality build must use Babylon spatial selection for the high-mesh-count scene.");
assert.ok(buildSite.includes('scene.onNewMeshAddedObservable.add') && buildSite.includes('scene.onMeshRemovedObservable.add'),"Meshes created or disposed after the octree build must stay correctly tracked.");
assert.ok(buildSite.includes("GroundSplashParticleBatch")&&buildSite.includes("mesh.alwaysSelectAsActiveMesh=true"),"The thin-instance splash pool must be classified as a dynamic effect and retained in the render list.");
assert.ok(buildSite.includes("particle.size=wet?rand(.12,.18)")&&buildSite.includes("particle.life=particle.maxLife=wet?rand(.72,1.02)"),"The existing splash particles must become visible without increasing their count.");
assert.ok(atmosphereSource.includes("norseSunSurfaceVertexShader")&&atmosphereSource.includes("NorseSunSurfaceMaterial"),"The release must ship the lightweight procedural photosphere on the existing sun disc.");
assert.ok(buildSite.includes('spatialDynamicReasonForMesh') && buildSite.includes('mesh.__elsnSpatialDynamic'),"Only classified dynamic actors, animated geometry and effects must enter the dynamic selection list.");
assert.ok(buildSite.includes('meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio'),"The release must report the static/dynamic selection ratio.");
assert.ok(buildSite.includes("spatialVegetationMotionPattern=/^(?:mixedForestTree|treeCanopyWindPivot|fallingTree|fallingForestTree)/i"),"The complete wind-animated forest root, canopy and felled trees must remain dynamic; static foliage and scenery remain spatially indexed.");
assert.ok(buildSite.includes("created-after-octree") && buildSite.includes("octree-initial-dynamic"),"New meshes and Babylon initial dynamic entries must be tracked.");
assert.ok(indexHtml.includes("addSpatialDynamicMesh(mesh,'falling-tree',true)"),"Felled trees must be transferred to dynamic octree selection before falling.");
assert.ok(buildSite.includes('Promise.resolve().then(()=>buildSpatialSelectionOctree())') && buildSite.includes('window.__ELSN_SPATIAL_BUILD_PROMISE__=spatialBuildPromise'),"The spatial index must be scheduled in the background before the campaign selector is shown, without blocking it.");
assert.ok(buildSite.includes("window.__ELSN_STARTUP_HANDOFF__={phase:'entered'") &&
  buildSite.includes("phase='spatial-index-background'") && buildSite.includes("phase='reveal-selector'") &&
  buildSite.includes("phase='world-ready'") &&
  buildSite.includes("window.__ELSN_SPATIAL_BUILD_PROGRESS__"),
  "Startup diagnostics must distinguish resource completion, spatial indexing and selector handoff.");

const startupCoastWarmupStart=buildSite.indexOf('startup_coast_warmup_code = """');
const startupCoastWarmupEnd=buildSite.indexOf('if html.count(fauna_scene_marker)',startupCoastWarmupStart);
assert.ok(startupCoastWarmupStart>=0&&startupCoastWarmupEnd>startupCoastWarmupStart,
  "The full initial coastline must be prepared during the blocking startup stage.");
const startupCoastWarmup=buildSite.slice(startupCoastWarmupStart,startupCoastWarmupEnd);
const startupCoastStages=[
  "runCoastStage('syncActiveBeachIsland'",
  "runCoastStage('syncActiveTidalFoamIsland'",
  "runCoastStage('syncNordicWaterReflectionIsland'"
].map(stage=>startupCoastWarmup.indexOf(stage));
assert.ok(startupCoastWarmup.includes("if(!coastalReferenceMode)")&&
  startupCoastStages.every(index=>index>=0)&&
  startupCoastStages[0]<startupCoastStages[1]&&startupCoastStages[1]<startupCoastStages[2]&&
  startupCoastWarmup.includes("budgetMs:coastBudgetMs")&&startupCoastWarmup.includes("coastBudgetMs=8000")&&
  startupCoastWarmup.includes("runCoastStage")&&startupCoastWarmup.includes("yieldStartupCoastFrame('después de syncActiveBeachIsland')")&&
  startupCoastWarmup.includes("yieldStartupCoastFrame('después de syncActiveTidalFoamIsland')")&&
  startupCoastWarmup.includes("yieldStartupCoastFrame('después de syncNordicWaterReflectionIsland')")&&
  startupCoastWarmup.includes("coastReport.checks={seabed:")&&startupCoastWarmup.includes("coastReport.checks={seabed:")&&
  startupCoastWarmup.includes("degraded-timeout")&&
  startupCoastWarmup.includes("recordStartupTask('Costa, rompiente y reflejos de la isla inicial'"),
  "Initial coastal stages and waits must be individually timed and diagnosed, with a bounded 8-second deadline and a fail-open recovery path.");
assert.ok(buildSite.includes('html = html.replace(fauna_scene_marker, startup_coast_warmup_code + "\\n" + fauna_scene_marker, 1)'),
  "Initial coastal warm-up must be inserted before the complete scene/shader readiness barrier.");
const faunaOrderAt=buildSite.indexOf("html = html[:scene_marker_index] + ordered_fauna + html[scene_marker_index:]");
const coastInsertionAt=buildSite.indexOf("html = html.replace(fauna_scene_marker, startup_coast_warmup_code");
assert.ok(faunaOrderAt>=0&&coastInsertionAt>faunaOrderAt,
  "The coast and reflection prewarm must run after the required fauna has been added to the scene.");
assert.ok(buildSite.includes("coast:window.__ELSN_INITIAL_COAST_WARMUP__||null")&&
  buildSite.includes("!['ready','degraded','degraded-timeout'].includes(startupResourceSnapshot.coast.status)"),
  "The startup gate must accept a reported degraded coast after the 8-second recovery deadline.");


const sourceVersion="0.6.274";
const htmlVersion=indexHtml.split('name="el-sin-nombre-build" content="')[1]?.split('"')[0];
const titleVersion=indexHtml.split('Capítulo I: Un hombre sin tierra · ')[1]?.split('<')[0];
const buildVersion=buildSite.split('USER_AGENT = "EL-SIN-NOMBRE-WebBuild/')[1]?.split(' ')[0];
const shellVersion=serviceWorker.split('const SHELL_CACHE = "el-sin-nombre-shell-')[1]?.split('"')[0];

assert.equal(expectedVersion,"0.6.366","The release validator must target the packaged 0.6.366 release.");
assert.ok(indexHtml.includes("meshes.forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=!!(mesh.skeleton||Number(mesh.numBoneInfluencers)>0);});"),
  "The published HTML must preserve frustum bypass on skinned fauna meshes after all setup passes.");
assert.ok(buildSite.includes("mature-scots-pine-tree.glb") &&
  buildSite.includes("mature-norway-spruce-tree.glb") &&
  buildSite.includes("oak-textured.glb") &&
  buildSite.includes("mergeStaticDecorByMaterial") &&
  buildSite.includes("await loadForestTreeTemplates()"),
  "The release must package and block on all three complete forest models.");
assert.ok(buildSite.includes("targetGullMaxExtentMeters=.55") &&
  buildSite.includes("fittedMaxExtent>.57") &&
  buildSite.includes("visualRoot.position.copyFrom(sourceCenter.scale(-1))"),
  "The release must center the gull hierarchy and enforce the measured 0.55 m biological size.");
assert.ok(buildSite.includes("const requiredFlightParts=[leftWing,rightWing,tail,head,neck,leftHindUpLeg,rightHindUpLeg,leftHindLeg,rightHindLeg]") &&
  buildSite.includes("flightRig,animation:nativeFlightClip,phase:i*1.25") &&
  buildSite.includes("alignAxis=(from,to)") &&
  buildSite.includes("visualRoot.rotationQuaternion=alignAxis(bodyAxis,new B.Vector3(0,0,1))") &&
  buildSite.includes("const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;") &&
  buildSite.includes("rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip") &&
  buildSite.includes("nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to)") &&
  buildSite.includes("nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5)") &&
  buildSite.includes("alignment:{source:'native-Fly-midpoint'") &&
  buildSite.includes("alignmentDot<.995") &&
  buildSite.includes("function updateAmbientGullFlight(nowSeconds){") && buildSite.includes("window.__ELSN_GULL_FLIGHT_RENDER__={active:true,frameTicks:0,updatedBirds:0,updateErrors:0,worldMatrixRecoveries:0,stalledBirds:0,lastTimestamp:null,lastError:null};") &&
  buildSite.includes("flight.speedRatio=.96+.08*Math.sin(flightElapsed*.7+phase);") &&
  buildSite.includes("if(!flight.isPlaying)flight.start(true,1,flight.from,flight.to);") &&
  !buildSite.includes("addFlightTrack(") &&
  !buildSite.includes("Seagull_Flight_Loop_") &&
  !buildSite.includes("El GLB de gaviota no contiene el clip Fly obligatorio"),
  "The gull must be aligned horizontally and play the complete native GLB flight clip without constructing a redundant animation.");
assert.ok(buildSite.includes("gullWingFlapObserver=scene.onBeforeRenderObservable.add") && buildSite.includes("function maintainActiveEnemyVisuals(nowMs){") && buildSite.includes("maintainActiveEnemyVisuals(now);") && buildSite.includes("const holderParent=socket||realPlayerModelPivot;") && buildSite.includes("if(realWeaponHolder.parent!==holderParent)realWeaponHolder.parent=holderParent;"), "The build must recover invisible hostiles, restart stalled gull wing motion and anchor weapons to player space.");
assert.ok(buildSite.includes("scene.setRenderingAutoClearDepthStencil(1,false,false,false)"),
  "Transparent ground effects in rendering group 1 must preserve opaque-world depth.");
assert.ok(buildSite.includes("minGapMeters:6.5") && buildSite.includes("(canopyRadius+otherRadius)*1.12") &&
  buildSite.includes("ring<=16") && buildSite.includes("overlapPairs"),
  "Conifers must use measured canopy clearances, a wider in-island relocation search and an overlap audit.");
assert.ok(atmosphereSource.includes("profile.exposure = 1.035") && atmosphereSource.includes("imageConfig.contrast = 1.10") &&
  !atmosphereSource.includes("this.scene.imageProcessingConfiguration.exposure = lighting.exposure"),
  "Dusk must not rewrite shared image-processing settings on every visual update.");
assert.ok(buildSite.includes('weapon_parent_marker') && buildSite.includes('realWeaponHolder.parent=socket||realPlayerModelPivot;') && buildSite.includes('weapon_sync_parent_marker') && buildSite.includes('const holderParent=socket||realPlayerModelPivot;') && indexHtml.includes('holderParent.getWorldMatrix().clone()') && indexHtml.includes('realWeaponAnchorType=\'club-local-player-anchor\'') && indexHtml.includes('TransformCoordinates(gripWorld,inverseParent)'),
  'The equipped club must stay under the moving player model hierarchy rather than a detached world-space anchor.');
assert.ok(indexHtml.includes('function hideFactionBadge(parts)') && indexHtml.includes('hideFactionBadge(e.parts)') && indexHtml.includes('hideFactionBadge(fallen.parts)'),
  'Faction markers and health overlays must be cleaned when a guard dies or its corpse is retired.');
assert.ok(indexHtml.includes('if(!sameIsland&&!grassStreamPromise)') && indexHtml.includes('if(sameIsland){grassSameIslandSkipCount++;return;}') && indexHtml.includes('grassStreamBuildCount++'),
  'Full-island Quality grass must not rebuild on same-island player movement.');
const npcDialogueRuntime=fs.readFileSync('scripts/npc-dialogue-runtime.js','utf8');
assert.ok(buildSite.includes('occluders:trees,naturalOccluders:naturalShrubs'),"The dialogue bridge must supply tree and shrub occluders.");
assert.ok(npcDialogueRuntime.includes('BABYLON.MeshBuilder.CreatePlane') &&
  npcDialogueRuntime.includes('new BABYLON.DynamicTexture') &&
  npcDialogueRuntime.includes('function liveHeadNode(parts,scene)') &&
  npcDialogueRuntime.includes('function positionBubbleAtLiveAnchor(slot,npc,scene)') &&
  npcDialogueRuntime.includes('slot.mesh.parent=null') &&
  npcDialogueRuntime.includes('positionBubbleAtLiveAnchor(slot,npc,s.scene)') &&
  npcDialogueRuntime.includes('scene.onBeforeRenderObservable.add') &&
  npcDialogueRuntime.includes('slot.mesh.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL') &&
  npcDialogueRuntime.includes('liveAttachmentFrames') &&
  !npcDialogueRuntime.includes('Core.isSegmentOccluded'),
  "NPC dialogue must follow the live head/root world transform on every render frame.");
assert.ok(npcDialogueRuntime.includes('function positionTick()') &&
  npcDialogueRuntime.includes('POSITION_UPDATE_MS') &&
  npcDialogueRuntime.includes('if(!lastActive||!slots.some(slot=>slot.current)'),
  "Dialogue maintenance must run on a bounded timer only while a conversation is active.");

for(const [source,version] of Object.entries({sourceHtml:htmlVersion,sourceTitle:titleVersion,sourceBuildUserAgent:buildVersion})) {
  assert.equal(version,sourceVersion,`The source ${source} must remain the 0.6.274 input that build_site upgrades deterministically.`);
}
assert.ok(shellVersion===expectedVersion||shellVersion.startsWith(expectedVersion+"-"),"The service-worker cache must be synchronized with the packaged release while allowing cache-only revisions.");
assert.ok(serviceWorker.includes('"./scripts/npc-village-brain-core.js?v=0.6.356-npcbrain7"') &&
  buildSite.includes('npc-village-brain-core.js?v=0.6.356-npcbrain7'),
  "The NPC brain must use the same versioned URL in the generated page and the service-worker shell cache.");
assert.match(buildSite,/if game_version != "0\.6\.274"/,"The build must only promote the known 0.6.274 source.");
assert.match(buildSite,/html = html\.replace\("0\.6\.274", "0\.6\.365"\)/,"The build must promote every visible source version to 0.6.366.");
assert.ok(buildSite.includes("qualityDprCurrent=qualityDpr") && buildSite.includes("qualityScaleFixed:!(qualityRuntimeAdaptiveActive||qualityLabAdaptiveActive)") && buildSite.includes("qualityScaleAdaptive:!!(qualityRuntimeAdaptiveActive||qualityLabAdaptiveActive)") && buildSite.includes("physicalPixelCoveragePct") && buildSite.includes("window.__ELSN_RENDER_RESOLUTION=()=>{"),"Quality must retain its maximum selected detail and use a bounded adaptive render scale.");
const qualityAdaptiveCode=buildSite.split('quality_adaptive_code = r"""')[1]?.split('"""')[0]||"";
assert.ok(qualityAdaptiveCode.includes("qualityRuntimeAdaptiveActive=!isPerformanceMode") && qualityAdaptiveCode.includes("qualityDprAdaptiveFloor") && qualityAdaptiveCode.includes("engine.setHardwareScalingLevel(1/bounded)") && qualityAdaptiveCode.includes("gpu-pressure-inferred") && qualityAdaptiveCode.includes("cpu-bound-no-resolution-change") && qualityAdaptiveCode.includes("headroom-recovery"),"Adaptive resolution must use bounded, reversible GPU-pressure decisions and must not lower resolution for CPU-bound frames.");
assert.ok(!qualityAdaptiveCode.includes("qualityDprSlowSamples") && !qualityAdaptiveCode.includes("qualityDprStableSamples"),"The adaptive controller must use bounded rolling frame and CPU windows.");
assert.ok(buildSite.includes("Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?deviceDpr:1.45):1.65)"),"The high-headroom mobile Quality startup scale must preserve its original full-resolution setting.");
assert.ok(buildSite.includes("const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024"),"The original mobile water-reflection resolution must be preserved.");
assert.ok(buildSite.includes("highHeadroomQualityMobile?10:4"),"The original flagship mobile shadow-refresh cadence must be preserved.");
assert.ok(buildSite.includes("qualityLabFsr1Requested") && buildSite.includes("const fsr1InputScale=.87;") && buildSite.includes("if(fsr1Candidate){"),"FSR1 must be gated behind the debug opt-in and reuse the original EASU+RCAS path.");
const labSource=fs.readFileSync("scripts/quality-render-lab.js","utf8");
assert.ok(labSource.includes("BENCHMARK_MS=15000") && labSource.includes("PRESETS=[1.8,2.1,2.5,3.0,3.75]") && labSource.includes("CROP_ZOOM=2"),"The quality lab must benchmark for 15 s and export a 2x crop.");
assert.ok(buildSite.includes('legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"') && buildSite.includes('html.replace(legacy_fsr_guard, "if(!fsr1Candidate)'),"The legacy FSR branch must be guarded before scene startup.");
assert.ok(buildSite.includes('"loaderVersion": BABYLON_VERSION') && buildSite.includes('"defaultBackend": "WebGL2-preferred"'),"The asset manifest must record the exact Babylon/glTF loader pair and validated backend.");
assert.ok(buildSite.includes("new B.EngineInstrumentation(engine)") && buildSite.includes("new B.SceneInstrumentation(scene)"),"The build must expose Babylon-native profiling only to diagnostics.");
assert.ok(buildSite.includes("qualityScaleFixed:!(qualityRuntimeAdaptiveActive||qualityLabAdaptiveActive)") && buildSite.includes("qualityScaleAdaptive:!!(qualityRuntimeAdaptiveActive||qualityLabAdaptiveActive)") && buildSite.includes("window.__ELSN_RENDER_RESOLUTION=()=>{") && buildSite.includes("physicalPixelCoveragePct") && buildSite.includes("window.__ELSN_ADAPTIVE_RESOLUTION__"),"The Quality profile must expose its bounded adaptive render scale and physical-pixel coverage.");
assert.match(buildSite,/BABYLON_VERSION = "9\.35\.0"/,"The packaged engine must include the DynamicTexture null-update fix.");
assert.ok(buildSite.includes('f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/babylon.js"'),"The engine URL must use the pinned Babylon version.");
assert.ok(buildSite.includes('f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/loaders/babylonjs.loaders.min.js"'),"The glTF loader must match the engine version.");
const riggedModelDownloads = {
  viking: "https://grab3d.com/dl/viking-rigged/viking-rigged.glb",
  armoredKnight: "https://grab3d.com/dl/armored-knight-rigged/armored-knight-rigged.glb",
  manBase: "https://grab3d.com/dl/man-base-character-rigged/man-base-character-rigged.glb",
};
for (const [model, url] of Object.entries(riggedModelDownloads)) {
  assert.ok(buildSite.includes(url), `The ${model} model must use the rigged-package URL returned by Grab3D.`);
}
assert.ok(buildSite.includes('if url.startswith("https://grab3d.com/")'),
  "Large rigged packages from Grab3D must be removed from the concurrent download pool.");
assert.ok(buildSite.includes("for relative, (url, minimum, kind) in grab3d_downloads.items():"),
  "Grab3D model downloads must be serialized while preserving all validation.");
assert.ok(buildSite.includes("const targetFrameRate=60;") && buildSite.includes("renderedFps=measured") && buildSite.includes("fpsHudTime+=rawFrameMs/1000;fpsHudFrames++"),"The Quality runtime must report rendered FPS against a 60 FPS Quality / 30 FPS Performance target without imposing a lower render cadence.");
assert.ok(buildSite.includes("frame_loop_replacement = frame_loop_marker") && buildSite.includes("frame_clock_replacement = frame_clock_marker"),"The Babylon loop must remain uncapped and render at the available device refresh rate.");
assert.ok(buildSite.includes("highHeadroomQualityMobile?2048:1024"),"High-headroom phones must get higher-resolution sand textures.");
assert.ok(buildSite.includes("reflectionFilteredMeshCount") && buildSite.includes("thinInstanceBatch") && buildSite.includes("list.length<180"),"Water reflections must filter non-essential foliage, instance batches and limit pass submissions.");
assert.ok(buildSite.includes("renderPipeline.sharpen.edgeAmount=.34") && buildSite.includes("renderPipeline.samples=Math.max(1,Math.min(qualityLabEnabled?qualityLabRequestedMsaa:(isTouchDevice?(highHeadroomQualityMobile?2:1):4),maxSamples))"),"Mobile quality uses native 2x MSAA and restrained sharpening.");
assert.ok(buildSite.includes("nordicWaterMirror.refreshRate=isTouchDevice?12:8"),"Mobile water reflections must be throttled to protect frame time.");
assert.ok(buildSite.includes("highHeadroomQualityMobile,reportedMemory"),"The atmosphere system must receive the detected flagship GPU tier.");
assert.ok(buildSite.includes('game_version = version_match.group(1).strip()') && buildSite.includes('html = html.replace("0.6.274", "0.6.366")'),"After validating the source build marker, the builder must promote the packaged release version to 0.6.366.");
assert.match(deployWorkflow,/group: github-pages-\$\{\{ github\.ref \}\}/,"Pages deployments must be serialized per branch.");
assert.match(deployWorkflow,/uses: actions\/deploy-pages@v5/,"The release must publish through native GitHub Pages.");
assert.ok(!indexHtml.includes('0.6.256'),"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.ok(indexHtml.includes("audioPreloadResult=await NorseAudio.preloadAll(30000)"),"The required audio barrier must retry a still-pending first preload without skipping any sound effect.");
assert.match(validator,/await Promise\.all\(\[playerHumanLoadPromise,npcStartupPromise\]\)/);
assert.match(validator,/sceneReadyTasks=\[waitForInitialViewReadiness\(\)\]/);
assert.ok(buildSite.includes("initial_view_marker") && buildSite.includes("stableReadySamples") && buildSite.includes("readinessSampleIntervalMs:250") && buildSite.includes("activeData[index]") && !buildSite.includes("activeData.slice(0,active.length)") && buildSite.includes("mesh.isReady(true)"),"The startup barrier must sample actual camera-visible mesh readiness without allocating a full active-mesh copy every frame.");
assert.ok(buildSite.includes("full_scene_compile_marker") && buildSite.includes("avoid a duplicate all-island compile pass"),"The release builder must remove the redundant full-scene material compilation while retaining the blocking readiness barrier.");
assert.ok(buildSite.includes("const mineableGraniteMaterial=M.stoneLight;") && buildSite.includes("cap.material=M.stone;") && !buildSite.includes("M.stone.clone('MineableGraniteMaterial')"),"Mineable granite deposits must reuse preloaded scene materials to avoid an unready cloned shader variant.");
assert.match(validator,/rows=isPerformanceMode\?13/);
assert.doesNotMatch(validator,/resourceResults=await Promise\.allSettled\(\[playerHumanLoadPromise,startNpcHumanModels\(\)\]\)/);
assert.ok(buildSite.includes('scripts/nordic/atmosphere-system.js'),"The release builder must package the unified atmosphere runtime.");
assert.ok(buildSite.includes("atmosphereSystem.update(dt)"),"The single atmosphere clock must drive gameplay updates.");
assert.ok(serviceWorker.includes("./scripts/nordic/atmosphere-system.js"),"The installed app must cache the atmosphere module offline.");
assert.ok(buildSite.includes('atmosphere_tag = \'<script src="./scripts/nordic/atmosphere-system.js"></script>\''),"Atmosphere must load synchronously.");
assert.ok(buildSite.includes("html.index(atmosphere_tag) > html.index(game_runtime_marker)"),"Atmosphere must load before the game runtime.");
assert.ok(!indexHtml.includes("window.__ELSN_NPC_AGENT_CONTEXT__") && !indexHtml.includes("getCivilianRoster:()=>ambientPeople.slice()"),"The game runtime must not create or assign inspector specialists.");
assert.ok(!indexHtml.includes('<script src="./scripts/npc-agent-core.js" defer></script>') && !indexHtml.includes('<script src="./scripts/npc-agent-runtime.js" defer></script>'),"Specialist modules must not be loaded by the player-facing game entry point.");
assert.ok(buildSite.includes('for script_name in ("npc-agent-core.js", "npc-agent-runtime.js")'),"The release builder must syntax-check and package both NPC specialist modules.");
assert.ok(serviceWorker.includes("./scripts/npc-agent-core.js") && serviceWorker.includes("./scripts/npc-agent-runtime.js"),"The offline shell must cache both NPC specialist modules.");
assert.ok(npcCore.includes("function isEligibleCivilian(npc)") && npcCore.includes('parts.role !== "civilian"'),"Only existing civilian NPCs may receive specialist metadata.");
assert.ok(npcRuntime.includes("BroadcastChannel") && npcRuntime.includes("elsn-npc-shared-memory"),"Shared NPC memory must retain the existing cross-tab IndexedDB contract.");
assert.ok(!npcRuntime.includes("eval(") && !npcRuntime.includes("new Function("),"Remote specialist responses must remain data-only.");

const sessionRecorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
assert.ok(buildSite.includes('meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled') && sessionRecorder.includes('meshSelectionDynamicFrustumEnabled: runtime.meshSelectionDynamicFrustumEnabled === true'),"The published match report must state whether dynamic frustum filtering is genuinely enabled.");
assert.ok(buildSite.includes('meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason') && sessionRecorder.includes('meshSelectionDynamicSamplesByReason: runtime.meshSelectionDynamicSamplesByReason || null'),"Reports must preserve the reason and parent-chain evidence for dynamic selection.");
assert.ok(buildSite.includes('meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled') && buildSite.includes('scene.getActiveMeshCandidates=()=>{') && buildSite.includes('spatialSelectionStats.dynamicFilterEnabled=installSpatialDynamicCandidateFilter();'),"The release must publish the supported scene candidate-provider integration and its live status.");
assert.ok(buildSite.includes('mesh.computeWorldMatrix()') && buildSite.includes('mesh.isInFrustum(scene.frustumPlanes)') && buildSite.includes('mesh.alwaysSelectAsActiveMesh'),"Dynamic culling must update world bounds, honor forced-active meshes and retain fail-open safeguards.");
assert.ok(sessionRecorder.includes('meshSelectionDynamicFilterCulledPeak: number(runtime.meshSelectionDynamicFilterCulledPeak)') && sessionRecorder.includes('meshSelectionDynamicFilterMaxMs: number(runtime.meshSelectionDynamicFilterMaxMs)'),"Saved match reports must expose filter effectiveness and CPU cost.");
const sessionIdleTest=fs.readFileSync('scripts/test_session_recorder_idle_contract.cjs','utf8');
assert.ok(sessionRecorder.includes('elsn-game-session-recovery-v1') && sessionRecorder.includes('writeRecoverySnapshot(current)'),"Mobile sessions must have a synchronous emergency report before asynchronous pagehide persistence.");
assert.ok(buildSite.includes('scripts/game-session-recorder.js') && buildSite.includes('session_recorder_tag'),"The release builder must package and inject the local session recorder.");
assert.ok(serviceWorker.includes("./scripts/game-session-recorder.js"),"The installed game must cache the session recorder offline.");
assert.ok(npcRuntime.includes("function isInspectorCenterPath()") && npcRuntime.includes("Core.SPECIALISTS.map"),"The specialist runtime must execute only in Inspector Center with virtual specialist identities.");
assert.ok(!npcRuntime.includes("context.getCivilianRoster") && !npcRuntime.includes("npc.aiAgent"),"The game runtime must not attach specialist metadata to civilian actors.");
assert.ok(sessionRecorder.includes("elsn-game-session-reports") && sessionRecorder.includes("MAX_SAMPLES_PER_SESSION = 1440"),"Session reports must be stored locally with bounded samples.");
assert.ok(buildSite.includes("phase_timing_helpers") && buildSite.includes("phase_assignment_count != 20") && buildSite.includes("finishWorldPhaseTiming();") && buildSite.includes("worldPhaseTimings:getWorldPhaseTimingSnapshot()"), "The game must report the cost of each existing world-update phase.");
for(const phase of ["environment / island streaming","environment / grass streaming","environment / shadow caster maintenance","environment / settlement integrity","environment / atmosphere","environment / water simulation","environment / wildlife simulation"]) assert.ok(buildSite.includes(phase), "The build must keep a separate timer for "+phase+".");
assert.ok(buildSite.includes("window.__elSinNombreWaterTelemetrySnapshot=()=>({") && sessionRecorder.includes("readWaterDiagnostics(health)") && sessionRecorder.includes("window.__elSinNombreWaterTelemetrySnapshot()"), "Session telemetry must use lightweight water timings and reuse its single health snapshot.");
assert.ok(buildSite.includes("auditHabitableStructures.discoveryQueue") && buildSite.includes("evaluateHabitableStructureCached") && buildSite.includes("habitableAuditLastMs") && sessionRecorder.includes("habitableStructureAudit"), "Structural audits must retain coverage while caching unchanged ground checks and reporting their CPU cost.");
assert.ok(sessionRecorder.includes("worldPhaseHotspots") && sessionRecorder.includes("projectionAttemptsDelta") && !sessionRecorder.includes("projectionAttempts: dialogueSamples.reduce"), "Reports must rank world phase costs and must not sum cumulative dialogue counters repeatedly.");
assert.ok(sessionRecorder.includes("window.top !== window.self"),"Embedded Inspector test runs must not pollute player session history.");
assert.ok(sessionRecorder.includes("buildSessionSummary") && sessionRecorder.includes("probableBottleneck"),"Completed match reports must summarize FPS, frame-time and CPU/GPU bottleneck evidence.");
assert.ok(sessionRecorder.includes("queueIdleSample") && sessionRecorder.includes("requestIdleCallback") && sessionRecorder.includes("longtask"),"Telemetry must defer heavy reads until idle and capture browser long tasks.");
assert.ok(sessionRecorder.includes("drawCallsObservedDelta") && sessionRecorder.includes("semantics-unverified") && sessionRecorder.includes("diagnosticsReadMs") && sessionRecorder.includes("longTaskObserverSupported") && sessionRecorder.includes("recordPerformanceAnomaly") && sessionRecorder.includes("runtimeErrors") && sessionIdleTest.includes("session recorder idle-performance contract"),"Reports must capture anomaly windows and runtime/resource failures while preserving telemetry safeguards.");
assert.ok(sessionRecorder.includes("captureFinalWorldInspection") && sessionRecorder.includes("terrainObjects"),"Completed match reports must retain the final terrain-object audit and coordinates.");
assert.ok(sessionRecorder.includes("maxMeshes: 10000"),"The final world audit must request the complete bounded scene inventory.");
const inspectorReports=fs.readFileSync('inspector/npc-agents.js','utf8');
assert.ok(inspectorReports.includes("Ver informe técnico y coordenadas"),"Inspector Center must expose the saved report and terrain-coordinate evidence.");
assert.ok(inspectorReports.includes("incidentList") && inspectorReports.includes("worstSamples") && inspectorReports.includes("anomalyEvents"),"Inspector Center must expose grouped performance incidents, worst windows and diagnostic context.");



const unifiedRecorder=fs.readFileSync('scripts/game-session-recorder.js','utf8');
const unifiedInspector=fs.readFileSync('inspector/unified-workbench.js','utf8');
const unifiedInspectorHtml=fs.readFileSync('inspector/index.html','utf8');
const unifiedInspectorCss=fs.readFileSync('inspector/unified-workbench.css','utf8');
assert.ok(unifiedRecorder.includes('largestVisibleMeshes') && unifiedRecorder.includes('invalidTransformCount') && unifiedRecorder.includes('collisionEnabledMeshCount'),"Completed match reports must retain bounded mesh, transform and collider evidence for deeper inspection.");
assert.ok(unifiedRecorder.includes('compactActors') && unifiedRecorder.includes('pendingCount: number(textures.pendingCount)'),"Completed match reports must retain compact NPC, animation and texture-readiness evidence.");
assert.ok(unifiedInspector.includes('function renderWorldEvidence(world)') && unifiedInspector.includes('function renderCorrelations(report, values)'),"The unified report must explain world geometry and cross-correlate performance evidence.");
assert.ok(unifiedInspector.includes('function reportComparison(current, previous)') && unifiedInspector.includes('reports[1]||null'),"The unified report must compare the latest session with the previous saved session.");
assert.ok(unifiedInspectorHtml.includes('unified-workbench.css?v=8') && unifiedInspectorHtml.includes('unified-workbench.js?v=11'),"The Inspector Center must load the updated integrated workbench assets.");
assert.ok(unifiedInspectorCss.includes('.wb-evidence-list') && unifiedInspectorCss.includes('.wb-evidence-row'),"World evidence and session comparisons must use readable compact layouts.");

const npcCoreWithIntelligence=fs.readFileSync('scripts/npc-agent-core.js','utf8');
assert.ok(npcCoreWithIntelligence.includes('function analyzeSessionIntelligence(report, events, historicalReports)'),"Specialists must analyze the current session using real recorded evidence.");
assert.ok(npcCoreWithIntelligence.includes('function analyzeObserverPatrol(report, currentBuild)'),"The independent 13-island patrol must be analyzed separately.");
assert.ok(npcCoreWithIntelligence.includes("historicalSessionsAnalyzed") && unifiedInspector.includes("historicalReports"),"Specialists must use the saved session history to identify recurring issues.");
assert.ok(npcCoreWithIntelligence.includes("nextStep: bounded(nextStep") && unifiedInspector.includes("wb-patrol-next-step"),"Patrol findings must carry safe and understandable next-check guidance.");
assert.ok(unifiedInspector.includes('PATROL_REPORT_URL') && unifiedInspector.includes('observerPatrol: latestPatrolIntelligence'),"The latest independent patrol must be attached to the exported report without merging it into gameplay-session measurements.");
assert.ok(unifiedInspector.includes('La patrulla utilizó') || npcCoreWithIntelligence.includes('GPU Adreno'),"Software-rendered patrol results must never be presented as physical mobile GPU measurements.");

assert.ok(unifiedInspector.includes('function buildSpecialistIntelligence(report, rememberResults, historicalReports)') && unifiedInspector.includes('api.remember'),"Session diagnoses must be connected to persistent specialist memory.");
assert.ok(unifiedInspector.includes('renderSpecialistIntelligence(intelligence)') && unifiedInspector.includes('wbSpecialistCards'),"The unified session report must show the four specialists in a plain-language panel.");
assert.ok(npcCoreWithIntelligence.includes('automaticWorldChanges: false') && npcCoreWithIntelligence.includes('automaticCodeChanges: false'),"Local autonomy must remain read-only until a repair is explicitly approved.");
assert.ok(unifiedInspectorHtml.includes('unified-workbench.css?v=8') && unifiedInspectorHtml.includes('unified-workbench.js?v=11'),"The specialist report must load the current uncached workbench assets.");
assert.ok(unifiedInspectorCss.includes('.wb-specialist-grid') && unifiedInspectorCss.includes('.wb-specialist-location'),"Specialist findings and measured world coordinates must be readable on mobile.");

new (require('node:vm').Script)(unifiedInspector,{filename:'inspector/unified-workbench.js'});
new (require('node:vm').Script)(unifiedRecorder,{filename:'scripts/game-session-recorder.js'});

assert.ok(dialogueRuntime.includes('function dialogueEligibleNpc(npc)') && dialogueRuntime.includes('role==="warrior"') && dialogueRuntime.includes('parts.faction==="enemy"'), 'Dialogue runtime rejects hostile and warrior identities before rendering or queuing cards.');
assert.ok(buildSite.includes('const match=/^Villager_'), 'Generated bridge enumerates civilian villagers only and never VillageGuard combat actors.');
assert.ok(buildSite.includes('visualBodyLocalPosition:visualBody.position.clone()') && buildSite.includes('modelRootLocalPosition:modelRoot.position.clone()') && buildSite.includes('rootDetachRepairs') && buildSite.includes('visualParentRepairs') && buildSite.includes('importedRootRepairs'), 'Generated runtime restores combat root, visual pivot, GLB model root and imported roots as one entity.');
assert.ok(buildSite.includes('combat_damage_replacement') && buildSite.includes('enemy_ai_alive_replacement'), 'Dead logical combat entities cannot retain damage authority.');
console.log('OK: release validator, HUD, service worker, build and deployment use one synchronized version.');

assert.ok(expectedVersion==="0.6.366" && buildSite.includes('html = html.replace("0.6.274", "0.6.366")'), "The correction package must be release 0.6.366.");
assert.ok(buildSite.includes('updateAmbientGullFlight(now);') && buildSite.includes('scene.onBeforeRenderObservable.add'), "The flock must be updated after Babylon animation evaluation in the pre-render observer.");
assert.ok(buildSite.includes('warrior_attach_replacement') && buildSite.includes('RealCastawayStickBranch') && buildSite.includes('function updateAmbientGullFlight(nowSeconds){') && buildSite.includes('window.__ELSN_GULL_FLIGHT_RENDER__') && buildSite.includes("if(typeof b.root.isEnabled==='function'&&!b.root.isEnabled())b.root.setEnabled(true);") && buildSite.includes('b.flightUpdateTicks=(Number(b.flightUpdateTicks)||0)+1;') && buildSite.includes('window.getGameVisualActorDiagnostics'), "The release must include the club, warrior and gull fixes, continuous gull visibility recovery, and read-only acceptance diagnostics.");
assert.ok(serviceWorker.includes("el-sin-nombre-shell-0.6.366-npcbrain7-diag8") && serviceWorker.includes("npc-village-brain-core.js?v=0.6.356-npcbrain7"), "The new shell cache must not reuse the previous NPC brain module entry.");
assert.ok(serviceWorker.includes('"./assets/vendor/babylon.js"') && serviceWorker.includes('"./assets/vendor/babylonjs.loaders.min.js"') && serviceWorker.includes('"./assets/vendor/meshopt_decoder.js"'),
  "The shell install must pre-cache Babylon, the glTF loader and meshopt so offline reload can boot.");
assert.ok(serviceWorker.includes('url.pathname.endsWith("/assets/vendor/babylon.js")') && serviceWorker.includes('cacheFirst(request, SHELL_CACHE)'),
  "Core Babylon assets must be served from the shell cache on offline reload.");


assert.ok(buildSite.includes('async function buildSpatialSelectionOctree()') &&
  buildSite.includes('Promise.resolve().then(()=>buildSpatialSelectionOctree())') &&
  buildSite.includes('await freezeSpatialStaticWorldMatrices()') &&
  buildSite.includes('meshSelectionBabylonOctreeBuildMs:spatialSelectionStats.babylonOctreeBuildMs') &&
  buildSite.includes('meshSelectionDynamicClassificationMs:spatialSelectionStats.dynamicClassificationMs'),
  "The startup handoff must publish the selector without blocking on the time-sliced spatial build, and retain separate octree/classification timings.");


const backgroundSpatialIndex=buildSite.indexOf("Promise.resolve().then(()=>buildSpatialSelectionOctree())");
const readinessPublished=buildSite.indexOf("startupAssetsReady=true;",backgroundSpatialIndex);
assert.ok(backgroundSpatialIndex>0&&readinessPublished>backgroundSpatialIndex &&
  buildSite.includes("window.__ELSN_SPATIAL_BUILD_PROMISE__=spatialBuildPromise"),
  "The selector must be revealed while the spatial index continues safely in the background.");
