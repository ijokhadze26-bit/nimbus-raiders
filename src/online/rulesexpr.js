// A small interpreter for the Realtime Database security-rule expression language, so the local hub
// can enforce the SAME rule text the owner pastes into the console (config/firebase/database.rules.json)
// instead of a hand-written copy that could drift.
//
// It is deliberately STRICTER than JavaScript, the way the real service is documented to be:
//   - && || ! and the ?: condition need real booleans
//   - + needs two numbers or two strings; - * / % need numbers; < <= > >= need two numbers or two strings
//   - reading a property of null is an error
// Any error makes the whole rule false (denied). A rule that passes here therefore never leans on a
// loose conversion the real service might refuse.

import { getIn, segs } from './tree.js';

export class RuleError extends Error {}
const fail = (m) => { throw new RuleError(m); };

/** RuleDataSnapshot: a location in a root value. */
export class Snap {
  constructor(root, path) { this.root = root; this.path = path; }
  val() { return getIn(this.root, this.path); }
  child(p) { if (typeof p !== 'string') fail('child() needs a string'); return new Snap(this.root, this.path.concat(segs(p))); }
  parent() { if (!this.path.length) fail('parent() of the root'); return new Snap(this.root, this.path.slice(0, -1)); }
  exists() { return this.val() !== null; }
  hasChild(p) { return this.child(p).exists(); }
  hasChildren(list) {
    const v = this.val();
    if (list === undefined) return v !== null && typeof v === 'object';
    if (!Array.isArray(list) || !list.length) fail('hasChildren() needs a list');
    return list.every((k) => this.child(k).exists());
  }
  isNumber() { return typeof this.val() === 'number'; }
  isString() { return typeof this.val() === 'string'; }
  isBoolean() { return typeof this.val() === 'boolean'; }
  getPriority() { return null; }
}

const SNAP_METHODS = new Set(['val', 'child', 'parent', 'exists', 'hasChild', 'hasChildren', 'isNumber', 'isString', 'isBoolean', 'getPriority']);
const STR_METHODS = {
  contains: (s, a) => s.includes(str(a)),
  beginsWith: (s, a) => s.startsWith(str(a)),
  endsWith: (s, a) => s.endsWith(str(a)),
  replace: (s, a, b) => s.split(str(a)).join(str(b)),
  toLowerCase: (s) => s.toLowerCase(),
  toUpperCase: (s) => s.toUpperCase(),
  matches: (s, re) => (re instanceof RegExp ? re.test(s) : fail('matches() needs a regular expression')),
};
function str(v) { return typeof v === 'string' ? v : fail('expected a string'); }
const num = (v) => (typeof v === 'number' ? v : fail('expected a number'));
const bool = (v) => (typeof v === 'boolean' ? v : fail('expected true or false'));

// ---------------------------------------------------------------- tokens
const PUNCT = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', '[', ']', ',', '.'];
const VARS = new Set(['auth', 'now', 'root', 'data', 'newData', 'query']);

function tokenize(src) {
  const out = [];
  let i = 0;
  const valueBefore = () => {
    const p = out[out.length - 1];
    return !!p && (p.t === 'num' || p.t === 'str' || p.t === 'id' || p.v === ')' || p.v === ']');
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; s += src[j++]; }
      if (j >= src.length) fail('unterminated string');
      out.push({ t: 'str', v: s });
      i = j + 1; continue;
    }
    if (c === '/' && !valueBefore()) {
      let j = i + 1, inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      if (j >= src.length) fail('unterminated regular expression');
      const body = src.slice(i + 1, j);
      let flags = '';
      j++;
      if (src[j] === 'i') { flags = 'i'; j++; }
      out.push({ t: 're', v: new RegExp(body, flags) });
      i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) fail(`unexpected character "${c}"`);
    out.push({ t: 'op', v: p });
    i += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- parser (precedence climbing)
const BIN = { '||': 1, '&&': 2, '===': 3, '!==': 3, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
  const eat = (v) => (isOp(v) ? toks[i++] : fail(`expected "${v}" in: ${src}`));

  function ternary() {
    const c = binary(1);
    if (!isOp('?')) return c;
    i++;
    const a = ternary();
    eat(':');
    return ['?', c, a, ternary()];
  }
  function binary(min) {
    let left = unary();
    for (;;) {
      const t = peek();
      const prec = t && t.t === 'op' ? BIN[t.v] : undefined;
      if (!prec || prec < min) return left;
      i++;
      left = [t.v, left, binary(prec + 1)];
    }
  }
  function unary() {
    if (isOp('!')) { i++; return ['not', unary()]; }
    if (isOp('-')) { i++; return ['neg', unary()]; }
    return postfix();
  }
  function args() {
    const list = [];
    if (!isOp(')')) do list.push(ternary()); while (isOp(',') && ++i);
    eat(')');
    return list;
  }
  function postfix() {
    let node = primary();
    for (;;) {
      if (isOp('.')) {
        i++;
        const name = peek();
        if (!name || name.t !== 'id') fail(`expected a name after "." in: ${src}`);
        i++;
        if (isOp('(')) { i++; node = ['call', node, name.v, args()]; } else node = ['get', node, name.v];
      } else if (isOp('[')) {
        i++;
        const k = ternary();
        eat(']');
        node = ['idx', node, k];
      } else return node;
    }
  }
  function primary() {
    const t = toks[i++];
    if (!t) fail(`unexpected end of: ${src}`);
    if (t.t === 'num' || t.t === 'str' || t.t === 're') return ['lit', t.v];
    if (t.t === 'id') {
      if (t.v === 'true') return ['lit', true];
      if (t.v === 'false') return ['lit', false];
      if (t.v === 'null') return ['lit', null];
      if (t.v[0] === '$' || VARS.has(t.v)) return ['var', t.v];
      fail(`unknown name "${t.v}" in: ${src}`);
    }
    if (t.v === '(') { const e = ternary(); eat(')'); return e; }
    if (t.v === '[') {
      const list = [];
      if (!isOp(']')) do list.push(ternary()); while (isOp(',') && ++i);
      eat(']');
      return ['arr', list];
    }
    return fail(`unexpected "${t.v}" in: ${src}`);
  }

  const ast = ternary();
  if (i < toks.length) fail(`unexpected "${toks[i].v}" in: ${src}`);
  return ast;
}

// ---------------------------------------------------------------- evaluator
const same = (a, b) => (a instanceof Snap || b instanceof Snap ? false : a === b);

function ev(n, env) {
  switch (n[0]) {
    case 'lit': return n[1];
    case 'var': {
      if (n[1][0] === '$') return n[1] in env.vars ? env.vars[n[1]] : fail(`no ${n[1]} here`);
      return env[n[1]] === undefined ? null : env[n[1]];
    }
    case 'arr': return n[1].map((x) => ev(x, env));
    case '?': return bool(ev(n[1], env)) ? ev(n[2], env) : ev(n[3], env);
    case '||': return bool(ev(n[1], env)) || bool(ev(n[2], env));
    case '&&': return bool(ev(n[1], env)) && bool(ev(n[2], env));
    case 'not': return !bool(ev(n[1], env));
    case 'neg': return -num(ev(n[1], env));
    case '===': case '==': return same(ev(n[1], env), ev(n[2], env));
    case '!==': case '!=': return !same(ev(n[1], env), ev(n[2], env));
    case '+': {
      const a = ev(n[1], env), b = ev(n[2], env);
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      return fail('+ needs two numbers or two strings');
    }
    case '-': return num(ev(n[1], env)) - num(ev(n[2], env));
    case '*': return num(ev(n[1], env)) * num(ev(n[2], env));
    case '/': return num(ev(n[1], env)) / num(ev(n[2], env));
    case '%': return num(ev(n[1], env)) % num(ev(n[2], env));
    case '<': case '<=': case '>': case '>=': {
      const a = ev(n[1], env), b = ev(n[2], env);
      if (typeof a !== typeof b || (typeof a !== 'number' && typeof a !== 'string')) fail(`${n[0]} needs two numbers or two strings`);
      return n[0] === '<' ? a < b : n[0] === '<=' ? a <= b : n[0] === '>' ? a > b : a >= b;
    }
    case 'get': {
      const o = ev(n[1], env);
      if (o === null) fail(`.${n[2]} of null`);
      if (typeof o === 'string') return n[2] === 'length' ? o.length : fail(`no string property ${n[2]}`);
      if (o instanceof Snap || typeof o !== 'object') fail(`.${n[2]} is not a property`);
      return o[n[2]] === undefined ? null : o[n[2]];
    }
    case 'idx': {
      const o = ev(n[1], env);
      if (o === null || typeof o !== 'object' || o instanceof Snap) fail('[] needs an object');
      const v = o[ev(n[2], env)];
      return v === undefined ? null : v;
    }
    case 'call': {
      const o = ev(n[1], env);
      const a = n[3].map((x) => ev(x, env));
      if (o instanceof Snap) return SNAP_METHODS.has(n[2]) ? o[n[2]](...a) : fail(`no snapshot method ${n[2]}`);
      if (typeof o === 'string') return STR_METHODS[n[2]] ? STR_METHODS[n[2]](o, ...a) : fail(`no string method ${n[2]}`);
      return fail(`.${n[2]}() on ${o === null ? 'null' : typeof o}`);
    }
    default: return fail(`bad node ${n[0]}`);
  }
}

const cache = new Map();

/** compile(source) -> (env) => value. Throws RuleError for a syntax error.
 *  env: { auth, now, root, data, newData, query, vars: { $name: value } } */
export function compile(src) {
  if (typeof src === 'boolean') return () => src;
  let fn = cache.get(src);
  if (!fn) {
    const ast = parse(String(src));
    fn = (env) => ev(ast, env);
    cache.set(src, fn);
  }
  return fn;
}

/** Evaluate a rule to a plain yes/no: anything but a clean `true` (errors included) is a no.
 *  `trace`, when given, receives the error message. */
export function allows(fn, env, trace) {
  try {
    return fn(env) === true;
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    if (trace) trace(e.message);
    return false;
  }
}
