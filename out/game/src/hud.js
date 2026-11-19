// Solmarina - HUD System

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { formatCash, formatTime } from './utils.js';
import { toggleMute, isMuted } from './audio.js';

export class HUD {
  constructor(player, city, police, missions, vehicles, audio, isGameplayShot = false) {
    this.player = player;
    this.city = city;
    this.police = police;
    this.missions = missions;
    this.vehicles = vehicles;
    this.audio = audio;

    // State
    this.waypoint = null;
    this.objectiveText = '';
    this.messageText = '';
    this.messageTimer = 0;
    this.timerValue = 0;
    this.showTimer = false;

    // Create DOM elements
    this.createElements();

    // Minimap canvas
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = CONFIG.HUD.MINIMAP_SIZE;
    this.minimapCanvas.height = CONFIG.HUD.MINIMAP_SIZE;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapContainer.appendChild(this.minimapCanvas);

    // Start screen (skip for gameplay shots)
    if (!isGameplayShot) {
      this.createStartScreen();
    }

    // Pause overlay
    this.createPauseOverlay();

    // Save indicator
    this.saveIndicator = document.createElement('div');
    this.saveIndicator.id = 'saveIndicator';
    this.saveIndicator.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: rgba(0,0,0,0.7); color: #22cc44;
      padding: 8px 16px; border-radius: 4px; font-family: monospace;
      font-size: 14px; display: none; z-index: 50;
    `;
    this.saveIndicator.textContent = 'Game Saved';
    document.body.appendChild(this.saveIndicator);

    // Hide loading screen
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  }
  
  createElements() {
    // Main HUD container
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 10;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #e8dcc8; text-shadow: 0 0 4px #000;
    `;
    document.body.appendChild(this.container);
    
    // Top-left: Wanted stars
    this.wantedStars = document.createElement('div');
    this.wantedStars.id = 'wantedStars';
    this.wantedStars.style.cssText = `
      position: absolute; top: 16px; left: 16px; display: flex; gap: 4px;
    `;
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.className = 'wanted-star';
      star.dataset.index = i;
      star.innerHTML = '★';
      star.style.cssText = 'font-size: 24px; color: #444; transition: color 0.2s;';
      this.wantedStars.appendChild(star);
    }
    this.container.appendChild(this.wantedStars);
    
    // Top-center: Mission objective
    this.objective = document.createElement('div');
    this.objective.id = 'objective';
    this.objective.style.cssText = `
      position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); padding: 8px 16px; border-radius: 4px;
      font-size: 14px; max-width: 600px; text-align: center;
      border: 1px solid #334; display: none;
    `;
    this.container.appendChild(this.objective);
    
    // Top-right: Timer (for survive missions)
    this.timer = document.createElement('div');
    this.timer.id = 'timer';
    this.timer.style.cssText = `
      position: absolute; top: 16px; right: 16px;
      background: rgba(0,0,0,0.8); padding: 8px 16px; border-radius: 4px;
      font-size: 24px; font-family: monospace; font-weight: bold;
      border: 1px solid #334; display: none;
    `;
    this.container.appendChild(this.timer);

    // Top-right: Mute toggle (below the timer). The HUD container has
    // pointer-events: none, so the button re-enables them for itself.
    this.muteButton = document.createElement('button');
    this.muteButton.id = 'muteButton';
    this.muteButton.title = 'Mute / unmute audio (N)';
    this.muteButton.style.cssText = `
      position: absolute; top: 64px; right: 16px; pointer-events: auto;
      background: rgba(0,0,0,0.8); color: #e8dcc8; border: 1px solid #334;
      border-radius: 4px; padding: 6px 10px; font-size: 16px; cursor: pointer;
    `;
    this.muteButton.addEventListener('click', () => {
      toggleMute();
      this.setMuteButton();
    });
    this.setMuteButton();
    this.container.appendChild(this.muteButton);

    // Bottom-left: Health & Armor
    this.healthContainer = document.createElement('div');
    this.healthContainer.style.cssText = `
      position: absolute; bottom: 16px; left: 16px; display: flex; flex-direction: column; gap: 6px;
    `;
    
    // Health bar
    this.healthBar = this.createStatBar('HEALTH', '#22cc44', '#1a3a1a');
    this.healthContainer.appendChild(this.healthBar.container);
    
    // Armor bar
    this.armorBar = this.createStatBar('ARMOR', '#2288cc', '#1a2a3a');
    this.armorContainer = this.armorBar.container;
    this.armorContainer.style.display = 'none';
    this.healthContainer.appendChild(this.armorContainer);
    
    this.container.appendChild(this.healthContainer);
    
    // Bottom-right: Cash & Ammo
    this.statsContainer = document.createElement('div');
    this.statsContainer.style.cssText = `
      position: absolute; bottom: 16px; right: 16px; text-align: right;
    `;
    
    this.cashDisplay = document.createElement('div');
    this.cashDisplay.style.cssText = 'font-size: 20px; font-weight: bold; color: #e8c56a; margin-bottom: 4px;';
    this.statsContainer.appendChild(this.cashDisplay);
    
    this.ammoDisplay = document.createElement('div');
    this.ammoDisplay.style.cssText = 'font-size: 16px; color: #aaa; font-family: monospace;';
    this.statsContainer.appendChild(this.ammoDisplay);
    
    this.container.appendChild(this.statsContainer);
    
    // Bottom-center: Vehicle speed (when in vehicle)
    this.speedDisplay = document.createElement('div');
    this.speedDisplay.id = 'speedDisplay';
    this.speedDisplay.style.cssText = `
      position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); padding: 6px 16px; border-radius: 4px;
      font-size: 18px; font-family: monospace; display: none;
    `;
    this.container.appendChild(this.speedDisplay);
    
    // Message display
    this.messageDisplay = document.createElement('div');
    this.messageDisplay.id = 'messageDisplay';
    this.messageDisplay.style.cssText = `
      position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.9); padding: 12px 24px; border-radius: 6px;
      font-size: 16px; text-align: center; max-width: 80%;
      border: 1px solid #445; display: none; animation: fadeIn 0.3s;
    `;
    this.container.appendChild(this.messageDisplay);
    
    // Minimap container
    this.minimapContainer = document.createElement('div');
    this.minimapContainer.style.cssText = `
      position: absolute; bottom: 16px; left: 200px; 
      background: rgba(0,0,0,0.7); border-radius: 4px; padding: 4px;
      border: 1px solid #334;
    `;
    this.container.appendChild(this.minimapContainer);
    
    // Weapon icon
    this.weaponDisplay = document.createElement('div');
    this.weaponDisplay.style.cssText = `
      position: absolute; bottom: 16px; right: 200px; text-align: right;
      font-size: 14px; color: #888;
    `;
    this.weaponDisplay.textContent = 'PISTOL';
    this.container.appendChild(this.weaponDisplay);
    
    // Add keyframe for message animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      .wanted-star.active { color: #ff3333 !important; animation: pulse 0.5s infinite; }
      .wanted-star.fading { color: #ffaa00 !important; }
    `;
    document.head.appendChild(style);
  }
  
  createStatBar(label, color, bgColor) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; gap: 8px; min-width: 180px;';
    
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; min-width: 50px;';
    labelEl.textContent = label;
    
    const barBg = document.createElement('div');
    barBg.style.cssText = `flex: 1; height: 16px; background: ${bgColor}; border-radius: 8px; overflow: hidden; border: 1px solid #334;`;
    
    const barFill = document.createElement('div');
    barFill.style.cssText = `height: 100%; width: 100%; background: ${color}; border-radius: 6px; transition: width 0.3s, background 0.3s;`;
    
    barBg.appendChild(barFill);
    container.appendChild(labelEl);
    container.appendChild(barBg);
    
    return { container, fill: barFill, label: labelEl };
  }
  
  createStartScreen() {
    this.startScreen = document.createElement('div');
    this.startScreen.id = 'startScreen';
    this.startScreen.style.cssText = `
      position: fixed; inset: 0; background: linear-gradient(180deg, #0a0e14 0%, #1a2a3a 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #e8dcc8; font-family: 'Segoe UI', system-ui, sans-serif; z-index: 100;
    `;
    
    this.startScreen.innerHTML = `
      <h1 style="font-size: 72px; font-weight: 900; letter-spacing: 0.1em; margin: 0 0 16px; background: linear-gradient(90deg, #e8c56a, #ff6b35, #e8c56a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-size: 200% 100%; animation: shimmer 3s linear infinite;">SOLMARINA</h1>
      <p style="font-size: 18px; color: #88a; margin-bottom: 48px;">A sun-soaked coastal city of crime and opportunity</p>
      <div style="display: flex; flex-direction: column; gap: 16px; min-width: 280px;">
        <button id="btnNewGame" class="menu-btn">NEW GAME</button>
        <button id="btnContinue" class="menu-btn" style="display: none;">CONTINUE</button>
        <button id="btnSettings" class="menu-btn">SETTINGS</button>
        <button id="btnCredits" class="menu-btn">CREDITS</button>
      </div>
      <p style="margin-top: 48px; font-size: 12px; color: #556;">WASD Move • Shift Run • Space Jump • Mouse Aim • Click Shoot • E Enter Vehicle • M Map • Esc Pause</p>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      .menu-btn { padding: 14px 32px; font-size: 16px; font-weight: 600; letter-spacing: 0.05em; background: rgba(255,255,255,0.05); border: 1px solid #334; color: #e8dcc8; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
      .menu-btn:hover { background: rgba(232,197,106,0.2); border-color: #e8c56a; }
      .menu-btn:focus { outline: 2px solid #e8c56a; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(this.startScreen);
    
    // Event listeners
    document.getElementById('btnNewGame').addEventListener('click', () => this.startNewGame());
    document.getElementById('btnContinue').addEventListener('click', () => this.continueGame());
    document.getElementById('btnSettings').addEventListener('click', () => this.showSettings());
    document.getElementById('btnCredits').addEventListener('click', () => this.showCredits());
  }
  
  createPauseOverlay() {
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.id = 'pauseOverlay';
    this.pauseOverlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.85);
      display: none; flex-direction: column; align-items: center; justify-content: center;
      color: #e8dcc8; font-family: 'Segoe UI', system-ui, sans-serif; z-index: 200;
    `;
    this.pauseOverlay.innerHTML = `
      <h2 style="font-size: 48px; margin: 0 0 32px;">PAUSED</h2>
      <div style="display: flex; flex-direction: column; gap: 16px; min-width: 240px;">
        <button id="btnResume" class="menu-btn">RESUME</button>
        <button id="btnSave" class="menu-btn">SAVE GAME</button>
        <button id="btnLoad" class="menu-btn">LOAD GAME</button>
        <button id="btnSettingsPause" class="menu-btn">SETTINGS</button>
        <button id="btnMainMenu" class="menu-btn">MAIN MENU</button>
      </div>
    `;
    document.body.appendChild(this.pauseOverlay);
    
    document.getElementById('btnResume').addEventListener('click', () => this.togglePause());
    document.getElementById('btnSave').addEventListener('click', () => this.saveGame());
    document.getElementById('btnLoad').addEventListener('click', () => this.loadGame());
    document.getElementById('btnSettingsPause').addEventListener('click', () => this.showSettings());
    document.getElementById('btnMainMenu').addEventListener('click', () => this.returnToMainMenu());
  }
  
  startNewGame() {
    if (this.startScreen) this.startScreen.style.display = 'none';
    this.player.cash = 0;
    this.missions.cash = 0;
    this.missions.completedMissions = [];
    for (const m of this.missions.missions) m.completed = false;
    this.police.setWantedLevel(0);
    this.showMessage('Welcome to Solmarina. Find Mara at the marina.', 5);
  }
  
  continueGame() {
    if (this.startScreen) this.startScreen.style.display = 'none';
    this.loadGame();
  }
  
  showSettings() {
    alert('Settings: Not implemented in this build');
  }
  
  showCredits() {
    alert('Solmarina - Built for make.fun gta6-01 competition\nOriginal city, characters, vehicles, story, art, sound & music\nNo Rockstar Games content');
  }
  
  setMuteButton() {
    if (!this.muteButton) return;
    this.muteButton.textContent = isMuted() ? '🔇 Muted' : '🔊 Sound';
  }

  togglePause() {
    const paused = this.pauseOverlay.style.display === 'flex';
    this.pauseOverlay.style.display = paused ? 'none' : 'flex';
    document.body.style.cursor = paused ? 'none' : 'default';
    // Notify main loop
    window.dispatchEvent(new CustomEvent('gamepause', { detail: { paused: !paused } }));
  }
  
  saveGame() {
    // Trigger save event
    window.dispatchEvent(new CustomEvent('gamesave'));
    this.showSaveIndicator();
  }
  
  loadGame() {
    window.dispatchEvent(new CustomEvent('gameload'));
    this.showMessage('Game loaded', 2);
  }
  
  returnToMainMenu() {
    this.pauseOverlay.style.display = 'none';
    if (this.startScreen) this.startScreen.style.display = 'flex';
    const btnContinue = document.getElementById('btnContinue'); if (btnContinue) btnContinue.style.display = 'block';
    // Reset game state
    window.dispatchEvent(new CustomEvent('gamereset'));
  }
  
  showSaveIndicator() {
    this.saveIndicator.style.display = 'block';
    setTimeout(() => { this.saveIndicator.style.display = 'none'; }, 2000);
  }
  
  update(delta) {
    // Update message timer
    if (this.messageTimer > 0) {
      this.messageTimer -= delta;
      if (this.messageTimer <= 0) {
        this.messageDisplay.style.display = 'none';
      }
    }
    
    // Update timer display
    if (this.showTimer) {
      this.timer.textContent = formatTime(this.timerValue);
    }
    
    // Update health
    const healthPct = this.player.health / this.player.maxHealth;
    this.healthBar.fill.style.width = (healthPct * 100) + '%';
    if (healthPct > 0.6) this.healthBar.fill.style.background = '#22cc44';
    else if (healthPct > 0.3) this.healthBar.fill.style.background = '#ddaa00';
    else this.healthBar.fill.style.background = '#cc2222';
    
    // Update armor
    if (this.player.armor > 0) {
      this.armorContainer.style.display = 'flex';
      const armorPct = this.player.armor / 100;
      this.armorBar.fill.style.width = (armorPct * 100) + '%';
    } else {
      this.armorContainer.style.display = 'none';
    }
    
    // Update cash
    this.cashDisplay.textContent = formatCash(this.player.cash);
    
    // Update ammo
    if (this.player.isAiming && !this.player.inVehicle) {
      this.ammoDisplay.textContent = `AMMO: ${this.player.ammo} / ${this.player.maxAmmo}`;
    } else {
      this.ammoDisplay.textContent = '';
    }
    
    // Update wanted stars
    const stars = this.police.getWantedLevel();
    const starElements = this.wantedStars.querySelectorAll('.wanted-star');
    starElements.forEach((star, i) => {
      if (i < stars) {
        star.classList.add('active');
        star.classList.remove('fading');
      } else if (this.police.wantedDecayTimer > 0 && i === stars) {
        star.classList.add('fading');
        star.classList.remove('active');
      } else {
        star.classList.remove('active', 'fading');
      }
    });
    
    // Update speedometer
    if (this.player.inVehicle && this.player.vehicle) {
      const speedKmh = Math.round(Math.abs(this.player.vehicle.speed) * 3.6);
      this.speedDisplay.textContent = `${speedKmh} KM/H`;
      this.speedDisplay.style.display = 'block';
    } else {
      this.speedDisplay.style.display = 'none';
    }
    
    // Update minimap
    this.renderMinimap();
  }
  
  renderMinimap() {
    const ctx = this.minimapCtx;
    const size = CONFIG.HUD.MINIMAP_SIZE;
    const range = CONFIG.HUD.MINIMAP_RANGE;
    const center = size / 2;
    const playerPos = this.player.position;
    
    // Clear
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, size, size);
    
    // Draw streets
    ctx.strokeStyle = '#2a3a2a';
    ctx.lineWidth = 2;
    for (const street of this.city.streets) {
      if (street.width) {
        const x1 = center + (street.x1 - playerPos.x) * (size / 2 / range);
        const z1 = center + (street.z1 - playerPos.z) * (size / 2 / range);
        const x2 = center + (street.x2 - playerPos.x) * (size / 2 / range);
        const z2 = center + (street.z2 - playerPos.z) * (size / 2 / range);
        
        // Only draw if visible
        if (this.isOnScreen(x1, z1, size) || this.isOnScreen(x2, z2, size)) {
          ctx.beginPath();
          ctx.moveTo(x1, z1);
          ctx.lineTo(x2, z2);
          ctx.stroke();
        }
      }
    }
    
    // Draw buildings (simplified)
    ctx.fillStyle = '#1a2a1a';
    for (const building of this.city.buildings) {
      const bx = center + (building.position.x - playerPos.x) * (size / 2 / range);
      const bz = center + (building.position.z - playerPos.z) * (size / 2 / range);
      const bw = building.userData.bw * (size / 2 / range);
      const bd = building.userData.bd * (size / 2 / range);
      
      if (this.isRectOnScreen(bx, bz, bw, bd, size)) {
        ctx.fillRect(bx - bw/2, bz - bd/2, bw, bd);
      }
    }
    
    // Draw mission marker
    if (this.waypoint) {
      const mx = center + (this.waypoint.x - playerPos.x) * (size / 2 / range);
      const mz = center + (this.waypoint.z - playerPos.z) * (size / 2 / range);
      if (this.isOnScreen(mx, mz, size)) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(mx, mz, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw police
    ctx.fillStyle = '#ff4444';
    for (const cop of this.police.policeCars) {
      const px = center + (cop.position.x - playerPos.x) * (size / 2 / range);
      const pz = center + (cop.position.z - playerPos.z) * (size / 2 / range);
      if (this.isOnScreen(px, pz, size)) {
        ctx.fillRect(px - 2, pz - 2, 4, 4);
      }
    }
    
    // Draw traffic vehicles
    ctx.fillStyle = '#88aaff';
    for (const vehicle of this.vehicles) {
      if (vehicle === this.player.vehicle) continue;
      const vx = center + (vehicle.position.x - playerPos.x) * (size / 2 / range);
      const vz = center + (vehicle.position.z - playerPos.z) * (size / 2 / range);
      if (this.isOnScreen(vx, vz, size)) {
        ctx.fillRect(vx - 1.5, vz - 1.5, 3, 3);
      }
    }
    
    // Draw pedestrians
    ctx.fillStyle = '#88cc88';
    for (const ped of this.traffic?.pedestrians || []) {
      const px = center + (ped.position.x - playerPos.x) * (size / 2 / range);
      const pz = center + (ped.position.z - playerPos.z) * (size / 2 / range);
      if (this.isOnScreen(px, pz, size)) {
        ctx.fillRect(px - 1, pz - 1, 2, 2);
      }
    }
    
    // Draw player
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(center, center, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Player direction indicator
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    const forward = new THREE.Vector3(Math.sin(this.player.mesh.rotation.y), 0, Math.cos(this.player.mesh.rotation.y));
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + forward.x * 12, center + forward.z * 12);
    ctx.stroke();
    
    // Border
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
  }
  
  isOnScreen(x, y, size) {
    return x >= -10 && x <= size + 10 && y >= -10 && y <= size + 10;
  }
  
  isRectOnScreen(x, y, w, h, size) {
    return x + w/2 >= -10 && x - w/2 <= size + 10 && y + h/2 >= -10 && y - h/2 <= size + 10;
  }
  
  setObjective(text) {
    this.objectiveText = text;
    if (text) {
      this.objective.textContent = text;
      this.objective.style.display = 'block';
    } else {
      this.objective.style.display = 'none';
    }
  }
  
  setWaypoint(position) {
    this.waypoint = position;
  }
  
  showMessage(text, duration = 3) {
    this.messageText = text;
    this.messageTimer = duration;
    this.messageDisplay.textContent = text;
    this.messageDisplay.style.display = 'block';
  }
  
  showTimer(seconds) {
    this.timerValue = seconds;
    this.showTimer = seconds > 0;
    this.timer.style.display = this.showTimer ? 'block' : 'none';
  }
  
  getState() {
    return {
      cash: this.player.cash,
      objective: this.objectiveText,
      waypoint: this.waypoint ? { x: this.waypoint.x, z: this.waypoint.z } : null,
    };
  }
}

