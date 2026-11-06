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
EXPECTED_VERSION = "0.6.181"

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
    if "if(holding&&(mode==='idle'||mode==='sail'))" in index_html:
        fail("La pose del brazo se está recalculando en el callback posterior a las animaciones.")
    if "upper:{outward:.26,forward:-.21},forearm:{outward:.15,forward:-.08}" not in index_html:
        fail("La calibración fija del brazo libre no coincide con los valores aprobados.")
    if "upper:{outward:.16,forward:-.02},forearm:{outward:0,forward:0}" not in index_html:
        fail("La calibración fija del brazo del palo no coincide con los valores aprobados.")
    if "new B.Vector3(.26,-Math.sqrt(1-.26*.26-.21*.21),-.21)" not in index_html:
        fail("El objetivo de reposo del brazo libre no usa la calibración fijada.")
    if "new B.Vector3(.15,-Math.sqrt(1-.15*.15-.08*.08),-.08)" not in index_html:
        fail("El objetivo de reposo del antebrazo libre no usa la calibración fijada.")
    if "new B.Vector3(.16,-Math.sqrt(1-.16*.16-.02*.02),-.02)" not in index_html:
        fail("El objetivo de reposo del brazo del arma no usa la calibración fijada.")
    if "new B.Vector3(0,-1,0)" not in index_html:
        fail("El objetivo de reposo del antebrazo del arma no usa la calibración fijada.")
    if "updateArmTuneControls();" not in index_html:
        fail("El panel no sincroniza sus controles con los valores de reposo fijados.")
    if ("function getRealPlayerSkeletonBodyFrame(nodes)" not in index_html
            or "const realPlayerArmFrameMode='ESQUELETO';" not in index_html
            or "function getRealPlayerBodyFrame(nodes,root)" not in index_html
            or "return getRealPlayerSkeletonBodyFrame(nodes);" not in index_html
            or "applyRealPlayerArmPoseAfterAnimations();" not in index_html
            or "function sampleRealPlayerArmDeviation()" not in index_html
            or "const realPlayerArmFrameBar=document.createElement('div');" in index_html):
        fail("El marco ESQUELETO debe ser fijo, los controles deben actualizar la pose y no debe aparecer el selector de marco.")
    if "player.root.rotation.y=B.Scalar.LerpAngle(player.root.rotation.y,yaw" not in index_html:
        fail("El giro del jugador no interpola el ángulo por el arco más corto.")
    grip_start = index_html.find("function applyRealPlayerClubGripPose(){")
    grip_end = index_html.find("function applyRealPlayerArmPoseAfterAnimations", grip_start)
    if grip_start < 0 or grip_end <= grip_start or "relaxRealPlayerWeaponArm(" in index_html[grip_start:grip_end]:
        fail("El callback de agarre vuelve a competir por la pose del brazo.")
    gait_start = index_html.find("function updateRealRigGait(")
    gait_end = index_html.find("function createRealWeapon(", gait_start)
    gait_body = index_html[gait_start:gait_end]
    if gait_start < 0 or gait_end <= gait_start or "relaxRealPlayerFreeArm(" in gait_body or "relaxRealPlayerWeaponArm(" in gait_body:
        fail("El solucionador anatómico sigue ejecutándose antes de las animaciones.")
    post_arm_start = index_html.find("function applyRealPlayerArmPoseAfterAnimations(){")
    post_arm_end = index_html.find("function quaternionAlignYTo", post_arm_start)
    post_arm_body = index_html[post_arm_start:post_arm_end]
    if post_arm_start < 0 or post_arm_end <= post_arm_start:
        fail("Falta el solucionador anatómico posterior a las animaciones.")
    if "applyRealPlayerArmPoseAfterAnimations();" not in index_html:
        fail("El solucionador anatómico no se invoca después de las animaciones.")
    if "restoreRealPlayerArmBindPose(n);" not in post_arm_body:
        fail("La locomoción no restaura las cadenas completas antes de resolverlas.")
    if post_arm_body.count("relaxRealPlayerFreeArm(") != 1 or post_arm_body.count("relaxRealPlayerWeaponArm(") != 1:
        fail("No hay un único solucionador postanimación para ambos brazos.")
    if "CLIP NATIVO" in post_arm_body or "m.leftUpperArm" in post_arm_body or "m.upperArm" in post_arm_body:
        fail("Los clips nativos todavía compiten con el solucionador anatómico.")
    if "const realPlayerArmTuningEnabled=true;" not in index_html:
        fail("El ajuste de brazos no está habilitado en el juego normal.")
    if "Object.values(rig).forEach(rememberRigRest);" not in index_html:
        fail("El bind pose no se captura para todos los huesos mapeados del rig.")
    bind_start = index_html.find("function restoreRealPlayerArmBindPose(nodes){")
    bind_end = index_html.find("function applyRealPlayerArmPoseAfterAnimations", bind_start)
    bind_body = index_html[bind_start:bind_end]
    if bind_start < 0 or bind_end <= bind_start:
        fail("Falta la restauración determinista del bind pose de ambos brazos.")
    for node_key in ("nodes.leftUpperArm", "nodes.leftForearm", "nodes.leftHand", "nodes.upperArm", "nodes.forearm", "nodes.hand"):
        if node_key not in bind_body:
            fail(f"La restauración determinista no incluye {node_key}.")
    if "restoreRealPlayerArmBindPose(n);" not in index_html:
        fail("Las cadenas de ambos brazos no se restauran desde bind pose después de cada clip.")
    pose_start = index_html.find("function applyRealPlayerArmPoseAfterAnimations(){")
    pose_end = index_html.find("function quaternionAlignYTo", pose_start)
    pose_body = index_html[pose_start:pose_end]
    if pose_body.count("relaxRealPlayerFreeArm(") != 1 or pose_body.count("relaxRealPlayerWeaponArm(") != 1:
        fail("El solver postanimación no es propietario único de ambas cadenas de brazos.")
    if "m.leftUpperArm" in pose_body or "m.upperArm" in pose_body or "CLIP NATIVO" in pose_body:
        fail("La locomoción todavía alterna entre propietario nativo y procedural de los brazos.")
    twist_start = index_html.find("function getRealPlayerArmTwistTuning(arm){")
    twist_end = index_html.find("function applyRealPlayerArmTwist", twist_start)
    twist_body = index_html[twist_start:twist_end]
    if "isRealPlayerArmTuningResting()" in twist_body or "handSharePercent:0" in twist_body:
        fail("La distribución de torsión cambia entre reposo y locomoción.")
    finger_start = index_html.find("function getRealPlayerFingerCurl(entry,arm){")
    finger_end = index_html.find("const yieldStartupFrame", finger_start)
    finger_body = index_html[finger_start:finger_end]
    if "isRealPlayerArmTuningResting()&&digit" in finger_body:
        fail("El cierre de dedos cambia entre reposo y locomoción.")
    if "window.setInterval(updateRealPlayerArmDebugPanel,500);\n  window.setInterval(sampleRealPlayerArmDeviation,100);\n }\n // Panel de ajuste permanente" not in index_html:
        fail("El panel de ajuste sigue dentro del bloque de diagnóstico debug=1.")
    if "armTuneDock.appendChild(armTuneToggle);" not in index_html or "realPlayerArmTuneReset" not in index_html:
        fail("El menú de ajuste y su botón de restablecer no están montados.")
    if "const holding=!!realWeaponGroups[equippedWeapon];" not in index_html:
        fail("El cierre de dedos no contempla todas las armas equipadas.")
    pivot_update = index_html.find("realPlayerModelPivot.rotation.z=onShip?")
    gait_update = index_html.find("updateRealRigGait(walkPhase", index_html.find("const realMode="))
    if pivot_update < 0 or gait_update < 0 or pivot_update > gait_update:
        fail("La orientación visual del torso se actualiza después de resolver los brazos.")
    if "if(walking&&realPlayerCurrentGroup&&realPlayerCurrentGroup.isPlaying)return;" in index_html:
        fail("El gait procedural sigue saltándose los huesos no animados por el clip Walk/Run.")
    if "gripWorld.addInPlace(modelForward.scale(.075))" not in index_html:
        fail("El palo no tiene el desplazamiento frontal de visibilidad en la palma.")
    if "RealCastawayStickGrip',club,[0,.20,.025]" not in index_html:
        fail("La empuñadura del palo no está centrada en la palma.")
    if "modelForward.clone().add(new B.Vector3(0,.24,0)).normalize()" not in index_html:
        fail("El palo no está orientado hacia delante con inclinación descendente.")
    if "distal.scale(.025)" not in index_html:
        fail("El anclaje del palo no sigue el eje muñeca-palma.")
    if "side*(.025+breathSway*.010),-.958,.13" not in index_html:
        fail("La pose natural del antebrazo con el palo no está restaurada.")

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
