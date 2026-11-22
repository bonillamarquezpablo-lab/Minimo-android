#!/usr/bin/env python3
"""Unit checks for the build's bounded, checksum-verified resource cache."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import json
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = spec_from_file_location("elsn_build_site", ROOT / "scripts" / "build_site.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Could not load scripts/build_site.py")
BUILD = module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="elsn-resource-cache-") as temporary:
        base = Path(temporary)
        BUILD.DIST = base / "dist"
        BUILD.RESOURCE_CACHE_DIR = base / "cache"
        source = BUILD.DIST / "assets" / "audio" / "sample.ogg"
        source.parent.mkdir(parents=True, exist_ok=True)
        payload = bytes(range(256)) * 8
        source.write_bytes(payload)
        url = "https://example.invalid/sample.ogg"
        digest = BUILD._sha256_file(source)

        BUILD._store_cached_resource(url, source, 512, "audio", digest)
        cached_file, metadata_file = BUILD._resource_cache_paths("assets/audio/sample.ogg")
        source.unlink()
        restored = BUILD._restore_cached_resource(url, source, 512, "audio")
        assert restored is not None, "A fresh, matching cache entry should restore."
        assert source.read_bytes() == payload, "Restored bytes must match the verified source."
        assert restored["sha256"] == digest, "Restored digest must match the original."

        # Wrong source URL must be rejected, not silently reused.
        source.unlink()
        rejected = BUILD._restore_cached_resource(url + "?changed=1", source, 512, "audio")
        assert rejected is None, "A cache entry for another URL must be rejected."
        assert not cached_file.exists() and not metadata_file.exists(), "Rejected entries must be discarded."

        # Corrupt bytes must fail the SHA-256 check.
        source.write_bytes(payload)
        BUILD._store_cached_resource(url, source, 512, "audio", BUILD._sha256_file(source))
        cached_file.write_bytes(b"x" * len(payload))
        source.unlink()
        rejected = BUILD._restore_cached_resource(url, source, 512, "audio")
        assert rejected is None, "Corrupt cached bytes must be rejected."

        # Expired metadata must force a fresh download.
        source.write_bytes(payload)
        BUILD._store_cached_resource(url, source, 512, "audio", BUILD._sha256_file(source))
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        metadata["fetched_at"] = 1
        metadata_file.write_text(json.dumps(metadata), encoding="utf-8")
        source.unlink()
        rejected = BUILD._restore_cached_resource(url, source, 512, "audio")
        assert rejected is None, "Expired cache entries must be rejected."

    print("OK: cache restores matching resources and rejects wrong-source, corrupt and expired entries.")


if __name__ == "__main__":
    main()
