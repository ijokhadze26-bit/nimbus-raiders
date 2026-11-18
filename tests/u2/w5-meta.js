// Update 3 stage 5 "meta" (STAGE5.md C): achievements + settings.
// 1. Data: 30+ goals visible in this build, unique save-safe ids, every metric resolves; goals that need a missing
//    feature (stage 4 combo / cages / props / dodge, stage 5 modes) are hidden and appear once the feature exists.
// 2. Save: achievements.counts sanitized (bad keys / values dropped); an old save's progress (stars, wins, kills)
//    counts at once, silently (claimable, no toast).
// 3. Tracking: a real autopilot win of L1 finishes FIRST FLIGHT + PIP WINS with an 'achievement:done' toast, counts
//    gates; kills reach MURK SWEEPER mid-run (live check) from stats.kills 990; practice runs never count.
// 4. Claim: pays the reward once, title badge = unclaimed count, the page renders every visible goal + CLAIM ALL.
// 5. Settings: volume sliders (live audio levels + save), mute switches still mute, haptics wrapper respects the
//    switch, ability side LEFT moves the ability button (.hud.left-hand + .side-left), colourblind gates use the
//    orange / blue palette with ▲ / ▼ marks and striped bad glass, and switching back restores the normal look.
const g = window.__game, d = g.debug, ui = g.ui, A = g.achievements;
g.loop.stop();
const AD = await import('/src/data/achievements.js');
const { sanitize } = await import('/src/save/save.js');
const GC = await import('/src/models/gatecolors.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const toasts = [];
g.events.on('achievement:done', (p) => toasts.push(p.id));
const runToEnd = (sec = 25) => { let s, k = 0; do { s = d.simulate(sec); k++; } while (s.state === 'playing' && k < 12); return s; };

// ---------------- 1. data ----------------
ok(!!A, 'game.achievements installed');
const vis = A.list();
info.visible = vis.length; info.total = AD.ACHIEVEMENTS.length;
ok(vis.length >= 30, `only ${vis.length} goals visible (need 30+)`);
const idsSeen = new Set();
for (const def of AD.ACHIEVEMENTS) {
  ok(!idsSeen.has(def.id) && /^[a-z0-9][a-z0-9_-]{0,47}$/i.test(def.id), `bad / duplicate id ${def.id}`);
  idsSeen.add(def.id);
  ok(def.reward > 0 && def.goal > 0 && def.name && def.text && AD.ACH_GROUPS.some((x) => x.id === def.group), `${def.id} fields`);
  ok(Number.isFinite(A.value(def)), `${def.id} metric ${def.metric} -> ${A.value(def)}`);
}
const needCombo = AD.ACHIEVEMENTS.filter((x) => x.needs === 'combo');
ok(needCombo.length === 2 && !vis.some((x) => x.needs === 'combo' || x.needs === 'props' || x.needs === 'cages') === !g.combo, 'stage 4 goals hidden while the feature is missing');
const hadCombo = g.combo;
if (!hadCombo) { g.combo = { n: 0 }; ok(A.list().length === vis.length + needCombo.length, 'combo goals appear with game.combo'); delete g.combo; }

// ---------------- 2. save ----------------
const raw = { version: 2, coins: 5, achievements: { done: ['first-win', 'bad id!'], claimed: [], counts: { gates: 12, 'heroWin-pip': 1, 'no way': 3, neg: -4, big: 1e20 } } };
const sv = sanitize(raw);
ok(JSON.stringify(sv.achievements.counts) === JSON.stringify({ gates: 12, 'heroWin-pip': 1, big: 1e12 }), `counts sanitized ${JSON.stringify(sv.achievements.counts)}`);
ok(sv.achievements.done.length === 1 && sanitize({}).achievements.counts && Object.keys(sanitize({}).achievements.counts).length === 0, 'done ids / default counts');
g.save.reset();
g.save.update((x) => { x.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 }; x.unlockedLevel = 11; x.stats.wins = 30; x.stats.kills = 1500; });
toasts.length = 0;
const fresh = A.check(true);
const want = ['first-win', 'boss-sky', 'stars-w1', 'wins-25', 'kills-1k'];
ok(want.every((id) => fresh.includes(id)) && !fresh.includes('boss-forge') && !fresh.includes('kills-10k'), `old progress counts: ${fresh}`);
ok(toasts.length === 0, 'silent check: no toast');
info.oldSaveDone = fresh;

// ---------------- 4. claim ----------------
const c0 = g.save.data.coins;
const paid = A.claim('boss-sky');
ok(paid === AD.ACH_BY_ID['boss-sky'].reward && g.save.data.coins === c0 + paid, `claim pays ${paid}`);
ok(A.claim('boss-sky') === 0 && A.claim('boss-forge') === 0 && A.claim('nope') === 0, 'claim once / only done goals');
ui.nav('title'); await wait(400);
const dot = ui.screens.title.el.querySelector('.ach-dot');
ok(!dot.hidden && dot.textContent === String(A.unclaimed()) && A.unclaimed() === fresh.length - 1, `title badge ${dot.textContent} / ${A.unclaimed()}`);
ui.nav('achievements'); await wait(500);
const page = ui.screens.achievements.el;
ok(page.querySelectorAll('.ach-card').length === A.list().length, `page cards ${page.querySelectorAll('.ach-card').length}`);
ok(page.querySelectorAll('.ach-card.is-claimed').length === 1 && page.querySelectorAll('.ach-claim').length === A.unclaimed(), 'claimed / claim buttons');
const btn = page.querySelector('.ach-claim');
const c1 = g.save.data.coins;
btn.click(); await wait(100);
ok(g.save.data.coins > c1 && page.querySelectorAll('.ach-card.is-claimed').length === 2, 'CLAIM button pays');
page.querySelector('.ach-all').click(); await wait(100);
ok(A.unclaimed() === 0 && page.querySelectorAll('.ach-claim').length === 0, 'CLAIM ALL');
ui.nav('title'); await wait(300);
ok(ui.screens.title.el.querySelector('.ach-dot').hidden, 'badge hidden when all claimed');

// ---------------- 3. tracking ----------------
g.save.reset();
g.save.update((x) => { x.stats.kills = 990; });
toasts.length = 0;
d.setLoadout('pip', 'thunderclap');
d.setAutopilot('pro', 1, { crates: 'never', ability: true, loadout: 'keep' });
g.startLevel(1);
d.simulate(12);
ok(g.state === 'playing' && toasts.includes('kills-1k'), `MURK SWEEPER mid-run (kills ${g.run?.kills}, toasts ${toasts})`);
const toastEl = ui.achToast.el;
ok(toastEl.classList.contains('show') && /MURK SWEEPER/.test(toastEl.textContent), 'toast shows in the run');
const s1 = runToEnd();
await wait(20);
ok(s1.result && s1.result.win, `L1 win ${JSON.stringify(s1.result)}`);
const done = g.save.data.achievements.done;
ok(done.includes('first-win') && done.includes('hero-pip') && !done.includes('hero-cinder'), `done after L1: ${done}`);
ok(toasts.includes('first-win') && toasts.includes('hero-pip'), `toasts ${toasts}`);
const cnt = g.save.data.achievements.counts;
ok(cnt.gates > 0 && cnt['heroWin-pip'] === 1 && cnt.maxSquad > 0, `counts ${JSON.stringify(cnt)}`);
info.countsAfterL1 = { ...cnt };
// practice never counts
const gatesBefore = cnt.gates;
g.startPractice({ hero: 'cinder', weapon: 'thunderclap', mk: 3 });
runToEnd(10);
await wait(20);
ok(g.save.data.achievements.counts.gates === gatesBefore && !g.save.data.achievements.done.includes('hero-cinder'), 'practice does not count');
d.setAutopilot(false);
g.toTitle();

// ---------------- 5. settings ----------------
ui.nav('settings'); await wait(400);
const S = ui.screens.settings.el;
const audio = g.audio;
const mv = S.querySelector('[data-vol="music"]'), fv = S.querySelector('[data-vol="sfx"]');
ok(mv && fv && mv.value === '80' && fv.value === '90', `slider defaults ${mv?.value} / ${fv?.value}`);
mv.value = '35'; mv.dispatchEvent(new Event('input', { bubbles: true }));
fv.value = '100'; fv.dispatchEvent(new Event('change', { bubbles: true }));
ok(Math.abs(g.save.data.settings.musicVol - 0.35) < 1e-9 && g.save.data.settings.sfxVol === 1, `saved volumes ${g.save.data.settings.musicVol} / ${g.save.data.settings.sfxVol}`);
ok(Math.abs(audio.musicVol - 0.35) < 1e-9 && audio.sfxVol === 1, `audio volumes ${audio.musicVol} / ${audio.sfxVol}`);
const musicSw = S.querySelector('.switch[data-key="music"]');
musicSw.click(); await wait(50);
ok(!audio.isMusic() && !g.save.data.settings.music && Math.abs(audio.musicVol - 0.35) < 1e-9, 'music switch mutes, keeps the volume');
musicSw.click(); await wait(50);
ok(audio.isMusic(), 'music switch unmutes');
// haptics
const calls = [];
const realVib = navigator.vibrate;
Object.defineProperty(navigator, 'vibrate', { value: (ms) => { calls.push(ms); return true; }, configurable: true });
ui.vibrate(20);
S.querySelector('.switch[data-key="haptics"]').click(); await wait(50);
const n0 = calls.length;
ui.vibrate(20); g.hud.buzz(40, 0);
ok(calls.length >= 1 && calls.length === n0 && !g.save.data.settings.haptics && !g.save.data.settings.vibration, `haptics off stops buzzes (${calls})`);
S.querySelector('.switch[data-key="haptics"]').click(); await wait(50);
ok(g.save.data.settings.haptics && calls.length > n0, 'haptics on buzzes again');
if (realVib) Object.defineProperty(navigator, 'vibrate', { value: realVib, configurable: true });
// ability side
S.querySelector('[data-side="left"]').click(); await wait(50);
ok(g.save.data.settings.abilitySide === 'left' && g.hud.el.classList.contains('left-hand') && g.hud.el.classList.contains('side-left'), 'LEFT sets the HUD class');
ui.screens.settings.onAct('close'); await wait(300);
g.startLevel(3); d.simulate(1.5); ui.update(1 / 60);
const W = innerWidth;
const ab = g.hud.ability.el.getBoundingClientRect(), wp = g.hud.weaponEl.getBoundingClientRect();
info.leftHand = { ability: Math.round(ab.left), weapon: Math.round(wp.left), W };
ok(ab.width > 0 && ab.right < W / 2 && wp.left > W / 2, `left hand: ability ${ab.left}, weapon ${wp.left}`);
g.save.setSetting('abilitySide', 'right'); await wait(20); ui.update(1 / 60);
const ab2 = g.hud.ability.el.getBoundingClientRect();
ok(ab2.left > W / 2 && !g.hud.el.classList.contains('left-hand'), 'RIGHT puts it back');
// colourblind gates
const live = () => g.gates.live.filter((x) => x.visual && x.state === 'live' && !x.hidden);
d.simulate(0.5);
const gs = live();
ok(gs.length >= 2, `gates live ${gs.length}`);
const badGate = gs.find((x) => x.colorT <= 0.5), goodGate = gs.find((x) => x.colorT > 0.5);
const redraw = async () => { d.simulate(0.2); await wait(80); g.sync(1 / 60); };
g.save.setSetting('colorblind', true);
await redraw();
ok(g.gates.pal === GC.COLORBLIND, 'colourblind palette in use');
if (badGate && badGate.visual) {
  ok(badGate.visual.panelMat.map === GC.stripeTexture() && /cb/.test(badGate.visual.label.key), `bad gate striped + marked (${badGate.visual.label.key})`);
  const em = badGate.visual.frameMat.emissive; ok(em.r > em.b, 'bad gate is orange');
}
if (goodGate && goodGate.visual) {
  ok(goodGate.visual.panelMat.map !== GC.stripeTexture() && /cb/.test(goodGate.visual.label.key), 'good gate plain glass + marked');
  const em = goodGate.visual.frameMat.emissive; ok(em.b > em.r, 'good gate is blue');
}
info.cbGates = { bad: !!badGate, good: !!goodGate };
g.save.setSetting('colorblind', false);
await redraw();
ok(g.gates.pal === GC.NORMAL && gs.every((x) => !x.visual || x.visual.panelMat.map !== GC.stripeTexture()), 'normal palette restored');
// low quality: nothing throws, gates still drawn
g.save.setSetting('colorblind', true);
ui.setQuality('low'); d.simulate(1);
ui.setQuality('high'); d.simulate(0.5);
g.save.setSetting('colorblind', false);
g.toTitle();
g.save.reset();
return { pass: fails.length === 0, fails, info };
