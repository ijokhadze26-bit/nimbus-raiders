// Tiny event bus: on(name, fn) -> off(), once, emit(name, payload).
// Optional per-event rate limits (events/s) measured on the game clock (bus.now, seconds).

export class Events {
  constructor() {
    this.map = new Map();
    this.rates = new Map(); // name -> { interval, last }
    this.now = 0;
  }

  on(name, fn) {
    let list = this.map.get(name);
    if (!list) { list = []; this.map.set(name, list); }
    list.push(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (p) => { off(); fn(p); });
    return off;
  }

  off(name, fn) {
    const list = this.map.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  /** Limit an event to at most `perSecond` emits (extra emits are dropped). */
  setRate(name, perSecond) {
    this.rates.set(name, { interval: 1 / perSecond, last: -1e9 });
  }

  emit(name, payload) {
    const rate = this.rates.get(name);
    if (rate) {
      if (this.now - rate.last < rate.interval) return false;
      rate.last = this.now;
    }
    const list = this.map.get(name);
    if (!list || list.length === 0) return true;
    // Copy-free iteration that tolerates off() during dispatch.
    for (let i = list.length - 1; i >= 0; i--) {
      const fn = list[i];
      if (!fn) continue;
      try { fn(payload); } catch (e) { console.error(`[events] ${name} handler failed`, e); }
    }
    return true;
  }

  clear() { this.map.clear(); }
}
