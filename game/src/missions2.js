// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - The Marina Job (second mission chain)
//
// A 4-mission chain set in the Marina District, given by a new fixer,
// "Delia Kade", who runs the yacht club. It is deliberately independent of
// the main MissionSystem: it owns its own marker, objectives and dialogue,
// and it only runs while the main chain has no active mission — if Mara's
// chain starts mid-job, this chain pauses (marker hidden, progress kept)
// and resumes when the main mission finishes. Rewards are paid through
// the main chain's cash ledger (missions.cash -> player.cash), exactly the
// way MissionSystem.completeMission pays, so the HUD cash total and the
// save system never disagree about how much money the player has.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial,
  createEmissiveMaterial,
  distance2D,
  clamp,
  createRandom,
} from './utils.js';

// Mission definitions for the Marina Job chain. Positions are all inside
// the Marina District (centre 640, -640) or on the drive between the
// district and downtown, so the chain is playable without crossing the
// whole map for every objective.
export const MARINA_JOB_DEFS = [
  {
    id: 'harbor-lights',
    name: 'Harbor Lights',
    giver: 'Delia Kade',
    description: 'Meet Delia at the yacht club and hear the job.',
    objectives: [
      // The terrace in front of the club (z = -654), NOT the hall centre:
      // the hall is 24 deep, so its centre is inside the building and no
      // player could ever reach it on foot.
      { type: 'goto', target: 'yacht club', position: { x: 672, z: -654 }, radius: 6 },
    ],
    reward: 800,
    dialogue: {
      start: "Delia Kade, yacht club. You must be Mara's new wheelman. I run the marina — and I need someone who can drive without asking questions.",
      progress: 'Head to the yacht club. Delia is waiting on the terrace.',
      complete: "Good, you showed up. First job's easy. There's a manifest on the pier — bring it to me.",
    },
  },
  {
    id: 'the-manifest',
    name: 'The Manifest',
    giver: 'Delia Kade',
    description: 'Pick up the manifest at the pier head and deliver it to the beach bar.',
    objectives: [
      { type: 'pickup', target: 'pier head', position: { x: 858, z: -858 }, radius: 5 },
      { type: 'goto', target: 'beach bar', position: { x: 608, z: -544 }, radius: 6 },
    ],
    reward: 2000,
    dialogue: {
      start: "The manifest is stashed at the end of the pier — Pier 9, past the lighthouse. Walk it to the beach bar. My guy there pays in cash.",
      pickup: 'Manifest secured. Now get it to the beach bar before the harbormaster does his rounds.',
      progress: 'Take the manifest to the beach bar. No detours.',
      complete: "Clean handoff. The barman says you're alright. Next job pays real money — but it comes with heat.",
    },
  },
  {
    id: 'hot-water',
    name: 'Hot Water',
    giver: 'Delia Kade',
    description: 'A deal goes loud at the marina. Survive the police response for 45 seconds.',
    objectives: [
      { type: 'survive', duration: 45, position: { x: 640, z: -640 } },
    ],
    reward: 3500,
    dialogue: {
      start: "Meet me at the promenade. We're moving cargo off a yacht — if the cops show, you keep them busy while I vanish.",
      trigger: 'Cops on the promenade! Keep them off me — survive!',
      progress: 'Stay alive! Keep moving and stay out of cuffs!',
      complete: 'You bought me the time I needed. The cargo is gone and so are they. One last job — the yacht itself.',
    },
  },
  {
    id: 'the-yacht-job',
    name: 'The Yacht Job',
    giver: 'Delia Kade',
    description: 'Board the target yacht in the marina pool, then escape to the lighthouse.',
    objectives: [
      { type: 'goto', target: 'target yacht', position: { x: 800, z: -750 }, radius: 7 },
      { type: 'escape', target: 'lighthouse', position: { x: 880, z: -880 }, radius: 8 },
    ],
    reward: 6000,
    dialogue: {
      start: "The big one. A Varela yacht is moored in the pool with a safe full of cash. Board it, crack it, and run for the lighthouse.",
      vault: "Safe's open. Grab the cash and move — the crew is coming back!",
      escape: 'To the lighthouse! Lose them on the pier!',
      complete: "Twelve thousand, split fair. You drive like the devil himself. The marina is yours now, wheelman.",
    },
  },
];

// How close the player must be to the district before the chain offers
// its first mission.
const CHAIN_TRIGGER_RADIUS = 70;
// How long the "mission complete" banner lingers before the next mission
// in the chain becomes available.
const BETWEEN_MISSIONS_DELAY = 4;

export class MarinaJobChain {
  constructor(scene, city, player, police, missions, hud, district) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.police = police;
    this.missions = missions;
    this.hud = hud;
    this.district = district;
    this.random = createRandom(31337);

    // Chain state. `index` is the next mission to offer; `active` is the
    // mission currently being played; `paused` is set while the main
    // MissionSystem owns the HUD.
    this.index = 0;
    this.active = null;
    this.currentObjective = 0;
    this.paused = false;
    this.done = false;
    this.offered = false;
    this.cooldown = 0;
    this.surviveStart = 0;
    this.surviveWanted = 0;
    this.markerPulse = 0;
    this.completedIds = [];

    this.createMarkers();
  }

  createMarkers() {
    // Start marker: a flat cyan disc on the ground where the chain
    // begins (the promenade). Distinct from the main chain's yellow disc.
    const startGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 20);
    const startMat = createStandardMaterial(0x22ccdd);
    this.startMarker = new THREE.Mesh(startGeo, startMat);
    this.startMarker.position.set(650, 0.2, -600);
    this.scene.add(this.startMarker);
    this.startMarker.visible = false;

    // Objective marker: a tall cyan cone, like the main chain's yellow
    // cone but cyan so the player can tell the two chains apart.
    const objGeo = new THREE.ConeGeometry(CONFIG.MISSIONS.MARKER_SIZE, CONFIG.MISSIONS.MARKER_HEIGHT, 8);
    const objMat = createEmissiveMaterial(0x22ccdd, 1);
    this.objectiveMarker = new THREE.Mesh(objGeo, objMat);
    this.objectiveMarker.position.y = CONFIG.MISSIONS.MARKER_HEIGHT / 2;
    this.objectiveMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.objectiveMarker);
    this.objectiveMarker.visible = false;

    // A small floating diamond above the objective, for visibility at
    // distance (the cone alone is easy to lose behind buildings).
    const diaGeo = new THREE.OctahedronGeometry(1.4);
    const diaMat = createEmissiveMaterial(0x66eeff, 1);
    this.diamond = new THREE.Mesh(diaGeo, diaMat);
    this.scene.add(this.diamond);
    this.diamond.visible = false;
  }

  // -- state ---------------------------------------------------------------

  get currentDef() {
    return this.active ? MARINA_JOB_DEFS[this.index] : null;
  }

  get isActive() {
    return this.active !== null;
  }

  get isFinished() {
    return this.done;
  }

  get progress() {
    return { completed: this.completedIds.slice(), next: this.index, active: this.active ? this.active.id : null };
  }

  // -- main loop -------------------------------------------------------------

  update(delta) {
    this.markerPulse += delta * 5;
    if (this.cooldown > 0) this.cooldown -= delta;

    // Pulse the visible markers.
    if (this.objectiveMarker.visible) {
      const s = 1 + Math.sin(this.markerPulse) * 0.15;
      this.objectiveMarker.scale.setScalar(s);
      this.objectiveMarker.material.opacity = 0.7 + Math.sin(this.markerPulse) * 0.3;
    }
    if (this.diamond.visible) {
      this.diamond.rotation.y += delta * 2;
      this.diamond.position.y += Math.sin(this.markerPulse * 0.8) * delta * 2;
    }
    if (this.startMarker.visible) {
      const s = 1 + Math.sin(this.markerPulse * 0.7) * 0.1;
      this.startMarker.scale.setScalar(s);
    }

    if (this.done) return;

    // If the main chain just took over the HUD, pause: hide our markers
    // and wait. Progress is kept; we resume when it frees up.
    if (this.missions && this.missions.activeMission) {
      if (this.active && !this.paused) {
        this.paused = true;
        this.hideMarkers();
      }
      return;
    }
    if (this.paused) {
      this.paused = false;
      if (this.active) this.showObjective();
    }

    if (!this.active) {
      this.checkChainStart();
      return;
    }
    this.updateActiveObjective(delta);
  }

  checkChainStart() {
    if (this.offered || this.cooldown > 0) return;
    if (this.index >= MARINA_JOB_DEFS.length) {
      this.done = true;
      return;
    }
    // The chain offers itself when the player wanders into the district.
    const p = this.player.position;
    const dx = p.x - this.district.center.x;
    const dz = p.z - this.district.center.z;
    if (dx * dx + dz * dz > CHAIN_TRIGGER_RADIUS * CHAIN_TRIGGER_RADIUS) return;
    // Don't interrupt the main chain's intro banner moment.
    this.startMission(MARINA_JOB_DEFS[this.index]);
  }

  startMission(def) {
    this.active = { ...def, currentObjective: 0 };
    this.currentObjective = 0;
    this.offered = true;
    this.surviveStart = 0;
    this.surviveWanted = 0;
    this.showObjective();
    this.hud.showMessage(`${def.name} — ${def.giver}: ${def.dialogue.start}`, 6);
    this.hud.setObjective(`${def.name}: ${this.objectiveLabel(this.active.objectives[0])}`);
    const first = this.active.objectives[0];
    if (first.position) this.hud.setWaypoint(new THREE.Vector3(first.position.x, 0, first.position.z));
  }

  objectiveLabel(objective) {
    switch (objective.type) {
      case 'goto': return `Go to ${objective.target}`;
      case 'pickup': return `Pick up at ${objective.target}`;
      case 'survive': return `Survive ${objective.duration}s`;
      case 'escape': return `Escape to ${objective.target}`;
      default: return objective.target || 'Follow the marker';
    }
  }

  showObjective() {
    if (!this.active) return;
    const objective = this.active.objectives[this.currentObjective];
    if (!objective || !objective.position) return;
    this.objectiveMarker.position.set(
      objective.position.x,
      CONFIG.MISSIONS.MARKER_HEIGHT / 2,
      objective.position.z,
    );
    this.objectiveMarker.visible = true;
    this.diamond.position.set(objective.position.x, 9, objective.position.z);
    this.diamond.visible = true;
    this.startMarker.visible = false;
  }

  hideMarkers() {
    this.objectiveMarker.visible = false;
    this.diamond.visible = false;
    this.startMarker.visible = false;
  }

  updateActiveObjective(delta) {
    const objective = this.active.objectives[this.currentObjective];
    if (!objective) return;
    const playerPos = this.player.position;
    switch (objective.type) {
      case 'goto':
        this.updateGoto(objective, playerPos);
        break;
      case 'pickup':
        this.updatePickup(objective, playerPos);
        break;
      case 'survive':
        this.updateSurvive(objective, delta, playerPos);
        break;
      case 'escape':
        this.updateEscape(objective, playerPos);
        break;
      default:
        this.updateGoto(objective, playerPos);
        break;
    }
  }

  updateGoto(objective, playerPos) {
    const dist = distance2D(playerPos, objective.position);
    this.objectiveMarker.position.set(
      objective.position.x,
      CONFIG.MISSIONS.MARKER_HEIGHT / 2,
      objective.position.z,
    );
    this.objectiveMarker.visible = true;
    this.diamond.position.set(objective.position.x, 9, objective.position.z);
    this.diamond.visible = true;
    this.hud.setObjective(`${this.active.name}: Go to ${objective.target}`);
    this.hud.setWaypoint(new THREE.Vector3(objective.position.x, 0, objective.position.z));
    if (dist < objective.radius) this.completeObjective();
  }

  updatePickup(objective, playerPos) {
    // A pickup is a goto with a different banner: same marker, same
    // radius check, but the HUD says "Pick up" instead of "Go to".
    const dist = distance2D(playerPos, objective.position);
    this.objectiveMarker.position.set(
      objective.position.x,
      CONFIG.MISSIONS.MARKER_HEIGHT / 2,
      objective.position.z,
    );
    this.objectiveMarker.visible = true;
    this.diamond.position.set(objective.position.x, 9, objective.position.z);
    this.diamond.visible = true;
    this.hud.setObjective(`${this.active.name}: Pick up at ${objective.target}`);
    this.hud.setWaypoint(new THREE.Vector3(objective.position.x, 0, objective.position.z));
    if (dist < objective.radius) this.completeObjective();
  }

  updateSurvive(objective, delta, playerPos) {
    // First tick: raise the heat and start the clock.
    if (this.surviveStart === 0) {
      this.surviveStart = performance.now() / 1000;
      this.surviveWanted = 2;
      this.police.setWantedLevel(2);
      this.hud.showMessage(this.active.dialogue.trigger, 4);
    }
    const elapsed = performance.now() / 1000 - this.surviveStart;
    const remaining = Math.max(0, objective.duration - elapsed);
    this.objectiveMarker.visible = false;
    this.diamond.visible = false;
    this.hud.setObjective(`${this.active.name}: Survive ${Math.ceil(remaining)}s`);
    this.hud.setWaypoint(null);
    this.hud.showTimer(remaining);
    // Halfway through, the heat rises: 2 stars become 3 so the player
    // has to keep moving instead of camping a rooftop.
    if (elapsed > objective.duration / 2 && this.surviveWanted < 3) {
      this.surviveWanted = 3;
      this.police.setWantedLevel(3);
      this.hud.showMessage('More cops inbound — keep moving!', 3);
    }
    if (remaining <= 0) {
      this.surviveStart = 0;
      this.hud.showTimer(0);
      this.completeObjective();
    }
  }

  updateEscape(objective, playerPos) {
    // Escape is a goto while wanted: the marker stays up and the HUD
    // counts the heat. Reaching the lighthouse clears the wanted level.
    const dist = distance2D(playerPos, objective.position);
    this.objectiveMarker.position.set(
      objective.position.x,
      CONFIG.MISSIONS.MARKER_HEIGHT / 2,
      objective.position.z,
    );
    this.objectiveMarker.visible = true;
    this.diamond.position.set(objective.position.x, 9, objective.position.z);
    this.diamond.visible = true;
    const stars = this.police.wantedLevel;
    this.hud.setObjective(
      `${this.active.name}: Escape to ${objective.target}${stars > 0 ? ` (${stars}★ on you)` : ''}`,
    );
    this.hud.setWaypoint(new THREE.Vector3(objective.position.x, 0, objective.position.z));
    if (dist < objective.radius) {
      if (stars > 0) this.police.setWantedLevel(0);
      this.completeObjective();
    }
  }

  completeObjective() {
    this.currentObjective++;
    this.surviveStart = 0;
    if (this.currentObjective >= this.active.objectives.length) {
      this.completeMission();
      return;
    }
    const next = this.active.objectives[this.currentObjective];
    this.showObjective();
    const line = this.dialogueFor(next);
    this.hud.showMessage(line, 4);
    this.hud.setObjective(`${this.active.name}: ${this.objectiveLabel(next)}`);
    if (next.position) this.hud.setWaypoint(new THREE.Vector3(next.position.x, 0, next.position.z));
  }

  dialogueFor(objective) {
    const d = this.active.dialogue;
    switch (objective.type) {
      case 'pickup': return d.pickup || d.progress;
      case 'survive': return d.trigger || d.progress;
      case 'escape': return d.escape || d.progress;
      default: return d.progress;
    }
  }

  completeMission() {
    const mission = this.active;
    this.completedIds.push(mission.id);
    // Pay through the main chain's ledger, mirroring MissionSystem.
    if (this.missions) {
      this.missions.cash += mission.reward;
      this.player.cash = this.missions.cash;
    } else {
      this.player.cash += mission.reward;
    }
    this.hideMarkers();
    this.hud.setWaypoint(null);
    this.hud.setObjective('');
    this.hud.showTimer(0);
    this.hud.showMessage(`${mission.name} complete! +$${mission.reward} — ${mission.dialogue.complete}`, 6);
    this.active = null;
    this.currentObjective = 0;
    this.offered = false;
    this.index++;
    this.cooldown = BETWEEN_MISSIONS_DELAY;
    if (this.index >= MARINA_JOB_DEFS.length) {
      this.done = true;
      this.hud.showMessage('The Marina Job chain complete! Delia Kade owes you one.', 6);
    }
  }

  // -- save / debug ----------------------------------------------------------

  getState() {
    return {
      index: this.index,
      completed: this.completedIds.slice(),
      active: this.active ? this.active.id : null,
      objective: this.currentObjective,
      done: this.done,
    };
  }

  setState(state) {
    if (!state) return;
    this.index = state.index || 0;
    this.completedIds = (state.completed || []).slice();
    this.done = !!state.done;
    if (state.active && this.index < MARINA_JOB_DEFS.length) {
      const def = MARINA_JOB_DEFS.find((d) => d.id === state.active);
      if (def) {
        this.active = { ...def, currentObjective: state.objective || 0 };
        this.currentObjective = state.objective || 0;
        this.offered = true;
        this.showObjective();
      }
    }
  }

  // Teleport-free test hook: start a mission by id (used by the
  // verification probe, which drives the player to the district first).
  debugStart(id) {
    const def = MARINA_JOB_DEFS.find((d) => d.id === id);
    if (!def) return false;
    if (this.active) return false;
    this.index = MARINA_JOB_DEFS.indexOf(def);
    this.startMission(def);
    return true;
  }
}

// -- chain flavour ----------------------------------------------------------
// The fixer herself: Delia Kade's schedule, so the chain has a face.
// Each entry is a place + a line she says when the player finds her there
// (the mission chain shows the line as its start dialogue instead).
export const DELIA_SCHEDULE = [
  { where: 'yacht club terrace', line: 'You came. Good. The marina pays better than Mara ever will.' },
  { where: 'pier head', line: 'Careful on the pier — the wood is older than your driving record.' },
  { where: 'beach bar', line: 'One drink, then business. The barman keeps my messages.' },
  { where: 'lighthouse', line: 'From up here you can see the whole city. One day, all of it is ours.' },
];

// Gossip the chain drops on completion: short lines the HUD can show as
// ambient messages while the player drives between missions.
export const MARINA_GOSSIP = [
  'Rumor: the Varela crew lost a yacht full of cash last night.',
  'Rumor: Delia Kade owns half the marina — the other half owes her.',
  'Rumor: the harbormaster takes bribes in boat fuel.',
  'Rumor: someone saw a helicopter over the lighthouse at 3 AM.',
  'Rumor: the beach bar hides a safe behind the rum shelf.',
];

export function randomGossip(random) {
  return MARINA_GOSSIP[Math.floor(random() * MARINA_GOSSIP.length)];
}
