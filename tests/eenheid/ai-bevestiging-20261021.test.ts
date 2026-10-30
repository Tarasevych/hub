// «Підтвердження на сайті» (21.10.2026, besluit van de eigenaar: rechten «у розробці» bouwen) — de ENE wachtrij voor acties die een
// AI voorstelt en die pas na een klik van de mens gebeuren (migratie 0098, shared/ai-bevestiging.ts, backend/ai-bevestiging.ts,
// backend/ai-bevestiging-routes.ts). Wat hier bewezen wordt, met de echte servercode tegen een wegwerp-PG:
//   1. zonder bevestiging gebeurt NIETS (de uitvoerder wordt niet aangeroepen, ook niet bij een weigering of verloop);
//   2. bevestigen door een ANDER account → «bestaat niet»; vanuit de ANDERE ruimte → weigering (en in het journaal);
//   3. gewijzigde parameters (hash van het scherm, of de rij in de database gemanipuleerd) → weigering;
//   4. verlopen (30 min) → weigering en stand 'verlopen';
//   5. hoog risico → verse sterke step-up vereist, daarna verbruikt; twee keer bevestigen = één keer uitvoeren;
//   6. de agent krijgt de uitkomst (wachten of later opvragen), alleen voor zijn eigen verzoek;
//   7. parameters staan versleuteld in de database, nooit in het journaal; de melding landt in de ruimte van het verzoek.
import { randomBytes, randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { sealWithEnvKey } from '../../server/platform/beveiliging';
import {
  BEVESTIG_FOUT, BEVESTIG_MAX_OPEN, BEVESTIG_STATUSSEN, BEVESTIG_TERMIJN_MS, MET_BEVESTIGING, RISICO_TEKST, STATUS_TEKST,
  bevestigLink, canoniek, hashInvoer, isEindStatus, stapOpNodig, volgendeStap,
} from '../../shared/ai-bevestiging';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-bevestiging-20261021');

  // ================================================================ 1. puur
  check('canonieke JSON: volgorde van sleutels maakt niet uit, undefined valt weg, arrays blijven in volgorde',
    canoniek({ b: 1, a: [2, { d: 'x', c: true }], z: undefined }) === canoniek({ a: [2, { c: true, d: 'x' }], b: 1 })
    && canoniek([1, 2]) !== canoniek([2, 1]) && canoniek({ a: 'é' }) === '{"a":"é"}');
  check('de hash hangt aan soort, ruimte én mens (een rij kan niet naar een ander account of de andere ruimte)',
    hashInvoer({ soort: 'x.y', ruimte: 'prive', userId: 'a', params: { q: 1 } }) !== hashInvoer({ soort: 'x.y', ruimte: 'technisch', userId: 'a', params: { q: 1 } })
    && hashInvoer({ soort: 'x.y', ruimte: 'prive', userId: 'a', params: { q: 1 } }) !== hashInvoer({ soort: 'x.y', ruimte: 'prive', userId: 'b', params: { q: 1 } }));
  check('risico: hoog en kritiek vragen een sterke step-up, laag en midden niet; termijn 30 minuten; hoogstens 20 open',
    stapOpNodig('hoog') && stapOpNodig('kritiek') && !stapOpNodig('midden') && !stapOpNodig('laag') && BEVESTIG_TERMIJN_MS === 30 * 60 * 1000 && BEVESTIG_MAX_OPEN === 20);
  check('elke stand en elk risico heeft een tekst in uk én nl; elke eindstand een Engelse instructie voor het model',
    BEVESTIG_STATUSSEN.every((s) => STATUS_TEKST[s].uk && STATUS_TEKST[s].nl && volgendeStap(s).length > 20)
    && (['laag', 'midden', 'hoog', 'kritiek'] as const).every((r) => RISICO_TEKST[r].uk && RISICO_TEKST[r].nl)
    && !isEindStatus('wacht') && !isEindStatus('bezig') && isEindStatus('uitgevoerd'));
  check('foutcodes van het mechanisme hebben een uitleg in beide talen (scherm en AI zeggen hetzelfde)',
    ['BEVESTIGING_ONBEKEND', 'BEVESTIGING_VERLOPEN', 'BEVESTIGING_ANDERE_RUIMTE', 'BEVESTIGING_PARAMETERS_GEWIJZIGD', 'STEP_UP_STRONG_REQUIRED', 'BEVESTIGING_KEUZE_VEREIST', 'SLEUTELKLUIS_GESLOTEN']
      .every((c) => BEVESTIG_FOUT[c]?.uk.length > 10 && BEVESTIG_FOUT[c]?.nl.length > 10));
  check('link naar de mens: de plek van de AI in de hub met het verzoek erbij; zonder agent het overzicht',
    bevestigLink('mcp.tarasevych.com', 'abc', 'claude') === 'https://mcp.tarasevych.com/agents#agent/claude?bevestiging=abc'
    && bevestigLink('mcp.tarasevych.com', 'abc', '') === 'https://mcp.tarasevych.com/agents#overzicht?bevestiging=abc');
  check('badge: mail verzenden, delen en foto’s altijd met bevestiging; maken en uploaden standaard',
    MET_BEVESTIGING.mail_send === 'altijd' && MET_BEVESTIGING.drive_share_file === 'altijd' && MET_BEVESTIGING.photos_picked_media === 'altijd'
    && MET_BEVESTIGING.drive_create_file === 'standaard' && MET_BEVESTIGING.drive_upload_file === 'standaard');

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-bevestiging (integratie): geen database'); return einde(); }

  // ================================================================ 2. met database
  const ab = await import('../../backend/ai-bevestiging');
  const { aiBevestigingRoutes } = await import('../../backend/ai-bevestiging-routes');
  const { registreerMelder } = await import('../../backend/melder');
  const { ruimteVoorNieuweMelding } = await import('../../backend/meldingen-ruimte');
  const { passkeyStapOpVastleggen, sterkeStapOpGeldig } = await import('../../backend/stap-op');
  const { TOEGESTANE_ROUTES } = await import('../../backend/site-aanroep');
  const { metNamens } = await import('../../backend/mcp-namens');
  const sys = getPool('systeem');
  const A = `ab-a-${randomUUID()}`, B = `ab-b-${randomUUID()}`;
  const GEHEIM = `geheim-${randomUUID()}`;
  let uitgevoerd = 0;
  const meldingen: Array<{ userId: string; kind: string; ruimte: string; titel: string; link: string }> = [];
  registreerMelder(async (userId, _e, kind, titel, _m, link) => { meldingen.push({ userId, kind, ruimte: ruimteVoorNieuweMelding(userId, kind), titel, link: String(link || '') }); });

  type P = { tekst: string; risico: 'laag' | 'midden' | 'hoog' | 'kritiek'; geheim?: string };
  let laatsteBevestiger: { tabContext?: string; stapOpMethode?: string } | undefined;
  ab.registreerBevestigSoort<P>({
    soort: 'test.actie', dienst: 'bord', ruimtes: ['prive', 'technisch'], risico: (q) => q.risico,
    valideer: (ruw) => {
      const r = (ruw || {}) as Record<string, unknown>;
      if (typeof r.tekst !== 'string' || !r.tekst) return { ok: false, fout: 'TEST_ONGELDIG' };
      return { ok: true, params: { tekst: r.tekst, risico: (['laag', 'midden', 'hoog', 'kritiek'] as const).find((x) => x === r.risico) ?? 'midden', ...(r.geheim ? { geheim: String(r.geheim) } : {}) } };
    },
    beschrijf: (q) => ({ titel: { uk: 'Тестова дія', nl: 'Testactie' }, samenvatting: { uk: q.tekst, nl: q.tekst }, details: [{ label: { uk: 'Текст', nl: 'Tekst' }, waarde: q.tekst }] }),
    voerUit: async ({ params, bevestiger }) => { uitgevoerd++; laatsteBevestiger = bevestiger; return { ok: true, resultaat: { gedaan: uitgevoerd, tekst: params.tekst }, uitkomst: [{ label: { uk: 'Зроблено', nl: 'Gedaan' }, waarde: params.tekst }] }; },
  });
  ab.registreerBevestigSoort<{ ja?: boolean }>({
    soort: 'test.keuze', dienst: 'bord', ruimtes: ['prive'], risico: 'midden',
    valideer: () => ({ ok: true, params: {} }),
    beschrijf: () => ({ titel: { uk: 'Вибір', nl: 'Keuze' }, samenvatting: { uk: '—', nl: '—' }, details: [], keuzes: [{ id: 'ja', soort: 'vinkje', verplicht: true, label: { uk: 'Так', nl: 'Ja' } }] }),
    valideerKeuze: (k) => (k.ja === true ? null : 'BEVESTIGING_KEUZE_VEREIST'),
    voerUit: async ({ keuze }) => ({ ok: true, resultaat: { keuze } }),
  });
  const vraag = (userId: string, params: Record<string, unknown>, extra: Partial<Parameters<typeof ab.vraagBevestiging>[0]> = {}) =>
    ab.vraagBevestiging({ userId, ruimte: 'prive', soort: 'test.actie', params, tool: 'test_tool', agent: 'claude', klant: 'Claude', ...extra });
  const fout = async (p: Promise<unknown>) => { try { await p; return ''; } catch (e) { return (e as { code?: string }).code || (e as Error).message; } };

  try {
    for (const u of [A, B]) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u, { email: `${u}@test.invalid`, role: 'member', status: 'approved' }]);

    // ---- aanmaken: versleuteld, met hash, melding in de juiste ruimte, uitvoerder NIET aangeroepen
    const v1 = await vraag(A, { tekst: 'Eerste', risico: 'midden', geheim: GEHEIM });
    const rij1 = v1.ok ? (await sys.query('SELECT * FROM app.ai_bevestiging WHERE id = $1', [v1.id])).rows[0] : null;
    check('aanmaken: een verzoek met id, hash (64 hex) en een termijn van 30 minuten; de uitvoerder is NIET aangeroepen',
      v1.ok === true && /^[0-9a-f]{64}$/.test(v1.hash) && Math.abs(v1.verlooptOp - Date.now() - BEVESTIG_TERMIJN_MS) < 60_000 && uitgevoerd === 0 && rij1?.status === 'wacht', JSON.stringify(v1));
    check('opslag: de parameters staan versleuteld (envelop v1/dek1), nooit in platte tekst; agent, klant en hulpmiddel staan erbij',
      !!rij1 && /^(v1|dek1)\./.test(rij1.parameters) && !String(rij1.parameters).includes(GEHEIM) && !String(rij1.parameters).includes('Eerste')
      && rij1.agent === 'claude' && rij1.klant === 'Claude' && rij1.tool === 'test_tool' && rij1.ruimte === 'prive');
    const m1 = meldingen.find((m) => m.userId === A && m.kind === 'ai_bevestiging');
    check('melding: soort ai_bevestiging, in de PERSOONLIJKE ruimte, met de link naar de plek van de AI en het verzoek',
      !!m1 && m1.ruimte === 'prive' && v1.ok && m1.link.endsWith(`#agent/claude?bevestiging=${v1.id}`) && /Claude/.test(m1.titel), JSON.stringify(m1));
    const id1 = v1.ok ? v1.id : '';

    // ---- weigeringen: ander account, andere ruimte, gewijzigde parameters
    check('ander account: een verzoek van A bestaat voor B niet (404) — en er is niets uitgevoerd',
      (await fout(ab.bevestig({ userId: B, id: id1, ruimte: 'prive', hash: v1.ok ? v1.hash : '', stapOp: true }))) === 'BEVESTIGING_ONBEKEND' && uitgevoerd === 0);
    check('andere ruimte: hetzelfde account vanuit een technisch tabblad → BEVESTIGING_ANDERE_RUIMTE, niets uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id1, ruimte: 'technisch', hash: v1.ok ? v1.hash : '', stapOp: true }))) === 'BEVESTIGING_ANDERE_RUIMTE' && uitgevoerd === 0);
    check('andere hash (het scherm toonde iets anders) → BEVESTIGING_PARAMETERS_GEWIJZIGD, niets uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id1, ruimte: 'prive', hash: 'f'.repeat(64), stapOp: true }))) === 'BEVESTIGING_PARAMETERS_GEWIJZIGD' && uitgevoerd === 0);
    // De rij in de database wordt gemanipuleerd: een andere (geldige) envelop met andere parameters, de oude hash blijft staan.
    const vals = sealWithEnvKey(rij1?.sleutel_naam || 'TOTP_ENCRYPTION_KEY_V1', JSON.stringify({ tekst: 'Gewijzigd', risico: 'laag' }), `ai-bevestiging|${A}|prive|${id1}|parameters`);
    await sys.query('UPDATE app.ai_bevestiging SET parameters = $2 WHERE id = $1', [id1, vals]);
    check('gemanipuleerde parameters in de database (hash klopt niet meer met de inhoud) → weigering, niets uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id1, ruimte: 'prive', hash: v1.ok ? v1.hash : '', stapOp: true }))) === 'BEVESTIGING_PARAMETERS_GEWIJZIGD' && uitgevoerd === 0);
    await sys.query('UPDATE app.ai_bevestiging SET parameters = $2 WHERE id = $1', [id1, rij1?.parameters]);
    const poging = await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.ai.bevestiging.poging-geweigerd'`, [A]);
    check('elke geweigerde poging staat in het journaal (owner.ai.bevestiging.poging-geweigerd)', Number(poging.rows[0].n) >= 3, String(poging.rows[0].n));

    // ---- bevestigen: één keer uitvoeren
    const goed = await ab.bevestig({ userId: A, id: id1, ruimte: 'prive', hash: v1.ok ? v1.hash : '', stapOp: false });
    check('bevestigen (midden risico, zonder step-up): pas NU uitgevoerd, één keer, met de uitkomst voor de mens',
      goed.status === 'uitgevoerd' && uitgevoerd === 1 && goed.uitkomst[0]?.waarde === 'Eerste' && goed.beschrijving?.titel.nl === 'Testactie');
    check('nog eens bevestigen → BEVESTIGING_NIET_OPEN; er wordt NIET twee keer uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id1, ruimte: 'prive', hash: v1.ok ? v1.hash : '', stapOp: false }))) === 'BEVESTIGING_NIET_OPEN' && uitgevoerd === 1);
    const agentStand = await ab.bevestigingVoorAgent(A, id1, 'prive', { agent: 'claude' });
    check('de agent krijgt de uitkomst: status uitgevoerd en het resultaat (niet de beschrijving voor de mens)',
      'status' in agentStand && agentStand.status === 'uitgevoerd' && (agentStand.resultaat as { tekst?: string })?.tekst === 'Eerste' && !('beschrijving' in agentStand));
    check('alleen de eigen agent, de eigen ruimte en het eigen account zien die uitkomst',
      'fout' in (await ab.bevestigingVoorAgent(A, id1, 'prive', { agent: 'grok' })) && 'fout' in (await ab.bevestigingVoorAgent(A, id1, 'technisch', { agent: 'claude' }))
      && 'fout' in (await ab.bevestigingVoorAgent(B, id1, 'prive', { agent: 'claude' })));

    // ---- hoog risico: verse sterke step-up
    const v2 = await vraag(A, { tekst: 'Hoog', risico: 'hoog' });
    const id2 = v2.ok ? v2.id : '';
    check('hoog risico zonder verse sterke step-up → STEP_UP_STRONG_REQUIRED, niets uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id2, ruimte: 'prive', hash: v2.ok ? v2.hash : '', stapOp: false }))) === 'STEP_UP_STRONG_REQUIRED' && uitgevoerd === 1);
    const hoog = await ab.bevestig({ userId: A, id: id2, ruimte: 'prive', hash: v2.ok ? v2.hash : '', stapOp: true, bevestiger: { stapOpMethode: 'passkey' } });
    const rij2 = (await sys.query('SELECT stap_op FROM app.ai_bevestiging WHERE id = $1', [id2])).rows[0];
    check('hoog risico MET verse step-up → uitgevoerd, en de methode staat bij het verzoek', hoog.status === 'uitgevoerd' && uitgevoerd === 2 && rij2?.stap_op === 'passkey');

    // ---- verlopen
    const v3 = await vraag(A, { tekst: 'Verloopt', risico: 'laag' });
    const id3 = v3.ok ? v3.id : '';
    await sys.query(`UPDATE app.ai_bevestiging SET aangemaakt_op = now() - interval '40 minutes', verloopt_op = now() - interval '10 minutes' WHERE id = $1`, [id3]);
    check('verlopen verzoek (na 30 min) → BEVESTIGING_VERLOPEN en stand «verlopen»; niets uitgevoerd',
      (await fout(ab.bevestig({ userId: A, id: id3, ruimte: 'prive', hash: v3.ok ? v3.hash : '', stapOp: true }))) === 'BEVESTIGING_VERLOPEN' && uitgevoerd === 2
      && (await sys.query('SELECT status FROM app.ai_bevestiging WHERE id = $1', [id3])).rows[0]?.status === 'verlopen');
    const verlopenAgent = await ab.bevestigingVoorAgent(A, id3, 'prive');
    check('de agent hoort «verlopen» met de instructie niet zomaar opnieuw te vragen; het tool-resultaat is een fout',
      'status' in verlopenAgent && verlopenAgent.status === 'verlopen' && /expired/.test(verlopenAgent.next) && ab.agentTekst(verlopenAgent).isError === true);

    // ---- weigeren
    const v4 = await vraag(A, { tekst: 'Nee', risico: 'hoog' });
    const id4 = v4.ok ? v4.id : '';
    check('weigeren door een ander account of vanuit de andere ruimte kan niet',
      (await fout(ab.weiger({ userId: B, id: id4, ruimte: 'prive' }))) === 'BEVESTIGING_ONBEKEND' && (await fout(ab.weiger({ userId: A, id: id4, ruimte: 'technisch' }))) === 'BEVESTIGING_ANDERE_RUIMTE');
    const nee = await ab.weiger({ userId: A, id: id4, ruimte: 'prive' });
    const neeAgent = await ab.bevestigingVoorAgent(A, id4, 'prive');
    check('weigeren: stand «geweigerd», niets uitgevoerd, de agent hoort «geweigerd» (isError) en niet opnieuw proberen',
      nee.status === 'geweigerd' && uitgevoerd === 2 && 'status' in neeAgent && neeAgent.status === 'geweigerd' && ab.agentTekst(neeAgent).isError === true && /Do not retry/.test(neeAgent.next));

    // ---- wachten tot de mens beslist (zoals een hulpmiddel dat doet)
    const wachten = metNamens({ client: 'Claude', agent: 'claude', grantId: 'g-test' }, () => ab.vraagEnWacht({ userId: A, ruimte: 'prive', soort: 'test.actie', params: { tekst: 'Wacht', risico: 'midden' }, tool: 'test_tool', wachtMs: 15_000 }));
    let gevonden = '';
    for (let i = 0; i < 40 && !gevonden; i++) {
      await new Promise((r) => setTimeout(r, 150));
      gevonden = (await ab.lijstVoorMens(A, 'prive', { agent: 'claude' })).find((x) => x.status === 'wacht' && x.beschrijving?.samenvatting.nl === 'Wacht')?.id || '';
    }
    const kop = gevonden ? (await ab.lijstVoorMens(A, 'prive')).find((x) => x.id === gevonden) : null;
    if (kop) await ab.bevestig({ userId: A, id: kop.id, ruimte: 'prive', hash: kop.hash, stapOp: false });
    const na = await wachten;
    check('vraagEnWacht: de aanroep van de AI wacht, de mens bevestigt op de site, en de AI krijgt het resultaat in dezelfde aanroep',
      !!kop && 'status' in na && na.status === 'uitgevoerd' && (na.resultaat as { tekst?: string })?.tekst === 'Wacht' && uitgevoerd === 3, JSON.stringify(na));
    const kopRij = (await sys.query('SELECT agent, klant, grant_id FROM app.ai_bevestiging WHERE id = $1', [gevonden])).rows[0];
    check('agent, klant en grant komen uit de lopende MCP-aanroep (niet uit de parameters van de AI)', kopRij?.agent === 'claude' && kopRij?.klant === 'Claude' && kopRij?.grant_id === 'g-test');

    // ---- eigen keuze van de mens
    const v5 = await ab.vraagBevestiging({ userId: A, ruimte: 'prive', soort: 'test.keuze', params: {} });
    const id5 = v5.ok ? v5.id : '';
    check('eigen keuze van de mens ontbreekt → BEVESTIGING_KEUZE_VEREIST; daarna mét keuze → uitgevoerd (de keuze reist apart mee)',
      (await fout(ab.bevestig({ userId: A, id: id5, ruimte: 'prive', hash: v5.ok ? v5.hash : '', stapOp: false }))) === 'BEVESTIGING_KEUZE_VEREIST'
      && (await ab.bevestig({ userId: A, id: id5, ruimte: 'prive', hash: v5.ok ? v5.hash : '', stapOp: false, keuze: { ja: true } })).status === 'uitgevoerd');

    // ---- de technische ruimte zonder technische rechten, soort onbekend, ongeldige parameters
    check('technisch verzoek terwijl de technische ruimte niet actief is → geweigerd (nooit stil in de persoonlijke lade)',
      (await vraag(A, { tekst: 'Tech', risico: 'laag' }, { ruimte: 'technisch' })).ok === false);
    check('onbekende soort en ongeldige parameters → geen verzoek',
      (await ab.vraagBevestiging({ userId: A, ruimte: 'prive', soort: 'bestaat.niet', params: {} })).ok === false && (await vraag(A, { risico: 'laag' })).ok === false);

    // ---- ruimtes gescheiden in de lijst (een technische rij ziet de persoonlijke lijst nooit)
    const techId = randomUUID();
    await sys.query(`INSERT INTO app.ai_bevestiging (id, user_id, ruimte, soort, risico, parameters, hash, verloopt_op) VALUES ($1,$2,'technisch','test.actie','laag','v1.x.y.z',$3, now() + interval '20 minutes')`, [techId, A, 'a'.repeat(64)]);
    check('de lijst van de persoonlijke ruimte toont geen technisch verzoek, die van de technische ruimte wel',
      !(await ab.lijstVoorMens(A, 'prive')).some((x) => x.id === techId) && (await ab.lijstVoorMens(A, 'technisch')).some((x) => x.id === techId));
    await sys.query('DELETE FROM app.ai_bevestiging WHERE id = $1', [techId]);

    // ---- hoogstens 20 open
    let laatste: Awaited<ReturnType<typeof vraag>> | null = null;
    for (let i = 0; i < BEVESTIG_MAX_OPEN + 1; i++) laatste = await vraag(B, { tekst: `n${i}`, risico: 'laag' });
    check(`hoogstens ${BEVESTIG_MAX_OPEN} open verzoeken per mens; het volgende → BEVESTIGING_TE_VEEL_OPEN`, !!laatste && laatste.ok === false && laatste.fout === 'BEVESTIGING_TE_VEEL_OPEN');
    check('alles intrekken (bv. bij «Стоп»): de open verzoeken van B → ingetrokken', (await ab.trekAllesIn(B)) === BEVESTIG_MAX_OPEN && (await ab.aantalOpen(B, 'prive')) === 0);

    // ================================================================ 3. de routes (alleen de mens, in de ruimte van het tabblad)
    const sessie = { id: `sess-${randomUUID()}`, createdAt: Date.now() };
    const auth = { user: { id: A, email: `${A}@test.invalid`, role: 'member', status: 'approved' }, service: 'mcp', session: sessie, tabSession: null };
    let stapOpGevraagd = 0;
    const routes = aiBevestigingRoutes({
      requireSession: async (event) => ((event as { wie?: string }).wie === 'B' ? { ...auth, user: { ...auth.user, id: B } } : auth) as never,
      sterkeStapOp: async (_c, a) => { stapOpGevraagd++; return (await sterkeStapOpGeldig(a as never)) ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_STRONG_REQUIRED' }) } as never; },
    });
    const roep = async (route: string, body: Record<string, unknown>, wie = 'A') => {
      const r = await routes[route][0]({ event: { headers: {}, wie }, body: { service: 'mcp', ...body }, params: {} } as never) as { statusCode: number; body: string };
      let data: any = {}; try { data = JSON.parse(r.body); } catch { /* leeg */ }
      return { status: r.statusCode, data };
    };
    check('geen enkele route van de bevestiging is bereikbaar voor een agent via de site (TOEGESTANE_ROUTES)',
      !['lijst', 'bevestigen', 'weigeren'].some((x) => TOEGESTANE_ROUTES.has(`POST /api/owner/ai-bevestiging/${x}`)));
    const v6 = await vraag(A, { tekst: 'Route', risico: 'hoog' });
    const lijst = await roep('POST /api/owner/ai-bevestiging/lijst', {});
    const item6 = (lijst.data.items || []).find((x: { id: string }) => v6.ok && x.id === v6.id);
    check('route lijst: de verzoeken van de ruimte van het tabblad (zonder technisch tabblad: persoonlijk), met hash en beschrijving',
      lijst.status === 200 && lijst.data.ruimte === 'prive' && !!item6 && item6.stapOp === true && /^[0-9a-f]{64}$/.test(item6.hash) && item6.beschrijving?.titel?.uk === 'Тестова дія' && lijst.data.open >= 1);
    const voor = uitgevoerd;
    const zonder = await roep('POST /api/owner/ai-bevestiging/bevestigen', { id: item6?.id, hash: item6?.hash });
    check('route bevestigen, hoog risico, zonder verse passkey → 403 STEP_UP_STRONG_REQUIRED; niets uitgevoerd',
      zonder.status === 403 && zonder.data.error === 'STEP_UP_STRONG_REQUIRED' && stapOpGevraagd === 1 && uitgevoerd === voor, JSON.stringify(zonder));
    check('route bevestigen door een ander account → 404 BEVESTIGING_ONBEKEND', (await roep('POST /api/owner/ai-bevestiging/bevestigen', { id: item6?.id, hash: item6?.hash }, 'B')).status === 404 && uitgevoerd === voor);
    await passkeyStapOpVastleggen(auth as never);
    laatsteBevestiger = undefined;
    const tabA = randomBytes(24).toString('hex');
    const met = await roep('POST /api/owner/ai-bevestiging/bevestigen', { id: item6?.id, hash: item6?.hash, tabContext: tabA });
    check('route bevestigen met een verse passkey → uitgevoerd, en de step-up is daarna VERBRUIKT (volgende keer opnieuw)',
      met.status === 200 && met.data.item?.status === 'uitgevoerd' && uitgevoerd === voor + 1 && !(await sterkeStapOpGeldig(auth as never)), JSON.stringify(met.data));
    // De uitvoerder hoort WIE bevestigde en HOE (P3: gebruikersbeheer en vlaggen eisen een passkey en het tabblad van de bevestiger).
    check('route bevestigen: voerUit krijgt bevestiger { tabContext van het tabblad, stapOpMethode «passkey» } — gemeten vóór het verbruiken',
      laatsteBevestiger?.tabContext === tabA && laatsteBevestiger?.stapOpMethode === 'passkey', JSON.stringify(laatsteBevestiger));
    const v7 = await vraag(A, { tekst: 'Weg', risico: 'midden' });
    const weg = await roep('POST /api/owner/ai-bevestiging/weigeren', { id: v7.ok ? v7.id : '' });
    check('route weigeren → geweigerd', weg.status === 200 && weg.data.item?.status === 'geweigerd');
    const gewijzigd = await roep('POST /api/owner/ai-bevestiging/bevestigen', { id: v7.ok ? v7.id : '', hash: v7.ok ? v7.hash : '' });
    check('route: een fout draagt de code én de uitleg in beide talen', gewijzigd.status === 409 && gewijzigd.data.error === 'BEVESTIGING_NIET_OPEN' && gewijzigd.data.uitleg?.uk && gewijzigd.data.uitleg?.nl);

    // ================================================================ 4. journaal
    const journaal = await sys.query(`SELECT action, details::text AS d FROM app.audit WHERE owner_id = $1 AND action LIKE 'owner.ai.bevestiging.%'`, [A]);
    const acties = new Set(journaal.rows.map((r) => String(r.action)));
    check('journaal: gevraagd, bevestigd, uitgevoerd, geweigerd, verlopen en poging-geweigerd staan erin',
      ['gevraagd', 'bevestigd', 'uitgevoerd', 'geweigerd', 'verlopen', 'poging-geweigerd'].every((a) => acties.has(`owner.ai.bevestiging.${a}`)), [...acties].join(','));
    check('journaal: nooit de inhoud van de parameters (geen geheim, geen tekst), wel soort, ruimte, risico en agent',
      journaal.rows.every((r) => !String(r.d).includes(GEHEIM) && !String(r.d).includes('Eerste')) && journaal.rows.some((r) => /"soort": ?"test\.actie"/.test(String(r.d)) && /"agent": ?"claude"/.test(String(r.d)) && /"risico": ?"/.test(String(r.d))));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.ai_bevestiging WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = ANY($1)", [[A, B]]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
