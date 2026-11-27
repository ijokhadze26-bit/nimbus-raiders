// @smoke --cpu-throttle 4 --seconds 0 --shots 0 --query test=1&net=off
// Online stage 5 (INTEGRATOR point 4): a REPORT, not a gate (the machine is shared). A versus match on Low at 390x844,
// the page's own animation loop running for 30 s with 1 rival, then 30 s with 3 rivals (all a player ever sees:
// ghost MAX_PEERS 3, the bar with 3 rows). Rivals from testlink.js run just ahead of my squad (their ghosts are on
// screen the whole time). A 10 s warm-up match first (shader compiles, cold JIT). Reports p50 / p95 / p99 frame times
// and the frame rate of each; passes when both ran with their ghosts on screen.
const g = window.__game;
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g, { name: 'Sky Rider' });
const RIVALS = [{ slot: 1, name: 'Ben', hero: 'cinder', weapon: 'emberstorm' }, { slot: 2, name: 'Cyd', hero: 'rime', weapon: 'glacier' },
  { slot: 3, name: 'Dan', hero: 'vex', weapon: 'voidsiphon' }];
const fails = [], info = { size: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio };
const SECONDS = 30;
const quality = g.engine.quality;
const ahead = (lead, n, x) => () => ({ dist: Math.max(0, (g.run ? g.run.dist : 0) + lead), n, x, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 });
const keep = () => { if (g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < 60) g.squad.setCount(60, 'test'); } };
g.runMods.ext.push(keep);
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];

async function measure(n, seconds = SECONDS) {
  k.start({ referee: false, clock: 'real', countdown: 3,
    rivals: RIVALS.slice(0, n).map((r, i) => ({ ...r, curve: ahead([6, 3, 10][i], [70, 50, 90][i], [-2.4, 0.4, 2.6][i]) })) });
  g.loop.start();
  // the countdown, then 2 s of warm-up
  await new Promise((r) => setTimeout(r, 6000));
  const times = [];
  let last = performance.now();
  const end = last + seconds * 1000;
  await new Promise((res) => {
    const tick = (now) => { times.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  const ghosts = g.versus.ghost.peers.filter((p) => p.shown > 0).length;
  const live = g.versus.live && g.state === 'playing';
  g.loop.stop();
  k.end();
  await new Promise((r) => setTimeout(r, 500));
  times.sort((a, b) => a - b);
  const r = { rivals: n, ghosts, frames: times.length, fps: Math.round((times.length / seconds) * 10) / 10,
    p50: Math.round(pct(times, 0.5) * 10) / 10, p95: Math.round(pct(times, 0.95) * 10) / 10, p99: Math.round(pct(times, 0.99) * 10) / 10, live };
  if (!live) fails.push(`${n} rival(s): the match was not running at the end`);
  if (ghosts !== n) fails.push(`${n} rival(s): ${ghosts} ghosts on screen`);
  return r;
}

try {
  g.applyQuality('low');
  info.warm = await measure(3, 10); // (a first match pays for shader compiles and a cold JIT: not compared)
  info.one = await measure(1);
  info.three = await measure(3);
  info.ratioP50 = Math.round((info.three.p50 / info.one.p50) * 100) / 100;
  info.ratioP95 = Math.round((info.three.p95 / info.one.p95) * 100) / 100;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  g.applyQuality(quality);
  const i = g.runMods.ext.indexOf(keep);
  if (i >= 0) g.runMods.ext.splice(i, 1);
}
return { pass: fails.length === 0, fails, info };
