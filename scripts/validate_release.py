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
EXPECTED_VERSION = "0.6.168"

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
    club_pose = index_html.split("function applyRealPlayerClubGripPose()", 1)[1].split("function quaternionAlignYTo", 1)[0]
    if "relaxHumanoidArm(" in club_pose:
        fail("La pose del brazo se aplica dos veces en el fotograma del palo.")
    if "bodyLocalDirection(root,-side,0,0,1)" not in index_html:
        fail("La palma no utiliza el eje medial del personaje para orientarse hacia el muslo.")
    if "if(walking&&realPlayerCurrentGroup&&realPlayerCurrentGroup.isPlaying)return;" in index_html:
        fail("El gait procedural sigue saltándose los huesos no animados por el clip Walk/Run.")
    if "palmFrame.palmCenter.clone()" not in index_html:
        fail("El palo no tiene el desplazamiento frontal de visibilidad en la palma.")
    if "RealCastawayStickGrip',club,[0,.20,.025]" not in index_html:
        fail("La empuñadura del palo no está centrada en la palma.")
    if "modelForward.clone().add(new B.Vector3(0,.24,0)).normalize()" not in index_html:
        fail("El palo no está orientado hacia delante con inclinación descendente.")
    if "palmFrame.normal.scale(.018)" not in index_html or "armDown.normalize().scale(-1)" not in index_html:
        fail("El anclaje del palo no sigue el eje muñeca-palma.")
    if "side*(.045+breathSway*.022),-.938,-(.205+breathSway*.065)" not in index_html:
        fail("El antebrazo del palo no conserva la flexión suave prevista.")
    if "function getRealPalmFrame(side)" not in index_html or "function alignPalmTowardTorso" not in index_html:
        fail("Falta el marco anatómico compartido de ambas palmas.")
    if "realLeftGripBones=findRightGripBones(asset,'left')" not in index_html or "realRightGripBones=findRightGripBones(asset,'right')" not in index_html:
        fail("Faltan los puntos de referencia independientes de ambas manos.")
    palm_pose = index_html.split("function alignPalmTowardTorso", 1)[1].split("function relaxHumanoidArm", 1)[0]
    if "hand.rotate(axis,twist,B.Space.WORLD)" not in palm_pose or "lower.rotate(axis,twist,B.Space.WORLD)" in palm_pose:
        fail("La corrección de giro de palma debe actuar sobre la muñeca, no retorcer el antebrazo.")
    finger_pose = index_html.split("function applyFingerCurlProfile", 1)[1].split("function applyRealPlayerClubGripPose", 1)[0]
    if "const hingeAxis=frame.width.clone()" not in finger_pose or "B.Vector3.Cross(hingeAxis,fingerDirection)" not in finger_pose:
        fail("La flexión de falanges no está calculada con el eje real de la palma.")
    if "node.rotate(hingeAxis,angle*sign,B.Space.WORLD)" not in finger_pose:
        fail("Las falanges no aplican la flexión geométrica con signo anatómico.")
    if "frame.normal.clone()" not in finger_pose or "frame.indexBase.subtract(node.getAbsolutePosition())" not in finger_pose:
        fail("La flexión no distingue el cierre de los dedos de la oposición del pulgar.")
    if "palmFrame.palmCenter.clone()" not in index_html or "gripWorld.addInPlace(modelForward.scale(.075))" in index_html:
        fail("El palo no está centrado en la palma real del vikingo.")
    if "function applyFingerCurlProfile" not in index_html or "([0-9]+)$" not in index_html:
        fail("Falta la flexión progresiva de los segmentos de los dedos.")
    if "applyFingerCurlProfile(realLeftGripBones,-1,false)" not in index_html or "applyFingerCurlProfile(realRightGripBones,1,gripping)" not in index_html:
        fail("La pose de dedos no se aplica a ambas manos.")
    if "realRightGripBones.concat(realLeftGripBones)" not in index_html:
        fail("Los huesos de la mano izquierda no se restauran desde el bind pose.")
    if "const leftArmSway=armBreath*.62+armWeight*.22+armCounter*.10" not in index_html or "const rightArmSway=Math.sin(elapsed*1.16+.42)*.48-armWeight*.16-armCounter*.08" not in index_html:
        fail("Falta el balanceo asimétrico y sutil de los brazos.")
    if "const armBreath=Math.sin(elapsed*1.16)" not in index_html:
        fail("Falta el movimiento respiratorio sutil de los brazos en reposo.")

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