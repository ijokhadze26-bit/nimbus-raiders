// Equipped skins -> in-game looks. Hero skins recolor Pip and the Raiders' accents; weapon skins
// override the bullet / gun colors per tier (each tier keeps its shape). Prism cycles hue over time.
import * as THREE from 'three';
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../data/skins.js';
import { weaponForTier } from '../data/weapons.js';

const _c = new THREE.Color();
const shade = (hex, dl) => '#' + _c.set(hex).offsetHSL(0, 0, dl).getHexString();

/**
 * Pip + Raider color overrides for a hero skin id. Classic returns nulls so the hand-tuned model
 * defaults stay exactly as built.
 */
export function heroLook(id) {
  const s = HERO_BY_ID[id];
  if (!s || id === 'classic') return { id: 'classic', pip: null, raider: null, glow: '#7ff3ff' };
  const p = s.pip, r = s.raider;
  return {
    id,
    glow: p.glow,
    pip: {
      helmet: p.helmet, visor: p.visor, visorDeep: shade(p.visor, -0.15), suit: p.suit, suitDark: shade(p.suit, -0.12),
      scarf: p.scarf, scarfDark: shade(p.scarf, -0.1), pack: p.jet, stripe: shade(p.suit, 0.1),
    },
    raider: {
      suit: r.body, suitDark: shade(r.body, -0.12), helmet: r.helmet, visor: r.visor, pack: r.pack,
      scarf: p.scarf, crest: shade(r.body, 0.1),
    },
  };
}

/** { color, core, trail } of a weapon tier under a weapon skin id (factory = data/weapons.js colors). */
export function tierLook(skinId, tier) {
  const w = weaponForTier(tier);
  const s = WEAPON_SKIN_BY_ID[skinId];
  const t = s && s.tiers ? s.tiers[w.tier - 1] : null;
  if (!t) return { color: w.color, core: w.style.core, trail: w.style.trail || w.color };
  return { color: t.color, core: t.core, trail: t.trail || t.color };
}

export function isPrism(skinId) { return !!(WEAPON_SKIN_BY_ID[skinId] && WEAPON_SKIN_BY_ID[skinId].prism); }

/** Rainbow tint for the Prism skin at game time t (per tier phase offset). */
export function prismColor(out, t, tier) {
  return out.setHSL((t * 0.35 + tier * 0.17) % 1, 0.95, 0.62);
}
