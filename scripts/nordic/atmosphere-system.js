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
    // Preserve the dark Nordic sky while lifting terrain and character readability.
    profile.hemisphereIntensity = 0.22 + 0.72 * state.daylight + 0.15 * state.twilight + 0.025 * state.night;
    profile.moonIntensity = 0.20 * state.night;
    profile.environmentIntensity = 0.15 + 0.40 * state.daylight + 0.11 * state.twilight + 0.035 * state.night;
    profile.exposure = mix(1.00, 1.08, state.daylight) + 0.11 * state.twilight + 0.04 * state.night;
    profile.contrast = mix(1.06, 1.00, state.night);
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
      this.windStrength = 1;
      this.baseFogDensity = Number(this.scene.fogDensity) || 0.00058;
      this.fogClimate = 'fjord';
      this.lastFirePoolUpdate = -10;
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
      this._sunSpecularColor = new this.B.Color3(0.72, 0.78, 0.86);
      this._coolNightColor = new this.B.Color3(0.25, 0.34, 0.52);
      this._dayAmbientColor = new this.B.Color3(0.72, 0.82, 0.92);
      this._nightGroundColor = new this.B.Color3(0.055, 0.070, 0.11);
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
      this._createMoonAndLights();
      this._adjustMaterialLightBudgets();
      this._configurePostProcessing();
      this._upgradeShadowsWhenSupported();
      this._createLocalLightPool();
      this.update(0, true);
      console.info('Norse AtmosphereSystem ready', {
        version: 1, quality: this.quality, timeOfDay: this.timeOfDay,
        dayDurationSeconds: this.dayDurationSeconds, weather: this.weather,
        godRays: !!this.godRays, cascadedShadows: this.shadowMode === 'csm',
        ssao: !!this.ssaoPipeline, ssr: !!this.ssrPipeline
      });
    }

    static normalizeTime(value) { return normalizeTime(value); }
    static computeSolarState(value) { return computeSolarState(value); }
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
        ssr: !!this.ssrPipeline
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
          '  float horizon = pow(h, 0.72);',
          '  vec3 dayZenith = vec3(0.055, 0.205, 0.345);',
          '  vec3 dayHorizon = vec3(0.48, 0.66, 0.70);',
          '  vec3 duskZenith = vec3(0.075, 0.105, 0.205);',
          '  vec3 duskHorizon = vec3(0.92, 0.30, 0.16);',
          '  vec3 nightZenith = vec3(0.004, 0.010, 0.030);',
          '  vec3 nightHorizon = vec3(0.018, 0.035, 0.075);',
          '  vec3 daySky = mix(dayHorizon, dayZenith, horizon);',
          '  vec3 duskSky = mix(duskHorizon, duskZenith, horizon);',
          '  vec3 nightSky = mix(nightHorizon, nightZenith, horizon);',
          '  vec3 sky = mix(nightSky, daySky, dayFactor);',
          '  sky = mix(sky, duskSky, twilightFactor * 0.92);',
          '  float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);',
          '  float aureole = pow(sunDot, 18.0) * (0.14 + twilightFactor * 0.35);',
          '  float sunGlow = pow(sunDot, 90.0) * (0.22 + twilightFactor * 0.78);',
          '  sky += sunColor * (aureole + sunGlow) * dayFactor;',
          '  vec2 uvA = vec2(vAtmosphereUV.x + uTime * 0.000012, vAtmosphereUV.y);',
          '  vec2 uvB = vec2(vAtmosphereUV.x * 1.72 - uTime * 0.000021, vAtmosphereUV.y * 1.18 + uTime * 0.000006);',
          '  float cloud1 = texture2D(cloudLayerA, uvA).a;',
          '  float cloud2 = texture2D(cloudLayerB, uvB).a;',
          '  float clouds = clamp(cloud1 * 0.76 + cloud2 * 0.24, 0.0, 1.0) * cloudCoverage;',
          '  float silverEdge = pow(max(0.0, dot(dir, normalize(sunDirection))), 2.2);',
          '  vec3 dayCloud = mix(vec3(0.28, 0.34, 0.39), vec3(0.82, 0.88, 0.88), dayFactor);',
          '  dayCloud = mix(dayCloud, sunColor * 0.95 + vec3(0.12, 0.035, 0.012), twilightFactor * 0.58);',
          '  vec3 nightCloud = vec3(0.035, 0.055, 0.085);',
          '  vec3 cloudColor = mix(nightCloud, dayCloud, dayFactor + twilightFactor * 0.20);',
          '  cloudColor = mix(cloudColor, vec3(0.17, 0.20, 0.25), stormFactor * 0.76);',
          '  cloudColor += sunColor * silverEdge * (0.12 + twilightFactor * 0.18) * (1.0 - stormFactor);',
          '  sky = mix(sky, cloudColor, clouds * (0.38 + 0.42 * (1.0 - stormFactor)));',
          '  vec4 starSample = texture2D(starsMap, vAtmosphereUV);',
          '  sky += starSample.rgb * starSample.a * nightFactor * (1.0 - stormFactor * 0.72) * 1.35;',
          '  float auroraWave = 0.22 + 0.055 * sin(dir.x * 10.0 + uTime * 0.075) + 0.022 * sin(dir.x * 23.0 - uTime * 0.11);',
          '  float auroraBand = 1.0 - smoothstep(0.012, 0.075, abs(dir.y - auroraWave));',
          '  float auroraRibbons = 0.55 + 0.45 * sin(dir.x * 18.0 + uTime * 0.10);',
          '  vec3 auroraColor = mix(vec3(0.10, 0.58, 0.37), vec3(0.12, 0.42, 0.72), 0.5 + 0.5 * sin(dir.x * 4.0 + uTime * 0.04));',
          '  sky += auroraColor * auroraBand * auroraRibbons * auroraStrength * nightFactor * (1.0 - stormFactor);',
          '  float horizonGlow = exp(-abs(dir.y) * 8.0) * twilightFactor * 0.13;',
          '  sky += vec3(0.98, 0.39, 0.16) * horizonGlow;',
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

    _createMoonAndLights() {
      const B = this.B, scene = this.scene;
      if (!B || !scene) return;
      try {
        this.moonLight = new B.DirectionalLight('NorseMoonDirectionalLight',
          new B.Vector3(0, 1, 0), scene);
        this.moonLight.diffuse = new B.Color3(0.48, 0.60, 0.82);
        this.moonLight.specular = new B.Color3(0.30, 0.38, 0.58);
        this.moonLight.intensity = 0;
        this.moonLight.setEnabled(false);

        if (this.skyDome && B.MeshBuilder && B.StandardMaterial) {
          this.moonDisc = B.MeshBuilder.CreateSphere('NorseMoonDisc', { diameter: 17, segments: 24 }, scene);
          this.moonDisc.parent = this.skyDome;
          this.moonDisc.isPickable = false;
          const moonMaterial = new B.StandardMaterial('NorseMoonMaterial', scene);
          moonMaterial.disableLighting = true;
          moonMaterial.emissiveColor = new B.Color3(0.50, 0.62, 0.86);
          moonMaterial.diffuseColor = new B.Color3(0.13, 0.17, 0.25);
          moonMaterial.specularColor = new B.Color3(0, 0, 0);
          this.moonDisc.material = moonMaterial;

          this.moonHalo = B.MeshBuilder.CreateSphere('NorseMoonHalo', { diameter: 37, segments: 20 }, scene);
          this.moonHalo.parent = this.skyDome;
          this.moonHalo.isPickable = false;
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
        light.setEnabled(false);
        this.firePool.push({ light, source: null, phase: i * 2.17 });
      }
    }

    _updateFirePool(state, focus) {
      if (!this.firePool.length) return;
      const now = this.elapsedSeconds;
      const nightOn = state.night > 0.18;
      if (now - this.lastFirePoolUpdate < 0.28 && nightOn) {
        for (const slot of this.firePool) {
          if (slot.source && !slot.source.extinguished) {
            slot.light.intensity = (0.54 + Math.sin(now * 8.2 + slot.phase) * 0.12) * state.night;
          }
        }
        return;
      }
      this.lastFirePoolUpdate = now;
      const candidates = nightOn ? this.fireHearths.filter(h => h && !h.extinguished).map(h => {
        const dx = h.x - focus.x, dz = h.z - focus.z;
        return { h, d2: dx * dx + dz * dz };
      }).filter(x => x.d2 < 52 * 52).sort((a, b) => a.d2 - b.d2).slice(0, this.firePool.length) : [];
      for (let i = 0; i < this.firePool.length; i++) {
        const slot = this.firePool[i], candidate = candidates[i] || null;
        if (!candidate) {
          slot.source = null;
          slot.light.intensity = 0;
          slot.light.setEnabled(false);
          continue;
        }
        const h = candidate.h;
        slot.source = h;
        slot.light.position.set(h.x, h.floorY + 1.0, h.z);
        slot.light.range = 11.5;
        slot.light.intensity = 0.56 * state.night;
        slot.light.setEnabled(true);
      }
    }

    update(dt, force) {
      if (this.disposed || !this.scene) return null;
      const delta = clamp(Number(dt) || 0, 0, 0.10);
      if (!this.paused && delta > 0) {
        this.timeOfDay = AtmosphereSystem.advanceTime(
          this.timeOfDay, delta * this.speed, this.dayDurationSeconds, 1);
        this.elapsedSeconds = AtmosphereSystem.advanceElapsed(this.elapsedSeconds, delta, this.speed);
      }
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
      sunColor.g = mix(0.94, 0.47, state.twilight);
      sunColor.b = mix(0.82, 0.24, state.twilight);

      if (this.sunLight) {
        this.sunLight.direction.x = -sun.x;
        this.sunLight.direction.y = -sun.y;
        this.sunLight.direction.z = -sun.z;
        if (focus && this.sunLight.position) {
          this._lightPosition.x = focus.x + sun.x * 180;
          this._lightPosition.y = focus.y + sun.y * 180;
          this._lightPosition.z = focus.z + sun.z * 180;
          this.sunLight.position.copyFrom(this._lightPosition);
        }
        this.sunLight.diffuse.copyFrom(sunColor);
        this.sunLight.specular.copyFrom(this._sunSpecularColor);
        this.sunLight.intensity = 1.42 * state.daylight * (0.36 + 0.64 * smooth(0.0, 0.54, state.altitude));
        this.sunLight.setEnabled(state.daylight >= state.night && state.daylight > 0.012);
      }

      if (this.moonLight) {
        this.moonLight.direction.x = sun.x;
        this.moonLight.direction.y = sun.y;
        this.moonLight.direction.z = sun.z;
        if (focus && this.moonLight.position) {
          this._lightPosition.x = focus.x - sun.x * 150;
          this._lightPosition.y = focus.y - sun.y * 150;
          this._lightPosition.z = focus.z - sun.z * 150;
          this.moonLight.position.copyFrom(this._lightPosition);
        }
        this.moonLight.intensity = lighting.moonIntensity * (1 - storm * 0.48);
        this.moonLight.setEnabled(state.night > state.daylight && state.night > 0.025);
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
        if (material && material.emissiveColor) material.emissiveColor.copyFrom(sunColor);
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
        this.moonDisc.setEnabled(visible > 0.025);
        this.moonHalo.setEnabled(visible > 0.025);
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
      if (this.renderPipeline && this.renderPipeline.imageProcessing) {
        this.renderPipeline.imageProcessing.exposure = lighting.exposure;
        this.renderPipeline.imageProcessing.contrast = lighting.contrast;
      }
      if (this.scene.imageProcessingConfiguration) {
        this.scene.imageProcessingConfiguration.exposure = lighting.exposure;
        this.scene.imageProcessingConfiguration.contrast = lighting.contrast;
      }
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
    }
  }

  root.NorseAtmosphereSystem = AtmosphereSystem;
})(typeof window !== 'undefined' ? window : globalThis);
