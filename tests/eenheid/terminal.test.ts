// Terminal van de agent (0.6): alleen in een wegwerpcontainer, nooit een shell op het apparaat.
// HUB_TERM_RUNTIME wijst naar nep-term-runtime.mjs (geen echte podman).
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { handlers, termArgs, _termBericht, _termKanaal, _termSessies } from '../../deploy/agent/agent.mjs';
import { checker } from './hulp/nep-google';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('terminal');
  const basis = mkdtempSync(join(tmpdir(), 'agent-term-'));
  process.env.NEP_TERM_DIR = basis;
  const nep = resolve('tests/eenheid/hulp/nep-term-runtime.mjs');
  chmodSync(nep, 0o755);
  process.env.HUB_TERM_RUNTIME = nep;
  const root = join(basis, 'werk');
  mkdirSync(join(root, '.ssh'), { recursive: true });
  writeFileSync(join(root, '.ssh', 'id_ed25519'), 'geheim-sleutel');
  writeFileSync(join(root, '.env'), 'TOKEN=geheim');
  writeFileSync(join(root, 'lees.txt'), 'hallo');
  const sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const uit: { t?: string; data?: string; code?: string; sid?: string }[] = [];
  _termKanaal({ send: (s: string) => { try { uit.push(JSON.parse(s)); } catch { /* geen json */ } } });
  const h = handlers as { 'term.open': (cfg: unknown, p: unknown) => Promise<unknown> };
  const geweigerd = async (fn: () => Promise<unknown>, re: RegExp) => {
    try { await fn(); return false; } catch (e) { return re.test(String((e as Error).message)); }
  };
  const log = () => {
    try { return readFileSync(join(basis, 'log.txt'), 'utf8'); } catch { return ''; }
  };
  try {
    const uitCfg = { roots: [root], allow: [], terminal: { enabled: false } };
    check('uit: term.open geweigerd', await geweigerd(() => h['term.open'](uitCfg, { sid, root, cols: 80, rows: 24 }), /not enabled/));

    const cfg = { roots: [root], allow: [], readonlyRoots: [] as string[], terminal: { enabled: true, runtime: 'podman', image: 'debian:12-slim', maxMinuten: 15, test: true } };
    const gebouwd = await termArgs(cfg, { sid, root, schrijven: false, cols: 80, rows: 24 }) as { args: string[]; runtime: string; naam: string };
    const vlak = gebouwd.args.join(' ');
    check('argumenten: geen netwerk, geen capabilities, no-new-privileges, alleen-lezen, map :ro',
      gebouwd.runtime === nep && /--network none/.test(vlak) && /--cap-drop ALL/.test(vlak) && /no-new-privileges/.test(vlak) && /--read-only/.test(vlak) && vlak.includes(`${root}:/werk:ro`));
    check('geheimen afgedekt: .ssh als tmpfs mode=000, .env naar /dev/null',
      vlak.includes(`/werk/.ssh:rw,noexec,nosuid,size=1m,mode=000`) && vlak.includes(`/dev/null:/werk/.env:ro`));
    check('schrijven in een alleen-lezen root geweigerd',
      await geweigerd(() => termArgs({ ...cfg, readonlyRoots: [root] }, { sid, root, schrijven: true, cols: 80, rows: 24 }), /read-only root/));

    const geopend = await h['term.open'](cfg, { sid, root, schrijven: false, cols: 80, rows: 24 }) as { naam: string };
    check('sessie open, naam mr-term-', typeof geopend.naam === 'string' && geopend.naam.startsWith('mr-term-') && _termSessies.has(sid));
    const tot = async (pred: () => boolean, ms = 2000) => {
      const eind = Date.now() + ms;
      while (Date.now() < eind) { if (pred()) return true; await wacht(30); }
      return pred();
    };
    const tekst = () => uit.filter((m) => m.t === 'term.out').map((m) => m.data || '').join('');
    check('container geeft een prompt', await tot(() => tekst().includes('werk$')), tekst().slice(0, 200));
    await _termBericht(cfg, { t: 'term.in', sid, data: 'echo hallo\n' });
    check('invoer komt terug als uitvoer (echo)', await tot(() => tekst().includes('hallo')), tekst().slice(0, 300));
    await _termBericht(cfg, { t: 'term.close', sid });
    check('sluiten: sessie weg en term.exit', !_termSessies.has(sid) && uit.some((m) => m.t === 'term.exit' && m.sid === sid && m.code === 'gesloten'));
    const naam = geopend.naam;
    check('container opgeruimd (rm -f)', await tot(() => log().includes(JSON.stringify(['rm', '-f', naam]))), log().slice(-400));
  } finally {
    for (const id of [..._termSessies.keys()]) await _termBericht({}, { t: 'term.close', sid: id });
  }
  return einde();
}
