// COMPARE modal (SPEC2 §5). FOUNDATION STUB (owned by the UI builder): two items side by side as text.
// Opened with ui.openModal('compare', { kind: 'weapon' | 'hero', a, b }).
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';
import { weaponDef } from '../../data/weapons.js';
import { heroDef } from '../../data/heroes.js';
import '../info.css';

export function createCompare(ui) {
  const el = screenEl('compare', 'dim-screen');
  el.innerHTML = `<div class="panel panel-compare"><button type="button" class="ibtn ibtn-red close-x" data-act="close" aria-label="Close">${icon('close')}</button><div class="cmp-body"></div></div>`;
  const body = el.querySelector('.cmp-body');
  return {
    el,
    show(o = {}) {
      const get = o.kind === 'hero' ? heroDef : weaponDef;
      const a = get(o.a), b = get(o.b || o.a);
      body.innerHTML = `<div class="info-item"><h3>${a.name}</h3><p>${a.blurb}</p></div><div class="info-item"><h3>${b.name}</h3><p>${b.blurb}</p></div>`;
    },
    onAct(act) { if (act === 'close') ui.closeModal('compare'); },
    onBack() { ui.closeModal('compare'); },
  };
}
