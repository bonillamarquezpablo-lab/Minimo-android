#!/usr/bin/env python3
"""Build an autonomous same-origin GitHub Pages package for EL SIN NOMBRE."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
USER_AGENT = "EL-SIN-NOMBRE-WebBuild/0.6.269 (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"
TIMEOUT = 90

# Public redistributable dependencies: Babylon.js (Apache-2.0), models/audio (CC0).
DOWNLOADS = {
    "assets/vendor/babylon.js": (
        "https://cdn.babylonjs.com/v7.54.3/babylon.js", 500_000, "script"
    ),
    "assets/vendor/babylonjs.loaders.min.js": (
        "https://cdn.babylonjs.com/v7.54.3/loaders/babylonjs.loaders.min.js", 20_000, "script"
    ),
    "assets/vendor/meshopt_decoder.js": (
        "https://cdn.babylonjs.com/meshopt_decoder.js", 2_000, "script"
    ),
    "assets/models/viking-rigged.glb": (
        "https://grab3d.com/dl/viking-rigged/viking-rigged.glb", 1_000_000, "glb"
    ),
    "assets/models/armored-knight-rigged.glb": (
        "https://grab3d.com/dl/armored-knight-rigged/armored-knight-rigged.glb", 1_000_000, "glb"
    ),
    "assets/models/man-base-character-rigged.glb": (
        "https://grab3d.com/dl/man-base-character-rigged/man-base-character-rigged.glb", 1_000_000, "glb"
    ),
    "assets/downloads/Ground060_2K-JPG.zip": (
        "https://ambientcg.com/get?file=Ground060_2K-JPG.zip", 1_000_000, "zip"
    ),
    "assets/models/Seagull.glb": (
        "https://gobkit.com/freebies/animal007/Seagull.glb", 50_000, "glb"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/leaves01.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/leaves01.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/leaves02.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/leaves02.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/mud02.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/mud02.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/gravel.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/gravel.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/stone01.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/stone01.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/wood01.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/wood01.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/wood02.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/wood02.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-footsteps/wood03.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-footsteps/wood03.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-battle/battle_sound_effects/swish_2.wav": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-battle/battle_sound_effects/swish_2.wav", 5_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-battle/battle_sound_effects/swish_3.wav": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-battle/battle_sound_effects/swish_3.wav", 5_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/oga-battle/battle_sound_effects/swish_4.wav": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-battle/battle_sound_effects/swish_4.wav", 5_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/impact-sounds/impactMetal_medium_000.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactMetal_medium_000.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/impact-sounds/impactMetal_medium_003.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactMetal_medium_003.ogg", 2_000, "audio"
    ),
    "assets/audio/cc0-game-sfx/impact-sounds/impactMetal_heavy_001.ogg": (
        "https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactMetal_heavy_001.ogg", 2_000, "audio"
    ),
    "assets/audio/kenney-rpg-audio/chop.ogg": (
        "https://raw.githubusercontent.com/rowink/CC0-Sounds-Web/main/public/sounds/kenney_rpgaudio/Audio/chop.ogg", 2_000, "audio"
    ),
}

def read_glb_document(path: Path) -> dict:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise RuntimeError(f"Invalid GLB header: {path.name}")
    version = int.from_bytes(raw[4:8], "little")
    declared_length = int.from_bytes(raw[8:12], "little")
    if version != 2 or declared_length != len(raw):
        raise RuntimeError(
            f"Invalid GLB v2 length for {path.name}: version={version}, "
            f"declared={declared_length}, actual={len(raw)}"
        )
    offset = 12
    document = None
    while offset + 8 <= len(raw):
        chunk_length = int.from_bytes(raw[offset:offset + 4], "little")
        chunk_type = raw[offset + 4:offset + 8]
        offset += 8
        end = offset + chunk_length
        if end > len(raw):
            raise RuntimeError(f"Truncated GLB chunk in {path.name}")
        if chunk_type == b"JSON":
            document = json.loads(raw[offset:end].decode("utf-8").rstrip("\x00 "))
            break
        offset = end
    if not isinstance(document, dict) or not isinstance(document.get("asset"), dict):
        raise RuntimeError(f"Missing glTF JSON document in {path.name}")
    return document


def validate_rigged_character_glb(path: Path, label: str) -> dict:
    document = read_glb_document(path)
    meshes = document.get("meshes") or []
    skins = document.get("skins") or []
    animations = document.get("animations") or []
    materials = document.get("materials") or []
    textures = document.get("textures") or []
    images = document.get("images") or []
    max_joints = max((len(skin.get("joints") or []) for skin in skins), default=0)
    if not meshes or not skins or len(animations) < 2:
        raise RuntimeError(
            f"{label}: rigged character must contain meshes, skins, and walk/run animation clips "
            f"(meshes={len(meshes)}, skins={len(skins)}, animations={len(animations)})"
        )
    if max_joints < 16:
        raise RuntimeError(f"{label}: humanoid rig is incomplete ({max_joints} joints; expected >=16)")
    if not materials or not textures or not images:
        raise RuntimeError(
            f"{label}: original PBR appearance data is incomplete "
            f"(materials={len(materials)}, textures={len(textures)}, images={len(images)})"
        )
    if any(not (mesh.get("primitives") or []) for mesh in meshes):
        raise RuntimeError(f"{label}: one or more GLB meshes have no primitives")
    return document

def fetch(url: str, destination: Path, minimum: int, kind: str) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    last_error = None
    for attempt in range(1, 5):
        try:
            req = Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "*/*",
            })
            with urlopen(req, timeout=TIMEOUT) as response, destination.open("wb") as out:
                status = getattr(response, "status", 200)
                if status != 200:
                    raise RuntimeError(f"HTTP {status} for {url}")
                digest = hashlib.sha256()
                size = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            if size < minimum:
                raise RuntimeError(f"File too small ({size} bytes): {url}")
            relative = destination.relative_to(DIST).as_posix()
            if kind == "glb":
                if destination.name in {
                    "viking-rigged.glb",
                    "armored-knight-rigged.glb",
                    "man-base-character-rigged.glb",
                }:
                    document = validate_rigged_character_glb(destination, relative)
                    print(
                        f"OK rigged GLB {relative}: "
                        f"{len(document.get('meshes') or [])} meshes, "
                        f"{max((len(s.get('joints') or []) for s in (document.get('skins') or [])), default=0)} joints, "
                        f"{len(document.get('animations') or [])} clips, "
                        f"{len(document.get('images') or [])} texture images."
                    )
                else:
                    read_glb_document(destination)
            return {
                "path": destination.relative_to(DIST).as_posix(),
                "bytes": size,
                "sha256": digest.hexdigest(),
                "source": url,
            }
        except Exception as exc:
            last_error = exc
            destination.unlink(missing_ok=True)
            if attempt < 4:
                time.sleep(attempt * 2)
    raise RuntimeError(f"Could not download {url}: {last_error}") from last_error

MESHOPT_MODELS = (
    "assets/models/viking-rigged.glb",
    "assets/models/armored-knight-rigged.glb",
    "assets/models/man-base-character-rigged.glb",
)


def meshopt_compress_models(results: list[dict]) -> None:
    """Compress geometry/animation streams; preserve original textures and material data."""
    npm = shutil.which("npm")
    if not npm:
        print("WARN Meshopt omitted: npm is not available; original GLBs remain untouched.")
        return

    try:
        with tempfile.TemporaryDirectory(prefix="norse-meshopt-") as tool_dir:
            install = subprocess.run(
                [
                    npm, "install", "--prefix", tool_dir, "--no-save", "--no-package-lock",
                    "--no-audit", "--no-fund", "@gltf-transform/cli@4.5.1",
                ],
                capture_output=True, text=True, timeout=300,
            )
            if install.returncode != 0:
                raise RuntimeError((install.stderr or install.stdout)[-4000:])
            cli = Path(tool_dir) / "node_modules" / ".bin" / "gltf-transform"
            if not cli.exists():
                raise RuntimeError("gltf-transform executable was not installed.")

            # Process every model to temporary output before replacing any source file.
            outputs = []
            for relative in MESHOPT_MODELS:
                source = DIST / relative
                if not source.exists():
                    raise RuntimeError(f"Missing model: {relative}")
                temp_output = Path(tool_dir) / (Path(relative).stem + ".meshopt.glb")
                command = [
                    str(cli), "meshopt", str(source), str(temp_output),
                    "--level", "high",
                    "--quantize-position", "16", "--quantize-normal", "16",
                    "--quantize-texcoord", "16", "--quantize-color", "16",
                    "--quantize-weight", "16",
                ]
                result = subprocess.run(command, capture_output=True, text=True, timeout=240)
                if result.returncode != 0 or not temp_output.exists():
                    raise RuntimeError(
                        f"Meshopt failed for {relative}: {(result.stderr or result.stdout)[-3000:]}"
                    )
                raw = temp_output.read_bytes()
                if len(raw) < 20 or raw[:4] != b"glTF":
                    raise RuntimeError(f"Invalid optimized GLB: {relative}")
                doc = validate_rigged_character_glb(temp_output, relative)
                if "EXT_meshopt_compression" not in set(doc.get("extensionsUsed", [])):
                    raise RuntimeError(f"EXT_meshopt_compression missing: {relative}")
                outputs.append((relative, source, temp_output, len(raw)))

            by_path = {item["path"]: item for item in results}
            for relative, source, output, optimized_size in outputs:
                original_size = source.stat().st_size
                if optimized_size >= original_size:
                    print(f"WARN Meshopt did not reduce {relative}; original retained.")
                    continue
                raw = output.read_bytes()
                shutil.copy2(output, source)
                item = by_path[relative]
                item["bytes"] = optimized_size
                item["sha256"] = hashlib.sha256(raw).hexdigest()
                item["compression"] = "EXT_meshopt_compression"
                item["originalBytes"] = original_size
                print(
                    f"OK Meshopt {relative}: {original_size:,} → {optimized_size:,} bytes "
                    f"({(original_size-optimized_size)/1048576:.2f} MiB saved; textures untouched)"
                )
    except Exception as exc:
        print(f"WARN Meshopt skipped; original models retained: {exc}", file=sys.stderr)


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    source_html = ROOT / "index.html"
    if not source_html.exists():
        raise SystemExit("Falta index.html en el repositorio.")
    html = source_html.read_text(encoding="utf-8")
    version_match = re.search(
        r'<meta\s+name=["\']el-sin-nombre-build["\']\s+content=["\']([^"\']+)["\']',
        html,
        flags=re.IGNORECASE,
    )
    if not version_match:
        raise SystemExit("index.html no declara el número de versión el-sin-nombre-build.")
    game_version = version_match.group(1).strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", game_version):
        raise SystemExit(f"Versión del juego no válida en index.html: {game_version!r}")
    global USER_AGENT
    USER_AGENT = (
        f"EL-SIN-NOMBRE-WebBuild/{game_version} "
        "(+https://github.com/bonillamarquezpablo-lab/Minimo-android)"
    )
    print(f"Preparando EL SIN NOMBRE {game_version}.")

    # Fail the deployment if an inline JavaScript edit is syntactically invalid.
    # The GitHub-hosted runner provides Node.js; this catches startup regressions
    # before the new web build replaces the previous playable release.
    script_blocks = re.findall(r"<script\b[^>]*>(.*?)</script\s*>", html, flags=re.IGNORECASE | re.DOTALL)
    inline_scripts = [block for block in script_blocks if block.strip()]
    if not inline_scripts:
        raise SystemExit("No inline JavaScript blocks were found to validate.")
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required to validate the inline game JavaScript.")
    with tempfile.TemporaryDirectory(prefix="norse-js-check-") as temp_dir:
        check_file = Path(temp_dir) / "game-inline.js"
        check_file.write_text("\n".join(inline_scripts), encoding="utf-8")
        check = subprocess.run([node, "--check", str(check_file)], capture_output=True, text=True)
        if check.returncode != 0:
            raise SystemExit("JavaScript syntax validation failed:\n" + check.stderr)
    print(f"JavaScript syntax validation passed ({len(inline_scripts)} inline script block(s)).")

    # The packaged build always prefers the same-origin, bundled files.
    html = html.replace(
        "async function resolveVikingAssetUrls(){\n  if(isPerformanceMode)return [VIKING_GLB_URL];\n  const urls=[VIKING_GLB_URL];",
        "async function resolveVikingAssetUrls(){\n  return [VIKING_GLB_URL];\n  const urls=[VIKING_GLB_URL];"
    )
    html = html.replace(
        " async function resolveCivilianHumanAssetUrls(){\n  const urls=[CIVILIAN_HUMAN_GLB_URL];",
        " async function resolveCivilianHumanAssetUrls(){\n  return [CIVILIAN_HUMAN_GLB_URL];\n  const urls=[CIVILIAN_HUMAN_GLB_URL];"
    )
    required = [
        "assets/vendor/babylon.js",
        "assets/vendor/meshopt_decoder.js",
        "BABYLON.MeshoptCompression.Configuration",
        "assets/models/viking-rigged.glb",
        "assets/models/armored-knight-rigged.glb",
        "assets/models/man-base-character-rigged.glb",
        "const OGA_FOLEY_BASE='./assets/audio/cc0-game-sfx/';",
        "navigator.serviceWorker.register",
        "./scripts/nordic/beach-state.js",
        "./scripts/nordic/coastal-interaction.js",
        "window.NorseBeachState",
    ]
    for item in required:
        if item not in html:
            raise SystemExit(f"El HTML no apunta al recurso local requerido: {item}")


    # The coastal-state runtime is shared by main and generated guest entry pages.
    beach_state_source = ROOT / "scripts" / "nordic" / "beach-state.js"
    if not beach_state_source.is_file():
        raise SystemExit("Falta scripts/nordic/beach-state.js.")
    beach_state_target = DIST / "scripts" / "nordic" / "beach-state.js"
    beach_state_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(beach_state_source, beach_state_target)

    coastal_source = ROOT / "scripts" / "nordic" / "coastal-interaction.js"
    if not coastal_source.is_file():
        raise SystemExit("Falta scripts/nordic/coastal-interaction.js.")
    coastal_target = DIST / "scripts" / "nordic" / "coastal-interaction.js"
    shutil.copy2(coastal_source, coastal_target)

    (DIST / "index.html").write_text(html, encoding="utf-8")

    # Root-level invite entry. The guest mode is compiled as a constant, so
    # redirects, query stripping, PWA launch parameters and path parsing cannot
    # accidentally select the main campaign.
    guest_file_html = html.replace("<head>", '<head>\n<meta name="el-sin-nombre-guest-entry" content="true">', 1)
    guest_file_html = guest_file_html.replace(
        '<link rel="manifest" href="./manifest.webmanifest">',
        '<link rel="manifest" href="./guest-file-manifest.webmanifest">',
        1,
    )
    guest_file_html, guest_file_mode_replacements = re.subn(
        r"const SHARE_NEW_GAME=.*?;",
        "const SHARE_NEW_GAME=true;",
        guest_file_html,
        count=1,
    )
    if guest_file_mode_replacements != 1 or "const SHARE_NEW_GAME=true;" not in guest_file_html:
        raise SystemExit("La página guest.html no fija el modo invitado.")
    if "el-sin-nombre-campaign-guest-v8" not in guest_file_html:
        raise SystemExit("La página guest.html no usa el guardado guest-v8.")
    (DIST / "guest.html").write_text(guest_file_html, encoding="utf-8")

    # Dedicated invite route: the pathname survives PWA launch flows that may
    # discard query parameters from a shared URL.
    guest_dir = DIST / "guest"
    guest_dir.mkdir(parents=True, exist_ok=True)
    guest_html = html.replace("<head>", '<head>\n<base href="../">\n<meta name="el-sin-nombre-guest-entry" content="true">', 1)
    guest_html = guest_html.replace(
        '<link rel="manifest" href="./manifest.webmanifest">',
        '<link rel="manifest" href="./guest-manifest.webmanifest">',
        1,
    )
    guest_html, guest_mode_replacements = re.subn(
        r"const SHARE_NEW_GAME=.*?;",
        "const SHARE_NEW_GAME=true;",
        guest_html,
        count=1,
    )
    if guest_mode_replacements != 1 or "const SHARE_NEW_GAME=true;" not in guest_html:
        raise SystemExit("La ruta /guest/ no fija el modo invitado en tiempo de compilación.")
    if 'name="el-sin-nombre-guest-entry" content="true"' not in guest_html:
        raise SystemExit("La ruta de invitado no lleva la marca de partida independiente.")
    if 'href="./guest-manifest.webmanifest"' not in guest_html:
        raise SystemExit("La ruta de invitado no apunta a su manifiesto PWA independiente.")
    if "el-sin-nombre-campaign-guest-v8" not in guest_html:
        raise SystemExit("La ruta /guest/ no usa el guardado nuevo de invitados.")
    (guest_dir / "index.html").write_text(guest_html, encoding="utf-8")

    # Canonical invite URL with its own PWA scope and a new, empty guest save slot.
    invite_dir = DIST / "invitado"
    invite_dir.mkdir(parents=True, exist_ok=True)
    invite_html = html.replace("<head>", '<head>\n<base href="../">\n<meta name="el-sin-nombre-guest-entry" content="true">', 1)
    invite_html = invite_html.replace(
        '<link rel="manifest" href="./manifest.webmanifest">',
        '<link rel="manifest" href="./invitado-manifest.webmanifest">',
        1,
    )
    invite_html, invite_mode_replacements = re.subn(
        r"const SHARE_NEW_GAME=.*?;",
        "const SHARE_NEW_GAME=true;",
        invite_html,
        count=1,
    )
    if invite_mode_replacements != 1 or "const SHARE_NEW_GAME=true;" not in invite_html:
        raise SystemExit("La ruta /invitado/ no fija el modo invitado en tiempo de compilación.")
    if 'name="el-sin-nombre-guest-entry" content="true"' not in invite_html:
        raise SystemExit("La ruta /invitado/ no lleva la marca de partida independiente.")
    if 'href="./invitado-manifest.webmanifest"' not in invite_html:
        raise SystemExit("La ruta /invitado/ no apunta a su manifiesto PWA independiente.")
    if "el-sin-nombre-campaign-guest-v8" not in invite_html:
        raise SystemExit("La ruta /invitado/ no usa el nuevo guardado de invitados.")
    (invite_dir / "index.html").write_text(invite_html, encoding="utf-8")

    # Both soundtrack tracks can be supplied either in their final paths or as one ZIP
    # uploaded to the repository root. Read ZIP members directly; do not extract arbitrary paths.
    optional_music_assets = [
        "assets/audio/menu/winter_s_final_toll.mp3",
        "assets/audio/gameplay/the_weight_of_empire.mp3",
    ]
    optional_music_results = []
    music_zip = ROOT / "el-sin-nombre-bandas-sonoras.zip"
    music_archive = None
    if music_zip.is_file():
        try:
            with zipfile.ZipFile(music_zip, "r") as archive:
                names = set(archive.namelist())
                missing = [relative for relative in optional_music_assets if relative not in names]
                if missing:
                    raise SystemExit("El ZIP de bandas sonoras no contiene: " + ", ".join(missing))
                for relative in optional_music_assets:
                    raw_audio = archive.read(relative)
                    if len(raw_audio) < 100_000 or not (raw_audio.startswith(b"ID3") or (raw_audio[0] == 0xFF and (raw_audio[1] & 0xE0) == 0xE0)):
                        raise SystemExit(f"Archivo MP3 no válido o demasiado pequeño en el ZIP: {relative}")
                    target = DIST / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(raw_audio)
                    optional_music_results.append({
                        "path": relative,
                        "bytes": len(raw_audio),
                        "sha256": hashlib.sha256(raw_audio).hexdigest(),
                        "kind": "audio",
                    })
                music_archive = "zip"
        except zipfile.BadZipFile as exc:
            raise SystemExit(f"El paquete de bandas sonoras no es un ZIP válido: {exc}")
    for relative in optional_music_assets:
        if music_archive == "zip":
            break
        source = ROOT / relative
        if not source.is_file():
            print(f"WARN Optional soundtrack not present yet: {relative}")
            continue
        target = DIST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        raw_audio = target.read_bytes()
        if len(raw_audio) < 100_000 or not (
            raw_audio.startswith(b"ID3") or (raw_audio[0] == 0xFF and (raw_audio[1] & 0xE0) == 0xE0)
        ):
            raise SystemExit(f"Archivo MP3 no válido o demasiado pequeño: {relative}")
        optional_music_results.append({
            "path": relative,
            "bytes": len(raw_audio),
            "sha256": hashlib.sha256(raw_audio).hexdigest(),
            "kind": "audio",
        })

    missing_music = [relative for relative in optional_music_assets if not (DIST / relative).is_file()]
    if missing_music:
        raise SystemExit(
            "No se publica una versión sin las dos bandas sonoras requeridas: "
            + ", ".join(missing_music)
        )

    for name in ("sw.js", "manifest.webmanifest", "guest-manifest.webmanifest", "invitado-manifest.webmanifest", "guest-file-manifest.webmanifest", "icon.svg", "ASSET-LICENSES.md"):
        source = ROOT / name
        if not source.exists():
            raise SystemExit(f"Falta el archivo de despliegue: {name}")
        shutil.copy2(source, DIST / name)

    # Every generated PWA entry must point at this exact code version.
    guest_start_urls = {
        "guest-manifest.webmanifest": f"./guest/index.html?newgame=1&v={game_version}",
        "invitado-manifest.webmanifest": f"./invitado/index.html?newgame=1&v={game_version}",
        "guest-file-manifest.webmanifest": f"./guest.html?v={game_version}",
    }
    for manifest_name, start_url in guest_start_urls.items():
        manifest_path = DIST / manifest_name
        manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_data["start_url"] = start_url
        manifest_path.write_text(
            json.dumps(manifest_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    results = []
    failures = []

    # Project-owned Nordic IBL: copy the supplied binary instead of downloading Babylon's generic environment.
    local_environment = ROOT / "scripts" / "nordic" / "environmentSpecular.env"
    if not local_environment.is_file():
        raise SystemExit(f"Falta el entorno nórdico local: {local_environment.relative_to(ROOT)}")
    local_size = local_environment.stat().st_size
    if local_size != 131395:
        raise SystemExit(
            f"Tamaño inesperado para environmentSpecular.env: {local_size:,} bytes; "
            "se esperaban exactamente 131,395 bytes."
        )
    environment_target = DIST / "assets" / "environmentSpecular.env"
    environment_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_environment, environment_target)
    environment_bytes = environment_target.read_bytes()
    results.append({
        "path": "assets/environmentSpecular.env",
        "bytes": len(environment_bytes),
        "sha256": hashlib.sha256(environment_bytes).hexdigest(),
        "source": "project-generated: scripts/nordic/environmentSpecular.env",
    })
    print(f"OK assets/environmentSpecular.env: {len(environment_bytes):,} bytes (entorno nórdico local)")

    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {
            pool.submit(fetch, url, DIST / relative, minimum, kind): relative
            for relative, (url, minimum, kind) in DOWNLOADS.items()
        }
        for job in as_completed(jobs):
            relative = jobs[job]
            try:
                result = job.result()
                results.append(result)
                print(f"OK {relative}: {result['bytes']:,} bytes")
            except Exception as exc:
                failures.append((relative, str(exc)))
                print(f"ERROR {relative}: {exc}", file=sys.stderr)

    if failures:
        print("\nNo se publica una versión incompleta:", file=sys.stderr)
        for relative, reason in failures:
            print(f"- {relative}: {reason}", file=sys.stderr)
        raise SystemExit(1)

    # Extract only the three PBR maps actually used by the beach; never ship the ZIP.
    texture_archive_relative = "assets/downloads/Ground060_2K-JPG.zip"
    texture_archive = DIST / texture_archive_relative
    try:
        with zipfile.ZipFile(texture_archive) as archive:
            wanted = {
                "Ground060_2K-JPG_Color.jpg": "assets/textures/sand-color.jpg",
                "Ground060_2K-JPG_NormalGL.jpg": "assets/textures/sand-normal-gl.jpg",
                "Ground060_2K-JPG_Roughness.jpg": "assets/textures/sand-roughness.jpg",
            }
            members = {Path(info.filename).name: info for info in archive.infolist() if not info.is_dir()}
            for source_name, output_name in wanted.items():
                info = members.get(source_name)
                if info is None:
                    raise RuntimeError(f"ambientCG ZIP is missing {source_name}")
                raw = archive.read(info)
                if len(raw) < 20_000 or not raw.startswith(b"\xff\xd8"):
                    raise RuntimeError(f"Invalid JPEG PBR texture: {source_name}")
                target = DIST / output_name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                results.append({
                    "path": output_name,
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "source": "https://ambientcg.com/view?id=Ground060 (Ground060_2K-JPG)",
                })
                print(f"OK {output_name}: {len(raw):,} bytes (ambientCG Ground 060, CC0 1.0)")
        texture_archive.unlink(missing_ok=True)
        results[:] = [item for item in results if item["path"] != texture_archive_relative]
    except Exception as exc:
        failures.append((texture_archive_relative, f"Could not extract CC0 sand PBR maps: {exc}"))

    if failures:
        print("\nNo se publica una versión incompleta:", file=sys.stderr)
        for relative, reason in failures:
            print(f"- {relative}: {reason}", file=sys.stderr)
        raise SystemExit(1)

    for music_asset in optional_music_results:
        results.append(music_asset)
        print(f"OK {music_asset['path']}: {music_asset['bytes']:,} bytes (banda sonora)")


    # Meshopt desactivado en esta candidata: conservar los GLB originales sin transformar.
    results.sort(key=lambda item: item["path"])

    # Keep large model/audio caches across code-only releases. The asset cache
    # changes only when the actual packaged resource bytes change, so a new
    # game version does not force every phone to download ~20 MB again.
    asset_fingerprint = hashlib.sha256(
        json.dumps(
            [(item["path"], item["sha256"]) for item in results],
            separators=(",", ":"), ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()[:16]
    sw_path = DIST / "sw.js"
    sw_source = sw_path.read_text(encoding="utf-8")
    shell_match = re.search(r'const SHELL_CACHE = "el-sin-nombre-shell-([^"]+)";', sw_source)
    if not shell_match or shell_match.group(1) != game_version:
        actual = shell_match.group(1) if shell_match else "no declarada"
        raise SystemExit(
            f"Versión de caché del service worker desincronizada: "
            f"index.html={game_version}, sw.js={actual}"
        )
    sw_source, replacements = re.subn(
        r'const ASSET_CACHE = "[^"]+";',
        f'const ASSET_CACHE = "el-sin-nombre-assets-{asset_fingerprint}";',
        sw_source,
        count=1,
    )
    if replacements != 1:
        raise SystemExit("No se pudo fijar la versión estable de caché de recursos.")
    sw_path.write_text(sw_source, encoding="utf-8")
    print(f"Asset cache fingerprint: {asset_fingerprint} (los recursos idénticos se conservan entre versiones).")

    manifest = {
        "game": "EL SIN NOMBRE",
        "version": game_version,
        "builtFrom": "bonillamarquezpablo-lab/Minimo-android",
        "assets": results,
    }
    (DIST / "assets").mkdir(parents=True, exist_ok=True)
    (DIST / "assets" / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    total = sum(item["bytes"] for item in results)
    print(f"\nBuild completo: {len(results)} recursos, {total:,} bytes.")
    print("Todas las mallas GLB se verificaron por su cabecera glTF.")
    print("El sitio se publica solo si se descargaron y validaron todos los recursos.")
    
    # Final gate: validate every generated entry point, manifest, asset hash and runtime script.
    validator = ROOT / "scripts" / "validate_release.py"
    validation = subprocess.run([sys.executable, str(validator)], cwd=ROOT)
    if validation.returncode != 0:
        raise SystemExit(validation.returncode)

if __name__ == "__main__":
    main()
