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

    def test_wildlife_skin_root_is_repaired_to_structural_armature(self):
        document = {
            "nodes": [
                {"name": "RootNode", "children": [1, 5]},
                {"name": "AnimalArmature", "children": [2]},
                {"name": "Body", "children": [3, 4]},
                {"name": "Spine"},
                {"name": "Head"},
                {"name": "DeerMesh"},
            ],
            "skins": [{"skeleton": 2, "joints": [2, 3, 4]}],
        }
        repairs = build_site.repair_terrestrial_animal_skin_roots(
            document, "assets/models/wildlife/Deer.glb"
        )
        self.assertEqual(document["skins"][0]["skeleton"], 1)
        self.assertEqual(len(repairs), 1)
        self.assertEqual(repairs[0]["originalRoot"], 2)
        self.assertEqual(repairs[0]["repairedRootName"], "AnimalArmature")
        self.assertEqual(document["extras"]["elsnAnimalSkinRoot"]["algorithm"], "animal-armature-root-v1")
        self.assertEqual(document["skins"][0]["extras"]["elsnSkeletonRootRepair"]["rootNode"], 1)
        self.assertEqual(
            build_site.repair_terrestrial_animal_skin_roots(
                document, "assets/models/wildlife/Deer.glb"
            ),
            [],
        )

    def test_wildlife_skin_root_rejects_joint_outside_armature(self):
        document = {
            "nodes": [
                {"name": "RootNode", "children": [1, 4]},
                {"name": "AnimalArmature", "children": [2]},
                {"name": "Body", "children": [3]},
                {"name": "Spine"},
                {"name": "ExternalJoint"},
            ],
            "skins": [{"skeleton": 2, "joints": [2, 3, 4]}],
        }
        with self.assertRaisesRegex(RuntimeError, "does not contain every joint"):
            build_site.repair_terrestrial_animal_skin_roots(
                document, "assets/models/wildlife/Wolf.glb"
            )

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


class BuiltWildlifeAssetTests(unittest.TestCase):
    def test_all_production_terrestrial_glbs_have_normalized_armature_roots(self):
        for species in ("Deer", "Wolf", "Stag"):
            path = build_site.DIST / "assets" / "models" / "wildlife" / f"{species}.glb"
            self.assertTrue(path.is_file(), f"Required wildlife asset missing from built dist: {path}")
            label = path.relative_to(build_site.DIST).as_posix()
            document = build_site.validate_rigged_animal_glb(path, label)
            self.assertEqual(
                document["extras"]["elsnAnimalSkinRoot"]["algorithm"],
                "animal-armature-root-v1",
            )
            nodes = document["nodes"]
            root_index = document["extras"]["elsnAnimalSkinRoot"]["rootNode"]
            self.assertEqual(nodes[root_index].get("name"), "AnimalArmature")
            self.assertTrue(all(skin.get("skeleton") == root_index for skin in document["skins"]))



if __name__ == "__main__":
    unittest.main(verbosity=2)
