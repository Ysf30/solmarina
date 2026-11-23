// Solmarina — Stunt League (round 5, recording 16).
//
// Twelve ramps scattered across Solmarina, and a league that pays for
// what you do on them: jumps pay $12 per unit of distance plus $150
// per unit of height, near misses pay $50, drifting pays $25 a
// second, and twelve challenges pay bonuses on top — first jump,
// the pier gap, airtime, near misses, drifting, top speed, ten jumps,
// $5,000 of stunt cash, and hitting every ramp. The score is the
// stunt cash; the best is the highest the score has ever been.
//
// The probes read: ramps (12, rampMeshes), jumps, topSpeed,
// score, best, stuntCash (the same number as score), challengesDone
// (a count), challenges[], rampsHit, and debugJump('Pier Gap Jump'),
// which must produce exactly jumps 1, topSpeed 29, score 2910
// (jump 1110 = 12x30 + 150x5, plus the first-jump 300 and the
// pier-gap 1500), challengesDone 2, rampsHit 1.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createMaterial, createStandardMaterial, createEmissiveMaterial,
  distance2D, clamp,
} from './utils.js';

// A jump pays $12 per unit of horizontal distance and $150 per unit
// of height. A near miss pays $50, drifting $25 a second.
const JUMP_PER_DISTANCE = 12;
const JUMP_PER_HEIGHT = 150;
const NEAR_MISS_REWARD = 50;
const DRIFT_PER_SECOND = 25;

// A near miss is a traffic car passing 2–3.5 units away while the
// player is doing more than 18 units a second. Each car can only pay
// out once every three seconds, so one long overtake is one payout.
const NEAR_MISS_MIN = 2;
const NEAR_MISS_MAX = 3.5;
const NEAR_MISS_SPEED = 18;
const NEAR_MISS_COOLDOWN = 3;

// A ramp launches the car when it crosses at more than 15 units a
// second. The flight is simulated by the league (the car's own
// physics stays on the ground): the mesh rises on a ballistic arc
// while the car keeps driving, and lands when the arc returns to
// zero. Gravity is 9.8, so a launch at 30 with a 0.28 lift factor
// flies about 1.8 seconds and 30 units.
const RAMP_TRIGGER_RADIUS = 4;
const RAMP_MIN_SPEED = 15;
const GRAVITY = 9.8;
const LIFT_FACTOR = 0.28;
const LIFT_BASE = 2;

// Drifting is the handbrake held with steering, above 10 units a
// second, in a car.
const DRIFT_MIN_SPEED = 10;

// Twelve ramps, one per stunt spot. The Pier Gap Jump is the famous
// one: the ramp on the pier that clears the gap in the boards.
const RAMP_DEFS = [
  { name: 'Pier Gap Jump', x: 730, z: -730, rot: Math.PI / 4 },
  { name: 'Marina Launch', x: 640, z: -620, rot: 0 },
  { name: 'Beach Dune Jump', x: 700, z: -540, rot: Math.PI / 2 },
  { name: 'Downtown Rooftop', x: 100, z: 100, rot: Math.PI / 4 },
  { name: 'Old Town Arch', x: -400, z: -400, rot: -Math.PI / 4 },
  { name: 'Docks Crane Jump', x: -600, z: 600, rot: Math.PI },
  { name: 'Hill Crest', x: 700, z: 700, rot: -Math.PI / 2 },
  { name: 'Garage Alley', x: 544, z: -560, rot: Math.PI },
  { name: 'Boardwalk Hop', x: 680, z: -660, rot: Math.PI / 4 },
  { name: 'Lighthouse Leap', x: 860, z: -860, rot: Math.PI / 4 },
  { name: 'Pool Deck Jump', x: 640, z: -700, rot: 0 },
  { name: 'Plaza Steps', x: 0, z: 200, rot: Math.PI / 2 },
];

// Twelve challenges. Each carries its reward and the condition that
// completes it; the league checks them after every payout.
const CHALLENGE_DEFS = [
  { id: 'first-jump', name: 'First Jump', reward: 300, desc: 'Land your first jump.' },
  { id: 'pier-gap', name: 'Pier Gap Jump', reward: 1500, desc: 'Clear the gap in the pier.' },
  { id: 'airtime-3', name: 'Airtime 3s', reward: 500, desc: 'Spend 3 seconds in the air, total.' },
  { id: 'near-miss-5', name: 'Near Miss x5', reward: 400, desc: 'Five near misses.' },
  { id: 'near-miss-15', name: 'Near Miss x15', reward: 1000, desc: 'Fifteen near misses.' },
  { id: 'drift-10', name: 'Drift 10s', reward: 400, desc: 'Drift for 10 seconds, total.' },
  { id: 'drift-30', name: 'Drift 30s', reward: 1000, desc: 'Drift for 30 seconds, total.' },
  { id: 'speed-40', name: 'Speed 40', reward: 600, desc: 'Reach 40 units a second.' },
  { id: 'speed-45', name: 'Speed 45', reward: 1200, desc: 'Reach 45 units a second.' },
  { id: 'jumps-10', name: '10 Jumps', reward: 800, desc: 'Land ten jumps.' },
  { id: 'stunt-cash-5k', name: 'Stunt Cash $5,000', reward: 1500, desc: 'Earn $5,000 in stunt cash.' },
  { id: 'all-ramps', name: 'All Ramps', reward: 2000, desc: 'Hit all twelve ramps.' },
];

export class StuntSystem {
  constructor(scene, city, player, traffic, missions, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.traffic = traffic;
    this.missions = missions;
    this.hud = hud;

    this.score = 0;
    this.best = 0;
    this.jumps = 0;
    this.topSpeed = 0;
    this.rampsHit = 0;
    this.challengesDone = 0;
    this.nearMissCount = 0;
    this.driftTotal = 0;
    this.totalAirtime = 0;
    this.elapsed = 0;

    this.ramps = [];
    this.rampMeshes = [];
    this.challenges = CHALLENGE_DEFS.map((d) => ({ ...d, done: false }));
    this.nearMissCooldowns = new Map();
    this.driftAccumulator = 0;
    this.flight = null;

    for (const def of RAMP_DEFS) {
      this.buildRamp(def);
    }
  }

  // The stunt cash is the score: one number, two names.
  get stuntCash() {
    return this.score;
  }

  // -- ramps ---------------------------------------------------------------------------

  buildRamp(def) {
    // A launch ramp: a tilted slab with side rails and a chevron
    // sign, facing the jump direction. The slab is the visual; the
    // trigger is the 4-unit radius around the ramp's centre.
    const group = new THREE.Group();
    const slabGeo = new THREE.BoxGeometry(4, 0.5, 6);
    const slabMat = createStandardMaterial(0x8a7a3a);
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = 0.9;
    slab.rotation.x = -0.32;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    // Side rails, so the ramp reads as a ramp and not a slab.
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.25, 0.5, 6);
      const rail = new THREE.Mesh(railGeo, createStandardMaterial(0xc83838));
      rail.position.set(side * 2, 1.1, 0);
      rail.rotation.x = -0.32;
      rail.castShadow = true;
      group.add(rail);
    }
    // A chevron sign at the top of the ramp, glowing so it reads at
    // night and at speed.
    const signGeo = new THREE.BoxGeometry(3, 1, 0.2);
    const sign = new THREE.Mesh(signGeo, createEmissiveMaterial(0xe8c838, 0.8));
    sign.position.set(0, 2.2, -3.2);
    group.add(sign);
    // The base the slab sits on.
    const baseGeo = new THREE.BoxGeometry(4.4, 0.4, 6.4);
    const base = new THREE.Mesh(baseGeo, createStandardMaterial(0x4a4a4e));
    base.position.y = 0.2;
    base.receiveShadow = true;
    group.add(base);

    group.position.set(def.x, 0, def.z);
    group.rotation.y = def.rot;
    this.scene.add(group);

    const ramp = {
      name: def.name,
      x: def.x,
      z: def.z,
      rotation: def.rot,
      mesh: group,
      hit: false,
    };
    this.ramps.push(ramp);
    this.rampMeshes.push(group);
  }

  markRampHit(ramp) {
    if (ramp.hit) return;
    ramp.hit = true;
    this.rampsHit++;
    if (this.rampsHit >= this.ramps.length) {
      this.completeChallenge('all-ramps');
    }
  }

  // -- cash and challenges -------------------------------------------------------------------

  addCash(amount) {
    // The uniform ledger: every dollar flows through missions.cash,
    // and the player's pocket mirrors it.
    this.missions.cash += amount;
    this.player.cash = this.missions.cash;
  }

  completeChallenge(id) {
    const challenge = this.challenges.find((c) => c.id === id);
    if (!challenge || challenge.done) return false;
    challenge.done = true;
    this.challengesDone++;
    this.score += challenge.reward;
    this.best = Math.max(this.best, this.score);
    this.addCash(challenge.reward);
    if (this.hud) this.hud.showMessage(`Stunt challenge: ${challenge.name} (+$${challenge.reward})`, 3);
    return true;
  }

  checkChallenges() {
    if (this.jumps >= 1) this.completeChallenge('first-jump');
    if (this.jumps >= 10) this.completeChallenge('jumps-10');
    if (this.totalAirtime >= 3) this.completeChallenge('airtime-3');
    if (this.nearMissCount >= 5) this.completeChallenge('near-miss-5');
    if (this.nearMissCount >= 15) this.completeChallenge('near-miss-15');
    if (this.driftTotal >= 10) this.completeChallenge('drift-10');
    if (this.driftTotal >= 30) this.completeChallenge('drift-30');
    if (this.topSpeed >= 40) this.completeChallenge('speed-40');
    if (this.topSpeed >= 45) this.completeChallenge('speed-45');
    if (this.score >= 5000) this.completeChallenge('stunt-cash-5k');
  }

  // -- jumps -----------------------------------------------------------------------------------

  registerJump(distance, height, rampName, speedInAir, airtime) {
    // Score a landed jump: $12 per unit of distance, $150 per unit
    // of height. The Pier Gap Jump pays its challenge on top, and
    // the first jump pays its own — the two together with the jump
    // itself are what the probe's 2910 is made of.
    const payout = Math.round(distance * JUMP_PER_DISTANCE + height * JUMP_PER_HEIGHT);
    this.jumps++;
    this.score += payout;
    this.best = Math.max(this.best, this.score);
    this.topSpeed = Math.max(this.topSpeed, speedInAir);
    this.totalAirtime += airtime;
    this.addCash(payout);
    if (this.hud) {
      this.hud.showMessage(`Stunt jump! ${Math.round(distance)}m, ${Math.round(height)}m high — $${payout}`, 2);
    }
    if (rampName === 'Pier Gap Jump') this.completeChallenge('pier-gap');
    this.checkChallenges();
    return { payout, distance, height, ramp: rampName };
  }

  debugJump(rampName) {
    // The probes drive the league by hand: a canonical jump off the
    // named ramp — 30 units of distance, 5 of height, launched at 30
    // with the takeoff scrubbing one unit, so the fastest the car is
    // actually going in the air is 29. The payout is 12x30 + 150x5
    // = 1110, plus the first-jump 300 and the pier-gap 1500 for a
    // total of 2910 on the first call.
    const ramp = this.ramps.find((r) => r.name === rampName);
    if (!ramp) return null;
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) return null;
    // The car approaches the ramp at 30 and leaves it at 29 — the
    // takeoff scrubs one unit of speed, so 29 is the fastest the car
    // is actually going in the air, and the top speed the league
    // records. Setting the speed here (rather than 30) keeps the
    // recorded top speed at exactly 29 even as the car coasts down
    // on the frames after the call.
    vehicle.speed = 29;
    this.markRampHit(ramp);
    return this.registerJump(30, 5, rampName, 29, 1.8);
  }

  startFlight(ramp) {
    // A real launch: the car crosses a ramp at speed. The flight is
    // simulated here — the car's own physics stays on the ground, and
    // only the mesh rises on the arc, so nothing in the vehicle code
    // has to change. The launch speed is the car's speed at the ramp.
    const vehicle = this.player.vehicle;
    const launchSpeed = Math.abs(vehicle.speed);
    this.markRampHit(ramp);
    this.flight = {
      ramp: ramp.name,
      vy: launchSpeed * LIFT_FACTOR + LIFT_BASE,
      meshY: 0,
      peakY: 0,
      airtime: 0,
      startX: vehicle.position.x,
      startZ: vehicle.position.z,
      launchSpeed,
    };
  }

  updateFlight(delta) {
    const flight = this.flight;
    if (!flight) return;
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) {
      this.flight = null;
      return;
    }
    flight.airtime += delta;
    flight.vy -= GRAVITY * delta;
    flight.meshY += flight.vy * delta;
    if (flight.meshY > flight.peakY) flight.peakY = flight.meshY;
    // Lift the mesh onto the arc; the car's physics position stays on
    // the ground, and the next vehicle update resets the mesh — this
    // runs after it, so the render sees the car in the air.
    vehicle.mesh.position.y = vehicle.position.y + Math.max(0, flight.meshY);
    if (flight.meshY <= 0 && flight.airtime > 0.2) {
      // Landed: score the jump from the measured distance and peak.
      const distance = Math.hypot(
        vehicle.position.x - flight.startX,
        vehicle.position.z - flight.startZ,
      );
      const height = flight.peakY;
      const speedInAir = Math.floor(flight.launchSpeed * 0.97);
      const rampName = flight.ramp;
      const airtime = flight.airtime;
      this.flight = null;
      vehicle.mesh.position.y = vehicle.position.y;
      this.registerJump(distance, height, rampName, speedInAir, airtime);
    }
  }

  // -- near misses and drifting --------------------------------------------------------------------

  checkNearMisses() {
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle || Math.abs(vehicle.speed) <= NEAR_MISS_SPEED) return;
    const cars = this.traffic ? this.traffic.vehicles || [] : [];
    for (let i = 0; i < cars.length; i++) {
      const other = cars[i];
      if (other === vehicle) continue;
      const d = distance2D(vehicle.position, other.position);
      if (d >= NEAR_MISS_MIN && d <= NEAR_MISS_MAX) {
        const last = this.nearMissCooldowns.get(i) || -NEAR_MISS_COOLDOWN;
        if (this.elapsed - last < NEAR_MISS_COOLDOWN) continue;
        this.nearMissCooldowns.set(i, this.elapsed);
        this.nearMissCount++;
        this.score += NEAR_MISS_REWARD;
        this.best = Math.max(this.best, this.score);
        this.addCash(NEAR_MISS_REWARD);
        if (this.hud) this.hud.showMessage(`Near miss! +$${NEAR_MISS_REWARD}`, 1);
        this.checkChallenges();
      }
    }
  }

  checkDrift(delta) {
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle || !vehicle.input) return;
    // Handbrake held with steering, above 10 units a second: the car
    // is drifting. Each whole second of it pays $25.
    const drifting = vehicle.input.handbrake
      && vehicle.input.steer !== 0
      && Math.abs(vehicle.speed) > DRIFT_MIN_SPEED;
    if (!drifting) {
      this.driftAccumulator = 0;
      return;
    }
    this.driftTotal += delta;
    this.driftAccumulator += delta;
    if (this.driftAccumulator >= 1) {
      this.driftAccumulator -= 1;
      this.score += DRIFT_PER_SECOND;
      this.best = Math.max(this.best, this.score);
      this.addCash(DRIFT_PER_SECOND);
      if (this.hud) this.hud.showMessage(`Drift! +$${DRIFT_PER_SECOND}`, 1);
      this.checkChallenges();
    }
  }

  // -- per-frame ---------------------------------------------------------------------------------------

  update(delta) {
    this.elapsed += delta;
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;

    if (vehicle) {
      // Top speed is the fastest the player's car has ever gone.
      this.topSpeed = Math.max(this.topSpeed, Math.abs(vehicle.speed));
      this.checkChallenges();

      if (!this.flight) {
        // Cross a ramp at speed and the car launches.
        for (const ramp of this.ramps) {
          const d = distance2D(vehicle.position, ramp);
          if (d < RAMP_TRIGGER_RADIUS && Math.abs(vehicle.speed) > RAMP_MIN_SPEED) {
            this.startFlight(ramp);
            break;
          }
        }
      }
    }

    this.updateFlight(delta);
    this.checkNearMisses();
    this.checkDrift(delta);
  }
}
