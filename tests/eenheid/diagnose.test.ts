// Etap 4 (13.10.2026): diagnose «для всіх чи лише для мене». Oordeel, opschonen van wat de browser stuurt, servercontroles
// (zonder geheimen), cache, versie-bundel en de tabel van verslagen (beperkingen + RLS).
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { BROWSER_CONTROLES, CONTROLES, SERVER_CONTROLES, oordeel, type Uitslag } from '../../shared/diagnose';
import { cacheLegen, huidigeBundel, schoonUitslagen, serverControles, serverControlesGecached } from '../../backend/diagnose';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('diagnose');
  const u = (id: Uitslag['id'], stand: Uitslag['stand']): Uitslag => ({ id, stand });

  // ---------------------------------------------------------------- oordeel
  check('6 servercontroles en 6 browsercontroles; elke browsercontrole met advies', SERVER_CONTROLES.length === 6 && BROWSER_CONTROLES.length === 6 && BROWSER_CONTROLES.every((id) => CONTROLES[id].advies));
  check('alles in orde → alles-ok', oordeel([u('database', 'ok'), u('sessie', 'ok')]).oordeel === 'alles-ok');
  check('serverfout → для всіх', oordeel([u('database', 'fout'), u('sessie', 'ok')]).oordeel === 'iedereen');
  check('alleen browser (let op telt mee) → лише у вас', oordeel([u('database', 'ok'), u('versie', 'let-op')]).oordeel === 'alleen-ik');
  check('beide → beide', oordeel([u('schema', 'fout'), u('sessie', 'fout')]).oordeel === 'beide');
  check('alleen onbekend → onzeker (niet gokken)', oordeel([u('mcp-deur', 'onbekend'), u('klok', 'onbekend')]).oordeel === 'onzeker');
  check('onbekend telt niet als probleem', oordeel([u('mcp-deur', 'onbekend'), u('database', 'ok')]).oordeel === 'alles-ok');

  // ---------------------------------------------------------------- opschonen
  const vies = schoonUitslagen([
    { id: 'versie', stand: 'let-op', code: 'OUDE_VERSIE', ms: 12.6 }, { id: 'versie', stand: 'ok' }, { id: 'hack', stand: 'ok' },
    { id: 'klok', stand: 'kapot' }, { id: 'sessie', stand: 'fout', code: '<script>' }, { id: 'snelheid', stand: 'ok', ms: -5 }, 'x', null,
  ]);
  check('opschonen: alleen bekende ids/standen, geen dubbelen, geen vreemde codes of negatieve tijden', JSON.stringify(vies) === JSON.stringify([{ id: 'versie', stand: 'let-op', ms: 13, code: 'OUDE_VERSIE' }, { id: 'sessie', stand: 'fout' }, { id: 'snelheid', stand: 'ok' }]), JSON.stringify(vies));
  check('opschonen: geen array → leeg, max 20', schoonUitslagen({}).length === 0 && schoonUitslagen(Array.from({ length: 50 }, () => ({ id: 'online', stand: 'ok' }))).length === 1);

  // ---------------------------------------------------------------- servercontroles
  const vorige = process.env.DIST_DIR;
  const d = mkdtempSync(join(tmpdir(), 'diag-dist-'));
  writeFileSync(join(d, 'index.html'), '<script type="module" crossorigin src="./assets/index-AbC_12-x.js"></script>');
  process.env.DIST_DIR = d;
  check('versie: hoofdbundel uit dist/index.html', (await huidigeBundel()) === 'index-AbC_12-x.js');
  process.env.DIST_DIR = join(d, 'bestaat-niet');
  check('versie: geen index.html → leeg (onbekend, geen fout)', (await huidigeBundel()) === '');
  process.env.DIST_DIR = vorige;
  const uit = await serverControles();
  check('servercontroles: alle 6, elk met duur', uit.length === 6 && SERVER_CONTROLES.every((id) => uit.some((x) => x.id === id && typeof x.ms === 'number')), JSON.stringify(uit));
  check('database ok; schema ok of onbekend (nooit vals alarm)', uit.find((x) => x.id === 'database')?.stand === 'ok' && ['ok', 'onbekend'].includes(String(uit.find((x) => x.id === 'schema')?.stand)), JSON.stringify(uit.find((x) => x.id === 'schema')));
  check('servercontroles lekken geen paden, adressen of sleutels', !/[/\\@]|postgres|key|token/i.test(JSON.stringify(uit.map(({ id, stand, code }) => ({ id, stand, code })))));
  cacheLegen();
  const a = serverControlesGecached(1_000), b = serverControlesGecached(20_000), c = serverControlesGecached(40_000);
  check('cache 30 s: dezelfde run binnen 30 s, nieuwe daarna', a === b && b !== c);
  await Promise.all([a, c]);
  const bron = readFileSync('backend/diagnose.ts', 'utf8');
  check('verslagen lezen alleen met diagnose.lezen in actief technisch profiel', /heeftTechMogelijkheid\(auth\.user\.id, tab, 'diagnose\.lezen'\)/.test(bron) && (bron.match(/TECH_DIAGNOSE_VEREIST/g) || []).length === 2);

  // ---------------------------------------------------------------- tabel
  const sys = getPool('systeem');
  const id = randomUUID();
  const fout = async (sql: string, p: unknown[]) => sys.query(sql, p).then(() => 'ok', (e) => String(e.code));
  check('db: onbekend oordeel geweigerd', (await fout(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen) VALUES ($1,'mcp','raar','[]')`, [id])) === '23514');
  check('db: beschrijving > 500 geweigerd', (await fout(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen, beschrijving) VALUES ($1,'mcp','alles-ok','[]',$2)`, [id, 'x'.repeat(501)])) === '23514');
  check('db: geen array als uitslagen geweigerd', (await fout(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen) VALUES ($1,'mcp','alles-ok','{}')`, [id])) === '23514');
  check('db: geldige rij via systeemrol', (await fout(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen) VALUES ($1,'mcp','alles-ok','[]')`, [id])) === 'ok');
  check('db: app-rol kan niet schrijven', (await getPool('app').query(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen) VALUES ($1,'mcp','alles-ok','[]')`, [id]).then(() => 'ok', (e) => String(e.code))) === '42501');
  await sys.query('DELETE FROM app.diagnose_meldingen WHERE user_id=$1', [id]);
  return einde();
}
