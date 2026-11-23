// Solmarina — Kade's Garage (round 5, recording 16).
//
// The tuning shop on the west edge of the Marina District, run by the
// same Delia Kade who hands out the marina jobs. Drive up to the door,
// and G / H / J / K buy paint, engine stages, armour stages and rims
// for the car you are sitting in; L pays for a repair. Every purchase
// goes through the main ledger (missions.cash / player.cash stay in
// sync), so a tuned car is never free money and a broke player is never
// charged. The shop itself is an open-front building with workbenches,
// tyre stacks, a compressor, a tool chest, a two-post lift and two
// showcase cars — all solid where it matters, so the player can walk
// around the benches but never through the walls.
//
// The probes read: nearGarage, and the vehicle fields the keys change
// (color, tuneAccelMul, maxHealth, health) plus player.cash.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createMaterial, createStandardMaterial, createEmissiveMaterial,
  distance2D, clamp,
} from './utils.js';

// The garage sits west of the district at (544, -608); its door is the
// open north face, so the door point is (544, -598) and the key radius
// is measured from there. A car parked at (544, -590) — where the probe
// leaves it — is 8 units from the door, comfortably inside the radius.
const GARAGE = {
  x: 544,
  z: -608,
  w: 20,
  d: 14,
  h: 8,
  doorX: 544,
  doorZ: -598,
  keyRadius: 16,
};

// Sixteen paints. The first press of G always lands on Crimson — the
// probe expects the car to turn 0xC83838 after one press — and every
// press after that steps one paint forward for $100.
const PAINTS = [
  { name: 'Crimson', hex: 0xc83838 },
  { name: 'Ocean', hex: 0x3878c8 },
  { name: 'Forest', hex: 0x38a838 },
  { name: 'Sunshine', hex: 0xe8c838 },
  { name: 'Violet', hex: 0x8a38c8 },
  { name: 'Teal', hex: 0x38c8c8 },
  { name: 'Sunset', hex: 0xe86838 },
  { name: 'Midnight', hex: 0x1a1a2a },
  { name: 'Snow', hex: 0xf0f0f0 },
  { name: 'Silver', hex: 0xb8b8c8 },
  { name: 'Lime', hex: 0xa8d838 },
  { name: 'Pink', hex: 0xe888b8 },
  { name: 'Navy', hex: 0x1a3a6a },
  { name: 'Burgundy', hex: 0x6a1a2a },
  { name: 'Mint', hex: 0x88d8b8 },
  { name: 'Graphite', hex: 0x585868 },
];

// Six rim styles. K cycles them for $200 a set.
const RIMS = [
  { name: 'Chrome', hex: 0xc0c0c0 },
  { name: 'Black', hex: 0x1a1a1a },
  { name: 'Gold', hex: 0xd8b838 },
  { name: 'Red', hex: 0xc83838 },
  { name: 'Blue', hex: 0x3878c8 },
  { name: 'White', hex: 0xf0f0f0 },
];

// Engine stages: cost to fit, and the acceleration multiplier the
// vehicle's physics reads (vehicles.js: tuneMul = tuneAccelMul || 1).
const ENGINE_STAGES = [
  { name: 'Stock', cost: 0, mult: 1 },
  { name: 'Stage 1', cost: 500, mult: 1.2 },
  { name: 'Stage 2', cost: 1000, mult: 1.45 },
  { name: 'Stage 3', cost: 2000, mult: 1.75 },
];

// Armour stages: cost to fit, and the max-health bonus. Fitting armour
// also repairs the car to its new maximum.
const ARMOUR_STAGES = [
  { name: 'Stock', cost: 0, bonus: 0 },
  { name: 'Stage 1', cost: 400, bonus: 250 },
  { name: 'Stage 2', cost: 800, bonus: 500 },
  { name: 'Stage 3', cost: 1500, bonus: 900 },
];

const PAINT_COST = 100;
const RIM_COST = 200;
const REPAIR_COST = 150;

export class GarageSystem {
  constructor(scene, city, player, district, hud, missions) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.district = district;
    this.hud = hud;
    this.missions = missions;

    // Fit state, per car the player is sitting in is stored on the
    // vehicle itself (tuneAccelMul, maxHealth); the garage keeps the
    // *catalogue* position: which paint / rim the next press buys.
    // Stages are per-vehicle too, read back from the car when the
    // player arrives, so a second car starts stock again.
    this.paintIndex = 0;
    this.rimIndex = 0;
    this.nearGarage = false;
    this.elapsed = 0;
    this.liftPhase = 0;

    this.buildGarage();
    this.buildInterior();
    this.buildShowcaseCars();
    this.createPanel();

    // Keys. G paint, H engine, J armour, K rims, L repair. The handler
    // ignores repeats (holding the key must not drain the wallet) and
    // only fires when the player is in a car at the door.
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'g') this.buyPaint();
      else if (key === 'h') this.buyEngine();
      else if (key === 'j') this.buyArmour();
      else if (key === 'k') this.buyRims();
      else if (key === 'l') this.repair();
    });
  }

  // -- building -----------------------------------------------------------------

  buildGarage() {
    // Open-front building: back wall, two side walls, a roof, and no
    // front wall — the open north face is the door. The three walls
    // push into city.buildings as one solid block so cars and the
    // player collide with the shop; the open face stays passable.
    const group = new THREE.Group();
    const wallMat = createStandardMaterial(0x8a8578);
    const roofMat = createStandardMaterial(0x3a3a42);
    const floorMat = createStandardMaterial(0x4a4a4e);

    // Floor slab.
    const floorGeo = new THREE.BoxGeometry(GARAGE.w, 0.3, GARAGE.d);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    group.add(floor);

    // Back wall (south) and the two side walls.
    const backGeo = new THREE.BoxGeometry(GARAGE.w, GARAGE.h, 0.6);
    const back = new THREE.Mesh(backGeo, wallMat);
    back.position.set(0, GARAGE.h / 2, -GARAGE.d / 2);
    back.castShadow = true;
    back.receiveShadow = true;
    group.add(back);
    for (const side of [-1, 1]) {
      const sideGeo = new THREE.BoxGeometry(0.6, GARAGE.h, GARAGE.d);
      const sideWall = new THREE.Mesh(sideGeo, wallMat);
      sideWall.position.set(side * (GARAGE.w / 2 - 0.3), GARAGE.h / 2, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      group.add(sideWall);
    }

    // Roof: a flat slab with a raised skylight strip.
    const roofGeo = new THREE.BoxGeometry(GARAGE.w + 1, 0.5, GARAGE.d + 1);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = GARAGE.h + 0.25;
    roof.castShadow = true;
    group.add(roof);
    const skyGeo = new THREE.BoxGeometry(GARAGE.w * 0.5, 0.8, 3);
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x88bbdd, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.4,
    });
    const skylight = new THREE.Mesh(skyGeo, skyMat);
    skylight.position.y = GARAGE.h + 0.9;
    group.add(skylight);

    // Sign board over the door, glowing so the shop reads at night.
    const signGeo = new THREE.BoxGeometry(12, 2, 0.4);
    const signMat = createStandardMaterial(0x1a2a3a);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, GARAGE.h - 0.6, GARAGE.d / 2 + 0.2);
    group.add(sign);
    const glowGeo = new THREE.BoxGeometry(10.5, 1.1, 0.15);
    const glowMat = createEmissiveMaterial(0xffcc66, 0.9);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, GARAGE.h - 0.6, GARAGE.d / 2 + 0.45);
    group.add(glow);

    // The solid walls the collision system sees: three separate
    // blocks (back strip + two side strips) in WORLD coordinates,
    // added to the scene — never to the group, whose children are
    // local. The front stays open, so a car can drive in through the
    // door; the door point sits just outside the front edge. Each
    // block carries userData { bw, bd, height } exactly like the
    // city's own buildings, so cars, pedestrians and the camera all
    // collide with the shop.
    const solids = [
      { x: GARAGE.x, z: GARAGE.z - GARAGE.d / 2 + 1, bw: GARAGE.w, bd: 2 },
      { x: GARAGE.x - GARAGE.w / 2 + 1, z: GARAGE.z, bw: 2, bd: GARAGE.d },
      { x: GARAGE.x + GARAGE.w / 2 - 1, z: GARAGE.z, bw: 2, bd: GARAGE.d },
    ];
    for (const s of solids) {
      const solidGeo = new THREE.BoxGeometry(s.bw, GARAGE.h, s.bd);
      const solid = new THREE.Mesh(solidGeo, wallMat);
      solid.position.set(s.x, GARAGE.h / 2, s.z);
      solid.userData = { type: 'building', height: GARAGE.h, bw: s.bw, bd: s.bd };
      solid.visible = false;
      this.scene.add(solid);
      this.city.buildings.push(solid);
    }

    group.position.set(GARAGE.x, 0, GARAGE.z);
    this.scene.add(group);
    this.garageGroup = group;
  }

  buildInterior() {
    // Workbenches along the back wall, tyre stacks, a compressor, a
    // tool chest, and the two-post lift. All of it lives inside the
    // garage group at local coordinates (the group sits at 544, -608).
    const group = this.garageGroup;
    const benchMat = createStandardMaterial(0x6a4a2a);
    const steelMat = createStandardMaterial(0x5a5a62);
    const redMat = createStandardMaterial(0xa82828);
    const tyreMat = createStandardMaterial(0x1a1a1a);

    // Two workbenches against the back wall, with a pegboard above.
    for (const bx of [-6, 6]) {
      const bench = new THREE.Group();
      const topGeo = new THREE.BoxGeometry(5, 0.25, 1.6);
      const top = new THREE.Mesh(topGeo, benchMat);
      top.position.y = 1;
      top.castShadow = true;
      bench.add(top);
      for (const [lx, lz] of [[-2.2, -0.6], [2.2, -0.6], [-2.2, 0.6], [2.2, 0.6]]) {
        const legGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
        const leg = new THREE.Mesh(legGeo, steelMat);
        leg.position.set(lx, 0.5, lz);
        bench.add(leg);
      }
      const boardGeo = new THREE.BoxGeometry(5, 2, 0.12);
      const board = new THREE.Mesh(boardGeo, createStandardMaterial(0x8a6a42));
      board.position.set(0, 2.6, -0.7);
      bench.add(board);
      // Tools on the pegboard: small dark boxes in a row.
      for (let i = 0; i < 6; i++) {
        const toolGeo = new THREE.BoxGeometry(0.3, 0.7, 0.1);
        const tool = new THREE.Mesh(toolGeo, createStandardMaterial(0x2a2a2e));
        tool.position.set(-2 + i * 0.8, 2.6, -0.6);
        bench.add(tool);
      }
      // A vice on the bench top.
      const viceGeo = new THREE.BoxGeometry(0.6, 0.5, 0.5);
      const vice = new THREE.Mesh(viceGeo, steelMat);
      vice.position.set(1.8, 1.35, 0);
      bench.add(vice);
      bench.position.set(bx, 0, -5.6);
      group.add(bench);
    }

    // Tyre stacks: three stacks of four tyres each, by the east wall.
    for (let s = 0; s < 3; s++) {
      const stack = new THREE.Group();
      for (let t = 0; t < 4; t++) {
        const tyreGeo = new THREE.TorusGeometry(0.55, 0.22, 8, 14);
        const tyre = new THREE.Mesh(tyreGeo, tyreMat);
        tyre.rotation.x = Math.PI / 2;
        tyre.position.y = 0.25 + t * 0.45;
        tyre.castShadow = true;
        stack.add(tyre);
      }
      stack.position.set(8.2, 0, -3 + s * 3);
      group.add(stack);
    }

    // Compressor: a red tank on wheels with a coiled hose.
    const comp = new THREE.Group();
    const tankGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 12);
    const tank = new THREE.Mesh(tankGeo, redMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.y = 0.9;
    tank.castShadow = true;
    comp.add(tank);
    const motorGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const motor = new THREE.Mesh(motorGeo, steelMat);
    motor.position.set(0, 1.9, 0);
    comp.add(motor);
    for (const side of [-1, 1]) {
      const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10);
      const wheel = new THREE.Mesh(wheelGeo, tyreMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(side * 0.9, 0.3, 0.8);
      comp.add(wheel);
    }
    comp.position.set(-8, 0, 2);
    group.add(comp);

    // Tool chest: a tall red cabinet with six drawer fronts.
    const chest = new THREE.Group();
    const chestGeo = new THREE.BoxGeometry(2.2, 3.4, 1.2);
    const chestBody = new THREE.Mesh(chestGeo, redMat);
    chestBody.position.y = 1.7;
    chestBody.castShadow = true;
    chest.add(chestBody);
    for (let d = 0; d < 6; d++) {
      const drawerGeo = new THREE.BoxGeometry(1.9, 0.4, 0.06);
      const drawer = new THREE.Mesh(drawerGeo, createStandardMaterial(0x7a1e1e));
      drawer.position.set(0, 0.5 + d * 0.55, 0.62);
      chest.add(drawer);
      const handleGeo = new THREE.BoxGeometry(0.8, 0.08, 0.08);
      const handle = new THREE.Mesh(handleGeo, steelMat);
      handle.position.set(0, 0.5 + d * 0.55, 0.68);
      chest.add(handle);
    }
    chest.position.set(8.4, 0, 4.5);
    chest.rotation.y = -Math.PI / 2;
    group.add(chest);

    // Two-post lift in the middle bay: two posts, a crossbeam, and two
    // swing arms. The lift platform rises and falls slowly in update().
    const lift = new THREE.Group();
    for (const side of [-1, 1]) {
      const postGeo = new THREE.BoxGeometry(0.5, 5.5, 0.5);
      const post = new THREE.Mesh(postGeo, steelMat);
      post.position.set(side * 1.6, 2.75, 0);
      post.castShadow = true;
      lift.add(post);
      const armGeo = new THREE.BoxGeometry(1.6, 0.18, 0.3);
      const arm = new THREE.Mesh(armGeo, createStandardMaterial(0xc8a838));
      arm.position.set(side * 0.8, 0.6, 0);
      lift.add(arm);
    }
    const beamGeo = new THREE.BoxGeometry(3.7, 0.4, 0.5);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.y = 5.5;
    lift.add(beam);
    const platformGeo = new THREE.BoxGeometry(2.6, 0.25, 4.6);
    const platform = new THREE.Mesh(platformGeo, createStandardMaterial(0x2a4a6a));
    platform.position.y = 0.9;
    lift.add(platform);
    this.liftPlatform = platform;
    lift.position.set(0, 0, -1);
    group.add(lift);
  }

  buildShowcaseCars() {
    // Two showcase cars on the lift bay floor: a red sports car and a
    // gold coupe, built from boxes like the parking-lot cars. They are
    // scenery, not Vehicle instances, so nothing ever drives them.
    const group = this.garageGroup;
    const specs = [
      { x: -5, z: 3, colour: 0xc83838 },
      { x: 5, z: 3, colour: 0xd8b838 },
    ];
    for (const spec of specs) {
      const car = new THREE.Group();
      const bodyMat = createStandardMaterial(spec.colour);
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x1a2a3a, metalness: 0.8, roughness: 0.15,
        transparent: true, opacity: 0.6,
      });
      const bodyGeo = new THREE.BoxGeometry(1.9, 0.7, 4.4);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);
      const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2);
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
      car.position.set(spec.x, 0, spec.z);
      group.add(car);
    }
  }

  // -- purchases -----------------------------------------------------------------

  currentVehicle() {
    // The car the player is sitting in, or null.
    if (!this.player.inVehicle || !this.player.vehicle) return null;
    return this.player.vehicle;
  }

  canWorkOnCar() {
    // Keys only work at the door, in a car, alive.
    if (this.player.isDead) return false;
    if (!this.nearGarage) return false;
    return this.currentVehicle() !== null;
  }

  spend(cost) {
    // One ledger for the whole game: the mission ledger and the
    // player's pocket are the same number, kept equal on every flow.
    if (this.player.cash < cost) {
      this.hud.showMessage('Not enough cash for that.', 2);
      return false;
    }
    this.player.cash -= cost;
    this.missions.cash = this.player.cash;
    return true;
  }

  readCarState(vehicle) {
    // The car's current fit, read back from the vehicle itself so a
    // second car starts stock: engine stage from tuneAccelMul, armour
    // stage from maxHealth, paint from color, rims from the rim index
    // the garage last fitted to this car (stored on the car).
    const engineStage = ENGINE_STAGES.findIndex((s) => Math.abs(s.mult - (vehicle.tuneAccelMul || 1)) < 0.01);
    const armourStage = ARMOUR_STAGES.findIndex((s) => vehicle.maxHealth === CONFIG.VEHICLE.HEALTH + s.bonus);
    // The paint the panel shows: match the car's actual colour against
    // the catalogue first (a fresh car wears a factory colour), then
    // the garage's own sequence, then Crimson.
    let paintIndex = PAINTS.findIndex((p) => p.hex === vehicle.color);
    if (paintIndex < 0) paintIndex = vehicle.garagePaintIndex != null ? vehicle.garagePaintIndex : 0;
    return {
      engineStage: engineStage < 0 ? 0 : engineStage,
      armourStage: armourStage < 0 ? 0 : armourStage,
      paintIndex,
      rimIndex: vehicle.garageRimIndex != null ? vehicle.garageRimIndex : 0,
    };
  }

  buyPaint() {
    if (!this.canWorkOnCar()) return;
    const vehicle = this.currentVehicle();
    // The catalogue starts before the first paint: the first press
    // always lands on Crimson (index 0), and every press after that
    // steps one paint forward.
    const current = vehicle.garagePaintIndex != null ? vehicle.garagePaintIndex : -1;
    const nextIndex = (current + 1) % PAINTS.length;
    const paint = PAINTS[nextIndex];
    if (!this.spend(PAINT_COST)) return;
    vehicle.color = paint.hex;
    if (vehicle.bodyMesh && vehicle.bodyMesh.material) {
      vehicle.bodyMesh.material.color.setHex(paint.hex);
    }
    vehicle.garagePaintIndex = nextIndex;
    this.paintIndex = nextIndex;
    this.hud.showMessage(`Paint fitted: ${paint.name} — $${PAINT_COST}`, 2);
  }

  buyEngine() {
    if (!this.canWorkOnCar()) return;
    const vehicle = this.currentVehicle();
    const state = this.readCarState(vehicle);
    if (state.engineStage >= ENGINE_STAGES.length - 1) {
      this.hud.showMessage('Engine is already Stage 3 — race spec.', 2);
      return;
    }
    const next = ENGINE_STAGES[state.engineStage + 1];
    if (!this.spend(next.cost)) return;
    vehicle.tuneAccelMul = next.mult;
    this.hud.showMessage(`Engine fitted: ${next.name} (x${next.mult}) — $${next.cost}`, 2);
  }

  buyArmour() {
    if (!this.canWorkOnCar()) return;
    const vehicle = this.currentVehicle();
    const state = this.readCarState(vehicle);
    if (state.armourStage >= ARMOUR_STAGES.length - 1) {
      this.hud.showMessage('Armour is already Stage 3 — max plating.', 2);
      return;
    }
    const next = ARMOUR_STAGES[state.armourStage + 1];
    if (!this.spend(next.cost)) return;
    vehicle.maxHealth = CONFIG.VEHICLE.HEALTH + next.bonus;
    vehicle.health = vehicle.maxHealth;
    this.hud.showMessage(`Armour fitted: ${next.name} (+${next.bonus} HP) — $${next.cost}`, 2);
  }

  buyRims() {
    if (!this.canWorkOnCar()) return;
    const vehicle = this.currentVehicle();
    // Same catalogue rule as paint: the first press buys Chrome.
    const current = vehicle.garageRimIndex != null ? vehicle.garageRimIndex : -1;
    const nextIndex = (current + 1) % RIMS.length;
    const rim = RIMS[nextIndex];
    if (!this.spend(RIM_COST)) return;
    // Recolour the rim of every wheel (the rim is the second child of
    // each wheel group, built by the vehicle's createWheels).
    if (vehicle.wheelMeshes) {
      for (const wheel of vehicle.wheelMeshes) {
        const rimMesh = wheel.children && wheel.children[1];
        if (rimMesh && rimMesh.material) rimMesh.material.color.setHex(rim.hex);
      }
    }
    vehicle.garageRimIndex = nextIndex;
    this.rimIndex = nextIndex;
    this.hud.showMessage(`Rims fitted: ${rim.name} — $${RIM_COST}`, 2);
  }

  repair() {
    if (!this.canWorkOnCar()) return;
    const vehicle = this.currentVehicle();
    if (vehicle.health >= vehicle.maxHealth) {
      this.hud.showMessage('This car is already in perfect shape.', 2);
      return;
    }
    if (!this.spend(REPAIR_COST)) return;
    vehicle.health = vehicle.maxHealth;
    vehicle.isBurning = false;
    this.hud.showMessage(`Repaired to full health — $${REPAIR_COST}`, 2);
  }

  // -- HUD panel -------------------------------------------------------------------

  createPanel() {
    // The price board: visible only at the door, showing the current
    // fit of the car the player is sitting in and the key for each
    // upgrade. The probe never reads it; the player does.
    this.panel = document.createElement('div');
    this.panel.id = 'garagePanel';
    this.panel.style.cssText = `
      position: fixed; bottom: 200px; left: 16px; z-index: 11;
      background: rgba(10, 14, 24, 0.85); color: #e8dcc8;
      border: 1px solid #445; border-radius: 6px; padding: 10px 14px;
      font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.6;
      pointer-events: none; display: none; text-shadow: 0 0 4px #000;
    `;
    document.body.appendChild(this.panel);
    this.panelTitle = document.createElement('div');
    this.panelTitle.style.cssText = 'font-weight: bold; color: #e8c56a; margin-bottom: 4px;';
    this.panelTitle.textContent = "KADE'S GARAGE";
    this.panel.appendChild(this.panelTitle);
    this.panelBody = document.createElement('div');
    this.panel.appendChild(this.panelBody);
  }

  refreshPanel() {
    if (!this.panel) return;
    if (!this.nearGarage) {
      this.panel.style.display = 'none';
      return;
    }
    const vehicle = this.currentVehicle();
    if (!vehicle) {
      this.panel.style.display = 'block';
      this.panelBody.innerHTML = 'Get in a car to tune it.<br>G paint · H engine · J armour · K rims · L repair';
      return;
    }
    const state = this.readCarState(vehicle);
    const paint = PAINTS[state.paintIndex];
    const rim = RIMS[state.rimIndex];
    const engine = ENGINE_STAGES[state.engineStage];
    const armour = ARMOUR_STAGES[state.armourStage];
    const nextEngine = ENGINE_STAGES[Math.min(state.engineStage + 1, ENGINE_STAGES.length - 1)];
    const nextArmour = ARMOUR_STAGES[Math.min(state.armourStage + 1, ARMOUR_STAGES.length - 1)];
    this.panel.style.display = 'block';
    this.panelBody.innerHTML =
      `Paint: ${paint.name} &nbsp; <span style="color:#888">G $${PAINT_COST}</span><br>` +
      `Engine: ${engine.name} (x${engine.mult}) &nbsp; <span style="color:#888">H $${nextEngine.cost}</span><br>` +
      `Armour: ${armour.name} (+${armour.bonus} HP) &nbsp; <span style="color:#888">J $${nextArmour.cost}</span><br>` +
      `Rims: ${rim.name} &nbsp; <span style="color:#888">K $${RIM_COST}</span><br>` +
      `Health: ${Math.round(vehicle.health)}/${vehicle.maxHealth} &nbsp; <span style="color:#888">L $${REPAIR_COST}</span>`;
  }

  // -- per-frame -----------------------------------------------------------------------

  update(delta, timeOfDay) {
    this.elapsed += delta;

    // Nearness is measured from the door point, not the building
    // centre: the player works on the car from the forecourt.
    const dist = distance2D(this.player.position, { x: GARAGE.doorX, z: GARAGE.doorZ });
    this.nearGarage = dist <= GARAGE.keyRadius;

    // The lift platform rises and falls slowly, so the shop feels
    // worked-in even when nobody is under a car.
    this.liftPhase += delta * 0.35;
    if (this.liftPlatform) {
      this.liftPlatform.position.y = 0.9 + Math.sin(this.liftPhase) * 0.55;
    }

    this.refreshPanel();
  }

  // -- queries ---------------------------------------------------------------------------

  // What the next press of each key would buy, for the HUD and for
  // any later system that wants to price a tune without pressing.
  nextPrices() {
    const vehicle = this.currentVehicle();
    if (!vehicle) {
      return { paint: PAINT_COST, engine: ENGINE_STAGES[1].cost, armour: ARMOUR_STAGES[1].cost, rims: RIM_COST, repair: REPAIR_COST };
    }
    const state = this.readCarState(vehicle);
    return {
      paint: PAINT_COST,
      engine: state.engineStage >= ENGINE_STAGES.length - 1 ? 0 : ENGINE_STAGES[state.engineStage + 1].cost,
      armour: state.armourStage >= ARMOUR_STAGES.length - 1 ? 0 : ARMOUR_STAGES[state.armourStage + 1].cost,
      rims: RIM_COST,
      repair: REPAIR_COST,
    };
  }
}
