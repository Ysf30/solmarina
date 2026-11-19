// Solmarina - Main Game Entry Point

import * as THREE from 'three';
import { CONFIG, DAY_CYCLE } from './config.js';
import { createInput, ACTION } from './input.js';
import { initAudio, startMusic, stopMusic, setMusicMood, playMissionComplete, playWantedLevelChange, toggleMute } from './audio.js';
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
  setLoadProgress(5, 'Loading Solmarina...');

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
  setLoadProgress(25, 'Building city...');
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
  setLoadProgress(60, 'Spawning systems...');
  
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
  setLoadProgress(85, 'Preparing HUD...');

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
  setLoadProgress(100, 'Ready');
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

  // Input state is snapshotted once per rendered frame, here — not once
  // per physics step inside update(): update() runs up to 15 steps per
  // frame, and snapshotting inside it made isPressed() true only on the
  // first step of the frame.
  input.update();

  // Pause toggle (Esc) works even while paused; the world update below
  // is gated on isPaused, which the 'gamepause' event keeps in sync.
  if (input.isPressed(ACTION.PAUSE)) {
    hud.togglePause();
  }

  // Mute toggle (N key).
  if (input.isPressed(ACTION.MUTE)) {
    toggleMute();
    hud.setMuteButton();
  }

  if (!isPaused) {
    // Fixed timestep
    const frameTime = Math.min(deltaTime, CONFIG.MAX_FRAME);
    const steps = Math.ceil(frameTime / CONFIG.STEP);
    const stepDelta = frameTime / steps;

    for (let i = 0; i < steps; i++) {
      update(stepDelta);
    }
  }

  render();
}

function update(delta) {
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

function setLoadProgress(pct, text) {
  // Drives the loading bar in index.html (window.__solmarinaProgress is
  // defined by the inline script there; no-op if it isn't).
  if (typeof window.__solmarinaProgress === 'function') window.__solmarinaProgress(pct, text);
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
  // On-foot gameplay shot. The player stands ON the main street (x = 0)
  // facing NORTH (-Z), down the street: the road recedes ahead with its
  // lane markings, buildings line both sides (their south faces catch
  // the morning sun), and street traffic is visible. (Facing east across
  // the street showed only a flat road foreground and one row of shaded
  // building faces; facing west was worse still — shaded faces and road
  // in building shadow, the whole frame black. The old spot (-100, 50)
  // put the player ~8 m from a building face, so the frame was mostly
  // flat black wall.)
  timeOfDay = 0.38; // Morning, good sun angle
  // z = 120 (not 40): at 40 the player was inside the finale mission's
  // 50-unit auto-start radius around the casino (0, 0), so the finale
  // triggered and its big yellow objective cone filled the frame center.
  // At 120 the shot is clean; the banner is set directly instead.
  // The player stands just south-west of the 0/128 intersection facing
  // north-east, so two streets recede diagonally and the corner
  // buildings' sunlit south-west faces fill the frame — standing
  // mid-street facing straight north left a flat empty road filling the
  // whole lower frame, and hugging the east edge put a big dark
  // building slab on the right.
  player.position.set(-8, 1, 136);
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = 3 * Math.PI / 4; // Face +X,-Z (north-east)
  player.targetRotation = 3 * Math.PI / 4;
  hud.setObjective('Explore Solmarina');
  // Camera will be set by player.updateCamera()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Increase exposure for screenshot
  if (renderer) renderer.toneMappingExposure = 1.3;
}

function setupShotDrive() {
  // Driving shot: cruise down the x = 192 minor street so the car keeps
  // moving for the shot instead of coasting to 0 KM/H with no keys held.
  timeOfDay = 0.4; // Mid-morning
  const vehicle = new Vehicle(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
  }, 'sports', 0xe8e8e8); // fixed silver-white: a random dark paint can make
  // the player car unreadable against the road in some captures
  vehicle.position.set(192, 0.5, -96);
  vehicle.rotation = 0; // Drive +Z along the street
  vehicle.engineOn = true;
  vehicle.cruiseSpeed = 25;
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
  // Police chase shot - cover screenshot. TRUE sunset: at the old
  // timeOfDay 0.7 the sun is already set (dayFactor ~0.02, near-night),
  // which made the first submission's cover almost black. 0.50 is low
  // warm sun with the new sunset sky tint — and it leaves headroom: a
  // headless capture simulates ~15–60 game-seconds, advancing timeOfDay
  // by up to ~0.05, and the sun sets at ~0.583, so starting at 0.55
  // ended the shot after dark.
  // The car drives WEST (-X) down the z = 0 main street, straight into
  // the sunset, so the camera looks at a pink sky and silhouetted
  // buildings instead of the dark northern sky. cruiseDistance stops it
  // at x = 100, inside the built-up city: headless captures simulate
  // anywhere from ~15 to ~60 game-seconds in a 30 s virtual-time budget,
  // so an uncapped cruise ends up anywhere from mid-city to the world
  // edge depending on the run. x = 100 also stays clear of the finale
  // mission's auto-start radius (50 around the origin).
  timeOfDay = 0.50;
  const vehicle = new Vehicle(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
  }, 'sports', 0xe8e8e8); // fixed silver-white: a random dark paint made the
  // player car unreadable against the dusk road in some captures
  vehicle.position.set(500, 0.5, 0);
  vehicle.rotation = -Math.PI / 2; // Drive -X (west, into the sunset)
  vehicle.engineOn = true;
  vehicle.cruiseSpeed = 30; // keeps moving with no keys pressed
  vehicle.cruiseDistance = 350; // then stop near x = 125, inside the city
  player.enterVehicle(vehicle);
  traffic.vehicles.push(vehicle);

  // Police escort in formation ahead of the player car, sirens flashing:
  // they hold the same cruise speed, so they stay in frame for the whole
  // shot. (The old preset parked them off to the side at x = -20..-50,
  // out of frame — and the police AI NaN'd them away on the first tick.)
  for (let i = 0; i < 3; i++) {
    const cop = new Vehicle(scene, city, {
      playEngineSound: () => {},
      stopEngineSound: () => {},
      playSiren: () => {},
    }, 'police', CONFIG.PALETTE.POLICE);
    cop.position.set(500 - 30 - i * 15, 0.5, i % 2 === 0 ? -10 : 10);
    cop.rotation = -Math.PI / 2;
    cop.engineOn = true;
    cop.setSiren(true);
    cop.cruiseSpeed = 30;
    cop.cruiseDistance = 350; // stop in formation ahead of the player car
    cop.isPolice = true;
    traffic.vehicles.push(cop);
  }

  police.setWantedLevel(3);

  // One REAL police car in the police system (not just the traffic
  // escort): it chases from behind the player, keeping the player in
  // sight the whole way, which stops the wanted level decaying to 0
  // before the shot (a star decays every 4 s at level 3 when no police
  // unit sees the player, and with no police unit at all the stars went
  // grey). It starts 60 units behind the player, facing the same way,
  // and pulls up a few units behind the parked car.
  const hunter = new Vehicle(scene, city, {
    playEngineSound: () => {},
    stopEngineSound: () => {},
    playSiren: () => {},
  }, 'police', CONFIG.PALETTE.POLICE);
  hunter.position.set(560, 0.5, -10);
  hunter.rotation = -Math.PI / 2; // face west, same as the player car
  hunter.engineOn = true;
  hunter.setSiren(true);
  hunter.setAIInput({ accel: 0.8, brake: 0, steer: 0, handbrake: false, targetSpeed: 34 });
  hunter.isPolice = true;
  police.policeCars.push(hunter);

  // Camera will be set by player.updateInVehicle()
  // Hide start screen for gameplay
  const startScreen = document.getElementById('startScreen');
  if (startScreen) startScreen.remove();
  // Dusk exposure (was 2.0 for the old near-night preset — too hot now)
  if (renderer) renderer.toneMappingExposure = 1.6;
}

function setupShotMission() {
  // Mission gameplay shot. The old spot (320, 120) was inside a building
  // footprint, so the camera sat inside the wall and the frame was one
  // flat brown wall. Now the player stands at the 256/128 main-street
  // intersection facing WEST down the z = 128 street: open road ahead
  // with lit building faces on both sides. (Facing the dropoff waypoint
  // directly cut diagonally across blocks, so a big brown building face
  // filled the frame; the waypoint is still shown on the minimap and in
  // the objective banner.)
  timeOfDay = 0.2; // Very early morning - distinct cool/blue tones
  player.position.set(256, 1, 128);
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = -Math.PI / 2; // Face -X (west, down the street)
  player.targetRotation = -Math.PI / 2;

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

