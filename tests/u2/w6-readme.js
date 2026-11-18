// Update 3 stage 6 README: the generated "Worlds and Bosses" section (u3 markers) names all 5 worlds with their
// level ranges, all 10 boss / mini-boss fights (level + the name the game shows, from bossLook) and every world's
// hazards; the enemies table has a row per enemy type (+ elites) with text from src/data/enemyinfo.js; every
// docs/*.png / .jpg the README references exists and is a real image; and the hand-written parts quote the game's
// own numbers (achievement count, squad member prices, mode unlock levels, modifier bonuses, formation / combo /
// elite numbers), so a data change that makes the README wrong fails here.
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const readme = await (await fetch('/README.md', { cache: 'no-store' })).text();
const gen = await import('/scripts/readme-gen.mjs');
const { WORLDS } = await import('/src/data/worlds.js');
const { LEVELS } = await import('/src/data/levels.js');
const { bossLook, BOSSES, RAGE, SAFE_SPOT } = await import('/src/data/bosses.js');
const { ENEMIES, ENEMY_TYPES, ELITE } = await import('/src/data/enemies.js');
const { ENEMY_INFO, BOSS_INFO, HAZARD_INFO } = await import('/src/data/enemyinfo.js');
const { HINTS } = await import('/src/data/hazardplan.js');
const { ACHIEVEMENTS } = await import('/src/data/achievements.js');
const { SQUAD_TYPES, GUNNER } = await import('/src/data/squadtypes.js');
const { PLAYER_MODS } = await import('/src/data/modifiers.js');
const { FORM_DEF } = await import('/src/game/formation.js');
const { COMBO_TIERS } = await import('/src/game/combo.js');
const { ELITE: ELITE_MODE } = await import('/src/data/elite.js');
const { BOSS_RUSH, RUSH_COUNT } = await import('/src/game/modes/bossrush.js');
const { CHAOS } = await import('/src/game/modes/chaos.js');
const { DAILY } = await import('/src/game/modes/daily.js');
const { ENDLESS } = await import('/src/data/endless.js');

const sec = gen.currentWorlds(readme);
check(sec.length > 0, 'README has no Worlds and Bosses (u3) section');
check(sec.includes('## Worlds and Bosses'), 'u3 section has no "## Worlds and Bosses" heading');
const info = { worlds: 0, fights: 0, enemies: 0, images: {} };

// ---- worlds ----
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
for (const w of WORLDS) {
  const head = `### ${w.id}. ${title(w.name)} (levels ${w.first}-${w.last})`;
  if (sec.includes(head)) info.worlds++; else fails.push(`world heading missing: "${head}"`);
  const from = sec.indexOf(head), to = w.id < WORLDS.length ? sec.indexOf(`### ${w.id + 1}. `) : sec.indexOf('### Enemies');
  const body = from >= 0 && to > from ? sec.slice(from, to) : '';
  check(body.includes(w.blurb), `world ${w.id}: blurb missing`);
  for (const k of w.hazards) {
    const hint = HINTS[k], name = (HAZARD_INFO[k] && HAZARD_INFO[k].name) || (hint ? hint.slice(0, hint.indexOf('!')) : k);
    const plain = name.charAt(0) + name.slice(1).toLowerCase();
    check(body.includes(`**${plain}:**`), `world ${w.id}: hazard ${k} ("${plain}") missing`);
    check(!!(HAZARD_INFO[k] && HAZARD_INFO[k].what), `hazard ${k} has no text in HAZARD_INFO`);
  }
  check(body.includes('**New enemies:**'), `world ${w.id}: no New enemies line`);
}
check(info.worlds === 5, `${info.worlds} world headings, want 5`);

// ---- 10 boss / mini-boss fights ----
const fights = LEVELS.filter((d) => d.boss);
check(fights.length === 10, `${fights.length} boss levels in the data, want 10`);
for (const d of fights) {
  const look = bossLook(d.boss);
  const line = `**${d.boss.mini ? 'Mini-boss' : 'Boss'}, level ${d.id}: ${look.name}**`;
  if (sec.includes(line)) info.fights++; else fails.push(`fight missing: ${line}`);
  check(!!(BOSS_INFO[look.type + ':' + look.skin] || BOSS_INFO[look.type]), `no BOSS_INFO text for ${look.type}:${look.skin}`);
}
check(info.fights === 10, `${info.fights} fights listed, want 10`);
for (const t of Object.keys(BOSSES)) check(!!BOSS_INFO[t], `boss type ${t} has no BOSS_INFO entry`);
check(sec.includes(`below ${Math.round(RAGE.at * 100)}% health`) && sec.includes(`${RAGE.cadence}x as often`), 'rage line does not match RAGE');
check(sec.includes(`up to ${Math.round(SAFE_SPOT.maxLoss * 100)}% of the squad`), 'safe spot line does not match SAFE_SPOT');
check(sec.includes('Below 66% health') && sec.includes('Below 33% health'), 'Tempest King phases (66% / 33%) missing');

// ---- enemies ----
for (const t of [...ENEMY_TYPES, 'elite']) {
  const e = ENEMY_INFO[t];
  check(!!(e && e.blurb && e.tip), `ENEMY_INFO.${t} needs a blurb and a tip`);
  const name = t === 'elite' ? 'Elite enemies' : ENEMIES[t].name;
  if (sec.includes(`| **${name}** |`)) info.enemies++; else fails.push(`enemies table has no row for ${name}`);
}
check(ENEMY_INFO.blaster.blurb.includes(`${ENEMIES.blaster.boom.kills} Raiders`), 'Boomling text does not use its data');
check(ENEMY_INFO.elite.blurb.includes(`${ELITE.hp}x`), 'elite text does not use ELITE.hp');

// ---- images ----
for (const m of readme.matchAll(/(?:src="|\]\()(docs\/[\w.-]+\.(?:png|jpg))/g)) {
  const f = m[1];
  if (f in info.images) continue;
  const r = await fetch('/' + f, { cache: 'no-store' });
  const b = r.ok ? await r.arrayBuffer() : null;
  const sig = b ? new Uint8Array(b, 0, 4).join() : '';
  const ok = b && b.byteLength > 1000 && (sig === '137,80,78,71' || sig.startsWith('255,216,255'));
  info.images[f] = b ? b.byteLength : 0;
  check(ok, `${f} is referenced by the README but missing or not an image`);
}
for (const f of ['docs/worldmap.png', 'docs/modes.png']) check(f in info.images, `README does not show ${f}`);

// ---- hand-written facts match the data ----
const fmt = (n) => n.toLocaleString('en-US');
const has = (s, why) => check(readme.includes(s), `README should say "${s}" (${why})`);
has(`${ACHIEVEMENTS.length} achievements`, 'ACHIEVEMENTS.length');
for (const t of SQUAD_TYPES) has(`(${fmt(t.cost)} coins`, `${t.name} cost`);
has(`+${Math.round(GUNNER.per * 100)}% squad damage each`, 'GUNNER.per');
for (const m of PLAYER_MODS) has(`(+${Math.round(m.bonus * 100)}%)`, `${m.name} bonus`);
has(`beat level ${BOSS_RUSH.unlockLevel})`, 'Boss Rush unlock');
has(`all ${RUSH_COUNT} bosses back to back`, 'RUSH_COUNT');
has(`beat level ${CHAOS.unlockLevel})`, 'Chaos unlock');
has(`+${Math.round(CHAOS.bonus * 100)}% coins per modifier`, 'CHAOS.bonus');
has(`top-${DAILY.top} leaderboard`, 'DAILY.top');
has(`+${DAILY.bonus} coins for the first clear`, 'DAILY.bonus');
has(`a boss every ${ENDLESS.bossEvery} m`, 'ENDLESS.bossEvery');
has(`+${Math.round((FORM_DEF.line.horde - 1) * 100)}% damage against the horde`, 'Line');
has(`+${Math.round((FORM_DEF.wedge.boss - 1) * 100)}% boss damage`, 'Wedge');
has(`shrugs off ${Math.round(FORM_DEF.circle.guard * 100)}% of enemy touches`, 'Circle guard');
has(`${Math.round((1 - FORM_DEF.circle.horde) * 100)}% less damage`, 'Circle damage');
has(`At ${COMBO_TIERS.slice(1).map((t) => t.at).join(', ').replace(/, (\d+)$/, ' and $1')} it boosts`, 'combo tiers');
has(`(${COMBO_TIERS.slice(1).map((t) => 'x' + t.mul).join(', ')})`, 'combo multipliers');
has(`${ELITE.hp}x health`, 'ELITE.hp');
check(ELITE_MODE.reward === 2 && readme.includes('double the level reward'), 'elite reward text');
has(`+${Math.round((ELITE_MODE.coinMul - 1) * 100)}% on the coins`, 'ELITE coinMul');
has(`There are ${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][Object.keys(BOSSES).length]} bosses`, 'boss count');
for (const t of Object.keys(BOSSES)) check(readme.includes(title(BOSSES[t].name)), `README How to play does not name ${BOSSES[t].name}`);
for (const k of ['swipe up', 'press F', 'Space or E', 'press W']) has(k, 'controls');

return { pass: fails.length === 0, fails, info, chars: sec.length };
