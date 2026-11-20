process.env.MR_BEHEERSUBNET = '203.0.113.0/24';
// SEC-002, groep g02 (12.11.2026): Huis / Home Assistant — bevindingen integraties-05 en integraties-09.
//
// integraties-05 — netwerk buiten de transactie, tempo en gelijktijdigheid, robuust tegen een kapotte bron:
//   A1. Geen enkele aanroep naar de bron gebeurt terwijl een databankverbinding uit de pool is uitgeleend (instellen, ontdekken,
//       importeren, synchroniseren, opdracht geven, opdracht lezen, energie). Vóór de patch hield elke aanroep er één vast (tot 33 s).
//   A2. Een bron die na een aanvaarde opdracht «200 zonder inhoud» geeft, draait de opdracht niet terug: de rij en de
//       idempotentiesleutel blijven staan en dezelfde sleutel stuurt geen tweede keer.
//   A3. Twee gelijktijdige verzoeken met dezelfde sleutel: één verzending, dezelfde opdracht terug (geen 500).
//   A4. Een opdracht die na de deadline nog «aanvaard» is (herstart tussen vastleggen en versturen) wordt eerlijk afgesloten en
//       nooit opnieuw verstuurd.
//   A5. Tekstvelden van de bron zijn begrensd; kapotte entiteiten/tijden/geschiedenis geven geen uitzondering.
//   A6. Hoogstens twee gelijktijdige aanroepen per woning en drie per gebruiker; wie geen beurt krijgt, krijgt HUIS_BEZET. Een
//       naamserver die nooit antwoordt houdt een verzoek niet onbeperkt vast.
//   A7. Tempolimiet per gebruiker op de routes die de bron aanroepen (429 RATE_LIMITED).
// integraties-09 — lid worden alleen met eigen toestemming:
//   B1. «toevoegen» antwoordt hetzelfde voor een bestaand en een onbekend adres en maakt niemand lid.
//   B2. De genodigde ziet de uitnodiging (met wie uitnodigt), krijgt één melding, en wordt pas lid na aanvaarden; een ander kan
//       haar niet aanvaarden; afwijzen blijft voor de uitnodiger onzichtbaar en geeft geen nieuwe melding bij herhalen.
//   B3. Hoogstens tien uitnodigingen per uur per gebruiker (429).
// Alles tegen een NAGEBOOTSTE Home Assistant in dit bestand (met vertraging en kapotte antwoorden), nooit een echte. Alle geheimen
// hier zijn verzonnen.
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as huis from '../../backend/huis-vnext';
import * as adapter from '../../backend/huis-adapter-thuis-assistent';
import { registreerMelder } from '../../backend/melder';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { checker, nepGoogle } from './hulp/nep-google';
import { ENTITEITEN, luisterOpLanAdres, type NepEntiteit } from './hulp/nep-thuis-assistent';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const h = huis as unknown as Record<string, any>;

/** Nagebootste bron met knoppen voor vertraging en kapotte antwoorden; meet bij elk verzoek hoeveel poolverbindingen uitgeleend zijn. */
async function nepBron(token: string, entiteiten: NepEntiteit[]) {
  const pool = getPool('systeem');
  const bezet = () => pool.totalCount - pool.idleCount;
  const s = {
    entiteiten: new Map(entiteiten.map((e) => [e.entity_id, { ...e, attributes: { ...e.attributes } }])),
    aanroepen: [] as Array<{ methode: string; pad: string }>,
    vertragingMs: 0, leegBijLezen: false, lezenRuw: undefined as unknown, statesRuw: undefined as unknown, geschiedenisRuw: undefined as unknown,
    lopend: 0, maxLopend: 0, maxPoolBezet: 0,
  };
  const nul = () => { s.maxLopend = 0; s.maxPoolBezet = 0; };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const pad = (req.url || '/').split('?')[0];
      s.aanroepen.push({ methode: req.method || 'GET', pad });
      s.lopend++; s.maxLopend = Math.max(s.maxLopend, s.lopend); s.maxPoolBezet = Math.max(s.maxPoolBezet, bezet());
      const antwoord = (code: number, data: unknown, ruw?: string) => setTimeout(() => {
        s.maxPoolBezet = Math.max(s.maxPoolBezet, bezet()); s.lopend--;
        res.writeHead(code, { 'content-type': 'application/json' }); res.end(ruw !== undefined ? ruw : JSON.stringify(data));
      }, s.vertragingMs);
      if (req.headers.authorization !== `Bearer ${token}`) return antwoord(401, { message: 'Unauthorized' });
      if (pad === '/api/') return antwoord(200, { message: 'API running.' });
      if (pad === '/api/config') return antwoord(200, { version: '2026.11.0', location_name: 'Proef g02' });
      if (pad === '/api/states') return antwoord(200, s.statesRuw !== undefined ? s.statesRuw : [...s.entiteiten.values()]);
      const een = /^\/api\/states\/([^/]+)$/.exec(pad);
      if (een) {
        if (s.leegBijLezen) return antwoord(200, null, '');
        if (s.lezenRuw !== undefined) return antwoord(200, s.lezenRuw);
        const e = s.entiteiten.get(decodeURIComponent(een[1]));
        return e ? antwoord(200, e) : antwoord(404, { message: 'Entity not found.' });
      }
      const dienst = /^\/api\/services\/([^/]+)\/([^/]+)$/.exec(pad);
      if (dienst && req.method === 'POST') {
        const d = JSON.parse(body || '{}') as Record<string, unknown>; const e = s.entiteiten.get(String(d.entity_id));
        if (e && (dienst[2] === 'turn_on' || dienst[2] === 'turn_off')) { e.state = dienst[2] === 'turn_on' ? 'on' : 'off'; e.last_changed = new Date().toISOString(); e.last_updated = e.last_changed; }
        return antwoord(200, []);
      }
      if (/^\/api\/history\/period\//.test(pad)) return antwoord(200, s.geschiedenisRuw !== undefined ? s.geschiedenisRuw : []);
      antwoord(404, { message: 'Not found' });
    });
  });
  // SEC-002 (slot v): vast privé-adres + doorsturing in dit testproces (tests/eenheid/hulp/nep-thuis-assistent.ts), niet meer het
  // adres van de machine — in een container zonder privé-adres weigerde de adapter dat terecht (ADRES_GEWEIGERD).
  // Фіксована приватна адреса замість адреси машини: тест однаковий у будь-якому оточенні.
  const { url } = await luisterOpLanAdres(server);
  return { s, nul, url, stop: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g02-20261112');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (naam: string) => { const id = randomUUID(); const email = `g02-${naam}-${sfx}@eenheid.test`; await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved', name: `Naam ${naam}` }]); return { id, email }; };
  const eig = await mk('eig'); const gast = await mk('gast'); const vreemd = await mk('vreemd'); const druk = await mk('druk'); const nodiger = await mk('nodiger');
  const TOKEN = `verzonnen_${randomBytes(20).toString('hex')}`;
  const bron = await nepBron(TOKEN, ENTITEITEN);
  const oudVertrouwd = process.env.HUIS_VERTROUWDE_TOESTELLEN;
  process.env.HUIS_VERTROUWDE_TOESTELLEN = bron.url;
  const meldingen: Array<{ userId: string; kind: string; title: string; message: string; link?: string }> = [];
  registreerMelder(async (userId, _email, kind, title, message, link) => { meldingen.push({ userId, kind, title, message, link }); });
  // Routes met een nagebootste sessie: event.u = de aangemelde gebruiker.
  const routes = huis.huisRoutes(async (event) => { const u = (event as { u?: { id: string; email: string } }).u; return u ? { user: { id: u.id, email: u.email, role: 'member', status: 'approved', accessLevel: 'full' }, service: 'huis' } : { errorCode: 'SESSION_REQUIRED' }; });
  const roep = async (pad: string, u: { id: string; email: string }, body: Record<string, unknown>) => {
    const r = (await routes[`POST ${pad}`][0]({ event: { u }, body } as never)) as { statusCode: number; body: string };
    return { status: r.statusCode, data: JSON.parse(r.body || 'null') as Record<string, any> };
  };
  const woningen: string[] = [];
  const dMensen: string[] = []; // accounts van blok D (delen per e-mail via de echte handler)
  try {
    // ================================================================ 0. migratie 0212 (idempotent)
    for (const f of ['migrations/0128_huis_vnext.sql', 'migrations/0131_huis_rls_zonder_kringloop.sql']) await getPool('migratie').query(lees(f));
    let mig212 = '';
    try { mig212 = lees('migrations/0212_huis_uitnodigingen.sql'); await getPool('migratie').query(mig212); await getPool('migratie').query(mig212); } catch { /* vóór de patch bestaat ze niet */ }
    const beleid = (await pool.query(`SELECT c.relrowsecurity AS rls, (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'app' AND p.tablename = 'huis_uitnodigingen') AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'app' AND c.relname = 'huis_uitnodigingen'`)).rows[0];
    check('0212 draait twee keer zonder fout; app.huis_uitnodigingen heeft RLS aan met een policy via app.huis_is_eigenaar', Boolean(beleid?.rls) && beleid?.n === 1 && /huis_is_eigenaar\(woning_id\)/.test(mig212) && /DROP POLICY IF EXISTS/.test(mig212) && /CREATE TABLE IF NOT EXISTS/.test(mig212));

    // ================================================================ A. integraties-05
    const w = await huis.woningMaken(eig.id, 'Proef g02'); if ('fout' in w) throw new Error(w.fout);
    const woningId = w.id; woningen.push(woningId);
    bron.s.vertragingMs = 120; // elke aanroep duurt even: zo is «wat hield de pool vast tijdens het netwerk» echt te meten
    bron.nul();
    const integ = await huis.integratieInstellen(eig.id, woningId, { adres: bron.url, token: TOKEN });
    if (!('id' in integ)) throw new Error(`instellen: ${(integ as { fout?: string }).fout}`);
    check('A1 instellen: tijdens de drie aanroepen naar de bron is geen poolverbinding uitgeleend', bron.s.maxPoolBezet === 0 && bron.s.aanroepen.length === 3, `bezet=${bron.s.maxPoolBezet}`);
    bron.nul();
    const ont = await huis.integratieOntdekken(eig.id, woningId, integ.id);
    check('A1 ontdekken: geen poolverbinding tijdens het netwerk; 13 apparaten gezien', bron.s.maxPoolBezet === 0 && (ont as any).apparaten?.length === 13, `bezet=${bron.s.maxPoolBezet}`);
    bron.nul();
    const imp = await huis.integratieImporteren(eig.id, woningId, integ.id, null);
    check('A1 importeren: geen poolverbinding tijdens het netwerk; 13 nieuw', bron.s.maxPoolBezet === 0 && (imp as any).nieuw === 13, `bezet=${bron.s.maxPoolBezet}`);
    bron.nul();
    const sync = await huis.integratieSynchroniseren(eig.id, woningId, integ.id);
    check('A1 synchroniseren: geen poolverbinding tijdens het netwerk; 13 bijgewerkt', bron.s.maxPoolBezet === 0 && (sync as any).bijgewerkt === 13, `bezet=${bron.s.maxPoolBezet}`);
    await huis.integratieSchrijven(eig.id, woningId, integ.id, true);
    const ov = (await huis.overzicht(eig.id, woningId))!;
    const lamp = ov.apparaten.find((a) => a.bronId === 'light.woonkamer')!;
    const boiler = ov.apparaten.find((a) => a.bronId === 'switch.boiler')!;
    bron.nul();
    const o1 = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `g02-${sfx}-1` });
    check('A1 opdracht geven (versturen + waarneming lezen): geen poolverbinding tijdens het netwerk; opdracht voltooid', bron.s.maxPoolBezet === 0 && o1.ok && o1.opdracht.stand === 'voltooid', `bezet=${bron.s.maxPoolBezet} stand=${o1.opdracht?.stand}`);
    bron.nul();
    const en = await huis.energieOverzicht(eig.id, woningId, 24);
    check('A1 energie: geen poolverbinding tijdens het netwerk', bron.s.maxPoolBezet === 0 && en?.meters === 2 && bron.s.aanroepen.some((a) => a.pad.startsWith('/api/history/period/')), `bezet=${bron.s.maxPoolBezet}`);

    // ---- A2: 200 zonder inhoud na een aanvaarde opdracht
    bron.s.vertragingMs = 0; bron.s.leegBijLezen = true;
    const voorA2 = bron.s.aanroepen.filter((a) => a.pad === '/api/services/light/turn_off').length;
    let a2: Awaited<ReturnType<typeof huis.opdrachtGeven>> | null = null; let a2Fout = '';
    try { a2 = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: `g02-${sfx}-2` }); } catch (err) { a2Fout = String((err as Error).message); }
    const a2Rij = (await pool.query(`SELECT id, stand FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, `g02-${sfx}-2`])).rows[0];
    check('A2 bron geeft «200 zonder inhoud» bij het teruglezen: geen uitzondering, de opdracht blijft vastgelegd als «verzonden»', a2Fout === '' && a2?.ok === true && a2Rij?.stand === 'verzonden', `fout=${a2Fout} rij=${a2Rij?.stand ?? 'WEG'}`);
    bron.nul();
    let a2bFout = ''; let a2b: Awaited<ReturnType<typeof huis.opdrachtLezen>> = null;
    try { a2b = await huis.opdrachtLezen(eig.id, woningId, String(a2Rij?.id ?? randomUUID())); } catch (err) { a2bFout = String((err as Error).message); }
    check('A2 opdracht lezen bij dezelfde kapotte bron: geen uitzondering, geen poolverbinding tijdens het netwerk, stand blijft «verzonden»', a2bFout === '' && a2b?.stand === 'verzonden' && bron.s.maxPoolBezet === 0, `fout=${a2bFout} bezet=${bron.s.maxPoolBezet}`);
    let a2c: Awaited<ReturnType<typeof huis.opdrachtGeven>> | null = null;
    try { a2c = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: `g02-${sfx}-2` }); } catch { /* vóór de patch: de sleutel is weg en de opdracht gaat opnieuw */ }
    check('A2 dezelfde idempotentiesleutel daarna: dezelfde opdracht, de bron kreeg de dienst precies één keer', a2c?.ok === true && a2c.opdracht.id === a2Rij?.id && bron.s.aanroepen.filter((a) => a.pad === '/api/services/light/turn_off').length === voorA2 + 1, `diensten=${bron.s.aanroepen.filter((a) => a.pad === '/api/services/light/turn_off').length - voorA2}`);
    bron.s.leegBijLezen = false;
    // een antwoord over een ANDERE entiteit telt niet als waarneming van deze opdracht
    bron.s.lezenRuw = { entity_id: 'lock.voordeur', state: 'unlocked', attributes: {} };
    const a2d = await huis.opdrachtLezen(eig.id, woningId, String(a2Rij?.id ?? randomUUID()));
    const lampToestanden = (await pool.query(`SELECT kenmerk FROM app.huis_toestanden WHERE apparaat_id = $1`, [lamp.id])).rows.map((r) => r.kenmerk);
    check('A2 een antwoord over een andere entiteit wordt niet als waarneming opgeslagen', a2d?.stand === 'verzonden' && !lampToestanden.includes('vergrendeld'), lampToestanden.join());
    bron.s.lezenRuw = undefined;

    // ---- A3: twee gelijktijdige verzoeken met dezelfde sleutel
    const voorA3 = bron.s.aanroepen.filter((a) => a.pad === '/api/services/switch/turn_off').length;
    const a3 = await Promise.allSettled([1, 2].map(() => huis.opdrachtGeven(eig.id, woningId, { apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: `g02-${sfx}-3` })));
    const a3Ids = a3.map((r) => (r.status === 'fulfilled' && r.value.opdracht ? r.value.opdracht.id : `FOUT:${r.status === 'rejected' ? (r.reason as Error).message.slice(0, 60) : ''}`));
    check('A3 twee gelijktijdige verzoeken met dezelfde sleutel: beide krijgen dezelfde opdracht, één verzending', a3Ids[0] === a3Ids[1] && !a3Ids[0].startsWith('FOUT') && bron.s.aanroepen.filter((a) => a.pad === '/api/services/switch/turn_off').length === voorA3 + 1, a3Ids.join(' | '));

    // ---- A4: «aanvaard» na de deadline (herstart tussen vastleggen en versturen)
    const wees = (await pool.query(`INSERT INTO app.huis_opdrachten (woning_id, user_id, via, apparaat_id, mogelijkheid, verzocht, idempotentie, stand, deadline) VALUES ($1,$2,'site',$3,'aan_uit','{"aan":true}'::jsonb,$4,'aanvaard', now() - interval '1 minute') RETURNING id`, [woningId, eig.id, boiler.id, `g02-${sfx}-wees`])).rows[0];
    const voorA4 = bron.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/')).length;
    const a4 = await huis.opdrachtLezen(eig.id, woningId, String(wees.id));
    check('A4 een opdracht die na de deadline nog «aanvaard» is: afgesloten als mislukt (VERZENDING_ONDERBROKEN), nooit opnieuw verstuurd', a4?.stand === 'mislukt' && a4?.fout === 'VERZENDING_ONDERBROKEN' && bron.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/')).length === voorA4, `${a4?.stand}/${a4?.fout}`);

    // ---- A5: grenzen en robuustheid van de vertaling
    const lang = 'x'.repeat(5000);
    const sens = adapter.vertaalEntiteit({ entity_id: 'sensor.groot', state: lang, attributes: { friendly_name: `Naam\u0000met${lang}`, device_class: lang, unit_of_measurement: lang }, last_changed: 'geen-datum', last_updated: 'ook-niet' });
    check('A5 sensor met reuzenvelden: eenheid ≤ 40, klasse ≤ 40, toestand ≤ 200, naam ≤ 120 zonder stuurtekens, ongeldige tijd → null',
      Boolean(sens) && sens!.toestanden[0].eenheid.length <= 40 && String(sens!.mogelijkheden[0].klasse ?? '').length <= 40 && (sens!.mogelijkheden[0].eenheid ?? '').length <= 40 && String(sens!.toestanden[0].waarde).length <= 200 && sens!.naam.length <= 120 && !sens!.naam.includes('\u0000') && sens!.laatstGezien === null && sens!.toestanden[0].waargenomenOp === null,
      sens ? `eenheid=${sens.toestanden[0].eenheid.length} klasse=${String(sens.mogelijkheden[0].klasse ?? '').length} waarde=${String(sens.toestanden[0].waarde).length} tijd=${sens.laatstGezien}` : 'null');
    const alarm = adapter.vertaalEntiteit({ entity_id: 'alarm_control_panel.x', state: lang, attributes: null as never });
    check('A5 alarm met reuzentoestand en attributen «null»: geen uitzondering, toestand ≤ 200', Boolean(alarm) && String(alarm!.toestanden[0].waarde).length <= 200);
    let a5Fout = '';
    bron.s.statesRuw = [null, 5, 'tekst', { entity_id: 7 }, { entity_id: `light.${'y'.repeat(4000)}`, state: 'on', attributes: {} }, { entity_id: 'sensor.vreemd', state: { diep: lang }, attributes: 'geen-object', last_changed: 12345 }, ...ENTITEITEN];
    let a5: Awaited<ReturnType<typeof huis.integratieSynchroniseren>> | null = null;
    try { a5 = await huis.integratieSynchroniseren(eig.id, woningId, integ.id); } catch (err) { a5Fout = String((err as Error).message).slice(0, 120); }
    const a5Ont = await adapter.haOntdekken(bron.url, TOKEN);
    check('A5 kapotte entiteiten in /api/states: synchroniseren slaagt (13 bijgewerkt), een bron-id van 4000 tekens wordt overgeslagen', a5Fout === '' && (a5 as any)?.bijgewerkt === 13 && a5Ont.ok && a5Ont.apparaten.every((a) => a.bronId.length <= 255), a5Fout || JSON.stringify(a5));
    bron.s.statesRuw = undefined;
    bron.s.geschiedenisRuw = [null, [null], [{ entity_id: 'sensor.energie_totaal', state: '1', last_changed: lang }, null, { state: '2', last_changed: '2026-11-12T08:00:00Z' }], [{ entity_id: 'sensor.niet_gevraagd', state: '3', last_changed: '2026-11-12T08:00:00Z' }]];
    let a5g: Awaited<ReturnType<typeof huis.energieOverzicht>> = null; let a5gFout = '';
    try { a5g = await huis.energieOverzicht(eig.id, woningId, 24); } catch (err) { a5gFout = String((err as Error).message).slice(0, 120); }
    const reeksen = Object.values(a5g?.reeksen ?? {});
    check('A5 kapotte geschiedenis ([null], null-punten, niet-gevraagde reeks, punt met een tijd van 5000 tekens): geen uitzondering, alleen de gevraagde meter, alleen het punt met een echte tijd', a5gFout === '' && reeksen.length === 1 && reeksen[0].length === 1 && reeksen[0][0].waarde === 2 && reeksen[0][0].op === '2026-11-12T08:00:00.000Z', a5gFout || JSON.stringify(a5g?.reeksen).slice(0, 200));
    bron.s.geschiedenisRuw = undefined;

    // ---- A6: gelijktijdigheid per woning
    h._zetHaWachtMs?.(60);
    bron.s.vertragingMs = 500; bron.nul();
    const a6 = await Promise.all([1, 2, 3].map(() => huis.integratieSynchroniseren(eig.id, woningId, integ.id)));
    const a6Bezet = a6.filter((r) => (r as { fout?: string }).fout === 'HUIS_BEZET').length;
    const standNa = (await pool.query(`SELECT stand FROM app.huis_integraties WHERE id = $1`, [integ.id])).rows[0]?.stand;
    check('A6 drie gelijktijdige synchronisaties van één woning: hoogstens twee tegelijk bij de bron, de derde krijgt HUIS_BEZET; de integratie blijft «verbonden»', bron.s.maxLopend <= 2 && a6Bezet === 1 && standNa === 'verbonden', `tegelijk=${bron.s.maxLopend} bezet=${a6Bezet} stand=${standNa}`);
    // per gebruiker: twee woningen, elk met een bron — samen hoogstens drie aanroepen tegelijk
    bron.s.vertragingMs = 0; h._zetHaWachtMs?.(null);
    const wB = await huis.woningMaken(eig.id, 'Tweede bron g02'); if ('fout' in wB) throw new Error(wB.fout); woningen.push(wB.id);
    const integB = await huis.integratieInstellen(eig.id, wB.id, { adres: bron.url, token: TOKEN });
    h._zetHaWachtMs?.(60); bron.s.vertragingMs = 500; bron.nul();
    const a6b = 'id' in integB ? await Promise.all([huis.integratieSynchroniseren(eig.id, woningId, integ.id), huis.integratieSynchroniseren(eig.id, woningId, integ.id), huis.integratieSynchroniseren(eig.id, wB.id, integB.id), huis.integratieSynchroniseren(eig.id, wB.id, integB.id)]) : [];
    check('A6 vier gelijktijdige synchronisaties van één gebruiker over twee woningen: hoogstens drie tegelijk bij de bron, één krijgt HUIS_BEZET', a6b.length === 4 && bron.s.maxLopend <= 3 && a6b.filter((r) => (r as { fout?: string }).fout === 'HUIS_BEZET').length === 1, `tegelijk=${bron.s.maxLopend} bezet=${a6b.filter((r) => (r as { fout?: string }).fout === 'HUIS_BEZET').length}`);
    h._zetHaWachtMs?.(null); bron.s.vertragingMs = 0;
    // een naamserver die nooit antwoordt houdt het verzoek niet onbeperkt vast
    adapter._zetHaDns(() => new Promise<string[]>(() => undefined));
    const dnsStart = Date.now();
    const dns = await Promise.race([adapter.haVerbinden('https://traag.voorbeeld.test', TOKEN), wacht(9500).then(() => 'HANGT' as const)]);
    adapter._zetHaDns(null);
    check('A6 een naamserver die nooit antwoordt: na de tijdslimiet GEEN_ANTWOORD in plaats van een verzoek dat blijft hangen', dns !== 'HANGT' && dns.ok === false && dns.fout === 'GEEN_ANTWOORD' && Date.now() - dnsStart < 9500, JSON.stringify(dns));

    // ---- A7: tempolimiet op de routes die de bron aanroepen (gebruiker «druk» is nergens lid: elk verzoek is goedkoop)
    const statussen: number[] = [];
    for (let i = 0; i < 33; i++) statussen.push((await roep('/api/huis/integraties/synchroniseren', druk, { woningId: randomUUID(), integratieId: randomUUID() })).status);
    check('A7 synchroniseren: na 30 verzoeken in tien minuten volgt 429 RATE_LIMITED (daarvoor 403: geen lid)', statussen.slice(0, 30).every((x) => x === 403) && statussen.slice(30).every((x) => x === 429), [...new Set(statussen)].join());
    const energie: number[] = [];
    for (let i = 0; i < 32; i++) energie.push((await roep('/api/huis/energie', druk, { woningId: randomUUID() })).status);
    check('A7 energie: na 30 verzoeken in tien minuten volgt 429', energie.slice(0, 30).every((x) => x === 404) && energie.slice(30).every((x) => x === 429), [...new Set(energie)].join());
    const zonderLimiet = (await roep('/api/huis/woningen', druk, {})).status;
    check('A7 routes zonder aanroep naar de bron (lijst van woningen) blijven gewoon werken voor dezelfde gebruiker', zonderLimiet === 200);

    // ================================================================ B. integraties-09
    meldingen.length = 0;
    const onbekendAdres = `g02-bestaat-niet-${sfx}@eenheid.test`;
    const b1a = await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: gast.email, rol: 'gast' });
    const b1b = await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: onbekendAdres, rol: 'gast' });
    await h._uitnodigingKoppelingKlaar?.();
    check('B1 «toevoegen»: hetzelfde antwoord (status en inhoud) voor een bestaand en een onbekend adres', b1a.status === 200 && b1b.status === b1a.status && JSON.stringify(b1a.data) === JSON.stringify(b1b.data), `${b1a.status} ${JSON.stringify(b1a.data)} | ${b1b.status} ${JSON.stringify(b1b.data)}`);
    const lidNu = (await pool.query(`SELECT count(*)::int AS n FROM app.huis_leden WHERE woning_id = $1 AND user_id = $2`, [woningId, gast.id])).rows[0].n;
    check('B1 de genodigde is GEEN lid zonder eigen toestemming: geen rij in huis_leden, ziet de woning niet', lidNu === 0 && (await huis.woningenLijst(gast.id)).length === 0 && (await huis.overzicht(gast.id, woningId)) === null);
    const b1Lijst = await roep('/api/huis/leden', eig, { woningId, actie: 'lijst' });
    const open = (b1Lijst.data.uitnodigingen ?? []) as Array<Record<string, unknown>>;
    const kaal = (x?: Record<string, unknown>) => (x ? JSON.stringify({ ...x, id: '', email: '', aangemaaktOp: '', verlooptOp: '' }) : 'ONTBREEKT');
    check('B1 ledenlijst van de eigenaar: alleen aanvaarde leden; de twee openstaande uitnodigingen zien er gelijk uit en dragen geen gebruiker-id of naam',
      (b1Lijst.data.leden ?? []).length === 1 && open.length === 2 && kaal(open.find((x) => x.email === gast.email)) === kaal(open.find((x) => x.email === onbekendAdres)) && !JSON.stringify(b1Lijst.data).includes(gast.id) && !JSON.stringify(b1Lijst.data).includes('Naam gast'), JSON.stringify(b1Lijst.data).slice(0, 300));
    check('B2 precies één melding, aan de genodigde met een account, van een bekende soort; niets voor het onbekende adres', meldingen.length === 1 && meldingen[0].userId === gast.id && Boolean(MELDING_SOORTEN[meldingen[0].kind]) && meldingen[0].message.includes(eig.email) && / \/ /.test(meldingen[0].title), JSON.stringify(meldingen.map((m) => [m.userId === gast.id, m.kind])));
    const mijn = await roep('/api/huis/leden', gast, { actie: 'uitnodigingen' });
    const mijnLijst = (mijn.data.uitnodigingen ?? []) as Array<Record<string, any>>;
    check('B2 de genodigde ziet zijn uitnodiging met woning, rol en wie uitnodigt; een ander ziet niets', mijn.status === 200 && mijnLijst.length === 1 && mijnLijst[0].woningNaam === 'Proef g02' && mijnLijst[0].rol === 'gast' && mijnLijst[0].doorEmail === eig.email && ((await roep('/api/huis/leden', vreemd, { actie: 'uitnodigingen' })).data.uitnodigingen ?? ['x']).length === 0);
    const uitId = String(mijnLijst[0]?.id ?? randomUUID());
    const b2Vreemd = await roep('/api/huis/leden', vreemd, { actie: 'aanvaarden', uitnodigingId: uitId });
    check('B2 een ander kan de uitnodiging niet aanvaarden (404) en wordt geen lid', b2Vreemd.status === 404 && (await huis.overzicht(vreemd.id, woningId)) === null && (await pool.query(`SELECT count(*)::int AS n FROM app.huis_leden WHERE woning_id = $1`, [woningId])).rows[0].n === 1);
    const b2Ja = await roep('/api/huis/leden', gast, { actie: 'aanvaarden', uitnodigingId: uitId });
    const naJa = await huis.overzicht(gast.id, woningId);
    const ledenNa = await roep('/api/huis/leden', eig, { woningId, actie: 'lijst' });
    check('B2 aanvaarden door de genodigde zelf: nu lid met de rol «gast» (alleen lezen), zichtbaar met naam in de ledenlijst; de uitnodiging is weg',
      b2Ja.status === 200 && naJa?.lid.rol === 'gast' && naJa?.lid.magSchrijven === false && (ledenNa.data.leden ?? []).some((l: any) => l.userId === gast.id && l.email === gast.email) && (ledenNa.data.uitnodigingen ?? []).length === 1 && ((await roep('/api/huis/leden', gast, { actie: 'uitnodigingen' })).data.uitnodigingen ?? ['x']).length === 0, `${b2Ja.status} ${JSON.stringify(b2Ja.data)}`);
    check('B2 een lid dat geen eigenaar is kan niemand uitnodigen (403)', (await roep('/api/huis/leden', gast, { woningId, actie: 'toevoegen', email: vreemd.email, rol: 'lid' })).status === 403);
    // afwijzen: onzichtbaar voor de uitnodiger, en opnieuw uitnodigen geeft geen tweede melding
    meldingen.length = 0;
    await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: vreemd.email, rol: 'lid' });
    await h._uitnodigingKoppelingKlaar?.();
    const vreemdUit = ((await roep('/api/huis/leden', vreemd, { actie: 'uitnodigingen' })).data.uitnodigingen ?? []) as Array<Record<string, any>>;
    const b2Nee = await roep('/api/huis/leden', vreemd, { actie: 'afwijzen', uitnodigingId: String(vreemdUit[0]?.id ?? randomUUID()) });
    const naNee = await roep('/api/huis/leden', eig, { woningId, actie: 'lijst' });
    await wacht(15);
    const opnieuw = await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: vreemd.email, rol: 'gast' });
    const opnieuwOnbekend = await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: onbekendAdres, rol: 'lid' });
    await h._uitnodigingKoppelingKlaar?.();
    check('B2 afwijzen: geen lidmaatschap; de uitnodiger ziet nog steeds «uitgenodigd» (geen aanwijzing dat het account bestaat); opnieuw uitnodigen geeft hetzelfde antwoord en GEEN nieuwe melding',
      b2Nee.status === 200 && (await huis.overzicht(vreemd.id, woningId)) === null && (naNee.data.uitnodigingen ?? []).filter((x: any) => x.email === vreemd.email && x.stand === 'uitgenodigd').length === 1 && JSON.stringify(opnieuw.data) === JSON.stringify(b1a.data) && meldingen.length === 1 && ((await roep('/api/huis/leden', vreemd, { actie: 'uitnodigingen' })).data.uitnodigingen ?? ['x']).length === 0, `meldingen=${meldingen.length} nee=${b2Nee.status}`);
    // Wat de uitnodiger na «opnieuw uitnodigen» ziet, verandert voor een afgewezen rij precies zoals voor een rij zonder account.
    const naOpnieuw = await roep('/api/huis/leden', eig, { woningId, actie: 'lijst' });
    const rij = (lijst: Record<string, any>, email: string) => (lijst.data.uitnodigingen ?? []).find((x: any) => x.email === email) as Record<string, any> | undefined;
    const ververst = (email: string, rol: string) => rij(naOpnieuw, email)?.rol === rol && rij(naOpnieuw, email)?.stand === 'uitgenodigd' && Date.parse(rij(naOpnieuw, email)?.verlooptOp) > Date.parse(rij(naNee, email)?.verlooptOp) && rij(naOpnieuw, email)?.aangemaaktOp === rij(naNee, email)?.aangemaaktOp;
    check('B2 opnieuw uitnodigen ververst rol en einddatum op dezelfde manier voor de afgewezen rij en voor de rij zonder account (geen verschil te zien)', JSON.stringify(opnieuwOnbekend.data) === JSON.stringify(opnieuw.data) && ververst(vreemd.email, 'gast') && ververst(onbekendAdres, 'lid') && Object.keys(rij(naOpnieuw, vreemd.email) ?? {}).join() === Object.keys(rij(naOpnieuw, onbekendAdres) ?? { x: 1 }).join(), JSON.stringify([rij(naOpnieuw, vreemd.email), rij(naOpnieuw, onbekendAdres)]).slice(0, 400));
    // intrekken en opnieuw uitnodigen omzeilt de afwijzing niet
    await roep('/api/huis/leden', eig, { woningId, actie: 'intrekken', uitnodigingId: String(rij(naOpnieuw, vreemd.email)?.id ?? randomUUID()) });
    await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: vreemd.email, rol: 'lid' });
    await h._uitnodigingKoppelingKlaar?.();
    check('B2 intrekken en opnieuw uitnodigen omzeilt een afwijzing niet: niets in de lijst van de genodigde, geen nieuwe melding', ((await roep('/api/huis/leden', vreemd, { actie: 'uitnodigingen' })).data.uitnodigingen ?? ['x']).length === 0 && meldingen.length === 1, `meldingen=${meldingen.length}`);
    // intrekken door de eigenaar en verlopen
    const teIntrekken = (naNee.data.uitnodigingen ?? []).find((x: any) => x.email === onbekendAdres);
    const ingetrokken = await roep('/api/huis/leden', eig, { woningId, actie: 'intrekken', uitnodigingId: String(teIntrekken?.id ?? randomUUID()) });
    check('B2 de eigenaar kan een openstaande uitnodiging intrekken; een niet-eigenaar niet', ingetrokken.status === 200 && ((await roep('/api/huis/leden', eig, { woningId, actie: 'lijst' })).data.uitnodigingen ?? []).every((x: any) => x.email !== onbekendAdres) && (await roep('/api/huis/leden', gast, { woningId, actie: 'intrekken', uitnodigingId: randomUUID() })).status === 403);
    const w2 = await huis.woningMaken(eig.id, 'Tweede g02'); if ('fout' in w2) throw new Error(w2.fout); woningen.push(w2.id);
    await roep('/api/huis/leden', eig, { woningId: w2.id, actie: 'toevoegen', email: vreemd.email, rol: 'installateur', dagen: 3 });
    await h._uitnodigingKoppelingKlaar?.();
    await pool.query(`UPDATE app.huis_uitnodigingen SET verloopt_op = now() - interval '1 minute' WHERE woning_id = $1`, [w2.id]).catch(() => undefined);
    const verlopen = (await pool.query(`SELECT id FROM app.huis_uitnodigingen WHERE woning_id = $1`, [w2.id]).catch(() => ({ rows: [] as any[] }))).rows[0];
    check('B2 een verlopen uitnodiging is niet meer te aanvaarden (404) en staat niet in de lijst van de genodigde', (await roep('/api/huis/leden', vreemd, { actie: 'aanvaarden', uitnodigingId: String(verlopen?.id ?? randomUUID()) })).status === 404 && ((await roep('/api/huis/leden', vreemd, { actie: 'uitnodigingen' })).data.uitnodigingen ?? ['x']).length === 0 && (await huis.overzicht(vreemd.id, w2.id)) === null);
    // de route kan de oude rechtstreekse toevoeging niet meer bereiken
    const routeBron = /'POST \/api\/huis\/leden': route\(([\s\S]*?)\n    \}\),/.exec(lees('backend/huis-vnext.ts'))?.[1] ?? 'lidToevoegen(';
    check('B1 de route /api/huis/leden roept de rechtstreekse toevoeging (lidToevoegen) niet meer aan', !/lidToevoegen\(/.test(routeBron) && /lidUitnodigen\(/.test(routeBron));

    // ---- B3: tempo — tien uitnodigingen per uur per gebruiker
    const w3 = await huis.woningMaken(nodiger.id, 'Tempo g02'); if ('fout' in w3) throw new Error(w3.fout); woningen.push(w3.id);
    const b3: number[] = [];
    for (let i = 0; i < 12; i++) b3.push((await roep('/api/huis/leden', nodiger, { woningId: w3.id, actie: 'toevoegen', email: `g02-raad-${i}-${sfx}@eenheid.test`, rol: 'gast' })).status);
    await h._uitnodigingKoppelingKlaar?.();
    check('B3 raden van adressen: na tien uitnodigingen in een uur volgt 429; daarvoor steeds hetzelfde antwoord', b3.slice(0, 10).every((x) => x === 200) && b3.slice(10).every((x) => x === 429), b3.join());

    // ================================================================ C. Na de toetsing (journaal toetsen/g02.md, opmerkingen 1–9)
    // Elk blok faalde vóór de patch van «Після перевірки»; het nummer tussen haakjes is de opmerking in het journaal.
    const eenzaam = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
    const tijd = '2026-11-12T08:00:00Z';
    // ---- C1 (1): afkappen op een emoji en een eenzame surrogaat van de bron → nooit een halve emoji naar jsonb
    const emo = adapter.vertaalEntiteit({ entity_id: 'sensor.emoji', state: `${'x'.repeat(199)}\u{1F600}`, attributes: { friendly_name: `${'n'.repeat(119)}\u{1F600}`, device_class: `${'y'.repeat(39)}\u{1F600}`, unit_of_measurement: `${'z'.repeat(39)}\u{1F600}` }, last_changed: tijd, last_updated: tijd });
    const emoTeksten = emo ? [String(emo.toestanden[0].waarde), emo.toestanden[0].eenheid, String(emo.mogelijkheden[0].klasse ?? ''), String(emo.mogelijkheden[0].eenheid ?? ''), emo.naam] : [];
    const kapot = adapter.vertaalEntiteit({ entity_id: 'alarm_control_panel.kapot', state: 'armed_away\ud83d', attributes: { friendly_name: 'Alarm \udc00' }, last_changed: tijd, last_updated: tijd });
    check('C1 (1) afkappen op een emoji laat geen halve emoji achter en een eenzame surrogaat van de bron verdwijnt — toestand, klasse, eenheid en naam',
      emoTeksten.length === 5 && !emoTeksten.some(eenzaam) && emoTeksten[0].length <= 200 && emoTeksten[1].length <= 40 && Boolean(kapot) && !eenzaam(String(kapot!.toestanden[0].waarde)) && !eenzaam(kapot!.naam),
      emoTeksten.map((t) => t.charCodeAt(t.length - 1).toString(16)).join());
    bron.s.statesRuw = ENTITEITEN.map((e) => (e.entity_id === 'sensor.temp_keuken' ? { ...e, state: `${'x'.repeat(199)}\u{1F600}` } : e.entity_id === 'sensor.energie_totaal' ? { ...e, state: 'kapot\ud83d' } : e.entity_id === 'binary_sensor.voordeur' ? { ...e, attributes: { ...e.attributes, device_class: `${'d'.repeat(39)}\u{1F600}` } } : e));
    let c1Fout = ''; let c1: any = null; let c1R: { status: number } | null = null;
    try { c1 = await huis.integratieSynchroniseren(eig.id, woningId, integ.id); c1R = await roep('/api/huis/integraties/synchroniseren', eig, { woningId, integratieId: integ.id }); } catch (err) { c1Fout = `${(err as { code?: string }).code ?? ''} ${(err as Error).message}`.slice(0, 140); }
    bron.s.statesRuw = undefined;
    const c1Stand = (await pool.query(`SELECT stand FROM app.huis_integraties WHERE id = $1`, [integ.id])).rows[0]?.stand;
    check('C1 (1) synchroniseren terwijl de bron emoji op de grens en eenzame surrogaten stuurt: geen 22P02/500, alle 13 bijgewerkt (ook via de route), integratie «verbonden»', c1Fout === '' && c1?.bijgewerkt === 13 && c1R?.status === 200 && c1Stand === 'verbonden', c1Fout || JSON.stringify(c1));

    // ---- C2 (2): de grens van 2000 geldt voor wat de woning importeert, niet voor de plaats in het antwoord van de bron
    const veel: NepEntiteit[] = Array.from({ length: 2100 }, (_, i) => ({ entity_id: `sensor.vul_${String(i).padStart(4, '0')}`, state: '1', attributes: { device_class: 'temperature', unit_of_measurement: '°C' }, last_changed: tijd, last_updated: tijd }));
    bron.s.statesRuw = [...veel, ...ENTITEITEN];
    const c2Ont: any = await huis.integratieOntdekken(eig.id, woningId, integ.id);
    const c2Sync: any = await huis.integratieSynchroniseren(eig.id, woningId, integ.id);
    const c2Off = (await pool.query(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1 AND online = false AND bron_id <> 'sensor.vermogen_nu'`, [woningId])).rows[0].n;
    const c2Onb = (await pool.query(`SELECT count(*)::int AS n FROM app.huis_toestanden t JOIN app.huis_apparaten a ON a.id = t.apparaat_id WHERE t.woning_id = $1 AND t.kwaliteit = 'onbeschikbaar' AND a.bron_id <> 'sensor.vermogen_nu'`, [woningId])).rows[0].n;
    check('C2 (2) bron met 2100 andere sensoren vóór de geïmporteerde: ontdekken toont hoogstens 2000, waaronder alle 13 geïmporteerde; synchroniseren werkt de 13 bij en zet niets ten onrechte op «offline/onbeschikbaar»',
      (c2Ont.apparaten?.length ?? 9999) <= 2000 && (c2Ont.apparaten ?? []).filter((a: any) => a.bestaat).length === 13 && c2Sync?.bijgewerkt === 13 && c2Sync?.weg === 0 && c2Off === 0 && c2Onb === 0,
      JSON.stringify({ ont: c2Ont.apparaten?.length, bestaat: (c2Ont.apparaten ?? []).filter((a: any) => a.bestaat).length, over: c2Ont.overgeslagen, sync: c2Sync, off: c2Off, onb: c2Onb }));
    const c2Imp: any = await huis.integratieImporteren(eig.id, woningId, integ.id, ['sensor.vul_2099']);
    const c2Rij = (await pool.query(`SELECT id FROM app.huis_apparaten WHERE woning_id = $1 AND bron_id = 'sensor.vul_2099'`, [woningId])).rows;
    await pool.query(`DELETE FROM app.huis_apparaten WHERE woning_id = $1 AND bron_id LIKE 'sensor.vul_%'`, [woningId]);
    check('C2 (2) een uitdrukkelijk gekozen entiteit die bij de bron na de 2000e staat, is te importeren', c2Imp?.nieuw === 1 && c2Rij.length === 1, JSON.stringify(c2Imp));
    const c2B: any = 'id' in integB ? await huis.integratieImporteren(eig.id, wB.id, integB.id, null) : null;
    const c2BN = (await pool.query(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1`, [wB.id])).rows[0].n;
    check('C2 (2) «alles importeren» uit zo’n bron: hoogstens 2000 apparaten in de woning, de rest eerlijk geteld als overgeslagen', c2BN <= 2000 && c2BN >= 1990 && (c2B?.overgeslagen ?? 0) >= 100, JSON.stringify({ n: c2BN, nieuw: c2B?.nieuw, over: c2B?.overgeslagen }));
    bron.s.statesRuw = undefined;

    // ---- C5 (5): ACK met een kapotte toestand, en een waarneming die niet vast te leggen is → de deadline sluit toch af
    const alarmApp = ov.apparaten.find((a) => a.bronId === 'alarm_control_panel.huis')!;
    bron.s.lezenRuw = { entity_id: 'alarm_control_panel.huis', state: 'armed_away\ud83d', attributes: { friendly_name: 'Alarm' }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() };
    let c5Fout = ''; let c5L: { status: number; data: Record<string, any> } | null = null;
    try { await huis.opdrachtGeven(eig.id, woningId, { apparaatId: alarmApp.id, mogelijkheid: 'alarm', waarde: { aan: true }, idempotentie: `g02-${sfx}-c5a`, stepUpOk: true }); } catch (err) { c5Fout = `geven: ${(err as Error).message}`.slice(0, 120); }
    const c5Id = String((await pool.query(`SELECT id FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, `g02-${sfx}-c5a`])).rows[0]?.id ?? randomUUID());
    try { c5L = await roep('/api/huis/opdrachten/een', eig, { woningId, id: c5Id }); } catch (err) { c5Fout += ` lezen: ${(err as Error).message}`.slice(0, 120); }
    check('C5 (5) ACK met een eenzame surrogaat in de toestand van het alarm: geen uitzondering, de opdracht is voltooid, nalezen geeft 200', c5Fout === '' && c5L?.status === 200 && c5L?.data?.opdracht?.stand === 'voltooid', c5Fout || `${c5L?.status} ${c5L?.data?.opdracht?.stand}`);
    const mig = getPool('migratie');
    await mig.query(`DROP TRIGGER IF EXISTS g02_proef_weiger ON app.huis_toestanden`);
    await mig.query(`CREATE OR REPLACE FUNCTION app.g02_proef_weiger() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.apparaat_id = '${alarmApp.id}'::uuid THEN RAISE EXCEPTION 'proef g02: waarneming geweigerd' USING ERRCODE = '22P02'; END IF; RETURN NEW; END $f$`);
    await mig.query(`CREATE TRIGGER g02_proef_weiger BEFORE INSERT OR UPDATE ON app.huis_toestanden FOR EACH ROW EXECUTE FUNCTION app.g02_proef_weiger()`);
    let c5bFout = ''; let c5bL: { status: number; data: Record<string, any> } | null = null; let c5bStand = '';
    try {
      bron.s.lezenRuw = { entity_id: 'alarm_control_panel.huis', state: 'disarmed', attributes: { friendly_name: 'Alarm' }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() };
      try { c5bStand = (await huis.opdrachtGeven(eig.id, woningId, { apparaatId: alarmApp.id, mogelijkheid: 'alarm', waarde: { aan: false }, idempotentie: `g02-${sfx}-c5b`, stepUpOk: true })).opdracht?.stand ?? ''; } catch (err) { c5bFout = `geven: ${(err as Error).message}`.slice(0, 120); }
      await pool.query(`UPDATE app.huis_opdrachten SET deadline = now() - interval '1 minute' WHERE woning_id = $1 AND idempotentie = $2`, [woningId, `g02-${sfx}-c5b`]);
      const id = String((await pool.query(`SELECT id FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, `g02-${sfx}-c5b`])).rows[0]?.id ?? randomUUID());
      try { c5bL = await roep('/api/huis/opdrachten/een', eig, { woningId, id }); } catch (err) { c5bFout += ` lezen: ${(err as Error).message}`.slice(0, 120); }
    } finally {
      await mig.query(`DROP TRIGGER IF EXISTS g02_proef_weiger ON app.huis_toestanden`);
      await mig.query(`DROP FUNCTION IF EXISTS app.g02_proef_weiger()`);
      bron.s.lezenRuw = undefined;
    }
    check('C5 (5) lukt het vastleggen van de waarneming niet, dan blijft de opdracht «verzonden» en sluit de deadline haar toch af (verlopen), zonder 500', c5bFout === '' && c5bStand === 'verzonden' && c5bL?.status === 200 && ['verlopen', 'gedeeltelijk'].includes(c5bL?.data?.opdracht?.stand), c5bFout || `${c5bStand} ${c5bL?.status} ${c5bL?.data?.opdracht?.stand ?? c5bL?.data?.error}`);

    // ---- C7 (7): HUIS_BEZET is tijdelijk — het voorstel blijft «wacht», de sleutel blijft vrij, later lukt het wel
    const diensten = () => bron.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/')).length;
    const vs7 = await huis.voorstelMaken(eig.id, woningId, { door: 'ai', samenvatting: 'Lamp aan (proef C7)', apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true } });
    const vs7Id = 'id' in vs7 ? vs7.id : randomUUID();
    h._zetHaWachtMs?.(60); bron.s.vertragingMs = 700;
    const bezig = [huis.integratieSynchroniseren(eig.id, woningId, integ.id), huis.integratieSynchroniseren(eig.id, woningId, integ.id)];
    await wacht(80);
    const c7a = await roep('/api/huis/voorstellen', eig, { woningId, actie: 'goedkeuren', id: vs7Id });
    const c7o = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `g02-${sfx}-c7` });
    await Promise.all(bezig); bron.s.vertragingMs = 0; h._zetHaWachtMs?.(null);
    const c7Stand = (await pool.query(`SELECT stand, opdracht_id FROM app.huis_voorstellen WHERE id = $1`, [vs7Id])).rows[0];
    const voorC7 = diensten();
    const c7b = await roep('/api/huis/voorstellen', eig, { woningId, actie: 'goedkeuren', id: vs7Id });
    const c7o2 = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `g02-${sfx}-c7` });
    check('C7 (7) goedkeuren terwijl de bron bezet is: 429 HUIS_BEZET, het voorstel blijft «wacht» zonder opdracht; daarna goedkeuren lukt en verstuurt één keer',
      c7a.status === 429 && c7a.data?.error === 'HUIS_BEZET' && c7Stand?.stand === 'wacht' && !c7Stand?.opdracht_id && c7b.status === 200 && c7b.data?.voorstel?.stand === 'goedgekeurd' && ['voltooid', 'verzonden', 'bevestigd'].includes(c7b.data?.opdracht?.stand),
      JSON.stringify({ a: [c7a.status, c7a.data?.error], stand: c7Stand, b: [c7b.status, c7b.data?.error, c7b.data?.opdracht?.stand] }));
    check('C7 (7) een gewone opdracht die HUIS_BEZET kreeg, legt haar sleutel niet vast: dezelfde sleutel daarna wordt echt verstuurd', !c7o.ok && c7o.fout === 'HUIS_BEZET' && !c7o.opdracht && c7o2.ok && c7o2.opdracht.stand !== 'mislukt' && diensten() === voorC7 + 2,
      JSON.stringify({ eerst: [c7o.ok, (c7o as any).fout, c7o.opdracht?.stand], daarna: [c7o2.ok, c7o2.opdracht?.stand], diensten: diensten() - voorC7 }));

    // ---- C10 (10): een sleutel die AL een opdracht heeft, geeft die opdracht terug — ook als de bron net bezet is (geen 429)
    const sc10 = await huis.sceneBewaren(eig.id, woningId, null, { naam: 'Proef C10', icoon: 'licht', favoriet: false, stappen: [{ apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true } }] });
    const sc10Id = 'id' in sc10 ? sc10.id : randomUUID();
    const sc10a = await huis.sceneUitvoeren(eig.id, woningId, sc10Id, `g02-${sfx}-c10s`);
    h._zetHaWachtMs?.(60); bron.s.vertragingMs = 700;
    const bezig10 = [huis.integratieSynchroniseren(eig.id, woningId, integ.id), huis.integratieSynchroniseren(eig.id, woningId, integ.id)];
    await wacht(80);
    const voorC10 = diensten();
    const c10o = await roep('/api/huis/opdrachten/nieuw', eig, { woningId, apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `g02-${sfx}-c7` });
    const sc10b = await huis.sceneUitvoeren(eig.id, woningId, sc10Id, `g02-${sfx}-c10s`);
    const c10Diensten = diensten() - voorC10;
    await Promise.all(bezig10); bron.s.vertragingMs = 0; h._zetHaWachtMs?.(null);
    const sc10Run = (await pool.query(`SELECT laatste_run->>'uitkomst' AS u FROM app.huis_scenes WHERE id = $1`, [sc10Id])).rows[0]?.u;
    check('C10 (10) bron bezet, herhaling met de sleutel van een al uitgevoerde opdracht: 200 met dezelfde opdracht en niets verstuurd; een herhaalde scène blijft «voltooid»',
      c10o.status === 200 && c10o.data?.opdracht?.id === c7o2.opdracht?.id && c10Diensten === 0 && (sc10a as any).uitkomst === 'voltooid' && (sc10b as any).uitkomst === 'voltooid' && sc10Run === 'voltooid',
      JSON.stringify({ o: [c10o.status, c10o.data?.error, c10o.data?.opdracht?.stand], scene: [(sc10a as any).uitkomst, (sc10b as any).uitkomst, sc10Run], diensten: c10Diensten }));

    // ---- C8 (8): een gast kan de sleutel van een voorstel of van een ander niet vooraf bezetten
    const vs8 = await huis.voorstelMaken(eig.id, woningId, { door: 'ai', samenvatting: 'Lamp uit (proef C8)', apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false } });
    const vs8Id = 'id' in vs8 ? vs8.id : randomUUID();
    const zichtbaar = ((await roep('/api/huis/voorstellen', gast, { woningId, actie: 'lijst' })).data.voorstellen ?? []).some((x: any) => x.id === vs8Id);
    const kraak = await roep('/api/huis/opdrachten/nieuw', gast, { woningId, apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `voorstel-${vs8Id.replace(/-/g, '').slice(0, 24)}` });
    const voorC8 = diensten();
    const c8 = await roep('/api/huis/voorstellen', eig, { woningId, actie: 'goedkeuren', id: vs8Id });
    check('C8 (8) de gast ziet het voorstel, maar een opdracht met de sleutel «voorstel-…» wordt geweigerd zonder de sleutel te bezetten; goedkeuren door de eigenaar verstuurt echt',
      zichtbaar && kraak.status === 400 && kraak.data?.error === 'IDEMPOTENTIE_ONGELDIG' && c8.status === 200 && c8.data?.opdracht?.stand !== 'geweigerd' && !c8.data?.opdracht?.fout && diensten() === voorC8 + 1,
      JSON.stringify({ kraak: [kraak.status, kraak.data?.error], goed: [c8.status, c8.data?.opdracht?.stand, c8.data?.opdracht?.fout], diensten: diensten() - voorC8 }));
    const sleutel8 = `g02-${sfx}-c8-gedeeld`;
    const gastWeiger = await roep('/api/huis/opdrachten/nieuw', gast, { woningId, apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: sleutel8 });
    const voorC8b = diensten();
    const eigNa = await huis.opdrachtGeven(eig.id, woningId, { apparaatId: boiler.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: sleutel8 });
    check('C8 (8) een weigering wegens «alleen kijken» bezet de sleutel niet: dezelfde sleutel van een bewoner wordt daarna gewoon verstuurd', gastWeiger.status === 409 && gastWeiger.data?.error === 'ROL_ALLEEN_LEZEN' && eigNa.ok && eigNa.opdracht.stand !== 'geweigerd' && diensten() === voorC8b + 1,
      JSON.stringify({ gast: [gastWeiger.status, gastWeiger.data?.error], eig: [eigNa.ok, eigNa.opdracht?.stand, eigNa.opdracht?.fout] }));

    // ---- C9 (9): stuurtekens/eenzame surrogaten in een adres → 400 (geen 500, telt niet mee); nieuwe gebeurtenissen tweetalig
    let c9Fout = ''; const c9: number[] = [];
    const eigTempoVoor = Number((await pool.query(`SELECT COALESCE(sum(hits), 0)::int AS n FROM app.rate_limits WHERE bucket = $1`, [`huis-uitnodigen:${eig.id}`])).rows[0].n);
    for (const adres of ['a\u0000b@voorbeeld.test', 'a\ud83d@voorbeeld.test', 'a\u0007b@voorbeeld.test']) {
      try { const r = await roep('/api/huis/leden', eig, { woningId, actie: 'toevoegen', email: adres, rol: 'gast' }); c9.push(r.status); if (r.data?.error !== 'EMAIL_ONGELDIG') c9Fout += ` ${r.data?.error}`; } catch (err) { c9Fout += ` ${(err as { code?: string }).code ?? ''}:${(err as Error).message.slice(0, 60)}`; }
    }
    const eigTempoNa = Number((await pool.query(`SELECT COALESCE(sum(hits), 0)::int AS n FROM app.rate_limits WHERE bucket = $1`, [`huis-uitnodigen:${eig.id}`])).rows[0].n);
    check('C9 (9) een adres met NUL, een eenzame surrogaat of een stuurteken: 400 EMAIL_ONGELDIG (geen 500) en het telt niet mee voor de tempolimiet', c9Fout === '' && c9.length === 3 && c9.every((s) => s === 400) && eigTempoNa === eigTempoVoor, `${c9.join()} ${c9Fout} tempo ${eigTempoVoor}→${eigTempoNa}`);
    const cyr = /[А-Яа-яІіЇїЄєҐґ]/;
    const ledenGeb = (await pool.query(`SELECT bericht FROM app.huis_gebeurtenissen WHERE woning_id = ANY($1::uuid[]) AND (soort = 'leden' OR bericht LIKE '%VERZENDING_ONDERBROKEN%' OR bericht LIKE '%onderbroken%')`, [woningen])).rows.map((r) => String(r.bericht));
    check('C9 (9) de nieuwe gebeurtenissen (uitnodiging, aanvaard, rol gewijzigd, opdracht onderbroken) staan er in het Oekraïens én het Nederlands', ledenGeb.length >= 4 && ledenGeb.every((b) => cyr.test(b) && / \/ /.test(b)), ledenGeb.filter((b) => !cyr.test(b)).slice(0, 3).join(' | '));

    // ---- C6 (6): elke nieuwe weigering, elke wijziging van het lidmaatschap en het afsluiten door het systeem laat een auditregel na
    const verw = await roep('/api/huis/leden', eig, { woningId, actie: 'verwijder', userId: gast.id });
    const auditVan = async (ownerId: string) => (await pool.query(`SELECT action, result, details::text AS d FROM app.audit WHERE owner_id = $1`, [ownerId])).rows as Array<{ action: string; result: string; d: string }>;
    const tel = (rijen: Array<{ action: string }>, actie: string) => rijen.filter((r) => r.action === actie).length;
    const aDruk = await auditVan(druk.id), aNod = await auditVan(nodiger.id), aEig = await auditVan(eig.id), aGast = await auditVan(gast.id), aVreemd = await auditVan(vreemd.id);
    const geenAdres = [...aDruk, ...aNod, ...aEig, ...aGast, ...aVreemd].filter((r) => r.action.startsWith('huis.')).every((r) => !r.d.includes('@eenheid.test'));
    check('C6 (6) tempo: per kosten-soort precies één auditregel bij de eerste weigering in het venster (druk: synchroniseren + energie; nodiger: uitnodigen)', tel(aDruk, 'huis.tempo.geweigerd') === 2 && tel(aNod, 'huis.tempo.geweigerd') === 1 && aNod.some((r) => r.action === 'huis.tempo.geweigerd' && r.result === 'denied' && r.d.includes('uitnodigen')), JSON.stringify({ druk: tel(aDruk, 'huis.tempo.geweigerd'), nod: tel(aNod, 'huis.tempo.geweigerd') }));
    check('C6 (6) uitnodigen, intrekken, aanvaarden, afwijzen, lid weghalen en het afsluiten van een onderbroken opdracht: elk een auditregel, nergens een e-mailadres in de details',
      verw.status === 200 && tel(aNod, 'huis.uitnodiging.vastgelegd') === 10 && tel(aEig, 'huis.uitnodiging.vastgelegd') >= 5 && tel(aEig, 'huis.uitnodiging.ingetrokken') >= 2 && tel(aEig, 'huis.uitnodiging.aanvaard') >= 1 && tel(aVreemd, 'huis.uitnodiging.afgewezen') === 1 && tel(aEig, 'huis.lid.verwijderd') === 1 && tel(aEig, 'huis.opdracht.afgesloten') >= 1 && geenAdres,
      JSON.stringify({ verw: verw.status, nod: tel(aNod, 'huis.uitnodiging.vastgelegd'), eig: ['huis.uitnodiging.vastgelegd', 'huis.uitnodiging.ingetrokken', 'huis.uitnodiging.aanvaard', 'huis.lid.verwijderd', 'huis.opdracht.afgesloten'].map((x) => tel(aEig, x)), vreemd: tel(aVreemd, 'huis.uitnodiging.afgewezen'), geenAdres }));
    const nodMeld = meldingen.filter((m) => m.userId === nodiger.id);
    check('C6 (6) wie de grens van tien uitnodigingen per uur bereikt, krijgt één melding (uk / nl) in het meldingencentrum', nodMeld.length === 1 && Boolean(MELDING_SOORTEN[nodMeld[0].kind]) && / \/ /.test(nodMeld[0].title), JSON.stringify(nodMeld.map((m) => [m.kind, m.title])));

    // ---- C11 (11): een lid kan zelf vertrekken (ook een lidmaatschap van vóór de patch, zonder toestemming); de eigenaar niet
    await pool.query(`INSERT INTO app.huis_leden (woning_id, user_id, rol) VALUES ($1,$2,'gast') ON CONFLICT DO NOTHING`, [woningId, vreemd.id]);
    const c11Voor = Boolean(await huis.overzicht(vreemd.id, woningId));
    const c11 = await roep('/api/huis/leden', vreemd, { woningId, actie: 'verlaten' });
    const c11Eig = await roep('/api/huis/leden', eig, { woningId, actie: 'verlaten' });
    const c11Audit = (await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'huis.lid.vertrokken'`, [eig.id])).rows[0].n;
    const c11Geb = (await pool.query(`SELECT bericht FROM app.huis_gebeurtenissen WHERE woning_id = $1 AND soort = 'leden' ORDER BY id DESC LIMIT 1`, [woningId])).rows[0]?.bericht ?? '';
    check('C11 (11) een lid verlaat de woning zelf: 200, daarna geen toegang, auditregel bij de eigenaar en een tweetalige gebeurtenis; de eigenaar kan niet «vertrekken»',
      c11Voor && c11.status === 200 && (await huis.overzicht(vreemd.id, woningId)) === null && c11Audit === 1 && cyr.test(c11Geb) && / \/ /.test(c11Geb) && c11Eig.status === 400 && Boolean(await huis.overzicht(eig.id, woningId)),
      JSON.stringify({ voor: c11Voor, lid: [c11.status, c11.data?.error], eig: [c11Eig.status, c11Eig.data?.error], audit: c11Audit, geb: c11Geb.slice(0, 60) }));

    // ---- C12 (12): de melding aan de genodigde zegt waar te aanvaarden en linkt naar de instellingen van de woning
    const c12Voor = meldingen.length;
    await roep('/api/huis/leden', eig, { woningId: w2.id, actie: 'toevoegen', email: druk.email, rol: 'gast' });
    await h._uitnodigingKoppelingKlaar?.();
    const c12 = meldingen.slice(c12Voor).find((m) => m.userId === druk.id);
    check('C12 (12) melding aan de genodigde: «Налаштування → Запрошення для вас» én «Instellingen → Uitnodigingen voor u», link naar /settings', Boolean(c12) && /Налаштування/.test(c12!.message) && /Запрошення для вас/.test(c12!.message) && /Instellingen/.test(c12!.message) && /Uitnodigingen voor u/.test(c12!.message) && /^https:\/\/huis\.tarasevych\.com\/settings$/.test(String(c12!.link)), JSON.stringify(c12 ? { link: c12.link, msg: c12.message.slice(0, 120) } : null));

    // ================================================================ D. POST /api/share/email (opmerking 4): zelfde antwoord, tempo per gebruiker
    // Via de echte handler (backend/index.ts) met een nagebootste Google — er gaat niets naar buiten.
    registreerMelder(async () => undefined);
    const G = await nepGoogle({ ownerEmail: `g02-d-sys-${sfx}@example.test` });
    try {
      const idVan = async (email: string) => (await pool.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1 ORDER BY seq DESC LIMIT 1", [email])).rows[0]?.id as string;
      const maakMens = async (naam: string) => {
        const email = `g02-d-${naam}-${sfx}@example.test`, b = G.browser();
        await b.aanmelden(`g02-d-${naam}-${sfx}`, email, { intent: 'login' });
        const id = await idVan(email);
        await pool.query("UPDATE app.records SET data = data || '{\"status\":\"approved\"}'::jsonb WHERE tbl = 'users' AND id = $1", [id]);
        dMensen.push(id);
        return { b, email, id };
      };
      const O = await maakMens('o'); const M = await maakMens('m');
      const hub = (u: { b: ReturnType<typeof G.browser> }, pad: string, extra: Record<string, unknown> = {}) => u.b.verzoek('hub.tarasevych.com', pad, u.b.ctxBody('hub', extra));
      await hub(M, '/api/workspace/load');
      const wsO = String((await hub(O, '/api/workspace/load')).data.workspace?.id ?? '');
      const dBestaand = await hub(O, '/api/share/email', { workspaceId: wsO, email: M.email, workspaceRole: 'member' });
      const dOnbekend = await hub(O, '/api/share/email', { workspaceId: wsO, email: `g02-d-niemand-${sfx}@example.test`, workspaceRole: 'member' });
      check('D1 (4) delen per e-mail: hetzelfde antwoord (status en inhoud) voor een bestaand goedgekeurd account en voor een onbekend adres', dBestaand.status === 200 && dOnbekend.status === 200 && JSON.stringify(dBestaand.data) === JSON.stringify(dOnbekend.data), `${dBestaand.status} ${JSON.stringify(dBestaand.data)} | ${dOnbekend.status} ${JSON.stringify(dOnbekend.data)}`);
      let dNul = 0; try { dNul = (await hub(O, '/api/share/email', { workspaceId: wsO, email: 'a\u0000b@example.test', workspaceRole: 'member' })).status; } catch { dNul = -1; }
      // SEC-002 (slot v): sinds slot s haalt de router een NUL-teken uit een WAARDE van het JSON-lijf weg (server/platform/router.ts;
      // NUL in een sleutel, query of padparameter blijft 400 INVOER_NUL). Het adres wordt dus «ab@example.test» en krijgt het gewone
      // antwoord 200 — de toets eiste nog de oudere 400. Wat telt blijft: nooit 500. Telt die uitnodiging mee, dan schuift de grens in D3.
      // NUL у значенні тіла роутер тепер прибирає (slot s), тож 200 замість 400; головне — ніколи 500.
      check('D2 (4) een adres met een NUL-teken: geen 500 (200 met het NUL-teken weggehaald, of 400)', dNul === 200 || dNul === 400, String(dNul));
      const dVooraf = 2 + (dNul === 200 ? 1 : 0); // D1 (twee) en eventueel D2 tellen al mee voor de grens van twintig per uur
      const dReeks: number[] = [];
      for (let i = 0; i < 20; i++) dReeks.push((await hub(O, '/api/share/email', { workspaceId: wsO, email: `g02-d-raad-${i}-${sfx}@example.test`, workspaceRole: 'viewer' })).status);
      const dAudit = (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'security_audit' AND data->>'accountId' = $1 AND data->>'event' = 'workspace_share_rate_limited'`, [O.id])).rows[0].n;
      check('D3 (4) tempo per gebruiker: na twintig uitnodigingen per uur volgt 429 RATE_LIMITED, met één auditregel', dReeks.slice(0, 20 - dVooraf).every((s) => s === 200) && dReeks.slice(20 - dVooraf).every((s) => s === 429) && dAudit === 1, `${dReeks.join()} audit=${dAudit}`);
      await wacht(100); // de melding gaat na het antwoord weg
      const dMeld = (await pool.query(`SELECT data->>'title' AS t FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1 AND data->>'kind' = 'security_warning'`, [O.id])).rows.map((r) => String(r.t));
      check('D4 (13) bij de eerste weigering in het venster krijgt de eigenaar van het account één melding (uk / nl) in het meldingencentrum', dMeld.length === 1 && / \/ /.test(dMeld[0]), JSON.stringify(dMeld));
    } finally {
      G.herstel();
    }
  } finally {
    h._zetHaWachtMs?.(null);
    registreerMelder(async () => undefined);
    if (oudVertrouwd === undefined) delete process.env.HUIS_VERTROUWDE_TOESTELLEN; else process.env.HUIS_VERTROUWDE_TOESTELLEN = oudVertrouwd;
    await bron.stop().catch(() => undefined);
    for (const id of woningen) await pool.query(`DELETE FROM app.huis_woningen WHERE id = $1`, [id]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[eig.id, gast.id, vreemd.id, druk.id, nodiger.id]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.rate_limits WHERE bucket LIKE 'huis-%' AND (bucket LIKE $1 OR bucket LIKE $2 OR bucket LIKE $3)`, [`%${druk.id}`, `%${nodiger.id}`, `%${eig.id}`]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'workspace_members' AND (data->>'invitedBy' = ANY($1) OR data->>'userId' = ANY($1))`, [dMensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'workspaces' AND data->>'ownerUserId' = ANY($1)`, [dMensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'security_audit' AND data->>'accountId' = ANY($1)`, [dMensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = ANY($1)`, [dMensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [dMensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.rate_limits WHERE bucket = ANY($1)`, [dMensen.map((id) => `share-email:${id}`)]).catch(() => undefined);
  }
  return einde();
}
