// De SPIEGEL van de agenda: één plek waar alle afspraken samenkomen die de hub kan laten zien, plus de band
// lokaal ↔ Google en het geheugen voor idempotentie.
//
// Twee opslagplaatsen, met opzet verschillend:
//   • Google-afspraken staan in app.records onder `google_suite_calendar_events_v1`. Die tabel bestond al
//     (backend/google-suite-agenda-sync.ts schrijft haar, backend/hub-blok-gegevens.ts leest haar); 0076 voegt
//     er alleen velden aan toe (etag, iCalUID, deelnemers, herhaling, hele dag, tijdzone, lokaalId). Oude rijen
//     zonder die velden blijven gewoon werken — daarom lezen we elk veld met een terugval.
//   • Externe (gelezen) afspraken uit .ics-abonnementen en CalDAV staan in app.agenda_externe_gebeurtenis (0076).
//
// De band lokaal ↔ Google staat in app.agenda_koppeling. Die rij is tegelijk het idempotentiegeheugen: elke
// schrijfactie draagt een sleutel mee, en de uitslag van de eerste poging staat erbij. Een tweede, gelijke
// poging leest die uitslag en verstuurt niets meer (zie shared/agenda-model.ts → IDEMPOTENTIE_SLEUTEL).
//
// Waarheidsbron bij een conflict: Google (shared/agenda-model.ts → WAARHEIDSBRON). De spiegel is een cache en
// mag nooit als origineel dienen; daarom staat bij elke rij de `etag` die wij kenden, en gaat die als If-Match mee.
import { db } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { IDEMPOTENTIE_SLEUTEL, WAARHEIDSBRON, normaliseerDeelnemers, type AgendaItem, type Deelnemer } from '../shared/agenda-model';
import { hoortBij, ladeFilter, ladeVelden, sqlLadeWaar } from '../shared/ruimte-scheiding';
import { ladeOf } from './ruimte-cloud-agenda';

export const AGENDA_SPIEGEL_TABEL = 'google_suite_calendar_events_v1';
/** Hoeveel rijen we hoogstens uit de spiegel lezen. Wie meer heeft, ziet een begrensde lijst («bounded»). */
export const SPIEGEL_LIMIET = 2000;

/** De systeemrol, met in ELKE query een expliciete `user_id = $1` uit de gecontroleerde sessie — zoals
 *  backend/mail-afzenders.ts dat doet. Zo kan er nooit een rij van iemand anders in beeld komen. */
const sys = () => getPool('systeem');
// GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084). Elke lees- en schrijfactie hieronder draagt de LADE van de
// huidige aanroep: `ladeOf(ownerUserId)` geeft binnen een bewaakte agendaroute (ladePoort in backend/agenda-routes.ts)
// de lade die de poort berekende, en daarbuiten — cron, opstarten, een rij van vóór 0084 — de PERSOONLIJKE lade.
// Daardoor houdt de spiegel van de technische ruimte geen enkele persoonlijke afspraak vast en omgekeerd, zonder dat
// één functie hier een extra argument nodig heeft of per ongeluk de verkeerde lade kan meekrijgen.
const kort = (value: unknown, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const getal = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

export type SpiegelRij = {
  id: string;
  ownerUserId: string;
  /** De lade: 'prive' of 'technisch'. Ontbreekt hij (rij van vóór 0084), dan is de rij persoonlijk. */
  ruimte: 'prive' | 'technisch';
  principalId: string;
  calendarId: string;
  calendarNaam: string;
  providerEventId: string;
  iCalUID: string;
  etag: string;
  status: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  heleDag: boolean;
  tijdzone: string;
  recurrence: string;
  attendees: Deelnemer[];
  organisator: string;
  htmlLink: string;
  /** Gezet als deze afspraak hier is gemaakt: het id waarmee de browser/AI haar kent. */
  lokaalId: string;
  updatedAt: number;
  providerUpdatedAt: number;
};

/** Eén Google-afspraak → een rij van de spiegel. Alles begrensd; niets van Google komt ongesneden binnen. */
export function spiegelRijUitGoogle(ownerUserId: string, principalId: string, calendarId: string, gebeurtenis: Record<string, unknown>, extra: { calendarNaam?: string; lokaalId?: string } = {}): Omit<SpiegelRij, 'id'> {
  const start = (gebeurtenis.start || {}) as Record<string, unknown>, eind = (gebeurtenis.end || {}) as Record<string, unknown>;
  const heleDag = Boolean(start.date && !start.dateTime);
  return {
    ...ladeVelden(ladeOf(ownerUserId)),
    principalId,
    calendarId: kort(calendarId, 500) || 'primary',
    calendarNaam: kort(extra.calendarNaam, 200),
    providerEventId: kort(gebeurtenis.id, 1024),
    iCalUID: kort(gebeurtenis.iCalUID, 500),
    etag: kort(gebeurtenis.etag, 300),
    status: kort(gebeurtenis.status, 40),
    summary: kort(gebeurtenis.summary, 500),
    description: kort(gebeurtenis.description, 4000),
    location: kort(gebeurtenis.location, 500),
    start: kort(start.dateTime || start.date, 80),
    end: kort(eind.dateTime || eind.date, 80),
    heleDag,
    tijdzone: kort(start.timeZone || eind.timeZone, 80),
    recurrence: Array.isArray(gebeurtenis.recurrence) ? kort(gebeurtenis.recurrence.find((r) => /^RRULE:/i.test(String(r || ''))), 600) : '',
    attendees: normaliseerDeelnemers(Array.isArray(gebeurtenis.attendees) ? gebeurtenis.attendees.map((item) => {
      const rij = (item || {}) as Record<string, unknown>;
      return { email: rij.email, naam: rij.displayName, antwoord: rij.responseStatus, optioneel: rij.optional, zelf: rij.self, organisator: rij.organizer };
    }) : []),
    organisator: kort(((gebeurtenis.organizer || {}) as Record<string, unknown>).email, 320),
    htmlLink: kort(gebeurtenis.htmlLink, 1600),
    lokaalId: kort(extra.lokaalId, 120),
    updatedAt: Date.now(),
    providerUpdatedAt: Date.parse(kort(gebeurtenis.updated, 80)) || 0,
  };
}

const spiegelRijen = async (ownerUserId: string) => {
  const lade = ladeOf(ownerUserId);
  const rijen = (await db.list<Record<string, unknown>>(AGENDA_SPIEGEL_TABEL, { filter: ladeFilter(lade), limit: SPIEGEL_LIMIET })).items as Array<Record<string, unknown> & { id: string }>;
  // `hoortBij` erbij: de PERSOONLIJKE lade moet ook de rijen ZONDER `ruimte` vinden (alles van vóór 0084), en dat
  // kan een jsonb-filter niet uitdrukken. De technische lade vraagt ruimte='technisch' en krijgt dus nooit die rijen.
  return rijen.filter((rij) => hoortBij(rij as { ownerUserId?: unknown; ruimte?: unknown }, lade));
};

/** Dezelfde afspraak terugvinden: op (agenda, provider-id). Ouder rijen hebben geen calendarId: die staan op 'primary'. */
export async function spiegelZoek(ownerUserId: string, calendarId: string, providerEventId: string): Promise<(SpiegelRij) | null> {
  const doelAgenda = kort(calendarId, 500) || 'primary', doelId = kort(providerEventId, 1024);
  if (!doelId) return null;
  const rijen = await spiegelRijen(ownerUserId);
  const treffer = rijen.find((rij) => kort(rij.providerEventId, 1024) === doelId && (kort(rij.calendarId, 500) || 'primary') === doelAgenda);
  return treffer ? ({ ...(treffer as unknown as SpiegelRij), id: treffer.id }) : null;
}

/** Aanmaken of bijwerken; 'cancelled' haalt de rij weg (zo doet de synchronisatie het al). */
export async function spiegelLeg(ownerUserId: string, rij: Omit<SpiegelRij, 'id'>): Promise<string> {
  if (!rij.providerEventId) return '';
  const bestaand = await spiegelZoek(ownerUserId, rij.calendarId, rij.providerEventId);
  if (rij.status === 'cancelled') { if (bestaand?.id) await db.delete(AGENDA_SPIEGEL_TABEL, [bestaand.id]); return ''; }
  if (bestaand?.id) {
    // Een lokaal id dat we al kenden, nooit verliezen: de browser gebruikt het om de rij terug te vinden.
    await db.update(AGENDA_SPIEGEL_TABEL, [{ id: bestaand.id, record: { ...rij, lokaalId: rij.lokaalId || bestaand.lokaalId || '' } }]);
    return bestaand.id;
  }
  const [id] = await db.add(AGENDA_SPIEGEL_TABEL, [rij]);
  return id || '';
}
export async function spiegelWis(ownerUserId: string, calendarId: string, providerEventId: string): Promise<boolean> {
  const bestaand = await spiegelZoek(ownerUserId, calendarId, providerEventId);
  if (!bestaand?.id) return false;
  const [ok] = await db.delete(AGENDA_SPIEGEL_TABEL, [bestaand.id]);
  return Boolean(ok);
}

const itemUitSpiegel = (rij: Record<string, unknown> & { id: string }, schrijfbaar: boolean): AgendaItem => ({
  id: `google:${kort(rij.calendarId, 500) || 'primary'}:${kort(rij.providerEventId, 1024)}`,
  bron: 'google',
  agendaId: kort(rij.calendarId, 500) || 'primary',
  agendaNaam: kort(rij.calendarNaam, 200),
  titel: kort(rij.summary, 500),
  locatie: kort(rij.location, 500),
  beschrijving: kort(rij.description, 4000),
  begin: kort(rij.start, 80),
  einde: kort(rij.end, 80),
  heleDag: Boolean(rij.heleDag) || (kort(rij.start, 80).length === 10 && !kort(rij.start, 80).includes('T')),
  etag: kort(rij.etag, 300),
  koppeling: kort(rij.htmlLink, 1600),
  schrijfbaar,
  deelnemers: normaliseerDeelnemers(rij.attendees),
  herhaling: kort(rij.recurrence, 600),
  status: kort(rij.status, 40) || 'confirmed',
});

export type ExterneRij = {
  abonnementId: string; agendaUrl: string; uid: string; titel: string; locatie: string; beschrijving: string;
  begin: string; einde: string; heleDag: boolean; tijdzone: string; rrule: string; status: string; reeks: number;
  gewijzigdOp: string; url: string;
};
/** De externe spiegel in één keer vervangen voor één bron (abonnement + eventueel één CalDAV-agenda). */
export async function externeSpiegelVervang(ownerUserId: string, abonnementId: string, agendaUrl: string, rijen: readonly ExterneRij[]): Promise<number> {
  const klant = await sys().connect();
  try {
    await klant.query('BEGIN');
    const lade = ladeOf(ownerUserId);
    await klant.query(`DELETE FROM app.agenda_externe_gebeurtenis WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND abonnement_id = $2 AND agenda_url = $3`, [ownerUserId, abonnementId, agendaUrl]);
    for (const rij of rijen) {
      if (!rij.uid || !rij.begin) continue;
      await klant.query(
        `INSERT INTO app.agenda_externe_gebeurtenis
           (user_id, ruimte, abonnement_id, agenda_url, uid, titel, locatie, beschrijving, begin_waarde, eind_waarde, hele_dag, tijdzone, rrule, status, reeks, gewijzigd_op, url, gezien_op)
         VALUES ($1,$17,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         ON CONFLICT (user_id, abonnement_id, agenda_url, uid) DO UPDATE SET
           titel = EXCLUDED.titel, locatie = EXCLUDED.locatie, beschrijving = EXCLUDED.beschrijving,
           begin_waarde = EXCLUDED.begin_waarde, eind_waarde = EXCLUDED.eind_waarde, hele_dag = EXCLUDED.hele_dag,
           tijdzone = EXCLUDED.tijdzone, rrule = EXCLUDED.rrule, status = EXCLUDED.status, reeks = EXCLUDED.reeks,
           gewijzigd_op = EXCLUDED.gewijzigd_op, url = EXCLUDED.url, gezien_op = now()`,
        [ownerUserId, abonnementId, agendaUrl, kort(rij.uid, 500), kort(rij.titel, 300), kort(rij.locatie, 500), kort(rij.beschrijving, 4000),
          kort(rij.begin, 40), kort(rij.einde, 40), Boolean(rij.heleDag), kort(rij.tijdzone, 80), kort(rij.rrule, 600),
          kort(rij.status, 40), Math.max(0, Math.trunc(getal(rij.reeks))), kort(rij.gewijzigdOp, 40), /^https:\/\//i.test(kort(rij.url, 1600)) ? kort(rij.url, 1600) : '', lade.ruimte],
      );
    }
    await klant.query('COMMIT');
    return rijen.length;
  } catch (fout) {
    await klant.query('ROLLBACK').catch(() => undefined);
    throw fout;
  } finally { klant.release(); }
}
export async function externeSpiegelWis(ownerUserId: string, abonnementId: string): Promise<void> {
  await sys().query(`DELETE FROM app.agenda_externe_gebeurtenis WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND abonnement_id = $2`, [ownerUserId, abonnementId]);
}

type ExterneNaam = (abonnementId: string, agendaUrl: string) => { naam: string; bron: 'ics' | 'caldav' };
/** Alle afspraken die de hub kan laten zien: Google (schrijfbaar als het recht er is) + de externe, lezende bronnen. */
export async function agendaItems(ownerUserId: string, opties: { schrijfbaar: boolean; naamVan?: ExterneNaam }): Promise<{ items: AgendaItem[]; begrensd: boolean }> {
  const google = await spiegelRijen(ownerUserId);
  const items = google
    .filter((rij) => kort(rij.status, 40) !== 'cancelled')
    .map((rij) => itemUitSpiegel(rij, opties.schrijfbaar));
  const extern = await sys().query(
    'SELECT abonnement_id, agenda_url, uid, titel, locatie, beschrijving, begin_waarde, eind_waarde, hele_dag, tijdzone, rrule, status, url'
    + ` FROM app.agenda_externe_gebeurtenis WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} ORDER BY begin_waarde LIMIT $2`, [ownerUserId, SPIEGEL_LIMIET]);
  for (const rij of extern.rows as Record<string, unknown>[]) {
    const herkomst = opties.naamVan ? opties.naamVan(String(rij.abonnement_id), String(rij.agenda_url || '')) : { naam: '', bron: 'ics' as const };
    items.push({
      id: `${herkomst.bron}:${kort(rij.abonnement_id, 120)}:${kort(rij.agenda_url, 200)}:${kort(rij.uid, 500)}`,
      bron: herkomst.bron,
      agendaId: kort(rij.agenda_url, 2000) || kort(rij.abonnement_id, 120),
      agendaNaam: herkomst.naam,
      titel: kort(rij.titel, 300),
      locatie: kort(rij.locatie, 500),
      beschrijving: kort(rij.beschrijving, 4000),
      begin: kort(rij.begin_waarde, 40),
      einde: kort(rij.eind_waarde, 40) || kort(rij.begin_waarde, 40),
      heleDag: Boolean(rij.hele_dag),
      etag: '',
      koppeling: kort(rij.url, 1600),
      // Eerlijk: deze bronnen zijn in deze versie LEZEN. Nooit true, ook niet als Google schrijfbaar is.
      schrijfbaar: false,
      deelnemers: [],
      herhaling: kort(rij.rrule, 600),
      status: kort(rij.status, 40) || 'confirmed',
    });
  }
  items.sort((a, b) => String(a.begin).localeCompare(String(b.begin)));
  return { items, begrensd: google.length >= SPIEGEL_LIMIET || extern.rows.length >= SPIEGEL_LIMIET };
}

// ---------------------------------------------------------------------------------------------- idempotentie
export type KoppelActie = 'aanmaken' | 'wijzigen' | 'verplaatsen' | 'verwijderen' | 'deelnemers' | 'rsvp';
export type KoppelRij = {
  lokaalId: string; provider: 'google'; agendaId: string; providerGebeurtenisId: string; etag: string;
  waarheidsbron: 'lokaal' | 'google'; idempotentieSleutel: string; actie: KoppelActie;
  staat: 'bezig' | 'klaar' | 'conflict' | 'weg' | 'fout'; fout: string; uitslag: Record<string, unknown>;
};
const koppelUit = (rij: Record<string, unknown>): KoppelRij => ({
  lokaalId: String(rij.lokaal_id || ''), provider: 'google', agendaId: String(rij.agenda_id || 'primary'),
  providerGebeurtenisId: String(rij.provider_gebeurtenis_id || ''), etag: String(rij.etag || ''),
  waarheidsbron: rij.waarheidsbron === 'google' ? 'google' : 'lokaal', idempotentieSleutel: String(rij.idempotentie_sleutel || ''),
  actie: rij.actie as KoppelActie, staat: rij.staat as KoppelRij['staat'], fout: String(rij.fout || ''),
  uitslag: (rij.uitslag && typeof rij.uitslag === 'object' ? rij.uitslag : {}) as Record<string, unknown>,
});

export const geldigeSleutel = (waarde: unknown): string => {
  const sleutel = kort(waarde, 120);
  return IDEMPOTENTIE_SLEUTEL.test(sleutel) ? sleutel : '';
};

export async function koppelLees(ownerUserId: string, sleutel: string): Promise<KoppelRij | null> {
  const uit = await sys().query(`SELECT * FROM app.agenda_koppeling WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND idempotentie_sleutel = $2`, [ownerUserId, sleutel]);
  return uit.rows[0] ? koppelUit(uit.rows[0] as Record<string, unknown>) : null;
}
/**
 * De sleutel claimen. Geeft `{nieuw: true}` als wij de eerste zijn (dan mag er naar Google worden geschreven) en
 * `{nieuw: false, rij}` als de actie al eens is gedaan — dan is het antwoord van toen het antwoord van nu.
 * Een rij die nog 'bezig' is en ouder dan de pauze, mogen we opnieuw proberen (een crash mag niets blokkeren).
 */
export const KOPPEL_VASTGELOPEN_MS = 2 * 60 * 1000;
export async function koppelClaim(ownerUserId: string, sleutel: string, actie: KoppelActie, lokaalId: string, agendaId: string, providerGebeurtenisId = ''): Promise<{ nieuw: boolean; rij: KoppelRij | null }> {
  // Eén INSERT ... ON CONFLICT is de hele wedloop: de database beslist wie de eerste is. `xmax = 0` is waar voor
  // precies die ene invoeger; alle anderen krijgen de bestaande rij terug en sturen dus NIETS naar Google.
  // Alleen een rij die al langer dan KOPPEL_VASTGELOPEN_MS 'bezig' staat (de server viel om midden in een
  // schrijfactie) mag opnieuw worden geprobeerd — dat meten we aan `aangemaakt_op`, niet aan `bijgewerkt_op`,
  // zodat twee verzoeken die tegelijk aankomen nooit beide als «de eerste» gelden.
  const uit = await sys().query(
    `INSERT INTO app.agenda_koppeling (user_id, ruimte, lokaal_id, provider, agenda_id, provider_gebeurtenis_id, idempotentie_sleutel, actie, staat, waarheidsbron)
     VALUES ($1,$8,$2,'google',$3,$4,$5,$6,'bezig','lokaal')
     ON CONFLICT (user_id, idempotentie_sleutel) DO UPDATE SET
       bijgewerkt_op = CASE WHEN app.agenda_koppeling.staat = 'bezig' AND app.agenda_koppeling.aangemaakt_op < now() - ($7 || ' milliseconds')::interval
         THEN now() ELSE app.agenda_koppeling.bijgewerkt_op END
     RETURNING *, (xmax = 0) AS ingevoegd,
       (staat = 'bezig' AND aangemaakt_op < now() - ($7 || ' milliseconds')::interval) AS vastgelopen`,
    [ownerUserId, kort(lokaalId, 120) || sleutel, kort(agendaId, 500) || 'primary', kort(providerGebeurtenisId, 1024), sleutel, actie, String(KOPPEL_VASTGELOPEN_MS), ladeOf(ownerUserId).ruimte],
  );
  const rij = uit.rows[0] as Record<string, unknown>;
  const ingevoegd = rij?.ingevoegd === true;
  const herstart = !ingevoegd && rij?.vastgelopen === true;
  return { nieuw: ingevoegd || herstart, rij: rij ? koppelUit(rij) : null };
}
export async function koppelAf(ownerUserId: string, sleutel: string, patch: { staat: KoppelRij['staat']; providerGebeurtenisId?: string; etag?: string; waarheidsbron?: 'lokaal' | 'google'; fout?: string; uitslag?: Record<string, unknown> }): Promise<void> {
  await sys().query(
    `UPDATE app.agenda_koppeling SET staat = $3,
       provider_gebeurtenis_id = COALESCE(NULLIF($4, ''), provider_gebeurtenis_id),
       etag = COALESCE($5, etag), waarheidsbron = COALESCE($6, waarheidsbron),
       fout = $7, uitslag = $8::jsonb, bijgewerkt_op = now()
     WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND idempotentie_sleutel = $2`,
    [ownerUserId, sleutel, patch.staat, kort(patch.providerGebeurtenisId, 1024), patch.etag === undefined ? null : kort(patch.etag, 300),
      patch.waarheidsbron || null, /^[A-Z0-9_]{0,60}$/.test(String(patch.fout || '')) ? String(patch.fout || '') : 'AGENDA_SCHRIJVEN_MISLUKT',
      JSON.stringify(patch.uitslag || {}).slice(0, 8000)],
  );
}
/** De band van één lokale afspraak: hiermee weet de browser (en de AI) welke Google-afspraak erbij hoort. */
export async function koppelVanLokaal(ownerUserId: string, lokaalId: string): Promise<KoppelRij | null> {
  const uit = await sys().query(
    `SELECT * FROM app.agenda_koppeling WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND lokaal_id = $2 AND provider_gebeurtenis_id <> ''
      ORDER BY bijgewerkt_op DESC LIMIT 1`, [ownerUserId, kort(lokaalId, 120)]);
  return uit.rows[0] ? koppelUit(uit.rows[0] as Record<string, unknown>) : null;
}
/** De etag die wij als laatste van deze afspraak zagen (spiegel eerst, dan de koppelrij). */
export async function laatsteEtag(ownerUserId: string, agendaId: string, providerGebeurtenisId: string): Promise<string> {
  const rij = await spiegelZoek(ownerUserId, agendaId, providerGebeurtenisId);
  if (rij?.etag) return rij.etag;
  const uit = await sys().query(
    `SELECT etag FROM app.agenda_koppeling WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND agenda_id = $2 AND provider_gebeurtenis_id = $3 AND etag <> ''
      ORDER BY bijgewerkt_op DESC LIMIT 1`, [ownerUserId, kort(agendaId, 500) || 'primary', kort(providerGebeurtenisId, 1024)]);
  return String(uit.rows[0]?.etag || '');
}

export const AGENDA_WAARHEIDSBRON_UITLEG = WAARHEIDSBRON;
