import * as THREE from 'three';
// Solmarina - Configuration Constants
// All tuning numbers, colors, and game constants in one place

export const CONFIG = {
  // World dimensions
  WORLD: {
    SIZE: 2048,
    HALF_SIZE: 1024,
    GROUND_Y: 0,
    SEA_LEVEL: -2,
    BUILDING_GRID: 64,
    STREET_WIDTH: 24,
    SIDEWALK_WIDTH: 4,
  },

  // Simulation
  STEP: 1 / 60,
  MAX_FRAME: 0.25,
  GRAVITY: -28,

  // Player on foot
  PLAYER: {
    HEIGHT: 1.8,
    RADIUS: 0.35,
    EYE_HEIGHT: 1.6,
    WALK_SPEED: 5.5,
    RUN_SPEED: 11,
    JUMP_VELOCITY: 9.5,
    TURN_SPEED: 4.5,
    HEALTH: 100,
    MAX_HEALTH: 100,
    REGEN_RATE: 0.5,
    REGEN_DELAY: 5,
    PUNCH_RANGE: 1.8,
    PUNCH_DAMAGE: 25,
    PUNCH_COOLDOWN: 0.6,
  },

  // Vehicle
  VEHICLE: {
    MAX_SPEED: 45,
    ACCELERATION: 28,
    BRAKE_FORCE: 35,
    HANDLING: 3.2,
    DRIFT_FACTOR: 0.85,
    MASS: 1500,
    WHEEL_BASE: 2.7,
    TRACK_WIDTH: 1.6,
    ENTER_RANGE: 2.5,
    HEALTH: 1000,
    SMOKE_THRESHOLD: 300,
    FIRE_THRESHOLD: 100,
    EXPLOSION_DAMAGE: 500,
  },

  // Traffic
  TRAFFIC: {
    SPAWN_DISTANCE: 55,
    DESPAWN_DISTANCE: 180,
    MAX_VEHICLES: 24,
    MAX_PEDESTRIANS: 32,
    SPEED_MIN: 8,
    SPEED_MAX: 18,
    LANE_CHANGE_COOLDOWN: 3,
    PEDESTRIAN_SPEED: 1.4,
    PEDESTRIAN_RUN_SPEED: 3.5,
  },

  // Wanted System
  WANTED: {
    MAX_STARS: 5,
    STAR_DECAY: [0, 8, 6, 4, 3, 2], // seconds per star level
    POLICE_SPAWN_RADIUS: 80,
    POLICE_DESPAWN_RADIUS: 200,
    MAX_POLICE: [0, 2, 4, 6, 8, 12],
    MAX_HELICOPTERS: [0, 0, 0, 1, 2, 3],
    SEARCH_RADIUS: [0, 40, 60, 80, 100, 150],
    ESCALATION_THRESHOLD: [0, 10, 25, 50, 100, 200], // crime points
    CRIME_VALUES: {
      ASSAULT: 5,
      VEHICLE_THEFT: 15,
      COP_HIT: 30,
      CIVILIAN_KILL: 20,
      COP_KILL: 50,
      PROPERTY_DAMAGE: 3,
    },
  },

  // Combat
  COMBAT: {
    PISTOL_DAMAGE: 35,
    PISTOL_RANGE: 50,
    PISTOL_SPREAD: 0.04,
    PISTOL_COOLDOWN: 0.18,
    PISTOL_AMMO: 120,
    HEADSHOT_MULT: 2.5,
    MELEE_RANGE: 2,
    MELEE_DAMAGE: 30,
  },

  // Camera
  CAMERA: {
    FOOT_OFFSET: new THREE.Vector3(0, 1.6, 0),
    FOOT_DISTANCE: 6.5,
    FOOT_HEIGHT: 1.8,
    VEHICLE_OFFSET: new THREE.Vector3(0, 1.2, 0),
    VEHICLE_DISTANCE: 8,
    VEHICLE_HEIGHT: 2.5,
    LERP_SPEED: 8,
    LOOK_AHEAD: 3,
    MIN_PITCH: -0.5,
    MAX_PITCH: 0.8,
  },

  // HUD
  HUD: {
    MINIMAP_SIZE: 200,
    MINIMAP_RANGE: 180,
    MINIMAP_ZOOM: 1,
  },

  // Audio
  AUDIO: {
    MASTER_VOLUME: 0.6,
    MUSIC_VOLUME: 0.35,
    SFX_VOLUME: 0.7,
    ENGINE_BASE_FREQ: 55,
    SIREN_FREQS: [880, 660],
    GUNSHOT_FREQ: 120,
    PUNCH_FREQ: 80,
  },

  // Colors / Palette
  PALETTE: {
    SKY_DAY: 0x87ceeb,
    SKY_SUNSET: 0xff6b35,
    SKY_NIGHT: 0x0a0e1a,
    SUN_COLOR: 0xffdd88,
    SUNSET_SUN: 0xff4422,
    FOG_DAY: 0x87ceeb,
    FOG_SUNSET: 0xff6b35,
    FOG_NIGHT: 0x0a0e1a,
    WATER_DAY: 0x1a5a8a,
    WATER_SUNSET: 0x2a3a5a,
    WATER_NIGHT: 0x0a1a2a,
    SAND: 0xe8d5b7,
    GRASS: 0x3a6b2a,
    // Road/sidewalk were near-black (0x2a2a2e): in building shadow, with
    // ACES tonemapping, the street the player stands on rendered as a
    // featureless black void (the on-foot shot's whole lower half). A
    // lighter asphalt + sidewalk keeps the street readable in shadow
    // while staying darker than the grass/buildings in sun.
    ROAD: 0x3d3d44,
    SIDEWALK: 0x5c5c64,
    // Base colors were dark blue-greys (0x3a3a4a...): shaded faces rendered
    // near-black under ACES tonemapping. Lighter warm tones keep the city
    // readable in shadow while staying darker than sunlit faces.
    BUILDING_BASE: [0x6a6a7e, 0x7a7a8c, 0x8a8a9c, 0x5a5a6e, 0x9a8a76],
    BUILDING_ACCENT: [0x8a7a5a, 0x7a6a5a, 0x9a8a6a, 0x6a5a4a, 0xaa9a7a],
    WINDOW_LIT: 0xffee88,
    WINDOW_DARK: 0x1a1a2a,
    VEHICLE_COLORS: [
      0xc83838, 0x3878c8, 0x38a838, 0xe8c838, 0xc838a8, 0x38c8c8,
      0xa85828, 0x585868, 0x888898, 0xd8d8d8, 0x181818, 0xf8f8e8
    ],
    POLICE: 0x1a3a6a,
    POLICE_LIGHT_BLUE: 0x0088ff,
    POLICE_LIGHT_RED: 0xff2222,
    PLAYER_CLOTHES: 0x2a5a8a,
    PLAYER_SKIN: 0xd8b898,
    HEALTH_GREEN: 0x22cc44,
    HEALTH_YELLOW: 0xddaa00,
    HEALTH_RED: 0xcc2222,
    ARMOR_BLUE: 0x2288cc,
    CASH_GOLD: 0xe8c56a,
    WANTED_RED: 0xff3333,
    WANTED_GRAY: 0x444444,
    MINIMAP_PLAYER: 0x00ff88,
    MINIMAP_VEHICLE: 0x88aaff,
    MINIMAP_POLICE: 0xff4444,
    MINIMAP_MISSION: 0xffcc00,
    MINIMAP_CIVILIAN: 0x88cc88,
  },

  // Missions
  MISSIONS: {
    MAX_ACTIVE: 1,
    MARKER_SIZE: 3,
    MARKER_HEIGHT: 5,
    REWARD_MULTIPLIER: 100,
  },

  // Save
  SAVE: {
    KEY: 'solmarina_save',
    VERSION: 1,
    SLOTS: 3,
  },

  // Shots / Screenshots
  SHOTS: {
    SCENES: ['title', 'drive', 'chase', 'mission'],
    SEED: 123456789,
    WIDTH: 1280,
    HEIGHT: 800,
  },
};

// Time of day cycle (seconds per full day)
export const DAY_CYCLE = 1200; // 20 minutes per day

// Mission definitions
export const MISSION_DEFS = [
  {
    id: 'intro',
    name: 'Arrival',
    giver: 'Mara Voss',
    description: 'Meet your contact at the marina.',
    objectives: [
      { type: 'goto', target: 'marina', position: new THREE.Vector3(-200, 0, -180), radius: 5 },
    ],
    reward: 500,
    unlocks: 'pickup',
    dialogue: {
      start: "Welcome to Solmarina. I'm Mara Voss. You're the new wheelman? Good. Meet me at the marina — we got work.",
      progress: "Head to the marina. Don't keep me waiting.",
      complete: "There you are. Let's see what you're made of.",
    },
  },
  {
    id: 'pickup',
    name: 'The Package',
    giver: 'Mara Voss',
    description: 'Retrieve a package from the industrial district and deliver it to the safehouse.',
    objectives: [
      { type: 'goto', target: 'pickup', position: new THREE.Vector3(320, 0, 120), radius: 4 },
      { type: 'goto', target: 'dropoff', position: new THREE.Vector3(-380, 0, -320), radius: 5 },
    ],
    reward: 1500,
    unlocks: 'chase',
    dialogue: {
      start: "Simple job. Pick up the package at the warehouse on 3rd and Canal. Drop it at the safehouse in Old Town. No cops, no witnesses.",
      pickup: "Package secured. Now get it to the safehouse. Fast.",
      progress: "Drive to the safehouse in Old Town. Watch your six.",
      complete: "Clean delivery. You're building a reputation.",
    },
  },
  {
    id: 'chase',
    name: 'Heat',
    giver: 'Mara Voss',
    description: 'Lose the tail after a deal goes sideways.',
    objectives: [
      { type: 'survive', duration: 90, position: new THREE.Vector3(180, 0, 280) },
    ],
    reward: 3000,
    unlocks: 'turf',
    dialogue: {
      start: "Meet me at the overlook. We're moving product. If things go loud, you lose the heat.",
      trigger: "Contact compromised! Lose the cops — now!",
      progress: "Stay alive! Keep moving!",
      complete: "You shook them. Impressive. There's bigger money in territory.",
    },
  },
  {
    id: 'turf',
    name: 'Turf War',
    giver: 'Mara Voss',
    description: 'Take control of the docks from a rival crew.',
    objectives: [
      { type: 'eliminate', target: 'rivals', count: 8, position: new THREE.Vector3(-400, 0, 380), radius: 30 },
    ],
    reward: 5000,
    unlocks: 'finale',
    dialogue: {
      start: "The Varela crew's moving in on our docks. Take them out. Send a message.",
      progress: "Clear the docks. Leave no one standing.",
      complete: "Docks are ours. The Varelas won't try that again. One last job — the big score.",
    },
  },
  {
    id: 'finale',
    name: 'The Solmarina Score',
    giver: 'Mara Voss',
    description: 'Infiltrate the casino vault and escape with the take.',
    objectives: [
      { type: 'goto', target: 'casino', position: new THREE.Vector3(0, 0, 0), radius: 4 },
      { type: 'goto', target: 'vault', position: new THREE.Vector3(20, 0, -10), radius: 3 },
      { type: 'escape', target: 'helipad', position: new THREE.Vector3(400, 20, -400), radius: 10 },
    ],
    reward: 15000,
    unlocks: null,
    dialogue: {
      start: "The big one. Casino vault. Forty million. Helicopter on the roof. You in?",
      vault: "Vault's open. Grab it and move!",
      escape: "To the roof! The chopper's waiting!",
      complete: "We did it. Solmarina's ours now. Welcome to the top.",
    },
  },
];

// Three.js will be imported in modules that need it
// This file just holds constants
