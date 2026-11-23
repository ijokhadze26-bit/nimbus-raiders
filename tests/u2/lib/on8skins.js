// Body of tests/u2/on8-skins.js (390 x 844) and on8-skins-small.js (360 x 640): the four online-only skins.
// - never owned by a fresh or an old (v3) save, never in the shop lists / daily pool, never buyable (1e9 coins);
// - the shop lists them after the normal ones, locked: EARN ONLINE + the hint (+ progress), no price, no buy button;
// - a server profile with pk 300 grants on-silver only; an old tab dropping it -> back from the backup key;
// - owned + equipped, a single-player run wears them (outfit + gun paint) and the shop shows EQUIPPED.
import * as E from '/tests/u2/lib/on8kit.js';
import { Save, SAVE_KEY, sanitize, defaultSave } from '/src/save/save.js';
import { buySkin, equipSkin } from '/src/save/progress.js';
import { ONLINE_SKINS, HERO_SKINS, WEAPON_SKINS, PAID_SKIN_IDS, FREE_SKIN_IDS } from '/src/data/skins.js';

const ONLINE = ONLINE_SKINS.map((s) => s.id);

export async function skinsScenario(g) {
  const ui = g.ui;
  g.loop.stop();
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  const hasOnline = (owned) => owned.some((id) => ONLINE.includes(id));
  try {
    E.clearKeys();
    // ---- 1. nobody owns them offline; the lists are as they were ----
    ok(!hasOnline(defaultSave().skins.owned) && !hasOnline(g.save.data.skins.owned), 'a fresh save owns an online skin');
    eq([HERO_SKINS.length, WEAPON_SKINS.length, PAID_SKIN_IDS.length, FREE_SKIN_IDS.length], [6, 5, 9, 2], 'skin lists', fails);
    ok(!ONLINE.some((id) => PAID_SKIN_IDS.includes(id) || FREE_SKIN_IDS.includes(id)), 'an online skin is in the paid / free lists (daily reward pool, new saves)');
    const v3 = { version: 3, coins: 777, unlockedLevel: 9, skins: { owned: ['classic', 'factory', 'ninja', 'candy'], hero: 'ninja', weapon: 'candy' }, heroes: { owned: ['pip'], selected: 'pip' }, arsenal: { owned: ['thunderclap'], selected: 'thunderclap' } };
    const v3s = sanitize(v3);
    eq([v3s.coins, v3s.skins.owned, v3s.skins.hero, v3s.skins.weapon, v3s.unlockedLevel], [777, ['classic', 'factory', 'ninja', 'candy'], 'ninja', 'candy', 9], 'a v3 save loads as before', fails);
    // ---- 2. never buyable ----
    g.save.update((d) => { d.coins = 1e9; });
    for (const id of ONLINE) ok(buySkin(g.save, id) === false && !g.save.owns(id), `${id} could be bought`);
    ok(g.save.data.coins === 1e9, 'coins were spent on an online skin');
    g.save.update((d) => { d.coins = 1234; d.online.w = 3; d.online.bs = 2; });
    // ---- 3. the shop: locked cards after the normal ones ----
    for (const [tab, ids] of [['hero', ['on-silver', 'on-champion']], ['weapons', ['on-wins10', 'on-streak5']]]) {
      ui.nav('shop', { tab });
      await E.wait(900); // (the screen has faded in)
      const list = document.querySelector('.screen-shop .shop-list');
      const cards = [...list.querySelectorAll('.skin-card')];
      const all = (tab === 'hero' ? HERO_SKINS : WEAPON_SKINS).map((s) => s.id);
      eq(cards.map((c) => c.dataset.id), [...all, ...ids], `${tab} tab order`, fails);
      for (const id of ids) {
        const c = list.querySelector(`[data-id="${id}"]`);
        const txt = c.textContent.replace(/\s+/g, ' ');
        ok(/EARN ONLINE/.test(txt) && !c.querySelector('[data-act]') && !c.querySelector('.coin-ico') && !/Infinity/.test(txt), `${id} card: ${txt}`);
        info[id] = txt.trim();
      }
      for (const id of all) ok(!/EARN ONLINE/.test(list.querySelector(`[data-id="${id}"]`).textContent), `${id} reads EARN ONLINE`);
      const last = cards[cards.length - 1];
      last.scrollIntoView({ block: 'nearest' });
      await E.wait(80);
      E.inFrame([`.screen-shop [data-id="${ids[0]}"]`, `.screen-shop [data-id="${ids[1]}"]`], fails, `shop ${tab}`);
      await E.shot(g, `shop-${tab}`);
    }
    ok(/Win 10 online matches \(3\/10\)/.test(info['on-wins10']) && /in a row \(2\/5\)/.test(info['on-streak5']) && /Reach SILVER league online/.test(info['on-silver']), 'hints + progress: ' + JSON.stringify(info));
    ui.nav('title');
    // ---- 4. the server profile grants them ----
    const hub = await E.makeHub();
    const P = await E.openOnline(g, hub, { fields: { tr: 310, pk: 330, w: 4, bs: 2 } });
    await E.until(() => g.save.owns('on-silver'), 3000);
    ok(g.save.owns('on-silver') && !g.save.owns('on-wins10') && !g.save.owns('on-streak5') && !g.save.owns('on-champion'), 'pk 330 grants on-silver only: ' + g.save.data.skins.owned.join());
    P.flow.leave('title');
    ui.nav('title');
    // ---- 5. an old tab drops it; the backup key brings it back ----
    g.save.flush();
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    raw.skins.owned = raw.skins.owned.filter((id) => !ONLINE.includes(id));
    delete raw.online;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw)); // what a stage-3 tab writes (it does not know these ids)
    const again = new Save(null, { delay: 0 });
    ok(again.owns('on-silver'), 'an old tab dropped on-silver for good: ' + again.data.skins.owned.join());
    // ---- 6. equipped, a single-player run wears it ----
    g.save.update((d) => { if (!d.skins.owned.includes('on-wins10')) d.skins.owned.push('on-wins10'); });
    ok(equipSkin(g.save, 'on-silver') && equipSkin(g.save, 'on-wins10'), 'could not equip the online skins');
    ui.nav('shop', { tab: 'hero' });
    await E.wait(300);
    ok(/EQUIPPED/.test(document.querySelector('.screen-shop [data-id="on-silver"]').textContent), 'the shop does not show on-silver EQUIPPED');
    ui.nav('title');
    g.startLevel(1);
    for (let i = 0; i < 30; i++) { g.step(1 / 60); ui.update(1 / 60); }
    info.look = { outfit: g.loadout.outfit, paint: g.loadout.paint, gun: g.loadout.gunColor(1) };
    ok(g.loadout.outfit === 'on-silver' && g.loadout.paint === 'on-wins10' && g.loadout.gunColor(1) === ONLINE_SKINS[1].tiers[0].color, 'the run does not wear them: ' + JSON.stringify(info.look));
    await E.shot(g, 'run-online-skins');
    g.toTitle();
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  E.clearKeys();
  return { pass: fails.length === 0, fails, info };
}

function eq(a, b, what, fails) { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
