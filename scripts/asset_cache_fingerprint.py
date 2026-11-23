#!/usr/bin/env python3
"""Print the stable fingerprint used to namespace the external game asset cache."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_site import asset_cache_fingerprint  # noqa: E402


if __name__ == "__main__":
    print(asset_cache_fingerprint())
