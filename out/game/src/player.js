// Solmarina - Player Character (On Foot)

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, clamp, lerpVec3 } from './utils.js';
import { ACTION } from './input.js';

export class Player {
  constructor(scene, city, input, audio) {
    this.scene = scene;
    this.city = city;
    this.input = input;
    this.audio = audio;
    
    // State
    this.position = new THREE.Vector3(0, 1, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0;
    this.targetRotation = 0;
    this.onGround = false;
    this.health = CONFIG.PLAYER.HEALTH;
    this.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
    this.armor = 0;
    this.lastDamageTime = 0;
    this.isDead = false;
    this.inVehicle = false;
    this.vehicle = null;
    
    // Combat
    this.ammo = CONFIG.COMBAT.PISTOL_AMMO;
    this.maxAmmo = CONFIG.COMBAT.PISTOL_AMMO;
    this.lastShotTime = 0;
    this.isAiming = false;
    
    // Camera
    this.cameraOffset = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    
    // Animation
    this.animTime = 0;
    this.animSpeed = 0;
    
    // Build character mesh
    this.createMesh();
    
    // Collision capsule
    this.capsuleHeight = CONFIG.PLAYER.HEIGHT;
    this.capsuleRadius = CONFIG.PLAYER.RADIUS;
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    
    const { PLAYER_SKIN, PLAYER_CLOTHES } = CONFIG.PALETTE;
    const skinMat = createStandardMaterial(PLAYER_SKIN);
    const clothesMat = createStandardMaterial(PLAYER_CLOTHES);
    const darkMat = createStandardMaterial(0x1a1a2a);
    
    // Body (torso)
    const bodyGeo = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
    const body = new THREE.Mesh(bodyGeo, clothesMat);
    body.position.y = 1.2;
    body.castShadow = true;
    this.mesh.add(body);
    this.bodyMesh = body;
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.7;
    head.castShadow = true;
    this.mesh.add(head);
    this.headMesh = head;
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, darkMat);
    this.leftLeg.position.set(-0.1, 0.65, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);
    
    this.rightLeg = new THREE.Mesh(legGeo, darkMat);
    this.rightLeg.position.set(0.1, 0.65, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);
    
    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.45, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.35, 1.3, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);
    
    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.35, 1.3, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);
    
    // Gun (right hand)
    const gunGeo = new THREE.BoxGeometry(0.05, 0.15, 0.3);
    const gunMat = createStandardMaterial(0x1a1a1a);
    this.gunMesh = new THREE.Mesh(gunGeo, gunMat);
    this.gunMesh.position.set(0.35, 1.25, 0.2);
    this.rightArm.add(this.gunMesh);
    this.gunMesh.visible = false;
    
    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const flashMat = new THREE.MeshBasicMaterial({ 
      color: 0xffff88, 
      transparent: true, 
      opacity: 0 
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0, 0, -0.3);
    this.gunMesh.add(this.muzzleFlash);
    
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }
  
  update(delta, camera) {
    if (this.isDead) {
      this.updateDeath(delta);
      return;
    }
    
    if (this.inVehicle) {
      this.updateInVehicle(delta, camera);
      return;
    }
    
    this.handleInput(delta);
    this.updatePhysics(delta);
    this.updateAnimation(delta);
    this.updateCamera(camera);
    this.updateHealthRegen(delta);
    this.updateMesh();
  }
  
  handleInput(delta) {
    const { PLAYER } = CONFIG;
    const dir = { x: 0, z: 0 };
    
    if (this.input.isDown(ACTION.FORWARD)) dir.z -= 1;
    if (this.input.isDown(ACTION.BACK)) dir.z += 1;
    if (this.input.isDown(ACTION.LEFT)) dir.x -= 1;
    if (this.input.isDown(ACTION.RIGHT)) dir.x += 1;
    
    const len = Math.hypot(dir.x, dir.z);
    if (len > 0) {
      dir.x /= len;
      dir.z /= len;
      
      // Rotate to face movement direction relative to camera
      const cameraDir = new THREE.Vector3();
      this.getCameraForward(cameraDir);
      const targetAngle = Math.atan2(dir.x * cameraDir.x + dir.z * cameraDir.z, 
                                     dir.x * cameraDir.z - dir.z * cameraDir.x);
      this.targetRotation = targetAngle;
      
      // Movement speed
      const speed = this.input.isDown(ACTION.SPRINT) ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;
      this.velocity.x += dir.x * speed * delta * 10;
      this.velocity.z += dir.z * speed * delta * 10;
      
      this.animSpeed = speed / PLAYER.WALK_SPEED;
    } else {
      this.animSpeed = 0;
    }
    
    // Jump
    if (this.input.isPressed(ACTION.JUMP) && this.onGround) {
      this.velocity.y = PLAYER.JUMP_VELOCITY;
      this.onGround = false;
    }
    
    // Enter vehicle
    if (this.input.isPressed(ACTION.ENTER_VEHICLE)) {
      this.tryEnterVehicle();
    }
    
    // Aim
    this.isAiming = this.input.isDown(ACTION.AIM);
    
    // Shoot
    if (this.input.isDown(ACTION.SHOOT) && this.isAiming) {
      this.shoot();
    }
    
    // Melee
    if (this.input.isPressed(ACTION.ATTACK)) {
      this.meleeAttack();
    }
  }
  
  getCameraForward(out) {
    // Get camera's forward projected on XZ plane
    out.set(0, 0, -1).applyQuaternion(camera.quaternion);
    out.y = 0;
    out.normalize();
  }
  
  updatePhysics(delta) {
    const { PLAYER, GRAVITY, STEP } = CONFIG;
    
    // Gravity
    this.velocity.y += GRAVITY * delta;
    
    // Apply velocity
    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;
    this.position.z += this.velocity.z * delta;
    
    // Ground collision
    const groundY = this.city.raycastGround(this.position.x, this.position.z) + this.capsuleHeight / 2;
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    
    // Horizontal damping
    const damping = this.onGround ? 0.85 : 0.98;
    this.velocity.x *= Math.pow(damping, delta * 60);
    this.velocity.z *= Math.pow(damping, delta * 60);
    
    // World bounds
    const bounds = this.city.streetBounds;
    this.position.x = clamp(this.position.x, bounds.minX, bounds.maxX);
    this.position.z = clamp(this.position.z, bounds.minZ, bounds.maxZ);
    
    // Building collision (simple sphere cast)
    this.checkBuildingCollisions();
  }
  
  checkBuildingCollisions() {
    const radius = this.capsuleRadius;
    for (const building of this.city.buildings) {
      const bx = building.position.x;
      const bz = building.position.z;
      const bw = building.userData.bw / 2 + radius;
      const bd = building.userData.bd / 2 + radius;
      
      if (this.position.x > bx - bw && this.position.x < bx + bw &&
          this.position.z > bz - bd && this.position.z < bz + bd) {
        // Push out
        const dx = this.position.x - bx;
        const dz = this.position.z - bz;
        const overlapX = bw - Math.abs(dx);
        const overlapZ = bd - Math.abs(dz);
        
        if (overlapX < overlapZ) {
          this.position.x += dx > 0 ? overlapX : -overlapX;
          this.velocity.x = 0;
        } else {
          this.position.z += dz > 0 ? overlapZ : -overlapZ;
          this.velocity.z = 0;
        }
      }
    }
  }
  
  updateAnimation(delta) {
    this.animTime += delta * this.animSpeed * 8;
    
    // Leg animation
    if (this.animSpeed > 0 && this.onGround) {
      const swing = Math.sin(this.animTime) * 0.6 * this.animSpeed;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftLeg.position.y = 0.65 + Math.abs(swing) * 0.1;
      this.rightLeg.position.y = 0.65 + Math.abs(swing) * 0.1;
    } else {
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftLeg.position.y = 0.65;
      this.rightLeg.position.y = 0.65;
    }
    
    // Arm animation
    if (this.animSpeed > 0 && this.onGround) {
      const swing = Math.sin(this.animTime) * 0.4 * this.animSpeed;
      this.leftArm.rotation.x = -swing;
      this.rightArm.rotation.x = swing;
    } else if (this.isAiming) {
      this.rightArm.rotation.x = -0.3;
      this.rightArm.rotation.z = 0.2;
      this.gunMesh.visible = true;
    } else {
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.rightArm.rotation.z = 0;
      this.gunMesh.visible = false;
    }
    
    // Body lean
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bodyMesh.rotation.x = -speed * 0.02;
  }
  
  updateMesh() {
    this.mesh.position.copy(this.position);
    
    // Smooth rotation
    const diff = this.targetRotation - this.mesh.rotation.y;
    const normalizedDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.mesh.rotation.y += normalizedDiff * 0.15;
  }
  
  updateCamera(camera) {
    const { CAMERA } = CONFIG;
    const offset = this.isAiming ? new THREE.Vector3(1.5, 1.6, 2) : CAMERA.FOOT_OFFSET.clone();
    const distance = this.isAiming ? 2 : CAMERA.FOOT_DISTANCE;
    const height = CAMERA.FOOT_HEIGHT;
    
    // Camera target (look at point)
    const forward = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.cameraTarget.copy(this.position).add(new THREE.Vector3(0, CAMERA.FOOT_HEIGHT, 0)).add(forward.clone().multiplyScalar(CAMERA.LOOK_AHEAD));
    
    // Desired camera position
    const desiredPos = this.cameraTarget.clone().sub(forward.clone().multiplyScalar(distance));
    desiredPos.y += height;
    
    // Add offset for aiming
    if (this.isAiming) {
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      desiredPos.add(right.multiplyScalar(1.5));
    }
    
    // Lerp
    camera.position.lerp(desiredPos, 1 - Math.exp(-CAMERA.LERP_SPEED * delta));
    camera.lookAt(this.cameraTarget);
  }
  
  updateHealthRegen(delta) {
    const { REGEN_RATE, REGEN_DELAY } = CONFIG.PLAYER;
    const now = performance.now() / 1000;
    
    if (this.health < this.maxHealth && now - this.lastDamageTime > REGEN_DELAY) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * delta);
    }
  }
  
  updateInVehicle(delta, camera) {
    if (!this.vehicle) return;
    
    // Position player inside vehicle (hidden)
    this.mesh.visible = false;
    this.position.copy(this.vehicle.position);
    this.position.y += 1;
    
    // Vehicle camera
    const { CAMERA } = CONFIG;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.vehicle.mesh.quaternion);
    const targetPos = this.vehicle.position.clone().add(new THREE.Vector3(0, CAMERA.VEHICLE_HEIGHT, 0)).add(forward.clone().multiplyScalar(CAMERA.LOOK_AHEAD));
    const desiredPos = targetPos.clone().sub(forward.clone().multiplyScalar(CAMERA.VEHICLE_DISTANCE));
    desiredPos.y += CAMERA.VEHICLE_HEIGHT;
    
    camera.position.lerp(desiredPos, 1 - Math.exp(-CAMERA.LERP_SPEED * delta));
    camera.lookAt(targetPos);
  }
  
  updateDeath(delta) {
    // Ragdoll / fade out
    this.mesh.rotation.x += delta * 2;
    this.mesh.position.y -= delta * 0.5;
  }
  
  tryEnterVehicle() {
    // This will be called from main.js with the vehicles array
    // Return true if entered
    return false;
  }
  
  enterVehicle(vehicle) {
    this.inVehicle = true;
    this.vehicle = vehicle;
    this.mesh.visible = false;
    vehicle.driver = this;
  }
  
  exitVehicle() {
    if (!this.vehicle) return;
    
    this.inVehicle = false;
    const exitPos = this.vehicle.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.vehicle.mesh.quaternion);
    exitPos.add(forward.clone().multiplyScalar(-3));
    exitPos.y = this.city.raycastGround(exitPos.x, exitPos.z) + 1;
    
    this.position.copy(exitPos);
    this.mesh.visible = true;
    this.mesh.rotation.y = this.vehicle.mesh.rotation.y;
    this.targetRotation = this.mesh.rotation.y;
    this.velocity.set(0, 0, 0);
    
    this.vehicle.driver = null;
    this.vehicle = null;
  }
  
  shoot() {
    const { COMBAT } = CONFIG;
    const now = performance.now() / 1000;
    if (now - this.lastShotTime < COMBAT.PISTOL_COOLDOWN) return;
    if (this.ammo <= 0) return;
    
    this.lastShotTime = now;
    this.ammo--;
    
    // Muzzle flash
    this.muzzleFlash.material.opacity = 1;
    setTimeout(() => { this.muzzleFlash.material.opacity = 0; }, 50);
    
    // Play sound
    this.audio.playGunshot(this.position);
    
    // Return raycast info for hit detection
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.headMesh.getWorldQuaternion(new THREE.Quaternion()));
    const origin = this.headMesh.getWorldPosition(new THREE.Vector3());
    
    return { origin, direction: forward, damage: COMBAT.PISTOL_DAMAGE, range: COMBAT.PISTOL_RANGE, spread: COMBAT.PISTOL_SPREAD };
  }
  
  meleeAttack() {
    // Simple punch
    this.audio.playPunch();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    const origin = this.position.clone().add(new THREE.Vector3(0, 1.5, 0)).add(forward.multiplyScalar(1));
    return { origin, direction: forward, damage: CONFIG.PLAYER.PUNCH_DAMAGE, range: CONFIG.PLAYER.PUNCH_RANGE };
  }
  
  takeDamage(amount, source = null) {
    if (this.isDead) return;
    
    this.health -= amount;
    this.lastDamageTime = performance.now() / 1000;
    
    if (this.health <= 0) {
      this.die();
    }
  }
  
  die() {
    this.isDead = true;
    this.health = 0;
    this.velocity.set(0, 0, 0);
    this.mesh.visible = true;
  }
  
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
  
  addArmor(amount) {
    this.armor = Math.min(100, this.armor + amount);
  }
  
  addAmmo(amount) {
    this.ammo = Math.min(this.maxAmmo, this.ammo + amount);
  }
  
  getState() {
    return {
      position: this.position.clone(),
      rotation: this.mesh.rotation.y,
      health: this.health,
      armor: this.armor,
      ammo: this.ammo,
      inVehicle: this.inVehicle,
    };
  }
  
  setState(state) {
    this.position.copy(state.position);
    this.mesh.rotation.y = state.rotation;
    this.targetRotation = state.rotation;
    this.health = state.health;
    this.armor = state.armor || 0;
    this.ammo = state.ammo || this.maxAmmo;
    this.isDead = false;
  }
}

