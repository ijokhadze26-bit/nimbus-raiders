// mulberry32 seeded RNG. Gameplay randomness must go through this (deterministic runs).

export class Rng {
  constructor(seed = 1) { this.seed(seed); }

  seed(s) { this.s = (s >>> 0) || 1; return this; }

  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } // inclusive
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  fork() { return new Rng(Math.floor(this.next() * 4294967296)); }
}
