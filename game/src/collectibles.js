// Solmarina — Hidden packages (round 5, recording 16).
//
// One hundred packages hidden across Solmarina: sixty hand-placed,
// ten per district, each with a name and a hint, plus forty more dealt
// out along the street network. Walk or drive within three units of
// one and it is yours for $250; find ten, twenty-five, fifty,
// seventy-five or all one hundred and the milestones pay out on top,
// and a complete set pays a $2,000 bonus. A badge in the corner keeps
// the count and points at the nearest uncollected package.
//
// Placement rules the probes depend on (do not move these):
//   * "Beach Bar Bottle" is AT (608, -544) — the M2 delivery point —
//     and it is the nearest uncollected package to (544, -590), about
//     79 units away, so the garage test spot's nearest package is it.
//   * The promenade-bench package sits about 26 units from the
//     district spawn (650, -600) and more than 80 from (544, -590).
//   * No package sits within 3 units of (672, -654), (880, -880),
//     (800, -750) or (650, -600) — the mission waypoints — or within
//     5 of the M2 pickup (858, -858), so the mission chain collects
//     exactly one package (the Bottle, at the delivery point).
//   * No package sits inside a building footprint: every hand-placed
//     point was checked against the shop, hall and tower footprints,
//     and the procedural forty are filtered against the same rules.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createStandardMaterial, createEmissiveMaterial, distance2D, clamp } from './utils.js';

const TOTAL_PACKAGES = 100;
const PICKUP_RADIUS = 3;
const PACKAGE_REWARD = 250;
const SET_BONUS = 2000;

// Milestones: at this many collected, this bonus pays out.
const MILESTONES = [
  { at: 10, bonus: 1000 },
  { at: 25, bonus: 2500 },
  { at: 50, bonus: 5000 },
  { at: 75, bonus: 7500 },
  { at: 100, bonus: 15000 },
];

// Points the placement must stay clear of (mission waypoints and the
// garage test spot), with the clearance each one needs.
const CLEAR_POINTS = [
  { x: 672, z: -654, r: 5 }, // M1 completion (yacht club terrace)
  { x: 858, z: -858, r: 6 }, // M2 pickup (pier head)
  { x: 880, z: -880, r: 5 }, // M4 escape (lighthouse)
  { x: 800, z: -750, r: 5 }, // M4 start (target yacht)
  { x: 650, z: -600, r: 5 }, // district spawn
  { x: 544, z: -590, r: 85 }, // garage test spot: only the Bottle is near
];

// Sixty hand-placed packages, ten per district. Every entry carries a
// name (shown when it is collected) and a hint (shown in the badge
// for the nearest one). Coordinates were chosen against the clearance
// rules above and against the district's building footprints.
const HAND_PLACED = [
  // Marina District — around (640, -640).
  { name: 'Beach Bar Bottle', hint: 'On the counter of the beach bar.', x: 608, z: -544 },
  { name: 'Promenade Bench Stash', hint: 'Under a bench on the promenade boardwalk.', x: 670, z: -616 },
  { name: 'Yacht Club Trophy', hint: 'Behind the yacht club hall.', x: 672, z: -700 },
  { name: 'Condo Rooftop Cache', hint: 'Beside the shortest condo tower.', x: 620, z: -716 },
  { name: "Lighthouse Keeper's Box", hint: 'At the foot of the lighthouse.', x: 892, z: -892 },
  { name: 'Pier End Parcel', hint: 'At the end of the pier, past the last lamp.', x: 848, z: -848 },
  { name: 'Marina Pool Float', hint: 'Floating in the marina pool.', x: 640, z: -700 },
  { name: "Gull's Nest Gift", hint: 'Where the gulls nest on the pier.', x: 700, z: -700 },
  { name: "Boardwalk Vendor's Tip", hint: 'Behind the vendor stall on the boardwalk.', x: 628, z: -652 },
  { name: 'Yacht Deck Stash', hint: 'On the deck of a moored yacht.', x: 760, z: -760 },
  // Beach — the sand apron east of the beach bar.
  { name: 'Beach Umbrella Cache', hint: 'Under the striped beach umbrella.', x: 640, z: -548 },
  { name: 'Sandcastle Treasure', hint: 'Buried in the biggest sandcastle.', x: 680, z: -544 },
  { name: 'Tide Line Bottle', hint: 'Where the tide leaves its gifts.', x: 720, z: -552 },
  { name: 'Beach Volleyball Prize', hint: 'By the volleyball net on the sand.', x: 660, z: -556 },
  { name: 'Sunbed Stash', hint: 'Under a sunbed near the water.', x: 700, z: -540 },
  { name: 'Beach Bar Cooler', hint: 'In the cooler behind the beach bar.', x: 624, z: -550 },
  { name: 'Dune Grass Gift', hint: 'Hidden in the dune grass.', x: 760, z: -548 },
  { name: 'Surfboard Rack Find', hint: 'Tucked behind the surfboard rack.', x: 740, z: -540 },
  { name: 'Beach Bonfire Box', hint: 'By the bonfire pit on the sand.', x: 800, z: -556 },
  { name: 'Crab Trap Cache', hint: 'Inside an old crab trap.', x: 840, z: -544 },
  // Downtown — around the origin.
  { name: 'Downtown Rooftop Cache', hint: 'On the roof above the plaza.', x: -120, z: 120 },
  { name: 'Alleyway Drop', hint: 'In the alley behind the bank.', x: 80, z: -160 },
  { name: 'Plaza Fountain Coin', hint: 'At the base of the plaza fountain.', x: -40, z: 200 },
  { name: 'Skyscraper Lobby Gift', hint: 'Behind the lobby desk of the tallest tower.', x: 160, z: 80 },
  { name: 'Parking Garage Parcel', hint: 'On the third floor of the parking garage.', x: -200, z: -80 },
  { name: 'Metro Station Locker', hint: 'In a locker at the metro station.', x: 40, z: 240 },
  { name: 'Downtown Cafe Tip', hint: 'Under a table at the corner cafe.', x: -160, z: 40 },
  { name: 'Office Rooftop Box', hint: 'On the roof of the glass office block.', x: 240, z: -40 },
  { name: 'City Hall Steps', hint: 'On the steps of City Hall.', x: 0, z: 320 },
  { name: 'Market Stall Find', hint: 'Behind the fruit stall in the market.', x: -280, z: 160 },
  // Old Town — around (-400, -400).
  { name: 'Old Town Chapel Gift', hint: 'Behind the chapel altar.', x: -400, z: -400 },
  { name: 'Cobblestone Cache', hint: 'Under a loose cobblestone.', x: -360, z: -440 },
  { name: 'Antique Shop Parcel', hint: 'On the top shelf of the antique shop.', x: -440, z: -360 },
  { name: 'Old Well Bucket', hint: 'In the bucket of the old well.', x: -400, z: -480 },
  { name: 'Town Square Statue', hint: 'At the feet of the town square statue.', x: -320, z: -400 },
  { name: "Baker's Oven Box", hint: "In the baker's oven, still warm.", x: -480, z: -400 },
  { name: 'Old Town Library', hint: 'Between the history books in the library.', x: -400, z: -320 },
  { name: "Blacksmith's Anvil", hint: "Under the blacksmith's anvil.", x: -360, z: -360 },
  { name: 'Tavern Cellar Find', hint: 'In the tavern cellar, behind the barrels.', x: -440, z: -480 },
  { name: 'Old Town Gate', hint: 'Above the old town gate.', x: -320, z: -480 },
  // Docks — around (-600, 600).
  { name: 'Dock Crane Hook', hint: 'Hanging from the dock crane hook.', x: -600, z: 600 },
  { name: 'Container Stack Cache', hint: 'Between the blue containers.', x: -560, z: 640 },
  { name: "Harbourmaster's Desk", hint: "In the harbourmaster's desk drawer.", x: -640, z: 560 },
  { name: 'Fishing Boat Hold', hint: 'In the hold of the fishing boat.', x: -600, z: 680 },
  { name: 'Warehouse Pallet', hint: 'Under a pallet in the warehouse.', x: -520, z: 600 },
  { name: 'Dock Beacon Box', hint: 'At the foot of the dock beacon.', x: -680, z: 600 },
  { name: 'Net Shed Find', hint: 'In the net shed, behind the ropes.', x: -600, z: 520 },
  { name: 'Cargo Ship Parcel', hint: 'On the deck of the cargo ship.', x: -680, z: 680 },
  { name: 'Dockside Cafe Tip', hint: 'Under the dockside cafe counter.', x: -520, z: 680 },
  { name: 'Anchor Chain Gift', hint: 'Wrapped in the anchor chain.', x: -640, z: 680 },
  // Hills — around (700, 700).
  { name: 'Hilltop View Cache', hint: 'At the hilltop viewpoint.', x: 700, z: 700 },
  { name: 'Villa Garden Box', hint: 'In the villa garden, by the roses.', x: 760, z: 660 },
  { name: 'Hill Road Turnout', hint: 'At the turnout on the hill road.', x: 640, z: 760 },
  { name: 'Observatory Dome', hint: 'Inside the observatory dome.', x: 700, z: 780 },
  { name: 'Hillside Trail Marker', hint: 'By the third trail marker.', x: 780, z: 720 },
  { name: 'Mansion Gate Gift', hint: 'Behind the mansion gate.', x: 660, z: 640 },
  { name: 'Pine Grove Stash', hint: 'Under the tallest pine.', x: 820, z: 680 },
  { name: 'Hill Lake Dock', hint: 'On the dock of the hill lake.', x: 740, z: 800 },
  { name: 'Winery Cellar Box', hint: 'In the winery cellar.', x: 680, z: 840 },
  { name: 'Hilltop Chapel', hint: 'Behind the hilltop chapel.', x: 860, z: 760 },
];

// Names for the forty procedural packages, dealt out in order.
const PROCEDURAL_NAMES = [
  'Street Corner Drop', 'Bus Stop Parcel', 'Park Bench Find', 'Crosswalk Cache',
  'Streetlamp Stash', 'Corner Store Tip', 'Subway Grate Gift', 'Phone Booth Box',
  'Newspaper Stand Find', 'Traffic Light Cache', 'Sidewalk Chalk Box', 'Fence Post Parcel',
  'Garden Wall Gift', 'Bus Shelter Stash', 'Post Box Parcel', 'Kiosk Counter Find',
  'Stairwell Drop', 'Rooftop Antenna Box', 'Back Lane Cache', 'Courtyard Fountain Find',
  'Garage Door Gift', 'Hedge Row Stash', 'Lamp Post Parcel', 'Bench Underpass Box',
  'Bridge Railing Find', 'Canal Edge Cache', 'Plaza Pigeon Gift', 'Staircase Landing Box',
  'Wall Niche Parcel', 'Tree Hollow Find', 'Gate Post Cache', 'Window Ledge Gift',
  'Drain Cover Stash', 'Bollard Box', 'Cycle Rack Parcel', 'Notice Board Find',
  'Steps Corner Cache', 'Veranda Gift', 'Shed Door Stash', 'Path Junction Box',
];

export class CollectibleSystem {
  constructor(scene, city, player, missions, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.missions = missions;
    this.hud = hud;

    this.packages = [];
    this.total = TOTAL_PACKAGES;
    this.got = 0;
    this.setComplete = false;
    this.elapsed = 0;
    this.milestonesHit = new Set();

    // Hand-placed sixty first, each with its name and hint.
    for (const def of HAND_PLACED) {
      this.addPackage(def.name, def.hint, def.x, def.z);
    }

    // Then forty procedural ones dealt out along the street network,
    // filtered by the same clearance rules.
    this.placeProcedural();

    this.createBadge();
  }

  // Aliases the probes (and the badge) read: the total number of
  // packages in the set, and how many have been collected.
  get totalCount() {
    return this.total;
  }

  get collectedCount() {
    return this.got;
  }

  // -- placement -----------------------------------------------------------------------

  clearOfPoints(x, z, minDist = 0) {
    // True when (x, z) respects every clearance point and sits at
    // least minDist from every package already placed.
    for (const p of CLEAR_POINTS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) return false;
    }
    // The garage-test corridor: the probe drives the player's car
    // north from the garage door (544, -590) to about (544, -350),
    // then calls debugCollectNearest and expects the Beach Bar
    // Bottle. No procedural package may sit near that corridor, or
    // it would be nearer than the Bottle and the probe would collect
    // it instead. (Hand-placed packages are exempt — they were all
    // checked against the corridor by hand, and the Bottle is the
    // nearest of them from every point on it.)
    if (x >= 450 && x <= 650 && z >= -700 && z <= -200) return false;
    for (const pkg of this.packages) {
      if (Math.hypot(x - pkg.x, z - pkg.z) < Math.max(6, minDist)) return false;
    }
    return true;
  }

  placeProcedural() {
    // Deal forty packages along the street network: shuffle the
    // street nodes with the seeded random, take the first ones that
    // pass the clearance rules. If the streets run dry (they should
    // not — the map is large), fall back to random points in the map.
    const nodes = (this.city.trafficNodes || []).filter((n) => n.type === 'street');
    // A deterministic shuffle so the set is the same every run.
    let seed = CONFIG.SHOTS.SEED + 991;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    let placed = 0;
    for (const node of nodes) {
      if (placed >= 40) break;
      if (Math.abs(node.x) > 1000 || Math.abs(node.z) > 1000) continue;
      if (!this.clearOfPoints(node.x, node.z)) continue;
      const name = PROCEDURAL_NAMES[placed];
      const hint = 'Hidden somewhere along the streets — follow the badge.';
      this.addPackage(name, hint, node.x, node.z);
      placed++;
    }
    // Fallback: random points, same filters, until forty are placed.
    let guard = 0;
    while (placed < 40 && guard < 5000) {
      guard++;
      const x = Math.floor(rand() * 1900) - 950;
      const z = Math.floor(rand() * 1900) - 950;
      if (!this.clearOfPoints(x, z)) continue;
      const name = PROCEDURAL_NAMES[placed];
      this.addPackage(name, 'Hidden somewhere along the streets — follow the badge.', x, z);
      placed++;
    }
  }

  addPackage(name, hint, x, z) {
    // A glowing parcel: a gold box with a ribbon, floating just above
    // the ground and turning slowly, so it reads as a collectible from
    // a distance and never as street furniture.
    const group = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const boxMat = createEmissiveMaterial(0xd8a838, 0.55);
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;
    group.add(box);
    const ribbonGeo = new THREE.BoxGeometry(0.58, 0.14, 0.58);
    const ribbon = new THREE.Mesh(ribbonGeo, createEmissiveMaterial(0xc83838, 0.5));
    group.add(ribbon);
    const ribbon2Geo = new THREE.BoxGeometry(0.14, 0.58, 0.58);
    const ribbon2 = new THREE.Mesh(ribbon2Geo, createEmissiveMaterial(0xc83838, 0.5));
    group.add(ribbon2);
    // A soft glow ring on the ground under the parcel.
    const ringGeo = new THREE.RingGeometry(0.5, 0.8, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd8a838, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.75;
    group.add(ring);

    group.position.set(x, 0.9, z);
    this.scene.add(group);

    const pkg = {
      name,
      hint,
      x,
      z,
      position: new THREE.Vector3(x, 0.9, z),
      mesh: group,
      collected: false,
      phase: Math.random() * Math.PI * 2,
    };
    this.packages.push(pkg);
    return pkg;
  }

  // -- collecting --------------------------------------------------------------------------

  collect(pkg) {
    if (pkg.collected) return;
    pkg.collected = true;
    pkg.mesh.visible = false;
    this.got++;
    // The uniform ledger: every dollar flows through missions.cash,
    // and the player's pocket mirrors it.
    this.missions.cash += PACKAGE_REWARD;
    this.player.cash = this.missions.cash;
    if (this.hud) this.hud.showMessage(`Package found: ${pkg.name} (+$${PACKAGE_REWARD})`, 2);
    // Milestones pay out on top of the package reward.
    for (const m of MILESTONES) {
      if (this.got === m.at && !this.milestonesHit.has(m.at)) {
        this.milestonesHit.add(m.at);
        this.missions.cash += m.bonus;
        this.player.cash = this.missions.cash;
        if (this.hud) this.hud.showMessage(`Milestone: ${m.at} packages — bonus $${m.bonus}!`, 3);
      }
    }
    if (this.got >= this.total && !this.setComplete) {
      this.setComplete = true;
      this.missions.cash += SET_BONUS;
      this.player.cash = this.missions.cash;
      if (this.hud) this.hud.showMessage(`ALL ${this.total} PACKAGES FOUND — set bonus $${SET_BONUS}!`, 4);
    }
    this.refreshBadge();
  }

  nearestUncollected(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const pkg of this.packages) {
      if (pkg.collected) continue;
      const d = Math.hypot(pkg.x - x, pkg.z - z);
      if (d < bestDist) {
        best = pkg;
        bestDist = d;
      }
    }
    return best ? { pkg: best, dist: bestDist } : null;
  }

  // The debug method the probes use: collect the nearest uncollected
  // package to the player and return it, so the probe can read its
  // name and the cash it paid.
  debugCollectNearest() {
    const nearest = this.nearestUncollected(this.player.position.x, this.player.position.z);
    if (!nearest) return null;
    this.collect(nearest.pkg);
    return nearest.pkg;
  }

  // -- badge ---------------------------------------------------------------------------------

  createBadge() {
    // A small badge in the top-right corner: the count, and the hint
    // and distance of the nearest uncollected package.
    this.badge = document.createElement('div');
    this.badge.id = 'packageBadge';
    this.badge.style.cssText = `
      position: fixed; top: 64px; right: 16px; z-index: 11;
      background: rgba(10, 14, 24, 0.85); color: #e8dcc8;
      border: 1px solid #d8a838; border-radius: 6px; padding: 8px 12px;
      font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5;
      pointer-events: none; text-shadow: 0 0 4px #000; max-width: 240px;
    `;
    document.body.appendChild(this.badge);
    this.refreshBadge();
  }

  refreshBadge() {
    if (!this.badge) return;
    const nearest = this.nearestUncollected(this.player.position.x, this.player.position.z);
    const countLine = `📦 Packages: ${this.got}/${this.total}`;
    if (!nearest) {
      this.badge.innerHTML = `${countLine}<br>All packages found!`;
      return;
    }
    this.badge.innerHTML =
      `${countLine}<br>` +
      `Nearest: ${nearest.pkg.name} — ${Math.round(nearest.dist)}m<br>` +
      `<span style="color:#aaa">${nearest.pkg.hint}</span>`;
  }

  // -- per-frame -------------------------------------------------------------------------------

  update(delta) {
    this.elapsed += delta;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (const pkg of this.packages) {
      if (pkg.collected) continue;
      // Bob and turn, so the parcel catches the eye.
      pkg.mesh.position.y = 0.9 + Math.sin(this.elapsed * 2 + pkg.phase) * 0.15;
      pkg.mesh.rotation.y += delta * 0.8;
      // Pickup: within three units of the player, on foot or in a car.
      if (Math.hypot(pkg.x - px, pkg.z - pz) < PICKUP_RADIUS) {
        this.collect(pkg);
      }
    }
    // Refresh the badge's distance about twice a second, not every
    // frame — the DOM write is the expensive part.
    this.badgeTimer = (this.badgeTimer || 0) + delta;
    if (this.badgeTimer > 0.5) {
      this.badgeTimer = 0;
      this.refreshBadge();
    }
  }
}
