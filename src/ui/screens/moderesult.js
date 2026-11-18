// Result panels of the stage 5 mode runs (result.js picks these for mode 'bossrush' | 'daily' | 'chaos').
// Boss Rush: time + bosses beaten (+ best time / NEW BEST); Daily: score = squad x stars, first-clear bonus and
// the local top 10; Chaos: the modifiers, score + best, the chaos coin bonus. Buttons: PLAY AGAIN (RETRY = the
// same mode again; Chaos rolls new modifiers), MODES, HOME. The coin line keeps the .amt count-up of result.js.
import { icon } from '../icons.js';
import { fmt } from '../ui.js';
import { fmtTime, RUSH_COUNT } from '../../game/modes/bossrush.js';
import { twistLabel, TWISTS } from '../../game/modes/twists.js';
import { boardHtml } from './modes.js';

const tags = (ids) => `<div class="res-twists">${(ids || []).map((id) => `<span class="mc-tag">${icon((TWISTS[id] && TWISTS[id].ico) || 'star')}${twistLabel(id)}</span>`).join('')}</div>`;
const stars = () => `<div class="big-stars"><span class="bs bs1">${icon('star')}</span><span class="bs bs2">${icon('star')}</span><span class="bs bs3">${icon('star')}</span></div>`;
const btns = () => `<div class="res-btns">
    <button type="button" class="btn btn-gold btn-lg" data-act="retry">${icon('retry')}<span>PLAY AGAIN</span></button>
    <div class="btn-row">
      <button type="button" class="sq-btn btn-blue" data-act="modes" aria-label="Modes">${icon('star')}<span>MODES</span></button>
      <button type="button" class="sq-btn btn-blue" data-act="home" aria-label="Home">${icon('home')}<span>HOME</span></button>
    </div></div>`;
const coinLine = (extra = '') => `<div class="res-coins"><span class="coin-ico">${icon('coin')}</span><span class="num amt">+0</span>${extra}</div>`;
const heroTag = (a, heroDef) => (a.heroMul > 1 && a.hero && heroDef ? `<span class="bonus hero-bonus">${heroDef(a.hero).name.toUpperCase()} +${Math.round((a.heroMul - 1) * 100)}%</span>` : '');

export const MODE_RESULTS = new Set(['bossrush', 'daily', 'chaos']);

/** Panel HTML of a mode result (a = lastResult merged with lastAward). */
export function modeResultHtml(a, heroDef, save) {
  const win = !!a.win;
  if (a.mode === 'bossrush') {
    const beaten = a.beaten ?? 0;
    const best = a.newBest ? '<span class="new-best">NEW BEST!</span>' : a.best ? `${icon('trophy')} BEST ${fmtTime(a.best)}` : `${icon('trophy')} FINISH ALL ${RUSH_COUNT} FOR A BEST TIME`;
    return `${win ? '<div class="rays"></div>' : ''}
      <div class="panel panel-result mode-res ${win ? 'win' : 'lose'} pop">
        <div class="ribbon ${win ? 'ribbon-gold' : 'ribbon-red'}"><span>${win ? 'RUSH COMPLETE!' : 'SQUAD DOWN'}</span></div>
        <div class="res-level">BOSS RUSH</div>
        <div class="rush-big"><span class="rb-time num">${fmtTime(a.time || 0)}</span><span class="rb-k">TIME</span></div>
        <div class="rush-pips">${Array.from({ length: RUSH_COUNT }, (_, i) => `<i class="${i < beaten ? 'on' : ''}">${icon('skull')}</i>`).join('')}</div>
        <div class="res-stats">
          <div class="stat">${icon('skull')}<span class="num">${beaten}/${RUSH_COUNT}</span><small>BOSSES</small></div>
          <div class="stat">${icon('damage')}<span class="num">${fmt(a.kills ?? 0)}</span><small>KILLS</small></div>
        </div>
        <div class="d-best">${best}</div>
        ${coinLine(heroTag(a, heroDef))}
        ${btns()}
      </div>`;
  }
  const daily = a.mode === 'daily';
  const score = win ? `<div class="mode-score"><span class="ms-k">SCORE</span><span class="ms-v num">${fmt(a.score || 0)}</span><span class="ms-f">${a.squad ?? 0} SQUAD × ${a.stars ?? 1}★</span></div>`
    + `<div class="d-best">${a.newBest ? '<span class="new-best">NEW BEST!</span>' : `${icon('trophy')} BEST ${fmt(a.best || 0)}`}</div>` : '';
  const extra = (daily && a.first ? `<span class="bonus">DAILY +${fmt(a.bonus)}</span>` : '')
    + (!daily && a.chaosMul > 1 ? `<span class="bonus chaos-bonus">CHAOS x${a.chaosMul.toFixed(2).replace(/0$/, '')}</span>` : '') + heroTag(a, heroDef);
  return `${win ? '<div class="rays"></div>' : ''}
    <div class="panel panel-result mode-res ${win ? 'win' : 'lose'} m-${a.mode} pop">
      <div class="ribbon ${win ? 'ribbon-gold' : 'ribbon-red'}"><span>${win ? (daily ? 'DAILY CLEAR!' : 'CHAOS CLEAR!') : 'SQUAD DOWN'}</span></div>
      <div class="res-level">${a.levelName || (daily ? 'DAILY CHALLENGE' : 'CHAOS MODE')}</div>
      ${tags(a.twists)}
      ${win ? stars() : `<div class="lose-ico">${icon('heart')}<span class="crack"></span></div>`}
      ${score}
      ${coinLine(extra)}
      ${daily ? `<div class="res-board">${boardHtml(save, a.date, 3)}</div>` : ''}
      ${btns()}
    </div>`;
}
