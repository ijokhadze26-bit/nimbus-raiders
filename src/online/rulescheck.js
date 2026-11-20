// The Realtime Database's rule-tree semantics in plain JS, over the real rule text
// (config/firebase/rules.src.mjs -> database.rules.json). The local hub applies this to every read and
// write, and the shared test vectors run against it and - later - against the real database.
//
// What is modelled (and so what the rules may lean on):
//   .read / .write  grant when ANY rule on the way from the root down to the location says yes;
//                   rules below the location are never consulted.
//   .validate       must hold at EVERY location on the way down that still has data after the write,
//                   and at every location inside the written value. Not checked where the data is removed.
//   $wildcards      match any key that has no rule of its own; their value is the key (a string).
//   multi-path update: every path is checked on its own, with newData showing the whole update.
//   root / data     are the data BEFORE the write; newData is the data AFTER it.
// Whether the real service agrees on the points SPEC4 section 13 lists is exactly what
// scripts/rules-probe.mjs --live is for.

import { queryVars } from './tree.js';
import { Snap, compile, allows } from './rulesexpr.js';

const META = new Set(['.read', '.write', '.validate', '.indexOn']);

function prepare(node, where, errors) {
  const out = { kids: {}, wild: null, wildName: null, read: null, write: null, validate: null };
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (key === '.indexOn') continue;
    if (key === '.read' || key === '.write' || key === '.validate') {
      try {
        out[key.slice(1)] = compile(v);
      } catch (e) {
        errors.push(`${where}/${key}: ${e.message}`);
      }
    } else if (key[0] === '.') {
      errors.push(`${where}/${key}: unknown rule kind`);
    } else if (key[0] === '$') {
      if (out.wild) errors.push(`${where}: two wildcards`);
      out.wild = prepare(v, `${where}/${key}`, errors);
      out.wildName = key;
    } else {
      out.kids[key] = prepare(v, `${where}/${key}`, errors);
    }
  }
  return out;
}

/** The rule node for `key` under `node` (binding the wildcard in `vars`), or null when no rule applies. */
function step(node, key, vars) {
  if (!node) return null;
  if (Object.prototype.hasOwnProperty.call(node.kids, key)) return node.kids[key];
  if (node.wild) { vars[node.wildName] = key; return node.wild; }
  return null;
}

/**
 * createRules(json) -> { read(...), write(...), errors }
 * `json` is the pasted block `{ rules: {...} }` (or the inner object). Throws when a rule does not parse.
 */
export function createRules(json) {
  const errors = [];
  const tree = prepare(json.rules || json, '', errors);
  if (errors.length) throw new Error(`rules do not parse:\n  ${errors.join('\n  ')}`);

  /** May `auth` read `path` (array of keys)? `query` is the transport query object or null. */
  function read(auth, path, root, now, query) {
    const vars = {};
    const base = { auth, now, root: new Snap(root, []), query: queryVars(query), vars };
    let node = tree;
    for (let d = 0; d <= path.length && node; d++) {
      if (node.read) {
        const at = path.slice(0, d);
        if (allows(node.read, { ...base, data: new Snap(root, at), newData: null })) return true;
      }
      if (d < path.length) node = step(node, path[d], vars);
    }
    return false;
  }

  function validateInside(node, path, value, base, vars, newRoot, root) {
    if (!node || value === null || typeof value !== 'object') return null;
    for (const key of Object.keys(value)) {
      const kv = { ...vars };
      const kid = step(node, key, kv);
      if (!kid) continue;
      const at = path.concat(key);
      if (kid.validate) {
        let why = '';
        const env = { ...base, vars: kv, data: new Snap(root, at), newData: new Snap(newRoot, at) };
        if (!allows(kid.validate, env, (m) => { why = m; })) return { ok: false, kind: 'validate', path: at.join('/'), why };
      }
      const deeper = validateInside(kid, at, value[key], base, kv, newRoot, root);
      if (deeper) return deeper;
    }
    return null;
  }

  /**
   * May `auth` make this write? `paths` are the written locations (arrays of keys), `root` the data
   * before and `newRoot` the data after ALL of them are applied.
   * -> { ok: true } or { ok: false, kind: 'write' | 'validate', path, why }
   */
  function write(auth, paths, root, newRoot, now) {
    const rootSnap = new Snap(root, []);
    for (const path of paths) {
      const vars = {};
      const base = { auth, now, root: rootSnap, query: null };
      const chain = []; // the rule node and its variables at every depth of the path
      let node = tree;
      for (let d = 0; d <= path.length; d++) {
        chain.push(node ? { node, env: { ...base, vars: { ...vars }, data: new Snap(root, path.slice(0, d)), newData: new Snap(newRoot, path.slice(0, d)) } } : null);
        if (d < path.length) node = step(node, path[d], vars);
      }
      if (!chain.some((c) => c && c.node.write && allows(c.node.write, c.env))) {
        return { ok: false, kind: 'write', path: path.join('/'), why: 'no .write rule said yes' };
      }
      for (let d = 0; d <= path.length; d++) {
        const c = chain[d];
        if (!c || !c.node.validate || !c.env.newData.exists()) continue;
        let why = '';
        if (!allows(c.node.validate, c.env, (m) => { why = m; })) return { ok: false, kind: 'validate', path: path.slice(0, d).join('/'), why };
      }
      const inside = validateInside(node, path, new Snap(newRoot, path).val(), base, vars, newRoot, root);
      if (inside) return inside;
    }
    return { ok: true };
  }

  return { read, write, errors, tree };
}

export { META as RULE_KEYS };
