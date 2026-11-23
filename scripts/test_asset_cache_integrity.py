#!/usr/bin/env python3
"""Regression tests for the verified persistent asset cache."""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_site  # noqa: E402


class AssetCacheIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="elsn-asset-cache-test-")
        self.original_root = build_site.ROOT
        self.original_dist = build_site.DIST
        self.original_manifest = build_site._ASSET_CACHE_MANIFEST
        build_site.ROOT = Path(self.temp.name)
        build_site.DIST = build_site.ROOT / "dist"
        build_site.DIST.mkdir(parents=True)
        build_site._ASSET_CACHE_MANIFEST = None

    def tearDown(self):
        build_site.ROOT = self.original_root
        build_site.DIST = self.original_dist
        build_site._ASSET_CACHE_MANIFEST = self.original_manifest
        self.temp.cleanup()

    def _asset(self):
        path = build_site.DIST / "assets" / "audio" / "cache-probe.ogg"
        path.parent.mkdir(parents=True)
        path.write_bytes(b"verified-audio-payload-0123456789")
        return path

    def test_fingerprint_is_stable_and_tracks_asset_spec(self):
        first = build_site.asset_cache_fingerprint()
        self.assertEqual(first, build_site.asset_cache_fingerprint())
        original = build_site.DOWNLOADS
        try:
            build_site.DOWNLOADS = dict(original)
            build_site.DOWNLOADS["assets/test-cache-probe.bin"] = (
                "https://example.invalid/probe.bin", 10, "audio"
            )
            self.assertNotEqual(first, build_site.asset_cache_fingerprint())
        finally:
            build_site.DOWNLOADS = original

    def test_manifest_round_trip_restores_exact_verified_bytes(self):
        url = "https://example.invalid/cache-probe.ogg"
        source = self._asset()
        expected = source.read_bytes()
        saved = build_site.persist_verified_asset_cache(url, source, 10, "audio")
        self.assertEqual(saved["sha256"], build_site._sha256_file(source))
        source.unlink()

        restored = build_site.restore_verified_asset_cache(url, source, 10, "audio")
        self.assertIsNotNone(restored)
        self.assertEqual(restored["source"], "verified-asset-cache")
        self.assertEqual(source.read_bytes(), expected)

    def test_corrupt_cache_is_rejected_and_invalidated(self):
        url = "https://example.invalid/cache-probe.ogg"
        source = self._asset()
        build_site.persist_verified_asset_cache(url, source, 10, "audio")
        cache_file = build_site.ROOT / ".asset-cache" / "assets" / "audio" / "cache-probe.ogg"
        cache_file.write_bytes(b"X" * cache_file.stat().st_size)
        source.unlink()

        restored = build_site.restore_verified_asset_cache(url, source, 10, "audio")
        self.assertIsNone(restored)
        self.assertFalse(cache_file.exists())
        manifest = build_site._load_asset_cache_manifest()
        self.assertNotIn("assets/audio/cache-probe.ogg", manifest["entries"])

    def test_changed_source_url_does_not_reuse_old_asset(self):
        source = self._asset()
        build_site.persist_verified_asset_cache(
            "https://example.invalid/old.ogg", source, 10, "audio"
        )
        source.unlink()
        restored = build_site.restore_verified_asset_cache(
            "https://example.invalid/new.ogg", source, 10, "audio"
        )
        self.assertIsNone(restored)

    def test_legacy_cache_without_manifest_is_not_trusted(self):
        source = self._asset()
        cache_file = build_site.ROOT / ".asset-cache" / "assets" / "audio" / "cache-probe.ogg"
        cache_file.parent.mkdir(parents=True)
        cache_file.write_bytes(source.read_bytes())
        source.unlink()

        restored = build_site.restore_verified_asset_cache(
            "https://example.invalid/cache-probe.ogg", source, 10, "audio"
        )
        self.assertIsNone(restored)
        self.assertFalse(cache_file.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
