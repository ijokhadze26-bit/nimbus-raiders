// FOUNDATION stub helper (HEROES builder replaces the five rigs): a recoloured, rescaled Pip so every hero
// already has a distinct colour and height. Keeps the full rig contract.
import { buildPip, PIP_SCALE } from '../pip.js';
import { heroDef } from '../../data/heroes.js';

export function tintedPip(heroId, palette) {
  const def = heroDef(heroId);
  const rig = buildPip(palette);
  rig.id = heroId;
  rig.scale = PIP_SCALE * (def.scale || 1);
  rig.root.scale.setScalar(rig.scale);
  return rig;
}
