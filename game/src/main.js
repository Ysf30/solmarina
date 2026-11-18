// Solmarina - Main Game Entry Point

import * as THREE from 'three';
import { CONFIG, DAY_CYCLE } from './config.js';
import { createInput, ACTION } from './input.js';
import { initAudio, startMusic, stopMusic, setMusicMood, playMissionComplete, playWantedLevelChange } from './audio.js';
import { City } from './city.js';
import { Player } from './player.js';
import { TrafficSystem } from './traffic.js';
import { Vehicle } from './vehicles.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { CombatSystem } from './combat.js';
import { HUD } from './hud.js';
import { EffectsSystem } from './effects.js';
import { SaveSystem } from './save.js';

// Global state
let renderer, scene, camera, clock;
let city, player, traffic, police, missions, combat, hud, effects, saveSystem;
let input;
let timeOfDay = 0.25; // Start at morning
let isPaused = false;
let isLoading = true;
let lastTime = 0;
let currentShot = null; // Track active shot preset

// Shot presets for screenshots
const SHOT_PRESETS = {
  start: () => setupShotStart(),
  foot: () => setupShotFoot(),
  drive: () => setupShotDrive(),
  chase: () => setupShotChase(),
  mission: () => setupShotMission(),
};

async function init() {
  // Initialize audio
  initAudio();
  
  // Get canvas
  const canvas = document.getElementById('game');
  if (!canvas) {
    showError('Canvas not found');
    return;
  }
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.PALETTE.SKY_DAY);

  
  // Create camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
  
  // Clock for fixed timestep
  clock = new THREE.Clock();
  
  // Input system
  input = createInput(canvas);
  
  // Build city first (needed by other systems)
  city = new City(scene, CONFIG.SHOTS.SEED);
  
  // Create player
  player = new Player(scene, city, input, {
    playGunshot: (pos) => { /* audio.playGunshot(pos) */ },
    playPunch: () => { /* audio.playPunch() */ },
  });
  player.position.copy(city.getPlayerSpawn());
  player.mesh.position.copy(player.position);
  
  // Create systems
  traffic = new TrafficSystem(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
    playGunshot: (pos) => { /* audio.playGunshot(pos) */ },
    playCarHorn: () => { /* audio.playCarHorn() */ },
    playTireScreech: () => {},
  }, player);
  
  police = new PoliceSystem(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
    playExplosion: (pos) => { /* audio.playExplosion(pos) */ },
    playWantedLevelChange: (level) => { playWantedLevelChange(level); },
  }, player, traffic);
  
  effects = new EffectsSystem(scene);
  
  combat = new CombatSystem(scene, city, player, traffic, police, {
    playGunshot: (pos) => { /* audio.playGunshot(pos) */ },
    playPunch: () => { /* audio.playPunch() */ },
  }, effects);
  
  missions = new MissionSystem(scene, city, player, police, {
    playGunshot: (pos) => { /* audio.playGunshot(pos) */ },
    playPunch: () => { /* audio.playPunch() */ },
    playPickupSound: () => { /* audio.playPickupSound() */ },
    playMissionComplete: () => { playMissionComplete(); },
  }, hud);
  
  // Get shot parameter early for HUD
  const urlParams = new URLSearchParams(window.location.search);
  const shot = urlParams.get('shot');
  const isGameplayShot = shot && ['foot', 'drive', 'chase', 'mission'].includes(shot);

  // HUD needs missions, so create after
  hud = new HUD(player, city, police, missions, traffic.vehicles, {
    playPickupSound: () => { /* audio.playPunch() */ },
    playMissionComplete: () => { playMissionComplete(); },
    playWantedLevelChange: (level) => { playWantedLevelChange(level); },
  }, isGameplayShot);
  
  // Update missions with hud reference
  missions.hud = hud;
  
  saveSystem = new SaveSystem(player, city, missions, police, traffic.vehicles, traffic, hud);

  // Connect player to systems
  player.city = city;
  player.audio = {
    playGunshot: (pos) => { /* audio.playGunshot(pos) */ },
    playPunch: () => { /* audio.playPunch() */ },
  };

  // Set up shot preset from URL (shot already parsed above)
  if (shot && SHOT_PRESETS[shot]) {
    currentShot = shot;
    SHOT_PRESETS[shot]();
  }
  
  // Event listeners
  window.addEventListener('resize', onResize);
  window.addEventListener('gamepause', (e) => { isPaused = e.detail.paused; });
  window.addEventListener('gamesave', () => saveSystem.autoSave());
  window.addEventListener('gameload', () => saveSystem.load(saveSystem.currentSlot));
  window.addEventListener('gamereset', () => location.reload());
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') { e.preventDefault(); saveSystem.autoSave(); hud.showMessage('Game saved', 1); }
    if (e.key === 'F9') { e.preventDefault(); saveSystem.load(saveSystem.currentSlot); hud.showMessage('Game loaded', 1); }
  });
  
  // Start render loop
  isLoading = false;
  lastTime = performance.now();
  requestAnimationFrame(animate);
  
  // Start ambient music
  startMusic('ambient');
  
  console.log('Solmarina initialized');
}

function animate(currentTime) {
  requestAnimationFrame(animate);
  
  if (isLoading) return;
  
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  // Fixed timestep
  const frameTime = Math.min(deltaTime, CONFIG.MAX_FRAME);
  const steps = Math.ceil(frameTime / CONFIG.STEP);
  const stepDelta = frameTime / steps;
  
  for (let i = 0; i < steps; i++) {
    update(stepDelta);
  }
  
  render();
}

function update(delta) {
  // Update input
  input.update();

  // Toggle pause
  if (input.isPressed(input.constructor.name === 'Object' ? 1 << 10 : 0)) {
    // Escape key handled by input system
  }

  // Update time of day
  timeOfDay = (timeOfDay + delta / DAY_CYCLE) % 1;

  // Update city (sky, water, lights)
  city.update(delta, timeOfDay);

  // Update music mood based on wanted level
  if (police.wantedLevel > 0) {
    setMusicMood(police.wantedLevel >= 3 ? 'action' : 'tension');
  } else {
    setMusicMood('ambient');
  }

  // Update player (skip for start shot - camera is fixed)
  if (currentShot !== 'start') {
    player.update(delta, camera);
  }
  
  // Update traffic
  traffic.update(delta, timeOfDay);
  
  // Update police
  police.update(delta);
  
  // Update missions
  missions.update(delta);
  
  // Update combat
  combat.update(delta, camera);
  
  // Update effects
  effects.update(delta);
  
  // Update HUD
  hud.update(delta);
  
  // Handle player shooting
  if (player.input.isDown(ACTION.SHOOT) && player.isAiming && !player.inVehicle) {
    const shot = player.shoot();
    if (shot) {
      const result = combat.shoot(shot.origin, shot.direction, shot.damage, shot.range, shot.spread);
      if (result.hit && result.victim) {
        // Handle hit
        if (result.type === 'enemy') {
          missions.onEnemyKilled(result.point);
        }
      }
    }
  }
  
  // Handle melee
  if (player.input.isPressed(ACTION.ATTACK) && !player.inVehicle) {
    const melee = player.meleeAttack();
    // Simple melee hit detection
    const raycaster = new THREE.Raycaster(melee.origin, melee.direction, 0, melee.range);
    const objects = [];
    for (const ped of traffic.pedestrians) objects.push(ped.mesh);
    for (const enemy of combat.enemies) objects.push(enemy.mesh);
    const hits = raycaster.intersectObjects(objects, true);
    if (hits.length > 0) {
      const hit = hits[0];
      let victim = null;
      for (const ped of traffic.pedestrians) {
        if (ped.mesh === hit.object || ped.mesh.children.includes(hit.object)) {
          ped.takeDamage(melee.damage, player.position);
          victim = ped;
          break;
        }
      }
      for (const enemy of combat.enemies) {
        if (enemy.mesh === hit.object) {
          enemy.takeDamage(melee.damage);
          victim = enemy;
          break;
        }
      }
      if (victim) {
        effects.createBlood(hit.point);
        player.audio.playPunch();
        police.reportCrime('ASSAULT', hit.point);
      }
    }
  }
  
  // Vehicle enter/exit
  if (input.isPressed(ACTION.ENTER_VEHICLE)) {
    if (player.inVehicle) {
      player.exitVehicle();
    } else {
      const vehicle = traffic.getNearestVehicle(player.position);
      if (vehicle) {
        player.enterVehicle(vehicle);
        traffic.onVehicleStolen(vehicle);
        hud.showMessage('Vehicle stolen', 2);
        police.reportCrime('VEHICLE_THEFT', player.position);
      }
    }
  }
  
  // Check player death
  if (player.isDead && !police.busted) {
    police.onPlayerWasted();
    hud.showMessage('WASTED', 3);
    setTimeout(() => {
      const spawn = city.getPlayerSpawn();
      player.position.copy(spawn);
      player.health = player.maxHealth;
      player.isDead = false;
      player.velocity.set(0, 0, 0);
    }, 3000);
  }
}

function render() {
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed; inset: 0; background: #1a0a0a; color: #ff4444;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: system-ui; z-index: 1000; padding: 20px; text-align: center;
  `;
  errorDiv.innerHTML = `<h2>Error</h2><p>${message}</p><p style="font-size: 12px; color: #888;">WebGL may not be supported</p>`;
  document.body.appendChild(errorDiv);
}

// Shot preset setups
function setupShotStart() {
  // Title screen shot - show start screen
  timeOfDay = 0.35; // Late morning for nice lighting
  player.position.set(0, 1, 0);
  player.mesh.position.copy(player.position);
  camera.position.set(0, 50, 80);
  camera.lookAt(0, 0, 0);
  // Keep start screen visible
  // Increase exposure for screenshot
  if (renderer) renderer.toneMappingExposure = 1.2;
}

function setupShotFoot() {
  // On-foot gameplay shot - face buildings at negative X
  timeOfDay = 0.38; // Morning, good sun angle
  player.position.set(-100, 1, 50);
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = -Math.PI / 2; // Face -X direction (towards buildings)
  player.targetRotation = -Math.PI / 2;
  // Camera will be set by player.updateCamera()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Increase exposure for screenshot
  if (renderer) renderer.toneMappingExposure = 1.3;
}

function setupShotDrive() {
  // Driving shot
  timeOfDay = 0.4; // Mid-morning
  const vehicle = new Vehicle(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
  }, 'sports');
  vehicle.position.set(200, 0.5, -100);
  vehicle.rotation = -Math.PI / 4;
  vehicle.engineOn = true;
  vehicle.speed = 25; // Moving for motion blur effect
  player.enterVehicle(vehicle);
  traffic.vehicles.push(vehicle);

  // Camera will be set by player.updateInVehicle()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Increase exposure for screenshot
  if (renderer) renderer.toneMappingExposure = 1.3;
}

function setupShotChase() {
  // Police chase shot - cover screenshot (SUNSET with dramatic police lights)
  timeOfDay = 0.7; // Sunset - dark sky, police lights will be very visible (red/blue)
  const vehicle = new Vehicle(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
  }, 'sports');
  vehicle.position.set(0, 0.5, 0);
  vehicle.rotation = 0;
  vehicle.engineOn = true;
  vehicle.speed = 30;
  player.enterVehicle(vehicle);
  traffic.vehicles.push(vehicle);

  // Spawn police behind
  for (let i = 0; i < 3; i++) {
    const cop = new Vehicle(scene, city, {
      playEngineSound: () => {},
      stopEngineSound: () => {},
      playSiren: () => {},
    }, 'police', CONFIG.PALETTE.POLICE);
    cop.position.set(-20 - i * 15, 0.5, (i % 2 === 0 ? -5 : 5));
    cop.rotation = 0;
    cop.engineOn = true;
    cop.setSiren(true);
    cop.speed = 28;
    cop.isPolice = true;
    police.policeCars.push(cop);
  }

  police.setWantedLevel(3);

  // Camera will be set by player.updateInVehicle()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Very high exposure for sunset police lights
  if (renderer) renderer.toneMappingExposure = 2.0;
}

function setupShotMission() {
  // Mission gameplay shot - different location (industrial area)
  timeOfDay = 0.2; // Very early morning - distinct cool/blue tones
  player.position.set(320, 1, 120); // Industrial district pickup location
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = -Math.PI / 4; // Face towards dropoff
  player.targetRotation = -Math.PI / 4;

  // Activate a mission
  missions.activeMission = missions.missions[1]; // pickup mission
  missions.activeMission.currentObjective = 1;
  hud.setObjective('Deliver the package to the safehouse');
  hud.setWaypoint(new THREE.Vector3(-380, 0, -320));

  // Camera will be set by player.updateCamera()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Increase exposure for screenshot
  if (renderer) renderer.toneMappingExposure = 1.4;
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.game = {
  get renderer() { return renderer; },
  get scene() { return scene; },
  get camera() { return camera; },
  get player() { return player; },
  get city() { return city; },
  get traffic() { return traffic; },
  get police() { return police; },
  get missions() { return missions; },
  get combat() { return combat; },
  get hud() { return hud; },
  get effects() { return effects; },
  get saveSystem() { return saveSystem; },
  get timeOfDay() { return timeOfDay; },
};

