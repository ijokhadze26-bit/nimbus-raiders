// MODES (stage 5): four cards next to the campaign - ENDLESS (world pick), BOSS RUSH, DAILY CHALLENGE (today's
// level + twist, first-clear bonus, the local top-10 leaderboard below the cards) and CHAOS MODE (2-3 random
// modifiers, rolled once and kept until that run is played: backing out never re-rolls). Locked cards say what opens them (Boss Rush: beat L10, Chaos: beat L20).
// Cards lead to the LOADOUT screen ({ mode }) like a level; Endless goes to its world pick first.
import { screenEl, coinPill, fmt, bump } from '../ui.js';
import { icon } from '../icons.js';
import { getLevel } from '../../data/levels.js';
import { WORLDS, isWorldUnlocked } from '../../data/worlds.js';
import { BOSS_RUSH, bossRushOpen, fmtTime, RUSH_COUNT } from '../../game/modes/bossrush.js';
import { DAILY, dailyPlan, dailyBoard, dailyDone } from '../../game/modes/daily.js';
import { CHAOS, chaosOpen } from '../../game/modes/chaos.js';
import { twistLabel, TWISTS } from '../../game/modes/twists.js';
import { endlessBestOf } from '../../save/modes.js';
import '../modes.css';

const lockHtml = (text) => `<span class="mc-lock">${icon('lock')}<span>${text}</span></span>`; // 'BEAT LEVEL 10'

/** "Nov 17" from 'YYYY-MM-DD'. */
export function shortDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y) return key;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Leaderboard rows (today's row marked). */
export function boardHtml(save, today, n = DAILY.top) {
  const rows = dailyBoard(save, n);
  if (!rows.length) return '<div class="lb-empty">No scores yet - clear a Daily Challenge!</div>';
  return `<ol class="lb">${rows.map((r, i) => `<li class="${r.date === today ? 'me' : ''}"><span class="lb-r num">${i + 1}</span>`
    + `<span class="lb-d">${shortDate(r.date)}${r.date === today ? ' <i>TODAY</i>' : ''}</span><span class="lb-s num">${fmt(r.score)}</span></li>`).join('')}</ol>`;
}

export function createModes(ui) {
  const el = screenEl('modes');
  el.innerHTML = `
    <div class="menu-bg modes-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple">${icon('star')}<span>MODES</span></div>
      ${coinPill()}
    </div>
    <div class="modes-scroll"><div class="modes-list"></div>
      <div class="panel lb-panel"><div class="ribbon ribbon-gold"><span>DAILY TOP 10</span></div><div class="lb-body"></div></div>
    </div>`;
  const list = el.querySelector('.modes-list'), lb = el.querySelector('.lb-body');

  function card(id, color, ico, title, text, stat, locked) {
    return `<button type="button" class="mode-card mc-${color}${locked ? ' locked' : ''}" data-act="${id}">`
      + `<span class="mc-ico">${icon(ico)}</span><span class="mc-body"><span class="mc-title">${title}</span>`
      + `<span class="mc-text">${text}</span>${stat ? `<span class="mc-stat">${stat}</span>` : ''}</span>`
      + (locked ? lockHtml(locked) : `<span class="mc-go">${icon('play')}</span>`) + '</button>';
  }

  function render() {
    const d = ui.save.data;
    const worlds = WORLDS.filter((w) => isWorldUnlocked(d, w.id)).length;
    const bestEndless = Math.max(...WORLDS.map((w) => endlessBestOf(d, w.id)));
    const plan = dailyPlan(d), L = getLevel(plan.levelId), done = dailyDone(d, plan.date);
    const tw = TWISTS[plan.twist];
    const rb = d.modes.bossRushBest | 0;
    list.innerHTML = [
      card('endless', 'purple', 'infinity', 'ENDLESS', `${worlds} of ${WORLDS.length} worlds open · bosses every 700 m`,
        `${icon('trophy')}BEST ${fmt(bestEndless)} m`, ''),
      card('bossrush', 'red', 'skull', 'BOSS RUSH', `All ${RUSH_COUNT} bosses back to back, against the clock`,
        rb ? `${icon('trophy')}BEST ${fmtTime(rb / 1000)}` : `${icon('coin')}COINS FOR EVERY BOSS`, bossRushOpen(d) ? '' : `BEAT LEVEL ${BOSS_RUSH.unlockLevel}`),
      card('daily', 'gold', 'gift', 'DAILY CHALLENGE', `LV ${L.id} ${L.name} · <b class="tw">${icon(tw.ico)}${twistLabel(plan.twist)}</b>`,
        done ? `${icon('check')}DONE TODAY · ${fmt(d.modes.dailyBest[plan.date])}` : `${icon('coin')}FIRST CLEAR TODAY +${DAILY.bonus}`, ''),
      card('chaos', 'green', 'bolt', 'CHAOS MODE', '2-3 random modifiers every run', d.modes.chaosBest ? `${icon('trophy')}BEST ${fmt(d.modes.chaosBest)}` : `${icon('coin')}+${Math.round(CHAOS.bonus * 100)}% COINS PER MODIFIER`,
        chaosOpen(d) ? '' : `BEAT LEVEL ${CHAOS.unlockLevel}`),
    ].join('');
    lb.innerHTML = boardHtml(d, plan.date);
  }

  return {
    el,
    show() { ui.refreshCoins(true); render(); },
    onAct(act, btn) {
      const d = ui.save.data;
      if (act === 'back') { ui.nav('title'); return; }
      if (btn && btn.classList.contains('locked')) { bump(btn); ui.vibrate(30); return; }
      if (act === 'endless') ui.nav('endless');
      else if (act === 'bossrush' && bossRushOpen(d)) ui.nav('loadout', { mode: 'bossrush' });
      else if (act === 'daily') ui.nav('loadout', { mode: 'daily' });
      else if (act === 'chaos' && chaosOpen(d)) ui.nav('loadout', { mode: 'chaos', roll: ui.game.modes.nextRoll() });
    },
    onBack() { ui.nav('title'); },
  };
}

/**
 * LOADOUT header of a mode run (opts.mode 'endless' | 'bossrush' | 'daily' | 'chaos'): { title, html }.
 * Chaos: takes the pending roll when the opts have none yet (e.g. back from the Heroes page).
 */
export function modeHeader(opts, ui) {
  const d = ui.save.data, m = opts.mode;
  const tags = (ids) => `<span class="lo-twists">${ids.map((id) => `<span class="mc-tag">${icon((TWISTS[id] && TWISTS[id].ico) || 'star')}${twistLabel(id)}</span>`).join('')}</span>`;
  if (m === 'bossrush') {
    const rb = d.modes.bossRushBest | 0;
    return { title: 'BOSS RUSH', html: `<div class="lo-name">BOSS RUSH</div><div class="lo-sub">${icon('skull')}<span>${RUSH_COUNT} BOSSES · ${rb ? 'BEST ' + fmtTime(rb / 1000) : 'NO BEST TIME YET'}</span></div>` };
  }
  if (m === 'daily') {
    const p = dailyPlan(d), L = getLevel(p.levelId);
    return { title: 'DAILY', html: `<div class="lo-name">DAILY · ${L.name.toUpperCase()}</div><div class="lo-sub"><span>LV ${L.id} · ${shortDate(p.date)}</span>${tags([p.twist])}</div>` };
  }
  if (m === 'chaos') {
    if (!opts.roll) opts.roll = ui.game.modes.nextRoll();
    const L = getLevel(opts.roll.levelId);
    return { title: 'CHAOS', html: `<div class="lo-name">CHAOS · ${L.name.toUpperCase()}</div><div class="lo-sub chaos-sub">${tags(opts.roll.twists)}</div>` };
  }
  const w = opts.world || ui.game.endlessWorld || 1, W = WORLDS[w - 1] || WORLDS[0];
  return { title: 'ENDLESS', html: `<div class="lo-name">ENDLESS · ${W.name}</div><div class="lo-sub">${icon('trophy')}<span>BEST DISTANCE ${fmt(endlessBestOf(d, W.id))} m</span></div>` };
}
