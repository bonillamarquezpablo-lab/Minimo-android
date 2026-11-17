/* EL SIN NOMBRE — unified Nordic atmosphere system.
 * One timeOfDay clock drives sky, sun, moon, ambient light, fog, clouds,
 * hearth lights, water specular response and optional post effects.
 * WebGL effects here are approximations, never hardware ray tracing.
 */
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const normalizeTime = value => ((Number(value) % 24) + 24) % 24;

  function computeSolarState(value, target) {
    const timeOfDay = normalizeTime(value);
    // 06:00 sunrise, 12:00 solar noon, 18:00 sunset, 00:00 midnight.
    const angle = (timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
    const altitude = Math.sin(angle);
    const length = Math.hypot(Math.cos(angle), altitude, 0.16 * Math.sin(angle * 0.5)) || 1;
    const state = target || {};
    const sunDirection = state.sunDirection || (state.sunDirection = { x: 0, y: 0, z: 0 });
    sunDirection.x = Math.cos(angle) / length;
    sunDirection.y = altitude / length;
    sunDirection.z = (0.16 * Math.sin(angle * 0.5)) / length;
    state.timeOfDay = timeOfDay;
    state.angle = angle;
    state.altitude = altitude;
    state.daylight = smooth(-0.11, 0.19, altitude);
    state.night = 1 - smooth(-0.17, 0.025, altitude);
    state.twilight = clamp(1 - Math.abs(altitude) / 0.34, 0, 1) * (1 - state.night * 0.42);
    return state;
  }

  function computeLightingProfile(state, target) {
    const profile = target || {};
    // Keep daylight readable, but let twilight and moonlight regain real night contrast.
    // The previous ambient floor/exposure flattened the sky and illuminated the whole world at midnight.
    profile.hemisphereIntensity = 0.22 + 0.72 * state.daylight + 0.17 * state.twilight + 0.06 * state.night;
    profile.moonIntensity = 0.34 * state.night;
    profile.environmentIntensity = 0.20 + 0.44 * state.daylight + 0.10 * state.twilight + 0.08 * state.night;
    profile.exposure = 1.00 + 0.05 * state.daylight + 0.07 * state.twilight + 0.015 * state.night;
    profile.contrast = mix(1.07, 1.13, state.night);
    return profile;
  }

  function seededNoiseTexture(B, scene, name, seed, width, height, cloudShape) {
    const texture = new B.DynamicTexture(name, { width, height }, scene, false, B.Texture.BILINEAR_SAMPLINGMODE);
    const ctx = texture.getContext();
    const image = ctx.createImageData(width, height);
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const makeGrid = (gw, gh) => {
      const data = new Float32Array(gw * gh);
      for (let i = 0; i < data.length; i++) data[i] = random();
      return { data, gw, gh };
    };
    const grids = [makeGrid(6, 3), makeGrid(12, 6), makeGrid(24, 12), makeGrid(48, 24), makeGrid(96, 48)];
    const sample = (g, x, y) => {
      const px = x / width * g.gw, py = y / height * g.gh;
      const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
      const at = (ix, iy) => g.data[((iy % g.gh + g.gh) % g.gh) * g.gw + ((ix % g.gw + g.gw) % g.gw)];
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = mix(at(x0, y0), at(x0 + 1, y0), u);
      const b = mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), u);
      return mix(a, b, v);
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = sample(grids[0], x, y) * 0.34 +
          sample(grids[1], x, y) * 0.27 +
          sample(grids[2], x, y) * 0.20 +
          sample(grids[3], x, y) * 0.13 +
          sample(grids[4], x, y) * 0.06;
        const broad = sample(grids[0], x, y) * 0.62 + sample(grids[1], x, y) * 0.38;
        const band = Math.exp(-Math.pow((y / height - 0.46) / (cloudShape ? 0.27 : 0.19), 2));
        const density = n * 0.72 + broad * 0.28 + (band - 0.38) * (cloudShape ? 0.14 : 0.07);
        const alpha = clamp((density - (cloudShape ? 0.43 : 0.55)) * (cloudShape ? 4.1 : 5.4), 0, 0.94);
        const i = (y * width + x) * 4;
        image.data[i] = 226;
        image.data[i + 1] = 234;
        image.data[i + 2] = 238;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    texture.hasAlpha = true;
    texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
    texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
    texture.update(false);
    return texture;
  }

  function createStarTexture(B, scene) {
    const texture = new B.DynamicTexture('NorseAtmosphereStars', { width: 1024, height: 512 }, scene, false, B.Texture.BILINEAR_SAMPLINGMODE);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 1024, 512);
    let seed = 991827;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 470; i++) {
      const x = random() * 1024, y = random() * 512;
      const r = 0.45 + random() * 1.15;
      const a = 0.22 + random() * 0.74;
      ctx.fillStyle = 'rgba(221,232,255,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (i % 37 === 0) {
        ctx.strokeStyle = 'rgba(205,225,255,' + (a * 0.45).toFixed(3) + ')';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y);
        ctx.lineTo(x + 3.5, y);
        ctx.moveTo(x, y - 3.5);
        ctx.lineTo(x, y + 3.5);
        ctx.stroke();
      }
    }
    texture.hasAlpha = true;
    texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
    texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    texture.update(false);
    return texture;
  }

  class AtmosphereSystem {
    constructor(options) {
      const o = options || {};
      this.B = o.B || root.BABYLON;
      this.scene = o.scene;
      this.camera = o.camera;
      this.engine = o.engine;
      this.sunLight = o.sunLight;
      // One directional source is reused for sunlight and moonlight; it never swaps shader light slots at dusk.
      if (this.sunLight && typeof this.sunLight.setEnabled === 'function') this.sunLight.setEnabled(true);
      this.hemiLight = o.hemiLight;
      this.skyDome = o.skyDome;
      this.sunDisc = o.sunDisc;
      this.sunHalo = o.sunHalo;
      this.skyTexture = o.skyTexture || null;
      this.renderPipeline = o.renderPipeline || null;
      this.waterMaterial = o.waterMaterial || null;
      this.windowMaterial = o.windowMaterial || null;
      this.fireHearths = Array.isArray(o.hearths) ? o.hearths : [];
      this.fireLegacyLights = Array.isArray(o.fireLights) ? o.fireLights : [];
      this.focusProvider = typeof o.focusProvider === 'function' ? o.focusProvider : () => this.camera.position;
      this.getShadowGenerator = typeof o.getShadowGenerator === 'function' ? o.getShadowGenerator : () => null;
      this.setShadowGenerator = typeof o.setShadowGenerator === 'function' ? o.setShadowGenerator : () => {};
      this.isPerformanceMode = !!o.isPerformanceMode;
      this.isTouchDevice = !!o.isTouchDevice;
      this.isConstrainedMobile = !!o.isConstrainedMobile;
      this.highHeadroomQualityMobile = !!o.highHeadroomQualityMobile;
      this.reportedMemory = Number(o.reportedMemory) || 0;
      this.quality = this.isPerformanceMode || this.isConstrainedMobile ? 'low' :
        (this.isTouchDevice ? (this.highHeadroomQualityMobile ? 'mobile-high' : 'medium') : 'high');
      this.timeOfDay = normalizeTime(o.timeOfDay == null ? 8.25 : o.timeOfDay);
      this.dayDurationSeconds = clamp(Number(o.dayDurationSeconds) || 300, 60, 3600);
      this.speed = 1;
      this.paused = false;
      this.weather = 'clear';
      this.elapsedSeconds = 0;
      // Unscaled wall-clock for maintenance cadence and hearth flicker when the solar clock is paused.
      this._realElapsedSeconds = 0;
      this._performanceSamples = {
        visual: new Float32Array(120), visualCursor: 0, visualCount: 0, visualLastMs: 0, visualMaxMs: 0,
        fire: new Float32Array(120), fireCursor: 0, fireCount: 0, fireLastMs: 0, fireMaxMs: 0,
        directLight: new Float32Array(120), directLightCursor: 0, directLightCount: 0, directLightLastMs: 0, directLightMaxMs: 0,
        sky: new Float32Array(120), skyCursor: 0, skyCount: 0, skyLastMs: 0, skyMaxMs: 0,
        water: new Float32Array(120), waterCursor: 0, waterCount: 0, waterLastMs: 0, waterMaxMs: 0,
        post: new Float32Array(120), postCursor: 0, postCount: 0, postLastMs: 0, postMaxMs: 0,
        hearthMeshes: 0, hearthRefreshes: 0
      };
      this.windStrength = 1;
      this.baseFogDensity = Number(this.scene.fogDensity) || 0.00058;
      this.fogClimate = 'fjord';
      this.lastFirePoolUpdate = -10;
      this._firePoolNightActive = false;
      this.lastState = null;
      this.moonLight = null;
      this.moonDisc = null;
      this.moonHalo = null;
      this.skyMaterial = null;
      this.cloudA = null;
      this.cloudB = null;
      this.starsTexture = null;
      this.godRays = null;
      this.ssaoPipeline = null;
      this.ssrPipeline = null;
      this.firePool = [];
      this._fireFallbackMeshes = this.skyDome ? [this.skyDome] : [];
      // The solar clock keeps advancing every frame; expensive material/light writes are
      // coalesced to a stable cadence. This keeps night effects without per-frame overhead.
      this._visualUpdateAccumulator = 0;
      this._visualUpdateInterval = this.isTouchDevice
        ? (this.quality === 'mobile-high' ? 1 / 24 : (this.quality === 'medium' ? 1 / 15 : 1 / 12))
        : 1 / 30;
      this.disposed = false;
      // Reuse frame-hot vectors and colours to avoid per-frame garbage collection.
      this._solarState = { sunDirection: { x: 0, y: 0, z: 0 } };
      this._lightingProfile = {};
      this._sunVector = new this.B.Vector3(0, 1, 0);
      this._moonVector = new this.B.Vector3(0, -1, 0);
      this._lightPosition = new this.B.Vector3(0, 0, 0);
      this._sunPoint = new this.B.Vector3(0, 0, 0);
      this._moonPoint = new this.B.Vector3(0, 0, 0);
      this._sunColor = new this.B.Color3(1, 0.94, 0.82);
      this._sunSpecularColor = new this.B.Color3(0.96, 0.91, 0.78);
      this._moonDirectColor = new this.B.Color3(0.48, 0.60, 0.82);
      this._moonDirectSpecularColor = new this.B.Color3(0.30, 0.38, 0.58);
      this._directColor = new this.B.Color3(1, 1, 1);
      this._directSpecularColor = new this.B.Color3(1, 1, 1);
      this._coolNightColor = new this.B.Color3(0.31, 0.39, 0.55);
      this._dayAmbientColor = new this.B.Color3(0.72, 0.82, 0.92);
      this._nightGroundColor = new this.B.Color3(0.145, 0.165, 0.205);
      this._dayGroundColor = new this.B.Color3(0.15, 0.19, 0.13);
      this._horizonDayColor = new this.B.Color3(0.40, 0.59, 0.66);
      this._horizonDuskColor = new this.B.Color3(0.40, 0.19, 0.20);
      this._horizonNightColor = new this.B.Color3(0.020, 0.034, 0.068);
      this._stormFogColor = new this.B.Color3(0.18, 0.22, 0.27);
      this._fogColor = new this.B.Color3(0, 0, 0);
      this._clearColor = new this.B.Color4(0, 0, 0, 1);
      this._waterDayColor = new this.B.Color3(0.70, 0.82, 0.88);
      this._waterDuskColor = new this.B.Color3(0.62, 0.39, 0.31);
      this._waterNightColor = new this.B.Color3(0.18, 0.27, 0.43);
      this._waterColor = new this.B.Color3(0, 0, 0);
      this._waterDiffuseDayColor = new this.B.Color3(0.66, 0.82, 0.87);
      this._waterDiffuseNightColor = new this.B.Color3(0.10, 0.17, 0.28);
      this._waterDiffuseColor = new this.B.Color3(0, 0, 0);
      this._windowGlowColor = new this.B.Color3(0, 0, 0);
      this._fallbackFocus = { x: 0, y: 0, z: 0 };
      this._createSkyResources();
      this._createSunSurfaceMaterial();
      this._createMoonAndLights();
      this._adjustMaterialLightBudgets();
      this._configurePostProcessing();
      this._upgradeShadowsWhenSupported();
      this._createLocalLightPool();
      // Reusable nearest-hearth slots: avoid filter/map/sort garbage during night transitions.
      this._fireCandidates = this.firePool.map(() => ({ h: null, d2: Infinity }));
      this.update(0, true);
      console.info('Norse AtmosphereSystem ready', {
        version: 1, quality: this.quality, timeOfDay: this.timeOfDay,
        dayDurationSeconds: this.dayDurationSeconds, weather: this.weather,
        godRays: !!this.godRays, cascadedShadows: this.shadowMode === 'csm',
        ssao: !!this.ssaoPipeline, ssr: !!this.ssrPipeline
      });
    }

    static normalizeTime(value) { return normalizeTime(value); }
    static computeSolarState(value, target) { return computeSolarState(value, target); }
    static computeLightingProfile(value) { return computeLightingProfile(computeSolarState(value)); }
    static advanceTime(current, dt, dayDurationSeconds, speed) {
      const duration = clamp(Number(dayDurationSeconds) || 300, 1, 86400);
      return normalizeTime(current + Math.max(0, Number(dt) || 0) *
        (Number.isFinite(speed) ? speed : 1) * 24 / duration);
    }
    static advanceElapsed(current, dt, speed) {
      return Math.max(0, Number(current) || 0) +
        Math.max(0, Number(dt) || 0) * clamp(Number(speed) || 0, 0, 32);
    }

    setTime(value) {
      this.timeOfDay = normalizeTime(value);
      this.update(0, true);
      return this.getState();
    }
    setDayDuration(seconds) {
      this.dayDurationSeconds = clamp(Number(seconds) || 300, 60, 3600);
      return this.dayDurationSeconds;
    }
    setSpeed(value) {
      this.speed = clamp(Number(value) || 0, 0, 32);
      return this.speed;
    }
    pause() { this.paused = true; return this.getState(); }
    resume() { this.paused = false; return this.getState(); }
    setWeather(value) {
      const allowed = ['clear', 'overcast', 'fog', 'storm'];
      this.weather = allowed.includes(String(value)) ? String(value) : 'clear';
      this.update(0, true);
      return this.getState();
    }
    setClimate(value) {
      this.fogClimate = value === 'coast' || value === 'open-sea' ? value : 'fjord';
      this.update(0, true);
      return this.getState();
    }
    _recordPerformanceSample(kind, durationMs) {
      const perf = this._performanceSamples;
      const value = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
      const cursorKey = kind + 'Cursor', countKey = kind + 'Count', lastKey = kind + 'LastMs', maxKey = kind + 'MaxMs';
      const samples = perf[kind];
      samples[perf[cursorKey]] = value;
      perf[cursorKey] = (perf[cursorKey] + 1) % samples.length;
      perf[countKey] = Math.min(samples.length, perf[countKey] + 1);
      perf[lastKey] = Number(value.toFixed(3));
      perf[maxKey] = Math.max(perf[maxKey], value);
    }

    getPerformanceSnapshot() {
      const perf = this._performanceSamples;
      const summarize = kind => {
        const count = perf[kind + 'Count'], samples = perf[kind], values = [];
        for (let i = 0; i < count; i++) values.push(samples[i]);
        values.sort((a, b) => a - b);
        const percentile = p => values.length
          ? Number(values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))].toFixed(3))
          : null;
        return { samples: count, lastMs: perf[kind + 'LastMs'], p50Ms: percentile(.50), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: Number(perf[kind + 'MaxMs'].toFixed(3)) };
      };
      return {
        visualUpdate: summarize('visual'),
        hearthSelection: summarize('fire'),
        directLighting: summarize('directLight'),
        skyAndCloudUniforms: summarize('sky'),
        waterMaterial: summarize('water'),
        postProcessing: summarize('post'),
        hearthMeshesLastRefresh: perf.hearthMeshes,
        hearthRefreshes: perf.hearthRefreshes,
        visualUpdateIntervalMs: Number((this._visualUpdateInterval * 1000).toFixed(2))
      };
    }

    getState() {
      const s = this.lastState || computeSolarState(this.timeOfDay);
      return {
        timeOfDay: Number(this.timeOfDay.toFixed(3)),
        dayDurationSeconds: this.dayDurationSeconds,
        speed: this.speed,
        paused: this.paused,
        weather: this.weather,
        quality: this.quality,
        daylight: Number(s.daylight.toFixed(3)),
        twilight: Number(s.twilight.toFixed(3)),
        night: Number(s.night.toFixed(3)),
        shadowMode: this.shadowMode || 'standard',
        godRays: !!this.godRays,
        ssao: !!this.ssaoPipeline,
        ssr: !!this.ssrPipeline,
        visualUpdateIntervalMs: Number((this._visualUpdateInterval * 1000).toFixed(2))
      };
    }

    _createSkyResources() {
      const B = this.B, scene = this.scene;
      if (!B || !scene || !this.skyDome || !B.ShaderMaterial || !B.Effect || !B.MeshBuilder) return;
      try {
        this.cloudA = seededNoiseTexture(B, scene, 'NorseCloudLayerHigh', 73129, 512, 256, true);
        this.cloudB = seededNoiseTexture(B, scene, 'NorseCloudLayerDetail', 91827, 512, 256, false);
        this.starsTexture = createStarTexture(B, scene);
        B.Effect.ShadersStore.norseAtmosphereVertexShader = [
          'precision highp float;',
          'attribute vec3 position;',
          'attribute vec2 uv;',
          'uniform mat4 world;',
          'uniform mat4 worldViewProjection;',
          'varying vec3 vAtmosphereDirection;',
          'varying vec2 vAtmosphereUV;',
          'void main(void) {',
          '  vAtmosphereDirection = normalize(mat3(world) * position);',
          '  vAtmosphereUV = uv;',
          '  gl_Position = worldViewProjection * vec4(position, 1.0);',
          '}'
        ].join('\n');
        B.Effect.ShadersStore.norseAtmosphereFragmentShader = [
          'precision highp float;',
          'varying vec3 vAtmosphereDirection;',
          'varying vec2 vAtmosphereUV;',
          'uniform vec3 sunDirection;',
          'uniform vec3 sunColor;',
          'uniform float dayFactor;',
          'uniform float twilightFactor;',
          'uniform float nightFactor;',
          'uniform float cloudCoverage;',
          'uniform float stormFactor;',
          'uniform float auroraStrength;',
          'uniform float uTime;',
          'uniform sampler2D cloudLayerA;',
          'uniform sampler2D cloudLayerB;',
          'uniform sampler2D starsMap;',
          'void main(void) {',
          '  vec3 dir = normalize(vAtmosphereDirection);',
          '  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
          '  float horizon = smoothstep(0.02, 0.96, h);',
          '  vec3 dayZenith = vec3(0.045, 0.145, 0.285);',
          '  vec3 dayHorizon = vec3(0.30, 0.43, 0.52);',
          '  vec3 nightZenith = vec3(0.0025, 0.006, 0.018);',
          '  vec3 nightHorizon = vec3(0.012, 0.022, 0.042);',
          '  vec3 daySky = mix(dayHorizon, dayZenith, horizon);',
          '  vec3 nightSky = mix(nightHorizon, nightZenith, horizon);',
          '  vec3 sky = mix(nightSky, daySky, dayFactor);',
          '  float mu = clamp(dot(dir, normalize(sunDirection)), -1.0, 1.0);',
          '  float sunElevation = clamp(sunDirection.y, -1.0, 1.0);',
          '  float viewElevation = max(dir.y, 0.0);',
          '  float airMass = clamp(1.0 / max(0.085, viewElevation + 0.10), 1.0, 8.0);',
          '  float rayleighPhase = 0.75 * (1.0 + mu * mu);',
          '  float mieG = 0.76;',
          '  float mieDenominator = pow(max(0.03, 1.0 + mieG * mieG - 2.0 * mieG * mu), 1.5);',
          '  float miePhase = (1.0 - mieG * mieG) / (12.56637 * mieDenominator);',
          '  vec3 rayleighTransmittance = exp(-vec3(0.045, 0.11, 0.24) * airMass);',
          '  vec3 rayleighScatter = (vec3(1.0) - rayleighTransmittance) * vec3(0.18, 0.46, 1.0) * rayleighPhase;',
          '  float aerosolPath = 1.0 - exp(-airMass * 0.10);',
          '  vec3 aerosolTint = mix(vec3(0.84, 0.54, 0.38), vec3(0.72, 0.84, 1.0), smoothstep(-0.14, 0.22, sunElevation));',
          '  float atmosphericDaylight = max(dayFactor, twilightFactor * 0.22);',
          '  sky *= mix(vec3(0.92), rayleighTransmittance, dayFactor * 0.52);',
          '  sky += rayleighScatter * atmosphericDaylight * 0.42;',
          '  sky += aerosolTint * miePhase * aerosolPath * atmosphericDaylight * (0.018 + twilightFactor * 0.035);',
          '  float upperAtmosphere = smoothstep(-0.18, 0.42, sunElevation);',
          '  vec2 horizontalDir = normalize(dir.xz + vec2(0.00001));',
          '  vec2 sunHorizontal = normalize(sunDirection.xz + vec2(0.00001));',
          '  float sunAzimuth = pow(max(dot(horizontalDir, sunHorizontal), 0.0), 6.0);',
          '  float horizonDensity = exp(-abs(dir.y) * 5.2);',
          '  float sunsetAlignment = horizonDensity * sunAzimuth * twilightFactor * (1.0 - smoothstep(-0.10, 0.22, sunElevation));',
          '  sky += vec3(0.94, 0.48, 0.30) * sunsetAlignment * 0.12;',
          '  float aureole = pow(max(mu, 0.0), 18.0) * (0.022 + twilightFactor * 0.035);',
          '  float sunGlow = pow(max(mu, 0.0), 110.0) * (0.18 + twilightFactor * 0.28);',
          '  sky += sunColor * (aureole + sunGlow) * upperAtmosphere * (0.45 + dayFactor * 0.55);',
          '  vec2 uvA = vec2(vAtmosphereUV.x + uTime * 0.000012, vAtmosphereUV.y);',
          '  vec2 uvB = vec2(vAtmosphereUV.x * 1.72 - uTime * 0.000021, vAtmosphereUV.y * 1.18 + uTime * 0.000006);',
          '  float cloud1 = texture2D(cloudLayerA, uvA).a;',
          '  float cloud2 = texture2D(cloudLayerB, uvB).a;',
          '  float clouds = clamp(cloud1 * 0.76 + cloud2 * 0.24, 0.0, 1.0) * cloudCoverage;',
          '  float silverEdge = pow(max(mu, 0.0), 2.8);',
          '  float cloudTopLight = 0.22 + 0.62 * dayFactor + 0.20 * twilightFactor;',
          '  vec3 dayCloud = mix(vec3(0.045, 0.060, 0.085), vec3(0.62, 0.69, 0.73), dayFactor);',
          '  vec3 cloudColor = mix(vec3(0.020, 0.030, 0.050), dayCloud, dayFactor + twilightFactor * 0.14);',
          '  cloudColor = mix(cloudColor, vec3(0.075, 0.085, 0.105), stormFactor * 0.70);',
          '  cloudColor += sunColor * silverEdge * cloudTopLight * (1.0 - stormFactor) * 0.22;',
          '  sky = mix(sky, cloudColor, clouds * (0.32 + 0.40 * (1.0 - stormFactor)));',
          '  vec4 starSample = texture2D(starsMap, vAtmosphereUV);',
          '  sky += starSample.rgb * starSample.a * nightFactor * (1.0 - stormFactor * 0.72) * 1.35;',
          '  float auroraWave = 0.22 + 0.055 * sin(dir.x * 10.0 + uTime * 0.075) + 0.022 * sin(dir.x * 23.0 - uTime * 0.11);',
          '  float auroraBand = 1.0 - smoothstep(0.012, 0.075, abs(dir.y - auroraWave));',
          '  float auroraRibbons = 0.55 + 0.45 * sin(dir.x * 18.0 + uTime * 0.10);',
          '  vec3 auroraColor = mix(vec3(0.10, 0.58, 0.37), vec3(0.12, 0.42, 0.72), 0.5 + 0.5 * sin(dir.x * 4.0 + uTime * 0.04));',
          '  sky += auroraColor * auroraBand * auroraRibbons * auroraStrength * nightFactor * (1.0 - stormFactor);',
          '  float horizonGlow = exp(-abs(dir.y) * 6.0) * twilightFactor * sunAzimuth * 0.035;',
          '  sky += sunColor * vec3(0.28, 0.13, 0.07) * horizonGlow;',
          '  gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);',
          '}'
        ].join('\n');

        const material = new B.ShaderMaterial('NorseAtmosphereSkyMaterial', scene,
          { vertex: 'norseAtmosphere', fragment: 'norseAtmosphere' },
          {
            attributes: ['position', 'uv'],
            uniforms: ['world', 'worldViewProjection', 'sunDirection', 'sunColor', 'dayFactor',
              'twilightFactor', 'nightFactor', 'cloudCoverage', 'stormFactor', 'auroraStrength', 'uTime'],
            samplers: ['cloudLayerA', 'cloudLayerB', 'starsMap']
          });
        material.backFaceCulling = false;
        material.disableDepthWrite = true;
        material.setTexture('cloudLayerA', this.cloudA);
        material.setTexture('cloudLayerB', this.cloudB);
        material.setTexture('starsMap', this.starsTexture);
        this.skyMaterial = material;
        this.skyDome.material = material;
        // Free the former 1536x768 flat sky texture after the shader has replaced it.
        if (this.skyTexture) { this.skyTexture.dispose(); this.skyTexture = null; }
      } catch (error) {
        console.warn('Atmosphere shader unavailable; retaining the authored Nordic sky fallback.', error);
      }
    }

    _createSunSurfaceMaterial() {
      const B = this.B, scene = this.scene;
      if (!this.sunDisc || !B || !B.ShaderMaterial || !B.Effect) return;
      try {
        B.Effect.ShadersStore.norseSunSurfaceVertexShader = [
          'precision highp float;',
          'attribute vec3 position;',
          'attribute vec3 normal;',
          'uniform mat4 world;',
          'uniform mat4 worldView;',
          'uniform mat4 worldViewProjection;',
          'varying vec3 vSunNormalView;',
          'varying vec3 vSunLocalPosition;',
          'void main(void) {',
          '  vSunNormalView = normalize(mat3(worldView) * normal);',
          '  vSunLocalPosition = position;',
          '  gl_Position = worldViewProjection * vec4(position, 1.0);',
          '}'
        ].join('\n');
        B.Effect.ShadersStore.norseSunSurfaceFragmentShader = [
          'precision highp float;',
          'varying vec3 vSunNormalView;',
          'varying vec3 vSunLocalPosition;',
          'uniform vec3 sunColor;',
          'uniform float uTime;',
          'void main(void) {',
          '  float mu = clamp(abs(normalize(vSunNormalView).z), 0.0, 1.0);',
          '  float limbDarkening = 0.73 + 0.27 * pow(mu, 0.58);',
          '  float granulationA = sin(vSunLocalPosition.x * 13.0 + uTime * 0.015) * sin(vSunLocalPosition.y * 17.0 - uTime * 0.011);',
          '  float granulationB = sin((vSunLocalPosition.x + vSunLocalPosition.z) * 29.0 + uTime * 0.009);',
          '  float granulation = 0.988 + granulationA * 0.012 + granulationB * 0.006;',
          '  float warmLimb = pow(1.0 - mu, 2.6);',
          '  vec3 photosphere = mix(vec3(1.0, 0.985, 0.91), vec3(1.0, 0.73, 0.43), warmLimb * 0.34);',
          '  vec3 radiance = photosphere * sunColor * limbDarkening * granulation;',
          '  gl_FragColor = vec4(radiance, 1.0);',
          '}'
        ].join('\n');
        const material = new B.ShaderMaterial('NorseSunSurfaceMaterial', scene,
          { vertex: 'norseSunSurface', fragment: 'norseSunSurface' },
          { attributes: ['position', 'normal'], uniforms: ['world', 'worldView', 'worldViewProjection', 'sunColor', 'uTime'] });
        material.backFaceCulling = false;
        material.disableDepthWrite = true;
        this._originalSunMaterial = this.sunDisc.material;
        this.sunSurfaceMaterial = material;
        this.sunDisc.material = material;
      } catch (error) {
        this.sunSurfaceMaterial = null;
        console.warn('Procedural sun surface unavailable; retaining the existing sun material.', error);
      }
    }

    _createMoonAndLights() {
      const B = this.B, scene = this.scene;
      if (!B || !scene) return;
      try {
        // Lunar direct illumination reuses sunLight so the scene keeps one stable directional-light shader slot.

        if (this.skyDome && B.MeshBuilder && B.StandardMaterial) {
          this.moonDisc = B.MeshBuilder.CreateSphere('NorseMoonDisc', { diameter: 17, segments: 24 }, scene);
          this.moonDisc.parent = this.skyDome;
          this.moonDisc.isPickable = false;
          this.moonDisc.setEnabled(true);
          const moonMaterial = new B.StandardMaterial('NorseMoonMaterial', scene);
          moonMaterial.disableLighting = true;
          moonMaterial.emissiveColor = new B.Color3(0.50, 0.62, 0.86);
          moonMaterial.diffuseColor = new B.Color3(0.13, 0.17, 0.25);
          moonMaterial.specularColor = new B.Color3(0, 0, 0);
          this.moonDisc.material = moonMaterial;

          this.moonHalo = B.MeshBuilder.CreateSphere('NorseMoonHalo', { diameter: 37, segments: 20 }, scene);
          this.moonHalo.parent = this.skyDome;
          this.moonHalo.isPickable = false;
          this.moonHalo.setEnabled(true);
          const halo = new B.StandardMaterial('NorseMoonHaloMaterial', scene);
          halo.disableLighting = true;
          halo.emissiveColor = new B.Color3(0.25, 0.36, 0.60);
          halo.alpha = 0.10;
          halo.backFaceCulling = false;
          this.moonHalo.material = halo;
        }
      } catch (error) {
        console.warn('Moon lighting or disc could not be created.', error);
      }
    }

    _adjustMaterialLightBudgets() {
      const budget = this.quality === 'high' ? 4 : ((this.quality === 'mobile-high' || this.quality === 'medium') ? 3 : 2);
      const affected = /(terrain|grass|wood|stone|roof|hut|window|submergedsand|coastal|village|clan)/i;
      for (const material of this.scene.materials || []) {
        if (!material || !affected.test(String(material.name || ''))) continue;
        if (typeof material.maxSimultaneousLights === 'number') {
          material.maxSimultaneousLights = Math.max(material.maxSimultaneousLights, budget);
        }
      }
    }

    _configurePostProcessing() {
      const B = this.B;
      if (this.renderPipeline) {
        try {
          const pipeline = this.renderPipeline;
          const mobileHigh = this.quality === 'mobile-high';
          const enabled = this.quality !== 'low';
          pipeline.bloomEnabled = enabled;
          pipeline.bloomThreshold = this.quality === 'low' ? 0.98 : 0.94;
          pipeline.bloomWeight = this.quality === 'high' ? 0.18 : (mobileHigh ? 0.09 : (this.quality === 'medium' ? 0.13 : 0.075));
          pipeline.bloomKernel = this.quality === 'high' ? 56 : (mobileHigh ? 24 : (this.quality === 'medium' ? 36 : 20));
          pipeline.bloomScale = this.quality === 'high' ? 0.45 : (mobileHigh ? 0.24 : (this.quality === 'medium' ? 0.32 : 0.20));
          pipeline.imageProcessingEnabled = true;
          // Native mobile MSAA is already active; avoid a second FXAA softening pass.
          pipeline.fxaaEnabled = !mobileHigh;
          pipeline.grainEnabled = false;
          pipeline.chromaticAberrationEnabled = false;
          if (pipeline.imageProcessing) {
            pipeline.imageProcessing.vignetteEnabled = this.quality === 'high' && !this.isTouchDevice;
            pipeline.imageProcessing.vignetteWeight = 0.20;
            pipeline.imageProcessing.vignetteColor = new B.Color4(0.008, 0.014, 0.025, 0);
          }
        } catch (error) {
          console.warn('Default rendering pipeline kept its safe settings.', error);
        }
      }

      // Use Babylon's ACES tone mapper for the scene and the active post-process.
      const acesToneMapping = B.ImageProcessingConfiguration &&
        B.ImageProcessingConfiguration.TONEMAPPING_ACES;
      for (const imageConfig of [this.scene.imageProcessingConfiguration,
        this.renderPipeline && this.renderPipeline.imageProcessing]) {
        if (!imageConfig) continue;
        imageConfig.toneMappingEnabled = true;
        if (Number.isFinite(acesToneMapping)) imageConfig.toneMappingType = acesToneMapping;
      }

      if (this.quality === 'high' && !this.isTouchDevice && B.VolumetricLightScatteringPostProcess && this.sunDisc) {
        try {
          const ratio = this.quality === 'high' ? (this.isTouchDevice ? 0.34 : 0.55) : 0.32;
          const samples = this.quality === 'high' ? (this.isTouchDevice ? 32 : 64) : 28;
          this.godRays = new B.VolumetricLightScatteringPostProcess(
            'NorseSunGodRays', ratio, this.camera, this.sunDisc, samples,
            B.Texture.BILINEAR_SAMPLINGMODE, this.engine, true);
          this.godRays.exposure = 0.08;
          this.godRays.decay = 0.96;
          this.godRays.weight = 0.24;
          this.godRays.density = 0.86;
        } catch (error) {
          this.godRays = null;
          console.warn('Volumetric sun rays unavailable on this renderer.', error);
        }
      }

      // SSAO/SSR are optional high-tier screen-space approximations.
      if (this.quality === 'high' && !this.isTouchDevice) {
        try {
          const ssaoRatio = 0.42;
          if (B.SSAO2RenderingPipeline) {
            this.ssaoPipeline = new B.SSAO2RenderingPipeline(
              'NorseAtmosphereSSAO2', this.scene, ssaoRatio, [this.camera]);
          } else if (B.SSAORenderingPipeline) {
            this.ssaoPipeline = new B.SSAORenderingPipeline(
              'NorseAtmosphereSSAO', this.scene, { ssaoRatio, combineRatio: 1.0 }, [this.camera]);
          }
        } catch (error) {
          this.ssaoPipeline = null;
          console.warn('SSAO unavailable; ambient hemisphere lighting remains active.', error);
        }
        try {
          if (!this.isTouchDevice && B.SSRRenderingPipeline) {
            this.ssrPipeline = new B.SSRRenderingPipeline(
              'NorseAtmosphereSSR', this.scene, [this.camera]);
          }
        } catch (error) {
          this.ssrPipeline = null;
          console.warn('SSR unavailable; native water reflection remains active.', error);
        }
      }
    }

    _upgradeShadowsWhenSupported() {
      const B = this.B;
      const previous = this.getShadowGenerator();
      const caps = this.engine && this.engine.getCaps ? this.engine.getCaps() : {};
      const webgl2 = Number(this.engine && (this.engine.webGLVersion || this.engine._webGLVersion)) >= 2 || !!caps.supportComputeShaders;
      if (previous && this.quality === 'low' && B.ShadowGenerator &&
          Number.isFinite(B.ShadowGenerator.QUALITY_LOW)) {
        try {
          // Keep the existing dynamic shadow map, but use low-cost PCF filtering on constrained devices.
          previous.usePercentageCloserFiltering = true;
          previous.filteringQuality = B.ShadowGenerator.QUALITY_LOW;
        } catch (error) {
          console.warn('Low-tier shadow filtering could not be reduced; existing shadows remain active.', error);
        }
      }
      if (!previous || this.quality === 'low' || this.isTouchDevice || !B.CascadedShadowGenerator || !webgl2) {
        this.shadowMode = 'standard';
        return;
      }
      try {
        const mapSize = this.isTouchDevice ? (this.quality === 'high' ? 2048 : 1024) : 2048;
        const csm = new B.CascadedShadowGenerator(mapSize, this.sunLight);
        csm.numCascades = this.isTouchDevice ? 2 : 3;
        csm.lambda = 0.72;
        csm.cascadeBlendPercentage = 0.075;
        csm.stabilizeCascades = true;
        csm.shadowMaxZ = Math.min(240, this.camera.maxZ || 240);
        csm.bias = 0.00035;
        csm.normalBias = 0.014;
        csm.darkness = 0.27;
        csm.usePercentageCloserFiltering = true;
        csm.filteringQuality = B.ShadowGenerator.QUALITY_HIGH;
        const csmMap = csm.getShadowMap && csm.getShadowMap();
        if (csmMap) csmMap.refreshRate = this.isTouchDevice ? 8 : 2;
        const oldMap = previous.getShadowMap && previous.getShadowMap();
        const renderList = oldMap && Array.isArray(oldMap.renderList) ? oldMap.renderList.slice() : [];
        for (const mesh of renderList) if (mesh && !(mesh.isDisposed && mesh.isDisposed())) csm.addShadowCaster(mesh, false);
        previous.dispose();
        this.setShadowGenerator(csm);
        this.shadowMode = 'csm';
      } catch (error) {
        this.shadowMode = 'standard';
        console.warn('Cascaded shadows unavailable; original shadow generator retained.', error);
      }
    }

    _createLocalLightPool() {
      const B = this.B, scene = this.scene;
      if (!B.PointLight || !scene) return;
      for (const item of this.fireLegacyLights) {
        if (item && item.light && item.light.setEnabled) item.light.setEnabled(false);
      }
      // Exactly two nearby fire lights stay active: one sun/moon + hemi + two fires
      // respects common four-light material budgets on mobile.
      for (let i = 0; i < (this.quality === 'low' ? 1 : 2); i++) {
        const light = new B.PointLight('NorseNightHearthPool_' + i, new B.Vector3(0, 0, 0), scene);
        light.diffuse = new B.Color3(1.0, 0.43, 0.14);
        light.specular = new B.Color3(1.0, 0.30, 0.08);
        light.range = 11.5;
        light.intensity = 0;
        light.includedOnlyMeshes = this._fireFallbackMeshes;
        // Keep the two point-light slots registered for the entire solar cycle.
        // Intensity and local mesh membership change; the shader variant never toggles.
        light.setEnabled(true);
        this.firePool.push({ light, source: null, phase: i * 2.17 });
      }
    }

    _collectHearthMeshes(hearth) {
      const scene = this.scene;
      if (!scene) return [];
      // Use Babylon's already-culled active list: no forced world-matrix rebuild or
      // full 13-island mesh scan while the player is moving between hearths.
      // The hearth's bounded influence set is static; do not rebuild it from the camera-culled list.
      const source = Array.isArray(scene.meshes) ? scene.meshes : [];
      const included = [];
      const lightX = Number(hearth.x) || 0;
      const lightY = (Number(hearth.floorY) || 0) + 1.0;
      const lightZ = Number(hearth.z) || 0;
      const range = 11.5;
      for (const mesh of source) {
        if (!mesh || (typeof mesh.isDisposed === 'function' && mesh.isDisposed())) continue;
        if (typeof mesh.isEnabled === 'function' && !mesh.isEnabled()) continue;
        if (mesh.isVisible === false || (Number.isFinite(mesh.visibility) && mesh.visibility <= 0.001)) continue;
        if (!mesh.material || mesh.material.disableLighting === true) continue;
        const bounds = typeof mesh.getBoundingInfo === 'function' ? mesh.getBoundingInfo() : null;
        const sphere = bounds && bounds.boundingSphere;
        const center = sphere && sphere.centerWorld;
        if (!center) continue;
        const extent = Math.max(0, Number(sphere.radiusWorld) || 0);
        const dx = center.x - lightX, dy = center.y - lightY, dz = center.z - lightZ;
        const reach = range + extent;
        if (dx * dx + dy * dy + dz * dz <= reach * reach) included.push(mesh);
      }
      return included;
    }

    _updateFirePool(state, focus) {
      if (!this.firePool.length) return;
      const started = performance.now();
      const now = this._realElapsedSeconds;
      const selectionDue = now - this.lastFirePoolUpdate >= 0.75;
      if (!selectionDue) {
        for (const slot of this.firePool) {
          const hearth = slot.source;
          const activeNight = state.night > 0.18 && hearth && !hearth.extinguished;
          slot.light.intensity = activeNight
            ? (0.54 + Math.sin(now * 8.2 + slot.phase) * 0.12) * state.night
            : 0;
        }
        this._recordPerformanceSample('fire', performance.now() - started);
        return;
      }

      // Select nearby hearths in daylight, so dusk only changes light energy.
      this.lastFirePoolUpdate = now;
      const candidates = this._fireCandidates;
      for (const candidate of candidates) { candidate.h = null; candidate.d2 = Infinity; }
      const maxDistanceSquared = 52 * 52;
      for (const hearth of this.fireHearths) {
        if (!hearth || hearth.extinguished) continue;
        const dx = hearth.x - focus.x, dz = hearth.z - focus.z, d2 = dx * dx + dz * dz;
        if (d2 >= maxDistanceSquared) continue;
        let insertAt = -1;
        for (let i = 0; i < candidates.length; i++) {
          if (d2 < candidates[i].d2) { insertAt = i; break; }
        }
        if (insertAt < 0) continue;
        for (let i = candidates.length - 1; i > insertAt; i--) {
          candidates[i].h = candidates[i - 1].h;
          candidates[i].d2 = candidates[i - 1].d2;
        }
        candidates[insertAt].h = hearth;
        candidates[insertAt].d2 = d2;
      }

      for (let i = 0; i < this.firePool.length; i++) {
        const slot = this.firePool[i], candidate = candidates[i].h ? candidates[i] : null;
        const light = slot.light;
        if (!candidate) {
          if (slot.source !== null) {
            slot.source = null;
            light.includedOnlyMeshes = this._fireFallbackMeshes;
            this._performanceSamples.hearthMeshes = this._fireFallbackMeshes.length;
            this._performanceSamples.hearthRefreshes++;
          }
          light.intensity = 0;
          continue;
        }
        const hearth = candidate.h;
        // The visible influence list is recalculated only when this slot changes hearth.
        // It is not rebuilt from Babylon's camera-culled active list every 750 ms.
        if (slot.source !== hearth) {
          slot.source = hearth;
          light.position.set(hearth.x, hearth.floorY + 1.0, hearth.z);
          const nextMeshes = this._collectHearthMeshes(hearth);
          light.includedOnlyMeshes = nextMeshes.length ? nextMeshes : this._fireFallbackMeshes;
          this._performanceSamples.hearthMeshes = nextMeshes.length;
          this._performanceSamples.hearthRefreshes++;
        }
        const activeNight = state.night > 0.18 && !hearth.extinguished;
        light.intensity = activeNight
          ? (0.54 + Math.sin(now * 8.2 + slot.phase) * 0.12) * state.night
          : 0;
      }
      this._recordPerformanceSample('fire', performance.now() - started);
    }


    update(dt, force) {
      if (this.disposed || !this.scene) return null;
      const delta = clamp(Number(dt) || 0, 0, 0.10);
      this._realElapsedSeconds += delta;
      if (!this.paused && delta > 0) {
        this.timeOfDay = AtmosphereSystem.advanceTime(
          this.timeOfDay, delta * this.speed, this.dayDurationSeconds, 1);
        this.elapsedSeconds = AtmosphereSystem.advanceElapsed(this.elapsedSeconds, delta, this.speed);
      }
      this._visualUpdateAccumulator += delta;
      if (force !== true && this._visualUpdateAccumulator < this._visualUpdateInterval) {
        return this.lastState ? this.getState() : null;
      }
      this._visualUpdateAccumulator = force === true ? 0 :
        this._visualUpdateAccumulator % this._visualUpdateInterval;
      const visualStarted = performance.now();
      const B = this.B;
      const state = computeSolarState(this.timeOfDay, this._solarState);
      const lighting = computeLightingProfile(state, this._lightingProfile);
      const weather = this.weather;
      const storm = weather === 'storm' ? 1 : 0;
      const overcast = weather === 'overcast' ? 0.82 : (weather === 'fog' ? 0.54 : (storm ? 0.96 : 0.44));
      const extraFog = weather === 'fog' ? 0.75 : (storm ? 0.42 : (weather === 'overcast' ? 0.18 : 0));
      const focus = this.focusProvider ? this.focusProvider() : this.camera.position;
      const sun = state.sunDirection;
      const sunVector = this._sunVector;
      sunVector.x = sun.x; sunVector.y = sun.y; sunVector.z = sun.z;
      const moonVector = this._moonVector;
      moonVector.x = -sun.x; moonVector.y = -sun.y; moonVector.z = -sun.z;
      const sunColor = this._sunColor;
      sunColor.r = 1.0;
      sunColor.g = mix(0.985, 0.50, state.twilight);
      sunColor.b = mix(0.91, 0.29, state.twilight);

      const directLightStarted = performance.now();
      // Sun and moon share one permanent directional slot: only direction, colour and intensity move through the day.
      // A single permanent directional slot makes a smooth solar-to-lunar hand-off.
      // The small perpendicular arc avoids a 180° direction flip at the day/night boundary.
      const lunarBlend = smooth(0.18, 0.82, state.night);
      const handoffAngle = Math.PI * lunarBlend;
      const handoffCos = Math.cos(handoffAngle), handoffSin = Math.sin(handoffAngle);
      let directX = -sun.x * handoffCos - sun.y * handoffSin;
      let directY = -sun.y * handoffCos + sun.x * handoffSin;
      let directZ = -sun.z * handoffCos;
      const directLength = Math.hypot(directX, directY, directZ) || 1;
      directX /= directLength; directY /= directLength; directZ /= directLength;
      if (this.sunLight) {
        this.sunLight.direction.x = directX;
        this.sunLight.direction.y = directY;
        this.sunLight.direction.z = directZ;
        if (focus && this.sunLight.position) {
          this._lightPosition.x = focus.x - directX * 180;
          this._lightPosition.y = focus.y - directY * 180;
          this._lightPosition.z = focus.z - directZ * 180;
          this.sunLight.position.copyFrom(this._lightPosition);
        }
        const directColor = this._directColor;
        directColor.r = mix(sunColor.r, this._moonDirectColor.r, lunarBlend);
        directColor.g = mix(sunColor.g, this._moonDirectColor.g, lunarBlend);
        directColor.b = mix(sunColor.b, this._moonDirectColor.b, lunarBlend);
        const directSpecular = this._directSpecularColor;
        directSpecular.r = mix(this._sunSpecularColor.r, this._moonDirectSpecularColor.r, lunarBlend);
        directSpecular.g = mix(this._sunSpecularColor.g, this._moonDirectSpecularColor.g, lunarBlend);
        directSpecular.b = mix(this._sunSpecularColor.b, this._moonDirectSpecularColor.b, lunarBlend);
        this.sunLight.diffuse.copyFrom(directColor);
        this.sunLight.specular.copyFrom(directSpecular);
        const sunIntensity = 1.42 * state.daylight * (0.36 + 0.64 * smooth(0.0, 0.54, state.altitude));
        const moonIntensity = lighting.moonIntensity * (1 - storm * 0.48);
        this.sunLight.intensity = mix(sunIntensity, moonIntensity, lunarBlend);
      }

      if (this.hemiLight) {
        this.hemiLight.intensity = lighting.hemisphereIntensity;
        this.hemiLight.diffuse.r = mix(this._coolNightColor.r, this._dayAmbientColor.r, state.daylight);
        this.hemiLight.diffuse.g = mix(this._coolNightColor.g, this._dayAmbientColor.g, state.daylight);
        this.hemiLight.diffuse.b = mix(this._coolNightColor.b, this._dayAmbientColor.b, state.daylight);
        this.hemiLight.groundColor.r = mix(this._nightGroundColor.r, this._dayGroundColor.r, state.daylight);
        this.hemiLight.groundColor.g = mix(this._nightGroundColor.g, this._dayGroundColor.g, state.daylight);
        this.hemiLight.groundColor.b = mix(this._nightGroundColor.b, this._dayGroundColor.b, state.daylight);
      }
      if (this.scene.environmentTexture && 'environmentIntensity' in this.scene) {
        this.scene.environmentIntensity = lighting.environmentIntensity;
      }

      const fogColor = this._fogColor;
      fogColor.r = mix(this._horizonNightColor.r, this._horizonDayColor.r, state.daylight);
      fogColor.g = mix(this._horizonNightColor.g, this._horizonDayColor.g, state.daylight);
      fogColor.b = mix(this._horizonNightColor.b, this._horizonDayColor.b, state.daylight);
      const duskMix = state.twilight * 0.78;
      fogColor.r = mix(fogColor.r, this._horizonDuskColor.r, duskMix);
      fogColor.g = mix(fogColor.g, this._horizonDuskColor.g, duskMix);
      fogColor.b = mix(fogColor.b, this._horizonDuskColor.b, duskMix);
      if (storm) {
        fogColor.r = mix(fogColor.r, this._stormFogColor.r, 0.55);
        fogColor.g = mix(fogColor.g, this._stormFogColor.g, 0.55);
        fogColor.b = mix(fogColor.b, this._stormFogColor.b, 0.55);
      }
      this.scene.fogMode = B.Scene.FOGMODE_EXP;
      this.scene.fogColor.copyFrom(fogColor);
      const climateBoost = this.fogClimate === 'fjord' ? 0.22 : (this.fogClimate === 'coast' ? 0.10 : 0);
      this.scene.fogDensity = clamp(this.baseFogDensity *
        (1 + state.twilight * 0.60 + state.night * 0.22 + climateBoost + extraFog), 0.00035, 0.00155);
      this._clearColor.r = fogColor.r * 0.70;
      this._clearColor.g = fogColor.g * 0.70;
      this._clearColor.b = fogColor.b * 0.78;
      this._clearColor.a = 1;
      this.scene.clearColor.copyFrom(this._clearColor);
      this._recordPerformanceSample('directLight', performance.now() - directLightStarted);

      const skyStarted = performance.now();
      if (this.sunDisc && this.sunHalo) {
        const visible = clamp(state.daylight * 0.88 + state.twilight * 0.36, 0, 1);
        const point = this._sunPoint;
        point.x = sun.x * 680; point.y = sun.y * 680; point.z = sun.z * 680;
        this.sunDisc.position.copyFrom(point);
        this._lightPosition.x = point.x * 1.012;
        this._lightPosition.y = point.y * 1.012;
        this._lightPosition.z = point.z * 1.012;
        this.sunHalo.position.copyFrom(this._lightPosition);
        this.sunDisc.visibility = visible;
        this.sunHalo.visibility = visible;
        const material = this.sunDisc.material;
        if (this.sunSurfaceMaterial && material === this.sunSurfaceMaterial) {
          material.setColor3('sunColor', sunColor);
          material.setFloat('uTime', this.elapsedSeconds);
        } else if (material && material.emissiveColor) material.emissiveColor.copyFrom(sunColor);
        const haloMaterial = this.sunHalo.material;
        if (haloMaterial) haloMaterial.alpha = 0.035 + state.twilight * 0.20 + state.daylight * 0.045;
      }
      if (this.moonDisc && this.moonHalo) {
        const visible = state.night * (1 - storm * 0.58);
        const point = this._moonPoint;
        point.x = -sun.x * 670; point.y = -sun.y * 670; point.z = -sun.z * 670;
        this.moonDisc.position.copyFrom(point);
        this._lightPosition.x = point.x * 1.018;
        this._lightPosition.y = point.y * 1.018;
        this._lightPosition.z = point.z * 1.018;
        this.moonHalo.position.copyFrom(this._lightPosition);
        this.moonDisc.visibility = visible;
        this.moonHalo.visibility = visible;
        if (this.moonDisc.material) this.moonDisc.material.alpha = visible;
        if (this.moonHalo.material) this.moonHalo.material.alpha = 0.09 * visible;
      }

      if (this.skyMaterial) {
        try {
          this.skyMaterial.setVector3('sunDirection', sunVector);
          this.skyMaterial.setColor3('sunColor', sunColor);
          this.skyMaterial.setFloat('dayFactor', state.daylight);
          this.skyMaterial.setFloat('twilightFactor', state.twilight);
          this.skyMaterial.setFloat('nightFactor', state.night);
          this.skyMaterial.setFloat('cloudCoverage', overcast);
          this.skyMaterial.setFloat('stormFactor', storm);
          this.skyMaterial.setFloat('auroraStrength', this.quality === 'high' ? (weather === 'clear' ? 0.095 : 0.025) : 0.035);
          this.skyMaterial.setFloat('uTime', this.elapsedSeconds);
        } catch (error) {
          if (!this._shaderWarned) console.warn('Atmosphere shader uniform update failed.', error);
          this._shaderWarned = true;
        }
      }
      if (this.cloudA) {
        this.cloudA.uOffset = (this.elapsedSeconds * 0.000022 * this.windStrength) % 1;
        this.cloudA.vOffset = Math.sin(this.elapsedSeconds * 0.00008) * 0.010;
      }
      if (this.cloudB) {
        this.cloudB.uOffset = (-this.elapsedSeconds * 0.000038 * this.windStrength) % 1;
        this.cloudB.vOffset = (this.elapsedSeconds * 0.000012) % 1;
      }
      this._recordPerformanceSample('sky', performance.now() - skyStarted);

      const postStarted = performance.now();
      if (this.renderPipeline && this.renderPipeline.imageProcessing) {
        this.renderPipeline.imageProcessing.exposure = lighting.exposure;
        this.renderPipeline.imageProcessing.contrast = lighting.contrast;
      }
      if (this.scene.imageProcessingConfiguration) {
        this.scene.imageProcessingConfiguration.exposure = lighting.exposure;
        this.scene.imageProcessingConfiguration.contrast = lighting.contrast;
      }
      this._recordPerformanceSample('post', performance.now() - postStarted);

      const waterStarted = performance.now();
      if (this.waterMaterial) {
        const waterColor = this._waterColor;
        waterColor.r = mix(this._waterNightColor.r, this._waterDayColor.r, state.daylight);
        waterColor.g = mix(this._waterNightColor.g, this._waterDayColor.g, state.daylight);
        waterColor.b = mix(this._waterNightColor.b, this._waterDayColor.b, state.daylight);
        const duskWaterMix = state.twilight * 0.72;
        waterColor.r = mix(waterColor.r, this._waterDuskColor.r, duskWaterMix);
        waterColor.g = mix(waterColor.g, this._waterDuskColor.g, duskWaterMix);
        waterColor.b = mix(waterColor.b, this._waterDuskColor.b, duskWaterMix);
        this.waterMaterial.specularColor.copyFrom(waterColor);
        if (this.waterMaterial.reflectionFresnelParameters) {
          this.waterMaterial.reflectionFresnelParameters.rightColor.copyFrom(waterColor);
        }
        if (this.waterMaterial.diffuseFresnelParameters) {
          this._waterDiffuseColor.r = mix(this._waterDiffuseNightColor.r, this._waterDiffuseDayColor.r, state.daylight);
          this._waterDiffuseColor.g = mix(this._waterDiffuseNightColor.g, this._waterDiffuseDayColor.g, state.daylight);
          this._waterDiffuseColor.b = mix(this._waterDiffuseNightColor.b, this._waterDiffuseDayColor.b, state.daylight);
          this.waterMaterial.diffuseFresnelParameters.rightColor.copyFrom(this._waterDiffuseColor);
        }
      }
      this._recordPerformanceSample('water', performance.now() - waterStarted);

      if (this.windowMaterial && this.windowMaterial.emissiveColor) {
        const glow = 0.08 + state.night * 0.52;
        this._windowGlowColor.r = 0.8 * glow;
        this._windowGlowColor.g = 0.38 * glow;
        this._windowGlowColor.b = 0.10 * glow;
        this.windowMaterial.emissiveColor.copyFrom(this._windowGlowColor);
      }
      if (this.godRays) {
        const rayFactor = state.twilight * state.daylight * (1 - storm * 0.85);
        const rayActive = rayFactor > 0.015;
        this.godRays.exposure = rayActive ? 0.02 + rayFactor * 0.13 : 0;
        this.godRays.weight = rayActive ? 0.04 + rayFactor * 0.34 : 0;
        this.godRays.density = rayActive ? 0.72 + rayFactor * 0.18 : 0;
      }
      this._updateFirePool(state, focus || this._fallbackFocus);
      this._recordPerformanceSample('visual', performance.now() - visualStarted);
      this.lastState = state;
      return this.getState();
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      try { if (this.godRays) this.godRays.dispose(); } catch (_) {}
      try { if (this.ssaoPipeline) this.ssaoPipeline.dispose(); } catch (_) {}
      try { if (this.ssrPipeline) this.ssrPipeline.dispose(); } catch (_) {}
      for (const slot of this.firePool) {
        try { slot.light.dispose(); } catch (_) {}
      }
      for (const texture of [this.cloudA, this.cloudB, this.starsTexture]) {
        try { if (texture) texture.dispose(); } catch (_) {}
      }
      try { if (this.moonLight) this.moonLight.dispose(); } catch (_) {}
      try { if (this.moonDisc) this.moonDisc.dispose(); } catch (_) {}
      try { if (this.moonHalo) this.moonHalo.dispose(); } catch (_) {}
      try {
        if (this.sunSurfaceMaterial) {
          if (this.sunDisc && this.sunDisc.material === this.sunSurfaceMaterial) this.sunDisc.material = this._originalSunMaterial || null;
          this.sunSurfaceMaterial.dispose();
        }
      } catch (_) {}
    }
  }

  root.NorseAtmosphereSystem = AtmosphereSystem;
})(typeof window !== 'undefined' ? window : globalThis);
