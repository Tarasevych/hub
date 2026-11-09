// Draait elk tests/eenheid/*.test.ts in een eigen proces; telt OK/FOUT en exitcode.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
const uitJson = process.argv[2]; const filter = process.argv[3] || '';
mkdirSync('rapporten/eenheid-int', { recursive: true });
const res = {};
for (const f of readdirSync('tests/eenheid').filter(n => n.endsWith('.test.ts') && n.includes(filter)).sort()) {
  const uit = resolve('rapporten/eenheid-int', f.replace(/\.ts$/, '.mjs'));
  try { await build({ entryPoints: [join('tests/eenheid', f)], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'silent' }); }
  catch (e) { res[f] = { ok: 0, fout: 0, code: 'BUILD', laatste: String(e.message).slice(0, 300) }; continue; }
  const r = spawnSync('node', ['-e', `import(${JSON.stringify('file://' + uit)}).then(async m=>{const c=await m.main();process.exit(c||0)}).catch(e=>{console.error('CRASH',e);process.exit(99)})`], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = (out.match(/^(OK\b|✔)/gm) || []).length, fout = (out.match(/^(FOUT\b|✘)/gm) || []).length;
  res[f] = { ok, fout, code: r.status ?? r.signal, crash: /CRASH|TypeError|ReferenceError/.test(out), foutregels: out.split('\n').filter(l => /^FOUT|CRASH|Error/.test(l)).slice(0, 6).map(l => l.slice(0, 250)) };
  process.stdout.write(`${f} ok=${ok} fout=${fout} code=${res[f].code}\n`);
  writeFileSync(uitJson, JSON.stringify(res, null, 1));
}
