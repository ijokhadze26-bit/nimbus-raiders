// Shader warm-up. three compiles a program the first time something with a new material setup is drawn,
// which stalls that frame for 20-100+ ms on a phone (the first gate, barrel, blade, telegraph, boss orb ...).
// At boot we build one of every lazily created visual (each goes back into its owner's pool, so nothing is
// wasted), compile all of them with the scene's lights, and do the same for the level's boss at run start.
import * as THREE from 'three';
import { GATE } from '../config.js';
import { buildBarrelVisual, buildRewardDisplay } from '../models/barrel.js';
import { buildBladeVisual, buildGapView, disposeGapView } from '../models/obstacles.js';
import { buildPowerToken, POWER_STYLE } from '../models/pickups.js';

// Lazily built update-2 visuals (crates, mini turrets, Fortress, meteor, zone views, hero rigs ...) register a
// builder here from their module's top level: fn(game) -> Object3D | Object3D[] | { objects, done } | null.
// warmShaders compiles them with the scene's lights at boot (programs never grow mid-run).
const WARM = [];
export function registerWarm(fn) { if (typeof fn === 'function') WARM.push(fn); }

export function warmShaders(game) {
  const tmp = new THREE.Group();
  const done = [];
  for (const fn of WARM) {
    try {
      const r = fn(game);
      if (!r) continue;
      const objs = r.isObject3D ? [r] : Array.isArray(r) ? r : (r.objects || []);
      for (const o of objs) { tmp.add(o); done.push(() => tmp.remove(o)); }
      if (r.done) done.push(r.done);
    } catch (e) { console.warn('[warmup] builder failed', e); }
  }

  // gates (lane + centre width): back into the gates' pool afterwards
  for (const w of [GATE.width, GATE.widthCenter]) {
    const v = game.gates.acquireVisual(w);
    done.push(() => game.gates.releaseVisual({ visual: v }));
  }
  // barrel + reward displays (one per material setup)
  const bv = buildBarrelVisual();
  tmp.add(bv.group);
  done.push(() => { tmp.remove(bv.group); game.barrels.pool.push(bv); });
  for (const [kind, amount] of [['weapon', 1], ['troops', 8], ['drone', 1], ['turret', 1], ['shield', 1], ['coins', 20]]) {
    try {
      const d = buildRewardDisplay(kind, amount, 2);
      tmp.add(d);
      done.push(() => tmp.remove(d));
    } catch { /* kind without a display */ }
  }
  // hazards
  const blade = buildBladeVisual();
  tmp.add(blade.group);
  done.push(() => { tmp.remove(blade.group); game.obstacles.pool.push(blade); });
  const gap = buildGapView(game.world.theme, 'L', 10, 16);
  tmp.add(gap.group);
  done.push(() => { tmp.remove(gap.group); disposeGapView(gap); });
  // power tokens
  for (const kind of Object.keys(POWER_STYLE)) {
    const t = buildPowerToken(kind);
    tmp.add(t.root);
    done.push(() => {
      tmp.remove(t.root);
      const pool = game.pickups.tokenPool;
      if (!pool.has(kind)) pool.set(kind, []);
      pool.get(kind).push(t);
    });
  }
  // helpers
  for (const kind of ['drone', 'turret']) {
    const v = game.helpers.visual(kind);
    tmp.add(v.root);
    done.push(() => { tmp.remove(v.root); game.helpers.pool[kind].push(v); });
  }
  // telegraph markers
  for (const kind of ['circle', 'lane']) {
    const v = game.telegraph.visual(kind);
    tmp.add(v.group);
    done.push(() => { tmp.remove(v.group); game.telegraph.pools[kind].push(v); });
  }
  // shared boss attack visuals (pooled inside the effects; clear() hides them again)
  const fx = game.bosses.effects;
  try {
    fx.orb(0, 2, -10, 0, -12, 1);
    fx.bolt(0, -10);
    fx.ring(0, -10, 2);
    fx.glow(0, 1, -10, '#ffffff', 1);
    fx.puddle(0, -10, 2, 1);
    fx.crest(0, 2, -12, -8, 1);
    const beam = fx.laser();
    for (const m of [beam.sheet, beam.line, beam.burn]) { tmp.add(m); done.push(() => tmp.remove(m)); }
  } catch { /* effects API changed: compile what exists */ }
  done.push(() => fx.clear());

  game.scene.add(tmp);
  game.engine.precompile(game.scene);
  game.scene.remove(tmp);
  for (const fn of done) fn();
}

/** Run start: the level boss model (built by bosses.preload) compiles long before the arena. */
export function warmBoss(game, type) {
  const m = game.bosses.models.get(type);
  if (!m || m.warmed || !m.root) return;
  m.warmed = true;
  const parent = m.root.parent;
  if (!parent) game.scene.add(m.root);
  game.engine.precompile(m.root);
  if (!parent) game.scene.remove(m.root);
}
