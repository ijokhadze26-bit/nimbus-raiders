// Result screens. Win: stars pop in one by one, coins count up, NEXT / RETRY / HOME.
// Lose: 'SQUAD DOWN', distance reached (% of the level or metres in endless), coins, RETRY / HOME.
// Update 2: NEXT opens the pre-level LOADOUT; a level win that unlocks a weapon / hero shows one card each
// (INFO opens its page); Bonbon's coin bonus gets its own tag; a TRY IT practice run ends on 'PRACTICE DONE'
// with TRY AGAIN and BACK (to the Armory / Heroes item it came from).
// Update 3 stage 3: an ELITE run says so (purple ELITE CLEAR! ribbon + glow, purple stars = the elite stars,
// an ELITE x2 tag on the coins; a loss shows the ELITE tag under the level).
// Update 3 stage 5: the run's modifiers (tags + their coin bonus; ONE LIFE says why a run ended) under the coins.
import { screenEl, countTo, bump, wait, fmt } from '../ui.js';
import { icon } from '../icons.js';
import { getLevel } from '../../data/levels.js';
import { coinMul } from '../../save/progress.js';
import { weaponDef } from '../../data/weapons.js';
import { heroDef } from '../../data/heroes.js';
import { weaponIcon, heroIcon } from '../icons2.js';
import { mkLabel } from '../infofmt.js';
import { ELITE_BADGE } from '../elite.js';
import { MODE_RESULTS, modeResultHtml } from './moderesult.js';
import { modsResultHtml } from '../modsui.js';

const eliteTag = () => `<div class="res-elite-tag">${ELITE_BADGE}<span>ELITE</span></div>`;

const TIPS = [
  'Shoot red gates to turn them blue before you pass!',
  'Barrels hide new weapons - blast them open.',
  'Watch the red circles: step out before the boss strikes.',
  'Upgrade your Starting Squad in the shop.',
  'Bigger squads fire more bullets. Grow fast!',
  'Fizzbombs explode - pop them early to clear the horde.',
];

export function createResult(ui) {
  const root = screenEl('result', 'dim-screen');
  root.innerHTML = '<div class="result-wrap"></div>';
  const wrap = root.querySelector('.result-wrap');
  let token = 0;
  let shownFor = null; // { levelId, done } for the result on screen: NEXT acts once, for that level

  // the shop Coin Bonus did not pay on a NO UPGRADES run (save/progress.js coinMul)
  const shopBonus = (a) => (a.mods && a.mods.includes('noUpgrades') ? 1 : coinMul(ui.save));

  function winHtml(a) {
    const endless = a.mode === 'endless';
    const next = !endless && !!getLevel(a.levelId + 1);
    const bonus = (a.elite ? '<span class="bonus elite-bonus">ELITE x2</span>' : '')
      + (shopBonus(a) > 1 ? `<span class="bonus">+${Math.round((shopBonus(a) - 1) * 100)}% BONUS</span>` : '') + heroBonus(a);
    const tag = a.galaxy ? '<div class="unlock-tag legendary">GALAXY SKIN UNLOCKED!</div>'
      : a.unlocked ? `<div class="unlock-tag">LEVEL ${a.unlocked} UNLOCKED!</div>` : '';
    return `
      <div class="rays"></div>
      <div class="panel panel-result win pop${a.elite ? ' elite' : ''}">
        <div class="ribbon ${a.elite ? 'ribbon-elite' : 'ribbon-gold'}"><span>${endless ? 'BOSS DOWN!' : a.elite ? 'ELITE CLEAR!' : 'LEVEL CLEAR!'}</span></div>
        <div class="res-level">${endless ? 'ENDLESS' : `LEVEL ${a.levelId}${getLevel(a.levelId)?.name ? ' · ' + getLevel(a.levelId).name : ''}`}</div>
        ${a.elite ? eliteTag() : ''}
        ${endless ? '' : `<div class="big-stars">
          <span class="bs bs1">${icon('star')}</span><span class="bs bs2">${icon('star')}</span><span class="bs bs3">${icon('star')}</span>
        </div>`}
        <div class="res-stats">
          <div class="stat">${icon('squad')}<span class="num">${a.squad ?? 0}</span><small>SQUAD</small></div>
          <div class="stat">${icon('damage')}<span class="num">${fmt(a.kills ?? 0)}</span><small>KILLS</small></div>
        </div>
        <div class="res-coins"><span class="coin-ico">${icon('coin')}</span><span class="num amt">+0</span>${bonus}</div>
        ${modsResultHtml(a)}
        ${tag}
        ${cardsHtml(a.newItems)}
        <div class="res-btns">
          ${endless ? `<button type="button" class="btn btn-gold btn-lg" data-act="retry">${icon('retry')}<span>PLAY AGAIN</span></button>`
    : next ? `<button type="button" class="btn btn-gold btn-lg" data-act="next"><span>NEXT</span><span class="play-ico">${icon('play')}</span></button>`
      : `<button type="button" class="btn btn-gold btn-lg" data-act="map">${icon('map')}<span>MAP</span></button>`}
          <div class="btn-row">
            ${endless ? `<button type="button" class="sq-btn btn-blue" data-act="map" aria-label="Map">${icon('map')}<span>MAP</span></button>`
    : `<button type="button" class="sq-btn btn-blue" data-act="retry" aria-label="Retry">${icon('retry')}<span>RETRY</span></button>`}
            <button type="button" class="sq-btn btn-blue" data-act="home" aria-label="Home">${icon('home')}<span>HOME</span></button>
          </div>
        </div>
      </div>`;
  }

  function loseHtml(a) {
    const endless = a.mode === 'endless';
    const pct = a.length ? Math.max(0, Math.min(100, Math.round((a.dist / a.length) * 100))) : 0;
    const dist = endless
      ? `<div class="res-dist endless"><div class="d-big num">${fmt(a.dist)}<small>m</small></div>
          <div class="d-best">${a.newBest ? '<span class="new-best">NEW BEST!</span>' : `${icon('trophy')} BEST ${fmt(a.best)} m`}</div></div>`
      : a.bossMax ? bossHtml(a)
      : `<div class="res-dist"><div class="d-label">DISTANCE <b class="num">${pct}%</b></div>
          <div class="d-track"><i style="--p:${pct}%"></i><span class="d-pip" style="left:${pct}%"></span><span class="d-skull">${icon('skull')}</span></div></div>`;
    const tip = a.bossMax ? TIPS[2] : TIPS[Math.floor(Math.random() * TIPS.length)];
    return `
      <div class="panel panel-result lose pop">
        <div class="ribbon ribbon-red"><span>SQUAD DOWN</span></div>
        <div class="res-level">${endless ? 'ENDLESS RUN' : `LEVEL ${a.levelId}`}</div>
        ${a.elite ? eliteTag() : ''}
        <div class="lose-ico">${icon('heart')}<span class="crack"></span></div>
        ${dist}
        <div class="res-coins"><span class="coin-ico">${icon('coin')}</span><span class="num amt">+0</span>${heroBonus(a)}</div>
        ${modsResultHtml(a)}
        <div class="tip">${tip}</div>
        <div class="res-btns">
          <button type="button" class="btn btn-gold btn-lg" data-act="retry">${icon('retry')}<span>RETRY</span></button>
          <div class="btn-row">
            <button type="button" class="sq-btn btn-blue" data-act="map" aria-label="Map">${icon('map')}<span>MAP</span></button>
            <button type="button" class="sq-btn btn-blue" data-act="home" aria-label="Home">${icon('home')}<span>HOME</span></button>
          </div>
        </div>
      </div>`;
  }

  /** Bonbon's Sweet Tooth (+25% coins): its own tag next to the shop bonus. */
  function heroBonus(a) {
    return a.heroMul > 1 && a.hero ? `<span class="bonus hero-bonus">${heroDef(a.hero).name.toUpperCase()} +${Math.round((a.heroMul - 1) * 100)}%</span>` : '';
  }

  /** One card per weapon / hero this win unlocked (unlocks.newlyUnlocked via the save layer). */
  function cardsHtml(items) {
    if (!items || !items.length) return '';
    return `<div class="unlock-cards">${items.map((it) => {
      const w = it.kind === 'weapon';
      const name = (w ? weaponDef(it.id) : heroDef(it.id)).name.toUpperCase();
      return `<div class="ucard ${w ? 'w' : 'h'}"><span class="ucard-ico">${w ? weaponIcon(it.id) : heroIcon(it.id)}</span>`
        + `<span class="ucard-t"><span class="ucard-k">${w ? 'NEW WEAPON UNLOCKED: ' : 'NEW HERO: '}</span><b>${name}</b></span>`
        + `<button type="button" class="btn btn-blue ucard-b" data-act="info" data-kind="${it.kind}" data-id="${it.id}">INFO</button></div>`;
    }).join('')}</div>`;
  }

  /** TRY IT practice: no payout, just the outcome and the way back. */
  function practiceHtml(a, r) {
    const run = ui.game.runOpts || {};
    const w = weaponDef(run.weapon || r?.weapon), h = heroDef(run.hero || r?.hero);
    return `
      <div class="panel panel-result practice pop">
        <div class="ribbon ${a.win ? 'ribbon-gold' : 'ribbon-blue'}"><span>PRACTICE DONE</span></div>
        <div class="res-level">${h.name} + ${w.name} · ${mkLabel(run.mk || 3)}</div>
        <div class="prac-ico"><span>${heroIcon(h.id)}</span><span>${weaponIcon(w.id)}</span></div>
        <div class="res-stats">
          <div class="stat">${icon('damage')}<span class="num">${fmt(a.kills ?? 0)}</span><small>KILLS</small></div>
          <div class="stat">${icon(a.win ? 'trophy' : 'skull')}<span class="num">${a.win ? 'WON' : 'LOST'}</span><small>BOSS</small></div>
        </div>
        <div class="tip">Practice never costs or pays coins. Try another weapon or hero!</div>
        <div class="res-btns">
          <button type="button" class="btn btn-gold btn-lg" data-act="retry">${icon('retry')}<span>TRY AGAIN</span></button>
          <div class="btn-row"><button type="button" class="btn btn-blue btn-md" data-act="practice-back">${icon('back')}<span>BACK</span></button></div>
        </div>
      </div>`;
  }

  /** Lost at the boss: how much hp it had left (a near-win reads as one: 'SO CLOSE!'). */
  function bossHtml(a) {
    const left = Math.max(1, Math.min(100, Math.ceil((a.bossHp / a.bossMax) * 100)));
    const close = left <= 25;
    return `<div class="res-dist res-boss">
        ${close ? '<div class="so-close">SO CLOSE!</div>' : ''}
        <div class="d-label">${a.bossName || 'BOSS'} <b class="num">${left}%</b> HP LEFT</div>
        <div class="d-track boss-hp"><i style="--p:${Math.max(4, left)}%"></i><span class="d-skull">${icon('skull')}</span></div></div>`;
  }

  async function play(a, my) {
    const amt = wrap.querySelector('.amt');
    if (a.win) {
      const stars = wrap.querySelectorAll('.bs');
      await wait(420);
      for (let i = 0; i < stars.length; i++) {
        if (my !== token) return;
        if (i < a.stars) {
          stars[i].classList.add('on');
          ui.sfx('star', { index: i });
          ui.vibrate(18);
        } else stars[i].classList.add('dim');
        await wait(330);
      }
    } else await wait(450);
    if (my !== token || !amt) return;
    ui.sfx('coin');
    await countTo(amt, 0, a.coins || 0, Math.min(1100, 400 + (a.coins || 0) * 3), '+');
    if (my !== token) return;
    bump(amt.parentNode, 'bump');
    const tag = wrap.querySelector('.unlock-tag');
    if (tag) tag.classList.add('show');
  }

  return {
    el: root,
    show() {
      const g = ui.game;
      const r = g.lastResult || {};
      // payout from the save layer (coin bonus applied); falls back to the game's own result
      const a = { ...r, ...(g.lastAward && g.lastAward.win === r.win ? g.lastAward : {}) };
      if (a.length == null) a.length = g.run?.length || 0;
      token++;
      shownFor = { levelId: a.levelId || 0, done: false };
      const practice = a.mode === 'practice';
      wrap.innerHTML = practice ? practiceHtml(a, g.run) : MODE_RESULTS.has(a.mode) ? modeResultHtml(a, heroDef, ui.save.data) : a.win ? winHtml(a) : loseHtml(a); // stage 5 modes
      root.classList.toggle('is-win', !!a.win && !practice);
      if (practice) ui.sfx(a.win ? 'star' : 'coin', { index: 2 }); else play(a, token);
      ui.refreshCoins(true);
    },
    hide() { token++; },
    onAct(act, btn) {
      const g = ui.game;
      if (act === 'next') {
        if (!shownFor || shownFor.done) return;
        shownFor.done = true;
        const id = shownFor.levelId + 1;
        if (!getLevel(id) || id > ui.save.data.unlockedLevel) ui.nav('map');
        else ui.nav('loadout', { levelId: id });
      } else if (act === 'retry' && g.lastResult?.mode === 'chaos') ui.nav('loadout', { mode: 'chaos', roll: g.modes.nextRoll() }); // new modifiers shown before the start
      else if (act === 'retry') g.retry();
      else if (act === 'practice-back') { const p = g.practiceReturn || { screen: 'armory', opts: {} }; ui.nav(p.screen, p.opts); }
      else if (act === 'info') ui.nav(btn.dataset.kind === 'hero' ? 'heroes' : 'armory', { from: 'result', [btn.dataset.kind]: btn.dataset.id });
      else if (act === 'home') ui.nav('title');
      else if (act === 'map') ui.nav('map');
      else if (act === 'modes') ui.nav('modes');
    },
    onBack() {
      if (ui.game.lastResult?.mode === 'practice') { const p = ui.game.practiceReturn || { screen: 'armory', opts: {} }; ui.nav(p.screen, p.opts); } else ui.nav('title');
    },
  };
}
