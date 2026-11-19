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
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

const expectedVersion=validator.split('EXPECTED_VERSION = "')[1]?.split('"')[0];
assert.ok(buildSite.includes('scene.createOrUpdateSelectionOctree(64,3)'),"The Quality build must use Babylon spatial selection for the high-mesh-count scene.");
assert.ok(buildSite.includes('scene.onNewMeshAddedObservable.add') && buildSite.includes('scene.onMeshRemovedObservable.add'),"Meshes created or disposed after the octree build must stay correctly tracked.");
assert.ok(buildSite.includes("GroundSplashParticleBatch")&&buildSite.includes("mesh.alwaysSelectAsActiveMesh=true"),"The thin-instance splash pool must be classified as a dynamic effect and retained in the render list.");
assert.ok(buildSite.includes("particle.size=wet?rand(.12,.18)")&&buildSite.includes("particle.life=particle.maxLife=wet?rand(.72,1.02)"),"The existing splash particles must become visible without increasing their count.");
assert.ok(atmosphereSource.includes("norseSunSurfaceVertexShader")&&atmosphereSource.includes("NorseSunSurfaceMaterial"),"The release must ship the lightweight procedural photosphere on the existing sun disc.");
assert.ok(buildSite.includes('spatialDynamicReasonForMesh') && buildSite.includes('mesh.__elsnSpatialDynamic'),"Only classified dynamic actors, animated geometry and effects must enter the dynamic selection list.");
assert.ok(buildSite.includes('meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio'),"The release must report the static/dynamic selection ratio.");
assert.ok(buildSite.includes("spatialVegetationMotionPattern=/^(?:treeCanopyWindPivot|fallingTree|fallingForestTree)/i") && !buildSite.includes("spatialVegetationMotionPattern=/^(?:mixedForestTree"),"The static forest root must stay indexed; only animated canopy and felled trees should be dynamic.");
assert.ok(buildSite.includes("created-after-octree") && buildSite.includes("octree-initial-dynamic"),"New meshes and Babylon initial dynamic entries must be tracked.");
assert.ok(indexHtml.includes("addSpatialDynamicMesh(mesh,'falling-tree',true)"),"Felled trees must be transferred to dynamic octree selection before falling.");
assert.ok(buildSite.includes('buildSpatialSelectionOctree();'),"The spatial index must be built before the campaign selector is shown.");

const sourceVersion="0.6.274";
const htmlVersion=indexHtml.split('name="el-sin-nombre-build" content="')[1]?.split('"')[0];
const titleVersion=indexHtml.split('Capítulo I: Un hombre sin tierra · ')[1]?.split('<')[0];
const buildVersion=buildSite.split('USER_AGENT = "EL-SIN-NOMBRE-WebBuild/')[1]?.split(' ')[0];
const shellVersion=serviceWorker.split('const SHELL_CACHE = "el-sin-nombre-shell-')[1]?.split('"')[0];

assert.equal(expectedVersion,"0.6.330","The release validator must target the packaged 0.6.330 release.");
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
  buildSite.includes("flightRig,phase:i*1.25") &&
  buildSite.includes("alignAxis=(from,to)") &&
  buildSite.includes("visualRoot.rotationQuaternion=alignAxis(bodyAxis,new B.Vector3(0,0,1))") &&
  buildSite.includes("new B.AnimationGroup('Seagull_Flight_Loop_'+i,scene)") &&
  buildSite.includes("B.Animation.ANIMATIONTYPE_QUATERNION") &&
  buildSite.includes("addFlightTrack('LeftWing'") &&
  buildSite.includes("addFlightTrack('RightWing'") &&
  buildSite.includes("flightGroup.dispose();flightRig.animationGroup=nativeFlightClip;nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to);") &&
  buildSite.includes("const groups=inst.animationGroups||[];const nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null;") &&
  buildSite.includes("b.flightRig.animationGroup.speedRatio=.96+.08*Math.sin(elapsed*.7+b.phase)") &&
  !buildSite.includes("El GLB de gaviota no contiene el clip Fly obligatorio"),
  "The gull must be aligned horizontally and use a cached looping quaternion flight animation group.");
assert.ok(buildSite.includes("scene.setRenderingAutoClearDepthStencil(1,false,false,false)"),
  "Transparent ground effects in rendering group 1 must preserve opaque-world depth.");
assert.ok(buildSite.includes("minGapMeters:6.5") && buildSite.includes("(canopyRadius+otherRadius)*1.12") &&
  buildSite.includes("ring<=16") && buildSite.includes("overlapPairs"),
  "Conifers must use measured canopy clearances, a wider in-island relocation search and an overlap audit.");
assert.ok(atmosphereSource.includes("profile.exposure = 1.035") && atmosphereSource.includes("imageConfig.contrast = 1.10") &&
  !atmosphereSource.includes("this.scene.imageProcessingConfiguration.exposure = lighting.exposure"),
  "Dusk must not rewrite shared image-processing settings on every visual update.");
const npcDialogueRuntime=fs.readFileSync('scripts/npc-dialogue-runtime.js','utf8');
assert.ok(buildSite.includes('occluders:trees,naturalOccluders:naturalShrubs'),"The dialogue bridge must supply tree and shrub occluders.");
assert.ok(npcDialogueRuntime.includes('BABYLON.MeshBuilder.CreatePlane') &&
  npcDialogueRuntime.includes('new BABYLON.DynamicTexture') &&
  npcDialogueRuntime.includes('slot.mesh.parent=root') &&
  npcDialogueRuntime.includes('slot.mesh.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL') &&
  npcDialogueRuntime.includes('slot.mesh.position.set(0,2.48+slot.index*.42,0)') &&
  !npcDialogueRuntime.includes('BABYLON.Vector3.Project') &&
  !npcDialogueRuntime.includes('Core.isSegmentOccluded'),
  "NPC dialogue must be a distance-scheduled world-space billboard attached to the NPC root, with no fragile screen-projection gate.");
assert.ok(npcDialogueRuntime.includes('function positionTick()') &&
  npcDialogueRuntime.includes('POSITION_UPDATE_MS') &&
  npcDialogueRuntime.includes('if(!lastActive||!slots.some(slot=>slot.current)'),
  "Dialogue maintenance must run on a bounded timer only while a conversation is active.");

for(const [source,version] of Object.entries({sourceHtml:htmlVersion,sourceTitle:titleVersion,sourceBuildUserAgent:buildVersion})) {
  assert.equal(version,sourceVersion,`The source ${source} must remain the 0.6.274 input that build_site upgrades deterministically.`);
}
assert.ok(shellVersion===expectedVersion||shellVersion.startsWith(expectedVersion+"-"),"The service-worker cache must be synchronized with the packaged release while allowing cache-only revisions.");
assert.match(buildSite,/if game_version != "0\.6\.274"/,"The build must only promote the known 0.6.274 source.");
assert.match(buildSite,/html = html\.replace\("0\.6\.274", "0\.6\.330"\)/,"The build must promote every visible source version to 0.6.330.");
assert.ok(buildSite.includes("qualityDprCurrent=qualityDpr") && buildSite.includes("qualityScaleLockedForSession:true"),"Quality must keep its initially selected native render scale for the full session.");
assert.ok(!buildSite.includes("qualityDprFloor") && !buildSite.includes("qualityDprCeiling") && !buildSite.includes("qualityDprSlowSamples") && !buildSite.includes("qualityDprStableSamples") && !buildSite.includes("engine.setHardwareScalingLevel(1/qualityDprCurrent)"),"A CPU hitch must never trigger automatic resolution reduction in Quality.");
assert.ok(buildSite.includes("highHeadroomQualityMobile?2.10:1.45"),"The high-headroom mobile Quality startup scale must remain intact.");
assert.ok(!buildSite.includes("fsr1Candidate") && !buildSite.includes("fsr1InputScale"),"The build must not retain an inactive FSR1 scaling path.");
assert.ok(buildSite.includes('legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"') && buildSite.includes('html.replace(legacy_fsr_guard, "if(false){", 1)'),"The legacy FSR branch must be guarded before scene startup.");
assert.ok(buildSite.includes('"loaderVersion": BABYLON_VERSION') && buildSite.includes('"defaultBackend": "WebGL2-preferred"'),"The asset manifest must record the exact Babylon/glTF loader pair and validated backend.");
assert.ok(buildSite.includes("new B.EngineInstrumentation(engine)") && buildSite.includes("new B.SceneInstrumentation(scene)"),"The build must expose Babylon-native profiling only to diagnostics.");
assert.ok(buildSite.includes("qualityDprCurrent=qualityDpr") && buildSite.includes("qualityScaleLockedForSession:true") && !buildSite.includes("engine.setHardwareScalingLevel(1/qualityDprCurrent)"),"The Quality render scale must stay fixed during gameplay; runtime CPU pressure must not reduce image quality.");
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
assert.ok(buildSite.includes("const targetFrameRate=60;") && buildSite.includes("frameIntervalMs=1000/targetFrameRate") && buildSite.includes("renderedFps=measured"),"The Quality runtime must enforce a stable 60 Hz simulation/render cadence and report the actual processed frame rate.");
assert.ok(buildSite.includes("highHeadroomQualityMobile?2048:1024"),"High-headroom phones must get higher-resolution sand textures.");
assert.ok(buildSite.includes("reflectionFilteredMeshCount") && buildSite.includes("thinInstanceBatch") && buildSite.includes("list.length<180"),"Water reflections must filter non-essential foliage, instance batches and limit pass submissions.");
assert.ok(buildSite.includes("renderPipeline.sharpen.edgeAmount=.34") && buildSite.includes("renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))"),"Mobile quality uses native 2x MSAA and restrained sharpening.");
assert.ok(buildSite.includes("nordicWaterMirror.refreshRate=isTouchDevice?12:8"),"Mobile water reflections must be throttled to protect frame time.");
assert.ok(buildSite.includes("highHeadroomQualityMobile,reportedMemory"),"The atmosphere system must receive the detected flagship GPU tier.");
assert.match(buildSite,/game_version = "0\.6\.330"/,"After validating the 0.6.274 source, the builder must set the packaged release version to 0.6.330.");
assert.match(deployWorkflow,/group: github-pages-\$\{\{ github\.ref \}\}/,"Pages deployments must be serialized per branch.");
assert.match(deployWorkflow,/uses: actions\/deploy-pages@v5/,"The release must publish through native GitHub Pages.");
assert.ok(!indexHtml.includes('0.6.256'),"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.ok(indexHtml.includes("audioPreloadResult=await NorseAudio.preloadAll(30000)"),"The required audio barrier must retry a still-pending first preload without skipping any sound effect.");
assert.match(validator,/await Promise\.all\(\[playerHumanLoadPromise,npcStartupPromise\]\)/);
assert.match(validator,/sceneReadyTasks=\[waitForInitialViewReadiness\(\)\]/);
assert.ok(buildSite.includes("initial_view_marker") && buildSite.includes("stableReadyFrames") && buildSite.includes("mesh.isReady(true)"),"The startup barrier must wait for the actual camera-visible meshes and settled scene assets, not every off-screen island shader.");
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
assert.ok(buildSite.includes('meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled') && buildSite.includes('spatialSelectionStats.dynamicFilterEnabled=false;'),"The release must not claim dynamic frustum culling until Babylon's dynamicContent path has a supported integration.");
assert.ok(sessionRecorder.includes('meshSelectionDynamicFilterCulledPeak: number(runtime.meshSelectionDynamicFilterCulledPeak)') && sessionRecorder.includes('meshSelectionDynamicFilterMaxMs: number(runtime.meshSelectionDynamicFilterMaxMs)'),"Saved match reports must expose filter effectiveness and CPU cost.");
const sessionIdleTest=fs.readFileSync('scripts/test_session_recorder_idle_contract.cjs','utf8');
assert.ok(sessionRecorder.includes('elsn-game-session-recovery-v1') && sessionRecorder.includes('writeRecoverySnapshot(current)'),"Mobile sessions must have a synchronous emergency report before asynchronous pagehide persistence.");
assert.ok(buildSite.includes('scripts/game-session-recorder.js') && buildSite.includes('session_recorder_tag'),"The release builder must package and inject the local session recorder.");
assert.ok(serviceWorker.includes("./scripts/game-session-recorder.js"),"The installed game must cache the session recorder offline.");
assert.ok(npcRuntime.includes("function isInspectorCenterPath()") && npcRuntime.includes("Core.SPECIALISTS.map"),"The specialist runtime must execute only in Inspector Center with virtual specialist identities.");
assert.ok(!npcRuntime.includes("context.getCivilianRoster") && !npcRuntime.includes("npc.aiAgent"),"The game runtime must not attach specialist metadata to civilian actors.");
assert.ok(sessionRecorder.includes("elsn-game-session-reports") && sessionRecorder.includes("MAX_SAMPLES_PER_SESSION = 1440"),"Session reports must be stored locally with bounded samples.");
assert.ok(buildSite.includes("phase_timing_helpers") && buildSite.includes("phase_assignment_count != 20") && buildSite.includes("finishWorldPhaseTiming();") && buildSite.includes("worldPhaseTimings:getWorldPhaseTimingSnapshot()"), "The game must report the cost of each existing world-update phase.");
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
assert.ok(unifiedInspectorHtml.includes('unified-workbench.css?v=7') && unifiedInspectorHtml.includes('unified-workbench.js?v=10'),"The Inspector Center must load the updated integrated workbench assets.");
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
assert.ok(unifiedInspectorHtml.includes('unified-workbench.css?v=7') && unifiedInspectorHtml.includes('unified-workbench.js?v=10'),"The specialist report must load the current uncached workbench assets.");
assert.ok(unifiedInspectorCss.includes('.wb-specialist-grid') && unifiedInspectorCss.includes('.wb-specialist-location'),"Specialist findings and measured world coordinates must be readable on mobile.");

new (require('node:vm').Script)(unifiedInspector,{filename:'inspector/unified-workbench.js'});
new (require('node:vm').Script)(unifiedRecorder,{filename:'scripts/game-session-recorder.js'});

console.log('OK: release validator, HUD, service worker, build and deployment use one synchronized version.');
