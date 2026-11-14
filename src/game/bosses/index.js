// Boss registry (type -> class) + director that owns the active boss (exposed as game.boss).
// Adding a boss = a small BaseBoss subclass + a model + a data entry, then register it here.
import { Grawlstone } from './grawlstone.js';

export const BOSS_CLASSES = {
  grawlstone: Grawlstone,
};

export class Bosses {
  init(game) { this.game = game; this.active = null; }

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
    this.active = null;
    this.game.boss = null;
  }

  reset() { this.clear(); }

  update(dt) { if (this.active) this.active.update(dt); }

  sync(dt) { if (this.active) this.active.sync(dt); }

  dispose() { this.clear(); }
}
