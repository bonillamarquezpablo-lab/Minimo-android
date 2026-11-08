(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NorseBeachState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const smooth01 = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

  function coastalColumnCount(radius, performanceMode, constrainedMobile) {
    if (performanceMode) return constrainedMobile ? 256 : 512;
    const meanCoastRadius = Math.max(1, Number(radius) || 1) * 0.92;
    const target = (Math.PI * 2 * meanCoastRadius) / 0.30;
    const rounded = Math.round(target / 64) * 64;
    return Math.max(512, Math.min(2048, rounded));
  }

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
    // Continuous world-space read: bilinear in radius and wrapped shoreline angle.
    // This avoids snapping foot interaction and humidity queries to a single coastal texel.
    function sampleWetnessBilinear(x, z, centerX, centerZ) {
      const dx = Number(x) - Number(centerX || 0), dz = Number(z) - Number(centerZ || 0);
      const radial = Math.hypot(dx, dz);
      const rowCoord = (radial - innerRadius) / radialStep;
      if (!Number.isFinite(rowCoord) || rowCoord < 0 || rowCoord > rows - 1) return 0;
      const angle = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2);
      const colCoord = angle / (Math.PI * 2) * columns;
      const row0 = Math.floor(rowCoord), row1 = Math.min(rows - 1, row0 + 1);
      const col0 = Math.floor(colCoord) % columns, col1 = (col0 + 1) % columns;
      const tx = colCoord - Math.floor(colCoord), ty = rowCoord - row0;
      const a = wetness[row0 * columns + col0] / 255;
      const b = wetness[row0 * columns + col1] / 255;
      const c = wetness[row1 * columns + col0] / 255;
      const d = wetness[row1 * columns + col1] / 255;
      const top = a + (b - a) * tx, bottom = c + (d - c) * tx;
      return clamp01(top + (bottom - top) * ty);
    }
    function writeTextureCell(cell) {
      const p = cell * 4;
      rgba[p] = wetness[cell]; rgba[p + 1] = foam[cell];
      rgba[p + 2] = water[cell]; rgba[p + 3] = 255;
    }
    function stepCell(cell, waterCoverage, dt, config) {
      if (cell < 0 || cell >= size) throw new RangeError("Coastal cell is outside the grid.");
      const cfg = config || {}, elapsed = Math.max(0, Math.min(120, Number(dt) || 0));
      const cover = clamp01(waterCoverage), previous = water[cell] / 255;
      const drySeconds = Math.max(1, Number(cfg.drySeconds) || 32);
      const foamSeconds = Math.max(0.5, Number(cfg.foamSeconds) || 6);
      const deposit = clamp01(cfg.foamDeposit === undefined ? 0.68 : cfg.foamDeposit);
      let wet = wetness[cell] / 255;
      let foamValue = (foam[cell] / 255) * Math.exp(-elapsed / foamSeconds);
      const submerged = cover > 0.08, flooded = submerged && previous <= 0.08, retreated = previous > 0.55 && cover < 0.12;
      if (submerged) {
        reachedWater[cell] = 1;
        wet = Math.max(wet, 1 - (1 - wet) * Math.exp(-elapsed / 0.18));
        if (previous < 0.12 && cover > 0.12) {
          const leadingLace = deposit * 0.16 * Math.sin(Math.PI * cover);
          foamValue = Math.max(foamValue, leadingLace);
        }
      } else if (reachedWater[cell]) {
        wet *= Math.exp(-elapsed / drySeconds);
        if (wet < 0.003) { wet = 0; reachedWater[cell] = 0; }
      } else wet = 0;
      if (retreated) foamValue = Math.max(foamValue, deposit * Math.max(0.35, previous));
      water[cell] = Math.round(cover * 255);
      wetness[cell] = Math.round(clamp01(wet) * 255);
      foam[cell] = Math.round(clamp01(foamValue) * 255);
      writeTextureCell(cell);
      return { submerged, flooded, retreated, wetness: wetness[cell] / 255, foam: foam[cell] / 255 };
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
      sampleWetness, sampleWetnessBilinear, stepCell, decay, exportTexture: () => rgba
    };
  }

  function createFootprintAtlas(options) {
    const opts = options || {};
    const size = Math.max(64, Math.floor(Number(opts.size) || 512));
    const worldSize = Math.max(1, Number(opts.worldSize) || 16);
    const pixelSize = worldSize / size;
    let originX = 0, originZ = 0, ringOffsetX = 0, ringOffsetZ = 0;
    let initialized = false, dirty = true;
    const values = new Uint8Array(size * size);
    const stampTicks = new Uint16Array(size * size);
    const rgba = new Uint8Array(size * size * 4);
    const wrap = value => ((value % size) + size) % size;
    const logicalCell = (x, z) => ({
      x: Math.floor((x - originX) / pixelSize),
      z: Math.floor((z - originZ) / pixelSize)
    });
    const physicalIndex = (x, z) => wrap(z + ringOffsetZ) * size + wrap(x + ringOffsetX);
    function clearLogicalCell(x, z) {
      const cell = physicalIndex(x, z);
      values[cell] = 0;
      stampTicks[cell] = 0;
    }
    function recenter(x, z) {
      const nextX = Math.floor((Number(x) - worldSize * 0.5) / pixelSize) * pixelSize;
      const nextZ = Math.floor((Number(z) - worldSize * 0.5) / pixelSize) * pixelSize;
      if (!initialized) {
        originX = nextX;
        originZ = nextZ;
        initialized = true;
        dirty = true;
        return true;
      }
      const shiftX = Math.round((nextX - originX) / pixelSize);
      const shiftZ = Math.round((nextZ - originZ) / pixelSize);
      if (!shiftX && !shiftZ) return false;
      originX = nextX;
      originZ = nextZ;
      ringOffsetX = wrap(ringOffsetX + shiftX);
      ringOffsetZ = wrap(ringOffsetZ + shiftZ);
      if (Math.abs(shiftX) >= size || Math.abs(shiftZ) >= size) {
        values.fill(0);
        stampTicks.fill(0);
      } else {
        if (shiftX > 0) {
          const first = size - shiftX;
          for (let zCell = 0; zCell < size; zCell++)
            for (let xCell = first; xCell < size; xCell++) clearLogicalCell(xCell, zCell);
        } else if (shiftX < 0) {
          const last = -shiftX;
          for (let zCell = 0; zCell < size; zCell++)
            for (let xCell = 0; xCell < last; xCell++) clearLogicalCell(xCell, zCell);
        }
        if (shiftZ > 0) {
          const first = size - shiftZ;
          for (let zCell = first; zCell < size; zCell++)
            for (let xCell = 0; xCell < size; xCell++) clearLogicalCell(xCell, zCell);
        } else if (shiftZ < 0) {
          const last = -shiftZ;
          for (let zCell = 0; zCell < last; zCell++)
            for (let xCell = 0; xCell < size; xCell++) clearLogicalCell(xCell, zCell);
        }
      }
      dirty = true;
      return true;
    }
    function stamp(x, z, heading, strength, currentTick) {
      if (!initialized) recenter(x, z);
      const power = Math.round(clamp01(strength === undefined ? 0.85 : strength) * 255);
      const tick = wrapTick(currentTick);
      const c = Math.cos(heading || 0), s = Math.sin(heading || 0);
      const halfWidth = 0.155, halfLength = 0.245;
      const radius = Math.ceil(halfLength / pixelSize) + 1;
      const center = logicalCell(x, z);
      let changed = false;
      for (let py = Math.max(0, center.z - radius); py <= Math.min(size - 1, center.z + radius); py++) {
        for (let px = Math.max(0, center.x - radius); px <= Math.min(size - 1, center.x + radius); px++) {
          const wx = originX + (px + 0.5) * pixelSize - x;
          const wz = originZ + (py + 0.5) * pixelSize - z;
          const localX = wx * c - wz * s, localZ = wx * s + wz * c;
          const longitudinal = localZ / halfLength;
          // Viking boot silhouette: narrower arch, rounded heel, broad forefoot,
          // and five individually rounded toe lobes rather than one oval stamp.
          let halfWidthAtZ;
          if (longitudinal < -0.48) halfWidthAtZ = 0.083 + 0.022 * smooth01((longitudinal + 1) / 0.52);
          else if (longitudinal < 0.08) halfWidthAtZ = 0.105 - 0.032 * smooth01((longitudinal + 0.48) / 0.56);
          else halfWidthAtZ = 0.073 + 0.072 * smooth01((longitudinal - 0.08) / 0.55);
          const bodyDistance = Math.max(Math.abs(localX) / halfWidthAtZ, Math.abs(localZ) / (halfLength * 0.76));
          const toeOffsets = [-0.104, -0.052, 0, 0.052, 0.104];
          const toeCenters = [0.170, 0.198, 0.218, 0.194, 0.160];
          const toeRadii = [0.026, 0.030, 0.033, 0.029, 0.024];
          let toeDistance = Infinity;
          for (let toe = 0; toe < toeOffsets.length; toe++) {
            const tx = localX - toeOffsets[toe], tz = localZ - toeCenters[toe];
            toeDistance = Math.min(toeDistance, Math.hypot(tx / toeRadii[toe], tz / 0.048));
          }
          const distance = Math.min(bodyDistance, toeDistance);
          if (distance > 1.12) continue;
          const edge = 1 - smooth01((distance - 0.72) / 0.40);
          const archGroove = longitudinal > -0.38 && longitudinal < 0.20 && Math.abs(localX) < 0.050 ? 0.82 : 1;
          const raisedRim = Math.exp(-Math.pow((distance - 0.92) / 0.075, 2)) * 0.18;
          const value = Math.round(power * clamp01(edge * archGroove + raisedRim));
          const cell = physicalIndex(px, py);
          if (value > 0 && value >= values[cell]) {
            values[cell] = value;
            stampTicks[cell] = tick;
            changed = true;
          }
        }
      }
      dirty = dirty || changed;
      return changed;
    }
    function eraseRect(x, z, halfWidth, halfDepth) {
      const min = logicalCell(x - halfWidth, z - halfDepth);
      const max = logicalCell(x + halfWidth, z + halfDepth);
      let changed = false;
      for (let row = Math.max(0, min.z); row <= Math.min(size - 1, max.z); row++) {
        for (let col = Math.max(0, min.x); col <= Math.min(size - 1, max.x); col++) {
          const cell = physicalIndex(col, row);
          if (values[cell] || stampTicks[cell]) {
            values[cell] = 0;
            stampTicks[cell] = 0;
            changed = true;
          }
        }
      }
      dirty = dirty || changed;
      return changed;
    }
    function textureData() {
      if (dirty) {
        for (let i = 0; i < values.length; i++) {
          const p = i * 4;
          rgba[p] = values[i];
          rgba[p + 1] = stampTicks[i] & 255;
          rgba[p + 2] = (stampTicks[i] >>> 8) & 255;
          rgba[p + 3] = values[i] ? 255 : 0;
        }
        dirty = false;
      }
      return rgba;
    }
    function sample(x, z) {
      const cell = logicalCell(x, z);
      if (cell.x < 0 || cell.z < 0 || cell.x >= size || cell.z >= size) return 0;
      return values[physicalIndex(cell.x, cell.z)] / 255;
    }
    function sampleTick(x, z) {
      const cell = logicalCell(x, z);
      if (cell.x < 0 || cell.z < 0 || cell.x >= size || cell.z >= size) return 0;
      return stampTicks[physicalIndex(cell.x, cell.z)];
    }
    function activePixels() {
      let count = 0;
      for (let i = 0; i < values.length; i++) if (values[i]) count++;
      return count;
    }
    return {
      size, worldSize, pixelSize, values, stampTicks,
      get originX() { return originX; },
      get originZ() { return originZ; },
      get ringOffsetX() { return ringOffsetX; },
      get ringOffsetZ() { return ringOffsetZ; },
      get initialized() { return initialized; },
      recenter, stamp, eraseRect, sample, sampleTick, textureData, activePixels,
      dimensions: () => ({ size, worldSize, pixelSize, originX, originZ, ringOffsetX, ringOffsetZ })
    };
  }
  function wrapTick(value) {
    const numeric = Math.floor(Number(value) || 0);
    return ((numeric % 65536) + 65536) % 65536;
  }

  return { createCoastalGrid, createFootprintAtlas, coastalColumnCount, smooth01 };
});
