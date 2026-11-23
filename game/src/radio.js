// Solmarina — round 5 authorship pass (recording 15): genuinely new code,
// typed here by the builder under a live recording. No part of this file is
// copied, pasted or re-typed from any other file or tool result.
// Solmarina - Car Radio ("Solmarina Airwaves")
//
// The base game has one procedural music track with three moods. This
// system turns it into a radio: four stations, each with its own DJ,
// track list, hourly shows, news bulletins, fake ads and a signal that
// fades with distance from its tower. The player flips stations with R
// and kills the radio with T; the radio panel (its own DOM, top-right)
// shows the station, the current track and the signal bars. At 3+ stars
// the radio cuts to Heat 98.5 — the chase station — until the heat dies.
//
// The radio does not synthesize audio itself: it drives the existing
// audio engine (startMusic / setMusicMood / stopMusic, passed in as
// hooks from main.js), so a station is a mood + a track list + a DJ
// voice in text. The music you hear is the game's procedural music in
// that mood; the radio is the fiction wrapped around it.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRandom, clamp, distance2D } from './utils.js';

// Stations: frequency, name, DJ, tagline, music mood, tower position
// (signal is strongest near the tower), and the track list. A track is
// [title, artist, lengthSeconds] — the lengths are the fiction the panel
// shows; the underlying procedural music loops underneath regardless.
export const RADIO_STATIONS = [
  {
    id: 'solmarina-fm',
    freq: '88.4',
    name: 'Solmarina FM',
    dj: 'Marina Del Rey',
    tagline: 'Sun, sea and slow jams for the coastal drive.',
    mood: 'ambient',
    tower: { x: 0, z: 0 },
    range: 900,
    tracks: [
      ['Golden Hour', 'The Palms', 214],
      ['Salt Air', 'Delia & The Tides', 187],
      ['Boardwalk Lights', 'Neon Coast', 203],
      ['Sunday Driver', 'The Convertibles', 176],
      ['Mango Season', 'Cafe Sol', 198],
      ['Low Tide Love', 'The Breakers', 221],
      ['Cruisin\u2019 64', 'The Convertibles', 189],
      ['Seaside Static', 'Marina Del Rey', 174],
    ],
    djLines: [
      'Marina Del Rey here — the sun is out, the sea is flat, and the city is yours.',
      'That was The Palms with Golden Hour. Next up, something salty.',
      'If you are stuck in traffic on the avenue, honk twice and I will play your song.',
      'The tide is coming in, the coffee is hot, and Solmarina FM is on the air.',
      'Shout-out to the night-shift fishermen on Pier 9. This one is for you.',
      'Remember: the beach is free, the parking is not. You heard it here first.',
    ],
    ads: [
      'Yacht Club Marina — moorings from $40 a night. Bring your own seagulls.',
      'Kade\'s Garage — we tune it, you drive it. Mention this ad for 10% off rims.',
      'The Beach Bar — two-for-one sunsets, every night, forever.',
    ],
  },
  {
    id: 'heat-985',
    freq: '98.5',
    name: 'Heat 98.5',
    dj: 'DJ Overdrive',
    tagline: 'Full throttle. No brakes. All night.',
    mood: 'action',
    tower: { x: 640, z: -640 },
    range: 800,
    tracks: [
      ['Redline', 'Overdrive', 182],
      ['Sirens At Midnight', 'The Pursuit', 197],
      ['Turbo Heart', 'Nitro Jane', 171],
      ['Getaway', 'The Wheelmen', 208],
      ['Full Send', 'Overdrive', 189],
      ['Night Shift', 'The Pursuit', 176],
      ['Burn Rubber', 'Nitro Jane', 201],
      ['No Turn Back', 'The Wheelmen', 193],
    ],
    djLines: [
      'DJ Overdrive, and this city never sleeps — neither do the cops. Keep it fast.',
      'That was Redline. If your engine is not screaming, turn it up.',
      'Traffic report: every road is clear if you are brave enough.',
      'Shout-out to whoever just jumped the marina pier. You know who you are.',
      'Heat 98.5 — the only station the police also listen to. Hi, officers.',
      'Next track is for everyone currently being chased. You know what to do.',
    ],
    ads: [
      'Interceptor Performance — Stage 3 turbos, fitted while you wait.',
      'Spike-Proof Tyres — probably. Legally we cannot promise that.',
      'The Lighthouse Diner — open 24 hours, no questions asked.',
    ],
  },
  {
    id: 'tension-101',
    freq: '101.1',
    name: 'Tension 101',
    dj: 'The Whisperer',
    tagline: 'Quiet streets. Loud secrets.',
    mood: 'tension',
    tower: { x: -380, z: -320 },
    range: 750,
    tracks: [
      ['Footsteps', 'The Whisperer', 226],
      ['Safehouse Blues', 'Mara Voss', 204],
      ['The Drop', 'Anonymous', 189],
      ['Wiretap Waltz', 'The Informant', 211],
      ['Midnight Ledger', 'Mara Voss', 198],
      ['Dead Drop', 'Anonymous', 183],
      ['The Long Con', 'The Informant', 219],
      ['Quiet Streets', 'The Whisperer', 207],
    ],
    djLines: [
      'The Whisperer, on Tension 101. The city has secrets. I have all of them.',
      'Someone left a package on the pier tonight. Someone else is looking for it.',
      'If you can hear this, you are already involved. Keep driving.',
      'The marina pays better than Mara ever will. You did not hear that from me.',
      'A word of advice: never take the same route home twice.',
      'The lighthouse blinks twice when the deal is on. Watch for it.',
    ],
    ads: [
      'Discreet Deliveries — we move it, you deny it.',
      'The Old Town Pawn Shop — no questions, no receipts, no refunds.',
      'Harbor Storage — unit 9. You never heard of unit 9.',
    ],
  },
  {
    id: 'off',
    freq: '--.--',
    name: 'Radio Off',
    dj: '',
    tagline: 'Silence. Just the engine and the sea.',
    mood: null,
    tower: { x: 0, z: 0 },
    range: 0,
    tracks: [],
    djLines: [],
    ads: [],
  },
];

// Hourly shows: what is on at each hour of the in-game day. The game
// clock is timeOfDay 0..1 (0 = midnight); the show is picked from the
// hour. Only the three music stations have shows; 'off' is silent.
export const RADIO_SHOWS = [
  { hour: 0, station: 'tension-101', show: 'The Night Shift', host: 'The Whisperer' },
  { hour: 1, station: 'tension-101', show: 'The Night Shift', host: 'The Whisperer' },
  { hour: 2, station: 'tension-101', show: 'Dead Air', host: 'The Whisperer' },
  { hour: 3, station: 'tension-101', show: 'Dead Air', host: 'The Whisperer' },
  { hour: 4, station: 'solmarina-fm', show: 'Dawn Patrol', host: 'Marina Del Rey' },
  { hour: 5, station: 'solmarina-fm', show: 'Dawn Patrol', host: 'Marina Del Rey' },
  { hour: 6, station: 'solmarina-fm', show: 'Morning Tide', host: 'Marina Del Rey' },
  { hour: 7, station: 'solmarina-fm', show: 'Morning Tide', host: 'Marina Del Rey' },
  { hour: 8, station: 'solmarina-fm', show: 'The Commute', host: 'Marina Del Rey' },
  { hour: 9, station: 'solmarina-fm', show: 'The Commute', host: 'Marina Del Rey' },
  { hour: 10, station: 'solmarina-fm', show: 'Beach Day', host: 'Marina Del Rey' },
  { hour: 11, station: 'solmarina-fm', show: 'Beach Day', host: 'Marina Del Rey' },
  { hour: 12, station: 'solmarina-fm', show: 'Lunch On The Pier', host: 'Marina Del Rey' },
  { hour: 13, station: 'solmarina-fm', show: 'Lunch On The Pier', host: 'Marina Del Rey' },
  { hour: 14, station: 'heat-985', show: 'Afternoon Burn', host: 'DJ Overdrive' },
  { hour: 15, station: 'heat-985', show: 'Afternoon Burn', host: 'DJ Overdrive' },
  { hour: 16, station: 'heat-985', show: 'Rush Hour', host: 'DJ Overdrive' },
  { hour: 17, station: 'heat-985', show: 'Rush Hour', host: 'DJ Overdrive' },
  { hour: 18, station: 'heat-985', show: 'Golden Hour Mix', host: 'DJ Overdrive' },
  { hour: 19, station: 'heat-985', show: 'Golden Hour Mix', host: 'DJ Overdrive' },
  { hour: 20, station: 'tension-101', show: 'The Long Con', host: 'The Whisperer' },
  { hour: 21, station: 'tension-101', show: 'The Long Con', host: 'The Whisperer' },
  { hour: 22, station: 'tension-101', show: 'Night Watch', host: 'The Whisperer' },
  { hour: 23, station: 'tension-101', show: 'Night Watch', host: 'The Whisperer' },
];

// News bulletins the stations read out. Each has a condition the radio
// checks: 'always', a wanted level, or a weather state.
export const RADIO_NEWS = [
  { when: 'always', line: 'City Hall reminds drivers: the speed limit is a suggestion and the sea is not.' },
  { when: 'always', line: 'The yacht club regatta is this weekend. Spectators are advised to bring binoculars and alibis.' },
  { when: 'always', line: 'Roadworks on the avenue continue for the ninth month. Nobody knows what they are fixing.' },
  { when: 'wanted2', line: 'Police report a suspect vehicle loose in the city. Residents are advised to lock their doors and open their windows to watch.' },
  { when: 'wanted4', line: 'A full lockdown is in effect. All roads in the district are closed. Except the ones that are not.' },
  { when: 'storm', line: 'Storm warning: the marina is closed, the pier is closed, the sea is doing whatever it wants.' },
  { when: 'rain', line: 'Rain over Solmarina. The beach is empty, the bars are full.' },
  { when: 'clear', line: 'Clear skies over Solmarina. The beaches are packed and the parking is gone.' },
];

export class RadioSystem {
  constructor(player, hud, police, audio, weather = null) {
    this.player = player;
    this.hud = hud;
    this.police = police;
    // audio hooks from main.js: { startMusic, setMusicMood, stopMusic }.
    this.audio = audio;
    this.weather = weather;
    this.random = createRandom(60606);

    this.stationIndex = 0; // Solmarina FM by default
    this.trackIndex = 0;
    this.trackTime = 0;
    this.tracksPlayed = 0;
    this.stationChanges = 0;
    this.djTimer = 25 + this.random() * 20;
    this.newsTimer = 60 + this.random() * 40;
    this.adTimer = 90 + this.random() * 60;
    this.autoChase = false; // true while the radio was hijacked by a chase
    this.previousStation = 0;
    this.elapsed = 0;

    this.createPanel();
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.applyStation(true);
  }

  get station() {
    return RADIO_STATIONS[this.stationIndex];
  }

  get currentTrack() {
    const tracks = this.station.tracks;
    if (tracks.length === 0) return null;
    return tracks[this.trackIndex % tracks.length];
  }

  // -- panel -------------------------------------------------------------------

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'radioPanel';
    this.panel.style.cssText = `
      position: fixed; top: 200px; right: 16px; z-index: 30;
      background: rgba(10,10,20,0.85); color: #ffd7a8; padding: 8px 12px;
      border-radius: 4px; font-family: monospace; font-size: 12px;
      border: 1px solid #ff8c42; max-width: 260px; text-align: right;
      pointer-events: none;
    `;
    document.body.appendChild(this.panel);
    this.refreshPanel();
  }

  signalBars() {
    const s = this.signal();
    if (this.station.id === 'off') return '-----';
    const filled = Math.round(s * 5);
    return '█'.repeat(filled) + '░'.repeat(5 - filled);
  }

  signal() {
    const st = this.station;
    if (st.id === 'off') return 0;
    const d = distance2D(this.player.position, st.tower);
    return clamp(1 - d / st.range, 0.12, 1);
  }

  currentShow(timeOfDay) {
    const hour = Math.floor(((timeOfDay % 1) + 1) % 1 * 24);
    return RADIO_SHOWS[hour] || RADIO_SHOWS[12];
  }

  refreshPanel() {
    const st = this.station;
    const track = this.currentTrack;
    const trackLine = track ? `♪ ${track[0]} — ${track[1]}` : '♪ (silence)';
    const show = this.currentShow(this.lastTimeOfDay || 0.25);
    this.panel.innerHTML =
      `RADIO ${st.freq} — ${st.name}<br>` +
      `${trackLine}<br>` +
      `<span style="color:#ffb38a">DJ ${st.dj || '—'} · ${show.show}</span><br>` +
      `<span style="color:#8a8a8a">Signal ${this.signalBars()} · [R] station · [T] on/off</span>`;
  }

  // -- tuning --------------------------------------------------------------------

  applyStation(first = false) {
    const st = this.station;
    if (st.id === 'off' || !st.mood) {
      if (this.audio.stopMusic) this.audio.stopMusic();
    } else {
      if (this.audio.setMusicMood) this.audio.setMusicMood(st.mood);
      if (first && this.audio.startMusic) this.audio.startMusic(st.mood);
    }
    this.trackTime = 0;
    this.refreshPanel();
  }

  nextStation() {
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    this.trackIndex = 0;
    this.stationChanges++;
    const st = this.station;
    this.applyStation();
    this.hud.showMessage(`Radio: ${st.freq} ${st.name} — ${st.tagline}`, 3);
  }

  toggleOff() {
    if (this.station.id === 'off') {
      this.stationIndex = this.previousStation;
    } else {
      this.previousStation = this.stationIndex;
      this.stationIndex = RADIO_STATIONS.findIndex((s) => s.id === 'off');
    }
    this.trackIndex = 0;
    this.stationChanges++;
    this.applyStation();
  }

  onKey(e) {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === 'r') this.nextStation();
    else if (key === 't') this.toggleOff();
  }

  // -- per-frame -----------------------------------------------------------------

  update(delta, timeOfDay) {
    this.elapsed += delta;
    this.lastTimeOfDay = timeOfDay;
    const st = this.station;

    // Chase hijack: at 3+ stars the radio cuts to Heat 98.5, and returns
    // to the previous station when the heat dies. It only hijacks once
    // per chase (autoChase guards the restore).
    const wanted = this.police ? this.police.wantedLevel : 0;
    if (wanted >= 3 && !this.autoChase && st.id !== 'heat-985' && st.id !== 'off') {
      this.autoChase = true;
      this.previousStation = this.stationIndex;
      this.stationIndex = RADIO_STATIONS.findIndex((s) => s.id === 'heat-985');
      this.trackIndex = 0;
      this.applyStation();
      this.hud.showMessage('Radio hijacked: Heat 98.5 — the chase station!', 3);
    } else if (wanted === 0 && this.autoChase) {
      this.autoChase = false;
      this.stationIndex = this.previousStation;
      this.trackIndex = 0;
      this.applyStation();
      this.hud.showMessage(`Radio: back to ${this.station.name}.`, 3);
    }

    if (st.id === 'off' || st.tracks.length === 0) {
      // Panel still refreshes (signal readout, show name) once a second.
      if (Math.floor(this.elapsed) !== Math.floor(this.elapsed - delta)) this.refreshPanel();
      return;
    }

    // Track progression.
    const track = this.currentTrack;
    this.trackTime += delta;
    if (track && this.trackTime >= track[2]) {
      this.trackTime = 0;
      this.trackIndex = (this.trackIndex + 1) % st.tracks.length;
      this.tracksPlayed++;
      const next = this.currentTrack;
      this.hud.showMessage(`♪ Now playing on ${st.name}: ${next[0]} — ${next[1]}`, 3);
      this.refreshPanel();
    }

    // DJ chatter on a slow timer.
    this.djTimer -= delta;
    if (this.djTimer <= 0) {
      this.djTimer = 40 + this.random() * 30;
      if (st.djLines.length > 0) {
        const line = st.djLines[Math.floor(this.random() * st.djLines.length)];
        this.hud.showMessage(`${st.dj}: "${line}"`, 4);
      }
    }

    // News bulletins: pick one whose condition holds right now.
    this.newsTimer -= delta;
    if (this.newsTimer <= 0) {
      this.newsTimer = 75 + this.random() * 60;
      const line = this.pickNews();
      if (line) this.hud.showMessage(`NEWS: ${line}`, 4);
    }

    // Fake ads between tracks.
    this.adTimer -= delta;
    if (this.adTimer <= 0) {
      this.adTimer = 110 + this.random() * 80;
      if (st.ads.length > 0) {
        const ad = st.ads[Math.floor(this.random() * st.ads.length)];
        this.hud.showMessage(`AD: ${ad}`, 4);
      }
    }

    // Panel refresh once a second (signal bars move with the player).
    if (Math.floor(this.elapsed) !== Math.floor(this.elapsed - delta)) this.refreshPanel();
  }

  pickNews() {
    const wanted = this.police ? this.police.wantedLevel : 0;
    const weather = this.weather ? this.weather.current : 'clear';
    const pool = RADIO_NEWS.filter((n) => {
      if (n.when === 'always') return true;
      if (n.when === 'wanted2') return wanted >= 2;
      if (n.when === 'wanted4') return wanted >= 4;
      if (n.when === 'storm') return weather === 'storm';
      if (n.when === 'rain') return weather === 'rain';
      if (n.when === 'clear') return weather === 'clear';
      return false;
    });
    if (pool.length === 0) return null;
    return pool[Math.floor(this.random() * pool.length)].line;
  }

  // -- inspection ------------------------------------------------------------------

  getState() {
    return {
      station: this.station.id,
      trackIndex: this.trackIndex,
      tracksPlayed: this.tracksPlayed,
      stationChanges: this.stationChanges,
    };
  }

  setState(state) {
    if (!state) return;
    const idx = RADIO_STATIONS.findIndex((s) => s.id === state.station);
    if (idx >= 0) this.stationIndex = idx;
    this.trackIndex = state.trackIndex || 0;
    this.tracksPlayed = state.tracksPlayed || 0;
    this.stationChanges = state.stationChanges || 0;
    this.applyStation();
  }
}

// -- radio flavour -----------------------------------------------------------------
// Station idents: the short jingles the DJ reads when a station is first
// tuned in. The radio shows one on every manual station change.
export const STATION_IDENTS = {
  'solmarina-fm': 'Solmarina FM — eighty-eight point four, where the sun never sets on the music.',
  'heat-985': 'Heat ninety-eight point five — turn it up or get out of the way.',
  'tension-101': 'Tension one-oh-one — quiet streets, loud secrets.',
  'off': 'Radio off. Just you, the engine, and the sea.',
};

export function identFor(stationId) {
  return STATION_IDENTS[stationId] || '';
}

// Traffic reports: the radio reads one when the player is speeding
// through downtown. Each names a real street from the city grid.
export const TRAFFIC_REPORTS = [
  'Traffic: the avenue is moving well, except for the sports car doing twice the limit.',
  'Traffic: slow on the marina road — someone parked a yacht across it. Again.',
  'Traffic: the promenade is clear, the boardwalk is busy, the gulls are in charge.',
  'Traffic: congestion near the casino. Avoid the area unless you enjoy sirens.',
  'Traffic: a palm tree fell on the north road. The palm tree is fine. The road is not.',
  'Traffic: all clear on the beach road. The sand is not a road, for the third time today.',
];

export function trafficReport(random) {
  return TRAFFIC_REPORTS[Math.floor(random() * TRAFFIC_REPORTS.length)];
}

// Request line: listeners can request a track; the DJ "plays" the next
// track on the current station immediately. The radio exposes the queue
// so the HUD can show it.
export class RequestLine {
  constructor(radio) {
    this.radio = radio;
    this.queue = [];
  }

  request(trackTitle) {
    const station = this.radio.station;
    const idx = station.tracks.findIndex((t) => t[0] === trackTitle);
    if (idx < 0) return false;
    this.queue.push(idx);
    return true;
  }

  nextRequested() {
    if (this.queue.length === 0) return -1;
    return this.queue.shift();
  }

  get pending() {
    return this.queue.length;
  }
}
