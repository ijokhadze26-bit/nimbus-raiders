// Active power-ups: timers + effects. shield (8s hex bubble; enemy contact kills the enemy, see horde),
// rapid (8s x2 fire rate, read by weapons via rateMul; glowing guns), magnet (10s; pickups pulls coins and
// tokens from both lanes), freeze (4s; horde stops + ice tint). Re-collecting refreshes the timer.
// Horde contacts ask game.shielded() (this shield or a hero's Sugar Shield) instead of has('shield').
// Emits power:start / power:end { kind, duration } (the HUD timer listens to power:start -> hud.showPower).
import * as THREE from 'three';
import { buildShieldBubble, auraTexture, POWER_STYLE } from '../models/pickups.js';

export const POWER_DURATION = { shield: 8, rapid: 8, magnet: 10, freeze: 4 };
const ORDER = ['shield', 'rapid', 'magnet', 'freeze'];
const PULSE_TIME = 0.7;

export class Powers {
  init(game) {
    this.game = game;
    this.active = new Map(); // kind -> { left, duration }
    this.time = 0;
    this.rateMul = 1;
    this.c = { x: 0, z: 0, r: 0 };
    const scene = game.scene;
    // shield dome
    this.bubble = buildShieldBubble();
    this.bubble.mesh.visible = false;
    scene.add(this.bubble.mesh);
    this.bubbleR = 1.5; this.bubbleRz = 1.5; this.bubbleX = 0; this.bubbleZ = 0; this.bubbleIn = 0;
    // ground aura (magnet: dashed spinning ring; shield: soft ring under the dome)
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const auraMat = (tex, color) => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.magnetRing = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ map: auraTexture(14), color: POWER_STYLE.magnet.color, transparent: true, depthWrite: false, toneMapped: false }));
    this.magnetRing.position.y = 0.04;
    this.magnetRing.renderOrder = 2;
    this.magnetRing.visible = false;
    // power-start pulse ring (expands out from the squad in the power color)
    this.pulse = new THREE.Mesh(flat, auraMat(auraTexture(0), '#ffffff'));
    this.pulse.position.y = 0.05;
    this.pulse.renderOrder = 2;
    this.pulse.visible = false;
    this.pulseT = 9; this.pulseX = 0; this.pulseZ = 0;
    scene.add(this.magnetRing, this.pulse);
    this.gunBase = null;
    game.events.on('enemy:die', (p) => this.onEnemyDie(p));
  }

  reset() {
    for (const [kind, p] of this.active) this.game.events.emit('power:end', { kind, duration: p.duration });
    this.active.clear();
    this.rateMul = 1;
    this.time = 0;
    this.pulseT = 9;
    this.bubbleIn = 0;
    this.applyGunGlow(0);
  }

  has(kind) { return this.active.has(kind); }

  /** Seconds left for a kind (0 when inactive). */
  left(kind) { const p = this.active.get(kind); return p ? p.left : 0; }

  list() {
    const out = [];
    for (const k of ORDER) { const p = this.active.get(k); if (p) out.push({ kind: k, left: Math.round(p.left * 10) / 10 }); }
    return out;
  }

  /** Starts (or refreshes) a power. Returns false for an unknown kind or when no run is active. */
  start(kind, duration) {
    if (!(kind in POWER_DURATION)) return false;
    const run = this.game.run;
    if (!run || !run.active) return false;
    const d = duration ?? POWER_DURATION[kind];
    this.active.set(kind, { left: d, duration: d });
    if (kind === 'rapid') this.rateMul = 2;
    const L = this.game.squad.leader;
    this.pulseT = 0; this.pulseX = L.x; this.pulseZ = L.z + 0.8;
    this.pulse.material.color.set(POWER_STYLE[kind].glow);
    this.game.events.emit('power:start', { kind, duration: d });
    if (kind === 'freeze') this.game.events.emit('fx:shake', { amount: 0.15 });
    return true;
  }

  end(kind) {
    const p = this.active.get(kind);
    if (!p) return;
    this.active.delete(kind);
    if (kind === 'rapid') { this.rateMul = 1; this.applyGunGlow(0); }
    this.game.events.emit('power:end', { kind, duration: p.duration });
  }

  update(dt) {
    this.time += dt;
    if (this.pulseT < PULSE_TIME) this.pulseT += dt;
    if (!this.active.size) return;
    for (const [kind, p] of this.active) {
      p.left -= dt;
      if (p.left <= 0) this.end(kind);
    }
  }

  /** Shield ripple where an enemy pops against the dome. */
  onEnemyDie(p) {
    if (!this.active.has('shield') || !p || !p.pos) return;
    const nx = (p.pos.x - this.bubbleX) / this.bubbleR, nz = (p.pos.z - this.bubbleZ) / this.bubbleRz;
    const d = Math.hypot(nx, nz);
    if (d > 1.6) return;
    const u = this.bubble.uniforms;
    if (u.uHitT.value < 0.35) return;
    u.uHit.value.set(nx / Math.max(0.01, d), 0.25, nz / Math.max(0.01, d)); // local unit-sphere coords
    u.uHitT.value = 0;
  }

  /** Rapid fire: guns (raiders + Pip) glow in their tier color. amount 0..1. */
  applyGunGlow(amount) {
    const sq = this.game.squad;
    if (!sq || !sq.gunMat) return;
    sq.gunMat.emissiveIntensity = (sq.gunGlowBase ?? 0.25) + amount * 1.1; // base follows the Mk (loadout.js)
    const pm = sq.pip && sq.pip.gunMat;
    if (pm) { pm.emissive.copy(pm.color); pm.emissiveIntensity = amount * 0.9; }
  }

  // ---------------- visuals ----------------
  sync(dt) {
    const game = this.game, t = this.time;
    const sq = game.squad, L = sq.leader;
    const c = sq.center(this.c);
    // shield dome: covers the blob and Pip; eases in, blinks during the last 2 s
    const sh = this.active.get('shield');
    this.bubbleIn += ((sh ? 1 : 0) - this.bubbleIn) * Math.min(1, dt * 8);
    const m = this.bubble.mesh;
    if (this.bubbleIn > 0.01) {
      const zf = L.z - 0.9, zb = Math.max(c.z + c.r + 0.35, L.z + 1.2);
      const rx = Math.max(1.4, c.r + 0.5), rz = Math.max(1.2, (zb - zf) / 2);
      const k = Math.min(1, dt * 10);
      this.bubbleX += (c.x - this.bubbleX) * k;
      this.bubbleZ = (zf + zb) / 2;
      this.bubbleR += (rx - this.bubbleR) * k;
      this.bubbleRz = rz;
      const pop = this.bubbleIn < 1 ? 0.55 + this.bubbleIn * 0.45 : 1;
      m.visible = true;
      m.position.set(this.bubbleX, 0, this.bubbleZ);
      m.scale.set(this.bubbleR * pop, Math.min(2.6, 1.35 + this.bubbleR * 0.3) * pop, rz * pop);
      const u = this.bubble.uniforms;
      u.uTime.value = t;
      u.uHitT.value = Math.min(9, u.uHitT.value + dt * 2.2);
      const blink = sh && sh.left < 2 ? (Math.sin(t * 22) > 0 ? 1 : 0.35) : 1;
      u.uAlpha.value = this.bubbleIn * blink;
    } else m.visible = false;
    // magnet aura
    const mg = this.active.get('magnet');
    this.magnetRing.visible = !!mg;
    if (mg) {
      const s = (c.r + 1.4) * 2 * (1 + Math.sin(t * 6) * 0.04);
      this.magnetRing.position.set(c.x, 0.04, (c.z + L.z) / 2);
      this.magnetRing.scale.set(s, 1, s);
      this.magnetRing.rotation.y = t * 2.2;
      this.magnetRing.material.opacity = (mg.left < 2 ? 0.4 + 0.4 * Math.abs(Math.sin(t * 9)) : 0.75);
    }
    // rapid: pulsing gun glow
    const rp = this.active.get('rapid');
    if (rp) this.applyGunGlow(0.75 + 0.25 * Math.sin(t * 18));
    // start pulse
    if (this.pulseT < PULSE_TIME) {
      const f = this.pulseT / PULSE_TIME;
      const s = 1.5 + f * 13;
      this.pulse.visible = true;
      this.pulse.position.set(this.pulseX, 0.05, this.pulseZ);
      this.pulse.scale.set(s, 1, s);
      this.pulse.material.opacity = (1 - f) * 0.9;
    } else this.pulse.visible = false;
  }

  dispose() {}
}
