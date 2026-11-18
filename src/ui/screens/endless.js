// Endless intro (stage 5: per world): pick an open world (its sky, enemies, music, hazards and bosses), see its
// best distance, PLAY (-> the LOADOUT screen, then game.startEndless(seed, world)). Back goes to MODES.
// Sky Bridge's best is the old save.endlessBest; worlds 2-5 keep save.modes.endlessBest[world].
import { screenEl, coinPill, fmt, bump } from '../ui.js';
import { icon } from '../icons.js';
import { WORLDS, isWorldUnlocked } from '../../data/worlds.js';
import { endlessBestOf } from '../../save/modes.js';

export function createEndless(ui) {
  const root = screenEl('endless');
  root.innerHTML = `
    <div class="menu-bg endless-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple">${icon('infinity')}<span>ENDLESS</span></div>
      ${coinPill()}
    </div>
    <div class="endless-body">
      <div class="endless-title">HOW FAR CAN<br>YOU RAID?</div>
      <div class="ew-row" role="toolbar" aria-label="World"></div>
      <div class="ew-name"></div>
      <div class="panel panel-best">
        <div class="best-label">${icon('trophy')} BEST DISTANCE</div>
        <div class="best-val num"><span class="bv">0</span><small>m</small></div>
      </div>
      <ul class="endless-points">
        <li>${icon('flag')}<span class="ew-blurb">The bridge never ends - it only gets harder</span></li>
        <li>${icon('skull')}<span class="ew-boss">A boss guards every 700 m</span></li>
        <li>${icon('coin')}<span>Earn coins for distance and kills</span></li>
      </ul>
    </div>
    <div class="map-footer">
      <button type="button" class="btn btn-purple btn-xl" data-act="play">
        <span class="play-ico">${icon('play')}</span><span class="col"><span class="big">PLAY</span><span class="sub ew-sub">ENDLESS RUN</span></span>
      </button>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const bv = $('.bv'), row = $('.ew-row'), name = $('.ew-name'), blurb = $('.ew-blurb'), bossLine = $('.ew-boss'), sub = $('.ew-sub');
  let world = 1;

  function render() {
    const d = ui.save.data;
    if (!isWorldUnlocked(d, world)) world = 1;
    row.innerHTML = WORLDS.map((w) => {
      const open = isWorldUnlocked(d, w.id);
      return `<button type="button" class="ew-chip${w.id === world ? ' sel' : ''}${open ? '' : ' locked'}" data-act="world" data-id="${w.id}" style="--wc:${w.color}" aria-label="${w.name}">`
        + `<span class="ew-n">${open ? w.id : icon('lock')}</span><span class="ew-s">${w.short.toUpperCase()}</span></button>`;
    }).join('');
    const W = WORLDS[world - 1];
    name.textContent = `WORLD ${W.id} · ${W.name}`;
    name.style.setProperty('--wc', W.color);
    blurb.textContent = world === 1 ? 'The bridge never ends - it only gets harder' : W.blurb;
    bossLine.textContent = world === 1 ? 'A boss guards every 700 m' : `${W.short} bosses guard every 700 m`;
    sub.textContent = world === 1 ? 'ENDLESS RUN' : W.short.toUpperCase() + ' RUN';
    bv.textContent = fmt(endlessBestOf(d, world));
  }

  return {
    el: root,
    show(o) { if (o && o.world) world = o.world; else world = ui.game.endlessWorld || world; render(); ui.refreshCoins(true); },
    onAct(act, btn) {
      if (act === 'back') ui.nav('modes');
      else if (act === 'world') {
        const id = Number(btn.dataset.id);
        if (!isWorldUnlocked(ui.save.data, id)) { bump(btn); ui.vibrate(30); return; }
        world = id; render();
      } else if (act === 'play') { ui.game.endlessWorld = world; ui.nav('loadout', { mode: 'endless', world }); }
    },
    onBack() { ui.nav('modes'); },
    /** Test hook: the world picked on screen. */
    world: () => world,
  };
}
