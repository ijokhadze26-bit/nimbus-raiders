// Barrels: red drums with an HP band. Bullets chip the HP (damage based); at 0 the barrel explodes and grants
// its reward (weapon tier, troops, drone, turret, coins, power). Running into an unbroken barrel kills one
// member and breaks it without a reward.
import { LANES, MEMBER_CLAMP } from '../config.js';
import { MAX_TIER } from '../data/weapons.js';
import { buildBarrelVisual, buildRewardDisplay, BARREL_R } from '../models/barrel.js';
import { drawLabel, drawBadge, labelReady } from '../models/labels.js';
import { hasHit } from './bullets.js';

const SPAWN_AHEAD = 110;
const HIT_HALF = 0.95;
const FLY_TIME = 0.45;
const HP_LABEL = { fill: '#e8213a', stroke: '#5e0412', strokeWidth: 12, size: 104, shadow: false, y: 0.55 };
let nextId = 1;

export class Barrels {
  init(game) {
    this.game = game;
    this.live = [];
    this.pool = [];
    this.displays = new Map(); // key -> [display]
    this.events = [];
    this.cursor = 0;
    this.time = 0;
    this.kind = 'barrel';
    this.priority = 8;
    this.hitPos = { x: 0, y: 0, z: 0 };
    game.bullets.addTargetSystem(this);
  }

  reset(run) {
    for (const b of this.live) this.releaseVisual(b);
    this.live.length = 0;
    this.events = run ? run.eventsOf('barrel') : [];
    this.cursor = 0;
  }

  skipAll() { this.cursor = this.events.length; for (const b of this.live) { b.state = 'gone'; } }

  // ---------------- visuals pooling ----------------
  displayKey(b) {
    const k = b.reward.kind;
    if (k === 'weapon') return 'weapon:' + this.rewardTier(b) + (this.game.weapons.tier >= MAX_TIER ? ':max' : '');
    if (k === 'troops') return 'troops:' + (b.reward.amount || 1);
    return k;
  }

  rewardTier(b) { return Math.min(MAX_TIER, this.game.weapons.tier + (b.reward.amount || 1)); }

  acquireDisplay(b) {
    const key = this.displayKey(b);
    const list = this.displays.get(key);
    let d = list && list.length ? list.pop() : null;
    if (!d) {
      d = buildRewardDisplay(b.reward.kind, b.reward.amount, this.rewardTier(b));
      d.userData.key = key;
      if (d.userData.label) {
        // at the top tier a gun barrel pays 25 coins instead (applyReward)
        if (b.reward.kind === 'weapon') drawBadge(d.userData.label, key.endsWith(':max') ? '+25' : 'GUN UP', '#ffae1a', '#a85400');
        else drawBadge(d.userData.label, '+' + (b.reward.amount || 1));
      }
    }
    d.scale.setScalar(1.45);
    d.position.set(0, 0, 0);
    b.displayKey = key;
    return d;
  }

  releaseDisplay(d) {
    if (!d) return;
    if (d.parent) d.parent.remove(d);
    const key = d.userData.key;
    if (!this.displays.has(key)) this.displays.set(key, []);
    this.displays.get(key).push(d);
  }

  releaseVisual(b) {
    if (b.display) { this.releaseDisplay(b.display); b.display = null; }
    if (!b.visual) return;
    this.game.scene.remove(b.visual.group);
    this.pool.push(b.visual);
    b.visual = null;
  }

  make(e) {
    const v = this.pool.length ? this.pool.pop() : buildBarrelVisual();
    v.label.key = null; v.labelHp = -1;
    v.body.visible = true; v.labelMesh.visible = true;
    v.group.visible = true;
    v.group.scale.set(1, 1, 1);
    this.game.scene.add(v.group);
    const b = {
      id: nextId++, x: LANES[e.lane] ?? 0, z: -e.at, hp: e.hp, maxHp: e.hp,
      reward: { kind: e.reward?.kind || 'coins', amount: e.reward?.amount ?? (e.reward?.kind === 'coins' ? 20 : 1) },
      state: 'live', t: 0, punch: 0, flash: 0, visual: v, display: null, displayKey: null, fly: null, ph: (e.at * 0.73) % 6.28,
    };
    b.x = Math.max(-MEMBER_CLAMP + 0.6, Math.min(MEMBER_CLAMP - 0.6, b.x + (e.dx || 0)));
    b.display = this.acquireDisplay(b);
    v.reward.add(b.display);
    v.glow.material.color.set(b.display.userData.glowColor);
    return b;
  }

  // ---------------- logic ----------------
  update(dt) {
    const game = this.game;
    this.time += dt;
    const L = game.squad.leader;
    const dist = -L.z;
    while (this.cursor < this.events.length && this.events[this.cursor].at - dist < SPAWN_AHEAD) this.live.push(this.make(this.events[this.cursor++]));
    const run = game.run;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      b.punch = Math.max(0, b.punch - dt * 6);
      if (b.state === 'live' && run && run.active) this.checkContact(b);
      const done = b.state === 'gone' || (b.state === 'broken' && b.t > FLY_TIME + 0.1) || b.z > L.z + 12;
      if (done) { this.releaseVisual(b); this.live.splice(i, 1); }
    }
  }

  checkContact(b) {
    const squad = this.game.squad;
    const L = squad.leader;
    if (b.z < L.z - BARREL_R - 0.5) return; // still ahead of the leader
    const rx = BARREL_R + 0.25, rz = BARREL_R + 0.2;
    let victim = null;
    if (Math.abs(L.x - b.x) < rx && Math.abs(L.z - b.z) < rz) victim = 'leader';
    else {
      const ms = squad.members;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (Math.abs(m.x - b.x) < rx && Math.abs(m.z - b.z) < rz) { victim = m; break; }
      }
    }
    if (!victim) return;
    this.breakBarrel(b, false);
    if (victim === 'leader') squad.remove(1, 'barrel'); else squad.killMemberObj(victim, 'barrel');
  }

  breakBarrel(b, rewarded) {
    if (b.state !== 'live') return;
    const game = this.game;
    b.state = 'broken'; b.t = 0;
    const pos = { x: b.x, y: 0.9, z: b.z };
    // reward.kind is always the barrel's real reward kind; granted:false (amount 0) = smashed by running into it
    const reward = { kind: b.reward.kind, amount: rewarded ? b.reward.amount : 0, granted: !!rewarded };
    game.events.emit('barrel:break', { id: b.id, reward, pos });
    game.events.emit('fx:shake', { amount: 0.3 });
    if (game.horde) game.horde.view.blast(b.x, b.z, 1.7);
    game.gates.burst(b.x, 0.3, b.z, 1.3, 1.4, '#ff3b4e', 14);
    if (rewarded) { this.applyReward(b.reward, pos); b.fly = { x: b.x, y: 2.5, z: b.z }; }
    else if (b.display) { this.releaseDisplay(b.display); b.display = null; }
  }

  applyReward(r, pos) {
    const game = this.game;
    if (!game.run || !game.run.active) return; // never grant anything once the run is decided
    const n = r.amount || 1;
    switch (r.kind) {
      case 'weapon':
        if (game.weapons.tier >= MAX_TIER) { if (game.run) game.run.coins += 25; game.events.emit('coin:collect', { amount: 25, pos }); }
        else game.weapons.upgrade(n);
        break;
      case 'troops': game.squad.add(n, 'barrel'); break;
      case 'drone': case 'turret': if (game.helpers) game.helpers.add(r.kind, n); break;
      case 'coins': if (game.run) game.run.coins += n; game.events.emit('coin:collect', { amount: n, pos }); break;
      default: if (game.powers && game.powers.start) game.powers.start(r.kind);
    }
  }

  /** Live barrels ahead of the leader (autopilot). */
  upcoming() { return this.live.filter((b) => b.state === 'live'); }

  // ---------------- bullet target system ----------------
  sweep(bl, x, z0, z1) {
    let best = null;
    for (let i = 0; i < this.live.length; i++) {
      const b = this.live[i];
      if (b.state !== 'live') continue;
      const front = b.z + BARREL_R;
      if (front > z0 + BARREL_R * 2 || front < z1) continue;
      if (Math.abs(x - b.x) > HIT_HALF) continue;
      if (best && b.z <= best.z) continue;
      if (bl.nh && hasHit(bl, b)) continue;
      best = b;
    }
    return best;
  }

  hit(b, bl) {
    b.punch = 1; b.flash = 1;
    const run = this.game.run;
    if (!run || !run.active) return true; // run is over: stray bullets still clink but cannot break/reward
    b.hp -= bl.dmg;
    const p = this.hitPos; p.x = bl.x; p.y = bl.y + 0.3; p.z = b.z + BARREL_R;
    this.game.events.emit('barrel:hit', { id: b.id, hp: Math.max(0, Math.ceil(b.hp)), pos: p });
    this.game.events.emit('bullet:hit', { kind: 'barrel', pos: p });
    if (b.hp <= 0) this.breakBarrel(b, true);
    return true;
  }

  // ---------------- visuals ----------------
  sync(dt) {
    const L = this.game.squad.leader;
    for (const b of this.live) {
      const v = b.visual;
      if (!v) continue;
      v.group.position.set(b.x, 0, b.z);
      if (b.state === 'live') {
        const pu = b.punch;
        v.body.scale.set(1 + pu * 0.08, 1 - pu * 0.06, 1 + pu * 0.08);
        b.flash = Math.max(0, b.flash - dt * 7);
        v.mat.emissiveIntensity = b.flash * 0.55;
        const hp = Math.max(0, Math.ceil(b.hp));
        if (hp !== v.labelHp && labelReady(v.label)) { v.labelHp = hp; drawLabel(v.label, String(hp), HP_LABEL); }
        v.labelMesh.scale.setScalar(1 + pu * 0.18);
        // weapon reward follows the current tier (next tier)
        if (b.reward.kind === 'weapon' && this.displayKey(b) !== b.displayKey) {
          this.releaseDisplay(b.display);
          b.display = this.acquireDisplay(b);
          v.reward.add(b.display);
          v.glow.material.color.set(b.display.userData.glowColor);
        }
        const d = b.display;
        if (d) {
          // the rifle wobbles (±35°) instead of spinning, so it never turns edge-on into a thin stick
          d.rotation.y = b.reward.kind === 'weapon' ? Math.sin(this.time * 1.8 + b.ph) * 0.6 : this.time * 1.8 + b.ph;
          d.position.y = Math.sin(this.time * 2.4 + b.ph) * 0.14;
          if (d.userData.rotor) d.userData.rotor.rotation.y = this.time * 30;
          if (d.userData.labelMesh) d.userData.labelMesh.rotation.y = -d.rotation.y;
        }
        v.glow.material.opacity = 0.55 + 0.2 * Math.sin(this.time * 3 + b.ph);
      } else {
        v.body.visible = false; v.labelMesh.visible = false;
        const f = Math.min(1, b.t / FLY_TIME);
        v.glow.material.opacity = 0.8 * (1 - f);
        if (b.display) {
          // reward zooms into the squad
          const e = f * f;
          const wx = b.x + (L.x - b.x) * e, wz = b.z + (L.z - b.z) * e;
          v.reward.position.set(wx - b.x, 3.1 + Math.sin(f * Math.PI) * 1.4 - f * 2, wz - b.z);
          const s = 1.45 * (f < 0.2 ? 1 + f * 2 : 1.4 * (1 - (f - 0.2) / 0.8) + 0.05);
          b.display.scale.setScalar(s);
          b.display.rotation.y += dt * 14;
        }
      }
      if (b.state === 'live') v.reward.position.set(0, 3.1, 0);
    }
  }

  dispose() {}
}
