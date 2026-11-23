// node tests/online/botplan.mjs — the scripted rival's plan (src/online/botplan.js), pure: its squad curve grows no
// faster than gate rows can, a full squad reads 999 on every bot, and a sabotage of mine always takes a real slice.
import { test, ok, run } from './kit.mjs';
import { makePlan, levelIndex } from '../../src/online/botplan.js';
import { BOT } from '../../src/online/botdata.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i + 1) * 7919 + 13);

test('the squad never leaps: growth per 0.1 s within BOT.grow, no 5 s rise of more than 150 from under 30 (levels 0, 2, 3)', () => {
  const G = BOT.grow;
  for (const level of [0, 2, 3]) {
    let worst = 0, leaps = 0, ex = null;
    for (const seed of SEEDS) {
      const p = makePlan(seed, { level });
      for (let k = 1; k <= 3300; k++) {
        const a = p.squad((k - 1) / 10), b = p.squad(k / 10);
        worst = Math.max(worst, b - (a * G.mul + G.add));
      }
      for (let t = 0; t < p.T - p.collapse; t += 0.5) {
        if (p.at(t).arena) continue;
        const q = p.squad(t), q2 = p.squad(t + 5);
        if (q < 30 && q2 - q > 150) { leaps++; ex = ex || { seed, t, q: Math.round(q), q2: Math.round(q2) }; }
      }
    }
    ok(worst <= 1e-3, `level ${level}: the curve grew ${worst.toFixed(3)} above the limit in one tenth`);
    ok(leaps === 0, `level ${level}: ${leaps} leaps, e.g. ${JSON.stringify(ex)}`);
  }
});

test('a squad at the cap reads 999 on every bot, whatever its own factor (no flat 867 "cap")', () => {
  let small = 0;
  for (const seed of SEEDS) {
    const p = makePlan(seed, { level: 0 });
    if (p.factor > 0.95) continue;
    small++;
    let top = 0;
    for (let t = 0; t <= 150; t += 0.1) top = Math.max(top, p.curve(t));
    ok(top >= 990, `seed ${seed} (factor ${p.factor.toFixed(3)}): its squad tops out at ${top.toFixed(0)}`);
  }
  ok(small >= 30, 'too few bots with a small factor: ' + small);
});

test('a landed sabotage always takes at least BOT.react.sliceMin x the level slice per unit of its kind', () => {
  for (let level = BOT.levels.min; level <= BOT.levels.max; level++) {
    const p = makePlan(SEEDS[0], { level });
    const min = BOT.react.sliceMin * BOT.level.slice[levelIndex(level)];
    ok(p.sliceK >= min - 1e-9, `level ${level}: sliceK ${p.sliceK} < ${min}`);
    const r = p.react(1, 50);
    ok(r.slice >= BOT.react.slice[1] * min - 1e-9, `level ${level}: FOG takes ${r.slice} s`);
  }
});

run('botplan');
