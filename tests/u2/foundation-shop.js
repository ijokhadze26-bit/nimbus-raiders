// SPEC2 §1.0 / §9 foundation-shop: the shop is frozen. UPGRADES, upgradeCost and upgradeEffects equal the
// shipped 5d67da5 version for every upgrade and level; only upgradeLabel('tier', lv) changes, to "Mk II".."Mk IV".
// (scripts/u2.mjs writes tests/u2/.tmp/shop-5d67da5.js from `git show 5d67da5:src/data/shop.js`.)
const now = await import('/src/data/shop.js');
let old;
try { old = await import('/tests/u2/.tmp/shop-5d67da5.js'); } catch (e) { return { pass: false, fails: ['missing tests/u2/.tmp/shop-5d67da5.js (run through npm run test:u2)'] }; }
const fails = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!same(now.UPGRADES, old.UPGRADES)) fails.push('UPGRADES differ');
if (!same(Object.keys(now.UPGRADE_BY_ID), Object.keys(old.UPGRADE_BY_ID))) fails.push('UPGRADE_BY_ID ids differ');
if (!same(now.DAILY, old.DAILY)) fails.push('DAILY differs');
for (const u of old.UPGRADES) {
  for (let lv = 0; lv <= u.max; lv++) {
    if (now.upgradeCost(u.id, lv) !== old.upgradeCost(u.id, lv)) fails.push(`upgradeCost ${u.id} ${lv}`);
    const ups = { [u.id]: lv };
    if (!same(now.upgradeEffects(ups), old.upgradeEffects(ups))) fails.push(`upgradeEffects ${u.id} ${lv}`);
    if (u.id !== 'tier' && now.upgradeLabel(u.id, lv) !== old.upgradeLabel(u.id, lv)) fails.push(`upgradeLabel ${u.id} ${lv}`);
  }
}
const labels = [1, 2, 3].map((lv) => now.upgradeLabel('tier', lv));
if (!same(labels, ['Mk II', 'Mk III', 'Mk IV'])) fails.push('tier labels: ' + labels.join(','));
if (now.upgradeLabel('tier', 0) !== 'Mk I') fails.push('tier label 0: ' + now.upgradeLabel('tier', 0));
return { pass: fails.length === 0, fails, labels };
