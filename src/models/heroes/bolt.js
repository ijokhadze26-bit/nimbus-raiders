// bolt rig. FOUNDATION STUB (owned by the HEROES builder): a recoloured, rescaled Pip. The final rig follows
// SPEC2 §3 for 'bolt' and the contract in ./index.js; it must keep the export name buildBolt.
import { tintedPip } from './stub.js';

export function buildBolt() {
  return tintedPip('bolt', { helmet: '#ffd34d', visor: '#2fd6c8', visorDeep: '#1a9a90', suit: '#ffb21f', suitDark: '#4b5672', scarf: '#4b5672', scarfDark: '#3a4358', pack: '#4b5672', stripe: '#ffd34d', glow: '#fff6c4' });
}
