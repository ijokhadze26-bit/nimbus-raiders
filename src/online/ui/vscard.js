// The VS card and the countdown of an online match (the moment at its end is vsmoment.js since stage 2).
// - From 'versus:start' until GO (link.clock() < 0, about 4 s) the run waits at the start line (versus.js) and this
//   card shows every player of the match (2-4): name, hero, weapon, Pip outfit and gun paint, in the seat colour of
//   their ghost. The middle reads VS, then 3 - 2 - 1 from the match clock, then GO! as the cards fly off.
//   A player who arrives after GO (late start, SPEC4 §5.2) gets no card, only the GO!.
// Pure DOM in the UI root, above the HUD and below the screens (so the LEAVE MATCH? dialog covers it); it never
// takes a tap. The countdown number is written only when it changes.
// Stage 4: under each name the league badge and the trophies: mine as my profile had them at 'versus:start' (before
// the stake), a rival's from their seat (a friend room too).
import { heroIcon, weaponIcon } from '../../ui/icons2.js';
import { heroDef } from '../../data/heroes.js';
import { weaponDef } from '../../data/weapons.js';
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../../data/skins.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { esc, up } from './vswords.js';
import { badgeHtml } from '../leagues.js';

const GO_MS = 800;        // how long GO! stays
const LATE = -0.3;        // a start this close to GO (or after it) skips the card

const div = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html != null) e.innerHTML = html; return e; };

/** One player's card: seat colour head with the name, then the hero and the weapon with their looks. */
export function playerCardHtml(p, me, tr = p.tr) {
  const hero = heroDef(p.hero), weapon = weaponDef(p.weapon);
  // Pip outfits recolour Pip only (game/loadout.js): another hero wears its own colours whatever is equipped
  const outfit = hero.id === 'pip' && p.heroSkin && p.heroSkin !== 'classic' ? HERO_BY_ID[p.heroSkin] : null;
  const paint = p.weaponSkin && p.weaponSkin !== 'factory' ? WEAPON_SKIN_BY_ID[p.weaponSkin] : null;
  const look = (name, color) => `<i class="vc-look"><u style="background:${color}"></u>${esc(name)}</i>`;
  return `<div class="vc-p${me ? ' me' : ''}" data-slot="${p.slot}" style="--sc:${SLOT_COLORS[p.slot % SLOT_COLORS.length]}">
      <div class="vc-head"><span class="vc-nb"><span class="vc-name">${esc(up(p.name))}</span>${typeof tr === 'number' && Number.isFinite(tr) ? `<span class="vc-tr">${badgeHtml(tr, 'sm')}<b class="num">${Math.max(0, Math.round(tr))}</b></span>` : ''}</span>${me ? '<span class="vc-you">YOU</span>' : ''}</div>
      <div class="vc-picks">
        <div class="vc-pick"><span class="vc-ico">${heroIcon(hero.id)}</span><span class="vc-t"><small>HERO</small><b>${esc(hero.name)}</b>${outfit ? look(outfit.name, outfit.pip.suit) : ''}</span></div>
        <div class="vc-pick"><span class="vc-ico">${weaponIcon(weapon.id)}</span><span class="vc-t"><small>WEAPON</small><b>${esc(weapon.name)}</b>${paint ? look(`${paint.name} paint`, paint.tiers ? paint.tiers[2].color : '#fff') : ''}</span></div>
      </div>
    </div>`;
}

export function mountVsCard(ctx) {
  const { game, ui } = ctx;
  const ev = game.events, root = ui.hud.root;
  const el = div('vs-card hidden');
  root.appendChild(el);
  let state = 'off', shown = null, midEl = null, goAt = 0, hideT = 0;

  function hide() {
    clearTimeout(hideT);
    if (state === 'off') return;
    state = 'off'; shown = null; midEl = null;
    el.className = 'vs-card hidden';
    el.innerHTML = '';
  }

  function show() {
    hide();
    const link = game.versus && game.versus.link;
    if (!link) return;
    const all = ctx.players(); // me first, then the rivals by seat
    const late = link.clock() >= LATE;
    const prof = ctx.flow && ctx.flow.session && ctx.flow.session.profile, myTr = prof ? Number(prof.tr) : null;
    el.className = `vs-card n${Math.max(2, Math.min(4, all.length))}${late ? ' late' : ''}`;
    el.innerHTML = `<div class="vc-players">${late ? '' : all.map((p, i) => playerCardHtml(p, i === 0, i === 0 ? myTr : Number(p.tr))).join('')}<div class="vc-mid"><span class="vc-num vs">${late ? '' : 'VS'}</span></div></div>`;
    midEl = el.querySelector('.vc-num');
    state = 'card'; shown = 'VS';
    update();
  }

  function setMid(text, cls) {
    if (!midEl || shown === text) return;
    shown = text;
    midEl.className = `vc-num ${cls}`;
    midEl.textContent = text;
    midEl.style.animation = 'none'; void midEl.offsetWidth; midEl.style.animation = ''; // (one write per second: restart the pop)
  }

  function go() {
    if (state === 'off' || state === 'go') return;
    state = 'go'; goAt = performance.now();
    el.classList.add('go');
    setMid('GO!', 'go');
    clearTimeout(hideT);
    hideT = setTimeout(hide, GO_MS + 200); // (update() hides it on time while frames run; this is the safety net)
  }

  function update() {
    if (state === 'off') return;
    if (state === 'go') { if (performance.now() - goAt >= GO_MS) hide(); return; }
    const link = game.versus && game.versus.link;
    if (!link || !game.versus.live) { hide(); return; }
    const c = link.clock();
    if (c >= 0) { go(); return; }
    const n = Math.ceil(-c);
    if (n <= 3) setMid(String(n), 'count');
  }

  ev.on('versus:start', show);
  ev.on('versus:go', go);
  ev.on('run:start', (p) => { if (p.mode !== 'versus') hide(); });
  ev.on('game:state', ({ state: s }) => { if (s !== 'playing' && s !== 'paused') hide(); });

  return { update, el, hide, get state() { return state; }, get shown() { return shown; } };
}
