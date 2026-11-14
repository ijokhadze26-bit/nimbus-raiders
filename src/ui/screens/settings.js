// Settings: music, sound, vibration toggles, quality Auto/High/Low (-> renderer), reset progress (confirm).
// Opens as a page from the title (state 'settings') or as a modal over the pause menu.
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';

const ROWS = [
  ['music', 'Music', 'music'],
  ['sfx', 'Sound', 'sound'],
  ['vibration', 'Vibration', 'vibration'],
];

export function createSettings(ui) {
  const root = screenEl('settings', 'dim-screen');
  root.innerHTML = `
    <div class="panel panel-settings pop">
      <div class="ribbon ribbon-blue"><span>SETTINGS</span></div>
      <button type="button" class="ibtn ibtn-red close-x" data-act="close" aria-label="Close">${icon('close')}</button>
      <div class="set-rows">
        ${ROWS.map(([k, label, ic]) => `<div class="set-row">
          <span class="set-ico">${icon(ic)}</span><span class="set-label">${label}</span>
          <button type="button" class="switch" data-act="toggle" data-key="${k}" role="switch"><span class="knob"></span><span class="on">ON</span><span class="off">OFF</span></button>
        </div>`).join('')}
        <div class="set-row set-quality">
          <span class="set-ico">${icon('quality')}</span><span class="set-label">Graphics</span>
          <div class="seg">${['auto', 'high', 'low'].map((q) => `<button type="button" data-act="quality" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div>
        </div>
      </div>
      <button type="button" class="btn btn-red btn-md reset-btn" data-act="reset">${icon('retry')}<span>RESET PROGRESS</span></button>
      <div class="set-foot">NIMBUS RAIDERS &middot; v1.0</div>
    </div>`;
  let modal = false;

  function sync() {
    const st = ui.save.data.settings;
    const a = ui.audio();
    const val = { music: a?.isMusic ? a.isMusic() : st.music, sfx: a?.isSfx ? a.isSfx() : st.sfx, vibration: st.vibration };
    for (const b of root.querySelectorAll('.switch')) {
      const on = !!val[b.dataset.key];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of root.querySelectorAll('[data-q]')) b.classList.toggle('on', b.dataset.q === st.quality);
  }

  function close() {
    if (modal) ui.closeModal('settings');
    else ui.nav('title');
  }

  return {
    el: root,
    show(opts) {
      modal = !!opts?.modal;
      sync();
    },
    onAct(act, btn) {
      const save = ui.save;
      if (act === 'close') close();
      else if (act === 'toggle') {
        const k = btn.dataset.key;
        const st = save.data.settings;
        const a = ui.audio();
        const cur = k === 'music' ? (a?.isMusic ? a.isMusic() : st.music) : k === 'sfx' ? (a?.isSfx ? a.isSfx() : st.sfx) : st[k];
        const on = !cur;
        try { if (k === 'music') a?.setMusic?.(on); if (k === 'sfx') a?.setSfx?.(on); } catch { /* optional */ }
        save.setSetting(k, on);
        if (k === 'vibration' && on) ui.vibrate(30);
        sync();
      } else if (act === 'quality') {
        save.setSetting('quality', btn.dataset.q);
        ui.setQuality(btn.dataset.q);
        sync();
      } else if (act === 'reset') {
        ui.confirm({
          title: 'RESET PROGRESS?',
          text: 'All coins, stars, upgrades and skins will be lost. This cannot be undone.',
          yes: 'RESET', no: 'CANCEL', danger: true,
          onYes: () => { save.reset(); ui.applySettings(); ui.refreshCoins(true); ui.screens.title.refreshDaily?.(); },
        });
      }
    },
    onBack() { close(); },
  };
}
