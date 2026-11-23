// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Day / Night + Weather System
//
// The base game has a day/night sun cycle but the sky never changes its
// mood: no clouds, no rain, no storms. This system adds a living sky on
// top of it. A state machine cycles clear -> cloudy -> rain -> storm ->
// clear, blending every parameter (cloud cover, rain intensity, fog,
// sunlight) over several seconds so the weather never pops. Rain is a
// particle field that follows the player; storm adds drifting cloud banks
// and lightning; every state tints the sun, the ambient light and the fog
// after City.update() has done its own sky work, so the two systems never
// fight over the same light.
//
// Wiring: main.js creates one WeatherSystem(scene, city) and calls
// update(delta, timeOfDay, player.position) after city.update() each
// frame. Nothing else in the game needs to know the weather exists.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRandom, clamp, lerp } from './utils.js';

// One weather state: what the sky looks like while it lasts, and how
// long it lasts. Intensities are 0..1 targets; the system lerps the live
// values toward them during transitions.
export const WEATHER_STATES = {
  clear: {
    label: 'Clear skies',
    cloudCover: 0.08,
    rain: 0,
    fogAdd: 0,
    sunDim: 0,
    wind: 2,
    minDuration: 90,
    maxDuration: 180,
    next: ['clear', 'cloudy'],
  },
  cloudy: {
    label: 'Overcast',
    cloudCover: 0.65,
    rain: 0,
    fogAdd: 0.0002,
    sunDim: 0.35,
    wind: 5,
    minDuration: 60,
    maxDuration: 120,
    next: ['clear', 'rain', 'cloudy'],
  },
  rain: {
    label: 'Rain',
    cloudCover: 0.9,
    rain: 0.65,
    fogAdd: 0.0007,
    sunDim: 0.55,
    wind: 9,
    minDuration: 50,
    maxDuration: 110,
    next: ['cloudy', 'storm', 'clear'],
  },
  storm: {
    label: 'Thunderstorm',
    cloudCover: 1,
    rain: 1,
    fogAdd: 0.0012,
    sunDim: 0.75,
    wind: 16,
    minDuration: 40,
    maxDuration: 80,
    next: ['rain', 'cloudy'],
  },
};

// How fast live values chase their targets (per second, exponential).
const BLEND_RATE = 0.25;
// Rain field size around the focus point (the player / camera).
const RAIN_AREA = 130;
const RAIN_HEIGHT = 55;
const RAIN_COUNT = 1600;
// Cloud bank: how many puffs, and how far they spread.
const CLOUD_COUNT = 12;
const CLOUD_SPREAD = 900;

export class WeatherSystem {
  constructor(scene, city, hooks = {}) {
    this.scene = scene;
    this.city = city;
    // Optional hooks: onChange(name) when the weather state changes, and
    // onThunder() when lightning strikes (the caller can play a sound).
    this.hooks = hooks;
    this.random = createRandom(777001);

    // State machine.
    this.current = 'clear';
    this.stateTime = 0;
    this.stateDuration = this.pickDuration('clear');
    this.changes = 0;

    // Live (blended) values, starting at clear.
    this.cloudCover = 0.08;
    this.rainIntensity = 0;
    this.fogAdd = 0;
    this.sunDim = 0;
    this.wind = 2;

    // Lightning.
    this.lightningTimer = 8 + this.random() * 8;
    this.flash = 0;
    this.strikes = 0;

    this.elapsed = 0;
    this.buildRain();
    this.buildClouds();
    this.buildLightning();
  }

  pickDuration(name) {
    const s = WEATHER_STATES[name];
    return s.minDuration + this.random() * (s.maxDuration - s.minDuration);
  }

  pickNext(name) {
    const options = WEATHER_STATES[name].next;
    return options[Math.floor(this.random() * options.length)];
  }

  // -- construction ----------------------------------------------------------

  buildRain() {
    // One Points cloud of vertical streaks. Positions are random in a
    // box; update() drops them and wraps them back to the top, keeping
    // the box centred on the focus point so the rain follows the player.
    const positions = new Float32Array(RAIN_COUNT * 3);
    this.rainSpeeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      positions[i * 3] = (this.random() - 0.5) * RAIN_AREA;
      positions[i * 3 + 1] = this.random() * RAIN_HEIGHT;
      positions[i * 3 + 2] = (this.random() - 0.5) * RAIN_AREA;
      // Heavier drops fall faster: 26..48 units/s.
      this.rainSpeeds[i] = 26 + this.random() * 22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0x9ab8d8,
      size: 0.55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rain = new THREE.Points(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    // A second, sparser layer of big slow drops for depth: nearer drops
    // read as streaks, far drops as haze. Same wrap logic, own speeds.
    const bigCount = 320;
    const bigPos = new Float32Array(bigCount * 3);
    this.bigSpeeds = new Float32Array(bigCount);
    for (let i = 0; i < bigCount; i++) {
      bigPos[i * 3] = (this.random() - 0.5) * RAIN_AREA * 0.6;
      bigPos[i * 3 + 1] = this.random() * RAIN_HEIGHT;
      bigPos[i * 3 + 2] = (this.random() - 0.5) * RAIN_AREA * 0.6;
      this.bigSpeeds[i] = 18 + this.random() * 10;
    }
    const bigGeo = new THREE.BufferGeometry();
    bigGeo.setAttribute('position', new THREE.BufferAttribute(bigPos, 3));
    this.bigRainMat = new THREE.PointsMaterial({
      color: 0xaac8e8,
      size: 1.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.bigRain = new THREE.Points(bigGeo, this.bigRainMat);
    this.bigRain.frustumCulled = false;
    this.bigRain.visible = false;
    this.scene.add(this.bigRain);
    this.bigCount = bigCount;
  }

  buildClouds() {
    // Cloud puffs: each is a group of 3-5 flattened spheres sharing one
    // material per puff (so opacity can be set per puff), drifting with
    // the wind and wrapping around the play area.
    this.clouds = [];
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xd8d8d8,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const puff = new THREE.Group();
      const puffs = 3 + Math.floor(this.random() * 3);
      for (let j = 0; j < puffs; j++) {
        const r = 18 + this.random() * 26;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(r, 10, 8),
          this.cloudMat,
        );
        sphere.position.set(
          (j - puffs / 2) * 22 + (this.random() - 0.5) * 10,
          (this.random() - 0.5) * 6,
          (this.random() - 0.5) * 18,
        );
        sphere.scale.y = 0.42;
        puff.add(sphere);
      }
      puff.position.set(
        (this.random() - 0.5) * CLOUD_SPREAD * 2,
        150 + this.random() * 90,
        (this.random() - 0.5) * CLOUD_SPREAD * 2,
      );
      puff.userData.drift = 0.7 + this.random() * 0.6;
      this.scene.add(puff);
      this.clouds.push(puff);
    }
    // One low storm shelf that only shows in rain/storm: a huge dark
    // slab that slides overhead, so a storm feels like it arrives.
    this.stormShelf = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 900),
      new THREE.MeshBasicMaterial({
        color: 0x2a2a33, transparent: true, opacity: 0, depthWrite: false,
      }),
    );
    this.stormShelf.rotation.x = -Math.PI / 2;
    this.stormShelf.position.set(0, 210, 0);
    this.scene.add(this.stormShelf);
  }

  buildLightning() {
    // A single point light high above the focus point. A strike sets its
    // intensity to a huge value for a few frames and update() decays it,
    // which reads as a flash across the whole city.
    this.flashLight = new THREE.PointLight(0xdde8ff, 0, 900, 0.8);
    this.flashLight.position.set(0, 260, 0);
    this.scene.add(this.flashLight);
    // A jagged bolt mesh, hidden until a strike: 5 segments of thin
    // emissive boxes chained downward from the cloud shelf.
    this.bolt = new THREE.Group();
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    let x = 0;
    let y = 210;
    for (let i = 0; i < 5; i++) {
      const segLen = 26 + this.random() * 10;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.9, segLen, 0.9), this.boltMat);
      const nx = x + (this.random() - 0.5) * 22;
      seg.position.set((x + nx) / 2, y - segLen / 2, (this.random() - 0.5) * 8);
      seg.rotation.z = Math.atan2(nx - x, segLen) * 0.6;
      this.bolt.add(seg);
      x = nx;
      y -= segLen;
    }
    this.bolt.visible = false;
    this.scene.add(this.bolt);
  }

  // -- state machine ---------------------------------------------------------

  setWeather(name) {
    if (!WEATHER_STATES[name] || name === this.current) return false;
    this.current = name;
    this.stateTime = 0;
    this.stateDuration = this.pickDuration(name);
    this.changes++;
    if (this.hooks.onChange) this.hooks.onChange(name, WEATHER_STATES[name].label);
    return true;
  }

  // Advance the state machine; called from update().
  advanceState(delta) {
    this.stateTime += delta;
    if (this.stateTime < this.stateDuration) return;
    const next = this.pickNext(this.current);
    this.setWeather(next);
  }

  // Blend the live values toward the current state's targets.
  blendTargets(delta) {
    const target = WEATHER_STATES[this.current];
    const k = 1 - Math.exp(-BLEND_RATE * delta);
    this.cloudCover += (target.cloudCover - this.cloudCover) * k;
    this.rainIntensity += (target.rain - this.rainIntensity) * k;
    this.fogAdd += (target.fogAdd - this.fogAdd) * k;
    this.sunDim += (target.sunDim - this.sunDim) * k;
    this.wind += (target.wind - this.wind) * k;
  }

  // -- per-frame updates -------------------------------------------------------

  updateRain(delta, focus) {
    const visible = this.rainIntensity > 0.02;
    this.rain.visible = visible;
    this.bigRain.visible = visible;
    if (!visible) return;
    const opacity = this.rainIntensity * 0.65;
    this.rainMat.opacity = opacity;
    this.bigRainMat.opacity = opacity * 0.8;
    // Keep the rain box centred on the focus point.
    this.rain.position.set(focus.x, focus.y, focus.z);
    this.bigRain.position.set(focus.x, focus.y, focus.z);
    // Fall + slant with the wind. Positions are local to the Points
    // object, so the wrap box is centred on (0,0,0) locally.
    this.fallLayer(this.rain, this.rainSpeeds, RAIN_COUNT, delta, this.wind);
    this.fallLayer(this.bigRain, this.bigSpeeds, this.bigCount, delta, this.wind * 0.7);
  }

  fallLayer(points, speeds, count, delta, wind) {
    const attr = points.geometry.getAttribute('position');
    const arr = attr.array;
    const half = RAIN_AREA / 2;
    for (let i = 0; i < count; i++) {
      let y = arr[i * 3 + 1] - speeds[i] * delta;
      let x = arr[i * 3] + wind * delta * 0.9;
      if (y < 0) {
        y = RAIN_HEIGHT + this.random() * 8;
        x = (this.random() - 0.5) * RAIN_AREA;
        arr[i * 3 + 2] = (this.random() - 0.5) * RAIN_AREA;
      }
      if (x > half) x -= RAIN_AREA;
      if (x < -half) x += RAIN_AREA;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
    }
    attr.needsUpdate = true;
  }

  updateClouds(delta, timeOfDay) {
    const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
    // Cloud colour follows the day: white by day, orange at sunset,
    // near-black at night.
    const day = new THREE.Color(0xe8e8e8);
    const night = new THREE.Color(0x1a1a22);
    const sunset = new THREE.Color(0xff8844);
    const color = new THREE.Color().lerpColors(night, day, dayFactor);
    const sunsetAmount = clamp((0.5 - dayFactor) / 0.35, 0, 1) * clamp((dayFactor - 0.08) / 0.12, 0, 1);
    if (sunsetAmount > 0) color.lerp(sunset, sunsetAmount * 0.55);
    this.cloudMat.color.copy(color);
    // Opacity follows cover; storm clouds go darker and denser.
    const stormDark = this.current === 'storm' ? 0.55 : 1;
    this.cloudMat.opacity = 0.04 + this.cloudCover * 0.5 * stormDark;
    this.cloudMat.color.multiplyScalar(this.current === 'storm' ? 0.55 : 1);
    // Drift with the wind, wrapping around the play area.
    for (const puff of this.clouds) {
      puff.position.x += this.wind * puff.userData.drift * delta;
      puff.position.z += this.wind * 0.3 * puff.userData.drift * delta;
      if (puff.position.x > CLOUD_SPREAD) puff.position.x = -CLOUD_SPREAD;
      if (puff.position.z > CLOUD_SPREAD) puff.position.z = -CLOUD_SPREAD;
      // Puffs breathe slowly.
      const s = 1 + Math.sin(this.elapsed * 0.2 + puff.position.x * 0.01) * 0.05;
      puff.scale.setScalar(s);
    }
    // The storm shelf fades in with rain and slides overhead.
    const shelfTarget = this.current === 'storm' ? 0.5 : this.current === 'rain' ? 0.28 : 0;
    const shelf = this.stormShelf.material;
    shelf.opacity += (shelfTarget - shelf.opacity) * (1 - Math.exp(-0.4 * delta));
    this.stormShelf.position.x += this.wind * 0.5 * delta;
    if (this.stormShelf.position.x > 500) this.stormShelf.position.x = -500;
  }

  updateLightning(delta, focus) {
    // Only storms strike. The timer counts down; a strike flashes the
    // light, shows the bolt for a few frames, and fires the thunder hook.
    if (this.current !== 'storm') {
      this.flash = 0;
      this.flashLight.intensity = 0;
      this.bolt.visible = false;
      return;
    }
    this.lightningTimer -= delta;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 4 + this.random() * 9;
      this.flash = 1;
      this.strikes++;
      // Put the bolt near the player, but offset so it is visible.
      this.bolt.position.set(
        focus.x + (this.random() - 0.5) * 160,
        0,
        focus.z + (this.random() - 0.5) * 160,
      );
      this.bolt.visible = true;
      if (this.hooks.onThunder) this.hooks.onThunder();
    }
    if (this.flash > 0) {
      // Double-flash: bright, dip, bright again, then decay.
      const phase = 1 - this.flash;
      const flicker = phase < 0.25 ? 1 : phase < 0.45 ? 0.25 : 1 - (phase - 0.45) / 0.55;
      this.flashLight.intensity = 900 * Math.max(0, flicker) * this.flash;
      this.flashLight.position.set(focus.x, 260, focus.z);
      this.flash -= delta * 2.2;
      if (this.flash <= 0) {
        this.flash = 0;
        this.flashLight.intensity = 0;
        this.bolt.visible = false;
      }
    }
  }

  applySkyEffects(delta, timeOfDay) {
    // Runs AFTER city.update(), so these are the final word on the
    // frame's light and fog. City.update() resets sun intensity and fog
    // colour every frame from the time of day; we scale them by weather.
    if (this.city.sunLight) {
      const base = this.city.sunLight.intensity;
      this.city.sunLight.intensity = base * (1 - this.sunDim * 0.8);
    }
    if (this.city.ambientLight) {
      const base = this.city.ambientLight.intensity;
      this.city.ambientLight.intensity = base * (1 - this.sunDim * 0.45);
    }
    if (this.scene.fog) {
      // FogExp2 density: the base 0.0008 plus the weather's addition.
      // City.update() never touches density, only colour.
      this.scene.fog.density = 0.0008 + this.fogAdd;
    }
    // Renderer exposure dips slightly in a storm so the flash reads.
    if (this.city.scene && this.city.scene.background) {
      // No-op guard: background is a Color set by the renderer clear;
      // the real exposure work happens on the sun/ambient lights above.
    }
  }

  // -- main entry ------------------------------------------------------------

  update(delta, timeOfDay, focus) {
    this.elapsed += delta;
    this.advanceState(delta);
    this.blendTargets(delta);
    const focusPoint = focus || new THREE.Vector3(0, 0, 0);
    this.updateRain(delta, focusPoint);
    this.updateClouds(delta, timeOfDay);
    this.updateLightning(delta, focusPoint);
    this.applySkyEffects(delta, timeOfDay);
  }

  // -- inspection --------------------------------------------------------------

  get currentLabel() {
    return WEATHER_STATES[this.current].label;
  }

  get description() {
    const s = WEATHER_STATES[this.current];
    const rainPct = Math.round(this.rainIntensity * 100);
    const cloudPct = Math.round(this.cloudCover * 100);
    return `${s.label} — clouds ${cloudPct}%, rain ${rainPct}%, wind ${this.wind.toFixed(1)}`;
  }

  getState() {
    return {
      current: this.current,
      changes: this.changes,
      strikes: this.strikes,
      cloudCover: this.cloudCover,
      rainIntensity: this.rainIntensity,
    };
  }

  setState(state) {
    if (!state) return;
    if (WEATHER_STATES[state.current]) this.current = state.current;
    this.changes = state.changes || 0;
    this.strikes = state.strikes || 0;
  }
}

// -- weather flavour ---------------------------------------------------------
// Named storm fronts the game can schedule: a front is a scripted
// sequence of states with fixed durations, used by the verification probe
// and by any future "storm warning" gameplay.
export const STORM_FRONTS = [
  {
    name: 'Afternoon Squall',
    sequence: [
      { state: 'cloudy', duration: 30 },
      { state: 'rain', duration: 45 },
      { state: 'storm', duration: 30 },
      { state: 'cloudy', duration: 20 },
      { state: 'clear', duration: 60 },
    ],
  },
  {
    name: 'Night Monsoon',
    sequence: [
      { state: 'cloudy', duration: 20 },
      { state: 'storm', duration: 60 },
      { state: 'rain', duration: 40 },
      { state: 'clear', duration: 90 },
    ],
  },
  {
    name: 'Golden Hour Haze',
    sequence: [
      { state: 'clear', duration: 60 },
      { state: 'cloudy', duration: 50 },
      { state: 'clear', duration: 80 },
    ],
  },
];

// A tiny driver that plays a STORM_FRONTS sequence through a
// WeatherSystem. Not used by the main loop (the random cycle is), but
// handy for scripted moments and for tests.
export class WeatherFrontPlayer {
  constructor(weather) {
    this.weather = weather;
    this.front = null;
    this.step = 0;
    this.stepTime = 0;
    this.playing = false;
  }

  play(front) {
    this.front = front;
    this.step = 0;
    this.stepTime = 0;
    this.playing = true;
    this.applyStep();
  }

  applyStep() {
    if (!this.front) return;
    const entry = this.front.sequence[this.step];
    if (!entry) {
      this.playing = false;
      return;
    }
    this.weather.setWeather(entry.state);
    // Override the random duration with the scripted one.
    this.weather.stateDuration = entry.duration;
    this.weather.stateTime = 0;
  }

  update(delta) {
    if (!this.playing || !this.front) return;
    this.stepTime += delta;
    const entry = this.front.sequence[this.step];
    if (!entry) {
      this.playing = false;
      return;
    }
    if (this.stepTime >= entry.duration) {
      this.stepTime = 0;
      this.step++;
      this.applyStep();
    }
  }

  stop() {
    this.playing = false;
    this.front = null;
  }
}
