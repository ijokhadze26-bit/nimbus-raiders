// node tests/online/codec.mjs — the state string, the name filter, the seed hash and the cfg reader (pure).
import { test, ok, eq, near, run } from './kit.mjs';
import { encodeState, decodeState, seqNewer, SEQ_MOD, HEADER, X_LIMIT, MAX_XS } from '../../src/online/codec.js';
import { checkName, censor, defaultName, isRudeCode, makeCode, NAME_RE } from '../../src/online/names.js';
import { hash32, plain, createTransport, availability, TS, isTS } from '../../src/online/transport.js';
import { readCfg } from '../../src/online/session.js';
import { parseNettest } from '../../src/online/nettest.js';
import { CODE_RE, configured, firebaseConfig } from '../../src/online/config.js';

const sample = { t: 123.4, dist: 1501.5, n: 247, form: 2, flags: 0b10101, boss: 0.5, zone: 3, charge: 35, danger: 9, x: -2.5 };

test('round trip keeps every field', () => {
  const xs = [-4.75, -1, 0, 2.25, 4.75];
  const str = encodeState(77, sample, xs);
  eq(str.length, HEADER + 2 * xs.length, 'length');
  const d = decodeState(str);
  eq(d.v, 1); eq(d.seq, 77); eq(d.n, 247); eq(d.form, 2); eq(d.flags, 0b10101); eq(d.zone, 3); eq(d.charge, 35); eq(d.danger, 9);
  near(d.t, 123.4, 1e-9, 't'); near(d.dist, 1501.5, 1e-9, 'dist'); near(d.boss, 0.5, 1 / 1295, 'boss'); near(d.step, 0.1, 1e-9, 'step');
  eq(d.xs.length, xs.length);
  xs.forEach((x, i) => near(d.xs[i], x, 9.5 / 1295, `x${i}`));
  near(d.x, 4.75, 9.5 / 1295, 'newest x is the last sample');
});

test('only base-36 characters, at most 64 long', () => {
  const xs = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 4);
  const str = encodeState(5, sample, xs);
  ok(/^[0-9a-z]+$/.test(str), 'base 36 only');
  ok(str.length <= 64, `length ${str.length}`);
  eq(decodeState(str).xs.length, MAX_XS, 'keeps the newest samples that fit');
  near(decodeState(str).x, xs[39], 9.5 / 1295, 'newest kept');
});

test('bounds are clamped, never wrapped', () => {
  const wild = { t: 1e9, dist: 1e9, n: 5000, form: 9, flags: 999, boss: 7, zone: 99, charge: 99, danger: 42, x: 99 };
  const d = decodeState(encodeState(0, wild, [99, -99]));
  eq(d.n, 999); eq(d.form, 2); eq(d.flags, 31); eq(d.zone, 35); eq(d.charge, 35); eq(d.danger, 9);
  near(d.t, 4665.5, 1e-9); near(d.dist, 23327.5, 1e-9); near(d.boss, 1, 1e-9);
  near(d.xs[0], X_LIMIT, 1e-9); near(d.xs[1], -X_LIMIT, 1e-9);
  const low = decodeState(encodeState(0, { t: -5, dist: -5, n: -5, form: -1, flags: -1, boss: -1, zone: -1, charge: -1, danger: -1, x: 0 }, null));
  eq([low.t, low.dist, low.n, low.form, low.flags, low.boss, low.zone, low.charge, low.danger], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  eq(low.xs.length, 1, 'falls back to the newest x');
});

test('boss: 0 means none, a sliver of health is not rounded to none', () => {
  eq(decodeState(encodeState(0, { ...sample, boss: 0 }, [0])).boss, 0);
  ok(decodeState(encodeState(0, { ...sample, boss: 0.0001 }, [0])).boss > 0);
});

test('seq wraps at 1296', () => {
  eq(decodeState(encodeState(SEQ_MOD - 1, sample, [0])).seq, SEQ_MOD - 1);
  eq(decodeState(encodeState(SEQ_MOD, sample, [0])).seq, 0);
  eq(decodeState(encodeState(SEQ_MOD + 5, sample, [0])).seq, 5);
  ok(seqNewer(1, 0)); ok(seqNewer(0, SEQ_MOD - 1), 'wraps'); ok(!seqNewer(SEQ_MOD - 1, 0)); ok(!seqNewer(7, 7));
});

test('a thinned backlog says how far apart its samples are', () => {
  near(decodeState(encodeState(0, sample, [0, 1], 1)).step, 0.2, 1e-9);
  near(decodeState(encodeState(0, sample, [0, 1], 2)).step, 0.4, 1e-9);
});

test('garbage is refused', () => {
  for (const bad of [null, 42, '', 'abc', '1' + '0'.repeat(16), '0' + '0'.repeat(19), '1' + 'Z'.repeat(19), '1'.repeat(21), '1' + '0'.repeat(70)]) {
    eq(decodeState(bad), null, `input ${JSON.stringify(bad)}`);
  }
});

test('names: length, characters, rude words, look-alikes', () => {
  eq(checkName('  Nika  ').name, 'Nika');
  for (const good of ['Nika', 'Cassie', 'grape', 'Sky Star', 'peacock', 'xX_Pro_Xx', 'Dickens', 'Raider-4821', 'A-b_c 9']) {
    ok(checkName(good).ok, `${good} should pass`);
    ok(NAME_RE.test(checkName(good).name));
  }
  eq(checkName('ab').reason, 'short');
  eq(checkName('thirteenchars').reason, 'long');
  eq(checkName('Geo<b>').reason, 'chars');
  eq(checkName('ნიკა').reason, 'chars');
  for (const bad of ['fuck', 'FuuuCk', 'F_U_C_K', 'sh1t', '5h1t', 'Ass', '4ss', 'd1ck', 'xx sex xx', 'b1tch']) {
    eq(checkName(bad).reason, 'rude', bad);
  }
});

test('names: default and censor', () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 200; i++) {
    const n = defaultName(rand);
    ok(/^Raider-\d{4}$/.test(n) && checkName(n).ok, n);
  }
  eq(censor('Nika'), 'Nika');
  ok(/^Raider-\d{4}$/.test(censor('fuckface')));
  eq(censor('fuckface'), censor('fuckface'), 'the same rude name always shows the same stand-in');
  ok(/^Raider-\d{4}$/.test(censor(undefined)));
});

test('room codes: 4 letters, no I or O, never rude', () => {
  ok(isRudeCode('FUCK') && isRudeCode('CASS') && isRudeCode('SEXY'));
  ok(!isRudeCode('ABCD'));
  let seed = 9;
  const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 500; i++) {
    const c = makeCode(rand);
    ok(CODE_RE.test(c) && !isRudeCode(c), c);
  }
});

test('seed: same record gives the same road, another record another road', () => {
  eq(hash32(1800000000000, 'Labc'), hash32(1800000000000, 'Labc'));
  ok(hash32(1800000000000, 'Labc') !== hash32(1800000000001, 'Labc'));
  ok(hash32(1800000000000, 'Labc') !== hash32(1800000000000, 'Labd'));
  const h = hash32(1, 'x');
  ok(Number.isInteger(h) && h > 0 && h <= 0xffffffff);
});

test('plain(): arrays become objects, holes and empties vanish', () => {
  eq(plain(['a', null, 'c']), { 0: 'a', 2: 'c' });
  eq(plain({ a: { b: null }, c: [], d: 0, e: '', f: false }), { d: 0, e: '', f: false });
  eq(plain(undefined), null);
  eq(plain({ x: NaN }), null);
  ok(isTS(TS) && !isTS({}) && !isTS(null));
});

test('cfg: defaults, live values, silly values', () => {
  eq(readCfg(null), { on: true, minBuild: 1, flush2: 250, flush4: 500, dayCap: 500 });
  eq(readCfg({ on: false, flush2: 500, minBuild: 3 }), { on: false, minBuild: 3, flush2: 500, flush4: 500, dayCap: 500 });
  eq(readCfg({ flush2: 1, flush4: 1e9, dayCap: 'lots' }).flush2, 100);
  eq(readCfg({ flush2: 1, flush4: 1e9, dayCap: 'lots' }).flush4, 2000);
  eq(readCfg({ dayCap: 'lots' }).dayCap, 500);
});

test('nettest string', () => {
  eq(parseNettest('lat400,jit200,loss5'), { lat: 400, jit: 200, loss: 5 });
  eq(parseNettest('loss2.5'), { lat: 0, jit: 0, loss: 2.5 });
  eq(parseNettest('nope'), null);
  eq(parseNettest(''), null);
});

test('the real adapter: an empty config reports unconfigured and loads nothing; the shipped config is the public one', async () => {
  // config.js now carries the owner's public web config (no secret: the rules decide everything)
  ok(configured(firebaseConfig), 'config.js has the public firebaseConfig');
  ok(/^AIza[0-9A-Za-z_-]{35}$/.test(firebaseConfig.apiKey) && /firebasedatabase\.app$/.test(firebaseConfig.databaseURL), 'the config looks like a Firebase web config');
  for (const k of Object.keys(firebaseConfig)) ok(!/secret|private|token|password/i.test(k), `config key ${k} looks secret`);
  const empty = { apiKey: '', authDomain: '', databaseURL: '', projectId: '', appId: '' };
  ok(!configured(empty), 'an empty config counts as unconfigured');
  const r = await createTransport('fire', { config: empty });
  eq(r.transport, null);
  eq(r.reason, 'unconfigured');
  eq(availability('local'), 'ok');
  eq((await createTransport('local')).reason, 'no-hub');
});

run('codec');
