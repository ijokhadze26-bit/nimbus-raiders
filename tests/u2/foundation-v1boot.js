// SPEC2 §4 foundation-v1boot: the real game boots (in an iframe, so it is a true page load) on a save written
// exactly as the shipped 5d67da5 build writes it (src/save/save.js defaultSave + sanitize shape, key
// nimbusRaiders.save.v1, no v2 backup key). Coins, stars, unlocked level and shop upgrades are unchanged; Pip
// wears the equipped outfit in a level and on the Heroes page; the old weapon skin is the gun paint; buying a
// shop upgrade in the Shop costs the 5d67da5 price and has the 5d67da5 effect; all of it survives a reload.
const g = window.__game;
g.loop.stop();
const { SAVE_KEY, OWNED_KEY } = await import('/src/save/save.js');
const { buildHero } = await import('/src/models/heroes/index.js');
const { heroLook } = await import('/src/game/skins.js');
const { WEAPON_SKIN_BY_ID } = await import('/src/data/skins.js');
let old;
try { old = await import('/tests/u2/.tmp/shop-5d67da5.js'); } catch { return { pass: false, fails: ['missing tests/u2/.tmp/shop-5d67da5.js (run through npm run test:u2)'] }; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], info = {};
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
// exactly the 5d67da5 shape (defaultSave() key order, sanitized values)
const v1 = {
  version: 1, coins: 4321, unlockedLevel: 10,
  stars: { 1: 3, 2: 3, 3: 2, 4: 3, 5: 1, 6: 2, 7: 3, 8: 2, 9: 1 },
  upgrades: { squad: 5, damage: 6, rate: 4, tier: 1, coins: 2 },
  skins: { owned: ['classic', 'factory', 'ninja', 'gold', 'candy', 'inferno'], hero: 'ninja', weapon: 'inferno' },
  daily: { lastClaim: '2026-11-12', streak: 3 },
  endlessBest: 640,
  settings: { music: false, sfx: true, quality: 'auto', vibration: false }, // no vibrate: a scripted click is not a user tap
  stats: { kills: 9876, runs: 33, wins: 25 },
};
g.save.flush();
localStorage.removeItem(OWNED_KEY);
localStorage.setItem(SAVE_KEY, JSON.stringify(v1));

const frame = document.createElement('iframe');
frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:99999;background:#fff';
const errs = [];
async function boot(first) {
  if (first) { frame.src = '/?test=1'; document.body.appendChild(frame); } else frame.contentWindow.location.reload();
  await wait(300);
  for (let i = 0; i < 200; i++) {
    const w = frame.contentWindow;
    if (w && w.__game && w.__game.ui && w.__game.save && w.document.readyState === 'complete') {
      w.addEventListener('error', (e) => errs.push(String(e.message)));
      await wait(1200);
      return w.__game;
    }
    await wait(100);
  }
  throw new Error('iframe game never booted');
}
// vertex-colour fingerprint of a rig (the gun excluded: it has its own material)
const colours = (root, gun) => {
  const s = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o === gun || !o.geometry?.attributes?.color) return;
    const c = o.geometry.attributes.color;
    for (let i = 0; i < c.count; i += 3) s.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
  });
  return s;
};
const ninjaLook = heroLook('ninja');
const ninjaRig = buildHero('pip', { lod: 'high', outfit: { ...ninjaLook.pip, glow: ninjaLook.glow } });
const classicRig = buildHero('pip', { lod: 'high', outfit: {} });
const N = colours(ninjaRig.root, ninjaRig.gun), C = colours(classicRig.root, classicRig.gun);
const ninjaOnly = [...N].filter((x) => !C.has(x)), classicOnly = [...C].filter((x) => !N.has(x));
function wearsNinja(root, gun, where) {
  const S = colours(root, gun);
  const has = ninjaOnly.filter((x) => S.has(x)).length, stale = classicOnly.filter((x) => S.has(x)).length;
  info[where] = { ninjaColours: `${has}/${ninjaOnly.length}`, classicColours: stale };
  if (!ninjaOnly.length || has < ninjaOnly.length * 0.8 || stale > classicOnly.length * 0.2) fails.push(`${where}: Pip does not wear Neon Ninja (${has}/${ninjaOnly.length} ninja, ${stale} classic)`);
}

async function checkAll(G, label, expect) {
  const d = G.save.data;
  eq(d.coins, expect.coins, `${label} coins`);
  eq(d.unlockedLevel, v1.unlockedLevel, `${label} unlockedLevel`);
  eq(d.stars, Object.fromEntries(Object.entries(v1.stars).map(([k, v]) => [k, v])), `${label} stars`);
  eq(d.upgrades, expect.upgrades, `${label} upgrades`);
  eq([d.skins.hero, d.skins.weapon], ['ninja', 'inferno'], `${label} equipped outfit + paint`);
  for (const id of v1.skins.owned) if (!G.save.owns(id)) fails.push(`${label}: lost owned skin ${id}`);
  eq([d.endlessBest, d.stats, d.daily], [v1.endlessBest, v1.stats, v1.daily], `${label} endless / stats / daily`);
  eq([d.settings.music, d.settings.sfx, d.settings.vibration], [false, true, false], `${label} settings`);
  // the shop shows the old skins: Pip outfits tab and the gun paints tab
  G.ui.nav('shop', { tab: 'hero' }); await wait(200);
  const heroTxt = G.ui.screens.shop.el.textContent;
  if (!/Neon Ninja/.test(heroTxt) || !/Royal Gold/.test(heroTxt)) fails.push(`${label}: Pip outfits tab missing old outfits`);
  G.ui.nav('shop', { tab: 'weapons' }); await wait(200);
  const paintTxt = G.ui.screens.shop.el.textContent;
  if (!/Inferno/.test(paintTxt) || !/Candy/.test(paintTxt) || !/GUN PAINT/i.test(paintTxt)) fails.push(`${label}: gun paint tab missing the old weapon skins`);
  // a level: Pip leads with the outfit, the guns wear the Inferno paint at the run's Mk
  G.ui.nav('title'); await wait(200);
  G.debug.startLevel(3);
  G.debug.simulate(1);
  const sq = G.squad, mk = G.weapons.mk;
  eq(G.loadout.hero, 'pip', `${label} loadout hero`);
  eq(sq.leaderRig.key && sq.leaderRig.key.split(':').slice(0, 2).join(':'), 'pip:ninja', `${label} leader rig key`);
  wearsNinja(sq.pip.root, sq.pip.gun, `${label} level`);
  const paint = WEAPON_SKIN_BY_ID.inferno.tiers[mk - 1].color.replace('#', '');
  eq(sq.pip.gunMat.color.getHexString(), paint, `${label} leader gun paint Mk ${mk}`);
  if (sq.gunMat) eq(sq.gunMat.color.getHexString(), paint, `${label} squad gun paint Mk ${mk}`);
  eq(Math.round(G.weapons.dmgMul * 100) / 100, Math.round(old.upgradeEffects(expect.upgrades).damageMul * 100) / 100, `${label} damage upgrade in the run`);
  eq(Math.round(G.weapons.rateMul * 100) / 100, Math.round(old.upgradeEffects(expect.upgrades).rateMul * 100) / 100, `${label} rate upgrade in the run`);
  eq(mk, old.upgradeEffects(expect.upgrades).startTier, `${label} starting Mk`);
  info[label + ' run'] = { squad: sq.count, mk, dmgMul: G.weapons.dmgMul };
  G.debug.toTitle(); await wait(200);
  // Heroes page: Pip in the preview wears the outfit
  G.ui.nav('heroes', { from: 'title', hero: 'pip' }); await wait(1800);
  const root = G.ui.screens.heroes.preview.root && G.ui.screens.heroes.preview.root();
  if (!root) fails.push(`${label}: Heroes preview has no model`);
  else wearsNinja(root, null, `${label} heroes page`);
  G.ui.nav('title'); await wait(200);
}

try {
  let G = await boot(true);
  eq(G.save.data.version, 3, 'migrated version');
  await checkAll(G, 'boot', { coins: v1.coins, upgrades: v1.upgrades });
  // buy Damage in the Shop UI (6 -> 7)
  G.ui.nav('shop', { tab: 'upgrades' }); await wait(300);
  const btn = G.ui.screens.shop.el.querySelector('[data-act="buy-up"][data-id="damage"]');
  const price = old.upgradeCost('damage', v1.upgrades.damage);
  info.price = { old: price, shown: btn && btn.textContent.replace(/\s+/g, ' ').trim() };
  if (!btn) fails.push('no Damage buy button');
  else {
    if (!btn.textContent.replace(/[\s,]/g, '').includes(String(price))) fails.push(`Damage button does not show the 5d67da5 price ${price}: "${btn.textContent}"`);
    btn.click(); await wait(300);
  }
  const after = { coins: v1.coins - price, upgrades: { ...v1.upgrades, damage: v1.upgrades.damage + 1 } };
  eq(G.save.data.coins, after.coins, 'coins after buying Damage');
  eq(G.save.data.upgrades.damage, 7, 'Damage level after buying');
  G.ui.nav('title'); await wait(500); // > the 300 ms autosave
  G = await boot(false);
  await checkAll(G, 'reload', after);
  info.errors = errs;
  if (errs.length) fails.push('iframe errors: ' + errs.join(' | '));
} catch (e) {
  fails.push('crash: ' + (e.stack || e).toString().slice(0, 400));
}
frame.remove();
localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OWNED_KEY);
g.save.reset();
return { pass: fails.length === 0, fails, info };
