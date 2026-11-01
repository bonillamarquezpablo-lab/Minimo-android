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

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
USER_AGENT = "EL-SIN-NOMBRE-WebBuild/0.6.75 (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"
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
    "assets/environmentSpecular.env": (
        "https://assets.babylonjs.com/environments/environmentSpecular.env", 100_000, "binary"
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
            if kind == "glb":
                with destination.open("rb") as f:
                    if f.read(4) != b"glTF":
                        raise RuntimeError(f"Invalid GLB header: {url}")
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
                json_length = int.from_bytes(raw[12:16], "little")
                if raw[16:20] != b"JSON" or 20 + json_length > len(raw):
                    raise RuntimeError(f"Invalid optimized JSON chunk: {relative}")
                doc = json.loads(raw[20:20 + json_length].decode("utf-8").rstrip("\x00 "))
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
        "async function resolveVikingAssetUrls(){\n  const urls=[VIKING_GLB_URL];",
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
    ]
    for item in required:
        if item not in html:
            raise SystemExit(f"El HTML no apunta al recurso local requerido: {item}")

    (DIST / "index.html").write_text(html, encoding="utf-8")
    for name in ("sw.js", "manifest.webmanifest", "icon.svg", "ASSET-LICENSES.md"):
        source = ROOT / name
        if not source.exists():
            raise SystemExit(f"Falta el archivo de despliegue: {name}")
        shutil.copy2(source, DIST / name)

    results = []
    failures = []
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

    meshopt_compress_models(results)
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
        "version": "0.6.75",
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

if __name__ == "__main__":
    main()
