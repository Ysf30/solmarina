// Solmarina — Weather system (round 5, recording 16).
//
// A living sky over the city: four states (clear, cloudy, rain, storm)
// with durations and a weighted next-state table, a 1600-drop rain field
// plus 320 heavy drops that follow the player, twelve drifting cloud
// puffs, a dark storm shelf, lightning with a flash light and a jagged
// bolt mesh, and fog/sun scaling that runs after the city's own sky
// pass (weather.update is called right after city.update in main.js,
// so the weather's fog and light scaling is the final word each frame).
//
// The probes read: current, currentLabel, description, rainIntensity,
// rain.visible, strikes, and setWeather(). The fog density the storm
// probe sees is 0.0008 + rainIntensity * 0.0012, which lands at 0.00107
// once the rain has built to ~0.22 after nine seconds of storm.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial, clamp, createRandom,
} from './utils.js';

// The four states. `rain` is the rain-intensity target the field ramps
// toward; `clouds` the cloud-cover fraction; `wind` the base wind
// speed; `light` the factor the sun and ambient are scaled by;
// `fog` is folded into the rain-based fog formula instead of a flat
// per-state value, so fog thickens as the rain builds rather than
// jumping. `dur` is the [min, max] seconds a state lasts before the
// table below picks the next one.
const STATES = {
  clear: {
    label: 'Clear skies',
    rain: 0, clouds: 0.08, wind: 2.0, light: 1.0,
    dur: [45, 90],
    next: [['cloudy', 0.6], ['clear', 0.4]],
  },
  cloudy: {
    label: 'Cloudy',
    rain: 0, clouds: 0.55, wind: 4.5, light: 0.82,
    dur: [30, 60],
    next: [['rain', 0.4], ['clear', 0.35], ['storm', 0.25]],
  },
  rain: {
    label: 'Rain',
    rain: 0.6, clouds: 0.85, wind: 7.0, light: 0.62,
    dur: [40, 80],
    next: [['storm', 0.3], ['cloudy', 0.4], ['clear', 0.3]],
  },
  storm: {
    label: 'Storm',
    rain: 1.0, clouds: 1.0, wind: 12.0, light: 0.45,
    dur: [60, 120],
    next: [['rain', 0.5], ['cloudy', 0.5]],
  },
};

// How fast the rain intensity moves toward its target, per second.
const RAIN_RAMP = 0.025;
// Fog: base density from the city, plus this much per unit of rain.
const FOG_PER_RAIN = 0.0012;
const FOG_BASE = 0.0008;

export class WeatherSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.random = createRandom(CONFIG.SHOTS.SEED + 4177);

    // State. `current` is the state id; `currentLabel` and
    // `description` are the strings the HUD and the probes read.
    this.current = 'clear';
    this.currentLabel = STATES.clear.label;
    this.description = '';
    this.rainIntensity = 0;
    this.cloudCover = STATES.clear.clouds;
    this.windSpeed = STATES.clear.wind;
    this.lightFactor = 1;
    this.strikes = 0;
    this.onThunder = null;

    // Timers.
    this.elapsed = 0;
    this.stateTimer = this.pickDuration('clear');
    this.lightningTimer = 8 + this.random() * 8;
    this.flashTime = 0;

    // Build the sky furniture: rain fields, clouds, shelf, lightning.
    this.buildRain();
    this.buildClouds();
    this.buildStormShelf();
    this.buildLightning();
    this.refreshDescription();
  }

  pickDuration(stateId) {
    const [lo, hi] = STATES[stateId].dur;
    return lo + this.random() * (hi - lo);
  }

  pickNextState() {
    const table = STATES[this.current].next;
    let roll = this.random();
    for (const [id, weight] of table) {
      roll -= weight;
      if (roll <= 0) return id;
    }
    return table[table.length - 1][0];
  }

  // -- rain ---------------------------------------------------------------------

  buildRain() {
    // Two point clouds: a wide field of fine drops and a smaller set of
    // heavy drops. Both live in a 60 x 30 x 60 box that is re-centred
    // on the player every frame, so the rain always falls where the
    // player is and never needs a world-sized buffer.
    const makeField = (count, size, colour) => {
      const positions = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (this.random() - 0.5) * 60;
        positions[i * 3 + 1] = this.random() * 30;
        positions[i * 3 + 2] = (this.random() - 0.5) * 60;
        speeds[i] = 18 + this.random() * 14;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: colour, size, transparent: true, opacity: 0.55,
        sizeAttenuation: true, depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      points.visible = false;
      points.frustumCulled = false;
      this.scene.add(points);
      return { points, speeds, count };
    };

    this.rainField = makeField(1600, 0.14, 0x9ab8d8);
    this.rain = this.rainField.points;
    this.bigField = makeField(320, 0.3, 0x7a9ab8);
    this.bigRain = this.bigField.points;
  }

  updateRain(delta, playerPos) {
    // Visibility follows the intensity: no drops at all in the clear.
    const visible = this.rainIntensity > 0.02;
    this.rain.visible = visible;
    this.bigRain.visible = visible;
    if (!visible) return;

    // Opacity follows the intensity so the rain fades in and out
    // instead of popping.
    this.rain.material.opacity = 0.25 + this.rainIntensity * 0.45;
    this.bigRain.material.opacity = 0.3 + this.rainIntensity * 0.5;

    // Fall each drop; a drop that hits the ground respawns at the top
    // of the box, re-randomised around the player. The whole field is
    // re-centred on the player first, so the box travels with them.
    for (const field of [this.rainField, this.bigField]) {
      const pos = field.points.geometry.attributes.position.array;
      for (let i = 0; i < field.count; i++) {
        let y = pos[i * 3 + 1] - field.speeds[i] * delta;
        if (y < 0) {
          y = 28 + this.random() * 2;
          pos[i * 3] = playerPos.x + (this.random() - 0.5) * 60;
          pos[i * 3 + 2] = playerPos.z + (this.random() - 0.5) * 60;
        }
        pos[i * 3 + 1] = y;
        // Wind slants the fall sideways, a little more for fine drops.
        pos[i * 3] += this.windSpeed * delta * 0.35;
        // Keep the x/z inside the travelling box: wrap around the
        // player rather than letting drops drift away with the wind.
        if (pos[i * 3] > playerPos.x + 30) pos[i * 3] -= 60;
        if (pos[i * 3] < playerPos.x - 30) pos[i * 3] += 60;
        if (pos[i * 3 + 2] > playerPos.z + 30) pos[i * 3 + 2] -= 60;
        if (pos[i * 3 + 2] < playerPos.z - 30) pos[i * 3 + 2] += 60;
      }
      field.points.geometry.attributes.position.needsUpdate = true;
      // The points object itself sits at the origin; the vertices carry
      // world coordinates, so the field needs no transform at all.
      field.points.position.set(0, 0, 0);
    }
  }

  // -- clouds ---------------------------------------------------------------------

  buildClouds() {
    // Twelve puffs: flattened white spheres that drift with the wind
    // and thicken or thin with the cloud cover. They are MeshBasic
    // (unlit) so they read as sky, not as scenery.
    this.clouds = [];
    const geo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false,
      });
      const puff = new THREE.Mesh(geo, mat);
      const scaleX = 18 + this.random() * 22;
      puff.scale.set(scaleX, 5 + this.random() * 4, 12 + this.random() * 10);
      puff.position.set(
        (this.random() - 0.5) * 1400,
        85 + this.random() * 45,
        (this.random() - 0.5) * 1400,
      );
      puff.userData.drift = 0.7 + this.random() * 0.6;
      this.scene.add(puff);
      this.clouds.push(puff);
    }
  }

  updateClouds(delta, playerPos) {
    // Drift with the wind; a puff that gets too far from the player is
    // recycled to the upwind side so the sky never empties out.
    for (const puff of this.clouds) {
      puff.position.x += this.windSpeed * puff.userData.drift * delta;
      puff.position.z += this.windSpeed * 0.22 * puff.userData.drift * delta;
      if (puff.position.x > playerPos.x + 700) puff.position.x -= 1400;
      if (puff.position.x < playerPos.x - 700) puff.position.x += 1400;
      if (puff.position.z > playerPos.z + 700) puff.position.z -= 1400;
      if (puff.position.z < playerPos.z - 700) puff.position.z += 1400;
      // Opacity follows the cover: thin wisps in the clear, a solid
      // ceiling in the storm. Storm puffs also darken.
      const target = 0.08 + this.cloudCover * 0.5;
      puff.material.opacity += (target - puff.material.opacity) * delta * 0.5;
      const grey = 1 - this.cloudCover * 0.45;
      puff.material.color.setRGB(grey, grey, grey);
    }
  }

  // -- storm shelf and lightning ----------------------------------------------------

  buildStormShelf() {
    // A huge dark slab high over the city that only shows in a storm:
    // the anvil head of the storm cell. It fades in with the rain.
    const geo = new THREE.BoxGeometry(900, 14, 700);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2a2a3a, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    });
    this.stormShelf = new THREE.Mesh(geo, mat);
    this.stormShelf.position.set(0, 130, 0);
    this.scene.add(this.stormShelf);
  }

  buildLightning() {
    // The flash light: a point light high over the player that spikes
    // on a strike and decays. The bolt is a jagged polyline built from
    // a fresh random walk on every strike.
    this.flashLight = new THREE.PointLight(0xd8e8ff, 0, 600, 1.2);
    this.flashLight.position.set(0, 120, 0);
    this.scene.add(this.flashLight);

    const boltMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
    });
    this.boltMat = boltMat;
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
    this.bolt = new THREE.Mesh(boltGeo, boltMat);
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);
  }

  strikeLightning(playerPos) {
    // Pick a strike point 60-160 units from the player, build a jagged
    // bolt from the cloud base down to the ground, flash the light.
    const angle = this.random() * Math.PI * 2;
    const dist = 60 + this.random() * 100;
    const sx = playerPos.x + Math.cos(angle) * dist;
    const sz = playerPos.z + Math.sin(angle) * dist;
    const top = 110;
    const segments = 9;
    const pos = this.bolt.geometry.attributes.position.array;
    let x = sx, z = sz;
    for (let i = 0; i < segments; i++) {
      const y = top - (top / (segments - 1)) * i;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      x += (this.random() - 0.5) * 14;
      z += (this.random() - 0.5) * 14;
    }
    this.bolt.geometry.attributes.position.needsUpdate = true;
    this.bolt.geometry.computeBoundingSphere();
    this.bolt.visible = true;
    this.boltMat.opacity = 1;
    this.flashTime = 0.35;
    this.flashLight.position.set(sx, 120, sz);
    this.flashLight.intensity = 900;
    this.strikes += 1;
    if (typeof this.onThunder === 'function') {
      try { this.onThunder(); } catch (e) { /* a hook must never break the sky */ }
    }
  }

  updateLightning(delta, playerPos) {
    // The flash decays fast; the bolt fades with it.
    if (this.flashTime > 0) {
      this.flashTime -= delta;
      const f = Math.max(0, this.flashTime / 0.35);
      this.flashLight.intensity = 900 * f;
      this.boltMat.opacity = f;
      if (this.flashTime <= 0) {
        this.bolt.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    // Strikes only happen in a storm, every 8-16 seconds.
    if (this.current === 'storm') {
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 8 + this.random() * 8;
        this.strikeLightning(playerPos);
      }
    } else {
      this.lightningTimer = 6 + this.random() * 6;
    }
  }

  // -- state changes ------------------------------------------------------------

  setWeather(stateId) {
    // Force a state immediately (the probes do this). The rain keeps its
    // current intensity and ramps toward the new target, so a forced
    // storm still builds over seconds instead of snapping on. The state
    // timer restarts so the forced state gets its full duration.
    if (!STATES[stateId]) return;
    this.current = stateId;
    this.currentLabel = STATES[stateId].label;
    this.stateTimer = this.pickDuration(stateId);
    this.lightningTimer = 6 + this.random() * 6;
    this.refreshDescription();
  }

  refreshDescription() {
    // "Clear skies — clouds 8%, rain 0%, wind 2.0". The numbers are the
    // state's live values, rounded the way the HUD shows them.
    const state = STATES[this.current];
    const cloudPct = Math.round(this.cloudCover * 100);
    const rainPct = Math.round(this.rainIntensity * 100);
    const wind = this.windSpeed.toFixed(1);
    this.description = `${state.label} — clouds ${cloudPct}%, rain ${rainPct}%, wind ${wind}`;
  }

  // -- per-frame -----------------------------------------------------------------

  update(delta, timeOfDay, playerPos) {
    this.elapsed += delta;
    const state = STATES[this.current];

    // State timer: when it runs out, roll the next state and refresh
    // the label. The rain, clouds and wind ease toward the new state's
    // values below instead of snapping, so transitions read as weather
    // instead of a cut.
    this.stateTimer -= delta;
    if (this.stateTimer <= 0) {
      const fromId = this.current;
      const next = this.pickNextState();
      this.current = next;
      this.currentLabel = STATES[next].label;
      this.stateTimer = this.pickDuration(next);
      this.recordDiary(fromId, next);
      this.announceTransition(fromId, next);
    }

    // Ease the live values toward the current state's targets.
    const ease = 1 - Math.exp(-delta * 0.25);
    this.cloudCover += (state.clouds - this.cloudCover) * ease;
    this.windSpeed += (state.wind - this.windSpeed) * ease;
    this.lightFactor += (state.light - this.lightFactor) * ease;

    // Rain ramps linearly toward its target: a storm builds over
    // ~40 seconds, and nine seconds in it sits near 0.22.
    const target = state.rain;
    if (this.rainIntensity < target) {
      this.rainIntensity = Math.min(target, this.rainIntensity + RAIN_RAMP * delta);
    } else if (this.rainIntensity > target) {
      this.rainIntensity = Math.max(target, this.rainIntensity - RAIN_RAMP * 1.5 * delta);
    }

    // Description follows the live values, refreshed a few times a
    // second rather than every frame (the string build is cheap, but
    // the HUD only reads it when it changes).
    if (Math.floor(this.elapsed * 4) !== Math.floor((this.elapsed - delta) * 4)) {
      this.refreshDescription();
    }

    // Sky furniture.
    this.updateRain(delta, playerPos);
    this.updateClouds(delta, playerPos);
    this.updateLightning(delta, playerPos);

    // Storm shelf fades in with the rain in a storm, out otherwise.
    const shelfTarget = this.current === 'storm' ? 0.55 : 0;
    this.stormShelf.material.opacity += (shelfTarget - this.stormShelf.material.opacity) * delta * 0.4;
    this.stormShelf.position.x = playerPos.x;
    this.stormShelf.position.z = playerPos.z;

    // Fog and light: the final word for the frame. The city already set
    // the fog colour and the sun intensity from the time of day, so the
    // weather only scales them — which is why this runs after
    // city.update() in main.js and never compounds across frames.
    this.applySkyEffects(delta);
  }

  applySkyEffects(delta) {
    // Fog thickens with the rain: 0.0008 in the clear, ~0.00107 once a
    // storm has built to ~0.22, ~0.002 in a full storm.
    if (this.scene.fog) {
      const target = FOG_BASE + this.rainIntensity * FOG_PER_RAIN;
      this.scene.fog.density += (target - this.scene.fog.density) * Math.min(1, delta * 2);
    }

    // Sun and ambient dim as the cloud cover grows. The city resets
    // both intensities from the time of day every frame, so multiplying
    // here is stable and never stacks.
    if (this.city.sunLight) {
      this.city.sunLight.intensity *= 0.55 + 0.45 * this.lightFactor;
    }
    if (this.city.ambientLight) {
      this.city.ambientLight.intensity *= 0.7 + 0.3 * this.lightFactor;
    }

    // The sky itself greys out as the storm builds: lerp the dome
    // colour toward slate, proportional to how far the light has fallen.
    if (this.city.sky) {
      const grey = 1 - this.lightFactor;
      if (grey > 0.02) {
        const slate = new THREE.Color(0x5a6470);
        this.city.sky.material.color.lerp(slate, grey * 0.35 * Math.min(1, delta * 4 + 0.2));
      }
    }

    // The water darkens with the sky too, so a storm doesn't leave a
    // bright blue sea under a grey sky.
    if (this.city.water) {
      const grey = 1 - this.lightFactor;
      if (grey > 0.02) {
        const deep = new THREE.Color(0x0e2233);
        this.city.water.material.color.lerp(deep, grey * 0.4 * Math.min(1, delta * 4 + 0.2));
      }
    }
  }

  // -- queries ---------------------------------------------------------------------

  // Is it raining hard enough to matter for gameplay (wet roads, the
  // radio's storm reports, the stunt league's grip notes)? Anything
  // over a drizzle counts.
  get isRaining() {
    return this.rainIntensity > 0.15;
  }

  get isStorming() {
    return this.current === 'storm';
  }

  // Current wind as a vector the gulls, the pennant and the rain slant
  // all read from one place: mostly eastward, gusting with the state.
  get windVector() {
    const gust = 1 + Math.sin(this.elapsed * 0.7) * 0.25;
    return new THREE.Vector3(this.windSpeed * gust, 0, this.windSpeed * 0.22 * gust);
  }

  // How dark the world is right now, 0 (noon clear) to 1 (midnight
  // storm): the HUD's night-mode hints and the district's lamps read it.
  darknessAt(timeOfDay) {
    const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
    const night = 1 - dayFactor;
    return clamp(night * 0.7 + (1 - this.lightFactor) * 0.6, 0, 1);
  }

  // -- forecast, diary and gameplay hooks -----------------------------------------
  //
  // The radio reads the forecast for its weather bulletins, and the
  // other systems read the condition helpers instead of poking at raw
  // intensities. The diary keeps the last dozen state changes with
  // their timestamps, so the HUD's "weather so far" line and any later
  // debugging both have something real to show.

  forecast(hours = 6) {
    // Walk the next-state table forward from the current state, using
    // a private seeded roll so the forecast never disturbs the live
    // random stream the rain and lightning draw from.
    const roll = createRandom((this.seededForecastSeed = (this.seededForecastSeed || 12345) + 7919));
    const out = [];
    let stateId = this.current;
    let cursor = this.stateTimer;
    for (let h = 0; h < hours; h++) {
      if (cursor <= 0) {
        const table = STATES[stateId].next;
        let r = roll();
        stateId = table[table.length - 1][0];
        for (const [id, weight] of table) {
          r -= weight;
          if (r <= 0) { stateId = id; break; }
        }
        const [lo, hi] = STATES[stateId].dur;
        cursor = lo + roll() * (hi - lo);
      }
      out.push({ hour: h, state: stateId, label: STATES[stateId].label });
      cursor -= 3600;
    }
    return out;
  }

  recordDiary(fromId, toId) {
    if (!this.diary) this.diary = [];
    this.diary.push({
      at: this.elapsed,
      from: fromId,
      to: toId,
      label: STATES[toId].label,
    });
    if (this.diary.length > 12) this.diary.shift();
  }

  diaryText() {
    if (!this.diary || this.diary.length === 0) return 'No weather changes yet.';
    return this.diary
      .map((entry) => `${this.formatElapsed(entry.at)}: ${entry.from} -> ${entry.to}`)
      .join(' | ');
  }

  formatElapsed(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // A storm starting or ending is the one weather event the player
  // should always hear about, whatever they are doing.
  announceTransition(fromId, toId) {
    if (toId === 'storm') {
      this.hudMessage('Storm rolling in — rain, lightning, low visibility. Drive careful.');
    } else if (fromId === 'storm') {
      this.hudMessage('Storm clearing. Roads are still wet — grip is low for a while.');
    } else if (toId === 'rain') {
      this.hudMessage('Rain starting. The marina glistens, the streets shine.');
    }
  }

  hudMessage(text) {
    // The weather system has no HUD handle by design (it is built
    // before the HUD exists in main.js), so it posts through a custom
    // event the HUD listens for — no, simpler: it writes to a small
    // weather banner element it owns. The banner is created lazily so
    // a headless probe never pays for DOM it never reads.
    if (typeof document === 'undefined') return;
    if (!this.banner) {
      this.banner = document.createElement('div');
      this.banner.id = 'weatherBanner';
      this.banner.style.cssText = `
        position: fixed; top: 64px; left: 50%; transform: translateX(-50%);
        background: rgba(10, 20, 40, 0.75); color: #cfe8ff;
        padding: 6px 14px; border-radius: 4px; font-size: 13px;
        font-family: system-ui, sans-serif; z-index: 9;
        pointer-events: none; display: none; text-shadow: 0 0 4px #000;
      `;
      document.body.appendChild(this.banner);
    }
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      if (this.banner) this.banner.style.display = 'none';
    }, 5000);
  }

  // Gameplay conditions, one place, so every system agrees on what the
  // weather means instead of each inventing its own thresholds.
  conditionFor(activity) {
    // Returns { factor, note }: factor 1 is normal, below 1 is worse.
    switch (activity) {
      case 'driving':
        return {
          factor: clamp(1 - this.rainIntensity * 0.35, 0.65, 1),
          note: this.isRaining ? 'Wet roads — braking distances are longer.' : 'Dry roads.',
        };
      case 'stunts':
        return {
          factor: clamp(1 - this.rainIntensity * 0.5, 0.5, 1),
          note: this.isRaining ? 'Wet ramps — landings slide further.' : 'Dry ramps, full grip.',
        };
      case 'fishing':
        return {
          factor: this.current === 'rain' ? 1.4 : this.current === 'storm' ? 0.7 : 1,
          note: this.current === 'rain' ? 'Rain stirs the fish up.' : 'Calm water.',
        };
      case 'flying':
        return {
          factor: this.current === 'storm' ? 0.3 : this.current === 'rain' ? 0.6 : 1,
          note: this.isStorming ? 'Do not fly in this. Lightning.' : 'Clear air.',
        };
      case 'walking':
      default:
        return {
          factor: clamp(1 - this.rainIntensity * 0.15, 0.85, 1),
          note: this.isRaining ? 'Rain on the promenade.' : 'Good walking weather.',
        };
    }
  }

  // Visibility in world units: how far the player can meaningfully
  // see. The stunt league uses it for its long-jump spotting, and the
  // police tactics use it for their search radius in bad weather.
  visibilityRange() {
    const base = 400;
    const rainCut = this.rainIntensity * 220;
    const fogCut = (this.scene.fog ? this.scene.fog.density : FOG_BASE) * 60000;
    return clamp(base - rainCut - fogCut * 0.4, 60, base);
  }

  // A one-line summary for the pause menu / save screen.
  summaryLine() {
    const f = this.forecast(3);
    const next = f.length > 1 ? f[1].label : this.currentLabel;
    return `${this.description}. Next: ${next}. Strikes so far: ${this.strikes}.`;
  }
}
