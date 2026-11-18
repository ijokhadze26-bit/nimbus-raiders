// Settings: music + sound (mute switch and a live 0-100 volume slider each), haptics, ability button side
// (LEFT / RIGHT for left-handed play), colourblind gates, quality Auto/High/Low (-> renderer), reset progress
// (confirm). Opens as a page from the title (state 'settings') or as a modal over the pause menu.
// Update 3 stage 5: the switches still toggle mute (same as the title's music / sound buttons); the sliders set
// the volume (save.settings.musicVol / sfxVol, audio.setVolumes). HAPTICS is the old vibration switch.
import '../settings.css';
import { screenEl } from '../ui.js';
import { icon } from '../icons.js';
import { canVibrate } from '../../core/haptics.js';

const sw = (key) => `<button type="button" class="switch" data-act="toggle" data-key="${key}" role="switch"><span class="knob"></span><span class="on">ON</span><span class="off">OFF</span></button>`;
const vol = (key, label) => `<label class="set-vol"><input type="range" min="0" max="100" step="5" data-vol="${key}" aria-label="${label} volume"><output>80</output></label>`;
const HAND_SVG = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="currentColor"/><path d="M12 7.5v9M7.5 12h9" stroke="#2f8cff" stroke-width="2.6" stroke-linecap="round"/></svg>';
const EYE_SVG = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="currentColor"/><circle cx="12" cy="12" r="3.6" fill="#2f8cff"/></svg>';

export function createSettings(ui) {
  const root = screenEl('settings', 'dim-screen');
  root.innerHTML = `
    <div class="panel panel-settings pop">
      <div class="ribbon ribbon-blue"><span>SETTINGS</span></div>
      <button type="button" class="ibtn ibtn-red close-x" data-act="close" aria-label="Close">${icon('close')}</button>
      <div class="set-rows">
        <div class="set-row set-audio"><span class="set-ico">${icon('music')}</span><span class="set-label">Music</span>${sw('music')}${vol('music', 'Music')}</div>
        <div class="set-row set-audio"><span class="set-ico">${icon('sound')}</span><span class="set-label">Sound</span>${sw('sfx')}${vol('sfx', 'Sound')}</div>
        <div class="set-row"><span class="set-ico">${icon('vibration')}</span><span class="set-label">Haptics<small class="set-note no-vib">not on this device</small></span>${sw('haptics')}</div>
        <div class="set-row set-wrap">
          <span class="set-ico">${HAND_SVG}</span><span class="set-label">Action buttons</span>
          <div class="seg seg-hand"><button type="button" data-act="hand" data-side="left">${icon('back')} LEFT</button><button type="button" data-act="hand" data-side="right">RIGHT <span class="flip">${icon('back')}</span></button></div>
        </div>
        <div class="set-row set-wrap">
          <span class="set-ico">${EYE_SVG}</span><span class="set-label">Colourblind gates</span>${sw('colorblind')}
          <div class="cb-demo"><span class="cb-gate good"><b>▲</b>+5</span><span class="cb-gate bad"><b>▼</b>−3</span><small class="set-note">good = blue ▲ &nbsp;·&nbsp; bad = orange ▼ stripes</small></div>
        </div>
        <div class="set-row set-quality">
          <span class="set-ico">${icon('quality')}</span><span class="set-label">Graphics</span>
          <div class="seg">${['auto', 'high', 'low'].map((q) => `<button type="button" data-act="quality" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div>
        </div>
      </div>
      <button type="button" class="btn btn-red btn-md reset-btn" data-act="reset">${icon('retry')}<span>RESET PROGRESS</span></button>
      <div class="set-foot">NIMBUS RAIDERS &middot; v1.0</div>
    </div>`;
  let modal = false;
  const resetBtn = root.querySelector('.reset-btn');
  const cbDemo = root.querySelector('.cb-demo');
  root.querySelector('.no-vib').hidden = canVibrate();

  function audioOn(k) {
    const st = ui.save.data.settings, a = ui.audio();
    if (k === 'music') return a?.isMusic ? a.isMusic() : st.music;
    if (k === 'sfx') return a?.isSfx ? a.isSfx() : st.sfx;
    return st[k];
  }

  function sync() {
    const st = ui.save.data.settings;
    for (const b of root.querySelectorAll('.switch')) {
      const on = !!audioOn(b.dataset.key);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const r of root.querySelectorAll('[data-vol]')) {
      const v = Math.round((r.dataset.vol === 'music' ? st.musicVol : st.sfxVol) * 100);
      r.value = String(v);
      paint(r);
      r.closest('.set-vol').classList.toggle('muted', !audioOn(r.dataset.vol));
    }
    for (const b of root.querySelectorAll('[data-side]')) b.classList.toggle('on', b.dataset.side === st.abilitySide);
    for (const b of root.querySelectorAll('[data-q]')) b.classList.toggle('on', b.dataset.q === st.quality);
    cbDemo.classList.toggle('on', !!st.colorblind);
  }

  function paint(r) {
    r.style.setProperty('--v', `${r.value}%`);
    r.nextElementSibling.textContent = r.value;
  }

  /** Slider moved: live volume (input) + saved setting. */
  function onVolume(r, done) {
    const v = Math.max(0, Math.min(100, Number(r.value) || 0)) / 100;
    const k = r.dataset.vol === 'music' ? 'musicVol' : 'sfxVol';
    paint(r);
    try { ui.audio()?.setVolumes?.(k === 'musicVol' ? v : undefined, k === 'sfxVol' ? v : undefined); } catch { /* optional */ }
    if (ui.save.data.settings[k] !== v) ui.save.setSetting(k, v);
    if (done && k === 'sfxVol') ui.sfx('click');
  }
  for (const r of root.querySelectorAll('[data-vol]')) {
    r.addEventListener('input', () => onVolume(r, false));
    r.addEventListener('change', () => onVolume(r, true));
  }

  function close() {
    if (modal) ui.closeModal('settings');
    else ui.nav('title');
  }

  return {
    el: root,
    show(opts) {
      modal = !!opts?.modal;
      // over the pause menu a run is live: a reset there would be partly undone by the run's payout
      resetBtn.hidden = modal || ui.game.state === 'paused' || ui.game.state === 'playing';
      sync();
    },
    onAct(act, btn) {
      const save = ui.save;
      if (act === 'close') close();
      else if (act === 'toggle') {
        const k = btn.dataset.key;
        const a = ui.audio();
        const on = !audioOn(k);
        try { if (k === 'music') a?.setMusic?.(on); if (k === 'sfx') a?.setSfx?.(on); } catch { /* optional */ }
        save.setSetting(k, on);
        if (k === 'haptics' && on) ui.vibrate(30);
        sync();
      } else if (act === 'hand') {
        save.setSetting('abilitySide', btn.dataset.side === 'left' ? 'left' : 'right');
        sync();
      } else if (act === 'quality') {
        save.setSetting('quality', btn.dataset.q);
        ui.setQuality(btn.dataset.q);
        sync();
      } else if (act === 'reset' && !resetBtn.hidden) {
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
