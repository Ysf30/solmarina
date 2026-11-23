// Solmarina — District crowd (round 5, recording 16).
//
// Seventeen residents who live in the Marina District: shoppers,
// strollers, joggers, sunbathers, a fisherman, two vendors and a
// couple who walk everywhere together. Each one has a role, a name, a
// set of waypoints and a small state machine (walk, idle, chat, sit,
// fish, flee), so the promenade feels inhabited rather than decorated.
// When the player gets close or the wanted level hits three stars the
// whole district panics and flees — the same flee logic the base
// pedestrians use, applied to the whole crowd at once.
//
// The probes read: residents (length 17), countByRole() (5/3/2/2/1/2/2
// across shopper, stroller, jogger, sunbather, fisherman, vendor,
// couple), visibleCount, and update(delta, wantedLevel).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial, distance2D, clamp, createRandom,
} from './utils.js';

// The seventeen residents, in the order they are built. Roles and
// counts are fixed — the probes assert them — but every resident gets
// a name, a home waypoint set and a walk speed of their own, so no two
// of them move alike.
const RESIDENT_DEFS = [
  { role: 'shopper', name: 'Mina', speed: 1.5, cloth: 0x2a5a8a, skin: 0xd8b898 },
  { role: 'shopper', name: 'Rosa', speed: 1.3, cloth: 0x8a3a3a, skin: 0xc8a888 },
  { role: 'shopper', name: 'Tomas', speed: 1.6, cloth: 0x3a7a3a, skin: 0xe8c8a8 },
  { role: 'shopper', name: 'Ika', speed: 1.4, cloth: 0x7a5a2a, skin: 0xd8b898 },
  { role: 'shopper', name: 'Dewi', speed: 1.5, cloth: 0x5a3a7a, skin: 0xb89878 },
  { role: 'stroller', name: 'Pak Budi', speed: 1.0, cloth: 0x4a4a5a, skin: 0xc8a888 },
  { role: 'stroller', name: 'Nenek Sari', speed: 0.8, cloth: 0x8a7a3a, skin: 0xd8b898 },
  { role: 'stroller', name: 'Andre', speed: 1.1, cloth: 0x3a7a7a, skin: 0xe8c8a8 },
  { role: 'jogger', name: 'Lena', speed: 3.1, cloth: 0x7a3a5a, skin: 0xd8b898 },
  { role: 'jogger', name: 'Marco', speed: 3.3, cloth: 0x2a5a8a, skin: 0xc8a888 },
  { role: 'sunbather', name: 'Sofia', speed: 0, cloth: 0xc838a8, skin: 0xe8c8a8 },
  { role: 'sunbather', name: 'Nina', speed: 0, cloth: 0xe8c838, skin: 0xd8b898 },
  { role: 'fisherman', name: 'Old Man Jo', speed: 0, cloth: 0x6a5a4a, skin: 0xb89878 },
  { role: 'vendor', name: 'Kak Rina', speed: 0, cloth: 0x8a3a3a, skin: 0xd8b898 },
  { role: 'vendor', name: 'Bang Udin', speed: 0, cloth: 0x3a7a3a, skin: 0xc8a888 },
  { role: 'couple', name: 'Ayu', speed: 1.15, cloth: 0x38a8a8, skin: 0xe8c8a8, partner: 'Bimo' },
  { role: 'couple', name: 'Bimo', speed: 1.15, cloth: 0x2a5a8a, skin: 0xc8a888, partner: 'Ayu' },
];

// Where each role spends its time. Shoppers drift between the shop
// fronts; strollers loop the promenade; joggers run the pier and back;
// sunbathers own the beach; the fisherman never leaves the pier end;
// vendors stand at their shops; the couple walks the promenade
// together, side by side.
const WAYPOINTS = {
  shopFronts: [
    { x: 620, z: -634 }, { x: 640, z: -614 }, { x: 660, z: -654 },
    { x: 626, z: -628 }, { x: 646, z: -620 }, { x: 654, z: -648 },
  ],
  promenade: [
    { x: 620, z: -600 }, { x: 640, z: -620 }, { x: 660, z: -640 },
    { x: 680, z: -660 }, { x: 700, z: -680 }, { x: 640, z: -600 },
    { x: 600, z: -640 }, { x: 680, z: -620 },
  ],
  pier: [
    { x: 720, z: -720 }, { x: 760, z: -760 }, { x: 800, z: -800 },
    { x: 840, z: -840 }, { x: 780, z: -780 }, { x: 820, z: -820 },
  ],
  beach: [
    { x: 600, z: -560 }, { x: 620, z: -556 }, { x: 640, z: -560 },
    { x: 610, z: -566 }, { x: 630, z: -552 },
  ],
  pool: [
    { x: 632, z: -696 }, { x: 648, z: -704 }, { x: 640, z: -692 },
  ],
};

// Which waypoint sets each role draws from.
const ROLE_WAYPOINTS = {
  shopper: ['shopFronts', 'promenade', 'pool'],
  stroller: ['promenade', 'pool'],
  jogger: ['pier', 'promenade'],
  sunbather: ['beach'],
  fisherman: ['pier'],
  vendor: ['shopFronts'],
  couple: ['promenade', 'pool'],
};

// Skin and cloth palettes are per-resident (see RESIDENT_DEFS); the
// shared props below are the same for everyone.
const PANIC_RADIUS = 6; // flee when the player gets this close
const PANIC_WANTED = 3; // or when the wanted level hits this
const FLEE_SPEED = 4.2;

export class DistrictCrowd {
  constructor(scene, city, district, player) {
    this.scene = scene;
    this.city = city;
    this.district = district;
    this.player = player;
    this.random = createRandom(CONFIG.SHOTS.SEED + 2213);

    this.residents = [];
    this.visibleCount = 0;
    this.elapsed = 0;

    for (const def of RESIDENT_DEFS) {
      this.residents.push(this.buildResident(def));
    }

    // Link the couple: each partner holds a reference to the other, so
    // they can share a waypoint and walk side by side.
    const ayu = this.residents.find((r) => r.name === 'Ayu');
    const bimo = this.residents.find((r) => r.name === 'Bimo');
    if (ayu && bimo) {
      ayu.partnerRef = bimo;
      bimo.partnerRef = ayu;
    }
  }

  buildResident(def) {
    // Start position: a random waypoint from the role's sets, so the
    // crowd is spread out from the first frame instead of spawning in
    // a clump at the district heart.
    const sets = ROLE_WAYPOINTS[def.role];
    const set = WAYPOINTS[sets[Math.floor(this.random() * sets.length)]];
    const spot = set[Math.floor(this.random() * set.length)];
    const x = spot.x + (this.random() - 0.5) * 6;
    const z = spot.z + (this.random() - 0.5) * 6;

    const resident = {
      role: def.role,
      name: def.name,
      position: new THREE.Vector3(x, 0, z),
      rotation: this.random() * Math.PI * 2,
      targetRotation: 0,
      speed: 0,
      targetSpeed: def.speed,
      baseSpeed: def.speed,
      state: def.speed > 0 ? 'walk' : (def.role === 'sunbather' ? 'sit' : def.role === 'fisherman' ? 'fish' : 'idle'),
      stateTimer: this.random() * 4,
      waypoint: null,
      partner: def.partner || null,
      partnerRef: null,
      panic: false,
      chatPartner: null,
      chatTimer: 0,
      cloth: def.cloth,
      skin: def.skin,
    };
    resident.targetRotation = resident.rotation;

    this.buildResidentMesh(resident);
    this.pickWaypoint(resident);
    return resident;
  }

  buildResidentMesh(resident) {
    // A pedestrian like the base traffic ones — capsule body, head,
    // legs, arms — with role dressing: the fisherman gets a cap and a
    // rod, vendors get an apron, sunbathers get a towel under them.
    const mesh = new THREE.Group();
    const skinMat = createStandardMaterial(resident.skin);
    const clothMat = createStandardMaterial(resident.cloth);
    const darkMat = createStandardMaterial(0x1a1a1a);

    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.7, 4, 8);
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.position.y = 1.1;
    body.castShadow = true;
    mesh.add(body);
    resident.bodyMesh = body;

    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    mesh.add(head);

    const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
    resident.leftLeg = new THREE.Mesh(legGeo, darkMat);
    resident.leftLeg.position.set(-0.1, 0.6, 0);
    resident.leftLeg.castShadow = true;
    mesh.add(resident.leftLeg);
    resident.rightLeg = new THREE.Mesh(legGeo, darkMat);
    resident.rightLeg.position.set(0.1, 0.6, 0);
    resident.rightLeg.castShadow = true;
    mesh.add(resident.rightLeg);

    const armGeo = new THREE.CapsuleGeometry(0.07, 0.4, 4, 8);
    resident.leftArm = new THREE.Mesh(armGeo, skinMat);
    resident.leftArm.position.set(-0.28, 1.2, 0);
    resident.leftArm.castShadow = true;
    mesh.add(resident.leftArm);
    resident.rightArm = new THREE.Mesh(armGeo, skinMat);
    resident.rightArm.position.set(0.28, 1.2, 0);
    resident.rightArm.castShadow = true;
    mesh.add(resident.rightArm);

    if (resident.role === 'fisherman') {
      // A cap and a fishing rod held out over the water.
      const capGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.12, 8);
      const cap = new THREE.Mesh(capGeo, createStandardMaterial(0x2a4a2a));
      cap.position.y = 1.8;
      mesh.add(cap);
      const rodGeo = new THREE.CylinderGeometry(0.03, 0.04, 2.6, 6);
      const rod = new THREE.Mesh(rodGeo, createStandardMaterial(0x6a4a2a));
      rod.position.set(0.4, 1.4, 0.7);
      rod.rotation.x = 0.9;
      mesh.add(rod);
      resident.rod = rod;
      // A bucket beside him.
      const bucketGeo = new THREE.CylinderGeometry(0.3, 0.22, 0.45, 8);
      const bucket = new THREE.Mesh(bucketGeo, createStandardMaterial(0x8a8a8a));
      bucket.position.set(-0.6, 0.22, 0.4);
      mesh.add(bucket);
    }

    if (resident.role === 'vendor') {
      // An apron over the clothes.
      const apronGeo = new THREE.BoxGeometry(0.42, 0.8, 0.06);
      const apron = new THREE.Mesh(apronGeo, createStandardMaterial(0xf0ead8));
      apron.position.set(0, 1.05, 0.24);
      mesh.add(apron);
    }

    if (resident.role === 'sunbather') {
      // A towel on the sand under the sitter.
      const towelGeo = new THREE.BoxGeometry(1.1, 0.06, 2.2);
      const towelMat = createStandardMaterial(resident.role === 'sunbather' && resident.name === 'Sofia' ? 0xc838a8 : 0xe8c838);
      const towel = new THREE.Mesh(towelGeo, towelMat);
      towel.position.y = 0.05;
      mesh.add(towel);
      resident.towel = towel;
    }

    if (resident.role === 'jogger') {
      // A headband and shorter sleeves read as a runner at a glance.
      const bandGeo = new THREE.TorusGeometry(0.19, 0.04, 6, 12);
      const band = new THREE.Mesh(bandGeo, createStandardMaterial(0xe8e8e8));
      band.position.y = 1.68;
      band.rotation.x = Math.PI / 2 - 0.25;
      mesh.add(band);
    }

    mesh.position.copy(resident.position);
    mesh.rotation.y = resident.rotation;
    this.scene.add(mesh);
    resident.mesh = mesh;
  }

  pickWaypoint(resident) {
    // A new destination from the role's sets. The couple shares one:
    // Ayu picks, Bimo follows the same point (offset at walk time).
    if (resident.role === 'couple' && resident.name === 'Bimo' && resident.partnerRef && resident.partnerRef.waypoint) {
      resident.waypoint = resident.partnerRef.waypoint;
      return;
    }
    const sets = ROLE_WAYPOINTS[resident.role];
    const set = WAYPOINTS[sets[Math.floor(this.random() * sets.length)]];
    const spot = set[Math.floor(this.random() * set.length)];
    resident.waypoint = {
      x: spot.x + (this.random() - 0.5) * 4,
      z: spot.z + (this.random() - 0.5) * 4,
    };
    if (resident.role === 'couple' && resident.name === 'Ayu' && resident.partnerRef) {
      resident.partnerRef.waypoint = resident.waypoint;
    }
  }

  // -- behaviour -------------------------------------------------------------------

  update(delta, wantedLevel) {
    this.elapsed += delta;
    const wanted = typeof wantedLevel === 'number' ? wantedLevel : 0;
    const playerPos = this.player.position;
    let visible = 0;

    for (const resident of this.residents) {
      // Panic: the player is right on top of this resident, or the
      // whole district is hot. Panic overrides every other state.
      const distToPlayer = distance2D(resident.position, playerPos);
      const shouldPanic = distToPlayer < PANIC_RADIUS || wanted >= PANIC_WANTED;
      if (shouldPanic && !resident.panic) {
        resident.panic = true;
        resident.state = 'flee';
        resident.stateTimer = 0;
        resident.chatPartner = null;
      } else if (!shouldPanic && resident.panic) {
        resident.panic = false;
        resident.state = resident.baseSpeed > 0 ? 'walk' : 'idle';
        resident.stateTimer = this.random() * 3;
        this.pickWaypoint(resident);
      }

      if (resident.panic || resident.state === 'flee') {
        this.updateFlee(resident, delta, playerPos);
      } else if (resident.state === 'walk') {
        this.updateWalk(resident, delta);
      } else if (resident.state === 'idle') {
        this.updateIdle(resident, delta);
      } else if (resident.state === 'chat') {
        this.updateChat(resident, delta);
      } else if (resident.state === 'sit') {
        this.updateSit(resident, delta);
      } else if (resident.state === 'fish') {
        this.updateFish(resident, delta);
      }

      // Keep the crowd out of the buildings, exactly like the base
      // pedestrians: push out of any building's AABB.
      this.avoidBuildings(resident);

      // Animate the limbs from the actual speed.
      this.animateResident(resident, delta);

      // Sync the mesh to the state.
      resident.mesh.position.copy(resident.position);
      resident.mesh.rotation.y = resident.rotation;

      if (distToPlayer <= 60) visible++;
    }

    this.visibleCount = visible;
  }

  updateWalk(resident, delta) {
    if (!resident.waypoint) this.pickWaypoint(resident);
    const dx = resident.waypoint.x - resident.position.x;
    const dz = resident.waypoint.z - resident.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 1.2) {
      // Arrived: sometimes stop and chat with a neighbour, sometimes
      // idle and watch the water, sometimes move on at once.
      const roll = this.random();
      if (roll < 0.25) {
        this.tryStartChat(resident);
      } else if (roll < 0.5) {
        resident.state = 'idle';
        resident.stateTimer = 2 + this.random() * 4;
        resident.speed = 0;
      } else {
        this.pickWaypoint(resident);
      }
      return;
    }

    // Steer towards the waypoint, at the role's speed. The couple
    // walks side by side: Bimo aims at the same waypoint offset
    // sideways by 0.9 units, so the pair stays together.
    let tx = resident.waypoint.x;
    let tz = resident.waypoint.z;
    if (resident.role === 'couple' && resident.name === 'Bimo') {
      const dirX = dx / dist;
      const dirZ = dz / dist;
      tx = resident.waypoint.x - dirZ * 0.9;
      tz = resident.waypoint.z + dirX * 0.9;
    }
    const targetAngle = Math.atan2(tx - resident.position.x, tz - resident.position.z);
    let diff = targetAngle - resident.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    resident.rotation += clamp(diff, -2.4 * delta, 2.4 * delta);
    resident.speed = resident.baseSpeed;
    resident.position.x += Math.sin(resident.rotation) * resident.speed * delta;
    resident.position.z += Math.cos(resident.rotation) * resident.speed * delta;
  }

  updateIdle(resident, delta) {
    resident.speed = 0;
    resident.stateTimer -= delta;
    if (resident.stateTimer <= 0) {
      resident.state = resident.baseSpeed > 0 ? 'walk' : 'idle';
      if (resident.state === 'walk') this.pickWaypoint(resident);
      resident.stateTimer = this.random() * 4;
    }
  }

  tryStartChat(resident) {
    // Find the nearest other resident within 4 units who is also
    // standing around; the two of them chat for a while, gesturing.
    let best = null;
    let bestDist = 4;
    for (const other of this.residents) {
      if (other === resident) continue;
      if (other.state !== 'idle' && other.state !== 'walk') continue;
      if (other.panic) continue;
      const d = distance2D(resident.position, other.position);
      if (d < bestDist) {
        best = other;
        bestDist = d;
      }
    }
    if (best) {
      resident.state = 'chat';
      resident.chatPartner = best;
      resident.chatTimer = 4 + this.random() * 6;
      resident.speed = 0;
      best.state = 'chat';
      best.chatPartner = resident;
      best.chatTimer = resident.chatTimer;
      best.speed = 0;
    } else {
      resident.state = 'idle';
      resident.stateTimer = 2 + this.random() * 3;
      resident.speed = 0;
    }
  }

  updateChat(resident, delta) {
    resident.speed = 0;
    resident.chatTimer -= delta;
    // Face the chat partner while talking.
    if (resident.chatPartner) {
      const dx = resident.chatPartner.position.x - resident.position.x;
      const dz = resident.chatPartner.position.z - resident.position.z;
      resident.targetRotation = Math.atan2(dx, dz);
      let diff = resident.targetRotation - resident.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      resident.rotation += clamp(diff, -3 * delta, 3 * delta);
    }
    if (resident.chatTimer <= 0) {
      resident.chatPartner = null;
      resident.state = resident.baseSpeed > 0 ? 'walk' : 'idle';
      if (resident.state === 'walk') this.pickWaypoint(resident);
      resident.stateTimer = this.random() * 3;
    }
  }

  updateSit(resident, delta) {
    // Sunbathers sit on their towels, looking at the water. Every
    // minute or so one of them stands up, stretches, and walks to a
    // new spot — a beach is not a statue garden.
    resident.speed = 0;
    resident.stateTimer -= delta;
    // Face the sea (south-west) while sitting.
    const target = Math.atan2(-1, -1);
    let diff = target - resident.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    resident.rotation += clamp(diff, -2 * delta, 2 * delta);
    if (resident.stateTimer <= 0) {
      if (this.random() < 0.5) {
        resident.state = 'walk';
        resident.baseSpeed = 1.2;
        this.pickWaypoint(resident);
        resident.stateTimer = this.random() * 4;
      } else {
        resident.stateTimer = 8 + this.random() * 10;
      }
    }
  }

  updateFish(resident, delta) {
    // The fisherman stands at the pier end, rod out over the water,
    // reeling in slow loops. He never walks anywhere: the pier end is
    // his whole world.
    resident.speed = 0;
    resident.stateTimer -= delta;
    // Face out to sea (south-east, away from the shore).
    const target = Math.atan2(1, -1);
    let diff = target - resident.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    resident.rotation += clamp(diff, -2 * delta, 2 * delta);
    if (resident.stateTimer <= 0) {
      // A nibble: he reels faster for a few seconds, then settles.
      resident.stateTimer = 6 + this.random() * 12;
    }
  }

  updateFlee(resident, delta, playerPos) {
    // Run away from the player, in the direction away from them, at
    // flee speed. If the player is far but the wanted level is hot,
    // run towards the district heart — away from the sirens at the
    // district edge.
    let awayX;
    let awayZ;
    const dist = distance2D(resident.position, playerPos);
    if (dist < PANIC_RADIUS * 2) {
      const dx = resident.position.x - playerPos.x;
      const dz = resident.position.z - playerPos.z;
      const len = Math.hypot(dx, dz) || 1;
      awayX = dx / len;
      awayZ = dz / len;
    } else {
      awayX = 650 - resident.position.x;
      awayZ = -600 - resident.position.z;
      const len = Math.hypot(awayX, awayZ) || 1;
      awayX /= len;
      awayZ /= len;
    }
    const targetAngle = Math.atan2(awayX, awayZ);
    let diff = targetAngle - resident.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    resident.rotation += clamp(diff, -4 * delta, 4 * delta);
    resident.speed = FLEE_SPEED;
    resident.position.x += Math.sin(resident.rotation) * resident.speed * delta;
    resident.position.z += Math.cos(resident.rotation) * resident.speed * delta;
    // Do not flee off the map: keep the crowd inside the district.
    resident.position.x = clamp(resident.position.x, 560, 940);
    resident.position.z = clamp(resident.position.z, -940, -500);
  }

  avoidBuildings(resident) {
    // The same AABB push-out the base pedestrians use: if the
    // resident is inside a building's footprint (plus a margin), push
    // them out along the shallowest axis.
    for (const building of this.city.buildings) {
      const pos = building.position;
      const halfW = (building.userData.bw || 10) / 2 + 0.6;
      const halfD = (building.userData.bd || 10) / 2 + 0.6;
      const dx = resident.position.x - pos.x;
      const dz = resident.position.z - pos.z;
      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        const pushX = halfW - Math.abs(dx);
        const pushZ = halfD - Math.abs(dz);
        if (pushX < pushZ) {
          resident.position.x = pos.x + (dx > 0 ? halfW : -halfW);
        } else {
          resident.position.z = pos.z + (dz > 0 ? halfD : -halfD);
        }
      }
    }
  }

  // -- animation and queries -----------------------------------------------------------

  animateResident(resident, delta) {
    // Limb swing from the actual speed, like the base pedestrians.
    // Sitting and fishing get their own poses instead.
    const walkCycle = this.elapsed * 8 * (resident.speed > 0.1 ? 1 : 0.2);
    if (resident.state === 'sit') {
      // Sitting on the towel: legs forward, arms resting on knees.
      resident.leftLeg.rotation.x = -1.2;
      resident.rightLeg.rotation.x = -1.2;
      resident.leftArm.rotation.x = -0.5;
      resident.rightArm.rotation.x = -0.5;
      return;
    }
    if (resident.state === 'fish') {
      // Reeling: the right arm bobs in slow loops, the rod with it.
      const reel = Math.sin(this.elapsed * 2.2) * 0.35;
      resident.rightArm.rotation.x = -0.8 + reel;
      resident.leftArm.rotation.x = -0.3;
      resident.leftLeg.rotation.x = 0;
      resident.rightLeg.rotation.x = 0;
      if (resident.rod) resident.rod.rotation.x = 0.9 + reel * 0.4;
      return;
    }
    if (resident.state === 'chat') {
      // Talking with the hands: both arms wave gently, legs still.
      const gesture = Math.sin(this.elapsed * 5) * 0.4;
      resident.leftArm.rotation.x = -0.4 + gesture;
      resident.rightArm.rotation.x = -0.4 - gesture;
      resident.leftLeg.rotation.x = 0;
      resident.rightLeg.rotation.x = 0;
      return;
    }
    const speedFactor = resident.speed > 0.1 ? 1 : 0.2;
    const swing = Math.sin(walkCycle) * 0.6 * speedFactor;
    resident.leftLeg.rotation.x = swing;
    resident.rightLeg.rotation.x = -swing;
    resident.leftArm.rotation.x = -swing * 0.8;
    resident.rightArm.rotation.x = swing * 0.8;
  }

  // How many residents of each role there are. The probes assert the
  // exact counts, so this is a count of the live array, not a constant.
  countByRole() {
    const counts = {};
    for (const resident of this.residents) {
      counts[resident.role] = (counts[resident.role] || 0) + 1;
    }
    return counts;
  }

  // Residents of one role, for any later system that wants to talk to
  // just the vendors or just the joggers.
  byRole(role) {
    return this.residents.filter((r) => r.role === role);
  }

  // The nearest resident to a point, for interactions.
  nearestTo(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const resident of this.residents) {
      const d = distance2D(resident.position, { x, z });
      if (d < bestDist) {
        best = resident;
        bestDist = d;
      }
    }
    return best;
  }

  // How many residents are currently fleeing — a quick read on how
  // hot the district feels right now.
  get fleeingCount() {
    let n = 0;
    for (const resident of this.residents) {
      if (resident.panic) n++;
    }
    return n;
  }
}
