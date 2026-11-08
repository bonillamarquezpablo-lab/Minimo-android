"use strict";
const assert = require("node:assert/strict");
const coast = require("./nordic/coastal-interaction.js");

// The submerged profile joins the analytical shoreline without a height jump.
assert.equal(coast.seabedHeight(60 * 1.085, 60, -2.9), -2.9);
assert.equal(coast.seabedHeight(60, 60, 0.24), 0.24);
assert.ok(coast.seabedHeight(60 * 1.20, 60, -2.9) < -2.9);
assert.ok(coast.seabedHeight(60 * 1.34, 60, -2.9) < coast.seabedHeight(60 * 1.20, 60, -2.9));
assert.ok(Math.abs(coast.seabedHeight(60 * 1.46, 60, -2.9) - (-6.2)) < 1e-9);

// Shallow water remains translucent but has enough body to read as water.
assert.equal(coast.waterOpacity(0), 0);
assert.ok(coast.waterOpacity(0.01) >= 0.52 && coast.waterOpacity(0.01) < 0.53);
assert.ok(coast.waterOpacity(2) > coast.waterOpacity(0.01));
assert.ok(Math.abs(coast.waterOpacity(5.5) - 0.90) < 1e-9);
assert.equal(coast.waterOpacity(20), 0.90);

// The animated sheet must sit above both sloping sand and the sea surface.
assert.ok(coast.filmSurfaceHeight(0.24, -0.12, 0.01) > 0.24);
assert.ok(coast.filmSurfaceHeight(-0.08, 0.02, -0.005) > 0.02);

// Coverage is strongest through the middle and fades continuously at both ends.
assert.ok(coast.filmCoverage(0.60, 1) > 0.8);
assert.ok(coast.filmCoverage(0.60, 0) > 0.5);
assert.ok(coast.filmCoverage(1, 1) < 0.01);
assert.ok(coast.filmCoverage(-0.12, 1) < 0.05);

console.log("COASTAL INTERACTION TESTS PASSED: seabed continuity, shallow-water opacity, film height and irregular edge coverage.");
