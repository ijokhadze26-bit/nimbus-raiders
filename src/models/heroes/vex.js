// vex rig. FOUNDATION STUB (owned by the HEROES builder): a recoloured, rescaled Pip. The final rig follows
// SPEC2 §3 for 'vex' and the contract in ./index.js; it must keep the export name buildVex.
import { tintedPip } from './stub.js';

export function buildVex() {
  return tintedPip('vex', { helmet: '#2a2d3e', visor: '#ff3b4e', visorDeep: '#c81f35', suit: '#5a3fa8', suitDark: '#2a2d3e', scarf: '#ffc531', scarfDark: '#e0a010', pack: '#2a2d3e', stripe: '#ffc531', glow: '#c48aff' });
}
