// SPEC2 §9 foundation-data: data rules that keep text, tables and code in agreement.
const W = await import('/src/data/weapons.js');
const H = await import('/src/data/heroes.js');
const M = await import('/src/data/matchups.js');
const L = await import('/src/data/levels.js');
const B = await import('/src/data/bosses.js');
const { SFX } = await import('/src/audio/sfxdefs.js');
const F = await import('/src/ui/infofmt.js');
const fails = [];
const mul = (el, id) => M.matchMul(el, id);
// strong >= 1.2 or a why; weak <= 0.85 or a why (weapons); every hero entry has a why
for (const d of W.WEAPON_DEFS) {
  for (const s of d.strong) if (!(mul(d.id, s.id) >= 1.2) && !s.why) fails.push(`${d.id} strong ${s.id} x${mul(d.id, s.id)} without why`);
  for (const s of d.weak) if (!(mul(d.id, s.id) <= 0.85) && !s.why) fails.push(`${d.id} weak ${s.id} x${mul(d.id, s.id)} without why`);
  for (const k of Object.values(d.sfx)) if (!SFX[k]) fails.push(`${d.id} sfx ${k} missing`);
  if (d.blurb.length > 90) fails.push(`${d.id} blurb ${d.blurb.length} chars`);
  if (d.mk.length !== W.MAX_MK || d.look.mk.length !== W.MAX_MK) fails.push(`${d.id} needs 5 Mk rows + looks`);
  for (const k of ['damage', 'rate', 'range', 'special']) if (!(d.bars[k] >= 0 && d.bars[k] <= 1)) fails.push(`${d.id} bar ${k}`);
  if (!d.preview || !d.preview.pattern) fails.push(`${d.id} preview.pattern`);
}
for (const h of H.HERO_DEFS) {
  for (const s of [...h.strong, ...h.weak]) if (!s.why) fails.push(`hero ${h.id} ${s.id} without why`);
  for (const k of ['ability', 'ready', 'guard', 'select']) if (!SFX[h.sfx[k]]) fails.push(`hero ${h.id} sfx.${k} ${h.sfx[k]} missing`);
  if (h.blurb.length > 90) fails.push(`hero ${h.id} blurb ${h.blurb.length} chars`);
  if (!W.WEAPON_BY_ID[h.favourite]) fails.push(`hero ${h.id} favourite ${h.favourite}`);
}
// favours never list a weapon weak against that level's / boss's boss
for (const lv of L.LEVELS) {
  if (!lv.favours || !lv.favours.length) fails.push(`L${lv.id} has no favours`);
  for (const w of lv.favours) if (W.WEAPON_BY_ID[w].weak.some((x) => x.id === lv.boss.type)) fails.push(`L${lv.id} favours ${w}, weak vs ${lv.boss.type}`);
}
for (const [type, b] of Object.entries(B.BOSSES)) for (const w of b.favours || []) if (W.WEAPON_BY_ID[w].weak.some((x) => x.id === type)) fails.push(`boss ${type} favours ${w} (weak)`);
// lock lines
const lv = F.lockText(W.WEAPON_BY_ID.voidsiphon), lx = F.lockText(H.HERO_DEF_BY_ID.vex);
if (!(lv.includes('level 13') && lv.includes('3200'))) fails.push('voidsiphon lockText: ' + lv);
if (!(lx.includes('level 12') && lx.includes('2800'))) fails.push('vex lockText: ' + lx);
// sheet DPS: each weapon's single-target sheet matches MKREF * K (within 3%) at every Mk
const sheet = {
  emberstorm: (r) => r.rate * r.pellets * r.dmg * 2, glacier: (r) => r.rate * r.dmg, sugarrush: (r) => r.rate * r.dmg,
  spectra: (r) => r.rate * r.dmg, gearworks: (r) => r.rate * r.dmg, thunderclap: (r) => r.rate * r.dmg, voidsiphon: (r) => r.rate * r.dmg,
};
for (const d of W.WEAPON_DEFS) for (const r of d.mk) {
  const want = W.MKREF[r.mk] * d.K, got = sheet[d.id](r);
  if (Math.abs(got / want - 1) > 0.03) fails.push(`${d.id} Mk${r.mk} sheet ${got.toFixed(3)} vs ${want.toFixed(3)}`);
}
// unlock table (SPEC2 §2.9 / §3)
const wl = { thunderclap: 1, glacier: 3, emberstorm: 5, gearworks: 7, sugarrush: 9, spectra: 11, voidsiphon: 13 };
for (const [id, l] of Object.entries(wl)) if (W.WEAPON_BY_ID[id].unlock.level !== l) fails.push(`${id} unlock level`);
const hl = { pip: 1, cinder: 4, rime: 6, bonbon: 8, bolt: 10, vex: 12 };
for (const [id, l] of Object.entries(hl)) if (H.HERO_DEF_BY_ID[id].unlock.level !== l) fails.push(`${id} unlock level`);
// Spectra is nobody's favourite
if (H.HERO_DEFS.some((h) => h.favourite === 'spectra')) fails.push('spectra is a favourite');
return { pass: fails.length === 0, fails, lockVoid: lv, lockVex: lx };
