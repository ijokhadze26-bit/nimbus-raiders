// Expands config/firebase/rules.src.mjs into config/firebase/database.rules.json: the one block the
// owner pastes into the Firebase console (Realtime Database -> Rules -> Publish).
//
//   node scripts/rules-build.mjs           write the file and print its size
//   node scripts/rules-build.mjs --check   exit 1 when the committed file is out of date (or does not parse)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rules, UNVERIFIED } from '../config/firebase/rules.src.mjs';
import { createRules } from '../src/online/rulescheck.js';

const OUT = fileURLToPath(new URL('../config/firebase/database.rules.json', import.meta.url));
const text = `${JSON.stringify(rules, null, 2)}\n`;

createRules(rules); // throws when any expression does not parse in the local checker

let count = 0;
let longest = 0;
(function walk(n) {
  for (const [k, v] of Object.entries(n)) {
    if (k === '.read' || k === '.write' || k === '.validate') { count++; longest = Math.max(longest, String(v).length); }
    else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
  }
})(rules.rules);

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (current !== text) {
    console.log('FAIL database.rules.json is out of date: run node scripts/rules-build.mjs');
    process.exit(1);
  }
  console.log(`PASS database.rules.json is up to date (${count} rules, ${text.length} bytes)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote config/firebase/database.rules.json: ${count} rules, ${text.length} bytes, longest expression ${longest} chars`);
  console.log(`minified: ${JSON.stringify(rules).length} bytes`);
  console.log(`not yet seen working on the real service (${UNVERIFIED.length} points): run scripts/rules-probe.mjs --live once the account exists`);
}
