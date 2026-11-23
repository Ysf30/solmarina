// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Marina District ("North Solmarina")
//
// A second city district in the north-east corner of the map, built on the
// empty sand ring where the procedural city puts no buildings (the old city
// only builds within radius 614 of the centre; the district sits at radius
// ~850-990). It gives the map a waterfront worth visiting: a yacht club,
// three beachfront condo towers, a pier with moored yachts, a lighthouse,
// a beach bar, promenade shops, a parking lot and its own street nodes so
// traffic and pedestrians can actually route here.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createMaterial,
  createStandardMaterial,
  createEmissiveMaterial,
  createRandom,
  hash2D,
  clamp,
} from './utils.js';

// The district's centre, on the sand ring north-east of downtown. Every
// placement below is relative to this point, so the whole district can be
// moved by changing one constant.
export const DISTRICT_CENTER = { x: 640, z: -640 };

// Named spots other systems use (garage, mission chain, crowd, tactics).
export const DISTRICT_SPOTS = {
  yachtClub: { x: 672, z: -672 },
  beachBar: { x: 608, z: -544 },
  lighthouse: { x: 880, z: -880 },
  pierHead: { x: 860, z: -860 },
  promenadeWest: { x: 520, z: -640 },
  promenadeEast: { x: 780, z: -640 },
  parkingLot: { x: 480, z: -608 },
  garage: { x: 544, z: -608 },
  marinaPool: { x: 790, z: -790 },
};

// Condo towers: [x, z, width, depth, height, baseColor, accentColor].
// All sit on block centres (gx * 64 + 32) so they never block a street.
const CONDO_TOWERS = [
  { x: 544, z: -672, w: 30, d: 26, h: 44, base: 0x7a8a9c, accent: 0xe8c56a, name: 'Coral Tower' },
  { x: 800, z: -672, w: 26, d: 30, h: 38, base: 0x8a7a6a, accent: 0x38c8c8, name: 'Palms Residence' },
  { x: 736, z: -800, w: 34, d: 28, h: 52, base: 0x6a7a8c, accent: 0xff6b35, name: 'Solmarina Bay' },
];

// Promenade shops: [x, z, shopName, awningColor, signColor].
const PROMENADE_SHOPS = [
  { x: 608, z: -608, name: 'Tackle & Bait', awning: 0x2a5a8a, sign: 0xffee88 },
  { x: 672, z: -608, name: 'Surf Shack', awning: 0xc83838, sign: 0xffffff },
  { x: 736, z: -608, name: 'Marina Cafe', awning: 0x38a838, sign: 0xffee88 },
];

// Yachts moored in the marina pool: [x, z, hullColor, sailColor, length].
const MOORED_YACHTS = [
  { x: 740, z: -760, hull: 0xf8f8f8, sail: 0xffffff, len: 11 },
  { x: 770, z: -800, hull: 0xe8e8e8, sail: 0xffdd88, len: 9 },
  { x: 800, z: -750, hull: 0xd8e8f8, sail: 0xffffff, len: 12 },
  { x: 820, z: -810, hull: 0xf8f8f8, sail: 0x88ccff, len: 8 },
  { x: 750, z: -830, hull: 0xe8d8c8, sail: 0xffaa88, len: 10 },
  { x: 830, z: -770, hull: 0xf8f8f8, sail: 0xffffff, len: 9 },
];

// Buoys marking the marina channel: [x, z].
const CHANNEL_BUOYS = [
  { x: 700, z: -720 },
  { x: 730, z: -745 },
  { x: 760, z: -770 },
  { x: 860, z: -730 },
  { x: 830, z: -860 },
  { x: 790, z: -890 },
];

// Static parked cars in the marina parking lot: [x, z, rotation, color].
const LOT_CARS = [
  { x: 470, z: -596, rot: 0.1, color: 0xc83838 },
  { x: 476, z: -596, rot: -0.05, color: 0x3878c8 },
  { x: 482, z: -596, rot: 0.05, color: 0xe8c838 },
  { x: 488, z: -596, rot: 0, color: 0x38a838 },
  { x: 470, z: -620, rot: Math.PI + 0.08, color: 0xc838a8 },
  { x: 478, z: -620, rot: Math.PI - 0.04, color: 0xd8d8d8 },
];

// Palm positions along the promenade, hand-placed so none stands in a
// driving lane (the driving lanes run along x = 640 and z = -640).
const PROMENADE_PALMS = [
  { x: 540, z: -624 }, { x: 580, z: -656 }, { x: 620, z: -624 },
  { x: 660, z: -656 }, { x: 700, z: -624 }, { x: 740, z: -656 },
  { x: 770, z: -624 }, { x: 560, z: -656 }, { x: 600, z: -624 },
  { x: 680, z: -624 }, { x: 720, z: -656 }, { x: 760, z: -624 },
];

export class MarinaDistrict {
  constructor(scene, city, seed = CONFIG.SHOTS.SEED) {
    this.scene = scene;
    this.city = city;
    this.random = createRandom(seed + 777);
    this.elapsed = 0;
    this.center = new THREE.Vector3(DISTRICT_CENTER.x, 0, DISTRICT_CENTER.z);

    // Animated bits, updated every frame by update().
    this.yachts = [];
    this.buoys = [];
    this.gulls = [];
    this.beam = null;
    this.beamLight = null;
    this.pool = null;
    this.poolMat = null;
    this.stringLightMat = null;
    this.promenadeLight = null;
    this.condos = [];
    this.shopSigns = [];

    this.build();
  }

  build() {
    this.createPromenade();
    this.createYachtClub();
    this.createCondos();
    this.createShops();
    this.createBeachBar();
    this.createMarinaPool();
    this.createPier();
    this.createYachts();
    this.createBuoys();
    this.createLighthouse();
    this.createParkingLot();
    this.createPalms();
    this.createStringLights();
    this.createGulls();
    this.registerStreetNodes();
  }

  // -- helpers -----------------------------------------------------------

  // A flat box slab (boardwalk, pier plank, lot surface, awning).
  slab(w, h, d, color, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      createStandardMaterial(color),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  // A simple palm: trunk cylinder + 5 frond cones, like the city's own
  // palms but assembled here so the district owns its trees.
  makePalm(height = 7) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.38, height, 6),
      createStandardMaterial(0x6a4a2a),
    );
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 3.2, 5),
        createStandardMaterial(0x1a6a2a),
      );
      frond.position.y = height + f * 0.35;
      frond.rotation.x = -Math.PI / 2 + (f - 2) * 0.28;
      frond.rotation.y = (f * Math.PI * 2) / 5;
      frond.castShadow = true;
      palm.add(frond);
    }
    return palm;
  }

  // Window glass for one tower: a single BufferGeometry of quads with
  // per-vertex lit/dark colors, built face by face. Lit windows glow
  // warm at night; dark ones read as glass by day.
  makeWindowGlass(w, d, h, seed) {
    const positions = [];
    const colors = [];
    const lit = new THREE.Color(CONFIG.PALETTE.WINDOW_LIT);
    const dark = new THREE.Color(CONFIG.PALETTE.WINDOW_DARK);
    const winW = 1.4;
    const winH = 1.8;
    const out = 0.07;
    const floors = Math.max(2, Math.floor((h - 6) / 3.4));
    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, color) => {
      // Two triangles: a-b-c and a-c-d.
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      positions.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
    };
    for (let face = 0; face < 4; face++) {
      const faceW = face % 2 === 0 ? w : d;
      const cols = Math.max(2, Math.floor(faceW / 4));
      const step = faceW / cols;
      for (let floor = 0; floor < floors; floor++) {
        const wy = -h / 2 + 4 + floor * 3.4;
        if (wy + winH / 2 > h / 2 - 1) break;
        for (let col = 0; col < cols; col++) {
          const wx = -faceW / 2 + step * (col + 0.5);
          const on = hash2D(seed + col * 13 + face * 41, seed + floor * 17, 4242) > 0.65;
          const color = on ? lit : dark;
          const u0 = wx - winW / 2;
          const u1 = wx + winW / 2;
          const v0 = wy - winH / 2;
          const v1 = wy + winH / 2;
          if (face === 0) quad(u0, v0, d / 2 + out, u1, v0, d / 2 + out, u1, v1, d / 2 + out, u0, v1, d / 2 + out, color);
          else if (face === 1) quad(u1, v0, -(d / 2 + out), u0, v0, -(d / 2 + out), u0, v1, -(d / 2 + out), u1, v1, -(d / 2 + out), color);
          else if (face === 2) quad(w / 2 + out, v0, u0, w / 2 + out, v0, u1, w / 2 + out, v1, u1, w / 2 + out, v1, u0, color);
          else quad(-(w / 2 + out), v0, u1, -(w / 2 + out), v0, u0, -(w / 2 + out), v1, u0, -(w / 2 + out), v1, u1, color);
        }
      }
    }
    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
  }

  // -- groundwork ----------------------------------------------------------

  createPromenade() {
    // Boardwalk strips flanking the z = -640 street, west to east.
    this.slab(280, 0.25, 10, 0x8a6a4a, 650, 0.12, -626);
    this.slab(280, 0.25, 10, 0x8a6a4a, 650, 0.12, -654);
    // Timber edging so the boardwalk reads against the sand.
    this.slab(280, 0.5, 0.6, 0x5a3a1a, 650, 0.25, -620.5);
    this.slab(280, 0.5, 0.6, 0x5a3a1a, 650, 0.25, -659.5);
    // Benches facing the marina, every 35 units.
    for (let x = 540; x <= 760; x += 35) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.25, 1.2),
        createStandardMaterial(0x7a5a3a),
      );
      seat.position.y = 0.7;
      seat.castShadow = true;
      bench.add(seat);
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1, 0.2),
        createStandardMaterial(0x7a5a3a),
      );
      back.position.set(0, 1.2, -0.55);
      back.castShadow = true;
      bench.add(back);
      for (const lx of [-1.8, 1.8]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.7, 1),
          createStandardMaterial(0x3a3a3a),
        );
        leg.position.set(lx, 0.35, 0);
        bench.add(leg);
      }
      bench.position.set(x, 0.25, -650);
      bench.rotation.y = Math.PI; // face the water (south-east side)
      this.scene.add(bench);
    }
    // A low promenade lamp every 40 units, alternating sides.
    for (let i = 0; i < 7; i++) {
      const x = 530 + i * 40;
      const z = i % 2 === 0 ? -622 : -658;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, 5.5, 6),
        createStandardMaterial(0x2a2a2a),
      );
      pole.position.set(x, 2.75, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.75 }),
      );
      lamp.position.set(x, 5.6, z);
      this.scene.add(lamp);
    }
    // Warm light over the middle of the promenade, dimmed by day.
    this.promenadeLight = new THREE.PointLight(0xffdd88, 0, 90, 1.2);
    this.promenadeLight.position.set(650, 12, -640);
    this.scene.add(this.promenadeLight);
  }

  createYachtClub() {
    const s = DISTRICT_SPOTS.yachtClub;
    const w = 30;
    const d = 24;
    const h = 26;
    // Main hall with a nautical blue base and a white upper deck.
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.6, d),
      createStandardMaterial(0x2a4a6a),
    );
    hall.position.set(s.x, (h * 0.6) / 2, s.z);
    hall.castShadow = true;
    hall.receiveShadow = true;
    hall.userData = { type: 'building', height: h * 0.6, bw: w, bd: d, district: true };
    this.scene.add(hall);
    // Register with the city so cars and pedestrians collide with it.
    this.city.buildings.push(hall);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, h * 0.4, d * 0.9),
      createStandardMaterial(0xe8e0d0),
    );
    deck.position.set(s.x, h * 0.6 + (h * 0.4) / 2, s.z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.scene.add(deck);
    // Pitched roof.
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.72, 5, 4),
      createStandardMaterial(0xc83838),
    );
    roof.position.set(s.x, h + 2.5, s.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);
    // Glass front facing the promenade (south face).
    const glass = this.makeWindowGlass(w, d, h * 0.6, 11);
    if (glass) {
      glass.position.set(s.x, (h * 0.6) / 2, s.z);
      this.scene.add(glass);
    }
    // "YACHT CLUB" sign board over the door.
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.4, 0.4),
      createEmissiveMaterial(0xffee88, 0.6),
    );
    sign.position.set(s.x, h * 0.6 + 1, s.z + d / 2 + 0.3);
    this.scene.add(sign);
    this.shopSigns.push(sign);
    // Flag pole with a waving pennant (animated in update()).
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 12, 6),
      createStandardMaterial(0x8a8a8a),
    );
    pole.position.set(s.x + w / 2 - 2, h + 6, s.z);
    this.scene.add(pole);
    const pennant = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffdd33, side: THREE.DoubleSide }),
    );
    pennant.position.set(s.x + w / 2 + 0.2, h + 10.5, s.z);
    this.scene.add(pennant);
    this.pennant = pennant;
    // Terrace with two umbrella tables in front of the club.
    for (const [ox, oz] of [[-8, 16], [8, 16]]) {
      const table = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 0.15, 10),
        createStandardMaterial(0xd8d0c0),
      );
      table.position.set(s.x + ox, 1.1, s.z + oz);
      table.castShadow = true;
      this.scene.add(table);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6),
        createStandardMaterial(0x5a5a5a),
      );
      stem.position.set(s.x + ox, 0.55, s.z + oz);
      this.scene.add(stem);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 0.7, 8),
        createStandardMaterial(ox < 0 ? 0xc83838 : 0x3878c8),
      );
      shade.position.set(s.x + ox, 2.6, s.z + oz);
      shade.castShadow = true;
      this.scene.add(shade);
    }
  }

  createCondos() {
    // Three beachfront towers, each with its own window glass, a rooftop
    // plant box and a lit lobby canopy so they read at night too.
    for (let i = 0; i < CONDO_TOWERS.length; i++) {
      const t = CONDO_TOWERS[i];
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(t.w, t.h, t.d),
        createStandardMaterial(t.base),
      );
      body.position.set(t.x, t.h / 2, t.z);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = { type: 'building', height: t.h, bw: t.w, bd: t.d, district: true };
      this.scene.add(body);
      // Register with the city so cars and pedestrians collide with it.
      this.city.buildings.push(body);
      this.condos.push(body);
      // Accent band near the top.
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 1.04, 1.6, t.d * 1.04),
        createStandardMaterial(t.accent),
      );
      band.position.set(t.x, t.h - 3, t.z);
      band.castShadow = true;
      this.scene.add(band);
      // Rooftop plant box.
      const plant = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.5, 1.2, t.d * 0.4),
        createStandardMaterial(0x2a4a2a),
      );
      plant.position.set(t.x, t.h + 0.6, t.z);
      plant.castShadow = true;
      this.scene.add(plant);
      // Window glass.
      const glass = this.makeWindowGlass(t.w, t.d, t.h, 100 + i * 37);
      if (glass) {
        glass.position.set(t.x, t.h / 2, t.z);
        this.scene.add(glass);
      }
      // Lobby canopy with a warm light strip.
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.5, 5),
        createStandardMaterial(0x3a3a3a),
      );
      canopy.position.set(t.x, 3.4, t.z + t.d / 2 + 2);
      canopy.castShadow = true;
      this.scene.add(canopy);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.15, 0.3),
        createEmissiveMaterial(0xffee88, 0.9),
      );
      strip.position.set(t.x, 3.1, t.z + t.d / 2 + 4.4);
      this.scene.add(strip);
      // Name plate on the south face.
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.8, 0.3),
        createEmissiveMaterial(t.accent, 0.5),
      );
      plate.position.set(t.x, 6.5, t.z + t.d / 2 + 0.2);
      this.scene.add(plate);
    }
  }

  createShops() {
    // Three small promenade shops: hut, striped awning, glowing sign.
    for (const shop of PROMENADE_SHOPS) {
      const hut = new THREE.Mesh(
        new THREE.BoxGeometry(12, 5, 10),
        createStandardMaterial(0xe8dcc8),
      );
      hut.position.set(shop.x, 2.5, shop.z);
      hut.castShadow = true;
      hut.receiveShadow = true;
      hut.userData = { type: 'building', height: 5, bw: 12, bd: 10, district: true };
      this.scene.add(hut);
      // Register with the city so cars and pedestrians collide with it.
      this.city.buildings.push(hut);
      // Awning: a slanted slab over the south face.
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(12.5, 0.25, 4),
        createStandardMaterial(shop.awning),
      );
      awning.position.set(shop.x, 4.6, shop.z + 6);
      awning.rotation.x = 0.35;
      awning.castShadow = true;
      this.scene.add(awning);
      // Awning stripes: thin alternating slabs.
      for (let s = 0; s < 6; s++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.3, 4.1),
          createStandardMaterial(s % 2 === 0 ? 0xffffff : shop.awning),
        );
        stripe.position.set(shop.x - 5.2 + s * 2.08, 4.6, shop.z + 6);
        stripe.rotation.x = 0.35;
        this.scene.add(stripe);
      }
      // Glowing sign board.
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1.6, 0.3),
        createEmissiveMaterial(shop.sign, 0.7),
      );
      sign.position.set(shop.x, 5.8, shop.z + 5.2);
      this.scene.add(sign);
      this.shopSigns.push(sign);
      // Counter + crates in front, so the shop is more than a box.
      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(8, 1.1, 1.6),
        createStandardMaterial(0x6a4a2a),
      );
      counter.position.set(shop.x, 0.55, shop.z + 7.5);
      counter.castShadow = true;
      this.scene.add(counter);
      for (let c = 0; c < 3; c++) {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.4, 1.4),
          createStandardMaterial(0x8a6a3a),
        );
        crate.position.set(shop.x - 5 + c * 1.8, 0.7, shop.z + 8.6);
        crate.rotation.y = c * 0.4;
        crate.castShadow = true;
        this.scene.add(crate);
      }
    }
  }

  createBeachBar() {
    // Open-air beach bar on the sand: four posts, a thatch roof, a
    // counter, stools and a row of bottles that catch the light.
    const s = DISTRICT_SPOTS.beachBar;
    const posts = [];
    for (const [ox, oz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 4.5, 6),
        createStandardMaterial(0x6a4a2a),
      );
      post.position.set(s.x + ox, 2.25, s.z + oz);
      post.castShadow = true;
      this.scene.add(post);
      posts.push(post);
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(7.5, 2.4, 4),
      createStandardMaterial(0xc8a848),
    );
    roof.position.set(s.x, 5.6, s.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(9, 1.2, 2),
      createStandardMaterial(0x4a6a8a),
    );
    counter.position.set(s.x, 0.6, s.z);
    counter.castShadow = true;
    this.scene.add(counter);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.2, 2.6),
      createStandardMaterial(0x2a2a2a),
    );
    top.position.set(s.x, 1.3, s.z);
    this.scene.add(top);
    // Stools.
    for (let i = -2; i <= 2; i++) {
      const stool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.15, 8),
        createStandardMaterial(0xc83838),
      );
      stool.position.set(s.x + i * 2, 0.9, s.z + 2.6);
      this.scene.add(stool);
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6),
        createStandardMaterial(0x3a3a3a),
      );
      leg.position.set(s.x + i * 2, 0.45, s.z + 2.6);
      this.scene.add(leg);
    }
    // Bottles on the counter: tiny emissive cylinders in a row.
    const bottleColors = [0x38a838, 0xc83838, 0xe8c838, 0x38c8c8, 0xc838a8];
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6),
        createEmissiveMaterial(bottleColors[i], 0.4),
      );
      bottle.position.set(s.x - 3 + i * 1.5, 1.75, s.z - 0.4);
      this.scene.add(bottle);
    }
    // String of bulbs over the bar.
    for (let i = 0; i < 7; i++) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffee88 }),
      );
      bulb.position.set(s.x - 4.5 + i * 1.5, 4.4 - Math.abs(i - 3) * 0.18, s.z + 2.5);
      this.scene.add(bulb);
    }
  }

  createMarinaPool() {
    // The marina basin: a big translucent water plane over the sand, with
    // a darker deep-water centre and a pale shallow rim. The city ground
    // is solid here, so the pool is decorative — but yachts, buoys and the
    // pier all sit on it, and it reads as water from any angle.
    const s = DISTRICT_SPOTS.marinaPool;
    this.poolMat = new THREE.MeshStandardMaterial({
      color: 0x1a6a9a,
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.82,
    });
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(230, 170),
      this.poolMat,
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.rotation.z = Math.PI / 4;
    this.pool.position.set(s.x, 0.18, s.z);
    this.pool.receiveShadow = true;
    this.scene.add(this.pool);
    // Shallow rim: a slightly larger, paler plane just under the pool.
    const rim = new THREE.Mesh(
      new THREE.PlaneGeometry(250, 190),
      new THREE.MeshStandardMaterial({
        color: 0x3a8ab8, roughness: 0.3, metalness: 0.3,
        transparent: true, opacity: 0.5,
      }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.rotation.z = Math.PI / 4;
    rim.position.set(s.x, 0.12, s.z);
    this.scene.add(rim);
    // Wooden edge boards around the pool's south-west side (the quay).
    this.slab(120, 0.4, 3, 0x6a4a2a, 700, 0.3, -700, Math.PI / 4);
    this.slab(90, 0.4, 3, 0x6a4a2a, 760, 0.3, -690, Math.PI / 4);
  }

  createPier() {
    // A wooden pier running diagonally from the promenade (700, -700)
    // out to the lighthouse. Planks are individual slabs so the walkway
    // has visible gaps; posts and a rope rail line both sides.
    const from = { x: 700, z: -700 };
    const to = { x: 858, z: -858 };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const steps = Math.floor(len / 4);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.25, 3.4),
        createStandardMaterial(i % 2 === 0 ? 0x8a6a4a : 0x7a5a3a),
      );
      plank.position.set(x, 0.5, z);
      plank.rotation.y = angle;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.scene.add(plank);
    }
    // Support posts under the pier, every 5 planks.
    for (let i = 0; i < steps; i += 5) {
      const t = (i + 0.5) / steps;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      for (const side of [-2.2, 2.2]) {
        const px = x + Math.cos(angle) * side;
        const pz = z - Math.sin(angle) * side;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 3, 6),
          createStandardMaterial(0x4a3a2a),
        );
        post.position.set(px, -0.8, pz);
        this.scene.add(post);
      }
    }
    // Rope rails: small posts + a sagging line of thin cylinders.
    const railMat = createStandardMaterial(0xd8c8a8);
    for (const side of [-2.4, 2.4]) {
      let prev = null;
      for (let i = 0; i <= steps; i += 4) {
        const t = i / steps;
        const x = from.x + dx * t + Math.cos(angle) * side;
        const z = from.z + dz * t - Math.sin(angle) * side;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.11, 1.4, 6),
          createStandardMaterial(0x5a4a3a),
        );
        post.position.set(x, 1.2, z);
        this.scene.add(post);
        if (prev) {
          const segLen = Math.hypot(x - prev.x, z - prev.z);
          const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, segLen, 5),
            railMat,
          );
          rail.position.set((x + prev.x) / 2, 1.85, (z + prev.z) / 2);
          rail.rotation.z = Math.PI / 2;
          rail.rotation.y = -angle;
          this.scene.add(rail);
        }
        prev = { x, z };
      }
    }
    // A "PIER 9" sign at the pier head.
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.5, 0.3),
      createEmissiveMaterial(0xffee88, 0.6),
    );
    sign.position.set(to.x, 3.2, to.z);
    sign.rotation.y = angle;
    this.scene.add(sign);
    this.shopSigns.push(sign);
  }

  createYachts() {
    // Moored yachts: hull, cabin, mast and a triangular sail. Each yacht
    // keeps a bob phase so update() can rock it gently on the pool.
    for (const spec of MOORED_YACHTS) {
      const yacht = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.4, spec.len),
        createStandardMaterial(spec.hull),
      );
      hull.position.y = 0.7;
      hull.castShadow = true;
      yacht.add(hull);
      // Bow: a wedge made from a rotated box so the hull tapers forward.
      const bow = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 2.4, 4),
        createStandardMaterial(spec.hull),
      );
      bow.position.set(0, 0.7, spec.len / 2 + 1);
      bow.rotation.y = Math.PI / 4;
      bow.rotation.x = Math.PI / 2;
      bow.scale.set(1, 1, 0.6);
      bow.castShadow = true;
      yacht.add(bow);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, spec.len * 0.4),
        createStandardMaterial(0x2a3a4a),
      );
      cabin.position.set(0, 1.8, -spec.len * 0.08);
      cabin.castShadow = true;
      yacht.add(cabin);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 7, 6),
        createStandardMaterial(0x8a8a8a),
      );
      mast.position.set(0, 5, 0);
      mast.castShadow = true;
      yacht.add(mast);
      // Sail: a flat triangle (custom geometry, two faces).
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 1.8, 0.3, 0, 8.2, 0.3, 0, 1.8, -spec.len * 0.32,
        0, 1.8, 0.3, 0, 1.8, -spec.len * 0.32, 0, 8.2, 0.3,
      ], 3));
      sailGeo.computeVertexNormals();
      const sail = new THREE.Mesh(
        sailGeo,
        new THREE.MeshStandardMaterial({ color: spec.sail, side: THREE.DoubleSide, roughness: 0.8 }),
      );
      sail.castShadow = true;
      yacht.add(sail);
      yacht.position.set(spec.x, 0.2, spec.z);
      yacht.rotation.y = this.random() * Math.PI * 2;
      this.scene.add(yacht);
      this.yachts.push({ group: yacht, phase: this.random() * Math.PI * 2, baseY: 0.2 });
    }
  }

  createBuoys() {
    // Channel buoys: red-and-white striped spheres that bob on the pool.
    for (const spec of CHANNEL_BUOYS) {
      const buoy = new THREE.Group();
      const bottom = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 10, 8),
        createStandardMaterial(0xc83838),
      );
      bottom.position.y = 0.3;
      buoy.add(bottom);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.2, 8),
        createStandardMaterial(0xf8f8f8),
      );
      top.position.y = 1.3;
      buoy.add(top);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffee88 }),
      );
      tip.position.y = 2;
      buoy.add(tip);
      buoy.position.set(spec.x, 0.2, spec.z);
      this.scene.add(buoy);
      this.buoys.push({ group: buoy, phase: this.random() * Math.PI * 2, baseY: 0.2 });
    }
  }

  createLighthouse() {
    // The district landmark: a banded tower on the sand at the pier head,
    // with a glass lamp room and a rotating beam (cone + point light).
    const s = DISTRICT_SPOTS.lighthouse;
    const tower = new THREE.Group();
    const bands = [0xf8f8f8, 0xc83838, 0xf8f8f8, 0xc83838, 0xf8f8f8];
    const bandH = 34 / bands.length;
    for (let i = 0; i < bands.length; i++) {
      const rBottom = 5.5 - i * 0.45;
      const rTop = 5.5 - (i + 1) * 0.45;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBottom, bandH, 12),
        createStandardMaterial(bands[i]),
      );
      band.position.y = bandH / 2 + i * bandH;
      band.castShadow = true;
      tower.add(band);
    }
    // Lamp room: glass box on a dark base, with a domed cap.
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.4, 1.2, 10),
      createStandardMaterial(0x1a1a1a),
    );
    lampBase.position.y = 34.6;
    tower.add(lampBase);
    const lampGlass = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 3.4, 4.4),
      new THREE.MeshStandardMaterial({
        color: 0xffee88, emissive: 0xffdd55, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.85,
      }),
    );
    lampGlass.position.y = 36.8;
    tower.add(lampGlass);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 2.2, 10),
      createStandardMaterial(0x1a1a1a),
    );
    cap.position.y = 39.6;
    tower.add(cap);
    tower.position.set(s.x, 0, s.z);
    this.scene.add(tower);
    // The beam: a long translucent cone, horizontal, pivoting around the
    // lamp room. It is a child of a pivot group so update() can spin it.
    const pivot = new THREE.Group();
    pivot.position.set(s.x, 36.8, s.z);
    const beamGeo = new THREE.ConeGeometry(7, 70, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffee88, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.rotation.z = Math.PI / 2; // point along +X
    this.beam.position.x = 35;
    pivot.add(this.beam);
    this.scene.add(pivot);
    this.beamPivot = pivot;
    this.beamLight = new THREE.PointLight(0xffee88, 0, 120, 1.5);
    this.beamLight.position.set(s.x, 37, s.z);
    this.scene.add(this.beamLight);
    // A small keeper's cottage beside the tower.
    const cottage = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 8),
      createStandardMaterial(0xe8dcc8),
    );
    cottage.position.set(s.x - 14, 2.5, s.z + 10);
    cottage.castShadow = true;
    this.scene.add(cottage);
    const cottageRoof = new THREE.Mesh(
      new THREE.ConeGeometry(7, 3, 4),
      createStandardMaterial(0x8a3a3a),
    );
    cottageRoof.position.set(s.x - 14, 6.5, s.z + 10);
    cottageRoof.rotation.y = Math.PI / 4;
    this.scene.add(cottageRoof);
  }

  createParkingLot() {
    // Asphalt lot beside the garage with painted bay lines and six
    // static cars (plain box cars: scenery, not drivable vehicles).
    const s = DISTRICT_SPOTS.parkingLot;
    this.slab(40, 0.2, 30, 0x3d3d44, s.x, 0.1, s.z);
    for (let i = 0; i < 6; i++) {
      const x = s.x - 16 + i * 6.4;
      // Bay divider lines.
      this.slab(0.25, 0.22, 8, 0xffffff, x + 3.2, 0.22, s.z - 4);
      this.slab(0.25, 0.22, 8, 0xffffff, x + 3.2, 0.22, s.z + 12);
    }
    for (const spec of LOT_CARS) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.75, 4.4),
        createStandardMaterial(spec.color),
      );
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.6, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.8, roughness: 0.1 }),
      );
      cabin.position.set(0, 1.2, 0.2);
      cabin.castShadow = true;
      car.add(cabin);
      for (const [wx, wz] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10),
          createStandardMaterial(0x1a1a1a),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.35, wz);
        car.add(wheel);
      }
      car.position.set(spec.x, 0.2, spec.z);
      car.rotation.y = spec.rot;
      this.scene.add(car);
    }
    // A "PARKING" sign on a pole at the lot entrance.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 4, 6),
      createStandardMaterial(0x3a3a3a),
    );
    pole.position.set(s.x + 18, 2, s.z + 14);
    this.scene.add(pole);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, 0.2),
      createEmissiveMaterial(0x2288cc, 0.6),
    );
    sign.position.set(s.x + 18, 4.4, s.z + 14);
    this.scene.add(sign);
    this.shopSigns.push(sign);
  }

  createPalms() {
    for (const spec of PROMENADE_PALMS) {
      const palm = this.makePalm(6 + this.random() * 2);
      palm.position.set(spec.x, 0, spec.z);
      palm.rotation.y = this.random() * Math.PI * 2;
      this.scene.add(palm);
    }
  }

  createStringLights() {
    // Festoon lights strung across the promenade between poles: a shared
    // bulb material so update() can brighten them all at dusk in one go.
    this.stringLightMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.5 });
    const poleMat = createStandardMaterial(0x3a3a3a);
    for (let span = 0; span < 6; span++) {
      const x0 = 540 + span * 40;
      const x1 = x0 + 40;
      for (const x of [x0, x1]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 6, 6),
          poleMat,
        );
        pole.position.set(x, 3, -640);
        this.scene.add(pole);
      }
      for (let b = 0; b < 8; b++) {
        const t = (b + 0.5) / 8;
        const sag = Math.sin(t * Math.PI) * 1.2;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 6, 6),
          this.stringLightMat,
        );
        bulb.position.set(x0 + 40 * t, 6 - sag, -640);
        this.scene.add(bulb);
      }
    }
  }

  createGulls() {
    // Five seagulls circling the marina: a white body cone and two flat
    // wings that flap in update(). They are scenery, not colliders.
    for (let i = 0; i < 5; i++) {
      const gull = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.6, 6),
        createStandardMaterial(0xf8f8f8),
      );
      body.rotation.x = Math.PI / 2;
      gull.add(body);
      const wingMat = createStandardMaterial(0xe8e8e8);
      const left = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), wingMat);
      left.position.x = -1.2;
      left.rotation.x = -Math.PI / 2;
      gull.add(left);
      const right = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), wingMat);
      right.position.x = 1.2;
      right.rotation.x = -Math.PI / 2;
      gull.add(right);
      gull.userData.left = left;
      gull.userData.right = right;
      this.scene.add(gull);
      this.gulls.push({
        group: gull,
        radius: 40 + i * 12,
        height: 26 + i * 4,
        speed: 0.12 + i * 0.02,
        angle: (i / 5) * Math.PI * 2,
        flap: this.random() * Math.PI * 2,
      });
    }
  }

  // Let the base traffic and pedestrian systems route through the
  // district: new street nodes along the promenade and pier roads, and
  // sidewalk nodes along the boardwalk. The traffic spawner pre-filters
  // nodes to the ring around the player, so these only matter when the
  // player is actually in the district.
  registerStreetNodes() {
    for (let z = -780; z <= -500; z += 20) {
      this.city.trafficNodes.push({ x: 640, z, type: 'street', dir: 'z' });
    }
    for (let x = 520; x <= 780; x += 20) {
      this.city.trafficNodes.push({ x, z: -640, type: 'street', dir: 'x' });
    }
    for (let x = 520; x <= 780; x += 15) {
      this.city.pedestrianNodes.push({ x, z: -626, type: 'sidewalk' });
      this.city.pedestrianNodes.push({ x, z: -654, type: 'sidewalk' });
    }
    for (let z = -780; z <= -500; z += 15) {
      this.city.pedestrianNodes.push({ x: 626, z, type: 'sidewalk' });
      this.city.pedestrianNodes.push({ x: 654, z, type: 'sidewalk' });
    }
    // Pier walkers: a few nodes along the pier diagonal.
    for (let t = 0; t <= 1; t += 0.25) {
      this.city.pedestrianNodes.push({
        x: 700 + 158 * t,
        z: -700 - 158 * t,
        type: 'sidewalk',
      });
    }
  }

  // -- runtime -------------------------------------------------------------

  // A spawn point for the player in the district (used by the ?district
  // URL shortcut and by the mission chain's escape objective).
  getSpawnPosition() {
    return new THREE.Vector3(650, 1, -600);
  }

  getRandomPromenadeSpot() {
    return new THREE.Vector3(
      530 + this.random() * 230,
      0,
      -640 + (this.random() < 0.5 ? -14 : 14),
    );
  }

  isInside(x, z) {
    const dx = x - DISTRICT_CENTER.x;
    const dz = z - DISTRICT_CENTER.z;
    return dx * dx + dz * dz < 220 * 220;
  }

  update(delta, timeOfDay) {
    this.elapsed += delta;
    const t = this.elapsed;
    const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
    const night = clamp((0.35 - dayFactor) / 0.35, 0, 1);

    // Yachts rock gently; buoys bob faster and smaller.
    for (const y of this.yachts) {
      y.group.position.y = y.baseY + Math.sin(t * 0.8 + y.phase) * 0.12;
      y.group.rotation.z = Math.sin(t * 0.6 + y.phase) * 0.025;
      y.group.rotation.x = Math.cos(t * 0.5 + y.phase) * 0.02;
    }
    for (const b of this.buoys) {
      b.group.position.y = b.baseY + Math.sin(t * 1.6 + b.phase) * 0.18;
      b.group.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.06;
    }
    // Marina water shimmers: slow opacity breathing.
    if (this.poolMat) {
      this.poolMat.opacity = 0.78 + Math.sin(t * 0.4) * 0.05;
    }
    // Lighthouse beam sweeps; its lamp brightens after dark.
    if (this.beamPivot) {
      this.beamPivot.rotation.y = t * 0.45;
    }
    if (this.beam) {
      this.beam.material.opacity = 0.08 + night * 0.16;
    }
    if (this.beamLight) {
      this.beamLight.intensity = night * 260 + Math.sin(t * 6) * night * 40;
    }
    // Pennant waves.
    if (this.pennant) {
      this.pennant.rotation.y = Math.sin(t * 2.2) * 0.35;
    }
    // Promenade light and festoon bulbs come on at dusk.
    if (this.promenadeLight) {
      this.promenadeLight.intensity = night * 160;
    }
    if (this.stringLightMat) {
      this.stringLightMat.opacity = 0.25 + night * 0.75;
    }
    // Shop signs glow a little harder at night.
    for (const sign of this.shopSigns) {
      if (sign.material && sign.material.emissiveIntensity !== undefined) {
        sign.material.emissiveIntensity = 0.5 + night * 0.7;
      }
    }
    // Seagulls circle the marina and flap.
    for (const g of this.gulls) {
      g.angle += g.speed * delta;
      g.flap += delta * 6;
      const x = DISTRICT_CENTER.x + 60 + Math.cos(g.angle) * g.radius;
      const z = DISTRICT_CENTER.z - 60 + Math.sin(g.angle) * g.radius;
      g.group.position.set(x, g.height + Math.sin(t * 0.9 + g.flap) * 1.5, z);
      g.group.rotation.y = -g.angle;
      const flap = Math.sin(g.flap) * 0.5;
      g.group.userData.left.rotation.z = flap;
      g.group.userData.right.rotation.z = -flap;
    }
  }
}
