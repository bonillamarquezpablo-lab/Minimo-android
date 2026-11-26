#!/usr/bin/env python3
"""Build an autonomous same-origin GitHub Pages package for EL SIN NOMBRE."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import hashlib
import json
import math
import os
import re
import struct
import shutil
import threading
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
        "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/0128ca510d653bb04d6d1e4885bd8890b5050b4f/public/glb/animals_pack/Deer.glb", 100_000, "glb"
    ),
    "assets/models/wildlife/Stag.glb": (
        "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/0128ca510d653bb04d6d1e4885bd8890b5050b4f/public/glb/animals_pack/Stag.glb", 100_000, "glb"
    ),
    "assets/models/wildlife/Wolf.glb": (
        "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/0128ca510d653bb04d6d1e4885bd8890b5050b4f/public/glb/animals_pack/Wolf.glb", 100_000, "glb"
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


ASSET_CACHE_SCHEMA_VERSION = 2
ASSET_CACHE_TRANSFORM_VERSION = "procedural-vertex-coat-v3-skeleton-root-v1"
_ASSET_CACHE_MANIFEST = None
_ASSET_CACHE_MANIFEST_LOCK = threading.RLock()


def _asset_processing_version(relative: str, kind: str) -> str:
    if kind == "glb" and relative.startswith("assets/models/wildlife/"):
        return ASSET_CACHE_TRANSFORM_VERSION
    return "identity-v1"


def _asset_spec_fingerprint(relative: str, url: str, minimum: int, kind: str) -> str:
    payload = {
        "schema": ASSET_CACHE_SCHEMA_VERSION,
        "path": relative,
        "url": url,
        "minimumBytes": int(minimum),
        "kind": kind,
        "processing": _asset_processing_version(relative, kind),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def asset_cache_fingerprint() -> str:
    """Stable identity for the complete external-asset set; excludes game-only code changes."""
    assets = [
        {
            "path": relative,
            "url": url,
            "minimumBytes": int(minimum),
            "kind": kind,
            "processing": _asset_processing_version(relative, kind),
        }
        for relative, (url, minimum, kind) in sorted(DOWNLOADS.items())
    ]
    payload = {
        "schema": ASSET_CACHE_SCHEMA_VERSION,
        "babylon": BABYLON_VERSION,
        "assets": assets,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:20]


def _asset_cache_manifest_path() -> Path:
    return ROOT / ".asset-cache" / "asset-cache-manifest.json"


def _load_asset_cache_manifest() -> dict:
    global _ASSET_CACHE_MANIFEST
    with _ASSET_CACHE_MANIFEST_LOCK:
        if _ASSET_CACHE_MANIFEST is not None:
            return _ASSET_CACHE_MANIFEST
        manifest_path = _asset_cache_manifest_path()
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("schemaVersion") != ASSET_CACHE_SCHEMA_VERSION or not isinstance(manifest.get("entries"), dict):
                raise ValueError("unsupported cache manifest schema")
            _ASSET_CACHE_MANIFEST = manifest
        except FileNotFoundError:
            _ASSET_CACHE_MANIFEST = {"schemaVersion": ASSET_CACHE_SCHEMA_VERSION, "entries": {}}
        except Exception as exc:
            print(f"WARN Asset cache manifest ignored ({exc}); entries will be downloaded and re-verified.")
            _ASSET_CACHE_MANIFEST = {"schemaVersion": ASSET_CACHE_SCHEMA_VERSION, "entries": {}}
        return _ASSET_CACHE_MANIFEST


def _write_asset_cache_manifest_locked() -> None:
    manifest_path = _asset_cache_manifest_path()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = manifest_path.with_name(manifest_path.name + ".tmp")
    temporary.write_text(
        json.dumps(_ASSET_CACHE_MANIFEST, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    os.replace(temporary, manifest_path)


def _invalidate_asset_cache_entry(relative: str) -> None:
    with _ASSET_CACHE_MANIFEST_LOCK:
        manifest = _load_asset_cache_manifest()
        manifest["entries"].pop(relative, None)
        _write_asset_cache_manifest_locked()
    (ROOT / ".asset-cache" / relative).unlink(missing_ok=True)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_cached_asset(path: Path, relative: str, kind: str) -> None:
    if kind != "glb":
        return
    if relative.startswith("assets/models/wildlife/"):
        validate_rigged_animal_glb(path, relative)
    elif path.name in {"viking-rigged.glb", "armored-knight-rigged.glb", "man-base-character-rigged.glb"}:
        validate_rigged_character_glb(path, relative)
    else:
        read_glb_document(path)


def restore_verified_asset_cache(url: str, destination: Path, minimum: int, kind: str) -> dict | None:
    """Restore one asset only when its spec, exact size, SHA-256 and format still match."""
    relative = destination.relative_to(DIST).as_posix()
    cache_file = ROOT / ".asset-cache" / relative
    manifest = _load_asset_cache_manifest()
    entry = manifest["entries"].get(relative)
    expected_spec = _asset_spec_fingerprint(relative, url, minimum, kind)
    if not isinstance(entry, dict) or entry.get("specFingerprint") != expected_spec:
        if cache_file.exists():
            cache_file.unlink(missing_ok=True)
        if entry is not None:
            _invalidate_asset_cache_entry(relative)
        return None
    try:
        size = cache_file.stat().st_size
        expected_size = int(entry.get("bytes") or 0)
        expected_digest = str(entry.get("sha256") or "")
        if size < minimum or size != expected_size or len(expected_digest) != 64:
            raise ValueError("cached size or manifest metadata mismatch")
        digest = _sha256_file(cache_file)
        if digest != expected_digest:
            raise ValueError("cached SHA-256 mismatch")
        if entry.get("processing") != _asset_processing_version(relative, kind):
            raise ValueError("cached processing version mismatch")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cache_file, destination)
        _validate_cached_asset(destination, relative, kind)
        print(f"OK {relative}: {size:,} bytes (asset cache SHA-256 verified)")
        return {"path": relative, "bytes": size, "sha256": digest, "source": "verified-asset-cache"}
    except Exception as exc:
        print(f"WARN {relative}: cache rejected ({exc}); downloading a clean copy.", file=sys.stderr)
        destination.unlink(missing_ok=True)
        _invalidate_asset_cache_entry(relative)
        return None


def persist_verified_asset_cache(url: str, destination: Path, minimum: int, kind: str) -> dict:
    """Atomically save a fully processed asset and its integrity record."""
    relative = destination.relative_to(DIST).as_posix()
    size = destination.stat().st_size
    if size < minimum:
        raise RuntimeError(f"Refusing to cache undersized asset {relative}: {size} bytes")
    digest = _sha256_file(destination)
    cache_file = ROOT / ".asset-cache" / relative
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    temporary_asset = cache_file.with_name(cache_file.name + ".tmp")
    shutil.copy2(destination, temporary_asset)
    os.replace(temporary_asset, cache_file)
    entry = {
        "url": url,
        "kind": kind,
        "minimumBytes": int(minimum),
        "specFingerprint": _asset_spec_fingerprint(relative, url, minimum, kind),
        "processing": _asset_processing_version(relative, kind),
        "bytes": size,
        "sha256": digest,
    }
    with _ASSET_CACHE_MANIFEST_LOCK:
        manifest = _load_asset_cache_manifest()
        manifest["entries"][relative] = entry
        _write_asset_cache_manifest_locked()
    return {"path": relative, "bytes": size, "sha256": digest, "source": "downloaded-and-cached"}


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



def _read_glb_payload(path: Path) -> tuple[dict, bytearray, list[tuple[bytes, bytes]]]:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or int.from_bytes(raw[4:8], "little") != 2:
        raise RuntimeError(f"Invalid GLB v2 container: {path.name}")
    offset = 12
    document = None
    binary = None
    chunks: list[tuple[bytes, bytes]] = []
    while offset + 8 <= len(raw):
        chunk_length = int.from_bytes(raw[offset:offset + 4], "little")
        chunk_type = raw[offset + 4:offset + 8]
        offset += 8
        end = offset + chunk_length
        if end > len(raw):
            raise RuntimeError(f"Truncated GLB chunk in {path.name}")
        payload = raw[offset:end]
        offset = end
        chunks.append((chunk_type, payload))
        if chunk_type == b"JSON":
            document = json.loads(payload.decode("utf-8").rstrip(chr(0) + " "))
        elif chunk_type == b"BIN" + bytes([0]):
            binary = bytearray(payload)
    if not isinstance(document, dict) or binary is None:
        raise RuntimeError(f"GLB is missing JSON or embedded BIN data: {path.name}")
    return document, binary, chunks


def _write_glb_payload(path: Path, document: dict, binary: bytearray,
                       chunks: list[tuple[bytes, bytes]]) -> None:
    buffers = document.setdefault("buffers", [])
    if not buffers:
        buffers.append({"byteLength": len(binary)})
    buffers[0]["byteLength"] = len(binary)
    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((-len(json_payload)) % 4)
    binary_payload = bytes(binary)
    binary_payload += bytes([0]) * ((-len(binary_payload)) % 4)
    output = bytearray(b"glTF" + struct.pack("<II", 2, 0))
    wrote_json = False
    wrote_binary = False
    for chunk_type, payload in chunks:
        if chunk_type == b"JSON":
            payload = json_payload
            wrote_json = True
        elif chunk_type == b"BIN" + bytes([0]):
            payload = binary_payload
            wrote_binary = True
        output.extend(struct.pack("<I4s", len(payload), chunk_type))
        output.extend(payload)
    if not wrote_json:
        raise RuntimeError(f"GLB JSON chunk disappeared while writing {path.name}")
    if not wrote_binary:
        output.extend(struct.pack("<I4s", len(binary_payload), b"BIN" + bytes([0])))
        output.extend(binary_payload)
    struct.pack_into("<I", output, 8, len(output))
    path.write_bytes(output)


def _read_glb_position_accessor(document: dict, binary: bytearray, accessor_index: int) -> list[tuple[float, float, float]]:
    accessors = document.get("accessors") or []
    views = document.get("bufferViews") or []
    accessor = accessors[accessor_index]
    if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC3":
        raise RuntimeError("Animal POSITION accessor must use FLOAT VEC3 data")
    if accessor.get("sparse"):
        raise RuntimeError("Sparse animal POSITION accessors are not supported by the coat-color baker")
    view = views[accessor["bufferView"]]
    if view.get("buffer", 0) != 0:
        raise RuntimeError("Animal POSITION accessor references a non-embedded buffer")
    stride = int(view.get("byteStride") or 12)
    if stride < 12:
        raise RuntimeError("Animal POSITION accessor has an invalid byte stride")
    start = int(view.get("byteOffset") or 0) + int(accessor.get("byteOffset") or 0)
    count = int(accessor["count"])
    end = start + max(0, count - 1) * stride + 12
    if start < 0 or end > len(binary):
        raise RuntimeError("Animal POSITION accessor exceeds the embedded GLB buffer")
    return [struct.unpack_from("<3f", binary, start + index * stride) for index in range(count)]


def repair_terrestrial_animal_skin_roots(document: dict, label: str) -> list[dict]:
    """Keep the complete structural AnimalArmature transform in each wildlife skin."""
    species = Path(label).stem.lower()
    if species not in {"wolf", "stag", "deer"}:
        raise RuntimeError(f"Unknown terrestrial species for skin-root repair: {label}")
    nodes = document.get("nodes") or []
    skins = document.get("skins") or []
    if not nodes or not skins:
        raise RuntimeError(f"{label}: cannot repair an animal GLB without nodes and skins")
    parents = {}
    for parent_index, node in enumerate(nodes):
        for child_index in node.get("children") or []:
            child_index = int(child_index)
            if child_index < 0 or child_index >= len(nodes):
                raise RuntimeError(f"{label}: node {parent_index} has invalid child index {child_index}")
            if child_index in parents:
                raise RuntimeError(f"{label}: node {child_index} has more than one parent")
            parents[child_index] = parent_index

    def descends_from(node_index: int, ancestor_index: int) -> bool:
        visited = set()
        cursor = node_index
        while cursor not in visited:
            if cursor == ancestor_index:
                return True
            visited.add(cursor)
            if cursor not in parents:
                return False
            cursor = parents[cursor]
        raise RuntimeError(f"{label}: cycle detected in the glTF node hierarchy")

    armature_indices = [
        index for index, node in enumerate(nodes)
        if str(node.get("name") or "") == "AnimalArmature"
    ]
    if len(armature_indices) != 1:
        raise RuntimeError(
            f"{label}: expected exactly one AnimalArmature node; found {armature_indices}"
        )
    armature_index = armature_indices[0]
    repairs = []
    for skin_index, skin in enumerate(skins):
        joints = [int(index) for index in (skin.get("joints") or [])]
        if not joints or any(index < 0 or index >= len(nodes) for index in joints):
            raise RuntimeError(f"{label}: skin {skin_index} has invalid or empty joint indices")
        if not all(descends_from(index, armature_index) for index in joints):
            raise RuntimeError(
                f"{label}: AnimalArmature does not contain every joint in skin {skin_index}"
            )
        original_root = skin.get("skeleton")
        if original_root != armature_index:
            skin.setdefault("extras", {})["elsnOriginalSkeletonRoot"] = original_root
            skin["skeleton"] = armature_index
            repairs.append({
                "skin": skin_index,
                "originalRoot": original_root,
                "repairedRoot": armature_index,
                "repairedRootName": "AnimalArmature",
            })
        skin.setdefault("extras", {})["elsnSkeletonRootRepair"] = {
            "algorithm": "animal-armature-root-v1",
            "rootName": "AnimalArmature",
            "rootNode": armature_index,
        }
    document.setdefault("extras", {})["elsnAnimalSkinRoot"] = {
        "algorithm": "animal-armature-root-v1",
        "species": species,
        "rootNode": armature_index,
        "rootName": "AnimalArmature",
        "repairs": repairs,
    }
    return repairs


def bake_procedural_animal_vertex_colors(path: Path, label: str) -> int:
    """Bake subtle coat color variation into glTF COLOR_0 without changing rigs or animation."""
    species = path.stem.lower()
    if species not in {"wolf", "stag", "deer"}:
        raise RuntimeError(f"Unknown terrestrial species for appearance baking: {label}")
    document, binary, chunks = _read_glb_payload(path)
    repair_terrestrial_animal_skin_roots(document, label)
    primitives = []
    global_min = [float("inf")] * 3
    global_max = [float("-inf")] * 3
    for mesh in document.get("meshes") or []:
        for primitive in mesh.get("primitives") or []:
            attributes = primitive.get("attributes") or {}
            if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
                continue
            positions = _read_glb_position_accessor(document, binary, int(attributes["POSITION"]))
            material_index = primitive.get("material")
            materials = document.get("materials") or []
            material_name = str(materials[material_index].get("name") or "") if material_index is not None and material_index < len(materials) else ""
            lowered_name = material_name.lower()
            if any(token in lowered_name for token in ("eye", "nose", "black")):
                continue
            primitives.append((primitive, positions))
            for position in positions:
                for axis in range(3):
                    global_min[axis] = min(global_min[axis], position[axis])
                    global_max[axis] = max(global_max[axis], position[axis])
    if not primitives:
        return 0
    ranges = [max(1e-9, global_max[axis] - global_min[axis]) for axis in range(3)]
    added_vertices = 0
    accessors = document.setdefault("accessors", [])
    buffer_views = document.setdefault("bufferViews", [])
    for primitive, positions in primitives:
        colors = bytearray()
        for x, y, z in positions:
            x_norm = (x - global_min[0]) / ranges[0]
            y_norm = (y - global_min[1]) / ranges[1]
            z_norm = (z - global_min[2]) / ranges[2]
            broad_pattern = math.sin(y_norm * 41.0 + math.sin(x_norm * 17.0 + z_norm * 5.0) * 1.7) * math.cos(z_norm * 19.0 - x_norm * 11.0)
            fine_pattern = math.sin(y_norm * 103.0 + x_norm * 57.0 + z_norm * 71.0)
            mottling = 0.045 * broad_pattern + 0.018 * fine_pattern
            lower_flank = 1.0 - y_norm
            if species == "wolf":
                coat = 0.88 + 0.18 * lower_flank + mottling
                red = coat * (1.02 + 0.025 * broad_pattern)
                green = coat * (1.00 + 0.018 * fine_pattern)
                blue = coat * (0.94 - 0.020 * broad_pattern)
            else:
                coat = 0.91 + 0.13 * lower_flank + mottling
                red = coat * (1.035 + 0.022 * broad_pattern)
                green = coat * (1.00 + 0.018 * fine_pattern)
                blue = coat * (0.91 - 0.020 * broad_pattern)
            colors.extend(struct.pack(
                "<4f",
                max(0.55, min(1.25, red)),
                max(0.55, min(1.25, green)),
                max(0.55, min(1.25, blue)),
                1.0,
            ))
        while len(binary) % 4:
            binary.append(0)
        byte_offset = len(binary)
        binary.extend(colors)
        view_index = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": len(colors),
            "target": 34962,
        })
        accessor_index = len(accessors)
        accessors.append({
            "bufferView": view_index,
            "byteOffset": 0,
            "componentType": 5126,
            "count": len(positions),
            "type": "VEC4",
        })
        primitive.setdefault("attributes", {})["COLOR_0"] = accessor_index
        added_vertices += len(positions)
    if species == "wolf":
        for material in document.get("materials") or []:
            pbr = material.get("pbrMetallicRoughness") or {}
            if material.get("name") == "Main":
                pbr["baseColorFactor"] = [0.255, 0.265, 0.255, 1.0]
            elif material.get("name") == "Main_Light":
                pbr["baseColorFactor"] = [0.42, 0.43, 0.40, 1.0]
    total_skinned_vertices = sum(
        int(document["accessors"][primitive["attributes"]["POSITION"]].get("count") or 0)
        for mesh in (document.get("meshes") or [])
        for primitive in (mesh.get("primitives") or [])
        if "JOINTS_0" in (primitive.get("attributes") or []) and "WEIGHTS_0" in (primitive.get("attributes") or [])
    )
    coverage = added_vertices / max(1, total_skinned_vertices)
    if coverage < 0.90:
        raise RuntimeError(
            f"{label}: generated coat colors cover only {coverage:.1%} of skinned vertices "
            f"({added_vertices}/{total_skinned_vertices}); minimum is 90%."
        )
    document.setdefault("extras", {})["elsnAnimalCoat"] = {
        "algorithm": ASSET_CACHE_TRANSFORM_VERSION,
        "species": species,
        "vertices": added_vertices,
        "skinnedVertices": total_skinned_vertices,
        "coverage": round(coverage, 5),
    }
    _write_glb_payload(path, document, binary, chunks)
    return added_vertices


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
    materials = document.get("materials") or []
    max_joints = max((len(skin.get("joints") or []) for skin in skins), default=0)
    if not meshes or not skins or not animations:
        raise RuntimeError(
            f"{label}: animal GLB must contain visible geometry, a rig and animation clips "
            f"(meshes={len(meshes)}, skins={len(skins)}, animations={len(animations)})"
        )
    if max_joints < 8:
        raise RuntimeError(f"{label}: animal rig is incomplete ({max_joints} joints; expected >=8)")
    nodes = document.get("nodes") or []
    parents = {
        int(child): parent_index
        for parent_index, node in enumerate(nodes)
        for child in (node.get("children") or [])
    }
    root_metadata = ((document.get("extras") or {}).get("elsnAnimalSkinRoot") or {})
    if root_metadata.get("algorithm") != "animal-armature-root-v1":
        raise RuntimeError(f"{label}: normalized AnimalArmature skin-root metadata is missing")
    root_index = root_metadata.get("rootNode")
    if not isinstance(root_index, int) or root_index < 0 or root_index >= len(nodes):
        raise RuntimeError(f"{label}: normalized skin root index is invalid")
    if str(nodes[root_index].get("name") or "") != "AnimalArmature":
        raise RuntimeError(f"{label}: normalized skin root is not AnimalArmature")
    for skin_index, skin in enumerate(skins):
        if skin.get("skeleton") != root_index:
            raise RuntimeError(
                f"{label}: skin {skin_index} starts at {skin.get('skeleton')}, expected {root_index} (AnimalArmature)"
            )
        for joint in skin.get("joints") or []:
            cursor = int(joint)
            visited = set()
            while cursor != root_index and cursor in parents and cursor not in visited:
                visited.add(cursor)
                cursor = parents[cursor]
            if cursor != root_index:
                raise RuntimeError(
                    f"{label}: skin {skin_index} joint {joint} is outside the normalized AnimalArmature hierarchy"
                )
        if ((skin.get("extras") or {}).get("elsnSkeletonRootRepair") or {}).get("algorithm") != "animal-armature-root-v1":
            raise RuntimeError(f"{label}: skin {skin_index} lacks skeleton-root repair metadata")
    animation_names = [re.sub(r"[^a-z0-9]", "", str(item.get("name") or "").lower()) for item in animations]
    missing_clips = [clip for clip in ("idle", "walk", "gallop") if not any(name == clip or name.endswith(clip) for name in animation_names)]
    if missing_clips:
        raise RuntimeError(f"{label}: animal GLB is missing required locomotion clips {missing_clips}; found {animation_names}")
    if not materials or any(not (mesh.get("primitives") or []) for mesh in meshes):
        raise RuntimeError(f"{label}: one or more animal meshes/materials are missing")
    coat = ((document.get("extras") or {}).get("elsnAnimalCoat") or {})
    if coat.get("algorithm") != ASSET_CACHE_TRANSFORM_VERSION or coat.get("species") != path.stem.lower():
        raise RuntimeError(f"{label}: generated species-specific coat colors are missing")
    skinned_vertex_count = sum(
        int(document["accessors"][primitive["attributes"]["POSITION"]].get("count") or 0)
        for mesh in meshes
        for primitive in (mesh.get("primitives") or [])
        if "JOINTS_0" in (primitive.get("attributes") or {}) and "WEIGHTS_0" in (primitive.get("attributes") or {})
    )
    generated_vertices = int(coat.get("vertices") or 0)
    generated_skinned_vertices = int(coat.get("skinnedVertices") or 0)
    coverage = generated_vertices / max(1, skinned_vertex_count)
    if generated_skinned_vertices != skinned_vertex_count or coverage < 0.90:
        raise RuntimeError(
            f"{label}: generated coat coverage is incomplete "
            f"({generated_vertices}/{skinned_vertex_count} skinned vertices; {coverage:.1%}, expected >=90%)"
        )
    for mesh in meshes:
        for primitive in mesh.get("primitives") or []:
            attributes = primitive.get("attributes") or {}
            if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
                continue
            if "COLOR_0" not in attributes:
                continue
            color_accessor = document["accessors"][attributes["COLOR_0"]]
            vertex_count = int(document["accessors"][attributes["POSITION"]].get("count") or 0)
            if color_accessor.get("type") not in ("VEC3", "VEC4") or int(color_accessor.get("count") or 0) != vertex_count:
                raise RuntimeError(f"{label}: malformed vertex-color stream on a skinned animal primitive")
    return document


def fetch(url: str, destination: Path, minimum: int, kind: str) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    relative = destination.relative_to(DIST).as_posix()
    cached = restore_verified_asset_cache(url, destination, minimum, kind)
    if cached is not None:
        return cached
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
                    baked_vertices = bake_procedural_animal_vertex_colors(destination, relative)
                    document = validate_rigged_animal_glb(destination, relative)
                    size = destination.stat().st_size
                    digest = None  # The final processed file is streamed and hashed when persisted.
                    print(
                        f"OK animated animal GLB {relative}: "
                        f"{len(document.get('meshes') or [])} meshes, "
                        f"{max((len(s.get('joints') or []) for s in (document.get('skins') or [])), default=0)} joints, "
                        f"{len(document.get('animations') or [])} clips, "
                        f"{baked_vertices:,} coat vertices baked, "
                        f"{sum(1 for mesh in (document.get('meshes') or []) for primitive in (mesh.get('primitives') or []) if 'COLOR_0' in (primitive.get('attributes') or {}))} vertex-coloured primitives."
                    )
                else:
                    read_glb_document(destination)
            return persist_verified_asset_cache(url, destination, minimum, kind)
        except Exception as exc:
            last_error = exc
            destination.unlink(missing_ok=True)
            if attempt < 4:
                time.sleep(attempt * 2)
    # The repository may already contain a verified vendor copy. Prefer that immutable
    # local dependency when a CDN blocks CI (403/rate-limit); never publish a partial file.
    fallback = cache_file if cache_file.is_file() else ROOT / destination.relative_to(DIST)
    if fallback.is_file():
        size = fallback.stat().st_size
        if size >= minimum:
            shutil.copy2(fallback, destination)
            digest = hashlib.sha256()
            with destination.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            if kind == "glb":
                relative = destination.relative_to(DIST).as_posix()
                if relative.startswith("assets/models/wildlife/"):
                    existing = read_glb_document(destination)
                    coat = ((existing.get("extras") or {}).get("elsnAnimalCoat") or {})
                    if coat.get("algorithm") != ASSET_CACHE_TRANSFORM_VERSION or coat.get("species") != destination.stem.lower():
                        bake_procedural_animal_vertex_colors(destination, relative)
                    validate_rigged_animal_glb(destination, relative)
                    size = destination.stat().st_size
                elif destination.name in {"viking-rigged.glb", "armored-knight-rigged.glb", "man-base-character-rigged.glb"}:
                    validate_rigged_character_glb(destination, relative)
                else:
                    read_glb_document(destination)
            persist_verified_asset_cache(url, destination, minimum, kind)
            print(f"OK {destination.relative_to(DIST).as_posix()}: {size:,} bytes (verified repository fallback)")
            return {
                "path": destination.relative_to(DIST).as_posix(),
                "bytes": size,
                "sha256": _sha256_file(destination),
                "source": "repository-fallback",
            }
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
    # 0.6.356: only live combat entities may own damage authority.
    combat_damage_marker = "if(!attacker||!attacker.alive||attacker.recruited||attacker.surrendered)return false;"
    combat_damage_replacement = "if(!attacker||!attacker.alive||attacker.parts&&attacker.parts.alive===false||attacker.recruited||attacker.surrendered)return false;"
    if html.count(combat_damage_marker) != 1:
        raise SystemExit("No se encontró la validación única de entidades de combate.")
    html = html.replace(combat_damage_marker, combat_damage_replacement, 1)
    enemy_ai_alive_marker = "if(!e.alive||e.recruited)continue;"
    enemy_ai_alive_replacement = "if(!e.alive||e.parts&&e.parts.alive===false||e.recruited)continue;"
    if html.count(enemy_ai_alive_marker) != 1:
        raise SystemExit("No se encontró el filtro único de enemigos vivos.")
    html = html.replace(enemy_ai_alive_marker, enemy_ai_alive_replacement, 1)

    # 0.6.356: unify all humanoid overlays under one measured anchor.
    badge_kind_marker = "  const kind=faction==='friendly'?'friendly':'enemy';"
    if html.count(badge_kind_marker) != 1: raise SystemExit("Badge function marker not unique")
    html = html.replace(badge_kind_marker,badge_kind_marker+"\n  const overlayAnchor=ensureNpcOverlayAnchor(parts)||root;",1)
    badge_create_marker = "badge.parent=root;badge.position=v(0,2.66,0);"
    if html.count(badge_create_marker) != 1: raise SystemExit("Badge creation marker not unique")
    html = html.replace(badge_create_marker,"badge.parent=overlayAnchor;badge.position=v(0,.34,0);",1)
    badge_repair_marker = "}else if(parts.factionBadge.parent!==root){\n   parts.factionBadge.parent=root;parts.factionBadge.position=v(0,2.66,0);"
    if html.count(badge_repair_marker) != 1: raise SystemExit("Badge repair marker not unique")
    html = html.replace(badge_repair_marker,"}else if(parts.factionBadge.parent!==overlayAnchor){\n   parts.factionBadge.parent=overlayAnchor;parts.factionBadge.position=v(0,.34,0);",1)
    village_health_marker = """   let back=B.MeshBuilder.CreatePlane('guardHealthBack',{width:1.15,height:.12},scene);back.parent=ch.root;back.position=v(0,2.02,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=M.red;
   let front=B.MeshBuilder.CreatePlane('guardHealth',{width:1.1,height:.09},scene);front.parent=ch.root;front.position=v(0,2.03,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('EnemyHealth'+index+i,'#76a75a');"""
    village_health_replacement = """   const overlayAnchor=ensureNpcOverlayAnchor(ch)||ch.root;
   let back=B.MeshBuilder.CreatePlane('guardHealthBack',{width:1.15,height:.12},scene);back.parent=overlayAnchor;back.position=v(0,.03,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=M.red;
   let front=B.MeshBuilder.CreatePlane('guardHealth',{width:1.1,height:.09},scene);front.parent=overlayAnchor;front.position=v(0,.04,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('EnemyHealth'+index+i,'#76a75a');
   ch.overlayHealthMeshes=[{mesh:back,y:.03,z:0},{mesh:front,y:.04,z:-.02}];"""
    if html.count(village_health_marker) != 1: raise SystemExit("Village health marker not unique")
    html=html.replace(village_health_marker,village_health_replacement,1)
    island_health_marker = """  const back=B.MeshBuilder.CreatePlane('IslandGuardHealthBack_'+islandIndex,{width:1.08,height:.11},scene);
  back.parent=parts.root;back.position=v(0,2.02,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=M.red;
  const front=B.MeshBuilder.CreatePlane('IslandGuardHealth_'+islandIndex,{width:1.04,height:.085},scene);
  front.parent=parts.root;front.position=v(0,2.03,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('IslandGuardHealthFront_'+islandIndex,'#76a75a');"""
    island_health_replacement = """  const overlayAnchor=ensureNpcOverlayAnchor(parts)||parts.root;
  const back=B.MeshBuilder.CreatePlane('IslandGuardHealthBack_'+islandIndex,{width:1.08,height:.11},scene);back.parent=overlayAnchor;back.position=v(0,.03,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=M.red;
  const front=B.MeshBuilder.CreatePlane('IslandGuardHealth_'+islandIndex,{width:1.04,height:.085},scene);front.parent=overlayAnchor;front.position=v(0,.04,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('IslandGuardHealthFront_'+islandIndex,'#76a75a');
  parts.overlayHealthMeshes=[{mesh:back,y:.03,z:0},{mesh:front,y:.04,z:-.02}];"""
    if html.count(island_health_marker) != 1: raise SystemExit("Island guard health marker not unique")
    html=html.replace(island_health_marker,island_health_replacement,1)
    home_health_marker = """  const back=B.MeshBuilder.CreatePlane('HomeGuardHealthBack_'+i,{width:1.02,height:.105},scene);back.parent=parts.root;back.position=v(0,2.02,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=mat('HomeGuardHealthDark_'+i,'#1d3b2d');
  const front=B.MeshBuilder.CreatePlane('HomeGuardHealth_'+i,{width:1.0,height:.078},scene);front.parent=parts.root;front.position=v(0,2.03,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('HomeGuardHealthGreen_'+i,'#86c77a');"""
    home_health_replacement = """  const overlayAnchor=ensureNpcOverlayAnchor(parts)||parts.root;
  const back=B.MeshBuilder.CreatePlane('HomeGuardHealthBack_'+i,{width:1.02,height:.105},scene);back.parent=overlayAnchor;back.position=v(0,.03,0);back.billboardMode=B.Mesh.BILLBOARDMODE_ALL;back.material=mat('HomeGuardHealthDark_'+i,'#1d3b2d');
  const front=B.MeshBuilder.CreatePlane('HomeGuardHealth_'+i,{width:1.0,height:.078},scene);front.parent=overlayAnchor;front.position=v(0,.04,-.02);front.billboardMode=B.Mesh.BILLBOARDMODE_ALL;front.material=mat('HomeGuardHealthGreen_'+i,'#86c77a');
  parts.overlayHealthMeshes=[{mesh:back,y:.03,z:0},{mesh:front,y:.04,z:-.02}];"""
    if html.count(home_health_marker) != 1: raise SystemExit("Home guard health marker not unique")
    html=html.replace(home_health_marker,home_health_replacement,1)
    invasion_health_marker = "  function ensureInvasionHealthBars(ship,crewman){\n   if(!crewman.healthBack){"
    invasion_health_replacement = "  function ensureInvasionHealthBars(ship,crewman){\n   const overlayAnchor=ensureNpcOverlayAnchor(crewman&&crewman.parts)||(crewman&&crewman.parts&&crewman.parts.root);\n   if(!crewman.healthBack){"
    if html.count(invasion_health_marker) != 1: raise SystemExit("Invasion hp marker not unique")
    html=html.replace(invasion_health_marker,invasion_health_replacement,1)
    html=html.replace("crewman.healthBack.parent=crewman.parts.root;crewman.healthBack.position=v(0,2.02,0);","crewman.healthBack.parent=overlayAnchor;crewman.healthBack.position=v(0,.03,0);",1)
    html=html.replace("crewman.healthMesh.parent=crewman.parts.root;crewman.healthMesh.position=v(0,2.03,-.02);","crewman.healthMesh.parent=overlayAnchor;crewman.healthMesh.position=v(0,.04,-.02);",1)
    invasion_health_return = "   }\n   return {healthBack:crewman.healthBack,healthMesh:crewman.healthMesh};\n  }\n  function createIslandInvasionUnit"
    invasion_health_return_replacement = "   }\n   if(overlayAnchor){crewman.healthBack.parent=overlayAnchor;crewman.healthBack.position=v(0,.03,0);crewman.healthMesh.parent=overlayAnchor;crewman.healthMesh.position=v(0,.04,-.02);crewman.parts.overlayHealthMeshes=[{mesh:crewman.healthBack,y:.03,z:0},{mesh:crewman.healthMesh,y:.04,z:-.02}];}\n   return {healthBack:crewman.healthBack,healthMesh:crewman.healthMesh};\n  }\n  function createIslandInvasionUnit"
    if html.count(invasion_health_return) != 1: raise SystemExit("Invasion hp return marker not unique")
    html=html.replace(invasion_health_return,invasion_health_return_replacement,1)

    # 0.6.352: stable player-model weapon parenting and defensive grip calibration.
    weapon_parent_marker = "realWeaponHolder.parent=realPlayerModelPivot||socket;"
    if html.count(weapon_parent_marker) != 1:
        raise SystemExit("No se encontró la asignación única del anclaje del arma.")
    html = html.replace(weapon_parent_marker, "realWeaponHolder.parent=realPlayerModelPivot;", 1)
    weapon_sync_parent_marker = "const holderParent=socket||realPlayerModelPivot;"
    if html.count(weapon_sync_parent_marker) != 1:
        raise SystemExit("No se encontró el padre único del anclaje dinámico del arma.")
    html = html.replace(weapon_sync_parent_marker, "const holderParent=realPlayerModelPivot;", 1)
    weapon_grip_guard_marker = "    holderParent.computeWorldMatrix(true);\n    const inverseParent=holderParent.getWorldMatrix().clone();"
    weapon_grip_guard_replacement = """    const pivotPosition=realPlayerModelPivot.getAbsolutePosition();
    if(!gripWorld||!Number.isFinite(gripWorld.x)||B.Vector3.Distance(gripWorld,pivotPosition)<.25||B.Vector3.Distance(gripWorld,pivotPosition)>2.25){
     gripWorld=pivotPosition.add(modelRight.scale(.29)).add(worldUp.scale(.92)).add(modelForward.scale(.06));
     stickAxis=forwardCarryAxis.clone();
    }
    if(realWeaponHolder.parent!==holderParent)realWeaponHolder.parent=holderParent;
    holderParent.computeWorldMatrix(true);
    const inverseParent=holderParent.getWorldMatrix().clone();"""
    if html.count(weapon_grip_guard_marker) != 1:
        raise SystemExit("No se encontró el bloque único para validar la posición mundial de la empuñadura.")
    html = html.replace(weapon_grip_guard_marker, weapon_grip_guard_replacement, 1)
    fallback_body_marker = "parts.body.setEnabled(false);parts.body=visualBody;parts.head=rig.head||null;"
    fallback_body_replacement = "parts.proceduralFallbackBody=parts.body;parts.body.setEnabled(false);parts.body=visualBody;parts.head=rig.head||null;"
    if html.count(fallback_body_marker) != 1:
        raise SystemExit("No se encontró la sustitución visual transaccional del NPC.")
    html = html.replace(fallback_body_marker, fallback_body_replacement, 1)
    gull_speed_marker = "speed:.064+i*.006"
    if html.count(gull_speed_marker) != 1:
        raise SystemExit("No se encontró la velocidad inicial única de la bandada.")
    html = html.replace(gull_speed_marker, "speed:.18+i*.014", 1)

    # 0.6.352: restore imported humanoid actor visibility after transactional GLB attachment.
    warrior_mesh_visibility_marker = """  const filterResult=filterNpcEquipmentMeshes(meshes,isCivilian);
  meshes=filterResult.meshes;"""
    warrior_mesh_visibility_replacement = """  const filterResult=filterNpcEquipmentMeshes(meshes,isCivilian);
  meshes=filterResult.meshes;
  meshes.forEach(mesh=>{try{mesh.setEnabled(true);}catch(_){}mesh.isVisible=true;mesh.visibility=1;});"""
    if html.count(warrior_mesh_visibility_marker) != 1:
        raise SystemExit("No se encontró el filtro único de visibilidad de mallas NPC.")
    html = html.replace(warrior_mesh_visibility_marker,warrior_mesh_visibility_replacement,1)

    warrior_attach_marker = "parts.realHuman={roots,meshes,groups,walk,run,idle,attack,current:null,rig,rest,sword,modelRoot,visualBody,isRaiderCrew,weaponSocketNode,role,manualGaitAvailable:!!(rig.leftUpperLeg&&rig.rightUpperLeg),manualGaitReady:!!(rig.leftUpperLeg&&rig.rightUpperLeg&&rig.leftLowerLeg&&rig.rightLowerLeg),modelForwardOffset:NPC_HUMAN_FORWARD_OFFSET,shadowCasterMeshes,shadowCasterActive:true,phaseOffset:index*1.37};"
    warrior_attach_replacement = warrior_attach_marker.replace("phaseOffset:index*1.37};", "phaseOffset:index*1.37,visualBodyLocalPosition:visualBody.position.clone(),modelRootLocalPosition:modelRoot.position.clone()};") + "visualBody.setEnabled(true);modelRoot.setEnabled(true);parts.root.setEnabled(true);roots.forEach(root=>{try{root.setEnabled(true);}catch(_){}});meshes.forEach(mesh=>{try{mesh.setEnabled(true);}catch(_){}mesh.isVisible=true;mesh.visibility=1;});"
    if html.count(warrior_attach_marker) != 1:
        raise SystemExit("No se encontró la asignación única del rig humano NPC.")
    html = html.replace(warrior_attach_marker,warrior_attach_replacement,1)

    # Recover a nearby actor root if an earlier scene lifecycle step disabled it.
    npc_visual_lod_marker = "const wasVisible=real.distanceVisible!==false,wantVisible=wasVisible?d2<(hideRadius*hideRadius):d2<(showRadius*showRadius);\n    if(wantVisible!==wasVisible){real.distanceVisible=wantVisible;parts.root.setEnabled(wantVisible);}"
    npc_visual_lod_replacement = "const wasVisible=real.distanceVisible!==false,rootEnabled=typeof parts.root.isEnabled==='function'?parts.root.isEnabled():true,wantVisible=wasVisible?d2<(hideRadius*hideRadius):d2<(showRadius*showRadius);\n    if(wantVisible!==wasVisible||(wantVisible&&!rootEnabled)){real.distanceVisible=wantVisible;parts.root.setEnabled(wantVisible);}"
    if html.count(npc_visual_lod_marker) != 1:
        raise SystemExit("No se encontró el bloque único de LOD visual de NPC.")
    html = html.replace(npc_visual_lod_marker,npc_visual_lod_replacement,1)

    # Make the starting club a clearly readable wooden staff while retaining its weapon system.
    club_shaft_marker = "capsule('RealCastawayStickShaft',club,[0,-.04,0],1.22,.061,M.woodDark,[.025,0,.015]);"
    club_shaft_replacement = "capsule('RealCastawayStickShaft',club,[0,.68,0],1.34,.078,M.woodLight,[.025,0,.015]);\n  capsule('RealCastawayStickBranch',club,[.055,1.14,.008],.29,.047,M.woodDark,[0,0,-.70]);"
    if html.count(club_shaft_marker) != 1:
        raise SystemExit("No se encontró la geometría única del palo inicial.")
    html = html.replace(club_shaft_marker,club_shaft_replacement,1)

    club_axis_marker = "const forwardCarryAxis=modelForward.clone().add(new B.Vector3(0,.24,0)).normalize();"
    club_axis_replacement = "const forwardCarryAxis=modelForward.clone().scale(.62).add(worldUp.scale(.78)).normalize();"
    if html.count(club_axis_marker) != 1:
        raise SystemExit("No se encontró el eje único del palo equipado.")
    html = html.replace(club_axis_marker,club_axis_replacement,1)
    html = html.replace("gripWorld.addInPlace(modelRight.scale(.012));","gripWorld.addInPlace(modelRight.scale(.055));",1)
    weapon_group_marker = "const club=makeGroup('Club');club.position.y=-.20;"
    if html.count(weapon_group_marker) != 1: raise SystemExit("Club group marker not unique")
    html = html.replace(weapon_group_marker, "const club=makeGroup('Club');club.position.y=0;", 1)
    weapon_grip_marker = "capsule('RealCastawayStickGrip',club,[0,.20,.025],.34,.076,M.leather);"
    if html.count(weapon_grip_marker) != 1: raise SystemExit("Club grip marker not unique")
    html = html.replace(weapon_grip_marker, "capsule('RealCastawayStickGrip',club,[0,0,.025],.31,.076,M.leather);", 1)
    weapon_knot_marker = "sphere('RealCastawayStickKnot',club,[-.025,.52,.015],[.11,.12,.105],M.wood,[.15,0,.12]);"
    if html.count(weapon_knot_marker) != 1: raise SystemExit("Club knot marker not unique")
    html = html.replace(weapon_knot_marker, "sphere('RealCastawayStickKnot',club,[-.025,1.31,.015],[.11,.12,.105],M.wood,[.15,0,.12]);", 1)


    # 0.6.352: dense flagship ground cover; constrained devices retain the prior safe density.
    grass_density_marker = "const qualityGrassDensity=isTouchDevice?(islandIndex===0?8.8:5.8):(islandIndex===0?8.2:5.8);"
    grass_density_replacement = "const qualityGrassDensity=isTouchDevice?(isConstrainedMobile?(islandIndex===0?8.8:5.8):(islandIndex===0?10.4:7.0)):(islandIndex===0?8.8:6.2);"
    if html.count(grass_density_marker) != 1:
        raise SystemExit("No se encontró exactamente una densidad de hierba de Calidad para la nueva vegetación.")
    html = html.replace(grass_density_marker, grass_density_replacement, 1)

    # Keep a visible instanced grass layer in Performance; low-end devices retain a smaller budget.
    performance_density_marker = "const performanceDensity=isConstrainedMobile?(isUltraLowEndMobile?.22:(isGalaxyA12NachoPerformance?.18:.26)):(isTouchDevice?.36:.50);"
    performance_density_replacement = "const performanceDensity=isConstrainedMobile?(isUltraLowEndMobile?.22:(isGalaxyA12NachoPerformance?.18:.26)):(isTouchDevice?.46:.58);"
    if html.count(performance_density_marker) != 1:
        raise SystemExit("No se encontró exactamente el presupuesto de hierba del perfil Rendimiento.")
    html = html.replace(performance_density_marker, performance_density_replacement, 1)

    # More blades per tuft, using a tapered five-vertex blade profile.
    leaf_count_marker = "const leavesPerClump=isPerformanceMode?8:10;"
    if html.count(leaf_count_marker) != 1:
        raise SystemExit("No se encontró el número de hojas por mata.")
    html = html.replace(leaf_count_marker, "const leavesPerClump=isPerformanceMode?8:12;", 1)

    leaf_geometry_marker = """   for(const row of rows){
    positions.push(row.cx-px*row.w,row.cy,row.cz-pz*row.w,row.cx+px*row.w,row.cy,row.cz+pz*row.w);
    const shade=shades[shadeIndex%shades.length];
    for(let side=0;side<2;side++){
     const f=row.tint*(side===0?.95:1.05);
     colors.push(Math.min(1,shade[0]*f),Math.min(1,shade[1]*f),Math.min(1,shade[2]*f),1);
    }
   }
   indices.push(base,base+2,base+1,base+1,base+2,base+3,base+2,base+4,base+3,base+3,base+4,base+5);"""
    leaf_geometry_replacement = """    for(let rowIndex=0;rowIndex<2;rowIndex++){
     const row=rows[rowIndex];
     positions.push(row.cx-px*row.w,row.cy,row.cz-pz*row.w,row.cx+px*row.w,row.cy,row.cz+pz*row.w);
     const shade=shades[shadeIndex%shades.length];
     for(let side=0;side<2;side++){
      const f=row.tint*(side===0?.95:1.05);
      colors.push(Math.min(1,shade[0]*f),Math.min(1,shade[1]*f),Math.min(1,shade[2]*f),1);
     }
    }
    const tip=rows[2],tipShade=shades[shadeIndex%shades.length],tipTint=tip.tint*1.06;
    positions.push(tip.cx,tip.cy,tip.cz);
    colors.push(Math.min(1,tipShade[0]*tipTint),Math.min(1,tipShade[1]*tipTint),Math.min(1,tipShade[2]*tipTint),1);
    indices.push(base,base+2,base+1,base+1,base+2,base+3,base+2,base+4,base+3);"""
    if html.count(leaf_geometry_marker) != 1:
        raise SystemExit("No se encontró la geometría de hoja 3D original para optimizar su perfil.")
    html = html.replace(leaf_geometry_marker, leaf_geometry_replacement, 1)

    # GPU vertex displacement animates all thin instances without CPU vertex-buffer uploads.
    grass_material_marker = "const gm=new B.StandardMaterial('NordicGroundCoverMaterial',scene);if(!staging)grassBatchMaterial=gm;else if(grassStagingResources)grassStagingResources.material=gm;"

    grass_tint_marker = "const tint=rand(.93,1.06);batch.colors.push(tint,rand(.96,1.03),rand(.90,.99),1);"
    grass_tint_replacement = "const tint=rand(.88,1.12);batch.colors.push(tint,rand(.90,1.10),rand(.82,1.06),1);"
    if html.count(grass_tint_marker) != 1:
        raise SystemExit("No se encontró la variación cromática por mata.")
    html = html.replace(grass_tint_marker, grass_tint_replacement, 1)


    grass_batch_marker = """  for(const batch of grassBatches.values()){
   const grassMesh=new B.Mesh('NordicGroundCover_'+batch.islandIndex+'_'+batch.cellX+'_'+batch.cellZ,scene);
   vertexData.applyToMesh(grassMesh);grassMesh.material=gm;grassMesh.setEnabled(!staging);grassMesh.isPickable=false;grassMesh.receiveShadows=false;buildGrassMeshes.push(grassMesh);
   // Keep the source clump on the ground plane; instance transforms contain the actual terrain height.
   grassMesh.position.set(0,0,0);grassMesh.computeWorldMatrix(true);
   grassMesh.thinInstanceSetBuffer('matrix',new Float32Array(batch.matrices),16,true);
   grassMesh.thinInstanceSetBuffer('color',new Float32Array(batch.colors),4,true);
   grassMesh.thinInstanceCount=batch.matrices.length/16;grassMesh.thinInstanceRefreshBoundingInfo(true);
   grassMesh.doNotSyncBoundingInfo=false;
   let batchX=0,batchZ=0;for(let matrixOffset=12;matrixOffset<batch.matrices.length;matrixOffset+=16){batchX+=batch.matrices[matrixOffset];batchZ+=batch.matrices[matrixOffset+2];}
   const batchInstances=Math.max(1,batch.matrices.length/16);
   buildGrassBatches.push({mesh:grassMesh,x:batchX/batchInstances,z:batchZ/batchInstances,islandIndex:batch.islandIndex});
   grassUploadBatch++;
   if(performance.now()-grassUploadSliceStartedAt>=grassBuildSliceBudgetMs){await yieldStartupFrame();grassUploadSliceStartedAt=performance.now();}
  }"""
    grass_batch_replacement = """  for(const batch of grassBatches.values()){
   let batchX=0,batchZ=0;for(let matrixOffset=12;matrixOffset<batch.matrices.length;matrixOffset+=16){batchX+=batch.matrices[matrixOffset];batchZ+=batch.matrices[matrixOffset+2];}
   const batchInstances=Math.max(1,batch.matrices.length/16),centerX=batchX/batchInstances,centerZ=batchZ/batchInstances;
   const initialLod=selectGrassLod(centerX,centerZ,focusX,focusZ);
   const grassMesh=new B.Mesh('NordicGroundCover_'+batch.islandIndex+'_'+batch.cellX+'_'+batch.cellZ,scene);
   grassLodVertexData[initialLod].applyToMesh(grassMesh);grassMesh.material=gm;grassMesh.setEnabled(!staging);grassMesh.isPickable=false;grassMesh.receiveShadows=false;buildGrassMeshes.push(grassMesh);
   // Keep source tufts at the ground plane; instance transforms contain the actual terrain height.
   grassMesh.position.set(0,0,0);grassMesh.computeWorldMatrix(true);
   grassMesh.thinInstanceSetBuffer('matrix',new Float32Array(batch.matrices),16,true);
   grassMesh.thinInstanceSetBuffer('color',new Float32Array(batch.colors),4,true);
   grassMesh.thinInstanceCount=batch.matrices.length/16;grassMesh.thinInstanceRefreshBoundingInfo(true);
   grassMesh.doNotSyncBoundingInfo=false;
   buildGrassBatches.push({mesh:grassMesh,x:centerX,z:centerZ,islandIndex:batch.islandIndex,lod:initialLod,lodVertexData:grassLodVertexData,selectLod:selectGrassLod});
   grassUploadBatch++;
   if(performance.now()-grassUploadSliceStartedAt>=grassBuildSliceBudgetMs){await yieldStartupFrame();grassUploadSliceStartedAt=performance.now();}
  }"""
    if html.count(grass_batch_marker) != 1:
        raise SystemExit("No se encontró el bucle de carga de los lotes de hierba.")
    html = html.replace(grass_batch_marker, grass_batch_replacement, 1)

    grass_material_replacement = grass_material_marker + """

   // Distance LOD geometry: all tuft locations remain; only blades per tuft change.
   const grassLodLeafCounts=[leavesPerClump,Math.max(4,Math.floor(leavesPerClump*.42)),Math.max(2,Math.floor(leavesPerClump*.20))];
   const createGrassLodVertexData=bladeCount=>{
    const lodPositions=[],lodIndices=[],lodColors=[],lodNormals=[];
    for(let lodBlade=0;lodBlade<bladeCount;lodBlade++){
     const sourceBlade=Math.min(leavesPerClump-1,Math.floor((lodBlade+.5)*leavesPerClump/bladeCount));
     const sourceVertex=sourceBlade*5,targetVertex=lodPositions.length/3;
     for(let vertex=0;vertex<5;vertex++){
      const positionOffset=(sourceVertex+vertex)*3,colorOffset=(sourceVertex+vertex)*4;
      lodPositions.push(positions[positionOffset],positions[positionOffset+1],positions[positionOffset+2]);
      lodColors.push(colors[colorOffset],colors[colorOffset+1],colors[colorOffset+2],colors[colorOffset+3]);
     }
     const sourceIndex=sourceBlade*9;
     for(let index=0;index<9;index++)lodIndices.push(targetVertex+(indices[sourceIndex+index]-sourceVertex));
    }
    B.VertexData.ComputeNormals(lodPositions,lodIndices,lodNormals);
    const data=new B.VertexData();data.positions=lodPositions;data.indices=lodIndices;data.normals=lodNormals;data.colors=lodColors;
    return data;
   };
   const grassLodVertexData=[vertexData,createGrassLodVertexData(grassLodLeafCounts[1]),createGrassLodVertexData(grassLodLeafCounts[2])];
   const grassLodNearMeters=isConstrainedMobile?26:(isPerformanceMode?34:(isTouchDevice?48:64));
   const grassLodMidMeters=isConstrainedMobile?76:(isPerformanceMode?108:(isTouchDevice?136:182));
   const selectGrassLod=(x,z,focusX,focusZ,previousLod=-1)=>{
    const fx=Number.isFinite(focusX)?focusX:player.root.position.x,fz=Number.isFinite(focusZ)?focusZ:player.root.position.z;
    const distance=Math.hypot(x-fx,z-fz);
    if(previousLod<0)return distance<grassLodNearMeters?0:(distance<grassLodMidMeters?1:2);
    if(previousLod===0&&distance<=grassLodNearMeters+10)return 0;
    if(previousLod===2&&distance>=grassLodMidMeters-16)return 2;
    if(distance<grassLodNearMeters-10)return 0;
    if(distance<grassLodMidMeters-16)return 1;
    return 2;
   };

   class NordicGrassWindPlugin extends B.MaterialPluginBase{
    constructor(material){
     super(material,'NordicGrassWind',200,{NORSE_GRASS_WIND:true});
     this.strength=isPerformanceMode?.40:(isConstrainedMobile?.72:1.0);
     this._enable(true);
    }
    getClassName(){return 'NordicGrassWindPlugin';}
    isCompatible(shaderLanguage){return shaderLanguage===B.ShaderLanguage.GLSL;}
    prepareDefines(defines){defines.NORSE_GRASS_WIND=true;}
    getUniforms(){
     return {
      ubo:[{name:'grassWindTime',size:1,type:'float'},{name:'grassWindStrength',size:1,type:'float'}],
      vertex:'#ifdef NORSE_GRASS_WIND\\nuniform float grassWindTime;\\nuniform float grassWindStrength;\\n#endif'
     };
    }
    _bindWind(uniformBuffer){
     if(!uniformBuffer||typeof uniformBuffer.updateFloat!=='function')return;
     uniformBuffer.updateFloat('grassWindTime',performance.now()*.001);
     uniformBuffer.updateFloat('grassWindStrength',this.strength);
    }
    bindForSubMesh(uniformBuffer){this._bindWind(uniformBuffer);}
    hardBindForSubMesh(uniformBuffer){this._bindWind(uniformBuffer);}
    getCustomCode(shaderType,shaderLanguage){
     if(shaderType!=='vertex'||shaderLanguage!==B.ShaderLanguage.GLSL)return null;
     return {CUSTOM_VERTEX_UPDATE_POSITION:
      '#ifdef NORSE_GRASS_WIND\\n'+
      'float grassWindHeight=clamp(positionUpdated.y/0.42,0.0,1.0);\\n'+
      'float grassWindFlex=grassWindHeight*grassWindHeight;\\n'+
      'float grassWindSeed=0.0;\\n'+
      '#ifdef INSTANCESCOLOR\\n'+
      'grassWindSeed=instanceColor.r*6.2831853+instanceColor.g*2.173;\\n'+
      '#endif\\n'+
      'float grassWindPhase=grassWindTime*1.08+grassWindSeed+positionUpdated.x*4.4+positionUpdated.z*5.1;\\n'+
      'float grassWindWave=sin(grassWindPhase)*0.72+sin(grassWindPhase*0.47+1.8)*0.28;\\n'+
      'float grassWindCross=cos(grassWindPhase*0.73+0.9);\\n'+
      'positionUpdated.x+=(grassWindWave*0.052+grassWindCross*0.014)*grassWindFlex*grassWindStrength;\\n'+
      'positionUpdated.z+=(grassWindCross*0.034+grassWindWave*0.010)*grassWindFlex*grassWindStrength;\\n'+
      '#endif'
     };
    }
   }
   const grassWindPlugin=new NordicGrassWindPlugin(gm);
   window.__ELSN_GRASS_WIND__={enabled:true,mode:'gpu-vertex-displacement',uniformBinding:'hardBindForSubMesh',profile:isPerformanceMode?'performance':'quality',leavesPerClump:leavesPerClump};"""
    if html.count(grass_material_marker) != 1:
        raise SystemExit("No se encontró el material único de la hierba para instalar el viento GPU.")
    html = html.replace(grass_material_marker, grass_material_replacement, 1)

    # Keep a visible instanced grass population in both profiles.
    want_marker = "const want=isPerformanceMode?0:Math.max(1,Math.round(baseWant*qualityGrassDensity*areaFraction));"
    want_replacement = "const want=Math.max(1,Math.round(baseWant*(isPerformanceMode?performanceDensity:qualityGrassDensity)*areaFraction));"
    if html.count(want_marker) != 1:
        raise SystemExit("No se encontró la decisión única de población de hierba por perfil.")
    html = html.replace(want_marker, want_replacement, 1)

    stream_skip_marker = "async function streamActiveIslandGrass(index,focusX,focusZ){\n  if(isPerformanceMode)return;"
    if html.count(stream_skip_marker) != 1:
        raise SystemExit("No se encontró el guard de desactivación del streaming de hierba en Rendimiento.")
    html = html.replace(stream_skip_marker, "async function streamActiveIslandGrass(index,focusX,focusZ){", 1)
    update_skip_marker = "function updateActiveIslandGrass(dt){\n  if(isPerformanceMode)return;"
    if html.count(update_skip_marker) != 1:
        raise SystemExit("No se encontró el guard de desactivación de actualización de hierba en Rendimiento.")
    html = html.replace(update_skip_marker, "function updateActiveIslandGrass(dt){", 1)

    initial_grass_marker = """ // La hierba existe únicamente en Calidad y solo en un radio local alrededor del jugador.
 // Rendimiento no crea geometría, buffers ni materiales de hierba.
 if(!isPerformanceMode){
  const initialGrassIslandIndex=landIslandIndex(player.root.position.x,player.root.position.z);
  grassStreamActiveIslandIndex=initialGrassIslandIndex;
  grassStreamCenterX=player.root.position.x;grassStreamCenterZ=player.root.position.z;
  const initialGrassStartedAt=performance.now();
  await createRealGrass(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ);
  recordStartupTask('Hierba 3D inicial de Calidad',initialGrassStartedAt,performance.now(),'ready',{clumps:grassInstanceCount,batches:grassBatchCount,island:initialGrassIslandIndex});
  console.info('Hierba cercana de la isla inicial preparada.',{profile:activeGraphicsProfile,island:land[initialGrassIslandIndex]&&land[initialGrassIslandIndex].name,clumps:grassInstanceCount,batches:grassBatchCount,radiusMeters:92});
 }else{
  grassStreamActiveIslandIndex=-1;grassDebugClumpCount=0;grassDebugBatchCount=0;grassDebugIslandStats.length=0;
  console.info('Hierba desactivada en modo Rendimiento.');
 }"""
    initial_grass_replacement = """ // Both profiles retain a full-island grass field; Performance changes density and tuft complexity, not grass availability.
 const initialGrassIslandIndex=landIslandIndex(player.root.position.x,player.root.position.z);
 grassStreamActiveIslandIndex=initialGrassIslandIndex;
 grassStreamCenterX=player.root.position.x;grassStreamCenterZ=player.root.position.z;
 const initialGrassStartedAt=performance.now();
 await createRealGrass(initialGrassIslandIndex,grassStreamCenterX,grassStreamCenterZ);
 recordStartupTask('Hierba 3D inicial',initialGrassStartedAt,performance.now(),'ready',{clumps:grassInstanceCount,batches:grassBatchCount,island:initialGrassIslandIndex,profile:isPerformanceMode?'performance':'quality',wind:'gpu-vertex-displacement'});
 console.info('Cobertura 3D de hierba inicial preparada.',{profile:activeGraphicsProfile,island:land[initialGrassIslandIndex]&&land[initialGrassIslandIndex].name,clumps:grassInstanceCount,batches:grassBatchCount,radiusMeters:land[initialGrassIslandIndex].r*.70,wind:'gpu-vertex-displacement'});"""

    if html.count(initial_grass_marker) != 1:
        raise SystemExit("No se encontró el bloque único de hierba inicial que desactivaba Rendimiento.")
    html = html.replace(initial_grass_marker, initial_grass_replacement, 1)

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
  const forestTreeSpacingStats={placed:0,relocated:0,skipped:0,minGapMeters:6.5};
  function findForestTreePlacement(x,z,canopyRadius){
   const islandIndex=landIslandIndex(x,z),island=land[islandIndex];
   if(!island)return null;
   const acceptable=(cx,cz)=>{
    if(landIslandIndex(cx,cz)!==islandIndex||!isSafeIslandGroundPoint(island,cx,cz,4.4,.70,.52))return false;
    for(const other of trees){
     if(!other||other.alive===false)continue;
     const dx=cx-other.x,dz=cz-other.z;
     const otherRadius=Math.max(3.0,Number(other.canopyRadius)||3.0);
     const required=Math.max(forestTreeSpacingStats.minGapMeters,(canopyRadius+otherRadius)*1.12);
     if(dx*dx+dz*dz<required*required)return false;
    }
    // Trees are planted incrementally beside rocks; reject a new tree if an earlier
    // resource deposit already occupies its trunk footprint.
    for(const rock of rocks){
     if(!rock||rock.alive===false)continue;
     const dx=cx-rock.x,dz=cz-rock.z;
     const required=(Number(rock.radius)||.7)+.9+.45;
     if(dx*dx+dz*dz<required*required)return false;
    }
    return true;
   };
   if(acceptable(x,z))return {x,z};
   const phase=Math.atan2(z-island.z,x-island.x);
   for(let ring=1;ring<=16;ring++){
    const distance=ring*.8,steps=ring<4?16:24;
    for(let step=0;step<steps;step++){
     const angle=phase+step*Math.PI*2/steps+(ring%2)*.09;
     const candidateX=x+Math.cos(angle)*distance,candidateZ=z+Math.sin(angle)*distance;
     if(acceptable(candidateX,candidateZ))return {x:candidateX,z:candidateZ};
    }
   }
   return null;
  }
  window.__ELSN_FOREST_TREE_SPACING__=()=>{const live=trees.filter(tree=>tree&&tree.alive);let overlapPairs=0,rockOverlapPairs=0,minCenterDistance=Infinity,minRockTreeClearance=Infinity;for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i],c=live[j],distance=Math.hypot(a.x-c.x,a.z-c.z);minCenterDistance=Math.min(minCenterDistance,distance);const required=Math.max(forestTreeSpacingStats.minGapMeters,(Math.max(3,Number(a.canopyRadius)||3)+Math.max(3,Number(c.canopyRadius)||3))*1.12);if(distance<required-.05)overlapPairs++;}for(const tree of live)for(const rock of rocks){if(!rock||rock.alive===false)continue;const clearance=Math.hypot(tree.x-rock.x,tree.z-rock.z)-(Number(tree.radius)||.9)-(Number(rock.radius)||.7)-.45;minRockTreeClearance=Math.min(minRockTreeClearance,clearance);if(clearance<-.05)rockOverlapPairs++;}return {...forestTreeSpacingStats,treeCount:live.length,overlapPairs,rockOverlapPairs,minCenterDistanceMeters:Number.isFinite(minCenterDistance)?Number(minCenterDistance.toFixed(2)):null,minRockTreeClearanceMeters:Number.isFinite(minRockTreeClearance)?Number(minRockTreeClearance.toFixed(3)):null};};
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
  meshes.forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=false;});
  const horizontalSpan=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)*placedScale;
  const conifer=kind==='pine'||kind==='spruce';
  const canopyRadius=Math.max(conifer?3.6:3.0,Math.min(conifer?5.2:4.6,horizontalSpan*(conifer?0.70:0.62)));
  const placement=findForestTreePlacement(x,z,canopyRadius);
  if(!placement){forestTreeSpacingStats.skipped++;root.dispose(false,false);return null;}
  if(Math.hypot(placement.x-x,placement.z-z)>.10)forestTreeSpacingStats.relocated++;
  forestTreeSpacingStats.placed++;x=placement.x;z=placement.z;
  root.position=v(x,renderedTerrainSurfaceAt(x,z),z);root.computeWorldMatrix(true);
  return {root,canopy,x,z,radius:Math.max(.62,Math.min(1.45,horizontalSpan*.24)),canopyRadius,hp:3,alive:true,hitFlash:0,falling:null,fallX:0,fallZ:0,species:kind,baseYaw,baseYOffset:0,windPhase:rand(0,Math.PI*2),modelLabel:spec.spec.label,modelMeshCount:meshes.length,height:spec.spec.targetHeight*scale};
 }
"""
    html = html[:tree_start] + tree_rebuild_code + html[tree_end:]
    forest_planting_marker = " land.forEach((is,idx)=>{"
    if html.count(forest_planting_marker) != 1:
        raise SystemExit("No se encontró el único bloque de plantación de árboles del archipiélago.")
    html = html.replace(forest_planting_marker, " await loadForestTreeTemplates();\n const forestPlantingStartedAt=performance.now();\n for(let idx=0;idx<land.length;idx++){const is=land[idx];", 1)
    tree_push_marker = "trees.push(createTree(x,z,rand(.78,1.12)));"
    tree_plant_iteration_marker = "  for(let i=0;i<count;i++){\n   const p=sampleGroundPoint(is,4.4,.70,.22,.82);"
    tree_plant_iteration_replacement = "  for(let i=0;i<count;i++){\n   if((i&1)===0)await new Promise(resolve=>requestAnimationFrame(resolve));\n   const p=sampleGroundPoint(is,4.4,.70,.22,.82);"
    if html.count(tree_plant_iteration_marker) != 1:
        raise SystemExit("No se encontró el único bucle de plantación de árboles.")
    html = html.replace(tree_plant_iteration_marker,tree_plant_iteration_replacement,1)

    tree_push_replacement = "const plantedTree=createTree(x,z,rand(.78,1.12));if(plantedTree)trees.push(plantedTree);await new Promise(resolve=>requestAnimationFrame(resolve));"
    if html.count(tree_push_marker) != 1:
        raise SystemExit("No se encontró el único punto de inserción de árboles del archipiélago.")
    html = html.replace(tree_push_marker,tree_push_replacement,1)

    forest_loop_end_marker = "   rocks.push(createRock(x,z));\n  }\n });\n // A recognisable longship"
    forest_loop_end_replacement = "   const placedRock=createRock(x,z);if(placedRock)rocks.push(placedRock);\n   if((i&3)===3)await new Promise(resolve=>requestAnimationFrame(resolve));\n  }\n  await new Promise(resolve=>requestAnimationFrame(resolve));\n }\n recordStartupTask('Plantación inicial de bosque',forestPlantingStartedAt,performance.now(),'ready',{...forestTreeSpacingStats,treeCount:trees.length,rockPlacement:mineableRockPlacementStats});\n // A recognisable longship"
    if html.count(forest_loop_end_marker) != 1:
        raise SystemExit("No se encontró el cierre único de la generación forestal.")
    html = html.replace(forest_loop_end_marker,forest_loop_end_replacement,1)

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
    progress_replacement = """const startupProgressSteps=[
 {title:'MOTOR 3D',detail:'Despertando la maquinaria del mundo…'},
 {title:'EL MUNDO',detail:'Dando forma a las islas y a la costa…'},
 {title:'PERSONAJES',detail:'Reuniendo guardianes y guerreros…'},
 {title:'FAUNA',detail:'Despertando la vida de las islas…'},
 {title:'GRÁFICOS',detail:'Encendiendo luz, agua y atmósfera…'},
 {title:'LA PARTIDA',detail:'Todo está preparado para zarpar…'}
];
let startupProgressActiveIndex=-1,startupProgressStageStartedAt=performance.now();
function ensureStartupProgressPanel(){
 let panel=document.getElementById('elsnStartupProgressPanel');
 if(panel)return panel;
 const style=document.createElement('style');
 style.id='elsn-startup-progress-style';
 style.textContent=[
  '#elsnStartupProgressPanel{position:fixed;inset:0;z-index:2147482000;pointer-events:none;color:#f4ead8;font-family:Georgia,serif}',
  '#elsnStartupProgressPanel *{box-sizing:border-box}',
  '#elsnStartupProgressPanel::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 17% 39%,rgba(179,137,79,.13),transparent 43%),radial-gradient(ellipse at 82% 18%,rgba(73,124,119,.23),transparent 42%),linear-gradient(180deg,rgba(2,10,13,.02) 0%,rgba(2,10,13,.03) 64%,rgba(2,9,11,.57) 82%,rgba(2,8,10,.94) 100%);pointer-events:none}',
  '#elsnStartupProgressPanel::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(210,173,111,.5),transparent)}',
  '#elsnStartupProgressPanel .elsn-sp-content{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(780px,100%);padding:18px clamp(22px,6vw,68px) calc(20px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(3,11,13,0) 0%,rgba(3,11,13,.46) 22%,rgba(3,11,13,.88) 100%);border-top:1px solid rgba(205,166,102,.24)}',
  '#elsnStartupProgressPanel .elsn-sp-brand{display:flex;align-items:center;gap:9px;margin-bottom:11px;color:rgba(229,203,159,.78);font:700 9px/1.2 system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase}',
  '#elsnStartupProgressPanel .elsn-sp-mark{display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid rgba(220,181,116,.54);border-radius:50%;color:#e3c18b;font:16px/1 Georgia,serif}',
  '#elsnStartupProgressPanel .elsn-sp-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:10px}',
  '#elsnStartupProgressPanel .elsn-sp-stage{display:block;color:#f1dfc0;font:700 clamp(20px,4vw,29px)/1.05 Georgia,serif;letter-spacing:.075em;text-transform:uppercase;text-shadow:0 2px 18px rgba(0,0,0,.5)}',
  '#elsnStartupProgressPanel .elsn-sp-percent{flex:none;color:#f0d5a7;font:600 20px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}',
  '#elsnStartupProgressPanel .elsn-sp-track{height:3px;width:100%;overflow:hidden;background:rgba(255,255,255,.15);box-shadow:0 1px 8px rgba(0,0,0,.35)}',
  '#elsnStartupProgressPanel .elsn-sp-fill{display:block;width:0;height:100%;background:linear-gradient(90deg,#9c7543,#f1d6a1);box-shadow:0 0 14px rgba(221,179,111,.55);transition:width .32s ease-out}',
  '#elsnStartupProgressPanel .elsn-sp-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;color:rgba(244,234,216,.86);font:500 11px/1.35 system-ui,sans-serif}',
  '#elsnStartupProgressPanel .elsn-sp-action{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.015em}',
  '#elsnStartupProgressPanel .elsn-sp-elapsed{flex:none;color:rgba(225,194,143,.78);font-variant-numeric:tabular-nums;letter-spacing:.08em}',
  '#elsnStartupProgressPanel .elsn-sp-segments{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-top:12px}',
  '#elsnStartupProgressPanel .elsn-sp-segment{height:2px;background:rgba(255,255,255,.15);transition:background .25s ease,box-shadow .25s ease}',
  '#elsnStartupProgressPanel .elsn-sp-segment.is-done{background:rgba(207,171,111,.66)}',
  '#elsnStartupProgressPanel .elsn-sp-segment.is-active{background:#efd09b;box-shadow:0 0 9px rgba(239,208,155,.45)}',
  '#loading .loadBottom{display:none!important}',
  '@media(max-width:480px){#elsnStartupProgressPanel .elsn-sp-content{padding:14px 22px calc(15px + env(safe-area-inset-bottom,0px))}#elsnStartupProgressPanel .elsn-sp-brand{margin-bottom:8px;font-size:8px;letter-spacing:.19em}#elsnStartupProgressPanel .elsn-sp-heading{margin-bottom:8px}#elsnStartupProgressPanel .elsn-sp-stage{font-size:23px}#elsnStartupProgressPanel .elsn-sp-percent{font-size:18px}#elsnStartupProgressPanel .elsn-sp-footer{margin-top:8px;font-size:10px}#elsnStartupProgressPanel .elsn-sp-segments{margin-top:10px;gap:4px}}',
  '@media(prefers-reduced-motion:reduce){#elsnStartupProgressPanel .elsn-sp-fill,#elsnStartupProgressPanel .elsn-sp-segment{transition:none}}'
 ].join('');
 document.head.appendChild(style);
 panel=document.createElement('section');
 panel.id='elsnStartupProgressPanel';
 panel.setAttribute('role','status');
 panel.setAttribute('aria-live','polite');
 panel.innerHTML='<div class="elsn-sp-content"><div class="elsn-sp-brand"><span class="elsn-sp-mark" aria-hidden="true">ᚠ</span><span>EL SIN NOMBRE · SAGA DEL NORTE</span></div><div class="elsn-sp-heading"><strong class="elsn-sp-stage" id="elsnStartupProgressStage">MOTOR 3D</strong><span class="elsn-sp-percent" id="elsnStartupProgressPercent">0%</span></div><div class="elsn-sp-track" id="elsnStartupProgressTrack" role="progressbar" aria-label="Preparación de la partida" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="elsn-sp-fill" id="elsnStartupProgressFill"></span></div><div class="elsn-sp-footer"><span class="elsn-sp-action" id="elsnStartupProgressAction">Despertando la maquinaria del mundo…</span><span class="elsn-sp-elapsed" id="elsnStartupProgressElapsed">00 s</span></div><div class="elsn-sp-segments" aria-hidden="true">'+startupProgressSteps.map((step,index)=>'<span class="elsn-sp-segment" data-step="'+index+'"></span>').join('')+'</div></div>';
 document.body.appendChild(panel);
 if(!window.__ELSN_STARTUP_PROGRESS_TIMER__)window.__ELSN_STARTUP_PROGRESS_TIMER__=window.setInterval(()=>{
  const loading=document.getElementById('loading');
  if(!loading||getComputedStyle(loading).display==='none'||document.body.classList.contains('game-running')){
   panel.remove();
   window.clearInterval(window.__ELSN_STARTUP_PROGRESS_TIMER__);
   window.__ELSN_STARTUP_PROGRESS_TIMER__=null;
   return;
  }
  const elapsed=document.getElementById('elsnStartupProgressElapsed');
  if(elapsed&&startupProgressActiveIndex>=0)elapsed.textContent=String(Math.max(0,Math.floor((performance.now()-startupProgressStageStartedAt)/1000))).padStart(2,'0')+' s';
 },1000);
 return panel;
}
function renderStartupProgress(value,label){
 const panel=ensureStartupProgressPanel();
 if(!panel)return;
 const progress=Math.max(0,Math.min(100,Number(value)||0));
 const index=progress>=100?5:progress>=93?4:progress>=87?3:progress>=82?2:progress>=40?1:0;
 if(index!==startupProgressActiveIndex){startupProgressActiveIndex=index;startupProgressStageStartedAt=performance.now();}
 const step=startupProgressSteps[index];
 const heading=panel.querySelector('#elsnStartupProgressStage');
 const percent=panel.querySelector('#elsnStartupProgressPercent');
 const fill=panel.querySelector('#elsnStartupProgressFill');
 const track=panel.querySelector('#elsnStartupProgressTrack');
 const action=panel.querySelector('#elsnStartupProgressAction');
 const elapsed=panel.querySelector('#elsnStartupProgressElapsed');
 if(heading)heading.textContent=step.title;
 if(percent)percent.textContent=Math.floor(progress)+'%';
 if(fill)fill.style.width=progress.toFixed(2)+'%';
 if(track)track.setAttribute('aria-valuenow',String(Math.round(progress)));
 if(action)action.textContent=label||step.detail;
 if(elapsed)elapsed.textContent=String(Math.max(0,Math.floor((performance.now()-startupProgressStageStartedAt)/1000))).padStart(2,'0')+' s';
 panel.querySelectorAll('[data-step]').forEach(node=>{
  const current=Number(node.getAttribute('data-step'));
  node.classList.toggle('is-done',current<index);
  node.classList.toggle('is-active',current===index);
 });
}
function setLoadingProgress(value,label){
 trackStartupPerfStage(value,label);
 targetLoadProgress=Math.max(targetLoadProgress,Math.min(100,Math.max(0,Number(value)||0)));
 currentLoadProgress=targetLoadProgress;
 if(loadProgressAnimation)cancelAnimationFrame(loadProgressAnimation);
 loadProgressAnimation=0;lastLoadProgressFrame=0;
 if(label&&loadText)loadText.textContent=label;
 if(loadProgressBar)loadProgressBar.style.width=currentLoadProgress.toFixed(2)+'%';
 if(loadProgressLabel)loadProgressLabel.textContent=Math.floor(currentLoadProgress)+'%';
 if(loadProgressTrack)loadProgressTrack.setAttribute('aria-valuenow',String(Math.round(currentLoadProgress)));
 renderStartupProgress(currentLoadProgress,label);
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
 const source=sameOrigin?'same-origin-native-script':'external-script';
 try{if(performance.setResourceTimingBufferSize)performance.setResourceTimingBufferSize(256);}catch(_){}
 // Hand the same-origin URL directly to Chromium. The browser streams, parses and compiles
 // the script itself; do not duplicate the multi-megabyte engine in fetch buffers or a Blob.
 setLoadingProgress(progressStart,label+' · carga nativa del navegador…');
 let result;
 try{result=await loadEngine(resolved.href,timeoutMs,check);}
 catch(error){result={ok:false,reason:error&&error.message?error.message:String(error),url:resolved.href};}
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
 return {...(result||{ok:false,reason:'fallo desconocido',url:resolved.href}),cached:cacheStatus==='cached',source:record.source,durationMs:record.durationMs,cacheStatus,transferSize,encodedBodySize,decodedBodySize};
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
    wildlife_remote_root = " const WILDLIFE_ASSET_ROOT='https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/'+WILDLIFE_SOURCE_COMMIT+'/public/glb/animals_pack/';"
    wildlife_local_root = " const WILDLIFE_ASSET_ROOT=new URL('./assets/models/wildlife/',document.baseURI).href;"
    if html.count(wildlife_remote_root) != 1:
        raise SystemExit("No se encontró la única fuente externa de los GLB de fauna.")
    html = html.replace(wildlife_remote_root, wildlife_local_root, 1)

    # Persist the three pinned animal GLBs independently of the Service Worker
    # control state on the very first visit. A later SW release preserves this bucket.
    wildlife_loader_marker = " async function downloadWildlifeBlob(kind){"
    wildlife_cache_code = """ const WILDLIFE_MODEL_CACHE='el-sin-nombre-models-wildlife-0128ca51-v1';
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
    animal_silhouette_replacement = "\n   const animalSkinningMeshes=meshes.filter(mesh=>mesh.skeleton&&Number(mesh.numBoneInfluencers)>0);\n   const softwareSkinningRenderer=/SwiftShader|llvmpipe|software/i.test(graphicsRenderer);const forceCpuSkinning=window.__ELSN_FORCE_CPU_SKINNING__===true,forceGpuSkinning=window.__ELSN_FORCE_GPU_SKINNING__===true;if(forceCpuSkinning&&forceGpuSkinning)throw new Error('El diagnóstico de fauna no puede forzar CPU y GPU skinning a la vez.');const useCpuSkinning=forceCpuSkinning||(!forceGpuSkinning&&softwareSkinningRenderer);animalSkinningMeshes.forEach(mesh=>{mesh.computeBonesUsingShaders=!useCpuSkinning;mesh.alwaysSelectAsActiveMesh=true;});\n   (imported.skeletons||[]).forEach(skeleton=>{try{if(typeof skeleton.prepare==='function')skeleton.prepare();}catch(_){}});\n   const horizontalMin=Math.max(.055,sourceBounds.height*.045),horizontalMajor=Math.max(.18,sourceBounds.height*.14);\n   if(Math.min(width,depth)<horizontalMin||Math.max(width,depth)<horizontalMajor)throw new Error('Silueta animal degenerada; dimensiones X/Z '+width.toFixed(3)+'/'+depth.toFixed(3)+' m para altura '+sourceBounds.height.toFixed(3)+' m.');"
    html = html[:animal_dimensions_at] + animal_silhouette_replacement + html[animal_check_end:]
    animal_skinning_mode_marker = "skinnedVertexCount,dimensions:{width:Number(width.toFixed(3))"
    animal_skinning_mode_replacement = "skinnedVertexCount,skinningMode:useCpuSkinning?'cpu':'gpu',dimensions:{width:Number(width.toFixed(3))"
    if html.count(animal_skinning_mode_marker) != 1:
        raise SystemExit("No se encontró el único objeto animal para registrar el modo de skinning.")
    html = html.replace(animal_skinning_mode_marker, animal_skinning_mode_replacement, 1)


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
 async function isValidGLB(blob){
  const record=await inspectGLBContainer(blob);
  if(!record)return false;
  const json=record.json||{},skins=json.skins||[],animations=json.animations||[],nodes=json.nodes||[];
  return skins.some(skin=>Array.isArray(skin.joints)&&skin.joints.length>=12)&&
   animations.some(animation=>Array.isArray(animation.channels)&&animation.channels.length>0&&Array.isArray(animation.samplers)&&animation.samplers.length>0)&&
   nodes.some(node=>Number.isInteger(node.mesh)&&Number.isInteger(node.skin));
 }
 async function waitForAnimalTextures(meshes,kind,timeoutMs=30000){
  const list=Array.from(meshes||[]),textures=new Set();
  if(!list.length)throw new Error(kind+': no hay mallas para validar su presentación.');
  for(const mesh of list){
   if(!mesh||!(mesh.getTotalVertices&&mesh.getTotalVertices()>0))throw new Error(kind+': se ha importado una malla sin geometría.');
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials)if(material&&typeof material.getActiveTextures==='function'){
    for(const texture of material.getActiveTextures()||[])if(texture)textures.add(texture);
   }
  }
  const started=performance.now();
  const pendingNow=()=>{
   const pendingTextures=Array.from(textures).filter(texture=>typeof texture.isReady==='function'&&!texture.isReady());
   const pendingMeshes=list.filter(mesh=>typeof mesh.isReady==='function'&&!mesh.isReady(true));
   return {pendingTextures,pendingMeshes};
  };
  await new Promise((resolve,reject)=>{
   let settled=false,timer=null;
   const finish=error=>{if(settled)return;settled=true;if(timer!==null)clearTimeout(timer);if(error)reject(error);else resolve();};
   const check=()=>{
    const pending=pendingNow();
    if(!pending.pendingTextures.length&&!pending.pendingMeshes.length)return finish(null);
    if(performance.now()-started>=timeoutMs)return finish(new Error(kind+': preparación visual incompleta; '+pending.pendingMeshes.length+'/'+list.length+' mallas y '+pending.pendingTextures.length+'/'+textures.size+' texturas pendientes.'));
    setTimeout(check,50);
   };
   timer=setTimeout(()=>{const pending=pendingNow();finish(new Error(kind+': espera visual agotada; '+pending.pendingMeshes.length+' mallas y '+pending.pendingTextures.length+' texturas pendientes.'));},timeoutMs+250);
   check();
  });
  return {count:textures.size,readyMeshes:list.length,waitedMs:Number((performance.now()-started).toFixed(1))};
 }"""
    if html.count(glb_validator_marker) != 1:
        raise SystemExit("No se encontró el validador GLB único.")
    html = html.replace(glb_validator_marker, glb_validator_required, 1)

    wildlife_import_snapshot_marker = "  let imported=null,objectUrl=null,actor=null;\n  try{\n   // Import each GLB independently into the live scene; never clone a skinned mesh/skeleton.\n   objectUrl=URL.createObjectURL(blob);"
    wildlife_import_snapshot_marker_replacement = "  let imported=null,objectUrl=null,actor=null;\n  const beforeMeshes=new Set(scene.meshes||[]),beforeNodes=new Set(scene.transformNodes||[]),beforeSkeletons=new Set(scene.skeletons||[]),beforeGroups=new Set(scene.animationGroups||[]);\n  try{\n   const glbRecord=await inspectGLBContainer(blob),sourceJson=glbRecord&&glbRecord.json;\n   if(!sourceJson||!(sourceJson.skins||[]).some(skin=>Array.isArray(skin.joints)&&skin.joints.length>=12)||!(sourceJson.animations||[]).some(animation=>Array.isArray(animation.channels)&&animation.channels.length>0&&Array.isArray(animation.samplers)&&animation.samplers.length>0)||!(sourceJson.nodes||[]).some(node=>Number.isInteger(node.mesh)&&Number.isInteger(node.skin)))throw new Error(kind+': el GLB no contiene un cuerpo riggeado y clips de animación completos.');\n   objectUrl=URL.createObjectURL(blob);"
    if html.count(wildlife_import_snapshot_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_import_snapshot_marker.")
    html = html.replace(wildlife_import_snapshot_marker, wildlife_import_snapshot_marker_replacement, 1)

    wildlife_animal_marker = "const animal={kind,root:actor,"
    wildlife_animal_replacement = "const animal={textureReadiness,kind,root:actor,"
    if html.count(wildlife_animal_marker) != 1:
        raise SystemExit("No se encontró el actor único de fauna para adjuntar el estado de texturas.")
    html = html.replace(wildlife_animal_marker, wildlife_animal_replacement, 1)

    wildlife_mesh_texture_marker = "   const meshes=getRootMeshes(roots).filter(mesh=>mesh.getTotalVertices()>0);\n   if(!meshes.length)throw new Error('GLB sin malla visible.');"
    wildlife_mesh_texture_marker_replacement = "   const meshes=getRootMeshes(roots).filter(mesh=>mesh.getTotalVertices()>0);\n   if(!meshes.length)throw new Error('GLB sin malla visible.');\n   const textureReadiness=await waitForAnimalTextures(meshes,kind);"
    if html.count(wildlife_mesh_texture_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_mesh_texture_marker.")
    html = html.replace(wildlife_mesh_texture_marker, wildlife_mesh_texture_marker_replacement, 1)

    wildlife_animation_marker = "   const groups=imported.animationGroups||[],clips=chooseWildlifeClips(groups);"
    wildlife_animation_marker_replacement = "   const groups=imported.animationGroups||[],clips=chooseWildlifeClips(groups);\n   if(!groups.some(group=>group&&group.targetedAnimations&&group.targetedAnimations.length>0)||!clips.idle||!clips.walk||!clips.run||clips.walk===clips.idle||clips.run===clips.walk||clips.run===clips.idle)throw new Error(kind+': el rig necesita clips Idle, Walk y Gallop/Run distintos y reproducibles.');"
    if html.count(wildlife_animation_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_animation_marker.")
    html = html.replace(wildlife_animation_marker, wildlife_animation_marker_replacement, 1)

    wildlife_cleanup_marker = "   if(imported){try{(imported.animationGroups||[]).forEach(group=>group.stop());(imported.skeletons||[]).forEach(skeleton=>skeleton.dispose());(imported.meshes||[]).forEach(mesh=>mesh.dispose(false,true));(imported.transformNodes||[]).forEach(node=>node.dispose(false,true));}catch(_){}}"
    wildlife_cleanup_marker_replacement = "   const partialGroups=Array.from(scene.animationGroups||[]).filter(group=>!beforeGroups.has(group));partialGroups.forEach(group=>{try{group.stop();group.dispose();}catch(_){}}); \n   const partialMeshes=Array.from(scene.meshes||[]).filter(mesh=>!beforeMeshes.has(mesh));partialMeshes.forEach(mesh=>{try{if(!(mesh.isDisposed&&mesh.isDisposed()))mesh.dispose(false,true);}catch(_){}}); \n   const partialNodes=Array.from(scene.transformNodes||[]).filter(node=>!beforeNodes.has(node));partialNodes.forEach(node=>{try{if(!(node.isDisposed&&node.isDisposed()))node.dispose(false,true);}catch(_){}}); \n   const partialSkeletons=Array.from(scene.skeletons||[]).filter(skeleton=>!beforeSkeletons.has(skeleton));partialSkeletons.forEach(skeleton=>{try{skeleton.dispose();}catch(_){}});"
    if html.count(wildlife_cleanup_marker) != 1:
        raise SystemExit("No se encontró el marcador único: wildlife_cleanup_marker.")
    html = html.replace(wildlife_cleanup_marker, wildlife_cleanup_marker_replacement, 1)

    wildlife_spawn_count_marker = "const animalCount=isPerformanceMode?0:(idx===0?3:0);"
    wildlife_spawn_count_replacement = "const animalCount=idx===0?3:0;"
    if html.count(wildlife_spawn_count_marker) != 1:
        raise SystemExit("No se encontró el contador de fauna terrestre inicial.")
    html = html.replace(wildlife_spawn_count_marker, wildlife_spawn_count_replacement, 1)

    # Give each animal a clear foreground; dense broadleaf shrubs must not hide imported bodies.
    wildlife_clearance_marker = "trees.some(t=>Math.hypot(x-t.x,z-t.z)<(t.radius||.6)+3.0)||\n        wildlifeSpawnSpecs.some(other=>Math.hypot(x-other.x,z-other.z)<5.6)"
    wildlife_clearance_replacement = "trees.some(t=>Math.hypot(x-t.x,z-t.z)<(t.radius||.6)+3.0)||\n        naturalShrubs.some(b=>Math.hypot(x-b.x,z-b.z)<(b.radius||.9)+3.0)||\n        rocks.some(r=>Math.hypot(x-r.x,z-r.z)<(r.radius||.8)+2.2)||\n        wildlifeSpawnSpecs.some(other=>Math.hypot(x-other.x,z-other.z)<5.6)"
    if html.count(wildlife_clearance_marker) != 1:
        raise SystemExit("No se encontró el punto único para despejar los puntos de aparición de fauna.")
    html = html.replace(wildlife_clearance_marker, wildlife_clearance_replacement, 1)

    wildlife_retry_marker = " function loadWildlifeModels(){\n  if(!wildlifeModelsLoadPromise)wildlifeModelsLoadPromise=loadWildlifeModelsOnce();\n  return wildlifeModelsLoadPromise;\n }"
    wildlife_retry_replacement = " function loadWildlifeModels(){\n  if(!wildlifeModelsLoadPromise)wildlifeModelsLoadPromise=loadWildlifeModelsOnce().catch(error=>{\n   for(const animal of ambientFauna.splice(0)){\n    const root=animal.root;try{(animal.groups||[]).forEach(group=>{try{group.stop();group.dispose();}catch(_){}});}catch(_){}\n    for(let i=managedWorldShadowGroups.length-1;i>=0;i--){const entry=managedWorldShadowGroups[i];if(entry&&entry.root===root){if(entry.active&&shadowGen)for(const mesh of entry.meshes||[]){try{shadowGen.removeShadowCaster(mesh);}catch(_){}}managedActiveWorldShadowCount=Math.max(0,managedActiveWorldShadowCount-(entry.meshes||[]).length);managedWorldShadowGroups.splice(i,1);}}\n    try{if(root&&!(root.isDisposed&&root.isDisposed()))root.dispose(false,true);}catch(_){}\n   }\n   wildlifeBlobs.clear();wildlifeModelsLoadPromise=null;throw error;\n  });\n  return wildlifeModelsLoadPromise;\n }"
    if html.count(wildlife_retry_marker) != 1:
        raise SystemExit("No se encontró la promesa única de fauna para reintentar sin duplicados.")
    html = html.replace(wildlife_retry_marker, wildlife_retry_replacement, 1)

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
    wildlife_import_required = "   wildlifeReadinessRecords.push({kind,state:'failed',error:String(err&&err.message||err)});\n   console.error('Falló la importación de fauna obligatoria ('+kind+'):',err);\n   throw new Error('RECURSO OBLIGATORIO: fauna '+kind+' · '+String(err&&err.message||err));"
    if html.count(wildlife_import_failure) != 1:
        raise SystemExit("No se encontró el fallback que ocultaba los fallos de importación animal.")
    html = html.replace(wildlife_import_failure, wildlife_import_required, 1)

    wildlife_instance = "   if(animal){ambientFauna.push(animal);loaded++;}\n   recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),animal?'ready':'fallback',{island:spec.homeIslandIndex});"
    wildlife_instance_required = "   if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');\n   wildlifeReadinessRecords.push({kind:spec.kind,state:'ready',island:spec.homeIslandIndex,meshes:animal.meshCount,skinnedVertices:animal.skinnedVertexCount,skinningMode:animal.skinningMode||'unknown',bones:animal.skeletonBoneCount,textures:animal.textureReadiness.count,textureWaitMs:animal.textureReadiness.waitedMs});\n   ambientFauna.push(animal);loaded++;\n   recordStartupTask('Fauna GLB '+spec.kind+' #'+index,modelStarted,performance.now(),'ready',{island:spec.homeIslandIndex});"
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

    gull_animation_marker = "const groups=inst.animationGroups||[],fly=groups.find(g=>/walk|fly|flap/i.test(g.name))||groups.find(g=>/idle/i.test(g.name))||groups[0]||null;"
    gull_animation_replacement = ""
    if html.count(gull_animation_marker) != 1:
        raise SystemExit("No se encontró el selector único de animación de las gaviotas.")
    html = html.replace(gull_animation_marker,gull_animation_replacement,1)

    # Select the native flight clip before building the rig; the old declaration
    # lived after the rig marker and caused a temporal-dead-zone startup crash.
    gull_legacy_animation_marker = "groups.forEach(g=>{try{g.stop();}catch(_){}});if(fly){fly.start(true,1.0);fly.speedRatio=.95+Math.random()*.12;}"
    gull_legacy_animation_replacement = "nativeFlightClip.speedRatio=.95+Math.random()*.12;"
    if html.count(gull_legacy_animation_marker) != 1:
        raise SystemExit("No se encontró el bloque de animación heredado de las gaviotas.")
    html = html.replace(gull_legacy_animation_marker,gull_legacy_animation_replacement,1)

    gull_rig_marker = "const meshes=getRootMeshes(roots);if(!meshes.length){actor.dispose(false,true);continue;}"
    gull_rig_replacement = gull_rig_marker + "const groups=inst.animationGroups||[],nativeFlightClip=groups.find(group=>/fly/i.test(String(group.name||'')))||null,fly=nativeFlightClip;if(!nativeFlightClip){actor.dispose(false,true);throw new Error('El GLB de gaviota no contiene un clip Fly válido.');}groups.forEach(group=>{try{if(group!==nativeFlightClip)group.stop();}catch(_){}});const rigNodes=[...roots];for(let cursor=0;cursor<rigNodes.length;cursor++){const children=typeof rigNodes[cursor].getChildren==='function'?rigNodes[cursor].getChildren():[];for(const child of children)rigNodes.push(child);}const findPart=name=>rigNodes.find(node=>new RegExp('^'+name+'(?:_|$)','i').test(node.name||''))||null,leftWing=findPart('LeftWing'),rightWing=findPart('RightWing'),tail=findPart('Tail'),head=findPart('Head'),neck=findPart('Neck'),jaw=findPart('Jaw'),leftHindUpLeg=findPart('LeftHindUpLeg'),rightHindUpLeg=findPart('RightHindUpLeg'),leftHindLeg=findPart('LeftHindLeg'),rightHindLeg=findPart('RightHindLeg');const requiredFlightParts=[leftWing,rightWing,tail,head,neck,leftHindUpLeg,rightHindUpLeg,leftHindLeg,rightHindLeg];if(requiredFlightParts.some(node=>!node)){actor.dispose(false,true);throw new Error('El GLB de gaviota no contiene todas las articulaciones de vuelo: alas, cabeza, cuello y patas traseras.');}nativeFlightClip.start(true,1,nativeFlightClip.from,nativeFlightClip.to);if(typeof nativeFlightClip.goToFrame!=='function'){actor.dispose(false,true);throw new Error('Babylon no puede evaluar la pose nativa Fly para alinear el cuerpo.');}nativeFlightClip.goToFrame(nativeFlightClip.from+(nativeFlightClip.to-nativeFlightClip.from)*.5);rigNodes.forEach(node=>{try{node.computeWorldMatrix(true);}catch(_){}});actor.computeWorldMatrix(true);const actorInverse=actor.getWorldMatrix().clone().invert(),bodyAxis=B.Vector3.TransformNormal(head.getAbsolutePosition().subtract(tail.getAbsolutePosition()).normalize(),actorInverse).normalize(),alignAxis=(from,to)=>{const a=from.normalizeToNew(),b=to.normalizeToNew(),dot=B.Scalar.Clamp(B.Vector3.Dot(a,b),-1,1);if(dot<-.9999)return B.Quaternion.RotationAxis(B.Axis.X,Math.PI);const cross=B.Vector3.Cross(a,b),q=new B.Quaternion(cross.x,cross.y,cross.z,1+dot);q.normalize();return q;};visualRoot.rotationQuaternion=alignAxis(bodyAxis,new B.Vector3(0,0,1));visualRoot.computeWorldMatrix(true);rigNodes.forEach(node=>{try{node.computeWorldMatrix(true);}catch(_){}});actor.computeWorldMatrix(true);const alignedBodyAxis=B.Vector3.TransformNormal(head.getAbsolutePosition().subtract(tail.getAbsolutePosition()).normalize(),actorInverse).normalize(),alignmentPitchDegrees=Math.asin(B.Scalar.Clamp(alignedBodyAxis.y,-1,1))*180/Math.PI,alignmentDot=B.Vector3.Dot(alignedBodyAxis,new B.Vector3(0,0,1));if(!Number.isFinite(alignmentPitchDegrees)||alignmentDot<.995){actor.dispose(false,true);throw new Error('La gaviota no quedó horizontal en pose Fly: pitch residual '+alignmentPitchDegrees.toFixed(2)+' grados.');}const flightRig={actor,visualRoot,bodyAxis,alignment:{source:'native-Fly-midpoint',pitchResidualDegrees:alignmentPitchDegrees,forwardDot:alignmentDot},leftWing:{node:leftWing},rightWing:{node:rightWing},tail:{node:tail},head:{node:head},neck:{node:neck},leftHindUpLeg:{node:leftHindUpLeg},rightHindUpLeg:{node:rightHindUpLeg},leftHindLeg:{node:leftHindLeg},rightHindLeg:{node:rightHindLeg},animationGroup:nativeFlightClip};"
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
    gull_scale_replacement = "const sourceBounds=boundsForMeshes(meshes),sourceWidth=sourceBounds.max.x-sourceBounds.min.x,sourceHeight=sourceBounds.max.y-sourceBounds.min.y,sourceDepth=sourceBounds.max.z-sourceBounds.min.z,sourceMaxExtent=Math.max(sourceWidth,sourceHeight,sourceDepth),targetGullMaxExtentMeters=.55;if(!Number.isFinite(sourceMaxExtent)||sourceMaxExtent<.10)throw new Error('Dimensiones físicas de gaviota inválidas: '+sourceMaxExtent);const sourceCenter=new B.Vector3((sourceBounds.min.x+sourceBounds.max.x)*.5,(sourceBounds.min.y+sourceBounds.max.y)*.5,(sourceBounds.min.z+sourceBounds.max.z)*.5),scale=targetGullMaxExtentMeters/sourceMaxExtent;if(!Number.isFinite(scale)||scale<=0||scale>12)throw new Error('Factor de escala de gaviota fuera de rango: '+scale);visualRoot.position.copyFrom(sourceCenter.scale(-1));actor.scaling.setAll(scale);actor.computeWorldMatrix(true);visualRoot.computeWorldMatrix(true);meshes.forEach(mesh=>mesh.computeWorldMatrix(true));const fittedBounds=boundsForMeshes(meshes),fittedWidth=fittedBounds.max.x-fittedBounds.min.x,fittedHeight=fittedBounds.max.y-fittedBounds.min.y,fittedDepth=fittedBounds.max.z-fittedBounds.min.z,fittedMaxExtent=Math.max(fittedWidth,fittedHeight,fittedDepth);if(!Number.isFinite(fittedMaxExtent)||fittedMaxExtent>.57)throw new Error('La gaviota supera el límite físico de 0,57 m: '+fittedMaxExtent.toFixed(3));actor.position=v(Math.cos(i*1.25)*(18+i*2.5)-36,10+i%3*1.45,Math.sin(i*1.25)*(18+i*2.5)-18);actor.metadata=Object.assign({},actor.metadata||{},{biologicalScale:{source:{width:sourceWidth,height:sourceHeight,depth:sourceDepth},rendered:{width:fittedWidth,height:fittedHeight,depth:fittedDepth},maximumExtentMeters:fittedMaxExtent}});"
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

    gull_wing_push_marker = "realBirds.push({root:actor,real:true,groups,animation:fly,phase:i*1.25,radius:18+i*2.5,alt:10+i%3*1.45,speed:.18+i*.014});"
    gull_wing_push_replacement = "realBirds.push({root:actor,real:true,groups,flightRig,animation:nativeFlightClip,phase:i*1.25,radius:18+i*2.5,alt:10+i%3*1.45,speed:.18+i*.014});"
    if html.count(gull_wing_push_marker) != 1:
        raise SystemExit("No se encontró el registro único de las articulaciones de gaviota.")
    html = html.replace(gull_wing_push_marker, gull_wing_push_replacement, 1)

    # Prepare the destination island's grass while the player is still approaching by ship.
    # The previous condition forcibly unloaded every grass batch on boarding, then started
    # procedural generation only after disembarkation; that produced an obvious bare-ground delay.
    grass_stream_marker = "if(onShip||bestRatio>1.09)currentIsland=-1;"
    grass_stream_replacement = "if(bestRatio>(onShip?2.0:1.09))currentIsland=-1;"
    if html.count(grass_stream_marker) != 1:
        raise SystemExit("No se encontró la condición única de descarga de hierba al embarcar.")
    html = html.replace(grass_stream_marker, grass_stream_replacement, 1)
    # 0.6.352: Quality grass is a persistent full-island field, not a 92 m player-centred patch.
    # Build each island around its stable centre and keep its original per-area density.
    grass_coverage_marker = "const safeLandRadius=island.r*.70;\n   const centerX=Number.isFinite(focusX)?focusX:island.x,centerZ=Number.isFinite(focusZ)?focusZ:island.z;\n   const radius=Math.min(92,safeLandRadius);\n   const areaFraction=Math.min(1,(radius*radius)/(safeLandRadius*safeLandRadius));"
    grass_coverage_replacement = "const safeLandRadius=island.r*.70;\n   const centerX=island.x,centerZ=island.z;\n   const radius=safeLandRadius;\n   const areaFraction=1;"
    if html.count(grass_coverage_marker) != 1:
        raise SystemExit("No se encontró exactamente una generación local de hierba para convertirla en cobertura completa.")
    html = html.replace(grass_coverage_marker, grass_coverage_replacement, 1)

    grass_distance_marker = "const GRASS_STREAM_RECENTER_DISTANCE=isTouchDevice?58:46;"
    if html.count(grass_distance_marker) != 1:
        raise SystemExit("No se encontró el umbral único de recentrado de hierba.")
    html = html.replace(grass_distance_marker, "const GRASS_STREAM_RECENTER_DISTANCE=Number.MAX_SAFE_INTEGER;", 1)

    grass_swap_center_marker = "grassStreamActiveIslandIndex=index;grassStreamCenterX=focusX;grassStreamCenterZ=focusZ;"
    grass_swap_center_replacement = "grassStreamActiveIslandIndex=index;grassStreamCenterX=land[index].x;grassStreamCenterZ=land[index].z;"
    if html.count(grass_swap_center_marker) != 1:
        raise SystemExit("No se encontró la actualización única del centro de hierba tras el cambio de isla.")
    html = html.replace(grass_swap_center_marker, grass_swap_center_replacement, 1)

    # The source now streams grass only when the active island changes.
    # Never restore the old player-distance recenter path: it rebuilt all Quality
    # grass batches while walking across the same island and caused frame spikes.
    grass_recenter_marker = "const sameIsland=currentIsland===grassStreamActiveIslandIndex;\n  if(!sameIsland&&!grassStreamPromise){"
    if html.count(grass_recenter_marker) != 1:
        raise SystemExit("No se encontró el nuevo contrato de streaming de hierba por cambio de isla.")
    html = html.replace(grass_recenter_marker, grass_recenter_marker, 1)

 
    grass_lod_runtime_marker = """  for(const batch of qualityGrassLodBatches){
   const show=batch.islandIndex===visibleGrassIslandIndex;
   if(batch.mesh.isVisible!==show)batch.mesh.isVisible=show;
   if(show)visible++;
  }"""
    grass_lod_runtime_replacement = """  const viewFocus=scene.activeCamera&&scene.activeCamera.position?scene.activeCamera.position:focus;
  for(const batch of qualityGrassLodBatches){
   const show=batch.islandIndex===visibleGrassIslandIndex;
   if(show){
    const nextLod=batch.selectLod(batch.x,batch.z,viewFocus.x,viewFocus.z,batch.lod);
    if(nextLod!==batch.lod){
     batch.lodVertexData[nextLod].applyToMesh(batch.mesh);
     batch.mesh.thinInstanceRefreshBoundingInfo(true);
     batch.lod=nextLod;
     window.__ELSN_GRASS_LOD_TRANSITIONS__=(window.__ELSN_GRASS_LOD_TRANSITIONS__||0)+1;
    }
   }
   if(batch.mesh.isVisible!==show)batch.mesh.isVisible=show;
   if(show)visible++;
  }"""
    if html.count(grass_lod_runtime_marker) != 1:
        raise SystemExit("No se encontró el bucle de visibilidad de lotes para LOD por distancia.")
    html = html.replace(grass_lod_runtime_marker, grass_lod_runtime_replacement, 1)


    gull_flight_marker = "if(b.procedural){b.left.rotation.z=-.10-Math.sin(elapsed*7+b.phase)*.34;b.right.rotation.z=.10+Math.sin(elapsed*7+b.phase)*.34;}else if(b.animation)b.animation.speedRatio=.90+.18*Math.sin(elapsed*1.5+b.phase);"
    gull_flight_replacement = "if(b.procedural){b.left.rotation.z=-.10-Math.sin(elapsed*10.5+b.phase)*.38;b.right.rotation.z=.10+Math.sin(elapsed*10.5+b.phase)*.38;}else if(b.flightRig&&b.flightRig.animationGroup){b.flightRig.animationGroup.speedRatio=.96+.08*Math.sin(elapsed*.7+b.phase);}"
    if html.count(gull_flight_marker) != 1:
        raise SystemExit("No se encontró el bucle único de vuelo de las gaviotas.")
    html = html.replace(gull_flight_marker, gull_flight_replacement, 1)

    # Five birds are cheap to update every frame; generic entity LOD must not freeze the flock.
    gull_motion_marker = "ambientBirds.forEach(b=>{if(!worldEntityVisualDue(b,b.root.position.x,b.root.position.z))return;const a=elapsed*b.speed+b.phase,bank=Math.sin(a*1.2)*.12;b.root.position.x=Math.cos(a)*b.radius-36;b.root.position.z=Math.sin(a)*b.radius-18;b.root.position.y=b.alt+Math.sin(a*2+b.phase)*.72+Math.sin(elapsed*.41+b.phase)*.12;b.root.rotation.y=-a+Math.PI/2;b.root.rotation.z=bank;if(b.procedural){b.left.rotation.z=-.10-Math.sin(elapsed*10.5+b.phase)*.38;b.right.rotation.z=.10+Math.sin(elapsed*10.5+b.phase)*.38;}else if(b.flightRig&&b.flightRig.animationGroup){b.flightRig.animationGroup.speedRatio=.96+.08*Math.sin(elapsed*.7+b.phase);}});"
    gull_motion_replacement = ""  # 0.6.352: engine render-loop callback owns per-frame gull flight independently of entity LOD.
    if html.count(gull_motion_marker) != 1:
        raise SystemExit("No se encontró el bucle único de órbita de gaviotas.")
    html = html.replace(gull_motion_marker,gull_motion_replacement,1)

    # Move expensive terrestrial-fauna decisions and collision/terrain validation to
    # a distance-aware cadence. Root motion is still integrated on every frame, while
    # the skinned animation groups keep running at the render rate.
    wildlife_update_marker = "function updateWildlife(dt){"
    wildlife_update_end_marker = " // 0.6.195: la cubierta vegetal queda despejada de caminos y campamentos."
    wildlife_update_replacement = """const wildlifeReadinessRecords=[];const wildlifeUpdatePerfSamples=new Float32Array(120);let wildlifeUpdatePerfCursor=0,wildlifeUpdatePerfCount=0,wildlifeUpdatePerfLastMs=0,wildlifeUpdatePerfMaxMs=0,wildlifeUpdatePerfTicks=0;
function wildlifeUpdatePerfSnapshot(){
 const values=[];for(let i=0;i<wildlifeUpdatePerfCount;i++)values.push(wildlifeUpdatePerfSamples[i]);values.sort((a,b)=>a-b);
 const at=p=>values.length?Number(values[Math.min(values.length-1,Math.floor((values.length-1)*p))].toFixed(3)):null;
 const byKind={deer:0,stag:0,wolf:0};for(const animal of ambientFauna)if(byKind[animal.kind]!==undefined)byKind[animal.kind]++;
 return {samples:wildlifeUpdatePerfCount,ticks:wildlifeUpdatePerfTicks,lastMs:wildlifeUpdatePerfLastMs,p50Ms:at(.50),p95Ms:at(.95),p99Ms:at(.99),maxMs:Number(wildlifeUpdatePerfMaxMs.toFixed(3)),requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length,byKind,readiness:wildlifeReadinessRecords.slice(),complete:ambientFauna.length===wildlifeSpawnSpecs.length};
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
     const dx=focus.x-root.position.x,dz=focus.z-root.position.z,distanceSquared=dx*dx+dz*dz;
     const near=distanceSquared<4900,mid=distanceSquared<22500;
     const decisionInterval=isTouchDevice
      ?(isPerformanceMode?(near?.10:(mid?.18:.32)):(near?.05:(mid?.10:.20)))
      :(near?(1/30):(mid?.075:.15));
     animal._wildlifeLastDecisionAt=now;
     animal._wildlifeNextDecisionAt=now+decisionInterval;
     animal.flee=distanceSquared<196?Math.max(animal.flee,3.2):Math.max(0,animal.flee-decisionDt);
     if(animal.flee>0&&distanceSquared>.0001)animal.heading=Math.atan2(-dx,-dz);
     else{
      animal.turnTimer-=decisionDt;animal.wanderTimer-=decisionDt;
      if(animal.turnTimer<=0){animal.turnTimer=rand(2.5,6.5);animal.heading+=rand(-.72,.72);}
      if(animal.wanderTimer<=0){animal.wanderTimer=rand(2,5.5);animal.wandering=Math.random()<.58;}
     }
     if(distanceSquared>(isTouchDevice?13225:27225)){
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
    // Heading rotation is written only when an AI decision changes it above.
    // Reassigning the same rotation every render frame dirties the transform needlessly.
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
    startup_coast_warmup_code = """ if(!coastalReferenceMode){
  const startupCoastWarmupStartedAt=performance.now();
  const yieldStartupCoastFrame=()=>new Promise(resolve=>{
   let settled=false;const finish=()=>{if(settled)return;settled=true;resolve();};
   requestAnimationFrame(finish);setTimeout(finish,90);
  });
  setLoadingProgress(94,'Preparando la costa y los reflejos de la isla inicial…');
  syncActiveBeachIsland();
  await yieldStartupCoastFrame();
  const initialCoastIslandIndex=activeBeachIslandIndex;
  if(initialCoastIslandIndex<0)throw new Error('RECURSO OBLIGATORIO: no se pudo identificar la costa de la isla inicial.');
  syncActiveTidalFoamIsland();
  await yieldStartupCoastFrame();
  syncNordicWaterReflectionIsland();
  await yieldStartupCoastFrame();
  const initialCoastReady=!!coastalSeabedMeshes[initialCoastIslandIndex]&&
   !!livingBeachLayers[initialCoastIslandIndex]&&
   tidalFoamMeshes.some(item=>item.index===initialCoastIslandIndex)&&
   (isPerformanceMode||!nordicWaterMirror||activeWaterReflectionIslandIndex===initialCoastIslandIndex);
  window.__ELSN_INITIAL_COAST_WARMUP__={
   status:initialCoastReady?'ready':'failed',
   islandIndex:initialCoastIslandIndex,
   seabedReady:!!coastalSeabedMeshes[initialCoastIslandIndex],
   beachReady:!!livingBeachLayers[initialCoastIslandIndex],
   foamReady:tidalFoamMeshes.some(item=>item.index===initialCoastIslandIndex),
   reflectionReady:isPerformanceMode||!nordicWaterMirror||activeWaterReflectionIslandIndex===initialCoastIslandIndex,
   durationMs:Number((performance.now()-startupCoastWarmupStartedAt).toFixed(2))
  };
  if(!initialCoastReady)throw new Error('RECURSO OBLIGATORIO: costa, rompiente o reflejo de la isla inicial incompleto.');
  recordStartupTask('Costa, rompiente y reflejos de la isla inicial',startupCoastWarmupStartedAt,performance.now(),'ready',window.__ELSN_INITIAL_COAST_WARMUP__);
 }"""
    if html.count(fauna_start_marker) != 1 or html.count(fauna_end_marker) != 1 or html.count(fauna_scene_marker) != 1:
        raise SystemExit("No se encontró un único bloque de fauna/escena para ordenar el arranque.")
    fauna_start = html.index(fauna_start_marker)
    fauna_end = html.index(fauna_end_marker, fauna_start)
    fauna_block = html[fauna_start:fauna_end]
    html = html[:fauna_start] + html[fauna_end:]
    scene_marker_index = html.index(fauna_scene_marker)
    ordered_fauna = " setLoadingProgress(87,coastalReferenceMode?'Preparando la referencia costera…':'Preparando fauna de la isla inicial…');\n" + fauna_block + "\n setLoadingProgress(93,coastalReferenceMode?'Preparando shaders de costa…':'Preparando texturas y shaders de la zona inicial…');\n"
    html = html[:scene_marker_index] + ordered_fauna + html[scene_marker_index:]
    # Prepare the initial beach/foam/reflection after all fauna has joined the scene,
    # before Babylon's full texture and shader readiness barrier unlocks gameplay.
    if html.count(fauna_scene_marker) != 1:
        raise SystemExit("No se encontró exactamente una barrera de compilación de escena para precalentar la costa.")
    html = html.replace(fauna_scene_marker, startup_coast_warmup_code + "\n" + fauna_scene_marker, 1)

    # All three terrestrial species are required in both profiles. Performance keeps its
    # reduced movement/decision cadence; the five gulls remain Quality-only.
    optional_fauna_state = "fauna:isPerformanceMode?'disabled-performance':'blocking-optional'"
    required_fauna_state = "fauna:'blocking-required'"
    if html.count(optional_fauna_state) != 1:
        raise SystemExit("No se encontró el estado de fauna opcional en el registro de arranque.")
    html = html.replace(optional_fauna_state, required_fauna_state, 1)
    fauna_result = "recordStartupTask('Fauna de la isla inicial',faunaStartedAt,performance.now(),faunaFailures.length?'optional-failed':'ready',{loaded:ambientFauna.length,gulls:ambientBirds.filter(b=>b.real).length,failures:faunaFailures});"
    fauna_result_required = "recordStartupTask('Fauna de la isla inicial',faunaStartedAt,performance.now(),faunaFailures.length?'required-failed':'ready',{loaded:ambientFauna.length,requested:wildlifeSpawnSpecs.length,gulls:ambientBirds.filter(b=>b.real).length,requiredGulls:isPerformanceMode?0:5,failures:faunaFailures});"
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

    # Runtime telemetry must reflect the blocking fauna barrier in both graphics profiles.
    fauna_telemetry_marker = "npcBackgroundLoad:'blocking-before-entry',faunaBackgroundLoad:'optional-before-entry'"
    fauna_telemetry_required = "npcBackgroundLoad:'blocking-before-entry',faunaBackgroundLoad:'blocking-before-entry'"
    if html.count(fauna_telemetry_marker) != 1:
        raise SystemExit("No se encontró el marcador único del estado de carga de fauna en el informe de arranque.")
    html = html.replace(fauna_telemetry_marker, fauna_telemetry_required, 1)
 
    # Soundtracks remain native HTMLAudio streams; audio readiness is measured asynchronously.
    # The first playable scene does not wait for media preload or decoding.
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
    html = html.replace(audio_result_declaration, audio_result_declaration+"""let startupMusicPreloadResult=null;
 function publishStartupAudioReadiness(){
  const effects=audioPreloadResult&&typeof audioPreloadResult==='object'?audioPreloadResult:{total:0,ready:0,failed:0,pending:0};
  const effectsReady=Number(effects.total)>0&&Number(effects.pending)===0&&Number(effects.failed)===0&&Number(effects.ready)===Number(effects.total);
  const soundEffects={...effects,status:effectsReady?'ready':(effects.status==='pending'||effects.status==='loading'?'loading':'incomplete'),requiredForEntry:false};
  const musicResults=Array.isArray(startupMusicPreloadResult)?startupMusicPreloadResult:[];
  const menuReady=!!(musicResults[0]&&musicResults[0].ready&&musicResults[0].readyState>=2);
  const gameplayReady=!!(musicResults[1]&&musicResults[1].ready&&musicResults[1].readyState>=2);
  const music={results:musicResults,menuReady,gameplayReady,status:menuReady&&gameplayReady?'ready':musicResults.length?'incomplete':'loading',streaming:true,decodedToAudioBuffer:false,requiredForEntry:false};
  const readiness={soundEffects,music,updatedAt:new Date().toISOString()};
  window.__ELSN_AUDIO_READINESS__=readiness;
  const gate=window.__ELSN_STARTUP_RESOURCE_GATE__;
  if(gate&&gate.resources){gate.resources.soundEffects=soundEffects;gate.resources.music=music;gate.startupTimeline=getStartupTimelineSnapshot();}
  return readiness;
 }""", 1)

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
    new_audio_error = "console.warn('Audio no disponible al inicio; se mantendrá la carga en segundo plano:',audioRequiredError);"
    if html.count(old_audio_error) != 1:
        raise SystemExit("No se encontró el error de audio obligatorio.")
    html = html.replace(old_audio_error, new_audio_error, 1)

    # Audio is prepared in parallel with the world, but it must never hold the first playable scene.
    audio_gate_start = " startupAudioPreload.then(result=>{"
    audio_gate_end = " // Protagonista y NPC obligatorios ya han sido validados."
    audio_gate_start_at = html.find(audio_gate_start)
    audio_gate_end_at = html.find(audio_gate_end, audio_gate_start_at)
    if audio_gate_start_at < 0 or audio_gate_end_at <= audio_gate_start_at:
        raise SystemExit("No se encontró el bloque único de audio que debe pasar a segundo plano.")
    audio_gate_replacement = """ setLoadingProgress(85,'Preparando el audio en segundo plano…');
 startupAudioPreload.then(async result=>{
  if(result&&result.pending&&!result.failed){
   console.info('La precarga inicial de sonido continúa; se reintenta sin bloquear la entrada.',result);
   result=await NorseAudio.preloadAll(30000);
  }
  audioPreloadResult={...(result||{}),status:result&&result.pending>0?'incomplete':(result&&result.failed>0?'incomplete':'ready')};
  recordStartupTask('Efectos de sonido',audioLoadStarted,performance.now(),audioPreloadResult.status==='ready'?'ready':'partial',audioPreloadResult);
  publishStartupAudioReadiness();
  console.info('Estado de efectos de sonido:',audioPreloadResult);
 }).catch(audioError=>{
  audioPreloadResult={total:0,ready:0,failed:1,pending:0,status:'incomplete',message:String(audioError&&audioError.message||audioError)};
  recordStartupTask('Efectos de sonido',audioLoadStarted,performance.now(),'partial',{message:audioPreloadResult.message});
  publishStartupAudioReadiness();
  console.warn('La precarga de audio continúa no disponible; la escena seguirá operativa:',audioError);
 });
 const startupMusicStartedAt=performance.now();
 startupMusicPreload.then(outcome=>{
  if(outcome&&outcome.error){
   const message=String(outcome.error&&outcome.error.message||outcome.error);
   startupMusicPreloadResult=[
    {label:'música del menú',ready:false,readyState:0,error:message},
    {label:'música de partida',ready:false,readyState:0,error:message}
   ];
  }else startupMusicPreloadResult=Array.isArray(outcome&&outcome.results)?outcome.results:[];
  const musicReady=startupMusicPreloadResult.length===2&&startupMusicPreloadResult.every(item=>item&&item.ready&&item.readyState>=2);
  recordStartupTask('Bandas sonoras streaming',startupMusicStartedAt,performance.now(),musicReady?'ready':'partial',{results:startupMusicPreloadResult,decodedToAudioBuffer:false});
  publishStartupAudioReadiness();
 });
 publishStartupAudioReadiness();
"""
    html = html[:audio_gate_start_at] + audio_gate_replacement + html[audio_gate_end_at:]
    startup_gate_marker = " setLoadingProgress(98,'Comprobando que todo está listo…');"
    startup_gate_code = """ const startupResourceSnapshot={
  engineReady:!!(window.BABYLON&&window.BABYLON.Engine),
  gltfImporterReady:!!(window.BABYLON&&window.BABYLON.SceneLoader&&window.BABYLON.GLTFFileLoader),
  protagonistReady:!!realPlayerReady,
  npcRoster:window.__elSinNombreStartupNpcRoster||null,
  fauna:{required:true,requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length,requiredGulls:isPerformanceMode?0:5,loadedGulls:ambientBirds.filter(b=>b.real).length},
  soundEffects:audioPreloadResult,
  music:{results:startupMusicPreloadResult,menuReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[0]&&startupMusicPreloadResult[0].ready),gameplayReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[1]&&startupMusicPreloadResult[1].ready),streaming:true,decodedToAudioBuffer:false},
  scene:{status:sceneWarmupStatus,waitingItemsAfter:window.__elSinNombreStartupSceneWarmup&&window.__elSinNombreStartupSceneWarmup.waitingItemsAfter,meshes:scene&&scene.meshes?scene.meshes.length:0,firstFrameRendered:!!firstFrameRendered},
  coast:window.__ELSN_INITIAL_COAST_WARMUP__||null,
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
  if(!startupResourceSnapshot.coast||startupResourceSnapshot.coast.status!=='ready')startupResourceFailures.push('playa, fondo submarino, rompiente y reflejo de la isla inicial');
  if(startupResourceSnapshot.world.islands!==13)startupResourceFailures.push('mundo de 13 islas');
  if(startupResourceSnapshot.fauna.requested!==3||startupResourceSnapshot.fauna.loaded!==3)startupResourceFailures.push('fauna terrestre '+startupResourceSnapshot.fauna.loaded+'/'+startupResourceSnapshot.fauna.requested);
  if(!isPerformanceMode){
   if(startupResourceSnapshot.fauna.loadedGulls!==5)startupResourceFailures.push('gaviotas 3D '+startupResourceSnapshot.fauna.loadedGulls+'/5');
   if(startupResourceSnapshot.world.grassClumps<=0||startupResourceSnapshot.world.grassBatches<=0)startupResourceFailures.push('vegetación 3D inicial');
  }
 }
 window.__ELSN_STARTUP_RESOURCE_GATE__={ready:startupResourceFailures.length===0,checkedAt:new Date().toISOString(),resources:startupResourceSnapshot,failures:startupResourceFailures,coastalReferenceMode:!!coastalReferenceMode};
 if(startupResourceFailures.length)throw new Error('RECURSO OBLIGATORIO: barrera final de carga · '+startupResourceFailures.join(' · '));
 recordStartupTask('Barrera final de recursos',performance.now(),performance.now(),'ready',startupResourceSnapshot);
"""
    startup_gate_code = startup_gate_code.replace(
        " const startupResourceSnapshot={",
        " const audioReadiness=publishStartupAudioReadiness();\n const startupResourceSnapshot={",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "  soundEffects:audioPreloadResult,",
        "  soundEffects:audioReadiness.soundEffects,",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "  music:{results:startupMusicPreloadResult,menuReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[0]&&startupMusicPreloadResult[0].ready),gameplayReady:!!(startupMusicPreloadResult&&startupMusicPreloadResult[1]&&startupMusicPreloadResult[1].ready),streaming:true,decodedToAudioBuffer:false},",
        "  music:audioReadiness.music,",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "  world:{islands:land.length,grassClumps:grassInstanceCount,grassBatches:grassBatchCount,profile:activeGraphicsProfile}\n };",
        "  world:{islands:land.length,grassClumps:grassInstanceCount,grassBatches:grassBatchCount,profile:activeGraphicsProfile},\n  audioRequiredForEntry:false\n };",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "  if(!startupResourceSnapshot.soundEffects||startupResourceSnapshot.soundEffects.failed||startupResourceSnapshot.soundEffects.pending||startupResourceSnapshot.soundEffects.ready!==startupResourceSnapshot.soundEffects.total)startupResourceFailures.push('efectos de sonido');\n",
        "",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "  if(!startupResourceSnapshot.music.menuReady||!startupResourceSnapshot.music.gameplayReady)startupResourceFailures.push('bandas sonoras');\n",
        "",
        1,
    )
    startup_gate_code = startup_gate_code.replace(
        "window.__ELSN_STARTUP_RESOURCE_GATE__={ready:startupResourceFailures.length===0,checkedAt:new Date().toISOString(),resources:startupResourceSnapshot,failures:startupResourceFailures,coastalReferenceMode:!!coastalReferenceMode};",
        "window.__ELSN_STARTUP_RESOURCE_GATE__={ready:startupResourceFailures.length===0,checkedAt:new Date().toISOString(),resources:startupResourceSnapshot,failures:startupResourceFailures,coastalReferenceMode:!!coastalReferenceMode,startupTimeline:getStartupTimelineSnapshot()};",
        1,
    )
    if "audioRequiredForEntry:false" not in startup_gate_code or "startupTimeline:getStartupTimelineSnapshot()" not in startup_gate_code or "soundEffects:audioReadiness.soundEffects" not in startup_gate_code or "music:audioReadiness.music" not in startup_gate_code:
        raise SystemExit("No se pudo preparar la telemetría de arranque y el audio no bloqueante.")
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
    let readySamples=0,lastDiagnostic=null;
    const started=performance.now();
    let lastSampleAt=started;
    while(performance.now()-started<85000){
     // Keep Babylon's real render loop running, but sample readiness at 4 Hz rather
     // than rescanning thousands of active meshes on every rendered frame.
     await new Promise(resolve=>requestAnimationFrame(resolve));
     const sampleAt=performance.now();
     if(sampleAt-lastSampleAt<250)continue;
     lastSampleAt=sampleAt;
     const active=typeof scene.getActiveMeshes==='function'?scene.getActiveMeshes():null;
     const activeData=active&&Array.isArray(active.data)?active.data:null;
     const activeMeshCount=activeData&&Number.isFinite(active.length)?Math.min(active.length,activeData.length):0;
     let notReadyCount=0;
     const notReadySamples=[];
     for(let index=0;index<activeMeshCount;index++){
      const mesh=activeData[index];
      if(!mesh||mesh.isBlocked||mesh.isVisible===false)continue;
      try{
       if(typeof mesh.isReady==='function'&&!mesh.isReady(true)){
        notReadyCount++;
        if(notReadySamples.length<16)notReadySamples.push(String(mesh.name||mesh.id||'mesh').slice(0,100));
       }
      }catch(error){
       notReadyCount++;
       if(notReadySamples.length<16)notReadySamples.push(String(mesh.name||mesh.id||'mesh').slice(0,80)+': '+String(error&&error.message||error).slice(0,100));
      }
     }
     let waitingItems=null;
     try{if(typeof scene.getWaitingItemsCount==='function')waitingItems=scene.getWaitingItemsCount();}catch(_){waitingItems=null;}
     const firstFrame=firstFrameRendered===true;
     const assetsSettled=waitingItems===null||waitingItems===0;
     const ready=firstFrame&&activeMeshCount>0&&notReadyCount===0&&assetsSettled;
     readySamples=ready?readySamples+1:0;
     lastDiagnostic={firstFrameRendered:firstFrame,activeMeshCount,notReadyMeshCount:notReadyCount,notReadyMeshes:notReadySamples,waitingItems,stableReadySamples:readySamples,readinessSampleIntervalMs:250,elapsedMs:Number((sampleAt-started).toFixed(1))};
     if(readySamples>=3)return lastDiagnostic;
    }
    throw new Error('La vista inicial no completó tres muestras estables de 250 ms: '+JSON.stringify(lastDiagnostic));
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


    shrub_occlusion_marker = "return {root,x,z,radius:.9*size,homeIslandIndex,groundY};"
    shrub_occlusion_replacement = "return {root,x,z,radius:.9*size,homeIslandIndex,groundY,height:.95*size};"
    if html.count(shrub_occlusion_marker) != 1:
        raise SystemExit("No se encontró el único registro de arbustos para oclusión.")
    html = html.replace(shrub_occlusion_marker, shrub_occlusion_replacement, 1)

    # Read-only player dialogue bridge: reuses existing villagers and creates no actors.
    dialogue_bridge_marker = " window.copyGameHealthDebug=()=>{"
    dialogue_bridge_code = r"""
 // Player-facing dialogue bridge. Inspector specialist identities remain in their own runtime.
 window.__ELSN_GAME_DIALOGUE_BRIDGE__=Object.freeze({
  maxVisibleBubbles:4,
  getSnapshot:(()=>{let dialoguePeopleCache=null,dialogueAmbientByRoot=null,dialoguePeopleSceneNodeCount=-1;return ()=>{
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
     const sceneNodeCount=(Array.isArray(scene.transformNodes)?scene.transformNodes.length:0)+(Array.isArray(scene.meshes)?scene.meshes.length:0);
     if(!dialoguePeopleCache||sceneNodeCount!==dialoguePeopleSceneNodeCount){
      dialogueAmbientByRoot=new Map();
      if(Array.isArray(ambientPeople))for(const actor of ambientPeople){if(actor&&actor.parts&&actor.parts.root)dialogueAmbientByRoot.set(actor.parts.root,actor);}
      const candidates=[].concat(Array.isArray(scene.transformNodes)?scene.transformNodes:[],Array.isArray(scene.meshes)?scene.meshes:[]);
      const seen=new Set(),found=[];
      for(const node of candidates){
       if(!node||seen.has(node))continue;
       seen.add(node);
       const name=String(node.name||'');
       const match=/^Villager_(\d+)_(\d+)$/.exec(name);
       if(!match)continue;
       const villageIndex=Number(match[1]);
       const slot=Number(match[2]);
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
       const actualParts=ambientActor&&ambientActor.parts?ambientActor.parts:{name,root:node,head,variant:villageIndex*2+slot,civilian:true,role:'civilian'};
       if(actualParts&&!actualParts.head&&head)actualParts.head=head;
       found.push({name,root:node,villageIndex,parts:actualParts,actor:ambientActor,recruited:ambientActor?ambientActor.recruited===true:false});
      }
      dialoguePeopleCache=found;
      dialoguePeopleSceneNodeCount=sceneNodeCount;
     }
     return dialoguePeopleCache;
    })(),
    world:{night:!!(atmosphere&&atmosphere.night>=0.55),daylight:atmosphere&&Number.isFinite(Number(atmosphere.daylight))?Number(atmosphere.daylight):null,weather:atmosphere&&atmosphere.weather?String(atmosphere.weather):'',timeOfDay:atmosphere&&Number.isFinite(Number(atmosphere.timeOfDay))?Number(atmosphere.timeOfDay):null,onShip:typeof onShip!=='undefined'&&!!onShip,enemyNearby:typeof nearEnemies==='function'&&nearEnemies(),health:typeof health!=='undefined'?Number(health):null,healthLow:typeof health!=='undefined'&&Number(health)<=35,wood:typeof woodCount!=='undefined'?Number(woodCount):null,stone:typeof stoneCount!=='undefined'?Number(stoneCount):null,captured:typeof captured!=='undefined'?Number(captured)||0:0,islandName:typeof land!=='undefined'&&islandIndex>=0&&land[islandIndex]?String(land[islandIndex].name||''):''},
    occluders:trees,naturalOccluders:naturalShrubs,
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
        '<script src="./scripts/npc-village-brain-core.js?v=0.6.356-npcbrain7" defer></script>',
        '<script src="./scripts/npc-dialogue-core.js" defer></script>',
        '<script src="./scripts/npc-dialogue-runtime.js" defer></script>',
    ):
        if html.count(dialogue_tag) > 1:
            raise SystemExit("Una etiqueta del runtime de diálogos NPC aparece duplicada.")
        if dialogue_tag not in html:
            if "</body>" not in html:
                raise SystemExit("No se encontró </body> para instalar los diálogos NPC.")
            html = html.replace("</body>", dialogue_tag + chr(10) + "</body>", 1)

    # Release candidate 0.6.352: execute Babylon and its GLTF importer from native same-origin script URLs.
    if game_version != "0.6.274":
        raise SystemExit(f"Se esperaba la base 0.6.274 para construir la candidata 0.6.356; se encontró {game_version}.")
    version_meta_pattern = r'(<meta\s+name=["\']el-sin-nombre-build["\']\s+content=["\'])0\.6\.274(["\'])'
    html, version_meta_count = re.subn(version_meta_pattern, r'\g<1>0.6.357\2', html, count=1, flags=re.IGNORECASE)
    if version_meta_count != 1:
        raise SystemExit("No se pudo actualizar de forma única la versión del juego a 0.6.357.")
    html = html.replace("0.6.274", "0.6.357")
    if "0.6.274" in html:
        raise SystemExit("Quedan referencias de versión 0.6.274 en el HTML generado.")
    # The source may already carry the new game version or a newer diagnostic
    # report version. Normalize the unique build marker instead of assuming the
    # inline diagnostics are still at reportVersion 11.
    diagnostic_build_pattern = r"reportVersion:'\d+',build:'[^']+'"
    diagnostic_build_replacement = "reportVersion:'65',build:'0.6.357'"
    html, diagnostic_build_count = re.subn(
        diagnostic_build_pattern, diagnostic_build_replacement, html, count=1
    )
    if diagnostic_build_count != 1:
        raise SystemExit("No se encontró exactamente una identificación de compilación 0.6.357 para normalizar.")
    game_version = "0.6.357"
    USER_AGENT = f"EL-SIN-NOMBRE-WebBuild/{game_version} (+https://github.com/bonillamarquezpablo-lab/Minimo-android)"

    # 0.6.300 unified graphics: native Babylon adaptive scaling, high-detail flagship assets and a stable Performance profile.
    quality_profile_marker = r"""const qualityDpr=isPerformanceMode?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile ? .62 : (constrainedHardware ? .78 : (isTouchDevice ? 1.0 : 1.35)))))):Math.min(deviceDpr,isTouchDevice?1.80:1.85);"""
    quality_profile_code = r"""const highTierGpuMatch=/Adreno.*(?:7[5-9]\d|8\d\d)|Mali[- ]?G7\d{2}|Xclipse.*(?:9\d{2}|1\d{3})/i.test(graphicsRenderer);
 const highHeadroomQualityMobile=!!(!isPerformanceMode&&isTouchDevice&&!constrainedHardware&&((reportedMemory>=8&&(Number(navigator.hardwareConcurrency)||0)>=8)||highTierGpuMatch));
 // Quality fixes its native render scale at startup. Runtime FPS drops must never lower image quality.
 const qualityDpr=isPerformanceMode
  ?Math.min(deviceDpr,isUltraLowEndMobile?.52:(isGalaxyA12NachoPerformance?.54:(isGalaxyA12LowEndMobile?.58:(isConstrainedMobile?.62:(constrainedHardware?.78:(isTouchDevice?1.0:1.35))))))
  :Math.min(deviceDpr,isTouchDevice?(highHeadroomQualityMobile?1.80:1.45):1.65);"""
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
    # but serialize large GLB parser/decoder work on every mobile device, regardless of GPU tier.
    # Import large GLBs only after the static world geometry has been built.
    player_import_start_marker = "const playerHumanLoadPromise=coastalReferenceMode?Promise.resolve(null):loadHumanViking();"
    if html.count(player_import_start_marker) != 1:
        raise SystemExit("No se encontró la importación automática única del protagonista para aplazarla hasta terminar la geometría del mundo.")
    html = html.replace(player_import_start_marker, "let playerHumanLoadPromise=Promise.resolve(null);", 1)

    mobile_memory_policy_marker = "const isConstrainedMobile=!!(isPerformanceMode&&(iosMemoryBlindMobile||(isTouchDevice&&(constrainedHardware||reportedMemory<=3))));"
    mobile_memory_policy_replacement = mobile_memory_policy_marker + "\n // Peak-memory scheduling is independent from the selected graphics profile. It changes task concurrency only; render scale, textures, shadows, density and gameplay systems remain untouched.\n const isMobilePeakMemorySensitive=!!(isIOSDevice||isTouchDevice);\n let startupWildlifeCompressedBytes=0;"
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
   if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');\n   wildlifeReadinessRecords.push({kind:spec.kind,state:'ready',island:spec.homeIslandIndex,meshes:animal.meshCount,skinnedVertices:animal.skinnedVertexCount,skinningMode:animal.skinningMode||'unknown',bones:animal.skeletonBoneCount,textures:animal.textureReadiness.count,textureWaitMs:animal.textureReadiness.waitedMs});
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
    if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');\n   wildlifeReadinessRecords.push({kind:spec.kind,state:'ready',island:spec.homeIslandIndex,meshes:animal.meshCount,skinnedVertices:animal.skinnedVertexCount,skinningMode:animal.skinningMode||'unknown',bones:animal.skeletonBoneCount,textures:animal.textureReadiness.count,textureWaitMs:animal.textureReadiness.waitedMs});
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
    if(!animal)throw new Error('RECURSO OBLIGATORIO: no se pudo montar '+spec.kind+' en la isla '+spec.homeIslandIndex+'.');\n   wildlifeReadinessRecords.push({kind:spec.kind,state:'ready',island:spec.homeIslandIndex,meshes:animal.meshCount,skinnedVertices:animal.skinnedVertexCount,skinningMode:animal.skinningMode||'unknown',bones:animal.skeletonBoneCount,textures:animal.textureReadiness.count,textureWaitMs:animal.textureReadiness.waitedMs});
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
   // No liberar la entrada hasta resolver todas las dependencias obligatorias del perfil.
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
 // Preserve opaque-scene depth for transparent footprints and ground effects.
 scene.setRenderingAutoClearDepthStencil(1,false,false,false);
 // Optional Babylon-native profiler. Normal gameplay keeps instrumentation disabled.
 const profileDiagnosticsEnabled=!!(testModeEnabled||new URLSearchParams(window.location.search).get('profile')==='1');
 const gpuTimerQueryExtensionName=(()=>{try{if(!graphicsContext)return null;if(typeof WebGL2RenderingContext!=='undefined'&&graphicsContext instanceof WebGL2RenderingContext)return graphicsContext.getExtension('EXT_disjoint_timer_query_webgl2')?'EXT_disjoint_timer_query_webgl2':null;return graphicsContext.getExtension('EXT_disjoint_timer_query')?'EXT_disjoint_timer_query':null;}catch(_){return null;}})();
 const gpuTimerQueryAutoEnabled=!!gpuTimerQueryExtensionName;
 const gpuDebugRendererInfo=(()=>{try{return graphicsContext&&graphicsContext.getExtension('WEBGL_debug_renderer_info')||null;}catch(_){return null;}})();
 const readGpuLimit=(parameter)=>{try{const value=graphicsContext&&graphicsContext.getParameter(parameter);return value&&typeof value.length==='number'?Array.from(value):Number.isFinite(value)?value:null;}catch(_){return null;}};
 const gpuDeviceTelemetry=(()=>{try{return {vendor:gpuDebugRendererInfo?String(graphicsContext.getParameter(gpuDebugRendererInfo.UNMASKED_VENDOR_WEBGL)||'').slice(0,120):null,renderer:gpuDebugRendererInfo?String(graphicsContext.getParameter(gpuDebugRendererInfo.UNMASKED_RENDERER_WEBGL)||'').slice(0,180):null,webglVendor:graphicsContext?String(graphicsContext.getParameter(graphicsContext.VENDOR)||'').slice(0,120):null,webglRenderer:graphicsContext?String(graphicsContext.getParameter(graphicsContext.RENDERER)||'').slice(0,180):null,maxTextureSize:readGpuLimit(graphicsContext.MAX_TEXTURE_SIZE),maxCubeMapSize:readGpuLimit(graphicsContext.MAX_CUBE_MAP_TEXTURE_SIZE),maxRenderbufferSize:readGpuLimit(graphicsContext.MAX_RENDERBUFFER_SIZE),maxViewportDims:readGpuLimit(graphicsContext.MAX_VIEWPORT_DIMS),maxSamples:graphicsContext&&graphicsContext.MAX_SAMPLES!==undefined?readGpuLimit(graphicsContext.MAX_SAMPLES):null,maxVertexAttributes:readGpuLimit(graphicsContext.MAX_VERTEX_ATTRIBS),maxVertexUniformVectors:readGpuLimit(graphicsContext.MAX_VERTEX_UNIFORM_VECTORS),maxFragmentUniformVectors:readGpuLimit(graphicsContext.MAX_FRAGMENT_UNIFORM_VECTORS),maxVaryingVectors:readGpuLimit(graphicsContext.MAX_VARYING_VECTORS),webglVersion:graphicsContext?String(graphicsContext.getParameter(graphicsContext.VERSION)||"").slice(0,120):null,shadingLanguageVersion:graphicsContext?String(graphicsContext.getParameter(graphicsContext.SHADING_LANGUAGE_VERSION)||"").slice(0,120):null,maxTextureImageUnits:readGpuLimit(graphicsContext.MAX_TEXTURE_IMAGE_UNITS),maxVertexTextureImageUnits:readGpuLimit(graphicsContext.MAX_VERTEX_TEXTURE_IMAGE_UNITS),maxCombinedTextureImageUnits:readGpuLimit(graphicsContext.MAX_COMBINED_TEXTURE_IMAGE_UNITS),timerQueryExtension:gpuTimerQueryExtensionName,timerQuerySupported:!!gpuTimerQueryExtensionName,debugRendererInfoAvailable:!!gpuDebugRendererInfo};}catch(_){return {timerQueryExtension:gpuTimerQueryExtensionName,timerQuerySupported:!!gpuTimerQueryExtensionName,debugRendererInfoAvailable:!!gpuDebugRendererInfo};}})();
 let engineInstrumentation=null,sceneInstrumentation=null;
 const safePerfCounterValue=(counter,scale=1)=>{
  // A missing profiler counter is unavailable evidence, never a measured 0 ms.
  if(!counter||counter.current===null||counter.current===undefined)return null;
  const value=Number(counter.current);
  return Number.isFinite(value)&&value>=0?Number((value/scale).toFixed(3)):null;
 };
 if(profileDiagnosticsEnabled||gpuTimerQueryAutoEnabled){
  try{
   if(B.EngineInstrumentation&&(gpuTimerQueryAutoEnabled||profileDiagnosticsEnabled)){
    engineInstrumentation=new B.EngineInstrumentation(engine);
    engineInstrumentation.captureGPUFrameTime=gpuTimerQueryAutoEnabled;
    engineInstrumentation.captureShaderCompilationTime=profileDiagnosticsEnabled;
   }
   if(profileDiagnosticsEnabled&&B.SceneInstrumentation){
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
 const spatialActorRootPattern=/^(?:PabloTheNameless|RealHumanVikingRoot|EnemyHumanFallPivot_\d+|VillageGuard\d+_\d+|Villager_\d+_\d+|RaiderLongship_\d+|Drakkar|Wildlife(?:Root)?_?\d*|Deer(?:Root)?_?\d*|Wolf(?:Root)?_?\d*|Stag(?:Root)?_?\d*|AmbientPerson_?\d*|AmbientBird_?\d*)$/i;
 const spatialVegetationMotionPattern=/^(?:mixedForestTree|treeCanopyWindPivot|fallingTree|fallingForestTree)/i;
 const spatialWaterMotionPattern=/^(?:ocean|water|nordicWater|coastalWater|coastalWave|waterFilm|tidalFoam|shoreBreakerWash|beachState|activeBeach|activeShore)/i;
 const spatialEffectMotionPattern=/^(?:GroundSplashParticleBatch|NorseMovingFootprints|SunHalo|SunDisc|NordicSkyDome|WindborneLeaf|HearthFlame|HearthSpark|flame|ember|smoke|particle|vesselWaterSpray|drakkarWake|spray|foam|wake|splash|wreck)/i;
 const spatialDynamicStatsPattern=/^(?:vesselWaterSpray|drakkarWake|tidalFoam|particle|projectile|arrow)/i;
 let spatialSelectionOctree=null;
 const spatialSelectionStats={enabled:false,sceneMeshCount:0,dynamicMeshCount:0,staticIndexedMeshCount:0,dynamicContentRatio:null,babylonInitialDynamicCount:0,dynamicReasons:{},dynamicSampleNames:[],dynamicSampleNamesByReason:{},dynamicFilterEnabled:false,dynamicFilterPasses:0,dynamicFilterLastCandidates:0,dynamicFilterLastSelected:0,dynamicFilterLastCulled:0,dynamicFilterCulledPeak:0,dynamicFilterTotalCandidates:0,dynamicFilterTotalCulled:0,dynamicFilterTotalMs:0,dynamicFilterLastMs:0,dynamicFilterMaxMs:0,dynamicFilterErrors:0,staticWorldMatricesFrozen:0,staticWorldMatrixFreezeMs:0,staticWorldMatrixFreezeErrors:0,staticWorldMatrixFreezeSkipped:0,buildMs:null,error:null};
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
 const freezeSpatialStaticWorldMatrices=()=>{
  let frozen=0,errors=0,skippedDynamic=0;
  const startedAt=performance.now();
  // Freeze only meshes that are static after the complete scene has been assembled.
  // Moving roots, animated rigs, vegetation pivots, effects and all their descendants
  // are excluded; their matrix updates and animations remain live.
  for(let index=0;index<scene.meshes.length;index++){
   const mesh=scene.meshes[index];
   if(!mesh||mesh.__elsnSpatialDynamic||isSpatialDynamicMesh(mesh)||
      mesh.skeleton||mesh.morphTargetManager||Number(mesh.billboardMode)>0||
      (Array.isArray(mesh.animations)&&mesh.animations.length)||
      typeof mesh.computeWorldMatrix!=='function'||typeof mesh.freezeWorldMatrix!=='function'){
    skippedDynamic++;continue;
   }
   try{
    if(mesh.isWorldMatrixFrozen===true){skippedDynamic++;continue;}
    // Pass the freshly computed matrix into freezeWorldMatrix so Babylon does not
    // recompute it a second time. This preserves the complete parent/world transform.
    const worldMatrix=mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix(worldMatrix);
    frozen++;
   }catch(_){errors++;}
  }
  spatialSelectionStats.staticWorldMatricesFrozen=frozen;
  spatialSelectionStats.staticWorldMatrixFreezeMs=Number((performance.now()-startedAt).toFixed(2));
  spatialSelectionStats.staticWorldMatrixFreezeErrors=errors;
  spatialSelectionStats.staticWorldMatrixFreezeSkipped=skippedDynamic;
  return frozen;
 };
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
 const addSpatialDynamicMesh=(mesh,reason=null,force=false,deferStats=false)=>{
  const dynamic=spatialSelectionOctree&&spatialSelectionOctree.dynamicContent;
  if(!mesh||!dynamic||typeof dynamic.push!=='function'||mesh.__elsnSpatialDynamic)return;
  const classification=reason||spatialDynamicReasonForMesh(mesh);
  if(!classification&&!force)return;
  // A formerly static object may become interactive (for example, a felled tree).
  // Unfreeze it before registering it in Babylon's live dynamic-content list.
  try{if(typeof mesh.unfreezeWorldMatrix==='function')mesh.unfreezeWorldMatrix();}catch(_){}
  mesh.__elsnSpatialDynamic=true;
  mesh.__elsnSpatialDynamicReason=classification;
  mesh.__elsnSpatialFreshUntilRenderId=(typeof scene.getRenderId==='function'?scene.getRenderId():0)+2;
  // The mesh flag above is the O(1) duplicate guard: existing Babylon dynamic
  // entries are marked during octree creation before this registration path runs.
  dynamic.push(mesh);
  spatialDynamicMeshSet.add(mesh);
  spatialSelectionStats.dynamicReasons[classification]=(spatialSelectionStats.dynamicReasons[classification]||0)+1;
  if(spatialSelectionStats.dynamicSampleNames.length<32)spatialSelectionStats.dynamicSampleNames.push({name:String(mesh.name||''),reason:classification});
  const reasonSamples=spatialSelectionStats.dynamicSampleNamesByReason[classification]||(spatialSelectionStats.dynamicSampleNamesByReason[classification]=[]);
  if(reasonSamples.length<16){
   const parentChain=[];
   for(let node=mesh;node&&node!==scene&&parentChain.length<10;node=node.parent)parentChain.push(String(node.name||''));
   reasonSamples.push({name:String(mesh.name||''),parentChain});
  }
  if(!deferStats)updateSpatialSelectionCounts();
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
  scene.onNewMeshAddedObservable.add(mesh=>{if(spatialSelectionOctree)addSpatialDynamicMesh(mesh,spatialDynamicReasonForMesh(mesh)||'created-after-octree',true);});
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
    mesh.__elsnSpatialDynamic=true;mesh.__elsnSpatialDynamicReason=spatialDynamicReasonForMesh(mesh)||'octree-initial-dynamic';
    mesh.__elsnSpatialFreshUntilRenderId=(typeof scene.getRenderId==='function'?scene.getRenderId():0)+2;
    spatialSelectionStats.dynamicReasons['octree-initial-dynamic']=(spatialSelectionStats.dynamicReasons['octree-initial-dynamic']||0)+1;
   }
   for(const mesh of scene.meshes.slice())if(isSpatialDynamicMesh(mesh))addSpatialDynamicMesh(mesh,null,false,true);
   const staticWorldMatricesFrozen=freezeSpatialStaticWorldMatrices();
   updateSpatialSelectionCounts();
   // Leave Babylon's native SelectionOctree.select() intact. The scene component
   // uses it to gather static octree blocks plus every dynamicContent mesh. Filter
   // only safe non-skinned actor meshes through the supported scene provider hook.
   const installSpatialDynamicCandidateFilter=()=>{
    const baseGetActiveMeshCandidates=scene.getActiveMeshCandidates;
    if(typeof baseGetActiveMeshCandidates!=='function')return false;
    scene.getActiveMeshCandidates=()=>{
     const base=baseGetActiveMeshCandidates.call(scene);
     if(!base||!Array.isArray(base.data)||!Number.isFinite(base.length)||scene.skipFrustumClipping||
        !Array.isArray(scene.frustumPlanes)||scene.frustumPlanes.length<6)return base;
     const startedAt=performance.now();
     let dynamicCandidates=0,selected=0,culled=0,errors=0,writeIndex=0;
     // Babylon 9.35 returns its reusable SelectionOctree candidate SmartArray here.
     // Compact that frame-local result in place: no extra list, no scene mutation,
     // and no allocation on the render path.
     for(let index=0;index<base.length;index++){
      const mesh=base.data[index];
      if(!mesh)continue;
      let keep=true;
      if(spatialDynamicMeshSet.has(mesh)){
       dynamicCandidates++;
       if(mesh.__elsnSpatialDynamicReason==='actor-or-vehicle'&&
          !mesh.alwaysSelectAsActiveMesh&&
          !(mesh.__elsnSpatialFreshUntilRenderId>=scene.getRenderId())&&
          !mesh.skeleton&&!mesh.morphTargetManager&&!Number(mesh.billboardMode)&&
          typeof mesh.computeWorldMatrix==='function'&&typeof mesh.isInFrustum==='function'){
        try{
         mesh.computeWorldMatrix();
         if(!mesh.isInFrustum(scene.frustumPlanes))keep=false;
        }catch(_){
         errors++;
        }
       }
      }
      if(keep){
       base.data[writeIndex]=mesh;
       writeIndex++;
       if(spatialDynamicMeshSet.has(mesh))selected++;
      }else{
       culled++;
      }
     }
     base.length=writeIndex;
     const duration=Math.max(0,performance.now()-startedAt);
     spatialSelectionStats.dynamicFilterEnabled=true;
     spatialSelectionStats.dynamicFilterPasses++;
     spatialSelectionStats.dynamicFilterLastCandidates=dynamicCandidates;
     spatialSelectionStats.dynamicFilterLastSelected=selected;
     spatialSelectionStats.dynamicFilterLastCulled=culled;
     spatialSelectionStats.dynamicFilterCulledPeak=Math.max(spatialSelectionStats.dynamicFilterCulledPeak,culled);
     spatialSelectionStats.dynamicFilterTotalCandidates+=dynamicCandidates;
     spatialSelectionStats.dynamicFilterTotalCulled+=culled;
     spatialSelectionStats.dynamicFilterTotalMs+=duration;
     spatialSelectionStats.dynamicFilterLastMs=Number(duration.toFixed(3));
     spatialSelectionStats.dynamicFilterMaxMs=Math.max(spatialSelectionStats.dynamicFilterMaxMs,duration);
     spatialSelectionStats.dynamicFilterErrors+=errors;
     return base;
    };
    spatialSelectionStats.dynamicFilterEnabled=true;
    return true;
   };
   spatialSelectionStats.dynamicFilterEnabled=installSpatialDynamicCandidateFilter();
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
    buildMs:spatialSelectionStats.buildMs,
    staticWorldMatricesFrozen,
    staticWorldMatrixFreezeErrors:spatialSelectionStats.staticWorldMatrixFreezeErrors
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
    npc_overlay_anchor_marker = " // High-mesh-count spatial selection for Babylon.js."
    npc_overlay_anchor_code = r""" const npcOverlayAnchorActors=new Set();
 const npcOverlayAnchorStats={created:0,repaired:0,measurements:0,measurementFallbacks:0,invalid:0,healthReattachments:0,badgeReattachments:0,lastSweepCount:0,lastMeasuredHeight:null,lastError:"",zeroVisibleActors:0,recoveredActors:0,recoveredMeshes:0};
 function ensureNpcOverlayAnchor(parts,force=false){
  const root=parts&&parts.root;if(!root||root.isDisposed?.()){npcOverlayAnchorStats.invalid++;return null;}
  try{
   if(typeof root.getScene==="function"&&root.getScene()!==scene){npcOverlayAnchorStats.invalid++;return null;}
   let anchor=parts.overlayAnchor;
   if(!anchor||anchor.isDisposed?.()){anchor=new B.TransformNode("NPCOverlayAnchor_"+String(parts.name||root.name||npcOverlayAnchorActors.size),scene);anchor.parent=root;anchor.position.set(0,1.92,0);parts.overlayAnchor=anchor;npcOverlayAnchorStats.created++;}
   else if(anchor.parent!==root){anchor.parent=root;npcOverlayAnchorStats.repaired++;}
   const real=parts.realHuman||null,visual=real&&(real.visualBody||real.modelRoot)||parts.body||null;
   if(force||anchor.__elsnVisualRef!==visual||!anchor.__elsnMeasuredAt){
    let localTopY=-Infinity,meshes=real&&Array.isArray(real.meshes)?real.meshes:[];
    if(!meshes.length&&visual&&typeof visual.getChildMeshes==="function")meshes=visual.getChildMeshes(false);
    try{
     root.computeWorldMatrix?.(true);
     const inverse=root.getWorldMatrix().clone();inverse.invert();
     for(let i=0;i<meshes.length;i++){
      const m=meshes[i];if(!m||m.isDisposed?.())continue;
      try{
       m.computeWorldMatrix?.(true);
       const bounds=m.getBoundingInfo?.()?.boundingBox;
       const min=bounds&&bounds.minimum,max=bounds&&bounds.maximum;
       if(!min||!max)continue;
       const meshWorld=m.getWorldMatrix();
       for(let corner=0;corner<8;corner++){
        const point=new B.Vector3(corner&1?max.x:min.x,corner&2?max.y:min.y,corner&4?max.z:min.z);
        const worldPoint=B.Vector3.TransformCoordinates(point,meshWorld);
        const rootPoint=B.Vector3.TransformCoordinates(worldPoint,inverse);
        if(Number.isFinite(rootPoint.y))localTopY=Math.max(localTopY,rootPoint.y);
       }
      }catch(_){}
     }
    }catch(_){npcOverlayAnchorStats.transformFallbacks=(npcOverlayAnchorStats.transformFallbacks||0)+1;}
    let h=Number.isFinite(localTopY)?localTopY:1.92;
    if(!Number.isFinite(h)||h<1.35||h>2.8){h=1.92;npcOverlayAnchorStats.measurementFallbacks++;}
    h=Math.max(1.55,Math.min(2.5,h));anchor.position.set(0,h,0);anchor.__elsnVisualRef=visual;anchor.__elsnMeasuredAt=performance.now();npcOverlayAnchorStats.measurements++;npcOverlayAnchorStats.lastMeasuredHeight=Number(h.toFixed(3));npcOverlayAnchorStats.lastAnchorLocalHeight=Number(h.toFixed(3));npcOverlayAnchorStats.lastBoundsLocalHeight=Number.isFinite(localTopY)?Number(localTopY.toFixed(3)):null;
   }
   if(parts.factionBadge&&!parts.factionBadge.isDisposed?.()){if(parts.factionBadge.parent!==anchor){parts.factionBadge.parent=anchor;npcOverlayAnchorStats.badgeReattachments++;}parts.factionBadge.position.set(0,.34,0);}
   const overlays=Array.isArray(parts.overlayHealthMeshes)?parts.overlayHealthMeshes:[];
   for(let i=0;i<overlays.length;i++){const e=overlays[i],m=e&&e.mesh;if(!m||m.isDisposed?.())continue;if(typeof m.getScene==="function"&&m.getScene()!==scene){npcOverlayAnchorStats.invalid++;continue;}if(m.parent!==anchor){m.parent=anchor;npcOverlayAnchorStats.healthReattachments++;}m.position.set(0,Number.isFinite(Number(e.y))?Number(e.y):0,Number.isFinite(Number(e.z))?Number(e.z):0);}
   parts.overlayAnchor=anchor;npcOverlayAnchorActors.add(parts);return anchor;
  }catch(e){npcOverlayAnchorStats.lastError=String(e&&e.message||e).slice(0,180);return null;}
 }
 function recoverNpcActorVisuals(parts){
  const real=parts&&parts.realHuman;if(!real)return{visible:0,repaired:0};
  let meshes=Array.isArray(real.meshes)?real.meshes:[],visual=real.visualBody||real.modelRoot||parts.body||null;
  if(!meshes.length&&visual&&typeof visual.getChildMeshes==="function")try{meshes=visual.getChildMeshes(false);}catch(_){}
  const isVisible=mesh=>!!mesh&&!mesh.isDisposed?.()&&(typeof mesh.isEnabled!=="function"||mesh.isEnabled())&&mesh.isVisible!==false&&Number(mesh.visibility??1)>.001;
  let visible=0;for(const mesh of meshes)if(isVisible(mesh))visible++;
  if(visible>0){const fallback=parts.proceduralFallbackBody;if(fallback&&!fallback.isDisposed?.()&&typeof fallback.setEnabled==="function"&&fallback.isEnabled())fallback.setEnabled(false);return{visible,repaired:0};}
  npcOverlayAnchorStats.zeroVisibleActors++;
  let repaired=0;
  for(const node of [real.visualBody,real.modelRoot,...(Array.isArray(real.roots)?real.roots:[])]){
   if(!node||node.isDisposed?.())continue;
   try{if(typeof node.setEnabled==="function"&&!node.isEnabled()){node.setEnabled(true);repaired++;}}catch(_){}
  }
  for(const mesh of meshes){
   if(!mesh||mesh.isDisposed?.())continue;
   try{if(typeof mesh.setEnabled==="function"&&!mesh.isEnabled()){mesh.setEnabled(true);repaired++;}if(mesh.isVisible===false||Number(mesh.visibility??1)<=.001){mesh.isVisible=true;mesh.visibility=1;repaired++;}}catch(_){}
  }
  visible=0;for(const mesh of meshes)if(isVisible(mesh))visible++;
  const fallback=parts.proceduralFallbackBody;
  if(visible===0&&fallback&&!fallback.isDisposed?.()){
   try{if(typeof fallback.setEnabled==="function"&&!fallback.isEnabled()){fallback.setEnabled(true);repaired++;}}catch(_){}
  }else if(visible>0&&fallback&&!fallback.isDisposed?.()){
   try{if(typeof fallback.setEnabled==="function"&&fallback.isEnabled())fallback.setEnabled(false);}catch(_){}
  }
  if(repaired>0)npcOverlayAnchorStats.recoveredActors++;
  npcOverlayAnchorStats.recoveredMeshes+=repaired;
  return{visible,repaired};
 }
 function maintainNpcOverlayAnchors(nowMs){
  if(!gameStarted)return;const now=performance.now();if(now-(npcOverlayAnchorStats.lastSweepAt||0)<500)return;npcOverlayAnchorStats.lastSweepAt=now;
  let count=0,recoveredActors=0,recoveredMeshes=0,zeroVisible=0;
  const focus=player&&player.root&&player.root.position?player.root.position:null;
  for(const p of npcOverlayAnchorActors){
   const r=p&&p.root;if(!r||r.isDisposed?.()){npcOverlayAnchorActors.delete(p);continue;}
   if(p.alive===false||p.recruited===true||p.surrendered===true)continue;
   if(focus){
    let position=null;try{position=r.getAbsolutePosition?.()||r.position||null;}catch(_){}
    if(position){const dx=position.x-focus.x,dz=position.z-focus.z;if(dx*dx+dz*dz<=5184){
     try{if(typeof r.setEnabled==="function"&&!r.isEnabled())r.setEnabled(true);}catch(_){}
     const repair=recoverNpcActorVisuals(p);if(repair.visible===0)zeroVisible++;if(repair.repaired>0){recoveredActors++;recoveredMeshes+=repair.repaired;}
    }}
   }
   ensureNpcOverlayAnchor(p);count++;
  }
  npcOverlayAnchorStats.lastSweepCount=count;npcOverlayAnchorStats.lastVisualRecoveryActors=recoveredActors;npcOverlayAnchorStats.lastVisualRecoveryMeshes=recoveredMeshes;npcOverlayAnchorStats.lastZeroVisibleActors=zeroVisible;
 }
 window.__ELSN_ENSURE_NPC_OVERLAY_ANCHOR__=p=>ensureNpcOverlayAnchor(p);
 window.__ELSN_NPC_OVERLAY_ANCHOR_DIAGNOSTICS__=()=>({...npcOverlayAnchorStats,registeredActors:npcOverlayAnchorActors.size});
"""
    if scene_profile_code.count(npc_overlay_anchor_marker) != 1: raise SystemExit("NPC anchor insertion point not unique")
    scene_profile_code = scene_profile_code.replace(npc_overlay_anchor_marker, "\n" + npc_overlay_anchor_code + "\n" + npc_overlay_anchor_marker, 1)

    if html.count(scene_marker) != 1:
        raise SystemExit("No se encontró exactamente una construcción de escena Babylon.")
    html = html.replace(scene_marker, scene_marker + "\n" + scene_profile_code, 1)

    runtime_diagnostics_marker = "webglVersion:graphicsVersion,constrainedMobileProfile:isConstrainedMobile,"
    runtime_diagnostics_replacement = "webglVersion:graphicsVersion,babylonEngineVersion:String(B.Engine.Version||'unknown'),engineBackend:graphicsContext&&(typeof WebGL2RenderingContext!=='undefined'&&graphicsContext instanceof WebGL2RenderingContext)?'WebGL2':'WebGL',webGpuApiAvailable:typeof navigator.gpu!=='undefined',profileDiagnosticsEnabled,meshSelectionOctreeEnabled:spatialSelectionStats.enabled,meshSelectionSceneMeshCount:spatialSelectionStats.sceneMeshCount,meshSelectionDynamicMeshCount:spatialSelectionStats.dynamicMeshCount,meshSelectionStaticIndexedMeshCount:spatialSelectionStats.staticIndexedMeshCount,meshSelectionStaticWorldMatricesFrozen:spatialSelectionStats.staticWorldMatricesFrozen,meshSelectionStaticWorldMatrixFreezeMs:spatialSelectionStats.staticWorldMatrixFreezeMs,meshSelectionStaticWorldMatrixFreezeErrors:spatialSelectionStats.staticWorldMatrixFreezeErrors,meshSelectionStaticWorldMatrixFreezeSkipped:spatialSelectionStats.staticWorldMatrixFreezeSkipped,meshSelectionDynamicContentRatio:spatialSelectionStats.dynamicContentRatio,meshSelectionInitialDynamicCount:spatialSelectionStats.babylonInitialDynamicCount,meshSelectionDynamicReasons:spatialSelectionStats.dynamicReasons,meshSelectionDynamicSamplesByReason:spatialSelectionStats.dynamicSampleNamesByReason,meshSelectionDynamicFrustumEnabled:spatialSelectionStats.dynamicFilterEnabled,meshSelectionDynamicFilterPasses:spatialSelectionStats.dynamicFilterPasses,meshSelectionDynamicFilterCandidates:spatialSelectionStats.dynamicFilterLastCandidates,meshSelectionDynamicFilterSelected:spatialSelectionStats.dynamicFilterLastSelected,meshSelectionDynamicFilterCulled:spatialSelectionStats.dynamicFilterLastCulled,meshSelectionDynamicFilterCulledPeak:spatialSelectionStats.dynamicFilterCulledPeak,meshSelectionDynamicFilterTotalCandidates:spatialSelectionStats.dynamicFilterTotalCandidates,meshSelectionDynamicFilterTotalCulled:spatialSelectionStats.dynamicFilterTotalCulled,meshSelectionDynamicFilterTotalMs:spatialSelectionStats.dynamicFilterTotalMs,meshSelectionDynamicFilterAverageMs:spatialSelectionStats.dynamicFilterPasses?Number((spatialSelectionStats.dynamicFilterTotalMs/spatialSelectionStats.dynamicFilterPasses).toFixed(3)):null,meshSelectionDynamicFilterCullRatio:spatialSelectionStats.dynamicFilterTotalCandidates?Number((spatialSelectionStats.dynamicFilterTotalCulled/spatialSelectionStats.dynamicFilterTotalCandidates).toFixed(4)):null,meshSelectionDynamicFilterLastMs:spatialSelectionStats.dynamicFilterLastMs,meshSelectionDynamicFilterMaxMs:spatialSelectionStats.dynamicFilterMaxMs,meshSelectionDynamicFilterErrors:spatialSelectionStats.dynamicFilterErrors,meshSelectionBuildMs:spatialSelectionStats.buildMs,meshSelectionStaticWorldMatricesFrozen:spatialSelectionStats.staticWorldMatricesFrozen,meshSelectionStaticWorldMatrixFreezeErrors:spatialSelectionStats.staticWorldMatrixFreezeErrors,meshSelectionStaticWorldMatrixFreezeSkipped:spatialSelectionStats.staticWorldMatrixFreezeSkipped,engineGpuFrameMs:gpuTimerQueryAutoEnabled?safePerfCounterValue(engineInstrumentation&&engineInstrumentation.gpuFrameTimeCounter,1e6):null,gpuTimerQueryStatus:!gpuTimerQueryExtensionName?'unsupported':(engineInstrumentation&&engineInstrumentation.gpuFrameTimeCounter?'supported':(profileDiagnosticsEnabled?'extension-present-counter-unavailable':'available-not-initialized')),gpuTimerQueryExtension:gpuTimerQueryExtensionName,gpuDeviceTelemetry,shaderCompilationMs:safePerfCounterValue(engineInstrumentation&&engineInstrumentation.shaderCompilationTimeCounter),sceneFrameMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.frameTimeCounter),sceneRenderMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.renderTimeCounter),activeMeshesEvaluationMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.activeMeshesEvaluationTimeCounter),renderTargetsMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.renderTargetsRenderTimeCounter),cameraRenderMs:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.cameraRenderTimeCounter),sceneDrawCalls:safePerfCounterValue(sceneInstrumentation&&sceneInstrumentation.drawCallsCounter),constrainedMobileProfile:isConstrainedMobile,"
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

    # The resource gate can finish while Babylon's render-loop callback is throttled
    # (notably after a Service Worker offline navigation). Do not report worldReady
    # while the loading overlay is still stuck: force one real scene frame if needed,
    # then reveal the campaign selector from the startup task itself. The render-loop
    # path remains the normal path; this idempotent hand-off is only its safety net.
    startup_handoff_marker = " startupAssetsReady=true;\n window.__elSinNombreStartupSmoke.worldReady=true;"
    startup_handoff_replacement = """ startupAssetsReady=true;
 if(!startScreenShown){
  try{
   if(!firstFrameRendered){
    if(!engine||engine.isDisposed&&engine.isDisposed())throw new Error('El motor Babylon ya no está disponible para el primer fotograma.');
    if(!scene.activeCamera)scene.activeCamera=camera;
    engine.resize();
    scene.render();
    renderedFrames++;
    firstFrameRendered=true;
    startupTimeline.firstFrameAt=performance.now();
    startupTimeline.firstFrameElapsedMs=Number((startupTimeline.firstFrameAt-startupTimelineBootAt).toFixed(1));
    console.info('EL SIN NOMBRE: primer fotograma confirmado por la barrera de arranque.');
   }
   // Keep the regular render-loop handoff invariant: the spatial octree must
   // exist before gameplay can be selected, even when this safety path wins the race.
   buildSpatialSelectionOctree();
   const startupLoading=document.getElementById('loading');
   if(startupLoading)startupLoading.style.display='none';
   showStartScreen();
   trackStartupPerfStage(100,'Selector principal listo');
   finishStartupPerfStage();
   startScreenShown=true;
  }catch(startupHandoffError){
   reportFrameError('presentación del selector tras la barrera de recursos',startupHandoffError);
   throw new Error('RECURSO OBLIGATORIO: primer fotograma y selector de campaña · '+String(startupHandoffError&&startupHandoffError.message||startupHandoffError));
  }
 }
 window.__elSinNombreStartupSmoke.worldReady=true;"""
    if html.count(startup_handoff_marker) != 1:
        raise SystemExit("No se encontró el punto único de cierre de la barrera de recursos para asegurar la presentación del selector.")
    html = html.replace(startup_handoff_marker,startup_handoff_replacement,1)


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

    legacy_fire_light_marker = "fireLights.forEach(f=>{if(f.hearth&&f.hearth.extinguished){f.light.intensity=0;return;}if(!worldEntityVisualDue(f,f.light.position.x,f.light.position.z))return;f.light.intensity=.66+Math.sin(elapsed*8+f.phase)*.16+Math.sin(elapsed*13+f.phase)*.065;});"
    legacy_fire_light_replacement = "fireLights.forEach(f=>{if(f.light&&typeof f.light.isEnabled==='function'&&!f.light.isEnabled())return;if(f.hearth&&f.hearth.extinguished){f.light.intensity=0;return;}if(!worldEntityVisualDue(f,f.light.position.x,f.light.position.z))return;f.light.intensity=.66+Math.sin(elapsed*8+f.phase)*.16+Math.sin(elapsed*13+f.phase)*.065;});"
    if html.count(legacy_fire_light_marker) != 1:
        raise SystemExit("No se encontró el único bucle de luces de hogar heredadas.")
    html = html.replace(legacy_fire_light_marker,legacy_fire_light_replacement,1)
    fire_spark_marker = "if(s.hearth&&s.hearth.extinguished){s.mesh.setEnabled(false);return;}if(!worldEntityVisualDue(s,s.offsetX,s.offsetZ))return;"
    fire_spark_replacement = "if(s.hearth&&s.hearth.extinguished){s.mesh.setEnabled(false);return;}const sparkX=s.hearth?s.hearth.x:s.offsetX,sparkZ=s.hearth?s.hearth.z:s.offsetZ,sparkDx=sparkX-worldVisualFocusX,sparkDz=sparkZ-worldVisualFocusZ;if(sparkDx*sparkDx+sparkDz*sparkDz>140*140){if(s.mesh.isEnabled())s.mesh.setEnabled(false);return;}if(!worldEntityVisualDue(s,sparkX,sparkZ))return;"
    if html.count(fire_spark_marker) != 1:
        raise SystemExit("No se encontró el único bucle de chispas de hogar.")
    html = html.replace(fire_spark_marker,fire_spark_replacement,1)
    smoke_distance_marker = "if(!source.puffs)createAmbientSmokePuffs(source,si);"
    smoke_distance_replacement = "if(!source.puffs)createAmbientSmokePuffs(source,si);const smokeDx=source.x-worldVisualFocusX,smokeDz=source.z-worldVisualFocusZ;if(smokeDx*smokeDx+smokeDz*smokeDz>180*180){source.puffs.forEach(p=>{if(p.mesh.isEnabled())p.mesh.setEnabled(false);});return;}"
    if html.count(smoke_distance_marker) != 1:
        raise SystemExit("No se encontró el único bucle de creación de humo para aplicar la distancia visual.")
    html = html.replace(smoke_distance_marker,smoke_distance_replacement,1)

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
    mineable_rock_replacement = """// Reuse shared materials and reject placements that intersect a tree trunk or another deposit.
  const mineableGraniteMaterial=M.stoneLight;
  const mineableRockPlacementStats={placed:0,relocated:0,skipped:0};
  window.__ELSN_ROCK_PLACEMENT__=()=>{let overlaps=0,minClearance=Infinity;for(const rock of rocks){if(!rock||!rock.alive)continue;for(const tree of trees){if(!tree||!tree.alive)continue;const clearance=Math.hypot(rock.x-tree.x,rock.z-tree.z)-(Number(rock.radius)||.5)-(Number(tree.radius)||.7)-.45;minClearance=Math.min(minClearance,clearance);if(clearance<-.05)overlaps++;}}return {...mineableRockPlacementStats,overlapPairs:overlaps,minTreeClearanceMeters:Number.isFinite(minClearance)?Number(minClearance.toFixed(3)):null};};
  function createRock(x,z){
   const sx=rand(.72,1.02),sy=rand(.70,.94),sz=rand(.68,1.00),radius=Math.max(sx,sz)*.50;
   const islandIndex=landIslandIndex(x,z),island=land[islandIndex];
   const acceptable=(px,pz)=>{
    if(!island||landIslandIndex(px,pz)!==islandIndex)return false;
    if(!isSafeIslandGroundPoint(island,px,pz,1.4,.70,.52))return false;
    for(const tree of trees){if(!tree||!tree.alive)continue;const required=(Number(tree.radius)||.7)+radius+.45;if(Math.hypot(px-tree.x,pz-tree.z)<required)return false;}
    for(const other of rocks){if(!other||!other.alive)continue;const required=(Number(other.radius)||.7)+radius+.35;if(Math.hypot(px-other.x,pz-other.z)<required)return false;}
    return true;
   };
   let placement=acceptable(x,z)?{x,z}:null;
   if(!placement){
    const phase=rand(0,Math.PI*2);
    for(let ring=1;ring<=10&&!placement;ring++){
     const distance=ring*.65;
     for(let step=0;step<24;step++){
      const angle=phase+step*Math.PI*2/24+(ring%2)*.08,px=x+Math.cos(angle)*distance,pz=z+Math.sin(angle)*distance;
      if(acceptable(px,pz)){placement={x:px,z:pz};break;}
     }
    }
   }
   if(!placement){mineableRockPlacementStats.skipped++;return null;}
   if(Math.hypot(placement.x-x,placement.z-z)>.10)mineableRockPlacementStats.relocated++;
   x=placement.x;z=placement.z;mineableRockPlacementStats.placed++;
   const gy=renderedTerrainSurfaceAt(x,z);
   const r=B.MeshBuilder.CreateIcoSphere('graniteBoulder',{radius:1,subdivisions:2,flat:true},scene);
   r.position=v(x,gy+sy*.40,z);r.scaling=v(sx,sy,sz);r.material=mineableGraniteMaterial;r.isPickable=true;r.receiveShadows=true;
   r.rotation.set(rand(-.10,.10),rand(0,Math.PI*2),rand(-.12,.12));
   const cap=B.MeshBuilder.CreateIcoSphere('rockFacet',{radius:1,subdivisions:1,flat:true},scene);
   cap.position=v(x-sx*.14,gy+sy*.65,z-sz*.11);cap.scaling=v(sx*.52,sy*.30,sz*.48);cap.material=M.stone;cap.isPickable=true;cap.receiveShadows=true;
   cap.rotation.set(rand(-.12,.12),r.rotation.y+.42,rand(-.10,.10));
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
    enemy_ai_lod_marker = "if(isConstrainedMobile&&dist>18&&e.state!=='attack'&&e.stun<=0){"
    enemy_ai_lod_replacement = "if(isTouchDevice&&dist>18&&e.state!=='attack'&&e.stun<=0){"
    if html.count(enemy_ai_lod_marker) != 1:
        raise SystemExit("No se encontró el límite de IA de enemigos a distancia.")
    html = html.replace(enemy_ai_lod_marker, enemy_ai_lod_replacement, 1)
    enemy_ai_lod_reset = "}else if(isConstrainedMobile){e.mobileAiNextAt=0;}"
    enemy_ai_lod_reset_replacement = "}else if(isTouchDevice){e.mobileAiNextAt=0;}"
    if html.count(enemy_ai_lod_reset) != 1:
        raise SystemExit("No se encontró el reinicio de cadencia de IA de enemigos.")
    html = html.replace(enemy_ai_lod_reset, enemy_ai_lod_reset_replacement, 1)
    enemy_ai_far_cadence = "const mobileAiInterval=dist>70?.90:(dist>36?.42:.18);"
    if html.count(enemy_ai_far_cadence) != 1:
        raise SystemExit("No se encontró la cadencia escalonada de IA distante.")
    html = html.replace(enemy_ai_far_cadence, "const mobileAiInterval=dist>70?1.0:(dist>36?.45:.20);", 1)

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
    quality_adaptive_code = r"""let fpsSample=0,qualityDprCurrent=qualityDpr,renderedFps=0;
 // Quality keeps the full native render scale selected at startup. Runtime pressure is
 // measured and reported, never hidden by reducing resolution or scene fidelity.
 let lastWorldUpdateMs=0,lastRenderCpuMs=0;
 const targetFrameRate=120;
 let lastQualityWarningAt=0;
 function adaptRenderQuality(dt){
  fpsSample+=Math.max(0,Math.min(.10,dt||0));if(fpsSample<2.0)return;fpsSample=0;
  const fps=renderedFps||engine.getFps(),now=performance.now();
  if(fps<24&&now-lastQualityWarningAt>=4000){
   lastQualityWarningAt=now;
   console.warn('EL SIN NOMBRE: FPS bajo; la calidad y resolución nativa permanecen bloqueadas. Se requiere optimización de CPU/GPU.',{fps:Math.round(fps),targetFrameRate,renderDpr:qualityDprCurrent,qualityScaleLockedForSession:true,qualityScaleAdaptive:false,nativeResolutionPreserved:true,geometryAndEffectsPreserved:true,shadowMap:currentShadowSize,meshes:scene.meshes.length,vegetationMerge:staticMergeStats,cpu:{preWorldMaintenanceMs:lastPreWorldMaintenanceMs,worldUpdateMs:lastWorldUpdateMs,renderSubmissionMs:lastRenderCpuMs}});
  }
 }"""
    if html.count(quality_adaptive_marker) != 1:
        raise SystemExit("No se encontró exactamente la función original de supervisión de resolución.")
    html = html.replace(quality_adaptive_marker, quality_adaptive_code, 1)

    # Preserve Babylon's native render-loop cadence: do not cap or pace frames below
    # the display's actual refresh rate. Only measure rendered frames for diagnostics.
    frame_maintenance_timing_code = r"""let lastPreWorldMaintenanceMs=0;
const frameMaintenanceTimingStats=Object.create(null);
function recordFrameMaintenanceTiming(kind,startedAt){
 const duration=Math.max(0,performance.now()-startedAt);
 let row=frameMaintenanceTimingStats[kind];
 if(!row)row=frameMaintenanceTimingStats[kind]={samples:0,lastMs:0,totalMs:0,maxMs:0,samplesMs:new Float32Array(120),cursor:0,count:0};
 row.samples++;row.lastMs=duration;row.totalMs+=duration;row.maxMs=Math.max(row.maxMs,duration);
 row.samplesMs[row.cursor]=duration;row.cursor=(row.cursor+1)%row.samplesMs.length;row.count=Math.min(row.samplesMs.length,row.count+1);
}
function getFrameMaintenanceTimingSnapshot(){
 const snapshot={};
 for(const [kind,row] of Object.entries(frameMaintenanceTimingStats)){
  const values=Array.from(row.samplesMs).slice(0,row.count).sort((a,b)=>a-b);
  const at=p=>values.length?Number(values[Math.min(values.length-1,Math.floor((values.length-1)*p))].toFixed(3)):null;
  snapshot[kind]={samples:row.samples,lastMs:Number(row.lastMs.toFixed(3)),meanMs:Number((row.totalMs/Math.max(1,row.samples)).toFixed(3)),p50Ms:at(.50),p95Ms:at(.95),p99Ms:at(.99),maxMs:Number(row.maxMs.toFixed(3))};
 }
 return snapshot;
}
"""
    frame_loop_marker = "engine.runRenderLoop(()=>{\n  const now=performance.now(),rawFrameMs=Math.max(0,now-last),dt=Math.max(0,Math.min(.10,rawFrameMs/1000));last=now;"
    frame_loop_replacement = frame_loop_marker
    frame_loop_replacement = frame_maintenance_timing_code + "\n" + frame_loop_replacement + "\n  const preWorldMaintenanceStarted=performance.now();let maintenanceStarted=preWorldMaintenanceStarted;\n  updateAmbientGullFlight(now*.001);recordFrameMaintenanceTiming('gullFlight',maintenanceStarted);\n  maintenanceStarted=performance.now();maintainActiveEnemyVisuals(now);recordFrameMaintenanceTiming('enemyVisualRecovery',maintenanceStarted);\n  maintenanceStarted=performance.now();maintainNpcOverlayAnchors(now);recordFrameMaintenanceTiming('npcOverlayMaintenance',maintenanceStarted);\n  lastPreWorldMaintenanceMs=performance.now()-preWorldMaintenanceStarted;recordFrameMaintenanceTiming('total',preWorldMaintenanceStarted);"
    if html.count(frame_loop_marker) != 1:
        raise SystemExit("No se encontró el bucle nativo de Babylon para preservar la frecuencia de refresco del dispositivo.")
    html = html.replace(frame_loop_marker, frame_loop_replacement, 1)

    frame_clock_marker = "let last=performance.now(),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;"
    frame_clock_replacement = frame_clock_marker
    if html.count(frame_clock_marker) != 1:
        raise SystemExit("No se encontró el reloj único del bucle nativo para medir los fotogramas renderizados.")
    html = html.replace(frame_clock_marker, frame_clock_replacement, 1)

    fps_sample_marker = "fpsHudTime+=dt;"
    fps_sample_replacement = "fpsHudTime+=rawFrameMs/1000;fpsHudFrames++;"
    if html.count(fps_sample_marker) != 1:
        raise SystemExit("No se encontró el contador único del HUD de FPS.")
    html = html.replace(fps_sample_marker, fps_sample_replacement, 1)

    fps_hud_marker = "const measured=engine.getFps(),meter=document.getElementById('fpsMeter');"
    fps_hud_replacement = "const measured=fpsHudTime>0?fpsHudFrames/fpsHudTime:0;renderedFps=measured;fpsHudFrames=0;const meter=document.getElementById('fpsMeter');"
    if html.count(fps_hud_marker) != 1:
        raise SystemExit("No se encontró el cálculo único del FPS real del HUD.")
    html = html.replace(fps_hud_marker, fps_hud_replacement, 1)

    fps_colour_marker = "meter.style.color=measured>=116?'#94d8a0':measured>=90?'#e6c27f':'#ff9a83';"
    fps_colour_replacement = "meter.style.color=measured>=116?'#94d8a0':measured>=90?'#e6c27f':'#ff9a83';"
    if html.count(fps_colour_marker) != 1:
        raise SystemExit("No se encontró el esquema único de color del HUD para pantallas de alta frecuencia.")
    html = html.replace(fps_colour_marker, fps_colour_replacement, 1)

    fps_title_marker = "meter.title='Objetivo: 120 FPS. Tiempo de fotograma P95: '+p95.toFixed(1)+' ms (120 FPS requiere ≤8,3 ms). DPR de renderizado: '+qualityDprCurrent.toFixed(2)+'.';"
    fps_title_replacement = fps_title_marker
    if html.count(fps_title_marker) != 1:
        raise SystemExit("No se encontró el texto único del objetivo de FPS del HUD.")
    html = html.replace(fps_title_marker, fps_title_replacement, 1)

    visibility_clock_marker = "document.addEventListener('visibilitychange',()=>{last=performance.now();"
    visibility_clock_replacement = visibility_clock_marker
    if html.count(visibility_clock_marker) != 1:
        raise SystemExit("No se encontró el reinicio único del reloj al cambiar la visibilidad.")
    html = html.replace(visibility_clock_marker, visibility_clock_replacement, 1)

    webgl_clock_marker = "engine.resize();scene.activeCamera=camera;last=performance.now();"
    webgl_clock_replacement = webgl_clock_marker
    if html.count(webgl_clock_marker) != 1:
        raise SystemExit("No se encontró el reinicio único del reloj tras restaurar WebGL.")
    html = html.replace(webgl_clock_marker, webgl_clock_replacement, 1)

    health_fps_marker = "fps:Math.round(engine.getFps()),"
    health_fps_replacement = "fps:Math.round(renderedFps||engine.getFps()),"
    if html.count(health_fps_marker) != 1:
        raise SystemExit("No se encontró la lectura única del FPS del informe de salud.")
    html = html.replace(health_fps_marker, health_fps_replacement, 1)

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
            "preserve the original 180-object reflection submission budget",
        ),
        (
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length,filteredFoliageAndTinyDetails:reflectionFilteredMeshCount});",
            "  console.info('Nordic water reflection island updated',{islandIndex,reflectedMeshes:list.length,filteredFoliageAndTinyDetails:reflectionFilteredMeshCount,reflectionLimitDiscardedMeshCount});",
            "report water-reflection draw-list cap",
        ),
        (
            "const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024;",
            "const mirrorSize=isTouchDevice?(isConstrainedMobile?384:640):1024;",
            "restore the original 640-pixel mobile water reflection target",
        ),
        (
            "nordicWaterMirror.refreshRate=isTouchDevice?12:8;",
            "nordicWaterMirror.refreshRate=isTouchDevice?12:8;",
            "restore the original 12-frame mobile water reflection cadence",
        ),
        (
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?3:4));",
            "if(shadowMap)shadowMap.refreshRate=isConstrainedMobile?14:(isPerformanceMode?10:(highHeadroomQualityMobile?10:4));",
            "restore the original high-quality mobile shadow refresh cadence",
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
    # 0.6.352 release gate: render-loop changes require a fresh build and real-gameplay acceptance.
    # Browser OS dependencies are installed on the isolated startup/fauna runners, not in this cache-warming build job.
    world_snapshot_code = r"""
 // Flight is advanced by the game's actual Engine.runRenderLoop callback on every frame.
 const gullFlightRenderState=window.__ELSN_GULL_FLIGHT_RENDER__={active:true,frameTicks:0,updatedBirds:0,updateErrors:0,worldMatrixRecoveries:0,visualHierarchyRefreshes:0,frozenVisualNodesRecovered:0,visualPositionStalls:0,stalledBirds:0,lastTimestamp:null,lastError:null};
 function refreshGullVisualHierarchy(visualRoot){
  if(!visualRoot||visualRoot.isDisposed?.())return {refreshed:0,recovered:0};
  const stack=[visualRoot],seen=new Set();let refreshed=0,recovered=0;
  while(stack.length){
   const node=stack.pop();if(!node||seen.has(node)||node.isDisposed?.())continue;seen.add(node);
   const frozen=node._isWorldMatrixFrozen===true||node.isWorldMatrixFrozen===true;
   if(frozen&&typeof node.unfreezeWorldMatrix==='function'){node.unfreezeWorldMatrix();recovered++;}
   if(node===visualRoot||node.parent===visualRoot||frozen){
    if(typeof node.markAsDirty==='function')node.markAsDirty('position');
    if(typeof node.computeWorldMatrix==='function'){node.computeWorldMatrix(true);refreshed++;}
   }
   const children=typeof node.getChildren==='function'?node.getChildren():[];
   for(const child of children)stack.push(child);
  }
  return {refreshed,recovered};
 }
 function updateAmbientGullFlight(nowSeconds){
  const birds=ambientBirds;
  if(!Number.isFinite(nowSeconds)||!Array.isArray(birds)||!birds.length)return;
  gullFlightRenderState.frameTicks++;
  gullFlightRenderState.lastTimestamp=nowSeconds;
  let updated=0;
  for(const b of birds){
   try{
    if(!b||!b.root||b.root.isDisposed?.()||!b.root.position)continue;
    if(typeof b.root.isEnabled==='function'&&!b.root.isEnabled())b.root.setEnabled(true);if(b.root._isWorldMatrixFrozen&&typeof b.root.unfreezeWorldMatrix==='function'){b.root.unfreezeWorldMatrix();gullFlightRenderState.worldMatrixRecoveries++;}
    if(!Number.isFinite(b.flightClockOrigin))b.flightClockOrigin=nowSeconds;
    const flightElapsed=Math.max(0,nowSeconds-b.flightClockOrigin);
    const phase=Number.isFinite(Number(b.phase))?Number(b.phase):0;
    const radius=Number.isFinite(Number(b.radius))?Math.max(1,Number(b.radius)):18;
    const altitude=Number.isFinite(Number(b.alt))?Number(b.alt):10;
    const speed=Number.isFinite(Number(b.speed))?Math.max(.18,Number(b.speed)):.18;
    const a=flightElapsed*speed+phase,bank=Math.sin(a*1.2)*.12;
    b.flightUpdateTicks=(Number(b.flightUpdateTicks)||0)+1;
    b.flightElapsed=flightElapsed;
    const captureLocked=window.__ELSN_FAUNA_CAPTURE_LOCK__===String(b.root.name||'');
    if(!captureLocked){
     b.root.position.set(Math.cos(a)*radius-36,altitude+Math.sin(a*2+phase)*.72+Math.sin(flightElapsed*.41+phase)*.12,Math.sin(a)*radius-18);
     b.root.rotationQuaternion=null;b.root.rotation.set(0,-a+Math.PI/2,bank);
     if(typeof b.root.markAsDirty==='function')b.root.markAsDirty('position');
    }
    b.root.computeWorldMatrix(true);
    const visualRefresh=refreshGullVisualHierarchy(b.flightRig&&b.flightRig.visualRoot);
    gullFlightRenderState.visualHierarchyRefreshes+=visualRefresh.refreshed;
    gullFlightRenderState.frozenVisualNodesRecovered+=visualRefresh.recovered;
    const visualRoot=b.flightRig&&b.flightRig.visualRoot;
    if(visualRoot&&typeof visualRoot.getAbsolutePosition==='function'){
     const visualPosition=visualRoot.getAbsolutePosition(),previousVisual=b.flightVisualLastPosition;
     if(previousVisual&&!captureLocked){
      const visualDx=visualPosition.x-previousVisual.x,visualDy=visualPosition.y-previousVisual.y,visualDz=visualPosition.z-previousVisual.z;
      b.flightVisualLastStepMeters=Math.sqrt(visualDx*visualDx+visualDy*visualDy+visualDz*visualDz);
      if(b.flightVisualLastStepMeters<.0001)gullFlightRenderState.visualPositionStalls++;
     }
     b.flightVisualLastPosition={x:visualPosition.x,y:visualPosition.y,z:visualPosition.z};
    }
    const previous=b.flightLastPosition;
    if(previous&&!captureLocked){const dx=b.root.position.x-previous.x,dy=b.root.position.y-previous.y,dz=b.root.position.z-previous.z;b.flightLastStepMeters=Math.sqrt(dx*dx+dy*dy+dz*dz);if(b.flightLastStepMeters<.0001)gullFlightRenderState.stalledBirds++;}
    b.flightLastPosition={x:b.root.position.x,y:b.root.position.y,z:b.root.position.z};
    if(b.procedural&&b.left&&b.right){
     b.left.rotation.z=-.10-Math.sin(flightElapsed*10.5+phase)*.38;
     b.right.rotation.z=.10+Math.sin(flightElapsed*10.5+phase)*.38;
    }else{
     const flight=b.flightRig&&b.flightRig.animationGroup||b.animation||null;
     if(flight){
      if(!flight.isPlaying)flight.start(true,1,flight.from,flight.to);
      flight.speedRatio=.96+.08*Math.sin(flightElapsed*.7+phase);
     }
    }
    updated++;
   }catch(error){
    gullFlightRenderState.updateErrors++;
    gullFlightRenderState.lastError=String(error&&error.message||error).slice(0,300);
   }
  }
  gullFlightRenderState.updatedBirds=updated;
 }
 const gullWingBindPose=new WeakMap();
 const gullWingFlapObserver=scene.onBeforeRenderObservable.add(()=>{
  const now=performance.now()*.001;
  for(const bird of ambientBirds||[]){
   const rig=bird&&bird.flightRig,flight=rig&&rig.animationGroup;if(!rig)continue;
   const targets=flight&&Array.isArray(flight.targetedAnimations)?flight.targetedAnimations:[];
   for(const item of [{key:'leftWing',sign:1},{key:'rightWing',sign:-1}]){
    const node=rig[item.key]&&rig[item.key].node;if(!node||node.isDisposed?.())continue;
    let state=gullWingBindPose.get(node);
    const rotation=node.rotationQuaternion?{kind:'q',x:node.rotationQuaternion.x,y:node.rotationQuaternion.y,z:node.rotationQuaternion.z,w:node.rotationQuaternion.w}:{kind:'e',x:node.rotation?.x||0,y:node.rotation?.y||0,z:node.rotation?.z||0};
    if(!state){state={kind:rotation.kind,baseQuaternion:node.rotationQuaternion?node.rotationQuaternion.clone():null,baseRotation:node.rotation?node.rotation.clone():null,last:rotation,lastMotionAt:now,fallback:false};gullWingBindPose.set(node,state);}
    if(!state.fallback){
     const delta=rotation.kind==='q'?Math.abs(rotation.x-state.last.x)+Math.abs(rotation.y-state.last.y)+Math.abs(rotation.z-state.last.z)+Math.abs(rotation.w-state.last.w):Math.abs(rotation.x-state.last.x)+Math.abs(rotation.y-state.last.y)+Math.abs(rotation.z-state.last.z);
     if(delta>.00035)state.lastMotionAt=now;state.last=rotation;
     const nativeTarget=targets.some(track=>track&&track.target===node);
     if(nativeTarget&&now-state.lastMotionAt<.85)continue;state.fallback=true;
    }
    const flap=Math.sin(now*7.1+(Number(bird.phase)||0))*.42*item.sign;
    if(state.kind==='q'&&state.baseQuaternion){const d=B.Quaternion.RotationAxis(B.Axis.Z,flap);node.rotationQuaternion=state.baseQuaternion.multiply(d);}
    else if(state.baseRotation){node.rotation.copyFrom(state.baseRotation);node.rotation.z=state.baseRotation.z+flap;}
    try{node.computeWorldMatrix(true);}catch(_){}
   }
  }
 });
 let enemyVisualRecoveryAt=0;
 window.__ELSN_ENEMY_VISUAL_REPAIR__={lastAt:0,scanned:0,repaired:0,fallbackBodies:0,nearbyHostiles:0,rootDetachRepairs:0,visualParentRepairs:0,importedRootRepairs:0,lastRepairActor:""};
 function maintainActiveEnemyVisuals(nowMs){
  if(!gameStarted||nowMs-enemyVisualRecoveryAt<350)return;
  enemyVisualRecoveryAt=nowMs;
  const diagnostics=window.__ELSN_ENEMY_VISUAL_REPAIR__,focus=player.root&&player.root.position;
  let scanned=0,repaired=0,fallbackBodies=0,nearbyHostiles=0,rootDetachRepairs=0,visualParentRepairs=0,importedRootRepairs=0,lastRepairActor="";if(!focus)return;
  for(const actor of enemies||[]){
   const parts=actor&&actor.parts,root=parts&&parts.root;
   if(!parts||!root||root.isDisposed?.()||actor.alive===false||parts.alive===false||actor.recruited===true||actor.surrendered===true||parts.recruited===true||parts.surrendered===true||actor.faction==='player'||parts.faction==='player')continue;
   scanned++;
   const mountedShipCrew=!!parts.vesselMount||Number.isInteger(actor.crewShipIndex);
   if(root.parent&&(actor.islandInvader===true||!mountedShipCrew)){
    try{
     root.computeWorldMatrix(true);
     const worldMatrix=root.getWorldMatrix().clone(),worldScale=B.Vector3.One(),worldRotation=B.Quaternion.Identity(),worldPosition=B.Vector3.Zero();
     if(worldMatrix.decompose(worldScale,worldRotation,worldPosition)){
      root.parent=null;root.scaling.copyFrom(worldScale);root.rotationQuaternion=null;root.rotation.copyFrom(worldRotation.toEulerAngles());root.position.copyFrom(worldPosition);root.computeWorldMatrix(true);
      rootDetachRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");
     }
    }catch(_){}
   }
   let position=root.position;try{if(root.getAbsolutePosition)position=root.getAbsolutePosition();}catch(_){}
   const dx=position.x-focus.x,dz=position.z-focus.z;if(dx*dx+dz*dz>72*72)continue;nearbyHostiles++;
   if(typeof root.isEnabled==='function'&&!root.isEnabled()){root.setEnabled(true);repaired++;}
   const real=parts.realHuman||null;
   if(real){
    const visualBody=real.visualBody||null,modelRoot=real.modelRoot||null,bodyBase=real.visualBodyLocalPosition||null,modelBase=real.modelRootLocalPosition||null;
    if(visualBody&&!visualBody.isDisposed?.()){
     if(visualBody.parent!==root){visualBody.parent=root;if(bodyBase)visualBody.position.copyFrom(bodyBase);else visualBody.position.set(0,.90,0);visualParentRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");}
     else if(bodyBase&&(Math.abs(visualBody.position.x-bodyBase.x)>.35||Math.abs(visualBody.position.y-bodyBase.y)>.55||Math.abs(visualBody.position.z-bodyBase.z)>.35)){visualBody.position.copyFrom(bodyBase);visualParentRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");}
    }
    if(modelRoot&&visualBody&&!modelRoot.isDisposed?.()){
     if(modelRoot.parent!==visualBody){modelRoot.parent=visualBody;if(modelBase)modelRoot.position.copyFrom(modelBase);else modelRoot.position.set(0,-.90,0);visualParentRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");}
     else if(modelBase&&(Math.abs(modelRoot.position.x-modelBase.x)>.35||Math.abs(modelRoot.position.y-modelBase.y)>.65||Math.abs(modelRoot.position.z-modelBase.z)>.35)){modelRoot.position.copyFrom(modelBase);visualParentRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");}
    }
    for(const importedRoot of real.roots||[]){if(!importedRoot||importedRoot.isDisposed?.()||!modelRoot||importedRoot===visualBody||importedRoot===modelRoot)continue;if(importedRoot.parent!==modelRoot){importedRoot.parent=modelRoot;importedRootRepairs++;repaired++;lastRepairActor=String(parts.name||root.name||"");}}
    for(const node of [visualBody,modelRoot,...(real.roots||[])]){if(!node||node.isDisposed?.())continue;if(typeof node.setEnabled==='function'&&!node.isEnabled()){node.setEnabled(true);repaired++;}}
    const meshes=Array.isArray(real.meshes)?real.meshes:[];let visibleCount=0;
    for(const mesh of meshes){if(!mesh||mesh.isDisposed?.())continue;if(typeof mesh.setEnabled==='function'&&!mesh.isEnabled?.()){mesh.setEnabled(true);repaired++;}if(mesh.isVisible===false||Number(mesh.visibility??1)<=.01){mesh.isVisible=true;mesh.visibility=1;repaired++;}if((!mesh.isEnabled||mesh.isEnabled())&&mesh.isVisible!==false&&Number(mesh.visibility??1)>.01)visibleCount++;}
    const fallback=parts.proceduralFallbackBody;
    if(fallback&&!fallback.isDisposed?.()){const useFallback=visibleCount===0;if(typeof fallback.setEnabled==='function'&&fallback.isEnabled()!==useFallback)fallback.setEnabled(useFallback);if(useFallback)fallbackBodies++;}
   }else if(parts.body&&!parts.body.isDisposed?.()){
    if(parts.body.parent!==root){parts.body.parent=root;repaired++;lastRepairActor=String(parts.name||root.name||"");}
    if(typeof parts.body.setEnabled==='function'&&!parts.body.isEnabled()){parts.body.setEnabled(true);repaired++;}
    const meshes=parts.body.getChildMeshes?parts.body.getChildMeshes(false):[];
    for(const mesh of meshes){if(!mesh||mesh.isDisposed?.())continue;if(typeof mesh.setEnabled==='function'&&!mesh.isEnabled?.()){mesh.setEnabled(true);repaired++;}if(mesh.isVisible===false||Number(mesh.visibility??1)<=.01){mesh.isVisible=true;mesh.visibility=1;repaired++;}}
   }
   if(parts.factionBadge&&typeof parts.factionBadge.setEnabled==='function'&&!parts.factionBadge.isEnabled?.())parts.factionBadge.setEnabled(true);
  }
  diagnostics.lastAt=nowMs;diagnostics.scanned=scanned;diagnostics.repaired=repaired;diagnostics.fallbackBodies=fallbackBodies;diagnostics.nearbyHostiles=nearbyHostiles;diagnostics.rootDetachRepairs=rootDetachRepairs;diagnostics.visualParentRepairs=visualParentRepairs;diagnostics.importedRootRepairs=importedRootRepairs;diagnostics.lastRepairActor=lastRepairActor;
 }
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
 window.getGameVisualActorDiagnostics=()=>{
  const enabled=node=>!!node&&(typeof node.isEnabled!=='function'||node.isEnabled());
  const visible=mesh=>!!mesh&&!mesh.isDisposed?.()&&enabled(mesh)&&mesh.isVisible!==false&&Number(mesh.visibility??1)>.01;
  const clubMeshes=realWeaponGroups&&realWeaponGroups.club&&realWeaponGroups.club.getChildMeshes?realWeaponGroups.club.getChildMeshes(false):[];
  const worldPos=node=>{if(!node||node.isDisposed?.())return null;try{node.computeWorldMatrix?.(true);const p=node.getAbsolutePosition?.();return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)?{x:p.x,y:p.y,z:p.z}:null;}catch(_){return null;}};
  const clubMeshEvidence=clubMeshes.map(mesh=>{try{mesh.computeWorldMatrix?.(true);const box=mesh.getBoundingInfo?.()?.boundingBox,center=box?.centerWorld||mesh.getAbsolutePosition?.();return {name:String(mesh.name||''),enabled:enabled(mesh),isVisible:mesh.isVisible!==false,visibility:Number(mesh.visibility??1),frozen:mesh._isWorldMatrixFrozen===true||mesh.isWorldMatrixFrozen===true,worldCenter:center?{x:center.x,y:center.y,z:center.z}:null};}catch(_){return {name:String(mesh&&mesh.name||''),error:true};}});
  const weaponHandPosition=worldPos(realHandNode),weaponHolderPosition=worldPos(realWeaponHolder),weaponPivotPosition=worldPos(realPlayerModelPivot);
  const guards=(humanEnemyParts||[]).filter(parts=>/^VillageGuard0_/.test(String(parts&&parts.name||'')));
  const homeWarriors=guards.map(parts=>{
   const real=parts.realHuman,meshes=real&&Array.isArray(real.meshes)?real.meshes:[];
   return {name:String(parts.name||''),rootEnabled:enabled(parts.root),realHuman:!!real,meshCount:meshes.length,visibleMeshCount:meshes.filter(visible).length,bodyEnabled:enabled(real&&real.visualBody),modelRootEnabled:enabled(real&&real.modelRoot)};
  });
  const wingPose=node=>{if(!node||node.isDisposed?.())return null;const q=node.rotationQuaternion,r=node.rotation;return q?{kind:'q',x:q.x,y:q.y,z:q.z,w:q.w}:{kind:'e',x:r?.x||0,y:r?.y||0,z:r?.z||0};};
  const firstVisibleMesh=root=>{if(!root)return null;try{const rows=root.getChildMeshes?.(false)||[];const mesh=rows.find(item=>visible(item))||rows[0]||null;if(!mesh)return null;mesh.computeWorldMatrix?.(true);const box=mesh.getBoundingInfo?.()?.boundingBox,center=box?.centerWorld||mesh.getAbsolutePosition?.();return {name:String(mesh.name||''),enabled:enabled(mesh),isVisible:mesh.isVisible!==false,visibility:Number(mesh.visibility??1),frozen:mesh._isWorldMatrixFrozen===true||mesh.isWorldMatrixFrozen===true,worldCenter:center?{x:center.x,y:center.y,z:center.z}:null};}catch(_){return null;}};
  const gulls=(ambientBirds||[]).filter(b=>b&&b.real).map(b=>{const flight=b.flightRig&&b.flightRig.animationGroup||b.animation||null,p=b.root&&b.root.position,rig=b.flightRig,visualRoot=rig&&rig.visualRoot,visualChildren=visualRoot&&typeof visualRoot.getChildren==='function'?visualRoot.getChildren():[];return {name:String(b.root&&b.root.name||''),rootEnabled:enabled(b.root),position:p?{x:p.x,y:p.y,z:p.z}:null,rootAbsolutePosition:worldPos(b.root),rootParent:String(b.root&&b.root.parent&&b.root.parent.name||''),rootFrozen:!!(b.root&&(b.root._isWorldMatrixFrozen===true||b.root.isWorldMatrixFrozen===true)),visualRootName:String(visualRoot&&visualRoot.name||''),visualRootParent:String(visualRoot&&visualRoot.parent&&visualRoot.parent.name||''),visualRootPosition:visualRoot&&visualRoot.position?{x:visualRoot.position.x,y:visualRoot.position.y,z:visualRoot.position.z}:null,visualRootAbsolutePosition:worldPos(visualRoot),visualRootFrozen:!!(visualRoot&&(visualRoot._isWorldMatrixFrozen===true||visualRoot.isWorldMatrixFrozen===true)),visualChildCount:visualChildren.length,visualChildAbsolutePositions:visualChildren.slice(0,3).map(worldPos),sampleVisibleMesh:firstVisibleMesh(visualRoot),flightVisualLastStepMeters:Number(b.flightVisualLastStepMeters)||0,flightLastStepMeters:Number(b.flightLastStepMeters)||0,phase:Number(b.phase)||0,radius:Number(b.radius)||0,flightElapsed:Number(b.flightElapsed)||0,flightUpdateTicks:Number(b.flightUpdateTicks)||0,flightName:flight&&String(flight.name||''),flightPlaying:!!(flight&&flight.isPlaying),hasFlightRig:!!rig,leftWingPose:wingPose(rig&&rig.leftWing&&rig.leftWing.node),rightWingPose:wingPose(rig&&rig.rightWing&&rig.rightWing.node),leftWingFallback:!!(rig&&rig.leftWing&&gullWingBindPose.get(rig.leftWing.node)?.fallback),rightWingFallback:!!(rig&&rig.rightWing&&gullWingBindPose.get(rig.rightWing.node)?.fallback)};});
  const hostiles=(enemies||[]).filter(e=>e&&e.parts&&e.alive!==false&&e.parts.faction!=='player'&&e.faction!=='player'&&!e.recruited&&!e.surrendered).map(e=>{const p=e.parts,root=p.root,real=p.realHuman,body=real?.visualBody||p.body,meshes=real?.meshes||(body&&body.getChildMeshes?body.getChildMeshes(false):[]),fallback=p.proceduralFallbackBody,fallbackMeshes=fallback&&fallback.getChildMeshes?fallback.getChildMeshes(false):[],visibleMeshCount=(meshes||[]).filter(visible).length+((fallback&&enabled(fallback))?fallbackMeshes.filter(visible).length:0);return {name:String(p.name||''),position:root&&root.position?{x:root.position.x,y:root.position.y,z:root.position.z}:null,rootEnabled:enabled(root),bodyEnabled:enabled(body)||enabled(fallback),visibleMeshCount,meshCount:(meshes||[]).length+((fallback&&enabled(fallback))?fallbackMeshes.length:0),hasRealHuman:!!real,proceduralFallbackVisible:!!(fallback&&enabled(fallback))};});
  return {playerClub:{equipped:String(equippedWeapon||''),holderExists:!!realWeaponHolder,holderEnabled:enabled(realWeaponHolder),groupEnabled:enabled(realWeaponGroups&&realWeaponGroups.club),meshCount:clubMeshes.length,visibleMeshCount:clubMeshes.filter(visible).length,anchor:String(realWeaponAnchorType||''),calibrated:String(realWeaponAnchorType||'')==='club-local-player-anchor',holderParent:String(realWeaponHolder&&realWeaponHolder.parent&&realWeaponHolder.parent.name||''),parentIsModelPivot:!!(realWeaponHolder&&realWeaponHolder.parent===realPlayerModelPivot),holderWorldPosition:weaponHolderPosition,handWorldPosition:weaponHandPosition,pivotWorldPosition:weaponPivotPosition,holderToHandMeters:weaponHolderPosition&&weaponHandPosition?B.Vector3.Distance(new B.Vector3(weaponHolderPosition.x,weaponHolderPosition.y,weaponHolderPosition.z),new B.Vector3(weaponHandPosition.x,weaponHandPosition.y,weaponHandPosition.z)):null,meshEvidence:clubMeshEvidence},homeWarriors,gulls,hostiles,playerPosition:player.root&&player.root.position?{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z}:null};
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

    # Split the broad environment/water bucket into its real owners without
    # changing execution order, cadence, quality or the amount of simulation.
    environment_phase_replacements = (
        ("worldUpdateCount++;setWorldUpdatePhase('environment / water');\n  updatePerformanceIslandStreaming(dt);\n  updateActiveIslandGrass(dt);\n  updateManagedWorldShadowCasters();",
         "worldUpdateCount++;setWorldUpdatePhase('environment / island streaming');\n  updatePerformanceIslandStreaming(dt);\n  setWorldUpdatePhase('environment / grass streaming');\n  updateActiveIslandGrass(dt);\n  setWorldUpdatePhase('environment / shadow caster maintenance');\n  updateManagedWorldShadowCasters();",
         "separate island streaming, full-density grass and shadow-caster maintenance"),
        ("habitableAuditAccumulator+=dt;const habitableAuditInterval=onShip ? .5 : 1.5;",
         "setWorldUpdatePhase('environment / settlement integrity');\n  habitableAuditAccumulator+=dt;const habitableAuditInterval=onShip ? .5 : 1.5;",
         "measure settlement integrity audit separately"),
        ("  if(atmosphereSystem)atmosphereSystem.update(dt);",
         "  setWorldUpdatePhase('environment / atmosphere');\n  if(atmosphereSystem)atmosphereSystem.update(dt);",
         "measure atmosphere separately"),
        ("  animateWater(dt);\n  updateWildlife(dt);",
         "  setWorldUpdatePhase('environment / water simulation');\n  animateWater(dt);\n  setWorldUpdatePhase('environment / wildlife simulation');\n  updateWildlife(dt);",
         "separate water simulation from wildlife"),
    )
    for old_phase_code, new_phase_code, phase_label in environment_phase_replacements:
        if html.count(old_phase_code) != 1:
            raise SystemExit(f"No se encontró exactamente una zona para medir {phase_label}.")
        html = html.replace(old_phase_code, new_phase_code, 1)

    performance_report_marker = "waterVertices:waterPositions.length/3}};"
    performance_report_replacement = "waterVertices:waterPositions.length/3},subsystems:{worldPhases:getWorldPhaseTimingSnapshot(),preWorldMaintenance:getFrameMaintenanceTimingSnapshot(),atmosphere:window.__ELSN_ATMOSPHERE&&typeof window.__ELSN_ATMOSPHERE.getPerformanceSnapshot==='function'?window.__ELSN_ATMOSPHERE.getPerformanceSnapshot():null,npcDialogue:window.__ELSN_NPC_DIALOGUES__&&typeof window.__ELSN_NPC_DIALOGUES__.getSnapshot==='function'?window.__ELSN_NPC_DIALOGUES__.getSnapshot():null,wildlife:window.__ELSN_WILDLIFE_DIAGNOSTICS__&&typeof window.__ELSN_WILDLIFE_DIAGNOSTICS__.getSnapshot==='function'?window.__ELSN_WILDLIFE_DIAGNOSTICS__.getSnapshot():{requested:wildlifeSpawnSpecs.length,loaded:ambientFauna.length}}};"
    if html.count(performance_report_marker) != 1:
        raise SystemExit("No se encontró el objeto único del informe de rendimiento para añadir métricas por subsistema.")
    html = html.replace(performance_report_marker, performance_report_replacement, 1)

    phase_flush_marker = "  lastWorldUpdateMs=performance.now()-worldUpdateStarted;"
    if html.count(phase_flush_marker) != 1:
        raise SystemExit("No se encontró el límite único de la actualización del mundo para cerrar la medición por fase.")
    html = html.replace(phase_flush_marker, "  finishWorldPhaseTiming();\n" + phase_flush_marker, 1)

    health_phase_marker = "worldUpdateMs:Number(lastWorldUpdateMs.toFixed(2)),renderCpuMs:Number(lastRenderCpuMs.toFixed(2)),"
    health_phase_replacement = health_phase_marker + "preWorldMaintenanceMs:Number(lastPreWorldMaintenanceMs.toFixed(3)),preWorldMaintenanceTimings:getFrameMaintenanceTimingSnapshot(),worldPhaseTimings:getWorldPhaseTimingSnapshot(),mapDrawMs:Number(lastMapDrawMs.toFixed(3)),mapDrawMaxMs:Number(mapDrawMaxMs.toFixed(3)),mapDrawSampleCount,habitableAuditMs:Number(habitableAuditLastMs.toFixed(3)),habitableAuditMaxMs:Number(habitableAuditMaxMs.toFixed(3)),habitableAuditCount,habitableAuditLastCacheHits,habitableAuditLastCacheMisses,"
    if html.count(health_phase_marker) != 1:
        raise SystemExit("No se encontró el objeto runtime único para publicar los tiempos de fase y del minimapa.")
    html = html.replace(health_phase_marker, health_phase_replacement, 1)

    map_clock_pattern = r"let last=performance\.now\(\),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;"
    map_clock_replacement = "let last=performance.now(),mapClock=0,progressClock=0,fpsHudTime=0,fpsHudFrames=0;\n let lastMapDrawMs=0,mapDrawMaxMs=0,mapDrawSampleCount=0;"
    html, map_clock_count = re.subn(map_clock_pattern, map_clock_replacement, html, count=1)
    if map_clock_count != 1:
        raise SystemExit(f"No se encontró un único reloj compatible del bucle para medir el minimapa (encontrados={map_clock_count}).")

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
   const npcBrainRequiredMethods=['createState','chooseMode','chooseGoal','chooseStep','smoothAngle'];
   const npcBrainMissingMethods=npcBrainRequiredMethods.filter(name=>typeof npcVillageBrain?.[name]!=='function');
   const npcBrainHasLocomotion=typeof npcVillageBrain?.computeLocomotion==='function';
   const npcBrainProblemKey=[...npcBrainMissingMethods,...(!npcBrainHasLocomotion?['computeLocomotion:fallback']:[])].join(',');
   const npcBrainDiagnostics=window.__ELSN_NPC_BRAIN_DIAGNOSTICS__||(window.__ELSN_NPC_BRAIN_DIAGNOSTICS__={status:'unknown',missingMethods:[],computeLocomotionFallback:false,lastProblemKey:''});
   npcBrainDiagnostics.status=npcBrainMissingMethods.length?'unavailable':(npcBrainHasLocomotion?'ready':'degraded');
   npcBrainDiagnostics.missingMethods=npcBrainMissingMethods.slice();
   npcBrainDiagnostics.computeLocomotionFallback=!npcBrainHasLocomotion;
   if(npcBrainProblemKey!==npcBrainDiagnostics.lastProblemKey){
    if(npcBrainProblemKey)console.warn('NPC village brain compatibility issue; world update continues.',{missingMethods:npcBrainMissingMethods,computeLocomotionFallback:!npcBrainHasLocomotion});
    npcBrainDiagnostics.lastProblemKey=npcBrainProblemKey;
   }
   const npcBrainRuntime=window.__ELSN_NPC_BRAIN_RUNTIME__||(window.__ELSN_NPC_BRAIN_RUNTIME__=(()=>{
    const fallbackComputeLocomotion=(input,state)=>{
     const c=input||{},s=state||{},dt=Math.min(.12,Math.max(0,Number(c.dt)||0));
     const mode=String(c.mode||'work'),distance=Math.max(0,Number(c.distance)||0);
     const base=Number.isFinite(Number(c.baseSpeed))?Math.max(.05,Number(c.baseSpeed)):.78;
     const desired=mode==='flee'?Math.max(1.25,base*1.48):mode==='social'?.72:mode==='watch'?.34:mode==='rest'?.20:base;
     const moving=c.moving===true&&distance>.04,target=moving?desired:0,accel=target>(Number(s.speed)||0)?3.1:5.4;
     const previous=Number.isFinite(Number(s.speed))?Number(s.speed):0;
     s.speed=previous+(target-previous)*Math.min(1,dt*accel);
     const turn=Math.abs(Number(c.turnAngle)||0),turnScale=1-Math.min(.34,turn/Math.PI*.34),speed=Math.max(0,s.speed*turnScale);
     const gait=!moving||speed<.12?'idle':mode==='flee'?'run':speed>.88?'jog':'walk';
     return Object.freeze({speed,gait,turnRate:gait==='idle'?2.8:(gait==='run'?8.8:7.2),strideScale:gait==='run'?1.22:(gait==='jog'?1.08:1),acceleration:dt>0?(s.speed-previous)/dt:0});
    };
    return Object.freeze({fallbackComputeLocomotion});
   })());
   if(!ambientPeople.__npcEnvironment||elapsed>=Number(ambientPeople.__npcEnvironmentAt||0)){
    let atmosphere=null;
    try{atmosphere=window.__ELSN_ATMOSPHERE&&typeof window.__ELSN_ATMOSPHERE.getState==='function'?window.__ELSN_ATMOSPHERE.getState():null;}catch(_){}
    ambientPeople.__npcEnvironment={night:!!(atmosphere&&Number(atmosphere.night)>=.55),daylight:atmosphere&&Number.isFinite(Number(atmosphere.daylight))?Number(atmosphere.daylight):.5,weather:atmosphere&&atmosphere.weather?String(atmosphere.weather):''};
    ambientPeople.__npcEnvironmentAt=elapsed+2.5;
   }
   const npcEnvironment=ambientPeople.__npcEnvironment;
   const ambientNpcPlayerPosition=playerPos(),playerX=Number(ambientNpcPlayerPosition.x)||0,playerZ=Number(ambientNpcPlayerPosition.z)||0;
   if(npcBrainMissingMethods.length===0)ambientPeople.forEach((npc,i)=>{
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
      const wantedHeading=Math.atan2(targetDx,targetDz);
      const turnDelta=Math.atan2(Math.sin(wantedHeading-p.rotation.y),Math.cos(wantedHeading-p.rotation.y));
      if(!brain.locomotionState)brain.locomotionState={speed:0};
      const motion=npcBrainHasLocomotion?npcVillageBrain.computeLocomotion({mode:brain.mode,baseSpeed:npc.speed,distance:targetDistance,dt:ambientDt,moving:true,turnAngle:turnDelta},brain.locomotionState):npcBrainRuntime.fallbackComputeLocomotion({mode:brain.mode,baseSpeed:npc.speed,distance:targetDistance,dt:ambientDt,moving:true,turnAngle:turnDelta},brain.locomotionState);
      const pace=motion.speed;
      const step=Math.min(targetDistance,Math.max(.012,pace*ambientDt));
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
            transformed_lines = transformed_file.read_text(encoding="utf-8").splitlines()
            error_line = None
            for stderr_line in transformed_check.stderr.splitlines():
                if "game-inline-transformed.js:" not in stderr_line:
                    continue
                match = re.search(r":(\\d+)(?::\\d+)?\\s*$", stderr_line)
                if match:
                    error_line = int(match.group(1))
                    break
            context = ""
            if error_line is not None:
                start_line = max(1, error_line - 12)
                end_line = min(len(transformed_lines), error_line + 12)
                context = "\\n--- Contexto del JavaScript transformado ---\\n" + "\\n".join(
                    f"{line_number}: {transformed_lines[line_number - 1]}"
                    for line_number in range(start_line, end_line + 1)
                )
            raise SystemExit(
                "JavaScript sintácticamente inválido después de aplicar las correcciones costeras:\\n"
                + transformed_check.stderr + context
            )
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
