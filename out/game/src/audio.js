// Solmarina - WebAudio Synthesis System

import { CONFIG } from './config.js';

let audioContext = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let musicSource = null;
let musicOscillators = [];
let musicGainNodes = [];
let musicPlaying = false;
let musicPattern = 0;
let musicStep = 0;
let musicTimer = 0;
let muted = false;
try { muted = localStorage.getItem('solmarina_muted') === '1'; } catch (e) { /* storage unavailable */ }

export function initAudio() {
  if (audioContext) return audioContext;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioContext.createGain();
  masterGain.gain.value = muted ? 0 : CONFIG.AUDIO.MASTER_VOLUME;
  masterGain.connect(audioContext.destination);

  musicGain = audioContext.createGain();
  musicGain.gain.value = CONFIG.AUDIO.MUSIC_VOLUME;
  musicGain.connect(masterGain);

  sfxGain = audioContext.createGain();
  sfxGain.gain.value = CONFIG.AUDIO.SFX_VOLUME;
  sfxGain.connect(masterGain);

  // Resume on user interaction. These listeners are PERSISTENT (not
  // { once: true }): the context can be suspended again later (autoplay
  // policy, tab hidden/reshown), and a one-shot listener would never
  // resume it a second time, leaving the game silent.
  document.addEventListener('click', resumeAudio);
  document.addEventListener('keydown', resumeAudio);
  document.addEventListener('pointerdown', resumeAudio);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeAudio();
  });

  return audioContext;
}

function resumeAudio() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

export function getAudioContext() {
  if (!audioContext) initAudio();
  return audioContext;
}

export function setMasterVolume(vol) {
  if (masterGain) masterGain.gain.value = muted ? 0 : clamp(vol, 0, 1);
}

// Mute: ramps the master gain to silence (music + SFX) and persists the
// choice, so a muted game stays muted across reloads. Wired to the HUD
// speaker button and the N key (see input.js ACTION.MUTE).
export function setMuted(mute) {
  muted = !!mute;
  try { localStorage.setItem('solmarina_muted', muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime(muted ? 0 : CONFIG.AUDIO.MASTER_VOLUME, audioContext.currentTime, 0.02);
  }
  return muted;
}

export function toggleMute() { return setMuted(!muted); }

export function isMuted() { return muted; }

export function setMusicVolume(vol) {
  if (musicGain) musicGain.gain.value = clamp(vol, 0, 1);
}

export function setSfxVolume(vol) {
  if (sfxGain) sfxGain.gain.value = clamp(vol, 0, 1);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// --- Synthesized Sound Effects ---

export function playEngineSound(vehicle, rpm, speed) {
  if (!audioContext) return;
  
  // Create or update engine oscillator
  if (!vehicle.engineOsc) {
    vehicle.engineOsc = audioContext.createOscillator();
    vehicle.engineGain = audioContext.createGain();
    vehicle.engineFilter = audioContext.createBiquadFilter();
    vehicle.engineFilter.type = 'lowpass';
    vehicle.engineFilter.frequency.value = 400;
    vehicle.engineOsc.type = 'sawtooth';
    vehicle.engineOsc.connect(vehicle.engineFilter);
    vehicle.engineFilter.connect(vehicle.engineGain);
    vehicle.engineGain.connect(sfxGain);
    vehicle.engineGain.gain.value = 0;
    vehicle.engineOsc.start();
  }
  
  const baseFreq = CONFIG.AUDIO.ENGINE_BASE_FREQ;
  const freq = baseFreq * (1 + rpm * 3);
  vehicle.engineOsc.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.05);
  vehicle.engineFilter.frequency.setTargetAtTime(200 + rpm * 800, audioContext.currentTime, 0.05);
  const volume = 0.15 + rpm * 0.35 + speed * 0.002;
  vehicle.engineGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.1);
}

export function stopEngineSound(vehicle) {
  if (vehicle.engineOsc) {
    vehicle.engineGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.2);
    setTimeout(() => {
      if (vehicle.engineOsc) {
        vehicle.engineOsc.stop();
        vehicle.engineOsc.disconnect();
        vehicle.engineFilter.disconnect();
        vehicle.engineGain.disconnect();
        vehicle.engineOsc = null;
      }
    }, 300);
  }
}

export function playSiren(vehicle, active) {
  if (!audioContext) return;
  
  if (active) {
    if (!vehicle.sirenOsc) {
      vehicle.sirenOsc = audioContext.createOscillator();
      vehicle.sirenGain = audioContext.createGain();
      vehicle.sirenLFO = audioContext.createOscillator();
      vehicle.sirenLFOGain = audioContext.createGain();
      vehicle.sirenOsc.type = 'square';
      vehicle.sirenLFO.type = 'square';
      vehicle.sirenLFO.frequency.value = 1.5;
      vehicle.sirenLFO.connect(vehicle.sirenLFOGain);
      vehicle.sirenLFOGain.connect(vehicle.sirenOsc.frequency);
      vehicle.sirenOsc.connect(vehicle.sirenGain);
      vehicle.sirenGain.connect(sfxGain);
      vehicle.sirenGain.gain.value = 0.3;
      vehicle.sirenLFOGain.gain.value = 110;
      vehicle.sirenOsc.frequency.value = CONFIG.AUDIO.SIREN_FREQS[0];
      vehicle.sirenOsc.start();
      vehicle.sirenLFO.start();
    }
  } else if (vehicle.sirenOsc) {
    vehicle.sirenOsc.stop();
    vehicle.sirenLFO.stop();
    vehicle.sirenOsc.disconnect();
    vehicle.sirenLFO.disconnect();
    vehicle.sirenGain.disconnect();
    vehicle.sirenOsc = null;
  }
}

export function playGunshot(position) {
  if (!audioContext) return;
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  osc.type = 'square';
  osc.frequency.value = CONFIG.AUDIO.GUNSHOT_FREQ;
  filter.type = 'highpass';
  filter.frequency.value = 200;
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
  
  osc.start(now);
  osc.stop(now + 0.2);
}

export function playPunch() {
  if (!audioContext) return;
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  osc.type = 'sine';
  osc.frequency.value = CONFIG.AUDIO.PUNCH_FREQ;
  filter.type = 'lowpass';
  filter.frequency.value = 150;
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  osc.start(now);
  osc.stop(now + 0.12);
}

export function playExplosion(position) {
  if (!audioContext) return;
  
  // Noise-based explosion
  const bufferSize = audioContext.sampleRate * 1.5;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 1);
  
  source.start(now);
  source.stop(now + 1.5);
}

export function playCarHorn() {
  if (!audioContext) return;
  
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  osc1.type = 'square';
  osc1.frequency.value = 440;
  osc2.type = 'square';
  osc2.frequency.value = 554; // Major third
  
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.5);
  osc2.stop(now + 0.5);
}

export function playTireScreech(intensity) {
  if (!audioContext || intensity < 0.3) return;
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  osc.type = 'sawtooth';
  osc.frequency.value = 2000 + Math.random() * 1000;
  filter.type = 'highpass';
  filter.frequency.value = 1500;
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(intensity * 0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  
  osc.start(now);
  osc.stop(now + 0.3);
}

export function playPickupSound() {
  if (!audioContext) return;
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 880;
  
  osc.connect(gain);
  gain.connect(sfxGain);
  
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 0.2);
  
  osc.start(now);
  osc.stop(now + 0.2);
}

export function playMissionComplete() {
  if (!audioContext) return;
  
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(musicGain);
    const now = audioContext.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  });
}

export function playWantedLevelChange(level) {
  if (!audioContext) return;
  
  if (level > 0) {
    // Police radio chatter sound
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    osc.type = 'square';
    osc.frequency.value = 300 + level * 50;
    filter.type = 'bandpass';
    filter.frequency.value = osc.frequency.value;
    filter.Q.value = 10;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// --- Procedural Music ---

const MUSIC_SCALES = {
  ambient: [0, 2, 4, 5, 7, 9, 11], // Minor pentatonic-ish
  tension: [0, 1, 3, 5, 6, 8, 10], // Diminished-ish
  action: [0, 2, 3, 5, 7, 8, 10],  // Blues-ish
};

const MUSIC_ROOT = 55; // A1
const MUSIC_TEMPO = 100; // BPM

export function startMusic(mood = 'ambient') {
  if (!audioContext || musicPlaying) return;
  musicPlaying = true;
  musicPattern = mood;
  musicStep = 0;
  musicTimer = 0;
  scheduleMusic();
}

export function stopMusic() {
  musicPlaying = false;
  musicOscillators.forEach(osc => {
    try { osc.stop(); osc.disconnect(); } catch (e) {}
  });
  musicGainNodes.forEach(g => { try { g.disconnect(); } catch (e) {} });
  musicOscillators = [];
  musicGainNodes = [];
}

export function setMusicMood(mood) {
  if (musicPattern !== mood) {
    musicPattern = mood;
    musicStep = 0;
  }
}

// Track a scheduled music source so it leaves the live list when it
// finishes playing. (The old 5s setInterval prune used the removed
// `playbackState` / `FINISHED_STATE` API — both are undefined in modern
// browsers, so `undefined === undefined` was true and it disconnected
// EVERY live music node every 5 seconds, cutting notes off mid-play.)
function trackMusicSource(src) {
  musicOscillators.push(src);
  src.onended = () => {
    const i = musicOscillators.indexOf(src);
    if (i >= 0) musicOscillators.splice(i, 1);
    try { src.disconnect(); } catch (e) {}
  };
  return src;
}

function scheduleMusic() {  if (!musicPlaying || !audioContext) return;
  
  const scale = MUSIC_SCALES[musicPattern] || MUSIC_SCALES.ambient;
  const stepTime = 60 / MUSIC_TEMPO; // seconds per beat
  const lookahead = 0.1;
  const now = audioContext.currentTime;
  
  // Schedule next few steps
  while (musicTimer < now + lookahead) {
    playMusicStep(scale, musicTimer);
    musicTimer += stepTime;
    musicStep = (musicStep + 1) % 16;
  }
  
  setTimeout(scheduleMusic, lookahead * 500);
}

function playMusicStep(scale, time) {
  const bassNote = MUSIC_ROOT * Math.pow(2, scale[0] / 12);
  const chordNotes = [0, 2, 4].map(i => MUSIC_ROOT * Math.pow(2, scale[i] / 12));
  const leadNote = MUSIC_ROOT * 4 * Math.pow(2, scale[(musicStep * 2) % scale.length] / 12);
  
  // Bass - every 4 beats
  if (musicStep % 4 === 0) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = bassNote;
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    osc.start(time);
    osc.stop(time + 1.5);
    trackMusicSource(osc);
    musicGainNodes.push(gain, filter);
  }
  
  // Chord - on beats 1 and 3
  if (musicStep % 2 === 0) {
    chordNotes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      const delay = i * 0.02;
      gain.gain.setValueAtTime(0.03, time + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);
      osc.start(time + delay);
      osc.stop(time + 1.8);
      trackMusicSource(osc);
      musicGainNodes.push(gain, filter);
    });
  }
  
  // Lead melody - occasional
  if (musicPattern === 'action' && Math.random() < 0.3) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = leadNote;
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    gain.gain.setValueAtTime(0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time);
    osc.stop(time + 0.6);
    trackMusicSource(osc);
    musicGainNodes.push(gain, filter);
  }
  
  // Percussion - hi-hat on every beat
  if (musicStep % 1 === 0) {
    playHiHat(time, musicPattern === 'action' ? 0.04 : 0.02);
  }
  // Kick on 1 and 3
  if (musicStep % 2 === 0) {
    playKick(time, musicPattern === 'action' ? 0.08 : 0.04);
  }
  // Snare on 2 and 4
  if (musicStep % 4 === 2) {
    playSnare(time, musicPattern === 'action' ? 0.06 : 0.03);
  }
}

function playKick(time, vol) {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.3);
  osc.connect(gain);
  gain.connect(musicGain);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.start(time);
  osc.stop(time + 0.5);
  trackMusicSource(osc);
  musicGainNodes.push(gain);
}

function playSnare(time, vol) {
  // Noise + tone
  const bufferSize = audioContext.sampleRate * 0.2;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  source.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 800;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  source.start(time);
  source.stop(time + 0.25);
  trackMusicSource(source);
  musicGainNodes.push(gain, filter);
  
  // Tone
  const osc = audioContext.createOscillator();
  const gain2 = audioContext.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 200;
  osc.connect(gain2);
  gain2.connect(musicGain);
  gain2.gain.setValueAtTime(vol * 0.5, time);
  gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.start(time);
  osc.stop(time + 0.2);
  trackMusicSource(osc);
  musicGainNodes.push(gain2);
}

function playHiHat(time, vol) {
  const bufferSize = audioContext.sampleRate * 0.05;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  source.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 4000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  source.start(time);
  source.stop(time + 0.06);
  trackMusicSource(source);
  musicGainNodes.push(gain, filter);
}
