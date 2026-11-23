// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Hidden Packages ("The Smuggler's Dozen x Ten")
//
// A GTA-style collectible hunt: 100 glowing packages hidden across the
// whole map — on rooftops' edges, under piers, behind beach bars, in
// alley mouths, on the lighthouse steps, in the marina pool shallows.
// Each package pays $250 on pickup; completing a whole area set pays a
// $2,000 bonus; milestones at 10 / 25 / 50 / 100 pay more. A small badge
// (the system's own DOM, top-right under the timer) tracks progress and
// always shows the hint for the nearest uncollected package, so the hunt
// is completable without a guide.
//
// 60 packages are hand-placed at named landmarks (the table below is the
// content of the hunt). 40 more are dealt procedurally from the city's
// street nodes at build time, seeded, so every player hunts the same 100.
// Packages are never despawned; the system persists its collected ids in
// getState()/setState() for the save system to pick up.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial,
  createEmissiveMaterial,
  distance2D,
  createRandom,
} from './utils.js';

// One package: [x, z, area, name, hint]. Areas group the packages into
// sets of ten; the name is shown on pickup, the hint is shown in the
// badge when it is the nearest one left.
export const HAND_PLACED_PACKAGES = [
  // Downtown set (10): the city centre around the spawn.
  { x: 32, z: 96, area: 'Downtown', name: 'Spawn Alley Stash', hint: 'In the alley mouth just north of where you woke up.' },
  { x: -96, z: 32, area: 'Downtown', name: 'Crossroads Cache', hint: 'West of the spawn, where two main streets cross.' },
  { x: 128, z: -64, area: 'Downtown', name: 'Bank Steps Bundle', hint: 'On the steps of the tall building north-east of the spawn.' },
  { x: -128, z: -128, area: 'Downtown', name: 'Plaza Pigeon Drop', hint: 'In the open plaza north-west of the spawn.' },
  { x: 192, z: 128, area: 'Downtown', name: 'Cafe Awning Pack', hint: 'Tucked under an awning two blocks east of the spawn.' },
  { x: -192, z: 192, area: 'Downtown', name: 'Park Bench Wrap', hint: 'Behind a bench in the little park south-west.' },
  { x: 64, z: -192, area: 'Downtown', name: 'Garage Side Door', hint: 'By the side door of a garage on the north road.' },
  { x: -64, z: 256, area: 'Downtown', name: 'Bus Stop Bundle', hint: 'At a bus stop on the south main street.' },
  { x: 256, z: -192, area: 'Downtown', name: 'Rooftop Edge (Low)', hint: 'On a low rooftop edge you can reach from the street.' },
  { x: -256, z: -64, area: 'Downtown', name: 'Laundromat Back', hint: 'Behind the laundromat on the west road.' },
  // Marina set (10): the new district — the richest hunting ground.
  { x: 672, z: -700, area: 'Marina', name: 'Yacht Club Terrace', hint: 'On the yacht club terrace, under a table umbrella.' },
  { x: 858, z: -858, area: 'Marina', name: 'Pier Head Prize', hint: 'At the very end of the pier, past the PIER 9 sign.' },
  { x: 880, z: -866, area: 'Marina', name: 'Lighthouse Steps', hint: 'On the steps of the lighthouse, sea side.' },
  { x: 608, z: -540, area: 'Marina', name: 'Beach Bar Bottle', hint: 'Behind the beach bar counter, with the bottles.' },
  { x: 740, z: -760, area: 'Marina', name: 'Yacht Deck Drop', hint: 'On the deck of a moored yacht in the pool.' },
  { x: 700, z: -720, area: 'Marina', name: 'Buoy Line Bundle', hint: 'Floating by the first red buoy in the channel.' },
  { x: 480, z: -600, area: 'Marina', name: 'Parking Lot Corner', hint: 'In the far corner of the marina parking lot.' },
  { x: 544, z: -600, area: 'Marina', name: 'Garage Workbench', hint: 'On the workbench inside Kade\'s Garage.' },
  { x: 650, z: -626, area: 'Marina', name: 'Boardwalk Bench', hint: 'Under a bench on the promenade boardwalk.' },
  { x: 800, z: -672, area: 'Marina', name: 'Condo Lobby', hint: 'In the lobby canopy of the Palms Residence tower.' },
  // Beach set (10): the sand ring around the map.
  { x: 820, z: 420, area: 'Beach', name: 'East Beach Umbrella', hint: 'Under a striped umbrella on the east beach.' },
  { x: -820, z: 420, area: 'Beach', name: 'West Beach Towel', hint: 'On a towel on the west beach, near the palms.' },
  { x: 420, z: 820, area: 'Beach', name: 'South Cove Cache', hint: 'In a cove on the south beach, between two rocks.' },
  { x: -420, z: -820, area: 'Beach', name: 'North Shore Wrap', hint: 'Half-buried in the sand on the north shore.' },
  { x: 900, z: -200, area: 'Beach', name: 'Dune Grass Drop', hint: 'In the dune grass on the far east beach.' },
  { x: -900, z: -200, area: 'Beach', name: 'Tide Line Bundle', hint: 'On the tide line of the far west beach.' },
  { x: 200, z: 900, area: 'Beach', name: 'South Pier Post', hint: 'By a post on the south beach, where the sand meets the road.' },
  { x: -200, z: 900, area: 'Beach', name: 'Lifeguard Stand', hint: 'Under the lifeguard stand on the south beach.' },
  { x: 760, z: 760, area: 'Beach', name: 'South-East Rock', hint: 'Behind a rock on the south-east beach.' },
  { x: -760, z: 760, area: 'Beach', name: 'South-West Shell', hint: 'In a shell bed on the south-west beach.' },
  // Old Town set (10): the south-west quarter.
  { x: -320, z: 320, area: 'Old Town', name: 'Safehouse Step', hint: 'On the step of the Old Town safehouse.' },
  { x: -380, z: -320, area: 'Old Town', name: 'Dropoff Alley', hint: 'In the alley by the package dropoff.' },
  { x: -448, z: 128, area: 'Old Town', name: 'Church Gate', hint: 'By the gate of the old church.' },
  { x: -512, z: -192, area: 'Old Town', name: 'Market Stall', hint: 'Under a market stall on the west road.' },
  { x: -256, z: 448, area: 'Old Town', name: 'Canal Bridge', hint: 'On the canal bridge, south side.' },
  { x: -448, z: 448, area: 'Old Town', name: 'Tavern Cellar', hint: 'By the tavern cellar door.' },
  { x: -576, z: 64, area: 'Old Town', name: 'Cobble Corner', hint: 'In a cobbled corner near the west edge.' },
  { x: -320, z: 576, area: 'Old Town', name: 'Bakery Back', hint: 'Behind the bakery on the south road.' },
  { x: -192, z: 384, area: 'Old Town', name: 'Fountain Rim', hint: 'On the rim of the dry fountain.' },
  { x: -512, z: 320, area: 'Old Town', name: 'Watchtower Base', hint: 'At the base of the old watchtower.' },
  // Docks set (10): the industrial south-east.
  { x: 320, z: -380, area: 'Docks', name: 'Warehouse Door', hint: 'By the warehouse door on 3rd and Canal.' },
  { x: 448, z: -320, area: 'Docks', name: 'Container Gap', hint: 'In the gap between two containers.' },
  { x: 512, z: -448, area: 'Docks', name: 'Crane Base', hint: 'At the base of the dock crane.' },
  { x: 384, z: -512, area: 'Docks', name: 'Fuel Drum', hint: 'Behind a fuel drum on the dock road.' },
  { x: 576, z: -256, area: 'Docks', name: 'Net Loft', hint: 'In the net loft above the dock office.' },
  { x: 320, z: -576, area: 'Docks', name: 'Mooring Post', hint: 'Tied to a mooring post at the dock edge.' },
  { x: 448, z: -576, area: 'Docks', name: 'Fish Crate', hint: 'Inside a fish crate on the dock.' },
  { x: 640, z: -384, area: 'Docks', name: 'Customs Shed', hint: 'Behind the customs shed.' },
  { x: 256, z: -448, area: 'Docks', name: 'Turf Corner', hint: 'In the turf-war corner of the docks.' },
  { x: 576, z: -512, area: 'Docks', name: 'Harbor Office', hint: 'On the harbor office windowsill.' },
  // Hills set (10): the far north and east edges.
  { x: 768, z: 768, area: 'Hills', name: 'Overlook Bench', hint: 'On the overlook bench with the city view.' },
  { x: -768, z: 768, area: 'Hills', name: 'West Ridge', hint: 'On the west ridge, above the beach.' },
  { x: 768, z: -768, area: 'Hills', name: 'North Ridge', hint: 'On the north ridge near the marina.' },
  { x: -768, z: -768, area: 'Hills', name: 'Far Corner', hint: 'In the far north-west corner of the map.' },
  { x: 896, z: 0, area: 'Hills', name: 'East Edge', hint: 'At the very east edge, where the road ends.' },
  { x: -896, z: 0, area: 'Hills', name: 'West Edge', hint: 'At the very west edge, where the road ends.' },
  { x: 0, z: 896, area: 'Hills', name: 'South Edge', hint: 'At the very south edge, where the road ends.' },
  { x: 0, z: -896, area: 'Hills', name: 'North Edge', hint: 'At the very north edge, where the road ends.' },
  { x: 640, z: 640, area: 'Hills', name: 'Hilltop Palm', hint: 'Under the lone palm on the south-east hill.' },
  { x: -640, z: 640, area: 'Hills', name: 'Hilltop Rock', hint: 'Behind the rock on the south-west hill.' },
];

// Area sets: name, size, and the bonus for completing the set.
export const PACKAGE_SETS = [
  { area: 'Downtown', size: 10, bonus: 2000, line: 'Downtown swept clean! The centre is yours.' },
  { area: 'Marina', size: 10, bonus: 2000, line: 'Marina swept clean! Delia is impressed.' },
  { area: 'Beach', size: 10, bonus: 2000, line: 'Beach swept clean! Even the gulls are jealous.' },
  { area: 'Old Town', size: 10, bonus: 2000, line: 'Old Town swept clean! The old streets remember you.' },
  { area: 'Docks', size: 10, bonus: 2000, line: 'Docks swept clean! The crews will talk about this.' },
  { area: 'Hills', size: 10, bonus: 2000, line: 'Hills swept clean! You have seen the whole city now.' },
];

// Milestones: collected count -> bonus + line.
export const PACKAGE_MILESTONES = [
  { at: 10, bonus: 1000, line: '10 packages! The hunt is on — $1,000 bonus.' },
  { at: 25, bonus: 2500, line: '25 packages! Quarter of the city — $2,500 bonus.' },
  { at: 50, bonus: 5000, line: '50 packages! Halfway there — $5,000 bonus.' },
  { at: 75, bonus: 7500, line: '75 packages! Nearly done — $7,500 bonus.' },
  { at: 100, bonus: 15000, line: 'ALL 100 PACKAGES! Legend of Solmarina — $15,000 bonus!' },
];

export const PACKAGE_VALUE = 250;
export const PROCEDURAL_PACKAGES = 40;
export const PICKUP_RADIUS = 3;

export class CollectibleSystem {
  constructor(scene, city, player, missions, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.missions = missions;
    this.hud = hud;
    this.random = createRandom(112233);

    this.packages = [];
    this.collected = new Set();
    this.completedSets = new Set();
    this.hitMilestones = new Set();
    this.elapsed = 0;
    this.nearestHint = '';
    this.totalEarned = 0;

    this.buildPackages();
    this.createBadge();
  }

  buildPackages() {
    // Shared geometry/materials: one glowing box per package, one
    // pulsing ring under it. Individual meshes so each can spin.
    this.packageGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    this.packageMat = createEmissiveMaterial(0x22ee88, 0.9);
    this.ringGeo = new THREE.RingGeometry(1.2, 1.7, 20);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x22ee88, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });

    // Hand-placed sixty.
    for (let i = 0; i < HAND_PLACED_PACKAGES.length; i++) {
      const spec = HAND_PLACED_PACKAGES[i];
      this.addPackage(i, spec.x, spec.z, spec.area, spec.name, spec.hint);
    }
    // Procedural forty: deal street nodes far from hand-placed spots.
    const nodes = this.city.trafficNodes.filter((n) => n.type === 'street');
    let placed = 0;
    let guard = 0;
    while (placed < PROCEDURAL_PACKAGES && guard < 400) {
      guard++;
      const node = nodes[Math.floor(this.random() * nodes.length)];
      const x = node.x + (this.random() - 0.5) * 14;
      const z = node.z + (this.random() - 0.5) * 14;
      // Keep off hand-placed spots and out of the spawn plaza.
      let clash = false;
      for (const p of this.packages) {
        if (Math.abs(p.x - x) < 12 && Math.abs(p.z - z) < 12) { clash = true; break; }
      }
      if (clash) continue;
      if (Math.abs(x) < 90 && Math.abs(z) < 90) continue;
      const id = HAND_PLACED_PACKAGES.length + placed;
      const area = this.areaFor(x, z);
      this.addPackage(id, x, z, area, `Street Cache #${placed + 1}`, `Somewhere on the streets of ${area}.`);
      placed++;
    }
  }

  areaFor(x, z) {
    if (x > 450 && z < -450) return 'Marina';
    if (Math.abs(x) > 700 || Math.abs(z) > 700) return 'Beach';
    if (x < -200 && z > 200) return 'Old Town';
    if (x > 200 && z < -200) return 'Docks';
    if (Math.abs(x) > 600 || Math.abs(z) > 600) return 'Hills';
    return 'Downtown';
  }

  addPackage(id, x, z, area, name, hint) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(this.packageGeo, this.packageMat);
    box.position.y = 1.4;
    box.castShadow = true;
    group.add(box);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    // A tiny beacon beam so packages are findable from a distance.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.5, 9, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x22ee88, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = 5;
    group.add(beam);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.packages.push({
      id, x, z, area, name, hint,
      group, box, ring, beam,
      phase: this.random() * Math.PI * 2,
      collected: false,
    });
  }

  createBadge() {
    // Progress badge: fixed panel top-right, under the timer. It shows
    // the count and the hint for the nearest package left.
    this.badge = document.createElement('div');
    this.badge.id = 'packageBadge';
    this.badge.style.cssText = `
      position: fixed; top: 110px; right: 16px; z-index: 30;
      background: rgba(0,20,10,0.85); color: #7dffb0; padding: 8px 12px;
      border-radius: 4px; font-family: monospace; font-size: 12px;
      border: 1px solid #22ee88; max-width: 260px; text-align: right;
      pointer-events: none;
    `;
    document.body.appendChild(this.badge);
    this.refreshBadge();
  }

  refreshBadge() {
    const total = this.packages.length;
    const got = this.collected.size;
    const hint = this.nearestHint || 'Explore the city — packages glow green.';
    this.badge.innerHTML = `PACKAGES ${got}/${total}<br><span style="color:#b8ffd0">${hint}</span>`;
  }

  pay(amount) {
    // Pay through the mission ledger, like every other cash source.
    if (this.missions) {
      this.missions.cash += amount;
      this.player.cash = this.missions.cash;
    } else {
      this.player.cash += amount;
    }
    this.totalEarned += amount;
  }

  // -- pickup --------------------------------------------------------------------

  collect(pkg) {
    pkg.collected = true;
    this.collected.add(pkg.id);
    this.scene.remove(pkg.group);
    this.pay(PACKAGE_VALUE);
    this.hud.showMessage(`Package found: ${pkg.name} (+$${PACKAGE_VALUE})`, 3);
    this.checkSet(pkg.area);
    this.checkMilestones();
    this.refreshBadge();
  }

  checkSet(area) {
    if (this.completedSets.has(area)) return;
    const set = PACKAGE_SETS.find((s) => s.area === area);
    if (!set) return;
    let got = 0;
    for (const p of this.packages) {
      if (p.area === area && p.collected) got++;
    }
    if (got >= set.size) {
      this.completedSets.add(area);
      this.pay(set.bonus);
      this.hud.showMessage(`${set.line} Set bonus +$${set.bonus}!`, 5);
    }
  }

  checkMilestones() {
    for (const m of PACKAGE_MILESTONES) {
      if (this.collected.size >= m.at && !this.hitMilestones.has(m.at)) {
        this.hitMilestones.add(m.at);
        this.pay(m.bonus);
        this.hud.showMessage(m.line, 5);
      }
    }
  }

  nearestUncollected() {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.packages) {
      if (p.collected) continue;
      const d = distance2D(this.player.position, p);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return { pkg: best, dist: bestDist };
  }

  // -- per-frame -------------------------------------------------------------------

  update(delta) {
    this.elapsed += delta;
    const t = this.elapsed;
    const p = this.player.position;
    let hintChanged = false;
    for (const pkg of this.packages) {
      if (pkg.collected) continue;
      // Spin + bob; the beam breathes.
      pkg.box.rotation.y = t * 1.2 + pkg.phase;
      pkg.box.position.y = 1.4 + Math.sin(t * 2 + pkg.phase) * 0.25;
      const s = 1 + Math.sin(t * 3 + pkg.phase) * 0.12;
      pkg.ring.scale.setScalar(s);
      pkg.beam.material.opacity = 0.12 + Math.sin(t * 1.5 + pkg.phase) * 0.05;
      // Pickup check (generous radius so driving past counts).
      if (distance2D(p, pkg) < PICKUP_RADIUS) this.collect(pkg);
    }
    // Nearest hint, refreshed twice a second (cheap enough at 100).
    if (Math.floor(t * 2) !== Math.floor((t - delta) * 2)) {
      const { pkg, dist } = this.nearestUncollected();
      const hint = pkg ? `${pkg.hint} (${Math.round(dist)}m away)` : 'All packages found!';
      if (hint !== this.nearestHint) {
        this.nearestHint = hint;
        hintChanged = true;
      }
    }
    if (hintChanged) this.refreshBadge();
  }

  // -- inspection / save -------------------------------------------------------------

  get collectedCount() {
    return this.collected.size;
  }

  get totalCount() {
    return this.packages.length;
  }

  countByArea() {
    const counts = {};
    for (const p of this.packages) {
      counts[p.area] = counts[p.area] || { got: 0, total: 0 };
      counts[p.area].total++;
      if (p.collected) counts[p.area].got++;
    }
    return counts;
  }

  getState() {
    return {
      collected: [...this.collected],
      sets: [...this.completedSets],
      milestones: [...this.hitMilestones],
      earned: this.totalEarned,
    };
  }

  setState(state) {
    if (!state) return;
    for (const id of state.collected || []) {
      const pkg = this.packages.find((p) => p.id === id);
      if (pkg && !pkg.collected) {
        pkg.collected = true;
        this.collected.add(id);
        this.scene.remove(pkg.group);
      }
    }
    this.completedSets = new Set(state.sets || []);
    this.hitMilestones = new Set(state.milestones || []);
    this.totalEarned = state.earned || 0;
    this.refreshBadge();
  }

  // Test hook: collect the nearest package without moving the player
  // (used by the verification probe).
  debugCollectNearest() {
    const { pkg } = this.nearestUncollected();
    if (!pkg) return null;
    this.collect(pkg);
    return pkg;
  }
}

// -- hunt flavour ------------------------------------------------------------------
// Smuggler's notes: one-line stories for the hunt, shown in the badge on
// a slow rotation while the player explores. They are flavour, not hints.
export const SMUGGLER_NOTES = [
  'The smuggler hid 100 packages and sailed away. Find them all.',
  'Every package is $250. Every set is $2,000. The city pays to explore.',
  'They say one package is on a yacht. They say two are in the lighthouse.',
  'The harbormaster never found them. The gulls know, but they are not telling.',
  'Mara hid the first ten herself, back when the city was young.',
  'Delia swears the marina set is the hardest. She would know.',
];

export function smugglerNote(random) {
  return SMUGGLER_NOTES[Math.floor(random() * SMUGGLER_NOTES.length)];
}
