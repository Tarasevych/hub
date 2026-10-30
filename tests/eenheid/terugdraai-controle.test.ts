// 29.10.2026 — eigenaar: «відкат не спрацював, графіки не показали збій, автовідкату не було, у пакеті порожньо хто/коміт/sha256».
// Toetst: (A) de logica van de terugdraai-wizard, (B) pakketgegevens (installer-hulp, gebeurtenis, commit-tekst), (C) de tellers voor
// toegangsfouten, de momentopname en de diepe gezondheidscontrole (in orde, opgeruimd, en kapot zoals de storing van 28.10).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { kiesUitPakket, nietOpgepakt, regelsSamenvoegen, vijfLaatste, type Release } from '../../src/besluit/terugdraai-logica';
import { commitWeergave } from '../../shared/bron-commit';
import { parseRootGebeurtenissen } from '../../backend/server-beheer';
import { _tellersLeeg, meldingSoort, routegroep, tellingUur, tellerStand, telStatus, telTechMelding } from '../../backend/toegangsfout-tellers';
import { leesMomentopname, maakMomentopname } from '../../backend/beheer-overzicht-momentopnamen';
import { diepeControle, PROEF_GEBRUIKER, vanDezeServer } from '../../backend/diepe-gezondheid';
import type { PakketInfo } from '../../src/platform/tar-lezen';

const rel = (naam: string, x: Partial<Release> = {}): Release => ({ naam, commit: '', actief: false, vorige: false, bruikbaar: true, versie: naam, ...x });
const pakket = (x: Partial<PakketInfo>): PakketInfo => ({ versie: '', commit: '', bovenmap: '', bestanden: 1, installer: true, auteur: 'Pavlo Tarasevych', agent: 'grok', samenvatting: 'x'.repeat(30), problemen: [], ...x });

export async function main(): Promise<number> {
  const { check, einde } = checker('terugdraai-controle');

  // ---- A. wizard-logica
  const rs = [rel('20261028-224316', { actief: true }), rel('20261028-215049', { vorige: true, bronCommit: 'zonder-git:basis agenda' }), rel('20261028-203043'),
    rel('20261028-194502'), rel('20261028-193136'), rel('20261028-191200'), rel('20261028-190648'), rel('20261027-120000', { bruikbaar: false })];
  const v = vijfLaatste(rs);
  check('vijf laatste: precies 5, nieuwste eerst, zonder de actieve', v.length === 5 && v[0].naam === '20261028-215049' && !v.some((k) => k.naam === '20261028-224316'), v.map((k) => k.naam).join(','));
  check('vijf laatste: onvolledige versie nooit', !v.some((k) => k.naam === '20261027-120000'));
  const p1 = kiesUitPakket(pakket({ versie: '20261028-215049', commit: 'zonder-git:basis agenda' }), rs);
  check('pakket van het apparaat = versie op de server → keuze', p1.ok && p1.keuze.naam === '20261028-215049');
  const p2 = kiesUitPakket(pakket({ versie: '20250101-000000' }), rs);
  check('pakket dat niet op de server staat → NIET_OP_SERVER (ouder pakket installeren kan niet)', !p2.ok && p2.code === 'NIET_OP_SERVER');
  const p3 = kiesUitPakket(pakket({ versie: '20261028-224316' }), rs);
  check('pakket van de actieve versie → IS_ACTIEF', !p3.ok && p3.code === 'IS_ACTIEF');
  const p4 = kiesUitPakket(pakket({ versie: '20261028-215049', commit: 'a'.repeat(40) }), rs);
  check('zelfde versie, andere code → COMMIT_VERSCHILT', !p4.ok && p4.code === 'COMMIT_VERSCHILT');
  const p5 = kiesUitPakket(pakket({ versie: '20261028-215049', problemen: ['GEEN_INSTALLER'] }), rs);
  check('kapot pakket → PAKKET_KAPOT', !p5.ok && p5.code === 'PAKKET_KAPOT');
  check('60 s nog in de inbox → melding', nietOpgepakt({ inInbox: true, seconden: 60 }) && !nietOpgepakt({ inInbox: true, seconden: 59 }) && !nietOpgepakt({ inInbox: false, seconden: 600 }));
  const m = regelsSamenvoegen([{ tijd: '2026-10-29T10:00:02Z', niveau: 'info', tekst: 'b', bron: 'site' }], [{ tijd: '2026-10-29T10:00:01Z', niveau: 'ok', tekst: 'a', bron: 'server' }, { tijd: '2026-10-29T10:00:01Z', niveau: 'ok', tekst: 'a', bron: 'server' }]);
  check('terminal: regels op tijd, zonder dubbele', m.length === 2 && m[0].tekst === 'a');

  // ---- B. pakketgegevens
  check('commit-tekst: geen onware «до правила 3» meer', !commitWeergave('uk', '').lang.includes('правила 3') && !commitWeergave('nl', '').lang.includes('regel 3'));
  check('commit-tekst: zonder-git wordt getoond als «поза git» met reden', commitWeergave('uk', 'zonder-git:op basis van 215049').lang.includes('op basis van 215049'));
  const map = mkdtempSync(join(tmpdir(), 'pg-'));
  writeFileSync(join(map, 'AUTEUR'), 'Pavlo Tarasevych\n'); writeFileSync(join(map, 'AGENT'), 'grok\n');
  writeFileSync(join(map, 'PAKKET-BRON-COMMIT'), 'zonder-git:op basis 20261028-215049 plus herstel\n');
  let pgj: Record<string, unknown> = {};
  try { pgj = JSON.parse(execFileSync('python3', ['deploy/pakketgegevens.py', map, JSON.stringify({ pakket_sha256: 'b'.repeat(64), pakket_bytes: 1234 })], { encoding: 'utf8' })); } catch (e) { check('pakketgegevens.py draait', false, (e as Error).message); }
  check('installer-hulp: auteur, agent, zonder-git, sha256, grootte, tijd', pgj.auteur === 'Pavlo Tarasevych' && pgj.agent === 'grok' && String(pgj.bron_commit).startsWith('zonder-git:') && pgj.sha256 === 'b'.repeat(64) && pgj.bytes === 1234 && !!pgj.geinstalleerd_op, JSON.stringify(pgj));
  writeFileSync(join(map, 'PAKKET-BRON-COMMIT'), 'unknown\n'); writeFileSync(join(map, 'AGENT'), 'Grok Bot!\n');
  const pg2 = JSON.parse(execFileSync('python3', ['deploy/pakketgegevens.py', map], { encoding: 'utf8' }));
  check('installer-hulp: «unknown» en een ongeldige agent worden leeg', pg2.bron_commit === '' && pg2.agent === '');
  const g = parseRootGebeurtenissen(JSON.stringify({ id: '20261029T100000000000Z-abcd1234', tijd: '2026-10-29T10:00:00Z', bron: 'uitrol', code: 'SSH_OK', niveau: 'info', uk: 'x', nl: 'x', tag: '20261029-100000', auteur: 'Pavlo Tarasevych', agent: 'grok', bron_commit: 'zonder-git:op basis 215049', goedkeuring: 'ssh-root', pakket_sha256: 'c'.repeat(64), pakket_bytes: 99 }))[0];
  check('gebeurtenis: auteur, agent, volledige BRON-COMMIT en «ssh-root» gelezen', g?.auteur === 'Pavlo Tarasevych' && g.agent === 'grok' && g.bronCommit === 'zonder-git:op basis 215049' && g.goedkeuring === 'ssh-root' && g.pakketSha256 === 'c'.repeat(64), JSON.stringify(g));

  // ---- C. tellers + momentopname
  _tellersLeeg();
  check('routegroepen', routegroep('/assets/tech/a.js') === 'tech-bundels' && routegroep('/api/owner/tech/status') === 'tech-api' && routegroep('/api/owner/besluit/status') === 'beheer-api' && routegroep('/api/mail/x') === 'api' && routegroep('/agenda') === 'paginas');
  const nu = Date.UTC(2026, 9, 29, 10, 30);
  for (let i = 0; i < 7; i++) telStatus('/assets/tech/x.js', 404, nu);
  telStatus('/api/owner/tech/status', 401, nu); telStatus('/agenda', 200, nu); telTechMelding(nu);
  const t = tellingUur(Math.floor(nu / 3_600_000));
  check('tellen: 7× 404 op technische bestanden, 1× 401, melding apart, 200 telt niet', t['tech-bundels'].n404 === 7 && t['tech-api'].n401 === 1 && t['tech-melding'].n404 === 1 && t.paginas.n404 === 0);
  check('live stand bevat het laatste etmaal', tellerStand(nu).laatste24['tech-bundels'].n404 === 7);
  const ov = { kpi: { gebruikers: 1, nieuw24: 0, online: 0, actieveSessies: 0, apparaten: 0, events1u: 0, events24: 0, fouten24: 0 }, diensten: { ok: 1, letop: 0, fout: 0, onbekend: 0 }, wachtrij: { toegang: 0, uitrol: 0, gebruikers: 0 } } as never;
  const mo = leesMomentopname(JSON.parse(JSON.stringify(maakMomentopname(ov, t))));
  check('momentopname bewaart 404/401 per groep (en blijft klein)', mo.t404 === 8 && mo.t401 === 1 && mo.tf['tech-bundels'][0] === 7 && JSON.stringify(mo).length < 1500, JSON.stringify(mo.tf));
  check('oude momentopname zonder tellers → 0', leesMomentopname({ gebruikers: 2 }).t404 === 0);
  check('melding: alleen een nette soort', meldingSoort('{"soort":"NIET_ACTIEF"}') === 'NIET_ACTIEF' && meldingSoort('{"soort":"<script>"}') === 'ONBEKEND' && meldingSoort('rommel') === 'ONBEKEND');
  check('diepe controle alleen vanaf de server zelf', vanDezeServer('127.0.0.1', {}) && vanDezeServer('::ffff:127.0.0.1', {}) && !vanDezeServer('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' }) && !vanDezeServer('10.0.0.5', {}));

  // ---- C. diepe gezondheidscontrole tegen de database
  const sys = getPool('systeem');
  const d1 = await diepeControle('/bestaat-niet');
  check('diepe controle: in orde op het huidige schema', d1.ok, JSON.stringify(d1.stappen.filter((s) => !s.ok)));
  const over = (await sys.query(`SELECT count(*)::int AS n FROM app.tech_ruimte_sessies WHERE user_id = $1`, [PROEF_GEBRUIKER])).rows[0].n;
  const sleutels = (await sys.query(`SELECT count(*)::int AS n FROM app.tech_asset_toegang WHERE user_id = $1`, [PROEF_GEBRUIKER])).rows[0].n;
  check('diepe controle: niets blijft achter (proefsessie en proefsleutel opgeruimd)', over === 0 && sleutels === 0, `${over}/${sleutels}`);
  // De storing van 28.10 nabootsen: een sleutel aan een technische ruimtesessie kan niet worden opgeslagen.
  const eigenaar = process.env.DATABASE_URL ? new pg.Client({ connectionString: process.env.DATABASE_URL }) : null;
  if (eigenaar) {
    await eigenaar.connect();
    try {
      await eigenaar.query(`ALTER TABLE app.tech_asset_toegang ADD CONSTRAINT eenheid_storing_28_10 CHECK (ruimte_sessie_id IS NULL) NOT VALID`);
      await new Promise((r) => setTimeout(r, 5200));   // cache van 5 s van de vorige uitslag laten verlopen
      const d2 = await diepeControle('/bestaat-niet');
      check('diepe controle: ziet de storing van 28.10 (geen cookie → technische bestanden dicht)', !d2.ok && d2.stappen.some((s) => !s.ok && /toegangscookie|proefsessie-of-cookie/.test(s.id)), JSON.stringify(d2.stappen));
      const over2 = (await sys.query(`SELECT count(*)::int AS n FROM app.tech_ruimte_sessies WHERE user_id = $1`, [PROEF_GEBRUIKER])).rows[0].n;
      check('diepe controle: ook bij een storing opgeruimd', over2 === 0);
    } finally {
      await eigenaar.query(`ALTER TABLE app.tech_asset_toegang DROP CONSTRAINT IF EXISTS eenheid_storing_28_10`).catch(() => undefined);
      await eigenaar.end();
    }
  } else check('storing nabootsen vraagt DATABASE_URL (eigenaarrol)', false);
  return einde();
}
