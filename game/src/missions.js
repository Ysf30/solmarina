// Solmarina — round 4 authorship pass (recording 14): file re-emitted under a live recording.
// Round 4 pass 2: second recorded touch; game logic untouched.
// Solmarina - Mission System

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, createEmissiveMaterial, distance2D, clamp } from './utils.js';
import { MISSION_DEFS } from './config.js';

export class MissionSystem {
  constructor(scene, city, player, police, audio, hud) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.police = police;
    this.audio = audio;
    this.hud = hud;
    
    this.missions = MISSION_DEFS.map(def => ({ ...def, completed: false, currentObjective: 0 }));
    this.activeMission = null;
    this.missionMarker = null;
    this.objectiveMarker = null;
    this.missionBlip = null;
    
    // State
    this.missionTimer = 0;
    this.surviveStartTime = 0;
    this.enemiesEliminated = 0;
    this.enemiesToEliminate = 0;
    this.enemyPositions = [];
    
    // Progress
    this.completedMissions = [];
    this.cash = 0;
    
    // Create mission marker
    this.createMissionMarker();
  }
  
  createMissionMarker() {
    // Mission start marker (on map)
    const markerGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 16);
    const markerMat = createStandardMaterial(0xffcc00);
    this.missionStartMarker = new THREE.Mesh(markerGeo, markerMat);
    this.missionStartMarker.position.y = 0.15;
    this.scene.add(this.missionStartMarker);
    this.missionStartMarker.visible = false;
    
    // Active objective marker (3D)
    const objGeo = new THREE.ConeGeometry(CONFIG.MISSIONS.MARKER_SIZE, CONFIG.MISSIONS.MARKER_HEIGHT, 8);
    const objMat = createEmissiveMaterial(0xffcc00, 1);
    this.objectiveMarker = new THREE.Mesh(objGeo, objMat);
    this.objectiveMarker.position.y = CONFIG.MISSIONS.MARKER_HEIGHT / 2;
    this.objectiveMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.objectiveMarker);
    this.objectiveMarker.visible = false;
    
    // Pulse animation
    this.markerPulse = 0;
  }
  
  update(delta) {
    // Update marker pulse
    this.markerPulse += delta * 5;
    if (this.objectiveMarker.visible) {
      const scale = 1 + Math.sin(this.markerPulse) * 0.15;
      this.objectiveMarker.scale.setScalar(scale);
      this.objectiveMarker.material.opacity = 0.7 + Math.sin(this.markerPulse) * 0.3;
    }
    if (this.missionStartMarker.visible) {
      const scale = 1 + Math.sin(this.markerPulse * 0.7) * 0.1;
      this.missionStartMarker.scale.setScalar(scale);
    }
    
    if (!this.activeMission) {
      // Check for mission start
      this.checkMissionStart();
      return;
    }
    
    // Update active mission
    this.updateActiveMission(delta);
  }
  
  checkMissionStart() {
    const playerPos = this.player.position;
    
    for (const mission of this.missions) {
      if (mission.completed) continue;
      if (this.activeMission) return; // Already have active
      
      // Check if unlocked
      if (mission.unlocks && !this.completedMissions.includes(mission.unlocks)) {
        // Check if prerequisite is done
        const prereq = this.missions.find(m => m.id === mission.unlocks);
        if (!prereq || !prereq.completed) continue;
      }
      
      // For intro mission, always available at start
      if (mission.id === 'intro') {
        this.showMissionStart(mission);
        return;
      }
      
      // Other missions have specific start positions
      if (mission.objectives[0].type === 'goto') {
        const target = mission.objectives[0].position;
        const dist = distance2D(playerPos, target);
        if (dist < 50) { // Show marker when nearby
          this.showMissionStart(mission);
          return;
        }
      }
    }
  }
  
  showMissionStart(mission) {
    this.activeMission = mission;
    mission.currentObjective = 0;
    
    // Show start marker
    const firstObj = mission.objectives[0];
    if (firstObj.position) {
      this.missionStartMarker.position.copy(firstObj.position);
      this.missionStartMarker.position.y = 0.15;
      this.missionStartMarker.visible = true;
    }
    
    // Show HUD message
    this.hud.showMessage(mission.dialogue.start, 5);
    this.audio.playPickupSound();
  }
  
  updateActiveMission(delta) {
    if (!this.activeMission) return;
    
    const objective = this.activeMission.objectives[this.activeMission.currentObjective];
    if (!objective) return;
    
    const playerPos = this.player.position;
    
    switch (objective.type) {
      case 'goto':
        this.updateGotoObjective(objective, playerPos);
        break;
      case 'pickup':
        this.updatePickupObjective(objective, playerPos);
        break;
      case 'survive':
        this.updateSurviveObjective(objective, delta, playerPos);
        break;
      case 'eliminate':
        this.updateEliminateObjective(objective, playerPos);
        break;
      case 'escape':
        this.updateEscapeObjective(objective, playerPos);
        break;
    }
  }
  
  updateGotoObjective(objective, playerPos) {
    const target = objective.position;
    const dist = distance2D(playerPos, target);
    
    // Show objective marker
    this.objectiveMarker.position.set(target.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, target.z);
    this.objectiveMarker.visible = true;
    
    // Update HUD
    this.hud.setObjective(`${this.activeMission.name}: Go to ${objective.target}`);
    this.hud.setWaypoint(target);
    
    if (dist < objective.radius) {
      this.completeObjective();
    }
  }
  
  updatePickupObjective(objective, playerPos) {
    // Similar to goto but with pickup logic
    this.updateGotoObjective(objective, playerPos);
  }
  
  updateSurviveObjective(objective, delta, playerPos) {
    if (this.surviveStartTime === 0) {
      this.surviveStartTime = performance.now() / 1000;
      this.hud.showMessage(this.activeMission.dialogue.trigger, 4);
      this.police.setWantedLevel(3); // Instant 3 stars
    }
    
    const elapsed = performance.now() / 1000 - this.surviveStartTime;
    const remaining = Math.max(0, objective.duration - elapsed);
    
    this.objectiveMarker.visible = false;
    this.hud.setObjective(`${this.activeMission.name}: Survive ${Math.ceil(remaining)}s`);
    this.hud.setWaypoint(null);
    
    // Show timer
    this.hud.showTimer(remaining);
    
    if (remaining <= 0) {
      this.surviveStartTime = 0;
      this.completeObjective();
    }
  }
  
  updateEliminateObjective(objective, playerPos) {
    const target = objective.position;
    const dist = distance2D(playerPos, target);
    
    this.objectiveMarker.position.set(target.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, target.z);
    this.objectiveMarker.visible = true;
    
    this.hud.setObjective(`${this.activeMission.name}: Eliminate ${this.enemiesToEliminate - this.enemiesEliminated}/${this.enemiesToEliminate} rivals`);
    this.hud.setWaypoint(target);
    
    // Spawn enemies when player gets close
    if (dist < objective.radius + 20 && this.enemyPositions.length === 0) {
      this.spawnEnemies(objective);
    }
    
    if (this.enemiesEliminated >= this.enemiesToEliminate) {
      this.completeObjective();
    }
  }
  
  updateEscapeObjective(objective, playerPos) {
    const target = objective.position;
    const dist = distance2D(playerPos, target);
    
    this.objectiveMarker.position.set(target.x, CONFIG.MISSIONS.MARKER_HEIGHT / 2, target.z);
    this.objectiveMarker.visible = true;
    
    this.hud.setObjective(`${this.activeMission.name}: Escape to the helipad`);
    this.hud.setWaypoint(target);
    
    if (dist < objective.radius) {
      this.completeObjective();
    }
  }
  
  spawnEnemies(objective) {
    const { position, radius, count } = objective;
    this.enemiesToEliminate = count || 8;
    this.enemiesEliminated = 0;
    this.enemyPositions = [];
    
    for (let i = 0; i < this.enemiesToEliminate; i++) {
      const angle = (i / this.enemiesToEliminate) * Math.PI * 2;
      const r = radius * 0.5 + Math.random() * radius * 0.3;
      const x = position.x + Math.cos(angle) * r;
      const z = position.z + Math.sin(angle) * r;
      this.enemyPositions.push({ x, z, alive: true });
    }
  }
  
  onEnemyKilled(position) {
    // Check if this was a mission enemy
    for (const enemy of this.enemyPositions) {
      if (enemy.alive && distance2D(enemy, position) < 3) {
        enemy.alive = false;
        this.enemiesEliminated++;
        break;
      }
    }
  }
  
  completeObjective() {
    this.activeMission.currentObjective++;
    this.surviveStartTime = 0;
    this.enemyPositions = [];
    this.enemiesEliminated = 0;
    this.enemiesToEliminate = 0;
    
    if (this.activeMission.currentObjective >= this.activeMission.objectives.length) {
      // Mission complete!
      this.completeMission();
    } else {
      // Next objective
      const nextObj = this.activeMission.objectives[this.activeMission.currentObjective];
      if (nextObj.position) {
        this.missionStartMarker.position.copy(nextObj.position);
        this.missionStartMarker.visible = true;
      }
      this.hud.showMessage(this.getDialogueForObjective(nextObj), 4);
      this.audio.playPickupSound();
    }
  }
  
  getDialogueForObjective(objective) {
    const dialogues = this.activeMission.dialogue;
    switch (objective.type) {
      case 'pickup': return dialogues.pickup || dialogues.progress;
      case 'survive': return dialogues.trigger || dialogues.progress;
      case 'eliminate': return dialogues.progress;
      case 'escape': return dialogues.escape || dialogues.progress;
      default: return dialogues.progress;
    }
  }
  
  completeMission() {
    const mission = this.activeMission;
    mission.completed = true;
    this.completedMissions.push(mission.id);
    
    // Reward
    this.cash += mission.reward;
    this.player.cash = this.cash;
    
    // Hide markers
    this.missionStartMarker.visible = false;
    this.objectiveMarker.visible = false;
    this.hud.setWaypoint(null);
    this.hud.setObjective('');
    this.hud.showTimer(0);
    
    // Show completion
    this.hud.showMessage(mission.dialogue.complete, 5);
    this.audio.playMissionComplete();
    
    // Unlock next
    if (mission.unlocks) {
      setTimeout(() => {
        this.hud.showMessage(`New mission unlocked: ${this.missions.find(m => m.id === mission.unlocks)?.name}`, 4);
      }, 3000);
    }
    
    this.activeMission = null;
  }
  
  // Called when player enters a vehicle during mission
  onVehicleEnter() {}
  
  // Called when player exits vehicle
  onVehicleExit() {}
  
  getState() {
    return {
      completedMissions: this.completedMissions,
      cash: this.cash,
      activeMission: this.activeMission ? this.activeMission.id : null,
      activeObjective: this.activeMission ? this.activeMission.currentObjective : -1,
    };
  }
  
  setState(state) {
    this.completedMissions = state.completedMissions || [];
    this.cash = state.cash || 0;
    this.player.cash = this.cash;
    
    // Mark missions as completed
    for (const id of this.completedMissions) {
      const m = this.missions.find(m => m.id === id);
      if (m) m.completed = true;
    }
    
    // Restore active mission if any
    if (state.activeMission) {
      this.activeMission = this.missions.find(m => m.id === state.activeMission);
      if (this.activeMission) {
        this.activeMission.currentObjective = state.activeObjective || 0;
      }
    }
  }
}

