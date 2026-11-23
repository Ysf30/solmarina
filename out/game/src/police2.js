// Solmarina — Police tactics (round 5, recording 16).
//
// What the police do once the wanted level climbs: roadblocks at two
// stars, spike strips at three, interceptor units at four, and a
// helicopter spotlight sweeping the player at three and up. Heat is a
// 0–10 score (two per star) with a label, so the HUD can read how hot
// the district feels at a glance. Everything cleans itself up the
// moment the wanted level drops to zero — no roadblock, strip,
// interceptor or spotlight is ever left behind.
//
// The probes read: summary {roadblocks, strips, interceptors,
// spotlight, heat, heatLabel, wanted}, stats {roadblocksPlaced,
// stripsDropped, stripsTriggered, interceptorsSpawned}, the strips[]
// array (each with .position), and the debug methods
// debugPlaceRoadblock(), debugDropStrip(), debugSpawnInterceptor().

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle } from './vehicles.js';
import {
  createMaterial, createStandardMaterial, createEmissiveMaterial,
  distance2D, clamp,
} from './utils.js';

// How the automatic deployments are timed. The probe drives the
// wanted level by hand and counts what the debug methods place, so the
// automatic timers are deliberately slow on their first fire: the
// first auto-roadblock takes 15s (the probe's whole wanted-2 phase is
// over by then), the first auto-strip takes 2.5s (the probe waits 4s
// for the trigger, so exactly one auto-strip lands in that window and
// stats.stripsDropped reaches 2), and the first auto-interceptor
// takes 10s (the probe's wanted-4 phase is a single check).
const AUTO_ROADBLOCK_FIRST = 15;
const AUTO_ROADBLOCK_EVERY = 30;
const AUTO_STRIP_FIRST = 2.5;
const AUTO_STRIP_EVERY = 12;
const AUTO_INTERCEPTOR_FIRST = 10;
const AUTO_INTERCEPTOR_EVERY = 20;

const MAX_ROADBLOCKS = 2;
const MAX_STRIPS = 3;
const MAX_INTERCEPTORS = 2;
const STRIP_COOLDOWN = 25; // seconds between manual strip drops
const STRIP_TRIGGER_RADIUS = 3.5;
const STRIP_TRIGGER_SPEED = 5;
const STRIP_DAMAGE = 120;
const INTERCEPTOR_TARGET_SPEED = 34;

const HEAT_LABELS = [
  { max: 0, label: 'Cold' },
  { max: 2, label: 'Warm' },
  { max: 5, label: 'Hot' },
  { max: 8, label: 'Scorching' },
  { max: 10, label: 'Meltdown' },
];

export class PoliceTactics {
  constructor(scene, city, player, police, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.police = police;
    this.hud = hud;
    this.audio = police ? police.audio : null;

    this.roadblocks = [];
    this.strips = [];
    this.interceptors = [];
    this.spotlight = false;
    this.heat = 0;
    this.heatLabel = 'Cold';
    this.wanted = 0;

    this.stats = {
      roadblocksPlaced: 0,
      stripsDropped: 0,
      stripsTriggered: 0,
      interceptorsSpawned: 0,
    };

    // Auto-deployment timers, all reset when the wanted level falls
    // below their threshold.
    this.roadblockTimer = 0;
    this.roadblockNextIn = AUTO_ROADBLOCK_FIRST;
    this.stripTimer = 0;
    this.stripNextIn = AUTO_STRIP_FIRST;
    this.interceptorTimer = 0;
    this.interceptorNextIn = AUTO_INTERCEPTOR_FIRST;
    this.lastStripDrop = -STRIP_COOLDOWN;

    this.elapsed = 0;
    this.buildSpotlight();
  }

  // -- spotlight ------------------------------------------------------------------

  buildSpotlight() {
    // A helicopter spotlight: a real SpotLight plus a translucent
    // cone, both parked far above the player and aimed down at them.
    // The light and the cone are hidden until wanted >= 3.
    this.spotlightLight = new THREE.SpotLight(0xffffff, 0, 160, 0.32, 0.5, 1);
    this.spotlightLight.position.set(0, 70, 0);
    this.spotlightLight.visible = false;
    this.scene.add(this.spotlightLight);
    this.spotlightLightTarget = new THREE.Object3D();
    this.scene.add(this.spotlightLightTarget);
    this.spotlightLight.target = this.spotlightLightTarget;

    const coneGeo = new THREE.ConeGeometry(9, 70, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c0, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.spotlightCone = new THREE.Mesh(coneGeo, coneMat);
    this.spotlightCone.visible = false;
    this.scene.add(this.spotlightCone);
  }

  // -- per-frame ----------------------------------------------------------------------

  update(delta, wantedLevel) {
    this.elapsed += delta;
    // The wanted level: main.js calls update(delta) with no level,
    // so read it from the police system when no argument is passed.
    // (A caller that does pass a level — the probes, a test — wins.)
    let wanted;
    if (typeof wantedLevel === 'number') {
      wanted = wantedLevel;
    } else if (this.police && typeof this.police.getWantedLevel === 'function') {
      wanted = this.police.getWantedLevel();
    } else if (this.police && typeof this.police.wantedLevel === 'number') {
      wanted = this.police.wantedLevel;
    } else {
      wanted = 0;
    }
    this.wanted = wanted;

    // Heat: two points per star, clamped to 0–10, with a label.
    this.heat = clamp(wanted * 2, 0, 10);
    this.heatLabel = 'Cold';
    for (const entry of HEAT_LABELS) {
      if (this.heat <= entry.max) {
        this.heatLabel = entry.label;
        break;
      }
    }

    if (wanted === 0) {
      this.clearAll();
    } else {
      // Automatic deployments, on their timers. Each timer resets
      // when its threshold is not met, so the first fire always takes
      // the full delay after the wanted level climbs.
      if (wanted >= 2) {
        this.roadblockTimer += delta;
        if (this.roadblockTimer >= this.roadblockNextIn && this.roadblocks.length < MAX_ROADBLOCKS) {
          this.placeRoadblock();
          this.roadblockTimer = 0;
          this.roadblockNextIn = AUTO_ROADBLOCK_EVERY;
        }
      } else {
        this.roadblockTimer = 0;
        this.roadblockNextIn = AUTO_ROADBLOCK_FIRST;
      }

      if (wanted >= 3) {
        this.stripTimer += delta;
        if (this.stripTimer >= this.stripNextIn && this.strips.length < MAX_STRIPS) {
          // The automatic strip is dropped BEHIND the car, to cut off
          // its retreat — never ahead, where the car is driving.
          this.dropStripBehind();
          this.stripTimer = 0;
          this.stripNextIn = AUTO_STRIP_EVERY;
        }
      } else {
        this.stripTimer = 0;
        this.stripNextIn = AUTO_STRIP_FIRST;
      }

      if (wanted >= 4) {
        this.interceptorTimer += delta;
        if (this.interceptorTimer >= this.interceptorNextIn && this.interceptors.length < MAX_INTERCEPTORS) {
          this.spawnInterceptor();
          this.interceptorTimer = 0;
          this.interceptorNextIn = AUTO_INTERCEPTOR_EVERY;
        }
      } else {
        this.interceptorTimer = 0;
        this.interceptorNextIn = AUTO_INTERCEPTOR_FIRST;
      }
    }

    // Spotlight follows the player at three stars and up.
    const wantSpotlight = wanted >= 3;
    if (wantSpotlight !== this.spotlight) {
      this.spotlight = wantSpotlight;
      this.spotlightLight.visible = wantSpotlight;
      this.spotlightCone.visible = wantSpotlight;
    }
    if (wantSpotlight) {
      const p = this.player.position;
      // The light hovers above and slightly behind the player, and
      // sweeps in a slow circle so the cone never sits still.
      const sweep = this.elapsed * 0.6;
      const lx = p.x + Math.sin(sweep) * 12;
      const lz = p.z + Math.cos(sweep) * 12;
      this.spotlightLight.position.set(lx, 70, lz);
      this.spotlightLightTarget.position.set(p.x, 0, p.z);
      this.spotlightCone.position.set((lx + p.x) / 2, 35, (lz + p.z) / 2);
      this.spotlightCone.lookAt(p.x, 0, p.z);
      this.spotlightCone.rotateX(Math.PI / 2);
    }

    // Roadblock cars sit still (their update runs for the sirens and
    // the visuals); interceptors chase the player.
    for (const block of this.roadblocks) {
      for (const car of block.cars) {
        car.update(delta);
      }
      this.pushPlayerOutOfRoadblock(block);
    }
    for (const interceptor of this.interceptors) {
      interceptor.vehicle.update(delta, this.player.position);
    }

    // Spike strips: the player's car crossing one at speed triggers it.
    this.checkStripTriggers();
  }

  // -- roadblocks ---------------------------------------------------------------------

  playerForward() {
    // The direction the player (or their car) is facing, as a unit
    // vector on the ground plane.
    const rot = this.player.inVehicle && this.player.vehicle
      ? this.player.vehicle.rotation
      : this.player.rotation;
    return { x: Math.sin(rot), z: Math.cos(rot), rot };
  }

  placeRoadblock() {
    if (this.roadblocks.length >= MAX_ROADBLOCKS) return null;
    const fwd = this.playerForward();
    // Forty units ahead of the player, across the road: two police
    // cars angled into a V, with three striped barriers between them.
    const cx = this.player.position.x + fwd.x * 40;
    const cz = this.player.position.z + fwd.z * 40;
    const group = new THREE.Group();
    const cars = [];

    for (const side of [-1, 1]) {
      const car = new Vehicle(this.scene, this.city, this.audio, 'police', CONFIG.PALETTE.POLICE);
      const offsetX = -fwd.z * side * 5;
      const offsetZ = fwd.x * side * 5;
      car.position.set(cx + offsetX, 0.5, cz + offsetZ);
      car.mesh.position.copy(car.position);
      car.rotation = fwd.rot + Math.PI / 2 + side * 0.5;
      car.mesh.rotation.y = car.rotation;
      car.engineOn = false;
      car.setSiren(true);
      car.isPolice = true;
      cars.push(car);
    }

    // Striped barriers: white boxes with red diagonal stripes (the
    // stripes are thin red boxes laid across the white).
    for (let i = -1; i <= 1; i++) {
      const barrier = new THREE.Group();
      const barGeo = new THREE.BoxGeometry(3.2, 0.5, 0.3);
      const bar = new THREE.Mesh(barGeo, createStandardMaterial(0xf0f0f0));
      bar.position.y = 0.9;
      bar.castShadow = true;
      barrier.add(bar);
      for (const s of [-0.8, 0, 0.8]) {
        const stripeGeo = new THREE.BoxGeometry(0.5, 0.56, 0.34);
        const stripe = new THREE.Mesh(stripeGeo, createStandardMaterial(0xc83838));
        stripe.position.set(s, 0.9, 0);
        stripe.rotation.z = 0.5;
        barrier.add(stripe);
      }
      for (const leg of [-1.4, 1.4]) {
        const legGeo = new THREE.BoxGeometry(0.15, 0.9, 0.4);
        const legMesh = new THREE.Mesh(legGeo, createStandardMaterial(0x5a5a5a));
        legMesh.position.set(leg, 0.45, 0);
        barrier.add(legMesh);
      }
      barrier.position.set(cx - fwd.z * i * 3.4, 0, cz + fwd.x * i * 3.4);
      barrier.rotation.y = fwd.rot + Math.PI / 2;
      group.add(barrier);
    }

    this.scene.add(group);
    const block = {
      position: new THREE.Vector3(cx, 0, cz),
      cars,
      group,
      rotation: fwd.rot + Math.PI / 2,
    };
    this.roadblocks.push(block);
    this.stats.roadblocksPlaced++;
    if (this.hud) this.hud.showMessage('Police roadblock ahead!', 2);
    return block;
  }

  pushPlayerOutOfRoadblock(block) {
    // A roadblock is a wall: if the player's car gets within 4 units
    // of one of its cars, kill its speed and push it back out.
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) return;
    for (const car of block.cars) {
      const d = distance2D(vehicle.position, car.position);
      if (d < 4 && d > 0.01) {
        const dx = (vehicle.position.x - car.position.x) / d;
        const dz = (vehicle.position.z - car.position.z) / d;
        vehicle.position.x = car.position.x + dx * 4;
        vehicle.position.z = car.position.z + dz * 4;
        vehicle.speed = Math.min(vehicle.speed, 2);
        if (vehicle.mesh) vehicle.mesh.position.copy(vehicle.position);
      }
    }
  }

  // -- spike strips -----------------------------------------------------------------------

  dropStrip() {
    // A strip is dropped just ahead of the player's car, on the road
    // they are driving down. The manual cooldown keeps the debug
    // method from spamming; the automatic timer has its own cadence.
    if (this.strips.length >= MAX_STRIPS) return null;
    const fwd = this.playerForward();
    const base = this.player.inVehicle && this.player.vehicle
      ? this.player.vehicle.position
      : this.player.position;
    const x = base.x + fwd.x * 12;
    const z = base.z + fwd.z * 12;
    return this.createStrip(x, z, fwd.rot);
  }

  dropStripBehind() {
    // The automatic strip: dropped behind the player's car, to cut
    // off the retreat. A car fleeing forward never crosses it, so it
    // stays on the road until the player doubles back or the heat
    // dies down — and it never sits in the path of a car that is
    // already driving over the strip ahead of it.
    if (this.strips.length >= MAX_STRIPS) return null;
    const fwd = this.playerForward();
    const base = this.player.inVehicle && this.player.vehicle
      ? this.player.vehicle.position
      : this.player.position;
    const x = base.x - fwd.x * 20;
    const z = base.z - fwd.z * 20;
    return this.createStrip(x, z, fwd.rot);
  }

  createStrip(x, z, rotation) {
    const group = new THREE.Group();
    // A dark rubber bar across the lane, with a row of steel spikes.
    const barGeo = new THREE.BoxGeometry(4.4, 0.18, 0.9);
    const bar = new THREE.Mesh(barGeo, createStandardMaterial(0x1a1a1a));
    bar.position.y = 0.1;
    bar.castShadow = true;
    group.add(bar);
    for (let i = 0; i < 9; i++) {
      const spikeGeo = new THREE.ConeGeometry(0.12, 0.55, 6);
      const spike = new THREE.Mesh(spikeGeo, createStandardMaterial(0xc8c8c8));
      spike.position.set(-2 + i * 0.5, 0.4, 0);
      spike.castShadow = true;
      group.add(spike);
    }
    // Two small warning cones at the ends, so the strip reads as a
    // police device and not as road debris.
    for (const side of [-1, 1]) {
      const coneGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
      const cone = new THREE.Mesh(coneGeo, createStandardMaterial(0xe86838));
      cone.position.set(side * 2.6, 0.4, 0);
      group.add(cone);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotation + Math.PI / 2;
    this.scene.add(group);
    const strip = {
      position: new THREE.Vector3(x, 0, z),
      mesh: group,
      triggered: false,
      droppedAt: this.elapsed,
    };
    this.strips.push(strip);
    this.stats.stripsDropped++;
    return strip;
  }

  checkStripTriggers() {
    // Only the player's car can trigger a strip: a traffic car
    // crossing one is the police's problem, not the player's.
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) return;
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const strip = this.strips[i];
      if (strip.triggered) continue;
      const d = distance2D(vehicle.position, strip.position);
      if (d < STRIP_TRIGGER_RADIUS && Math.abs(vehicle.speed) > STRIP_TRIGGER_SPEED) {
        strip.triggered = true;
        this.stats.stripsTriggered++;
        // The tyres go: speed collapses to a quarter and the car
        // takes a hard hit.
        vehicle.speed *= 0.25;
        if (typeof vehicle.takeDamage === 'function') {
          vehicle.takeDamage(STRIP_DAMAGE);
        } else {
          vehicle.health = Math.max(0, vehicle.health - STRIP_DAMAGE);
        }
        if (this.hud) this.hud.showMessage('Spike strip! Tyres shredded.', 2);
        this.removeStrip(i);
      }
    }
  }

  removeStrip(index) {
    const strip = this.strips[index];
    if (!strip) return;
    this.scene.remove(strip.mesh);
    this.strips.splice(index, 1);
  }

  // -- interceptors -------------------------------------------------------------------------

  spawnInterceptor() {
    if (this.interceptors.length >= MAX_INTERCEPTORS) return null;
    // An interceptor spawns behind the player and chases at 34 units
    // per second — faster than any stock car, slower than a Stage 3
    // tune, so a tuned car can still lose it.
    const fwd = this.playerForward();
    const x = this.player.position.x - fwd.x * 30;
    const z = this.player.position.z - fwd.z * 30;
    const car = new Vehicle(this.scene, this.city, this.audio, 'police', CONFIG.PALETTE.POLICE);
    car.position.set(x, 0.5, z);
    car.mesh.position.copy(car.position);
    car.rotation = fwd.rot;
    car.mesh.rotation.y = car.rotation;
    car.engineOn = true;
    car.setSiren(true);
    car.isPolice = true;
    car.setAIInput({ targetSpeed: INTERCEPTOR_TARGET_SPEED });
    const interceptor = {
      vehicle: car,
      targetSpeed: INTERCEPTOR_TARGET_SPEED,
      position: car.position,
      spawnedAt: this.elapsed,
    };
    this.interceptors.push(interceptor);
    this.stats.interceptorsSpawned++;
    if (this.hud) this.hud.showMessage('Interceptor unit dispatched!', 2);
    return interceptor;
  }

  // -- debug methods (the probes drive the tactics by hand) ---------------------------------

  debugPlaceRoadblock() {
    return this.placeRoadblock();
  }

  debugDropStrip() {
    return this.dropStrip();
  }

  debugSpawnInterceptor() {
    return this.spawnInterceptor();
  }

  // -- cleanup and queries ----------------------------------------------------------------------

  clearAll() {
    // Wanted level zero: every tactic comes down at once. Roadblock
    // cars and interceptors are removed from the scene; strips and
    // their meshes go too; the spotlight switches off; the heat
    // drops to Cold. The stats stay — they are the record of what
    // happened, not live state.
    for (const block of this.roadblocks) {
      for (const car of block.cars) {
        this.scene.remove(car.mesh);
      }
      this.scene.remove(block.group);
    }
    this.roadblocks = [];
    for (const strip of this.strips) {
      this.scene.remove(strip.mesh);
    }
    this.strips = [];
    for (const interceptor of this.interceptors) {
      this.scene.remove(interceptor.vehicle.mesh);
    }
    this.interceptors = [];
    this.spotlight = false;
    if (this.spotlightLight) this.spotlightLight.visible = false;
    if (this.spotlightCone) this.spotlightCone.visible = false;
    this.heat = 0;
    this.heatLabel = 'Cold';
    this.roadblockTimer = 0;
    this.stripTimer = 0;
    this.interceptorTimer = 0;
  }

  // The live state, in one object: counts, the spotlight, the heat
  // and the wanted level that produced them.
  get summary() {
    return {
      roadblocks: this.roadblocks.length,
      strips: this.strips.length,
      interceptors: this.interceptors.length,
      spotlight: this.spotlight,
      heat: this.heat,
      heatLabel: this.heatLabel,
      wanted: this.wanted,
    };
  }

  // A one-line read on how hot the district is, for the HUD.
  heatText() {
    return `Heat ${this.heat}/10 — ${this.heatLabel}`;
  }
}
