// Z-bucket spatial grid (cell = 1u along z). Rebuilt every step by the owner:
//   grid.clear(); grid.insert(obj, z) ...; grid.query(zMin, zMax, fn)
// Buckets are reused arrays, so steady-state usage does not allocate.

export class ZGrid {
  constructor(cell = 1) {
    this.cell = cell;
    this.buckets = new Map();
    this.used = [];
    this.spare = [];
  }

  clear() {
    for (let i = 0; i < this.used.length; i++) {
      const key = this.used[i];
      const b = this.buckets.get(key);
      b.length = 0;
      this.spare.push(b);
      this.buckets.delete(key);
    }
    this.used.length = 0;
  }

  insert(obj, z) {
    const key = Math.floor(z / this.cell);
    let b = this.buckets.get(key);
    if (!b) {
      b = this.spare.length ? this.spare.pop() : [];
      this.buckets.set(key, b);
      this.used.push(key);
    }
    b.push(obj);
  }

  /** Calls fn(obj) for every object in cells overlapping [zMin, zMax]. Return true from fn to stop. */
  query(zMin, zMax, fn) {
    const k0 = Math.floor(zMin / this.cell), k1 = Math.floor(zMax / this.cell);
    for (let k = k0; k <= k1; k++) {
      const b = this.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) if (fn(b[i]) === true) return true;
    }
    return false;
  }
}
