// Solmarina - Procedural City Generation

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { 
  createMaterial, createStandardMaterial, mergeGeometries,
  noise2D, hash2D, createRandom
} from './utils.js';

export class City {
  constructor(scene, seed = 12345) {
    this.scene = scene;
    this.seed = seed;
    this.random = createRandom(seed);
    
    // City data
    this.buildings = [];
    this.streets = [];
    this.sidewalks = [];
    this.palms = [];
    this.streetlights = [];
    this.trafficNodes = [];
    this.pedestrianNodes = [];
    this.parkingSpots = [];
    this.missionMarkers = [];
    
    // Bounds for player movement
    this.streetBounds = {
      minX: -CONFIG.WORLD.HALF_SIZE + CONFIG.WORLD.STREET_WIDTH,
      maxX: CONFIG.WORLD.HALF_SIZE - CONFIG.WORLD.STREET_WIDTH,
      minZ: -CONFIG.WORLD.HALF_SIZE + CONFIG.WORLD.STREET_WIDTH,
      maxZ: CONFIG.WORLD.HALF_SIZE - CONFIG.WORLD.STREET_WIDTH,
    };
    
    this.build();
  }
  
  build() {
    this.createGround();
    this.createSea();
    this.createSky();
    this.createStreetGrid();
    this.createBuildings();
    this.createSidewalks();
    this.createPalms();
    this.createStreetlights();
    this.createBeach();
    this.createTrafficNodes();
    this.createPedestrianNodes();
    this.createParkingSpots();
  }
  
  createGround() {
    const { SIZE, GROUND_Y, GRASS, SAND } = CONFIG.WORLD;
    const { PALETTE } = CONFIG;
    
    // Main ground plane
    const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, 64, 64);
    const groundMat = createStandardMaterial(PALETTE.GRASS);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    
    // Sand areas near water
    const sandGeo = new THREE.RingGeometry(SIZE * 0.35, SIZE * 0.5, 64, 1, 0, Math.PI * 2);
    const sandMat = createStandardMaterial(PALETTE.SAND);
    sandGeo.rotateX(-Math.PI / 2);
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.position.y = GROUND_Y + 0.05;
    sand.receiveShadow = true;
    this.scene.add(sand);
  }
  
  createSea() {
    const { SIZE, SEA_LEVEL, PALETTE } = CONFIG;
    const { WORLD } = CONFIG;
    
    const waterGeo = new THREE.PlaneGeometry(SIZE * 2, SIZE * 2, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: PALETTE.WATER_DAY,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.position.y = SEA_LEVEL;
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    
    // Animated water normal
    this.water.userData = { time: 0 };
  }
  
  createSky() {
    const { PALETTE, WORLD } = CONFIG;
    
    // Sky dome
    const skyGeo = new THREE.SphereGeometry(WORLD.SIZE * 2, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: PALETTE.SKY_DAY,
      side: THREE.BackSide,
      fog: false,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);
    
    // Sun
    const sunGeo = new THREE.SphereGeometry(50, 16, 12);
    const sunMat = new THREE.MeshBasicMaterial({
      color: PALETTE.SUN_COLOR,
      fog: false,
    });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.set(-300, 400, -300);
    this.scene.add(this.sun);
    
    // Fog
    this.scene.fog = new THREE.FogExp2(PALETTE.FOG_DAY, 0.0008);
  }
  
  createStreetGrid() {
    const { WORLD } = CONFIG;
    const { STREET_WIDTH, BUILDING_GRID, HALF_SIZE } = WORLD;
    const { PALETTE } = CONFIG;
    
    const streetMat = createMaterial(PALETTE.ROAD);
    const lineMat = createMaterial(0xffffff);
    const lineMatYellow = createMaterial(0xffdd00);
    
    // Main streets (every 4 blocks)
    const mainSpacing = BUILDING_GRID * 4;
    
    // North-South streets
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      this.createStreet(x, -HALF_SIZE, x, HALF_SIZE, STREET_WIDTH * 1.5, true);
    }
    
    // East-West streets
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
      this.createStreet(-HALF_SIZE, z, HALF_SIZE, z, STREET_WIDTH * 1.5, true);
    }
    
    // Minor streets (every block)
    const minorMat = createMaterial(PALETTE.ROAD);
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += BUILDING_GRID) {
      if (x % mainSpacing !== 0) {
        this.createStreet(x, -HALF_SIZE, x, HALF_SIZE, STREET_WIDTH, false);
      }
    }
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += BUILDING_GRID) {
      if (z % mainSpacing !== 0) {
        this.createStreet(-HALF_SIZE, z, HALF_SIZE, z, STREET_WIDTH, false);
      }
    }
  }
  
  createStreet(x1, z1, x2, z2, width, isMain) {
    const { PALETTE } = CONFIG;
    const streetMat = createMaterial(isMain ? PALETTE.ROAD : 0x2a2a2e);
    
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const geo = new THREE.BoxGeometry(width, 0.1, length);
    const mesh = new THREE.Mesh(geo, streetMat);
    mesh.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.streets.push(mesh);
    
    // Lane lines
    if (isMain) {
      this.createLaneLines(x1, z1, x2, z2, width);
    }
    
    // Store street bounds for traffic
    this.streets.push({ x1, z1, x2, z2, width, isMain });
  }
  
  createLaneLines(x1, z1, x2, z2, width) {
    const { PALETTE } = CONFIG;
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(x2 - x1, z2 - z1);
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    
    const lineMat = createMaterial(0xffffff);
    const yellowMat = createMaterial(0xffdd00);
    
    // Center line (yellow)
    const centerGeo = new THREE.BoxGeometry(0.3, 0.12, length);
    const centerLine = new THREE.Mesh(centerGeo, yellowMat);
    centerLine.position.set(centerX, 0.12, centerZ);
    centerLine.rotation.y = angle;
    this.scene.add(centerLine);
    
    // Edge lines (white)
    for (let side of [-1, 1]) {
      const offset = width / 2 - 0.5;
      const lineX = centerX + Math.sin(angle) * offset * side;
      const lineZ = centerZ + Math.cos(angle) * offset * side;
      const edgeGeo = new THREE.BoxGeometry(0.2, 0.12, length);
      const edgeLine = new THREE.Mesh(edgeGeo, lineMat);
      edgeLine.position.set(lineX, 0.12, lineZ);
      edgeLine.rotation.y = angle;
      this.scene.add(edgeLine);
    }
  }
  
  createBuildings() {
    const { WORLD, PALETTE } = CONFIG;
    const { BUILDING_GRID, STREET_WIDTH, SIDEWALK_WIDTH, HALF_SIZE } = WORLD;
    
    const blockSize = BUILDING_GRID - STREET_WIDTH - SIDEWALK_WIDTH * 2;
    const baseColors = PALETTE.BUILDING_BASE;
    const accentColors = PALETTE.BUILDING_ACCENT;
    const windowLit = PALETTE.WINDOW_LIT;
    const windowDark = PALETTE.WINDOW_DARK;
    
    for (let gx = -Math.floor(HALF_SIZE / BUILDING_GRID); gx <= Math.floor(HALF_SIZE / BUILDING_GRID); gx++) {
      for (let gz = -Math.floor(HALF_SIZE / BUILDING_GRID); gz <= Math.floor(HALF_SIZE / BUILDING_GRID); gz++) {
        const centerX = gx * BUILDING_GRID;
        const centerZ = gz * BUILDING_GRID;
        
        // Skip if too close to center (spawn area)
        if (Math.abs(centerX) < 80 && Math.abs(centerZ) < 80) continue;
        // Skip if in water
        if (centerX * centerX + centerZ * centerZ > (HALF_SIZE * 0.6) ** 2) continue;
        
        const h = hash2D(gx, gz, this.seed);
        const height = 8 + h * 60;
        const floors = Math.max(1, Math.floor(height / 4));
        
        // Building footprint with some variation
        const bw = blockSize * (0.7 + h * 0.3);
        const bd = blockSize * (0.7 + hash2D(gx + 100, gz + 100, this.seed) * 0.3);
        
        const baseColor = baseColors[Math.floor(h * baseColors.length)];
        const accentColor = accentColors[Math.floor(hash2D(gx, gz + 50, this.seed) * accentColors.length)];
        
        this.createBuilding(centerX, centerZ, bw, bd, height, floors, baseColor, accentColor, windowLit, windowDark, h);
      }
    }
  }
  
  createBuilding(cx, cz, bw, bd, height, floors, baseColor, accentColor, windowLit, windowDark, seed) {
    const geometries = [];
    const materials = [];
    
    // Main building body
    const bodyGeo = new THREE.BoxGeometry(bw, height, bd);
    const bodyMat = createStandardMaterial(baseColor);
    geometries.push(bodyGeo);
    materials.push(bodyMat);
    
    // Roof
    const roofType = Math.floor(seed * 4) % 3;
    if (roofType === 0) {
      // Flat roof with AC units
      const roofGeo = new THREE.BoxGeometry(bw * 1.02, 1, bd * 1.02);
      const roofMat = createStandardMaterial(0x2a2a2a);
      roofGeo.translate(0, height / 2 + 0.5, 0);
      geometries.push(roofGeo);
      materials.push(roofMat);
    } else if (roofType === 1) {
      // Sloped roof
      const roofGeo = new THREE.ConeGeometry(Math.max(bw, bd) * 0.7, 4, 4);
      const roofMat = createStandardMaterial(accentColor);
      roofGeo.translate(0, height / 2 + 2, 0);
      roofGeo.rotateY(Math.PI / 4);
      geometries.push(roofGeo);
      materials.push(roofMat);
    } else {
      // Roof with helipad style
      const roofGeo = new THREE.BoxGeometry(bw * 1.02, 0.5, bd * 1.02);
      const roofMat = createStandardMaterial(0x3a3a3a);
      roofGeo.translate(0, height / 2 + 0.25, 0);
      geometries.push(roofGeo);
      materials.push(roofMat);
    }
    
    // Windows - create as separate geometry for emissive effect
    const windowGeo = new THREE.BufferGeometry();
    const windowPositions = [];
    const windowColors = [];
    const windowUVs = [];
    
    const windowSize = 1.2;
    const windowSpacing = 3;
    const cols = Math.floor(bw / windowSpacing);
    const rows = Math.floor(height / windowSpacing);
    const depthCols = Math.floor(bd / windowSpacing);
    
    for (let side = 0; side < 4; side++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < (side % 2 === 0 ? cols : depthCols); col++) {
          const lit = hash2D(cx + col * 10, cz + row * 10 + side * 100, this.seed + 1000) > 0.3;
          const color = lit ? windowLit : windowDark;
          
          // We'll use a simple approach - add window quads to main geometry
        }
      }
    }
    
    // Merge and create mesh
    const merged = mergeGeometries(geometries, materials);
    const building = new THREE.Mesh(merged, materials);
    building.position.set(cx, height / 2, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    building.userData = { type: 'building', height, bw, bd };
    this.scene.add(building);
    this.buildings.push(building);
  }
  
  createSidewalks() {
    const { WORLD, PALETTE } = CONFIG;
    const { BUILDING_GRID, STREET_WIDTH, SIDEWALK_WIDTH, HALF_SIZE } = WORLD;
    
    const sidewalkMat = createMaterial(PALETTE.SIDEWALK);
    
    // Sidewalks along main streets
    const mainSpacing = BUILDING_GRID * 4;
    
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      this.createSidewalk(x, -HALF_SIZE, x, HALF_SIZE, STREET_WIDTH * 1.5, SIDEWALK_WIDTH);
    }
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
      this.createSidewalk(-HALF_SIZE, z, HALF_SIZE, z, STREET_WIDTH * 1.5, SIDEWALK_WIDTH);
    }
  }
  
  createSidewalk(x1, z1, x2, z2, streetWidth, sidewalkWidth) {
    const { PALETTE } = CONFIG;
    const sidewalkMat = createMaterial(PALETTE.SIDEWALK);
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(x2 - x1, z2 - z1);
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    const offset = streetWidth / 2 + sidewalkWidth / 2;
    
    for (let side of [-1, 1]) {
      const sx = centerX + Math.sin(angle) * offset * side;
      const sz = centerZ + Math.cos(angle) * offset * side;
      const geo = new THREE.BoxGeometry(sidewalkWidth, 0.15, length);
      const mesh = new THREE.Mesh(geo, sidewalkMat);
      mesh.position.set(sx, 0.1, sz);
      mesh.rotation.y = angle;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.sidewalks.push(mesh);
    }
  }
  
  createPalms() {
    const { WORLD, PALETTE } = CONFIG;
    const { BUILDING_GRID, HALF_SIZE, SEA_LEVEL } = WORLD;
    
    const palmGeo = new THREE.CylinderGeometry(0.3, 0.5, 8, 6);
    const palmMat = createStandardMaterial(0x2a4a1a);
    const frondGeo = new THREE.ConeGeometry(2.5, 4, 5);
    const frondMat = createStandardMaterial(0x1a6a2a);
    
    // Palms along beach and streets
    for (let i = 0; i < 120; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = HALF_SIZE * 0.45 + this.random() * HALF_SIZE * 0.15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Only place on land (not in water, not too close to center)
      if (x * x + z * z < 80 * 80) continue;
      if (z < SEA_LEVEL + 5) continue;
      
      const palm = new THREE.Group();
      
      const trunk = new THREE.Mesh(palmGeo, palmMat);
      trunk.position.y = 4;
      trunk.castShadow = true;
      palm.add(trunk);
      
      // Fronds
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.y = 8 + f * 0.5;
        frond.rotation.x = -Math.PI / 2 + (f - 2) * 0.3;
        frond.rotation.y = f * (Math.PI * 2 / 5);
        frond.castShadow = true;
        palm.add(frond);
      }
      
      palm.position.set(x, 0, z);
      this.scene.add(palm);
      this.palms.push(palm);
    }
    
    // Street palms
    const mainSpacing = BUILDING_GRID * 4;
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      for (let z = -HALF_SIZE + BUILDING_GRID; z <= HALF_SIZE - BUILDING_GRID; z += BUILDING_GRID * 2) {
        if (this.random() < 0.4) {
          const palm = this.createSinglePalm();
          palm.position.set(x + (this.random() - 0.5) * 10, 0, z);
          this.scene.add(palm);
          this.palms.push(palm);
        }
      }
    }
  }
  
  createSinglePalm() {
    const { PALETTE } = CONFIG;
    const palm = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
    const trunkMat = createStandardMaterial(0x2a4a1a);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    palm.add(trunk);
    
    const frondGeo = new THREE.ConeGeometry(2, 3.5, 5);
    const frondMat = createStandardMaterial(0x1a6a2a);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.y = 7 + f * 0.4;
      frond.rotation.x = -Math.PI / 2 + (f - 2) * 0.25;
      frond.rotation.y = f * (Math.PI * 2 / 5);
      frond.castShadow = true;
      palm.add(frond);
    }
    return palm;
  }
  
  createStreetlights() {
    const { WORLD, PALETTE } = CONFIG;
    const { BUILDING_GRID, STREET_WIDTH, HALF_SIZE } = WORLD;
    
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.15, 7, 6);
    const poleMat = createStandardMaterial(0x3a3a3a);
    const lightGeo = new THREE.BoxGeometry(1.2, 0.3, 0.5);
    const lightMat = createStandardMaterial(0x2a2a2a);
    const glowGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.6 });
    
    const mainSpacing = BUILDING_GRID * 4;
    const offset = STREET_WIDTH * 1.5 / 2 + 2;
    
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      for (let z = -HALF_SIZE; z <= HALF_SIZE; z += BUILDING_GRID * 2) {
        this.createStreetlight(x + offset, z);
        this.createStreetlight(x - offset, z);
      }
    }
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
      for (let x = -HALF_SIZE; x <= HALF_SIZE; x += BUILDING_GRID * 2) {
        this.createStreetlight(x, z + offset);
        this.createStreetlight(x, z - offset);
      }
    }
  }
  
  createStreetlight(x, z) {
    const { PALETTE } = CONFIG;
    const light = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.15, 7, 6);
    const poleMat = createStandardMaterial(0x3a3a3a);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3.5;
    pole.castShadow = true;
    light.add(pole);
    
    const armGeo = new THREE.BoxGeometry(3, 0.15, 0.15);
    const armMat = createStandardMaterial(0x3a3a3a);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(1.5, 6.5, 0);
    arm.castShadow = true;
    light.add(arm);
    
    const headGeo = new THREE.BoxGeometry(1, 0.3, 0.4);
    const headMat = createStandardMaterial(0x1a1a1a);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(3, 6.5, 0);
    head.castShadow = true;
    light.add(head);
    
    // Light glow
    const glowGeo = new THREE.SphereGeometry(0.4, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.5 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(3, 6.35, 0);
    light.add(glow);
    light.userData.glow = glow;
    
    light.position.set(x, 0, z);
    this.scene.add(light);
    this.streetlights.push(light);
  }
  
  createBeach() {
    const { WORLD, PALETTE } = CONFIG;
    const { HALF_SIZE, SEA_LEVEL } = WORLD;
    
    // Beach sand ring
    const beachGeo = new THREE.RingGeometry(HALF_SIZE * 0.38, HALF_SIZE * 0.5, 64, 1);
    const beachMat = createStandardMaterial(PALETTE.SAND);
    beachGeo.rotateX(-Math.PI / 2);
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.position.y = SEA_LEVEL + 0.5;
    beach.receiveShadow = true;
    this.scene.add(beach);
    
    // Beach props - umbrellas, towels
    for (let i = 0; i < 30; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = HALF_SIZE * 0.4 + this.random() * HALF_SIZE * 0.08;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this.random() < 0.5) {
        this.createBeachUmbrella(x, z);
      }
    }
  }
  
  createBeachUmbrella(x, z) {
    const { PALETTE } = CONFIG;
    const umbrella = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
    const poleMat = createStandardMaterial(0x8a7a5a);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.25;
    umbrella.add(pole);
    
    const canopyGeo = new THREE.ConeGeometry(1.5, 0.5, 8);
    const colors = [0xc83838, 0x3878c8, 0xe8c838, 0xc838a8, 0x38c8c8];
    const canopyMat = createStandardMaterial(colors[Math.floor(this.random() * colors.length)]);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 2.5;
    umbrella.add(canopy);
    
    umbrella.position.set(x, 0, z);
    this.scene.add(umbrella);
  }
  
  createTrafficNodes() {
    const { WORLD } = CONFIG;
    const { BUILDING_GRID, STREET_WIDTH, HALF_SIZE } = WORLD;
    
    // Create waypoints along streets for traffic AI
    const mainSpacing = BUILDING_GRID * 4;
    
    // N-S main streets
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      for (let z = -HALF_SIZE; z <= HALF_SIZE; z += 20) {
        this.trafficNodes.push({ x, z, type: 'street', dir: 'z' });
      }
    }
    // E-W main streets
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
      for (let x = -HALF_SIZE; x <= HALF_SIZE; x += 20) {
        this.trafficNodes.push({ x, z, type: 'street', dir: 'x' });
      }
    }
    
    // Intersections
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
        this.trafficNodes.push({ x, z, type: 'intersection' });
      }
    }
  }
  
  createPedestrianNodes() {
    const { WORLD } = CONFIG;
    const { BUILDING_GRID, SIDEWALK_WIDTH, HALF_SIZE } = WORLD;
    
    // Nodes along sidewalks
    const mainSpacing = BUILDING_GRID * 4;
    const offset = STREET_WIDTH * 1.5 / 2 + SIDEWALK_WIDTH / 2;
    
    for (let x = -HALF_SIZE; x <= HALF_SIZE; x += mainSpacing) {
      for (let z = -HALF_SIZE; z <= HALF_SIZE; z += 15) {
        this.pedestrianNodes.push({ x: x + offset, z, type: 'sidewalk' });
        this.pedestrianNodes.push({ x: x - offset, z, type: 'sidewalk' });
      }
    }
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z += mainSpacing) {
      for (let x = -HALF_SIZE; x <= HALF_SIZE; x += 15) {
        this.pedestrianNodes.push({ x, z: z + offset, type: 'sidewalk' });
        this.pedestrianNodes.push({ x, z: z - offset, type: 'sidewalk' });
      }
    }
  }
  
  createParkingSpots() {
    const { WORLD } = CONFIG;
    const { BUILDING_GRID, HALF_SIZE } = WORLD;
    
    // Parking spots near buildings
    for (let i = 0; i < 40; i++) {
      const gx = Math.floor((this.random() - 0.5) * (HALF_SIZE / BUILDING_GRID) * 2);
      const gz = Math.floor((this.random() - 0.5) * (HALF_SIZE / BUILDING_GRID) * 2);
      const cx = gx * BUILDING_GRID;
      const cz = gz * BUILDING_GRID;
      
      if (Math.abs(cx) < 80 && Math.abs(cz) < 80) continue;
      
      const angle = this.random() * Math.PI * 2;
      const offsetX = Math.cos(angle) * (BUILDING_GRID * 0.35);
      const offsetZ = Math.sin(angle) * (BUILDING_GRID * 0.35);
      
      this.parkingSpots.push({ x: cx + offsetX, z: cz + offsetZ, rotation: angle });
    }
  }
  
  // Get nearest street position for vehicle spawning
  getNearestStreetPosition(x, z, radius = 50) {
    let best = null;
    let bestDist = radius * radius;
    
    for (const node of this.trafficNodes) {
      if (node.type === 'street') {
        const dx = node.x - x;
        const dz = node.z - z;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDist) {
          bestDist = distSq;
          best = node;
        }
      }
    }
    return best;
  }
  
  // Get random parking spot
  getRandomParkingSpot() {
    if (this.parkingSpots.length === 0) return null;
    return this.parkingSpots[Math.floor(this.random() * this.parkingSpots.length)];
  }
  
  // Get spawn position for player
  getPlayerSpawn() {
    return new THREE.Vector3(0, 1, 0);
  }
  
  // Update animated elements
  update(delta, timeOfDay) {
    // Water animation
    if (this.water) {
      this.water.userData.time += delta;
      const t = this.water.userData.time;
      this.water.material.color.lerpColors(
        CONFIG.PALETTE.WATER_DAY,
        CONFIG.PALETTE.WATER_NIGHT,
        (Math.sin(t * 0.5) + 1) * 0.5 * 0.3
      );
    }
    
    // Sky color based on time of day
    if (this.sky) {
      const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
      const skyColor = new THREE.Color().lerpColors(
        CONFIG.PALETTE.SKY_NIGHT,
        CONFIG.PALETTE.SKY_DAY,
        dayFactor
      );
      this.sky.material.color.copy(skyColor);
      
      // Fog color
      this.scene.fog.color.lerpColors(
        CONFIG.PALETTE.FOG_NIGHT,
        CONFIG.PALETTE.FOG_DAY,
        dayFactor
      );
    }
    
    // Sun position
    if (this.sun) {
      const angle = timeOfDay * Math.PI * 2;
      this.sun.position.set(
        Math.cos(angle) * 400,
        Math.sin(angle) * 400 + 200,
        Math.sin(angle) * 300
      );
      
      // Sun color
      const dayFactor = (Math.sin(timeOfDay * Math.PI * 2) + 1) / 2;
      this.sun.material.color.lerpColors(
        CONFIG.PALETTE.SKY_NIGHT,
        CONFIG.PALETTE.SUN_COLOR,
        dayFactor
      );
    }
    
    // Streetlight glow pulse
    for (const light of this.streetlights) {
      if (light.userData.glow) {
        const intensity = 0.3 + Math.sin(time * 2 + light.position.x * 0.1) * 0.2;
        light.userData.glow.material.opacity = intensity;
      }
    }
  }
  
  // Raycast to ground
  raycastGround(x, z) {
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(x, 100, z),
      new THREE.Vector3(0, -1, 0),
      0, 200
    );
    const intersects = raycaster.intersectObject(this.ground, true);
    return intersects[0] ? intersects[0].point.y : 0;
  }
  
  // Check if position is on street
  isOnStreet(x, z, tolerance = 2) {
    for (const street of this.streets) {
      if (street.width) {
        const dx = x - street.x1;
        const dz = z - street.z1;
        const lenSq = (street.x2 - street.x1) ** 2 + (street.z2 - street.z1) ** 2;
        if (lenSq === 0) continue;
        const t = Math.max(0, Math.min(1, (dx * (street.x2 - street.x1) + dz * (street.z2 - street.z1)) / lenSq));
        const projX = street.x1 + t * (street.x2 - street.x1);
        const projZ = street.z1 + t * (street.z2 - street.z1);
        const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
        if (dist < street.width / 2 + tolerance) return true;
      }
    }
    return false;
  }
  
  // Get street direction at position
  getStreetDirection(x, z) {
    for (const street of this.streets) {
      if (street.width) {
        const dx = x - street.x1;
        const dz = z - street.z1;
        const lenSq = (street.x2 - street.x1) ** 2 + (street.z2 - street.z1) ** 2;
        if (lenSq === 0) continue;
        const t = Math.max(0, Math.min(1, (dx * (street.x2 - street.x1) + dz * (street.z2 - street.z1)) / lenSq));
        const projX = street.x1 + t * (street.x2 - street.x1);
        const projZ = street.z1 + t * (street.z2 - street.z1);
        const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
        if (dist < street.width / 2 + 2) {
          return new THREE.Vector3(street.x2 - street.x1, 0, street.z2 - street.z1).normalize();
        }
      }
    }
    return null;
  }
}

