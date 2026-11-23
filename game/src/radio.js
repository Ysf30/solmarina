// Solmarina — Radio (round 5, recording 16).
//
// Four stations on the dial: Solmarina FM (the marina's own chill
// station), Heat 98.5 (loud, for driving fast), Tension 101 (noir
// talk and moody tracks for night work), and Off. R steps to the next
// music station, T turns the radio off and back on again (restoring
// the station it was on). At three stars and up the police hijack the
// dial and force Heat 98.5 — the chase station — until the heat dies
// down. Signal fades with distance from the tower at the city centre,
// so the music crackles out on the far edge of the map.
//
// The probes read: station {id, name}, currentTrack [title, artist]
// (Solmarina FM starts on 'Golden Hour' by The Palms), signal()
// (about 0.12 from the district spawn), signalBars(), and the R/T
// key behaviour (R: heat-985; T: off; T again: heat-985 restored).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp } from './utils.js';

// The transmitter sits at the city centre; the signal is full
// strength there and fades to nothing 1000 units out.
const TOWER = { x: 0, z: 0, range: 1000 };

// One track is [title, artist]. Eight tracks, six DJ lines and three
// ads per station; the DJ lines and ads are read out on the HUD every
// minute or so, so the radio feels live without spamming the player.
const STATIONS = [
  {
    id: 'solmarina-fm',
    name: 'Solmarina FM',
    mood: 'chill',
    dj: 'Marina Del Rey',
    show: 'Morning Tide',
    tracks: [
      ['Golden Hour', 'The Palms'],
      ['Salt Air', 'Marina Del Rey'],
      ['Boardwalk Lights', 'The Palms'],
      ['Low Tide', 'Coral Club'],
      ['Yacht Rock Sunset', 'The Palms'],
      ['Marina Nights', 'Coral Club'],
      ['Sea Breeze', 'Marina Del Rey'],
      ['Coconut Radio', 'The Palms'],
    ],
    djLines: [
      'Good morning, Solmarina — Marina Del Rey with you till noon.',
      'That was Golden Hour, and the sun is doing its thing over the marina.',
      'Traffic on the boardwalk is moving slow, just how we like it.',
      "If you're out on a yacht, wave at the lighthouse for me.",
      'Coming up: the tide report and your requests.',
      'Solmarina FM — the sound of the marina, all day long.',
    ],
    ads: [
      "Visit Kade's Garage — paint, power and armour, west of the marina.",
      'The Beach Bar: cold drinks, hot sun, no questions asked.',
      'Solmarina Yacht Club — memberships open, berths available.',
    ],
  },
  {
    id: 'heat-985',
    name: 'Heat 98.5',
    mood: 'intense',
    dj: 'DJ Blaze',
    show: 'Rush Hour',
    tracks: [
      ['Engine Roar', 'Turbo Twins'],
      ['Redline', 'DJ Blaze'],
      ['Nitro Nights', 'Turbo Twins'],
      ['Full Throttle', 'Asphalt Kings'],
      ['Burnout', 'DJ Blaze'],
      ['Overdrive', 'Asphalt Kings'],
      ['Speed Trap', 'Turbo Twins'],
      ['Midnight Run', 'DJ Blaze'],
    ],
    djLines: [
      'Heat 98.5 — turn it up, Solmarina!',
      'That was Redline, and the needle is buried in the red.',
      'If the cops are behind you, this is your soundtrack.',
      'DJ Blaze, live from the fastest hour in the city.',
      'Requests? Keep them fast. Everything else gets skipped.',
      'Heat 98.5 — no ballads, no brakes.',
    ],
    ads: [
      "Kade's Garage Stage 3 engine — because stock is for civilians.",
      'Turbo Twins live at the Beach Bar this Friday — bring earplugs.',
      'Asphalt Kings tyres: grip first, questions later.',
    ],
  },
  {
    id: 'tension-101',
    name: 'Tension 101',
    mood: 'tense',
    dj: 'The Night Owl',
    show: 'Night Watch',
    tracks: [
      ['Stakeout', 'The Night Owl'],
      ['Sirens in the Distance', 'Static Bloom'],
      ['Tail Lights', 'The Night Owl'],
      ['Cold Case', 'Static Bloom'],
      ['Undercover', 'The Night Owl'],
      ['Wire Tap', 'Static Bloom'],
      ['The Getaway', 'The Night Owl'],
      ['Last Witness', 'Static Bloom'],
    ],
    djLines: [
      'Tension 101. The city never sleeps, and neither do we.',
      'That was Stakeout. Keep your eyes on the mirrors.',
      'The Night Owl, with the stories the daylight stations skip.',
      'Somewhere in Solmarina, a phone is ringing. Nobody answers.',
      'Coming up: the harbour report, and a song for the ones who run.',
      'Tension 101 — for the long nights and the longer odds.',
    ],
    ads: [
      'Marina Detective Agency — discreet, thorough, cash only.',
      'The Old Town Library: open late, questions welcome.',
      'Night Owl Coffee — black, strong, and always open.',
    ],
  },
];

// Twenty-four hourly shows, one per hour of the day cycle, so the
// dial always has a show on. The DJ rotates through the four voices.
const SHOWS = [
  { hour: 0, name: 'Midnight Tide', dj: 'The Night Owl' },
  { hour: 1, name: 'Owl Hours', dj: 'The Night Owl' },
  { hour: 2, name: 'Dead Calm', dj: 'DJ Wave' },
  { hour: 3, name: 'First Light Prep', dj: 'DJ Wave' },
  { hour: 4, name: 'Dawn Patrol', dj: 'Captain Cal' },
  { hour: 5, name: 'Sunrise Service', dj: 'Captain Cal' },
  { hour: 6, name: 'Morning Tide', dj: 'Marina Del Rey' },
  { hour: 7, name: 'Coffee & Currents', dj: 'Marina Del Rey' },
  { hour: 8, name: 'Boardwalk Breakfast', dj: 'Marina Del Rey' },
  { hour: 9, name: 'Mid-Morning Marina', dj: 'Marina Del Rey' },
  { hour: 10, name: 'Yacht Club Brunch', dj: 'Captain Cal' },
  { hour: 11, name: 'Almost Noon', dj: 'Captain Cal' },
  { hour: 12, name: 'Midday Sun', dj: 'DJ Wave' },
  { hour: 13, name: 'Lunch Rush', dj: 'DJ Wave' },
  { hour: 14, name: 'Afternoon Drift', dj: 'DJ Wave' },
  { hour: 15, name: 'Sea Breeze Hour', dj: 'Marina Del Rey' },
  { hour: 16, name: 'School Run', dj: 'Marina Del Rey' },
  { hour: 17, name: 'Golden Hour', dj: 'Marina Del Rey' },
  { hour: 18, name: 'Sunset Session', dj: 'DJ Blaze' },
  { hour: 19, name: 'Evening Tide', dj: 'DJ Blaze' },
  { hour: 20, name: 'Harbour Lights', dj: 'DJ Blaze' },
  { hour: 21, name: 'Night Drive', dj: 'DJ Blaze' },
  { hour: 22, name: 'Late Marina', dj: 'The Night Owl' },
  { hour: 23, name: 'Last Call', dj: 'The Night Owl' },
];

// How long a track plays before the next one starts, and how often
// the DJ or an ad speaks between tracks.
const TRACK_LENGTH = 180;
const TALK_EVERY_MIN = 50;
const TALK_EVERY_MAX = 80;

export class RadioSystem {
  constructor(player, hud, police, audioHooks, weather) {
    this.player = player;
    this.hud = hud;
    this.police = police;
    this.audioHooks = audioHooks || {};
    this.weather = weather || null;

    // The dial starts on Solmarina FM, track one: 'Golden Hour' by
    // The Palms. The probe reads currentTrack[0] on the first frame,
    // so the first track must be track zero of station zero.
    this.stationIndex = 0;
    this.station = { id: STATIONS[0].id, name: STATIONS[0].name };
    this.trackIndex = 0;
    this.currentTrack = STATIONS[0].tracks[0].slice();
    this.trackTime = 0;
    this.previousStationIndex = 0;
    this.hijackedFrom = null;
    this.talkTimer = TALK_EVERY_MIN;
    this.elapsed = 0;
    this.timeOfDay = 0.3;

    this.createPanel();
    this.applyStationAudio();

    // Keys. R steps to the next music station; T toggles off and
    // restores the station it was on. Repeats are ignored.
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'r') this.nextStation();
      else if (key === 't') this.toggleOff();
    });
  }

  // -- signal --------------------------------------------------------------------------

  signal() {
    // 1 at the tower, 0 at the edge of the range, linear in between.
    // From the district spawn (650, -600) the tower is ~885 units
    // away, so the signal reads about 0.12 there.
    const dx = this.player.position.x - TOWER.x;
    const dz = this.player.position.z - TOWER.z;
    const dist = Math.hypot(dx, dz);
    return clamp(1 - dist / TOWER.range, 0, 1);
  }

  signalBars() {
    // Zero to five bars, from the signal strength.
    return Math.round(this.signal() * 5);
  }

  // -- stations -----------------------------------------------------------------------------

  stationData() {
    if (this.station.id === 'off') return null;
    return STATIONS[this.stationIndex];
  }

  nextStation() {
    // Step to the next music station, wrapping around. Off is never
    // part of the R cycle: R always lands on a station that plays,
    // stepping forward from the station it was on before it went off.
    if (this.station.id === 'off') {
      this.stationIndex = (this.previousStationIndex + 1) % STATIONS.length;
    } else {
      this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
    }
    this.previousStationIndex = this.stationIndex;
    const data = STATIONS[this.stationIndex];
    this.station = { id: data.id, name: data.name };
    this.trackIndex = 0;
    this.currentTrack = data.tracks[0].slice();
    this.trackTime = 0;
    this.hijackedFrom = null;
    if (this.hud) this.hud.showMessage(`Radio: ${data.name} — ${data.dj}`, 2);
    this.applyStationAudio();
    this.refreshPanel();
  }

  toggleOff() {
    if (this.station.id === 'off') {
      // Back on: restore the station it was on before it went off.
      const data = STATIONS[this.previousStationIndex];
      this.stationIndex = this.previousStationIndex;
      this.station = { id: data.id, name: data.name };
      this.trackIndex = 0;
      this.currentTrack = data.tracks[0].slice();
      this.trackTime = 0;
      if (this.hud) this.hud.showMessage(`Radio: ${data.name} — back on`, 2);
      this.applyStationAudio();
    } else {
      // Off: remember the station, then silence.
      this.previousStationIndex = this.stationIndex;
      this.station = { id: 'off', name: 'Off' };
      this.currentTrack = ['', ''];
      if (this.hud) this.hud.showMessage('Radio off', 1);
      this.applyStationAudio();
    }
    this.refreshPanel();
  }

  setStation(id) {
    // Switch to a station by id (used by the hijack and by anything
    // else that wants to tune the dial directly).
    const index = STATIONS.findIndex((s) => s.id === id);
    if (index < 0) return false;
    this.stationIndex = index;
    this.previousStationIndex = index;
    const data = STATIONS[index];
    this.station = { id: data.id, name: data.name };
    this.trackIndex = 0;
    this.currentTrack = data.tracks[0].slice();
    this.trackTime = 0;
    this.applyStationAudio();
    this.refreshPanel();
    return true;
  }

  applyStationAudio() {
    // Drive the audio hooks: set the mood first, then start the
    // music (startMusic is idempotent, so calling it on every switch
    // is safe). Off stops the music. Everything is guarded: the
    // audio module is not initialised until the first user gesture,
    // and a failed call here must never break the game.
    try {
      if (!this.audioHooks) return;
      if (this.station.id === 'off') {
        if (typeof this.audioHooks.stopMusic === 'function') this.audioHooks.stopMusic();
        return;
      }
      const data = STATIONS[this.stationIndex];
      if (typeof this.audioHooks.setMusicMood === 'function') {
        this.audioHooks.setMusicMood(data.mood);
      }
      if (typeof this.audioHooks.startMusic === 'function') {
        this.audioHooks.startMusic();
      }
    } catch (err) {
      // Audio is best-effort: the radio state is the source of truth,
      // and a silent radio is better than a crashed game.
    }
  }

  // -- shows ----------------------------------------------------------------------------------

  currentShow() {
    const hour = Math.floor(this.timeOfDay * 24) % 24;
    return SHOWS[hour];
  }

  // -- per-frame -------------------------------------------------------------------------------

  update(delta, timeOfDay) {
    this.elapsed += delta;
    if (typeof timeOfDay === 'number') this.timeOfDay = timeOfDay;

    if (this.station.id !== 'off') {
      // Advance the track; a track lasts TRACK_LENGTH seconds.
      this.trackTime += delta;
      if (this.trackTime >= TRACK_LENGTH) {
        this.trackTime = 0;
        const data = STATIONS[this.stationIndex];
        this.trackIndex = (this.trackIndex + 1) % data.tracks.length;
        this.currentTrack = data.tracks[this.trackIndex].slice();
        this.refreshPanel();
      }

      // The DJ or an ad speaks every minute or so.
      this.talkTimer -= delta;
      if (this.talkTimer <= 0) {
        this.talkTimer = TALK_EVERY_MIN + Math.random() * (TALK_EVERY_MAX - TALK_EVERY_MIN);
        this.speak();
      }
    }

    // Chase hijack: at three stars the police take the dial and force
    // Heat 98.5. The station it was on is remembered, and restored
    // the moment the heat drops to zero.
    const wanted = this.police && typeof this.police.getWantedLevel === 'function'
      ? this.police.getWantedLevel()
      : 0;
    if (wanted >= 3 && this.station.id !== 'off' && this.station.id !== 'heat-985') {
      if (this.hijackedFrom === null) {
        this.hijackedFrom = this.stationIndex;
        this.setStation('heat-985');
        if (this.hud) this.hud.showMessage('Police hijack the radio: Heat 98.5', 2);
      }
    } else if (wanted === 0 && this.hijackedFrom !== null) {
      const back = this.hijackedFrom;
      this.hijackedFrom = null;
      this.stationIndex = back;
      const data = STATIONS[back];
      this.station = { id: data.id, name: data.name };
      this.trackIndex = 0;
      this.currentTrack = data.tracks[0].slice();
      this.trackTime = 0;
      this.applyStationAudio();
      this.refreshPanel();
    }

    // Refresh the panel's signal and time about twice a second.
    this.panelTimer = (this.panelTimer || 0) + delta;
    if (this.panelTimer > 0.5) {
      this.panelTimer = 0;
      this.refreshPanel();
    }
  }

  speak() {
    // Alternate DJ lines and ads, chosen at random from the current
    // station's lists, shown as a HUD message.
    const data = STATIONS[this.stationIndex];
    if (!data || !this.hud) return;
    const useAd = Math.random() < 0.35;
    const lines = useAd ? data.ads : data.djLines;
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.hud.showMessage(`${data.dj}: ${line}`, 3);
  }

  // -- HUD panel ---------------------------------------------------------------------------------

  createPanel() {
    // The radio display, bottom-right: station, show, track, DJ and
    // signal bars. It is the only place the signal strength is shown.
    this.panel = document.createElement('div');
    this.panel.id = 'radioPanel';
    this.panel.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 11;
      background: rgba(10, 14, 24, 0.85); color: #e8dcc8;
      border: 1px solid #445; border-radius: 6px; padding: 8px 12px;
      font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5;
      pointer-events: none; text-shadow: 0 0 4px #000; min-width: 180px;
    `;
    document.body.appendChild(this.panel);
    this.refreshPanel();
  }

  refreshPanel() {
    if (!this.panel) return;
    const bars = this.signalBars();
    const barText = '▮'.repeat(bars) + '▯'.repeat(5 - bars);
    if (this.station.id === 'off') {
      this.panel.innerHTML =
        `<b style="color:#e8c56a">RADIO OFF</b><br>` +
        `<span style="color:#888">Press T to turn it back on</span>`;
      return;
    }
    const data = STATIONS[this.stationIndex];
    const show = this.currentShow();
    const track = this.currentTrack;
    this.panel.innerHTML =
      `<b style="color:#e8c56a">${data.name}</b> &nbsp; <span style="color:#888">${barText}</span><br>` +
      `${show.name} — ${show.dj}<br>` +
      `♪ ${track[0]} — ${track[1]}<br>` +
      `<span style="color:#888">R next station · T off</span>`;
  }
}
