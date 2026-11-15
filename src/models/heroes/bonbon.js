// bonbon rig. FOUNDATION STUB (owned by the HEROES builder): a recoloured, rescaled Pip. The final rig follows
// SPEC2 §3 for 'bonbon' and the contract in ./index.js; it must keep the export name buildBonbon.
import { tintedPip } from './stub.js';

export function buildBonbon() {
  return tintedPip('bonbon', { helmet: '#ff8ad8', visor: '#8affc8', visorDeep: '#50c890', suit: '#8affc8', suitDark: '#ff8ad8', scarf: '#b48aff', scarfDark: '#9068e0', pack: '#fff0a0', stripe: '#ff8ad8', glow: '#ffb3e6' });
}
