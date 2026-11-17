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
const duskLighting = Atmosphere.computeLightingProfile(18);
const deepNightLighting = Atmosphere.computeLightingProfile(0);
const reusableState = { sunDirection: { x: 0, y: 0, z: 0 } };
assert.equal(Atmosphere.computeSolarState(12, reusableState), reusableState, 'Solar state must support allocation-free updates.');
assert.ok(duskLighting.hemisphereIntensity >= 0.78 && duskLighting.exposure >= 1.22, 'Sunset must keep settlement materials readable without flattening the dusk palette.');
assert.ok(deepNightLighting.hemisphereIntensity >= 0.76, 'Night ambient fill must preserve terrain and tree silhouettes.');
assert.ok(deepNightLighting.environmentIntensity >= 0.53 && deepNightLighting.exposure >= 1.29, 'Night image-based light and exposure must preserve readable architecture.');

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
assert.ok(near(Atmosphere.advanceElapsed(10, 1, 2), 12), 'Clouds, aurora and hearth flicker must follow doubled simulation speed');
assert.ok(near(Atmosphere.advanceElapsed(10, 1, 1), 11), 'Atmospheric animation time must follow the normal simulation clock');
assert.ok(near(Atmosphere.advanceElapsed(10, 1, 0), 10), 'Atmospheric animations must freeze when day speed is zero');

const source = fs.readFileSync(path.join(__dirname, 'nordic', 'atmosphere-system.js'), 'utf8');
for (const marker of [
  'VolumetricLightScatteringPostProcess',
  'CascadedShadowGenerator',
  'bloomEnabled = enabled',
  'NorseNightHearthPool_',
  'cloudLayerA',
  'cloudLayerB',
  'starsMap',
  'norseSunSurfaceVertexShader',
  'norseSunSurfaceFragmentShader',
  'NorseSunSurfaceMaterial',
  'limbDarkening',
  'granulationA',
  'this._moonDirectColor',
  'this._moonDirectSpecularColor',
  'setWeather(value)',
  'setClimate(value)'
]) {
  assert.ok(source.includes(marker), 'Atmosphere module is missing: ' + marker);
}
assert.ok(source.includes('const useMoonDirectLight = state.night > state.daylight;') &&
  source.includes('this.sunLight.direction.x = directX') &&
  source.includes('this.sunLight.intensity = useMoonDirectLight') &&
  !source.includes("new B.DirectionalLight('NorseMoonDirectionalLight'"),
  'Sun and moon must share one continuously enabled directional slot without swapping shader-light variants at dusk.');

const sunSurfaceBody=source.slice(source.indexOf('    _createSunSurfaceMaterial() {'),source.indexOf('    _createMoonAndLights() {'));
assert.ok(sunSurfaceBody.includes("this.sunDisc.material = material")&&sunSurfaceBody.includes("attributes: ['position', 'normal']"),"The sun must reuse its existing disc and compute a procedural photosphere from its surface normals.");
assert.doesNotMatch(sunSurfaceBody,/MeshBuilder|new B\.(?:PointLight|DirectionalLight)/,"The realistic sun must not add meshes or lights.");
assert.equal((sunSurfaceBody.match(/\.join\('\\n'\);/g)||[]).length,2,"Both GLSL shader sources must use real newline separators.");
assert.doesNotMatch(sunSurfaceBody,/\.join\('\\\\n'\);/,"GLSL shader sources must not contain literal backslash-n sequences.");
assert.ok(source.includes("material.setColor3('sunColor', sunColor)")&&source.includes("material.setFloat('uTime', this.elapsedSeconds)"),"Solar colour and surface evolution must use the existing coalesced atmosphere update.");
assert.ok(source.includes("0.73 + 0.27 * pow(mu, 0.58)")&&source.includes("warmLimb"),"The solar disc must use limb darkening and warm edge response.");

assert.ok(source.includes('focus.x - directX * directDistance') && !source.includes('focus.add(sunVector.scale(180))'), 'Light positioning must not mutate the player or camera target.');
const firePoolBody = source.slice(source.indexOf('    _updateFirePool(state, focus) {'), source.indexOf('    update(dt, force) {'));
assert.ok(source.includes('this._fireCandidates = this.firePool.map(() => ({ h: null, d2: Infinity }))'), 'Night-fire selection must allocate its candidate slots once.');
assert.ok(firePoolBody.includes('const candidates = this._fireCandidates'), 'Night-fire selection must reuse its fixed candidate slots.');
assert.doesNotMatch(firePoolBody, /fireHearths\.filter|\.sort\(/, 'Night-fire updates must not allocate filter/map/sort chains.');
const localFireBody=source.slice(source.indexOf('    _collectHearthMeshes(hearth) {'),source.indexOf('    update(dt, force) {'));
assert.ok(localFireBody.includes('light.includedOnlyMeshes = nextMeshes') &&
  localFireBody.includes('scene.getActiveMeshes'),
  'Each hearth light must use only the already-culled visible meshes inside its physical reach.');
assert.ok(localFireBody.includes('now - this.lastFirePoolUpdate >= 0.75'),
  'Hearth selection and local-light membership must use a bounded cadence.');
assert.ok(localFireBody.includes('Choose and register local fire lights during daytime too') &&
  localFireBody.includes('const activeNight = state.night > 0.18'),
  'Hearth shader slots must be registered before dusk and use intensity, not setEnabled, for the night transition.');
assert.ok(!localFireBody.includes('computeWorldMatrix(true)'),
  'Hearth scoping must not force world-matrix rebuilds across the scene.');
assert.ok(source.includes('this.sunLight.setEnabled(true)'), 'The one directional light must remain enabled across day/night transitions.');

const updateBody = source.slice(source.indexOf('    update(dt, force) {'), source.indexOf('    dispose() {'));
assert.doesNotMatch(updateBody, /new B\.(?:Vector3|Color3|Color4)|B\.Color3\.Lerp/, 'Atmosphere updates must reuse frame-hot vectors and colours.');
assert.ok(source.includes("this._visualUpdateInterval = this.isTouchDevice"), "Mobile atmosphere visual updates must be paced to avoid redundant work.");
assert.ok(source.includes("this._visualUpdateAccumulator += delta") && source.includes("this._visualUpdateAccumulator < this._visualUpdateInterval"), "Atmosphere must preserve the solar clock while coalescing visual updates.");
assert.ok(source.includes("force !== true && this._visualUpdateAccumulator"), "Forced time/weather changes must still update the atmosphere immediately.");
assert.ok(source.includes('advanceElapsed(this.elapsedSeconds, delta, this.speed)'), 'Clouds, aurora and hearth animation must share the day clock speed.');
assert.ok(source.includes('TONEMAPPING_ACES') && source.includes('imageConfig.toneMappingEnabled = true'), 'The unified post-process must enable ACES tone mapping.');
assert.ok(source.includes('B.ShadowGenerator.QUALITY_LOW') && source.includes('previous.usePercentageCloserFiltering = true'), 'Low graphics mode must retain shadows with reduced PCF cost.');
assert.ok(source.includes('never hardware ray tracing'), 'The WebGL runtime must explicitly describe its lighting effects as approximations.');
assert.ok(source.includes("this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;") && source.includes("this.quality === 'mobile-high'"), 'Flagship touch devices must use the dedicated mobile-high tier.');
assert.ok(source.includes("const enabled = this.quality !== 'low';") && source.includes('pipeline.bloomEnabled = enabled;'), 'Bloom must remain active in Quality and be omitted only from the Performance profile.');
assert.ok(source.includes('pipeline.fxaaEnabled = !mobileHigh;'), 'Mobile-high must use native MSAA without an extra FXAA pass.');
assert.ok(source.includes("this.quality === 'high' && !this.isTouchDevice"), 'God rays and SSAO must remain desktop-only.');
assert.ok(source.includes("this.quality === 'low' || this.isTouchDevice"), 'Touch devices must not create the cascaded-shadow multipass.');

const buildSource = fs.readFileSync(path.join(__dirname, 'build_site.py'), 'utf8');
const sourceHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(sourceHtml.includes('B.DefaultRenderingPipeline'), 'The game must provide the existing default rendering pipeline to the atmosphere system.');
assert.ok(buildSource.includes('scripts/nordic/atmosphere-system.js'), 'The atmosphere runtime must be packaged.');
assert.ok(buildSource.includes('atmosphere_tag = \'<script src="./scripts/nordic/atmosphere-system.js"></script>\''), 'The atmosphere runtime must load synchronously before the main game script.');
assert.ok(buildSource.includes('html.index(atmosphere_tag) > html.index(game_runtime_marker)'), 'The atmosphere module must precede the monolithic game runtime.');
assert.ok(buildSource.includes('highHeadroomQualityMobile,reportedMemory'), 'The builder must pass GPU capability into the atmosphere quality selector.');
assert.ok(buildSource.includes('if(atmosphereSystem)atmosphereSystem.update(dt);'),
  'The single atmosphere clock must update from the world loop');
assert.ok(buildSource.includes('setTime:value=>atmosphereSystem.setTime(value)') &&
  buildSource.includes('setDayDuration:value=>atmosphereSystem.setDayDuration(value)') &&
  buildSource.includes('setWeather:value=>atmosphereSystem.setWeather(value)'),
  'Time, duration and weather controls must be exposed to diagnostics');

console.log('OK unified atmosphere: 24-hour solar arc, twilight, moon/night state, configurable 300-second clock, layered clouds, stars, optional god rays, bloom, adaptive shadows and pooled hearth lighting.');
