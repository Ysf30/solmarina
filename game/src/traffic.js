// Solmarina — round 4 authorship pass (recording 14): file re-emitted under a live recording.
// Round 4 pass 2: second recorded touch; game logic untouched.
// Solmarina - Traffic System (AI Vehicles & Pedestrians)

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, clamp, distance2D, distance2DSq, createRandom } from './utils.js';
import { Vehicle, VEHICLE_TYPES } from './vehicles.js';

export class TrafficSystem {
  constructor(scene, city, audio, player) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.player = player;
    this.random = createRandom(98765);
    
    this.vehicles = [];
    this.pedestrians = [];
    this.maxVehicles = CONFIG.TRAFFIC.MAX_VEHICLES;
    this.maxPedestrians = CONFIG.TRAFFIC.MAX_PEDESTRIANS;
    
    this.spawnTimer = 0;
    this.despawnCheckTimer = 0;
  }
  
  update(delta, timeOfDay) {
    // Update existing vehicles
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const vehicle = this.vehicles[i];
      vehicle.update(delta);
      
      // Check despawn
      const dist = distance2D(vehicle.position, this.player.position);
      if (dist > CONFIG.TRAFFIC.DESPAWN_DISTANCE || vehicle.isDestroyed) {
        this.removeVehicle(i);
      }
    }
    
    // Update pedestrians
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const ped = this.pedestrians[i];
      ped.update(delta, this.player.position);
      
      const dist = distance2D(ped.position, this.player.position);
      if (dist > CONFIG.TRAFFIC.DESPAWN_DISTANCE) {
        this.removePedestrian(i);
      }
    }
    
    // Spawn new
    this.spawnTimer += delta;
    if (this.spawnTimer > 2) {
      this.spawnTimer = 0;
      this.trySpawn();
    }
    
    // Despawn check
    this.despawnCheckTimer += delta;
    if (this.despawnCheckTimer > 5) {
      this.despawnCheckTimer = 0;
      this.cleanupDistant();
    }
  }
  
  trySpawn() {
    const playerPos = this.player.position;
    
    // Spawn vehicles
    while (this.vehicles.length < this.maxVehicles) {
      const spawnPos = this.findVehicleSpawn(playerPos);
      if (!spawnPos) break;
      
      const type = VEHICLE_TYPES[Math.floor(this.random() * VEHICLE_TYPES.length)];
      const vehicle = new Vehicle(this.scene, this.city, this.audio, type);
      vehicle.position.copy(spawnPos);
      vehicle.mesh.position.copy(spawnPos);
      vehicle.rotation = spawnPos.userData?.rotation || 0;
      vehicle.engineOn = true;
      vehicle.setAIInput(this.generateAIInput(spawnPos));
      this.vehicles.push(vehicle);
    }
    
    // Spawn pedestrians
    while (this.pedestrians.length < this.maxPedestrians) {
      const spawnPos = this.findPedestrianSpawn(playerPos);
      if (!spawnPos) break;
      
      const ped = new Pedestrian(this.scene, this.city, this.audio, spawnPos, this.random);
      this.pedestrians.push(ped);
    }
  }
  
  findVehicleSpawn(playerPos) {
    const { TRAFFIC } = CONFIG;
    const nodes = this.city.trafficNodes.filter(n => n.type === 'street');
    if (nodes.length === 0) return null;

    // Pre-filter to the spawn ring ONCE, then pick uniformly inside it.
    // Uniform-random picks over the whole city almost never landed in the
    // thin 55–180 ring (44 of 1854 nodes), so trySpawn usually filled
    // nothing and the streets stayed empty.
    const inBand = nodes.filter(n => {
      const d = distance2D(n, playerPos);
      return d > TRAFFIC.SPAWN_DISTANCE && d < TRAFFIC.DESPAWN_DISTANCE;
    });
    if (inBand.length === 0) return null;

    for (let i = 0; i < 40; i++) {
      const node = inBand[Math.floor(this.random() * inBand.length)];
      // Check if spot is clear
      let clear = true;
      for (const v of this.vehicles) {
        if (distance2DSq(v.position, node) < 25) { clear = false; break; }
      }
      if (clear) {
        return { x: node.x, y: 0.5, z: node.z, userData: { rotation: node.dir === 'x' ? Math.PI / 2 : 0 } };
      }
    }
    return null;
  }
  
  findPedestrianSpawn(playerPos) {
    const { TRAFFIC } = CONFIG;
    const nodes = this.city.pedestrianNodes;
    if (nodes.length === 0) return null;

    // Same thin-ring fix as vehicles: pre-filter to the spawn ring, then
    // pick uniformly inside it.
    const inBand = nodes.filter(n => {
      const d = distance2D(n, playerPos);
      return d > TRAFFIC.SPAWN_DISTANCE && d < TRAFFIC.DESPAWN_DISTANCE;
    });
    if (inBand.length === 0) return null;

    for (let i = 0; i < 40; i++) {
      const node = inBand[Math.floor(this.random() * inBand.length)];
      let clear = true;
      for (const p of this.pedestrians) {
        if (distance2DSq(p.position, node) < 9) { clear = false; break; }
      }
      if (clear) {
        return { x: node.x, y: 0, z: node.z };
      }
    }
    return null;
  }
  
  generateAIInput(spawnNode) {
    // Determine initial direction based on street
    const dir = spawnNode.userData?.rotation || 0;
    return {
      accel: 0.5 + this.random() * 0.3,
      brake: 0,
      steer: 0,
      handbrake: false,
      targetSpeed: CONFIG.TRAFFIC.SPEED_MIN + this.random() * (CONFIG.TRAFFIC.SPEED_MAX - CONFIG.TRAFFIC.SPEED_MIN),
      laneOffset: (this.random() - 0.5) * 2,
      nextNodeIndex: 0,
      path: this.generatePath(spawnNode),
    };
  }
  
  generatePath(startNode) {
    // Simple path: follow street nodes
    const path = [];
    const nodes = this.city.trafficNodes.filter(n => n.type === 'street');
    
    // Find nearby nodes and create a path
    let current = startNode;
    for (let i = 0; i < 10; i++) {
      const next = this.findNextNode(current, nodes);
      if (!next) break;
      path.push(next);
      current = next;
    }
    return path;
  }
  
  findNextNode(current, nodes) {
    let best = null;
    let bestDist = Infinity;
    
    for (const node of nodes) {
      const dist = distance2DSq(current, node);
      if (dist > 400 && dist < 1600 && dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }
  
  cleanupDistant() {
    const playerPos = this.player.position;
    
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      if (distance2D(this.vehicles[i].position, playerPos) > CONFIG.TRAFFIC.DESPAWN_DISTANCE) {
        this.removeVehicle(i);
      }
    }
    
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      if (distance2D(this.pedestrians[i].position, playerPos) > CONFIG.TRAFFIC.DESPAWN_DISTANCE) {
        this.removePedestrian(i);
      }
    }
  }
  
  removeVehicle(index) {
    const vehicle = this.vehicles[index];
    if (vehicle) {
      this.scene.remove(vehicle.mesh);
      this.audio.stopEngineSound(vehicle);
      this.audio.playSiren(vehicle, false);
    }
    this.vehicles.splice(index, 1);
  }
  
  removePedestrian(index) {
    const ped = this.pedestrians[index];
    if (ped) {
      this.scene.remove(ped.mesh);
    }
    this.pedestrians.splice(index, 1);
  }
  
  // Get nearest vehicle for stealing
  getNearestVehicle(playerPos, range = CONFIG.VEHICLE.ENTER_RANGE) {
    let nearest = null;
    let nearestDist = range * range;
    
    for (const vehicle of this.vehicles) {
      if (vehicle.driver) continue; // Already driven
      const dist = distance2DSq(vehicle.position, playerPos);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = vehicle;
      }
    }
    
    // Also check parked vehicles
    for (const spot of this.city.parkingSpots) {
      const dist = distance2DSq(spot, playerPos);
      if (dist < nearestDist) {
        nearestDist = dist;
        // Create a parked vehicle on the spot
        const type = VEHICLE_TYPES[Math.floor(this.random() * VEHICLE_TYPES.length)];
        const vehicle = new Vehicle(this.scene, this.city, this.audio, type);
        vehicle.position.set(spot.x, 0.5, spot.z);
        vehicle.rotation = spot.rotation;
        vehicle.mesh.position.copy(vehicle.position);
        vehicle.mesh.rotation.y = vehicle.rotation;
        vehicle.engineOn = false;
        this.vehicles.push(vehicle);
        nearest = vehicle;
      }
    }
    
    return nearest;
  }
  
  // Called when player steals a vehicle
  onVehicleStolen(vehicle) {
    vehicle.driver = this.player;
    vehicle.engineOn = true;
  }
  
  getAllVehicles() {
    return this.vehicles;
  }
  
  getAllPedestrians() {
    return this.pedestrians;
  }
}

// Pedestrian class
class Pedestrian {
  constructor(scene, city, audio, spawnPos, random) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.random = random;
    
    this.position = new THREE.Vector3(spawnPos.x, 0, spawnPos.z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = this.random() * Math.PI * 2;
    this.targetRotation = this.rotation;
    this.speed = 0;
    // Walk speed from the start: the initial state is 'walk', and no
    // transition ever set targetSpeed, so pedestrians used to stand frozen.
    this.targetSpeed = CONFIG.TRAFFIC.PEDESTRIAN_SPEED;
    this.state = 'walk'; // walk, run, flee, idle
    this.stateTimer = 0;
    this.health = 50;
    this.isDead = false;
    
    // Appearance
    this.createMesh();
    
    // Path following
    this.currentNode = null;
    this.nextNode = null;
    this.path = [];
    this.pathIndex = 0;
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    
    const skinColors = [0xd8b898, 0xc8a888, 0xe8c8a8, 0xb89878, 0xa88868];
    const clothColors = [
      0x2a5a8a, 0x8a3a3a, 0x3a7a3a, 0x7a5a2a, 0x5a3a7a,
      0x8a7a3a, 0x3a7a7a, 0x7a3a5a, 0x4a4a5a, 0x6a5a4a
    ];
    
    const skinColor = skinColors[Math.floor(this.random() * skinColors.length)];
    const clothColor = clothColors[Math.floor(this.random() * clothColors.length)];
    
    const skinMat = createStandardMaterial(skinColor);
    const clothMat = createStandardMaterial(clothColor);
    const darkMat = createStandardMaterial(0x1a1a1a);
    
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.7, 4, 8);
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.position.y = 1.1;
    body.castShadow = true;
    this.mesh.add(body);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    this.mesh.add(head);
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, darkMat);
    this.leftLeg.position.set(-0.1, 0.6, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);
    
    this.rightLeg = new THREE.Mesh(legGeo, darkMat);
    this.rightLeg.position.set(0.1, 0.6, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);
    
    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.4, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.28, 1.2, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);
    
    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.28, 1.2, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);
    
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.scene.add(this.mesh);
  }
  
  update(delta, playerPos) {
    if (this.isDead) {
      this.updateDeath(delta);
      return;
    }
    
    // Check distance to player
    const distToPlayer = distance2D(this.position, playerPos);
    
    // State machine
    this.stateTimer += delta;
    
    if (distToPlayer < 5) {
      // Flee from player
      this.state = 'flee';
      const away = new THREE.Vector3().subVectors(this.position, playerPos).normalize();
      this.targetRotation = Math.atan2(away.x, away.z);
      this.targetSpeed = CONFIG.TRAFFIC.PEDESTRIAN_RUN_SPEED;
    } else if (this.state === 'flee' && this.stateTimer > 3) {
      this.state = 'walk';
      this.stateTimer = 0;
      this.targetSpeed = CONFIG.TRAFFIC.PEDESTRIAN_SPEED;
    } else if (this.state === 'idle' && this.stateTimer > 3 + this.random() * 5) {
      this.state = 'walk';
      this.stateTimer = 0;
      this.targetSpeed = CONFIG.TRAFFIC.PEDESTRIAN_SPEED;
      this.pickNewDestination();
    } else if (this.state === 'walk' && this.stateTimer > 5 + this.random() * 10) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.targetSpeed = 0;
    }
    
    // Update movement
    if (this.state === 'walk' || this.state === 'flee') {
      if (!this.nextNode || distance2D(this.position, this.nextNode) < 2) {
        this.pickNewDestination();
      }
      
      if (this.nextNode) {
        const dir = new THREE.Vector3().subVectors(this.nextNode, this.position).normalize();
        this.targetRotation = Math.atan2(dir.x, dir.z);
      }
    }
    
    // Smooth rotation
    let diff = this.targetRotation - this.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rotation += diff * delta * 5;
    
    // Speed
    this.speed += (this.targetSpeed - this.speed) * delta * 5;
    
    // Move
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    
    // Ground
    const groundY = this.city.raycastGround(this.position.x, this.position.z);
    this.position.y = groundY;
    
    // Avoid buildings
    this.avoidBuildings();
    
    // Animation
    this.updateAnimation(delta);
    
    // Update mesh
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
  
  pickNewDestination() {
    const nodes = this.city.pedestrianNodes;
    if (nodes.length === 0) return;
    
    // Find nearby node
    let best = null;
    let bestDist = Infinity;
    for (const node of nodes) {
      const dist = distance2DSq(this.position, node);
      if (dist > 100 && dist < 2500 && dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    
    if (best) {
      this.nextNode = new THREE.Vector3(best.x, 0, best.z);
    }
  }
  
  avoidBuildings() {
    for (const building of this.city.buildings) {
      const bx = building.position.x;
      const bz = building.position.z;
      const bw = building.userData.bw / 2 + 1;
      const bd = building.userData.bd / 2 + 1;
      
      if (this.position.x > bx - bw && this.position.x < bx + bw &&
          this.position.z > bz - bd && this.position.z < bz + bd) {
        // Push out
        const dx = this.position.x - bx;
        const dz = this.position.z - bz;
        const overlapX = bw - Math.abs(dx);
        const overlapZ = bd - Math.abs(dz);
        
        if (overlapX < overlapZ) {
          this.position.x += dx > 0 ? overlapX : -overlapX;
        } else {
          this.position.z += dz > 0 ? overlapZ : -overlapZ;
        }
      }
    }
  }
  
  updateAnimation(delta) {
    if (this.speed > 0.5) {
      const animSpeed = this.state === 'flee' ? 12 : 8;
      const time = performance.now() * 0.001 * animSpeed;
      const swing = Math.sin(time) * 0.8;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.5;
      this.rightArm.rotation.x = swing * 0.5;
    } else {
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
    }
  }
  
  updateDeath(delta) {
    this.mesh.rotation.x += delta * 2;
    this.mesh.position.y -= delta * 0.3;
  }
  
  takeDamage(amount, fromPos) {
    if (this.isDead) return;
    
    this.health -= amount;
    
    if (this.health <= 0) {
      this.die();
    } else {
      // Flee from attacker
      this.state = 'flee';
      this.stateTimer = 0;
      const away = new THREE.Vector3().subVectors(this.position, fromPos).normalize();
      this.targetRotation = Math.atan2(away.x, away.z);
      this.targetSpeed = CONFIG.TRAFFIC.PEDESTRIAN_RUN_SPEED;
    }
  }
  
  die() {
    this.isDead = true;
    this.velocity.set(0, 0, 0);
  }
}

