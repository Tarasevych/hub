// DE HMARA EN DE AGENDA IN TWEE GESCHEIDEN LADEN (opdracht van de eigenaar, 20.10.2026; kern: shared/ruimte-scheiding.ts,
// backend/ruimte-scheiding.ts, migraties 0082 + 0084).
//
// WAT HIER STAAT EN WAAROM HET ÉÉN BESTAND IS
//   De hmara (backend/cloud-platform.ts, cloud-google-drive.ts, google-suite-inrichting.ts) en de agenda
//   (backend/agenda-routes.ts, agenda-google.ts, agenda-spiegel.ts, agenda-ics.ts, agenda-caldav.ts) hebben samen
//   ruim veertig routes en zes opslagplaatsen. Eén vergeten route is geen schoonheidsfout maar een LEK: dan ziet de
//   technische ruimte een persoonlijk bestand of een persoonlijke agenda. Daarom wordt de poort hier NIET per route
//   met de hand gezet, maar om de hele verzameling heen gelegd:
//
//       export const createCloudRoutes = (authorize) => ladePoort('cloud', authorize, { ...alle routes });
//
//   `ladePoort` loopt over ELKE sleutel van die verzameling. Een nieuwe route die iemand morgen toevoegt is dus
//   vanzelf bewaakt — vergeten kan niet meer. De eenheidstest
//   (tests/eenheid/ruimte-cloud-agenda-20261020.test.ts) leest de verzamelingen van ALLE ZES bestanden die routes van
//   de hmara of de agenda aanbieden en toont dat er geen enkele onbewaakte route in zit. `ONBEWAAKTE_ROUTES` hieronder
//   is de enige uitzonderingenlijst, en zij is LEEG — met de reden erbij waarom de twee kandidaten er niet in staan.
//
// DE LADE REIST IN DE AANROEP, NIET IN DE BODY
//   De poort berekent de lade één keer (gegevensLade: rol, status, profiel en de lopende activering uit de
//   database — nooit uit het verzoek) en zet haar in een AsyncLocalStorage. Alles wat daarna in dezelfde aanroep
//   leest of schrijft haalt haar op met `ladeOf(userId)`. Zo kan geen enkele client een lade MEEGEVEN, en hoeft geen enkele
//   interne functie een extra argument door tien lagen te duwen.
//   Buiten een bewaakte aanroep (cron, interne hulpjes) is er geen lade; `ladeOf(userId)` geeft dan de
//   PERSOONLIJKE lade — de minste rechten, en precies wat een rij van vóór 0084 is.
//
// TWEE DINGEN DIE GEEN POORT ZIJN
//   • RLS (migratie 0076) scheidt MENSEN. De ruimte scheidt de twee laden van ÉÉN mens. Ze vervangen elkaar niet;
//     alle SQL hieronder draagt dus nog altijd `user_id` mee.
//   • `uit` en `bevroren` zijn geen fouten maar ANTWOORDEN: de pagina moet kunnen uitleggen waarom ze leeg is
//     (beslissing van de eigenaar: nooit een leeg scherm). Daarom hebben de twee overzichtsroutes `ZACHTE_ROUTES`
//     een 200 met de uitleg erin, en al het andere een 403 met diezelfde uitleg.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { storage } from '../server/platform/opslag';
import type { AiRuimte } from '../shared/ai-ruimte';
import type { DeelbareDienst, DienstStand, Lade, LadeBesluit } from '../shared/ruimte-scheiding';
import { DIENST_NAAM, STAND_NAAM, STAND_UITLEG } from '../shared/ruimte-scheiding';
import { gegevensLade, registreerLadeUitvoerder, standVan, technischeRechten, type LadeRegel } from './ruimte-scheiding';
import { bijTechRechtenVerlies } from './tech-profiel';
import { huidigeRuimte } from './mcp-namens';
import { huidigeLade as postLade } from './mail-ruimte';

const sys = () => getPool('systeem');

// ------------------------------------------------------------------------------------------------ de lade in de aanroep
/** Wat de poort van ÉÉN verzoek vaststelde. Niet alleen de lade: ook de stand, zodat het scherm eerlijk kan zijn. */
export type LadeContext = { lade: Lade; dienst: DeelbareDienst; stand: DienstStand; gedeeld: boolean };
const opslagLade = new AsyncLocalStorage<LadeContext>();
/** De context van DEZE aanroep, of null buiten een bewaakte route (cron, opstarten, interne hulpjes). */
export const huidigeLadeContext = (): LadeContext | null => opslagLade.getStore() ?? null;
/**
 * De lade van deze aanroep; buiten een bewaakte route de PERSOONLIJKE lade van `userId` (minste rechten).
 *
 * BEVEILIGINGSREVIEW 21.10.2026: de Google-koppeling (backend/google-suite-inrichting.ts) wordt ook vanuit POSTroutes gebruikt
 * (Gmail-lijst, -berichten, -toestemming, «Відключити»). Die routes poort metMailRuimte (backend/mail-ruimte.ts) met een EIGEN
 * AsyncLocalStorage; hier stond dan geen lade en dus kreeg een TECHNISCH tabblad met post op «власні дані» de PERSOONLIJKE
 * Gmail-principals: het zag de persoonlijke mailboxen, kon hun berichten lezen en kon ze loskoppelen (refresh-token bij Google
 * ingetrokken) — precies wat de scheiding verbiedt. Daarom: geen hmara-/agendalade → de lade die de postpoort voor DEZELFDE mens
 * bond. Bij post «спільно» is dat de persoonlijke lade (zoals voorheen), bij «власні» de technische; zonder enige poort: persoonlijk.
 */
export const ladeOf = (userId: string): Lade => {
  const h = opslagLade.getStore();
  if (h && h.lade.userId === userId) return h.lade;
  const post = postLade(userId);
  return post ? { userId: post.userId, ruimte: post.ruimte } : { userId, ruimte: 'prive' };
};
/**
 * Een stuk werk in een bekende lade uitvoeren. Zelfde naam en zelfde vorm als backend/mail-ruimte.ts, zodat er in
 * de hele codebase één manier is om dit te zeggen. Gebruikt door de poort hieronder, door de planners (die de lade
 * uit de RIJ halen) en door de eenheidstest.
 */
export const metLade = <T>(lade: Lade, dienst: DeelbareDienst, fn: () => Promise<T>): Promise<T> =>
  metLadeContext({ lade, dienst, stand: 'eigen', gedeeld: false }, fn);
/** Idem, maar met de volledige context (de poort kent ook de STAND, en die hoort in het antwoord van het scherm). */
const metLadeContext = <T>(ctx: LadeContext, fn: () => Promise<T>): Promise<T> =>
  opslagLade.run({ ...ctx, lade: { userId: ctx.lade.userId, ruimte: ctx.lade.ruimte } }, fn);

// ------------------------------------------------------------------------------------------------ eerlijk antwoord
/**
 * Bij een GESLAAGD antwoord: in welke ruimte kijkt deze mens, welke stand heeft de dienst, en wat betekent die stand —
 * in beide talen. Zo kan de hmara- of de agendapagina zéggen «dit zijn de gegevens van de technische ruimte» in plaats
 * van er het zwijgen toe te doen. Zelfde vorm als backend/ruimte-bord-github.ts, zodat alle schermen één kop kennen.
 * Buiten een bewaakte aanroep (en dus altijd voor wie geen technisch profiel heeft) is het antwoord «persoonlijk».
 */
export type RuimteKop = { ruimte: AiRuimte; stand: DienstStand; gedeeld: boolean; dienst: DeelbareDienst; naam: { uk: string; nl: string }; uitleg: { uk: string; nl: string } };
export const ruimteKop = (standaardDienst: DeelbareDienst = 'cloud'): RuimteKop => {
  const c = huidigeLadeContext();
  const dienst = c?.dienst ?? standaardDienst;
  const stand = c?.stand ?? 'eigen';
  return { ruimte: c?.lade.ruimte ?? 'prive', stand, gedeeld: c?.gedeeld ?? false, dienst, naam: DIENST_NAAM[dienst], uitleg: STAND_UITLEG[stand] };
};
/**
 * Bij een WEIGERING: de code én de uitleg in beide talen, plus de naam van de dienst en de standnamen. Geen leeg scherm
 * en geen lege lijst zonder reden. `error()` van het platform geeft alleen `{error}`, dus die vorm wordt hier met de hand
 * aangevuld — het veld `error` blijft op dezelfde plek staan voor alles wat erop let.
 */
export const ruimteWeigering = (besluit: LadeBesluit & { ok: false }, dienst: DeelbareDienst): Resp =>
  json({ error: besluit.code, ruimte: 'technisch' as AiRuimte, dienst, dienstNaam: DIENST_NAAM[dienst], uitleg: besluit.uitleg, standen: STAND_NAAM }, 403);

// ------------------------------------------------------------------------------------------------ de opslag van bestanden
/**
 * HET PAD IN DE OPSLAG, PER LADE (opdracht: «щоб файли двох просторів фізично не змішувались»).
 *
 * Tot nu was het pad `cloud/<sha256(ownerUserId)[0..18]>/…` — afgeleid van de MENS, dus één map voor beide
 * profielen. Vanaf nu heeft de technische lade een EIGEN BOOM:
 *
 *     persoonlijk  cloud/<hash>/<tijd>-<willekeur><ext>             (ONVERANDERD — geen bestaand bestand verhuist)
 *     technisch    cloud-technisch/<hash>/<tijd>-<willekeur><ext>
 *
 * Waarom een ander VOORVOEGSEL en niet een andere hash: de hash blijft die van dezelfde mens, zodat de
 * eigenaarscontrole van de opslag (server/platform/opslag.ts → padHoortBijAnder) beide bomen nog altijd aan hem
 * toeschrijft en niemand anders erbij komt. Twee bomen betekent tegelijk dat het WISSEN van de ene boom de andere
 * onmogelijk kan raken: `verwijderMap` hieronder loopt alleen door het voorvoegsel van die ene lade.
 * Een pad dat niet met het voorvoegsel van de lade begint, hoort niet bij die lade — `padInLade` is de enige plek
 * waar dat beoordeeld wordt, en bij twijfel is het antwoord «nee».
 */
export const CLOUD_PAD_PRIVE = 'cloud';
export const CLOUD_PAD_TECHNISCH = 'cloud-technisch';
export const cloudVoorvoegsel = (lade: Lade): string => `${lade.ruimte === 'technisch' ? CLOUD_PAD_TECHNISCH : CLOUD_PAD_PRIVE}/${createHash('sha256').update(lade.userId).digest('hex').slice(0, 18)}`;
/** Hoort dit opslagpad bij die lade? Een leeg pad, een pad van de andere lade of van iemand anders: nee. */
export const padInLade = (pad: unknown, lade: Lade): boolean => {
  const p = String(pad ?? '');
  if (!p) return false;
  const mijn = `${cloudVoorvoegsel(lade)}/`;
  if (!p.startsWith(mijn)) return false;
  // Geen enkele weg omhoog of zijwaarts: de rest is één bestandsnaam.
  const rest = p.slice(mijn.length);
  return rest.length > 0 && !rest.includes('/') && rest !== '.' && rest !== '..';
};

// ------------------------------------------------------------------------------------------------ de poort om de routes
type Resp = ReturnType<typeof json>;
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type Handler = (ctx: Ctx) => Promise<Resp> | Resp;
type Routes = Record<string, Handler[]>;
type Gebruiker = { id: string; status: string; role?: string; email?: string };
type AuthOk = { service: string; user: Gebruiker };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthOk | { errorCode: string }>;

/** Waar een verzoek vandaan komt. `tabContext` is de site; ontbreekt die, dan geldt de ruimte van de AI-verbinding. */
export type Herkomst = { userId: string; rol?: string | null; tabContext?: unknown; aiRuimte?: AiRuimte | null };

/**
 * DE POORT, één keer, voor elke weg naar de hmara en de agenda: de pagina (met een tabblad), een AI-verbinding (zonder
 * tabblad, maar met de ruimte van de verbinding in backend/mcp-namens.ts — die overleeft de interne aanroep van
 * backend/site-aanroep.ts), en de interne aanroep van een hulpmiddel. Nergens anders wordt een ruimte zelf berekend.
 * Passieve veiligheid zoals in de kern: zien we 'BEVROREN', dan dwingen we de intrekking alsnog af — ook als er ooit een
 * nieuwe weg om rechten te verliezen vergeten wordt.
 */
export async function ruimtePoort(h: Herkomst, dienst: DeelbareDienst): Promise<LadeBesluit> {
  const tab = typeof h.tabContext === 'string' ? h.tabContext : '';
  const aiRuimte = h.aiRuimte ?? (tab ? null : huidigeRuimte());
  const besluit = await gegevensLade({ userId: h.userId, rol: h.rol ?? null, tabContext: tab, aiRuimte, dienst });
  if (!besluit.ok && besluit.code === 'BEVROREN') void bevriezingAfdwingen(h.userId, 'poort');
  return besluit;
}

/**
 * De twee OVERZICHTSROUTES van de pagina's mogen nooit een 403 geven: dan weet het scherm niet of de dienst uitstaat,
 * bevroren is, of dat er iets stuk is — en de mens ziet een leeg vlak zonder uitleg. Zij geven 200 met de uitleg erin
 * plus een LEGE inhoud, zodat de pagina precies kan zeggen wat er aan de hand is en wat de volgende stap is.
 */
export const ZACHTE_ROUTES: Readonly<Record<string, Record<string, unknown>>> = Object.freeze({
  // KLACHT 3 VAN DE EIGENAAR (20.10.2026): «https://cloud.tarasevych.com/ при технічному немає робочої — навіть меню пропало.»
  // Oorzaak: dit lichaam gaf `providers: null, onboarding: null`, en src/CloudFunctioneelWeergave.tsx leest meteen
  // `data.onboarding.services` en `data.providers.find(...)`. Dat is een TypeError TIJDENS HET RENDEREN, dus React gooide de
  // hele boom weg — inclusief CanonicalChrome, en daarmee het menu en de shapka. Een weigering van de poort mag nooit een
  // pagina slopen: het lichaam heeft daarom dezelfde VORM als een geslaagd antwoord, alleen leeg. De pagina blijft een
  // pagina en zet de uitleg in de werkruimte.
  'POST /api/owner/cloud/bootstrap': {
    architecture: 'workspace-functional-v1', workspaces: [], items: [], inbox: [], recent: [], resume: null,
    summary: { workspaces: 0, inbox: 0, active: 0, done: 0 }, providers: [], capabilities: {},
    onboarding: {
      architecture: 'primary_google_suite_onboarding_bplus_v1', primaryAccount: { email: '', principalId: '', identityLinked: false },
      services: [], nextService: '', completedServices: [], completedCount: 0, totalServices: 4, complete: false,
    },
  },
  'POST /api/owner/agenda/overzicht': {
    agendas: [], items: [], begrensd: false, standaardTijdzone: 'UTC',
    toegang: { gekoppeld: false, lezen: false, schrijven: false, uitbreidingNodig: false, toevoegen: [], scopes: [] },
    abonnementen: { ics: [], caldav: [], grenzen: null },
    // Zelfde reden als bij de hmara hierboven: dezelfde VORM als een geslaagd antwoord, alleen leeg. Een ontbrekend veld dat
    // de pagina zonder `?.` leest, is een renderfout en dus een pagina zonder menu.
    caldavSchrijvenOntbreekt: [], mogelijkheden: {},
  },
});

/**
 * ROUTES DIE BEWUST GEEN LADE NODIG HEBBEN: GEEN. Deze lijst is leeg, en dat is een bevinding, geen nalatigheid.
 *
 * Twee routes zagen er bij het nalopen uit als «alleen de stand van de server» en zouden dus buiten de poort kunnen:
 *   POST /api/owner/cloud/providers/status/verify
 *   POST /api/owner/cloud/platform-status
 * Maar beide geven naast die serverstand ook een MOMENTOPNAME VAN DE MENS mee — googleSuiteDriveProviderSnapshot
 * (de gekoppelde Drive-rekeningen met hun e-mailadressen) en googleSuiteOnboardingSnapshot (welke diensten gekoppeld
 * zijn, met welk account). Buiten de poort zou de technische ruimte daarmee de PERSOONLIJKE koppelingen zien, ook met
 * de hmara op 'uit'. Daarom staan ze er allebei WEL in, en is de uitzonderingenlijst leeg.
 * Dat de pagina dan niet meer kan zeggen «de server is in orde maar hier staat de dienst uit», is opgelost met
 * ZACHTE_ROUTES hierboven: de twee overzichtsroutes geven 200 met de uitleg erin.
 * Wie hier ooit iets aan wil toevoegen: de eenheidstest leest deze lijst en eist een reden per regel.
 */
export const ONBEWAAKTE_ROUTES: Readonly<Record<string, string>> = Object.freeze({});

const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
/** Het antwoord bij een weigering: 403, of bij een zachte route 200 met dezelfde uitleg en een lege inhoud. */
export const weigerAntwoord = (route: string, dienst: DeelbareDienst, besluit: LadeBesluit & { ok: false }): Resp => {
  const zacht = ZACHTE_ROUTES[route];
  if (!zacht) return ruimteWeigering(besluit, dienst);
  return json({
    ...zacht, observedAt: Date.now(),
    error: besluit.code,
    ruimte: { ok: false, dienst, dienstNaam: DIENST_NAAM[dienst], code: besluit.code, uitleg: besluit.uitleg, standen: STAND_NAAM },
  }, 200);
};

/**
 * Leg de poort om een HELE routeverzameling. Per verzoek:
 *   1. wie is dit? (`authorize` — mislukt dat, dan geeft de route zelf zijn eigen, bestaande 403; wij bemoeien ons er niet
 *      mee, zodat er geen tweede soort «niet ingelogd» ontstaat);
 *   2. uit welke lade mag dit? (`ruimtePoort`: de ruimte komt uit de database, de herkomst uit het tabblad of uit de
 *      AI-verbinding, en die kan de lade alleen VERKLEINEN);
 *   3. mag het niet, dan een weigering MET uitleg — nooit stil de andere lade;
 *   4. mag het wel, dan loopt de route in `metLade`, en alles daarbinnen leest `ladeOf(userId)`.
 * Omdat dit om de verzameling heen ligt en niet per route, is een route die iemand morgen toevoegt vanzelf bewaakt.
 */
export function ladePoort(dienst: DeelbareDienst, authorize: Authorize, routes: Routes): Routes {
  const uit: Routes = {};
  for (const [route, keten] of Object.entries(routes)) {
    if (ONBEWAAKTE_ROUTES[route]) { uit[route] = keten; continue; }
    uit[route] = keten.map((handler, i) => (i > 0 ? handler : (async (ctx: Ctx) => {
      let auth: AuthOk | { errorCode: string };
      try { auth = await authorize(ctx.event, ctx.body); } catch { return handler(ctx); }
      if ('errorCode' in auth || !auth.user?.id || auth.user.status !== 'approved') return handler(ctx);
      const besluit = await ruimtePoort({ userId: auth.user.id, rol: auth.user.role ?? null, tabContext: String(bodyOf(ctx.body).tabContext || '') }, dienst);
      if (!besluit.ok) return weigerAntwoord(route, dienst, besluit);
      return metLadeContext({ lade: besluit.lade, dienst: besluit.dienst, stand: besluit.stand, gedeeld: besluit.gedeeld }, async () => handler(ctx));
    })));
  }
  return uit;
}
/** Welke routes van een verzameling bewaakt zijn — alleen voor de eenheidstest, die het bewijs wil zien. */
export const bewaakteRoutes = (routes: Routes): string[] => Object.keys(routes).filter((r) => !ONBEWAAKTE_ROUTES[r]);

// ------------------------------------------------------------------------------------------------ echt intrekken
/**
 * BIJ BEVRIEZEN: WAT VAN DE TECHNISCHE RUIMTE WAS, GAAT ECHT WEG — en het persoonlijke blijft volledig heel.
 *
 * De kern trekt bij rechtenverlies de technische AI-verbindingen in (technischeVerbindingenIntrekken). De
 * GOOGLE-koppeling van de hmara en de agenda hoort daar niet bij: die ligt in app.records
 * (provider_principals_v1, google_oauth_grant_v1, provider_service_grants_v1, provider_service_tokens_v1,
 * cloud_provider_accounts_v1). Daarom meldt dit bestand zich bij dezelfde haak (bijTechRechtenVerlies,
 * backend/tech-profiel.ts) en doet het drie dingen, alle drie UITSLUITEND op rijen met ruimte = 'technisch':
 *   • de OAuth-grant (het refresh-token) wordt ingetrokken: `grantStatus: 'revoked'`, `revokedAt` gezet. De
 *     toegangstokens worden uit dat refresh-token gehaald, dus daarmee is er binnen de minuut geen toegang meer;
 *   • de dienstgrants en de Drive-accounts gaan op 'disconnected': de hmara ziet geen rekening meer;
 *   • de externe agenda-abonnementen (ICS en CalDAV) gaan op `actief = false`, zodat ook de PLANNER ze niet meer
 *     ophaalt — anders zou een bevroren lade nog in de achtergrond doorlezen.
 * De gegevens zelf blijven staan: ze zijn heel maar onbereikbaar, tot de servereigenaar beslist (teruggeven /
 * overdragen / verwijderen). Dat is beslissing 3 van de eigenaar, en het is niet aan deze functie om dat te omzeilen.
 * Idempotent, nooit blokkerend, en één keer per mens tegelijk.
 */
const bezig = new Set<string>();
const GRANT_TABELLEN_INTREKKEN = ['google_oauth_grant_v1'] as const;
const DIENST_TABELLEN_LOSKOPPELEN = ['provider_service_grants_v1', 'provider_service_tokens_v1', 'cloud_provider_accounts_v1'] as const;

export async function bevriezingAfdwingen(userId: string, reden: string): Promise<{ grants: number; diensten: number; abonnementen: number }> {
  const leeg = { grants: 0, diensten: 0, abonnementen: 0 };
  if (!userId || bezig.has(userId)) return leeg;
  bezig.add(userId);
  try {
    let grants = 0, diensten = 0, abonnementen = 0;
    for (const tbl of GRANT_TABELLEN_INTREKKEN) {
      grants += (await sys().query(
        `UPDATE app.records SET data = data || jsonb_build_object('grantStatus', 'revoked', 'revokedAt', $3::bigint, 'updatedAt', $3::bigint)
           WHERE tbl = $1 AND data->>'ownerUserId' = $2 AND data->>'ruimte' = 'technisch'
             AND COALESCE(data->>'grantStatus', '') <> 'revoked'`,
        [tbl, userId, Date.now()],
      )).rowCount ?? 0;
    }
    for (const tbl of DIENST_TABELLEN_LOSKOPPELEN) {
      diensten += (await sys().query(
        `UPDATE app.records SET data = data || jsonb_build_object('status', 'disconnected', 'disconnectedAt', $3::bigint, 'updatedAt', $3::bigint)
           WHERE tbl = $1 AND data->>'ownerUserId' = $2 AND data->>'ruimte' = 'technisch'
             AND COALESCE(data->>'status', '') <> 'disconnected'`,
        [tbl, userId, Date.now()],
      )).rowCount ?? 0;
    }
    abonnementen = (await sys().query(
      `UPDATE app.agenda_abonnement SET actief = false, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = 'technisch' AND actief`,
      [userId],
    )).rowCount ?? 0;
    if (grants || diensten || abonnementen) console.warn(`[ruimte-cloud-agenda] technische hmara/agenda ingetrokken (${reden}) voor ${userId}: grants=${grants} diensten=${diensten} abonnementen=${abonnementen}`);
    return { grants, diensten, abonnementen };
  } catch (err) { console.error('[ruimte-cloud-agenda] intrekken mislukt:', (err as Error).message); return leeg; }
  finally { bezig.delete(userId); }
}
// Weg 1: het verliezen van technische rechten (profiel ingetrokken, rol weg, account geblokkeerd of verwijderd).
// Weg 2 (passief): de poort hierboven, zodat een vergeten weg geen gat is.
bijTechRechtenVerlies((userId, oorzaak) => { void bevriezingAfdwingen(userId, String(oorzaak)); });

// ------------------------------------------------------------------------------------------------ buiten een verzoek: de cron
/**
 * MAG DEZE RIJ NOG LOPEN? De planners (icsCronRonde, caldavCronRonde, runGoogleSuiteCalendarSync) hebben geen
 * tabblad en geen sessie: zij lopen over rijen van alle mensen. Een rij van de PERSOONLIJKE lade mag altijd — daar
 * verandert niets. Een rij van de TECHNISCHE lade mag alleen zolang die lade open is: stand 'eigen' (een technische
 * rij bestaat alleen in die stand) én de technische rechten nog geldig. Zodra iemand zijn rechten kwijt is, stopt
 * de synchronisatie dus in de volgende ronde van zichzelf — bovenop het onmiddellijke bevriezen van de poort.
 * Bij elke twijfel of fout: NIET laten lopen.
 */
export async function ladeNogGeldig(userId: string, ruimte: unknown, dienst: DeelbareDienst): Promise<boolean> {
  if (!userId) return false;
  if (String(ruimte ?? 'prive') !== 'technisch') return true;
  try {
    if ((await standVan(userId, dienst)) !== 'eigen') return false;
    return (await technischeRechten(userId)).ok;
  } catch (err) { console.error('[ruimte-cloud-agenda] ladeNogGeldig onbepaalbaar, niet laten lopen:', (err as Error).message); return false; }
}

// ------------------------------------------------------------------------------------------------ overdragen en wissen
/**
 * DE UITVOERDERS (migratie 0087, register in backend/ruimte-scheiding.ts → registreerLadeUitvoerder).
 *
 * Het BESLUIT over een bevroren lade neemt de eigenaar van de server; het echte VERPLAATSEN of WISSEN kan alleen de
 * dienst zelf, want alleen die weet welke tabellen en welke bestanden hij heeft. Drie regels, uit de kop van het
 * register, en ze gelden hier allemaal:
 *   1. IDEMPOTENT — een tweede aanroep vindt niets meer en meldt `rijen: 0`, zonder fout;
 *   2. alleen de TECHNISCHE lade — elke query draagt `ruimte = 'technisch'`, elk bestand ligt onder het
 *      voorvoegsel van die lade. De persoonlijke lade van diezelfde mens kan niet geraakt worden, ook niet als de
 *      twee laden hetzelfde bestand ooit dezelfde naam gaven: het zijn twee bomen;
 *   3. mislukt het, dan gooien we — de stand blijft dan 'bevroren' (UITVOEREN_MISLUKT) in plaats van «overgedragen»
 *      te heten terwijl de gegevens er nog staan.
 *
 * OVERDRAGEN zet de rijen op de PERSOONLIJKE lade van de servereigenaar (`user_id = <eigenaar>, ruimte = 'prive'`):
 * daar kan hij er werkelijk bij. De bestanden verhuizen mee naar ZIJN persoonlijke boom; lukt het kopiëren van een
 * bestand niet, dan blijft het origineel staan en gooit de uitvoerder.
 */
export const RECORD_TABELLEN_CLOUD = ['cloud_workspaces_v1', 'cloud_items_v1', 'cloud_mappen_v1', 'cloud_taken_v1', 'foto_media_v1', 'foto_albums_v1', 'foto_import_v1', 'cloud_resume_v1', 'cloud_ai_decisions_v1', 'cloud_audit_v1'] as const;
const RECORD_TABELLEN_GOOGLE = [
  'provider_principals_v1', 'provider_service_grants_v1', 'provider_service_tokens_v1', 'google_oauth_grant_v1',
  'google_suite_onboarding_v1', 'cloud_provider_accounts_v1', 'cloud_provider_selections_v1',
  'google_suite_calendar_sync_state_v1', 'google_suite_calendar_events_v1',
  // De DRIVE-projectie en haar syncstand horen hier net zo hard bij als de agenda-spiegel: het zijn de BESTANDSNAMEN
  // en beschrijvingen van de technische Drive-rekening (backend/google-suite-sync.ts). Lieten we ze staan, dan bleef
  // na «overdragen» of «verwijderen» een lijst met technische bestandsnamen achter in de hub-blokken en in «Пошук усюди».
  'google_suite_drive_projection_v1', 'google_suite_sync_state_v1',
] as const;

/** Rijen in app.records (schemaloos) van één lade: verplaatsen naar de persoonlijke lade van `naarUserId`. */
type Uitvoerder = { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: any[] }> };
async function recordsOverdragen(tabellen: readonly string[], vanUserId: string, naarUserId: string, uitvoerder: Uitvoerder = sys()): Promise<LadeRegel[]> {
  const uit: LadeRegel[] = [];
  for (const tbl of tabellen) {
    const n = (await uitvoerder.query(
      `UPDATE app.records SET data = jsonb_set(jsonb_set(data, '{ownerUserId}', to_jsonb($3::text)), '{ruimte}', '"prive"')
         WHERE tbl = $1 AND data->>'ownerUserId' = $2 AND data->>'ruimte' = 'technisch'`,
      [tbl, vanUserId, naarUserId],
    )).rowCount ?? 0;
    uit.push({ tabel: `app.records/${tbl}`, rijen: n });
  }
  return uit;
}
async function recordsWissen(tabellen: readonly string[], userId: string): Promise<LadeRegel[]> {
  const uit: LadeRegel[] = [];
  for (const tbl of tabellen) {
    const n = (await sys().query(
      `DELETE FROM app.records WHERE tbl = $1 AND data->>'ownerUserId' = $2 AND data->>'ruimte' = 'technisch'`,
      [tbl, userId],
    )).rowCount ?? 0;
    uit.push({ tabel: `app.records/${tbl}`, rijen: n });
  }
  return uit;
}

/**
 * De paden van de technische hmara-lade: uit de rijen zelf, zodat we nooit iets wissen wat er niet bij hoort.
 * SEC-002 (aanv-ronde1-08): ook de paden van de vorige versies (versies[].pad, backend/cloud-vnext-bestanden.ts), die vroeger
 * buiten beeld bleven — bij «overdragen» bleven ze in de oude boom achter, zonder record dat er nog naar wees.
 */
async function technischePaden(userId: string): Promise<string[]> {
  const lade: Lade = { userId, ruimte: 'technisch' };
  const rijen = (await sys().query(
    `SELECT data->>'storagePath' AS pad FROM app.records
       WHERE tbl IN ('cloud_items_v1', 'foto_media_v1') AND data->>'ownerUserId' = $1 AND data->>'ruimte' = 'technisch' AND COALESCE(data->>'storagePath','') <> ''
     UNION
     SELECT v->>'pad' AS pad FROM app.records r, jsonb_array_elements(CASE WHEN jsonb_typeof(r.data->'versies') = 'array' THEN r.data->'versies' ELSE '[]'::jsonb END) v
       WHERE r.tbl IN ('cloud_items_v1', 'foto_media_v1') AND r.data->>'ownerUserId' = $1 AND r.data->>'ruimte' = 'technisch' AND COALESCE(v->>'pad','') <> ''`,
    [userId],
  )).rows as Array<{ pad: string }>;
  // Dubbel hek: alleen paden die werkelijk in DEZE lade liggen (padInLade), nooit een pad uit de persoonlijke boom.
  return [...new Set(rijen.map((r) => String(r.pad || '')).filter((p) => padInLade(p, lade)))];
}

/**
 * SEC-002 (aanv-ronde1-08): de technische hmara-lade overdragen aan `naarUserId`.
 * Vroeger: storage.read (heel bestand → base64 in het geheugen) + write + delete per pad; een bestand boven de leesgrens
 * (~384 MiB) gaf content null en werd als «al weg» overgeslagen, de vorige versies kwamen niet eens in de lijst — en daarna
 * werden ALLE rijen toch aan de nieuwe eigenaar gegeven, met paden buiten zijn lade. Nu:
 *  1. alle paden (huidige inhoud + versies) worden VERPLAATST (storage.verplaats: rename, nooit in het geheugen);
 *  2. faalt één verplaatsing, dan gaan de al verplaatste bestanden terug en volgt een fout VÓÓR enige rij verandert;
 *  3. pas dan krijgen de rijen hun nieuwe storagePath én versies[].pad, en daarna de nieuwe eigenaar en ruimte.
 * Переносимо файли без читання в пам'ять, разом із версіями; при збої — відкат і помилка до зміни записів.
 */
export async function cloudLadeOverdragen(vanUserId: string, naarUserId: string): Promise<LadeRegel[]> {
  const vanLade: Lade = { userId: vanUserId, ruimte: 'technisch' };
  const naarLade: Lade = { userId: naarUserId, ruimte: 'prive' };
  const paden = await technischePaden(vanUserId);
  const kaart = new Map<string, string>();
  for (const oud of paden) kaart.set(oud, `${cloudVoorvoegsel(naarLade)}/${oud.split('/').pop()}`);
  // 1 + 2: bestanden, alles of niets. `terug` = alles wat nu in de nieuwe lade staat en bij een fout terug moet
  // (ook «al-verplaatst» van een eerder afgebroken poging: de rijen wijzen dan nog naar het oude pad).
  const terug: Array<[string, string]> = [];
  let verplaatstAantal = 0, ontbrekend = 0;
  const terugzetten = async () => {
    let mislukt = 0;
    for (const [oud, nieuwPad] of [...terug].reverse()) {
      await storage.verplaats(nieuwPad, oud, { ownerId: vanUserId }).catch((e) => { mislukt += 1; console.error('[ruimte-cloud-agenda] terugzetten mislukt:', (e as Error).message); });
    }
    if (mislukt) console.error(`[ruimte-cloud-agenda] ${mislukt} bestand(en) konden niet terug; een nieuwe poging «overdragen» maakt het af`);
  };
  try {
    for (const [oud, nieuwPad] of kaart) {
      const uitkomst = await storage.verplaats(oud, nieuwPad, { ownerId: naarUserId });
      if (uitkomst === 'verplaatst') { terug.push([oud, nieuwPad]); verplaatstAantal += 1; }
      else if (uitkomst === 'al-verplaatst') terug.push([oud, nieuwPad]);
      else { ontbrekend += 1; kaart.delete(oud); }   // echt weg: het record houdt zijn (dode) pad
    }
  } catch (err) {
    await terugzetten();
    console.error('[ruimte-cloud-agenda] overdragen afgebroken:', (err as Error).message);
    throw new Error('CLOUD_LADE_BESTAND_OVERDRACHT_MISLUKT');
  }
  // 3a + 3b in ÉÉN transactie (toets-g11 №2): eerst de paden in de rijen (huidige inhoud en versies), dan eigenaar en ruimte.
  // Faalt er iets, dan ROLLBACK (geen enkele rij veranderd) en gaan de bestanden terug naar de oude lade.
  // Шляхи й власника змінюємо в одній транзакції; при збої — ROLLBACK і повернення файлів.
  const client = await sys().connect();
  let padRijen = 0;
  let regels: LadeRegel[];
  try {
    await client.query('BEGIN');
    const rijen = (await client.query(
      `SELECT tbl, id, data FROM app.records
         WHERE tbl IN ('cloud_items_v1', 'foto_media_v1') AND data->>'ownerUserId' = $1 AND data->>'ruimte' = 'technisch' FOR UPDATE`,
      [vanUserId],
    )).rows as Array<{ tbl: string; id: string; data: Record<string, unknown> }>;
    for (const rij of rijen) {
      const data = { ...(rij.data || {}) };
      let gewijzigd = false;
      const pad = String(data.storagePath || '');
      if (kaart.has(pad)) { data.storagePath = kaart.get(pad); gewijzigd = true; }
      if (Array.isArray(data.versies)) {
        data.versies = (data.versies as unknown[]).map((v) => {
          const versie = v && typeof v === 'object' ? v as Record<string, unknown> : null;
          const vPad = String(versie?.pad || '');
          if (!versie || !kaart.has(vPad)) return v;
          gewijzigd = true;
          return { ...versie, pad: kaart.get(vPad) };
        });
      }
      if (!gewijzigd) continue;
      await client.query(`UPDATE app.records SET data = $3::jsonb WHERE tbl = $1 AND id = $2`, [rij.tbl, rij.id, JSON.stringify(data)]);
      padRijen += 1;
    }
    regels = await recordsOverdragen([...RECORD_TABELLEN_CLOUD, ...RECORD_TABELLEN_GOOGLE], vanUserId, naarUserId, client as unknown as Uitvoerder);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    await terugzetten();
    console.error('[ruimte-cloud-agenda] rijen overdragen mislukt, teruggedraaid:', (err as Error).message);
    throw new Error('CLOUD_LADE_BESTAND_OVERDRACHT_MISLUKT');
  } finally {
    client.release();
  }
  return [...regels, {
    tabel: 'opslag/bestanden', rijen: verplaatstAantal,
    opmerking: `${cloudVoorvoegsel(vanLade)} → ${cloudVoorvoegsel(naarLade)} (${kaart.size} pad(en) incl. versies, ${padRijen} rij(en) bijgewerkt${ontbrekend ? `, ${ontbrekend} ontbrak(en) al` : ''})`,
  }];
}

registreerLadeUitvoerder({
  dienst: 'cloud', naam: 'cloud-platform',
  async overdragen({ vanUserId, naarUserId }) {
    return cloudLadeOverdragen(vanUserId, naarUserId);
  },
  async verwijderen({ userId }) {
    const lade: Lade = { userId, ruimte: 'technisch' };
    // Twee bronnen, bewust: (a) de paden die in de rijen staan, (b) ALLES wat onder het voorvoegsel van deze lade
    // ligt. (b) vangt de wezen — een bestand dat eerder werd geschreven terwijl het opslaan van de rij mislukte.
    // Allebei lopen uitsluitend door de boom van DEZE lade, dus de persoonlijke boom is onbereikbaar.
    const uitRijen = await technischePaden(userId);
    const uitBoom: string[] = [];
    try {
      let token: string | undefined;
      do {
        const blad = await storage.list({ prefix: `${cloudVoorvoegsel(lade)}/`, limit: 1000, ...(token ? { nextToken: token } : {}) });
        for (const p of blad.paths) if (padInLade(p, lade)) uitBoom.push(p);
        token = blad.nextToken;
      } while (token && uitBoom.length < 20_000);
    } catch (err) { console.error('[ruimte-cloud-agenda] opslag doorlopen mislukt:', (err as Error).message); }
    const paden = [...new Set([...uitRijen, ...uitBoom])];
    const bestanden = paden.length ? (await storage.delete(paden)).filter(Boolean).length : 0;
    const regels = await recordsWissen([...RECORD_TABELLEN_CLOUD, ...RECORD_TABELLEN_GOOGLE], userId);
    return [...regels, { tabel: 'opslag/bestanden', rijen: bestanden, opmerking: `${cloudVoorvoegsel(lade)} (${paden.length} pad(en))` }];
  },
});

/** De agenda: drie echte tabellen (0076 + 0084) plus de Google-spiegel en de syncstand (records). */
const AGENDA_TABELLEN = ['agenda_koppeling', 'agenda_abonnement', 'agenda_externe_gebeurtenis'] as const;
const AGENDA_RECORDS = ['google_suite_calendar_events_v1', 'google_suite_calendar_sync_state_v1'] as const;

registreerLadeUitvoerder({
  dienst: 'agenda', naam: 'agenda',
  async overdragen({ vanUserId, naarUserId }) {
    const uit: LadeRegel[] = [];
    // ÉÉN BOTSING IS ECHT MOGELIJK: `agenda_abonnement_adres_ruimte_idx` staat één adres per lade toe, dus als de
    // eigenaar hetzelfde rooster al persoonlijk volgt, kan de technische rij daar niet naast. Dan verliest de
    // TECHNISCHE rij (de eigenaar heeft dat abonnement immers al, er gaat niets voor hem verloren) en verdwijnt ze
    // met haar gespiegelde afspraken. Dat staat in het verslag, zodat het besluit niet stiller is dan het is.
    const botsend = (await sys().query(
      `SELECT t.id FROM app.agenda_abonnement t
         WHERE t.user_id = $1 AND t.ruimte = 'technisch'
           AND EXISTS (SELECT 1 FROM app.agenda_abonnement e
                        WHERE e.user_id = $2 AND e.ruimte = 'prive' AND e.bron = t.bron AND e.adres = t.adres)`,
      [vanUserId, naarUserId],
    )).rows.map((r: { id: unknown }) => String(r.id));
    if (botsend.length) {
      await sys().query(`DELETE FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND ruimte = 'technisch' AND abonnement_id = ANY($2::text[])`, [vanUserId, botsend]);
      await sys().query(`DELETE FROM app.agenda_abonnement WHERE user_id = $1 AND ruimte = 'technisch' AND id = ANY($2::text[])`, [vanUserId, botsend]);
      uit.push({ tabel: 'app.agenda_abonnement', rijen: botsend.length, opmerking: 'de eigenaar volgde dit adres al persoonlijk: de technische inschrijving is gewist, niet verplaatst' });
    }
    for (const t of AGENDA_TABELLEN) {
      const n = (await sys().query(
        `UPDATE app.${t} SET user_id = $2, ruimte = 'prive' WHERE user_id = $1 AND ruimte = 'technisch'`,
        [vanUserId, naarUserId],
      )).rowCount ?? 0;
      uit.push({ tabel: `app.${t}`, rijen: n });
    }
    return [...uit, ...await recordsOverdragen(AGENDA_RECORDS, vanUserId, naarUserId)];
  },
  async verwijderen({ userId }) {
    const uit: LadeRegel[] = [];
    for (const t of AGENDA_TABELLEN) {
      const n = (await sys().query(`DELETE FROM app.${t} WHERE user_id = $1 AND ruimte = 'technisch'`, [userId])).rowCount ?? 0;
      uit.push({ tabel: `app.${t}`, rijen: n });
    }
    return [...uit, ...await recordsWissen(AGENDA_RECORDS, userId)];
  },
});
