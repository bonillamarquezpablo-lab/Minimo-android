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
EXPECTED_VERSION = "0.6.202"

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
    *MANIFESTS,
    "icon.svg",
    "assets/asset-manifest.json",
    "assets/environmentSpecular.env",
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

    asset_manifest = json.loads(read_text("assets/asset-manifest.json"))
    if asset_manifest.get("game") != "EL SIN NOMBRE" or asset_manifest.get("version") != version:
        fail("El manifiesto de recursos no corresponde al juego y versión publicados.")
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
    if "function updateGrassDebugPanel()" not in index_html or "grassDebugIslandStats.push({" not in index_html:
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
    if "const packedTrailTexture=makePatternTexture('Packed Norse trail earth','#66533b',['#8e7957','#4b3a2a','#a18a62','#574633'],'sand',512,true);" not in index_html:
        fail("La textura procedural de los caminos también debe generar mipmaps.")
    if "makePatternTexture(name,base,accents,style='grain',size=512,generateMipMaps=false)" not in index_html:
        fail("La generación selectiva de mipmaps de las texturas procedurales ha cambiado.")
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
    if "const texCoastalSand=makeLivingCoastalSandTexture();" not in index_html or "M.sand.bumpTexture.level=.72;" not in index_html:
        fail("La arena no utiliza el albedo costero de grano fino y su relieve PBR.")
    if "function buildLivingBeachLayer(island,index)" not in index_html or "function updateBeach(dt,focusX,focusZ)" not in index_html:
        fail("Falta la capa de playa con humedad y espuma residual dinámica.")
    if "function terrainDeformationAt(islandIndex,x,z)" not in index_html or "terrainDeformationFields[index]=deformationField;" not in index_html:
        fail("El heightfield no conserva el estado físico de deformación del terreno.")
    if "const deformationField={island:is,index,subdivisions,gridSize," not in index_html:
        fail("El campo de deformación del terreno debe enlazar la isla local sin referencias globales indefinidas.")
    if "function pressGround(x,z,islandIndex,wet,beach)" not in index_html or "pressGround(x,z,islandIndex,wet,beach)" not in index_html:
        fail("Las pisadas no presionan la geometría real del terreno.")
    if "function relaxGround(dt)" not in index_html or "relaxGround(dt);" not in index_html:
        fail("El terreno deformado no recupera su forma gradualmente.")
    if "GroundDynamics.update(dt,audioPos.x,audioPos.z,playerStepDistance,yaw,running&&stamina>0,onShip,playerAirborne);" not in index_html:
        fail("La dinámica del suelo no recibe los pasos reales del jugador.")
    if "norseDeformableGround:true" not in index_html or "updateDeformedNormals(field,changed)" not in index_html:
        fail("El heightfield no actualiza los normales al deformarse.")
    if "terrainSurfaceAt(x,z)-waterHeight(x,z,t)" not in index_html:
        fail("La línea de agua no reacciona al terreno físicamente deformado.")
    if "function shorelineFoamRadius(island,angle,t=oceanTime)" not in index_html or "terrainSurfaceAt(x,z)-waterHeight(x,z,t)" not in index_html:
        fail("La espuma de orilla no sigue la intersección actual del oleaje con el terreno.")
    if "row===0?.025:(row===1?.14:.30)" not in index_html or "DynamicSubmergedShoreWash_" not in index_html:
        fail("La espuma de orilla invade la arena seca o usa la malla antigua.")
    if "foam.positions[offset+1]=waterHeight(x,z,oceanTime)+.024" not in index_html or "foam.positions[offset+1]=-3.2" not in index_html:
        fail("La espuma no se actualiza con el oleaje o no se oculta cuando no hay intersección.")
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
    if "<title>EL SIN NOMBRE · Capítulo I: Un hombre sin tierra · 0.6.202</title>" not in index_html:
        fail("El título de la página no coincide con la versión publicada.")
    if "const leavesPerClump=isPerformanceMode?8:10;" not in index_html or "gm.twoSidedLighting=true;" not in index_html:
        fail("Los penachos o su iluminación de doble cara están incompletos.")
    if "const gridSide=Math.ceil(Math.sqrt(want*1.60))" not in index_html or "const minSpacing=cellSize*.24" not in index_html:
        fail("Falta la distribución uniforme con separación mínima.")
    if "const grids=[grid(4,4),grid(10,10),grid(24,24),grid(60,60),grid(144,144),grid(288,288)];" not in index_html:
        fail("El suelo no utiliza escalas orgánicas de textura.")
    if "for(let i=0;i<8200;i++)" not in index_html or "terrainPBR.bumpTexture.level=GROUND_PHASE_A_DEFAULTS.relief;" not in index_html:
        fail("Falta el detalle fino de suelo o su relieve PBR.")
    if "const refillCells=candidateCells.filter(sample=>!occupiedGridCells.has(sample));" not in index_html:
        fail("La distribución no rellena las celdas vacías.")
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
    if "const animalCount=isPerformanceMode?(idx===0?2:(idx===1?1:0)):(idx===0?3:(idx<4?1:0));" not in index_html:
        fail("El número de animales no está reducido en modo Rendimiento.")
    if "WILDLIFE_SOURCE_COMMIT='6d6de54a1d7143cf5487462d147bbef039de4837'" not in index_html or "await loadWildlifeModels();" not in index_html:
        fail("La fuente de fauna no está fijada a una revisión inmutable o no se carga.")
    if "function isSafeIslandGroundPoint(" not in index_html or "return null;" not in index_html[index_html.find("function sampleGroundPoint("):index_html.find("land.forEach((is,idx)=>{", index_html.find("function sampleGroundPoint("))]:
        fail("La vegetación no valida tierra firme o todavía utiliza ubicaciones de reserva.")
    if "homeIslandIndex" not in index_html or "isSafeIslandGroundPoint(homeIsland,nx,nz,Infinity,1.05,.52)" not in index_html:
        fail("La fauna GLB no conserva su isla de origen o puede caminar hacia el mar.")
    if "const groundOffset=-bounds.min.y*scale;" not in index_html or "groundOffset+terrainHeightOnIsland(homeIsland,x,z)" not in index_html:
        fail("La importación GLB no calcula y aplica el desplazamiento vertical de apoyo.")
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
        if "el-sin-nombre-campaign-guest-v7" not in html:
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
