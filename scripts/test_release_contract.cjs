'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const validator=fs.readFileSync('scripts/validate_release.py','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const buildSite=fs.readFileSync('scripts/build_site.py','utf8');
const serviceWorker=fs.readFileSync('sw.js','utf8');
const npcCore=fs.readFileSync('scripts/npc-agent-core.js','utf8');
const npcRuntime=fs.readFileSync('scripts/npc-agent-runtime.js','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

const expectedVersion=validator.split('EXPECTED_VERSION = "')[1]?.split('"')[0];
const sourceVersion="0.6.274";
const htmlVersion=indexHtml.split('name="el-sin-nombre-build" content="')[1]?.split('"')[0];
const titleVersion=indexHtml.split('Capítulo I: Un hombre sin tierra · ')[1]?.split('<')[0];
const buildVersion=buildSite.split('USER_AGENT = "EL-SIN-NOMBRE-WebBuild/')[1]?.split(' ')[0];
const shellVersion=serviceWorker.split('const SHELL_CACHE = "el-sin-nombre-shell-')[1]?.split('"')[0];

assert.equal(expectedVersion,"0.6.291","The release validator must target the packaged 0.6.291 release.");
for(const [source,version] of Object.entries({sourceHtml:htmlVersion,sourceTitle:titleVersion,sourceBuildUserAgent:buildVersion})) {
  assert.equal(version,sourceVersion,`The source ${source} must remain the 0.6.274 input that build_site upgrades deterministically.`);
}
assert.equal(shellVersion,expectedVersion,"The service-worker cache must be synchronized with the packaged release.");
assert.match(buildSite,/if game_version != "0\.6\.274"/,"The build must only promote the known 0.6.274 source.");
assert.match(buildSite,/html = html\.replace\("0\.6\.274", "0\.6\.291"\)/,"The build must promote every visible source version to 0.6.291.");
assert.ok(buildSite.includes("qualityDprCurrent=qualityDpr"),"The flagship profile must initialise adaptive scaling from the actual native render scale.");
assert.ok(buildSite.includes("qualityDprFloor=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?1.50:1.0):1.15)") && buildSite.includes("qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.45:1.70):1.85)"),"Native render scale must stay inside a device-aware non-blurry quality range.");
assert.ok(buildSite.includes("qualityDprStableSamples>=4") && buildSite.includes("qualityDprSlowSamples>=1"),"Resolution must react to FPS drops and recover only after stable frame pacing.");
assert.ok(buildSite.includes("const step=fps<severeFps?.12:.06") && buildSite.includes("qualityDprCurrent+.04"),"Adaptive scaling must lower faster than it recovers.");
assert.ok(!buildSite.includes("fsr1Candidate") && !buildSite.includes("fsr1InputScale"),"The build must not retain an inactive FSR1 scaling path.");
assert.ok(buildSite.includes('legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"') && buildSite.includes('html.replace(legacy_fsr_guard, "if(false){", 1)'),"The legacy FSR branch must be guarded before scene startup.");
assert.ok(buildSite.includes('"loaderVersion": BABYLON_VERSION') && buildSite.includes('"defaultBackend": "WebGL2-preferred"'),"The asset manifest must record the exact Babylon/glTF loader pair and validated backend.");
assert.ok(buildSite.includes("new B.EngineInstrumentation(engine)") && buildSite.includes("new B.SceneInstrumentation(scene)"),"The build must expose Babylon-native profiling only to diagnostics.");
assert.ok(buildSite.includes("engine.setHardwareScalingLevel(1/qualityDprCurrent)"),"Adaptive resolution must be applied through Babylon hardware scaling.");
assert.match(buildSite,/BABYLON_VERSION = "9\.35\.0"/,"The packaged engine must include the DynamicTexture null-update fix.");
assert.ok(buildSite.includes('f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/babylon.js"'),"The engine URL must use the pinned Babylon version.");
assert.ok(buildSite.includes('f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/loaders/babylonjs.loaders.min.js"'),"The glTF loader must match the engine version.");

assert.ok(buildSite.includes("let targetFrameRate=60,observedFpsCeiling=60"),"The S26 profile must adapt to 60 or 90 FPS according to the observed browser refresh ceiling.");
assert.ok(buildSite.includes("highHeadroomQualityMobile?2048:1024"),"High-headroom phones must get higher-resolution sand textures.");
assert.ok(buildSite.includes("reflectionFilteredMeshCount") && buildSite.includes("thinInstanceBatch") && buildSite.includes("list.length<180"),"Water reflections must filter non-essential foliage, instance batches and limit pass submissions.");
assert.ok(buildSite.includes("renderPipeline.sharpen.edgeAmount=.34") && buildSite.includes("renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))"),"Mobile quality uses native 2x MSAA and restrained sharpening.");
assert.ok(buildSite.includes("nordicWaterMirror.refreshRate=isTouchDevice?12:8"),"Mobile water reflections must be throttled to protect frame time.");
assert.ok(buildSite.includes("highHeadroomQualityMobile,reportedMemory"),"The atmosphere system must receive the detected flagship GPU tier.");
assert.match(buildSite,/game_version = "0\.6\.291"/,"The build must validate and package 0.6.291.");
assert.match(deployWorkflow,/group: github-pages-\$\{\{ github\.ref \}\}/,"Pages deployments must be serialized per branch.");
assert.match(deployWorkflow,/uses: actions\/deploy-pages@v5/,"The release must publish through native GitHub Pages.");
assert.ok(!indexHtml.includes('0.6.256'),"Visible HUD and runtime logs must not report an obsolete build.");
assert.match(validator,/La defensa naval debe estar conectada al bucle/);
assert.match(validator,/STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200/);
assert.match(validator,/await Promise\.all\(\[playerHumanLoadPromise,npcStartupPromise\]\)/);
assert.match(validator,/scene\.compileMaterialsAsync\(\)/);
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
assert.ok(buildSite.includes('scripts/game-session-recorder.js') && buildSite.includes('session_recorder_tag'),"The release builder must package and inject the local session recorder.");
assert.ok(serviceWorker.includes("./scripts/game-session-recorder.js"),"The installed game must cache the session recorder offline.");
assert.ok(npcRuntime.includes("function isInspectorCenterPath()") && npcRuntime.includes("Core.SPECIALISTS.map"),"The specialist runtime must execute only in Inspector Center with virtual specialist identities.");
assert.ok(!npcRuntime.includes("context.getCivilianRoster") && !npcRuntime.includes("npc.aiAgent"),"The game runtime must not attach specialist metadata to civilian actors.");
assert.ok(sessionRecorder.includes("elsn-game-session-reports") && sessionRecorder.includes("MAX_SAMPLES_PER_SESSION = 360"),"Session reports must be stored locally with bounded samples.");
assert.ok(sessionRecorder.includes("window.top !== window.self"),"Embedded Inspector test runs must not pollute player session history.");


console.log('OK: release validator, HUD, service worker, build and deployment use one synchronized version.');
