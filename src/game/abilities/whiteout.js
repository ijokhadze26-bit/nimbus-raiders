// Rime - Whiteout (SPEC2 §3.3). Every alive enemy from just behind the leader to `ahead` u in front is frozen
// for `duration` s (no shatter: touching one still costs a raider or a Guard point); enemies that spawn during
// the window spawn frozen (status.freezeWindow -> horde.place -> status.onPlace); the boss starts no new attack
// for the window (boss.frozenT, a running attack finishes). Frozen targets take +25% damage (hordeops / boss).
import { heroDef } from '../../data/heroes.js';
import { enemiesAhead } from './common.js';

const BEHIND = 8;   // also freezes the ones already at the squad's front rows
const list = [];

export const whiteout = {
  last: null,       // { frozen, boss } (tests / fx)

  use(game) {
    const a = heroDef('rime').ability;
    enemiesAhead(game, -BEHIND, a.ahead, list);
    for (let i = 0; i < list.length; i++) game.status.freeze(list[i], a.duration, { shatter: false });
    game.status.freezeWindow(a.duration);
    const boss = game.boss;
    let b = false;
    if (boss && boss.alive) { boss.frozenT = Math.max(boss.frozenT || 0, a.duration); b = true; }
    this.last = { frozen: list.length, boss: b };
    return true;
  },
  update() {},
  reset() { this.last = null; },
};
