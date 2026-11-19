// Solmarina - Utility Functions

import * as THREE from 'three';
import { CONFIG } from './config.js';

// Seeded random number generator (Mulberry32)
export function createRandom(seed = Date.now()) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Vector utilities
export function vec3(x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z); }
export function vec2(x = 0, y = 0) { return new THREE.Vector2(x, y); }

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpVec3(a, b, t, out = new THREE.Vector3()) {
  return out.lerpVectors(a, b, t);
}

export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distance2DSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function angleDiff(a, b) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Geometry helpers
export function createBoxGeometry(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

export function createPlaneGeometry(width, height) {
  return new THREE.PlaneGeometry(width, height);
}

export function createCylinderGeometry(radiusTop, radiusBottom, height, radialSegments = 8) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
}

export function createSphereGeometry(radius, widthSegments = 8, heightSegments = 6) {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

// Material helpers
export function createMaterial(color, options = {}) {
  return new THREE.MeshLambertMaterial({ color, ...options });
}

export function createStandardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...options });
}

export function createEmissiveMaterial(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: intensity });
}

// Merge geometries for performance
export function mergeGeometries(geometries, materials) {
  const merged = new THREE.BufferGeometry();
  const attributes = ['position', 'normal', 'uv', 'index'];
  const counts = { position: 0, normal: 0, uv: 0, index: 0 };
  const offsets = { position: 0, normal: 0, uv: 0, index: 0 };
  const groups = [];

  // Calculate total sizes
  geometries.forEach((geo, i) => {
    const pos = geo.getAttribute('position');
    const vertCount = pos ? pos.count : 0;
    const idx = geo.getIndex();
    const indexCount = idx ? idx.count : vertCount;
    counts.position += vertCount;
    counts.normal += vertCount;
    counts.uv += vertCount;
    counts.index += indexCount;
  });

  // Allocate buffers
  const positionArray = new Float32Array(counts.position * 3);
  const normalArray = new Float32Array(counts.normal * 3);
  const uvArray = new Float32Array(counts.uv * 2);
  // Indices address VERTICES, so the 16-bit limit depends on the vertex count,
  // not the index count: a merged mesh with >65535 vertices but fewer indices
  // would silently wrap its indices and corrupt geometry with Uint16Array.
  const indexArray = counts.position > 65535 ? new Uint32Array(counts.index) : new Uint16Array(counts.index);

  let vertOffset = 0;
  let indexOffset = 0;

  geometries.forEach((geo, i) => {
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const idx = geo.getIndex();
    const vertCount = pos.count;
    const indexCount = idx ? idx.count : vertCount;

    // Copy position
    positionArray.set(pos.array, vertOffset * 3);
    // Copy normal
    if (norm) normalArray.set(norm.array, vertOffset * 3);
    // Copy uv
    if (uv) uvArray.set(uv.array, vertOffset * 2);

    // Copy index with offset
    if (idx) {
      const idxArray = idx.array;
      for (let j = 0; j < indexCount; j++) {
        indexArray[indexOffset + j] = idxArray[j] + vertOffset;
      }
    } else {
      for (let j = 0; j < vertCount; j++) {
        indexArray[indexOffset + j] = vertOffset + j;
      }
    }

    groups.push({ start: indexOffset, count: indexCount, materialIndex: i });
    vertOffset += vertCount;
    indexOffset += indexCount;
  });

  merged.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  merged.setIndex(new THREE.BufferAttribute(indexArray, 1));
  merged.groups = groups;

  return merged;
}

// Raycast helpers
export function raycastGround(origin, direction, maxDistance, objects) {
  const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);
  const intersects = raycaster.intersectObjects(objects, true);
  return intersects[0] || null;
}

export function raycastFirst(origin, direction, maxDistance, objects, filter) {
  const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);
  const intersects = raycaster.intersectObjects(objects, true);
  for (const hit of intersects) {
    if (!filter || filter(hit.object)) return hit;
  }
  return null;
}

// Color utilities
export function hexToThree(hex) {
  return new THREE.Color(hex);
}

export function lerpColor(a, b, t, out = new THREE.Color()) {
  return out.copy(a).lerp(b, t);
}

export function hslToHex(h, s, l) {
  return new THREE.Color().setHSL(h, s, l).getHex();
}

// Time formatting
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatCash(amount) {
  const val = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return '$' + val.toLocaleString();
}

// Noise functions for procedural generation
export function hash2D(x, z, seed = 0) {
  let h = (x * 374761393 + z * 668265263 + seed * 1013904223) & 0xffffffff;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) * 747796405;
  h = h ^ (h >>> 13);
  return (h >>> 0) / 4294967296;
}

export function noise2D(x, z, scale = 1, octaves = 4, persistence = 0.5, seed = 0) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    const hx = x * frequency;
    const hz = z * frequency;
    const x0 = Math.floor(hx);
    const x1 = x0 + 1;
    const z0 = Math.floor(hz);
    const z1 = z0 + 1;
    const tx = hx - x0;
    const tz = hz - z0;
    const v00 = hash2D(x0, z0, seed + i);
    const v10 = hash2D(x1, z0, seed + i);
    const v01 = hash2D(x0, z1, seed + i);
    const v11 = hash2D(x1, z1, seed + i);
    const ux = tx * tx * (3 - 2 * tx);
    const uz = tz * tz * (3 - 2 * tz);
    const v0 = lerp(v00, v10, ux);
    const v1 = lerp(v01, v11, ux);
    value += lerp(v0, v1, uz) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return value / maxValue;
}

// Object pooling
export class ObjectPool {
  constructor(createFn, resetFn, initialSize = 16) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    this.active = new Set();
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  acquire() {
    let obj = this.pool.pop();
    if (!obj) obj = this.createFn();
    this.active.add(obj);
    return obj;
  }

  release(obj) {
    if (this.active.has(obj)) {
      this.active.delete(obj);
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  releaseAll() {
    for (const obj of this.active) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
    this.active.clear();
  }

  forEachActive(fn) {
    for (const obj of this.active) fn(obj);
  }

  getActiveCount() { return this.active.size; }
}

// Simple event emitter
export class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, fn) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const fns = this.events.get(event);
    if (fns) {
      const idx = fns.indexOf(fn);
      if (idx >= 0) fns.splice(idx, 1);
    }
  }

  emit(event, ...args) {
    const fns = this.events.get(event);
    if (fns) fns.forEach(fn => fn(...args));
  }

  once(event, fn) {
    const off = this.on(event, (...args) => {
      off();
      fn(...args);
    });
    return off;
  }
}

// Performance timer
export class Timer {
  constructor() { this.start = performance.now(); }
  reset() { this.start = performance.now(); }
  elapsed() { return performance.now() - this.start; }
  elapsedSeconds() { return (performance.now() - this.start) / 1000; }
}

// Camera occlusion: pull a third-person camera back out of buildings.
// `target` is the look-at point, `desiredPos` where the camera wants to be,
// `buildings` are meshes with userData { bw, bd, height } (see City).
// The segment is tested in XZ against each building's footprint; when the
// segment would pass through a building taller than the camera at that
// point, the camera is placed just before the entry point (never closer
// than minDistance to the target). Returns a new Vector3.
export function clampCameraToBuildings(target, desiredPos, buildings, minDistance = 1.5) {
  if (!buildings || buildings.length === 0) return desiredPos.clone();
  const dx = desiredPos.x - target.x;
  const dz = desiredPos.z - target.z;
  const segLen = Math.hypot(dx, dz);
  if (segLen < 0.001) return desiredPos.clone();
  const dirX = dx / segLen;
  const dirZ = dz / segLen;
  let maxT = segLen; // furthest allowed distance along the segment

  for (const b of buildings) {
    const halfW = (b.userData?.bw || 0) / 2 + 0.4; // small clearance
    const halfD = (b.userData?.bd || 0) / 2 + 0.4;
    const height = b.userData?.height || 0;
    const cx = b.position.x;
    const cz = b.position.z;
    // Slab test: entry distance of the ray (target -> desired) into the AABB.
    let tMin = 0;
    let tMax = segLen;
    let hit = true;
    for (const [origin, dir, center, half] of [
      [target.x, dirX, cx, halfW],
      [target.z, dirZ, cz, halfD],
    ]) {
      if (Math.abs(dir) < 1e-9) {
        if (origin < center - half || origin > center + half) { hit = false; break; }
      } else {
        let t1 = (center - half - origin) / dir;
        let t2 = (center + half - origin) / dir;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) { hit = false; break; }
      }
    }
    if (!hit || tMin >= maxT) continue;
    // Only blocks if the camera would be below the roof at the entry point.
    const yAtEntry = target.y + (desiredPos.y - target.y) * (tMin / segLen);
    if (yAtEntry < height) maxT = Math.max(minDistance, tMin - 0.3);
  }

  if (maxT >= segLen) return desiredPos.clone();
  const out = desiredPos.clone();
  out.x = target.x + dirX * maxT;
  out.z = target.z + dirZ * maxT;
  out.y = target.y + (desiredPos.y - target.y) * (maxT / segLen);
  return out;
}

// Debounce
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle
export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
