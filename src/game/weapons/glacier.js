// GLACIER LANCE (ice, SPEC2 §2.2): long piercing ice shards (speed 72, range 60). Every pierced hit slows the
// enemy (strongest slow wins, timer refreshes) and rolls the freeze proc for the real shots spent on it
// (p_eff = 1 - (1 - p)^n, capped at 0.35, game.procRng). Glacier freezes shatter: the squad touching a frozen
// enemy kills it with no loss (horde.contacts). Each shard removes 2 shield hits (SHIELD_HITS).
import { WeaponBehaviour } from './base.js';
import { vsMul } from '../../data/matchups.js';
import { special, fxq, exposure, mixMul, isAlive } from './common.js';

export class GlacierLance extends WeaponBehaviour {
  reset() { this.stats = { hits: 0, rolls: 0, freezes: 0, maxPe: 0, shatters: 0 }; }

  fire(v) {
    const r = this.row(v.mk);
    const b = this.spawnMain(v, v.x, v.y, v.z + v.lead, 0, -r.speed);
    if (b) b.roll = (this.game.time * 7) % 6.283; // crystals land at varied angles (visual)
  }

  onHit(b, kind, t, res) {
    if (kind !== 'enemy' || this.game.horde.last.blocked) return res;
    const st = this.stats || this.reset() || this.stats;
    st.hits++; // killing hits count as hits (freezes per enemy hit), they just have nothing left to slow
    if (!isAlive(t)) return res;
    const r = this.row(), S = this.game.status;
    S.slow(t, r.slow, r.slowTime);
    const n = this.spentShots(b);
    const pe = Math.min(this.def.mk[0].freezeCap ?? 0.35, 1 - Math.pow(1 - r.freeze, Math.max(1, n)));
    st.rolls++;
    if (pe > st.maxPe) st.maxPe = pe;
    if (this.game.procRng.next() < pe) {
      const was = t.freezeT > 0;
      S.freeze(t, r.freezeTime);
      if (!was) {
        st.freezes++;
        fxq(this, 'freeze', t.x, 0.6, t.z);
        special(this, 'freeze', t.x, 0.6, t.z);
      }
    } else if (r.mk >= 4 && (st.hits & 7) === 0) fxq(this, 'frost', t.x, 0.05, t.z);
    return res;
  }

  /** Shatter feedback (visual + sound only): a frozen enemy that died at the squad front. */
  update() {
    const list = this.game.horde.list, Lz = this.game.squad.leader.z;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.shatter !== 1 || e.state === 0) continue;
      e.shatter = 2;
      if (Math.abs(e.z - Lz) < 2.5) {
        if (this.stats) this.stats.shatters++;
        fxq(this, 'shatter', e.x, 0.6, e.z);
        special(this, 'shatter', e.x, 0.6, e.z);
      }
    }
  }

  crowdFactor(mix) {
    const r = this.row();
    return exposure(r.range || 60) * mixMul(this, mix, vsMul) * (1 + 0.3 * Math.min(4, r.pierce || 0));
  }
}
