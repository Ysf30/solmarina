// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Stunt System ("Solmarina Stunt League")
//
// The city is full of jumps nobody uses: the base game never rewards
// driving fast, close, or sideways. This system does. It watches the
// player's car every frame and scores four things:
//
//  - Ramp jumps: twelve wooden ramps are placed around the city. Cross
//    one at speed and the car takes a scripted hop (a parabola applied
//    to the mesh after the physics step, so it never fights the vehicle
//    simulation), scored by entry speed and ramp height.
//  - Near misses: threading past traffic at speed without touching.
//  - Drifts: holding a slide (high angular velocity at speed) banks
//    points every second until the slide ends.
//  - Top speed: beating your personal best on any road pays out.
//
// On top of the live scoring there are twelve named challenges (jump the
// pier gap, drift 30 seconds total, five near misses in one minute...),
// each with a reward paid through the mission cash ledger, and a local
// leaderboard of bests kept in getState()/setState(). A stunt badge (the
// system's own DOM, bottom-centre above the speedometer) shows the live
// score, the current drift chain and the next challenge.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial,
  createEmissiveMaterial,
  distance2D,
  distance2DSq,
  clamp,
  createRandom,
} from './utils.js';

// Ramps: [x, z, rotationY, width, height, length, name]. Rotation is the
// direction of travel up the ramp (the car's heading when it launches).
// All ramps sit on streets (multiples of the grid) so they are reachable
// without driving through buildings.
export const STUNT_RAMPS = [
  { x: 128, z: 0, rot: 0, w: 8, h: 3.5, len: 12, name: 'Avenue Launch' },
  { x: -128, z: 0, rot: Math.PI, w: 8, h: 3.5, len: 12, name: 'Avenue Launch West' },
  { x: 0, z: 128, rot: Math.PI / 2, w: 8, h: 3, len: 11, name: 'South Street Kicker' },
  { x: 0, z: -128, rot: -Math.PI / 2, w: 8, h: 3, len: 11, name: 'North Street Kicker' },
  { x: 256, z: 256, rot: Math.PI / 4, w: 9, h: 4, len: 13, name: 'Casino Corner Jump' },
  { x: -256, z: -256, rot: -Math.PI * 0.75, w: 9, h: 4, len: 13, name: 'Old Town Flyer' },
  { x: 512, z: 0, rot: 0, w: 8, h: 3.5, len: 12, name: 'East Main Ramp' },
  { x: -512, z: 0, rot: Math.PI, w: 8, h: 3.5, len: 12, name: 'West Main Ramp' },
  { x: 700, z: -700, rot: Math.PI * 0.75, w: 10, h: 5, len: 14, name: 'Pier Gap Jump' },
  { x: 640, z: -500, rot: Math.PI, w: 8, h: 3, len: 11, name: 'Marina Approach' },
  { x: 320, z: -320, rot: -Math.PI / 4, w: 9, h: 4.5, len: 13, name: 'Docks Crane Leap' },
  { x: -320, z: 320, rot: Math.PI * 0.75, w: 9, h: 4, len: 13, name: 'Safehouse Sprint' },
];

// Challenges: id, name, description, target, reward. Progress is counted
// by the live scoring (jumps, near misses, drift seconds, top speed,
// total stunt cash) and checked every frame.
export const STUNT_CHALLENGES = [
  { id: 'first-jump', name: 'First Flight', desc: 'Hit any ramp jump.', target: 1, kind: 'jumps', reward: 300 },
  { id: 'pier-gap', name: 'Pier Gap', desc: 'Jump the Pier Gap ramp at the marina.', target: 1, kind: 'pierJumps', reward: 1500 },
  { id: 'airtime-3', name: 'Airtime', desc: 'Stay airborne for 3 seconds total.', target: 3, kind: 'airtime', reward: 800 },
  { id: 'near-miss-5', name: 'Thread The Needle', desc: 'Near-miss 5 traffic cars.', target: 5, kind: 'nearMisses', reward: 700 },
  { id: 'near-miss-15', name: 'Ghost Driver', desc: 'Near-miss 15 traffic cars.', target: 15, kind: 'nearMisses', reward: 2000 },
  { id: 'drift-10', name: 'Sideways', desc: 'Drift for 10 seconds total.', target: 10, kind: 'driftSeconds', reward: 600 },
  { id: 'drift-30', name: 'Drift King', desc: 'Drift for 30 seconds total.', target: 30, kind: 'driftSeconds', reward: 2500 },
  { id: 'speed-40', name: 'Top Speed', desc: 'Reach 40 units/s in any car.', target: 40, kind: 'topSpeed', reward: 900 },
  { id: 'speed-45', name: 'Flat Out', desc: 'Reach the 45 units/s limit.', target: 45, kind: 'topSpeed', reward: 1800 },
  { id: 'jumps-10', name: 'Jump Master', desc: 'Hit 10 ramp jumps.', target: 10, kind: 'jumps', reward: 1200 },
  { id: 'stunt-cash-5k', name: 'Stunt Payday', desc: 'Earn $5,000 from stunts.', target: 5000, kind: 'stuntCash', reward: 1000 },
  { id: 'all-ramps', name: 'Ramp Tour', desc: 'Jump every ramp in the city.', target: 12, kind: 'rampsHit', reward: 3000 },
];

// Scoring rates.
export const STUNT_RATES = {
  jumpPerSpeed: 12, // $ per unit/s of entry speed
  jumpPerHeight: 150, // $ per unit of ramp height
  nearMiss: 50,
  driftPerSecond: 25,
  topSpeedBonus: 100,
  airtimePerSecond: 200,
};

export class StuntSystem {
  constructor(scene, city, player, traffic, missions, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.traffic = traffic;
    this.missions = missions;
    this.hud = hud;
    this.random = createRandom(777333);

    // Live totals.
    this.totals = {
      jumps: 0,
      pierJumps: 0,
      airtime: 0,
      nearMisses: 0,
      driftSeconds: 0,
      topSpeed: 0,
      stuntCash: 0,
      rampsHit: 0,
    };
    this.rampsHitSet = new Set();
    this.completedChallenges = new Set();
    this.score = 0;
    this.sessionCash = 0;

    // Drift chain state.
    this.drifting = false;
    this.driftTime = 0;
    this.driftBanked = 0;

    // Hop animation state (the scripted jump parabola).
    this.hopT = 0;
    this.hopDuration = 1.1;
    this.hopHeight = 0;
    this.hopVehicle = null;

    // Near-miss cooldowns per traffic vehicle (Map<Vehicle, time>).
    this.nearMissCooldown = new Map();
    this.nearMissWindow = []; // timestamps of recent near misses

    this.elapsed = 0;
    this.lastRamp = null;
    this.lastRampTime = -10;

    this.buildRamps();
    this.createBadge();
  }

  buildRamps() {
    // One wedge per ramp: a sloped box (rotated) with chevron stripes
    // and side rails, plus a small flag so the ramp is visible from
    // down the street.
    this.rampMeshes = [];
    for (const spec of STUNT_RAMPS) {
      const group = new THREE.Group();
      // The wedge: a box rotated so its top slopes up in the launch
      // direction. Length along local Z, slope rising toward +Z.
      const slope = Math.atan2(spec.h, spec.len);
      const wedge = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, 0.6, spec.len + 2),
        createStandardMaterial(0x8a5a2a),
      );
      wedge.position.set(0, spec.h / 2 - 0.2, 0);
      wedge.rotation.x = -slope;
      wedge.castShadow = true;
      wedge.receiveShadow = true;
      group.add(wedge);
      // Chevron stripes on the slope face.
      for (let i = 0; i < 3; i++) {
        const chev = new THREE.Mesh(
          new THREE.BoxGeometry(spec.w - 1, 0.12, 0.9),
          createEmissiveMaterial(0xffcc00, 0.6),
        );
        const t = (i + 0.5) / 3;
        chev.position.set(0, 0.2 + t * spec.h, -spec.len / 2 + t * spec.len);
        chev.rotation.x = -slope;
        group.add(chev);
      }
      // Side rails.
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.9, spec.len + 2),
          createStandardMaterial(0x2a2a2a),
        );
        rail.position.set(side * (spec.w / 2 - 0.15), spec.h / 2, 0);
        rail.rotation.x = -slope;
        group.add(rail);
      }
      // Launch flag at the top lip.
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6),
        createStandardMaterial(0x3a3a3a),
      );
      pole.position.set(spec.w / 2 - 0.4, spec.h + 1.4, spec.len / 2);
      group.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1),
        new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide }),
      );
      flag.position.set(spec.w / 2 - 1.2, spec.h + 2.6, spec.len / 2);
      group.add(flag);
      group.position.set(spec.x, 0, spec.z);
      group.rotation.y = spec.rot;
      this.scene.add(group);
      this.rampMeshes.push({ spec, group, flag });
    }
  }

  createBadge() {
    // Stunt badge: bottom-centre, above the speedometer. Shows the live
    // score, the active drift chain and the next challenge to chase.
    this.badge = document.createElement('div');
    this.badge.id = 'stuntBadge';
    this.badge.style.cssText = `
      position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%);
      background: rgba(20,10,0,0.85); color: #ffcc88; padding: 6px 14px;
      border-radius: 4px; font-family: monospace; font-size: 12px;
      border: 1px solid #ff8c42; display: none; z-index: 30; text-align: center;
      pointer-events: none;
    `;
    document.body.appendChild(this.badge);
  }

  refreshBadge() {
    const next = this.nextChallenge();
    const drift = this.drifting ? ` · DRIFT ${this.driftTime.toFixed(1)}s ($${this.driftBanked})` : '';
    const challenge = next ? ` · Next: ${next.name} (${this.progressOf(next)}/${next.target})` : ' · All challenges done!';
    this.badge.innerHTML = `STUNT SCORE ${this.score}${drift}${challenge}`;
    this.badge.style.display = this.player.inVehicle ? 'block' : 'none';
  }

  nextChallenge() {
    for (const c of STUNT_CHALLENGES) {
      if (!this.completedChallenges.has(c.id)) return c;
    }
    return null;
  }

  progressOf(challenge) {
    const v = this.totals[challenge.kind];
    if (challenge.kind === 'topSpeed') return Math.floor(v);
    if (challenge.kind === 'airtime' || challenge.kind === 'driftSeconds') return Math.floor(v);
    return v;
  }

  pay(amount, reason) {
    if (this.missions) {
      this.missions.cash += amount;
      this.player.cash = this.missions.cash;
    } else {
      this.player.cash += amount;
    }
    this.totals.stuntCash += amount;
    this.sessionCash += amount;
    this.score += amount;
  }

  // -- ramp jumps ------------------------------------------------------------------

  checkRamps(vehicle) {
    if (this.hopT > 0) return; // already airborne on a hop
    if (Math.abs(vehicle.speed) < 15) return; // too slow to jump
    for (const { spec } of this.rampMeshes) {
      const d = distance2D(vehicle.position, spec);
      if (d > spec.len * 0.7) continue;
      // The car must be travelling roughly along the ramp's launch
      // direction (within ~60 degrees), not across it or backwards.
      const heading = Math.atan2(Math.sin(vehicle.rotation), Math.cos(vehicle.rotation));
      let diff = spec.rot - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.1) continue;
      // One jump per ramp per 4 seconds (no farming the same ramp).
      if (this.lastRamp === spec && this.elapsed - this.lastRampTime < 4) continue;
      this.launchJump(vehicle, spec);
      return;
    }
  }

  launchJump(vehicle, spec) {
    const speed = Math.abs(vehicle.speed);
    this.hopT = this.hopDuration;
    this.hopHeight = spec.h + speed * 0.12;
    this.hopVehicle = vehicle;
    this.lastRamp = spec;
    this.lastRampTime = this.elapsed;
    this.totals.jumps++;
    if (!this.rampsHitSet.has(spec.name)) {
      this.rampsHitSet.add(spec.name);
      this.totals.rampsHit = this.rampsHitSet.size;
    }
    if (spec.name === 'Pier Gap Jump') this.totals.pierJumps++;
    const payout = Math.round(speed * STUNT_RATES.jumpPerSpeed + spec.h * STUNT_RATES.jumpPerHeight);
    this.pay(payout, 'jump');
    this.hud.showMessage(`STUNT! ${spec.name} — airborne at ${speed.toFixed(0)} u/s! +$${payout}`, 3);
    this.checkChallenges();
  }

  updateHop(delta) {
    if (this.hopT <= 0 || !this.hopVehicle) return;
    const vehicle = this.hopVehicle;
    this.hopT -= delta;
    const done = 1 - Math.max(0, this.hopT) / this.hopDuration;
    // Parabola: up fast, hang, come down. Track airtime for the
    // Airtime challenge while the hop is live.
    this.totals.airtime += delta;
    const h = this.hopHeight * 4 * done * (1 - done);
    const groundY = this.city.raycastGround(vehicle.position.x, vehicle.position.z);
    vehicle.position.y = groundY + 0.5 + h;
    vehicle.mesh.position.y = vehicle.position.y;
    if (this.hopT <= 0) {
      vehicle.position.y = groundY + 0.5;
      vehicle.mesh.position.y = vehicle.position.y;
      this.hopVehicle = null;
      this.hud.showMessage('Landed it. Clean.', 2);
    }
  }

  // -- near misses -------------------------------------------------------------------

  checkNearMisses(vehicle) {
    const speed = Math.abs(vehicle.speed);
    if (speed < 18) return;
    for (const other of this.traffic.vehicles) {
      if (other === vehicle) continue;
      if (other.driver) continue;
      const dSq = distance2DSq(vehicle.position, other.position);
      // Near-miss band: close enough to thrill, far enough to survive.
      if (dSq < 12.5 && dSq > 4) {
        const last = this.nearMissCooldown.get(other) || -10;
        if (this.elapsed - last < 2) continue;
        this.nearMissCooldown.set(other, this.elapsed);
        this.totals.nearMisses++;
        this.nearMissWindow.push(this.elapsed);
        this.pay(STUNT_RATES.nearMiss, 'near-miss');
        this.hud.showMessage(`NEAR MISS! +$${STUNT_RATES.nearMiss}`, 2);
        this.checkChallenges();
      }
    }
    // Prune the window (used by the "5 in a minute" style tracking).
    while (this.nearMissWindow.length > 0 && this.elapsed - this.nearMissWindow[0] > 60) {
      this.nearMissWindow.shift();
    }
  }

  // -- drifting ------------------------------------------------------------------------

  updateDrift(delta, vehicle) {
    const speed = Math.abs(vehicle.speed);
    const sliding = Math.abs(vehicle.angularVelocity) > 1.1 && speed > 12;
    if (sliding && !this.drifting) {
      this.drifting = true;
      this.driftTime = 0;
      this.driftBanked = 0;
    }
    if (this.drifting) {
      if (sliding) {
        this.driftTime += delta;
        this.totals.driftSeconds += delta;
        // Bank $25 per drift-second, paid when the drift ends.
        const banked = Math.floor(this.driftTime) * STUNT_RATES.driftPerSecond;
        this.driftBanked = banked;
      } else {
        // Drift ended: pay out the banked points.
        this.drifting = false;
        if (this.driftBanked > 0) {
          this.pay(this.driftBanked, 'drift');
          this.hud.showMessage(`DRIFT! ${this.driftTime.toFixed(1)}s slide — +$${this.driftBanked}`, 3);
          this.checkChallenges();
        }
        this.driftTime = 0;
        this.driftBanked = 0;
      }
    }
  }

  // -- top speed -------------------------------------------------------------------------

  updateTopSpeed(vehicle) {
    const speed = Math.abs(vehicle.speed);
    if (speed > this.totals.topSpeed) {
      const wasBest = this.totals.topSpeed;
      this.totals.topSpeed = speed;
      // Pay a bonus the first time each whole-number speed is beaten
      // past 30 (so the payout does not spam at low speeds).
      if (speed >= 30 && Math.floor(speed) > Math.floor(wasBest)) {
        this.pay(STUNT_RATES.topSpeedBonus, 'top-speed');
        this.hud.showMessage(`TOP SPEED! ${speed.toFixed(0)} u/s — new personal best! +$${STUNT_RATES.topSpeedBonus}`, 3);
        this.checkChallenges();
      }
    }
  }

  // -- challenges --------------------------------------------------------------------------

  checkChallenges() {
    for (const c of STUNT_CHALLENGES) {
      if (this.completedChallenges.has(c.id)) continue;
      if (this.progressOf(c) >= c.target) {
        this.completedChallenges.add(c.id);
        this.pay(c.reward, 'challenge');
        this.hud.showMessage(`CHALLENGE COMPLETE: ${c.name}! +$${c.reward}`, 5);
      }
    }
  }

  // -- main loop -------------------------------------------------------------------------------

  update(delta) {
    this.elapsed += delta;
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) {
      // On foot: no stunts, but the badge hides and any open drift ends.
      if (this.drifting) {
        this.drifting = false;
        this.driftTime = 0;
        this.driftBanked = 0;
      }
      this.badge.style.display = 'none';
      return;
    }
    this.checkRamps(vehicle);
    this.updateHop(delta);
    this.checkNearMisses(vehicle);
    this.updateDrift(delta, vehicle);
    this.updateTopSpeed(vehicle);
    // Ramp flags wave in the wind.
    for (const { flag } of this.rampMeshes) {
      flag.rotation.y = Math.sin(this.elapsed * 2.5 + flag.position.x) * 0.4;
    }
    this.refreshBadge();
  }

  // -- inspection / save ---------------------------------------------------------------------------

  get best() {
    return {
      jumps: this.totals.jumps,
      topSpeed: Number(this.totals.topSpeed.toFixed(1)),
      driftSeconds: Math.floor(this.totals.driftSeconds),
      nearMisses: this.totals.nearMisses,
      stuntCash: this.totals.stuntCash,
      rampsHit: this.totals.rampsHit,
      challengesDone: this.completedChallenges.size,
    };
  }

  getState() {
    return {
      totals: { ...this.totals },
      rampsHit: [...this.rampsHitSet],
      challenges: [...this.completedChallenges],
      score: this.score,
      sessionCash: this.sessionCash,
    };
  }

  setState(state) {
    if (!state) return;
    if (state.totals) this.totals = { ...this.totals, ...state.totals };
    this.rampsHitSet = new Set(state.rampsHit || []);
    this.completedChallenges = new Set(state.challenges || []);
    this.score = state.score || 0;
    this.sessionCash = state.sessionCash || 0;
  }

  // Test hook: pretend the player just hit a ramp (used by the
  // verification probe, which cannot drive the car in headless time).
  debugJump(rampName) {
    const found = this.rampMeshes.find((r) => r.spec.name === rampName);
    if (!found) return false;
    const vehicle = this.player.inVehicle ? this.player.vehicle : null;
    if (!vehicle) return false;
    vehicle.speed = 30;
    this.launchJump(vehicle, found.spec);
    return true;
  }
}

// -- stunt flavour -------------------------------------------------------------------------------
// Crowd reactions: lines the game can show when a big stunt lands.
// They are flavour for the HUD, not objectives.
export const STUNT_CROWD_LINES = [
  'The crowd goes wild!',
  'Someone filmed that. You are famous now.',
  'The gulls are impressed. The gulls are never impressed.',
  'Delia saw that. She is taking notes.',
  'That was either genius or insurance fraud.',
  'The marina just gave you a standing ovation.',
];

export function crowdLine(random) {
  return STUNT_CROWD_LINES[Math.floor(random() * STUNT_CROWD_LINES.length)];
}

// Stunt names for the leaderboard: grades for a jump by payout size.
export const JUMP_GRADES = [
  { min: 0, grade: 'Hop', line: 'A little hop.' },
  { min: 400, grade: 'Jump', line: 'A proper jump.' },
  { min: 700, grade: 'Big Air', line: 'Big air!' },
  { min: 1000, grade: 'Legendary', line: 'Legendary air!' },
];

export function gradeJump(payout) {
  let best = JUMP_GRADES[0];
  for (const g of JUMP_GRADES) {
    if (payout >= g.min) best = g;
  }
  return best;
}
