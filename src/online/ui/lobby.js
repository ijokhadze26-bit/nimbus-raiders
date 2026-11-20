// ONLINE page, lobby view: the room code in big letters with COPY LINK / SHARE, both seats (name, hero, weapon,
// outfit and gun paint), my pick with CHANGE, READY / NOT READY and LEAVE. Everything shown comes from the room
// state of room.js through the flow; nothing a rival sends is ever put into the page as HTML: a hero / weapon /
// skin id is looked up in the game's own tables (an unknown one shows the starter), names are text.
// CHANGE opens the picker in place: the same chips as the LOADOUT page (ui/screens/armory.js chipHtml); only heroes
// and weapons I own can be picked, a locked chip says how to unlock it. Picks lock while I am READY.
import { el, bump } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { heroIcon, weaponIcon } from '../../ui/icons2.js';
import { chipHtml } from '../../ui/screens/armory.js';
import { HERO_DEFS, heroDef } from '../../data/heroes.js';
import { WEAPON_DEFS, weaponDef } from '../../data/weapons.js';
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../../data/skins.js';
import { isHeroUnlocked, isWeaponUnlocked, lockText } from '../../save/unlocks.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const DOTS = '<i class="on-dots"><b></b><b></b><b></b></i>';

/** One seat as HTML. `seat` is a room.js seat or null (nobody there: waiting for a friend, or the host has gone). */
function seatHtml(seat, mine, hostLeft) {
  if (!seat) {
    return `<div class="on-seat empty"><div class="on-seat-tag">RIVAL</div>${hostLeft ? '<div class="on-wait">NOBODY HERE</div>'
      : `<div class="on-wait">WAITING FOR A FRIEND${DOTS}</div><div class="on-seat-skin">Send them the code!</div>`}</div>`;
  }
  const h = heroDef(seat.he), w = weaponDef(seat.we);
  const outfit = (HERO_BY_ID[seat.hs] || HERO_BY_ID.classic).name, paint = (WEAPON_SKIN_BY_ID[seat.ws] || WEAPON_SKIN_BY_ID.factory).name;
  return `<div class="on-seat${mine ? ' me' : ''}${seat.rdy ? ' ready' : ''}">
    <div class="on-seat-tag">${mine ? 'YOU' : 'RIVAL'}</div>
    <div class="on-seat-name">${esc(seat.n)}</div>
    <div class="on-seat-pick"><span class="on-ico">${heroIcon(h.id)}</span><span class="on-ico">${weaponIcon(w.id)}</span></div>
    <div class="on-seat-txt"><b>${esc(h.name)}</b><span>${esc(w.name)}</span></div>
    <div class="on-seat-skin">${esc(outfit)} · ${esc(paint)}</div>
    <div class="on-seat-state">${seat.rdy ? `${icon('check')}READY` : 'NOT READY'}</div>
  </div>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* no clipboard permission: the old way */ }
  try {
    const t = document.createElement('input');
    t.type = 'text'; t.value = text; t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
}

export function createLobbyView(ui, flow) {
  const root = el('div', 'on-lobby');
  root.innerHTML = `
    <div class="on-card on-roomcard pop">
      <div class="on-lbl">ROOM CODE</div>
      <div class="on-tiles" aria-label="Room code"></div>
      <div class="btn-row on-sharerow">
        <button type="button" class="btn btn-blue btn-sm" data-act="copy">COPY LINK</button>
        <button type="button" class="btn btn-purple btn-sm on-share" data-act="share">SHARE</button>
      </div>
      <div class="on-linktxt" hidden></div>
    </div>
    <div class="on-banner" role="status" hidden></div>
    <div class="on-seats"></div>
    <div class="on-card on-picker" hidden>
      <div class="on-sub">HERO</div>
      <div class="chip-row on-heroes" role="toolbar" aria-label="Hero"></div>
      <div class="on-sub">WEAPON</div>
      <div class="chip-row on-weapons" role="toolbar" aria-label="Weapon"></div>
      <div class="on-msg on-lockline" role="status"></div>
      <button type="button" class="btn btn-green btn-md" data-act="pick-done">DONE</button>
    </div>
    <div class="on-foot">
      <div class="btn-row">
        <button type="button" class="btn btn-blue btn-md on-change" data-act="pick-open"><span class="col"><span>CHANGE</span><span class="sub">HERO · WEAPON</span></span></button>
        <button type="button" class="btn btn-gold btn-lg on-ready" data-act="ready">READY</button>
      </div>
      <div class="on-status" role="status" aria-live="polite"></div>
      <div class="on-fine">Shop upgrades are switched off online. It is all skill!</div>
      <button type="button" class="btn btn-red btn-sm on-leave" data-act="leave">LEAVE ROOM</button>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const tiles = $('.on-tiles'), seatsEl = $('.on-seats'), banner = $('.on-banner'), picker = $('.on-picker'), foot = $('.on-foot');
  const readyBtn = $('.on-ready'), changeBtn = $('.on-change'), status = $('.on-status'), lockLine = $('.on-lockline');
  const copyBtn = $('[data-act="copy"]'), shareBtn = $('.on-share'), linkTxt = $('.on-linktxt');
  const heroesRow = $('.on-heroes'), weaponsRow = $('.on-weapons');
  let picking = false, lastSeats = '', lastCode = '', copyT = 0, lastChips = '';
  shareBtn.hidden = typeof navigator.share !== 'function';

  function renderChips() {
    const d = ui.save.data;
    const key = `${d.heroes.selected}|${d.arsenal.selected}|${d.unlockedLevel}|${d.heroes.owned.length}|${d.arsenal.owned.length}`;
    if (key === lastChips) return;
    lastChips = key;
    heroesRow.innerHTML = HERO_DEFS.map((h) => chipHtml({ id: h.id, name: h.name, ico: heroIcon(h.id), act: 'pick-hero', sel: h.id === d.heroes.selected, locked: isHeroUnlocked(d, h.id) ? '' : lockText(h) })).join('');
    weaponsRow.innerHTML = WEAPON_DEFS.map((w) => chipHtml({ id: w.id, name: w.name, short: w.short, ico: weaponIcon(w.id), act: 'pick-weapon', sel: w.id === d.arsenal.selected, locked: isWeaponUnlocked(d, w.id) ? '' : lockText(w) })).join('');
    for (const row of [heroesRow, weaponsRow]) {
      const s = row.querySelector('.chip.sel');
      if (s) row.scrollLeft = Math.max(0, s.offsetLeft - (row.clientWidth - s.offsetWidth) / 2);
    }
  }
  function openPicker(on) {
    picking = !!on;
    lockLine.textContent = ''; lockLine.classList.remove('bad');
    if (picking) { lastChips = ''; }
    view.sync();
    if (picking) bump(picker, 'on-in');
  }
  function pick(kind, id) {
    const d = ui.save.data, def = kind === 'hero' ? heroDef(id) : weaponDef(id);
    const open = kind === 'hero' ? isHeroUnlocked(d, id) : isWeaponUnlocked(d, id);
    if (!open) {
      lockLine.textContent = `${def.name.toUpperCase()} IS ${lockText(def)}.`; // "... IS LOCKED: reach level N or buy for C coins."
      lockLine.classList.add('bad');
      bump(lockLine); ui.vibrate(30);
      return;
    }
    lockLine.textContent = ''; lockLine.classList.remove('bad');
    flow.setPicks(kind === 'hero' ? { hero: id } : { weapon: id });
    renderChips();
  }

  const view = {
    el: root, title: 'FRIEND ROOM',
    enter() { picking = false; lastSeats = ''; lastCode = ''; linkTxt.hidden = true; copyBtn.textContent = 'COPY LINK'; },
    leave() { clearTimeout(copyT); picking = false; },
    sync() {
      const room = flow.room, st = room && room.state;
      if (!st) return;
      if (st.code !== lastCode) { lastCode = st.code; tiles.innerHTML = [...st.code].map((c) => `<span class="on-tile">${esc(c)}</span>`).join(''); }
      const me = st.me, mine = me !== null ? st.seats[me] : null;
      const rivals = st.seats.filter((s, i) => i !== me);
      const rival = rivals.find(Boolean) || null;
      // my seat first, then the others (a seat I do not hold right now shows as "getting it back")
      const html = (mine ? seatHtml(mine, true) : `<div class="on-seat me empty"><div class="on-seat-tag">YOU</div><div class="on-wait">GETTING YOUR SEAT BACK${DOTS}</div></div>`)
        + '<div class="on-vs ol">VS</div>' + rivals.map((s) => seatHtml(s, false, st.hostLeft)).join('');
      if (html !== lastSeats) { lastSeats = html; seatsEl.innerHTML = html; }
      const who = ((rival && rival.n) || 'your friend').toUpperCase();
      const ready = !!(mine && mine.rdy), all = !!(mine && rival) && st.seats.filter(Boolean).every((s) => s.rdy);
      if (ready && picking) picking = false;
      seatsEl.hidden = picking; picker.hidden = !picking;
      if (picking) renderChips();
      // banner: the things that stop a match from starting
      const lost = flow.net !== 'on';
      const text = st.hostLeft ? ['THE HOST LEFT', 'This room is closed. Leave and make a new one.']
        : lost ? ['RECONNECTING', 'Hold on, your seat is kept for a moment.'] : null;
      banner.hidden = !text;
      if (text) banner.innerHTML = `<b>${text[0]}</b><span>${text[1]}</span>`;
      const blocked = !mine || st.hostLeft || lost;
      readyBtn.textContent = ready ? 'NOT READY' : 'READY';
      readyBtn.classList.toggle('btn-gold', !ready); readyBtn.classList.toggle('btn-grey', ready);
      readyBtn.classList.toggle('is-disabled', blocked);
      changeBtn.classList.toggle('is-disabled', blocked || ready);
      changeBtn.hidden = picking; readyBtn.hidden = picking;
      foot.classList.toggle('picking', picking); root.classList.toggle('picking', picking);
      foot.classList.toggle('closed', !!st.hostLeft && !picking);
      status.textContent = picking ? 'Pick a hero and a weapon you own.'
        : st.hostLeft ? '' : !mine ? 'One moment...'
          : all ? 'STARTING...'
            : !rival ? 'Share the code. The match starts when you are both ready.'
              : ready ? `WAITING FOR ${who}... Tap NOT READY to change your hero.`
                : rival.rdy ? `${who} IS READY! Tap READY to start.` : 'Tap READY when you are set. The match starts when you are both ready.';
      status.classList.toggle('go', all);
    },
    onAct(act, btn) {
      const st = flow.room && flow.room.state;
      if (act === 'leave') flow.leave('online');
      else if (act === 'ready' && st && st.me !== null) flow.ready(!st.seats[st.me].rdy);
      else if (act === 'pick-open') openPicker(true);
      else if (act === 'pick-done') openPicker(false);
      else if (act === 'pick-hero') pick('hero', btn.dataset.id);
      else if (act === 'pick-weapon') pick('weapon', btn.dataset.id);
      else if (act === 'copy') {
        const link = flow.shareLink();
        copyText(link).then((ok) => {
          copyBtn.textContent = ok ? 'LINK COPIED!' : 'COPY LINK';
          // no clipboard on this browser: show the link so it can be copied by hand
          linkTxt.hidden = ok; linkTxt.textContent = ok ? '' : link;
          bump(copyBtn);
          clearTimeout(copyT);
          copyT = setTimeout(() => { copyBtn.textContent = 'COPY LINK'; }, 1800);
        });
      } else if (act === 'share') {
        const code = st ? st.code : '';
        navigator.share({ title: 'Nimbus Raiders', text: `Play me in Nimbus Raiders! Room code: ${code}`, url: flow.shareLink() }).catch(() => { /* closed without sharing */ });
      }
    },
    onBack() { if (!picking) return false; openPicker(false); return true; },
    /** Test hooks. */
    picking: () => picking,
  };
  return view;
}
