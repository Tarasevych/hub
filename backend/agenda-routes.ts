// De routes van de agenda: één verzameling achter /api/owner/agenda/*, bruikbaar vanaf de hub (de pagina
// /agenda) én vanaf de cloudpagina, en via backend/site-aanroep.ts ook door de MCP-hulpmiddelen van de AI.
//
// Lezen is gewoon lezen. SCHRIJVEN gaat altijd door backend/agenda-google.ts en dus altijd met:
//   • de scope `calendar.events` (anders AGENDA_SCHRIJFRECHT_ONTBREEKT + de uitbreidingsstap),
//   • een `idempotentieSleutel` van de aanroeper (dubbel versturen is onschadelijk),
//   • `If-Match` met de bekende etag (een wijziging in Google wordt nooit stil overschreven).
// De AI gebruikt precies dezelfde routes; haar bevestiging regelt backend/connectors-hulpmiddelen.ts via `write: true`
// in backend/site-hulpmiddelen.ts. Er is geen aparte, zachtere weg voor de AI.
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { meld } from './melder';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import { AGENDA_FOUT, geldigeTijdzone } from '../shared/agenda-model';
import { AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT } from '../shared/agenda-caldav-model';
import { ICS_INTERVAL_KEUZES, ICS_MAX_BYTES, ICS_MIN_MINUTEN, ICS_SCHEMAS, ICS_TIMEOUT_MS } from '../shared/agenda-ics-model';
import { AGENDA_SCHRIJF_SCOPE, googleSuiteAgendaScopeStatusVoorEmail, googleSuiteStartAgendaUitbreiding } from './google-suite-inrichting';
import {
  agendaLijst, gebeurtenisAanmaken, gebeurtenisAntwoord, gebeurtenisDeelnemers, gebeurtenisLees,
  gebeurtenisVanLokaal, gebeurtenisVerplaatsen, gebeurtenisVerwijderen, gebeurtenisWijzigen, type AgendaContext,
} from './agenda-google';
import { agendaItems, geldigeSleutel } from './agenda-spiegel';
import { caldavKoppelen, caldavLijst, caldavOphalen, caldavRondeVoorEigenaar, caldavVerwijderen } from './agenda-caldav';
import { icsLijst, icsOphalen, icsRondeVoorEigenaar, icsSchakelen, icsToevoegen, icsVerwijderen } from './agenda-ics';
import { synchroniseerAgendaVoorEigenaar } from './google-suite-agenda-sync';
import { ladePoort, ruimteKop } from './ruimte-cloud-agenda';

type User = { id: string; status: string; email?: string; sub?: string; name?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };

/** De agenda hoort bij de hub, maar de cloudpagina (en de MCP-hulpmiddelen die daar een sessie opbouwen) mag er ook bij. */
const TOEGESTANE_DIENSTEN = ['hub', 'cloud'];
const lichaamVan = (body: unknown) => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});
const kort = (value: unknown, max = 500) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

const auth = async (authorize: Authorize, ctx: Context) => {
  const uitslag = await authorize(ctx.event, ctx.body);
  if ('errorCode' in uitslag) return null;
  if (!TOEGESTANE_DIENSTEN.includes(uitslag.service) || uitslag.user.status !== 'approved') return null;
  return uitslag;
};
const ctxVan = (gebruiker: AuthSuccess): AgendaContext => ({ ownerUserId: gebruiker.user.id, email: String(gebruiker.user.email || '') });

/**
 * Tweede hek voor ELKE schrijfroute: de rol van de gebruiker (backend/rbac.ts). wrapFactoryMutations herkent een
 * wijzigende route aan Engelse woorden in het pad («create», «delete», …); onze paden zijn Nederlands, dus die
 * automaat slaat hier niet aan. Daarom staat de controle hier expliciet: een «viewer» (alleen-lezen-rol) of een
 * account dat nog niet is goedgekeurd, komt nooit bij het schrijven, en een lichaam met een vreemde
 * `ownerUserId` wordt geweigerd.
 */
const mutatieGeweigerd = (gebruiker: AuthSuccess, body: unknown) =>
  rejectForeignOwnerUserId(gebruiker.user, body) || denyMutation(gebruiker.user, 'calendar.write');

/**
 * SEC-002 (integraties-02, integraties-07): een grens op de FREQUENTIE van alles wat een vreemde server laat ophalen.
 * Eén verzoek naar deze routes kan tientallen megabytes binnenhalen en duizenden rijen schrijven (10 CalDAV-accounts ×
 * 25 agenda's); zonder teller kon één goedgekeurde gebruiker dat in een lus blijven doen. De planner houdt zich al aan
 * het interval van het abonnement (minstens 15 minuten); dit is dezelfde rem voor de knoppen en voor de AI, die precies
 * deze routes gebruikt. Per gebruiker, per soort, in een venster van tien minuten. De getallen zijn ruim voor een mens
 * (een paar keer op «Оновити» drukken, een verkeerd getikt app-wachtwoord verbeteren) en krap voor een lus.
 * Het hek van de rol (mutatieGeweigerd) staat er altijd VÓÓR: wie niet mag schrijven, komt niet eens bij de teller.
 */
const TEMPO_VENSTER_SECONDEN = 600;
const TEMPO = Object.freeze({
  caldavKoppelen: { emmer: 'agenda-caldav-koppelen', max: 10 },
  caldavVernieuwen: { emmer: 'agenda-caldav-vernieuwen', max: 12 },
  icsToevoegen: { emmer: 'agenda-ics-toevoegen', max: 30 },
  icsVernieuwen: { emmer: 'agenda-ics-vernieuwen', max: 12 },
  // «Nu synchroniseren» met forceren doet ALLES opnieuw (elke ICS, elk CalDAV-account); zonder forceren slaat de ronde
  // over wat nog niet aan de beurt is en is ze dus goedkoop.
  synchroniserenGedwongen: { emmer: 'agenda-synchroniseren-gedwongen', max: 6 },
  synchroniseren: { emmer: 'agenda-synchroniseren', max: 30 },
});
/**
 * Nacontrole g08-3: een weigering laat een spoor na, maar niet één per geweigerd verzoek — een AI in een lus zou anders zelf
 * de audit en het meldingencentrum overspoelen. Per soort komt alleen de EERSTE weigering in het venster in de audit
 * (`hits === max + 1`, en de teller telt atomair, dus precies één verzoek ziet die waarde); de mens krijgt per venster
 * hoogstens één melding, hoeveel soorten er ook geweigerd worden.
 */
const tempoGeweigerdMelden = async (soort: keyof typeof TEMPO, userId: string, retryAfter: number) => {
  await auditToevoegen({
    ownerId: userId, actorId: userId, action: 'agenda.tempo.geweigerd', type: 'beveiliging', result: 'geweigerd',
    details: { soort, max: TEMPO[soort].max, vensterSeconden: TEMPO_VENSTER_SECONDEN, retryAfter },
  }).catch(() => undefined);
  const eenMelding = await rateLimit(`agenda-tempo-melding:${userId}`, 1, TEMPO_VENSTER_SECONDEN);
  if (!eenMelding.ok || eenMelding.hits !== 1) return;
  const minuten = Math.max(1, Math.ceil(retryAfter / 60));
  await meld(userId, 'agenda',
    'Забагато оновлень календаря / Te veel agenda-verversingen',
    `Оновлення календаря вручну тимчасово призупинено: забагато запитів за 10 хвилин. Можна знову приблизно через ${minuten} хв. `
    + 'Автоматична синхронізація за розкладом працює далі, тож нові події все одно з’являться. '
    + `/ Handmatig verversen van de agenda is tijdelijk gepauzeerd: te veel verzoeken in 10 minuten. Het kan weer over ongeveer ${minuten} min. `
    + 'De geplande synchronisatie loopt gewoon door, dus nieuwe afspraken komen er toch bij.',
    '/agenda');
};
/** `null` als het mag; anders het 429-antwoord, met een stabiele code en wanneer het weer mag (Retry-After). */
const teVaak = async (soort: keyof typeof TEMPO, userId: string) => {
  const { emmer, max } = TEMPO[soort];
  const limiet = await rateLimit(`${emmer}:${userId}`, max, TEMPO_VENSTER_SECONDEN);
  if (limiet.ok) return null;
  if (limiet.hits === max + 1) await tempoGeweigerdMelden(soort, userId, limiet.retryAfter);
  const antwoord = json({ ok: false, error: 'RATE_LIMITED', fout: 'AGENDA_TE_VAAK', retryAfter: limiet.retryAfter }, 429);
  return { ...antwoord, headers: { ...antwoord.headers, 'Retry-After': String(limiet.retryAfter) } };
};

/** Elke schrijfroute begint hier: zonder geldige sleutel schrijven we niets (idempotentie is niet optioneel). */
const sleutelVan = (body: Record<string, unknown>) => geldigeSleutel(body.idempotentieSleutel ?? body.idempotency_key ?? body.sleutel);
const meldKeuze = (value: unknown): 'all' | 'externalOnly' | 'none' =>
  (value === 'all' || value === 'externalOnly' ? value : 'none');

/** Hoe het antwoord van een schrijfactie naar HTTP wordt: een conflict is 409, geen recht 403, weg 404. */
const schrijfAntwoord = (uitslag: Awaited<ReturnType<typeof gebeurtenisAanmaken>>) => {
  if (uitslag.ok) return json(uitslag);
  // 'bezig' = een gelijk verzoek met dezelfde sleutel loopt nog; 409 zegt «probeer dezelfde sleutel straks nog eens».
  const status = uitslag.uitslag === 'conflict' || uitslag.uitslag === 'bezig' ? 409 : uitslag.uitslag === 'weg' ? 404 : uitslag.uitslag === 'geen-recht' ? 403 : 400;
  return json(uitslag, status);
};

/** Voor de diagnose-/beheerpagina's: wat kan de agenda vandaag werkelijk, per onderdeel. */
export const agendaMogelijkheden = Object.freeze({
  google: { lezen: true, schrijven: true, scope: AGENDA_SCHRIJF_SCOPE, versiecontrole: 'If-Match/etag', synchronisatie: 'syncToken + 410 GONE herstel', idempotent: true },
  ics: { lezen: true, schrijven: false, reden: 'ICS_IS_EENRICHTING' },
  caldav: { lezen: true, schrijven: false, ontbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT },
  microsoft: { lezen: false, schrijven: false, reden: 'MICROSOFT_CALENDARS_SCOPES_NIET_GEVRAAGD' },
  proton: { lezen: false, schrijven: false, reden: 'PROTON_GEEN_PUBLIEKE_API_GEBRUIK_ICS_EXPORT' },
});

/**
 * GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084): de HELE verzameling loopt door `ladePoort('agenda', ...)`.
 * Die berekent per verzoek uit welke lade er gelezen en geschreven mag worden — uit de rol, de status, het profiel en
 * de lopende activering in de DATABASE, nooit uit het verzoek — en weigert met uitleg in beide talen bij «uit»,
 * «bevroren» of «nog niets gekozen». De overzichtsroute krijgt die uitleg met status 200 (ZACHTE_ROUTES), zodat de
 * pagina kan zeggen waarom ze leeg is in plaats van leeg te blijven; al het andere krijgt 403.
 * Omdat de poort om de verzameling heen ligt en niet per route, is elke route die hier ooit bij komt vanzelf bewaakt.
 * De AI gebruikt precies deze routes (backend/site-aanroep.ts belt ze intern), dus calendar_* valt onder dezelfde
 * stand: de ruimte van de AI-VERBINDING reist mee in backend/mcp-namens.ts en kan de lade alleen verkleinen.
 */
export const createAgendaRoutes = (authorize: Authorize) => ladePoort('agenda', authorize, {
  // -------------------------------------------------------------------------------------- lezen
  /** Alles wat de pagina /agenda nodig heeft in één verzoek: recht, agenda's, afspraken en de abonnementen. */
  'POST /api/owner/agenda/overzicht': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const context = ctxVan(gebruiker);
    const toegang = await googleSuiteAgendaScopeStatusVoorEmail(context.ownerUserId, context.email);
    const [ics, caldav] = await Promise.all([icsLijst(context.ownerUserId), caldavLijst(context.ownerUserId)]);
    const naamKaart = new Map<string, { naam: string; bron: 'ics' | 'caldav' }>();
    for (const rij of ics) naamKaart.set(`${rij.id}|`, { naam: rij.naam || rij.adres, bron: 'ics' });
    for (const rij of caldav) {
      naamKaart.set(`${rij.id}|`, { naam: rij.naam || rij.adres, bron: 'caldav' });
      for (const agenda of rij.agendas) naamKaart.set(`${rij.id}|${agenda.url}`, { naam: agenda.naam || rij.naam || rij.adres, bron: 'caldav' });
    }
    const lijst = toegang.lezen ? await agendaLijst(context) : { fout: 'AGENDA_LEESRECHT_ONTBREEKT' as const };
    const { items, begrensd } = await agendaItems(context.ownerUserId, {
      schrijfbaar: toegang.schrijven,
      naamVan: (abonnementId, agendaUrl) => naamKaart.get(`${abonnementId}|${agendaUrl}`) || naamKaart.get(`${abonnementId}|`) || { naam: '', bron: 'ics' },
    });
    const agendas = 'fout' in lijst ? [] : lijst.agendas;
    return json({
      observedAt: Date.now(),
      // In welke lade kijkt deze mens, en wat betekent die stand — in beide talen, zodat de pagina eerlijk kan zijn.
      ruimte: ruimteKop('agenda'),
      toegang: {
        gekoppeld: toegang.lezen,
        lezen: toegang.lezen,
        schrijven: toegang.schrijven,
        uitbreidingNodig: toegang.uitbreidingNodig,
        toevoegen: toegang.toevoegen,
        scopes: toegang.configuredScopes,
        // Waar de uitbreiding gebeurt: op deze pagina zelf (de route hieronder start de Google-toestemming).
        uitbreidingRoute: 'POST /api/owner/agenda/toegang/uitbreiden',
      },
      agendas,
      standaardTijdzone: geldigeTijdzone(agendas.find((a) => a.primair)?.tijdzone, 'UTC'),
      items,
      begrensd,
      abonnementen: {
        ics: ics.map((rij) => ({ ...rij, schrijven: false })),
        caldav,
        grenzen: { icsSchemas: ICS_SCHEMAS, icsMaxBytes: ICS_MAX_BYTES, icsTimeoutMs: ICS_TIMEOUT_MS, icsMinMinuten: ICS_MIN_MINUTEN, icsIntervalKeuzes: ICS_INTERVAL_KEUZES },
      },
      // Eerlijk, altijd meegestuurd: CalDAV leest, schrijven is niet gebouwd, en dit mist er nog voor.
      caldavSchrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT,
      // Eerlijkheid in één oogopslag, ook voor een andere cliënt dan de pagina: per aanbieder wat vandaag
      // werkelijk kan, en bij alles wat niet kan de REDEN (zie agendaMogelijkheden hierboven).
      mogelijkheden: agendaMogelijkheden,
      ...('fout' in lijst ? { agendasFout: lijst.fout } : {}),
    });
  }],

  /** Eén afspraak verse uit Google (om te vergelijken na een conflict). */
  'POST /api/owner/agenda/gebeurtenis': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const body = lichaamVan(ctx.body);
    const uitslag = await gebeurtenisLees(ctxVan(gebruiker), kort(body.agendaId, 500) || 'primary', kort(body.gebeurtenisId, 1024));
    return 'fout' in uitslag ? json({ ok: false, fout: uitslag.fout }, uitslag.fout === AGENDA_FOUT.weg ? 404 : 400) : json({ ok: true, ...uitslag });
  }],

  /** Wat is er met één lokaal id gebeurd? (De browser maakt het id vóór het verzoek en kan zo hervatten.) */
  'POST /api/owner/agenda/lokaal': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const rij = await gebeurtenisVanLokaal(ctxVan(gebruiker), kort(lichaamVan(ctx.body).lokaalId, 120));
    return json({ ok: Boolean(rij), koppeling: rij });
  }],

  /** Nu synchroniseren: Google → spiegel (incrementeel, syncToken) en de externe abonnementen. */
  'POST /api/owner/agenda/synchroniseren': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const body = lichaamVan(ctx.body), forceren = body.forceren === true;
    const rem = await teVaak(forceren ? 'synchroniserenGedwongen' : 'synchroniseren', gebruiker.user.id);
    if (rem) return rem;
    const google = await synchroniseerAgendaVoorEigenaar(gebruiker.user.id).catch((caught: unknown) => ({ fout: caught instanceof Error ? caught.message : 'AGENDA_SYNC_MISLUKT' }));
    const [ics, caldav] = await Promise.all([
      icsRondeVoorEigenaar(gebruiker.user.id, forceren).catch(() => []),
      caldavRondeVoorEigenaar(gebruiker.user.id, forceren).catch(() => []),
    ]);
    return json({ ok: true, google, ics, caldav });
  }],

  // -------------------------------------------------------------------------------------- toegang uitbreiden
  /**
   * «Розширити доступ» / «Toegang uitbreiden»: incrementele autorisatie voor de schrijfscope.
   * Geen nieuwe koppeling — Google houdt de bestaande toestemmingen (include_granted_scopes) en vraagt alleen
   * de nieuwe erbij. Het antwoord zegt óók wat er precies bijkomt, zodat de pagina dat kan laten zien.
   */
  'POST /api/owner/agenda/toegang/uitbreiden': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const stand = await googleSuiteAgendaScopeStatusVoorEmail(gebruiker.user.id, String(gebruiker.user.email || ''));
    if (stand.schrijven) return json({ ok: true, alGegeven: true, toevoegen: [], schrijven: true });
    const uitslag = await googleSuiteStartAgendaUitbreiding(
      { service: 'cloud', user: { id: gebruiker.user.id, email: String(gebruiker.user.email || ''), name: String(gebruiker.user.name || ''), status: gebruiker.user.status, sub: gebruiker.user.sub } },
      lichaamVan(ctx.body),
    );
    return uitslag;
  }],

  // -------------------------------------------------------------------------------------- schrijven (Google)
  'POST /api/owner/agenda/gebeurtenis/aanmaken': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    return schrijfAntwoord(await gebeurtenisAanmaken(ctxVan(gebruiker), {
      sleutel, lokaalId: kort(body.lokaalId, 120), vorm: body.vorm ?? body, meldDeelnemers: meldKeuze(body.meldDeelnemers),
    }));
  }],

  'POST /api/owner/agenda/gebeurtenis/wijzigen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    return schrijfAntwoord(await gebeurtenisWijzigen(ctxVan(gebruiker), {
      sleutel, agendaId: kort(body.agendaId, 500) || 'primary', gebeurtenisId: kort(body.gebeurtenisId, 1024),
      vorm: body.vorm, etag: kort(body.etag, 300), negeerVersie: body.negeerVersie === true, meldDeelnemers: meldKeuze(body.meldDeelnemers),
    }));
  }],

  'POST /api/owner/agenda/gebeurtenis/verplaatsen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    return schrijfAntwoord(await gebeurtenisVerplaatsen(ctxVan(gebruiker), {
      sleutel, agendaId: kort(body.agendaId, 500) || 'primary', gebeurtenisId: kort(body.gebeurtenisId, 1024),
      naarAgendaId: kort(body.naarAgendaId, 500), etag: kort(body.etag, 300), negeerVersie: body.negeerVersie === true,
      meldDeelnemers: meldKeuze(body.meldDeelnemers),
    }));
  }],

  'POST /api/owner/agenda/gebeurtenis/verwijderen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    return schrijfAntwoord(await gebeurtenisVerwijderen(ctxVan(gebruiker), {
      sleutel, agendaId: kort(body.agendaId, 500) || 'primary', gebeurtenisId: kort(body.gebeurtenisId, 1024),
      etag: kort(body.etag, 300), negeerVersie: body.negeerVersie === true, meldDeelnemers: meldKeuze(body.meldDeelnemers),
    }));
  }],

  'POST /api/owner/agenda/gebeurtenis/deelnemers': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    return schrijfAntwoord(await gebeurtenisDeelnemers(ctxVan(gebruiker), {
      sleutel, agendaId: kort(body.agendaId, 500) || 'primary', gebeurtenisId: kort(body.gebeurtenisId, 1024),
      toevoegen: body.toevoegen, verwijderen: body.verwijderen, etag: kort(body.etag, 300),
      negeerVersie: body.negeerVersie === true, meldDeelnemers: meldKeuze(body.meldDeelnemers ?? 'all'),
    }));
  }],

  /** RSVP: zelf antwoorden op een uitnodiging (needsAction / accepted / tentative / declined). */
  'POST /api/owner/agenda/gebeurtenis/antwoord': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body), sleutel = sleutelVan(body);
    if (!sleutel) return error(AGENDA_FOUT.sleutel, 400);
    const antwoord = kort(body.antwoord, 40);
    if (!['needsAction', 'accepted', 'tentative', 'declined'].includes(antwoord)) return error('AGENDA_ANTWOORD_ONGELDIG', 400);
    return schrijfAntwoord(await gebeurtenisAntwoord(ctxVan(gebruiker), {
      sleutel, agendaId: kort(body.agendaId, 500) || 'primary', gebeurtenisId: kort(body.gebeurtenisId, 1024),
      antwoord: antwoord as 'needsAction' | 'accepted' | 'tentative' | 'declined', opmerking: kort(body.opmerking, 1000),
      etag: kort(body.etag, 300), negeerVersie: body.negeerVersie === true,
    }));
  }],

  // -------------------------------------------------------------------------------------- ICS (lezen)
  'POST /api/owner/agenda/ics/toevoegen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const rem = await teVaak('icsToevoegen', gebruiker.user.id);
    if (rem) return rem;
    const body = lichaamVan(ctx.body);
    const uitslag = await icsToevoegen(gebruiker.user.id, { adres: body.adres, naam: body.naam, intervalMinuten: body.intervalMinuten });
    if (!uitslag.ok) return json(uitslag, 400);
    // Meteen één keer ophalen: zo ziet de gebruiker direct of de link werkt in plaats van «wacht een uur».
    const haal = await icsOphalen(gebruiker.user.id, uitslag.abonnement.id);
    return json({ ok: true, abonnement: uitslag.abonnement, haal });
  }],
  'POST /api/owner/agenda/ics/vernieuwen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const rem = await teVaak('icsVernieuwen', gebruiker.user.id);
    if (rem) return rem;
    const id = kort(lichaamVan(ctx.body).id, 120);
    if (id) return json({ ok: true, haal: await icsOphalen(gebruiker.user.id, id) });
    return json({ ok: true, ronde: await icsRondeVoorEigenaar(gebruiker.user.id, true) });
  }],
  'POST /api/owner/agenda/ics/schakelen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaamVan(ctx.body);
    const ok = await icsSchakelen(gebruiker.user.id, kort(body.id, 120), body.actief !== false, body.intervalMinuten);
    return ok ? json({ ok: true }) : error('ICS_ABONNEMENT_ONBEKEND', 404);
  }],
  'POST /api/owner/agenda/ics/verwijderen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const ok = await icsVerwijderen(gebruiker.user.id, kort(lichaamVan(ctx.body).id, 120));
    return ok ? json({ ok: true }) : error('ICS_ABONNEMENT_ONBEKEND', 404);
  }],

  // -------------------------------------------------------------------------------------- CalDAV (lezen)
  'POST /api/owner/agenda/caldav/koppelen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const rem = await teVaak('caldavKoppelen', gebruiker.user.id);
    if (rem) return rem;
    const body = lichaamVan(ctx.body);
    const uitslag = await caldavKoppelen(gebruiker.user.id, {
      adres: body.adres, gebruikersnaam: body.gebruikersnaam, wachtwoord: body.wachtwoord,
      naam: body.naam, intervalMinuten: body.intervalMinuten,
    });
    if (!uitslag.ok) return json({ ...uitslag, schrijven: false, schrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT }, 400);
    const haal = await caldavOphalen(gebruiker.user.id, uitslag.account.id);
    return json({ ok: true, account: uitslag.account, haal, schrijven: false, schrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT });
  }],
  'POST /api/owner/agenda/caldav/vernieuwen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const rem = await teVaak('caldavVernieuwen', gebruiker.user.id);
    if (rem) return rem;
    const id = kort(lichaamVan(ctx.body).id, 120);
    if (id) return json({ ok: true, haal: await caldavOphalen(gebruiker.user.id, id) });
    return json({ ok: true, ronde: await caldavRondeVoorEigenaar(gebruiker.user.id, true) });
  }],
  'POST /api/owner/agenda/caldav/verwijderen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_AGENDA_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const ok = await caldavVerwijderen(gebruiker.user.id, kort(lichaamVan(ctx.body).id, 120));
    return ok ? json({ ok: true }) : error('CALDAV_ACCOUNT_ONBEKEND', 404);
  }],
});
