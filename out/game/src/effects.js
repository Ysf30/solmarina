// Solmarina — round 4 authorship pass (recording 14): file re-emitted under a live recording.
// Round 4 pass 2: second recorded touch; game logic untouched.
// Solmarina - Particle Effects System

import * as THREE from 'three';
import { createMaterial, createRandom } from './utils.js';

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.random = createRandom(99999);
    
    // Particle pools
    this.particles = [];
    this.maxParticles = 500;
    
    // Skid marks
    this.skidMarks = [];
    this.maxSkidMarks = 200;
    
    // Muzzle flashes
    this.muzzleFlashes = [];
    
    // Blood splats
    this.bloodSplats = [];
    
    // Spark particles
    this.sparks = [];
    
    // Exhaust particles
    this.exhaustParticles = [];
    
    // Explosion particles
    this.explosionParticles = [];
  }
  
  update(delta) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      
      p.velocity.y += p.gravity * delta;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      
      // Fade
      const alpha = p.life / p.maxLife;
      p.mesh.material.opacity = alpha * p.startAlpha;
      p.mesh.scale.setScalar(p.startScale * (1 + (1 - alpha) * 0.5));
    }
    
    // Update skid marks
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      const skid = this.skidMarks[i];
      skid.life -= delta;
      if (skid.life <= 0) {
        this.scene.remove(skid.mesh);
        this.skidMarks.splice(i, 1);
      } else {
        skid.mesh.material.opacity = (skid.life / skid.maxLife) * 0.4;
      }
    }
    
    // Update muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.muzzleFlashes[i];
      flash.life -= delta;
      if (flash.life <= 0) {
        this.scene.remove(flash.mesh);
        this.muzzleFlashes.splice(i, 1);
      } else {
        flash.mesh.material.opacity = flash.life / flash.maxLife;
        flash.mesh.scale.setScalar(1 + (1 - flash.life / flash.maxLife) * 2);
      }
    }
    
    // Update blood splats
    for (let i = this.bloodSplats.length - 1; i >= 0; i--) {
      const blood = this.bloodSplats[i];
      blood.life -= delta;
      if (blood.life <= 0) {
        this.scene.remove(blood.mesh);
        this.bloodSplats.splice(i, 1);
      }
    }
    
    // Update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life -= delta;
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
        this.sparks.splice(i, 1);
      } else {
        spark.velocity.y -= 20 * delta;
        spark.mesh.position.add(spark.velocity.clone().multiplyScalar(delta));
        spark.mesh.material.opacity = spark.life / spark.maxLife;
      }
    }
    
    // Update exhaust
    for (let i = this.exhaustParticles.length - 1; i >= 0; i--) {
      const exh = this.exhaustParticles[i];
      exh.life -= delta;
      if (exh.life <= 0) {
        this.scene.remove(exh.mesh);
        this.exhaustParticles.splice(i, 1);
      } else {
        exh.mesh.position.add(exh.velocity.clone().multiplyScalar(delta));
        exh.mesh.scale.multiplyScalar(1 + delta * 2);
        exh.mesh.material.opacity = exh.life / exh.maxLife;
      }
    }
    
    // Update explosions
    for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
      const exp = this.explosionParticles[i];
      exp.life -= delta;
      if (exp.life <= 0) {
        this.scene.remove(exp.mesh);
        this.explosionParticles.splice(i, 1);
      } else {
        exp.velocity.y -= 10 * delta;
        exp.mesh.position.add(exp.velocity.clone().multiplyScalar(delta));
        exp.mesh.scale.multiplyScalar(1 + delta * 1.5);
        exp.mesh.material.opacity = exp.life / exp.maxLife;
      }
    }
  }
  
  // Dust particles (footsteps, vehicle dust)
  createDust(position, count = 5, scale = 0.3) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      
      const geo = new THREE.SphereGeometry(scale * (0.5 + this.random() * 0.5), 4, 3);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0x8a7a5a, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 0.1;
      mesh.position.x += (this.random() - 0.5) * 0.5;
      mesh.position.z += (this.random() - 0.5) * 0.5;
      
      const velocity = new THREE.Vector3(
        (this.random() - 0.5) * 2,
        this.random() * 3 + 1,
        (this.random() - 0.5) * 2
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: -10,
        life: 0.5 + this.random() * 0.5,
        maxLife: 1,
        startAlpha: 0.5,
        startScale: scale,
      });
    }
  }
  
  // Muzzle flash
  createMuzzleFlash(position, direction) {
    const geo = new THREE.SphereGeometry(0.2, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0xffff88, 
      transparent: true, 
      opacity: 1,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.lookAt(position.clone().add(direction));
    
    this.scene.add(mesh);
    this.muzzleFlashes.push({ mesh, life: 0.05, maxLife: 0.05 });
  }
  
  // Bullet impact sparks
  createSparks(position, count = 8) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.05, 0.05, 0.3);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0xffdd44, 
        transparent: true, 
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      
      const angle = this.random() * Math.PI * 2;
      const elevation = (this.random() - 0.5) * Math.PI / 2;
      const speed = 5 + this.random() * 10;
      
      const velocity = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed,
        Math.sin(angle) * Math.cos(elevation) * speed
      );
      
      mesh.lookAt(position.clone().add(velocity));
      mesh.rotateX(Math.PI / 2);
      
      this.scene.add(mesh);
      this.sparks.push({ mesh, velocity, life: 0.3 + this.random() * 0.2, maxLife: 0.5 });
    }
  }
  
  // Blood splatter
  createBlood(position, count = 6) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.CircleGeometry(0.15 + this.random() * 0.1, 6);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0x880000, 
        transparent: true, 
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 0.02 + i * 0.01; // Slight offset to prevent z-fighting
      
      // Random orientation on ground
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = this.random() * Math.PI * 2;
      
      // Random offset
      mesh.position.x += (this.random() - 0.5) * 0.5;
      mesh.position.z += (this.random() - 0.5) * 0.5;
      
      this.scene.add(mesh);
      this.bloodSplats.push({ mesh, life: 30 + this.random() * 30, maxLife: 60 });
    }
  }
  
  // Headshot effect
  createHeadshot(position) {
    // Extra blood
    this.createBlood(position, 12);
    
    // Red mist
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.SphereGeometry(0.1, 4, 3);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        transparent: true, 
        opacity: 0.6,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 1.5;
      
      const velocity = new THREE.Vector3(
        (this.random() - 0.5) * 8,
        this.random() * 5 + 2,
        (this.random() - 0.5) * 8
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: -15,
        life: 0.3 + this.random() * 0.2,
        maxLife: 0.5,
        startAlpha: 0.6,
        startScale: 0.1,
      });
    }
  }
  
  // Skid marks
  createSkidMark(position, direction, width = 0.3) {
    // Create a small skid mark segment
    const geo = new THREE.PlaneGeometry(width, 0.5);
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0x1a1a1a, 
      transparent: true, 
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y = 0.06;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = direction + Math.PI / 2;
    
    this.scene.add(mesh);
    this.skidMarks.push({ mesh, life: 10, maxLife: 10 });
    
    // Limit skid marks
    if (this.skidMarks.length > this.maxSkidMarks) {
      const old = this.skidMarks.shift();
      this.scene.remove(old.mesh);
    }
  }
  
  // Vehicle exhaust
  createExhaust(position, direction) {
    if (this.exhaustParticles.length > 50) return;
    
    const geo = new THREE.SphereGeometry(0.15, 4, 3);
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0x3a3a3a, 
      transparent: true, 
      opacity: 0.3,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    
    const velocity = direction.clone().multiplyScalar(-2).add(new THREE.Vector3(
      (this.random() - 0.5) * 1,
      this.random() * 1,
      (this.random() - 0.5) * 1
    ));
    
    this.scene.add(mesh);
    this.exhaustParticles.push({ mesh, velocity, life: 0.5, maxLife: 0.5 });
  }
  
  // Explosion
  createExplosion(position, radius = 5) {
    // Fire particles
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.SphereGeometry(0.3 + this.random() * 0.3, 4, 3);
      const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200];
      const mat = new THREE.MeshBasicMaterial({ 
        color: colors[Math.floor(this.random() * colors.length)], 
        transparent: true, 
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      
      const angle = this.random() * Math.PI * 2;
      const elevation = this.random() * Math.PI / 2;
      const speed = 5 + this.random() * 15;
      
      const velocity = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed + 5,
        Math.sin(angle) * Math.cos(elevation) * speed
      );
      
      this.scene.add(mesh);
      this.explosionParticles.push({ mesh, velocity, life: 1 + this.random() * 1, maxLife: 2 });
    }
    
    // Smoke particles
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.SphereGeometry(0.5 + this.random() * 0.5, 4, 3);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0x2a2a2a, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      
      const velocity = new THREE.Vector3(
        (this.random() - 0.5) * 8,
        this.random() * 5 + 2,
        (this.random() - 0.5) * 8
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: -2,
        life: 2 + this.random() * 2,
        maxLife: 4,
        startAlpha: 0.5,
        startScale: 0.5,
      });
    }
    
    // Shockwave ring
    const ringGeo = new THREE.RingGeometry(0.5, 1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.position.y = 0.1;
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    
    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(0, 0, 0),
      gravity: 0,
      life: 0.3,
      maxLife: 0.3,
      startAlpha: 0.8,
      startScale: 1,
    });
  }
  
  // Vehicle destruction debris
  createDebris(position, count = 15) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(
        0.2 + this.random() * 0.3,
        0.1 + this.random() * 0.2,
        0.2 + this.random() * 0.3
      );
      const mat = new THREE.MeshStandardMaterial({ 
        color: 0x2a2a2a,
        roughness: 0.8,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 1;
      
      const velocity = new THREE.Vector3(
        (this.random() - 0.5) * 15,
        this.random() * 10 + 5,
        (this.random() - 0.5) * 15
      );
      
      const angularVel = new THREE.Vector3(
        (this.random() - 0.5) * 10,
        (this.random() - 0.5) * 10,
        (this.random() - 0.5) * 10
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: -28,
        life: 3 + this.random() * 2,
        maxLife: 5,
        startAlpha: 1,
        startScale: 1,
        angularVel,
        isDebris: true,
      });
    }
  }
  
  // Cleanup all effects
  clear() {
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const s of this.skidMarks) this.scene.remove(s.mesh);
    for (const m of this.muzzleFlashes) this.scene.remove(m.mesh);
    for (const b of this.bloodSplats) this.scene.remove(b.mesh);
    for (const s of this.sparks) this.scene.remove(s.mesh);
    for (const e of this.exhaustParticles) this.scene.remove(e.mesh);
    for (const e of this.explosionParticles) this.scene.remove(e.mesh);
    
    this.particles = [];
    this.skidMarks = [];
    this.muzzleFlashes = [];
    this.bloodSplats = [];
    this.sparks = [];
    this.exhaustParticles = [];
    this.explosionParticles = [];
  }
}

