// ONLINE page, the QUICK MATCH view (hub.js shows it while flow.mode is 'quick' and no match is on):
//   searching   a turning globe, FINDING A RIVAL..., the seconds counter "0:07", a line that changes every 3 s, CANCEL
//               (RECONNECTING... under the counter while my connection is down: the search goes on)
//   found       RIVAL FOUND!, the rival's name, hero and weapon, GET READY! (no CANCEL; BACK still leaves)
// Everything comes from flow.quickView(), which has the same shape for every rival: nothing here can tell a person
// from a scripted rival, and no word on it says BOT, PLAYER, HUMAN or COMPUTER. The rival's name is text, never HTML.
import { el, bump } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { heroIcon, weaponIcon } from '../../ui/icons2.js';
import { heroDef } from '../../data/heroes.js';
import { weaponDef } from '../../data/weapons.js';
import { FIND, findLine, clock } from './vswords.js';

export function createFindingView(ui, flow) {
  const root = el('div', 'on-card on-find pop', `
    <div class="on-globe" aria-hidden="true"><i class="on-globe-ring"></i><span class="on-globe-in">${icon('globe')}</span></div>
    <div class="on-h ol on-find-h">${FIND.head}</div>
    <div class="on-find-secs num" role="timer">0:00</div>
    <div class="on-find-net">${FIND.away}</div>
    <p class="on-p on-find-line" aria-live="polite">${FIND.lines[0]}</p>
    <div class="on-find-who">
      <div class="on-find-name"></div>
      <div class="on-seat-pick"><span class="on-ico on-find-hi"></span><span class="on-ico on-find-wi"></span></div>
      <div class="on-find-txt"><b class="on-find-hero"></b><span class="on-find-weapon"></span></div>
      <div class="on-find-go">${FIND.ready}</div>
    </div>
    <button type="button" class="btn btn-blue btn-md on-find-cancel" data-act="cancel">${FIND.cancel}</button>`);
  const q = (s) => root.querySelector(s);
  const head = q('.on-find-h'), secs = q('.on-find-secs'), line = q('.on-find-line'), net = q('.on-find-net');
  const name = q('.on-find-name'), hi = q('.on-find-hi'), wi = q('.on-find-wi'), hero = q('.on-find-hero'), weapon = q('.on-find-weapon');
  const cancel = q('.on-find-cancel');
  let tick = null, shownFound = null, shownWho = '';
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  const view = {
    el: root, title: FIND.title,
    enter() {
      shownFound = null; shownWho = '';
      if (!tick) tick = setInterval(() => view.sync(), 250); // the counter and the line move on their own
    },
    leave() { if (tick) { clearInterval(tick); tick = null; } },
    sync() {
      const v = flow.quickView ? flow.quickView() : null;
      if (!v) return;
      const isFound = v.phase === 'found';
      if (isFound !== shownFound) {
        shownFound = isFound;
        root.classList.toggle('found', isFound);
        set(head, isFound ? FIND.found : FIND.head);
        cancel.hidden = isFound;
        if (isFound) { bump(head); ui.sfx && ui.sfx('star', { index: 1 }); }
      }
      set(secs, clock(v.secs));       // written only when it changes
      set(line, findLine(v.secs));
      net.hidden = isFound || flow.net === 'on';
      if (isFound) {
        const who = `${v.name}|${v.hero}|${v.weapon}`;
        if (who !== shownWho) {
          shownWho = who;
          const h = heroDef(v.hero), w = weaponDef(v.weapon);
          set(name, v.name);
          hi.innerHTML = heroIcon(h.id); wi.innerHTML = weaponIcon(w.id); // (ids looked up in the game's own tables)
          set(hero, h.name); set(weapon, w.name);
        }
      }
    },
    onAct(act) { if (act === 'cancel') flow.quickCancel(); },
    /** BACK = CANCEL (also while RIVAL FOUND! shows). */
    onBack() { flow.quickCancel(); return true; },
  };
  return view;
}
