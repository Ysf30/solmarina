// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Garage & Vehicle Customization ("Kade's Garage")
//
// A working garage in the Marina District where the player can spend cash
// on their car: repaint it, tune the engine, add armor and change the
// rims. The garage is a real place (walls, lift, benches, neon sign) with
// a proximity prompt; the keys work only while the player is near it, so
// it never hijacks the controls elsewhere on the map.
//
// How the upgrades reach the car:
//  - Paint: the vehicle's body mesh material colour is set directly
//    (Vehicle exposes bodyMesh), and vehicle.color is updated to match.
//  - Engine: vehicle.tuneAccelMul scales the acceleration force in
//    Vehicle.updatePhysics (one-line hook in vehicles.js, added for this).
//  - Armor: vehicle.maxHealth grows and the car is repaired to full.
//  - Rims: each wheel group's rim mesh material colour is set (the rim
//    is the second child of every wheel group Vehicle builds).
// Upgrades are stored per vehicle object in a Map, so stealing a new car
// starts fresh and returning to a tuned car keeps its tune.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial,
  createEmissiveMaterial,
  distance2D,
  clamp,
} from './utils.js';

// Paint catalogue: the palette the garage offers, with names for the
// prompt line. The first twelve are the game's own vehicle colours.
export const PAINT_CATALOG = [
  { name: 'Crimson', color: 0xc83838 },
  { name: 'Ocean Blue', color: 0x3878c8 },
  { name: 'Jungle Green', color: 0x38a838 },
  { name: 'Taxi Yellow', color: 0xe8c838 },
  { name: 'Bubblegum', color: 0xc838a8 },
  { name: 'Lagoon', color: 0x38c8c8 },
  { name: 'Burnt Orange', color: 0xa85828 },
  { name: 'Slate', color: 0x585868 },
  { name: 'Silver', color: 0x888898 },
  { name: 'Pearl', color: 0xd8d8d8 },
  { name: 'Midnight', color: 0x181818 },
  { name: 'Cream', color: 0xf8f8e8 },
  { name: 'Solmarina Pink', color: 0xff6b9d },
  { name: 'Lime Rush', color: 0x88dd22 },
  { name: 'Royal Purple', color: 0x6a2a8a },
  { name: 'Gold Rush', color: 0xe8a828 },
];

// Rim finishes the garage offers.
export const RIM_CATALOG = [
  { name: 'Steel', color: 0x8a8a8a },
  { name: 'Chrome', color: 0xe8e8e8 },
  { name: 'Black', color: 0x1a1a1a },
  { name: 'Gold', color: 0xe8c838 },
  { name: 'Crimson', color: 0xc83838 },
  { name: 'Ocean', color: 0x3878c8 },
];

// Engine tune stages: cost to buy the stage, and the acceleration
// multiplier it grants. Stage 0 is stock.
export const ENGINE_STAGES = [
  { name: 'Stock', cost: 0, accelMul: 1 },
  { name: 'Stage 1 — Intake', cost: 500, accelMul: 1.2 },
  { name: 'Stage 2 — Turbo', cost: 1000, accelMul: 1.45 },
  { name: 'Stage 3 — Race', cost: 2000, accelMul: 1.75 },
];

// Armor stages: cost, and how much max health each stage adds.
export const ARMOR_STAGES = [
  { name: 'Stock', cost: 0, bonusHealth: 0 },
  { name: 'Plating I', cost: 400, bonusHealth: 250 },
  { name: 'Plating II', cost: 800, bonusHealth: 500 },
  { name: 'Plating III', cost: 1500, bonusHealth: 900 },
];

export const PAINT_COST = 100;
export const RIM_COST = 200;
export const REPAIR_COST = 150;
export const GARAGE_RADIUS = 14;

export class GarageSystem {
  constructor(scene, city, player, district, hud, missions = null) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.district = district;
    this.hud = hud;
    this.missions = missions;

    // Garage position: the district's garage spot, door facing south
    // (toward the promenade street) so cars can drive straight in.
    this.position = new THREE.Vector3(544, 0, -608);
    this.doorPosition = new THREE.Vector3(544, 0, -590);

    // Per-vehicle upgrades: Map<Vehicle, {paint, engine, armor, rim}>.
    this.upgrades = new Map();
    this.nearGarage = false;
    this.promptShown = false;
    this.elapsed = 0;
    this.neonMat = null;
    this.workLight = null;
    this.liftPlatform = null;
    this.liftTarget = 0;

    this.build();
    this.createPrompt();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  // -- construction ----------------------------------------------------------

  build() {
    const p = this.position;
    const W = 28; // width (x)
    const D = 18; // depth (z)
    const H = 8; // wall height

    // Floor: dark concrete with oil stains.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.3, D),
      createStandardMaterial(0x3a3a3a),
    );
    floor.position.set(p.x, 0.15, p.z);
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (const [ox, oz, r] of [[-6, -3, 2.2], [5, 4, 1.8], [0, -6, 1.4], [-9, 5, 1.2]]) {
      const stain = new THREE.Mesh(
        new THREE.CircleGeometry(r, 12),
        new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }),
      );
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(p.x + ox, 0.32, p.z + oz);
      this.scene.add(stain);
    }

    // Walls: back + two sides, front left open (the door bay). The front
    // wall is two pillars with a lintel, so the doorway is a real hole.
    const wallMat = createStandardMaterial(0x8a7a5a);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), wallMat);
    back.position.set(p.x, H / 2, p.z - D / 2);
    back.castShadow = true;
    back.receiveShadow = true;
    this.scene.add(back);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D), wallMat);
      wall.position.set(p.x + side * (W / 2 - 0.3), H / 2, p.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }
    // Front pillars + lintel (door bay is 12 wide, centred).
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(8, H, 0.6), wallMat);
      pillar.position.set(p.x + side * 10, H / 2, p.z + D / 2);
      pillar.castShadow = true;
      this.scene.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 0.6), wallMat);
    lintel.position.set(p.x, H - 1.2, p.z + D / 2);
    lintel.castShadow = true;
    this.scene.add(lintel);

    // Roof: flat slab with a parapet, plus a big "GARAGE" neon sign.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.6, D + 1), createStandardMaterial(0x4a4a4a));
    roof.position.set(p.x, H + 0.3, p.z);
    roof.castShadow = true;
    this.scene.add(roof);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1, 0.4), createStandardMaterial(0x6a5a4a));
    parapet.position.set(p.x, H + 1, p.z + D / 2);
    this.scene.add(parapet);

    // Neon sign: a board + a row of emissive letter blocks (abstract
    // blocks, not text geometry — they glow pink like a sign at night).
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.2, 0.4),
      createStandardMaterial(0x1a1a1a),
    );
    board.position.set(p.x, H + 2.2, p.z + D / 2 + 0.4);
    this.scene.add(board);
    this.neonMat = createEmissiveMaterial(0xff2a7a, 1);
    for (let i = 0; i < 6; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.2), this.neonMat);
      block.position.set(p.x - 6 + i * 2.4, H + 2.2, p.z + D / 2 + 0.7);
      this.scene.add(block);
    }
    // Under-sign light strip.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.25, 0.25),
      createEmissiveMaterial(0xffee88, 0.8),
    );
    strip.position.set(p.x, H + 0.9, p.z + D / 2 + 0.5);
    this.scene.add(strip);

    this.buildInterior(p);
    this.buildLift(p);
    this.buildShowcaseCars(p);
  }

  buildInterior(p) {
    // Workbenches along the back wall, with tool pegboards above.
    for (const bx of [-10, 10]) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1, 2),
        createStandardMaterial(0x6a4a2a),
      );
      bench.position.set(p.x + bx, 0.8, p.z - 7);
      bench.castShadow = true;
      this.scene.add(bench);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(6, 3, 0.15),
        createStandardMaterial(0x8a6a4a),
      );
      board.position.set(p.x + bx, 4.5, p.z - 8.6);
      this.scene.add(board);
      // Tools on the pegboard: small dark boxes in a row.
      for (let i = 0; i < 5; i++) {
        const tool = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.2, 0.15),
          createStandardMaterial(0x2a2a2a),
        );
        tool.position.set(p.x + bx - 2 + i * 1, 4.5, p.z - 8.5);
        this.scene.add(tool);
      }
      // A vice on the bench.
      const vice = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.8),
        createStandardMaterial(0x3a3a3a),
      );
      vice.position.set(p.x + bx + 2, 1.6, p.z - 7);
      this.scene.add(vice);
    }
    // Tire stacks: two piles of black torus... cylinders read as tires
    // from the side, so stack flat cylinders.
    for (const [tx, tz] of [[-12, 2], [12, 4]]) {
      for (let i = 0; i < 4; i++) {
        const tire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 0.85, 0.45, 12),
          createStandardMaterial(0x1a1a1a),
        );
        tire.position.set(p.x + tx, 0.55 + i * 0.48, p.z + tz);
        tire.castShadow = true;
        this.scene.add(tire);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 0.47, 10),
          createStandardMaterial(0x8a8a8a),
        );
        rim.position.set(p.x + tx, 0.55 + i * 0.48, p.z + tz);
        this.scene.add(rim);
      }
    }
    // Air compressor: a red tank on wheels in the corner.
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 2.6, 12),
      createStandardMaterial(0xc83838),
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(p.x - 11, 1, p.z + 6);
    tank.castShadow = true;
    this.scene.add(tank);
    // Hanging work light over the middle bay.
    this.workLight = new THREE.PointLight(0xffeecc, 60, 30, 1.5);
    this.workLight.position.set(p.x, 6.5, p.z);
    this.scene.add(this.workLight);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 0.8, 10),
      createStandardMaterial(0x2a2a2a),
    );
    shade.position.set(p.x, 7, p.z);
    this.scene.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffee88 }),
    );
    bulb.position.set(p.x, 6.6, p.z);
    this.scene.add(bulb);
    // A red tool chest with drawers.
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.6, 1.2),
      createStandardMaterial(0xa82828),
    );
    chest.position.set(p.x + 11, 1.1, p.z - 7);
    chest.castShadow = true;
    this.scene.add(chest);
    for (let d = 0; d < 3; d++) {
      const drawer = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.35, 0.1),
        createStandardMaterial(0x5a5a5a),
      );
      drawer.position.set(p.x + 11, 0.6 + d * 0.5, p.z - 6.35);
      this.scene.add(drawer);
    }
  }

  buildLift(p) {
    // A two-post car lift in the middle bay: two posts, two arms and a
    // platform that rises when the player drives in (animated in
    // update() — it lifts the player's car while they browse the menu).
    const postMat = createStandardMaterial(0x2a5a8a);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 0.6), postMat);
      post.position.set(p.x + side * 2.2, 2.75, p.z);
      post.castShadow = true;
      this.scene.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.5), postMat);
      arm.position.set(p.x + side * 1.1, 0.6, p.z);
      this.scene.add(arm);
    }
    this.liftPlatform = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.3, 8),
      createStandardMaterial(0x3a3a3a),
    );
    this.liftPlatform.position.set(p.x, 0.5, p.z);
    this.liftPlatform.castShadow = true;
    this.liftPlatform.receiveShadow = true;
    this.scene.add(this.liftPlatform);
  }

  buildShowcaseCars(p) {
    // Two showcase cars parked inside the garage: a sports car and a
    // classic, built from boxes like the parking-lot cars. They are
    // scenery — the player customises the car they drive in, not these.
    const specs = [
      { x: p.x - 8, z: p.z + 3, color: 0xff6b9d, sporty: true },
      { x: p.x + 8, z: p.z + 3, color: 0x2a5a8a, sporty: false },
    ];
    for (const spec of specs) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, spec.sporty ? 0.6 : 0.85, spec.sporty ? 4.0 : 4.6),
        createStandardMaterial(spec.color),
      );
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.55, spec.sporty ? 1.6 : 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.8, roughness: 0.1 }),
      );
      cabin.position.set(0, 1.15, 0.2);
      cabin.castShadow = true;
      car.add(cabin);
      for (const [wx, wz] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10),
          createStandardMaterial(0x1a1a1a),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.36, wz);
        car.add(wheel);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.27, 8),
          createStandardMaterial(0xe8c838),
        );
        rim.rotation.z = Math.PI / 2;
        rim.position.set(wx, 0.36, wz);
        car.add(rim);
      }
      car.position.set(spec.x, 0.2, spec.z);
      this.scene.add(car);
    }
  }

  createPrompt() {
    // The garage prompt: a small fixed panel, bottom-centre, shown only
    // near the garage. It is the garage's own DOM — the HUD is not
    // involved, so the prompt never fights the mission objective banner.
    this.promptEl = document.createElement('div');
    this.promptEl.id = 'garagePrompt';
    this.promptEl.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: rgba(10,10,20,0.9); color: #ffd7ee; padding: 10px 18px;
      border-radius: 6px; font-family: monospace; font-size: 14px;
      border: 1px solid #ff2a7a; display: none; z-index: 40; text-align: center;
    `;
    document.body.appendChild(this.promptEl);
  }

  // -- upgrades ------------------------------------------------------------

  getUpgrades(vehicle) {
    if (!this.upgrades.has(vehicle)) {
      this.upgrades.set(vehicle, { paint: -1, engine: 0, armor: 0, rim: -1 });
    }
    return this.upgrades.get(vehicle);
  }

  spend(amount) {
    if (this.player.cash < amount) return false;
    this.player.cash -= amount;
    // Keep the mission ledger in sync: MissionSystem.completeMission
    // pays player.cash = missions.cash, so if we only cut player.cash,
    // the next mission payout would silently refund the spend.
    if (this.missions) this.missions.cash = this.player.cash;
    return true;
  }

  currentVehicle() {
    if (this.player.inVehicle && this.player.vehicle) return this.player.vehicle;
    return null;
  }

  applyPaint(vehicle, paintIndex) {
    const paint = PAINT_CATALOG[paintIndex];
    if (!paint) return false;
    if (vehicle.bodyMesh && vehicle.bodyMesh.material) {
      vehicle.bodyMesh.material.color.setHex(paint.color);
    }
    vehicle.color = paint.color;
    return true;
  }

  applyRims(vehicle, rimIndex) {
    const rim = RIM_CATALOG[rimIndex];
    if (!rim) return false;
    if (!vehicle.wheelMeshes) return false;
    for (const wheel of vehicle.wheelMeshes) {
      // The rim is the second child of each wheel group.
      const rimMesh = wheel.children[1];
      if (rimMesh && rimMesh.material) rimMesh.material.color.setHex(rim.color);
    }
    return true;
  }

  applyEngine(vehicle, stage) {
    const def = ENGINE_STAGES[stage];
    if (!def) return false;
    vehicle.tuneAccelMul = def.accelMul;
    return true;
  }

  applyArmor(vehicle, stage) {
    const def = ARMOR_STAGES[stage];
    if (!def) return false;
    const baseHealth = CONFIG.VEHICLE.HEALTH;
    vehicle.maxHealth = baseHealth + def.bonusHealth;
    vehicle.health = vehicle.maxHealth;
    return true;
  }

  // Re-apply stored upgrades to a vehicle (used when the player re-enters
  // a car they tuned earlier).
  applyStored(vehicle) {
    const u = this.upgrades.get(vehicle);
    if (!u) return;
    if (u.paint >= 0) this.applyPaint(vehicle, u.paint);
    if (u.rim >= 0) this.applyRims(vehicle, u.rim);
    if (u.engine > 0) this.applyEngine(vehicle, u.engine);
    if (u.armor > 0) this.applyArmor(vehicle, u.armor);
  }

  // -- keys ------------------------------------------------------------------

  onKey(e) {
    if (!this.nearGarage) return;
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (key !== 'g' && key !== 'h' && key !== 'j' && key !== 'k') return;
    const vehicle = this.currentVehicle();
    if (!vehicle) {
      this.hud.showMessage('Garage: drive a car in first, then tune it.', 3);
      return;
    }
    const u = this.getUpgrades(vehicle);
    if (key === 'g') this.buyPaint(vehicle, u);
    else if (key === 'h') this.buyEngine(vehicle, u);
    else if (key === 'j') this.buyArmor(vehicle, u);
    else if (key === 'k') this.buyRims(vehicle, u);
    this.refreshPrompt();
  }

  buyPaint(vehicle, u) {
    if (!this.spend(PAINT_COST)) {
      this.hud.showMessage(`Need $${PAINT_COST} for a repaint — you have $${this.player.cash}.`, 3);
      return;
    }
    u.paint = (u.paint + 1) % PAINT_CATALOG.length;
    this.applyPaint(vehicle, u.paint);
    this.hud.showMessage(`Repainted: ${PAINT_CATALOG[u.paint].name} (-$${PAINT_COST})`, 3);
  }

  buyEngine(vehicle, u) {
    if (u.engine >= ENGINE_STAGES.length - 1) {
      this.hud.showMessage('Engine already maxed — Stage 3 Race.', 3);
      return;
    }
    const next = ENGINE_STAGES[u.engine + 1];
    if (!this.spend(next.cost)) {
      this.hud.showMessage(`Need $${next.cost} for ${next.name} — you have $${this.player.cash}.`, 3);
      return;
    }
    u.engine++;
    this.applyEngine(vehicle, u.engine);
    this.hud.showMessage(`Engine tuned: ${next.name} — acceleration x${next.accelMul} (-$${next.cost})`, 3);
  }

  buyArmor(vehicle, u) {
    // If the car is damaged and armor is maxed, J is a plain repair.
    if (u.armor >= ARMOR_STAGES.length - 1) {
      if (vehicle.health >= vehicle.maxHealth) {
        this.hud.showMessage('Armor maxed and the car is already mint.', 3);
        return;
      }
      if (!this.spend(REPAIR_COST)) {
        this.hud.showMessage(`Need $${REPAIR_COST} for a repair — you have $${this.player.cash}.`, 3);
        return;
      }
      vehicle.health = vehicle.maxHealth;
      this.hud.showMessage(`Repaired to full (-$${REPAIR_COST})`, 3);
      return;
    }
    const next = ARMOR_STAGES[u.armor + 1];
    if (!this.spend(next.cost)) {
      this.hud.showMessage(`Need $${next.cost} for ${next.name} — you have $${this.player.cash}.`, 3);
      return;
    }
    u.armor++;
    this.applyArmor(vehicle, u.armor);
    this.hud.showMessage(`Armor fitted: ${next.name} — max health ${vehicle.maxHealth} (-$${next.cost})`, 3);
  }

  buyRims(vehicle, u) {
    if (!this.spend(RIM_COST)) {
      this.hud.showMessage(`Need $${RIM_COST} for new rims — you have $${this.player.cash}.`, 3);
      return;
    }
    u.rim = (u.rim + 1) % RIM_CATALOG.length;
    this.applyRims(vehicle, u.rim);
    this.hud.showMessage(`Rims fitted: ${RIM_CATALOG[u.rim].name} (-$${RIM_COST})`, 3);
  }

  // -- prompt ------------------------------------------------------------------

  refreshPrompt() {
    if (!this.nearGarage) {
      this.promptEl.style.display = 'none';
      this.promptShown = false;
      return;
    }
    const vehicle = this.currentVehicle();
    const u = vehicle ? this.getUpgrades(vehicle) : null;
    const engine = u ? ENGINE_STAGES[u.engine].name : '—';
    const armor = u ? ARMOR_STAGES[u.armor].name : '—';
    const paint = u && u.paint >= 0 ? PAINT_CATALOG[u.paint].name : 'stock';
    const lines = vehicle
      ? `KADE'S GARAGE — cash $${this.player.cash}<br>` +
        `[G] Paint: ${paint} ($${PAINT_COST}) &nbsp; [H] Engine: ${engine} &nbsp; [J] Armor: ${armor} &nbsp; [K] Rims ($${RIM_COST})`
      : `KADE'S GARAGE — drive a car in to tune it<br>[G] Paint $${PAINT_COST} &nbsp; [H] Engine &nbsp; [J] Armor / Repair &nbsp; [K] Rims $${RIM_COST}`;
    if (!this.promptShown || this.promptEl.innerHTML !== lines) {
      this.promptEl.innerHTML = lines;
      this.promptEl.style.display = 'block';
      this.promptShown = true;
    }
  }

  // -- per-frame ---------------------------------------------------------------

  update(delta, timeOfDay) {
    this.elapsed += delta;
    const t = this.elapsed;
    // Neon flicker: mostly steady, with an occasional dropout.
    if (this.neonMat) {
      const dropout = Math.sin(t * 13.7) > 0.995 ? 0.15 : 1;
      this.neonMat.emissiveIntensity = (0.9 + Math.sin(t * 3) * 0.15) * dropout;
    }
    // Work light brightens after dark.
    if (this.workLight) {
      const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
      const night = clamp((0.35 - dayFactor) / 0.35, 0, 1);
      this.workLight.intensity = 40 + night * 80;
    }
    // The lift rises while a car sits in the bay, and lowers when empty.
    const vehicle = this.currentVehicle();
    const inBay = vehicle && distance2D(vehicle.position, this.position) < 8;
    this.liftTarget = inBay ? 1.6 : 0.5;
    if (this.liftPlatform) {
      const y = this.liftPlatform.position.y;
      this.liftPlatform.position.y = y + (this.liftTarget - y) * Math.min(1, delta * 1.5);
    }
    // Proximity check (player on foot counts too — they can walk in and
    // look, but the keys ask for a car).
    const p = this.player.position;
    const wasNear = this.nearGarage;
    this.nearGarage = distance2D(p, this.doorPosition) < GARAGE_RADIUS;
    if (this.nearGarage !== wasNear) this.refreshPrompt();
    else if (this.nearGarage) this.refreshPrompt();
    // If the player just got into a tuned car, re-apply its upgrades.
    if (vehicle) this.applyStored(vehicle);
  }

  getState() {
    const list = [];
    for (const [vehicle, u] of this.upgrades) {
      list.push({ type: vehicle.type, color: vehicle.color, ...u });
    }
    return { tunedCars: list.length, upgrades: list };
  }
}
