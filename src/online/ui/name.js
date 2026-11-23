// ONLINE page, name view: the first visit asks for a player name (a friendly one is filled in already, so OK is
// enough); CHANGE on the hub opens it again with CANCEL. The rules and their plain sentences come from names.js
// (3-12 letters, numbers, spaces, _ and -; rude names are refused, here and again on every other player's screen).
// There is no password: the online account is an anonymous one kept by this browser (SPEC4 §11, last row).
import { el, bump } from '../../ui/ui.js';
import { checkName, defaultName, NAME_HELP } from '../names.js';

/** Text boxes on the online pages: Enter = `go()`, and the on-screen keyboard closes. */
export function onEnter(input, go) {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); go(); } });
}

export function createNameView(ui, flow, page) {
  const root = el('div', 'on-card on-name pop');
  root.innerHTML = `
    <div class="on-h ol">PICK YOUR NAME</div>
    <p class="on-p">This is the name other players see.</p>
    <input type="text" class="on-input on-nameinput" maxlength="12" aria-label="Player name" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
    <div class="on-rules">3 to 12 letters or numbers. Please keep it kind!</div>
    <p class="on-public">Everyone can see this name on the leaderboards. Do not use your real name!</p>
    <div class="on-msg" role="status" aria-live="polite"></div>
    <div class="btn-row">
      <button type="button" class="btn btn-blue btn-md on-cancel" data-act="name-cancel">CANCEL</button>
      <button type="button" class="btn btn-gold btn-md" data-act="name-ok">OK</button>
    </div>
    <p class="on-fine">No password needed. Your online player is saved on this phone or computer. Clearing your browser data starts a new one.</p>`;
  const input = root.querySelector('.on-nameinput'), msg = root.querySelector('.on-msg'), head = root.querySelector('.on-h');
  const cancel = root.querySelector('.on-cancel'), ok = root.querySelector('[data-act="name-ok"]');
  let first = true, help = '';

  const say = (text) => { help = text || ''; msg.textContent = help; msg.classList.toggle('bad', !!help); };
  // while typing only the mistakes that more typing cannot fix are named (too short is said on OK)
  input.addEventListener('input', () => {
    const c = checkName(input.value);
    say(!c.ok && c.reason !== 'short' ? NAME_HELP[c.reason] : '');
  });
  async function submit() {
    if (flow.busy) return;
    const c = checkName(input.value);
    if (!c.ok) { say(NAME_HELP[c.reason]); bump(input); ui.vibrate(30); return; }
    if (!first && c.name === flow.name) { page.named(); return; }
    say('');
    const r = await flow.setName(c.name);
    if (r.ok) page.named();
    else { say(r.help); bump(input); }
  }
  onEnter(input, submit);

  return {
    el: root, title: 'ONLINE',
    enter() {
      first = !flow.name;
      head.textContent = first ? 'PICK YOUR NAME' : 'CHANGE YOUR NAME';
      cancel.hidden = first;
      input.value = first ? (ui.save.data.online.name || defaultName()) : flow.name;
      say('');
    },
    sync() {
      ok.classList.toggle('is-disabled', flow.busy === 'name');
      ok.textContent = flow.busy === 'name' ? 'SAVING...' : first ? "LET'S GO" : 'OK';
    },
    onAct(act) {
      if (act === 'name-ok') submit();
      else if (act === 'name-cancel') page.named();
    },
    /** BACK on a rename returns to the hub; on the first visit it leaves the online page (the screen does that). */
    onBack() { if (first) return false; page.named(); return true; },
    /** Test hooks. */
    input, submit, help: () => help,
  };
}
