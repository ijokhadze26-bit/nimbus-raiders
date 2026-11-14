// Daily reward (modal): 7 day tiles, today's tile glows; claim once per local date, a missed day
// restarts the streak at day 1 (rules in save/progress.js). Day 7 adds a random skin.
import { screenEl, fmt, bump, wait } from '../ui.js';
import { icon } from '../icons.js';
import { DAILY } from '../../data/shop.js';
import { claimDaily, dailyStatus, skinById } from '../../save/progress.js';

export function createDaily(ui) {
  const root = screenEl('daily', 'dim-screen');
  root.innerHTML = `
    <div class="panel panel-daily pop">
      <div class="ribbon ribbon-gold"><span>DAILY REWARD</span></div>
      <button type="button" class="ibtn ibtn-red close-x" data-act="close" aria-label="Close">${icon('close')}</button>
      <div class="daily-sub"></div>
      <div class="daily-grid">${DAILY.map((c, i) => `<div class="dtile ${i === 6 ? 'big' : ''}" data-day="${i + 1}">
          <div class="dday">DAY ${i + 1}</div>
          <div class="dprize">${i === 6 ? `${icon('gift')}` : ''}${icon('coin')}</div>
          <div class="damt num">${fmt(c)}</div>
          <div class="dcheck">${icon('check')}</div>
        </div>`).join('')}</div>
      <div class="daily-msg"></div>
      <button type="button" class="btn btn-gold btn-lg claim-btn" data-act="claim"><span>CLAIM</span></button>
    </div>`;
  const sub = root.querySelector('.daily-sub');
  const msg = root.querySelector('.daily-msg');
  const claimBtn = root.querySelector('.claim-btn');
  const tiles = [...root.querySelectorAll('.dtile')];
  let busy = false;
  let closeToken = 0; // bumped on show/close so a pending auto-close never closes a reopened panel

  function sync() {
    const st = dailyStatus(ui.save);
    // tiles before the current day were claimed in this streak; today's is claimable (or claimed)
    tiles.forEach((t, i) => {
      const day = i + 1;
      t.classList.toggle('claimed', day < st.day || (st.claimedToday && day === st.day));
      t.classList.toggle('today', day === st.day && st.available);
    });
    sub.textContent = st.available ? (st.reset ? 'Streak restarted - come back every day!' : `Day ${st.day} of your streak`) : 'Come back tomorrow for more!';
    claimBtn.classList.toggle('is-disabled', !st.available);
    claimBtn.classList.toggle('btn-grey', !st.available);
    claimBtn.classList.toggle('btn-gold', st.available);
    claimBtn.querySelector('span').textContent = st.available ? 'CLAIM' : 'CLAIMED';
    msg.textContent = '';
  }

  async function claim() {
    if (busy) return;
    const res = claimDaily(ui.save);
    if (!res) return;
    busy = true;
    const t = tiles[res.day - 1];
    t.classList.remove('today');
    t.classList.add('claimed');
    bump(t, 'got');
    ui.sfx('daily');
    ui.vibrate(30);
    msg.innerHTML = `${icon('coin')} +${fmt(res.coins)}${res.skin ? ` &middot; ${skinById(res.skin)?.name || 'Skin'} unlocked!` : ''}`;
    msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show');
    claimBtn.classList.add('is-disabled', 'btn-grey');
    claimBtn.classList.remove('btn-gold');
    claimBtn.querySelector('span').textContent = 'COLLECTED!';
    ui.screens.title.refreshDaily?.();
    const my = ++closeToken;
    await wait(1300);
    if (my !== closeToken) return;
    busy = false;
    ui.closeModal('daily');
  }

  return {
    el: root,
    available: () => dailyStatus(ui.save).available,
    show() { closeToken++; busy = false; sync(); },
    onAct(act) {
      if (act === 'close') { closeToken++; ui.closeModal('daily'); }
      else if (act === 'claim') claim();
    },
    onBack() { closeToken++; ui.closeModal('daily'); },
  };
}
