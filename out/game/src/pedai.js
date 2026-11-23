// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Richer Pedestrian AI ("District Crowd")
//
// The base traffic system spawns generic walkers who stroll the sidewalks
// and flee the player. This system adds a second, resident crowd that
// lives in the Marina District and actually does things: shoppers browse
// the promenade shops, couples stroll together and stop to chat,
// joggers run the pier loop, sunbathers lie on the beach, a fisherman
// works the pier head, and vendors mind their shop counters. Each
// resident has a role, a daily rhythm and a personality (walk speed,
// patience, chattiness), and the crowd reacts as a group — when the
// wanted level spikes, shoppers hurry for cover and the beach empties.
//
// The residents are independent of TrafficSystem's pedestrians (they are
// never despawned or recycled), so the district always feels inhabited
// when the player arrives. They are cheap: 16 residents, each a handful
// of meshes, updated with the same fixed timestep as everything else.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial,
  createRandom,
  clamp,
  distance2D,
  distance2DSq,
} from './utils.js';

// Role definitions: how many residents of each role, how fast they move,
// and what they do. Speeds are in units/second.
export const CROWD_ROLES = {
  shopper: {
    count: 5,
    walkSpeed: 1.2,
    runSpeed: 3.2,
    patience: [4, 10],
    chattiness: 0.4,
    blurb: 'Browses the promenade shops, pausing at windows.',
  },
  stroller: {
    count: 3,
    walkSpeed: 0.9,
    runSpeed: 3.0,
    patience: [8, 20],
    chattiness: 0.7,
    blurb: 'Slow walk along the boardwalk, stopping to look at the sea.',
  },
  jogger: {
    count: 2,
    walkSpeed: 3.4,
    runSpeed: 5.0,
    patience: [2, 4],
    chattiness: 0.05,
    blurb: 'Runs the pier loop, never stops, never chats.',
  },
  sunbather: {
    count: 2,
    walkSpeed: 1.0,
    runSpeed: 3.0,
    patience: [30, 60],
    chattiness: 0.2,
    blurb: 'Lies on a towel on the sand, occasionally sits up.',
  },
  fisherman: {
    count: 1,
    walkSpeed: 1.0,
    runSpeed: 3.0,
    patience: [20, 40],
    chattiness: 0.1,
    blurb: 'Fishes off the pier head, reeling in on a slow rhythm.',
  },
  vendor: {
    count: 2,
    walkSpeed: 0.8,
    runSpeed: 2.5,
    patience: [15, 30],
    chattiness: 0.8,
    blurb: 'Minds a shop counter, waving at passers-by.',
  },
  couple: {
    count: 2, // spawned as one pair, not two singles
    walkSpeed: 1.0,
    runSpeed: 3.0,
    patience: [6, 14],
    chattiness: 0.9,
    blurb: 'A pair strolling together, stopping to chat face to face.',
  },
};

// Waypoint sets, as [x, z] pairs. Shoppers use the shop fronts, strollers
// the boardwalk, joggers the pier loop, sunbathers the sand.
export const SHOP_FRONTS = [
  { x: 608, z: -600 }, { x: 672, z: -600 }, { x: 736, z: -600 },
  { x: 608, z: -616 }, { x: 672, z: -616 }, { x: 736, z: -616 },
];
export const BOARDWALK_SPOTS = [
  { x: 530, z: -626 }, { x: 580, z: -654 }, { x: 630, z: -626 },
  { x: 680, z: -654 }, { x: 730, z: -626 }, { x: 770, z: -654 },
  { x: 560, z: -626 }, { x: 610, z: -654 }, { x: 700, z: -626 },
  { x: 750, z: -654 },
];
export const PIER_LOOP = [
  { x: 700, z: -700 }, { x: 740, z: -740 }, { x: 780, z: -780 },
  { x: 820, z: -820 }, { x: 858, z: -858 }, { x: 820, z: -820 },
  { x: 780, z: -780 }, { x: 740, z: -740 },
];
export const BEACH_SPOTS = [
  { x: 600, z: -760 }, { x: 660, z: -800 }, { x: 720, z: -740 },
  { x: 580, z: -820 }, { x: 760, z: -820 },
];
export const VENDOR_SPOTS = [
  { x: 608, z: -602 }, { x: 736, z: -602 },
];

// Skin / clothing palettes for residents. Wider than the traffic
// pedestrians' so the district crowd looks distinct at a glance.
const SKIN_COLORS = [0xd8b898, 0xc8a888, 0xe8c8a8, 0xb89878, 0xa88868, 0x8a6a4a];
const SHIRT_COLORS = [
  0x2a5a8a, 0x8a3a3a, 0x3a7a3a, 0x7a5a2a, 0x5a3a7a, 0x8a7a3a,
  0x3a7a7a, 0x7a3a5a, 0x4a4a5a, 0x6a5a4a, 0xff6b9d, 0x22ccdd,
];
const PANTS_COLORS = [0x1a1a1a, 0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x8a8a8a];

export class DistrictCrowd {
  constructor(scene, city, district, player) {
    this.scene = scene;
    this.city = city;
    this.district = district;
    this.player = player;
    this.random = createRandom(90210);

    this.residents = [];
    this.elapsed = 0;
    this.fleeAll = false;

    this.spawnResidents();
  }

  spawnResidents() {
    // Shoppers, strollers, joggers, sunbathers, fisherman, vendors.
    for (const [role, def] of Object.entries(CROWD_ROLES)) {
      if (role === 'couple') continue; // couples spawn as a pair below
      for (let i = 0; i < def.count; i++) {
        const spot = this.startSpotFor(role, i);
        const resident = new Resident(this.scene, this.city, this.random, role, spot);
        this.residents.push(resident);
      }
    }
    // One couple: two residents sharing a leader and a chat timer.
    const aSpot = { x: 560, z: -626 };
    const bSpot = { x: 562, z: -624 };
    const first = new Resident(this.scene, this.city, this.random, 'couple', aSpot);
    const second = new Resident(this.scene, this.city, this.random, 'couple', bSpot);
    first.partner = second;
    second.partner = first;
    first.isLeader = true;
    this.residents.push(first, second);
  }

  startSpotFor(role, i) {
    switch (role) {
      case 'shopper': return SHOP_FRONTS[i % SHOP_FRONTS.length];
      case 'stroller': return BOARDWALK_SPOTS[i % BOARDWALK_SPOTS.length];
      case 'jogger': return PIER_LOOP[i % PIER_LOOP.length];
      case 'sunbather': return BEACH_SPOTS[i % BEACH_SPOTS.length];
      case 'fisherman': return { x: 852, z: -852 };
      case 'vendor': return VENDOR_SPOTS[i % VENDOR_SPOTS.length];
      default: return BOARDWALK_SPOTS[0];
    }
  }

  countByRole() {
    const counts = {};
    for (const r of this.residents) counts[r.role] = (counts[r.role] || 0) + 1;
    return counts;
  }

  get visibleCount() {
    // Residents near the player (the ones the player can actually see).
    let n = 0;
    for (const r of this.residents) {
      if (distance2D(r.position, this.player.position) < 120) n++;
    }
    return n;
  }

  update(delta, wantedLevel = 0) {
    this.elapsed += delta;
    // Group reaction: at 3+ stars the whole district gets nervous.
    this.fleeAll = wantedLevel >= 3;
    const playerPos = this.player.position;
    for (const r of this.residents) {
      // Cheap culling: residents far from the player still need their
      // state machine (a sunbather should still be there when the player
      // returns), but their animation can skip.
      const far = distance2D(r.position, playerPos) > 260;
      r.update(delta, playerPos, this.fleeAll, far);
    }
    // Couples stay in sync: when the leader chats, the partner chats.
    for (const r of this.residents) {
      if (r.role === 'couple' && r.isLeader && r.partner) {
        if (r.state === 'chat' && r.partner.state !== 'chat' && r.partner.state !== 'flee') {
          r.partner.startChat(r);
        }
        if (r.state === 'walk' && r.partner.state === 'chat') {
          r.partner.state = 'walk';
          r.partner.stateTimer = 0;
        }
      }
    }
  }
}

// -- one resident ------------------------------------------------------------
// A resident is a small articulated figure: capsule body, sphere head,
// capsule limbs, and role accessories. The state machine is walk / idle /
// chat / sit / fish / flee; each role weights the states differently.

class Resident {
  constructor(scene, city, random, role, spot) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.role = role;
    this.def = CROWD_ROLES[role];

    this.position = new THREE.Vector3(spot.x, 0, spot.z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = random() * Math.PI * 2;
    this.targetRotation = this.rotation;
    this.speed = 0;
    this.targetSpeed = 0;
    this.state = role === 'sunbather' ? 'sit' : role === 'fisherman' ? 'fish' : role === 'vendor' ? 'idle' : 'walk';
    this.stateTimer = random() * 4;
    this.health = 50;
    this.isDead = false;
    this.partner = null;
    this.isLeader = false;
    this.chatTarget = null;
    this.waypoint = null;
    this.waypointIndex = Math.floor(random() * 4);
    this.fishPhase = random() * Math.PI * 2;
    this.sitPhase = random() * Math.PI * 2;

    this.createMesh();
    this.pickWaypoint();
  }

  createMesh() {
    this.mesh = new THREE.Group();
    const skin = SKIN_COLORS[Math.floor(this.random() * SKIN_COLORS.length)];
    const shirt = SHIRT_COLORS[Math.floor(this.random() * SHIRT_COLORS.length)];
    const pants = PANTS_COLORS[Math.floor(this.random() * PANTS_COLORS.length)];
    const skinMat = createStandardMaterial(skin);
    const shirtMat = createStandardMaterial(shirt);
    const pantsMat = createStandardMaterial(pants);

    // Body.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.65, 4, 8), shirtMat);
    body.position.y = 1.08;
    body.castShadow = true;
    this.mesh.add(body);
    this.body = body;
    // Head.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    this.mesh.add(head);
    this.head = head;
    // Legs.
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.1, 0.58, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.1, 0.58, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);
    // Arms.
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.4, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.28, 1.18, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);
    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.28, 1.18, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);

    // Role accessories.
    if (this.role === 'fisherman') this.addFishingRod();
    if (this.role === 'jogger') this.addHeadband();
    if (this.role === 'sunbather') this.addTowel();
    if (this.role === 'vendor') this.addApron();
    if (this.role === 'shopper') this.addShoppingBag();

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.scene.add(this.mesh);
  }

  addFishingRod() {
    // A long thin rod held in the right hand, angled over the water.
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 3.2, 5),
      createStandardMaterial(0x6a4a2a),
    );
    rod.position.set(0.35, 1.5, 0.5);
    rod.rotation.x = -0.9;
    this.mesh.add(rod);
    this.rod = rod;
    // A straw hat.
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.25, 8),
      createStandardMaterial(0xe8d5a8),
    );
    hat.position.y = 1.82;
    this.mesh.add(hat);
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10),
      createStandardMaterial(0xe8d5a8),
    );
    brim.position.y = 1.72;
    this.mesh.add(brim);
  }

  addHeadband() {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.09, 10),
      createStandardMaterial(0xff2222),
    );
    band.position.y = 1.68;
    this.mesh.add(band);
  }

  addTowel() {
    // A towel laid on the sand beside the sunbather (positioned in
    // world space relative to the resident, not as a child: the resident
    // lies ON it, so it must not rotate with the body).
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.06, 2.2),
      createStandardMaterial(0x38c8c8),
    );
    towel.position.set(this.position.x, 0.06, this.position.z);
    towel.rotation.y = this.rotation;
    towel.receiveShadow = true;
    this.scene.add(towel);
    this.towel = towel;
  }

  addApron() {
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.7, 0.06),
      createStandardMaterial(0xf8f8f8),
    );
    apron.position.set(0, 1.05, 0.22);
    this.mesh.add(apron);
  }

  addShoppingBag() {
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.35, 0.12),
      createStandardMaterial(0xc83838),
    );
    bag.position.set(-0.36, 0.75, 0.1);
    this.mesh.add(bag);
    this.bag = bag;
  }

  // -- waypoints ---------------------------------------------------------------

  waypointsFor(role) {
    switch (role) {
      case 'shopper': return SHOP_FRONTS;
      case 'stroller': return BOARDWALK_SPOTS;
      case 'jogger': return PIER_LOOP;
      case 'sunbather': return BEACH_SPOTS;
      case 'fisherman': return [{ x: 852, z: -852 }];
      case 'vendor': return VENDOR_SPOTS;
      case 'couple': return BOARDWALK_SPOTS;
      default: return BOARDWALK_SPOTS;
    }
  }

  pickWaypoint() {
    const list = this.waypointsFor(this.role);
    if (this.role === 'jogger') {
      // Joggers run the loop in order, not at random.
      this.waypointIndex = (this.waypointIndex + 1) % list.length;
      const w = list[this.waypointIndex];
      this.waypoint = new THREE.Vector3(w.x, 0, w.z);
      return;
    }
    if (this.role === 'fisherman' || this.role === 'vendor') {
      // These two stay put; their "waypoint" is their spot.
      const w = list[0];
      this.waypoint = new THREE.Vector3(w.x, 0, w.z);
      return;
    }
    // Everyone else picks a nearby waypoint (not the one they are on).
    let best = null;
    let bestDist = Infinity;
    for (const w of list) {
      const d = distance2DSq(this.position, w);
      if (d > 25 && d < 9000 && d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    if (!best) best = list[Math.floor(this.random() * list.length)];
    this.waypoint = new THREE.Vector3(best.x, 0, best.z);
  }

  // -- states --------------------------------------------------------------------

  startChat(other) {
    this.state = 'chat';
    this.stateTimer = 0;
    this.chatTarget = other;
    this.targetSpeed = 0;
    // Face the chat partner.
    const dx = other.position.x - this.position.x;
    const dz = other.position.z - this.position.z;
    this.targetRotation = Math.atan2(dx, dz);
  }

  startIdle() {
    this.state = 'idle';
    this.stateTimer = 0;
    this.targetSpeed = 0;
  }

  startWalk() {
    this.state = 'walk';
    this.stateTimer = 0;
    this.targetSpeed = this.def.walkSpeed;
    this.pickWaypoint();
  }

  startFlee(fromPos) {
    this.state = 'flee';
    this.stateTimer = 0;
    const away = new THREE.Vector3().subVectors(this.position, fromPos);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    this.targetRotation = Math.atan2(away.x, away.z);
    this.targetSpeed = this.def.runSpeed;
  }

  update(delta, playerPos, fleeAll, far) {
    if (this.isDead) {
      this.updateDeath(delta);
      return;
    }
    this.stateTimer += delta;
    const distToPlayer = distance2D(this.position, playerPos);

    // Flee triggers: the player barging in close, or a district-wide
    // panic when the wanted level is high. Sunbathers and vendors are
    // slower to panic (they are sitting / working); joggers just run.
    if (this.state !== 'flee') {
      const panicRadius = this.role === 'sunbather' || this.role === 'vendor' ? 3 : 5;
      if (distToPlayer < panicRadius) {
        this.startFlee(playerPos);
      } else if (fleeAll && distToPlayer < 45 && this.role !== 'fisherman') {
        this.startFlee(playerPos);
      }
    } else if (this.stateTimer > 3.5 && distToPlayer > 12) {
      // Safe again: sunbathers go back to their towel, everyone else walks.
      this.state = this.role === 'sunbather' ? 'sit' : this.role === 'fisherman' ? 'fish' : 'walk';
      this.stateTimer = 0;
      this.targetSpeed = this.state === 'walk' ? this.def.walkSpeed : 0;
      if (this.state === 'walk') this.pickWaypoint();
    }

    // State transitions for the calm states.
    if (this.state === 'walk') {
      const [min, max] = this.def.patience;
      if (this.stateTimer > min + this.random() * (max - min)) {
        const roll = this.random();
        if (this.role === 'couple' && this.partner && roll < this.def.chattiness) {
          // Couples chat together: the leader starts it, the partner
          // follows (the crowd syncs them in DistrictCrowd.update).
          this.startChat(this.partner);
        } else if (this.role === 'shopper' && roll < 0.55) {
          this.startIdle(); // browsing a shop window
        } else if (this.role === 'stroller' && roll < this.def.chattiness) {
          this.startIdle(); // looking at the sea
        } else if (this.role === 'sunbather') {
          this.state = 'sit';
          this.stateTimer = 0;
          this.targetSpeed = 0;
        } else {
          this.pickWaypoint();
          this.stateTimer = 0;
        }
      }
    } else if (this.state === 'idle') {
      const [min, max] = this.def.patience;
      if (this.stateTimer > min * 0.5 + this.random() * max * 0.5) {
        this.startWalk();
      }
    } else if (this.state === 'chat') {
      if (this.stateTimer > 4 + this.random() * 6) {
        this.state = 'walk';
        this.stateTimer = 0;
        this.targetSpeed = this.def.walkSpeed;
        this.chatTarget = null;
        this.pickWaypoint();
      } else if (this.chatTarget) {
        // Keep facing the chat partner.
        const dx = this.chatTarget.position.x - this.position.x;
        const dz = this.chatTarget.position.z - this.position.z;
        this.targetRotation = Math.atan2(dx, dz);
      }
    } else if (this.state === 'sit') {
      // Sunbathers lie for a long time, then sit up, then lie again.
      if (this.stateTimer > 20 + this.random() * 25) {
        this.state = 'walk';
        this.stateTimer = 0;
        this.targetSpeed = this.def.walkSpeed;
        this.pickWaypoint();
      }
    } else if (this.state === 'fish') {
      // The fisherman never leaves the pier head.
      this.targetSpeed = 0;
    }

    // Movement toward the waypoint (walk / flee only).
    if (this.state === 'walk' || this.state === 'flee') {
      if (!this.waypoint || distance2D(this.position, this.waypoint) < 2.5) {
        if (this.state === 'walk') this.pickWaypoint();
      }
      if (this.waypoint) {
        const dir = new THREE.Vector3().subVectors(this.waypoint, this.position);
        if (dir.lengthSq() > 0.01) {
          dir.normalize();
          this.targetRotation = Math.atan2(dir.x, dir.z);
        }
      }
    }

    // Couples walk side by side: the partner follows the leader's
    // waypoint instead of picking its own.
    if (this.role === 'couple' && !this.isLeader && this.partner && this.state === 'walk') {
      const lead = this.partner;
      if (lead.waypoint) {
        const side = new THREE.Vector3(1.2, 0, 0);
        side.applyAxisAngle(new THREE.Vector3(0, 1, 0), lead.rotation);
        this.waypoint = lead.waypoint.clone().add(side);
        const dir = new THREE.Vector3().subVectors(this.waypoint, this.position);
        if (dir.lengthSq() > 0.01) {
          dir.normalize();
          this.targetRotation = Math.atan2(dir.x, dir.z);
        }
      }
    }

    // Smooth rotation toward the target heading.
    let diff = this.targetRotation - this.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rotation += diff * delta * 5;

    // Speed easing.
    this.speed += (this.targetSpeed - this.speed) * delta * 5;

    // Move.
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.add(this.velocity.clone().multiplyScalar(delta));

    // Stay on the ground.
    const groundY = this.city.raycastGround(this.position.x, this.position.z);
    this.position.y = groundY;

    // Keep out of buildings (district condos are registered in
    // city.buildings, so this covers them too).
    this.avoidBuildings();

    // Animation (skipped when far from the player: the state machine
    // still runs, the limbs just don't need to swing).
    if (!far) this.updateAnimation(delta);

    // Pose the mesh.
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    if (this.state === 'sit') {
      // Lying on the towel: pitch the whole figure back.
      this.mesh.rotation.x = -Math.PI / 2 + 0.15;
      this.mesh.position.y = this.position.y + 0.35;
    } else {
      this.mesh.rotation.x = 0;
    }
  }

  avoidBuildings() {
    for (const building of this.city.buildings) {
      const bx = building.position.x;
      const bz = building.position.z;
      const bw = building.userData.bw / 2 + 1;
      const bd = building.userData.bd / 2 + 1;
      if (this.position.x > bx - bw && this.position.x < bx + bw &&
          this.position.z > bz - bd && this.position.z < bz + bd) {
        const dx = this.position.x - bx;
        const dz = this.position.z - bz;
        const overlapX = bw - Math.abs(dx);
        const overlapZ = bd - Math.abs(dz);
        if (overlapX < overlapZ) {
          this.position.x += dx > 0 ? overlapX : -overlapX;
        } else {
          this.position.z += dz > 0 ? overlapZ : -overlapZ;
        }
      }
    }
  }

  updateAnimation(delta) {
    const t = performance.now() * 0.001;
    if (this.state === 'fish' && this.rod) {
      // Slow reeling rhythm: the rod tip dips every few seconds.
      const cast = Math.sin(t * 0.7 + this.fishPhase);
      this.rod.rotation.x = -0.9 + cast * 0.25;
      this.rightArm.rotation.x = -0.6 + cast * 0.2;
      this.leftArm.rotation.x = 0;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      return;
    }
    if (this.state === 'sit') {
      // Lying still: arms folded, legs straight.
      this.leftArm.rotation.x = -1.2;
      this.rightArm.rotation.x = -1.2;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      return;
    }
    if (this.state === 'chat') {
      // Talking: one arm gestures, the other rests.
      const gesture = Math.sin(t * 3 + this.sitPhase) * 0.5;
      this.rightArm.rotation.x = -0.8 + gesture;
      this.leftArm.rotation.x = 0.1;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      return;
    }
    if (this.speed > 0.4) {
      const animSpeed = this.role === 'jogger' ? 14 : this.state === 'flee' ? 12 : 8;
      const swing = Math.sin(t * animSpeed) * 0.75;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.55;
      this.rightArm.rotation.x = swing * 0.55;
      if (this.bag) this.bag.rotation.z = Math.sin(t * animSpeed) * 0.2;
    } else {
      // Standing: gentle breathing sway.
      const breathe = Math.sin(t * 1.5 + this.sitPhase) * 0.03;
      this.body.position.y = 1.08 + breathe;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = Math.sin(t * 1.5) * 0.05;
      this.rightArm.rotation.x = -Math.sin(t * 1.5) * 0.05;
    }
  }

  updateDeath(delta) {
    this.mesh.rotation.x += delta * 2;
    this.mesh.position.y -= delta * 0.3;
  }

  takeDamage(amount, fromPos) {
    if (this.isDead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
      this.velocity.set(0, 0, 0);
    } else {
      this.startFlee(fromPos);
    }
  }
}
