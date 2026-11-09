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
    const shore = Number.isFinite(Number(shoreHeight)) ? Number(shoreHeight) : 0;
    if (ratio <= 1.085) return shore;
    const descent = smooth01((ratio - 1.085) / 0.375);
    return shore + (-6.2 - shore) * descent;
  }

  // Shallow water must remain visibly a continuous water sheet. The previous curve
  // stayed almost transparent over the first metre, exposing the seabed as a broad oval
  // patch instead of reading as water. Build opacity in three continuous depth bands:
  // a narrow shoreline entry, a clear intertidal body, and deeper water absorption.
  // The sand remains readable under the film; no hard alpha step is introduced.
  function waterOpacity(depthMeters) {
    const depth = Math.max(0, Number(depthMeters) || 0);
    if (depth <= 0) return 0;
    const shorelineEntry = 0.24 * smooth01(depth / 0.30);
    const shallowBody = 0.28 * smooth01(depth / 1.65);
    const depthBody = 0.48 * smooth01(depth / 5.5);
    // Deep water should absorb the submerged sand almost completely, avoiding a visible
    // hard oval at the edge of the finite seabed mesh while preserving clear shallows.
    return Math.min(0.94, shorelineEntry + shallowBody + depthBody);
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
