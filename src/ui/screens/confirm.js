// Confirm dialog (modal): title, text, YES / NO. opts: { title, text, yes, no, danger, onYes, onNo }.
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';

export function createConfirm(ui) {
  const root = screenEl('confirm', 'dim-screen');
  root.innerHTML = `
    <div class="panel panel-confirm pop">
      <div class="confirm-ico">${icon('retry')}</div>
      <div class="confirm-title"></div>
      <div class="confirm-text"></div>
      <div class="btn-row">
        <button type="button" class="btn btn-md btn-blue" data-act="no"></button>
        <button type="button" class="btn btn-md btn-red" data-act="yes"></button>
      </div>
    </div>`;
  const t = root.querySelector('.confirm-title');
  const x = root.querySelector('.confirm-text');
  const yes = root.querySelector('[data-act="yes"]');
  const no = root.querySelector('[data-act="no"]');
  let opts = {};
  const close = () => ui.closeModal('confirm');
  return {
    el: root,
    show(o = {}) {
      opts = o;
      t.textContent = o.title || 'ARE YOU SURE?';
      x.textContent = o.text || '';
      yes.textContent = o.yes || 'YES';
      no.textContent = o.no || 'NO';
      yes.className = `btn btn-md ${o.danger ? 'btn-red' : 'btn-green'}`;
    },
    onAct(act) {
      close();
      if (act === 'yes') opts.onYes?.(); else opts.onNo?.();
    },
    onBack() { close(); opts.onNo?.(); },
  };
}
