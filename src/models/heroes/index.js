// Hero rig registry (SPEC2 §3.7): buildHero(heroId, { lod, outfit }) -> rig. Pip uses models/pip.js with the
// equipped outfit palette; the other heroes build their own rigs (models/heroes/<id>.js, shared kit in
// ./common.js). Rig contract: { root, body, head, legs:[2], arms:[2], gun, gunMat, meshes:[], flames?, glow?,
//   scale, muzzle:{x,y,z} (local gun tip; x scale = world offset from the leader), handSocket (gun parent),
//   abilityDuration (s that animate's `ability` 0..1 spans; previews drive ability = elapsed / abilityDuration),
//   animate(t, run, vx = 0, cheer = 0, ability = 0), dispose() }.
// Budget: <= 12 draw objects, <= 3500 triangles High (<= 2200 Low); toonMaterial / additive basic / sprite only.
import { buildPip } from '../pip.js';
import { buildCinder } from './cinder.js';
import { buildRime } from './rime.js';
import { buildBonbon } from './bonbon.js';
import { buildBolt } from './bolt.js';
import { buildVex } from './vex.js';
import { registerWarm } from '../../game/warmup.js';

export const HERO_BUILDERS = {
  pip: (o = {}) => buildPip(o.outfit || {}),
  cinder: buildCinder, rime: buildRime, bonbon: buildBonbon, bolt: buildBolt, vex: buildVex,
};

/** Builds a hero rig. outfit = Pip palette (models/pip.js keys), ignored by the other heroes. */
export function buildHero(heroId, opts = {}) {
  const fn = HERO_BUILDERS[heroId] || HERO_BUILDERS.pip;
  const rig = fn(opts);
  rig.id = HERO_BUILDERS[heroId] ? heroId : 'pip';
  return rig;
}

// warm-up: one rig of every hero (both LODs share programs) compiles with the scene lights at boot, so
// swapping the leader or opening a preview never compiles a shader mid-run
registerWarm(() => {
  const rigs = ['cinder', 'rime', 'bonbon', 'bolt', 'vex'].map((id) => buildHero(id, { lod: 'high' }));
  return { objects: rigs.map((r) => r.root), done: () => { for (const r of rigs) r.dispose(); } };
});
