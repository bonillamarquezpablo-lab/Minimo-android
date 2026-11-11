'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require(path.join(__dirname, 'nordic', 'atmosphere-system.js'));
const Atmosphere = global.NorseAtmosphereSystem;
assert.equal(typeof Atmosphere, 'function', 'NorseAtmosphereSystem must export a constructor');

const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;
assert.equal(Atmosphere.normalizeTime(25), 1, 'Hours above 24 must wrap to the next day');
assert.equal(Atmosphere.normalizeTime(-1), 23, 'Negative hours must wrap to the previous day');
assert.equal(Atmosphere.normalizeTime(48), 0, 'Two full days must wrap to midnight');

const dawn = Atmosphere.computeSolarState(6);
const noon = Atmosphere.computeSolarState(12);
const dusk = Atmosphere.computeSolarState(18);
const midnight = Atmosphere.computeSolarState(0);
assert.ok(Math.abs(dawn.altitude) < 1e-6, 'Sunrise must occur at the horizon');
assert.ok(noon.altitude > 0.99, 'The sun must reach a high noon position');
assert.ok(Math.abs(dusk.altitude) < 1e-6, 'Sunset must occur at the horizon');
assert.ok(midnight.altitude < -0.99, 'The sun must be below the horizon at midnight');
assert.ok(noon.daylight > 0.99 && noon.night < 0.01, 'Noon must be full daylight');
assert.ok(midnight.night > 0.99 && midnight.daylight < 0.01, 'Midnight must be full night');
assert.ok(dawn.twilight > 0.8 && dusk.twilight > 0.8, 'Dawn and dusk must contain twilight');
assert.ok(dawn.sunDirection.y > -0.01 && noon.sunDirection.y > 0.99);
assert.ok(dusk.sunDirection.y > -0.01 && midnight.sunDirection.y < -0.99);

assert.ok(near(Atmosphere.advanceTime(10, 150, 300, 1), 22), '150 seconds must advance half of a five-minute game day');
assert.ok(near(Atmosphere.advanceTime(22, 150, 300, 1), 10), 'The day clock must wrap after midnight');
assert.ok(near(Atmosphere.advanceTime(10, 150, 300, 2), 10), 'Double speed must advance a full 24-hour cycle');
assert.ok(near(Atmosphere.advanceTime(10, 0, 300, 1), 10), 'A paused/zero-delta update must preserve time');

const source = fs.readFileSync(path.join(__dirname, 'nordic', 'atmosphere-system.js'), 'utf8');
for (const marker of [
  'VolumetricLightScatteringPostProcess',
  'CascadedShadowGenerator',
  'bloomEnabled = enabled',
  'NorseNightHearthPool_',
  'cloudLayerA',
  'cloudLayerB',
  'starsMap',
  'NorseMoonDirectionalLight',
  'setWeather(value)',
  'setClimate(value)'
]) {
  assert.ok(source.includes(marker), 'Atmosphere module is missing: ' + marker);
}
assert.ok(source.includes('never hardware ray tracing'), 'The WebGL runtime must explicitly describe its lighting effects as approximations.');
assert.ok(source.includes('const enabled = true;') && source.includes('pipeline.bloomEnabled = enabled;'), 'Bloom must remain enabled with a reduced low-profile kernel rather than disappear.');

const buildSource = fs.readFileSync(path.join(__dirname, 'build_site.py'), 'utf8');
const sourceHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(sourceHtml.includes('B.DefaultRenderingPipeline'), 'The game must provide the existing default rendering pipeline to the atmosphere system.');
assert.ok(buildSource.includes('scripts/nordic/atmosphere-system.js'), 'The atmosphere runtime must be packaged.');
assert.ok(buildSource.includes('atmosphere_tag = \'<script src="./scripts/nordic/atmosphere-system.js"></script>\''), 'The atmosphere runtime must load synchronously before the main game script.');
assert.ok(buildSource.includes('html.index(atmosphere_tag) > html.index(game_runtime_marker)'), 'The atmosphere module must precede the monolithic game runtime.');
assert.ok(buildSource.includes('if(atmosphereSystem)atmosphereSystem.update(dt);'),
  'The single atmosphere clock must update from the world loop');
assert.ok(buildSource.includes('setTime:value=>atmosphereSystem.setTime(value)') &&
  buildSource.includes('setDayDuration:value=>atmosphereSystem.setDayDuration(value)') &&
  buildSource.includes('setWeather:value=>atmosphereSystem.setWeather(value)'),
  'Time, duration and weather controls must be exposed to diagnostics');

console.log('OK unified atmosphere: 24-hour solar arc, twilight, moon/night state, configurable 300-second clock, layered clouds, stars, optional god rays, bloom, adaptive shadows and pooled hearth lighting.');
