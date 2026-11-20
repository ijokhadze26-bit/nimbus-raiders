// Pure JSON-tree helpers shared by the local hub, the rules checker and both transports.
// Values follow the Realtime Database model: null means "nothing here", empty objects do not exist,
// arrays are objects with number keys.

export const segs = (p) => (Array.isArray(p) ? p : String(p).split('/').filter(Boolean));

/** Deep copy into the database's shape: arrays become objects, null / undefined children vanish,
 *  empty objects become null. Used on everything read from the real service too (it hands back
 *  arrays for `{0:..,1:..}` nodes) so both adapters deliver the same plain objects. */
export function plain(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? null : v;
  const out = {};
  let any = false;
  for (const k of Object.keys(v)) {
    const c = plain(v[k]);
    if (c !== null) { out[k] = c; any = true; }
  }
  return any ? out : null;
}

export function getIn(root, path) {
  let v = root;
  for (const k of path) {
    if (v === null || v === undefined || typeof v !== 'object') return null;
    v = v[k];
  }
  return v === undefined ? null : v;
}

/** Immutable set: returns a new root sharing every untouched branch. `value` null removes. */
export function setIn(node, path, value, i = 0) {
  if (i === path.length) return plain(value);
  const isObj = node !== null && node !== undefined && typeof node === 'object';
  const key = path[i];
  const child = setIn(isObj && key in node ? node[key] : null, path, value, i + 1);
  if (child === null) {
    if (!isObj) return node === undefined ? null : node;
    if (!(key in node)) return node;
    const out = { ...node };
    delete out[key];
    return Object.keys(out).length ? out : null;
  }
  return { ...(isObj ? node : {}), [key]: child };
}

const typeRank = (v) => (v === null || v === undefined ? 0 : v === false ? 1 : v === true ? 2
  : typeof v === 'number' ? 3 : typeof v === 'string' ? 4 : 5);

/** The database's ordering: null < false < true < numbers < strings < objects. */
export function cmpVal(a, b) {
  const ra = typeRank(a), rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return a - b;
  if (ra === 4) return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}

/** Apply a query `{ orderBy:'child'|'value'|'key', child, startAt, startAfter, endAt, limitToFirst,
 *  limitToLast }` to a node's children; the result is an object whose key order is the query order. */
export function runQuery(value, q) {
  if (!q || value === null || value === undefined || typeof value !== 'object') return value ?? null;
  const by = q.orderBy || 'key';
  const childPath = by === 'child' ? segs(q.child || '') : null;
  let rows = Object.keys(value).map((k) => {
    const v = value[k];
    return [k, v, by === 'child' ? getIn(v, childPath) : by === 'value' ? (typeof v === 'object' ? null : v) : k];
  });
  rows.sort((a, b) => cmpVal(a[2], b[2]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (q.startAt !== undefined && q.startAt !== null) rows = rows.filter((r) => cmpVal(r[2], q.startAt) >= 0);
  if (q.startAfter !== undefined && q.startAfter !== null) rows = rows.filter((r) => cmpVal(r[2], q.startAfter) > 0);
  if (q.endAt !== undefined && q.endAt !== null) rows = rows.filter((r) => cmpVal(r[2], q.endAt) <= 0);
  if (q.limitToFirst) rows = rows.slice(0, q.limitToFirst);
  if (q.limitToLast) rows = rows.slice(-q.limitToLast);
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) out[r[0]] = r[1];
  return out;
}

/** The `query.*` variables a rule sees for a read (null / false when the read is not a query). */
export function queryVars(q) {
  const by = q ? q.orderBy || 'key' : 'key';
  return {
    orderByKey: by === 'key',
    orderByValue: by === 'value',
    orderByPriority: false,
    orderByChild: by === 'child' ? q.child : null,
    startAt: q?.startAt ?? q?.startAfter ?? null,
    endAt: q?.endAt ?? null,
    equalTo: null,
    limitToFirst: q?.limitToFirst ?? null,
    limitToLast: q?.limitToLast ?? null,
  };
}
