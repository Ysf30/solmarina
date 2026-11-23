// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Police Tactics Upgrade ("Heat Tactics")
//
// The base PoliceSystem spawns chase cars and helicopters, but the cops
// never do anything clever: they just drive at the player. This system
// layers tactics on top of it, driven by the wanted level:
//
//  2 stars — Roadblocks: pairs of parked police cars + barriers + cones
//            placed on the street ahead of the player, so the escape
//            route is blocked and the player must detour or ram through.
//  3 stars — Spike strips: dropped ahead of the player on the street;
//            driving over one at speed shreds the tyres (heavy slow +
//            damage) and ends the strip. Plus a helicopter spotlight cone
//            that tracks the player from above while any heli is up.
//  4 stars — Interceptors: a fast pursuit unit (Stage-3-tuned engine,
//            higher chase speed) that joins the chase and does not give
//            up until the heat drops.
//  5 stars — Full lockdown: roadblocks refresh faster, strips drop more
//            often, and two interceptors hunt at once.
//
// Everything here is owned by PoliceTactics, not by PoliceSystem: the
// roadblock cars are never added to police.policeCars (so the base
// system never drives them away), and every tactic cleans itself up the
// moment the wanted level hits 0. The base system stays the source of
// truth for stars, crime points and busts; this system only reads them.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle } from './vehicles.js';
import {
  createStandardMaterial,
  createEmissiveMaterial,
  distance2D,
  clamp,
  createRandom,
} from './utils.js';

// Roadblock formations: how the blocking cars, barriers and cones are
// laid out across the road. 'wall' is a full block, 'funnel' leaves a
// gap on one side (the cops funnel the player into it), 'checkpoint'
// is a single car + barriers for low heat.
export const ROADBLOCK_FORMATIONS = {
  wall: {
    label: 'Full wall',
    cars: 2,
    barriers: 4,
    cones: 6,
    gap: 0,
    minWanted: 2,
  },
  funnel: {
    label: 'Funnel',
    cars: 2,
    barriers: 3,
    cones: 8,
    gap: 5,
    minWanted: 3,
    gapSide: 1,
  },
  checkpoint: {
    label: 'Checkpoint',
    cars: 1,
    barriers: 2,
    cones: 4,
    gap: 0,
    minWanted: 2,
  },
};

// Spike strip variants: a normal strip and a wide one for main streets.
export const SPIKE_STRIP_TYPES = {
  standard: { width: 4.5, spikes: 8, damage: 120, slow: 0.25 },
  wide: { width: 8, spikes: 14, damage: 150, slow: 0.2 },
};

// Interceptor tuning: what makes an interceptor faster than a normal cop.
export const INTERCEPTOR_TUNING = {
  accelMul: 1.5,
  chaseSpeed: 34,
  color: 0x0a1a3a,
};

// Timers (seconds).
const ROADBLOCK_CHECK_INTERVAL = 5;
const ROADBLOCK_MAX_AGE = 70;
const ROADBLOCK_AHEAD = 70;
const STRIP_COOLDOWN = 25;
const STRIP_AHEAD = 42;
const STRIP_MAX_AGE = 30;
const INTERCEPTOR_CHECK_INTERVAL = 4;

export class PoliceTactics {
  constructor(scene, city, player, police, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.police = police;
    this.hud = hud;
    this.random = createRandom(424242);

    // Owned units (never registered with PoliceSystem).
    this.roadblocks = [];
    this.strips = [];
    this.interceptors = [];
    this.spotlight = null;
    this.spotlightLight = null;

    // Timers.
    this.roadblockTimer = 0;
    this.stripCooldown = 0;
    this.interceptorTimer = 0;
    this.elapsed = 0;

    // Stats (for verification and the HUD heat readout).
    this.stats = {
      roadblocksPlaced: 0,
      stripsDropped: 0,
      stripsTriggered: 0,
      interceptorsSpawned: 0,
      ramsThrough: 0,
    };

    this.buildSpotlight();
  }

  // -- spotlight -------------------------------------------------------------

  buildSpotlight() {
    // A searchlight cone that hangs over the player while a helicopter
    // is up at 3+ stars. It is not attached to any heli (the helis fly
    // their own pattern); it is the visible "they can see you" signal.
    const coneGeo = new THREE.ConeGeometry(9, 46, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.spotlight = new THREE.Mesh(coneGeo, coneMat);
    // ConeGeometry points up (+Y apex at top); flip it so the wide end
    // is at the ground and the apex is at the sky.
    this.spotlight.rotation.x = Math.PI;
    this.spotlight.visible = false;
    this.scene.add(this.spotlight);
    this.spotlightLight = new THREE.PointLight(0xffffdd, 0, 60, 1.4);
    this.spotlightLight.visible = false;
    this.scene.add(this.spotlightLight);
  }

  // -- helpers ---------------------------------------------------------------

  // The street direction at the player's position, or the player's
  // heading when the player is off-street (in a plaza, on the beach).
  streetAhead() {
    const dir = this.city.getStreetDirection(this.player.position.x, this.player.position.z);
    if (dir) return dir;
    const r = this.player.mesh ? this.player.mesh.rotation.y : 0;
    return new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
  }

  // A point `distance` units ahead of the player along the street.
  pointAhead(distance) {
    const dir = this.streetAhead();
    return {
      point: new THREE.Vector3(
        this.player.position.x + dir.x * distance,
        0,
        this.player.position.z + dir.z * distance,
      ),
      dir,
    };
  }

  wanted() {
    return this.police.wantedLevel;
  }

  // -- roadblocks ------------------------------------------------------------

  pickFormation() {
    const w = this.wanted();
    if (w >= 4 && this.random() < 0.5) return ROADBLOCK_FORMATIONS.wall;
    if (w >= 3) return ROADBLOCK_FORMATIONS.funnel;
    return this.random() < 0.5 ? ROADBLOCK_FORMATIONS.wall : ROADBLOCK_FORMATIONS.checkpoint;
  }

  placeRoadblock() {
    const formation = this.pickFormation();
    const { point, dir } = this.pointAhead(ROADBLOCK_AHEAD);
    // Don't build a roadblock inside a building or off the map.
    if (Math.abs(point.x) > 980 || Math.abs(point.z) > 980) return null;
    const angle = Math.atan2(dir.x, dir.z);
    // Lateral axis across the road.
    const lat = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const group = new THREE.Group();
    group.position.copy(point);
    const cars = [];
    const barriers = [];
    const cones = [];

    // Blocking cars: parked across the road, sirens on.
    for (let i = 0; i < formation.cars; i++) {
      const offset = formation.cars === 1 ? 0 : (i === 0 ? -5.5 : 5.5);
      const car = new (this.vehicleClass())(this.scene, this.city, this.police.audio, 'police', CONFIG.PALETTE.POLICE);
      const pos = point.clone().add(lat.clone().multiplyScalar(offset));
      car.position.set(pos.x, 0.5, pos.z);
      car.rotation = angle + Math.PI / 2;
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.rotation;
      car.engineOn = true;
      car.setSiren(true);
      cars.push(car);
    }
    // Barriers: striped boxes between / beside the cars.
    for (let i = 0; i < formation.barriers; i++) {
      const t = formation.barriers === 1 ? 0 : (i / (formation.barriers - 1)) * 2 - 1;
      const offset = t * 9 + (formation.gap && formation.gapSide === 1 && i === formation.barriers - 1 ? formation.gap : 0);
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.1, 0.5),
        createStandardMaterial(i % 2 === 0 ? 0xff6600 : 0xf8f8f8),
      );
      barrier.position.set(
        point.x + lat.x * offset,
        0.55,
        point.z + lat.z * offset,
      );
      barrier.rotation.y = angle + Math.PI / 2;
      barrier.castShadow = true;
      group.add(barrier);
      barriers.push(barrier);
      // Striped top edge so the barrier reads at night.
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.18, 0.55),
        createEmissiveMaterial(0xffee88, 0.5),
      );
      stripe.position.copy(barrier.position);
      stripe.position.y = 1.15;
      stripe.rotation.y = angle + Math.PI / 2;
      group.add(stripe);
    }
    // Cones: a chevron leading up to the block.
    for (let i = 0; i < formation.cones; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 1.1, 8),
        createStandardMaterial(0xff4400),
      );
      const back = 8 + i * 4;
      const side = (i % 2 === 0 ? -1 : 1) * (7 + (i % 3));
      cone.position.set(
        point.x - dir.x * back + lat.x * side,
        0.55,
        point.z - dir.z * back + lat.z * side,
      );
      cone.castShadow = true;
      group.add(cone);
      cones.push(cone);
    }
    this.scene.add(group);
    const roadblock = {
      formation: formation.label,
      group,
      cars,
      barriers,
      cones,
      position: point.clone(),
      age: 0,
    };
    this.roadblocks.push(roadblock);
    this.stats.roadblocksPlaced++;
    this.hud.showMessage(`Police roadblock ahead! (${formation.label})`, 3);
    return roadblock;
  }

  // Roadblock and interceptor cars are plain Vehicles; they are never
  // registered with PoliceSystem, so the base system never drives them.
  vehicleClass() {
    return Vehicle;
  }

  removeRoadblock(index) {
    const rb = this.roadblocks[index];
    if (!rb) return;
    for (const car of rb.cars) {
      this.scene.remove(car.mesh);
      if (this.police.audio) {
        this.police.audio.stopEngineSound(car);
        this.police.audio.playSiren(car, false);
      }
    }
    this.scene.remove(rb.group);
    this.roadblocks.splice(index, 1);
  }

  updateRoadblocks(delta) {
    const w = this.wanted();
    // Wanted cleared: tear everything down.
    if (w === 0) {
      while (this.roadblocks.length > 0) this.removeRoadblock(0);
      return;
    }
    this.roadblockTimer += delta;
    // Place a new roadblock on the interval, up to the cap for the heat.
    const cap = w >= 5 ? 2 : w >= 2 ? 1 : 0;
    if (w >= 2 && this.roadblockTimer >= ROADBLOCK_CHECK_INTERVAL) {
      this.roadblockTimer = 0;
      if (this.roadblocks.length < cap) this.placeRoadblock();
    }
    // Age + proximity cleanup; parked cars never move, so update() is
    // only needed for their sirens/lights, which Vehicle handles in
    // updateVisuals via performance.now() — no per-frame call needed.
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.age += delta;
      const dist = distance2D(rb.position, this.player.position);
      // The player rammed through: a roadblock car took heavy damage.
      for (const car of rb.cars) {
        if (car.health < CONFIG.VEHICLE.HEALTH * 0.5 && !rb.rammed) {
          rb.rammed = true;
          this.stats.ramsThrough++;
          this.hud.showMessage('You smashed through the roadblock!', 3);
        }
      }
      if (rb.age > ROADBLOCK_MAX_AGE || dist > 220) this.removeRoadblock(i);
    }
  }

  // -- spike strips ------------------------------------------------------------

  dropStrip() {
    const w = this.wanted();
    const type = w >= 4 ? SPIKE_STRIP_TYPES.wide : SPIKE_STRIP_TYPES.standard;
    const { point, dir } = this.pointAhead(STRIP_AHEAD);
    if (Math.abs(point.x) > 980 || Math.abs(point.z) > 980) return null;
    const angle = Math.atan2(dir.x, dir.z);
    const group = new THREE.Group();
    // Base mat: a dark strip across the road.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(type.width, 0.15, 1.1),
      createStandardMaterial(0x1a1a1a),
    );
    base.position.y = 0.08;
    group.add(base);
    // Spikes: small upward cones in a row across the strip.
    for (let i = 0; i < type.spikes; i++) {
      const t = type.spikes === 1 ? 0 : (i / (type.spikes - 1)) * 2 - 1;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.7, 6),
        createStandardMaterial(0x8a8a8a),
      );
      spike.position.set((t * type.width) / 2, 0.45, (i % 2 === 0 ? -0.25 : 0.25));
      group.add(spike);
    }
    // Warning chevrons painted before the strip.
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.06, 0.35),
        createEmissiveMaterial(0xffcc00, 0.6),
      );
      chev.position.set(0, 0.05, -2.5 - i * 1.2);
      group.add(chev);
    }
    group.position.set(point.x, 0, point.z);
    group.rotation.y = angle;
    this.scene.add(group);
    const strip = {
      type: w >= 4 ? 'wide' : 'standard',
      def: type,
      group,
      position: point.clone(),
      age: 0,
      triggered: false,
    };
    this.strips.push(strip);
    this.stats.stripsDropped++;
    this.hud.showMessage('Spike strip ahead — slow down or swerve!', 3);
    return strip;
  }

  removeStrip(index) {
    const strip = this.strips[index];
    if (!strip) return;
    this.scene.remove(strip.group);
    this.strips.splice(index, 1);
  }

  updateStrips(delta) {
    const w = this.wanted();
    if (w === 0) {
      while (this.strips.length > 0) this.removeStrip(0);
      this.stripCooldown = 0;
      return;
    }
    this.stripCooldown -= delta;
    if (w >= 3 && this.stripCooldown <= 0 && this.strips.length === 0) {
      this.dropStrip();
      this.stripCooldown = w >= 5 ? STRIP_COOLDOWN * 0.6 : STRIP_COOLDOWN;
    }
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const strip = this.strips[i];
      strip.age += delta;
      if (strip.age > STRIP_MAX_AGE) {
        this.removeStrip(i);
        continue;
      }
      if (strip.triggered) continue;
      // On foot the player just steps over it; only a car triggers it.
      if (!vehicle) continue;
      const dist = distance2D(vehicle.position, strip.position);
      const speed = Math.abs(vehicle.speed);
      if (dist < 3.5 && speed > 5) {
        strip.triggered = true;
        this.stats.stripsTriggered++;
        // Shredded tyres: heavy slow + damage + a lurch.
        vehicle.speed *= strip.def.slow;
        vehicle.takeDamage(strip.def.damage);
        this.hud.showMessage(`Spike strip! Tyres shredded (-${strip.def.damage} HP)`, 4);
        // The strip is spent: fold it away after a beat so the player
        // sees what got them.
        setTimeout(() => {
          const at = this.strips.indexOf(strip);
          if (at >= 0) this.removeStrip(at);
        }, 1200);
      }
    }
  }

  // -- interceptors ------------------------------------------------------------

  spawnInterceptor() {
    const w = this.wanted();
    // Spawn on a street node near the player, like the base system.
    const nodes = this.city.trafficNodes.filter((n) => n.type === 'street');
    if (nodes.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < 12; i++) {
      const node = nodes[Math.floor(this.random() * nodes.length)];
      const d = distance2D(node, this.player.position);
      if (d > 45 && d < 90 && d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    if (!best) return null;
    const car = new Vehicle(this.scene, this.city, this.police.audio, 'police', INTERCEPTOR_TUNING.color);
    car.position.set(best.x, 0.5, best.z);
    car.mesh.position.copy(car.position);
    car.rotation = best.dir === 'x' ? Math.PI / 2 : 0;
    car.engineOn = true;
    car.setSiren(true);
    car.isPolice = true;
    car.tuneAccelMul = INTERCEPTOR_TUNING.accelMul;
    car.setAIInput({
      accel: 0.9,
      brake: 0,
      steer: 0,
      handbrake: false,
      targetSpeed: INTERCEPTOR_TUNING.chaseSpeed + w,
      laneOffset: 0,
      isPolice: true,
      behavior: 'intercept',
    });
    this.interceptors.push({ car, age: 0 });
    this.stats.interceptorsSpawned++;
    this.hud.showMessage('Interceptor unit joining the pursuit!', 3);
    return car;
  }

  removeInterceptor(index) {
    const entry = this.interceptors[index];
    if (!entry) return;
    this.scene.remove(entry.car.mesh);
    if (this.police.audio) {
      this.police.audio.stopEngineSound(entry.car);
      this.police.audio.playSiren(entry.car, false);
    }
    this.interceptors.splice(index, 1);
  }

  updateInterceptors(delta) {
    const w = this.wanted();
    if (w < 4) {
      while (this.interceptors.length > 0) this.removeInterceptor(0);
      return;
    }
    this.interceptorTimer += delta;
    const cap = w >= 5 ? 2 : 1;
    if (this.interceptorTimer >= INTERCEPTOR_CHECK_INTERVAL) {
      this.interceptorTimer = 0;
      if (this.interceptors.length < cap) this.spawnInterceptor();
    }
    for (let i = this.interceptors.length - 1; i >= 0; i--) {
      const entry = this.interceptors[i];
      entry.age += delta;
      // Chase the player: Vehicle.update with a target steers toward it.
      entry.car.update(delta, this.player.position);
      const dist = distance2D(entry.car.position, this.player.position);
      if (entry.car.isDestroyed || dist > 260 || entry.age > 120) {
        this.removeInterceptor(i);
      }
    }
  }

  // -- helicopter spotlight ------------------------------------------------------

  updateSpotlight(delta) {
    const w = this.wanted();
    const heliUp = this.police.helicopters && this.police.helicopters.length > 0;
    const on = w >= 3 && heliUp;
    this.spotlight.visible = on;
    this.spotlightLight.visible = on;
    if (!on) {
      this.spotlight.material.opacity = 0;
      this.spotlightLight.intensity = 0;
      return;
    }
    // Hover above the player, cone opening downward onto them.
    const p = this.player.position;
    this.spotlight.position.set(p.x, 23, p.z);
    this.spotlightLight.position.set(p.x, 10, p.z);
    // Pulse: the beam sweeps a little as the heli circles.
    const pulse = 0.1 + Math.sin(this.elapsed * 2.4) * 0.04;
    this.spotlight.material.opacity = pulse;
    this.spotlightLight.intensity = 40 + Math.sin(this.elapsed * 2.4) * 12;
    // The cone drifts with the player's motion: it lags half a second
    // behind, so a fast player can slip out of the light briefly.
    this.spotlight.position.x += (p.x - this.spotlight.position.x) * 0.1;
    this.spotlight.position.z += (p.z - this.spotlight.position.z) * 0.1;
  }

  // -- main loop -----------------------------------------------------------------

  update(delta) {
    this.elapsed += delta;
    const w = this.wanted();
    // Full cleanup the moment the heat is gone.
    if (w === 0) {
      this.updateRoadblocks(delta);
      this.updateStrips(delta);
      this.updateInterceptors(delta);
      this.updateSpotlight(delta);
      return;
    }
    this.updateRoadblocks(delta);
    this.updateStrips(delta);
    this.updateInterceptors(delta);
    this.updateSpotlight(delta);
  }

  // -- heat readout ----------------------------------------------------------------

  // A 0..10 "heat" score for the HUD/debug: stars plus active tactics.
  get heat() {
    const w = this.wanted();
    return clamp(
      w * 1.6 + this.roadblocks.length * 0.8 + this.strips.length * 0.5 + this.interceptors.length * 1.2,
      0,
      10,
    );
  }

  get heatLabel() {
    const h = this.heat;
    if (h <= 0) return 'Cold';
    if (h < 3) return 'Warm';
    if (h < 5.5) return 'Hot';
    if (h < 8) return 'Boiling';
    return 'Lockdown';
  }

  get summary() {
    return {
      wanted: this.wanted(),
      heat: Number(this.heat.toFixed(1)),
      heatLabel: this.heatLabel,
      roadblocks: this.roadblocks.length,
      strips: this.strips.length,
      interceptors: this.interceptors.length,
      spotlight: this.spotlight.visible,
      stats: { ...this.stats },
    };
  }

  getState() {
    return {
      stats: { ...this.stats },
      roadblocks: this.roadblocks.length,
      strips: this.strips.length,
      interceptors: this.interceptors.length,
    };
  }

  // Test hooks: force tactics without waiting for the wanted level to
  // climb (used by the verification probe, which sets wanted first).
  debugPlaceRoadblock() {
    return this.placeRoadblock();
  }

  debugDropStrip() {
    return this.dropStrip();
  }

  debugSpawnInterceptor() {
    return this.spawnInterceptor();
  }
}

// -- pursuit chatter -----------------------------------------------------------
// Radio lines the cops "say" as the heat rises. The game shows one via
// the HUD whenever a new tactic first appears at a given wanted level;
// the lines are flavour, not objectives.
export const PURSUIT_CHATTER = {
  2: [
    'Dispatch: roadblock going up on the avenue. Box him in.',
    'Unit 12: setting up a wall. Nobody gets through.',
    'Dispatch: suspect is mobile. All units, converge.',
  ],
  3: [
    'Dispatch: spike strip on the road ahead. Slow him down.',
    'Air One: I have eyes on the suspect. Spotlight on.',
    'Unit 7: strip is down. Watch your tyres, boys.',
  ],
  4: [
    'Dispatch: interceptor unit rolling. He is fast — keep up.',
    'Interceptor: I am on his bumper. He cannot outrun this unit.',
    'Dispatch: four stars. All available units to the pursuit.',
  ],
  5: [
    'Dispatch: full lockdown. Every road in the district is closed.',
    'Air One: two interceptors on him. Nowhere left to run.',
    'Dispatch: this ends tonight. Bring him in.',
  ],
};

export function chatterFor(wanted, random) {
  const lines = PURSUIT_CHATTER[wanted] || PURSUIT_CHATTER[2];
  return lines[Math.floor(random() * lines.length)];
}

// -- lockdown rules --------------------------------------------------------------
// How the city responds at each wanted level, as data: which tactics are
// allowed, how many of each, and how fast they refresh. The numbers here
// are the single source of truth — updateRoadblocks/updateStrips/
// updateInterceptors read the caps from the wanted level, and this table
// documents the same rules for tuning.
export const LOCKDOWN_RULES = [
  { wanted: 0, roadblocks: 0, strips: 0, interceptors: 0, spotlight: false, note: 'Cold: no tactics, streets clear.' },
  { wanted: 1, roadblocks: 0, strips: 0, interceptors: 0, spotlight: false, note: 'Warm: patrol cars only, no traps.' },
  { wanted: 2, roadblocks: 1, strips: 0, interceptors: 0, spotlight: false, note: 'Hot: first roadblock goes up ahead.' },
  { wanted: 3, roadblocks: 1, strips: 1, interceptors: 0, spotlight: true, note: 'Boiling: strips drop, heli spotlight tracks.' },
  { wanted: 4, roadblocks: 1, strips: 1, interceptors: 1, spotlight: true, note: 'Severe: an interceptor joins the chase.' },
  { wanted: 5, roadblocks: 2, strips: 1, interceptors: 2, spotlight: true, note: 'Lockdown: everything at once, faster refresh.' },
];

export function lockdownFor(wanted) {
  return LOCKDOWN_RULES[clamp(wanted, 0, 5)];
}

// -- escape scoring ----------------------------------------------------------------
// A tiny scorer the game can use for "clean getaway" feedback: given how
// the player escaped (or did not), it returns a grade and a cash bonus
// idea. Not wired into payouts — it is a readout for the tactics screen.
export const ESCAPE_GRADES = [
  { maxHeat: 0, grade: 'Ghost', bonus: 1000, line: 'Never even saw you. Ghost.' },
  { maxHeat: 3, grade: 'Clean', bonus: 500, line: 'Clean getaway. Barely a scratch.' },
  { maxHeat: 5.5, grade: 'Messy', bonus: 200, line: 'Messy, but you made it out.' },
  { maxHeat: 8, grade: 'Lucky', bonus: 50, line: 'Lucky. The roadblock had a gap.' },
  { maxHeat: 10, grade: 'Miracle', bonus: 0, line: 'A miracle. Buy a lottery ticket.' },
];

export function gradeEscape(maxHeat) {
  for (const g of ESCAPE_GRADES) {
    if (maxHeat <= g.maxHeat) return g;
  }
  return ESCAPE_GRADES[ESCAPE_GRADES.length - 1];
}
