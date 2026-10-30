// POST EN CONTACTEN IN TWEE GESCHEIDEN GEGEVENSRUIMTES (opdracht van de eigenaar, 20.10.2026; kern: shared/ruimte-scheiding.ts,
// backend/ruimte-scheiding.ts, migraties 0082 + 0083).
//
// WAT HIER STAAT EN WAAROM HET ÉÉN BESTAND IS
//   De kern beslist UIT WELKE LADE een verzoek mag lezen en schrijven (gegevensLade). Zij weet niet welke tabellen post en
//   contacten hebben, en ook niet welke routes daarbij horen. Dat staat hier, op één plek:
//     1. DE POORT VOOR ELKE ROUTE — metMailRuimte() hangt vóór elke post- en contactenroute dezelfde controle. Er is geen
//        tweede weg: een nieuwe route die onder /api/owner/mail/ of /api/owner/contacten/ komt te staan, wordt automatisch
//        gepoort, en wie haar wil vrijstellen moet dat hieronder met naam en reden opschrijven (VRIJ_VAN_POORT).
//     2. DE LADE VAN DE LOPENDE AANROEP — metLade()/huidigeLade(), in een AsyncLocalStorage. Zo hoeft niet elke functie in de
//        hele postlaag een extra argument te krijgen, en kan er ook geen oude aanroep «vergeten» worden: wie de lade NIET
//        vindt, krijgt een fout (ladeVereist) in plaats van stil de persoonlijke gegevens.
//     3. WELKE MAILBOX IN WELKE LADE ZIT — app.mail_ruimte_account (0083). Een mailbox zonder rij is persoonlijk: daarom
//        raakt niemand bij de overstap iets kwijt, en begint de technische ruimte leeg.
//     4. WAT ER MET EEN BEVROREN LADE GEBEURT — de twee uitvoerders (mail en contacten) die de kern opvraagt bij
//        «передати собі» en «видалити» (registreerLadeUitvoerder). Het echte verplaatsen en wissen kan alleen een dienst
//        die zijn eigen tabellen kent; de kern levert het mechanisme, hier staat het werk.
//
// «GEDEELD» BETEKENT HIER ECHT HET PERSOONLIJKE ADRES, GEEN KOPIE
//   Staat post op 'gedeeld', dan geeft de poort de PERSOONLIJKE lade terug ({ userId, ruimte: 'prive' }). De technische ruimte
//   leest en schrijft dan letterlijk dezelfde rijen en gebruikt dezelfde Google-koppeling als de mens zelf — er wordt niets
//   gedupliceerd en niets gesynchroniseerd. Daardoor is losmaken ook meteen echt: de poort geeft die lade niet meer terug, en
//   er blijft geen kopie achter die nog iets zou kunnen tonen.
import { getPool } from '../server/platform/pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { error } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { gegevensLade, registreerLadeUitvoerder, type LadeRegel } from './ruimte-scheiding';
import { hoortBij, ladeFilter, sqlLadeWaar, type DeelbareDienst, type Lade, type LadeBesluit } from '../shared/ruimte-scheiding';
import { huidigeRuimte } from './mcp-namens';

const sys = () => getPool('systeem');

// ------------------------------------------------------------------------------------------------ de lade van deze aanroep
type Gebonden = { lade: Lade; dienst: DeelbareDienst };
const opslag = new AsyncLocalStorage<Gebonden>();

/** Voer `fn` uit met deze lade gebonden. Gebruikt door de poort en door elke achtergrondtaak die na het verzoek doorloopt. */
export const metLade = <T>(lade: Lade, dienst: DeelbareDienst, fn: () => Promise<T>): Promise<T> => opslag.run({ lade, dienst }, fn);
/** De lade van de lopende aanroep, of null. Nooit een stille terugval op de persoonlijke lade: dat beslist de aanroeper. */
export const huidigeLade = (userId?: string): Lade | null => {
  const g = opslag.getStore();
  if (!g) return null;
  return userId && g.lade.userId !== userId ? null : g.lade;
};
/** Welke dienst poortte deze aanroep ('mail' of 'contacten')? Alleen voor logregels en uitleg. */
export const huidigeLadeDienst = (): DeelbareDienst | null => opslag.getStore()?.dienst ?? null;

export class MailRuimteFout extends Error { constructor(public code: string, public status = 403, public uitleg?: { uk: string; nl: string }) { super(code); } }

/**
 * De lade die DEZE aanroep mag gebruiken, of een fout. Elke opslagfunctie van post en contacten begint hiermee.
 * Is er geen lade gebonden, dan is deze aanroep NIET door de poort gekomen: dat is een programmeerfout en geen reden om de
 * persoonlijke gegevens te geven. Daarom een harde fout (500) in plaats van een gok.
 */
/**
 * ALLEEN VOOR EENHEIDSTESTEN die de POSTLAAG zelf nameten en niet de poort: zij roepen de opslagfuncties rechtstreeks aan,
 * zonder route en dus zonder gebonden lade. Met deze schakelaar aan betekent «geen lade» de PERSOONLIJKE lade — exact wat die
 * tests altijd bedoelden. Hij staat standaard UIT en wordt nergens in de site aangezet; de test van de scheiding zelf
 * (tests/eenheid/ruimte-mail-20261020.test.ts) laat hem uit en bewijst daarmee dat de opslag zonder poort niets geeft.
 */
let zonderPoortIsPrive = false;
export const _zonderPoortIsPrive = (aan: boolean) => { zonderPoortIsPrive = aan === true; };

export function ladeVereist(userId: string): Lade {
  const l = huidigeLade(userId);
  if (!l && zonderPoortIsPrive && userId) return { userId, ruimte: 'prive' };
  if (!l) throw new MailRuimteFout('RUIMTE_POORT_ONTBREEKT', 500, {
    uk: 'Внутрішня помилка: цей запит пошти не пройшов через браму просторів, тому дані не видані.',
    nl: 'Interne fout: dit postverzoek kwam niet door de ruimtepoort, dus er zijn geen gegevens gegeven.',
  });
  return l;
}
/**
 * De PERSOONLIJKE lade, uitdrukkelijk. Bedoeld voor werk dat niet bij één mens in één tabblad hoort en dat zelf al per rij
 * weet in welke lade het staat: de webhooks van Google en Microsoft (die horen bij een opgeslagen mailbox, niet bij een
 * sessie) en de verzendwachtrij-cron (die loopt over rijen van alle mensen). Zij mogen nooit de technische lade kiezen.
 *
 * Vandaag roept nog niets dit aan en dat hoeft ook niet: die drie wegen adresseren hun rijen op `id` of op de opgeslagen
 * mailbox, en waar zij tóch een lade nodig hebben (postRecordsVanLade) is «geen lade» al de persoonlijke. Deze functie is
 * er voor het moment dat zo'n weg wél iets per mens moet lezen: dan staat het er UITDRUKKELIJK en niet per ongeluk.
 */
export const metPriveLade = <T>(userId: string, dienst: DeelbareDienst, fn: () => Promise<T>): Promise<T> =>
  metLade({ userId, ruimte: 'prive' }, dienst, fn);

// ------------------------------------------------------------------------------------------------ welke route welke dienst is
/** Contacten en afzenders zijn de dienst «contacten»; al het andere onder /mail/ is de dienst «mail». */
export const dienstVoorPad = (pad: string): DeelbareDienst =>
  /\/(contacten|afzenders)(\/|$)/.test(pad) ? 'contacten' : 'mail';
/** Hoort dit pad bij post of contacten? */
export const isPostPad = (pad: string): boolean => /^\/api\/owner\/mail(\/|$)/.test(pad) || /^\/api\/owner\/contacten(\/|$)/.test(pad);

/**
 * De ENIGE routes van post die buiten de poort blijven, met de reden erbij. De eenheidstest vergelijkt deze lijst letterlijk,
 * zodat er nooit stil een route bijkomt:
 *   • de twee provider-webhooks: die komen van Google en Microsoft, hebben geen sessie en geen tabblad, en raken alleen de
 *     mailbox die in de rij staat (met de ruimte die daar al staat). Zij lezen of tonen nooit iets aan een mens.
 */
// *  • /api/owner/mail/ruimte zelf: die route GEEFT GEEN POST, maar vertelt in welke ruimte de mens is en waarom een dienst
//      leeg is. Juist als post of contacten uit of bevroren staan, moet zij nog leesbaar zijn — anders zou het scherm wéér
//      een leeg vlak zijn in plaats van een uitleg (zelfde reden als /api/owner/ruimte/overzicht in de kern).
export const VRIJ_VAN_POORT: readonly string[] = Object.freeze([
  'POST /api/owner/mail/google/pubsub/push',
  'POST /api/owner/mail/microsoft/webhook',
  'POST /api/owner/mail/ruimte',
]);

// ------------------------------------------------------------------------------------------------ DE POORT VOOR ROUTES
type Auth = { user: { id: string; role?: string; status?: string }; service?: string };
type Autoriseer = (event: Record<string, unknown>, body: unknown) => Promise<Auth | { errorCode: string }>;
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});

/**
 * De lade voor dit verzoek bepalen. De ruimte komt NOOIT uit de body: gegevensLade leest rol, status, profiel en de lopende
 * activering zelf uit de database. Het verzoek mag alleen zijn HERKOMST noemen — het tabblad, of (voor een MCP-aanroep zonder
 * tabblad) de ruimte van de AI-verbinding uit backend/mcp-namens.ts. Beide kunnen de lade uitsluitend VERKLEINEN.
 */
export async function ladeVoorVerzoek(userId: string, dienst: DeelbareDienst, body: unknown): Promise<LadeBesluit> {
  const tab = String(bodyOf(body).tabContext || '');
  return gegevensLade({ userId, tabContext: tab || null, aiRuimte: tab ? null : huidigeRuimte(), dienst });
}

/**
 * Hang de poort vóór elke post- en contactenroute van een routetabel. Zelfde vorm als wrapFactoryMutations (backend/rbac.ts):
 * de tabel gaat erin, dezelfde tabel met een extra eerste schakel komt eruit. Routes die niet bij post horen blijven ongemoeid.
 *
 * Wat de poort doet, in deze orde:
 *   1. de sessie controleren (zonder sessie is er geen mens en dus geen lade);
 *   2. de lade opvragen bij de kern. Weigert zij, dan krijgt de mens de TWEETALIGE UITLEG mee — nooit een leeg scherm en
 *      nooit een lege lijst die er «normaal» uitziet;
 *   3. de rest van de keten uitvoeren MET die lade gebonden, zodat elke opslagfunctie eronder in de juiste lade werkt.
 */
export function metMailRuimte(routes: Record<string, RouterMiddleware[]>, autoriseer: Autoriseer): Record<string, RouterMiddleware[]> {
  const uit: Record<string, RouterMiddleware[]> = {};
  for (const [sleutel, keten] of Object.entries(routes || {})) {
    const lijst = Array.isArray(keten) ? keten : [keten as RouterMiddleware];
    const pad = sleutel.replace(/^[A-Z]+\s+/, '');
    if (!isPostPad(pad) || VRIJ_VAN_POORT.includes(sleutel)) { uit[sleutel] = lijst; continue; }
    const dienst = dienstVoorPad(pad);
    const poort: RouterMiddleware = async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const auth = await autoriseer(ctx.event, ctx.body);
      if (!auth || (typeof auth === 'object' && 'errorCode' in auth)) {
        const code = String((auth as { errorCode?: string })?.errorCode || 'OWNER_SESSION_REQUIRED');
        return error(code, code.includes('FORBIDDEN') ? 403 : 401);
      }
      const besluit = await ladeVoorVerzoek(String(auth.user?.id || ''), dienst, ctx.body);
      if (!besluit.ok) return { statusCode: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: besluit.code, dienst, uitleg: besluit.uitleg }) };
      return metLade(besluit.lade, dienst, async () => {
        for (const schakel of lijst) {
          const res = await schakel(raw);
          if (res) return res;
        }
        return undefined;
      });
    };
    uit[sleutel] = [poort];
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ welke mailbox in welke lade
/**
 * De gekoppelde mailboxen die bij DEZE lade horen. De koppeling zelf (één Google-account dat ook schijf en agenda gebruikt,
 * backend/google-suite-inrichting.ts) blijft onaangeroerd: hier staat alleen de VERMELDING welke mailbox in de technische
 * ruimte verbonden is. Geen vermelding = persoonlijk, dus:
 *   • de persoonlijke lade ziet alles wat NIET technisch vermeld is (alle bestaande mailboxen, zoals altijd);
 *   • de technische lade ziet UITSLUITEND wat daar uitdrukkelijk verbonden is — leeg tot de mens dat zelf doet.
 */
export async function mailboxenInLade<T extends { id: string }>(lade: Lade, alle: readonly T[]): Promise<T[]> {
  const techniek = await technischeMailboxen(lade.userId);
  return lade.ruimte === 'technisch' ? alle.filter((a) => techniek.has(String(a.id))) : alle.filter((a) => !techniek.has(String(a.id)));
}
/** De id's van de mailboxen die in de technische ruimte van deze mens verbonden zijn. Een fout geeft een lege verzameling:
 *  dan ziet de technische lade niets en de persoonlijke alles — de veilige richting. */
export async function technischeMailboxen(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const rows = (await sys().query(`SELECT account_id FROM app.mail_ruimte_account WHERE user_id = $1 AND ruimte = 'technisch'`, [userId])).rows;
    return new Set(rows.map((r: { account_id: unknown }) => String(r.account_id)));
  } catch (err) { console.error('[mail-ruimte] mailboxen van de technische ruimte onleesbaar, geen enkele:', (err as Error).message); return new Set(); }
}
/** Een mailbox in deze lade vermelden. Voor de persoonlijke lade is er niets te doen (geen vermelding = persoonlijk). */
export async function mailboxInLadeZetten(lade: Lade, accountId: string, email = '', doorId = ''): Promise<void> {
  if (!lade.userId || !accountId) return;
  if (lade.ruimte !== 'technisch') { await mailboxUitLade(lade.userId, accountId); return; }
  await sys().query(`INSERT INTO app.mail_ruimte_account (user_id, ruimte, account_id, account_email, verbonden_door)
    VALUES ($1, 'technisch', $2, $3, $4) ON CONFLICT (user_id, ruimte, account_id)
    DO UPDATE SET account_email = EXCLUDED.account_email, verbonden_op = now(), verbonden_door = EXCLUDED.verbonden_door`,
    [lade.userId, accountId, String(email || '').slice(0, 254).toLowerCase(), String(doorId || lade.userId).slice(0, 200)]);
}
/** De vermelding weghalen: de mailbox is daarna weer (alleen) persoonlijk. */
export const mailboxUitLade = async (userId: string, accountId: string): Promise<void> => {
  await sys().query(`DELETE FROM app.mail_ruimte_account WHERE user_id = $1 AND ruimte = 'technisch' AND account_id = $2`, [userId, accountId]);
};

// ------------------------------------------------------------------------------------------------ uitvoerders: overdragen en wissen
/**
 * De tabellen van elke dienst, met de kolom waarop «dezelfde rij» wordt herkend. Die tweede kolom is nodig bij OVERDRAGEN:
 * de eigenaar kan dat adres of die mailbox zelf al persoonlijk hebben, en dan mag de overdracht zijn eigen rij nooit
 * overschrijven. Zulke rijen worden overgeslagen en apart in het verslag gemeld, in plaats van stil iets kwijt te raken.
 */
type Tabel = { tabel: string; sleutel: string | null };
const TABELLEN: Readonly<Record<'mail' | 'contacten', readonly Tabel[]>> = Object.freeze({
  contacten: Object.freeze([
    { tabel: 'app.mail_afzenders', sleutel: 'adres' },
    { tabel: 'app.mail_domein_dns', sleutel: 'domein' },
    { tabel: 'app.mail_contacten_scan', sleutel: 'account_id' },
    { tabel: 'app.mail_contacten_scan_beleid', sleutel: null },
    { tabel: 'app.mail_afzender_audit', sleutel: null },
  ]),
  mail: Object.freeze([
    { tabel: 'app.mail_drafts', sleutel: 'local_id' },
    { tabel: 'app.mail_queue', sleutel: null },
    { tabel: 'app.mail_ruimte_account', sleutel: 'account_id' },
    // 0093: foto's van afzenders (adres als HMAC). De keuzes Gravatar/Google (app.afzender_beeld_voorkeur, één rij per lade, geen
    // inhoud) staan hier bewust niet: één rij per (mens, ruimte) zou bij overdragen botsen met de rij van de eigenaar.
    { tabel: 'app.afzender_beeld', sleutel: 'adres_hash' },
  ]),
});
/** De recordtabellen van post (app.records, één jsonb per rij): de koppelingen, de berichten en hun afgeleiden. */
const RECORD_TABELLEN: readonly string[] = Object.freeze([
  'mail_accounts_v1', 'mail_items_v1', 'mail_view_preferences_v1', 'mail_state_intents_v1', 'mail_state_intent_events_v1',
  'mail_oauth_tokens_v2', 'mail_sync_state_v2', 'mail_provider_subscriptions_v2', 'mail_provider_labels_v2',
  'mail_provider_threads_v2', 'mail_notification_preferences_v1', 'mail_resume_v1', 'mail_metrics_v1',
  'google_suite_mail_selections_v1',
]);

const GELDIGE_TABEL = /^app\.[a-z_]{3,60}$/;
const GELDIGE_KOLOM = /^[a-z_][a-z0-9_]{0,40}$/;

/** Hoeveel rijen staan er in deze lade? (voor het verslag, en zodat «niets te doen» ook echt 0 meldt). */
async function tel(tabel: string, lade: Lade): Promise<number> {
  if (!GELDIGE_TABEL.test(tabel)) return 0;
  const r = await sys().query(`SELECT count(*)::int AS n FROM ${tabel} WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId]);
  return Number(r.rows[0]?.n || 0);
}

/**
 * Eén tabel overdragen aan de servereigenaar: de rijen van de TECHNISCHE lade worden rijen van die eigenaar in zijn
 * PERSOONLIJKE lade. Botst een rij met een rij die de eigenaar al heeft, dan blijft die van de eigenaar staan en wordt de
 * technische rij gewist (zij is immers overgedragen én al aanwezig); het verslag noemt dat apart.
 * Idempotent: een tweede aanroep vindt niets meer en meldt 0.
 */
async function tabelOverdragen(t: Tabel, lade: Lade, naarUserId: string): Promise<LadeRegel[]> {
  if (!GELDIGE_TABEL.test(t.tabel) || (t.sleutel && !GELDIGE_KOLOM.test(t.sleutel))) return [];
  const waar = sqlLadeWaar('ruimte', lade, 1);
  let dubbel = 0;
  if (t.sleutel) {
    dubbel = (await sys().query(
      `DELETE FROM ${t.tabel} b WHERE ${waar.replace(/user_id/g, 'b.user_id').replace(/\bruimte\b/g, 'b.ruimte')}
         AND EXISTS (SELECT 1 FROM ${t.tabel} e WHERE e.user_id = $2 AND COALESCE(e.ruimte, 'prive') = 'prive' AND e.${t.sleutel} = b.${t.sleutel})`,
      [lade.userId, naarUserId])).rowCount ?? 0;
  }
  const n = (await sys().query(`UPDATE ${t.tabel} SET user_id = $2, ruimte = 'prive' WHERE ${waar}`, [lade.userId, naarUserId])).rowCount ?? 0;
  const regel: LadeRegel = { tabel: t.tabel, rijen: n };
  return dubbel ? [regel, { tabel: t.tabel, rijen: dubbel, opmerking: 'al aanwezig bij de eigenaar: technische rij gewist' }] : [regel];
}
/** Eén tabel wissen: alleen de rijen van de TECHNISCHE lade. De persoonlijke lade van diezelfde mens blijft altijd heel. */
async function tabelWissen(t: Tabel, lade: Lade): Promise<LadeRegel[]> {
  if (!GELDIGE_TABEL.test(t.tabel)) return [];
  const n = (await sys().query(`DELETE FROM ${t.tabel} WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId])).rowCount ?? 0;
  return [{ tabel: t.tabel, rijen: n }];
}

/** De recordtabellen: dezelfde twee handelingen, maar via de recordlaag (`ruimte` staat daar in de jsonb; ontbreekt hij, dan
 *  is de rij persoonlijk — vandaar `hoortBij` in plaats van alleen het filter). */
async function recordsOverdragen(lade: Lade, naarUserId: string): Promise<LadeRegel[]> {
  const { db } = await import('../server/platform');
  const regels: LadeRegel[] = [];
  for (const tabel of RECORD_TABELLEN) {
    const { items } = await db.list<Record<string, unknown>>(tabel, { filter: ladeFilter(lade), limit: 5000 });
    const mijn = items.filter((r) => hoortBij(r as { ownerUserId?: unknown; ruimte?: unknown }, lade));
    if (!mijn.length) { regels.push({ tabel, rijen: 0 }); continue; }
    const uit = await db.update(tabel, mijn.map(({ id, ...rest }) => ({ id: String(id), record: { ...rest, ownerUserId: naarUserId, ruimte: 'prive' } })));
    regels.push({ tabel, rijen: uit.filter(Boolean).length });
  }
  return regels;
}
async function recordsWissen(lade: Lade): Promise<LadeRegel[]> {
  const { db } = await import('../server/platform');
  const regels: LadeRegel[] = [];
  for (const tabel of RECORD_TABELLEN) {
    const { items } = await db.list<Record<string, unknown>>(tabel, { filter: ladeFilter(lade), limit: 5000 });
    const mijn = items.filter((r) => hoortBij(r as { ownerUserId?: unknown; ruimte?: unknown }, lade));
    if (!mijn.length) { regels.push({ tabel, rijen: 0 }); continue; }
    const uit = await db.delete(tabel, mijn.map((r) => String(r.id)));
    regels.push({ tabel, rijen: uit.filter(Boolean).length });
  }
  return regels;
}

const uitvoerderVoor = (dienst: 'mail' | 'contacten') => ({
  dienst: dienst as DeelbareDienst, naam: `mail-ruimte-${dienst}`,
  async overdragen({ naarUserId, lade }: { vanUserId: string; naarUserId: string; lade: Lade }): Promise<LadeRegel[]> {
    const regels: LadeRegel[] = [];
    for (const t of TABELLEN[dienst]) regels.push(...await tabelOverdragen(t, lade, naarUserId));
    if (dienst === 'mail') regels.push(...await recordsOverdragen(lade, naarUserId));
    return regels;
  },
  async verwijderen({ lade }: { userId: string; lade: Lade }): Promise<LadeRegel[]> {
    const regels: LadeRegel[] = [];
    for (const t of TABELLEN[dienst]) regels.push(...await tabelWissen(t, lade));
    if (dienst === 'mail') regels.push(...await recordsWissen(lade));
    return regels;
  },
});
// Eén keer, bij het laden van deze module (backend/index.ts importeert haar). De kern vraagt de uitvoerders pas op als de
// servereigenaar werkelijk «передати собі» of «видалити» kiest.
registreerLadeUitvoerder(uitvoerderVoor('mail'));
registreerLadeUitvoerder(uitvoerderVoor('contacten'));

/** Hoeveel staat er in de technische lade van post en contacten? Voor het scherm van de eigenaar bij een bevroren lade. */
export async function ladeOmvang(userId: string, dienst: 'mail' | 'contacten'): Promise<{ tabel: string; rijen: number }[]> {
  const lade: Lade = { userId, ruimte: 'technisch' };
  const uit: { tabel: string; rijen: number }[] = [];
  for (const t of TABELLEN[dienst]) { try { uit.push({ tabel: t.tabel, rijen: await tel(t.tabel, lade) }); } catch { uit.push({ tabel: t.tabel, rijen: 0 }); } }
  return uit;
}

// ------------------------------------------------------------------------------------------------ de recordtabellen van post
/**
 * De recordtabellen (app.records: mail_accounts_v1, mail_items_v1, …) hebben geen kolom maar een VELD `ruimte` in hun jsonb.
 * Ontbreekt dat veld, dan is de rij persoonlijk — dus elke rij die er nu staat, blijft persoonlijk (shared/ruimte-scheiding.ts
 * → hoortBij). Deze drie helpers zijn alles wat backend/index.ts nodig heeft.
 *
 * Geen lade gebonden? Dan loopt deze aanroep buiten de poort: een cron of een provider-webhook. Die krijgen de PERSOONLIJKE
 * lade, nooit de technische — dezelfde richting als de rest van dit ontwerp: bij twijfel niets uit de technische ruimte.
 */
const ladeOfPrive = (userId: string): Lade => huidigeLade(userId) ?? { userId, ruimte: 'prive' };
/** Alleen de rijen die bij de lade van deze aanroep horen. */
export const postRecordsVanLade = <T extends object>(userId: string, rijen: readonly T[]): T[] => {
  const lade = ladeOfPrive(userId);
  return rijen.filter((r) => hoortBij(r as { ownerUserId?: unknown; ruimte?: unknown }, lade));
};
/** Eén rij, of null als zij niet bij deze lade hoort (vervangt de oude controle `raw.ownerUserId === userId`). */
export const postRecordVanLade = <T extends object>(userId: string, rij: T | null | undefined): T | null => {
  if (!rij) return null;
  return hoortBij(rij as { ownerUserId?: unknown; ruimte?: unknown }, ladeOfPrive(userId)) ? rij : null;
};
/** De velden die een NIEUWE postrij meekrijgt: de eigenaar en de ruimte waarin hij gemaakt is. */
export const postRecordVelden = (userId: string): { ownerUserId: string; ruimte: 'prive' | 'technisch' } => {
  const lade = ladeOfPrive(userId);
  return { ownerUserId: lade.userId, ruimte: lade.ruimte === 'technisch' ? 'technisch' : 'prive' };
};
