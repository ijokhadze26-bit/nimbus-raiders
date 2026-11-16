// Sharded matrix run: node scripts/balance/runall.mjs <out.json> <N shards> [query]
// Starts N headless pages (scripts/balance/run.mjs on matrices.js with shard=k&of=N) in parallel and merges
// their cells (sorted by cell index) into one matrices output, the same shape as an unsharded run.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [out, nArg, query = ''] = process.argv.slice(2);
const N = Number(nArg) || 4;
const t0 = Date.now();
const parts = await Promise.all(Array.from({ length: N }, (_, k) => new Promise((res) => {
  const f = `${out}.shard${k}`;
  const p = spawn(process.execPath, ['scripts/balance/run.mjs', 'scripts/balance/matrices.js', f, `${query ? query + '&' : ''}shard=${k}&of=${N}`], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('close', (code) => res({ code, f }));
})));
const merged = { t: { total: Math.round((Date.now() - t0) / 1000) } };
for (const { code, f } of parts) {
  if (code) console.error('shard failed', f, code);
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  merged.quality = o.quality;
  for (const k of Object.keys(o)) if (Array.isArray(o[k])) (merged[k] || (merged[k] = [])).push(...o[k]);
  fs.unlinkSync(f);
}
for (const k of Object.keys(merged)) if (Array.isArray(merged[k]) && k !== 'fxErrors') merged[k].sort((a, b) => a.i - b.i);
fs.writeFileSync(out, JSON.stringify(merged) + '\n');
console.log(`merged ${N} shards -> ${out} in ${merged.t.total} s`);
process.exit(parts.some((p) => p.code) ? 1 : 0);
