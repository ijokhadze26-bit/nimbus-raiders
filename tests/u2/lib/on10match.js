// Bodies of tests/u2/on10-card*.js, on10-bar*.js and on10-result*.js (online stage 5, matches of 3-4 players): one
// page, no network: the match UI on on3kit's fake flow, rivals from the scripted link (src/online/game/testlink.js).
//   cardScenario   the VS card with 4 (2x2) and with 3 players: every card inside the frame, none on another
//   barScenario    3 rival rows, DANGER, one LOST CONNECTION · OUT IN n, the last one standing WIN IN n, DOWN rows;
//                  3 ghosts drawn on Low and on High
//   resultScenario I fall 4th of 4 -> the WATCHING result (YOU CAME 4TH, OF 4 · WATCHING THE OTHERS..., the watch view
//                  or its stand-in, LEAVE only) -> 'final' -> the table 1-4 in the final order with REMATCH / LEAVE /
//                  SHARE; the same ended by 'stale' (what is known, STILL STANDING rows); 3rd of 3; a draw for first
// Every screen is checked inside the frame at the page's size; screenshots only under a screenshot harness.
import { inside, txt } from '/tests/u2/lib/on10kit.js';
import { shot } from '/tests/u2/lib/on8kit.js';

const RIVALS = [{ slot: 1, name: 'Ben', hero: 'cinder', weapon: 'emberstorm', tr: 120 }, { slot: 2, name: 'Cyd', hero: 'rime', weapon: 'glacier', weaponSkin: 'prism', tr: 40 },
  { slot: 3, name: 'Dan', hero: 'vex', weapon: 'voidsiphon', tr: 0 }];

async function kit(g) {
  const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g, { name: 'Sky Rider' });
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  return { k, fails, info, ok };
}

const settle = async (k, nodes) => {
  await Promise.race([Promise.all(nodes.flatMap((e) => e.getAnimations()).map((a) => a.finished.catch(() => {}))), k.wait(4000)]);
  await k.wait(60);
};

export async function cardScenario(g) {
  const { k, fails, info, ok } = await kit(g);
  try {
    for (const n of [4, 3]) {
      let c = -4;
      k.start({ clock: () => c, rivals: RIVALS.slice(0, n - 1) });
      k.frame();
      const cs = k.qa('.vs-card .vc-p');
      ok(cs.length === n && k.q('.vs-card').classList.contains('n' + n), `${n} players: ${cs.length} cards`);
      ok(cs.map((e) => e.dataset.slot).join('') === '0123'.slice(0, n), `${n}: seat order ${cs.map((e) => e.dataset.slot).join('')}`);
      await settle(k, cs);
      inside(cs, fails, `card of ${n}`, k.root);
      if (n === 4) {
        const r = cs.map((e) => e.getBoundingClientRect());
        ok(Math.abs(r[0].top - r[1].top) < 2 && Math.abs(r[2].top - r[3].top) < 2 && r[2].top >= r[0].bottom - 1, '4 cards: a 2x2 grid ' + JSON.stringify(r.map((x) => [x.left, x.top].map(Math.round))));
        ok(cs.every((e) => e.querySelector('.vc-name') && e.querySelector('.vc-name').scrollWidth <= e.querySelector('.vc-name').clientWidth + 1), '4 cards: a name is cut');
      }
      info['card' + n] = cs.map(txt);
      await shot(g, `card-${n}`);
      k.end();
      await k.wait(300);
    }
  } catch (e) {
    fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
  } finally { k.end(); }
  return { pass: fails.length === 0, fails, info };
}

export async function barScenario(g) {
  const { k, fails, info, ok } = await kit(g);
  const { versus, ui } = k;
  const G = versus.ghost;
  const keep = (n) => { if (g.squad.count < n) g.squad.setCount(n, 'test'); g.heroes.guard = 99; };
  const ahead = (lead, n, danger = 0, x = 0) => () => ({ dist: Math.max(0, (g.run ? g.run.dist : 0) + lead), n, x, form: 0, boss: 0, zone: 1, flags: 0, danger });
  const rowText = (e) => ({ name: e.querySelector('.vs-name').textContent, n: e.querySelector('.vs-cnt').textContent, d: e.querySelector('.vs-d').textContent, cls: e.className });
  const quality = g.engine.quality;
  try {
    for (const q of ['low', 'high']) {
      g.applyQuality(q);
      const link = k.start({ referee: false, rivals: [{ ...RIVALS[0], curve: ahead(9, 64, 0, -2.4) }, { ...RIVALS[1], curve: ahead(4, 12, 7, 0.3) }, { ...RIVALS[2], curve: ahead(14, 140, 0, 2.6) }] });
      k.frames(9, () => { keep(60); return false; });
      const rows = k.qa('.vs-rivals .vs-r');
      ok(rows.length === 3 && ui.matchUi.bar.rivalsEl.classList.contains('n3'), `${q}: ${rows.length} rival rows`);
      const texts = rows.map(rowText);
      info['rows-' + q] = texts;
      ok(texts.map((t) => t.name).join(',') === 'BEN,CYD,DAN', `${q}: row names ${texts.map((t) => t.name)}`);
      ok(/danger/.test(texts[1].cls), `${q}: Cyd's row is not in danger`);
      inside(['.hud-pause', '.hud-center', '.vs-rivals'], fails, `${q} bar`, k.root);
      const ghosts = [1, 2, 3].map((s) => G.info(s));
      info['ghosts-' + q] = ghosts;
      ok(ghosts.every((x) => x && x.drawn > 0) && G.mesh.visible && G.mesh.count === ghosts.reduce((a, x) => a + x.drawn, 0), `${q}: 3 ghosts drawn ${JSON.stringify(ghosts)} mesh ${G.mesh.count}`);
      await shot(g, `bar-3-${q}`);
      if (q === 'high') {
        // one of three goes silent: OUT IN n; the other two fall: it is the last one standing, WIN IN n
        link.test.silence(2, 4, 9); k.frames(0.3, () => { keep(60); return false; });
        ok(k.text('.vs-chip.c-dc') === 'CYD LOST CONNECTION · OUT IN 9', `silent one of three: "${k.text('.vs-chip.c-dc')}"`);
        await shot(g, 'bar-dc-out');
        link.test.rivalFall(1); link.test.rivalFall(3); link.test.silence(2, 6, 7);
        k.frames(0.3, () => { keep(60); return false; });
        const after = k.qa('.vs-rivals .vs-r').map(rowText);
        info.after = after;
        ok(after[0].d === 'DOWN' && after[2].d === 'DOWN', 'two of three DOWN: ' + JSON.stringify(after));
        ok(k.text('.vs-chip.c-dc') === 'CYD LOST CONNECTION · WIN IN 7', `the silent one is the last one standing: "${k.text('.vs-chip.c-dc')}"`);
        inside(['.vs-rivals', '.vs-chip.c-dc'], fails, 'chip', k.root);
        await shot(g, 'bar-dc-win');
      }
      k.end();
      await k.wait(200);
    }
  } catch (e) {
    fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
  } finally { k.end(); g.applyQuality(quality); }
  return { pass: fails.length === 0, fails, info };
}

export async function resultScenario(g) {
  const { k, fails, info, ok } = await kit(g);
  const { versus, ui } = k;
  const scr = () => ui.screens.vsresult;
  const panel = () => k.q('.screen-vsresult .panel');
  const ribbon = () => k.text('.screen-vsresult .ribbon');
  const acts = () => k.qa('.screen-vsresult [data-act]').map((b) => b.dataset.act).sort().join(',');
  const rows = () => k.qa('.screen-vsresult .vsr-places li:not(.vsr-h)').map((li) => ({ slot: Number(li.dataset.slot), pl: li.querySelector('.vsr-pl').textContent, text: txt(li) }));
  const toResult = () => k.frames(12, () => ui.current === 'vsresult');
  const fits = (what) => {
    const p = panel();
    inside([p.querySelector('.ribbon'), ...p.querySelectorAll('.res-btns .btn:not([hidden])')], fails, what, k.root);
    const ol = p.querySelector('.vsr-places');
    if (ol) for (const li of ol.querySelectorAll('li')) if (li.scrollWidth > li.clientWidth + 1) fails.push(`${what}: a row is clipped: ${txt(li)}`);
  };
  /** A match with `rivals`; I am wiped out at once after `secs` s. */
  const fallFirst = (rivals, secs = 5) => {
    const link = k.start({ rivals });
    k.frames(secs);
    k.wipe();
    // the rivals run on past my time + the tie window: the verdict (I am last so far) comes, my place is known
    k.frames(4, () => ui.current === 'vsresult');
    toResult();
    return link;
  };
  try {
    // ---- 1. 4th of 4: watching, then the final table ----
    let link = fallFirst(RIVALS);
    const myT = versus.result && versus.result.t;
    ok(versus.result && versus.result.result === 'lose' && versus.result.place === 4, 'my verdict: ' + JSON.stringify(versus.result && { r: versus.result.result, p: versus.result.place }));
    ok(ui.current === 'vsresult' && scr().watching() && panel().dataset.watching === '1', 'not in the watching mode: ' + ui.current);
    ok(ribbon() === 'YOU CAME 4TH' && k.text('.screen-vsresult .vsr-wline') === 'OF 4 · WATCHING THE OTHERS...', `watching head: ${ribbon()} / ${k.text('.screen-vsresult .vsr-wline')}`);
    ok(acts() === 'leave', 'buttons while watching: ' + acts());
    ok(!!k.q('.screen-vsresult .vsr-watch > *'), 'the watch view (or its stand-in) is not in the result');
    ok(!k.q('.screen-vsresult .vsr-places') && !k.q('.screen-vsresult .vsr-rematch'), 'a table or REMATCH while watching');
    fits('watching');
    for (let i = 0; i < 30; i++) ui.update(1 / 60); // (the screen's own update: the watch model + cards each frame)
    await shot(g, 'result-watching-4');
    // Dan and Cyd fall; Ben runs on past the tie window: 'final'
    link.test.rivalFall(3, { T: myT + 3, d: 300 });
    link.test.rivalFall(2, { T: myT + 6, d: 420 });
    ok(scr().watching() && !versus.final, 'still watching while Ben runs');
    link.test.setClock(myT + 9); link.tick();
    ok(!!versus.final && versus.final.map((p) => p.slot).join('') === '1230', 'final: ' + JSON.stringify(versus.final));
    ok(!scr().watching() && !panel().dataset.watching, 'watching did not end on final');
    let rs = rows();
    info.final4 = rs;
    ok(rs.map((r) => r.slot).join('') === '1230' && rs.map((r) => r.pl).join('') === '1234', 'final rows: ' + JSON.stringify(rs));
    ok(/BEN/.test(rs[0].text) && /STILL STANDING/.test(rs[0].text) && /YOU/.test(rs[3].text) && !/STILL STANDING/.test(rs.slice(1).map((r) => r.text).join()), 'final row texts: ' + JSON.stringify(rs));
    const head = k.text('.screen-vsresult .vsr-why b');
    ok(acts() === 'leave,rematch,share' && ribbon() === 'YOU LOSE' && head === 'YOU CAME 4TH OF 4', `after final: ${acts()} / ${ribbon()} / ${head}`);
    fits('final of 4');
    await shot(g, 'result-final-4');
    k.end(); await k.wait(200);

    // ---- 2. watching ended by 'stale': the table of what is known ----
    link = fallFirst(RIVALS);
    ok(scr().watching(), 'stale case: not watching');
    link.test.rivalFall(3, { T: versus.result.t + 2, d: 250 });
    link.test.stale();
    ok(!scr().watching(), 'watching did not end on stale');
    rs = rows();
    info.stale = rs;
    ok(rs.length === 4 && rs.filter((r) => /STILL STANDING/.test(r.text)).length === 2 && rs[2].slot === 3 && rs[3].slot === 0, 'stale rows: ' + JSON.stringify(rs));
    ok(acts() === 'leave,rematch,share', 'after stale: ' + acts());
    fits('stale');
    k.end(); await k.wait(200);

    // ---- 3. 3rd of 3 ----
    link = fallFirst(RIVALS.slice(0, 2));
    ok(scr().watching() && ribbon() === 'YOU CAME 3RD' && k.text('.screen-vsresult .vsr-wline') === 'OF 3 · WATCHING THE OTHERS...', `3rd of 3: ${ribbon()} / ${k.text('.screen-vsresult .vsr-wline')}`);
    const t3 = versus.result.t;
    link.test.rivalFall(2, { T: t3 + 4, d: 380 });
    link.test.setClock(t3 + 7); link.tick();
    rs = rows();
    info.final3 = rs;
    ok(!scr().watching() && rs.map((r) => r.slot).join('') === '120' && rs.map((r) => r.pl).join('') === '123', '3rd of 3 table: ' + JSON.stringify(rs));
    fits('3rd of 3');
    await shot(g, 'result-final-3');
    k.end(); await k.wait(200);

    // ---- 4. a draw for first (Ben and Cyd), I came 3rd of 3: '=' on both winners ----
    link = k.start({ referee: false, rivals: RIVALS.slice(0, 2) });
    k.frames(4);
    const P = [{ slot: 1, T: 30, d: 500, by: 'dead' }, { slot: 2, T: 29.5, d: 500, by: 'dead' }, { slot: 0, T: 4, d: 60, by: 'dead' }];
    link.test.verdict({ result: 'lose', place: 3, places: P, reason: 'fell' });
    link.test.final(P);
    k.wipe();
    toResult();
    rs = rows();
    info.drawOthers = rs;
    ok(!scr().watching() && rs.map((r) => r.pl).join('') === '==3' && rs.map((r) => r.slot).join('') === '120', 'a draw between two others: ' + JSON.stringify(rs));
    k.end(); await k.wait(200);
    // and a draw with me in it
    link = k.start({ referee: false, rivals: RIVALS.slice(0, 2) });
    k.frames(4);
    const Q = [{ slot: 0, T: 30, d: 500, by: 'dead' }, { slot: 1, T: 29.6, d: 500, by: 'dead' }, { slot: 2, T: 10, d: 140, by: 'dead' }];
    link.test.verdict({ result: 'draw', place: 1, places: Q, reason: 'draw' });
    link.test.final(Q);
    k.wipe();
    toResult();
    rs = rows();
    info.drawMe = rs;
    ok(!scr().watching() && rs.map((r) => r.pl).join('') === '==3' && rs[0].slot === 0, 'my draw for first: ' + JSON.stringify(rs));
    fits('draw');
    await shot(g, 'result-draw-3');
  } catch (e) {
    fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
  } finally { k.end(); }
  return { pass: fails.length === 0, fails, info };
}
