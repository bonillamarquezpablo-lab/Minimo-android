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
EXPECTED_VERSION = "0.6.173"

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
    if "function applyRealPlayerFingerPose" not in index_html:
        fail("Falta el controlador de flexión individual de los dedos.")
    if "applyRealPlayerFingerPose(realRightGripBones,holding?'grip':'restore')" not in index_html:
        fail("La mano derecha no aplica la pose de agarre del arma.")
    if "applyRealPlayerFingerPose(realLeftGripBones,'relaxed')" not in index_html:
        fail("La mano izquierda no aplica una curva relajada de dedos.")
    if "joint===1?.56:joint===2?.76:.58" not in index_html or "joint===1?.27:joint===2?.39:.30" not in index_html:
        fail("La flexión visible de los dedos no está aplicada en ambas manos.")
    if "alignPalmTowardTorso" in index_html:
        fail("Se ha reintroducido el giro experimental de palma en espacio mundial.")
    if "La rotación de la palma se conserva íntegra." not in index_html:
        fail("La corrección de brazos no debe añadir rotaciones a la palma.")
    gait_start = index_html.find("function updateRealRigGait(")
    gait_end = index_html.find("\n\n function createRealWeapon(", gait_start)
    player_gait = index_html[gait_start:gait_end] if gait_start >= 0 and gait_end > gait_start else ""
    if not player_gait or player_gait.count("relaxHumanoidArm(") != 4:
        fail("La postura estable debe colocar ambos brazos en reposo y navegación.")
    arm_start = index_html.find("function relaxHumanoidArm(")
    arm_end = index_html.find("\n function relaxHumanoidLeg(", arm_start)
    arm_pose = index_html[arm_start:arm_end] if arm_start >= 0 and arm_end > arm_start else ""
    if not arm_pose or arm_pose.count("rotateBoneWorldTowardExact(") < 2:
        fail("Falta la colocación anatómica de hombro y antebrazo.")
    if "La rotación de la palma se conserva íntegra." not in arm_pose:
        fail("La pose de brazo no debe girar la palma.")
    if "restoreRigNodePose(node,realBoneRest.get(node))" not in player_gait:
        fail("El reposo del jugador no restaura el bind pose original del GLB.")
    if "Postura bilateral recuperada de la versión estable" not in player_gait:
        fail("Falta la pose bilateral estable sin giro de palma.")
    grip_start = index_html.find("function applyRealPlayerClubGripPose(){")
    grip_end = index_html.find("\n }", grip_start)
    grip_pose = index_html[grip_start:grip_end] if grip_start >= 0 and grip_end > grip_start else ""
    if not grip_pose or "relaxHumanoidArm" in grip_pose:
        fail("La pose de dedos no debe volver a girar el brazo o la muñeca.")
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
    if "const modelSide=-side;" not in arm_pose or arm_pose.count("modelSide*(") != 5 or "side*(" in arm_pose:
        fail("Las direcciones laterales del brazo no coinciden con los lados reales del rig GLB.")
    if "modelSide*(.025+breathSway*.010),-.958,.13+breathSway*.032" not in arm_pose:
        fail("El antebrazo derecho no conserva la dirección corregida hacia su lado anatómico.")

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
