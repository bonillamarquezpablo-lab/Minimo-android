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
BABYLON_VERSION = "9.35.0"
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
    # Grab3D publishes each rigged variant in its own `<slug>-rigged` package,
    # separate from the static model package, as declared by its rigged.files API.
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
        "https://polyfork.dev/cdn/herring-gull-base.glb", 500_000, "glb"
    ),
    "assets/models/forest/mature-scots-pine-tree.glb": (
        "https://files.innerscene.com/library/mature-scots-pine-tree-280307e1/e52dca598822dfa9ffa9/mature-scots-pine-tree.glb", 500_000, "glb"
    ),
    "assets/models/forest/mature-norway-spruce-tree.glb": (
        "https://files.innerscene.com/library/mature-norway-spruce-tree-48c2566f/a285b3017c941e802efc/mature-norway-spruce-tree.glb", 500_000, "glb"
    ),
    "assets/models/forest/oak-textured.glb": (
        "https://grab3d.com/dl/oak-tree/oak-tree.glb", 1_500_000, "glb"
    ),
    "assets/models/wildlife/Deer.glb": (
        "https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic/6d6de54a1d7143cf5487462d147bbef039de4837/assets/Animated%20Animal%20Pack-glb/Deer.glb", 100_000, "glb"
    ),
    "assets/models/wildlife/Stag.glb": (
        "https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic/6d6de54a1d7143cf5487462d147bbef039de4837/assets/Animated%20Animal%20Pack-glb/Stag.glb", 100_000, "glb"
    ),
    "assets/models/wildlife/Wolf.glb": (
        "https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic/6d6de54a1d7143cf5487462d147bbef039de4837/assets/Animated%20Animal%20Pack-glb/Wolf.glb", 100_000, "glb"
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

def validate_rigged_animal_glb(path: Path, label: str) -> dict:
    document = read_glb_document(path)
    meshes = document.get("meshes") or []
    skins = document.get("skins") or []
    animations = document.get("animations") or []
    max_joints = max((len(skin.get("joints") or []) for skin in skins), default=0)
    if not meshes or not skins or not animations:
        raise RuntimeError(
            f"{label}: animal GLB must contain visible geometry, a rig and animation clips "
            f"(meshes={len(meshes)}, skins={len(skins)}, animations={len(animations)})"
        )
    if max_joints < 8:
        raise RuntimeError(f"{label}: animal rig is incomplete ({max_joints} joints; expected >=8)")
    if any(not (mesh.get("primitives") or []) for mesh in meshes):
        raise RuntimeError(f"{label}: one or more animal meshes have no primitives")
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
                elif destination.parent.name == "wildlife":
                    document = validate_rigged_animal_glb(destination, relative)
                    print(
                        f"OK animated animal GLB {relative}: "
                        f"{len(document.get('meshes') or [])} meshes, "
                        f"{max((len(s.get('joints') or []) for s in (document.get('skins') or [])), default=0)} joints, "
                        f"{len(document.get('animations') or [])} clips."
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

    # Keep full-quality coast geometry while tightening the CPU slice ceiling on mobile.
    # Work is spread over more frames; no mesh rows, columns or material detail are removed.
    coast_budget_marker = "BEACH_WORK_BUDGET_MS=isTouchDevice?1.5:2.0"
    coast_budget_replacement = "BEACH_WORK_BUDGET_MS=isTouchDevice?0.75:1.4"
    if html.count(coast_budget_marker) != 1:
        raise SystemExit("No se encontró exactamente un presupuesto de trabajo costero.")
    html = html.replace(coast_budget_marker, coast_budget_replacement, 1)

    # Civilian smiths must not spawn a rigid hammer on a hand/forearm bone.
    # It intersected the hand during idle/walk clips and read as an unexplained brown prop.
    smith_hammer_marker = """  }else if(job===1){
   const hammerParent=rig.hand||rig.forearm||modelRoot,hammer=new B.TransformNode('SmithHammer_'+index,scene);hammer.parent=hammerParent;
   hammer.position=hammerParent===modelRoot?v(.34*inv,.98*inv,.14*inv):v(0,-.12*inv,.08*inv);
   capsule('SmithHammerHandle_'+index,hammer,[0,-.10*inv,0],.50*inv,.025*inv,M.woodLight);
   box('SmithHammerHead_'+index,hammer,[0,.13*inv,0],[.22*inv,.13*inv,.16*inv],M.darkMetal);
  }else if(job===2){"""
    smith_hammer_replacement = """  }else if(job===1){
   // Keep the smith's hands clear; work tools are represented at the anvil, not rigidly bound to a skinned hand.
  }else if(job===2){"""
    if html.count(smith_hammer_marker) != 1:
        raise SystemExit("No se encontró la única herramienta rígida de mano del herrero.")
    html = html.replace(smith_hammer_marker, smith_hammer_replacement, 1)

    # Replace the handmade triangle forest with three complete, local CC0 GLB tree models.
    tree_rebuild_start = "  function createTree(x,z,scale=1){"
    tree_rebuild_end = " function isSafeShrubGroundPoint(is,x,z){"
    if html.count(tree_rebuild_start) != 1 or html.count(tree_rebuild_end) != 1:
        raise SystemExit("No se encontró un único generador de árboles para sustituir.")
    tree_start = html.index(tree_rebuild_start)
    tree_end = html.index(tree_rebuild_end, tree_start)
    tree_rebuild_code = """ const forestTreeAssetSpecs=[
  {kind:'pine',label:'Pino silvestre',url:'./assets/models/forest/mature-scots-pine-tree.glb',targetHeight:6.2,requiresTexture:true},
  {kind:'spruce',label:'Pícea de Noruega',url:'./assets/models/forest/mature-norway-spruce-tree.glb',targetHeight:5.8,requiresTexture:true},
  {kind:'oak',label:'Roble PBR 2K',url:'./assets/models/forest/oak-textured.glb',targetHeight:5.6,requiresTexture:true}
 ];
 const forestTreeTemplates=new Map();
 async function loadForestTreeTemplates(){
  const started=performance.now();
  const loaded=await Promise.all(forestTreeAssetSpecs.map(async spec=>{
   const modelStarted=performance.now(),controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),60000);let blob;
   try{
    const response=await fetch(spec.url,{mode:'same-origin',cache:'force-cache',credentials:'same-origin',signal:controller.signal});
    if(!response.ok)throw new Error('HTTP '+response.status+' · '+spec.label);
    blob=await response.blob();
   }catch(error){
    if(error&&error.name==='AbortError')throw new Error('La descarga del árbol '+spec.label+' superó 60 segundos.');
    throw error;
   }finally{clearTimeout(timer);}
   if(!blob||blob.size<(spec.kind==='oak'?1000000:500000))throw new Error('Modelo forestal incompleto: '+spec.label+' ('+(blob?blob.size:0)+' bytes)');
   const objectUrl=URL.createObjectURL(blob);let container;
   try{
    container=await timedGlbStage('Árbol 3D · '+spec.label,'importación Babylon',()=>B.SceneLoader.LoadAssetContainerAsync('',objectUrl,scene,null,'.glb'),blob.size);
   }finally{URL.revokeObjectURL(objectUrl);}
   const sourceMeshes=container&&(container.meshes||[]).filter(mesh=>mesh&&mesh.getTotalVertices&&mesh.getTotalVertices()>0)||[];
   const textureCount=container&&(container.textures||[]).filter(Boolean).length||0;
   const materialCount=container&&(container.materials||[]).filter(Boolean).length||0;
   if(!container||typeof container.instantiateModelsToScene!=='function'||!sourceMeshes.length||!materialCount){
    throw new Error('El GLB forestal no contiene mallas y materiales instanciables: '+spec.label);
   }
   if(spec.requiresTexture&&textureCount<1)throw new Error('El modelo forestal '+spec.label+' llegó sin mapas de textura.');
   recordStartupTask('Modelo forestal · '+spec.label,modelStarted,performance.now(),'ready',{bytes:blob.size,materials:materialCount,textures:textureCount,source:'Innerscene CC0'});
   return {spec,container,textureCount,materialCount};
  }));
  loaded.forEach(item=>forestTreeTemplates.set(item.spec.kind,item));
  window.__ELSN_FOREST_TREES__={ready:forestTreeTemplates.size===3,species:Array.from(forestTreeTemplates.keys()),loaded:forestTreeTemplates.size,assets:loaded.map(item=>({kind:item.spec.kind,materials:item.materialCount,textures:item.textureCount}))};
  recordStartupTask('Modelos completos del bosque',started,performance.now(),'ready',{species:Array.from(forestTreeTemplates.keys()),loaded:forestTreeTemplates.size,source:'Innerscene CC0'});
  if(forestTreeTemplates.size!==3)throw new Error('No se cargaron los tres modelos forestales obligatorios.');
 }
 function createTree(x,z,scale=1){
  const roll=Math.random(),kind=roll<.39?'pine':roll<.72?'spruce':'oak';
  const spec=forestTreeTemplates.get(kind);
  if(!spec)throw new Error('Modelo forestal obligatorio ausente: '+kind);
  const root=new B.TransformNode('NorseForestTree_'+kind,scene);
  const canopy=new B.TransformNode('TreeCanopyWindPivot_'+kind,scene);canopy.parent=root;
  const visualRoot=new B.TransformNode('TreeGLBVisual_'+kind,scene);visualRoot.parent=canopy;
  const serial=(window.__ELSN_FOREST_INSTANCE_ID=(window.__ELSN_FOREST_INSTANCE_ID||0)+1);
  const inst=spec.container.instantiateModelsToScene(name=>name+'_Forest_'+serial,false);
  const importedRoots=inst.rootNodes||[];
  if(!importedRoots.length)throw new Error('El modelo forestal no produjo nodos raíz: '+spec.spec.label);
  importedRoots.forEach(node=>{node.parent=visualRoot;node.setEnabled(true);});
  const sourceMeshes=getRootMeshes(importedRoots);
  if(!sourceMeshes.length)throw new Error('El modelo forestal no produjo geometría: '+spec.spec.label);
  const bounds=boundsForMeshes(sourceMeshes),sourceHeight=Math.max(.001,bounds.height);
  const placedScale=(spec.spec.targetHeight/sourceHeight)*scale,pivotY=sourceHeight*.58;
  // Merge while the visual root is still at identity so the imported world transforms are baked only once.
  mergeStaticDecorByMaterial(visualRoot,'NorseForestGLB_'+kind+'_'+serial);
  const meshes=visualRoot.getChildMeshes(false).filter(mesh=>mesh&&mesh.getTotalVertices&&mesh.getTotalVertices()>0);
  if(!meshes.length)throw new Error('El modelo forestal no pudo fusionarse en mallas renderizables: '+spec.spec.label);
  if(meshes.length>Math.max(4,sourceMeshes.length))throw new Error('La optimización del árbol aumentó el número de mallas: '+spec.spec.label);
  visualRoot.position.set(-(bounds.min.x+bounds.max.x)*.5,-bounds.min.y-pivotY,-(bounds.min.z+bounds.max.z)*.5);
  canopy.position.y=pivotY;
  root.scaling.setAll(placedScale);
  const baseYaw=rand(0,Math.PI*2);root.rotation.y=baseYaw;
  root.position=v(x,renderedTerrainSurfaceAt(x,z),z);
  meshes.forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=false;});
  root.computeWorldMatrix(true);
  const horizontalSpan=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)*placedScale;
  return {root,canopy,x,z,radius:Math.max(.62,Math.min(1.45,horizontalSpan*.24)),hp:3,alive:true,hitFlash:0,falling:null,fallX:0,fallZ:0,species:kind,baseYaw,baseYOffset:0,windPhase:rand(0,Math.PI*2),modelLabel:spec.spec.label,modelMeshCount:meshes.length};
 }
"""
    html = html[:tree_start] + tree_rebuild_code + html[tree_end:]
    forest_planting_marker = " land.forEach((is,idx)=>{"
    if html.count(forest_planting_marker) != 1:
        raise SystemExit("No se encontró el único bloque de plantación de árboles del archipiélago.")
    html = html.replace(forest_planting_marker, " await loadForestTreeTemplates();\n" + forest_planting_marker, 1)

    tree_reset_marker = "tree.root.setEnabled(true);tree.root.position=v(tree.x,terrainSurfaceAt(tree.x,tree.z),tree.z);tree.root.rotation.set(0,tree.baseYaw||0,0);"
    tree_reset_replacement = "tree.root.setEnabled(true);tree.root.position=v(tree.x,renderedTerrainSurfaceAt(tree.x,tree.z)+(tree.baseYOffset||0),tree.z);tree.root.rotation.set(0,tree.baseYaw||0,0);"
    if html.count(tree_reset_marker) != 1:
        raise SystemExit("No se encontró la única restauración de posición de los árboles.")
    html = html.replace(tree_reset_marker,tree_reset_replacement,1)

    glb_timing_marker = "const glbTimingRecords=[];"
    if html.count(glb_timing_marker) != 1:
        raise SystemExit("No se encontró la declaración única de telemetría GLB.")
    html = html.replace(glb_timing_marker,"// GLB timing records initialized at startGame before required forest imports.",1)

    # Paint every startup milestone synchronously before expensive scene work.
    # Previously setLoadingProgress() only queued requestAnimationFrame(); a long
    # synchronous Babylon/world-construction task could therefore leave the visible
    # indicator at 0% even after bootEngine() had advanced to 2%, 38% or 40%.
    progress_marker = """function setLoadingProgress(value,label){
 trackStartupPerfStage(value,label);
 targetLoadProgress=Math.max(targetLoadProgress,Math.min(100,Math.max(0,Number(value)||0)));
 if(label&&loadText)loadText.textContent=label;
 if(!loadProgressAnimation)loadProgressAnimation=requestAnimationFrame(paintLoadingProgress);
}"""
    progress_replacement = """function setLoadingProgress(value,label){
 trackStartupPerfStage(value,label);
 targetLoadProgress=Math.max(targetLoadProgress,Math.min(100,Math.max(0,Number(value)||0)));
 currentLoadProgress=targetLoadProgress;
 if(loadProgressAnimation)cancelAnimationFrame(loadProgressAnimation);
 loadProgressAnimation=0;lastLoadProgressFrame=0;
 if(label&&loadText)loadText.textContent=label;
 if(loadProgressBar)loadProgressBar.style.width=currentLoadProgress.toFixed(2)+'%';
 if(loadProgressLabel)loadProgressLabel.textContent=Math.floor(currentLoadProgress)+'%';
 if(loadProgressTrack)loadProgressTrack.setAttribute('aria-valuenow',String(Math.round(currentLoadProgress)));
}"""
    if html.count(progress_marker) != 1:
        raise SystemExit("No se encontró la función única de progreso de carga.")
    html = html.replace(progress_marker, progress_replacement, 1)

    # Yield once before synchronous world construction so the browser can paint
    # the real 40% milestone instead of freezing on the initial 0% frame.
    game_start_marker = """ async function startGame(){
 setLoadingProgress(40,'Preparando el mundo…');
 try{"""
    game_start_replacement = """ async function startGame(){
 const glbTimingRecords=[];
 window.__elSinNombreGlbTimings=glbTimingRecords;
 setLoadingProgress(40,'Preparando el mundo…');
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 try{"""
    if html.count(game_start_marker) != 1:
        raise SystemExit("No se encontró el inicio único de startGame para liberar el primer fotograma.")
    html = html.replace(game_start_marker, game_start_replacement, 1)

    # Mobile startup: let the browser stream/compile the bundled Babylon scripts natively.
    # Fetching the complete engine into TextDecoder strings and re-wrapping it in a Blob
    # duplicates several MB and delays script compilation on mid-range Android devices.
    for old_priority, new_priority in (('fetchpriority="low"', 'fetchpriority="high"'),):
        if html.count(old_priority) < 2:
            raise SystemExit("No se encontraron los dos preloads del motor Babylon.")
        html = html.replace(old_priority, new_priority, 2)

    # All fallback engine/GLTF loader mirrors must match the bundled Babylon version.
    html, fallback_version_count = re.subn(r"7\.54\.3", BABYLON_VERSION, html)
    if fallback_version_count < 4:
        raise SystemExit("No se pudieron sincronizar los mirrors de Babylon y GLTF loader.")

    native_script_marker = "script.async=true;script.src=url;script.referrerPolicy='strict-origin-when-cross-origin';"
    if html.count(native_script_marker) != 1:
        raise SystemExit("No se encontró exactamente el cargador dinámico de scripts críticos.")
    html = html.replace(native_script_marker, "script.async=false;script.fetchPriority='high';script.src=url;script.referrerPolicy='strict-origin-when-cross-origin';", 1)
    default_timeout_marker = "function loadEngine(url,timeoutMs=7000,check=null){"
    if html.count(default_timeout_marker) != 1:
        raise SystemExit("No se encontró exactamente el plazo predeterminado del cargador Babylon.")
    html = html.replace(default_timeout_marker, "function loadEngine(url,timeoutMs=30000,check=null){", 1)

    loader_start = html.find("async function loadSameOriginScriptWithProgress(")
    loader_end = html.find("async function installCachedRuntime(", loader_start)
    if loader_start < 0 or loader_end <= loader_start:
        raise SystemExit("No se encontró el cargador de scripts Babylon para optimizar el arranque móvil.")
    native_loader = r"""async function loadEngineWithCache(url,timeoutMs=30000,check=null,progressStart=0,progressEnd=0,label='Cargando recurso'){
 const started=performance.now(),resolved=new URL(url,document.baseURI),sameOrigin=resolved.origin===location.origin;
 let result=null,source=sameOrigin?'same-origin-stream':'external-script',objectUrl=null;
 try{if(performance.setResourceTimingBufferSize)performance.setResourceTimingBufferSize(256);}catch(_){}
 if(sameOrigin){
  try{
   const controller=new AbortController(),downloadTimer=setTimeout(()=>controller.abort(),timeoutMs);
   let response;
   try{
    response=await fetch(resolved.href,{cache:'force-cache',credentials:'same-origin',signal:controller.signal});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const total=Number(response.headers&&response.headers.get('content-length'))||0;
    const chunks=[];let loaded=0;
    if(response.body&&typeof response.body.getReader==='function'){
     const reader=response.body.getReader();
     try{
      while(true){
       const part=await reader.read();if(part.done)break;
       chunks.push(part.value);loaded+=part.value.byteLength;
       const ratio=total>0?Math.min(.96,loaded/total*.96):Math.min(.94,loaded/(9*1024*1024));
       setLoadingProgress(progressStart+(progressEnd-progressStart)*ratio,label+' · '+Math.round(loaded/1024)+' KB');
      }
     }catch(error){try{await reader.cancel();}catch(_){}throw error;}
    }else{
     const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);loaded=bytes.byteLength;
     setLoadingProgress(progressEnd,label+' · descarga terminada');
    }
    clearTimeout(downloadTimer);
    const blob=new Blob(chunks,{type:'text/javascript'});
    chunks.length=0;
    setLoadingProgress(progressEnd,label+' · compilando el motor 3D…');
    // Flush the completed byte-download percentage and let the browser paint it
    // before the large Babylon bundle is synchronously parsed and evaluated.
    currentLoadProgress=Math.max(currentLoadProgress,targetLoadProgress);
    if(loadProgressBar)loadProgressBar.style.width=currentLoadProgress.toFixed(2)+'%';
    if(loadProgressLabel)loadProgressLabel.textContent=Math.floor(currentLoadProgress)+'%';
    if(loadProgressTrack)loadProgressTrack.setAttribute('aria-valuenow',String(Math.round(currentLoadProgress)));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    objectUrl=URL.createObjectURL(blob);
    result=await new Promise(resolve=>{
     let settled=false;
     const script=document.createElement('script');
     const finish=(ok,reason)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(!ok)script.remove();
      resolve({ok:!!ok,reason:reason||'unknown',url:resolved.href});
     };
     const timer=setTimeout(()=>finish(false,'tiempo agotado al compilar el motor 3D'),timeoutMs);
     script.async=false;script.fetchPriority='high';script.src=objectUrl;script.referrerPolicy='strict-origin-when-cross-origin';
     script.onload=()=>{let ok=false;try{ok=check?!!check():!!(window.BABYLON&&window.BABYLON.Engine);}catch(_){ok=false;}finish(ok,ok?'cargado':'script cargado pero API no disponible');};
     script.onerror=()=>finish(false,'no se pudo ejecutar el recurso local');
     try{document.head.appendChild(script);}catch(error){finish(false,error&&error.message?error.message:'no se pudo insertar el script');}
    });
    if(!result.ok&&result.reason!=='tiempo agotado al compilar el motor 3D'){
     result=await loadEngine(resolved.href,timeoutMs,check);
     source='same-origin-native-fallback';
    }
   }finally{clearTimeout(downloadTimer);}
  }catch(error){
   const reason=error&&error.name==='AbortError'?'tiempo agotado durante la descarga local':(error&&error.message?error.message:String(error));
   result=await loadEngine(resolved.href,timeoutMs,check);
   if(!result.ok)result.reason='stream local: '+reason+'; respaldo nativo: '+result.reason;
   source='same-origin-native-fallback';
  }finally{if(objectUrl)URL.revokeObjectURL(objectUrl);}
 }else{
  result=await loadEngine(resolved.href,timeoutMs,check);
 }
 let entry=null;
 try{
  const entries=performance.getEntriesByName(resolved.href,'resource');
  entry=entries.slice().reverse().find(item=>Number(item.startTime)>=started-1)||null;
 }catch(_){}
 const timingValue=key=>{const value=entry?Number(entry[key]):NaN;return Number.isFinite(value)?Number(value.toFixed(1)):null;};
 const transferSize=timingValue('transferSize'),encodedBodySize=timingValue('encodedBodySize'),decodedBodySize=timingValue('decodedBodySize');
 const cacheStatus=sameOrigin&&entry?(transferSize===0&&decodedBodySize>0?'cached':transferSize>0?'network':'unknown'):'unknown';
 const safeUrl=resolved.origin===location.origin?resolved.pathname:resolved.origin+resolved.pathname;
 const record={capturedAt:new Date().toISOString(),url:safeUrl,label:String(label||'Cargando recurso').slice(0,80),ok:!!(result&&result.ok),source,durationMs:Number((performance.now()-started).toFixed(1)),cacheStatus,transferSize,encodedBodySize,decodedBodySize,reason:result&&result.reason||''};
 const diagnostics=window.__ELSN_RUNTIME_SCRIPT_LOADS||(window.__ELSN_RUNTIME_SCRIPT_LOADS=[]);
 diagnostics.push(record);
 if(diagnostics.length>16)diagnostics.splice(0,diagnostics.length-16);
 window.__ELSN_RUNTIME_SCRIPT_LOADS_SNAPSHOT=()=>{const rows=Array.isArray(window.__ELSN_RUNTIME_SCRIPT_LOADS)?window.__ELSN_RUNTIME_SCRIPT_LOADS:[];return {count:rows.length,failed:rows.filter(row=>!row.ok).length,cached:rows.filter(row=>row.cacheStatus==='cached').length,network:rows.filter(row=>row.cacheStatus==='network').length,unknown:rows.filter(row=>row.cacheStatus==='unknown').length,slowest:rows.slice().sort((a,b)=>(b.durationMs||0)-(a.durationMs||0)).slice(0,5)};};
 if(result&&result.ok)setLoadingProgress(progressEnd,label+(cacheStatus==='cached'?' recuperado de caché.':' listo.'));
 return {...(result||{ok:false,reason:'fallo desconocido',url}),cached:cacheStatus==='cached',source:record.source,durationMs:record.durationMs,cacheStatus,transferSize,encodedBodySize,decodedBodySize};
}
"""
    html = html[:loader_start] + native_loader + html[loader_end:]
    html, mirror_timeout_count = re.subn(
        r"loadEngineWithCache\(url,7000,check,segmentStart,segmentEnd,label\)",
        "loadEngineWithCache(url,30000,check,segmentStart,segmentEnd,label)", html, count=1
    )
    if mirror_timeout_count != 1:
        raise SystemExit("No se pudo ampliar el plazo del cargador local de Babylon.")
    html, embedded_timeout_count = re.subn(
        r"loadEngine\(url,5500,check\)",
        "loadEngine(url,20000,check)", html, count=1
    )
    if embedded_timeout_count != 1:
        raise SystemExit("No se pudo ampliar el plazo del cargador en navegadores integrados.")

    # Full pre-entry resource contract: local fauna, strict imports and progress phases.
    wildlife_remote_root = " const WILDLIFE_ASSET_ROOT='https://raw.githubusercontent.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic/'+WILDLIFE_SOURCE_COMMIT+'/assets/Animated%20Animal%20Pack-glb/';"
    wildlife_local_root = " const WILDLIFE_ASSET_ROOT=new URL('./assets/models/wildlife/',document.baseURI).href;"
    if html.count(wildlife_remote_root) != 1:
        raise SystemExit("No se encontró la única fuente externa de los GLB de fauna.")
    html = html.replace(wildlife_remote_root, wildlife_local_root, 1)

    # Persist the three pinned animal GLBs independently of the Service Worker
    # control state on the very first visit. A later SW release preserves this bucket.
    wildlife_loader_marker = " async function downloadWildlifeBlob(kind){"
    wildlife_cache_code = """ const WILDLIFE_MODEL_CACHE='el-sin-nombre-models-wildlife-6d6de54a-v1';
 async function readWildlifeModelCache(kind){
  if(!window.caches||typeof window.caches.open!=='function')return null;
  const definition=WILDLIFE_MODEL_DEFS[kind];if(!definition)return null;
  const url=new URL(encodeURIComponent(definition.file),WILDLIFE_ASSET_ROOT).href;
  try{
   const cache=await window.caches.open(WILDLIFE_MODEL_CACHE),response=await cache.match(url);
   if(!response)return null;
   const blob=await response.blob();
   if(await isValidGLB(blob))return blob;
   await cache.delete(url);
   console.warn('Se eliminó una copia de fauna inválida:',kind);
  }catch(error){console.info('La caché persistente de fauna no está disponible; se descargará el GLB local:',error);}
  return null;
 }
 async function saveWildlifeModelCache(kind,blob){
  if(!window.caches||typeof window.caches.open!=='function')return false;
  const definition=WILDLIFE_MODEL_DEFS[kind];if(!definition)return false;
  const url=new URL(encodeURIComponent(definition.file),WILDLIFE_ASSET_ROOT).href;
  try{
   const cache=await window.caches.open(WILDLIFE_MODEL_CACHE);
   await cache.put(url,new Response(blob,{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'public, max-age=31536000'}}));
   return true;
  }catch(error){console.info('El GLB de fauna está listo para esta sesión, pero no pudo persistirse:',kind,error);return false;}
 }
"""
    if html.count(wildlife_loader_marker) != 1:
        raise SystemExit("No se encontró el cargador único de modelos animales para añadir Cache API.")
    html = html.replace(wildlife_loader_marker, wildlife_cache_code + wildlife_loader_marker, 1)

    animal_dimensions_marker = "const width=sourceBounds.max.x-sourceBounds.min.x,depth=sourceBounds.max.z-sourceBounds.min.z;"
    animal_silhouette_text = "Silueta animal anormalmente estrecha; se descarta para no mostrar extremidades sueltas."
    if html.count(animal_dimensions_marker) != 1 or html.count(animal_silhouette_text) != 1:
        raise SystemExit("No se encontró la única comprobación geométrica de fauna.")
    animal_dimensions_at = html.index(animal_dimensions_marker) + len(animal_dimensions_marker)
    animal_text_at = html.index(animal_silhouette_text, animal_dimensions_at)
    animal_check_end = html.index("');", animal_text_at) + 3
    animal_silhouette_replacement = "\n   const horizontalMin=Math.max(.055,sourceBounds.height*.045),horizontalMajor=Math.max(.18,sourceBounds.height*.14);\n   if(Math.min(width,depth)<horizontalMin||Math.max(width,depth)<horizontalMajor)throw new Error('Silueta animal degenerada; dimensiones X/Z '+width.toFixed(3)+'/'+depth.toFixed(3)+' m para altura '+sourceBounds.height.toFixed(3)+' m.');"
    html = html[:animal_dimensions_at] + animal_silhouette_replacement + html[animal_check_end:]

    wildlife_download_head = "  const definition=WILDLIFE_MODEL_DEFS[kind];if(!definition)throw new Error('Especie desconocida: '+kind);"
    wildlife_download_cached = wildlife_download_head + "\n  const cached=await readWildlifeModelCache(kind);if(cached)return cached;"
    if html.count(wildlife_download_head) != 1:
        raise SystemExit("No se encontró la cabecera de descarga de fauna.")
    html = html.replace(wildlife_download_head, wildlife_download_cached, 1)

    wildlife_blob_ready = "   if(!await isValidGLB(blob))throw new Error(kind+': archivo GLB no válido.');\n   return blob;"
    wildlife_blob_persist = "   if(!await isValidGLB(blob))throw new Error(kind+': archivo GLB no válido.');\n   await saveWildlifeModelCache(kind,blob);\n   return blob;"
    if html.count(wildlife_blob_ready) != 1:
        raise SystemExit("No se encontró el punto único para persistir cada GLB de fauna validado.")
    html = html.replace(wildlife_blob_ready, wildlife_blob_persist, 1)

    glb_validator_marker = " async function isValidGLB(blob){\n  if(!(blob instanceof Blob)||blob.size<500000)return false;\n  try{const bytes=await blob.slice(0,4).arrayBuffer();const magic=new Uint8Array(bytes);return magic.length===4&&magic[0]===0x67&&magic[1]===0x6c&&magic[2]===0x54&&magic[3]===0x46;}catch(_){return false;}\n }"
    glb_validator_required = r""" async function inspectGLBContainer(blob){
  if(!(blob instanceof Blob)||blob.size<500000)return null;
  try{
   const header=new DataView(await blob.slice(0,12).arrayBuffer());
   if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==blob.size)return null;
   let offset=12,chunkIndex=0,json=null,binBytes=0;
   while(offset<blob.size){
    if(offset+8>blob.size)return null;
    const chunkHeader=new DataView(await blob.slice(offset,offset+8).arrayBuffer());
    const chunkLength=chunkHeader.getUint32(0,true),chunkType=chunkHeader.getUint32(4,true);
    offset+=8;
    if(chunkLength%4!==0||chunkLength<=0||offset+chunkLength>blob.size)return null;
    if(chunkIndex===0){
     if(chunkType!==0x4e4f534a)return null;
     json=JSON.parse(await blob.slice(offset,offset+chunkLength).text());
    }else if(chunkType===0x004e4942)binBytes+=chunkLength;
    offset+=chunkLength;chunkIndex++;
   }
   if(offset!==blob.size||!json||json.asset?.version!=='2.0')return null;
   const meshes=json.meshes||[],nodes=json.nodes||[],skins=json.skins||[],animations=json.animations||[],accessors=json.accessors||[],views=json.bufferViews||[],buffers=json.buffers||[];
   if(!meshes.length||!nodes.length)return null;
   if(buffers.length>1||(buffers.length===1&&(buffers[0].uri||!Number.isFinite(buffers[0].byteLength)||buffers[0].byteLength>binBytes)))return null;
   for(const view of views){
    if(!Number.isInteger(view.buffer)||view.buffer<0||view.buffer>=Math.max(1,buffers.length))return null;
    const end=(Number(view.byteOffset)||0)+(Number(view.byteLength)||0);
    if(!Number.isFinite(end)||end<0||(buffers.length&&end>buffers[view.buffer].byteLength))return null;
   }
   for(const accessor of accessors){
    if(accessor.bufferView!==undefined&&(!Number.isInteger(accessor.bufferView)||accessor.bufferView<0||accessor.bufferView>=views.length))return null;
    if(!Number.isFinite(accessor.count)||accessor.count<=0)return null;
   }
   for(const node of nodes){
    if(node.mesh!==undefined&&(!Number.isInteger(node.mesh)||node.mesh<0||node.mesh>=meshes.length))return null;
    if(node.skin!==undefined&&(!Number.isInteger(node.skin)||node.skin<0||node.skin>=skins.length))return null;
   }
   for(const skin of skins){
    if(!Array.isArray(skin.joints)||skin.joints.length<1||skin.joints.some(j=>!Number.isInteger(j)||j<0||j>=nodes.length))return null;
   }
   for(const mesh of meshes){
    if(!Array.isArray(mesh.primitives)||!mesh.primitives.length)return null;
    for(const primitive of mesh.primitives){
     if(!primitive.attributes||!Number.isInteger(primitive.attributes.POSITION)||primitive.attributes.POSITION<0||primitive.attributes.POSITION>=accessors.length)return null;
     if(primitive.indices!==undefined&&(!Number.isInteger(primitive.indices)||primitive.indices<0||primitive.indices>=accessors.length))return null;
    }
   }
   return {json,binBytes};
  }catch(_){return null;}
 }
 async function isValidGLB(blob){return !!(await inspectGLBContainer(blob));}
 async function waitForAnimalTextures(meshes,kind,timeoutMs=25000){
  const textures=new Set();
  for(const mesh of meshes||[]){
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials)if(material&&typeof material.getActiveTextures==='function'){
    for(const texture of material.getActiveTextures()||[])if(texture)textures.add(texture);
   }
  }
  const pending=Array.from(textures).filter(texture=>typeof texture.isReady==='function'&&!texture.isReady());
  if(!pending.length)return {count:textures.size,waitedMs:0};
  const started=performance.now();
  await new Promise((resolve,reject)=>{
   let settled=false,timer=null;
   const finish=error=>{if(settled)return;settled=true;if(timer!==null)clearTimeout(timer);if(error)reject(error);else resolve();};
   const check=()=>{
    if(pending.every(texture=>typeof texture.isReady!=='function'||texture.isReady()))return finish(null);
    if(performance.now()-started>=timeoutMs)return finish(new Error(kind+' dejó texturas sin preparar tras '+timeoutMs+' ms.'));
    requestAnimationFrame(check);
   };
   timer=setTimeout(()=>finish(new Error(kind+' agotó la espera de texturas tras '+timeoutMs+' ms.')),timeoutMs+250);
   check();
  });
  return {count:textures.size,waitedMs:Number((performance.now()-started).toFixed(1))};
 }"""
    if html.count(glb_validator_marker) != 1:
        raise SystemExit("No se encontró el validador GLB único.")
    html = html.replace(glb_validator_marker, glb_validator_required, 1)

    animal_count_marker = "const animalCount=isPerformanceMode?0:(idx===0?3:0);"
    animal_count_required = "const animalCount=idx===0?3:0;"
    if html.count(animal_count_marker) != 1:
        raise SystemExit("No se encontró el control único de población animal por perfil.")
    html = html.replace(animal_count_marker, animal_count_required, 1)

    wildlife_import_snapshot_marker = "  let imported=null,objectUrl=null,actor=null;\n  try{\n   // Import each GLB independently into the live scene; never clone a skinned mesh/skeleton.\n   objectUrl=URL.createObjectURL(blob);"
    wildlife_import_snapshot_marker_replacement = "  let imported=null,objectUrl=null,actor=null;\n  const beforeMeshes=new Set(scene.meshes||[]),beforeNodes=new Set(scene.transformNodes||[]),beforeSkeletons=new Set(scene.skeletons||[]),beforeGroups=new Set(scene.animationGroups||[]);\n  try{\n   const glbRecord=await inspectGLBContainer(blob),sourceJson=glbRecord&&glbRecord.json;\n   if(!sourceJson||!(sourceJson.skins||[]).some(skin=>Array.isArray(skin.joints)&&skin.joints.length>=12)||!(sourceJson.animations||[]).some(animation=>Array.isArray(animation.channels)&&animation.channels.length>0&&Array.isArray(animation.samplers)&&animation.samplers.length>0)||!(sourceJson.nodes||[]).some(node=>Number.isInteger(node.mesh)&&Number.isInteger(node.skin)))throw new Error(kind+': el GLB no contiene un cuerpo riggeado y clips de animación completos.');\n   objectUrl=URL.createObjectURL(blob);"
    if html.count(wildlife_import_snapshot_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_import_snapshot_marker.")
    html = html.replace(wildlife_import_snapshot_marker, wildlife_import_snapshot_marker_replacement, 1)

    wildlife_mesh_texture_marker = "   const meshes=getRootMeshes(roots).filter(mesh=>mesh.getTotalVertices()>0);\n   if(!meshes.length)throw new Error('GLB sin malla visible.');"
    wildlife_mesh_texture_marker_replacement = "   const meshes=getRootMeshes(roots).filter(mesh=>mesh.getTotalVertices()>0);\n   if(!meshes.length)throw new Error('GLB sin malla visible.');\n   const textureReadiness=await waitForAnimalTextures(meshes,kind);"
    if html.count(wildlife_mesh_texture_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_mesh_texture_marker.")
    html = html.replace(wildlife_mesh_texture_marker, wildlife_mesh_texture_marker_replacement, 1)

    wildlife_animation_marker = "   const groups=imported.animationGroups||[],clips=chooseWildlifeClips(groups);"
    wildlife_animation_marker_replacement = "   const groups=imported.animationGroups||[],clips=chooseWildlifeClips(groups);\n   if(!groups.some(group=>group&&group.targetedAnimations&&group.targetedAnimations.length>0)||!clips.idle||!clips.walk||!clips.run)throw new Error(kind+': el rig llegó sin animaciones reproducibles completas.');"
    if html.count(wildlife_animation_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_animation_marker.")
    html = html.replace(wildlife_animation_marker, wildlife_animation_marker_replacement, 1)

    wildlife_cleanup_marker = "   if(imported){try{(imported.animationGroups||[]).forEach(group=>group.stop());(imported.skeletons||[]).forEach(skeleton=>skeleton.dispose());(imported.meshes||[]).forEach(mesh=>mesh.dispose(false,true));(imported.transformNodes||[]).forEach(node=>node.dispose(false,true));}catch(_){}}"
    wildlife_cleanup_marker_replacement = "   const partialGroups=Array.from(scene.animationGroups||[]).filter(group=>!beforeGroups.has(group));partialGroups.forEach(group=>{try{group.stop();group.dispose();}catch(_){}}); \n   const partialMeshes=Array.from(scene.meshes||[]).filter(mesh=>!beforeMeshes.has(mesh));partialMeshes.forEach(mesh=>{try{if(!(mesh.isDisposed&&mesh.isDisposed()))mesh.dispose(false,true);}catch(_){}}); \n   const partialNodes=Array.from(scene.transformNodes||[]).filter(node=>!beforeNodes.has(node));partialNodes.forEach(node=>{try{if(!(node.isDisposed&&node.isDisposed()))node.dispose(false,true);}catch(_){}}); \n   const partialSkeletons=Array.from(scene.skeletons||[]).filter(skeleton=>!beforeSkeletons.has(skeleton));partialSkeletons.forEach(skeleton=>{try{skeleton.dispose();}catch(_){}});"
    if html.count(wildlife_cleanup_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_cleanup_marker.")
    html = html.replace(wildlife_cleanup_marker, wildlife_cleanup_marker_replacement, 1)

    wildlife_empty = "  if(!wildlifeSpawnSpecs.length)return 0;"
    wildlife_required = "  if(wildlifeSpawnSpecs.length!==3)throw new Error('RECURSO OBLIGATORIO: fauna inicial incompleta; se esperaban 3 animales y se encontraron '+wildlifeSpawnSpecs.length+'.');"
    if html.count(wildlife_empty) != 1:
        raise SystemExit("No se encontró la comprobación de fauna inicial vacía.")
    html = html.replace(wildlife_empty, wildlife_required, 1)

    wildlife_download = "  await Promise.all(kinds.map(async kind=>{try{wildlifeBlobs.set(kind,await downloadWildlifeBlob(kind));}catch(err){console.warn('Modelo animal no disponible ('+kind+'):',err);}}));"
    wildlife_download_required = "  const wildlifeDownloads=await Promise.all(kinds.map(async kind=>({kind,blob:await downloadWildlifeBlob(kind)})));wildlifeDownloads.forEach(({kind,blob})=>wildlifeBlobs.set(kind,blob));"
    if html.count(wildlife_download) != 1:
        raise SystemExit("No se encontró la descarga paralela de modelos de fauna.")
    html = html.replace(wildlife_download, wildlife_download_required, 1)

    wildlife_ground = "if(!homeIsland||!isSafeIslandGroundPoint(homeIsland,x,z,Infinity,1.05,.52))return null;"
    wildlife_ground_required = "if(!homeIsland)throw new Error('La isla de destino de '+kind+' no existe.');if(!isSafeIslandGroundPoint(homeIsland,x,z,Infinity,1.05,.52))throw new Error('No hay un punto de apoyo válido para '+kind+' en la isla inicial.');"
    if html.count(wildlife_ground) != 1:
        raise SystemExit("No se encontró la validación del punto de apoyo de fauna.")
    html = html.replace(wildlife_ground, wildlife_ground_required, 1)

    wildlife_import_failure = "   console.warn('Fauna descartada: importación GLB incompleta ('+kind+')',err);\n   if(/agotó el plazo/i.test(String(err&&err.message||err)))throw err;\n   return null;"
    wildlife_import_required = "   console.error('Falló la importación de fauna obligatoria ('+kind+'):',err);\n   throw new Error('RECURSO OBLIGATORIO: fauna '+kind+' · '+String(err&&err.message||err));"
    if html.count(wildlife_import_failure) != 1:
        raise SystemExit("No se encontró el fallback que ocultaba los fallos de importación animal.")
    html = html.replace(wildlife_import_failure, wildlife_import_required, 1)

    wildlife_instance = "   if(animal){ambientFauna.push(animal);loaded++;}\n   recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),animal?'ready':'fallback',{island:spec.homeIslandIndex});"
    wildlife_instance_required = "   if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');\n   ambientFauna.push(animal);loaded++;\n   recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),'ready',{island:spec.homeIslandIndex});"
    if html.count(wildlife_instance) != 1:
        raise SystemExit("No se encontró el montaje individual de fauna.")
    html = html.replace(wildlife_instance, wildlife_instance_required, 1)

    wildlife_completion = "  recordStartupTask('Fauna GLB · cola completa',wildlifeLoadStarted,performance.now(),'complete',{loaded,requested:wildlifeSpawnSpecs.length});"
    wildlife_complete_required = "  if(loaded!==wildlifeSpawnSpecs.length)throw new Error('RECURSO OBLIGATORIO: fauna incompleta '+loaded+'/'+wildlifeSpawnSpecs.length+'.');\n"+wildlife_completion
    if html.count(wildlife_completion) != 1:
        raise SystemExit("No se encontró el cierre de la cola de fauna.")
    html = html.replace(wildlife_completion, wildlife_complete_required, 1)

    # Each of the five quality-profile gulls must be instantiated before the shader pass.
    gull_success = "  if(realBirds.length){ambientBirds.forEach(b=>{if(b.procedural)b.root.setEnabled(false);});ambientBirds.splice(0,ambientBirds.length,...realBirds);"
    gull_success_required = "  if(realBirds.length===5){ambientBirds.forEach(b=>{if(b.procedural)b.root.setEnabled(false);});ambientBirds.splice(0,ambientBirds.length,...realBirds);"
    if html.count(gull_success) != 1:
        raise SystemExit("No se encontró el reemplazo de gaviotas provisionales por GLB.")
    html = html.replace(gull_success, gull_success_required, 1)
    gull_size_marker = "if(!(blob&&blob.size>100000))throw new Error('GLB de gaviota vacío o incompleto');"
    if html.count(gull_size_marker) != 1:
        raise SystemExit("No se encontró el umbral mínimo del GLB de gaviota.")
    html = html.replace(gull_size_marker, "if(!(blob&&blob.size>50000))throw new Error('GLB de gaviota vacío o incompleto');", 1)
    gull_root_marker = "const actor=new B.TransformNode('RealSeagullActor_'+i,scene);roots.forEach(r=>{r.parent=actor;r.setEnabled(true);});"
    gull_root_replacement = "const actor=new B.TransformNode('RealSeagullActor_'+i,scene),visualRoot=new B.TransformNode('GullVisualCenter_'+i,scene);visualRoot.parent=actor;roots.forEach(r=>{r.parent=visualRoot;r.setEnabled(true);});"
    if html.count(gull_root_marker) != 1:
        raise SystemExit("No se encontró la única raíz de las gaviotas GLB.")
    html = html.replace(gull_root_marker,gull_root_replacement,1)

    gull_rig_marker = "const meshes=getRootMeshes(roots);if(!meshes.length){actor.dispose(false,true);continue;}"
    gull_rig_replacement = gull_rig_marker + "const rigNodes=[...roots];for(let cursor=0;cursor<rigNodes.length;cursor++){const children=typeof rigNodes[cursor].getChildren==='function'?rigNodes[cursor].getChildren():[];for(const child of children)rigNodes.push(child);}const leftWing=rigNodes.find(node=>/^LeftWing(?:_|$)/i.test(node.name||'')),rightWing=rigNodes.find(node=>/^RightWing(?:_|$)/i.test(node.name||'')),tail=rigNodes.find(node=>/^Tail(?:_|$)/i.test(node.name||''));if(!leftWing||!rightWing){actor.dispose(false,true);throw new Error('El modelo de gaviota no incluye pivotes anatómicos LeftWing y RightWing.');}[leftWing,rightWing,tail].forEach(node=>{if(node&&node.rotationQuaternion){node.rotation.copyFrom(node.rotationQuaternion.toEulerAngles());node.rotationQuaternion=null;}});leftWing.computeWorldMatrix(true);rightWing.computeWorldMatrix(true);const leftWingWorld=leftWing.getAbsolutePosition(),rightWingWorld=rightWing.getAbsolutePosition(),wingSpanX=Math.abs(leftWingWorld.x-rightWingWorld.x),wingSpanZ=Math.abs(leftWingWorld.z-rightWingWorld.z),wingFlapAxis=wingSpanX>=wingSpanZ?'z':'x';"
    if html.count(gull_rig_marker) != 1:
        raise SystemExit("No se encontró el punto único para validar los pivotes anatómicos de gaviota.")
    html = html.replace(gull_rig_marker, gull_rig_replacement, 1)

    gull_partial = "else throw new Error('El GLB se importó sin mallas instanciables');"
    gull_partial_required = "else throw new Error('El GLB solo permitió preparar '+realBirds.length+'/5 gaviotas completas.');"
    if html.count(gull_partial) != 1:
        raise SystemExit("No se encontró la comprobación de mallas del GLB de gaviota.")
    html = html.replace(gull_partial, gull_partial_required, 1)
    # Normalize gulls by the largest 3D model extent so rotated GLB axes cannot inflate the flock.
    # The target wingspan is biological in-world scale, independent of the source model's up-axis.
    gull_scale_marker = "const bounds=boundsForMeshes(meshes),height=Math.max(.001,bounds.height),scale=1.65/height;actor.scaling.setAll(scale);actor.position=v(-36,10+i%3*1.4-bounds.min.y*scale,-18);"
    gull_scale_replacement = "const sourceBounds=boundsForMeshes(meshes),sourceWidth=sourceBounds.max.x-sourceBounds.min.x,sourceHeight=sourceBounds.max.y-sourceBounds.min.y,sourceDepth=sourceBounds.max.z-sourceBounds.min.z,sourceMaxExtent=Math.max(sourceWidth,sourceHeight,sourceDepth),targetGullMaxExtentMeters=.55;if(!Number.isFinite(sourceMaxExtent)||sourceMaxExtent<.10)throw new Error('Dimensiones físicas de gaviota inválidas: '+sourceMaxExtent);const sourceCenter=new B.Vector3((sourceBounds.min.x+sourceBounds.max.x)*.5,(sourceBounds.min.y+sourceBounds.max.y)*.5,(sourceBounds.min.z+sourceBounds.max.z)*.5),scale=targetGullMaxExtentMeters/sourceMaxExtent;if(!Number.isFinite(scale)||scale<=0||scale>12)throw new Error('Factor de escala de gaviota fuera de rango: '+scale);visualRoot.position.copyFrom(sourceCenter.scale(-1));actor.scaling.setAll(scale);actor.computeWorldMatrix(true);visualRoot.computeWorldMatrix(true);meshes.forEach(mesh=>mesh.computeWorldMatrix(true));const fittedBounds=boundsForMeshes(meshes),fittedWidth=fittedBounds.max.x-fittedBounds.min.x,fittedHeight=fittedBounds.max.y-fittedBounds.min.y,fittedDepth=fittedBounds.max.z-fittedBounds.min.z,fittedMaxExtent=Math.max(fittedWidth,fittedHeight,fittedDepth);if(!Number.isFinite(fittedMaxExtent)||fittedMaxExtent>.57)throw new Error('La gaviota supera el límite físico de 0,57 m: '+fittedMaxExtent.toFixed(3));actor.position=v(-36,10+i%3*1.4,-18);actor.metadata=Object.assign({},actor.metadata||{},{biologicalScale:{source:{width:sourceWidth,height:sourceHeight,depth:sourceDepth},rendered:{width:fittedWidth,height:fittedHeight,depth:fittedDepth},maximumExtentMeters:fittedMaxExtent}});"
    if html.count(gull_scale_marker) != 1:
        raise SystemExit("No se encontró la única escala incorrecta de gaviotas basada en altura.")
    html = html.replace(gull_scale_marker, gull_scale_replacement, 1)

    # Preserve the Polyfork model's native single material and colours.
    # Remove only the legacy subdued tint block; retain bounds, transforms and flight setup.
    gull_material_registry_marker = "const realBirds=[];"
    gull_material_registry_replacement = "    const realBirds=[];"
    if html.count(gull_material_registry_marker) != 1:
        raise SystemExit("No se encontró el registro único de instancias de gaviota.")
    html = html.replace(gull_material_registry_marker, gull_material_registry_replacement, 1)
    gull_material_style_start = "const subduedMaterials=new Set();"
    gull_material_style_end = "const sourceBounds=boundsForMeshes(meshes)"
    style_anchor = html.find(gull_rig_replacement)
    style_start = html.find(gull_material_style_start, style_anchor)
    style_end = html.find(gull_material_style_end, style_start)
    if style_anchor < 0 or style_start < 0 or style_end <= style_start:
        raise SystemExit(
            "No se pudo aislar el tinte artificial de la gaviota: "
            f"anchor={style_anchor}, styleStart={style_start}, styleEnd={style_end}."
        )
    html = html[:style_start] + html[style_end:]

    gull_wing_push_marker = "realBirds.push({root:actor,real:true,groups,animation:fly,phase:i*1.25,radius:18+i*2.5,alt:10+i%3*1.45,speed:.064+i*.006});"
    gull_wing_push_replacement = "realBirds.push({root:actor,real:true,groups,animation:fly,leftWing,rightWing,tail,wingFlapAxis,leftWingBaseRotation:leftWing.rotation[wingFlapAxis],rightWingBaseRotation:rightWing.rotation[wingFlapAxis],tailBaseRotation:tail?tail.rotation.x:0,phase:i*1.25,radius:18+i*2.5,alt:10+i%3*1.45,speed:.064+i*.006});"
    if html.count(gull_wing_push_marker) != 1:
        raise SystemExit("No se encontró el registro único de las articulaciones de gaviota.")
    html = html.replace(gull_wing_push_marker, gull_wing_push_replacement, 1)

    gull_flight_marker = "if(b.procedural){b.left.rotation.z=-.10-Math.sin(elapsed*7+b.phase)*.34;b.right.rotation.z=.10+Math.sin(elapsed*7+b.phase)*.34;}else if(b.animation)b.animation.speedRatio=.90+.18*Math.sin(elapsed*1.5+b.phase);"
    gull_flight_replacement = "if(b.procedural){b.left.rotation.z=-.10-Math.sin(elapsed*7+b.phase)*.34;b.right.rotation.z=.10+Math.sin(elapsed*7+b.phase)*.34;}else if(b.leftWing&&b.rightWing){const flap=Math.sin(elapsed*7.2+b.phase)*.58;b.leftWing.rotation[b.wingFlapAxis]=b.leftWingBaseRotation-flap;b.rightWing.rotation[b.wingFlapAxis]=b.rightWingBaseRotation+flap;if(b.tail)b.tail.rotation.x=b.tailBaseRotation+Math.sin(elapsed*2.1+b.phase)*.035;}else if(b.animation)b.animation.speedRatio=.90+.18*Math.sin(elapsed*1.5+b.phase);"
    if html.count(gull_flight_marker) != 1:
        raise SystemExit("No se encontró el bucle único de vuelo de las gaviotas.")
    html = html.replace(gull_flight_marker, gull_flight_replacement, 1)

    # Move expensive terrestrial-fauna decisions and collision/terrain validation to
    # a distance-aware cadence. Root motion is still integrated on every frame, while
    # the skinned animation groups keep running at the render rate.
    wildlife_update_marker = "function updateWildlife(dt){"
    wildlife_update_end_marker = " // 0.6.195: la cubierta vegetal queda despejada de caminos y campamentos."
    wildlife_update_replacement = """const wildlifeUpdatePerfSamples=new Float32Array(120);let wildlifeUpdatePerfCursor=0,wildlifeUpdatePerfCount=0,wildlifeUpdatePerfLastMs=0,wildlifeUpdatePerfMaxMs=0,wildlifeUpdatePerfTicks=0;
function wildlifeUpdatePerfSnapshot(){
 const values=[];for(let i=0;i<wildlifeUpdatePerfCount;i++)values.push(wildlifeUpdatePerfSamples[i]);values.sort((a,b)=>a-b);
 const at=p=>values.length?Number(values[Math.min(values.length-1,Math.floor((values.length-1)*p))].toFixed(3)):null;
 const byKind={deer:0,stag:0,wolf:0};for(const animal of ambientFauna)if(byKind[animal.kind]!==undefined)byKind[animal.kind]++;
 return {samples:wildlifeUpdatePerfCount,ticks:wildlifeUpdatePerfTicks,lastMs:wildlifeUpdatePerfLastMs,p50Ms:at(.50),p95Ms:at(.95),p99Ms:at(.99),maxMs:Number(wildlifeUpdatePerfMaxMs.toFixed(3)),requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length,byKind,complete:ambientFauna.length===wildlifeSpawnSpecs.length};
}
window.__ELSN_WILDLIFE_DIAGNOSTICS__=Object.freeze({getSnapshot:wildlifeUpdatePerfSnapshot});
function updateWildlife(dt){
   const wildlifeStarted=performance.now();
   if(!ambientFauna.length){
    const cost=performance.now()-wildlifeStarted;wildlifeUpdatePerfSamples[wildlifeUpdatePerfCursor]=cost;wildlifeUpdatePerfCursor=(wildlifeUpdatePerfCursor+1)%wildlifeUpdatePerfSamples.length;wildlifeUpdatePerfCount=Math.min(wildlifeUpdatePerfSamples.length,wildlifeUpdatePerfCount+1);wildlifeUpdatePerfLastMs=Number(cost.toFixed(3));wildlifeUpdatePerfMaxMs=Math.max(wildlifeUpdatePerfMaxMs,cost);wildlifeUpdatePerfTicks++;return;
   }
   const focus=onShip?ship.position:player.root.position,now=elapsed;
   const frameDt=Math.max(0,Math.min(.08,Number(dt)||0));
   for(const animal of ambientFauna){
    const homeIsland=land[animal.homeIslandIndex],root=animal.root;
    if(!homeIsland||!root)continue;
    const nextDecision=Number(animal._wildlifeNextDecisionAt)||0;
    if(now>=nextDecision){
     const lastDecision=Number(animal._wildlifeLastDecisionAt);
     const decisionDt=Number.isFinite(lastDecision)?Math.max(.016,Math.min(.25,now-lastDecision)):.05;
     const dx=focus.x-root.position.x,dz=focus.z-root.position.z,distanceSquared=dx*dx+dz*dz,dist=Math.sqrt(distanceSquared);
     const near=distanceSquared<4900,mid=distanceSquared<22500;
     const decisionInterval=isTouchDevice
      ?(isPerformanceMode?(near?.10:(mid?.18:.32)):(near?.05:(mid?.10:.20)))
      :(near?(1/30):(mid?.075:.15));
     animal._wildlifeLastDecisionAt=now;
     animal._wildlifeNextDecisionAt=now+decisionInterval;
     animal.flee=dist<14?Math.max(animal.flee,3.2):Math.max(0,animal.flee-decisionDt);
     if(animal.flee>0&&dist>.01)animal.heading=Math.atan2(-dx,-dz);
     else{
      animal.turnTimer-=decisionDt;animal.wanderTimer-=decisionDt;
      if(animal.turnTimer<=0){animal.turnTimer=rand(2.5,6.5);animal.heading+=rand(-.72,.72);}
      if(animal.wanderTimer<=0){animal.wanderTimer=rand(2,5.5);animal.wandering=Math.random()<.58;}
     }
     if(dist>(isTouchDevice?115:165)){
      if(animal.activeAnimation){(animal.groups||[]).forEach(group=>{try{group.stop();}catch(_){}});animal.activeAnimation=null;animal.activeMode='distance-idle';}
      animal._wildlifeVelocityX=0;animal._wildlifeVelocityZ=0;
     }else{
      const moving=animal.flee>0||animal.wandering;
      const speed=animal.flee>0?WILDLIFE_MODEL_DEFS[animal.kind].runSpeed:WILDLIFE_MODEL_DEFS[animal.kind].walkSpeed;
      playWildlifeAnimation(animal,animal.flee>0?'run':(moving?'walk':'idle'));
      if(moving){
       const moveWindow=Math.max(decisionInterval,decisionDt),step=speed*moveWindow;
       const nx=root.position.x+Math.sin(animal.heading)*step,nz=root.position.z+Math.cos(animal.heading)*step;
       if(isSafeIslandGroundPoint(homeIsland,nx,nz,Infinity,1.05,.52)&&canWildlifeMove(nx,nz,animal.collisionRadius)){
        animal._wildlifeVelocityX=Math.sin(animal.heading)*speed;
        animal._wildlifeVelocityZ=Math.cos(animal.heading)*speed;
       }else{
        animal.heading+=Math.PI*rand(.55,1.45);animal.turnTimer=.35;animal.wanderTimer=.45;
        animal._wildlifeVelocityX=0;animal._wildlifeVelocityZ=0;
       }
      }else{
       animal._wildlifeVelocityX=0;animal._wildlifeVelocityZ=0;
      }
     }
     root.rotation.y=animal.heading;
     root.position.y=terrainHeightOnIsland(homeIsland,root.position.x,root.position.z)+animal.groundOffset;
    }
    const vx=Number(animal._wildlifeVelocityX)||0,vz=Number(animal._wildlifeVelocityZ)||0;
    if(vx||vz){root.position.x+=vx*frameDt;root.position.z+=vz*frameDt;}
    root.rotation.y=animal.heading;
   }
   const wildlifeCost=performance.now()-wildlifeStarted;
   wildlifeUpdatePerfSamples[wildlifeUpdatePerfCursor]=wildlifeCost;
   wildlifeUpdatePerfCursor=(wildlifeUpdatePerfCursor+1)%wildlifeUpdatePerfSamples.length;
   wildlifeUpdatePerfCount=Math.min(wildlifeUpdatePerfSamples.length,wildlifeUpdatePerfCount+1);
   wildlifeUpdatePerfLastMs=Number(wildlifeCost.toFixed(3));
   wildlifeUpdatePerfMaxMs=Math.max(wildlifeUpdatePerfMaxMs,wildlifeCost);
   wildlifeUpdatePerfTicks++;
  }"""
    if html.count(wildlife_update_marker) != 1 or html.count(wildlife_update_end_marker) != 1:
        raise SystemExit("No se encontró un bloque único de actualización de fauna para limitar sus decisiones.")
    wildlife_start = html.index(wildlife_update_marker)
    wildlife_end = html.index(wildlife_update_end_marker, wildlife_start)
    if not html[wildlife_start:wildlife_end].rstrip().endswith("}"):
        raise SystemExit("El bloque original de fauna no termina con una llave de cierre válida.")
    html = html[:wildlife_start] + wildlife_update_replacement + "\n " + html[wildlife_end:]

    gull_optional_catch = "}catch(err){console.warn('Fauna opcional: gaviotas GLB no disponibles antes de entrar:',err);if(/agotó el plazo/i.test(String(err&&err.message||err)))throw err;}"
    gull_required_catch = "}catch(err){console.error('Falló la fauna alada obligatoria:',err);throw new Error('RECURSO OBLIGATORIO: gaviotas GLB · '+String(err&&err.message||err));}"
    if html.count(gull_optional_catch) != 1:
        raise SystemExit("No se encontró el fallback opcional de gaviotas.")
    html = html.replace(gull_optional_catch, gull_required_catch, 1)

    # Make loader percentages reflect the actual ordered stages rather than jumping backwards.
    for old, new, label in (
        ("setLoadingProgress(94,'Cargando fauna salvaje 3D…');", "setLoadingProgress(88,'Cargando fauna salvaje 3D…');", "inicio de fauna"),
        ("setLoadingProgress(96,loaded?'Fauna nórdica preparada.':'Se conserva la reserva de fauna; no se importó ningún cuerpo animal completo.');", "setLoadingProgress(90,'Fauna terrestre preparada.');", "fin de fauna terrestre"),
        ("responseBlobWithProgress(response,'Cargando modelo animal · '+kind.toUpperCase(),68,70)", "responseBlobWithProgress(response,'Cargando modelo animal · '+kind.toUpperCase(),88,90)", "progreso de fauna terrestre"),
        ("responseBlobWithProgress(response,'Cargando fauna alada · gaviotas',68,70)", "responseBlobWithProgress(response,'Cargando fauna alada · gaviotas',90,92)", "progreso de gaviotas"),
    ):
        if html.count(old) != 1:
            raise SystemExit("No se encontró exactamente una actualización de progreso: "+label)
        html = html.replace(old, new, 1)

    # Move fauna imports ahead of the final shader/texture readiness barrier so every
    # loaded animal and gull material is included in Babylon's initial-view warm-up.
    fauna_start_marker = " if(!coastalReferenceMode){\n  const faunaStartedAt=performance.now();\n  const faunaTasks=[{name:'Fauna terrestre',promise:loadWildlifeModels()}];"
    fauna_end_marker = "\n const startupMemoryTextures=new Set(),startupMemoryGeometry=new Set();"
    fauna_scene_marker = " let sceneWarmupStatus='unavailable';"
    if html.count(fauna_start_marker) != 1 or html.count(fauna_end_marker) != 1 or html.count(fauna_scene_marker) != 1:
        raise SystemExit("No se encontró un único bloque de fauna/escena para ordenar el arranque.")
    fauna_start = html.index(fauna_start_marker)
    fauna_end = html.index(fauna_end_marker, fauna_start)
    fauna_block = html[fauna_start:fauna_end]
    html = html[:fauna_start] + html[fauna_end:]
    scene_marker_index = html.index(fauna_scene_marker)
    ordered_fauna = " setLoadingProgress(87,coastalReferenceMode?'Preparando la referencia costera…':'Preparando fauna de la isla inicial…');\n" + fauna_block + "\n setLoadingProgress(93,coastalReferenceMode?'Preparando shaders de costa…':'Preparando texturas y shaders de la zona inicial…');\n"
    html = html[:scene_marker_index] + ordered_fauna + html[scene_marker_index:]

    # Quality fauna is a required startup dependency; Performance intentionally retains
    # its existing fauna-disabled profile and its existing rendering/resource choices.
    optional_fauna_state = "fauna:isPerformanceMode?'disabled-performance':'blocking-optional'"
    required_fauna_state = "fauna:'blocking-required'"
    if html.count(optional_fauna_state) != 1:
        raise SystemExit("No se encontró el estado de fauna opcional en el registro de arranque.")
    html = html.replace(optional_fauna_state, required_fauna_state, 1)
    fauna_result = "recordStartupTask('Fauna de la isla inicial',faunaStartedAt,performance.now(),faunaFailures.length?'optional-failed':'ready',{loaded:ambientFauna.length,gulls:ambientBirds.filter(b=>b.real).length,failures:faunaFailures});"
    fauna_result_required = "recordStartupTask('Fauna de la isla inicial',faunaStartedAt,performance.now(),faunaFailures.length?'required-failed':'ready',{loaded:ambientFauna.length,requested:wildlifeSpawnSpecs.length,gulls:ambientBirds.filter(b=>b.real).length,requiredGulls:5,failures:faunaFailures});"
    if html.count(fauna_result) != 1:
        raise SystemExit("No se encontró el resumen de la carga de fauna.")
    html = html.replace(fauna_result, fauna_result_required, 1)
    fauna_warning = "if(faunaFailures.length)console.warn('La fauna opcional terminó con fallos antes de liberar la entrada; no quedan importaciones en segundo plano:',faunaFailures);"
    fauna_blocking_failure = "if(faunaFailures.length){if(window.__elSinNombreBackgroundModelTasks)window.__elSinNombreBackgroundModelTasks.fauna='required-failed';throw new Error('RECURSO OBLIGATORIO: fauna de la isla inicial · '+faunaFailures.map(item=>item.name+': '+item.message).join(' | '));}"
    if html.count(fauna_warning) != 1:
        raise SystemExit("No se encontró el punto donde se ignoraban los fallos de fauna.")
    html = html.replace(fauna_warning, fauna_blocking_failure, 1)
    late_shader_progress = " setLoadingProgress(97,coastalReferenceMode?'Preparando shaders y texturas de costa…':'Preparando shaders y texturas principales…');"
    if html.count(late_shader_progress) != 1:
        raise SystemExit("No se encontró la fase antigua de shaders anterior a la fauna.")
    html = html.replace(late_shader_progress, "", 1)
 
    # The two soundtracks remain native HTMLAudio streams. Wait for media readiness
    # before entry, without decoding full MP3 tracks into WebAudio AudioBuffers.
    audio_helper_anchor = " const MenuMusic=(()=>{"
    audio_helper = """ function waitForPlayableAudio(track,label,timeoutMs=45000){
  if(!track||typeof track.load!=='function')return Promise.reject(new Error('No existe el reproductor de '+label+'.'));
  track.preload='auto';
  if(track.readyState>=2&&!track.error)return Promise.resolve({label,ready:true,readyState:track.readyState});
  return new Promise((resolve,reject)=>{
   let settled=false,timer=null;
   const cleanup=()=>{if(timer!==null)clearTimeout(timer);track.removeEventListener('loadeddata',onReady);track.removeEventListener('canplay',onReady);track.removeEventListener('error',onError);};
   const finish=error=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve({label,ready:true,readyState:track.readyState});};
   const onReady=()=>{if(track.readyState>=2&&!track.error)finish(null);};
   const onError=()=>finish(new Error('No se pudo preparar '+label+' desde el paquete local.'));
   track.addEventListener('loadeddata',onReady);track.addEventListener('canplay',onReady);track.addEventListener('error',onError);
   timer=setTimeout(()=>finish(new Error(label+' no alcanzó estado reproducible en '+timeoutMs+' ms.')),timeoutMs);
   try{track.load();onReady();}catch(error){finish(error);}
  });
 }
"""
    if html.count(audio_helper_anchor) != 1:
        raise SystemExit("No se encontró la inicialización única de la música de menú.")
    html = html.replace(audio_helper_anchor, audio_helper + audio_helper_anchor, 1)

    if html.count("preflightMenuMusic.preload='none';") != 1:
        raise SystemExit("No se encontró la precarga de música de preflight.")
    html = html.replace("preflightMenuMusic.preload='none';", "preflightMenuMusic.preload='auto';", 1)
    music_audio_marker = "audio=new Audio();audio.preload='none';audio.src=SOURCE;"
    if html.count(music_audio_marker) != 2:
        raise SystemExit("No se encontraron exactamente los dos reproductores de música.")
    html = html.replace(music_audio_marker, "audio=new Audio();audio.preload='auto';audio.src=SOURCE;", 2)

    menu_music_return = "  return {start,stop,setMuted};\n })();\n // Solicita la música desde el arranque, mientras carga el mundo;"
    menu_music_required = "  return {start,stop,setMuted,preload:()=>waitForPlayableAudio(ensure(),'música del menú')};\n })();\n // Solicita la música desde el arranque, mientras carga el mundo;"
    if html.count(menu_music_return) != 1:
        raise SystemExit("No se encontró el cierre de MenuMusic.")
    html = html.replace(menu_music_return, menu_music_required, 1)

    gameplay_music_return = "  return {start,stop,setMuted};\n })();\n let startupAudioPreload=NorseAudio.preloadAll("
    gameplay_music_required = "  return {start,stop,setMuted,preload:()=>waitForPlayableAudio(ensure(),'música de partida')};\n })();\n let startupAudioPreload=NorseAudio.preloadAll("
    if html.count(gameplay_music_return) != 1:
        raise SystemExit("No se encontró el cierre de GameplayMusic.")
    html = html.replace(gameplay_music_return, gameplay_music_required, 1)

    audio_startup_marker = " let startupAudioPreload=NorseAudio.preloadAll(new URLSearchParams(window.location.search).get('test')==='1'?30000:6500);"
    if html.count(audio_startup_marker) != 1:
        raise SystemExit("No se encontró la precarga inicial de efectos de sonido.")
    html = html.replace(audio_startup_marker, audio_startup_marker+"\n const startupMusicPreload=Promise.all([MenuMusic.preload(),GameplayMusic.preload()]).then(results=>({results}),error=>({error}));", 1)

    # Final gate is based on observed readiness, not on the animated percentage.
    # The special coastal reference test deliberately skips game-only character/fauna assets.
    audio_result_declaration = " let audioPreloadResult={total:0,ready:0,failed:0,pending:0,status:'pending'};"
    if html.count(audio_result_declaration) != 1:
        raise SystemExit("No se encontró el estado de la precarga de efectos de sonido.")
    html = html.replace(audio_result_declaration, audio_result_declaration+"let startupMusicPreloadResult=null;", 1)

    effects_ready_marker = "recordStartupTask('Efectos de sonido',audioLoadStarted,performance.now(),'ready',audioPreloadResult);"
    music_ready_code = """recordStartupTask('Efectos de sonido',audioLoadStarted,performance.now(),'ready',audioPreloadResult);
  const musicPreloadOutcome=await startupMusicPreload;
  if(musicPreloadOutcome.error)throw musicPreloadOutcome.error;
  startupMusicPreloadResult=musicPreloadOutcome.results;
  if(!Array.isArray(startupMusicPreloadResult)||startupMusicPreloadResult.length!==2||startupMusicPreloadResult.some(item=>!item.ready||item.readyState<2))throw new Error('Las dos bandas sonoras no están en estado reproducible.');
  recordStartupTask('Bandas sonoras streaming',audioLoadStarted,performance.now(),'ready',{menu:startupMusicPreloadResult[0],gameplay:startupMusicPreloadResult[1],decodedToAudioBuffer:false});"""
    if html.count(effects_ready_marker) != 1:
        raise SystemExit("No se encontró el registro de efectos de sonido listos.")
    html = html.replace(effects_ready_marker, music_ready_code, 1)
    old_audio_error = "throw new Error('RECURSO OBLIGATORIO: efectos de sonido · '+String(audioRequiredError&&audioRequiredError.message||audioRequiredError));"
    new_audio_error = "throw new Error('RECURSO OBLIGATORIO: efectos de sonido y música · '+String(audioRequiredError&&audioRequiredError.message||audioRequiredError));"
    if html.count(old_audio_error) != 1:
        raise SystemExit("No se encontró el error de audio obligatorio.")
    html = html.replace(old_audio_error, new_audio_error, 1)

    startup_gate_marker = " setLoadingProgress(98,'Comprobando que todo está listo…');"
    startup_gate_code = """ const startupResourceSnapshot={
  engineReady:!!(window.BABYLON&&window.BABYLON.Engine),
  gltfImporterReady:!!(window.BABYLON&&window.BABYLON.SceneLoader&&window.BABYLON.GLTFFileLoader),
  protagonistReady:!!realPlayerReady,
  npcRoster:window.__elSinNombreStartupNpcRoster||null,
  fauna:{required:!isPerformanceMode,requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length,requiredGulls:isPerformanceMode?0:5,loadedGulls:ambientBirds.filter(b=>b.real).length},
  soundEffects:audioPreloadResult,
  music:{results:startupMusicPreloadResult,menuReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[0]&&startupMusicPreloadResult[0].ready),gameplayReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[1]&&startupMusicPreloadResult[1].ready),streaming:true,decodedToAudioBuffer:false},
  scene:{status:sceneWarmupStatus,waitingItemsAfter:window.__elSinNombreStartupSceneWarmup&&window.__elSinNombreStartupSceneWarmup.waitingItemsAfter,meshes:scene&&scene.meshes?scene.meshes.length:0,firstFrameRendered:!!firstFrameRendered},
  world:{islands:land.length,grassClumps:grassInstanceCount,grassBatches:grassBatchCount,profile:activeGraphicsProfile}
 };
 const startupResourceFailures=[];
 if(!coastalReferenceMode){
  if(!startupResourceSnapshot.engineReady)startupResourceFailures.push('motor Babylon');
  if(!startupResourceSnapshot.gltfImporterReady)startupResourceFailures.push('importador GLB');
  if(!startupResourceSnapshot.protagonistReady)startupResourceFailures.push('vikingo protagonista');
  if(!startupResourceSnapshot.npcRoster||startupResourceSnapshot.npcRoster.ready!==true)startupResourceFailures.push('roster NPC obligatorio');
  if(!startupResourceSnapshot.soundEffects||startupResourceSnapshot.soundEffects.failed||startupResourceSnapshot.soundEffects.pending||startupResourceSnapshot.soundEffects.ready!==startupResourceSnapshot.soundEffects.total)startupResourceFailures.push('efectos de sonido');
  if(!startupResourceSnapshot.music.menuReady||!startupResourceSnapshot.music.gameplayReady)startupResourceFailures.push('bandas sonoras');
  if(startupResourceSnapshot.scene.status!=='ready'||startupResourceSnapshot.scene.meshes<=0||!startupResourceSnapshot.scene.firstFrameRendered)startupResourceFailures.push('escena, texturas y shaders de la vista inicial');
  if(startupResourceSnapshot.world.islands!==13)startupResourceFailures.push('mundo de 13 islas');
  if(!isPerformanceMode){
   if(startupResourceSnapshot.fauna.requested!==3||startupResourceSnapshot.fauna.loaded!==3)startupResourceFailures.push('fauna terrestre '+startupResourceSnapshot.fauna.loaded+'/'+startupResourceSnapshot.fauna.requested);
   if(startupResourceSnapshot.fauna.loadedGulls!==5)startupResourceFailures.push('gaviotas 3D '+startupResourceSnapshot.fauna.loadedGulls+'/5');
   if(startupResourceSnapshot.world.grassClumps<=0||startupResourceSnapshot.world.grassBatches<=0)startupResourceFailures.push('vegetación 3D inicial');
  }
 }
 window.__ELSN_STARTUP_RESOURCE_GATE__={ready:startupResourceFailures.length===0,checkedAt:new Date().toISOString(),resources:startupResourceSnapshot,failures:startupResourceFailures,coastalReferenceMode:!!coastalReferenceMode};
 if(startupResourceFailures.length)throw new Error('RECURSO OBLIGATORIO: barrera final de carga · '+startupResourceFailures.join(' · '));
 recordStartupTask('Barrera final de recursos',performance.now(),performance.now(),'ready',startupResourceSnapshot);
"""
    if html.count(startup_gate_marker) != 1:
        raise SystemExit("No se encontró el punto único para la barrera final de recursos.")
    html = html.replace(startup_gate_marker, startup_gate_code+startup_gate_marker, 1)
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
    # Babylon's scene.whenReadyAsync() already waits for textures and shader readiness.
    # Calling scene.compileMaterialsAsync() as a second, full-scene pass recompiles every
    # material across all 13 islands, including off-screen variants, and can stall for
    # minutes on software renderers without improving readiness of the first view.
    # Keep the blocking scene readiness barrier and its two rendered warm-up frames.
    full_scene_compile_marker = "if(typeof scene.compileMaterialsAsync==='function')sceneReadyTasks.push(scene.compileMaterialsAsync());"
    if html.count(full_scene_compile_marker) != 1:
        raise SystemExit("No se encontró la única compilación redundante de todos los materiales.")
    html = html.replace(
        full_scene_compile_marker,
        "// The initial camera render now checks its own mesh/material readiness; avoid a duplicate all-island compile pass."
    , 1)

    # Wait for resources used by the initial camera view, not every off-screen island mesh.
    # The game loop is already rendering behind the blocking load screen. Each frame we
    # inspect Babylon's actual active render list, ask those meshes to finish their material
    # variants, and wait until scene texture requests have settled for three stable frames.
    # Off-screen island shaders are compiled by Babylon when that island becomes visible.
    initial_view_marker = "const sceneReadyTasks=[scene.whenReadyAsync()];"
    initial_view_replacement = r"""const waitForInitialViewReadiness=async()=>{
    let readyFrames=0,lastDiagnostic=null;
    const started=performance.now();
    while(performance.now()-started<85000){
     await new Promise(resolve=>requestAnimationFrame(resolve));
     const active=typeof scene.getActiveMeshes==='function'?scene.getActiveMeshes():null;
     const activeMeshes=active&&Array.isArray(active.data)?active.data.slice(0,active.length):[];
     const notReady=[];
     for(const mesh of activeMeshes){
      if(!mesh||mesh.isBlocked||mesh.isVisible===false)continue;
      try{if(typeof mesh.isReady==='function'&&!mesh.isReady(true))notReady.push(String(mesh.name||mesh.id||'mesh').slice(0,100));}
      catch(error){notReady.push(String(mesh.name||mesh.id||'mesh').slice(0,80)+': '+String(error&&error.message||error).slice(0,100));}
     }
     let waitingItems=null;
     try{if(typeof scene.getWaitingItemsCount==='function')waitingItems=scene.getWaitingItemsCount();}catch(_){waitingItems=null;}
     const firstFrame=firstFrameRendered===true;
     const assetsSettled=waitingItems===null||waitingItems===0;
     const ready=firstFrame&&activeMeshes.length>0&&notReady.length===0&&assetsSettled;
     readyFrames=ready?readyFrames+1:0;
     lastDiagnostic={firstFrameRendered:firstFrame,activeMeshCount:activeMeshes.length,notReadyMeshCount:notReady.length,notReadyMeshes:notReady.slice(0,16),waitingItems,stableReadyFrames:readyFrames,elapsedMs:Number((performance.now()-started).toFixed(1))};
     if(readyFrames>=3)return lastDiagnostic;
    }
    throw new Error('La vista inicial no completó tres fotogramas estables: '+JSON.stringify(lastDiagnostic));
   };
   const sceneReadyTasks=[waitForInitialViewReadiness()];"""
    if html.count(initial_view_marker) != 1:
        raise SystemExit("No se encontró la única barrera global de disponibilidad de escena para sustituirla por la comprobación de vista inicial.")
    html = html.replace(initial_view_marker, initial_view_replacement, 1)

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
        raise SystemExit("Navigation runtime JavaScript syntax validation failed:\n" + navigation_check.stderr)
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
    world_inspection_tag = '<script src="./scripts/nordic/world-inspection.js"></script>'
    game_runtime_marker = '<script>\n(function(){\n"use strict";\nwindow.addEventListener(\'error\''
    if html.count(game_runtime_marker) != 1:
        raise SystemExit("No se encontró exactamente el inicio del runtime principal para instalar la atmósfera.")
    if html.count(atmosphere_tag) > 1:
        raise SystemExit("La etiqueta del sistema atmosférico aparece duplicada.")
    if atmosphere_tag not in html:
        html = html.replace(game_runtime_marker, atmosphere_tag + "\n" + game_runtime_marker, 1)
    if html.index(atmosphere_tag) > html.index(game_runtime_marker):
        raise SystemExit("El sistema atmosférico debe cargarse antes del runtime principal.")
    if html.count(world_inspection_tag) > 1:
        raise SystemExit("La etiqueta del inspector del mundo aparece duplicada.")
    if world_inspection_tag not in html:
        html = html.replace(game_runtime_marker, world_inspection_tag + "\n" + game_runtime_marker, 1)
    if html.index(world_inspection_tag) > html.index(game_runtime_marker):
        raise SystemExit("El inspector del mundo debe cargarse antes del runtime principal.")

    required = [
        "assets/vendor/babylon.js",
        "assets/vendor/meshopt_decoder.js",
        "BABYLON.MeshoptCompression.Configuration",
        "assets/models/viking-rigged.glb",
        "assets/models/armored-knight-rigged.glb",
        "assets/models/man-base-character-rigged.glb",
        "./assets/models/wildlife/",
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

    world_inspection_source = ROOT / "scripts" / "nordic" / "world-inspection.js"
    if not world_inspection_source.is_file():
        raise SystemExit("Falta scripts/nordic/world-inspection.js.")
    world_inspection_target = DIST / "scripts" / "nordic" / "world-inspection.js"
    shutil.copy2(world_inspection_source, world_inspection_target)
    world_inspection_check = subprocess.run(
        [node, "--check", str(world_inspection_source)], capture_output=True, text=True,
    )
    if world_inspection_check.returncode != 0:
        raise SystemExit("World inspection runtime JavaScript syntax validation failed:\n" + world_inspection_check.stderr)
 
    # The civilian NPC specialist runtime is part of the existing game shell.
    for script_name in ("npc-agent-core.js", "npc-agent-runtime.js"):
        script_source = ROOT / "scripts" / script_name
        if not script_source.is_file():
            raise SystemExit(f"Falta el módulo de especialistas NPC: {script_name}")
        npc_check = subprocess.run([node, "--check", str(script_source)], capture_output=True, text=True)
        if npc_check.returncode != 0:
            raise SystemExit(f"NPC specialist runtime syntax validation failed ({script_name}):\n" + npc_check.stderr)
        script_target = DIST / "scripts" / script_name
        script_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(script_source, script_target)
        print(f"OK scripts/{script_name}: módulo NPC validado y empaquetado.")

    # Lightweight local session recorder: no scene objects or render assets are created.
    session_recorder_source = ROOT / "scripts" / "game-session-recorder.js"
    if not session_recorder_source.is_file():
        raise SystemExit("Falta scripts/game-session-recorder.js.")
    session_recorder_check = subprocess.run([node, "--check", str(session_recorder_source)], capture_output=True, text=True)
    if session_recorder_check.returncode != 0:
        raise SystemExit("Game session recorder syntax validation failed:\n" + session_recorder_check.stderr)
    inspector_agent_ui_source = ROOT / "inspector" / "npc-agents.js"
    if not inspector_agent_ui_source.is_file():
        raise SystemExit("Falta inspector/npc-agents.js.")
    inspector_agent_ui_check = subprocess.run([node, "--check", str(inspector_agent_ui_source)], capture_output=True, text=True)
    if inspector_agent_ui_check.returncode != 0:
        raise SystemExit("Inspector NPC agent UI syntax validation failed:\n" + inspector_agent_ui_check.stderr)
    session_recorder_target = DIST / "scripts" / "game-session-recorder.js"
    session_recorder_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(session_recorder_source, session_recorder_target)

    # Player-facing ambient dialogue is isolated from Inspector specialist identities.
    for script_name in ("npc-village-brain-core.js", "npc-dialogue-core.js", "npc-dialogue-runtime.js"):
        script_source = ROOT / "scripts" / script_name
        if not script_source.is_file():
            raise SystemExit(f"Falta el módulo de diálogos NPC: {script_name}")
        dialogue_check = subprocess.run([node, "--check", str(script_source)], capture_output=True, text=True)
        if dialogue_check.returncode != 0:
            raise SystemExit(f"NPC dialogue syntax validation failed ({script_name}):\n" + dialogue_check.stderr)
        script_target = DIST / "scripts" / script_name
        script_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(script_source, script_target)
    dialogue_style_source = ROOT / "scripts" / "npc-dialogue.css"
    if not dialogue_style_source.is_file():
        raise SystemExit("Falta scripts/npc-dialogue.css.")
    dialogue_style_target = DIST / "scripts" / "npc-dialogue.css"
    shutil.copy2(dialogue_style_source, dialogue_style_target)

    # The Inspector's Phase 1 ES module imports these helpers from ../scripts/.
    # They are not part of the player shell, so copy them explicitly into dist.
    for script_name in ("phase1-diagnostics-core.mjs", "phase2-world-inspection-core.mjs"):
        script_source = ROOT / "scripts" / script_name
        if not script_source.is_file():
            raise SystemExit(f"Falta el módulo de diagnóstico del Inspector: {script_name}")
        module_check = subprocess.run(
            [node, "--check", str(script_source)], capture_output=True, text=True,
        )
        if module_check.returncode != 0:
            raise SystemExit(
                f"Inspector diagnostic module syntax validation failed ({script_name}):\n"
                + module_check.stderr
            )
        script_target = DIST / "scripts" / script_name
        script_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(script_source, script_target)
        print(f"OK scripts/{script_name}: módulo del Inspector validado y empaquetado.")

    navigation_tag = '<script src="./scripts/nordic/navigation-suite.js" defer></script>'
    if navigation_tag not in html:
        if "</body>" not in html:
            raise SystemExit("No se encontró </body> para instalar la navegación.")
        html = html.replace("</body>", navigation_tag + "\n</body>", 1)

    session_recorder_tag = '<script src="./scripts/game-session-recorder.js" defer></script>'
    if html.count(session_recorder_tag) > 1:
        raise SystemExit("La etiqueta del registrador de sesiones aparece duplicada.")
    if session_recorder_tag not in html:
        if "</body>" not in html:
            raise SystemExit("No se encontró </body> para instalar el registrador de sesiones.")
        html = html.replace("</body>", session_recorder_tag + "\n</body>", 1)


    # Read-only player dialogue bridge: reuses existing villagers and creates no actors.
    dialogue_bridge_marker = " window.copyGameHealthDebug=()=>{"
    dialogue_bridge_code = r"""
 // Player-facing dialogue bridge. Inspector specialist identities remain in their own runtime.
 window.__ELSN_GAME_DIALOGUE_BRIDGE__=Object.freeze({
  maxVisibleBubbles:4,
  getSnapshot:(()=>{let dialoguePeopleCache=null,dialogueAmbientByRoot=null;return ()=>{
   let focus=null;
   try{if(typeof playerPos==='function')focus=playerPos();}catch(_){}
   if(!focus||!Number.isFinite(Number(focus.x))||!Number.isFinite(Number(focus.z))){
    try{focus=player&&player.root&&player.root.position||null;}catch(_){}
   }
   if(!focus||!Number.isFinite(Number(focus.x))||!Number.isFinite(Number(focus.z)))focus={x:0,y:0,z:0};
   const atmosphere=window.__ELSN_ATMOSPHERE&&typeof window.__ELSN_ATMOSPHERE.getState==='function'?window.__ELSN_ATMOSPHERE.getState():null;
   let islandIndex=-1;
   try{if(typeof landIslandIndex==='function')islandIndex=landIslandIndex(focus.x,focus.z);}catch(_){};
   const active=!!(document.body&&document.body.classList.contains('game-running'));
   return {
    active,
    playerPosition:{x:Number(focus&&focus.x)||0,y:Number(focus&&focus.y)||0,z:Number(focus&&focus.z)||0},
    people:(()=>{
     if(!active)return [];
     if(!dialoguePeopleCache){
      dialogueAmbientByRoot=new Map();
      if(Array.isArray(ambientPeople))for(const actor of ambientPeople){if(actor&&actor.parts&&actor.parts.root)dialogueAmbientByRoot.set(actor.parts.root,actor);}
      const candidates=[].concat(Array.isArray(scene.transformNodes)?scene.transformNodes:[],Array.isArray(scene.meshes)?scene.meshes:[]);
      const seen=new Set(),found=[];
      for(const node of candidates){
       if(!node||seen.has(node))continue;
       seen.add(node);
       const name=String(node.name||'');
       const match=/^(?:Villager_(\d+)_(\d+)|VillageGuard(\d+)_(\d+))$/.exec(name);
       if(!match)continue;
       const villageIndex=Number(match[1]!==undefined?match[1]:match[3]);
       const slot=Number(match[2]!==undefined?match[2]:match[4]);
       const descendants=[];
       try{if(typeof node.getChildTransformNodes==='function')descendants.push(...node.getChildTransformNodes(false));}catch(_){}
       try{if(typeof node.getChildMeshes==='function')descendants.push(...node.getChildMeshes(false));}catch(_){}
       let head=descendants.find(child=>child&&/head/i.test(String(child.name||''))&&typeof child.getAbsolutePosition==='function')||null;
       if(!head){
        for(const child of descendants){
         const bones=child&&child.skeleton&&Array.isArray(child.skeleton.bones)?child.skeleton.bones:[];
         for(const bone of bones){
          if(!bone||!/head/i.test(String(bone.name||''))||typeof bone.getTransformNode!=='function')continue;
          const boneNode=bone.getTransformNode();if(boneNode&&typeof boneNode.getAbsolutePosition==='function'){head=boneNode;break;}
         }
         if(head)break;
        }
       }
       const ambientActor=dialogueAmbientByRoot&&dialogueAmbientByRoot.get(node)||null;
       const actualParts=ambientActor&&ambientActor.parts?ambientActor.parts:{name,root:node,head,variant:villageIndex*2+slot,civilian:match[1]!==undefined,role:match[1]!==undefined?'civilian':'warrior'};
       if(actualParts&&!actualParts.head&&head)actualParts.head=head;
       found.push({name,root:node,villageIndex,parts:actualParts,actor:ambientActor,recruited:ambientActor?ambientActor.recruited===true:false});
      }
      dialoguePeopleCache=found;
     }
     return dialoguePeopleCache;
    })(),
    world:{night:!!(atmosphere&&atmosphere.night>=0.55),daylight:atmosphere&&Number.isFinite(Number(atmosphere.daylight))?Number(atmosphere.daylight):null,weather:atmosphere&&atmosphere.weather?String(atmosphere.weather):'',timeOfDay:atmosphere&&Number.isFinite(Number(atmosphere.timeOfDay))?Number(atmosphere.timeOfDay):null,onShip:typeof onShip!=='undefined'&&!!onShip,enemyNearby:typeof nearEnemies==='function'&&nearEnemies(),health:typeof health!=='undefined'?Number(health):null,healthLow:typeof health!=='undefined'&&Number(health)<=35,wood:typeof woodCount!=='undefined'?Number(woodCount):null,stone:typeof stoneCount!=='undefined'?Number(stoneCount):null,captured:typeof captured!=='undefined'?Number(captured)||0:0,islandName:typeof land!=='undefined'&&islandIndex>=0&&land[islandIndex]?String(land[islandIndex].name||''):''},
    scene,engine,camera:scene.activeCamera||camera,
    canvas:engine.getRenderingCanvas(),BABYLON:B
   };
  };})()
 });
"""
    if html.count(dialogue_bridge_marker) != 1:
        raise SystemExit("No se encontró exactamente una salida del runtime para conectar los diálogos NPC.")
    html = html.replace(dialogue_bridge_marker, dialogue_bridge_code + chr(10) + dialogue_bridge_marker, 1)

    dialogue_style_tag = '<link rel="stylesheet" href="./scripts/npc-dialogue.css">'
    if dialogue_style_tag not in html:
        if "</head>" not in html:
            raise SystemExit("No se encontró </head> para instalar los estilos de diálogos NPC.")
        html = html.replace("</head>", dialogue_style_tag + chr(10) + "</head>", 1)
    for dialogue_tag in (
        '<script src="./scripts/npc-village-brain-core.js" defer></script>',
        '<script src="./scripts/npc-dialogue-core.js" defer></script>',
        '<script src="./scripts/npc-dialogue-runtime.js" defer></script>',
    ):
        if html.count(dialogue_tag) > 1:
            raise SystemExit("Una etiqueta del runtime de diálogos NPC aparece duplicada.")
        if dialogue_tag not in html:
            if "</body>" not in html:
                raise SystemExit("No se encontró </body> para instalar los diálogos NPC.")
            html = html.replace("</body>", dialogue_tag + chr(10) + "</body>", 1)

    # Release candidate 0.6.315: stream the Babylon engine bundle with truthful mobile startup progress.
    if game_version != "0.6.274":
        raise SystemExit(f"Se esperaba la base 0.6.274 para construir la candidata 0.6.315; se encontró {game_version}.")
    version_meta_pattern = r'(<meta\s+name=["\']el-sin-nombre-build["\']\s+content=["\'])0\.6\.274(["\'])'
    html, version_meta_count = re.subn(version_meta_pattern, r'\g<1>0.6.315\2', html, count=1, flags=re.IGNORECASE)
    if version_meta_count != 1:
        raise SystemExit("No se pudo actualizar de forma única la versión del juego a 0.6.315.")
    html = html.replace("0.6.274", "0.6.315")
    if "0.6.274" in html:
        raise SystemExit("Quedan referencias de versión 0.6.274 en el HTML generado.")
    # The source may already carry the new game version or a newer diagnostic
    # report version. Normalize the unique build marker instead of assuming the
    # inline diagnostics are still at reportVersion 11.
    diagnostic_build_pattern = r"reportVersion:'\d+',build:'[^']+'"
    diagnostic_build_replacement = "reportVersion:'32',build:'0.6.315'"
    html, diagnostic_build_count = re.subn(
        diagnostic_build_pattern, diagnostic_build_replacement, html, count=1
    )
    if diagnostic_build_count != 1:
        raise SystemExit("No se encontró exactamente una identificación de compilación 0.6.315 para normalizar.")
    game_version = "0.6.315"
    USER_AGENT = f"EL-SIN-NOMBRE-WebBuild/{game_version} (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"

    # 0.6.300 unified graphics: native Babylon adaptive scaling, high-detail flagship assets and a stable Performance profile.
    quality_profile_marker = r"""const qualityDpr=isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile ? .62 : (constrainedHardware ? .78 : (isTouchDevice ? 1.0 : 1.35)))))):Math.min(deviceDpr,isTouchDevice?1.80:1.85);"""
    quality_profile_code = r"""const highTierGpuMatch=/Adreno.*(?:7[5-9]\d|8\d\d)|Mali[- ]?G7\d{2}|Xclipse.*(?:9\d{2}|1\d{3})/i.test(graphicsRenderer);
 const highHeadroomQualityMobile=!!(!isPerformanceMode&&isTouchDevice&&!constrainedHardware&&((reportedMemory>=8&&(Number(navigator.hardwareConcurrency)||0)>=8)||highTierGpuMatch));
 // Quality fixes its native render scale at startup. Runtime FPS drops must never lower image quality.
 const qualityDpr=isPerformanceMode
  ?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile?.62:(constrainedHardware?.78:(isTouchDevice?1.0:1.35))))))
  :Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?2.10:1.45):1.65);"""
    if html.count(quality_profile_marker) != 1:
        raise SystemExit("No se encontró exactamente una política original de resolución.")
    html = html.replace(quality_profile_marker, quality_profile_code, 1)

    # Make the identity gate reliable for both pointer and keyboard activation.
    identity_start_guard_marker = "function beginLoadingWithIdentity(name){\n selectedPlayerName=String(name||'').trim().slice(0,20);playerIdentityChosen=true;"
    identity_start_guard_replacement = "let identityStartupTriggered=false;\nfunction beginLoadingWithIdentity(name){\n if(identityStartupTriggered)return;\n identityStartupTriggered=true;window.__ELSN_IDENTITY_START_COUNT=(window.__ELSN_IDENTITY_START_COUNT||0)+1;window.__ELSN_IDENTITY_START_AT=Date.now();\n selectedPlayerName=String(name||'').trim().slice(0,20);playerIdentityChosen=true;"
    if html.count(identity_start_guard_marker) != 1:
        raise SystemExit("No se encontró el inicio único del selector de identidad para blindar su activación.")
    html = html.replace(identity_start_guard_marker, identity_start_guard_replacement, 1)
    identity_buttons_marker = """document.getElementById('continueWithName').addEventListener('click',()=>beginLoadingWithIdentity(document.getElementById('playerNameInput').value));
document.getElementById('continueUnnamed').addEventListener('click',()=>beginLoadingWithIdentity(''));"""
    identity_buttons_replacement = """const startNamedIdentity=()=>beginLoadingWithIdentity(document.getElementById('playerNameInput').value);
const startUnnamedIdentity=()=>beginLoadingWithIdentity('');
const continueWithNameButton=document.getElementById('continueWithName'),continueUnnamedButton=document.getElementById('continueUnnamed');
continueWithNameButton.addEventListener('click',startNamedIdentity);
continueWithNameButton.addEventListener('pointerup',startNamedIdentity,{once:true});
continueUnnamedButton.addEventListener('click',startUnnamedIdentity);
continueUnnamedButton.addEventListener('pointerup',startUnnamedIdentity,{once:true});"""
    if html.count(identity_buttons_marker) != 1:
        raise SystemExit("No se encontraron los dos botones únicos de inicio de identidad.")
    html = html.replace(identity_buttons_marker, identity_buttons_replacement, 1)

    # Platform-aware memory scheduling: preserve the full Quality scene and roster,
    # but avoid overlapping large binary downloads/parses on iOS Safari and Adreno 650.
    # Import large GLBs only after the static world geometry has been built.
    player_import_start_marker = "const playerHumanLoadPromise=coastalReferenceMode?Promise.resolve(null):loadHumanViking();"
    if html.count(player_import_start_marker) != 1:
        raise SystemExit("No se encontró la importación automática única del protagonista para aplazarla hasta terminar la geometría del mundo.")
    html = html.replace(player_import_start_marker, "let playerHumanLoadPromise=Promise.resolve(null);", 1)

    mobile_memory_policy_marker = "const isConstrainedMobile=!!(isPerformanceMode&&(iosMemoryBlindMobile||(isTouchDevice&&(constrainedHardware||reportedMemory<=3))));"
    mobile_memory_policy_replacement = mobile_memory_policy_marker + "\n // Peak-memory scheduling is independent from the selected graphics profile. It changes task concurrency only; render scale, textures, shadows, density and gameplay systems remain untouched.\n const isMobilePeakMemorySensitive=!!(isIOSDevice||(isTouchDevice&&(constrainedHardware||/Adreno.*650/i.test(graphicsRenderer))));\n let startupWildlifeCompressedBytes=0;"
    if html.count(mobile_memory_policy_marker) != 1:
        raise SystemExit("No se encontró la clasificación única para la política de memoria multiplataforma.")
    html = html.replace(mobile_memory_policy_marker, mobile_memory_policy_replacement, 1)

    blob_compare_marker = """ async function sameBlobBytes(a,b){
  if(!a||!b||a.size!==b.size)return false;
  if(a===b)return true;
  try{
   const [ab,bb]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);
   if(ab.byteLength!==bb.byteLength)return false;
   const x=new Uint8Array(ab),y=new Uint8Array(bb);
   for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
   return true;
  }catch(err){console.warn('No se pudo comparar la identidad de los GLB:',err);return false;}
 }"""
    blob_compare_replacement = """ const GLB_IDENTITY_COMPARE_CHUNK_BYTES=256*1024;
 async function sameBlobBytes(a,b){
  if(!a||!b||a.size!==b.size)return false;
  if(a===b)return true;
  try{
   let sinceYield=0;
   for(let offset=0;offset<a.size;offset+=GLB_IDENTITY_COMPARE_CHUNK_BYTES){
    const end=Math.min(a.size,offset+GLB_IDENTITY_COMPARE_CHUNK_BYTES);
    const [ab,bb]=await Promise.all([a.slice(offset,end).arrayBuffer(),b.slice(offset,end).arrayBuffer()]);
    if(ab.byteLength!==bb.byteLength)return false;
    const x=new Uint8Array(ab),y=new Uint8Array(bb);
    for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
    sinceYield+=end-offset;
    if(sinceYield>=1024*1024){await new Promise(resolve=>setTimeout(resolve,0));sinceYield=0;}
   }
   return true;
  }catch(err){console.warn('No se pudo comparar la identidad de los GLB:',err);return false;}
 }"""
    if html.count(blob_compare_marker) != 1:
        raise SystemExit("No se encontró la comparación única de GLB que podía duplicar archivos completos en RAM.")
    html = html.replace(blob_compare_marker, blob_compare_replacement, 1)

    civilian_warmup_marker = "const civilianWarmupPromise=civilianTotal?(async()=>{"
    civilian_warmup_replacement = "const civilianWarmupPromise=civilianTotal&&!isMobilePeakMemorySensitive?(async()=>{"
    if html.count(civilian_warmup_marker) != 1:
        raise SystemExit("No se encontró la precarga paralela única del GLB civil.")
    html = html.replace(civilian_warmup_marker, civilian_warmup_replacement, 1)

    wildlife_batch_marker = """  const kinds=[...new Set(wildlifeSpawnSpecs.map(spec=>spec.kind))];
  const wildlifeDownloads=await Promise.all(kinds.map(async kind=>({kind,blob:await downloadWildlifeBlob(kind)})));wildlifeDownloads.forEach(({kind,blob})=>wildlifeBlobs.set(kind,blob));
  let loaded=0;
  for(let index=0;index<wildlifeSpawnSpecs.length;index++){
   const spec=wildlifeSpawnSpecs[index],modelStarted=performance.now(),animal=await instantiateWildlifeAnimal(spec.kind,spec.x,spec.z,spec.size,index,spec.homeIslandIndex);
   if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');
   ambientFauna.push(animal);loaded++;
   recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),'ready',{island:spec.homeIslandIndex});
   if(index+1<wildlifeSpawnSpecs.length)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  }
  if(loaded!==wildlifeSpawnSpecs.length)throw new Error('RECURSO OBLIGATORIO: fauna incompleta '+loaded+'/'+wildlifeSpawnSpecs.length+'.');
  recordStartupTask('Fauna GLB · cola completa',wildlifeLoadStarted,performance.now(),'complete',{loaded,requested:wildlifeSpawnSpecs.length});"""
    wildlife_batch_replacement = """  const kinds=[...new Set(wildlifeSpawnSpecs.map(spec=>spec.kind))];
  let loaded=0,completedSpecs=0;
  const instantiateKind=async kind=>{
   const blob=await downloadWildlifeBlob(kind);
   wildlifeBlobs.set(kind,blob);
   startupWildlifeCompressedBytes+=blob.size;
   const specs=wildlifeSpawnSpecs.map((spec,sourceIndex)=>({spec,sourceIndex})).filter(item=>item.spec.kind===kind);
   for(const item of specs){
    const spec=item.spec,modelStarted=performance.now(),animal=await instantiateWildlifeAnimal(spec.kind,spec.x,spec.z,spec.size,item.sourceIndex,spec.homeIslandIndex);
    if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');
    ambientFauna.push(animal);loaded++;completedSpecs++;
    recordStartupTask('Fauna GLB '+spec.kind+' #'+item.sourceIndex,modelStarted,performance.now(),'ready',{island:spec.homeIslandIndex});
    if(completedSpecs<wildlifeSpawnSpecs.length)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
   }
   // All actors for this species now own their scene resources; drop the compressed source Blob.
   wildlifeBlobs.delete(kind);
  };
  if(isMobilePeakMemorySensitive){
   for(const kind of kinds)await instantiateKind(kind);
  }else{
   const wildlifeDownloads=await Promise.all(kinds.map(async kind=>({kind,blob:await downloadWildlifeBlob(kind)})));
   wildlifeDownloads.forEach(({kind,blob})=>{wildlifeBlobs.set(kind,blob);startupWildlifeCompressedBytes+=blob.size;});
   for(let index=0;index<wildlifeSpawnSpecs.length;index++){
    const spec=wildlifeSpawnSpecs[index],modelStarted=performance.now(),animal=await instantiateWildlifeAnimal(spec.kind,spec.x,spec.z,spec.size,index,spec.homeIslandIndex);
    if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');
    ambientFauna.push(animal);loaded++;
    recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),'ready',{island:spec.homeIslandIndex});
    if(index+1<wildlifeSpawnSpecs.length)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
   }
   wildlifeBlobs.clear();
  }
  if(loaded!==wildlifeSpawnSpecs.length)throw new Error('RECURSO OBLIGATORIO: fauna incompleta '+loaded+'/'+wildlifeSpawnSpecs.length+'.');
  recordStartupTask('Fauna GLB · cola completa',wildlifeLoadStarted,performance.now(),'complete',{loaded,requested:wildlifeSpawnSpecs.length,compressedBytes:startupWildlifeCompressedBytes});"""
    if html.count(wildlife_batch_marker) != 1:
        raise SystemExit("No se encontró la cola única de descarga/importación de fauna.")
    html = html.replace(wildlife_batch_marker, wildlife_batch_replacement, 1)

    npc_promise_marker = "const npcStartupPromise=coastalReferenceMode?Promise.resolve(0):startNpcHumanModels();"
    npc_promise_replacement = """const initialCoastStartedAt=performance.now();
 await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
 syncActiveBeachIsland();
 syncActiveTidalFoamIsland();
 recordStartupTask('Geometría de costa inicial',initialCoastStartedAt,performance.now(),'ready',{islandIndex:activeBeachIslandIndex,island:land[activeBeachIslandIndex]&&land[activeBeachIslandIndex].name,beachReady:!!livingBeachLayers[activeBeachIslandIndex],foamMeshes:tidalFoamMeshes.length});
 if(!coastalReferenceMode)playerHumanLoadPromise=loadHumanViking();
 let npcStartupPromise=coastalReferenceMode||isMobilePeakMemorySensitive?Promise.resolve(0):startNpcHumanModels();"""
    if html.count(npc_promise_marker) != 1:
        raise SystemExit("No se encontró la promesa única de preparación de NPC.")
    html = html.replace(npc_promise_marker, npc_promise_replacement, 1)

    npc_parallel_wait_marker = "   await Promise.all([playerHumanLoadPromise,npcStartupPromise]);"
    npc_serial_wait_replacement = """   if(isMobilePeakMemorySensitive){
    // Load the protagonist first, then the unchanged required NPC roster; this avoids overlapping GLB parser/decoder working sets.
    await playerHumanLoadPromise;
    npcStartupPromise=startNpcHumanModels();
    await npcStartupPromise;
   }else await Promise.all([playerHumanLoadPromise,npcStartupPromise]);"""
    if html.count(npc_parallel_wait_marker) != 1:
        raise SystemExit("No se encontró la espera única del protagonista y el roster NPC.")
    html = html.replace(npc_parallel_wait_marker, npc_serial_wait_replacement, 1)

    fauna_parallel_marker = """  const faunaStartedAt=performance.now();
  const faunaTasks=[{name:'Fauna terrestre',promise:loadWildlifeModels()}];
  if(!isPerformanceMode)faunaTasks.push({name:'Gaviotas 3D',promise:loadRiggedCoastalGulls()});
  // No liberar la entrada por el primer fallo: el resto de tareas opcionales debe
  // terminar también, para que nada importe o aparezca detrás del jugador.
  const faunaResults=await Promise.allSettled(faunaTasks.map(task=>task.promise));
  const faunaFailures=faunaResults.flatMap((result,index)=>result.status==='rejected'?[{name:faunaTasks[index].name,message:String(result.reason&&result.reason.message||result.reason)}]:[]);"""
    fauna_serial_replacement = """  const faunaStartedAt=performance.now();
  const faunaFailures=[];
  if(isMobilePeakMemorySensitive){
   // Keep the complete wildlife and gull roster, but never retain several large GLBs/importers at once.
   try{await loadWildlifeModels();}catch(error){faunaFailures.push({name:'Fauna terrestre',message:String(error&&error.message||error)});}
   if(!isPerformanceMode){try{await loadRiggedCoastalGulls();}catch(error){faunaFailures.push({name:'Gaviotas 3D',message:String(error&&error.message||error)});}}
  }else{
   const faunaTasks=[{name:'Fauna terrestre',promise:loadWildlifeModels()}];
   if(!isPerformanceMode)faunaTasks.push({name:'Gaviotas 3D',promise:loadRiggedCoastalGulls()});
   // No liberar la entrada por el primer fallo: el resto de tareas opcionales debe terminar también.
   const faunaResults=await Promise.allSettled(faunaTasks.map(task=>task.promise));
   faunaFailures.push(...faunaResults.flatMap((result,index)=>result.status==='rejected'?[{name:faunaTasks[index].name,message:String(result.reason&&result.reason.message||result.reason)}]:[]));
  }"""
    if html.count(fauna_parallel_marker) != 1:
        raise SystemExit("No se encontró la preparación paralela única de fauna y gaviotas.")
    html = html.replace(fauna_parallel_marker, fauna_serial_replacement, 1)

    retry_roster_marker = """ function hasMissingEnemyVikings(){
  // Los NPC procedurales son la representación provisional mientras se importan los GLB.
  const warriors=isIOSDevice?humanEnemyParts.filter(p=>/^VillageGuard0_/.test(String(p.name||''))).slice(0,3):humanEnemyParts;
  const civilians=isIOSDevice?humanCivilianParts.slice(0,5):humanCivilianParts;
  return warriors.some(p=>!p.realHuman||p.realHuman.role!=='knight')||civilians.some(p=>!p.realHuman||p.realHuman.role!=='civilian');
 }"""
    retry_roster_replacement = """ function hasMissingEnemyVikings(){
  // Retry only the same roster required before entry; do not trigger extra iOS-only imports.
  const lowMemoryNpcBudget=!!(isUltraLowEndMobile||isGalaxyA12LowEndMobile||isGalaxyA12NachoPerformance);
  const warriors=isMobilePeakMemorySensitive
   ?humanEnemyParts.filter(p=>/^VillageGuard0_/.test(String(p.name||''))).slice(0,lowMemoryNpcBudget?1:3)
   :humanEnemyParts;
  const civilians=isMobilePeakMemorySensitive
   ?humanCivilianParts.slice(0,lowMemoryNpcBudget?1:2)
   :humanCivilianParts;
  return warriors.some(p=>!p.realHuman||p.realHuman.role!=='knight')||civilians.some(p=>!p.realHuman||p.realHuman.role!=='civilian');
 }"""
    if html.count(retry_roster_marker) != 1:
        raise SystemExit("No se encontró la regla única de reintentos del roster de NPC.")
    html = html.replace(retry_roster_marker, retry_roster_replacement, 1)

    startup_glb_bytes_marker = "const startupKnownGlbBytes=(playerHumanBlob?.size||0)+(enemyHumanSourceBytes||0)+(civilianHumanSourceBytes||0)+[...(wildlifeBlobs?.values?.()||[])].reduce((sum,blob)=>sum+(blob?.size||0),0);"
    startup_glb_bytes_replacement = "const startupKnownGlbBytes=(playerHumanBlob?.size||0)+(enemyHumanSourceBytes||0)+(civilianHumanSourceBytes||0)+startupWildlifeCompressedBytes+[...(wildlifeBlobs?.values?.()||[])].reduce((sum,blob)=>sum+(blob?.size||0),0);"
    if html.count(startup_glb_bytes_marker) != 1:
        raise SystemExit("No se encontró la estimación única de binarios GLB de arranque.")
    html = html.replace(startup_glb_bytes_marker, startup_glb_bytes_replacement, 1)

    startup_memory_marker = "window.__elSinNombreStartupMemoryEstimate={"
    startup_memory_replacement = "const startupHeapMemory=performance.memory&&typeof performance.memory==='object'?{usedJSHeapSizeBytes:Number(performance.memory.usedJSHeapSize)||null,totalJSHeapSizeBytes:Number(performance.memory.totalJSHeapSize)||null,jsHeapLimitBytes:Number(performance.memory.jsHeapSizeLimit)||null}:null;\n window.__elSinNombreStartupMemoryEstimate={"
    if html.count(startup_memory_marker) != 1:
        raise SystemExit("No se encontró el objeto único de estimación de memoria de arranque.")
    html = html.replace(startup_memory_marker, startup_memory_replacement, 1)
    startup_memory_fields_marker = "  textureCount:startupMemoryTextures.size,geometryCount:startupMemoryGeometry.size,\n  sceneMeshCount:scene.meshes?.length||0,"
    startup_memory_fields_replacement = "  textureCount:startupMemoryTextures.size,geometryCount:startupMemoryGeometry.size,\n  wildlifeCompressedBytesReleased:startupWildlifeCompressedBytes,browserHeap:startupHeapMemory,mobilePeakMemorySensitive:isMobilePeakMemorySensitive,\n  sceneMeshCount:scene.meshes?.length||0,"
    if html.count(startup_memory_fields_marker) != 1:
        raise SystemExit("No se encontró el bloque único de campos de memoria de arranque.")
    html = html.replace(startup_memory_fields_marker, startup_memory_fields_replacement, 1)

    health_memory_marker = "runtime:{performanceAudit:window.__elSinNombrePerformanceAudit?"
    health_memory_replacement = "runtime:{startupMemoryEstimate:window.__elSinNombreStartupMemoryEstimate||null,memoryPolicy:{mobilePeakMemorySensitive:isMobilePeakMemorySensitive,ios:isIOSDevice,deviceMemory:Number(navigator.deviceMemory)||null,retainedWildlifeSources:wildlifeBlobs.size,retainedPlayerSourceBlob:!!playerHumanBlob},performanceAudit:window.__elSinNombrePerformanceAudit?"
    if html.count(health_memory_marker) != 1:
        raise SystemExit("No se encontró el objeto runtime del informe para adjuntar memoria de arranque.")
    html = html.replace(health_memory_marker, health_memory_replacement, 1)


    # La página fuente conserva un bloque FSR1 antiguo. El único camino activo es
    # el escalado adaptativo nativo de Babylon; protegemos el bloque heredado.
    legacy_fsr_guard = "if(" + "fsr1" + "Candidate){"
    if html.count(legacy_fsr_guard) != 1:
        raise SystemExit("No se encontró exactamente un bloque FSR heredado para proteger.")
    html = html.replace(legacy_fsr_guard, "if(false){", 1)

    # Instrumentación nativa de Babylon disponible solo para inspector/perfil.
    scene_marker = "const scene=new B.Scene(engine);"
    scene_profile_code = r"""
 // Optional Babylon-native profiler. Normal gameplay keeps instrumentation disabled.
 const profileDiagnosticsEnabled=!!(testModeEnabled||new URLSearchParams(window.location.search).get('profile')==='1');
 let engineInstrumentation=null,sceneInstrumentation=null;
 const safePerfCounterValue=(counter,scale=1)=>{
  // A missing profiler counter is unavailable evidence, never a measured 0 ms.
  if(!profileDiagnosticsEnabled||!counter||counter.current===null||counter.current===undefined)return null;
  const value=Number(counter.current);
  return Number.isFinite(value)&&value>=0?Number((value/scale).toFixed(3)):null;
 };
 if(profileDiagnosticsEnabled){
  try{
   if(B.EngineInstrumentation){
    engineInstrumentation=new B.EngineInstrumentation(engine);
    engineInstrumentation.captureGPUFrameTime=true;
    engineInstrumentation.captureShaderCompilationTime=true;
   }
   if(B.SceneInstrumentation){
    sceneInstrumentation=new B.SceneInstrumentation(scene);
    sceneInstrumentation.captureActiveMeshesEvaluationTime=true;
    sceneInstrumentation.captureRenderTargetsRenderTime=true;
    sceneInstrumentation.captureFrameTime=true;
    sceneInstrumentation.captureRenderTime=true;
    sceneInstrumentation.captureCameraRenderTime=true;
   }
   console.info('Babylon native profiling enabled',{
    engineInstrumentation:!!engineInstrumentation,
    sceneInstrumentation:!!sceneInstrumentation,
    gpuTimerSupported:!!(engineInstrumentation&&engineInstrumentation.gpuFrameTimeCounter)
   });
  }catch(profileError){console.warn('Babylon native profiling unavailable; gameplay rendering is unchanged.',profileError);}
 }

 // High-mesh-count spatial selection for Babylon.js.
 // Static scene meshes stay indexed; moving actors/effects and every later-created mesh
 // are registered as dynamic content so movement, animation and gameplay remain intact.
 // Only known moving roots, animated rigs and live water/effect meshes stay dynamic; static foliage, rocks and structures remain in the octree.
 const spatialActorRootPattern=/^(?:PabloTheNameless|RealHumanVikingRoot|EnemyHumanFallPivot_\\d+|VillageGuard\\d+_\\d+|Villager_\\d+_\\d+|RaiderLongship_\\d+|Drakkar|Wildlife(?:Root)?_?\\d*|Deer(?:Root)?_?\\d*|Wolf(?:Root)?_?\\d*|Stag(?:Root)?_?\\d*|AmbientPerson_?\\d*|AmbientBird_?\\d*)$/i;
 const spatialVegetationMotionPattern=/^(?:treeCanopyWindPivot|fallingTree|fallingForestTree)/i;
 const spatialWaterMotionPattern=/^(?:ocean|water|nordicWater|coastalWater|coastalWave|waterFilm|tidalFoam|shoreBreakerWash|beachState|activeBeach|activeShore)/i;
 const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|flame|ember|smoke|particle|vesselWaterSpray|drakkarWake|spray|foam|wake|splash|wreck)/i;
 const spatialDynamicStatsPattern=/^(?:vesselWaterSpray|drakkarWake|tidalFoam|particle|projectile|arrow)/i;
 let spatialSelectionOctree=null;
 const spatialSelectionStats={enabled:false,sceneMeshCount:0,dynamicMeshCount:0,staticIndexedMeshCount:0,dynamicContentRatio:null,babylonInitialDynamicCount:0,dynamicReasons:{},dynamicSampleNames:[],dynamicSampleNamesByReason:{},dynamicFilterEnabled:false,dynamicFilterPasses:0,dynamicFilterLastCandidates:0,dynamicFilterLastSelected:0,dynamicFilterLastCulled:0,dynamicFilterCulledPeak:0,dynamicFilterTotalCandidates:0,dynamicFilterTotalCulled:0,dynamicFilterTotalMs:0,dynamicFilterLastMs:0,dynamicFilterMaxMs:0,dynamicFilterErrors:0,buildMs:null,error:null};
 const spatialDynamicMeshSet=new Set();
 const publishSpatialSelectionStats=()=>{
  try{
   // Expose an on-demand live snapshot. The getter copies only when the Inspector
   // or a test reads it, never from the per-frame render path.
   const descriptor=Object.getOwnPropertyDescriptor(window,'__ELSN_SPATIAL_SELECTION__');
   if(!descriptor||typeof descriptor.get!=='function'){
    Object.defineProperty(window,'__ELSN_SPATIAL_SELECTION__',{
     configurable:true,enumerable:true,
     get:()=>({...spatialSelectionStats})
    });
   }
  }catch(_){}
 };
 const spatialDynamicReasonForMesh=mesh=>{
  for(let node=mesh;node&&node!==scene;node=node.parent){
   const name=String(node.name||'');
   if(/^GroundSplashParticleBatch(?:$|[_-])/i.test(name)){if(mesh)mesh.alwaysSelectAsActiveMesh=true;return 'particle-or-effect';}
   if(node.skeleton||node.morphTargetManager||(Array.isArray(node.animations)&&node.animations.length))return 'animated-rig';
   if(spatialActorRootPattern.test(name))return 'actor-or-vehicle';
   if(spatialVegetationMotionPattern.test(name))return 'vegetation-motion';
   if(spatialWaterMotionPattern.test(name))return 'water-or-coast';
   if(spatialEffectMotionPattern.test(name))return 'particle-or-effect';
   if(Number(node.thinInstanceCount)>0&&spatialDynamicStatsPattern.test(name))return 'moving-thin-instances';
   if(Number(node.billboardMode)>0)return 'billboard';
  }
  return null;
 };
 const isSpatialDynamicMesh=mesh=>!!spatialDynamicReasonForMesh(mesh);
 const updateSpatialSelectionCounts=()=>{
  const dynamic=spatialSelectionOctree&&spatialSelectionOctree.dynamicContent;
  const dynamicCount=dynamic&&Number.isFinite(dynamic.length)?dynamic.length:0;
  const sceneCount=scene.meshes.length;
  spatialSelectionStats.sceneMeshCount=sceneCount;
  spatialSelectionStats.dynamicMeshCount=dynamicCount;
  spatialSelectionStats.staticIndexedMeshCount=Math.max(0,sceneCount-dynamicCount);
  spatialSelectionStats.dynamicContentRatio=sceneCount?Number((dynamicCount/sceneCount).toFixed(4)):null;
  publishSpatialSelectionStats();
 };
 const addSpatialDynamicMesh=(mesh,reason=null,force=false)=>{
  const dynamic=spatialSelectionOctree&&spatialSelectionOctree.dynamicContent;
  if(!mesh||!dynamic||typeof dynamic.push!=='function'||mesh.__elsnSpatialDynamic)return;
  const classification=reason||spatialDynamicReasonForMesh(mesh);
  if(!classification&&!force)return;
  mesh.__elsnSpatialDynamic=true;
  mesh.__elsnSpatialDynamicReason=classification;
  mesh.__elsnSpatialFreshUntilRenderId=(typeof scene.getRenderId==='function'?scene.getRenderId():0)+2;
  if(typeof dynamic.indexOf==='function'){
   if(dynamic.indexOf(mesh)<0)dynamic.push(mesh);
  }else dynamic.push(mesh);
  spatialDynamicMeshSet.add(mesh);
  spatialSelectionStats.dynamicReasons[classification]=(spatialSelectionStats.dynamicReasons[classification]||0)+1;
  if(spatialSelectionStats.dynamicSampleNames.length<32)spatialSelectionStats.dynamicSampleNames.push({name:String(mesh.name||''),reason:classification});
  const reasonSamples=spatialSelectionStats.dynamicSampleNamesByReason[classification]||(spatialSelectionStats.dynamicSampleNamesByReason[classification]=[]);
  if(reasonSamples.length<16){
   const parentChain=[];
   for(let node=mesh;node&&node!==scene&&parentChain.length<10;node=node.parent)parentChain.push(String(node.name||''));
   reasonSamples.push({name:String(mesh.name||''),parentChain});
  }
  updateSpatialSelectionCounts();
 };
 const removeSpatialDynamicMesh=mesh=>{
  const dynamic=spatialSelectionOctree&&spatialSelectionOctree.dynamicContent;
  if(!mesh||!mesh.__elsnSpatialDynamic)return;
  if(dynamic&&typeof dynamic.indexOf==='function'){
   const index=dynamic.indexOf(mesh);if(index>=0)dynamic.splice(index,1);
  }
  spatialDynamicMeshSet.delete(mesh);
  const reason=String(mesh.__elsnSpatialDynamicReason||'unknown');
  if(spatialSelectionStats.dynamicReasons[reason]>0)spatialSelectionStats.dynamicReasons[reason]--;
  try{delete mesh.__elsnSpatialDynamic;delete mesh.__elsnSpatialDynamicReason;}catch(_){mesh.__elsnSpatialDynamic=false;}
  updateSpatialSelectionCounts();
 };
 if(scene.onNewMeshAddedObservable&&typeof scene.onNewMeshAddedObservable.add==='function'){
  // Meshes born after the index is built cannot be assumed static: constructions,
  // actors, equipment, effects and streamed objects stay in Babylon's dynamic list.
  scene.onNewMeshAddedObservable.add(mesh=>{if(spatialSelectionOctree)addSpatialDynamicMesh(mesh,'created-after-octree',true);});
 }
 if(scene.onMeshRemovedObservable&&typeof scene.onMeshRemovedObservable.add==='function'){
  scene.onMeshRemovedObservable.add(removeSpatialDynamicMesh);
 }
 function buildSpatialSelectionOctree(){
  if(spatialSelectionOctree)return true;
  if(scene.meshes.length<512||typeof scene.createOrUpdateSelectionOctree!=='function')return false;
  if(!scene.onNewMeshAddedObservable||typeof scene.onNewMeshAddedObservable.add!=='function')return false;
  const startedAt=performance.now(),meshCount=scene.meshes.length;
  try{
   const octree=scene.createOrUpdateSelectionOctree(64,3);
   if(!octree||!octree.dynamicContent||typeof octree.dynamicContent.push!=='function'){
    throw new Error('Babylon no devolvió la lista dinámica de la selección espacial.');
   }
   spatialSelectionOctree=octree;
   // Keep Babylon's own overflow/out-of-bounds dynamic entries tracked for safe removal.
   for(const mesh of Array.from(octree.dynamicContent))if(mesh&&!mesh.__elsnSpatialDynamic){
    spatialDynamicMeshSet.add(mesh);
    mesh.__elsnSpatialDynamic=true;mesh.__elsnSpatialDynamicReason='octree-initial-dynamic';
    mesh.__elsnSpatialFreshUntilRenderId=(typeof scene.getRenderId==='function'?scene.getRenderId():0)+2;
    spatialSelectionStats.dynamicReasons['octree-initial-dynamic']=(spatialSelectionStats.dynamicReasons['octree-initial-dynamic']||0)+1;
   }
   for(const mesh of scene.meshes.slice())if(isSpatialDynamicMesh(mesh))addSpatialDynamicMesh(mesh);
   // Babylon's dynamicContent is evaluated by a separate internal path.
   // Do not wrap octree.select(): that method selects static octree blocks and
   // is not the per-frame dynamic candidate list in this Babylon build.
   spatialSelectionStats.dynamicFilterEnabled=false;
   spatialSelectionStats.dynamicFilterPasses=0;
   spatialSelectionStats.enabled=true;
   spatialSelectionStats.sceneMeshCount=meshCount;
   spatialSelectionStats.dynamicMeshCount=octree.dynamicContent.length;
   spatialSelectionStats.buildMs=Number((performance.now()-startedAt).toFixed(2));
   spatialSelectionStats.error=null;
   publishSpatialSelectionStats();
   console.info('Babylon spatial selection ready',{
    sceneMeshes:meshCount,
    dynamicMeshes:spatialSelectionStats.dynamicMeshCount,
    staticIndexedMeshes:Math.max(0,meshCount-spatialSelectionStats.dynamicMeshCount),
    maxDepth:3,
    maxCapacity:64,
    buildMs:spatialSelectionStats.buildMs
   });
   return true;
  }catch(error){
   spatialSelectionOctree=null;
   spatialSelectionStats.enabled=false;
   spatialSelectionStats.sceneMeshCount=meshCount;
   spatialSelectionStats.dynamicMeshCount=0;
   spatialSelectionStats.buildMs=Number((performance.now()-startedAt).toFixed(2));
   spatialSelectionStats.error=String(error&&error.message||error).slice(0,220);
   publishSpatialSelectionStats();
   console.warn('Babylon spatial selection unavailable; original scene selection remains active.',error);
   return false;
  }
 }

"""
    if html.count(scene_marker) != 1:
        raise SystemExit("No se encontró exactamente una construcción de escena Babylon.")
    html = html.replace(scene_marker, scene_marker + "\n" + scene_profile_code, 1)

    runtime_diagnostics_marker = "webglVersion:graphicsVersion,constrainedMobileProfile:isConstrainedMobile,"
    runtime_diagnostics_replacement = "webglVersion:graphicsVersion,babylonEngineVersion:String(B.Engine.Version||'unknown'),engineBackend:graphicsContext&&(typeof WebGL2RenderingContext!=='undefined'&&graphicsContext instanceof WebGL2RenderingContext)?'WebGL2':'WebGL',webGpuApiAvailable:typeof navigator.gpu!=='undefined',profileDiagnosticsEnabled,meshSelectionOctreeEnabled:spatialSelectionStats.enabled,meshSelectionSceneMeshCount:spatialSelectionStats.sceneMeshCount,meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount,meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount,meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio,meshSelectionInitialDynamicCount:spatialSelectionStats.babylonInitialDynamicCount,meshSelectionDynamicReasons:spatialSelectionStats.dynamicReasons,meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason,meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled,meshSelectionDynamicFilterPasses:spatialSelectionStats.dynamicFilterPasses,meshSelectionDynamicFilterCandidates:spatialSelectionStats.dynamicFilterLastCandidates,meshSelectionDynamicFilterSelected:spatialSelectionStats.dynamicFilterLastSelected,meshSelectionDynamicFilterCulled:spatialSelectionStats.dynamicFilterLastCulled,meshSelectionDynamicFilterCulledPeak:spatialSelectionStats.dynamicFilterCulledPeak,meshSelectionDynamicFilterTotalCandidates:spatialSelectionStats.dynamicFilterTotalCandidates,meshSelectionDynamicFilterTotalCulled:spatialSelectionStats.dynamicFilterTotalCulled,meshSelectionDynamicFilterTotalMs:spatialSelectionStats.dynamicFilterTotalMs,meshSelectionDynamicFilterAverageMs:spatialSelectionStats.dynamicFilterPasses?Number((spatialSelectionStats.dynamicFilterTotalMs/spatialSelectionStats.dynamicFilterPasses).toFixed(3)):null,meshSelectionDynamicFilterCullRatio:spatialSelectionStats.dynamicFilterTotalCandidates?Number((spatialSelectionStats.dynamicFilterTotalCulled/spatialSelectionStats.dynamicFilterTotalCandidates).toFixed(4)):null,meshSelectionDynamicFilterLastMs:spatialSelectionStats.dynamicFilterLastMs,meshSelectionDynamicFilterMaxMs:spatialSelectionStats.dynamicFilterMaxMs,meshSelectionDynamicFilterErrors:spatialSelectionStats.dynamicFilterErrors,meshSelectionBuildMs:spatialSelectionStats.buildMs,engineGpuFrameMs:safePerfCounterValue(engineInstrumentation&&engineInstrumentation.gpuFrameTimeCounter,1e6),shaderCompilationMs:safePerfCounterValue(engineInstrumentation&&engineInstrumentation.shaderCompilationTimeCounter),sceneFrameMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.frameTimeCounter),sceneRenderMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.renderTimeCounter),activeMeshesEvaluationMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.activeMeshesEvaluationTimeCounter),renderTargetsMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.renderTargetsRenderTimeCounter),cameraRenderMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.cameraRenderTimeCounter),sceneDrawCalls:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.drawCallsCounter),constrainedMobileProfile:isConstrainedMobile,"
    if html.count(runtime_diagnostics_marker) != 1:
        raise SystemExit("No se encontró exactamente un bloque runtime para el diagnóstico.")
    html = html.replace(runtime_diagnostics_marker,runtime_diagnostics_replacement,1)

    # Build a spatial index only after the complete world is ready, before the campaign selector.
    spatial_startup_marker = "if(firstFrameRendered&&startupAssetsReady&&!startScreenShown){"
    if html.count(spatial_startup_marker) != 1:
        raise SystemExit("No se encontró el punto único para preparar la selección espacial antes de la campaña.")
    html = html.replace(
        spatial_startup_marker,
        spatial_startup_marker + "\n    buildSpatialSelectionOctree();",
        1,
    )


    # Mobile runtime stability without visual downgrades.
    # Guard DynamicTexture uploads against stale/disposed scene owners.
    live_texture_guard_marker = " let engineInstrumentation=null,sceneInstrumentation=null;"
    live_texture_guard = r""" const dynamicTexturePrototype=B.DynamicTexture&&B.DynamicTexture.prototype;
 if(dynamicTexturePrototype&&typeof dynamicTexturePrototype._getEngine==='function'&&!dynamicTexturePrototype._getEngine.__elsnSafeOwnerEngine){
  const originalDynamicTextureGetEngine=dynamicTexturePrototype._getEngine;
  const safeDynamicTextureGetEngine=function(...args){
   let resolved=null;
   try{resolved=originalDynamicTextureGetEngine.apply(this,args);}catch(_){}
   if(resolved)return resolved;
   try{
    const disposed=typeof this.isDisposed==='function'?this.isDisposed():this.isDisposed===true;
    if(disposed)return null;
    const ownerScene=typeof this.getScene==='function'?this.getScene():null;
    if(ownerScene!==scene||typeof ownerScene.getEngine!=='function')return null;
    const ownerEngine=ownerScene.getEngine();
    const engineDisposed=typeof ownerEngine.isDisposed==='function'?ownerEngine.isDisposed():ownerEngine.isDisposed===true;
    if(ownerEngine!==engine||engineDisposed)return null;
    window.__ELSN_DYNAMIC_TEXTURE_ENGINE_RECOVERIES=(window.__ELSN_DYNAMIC_TEXTURE_ENGINE_RECOVERIES||0)+1;
    return ownerEngine;
   }catch(_){return null;}
  };
  Object.defineProperty(safeDynamicTextureGetEngine,'__elsnSafeOwnerEngine',{value:true});
  dynamicTexturePrototype._getEngine=safeDynamicTextureGetEngine;
 }
 const isLiveDynamicTexture=texture=>{
  try{
   if(!texture||typeof texture.update!=='function')return false;
   const disposed=typeof texture.isDisposed==='function'?texture.isDisposed():texture.isDisposed===true;
   if(disposed)return false;
   const ownerScene=typeof texture.getScene==='function'?texture.getScene():null;
   if(!ownerScene||ownerScene!==scene||typeof ownerScene.getEngine!=='function')return false;
   const ownerEngine=ownerScene.getEngine();
   const textureEngine=typeof texture._getEngine==='function'?texture._getEngine():null;
   const engineDisposed=typeof ownerEngine.isDisposed==='function'?ownerEngine.isDisposed():ownerEngine.isDisposed===true;
   return ownerEngine===engine&&textureEngine===engine&&!engineDisposed;
  }catch(_){return false;}
 };
 if(dynamicTexturePrototype&&typeof dynamicTexturePrototype.update==='function'&&!dynamicTexturePrototype.update.__elsnSafeUpdate){
  const originalDynamicTextureUpdate=dynamicTexturePrototype.update;
  const safeDynamicTextureUpdate=function(...args){
   if(!isLiveDynamicTexture(this)){
    window.__ELSN_DYNAMIC_TEXTURE_UPDATE_SKIPS=(window.__ELSN_DYNAMIC_TEXTURE_UPDATE_SKIPS||0)+1;
    return false;
   }
   return originalDynamicTextureUpdate.apply(this,args);
  };
  Object.defineProperty(safeDynamicTextureUpdate,'__elsnSafeUpdate',{value:true});
  dynamicTexturePrototype.update=safeDynamicTextureUpdate;
 }
 const updateDynamicTextureSafely=(texture,...args)=>{
  if(!isLiveDynamicTexture(texture))return false;
  return texture.update(...args)!==false;
 };
"""
    if html.count(live_texture_guard_marker) != 1:
        raise SystemExit("No se encontró el punto único para proteger DynamicTexture.")
    html = html.replace(live_texture_guard_marker, live_texture_guard + "\n" + live_texture_guard_marker, 1)

    # A coastal job belongs to one island. Cancel it before disposing that island's
    # DynamicTexture; otherwise a stale final upload can call Babylon with a null engine.
    beach_chunk_marker = "beachWorkScheduled=false;const layer=beachWorkLayer;if(!layer)return;\n   const sliceStarted=performance.now()"
    beach_chunk_replacement = "beachWorkScheduled=false;const layer=beachWorkLayer;if(!layer)return;\n   if(layer.index!==activeBeachIslandIndex||!layer.mesh||(typeof layer.mesh.isDisposed==='function'&&layer.mesh.isDisposed())||!isLiveDynamicTexture(layer.coastalStateTexture)){beachWorkLayer=null;beachWorkCellCursor=0;beachWorkVertexCursor=0;beachWorkCellsProcessed=0;return;}\n   const sliceStarted=performance.now()"
    if html.count(beach_chunk_marker) != 1:
        raise SystemExit("No se encontró el inicio único del trabajo costero.")
    html = html.replace(beach_chunk_marker, beach_chunk_replacement, 1)

    # Expose cancellation through the subsystem that owns its private coastal job state.
    # The caller must never reach into GroundDynamics' IIFE-local cursors directly.
    beach_cancel_api_marker = "return {update,reset,setFootprintStrength:value=>footprintMaterial.setFloat('footprintStrength',Math.max(0,Number(value)||0)),counts:()=>({"
    beach_cancel_api_replacement = "return {update,reset,cancelBeachWorkForIsland:index=>{if(!Number.isInteger(index)||!beachWorkLayer||beachWorkLayer.index!==index)return false;beachWorkLayer=null;beachWorkCellCursor=0;beachWorkVertexCursor=0;beachWorkScheduled=false;beachWorkCellsProcessed=0;return true;},setFootprintStrength:value=>footprintMaterial.setFloat('footprintStrength',Math.max(0,Number(value)||0)),counts:()=>({"
    if html.count(beach_cancel_api_marker) != 1:
        raise SystemExit("No se encontró la API única de GroundDynamics para cancelar el trabajo costero.")
    html = html.replace(beach_cancel_api_marker, beach_cancel_api_replacement, 1)
    beach_switch_marker = "if(previousIndex>=0&&previousIndex!==nextIndex)disposeActiveCoastalIslandSystems(previousIndex);"
    beach_switch_replacement = """if(previousIndex>=0&&previousIndex!==nextIndex){
   GroundDynamics.cancelBeachWorkForIsland(previousIndex);
   disposeActiveCoastalIslandSystems(previousIndex);
  }"""
    if html.count(beach_switch_marker) != 1:
        raise SystemExit("No se encontró el cambio único de isla costera.")
    html = html.replace(beach_switch_marker, beach_switch_replacement, 1)

    # Use the same live-owner guard for the three runtime DynamicTexture upload paths.
    for old, new, expected in (
        ("footprintTexture.update(footprintAtlas.textureData());", "updateDynamicTextureSafely(footprintTexture,footprintAtlas.textureData());", 1),
        ("layer.coastalStateTexture.update(state.rgba);beachStateTextureUploads++;", "if(updateDynamicTextureSafely(layer.coastalStateTexture,state.rgba))beachStateTextureUploads++;", 1),
        ("skyTexture.update(false);", "updateDynamicTextureSafely(skyTexture,false);", 2),
    ):
        if html.count(old) != expected:
            raise SystemExit("Número inesperado de actualizaciones DynamicTexture: " + old)
        html = html.replace(old, new)

    # Beach diagnostics: distinguish wall-clock completion from actual sliced CPU work.
    beach_diagnostic_replacements = (
        (
            "let groundDynamicsLastUpdateMs=0,beachUpdateLastMs=0;",
            "let groundDynamicsLastUpdateMs=0,beachUpdateLastMs=0,beachUpdateCpuMs=0;",
        ),
        (
            "const beachUpdateSamples=new Float32Array(120);let beachUpdateSampleCount=0,beachUpdateSampleCursor=0;",
            "const beachUpdateSamples=new Float32Array(120),beachUpdateCpuSamples=new Float32Array(120);let beachUpdateSampleCount=0,beachUpdateSampleCursor=0;",
        ),
        (
            "let beachWorkStartedAt=0,beachWorkLastSliceMs=0,beachWorkMaxSliceMs=0,beachWorkCellsProcessed=0;",
            "let beachWorkStartedAt=0,beachWorkLastSliceMs=0,beachWorkMaxSliceMs=0,beachWorkCellsProcessed=0,beachWorkCpuTotalMs=0;",
        ),
        (
            "const sliceMs=performance.now()-sliceStarted;beachWorkLastSliceMs=Number(sliceMs.toFixed(3));beachWorkMaxSliceMs=Math.max(beachWorkMaxSliceMs,sliceMs);",
            "const sliceMs=performance.now()-sliceStarted;beachWorkCpuTotalMs+=sliceMs;beachWorkLastSliceMs=Number(sliceMs.toFixed(3));beachWorkMaxSliceMs=Math.max(beachWorkMaxSliceMs,sliceMs);",
        ),
        (
            "beachUpdateLastMs=performance.now()-beachWorkStartedAt;\n    beachUpdateSamples[beachUpdateSampleCursor]=beachUpdateLastMs;beachUpdateSampleCursor=(beachUpdateSampleCursor+1)%beachUpdateSamples.length;beachUpdateSampleCount=Math.min(beachUpdateSampleCount+1,beachUpdateSamples.length);",
            "beachUpdateLastMs=performance.now()-beachWorkStartedAt;beachUpdateCpuMs=beachWorkCpuTotalMs;\n    beachUpdateSamples[beachUpdateSampleCursor]=beachUpdateLastMs;beachUpdateCpuSamples[beachUpdateSampleCursor]=beachUpdateCpuMs;beachUpdateSampleCursor=(beachUpdateSampleCursor+1)%beachUpdateSamples.length;beachUpdateSampleCount=Math.min(beachUpdateSampleCount+1,beachUpdateSamples.length);",
        ),
        (
            "beachWorkStartedAt=performance.now();\n   if(layer.material)",
            "beachWorkStartedAt=performance.now();beachWorkCpuTotalMs=0;\n   if(layer.material)",
        ),
        (
            "beachWorkMaxSliceMs:Number(beachWorkMaxSliceMs.toFixed(3)),beachWorkCellsProcessed})};",
            "beachWorkMaxSliceMs:Number(beachWorkMaxSliceMs.toFixed(3)),beachWorkCellsProcessed,beachWorkProgress:{active:!!beachWorkLayer,islandIndex:beachWorkLayer?beachWorkLayer.index:null,cellCursor:beachWorkCellCursor,cellTotal:beachWorkLayer?beachWorkLayer.coastalState.size:0,vertexCursor:beachWorkVertexCursor,vertexTotal:beachWorkLayer?beachWorkLayer.baseY.length:0,elapsedMs:beachWorkLayer?Number((performance.now()-beachWorkStartedAt).toFixed(2)):0,sliceCpuMs:Number(beachWorkCpuTotalMs.toFixed(2))}})};",
        ),
        (
            "const beachCpuSamples=Array.from(beachUpdateSamples.subarray(0,beachUpdateSampleCount)).sort((a,b)=>a-b);\n  const beachCpuP95=beachCpuSamples.length?Number(beachCpuSamples[Math.min(beachCpuSamples.length-1,Math.floor((beachCpuSamples.length-1)*.95))].toFixed(3)):null;",
            "const beachElapsedSamples=Array.from(beachUpdateSamples.subarray(0,beachUpdateSampleCount)).sort((a,b)=>a-b);\n  const beachElapsedP95=beachElapsedSamples.length?Number(beachElapsedSamples[Math.min(beachElapsedSamples.length-1,Math.floor((beachElapsedSamples.length-1)*.95))].toFixed(3)):null;\n  const beachCpuSamples=Array.from(beachUpdateCpuSamples.subarray(0,beachUpdateSampleCount)).sort((a,b)=>a-b);\n  const beachCpuP95=beachCpuSamples.length?Number(beachCpuSamples[Math.min(beachCpuSamples.length-1,Math.floor((beachCpuSamples.length-1)*.95))].toFixed(3)):null;",
        ),
        (
            "beachUpdateMs:Number(beachUpdateLastMs.toFixed(2)),",
            "beachUpdateMs:Number(beachUpdateLastMs.toFixed(2)),beachUpdateElapsedMs:Number(beachUpdateLastMs.toFixed(2)),beachUpdateCpuMs:Number(beachUpdateCpuMs.toFixed(2)),",
        ),
        (
            "cpuUpdateLastMs:Number(beachUpdateLastMs.toFixed(3)),cpuUpdateP95Ms:beachCpuP95,samples:beachUpdateSampleCount,",
            "cpuUpdateLastMs:Number(beachUpdateCpuMs.toFixed(3)),elapsedUpdateLastMs:Number(beachUpdateLastMs.toFixed(3)),cpuUpdateP95Ms:beachCpuP95,elapsedUpdateP95Ms:beachElapsedP95,workProgress:GroundDynamics.counts().beachWorkProgress,renderDiagnostics:beachRenderDiagnostics,samples:beachUpdateSampleCount,",
        ),
    )
    for old, new in beach_diagnostic_replacements:
        if html.count(old) != 1:
            raise SystemExit("No se pudo instrumentar de forma única el diagnóstico de la playa: " + old[:100])
        html = html.replace(old, new, 1)

    # Inspect the actual shader/material and its four textures when a session report is requested.
    beach_render_marker = "  const activeBeachLayer=livingBeachLayers[activeBeachIslandIndex]||null;\n"
    beach_render_code = r"""  const activeBeachLayer=livingBeachLayers[activeBeachIslandIndex]||null;
  const beachTextureStatus=texture=>{
   try{
    if(!texture)return null;
    const size=typeof texture.getSize==='function'?texture.getSize():null;
    const internal=typeof texture.getInternalTexture==='function'?texture.getInternalTexture():null;
    const disposed=typeof texture.isDisposed==='function'?texture.isDisposed():texture.isDisposed===true;
    return {name:String(texture.name||''),ready:typeof texture.isReady==='function'?!!texture.isReady():null,disposed,width:size&&Number.isFinite(size.width)?size.width:null,height:size&&Number.isFinite(size.height)?size.height:null,hasInternalTexture:!!internal,internalReady:internal&&typeof internal.isReady==='boolean'?internal.isReady:null};
   }catch(error){return {error:String(error).slice(0,240)};}
  };
  const beachRenderDiagnostics=activeBeachLayer?(()=>{
   const mesh=activeBeachLayer.mesh,material=activeBeachLayer.material;
   let effect=null,materialReady=null,effectReady=null,compilationError=null;
   try{effect=material&&(typeof material.getEffect==='function'?material.getEffect():material._effect)||null;}catch(error){compilationError=String(error).slice(0,500);}
   try{if(material&&typeof material.isReady==='function')materialReady=!!material.isReady(mesh);}catch(error){compilationError=String(error).slice(0,500);}
   try{if(effect&&typeof effect.isReady==='function')effectReady=!!effect.isReady();if(effect&&typeof effect.getCompilationError==='function')compilationError=effect.getCompilationError()||compilationError;}catch(error){compilationError=String(error).slice(0,500);}
   return {
    meshEnabled:!!(mesh&&(typeof mesh.isEnabled==='function'?mesh.isEnabled():true)),
    meshVisible:!!(mesh&&mesh.isVisible),
    vertexCount:mesh&&typeof mesh.getTotalVertices==='function'?mesh.getTotalVertices():0,
    hasVertexAlpha:!!(mesh&&mesh.hasVertexAlpha),
    materialClass:material&&typeof material.getClassName==='function'?material.getClassName():null,
    materialReady,effectReady,compilationError,
    textures:{albedo:beachTextureStatus(texCoastalSand),roughness:beachTextureStatus(texCoastalSandRoughnessPbr),normal:beachTextureStatus(texCoastalSandNormalPbr),state:beachTextureStatus(activeBeachLayer.coastalStateTexture)}
   };
  })():null;
"""
    if html.count(beach_render_marker) != 1:
        raise SystemExit("No se encontró exactamente el punto de captura del material de arena.")
    html = html.replace(beach_render_marker, beach_render_code, 1)

    # Prebuild the existing hearth/chimney smoke pools during the blocking load,
    # yielding between small batches so the first gameplay frames only animate ready puffs.
    smoke_registry_marker = " const smokeEmitters=[],fireLights=[],ambientPeople=[],ambientBirds=[];"
    smoke_registry_replacement = """ const smokeEmitters=[],fireLights=[],ambientPeople=[],ambientBirds=[];
 function createAmbientSmokePuffs(source,sourceIndex){
  if(!source||source.puffs)return 0;
  const puffCount=source.fire?3:2,puffs=[];
  for(let puffIndex=0;puffIndex<puffCount;puffIndex++){
   const puff=sphere('VillageSmokePuff_'+sourceIndex+'_'+puffIndex,null,[source.x,source.y,source.z],[.20,.20,.20],M.smoke,8);
   const material=M.smoke.clone('SmokeMat_'+sourceIndex+'_'+puffIndex);
   material.alpha=source.fire?.13:.10;material.disableLighting=true;puff.material=material;puff.setEnabled(false);
   puffs.push({mesh:puff,phase:puffIndex/puffCount,mat:material});
  }
  source.puffs=puffs;return puffs.length;
 }
 async function prepareAmbientSmokePuffs(){
  const started=performance.now();let prepared=0;
  for(let index=0;index<smokeEmitters.length;index++){
   prepared+=createAmbientSmokePuffs(smokeEmitters[index],index);
   if((index+1)%2===0&&index+1<smokeEmitters.length)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  }
  recordStartupTask('Piscinas de humo ambiental',started,performance.now(),'ready',{emitters:smokeEmitters.length,puffs:prepared,batchEmitters:2});
  return prepared;
 }"""
    if html.count(smoke_registry_marker) != 1:
        raise SystemExit("No se encontró el registro único de emisores de humo para preparar sus piscinas.")
    html = html.replace(smoke_registry_marker, smoke_registry_replacement, 1)

    smoke_lazy_marker = "if(!source.puffs){source.puffs=[];const puffCount=source.fire?3:2;for(let p=0;p<puffCount;p++){const puff=sphere('VillageSmokePuff_'+si+'_'+p,null,[source.x,source.y,source.z],[.20,.20,.20],M.smoke,8);const pm=M.smoke.clone('SmokeMat_'+si+'_'+p);pm.alpha=source.fire ? 0.13 : 0.10;pm.disableLighting=true;puff.material=pm;source.puffs.push({mesh:puff,phase:p/puffCount,mat:pm});}}"
    smoke_lazy_replacement = "if(!source.puffs)createAmbientSmokePuffs(source,si);"
    if html.count(smoke_lazy_marker) != 1:
        raise SystemExit("No se encontró el único bloque de creación perezosa de puffs de humo.")
    html = html.replace(smoke_lazy_marker, smoke_lazy_replacement, 1)

    smoke_warmup_marker = " let sceneWarmupStatus='unavailable';"
    smoke_warmup_replacement = " await prepareAmbientSmokePuffs();\n await new Promise(resolve=>requestAnimationFrame(()=>resolve()));\n const initialHabitableAuditStartedAt=performance.now();\n const initialHabitableAudit=auditHabitableStructures(true);\n recordStartupTask('Auditoría inicial de asentamientos',initialHabitableAuditStartedAt,performance.now(),'ready',{structures:habitableStructureRegistry.length,repaired:initialHabitableAudit&&initialHabitableAudit.repaired||0,hiddenUnsafe:initialHabitableAudit&&initialHabitableAudit.hiddenUnsafe||0,autoRegistered:initialHabitableAudit&&initialHabitableAudit.autoRegisteredRoots&&initialHabitableAudit.autoRegisteredRoots.length||0});\n const reflectionWarmupStartedAt=performance.now();syncNordicWaterReflectionIsland();recordStartupTask('Lista inicial de reflejos nórdicos',reflectionWarmupStartedAt,performance.now(),'ready',{islandIndex:activeWaterReflectionIslandIndex,reflectedMeshes:nordicWaterMirror&&nordicWaterMirror.renderList?nordicWaterMirror.renderList.length:0});\n let sceneWarmupStatus='unavailable';"
    if html.count(smoke_warmup_marker) != 1:
        raise SystemExit("No se encontró el inicio único de la barrera de shaders para preparar primero los efectos ambientales.")
    html = html.replace(smoke_warmup_marker, smoke_warmup_replacement, 1)

    # Make the existing mineable granite deposits read as angular rock, not smooth black orbs.
    mineable_rock_marker = """function createRock(x,z){
  const gy=renderedTerrainSurfaceAt(x,z),sx=rand(1.0,1.8),sy=rand(1.0,1.6),sz=rand(1,1.7);
  let r=sphere('graniteBoulder',null,[x,gy+sy*.49,z],[sx,sy,sz],M.stone,12);
  let cap=sphere('rockFacet',null,[x-.18,gy+sy*.72,z-.10],[sx*.62,sy*.36,sz*.62],M.stoneLight,10);
  return {meshes:[r,cap],x,z,radius:Math.max(sx,sz)*.48,alive:true,hp:3,hitFlash:0,basePositions:[r.position.clone(),cap.position.clone()],baseScales:[r.scaling.clone(),cap.scaling.clone()]};
 }"""
    mineable_rock_replacement = """// Reuse the existing, already-loaded granite materials. Cloning a new StandardMaterial
  // here creates a new shader variant that can remain unready on mobile/software GPUs.
  const mineableGraniteMaterial=M.stoneLight;
  function createRock(x,z){
   const gy=renderedTerrainSurfaceAt(x,z),sx=rand(.72,1.02),sy=rand(.70,.94),sz=rand(.68,1.00);
   const r=B.MeshBuilder.CreateIcoSphere('graniteBoulder',{radius:1,subdivisions:2,flat:true},scene);
   r.position=v(x,gy+sy*.40,z);r.scaling=v(sx,sy,sz);r.material=mineableGraniteMaterial;r.isPickable=true;r.receiveShadows=true;
   r.rotation.set(rand(-.10,.10),rand(0,Math.PI*2),rand(-.12,.12));
   const cap=B.MeshBuilder.CreateIcoSphere('rockFacet',{radius:1,subdivisions:1,flat:true},scene);
   cap.position=v(x-sx*.14,gy+sy*.65,z-sz*.11);cap.scaling=v(sx*.52,sy*.30,sz*.48);cap.material=M.stone;cap.isPickable=true;cap.receiveShadows=true;
   cap.rotation.set(rand(-.12,.12),r.rotation.y+.42,rand(-.10,.10));
   const radius=Math.max(sx,sz)*.50;
   return {meshes:[r,cap],x,z,radius,alive:true,hp:3,hitFlash:0,basePositions:[r.position.clone(),cap.position.clone()],baseScales:[r.scaling.clone(),cap.scaling.clone()]};
  }"""
    mineable_rock_pattern = r"(?m)^[ \t]*function createRock\(x,z\)\{\n.*?\n[ \t]*\}"
    html, mineable_rock_count = re.subn(mineable_rock_pattern, lambda _match: mineable_rock_replacement, html, count=1, flags=re.DOTALL)
    if mineable_rock_count != 1:
        raise SystemExit(f"No se encontró una única función createRock para transformar: {mineable_rock_count} coincidencias.")

    # Never stamp the ground footprint atlas on top of resource boulders or registered structures.
    footprint_surface_marker = """function makeFootprint(islandIndex,x,z,heading,wet,beach,running,waterCovered=false){
   if(waterCovered)return;
   syncFootprintAtlasFocus(x,z);
   const strength=wet?.90:(beach?.78:.58),currentTick=Math.floor((performance.now()*.001)/.25)%65536;
   if(footprintAtlas.stamp(x,z,heading,strength,currentTick))footprintAtlasDirty=true;
  }"""
    footprint_surface_replacement = """function makeFootprint(islandIndex,x,z,heading,wet,beach,running,waterCovered=false){
   if(waterCovered)return;
   let blocked=false;
   if(collisionGrid&&typeof collisionCellKey==='function'){
    const bucket=collisionGrid.get(collisionCellKey(Math.floor(x/COLLISION_CELL_SIZE),Math.floor(z/COLLISION_CELL_SIZE)));
    if(bucket)for(const entry of bucket){
     const ref=entry&&entry.ref;if(!ref||ref.active===false)continue;
     const dx=x-ref.x,dz=z-ref.z;
     if(entry.kind==='tree'&&ref.alive&&dx*dx+dz*dz<((ref.radius||.48)+.28)**2){blocked=true;break;}
     if(entry.kind==='rock'&&ref.alive&&dx*dx+dz*dz<((ref.radius||.75)+.34)**2){blocked=true;break;}
     if(entry.kind==='world'){
      if(ref.type==='circle'&&dx*dx+dz*dz<(ref.r+.24)*(ref.r+.24)){blocked=true;break;}
      if(ref.type!=='circle'&&Math.abs(dx)<ref.hx+.24&&Math.abs(dz)<ref.hz+.24){blocked=true;break;}
     }
    }
   }else{
    for(const rock of rocks)if(rock.alive&&Math.hypot(x-rock.x,z-rock.z)<(rock.radius||.75)+.34){blocked=true;break;}
    if(!blocked)for(const tree of trees)if(tree.alive&&Math.hypot(x-tree.x,z-tree.z)<(tree.radius||.48)+.28){blocked=true;break;}
    if(!blocked)for(const collider of worldColliders){
     if(collider.active===false)continue;
     const dx=x-collider.x,dz=z-collider.z;
     if(collider.type==='circle'?dx*dx+dz*dz<(collider.r+.24)*(collider.r+.24):Math.abs(dx)<collider.hx+.24&&Math.abs(dz)<collider.hz+.24){blocked=true;break;}
    }
   }
   if(blocked)return;
   syncFootprintAtlasFocus(x,z);
   const strength=wet?.90:(beach?.78:.58),currentTick=Math.floor((performance.now()*.001)/.25)%65536;
   if(footprintAtlas.stamp(x,z,heading,strength,currentTick))footprintAtlasDirty=true;
  }"""
    footprint_surface_pattern = r"(?m)^[ \t]*function makeFootprint\(islandIndex,x,z,heading,wet,beach,running,waterCovered=false\)\{\n.*?\n[ \t]*\}"
    html, footprint_surface_count = re.subn(footprint_surface_pattern, lambda _match: footprint_surface_replacement, html, count=1, flags=re.DOTALL)
    if footprint_surface_count != 1:
        raise SystemExit(f"No se encontró una única función makeFootprint para transformar: {footprint_surface_count} coincidencias.")

    # Incremental discovery: avoid scanning all 5,000+ TransformNodes twice every 1.5 s.
    # Existing roots are indexed once; future habitable roots are queued by Babylon's
    # onNewTransformNodeAddedObservable and consumed on the next integrity audit.
    audit_discovery_marker = "  const trackedBeforeDiscovery=new Set(habitableStructureRegistry.map(entry=>entry.root));\n  for(const node of scene.transformNodes){"
    audit_discovery_replacement = """  if(!auditHabitableStructures.discoveryQueue){
   const initialQueue=new Set(scene.transformNodes.filter(node=>roofedRootPattern.test(node.name||'')));
   auditHabitableStructures.discoveryQueue=initialQueue;
   if(scene.onNewTransformNodeAddedObservable&&typeof scene.onNewTransformNodeAddedObservable.add==='function'){
    scene.onNewTransformNodeAddedObservable.add(node=>{if(node&&roofedRootPattern.test(node.name||''))initialQueue.add(node);});
   }
  }
  const discoveryQueue=auditHabitableStructures.discoveryQueue;
  const pendingDiscovery=Array.from(discoveryQueue);discoveryQueue.clear();
  const trackedBeforeDiscovery=new Set(habitableStructureRegistry.map(entry=>entry.root));
  for(const node of pendingDiscovery){"""
    if html.count(audit_discovery_marker) != 1:
        raise SystemExit("No se encontró el escaneo único de raíces habitables.")
    html = html.replace(audit_discovery_marker, audit_discovery_replacement, 1)

    untracked_marker = "const untrackedRoots=scene.transformNodes.filter(node=>roofedRootPattern.test(node.name||'')&&!registeredRoots.has(node)).map(node=>node.name);"
    untracked_replacement = "const untrackedRoots=Array.from(discoveryQueue).filter(node=>roofedRootPattern.test(node.name||'')&&!registeredRoots.has(node)).map(node=>node.name);"
    if html.count(untracked_marker) != 1:
        raise SystemExit("No se encontró el segundo escaneo completo de raíces habitables.")
    html = html.replace(untracked_marker, untracked_replacement, 1)

    # Preserve full-rate player/rendering while capping expensive touch-device combat
    # and companion decision passes at 30 Hz; constrained mobiles retain their existing caps.
    for old, new in (
        ("const enemyAiInterval=isConstrainedMobile?.05:(1/60);", "const enemyAiInterval=isTouchDevice?(isConstrainedMobile?.05:(1/30)):(1/60);"),
        ("const companionAiInterval=isConstrainedMobile?.0667:(1/60);", "const companionAiInterval=isTouchDevice?(isConstrainedMobile?.0667:(1/30)):(1/60);"),
    ):
        if html.count(old) != 1:
            raise SystemExit("No se encontró la cadencia AI esperada: " + old)
        html = html.replace(old, new, 1)

    # Babylon's raw draw-call counter is cumulative in this runtime. Report the
    # per-rendered-frame delta rather than a growing session total.
    draw_state_marker = "let perfAuditCount=0,perfAuditCursor=0,perfAuditScenario='sin seleccionar',perfAuditScenarioStartedAt=performance.now(),perfAuditFrameCounter=0;"
    draw_state_replacement = draw_state_marker + "\n let lastObservedDrawCallsTotal=null,lastObservedDrawCallsPerFrame=null;"
    if html.count(draw_state_marker) != 1:
        raise SystemExit("No se encontró el estado único del auditor de rendimiento.")
    html = html.replace(draw_state_marker, draw_state_replacement, 1)

    draw_read_marker = "const c=perfAuditCursor,draw=Number(engine&&engine._drawCalls&&engine._drawCalls.current);"
    draw_read_replacement = """const c=perfAuditCursor,currentDrawTotal=Number(engine&&engine._drawCalls&&engine._drawCalls.current);
  let draw=-1;
  if(Number.isFinite(currentDrawTotal)&&currentDrawTotal>=0){
   if(lastObservedDrawCallsTotal!==null&&currentDrawTotal>=lastObservedDrawCallsTotal)draw=currentDrawTotal-lastObservedDrawCallsTotal;
   lastObservedDrawCallsTotal=currentDrawTotal;
   if(draw>=0)lastObservedDrawCallsPerFrame=draw;
  }"""
    if html.count(draw_read_marker) != 1:
        raise SystemExit("No se encontró el contador acumulativo de draw calls.")
    html = html.replace(draw_read_marker, draw_read_replacement, 1)

    health_draw_marker = "drawCalls:Number(engine._drawCalls&&engine._drawCalls.current)||0,"
    health_draw_replacement = "drawCalls:Number.isFinite(lastObservedDrawCallsPerFrame)?lastObservedDrawCallsPerFrame:null,drawCallsCumulativeRaw:Number(engine._drawCalls&&engine._drawCalls.current)||0,drawCallsMeasurement:'per-rendered-frame delta; cumulative raw counter retained separately',"
    if html.count(health_draw_marker) != 1:
        raise SystemExit("No se encontró el contador drawCalls del informe de salud.")
    html = html.replace(health_draw_marker, health_draw_replacement, 1)

    diagnostic_ai_budget_marker = "enemyAiRateCapHz:isConstrainedMobile?20:60,companionAiRateCapHz:isConstrainedMobile?15:60,"
    diagnostic_ai_budget_replacement = "enemyAiRateCapHz:isConstrainedMobile?20:(isTouchDevice?30:60),companionAiRateCapHz:isConstrainedMobile?15:(isTouchDevice?30:60),"
    if html.count(diagnostic_ai_budget_marker) != 1:
        raise SystemExit("No se encontró el bloque único de telemetría de cadencia AI.")
    html = html.replace(diagnostic_ai_budget_marker, diagnostic_ai_budget_replacement, 1)


    quality_adaptive_marker = r""" let fpsSample=0,qualityDprCurrent=qualityDpr;
 let lastWorldUpdateMs=0,lastRenderCpuMs=0;
 const targetFrameRate=120;
 function adaptRenderQuality(dt){
  // Monitor-only: never lower resolution, DPR, shadow-map size or visual fidelity at runtime.
  fpsSample+=dt;if(fpsSample<(isConstrainedMobile?1.5:2.5))return;fpsSample=0;
  const fps=engine.getFps();
  if(fps<24)console.info('Diagnóstico de rendimiento (calidad bloqueada; sin reducción automática)',{fps:Math.round(fps),targetFrameRate,renderDpr:qualityDprCurrent,shadowMap:currentShadowSize,meshes:scene.meshes.length,vegetationMerge:staticMergeStats});
 }"""
    quality_adaptive_code = r"""let fpsSample=0,qualityDprCurrent=qualityDpr;
 // Shared frame-loop timing state; keep these bindings for the existing world update instrumentation.
 let lastWorldUpdateMs=0,lastRenderCpuMs=0;
 let targetFrameRate=60,observedFpsCeiling=60,lastQualityWarningAt=0;
 function adaptRenderQuality(dt){
  const sampleWindow=highHeadroomQualityMobile?1.0:(isConstrainedMobile?1.5:2.0);
  fpsSample+=Math.max(0,Math.min(.10,dt||0));if(fpsSample<sampleWindow)return;fpsSample=0;
  const fps=engine.getFps();
  if(highHeadroomQualityMobile)observedFpsCeiling=Math.max(observedFpsCeiling,Math.min(120,fps));
  targetFrameRate=highHeadroomQualityMobile?Math.min(90,observedFpsCeiling):60;
  // The initial Quality scale is locked for the session: no CPU hitch can trigger a resolution downgrade.
  if(fps<24&&performance.now()-lastQualityWarningAt>=4000){
   lastQualityWarningAt=performance.now();
   console.warn('EL SIN NOMBRE: FPS bajo con resolución de Calidad protegida.',{fps:Math.round(fps),targetFrameRate,renderDpr:qualityDprCurrent,qualityScaleLockedForSession:true,shadowMap:currentShadowSize,meshes:scene.meshes.length,vegetationMerge:staticMergeStats});
  }
 }"""
    if html.count(quality_adaptive_marker) != 1:
        raise SystemExit("No se encontró exactamente la función original de supervisión de resolución.")
    html = html.replace(quality_adaptive_marker, quality_adaptive_code, 1)

    # Existing instanced water droplets: improve readability without increasing particle count or draw calls.
    splash_visual_replacements = (
        ("particle.size=wet?rand(.068,.104)", "particle.size=wet?rand(.12,.18)"),
        ("particle.life=particle.maxLife=wet?rand(.55,.82)", "particle.life=particle.maxLife=wet?rand(.72,1.02)"),
    )
    for old_code, new_code in splash_visual_replacements:
        if html.count(old_code) != 1:
            raise SystemExit(f"No se encontró exactamente el parámetro original de salpicaduras: {old_code}")
        html = html.replace(old_code, new_code, 1)

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
            "const segments=isPerformanceMode?192:512,rows=isPerformanceMode?10:(isTouchDevice?32:48),cols=segments+1;",
            "densidad radial de NordicSubmergedSand",
        ),
        (
            "const segments=coastColumns,rows=isPerformanceMode?13:(isTouchDevice?15:17),cols=segments+1;",
            "const segments=coastColumns,rows=isPerformanceMode?13:(isTouchDevice?32:48),cols=segments+1;",
            "densidad radial de LivingCoastalSand para coincidir con la triangulación del fondo submarino",
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
        (
            "if(typeof mesh.computeWorldMatrix==='function')mesh.computeWorldMatrix(true);\n    const bounds=mesh.getBoundingInfo&&mesh.getBoundingInfo();\n    const center=bounds&&bounds.boundingBox?bounds.boundingBox.centerWorld:(mesh.getAbsolutePosition&&mesh.getAbsolutePosition());\n    if(!center)continue;\n    const island=land[islandIndex],dx=center.x-island.x,dz=center.z-island.z,reach=island.r+26;",
            "if(typeof mesh.computeWorldMatrix==='function')mesh.computeWorldMatrix(true);\n    const bounds=mesh.getBoundingInfo&&mesh.getBoundingInfo();\n    const center=bounds&&bounds.boundingBox?bounds.boundingBox.centerWorld:(mesh.getAbsolutePosition&&mesh.getAbsolutePosition());\n    if(!center)continue;\n    const meshName=String(mesh.name||'');\n    const vertexCount=Number(mesh.getTotalVertices&&mesh.getTotalVertices())||0;\n    const worldExtent=bounds?.boundingBox?.extendSizeWorld||bounds?.boundingBox?.extendSize;\n    const maxExtent=worldExtent?Math.max(worldExtent.x,worldExtent.y,worldExtent.z):Infinity;\n    const foliageMesh=/(?:grass|foliage|leaf|leaves|branch|needle|shrub|bush|flower|fern|plant)/i.test(meshName);\n    const thinInstanceBatch=(Number(mesh.thinInstanceCount)||0)>0;\n    const majorReflector=/(?:tree|pine|oak|rock|boulder|hut|house|hall|tower|outpost|ship|drakkar|viking|player|guard|warrior|raider|terrain|ground|beach|coast)/i.test(meshName);\n    const tinyReflectionDetail=vertexCount<96&&maxExtent<.85&&!majorReflector;\n    if(foliageMesh||thinInstanceBatch||tinyReflectionDetail){reflectionFilteredMeshCount++;continue;}\n    const island=land[islandIndex],dx=center.x-island.x,dz=center.z-island.z,reach=island.r+26;",
            "Filter foliage batches and tiny details out of the water mirror while retaining major silhouettes",
        ),
        (
            "  list.length=0;",
            "  list.length=0;let reflectionFilteredMeshCount=0;",
            "count filtered reflection meshes",
        ),
        (
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length});",
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length,filteredFoliageAndTinyDetails:reflectionFilteredMeshCount});",
            "report reflection culling effectiveness",
        ),
        (
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:2);",
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?3:4));",
            "cache high-quality shadows for three/four frames on mobile",
        ),
        (
            "renderPipeline.fxaaEnabled=true;renderPipeline.bloomEnabled=false;renderPipeline.grainEnabled=false;renderPipeline.chromaticAberrationEnabled=false;",
            "renderPipeline.fxaaEnabled=!highHeadroomQualityMobile;renderPipeline.bloomEnabled=false;renderPipeline.grainEnabled=false;renderPipeline.chromaticAberrationEnabled=false;",
            "avoid stacking FXAA on native 2x MSAA in the flagship quality profile",
        ),
        (
            "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?1:4,maxSamples));",
            "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples));",
            "enable 2x MSAA on high-headroom touch devices",
        ),
        (
            "  list.length=0;let reflectionFilteredMeshCount=0;",
            "  list.length=0;let reflectionFilteredMeshCount=0,reflectionLimitDiscardedMeshCount=0;",
            "count filtered reflection meshes",
        ),
        (
            "if(dx*dx+dz*dz<reach*reach)list.push(mesh);",
            "if(dx*dx+dz*dz<reach*reach){if(list.length<180)list.push(mesh);else reflectionLimitDiscardedMeshCount++;}",
            "cap the reflected island draw list at 260 representative meshes",
        ),
        (
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length,filteredFoliageAndTinyDetails:reflectionFilteredMeshCount});",
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length,filteredFoliageAndTinyDetails:reflectionFilteredMeshCount,reflectionLimitDiscardedMeshCount});",
            "report water-reflection draw-list cap",
        ),
        (
            "const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024;",
            "const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024;",
            "reduce mobile mirror target size while retaining a live water reflection",
        ),
        (
            "nordicWaterMirror.refreshRate=isTouchDevice?12:8;",
            "nordicWaterMirror.refreshRate=isTouchDevice?12:8;",
            "refresh the mobile water mirror once every 20–24 frames",
        ),
        (
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?3:4));",
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?10:4));",
            "reuse high-quality mobile shadows for six frames",
        ),
        (
            "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples));",
            "renderPipeline.samples=Math.max(1,Math.min(isTouchDevice?(highHeadroomQualityMobile?2:1):4,maxSamples));if(highHeadroomQualityMobile&&renderPipeline.sharpen){renderPipeline.sharpenEnabled=true;renderPipeline.sharpen.edgeAmount=.34;renderPipeline.sharpen.colorAmount=.92;}",
            "use native 2x MSAA and restrained sharpening for flagship mobile without a second spatial upscaling pass",
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
     isPerformanceMode,isTouchDevice,isConstrainedMobile,highHeadroomQualityMobile,reportedMemory,
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

    # Expose a read-only, on-demand snapshot from the same lexical scope as the Babylon scene.
    # This function is called only when the Inspector user requests a world capture.
    world_snapshot_marker = " window.copyGameHealthDebug=()=>{"
    world_snapshot_code = r"""
 window.getGameWorldInspectionSnapshot=(options={})=>{
  if(!window.ELSNWorldInspection||typeof window.ELSNWorldInspection.capture!=='function'){
   throw new Error('El módulo de inspección del mundo no está disponible.');
  }
  const health=typeof window.getGameHealthDebug==='function'?window.getGameHealthDebug():null;
  return window.ELSNWorldInspection.capture({
   scene,land,player,villages,enemies,campGuards,companions,enemyShips,ambientFauna,ambientPeople,ambientBirds,
   worldColliders,habitableStructureRegistry,lastHabitableStructureAudit,islandTerrainMeshes,
   terrainHeightAt:(x,z)=>renderedTerrainSurfaceAt(x,z),
   playerDiagnostics:health?.player||null,
   runtime:{gameStarted:health?.gameStarted===true,worldUpdatePhase:health?.worldUpdatePhase??null,worldUpdateCount:health?.worldUpdateCount??null,fps:health?.runtime?.fps??null,graphicsProfile:health?.runtime?.graphicsProfile??null}
  },options);
 };
"""
    if html.count(world_snapshot_marker) != 1:
        raise SystemExit("No se encontró exactamente una API de copia del diagnóstico para exponer la inspección del mundo.")
    html = html.replace(world_snapshot_marker, world_snapshot_code + "\n" + world_snapshot_marker, 1)



    # 0.6.309: time every existing world-update phase without changing its work or cadence.
    phase_update_marker = "function update(dt){"
    phase_timing_helpers = r"""const worldPhaseTimingStats=Object.create(null);
let worldPhaseTimingCurrent='',worldPhaseTimingStartedAt=0;
function flushWorldPhaseTiming(now){
 if(!worldPhaseTimingCurrent||worldPhaseTimingStartedAt<=0)return;
 const elapsed=Math.max(0,now-worldPhaseTimingStartedAt);
 let row=worldPhaseTimingStats[worldPhaseTimingCurrent];
 if(!row)row=worldPhaseTimingStats[worldPhaseTimingCurrent]={samples:0,lastMs:0,totalMs:0,meanMs:0,maxMs:0,samplesMs:new Float32Array(120),sampleCursor:0,sampleCount:0};
 row.samples++;row.lastMs=elapsed;row.totalMs+=elapsed;row.meanMs=row.totalMs/row.samples;row.maxMs=Math.max(row.maxMs,elapsed);
 row.samplesMs[row.sampleCursor]=elapsed;row.sampleCursor=(row.sampleCursor+1)%row.samplesMs.length;row.sampleCount=Math.min(row.samplesMs.length,row.sampleCount+1);
}
function setWorldUpdatePhase(value){
 const nextPhase=String(value||'unknown');
 const now=performance.now();
 if(nextPhase!==worldPhaseTimingCurrent){flushWorldPhaseTiming(now);worldPhaseTimingCurrent=nextPhase;worldPhaseTimingStartedAt=now;}
 worldUpdatePhase=nextPhase;
}
function finishWorldPhaseTiming(){
 flushWorldPhaseTiming(performance.now());worldPhaseTimingCurrent='';worldPhaseTimingStartedAt=0;
}
function getWorldPhaseTimingSnapshot(){
 const snapshot={};
 for(const [phase,row] of Object.entries(worldPhaseTimingStats)){
  const values=Array.from(row.samplesMs).slice(0,row.sampleCount).sort((a,b)=>a-b),at=p=>values.length?Number(values[Math.min(values.length-1,Math.floor((values.length-1)*p))].toFixed(3)):null;
  snapshot[phase]={samples:row.samples,lastMs:Number(row.lastMs.toFixed(3)),meanMs:Number(row.meanMs.toFixed(3)),p50Ms:at(.50),p95Ms:at(.95),p99Ms:at(.99),maxMs:Number(row.maxMs.toFixed(3))};
 }
 return snapshot;
}
"""
    if html.count(phase_update_marker) != 1:
        raise SystemExit("No se encontró exactamente una función update(dt) para instrumentar sus fases.")
    html = html.replace(phase_update_marker, phase_timing_helpers + "\n" + phase_update_marker, 1)
    phase_update_start = html.index(phase_update_marker)
    phase_update_end = html.find("\n function startNpcHumanModels()", phase_update_start)
    if phase_update_end < 0:
        raise SystemExit("No se encontró el final delimitado del actualizador del mundo.")
    phase_update_source = html[phase_update_start:phase_update_end]
    phase_assignment_count = len(re.findall(r"worldUpdatePhase\s*=\s*([^;]+);", phase_update_source))
    if phase_assignment_count != 20:
        raise SystemExit(f"Se esperaban 20 transiciones de fase del mundo; se encontraron {phase_assignment_count}.")
    phase_update_source, phase_replacements = re.subn(
        r"worldUpdatePhase\s*=\s*([^;]+);",
        lambda match: "setWorldUpdatePhase(" + match.group(1) + ");",
        phase_update_source,
    )
    if phase_replacements != 20:
        raise SystemExit("No se pudieron instrumentar todas las transiciones de fase del mundo.")
    html = html[:phase_update_start] + phase_update_source + html[phase_update_end:]

    performance_report_marker = "waterVertices:waterPositions.length/3}};"
    performance_report_replacement = "waterVertices:waterPositions.length/3},subsystems:{worldPhases:getWorldPhaseTimingSnapshot(),atmosphere:window.__ELSN_ATMOSPHERE&&typeof window.__ELSN_ATMOSPHERE.getPerformanceSnapshot==='function'?window.__ELSN_ATMOSPHERE.getPerformanceSnapshot():null,npcDialogue:window.__ELSN_NPC_DIALOGUES__&&typeof window.__ELSN_NPC_DIALOGUES__.getSnapshot==='function'?window.__ELSN_NPC_DIALOGUES__.getSnapshot():null,wildlife:window.__ELSN_WILDLIFE_DIAGNOSTICS__&&typeof window.__ELSN_WILDLIFE_DIAGNOSTICS__.getSnapshot==='function'?window.__ELSN_WILDLIFE_DIAGNOSTICS__.getSnapshot():{requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length}}}};"
    if html.count(performance_report_marker) != 1:
        raise SystemExit("No se encontró el objeto único del informe de rendimiento para añadir métricas por subsistema.")
    html = html.replace(performance_report_marker, performance_report_replacement, 1)

    phase_flush_marker = "  lastWorldUpdateMs=performance.now()-worldUpdateStarted;"
    if html.count(phase_flush_marker) != 1:
        raise SystemExit("No se encontró el límite único de la actualización del mundo para cerrar la medición por fase.")
    html = html.replace(phase_flush_marker, "  finishWorldPhaseTiming();\n" + phase_flush_marker, 1)

    health_phase_marker = "worldUpdateMs:Number(lastWorldUpdateMs.toFixed(2)),renderCpuMs:Number(lastRenderCpuMs.toFixed(2)),"
    health_phase_replacement = health_phase_marker + "worldPhaseTimings:getWorldPhaseTimingSnapshot(),mapDrawMs:Number(lastMapDrawMs.toFixed(3)),mapDrawMaxMs:Number(mapDrawMaxMs.toFixed(3)),mapDrawSampleCount,habitableAuditMs:Number(habitableAuditLastMs.toFixed(3)),habitableAuditMaxMs:Number(habitableAuditMaxMs.toFixed(3)),habitableAuditCount,habitableAuditLastCacheHits,habitableAuditLastCacheMisses,"
    if html.count(health_phase_marker) != 1:
        raise SystemExit("No se encontró el objeto runtime único para publicar los tiempos de fase y del minimapa.")
    html = html.replace(health_phase_marker, health_phase_replacement, 1)

    map_clock_marker = "let last=performance.now(),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;"
    map_clock_replacement = map_clock_marker + "\n let lastMapDrawMs=0,mapDrawMaxMs=0,mapDrawSampleCount=0;"
    if html.count(map_clock_marker) != 1:
        raise SystemExit("No se encontró el reloj único del bucle de juego para medir el coste del minimapa.")
    html = html.replace(map_clock_marker, map_clock_replacement, 1)

    map_draw_marker = "if(mapClock>=mapRefreshInterval){drawMap();mapClock=0;}"
    map_draw_replacement = "if(mapClock>=mapRefreshInterval){const mapDrawStarted=performance.now();drawMap();lastMapDrawMs=performance.now()-mapDrawStarted;mapDrawMaxMs=Math.max(mapDrawMaxMs,lastMapDrawMs);mapDrawSampleCount++;mapClock=0;}"
    if html.count(map_draw_marker) != 1:
        raise SystemExit("No se encontró el único punto de actualización del minimapa; no se cambian sus frecuencias.")
    html = html.replace(map_draw_marker, map_draw_replacement, 1)



    # Cache unchanged structural ground proofs and discover new roofed roots incrementally.
    habitable_registry_marker = r""" const habitableStructureRegistry=[];
 let lastHabitableStructureAudit=null,habitableAuditAccumulator=1.5;"""
    habitable_registry_replacement = r""" const habitableStructureRegistry=[];
 let habitableAuditLastMs=0,habitableAuditMaxMs=0,habitableAuditCount=0,habitableAuditLastCacheHits=0,habitableAuditLastCacheMisses=0;
 let lastHabitableStructureAudit=null,habitableAuditAccumulator=0;"""
    if html.count(habitable_registry_marker) != 1:
        raise SystemExit("No se encontró el registro único de estructuras habitables.")
    html = html.replace(habitable_registry_marker, habitable_registry_replacement, 1)

    cached_evaluator_marker = " function auditHabitableStructures(applyRepairs=true){"
    cached_evaluator_code = r"""  function evaluateHabitableStructureCached(entry){
   const root=entry&&entry.root;
   if(!root||root.isDisposed?.())return evaluateHabitableStructure(entry);
   let p;try{p=root.getAbsolutePosition?root.getAbsolutePosition():root.position;}catch(_){p=root.position;}
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z))return evaluateHabitableStructure(entry);
   const island=land[entry.islandIndex],rotationY=Number(root.rotation?.y)||0,scaleX=Number(root.scaling?.x)||1,groundY=Number(ground.position.y)||0;
   const cache=entry.__habitableAuditCache;
   if(cache&&cache.x===p.x&&cache.y===p.y&&cache.z===p.z&&cache.rotationY===rotationY&&cache.scaleX===scaleX&&
      cache.islandIndex===entry.islandIndex&&cache.islandX===(island?island.x:null)&&cache.islandZ===(island?island.z:null)&&cache.islandRadius===(island?island.r:null)&&
      cache.groundY===groundY&&cache.kind===entry.kind&&cache.baseOffset===entry.baseOffset&&cache.footprintRadius===entry.footprintRadius&&
      cache.safeRadiusFactor===entry.safeRadiusFactor&&cache.edgeBuffer===entry.edgeBuffer&&cache.maxRelief===entry.maxRelief&&cache.anchorTolerance===entry.anchorTolerance){
    habitableAuditLastCacheHits++;return cache.result;
   }
   habitableAuditLastCacheMisses++;
   const result=evaluateHabitableStructure(entry);
   entry.__habitableAuditCache={x:p.x,y:p.y,z:p.z,rotationY,scaleX,islandIndex:entry.islandIndex,islandX:island?island.x:null,
    islandZ:island?island.z:null,islandRadius:island?island.r:null,groundY,kind:entry.kind,baseOffset:entry.baseOffset,
    footprintRadius:entry.footprintRadius,safeRadiusFactor:entry.safeRadiusFactor,edgeBuffer:entry.edgeBuffer,
    maxRelief:entry.maxRelief,anchorTolerance:entry.anchorTolerance,result};
   return result;
  }
"""
    if html.count(cached_evaluator_marker) != 1:
        raise SystemExit("No se encontró el punto único para cachear la evaluación de terreno de estructuras.")
    html = html.replace(cached_evaluator_marker, cached_evaluator_code + cached_evaluator_marker, 1)

    audit_start_marker = "  const records=[],camera=scene.activeCamera&&scene.activeCamera.position?scene.activeCamera.position:null,autoRegisteredRoots=[];"
    audit_start_replacement = "  habitableAuditLastCacheHits=0;habitableAuditLastCacheMisses=0;\n" + audit_start_marker
    if html.count(audit_start_marker) != 1:
        raise SystemExit("No se encontró el inicio único de la auditoría de edificios para reiniciar sus contadores.")
    html = html.replace(audit_start_marker, audit_start_replacement, 1)

    evaluation_marker = "let result=evaluateHabitableStructure(entry),root=entry.root;"
    if html.count(evaluation_marker) != 1:
        raise SystemExit("No se encontró la evaluación única de cada estructura para reutilizar sus pruebas estáticas.")
    html = html.replace(evaluation_marker, "let result=evaluateHabitableStructureCached(entry),root=entry.root;", 1)

    audit_call_marker = "habitableAuditAccumulator=0;auditHabitableStructures(true);"
    audit_call_replacement = "habitableAuditAccumulator=0;const habitableAuditStartedAt=performance.now();try{auditHabitableStructures(true);}finally{habitableAuditLastMs=performance.now()-habitableAuditStartedAt;habitableAuditMaxMs=Math.max(habitableAuditMaxMs,habitableAuditLastMs);habitableAuditCount++;}"
    if html.count(audit_call_marker) != 1:
        raise SystemExit("No se encontró la llamada periódica única de la auditoría de estructuras.")
    html = html.replace(audit_call_marker, audit_call_replacement, 1)

    # Recorder telemetry must read scalar water timings, not run the expensive full
    # shoreline/foam geometry audit every 2.5 seconds.
    water_debug_marker = " window.__elSinNombreWaterDebugSnapshot=()=>{\n  const health=typeof window.getGameHealthDebug==='function'?window.getGameHealthDebug():null;"
    water_debug_replacement = """ window.__elSinNombreWaterTelemetrySnapshot=()=>({available:true,timings:{waterLastUpdateMs:Number(waterLastUpdateMs.toFixed(3)),waterLastNormalMs:Number(waterLastNormalMs.toFixed(3)),tidalFoamLastUpdateMs:Number(tidalFoamLastUpdateMs.toFixed(3)),beachUpdateLastMs:Number(beachUpdateLastMs.toFixed(3)),groundDynamicsLastUpdateMs:Number(groundDynamicsLastUpdateMs.toFixed(3))}});
 window.__elSinNombreWaterDebugSnapshot=(healthSnapshot=null)=>{
  const health=healthSnapshot&&typeof healthSnapshot==='object'?healthSnapshot:(typeof window.getGameHealthDebug==='function'?window.getGameHealthDebug():null);"""
    if html.count(water_debug_marker) != 1:
        raise SystemExit("No se encontró el snapshot de agua único para separar telemetría ligera de auditoría visual completa.")
    html = html.replace(water_debug_marker, water_debug_replacement, 1)


    # Deterministic, low-frequency civilian AI: existing actors, terrain and collision grid only.
    npc_behavior_pattern = r"(?ms)^[ \t]*// Villagers walk between short work points.*?^[ \t]*const playerLookAt=playerPos\(\);"
    npc_behavior_replacement = r"""
   // Village NPCs use role schedules, local obstacle steering and bounded social reactions.
   // This reuses the existing actor roots, collision grid, animation clips and LOD cadence.
   const npcVillageBrain=window.ELSN_NPC_VILLAGE_BRAIN;
   if(!npcVillageBrain)throw new Error('El núcleo de comportamiento de aldeanos no está disponible.');
   if(!ambientPeople.__npcEnvironment||elapsed>=Number(ambientPeople.__npcEnvironmentAt||0)){
    let atmosphere=null;
    try{atmosphere=window.__ELSN_ATMOSPHERE&&typeof window.__ELSN_ATMOSPHERE.getState==='function'?window.__ELSN_ATMOSPHERE.getState():null;}catch(_){}
    ambientPeople.__npcEnvironment={night:!!(atmosphere&&Number(atmosphere.night)>=.55),daylight:atmosphere&&Number.isFinite(Number(atmosphere.daylight))?Number(atmosphere.daylight):.5,weather:atmosphere&&atmosphere.weather?String(atmosphere.weather):''};
    ambientPeople.__npcEnvironmentAt=elapsed+2.5;
   }
   const npcEnvironment=ambientPeople.__npcEnvironment;
   const ambientNpcPlayerPosition=playerPos(),playerX=Number(ambientNpcPlayerPosition.x)||0,playerZ=Number(ambientNpcPlayerPosition.z)||0;
   ambientPeople.forEach((npc,i)=>{
    if(!npc||npc.recruited||!npc.parts||!npc.parts.root)return;
    const p=npc.parts.root,npcPosition=p.position;
    if(!worldEntityVisualDue(npc,npcPosition.x,npcPosition.z))return;
    if(!npc.brainState)npc.brainState=npcVillageBrain.createState(npc.parts.name||p.name,npc.parts.variant,elapsed);
    const brain=npc.brainState,homeX=Number(npc.homeX),homeZ=Number(npc.homeZ);
    if(!Number.isFinite(homeX)||!Number.isFinite(homeZ))return;
    const village=villages[npc.villageIndex]||null;
    const dxPlayer=playerX-p.position.x,dzPlayer=playerZ-p.position.z,playerDistanceSq=dxPlayer*dxPlayer+dzPlayer*dzPlayer;
    if(elapsed>=Number(brain.nextThreatScanAt||0)){
     brain.nextThreatScanAt=elapsed+1.1+(Number(brain.seed)%600)/1000;
     let nearestThreat=null,nearestThreatSq=12.5*12.5;
     for(const enemy of enemies){
      if(!enemy||enemy.alive===false||enemy.surrendered===true||enemy.recruited===true)continue;
      const enemyVillage=Number(enemy.villageIndex);
      if(Number.isFinite(enemyVillage)&&enemyVillage===Number(npc.villageIndex))continue;
      const enemyFaction=String(enemy.faction||enemy.parts&&enemy.parts.faction||'enemy').toLowerCase();
      if(enemyFaction==='player'||enemyFaction==='friendly'||enemyFaction==='ally')continue;
      const enemyRoot=enemy.parts&&enemy.parts.root||enemy.root;
      const enemyPosition=enemyRoot&&enemyRoot.position;
      if(!enemyPosition||!Number.isFinite(enemyPosition.x)||!Number.isFinite(enemyPosition.z))continue;
      const tx=enemyPosition.x-p.position.x,tz=enemyPosition.z-p.position.z,d2=tx*tx+tz*tz;
      if(d2<nearestThreatSq){nearestThreatSq=d2;nearestThreat={x:enemyPosition.x,z:enemyPosition.z};}
     }
     brain.threatNearby=!!nearestThreat;
     brain.threatX=nearestThreat?nearestThreat.x:null;
     brain.threatZ=nearestThreat?nearestThreat.z:null;
    }
    const nearPlayer=playerDistanceSq<9.5*9.5;
    const wantedMode=npcVillageBrain.chooseMode({now:elapsed,threatNearby:brain.threatNearby===true,night:npcEnvironment.night,daylight:npcEnvironment.daylight,playerNearby:nearPlayer,claimed:!!(village&&village.claimed)},brain);
    if(wantedMode!==brain.mode){
     if(wantedMode==='flee')brain.threatResponses=(brain.threatResponses||0)+1;
     if(wantedMode==='social')brain.socialApproaches=(brain.socialApproaches||0)+1;
     brain.mode=wantedMode;brain.goalMode='';brain.blockedCount=0;brain.nextDecisionAt=elapsed;
     npc.pause=0;npc.targetX=NaN;npc.targetZ=NaN;
    }
    const oldX=p.position.x,oldZ=p.position.z;
    const roleSpacing=1.55;
    const destinationIsOpen=(x,z)=>{
     if(!tryLandMove(x,z,.43))return false;
     for(const other of ambientPeople){
      if(!other||other===npc||other.recruited||Number(other.villageIndex)!==Number(npc.villageIndex))continue;
      const q=other.parts&&other.parts.root&&other.parts.root.position;if(!q)continue;
      const ox=x-q.x,oz=z-q.z;if(ox*ox+oz*oz<roleSpacing*roleSpacing)return false;
     }
     if(village&&Array.isArray(village.guards))for(const guard of village.guards){
      if(!guard||guard.alive===false||guard.recruited||!guard.parts||!guard.parts.root)continue;
      const q=guard.parts.root.position,ox=x-q.x,oz=z-q.z;
      if(ox*ox+oz*oz<1.30*1.30)return false;
     }
     return true;
    };
    npc.pause=Math.max(0,(Number(npc.pause)||0)-ambientDt);
    const currentGoalDistance=Number.isFinite(npc.targetX)&&Number.isFinite(npc.targetZ)?Math.hypot(npc.targetX-oldX,npc.targetZ-oldZ):Infinity;
    if(currentGoalDistance<.58){
     npc.targetX=NaN;npc.targetZ=NaN;
     npc.pause=Math.max(npc.pause||0,brain.mode==='rest'?rand(4.2,7.0):(brain.mode==='watch'?rand(1.3,2.5):(brain.mode==='social'?rand(1.2,2.1):rand(1.8,3.5))));
    }
    const goalExpired=elapsed>=Number(brain.goalExpiresAt||0);
    const noGoal=!Number.isFinite(npc.targetX)||!Number.isFinite(npc.targetZ)||brain.goalMode!==brain.mode;
    if(npc.pause<=0&&(noGoal||goalExpired||brain.blockedCount>=2)){
     const target=npcVillageBrain.chooseGoal({
      mode:brain.mode,homeX,homeZ,x:oldX,z:oldZ,variant:npc.parts.variant,seed:Number(brain.seed)+Number(brain.replans||0)*29,
      homeAngle:Number(npc.phase||0)*.24,playerX,playerZ,threatX:brain.threatX,threatZ:brain.threatZ
     },(x,z)=>Math.hypot(x-oldX,z-oldZ)>.82&&destinationIsOpen(x,z));
     brain.replans=(brain.replans||0)+1;
     if(target){
      npc.targetX=target.x;npc.targetZ=target.z;brain.goalMode=brain.mode;
      brain.goalExpiresAt=elapsed+(brain.mode==='flee'?4.6:((brain.mode==='social'||brain.mode==='watch')?5.2:8.5));
      brain.blockedCount=0;
     }else{
      brain.blockedCount=Math.min(6,(brain.blockedCount||0)+1);
      brain.goalExpiresAt=elapsed+1.45;
     }
    }
    let moved=0,walking=false;
    if(npc.pause<=0&&Number.isFinite(npc.targetX)&&Number.isFinite(npc.targetZ)){
     const targetDx=npc.targetX-oldX,targetDz=npc.targetZ-oldZ,targetDistance=Math.hypot(targetDx,targetDz);
     if(targetDistance>.42){
      const pace=brain.mode==='flee'?1.18:(brain.mode==='social'?.72:(brain.mode==='watch'?.34:(brain.mode==='rest'?.20:npc.speed)));
      const step=Math.min(targetDistance,Math.max(.018,pace*ambientDt));
      const move=npcVillageBrain.chooseStep({x:oldX,z:oldZ,targetX:npc.targetX,targetZ:npc.targetZ,step,side:i%2===0?1:-1},(x,z)=>{
       if(!tryLandMove(x,z,.43,oldX,oldZ))return false;
       for(const other of ambientPeople){
        if(!other||other===npc||other.recruited||Number(other.villageIndex)!==Number(npc.villageIndex))continue;
        const q=other.parts&&other.parts.root&&other.parts.root.position;if(!q)continue;
        const ox=x-q.x,oz=z-q.z;if(ox*ox+oz*oz<1.10*1.10)return false;
       }
       if(village&&Array.isArray(village.guards))for(const guard of village.guards){
        if(!guard||guard.alive===false||guard.recruited||!guard.parts||!guard.parts.root)continue;
        const q=guard.parts.root.position,ox=x-q.x,oz=z-q.z;
        if(ox*ox+oz*oz<1.15*1.15)return false;
       }
       if(brain.threatNearby&&Number.isFinite(brain.threatX)&&Number.isFinite(brain.threatZ)){
        const tx=x-brain.threatX,tz=z-brain.threatZ;if(tx*tx+tz*tz<2.05*2.05)return false;
       }
       return true;
      });
      if(move){
       p.position.x=move.x;p.position.z=move.z;
       moved=Math.hypot(move.x-oldX,move.z-oldZ);walking=moved>.004;
       if(walking){
        npc.walkPhase=(npc.walkPhase||0)+moved*(Math.PI*2/(pace>1?2.1:2.40));
        npc.stepDistance=(npc.stepDistance||0)+moved;
        if(npc.stepDistance>=1.20){npc.stepDistance-=1.20;NorseAudio.civilianStep();}
       }
       brain.blockedCount=0;
      }else{
       brain.blockedCount=Math.min(6,(brain.blockedCount||0)+1);
       brain.goalExpiresAt=Math.min(Number(brain.goalExpiresAt)||elapsed+1.2,elapsed+1.2);
      }
     }
    }
    p.position.y=terrainSurfaceAt(p.position.x,p.position.z)+actorGroundOffset(npc.parts);
    let wantedYaw=p.rotation.y;
    if(walking&&moved>.004)wantedYaw=Math.atan2(p.position.x-oldX,p.position.z-oldZ);
    else if((brain.mode==='social'||brain.mode==='watch'||nearPlayer)&&nearPlayer)wantedYaw=Math.atan2(playerX-p.position.x,playerZ-p.position.z);
    else if(Number.isFinite(npc.targetX)&&Number.isFinite(npc.targetZ))wantedYaw=Math.atan2(npc.targetX-p.position.x,npc.targetZ-p.position.z);
    p.rotation.y=npcVillageBrain.smoothAngle(p.rotation.y,wantedYaw,ambientDt,walking?7.6:3.2);
    npc.parts.actualMoveSpeed=ambientDt>0?moved/ambientDt:0;
    animateViking(npc.parts,npc.walkPhase||0,walking,'walk',false);
   });
"""
    if not re.search(npc_behavior_pattern, html):
        raise SystemExit("No se encontró el bloque único de movimiento aleatorio de los aldeanos.")
    html, npc_behavior_count = re.subn(
        npc_behavior_pattern, lambda _match: npc_behavior_replacement + "   const playerLookAt=playerPos();",
        html, count=1
    )
    if npc_behavior_count != 1:
        raise SystemExit(f"Se esperaba una sustitución de comportamiento NPC; se realizaron {npc_behavior_count}.")
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

    # Fetch unrelated assets concurrently, but keep large Grab3D rigged packages
    # on a single connection. Parallel 11–15 MB character downloads to the same
    # host previously timed out together on the GitHub runner.
    grab3d_downloads = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {}
        for relative, (url, minimum, kind) in DOWNLOADS.items():
            if url.startswith("https://grab3d.com/"):
                grab3d_downloads[relative] = (url, minimum, kind)
                continue
            jobs[pool.submit(fetch, url, DIST / relative, minimum, kind)] = relative
        for job in as_completed(jobs):
            relative = jobs[job]
            try:
                result = job.result()
                results.append(result)
                print(f"OK {relative}: {result['bytes']:,} bytes")
            except Exception as exc:
                failures.append((relative, str(exc)))
                print(f"ERROR {relative}: {exc}", file=sys.stderr)

    if grab3d_downloads:
        print("Descargando modelos rigged de Grab3D secuencialmente para evitar timeouts por concurrencia.")
    for relative, (url, minimum, kind) in grab3d_downloads.items():
        try:
            result = fetch(url, DIST / relative, minimum, kind)
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
    if not shell_match or not (shell_match.group(1) == game_version or shell_match.group(1).startswith(game_version + "-")):
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
        "engine": {
            "name": "Babylon.js",
            "version": BABYLON_VERSION,
            "distribution": "UMD",
            "loaderVersion": BABYLON_VERSION,
            "defaultBackend": "WebGL2-preferred",
            "webGpu": "capability-probed; not enabled for gameplay yet",
        },
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
