// cinder rig. FOUNDATION STUB (owned by the HEROES builder): a recoloured, rescaled Pip. The final rig follows
// SPEC2 §3 for 'cinder' and the contract in ./index.js; it must keep the export name buildCinder.
import { tintedPip } from './stub.js';

export function buildCinder() {
  return tintedPip('cinder', { helmet: '#3a2420', visor: '#ffb21f', visorDeep: '#c88a10', suit: '#d8321e', suitDark: '#3a2420', scarf: '#ff7a1f', scarfDark: '#e0601a', pack: '#3a2420', stripe: '#ffd34d', glow: '#ff7a1f' });
}
