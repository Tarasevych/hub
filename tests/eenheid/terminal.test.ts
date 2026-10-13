// Terminals (13.10.2026): de agent draait de shell ALLEEN in een wegwerpcontainer met harde vlaggen, geheime plekken afgedekt, root
// alleen uit de toegestane lijst, alleen-lezen roots blijven alleen-lezen; openen alleen als de terminal op het apparaat aan staat;
// in- en uitvoer stromen per sessie; sluiten en tijdslimiet ruimen op. Plus: de site stuurt 'term.open' nooit via de AI-wachtrij.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('terminal');
  const werk = mkdtempSync(join(tmpdir(), 'term-'));
  const bin = join(werk, 'bin'); mkdirSync(bin);
  symlinkSync(resolve('tests/eenheid/hulp/nep-term-runtime.mjs'), join(bin, 'podman'));
  chmodSync(resolve('tests/eenheid/hulp/nep-term-runtime.mjs'), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.NEP_TERM_DIR = werk;
  const root = join(werk, 'project'), ro = join(werk, 'backups');
  mkdirSync(join(root, 'src'), { recursive: true }); mkdirSync(join(root, 'geheim')); mkdirSync(join(root, 'src', '.ssh'), { recursive: true }); mkdirSync(ro);
  writeFileSync(join(root, '.env'), 'X=1'); writeFileSync(join(root, 'src', 'sleutel.pem'), 'k'); writeFileSync(join(root, 'leesmij.txt'), 'hoi');
  const agent = await import(resolve('deploy/agent/agent.mjs'));
  const { handlers, termArgs, _termBericht, _termSessies, _termKanaal } = agent;
  const cfgUit = { roots: [root, ro], readonlyRoots: [ro], terminal: { enabled: false } };
  const cfg = { roots: [root, ro], readonlyRoots: [ro], terminal: { enabled: true, runtime: 'podman', maxMinuten: 60 } };

  // ---------------------------------------------------------------- argumenten
  const sid = randomUUID();
  const { args, runtime } = await termArgs(cfg, { sid, root, schrijven: false, cols: 120, rows: 40 });
  const heeft = (...x: string[]) => x.every((v) => args.includes(v));
  check('container: geen netwerk, geen capabilities, no-new-privileges, alleen-lezen, limieten, --rm', runtime === 'podman' && heeft('--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--pids-limit', '--memory') && args[args.indexOf('--network') + 1] === 'none');
  check('root op /werk alleen-lezen (standaard)', args.includes(`${root}:/werk:ro`));
  check('geheime plekken afgedekt: map geheim, .ssh dieper, .env en .pem', args.includes('/werk/geheim:ro,size=1k') && args.includes('/werk/src/.ssh:ro,size=1k') && args.includes('/dev/null:/werk/.env:ro') && args.includes('/dev/null:/werk/src/sleutel.pem:ro'), args.filter((a) => a.includes('/werk/')).join(' '));
  check('pty via script(1) in de container, maat doorgegeven', args.includes('script') && args.some((a) => /stty cols 120 rows 40/.test(a)));
  check('schrijven: rw-koppeling', (await termArgs(cfg, { sid, root, schrijven: true })).args.includes(`${root}:/werk:rw`));
  const weigert = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test((e as Error).message); } };
  check('root buiten de lijst geweigerd', await weigert(() => termArgs(cfg, { sid, root: werk }), /not one of the allowed roots/));
  check('schrijven op alleen-lezen root geweigerd', await weigert(() => termArgs(cfg, { sid, root: ro, schrijven: true }), /read-only/));
  check('terminal uit op het apparaat → geweigerd', await weigert(() => handlers['term.open'](cfgUit, { sid, root }), /switched off/));
  check('ongeldige sessie-id geweigerd', await weigert(() => handlers['term.open'](cfg, { sid: 'x;rm', root }), /invalid session/));
  check('shells blijven verboden op de allow-list (geen terugval naar host-shell)', /'bash', 'sh'/.test(readFileSync('deploy/agent/agent.mjs', 'utf8')));

  // ---------------------------------------------------------------- stroom
  const verstuurd: any[] = [];
  _termKanaal({ send: (t: string) => verstuurd.push(JSON.parse(t)) });
  const s2 = randomUUID();
  const r = await handlers['term.open'](cfg, { sid: s2, root, minuten: 1, cols: 100, rows: 30 });
  check('term.open: sessie gestart, alleen-lezen', r.sid === s2 && r.alleenLezen === true && _termSessies.has(s2));
  const uitvoer = () => verstuurd.filter((m) => m.t === 'term.out' && m.sid === s2).map((m) => Buffer.from(m.d, 'base64').toString()).join('');
  for (let i = 0; i < 40 && !uitvoer().includes('werk$'); i++) await new Promise((x) => setTimeout(x, 50));
  _termBericht({ t: 'term.in', sid: s2, d: Buffer.from('echo hallo-terminal\r').toString('base64') });
  for (let i = 0; i < 40 && !uitvoer().includes('hallo-terminal'); i++) await new Promise((x) => setTimeout(x, 50));
  check('invoer → container → uitvoer terug (per sessie)', /hallo-terminal/.test(uitvoer()), uitvoer().slice(0, 120));
  _termBericht({ t: 'term.in', sid: randomUUID(), d: Buffer.from('echo vreemd\r').toString('base64') });
  await new Promise((x) => setTimeout(x, 200));
  check('invoer voor een onbekende sessie wordt genegeerd', !/vreemd/.test(uitvoer()));
  _termBericht({ t: 'term.close', sid: s2 });
  for (let i = 0; i < 40 && _termSessies.has(s2); i++) await new Promise((x) => setTimeout(x, 50));
  for (let i = 0; i < 40 && !/"rm","-f","mr-term-/.test(readFileSync(join(werk, 'log.txt'), 'utf8')); i++) await new Promise((x) => setTimeout(x, 50));
  check('term.close: sessie weg, term.exit gemeld, rm -f van de container', !_termSessies.has(s2) && verstuurd.some((m) => m.t === 'term.exit' && m.sid === s2) && /"rm","-f","mr-term-/.test(readFileSync(join(werk, 'log.txt'), 'utf8')));
  const s3 = randomUUID();
  await handlers['term.open'](cfg, { sid: s3, root, minuten: 1 });
  _termBericht({ t: 'term.in', sid: s3, d: Buffer.from('exit\r').toString('base64') });
  for (let i = 0; i < 40 && _termSessies.has(s3); i++) await new Promise((x) => setTimeout(x, 50));
  check('shell stopt zelf (exit) → sessie opgeruimd', !_termSessies.has(s3) && verstuurd.some((m) => m.t === 'term.exit' && m.sid === s3));

  // ---------------------------------------------------------------- site
  const gw = readFileSync('backend/connectors-gateway.ts', 'utf8');
  const ct = /export const COMMAND_TYPES = \[([\s\S]*?)\] as const;/.exec(gw)?.[1] ?? '';
  check('term.open staat NIET in COMMAND_TYPES (AI-wachtrij kan het niet sturen)', ct.length > 0 && !ct.includes('term.open'));
  check('agent-capabilities melden de terminal alleen als die aan staat', JSON.stringify(agent.handlers ? Object.keys(agent.handlers) : []).includes('term.open'));
  const tb = readFileSync('backend/terminal.ts', 'utf8');
  check('server: alleen eigen apparaten, stap-op, ticket eenmalig, invoer niet opgenomen', /store\.getAgent\(u\.id, agentId\)/.test(tb) && /x\.ticketHash = ''/.test(tb) && !/'i', /.test(tb) && /stepUp: true/.test(readFileSync('backend/terminal-routes.ts', 'utf8')));
  return einde();
}
