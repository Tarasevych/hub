// «Захист» (/diagnostiek, migratie 0066): auth-poort, OPA fail-closed en RLS met één beslissing van de eigenaar.
//  - zuiver: gereedheidscontroles (positief/negatief), zekering (piek → uit; normale ruis en hoge basis → niet), tellers, omgeving gaat voor;
//  - hekken: niet-eigenaar → 403, zonder technisch profiel → 403, zonder passkey → 403 STEP_UP_REQUIRED, passkey eenmalig, agent nooit;
//  - schakelen zonder herstart: poortNaVerzoek geeft meteen 401; uitzetten zonder passkey; zekering zet zelf uit (+ journaal + melding);
//  - RLS op de echte database: rol, policy's, isolatieproef met synthetische rijen (ROLLBACK) — en dezelfde proef vindt een lek;
//    met rollen (run-test-rls.sh) ook echt aan/uit + de zekering die RLS terugzet;
//  - root-kant: polkit alleen «start» van de vaste unit, installer kopieert alleen, db-rollen-instellen.sh instellen-als-nodig doet niets
//    als DATABASE_URL_APP er al is.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { checker } from './hulp/nep-google';
import { appRolActief, getPool } from '../../server/platform/pg';
import { poortAfdwingen, poortNaVerzoek } from '../../server/platform/auth-poort';
import '../../server/platform/rls-audit';
import { metVerzoek } from '../../server/platform/context';
import { _schakelaarsReset, schakelaarLokaal } from '../../server/platform/schakelaars';
import { _tellerLeeg, som, tel, telAntwoord, telFout } from '../../server/platform/antwoord-teller';
import { _afdwingenCacheLeeg, afdwingenAan, afdwingenBron } from '../../backend/beleid';
import { agentRouteVerboden } from '../../backend/agent-namens';
import { registreerMelder } from '../../backend/melder';
import { passkeyStapOpVastleggen } from '../../backend/stap-op';
import * as tp from '../../backend/tech-profiel';
import * as bv from '../../backend/beveiliging-schakelaars';

const lees = (p: string) => readFileSync(p, 'utf8');
type Res = { statusCode: number; body: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('beveiliging-schakelaars');
  const env0 = { a: process.env.AUTH_POORT_AFDWINGEN, o: process.env.OPA_AFDWINGEN };
  delete process.env.AUTH_POORT_AFDWINGEN; delete process.env.OPA_AFDWINGEN;

  // ------------------------------------------------------------ zuiver: gereedheid
  const anon = (route: string, aantal = 3) => ({ route, tbl: '-', actie: 'anoniem-2xx', aantal });
  const p1 = bv.poortControles([], true, null);
  check('poort: geen anonieme 2xx + schaduw loopt → klaar', bv.isKlaar(p1));
  const p2 = bv.poortControles([anon('POST /api/owner/vergeten-controle')], true, null);
  check('poort (neg): anonieme 2xx buiten allowlist → niet klaar, route in de lijst', !bv.isKlaar(p2) && p2.find((x) => x.id === 'anoniem-2xx')?.lijst?.[0]?.naam === 'POST /api/owner/vergeten-controle');
  check('poort: anonieme 2xx op een publieke route telt niet', bv.isKlaar(bv.poortControles([anon('GET /api/_healthcheck')], true, null)));
  check('poort (neg): schaduw loopt niet → niet klaar', !bv.isKlaar(bv.poortControles([], false, null)));
  check('poort (neg): AUTH_POORT_AFDWINGEN=0 → niet klaar', !bv.isKlaar(bv.poortControles([], true, 'uit')));

  const tech = { actief: true, mogelijkheden: ['users.manage', 'roles.delegate', 'journaal.lezen', 'diagnose.lezen', 'diensten.beheren'] };
  const goed = [{ actie: 'admin:admin.read', uitkomst: 'gelijk', reden: '', aantal: 40 }];
  check('OPA: gezond, schaduw met data, geen verschil/weigering, techprofiel → klaar', bv.isKlaar(bv.opaControles({ gezond: true, schaduw: true, rijen: goed, env: null, tech })));
  check('OPA (neg): onbereikbaar → niet klaar', !bv.isKlaar(bv.opaControles({ gezond: false, schaduw: true, rijen: goed, env: null, tech })));
  check('OPA (neg): geen schaduwdata in de periode → niet klaar', !bv.isKlaar(bv.opaControles({ gezond: true, schaduw: true, rijen: [], env: null, tech })));
  const w = bv.opaControles({ gezond: true, schaduw: true, rijen: [...goed, { actie: 'admin:users.manage', uitkomst: 'doel-weigert', reden: 'tech-niet-actief', aantal: 7 }, { actie: 'admin:users.manage', uitkomst: 'onbereikbaar', reden: '', aantal: 2 }], env: null, tech });
  check('OPA (neg): «zou geweigerd zijn» → niet klaar, per actie geteld (7+2)', !bv.isKlaar(w) && w.find((x) => x.id === 'weigeringen')?.lijst?.[0]?.aantal === 9);
  check('OPA (neg): verschil app/OPA → niet klaar', !bv.isKlaar(bv.opaControles({ gezond: true, schaduw: true, rijen: [...goed, { actie: 'admin:x', uitkomst: 'verschil', reden: 'r', aantal: 1 }], env: null, tech })));
  check('OPA (neg): geen technisch profiel → niet klaar', !bv.isKlaar(bv.opaControles({ gezond: true, schaduw: true, rijen: goed, env: null, tech: null })));
  const mist = bv.opaControles({ gezond: true, schaduw: true, rijen: goed, env: null, tech: { actief: true, mogelijkheden: [] } });
  check('OPA: ontbrekende mogelijkheden = waarschuwing (info), blokkeert niet', bv.isKlaar(mist) && mist.find((x) => x.id === 'mogelijkheden')?.ok === false);

  const rolGoed = { bestaat: true, login: true, bypass: false, superuser: false };
  const rlsBasis = { appUrl: true, rol: rolGoed, verbinding: { ok: true, rol: 'mijnruimte_app', bypass: false }, tabellen: [{ tabel: 'records', rls: true, policies: 4 }], proef: { ok: true, detail: '' }, audit: [], installatie: null };
  check('RLS: alles in orde → klaar', bv.isKlaar(bv.rlsControles(rlsBasis)));
  check('RLS (neg): geen DATABASE_URL_APP → niet klaar', !bv.isKlaar(bv.rlsControles({ ...rlsBasis, appUrl: false, verbinding: null, proef: null })));
  check('RLS (neg): rol met BYPASSRLS → niet klaar', !bv.isKlaar(bv.rlsControles({ ...rlsBasis, rol: { ...rolGoed, bypass: true } })));
  check('RLS (neg): rol zonder LOGIN → niet klaar', !bv.isKlaar(bv.rlsControles({ ...rlsBasis, rol: { ...rolGoed, login: false } })));
  check('RLS (neg): tabel zonder policy → niet klaar + genoemd', (() => { const r = bv.rlsControles({ ...rlsBasis, tabellen: [...rlsBasis.tabellen, { tabel: 'nieuw', rls: false, policies: 0 }] }); return !bv.isKlaar(r) && !!r.find((x) => x.id === 'policies')?.lijst?.some((l) => l.naam.startsWith('nieuw')); })());
  check('RLS (neg): isolatieproef mislukt → niet klaar', !bv.isKlaar(bv.rlsControles({ ...rlsBasis, proef: { ok: false, detail: 'lek' } })));
  check('RLS (neg): schaduwaudit telt weigeringen → niet klaar', !bv.isKlaar(bv.rlsControles({ ...rlsBasis, audit: [{ route: 'POST /x', tbl: 'mail_items_v1', actie: 'lezen', aantal: 3 }] })));
  check('RLS: anoniem-2xx in de audit hoort bij de poort, niet bij RLS', bv.isKlaar(bv.rlsControles({ ...rlsBasis, audit: [anon('POST /x')] })));

  // ------------------------------------------------------------ zuiver: zekering en tellers
  const nul = { totaal: 0, '5xx': 0, '403': 0, poort401: 0, opa: 0, rls: 0 };
  check('zekering: rustig verkeer → niets', bv.zekeringOordeel('auth-poort', { ...nul, totaal: 400, '5xx': 2, poort401: 1 }) === null);
  check('zekering: poort — 5× 401 in 2 min → uit', bv.zekeringOordeel('auth-poort', { ...nul, totaal: 50, poort401: 5 }) === 'poort-401-piek');
  check('zekering: OPA — 3× onbereikbaar → uit', bv.zekeringOordeel('opa-afdwingen', { ...nul, totaal: 20, opa: 3 }) === 'opa-onbereikbaar');
  check('zekering: OPA — 403-piek t.o.v. basis → uit', bv.zekeringOordeel('opa-afdwingen', { ...nul, totaal: 100, '403': 30 }, { totaal: 1000, '403': 10 }) === '403-piek');
  check('zekering: RLS — 3 RLS-fouten → uit', bv.zekeringOordeel('rls', { ...nul, totaal: 40, rls: 3 }) === 'rls-fouten');
  check('zekering: 5xx-piek → uit (elke bescherming)', SCH.every((s) => bv.zekeringOordeel(s, { ...nul, totaal: 100, '5xx': 20 }) === '5xx-piek'));
  check('zekering: hoge 5xx ook vóór het aanzetten (basis) → geen vals alarm', bv.zekeringOordeel('rls', { ...nul, totaal: 100, '5xx': 20 }, { totaal: 500, '5xx': 100 }) === null);
  check('zekering: poort-401 telt niet voor RLS', bv.zekeringOordeel('rls', { ...nul, totaal: 50, poort401: 9 }) === null);
  _tellerLeeg();
  const t0 = Date.now();
  telAntwoord(200, t0); telAntwoord(503, t0); telAntwoord(403, t0); tel('poort401', 2, t0); telFout({ code: '42501', message: 'new row violates row-level security policy' }, t0);
  const s0 = som(t0 - 1000, t0 + 1000);
  check('teller: totaal/5xx/403/poort401/rls per emmer', s0.totaal === 3 && s0['5xx'] === 1 && s0['403'] === 1 && s0.poort401 === 2 && s0.rls === 1, JSON.stringify(s0));
  check('teller: buiten het venster telt niet', som(t0 + 60_000, t0 + 120_000).totaal === 0);
  _tellerLeeg();

  // ------------------------------------------------------------ D-02 (audit fase 2): «Увімкнути» zonder reden wijst het veld aan
  {
    const { redenFoutcode } = await import('../../src/beveiliging/reden');
    const src = readFileSync('src/beveiliging/Beveiliging.tsx', 'utf8');
    check('D-02: reden leeg/korter dan 3 → REDEN_VEREIST; 3+ tekens → geen fout', redenFoutcode('') === 'REDEN_VEREIST' && redenFoutcode('  ab ') === 'REDEN_VEREIST' && redenFoutcode(undefined) === 'REDEN_VEREIST' && redenFoutcode('abc') === null);
    check('D-02: de knop «Увімкнути» is niet meer uit door een lege reden (alleen bezig/niet klaar)', /disabled=\{!!bezig \|\| !k\.klaar\} onClick=\{\(\) => void actie\(k, 'aan'\)\}/.test(src) && !/\.trim\(\)\.length < 3\} onClick/.test(src));
    check('D-02: zonder reden: fout bij het veld (aria-invalid + aria-describedby + role=alert) en focus op het veld, geen verzoek', /redenFoutcode\(reden\[k\.sleutel\]\)/.test(src) && /redenVeld\.current\[k\.sleutel\]\?\.focus\(\); return;/.test(src)
      && /aria-invalid=\{redenFout\[k\.sleutel\] \? true : undefined\}/.test(src) && /aria-describedby=\{redenFout\[k\.sleutel\] \? `bvs-reden-fout-\$\{k\.sleutel\}` : undefined\}/.test(src) && /className='bvs-veld-fout' role='alert'/.test(src));
    check('D-02: typen in het veld wist de fout; CSS markeert aria-invalid', /setRedenFout\(\(r\) => \(\{ \.\.\.r, \[k\.sleutel\]: '' \}\)\)/.test(src) && readFileSync('src/beveiliging/beveiliging.css', 'utf8').includes('.bvs-acties input[aria-invalid=true]'));
  }

  // ------------------------------------------------------------ zuiver: schakelaar + omgeving, zonder herstart
  _schakelaarsReset();
  const anoniem = () => metVerzoek('POST /api/proef/anoniem', async () => poortNaVerzoek('POST /api/proef/anoniem', { headers: {} } as never, { statusCode: 200, headers: {}, body: '{}' }));
  check('poort uit: anonieme 2xx gaat door (alleen gemeld)', (await anoniem()).statusCode === 200 && poortAfdwingen() === false);
  schakelaarLokaal('auth-poort', true);
  check('poort aan (schakelaar, zonder herstart): anonieme 2xx → 401 + geteld voor de zekering', (await anoniem()).statusCode === 401 && som(Date.now() - 5000, Date.now() + 1000).poort401 === 1);
  process.env.AUTH_POORT_AFDWINGEN = '0';
  check('omgeving AUTH_POORT_AFDWINGEN=0 gaat voor de schakelaar (aan) → uit', poortAfdwingen() === false && (await anoniem()).statusCode === 200);
  schakelaarLokaal('auth-poort', false); process.env.AUTH_POORT_AFDWINGEN = '1';
  check('omgeving AUTH_POORT_AFDWINGEN=1 gaat voor de schakelaar (uit) → aan', poortAfdwingen() === true);
  delete process.env.AUTH_POORT_AFDWINGEN;
  const map = mkdtempSync(join(tmpdir(), 'bvs-')); const rechten = join(map, 'mcp-rechten.json');
  const padOud = process.env.MCP_RECHTEN_PAD; process.env.MCP_RECHTEN_PAD = rechten;
  writeFileSync(rechten, '{"beheer-alleen-tech": false}'); _afdwingenCacheLeeg();
  check('OPA: root uit + schakelaar uit → uit', (await afdwingenAan()) === false);
  schakelaarLokaal('opa-afdwingen', true);
  check('OPA: schakelaar van de site aan → aan (bron site), zonder herstart', (await afdwingenBron()).aan && (await afdwingenBron()).bron === 'site');
  process.env.OPA_AFDWINGEN = '0';
  check('OPA: OPA_AFDWINGEN=0 gaat voor → uit (bron env)', (await afdwingenBron()).aan === false && (await afdwingenBron()).bron === 'env');
  delete process.env.OPA_AFDWINGEN; schakelaarLokaal('opa-afdwingen', false);
  writeFileSync(rechten, '{"beheer-alleen-tech": true}'); _afdwingenCacheLeeg();
  check('OPA: root-bestand true = aan (bron root; de site kan dat niet uitzetten)', (await afdwingenBron()).bron === 'root' && (await afdwingenAan()));
  writeFileSync(rechten, '{"beheer-alleen-tech": false}'); _afdwingenCacheLeeg();

  // ------------------------------------------------------------ hekken die geen database nodig hebben
  check('agent: /api/owner/beveiliging/* staat in AGENT_VERBODEN (aanzetten, uitzetten, app-rol)', ['POST /api/owner/beveiliging/aanzetten', 'POST /api/owner/beveiliging/uitzetten', 'POST /api/owner/beveiliging/app-rol-maken', 'POST /api/owner/beveiliging/stand'].every(agentRouteVerboden));
  const idx = lees('backend/index.ts');
  check('routes geregistreerd met de gewone sessiecontrole, niet achter adminContext/afdwingAdmin', /\.\.\.beveiligingRoutes\(\{ requireSession: ownerRequireSession as never \}\)/.test(idx));

  // ------------------------------------------------------------ root-kant
  const regels: Array<(a: unknown, s: unknown) => unknown> = [];
  vm.runInNewContext(lees('deploy/opdracht/50-mijn-ruimte-opdracht.rules'), { polkit: { Result: { YES: 'yes', NO: 'no', NOT_HANDLED: null }, addRule: (f: (a: unknown, s: unknown) => unknown) => regels.push(f) } });
  const besluit = (unit: string, verb = 'start') => regels[0]({ id: 'org.freedesktop.systemd1.manage-units', lookup: (k: string) => (k === 'unit' ? unit : k === 'verb' ? verb : undefined) }, { user: 'mijnruimte' });
  check('polkit: mijnruimte mag mijn-ruimte-db-rollen.service alleen starten', besluit('mijn-ruimte-db-rollen.service') === 'yes' && ['stop', 'restart', 'enable'].every((v) => besluit('mijn-ruimte-db-rollen.service', v) === 'no') && besluit('mijn-ruimte-db-rollen@x.service') === 'no');
  const unit = lees('deploy/mijn-ruimte-db-rollen.service');
  check('unit: root-kopie onder /usr/local/lib, vast argument, geen stdin, niets uit /srv', (unit.match(/^ExecStart=.*$/gm) || []).join() === 'ExecStart=/usr/local/lib/mijn-ruimte/db-rollen/deploy/db-rollen-instellen.sh instellen-als-nodig' && /StandardInput=null/.test(unit) && !/^[^#]*\/srv\//m.test(unit));
  const inst = lees('deploy/installeer-app.sh');
  const fn = (inst.match(/^db_rollen_hulp_inrichten\(\) \{[\s\S]*?^\}/m) || [''])[0];
  check('installer: kopieert alleen (install), voert het rollenscript niet uit', fn.length > 50 && !/db-rollen-instellen\.sh (instellen|rls)/.test(fn) && /db_rollen_hulp_inrichten "\$doel"/.test(inst));
  const G = mkdtempSync(join(tmpdir(), 'bvs-geh-'));
  writeFileSync(join(G, 'geheimen.env'), 'DATABASE_URL=postgres://x:y@127.0.0.1:5432/db\nDATABASE_URL_APP=postgres://mijnruimte_app:' + 'a'.repeat(64) + '@127.0.0.1:5432/db\n');
  // INTEG-001: het rollenscript draait alleen onder Linux (bash). Buiten Linux slaan we deze twee checks expliciet over, niet stil.
  if (process.platform !== 'linux') console.log('OVERGESLAGEN instellen-als-nodig: vereist Linux (bash) — voer uit op de VM');
  else {
  const r1 = spawnSync('bash', ['deploy/db-rollen-instellen.sh', 'instellen-als-nodig'], { encoding: 'utf8', env: { ...process.env, ZONDER_ROOT: '1', GEHEIMEN: join(G, 'geheimen.env'), MIGRATIE_ENV: join(G, 'migratie.env'), STATUS_DIR: G, ZONDER_HERSTART: '1' } });
  const res1 = (() => { try { return JSON.parse(readFileSync(join(G, 'db-rollen.json'), 'utf8')); } catch { return {}; } })();
  check('instellen-als-nodig: DATABASE_URL_APP bestaat al → niets, resultaat AL_INGESTELD (zonder waarden)', r1.status === 0 && res1.ok === true && res1.code === 'AL_INGESTELD' && !/a{64}/.test(r1.stdout + r1.stderr + JSON.stringify(res1)), (r1.stdout + r1.stderr).slice(-200));
  writeFileSync(join(G, 'geheimen.env'), 'DATABASE_URL=bestaat-niet\n');
  const r2 = spawnSync('bash', ['deploy/db-rollen-instellen.sh', 'instellen-als-nodig'], { encoding: 'utf8', env: { ...process.env, ZONDER_ROOT: '1', GEHEIMEN: join(G, 'geheimen.env'), MIGRATIE_ENV: join(G, 'migratie.env'), STATUS_DIR: G, ZONDER_HERSTART: '1' } });
  const res2 = (() => { try { return JSON.parse(readFileSync(join(G, 'db-rollen.json'), 'utf8')); } catch { return {}; } })();
  check('instellen-als-nodig (neg): instellen faalt → exit ≠ 0, resultaat MISLUKT_TERUGGEZET, geheimen.env ongewijzigd', r2.status !== 0 && res2.ok === false && res2.code === 'MISLUKT_TERUGGEZET' && readFileSync(join(G, 'geheimen.env'), 'utf8') === 'DATABASE_URL=bestaat-niet\n');

  }
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN (integratie): geen database'); herstel(); return einde(); }

  // ------------------------------------------------------------ integratie: routes met de echte database
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const begin = new Date();
  const ownerEmail = String(process.env.OWNER_EMAIL || 'eigenaar@test.invalid').toLowerCase();
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0] as { id: string; email: string } | undefined;
  let tijdelijk = '';
  if (bestaand) process.env.OWNER_EMAIL = bestaand.email;
  else { tijdelijk = randomUUID(); await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [tijdelijk, { email: ownerEmail, role: 'owner', status: 'approved' }]); }
  const E = { id: bestaand?.id || tijdelijk, email: String(bestaand?.email || ownerEmail), role: 'owner', status: 'approved' };
  const lid = randomUUID();
  await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [lid, { email: `lid-${sfx}@test.invalid`, role: 'member', status: 'approved' }]);
  const tab = randomBytes(24).toString('hex');
  const sessie = { id: `bvs-sessie-${sfx}`, createdAt: Date.now() };
  let auth: Record<string, unknown> = { user: { id: lid, email: `lid-${sfx}@test.invalid`, role: 'member', status: 'approved' }, service: 'admin', session: sessie, tabSession: null };
  const routes = bv.beveiligingRoutes({ requireSession: async () => auth as never });
  const roep = async (r: string, body: Record<string, unknown>) => { const x = (await (routes[r][0] as unknown as (c: unknown) => Promise<Res>)({ event: {}, body: { service: 'admin', tabContext: tab, ...body } })); return { s: x.statusCode, j: JSON.parse(x.body || '{}') as Record<string, unknown> }; };
  const meldingen: string[] = [];
  registreerMelder(async (u, _e, k) => { meldingen.push(`${u}:${k}`); });
  // Verse anonieme 2xx van andere tests tijdelijk «ouder» maken (zodat de gereedheid alleen dit test), na afloop exact terugzetten.
  const verschoven = (await sys.query(`UPDATE app.rls_audit SET laatst = laatst - interval '3 hours' WHERE actie = 'anoniem-2xx' AND laatst > now() - interval '2 hours' RETURNING route, tbl, actie`)).rows as Array<{ route: string; tbl: string; actie: string }>;
  const rlsVooraf = (await sys.query(`SELECT waarde FROM app.rls_instellingen WHERE sleutel='afdwingen'`)).rows[0]?.waarde || 'uit';
  try {
    _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
    let r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'proef' });
    check('niet-eigenaar: aanzetten → 403 OWNER_REQUIRED', r.s === 403 && r.j.error === 'OWNER_REQUIRED');
    r = await roep('POST /api/owner/beveiliging/stand', {});
    check('niet-eigenaar zonder technisch profiel: lezen → 403', r.s === 403);
    r = await roep('POST /api/owner/beveiliging/uitzetten', { sleutel: 'auth-poort' });
    check('niet-eigenaar: uitzetten → 403', r.s === 403);

    auth = { user: E, service: 'admin', session: sessie, tabSession: null };
    r = await roep('POST /api/owner/beveiliging/stand', { uren: 1 });
    const kaarten = (r.j.kaarten || []) as bv.Kaart[];
    check('eigenaar: stand geeft drie kaarten met controles', r.s === 200 && kaarten.length === 3 && kaarten.every((k) => k.controles.length > 0), String(r.s));
    check('kaart poort: schaduw (alleen melden), klaar na 1 uur zonder anonieme 2xx', kaarten.find((k) => k.sleutel === 'auth-poort')?.stand === 'schaduw' && !!kaarten.find((k) => k.sleutel === 'auth-poort')?.klaar, JSON.stringify(kaarten.find((k) => k.sleutel === 'auth-poort')?.controles.filter((x) => !x.ok)));
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'proef' });
    check('eigenaar zonder technisch profiel: aanzetten → 403 TECH_PROFIEL_VEREIST', r.s === 403 && r.j.error === 'TECH_PROFIEL_VEREIST');
    await tp.activeren(E as never, tab, 30, 'proef beveiliging');
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'proef' });
    check('eigenaar in technisch profiel, zonder passkey: aanzetten → 403 STEP_UP_REQUIRED (alleen passkey)', r.s === 403 && r.j.error === 'STEP_UP_REQUIRED' && JSON.stringify(r.j.methods) === '["passkey"]');
    await passkeyStapOpVastleggen(auth as never);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'x' });
    check('zonder reden → 400 REDEN_VEREIST (passkey niet verbruikt)', r.s === 400 && r.j.error === 'REDEN_VEREIST');
    // Negatief: een verse anonieme 2xx buiten de allowlist → de server weigert (de browser beslist niets).
    await sys.query(`INSERT INTO app.rls_audit (route, tbl, actie, aantal) VALUES ($1, '-', 'anoniem-2xx', 2)`, [`POST /api/proef-vergeten-${sfx}`]);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'proef aanzetten', uren: 1 });
    check('gereedheid (neg) op de echte audit: anonieme 2xx → 409 NIET_KLAAR [anoniem-2xx]', r.s === 409 && JSON.stringify(r.j.mislukt) === '["anoniem-2xx"]', JSON.stringify(r.j));
    await sys.query(`DELETE FROM app.rls_audit WHERE route = $1`, [`POST /api/proef-vergeten-${sfx}`]);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'proef aanzetten', uren: 1 });
    check('gereedheid (pos) + passkey + techprofiel → aangezet', r.s === 200 && (r.j.kaart as bv.Kaart)?.aan === true && (r.j.kaart as bv.Kaart)?.bewakingTot !== null, JSON.stringify(r.j).slice(0, 300));
    check('zonder herstart: poortAfdwingen() meteen aan, anonieme 2xx → 401', poortAfdwingen() === true && (await anoniem()).statusCode === 401);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'opa-afdwingen', reden: 'tweede keer' });
    check('passkey is eenmalig verbruikt: tweede schakeling → 403 STEP_UP_REQUIRED', r.s === 403 && r.j.error === 'STEP_UP_REQUIRED');
    const rij = (await sys.query(`SELECT stand, door_email, reden, bewaking_tot FROM app.beveiliging_schakelaars WHERE sleutel='auth-poort'`)).rows[0];
    check('tabel: stand aan, door, reden, bewaking 10 min', rij?.stand === 'aan' && rij?.door_email === E.email && rij?.reden === 'proef aanzetten' && Math.abs(new Date(rij.bewaking_tot).getTime() - Date.now() - bv.BEWAKING_MS) < 30_000);

    // Zekering: piek in 401 van de poort → automatisch uit, journaal + melding aan de eigenaar.
    check('zekering: zonder piek blijft het aan', (await bv.zekeringControleren()).length === 0 && poortAfdwingen());
    tel('poort401', 6);
    const uit = await bv.zekeringControleren();
    check('zekering: piek → auth-poort automatisch uit (zonder herstart)', uit.length === 1 && uit[0].sleutel === 'auth-poort' && uit[0].reden === 'poort-401-piek' && poortAfdwingen() === false && (await anoniem()).statusCode === 200);
    const rij2 = (await sys.query(`SELECT stand, automatisch_uit_reden, automatisch_uit_op FROM app.beveiliging_schakelaars WHERE sleutel='auth-poort'`)).rows[0];
    check('zekering: tabel uit + reden + tijd', rij2?.stand === 'uit' && rij2?.automatisch_uit_reden === 'poort-401-piek' && !!rij2?.automatisch_uit_op);
    check('zekering: melding aan de eigenaar', meldingen.includes(`${E.id}:beveiliging.zekering`), meldingen.join(','));
    _tellerLeeg();

    // Uitzetten zonder passkey en zonder technisch profiel (noodrem).
    await passkeyStapOpVastleggen(auth as never);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'nog eens', uren: 1 });
    check('opnieuw aangezet (nieuwe passkey)', r.s === 200 && poortAfdwingen());
    const tabZonder = randomBytes(24).toString('hex');
    const x = await (routes['POST /api/owner/beveiliging/uitzetten'][0] as unknown as (c: unknown) => Promise<Res>)({ event: {}, body: { service: 'admin', tabContext: tabZonder, sleutel: 'auth-poort', reden: 'klaar met proef' } });
    check('uitzetten: zonder passkey, zonder technisch profiel → 200 en meteen uit', x.statusCode === 200 && poortAfdwingen() === false);
    process.env.AUTH_POORT_AFDWINGEN = '0';
    await passkeyStapOpVastleggen(auth as never);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'auth-poort', reden: 'geforceerd' });
    check('omgeving forceert uit → aanzetten 409 GEFORCEERD', r.s === 409 && r.j.error === 'GEFORCEERD');
    delete process.env.AUTH_POORT_AFDWINGEN;

    const journaal = (await sys.query(`SELECT action, count(*)::int AS n FROM app.audit WHERE created_at >= $1 AND action LIKE 'admin.beveiliging.%' GROUP BY action`, [begin])).rows as Array<{ action: string; n: number }>;
    const n = (a: string) => journaal.find((j) => j.action === a)?.n || 0;
    check('journaal: aan (2), uit (1), zekering (1), geweigerd (≥ 5) — met reden', n('admin.beveiliging.aan') === 2 && n('admin.beveiliging.uit') === 1 && n('admin.beveiliging.zekering') === 1 && n('admin.beveiliging.geweigerd') >= 5, JSON.stringify(journaal));

    // OPA: niet bereikbaar in de test → de server weigert het aanzetten (fail-closed zou de admin sluiten).
    process.env.OPA_URL = 'http://127.0.0.1:9';
    await passkeyStapOpVastleggen(auth as never);
    r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'opa-afdwingen', reden: 'proef opa', uren: 1 });
    check('OPA onbereikbaar → 409 NIET_KLAAR met opa-gezond', r.s === 409 && (r.j.mislukt as string[] || []).includes('opa-gezond'), JSON.stringify(r.j));
    delete process.env.OPA_URL;

    // ---------------------------------------------------------- RLS op de echte database
    const rk = (await roep('POST /api/owner/beveiliging/stand', { uren: 1 })).j.kaarten as bv.Kaart[];
    const rls = rk.find((k) => k.sleutel === 'rls')!;
    const cid = (id: string) => rls.controles.find((c) => c.id === id);
    check('RLS: rol mijnruimte_app bestaat met LOGIN, zonder BYPASSRLS', !!cid('app-rol')?.ok, cid('app-rol')?.nl);
    if (!appRolActief()) {
      check('RLS zonder DATABASE_URL_APP (neg): app-url mislukt, niet klaar → aanzetten geweigerd', !cid('app-url')?.ok && !rls.klaar);
      await passkeyStapOpVastleggen(auth as never);
      r = await roep('POST /api/owner/beveiliging/aanzetten', { sleutel: 'rls', reden: 'proef rls' });
      check('RLS zonder app-rol: 409 NIET_KLAAR [app-url, …]', r.s === 409 && (r.j.mislukt as string[] || []).includes('app-url'));
      let gestart: string[] = [];
      bv._zetRunner(async (args) => { gestart = args; return { code: 0, stderr: '' }; });
      await passkeyStapOpVastleggen(auth as never);
      r = await roep('POST /api/owner/beveiliging/app-rol-maken', { reden: 'rol maken' });
      check('«Створити роль застосунку»: start alleen de vaste unit (no-block), met passkey', r.s === 200 && gestart.join(' ') === 'start --no-ask-password --no-block mijn-ruimte-db-rollen.service', gestart.join(' '));
      r = await roep('POST /api/owner/beveiliging/app-rol-maken', { reden: 'rol maken' });
      check('app-rol-maken zonder (nieuwe) passkey → 403', r.s === 403 && r.j.error === 'STEP_UP_REQUIRED');
    } else {
      check('RLS met rollen: verbinding als mijnruimte_app', !!cid('verbinding')?.ok, cid('verbinding')?.nl);
      check('RLS: isolatieproef met synthetische rijen slaagt (B ziet/wijzigt/wist de rij van A niet)', !!cid('isolatie')?.ok, cid('isolatie')?.nl);
      check('RLS: policy-controle vindt de tabellen met gebruikersgegevens', (await bv.rlsTabellen()).length >= 3);
      const synth = (await sys.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'rls_proef'`)).rows[0]?.n;
      check('isolatieproef liet niets achter (ROLLBACK)', synth === 0);
      // Negatief: een tabel met een te ruime policy → dezelfde proef vindt het lek.
      const lek = `proef_lek_${sfx}`;
      const ddl = getPool('migratie'); // DDL: de systeemrol mag geen tabellen maken (dat is juist goed)
      await ddl.query(`CREATE TABLE app.${lek} (id text PRIMARY KEY, user_id text NOT NULL)`);
      try {
        await ddl.query(`ALTER TABLE app.${lek} ENABLE ROW LEVEL SECURITY; CREATE POLICY alles ON app.${lek} USING (true); GRANT SELECT ON app.${lek} TO mijnruimte_app; INSERT INTO app.${lek} VALUES ('1', 'iemand-anders')`);
        const proef = await bv.isolatieProef([...(await bv.rlsTabellen())]);
        check('isolatieproef (neg): te ruime policy → lek gevonden in die tabel', !proef.ok && proef.detail.includes(lek), proef.detail);
        await ddl.query(`DROP POLICY alles ON app.${lek}; ALTER TABLE app.${lek} DISABLE ROW LEVEL SECURITY`);
        const zonder = (await bv.rlsTabellen()).find((t) => t.tabel === lek);
        check('policy-controle (neg): tabel zonder RLS wordt genoemd', !!zonder && !zonder.rls && bv.rlsControles({ ...rlsBasis, tabellen: [zonder] }).find((c) => c.id === 'policies')?.ok === false);
      } finally { await ddl.query(`DROP TABLE IF EXISTS app.${lek}`); }
      // Echt aan → de app-rol ziet zonder proefmodus geen andere rijen; zekering bij RLS-fouten → terug uit.
      await bv.aanzetten('rls', { id: E.id, email: E.email }, 'proef rls aan');
      const w1 = (await sys.query(`SELECT waarde FROM app.rls_instellingen WHERE sleutel='afdwingen'`)).rows[0]?.waarde;
      const c = await getPool('app').connect();
      let anderen = -1;
      try { await c.query('BEGIN'); await c.query(`SELECT set_config('app.user_id', $1, true)`, [`niemand-${sfx}`]); anderen = (await c.query(`SELECT count(*)::int AS n FROM app.records WHERE owner_id IS NOT NULL`)).rows[0]?.n; } finally { await c.query('ROLLBACK'); c.release(); }
      check('RLS aan via de site: rls_instellingen = aan, app-rol ziet 0 rijen van anderen', w1 === 'aan' && anderen === 0, `${w1}/${anderen}`);
      tel('rls', 3);
      const z = await bv.zekeringControleren();
      const w2 = (await sys.query(`SELECT waarde FROM app.rls_instellingen WHERE sleutel='afdwingen'`)).rows[0]?.waarde;
      check('zekering: RLS-fouten → RLS automatisch terug uit', z.some((u) => u.sleutel === 'rls' && u.reden === 'rls-fouten') && w2 === 'uit', `${JSON.stringify(z)} ${w2}`);
    }
  } finally {
    await sys.query(`SELECT app.rls_afdwingen_zetten($1)`, [rlsVooraf]).catch(() => undefined);
    await sys.query(`UPDATE app.beveiliging_schakelaars SET stand='uit', bewaking_tot=NULL, basis='{}'::jsonb`).catch(() => undefined);
    for (const v of verschoven) await sys.query(`UPDATE app.rls_audit SET laatst = laatst + interval '3 hours' WHERE route=$1 AND tbl=$2 AND actie=$3`, [v.route, v.tbl, v.actie]).catch(() => undefined);
    await sys.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'proef' WHERE user_id = $1 AND beeindigd_op IS NULL AND begin_op >= $2`, [E.id, begin]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE id = ANY($1::text[])`, [[lid, ...(tijdelijk ? [tijdelijk] : [])]]).catch(() => undefined);
    _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
    herstel();
  }
  return einde();

  function herstel() {
    if (env0.a === undefined) delete process.env.AUTH_POORT_AFDWINGEN; else process.env.AUTH_POORT_AFDWINGEN = env0.a;
    if (env0.o === undefined) delete process.env.OPA_AFDWINGEN; else process.env.OPA_AFDWINGEN = env0.o;
    if (padOud === undefined) delete process.env.MCP_RECHTEN_PAD; else process.env.MCP_RECHTEN_PAD = padOud;
    _afdwingenCacheLeeg();
  }
}
const SCH = ['auth-poort', 'opa-afdwingen', 'rls'] as const;
