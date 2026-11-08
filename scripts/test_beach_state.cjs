"use strict";
const assert = require("node:assert/strict");
const { createCoastalGrid, createFootprintAtlas } = require("./nordic/beach-state.js");

const radii = [60,31,33,33,25,27,33,31,36,31,34,34,32];
for (const radius of radii) {
  const columns = require("./nordic/beach-state.js").coastalColumnCount(radius, false, false);
  const arcCell = Math.PI * 2 * radius * 0.92 / columns;
  assert.ok(Math.abs(arcCell - 0.30) <= 0.025, `coastal arc cell out of tolerance for r=${radius}: ${arcCell}`);
}
assert.equal(require("./nordic/beach-state.js").coastalColumnCount(60, false, false), 1152);
assert.equal(require("./nordic/beach-state.js").coastalColumnCount(60, true, true), 256);
assert.equal(require("./nordic/beach-state.js").coastalColumnCount(60, true, false), 512);

const coast = createCoastalGrid({ radius: 60, columns: 1152, rows: 64 });
assert.equal(coast.size, 73728);
assert.ok(Math.abs(coast.metersPerCell(32).tangential - 0.301) < 0.003);
assert.ok(Math.abs(coast.metersPerCell(32).radial - 0.3143) < 0.002);
const untouched = coast.index(20, 20);
assert.equal(coast.stepCell(untouched, 0, 1).wetness, 0);
assert.equal(coast.reachedWater[untouched], 0);
const wet = coast.index(20, 21);
coast.stepCell(wet, 1, 0.8, { drySeconds: 32, foamSeconds: 6 });
assert.equal(coast.reachedWater[wet], 1);
assert.ok(coast.wetness[wet] > 235);
const retreat = coast.stepCell(wet, 0, 0.1, { drySeconds: 32, foamSeconds: 6 });
assert.equal(retreat.retreated, true);
assert.ok(retreat.foam > 0);
const beforeDry = coast.wetness[wet];
coast.stepCell(wet, 0, 10, { drySeconds: 32, foamSeconds: 6 });
assert.ok(coast.wetness[wet] < beforeDry);
assert.equal(coast.wetness[untouched], 0);
assert.equal(coast.reachedWater[untouched], 0);

const atlas = createFootprintAtlas({ size: 512, worldSize: 16 });
assert.ok(Math.abs(atlas.pixelSize - 0.03125) < 1e-12);
atlas.recenter(0, 0);
assert.equal(atlas.stamp(0, 0, 0, 0.9, 400), true);
assert.ok(atlas.sample(0, 0) > 0);
assert.equal(atlas.sampleTick(0, 0), 400);
const before = atlas.sample(0, 0);
const storage = atlas.values;
atlas.recenter(0.1, 0);
assert.equal(atlas.values, storage, "toroidal recenter must reuse the same backing array");
assert.ok(Math.abs(atlas.sample(0, 0) - before) < 0.02, "recenter must preserve the same world-space footprint");
assert.ok(atlas.activePixels() > 0);
assert.notEqual(atlas.ringOffsetX, 0);
atlas.eraseRect(0, 0, 0.35, 0.35);
assert.equal(atlas.sample(0, 0), 0);
assert.equal(atlas.activePixels(), 0);
atlas.stamp(0.2, 0.2, 0.3, 0.8, 800);
assert.ok(atlas.sample(0.2, 0.2) > 0);
assert.equal(typeof atlas.decay, "undefined", "atlas lifetime fade must not mutate/upload the texture each frame");
const atlasBytes = atlas.textureData();
assert.equal(atlasBytes.length, 512 * 512 * 4);
assert.equal(atlas.sampleTick(0.2, 0.2), 800);
console.log("BeachState tests passed.");
