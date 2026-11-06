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
EXPECTED_VERSION = "0.6.184"

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
