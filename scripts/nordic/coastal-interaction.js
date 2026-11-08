(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NorseCoastalInteraction = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const smooth01 = value => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  };

  // The visible shore keeps its analytical height. Seaward of the tide line,
  // the bottom descends continuously to a broad, stable sandy seabed.
  function seabedHeight(distance, islandRadius, shoreHeight) {
    const radius = Math.max(0.001, Number(islandRadius) || 0.001);
    const ratio = Math.max(0, Number(distance) || 0) / radius;
    if (ratio <= 1.085) return Number.isFinite(Number(shoreHeight)) ? Number(shoreHeight) : 0;
    const descent = smooth01((ratio - 1.085) / 0.375);
    return -2.9 - 3.3 * descent;
  }

  // Shallow water retains enough opacity to read as water, but still reveals
  // the separate pale sand bottom. Opacity increases smoothly with depth.
  function waterOpacity(depthMeters) {
    const depth = Math.max(0, Number(depthMeters) || 0);
    if (depth <= 0) return 0;
    // Blend in gradually: the first few centimetres must not jump to 52% opacity.
    // The near-shore ramp reaches its water-body contribution over 1.1 m;
    // the deeper ramp retains the existing 90% opacity at 5.5 m.
    const shallowBody = 0.52 * smooth01(depth / 1.1);
    const depthBody = 0.38 * smooth01(depth / 5.5);
    return Math.min(0.90, shallowBody + depthBody);
  }

  // The moving sheet always floats just above both the sloping sand and sea.
  // A bounded ripple avoids cracks and prevents any displacement of the soil.
  function filmSurfaceHeight(groundY, waterY, waveOffset) {
    const ground = Number.isFinite(Number(groundY)) ? Number(groundY) : 0;
    const water = Number.isFinite(Number(waterY)) ? Number(waterY) : 0;
    const wave = Math.max(-0.005, Math.min(0.018, Number(waveOffset) || 0));
    return Math.max(ground, water) + 0.012 + wave;
  }

  // Fade the film at its landward/seaward edges and break it into soft cells.
  // The separate whitewater mesh handles the bright foam crest and residue.
  function filmCoverage(fraction, pattern) {
    const f = Number(fraction) || 0;
    const landward = smooth01((0.99 - f) / 0.18);
    const seaward = smooth01((f + 0.14) / 0.18);
    const breakup = 0.68 + 0.32 * clamp01(pattern);
    return clamp01(landward * seaward * breakup);
  }

  return Object.freeze({ seabedHeight, waterOpacity, filmSurfaceHeight, filmCoverage });
});
