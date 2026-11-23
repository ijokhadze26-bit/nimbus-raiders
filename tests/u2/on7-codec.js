// @smoke --seconds 0 --shots 0
// Online stage 3, the scripted rival's stream (src/online/bot.js) against the real codec and referee:
// 1. Every 'state' deep-equals decodeState() of the packed string it was made from (codec.js encodeState); verdict.js
//    plausible(prev, s, clock()) is null for every bundle; seq goes +1 each bundle; bundles are made 0.25 s apart on
//    its clock, delivered 0.06-0.18 s later (+ one step), in order, with 2-3 lane samples each.
// 2. Flags and boss hp: bit 0 + boss hp falling 1 -> 0 inside each of its arenas (0 outside), bit 4 from its boss kill
//    to its big sabotage, bit 2 for 3 s after my FOG lands, bit 3 and a held lane for 2 s after my FREEZE lands.
// 3. The link has no transport: no network object is made while a whole match plays (WebSocket, fetch,
//    XMLHttpRequest, BroadcastChannel are watched), and it has no transport field.
const g = window.__game;
const { on7, same, STEP } = await import('/tests/u2/lib/on7kit.js');
const k = await on7(g);
const { decodeState } = k.codec, { plausible } = k.verdict, { sabEncode } = k.sab;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const net = { ws: 0, fetch: 0, xhr: 0, bc: 0 };
const saved = { ws: window.WebSocket, fetch: window.fetch, open: XMLHttpRequest.prototype.open, bc: window.BroadcastChannel };

try {
  window.WebSocket = function WS(...a) { net.ws++; return new saved.ws(...a); };
  window.fetch = (...a) => { net.fetch++; return saved.fetch(...a); };
  XMLHttpRequest.prototype.open = function open(...a) { net.xhr++; return saved.open.apply(this, a); };
  if (saved.bc) window.BroadcastChannel = function BC(...a) { net.bc++; return new saved.bc(...a); };

  const seeds = [21, 22, 23];
  for (const seed of seeds) {
    const s = k.solo({ seed, level: 0 });
    const link = s.link, plan = link.bot.plan;
    ok(!('transport' in link) && !('tp' in link) && link.ranked === false && link.peers.length === 1 && link.peers[0].bot === true && link.peers[0].slot === 1, `seed ${seed}: link shape ${JSON.stringify(Object.keys(link))}`);
    link.bot.test.fallAt(Math.max(plan.T, 160)); // long enough for two arenas
    let fogAt = null, freezeAt = null;
    s.step(400, (c) => {
      if (fogAt === null && c >= 40) { link.sendEvent({ k: 's', a: sabEncode(2, c), to: 1 }); fogAt = c; }
      if (freezeAt === null && c >= 80) { link.sendEvent({ k: 's', a: sabEncode(5, c), to: 1 }); freezeAt = c; }
      return !s.rec.outs.length;
    });
    const B = link.bot.test.bundles, S = s.rec.states;
    ok(S.length > 100 && S.length === B.length && link.bot.stats.bundles === S.length, `seed ${seed}: ${S.length} states, ${B.length} bundles made`);
    let prev = null, bad = [];
    for (let i = 0; i < S.length && bad.length < 5; i++) {
      const st = S[i], b = B[i], dec = decodeState(b.str);
      if (!same(st.s, dec)) bad.push(`#${i} differs from its string`);
      const why = plausible(prev, st.s, st.c);
      if (why) bad.push(`#${i} implausible: ${why}`);
      if (prev && st.s.seq !== (prev.seq + 1) % 1296) bad.push(`#${i} seq ${prev.seq} -> ${st.s.seq}`);
      if (i && Math.abs(b.f - B[i - 1].f - 0.25) > 1e-9) bad.push(`#${i} made ${b.f} after ${B[i - 1].f}`);
      const late = st.c - b.f;
      if (late < 0.06 - 1e-6 || late > 0.18 + STEP + 1e-6) bad.push(`#${i} delivered ${late.toFixed(3)} s late`);
      if (prev && !(st.s.t > prev.t)) bad.push(`#${i} out of order ${prev.t} -> ${st.s.t}`);
      if (st.s.xs.length < 2 || st.s.xs.length > 3) bad.push(`#${i} has ${st.s.xs.length} lane samples`);
      if (st.slot !== 1) bad.push(`#${i} from slot ${st.slot}`);
      prev = st.s;
    }
    ok(!bad.length, `seed ${seed}: ${bad.join('; ')}`);

    // ---- flags ----
    const flagBad = [];
    const arenas = plan.arenas.filter((A) => A.b < plan.T);
    for (const A of arenas) {
      const inside = S.filter((x) => x.s.t >= A.a + 1e-6 && x.s.t < A.b - 1e-6);
      if (!inside.length || !inside.every((x) => (x.s.flags & 1) && x.s.boss > 0 && x.s.boss <= 1)) flagBad.push(`arena ${A.z}: bit 0 / boss hp missing`);
      for (let i = 1; i < inside.length; i++) if (inside[i].s.boss > inside[i - 1].s.boss + 1e-3) { flagBad.push(`arena ${A.z}: boss hp rises`); break; }
      const big = link.bot.test.events.find((e) => e.big && e.t >= A.b);
      const ready = S.filter((x) => x.s.t >= A.b + 1e-6 && big && x.s.t < big.t - 1e-6);
      if (!big || !ready.length || !ready.every((x) => x.s.flags & 16)) flagBad.push(`arena ${A.z}: bit 4 before its big one (${big && big.t})`);
      const after = S.find((x) => big && x.s.t > big.t + 0.25);
      if (after && (after.s.flags & 16) && !link.bot.test.events.some((e) => e.big && e.t > big.t)) flagBad.push(`arena ${A.z}: bit 4 after its big one`);
    }
    const road = S.filter((x) => !plan.arenas.some((A) => x.s.t >= A.a - 1e-6 && x.s.t < A.b + 1e-6));
    if (!road.every((x) => !(x.s.flags & 1) && x.s.boss === 0)) flagBad.push('bit 0 / boss hp on the road');
    const L = link.bot.test.landed, fog = L.find((x) => x.code === 2), frz = L.find((x) => x.code === 5);
    if (!fog || !frz) flagBad.push('my FOG / FREEZE never landed');
    else {
      const fogS = S.filter((x) => x.s.t >= fog.at + 0.1 && x.s.t < fog.at + 2.9);
      if (!fogS.length || !fogS.every((x) => x.s.flags & 4)) flagBad.push('bit 2 missing after FOG');
      const later = S.find((x) => x.s.t > fog.at + 3.3 && x.s.t < frz.at - 1);
      if (later && (later.s.flags & 4)) flagBad.push('bit 2 still on 3.3 s after FOG');
      const frS = S.filter((x) => x.s.t >= frz.at + 0.3 && x.s.t < frz.at + 1.9);
      const xs = frS.flatMap((x) => x.s.xs);
      if (!frS.length || !frS.every((x) => x.s.flags & 8) || Math.max(...xs) - Math.min(...xs) > 0.01) flagBad.push(`FREEZE: bit 3 / held lane (${xs.length} samples, spread ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)})`);
      const free = S.filter((x) => x.s.t > frz.at + 2.3 && x.s.t < frz.at + 6);
      if (!free.length || free.some((x) => x.s.flags & 8)) flagBad.push('bit 3 still on after 2 s');
      info['fog' + seed] = `recv ${fog.recv.toFixed(2)} land ${fog.at.toFixed(2)} (sent ${fogAt.toFixed(2)}); freeze recv ${frz.recv.toFixed(2)} land ${frz.at.toFixed(2)}`;
    }
    ok(!flagBad.length, `seed ${seed}: ${flagBad.join('; ')}`);
    info['seed' + seed] = `T ${plan.T}, ${S.length} bundles, arenas ${arenas.map((A) => `${A.z}:${A.a}-${A.b}`).join(' ')}, sent ${link.bot.test.events.map((e) => (e.big ? 'B' : '') + e.code + '@' + e.t).join(' ')}`;
    link.leave();
  }
  ok(net.ws + net.fetch + net.xhr + net.bc === 0, 'network objects made during bot matches: ' + JSON.stringify(net));
  info.net = net;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message));
} finally {
  window.WebSocket = saved.ws; window.fetch = saved.fetch; XMLHttpRequest.prototype.open = saved.open; if (saved.bc) window.BroadcastChannel = saved.bc;
  k.bot.botForm.reset();
}
return { pass: fails.length === 0, fails, info };
