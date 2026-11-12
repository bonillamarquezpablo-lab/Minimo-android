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
USER_AGENT = "EL-SIN-NOMBRE-WebBuild/0.6.274 (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"
BABYLON_VERSION = "8.2.2"
TIMEOUT = 90

# Public redistributable dependencies: Babylon.js (Apache-2.0), models/audio (CC0).
DOWNLOADS = {
    "assets/vendor/babylon.js": (
        f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/babylon.js", 500_000, "script"
    ),
    "assets/vendor/babylonjs.loaders.min.js": (
        f"https://cdn.babylonjs.com/v{BABYLON_VERSION}/loaders/babylonjs.loaders.min.js", 20_000, "script"
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
    navigation_check = subprocess.run(
        [node, "--check", str(ROOT / "scripts" / "nordic" / "navigation-suite.js")],
        capture_output=True, text=True,
    )
    if navigation_check.returncode != 0:
        raise SystemExit("Navigation runtime JavaScript syntax validation failed:\\n" + navigation_check.stderr)
    print("Navigation runtime JavaScript syntax validation passed.")
    # Anchor decorative terrain objects to the actual rendered GroundMesh. The
    # analytical heightfield can differ from the rendered triangle interpolation,
    # leaving rocks, tree trunks and shrubs visibly detached from the island.
    ground_anchor_replacements = (
        (
            "function createRock(x,z){\n  const gy=terrainSurfaceAt(x,z),sx=",
            "function createRock(x,z){\n  const gy=renderedTerrainSurfaceAt(x,z),sx=",
            "rock",
        ),
        (
            "mergeStaticDecorByMaterial(canopy,'NorseTreeCanopy');\n  root.position=v(x,terrainSurfaceAt(x,z),z);",
            "mergeStaticDecorByMaterial(canopy,'NorseTreeCanopy');\n  root.position=v(x,renderedTerrainSurfaceAt(x,z),z);",
            "tree",
        ),
        (
            "const groundY=terrainHeightOnIsland(island,x,z),normal=terrainNormalAt(x,z,.42);\n  const root=newGroup('NaturalBroadleafShrub',null)",
            "const groundY=renderedTerrainSurfaceAt(x,z),normal=terrainNormalAt(x,z,.42);\n  const root=newGroup('NaturalBroadleafShrub',null)",
            "shrub",
        ),
    )
    for detached_anchor, rendered_anchor, label in ground_anchor_replacements:
        if html.count(detached_anchor) != 1:
            raise SystemExit(f"No se encontró exactamente un anclaje de terreno para {label}.")
        html = html.replace(detached_anchor, rendered_anchor, 1)

    # Bedrolls are mats placed flat on the ground: rotate them around the vertical Y axis,
    # not around Z (which tilted one edge into the soil by more than 7 cm).
    bedroll_rotation_marker = "box('OutpostBedroll_'+vl.index+'_'+tent,camp,[ox,.13,oz+.85],[.72,.16,.95],M.fur,[0,0,rot]);"
    bedroll_rotation_code = "box('OutpostBedroll_'+vl.index+'_'+tent,camp,[ox,.13,oz+.85],[.72,.16,.95],M.fur,[0,rot,0]);"
    if html.count(bedroll_rotation_marker) != 1:
        raise SystemExit("No se encontró exactamente la orientación original de los catres del puesto avanzado.")
    html = html.replace(bedroll_rotation_marker, bedroll_rotation_code, 1)
    bedroll_grounding_marker = "for(const bedroll of camp.__groundingBedrolls||[])placeBoxBase(bedroll,.08);"
    bedroll_grounding_code = """const bedrollLowerLocalCorners=mesh=>{
    const corners=mesh.getBoundingInfo?.()?.boundingBox?.vectors;
    if(!Array.isArray(corners)||corners.length!==8)throw new Error('Outpost bedroll has no complete local bounds: '+mesh.name);
    const lowerY=Math.min(...corners.map(point=>point.y));
    return corners.filter(point=>point.y<=lowerY+1e-5);
   };
   const bedrollWorldLowerCorners=mesh=>{
    mesh.computeWorldMatrix(true);
    return bedrollLowerLocalCorners(mesh).map(point=>BABYLON.Vector3.TransformCoordinates(point,mesh.getWorldMatrix()));
   };
   const fitBedrollGroundPlane=samples=>{
    const count=samples.length,cx=samples.reduce((sum,p)=>sum+p.x,0)/count,cz=samples.reduce((sum,p)=>sum+p.z,0)/count;
    const local=samples.map(p=>({x:p.x-cx,z:p.z-cz,y:p.terrainY}));
    const sx=local.reduce((sum,p)=>sum+p.x,0),sz=local.reduce((sum,p)=>sum+p.z,0);
    const sxx=local.reduce((sum,p)=>sum+p.x*p.x,0),szz=local.reduce((sum,p)=>sum+p.z*p.z,0),sxz=local.reduce((sum,p)=>sum+p.x*p.z,0);
    const sxy=local.reduce((sum,p)=>sum+p.x*p.y,0),szy=local.reduce((sum,p)=>sum+p.z*p.y,0),sy=local.reduce((sum,p)=>sum+p.y,0);
    const matrix=[[sxx,sxz,sx,sxy],[sxz,szz,sz,szy],[sx,sz,count,sy]];
    for(let column=0;column<3;column++){
     let pivot=column;for(let row=column+1;row<3;row++)if(Math.abs(matrix[row][column])>Math.abs(matrix[pivot][column]))pivot=row;
     if(Math.abs(matrix[pivot][column])<1e-10)throw new Error('Outpost bedroll terrain plane is singular.');
     [matrix[column],matrix[pivot]]=[matrix[pivot],matrix[column]];
     const divisor=matrix[column][column];for(let k=column;k<4;k++)matrix[column][k]/=divisor;
     for(let row=0;row<3;row++)if(row!==column){const factor=matrix[row][column];for(let k=column;k<4;k++)matrix[row][k]-=factor*matrix[column][k];}
    }
    return {slopeX:matrix[0][3],slopeZ:matrix[1][3]};
   };
   const alignBedrollToRenderedGround=mesh=>{
    placeBoxBase(mesh,.08);
    const initialCorners=bedrollWorldLowerCorners(mesh);
    const initialSamples=initialCorners.map(point=>({x:point.x,z:point.z,terrainY:renderedTerrainSurfaceAt(point.x,point.z)}));
    if(initialSamples.length!==4||initialSamples.some(point=>!Number.isFinite(point.terrainY)))throw new Error('Outpost bedroll must have four valid ground samples: '+mesh.name);
    const slope=fitBedrollGroundPlane(initialSamples);
    const normal=new BABYLON.Vector3(-slope.slopeX,1,-slope.slopeZ).normalize();
    const yaw=Number(mesh.rotation?.y)||0;
    const yawX=new BABYLON.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const tangentX=yawX.subtract(normal.scale(BABYLON.Vector3.Dot(yawX,normal))).normalize();
    const tangentZ=BABYLON.Vector3.Cross(tangentX,normal).normalize();
    if(!Number.isFinite(tangentX.x)||!Number.isFinite(tangentZ.z))throw new Error('Outpost bedroll terrain orientation is invalid: '+mesh.name);
    mesh.rotation.copyFromFloats(0,0,0);
    mesh.rotationQuaternion=BABYLON.Quaternion.RotationQuaternionFromAxis(tangentX,normal,tangentZ);
    mesh.computeWorldMatrix(true);
    const alignedCorners=bedrollWorldLowerCorners(mesh);
    const alignedSamples=alignedCorners.map(point=>({point,terrainY:renderedTerrainSurfaceAt(point.x,point.z)}));
    if(alignedSamples.some(sample=>!Number.isFinite(sample.terrainY)))throw new Error('Outpost bedroll aligned corners have invalid terrain: '+mesh.name);
    const lift=Math.max(...alignedSamples.map(sample=>sample.terrainY-sample.point.y));
    if(!Number.isFinite(lift)||Math.abs(lift)>.30)throw new Error('Outpost bedroll slope correction is outside the safe range: '+mesh.name+' ('+lift+')');
    mesh.position.y+=lift;
    mesh.computeWorldMatrix(true);
    const finalCorners=bedrollWorldLowerCorners(mesh);
    const finalSamples=finalCorners.map(point=>({point,terrainY:renderedTerrainSurfaceAt(point.x,point.z)}));
    const gaps=finalSamples.map(sample=>sample.point.y-sample.terrainY);
    const maximumAbsoluteGap=Math.max(...gaps.map(Math.abs));
    if(finalSamples.some(sample=>!Number.isFinite(sample.terrainY))||maximumAbsoluteGap>.02)
     throw new Error('Outpost bedroll lower-corner contact exceeds 2 cm: '+mesh.name+' ('+maximumAbsoluteGap+')');
    for(const sample of finalSamples)recordContact(mesh.name,sample.point.x,sample.point.z,sample.terrainY);
   };
   for(const bedroll of camp.__groundingBedrolls||[])alignBedrollToRenderedGround(bedroll);""";
    if html.count(bedroll_grounding_marker) != 1:
        raise SystemExit("No se encontró exactamente el asiento horizontal de los catres del puesto avanzado.")
    html = html.replace(bedroll_grounding_marker, bedroll_grounding_code, 1)
    bedroll_support_marker = "camp.__groundingSupportMeshes.push({mesh:bedroll,kind:'box',halfHeight:.08});"
    bedroll_support_code = "camp.__groundingSupportMeshes.push({mesh:bedroll,kind:'oriented-box',halfHeight:.08});"
    if html.count(bedroll_support_marker) != 1:
        raise SystemExit("No se encontró exactamente el registro de apoyo geométrico de los catres.")
    html = html.replace(bedroll_support_marker, bedroll_support_code, 1)
    support_points_marker = """     const supportPoints=(group?.__groundingSupportMeshes||[]).map(entry=>{
      const mesh=entry.mesh;if(!mesh)return null;
      try{mesh.computeWorldMatrix(true);}catch(_){}
      const angle=entry.kind==='tilted-cylinder'?(Number(mesh.rotation?.z)||0):0,halfHeight=Number(entry.halfHeight)||0;
      const localX=mesh.position.x+(entry.kind==='tilted-cylinder'?Math.sin(angle)*halfHeight:0),localY=mesh.position.y-(entry.kind==='tilted-cylinder'?Math.cos(angle)*halfHeight:halfHeight),worldX=p.x+localX,worldZ=p.z+mesh.position.z,baseY=p.y+localY,terrainY=renderedTerrainSurfaceAt(worldX,worldZ);
      return {dx:worldX-p.x,dz:worldZ-p.z,baseY,name:mesh.name,terrainY:Number(terrainY.toFixed(4)),baseGapMeters:Number((baseY-terrainY).toFixed(4)),kind:entry.kind};
     }).filter(Boolean);"""
    support_points_code = """     const supportPoints=(group?.__groundingSupportMeshes||[]).flatMap(entry=>{
      const mesh=entry.mesh;if(!mesh)return [];
      try{mesh.computeWorldMatrix(true);}catch(_){}
      if(entry.kind==='oriented-box'){
       const localCorners=mesh.getBoundingInfo?.()?.boundingBox?.vectors;
       if(!Array.isArray(localCorners)||localCorners.length!==8)return [];
       const lowestLocalY=Math.min(...localCorners.map(point=>point.y));
       return localCorners.filter(point=>point.y<=lowestLocalY+1e-5).map(corner=>{
        const point=BABYLON.Vector3.TransformCoordinates(corner,mesh.getWorldMatrix());
        const terrainY=renderedTerrainSurfaceAt(point.x,point.z);
        return {dx:point.x-p.x,dz:point.z-p.z,baseY:point.y,name:mesh.name,terrainY:Number(terrainY.toFixed(4)),baseGapMeters:Number((point.y-terrainY).toFixed(4)),kind:entry.kind};
       });
      }
      const angle=entry.kind==='tilted-cylinder'?(Number(mesh.rotation?.z)||0):0,halfHeight=Number(entry.halfHeight)||0;
      const localX=mesh.position.x+(entry.kind==='tilted-cylinder'?Math.sin(angle)*halfHeight:0),localY=mesh.position.y-(entry.kind==='tilted-cylinder'?Math.cos(angle)*halfHeight:halfHeight),worldX=p.x+localX,worldZ=p.z+mesh.position.z,baseY=p.y+localY,terrainY=renderedTerrainSurfaceAt(worldX,worldZ);
      return [{dx:worldX-p.x,dz:worldZ-p.z,baseY,name:mesh.name,terrainY:Number(terrainY.toFixed(4)),baseGapMeters:Number((baseY-terrainY).toFixed(4)),kind:entry.kind}];
     });"""
    if html.count(support_points_marker) != 1:
        raise SystemExit("No se encontró exactamente el diagnóstico de apoyos de los campamentos.")
    html = html.replace(support_points_marker, support_points_code, 1)
    print("OK bedroll orientation and all four lower-corner support measurements are grounded on the rendered terrain.")

    # Add a runtime check for every boulder using its actual world-space bounding box.
    rock_audit_marker = "window.__ELSN_TEST__={"
    rock_audit_code = """window.__ELSN_TEST__={
    outerLandmarkGrounding:()=>[
     {name:'NorseThingstead_10',islandIndex:10,offsetY:0},
     {name:'NorseCoastalPier_11',islandIndex:11,offsetY:.10,minimumY:.10},
     {name:'NorseCoastalBeacon_12',islandIndex:12,offsetY:0}
    ].map(spec=>{
     const root=scene.getTransformNodeByName?.(spec.name)||scene.getMeshByName?.(spec.name)||null;
     if(!root)return {name:spec.name,found:false,islandIndex:spec.islandIndex};
     root.computeWorldMatrix?.(true);
     const position=root.getAbsolutePosition?.()||root.position;
     const terrainY=renderedTerrainSurfaceAt(position.x,position.z);
     const expectedY=spec.minimumY===undefined?terrainY:Math.max(spec.minimumY,terrainY+spec.offsetY);
     return {name:spec.name,found:true,islandIndex:spec.islandIndex,x:Number(position.x.toFixed(3)),y:Number(position.y.toFixed(4)),z:Number(position.z.toFixed(3)),terrainY:Number(terrainY.toFixed(4)),expectedY:Number(expectedY.toFixed(4)),anchorErrorMeters:Number((position.y-expectedY).toFixed(4))};
    }),
    rockGroundingAudit:()=>rocks.map((rock,index)=>{
     const mesh=rock?.meshes?.[0];if(!mesh)return {index,valid:false};
     mesh.computeWorldMatrix?.(true);
     const bounds=mesh.getBoundingInfo?.()?.boundingBox;
     const bottomY=Number(bounds?.minimumWorld?.y??(mesh.position.y-mesh.scaling.y*.5));
     const terrainY=renderedTerrainSurfaceAt(rock.x,rock.z);
     return {index,x:Number(rock.x.toFixed(3)),z:Number(rock.z.toFixed(3)),bottomY:Number(bottomY.toFixed(4)),renderedTerrainY:Number(terrainY.toFixed(4)),gapMeters:Number((bottomY-terrainY).toFixed(4)),valid:Number.isFinite(bottomY)&&Number.isFinite(terrainY)};
    }),"""
    if html.count(rock_audit_marker) != 1:
        raise SystemExit("No se encontró la API de auditoría para anclar rocas.")
    html = html.replace(rock_audit_marker, rock_audit_code, 1)

    # Keep every island garrison prop attached to its registered root.
    # Previously the flagpole, standard and three stakes were free scene roots,
    # so distance culling of IslandGarrisonOutpost_N left them visible over the sea.
    detached_flagpole = """  const flagPole=cyl('IslandGarrisonFlagpole_'+islandIndex,null,[flagX,flagY+2.15,flagZ],4.3,.075,.075,M.woodLight);
  const flagGroup=newGroup('IslandGarrisonStandard_'+islandIndex,null);flagGroup.position=v(flagX,flagY+3.55,flagZ);"""
    attached_flagpole = """  const garrisonWorldToLocal=(x,y,z)=>{outpostRoot.computeWorldMatrix(true);const inverse=outpostRoot.getWorldMatrix().clone();inverse.invert();return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x,y,z),inverse);};
  const flagPoleLocal=garrisonWorldToLocal(flagX,flagY+2.15,flagZ);
  const flagPole=cyl('IslandGarrisonFlagpole_'+islandIndex,outpostRoot,[flagPoleLocal.x,flagPoleLocal.y,flagPoleLocal.z],4.3,.075,.075,M.woodLight);flagPole.parent=outpostRoot;
  const flagGroup=newGroup('IslandGarrisonStandard_'+islandIndex,outpostRoot);flagGroup.parent=outpostRoot;const flagGroupLocal=garrisonWorldToLocal(flagX,flagY+3.55,flagZ);flagGroup.position.copyFrom(flagGroupLocal);"""
    flagpole_occurrences = html.count(detached_flagpole)
    if flagpole_occurrences < 1:
        raise SystemExit("No se encontró ninguna pareja de raíces independientes de bandera de guarnición.")
    html = html.replace(detached_flagpole, attached_flagpole)
    if html.count(detached_flagpole) or html.count(attached_flagpole) != flagpole_occurrences:
        raise SystemExit("No se pudieron anclar todas las banderas de las guarniciones.")

    detached_stake = """   cyl('IslandGarrisonStake_'+islandIndex+'_'+stake,null,[px,py+.42,pz],.84,.10,.14,M.woodDark,[Math.sin(a)*.07,0,Math.cos(a)*-.07]);"""
    attached_stake = """   const stakeLocal=garrisonWorldToLocal(px,py+.42,pz);const stakeMesh=cyl('IslandGarrisonStake_'+islandIndex+'_'+stake,outpostRoot,[stakeLocal.x,stakeLocal.y,stakeLocal.z],.84,.10,.14,M.woodDark,[Math.sin(a)*.07,0,Math.cos(a)*-.07]);if(stakeMesh)stakeMesh.parent=outpostRoot;"""
    stake_occurrences = html.count(detached_stake)
    if stake_occurrences < 1:
        raise SystemExit("No se encontró ninguna raíz independiente de estacas de guarnición.")
    html = html.replace(detached_stake, attached_stake)
    if html.count(detached_stake) or html.count(attached_stake) != stake_occurrences:
        raise SystemExit("No se pudieron anclar todas las estacas de las guarniciones.")

    # Keep the short offshore view only on explicitly detected ultra-low-end Android devices in Performance mode.
    # Other devices retain each structure's existing normal visibility distance while aboard the ship.
    boat_visibility_marker = "boatVisibleDistance:Math.max(30,Number(options.boatVisibleDistance)||55),"
    boat_visibility_code = "boatVisibleDistance:isUltraLowEndMobile?Math.max(30,Number(options.boatVisibleDistance)||55):Math.max(60,Number(options.maxVisibleDistance)||205),"
    if html.count(boat_visibility_marker) != 1:
        raise SystemExit("No se encontró exactamente el límite de visibilidad en barco de las estructuras habitables.")
    html = html.replace(boat_visibility_marker, boat_visibility_code, 1)

    # Garrison flags now live in outpost-local coordinates. The invasion and
    # capture controllers historically wrote world-space Y values because the
    # flag group used to be a scene root. Convert those writes as well, or a
    # captured/lost garrison can push its banner several metres into the sea.
    detached_flag_base_y = "flagBaseY:flagY+3.55"
    local_flag_base_y = "flagBaseY:flagY+3.55-outpostGroundY"
    if html.count(detached_flag_base_y) != 1:
        raise SystemExit("No se encontró exactamente la altura base de las banderas de guarnición.")
    html = html.replace(detached_flag_base_y, local_flag_base_y, 1)

    detached_flag_reset = "if(vl.flagGroup){vl.flagGroup.position.y=vl.flagBaseY||terrainSurfaceAt(vl.x,vl.z)+4.65;vl.flagGroup.scaling.set(1,1,1);}"
    local_flag_reset = "if(vl.flagGroup){vl.flagGroup.position.y=vl.flagBaseY??(terrainSurfaceAt(vl.x,vl.z)+4.65);vl.flagGroup.scaling.set(1,1,1);}"
    flag_reset_occurrences = html.count(detached_flag_reset)
    if flag_reset_occurrences != 2:
        raise SystemExit(f"Se esperaban dos reinicios de bandera y se encontraron {flag_reset_occurrences}.")
    html = html.replace(detached_flag_reset, local_flag_reset)
    if html.count(detached_flag_reset) or html.count(local_flag_reset) != flag_reset_occurrences:
        raise SystemExit("No se pudieron adaptar los reinicios de bandera al espacio local.")

    detached_capture_raise = "village.flagGroup.position.y=2.15+2.5*ease;"
    local_capture_raise = "village.flagGroup.position.y=(village.islandGarrison?2.15-(village.outpostRoot?.position?.y||0):2.15)+2.5*ease;"
    if html.count(detached_capture_raise) != 1:
        raise SystemExit("No se encontró exactamente la animación de izado de bandera.")
    html = html.replace(detached_capture_raise, local_capture_raise, 1)

    # The garrison grounding probe must measure the flag group's world transform,
    # not its local Y after the group becomes a child of IslandGarrisonOutpost_N.
    detached_flag_measure = """    const flagPosition=village.flagGroup?.getAbsolutePosition?village.flagGroup.getAbsolutePosition():village.flagGroup?.position;"""
    world_flag_measure = """    village.flagGroup?.computeWorldMatrix?.(true);
    const flagPosition=village.flagGroup?.getAbsolutePosition?.()||village.flagGroup?.position;"""
    if html.count(detached_flag_measure) != 1:
        raise SystemExit("No se encontró exactamente una medición de altura de bandera de guarnición.")
    html = html.replace(detached_flag_measure, world_flag_measure, 1)

    # Audit the actual ground contact of the flagpole and verify every garrison
    # prop is parented to the outpost. The flag cloth's origin is intentionally
    # 3.55m above ground and must never be compared directly with the terrain.
    detached_flag_error = """    const flagErrorMeters=flagPosition?Math.abs((flagPosition.y-3.55)-flagGroundY):Infinity;"""
    pole_ground_error = """    const outpostRoot=village.outpostRoot||null;
    const flagPoleMesh=scene.getMeshByName('IslandGarrisonFlagpole_'+village.landIndex);
    flagPoleMesh?.computeWorldMatrix?.(true);
    const flagPoleWorld=flagPoleMesh?.getAbsolutePosition?.()||null;
    const flagPoleGroundY=flagPoleWorld?renderedTerrainSurfaceAt(flagPoleWorld.x,flagPoleWorld.z):NaN;
    const flagErrorMeters=flagPoleWorld?Math.abs((flagPoleWorld.y-2.15)-flagPoleGroundY):Infinity;
    const stakeMeshes=[0,1,2].map(stake=>scene.getMeshByName('IslandGarrisonStake_'+village.landIndex+'_'+stake));
    const flagGroupMesh=village.flagGroup||scene.getTransformNodeByName?.('IslandGarrisonStandard_'+village.landIndex)||scene.getMeshByName('IslandGarrisonStandard_'+village.landIndex);
    const detachedPropCount=[flagPoleMesh,flagGroupMesh,...stakeMeshes].filter(prop=>!prop||prop.parent!==outpostRoot).length;"""
    if html.count(detached_flag_error) != 1:
        raise SystemExit("No se encontró exactamente una medición de contacto de la bandera de guarnición.")
    html = html.replace(detached_flag_error, pole_ground_error, 1)
    detached_garrison_return = """    return {island:village.name,islandIndex:village.landIndex,outpostX:root?Number(root.x.toFixed(2)):null,outpostZ:root?Number(root.z.toFixed(2)):null,outpostErrorMeters:Number(outpostErrorMeters.toFixed(4)),guardErrorMeters:Number(guardErrorMeters.toFixed(4)),flagErrorMeters:Number(flagErrorMeters.toFixed(4)),maximumAnchorErrorMeters:Number(Math.max(outpostErrorMeters,guardErrorMeters,flagErrorMeters).toFixed(4))};"""
    verified_garrison_return = """    return {island:village.name,islandIndex:village.landIndex,outpostX:root?Number(root.x.toFixed(2)):null,outpostZ:root?Number(root.z.toFixed(2)):null,outpostErrorMeters:Number(outpostErrorMeters.toFixed(4)),guardErrorMeters:Number(guardErrorMeters.toFixed(4)),flagErrorMeters:Number(flagErrorMeters.toFixed(4)),detachedPropCount,flagPoleParent:flagPoleMesh?.parent?.name||null,flagGroupParent:flagGroupMesh?.parent?.name||null,maximumAnchorErrorMeters:Number(Math.max(outpostErrorMeters,guardErrorMeters,flagErrorMeters).toFixed(4))};"""
    if html.count(detached_garrison_return) != 1:
        raise SystemExit("No se encontró exactamente un informe de anclaje de guarnición.")
    html = html.replace(detached_garrison_return, verified_garrison_return, 1)

    # After moving a garrison root, re-sample each child prop at its new world X/Z.
    # This prevents the flagpole, standard and stakes from hovering over the shoreline.
    detached_relocation = """      else root.position.copyFrom?root.position.copyFrom(targetPosition):root.position.set(candidate.x,candidate.centerY-entry.baseOffset,candidate.z);"""
    reanchored_relocation = """      else root.position.copyFrom?root.position.copyFrom(targetPosition):root.position.set(candidate.x,candidate.centerY-entry.baseOffset,candidate.z);
      if(String(root.name||'').startsWith('IslandGarrisonOutpost_')){
       const garrison=villages.find(item=>item.outpostRoot===root);
       const toLocal=(x,y,z)=>{root.computeWorldMatrix(true);const inverse=root.getWorldMatrix().clone();inverse.invert();return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x,y,z),inverse);};
       const reanchorPart=(node,height)=>{if(!node?.position)return;node.computeWorldMatrix?.(true);const world=node.getAbsolutePosition?.();if(!world)return;const groundY=renderedTerrainSurfaceAt(world.x,world.z);node.position.copyFrom(toLocal(world.x,groundY+height,world.z));};
       reanchorPart(scene.getMeshByName('IslandGarrisonFlagpole_'+(garrison?.landIndex??-1)),2.15);
       const garrisonFlagGroup=garrison?.flagGroup||scene.getTransformNodeByName?.('IslandGarrisonStandard_'+(garrison?.landIndex??-1));
       reanchorPart(garrisonFlagGroup,3.55);
       if(garrison&&garrisonFlagGroup?.position)garrison.flagBaseY=garrisonFlagGroup.position.y;
       for(let stake=0;stake<3;stake++)reanchorPart(scene.getMeshByName('IslandGarrisonStake_'+(garrison?.landIndex??-1)+'_'+stake),.42);
      }"""
    if html.count(detached_relocation) < 1:
        raise SystemExit("No se encontró el movimiento de anclaje usado por el reparador de estructuras.")
    html = html.replace(detached_relocation, reanchored_relocation)


    # Align outer-island landmarks to the rendered terrain heightfield.
    outer_landmark_anchor_replacements = (
        (
            "const x=island.x,z=island.z,y=terrainSurfaceAt(x,z),circle=newGroup('NorseThingstead_'+index,null),ringRadius=5.2;",
            "const x=island.x,z=island.z,y=renderedTerrainSurfaceAt(x,z),circle=newGroup('NorseThingstead_'+index,null),ringRadius=5.2;",
            "NorseThingstead",
        ),
        (
            "pier.position=v(startX,Math.max(.10,terrainSurfaceAt(startX,startZ)+.10),startZ);pier.rotation.y=-angle;",
            "pier.position=v(startX,Math.max(.10,renderedTerrainSurfaceAt(startX,startZ)+.10),startZ);pier.rotation.y=-angle;",
            "NorseCoastalPier",
        ),
        (
            "const x=island.x,z=island.z,y=terrainSurfaceAt(x,z),tower=newGroup('NorseCoastalBeacon_'+index,null);",
            "const x=island.x,z=island.z,y=renderedTerrainSurfaceAt(x,z),tower=newGroup('NorseCoastalBeacon_'+index,null);",
            "NorseCoastalBeacon",
        ),
    )
    for detached_anchor, rendered_anchor, label in outer_landmark_anchor_replacements:
        if html.count(detached_anchor) != 1:
            raise SystemExit(f"No se encontró exactamente un anclaje original para {label}.")
        html = html.replace(detached_anchor, rendered_anchor, 1)

    # Include outer-island landmarks in the offshore structural inventory.
    old_structure_pattern = "const structureNamePattern=/(?:weatherednorsehut|"
    new_structure_pattern = "const structureNamePattern=/(?:norsethingstead|norsecoastalpier|norsecoastalbeacon|weatherednorsehut|"
    if html.count(old_structure_pattern) != 1:
        raise SystemExit("No se encontró exactamente el patrón principal del inventario estructural.")
    html = html.replace(old_structure_pattern, new_structure_pattern, 1)

    # The packaged build always prefers the same-origin, bundled files.
    html = html.replace(
        "async function resolveVikingAssetUrls(){\n  if(isPerformanceMode)return [VIKING_GLB_URL];\n  const urls=[VIKING_GLB_URL];",
        "async function resolveVikingAssetUrls(){\n  return [VIKING_GLB_URL];\n  const urls=[VIKING_GLB_URL];"
    )
    html = html.replace(
        " async function resolveCivilianHumanAssetUrls(){\n  const urls=[CIVILIAN_HUMAN_GLB_URL];",
        " async function resolveCivilianHumanAssetUrls(){\n  return [CIVILIAN_HUMAN_GLB_URL];\n  const urls=[CIVILIAN_HUMAN_GLB_URL];"
    )
    # Load the atmosphere runtime synchronously before the monolithic game script.
    # A deferred script at </body> executes only after parsing, which is too late:
    # the game constructs AtmosphereSystem while its inline runtime is evaluated.
    atmosphere_tag = '<script src="./scripts/nordic/atmosphere-system.js"></script>'
    game_runtime_marker = '<script>\n(function(){\n"use strict";\nwindow.addEventListener(\'error\''
    if html.count(game_runtime_marker) != 1:
        raise SystemExit("No se encontró exactamente el inicio del runtime principal para instalar la atmósfera.")
    if html.count(atmosphere_tag) > 1:
        raise SystemExit("La etiqueta del sistema atmosférico aparece duplicada.")
    if atmosphere_tag not in html:
        html = html.replace(game_runtime_marker, atmosphere_tag + "\n" + game_runtime_marker, 1)
    if html.index(atmosphere_tag) > html.index(game_runtime_marker):
        raise SystemExit("El sistema atmosférico debe cargarse antes del runtime principal.")

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
        "./scripts/nordic/atmosphere-system.js",
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

    # Shared camera and cartography runtime for every game entry point.
    navigation_source = ROOT / "scripts" / "nordic" / "navigation-suite.js"
    if not navigation_source.is_file():
        raise SystemExit("Falta scripts/nordic/navigation-suite.js.")
    navigation_target = DIST / "scripts" / "nordic" / "navigation-suite.js"
    shutil.copy2(navigation_source, navigation_target)

    atmosphere_source = ROOT / "scripts" / "nordic" / "atmosphere-system.js"
    if not atmosphere_source.is_file():
        raise SystemExit("Falta scripts/nordic/atmosphere-system.js.")
    atmosphere_target = DIST / "scripts" / "nordic" / "atmosphere-system.js"
    shutil.copy2(atmosphere_source, atmosphere_target)

    navigation_tag = '<script src="./scripts/nordic/navigation-suite.js" defer></script>'
    if navigation_tag not in html:
        if "</body>" not in html:
            raise SystemExit("No se encontró </body> para instalar la navegación.")
        html = html.replace("</body>", navigation_tag + "\n</body>", 1)


    # Release candidate 0.6.279: fix the submerged seabed profile once, keep the
    # heightfield skirt beneath it, and verify cross-mesh contact before release.
    if game_version != "0.6.274":
        raise SystemExit(f"Se esperaba la base 0.6.274 para construir la candidata 0.6.279; se encontró {game_version}.")
    version_meta_pattern = r'(<meta\s+name=["\']el-sin-nombre-build["\']\s+content=["\'])0\.6\.274(["\'])'
    html, version_meta_count = re.subn(version_meta_pattern, r'\g<1>0.6.279\2', html, count=1, flags=re.IGNORECASE)
    if version_meta_count != 1:
        raise SystemExit("No se pudo actualizar de forma única la versión del juego a 0.6.279.")
    html = html.replace("0.6.274", "0.6.279")
    if "0.6.274" in html:
        raise SystemExit("Quedan referencias de versión 0.6.274 en el HTML generado.")
    # The source may already carry the new game version or a newer diagnostic
    # report version. Normalize the unique build marker instead of assuming the
    # inline diagnostics are still at reportVersion 11.
    diagnostic_build_pattern = r"reportVersion:'\d+',build:'[^']+'"
    diagnostic_build_replacement = "reportVersion:'14',build:'0.6.279'"
    html, diagnostic_build_count = re.subn(
        diagnostic_build_pattern, diagnostic_build_replacement, html, count=1
    )
    if diagnostic_build_count != 1:
        raise SystemExit("No se encontró exactamente una identificación de compilación 0.6.279 para normalizar.")
    game_version = "0.6.279"
    USER_AGENT = f"EL-SIN-NOMBRE-WebBuild/{game_version} (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"

    # 0.6.279 graphics uplift: sharper render resolution on phones with GPU headroom.
    # The dedicated Performance profile is deliberately unchanged.
    quality_profile_marker = r"""const qualityDpr=isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile ? .62 : (constrainedHardware ? .78 : (isTouchDevice ? 1.0 : 1.35)))))):Math.min(deviceDpr,isTouchDevice?1.80:1.85);"""
    quality_profile_code = r"""const highTierGpuMatch=/Adreno.*(?:7[5-9]\d|8\d\d)|Mali[- ]?G7\d{2}|Xclipse.*(?:9\d{2}|1\d{3})/i.test(graphicsRenderer);
 const highHeadroomQualityMobile=!!(!isPerformanceMode&&isTouchDevice&&!constrainedHardware&&((reportedMemory>=8&&(Number(navigator.hardwareConcurrency)||0)>=8)||highTierGpuMatch));
 const qualityDprFloor=Math.min(deviceDpr,isTouchDevice?1.80:1.85);
 const qualityDprCeiling=Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.40:1.80):1.85);
 const qualityDpr=isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile ? .62 : (constrainedHardware ? .78 : (isTouchDevice ? 1.0 : 1.35)))))):Math.min(deviceDpr,highHeadroomQualityMobile?2.10:(isTouchDevice?1.80:1.85));"""
    if html.count(quality_profile_marker) != 1:
        raise SystemExit("No se encontró exactamente una política original de resolución.")
    html = html.replace(quality_profile_marker, quality_profile_code, 1)

    quality_adaptive_marker = r""" let fpsSample=0,qualityDprCurrent=qualityDpr;
 let lastWorldUpdateMs=0,lastRenderCpuMs=0;
 const targetFrameRate=120;
 function adaptRenderQuality(dt){
  // Monitor-only: never lower resolution, DPR, shadow-map size or visual fidelity at runtime.
  fpsSample+=dt;if(fpsSample<(isConstrainedMobile?1.5:2.5))return;fpsSample=0;
  const fps=engine.getFps();
  if(fps<24)console.info('Diagnóstico de rendimiento (calidad bloqueada; sin reducción automática)',{fps:Math.round(fps),targetFrameRate,renderDpr:qualityDprCurrent,shadowMap:currentShadowSize,meshes:scene.meshes.length,vegetationMerge:staticMergeStats});
 }"""
    quality_adaptive_code = r""" let fpsSample=0,qualityDprCurrent=qualityDpr;
 let qualityDprStableSamples=0,qualityDprSlowSamples=0;
 let lastWorldUpdateMs=0,lastRenderCpuMs=0;
 const targetFrameRate=120;
 function adaptRenderQuality(dt){
  fpsSample+=dt;if(fpsSample<(isConstrainedMobile?1.5:2.5))return;fpsSample=0;
  const fps=engine.getFps();
  if(!isPerformanceMode&&highHeadroomQualityMobile){
   if(fps<55){
    qualityDprSlowSamples++;qualityDprStableSamples=0;
    if(qualityDprSlowSamples>=2&&qualityDprCurrent>qualityDprFloor+.01){
     qualityDprCurrent=Math.max(qualityDprFloor,Number((qualityDprCurrent-.12).toFixed(2)));
     engine.setHardwareScalingLevel(1/qualityDprCurrent);qualityDprSlowSamples=0;
     console.info('EL SIN NOMBRE: resolución interna reducida para proteger la fluidez.',{fps:Math.round(fps),renderDpr:qualityDprCurrent});
    }
   }else if(fps>=59){
    qualityDprStableSamples++;qualityDprSlowSamples=0;
    if(qualityDprStableSamples>=6&&qualityDprCurrent<qualityDprCeiling-.01){
     qualityDprCurrent=Math.min(qualityDprCeiling,Number((qualityDprCurrent+.10).toFixed(2)));
     engine.setHardwareScalingLevel(1/qualityDprCurrent);qualityDprStableSamples=0;
     console.info('EL SIN NOMBRE: resolución interna elevada con margen estable de GPU.',{fps:Math.round(fps),renderDpr:qualityDprCurrent});
    }
   }else{qualityDprStableSamples=0;qualityDprSlowSamples=0;}
  }
  if(fps<24)console.info('Diagnóstico de rendimiento (fidelidad protegida)',{fps:Math.round(fps),targetFrameRate,renderDpr:qualityDprCurrent,shadowMap:currentShadowSize,meshes:scene.meshes.length,vegetationMerge:staticMergeStats});
 }"""
    if html.count(quality_adaptive_marker) != 1:
        raise SystemExit("No se encontró exactamente la función original de supervisión de resolución.")
    html = html.replace(quality_adaptive_marker, quality_adaptive_code, 1)

    high_res_texture_replacements = (
        ("function makePatternTexture(name,base,accents,style='grain',size=512,generateMipMaps=false){",
         "function makePatternTexture(name,base,accents,style='grain',size=highHeadroomQualityMobile?1024:512,generateMipMaps=false){",
         "default material textures"),
        ("'sand',isPerformanceMode?(isConstrainedMobile?256:512):1024,true)",
         "'sand',isPerformanceMode?(isConstrainedMobile?256:512):(highHeadroomQualityMobile?2048:1024),true)",
         "sand albedo"),
        ("const size=isPerformanceMode?(isConstrainedMobile?512:768):1024;",
         "const size=isPerformanceMode?(isConstrainedMobile?512:768):(highHeadroomQualityMobile?2048:1024);",
         "coastal sand"),
        ("'water',isConstrainedMobile?512:768)",
         "'water',isPerformanceMode?(isConstrainedMobile?512:768):(highHeadroomQualityMobile?1024:768))",
         "water texture"),
        ("const size=256,tex=new B.DynamicTexture(name,{width:size,height:size},scene,false),ctx=tex.getContext(),img=ctx.createImageData(size,size);",
         "const size=highHeadroomQualityMobile?512:256,tex=new B.DynamicTexture(name,{width:size,height:size},scene,false),ctx=tex.getContext(),img=ctx.createImageData(size,size);",
         "detail normal maps"),
    )
    for old_code,new_code,label in high_res_texture_replacements:
        if html.count(old_code) != 1:
            raise SystemExit(f"No se encontró exactamente una fórmula original para {label}.")
        html = html.replace(old_code,new_code,1)
    print("OK: materiales 1K, arena 2K y normales 512 px para teléfonos con margen gráfico.")

    coastal_profile_replacements = (
        (
            "if(mesh===skyDome||mesh===sunHalo||mesh===sunDisc){list.push(mesh);continue;}",
            "if(mesh===skyDome||mesh===sunHalo||mesh===sunDisc||(window.__ELSN_ATMOSPHERE&&(mesh===window.__ELSN_ATMOSPHERE.moonDisc||mesh===window.__ELSN_ATMOSPHERE.moonHalo))){list.push(mesh);continue;}",
            "moon disc and halo in the existing Nordic water mirror",
        ),
        (
            "  const cloudWindRate=.00042+.00014*Math.sin(elapsed*.0031);skyTexture.uOffset=(elapsed*cloudWindRate)%1;\n  // El cielo se desplaza con viento variable; la capa vertical acompaña el flujo atmosférico.\n  skyTexture.vOffset=Math.sin(elapsed*.00009)*.012;\n  const sunArc=elapsed*.00022;sunHalo.position.x=290+Math.sin(sunArc)*48;sunDisc.position.x=sunHalo.position.x;sunHalo.position.y=235+Math.sin(sunArc*.7)*22;sunDisc.position.y=sunHalo.position.y;\n  sun.direction.x=-.42+Math.sin(sunArc)*.055;sun.direction.z=.22+Math.cos(sunArc)*.045;hemi.intensity=.84+.035*Math.sin(elapsed*.002);sun.intensity=1.38+.08*Math.sin(elapsed*.0017);\n  animateWater(dt);",
            "  if(atmosphereSystem)atmosphereSystem.update(dt);\n  else{\n   const cloudWindRate=.00042+.00014*Math.sin(elapsed*.0031);skyTexture.uOffset=(elapsed*cloudWindRate)%1;\n   skyTexture.vOffset=Math.sin(elapsed*.00009)*.012;\n   const sunArc=elapsed*.00022;sunHalo.position.x=290+Math.sin(sunArc)*48;sunDisc.position.x=sunHalo.position.x;sunHalo.position.y=235+Math.sin(sunArc*.7)*22;sunDisc.position.y=sunHalo.position.y;\n   sun.direction.x=-.42+Math.sin(sunArc)*.055;sun.direction.z=.22+Math.cos(sunArc)*.045;hemi.intensity=.84+.035*Math.sin(elapsed*.002);sun.intensity=1.38+.08*Math.sin(elapsed*.0017);\n  }\n  animateWater(dt);",
            "unified atmospheric clock replacing the legacy pseudo-sun arc",
        ),

        (
            "const segments=isPerformanceMode?192:512,rows=isPerformanceMode?10:20,cols=segments+1;",
            "const segments=isPerformanceMode?192:512,rows=isPerformanceMode?10:(isTouchDevice?64:96),cols=segments+1;",
            "densidad radial de NordicSubmergedSand",
        ),
        (
            "const shoreHeight=terrainHeightOnIsland(island,x,z);\n    const y=window.NorseCoastalInteraction.seabedHeight(radius,island.r,shoreHeight);",
            "const shoreHeight=terrainHeightOnIsland(island,x,z);\n    const y=shoreHeight;",
            "perfil submarino único de NordicSubmergedSand",
        ),
        (
            "const seabedY=window.NorseCoastalInteraction.seabedHeight(d,is.r,analyticalHeight);",
            "const seabedY=analyticalHeight-.003;",
            "falda sumergida de IslandHeightfield",
        ),
        (
            "if(kind==='submerged'){\n     const distance=Math.hypot(x-island.x,z-island.z);\n     expected=window.NorseCoastalInteraction.seabedHeight(distance,island.r,terrainHeightOnIsland(island,x,z))-.003;\n    }else expected=livingBeachSurfaceAt(island,index,x,z);",
            "if(kind==='submerged')expected=terrainHeightOnIsland(island,x,z)-.003;\n    else expected=livingBeachSurfaceAt(island,index,x,z);",
            "perfil analítico de la auditoría submarina",
        ),
        (
            "probe.position=v(land[0].x+land[0].r*1.40,.42,land[0].z);",
            "probe.position=v(land[0].x,.42,land[0].z+land[0].r*1.40);",
            "sonda flotante dentro del alcance de cámara",
        ),
    )
    for old_code, new_code, label in coastal_profile_replacements:
        if html.count(old_code) != 1:
            raise SystemExit(f"No se encontró exactamente una fórmula original para {label}.")
        html = html.replace(old_code, new_code, 1)

    atmosphere_init_marker = "function update(dt){"
    atmosphere_init_code = r"""
  let atmosphereSystem=null;
  try{
   if(typeof window.NorseAtmosphereSystem==='function'){
    atmosphereSystem=new window.NorseAtmosphereSystem({
     B,scene,camera,engine,sunLight:sun,hemiLight:hemi,skyDome,sunDisc,sunHalo,skyTexture,renderPipeline,
     waterMaterial:M.water,windowMaterial:M.windowGlow,hearths:hearthStates,fireLights,
     focusProvider:()=>onShip?ship.position:player.root.position,
     getShadowGenerator:()=>shadowGen,
     setShadowGenerator:generator=>{shadowGen=generator;},
     isPerformanceMode,isTouchDevice,isConstrainedMobile,reportedMemory,
     timeOfDay:8.25,dayDurationSeconds:300
    });
    window.__ELSN_ATMOSPHERE=atmosphereSystem;
    if(typeof syncNordicWaterReflectionIsland==='function'){activeWaterReflectionIslandIndex=-2;syncNordicWaterReflectionIsland();}
    window.__ELSN_ATMOSPHERE_CONTROLS={
     setTime:value=>atmosphereSystem.setTime(value),
     pause:()=>atmosphereSystem.pause(),
     resume:()=>atmosphereSystem.resume(),
     setSpeed:value=>atmosphereSystem.setSpeed(value),
     setDayDuration:value=>atmosphereSystem.setDayDuration(value),
     setWeather:value=>atmosphereSystem.setWeather(value),
     setClimate:value=>atmosphereSystem.setClimate(value),
     state:()=>atmosphereSystem.getState()
    };
   }else console.warn('NorseAtmosphereSystem no está disponible; se conserva el cielo de respaldo.');
  }catch(atmosphereError){
   atmosphereSystem=null;
   console.error('No se pudo inicializar NorseAtmosphereSystem; se conserva el cielo de respaldo.',atmosphereError);
  }
"""
    if html.count(atmosphere_init_marker) != 1:
        raise SystemExit("No se encontró exactamente una función update(dt) para instalar el sistema atmosférico.")
    html = html.replace(atmosphere_init_marker, atmosphere_init_code + "\n" + atmosphere_init_marker, 1)

    # Compare the actual rendered height surfaces at their shared X/Z coordinates.
    # The 5 cm limit applies to seams between adjacent meshes, not to natural slopes
    # between neighbouring vertices inside one mesh.
    coastal_continuity_marker = "  function auditIslandGeometry(){return auditIslandGeometryScoped(null);}"
    coastal_continuity_code = r"""
  function coastalMeshTriangleHeightAtXZ(positions,rows,cols,centerX,centerZ,x,z){
   if(!positions||rows<2||cols<2||positions.length<rows*cols*3)return null;
   const dx=x-centerX,dz=z-centerZ,radius=Math.hypot(dx,dz),twoPi=Math.PI*2;
   if(!Number.isFinite(radius)||radius<1e-5)return null;
   const angle=(Math.atan2(dz,dx)+twoPi)%twoPi;
   const columnFloat=angle/twoPi*(cols-1),baseColumn=Math.max(0,Math.min(cols-2,Math.floor(columnFloat)));
   const columnFraction=columnFloat-baseColumn;
   const point=(row,column)=>{
    const offset=(row*cols+column)*3;
    return {x:Number(positions[offset]),y:Number(positions[offset+1]),z:Number(positions[offset+2])};
   };
   const inner0=Math.hypot(point(0,baseColumn).x-centerX,point(0,baseColumn).z-centerZ);
   const inner1=Math.hypot(point(0,baseColumn+1).x-centerX,point(0,baseColumn+1).z-centerZ);
   const outer0=Math.hypot(point(rows-1,baseColumn).x-centerX,point(rows-1,baseColumn).z-centerZ);
   const outer1=Math.hypot(point(rows-1,baseColumn+1).x-centerX,point(rows-1,baseColumn+1).z-centerZ);
   const inner=inner0+(inner1-inner0)*columnFraction,outer=outer0+(outer1-outer0)*columnFraction;
   const rowFloat=Math.max(0,Math.min(rows-1,(radius-inner)/Math.max(1e-8,outer-inner)*(rows-1)));
   const baseRow=Math.max(0,Math.min(rows-2,Math.floor(rowFloat)));
   const triangleY=(a,b,c)=>{
    const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    if(Math.abs(denominator)<1e-10)return null;
    const wa=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/denominator;
    const wb=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/denominator;
    const wc=1-wa-wb,epsilon=1e-4;
    if(wa< -epsilon||wb< -epsilon||wc< -epsilon||wa>1+epsilon||wb>1+epsilon||wc>1+epsilon)return null;
    return wa*a.y+wb*b.y+wc*c.y;
   };
   const columns=[baseColumn,Math.max(0,baseColumn-1),Math.min(cols-2,baseColumn+1)];
   const rowCandidates=[baseRow,Math.max(0,baseRow-1),Math.min(rows-2,baseRow+1)];
   for(const row of rowCandidates)for(const column of columns){
    const a=point(row,column),b=point(row,column+1),c=point(row+1,column),d=point(row+1,column+1);
    const first=triangleY(a,b,c);if(Number.isFinite(first))return first;
    const second=triangleY(b,d,c);if(Number.isFinite(second))return second;
   }
   return null;
  }
  function auditCoastalMeshContinuity(onlyIslandIndex=null){
   const started=performance.now(),thresholdMeters=.05,results=[];
   const indexes=Number.isInteger(onlyIslandIndex)?[onlyIslandIndex]:Array.from({length:land.length},(_,index)=>index);
   if(indexes.some(index=>index<0||index>=land.length))throw new RangeError('Invalid island index for coastal continuity audit: '+onlyIslandIndex);
   const makePair=name=>({name,sampleCount:0,missingSamples:0,maxAbsoluteGapMeters:0,outlierCount:0,worstSample:null,thresholdMeters});
   const addPairSample=(pair,x,z,heightA,heightB)=>{
    if(!Number.isFinite(heightA)||!Number.isFinite(heightB)){pair.missingSamples++;return;}
    const gap=Math.abs(heightA-heightB);pair.sampleCount++;
    if(gap>pair.maxAbsoluteGapMeters){
     pair.maxAbsoluteGapMeters=gap;
     pair.worstSample={x:Number(x.toFixed(3)),z:Number(z.toFixed(3)),heightA:Number(heightA.toFixed(4)),heightB:Number(heightB.toFixed(4)),gapMeters:Number(gap.toFixed(5))};
    }
    if(gap>thresholdMeters)pair.outlierCount++;
   };
   for(const index of indexes){
    const island=land[index],madeSeabed=!coastalSeabedMeshes[index],madeBeach=!livingBeachLayers[index];
    let islandResult=null;
    try{
     if(madeSeabed)buildCoastalSeabed(island,index);
     if(madeBeach)buildLivingBeachLayer(island,index);
     const terrain=islandTerrainMeshes[index],seabed=coastalSeabedMeshes[index],beach=livingBeachLayers[index];
     const seabedPositions=seabed?.getVerticesData(B.VertexBuffer.PositionKind)||null;
     const beachPositions=beach?.positions||null;
     const terrainHeight=(x,z)=>{
      if(!terrain||typeof terrain.getHeightAtCoordinates!=='function')return null;
      const value=terrain.getHeightAtCoordinates(x,z);
      return Number.isFinite(value)?value+terrainDeformationAt(index,x,z):null;
     };
     const islandBeach=makePair('IslandHeightfield ↔ LivingCoastalSand');
     const beachSeabed=makePair('LivingCoastalSand ↔ NordicSubmergedSand');
     const islandSeabed=makePair('IslandHeightfield ↔ NordicSubmergedSand');
     const sampleAngles=96;
     for(let angleIndex=0;angleIndex<sampleAngles;angleIndex++){
      const angle=angleIndex/sampleAngles*Math.PI*2,cs=Math.cos(angle),sn=Math.sin(angle);
      // The living beach overlays the rendered heightfield at three inland/intertidal radii.
      for(const ratio of [.80,.89,.98]){
       const radius=island.r*ratio,x=island.x+cs*radius,z=island.z+sn*radius;
       const heightA=terrainHeight(x,z);
       const heightB=coastalMeshTriangleHeightAtXZ(beachPositions,beach?.rows,beach?.cols,island.x,island.z,x,z);
       addPairSample(islandBeach,x,z,heightA,heightB);
      }
      // The two sandy layers share a narrow annulus. Sample its actual angle-dependent overlap.
      if(beach&&seabed&&Array.isArray(beach.radials)&&beach.segments>0){
       const columnFloat=angle/(Math.PI*2)*beach.segments,column=Math.min(beach.segments-1,Math.floor(columnFloat)),fraction=columnFloat-column;
       const inner0=beach.radials[column*2],inner1=beach.radials[(column+1)*2];
       const outer0=beach.radials[column*2+1],outer1=beach.radials[(column+1)*2+1];
       const beachInner=inner0+(inner1-inner0)*fraction,beachOuter=outer0+(outer1-outer0)*fraction;
       const overlapInner=Math.max(beachInner,island.r*(Number(seabed.metadata?.innerRatio)||1.075));
       const overlapOuter=beachOuter;
       if(overlapOuter-overlapInner>=.04){
        const radius=(overlapInner+overlapOuter)*.5,x=island.x+cs*radius,z=island.z+sn*radius;
        const heightA=coastalMeshTriangleHeightAtXZ(beachPositions,beach.rows,beach.cols,island.x,island.z,x,z);
        const heightB=coastalMeshTriangleHeightAtXZ(seabedPositions,seabed.metadata?.rows,seabed.metadata?.cols,island.x,island.z,x,z);
        addPairSample(beachSeabed,x,z,heightA,heightB);
       }
      }
      // The square heightfield skirt overlaps the submerged bed only along the island's diagonal corners.
      const radius=island.r*1.12,x=island.x+cs*radius,z=island.z+sn*radius;
      if(Math.abs(x-island.x)<=island.r-.02&&Math.abs(z-island.z)<=island.r-.02){
       const heightA=terrainHeight(x,z);
       const heightB=coastalMeshTriangleHeightAtXZ(seabedPositions,seabed?.metadata?.rows,seabed?.metadata?.cols,island.x,island.z,x,z);
       addPairSample(islandSeabed,x,z,heightA,heightB);
      }
     }
     islandResult={islandIndex:index,island:island.name,radiusMeters:island.r,pairs:[islandBeach,beachSeabed,islandSeabed]};
     for(const pair of islandResult.pairs){
      pair.maxAbsoluteGapMeters=Number(pair.maxAbsoluteGapMeters.toFixed(5));
      pair.passed=pair.sampleCount>=12&&pair.maxAbsoluteGapMeters<=thresholdMeters+1e-6;
      if(pair.worstSample)pair.worstSample.gapMeters=Number(pair.worstSample.gapMeters.toFixed(5));
     }
    }catch(error){
     islandResult={islandIndex:index,island:island?.name||String(index),radiusMeters:island?.r||null,pairs:[],error:String(error?.stack||error),passed:false};
    }finally{
     if(madeBeach){const layer=livingBeachLayers[index];if(layer){try{layer.mesh.dispose(false,false);}catch(_){}try{layer.material.dispose(false,false);}catch(_){}try{layer.coastalStateTexture.dispose();}catch(_){}livingBeachLayers[index]=null;}}
     if(madeSeabed){const mesh=coastalSeabedMeshes[index];try{mesh?.dispose(false,false);}catch(_){}coastalSeabedMeshes[index]=null;}
    }
    if(islandResult){islandResult.passed=Array.isArray(islandResult.pairs)&&islandResult.pairs.length===3&&islandResult.pairs.every(pair=>pair.passed===true);results.push(islandResult);}
   }
   const failed=results.filter(island=>!island.passed);
   return {schema:1,thresholdMeters,islandCount:results.length,passed:results.length===indexes.length&&failed.length===0,failedIslandCount:failed.length,durationMs:Number((performance.now()-started).toFixed(1)),islands:results};
  }
"""
    if html.count(coastal_continuity_marker) != 1:
        raise SystemExit("No se encontró exactamente el punto de inserción de la auditoría de continuidad costera.")
    html = html.replace(coastal_continuity_marker, coastal_continuity_code + "\n" + coastal_continuity_marker, 1)

    test_api_marker = "   auditIslandGeometryForIsland:(islandIndex)=>auditIslandGeometryScoped(islandIndex),"
    test_api_replacement = test_api_marker + "\n   auditCoastalMeshContinuity:(islandIndex=null)=>auditCoastalMeshContinuity(islandIndex),"
    if html.count(test_api_marker) != 1:
        raise SystemExit("No se pudo exponer la auditoría de continuidad entre mallas en el API de pruebas.")
    html = html.replace(test_api_marker, test_api_replacement, 1)

    # Validate the transformed runtime too; the earlier syntax check runs before these patches.
    transformed_scripts = re.findall(r"<script\b[^>]*>(.*?)</script\s*>", html, flags=re.IGNORECASE | re.DOTALL)
    transformed_inline_scripts = [block for block in transformed_scripts if block.strip()]
    with tempfile.TemporaryDirectory(prefix="norse-js-transformed-check-") as temp_dir:
        transformed_file = Path(temp_dir) / "game-inline-transformed.js"
        transformed_file.write_text("\n".join(transformed_inline_scripts), encoding="utf-8")
        transformed_check = subprocess.run([node, "--check", str(transformed_file)], capture_output=True, text=True)
        if transformed_check.returncode != 0:
            raise SystemExit("JavaScript sintácticamente inválido después de aplicar las correcciones costeras:\n" + transformed_check.stderr)
    print("OK submerged seabed profile is applied once; 5 cm cross-mesh continuity audit is installed and syntax-checked.")

    # A tiny, unobtrusive build label matching the loading screen's muted gold typography.
    version_label = (
        f'<span id="game-build-version" aria-label="Versión {game_version}" '
        f'title="EL SIN NOMBRE · versión {game_version}">v{game_version}</span>'
    )
    version_label_style = (
        '<style id="game-build-version-style">'
        '#game-build-version{position:fixed;right:11px;bottom:calc(env(safe-area-inset-bottom,0px) + 7px);'
        'z-index:2147483000;pointer-events:none;user-select:none;white-space:nowrap;'
        'font:600 7px/1.2 system-ui,sans-serif;letter-spacing:.19em;'
        'color:rgba(226,196,135,.58);text-shadow:0 1px 3px rgba(0,0,0,.9)}'
        '</style>'
    )
    if 'id="game-build-version"' in html or 'id="game-build-version-style"' in html:
        raise SystemExit("La etiqueta de versión ya existe en el HTML fuente; se evita duplicarla.")
    if "</head>" not in html or "</body>" not in html:
        raise SystemExit("No se encontraron los puntos de inserción para la etiqueta discreta de versión.")
    html = html.replace("</head>", version_label_style + "\n</head>", 1)
    html = html.replace("</body>", version_label + "\n</body>", 1)

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
    atmosphere_bytes = atmosphere_target.read_bytes()
    results.append({
        "path": "scripts/nordic/atmosphere-system.js",
        "bytes": len(atmosphere_bytes),
        "sha256": hashlib.sha256(atmosphere_bytes).hexdigest(),
        "source": "project-owned: scripts/nordic/atmosphere-system.js",
    })
    navigation_bytes = navigation_target.read_bytes()
    results.append({
        "path": "scripts/nordic/navigation-suite.js",
        "bytes": len(navigation_bytes),
        "sha256": hashlib.sha256(navigation_bytes).hexdigest(),
        "source": "project-owned: scripts/nordic/navigation-suite.js",
    })
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
