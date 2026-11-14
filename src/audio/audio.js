// Audio system: AudioContext unlock on the first gesture, master -> (music, sfx) buses with gentle
// compression + a safety limiter, persisted mute states, visibility suspend, and install(game)
// which wires the event bus to sfx + music (see bindings.js).
//
// Public API (UI): audio.setMusic(on), audio.setSfx(on), audio.isMusic(), audio.isSfx(),
// audio.play(name, opts) e.g. play('click'), play('star', { index: 1 }), play('purchase').
import { Sfx } from './sfx.js';
import { Music } from './music.js';
import { bindAudio } from './bindings.js';

const KEY = 'nimbusRaiders.audio';
export const MUSIC_VOLUME = 0.5;
export const SFX_VOLUME = 0.9;
const SAVE_HOOKS = ['markDirty', 'dirty', 'touch', 'queue', 'schedule', 'commit', 'persist', 'save'];

/** Builds the bus graph on any (Offline)AudioContext. */
export function buildGraph(ctx) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.12;
  const comp = ctx.createDynamicsCompressor(); // gentle glue on everything
  comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 2.5;
  comp.attack.value = 0.006; comp.release.value = 0.25;
  const master = ctx.createGain(); master.gain.value = 0.85;
  const sfxComp = ctx.createDynamicsCompressor(); // tames dense sfx before they hit the mix
  sfxComp.threshold.value = -16; sfxComp.knee.value = 12; sfxComp.ratio.value = 3;
  sfxComp.attack.value = 0.003; sfxComp.release.value = 0.18;
  const sfx = ctx.createGain(); sfx.gain.value = SFX_VOLUME;
  const music = ctx.createGain(); music.gain.value = MUSIC_VOLUME;
  sfx.connect(sfxComp); sfxComp.connect(master);
  music.connect(master);
  master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);
  return { master, sfx, music, comp, limiter };
}

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.sfxEngine = null;
    this.music = null;
    this.game = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.hiddenSuspend = false;
    this.offs = [];
    this.onGesture = this.onGesture.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.loadSettings();
  }

  // ---------------- lifecycle ----------------
  install(game) {
    this.game = game;
    game.audio = this;
    this.loadSettings();
    const opts = { capture: true, passive: true };
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown']) window.addEventListener(ev, this.onGesture, opts);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);
    window.addEventListener('pageshow', this.onVisibility);
    const ev = game.events;
    this.offs.push(ev.on('settings:changed', (p) => this.applySettings(p && p.settings)));
    this.offs.push(ev.on('save:changed', (p) => { const s = p && p.save && (p.save.settings || (p.save.data && p.save.data.settings)); if (s) this.applySettings(s); }));
    this.offs.push(...bindAudio(this, game));
    return this;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown']) window.removeEventListener(ev, this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.music) this.music.dispose();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  /** True once the context exists and is running (sounds can be heard). */
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  onGesture() {
    if (this.ctx && this.ctx.state === 'running') return;
    this.unlock();
  }

  /** Create/resume the AudioContext. Must run inside a user gesture on mobile. */
  unlock() {
    try {
      if (!this.ctx && !this.create()) return false;
      const ctx = this.ctx;
      if (ctx.state !== 'running' && !document.hidden && (this.musicOn || this.sfxOn)) {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (!this.primed) { // iOS: a silent buffer started inside the gesture fully unlocks output
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
        this.primed = true;
      }
      return true;
    } catch (e) {
      console.warn('[audio] unlock failed', e);
      return false;
    }
  }

  create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      // iOS 16.4+: mix with the player's own music and respect the silent switch
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch { /* unsupported */ }
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return false; } }
    this.ctx = ctx;
    this.graph = buildGraph(ctx);
    this.sfxEngine = new Sfx(ctx, this.graph.sfx);
    this.music = new Music(ctx, this.graph.music);
    this.applyGains(true);
    this.music.setEnabled(this.musicOn);
    ctx.onstatechange = () => { if (ctx.state === 'running') this.onRunning(); };
    if (ctx.state === 'running') this.onRunning();
    return true;
  }

  onRunning() {
    if (!this.music) return;
    this.music.start();
    if (this.onReady) this.onReady();
  }

  onVisibility(e) {
    const ctx = this.ctx;
    if (!ctx) return;
    const hidden = document.hidden || (e && e.type === 'pagehide');
    if (hidden) {
      if (ctx.state === 'running') { this.hiddenSuspend = true; ctx.suspend().catch(() => {}); }
    } else if (this.hiddenSuspend || ctx.state !== 'running') {
      this.hiddenSuspend = false;
      if (this.musicOn || this.sfxOn) ctx.resume().catch(() => {});
    }
  }

  // ---------------- mute + persistence ----------------
  loadSettings() {
    const s = this.game && this.game.save && this.game.save.data && this.game.save.data.settings;
    if (s) { this.musicOn = s.music !== false; this.sfxOn = s.sfx !== false; return; }
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j) { this.musicOn = j.music !== false; this.sfxOn = j.sfx !== false; }
    } catch { /* private mode / bad json */ }
  }

  persist() {
    const save = this.game && this.game.save;
    const s = save && save.data && save.data.settings;
    if (s) {
      if (s.music === this.musicOn && s.sfx === this.sfxOn) return;
      s.music = this.musicOn; s.sfx = this.sfxOn;
      const hook = SAVE_HOOKS.find((k) => typeof save[k] === 'function');
      if (hook) { try { save[hook](); } catch { /* ignore */ } }
      this.applying = true;
      try { this.game.events.emit('settings:changed', { settings: s }); } finally { this.applying = false; }
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify({ music: this.musicOn, sfx: this.sfxOn })); } catch { /* ignore */ }
  }

  applySettings(s) {
    if (!s || this.applying) return;
    if (typeof s.music === 'boolean') this.setMusic(s.music, false);
    if (typeof s.sfx === 'boolean') this.setSfx(s.sfx, false);
  }

  setMusic(on, save = true) {
    on = !!on;
    const changed = on !== this.musicOn;
    this.musicOn = on;
    if (this.music) this.music.setEnabled(on);
    this.applyGains();
    if (save) this.persist();
    return changed;
  }

  setSfx(on, save = true) {
    on = !!on;
    const changed = on !== this.sfxOn;
    this.sfxOn = on;
    if (!on && this.sfxEngine) this.sfxEngine.stopAllLoops();
    this.applyGains();
    if (save) this.persist();
    return changed;
  }

  isMusic() { return this.musicOn; }
  isSfx() { return this.sfxOn; }
  toggleMusic() { this.setMusic(!this.musicOn); return this.musicOn; }
  toggleSfx() { this.setSfx(!this.sfxOn); return this.sfxOn; }

  applyGains(instant = false) {
    if (!this.graph) return;
    const t = this.ctx.currentTime;
    const set = (param, v) => { param.cancelScheduledValues(t); if (instant) param.setValueAtTime(v, t); else param.setTargetAtTime(v, t, 0.06); };
    set(this.graph.music.gain, this.musicOn ? MUSIC_VOLUME : 0);
    set(this.graph.sfx.gain, this.sfxOn ? SFX_VOLUME : 0);
    // both off: let the device sleep its audio hardware
    if (!this.musicOn && !this.sfxOn) { if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
    else if (this.ctx.state === 'suspended' && this.primed && !document.hidden) this.ctx.resume().catch(() => {});
  }

  // ---------------- playback ----------------
  /** Play a named sound effect (UI: 'click', 'hover', 'back', 'star' {index}, 'purchase', 'deny', 'daily'). */
  play(name, opts) {
    if (!this.sfxOn || !this.ready) return false;
    return !!this.sfxEngine.play(name, opts || EMPTY);
  }

  /** Internal sfx entry used by the bindings (same as play, kept separate for clarity). */
  fx(name, opts) {
    if (!this.sfxOn || !this.ready) return false;
    return this.sfxEngine.play(name, opts || EMPTY);
  }

  /** Small status snapshot for tests. */
  status() {
    return {
      ctx: this.ctx ? this.ctx.state : 'none',
      music: this.musicOn, sfx: this.sfxOn,
      track: this.music && this.music.current ? this.music.current.name : null,
      players: this.music ? this.music.players.length : 0,
      voices: this.sfxEngine ? this.sfxEngine.liveCount() : 0,
      stats: this.sfxEngine ? { ...this.sfxEngine.stats } : null,
    };
  }
}

const EMPTY = Object.freeze({});

export function createAudio() { return new AudioSystem(); }
