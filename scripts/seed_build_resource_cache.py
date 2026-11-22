#!/usr/bin/env python3
"""Seed the reusable build cache from a prior, successfully validated site artifact."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SPEC = spec_from_file_location("elsn_build_site", ROOT / "scripts" / "build_site.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Could not load scripts/build_site.py")
BUILD = module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)

REQUIRED_MIRROR_ASSETS = {
    "assets/models/viking-rigged.glb",
    "assets/models/armored-knight-rigged.glb",
    "assets/models/man-base-character-rigged.glb",
    "assets/models/forest/oak-textured.glb",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/seed_build_resource_cache.py <previous-site-directory>")
    previous_site = Path(sys.argv[1]).resolve()
    manifest_path = previous_site / "assets" / "asset-manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Previous successful site has no asset manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("game") != "EL SIN NOMBRE" or not isinstance(manifest.get("assets"), list):
        raise SystemExit("The previous site is not a valid EL SIN NOMBRE resource manifest.")

    by_path = {
        str(asset.get("path")): asset
        for asset in manifest["assets"]
        if isinstance(asset, dict) and asset.get("path")
    }
    BUILD.DIST = previous_site
    seeded = []
    missing_required = []

    for relative, (url, minimum, kind) in BUILD.DOWNLOADS.items():
        asset = by_path.get(relative)
        source_file = previous_site / relative
        if not asset or not source_file.is_file():
            if relative in REQUIRED_MIRROR_ASSETS:
                missing_required.append(relative)
            continue

        recorded_source = asset.get("source")
        if recorded_source not in (url, "repository-fallback"):
            if relative in REQUIRED_MIRROR_ASSETS:
                missing_required.append(relative)
            continue

        size = source_file.stat().st_size
        digest = BUILD._sha256_file(source_file)
        if size < minimum or size != int(asset.get("bytes", -1)) or digest != asset.get("sha256"):
            raise SystemExit(f"Previous site asset failed manifest size/SHA-256 verification: {relative}")

        BUILD._validate_cached_payload(source_file, relative, kind)
        BUILD._store_cached_resource(url, source_file, minimum, kind, digest, recorded_source)
        seeded.append(relative)

    missing_required.extend(path for path in REQUIRED_MIRROR_ASSETS if path not in seeded and path not in missing_required)
    if missing_required:
        raise SystemExit(
            "Previous validated artifact cannot mirror all mandatory Grab3D resources: "
            + ", ".join(sorted(missing_required))
        )

    print(
        f"OK seeded {len(seeded)} verified resources from release {manifest.get('version', 'unknown')}; "
        "the original download and semantic validation gates remain active."
    )
    for relative in sorted(seeded):
        print(f"CACHE SEED {relative}")


if __name__ == "__main__":
    main()
