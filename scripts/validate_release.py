#!/usr/bin/env python3
"""Release integrity checks for the generated EL SIN NOMBRE website."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
EXPECTED_VERSION = "0.6.291"

HTML_PAGES = (
    "index.html",
    "guest.html",
    "guest/index.html",
    "invitado/index.html",
)
MANIFESTS = (
    "manifest.webmanifest",
    "guest-manifest.webmanifest",
    "invitado-manifest.webmanifest",
    "guest-file-manifest.webmanifest",
)
REQUIRED_FILES = (
    "index.html",
    "guest.html",
    "guest/index.html",
    "invitado/index.html",
    "sw.js",
    "scripts/nordic/coastal-interaction.js",
    "scripts/nordic/navigation-suite.js",
    "scripts/nordic/atmosphere-system.js",
    *MANIFESTS,
    "icon.svg",
    "assets/asset-manifest.json",
    "assets/environmentSpecular.env",
    "assets/textures/sand-color.jpg",
    "assets/textures/sand-normal-gl.jpg",
    "assets/textures/sand-roughness.jpg",
    "assets/vendor/babylon.js",
    "assets/vendor/babylonjs.loaders.min.js",
    "assets/vendor/meshopt_decoder.js",
    "assets/models/viking-rigged.glb",
    "assets/models/armored-knight-rigged.glb",
    "assets/models/man-base-character-rigged.glb",
    "assets/audio/menu/winter_s_final_toll.mp3",
    "assets/audio/gameplay/the_weight_of_empire.mp3",
)
REQUIRED_ASSETS = tuple(
    path for path in REQUIRED_FILES
    if path.startswith("assets/") and path != "assets/asset-manifest.json"
)

def fail(message: str) -> None:
    raise SystemExit(f"RELEASE VALIDATION FAILED: {message}")

def read_text(relative: str) -> str:
    try:
        return (DIST / relative).read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        fail(f"No se pudo leer {relative}: {exc}")

def main() -> None:
    missing = [relative for relative in REQUIRED_FILES if not (DIST / relative).is_file()]
    if missing:
        fail("Faltan archivos requeridos: " + ", ".join(missing))
    empty = [relative for relative in REQUIRED_FILES if (DIST / relative).stat().st_size == 0]
    if empty:
        fail("Hay archivos requeridos vacíos: " + ", ".join(empty))

    index_html = read_text("index.html")
    atmosphere_source = read_text("scripts/nordic/atmosphere-system.js")
    atmosphere_markers = (
        "class AtmosphereSystem",
        "static computeSolarState(value, target)",
        "static computeLightingProfile(value)",
        "setTime(value)",
        "setDayDuration(seconds)",
        "setSpeed(value)",
        "VolumetricLightScatteringPostProcess",
        "CascadedShadowGenerator",
        "NorseNightHearthPool_",
        "norseAtmosphereFragmentShader",
        "auroraStrength",
        "this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;",
        "this.quality === 'mobile-high'",
        "pipeline.fxaaEnabled = !mobileHigh;",
        "this.quality === 'high' && !this.isTouchDevice",
        "this.quality === 'low' || this.isTouchDevice",
    )
    missing_atmosphere_markers = [marker for marker in atmosphere_markers if marker not in atmosphere_source]
    if missing_atmosphere_markers:
        fail("El sistema atmosférico unificado está incompleto: " + ", ".join(missing_atmosphere_markers))
    atmosphere_tag = '<script src="./scripts/nordic/atmosphere-system.js"></script>'
    game_runtime_marker = '<script>\n(function(){\n"use strict";\nwindow.addEventListener(\'error\''
    if atmosphere_tag not in index_html:
        fail("La página principal no carga el sistema atmosférico unificado.")
    if index_html.count(game_runtime_marker) != 1 or index_html.index(atmosphere_tag) > index_html.index(game_runtime_marker):
        fail("El sistema atmosférico debe cargarse antes del runtime principal.")
    if "window.__ELSN_ATMOSPHERE_CONTROLS" not in index_html or "atmosphereSystem.update(dt)" not in index_html:
        fail("El reloj atmosférico no está conectado al bucle de juego y a sus controles.")
    if 'id="game-build-version"' not in index_html or f'v{EXPECTED_VERSION}</span>' not in index_html:
        fail("La pantalla no muestra la versión exacta en una etiqueta discreta.")
    if 'font:600 7px/1.2 system-ui,sans-serif' not in index_html or 'color:rgba(226,196,135,.58)' not in index_html:
        fail("La etiqueta de versión no conserva el tamaño mínimo y el acabado dorado discreto.")
    coastal_continuity_markers = (
        "function auditCoastalMeshContinuity(onlyIslandIndex=null)",
        "auditCoastalMeshContinuity:(islandIndex=null)=>auditCoastalMeshContinuity(islandIndex)",
        "thresholdMeters=.05",
        "rows=isPerformanceMode?10:(isTouchDevice?64:96)",
    )
    missing_coastal_continuity_markers = [
        marker for marker in coastal_continuity_markers if marker not in index_html
    ]
    if missing_coastal_continuity_markers:
        fail(
            "La geometría costera no incluye la reparación submarina y la auditoría de uniones de 5 cm. "
            "Señales ausentes en dist/index.html: "
            + ", ".join(repr(marker) for marker in missing_coastal_continuity_markers)
        )

    for required_garrison_parent in (
        "IslandGarrisonFlagpole_'+islandIndex,outpostRoot",
        "IslandGarrisonStandard_'+islandIndex,outpostRoot",
        "IslandGarrisonStake_'+islandIndex+'_'+stake,outpostRoot",
    ):
        if required_garrison_parent not in index_html:
            fail("Las banderas y estacas de cada guarnición deben heredar la visibilidad y el movimiento de su puesto.")
    if "IslandGarrisonFlagpole_'+islandIndex,null" in index_html or "IslandGarrisonStandard_'+islandIndex,null" in index_html:
        fail("Se ha detectado una bandera de guarnición independiente que puede quedar flotando sobre el mar.")
    for required_garrison_link in (
        "flagPole.parent=outpostRoot",
        "flagGroup.parent=outpostRoot",
        "stakeMesh.parent=outpostRoot",
        "garrisonWorldToLocal=(x,y,z)=>",
        "flagGroup.position.copyFrom(flagGroupLocal)",
        "const flagPoleMesh=scene.getMeshByName('IslandGarrisonFlagpole_'+village.landIndex)",
        "flagPoleMesh?.getAbsolutePosition?.()",
        "const outpostRoot=village.outpostRoot||null",
        "const detachedPropCount=[flagPoleMesh,flagGroupMesh,...stakeMeshes].filter(prop=>!prop||prop.parent!==outpostRoot).length",
        "outpostX:root?Number(root.x.toFixed(2)):null",
    ):
        if required_garrison_link not in index_html:
            fail(f"Las piezas de guarnición deben usar transformaciones reales de mundo/local y comprobar su apoyo y parentesco. Marcador ausente: {required_garrison_link}")

    for required_garrison_animation in (
        "flagBaseY:flagY+3.55-outpostGroundY",
        "vl.flagGroup.position.y=vl.flagBaseY??(terrainSurfaceAt(vl.x,vl.z)+4.65)",
        "village.flagGroup.position.y=(village.islandGarrison?2.15-(village.outpostRoot?.position?.y||0):2.15)+2.5*ease",
        "garrison.flagBaseY=garrisonFlagGroup.position.y",
    ):
        if required_garrison_animation not in index_html:
            fail("La bandera de guarnición debe conservar su altura correcta al capturar, perder o reiniciar un puesto.")
    for required_outer_landmark in (
        "NorseThingstead_",
        "NorseCoastalPier_",
        "NorseCoastalBeacon_",
        "outerLandmarkGrounding:()=>",
        "renderedTerrainSurfaceAt(x,z),circle=newGroup('NorseThingstead_'",
        "renderedTerrainSurfaceAt(startX,startZ)+.10",
        "renderedTerrainSurfaceAt(x,z),tower=newGroup('NorseCoastalBeacon_'",
    ):
        if required_outer_landmark not in index_html:
            fail("Los tres hitos de las islas exteriores deben usar la altura del terreno realmente dibujado y exponer su auditoría.")

    navigation_js = read_text("scripts/nordic/navigation-suite.js")
    if "./scripts/nordic/navigation-suite.js" not in index_html:
        fail("Las entradas del juego no cargan el sistema unificado de mapas y cámaras.")
    for required_navigation_feature in ("originalMap", "applyMode", '"follow"', "cameraModeBtn"):
        if required_navigation_feature not in navigation_js:
            fail(f"Falta una función esencial de navegación integrada: {required_navigation_feature}")
    if 'id="map"' not in index_html or 'id="mapCoords"' not in index_html:
        fail("El mapa original y sus coordenadas no están presentes en la interfaz.")
    if "rangeX=145" not in index_html or "Math.PI-heading" not in index_html:
        fail("El minimapa local no contiene la escala detallada y la orientación del jugador.")
    if "cameraFocus=focus" not in index_html or "onShip?2.12:1" not in index_html:
        fail("La cámara naval no está centrada en el jugador o no tiene la distancia ampliada.")
    version_match = re.search(
        r'<meta\s+name=["\']el-sin-nombre-build["\']\s+content=["\']([^"\']+)["\']',
        index_html,
        re.IGNORECASE,
    )
    if not version_match:
        fail("index.html no declara la versión del juego.")
    version = version_match.group(1)
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail(f"Formato de versión no válido: {version!r}")
    if version != EXPECTED_VERSION:
        fail(f"Se esperaba la versión {EXPECTED_VERSION}, se encontró {version}.")

    sw = read_text("sw.js")
    if f'el-sin-nombre-shell-{version}' not in sw:
        fail("La caché de shell del service worker no coincide con la versión.")
    if not re.search(r'const ASSET_CACHE = "el-sin-nombre-assets-[0-9a-f]{16}";', sw):
        fail("La caché de recursos no contiene la huella SHA-256 generada en build.")
    if "return cached || response;" not in sw:
        fail("El service worker no contiene fallback de caché para errores HTTP.")
    if "Network first: never launch a saved shell" not in sw or "await isValidGameNavigation(fresh)" not in sw or "controller.abort(), 5000" not in sw or "getVerifiedCachedNavigation(cache, request, fallback)" not in sw:
        fail("La navegación PWA debe comprobar red primero y aceptar la copia local solo tras validar su estructura.")

    asset_manifest = json.loads(read_text("assets/asset-manifest.json"))
    if asset_manifest.get("game") != "EL SIN NOMBRE" or asset_manifest.get("version") != version:
        fail("El manifiesto de recursos no corresponde al juego y versión publicados.")
    engine_manifest = asset_manifest.get("engine")
    if not isinstance(engine_manifest, dict):
        fail("El manifiesto no declara el motor gráfico.")
    if engine_manifest.get("name") != "Babylon.js" or engine_manifest.get("version") != "9.35.0" or engine_manifest.get("loaderVersion") != "9.35.0":
        fail("El motor Babylon y el cargador glTF no están fijados a la misma versión 9.35.0.")
    if engine_manifest.get("distribution") != "UMD" or engine_manifest.get("defaultBackend") != "WebGL2-preferred":
        fail("La distribución Babylon o el backend validado no corresponden a producción.")
    entries = asset_manifest.get("assets")
    if not isinstance(entries, list) or not entries:
        fail("El manifiesto no contiene una lista válida de recursos.")
    entries_by_path = {
        item.get("path"): item for item in entries if isinstance(item, dict)
    }
    for relative in REQUIRED_ASSETS:
        item = entries_by_path.get(relative)
        if not item:
            fail(f"El manifiesto no registra el recurso {relative}.")
        raw = (DIST / relative).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if item.get("bytes") != len(raw) or item.get("sha256") != digest:
            fail(f"Tamaño o SHA-256 incorrecto para {relative}.")

    if (DIST / "assets/environmentSpecular.env").stat().st_size != 131395:
        fail("El entorno de iluminación nórdico no tiene los 131.395 bytes esperados.")
    if "./assets/environmentSpecular.env" not in index_html:
        fail("index.html no referencia el entorno de iluminación local.")
    if "onShip?'sail'" not in index_html or "function updateRealRigGait" not in index_html:
        fail("Falta el controlador de postura de navegación del protagonista.")
    if "club-world-anchor" not in index_html:
        fail("Falta el socket visible del palo anclado a la palma en espacio del jugador.")
    if "function findRightGripBones" not in index_html or "applyRealPlayerClubGripPose" not in index_html:
        fail("Falta la detección y pose procedural de agarre de la mano derecha.")
    graphics_quality_markers = (
        "highTierGpuMatch=",
        "highHeadroomQualityMobile=",
        "qualityDprFloor=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?1.50:1.0):1.15)",
        "qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.45:1.70):1.85)",
        "qualityDprCurrent=qualityDpr",
        "qualityDprStableSamples>=4",
        "const step=fps<severeFps?.12:.06",
        "qualityDprCurrent+.04",
        "qualityDprSlowSamples>=1",
        "severeFps=targetFrameRate>=87?54:38",
        "moderateFps=targetFrameRate>=87?72:50",
        "stableFps=targetFrameRate>=87?86:58",
        "let targetFrameRate=60,observedFpsCeiling=60",
        "engine.setHardwareScalingLevel(1/qualityDprCurrent)",
        "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))",
        "renderPipeline.sharpen.edgeAmount=.34",
        "style='grain',size=highHeadroomQualityMobile?1024:512",
        "'sand',isPerformanceMode?(isConstrainedMobile?256:512):(highHeadroomQualityMobile?2048:1024),true)",
        "const size=isPerformanceMode?(isConstrainedMobile?512:768):(highHeadroomQualityMobile?2048:1024)",
        "const size=highHeadroomQualityMobile?512:256",
    )
    missing_graphics_quality = [marker for marker in graphics_quality_markers if marker not in index_html]
    if missing_graphics_quality:
        fail("El perfil nativo de gama alta, la resolución adaptativa o las texturas de calidad están incompletos: " + ", ".join(missing_graphics_quality))

    if "const TERRAIN_HASH_CACHE_LIMIT=65536;" not in index_html or "terrainHashCacheSlots" not in index_html or "terrainHashCacheEntries:terrainHashCache.size" not in index_html:
        fail("La caché determinista de ruido del terreno debe estar acotada y diagnosticada.")
    if "const GROUND_RELAX_INTERVAL=1/30;" not in index_html or "groundRelaxAccumulator>=GROUND_RELAX_INTERVAL" not in index_html:
        fail("La relajación del terreno debe acumular el tiempo completo y ejecutarse a 30 Hz.")
    if "const enemyAiInterval=isConstrainedMobile?.05:(1/60);" not in index_html or "const companionAiInterval=isConstrainedMobile?.0667:(1/60);" not in index_html:
        fail("La IA debe limitar el trabajo redundante a 60 Hz sin alterar la cadencia de perfiles móviles limitados.")
    if "reportVersion:'16',build:'0.6.291'" not in index_html or "enemyAiRateCapHz:isConstrainedMobile?20:60" not in index_html or "performanceAssessment:{targetFps:targetFrameRate" not in index_html or "gpuTimerQuery:'not measured; scene.render duration is CPU wall-clock only'" not in index_html:
        fail("El diagnóstico de rendimiento debe exponer el nuevo build, caché y límites de frecuencia.")
    for marker in (
        "babylonEngineVersion:String(B.Engine.Version||'unknown')",
        "engineBackend:graphicsContext&&",
        "webGpuApiAvailable:typeof navigator.gpu!=='undefined'",
        "new B.EngineInstrumentation(engine)",
        "new B.SceneInstrumentation(scene)",
        "profileDiagnosticsEnabled",
    ):
        if marker not in index_html:
            fail("Falta instrumentación/diagnóstico real de Babylon: " + marker)
    if "if(false){" not in index_html or "if(fsr1Candidate){" in index_html:
        fail("El arranque aún contiene una rama FSR heredada sin proteger.")
    if "const PLAYER_MOVEMENT_LOCKED_ACTIONS=new Set(" not in index_html or "PLAYER_MOVEMENT_LOCKED_ACTIONS.has(playerAction)" not in index_html:
        fail("El bucle de movimiento debe reutilizar el conjunto de acciones bloqueadas.")
    if "function refreshPlayerGroundNormal(x,z)" not in index_html or "const normal=refreshPlayerGroundNormal(player.root.position.x,player.root.position.z);" not in index_html or "playerGroundNormalForMovement=playerGroundNormalCache" not in index_html:
        fail("La normal del terreno debe muestrearse una vez por fotograma y reutilizarse entre movimiento e inclinación.")
    if "const focus=onShip?player.root.getAbsolutePosition():player.root.position;" not in index_html or "cameraTargetSmoothed.x+=(targetX-cameraTargetSmoothed.x)*targetAlpha;" not in index_html:
        fail("La cámara debe evitar vectores temporales sin perder el foco absoluto al navegar.")
    if "scale.x=.025+(target.x-.025)*k" not in index_html or "PLAYER_BOAT_FLOAT_OPTIONS" not in index_html:
        fail("Las animaciones y la flotación deben reutilizar valores sin asignaciones por fotograma.")
    if "frameTimingMs:{samples:frameTimes.length,average:frameAverage,p50:frameAt(.50),p95:frameAt(.95),p99:frameAt(.99)" not in index_html:
        fail("El diagnóstico debe exponer percentiles de tiempo de fotograma.")
    if "function updateActiveIslandGrass(dt)" not in index_html or "if(isPerformanceMode)return;" not in index_html[index_html.find("function updateActiveIslandGrass(dt)"):index_html.find("spawnNaturalVegetationAndFauna();")] or "qualityGrassLodBatches.push" not in index_html or "updateActiveIslandGrass(dt);" not in index_html or "const show=batch.islandIndex===visibleGrassIslandIndex;" not in index_html:
        fail("La hierba cercana debe actualizarse solo en Calidad y limitarse a la isla activa.")
    if "function syncNordicWaterReflectionIsland()" not in index_html or "syncNordicWaterReflectionIsland();" not in index_html or "activeWaterReflectionIslandIndex" not in index_html:
        fail("El espejo del agua debe actualizarse solo con la isla activa.")
    if "const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024" not in index_html or "nordicWaterMirror.updateSamplingMode(B.Texture.TRILINEAR_SAMPLINGMODE)" not in index_html or "anisotropicFilteringLevel=Math.min(8,maxAnisotropy)" not in index_html or "reflectionFilteredMeshCount" not in index_html or "tinyReflectionDetail=vertexCount<96" not in index_html or "list.length<180" not in index_html or "reflectionLimitDiscardedMeshCount" not in index_html or "nordicWaterMirror.refreshRate=isTouchDevice?12:8" not in index_html:
        fail("El reflejo de Calidad debe mantener resolución alta y filtrado trilineal/aniso sin cambiar la cadencia de actualización.")
    if "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples))" not in index_html or "renderPipeline.sharpen.edgeAmount=.34" not in index_html or "shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?10:4))" not in index_html:
        fail("El perfil móvil de gama alta debe usar MSAA nativo, nitidez moderada, sombras cacheadas y reflejos filtrados.")
    if "const boneCount=skeletons.reduce" not in index_html or "skinnedVertexCount<600" not in index_html or "const attachedBounds=boundsForMeshes(meshes)" not in index_html:
        fail("La fauna debe validar el cuerpo riggeado y alinear el modelo tras reparentar sus raíces.")
    if "const normalized=group=>" not in index_html or "const pickExact=name=>playable.find(group=>normalized(group)===name)||null;" not in index_html or "pickExact('animalarmature'+name)" not in index_html:
        fail("La fauna debe priorizar los clips canónicos Idle/Walk/Gallop y usar AnimalArmature como respaldo.")
    if "const VESSEL_SPRAY_COUNT=isPerformanceMode?0:" not in index_html:
        fail("Rendimiento debe desactivar la espuma/rociado del barco.")
    if "const waterSubdivisions=isPerformanceMode?(isGalaxyA12NachoPerformance?32:(isConstrainedMobile?40:(isTouchDevice?160:112))):(isTouchDevice?(isConstrainedMobile?192:256):320)" not in index_html:
        fail("El aumento de teselación del agua debe limitarse al perfil Calidad; Rendimiento conserva su presupuesto.")
    animate_start = index_html.find("function animateWater(dt)")
    animate_end = index_html.find("function rand(a,b)", animate_start)
    animate_body = index_html[animate_start:animate_end]
    if animate_start < 0 or animate_end <= animate_start or "waterDetailHeightAtVertex" not in animate_body or "waterFarHeightAtVertex" not in animate_body:
        fail("La animación base del oleaje debe conservar la caché de fases y el detalle de agua.")
    if "beachStateSampler" not in index_html or "foam=clamp(state.g,0.0,1.0)" not in index_html or "float laceNoise=fineFoam*.62+broadFoam*.38" not in index_html or "foamMask=clamp(foam*lace*broken*foamPulse*shoreFoamStrength" not in index_html:
        fail("La espuma de la orilla debe proceder del canal Foam de BeachState y de su encaje de shader.")
    if "for(const foam of tidalFoamMeshes)" not in index_html or "function buildTidalFoam(" not in index_html or "syncActiveTidalFoamIsland();" not in index_html:
        fail("La rompiente dinámica debe acompañar al estado BeachState y seguir la isla activa.")
    if "if(B.MirrorTexture&&B.Plane&&!isPerformanceMode)" not in index_html:
        fail("Rendimiento debe omitir el pase de reflejos del agua; Calidad lo conserva.")
    if "const oceanWaveNormal=isPerformanceMode&&isConstrainedMobile?null:makeOceanWaveNormal()" not in index_html:
        fail("Los móviles de gama alta conservan el normal de oleaje; solo perfiles limitados mantienen la reserva.")
    if "await Promise.all([playerHumanLoadPromise,npcStartupPromise])" not in index_html or "function startNpcHumanModels()" not in index_html or "if(!requiredReady)throw new Error('NPC obligatorios de la isla inicial incompletos" not in index_html:
        fail("El protagonista y los NPC GLB obligatorios de la isla inicial deben estar listos antes de entrar.")
    if "await scene.whenReadyAsync();" not in index_html or "scene.compileMaterialsAsync()" not in index_html or "sceneReadyTimeout" not in index_html or "RECURSO OBLIGATORIO: escena y shaders" not in index_html or "requestAnimationFrame(()=>requestAnimationFrame(resolve))" not in index_html:
        fail("La escena y los shaders deben estar preparados con un plazo cerrado; un fallo obligatorio debe detener el arranque.")
    if "audioPreloadResult=await startupAudioPreload" not in index_html or "RECURSO OBLIGATORIO: efectos de sonido" not in index_html or "startupAudioPreload.then(" not in index_html:
        fail("Los efectos de sonido deben estar listos antes de entrar; la música debe seguir en streaming.")
    if "RECURSO OBLIGATORIO: Vikingo protagonista" not in index_html or "await Promise.all([playerHumanLoadPromise,npcStartupPromise])" not in index_html:
        fail("El GLB protagonista no puede sustituirse por un cuerpo provisional para entrar.")
    if "sceneWarmupStatus='completed-with-errors'" not in index_html or "blocking:true,warmupFrames:2" not in index_html:
        fail("Los errores de warm-up no esencial deben registrarse y no cancelar el arranque.")
    if "GLB protagonist pipeline timing" not in index_html:
        fail("Falta telemetría de importación y montaje del GLB protagonista.")
    if "rightGripBones:realRightGripBones.length" not in index_html:
        fail("Falta telemetría del número de huesos de agarre detectados.")
    # Master idle pose is represented only by per-bone local rotations.
    if "const REAL_PLAYER_MASTER_POSE_DEFAULTS=Object.freeze(" not in index_html:
        fail("Falta el bloque de rotaciones maestras locales por articulación.")
    if index_html.count("quaternion:[") < 38:
        fail("La pose maestra de fábrica no contiene las 38 rotaciones capturadas.")
    for master_joint in ("leftShoulder","leftUpperArm","leftForearm","leftHand","rightShoulder","rightUpperArm","rightForearm","rightHand","leftFinger_lefthandthumb1","rightFinger_righthandpinky3"):
        if '"' + master_joint + '":{quaternion:' not in index_html:
            fail(f"Falta una rotación maestra capturada: {master_joint}")
    if "initializeRealPlayerMasterPose();" not in index_html:
        fail("La pose maestra no se inicializa después de capturar el bind pose del GLB.")
    if "add('leftShoulder'" not in index_html or "add('rightShoulder'" not in index_html:
        fail("La pose maestra no incluye ambos hombros.")
    for joint in ("leftUpperArm", "rightUpperArm", "leftForearm", "rightForearm", "leftHand", "rightHand"):
        if f"add('{joint}'" not in index_html:
            fail(f"La pose maestra no incluye {joint}.")
    if "addFingers(realLeftGripBones,'left','free');" not in index_html:
        fail("La pose maestra no incluye los dedos de la mano izquierda.")
    if "addFingers(realRightGripBones,'right','weapon');" not in index_html:
        fail("La pose maestra no incluye los dedos de la mano derecha.")
    if "const base=realBoneRest.get(entry.node);" not in index_html:
        fail("No se conserva una rotación base local por hueso.")
    if "restoreRigNodePose(node,base);" not in index_html or "applyRealPlayerMasterPoseValue(node,target);" not in index_html:
        fail("El reposo no restaura la base local y aplica directamente la rotación maestra.")
    if "function captureRealPlayerMasterTransition()" not in index_html or "return {startedAt:elapsed,duration:.22,poses};" not in index_html:
        fail("La entrada en reposo no usa una mezcla fija de 0,22 segundos.")
    pose_start = index_html.find("function applyRealPlayerArmPoseAfterAnimations(){")
    pose_end = index_html.find("function buildRealPlayerMasterPoseControls()", pose_start)
    pose_body = index_html[pose_start:pose_end]
    if pose_start < 0 or pose_end <= pose_start:
        fail("Falta el aplicador de la pose maestra después de las animaciones.")
    if "realPlayerMode!=='idle'" not in pose_body or "playerAction!=='idle'" not in pose_body:
        fail("La pose maestra no está limitada al reposo normal.")
    for forbidden in ("getRealPlayerSkeletonBodyFrame(", "getRealPlayerBodyFrame(", "getRealPlayerHeadingBodyFrame(", "joystick"):
        if forbidden in pose_body:
            fail(f"La pose maestra depende indebidamente de {forbidden}.")
    if "relaxRealPlayerFreeArm(" in pose_body or "relaxRealPlayerWeaponArm(" in pose_body:
        fail("La pose maestra todavía calcula direcciones anatómicas.")
    if "function sampleRealPlayerArmDeviation()" not in index_html:
        fail("Falta el detector de desviación local.")
    detector_start = index_html.find("function sampleRealPlayerArmDeviation(){")
    detector_end = index_html.find("function armDebugFormatYaw", detector_start)
    detector_body = index_html[detector_start:detector_end]
    if detector_start < 0 or detector_end <= detector_start:
        fail("El detector local de desviación no está completo.")
    if "realPlayerLocalRotationQuaternion(node)" not in detector_body or "if(degrees<=1)continue;" not in detector_body:
        fail("El detector no compara rotaciones locales reales con tolerancia de 1 grado.")
    if "toleranceDeg:1" not in detector_body:
        fail("El informe del detector no registra la tolerancia de 1 grado.")
    if "getRealPlayerSkeletonBodyFrame(" in detector_body or "getRealPlayerBodyFrame(" in detector_body:
        fail("El detector local sigue dependiendo de rumbo, pies o caderas.")
    if "slider.type='range';" not in index_html or "slider.addEventListener('input'" not in index_html:
        fail("Faltan los deslizadores locales por articulación.")
    if "slider.dataset.masterPoseAxis=axis;" not in index_html or "output.textContent=Number(euler[axis]).toFixed(3);" not in index_html:
        fail("Los deslizadores no muestran los valores locales de cada eje.")
    if "CAPTURAR POSE ACTUAL" not in index_html or "captureRealPlayerMasterPoseText()" not in index_html:
        fail("Falta la captura copiable de las rotaciones locales actuales.")
    if "node.rotationQuaternion?{quaternion:[" not in index_html or ":{rotation:[node.rotation.x,node.rotation.y,node.rotation.z]}" not in index_html:
        fail("La captura no exporta las rotaciones locales reales como quaternion o Euler.")
    if "navigator.clipboard.writeText(output.value)" not in index_html:
        fail("Falta la copia directa del código de pose maestra.")
    if "REAL_PLAYER_MASTER_POSE_STORAGE_KEY='el-sin-nombre-master-local-pose-v1'" not in index_html:
        fail("Falta la clave de guardado local de la postura maestra.")
    if "function readRealPlayerMasterPoseStorage()" not in index_html or "function restoreRealPlayerMasterPoseStoredValue(raw)" not in index_html:
        fail("Falta la restauración validada de la pose guardada.")
    if "function saveRealPlayerMasterPoseLocally()" not in index_html or "localStorage.setItem(REAL_PLAYER_MASTER_POSE_STORAGE_KEY" not in index_html:
        fail("Falta el guardado persistente de las rotaciones.")
    if "realPlayerMasterPoseSave" not in index_html or "GUARDAR Y FIJAR POSE EN ESTE DISPOSITIVO" not in index_html:
        fail("Falta el botón visible para guardar y fijar la pose.")
    if "localStorage.removeItem(REAL_PLAYER_MASTER_POSE_STORAGE_KEY)" not in index_html:
        fail("RESTABLECER no elimina la configuración persistida.")
    if "realPlayerArmTuneMove" not in index_html or "pointerdown" not in index_html or "pointermove" not in index_html:
        fail("El panel de ajuste no ofrece reubicación táctil.")
    if "el-sin-nombre-arm-tune-dock-position-v1" not in index_html:
        fail("La posición del panel no se conserva en el navegador.")
    if "z-index:100001" not in index_html:
        fail("El editor no queda por encima de los paneles de diagnóstico.")
    if "realPlayerArmTuneSavePosition" not in index_html or "GUARDAR POSICIÓN DEL PANEL" not in index_html:
        fail("Falta el botón explícito para guardar la posición del editor.")
    if "persistArmTuneDockPosition" not in index_html or "armTuneSavePosition.addEventListener('click',persistArmTuneDockPosition)" not in index_html:
        fail("El botón de posición no guarda las coordenadas del panel.")
    if "width:min(48vw,260px)" not in index_html or "left:7px;right:auto" not in index_html:
        fail("El panel móvil no está desplazado al lateral para dejar libre el centro.")
    if "new URLSearchParams(window.location.search).get('debug')==='1'" not in index_html:
        fail("El panel de pose no está condicionado por ?debug=1.")
    if "if(!realPlayerArmDebugEnabled)return;" not in index_html or "if(realPlayerArmDebugEnabled){\n  const armTuneStyle=document.createElement('style');" not in index_html:
        fail("Los controles de la pose maestra no están reservados a ?debug=1.")
    if "armTuneDock.appendChild(armTuneToggle);" not in index_html or "realPlayerArmTuneReset" not in index_html:
        fail("Faltan el menú de pose maestra o RESTABLECER.")
    if "realPlayerMasterIdleTransition=mode==='idle'?captureRealPlayerMasterTransition():null;" not in index_html:
        fail("La transición a reposo no captura el último estado local para mezclarlo.")
    if "if(walking&&!realPlayerManualLocomotion)return;" not in index_html:
        fail("El gait procedural todavía puede competir con la locomoción GLB.")
    if "group=realPlayerAnimations.run||realPlayerAnimations.walk;" not in index_html or "group=realPlayerAnimations.walk||realPlayerAnimations.run;" not in index_html:
        fail("No se seleccionan los clips originales Walk/Run del GLB.")
    club_start = index_html.find("function applyRealPlayerClubGripPose(){")
    club_end = index_html.find("function restoreRealPlayerArmBindPose(nodes)", club_start)
    club_body = index_html[club_start:club_end]
    if club_start < 0 or club_end <= club_start:
        fail("Falta la rutina original de agarre.")
    if "const holding=!!realWeaponGroups[equippedWeapon];" not in club_body:
        fail("La rutina original de agarre no conserva la selección de arma.")
    callback_start = index_html.find("scene.onAfterAnimationsObservable.add(()=>{")
    callback_end = index_html.find("\n });", callback_start)
    callback_body = index_html[callback_start:callback_end]
    if callback_start < 0 or callback_end <= callback_start:
        fail("Falta el callback posterior a las animaciones.")
    if "const masterOrNativeOwnsFingers=" not in callback_body or "if(!masterOrNativeOwnsFingers)applyRealPlayerClubGripPose();" not in callback_body:
        fail("La propiedad de dedos no está separada entre GLB, pose maestra y acciones.")
    if "syncRealWeaponAnchor(0,realWeaponPoseOverride);" not in callback_body:
        fail("El callback no conserva el seguimiento normal del anclaje del palo.")
    gait_start = index_html.find("function updateRealRigGait(")
    gait_end = index_html.find("function createRealWeapon(", gait_start)
    gait_body = index_html[gait_start:gait_end]
    if gait_start < 0 or gait_end <= gait_start or "relaxRealPlayerFreeArm(" in gait_body or "relaxRealPlayerWeaponArm(" in gait_body:
        fail("El gait del cuerpo no debe recalcular la dirección de los brazos.")
    idle_start = gait_body.find("Reposo estable: sin respiración, balanceo ni variaciones sinusoidales.")
    idle_end = gait_body.find("\n  }\n }", idle_start)
    if idle_start < 0 or idle_end <= idle_start:
        fail("No se encontró la rama de reposo estático.")
    idle_body = gait_body[idle_start:idle_end]
    if "Math.sin(" in idle_body or "Math.cos(" in idle_body or "elapsed" in idle_body:
        fail("El reposo contiene balanceo o respiración variable.")
    if "Object.values(rig).forEach(rememberRigRest);" not in index_html:
        fail("No se captura el bind pose de los huesos del rig.")
    if "function findRightGripBones" not in index_html or "applyRealPlayerClubGripPose" not in index_html:
        fail("Falta la detección y la gestión del agarre del palo.")
    if "rightGripBones:realRightGripBones.length" not in index_html:
        fail("Falta la telemetría de los huesos de agarre.")
    if "club-world-anchor" not in index_html or "function syncRealWeaponAnchor(" not in index_html:
        fail("Falta el anclaje del palo al jugador.")
    if "gripWorld.addInPlace(modelForward.scale(.075))" not in index_html:
        fail("El palo no tiene el desplazamiento frontal de visibilidad en la palma.")
    if "RealCastawayStickGrip',club,[0,.20,.025]" not in index_html:
        fail("La empuñadura del palo no está centrada en la palma.")
    if "modelForward.clone().add(new B.Vector3(0,.24,0)).normalize()" not in index_html:
        fail("El palo no conserva la orientación frontal e inclinación fijadas.")
    if "distal.scale(.025)" not in index_html:
        fail("El anclaje del palo no sigue el eje muñeca-palma.")
    if "window.setInterval(updateRealPlayerArmDebugPanel,500);\n  window.setInterval(sampleRealPlayerArmDeviation,100);\n }\n // Panel de ajuste permanente" not in index_html:
        fail("La estructura del diagnóstico de brazos debug=1 ha cambiado inesperadamente.")
    if "FPS EN VIVO '+liveFps+' · MATAS '+grassDebugClumpCount.toLocaleString('es-ES')+' · LOTES '+grassDebugBatchCount" not in index_html:
        fail("Faltan FPS en vivo y el recuento de matas en el panel debug=1.")
    if "grassDebugClumpCount=count;grassDebugBatchCount=grassBatches.size;" not in index_html:
        fail("El contador de hierba no recibe el número real de matas creadas.")
    if "const liveFps=Number.isFinite(engine.getFps())?Math.round(engine.getFps()):0;" not in index_html:
        fail("El panel debug=1 no mide los FPS actuales.")
    if "const grassDebugEnabled=groundDebugEnabled||new URLSearchParams(window.location.search).get('grassdebug')==='1';" not in index_html:
        fail("Falta el acceso independiente al diagnóstico de hierba ?grassdebug=1.")
    if "function updateGrassDebugPanel()" not in index_html or "buildGrassIslandStats.push({" not in index_html or "grassDebugIslandStats.push(...buildGrassIslandStats)" not in index_html:
        fail("Faltan las métricas por isla del diagnóstico de hierba.")
    if "const STARTUP_PERF_DEBUG_ENABLED=new URLSearchParams(window.location.search).get('debug')==='1';" not in index_html:
        fail("La medición de etapas de carga debe estar limitada a ?debug=1.")
    if "const realPlayerArmDebugEnabled=new URLSearchParams(window.location.search).get('armdebug')==='1';" not in index_html or "const groundDebugEnabled=new URLSearchParams(window.location.search).get('debug')==='1';" not in index_html:
        fail("El diagnóstico del suelo debe estar separado del diagnóstico anatómico de brazos.")
    for metric in ("estimateDebugTextureMemoryMB()", "activeTriangles", "drawCalls", "averageFps", "p95FrameMs", "p5Fps", "TIEMPOS POR TRAMO DE PROGRESO DE CARGA:"):
        if metric not in index_html:
            fail("Falta una métrica del panel debug=1: " + metric)
    if "const GROUND_PHASE_A_DEFAULTS=Object.freeze({textureRepeat:9.5,relief:.70,roughness:.97});" not in index_html:
        fail("La Fase A no conserva los valores por defecto actuales del suelo.")
    if "function createGroundPhaseAPanel()" not in index_html or "if(!groundDebugEnabled)return;" not in index_html or "RESTABLECER VALORES INICIALES" not in index_html:
        fail("Faltan los deslizadores en vivo y el restablecimiento de la Fase A.")
    if "new B.DynamicTexture('NordicTerrainAlbedo',{width:size,height:size},scene,true)" not in index_html or "new B.DynamicTexture('LivingCoastalSandAlbedo',{width:size,height:size},scene,true)" not in index_html:
        fail("Las texturas procedurales principales del suelo deben generar mipmaps.")
    if "const packedTrailTexture=makePatternTexture('Packed Norse trail earth','#a18a63',['#d0b68a','#8c7450','#ddc79e','#a58b60'],'sand',512,true);" not in index_html:
        fail("La textura procedural de los caminos también debe generar mipmaps.")
    procedural_texture_signature = re.search(
        r"function\s+makePatternTexture\s*\(\s*name\s*,\s*base\s*,\s*accents\s*,\s*style='grain'\s*,\s*size\s*=\s*highHeadroomQualityMobile\s*\?\s*1024\s*:\s*512\s*,\s*generateMipMaps\s*=\s*false\s*\)",
        index_html,
    )
    if not procedural_texture_signature:
        fail("La textura procedural debe usar resolución adaptativa de 1K y conservar la generación selectiva de mipmaps.")
    if "mesh.material.diffuseTexture.anisotropicFilteringLevel=maxAnisotropy" not in index_html or "tex.anisotropicFilteringLevel=maxAnisotropy" not in index_html:
        fail("No se conserva el filtrado anisotrópico de las texturas procedurales.")
    if "const qualityGrassDensity=isTouchDevice?(islandIndex===0?8.8:5.8):(islandIndex===0?8.2:5.8);" not in index_html:
        fail("La densidad principal de vegetación no conserva su cobertura.")
    if "function isSafeGroundCoverPoint(is,x,z)" not in index_html or "const grassGroundSample=(x,z)=>{" not in index_html or "const safeLandRadius=island.r*.70" not in index_html:
        fail("La hierba no restringe la generación optimizada a terreno seco y alejado de la costa.")
    if "terrainDeformationAt(islandIndex,xP,z)" not in index_html or "surfaceSlopeX" not in index_html:
        fail("El muestreo optimizado de hierba no conserva la pendiente del terreno deformable.")
    if "function updateHearthFlooding(dt)" not in index_html or "updateHearthFlooding(ambientDt)" not in index_html:
        fail("Las hogueras no reaccionan a la altura del oleaje.")
    if "const texCoastalSand=makeLivingCoastalSandTexture();" not in index_html or "M.sand.bumpTexture=texCoastalSandNormalPbr;" not in index_html or "M.sand.bumpTexture.level=.72;" not in index_html or "sandRoughSampler" not in index_html:
        fail("La arena debe utilizar el albedo procedural/CC0, el mapa normal PBR de alto relieve y la rugosidad fotogramétrica.")
    if "function buildLivingBeachLayer(island,index)" not in index_html or "function updateBeach(dt,focusX,focusZ)" not in index_html:
        fail("Falta la capa de playa con humedad y espuma residual dinámica.")
    if "redmi8aHardwareMatch" not in index_html or "M2006C3L" not in index_html:
        fail("El Redmi 8A debe entrar en el perfil de hardware extremo del modo Rendimiento.")
    if "ultraLowEndIslandStreaming=!!(isPerformanceMode&&(isUltraLowEndMobile||isGalaxyA12NachoPerformance))" not in index_html or "function islandStreamBuildGroups()" not in index_html or "updatePerformanceIslandStreaming(dt)" not in index_html:
        fail("El streaming de islas debe activarse solo en Rendimiento extremo y seguir al jugador/barco.")
    if "mesh.isVisible=keep?state.visible:false" not in index_html or "mesh.visibility=keep?state.opacity:0" not in index_html:
        fail("Las islas lejanas deben quedar fuera del render sin destruir sus entidades o estado de juego.")
    if "sphere.centerWorld?sphere.centerWorld" not in index_html or "const islandChanged=wantedIndex!==islandStreamActiveIndex" not in index_html:
        fail("El streaming debe clasificar geometría por centro real y mantener ocultos los NPC remotos.")
    if "landIslandIndex(focus.x,focus.z)" not in index_html or "islandStreamIslandAt(focus.x,focus.z)" not in index_html:
        fail("El cambio de isla renderizada debe seguir al jugador en tierra y al drakkar en navegación.")
    beach_start = index_html.find("function buildLivingBeachLayer(island,index)")
    beach_end = index_html.find("function ensureActiveCoastalIslandSystems", beach_start)
    beach_source = index_html[beach_start:beach_end] if beach_start >= 0 and beach_end > beach_start else ""
    work_start = index_html.find("function processBeachWorkChunk()")
    work_end = index_html.find("function update(dt,x,z,distance,heading,running,onShip,airborne)", work_start)
    beach_update_source = index_html[work_start:work_end] if work_start >= 0 and work_end > work_start else ""
    beach_surface_start = index_html.find("function livingBeachSurfaceAt(island,index,x,z)")
    beach_surface_end = index_html.find("function buildLivingBeachLayer(island,index)", beach_surface_start)
    beach_surface_source = index_html[beach_surface_start:beach_surface_end] if beach_surface_start >= 0 and beach_surface_end > beach_surface_start else ""
    if ("island.r*(1.085-coastNoise)" not in beach_source
            or "positions.push(x,livingBeachSurfaceAt(island,index,x,z),z)" not in beach_source
            or "layer.positions[offset+1]=livingBeachSurfaceAt(layer.island,layer.index,x,z);" not in beach_update_source
            or "terrain.getHeightAtCoordinates(x,z)" not in beach_surface_source
            or "return terrainHeightOnIsland(island,x,z)+terrainDeformationAt(index,x,z)+.018;" not in beach_surface_source
            or "renderedTerrainSurfaceAt(x,z)" in beach_source
            or "renderedTerrainSurfaceAt(x,z)" in beach_update_source):
        fail("La superficie de playa debe coincidir con la altura interpolada de su propia malla y prolongarse con su perfil analítico, sin usar el sentinel de terreno exterior.")
    if "inlandDistance<4.8" in index_html or "wetSandCol=" in index_html or "wetBlend=wetSand" in index_html:
        fail("La arena seca no puede contener un tinte húmedo ni una franja artificial.")
    if "NorseBeachState.createCoastalGrid" not in index_html or "state.stepCell(cell,coverage,elapsed,BEACH_STATE_DEFAULTS)" not in index_html:
        fail("La humedad debe proceder del contacto real entre agua y terreno.")
    if "coastalColumnCount(island.r,isPerformanceMode,isConstrainedMobile)" not in index_html:
        fail("Calidad debe dimensionar columnas según perímetro; Rendimiento conserva 256/512.")
    if "const layer=livingBeachLayers[activeBeachIslandIndex]||null" not in index_html or "beachUpdateCellsLast=beachWorkCellsProcessed" not in index_html or "cpuUpdateP95Ms:beachCpuP95" not in index_html or "BEACH_WORK_BUDGET_MS=isTouchDevice?1.5:2.0" not in index_html or "BEACH_CELL_BUDGET_MS=BEACH_WORK_BUDGET_MS*.68" not in index_html:
        fail("La actualización costera debe respetar su presupuesto reducido por fotograma.")
    if "TIDAL_FOAM_UPDATE_STEP=isTouchDevice?(isPerformanceMode?1/18:1/15):1/30" not in index_html or "const foamElapsed=foamDue?tidalFoamAccumulator:0" not in index_html or "Math.exp(-foamElapsed/3.4)" not in index_html or "for(let step=0;step<5;step++)" not in index_html or "const span=hi-lo,secant=lo+span*loDelta/(loDelta-hiDelta),guard=span*.04" not in index_html or "const waterDepth=water-terrainY" not in index_html or "const foamWaterDepth=water-terrainY" not in index_html or "performance.now()-sliceStarted<2.65" in index_html or "performance.now()-sliceStarted<3.55" in index_html:
        fail("La rompiente debe reutilizar alturas de agua y terreno y resolver la costa con menos evaluaciones.")
    coastal_interaction = (ROOT / "scripts" / "nordic" / "coastal-interaction.js").read_text(encoding="utf-8")
    if ("const shorelineEntry = 0.24 * smooth01(depth / 0.30);" not in coastal_interaction
            or "const shallowBody = 0.28 * smooth01(depth / 1.65);" not in coastal_interaction
            or "const depthBody = 0.75 * smooth01(depth / 5.5);" not in coastal_interaction
            or "return Math.min(0.99, shorelineEntry + shallowBody + depthBody);" not in coastal_interaction
            or "function waterDepth(waterlineY, seabedY)" not in coastal_interaction
            or "return Math.max(0, Math.min(18, waterline - seabed));" not in coastal_interaction):
        fail("La opacidad del agua debe transicionar suavemente y derivarse de la profundidad vertical real.")
    if "const physicalDepth=window.NorseCoastalInteraction.waterDepth(waterlineY,seabedY);" not in index_html or "Math.max(depth,bathymetry)" in index_html:
        fail("El alpha del agua debe usar profundidad vertical sobre el lecho y no producir óvalos por distancia radial.")
    if "foamActiveSegments" not in index_html or "foamValidIntersections" not in index_html or "foamMaxOffshoreDistanceMeters" not in index_html or "foamVerticesOutsideBand" not in index_html or "foamUpdateLastMs" not in index_html or "foamBackwashPeakVelocityMetersPerSecond" not in index_html:
        fail("El diagnóstico de resaca debe medir segmentos, cruces, distancia mar adentro, vértices fuera de banda y CPU.")
    if "SAGA DEL NORTE · CAPÍTULO I · 0.6.291" not in index_html or "EL SIN NOMBRE 0.6.291 frame error" not in index_html:
        fail("El HUD y los mensajes de runtime deben identificar la versión real del juego.")
    if "const segments=coastColumns" not in index_html or "rows=isPerformanceMode?13:(isTouchDevice?15:17)" not in index_html:
        fail("La malla costera debe compartir la resolución proporcional del estado intermareal.")
    if "const subdivisions=Math.min(360,Math.max(112,Math.ceil(is.r*2/(isTouchDevice?.42:.36))));" not in index_html:
        fail("La costa necesita un heightfield más fino para evitar escalones visibles.")
    if "Math.max(512,Math.min(2048,Math.ceil(Math.PI*2*island.r/.30)))" not in index_html:
        fail("Calidad debe mantener segmentos de rompiente de unos 30 cm y Rendimiento una malla ligera.")
    if "(terrainValueNoise(x*.12+17.2,z*.12-8.4)-.5)*.008+Math.sin(x*.17+z*.11)*.0018+(terrainValueNoise(x*.44+3.7,z*.44-8.1)-.5)*.002" not in index_html:
        fail("El perfil costero debe evitar dientes exagerados sin perder las calas naturales.")
    if "beachStateSampler" not in index_html or "float laceNoise=fineFoam*.62+broadFoam*.38" not in index_html or "float foamMask=clamp(foam*lace*broken*foamPulse*shoreFoamStrength" not in index_html:
        fail("La espuma costera debe utilizar detalle de encaje de alta frecuencia en el shader.")
    if "function syncActiveBeachIsland()" not in index_html or "activeBeachIslandIndex=nextIndex;" not in index_html or "syncActiveTidalFoamIsland();" not in index_html:
        fail("La isla activa debe sincronizar el estado de playa y la rompiente de espuma.")
    # buildTidalFoam is the restored moving breaker mesh; its legacy mesh label is retained intentionally.
    if "function buildTidalFoam(" not in index_html or "for(const foam of tidalFoamMeshes)" not in index_html:
        fail("La rompiente costera debe mantener su malla activa y su ciclo de actualización.")
    if "const livingBeachLayers=new Array(land.length)" not in index_html or "land.forEach(buildLivingBeachLayer)" in index_html or "buildCoastalSeabed(is,i);" in index_html:
        fail("Las capas de playa y el fondo submarino no deben reservar mallas/texturas de las trece islas al arrancar.")
    if "function ensureActiveCoastalIslandSystems(index)" not in index_html or "function disposeActiveCoastalIslandSystems(index)" not in index_html or "if(nextIndex>=0)ensureActiveCoastalIslandSystems(nextIndex)" not in index_html or "disposeActiveCoastalIslandSystems(previousIndex)" not in index_html:
        fail("La costa dinámica debe crearse únicamente para la isla ocupada y liberar la anterior al cambiar de isla.")
    if "const nextIndex=activeBeachIslandIndex;" not in index_html or "const waterDepth=water-terrainY,waterContact=smooth01((waterDepth-.015)/.22)" not in index_html or "waveBodyPositions[offset+1]=waterDepth>0?water+.018+lift:terrainY-.045;" not in index_html or "const dryFoamResidue=terrainY<=(Number(ground.position.y)||0)+.42?" not in index_html or "foamTerrainContact" not in index_html:
        fail("La rompiente debe seguir una única isla activa y quedar oculta bajo terreno seco o elevado.")
    if "function coastalWaterHeight(x,z,t=oceanTime)" not in index_html or "meanSeaLevel+.38" not in index_html or "waveBodyMesh.renderingGroupId=0;" not in index_html or "washMesh.hasVertexAlpha=true;washMesh.renderingGroupId=0;" not in index_html:
        fail("La rompiente transparente debe respetar la profundidad del terreno y limitar el run-up a la cota física de la marea.")
    wave_update_body=index_html[index_html.find("function animateWater(dt)"):index_html.find("function rand(a,b)")]
    if "B.VertexData.ComputeNormals(waveBodyPositions,waveBodyIndices,waveBodyNormals)" not in wave_update_body or "if(foam.waveBodyNormalRefreshCounter>=(isTouchDevice?4:2))" not in wave_update_body:
        fail("La normal geométrica de la rompiente debe actualizarse de forma periódica y acotada.")
    if "state.stepCell(cell,coverage,elapsed,BEACH_STATE_DEFAULTS)" not in index_html or "foamValue = Math.max(foamValue, leadingLace)" not in read_text("scripts/nordic/beach-state.js"):
        fail("La espuma de avance y retirada debe pertenecer al mismo estado RGBA costero.")
    shoreline_body = index_html[index_html.find("function shorelineFoamRadius(island,angle,t=oceanTime,islandIndex=land.indexOf(island),dirX=Math.cos(angle),dirZ=Math.sin(angle))"):index_html.find("const GROUND_PHASE_A_DEFAULTS",index_html.find("function shorelineFoamRadius(island,angle,t=oceanTime,islandIndex=land.indexOf(island),dirX=Math.cos(angle),dirZ=Math.sin(angle))"))]
    if "const terrainY=terrainHeightOnIsland(island,x,z)+terrainDeformationAt(islandIndex,x,z);" not in shoreline_body or "for(let step=0;step<5;step++)" not in shoreline_body or "const span=hi-lo,secant=" not in shoreline_body or ".42;" in shoreline_body:
        fail("El cruce agua/arena debe usar el perfil real y un solver secante acotado.")
    if "const radius=Number.isFinite(shoreline)?shoreline:island.r*1.09" in index_html:
        fail("La espuma no puede usar el borde exterior de la isla como posición de reserva.")
    if "function terrainDeformationAt(islandIndex,x,z)" not in index_html or "terrainDeformationFields[index]=deformationField;" not in index_html:
        fail("El heightfield no conserva el estado físico de deformación del terreno.")
    if "const deformationField={island:is,index,subdivisions,gridSize," not in index_html:
        fail("El campo de deformación del terreno debe enlazar la isla local sin referencias globales indefinidas.")
    if "const deformationPositions=Float32Array.from(positions),deformationNormals=Float32Array.from(normals);" not in index_html or "positions:deformationPositions,normals:deformationNormals" not in index_html:
        fail("Los buffers editables del heightfield deben ser Float32Array, no arrays JavaScript normales.")
    if "const source=data instanceof Float32Array?data:Float32Array.from(data);" not in index_html or "source.subarray(start,end)" not in index_html:
        fail("La subida parcial de vértices debe tolerar arrays normales y usar subarrays tipados.")
    if "function pressGround(x,z,islandIndex,wet,beach,heading)" not in index_html or "pressGround(x,z,islandIndex,wet,beach,heading)" not in index_html or "toeOffsets=[-.108,-.054,0,.054,.108]" not in index_html:
        fail("Las pisadas no presionan la geometría real del terreno.")
    if "function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0));}" not in index_html or "target=-depth*clamp01(" not in index_html:
        fail("La deformación de pisadas debe disponer de clamp01 en el ámbito global del juego.")
    if "window.NorseCoastalInteraction.waterOpacity(physicalDepth)" not in index_html or "oceanDepthVertexColors[index+3]=Math.max(0,Math.min(1,shallowAlpha*shoreOpacity));" not in index_html:
        fail("El agua somera debe tener opacidad controlada sobre un lecho submarino arenoso independiente.")
    if "const alpha=.985*smooth01(t/.045);colors.push(1,.94,.82,alpha);" not in index_html or "const alpha=.88*edgeFade" in index_html:
        fail("La arena debe mantener continuidad opaca bajo el agua y no revelar el heightfield terrestre por el borde exterior.")
    if "function buildCoastalSeabed(island,index)" not in index_html or "norseSubmergedSandyBottom:true" not in index_html or "coastalSeabedMaterial.bumpTexture=texCoastalSandNormalPbr" not in index_html or "return window.NorseCoastalInteraction.seabedHeight(d,is.r,-2.9);" not in index_html:
        fail("El fondo submarino debe ser una malla de arena independiente con relieve propio.")
    if "window.NorseCoastalInteraction.filmSurfaceHeight(terrainY,water,filmWave)" not in index_html or "washFilmCoverage[vertex]=window.NorseCoastalInteraction.filmCoverage(washFractions[row],washPattern[vertex])" not in index_html or "washMaterial.bumpTexture=M.water.bumpTexture||albedoNormalWater" not in index_html:
        fail("La lámina de agua debe ser una superficie independiente, animada y con normales/reflejos.")
    if "const filmAlpha=filmCoverage*(.20+.34*breakStrength)*flowPulse*filmStrength*shallowWashContact;" not in index_html or "const lace=smooth01((foamPattern[vertex]-.20)/.40);" not in index_html or "const exposedSandContact=1-smooth01((waterDepth+.018)/.12);" not in index_html or "foamBreakStrength*.82" not in index_html or "material.bumpTexture=M.water.bumpTexture||albedoNormalWater;" not in index_html or "data.uvs=foamUvs;" not in index_html or "washUvs[uv]=x/24+.5;washUvs[uv+1]=z/24+.5;" not in index_html or "colors,foamPattern,angleValues,angleCos,angleSin,index,waveBodyMesh" not in index_html or "VolumetricShoreBreaker_" not in index_html or "const lift=(.025+.22*crest+.065*rearShoulder)" not in index_html or "const breakerTravel=.24*Math.sin(oceanTime*1.08" not in index_html or "waveBodyMesh.updateVerticesData(B.VertexBuffer.NormalKind,waveBodyNormals,false,false)" not in index_html or "tidalFoamMeshes.push({mesh,positions,foamUvs,colors,foamPattern" not in index_html or "coastalSeabedMaterial.environmentIntensity=.18;" not in index_html or "function sampleRadialProfile(offsets,values,target)" not in index_html or "waveBodyTerrainSamples[waveRow]=terrainY;waveBodyWaterSamples[waveRow]=water;" not in index_html or "const terrainY=sampleRadialProfile(waveBodyOffsets,waveBodyTerrainSamples,profileOffset)" not in index_html or "foamPattern[vertex]=" in index_html[index_html.find("function animateWater(dt)"):index_html.find("function rand(a,b)")] or "washMesh.updateVerticesData(B.VertexBuffer.UVKind,washUvs,false,false)" in index_html[index_html.find("function animateWater(dt)"):index_html.find("function rand(a,b)")] or "foam.mesh.updateVerticesData(B.VertexBuffer.UVKind,foamUvs,false,false)" in index_html[index_html.find("function animateWater(dt)"):index_html.find("function rand(a,b)")] or "const dryFoamResidue=terrainY<=(Number(ground.position.y)||0)+.42?" not in index_html:
        fail("La rompiente debe conservar volumen y textura sin recalcular normales completas ni mostrar geometría sobre la tierra.")
    if "retreatResidue=new Float32Array(segments+1),backwashVelocity=new Float32Array(segments+1)" not in index_html or "const measuredBackwashVelocity=Number.isFinite(previousShore)?retreat/Math.max(.001,foamElapsed):0" not in index_html or "const shorelineBandFade=smooth01((radialOffsetFromShore+1.50)/.18)*(1-smooth01((radialOffsetFromShore-.58)/.22))" not in index_html or "physicalBackwashVelocity:{implemented:true,unit:'m/s'" not in index_html:
        fail("La espuma debe mantenerse en la banda de costa y medir/usar la velocidad real de retroceso en m/s.")
    if "M.water.needDepthPrePass=false;M.water.disableDepthWrite=true;" not in index_html or "washMaterial.emissiveColor=new B.Color3(0,0,0);" not in index_html or "washData.uvs=washUvs;" not in index_html or "washMesh.updateVerticesData(B.VertexBuffer.UVKind,washUvs,false,false);" in index_html[index_html.find("function animateWater(dt)"):index_html.find("function rand(a,b)")]:
        fail("El agua transparente no debe escribir profundidad opaca ni generar bandas; la lámina debe reutilizar normales con UV mundiales.")
    if "mesh.receiveShadows=false;mesh.castShadows=false;mesh.hasVertexAlpha=true;" not in index_html or "shore.receiveShadows=false;shore.castShadows=false;" not in index_html:
        fail("Las capas auxiliares de costa no deben proyectar ni recibir sombras duras en forma de franjas.")
    if ("applyTexture(M.water,texWater,17.5);" not in index_html or "oceanWaveNormal.uScale=8.25;oceanWaveNormal.vScale=11.4;" not in index_html or "oceanWaveNormal.level=.43;" not in index_html or "tertiaryU=3*warpU-2*warpW" not in index_html or "return primary*.66+secondary*.22+tertiary*.12" not in index_html or "crossCrestLift:.072" not in index_html or "shortCrestLift:.044" not in index_html):
        fail("El mar debe mantener normales direccionales de varias escalas, crestas de volumen y microondulación visible desde la cámara del jugador.")
    if "M.water.specularColor=reducedWaterProfile?new B.Color3(.24,.34,.38):new B.Color3(.70,.82,.88);" not in index_html or "M.water.specularPower=reducedWaterProfile?34:52;" not in index_html or "M.water.diffuseFresnelParameters.power=2.3;" not in index_html or "M.water.reflectionTexture.level=.78;" not in index_html:
        fail("El material de agua en Calidad debe conservar reflejos rasantes legibles sin añadir pasadas de renderizado.")
    if "float sheetFront=" in index_html or "color=mix(color,whitewater,swashMask*.56)" in index_html or "shoreSheetStrength" in index_html:
        fail("El avance del agua no puede simularse pintando el suelo de la playa.")
    if "function clamp01(value)" in index_html and index_html.find("updateOceanDepthGradient();",index_html.find("function smooth01")) < index_html.find("const terrainHashCache="):
        fail("El mapa de profundidad no puede inicializarse antes de las funciones y datos del terreno.")
    if "mediumGrain=noise21(worldXZ*2.15" not in index_html or "microGrain=noise21(worldXZ*17.5" not in index_html:
        fail("La arena debe conservar variación de grano a tres escalas en coordenadas mundiales.")
    if "function relaxGround(dt)" not in index_html or "relaxGround(relaxStep);" not in index_html:
        fail("El terreno deformado no recupera su forma gradualmente.")
    if "GroundDynamics.update(dt,audioPos.x,audioPos.z,playerStepDistance,yaw,running&&stamina>0,onShip,playerAirborne);" not in index_html:
        fail("La dinámica del suelo no recibe los pasos reales del jugador.")
    if "norseDeformableGround:true" not in index_html or "updateDeformedNormals(field,changed)" not in index_html:
        fail("El heightfield no actualiza los normales al deformarse.")
    shoreline_start = index_html.find("function shorelineFoamRadius(island,angle,t=oceanTime,islandIndex=land.indexOf(island),dirX=Math.cos(angle),dirZ=Math.sin(angle))")
    shoreline_end = index_html.find("const GROUND_PHASE_A_DEFAULTS", shoreline_start)
    shoreline_body = index_html[shoreline_start:shoreline_end]
    if shoreline_start < 0 or shoreline_end <= shoreline_start or "terrainHeightOnIsland(island,x,z)+terrainDeformationAt(islandIndex,x,z)" not in shoreline_body or "return terrainY-coastalWaterHeight(x,z,t);" not in shoreline_body or "surfaceLimitSq=(island.r*1.09)**2" in shoreline_body or ".42;" in shoreline_body:
        fail("La espuma de orilla debe cruzar el heightfield deformable y mantener el límite de tierra firme.")
    if "waterWaveBasis=new Float32Array((waterBase.length/3)*WATER_WAVE_STRIDE)" not in index_html or "waterDetailHeightAtVertex(i/3,fade)" not in index_html or "waterFarHeightAtVertex(vertex)" not in index_html:
        fail("El oleaje debe conservar sus mismas ondas usando la caché de fases espaciales.")
    if "const FOOTPRINT_ATLAS_SIZE=512,FOOTPRINT_WORLD_SIZE=16;" not in index_html or "createFootprintAtlas({size:FOOTPRINT_ATLAS_SIZE,worldSize:FOOTPRINT_WORLD_SIZE})" not in index_html or "NorseMovingFootprints" not in index_html:
        fail("Las huellas deben usar un atlas cartesiano móvil de 16x16m a 512x512.")
    if "footprintAtlas.stamp(x,z,heading,strength,currentTick)" not in index_html or "footprintAtlas.recenter(x,z)" not in index_html:
        fail("Las pisadas deben marcarse en coordenadas mundiales y seguir al jugador.")
    if "const wrap = value => ((value % size) + size) % size;" not in read_text("scripts/nordic/beach-state.js") or "ringOffsetX = wrap(ringOffsetX + shiftX)" not in read_text("scripts/nordic/beach-state.js"):
        fail("El atlas de huellas debe desplazarse mediante direccionamiento toroidal sin copiar su buffer.")
    if "footprintMaterial.setFloat('footprintTick'" not in index_html or "if(footprintAtlasDirty&&footprintAtlasClock>=1/12)uploadFootprintAtlas();" not in index_html:
        fail("La textura de huellas debe actualizarse por eventos y no cada fotograma.")
    if "footprintMaterial.setVector2('footprintUvOffset',footprintUvOffset)" not in index_html or "fract(vUV+footprintUvOffset)" not in index_html:
        fail("El shader de huellas debe muestrear el atlas toroidal con el offset de anillo.")
    if "transition.flooded" not in index_html or "footprintAtlas.eraseRect(x,z" not in index_html:
        fail("El agua costera debe borrar las huellas de las celdas que acaba de inundar.")
    if "NorseBootImprintBatch" in index_html or "imprintPositionBuffer" in index_html:
        fail("No debe permanecer el antiguo lote de decals polares de huellas.")
    if "GroundSplashParticleBatch" not in index_html or "thinInstanceSetBuffer('color',grainColors,4,true)" not in index_html or "grainMesh.thinInstanceBufferUpdated('matrix')" not in index_html:
        fail("Las salpicaduras deben utilizar el pool de partículas instanciadas.")
    if "const count=wet?(running?8:6):(running?6:4)" not in index_html or "particles[particleCursor++%maxParticles]" not in index_html:
        fail("La emisión de arena/agua debe mantener partículas reutilizables y visibles.")
    if "lastStepX=x;lastStepZ=z;hasLastStepPosition=true" not in index_html or "stepX=lastStepX+segmentX*t,stepZ=lastStepZ+segmentZ*t" not in index_html:
        fail("Cada pisada debe interpolarse en su posición real a lo largo del desplazamiento, sin apilar varias huellas al final del fotograma.")
    if "segmentLength>Math.max(4,distance*2+1)" not in index_html or "hasLastStepPosition=false" not in index_html:
        fail("Los saltos de posición, teletransportes y estados a bordo/en el aire deben reiniciar el trazado de huellas.")
    if "pendingStepDistance:Number(stepDistance.toFixed(3))" not in index_html or "footstepsEmitted" not in index_html:
        fail("El diagnóstico debe exponer la distancia pendiente y el contador de huellas emitidas.")
    if "source.fire&&source.extinguished" not in index_html or "flame.hearth=hearth" not in index_html:
        fail("Las hogueras inundadas no apagan sus llamas y humo.")
    if "parts.root.getAbsolutePosition().y" not in index_html or "rootWorldY-bounds.min.y+.008" not in index_html:
        fail("Los guerreros montados no se alinean usando coordenadas mundiales.")
    if "mount.position=v(side*.66,.967,1.65-i*2.25);" not in index_html:
        fail("La tripulación enemiga no está montada a la altura superior de la cubierta.")
    if "const starterCampX=-40.0,starterCampZ=15.5" not in index_html:
        fail("El campamento inicial sigue en la franja de rompiente.")
    if "guard.parts.realHuman?.role ? .972 : .995" not in index_html:
        fail("Los guardias del drakkar no ajustan la altura según el rig GLB.")
    if "<title>EL SIN NOMBRE · Capítulo I: Un hombre sin tierra · 0.6.291</title>" not in index_html:
        fail("El título de la página no coincide con la versión publicada.")
    if "IslandGarrisonStoneFoot_" not in index_html or "IslandGarrisonSupplyCrate_" not in index_html or "outpostRoot" not in index_html:
        fail("Las nueve guarniciones exteriores deben conservar su base de piedra y caja de suministros.")
    if "for(let islandIndex=4;islandIndex<land.length;islandIndex++)makeIslandGarrison(islandIndex);" not in index_html or "islandGarrison:true" not in index_html:
        fail("Las nueve islas restantes deben tener un puesto conquistable con defensor y estandarte.")
    if "const discoveredIslands=land.map((_,index)=>index===0);" not in index_html or "discoveredIslands:discoveredIslands.slice()" not in index_html:
        fail("El descubrimiento de cada isla debe persistir en el guardado.")
    if "captured+'/'+land.length" not in index_html or "claimed>=land.length" not in index_html:
        fail("La conquista debe medir las trece islas y no las cuatro aldeas antiguas.")
    if '<b id="captured">0/13</b>' not in index_html or '<b id="captured">0/4</b>' in index_html:
        fail("El HUD inicial debe mostrar 0/13 desde el primer fotograma.")
    if "function updateIslandInvasion(dt)" not in index_html or "updateIslandInvasion(dt);" not in index_html or "islandInvasion:snapshotIslandInvasion()" not in index_html or "restoreIslandInvasion(d.islandInvasion)" not in index_html or "invasionDisembark(raider,invasionTarget)" not in index_html:
        fail("La defensa naval debe estar conectada al bucle, al desembarco y al guardado.")
    if "float humidity=clamp(max(wet*.58,wetEdge*.56)*wetSandStrength,0.0,.78)" not in index_html or "color=mix(color,wrackTint,wrackZone*wrackFragments*.045)" not in index_html:
        fail("La arena húmeda debe quedar cálida y difusa; los restos de arribazón no pueden formar una banda oscura.")
    if ("washMaterial.emissiveColor=new B.Color3(0,0,0)" not in index_html
            or "const alpha=Math.min(.80,filmAlpha+whitewater*.76+trailingFoam*.70);" not in index_html
            or "const whitewater=breakStrength*leadingCellular*.64*shallowWashContact;" not in index_html
            or "const trailingFoam=residual*washTrailingProfile[vertex]*(.18+.30*backwashStrength)*exposedSandContact;" not in index_html
            or "const cellular=Math.pow(smooth01((washPattern[vertex]-.34)/.54),2.0)" not in index_html
            or "const crossBreakerPhase=(foamWaveX*.31-foamWaveZ)*.041+oceanTime*.79+angle*1.2;" not in index_html
            or "const foamWaveCrest=smooth01(primaryBreakerCrest*.78+crossBreakerCrest*.22);" not in index_html):
        fail("La lámina debe ser neutra, con espuma fragmentada, resaca persistente y cresta multidireccional.")
    if "const runup=.28+.82*Math.pow(waveCrest,1.15)" not in index_html:
        fail("La lámina de espuma debe conservar una anchura de run-up contenida.")
    if "navalDefensePhaseUnlocked" not in index_html or "villages.every(entry=>entry.claimed)&&discoveredIslands.every(Boolean)" not in index_html:
        fail("El hito de defensa naval solo se desbloquea al explorar y conquistar todo el archipiélago.")
    if "if(vl.islandGarrison)return;" not in index_html:
        fail("Los puestos insulares no deben añadir civiles de relleno y exceder el presupuesto móvil.")
    if "new URLSearchParams(location.search).get('guest')==='1'" not in index_html:
        fail("La vista de prueba debe admitir el parámetro ?guest=1.")
    if "el-sin-nombre-campaign-guest-v8" not in index_html or "el-sin-nombre-campaign-v1" not in index_html:
        fail("La prueba de invitado debe usar una clave independiente y preservar la clave real de campaña.")
    if "const PLAYER_IDENTITY_KEY='el-sin-nombre-identity-'+(SHARE_NEW_GAME?'guest-v8':'main-v1');" not in index_html:
        fail("La identidad de invitado debe permanecer aislada de la identidad de la campaña real.")
    if "function buildShoreFoam(" in index_html or "const shorelineWaves=[]" in index_html:
        fail("El helper buildShoreFoam sin uso debe desaparecer únicamente en el último hito.")
    if "await scene.whenReadyAsync();" not in index_html or "requestAnimationFrame(()=>requestAnimationFrame(resolve))" not in index_html or "STARTUP_SCENE_WARMUP_TIMEOUT_MS=2200" in index_html:
        fail("La preparación gráfica global debe estar acotada por timeout en ambos perfiles.")
    if "const grassStartupSliceBudgetMs=isConstrainedMobile?8:12;" not in index_html or "const grassBuildSliceBudgetMs=staging?(isTouchDevice?3.5:6):grassStartupSliceBudgetMs;" not in index_html or "await yieldGrassStartupIfNeeded(islandIndex,placed,want);" not in index_html:
        fail("La generación de vegetación debe ceder el control según tiempo real de CPU.")
    if "const occupiedGridCells=new Uint8Array(gridSide*gridSide)" not in index_html or "const terrainHashCache=new Map()," not in index_html:
        fail("La generación del terreno y la hierba debe reutilizar buffers compactos y hashes deterministas.")
    if "const initialGrassIslandIndex=landIslandIndex(player.root.position.x,player.root.position.z);" not in index_html or "await createRealGrass(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ);" not in index_html or "async function createRealGrass(onlyIslandIndex=null,focusX=null,focusZ=null,staging=false)" not in index_html or "if(onlyIslandIndex!==null&&islandIndex!==onlyIslandIndex)continue;" not in index_html or "const radius=Math.min(92,safeLandRadius);" not in index_html or "if(!isPerformanceMode){" not in index_html or "console.info('Hierba desactivada en modo Rendimiento.');" not in index_html:
        fail("Solo Calidad debe generar hierba local; Rendimiento debe desactivarla completamente.")
    if "async function streamActiveIslandGrass(index,focusX,focusZ)" not in index_html or "(!sameIsland||moved)&&!grassStreamPromise" not in index_html or "createRealGrass(index,focusX,focusZ,true)" not in index_html or "Visible Nordic ground cover swapped atomically" not in index_html or "GRASS_STREAM_RECENTER_DISTANCE=isTouchDevice?58:46" not in index_html or "grassStream:{activeIslandIndex:grassStreamActiveIslandIndex,pending:!!grassStreamPromise}" not in index_html or "if(onShip||bestRatio>1.09)currentIsland=-1" not in index_html:
        fail("La hierba debe seguir el área cercana y no cargar islas hasta desembarcar.")
    if "leavesPerClump=isPerformanceMode?8:10" not in index_html or "const show=batch.islandIndex===visibleGrassIslandIndex;" not in index_html or "const chunkSize=56,grassBatches=new Map();" not in index_html or "const areaFraction=Math.min(1,(radius*radius)/(safeLandRadius*safeLandRadius));" not in index_html:
        fail("La hierba de Calidad debe conservar el detalle y limitar la generación al área local.")
    if "await createRealGrass(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ);" not in index_html or "recordStartupTask('Hierba 3D inicial de Calidad'" not in index_html or "function startDeferredWorldModels()" not in index_html:
        fail("La hierba inicial de Calidad debe estar lista antes de entrar y los GLB secundarios deben cargarse después.")
    if "audioPreloadResult=await startupAudioPreload" not in index_html or "RECURSO OBLIGATORIO: efectos de sonido" not in index_html or "startupAudioPreload.then(" not in index_html:
        fail("Los efectos de sonido deben terminar antes de entrar; la música continúa en streaming.")
    if "antialias:activeGraphicsProfile!=='performance'" not in index_html or "(isTouchDevice?2048:" not in index_html:
        fail("El perfil de calidad en iPhone debe conservar antialiasing y sombras de alta resolución.")
    if "const leavesPerClump=isPerformanceMode?8:10;" not in index_html or "gm.twoSidedLighting=true;" not in index_html:
        fail("Los penachos o su iluminación de doble cara están incompletos.")
    if "isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:" not in index_html or "performanceDensity=isConstrainedMobile?(isUltraLowEndMobile?.22:(isGalaxyA12NachoPerformance?.18:.26))" not in index_html:
        fail("El perfil A10/A12 Nacho no conserva el presupuesto específico de resolución y vegetación.")
    if "const isGalaxyA12NachoPerformance=!!(isPerformanceMode&&isTouchDevice&&(galaxyA12NachoHardwareMatch||galaxyA12NachoGpuMatch));" not in index_html:
        fail("El Galaxy A12 Nacho SM-A127 / Exynos 850 no tiene un perfil de Rendimiento específico.")
    if "ultraLowEndIslandStreaming=!!(isPerformanceMode&&(isUltraLowEndMobile||isGalaxyA12NachoPerformance))" not in index_html:
        fail("El Galaxy A12 Nacho no activa el streaming visual de la isla ocupada.")
    if "isGalaxyA12NachoPerformance?32:" not in index_html or "isGalaxyA12NachoPerformance?1/5:" not in index_html:
        fail("El perfil A12 Nacho no aplica los límites de malla de agua y actualización previstos.")
    if "shadowGen=(!isConstrainedMobile||isUltraLowEndMobile||isGalaxyA12LowEndMobile)" not in index_html or "const enterRadius=isConstrainedMobile?58:175" not in index_html:
        fail("El perfil A10/A12 no activa sombras dinámicas acotadas por distancia.")
    if "const warriorPartsToLoad=humanEnemyParts.filter(p=>/^VillageGuard0_/" not in index_html or "const civilianPartsToLoad=humanCivilianParts.slice(0,lowMemoryNpcBudget?1:2)" not in index_html or "const lowMemoryNpcBudget=!!(isUltraLowEndMobile||isGalaxyA12LowEndMobile||isGalaxyA12NachoPerformance)" not in index_html:
        fail("Los NPC GLB de la isla inicial deben cargarse antes de entrar con presupuesto reducido en A10/A12.")
    if "const gridSide=Math.ceil(Math.sqrt(want*1.60))" not in index_html or "const minSpacing=cellSize*.24" not in index_html:
        fail("Falta la distribución uniforme con separación mínima.")
    if "const grids=[grid(4,4),grid(10,10),grid(24,24),grid(60,60),grid(144,144),grid(288,288)];" not in index_html:
        fail("El suelo no utiliza escalas orgánicas de textura.")
    if "for(let i=0;i<8200;i++)" not in index_html or "terrainPBR.bumpTexture.level=GROUND_PHASE_A_DEFAULTS.relief;" not in index_html:
        fail("Falta el detalle fino de suelo o su relieve PBR.")
    if "for(const sample of candidateCells)" not in index_html or "if(occupiedGridCells[sample])continue;" not in index_html or "for(let attempt=0;attempt<4&&placed<want;attempt++)" not in index_html:
        fail("La distribución no rellena las celdas vacías con el buffer tipado y el segundo barrido.")
    if "function createShrub(" in index_html or "IslandShrubBatch_" in index_html or "NorseShrubsIsland_" in index_html:
        fail("Siguen presentes los arbustos decorativos low-poly aislados.")
    if "function isVegetationTrailClearance(" not in index_html or "vegetationTrailPaths.push(" not in index_html or "isVegetationTrailClearance(x,z,1.35)" not in index_html:
        fail("La hierba no respeta los caminos.")
    if "function createNaturalShrub(" not in index_html or "function spawnNaturalVegetationAndFauna()" not in index_html:
        fail("Falta la vegetación natural de sotobosque.")
    if "function loadWildlifeModels()" not in index_html or "function updateWildlife(dt)" not in index_html or "updateWildlife(dt);" not in index_html:
        fail("Falta el cargador y el controlador de la fauna salvaje rigged.")
    if "function createWildlifeAnimal(" in index_html or "FaunaTorso" in index_html or "BoarSnout" in index_html:
        fail("Siguen presentes los animales provisionales construidos con primitivas.")
    if "function loadWildlifeModels()" not in index_html or "function playWildlifeAnimation(" not in index_html or "ImportMeshAsync(" not in index_html or "numBoneInfluencers>0" not in index_html or "Deer.glb" not in index_html or "Stag.glb" not in index_html or "Wolf.glb" not in index_html:
        fail("Falta la importación GLB con esqueleto de ciervo, venado y lobo.")
    if "const animalCount=idx===0?3:(idx<4?1:0);" not in index_html:
        fail("La fauna debe conservar el roster completo en Rendimiento y Calidad.")
    if "const performanceDensity=isConstrainedMobile?" not in index_html or "leavesPerClump=isPerformanceMode?8:10" not in index_html or "audioPreloadResult=await startupAudioPreload" not in index_html or "startupAudioPreload.then(" not in index_html or "await Promise.all([playerHumanLoadPromise,npcStartupPromise])" not in index_html:
        fail("El ajuste de hierba preexistente de Rendimiento debe mantenerse y la fauna debe cargar después sin recortar su roster.")
    if "const civilianWarmupPromise=civilianTotal?" not in index_html or "const warmed=await civilianWarmupPromise" not in index_html:
        fail("La preparación de aldeanos debe compartir la misma promesa de carga y reutilizar el resultado al instanciarlos.")
    if "WILDLIFE_SOURCE_COMMIT='6d6de54a1d7143cf5487462d147bbef039de4837'" not in index_html or "function loadWildlifeModels()" not in index_html:
        fail("Los modelos de fauna de Calidad deben conservar su fuente inmutable y su cargador.")
    if "function isSafeIslandGroundPoint(" not in index_html or "return null;" not in index_html[index_html.find("function sampleGroundPoint("):index_html.find("land.forEach((is,idx)=>{", index_html.find("function sampleGroundPoint("))]:
        fail("La vegetación no valida tierra firme o todavía utiliza ubicaciones de reserva.")
    if "homeIslandIndex" not in index_html or "isSafeIslandGroundPoint(homeIsland,nx,nz,Infinity,1.05,.52)" not in index_html:
        fail("La fauna GLB no conserva su isla de origen o puede caminar hacia el mar.")
    if "const groundOffset=-attachedBounds.min.y+.015;" not in index_html or "actor.position.y=groundY+groundOffset;" not in index_html or "const finalBounds=boundsForMeshes(meshes);" not in index_html:
        fail("La fauna GLB debe calcular y verificar el apoyo del cuerpo después de montar las raíces en el actor.")
    if "animal.groundOffset" not in index_html or "+animal.groundOffset;" not in index_html:
        fail("El bucle de fauna vuelve a sobrescribir la altura de apoyo de los modelos.")
    if "collisionRadius:definition.collisionRadius*size" not in index_html or "canWildlifeMove(nx,nz,animal.collisionRadius)" not in index_html:
        fail("La fauna no utiliza el volumen corporal al evitar árboles y obstáculos.")
    if "wildlifeSpawnSpecs.some(other=>Math.hypot(x-other.x,z-other.z)<5.6)" not in index_html:
        fail("La generación permite que dos animales se solapen.")
    if "trees.some(t=>Math.hypot(x-t.x,z-t.z)<(t.radius||.6)+3.0)" not in index_html:
        fail("Los animales pueden aparecer demasiado cerca de los troncos.")
    if "RaiderCrewMount_" not in index_html or "if(parts.vesselMount)" not in index_html:
        fail("La tripulación del drakkar no está anclada a la cubierta.")
    if "p.rotationQuaternion=null;" not in index_html or "p.position.set(seat.x,guard.parts.realHuman?.role ? .972 : .995,seat.z)" not in index_html:
        fail("La tripulación no limpia la rotación heredada ni fija coordenadas locales de cubierta.")
    shore_start = index_html.find("function placeShipAllyOnShore(")
    shore_end = index_html.find("function animateViking(", shore_start)
    shore_body = index_html[shore_start:shore_end]
    if shore_start < 0 or shore_end <= shore_start or "root.getAbsolutePosition().clone()" not in shore_body or "root.position.copyFrom(worldPosition)" not in shore_body:
        fail("El desembarque no conserva la transformación mundial del tripulante.")
    if "function isSafeShrubGroundPoint(" not in index_html or "groundY<.82" not in index_html or "Math.hypot(sx,sz)<=.48" not in index_html:
        fail("Los arbustos no validan altura mínima, costa y pendiente del terreno.")
    shrub_start = index_html.find("function createNaturalShrub(")
    shrub_end = index_html.find("// Quaternius Ultimate Animated Animals", shrub_start)
    shrub_body = index_html[shrub_start:shrub_end]
    if shrub_start < 0 or shrub_end <= shrub_start or shrub_body.find("mergeStaticDecorByMaterial(root,'NaturalBroadleafShrub')") > shrub_body.find("root.position.set(x,groundY+.012,z)"):
        fail("La geometría de arbustos se fusiona después de transformar el pivote y puede desplazarse.")
    if "if(!isSafeShrubGroundPoint(island,x,z)||" not in index_html or "naturalShrubs.some(b=>" not in index_html:
        fail("La generación de arbustos no valida el terreno ni evita solapamientos.")
    if "function removeStrayDebugGeometry(targetScene)" not in index_html or "removeStrayDebugGeometry(scene);" not in index_html:
        fail("Falta la limpieza segura de mallas de depuración residuales.")
    if "HutTimberCore" in index_html or "HutEndWallPlank_" not in index_html or "HutSideWallPlank_" not in index_html:
        fail("La cabaña todavía contiene el bloque macizo en vez de paredes de tablones.")
    if "PierSupportPile_" not in index_html:
        fail("El muelle no tiene pilotes de soporte hasta el lecho marino.")
    if "FACTION_BADGE_MAX_DISTANCE=28" not in index_html or "parts.factionBadge.isVisible=distanceSq<maxSq" not in index_html:
        fail("Las insignias lejanas siguen apareciendo como puntos rojos.")
    if "mesh.receiveShadows=false;mesh.castShadows=false;" not in index_html or "mesh.material=packedTrailMaterial;" not in index_html:
        fail("El camino no utiliza tierra compactada sin recepción de sombras.")
    if "indices.push(a,b,a+1,a+1,b,b+1);" not in index_html or "packedTrailTexture" not in index_html:
        fail("La malla o la textura independiente del camino están incompletas.")

    expected_guest = {
        "guest.html": "guest-file-manifest.webmanifest",
        "guest/index.html": "guest-manifest.webmanifest",
        "invitado/index.html": "invitado-manifest.webmanifest",
    }
    for page, manifest_name in expected_guest.items():
        html = read_text(page)
        if 'name="el-sin-nombre-guest-entry" content="true"' not in html:
            fail(f"{page} no está marcado como entrada independiente de invitado.")
        if "const SHARE_NEW_GAME=true;" not in html:
            fail(f"{page} no fuerza una partida independiente de invitado.")
        if "el-sin-nombre-campaign-guest-v8" not in html:
            fail(f"{page} no usa el espacio de guardado independiente de invitados.")
        if f'./{manifest_name}' not in html:
            fail(f"{page} no enlaza con su manifiesto PWA específico.")

    expected_start_urls = {
        "guest-manifest.webmanifest": f"./guest/index.html?newgame=1&v={version}",
        "invitado-manifest.webmanifest": f"./invitado/index.html?newgame=1&v={version}",
        "guest-file-manifest.webmanifest": f"./guest.html?v={version}",
    }
    for manifest_name, start_url in expected_start_urls.items():
        manifest = json.loads(read_text(manifest_name))
        if manifest.get("start_url") != start_url:
            fail(f"start_url desactualizada en {manifest_name}: {manifest.get('start_url')!r}")
        if not manifest.get("scope"):
            fail(f"Falta scope en {manifest_name}.")

    node = shutil.which("node")
    if not node:
        fail("Node.js es necesario para validar la sintaxis JavaScript publicada.")
    beach_state_test = ROOT / "scripts" / "test_beach_state.cjs"
    if not beach_state_test.is_file():
        fail("Falta la suite de comportamiento de BeachState.")
    beach_test = subprocess.run(
        [node, str(beach_state_test)],
        capture_output=True,
        text=True,
    )
    if beach_test.returncode:
        fail("Fallaron las pruebas de BeachState:\\n" + beach_test.stdout + beach_test.stderr)
    print("OK BeachState: humectación, secado, espuma, escala y atlas de huellas.")
    startup_guard_test = ROOT / "scripts" / "test_startup_guard.cjs"
    if not startup_guard_test.is_file():
        fail("Falta la prueba de barrera de arranque antes de abrir la partida.")
    startup_guard = subprocess.run(
        [node, str(startup_guard_test)],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if startup_guard.returncode:
        fail("Falló la barrera de carga completa previa a la partida:\\n" + startup_guard.stdout + startup_guard.stderr)
    print("OK Startup: protagonista, NPC, fauna, audio y shaders preparados antes de abrir el juego.")
    with tempfile.TemporaryDirectory(prefix="eln-release-check-") as temp_dir:
        temp = Path(temp_dir)
        sw_check = subprocess.run(
            [node, "--check", str(DIST / "sw.js")],
            capture_output=True,
            text=True,
        )
        if sw_check.returncode:
            fail("Sintaxis inválida en sw.js:\n" + sw_check.stderr)

        for number, page in enumerate(HTML_PAGES):
            html = read_text(page)
            blocks = re.findall(
                r"<script\b[^>]*>(.*?)</script\s*>",
                html,
                re.IGNORECASE | re.DOTALL,
            )
            inline = [block for block in blocks if block.strip()]
            if not inline:
                fail(f"No se encontraron scripts inline en {page}.")
            check_file = temp / f"inline-{number}.js"
            check_file.write_text("\n".join(inline), encoding="utf-8")
            check = subprocess.run(
                [node, "--check", str(check_file)],
                capture_output=True,
                text=True,
            )
            if check.returncode:
                fail(f"Sintaxis JavaScript inválida en {page}:\n{check.stderr}")

    print(
        f"OK EL SIN NOMBRE {version}: páginas, rutas de invitado, manifiestos, "
        "caché, hashes y JavaScript verificados."
    )
    print(
        f"OK {len(entries)} recursos registrados; entorno nórdico local "
        "y service worker validados."
    )

if __name__ == "__main__":
    main()
