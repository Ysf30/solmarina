// Solmarina — Marina District (round 5, recording 16).
//
// A whole new neighbourhood on the south-east shore: the yacht club,
// three condo towers, a promenade of shops, a beach bar, a diagonal pier
// out to the lighthouse, a parking lot and a marina pool. Everything here
// is built fresh in this session — new geometry, new layout, new code —
// and it plugs into the city the same way the base city does: its solid
// buildings push into city.buildings (so cars, pedestrians and the camera
// treat them as real obstacles), and its walkways register traffic and
// pedestrian nodes so the street life reaches the marina.
//
// The district is centred on (640, -640), a 200 x 200 block of sand on
// the shore ring. Its heart is the promenade crossing at (650, -600),
// where the ?district=1 shortcut drops the player. Nothing solid stands
// within 20 units of the heart, so the player always lands on open ground.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createMaterial, createStandardMaterial, createEmissiveMaterial,
  clamp, hash2D, createRandom,
} from './utils.js';

// District-local layout. Every coordinate below is a world coordinate;
// the district never assumes it is at the origin, which keeps the
// numbers honest when the city is re-seeded or the block is moved.
const DISTRICT = {
  centreX: 640,
  centreZ: -640,
  half: 100, // half-size of the district square
  heartX: 650, // promenade crossing, the player spawn
  heartZ: -600,
  clubX: 672, // yacht club hall centre
  clubZ: -672,
  clubW: 28, // hall width (x)
  clubD: 24, // hall depth (z)
  terraceX: 672, // terrace objective point, north of the hall
  terraceZ: -654,
  pierHeadX: 858, // far end of the diagonal pier
  pierHeadZ: -858,
  beachBarX: 608, // beach bar, north edge of the district
  beachBarZ: -544,
  garageDoorX: 544, // Kade's Garage door (the garage itself lives in garage.js)
  garageDoorZ: -598,
  lightX: 880, // lighthouse, past the pier head
  lightZ: -880,
  yachtX: 800, // target yacht for the final marina job
  yachtZ: -750,
};

// Condo towers: position, footprint, height. The three heights (44, 38,
// 52) give the skyline its stepped look from the promenade.
const TOWERS = [
  { x: 716, z: -716, w: 22, d: 22, h: 44, tint: 0x8a90a8, name: 'Coral Tower' },
  { x: 600, z: -700, w: 20, d: 20, h: 38, tint: 0x9a8a76, name: 'Palms Tower' },
  { x: 700, z: -600, w: 24, d: 24, h: 52, tint: 0x7a8aa0, name: 'Harbour Tower' },
];

// Promenade shops: position, size, awning stripe colours, sign text.
const SHOPS = [
  { x: 620, z: -640, w: 12, d: 10, h: 7, stripe: [0xc83838, 0xf8f0e0], sign: 'TACKLE & BAIT' },
  { x: 640, z: -620, w: 12, d: 10, h: 7, stripe: [0x3878c8, 0xf8f0e0], sign: 'SURF SHACK' },
  { x: 660, z: -660, w: 12, d: 10, h: 7, stripe: [0xe8c838, 0x28303a], sign: 'FISH & CHIPS' },
];

// Yachts moored along the pier. Each one bobs and rocks on its own
// phase, so the marina never looks frozen.
const YACHT_SPOTS = [
  { x: 740, z: -740, len: 14, hull: 0xe8e8e8, sail: 0xc83838 },
  { x: 765, z: -765, len: 11, hull: 0x3878c8, sail: 0xf8f0e0 },
  { x: 790, z: -790, len: 16, hull: 0x2a2a3a, sail: 0xe8c838 },
  { x: 815, z: -815, len: 12, hull: 0xe8dcc8, sail: 0x38a838 },
  { x: 836, z: -836, len: 15, hull: 0x8a2a3a, sail: 0xf8f0e0 },
  { x: 800, z: -750, len: 18, hull: 0xd8b838, sail: 0x1a1a2a }, // the target yacht
];

// Buoys marking the channel into the marina.
const BUOY_SPOTS = [
  { x: 730, z: -700 }, { x: 760, z: -730 }, { x: 790, z: -760 },
  { x: 820, z: -790 }, { x: 850, z: -820 }, { x: 880, z: -850 },
];

// Palms planted along the promenade and the beach edge.
const PALM_SPOTS = [
  { x: 600, z: -620 }, { x: 616, z: -636 }, { x: 632, z: -652 },
  { x: 648, z: -668 }, { x: 664, z: -684 }, { x: 680, z: -700 },
  { x: 696, z: -636 }, { x: 712, z: -652 }, { x: 580, z: -660 },
  { x: 596, z: -676 }, { x: 724, z: -684 }, { x: 740, z: -700 },
];

export class MarinaDistrict {
  constructor(scene, city, seed = CONFIG.SHOTS.SEED) {
    this.scene = scene;
    this.city = city;
    this.seed = seed;
    this.random = createRandom(seed + 9101);

    // Everything the probes and the other systems read.
    this.condos = [];
    this.yachts = [];
    this.buoys = [];
    this.gulls = [];
    this.shops = [];
    this.palms = [];
    this.lamps = [];
    this.benches = [];
    this.festoonBulbs = [];

    // Animation clocks.
    this.elapsed = 0;
    this.beamAngle = 0;

    // Build the whole neighbourhood, in the order a visitor walks it:
    // ground first, then the club, the towers, the shops, the beach bar,
    // the pool, the pier, the boats, the lighthouse, the lot, the palms,
    // the lights and the birds. Nodes last, once the geometry exists.
    this.buildGround();
    this.buildPromenade();
    this.buildYachtClub();
    this.buildCondos();
    this.buildShops();
    this.buildBeachBar();
    this.buildMarinaPool();
    this.buildPier();
    this.buildYachts();
    this.buildBuoys();
    this.buildLighthouse();
    this.buildParkingLot();
    this.buildPalms();
    this.buildFestoonLights();
    this.buildGulls();
    this.registerNodes();
  }

  // -- ground ----------------------------------------------------------------

  buildGround() {
    // A pale sand apron over the district square, slightly above the
    // city ground so the marina reads as its own patch of beach. The
    // promenade slab sits on top of it.
    const apronGeo = new THREE.PlaneGeometry(DISTRICT.half * 2, DISTRICT.half * 2);
    const apronMat = createStandardMaterial(0xe8d5b7);
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.set(DISTRICT.centreX, 0.06, DISTRICT.centreZ);
    apron.receiveShadow = true;
    this.scene.add(apron);
    this.apron = apron;

    // A darker boardwalk strip along the water edge, running north-east
    // to south-west, so the promenade has a direction to it.
    const boardGeo = new THREE.PlaneGeometry(150, 14);
    const boardMat = createStandardMaterial(0x8a6a4a);
    boardGeo.rotateX(-Math.PI / 2);
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(660, 0.12, -660);
    board.rotation.y = -Math.PI / 4;
    board.receiveShadow = true;
    this.scene.add(board);
    this.boardwalk = board;
  }

  buildPromenade() {
    // Benches facing the water, lamps between them, and a low sea wall
    // along the diagonal water edge. The benches are also where the
    // first hidden package hides (see collectibles.js).
    const benchMat = createStandardMaterial(0x6a4a2a);
    const benchBackMat = createStandardMaterial(0x5a3a22);
    const lampPoleMat = createStandardMaterial(0x2a2a2e);
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7 });

    const benchSpots = [
      { x: 668, z: -618, rot: -Math.PI / 4 },
      { x: 684, z: -634, rot: -Math.PI / 4 },
      { x: 636, z: -586, rot: Math.PI * 0.75 },
      { x: 620, z: -602, rot: Math.PI * 0.75 },
      { x: 700, z: -650, rot: -Math.PI / 4 },
    ];
    for (const spot of benchSpots) {
      const bench = new THREE.Group();
      const seatGeo = new THREE.BoxGeometry(3, 0.25, 1);
      const seat = new THREE.Mesh(seatGeo, benchMat);
      seat.position.y = 0.55;
      seat.castShadow = true;
      bench.add(seat);
      const backGeo = new THREE.BoxGeometry(3, 1, 0.2);
      const back = new THREE.Mesh(backGeo, benchBackMat);
      back.position.set(0, 1.05, -0.45);
      back.castShadow = true;
      bench.add(back);
      for (const side of [-1, 1]) {
        const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.9);
        const leg = new THREE.Mesh(legGeo, benchBackMat);
        leg.position.set(side * 1.3, 0.28, 0);
        bench.add(leg);
      }
      bench.position.set(spot.x, 0.12, spot.z);
      bench.rotation.y = spot.rot;
      this.scene.add(bench);
      this.benches.push(bench);
    }

    // Lamps: a pole, a cross arm and a warm globe. The globes are the
    // meshes the night-light pass brightens after dusk.
    const lampSpots = [
      { x: 660, z: -610 }, { x: 676, z: -626 }, { x: 644, z: -594 },
      { x: 628, z: -610 }, { x: 692, z: -642 }, { x: 708, z: -658 },
    ];
    for (const spot of lampSpots) {
      const lamp = new THREE.Group();
      const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 6);
      const pole = new THREE.Mesh(poleGeo, lampPoleMat);
      pole.position.y = 3;
      pole.castShadow = true;
      lamp.add(pole);
      const armGeo = new THREE.BoxGeometry(1.6, 0.12, 0.12);
      const arm = new THREE.Mesh(armGeo, lampPoleMat);
      arm.position.set(0.7, 5.8, 0);
      lamp.add(arm);
      const globeGeo = new THREE.SphereGeometry(0.42, 10, 8);
      const globe = new THREE.Mesh(globeGeo, lampGlowMat.clone());
      globe.position.set(1.4, 5.6, 0);
      lamp.add(globe);
      lamp.userData.glow = globe;
      lamp.position.set(spot.x, 0.12, spot.z);
      this.scene.add(lamp);
      this.lamps.push(lamp);
    }

    // Low sea wall: a long pale block along the diagonal edge, with a
    // darker cap, so the promenade ends in something solid instead of
    // grass falling off into the water.
    const wallGeo = new THREE.BoxGeometry(170, 1.6, 2.4);
    const wallMat = createStandardMaterial(0xb8b0a0);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(700, 0.9, -700);
    wall.rotation.y = -Math.PI / 4;
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.seaWall = wall;
    const capGeo = new THREE.BoxGeometry(170, 0.3, 3);
    const capMat = createStandardMaterial(0x6a6258);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(700, 1.8, -700);
    cap.rotation.y = -Math.PI / 4;
    this.scene.add(cap);
  }

  // -- yacht club --------------------------------------------------------------

  buildYachtClub() {
    // The club is the district's anchor: a wide hall with a pitched
    // roof, a deck on the water side, a sign board, a pennant that waves
    // in the wind, and a terrace on the north face where the first marina
    // job sends the player (672, -654). The hall is 28 wide and 24 deep,
    // centred on (672, -672), so its north face is at z = -660 and the
    // terrace sits 6 units clear of it — reachable on foot.
    const group = new THREE.Group();
    const wallMat = createStandardMaterial(0xe8e0d0);
    const trimMat = createStandardMaterial(0x2a4a6a);
    const roofMat = createStandardMaterial(0x8a2a2a);
    const deckMat = createStandardMaterial(0x9a7a5a);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88bbdd, metalness: 0.6, roughness: 0.15,
      transparent: true, opacity: 0.75,
    });

    // Hall body.
    const hallGeo = new THREE.BoxGeometry(DISTRICT.clubW, 9, DISTRICT.clubD);
    const hall = new THREE.Mesh(hallGeo, wallMat);
    hall.position.y = 4.5;
    hall.castShadow = true;
    hall.receiveShadow = true;
    hall.userData = { type: 'building', height: 9, bw: DISTRICT.clubW, bd: DISTRICT.clubD };
    group.add(hall);
    this.clubHall = hall;

    // Pitched roof: two slabs meeting at the ridge, plus gable ends.
    for (const side of [-1, 1]) {
      const slabGeo = new THREE.BoxGeometry(DISTRICT.clubW + 2, 0.5, DISTRICT.clubD / 2 + 2);
      const slab = new THREE.Mesh(slabGeo, roofMat);
      slab.position.set(0, 10.6, side * DISTRICT.clubD / 4);
      slab.rotation.x = side * 0.35;
      slab.castShadow = true;
      group.add(slab);
    }
    const ridgeGeo = new THREE.BoxGeometry(DISTRICT.clubW + 2, 0.6, 1);
    const ridge = new THREE.Mesh(ridgeGeo, trimMat);
    ridge.position.set(0, 12.2, 0);
    group.add(ridge);

    // Glass band around the hall: tall windows on all four faces.
    for (let i = 0; i < 6; i++) {
      const winGeo = new THREE.BoxGeometry(2.4, 4.5, 0.15);
      const winN = new THREE.Mesh(winGeo, glassMat);
      winN.position.set(-10 + i * 4, 4.5, DISTRICT.clubD / 2 + 0.1);
      group.add(winN);
      const winS = new THREE.Mesh(winGeo, glassMat);
      winS.position.set(-10 + i * 4, 4.5, -DISTRICT.clubD / 2 - 0.1);
      group.add(winS);
    }
    for (let i = 0; i < 5; i++) {
      const winGeo = new THREE.BoxGeometry(0.15, 4.5, 2.4);
      const winE = new THREE.Mesh(winGeo, glassMat);
      winE.position.set(DISTRICT.clubW / 2 + 0.1, 4.5, -8 + i * 4);
      group.add(winE);
      const winW = new THREE.Mesh(winGeo, glassMat);
      winW.position.set(-DISTRICT.clubW / 2 - 0.1, 4.5, -8 + i * 4);
      group.add(winW);
    }

    // Terrace: a stone slab on the north face with a low balustrade.
    // This is the Harbor Lights objective point.
    const terraceGeo = new THREE.BoxGeometry(16, 0.5, 8);
    const terraceMat = createStandardMaterial(0xb8b0a0);
    const terrace = new THREE.Mesh(terraceGeo, terraceMat);
    terrace.position.set(0, 0.35, DISTRICT.clubD / 2 + 4);
    terrace.receiveShadow = true;
    group.add(terrace);
    this.terrace = terrace;
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(16, 0.9, 0.25);
      const rail = new THREE.Mesh(railGeo, trimMat);
      rail.position.set(0, 1.1, DISTRICT.clubD / 2 + 8 - (side < 0 ? 8 : 0));
      group.add(rail);
    }
    const railSideGeo = new THREE.BoxGeometry(0.25, 0.9, 8);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railSideGeo, trimMat);
      rail.position.set(side * 8, 1.1, DISTRICT.clubD / 2 + 4);
      group.add(rail);
    }

    // Deck on the water (south-east) side, on stilts over the sand.
    const deckGeo = new THREE.BoxGeometry(20, 0.4, 10);
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, 0.8, -DISTRICT.clubD / 2 - 5);
    deck.receiveShadow = true;
    group.add(deck);
    this.clubDeck = deck;
    for (let i = 0; i < 4; i++) {
      const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6);
      const post = new THREE.Mesh(postGeo, trimMat);
      post.position.set(-8 + i * 5.3, 0, -DISTRICT.clubD / 2 - 9);
      group.add(post);
    }

    // Sign board above the door, and the pennant on its pole.
    const signGeo = new THREE.BoxGeometry(14, 2.2, 0.4);
    const signMat = createStandardMaterial(0x1a3a5a);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 8.2, DISTRICT.clubD / 2 + 0.4);
    group.add(sign);
    const signTextGeo = new THREE.BoxGeometry(12, 1.2, 0.1);
    const signTextMat = createEmissiveMaterial(0xffdd88, 0.9);
    const signText = new THREE.Mesh(signTextGeo, signTextMat);
    signText.position.set(0, 8.2, DISTRICT.clubD / 2 + 0.65);
    group.add(signText);

    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 9, 6);
    const pole = new THREE.Mesh(poleGeo, trimMat);
    pole.position.set(DISTRICT.clubW / 2 - 1, 13.5, 0);
    group.add(pole);
    const pennantGeo = new THREE.PlaneGeometry(3, 1.2);
    const pennantMat = new THREE.MeshBasicMaterial({ color: 0xc83838, side: THREE.DoubleSide });
    const pennant = new THREE.Mesh(pennantGeo, pennantMat);
    pennant.position.set(DISTRICT.clubW / 2 + 0.6, 17.2, 0);
    group.add(pennant);
    this.pennant = pennant;

    group.position.set(DISTRICT.clubX, 0, DISTRICT.clubZ);
    this.scene.add(group);
    this.clubGroup = group;

    // The hall is solid: an invisible collision box in WORLD
    // coordinates, added to the scene (never to the group, whose
    // children are local — a group child pushed here would read as a
    // phantom building at the origin). The terrace and the deck are
    // walkable and stay out of the list.
    const solidGeo = new THREE.BoxGeometry(DISTRICT.clubW, 9, DISTRICT.clubD);
    const solid = new THREE.Mesh(solidGeo, wallMat);
    solid.position.set(DISTRICT.clubX, 4.5, DISTRICT.clubZ);
    solid.userData = { type: 'building', height: 9, bw: DISTRICT.clubW, bd: DISTRICT.clubD };
    solid.visible = false;
    this.scene.add(solid);
    this.city.buildings.push(solid);
  }

  // -- condo towers ------------------------------------------------------------

  buildCondos() {
    // Three towers with stepped heights. Each tower is a slab body with
    // a darker crown, a lit-window glass skin built per face, and a
    // rooftop box. All three push into city.buildings.
    for (const tower of TOWERS) {
      const group = new THREE.Group();
      const bodyMat = createStandardMaterial(tower.tint);
      const crownMat = createStandardMaterial(0x2a2a30);
      const glassMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

      const bodyGeo = new THREE.BoxGeometry(tower.w, tower.h, tower.d);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = tower.h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = { type: 'building', height: tower.h, bw: tower.w, bd: tower.d };
      group.add(body);

      // Crown: a slightly wider cap and a rooftop plant box.
      const crownGeo = new THREE.BoxGeometry(tower.w + 1, 1.6, tower.d + 1);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = tower.h + 0.8;
      crown.castShadow = true;
      group.add(crown);
      const plantGeo = new THREE.BoxGeometry(tower.w * 0.4, 2.2, tower.d * 0.4);
      const plant = new THREE.Mesh(plantGeo, crownMat);
      plant.position.set(tower.w * 0.2, tower.h + 2.6, -tower.d * 0.15);
      group.add(plant);

      // Window glass: one quad per window on all four faces, lit or dark
      // per a hash of the tower seed, exactly like the base city does.
      const quads = this.buildTowerWindows(tower, glassMat);
      group.add(quads);

      // Balconies on the sea-facing side, every third floor.
      const balconyMat = createStandardMaterial(0x4a4a52);
      const floors = Math.floor(tower.h / 4);
      for (let f = 2; f < floors; f += 3) {
        const balcGeo = new THREE.BoxGeometry(tower.w * 0.5, 0.3, 2.4);
        const balc = new THREE.Mesh(balcGeo, balconyMat);
        balc.position.set(0, f * 4 + 0.5, tower.d / 2 + 1.2);
        balc.castShadow = true;
        group.add(balc);
      }

      group.position.set(tower.x, 0, tower.z);
      this.scene.add(group);
      // Collision box in world coordinates (see the yacht club note:
      // a group child would read as a phantom at the origin).
      const solidGeo = new THREE.BoxGeometry(tower.w, tower.h, tower.d);
      const solid = new THREE.Mesh(solidGeo, bodyMat);
      solid.position.set(tower.x, tower.h / 2, tower.z);
      solid.userData = { type: 'building', height: tower.h, bw: tower.w, bd: tower.d };
      solid.visible = false;
      this.scene.add(solid);
      this.city.buildings.push(solid);
      this.condos.push({
        name: tower.name,
        mesh: group,
        body,
        x: tower.x,
        z: tower.z,
        height: tower.h,
        length: tower.h,
      });
    }
  }

  buildTowerWindows(tower, material) {
    // Per-face window quads with per-window lit/dark vertex colours.
    // The geometry is built in tower-local space, centred on the body.
    const positions = [];
    const colours = [];
    const lit = new THREE.Color(CONFIG.PALETTE.WINDOW_LIT);
    const dark = new THREE.Color(CONFIG.PALETTE.WINDOW_DARK);
    const winW = 1.4;
    const winH = 1.8;
    const out = 0.07;
    const rows = Math.min(Math.max(2, Math.floor((tower.h - 6) / 3.4)), 12);
    const pushQuad = (mapFn, u0, v0, u1, v1, colour) => {
      const corners = [
        [u0, v0], [u1, v0], [u1, v1],
        [u0, v0], [u1, v1], [u0, v1],
      ];
      for (const [u, v] of corners) {
        const p = mapFn(u, v);
        positions.push(p[0], p[1], p[2]);
        colours.push(colour.r, colour.g, colour.b);
      }
    };
    for (let side = 0; side < 4; side++) {
      const faceW = side % 2 === 0 ? tower.w : tower.d;
      const cols = Math.min(Math.max(3, Math.floor(faceW / 3.2)), 7);
      const spacing = faceW / cols;
      for (let row = 0; row < rows; row++) {
        const wy = 3.4 + row * 3.4;
        if (wy + winH / 2 > tower.h - 2) break;
        for (let col = 0; col < cols; col++) {
          const wx = -faceW / 2 + spacing * (col + 0.5);
          const litWindow = hash2D(tower.x + col * 13 + side * 41, tower.z + row * 17, this.seed + 77) > 0.62;
          const colour = litWindow ? lit : dark;
          const u0 = wx - winW / 2, u1 = wx + winW / 2;
          const v0 = wy - winH / 2, v1 = wy + winH / 2;
          if (side === 0) pushQuad((u, v) => [u, v, tower.d / 2 + out], u0, v0, u1, v1, colour);
          else if (side === 1) pushQuad((u, v) => [u, v, -(tower.d / 2 + out)], u0, v0, u1, v1, colour);
          else if (side === 2) pushQuad((u, v) => [tower.w / 2 + out, v, u], u0, v0, u1, v1, colour);
          else pushQuad((u, v) => [-(tower.w / 2 + out), v, u], u0, v0, u1, v1, colour);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = 0;
    return mesh;
  }

  // -- promenade shops -----------------------------------------------------------

  buildShops() {
    // Three huts with striped awnings and a lit sign board each. The
    // huts are solid (they push into city.buildings); the awnings hang
    // over the walkway and stay out of the collision list.
    for (const shop of SHOPS) {
      const group = new THREE.Group();
      const hutMat = createStandardMaterial(0xd8c8a8);
      const roofMat = createStandardMaterial(0x3a3a42);

      const hutGeo = new THREE.BoxGeometry(shop.w, shop.h, shop.d);
      const hut = new THREE.Mesh(hutGeo, hutMat);
      hut.position.y = shop.h / 2;
      hut.castShadow = true;
      hut.receiveShadow = true;
      hut.userData = { type: 'building', height: shop.h, bw: shop.w, bd: shop.d };
      group.add(hut);

      const roofGeo = new THREE.BoxGeometry(shop.w + 1.5, 0.5, shop.d + 1.5);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = shop.h + 0.25;
      group.add(roof);

      // Striped awning: alternating coloured and pale slabs, angled
      // down over the shop front (the north face, toward the promenade).
      const stripeCount = 6;
      const stripeW = shop.w / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        const stripeGeo = new THREE.BoxGeometry(stripeW + 0.05, 0.18, 3.4);
        const stripeMat = createStandardMaterial(shop.stripe[i % 2]);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(-shop.w / 2 + stripeW * (i + 0.5), shop.h - 1.1, shop.d / 2 + 1.4);
        stripe.rotation.x = 0.35;
        stripe.castShadow = true;
        group.add(stripe);
      }

      // Counter window on the front face, glowing warm at night.
      const counterGeo = new THREE.BoxGeometry(shop.w * 0.6, 2.2, 0.15);
      const counterMat = createEmissiveMaterial(0xffcc66, 0.85);
      const counter = new THREE.Mesh(counterGeo, counterMat);
      counter.position.set(0, 2.6, shop.d / 2 + 0.1);
      group.add(counter);

      // Sign board with the shop name in light.
      const signGeo = new THREE.BoxGeometry(shop.w * 0.8, 1.4, 0.3);
      const signMat = createStandardMaterial(0x1a2a3a);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, shop.h - 0.4, shop.d / 2 + 0.25);
      group.add(sign);
      const glowGeo = new THREE.BoxGeometry(shop.w * 0.7, 0.8, 0.1);
      const glowMat = createEmissiveMaterial(0xffeebb, 0.9);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(0, shop.h - 0.4, shop.d / 2 + 0.45);
      group.add(glow);

      group.position.set(shop.x, 0, shop.z);
      this.scene.add(group);
      // Collision box in world coordinates (see the yacht club note).
      const solidGeo = new THREE.BoxGeometry(shop.w, shop.h, shop.d);
      const solid = new THREE.Mesh(solidGeo, hutMat);
      solid.position.set(shop.x, shop.h / 2, shop.z);
      solid.userData = { type: 'building', height: shop.h, bw: shop.w, bd: shop.d };
      solid.visible = false;
      this.scene.add(solid);
      this.city.buildings.push(solid);
      this.shops.push({ name: shop.sign, mesh: group, x: shop.x, z: shop.z });
    }
  }

  // -- beach bar -----------------------------------------------------------------

  buildBeachBar() {
    // An open-air bar on the north edge of the district: a counter, a
    // thatch roof on four posts, stools, a chalk board and a string of
    // bottles on the back shelf. The bar is where the Manifest delivery
    // ends (608, -544), so the counter front stays clear of obstacles.
    const group = new THREE.Group();
    const counterMat = createStandardMaterial(0x7a5a34);
    const roofMat = createStandardMaterial(0xc8a848);
    const postMat = createStandardMaterial(0x4a3a26);
    const stoolMat = createStandardMaterial(0x8a2a2a);

    // Counter block.
    const counterGeo = new THREE.BoxGeometry(10, 1.2, 2.4);
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.y = 0.6;
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);
    const topGeo = new THREE.BoxGeometry(10.6, 0.25, 3);
    const top = new THREE.Mesh(topGeo, createStandardMaterial(0x3a2a1a));
    top.position.y = 1.3;
    top.castShadow = true;
    group.add(top);

    // Four posts and the thatch roof (a flattened cone).
    for (const [px, pz] of [[-4.6, -1], [4.6, -1], [-4.6, 1], [4.6, 1]]) {
      const postGeo = new THREE.CylinderGeometry(0.14, 0.18, 4.4, 6);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 2.2, pz);
      group.add(post);
    }
    const thatchGeo = new THREE.ConeGeometry(8.4, 2.4, 4);
    const thatch = new THREE.Mesh(thatchGeo, roofMat);
    thatch.position.y = 5.4;
    thatch.rotation.y = Math.PI / 4;
    thatch.castShadow = true;
    group.add(thatch);

    // Stools in a row along the counter front.
    for (let i = 0; i < 5; i++) {
      const stool = new THREE.Group();
      const seatGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.18, 10);
      const seat = new THREE.Mesh(seatGeo, stoolMat);
      seat.position.y = 0.85;
      stool.add(seat);
      const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.85, 6);
      const leg = new THREE.Mesh(legGeo, postMat);
      leg.position.y = 0.42;
      stool.add(leg);
      stool.position.set(-4 + i * 2, 0, 2.6);
      group.add(stool);
    }

    // Back shelf with bottles: small coloured cylinders in two rows.
    const bottleColours = [0x2a6a2a, 0x8a2a2a, 0xc8a838, 0x3878c8, 0x2a8a6a];
    for (let row = 0; row < 2; row++) {
      const shelfGeo = new THREE.BoxGeometry(9, 0.12, 0.8);
      const shelf = new THREE.Mesh(shelfGeo, counterMat);
      shelf.position.set(0, 2.2 + row * 1.1, -1.6);
      group.add(shelf);
      for (let i = 0; i < 9; i++) {
        const bottleGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.55, 6);
        const bottleMat = createStandardMaterial(bottleColours[(i + row * 3) % bottleColours.length]);
        const bottle = new THREE.Mesh(bottleGeo, bottleMat);
        bottle.position.set(-4 + i, 2.55 + row * 1.1, -1.6);
        group.add(bottle);
      }
    }

    // Chalk board with the day's special, leaning on the counter end.
    const boardGeo = new THREE.BoxGeometry(1.8, 2.4, 0.12);
    const boardMat = createStandardMaterial(0x1a1a1a);
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(5.6, 1.3, 1.8);
    board.rotation.y = -0.4;
    group.add(board);
    const chalkGeo = new THREE.BoxGeometry(1.4, 0.5, 0.05);
    const chalkMat = createEmissiveMaterial(0xf8f0d0, 0.7);
    const chalk = new THREE.Mesh(chalkGeo, chalkMat);
    chalk.position.set(5.6, 1.9, 1.9);
    chalk.rotation.y = -0.4;
    group.add(chalk);

    group.position.set(DISTRICT.beachBarX, 0, DISTRICT.beachBarZ);
    this.scene.add(group);
    this.beachBar = group;
  }

  // -- marina pool ---------------------------------------------------------------

  buildMarinaPool() {
    // A rectangular pool between the club and the condos, with a turquoise
    // surface that shimmers, a pale rim, deck chairs and two umbrellas.
    // The water surface is the mesh the update pass animates.
    const group = new THREE.Group();
    const rimMat = createStandardMaterial(0xd8d0c0);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2a9ab8, roughness: 0.05, metalness: 0.4,
      transparent: true, opacity: 0.9,
    });

    const basinGeo = new THREE.BoxGeometry(24, 1.2, 12);
    const basin = new THREE.Mesh(basinGeo, rimMat);
    basin.position.y = 0.1;
    basin.receiveShadow = true;
    group.add(basin);
    const waterGeo = new THREE.PlaneGeometry(22, 10);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.75;
    group.add(water);
    this.poolWater = water;

    // Deck chairs: reclined frames in two rows.
    const chairMat = createStandardMaterial(0xe8e0d0);
    const chairClothMat = createStandardMaterial(0x38a8a8);
    for (let i = 0; i < 6; i++) {
      const chair = new THREE.Group();
      const frameGeo = new THREE.BoxGeometry(0.9, 0.5, 2.2);
      const frame = new THREE.Mesh(frameGeo, chairMat);
      frame.position.y = 0.35;
      frame.rotation.x = -0.18;
      chair.add(frame);
      const clothGeo = new THREE.BoxGeometry(0.8, 0.12, 1.8);
      const cloth = new THREE.Mesh(clothGeo, chairClothMat);
      cloth.position.set(0, 0.62, -0.2);
      cloth.rotation.x = -0.18;
      chair.add(cloth);
      chair.position.set(-9 + (i % 3) * 9, 0.8, i < 3 ? -8 : 8);
      chair.rotation.y = i < 3 ? 0 : Math.PI;
      group.add(chair);
    }

    // Two umbrellas over the chairs.
    for (const ux of [-6, 6]) {
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3, 6);
      const pole = new THREE.Mesh(poleGeo, createStandardMaterial(0x8a7a5a));
      pole.position.set(ux, 2.3, -8);
      group.add(pole);
      const canopyGeo = new THREE.ConeGeometry(2.2, 0.7, 8);
      const canopy = new THREE.Mesh(canopyGeo, createStandardMaterial(0xe8c838));
      canopy.position.set(ux, 3.9, -8);
      canopy.castShadow = true;
      group.add(canopy);
    }

    group.position.set(640, 0, -700);
    this.scene.add(group);
    this.poolGroup = group;
  }

  // -- pier ----------------------------------------------------------------------

  buildPier() {
    // A diagonal pier from the promenade (700, -700) out to the pier head
    // (858, -858), where the Manifest pickup waits. Planks, rails, a
    // PIER 9 sign at the head, and lamp posts along its length.
    const startX = 700, startZ = -700;
    const endX = DISTRICT.pierHeadX, endZ = DISTRICT.pierHeadZ;
    const dx = endX - startX, dz = endZ - startZ;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const midX = (startX + endX) / 2, midZ = (startZ + endZ) / 2;

    const group = new THREE.Group();
    const plankMat = createStandardMaterial(0x7a5a34);
    const railMat = createStandardMaterial(0x3a3a3a);
    const pileMat = createStandardMaterial(0x2a2a22);

    // Deck: a long box, slightly above the sand.
    const deckGeo = new THREE.BoxGeometry(6, 0.5, length);
    const deck = new THREE.Mesh(deckGeo, plankMat);
    deck.position.y = 0.55;
    deck.receiveShadow = true;
    group.add(deck);

    // Plank seams: thin darker strips across the deck every 4 units.
    const seamMat = createStandardMaterial(0x5a4226);
    const seamCount = Math.floor(length / 4);
    for (let i = 0; i < seamCount; i++) {
      const seamGeo = new THREE.BoxGeometry(6, 0.06, 0.25);
      const seam = new THREE.Mesh(seamGeo, seamMat);
      seam.position.set(0, 0.82, -length / 2 + 2 + i * 4);
      group.add(seam);
    }

    // Rails on both sides.
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.15, 0.15, length);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * 2.9, 1.5, 0);
      group.add(rail);
      const postCount = Math.floor(length / 8);
      for (let i = 0; i <= postCount; i++) {
        const postGeo = new THREE.BoxGeometry(0.15, 1.1, 0.15);
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(side * 2.9, 1, -length / 2 + i * 8);
        group.add(post);
      }
    }

    // Piles under the deck, every 12 units, sunk into the sand.
    const pileCount = Math.floor(length / 12);
    for (let i = 0; i <= pileCount; i++) {
      for (const side of [-1, 1]) {
        const pileGeo = new THREE.CylinderGeometry(0.3, 0.35, 3.5, 6);
        const pile = new THREE.Mesh(pileGeo, pileMat);
        pile.position.set(side * 2.4, -0.6, -length / 2 + i * 12);
        group.add(pile);
      }
    }

    // Lamp posts along the pier, alternating sides.
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7 });
    const lampCount = Math.floor(length / 24);
    for (let i = 0; i < lampCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lamp = new THREE.Group();
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6);
      const pole = new THREE.Mesh(poleGeo, railMat);
      pole.position.y = 2.25;
      lamp.add(pole);
      const globeGeo = new THREE.SphereGeometry(0.32, 8, 6);
      const globe = new THREE.Mesh(globeGeo, lampGlowMat.clone());
      globe.position.y = 4.6;
      lamp.add(globe);
      lamp.userData.glow = globe;
      lamp.position.set(side * 2.7, 0.8, -length / 2 + 12 + i * 24);
      group.add(lamp);
      this.lamps.push(lamp);
    }

    // PIER 9 sign at the head: a post, a board, a glowing strip.
    const signPostGeo = new THREE.CylinderGeometry(0.15, 0.18, 5, 6);
    const signPost = new THREE.Mesh(signPostGeo, railMat);
    signPost.position.set(-2.4, 2.5, length / 2 - 1);
    group.add(signPost);
    const signGeo = new THREE.BoxGeometry(4.5, 1.6, 0.25);
    const sign = new THREE.Mesh(signGeo, createStandardMaterial(0x1a3a5a));
    sign.position.set(-2.4, 5.2, length / 2 - 1);
    group.add(sign);
    const stripGeo = new THREE.BoxGeometry(4, 0.5, 0.1);
    const strip = new THREE.Mesh(stripGeo, createEmissiveMaterial(0xffdd88, 0.9));
    strip.position.set(-2.4, 5.2, length / 2 - 0.85);
    group.add(strip);

    group.position.set(midX, 0, midZ);
    group.rotation.y = angle;
    this.scene.add(group);
    this.pierGroup = group;
  }

  // -- yachts and buoys ------------------------------------------------------------

  buildYachts() {
    // Six moored yachts along the pier, each a hull, a cabin, a mast
    // and a sail. They bob and rock in update() on their own phases.
    for (const spot of YACHT_SPOTS) {
      const yacht = new THREE.Group();
      const hullMat = createStandardMaterial(spot.hull);
      const cabinMat = createStandardMaterial(0xf0ead8);
      const mastMat = createStandardMaterial(0x6a5a3a);
      const sailMat = new THREE.MeshStandardMaterial({
        color: spot.sail, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      });

      // Hull: a tapered box (wider at the stern, narrower at the bow).
      const hullGeo = new THREE.BoxGeometry(3.4, 1.4, spot.len);
      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.position.y = 0.4;
      hull.castShadow = true;
      yacht.add(hull);
      const bowGeo = new THREE.ConeGeometry(1.7, 3, 4);
      const bow = new THREE.Mesh(bowGeo, hullMat);
      bow.position.set(0, 0.4, spot.len / 2 + 1.2);
      bow.rotation.x = Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      yacht.add(bow);

      // Cabin block with windows.
      const cabinGeo = new THREE.BoxGeometry(2.4, 1.1, spot.len * 0.45);
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 1.6, -spot.len * 0.1);
      cabin.castShadow = true;
      yacht.add(cabin);
      const winGeo = new THREE.BoxGeometry(2.5, 0.4, spot.len * 0.3);
      const winMat = createStandardMaterial(0x1a2a3a);
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(0, 1.7, -spot.len * 0.1);
      yacht.add(win);

      // Mast and sail.
      const mastGeo = new THREE.CylinderGeometry(0.09, 0.12, spot.len * 0.9, 6);
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(0, 1 + spot.len * 0.45, spot.len * 0.05);
      mast.castShadow = true;
      yacht.add(mast);
      const sailGeo = new THREE.PlaneGeometry(spot.len * 0.35, spot.len * 0.7);
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.position.set(0.6, 1 + spot.len * 0.4, spot.len * 0.05);
      sail.castShadow = true;
      yacht.add(sail);

      // A small flag at the masthead.
      const flagGeo = new THREE.PlaneGeometry(1.1, 0.6);
      const flagMat = new THREE.MeshBasicMaterial({ color: spot.sail, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0.6, 1 + spot.len * 0.88, spot.len * 0.05);
      yacht.add(flag);

      yacht.position.set(spot.x, -1.2, spot.z);
      yacht.rotation.y = -Math.PI / 4 + (this.random() - 0.5) * 0.2;
      yacht.userData.phase = this.random() * Math.PI * 2;
      yacht.userData.baseY = -1.2;
      this.scene.add(yacht);
      this.yachts.push({
        mesh: yacht,
        x: spot.x,
        z: spot.z,
        length: spot.len,
        phase: yacht.userData.phase,
      });
    }
  }

  buildBuoys() {
    // Six channel buoys: a cone on a cylinder base, striped red and
    // white, bobbing gently. They mark the way into the marina.
    for (const spot of BUOY_SPOTS) {
      const buoy = new THREE.Group();
      const baseGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.8, 8);
      const base = new THREE.Mesh(baseGeo, createStandardMaterial(0xc83838));
      base.position.y = 0.4;
      buoy.add(base);
      const coneGeo = new THREE.ConeGeometry(0.7, 1.6, 8);
      const cone = new THREE.Mesh(coneGeo, createStandardMaterial(0xf8f0e0));
      cone.position.y = 1.6;
      buoy.add(cone);
      const tipGeo = new THREE.SphereGeometry(0.25, 8, 6);
      const tip = new THREE.Mesh(tipGeo, createEmissiveMaterial(0xff2222, 1));
      tip.position.y = 2.6;
      buoy.add(tip);
      buoy.position.set(spot.x, -1.6, spot.z);
      buoy.userData.phase = this.random() * Math.PI * 2;
      buoy.userData.baseY = -1.6;
      this.scene.add(buoy);
      this.buoys.push({
        mesh: buoy,
        x: spot.x,
        z: spot.z,
        phase: buoy.userData.phase,
      });
    }
  }

  // -- lighthouse ------------------------------------------------------------------

  buildLighthouse() {
    // The lighthouse past the pier head: a banded tower, a gallery deck,
    // a lamp room with a real PointLight, a rotating beam cone, and the
    // keeper's cottage beside it. The escape objective is the open
    // ground at (880, -880); the tower itself stands a few units off so
    // the player can reach the point without walking into the wall.
    const group = new THREE.Group();
    const bandA = createStandardMaterial(0xf0e8d8);
    const bandB = createStandardMaterial(0xc83838);
    const darkMat = createStandardMaterial(0x2a2a30);

    // Banded tower: stacked cylinders, alternating pale and red.
    const bands = 6;
    const towerH = 30;
    for (let i = 0; i < bands; i++) {
      const rBottom = 3.4 - (i * 0.28);
      const rTop = 3.4 - ((i + 1) * 0.28);
      const bandGeo = new THREE.CylinderGeometry(rTop, rBottom, towerH / bands, 12);
      const band = new THREE.Mesh(bandGeo, i % 2 === 0 ? bandA : bandB);
      band.position.y = (i + 0.5) * (towerH / bands);
      band.castShadow = true;
      group.add(band);
    }

    // Gallery deck and railing.
    const deckGeo = new THREE.CylinderGeometry(4.4, 4.4, 0.5, 12);
    const deck = new THREE.Mesh(deckGeo, darkMat);
    deck.position.y = towerH + 0.25;
    group.add(deck);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const railGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
      const rail = new THREE.Mesh(railGeo, darkMat);
      rail.position.set(Math.cos(angle) * 4.2, towerH + 1, Math.sin(angle) * 4.2);
      group.add(rail);
    }

    // Lamp room: glass cylinder, a bright lamp, and a cap.
    const glassGeo = new THREE.CylinderGeometry(2.6, 2.6, 3.4, 12);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffeeaa, emissive: 0xffdd66, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.55,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = towerH + 2.2;
    group.add(glass);
    const lampGeo = new THREE.SphereGeometry(1.1, 10, 8);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.y = towerH + 2.2;
    group.add(lamp);
    this.lighthouseLamp = lamp;
    const capGeo = new THREE.ConeGeometry(3.2, 2.2, 12);
    const cap = new THREE.Mesh(capGeo, darkMat);
    cap.position.y = towerH + 4.9;
    group.add(cap);

    // The beam: a long translucent cone, plus a PointLight that sweeps
    // with it. The beam group rotates in update().
    const beamGroup = new THREE.Group();
    beamGroup.position.y = towerH + 2.2;
    const beamGeo = new THREE.ConeGeometry(4.5, 60, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b8, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.x = 30;
    beamGroup.add(beam);
    const beamLight = new THREE.PointLight(0xffee88, 60, 120, 1.6);
    beamLight.position.set(0, 0, 0);
    beamGroup.add(beamLight);
    group.add(beamGroup);
    this.beamGroup = beamGroup;
    this.beamLight = beamLight;

    // Keeper's cottage: a small house with a pitched roof and a lit
    // window, tucked beside the tower.
    const cottage = new THREE.Group();
    const cotWallMat = createStandardMaterial(0xd8c8a8);
    const cotRoofMat = createStandardMaterial(0x6a3a2a);
    const cotGeo = new THREE.BoxGeometry(8, 4.5, 6);
    const cot = new THREE.Mesh(cotGeo, cotWallMat);
    cot.position.y = 2.25;
    cot.castShadow = true;
    cottage.add(cot);
    const cotRoofGeo = new THREE.ConeGeometry(6.4, 2.6, 4);
    const cotRoof = new THREE.Mesh(cotRoofGeo, cotRoofMat);
    cotRoof.position.y = 5.8;
    cotRoof.rotation.y = Math.PI / 4;
    cottage.add(cotRoof);
    const cotWinGeo = new THREE.BoxGeometry(1.4, 1.4, 0.15);
    const cotWin = new THREE.Mesh(cotWinGeo, createEmissiveMaterial(0xffcc66, 0.9));
    cotWin.position.set(-1.5, 2.4, 3.05);
    cottage.add(cotWin);
    cottage.position.set(10, 0, 8);
    group.add(cottage);

    group.position.set(DISTRICT.lightX + 4, 0, DISTRICT.lightZ + 4);
    this.scene.add(group);
    this.lighthouseGroup = group;
  }

  // -- parking lot -----------------------------------------------------------------

  buildParkingLot() {
    // A 40 x 30 lot west of the promenade with painted bays and six
    // static cars (simple box-built cars, not Vehicle instances, so the
    // traffic system never tries to drive them away).
    const group = new THREE.Group();
    const asphaltMat = createStandardMaterial(0x3d3d44);
    const lineMat = createMaterial(0xf8f8f8);

    const lotGeo = new THREE.PlaneGeometry(40, 30);
    const lot = new THREE.Mesh(lotGeo, asphaltMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.y = 0.1;
    lot.receiveShadow = true;
    group.add(lot);

    // Bay lines: six bays along the north edge.
    for (let i = 0; i < 7; i++) {
      const lineGeo = new THREE.BoxGeometry(0.25, 0.06, 6);
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(-15 + i * 5, 0.15, -9);
      group.add(line);
    }
    const edgeGeo = new THREE.BoxGeometry(30, 0.06, 0.25);
    const edge = new THREE.Mesh(edgeGeo, lineMat);
    edge.position.set(0, 0.15, -12);
    group.add(edge);

    // Six static cars in the bays, varied colours and types.
    const carColours = [0xc83838, 0x3878c8, 0xe8e8e8, 0x38a838, 0x585868, 0xe8c838];
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Group();
      const bodyMat = createStandardMaterial(carColours[i]);
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x1a2a3a, metalness: 0.8, roughness: 0.15,
        transparent: true, opacity: 0.6,
      });
      const bodyGeo = new THREE.BoxGeometry(1.9, 0.75, 4.4);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);
      const cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2);
      const cabin = new THREE.Mesh(cabinGeo, glassMat);
      cabin.position.set(0, 1.15, 0.2);
      car.add(cabin);
      const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 10);
      const wheelMat = createStandardMaterial(0x1a1a1a);
      for (const [wx, wz] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.36, wz);
        car.add(wheel);
      }
      car.position.set(-12.5 + i * 5, 0.1, -9);
      car.rotation.y = (this.random() - 0.5) * 0.1;
      group.add(car);
    }

    group.position.set(596, 0, -680);
    this.scene.add(group);
    this.parkingGroup = group;
  }

  // -- palms, festoon lights, gulls --------------------------------------------------

  buildPalms() {
    // Twelve palms: a leaning trunk and five fronds each. The fronds
    // sway a little in update() through the shared palm list.
    for (const spot of PALM_SPOTS) {
      const palm = new THREE.Group();
      const trunkMat = createStandardMaterial(0x6a4a2a);
      const frondMat = createStandardMaterial(0x1a6a2a);
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 7, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.5;
      trunk.rotation.z = (this.random() - 0.5) * 0.16;
      trunk.castShadow = true;
      palm.add(trunk);
      const fronds = [];
      for (let f = 0; f < 5; f++) {
        const frondGeo = new THREE.ConeGeometry(1.9, 3.4, 5);
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.y = 7 + f * 0.35;
        frond.rotation.x = -Math.PI / 2 + (f - 2) * 0.28;
        frond.rotation.y = f * (Math.PI * 2 / 5);
        frond.castShadow = true;
        palm.add(frond);
        fronds.push(frond);
      }
      palm.position.set(spot.x, 0, spot.z);
      palm.userData.fronds = fronds;
      palm.userData.phase = this.random() * Math.PI * 2;
      this.scene.add(palm);
      this.palms.push(palm);
    }
  }

  buildFestoonLights() {
    // Strings of warm bulbs between the lamp posts along the promenade:
    // a catenary line of small glowing spheres. The bulbs brighten
    // after dusk in update().
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdd99, transparent: true, opacity: 0.85 });
    const wireMat = createMaterial(0x1a1a1a);
    const runs = [
      { from: [660, -610], to: [676, -626] },
      { from: [676, -626], to: [692, -642] },
      { from: [644, -594], to: [660, -610] },
      { from: [628, -610], to: [644, -594] },
    ];
    for (const run of runs) {
      const [x1, z1] = run.from;
      const [x2, z2] = run.to;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const angle = Math.atan2(x2 - x1, z2 - z1);
      const wireGeo = new THREE.BoxGeometry(0.05, 0.05, len);
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(mx, 5.4, mz);
      wire.rotation.y = angle;
      this.scene.add(wire);
      const bulbCount = Math.floor(len / 2.4);
      for (let i = 1; i < bulbCount; i++) {
        const t = i / bulbCount;
        const sag = Math.sin(t * Math.PI) * 0.9;
        const bx = x1 + (x2 - x1) * t;
        const bz = z1 + (z2 - z1) * t;
        const bulbGeo = new THREE.SphereGeometry(0.16, 6, 5);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat.clone());
        bulb.position.set(bx, 5.4 - sag, bz);
        this.scene.add(bulb);
        this.festoonBulbs.push(bulb);
      }
    }
  }

  buildGulls() {
    // Five gulls circling over the pier head: a white body cone and two
    // flapping wing planes each. They orbit in update().
    for (let i = 0; i < 5; i++) {
      const gull = new THREE.Group();
      const bodyMat = createStandardMaterial(0xf8f8f8);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide });
      const bodyGeo = new THREE.ConeGeometry(0.28, 1.4, 6);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      gull.add(body);
      const wings = [];
      for (const side of [-1, 1]) {
        const wingGeo = new THREE.PlaneGeometry(1.6, 0.5);
        const wing = new THREE.Mesh(wingGeo, wingMat);
        wing.position.set(side * 0.85, 0.1, 0);
        gull.add(wing);
        wings.push(wing);
      }
      gull.userData.wings = wings;
      gull.userData.orbitR = 24 + i * 5;
      gull.userData.orbitH = 26 + i * 3;
      gull.userData.orbitSpeed = 0.22 + i * 0.03;
      gull.userData.phase = (i / 5) * Math.PI * 2;
      gull.position.set(DISTRICT.pierHeadX, 28, DISTRICT.pierHeadZ);
      this.scene.add(gull);
      this.gulls.push(gull);
    }
  }

  // -- nodes -------------------------------------------------------------------------

  registerNodes() {
    // Walkways for the street life: pedestrian nodes along the
    // promenade, the boardwalk and the pier; a few street nodes on the
    // two minor streets that cross the district (x = 640, z = -640) so
    // traffic can route in. The district's own crowd (pedai.js) uses
    // its own waypoints; these nodes are for the base traffic system.
    for (let z = -740; z <= -560; z += 18) {
      this.city.pedestrianNodes.push({ x: 648, z, type: 'promenade' });
      this.city.pedestrianNodes.push({ x: 664, z: z + 9, type: 'promenade' });
    }
    for (let x = 580; x <= 740; x += 18) {
      this.city.pedestrianNodes.push({ x, z: -612, type: 'promenade' });
    }
    for (let t = 0; t <= 1; t += 0.1) {
      const x = 700 + (DISTRICT.pierHeadX - 700) * t;
      const z = -700 + (DISTRICT.pierHeadZ + 700) * t;
      this.city.pedestrianNodes.push({ x, z, type: 'pier' });
    }
    for (let z = -740; z <= -560; z += 24) {
      this.city.trafficNodes.push({ x: 640, z, type: 'street', dir: 'z' });
    }
    for (let x = 580; x <= 720; x += 24) {
      this.city.trafficNodes.push({ x, z: -640, type: 'street', dir: 'x' });
    }
    // Intersections where the two streets cross the promenade.
    this.city.trafficNodes.push({ x: 640, z: -640, type: 'intersection' });
    this.city.trafficNodes.push({ x: 640, z: -700, type: 'intersection' });
  }

  // -- queries -------------------------------------------------------------------------

  isInside(x, z) {
    return (
      x >= DISTRICT.centreX - DISTRICT.half &&
      x <= DISTRICT.centreX + DISTRICT.half &&
      z >= DISTRICT.centreZ - DISTRICT.half &&
      z <= DISTRICT.centreZ + DISTRICT.half
    );
  }

  getSpawnPosition() {
    return new THREE.Vector3(DISTRICT.heartX, 1, DISTRICT.heartZ);
  }

  // -- per-frame -------------------------------------------------------------------------

  update(delta, timeOfDay) {
    this.elapsed += delta;

    // Day factor: 1 at noon, 0 at midnight. The city already moves the
    // sun; the district only needs it for its own lights.
    const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
    const night = clamp(1 - dayFactor, 0, 1);

    // Yachts bob and rock on their own phases.
    for (const yacht of this.yachts) {
      const t = this.elapsed + yacht.phase * 7;
      yacht.mesh.position.y = yacht.mesh.userData.baseY + Math.sin(t * 0.7) * 0.35;
      yacht.mesh.rotation.z = Math.sin(t * 0.5) * 0.03;
      yacht.mesh.rotation.x = Math.sin(t * 0.42 + 1.3) * 0.02;
    }

    // Buoys ride the same swell, faster and smaller.
    for (const buoy of this.buoys) {
      const t = this.elapsed * 1.4 + buoy.phase * 5;
      buoy.mesh.position.y = buoy.mesh.userData.baseY + Math.sin(t) * 0.28;
      buoy.mesh.rotation.x = Math.sin(t * 0.8) * 0.1;
      buoy.mesh.rotation.z = Math.cos(t * 0.7) * 0.1;
    }

    // The pool shimmers: its opacity breathes slowly.
    if (this.poolWater) {
      this.poolWater.material.opacity = 0.82 + Math.sin(this.elapsed * 0.9) * 0.07;
    }

    // Lighthouse beam sweeps; the lamp brightens after dusk.
    if (this.beamGroup) {
      this.beamAngle += delta * 0.45;
      this.beamGroup.rotation.y = this.beamAngle;
      const beamOn = night > 0.25;
      this.beamGroup.visible = beamOn;
      this.beamLight.intensity = beamOn ? 40 + night * 50 : 0;
    }
    if (this.lighthouseLamp) {
      this.lighthouseLamp.material.color.setHex(night > 0.3 ? 0xfff6c8 : 0xcfc090);
    }

    // Pennant waves, palms sway.
    if (this.pennant) {
      this.pennant.rotation.y = Math.sin(this.elapsed * 2.2) * 0.5;
    }
    for (const palm of this.palms) {
      const sway = Math.sin(this.elapsed * 0.8 + palm.userData.phase) * 0.05;
      for (const frond of palm.userData.fronds) {
        frond.rotation.x += sway * delta;
      }
    }

    // Lamp globes and festoon bulbs brighten after dusk.
    const glow = 0.35 + night * 0.65;
    for (const lamp of this.lamps) {
      if (lamp.userData.glow) lamp.userData.glow.material.opacity = glow;
    }
    for (const bulb of this.festoonBulbs) {
      bulb.material.opacity = 0.3 + night * 0.7;
    }

    // Gulls circle the pier head, wings flapping.
    for (const gull of this.gulls) {
      const u = gull.userData;
      const a = u.phase + this.elapsed * u.orbitSpeed;
      gull.position.set(
        DISTRICT.pierHeadX + Math.cos(a) * u.orbitR,
        u.orbitH + Math.sin(this.elapsed * 0.6 + u.phase) * 2,
        DISTRICT.pierHeadZ + Math.sin(a) * u.orbitR,
      );
      gull.rotation.y = -a;
      const flap = Math.sin(this.elapsed * 6 + u.phase * 3) * 0.55;
      u.wings[0].rotation.z = flap;
      u.wings[1].rotation.z = -flap;
    }
  }
}
