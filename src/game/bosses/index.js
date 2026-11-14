// Boss registry (type -> class) + director that owns the active boss (exposed as game.boss).
// Adding a boss = a small BaseBoss subclass + a model + a data entry, then register it here.
import { Grawlstone } from './grawlstone.js';
import { Oculon } from './oculon.js';
import { MotherMurk } from './mothermurk.js';
import { Ironhorn } from './ironhorn.js';
import { TempestKing } from './tempestking.js';
import { BossEffects } from './effects.js';
import { warmBoss } from '../warmup.js';

export const BOSS_CLASSES = {
  grawlstone: Grawlstone,
  oculon: Oculon,
  mothermurk: MotherMurk,
  ironhorn: Ironhorn,
  tempestking: TempestKing,
};

export class Bosses {
  init(game) { this.game = game; this.active = null; this.models = new Map(); this.effects = new BossEffects(game); }

  /**
   * Boss models are built once per type and reused on every spawn (no per-fight geometry/material churn,
   * no GPU leak, no build hitch at the boss drop after the first time). Each class resets its own pose.
   */
  model(type, build) {
    let m = this.models.get(type);
    if (!m) { m = build(); this.models.set(type, m); }
    return m;
  }

  /** Builds the level's boss model ahead of time (called at run start, when frames are cheap). */
  preload(cfg) {
    if (!cfg) return;
    const Cls = BOSS_CLASSES[cfg.type] || Grawlstone;
    if (Cls.preload) Cls.preload(this.game);
    warmBoss(this.game, BOSS_CLASSES[cfg.type] ? cfg.type : 'grawlstone');
  }

  /** Spawns the level boss; unknown types fall back to Grawlstone until their class exists. */
  spawn(cfg) {
    this.clear();
    const Cls = BOSS_CLASSES[cfg.type] || Grawlstone;
    this.active = new Cls(this.game, { ...cfg, type: BOSS_CLASSES[cfg.type] ? cfg.type : 'grawlstone' });
    this.game.boss = this.active;
    return this.active;
  }

  clear() {
    if (this.active) this.active.dispose();
    else this.effects.clear();
    this.active = null;
    this.game.boss = null;
  }

  reset() { this.clear(); }

  update(dt) { if (this.active) this.active.update(dt); this.effects.update(dt); }

  sync(dt) { if (this.active) this.active.sync(dt); this.effects.sync(); }

  dispose() { this.clear(); }
}
