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
// A page now and then stops answering (idle Chrome, no CPU) while several dev servers start at once: a shard
// that takes longer than LIMIT s is killed and started again (results are deterministic, so a retry is safe).
const LIMIT = Number(process.env.SHARD_LIMIT || 420);
function shard(k, attempt = 1) {
  return new Promise((res) => {
    const f = `${out}.shard${k}`;
    const p = spawn(process.execPath, ['scripts/balance/run.mjs', 'scripts/balance/matrices.js', f, `${query ? query + '&' : ''}shard=${k}&of=${N}`], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], detached: true });
    const timer = setTimeout(() => { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }, LIMIT * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && attempt < 3) { console.error(`shard ${k} failed or timed out (attempt ${attempt}), retrying`); res(shard(k, attempt + 1)); } else res({ code, f });
    });
  });
}
const parts = await Promise.all(Array.from({ length: N }, (_, k) => shard(k)));
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
