// Generic pooling helpers.

/** Object pool: acquire() reuses released objects, create() makes new ones. */
export class ObjectPool {
  constructor(create, reset = null) {
    this.create = create;
    this.resetFn = reset;
    this.free = [];
  }
  acquire() {
    const o = this.free.length ? this.free.pop() : this.create();
    if (this.resetFn) this.resetFn(o);
    return o;
  }
  release(o) { this.free.push(o); }
}

/** Dense list with O(1) swap-remove; iteration order is not stable. */
export class DenseList {
  constructor() { this.items = []; this.length = 0; }
  push(o) {
    if (this.length < this.items.length) this.items[this.length] = o; else this.items.push(o);
    this.length++;
    return o;
  }
  removeAt(i) {
    const last = this.length - 1;
    const o = this.items[i];
    this.items[i] = this.items[last];
    this.items[last] = null;
    this.length = last;
    return o;
  }
  clear() { for (let i = 0; i < this.length; i++) this.items[i] = null; this.length = 0; }
}

/**
 * Writes a TRS matrix (yaw about Y + uniform/non-uniform scale) straight into an
 * InstancedMesh matrix array without allocating. a = yaw radians.
 */
export function writeYawMatrix(arr, index, x, y, z, a, sx, sy = sx, sz = sx) {
  const c = Math.cos(a), s = Math.sin(a);
  const o = index * 16;
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

/** Writes a full matrix from an Object3D-like compose into the array. */
export function writeMatrix(arr, index, m) {
  const e = m.elements, o = index * 16;
  for (let k = 0; k < 16; k++) arr[o + k] = e[k];
}

/**
 * Yaw (about Y) then roll (about the local Z axis) with non-uniform scale, written straight into an
 * instance matrix array (no allocation). M = T * Ry(yaw) * Rz(roll) * S.
 */
export function writeYawRollMatrix(arr, index, x, y, z, yaw, roll, sx, sy, sz) {
  const cy = Math.cos(yaw), syw = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const o = index * 16;
  arr[o] = cy * cr * sx; arr[o + 1] = sr * sx; arr[o + 2] = -syw * cr * sx; arr[o + 3] = 0;
  arr[o + 4] = -cy * sr * sy; arr[o + 5] = cr * sy; arr[o + 6] = syw * sr * sy; arr[o + 7] = 0;
  arr[o + 8] = syw * sz; arr[o + 9] = 0; arr[o + 10] = cy * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
