// Squad: count, leader (Pip or another hero, see leader.js), phyllotaxis formation of instanced Raiders, pop-in,
// removal with death pops. Logic (update) is render-free so debug.simulate() is fast; sync() writes instance
// matrices once per frame. Update 2: every member loss first asks game.heroes.absorb(reason) (Guard points,
// Sugar Shield); the sideways ease is MOVE.ease x the hero's Speed.
import * as THREE from 'three';
import { FORMATION, MEMBER_CLAMP, MOVE } from '../config.js';
import { buildRaiderGeometry, buildRaiderLowGeometry, buildRaiderGunGeometry, buildRaiderShadowGeometry, RAIDER_MUZZLE } from '../models/raider.js';
import { buildHeroGunGeometry } from '../models/weapons/guns.js';
import { toonMaterial, toonGradient } from '../models/materials.js';
import { markInstances } from '../core/pool.js';
import { Leader, popScale } from './leader.js';

const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const _tmpSlot = { tx: 0, tz: 0 };
const C = FORMATION.spacing * 0.525;     // phyllotaxis scale for ~spacing neighbor distance
const MAX_DYING = 64;
export const SHADOW_LAYER = 1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// unit slot offsets (precomputed)
const SLOT_X = new Float32Array(FORMATION.maxRendered);
const SLOT_Z = new Float32Array(FORMATION.maxRendered);
for (let i = 0; i < FORMATION.maxRendered; i++) {
  const r = C * Math.sqrt(i + 0.5), a = i * GA;
  SLOT_X[i] = Math.cos(a) * r;
  SLOT_Z[i] = Math.sin(a) * r;
}

export class Squad {
  init(game) {
    this.game = game;
    this.count = 1;
    this.leader = { x: 0, z: 0, vx: 0 };
    this.members = [];   // rendered raiders (excludes Pip), slot = index
    this.dying = [];
    this.free = [];
    this.time = 0;
    this.speed = 0;
    this.cheer = 0;
    this.runBlend = 1;

    this.pip = null;
    this.leaderRig = new Leader(this);
    this.leaderRig.setHero('pip', 'classic');
    // gap falls: Pip tumbles into the hole (pipFall); while pipGone the next raider leads invisibly and
    // steps up as Pip (pop-in) once the leader is back over solid road
    this.pipGone = false;
    this.pipPop = 1;
    this.pipFall = { on: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };

    const cap = FORMATION.maxRendered + MAX_DYING;
    this.lod = 'high';
    this.raiderMat = toonMaterial();
    this.raiderGeo = { high: buildRaiderGeometry(), low: null };
    this.raiderLook = { key: 'pip:classic', colors: undefined, tell: null };
    this.raiders = new THREE.InstancedMesh(this.raiderGeo.high, this.raiderMat, cap);
    this.raiders.castShadow = false;
    this.raiders.frustumCulled = false;
    this.raiders.count = 0;
    this.gunMat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, color: '#ffd34d', emissive: '#ffd34d', emissiveIntensity: 0.25 });
    this.guns = new THREE.InstancedMesh(buildRaiderGunGeometry(), this.gunMat, cap);
    this.guns.instanceMatrix = this.raiders.instanceMatrix;
    this.guns.castShadow = false;
    this.guns.frustumCulled = false;
    this.guns.count = 0;
    // Shadow-only proxy on layer SHADOW_LAYER (the main camera never renders it).
    this.shadowProxy = new THREE.InstancedMesh(buildRaiderShadowGeometry(), new THREE.MeshBasicMaterial(), cap);
    this.shadowProxy.instanceMatrix = this.raiders.instanceMatrix;
    this.shadowProxy.castShadow = true;
    this.shadowProxy.frustumCulled = false;
    this.shadowProxy.count = 0;
    this.shadowProxy.layers.set(SHADOW_LAYER);
    game.scene.add(this.raiders, this.guns, this.shadowProxy);
    this.gunGlowBase = 0.25;
    this.setGunColor('#ffd34d');
  }

  /** Low quality swaps every Raider to the ~110-triangle body (purely visual; formation unchanged). */
  setLod(q) {
    if (q === 'low' && !this.raiderGeo.low) this.raiderGeo.low = buildRaiderLowGeometry(this.raiderLook.colors, this.raiderLook.tell);
    this.raiders.geometry = q === 'low' ? this.raiderGeo.low : this.raiderGeo.high;
    this.lod = q === 'low' ? 'low' : 'high';
    // the leader rig follows the LOD (visual only; nothing in the simulation reads the rig)
    if (this.leaderRig?.key && !this.leaderRig.key.endsWith(':' + this.lod)) this.game.loadout?.applyLook();
    this.guns.geometry = buildRaiderGunGeometry(this.gunWeapon || 'thunderclap', this.gunMk || 1, this.lod);
  }

  setGunColor(hex) {
    this.gunMat.color.set(hex);
    this.gunMat.emissive.set(hex);
    this.pip.gunMat.color.set(hex);
  }

  /** Swaps the gun of all raiders + the leader to the weapon + Mk model (cached geometries). */
  setGun(weaponId, mk) {
    this.gunWeapon = weaponId; this.gunMk = mk;
    this.guns.geometry = buildRaiderGunGeometry(weaponId, mk, this.lod);
    this.leaderRig.setGunGeometry(buildHeroGunGeometry(weaponId, mk));
  }

  /**
   * Raider bodies: palette (models/raider.js colour keys; undefined = the shipped look) + hero tell. One
   * geometry swap (run start / loadout change), no new draw call.
   */
  setRaiderLook(key, colors, tell = null) {
    if (key === this.raiderLook.key) return;
    this.raiderLook = { key, colors, tell };
    const geo = this.raiderGeo, useLow = this.raiders.geometry === geo.low;
    geo.high.dispose(); if (geo.low) geo.low.dispose();
    geo.high = buildRaiderGeometry(colors, tell);
    geo.low = geo.low ? buildRaiderLowGeometry(colors, tell) : null;
    this.raiders.geometry = useLow && geo.low ? geo.low : geo.high;
  }

  reset(count = 1, x = 0) {
    this.leader.x = x; this.leader.z = 0; this.leader.vx = 0;
    this.time = 0; this.cheer = 0;
    this.pipGone = false; this.pipPop = 1; this.pipFall.on = false;
    this.pip.root.rotation.set(0, 0, 0);
    this.pip.root.scale.setScalar(this.pipScale);
    for (const m of this.members) this.free.push(m);
    for (const d of this.dying) this.free.push(d);
    this.members.length = 0;
    this.dying.length = 0;
    this.count = 0;
    this.setCount(Math.max(1, count), 'start', true);
    for (let i = 0; i < this.members.length; i++) { const m = this.members[i]; this.slotTarget(m, i); m.x = m.tx; m.z = m.tz; m.pop = 1; }
  }

  get rendered() { return 1 + this.members.length; }

  alloc() {
    return this.free.length ? this.free.pop() : { x: 0, z: 0, tx: 0, tz: 0, pop: 0, ph: 0, t: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, kind: 0 };
  }

  /** Sets the total count (gate/barrel results). Emits squad:change. */
  setCount(n, reason = 'gate', force = false) {
    n = Math.max(0, Math.min(FORMATION.cap, Math.round(n)));
    const delta = n - this.count;
    if (delta === 0 && !force) return 0;
    this.count = n;
    this.syncMembers(reason);
    this.game.events.emit('squad:change', { count: this.count, delta, reason, pos: this.leaderPos() });
    if (this.count === 0) this.game.onSquadEmpty(reason);
    return delta;
  }

  add(n, reason = 'gate') { return this.setCount(this.count + n, reason); }
  /** Removes n members; each loss first asks the hero to absorb it (Guard, Sugar Shield). */
  remove(n, reason = 'horde') {
    const H = this.game.heroes;
    let k = n;
    if (H) { k = 0; for (let i = 0; i < n; i++) if (!H.absorb(reason)) k++; }
    return k > 0 ? this.setCount(this.count - k, reason) : 0;
  }

  /** Kills one specific rendered member (index into members) — e.g. enemy contact. */
  killMember(i, reason = 'horde') {
    if (this.game.heroes && this.game.heroes.absorb(reason)) return;
    if (i < 0 || i >= this.members.length) { this.setCount(this.count - 1, reason); return; }
    const m = this.members[i];
    for (let k = i; k < this.members.length - 1; k++) this.members[k] = this.members[k + 1];
    this.members.length--;
    this.startDeath(m, reason);
    this.count = Math.max(0, this.count - 1);
    this.syncMembers(reason);
    this.game.events.emit('squad:change', { count: this.count, delta: -1, reason, pos: { x: m.x, y: 0.5, z: m.z } });
    if (this.count === 0) this.game.onSquadEmpty(reason);
  }

  /** Kills a specific member object (no-op if it is no longer in the formation). */
  killMemberObj(m, reason = 'horde') {
    const i = this.members.indexOf(m);
    if (i >= 0) this.killMember(i, reason); else this.remove(1, reason);
  }

  /** Blob center + radius (formation disc behind the leader). Writes into out {x, z, r}. */
  center(out) {
    const n = this.members.length;
    const R = C * Math.sqrt(n + 0.5);
    out.x = this.leader.x;
    out.z = this.leader.z + (n ? FORMATION.leaderGap + R * 0.85 : 0);
    out.r = n ? R + 0.3 : 0.5;
    return out;
  }

  /** Brings rendered raiders in line with count (pop-ins at leader / deaths from the back). */
  syncMembers(reason) {
    const want = this.wantMembers();
    // reserves never pop in while the blob still straddles a hole: they would spawn behind Pip and run back
    // into slots over the void (an invisible drain of the unrendered count); update() refills once clear
    const hold = this.members.length < want && this.refillBlocked(want);
    while (!hold && this.members.length < want) {
      const m = this.alloc();
      const rng = this.game.rng;
      m.x = this.leader.x + (rng.next() - 0.5) * 0.3;
      m.z = this.leader.z + 0.3;
      m.tx = m.x; m.tz = m.z; // pooled objects must not carry an old slot target (autopilot reads tx/tz)
      m.pop = 0;
      m.ph = rng.next() * Math.PI * 2;
      this.members.push(m);
    }
    while (this.members.length > Math.max(0, want)) {
      const m = this.members.pop();
      this.startDeath(m, reason);
    }
  }

  /** True while an active road gap overlaps the z-extent the blob would have with `want` members. */
  refillBlocked(want) {
    const obs = this.game.obstacles;
    const gs = obs && obs.gaps;
    if (!gs || !gs.length) return false;
    const R = C * Math.sqrt(want + 0.5);
    const front = -this.leader.z + 1, back = -(this.leader.z + FORMATION.leaderGap + R * 1.85 + 0.3) - 1;
    for (let i = 0; i < gs.length; i++) if (gs[i].from < front && gs[i].to > back) return true;
    return false;
  }

  /** Rendered raiders wanted for the count (Pip is one of them unless he fell into a gap). */
  wantMembers() { return Math.min(this.count, FORMATION.maxRendered) - (this.pipGone ? 0 : 1); }

  /**
   * Gap falls (called by obstacles while a hole overlaps the blob): every member (and Pip) whose position
   * test(x, z) says is over the void tumbles down. One squad:change { reason:'gap' } for the batch.
   */
  fallCheck(test) {
    const ms = this.members, L = this.leader;
    let k = 0, lost = 0, px = 0, pz = 0;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (test(m.x, m.z)) { this.startDeath(m, 'gap'); lost++; px = m.x; pz = m.z; } else ms[k++] = m;
    }
    ms.length = k;
    if (lost) this.keepSlots();
    if (!this.pipGone && test(L.x, L.z)) {
      this.pipGone = true;
      const f = this.pipFall;
      f.on = true; f.t = 0; f.x = L.x; f.z = L.z; f.y = 0;
      f.vx = L.vx * 0.12; f.vy = 1.6; f.vz = 1.2; f.spin = L.x > 0 ? -5 : 5;
      lost++; px = L.x; pz = L.z;
      if (this.game.events.wants('squad:lost')) this.game.events.emit('squad:lost', { pos: { x: L.x, y: 0.5, z: L.z }, reason: 'gap' });
    }
    if (!lost) return 0;
    this.count = Math.max(0, this.count - lost);
    const ev = this.game.events, pos = { x: px, y: 0, z: pz };
    if (ev.wants('obstacle:kill')) ev.emit('obstacle:kill', { kind: 'gap', pos });
    ev.emit('squad:change', { count: this.count, delta: -lost, reason: 'gap', pos });
    if (this.count === 0) this.game.onSquadEmpty('gap');
    return lost;
  }

  /**
   * After members drop out of the middle of the list, every later member's slot index shifts and the blob
   * would reshuffle across the road. Greedy re-pairing (each slot, inner first, takes the nearest free
   * member) keeps survivors where they stand.
   */
  keepSlots() {
    const ms = this.members, n = ms.length;
    if (n < 2) return;
    const pool = this._pool || (this._pool = []);
    pool.length = 0;
    for (let i = 0; i < n; i++) pool.push(ms[i]);
    for (let i = 0; i < n; i++) {
      this.slotTarget(_tmpSlot, i);
      let k = 0, kd = Infinity;
      for (let j = 0; j < pool.length; j++) {
        const dx = pool[j].x - _tmpSlot.tx, dz = pool[j].z - _tmpSlot.tz, d2 = dx * dx + dz * dz;
        if (d2 < kd) { kd = d2; k = j; }
      }
      ms[i] = pool[k];
      pool[k] = pool[pool.length - 1]; pool.pop();
    }
  }

  /** Pip is back over solid road: the raider nearest the leader steps up as Pip. */
  pipReturn() {
    this.pipGone = false;
    const L = this.leader, ms = this.members;
    while (ms.length > Math.max(0, this.wantMembers())) {
      let k = 0, kd = Infinity;
      for (let i = 0; i < ms.length; i++) {
        const dx = ms[i].x - L.x, dz = ms[i].z - L.z, d2 = dx * dx + dz * dz;
        if (d2 < kd) { kd = d2; k = i; }
      }
      this.free.push(ms.splice(k, 1)[0]);
    }
    this.pipPop = 0;
    this.pip.root.visible = true;
  }

  startDeath(m, reason) {
    if (this.game.events.wants('squad:lost')) this.game.events.emit('squad:lost', { pos: { x: m.x, y: 0.5, z: m.z }, reason });
    if (this.dying.length >= MAX_DYING) { this.free.push(m); return; }
    m.t = 0;
    m.y = 0;
    m.vy = 3.2 + Math.random() * 1.5;
    m.vx = (Math.random() - 0.5) * 3;
    m.vz = 1.5 + Math.random() * 2;
    m.spin = (Math.random() - 0.5) * 12;
    m.kind = reason === 'gap' ? 1 : 0;
    if (m.kind === 1) {
      // no hop: drop straight into the hole, keep some forward momentum, tumble
      m.vy = 0.4 + Math.random() * 0.9;
      m.vx = (Math.random() - 0.5) * 1.2;
      m.vz = 0.6 + Math.random() * 1.4;
      m.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
    }
    this.dying.push(m);
  }

  leaderPos() { return { x: this.leader.x, y: 0, z: this.leader.z }; }

  slotTarget(m, i) {
    const n = this.members.length;
    const R = C * Math.sqrt(n + 0.5);
    const cx = this.leader.x, cz = this.leader.z + FORMATION.leaderGap + R * 0.85;
    let tx = cx + SLOT_X[i], tz = cz + SLOT_Z[i];
    const dx = tx - this.leader.x, dz = tz - this.leader.z;
    const d2 = dx * dx + dz * dz, cl = FORMATION.leaderClear;
    if (d2 < cl * cl) {
      const d = Math.sqrt(d2) || 0.001;
      tx = this.leader.x + (dx / d) * cl; tz = this.leader.z + (dz / d) * cl;
    }
    m.tx = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, tx));
    m.tz = tz;
  }

  /** Logic step. targetX from input/autopilot; forward = u/s forward speed. */
  update(dt, targetX, forward) {
    this.time += dt;
    const L = this.leader;
    const px = L.x;
    const hz = this.game.hazards ? this.game.hazards.mods : null; // update 3 world hazards (ice, avalanche, syrup)
    const ease = MOVE.ease * (this.game.heroes ? this.game.heroes.easeMul : 1) * (hz ? hz.easeMul : 1);
    if (hz && hz.slide > 0 && dt > 0) {
      // ice: the leader keeps its sideways velocity and only slowly turns toward the line it is steered to
      const want = Math.max(-11, Math.min(11, (targetX - L.x) * Math.min(ease, 6)));
      L.vx += (want - L.vx) * (1 - Math.exp(-(1.6 + 14 * (1 - hz.slide)) * dt));
      L.x += L.vx * dt;
    } else L.x += (targetX - L.x) * (1 - Math.exp(-ease * dt));
    if (hz && hz.pushX) L.x += hz.pushX * dt;
    L.x = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, L.x));
    L.vx = dt > 0 ? (L.x - px) / dt : 0;
    this.speed = forward;
    L.z -= forward * dt;
    const k = 1 - Math.exp(-FORMATION.ease * dt);
    const ms = this.members;
    // members standing on solid road never step sideways into a hole (formation re-centering would drag
    // the survivors of a straddling blob into it); only the ones that run over the void fall
    const obs = this.game.obstacles;
    const hole = obs && obs.gaps.length ? obs.overGap : null;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      this.slotTarget(m, i);
      if (hole && ((hole(m.tx, m.z) && !hole(m.x, m.z)) || (hole(m.tx, m.z - 2.5) && !hole(m.x, m.z - 2.5)))) m.tx = m.x;
      m.x += (m.tx - m.x) * k;
      m.z += (m.tz - m.z) * k - forward * dt * (1 - k);
      if (m.pop < 1) m.pop = Math.min(1, m.pop + dt / 0.32);
    }
    if (this.pipPop < 1) this.pipPop = Math.min(1, this.pipPop + dt / 0.32);
    const f = this.pipFall;
    if (f.on) {
      f.t += dt;
      f.x += f.vx * dt; f.z += (f.vz - forward) * dt;
      f.vy -= 14 * dt; f.y += f.vy * dt;
    }
    if (this.pipGone && this.count > 0 && (!f.on || f.t > 0.45)) {
      const obs = this.game.obstacles;
      if (!obs || !obs.overGap(L.x, L.z)) this.pipReturn();
    }
    // reserves (count beyond the rendered members) refill the blob once Pip leads on solid road again
    if (!this.pipGone && this.members.length < this.wantMembers()) this.syncMembers('gap');
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      d.x += d.vx * dt; d.z += (d.vz - forward) * dt;
      d.vy -= 14 * dt; d.y += d.vy * dt;
      const life = d.kind === 1 ? 1.3 : 0.55;
      if (d.t >= life) { this.dying[i] = this.dying[this.dying.length - 1]; this.dying.pop(); this.free.push(d); }
    }
  }

  /** Visual sync: Pip rig + raider instance matrices. */
  sync(dt, phase) {
    const t = this.time;
    const running = this.speed > 0.5 ? 1 : 0;
    this.runBlend += (running - this.runBlend) * Math.min(1, dt * 6);
    this.cheer += ((phase === 'won' ? 1 : 0) - this.cheer) * Math.min(1, dt * 4);
    const L = this.leader;
    this.leaderRig.sync(t);
    const lift = this.game.hazards ? this.game.hazards.mods.lift : 0; // jelly launch arc (visual only)
    if (lift && !this.pipGone && !this.pipFall.on) this.pip.root.position.y = lift;
    const arr = this.raiders.instanceMatrix.array;
    let n = 0;
    const rb = Math.max(0.3, this.runBlend);
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const ph = t * 12 + m.ph;
      const sn = Math.sin(ph);
      const bob = Math.abs(sn) * 0.1 * rb + (this.cheer > 0.01 ? Math.max(0, Math.sin(t * 8 + m.ph)) * 0.4 * this.cheer : 0);
      const p = m.pop;
      const sc = p < 1 ? popScale(p) : 1;
      _e.set(-0.16 * rb, (m.tx - m.x) * -0.25, sn * 0.12 * rb);
      _q.setFromEuler(_e);
      _m.compose(_p.set(m.x, bob + lift, m.z), _q, _s.set(sc, sc * (1 - Math.abs(Math.cos(ph)) * 0.05 * rb), sc));
      _m.toArray(arr, n * 16);
      n++;
    }
    for (let i = 0; i < this.dying.length; i++) {
      const d = this.dying[i];
      const life = d.kind === 1 ? 1.3 : 0.55;
      const f = d.t / life;
      const sc = d.kind === 1 ? Math.max(0.05, 1 - f * f * 0.85) : (f < 0.25 ? 1 + f * 1.2 : Math.max(0.01, 1.3 * (1 - (f - 0.25) / 0.75)));
      _e.set(d.spin * d.t, 0, d.spin * d.t * 0.6);
      _q.setFromEuler(_e);
      _m.compose(_p.set(d.x, Math.max(d.kind === 1 ? -20 : 0, d.y), d.z), _q, _s.set(sc, sc, sc));
      _m.toArray(arr, n * 16);
      n++;
    }
    this.raiders.count = n;
    this.guns.count = n;
    this.shadowProxy.count = n;
    if (n) markInstances(this.raiders.instanceMatrix, n);
  }

  /** Shooter muzzle position: i=0 -> Pip, i>=1 -> members[i-1]. Writes into out {x,y,z}. */
  muzzle(i, out) {
    if ((i === 0 && !this.pipGone) || this.members.length === 0) {
      this.leaderRig.muzzle(out);
    } else {
      const m = this.members[Math.max(0, i - 1) % this.members.length];
      out.x = m.x + RAIDER_MUZZLE.x; out.y = RAIDER_MUZZLE.y + 0.1; out.z = m.z + RAIDER_MUZZLE.z;
    }
    return out;
  }

  /** x-extent of the blob (for autopilot / HUD). */
  bounds(out) {
    let a = this.leader.x, b = this.leader.x;
    for (const m of this.members) { if (m.x < a) a = m.x; if (m.x > b) b = m.x; }
    out.min = a; out.max = b;
    return out;
  }

  dispose() {}
}
