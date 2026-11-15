// Leader rig management (extracted from squad.js, SPEC2 §6.5): which hero leads the squad (built through the
// models/heroes registry; Pip wears the equipped outfit), the gun in its hand, the per-frame pose (normal run,
// tumbling into a gap, hidden while gone, pop-in when it steps back up) and its muzzle position.
// squad.pip stays the property name of the current rig (external code reads squad.pip.root / gunMat / body).
import { buildHero } from '../models/heroes/index.js';

export class Leader {
  constructor(squad) {
    this.squad = squad;
    this.key = null;
    this.heroId = 'pip';
    this.ability = 0;    // 0..1 ability pose, driven by game/heroes.js
  }

  /**
   * Builds (or keeps) the leader rig for hero + outfit. The cache key is heroId + ':' + outfitId; a change
   * disposes the old rig. outfit = Pip palette (game/skins.js heroLook(...).pip), ignored by other heroes.
   */
  setHero(heroId, outfitId = 'classic', outfit = null) {
    const key = heroId + ':' + (heroId === 'pip' ? outfitId : '-');
    const sq = this.squad;
    if (key === this.key && sq.pip) return false;
    this.key = key;
    this.heroId = heroId;
    const old = sq.pip;
    const rig = buildHero(heroId, { lod: sq.lod || 'high', outfit: outfit || {} });
    if (old) {
      rig.root.position.copy(old.root.position);
      rig.root.visible = old.root.visible;
      rig.gun.geometry = old.gun.geometry; // cached per weapon + Mk (models/weapons/guns.js)
      rig.gunMat.color.copy(old.gunMat.color);
      sq.game.scene.remove(old.root);
      if (old.dispose) old.dispose();
    }
    sq.game.scene.add(rig.root);
    sq.pip = rig;
    sq.pipScale = rig.scale || rig.root.scale.x;
    return true;
  }

  setGunGeometry(geo) { const rig = this.squad.pip; if (rig && geo) rig.gun.geometry = geo; }

  /** Muzzle of the leader's gun (world). */
  muzzle(out) {
    const sq = this.squad, rig = sq.pip, s = sq.pipScale, m = rig.muzzle;
    out.x = sq.leader.x + m.x * s; out.y = m.y * s; out.z = sq.leader.z + m.z * s;
    return out;
  }

  /** Per-frame pose: normal run, tumbling into a gap, hidden while gone, pop-in when stepping back up. */
  sync(t) {
    const sq = this.squad;
    const L = sq.leader, pip = sq.pip, f = sq.pipFall;
    if (f.on) {
      const life = 1.15, u = Math.min(1, f.t / life);
      pip.root.visible = true;
      pip.root.position.set(f.x, Math.max(-20, f.y), f.z);
      pip.root.rotation.set(f.spin * f.t * 0.8, 0, f.spin * f.t);
      pip.root.scale.setScalar(sq.pipScale * Math.max(0.05, 1 - u * u * 0.8));
      pip.animate(t * 1.6, 0.9, 0, 0);
      if (f.t >= life) {
        f.on = false;
        pip.root.rotation.set(0, 0, 0);
        pip.root.scale.setScalar(sq.pipScale);
        pip.root.visible = !sq.pipGone;
      }
      return;
    }
    if (sq.pipGone) { pip.root.visible = false; return; }
    pip.root.position.set(L.x, 0, L.z);
    pip.root.scale.setScalar(sq.pipScale * (sq.pipPop < 1 ? popScale(sq.pipPop) : 1));
    pip.animate(t, Math.max(0.25, sq.runBlend), L.vx, sq.cheer, this.ability);
  }
}

export function popScale(p) {
  // 0 -> 1.15 -> 1
  if (p < 0.6) { const u = p / 0.6; return 1.15 * (1 - (1 - u) * (1 - u)); }
  const u = (p - 0.6) / 0.4;
  return 1.15 - 0.15 * u;
}
