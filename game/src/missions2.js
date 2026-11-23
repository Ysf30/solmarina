// Solmarina — Marina Job chain (round 5, recording 16).
//
// A second, independent mission chain that lives in the Marina District.
// The fixer is Delia Kade, who works out of the yacht club; her four
// jobs pay better than Mara's early work and they run on their own
// ledger, markers and cooldowns, so the two chains never step on each
// other. The chain pauses its *offering* while Mara's chain is active
// and the player is away from the district heart — an active marina job
// always keeps running, because a fixer who stalls mid-job loses her
// reputation. Rewards flow through the main mission ledger
// (missions.cash / player.cash), so the HUD cash display stays honest.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  createStandardMaterial, createEmissiveMaterial, distance2D, clamp,
} from './utils.js';
import { playMissionComplete, playPickupSound } from './audio.js';

// The four jobs, in the order Delia hands them out. Positions are world
// coordinates; radii are in world units. The survive job carries its
// duration and its wanted-level script (two stars on offer, three stars
// halfway through).
const JOB_DEFS = [
  {
    id: 'harbor-lights',
    name: 'Harbor Lights',
    giver: 'Delia Kade',
    reward: 800,
    objectives: [
      { type: 'goto', target: 'yacht club terrace', position: new THREE.Vector3(672, 0, -654), radius: 6 },
    ],
    dialogue: {
      start: "Delia Kade, fixer at the marina. First job's easy: get to the yacht club terrace and light the signal lamp. Look sharp doing it — looking sharp is half the job.",
      progress: 'Head for the terrace above the club hall. The lamp is waiting.',
      complete: "Lamp's lit. The harbourmaster owes me one now. Here's your cut.",
    },
  },
  {
    id: 'the-manifest',
    name: 'The Manifest',
    giver: 'Delia Kade',
    reward: 2000,
    objectives: [
      { type: 'pickup', target: 'pier head', position: new THREE.Vector3(858, 0, -858), radius: 5 },
      { type: 'goto', target: 'beach bar', position: new THREE.Vector3(608, 0, -544), radius: 5 },
    ],
    dialogue: {
      start: "A crate came in on the night boat. Pick it up at the end of the pier and bring it to the beach bar. Don't open it. Don't ask about it.",
      pickup: "Crate's yours. Now get it to the bar before the tide turns.",
      progress: 'Take the crate to the beach bar. Fast, quiet, no detours.',
      complete: 'Delivered, sealed, no questions. You are alright, kid.',
    },
  },
  {
    id: 'hot-water',
    name: 'Hot Water',
    giver: 'Delia Kade',
    reward: 3500,
    objectives: [
      { type: 'survive', duration: 45, position: new THREE.Vector3(650, 0, -600) },
    ],
    dialogue: {
      start: "The harbour police got a tip about the crate. Stay in the district and stay alive for 45 seconds. They'll bring two stars, then three.",
      trigger: "Cops are coming in hot — don't leave the marina!",
      progress: 'Stay alive! Keep moving, stay in the district!',
      complete: "You outlasted them. The heat's off and the money's on.",
    },
  },
  {
    id: 'the-yacht-job',
    name: 'The Yacht Job',
    giver: 'Delia Kade',
    reward: 6000,
    objectives: [
      { type: 'goto', target: 'target yacht', position: new THREE.Vector3(800, 0, -750), radius: 6 },
      { type: 'escape', target: 'lighthouse', position: new THREE.Vector3(880, 0, -880), radius: 8 },
    ],
    dialogue: {
      start: "Last one. A gold-trimmed yacht is moored off the pier — grab the strongbox from its deck, then run for the lighthouse. Lose the tail.",
      pickup: "Strongbox is yours. Now run — the lighthouse, go!",
      escape: 'To the lighthouse! Do not stop for anything!',
      progress: 'Lose them at the lighthouse. That is the whole plan.',
      complete: "Six thousand, clean. The marina's yours now. Delia Kade remembers her friends.",
    },
  },
];

// The district heart: jobs are offered when the player is inside the
// district, and the pause rule is waived within 60 units of the heart
// (Delia does her hiring where she can see the water).
const HEART = { x: 650, z: -600 };
const HEART_RADIUS = 60;
const OFFER_COOLDOWN = 4;

export class MarinaJobChain {
  constructor(scene, city, player, police, missions, hud, district) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.police = police;
    this.missions = missions;
    this.hud = hud;
    this.district = district;

    // Chain state. `completed` holds job ids in completion order;
    // `next` is the index of the next job to offer; `active` is the
    // running job object (or null); `done` flips when the fourth job
    // pays out. `cooldown` is the pause between jobs; `surviveStart`
    // is the wall-clock second the current survive objective began
    // (the probes fast-forward it, so it stays a plain field).
    this.jobs = JOB_DEFS.map((def) => ({
      ...def,
      objectives: def.objectives.map((o) => ({ ...o })),
      completed: false,
      currentObjective: 0,
    }));
    this.completed = [];
    this.next = 0;
    this.active = null;
    this.done = false;
    this.cooldown = 0;
    this.surviveStart = 0;
    this.wantedEscalated = false;
    this.markerPulse = 0;

    this.createMarker();

    // Delia opens with her easiest job the moment the chain exists, so
    // the player always has a marina job waiting at the district.
    this.offerJob(0);
  }

  createMarker() {
    // The marina marker is a cyan cone, distinct from Mara's yellow
    // one, so the player can tell at a glance whose job is waiting.
    const geo = new THREE.ConeGeometry(CONFIG.MISSIONS.MARKER_SIZE, CONFIG.MISSIONS.MARKER_HEIGHT, 8);
    const mat = createEmissiveMaterial(0x00ffff, 1);
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = CONFIG.MISSIONS.MARKER_HEIGHT / 2;
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    // A flat cyan ring on the ground under the cone, for when the cone
    // itself is hidden behind a building from the player's angle.
    const ringGeo = new THREE.RingGeometry(2.2, 3, 24);
    const ringMat = createEmissiveMaterial(0x00ffff, 0.6);
    ringGeo.rotateX(-Math.PI / 2);
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.position.y = 0.18;
    this.markerRing.visible = false;
    this.scene.add(this.markerRing);
  }

  // The progress snapshot the probes and the HUD read. `active` is the
  // running job's id (or null), `next` the index of the next job to
  // offer, `done` true once the fourth job has paid out.
  get progress() {
    return {
      completed: [...this.completed],
      next: this.next,
      active: this.active ? this.active.id : null,
      done: this.done,
    };
  }

  offerJob(index) {
    const job = this.jobs[index];
    if (!job) return;
    this.active = job;
    job.currentObjective = 0;
    this.surviveStart = 0;
    this.wantedEscalated = false;

    const first = job.objectives[0];
    if (first.position) {
      this.marker.position.set(first.position.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, first.position.z);
      this.marker.visible = true;
      this.markerRing.position.set(first.position.x, 0.18, first.position.z);
      this.markerRing.visible = true;
    }
    this.hud.showMessage(`${job.giver}: ${job.dialogue.start}`, 6);
    this.hud.setObjective(`${job.name}: Go to ${first.target}`);
    if (first.position) this.hud.setWaypoint(first.position);
    playPickupSound();
  }

  update(delta) {
    // Marker pulse.
    this.markerPulse += delta * 5;
    if (this.marker.visible) {
      const scale = 1 + Math.sin(this.markerPulse) * 0.15;
      this.marker.scale.setScalar(scale);
      this.marker.material.opacity = 0.7 + Math.sin(this.markerPulse) * 0.3;
    }

    // Nothing to do once the chain is finished.
    if (this.done) return;

    // No active job: count down the cooldown, then offer the next one
    // when the player is inside the district. While Mara's chain is
    // active the offer waits — unless the player is near the district
    // heart, where Delia hires regardless.
    if (!this.active) {
      if (this.cooldown > 0) {
        this.cooldown -= delta;
        return;
      }
      if (this.next >= this.jobs.length) return;
      const px = this.player.position.x;
      const pz = this.player.position.z;
      if (!this.district.isInside(px, pz)) return;
      const nearHeart = distance2D(this.player.position, HEART) < HEART_RADIUS;
      if (this.missions.activeMission && !nearHeart) return;
      this.offerJob(this.next);
      return;
    }

    // An active job progresses regardless of what Mara is doing.
    this.updateActiveJob(delta);
  }

  updateActiveJob(delta) {
    const job = this.active;
    const objective = job.objectives[job.currentObjective];
    if (!objective) return;
    const playerPos = this.player.position;

    switch (objective.type) {
      case 'goto':
      case 'pickup':
        this.updateGotoObjective(job, objective, playerPos);
        break;
      case 'survive':
        this.updateSurviveObjective(job, objective, delta, playerPos);
        break;
      case 'escape':
        this.updateEscapeObjective(job, objective, playerPos);
        break;
      default:
        this.updateGotoObjective(job, objective, playerPos);
        break;
    }
  }

  updateGotoObjective(job, objective, playerPos) {
    const target = objective.position;
    const dist = distance2D(playerPos, target);

    // Keep the marker and the HUD on the current target.
    this.marker.position.set(target.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, target.z);
    this.marker.visible = true;
    this.markerRing.position.set(target.x, 0.18, target.z);
    this.markerRing.visible = true;
    this.hud.setObjective(`${job.name}: Go to ${objective.target}`);
    this.hud.setWaypoint(target);

    if (dist < objective.radius) {
      this.completeObjective();
    }
  }

  updateSurviveObjective(job, objective, delta, playerPos) {
    // The clock starts the first frame the survive objective runs.
    // (The probes overwrite surviveStart to fast-forward; the field
    // stays a plain number so that works.)
    if (this.surviveStart === 0) {
      this.surviveStart = performance.now() / 1000;
      this.hud.showMessage(job.dialogue.trigger, 4);
      this.police.setWantedLevel(2);
    }

    const elapsed = performance.now() / 1000 - this.surviveStart;
    const remaining = Math.max(0, objective.duration - elapsed);

    // Halfway through, the heat goes up a star.
    if (!this.wantedEscalated && elapsed >= objective.duration / 2) {
      this.wantedEscalated = true;
      this.police.setWantedLevel(3);
    }

    this.marker.visible = false;
    this.markerRing.visible = false;
    this.hud.setObjective(`${job.name}: Survive ${Math.ceil(remaining)}s`);
    this.hud.setWaypoint(null);
    this.hud.showTimer(remaining);

    if (remaining <= 0) {
      this.surviveStart = 0;
      this.completeObjective();
    }
  }

  updateEscapeObjective(job, objective, playerPos) {
    const target = objective.position;
    const dist = distance2D(playerPos, target);

    this.marker.position.set(target.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, target.z);
    this.marker.visible = true;
    this.markerRing.position.set(target.x, 0.18, target.z);
    this.markerRing.visible = true;
    this.hud.setObjective(`${job.name}: Escape to ${objective.target}`);
    this.hud.setWaypoint(target);

    if (dist < objective.radius) {
      this.completeObjective();
    }
  }

  completeObjective() {
    const job = this.active;
    job.currentObjective++;
    this.surviveStart = 0;

    if (job.currentObjective >= job.objectives.length) {
      this.completeJob();
      return;
    }

    // Next objective: move the marker, say the line.
    const nextObj = job.objectives[job.currentObjective];
    if (nextObj.position) {
      this.marker.position.set(nextObj.position.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, nextObj.position.z);
      this.marker.visible = true;
      this.markerRing.position.set(nextObj.position.x, 0.18, nextObj.position.z);
      this.markerRing.visible = true;
    }
    const line = nextObj.type === 'pickup' ? job.dialogue.pickup
      : nextObj.type === 'escape' ? job.dialogue.escape
      : job.dialogue.progress;
    this.hud.showMessage(line, 4);
    playPickupSound();
  }

  completeJob() {
    const job = this.active;
    job.completed = true;
    this.completed.push(job.id);
    this.next = this.completed.length;
    this.done = this.next >= this.jobs.length;

    // Pay through the main ledger so the HUD cash stays in sync.
    this.missions.cash += job.reward;
    this.player.cash = this.missions.cash;

    // The yacht job clears the heat on completion.
    if (job.id === 'the-yacht-job') {
      this.police.setWantedLevel(0);
    }

    // Hide the markers and the timer.
    this.marker.visible = false;
    this.markerRing.visible = false;
    this.hud.setWaypoint(null);
    this.hud.setObjective('');
    this.hud.showTimer(0);

    this.hud.showMessage(job.dialogue.complete, 5);
    playMissionComplete();

    // Next job waits for the cooldown (the probes zero it).
    this.cooldown = OFFER_COOLDOWN;
    this.active = null;
  }
}
