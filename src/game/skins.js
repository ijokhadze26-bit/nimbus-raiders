// Equipped cosmetics -> in-game looks. Pip outfits (HERO_SKINS) recolour Pip and the Raiders' accents (Pip
// only). Weapon skins are GUN PAINT (update 2): they recolour the gun bodies only, per Mk
// (tiers[mk-1].color); 'factory' = the weapon's own gun tint. Prism cycles the gun hue every frame.
// Projectiles, hits and status tints always keep the weapon's own colours.
import * as THREE from 'three';
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../data/skins.js';
import { weaponDef, MAX_MK } from '../data/weapons.js';

const _c = new THREE.Color();
const shade = (hex, dl) => '#' + _c.set(hex).offsetHSL(0, 0, dl).getHexString();

/**
 * Pip + Raider color overrides for an outfit id. Classic returns nulls so the hand-tuned model defaults stay
 * exactly as built.
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

/** Raider palette (models/raider.js keys) from a hero def's { body, helmet, visor, pack }. */
export function heroRaiderColors(r) {
  if (!r) return undefined;
  return {
    suit: r.body, suitDark: shade(r.body, -0.12), helmet: r.helmet, visor: r.visor, pack: r.pack,
    scarf: r.pack, crest: shade(r.body, 0.1), hood: r.helmet, bun: r.body, brim: r.helmet, ridge: r.pack, plate: r.helmet,
  };
}

export function isPrism(skinId) { return !!(WEAPON_SKIN_BY_ID[skinId] && WEAPON_SKIN_BY_ID[skinId].prism); }

/** Gun body colour of weapon `id` at `mk` under gun paint `paintId`. */
export function paintColor(paintId, id, mk) {
  const s = WEAPON_SKIN_BY_ID[paintId];
  const i = Math.max(1, Math.min(MAX_MK, mk | 0)) - 1;
  if (s && s.tiers) return s.tiers[i].color;
  const def = weaponDef(id);
  return (def.gunTint && def.gunTint[i]) || def.look.mk[i].color;
}

/** Rainbow tint for the Prism paint at game time t (per Mk phase offset). */
export function prismColor(out, t, mk) {
  return out.setHSL((t * 0.35 + mk * 0.17) % 1, 0.95, 0.62);
}
