// THUNDERCLAP (storm, SPEC2 §2.6): fast lightning darts (speed 85, range 55). On an enemy hit the bolt jumps
// instantly to the nearest alive, not-yet-chained enemy within reach of the previous link, up to `jumps`
// times, dealing dmg * 0.7^k (1 shield hit per jump). On a boss hit it chains to boss minions within reach of
// the hit point, otherwise it stops. Chain arcs are queued for fx (weapons.fxq).
import { WeaponBehaviour } from './base.js';
import { vsMul } from '../../data/matchups.js';
import { special, chain, exposure, mixMul } from './common.js';

const SRC = { el: 'thunderclap', shieldHits: 1, bypassShield: false, cause: 'weapon', events: true, weapon: 'thunderclap' };

export class Thunderclap extends WeaponBehaviour {
  reset() { this.stats = { bolts: 0, chains: 0, jumps: 0 }; }

  fire(v) {
    const r = this.row(v.mk);
    const b = this.spawnMain(v, v.x, v.y, v.z + v.lead, 0, -r.speed);
    if (!b) return;
    b.data = v.dmg;
    if (this.stats) this.stats.bolts++;
  }

  onHit(b, kind, t, res) {
    if (kind !== 'enemy' && kind !== 'boss') return res;
    const r = this.row();
    const x = kind === 'enemy' ? t.x : b.x, z = t.z;
    const made = chain(this, x, z, kind === 'enemy' ? t : null, r.jumps, r.reach, b.data || b.dmg, b.unit, r.falloff ?? 0.7, SRC);
    if (made > 0) {
      const st = this.stats || (this.reset(), this.stats);
      st.chains++; st.jumps += made;
      special(this, 'chain', x, 0.8, z, made);
    }
    return res;
  }

  crowdFactor(mix) {
    const r = this.row();
    let c = 1, k = 1;
    for (let j = 0; j < r.jumps; j++) { k *= r.falloff ?? 0.7; c += k; }
    // chains need neighbours: credit about 70% of the full chain on an average horde
    return exposure(r.range) * mixMul(this, mix, vsMul) * (1 + (c - 1) * 0.7);
  }
}
