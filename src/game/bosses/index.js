// Boss registry (type -> class) + director that owns the active boss (exposed as game.boss).
// Adding a boss = a small BaseBoss subclass + a model + a data entry, then register it here.
import { Grawlstone } from './grawlstone.js';
import { Oculon } from './oculon.js';
import { MotherMurk } from './mothermurk.js';
import { Ironhorn } from './ironhorn.js';
import { TempestKing } from './tempestking.js';
import { BossEffects } from './effects.js';
import { warmBoss } from '../warmup.js';
import { bossLook } from '../../data/bosses.js';
import { prepare } from './skins.js';

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
    const look = bossLook(cfg);
    const Cls = BOSS_CLASSES[look.type] || Grawlstone;
    if (Cls.preload) Cls.preload(this.game);
    warmBoss(this.game, BOSS_CLASSES[look.type] ? look.type : 'grawlstone');
    // world skin: remapped vertex colours are computed now (run start), the spawn only copies them in
    const m = this.models.get(look.type);
    if (look.skin && m && m.root) prepare(m.root, look.skin);
  }

  /**
   * Spawns the level boss. Unknown types fall back to Grawlstone until their class exists (glacius /
   * gumdrop fight as a frost / candy Grawlstone under their own name, see bossLook); cfg.skin recolours.
   */
  spawn(cfg) {
    this.clear();
    const look = bossLook(cfg);
    const Cls = BOSS_CLASSES[look.type] || Grawlstone;
    this.active = new Cls(this.game, { ...cfg, type: look.type, skin: look.skin, name: look.name, subtitle: look.subtitle });
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
