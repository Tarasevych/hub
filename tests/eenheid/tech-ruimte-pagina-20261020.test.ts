// DRIE KLACHTEN VAN DE EIGENAAR (20.10.2026) — deze test gaat over de EERSTE en de DERDE.
//
//   1. «У технічному профілі поштові акаунти не підключені, але при цьому я бачу пошту в обох акаунтах,
//       хоч не входив у технічному акаунті.»
//   3. «https://cloud.tarasevych.com/ при технічному немає робочої — навіть меню пропало.»
//
// WAT HIER BEWEZEN WORDT, EN NIET AANGENOMEN
//
// KLACHT 1. De poorten van post (backend/mail-ruimte.ts) en van hmara/agenda (backend/ruimte-cloud-agenda.ts) dekken alles
//   onder /api/owner/mail/, /api/owner/contacten/, /api/owner/cloud/ en /api/owner/agenda/. Maar TWEE routes lezen diezelfde
//   gegevens onder een ANDER pad en stonden dus buiten elke poort:
//     • POST /api/owner/hub/blocks/data  — de blokken van de HUB (onderwerp + afzender van post, bestanden, afspraken). Dit
//       is de landingspagina, dus precies het scherm waarop de eigenaar post zag in een profiel waar post niet verbonden is;
//     • POST /api/owner/global-search    — «Пошук усюди» (onderwerp, afzender ÉN brieftekst), en tegelijk het AI-hulpmiddel
//       `site_search` (backend/site-hulpmiddelen.ts), dus hetzelfde gat voor elke connector.
//   Beide filterden op alleen `ownerUserId`: één mens = één lade, in BEIDE richtingen fout. De klacht was dus NIET gesloten
//   door de reeds liggende scheiding. Hieronder loopt het echte verzoek langs de echte routes, met een echt technisch
//   profiel in de database, langs vier wegen: de pagina (tabblad), de API, een AI-verbinding (zonder tabblad) en de
//   achtergrond (zonder lade). Daarna nog eens met post op 'eigen', zodat bewezen is dat de scheiding niet ALLES dichtzet.
//
// KLACHT 3. De weigering van de poort is geen storing maar een stand. De hmara gaf bij een weigering status 200 met de
//   uitleg erin en een leeg lichaam — maar in dat lichaam stonden `providers: null` en `onboarding: null`, terwijl
//   src/CloudFunctioneelWeergave.tsx `data.onboarding.services` en `data.providers.find(...)` leest. Dat is een TypeError
//   TIJDENS HET RENDEREN, dus React gooit de hele boom weg: inclusief CanonicalChrome, en daarmee de zijbalk, de shapka en
//   de tabbladen. «Навіть меню пропало» was dus geen leeg scherm maar een gesloopte pagina. Hieronder:
//     a. VORMGELIJKHEID: elk veld dat een pagina zonder `?.` uit het lichaam leest, moet in het ZACHTE lichaam bestaan en
//        niet null zijn. Deze controle leest de paginabron zelf, dus zij blijft werken als er morgen een veld bijkomt;
//     b. de pagina BLIJFT EEN PAGINA: het menu, de shapka en de tabbladen staan in CanonicalChrome, buiten de dienstweergave,
//        en geen enkele dienst zet ze uit op grond van een ruimtecode;
//     c. ELK van de drie codes (KEUZE_ONTBREEKT, DIENST_UIT, BEVROREN) geeft een uitleg in BEIDE talen ÉN een actie, en dat
//        geldt apart voor hmara, post, agenda, dosjka en GitHub.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPool } from '../../server/platform/pg';
import * as rs from '../../backend/ruimte-scheiding';
import * as proj from '../../backend/ruimte-projecties';
import { postRecordVelden } from '../../backend/mail-ruimte';
import { ZACHTE_ROUTES } from '../../backend/ruimte-cloud-agenda';
import { createHubBlockDataRoutes } from '../../backend/hub-blok-gegevens';
import { createGlobalSearchRoutes } from '../../backend/globaal-zoek';
import { metNamens } from '../../backend/mcp-namens';
import { tabHash } from '../../backend/tech-profiel';
import { DEELBARE_DIENSTEN, DIENST_NAAM, WEIGERING_UITLEG, type DeelbareDienst, type LadeWeigering } from '../../shared/ruimte-scheiding';
import { ruimteGeslotenUit } from '../../shared/ruimte-weergave';
import { checker } from './hulp/nep-google';
import { nepBrowser } from './hulp/nep-browser';

const W = process.cwd();
const bron = (p: string) => readFileSync(join(W, p), 'utf8');
const tab = () => randomBytes(24).toString('hex');
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type Antwoord = { statusCode: number; body: string };
const lees = (r: unknown) => JSON.parse(String((r as Antwoord).body || 'null'));

/** De drie weigeringen die een mens werkelijk kan tegenkomen (GEEN_GEBRUIKER en DIENST_ONBEKEND zijn programmeerfouten). */
const CODES: LadeWeigering[] = ['KEUZE_ONTBREEKT', 'DIENST_UIT', 'BEVROREN'];

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-ruimte-pagina-20261020');
  nepBrowser();

  // ================================================================ KLACHT 3b — de pagina blijft een pagina
  {
    const usa = bron('src/VerenigdDienstApp.tsx'), app = bron('src/App.tsx');
    // Het menu wordt bepaald door de STAND VAN HET ACCOUNT (new/pending/blocked) en door het oppervlak, nooit door een
    // ruimtecode. Zou een dienst het menu ooit aan zijn eigen lade ophangen, dan valt deze check om.
    const menuRegel = /items=\{![[]'new','pending','blocked','recoverable'[\]]\.includes\(state\)\?menuVoorOppervlak\(/;
    check('het menu van een dienstpagina hangt aan de accountstand en het oppervlak — niet aan de gegevensruimte',
      menuRegel.test(usa) && !/items=\{[^}]*(?:BEVROREN|DIENST_UIT|KEUZE_ONTBREEKT|ruimte\.ok)/.test(usa));
    check('de hub hangt haar menu aan dezelfde regel en kent geen ruimtecode in de menu-uitdrukking',
      app.includes('items={alleenModaal?[]:menuVoorOppervlak(') && !/items=\{[^}]*(?:BEVROREN|DIENST_UIT|KEUZE_ONTBREEKT)/.test(app));
    // De dienstweergave staat BINNEN CanonicalChrome. Daarom kan geen enkele dienst het menu kwijtraken door iets te
    // weigeren — alleen door te crashen, en dat is precies wat klacht 3 was.
    const i1 = usa.indexOf('<CanonicalChrome'), i2 = usa.indexOf('</CanonicalChrome>');
    check('elke dienstweergave wordt als KIND van CanonicalChrome gerenderd (menu, shapka en tabbladen staan erbuiten)',
      i1 > 0 && i2 > i1 && usa.slice(i1, i2).includes('content()'), `${i1}/${i2}`);
    for (const [naam, pad] of [
      ['хмара', 'src/CloudFunctioneelWeergave.tsx'], ['пошта', 'src/MailFunctioneelWeergave.tsx'], ['календар', 'src/agenda/Agenda.tsx'],
      ['дошка', 'src/McpDienstWeergave.tsx'], ['GitHub', 'src/GitHubWeergave.tsx'],
    ] as const) {
      const s = bron(pad);
      check(`${naam}: de weergave rendert nooit zelf de shapka of het menu, dus zij kan die ook niet weghalen`,
        !s.includes('<CanonicalChrome') && !s.includes('menuVoorOppervlak('));
    }
  }

  // ================================================================ KLACHT 3a — vormgelijkheid van de ZACHTE lichamen
  {
    // De zachte routes zijn er juist zodat de pagina kan UITLEGGEN waarom zij leeg is (403 zou alleen «er ging iets mis»
    // zijn). Dan moet hun lichaam wel dezelfde VORM hebben als een geslaagd antwoord: elk veld dat de pagina zonder `?.`
    // leest, bestaat en is niet null. Zo niet, dan is het geen leeg scherm maar een renderfout — klacht 3.
    const zacht = ZACHTE_ROUTES as Record<string, Record<string, unknown>>;
    check('de twee overzichtsroutes van hmara en agenda antwoorden zacht (200 met uitleg), niet met 403',
      Object.keys(zacht).sort().join(' | ') === 'POST /api/owner/agenda/overzicht | POST /api/owner/cloud/bootstrap',
      Object.keys(zacht).join(' | '));

    /** Alle `data.X.` en `data?.X.` die een paginabron zonder `?.` NA de X leest: X moet in het lichaam staan en niet null zijn. */
    const hardGelezen = (src: string): string[] => {
      const uit = new Set<string>();
      // Alleen de STAAT van de pagina (`data.x.` / `data?.x.`), niet `response.data.x.` — dat is het antwoord van een andere
      // route en zegt niets over dit lichaam.
      for (const m of src.matchAll(/(^|[^.\w])data\??\.([A-Za-z_][A-Za-z0-9_]*)\./g)) uit.add(m[2]);
      for (const m of src.matchAll(/(^|[^.\w])data\??\.([A-Za-z_][A-Za-z0-9_]*)\?\./g)) uit.delete(m[2]);
      return [...uit];
    };
    for (const [route, pad, mag, minimaal] of [
      ['POST /api/owner/cloud/bootstrap', 'src/CloudFunctioneelWeergave.tsx', ['ruimte'], 3],
      ['POST /api/owner/agenda/overzicht', 'src/agenda/Agenda.tsx', ['ruimte'], 1],
    ] as const) {
      const body = zacht[route];
      const nodig = hardGelezen(bron(pad)).filter((k) => !(mag as readonly string[]).includes(k));
      const ontbreekt = nodig.filter((k) => body[k] === undefined || body[k] === null);
      check(`${route}: elk veld dat de pagina hard uitleest staat in het zachte lichaam en is niet null (${nodig.length} velden)`,
        nodig.length >= minimaal && ontbreekt.length === 0, `${nodig.join(', ')} → ontbreekt: ${ontbreekt.join(', ') || 'geen'}`);
    }
    // De twee velden waarop klacht 3 werkelijk stukliep, met naam genoemd: een array blijft een array.
    const cb = zacht['POST /api/owner/cloud/bootstrap'];
    check('hmara: «providers» is een lijst en «onboarding.services» is een lijst — nooit meer null (klacht 3)',
      Array.isArray(cb.providers) && Array.isArray((cb.onboarding as { services?: unknown } | null)?.services));

    // Tweede slot: de pagina normaliseert ELK antwoord, dus ook een oude server of een afgekapt lichaam sloopt haar niet.
    const { normaliseerBootstrap } = await import('../../src/CloudFunctioneelWeergave');
    const kapot = normaliseerBootstrap({ providers: null, onboarding: null, workspaces: null, summary: null, items: 'x' });
    const zachtGenormaliseerd = normaliseerBootstrap({ ...cb, ruimte: { ok: false, dienst: 'cloud', code: 'DIENST_UIT', uitleg: WEIGERING_UITLEG.DIENST_UIT } });
    check('de pagina normaliseert een lichaam met null-velden naar lege lijsten (geen TypeError bij het renderen)',
      Array.isArray(kapot.providers) && Array.isArray(kapot.onboarding.services) && Array.isArray(kapot.workspaces)
      && Array.isArray(kapot.items) && kapot.summary.inbox === 0);
    check('het ZACHTE lichaam van de server komt door diezelfde normalisatie heen, met de uitleg bewaard',
      Array.isArray(zachtGenormaliseerd.providers) && zachtGenormaliseerd.ruimte?.ok === false);
    const cfv = bron('src/CloudFunctioneelWeergave.tsx');
    check('hmara: de twee regels die de pagina sloopten staan nu met «?.» en het antwoord gaat door normaliseerBootstrap',
      cfv.includes('data.onboarding?.services?.find') && cfv.includes('data.providers?.find')
      && cfv.includes('const veilig = normaliseerBootstrap(response.data);'));
    check('hmara: bij een gesloten lade blijft de hero staan — geen vroege «return», dus de werkruimte verdwijnt niet',
      cfv.includes("data-cloud-ruimte='gesloten'") && cfv.includes('<RuimteGeslotenVlak gesloten={gesloten}')
      && !/if \(gesloten\) return/.test(cfv));
  }

  // ================================================================ KLACHT 3c — elke code: uitleg in twee talen én een actie
  {
    const { RuimteGeslotenVlak, ruimteActieTekst, ruimteVerbindAdres } = await import('../../src/RuimteStrook');
    for (const dienst of ['cloud', 'mail', 'agenda', 'bord', 'github'] as DeelbareDienst[]) {
      for (const code of CODES) {
        const gesloten = ruimteGeslotenUit({ error: code, dienst, dienstNaam: DIENST_NAAM[dienst], uitleg: WEIGERING_UITLEG[code] });
        const uk = renderToStaticMarkup(createElement(RuimteGeslotenVlak, { gesloten: gesloten!, lang: 'uk' }));
        const nl = renderToStaticMarkup(createElement(RuimteGeslotenVlak, { gesloten: gesloten!, lang: 'nl' }));
        const heeftActie = uk.includes(`data-ruimte-actie="${code}"`) && uk.includes(ruimteActieTekst(code, 'uk'))
          && nl.includes(ruimteActieTekst(code, 'nl')) && uk.includes('<a ');
        check(`${dienst} · ${code}: naam van de dienst, uitleg in de taal van het scherm, en een knop met de volgende stap`,
          !!gesloten && uk.includes(DIENST_NAAM[dienst].uk) && nl.includes(DIENST_NAAM[dienst].nl)
          && uk.includes(WEIGERING_UITLEG[code].uk.slice(0, 24)) && nl.includes(WEIGERING_UITLEG[code].nl.slice(0, 24))
          && heeftActie,
          `${uk.length}/${nl.length}`);
      }
    }
    check('de drie acties zijn verschillend van elkaar (kiezen, verbinden, besluit van de eigenaar) en nooit «probeer opnieuw»',
      new Set(CODES.map((c) => ruimteActieTekst(c, 'uk'))).size === 3
      && !CODES.some((c) => /ще раз|opnieuw/i.test(ruimteActieTekst(c, 'uk') + ruimteActieTekst(c, 'nl'))));
    check('de knop leidt altijd naar één plek: «Підключення ШІ» → tab «Технічне», waar de keuze en de diensten staan',
      ruimteVerbindAdres('uk').includes('verbindingen') && bron('src/agenten/TabTechnisch.tsx').includes('<RuimteScheiding'));
    // De pagina's van post hoeven geen eigen uitleg te bouwen: élke 403 met een ruimtecode wordt in de enige doorgang van de
    // client één keer omgezet in een gewone melding met dezelfde knop. Zo verliest ook de postpagina haar menu niet en
    // krijgt zij geen «щось пішло не так» waar een stand bedoeld was.
    const client = bron('src/platform/client.ts');
    check('vangnet: elke 403 met een ruimtecode wordt in de api-client een melding met uitleg én een knop',
      client.includes('if (response.status === 403) void ruimteWeigeringMelden(parsed);')
      && client.includes('ruimteGeslotenUit') && client.includes('link: { href: ruimteVerbindAdres(lang), label: ruimteActieTekst(dicht.code, lang) }'));
    for (const [naam, pad] of [['дошка й нотатки', 'src/McpDienstWeergave.tsx'], ['GitHub', 'src/GitHubWeergave.tsx'], ['бюро', 'src/bureau/Bureau.tsx'], ['нотатки', 'src/HubNotities.tsx']] as const) {
      check(`${naam}: gebruikt hetzelfde vlak met uitleg (één waarheid, dus ook meteen dezelfde knop)`,
        bron(pad).includes('RuimteGeslotenVlak'));
    }
    check('de hub-blokken en «Пошук усюди» tonen datzelfde vlak in plaats van een lege lijst',
      // 22.10 (Z4): «Пошук усюди» is een schil over het palet ⌘K en de pagina /zoek; het vlak staat nu op de zoekpagina zelf.
      bron('src/HubBlokWidget.tsx').includes('RuimteGeslotenVlak') && bron('src/zoek/ZoekPagina.tsx').includes('RuimteGeslotenVlak'));
  }

  // ================================================================ KLACHT 1 — puur: geen projectieroute buiten de poort
  {
    // Elke backendmodule die een PROJECTIE van post, hmara, Drive of agenda leest, moet door een poort gaan. Drie wegen
    // zijn toegestaan, en elke vierde is een gat: de lijst hieronder noemt per bestand WELKE weg, met de reden.
    const PROJECTIES = ['mail_items_v1', 'mail_accounts_v1', 'cloud_items_v1', 'google_suite_drive_projection_v1', 'google_suite_calendar_events_v1'];
    const WEG: Record<string, string> = {
      'backend/index.ts': 'routes onder /api/owner/mail/ — gepoort door metMailRuimte, rijen door postRecordsVanLade',
      'backend/mail-ruimte.ts': 'de poort van post zelf (en de uitvoerders bij overdragen/wissen)',
      'backend/mail-zoek.ts': 'routes onder /api/owner/mail/search/ — gepoort door metMailRuimte',
      'backend/mail-zoek-duurzaam.ts': 'hulplaag van de zoekroutes, loopt in de lade van die aanroep',
      'backend/mail-pmid-opstart.ts': 'hulplaag van /api/owner/mail/bootstrap, loopt in de lade van die aanroep',
      'backend/google-suite-mail-browser.ts': 'routes onder /api/owner/mail/google-suite/ — gepoort door metMailRuimte',
      'backend/ai-vertaling-routes.ts': 'routes onder /api/owner/mail/ai-vertaling/ — gepoort door metMailRuimte',
      'backend/diagnostiek-account.ts': 'diagnose: telt rijen van de EIGEN mens, geeft geen inhoud terug',
      'backend/globaal-zoek.ts': 'eigen poort: projectieLaden + rijenInLade (dit gat is 20.10.2026 gedicht)',
      'backend/hub-blok-gegevens.ts': 'eigen poort: projectieLaden + rijenInLade (dit gat is 20.10.2026 gedicht)',
      'backend/ruimte-projecties.ts': 'de poort voor projectieroutes zelf',
      'backend/cloud-platform.ts': 'routes onder /api/owner/cloud/ — gepoort door ladePoort (backend/ruimte-cloud-agenda.ts)',
      'backend/ruimte-cloud-agenda.ts': 'de poort van hmara en agenda zelf (en de uitvoerders bij overdragen/wissen)',
      'backend/google-suite-sync.ts': 'cron zonder sessie: adresseert rijen op (ownerUserId, principalId, bestand) en zet geen «ruimte», dus schrijft en leest alleen de persoonlijke lade',
      'backend/agenda-spiegel.ts': 'spiegel van de agenda: elke rij draagt haar eigen lade (ladeOf + ladeVelden) en wordt gelezen met hoortBij/sqlLadeWaar',
    };
    const { execSync } = await import('node:child_process');
    const gevonden = execSync(`grep -rl "${PROJECTIES.join('\\|')}" backend/*.ts || true`, { cwd: W, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean).sort();
    const onbekend = gevonden.filter((f) => !WEG[f]);
    check(`elke module die een projectie van post/hmara/Drive/agenda leest, heeft een benoemde weg door een poort (${gevonden.length} modules)`,
      gevonden.length >= 9 && onbekend.length === 0, onbekend.join(' | ') || 'geen');
    check('de twee routes die het gat waren, gaan nu echt door projectieLaden én filteren hun rijen op de lade',
      ['backend/hub-blok-gegevens.ts', 'backend/globaal-zoek.ts'].every((f) => {
        const s = bron(f);
        // 22.10 (zoekkern): globaal-zoek.ts berekent de herkomst eerst (`const herkomst = herkomstUitBody(…)`) en geeft die door.
        return (s.includes('projectieLaden(herkomstUitBody(') || (s.includes('herkomstUitBody(userId, rol, body)') && s.includes('projectieLaden(herkomst,'))) && s.includes('rijenInLade(');
      }));
    check('de rijen van de ANDERE lade vallen weg, ook een rij zonder veld «ruimte» (die is persoonlijk)',
      proj.rijenInLade([{ ownerUserId: 'u' }, { ownerUserId: 'u', ruimte: 'technisch' }], { ok: true, lade: { userId: 'u', ruimte: 'prive' }, dienst: 'mail', stand: 'eigen', gedeeld: false }).length === 1
      && proj.rijenInLade([{ ownerUserId: 'u' }, { ownerUserId: 'u', ruimte: 'technisch' }], { ok: true, lade: { userId: 'u', ruimte: 'technisch' }, dienst: 'mail', stand: 'eigen', gedeeld: false }).length === 1
      && proj.rijenInLade([{ ownerUserId: 'u' }], { ok: false, code: 'DIENST_UIT', uitleg: WEIGERING_UITLEG.DIENST_UIT }).length === 0);
    check('het AI-hulpmiddel «site_search» gebruikt precies die ene gepoorte route, en geen eigen weg naar de projecties',
      bron('backend/site-hulpmiddelen.ts').includes("route: 'POST /api/owner/global-search'"));
  }

  // ================================================================ KLACHT 1 — met de echte database en de echte routes
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return id;
  };
  const mens = await mk(`ruimte-pagina-${sfx}@eenheid.test`);
  const tOnt = tab();
  const ONDERWERP_PRIVE = `prive-geheim-${sfx}`;
  const ONDERWERP_TECH = `technisch-geheim-${sfx}`;

  try {
    for (const naam of ['0082_ruimte_scheiding.sql', '0083_mail_contacten_ruimte.sql', '0084_ruimte_cloud_agenda.sql']) {
      const mig = readFileSync(join(W, 'migrations', naam), 'utf8');
      await getPool('migratie').query(mig);
    }

    // Een mens met technische toegang en een lopende activering in DIT tabblad.
    const profiel = `tech-${randomBytes(6).toString('hex')}`;
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
      VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen=EXCLUDED.rollen, ingetrokken_op=NULL`, [mens, profiel]);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
      VALUES ($1,$2,$3,ARRAY['ontwikkelaar'],'eenheidstest ruimte-pagina', now() + interval '60 minutes')`, [mens, profiel, tabHash(tOnt)]);

    // Post, een bestand en een afspraak in de PERSOONLIJKE lade (rij zonder veld «ruimte» = persoonlijk), en dezelfde
    // soort rijen in de TECHNISCHE lade. De klacht gaat over het eerste blok: dat mag in het technische profiel niet te zien zijn.
    const rec = async (tbl: string, data: Record<string, unknown>) => {
      const id = randomUUID();
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', [tbl, id, data]);
      return id;
    };
    const nu = Date.now();
    await rec('mail_items_v1', { ownerUserId: mens, subject: ONDERWERP_PRIVE, senderName: 'Persoonlijk', senderEmail: `p-${sfx}@oud.test`, body: `tekst ${ONDERWERP_PRIVE}`, unread: true, receivedAt: nu });
    await rec('mail_items_v1', { ownerUserId: mens, ruimte: 'technisch', subject: ONDERWERP_TECH, senderName: 'Technisch', senderEmail: `t-${sfx}@tech.test`, body: `tekst ${ONDERWERP_TECH}`, unread: false, receivedAt: nu });
    await rec('cloud_items_v1', { ownerUserId: mens, title: ONDERWERP_PRIVE, kind: 'note', updatedAt: nu });
    await rec('google_suite_calendar_events_v1', { ownerUserId: mens, summary: ONDERWERP_PRIVE, start: nu + 3_600_000, end: nu + 7_200_000, status: 'confirmed' });

    const autoriseer = async () => ({ service: 'hub', user: { id: mens, status: 'approved', email: `ruimte-pagina-${sfx}@eenheid.test` } });
    const blokken = createHubBlockDataRoutes(autoriseer as never)['POST /api/owner/hub/blocks/data'][0] as unknown as (c: Ctx) => Promise<Antwoord>;
    const zoeken = createGlobalSearchRoutes(autoriseer as never)['POST /api/owner/global-search'][0] as unknown as (c: Ctx) => Promise<Antwoord>;
    const blokkenVan = async (body: unknown) => lees(await blokken({ event: {}, body, params: {} }));
    const zoekenVan = async (body: unknown) => lees(await zoeken({ event: {}, body, params: {} }));

    // ---------------------------------------------------------------- vóór de keuze: de technische ruimte bestaat nog niet
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [mens]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [mens]);
    const b0 = await blokkenVan({ tabContext: tOnt });
    const z0 = await zoekenVan({ tabContext: tOnt, query: ONDERWERP_PRIVE });
    check('WEG 1 (сторінка пошти/хаба), vóór de eenmalige keuze: de hub-blokken tonen GEEN persoonlijke post, met uitleg',
      JSON.stringify(b0).indexOf(ONDERWERP_PRIVE) < 0 && b0.sources.mail.status === 'gesloten'
      && b0.sources.mail.items.length === 0 && b0.sources.mail.total === 0
      && b0.sources.mail.gesloten.code === 'KEUZE_ONTBREEKT' && !!b0.sources.mail.gesloten.uitleg.uk && !!b0.sources.mail.gesloten.uitleg.nl,
      String(b0.sources.mail.status));
    check('WEG 2 (API «Пошук усюди»), vóór de keuze: nul treffers op de persoonlijke brief, en de reden erbij',
      JSON.stringify(z0.groups).indexOf(ONDERWERP_PRIVE) < 0 && z0.total === 0
      && (z0.gesloten as Array<{ dienst: string; code: string }>).some((g) => g.dienst === 'mail' && g.code === 'KEUZE_ONTBREEKT'));
    check('ook bestanden en afspraken blijven dicht: het gat zat niet alleen bij post',
      b0.sources.files.status === 'gesloten' && b0.sources.calendar.status === 'gesloten'
      && b0.sources.files.items.length === 0 && b0.sources.calendar.items.length === 0);
    check('en de koppelingsstanden («не підключено») verraden niets: zonder open lade is er niets te melden',
      b0.gekoppeld.mail === null && b0.gekoppeld.drive === null && b0.gekoppeld.calendar === null);

    // ---------------------------------------------------------------- na de keuze, post nog op 'uit': nog steeds niets
    await rs.keuzeZetten(mens, 'per_dienst', mens);
    const b1 = await blokkenVan({ tabContext: tOnt });
    const z1 = await zoekenVan({ tabContext: tOnt, query: ONDERWERP_PRIVE });
    check('na de keuze, met post nog op «вимкнено»: nog steeds geen persoonlijke post, nu met de uitleg «dienst uit»',
      JSON.stringify(b1).indexOf(ONDERWERP_PRIVE) < 0 && b1.sources.mail.gesloten.code === 'DIENST_UIT'
      && z1.total === 0, String(b1.sources.mail.gesloten?.code));

    // ---------------------------------------------------------------- WEG 3: een AI-verbinding, zonder tabblad
    const b2 = await metNamens({ client: 'eenheidstest-connector', ruimte: 'technisch' }, () => blokkenVan({}));
    const z2 = await metNamens({ client: 'eenheidstest-connector', ruimte: 'technisch' }, () => zoekenVan({ query: ONDERWERP_PRIVE }));
    check('WEG 3 (інструменти ШІ): een technische connector zonder tabblad krijgt óók geen persoonlijke post',
      JSON.stringify(b2).indexOf(ONDERWERP_PRIVE) < 0 && b2.sources.mail.status === 'gesloten' && z2.total === 0);

    // ---------------------------------------------------------------- WEG 4: de achtergrond, zonder lade
    check('WEG 4 (фонова синхронізація): werk zonder gebonden lade schrijft ALTIJD in de persoonlijke lade, nooit de technische',
      postRecordVelden(mens).ruimte === 'prive');

    // ---------------------------------------------------------------- post op 'eigen': de eigen lade, en ALLEEN die
    await rs.dienstZetten(mens, 'mail', 'verbind-eigen', { stapOpGedaan: true });
    const b3 = await blokkenVan({ tabContext: tOnt });
    const z3 = await zoekenVan({ tabContext: tOnt, query: ONDERWERP_TECH });
    const z3p = await zoekenVan({ tabContext: tOnt, query: ONDERWERP_PRIVE });
    check('met post op «власні дані» ziet de technische ruimte haar EIGEN post — en nog steeds niets van de persoonlijke',
      JSON.stringify(b3.sources.mail).includes(ONDERWERP_TECH) && JSON.stringify(b3).indexOf(ONDERWERP_PRIVE) < 0
      && b3.sources.mail.status === 'ready' && b3.sources.mail.total === 1, `${b3.sources.mail.status}/${b3.sources.mail.total}`);
    // 22.10 (zoekkern Z1): «prive-geheim-x» en «technisch-geheim-x» delen twee van de drie woorden; de dekkingsregel (≥ ½ van de
    // groepen) laat de EIGEN brief dus ook bij de andere vraag zien — met een lager percentage. De grens die hier telt is de lade:
    // de persoonlijke brief mag NOOIT in het technische antwoord staan, welke vraag ook.
    check('«Пошук усюди» zoekt dan in de technische lade: de eigen brief wordt gevonden, de persoonlijke niet',
      z3.total === 1 && JSON.stringify(z3.groups).includes(ONDERWERP_TECH) && JSON.stringify(z3p.groups).indexOf(ONDERWERP_PRIVE) < 0, `${z3.total}/${z3p.total}`);

    // ---------------------------------------------------------------- de persoonlijke ruimte: de andere richting
    const b4 = await blokkenVan({});
    const z4 = await zoekenVan({ query: ONDERWERP_TECH });
    const z4p = await zoekenVan({ query: ONDERWERP_PRIVE });
    // De persoonlijke brief, het persoonlijke bestand en de persoonlijke afspraak dragen alle drie hetzelfde woord, dus de
    // persoonlijke zoekopdracht hoort ze alle drie te vinden — en de technische nul.
    const z4pPost = (z4p.groups as Array<{ source: string; items: unknown[] }>).find((g) => g.source === 'mail');
    check('zonder technisch profiel in dit verzoek is alles weer persoonlijk: de TECHNISCHE rijen zijn daar niet te zien',
      JSON.stringify(b4).includes(ONDERWERP_PRIVE) && JSON.stringify(b4).indexOf(ONDERWERP_TECH) < 0
      && b4.sources.mail.status === 'ready' && JSON.stringify(z4.groups).indexOf(ONDERWERP_TECH) < 0
      && z4p.total === 3 && z4pPost?.items.length === 1 && JSON.stringify(z4p.groups).indexOf(ONDERWERP_TECH) < 0,
      `${b4.sources.mail.total}/${z4.total}/${z4p.total}`);
    check('de persoonlijke lade ziet ook haar bestanden en afspraken weer, zonder uitleg-vlak (er is niets te verklaren)',
      b4.sources.files.status === 'ready' && b4.sources.calendar.status === 'ready' && !b4.sources.files.gesloten);

    // ---------------------------------------------------------------- bevroren: alles dicht, met de derde code
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', bevroren_op=now(), bevroren_oorzaak='rol-weg' WHERE user_id=$1`, [mens]);
    const b5 = await blokkenVan({ tabContext: tOnt });
    check('een BEVROREN lade geeft niets en noemt zichzelf bevroren (de derde code die een mens kan zien)',
      b5.sources.mail.status === 'gesloten' && b5.sources.mail.gesloten.code === 'BEVROREN'
      && JSON.stringify(b5).indexOf(ONDERWERP_TECH) < 0 && JSON.stringify(b5).indexOf(ONDERWERP_PRIVE) < 0,
      String(b5.sources.mail.gesloten?.code));
    check('alle diensten van de catalogus hebben een stand in de database staan (niets is vergeten)',
      (await pool.query('SELECT count(*)::int AS n FROM app.ruimte_dienst_stand WHERE user_id=$1', [mens])).rows[0].n === DEELBARE_DIENSTEN.length);
  } finally {
    await pool.query(`DELETE FROM app.tech_activaties WHERE user_id=$1`, [mens]).catch(() => undefined);
    await pool.query(`DELETE FROM app.tech_profielen WHERE user_id=$1`, [mens]).catch(() => undefined);
    await pool.query(`DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1`, [mens]).catch(() => undefined);
    await pool.query(`DELETE FROM app.ruimte_keuze WHERE user_id=$1`, [mens]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE data->>'ownerUserId'=$1`, [mens]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [mens]).catch(() => undefined);
  }

  return einde();
}
