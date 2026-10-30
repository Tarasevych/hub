// Google Calendar → de spiegel van de hub: INCREMENTELE synchronisatie per agenda.
//
// Hoe het werkt (Google's «sync»-handleiding):
//   • De eerste keer: events.list zonder syncToken, pagina voor pagina (nextPageToken). Op de LAATSTE pagina
//     geeft Google een `nextSyncToken`; die bewaren we.
//   • Daarna: events.list MET dat syncToken. Google stuurt dan alleen wat veranderd is, inclusief de gewiste
//     afspraken (daarom moet `showDeleted` true blijven; op false weigert Google de incrementele vraag).
//   • Alle andere parameters moeten GELIJK blijven aan de eerste vraag, en een aantal mag niet mee
//     (orderBy, q, timeMin, timeMax, updatedMin, iCalUID): die staan hier dus nergens.
//   • 410 GONE = het token is verlopen of de rechten zijn veranderd. Dan gooien we de spiegel van DIE agenda weg
//     en beginnen we opnieuw met een volledige synchronisatie. Dat staat in de stand als `recoveryRequired`.
//
// Tweerichtings: wat hier binnenkomt is de waarheid (shared/agenda-model.ts → WAARHEIDSBRON). Daarom bewaren we
// bij elke afspraak de `etag`: backend/agenda-google.ts stuurt die als If-Match mee, zodat een wijziging die in
// Google is gedaan nooit stil wordt overschreven. Wat WIJ schrijven, zetten we meteen zelf in de spiegel
// (write-through) én komt bij de volgende synchronisatie nog eens langs — beide keren met hetzelfde id, dus
// zonder dubbele rij.
//
// Per agenda een eigen syncToken (zo wil Google het). De stand van vóór 20.10.2026 had geen `calendarId`; die
// rijen gelden als de hoofdagenda ('primary'), zodat een bestaande installatie niet opnieuw alles ophaalt.
import { db } from '../server/platform';
import { AGENDA_LEES_SCOPE, googleSuiteAgendaScopeStatus, googleSuitePrincipalAccessToken } from './google-suite-inrichting';
import { AGENDA_SPIEGEL_TABEL, spiegelLeg, spiegelRijUitGoogle } from './agenda-spiegel';
// GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084). De synchronisatie loopt in de lade van de PRINCIPAL: een
// technische Google-koppeling vult de technische spiegel en een persoonlijke de persoonlijke, met per lade een eigen
// syncToken. Voor een technische lade wordt eerst gevraagd of die nog open is (`ladeNogGeldig`): zodra iemand zijn
// technische rechten kwijt is, stopt ook de ACHTERGROND met lezen — niet alleen de knop op de pagina.
import { hoortBij, ladeFilter, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { ladeNogGeldig, ladeOf, metLade } from './ruimte-cloud-agenda';
import { journaalTellen, kluisStand } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE } from '../shared/sleutelkluis';

/** `ruimte`: de lade van deze koppeling. Ontbreekt hij (rij van vóór 0084), dan is de koppeling persoonlijk. */
type Principal = { id: string; ownerUserId: string; ruimte?: string; accountRole: string };
const ladeVan = (p: Principal): Lade => ({ userId: p.ownerUserId, ruimte: p.ruimte === 'technisch' ? 'technisch' : 'prive' });
type State = {
  id: string; ownerUserId: string; ruimte: 'prive' | 'technisch'; principalId: string; service: 'calendar'; calendarId: string;
  phase: 'initial' | 'incremental'; syncToken: string; pageToken: string;
  lastAttemptAt: number; lastSuccessAt: number; errorCode: string; recoveryRequired: boolean;
  createdAt: number; updatedAt: number;
};

const PRINCIPALS = 'provider_principals_v1';
const STATES = 'google_suite_calendar_sync_state_v1';
/** Hoeveel agenda's we hoogstens per account bijhouden (de lijst is gesorteerd: de hoofdagenda eerst). */
const MAX_AGENDAS = 10;
/** Precies de velden die de spiegel nodig heeft — `etag` is voor de versiecontrole bij schrijven. */
const VELDEN = 'nextPageToken,nextSyncToken,items(id,etag,iCalUID,status,summary,description,location,start,end,htmlLink,updated,recurrence,organizer(email),attendees(email,displayName,responseStatus,self,optional,organizer))';

const kort = (value: unknown, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const metId = <T extends object>(id: string, value: T): T & { id: string } => ({ ...value, id });

/** De stand van één (account, agenda). Rijen zonder calendarId horen bij de hoofdagenda. */
const standVoor = async (p: Principal, calendarId: string) => {
  const lade = ladeVan(p);
  const rijen = (await db.list<Omit<State, 'id'>>(STATES, { filter: { ...ladeFilter(lade), principalId: p.id, service: 'calendar' } })).items as State[];
  const treffer = rijen
    .filter((rij) => hoortBij(rij as Record<string, unknown>, lade) && (kort(rij.calendarId, 500) || 'primary') === calendarId)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  return treffer || null;
};
const standSchrijf = async (p: Principal, calendarId: string, patch: Partial<State>) => {
  const huidig = await standVoor(p, calendarId), nu = Date.now();
  const rij = {
    ...ladeVelden(ladeVan(p)), principalId: p.id, service: 'calendar' as const, calendarId,
    phase: patch.phase || huidig?.phase || ('initial' as const),
    syncToken: kort(patch.syncToken ?? huidig?.syncToken ?? '', 2000),
    pageToken: kort(patch.pageToken ?? huidig?.pageToken ?? '', 2000),
    lastAttemptAt: Number(patch.lastAttemptAt ?? huidig?.lastAttemptAt ?? 0),
    lastSuccessAt: Number(patch.lastSuccessAt ?? huidig?.lastSuccessAt ?? 0),
    errorCode: kort(patch.errorCode ?? huidig?.errorCode ?? '', 80),
    recoveryRequired: Boolean(patch.recoveryRequired ?? huidig?.recoveryRequired ?? false),
    createdAt: huidig?.createdAt || nu, updatedAt: nu,
  };
  if (huidig?.id) { await db.update(STATES, [{ id: huidig.id, record: rij }]); return metId(huidig.id, rij); }
  const [id] = await db.add(STATES, [rij]);
  return metId(id || '', rij);
};

/** De spiegel van ÉÉN agenda weggooien (na 410: Google kan ons niet meer vertellen wat er sindsdien gebeurde). */
const spiegelLeeg = async (p: Principal, calendarId: string) => {
  // Ook een WISSEN draagt de lade: de filter snijdt vooraf (ladeFilter) en `hoortBij` rekent na. Zonder dat zou een rij
  // van de andere lade van dezelfde mens theoretisch in de lijst kunnen staan, en dit is een DELETE — daar hoort geen
  // «praktisch kan het niet» bij.
  const lade = ladeVan(p);
  const rijen = (await db.list<Record<string, unknown>>(AGENDA_SPIEGEL_TABEL, { filter: { ...ladeFilter(lade), principalId: p.id }, limit: 2000 })).items as Array<{ id: string; calendarId?: unknown; ownerUserId?: unknown; ruimte?: unknown }>;
  const weg = rijen.filter((rij) => hoortBij(rij, lade) && (kort(rij.calendarId, 500) || 'primary') === calendarId).map((rij) => rij.id);
  if (weg.length) await db.delete(AGENDA_SPIEGEL_TABEL, weg);
  return weg.length;
};

const TIJD_MS = 20000;
const haal = async (url: string, token: string) => {
  const stuurder = new AbortController(), klok = setTimeout(() => stuurder.abort(), TIJD_MS);
  try { return await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: stuurder.signal }); }
  catch { throw new Error('GOOGLE_SUITE_CALENDAR_SYNC_TIMEOUT'); }
  finally { clearTimeout(klok); }
};

/** Welke agenda's houden we bij? De hoofdagenda altijd; daarna de andere, tot MAX_AGENDAS. */
const agendasVan = async (token: string): Promise<Array<{ id: string; naam: string }>> => {
  try {
    const respons = await haal('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=items(id,summary,primary,selected,accessRole)', token);
    if (!respons.ok) return [{ id: 'primary', naam: '' }];
    const data = (await respons.json()) as { items?: Record<string, unknown>[] };
    const rijen = (data.items || []).map((item) => ({
      id: kort(item.id, 500), naam: kort(item.summary, 200), primair: Boolean(item.primary), gekozen: item.selected !== false,
    })).filter((rij) => rij.id && rij.gekozen);
    rijen.sort((a, b) => Number(b.primair) - Number(a.primair));
    const lijst = rijen.slice(0, MAX_AGENDAS).map((rij) => ({ id: rij.primair ? 'primary' : rij.id, naam: rij.naam }));
    return lijst.length ? lijst : [{ id: 'primary', naam: '' }];
  } catch { return [{ id: 'primary', naam: '' }]; }
};

/** Eén ronde voor één agenda: hoogstens één pagina, zodat een cron-tik nooit te lang duurt. */
const synchroniseerAgenda = async (p: Principal, token: string, agenda: { id: string; naam: string }) => {
  const stand = await standVoor(p, agenda.id);
  const vraag = new URLSearchParams({ maxResults: '250', singleEvents: 'true', showDeleted: 'true', fields: VELDEN });
  if (stand?.phase === 'incremental' && stand.syncToken) vraag.set('syncToken', stand.syncToken);
  if (stand?.pageToken) vraag.set('pageToken', stand.pageToken);
  const respons = await haal(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agenda.id)}/events?${vraag}`, token);
  if (respons.status === 410) {
    // 410 GONE: het token is ongeldig. Spiegel van deze agenda leeg, en opnieuw volledig beginnen.
    const verwijderd = await spiegelLeeg(p, agenda.id);
    await standSchrijf(p, agenda.id, { phase: 'initial', syncToken: '', pageToken: '', lastAttemptAt: Date.now(), recoveryRequired: true, errorCode: 'GOOGLE_SUITE_CALENDAR_SYNC_TOKEN_EXPIRED' });
    return { agenda: agenda.id, herstel: true, verwijderd };
  }
  if (!respons.ok) throw new Error(respons.status === 403 ? 'GOOGLE_SUITE_CALENDAR_SYNC_FORBIDDEN' : 'GOOGLE_SUITE_CALENDAR_SYNC_FAILED');
  const data = (await respons.json()) as { nextPageToken?: string; nextSyncToken?: string; items?: Record<string, unknown>[] };
  for (const gebeurtenis of data.items || []) {
    const rij = spiegelRijUitGoogle(p.ownerUserId, p.id, agenda.id, gebeurtenis, { calendarNaam: agenda.naam });
    if (rij.providerEventId) await spiegelLeg(p.ownerUserId, rij);
  }
  const nu = Date.now(), aantal = (data.items || []).length;
  if (data.nextPageToken) {
    await standSchrijf(p, agenda.id, { phase: stand?.phase || 'initial', pageToken: data.nextPageToken, lastAttemptAt: nu, errorCode: '' });
    return { agenda: agenda.id, count: aantal, continued: true };
  }
  if (!data.nextSyncToken) throw new Error('GOOGLE_SUITE_CALENDAR_SYNC_TOKEN_MISSING');
  await standSchrijf(p, agenda.id, { phase: 'incremental', syncToken: data.nextSyncToken, pageToken: '', lastAttemptAt: nu, lastSuccessAt: nu, recoveryRequired: false, errorCode: '' });
  return { agenda: agenda.id, count: aantal, continued: false };
};

const ZACHTE_FOUTEN = ['GOOGLE_SUITE_GRANT_UNAVAILABLE', 'GOOGLE_SUITE_PRINCIPAL_NOT_FOUND', 'GOOGLE_SUITE_SCOPE_GUARD_FAILED'];

/** Alle agenda's van één account. Wordt gebruikt door de cron én door «Синхронізувати» op de pagina. */
export const synchroniseerAgendaVoorPrincipal = async (p: Principal) => {
  const lade = ladeVan(p);
  // Een technische lade die dicht is (stand niet 'eigen', of de rechten weg) synchroniseert niet. Dat is geen fout:
  // het is precies wat «bevroren» betekent — de gegevens blijven heel, maar er gebeurt niets meer mee.
  if (!await ladeNogGeldig(lade.userId, lade.ruimte, 'agenda')) return { agendas: 0, resultaten: [], recht: false, lade: lade.ruimte, gesloten: true };
  // Sleutelkluis (0092): zonder open sleutel overslaan met een eerlijke code (zichtbaar op /agenda als errorCode).
  if ((await kluisStand(lade)) === 'gesloten') { journaalTellen(lade, STATES, 'gesloten-overgeslagen'); return { agendas: 0, resultaten: [], recht: true, sleutel: 'gesloten' as const, reason: SLEUTEL_GESLOTEN_CODE }; }
  return metLade(lade, 'agenda', () => synchroniseerInLade(p));
};
const synchroniseerInLade = async (p: Principal) => {
  const stand = await googleSuiteAgendaScopeStatus(p.ownerUserId, p.id);
  // Zonder leesrecht is er niets te synchroniseren; dat is geen fout, dat is «niet gekoppeld».
  if (!stand.grantedScopes.includes(AGENDA_LEES_SCOPE)) return { agendas: 0, resultaten: [], recht: false };
  const token = await googleSuitePrincipalAccessToken(p.ownerUserId, p.id, 'calendar');
  const agendas = await agendasVan(token);
  const resultaten: unknown[] = [];
  for (const agenda of agendas) {
    try { resultaten.push({ ok: true, ...await synchroniseerAgenda(p, token, agenda) }); }
    catch (gevangen) {
      const reden = gevangen instanceof Error && gevangen.message.startsWith('GOOGLE_SUITE_') ? gevangen.message : 'GOOGLE_SUITE_CALENDAR_SYNC_FAILED';
      await standSchrijf(p, agenda.id, { lastAttemptAt: Date.now(), errorCode: reden });
      resultaten.push({ ok: false, agenda: agenda.id, reason: reden });
    }
  }
  return { agendas: agendas.length, resultaten, recht: true, schrijven: stand.schrijven };
};

/** Eén gebruiker nu synchroniseren (de knop op /agenda). Geeft `null` als er geen hoofdaccount is. */
export const synchroniseerAgendaVoorEigenaar = async (ownerUserId: string) => {
  const lade = ladeOf(ownerUserId);
  const rijen = (await db.list<Omit<Principal, 'id'>>(PRINCIPALS, { filter: ladeFilter(lade), limit: 50 })).items as Principal[];
  const hoofd = rijen.filter((rij) => hoortBij(rij as Record<string, unknown>, lade)).find((rij) => rij.accountRole === 'primary');
  if (!hoofd) return null;
  return synchroniseerAgendaVoorPrincipal(hoofd);
};

export const runGoogleSuiteCalendarSync = async (limit = 10) => {
  const rijen = await db.list<Omit<Principal, 'id'>>(PRINCIPALS, { limit: 1000 });
  const principals = (rijen.items as Principal[]).filter((item) => item.accountRole === 'primary').slice(0, Math.max(1, Math.min(25, limit)));
  const resultaten: unknown[] = [];
  for (const p of principals) {
    try { resultaten.push({ principalHash: p.id.slice(0, 10), ok: true, ...await synchroniseerAgendaVoorPrincipal(p) }); }
    catch (gevangen) {
      const reden = gevangen instanceof Error && gevangen.message.startsWith('GOOGLE_SUITE_') ? gevangen.message : 'GOOGLE_SUITE_CALENDAR_SYNC_FAILED';
      if (ZACHTE_FOUTEN.includes(reden)) continue;
      resultaten.push({ principalHash: p.id.slice(0, 10), ok: false, reason: reden });
    }
  }
  return { principals: principals.length, results: resultaten };
};
