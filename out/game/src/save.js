// Solmarina - Save/Load System

import { CONFIG } from './config.js';

export class SaveSystem {
  constructor(player, city, missions, police, vehicles, traffic, hud) {
    this.player = player;
    this.city = city;
    this.missions = missions;
    this.police = police;
    this.vehicles = vehicles;
    this.traffic = traffic;
    this.hud = hud;
    
    this.saveKey = CONFIG.SAVE.KEY;
    this.version = CONFIG.SAVE.VERSION;
    this.slots = CONFIG.SAVE.SLOTS;
    this.currentSlot = 0;
  }
  
  save(slot = 0) {
    const data = {
      version: this.version,
      timestamp: Date.now(),
      slot: slot,
      
      // Player
      player: this.player.getState(),
      
      // Missions
      missions: this.missions.getState(),
      
      // Police/Wanted
      police: this.police.getState(),
      
      // Time of day (would be in main)
      timeOfDay: this.timeOfDay || 0,
      
      // Weather (placeholder)
      weather: 'clear',
    };
    
    try {
      const key = `${this.saveKey}_slot${slot}`;
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`Game saved to slot ${slot}`);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }
  
  load(slot = 0) {
    try {
      const key = `${this.saveKey}_slot${slot}`;
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      
      if (!data) {
        console.log(`No save found in slot ${slot}`);
        return false;
      }
      
      if (data.version !== this.version) {
        console.warn(`Save version mismatch: ${data.version} vs ${this.version}`);
        // Could migrate here
      }
      
      this.currentSlot = slot;
      this.applySaveData(data);
      console.log(`Game loaded from slot ${slot}`);
      return true;
    } catch (e) {
      console.error('Load failed:', e);
      return false;
    }
  }
  
  applySaveData(data) {
    // Player
    if (data.player) {
      this.player.setState(data.player);
    }
    
    // Missions
    if (data.missions) {
      this.missions.setState(data.missions);
    }
    
    // Police
    if (data.police) {
      this.police.setState(data.police);
    }
    
    // Time of day
    this.timeOfDay = data.timeOfDay || 0;
    
    // Respawn player if dead
    if (this.player.isDead) {
      const spawn = this.city.getPlayerSpawn();
      this.player.position.copy(spawn);
      this.player.health = this.player.maxHealth;
      this.player.isDead = false;
      this.player.velocity.set(0, 0, 0);
    }
  }
  
  getSaveInfo(slot) {
    try {
      const key = `${this.saveKey}_slot${slot}`;
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      
      if (!data) return null;
      
      return {
        slot: data.slot,
        timestamp: data.timestamp,
        cash: data.missions?.cash || 0,
        completedMissions: data.missions?.completedMissions?.length || 0,
        health: data.player?.health || 0,
        wantedLevel: data.police?.wantedLevel || 0,
        version: data.version,
      };
    } catch (e) {
      return null;
    }
  }
  
  getAllSaves() {
    const saves = [];
    for (let i = 0; i < this.slots; i++) {
      saves.push(this.getSaveInfo(i));
    }
    return saves;
  }
  
  deleteSave(slot) {
    try {
      const key = `${this.saveKey}_slot${slot}`;
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Delete save failed:', e);
      return false;
    }
  }
  
  hasSave(slot) {
    const key = `${this.saveKey}_slot${slot}`;
    return localStorage.getItem(key) !== null;
  }
  
  // Auto-save
  autoSave() {
    this.save(this.currentSlot);
  }
  
  // Export save for debugging
  exportSave(slot = 0) {
    const key = `${this.saveKey}_slot${slot}`;
    return localStorage.getItem(key);
  }
  
  // Import save
  importSave(jsonString, slot = 0) {
    try {
      const data = JSON.parse(jsonString);
      const key = `${this.saveKey}_slot${slot}`;
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Import save failed:', e);
      return false;
    }
  }
}

// Add to window for debugging
window.SaveSystem = SaveSystem;

