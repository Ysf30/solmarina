// Solmarina — round 4 authorship pass (recording 14): file re-emitted under a live recording.
// Round 4 pass 2: second recorded touch; game logic untouched.
// Solmarina - Drivable Vehicles

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, clamp, lerpVec3, angleDiff } from './utils.js';
import { ACTION } from './input.js';

export class Vehicle {
  constructor(scene, city, audio, type = 'sedan', color = null) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.type = type;
    
    // Physics state
    this.position = new THREE.Vector3(0, 0.5, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0;
    this.angularVelocity = 0;
    this.speed = 0;
    this.rpm = 0;
    this.gear = 1;
    this.engineOn = false;
    
    // Health
    this.health = CONFIG.VEHICLE.HEALTH;
    this.maxHealth = CONFIG.VEHICLE.HEALTH;
    this.isDestroyed = false;
    this.isBurning = false;
    this.fireTime = 0;
    
    // Driver
    this.driver = null;
    
    // Input state
    this.input = { accel: 0, brake: 0, steer: 0, handbrake: false };

    // Cruise control target speed (units/s) or null to disable. When set,
    // updatePhysics holds this speed with no driver input (used by the
    // chase screenshot preset so the car doesn't coast to a stop).
    this.cruiseSpeed = null;

    // Cruise distance cap (units travelled under cruise, or null for
    // unlimited). When reached the car brakes to a stop and stays there.
    // The chase preset uses it so the car ends parked at a known spot:
    // headless captures simulate anywhere from ~15 to ~60 game-seconds
    // in a 30 s virtual-time budget, so an uncapped cruise ends up
    // anywhere from mid-city to the world edge depending on the run.
    this.cruiseDistance = null;
    this.cruiseTraveled = 0;
    
    // Visual
    this.color = color || CONFIG.PALETTE.VEHICLE_COLORS[Math.floor(Math.random() * CONFIG.PALETTE.VEHICLE_COLORS.length)];
    this.wheelPositions = []; // Will be populated by createMesh
    this.createMesh();

    // Wheels for visual
    this.wheelMeshes = [];
    this.createWheels();
    
    // Skid marks
    this.skidMarks = [];
    this.lastSkidTime = 0;
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    
    const { VEHICLE } = CONFIG;
    const bodyMat = createStandardMaterial(this.color);
    const glassMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a2a3a, 
      metalness: 0.8, 
      roughness: 0.1, 
      transparent: true, 
      opacity: 0.6 
    });
    const darkMat = createStandardMaterial(0x1a1a1a);
    const lightMat = createStandardMaterial(0xffee88);
    const redLightMat = createStandardMaterial(0xff2222);
    
    let bodyGeo, cabinGeo, width, length, height;
    
    switch (this.type) {
      case 'sports':
        width = 1.8; length = 4.0; height = 1.1;
        bodyGeo = new THREE.BoxGeometry(width, height * 0.6, length);
        cabinGeo = new THREE.BoxGeometry(width * 0.7, height * 0.5, length * 0.4);
        break;
      case 'suv':
        width = 1.9; length = 4.5; height = 1.6;
        bodyGeo = new THREE.BoxGeometry(width, height * 0.7, length);
        cabinGeo = new THREE.BoxGeometry(width * 0.8, height * 0.6, length * 0.5);
        break;
      case 'truck':
        width = 2.2; length = 5.5; height = 2.0;
        bodyGeo = new THREE.BoxGeometry(width, height * 0.6, length);
        cabinGeo = new THREE.BoxGeometry(width * 0.85, height * 0.7, length * 0.35);
        break;
      case 'police':
        width = 1.85; length = 4.8; height = 1.4;
        bodyGeo = new THREE.BoxGeometry(width, height * 0.65, length);
        cabinGeo = new THREE.BoxGeometry(width * 0.75, height * 0.55, length * 0.45);
        break;
      default: // sedan
        width = 1.8; length = 4.4; height = 1.35;
        bodyGeo = new THREE.BoxGeometry(width, height * 0.6, length);
        cabinGeo = new THREE.BoxGeometry(width * 0.75, height * 0.55, length * 0.45);
    }
    
    this.width = width;
    this.length = length;
    this.height = height;
    
    // Body
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height * 0.3;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);
    this.bodyMesh = body;
    
    // Cabin
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.y = height * 0.65;
    cabin.position.z = length * 0.05;
    cabin.castShadow = true;
    this.mesh.add(cabin);
    this.cabinMesh = cabin;
    
    // Roof detail for police
    if (this.type === 'police') {
      const lightBarGeo = new THREE.BoxGeometry(width * 0.8, 0.2, length * 0.3);
      const lightBarMat = createStandardMaterial(0x1a1a1a);
      const lightBar = new THREE.Mesh(lightBarGeo, lightBarMat);
      lightBar.position.y = height + 0.1;
      lightBar.position.z = length * 0.05;
      lightBar.castShadow = true;
      this.mesh.add(lightBar);
      this.lightBar = lightBar;
      
      // Police lights
      this.policeLights = [];
      for (let i = 0; i < 4; i++) {
        const lightGeo = new THREE.SphereGeometry(0.12, 8, 6);
        const color = i < 2 ? CONFIG.PALETTE.POLICE_LIGHT_BLUE : CONFIG.PALETTE.POLICE_LIGHT_RED;
        const lightMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(
          (i % 2 === 0 ? -1 : 1) * width * 0.3,
          height + 0.35,
          (i < 2 ? -1 : 1) * length * 0.1
        );
        this.mesh.add(light);
        this.policeLights.push(light);
      }
      this.sirenActive = false;
    }
    
    // Wheels positions (visual) — front axle at +Z: the car's front is
    // local +Z, matching the physics forward (sin r, cos r).
    const wheelOffsetX = width / 2 - 0.15;
    const wheelOffsetZ = length / 2 - 0.4;
    this.wheelPositions = [
      new THREE.Vector3(-wheelOffsetX, height * 0.15, wheelOffsetZ), // FL
      new THREE.Vector3(wheelOffsetX, height * 0.15, wheelOffsetZ),  // FR
      new THREE.Vector3(-wheelOffsetX, height * 0.15, -wheelOffsetZ), // RL
      new THREE.Vector3(wheelOffsetX, height * 0.15, -wheelOffsetZ),  // RR
    ];
    
    // Headlights (front = local +Z, matching the physics forward)
    const headlightGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0 });
    this.headlights = [];
    for (let side of [-1, 1]) {
      const hl = new THREE.Mesh(headlightGeo, headlightMat);
      hl.position.set(side * width * 0.4, height * 0.35, length * 0.48);
      this.mesh.add(hl);
      this.headlights.push(hl);
    }

    // Taillights (rear = local -Z)
    const taillightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05);
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.3 });
    this.taillights = [];
    for (let side of [-1, 1]) {
      const tl = new THREE.Mesh(taillightGeo, taillightMat);
      tl.position.set(side * width * 0.35, height * 0.35, -length * 0.48);
      this.mesh.add(tl);
      this.taillights.push(tl);
    }

    // Brake lights (brighter)
    const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0 });
    this.brakeLights = [];
    for (let side of [-1, 1]) {
      const bl = new THREE.Mesh(taillightGeo, brakeLightMat);
      bl.position.set(side * width * 0.35, height * 0.35, -length * 0.49);
      this.mesh.add(bl);
      this.brakeLights.push(bl);
    }

    // Reverse lights
    const reverseLightGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const reverseLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.reverseLights = [];
    for (let side of [-1, 1]) {
      const rl = new THREE.Mesh(reverseLightGeo, reverseLightMat);
      rl.position.set(side * width * 0.25, height * 0.35, -length * 0.48);
      this.mesh.add(rl);
      this.reverseLights.push(rl);
    }
    
    // Exhaust
    const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
    const exhaustMat = createStandardMaterial(0x3a3a3a);
    this.exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    this.exhaust.position.set(width * 0.3, height * 0.15, length * 0.5);
    this.exhaust.rotation.x = Math.PI / 2;
    this.mesh.add(this.exhaust);
    
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.scene.add(this.mesh);
  }
  
  createWheels() {
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12);
    const wheelMat = createStandardMaterial(0x1a1a1a);
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.21, 10);
    const rimMat = createStandardMaterial(0x8a8a8a);

    for (let i = 0; i < 4; i++) {
      const wheelGroup = new THREE.Group();

      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.castShadow = true;
      wheelGroup.add(rim);

      // Validate wheel position to prevent NaN geometry
      const pos = this.wheelPositions[i];
      if (pos && isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
        wheelGroup.position.copy(pos);
      } else {
        // Fallback position
        wheelGroup.position.set((i % 2 === 0 ? -1 : 1) * 0.9, 0.3, (i < 2 ? -1 : 1) * 1.8);
      }
      this.mesh.add(wheelGroup);
      this.wheelMeshes.push(wheelGroup);
    }
  }
  
  update(delta, target = null) {
    if (this.isDestroyed) {
      this.updateDestruction(delta);
      return;
    }

    // Driver-controlled (player) or AI-controlled.
    if (this.driver) {
      this.processDriverInput(delta);
    } else if (target && typeof target.x === 'number' && typeof target.z === 'number') {
      // A target position was passed (police chasing the player): steer
      // toward it. NOTE: the old code assigned the target Vector3 to
      // `this.input`, so `this.input.steer` was undefined and the steering
      // math produced NaN — every police car vanished (NaN position) on
      // its first update tick.
      this.updateAIChase(delta, target);
    } else {
      // No driver and no chase target: drive on the stored AI input
      // (traffic). The old code only ran physics when an input argument
      // was passed, so traffic cars given setAIInput() never moved at all.
      this.updatePhysics(delta);
    }

    this.updateVisuals(delta);
    this.updateAudio(delta);
    this.updateMesh();
  }

  // Police AI: steer toward a target position and close the distance,
  // braking to a stop just short of it instead of ramming through.
  updateAIChase(delta, target) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dx, dz);
    const angle = angleDiff(this.rotation, targetAngle);
    this.input.steer = clamp(angle, -1, 1);
    // Slow down for sharp turns: steering rate falls with speed, so a
    // full-speed cop overshoots in a ~100-unit circle and never closes in.
    // Below ~10 units/s the turning circle shrinks to ~8 units, so the
    // sharper the angle to the target, the slower the cop goes.
    const baseTarget = this.input.targetSpeed != null ? this.input.targetSpeed : 25;
    const turnSlow = 1 - 0.9 * Math.min(1, Math.abs(angle) / 1.2);
    const targetSpeed = baseTarget * turnSlow;
    if (dist > 10) {
      this.input.accel = this.speed < targetSpeed ? 1 : 0;
      this.input.brake = this.speed > targetSpeed + 2 ? 0.8 : 0;
    } else if (dist > 5) {
      this.input.accel = 0;
      this.input.brake = 0.4;
    } else {
      this.input.accel = 0;
      this.input.brake = 1;
    }
    this.input.handbrake = false;
    this.updatePhysics(delta);
  }
  
  processDriverInput(delta) {
    const input = this.driver.input;
    
    this.input.accel = input.isDown(ACTION.FORWARD) ? 1 : 0;
    this.input.brake = input.isDown(ACTION.BACK) ? 1 : 0;
    this.input.steer = 0;
    if (input.isDown(ACTION.LEFT)) this.input.steer -= 1;
    if (input.isDown(ACTION.RIGHT)) this.input.steer += 1;
    this.input.handbrake = input.isDown(ACTION.SPRINT); // Shift = handbrake in vehicle
    
    // Exit vehicle
    if (input.isPressed(ACTION.ENTER_VEHICLE)) {
      this.driver.exitVehicle();
    }
    
    // Horn
    if (input.isPressed(ACTION.ATTACK)) {
      this.audio.playCarHorn();
    }
    
    // Shoot from vehicle
    if (input.isDown(ACTION.SHOOT) && input.isDown(ACTION.AIM)) {
      // Handled in main
    }
    
    this.updatePhysics(delta);
  }
  
  updatePhysics(delta) {
    const { VEHICLE } = CONFIG;

    // Effective accel/brake for this tick. These are LOCALS, never written
    // back to this.input: the stored AI input (accel 0.6 etc.) is the car's
    // standing orders, and zeroing it once the car first reaches its
    // target speed would latch acceleration off forever.
    let accel = this.input.accel || 0;
    let brake = this.input.brake || 0;
    // Garage engine tune (round 5): a tuned car accelerates harder.
    // tuneAccelMul is 1 for stock cars and up to 1.75 for a Stage 3
    // race tune fitted at Kade's Garage.
    const tuneMul = this.tuneAccelMul || 1;
    // Cruise control: when cruiseSpeed is set (e.g. the chase screenshot
    // preset, where no keys are pressed), hold that speed instead of
    // coasting to a stop from rolling resistance. A cruiseDistance cap
    // brakes the car to a stop once it has travelled that far.
    if (this.cruiseSpeed != null) {
      if (this.cruiseDistance != null && this.cruiseTraveled >= this.cruiseDistance) {
        accel = 0;
        brake = 1;
      } else {
        accel = this.speed < this.cruiseSpeed ? 1 : 0;
        brake = 0;
      }
    } else if (this.input.targetSpeed != null && this.speed >= this.input.targetSpeed) {
      // AI target-speed cap: traffic/pursuit cars don't accelerate past
      // the speed their AI input asked for (otherwise they'd run away to
      // MAX_SPEED now that physics actually runs for them).
      accel = 0;
    }

    // Engine
    if (accel > 0 || brake > 0) {
      if (!this.engineOn) {
        this.engineOn = true;
      }
    }

    // Engine RPM
    const targetRpm = this.engineOn ? (Math.abs(this.speed) / VEHICLE.MAX_SPEED + accel * 0.5) : 0;
    this.rpm += (targetRpm - this.rpm) * delta * 5;
    this.rpm = clamp(this.rpm, 0, 1);

    // Forward/backward force
    let force = 0;
    if (accel > 0) {
      force = VEHICLE.ACCELERATION * accel * tuneMul;
      if (this.speed < 0) force *= 2; // Stronger braking when reversing
    } else if (brake > 0) {
      force = -VEHICLE.BRAKE_FORCE * brake * Math.sign(this.speed || 1);
    } else {
      // Rolling resistance
      force = -this.speed * 2;
    }
    
    this.speed += force * delta;
    this.speed = clamp(this.speed, -VEHICLE.MAX_SPEED * 0.3, VEHICLE.MAX_SPEED);

    // Track distance travelled under cruise control (for cruiseDistance).
    if (this.cruiseSpeed != null) {
      this.cruiseTraveled += Math.abs(this.speed) * delta;
    }
    
    // Steering
    const steerSpeed = VEHICLE.HANDLING * (1 - Math.abs(this.speed) / VEHICLE.MAX_SPEED * 0.5);
    this.angularVelocity += this.input.steer * steerSpeed * delta;
    
    // Handbrake - drift
    if (this.input.handbrake && Math.abs(this.speed) > 2) {
      this.angularVelocity *= 1.1;
      this.speed *= VEHICLE.DRIFT_FACTOR;
    }
    
    // Angular damping
    this.angularVelocity *= Math.pow(0.9, delta * 60);
    
    // Update rotation
    this.rotation += this.angularVelocity * delta;
    
    // Velocity vector
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this.velocity.copy(forward).multiplyScalar(this.speed);
    
    // Position update
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    
    // Ground height
    const groundY = this.city.raycastGround(this.position.x, this.position.z);
    this.position.y = groundY + 0.5;
    
    // World bounds
    const bounds = this.city.streetBounds;
    this.position.x = clamp(this.position.x, bounds.minX, bounds.maxX);
    this.position.z = clamp(this.position.z, bounds.minZ, bounds.maxZ);
    
    // Building collision
    this.checkCollisions();
  }
  
  checkCollisions() {
    const radius = Math.max(this.width, this.length) / 2;
    
    for (const building of this.city.buildings) {
      const bx = building.position.x;
      const bz = building.position.z;
      const bw = building.userData.bw / 2 + radius;
      const bd = building.userData.bd / 2 + radius;
      
      if (this.position.x > bx - bw && this.position.x < bx + bw &&
          this.position.z > bz - bd && this.position.z < bz + bd) {
        // Collision - push out and damage
        const dx = this.position.x - bx;
        const dz = this.position.z - bz;
        const overlapX = bw - Math.abs(dx);
        const overlapZ = bd - Math.abs(dz);
        
        const impactSpeed = Math.abs(this.speed);
        this.takeDamage(impactSpeed * 5);
        
        if (overlapX < overlapZ) {
          this.position.x += dx > 0 ? overlapX : -overlapX;
          this.velocity.x = -this.velocity.x * 0.3;
          this.speed *= -0.3;
        } else {
          this.position.z += dz > 0 ? overlapZ : -overlapZ;
          this.velocity.z = -this.velocity.z * 0.3;
          this.speed *= -0.3;
        }
        this.angularVelocity *= -0.5;
      }
    }
    
    // Vehicle-vehicle collision (simple)
    // Handled in traffic.js
  }
  
  takeDamage(amount) {
    if (this.isDestroyed) return;
    
    this.health -= amount;
    
    if (this.health <= CONFIG.VEHICLE.FIRE_THRESHOLD && !this.isBurning) {
      this.isBurning = true;
      this.fireTime = 0;
    }
    
    if (this.health <= 0) {
      this.destroy();
    }
  }
  
  destroy() {
    this.isDestroyed = true;
    this.engineOn = false;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    
    // Explosion (guarded: the traffic audio object carries no
    // explosion sound, and a missing method must never throw inside
    // destroy() — a police chase that wrecks a traffic car used to
    // abort the whole frame with a page error).
    if (this.audio && typeof this.audio.playExplosion === 'function') {
      this.audio.playExplosion(this.position);
    }
    
    // Visual destruction
    this.bodyMesh.material.color.setHex(0x1a1a1a);
    this.cabinMesh.material.opacity = 0.3;
    
    // Debris particles would go here
  }
  
  updateDestruction(delta) {
    if (this.isBurning) {
      this.fireTime += delta;
      // Flicker
      this.bodyMesh.material.emissive = new THREE.Color(0xff4400);
      this.bodyMesh.material.emissiveIntensity = 0.5 + Math.sin(this.fireTime * 20) * 0.3;
      
      if (this.fireTime > 5) {
        this.destroy();
      }
    }
  }
  
  updateVisuals(delta) {
    // Wheel rotation
    const wheelRotation = this.speed * delta * 3;
    for (let i = 0; i < 4; i++) {
      this.wheelMeshes[i].rotation.x += wheelRotation;
      
      // Steering visual (front wheels)
      if (i < 2) {
        this.wheelMeshes[i].rotation.y = this.input.steer * 0.5;
      }
    }
    
    // Wheel position (suspension)
    for (let i = 0; i < 4; i++) {
      const pos = this.wheelPositions[i];
      this.wheelMeshes[i].position.x = pos.x;
      this.wheelMeshes[i].position.z = pos.z;
      this.wheelMeshes[i].position.y = pos.y + Math.sin(performance.now() * 0.01 + i) * 0.02;
    }
    
    // Lights
    const headlightOn = this.engineOn; // Always on when engine running
    for (const hl of this.headlights) {
      hl.material.opacity = headlightOn ? 1 : 0;
    }
    
    // Brake lights
    const braking = this.input.brake > 0 || (this.speed > 0 && this.input.accel === 0);
    for (const bl of this.brakeLights) {
      bl.material.opacity = braking ? 1 : 0;
    }
    for (const tl of this.taillights) {
      tl.material.opacity = headlightOn ? 0.3 : 0;
    }
    
    // Reverse lights
    const reversing = this.speed < -1 && this.input.accel > 0;
    for (const rl of this.reverseLights) {
      rl.material.opacity = reversing ? 1 : 0;
    }
    
    // Police lights
    if (this.type === 'police' && this.sirenActive) {
      const t = performance.now() * 0.005;
      for (let i = 0; i < this.policeLights.length; i++) {
        const light = this.policeLights[i];
        light.material.opacity = Math.sin(t + i * Math.PI / 2) > 0 ? 1 : 0;
      }
      this.lightBar.material.emissive = new THREE.Color(0xff2222);
      this.lightBar.material.emissiveIntensity = Math.sin(t * 4) > 0 ? 1 : 0;
    } else if (this.type === 'police') {
      for (const light of this.policeLights) {
        light.material.opacity = 0;
      }
      this.lightBar.material.emissiveIntensity = 0;
    }
    
    // Damage smoke
    if (this.health < CONFIG.VEHICLE.SMOKE_THRESHOLD && !this.isDestroyed) {
      this.bodyMesh.material.emissive = new THREE.Color(0x332211);
      this.bodyMesh.material.emissiveIntensity = 0.2;
    }
  }
  
  updateAudio(delta) {
    if (this.engineOn) {
      this.audio.playEngineSound(this, this.rpm, Math.abs(this.speed));
    } else {
      this.audio.stopEngineSound(this);
    }
    
    if (this.type === 'police') {
      this.audio.playSiren(this, this.sirenActive);
    }
    
    // Tire screech
    const lateralSlip = Math.abs(this.angularVelocity) * Math.abs(this.speed) * 0.1;
    if (lateralSlip > 5) {
      this.audio.playTireScreech(Math.min(1, lateralSlip / 20));
    }
  }
  
  updateMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
  
  // AI Control
  setAIInput(input) {
    this.input = input;
  }
  
  setSiren(active) {
    this.sirenActive = active;
  }
  
  // Get spawn position for driver exit
  getExitPosition() {
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    const right = new THREE.Vector3(Math.cos(this.rotation), 0, -Math.sin(this.rotation));
    const exitPos = this.position.clone().add(right.clone().multiplyScalar(-this.width / 2 - 1));
    exitPos.y = this.city.raycastGround(exitPos.x, exitPos.z) + 1;
    return exitPos;
  }
  
  getState() {
    return {
      position: this.position.clone(),
      rotation: this.rotation,
      velocity: this.velocity.clone(),
      speed: this.speed,
      health: this.health,
      type: this.type,
      color: this.color,
      engineOn: this.engineOn,
    };
  }
  
  setState(state) {
    this.position.copy(state.position);
    this.rotation = state.rotation;
    this.velocity.copy(state.velocity);
    this.speed = state.speed;
    this.health = state.health;
    this.engineOn = state.engineOn;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
}

// Vehicle factory
export function createVehicle(scene, city, audio, type, color, x, z) {
  const vehicle = new Vehicle(scene, city, audio, type, color);
  vehicle.position.set(x, 0.5, z);
  vehicle.mesh.position.copy(vehicle.position);
  return vehicle;
}

export const VEHICLE_TYPES = ['sedan', 'sports', 'suv', 'truck'];
