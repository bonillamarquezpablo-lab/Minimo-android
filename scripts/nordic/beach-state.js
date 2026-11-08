(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NorseBeachState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const smooth01 = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

  function createCoastalGrid(options) {
    const opts = options || {};
    const radius = Math.max(1, Number(opts.radius) || 1);
    const columns = Math.max(32, Math.floor(Number(opts.columns) || 512));
    const rows = Math.max(4, Math.floor(Number(opts.rows) || 64));
    const innerRatio = Number.isFinite(opts.innerRatio) ? opts.innerRatio : 0.755;
    const outerRatio = Number.isFinite(opts.outerRatio) ? opts.outerRatio : 1.085;
    const innerRadius = radius * innerRatio, outerRadius = radius * outerRatio;
    const radialStep = (outerRadius - innerRadius) / (rows - 1), size = columns * rows;
    const water = new Uint8Array(size), wetness = new Uint8Array(size);
    const foam = new Uint8Array(size), reachedWater = new Uint8Array(size);
    const rgba = new Uint8Array(size * 4), rowRadius = new Float32Array(rows);
    for (let row = 0; row < rows; row++) rowRadius[row] = innerRadius + row * radialStep;

    function index(row, column) {
      const c = ((Math.floor(column) % columns) + columns) % columns;
      const r = Math.max(0, Math.min(rows - 1, Math.floor(row)));
      return r * columns + c;
    }
    function metersPerCell(row) {
      const r = rowRadius[Math.max(0, Math.min(rows - 1, Math.floor(row)))];
      return { tangential: (Math.PI * 2 * r) / columns, radial: radialStep };
    }
    function worldToCell(x, z, centerX, centerZ) {
      const dx = Number(x) - Number(centerX || 0), dz = Number(z) - Number(centerZ || 0);
      const radial = Math.hypot(dx, dz), angle = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2);
      const col = Math.floor(angle / (Math.PI * 2) * columns);
      const row = Math.round((radial - innerRadius) / radialStep);
      return row < 0 || row >= rows ? -1 : index(row, col);
    }
    function sampleWetness(x, z, centerX, centerZ) {
      const cell = worldToCell(x, z, centerX, centerZ);
      return cell < 0 ? 0 : wetness[cell] / 255;
    }
    function writeTextureCell(cell) {
      const p = cell * 4;
      rgba[p] = wetness[cell]; rgba[p + 1] = foam[cell];
      rgba[p + 2] = water[cell]; rgba[p + 3] = 255;
    }
    function stepCell(cell, waterCoverage, dt, config) {
      if (cell < 0 || cell >= size) throw new RangeError("Coastal cell is outside the grid.");
      const cfg = config || {}, elapsed = Math.max(0, Math.min(2, Number(dt) || 0));
      const cover = clamp01(waterCoverage), previous = water[cell] / 255;
      const drySeconds = Math.max(1, Number(cfg.drySeconds) || 32);
      const foamSeconds = Math.max(0.5, Number(cfg.foamSeconds) || 6);
      const deposit = clamp01(cfg.foamDeposit === undefined ? 0.68 : cfg.foamDeposit);
      let wet = wetness[cell] / 255;
      let foamValue = (foam[cell] / 255) * Math.exp(-elapsed / foamSeconds);
      const submerged = cover > 0.08, retreated = previous > 0.55 && cover < 0.12;
      if (submerged) {
        reachedWater[cell] = 1;
        wet = Math.max(wet, 1 - (1 - wet) * Math.exp(-elapsed / 0.18));
      } else if (reachedWater[cell]) {
        wet *= Math.exp(-elapsed / drySeconds);
        if (wet < 0.003) { wet = 0; reachedWater[cell] = 0; }
      } else wet = 0;
      if (retreated) foamValue = Math.max(foamValue, deposit * Math.max(0.35, previous));
      water[cell] = Math.round(cover * 255);
      wetness[cell] = Math.round(clamp01(wet) * 255);
      foam[cell] = Math.round(clamp01(foamValue) * 255);
      writeTextureCell(cell);
      return { submerged, retreated, wetness: wetness[cell] / 255, foam: foam[cell] / 255 };
    }
    function decay(elapsed, config) {
      const cfg = config || {}, dt = Math.max(0, Math.min(2, Number(elapsed) || 0));
      const dry = Math.exp(-dt / Math.max(1, Number(cfg.drySeconds) || 32));
      const foamFade = Math.exp(-dt / Math.max(0.5, Number(cfg.foamSeconds) || 6));
      let changed = false;
      for (let i = 0; i < size; i++) {
        if (water[i]) continue;
        const oldWet = wetness[i], oldFoam = foam[i];
        if (reachedWater[i]) {
          const next = Math.round(oldWet * dry);
          wetness[i] = next;
          if (next < 1) reachedWater[i] = 0;
        }
        foam[i] = Math.round(oldFoam * foamFade);
        if (oldWet !== wetness[i] || oldFoam !== foam[i]) { writeTextureCell(i); changed = true; }
      }
      return changed;
    }
    return {
      radius, columns, rows, size, innerRadius, outerRadius, radialStep, rowRadius,
      water, wetness, foam, reachedWater, rgba, index, metersPerCell, worldToCell,
      sampleWetness, stepCell, decay, exportTexture: () => rgba
    };
  }

  function createFootprintAtlas(options) {
    const opts = options || {}, size = Math.max(64, Math.floor(Number(opts.size) || 512));
    const worldSize = Math.max(1, Number(opts.worldSize) || 16), pixelSize = worldSize / size;
    let originX = 0, originZ = 0, initialized = false, dirty = true;
    let values = new Uint8Array(size * size);
    const rgba = new Uint8Array(size * size * 4);
    function worldCell(x, z) { return { x: Math.floor((x - originX) / pixelSize), z: Math.floor((z - originZ) / pixelSize) }; }
    function recenter(x, z) {
      const nextX = Math.floor((Number(x) - worldSize * 0.5) / pixelSize) * pixelSize;
      const nextZ = Math.floor((Number(z) - worldSize * 0.5) / pixelSize) * pixelSize;
      if (!initialized) { originX = nextX; originZ = nextZ; initialized = true; dirty = true; return true; }
      const shiftX = Math.round((nextX - originX) / pixelSize), shiftZ = Math.round((nextZ - originZ) / pixelSize);
      if (!shiftX && !shiftZ) return false;
      const next = new Uint8Array(size * size);
      for (let row = 0; row < size; row++) {
        const oldRow = row + shiftZ;
        if (oldRow < 0 || oldRow >= size) continue;
        const sourceX = Math.max(0, shiftX), destinationX = Math.max(0, -shiftX);
        const count = Math.min(size - sourceX, size - destinationX);
        if (count > 0) next.set(values.subarray(oldRow * size + sourceX, oldRow * size + sourceX + count), row * size + destinationX);
      }
      values = next; originX = nextX; originZ = nextZ; dirty = true; return true;
    }
    function stamp(x, z, heading, strength) {
      if (!initialized) recenter(x, z);
      const power = Math.round(clamp01(strength === undefined ? 0.85 : strength) * 255);
      const c = Math.cos(heading || 0), s = Math.sin(heading || 0);
      const halfWidth = 0.155, halfLength = 0.245, radius = Math.ceil(halfLength / pixelSize) + 1;
      const center = worldCell(x, z); let changed = false;
      for (let py = Math.max(0, center.z - radius); py <= Math.min(size - 1, center.z + radius); py++) {
        for (let px = Math.max(0, center.x - radius); px <= Math.min(size - 1, center.x + radius); px++) {
          const wx = originX + (px + 0.5) * pixelSize - x, wz = originZ + (py + 0.5) * pixelSize - z;
          const localX = wx * c - wz * s, localZ = wx * s + wz * c;
          const taper = 0.82 + 0.18 * smooth01((localZ / halfLength + 1) * 0.5);
          const lateral = Math.abs(localX) / (halfWidth * taper), longitudinal = Math.abs(localZ) / halfLength;
          const distance = lateral * lateral + longitudinal * longitudinal;
          if (distance > 1) continue;
          const edge = 1 - smooth01((distance - 0.66) / 0.34);
          const groove = (Math.abs(localX) < halfWidth * 0.12 && localZ < halfLength * 0.68 && localZ > -halfLength * 0.55) ? 0.72 : 1;
          const value = Math.round(power * edge * groove), cell = py * size + px;
          if (value > values[cell]) { values[cell] = value; changed = true; }
        }
      }
      dirty = dirty || changed; return changed;
    }
    function eraseRect(x, z, halfWidth, halfDepth) {
      const min = worldCell(x - halfWidth, z - halfDepth), max = worldCell(x + halfWidth, z + halfDepth);
      let changed = false;
      for (let row = Math.max(0, min.z); row <= Math.min(size - 1, max.z); row++) {
        for (let col = Math.max(0, min.x); col <= Math.min(size - 1, max.x); col++) {
          const cell = row * size + col;
          if (values[cell]) { values[cell] = 0; changed = true; }
        }
      }
      dirty = dirty || changed; return changed;
    }
    function decay(dt, seconds) {
      const factor = Math.exp(-Math.max(0, Number(dt) || 0) / Math.max(1, Number(seconds) || 105));
      let changed = false;
      for (let i = 0; i < values.length; i++) {
        const old = values[i]; if (!old) continue;
        values[i] = Math.round(old * factor); changed = true;
      }
      dirty = dirty || changed; return changed;
    }
    function textureData() {
      if (dirty) {
        for (let i = 0; i < values.length; i++) {
          const p = i * 4; rgba[p] = 42; rgba[p + 1] = 30; rgba[p + 2] = 20; rgba[p + 3] = values[i];
        }
        dirty = false;
      }
      return rgba;
    }
    function sample(x, z) {
      const cell = worldCell(x, z);
      if (cell.x < 0 || cell.z < 0 || cell.x >= size || cell.z >= size) return 0;
      return values[cell.z * size + cell.x] / 255;
    }
    return {
      size, worldSize, pixelSize, get values() { return values; },
      get originX() { return originX; }, get originZ() { return originZ; },
      get initialized() { return initialized; }, recenter, stamp, eraseRect, decay,
      sample, textureData, markDirty: () => { dirty = true; },
      dimensions: () => ({ size, worldSize, pixelSize, originX, originZ })
    };
  }
  return { createCoastalGrid, createFootprintAtlas, smooth01 };
});
