// Solmarina - Combat System

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createMaterial, createStandardMaterial, createRandom, raycastFirst, distance2D } from './utils.js';

export class CombatSystem {
  constructor(scene, city, player, traffic, police, audio, effects) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.traffic = traffic;
    this.police = police;
    this.audio = audio;
    this.effects = effects;
    this.random = createRandom(77777);
    
    // Enemy NPCs (rival gang members, police on foot)
    this.enemies = [];
    this.maxEnemies = 12;
    
    // Bullet tracers
    this.bullets = [];
    
    // Crosshair
    this.createCrosshair();
  }
  
  createCrosshair() {
    // 3D crosshair for aiming
    const crossGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const crossMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.crosshair = new THREE.Mesh(crossGeo, crossMat);
    this.crosshair.renderOrder = 1000;
    this.crosshair.visible = false;
    this.scene.add(this.crosshair);
    
    // Center dot
    const dotGeo = new THREE.CircleGeometry(0.05, 16);
    const dotMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    this.crosshairDot = new THREE.Mesh(dotGeo, dotMat);
    this.crosshairDot.renderOrder = 1000;
    this.crosshairDot.visible = false;
    this.scene.add(this.crosshairDot);
  }
  
  update(delta, camera) {
    // Update crosshair position
    this.updateCrosshair(camera);
    
    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.life -= delta;
      if (bullet.life <= 0) {
        this.scene.remove(bullet.mesh);
        this.bullets.splice(i, 1);
      }
    }
    
    // Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(delta, this.player.position);
      
      if (enemy.health <= 0 || enemy.isDead) {
        this.removeEnemy(i);
      }
    }
    
    // Spawn enemies if needed (for missions, police, etc.)
    this.maintainEnemyCount();
  }
  
  updateCrosshair(camera) {
    if (this.player.isAiming && !this.player.inVehicle) {
      // Raycast from camera center
      const center = new THREE.Vector2(0, 0);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(center, camera);
      
      // Intersect with world
      const objects = [this.city.ground, ...this.city.buildings];
      for (const vehicle of this.traffic.vehicles) objects.push(vehicle.mesh);
      for (const ped of this.traffic.pedestrians) objects.push(ped.mesh);
      for (const cop of this.police.policeCars) objects.push(cop.mesh);
      for (const enemy of this.enemies) objects.push(enemy.mesh);
      
      const intersects = raycaster.intersectObjects(objects, true);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        this.crosshair.position.copy(point);
        this.crosshair.lookAt(camera.position);
        this.crosshair.visible = true;
        
        this.crosshairDot.position.copy(point);
        this.crosshairDot.lookAt(camera.position);
        this.crosshairDot.position.add(this.crosshairDot.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.1));
        this.crosshairDot.visible = true;
        
        // Color based on target
        const target = intersects[0].object;
        let isEnemy = false;
        let current = target;
        while (current && current !== this.scene) {
          if (current.userData.isEnemy || current.userData.isPedestrian || current.userData.isPolice) {
            isEnemy = true;
            break;
          }
          current = current.parent;
        }
        this.crosshair.material.color.setHex(isEnemy ? 0xff3333 : 0xffffff);
        this.crosshairDot.material.color.setHex(isEnemy ? 0xff3333 : 0xffffff);
      } else {
        // Point at far distance
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const point = camera.position.clone().add(dir.multiplyScalar(100));
        this.crosshair.position.copy(point);
        this.crosshair.lookAt(camera.position);
        this.crosshair.visible = true;
        this.crosshairDot.visible = true;
        this.crosshair.material.color.setHex(0xffffff);
        this.crosshairDot.material.color.setHex(0xffffff);
      }
    } else {
      this.crosshair.visible = false;
      this.crosshairDot.visible = false;
    }
  }
  
  // Player shoots - returns hit info
  shoot(origin, direction, damage, range, spread) {
    // Apply spread
    const spreadX = (this.random() - 0.5) * spread * 2;
    const spreadY = (this.random() - 0.5) * spread * 2;
    const spreadZ = (this.random() - 0.5) * spread * 2;
    const finalDir = direction.clone().add(new THREE.Vector3(spreadX, spreadY, spreadZ)).normalize();
    
    // Create tracer
    this.createTracer(origin, finalDir);
    
    // Raycast
    const raycaster = new THREE.Raycaster(origin, finalDir, 0, range);
    
    // Collect all hittable objects
    const objects = [];
    
    // Pedestrians
    for (const ped of this.traffic.pedestrians) {
      if (!ped.isDead) objects.push(ped.mesh);
    }
    
    // Traffic vehicles
    for (const vehicle of this.traffic.vehicles) {
      if (!vehicle.isDestroyed) objects.push(vehicle.mesh);
    }
    
    // Police cars
    for (const cop of this.police.policeCars) {
      if (!cop.isDestroyed) objects.push(cop.mesh);
    }
    
    // Enemy NPCs
    for (const enemy of this.enemies) {
      if (!enemy.isDead) objects.push(enemy.mesh);
    }
    
    // Buildings
    for (const building of this.city.buildings) {
      objects.push(building);
    }
    
    const intersects = raycaster.intersectObjects(objects, true);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPoint = hit.point;
      const hitObject = hit.object;
      
      // Find root object
      let root = hitObject;
      while (root.parent && root.parent !== this.scene) {
        root = root.parent;
      }
      
      // Apply damage
      let hitType = 'world';
      let victim = null;
      
      // Check pedestrians
      for (const ped of this.traffic.pedestrians) {
        if (ped.mesh === root || ped.mesh.children.includes(root)) {
          ped.takeDamage(damage, origin);
          hitType = 'pedestrian';
          victim = ped;
          this.effects.createBlood(hitPoint);
          this.police.reportCrime('ASSAULT', hitPoint);
          break;
        }
      }
      
      // Check enemy NPCs
      if (!victim) {
        for (const enemy of this.enemies) {
          if (enemy.mesh === root) {
            enemy.takeDamage(damage);
            hitType = 'enemy';
            victim = enemy;
            this.effects.createBlood(hitPoint);
            break;
          }
        }
      }
      
      // Check vehicles
      if (!victim) {
        for (const vehicle of this.traffic.vehicles) {
          if (vehicle.mesh === root) {
            vehicle.takeDamage(damage);
            hitType = 'vehicle';
            victim = vehicle;
            this.effects.createSparks(hitPoint);
            if (vehicle.driver === this.player) {
              this.police.reportCrime('PROPERTY_DAMAGE', hitPoint);
            }
            break;
          }
        }
        for (const cop of this.police.policeCars) {
          if (cop.mesh === root) {
            cop.takeDamage(damage);
            hitType = 'police';
            victim = cop;
            this.effects.createSparks(hitPoint);
            this.police.reportCrime('COP_HIT', hitPoint);
            break;
          }
        }
      }
      
      // Check buildings
      if (!victim) {
        for (const building of this.city.buildings) {
          if (building === root) {
            hitType = 'building';
            this.effects.createSparks(hitPoint);
            this.police.reportCrime('PROPERTY_DAMAGE', hitPoint);
            break;
          }
        }
      }
      
      // Headshot check (simplified)
      if (victim && hitPoint.y > victim.position.y + 1.5) {
        damage *= CONFIG.COMBAT.HEADSHOT_MULT;
        this.effects.createHeadshot(hitPoint);
      }
      
      return { hit: true, point: hitPoint, type: hitType, victim, damage };
    }
    
    return { hit: false };
  }
  
  createTracer(origin, direction) {
    const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 20);
    const tracerMat = new THREE.MeshBasicMaterial({ 
      color: 0xffff88, 
      transparent: true, 
      opacity: 0.8,
      depthWrite: false,
    });
    const tracer = new THREE.Mesh(tracerGeo, tracerMat);
    tracer.position.copy(origin).add(direction.clone().multiplyScalar(10));
    tracer.lookAt(origin.clone().add(direction.multiplyScalar(-1)));
    tracer.rotateX(Math.PI / 2);
    this.scene.add(tracer);
    
    this.bullets.push({ mesh: tracer, life: 0.1 });
    
    // Fade out
    setTimeout(() => {
      this.scene.remove(tracer);
    }, 100);
  }
  
  // Enemy shoots at player
  enemyShoot(enemy, targetPos) {
    const origin = enemy.getMuzzlePosition();
    const direction = new THREE.Vector3().subVectors(targetPos, origin).normalize();
    
    // Enemy accuracy based on distance
    const dist = distance2D(enemy.position, targetPos);
    const spread = Math.min(0.3, dist * 0.01);
    
    const spreadX = (this.random() - 0.5) * spread * 2;
    const spreadY = (this.random() - 0.5) * spread * 2;
    const spreadZ = (this.random() - 0.5) * spread * 2;
    const finalDir = direction.clone().add(new THREE.Vector3(spreadX, spreadY, spreadZ)).normalize();
    
    // Tracer
    this.createTracer(origin, finalDir);
    
    // Raycast to player
    const raycaster = new THREE.Raycaster(origin, finalDir, 0, 80);
    const playerMesh = this.player.mesh;
    const intersects = raycaster.intersectObject(playerMesh, true);
    
    if (intersects.length > 0) {
      const damage = CONFIG.COMBAT.PISTOL_DAMAGE * 0.7; // Enemies do less damage
      this.player.takeDamage(damage);
      this.effects.createBlood(intersects[0].point);
      return true;
    }
    
    return false;
  }
  
  maintainEnemyCount() {
    // Spawn enemies for police (officers on foot at high wanted)
    if (this.police.wantedLevel >= 4 && this.enemies.length < this.maxEnemies) {
      // Police officers spawn from police cars
      for (const cop of this.police.policeCars) {
        if (this.enemies.length >= this.maxEnemies) break;
        if (this.random() < 0.01) { // 1% chance per frame
          const pos = cop.position.clone();
          pos.x += (this.random() - 0.5) * 10;
          pos.z += (this.random() - 0.5) * 10;
          pos.y = this.city.raycastGround(pos.x, pos.z);
          this.spawnEnemy(pos, 'police');
        }
      }
    }
  }
  
  spawnEnemy(position, type = 'gang') {
    const enemy = new EnemyNPC(this.scene, this.city, this.audio, position, type, this.random);
    this.enemies.push(enemy);
    return enemy;
  }
  
  removeEnemy(index) {
    const enemy = this.enemies[index];
    if (enemy) {
      this.scene.remove(enemy.mesh);
    }
    this.enemies.splice(index, 1);
  }
  
  getEnemies() {
    return this.enemies;
  }
  
  getState() {
    return {
      enemies: this.enemies.map(e => e.getState()),
    };
  }
  
  setState(state) {
    // Clear existing
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
    }
    this.enemies = [];
    
    // Restore
    for (const eState of state.enemies || []) {
      const enemy = new EnemyNPC(this.scene, this.city, this.audio, 
        new THREE.Vector3(eState.position.x, eState.position.y, eState.position.z),
        eState.type, this.random);
      enemy.setState(eState);
      this.enemies.push(enemy);
    }
  }
}

// Enemy NPC class
class EnemyNPC {
  constructor(scene, city, audio, position, type, random) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.random = random;
    this.type = type; // 'gang', 'police'
    
    this.position = position.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = this.random() * Math.PI * 2;
    this.targetRotation = this.rotation;
    this.speed = 0;
    this.targetSpeed = 0;
    this.health = type === 'police' ? 100 : 80;
    this.maxHealth = this.health;
    this.isDead = false;
    this.state = 'idle'; // idle, chase, attack, flee, takeCover
    this.stateTimer = 0;
    this.lastShotTime = 0;
    this.coverPosition = null;
    
    this.createMesh();
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    this.mesh.userData.isEnemy = true;
    this.mesh.userData.enemyType = this.type;
    
    const skinColors = [0xd8b898, 0xc8a888, 0xe8c8a8, 0xb89878];
    const clothColors = this.type === 'police' ? [0x1a3a6a, 0x1a2a4a] : [0x8a3a3a, 0x3a3a7a, 0x7a3a3a, 0x5a4a3a];
    
    const skinColor = skinColors[Math.floor(this.random() * skinColors.length)];
    const clothColor = clothColors[Math.floor(this.random() * clothColors.length)];
    
    const skinMat = createStandardMaterial(skinColor);
    const clothMat = createStandardMaterial(clothColor);
    const darkMat = createStandardMaterial(0x1a1a1a);
    
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.65, 4, 8);
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.position.y = 1.15;
    body.castShadow = true;
    this.mesh.add(body);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.19, 8, 8);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.7;
    head.castShadow = true;
    this.mesh.add(head);
    this.headMesh = head;
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, darkMat);
    this.leftLeg.position.set(-0.11, 0.65, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);
    
    this.rightLeg = new THREE.Mesh(legGeo, darkMat);
    this.rightLeg.position.set(0.11, 0.65, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);
    
    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.45, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.32, 1.25, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);
    
    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.32, 1.25, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);
    
    // Gun
    const gunGeo = new THREE.BoxGeometry(0.05, 0.15, 0.3);
    const gunMat = createStandardMaterial(0x1a1a1a);
    this.gunMesh = new THREE.Mesh(gunGeo, gunMat);
    this.gunMesh.position.set(0.32, 1.2, 0.2);
    this.rightArm.add(this.gunMesh);
    
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.scene.add(this.mesh);
  }
  
  update(delta, playerPos) {
    if (this.isDead) return;
    
    const dist = distance2D(this.position, playerPos);
    
    // State machine
    this.stateTimer += delta;
    
    if (this.type === 'police') {
      this.updatePoliceAI(delta, playerPos, dist);
    } else {
      this.updateGangAI(delta, playerPos, dist);
    }
    
    // Movement
    this.updateMovement(delta);
    
    // Animation
    this.updateAnimation(delta);
    
    // Update mesh
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
  
  updatePoliceAI(delta, playerPos, dist) {
    switch (this.state) {
      case 'idle':
        if (dist < 60) {
          this.state = 'chase';
          this.stateTimer = 0;
        }
        break;
      case 'chase':
        this.targetSpeed = 4;
        this.faceTarget(playerPos);
        if (dist < 25) {
          this.state = 'attack';
          this.stateTimer = 0;
          this.findCover(playerPos);
        } else if (dist > 80) {
          this.state = 'idle';
        }
        break;
      case 'attack':
        this.targetSpeed = 0;
        this.faceTarget(playerPos);
        this.shootAtPlayer(playerPos);
        if (dist > 35) {
          this.state = 'chase';
        }
        break;
      case 'takeCover':
        if (this.coverPosition) {
          this.moveTo(this.coverPosition);
          if (distance2D(this.position, this.coverPosition) < 2) {
            this.state = 'attack';
            this.stateTimer = 0;
          }
        } else {
          this.state = 'attack';
        }
        break;
    }
  }
  
  updateGangAI(delta, playerPos, dist) {
    switch (this.state) {
      case 'idle':
        if (dist < 40) {
          this.state = 'chase';
          this.stateTimer = 0;
        }
        break;
      case 'chase':
        this.targetSpeed = 5;
        this.faceTarget(playerPos);
        if (dist < 20) {
          this.state = 'attack';
          this.stateTimer = 0;
        } else if (dist > 60) {
          this.state = 'idle';
        }
        break;
      case 'attack':
        this.targetSpeed = 1;
        this.faceTarget(playerPos);
        this.shootAtPlayer(playerPos);
        if (dist > 30) {
          this.state = 'chase';
        }
        if (this.health < 30 && this.random() < 0.01) {
          this.state = 'flee';
        }
        break;
      case 'flee':
        this.targetSpeed = 6;
        const away = new THREE.Vector3().subVectors(this.position, playerPos).normalize();
        this.targetRotation = Math.atan2(away.x, away.z);
        if (dist > 80) {
          this.state = 'idle';
        }
        break;
    }
  }
  
  faceTarget(target) {
    const dir = new THREE.Vector3().subVectors(target, this.position).normalize();
    this.targetRotation = Math.atan2(dir.x, dir.z);
  }
  
  moveTo(target) {
    const dir = new THREE.Vector3().subVectors(target, this.position).normalize();
    this.targetRotation = Math.atan2(dir.x, dir.z);
    this.targetSpeed = 4;
  }
  
  findCover(playerPos) {
    // Simple: move to side
    const angle = this.rotation + (this.random() > 0.5 ? 1 : -1) * Math.PI / 2;
    const dist = 5 + this.random() * 5;
    this.coverPosition = new THREE.Vector3(
      this.position.x + Math.sin(angle) * dist,
      0,
      this.position.z + Math.cos(angle) * dist
    );
    this.coverPosition.y = this.city.raycastGround(this.coverPosition.x, this.coverPosition.z);
    this.state = 'takeCover';
  }
  
  shootAtPlayer(playerPos) {
    const now = performance.now() / 1000;
    const fireRate = this.type === 'police' ? 0.5 : 0.7;
    
    if (now - this.lastShotTime > fireRate) {
      this.lastShotTime = now;
      // Actual shooting handled by combat system
      this.audio.playGunshot(this.position);
      // Muzzle flash
      this.createMuzzleFlash();
    }
  }
  
  createMuzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.15, 6, 4);
    const flashMat = new THREE.MeshBasicMaterial({ 
      color: 0xffff88, 
      transparent: true, 
      opacity: 1 
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(this.getMuzzlePosition());
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 50);
  }
  
  getMuzzlePosition() {
    const pos = this.position.clone();
    pos.y += 1.5;
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    pos.add(forward.multiplyScalar(0.5));
    return pos;
  }
  
  updateMovement(delta) {
    // Smooth rotation
    let diff = this.targetRotation - this.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rotation += diff * delta * 8;
    
    // Speed
    this.speed += (this.targetSpeed - this.speed) * delta * 10;
    
    // Move
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    
    // Ground
    const groundY = this.city.raycastGround(this.position.x, this.position.z);
    this.position.y = groundY;
    
    // Avoid buildings
    for (const building of this.city.buildings) {
      const bx = building.position.x;
      const bz = building.position.z;
      const bw = building.userData.bw / 2 + 0.5;
      const bd = building.userData.bd / 2 + 0.5;
      
      if (this.position.x > bx - bw && this.position.x < bx + bw &&
          this.position.z > bz - bd && this.position.z < bz + bd) {
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
      const time = performance.now() * 0.001 * 10;
      const swing = Math.sin(time) * 0.7;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.5;
      this.rightArm.rotation.x = swing * 0.5;
    } else {
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = this.state === 'attack' ? -0.3 : 0;
      this.rightArm.rotation.x = this.state === 'attack' ? 0.3 : 0;
    }
  }
  
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.die();
    }
  }
  
  die() {
    this.isDead = true;
    this.velocity.set(0, 0, 0);
    // Death animation handled in update
  }
  
  getState() {
    return {
      position: this.position.clone(),
      rotation: this.rotation,
      health: this.health,
      type: this.type,
      state: this.state,
    };
  }
  
  setState(state) {
    this.position.copy(state.position);
    this.rotation = state.rotation;
    this.health = state.health;
    this.type = state.type;
    this.state = state.state;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }
}

