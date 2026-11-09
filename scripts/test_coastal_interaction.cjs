"use strict";
const assert = require("node:assert/strict");
const coast = require("./nordic/coastal-interaction.js");

// The submerged profile joins the analytical shoreline continuously, including positive coastal terrain heights.
assert.equal(coast.seabedHeight(60 * 1.085, 60, -2.9), -2.9);
assert.equal(coast.seabedHeight(60, 60, 0.24), 0.24);
const shoreHeight = 0.42;
const exactShore = coast.seabedHeight(60 * 1.085, 60, shoreHeight);
const justOffshore = coast.seabedHeight(60 * 1.085001, 60, shoreHeight);
assert.ok(Math.abs(exactShore - shoreHeight) < 1e-12);
assert.ok(Math.abs(justOffshore - exactShore) < 1e-6,
  'Submerged seabed must not jump from the shore height to a fixed -2.9m step.');
assert.ok(coast.seabedHeight(60 * 1.20, 60, -2.9) < -2.9);
assert.ok(coast.seabedHeight(60 * 1.34, 60, -2.9) < coast.seabedHeight(60 * 1.20, 60, -2.9));
assert.ok(coast.seabedHeight(60 * 1.34, 60, shoreHeight) < coast.seabedHeight(60 * 1.20, 60, shoreHeight));
assert.ok(Math.abs(coast.seabedHeight(60 * 1.46, 60, -2.9) - (-6.2)) < 1e-9);
assert.ok(Math.abs(coast.seabedHeight(60 * 1.46, 60, shoreHeight) - (-6.2)) < 1e-9);

// The alpha mask must use physical vertical water depth, not radial distance from island centres.
assert.equal(coast.waterDepth(0, 0.25), 0, "Dry sand must not receive water opacity.");
assert.ok(Math.abs(coast.waterDepth(0, -0.12) - 0.12) < 1e-12);
assert.ok(Math.abs(coast.waterDepth(0.2, -0.3) - 0.5) < 1e-12);
assert.equal(coast.waterDepth(-0.2, -0.3), 0.1);
assert.equal(coast.waterDepth(0, -30), 18, "Ocean depth must be bounded.");
assert.equal(coast.waterDepth(0, NaN), 0, "Non-finite seabed samples must fail dry.");

// Opacity must start continuously at the exact waterline, then quickly read as a
// continuous shallow-water sheet without hiding the pale sand underneath.
assert.equal(coast.waterOpacity(0), 0);
assert.equal(coast.waterOpacity(-1), 0);
assert.ok(coast.waterOpacity(0.01) < 0.01);
assert.ok(coast.waterOpacity(0.10) < 0.08);
assert.ok(coast.waterOpacity(0.30) > 0.24 && coast.waterOpacity(0.30) < 0.32);
assert.ok(coast.waterOpacity(0.50) > 0.27 && coast.waterOpacity(0.50) < 0.35);
assert.ok(coast.waterOpacity(0.65) > 0.32 && coast.waterOpacity(0.65) < 0.40);
const opacityDepths = [0, 0.001, 0.01, 0.05, 0.10, 0.20, 0.30, 0.50, 0.65, 0.8, 1, 2, 3.5, 5.5, 20];
let previousOpacity = 0;
for (const depth of opacityDepths) {
  const opacity = coast.waterOpacity(depth);
  assert.ok(Number.isFinite(opacity) && opacity >= previousOpacity - 1e-9 && opacity <= 0.99,
    `Water opacity must be finite, monotonic and bounded at depth ${depth}: ${opacity}`);
  previousOpacity = opacity;
}
assert.ok(coast.waterOpacity(3) > 0.90, 'Water must absorb the pale seabed before the deep seabed boundary.');
assert.ok(Math.abs(coast.waterOpacity(5.5) - 0.99) < 1e-9);
assert.equal(coast.waterOpacity(20), 0.99);

// The animated sheet must sit above both sloping sand and the sea surface.
assert.ok(coast.filmSurfaceHeight(0.24, -0.12, 0.01) > 0.24);
assert.ok(coast.filmSurfaceHeight(-0.08, 0.02, -0.005) > 0.02);

// Coverage is strongest through the middle and fades continuously at both ends.
assert.ok(coast.filmCoverage(0.60, 1) > 0.8);
assert.ok(coast.filmCoverage(0.60, 0) > 0.5);
assert.ok(coast.filmCoverage(1, 1) < 0.01);
assert.ok(coast.filmCoverage(-0.12, 1) < 0.05);

console.log("COASTAL INTERACTION TESTS PASSED: seabed continuity, shallow-water opacity, film height and irregular edge coverage.");
