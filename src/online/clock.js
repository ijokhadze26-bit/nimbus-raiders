// A virtual clock for deterministic network tests and the two-page harness: time moves only when
// advance() is called. Same shape as the real clock in transport.js: { now(), after(), every() }.

const settle = () => new Promise((r) => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));

export function createClock(start = 1_800_000_000_000) {
  let t = start;
  let seq = 0;
  const timers = new Map(); // id -> { at, seq, fn, every }

  const add = (ms, fn, every) => {
    const id = ++seq;
    timers.set(id, { at: t + Math.max(0, ms), seq: id, fn, every });
    return () => timers.delete(id);
  };

  const next = (limit) => {
    let best = null;
    for (const [id, tm] of timers) {
      if (tm.at <= limit && (!best || tm.at < best[1].at || (tm.at === best[1].at && tm.seq < best[1].seq))) best = [id, tm];
    }
    return best;
  };

  return {
    now: () => t,
    after: (ms, fn) => add(ms, fn, 0),
    every: (ms, fn) => add(ms, fn, Math.max(1, ms)),
    /** Run every timer due within `ms`, in time order, letting promises settle after each one. */
    async advance(ms) {
      const end = t + ms;
      await settle();
      for (;;) {
        const hit = next(end);
        if (!hit) break;
        const [id, tm] = hit;
        t = Math.max(t, tm.at);
        if (tm.every) { tm.at += tm.every; tm.seq = ++seq; } else timers.delete(id);
        try { tm.fn(); } catch (e) { console.error(e); }
        await settle();
      }
      t = end;
      await settle();
    },
    /** Let pending promise chains finish without moving time. */
    settle,
    get size() { return timers.size; },
  };
}
