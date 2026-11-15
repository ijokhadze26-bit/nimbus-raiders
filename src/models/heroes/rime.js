// rime rig. FOUNDATION STUB (owned by the HEROES builder): a recoloured, rescaled Pip. The final rig follows
// SPEC2 §3 for 'rime' and the contract in ./index.js; it must keep the export name buildRime.
import { tintedPip } from './stub.js';

export function buildRime() {
  return tintedPip('rime', { helmet: '#e8f6ff', visor: '#4dc3ff', visorDeep: '#2a90c8', suit: '#e8f6ff', suitDark: '#9fc8e8', scarf: '#6f9bff', scarfDark: '#5078e0', pack: '#9fc8e8', stripe: '#6f9bff', glow: '#b8f2ff' });
}
