// Solmarina — round 4 authorship pass (recording 14): file re-emitted under a live recording.
// Round 4 pass 2: second recorded touch; game logic untouched.
// Solmarina - Police / Wanted System

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, clamp, distance2D, distance2DSq, createRandom } from './utils.js';
import { Vehicle } from './vehicles.js';

export class PoliceSystem {
  constructor(scene, city, audio, player, traffic) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.player = player;
    this.traffic = traffic;
    this.random = createRandom(55555);
    
    // Wanted state
    this.wantedLevel = 0;
    this.wantedStars = 0;
    this.crimePoints = 0;
    this.wantedDecayTimer = 0;
    this.isSearching = false;
    this.searchCenter = new THREE.Vector3();
    this.searchRadius = 0;
    
    // Police units
    this.policeCars = [];
    this.helicopters = [];
    this.maxPolice = CONFIG.WANTED.MAX_POLICE;
    this.maxHelicopters = CONFIG.WANTED.MAX_HELICOPTERS;
    
    // Spawn timers
    this.spawnTimer = 0;
    this.heliSpawnTimer = 0;
    
    // Busted state
    this.busted = false;
    this.bustedTimer = 0;
    this.bustedReason = '';
  }
  
  update(delta) {
    if (this.busted) {
      this.updateBusted(delta);
      return;
    }
    
    // Update wanted level decay
    this.updateWantedDecay(delta);
    
    // Update police cars
    for (let i = this.policeCars.length - 1; i >= 0; i--) {
      const cop = this.policeCars[i];
      cop.update(delta, this.player.position);
      
      // Check despawn
      const dist = distance2D(cop.position, this.player.position);
      if (dist > CONFIG.WANTED.POLICE_DESPAWN_RADIUS || cop.isDestroyed) {
        this.removePoliceCar(i);
      }
    }
    
    // Update helicopters
    for (let i = this.helicopters.length - 1; i >= 0; i--) {
      const heli = this.helicopters[i];
      heli.update(delta, this.player.position);
      
      const dist = distance2D(heli.position, this.player.position);
      if (dist > CONFIG.WANTED.POLICE_DESPAWN_RADIUS * 1.5) {
        this.removeHelicopter(i);
      }
    }
    
    // Spawn new police
    this.spawnTimer += delta;
    if (this.spawnTimer > 3) {
      this.spawnTimer = 0;
      this.trySpawnPolice();
    }
    
    this.heliSpawnTimer += delta;
    if (this.heliSpawnTimer > 10) {
      this.heliSpawnTimer = 0;
      this.trySpawnHelicopter();
    }
    
    // Check for bust (player on foot near police)
    this.checkBust();
  }
  
  updateWantedDecay(delta) {
    if (this.wantedLevel > 0) {
      // Check if player is hidden (not in sight of police)
      let visible = false;
      for (const cop of this.policeCars) {
        if (this.canSeePlayer(cop)) {
          visible = true;
          break;
        }
      }
      for (const heli of this.helicopters) {
        if (this.canSeePlayer(heli)) {
          visible = true;
          break;
        }
      }
      
      if (!visible) {
        this.wantedDecayTimer += delta;
        const decayTime = CONFIG.WANTED.STAR_DECAY[this.wantedLevel];
        if (this.wantedDecayTimer >= decayTime) {
          this.wantedDecayTimer = 0;
          this.setWantedLevel(this.wantedLevel - 1);
        }
      } else {
        this.wantedDecayTimer = 0;
      }
    }
  }
  
  canSeePlayer(unit) {
    const dist = distance2D(unit.position, this.player.position);
    if (dist > CONFIG.WANTED.SEARCH_RADIUS[this.wantedLevel]) return false;
    
    // Line of sight check (simplified)
    const forward = new THREE.Vector3(Math.sin(unit.rotation), 0, Math.cos(unit.rotation));
    const toPlayer = new THREE.Vector3().subVectors(this.player.position, unit.position).normalize();
    const dot = forward.dot(toPlayer);
    
    return dist < 50 || dot > 0.5; // Can see if close or in front cone
  }
  
  trySpawnPolice() {
    const maxCops = this.maxPolice[this.wantedLevel];
    if (this.policeCars.length >= maxCops) return;
    
    // Find spawn position away from player but within spawn radius
    const spawnPos = this.findPoliceSpawn();
    if (!spawnPos) return;
    
    const cop = new Vehicle(this.scene, this.city, this.audio, 'police', CONFIG.PALETTE.POLICE);
    cop.position.copy(spawnPos);
    cop.mesh.position.copy(spawnPos);
    cop.rotation = spawnPos.userData?.rotation || 0;
    cop.engineOn = true;
    cop.setSiren(true);
    cop.setAIInput(this.generatePoliceAI(spawnPos));
    cop.isPolice = true;
    
    this.policeCars.push(cop);
  }
  
  trySpawnHelicopter() {
    const maxHelis = this.maxHelicopters[this.wantedLevel];
    if (this.helicopters.length >= maxHelis) return;
    if (this.wantedLevel < 3) return; // Helis only at 3+ stars
    
    // Spawn helicopter above player
    const angle = this.random() * Math.PI * 2;
    const radius = 60 + this.random() * 40;
    const x = this.player.position.x + Math.cos(angle) * radius;
    const z = this.player.position.z + Math.sin(angle) * radius;
    const y = 40;
    
    const heli = new Helicopter(this.scene, this.city, this.audio, x, y, z);
    this.helicopters.push(heli);
  }
  
  findPoliceSpawn() {
    const { WORLD } = CONFIG;
    const { HALF_SIZE } = WORLD;
    const spawnRadius = CONFIG.WANTED.POLICE_SPAWN_RADIUS;
    const attempts = 10;
    
    for (let i = 0; i < attempts; i++) {
      // Try to spawn on a street near player
      const nodes = this.city.trafficNodes.filter(n => n.type === 'street');
      if (nodes.length === 0) continue;
      
      const node = nodes[Math.floor(this.random() * nodes.length)];
      const dist = distance2D(node, this.player.position);
      
      if (dist > 40 && dist < spawnRadius) {
        // Check clear
        let clear = true;
        for (const cop of this.policeCars) {
          if (distance2DSq(cop.position, node) < 100) { clear = false; break; }
        }
        for (const v of this.traffic.vehicles) {
          if (distance2DSq(v.position, node) < 25) { clear = false; break; }
        }
        
        if (clear) {
          return { x: node.x, y: 0.5, z: node.z, userData: { rotation: node.dir === 'x' ? Math.PI / 2 : 0 } };
        }
      }
    }
    return null;
  }
  
  generatePoliceAI(spawnPos) {
    return {
      accel: 0.8,
      brake: 0,
      steer: 0,
      handbrake: false,
      targetSpeed: 25 + this.wantedLevel * 3,
      laneOffset: 0,
      isPolice: true,
      behavior: 'chase',
      lastShootTime: 0,
    };
  }
  
  removePoliceCar(index) {
    const cop = this.policeCars[index];
    if (cop) {
      this.scene.remove(cop.mesh);
      this.audio.stopEngineSound(cop);
      this.audio.playSiren(cop, false);
    }
    this.policeCars.splice(index, 1);
  }
  
  removeHelicopter(index) {
    const heli = this.helicopters[index];
    if (heli) {
      heli.destroy();
    }
    this.helicopters.splice(index, 1);
  }
  
  checkBust() {
    if (this.player.inVehicle) return; // Can't be busted in vehicle (wasted instead)
    if (this.wantedLevel === 0) return;
    
    for (const cop of this.policeCars) {
      const dist = distance2D(cop.position, this.player.position);
      if (dist < 3 && Math.abs(cop.speed) < 2) {
        // Busted!
        this.bustPlayer('Arrested by police');
        break;
      }
    }
  }
  
  // Report a crime
  reportCrime(crimeType, position = null) {
    const crimeValue = CONFIG.WANTED.CRIME_VALUES[crimeType] || 1;
    this.crimePoints += crimeValue;
    
    // Escalate wanted level based on crime points
    const thresholds = CONFIG.WANTED.ESCALATION_THRESHOLD;
    for (let i = thresholds.length - 1; i >= 1; i--) {
      if (this.crimePoints >= thresholds[i] && this.wantedLevel < i) {
        this.setWantedLevel(i);
        break;
      }
    }
    
    // If player was at 0 stars, set search center
    if (this.wantedLevel === 1 && !this.isSearching) {
      this.isSearching = true;
      this.searchCenter.copy(position || this.player.position);
      this.searchRadius = CONFIG.WANTED.SEARCH_RADIUS[1];
    }
  }
  
  setWantedLevel(level) {
    const oldLevel = this.wantedLevel;
    this.wantedLevel = clamp(level, 0, CONFIG.WANTED.MAX_STARS);
    this.wantedStars = this.wantedLevel;
    this.wantedDecayTimer = 0;
    
    if (this.wantedLevel > oldLevel) {
      this.audio.playWantedLevelChange(this.wantedLevel);
      this.isSearching = true;
      this.searchCenter.copy(this.player.position);
      this.searchRadius = CONFIG.WANTED.SEARCH_RADIUS[this.wantedLevel];
    }
    
    if (this.wantedLevel === 0) {
      this.isSearching = false;
      this.crimePoints = 0;
      // Despawn all police
      while (this.policeCars.length > 0) this.removePoliceCar(0);
      while (this.helicopters.length > 0) this.removeHelicopter(0);
    }
  }
  
  bustPlayer(reason) {
    this.busted = true;
    this.bustedTimer = 0;
    this.bustedReason = reason;
    
    // Reset player
    this.player.takeDamage(999); // Wasted
    this.setWantedLevel(0);
    this.player.cash = Math.floor(this.player.cash * 0.5); // Lose half cash
  }
  
  updateBusted(delta) {
    this.bustedTimer += delta;
    if (this.bustedTimer > 3) {
      // Respawn player
      this.respawnPlayer();
    }
  }
  
  respawnPlayer() {
    const spawn = this.city.getPlayerSpawn();
    this.player.position.copy(spawn);
    this.player.health = this.player.maxHealth;
    this.player.isDead = false;
    this.player.velocity.set(0, 0, 0);
    this.busted = false;
    this.bustedTimer = 0;
  }
  
  // Player died (wasted)
  onPlayerWasted() {
    this.setWantedLevel(0);
    this.player.cash = Math.floor(this.player.cash * 0.5);
  }
  
  getWantedLevel() {
    return this.wantedLevel;
  }
  
  getStars() {
    return this.wantedStars;
  }
  
  isPlayerWanted() {
    return this.wantedLevel > 0;
  }
  
  getState() {
    return {
      wantedLevel: this.wantedLevel,
      crimePoints: this.crimePoints,
      wantedDecayTimer: this.wantedDecayTimer,
      isSearching: this.isSearching,
      searchCenter: this.searchCenter.clone(),
      searchRadius: this.searchRadius,
    };
  }
  
  setState(state) {
    this.wantedLevel = state.wantedLevel;
    this.wantedStars = state.wantedLevel;
    this.crimePoints = state.crimePoints;
    this.wantedDecayTimer = state.wantedDecayTimer;
    this.isSearching = state.isSearching;
    this.searchCenter.copy(state.searchCenter);
    this.searchRadius = state.searchRadius;
  }
}

// Helicopter class
class Helicopter {
  constructor(scene, city, audio, x, y, z) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0;
    this.targetPosition = new THREE.Vector3(x, y, z);
    this.rotorAngle = 0;
    this.searchLightAngle = 0;
    this.searchLightOn = true;
    
    this.createMesh();
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    
    const bodyMat = createStandardMaterial(0x1a3a6a);
    const glassMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a2a3a, 
      metalness: 0.8, 
      roughness: 0.1, 
      transparent: true, 
      opacity: 0.5 
    });
    const rotorMat = createStandardMaterial(0x2a2a2a);
    const searchLightMat = new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(1.5, 0.8, 3);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    this.mesh.add(body);
    
    // Cockpit
    const cockpitGeo = new THREE.BoxGeometry(1.2, 0.7, 1.5);
    const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
    cockpit.position.y = 1.0;
    cockpit.position.z = -0.3;
    this.mesh.add(cockpit);
    
    // Tail
    const tailGeo = new THREE.BoxGeometry(0.3, 0.3, 2.5);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.y = 0.4;
    tail.position.z = 2;
    this.mesh.add(tail);
    
    // Tail rotor
    const tailRotorGeo = new THREE.BoxGeometry(1.5, 0.05, 0.1);
    const tailRotor = new THREE.Mesh(tailRotorGeo, rotorMat);
    tailRotor.position.set(0, 0.4, 3.2);
    this.mesh.add(tailRotor);
    this.tailRotor = tailRotor;
    
    // Main rotor
    const rotorGeo = new THREE.BoxGeometry(6, 0.05, 0.2);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.y = 1.6;
    this.mesh.add(rotor);
    this.mainRotor = rotor;
    
    // Skids
    const skidGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
    const skidMat = createStandardMaterial(0x3a3a3a);
    for (let side of [-1, 1]) {
      const skid = new THREE.Mesh(skidGeo, skidMat);
      skid.position.set(side * 0.8, -0.2, 0);
      skid.rotation.z = Math.PI / 2;
      this.mesh.add(skid);
    }
    
    // Search light
    const lightGeo = new THREE.ConeGeometry(5, 20, 8, 1, true);
    this.searchLight = new THREE.Mesh(lightGeo, searchLightMat);
    this.searchLight.position.y = -0.5;
    this.searchLight.rotation.x = -Math.PI / 2;
    this.mesh.add(this.searchLight);
    
    // Police lights
    const plGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const plMat = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0 });
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.Mesh(plGeo, plMat);
      pl.position.set((i === 0 ? -1 : 1) * 0.8, 1.2, -1);
      this.mesh.add(pl);
    }
    this.policeLights = this.mesh.children.filter(c => c.material === plMat);
    
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }
  
  update(delta, playerPos) {
    // Target position above player
    this.targetPosition.set(playerPos.x, 40, playerPos.z);
    
    // Move towards target
    const toTarget = new THREE.Vector3().subVectors(this.targetPosition, this.position);
    const dist = toTarget.length();
    
    if (dist > 5) {
      toTarget.normalize().multiplyScalar(15 * delta);
      this.velocity.lerp(toTarget, delta * 2);
    } else {
      this.velocity.multiplyScalar(0.9);
    }
    
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    
    // Face player
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position).normalize();
    this.rotation = Math.atan2(toPlayer.x, toPlayer.z);
    
    // Rotor animation
    this.rotorAngle += delta * 50;
    this.mainRotor.rotation.y = this.rotorAngle;
    this.tailRotor.rotation.z = this.rotorAngle * 3;
    
    // Search light
    this.searchLightAngle += delta * 0.5;
    this.searchLight.rotation.y = this.searchLightAngle;
    this.searchLight.position.copy(this.position).add(new THREE.Vector3(0, -0.5, 0));
    
    // Police lights flash
    const t = performance.now() * 0.01;
    for (let i = 0; i < this.policeLights.length; i++) {
      this.policeLights[i].material.opacity = Math.sin(t + i * Math.PI) > 0 ? 1 : 0;
    }
    
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
  
  destroy() {
    this.scene.remove(this.mesh);
  }
}

