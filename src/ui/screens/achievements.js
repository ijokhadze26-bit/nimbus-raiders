// ACHIEVEMENTS page (update 3 stage 5, STAGE5.md C): every visible goal grouped (campaign / combat / heroes & gear /
// modes & habits) as a card with its icon, text, a progress bar ("350 / 1,000") and the coin reward; finished goals
// show a gold CLAIM button (pays the reward, coin pill counts up), claimed ones a green tick. A summary strip on top
// shows done / total and CLAIM ALL. Opened from the title's trophy button (badge = unclaimed count).
import '../achievements.css';
import { screenEl, coinPill, bump, fmt } from '../ui.js';
import { icon } from '../icons.js';
import { ACH_GROUPS } from '../../data/achievements.js';

const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : fmt(n));

function cardHtml(s) {
  const { def, value, done, claimed } = s;
  const f = Math.max(0, Math.min(1, value / def.goal));
  const state = claimed ? 'is-claimed' : done ? 'is-done' : '';
  const act = claimed ? `<span class="ach-got" aria-label="Claimed">${icon('check')}</span>`
    : done ? `<button type="button" class="btn btn-gold btn-sm ach-claim" data-act="claim" data-id="${def.id}">${icon('coin')}<span>${fmt(def.reward)}</span></button>`
      : `<span class="ach-reward">${icon('coin')}<span>${fmt(def.reward)}</span></span>`;
  return `<div class="ach-card ${state}" data-id="${def.id}">
    <span class="ach-ico">${icon(def.icon)}</span>
    <span class="ach-info"><span class="ach-name">${def.name}</span><span class="ach-text">${def.text}</span>
      <span class="ach-bar"><i style="width:${(f * 100).toFixed(1)}%"></i><b>${def.goal > 1 ? `${short(value)} / ${short(def.goal)}` : done ? 'DONE!' : 'NOT YET'}</b></span></span>
    <span class="ach-act">${act}</span></div>`;
}

export function createAchievements(ui) {
  const root = screenEl('achievements');
  root.innerHTML = `
    <div class="menu-bg ach-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-gold">${icon('trophy')}<span>ACHIEVEMENTS</span></div>
      ${coinPill()}
    </div>
    <div class="ach-sum">
      <span class="ach-count"><b class="n">0</b><small>/ 0 DONE</small></span>
      <span class="ach-total"><i><i></i></i></span>
      <button type="button" class="btn btn-gold btn-sm ach-all" data-act="claimall">${icon('gift')}<span>CLAIM ALL</span></button>
    </div>
    <div class="ach-body"><div class="ach-list"></div></div>`;
  const list = root.querySelector('.ach-list'), body = root.querySelector('.ach-body');
  const countN = root.querySelector('.ach-count .n'), countT = root.querySelector('.ach-count small');
  const totalFill = root.querySelector('.ach-total i i'), allBtn = root.querySelector('.ach-all');
  const tracker = () => ui.game.achievements;

  function render() {
    const A = tracker();
    if (!A) { list.innerHTML = ''; return; }
    A.check();
    const st = A.status();
    // finished-but-unclaimed first inside each group, then in progress, claimed last
    const rank = (s) => (s.done && !s.claimed ? 0 : s.done ? 2 : 1);
    list.innerHTML = ACH_GROUPS.map((g) => {
      const items = st.filter((s) => s.def.group === g.id).sort((a, b) => rank(a) - rank(b));
      if (!items.length) return '';
      const n = items.filter((s) => s.done).length;
      return `<div class="ach-group"><span>${g.name}</span><small>${n} / ${items.length}</small></div>${items.map(cardHtml).join('')}`;
    }).join('');
    const done = st.filter((s) => s.done).length;
    countN.textContent = done;
    countT.textContent = `/ ${st.length} DONE`;
    totalFill.style.width = `${st.length ? (100 * done) / st.length : 0}%`;
    const open = A.unclaimed();
    allBtn.hidden = open < 2;
  }

  function claim(id) {
    const coins = tracker()?.claim(id) || 0;
    if (!coins) return 0;
    ui.sfx('purchase');
    ui.vibrate(25);
    return coins;
  }

  return {
    el: root,
    show() { render(); body.scrollTop = 0; ui.refreshCoins(true); },
    onAct(act, btn) {
      if (act === 'back') ui.nav('title');
      else if (act === 'claim') {
        if (!claim(btn.dataset.id)) return;
        const y = body.scrollTop;
        render();
        body.scrollTop = y;
        const card = list.querySelector(`[data-id="${btn.dataset.id}"]`);
        if (card) bump(card, 'claimed-pop');
      } else if (act === 'claimall') {
        const A = tracker();
        if (!A) return;
        let n = 0;
        for (const s of A.status()) if (s.done && !s.claimed) n += A.claim(s.def.id);
        if (n) { ui.sfx('purchase'); ui.vibrate(30); render(); }
      }
    },
    onBack() { ui.nav('title'); },
  };
}
