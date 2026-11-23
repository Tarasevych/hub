// Двосторонній міст між Нотатками (`notities-vnext`), Календарем (`agenda`), Завданнями простору та Хмарним сховищем (`cloud-vnext`),
// а також безвмістові міжслужбові переходи з картки події до Пошти й Контактів.
// Tweerichtingsbrug Notities ↔ Agenda, Taken en Opslag binnen dezelfde gecontroleerde ruimte (Lade) onder FORCE RLS.
import { randomUUID } from 'node:crypto';
import { db } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { alsGebruiker } from './ai-toestemmingen';
import { leesLadeBestandVoorDelen, leesLadeInventarisVoorDelen } from './cloud-vnext-bestanden';
import { gebeurtenisAanmaken } from './agenda-google';
import { caldavBewaarGebeurtenis } from './agenda-caldav-schrijven';
import { caldavLijst } from './agenda-caldav';
import { icsLijst } from './agenda-ics';
import { agendaItems } from './agenda-spiegel';
import { metLade, ruimtePoort } from './ruimte-cloud-agenda';
import { hoortBij, sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import { EPOST, IDEMPOTENTIE_SLEUTEL, type AgendaItem } from '../shared/agenda-model';
import {
  SPIEGEL_MAX_TEKST,
  SPIEGEL_MAX_TITEL,
  alsTekst,
  openTakenUitChecklist,
  spiegelEtiketten,
  spiegelTekst,
  spiegelTitel,
  type Notitie,
  type NotitieAgendaKoppeling,
  type NotitieBestandVerwijzing,
  type NotitieTaakVerwijzing,
} from '../shared/notities-vnext-model';

export const NOTITIES_AGENDA_BRUG_VLAG = 'notities-agenda-brug-v1';
export const CONTACT_SPRONG_TABEL = 'agenda_contact_sprong_v1';
const COGNITIVE_RESUME_TABEL = 'cognitive_resume_context_v1';
const CONTACT_SPRONG_TTL_MS = 5 * 60_000;

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const sys = () => getPool('systeem');
const kort = (v: unknown, max = 500) => alsTekst(v).replace(/\u0000/g, '').trim().slice(0, max);
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

const GEHEIM_RE = /(?:-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj|live|test)-[A-Za-z0-9_-]{16,}|mcpa_[A-Za-z0-9_-]{16,})/i;
const reinigTitel = (v: unknown, max = 300): string => {
  const s = kort(v, max);
  return GEHEIM_RE.test(s) ? '[приховано]' : s;
};

const fnvEmmer = (sleutel: string, userId: string): number => {
  let h = 0x811c9dc5;
  const s = `${sleutel}:${userId}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
};

let brugVlagLezer: ((userId: string) => Promise<boolean>) | null = null;
export function zetNotitiesBrugVlagVoorTest(fn: ((userId: string) => Promise<boolean>) | null): void {
  brugVlagLezer = fn;
}

/** Пряма перевірка прапорця `notities-agenda-brug-v1` без імпорту модуля vlaggen. */
export async function isNotitiesBrugVlagAan(userId: string): Promise<boolean> {
  if (brugVlagLezer) return brugVlagLezer(userId);
  const uid = kort(userId, 200);
  if (!uid) return false;
  try {
    const eigen = await sys().query(
      'SELECT waarde FROM app.feature_flag_tests WHERE user_id = $1 AND sleutel = $2 AND tot > now() LIMIT 1',
      [uid, NOTITIES_AGENDA_BRUG_VLAG],
    );
    if (eigen.rows.length > 0) return Boolean((eigen.rows[0] as { waarde?: boolean }).waarde);
    const alg = await sys().query(
      'SELECT aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = $1 LIMIT 1',
      [NOTITIES_AGENDA_BRUG_VLAG],
    );
    const r = alg.rows[0] as { aan?: boolean; standaard?: boolean; percentage?: number; gebruikers?: string[] } | undefined;
    if (!r || r.aan !== true) return false;
    const gebruikers = Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [];
    if (gebruikers.includes(uid)) return true;
    const pct = Number(r.percentage) || 0;
    if (pct > 0) return fnvEmmer(NOTITIES_AGENDA_BRUG_VLAG, uid) < pct;
    return r.standaard === true;
  } catch {
    return false;
  }
}

async function inLade<T>(lade: Lade, werk: (q: Q) => Promise<T>): Promise<T> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    return werk(q);
  });
}

const koppelingUit = (r: Record<string, unknown>): NotitieAgendaKoppeling => ({
  id: String(r.id),
  notitieId: String(r.notitie_id),
  eventId: String(r.event_id),
  agendaId: String(r.agenda_id || 'primary'),
  eventBron: r.event_bron === 'caldav' || r.event_bron === 'ics' ? r.event_bron : 'google',
  eventTitel: String(r.event_titel || ''),
  eventBegin: String(r.event_begin || ''),
  aangemaaktOp: iso(r.aangemaakt_op),
});

async function alleAgendaItemsInLade(lade: Lade): Promise<AgendaItem[]> {
  const besluit = await ruimtePoort({ userId: lade.userId, aiRuimte: lade.ruimte }, 'agenda');
  if (!besluit.ok) return [];
  return metLade(besluit.lade, 'agenda', async () => {
    const [ics, caldav] = await Promise.all([
      icsLijst(besluit.lade.userId).catch(() => []),
      caldavLijst(besluit.lade.userId).catch(() => []),
    ]);
    const naamKaart = new Map<string, { naam: string; bron: 'ics' | 'caldav' }>();
    for (const rij of ics) naamKaart.set(`${rij.id}|`, { naam: rij.naam || rij.adres, bron: 'ics' });
    for (const rij of caldav) {
      naamKaart.set(`${rij.id}|`, { naam: rij.naam || rij.adres, bron: 'caldav' });
      for (const ag of rij.agendas) naamKaart.set(`${rij.id}|${ag.url}`, { naam: ag.naam || rij.naam || rij.adres, bron: 'caldav' });
    }
    const { items } = await agendaItems(besluit.lade.userId, {
      schrijfbaar: false,
      naamVan: (abonnementId, agendaUrl) => naamKaart.get(`${abonnementId}|${agendaUrl}`) || naamKaart.get(`${abonnementId}|`) || { naam: '', bron: 'ics' },
    });
    return items;
  });
}

/** Перелік найближчих подій поточного простору для швидкого вибору у вікні прив'язки нотатки. */
export async function kiesbareAfspraakItemsVoorLade(lade: Lade): Promise<Array<{ id: string; agendaId: string; bron: 'google' | 'caldav' | 'ics'; titel: string; begin: string; einde: string; heleDag: boolean }>> {
  const items = await alleAgendaItemsInLade(lade);
  const grens = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  return items
    .filter((i) => String(i.einde || i.begin || '').slice(0, 10) >= grens)
    .slice(0, 80)
    .map((i) => ({
      id: i.id,
      agendaId: i.agendaId,
      bron: i.bron,
      titel: i.titel,
      begin: i.begin,
      einde: i.einde,
      heleDag: i.heleDag,
    }));
}

/** Усі прив'язані події календаря для однієї нотатки в поточному просторі. */
export async function koppelingenVoorNotitie(lade: Lade, notitieId: string): Promise<NotitieAgendaKoppeling[]> {
  if (!isUuid(notitieId)) return [];
  return inLade(lade, async (q) => {
    const { rows } = await q(
      `SELECT * FROM app.notities_agenda_koppelingen
        WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND notitie_id = $2::uuid
        ORDER BY bijgewerkt_op DESC, aangemaakt_op DESC LIMIT 50`,
      [lade.userId, notitieId],
    );
    return rows.map(koppelingUit);
  });
}

/** Усі активні нотатки поточного простору, прив'язані до вказаної події календаря. */
export async function koppelingenVoorEvent(
  lade: Lade,
  eventId: string,
): Promise<Array<NotitieAgendaKoppeling & { notitieTitel: string; doelPad: string }>> {
  const schoonEvent = kort(eventId, 1200);
  if (schoonEvent.length < 3) return [];
  return inLade(lade, async (q) => {
    const { rows } = await q(
      `SELECT k.*, n.titel AS notitie_titel
         FROM app.notities_agenda_koppelingen k
         JOIN app.notities n ON n.id = k.notitie_id
        WHERE k.user_id = $1 AND k.ruimte = $2
          AND n.user_id = $1 AND n.ruimte = $2 AND n.verwijderd_op IS NULL
          AND k.event_id = $3
        ORDER BY k.bijgewerkt_op DESC LIMIT 50`,
      [lade.userId, lade.ruimte, schoonEvent],
    );
    return rows.map((r) => ({
      ...koppelingUit(r),
      notitieTitel: String(r.notitie_titel || ''),
      doelPad: `/notities?open_item_id=${encodeURIComponent(String(r.notitie_id))}`,
    }));
  });
}

export type KoppelNotitieUitslag =
  | { ok: true; koppeling: NotitieAgendaKoppeling; herhaald: boolean }
  | { ok: false; fout: string };

/** Двостороння прив'язка наявної події календаря до нотатки з обов'язковим підтвердженням і перевіркою належності обох об'єктів. */
export async function koppelNotitieAanEvent(
  lade: Lade,
  invoer: {
    notitieId: unknown;
    eventId: unknown;
    agendaId?: unknown;
    idempotentieSleutel: unknown;
    bevestigd: unknown;
    actor?: string;
  },
): Promise<KoppelNotitieUitslag> {
  if (invoer.bevestigd !== true) return { ok: false, fout: 'BEVESTIGING_VEREIST' };
  const sleutel = kort(invoer.idempotentieSleutel, 120);
  if (!IDEMPOTENTIE_SLEUTEL.test(sleutel)) return { ok: false, fout: 'IDEMPOTENTIE_SLEUTEL_ONGELDIG' };
  if (!isUuid(invoer.notitieId)) return { ok: false, fout: 'ID_ONGELDIG' };
  const ruwEventId = kort(invoer.eventId, 1200);
  if (ruwEventId.length < 3) return { ok: false, fout: 'EVENT_NIET_GEVONDEN' };

  const itemsInLade = await alleAgendaItemsInLade(lade);
  const opgegevenAgenda = kort(invoer.agendaId, 500) || 'primary';
  const gevondenEvent = itemsInLade.find(
    (it) => it.id === ruwEventId || it.id === `google:${opgegevenAgenda}:${ruwEventId}`,
  );
  if (!gevondenEvent) return { ok: false, fout: 'EVENT_NIET_GEVONDEN' };

  const actor = kort(invoer.actor || 'gebruiker', 80) || 'gebruiker';

  const uitslag = await inLade(lade, async (q) => {
    const alOpSleutel = await q(
      `SELECT * FROM app.notities_agenda_koppelingen WHERE user_id = $1 AND ruimte = $2 AND idempotentie_sleutel = $3 LIMIT 1`,
      [lade.userId, lade.ruimte, sleutel],
    );
    if (alOpSleutel.rows[0]) {
      return { ok: true as const, koppeling: koppelingUit(alOpSleutel.rows[0]), herhaald: true };
    }

    const notitieRij = await q(
      `SELECT id FROM app.notities WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)} AND verwijderd_op IS NULL LIMIT 1`,
      [lade.userId, invoer.notitieId],
    );
    if (!notitieRij.rows[0]) return { ok: false as const, fout: 'NIET_GEVONDEN' };

    const { rows } = await q(
      `INSERT INTO app.notities_agenda_koppelingen
         (user_id, ruimte, notitie_id, event_id, agenda_id, event_bron, event_titel, event_begin, bevestigd_door, idempotentie_sleutel)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, ruimte, notitie_id, event_id) DO UPDATE SET
         agenda_id = EXCLUDED.agenda_id,
         event_bron = EXCLUDED.event_bron,
         event_titel = EXCLUDED.event_titel,
         event_begin = EXCLUDED.event_begin,
         bijgewerkt_op = now()
       RETURNING *, (xmax <> 0) AS bijgewerkt`,
      [
        lade.userId,
        lade.ruimte,
        invoer.notitieId,
        gevondenEvent.id,
        kort(gevondenEvent.agendaId, 2000) || 'primary',
        gevondenEvent.bron,
        reinigTitel(gevondenEvent.titel, 300),
        kort(gevondenEvent.begin, 80),
        actor,
        sleutel,
      ],
    );
    return { ok: true as const, koppeling: koppelingUit(rows[0]), herhaald: Boolean(rows[0]?.bijgewerkt) };
  });

  if (uitslag.ok && !uitslag.herhaald) {
    await auditToevoegen({
      ownerId: lade.userId,
      actorId: lade.userId,
      action: 'notitie.agenda.gekoppeld',
      type: 'bord',
      result: 'ok',
      details: { notitieId: invoer.notitieId, eventBron: gevondenEvent.bron, ruimte: lade.ruimte },
    }).catch(() => undefined);
  }
  return uitslag;
}

/** Створення нової події календаря безпосередньо з нотатки (за явним підтвердженням) та одночасне збереження прив'язки. */
export async function maakAfspraakUitNotitie(
  lade: Lade,
  email: string,
  invoer: {
    notitieId: unknown;
    vorm: unknown;
    idempotentieSleutel: unknown;
    bevestigd: unknown;
    meldDeelnemers?: 'none' | 'all' | 'externalOnly';
    caldavAccountId?: unknown;
    caldavAgendaUrl?: unknown;
    actor?: string;
  },
): Promise<{ ok: true; koppeling: NotitieAgendaKoppeling; eventId: string } | { ok: false; fout: string }> {
  if (invoer.bevestigd !== true) return { ok: false, fout: 'BEVESTIGING_VEREIST' };
  const sleutel = kort(invoer.idempotentieSleutel, 120);
  if (!IDEMPOTENTIE_SLEUTEL.test(sleutel)) return { ok: false, fout: 'IDEMPOTENTIE_SLEUTEL_ONGELDIG' };
  if (!isUuid(invoer.notitieId)) return { ok: false, fout: 'ID_ONGELDIG' };

  const alBestaand = await inLade(lade, async (q) => {
    const r = await q(
      `SELECT * FROM app.notities_agenda_koppelingen WHERE user_id = $1 AND ruimte = $2 AND idempotentie_sleutel = $3 LIMIT 1`,
      [lade.userId, lade.ruimte, sleutel],
    );
    if (r.rows[0]) return { herhaald: koppelingUit(r.rows[0]) };
    const n = await q(
      `SELECT id, titel, inhoud_plat FROM app.notities WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)} AND verwijderd_op IS NULL LIMIT 1`,
      [lade.userId, invoer.notitieId],
    );
    return { notitie: n.rows[0] as { id: string; titel: string; inhoud_plat: string } | undefined };
  });

  if ('herhaald' in alBestaand && alBestaand.herhaald) {
    return { ok: true, koppeling: alBestaand.herhaald, eventId: alBestaand.herhaald.eventId };
  }
  if (!alBestaand.notitie) return { ok: false, fout: 'NIET_GEVONDEN' };

  const besluit = await ruimtePoort({ userId: lade.userId, aiRuimte: lade.ruimte }, 'agenda');
  if (!besluit.ok) return { ok: false, fout: besluit.code };
  if (besluit.lade.ruimte !== lade.ruimte) return { ok: false, fout: 'RUIMTE_VERSCHILT' };

  const ruweVorm = (invoer.vorm && typeof invoer.vorm === 'object' ? invoer.vorm : {}) as Record<string, unknown>;
  const samengesteldeVorm: Record<string, unknown> = {
    ...ruweVorm,
    titel: kort(ruweVorm.titel || alBestaand.notitie.titel, 300),
    beschrijving: kort(ruweVorm.beschrijving ?? alBestaand.notitie.inhoud_plat, 4000),
  };

  let eventId = '';
  let agendaId = 'primary';
  let eventBron: 'google' | 'caldav' = 'google';
  const eventTitel = reinigTitel(samengesteldeVorm.titel, 300);
  const eventBegin = kort(samengesteldeVorm.begin, 80);

  const caldavAccountId = kort(invoer.caldavAccountId, 120);
  const caldavAgendaUrl = kort(invoer.caldavAgendaUrl, 2000);

  if (caldavAccountId && caldavAgendaUrl) {
    const davUit = await metLade(lade, 'agenda', () =>
      caldavBewaarGebeurtenis(lade.userId, {
        sleutel,
        accountId: caldavAccountId,
        agendaUrl: caldavAgendaUrl,
        vorm: samengesteldeVorm,
        organisatorEmail: email,
      }),
    );
    if (!davUit.ok || !davUit.gebeurtenisId) {
      return { ok: false, fout: davUit.fout || 'CALDAV_SCHRIJVEN_MISLUKT' };
    }
    agendaId = davUit.agendaId || caldavAgendaUrl;
    eventId = `caldav:${caldavAccountId}:${agendaId.slice(0, 200)}:${davUit.gebeurtenisId}`;
    eventBron = 'caldav';
  } else {
    const gUit = await metLade(lade, 'agenda', () =>
      gebeurtenisAanmaken(
        { ownerUserId: lade.userId, email },
        {
          sleutel,
          lokaalId: sleutel,
          vorm: samengesteldeVorm,
          meldDeelnemers: invoer.meldDeelnemers ?? 'none',
        },
      ),
    );
    if (!gUit.ok || !gUit.gebeurtenisId) {
      return { ok: false, fout: gUit.fout || 'AGENDA_SCHRIJVEN_MISLUKT' };
    }
    agendaId = gUit.agendaId || kort(samengesteldeVorm.agendaId, 500) || 'primary';
    eventId = `google:${agendaId}:${gUit.gebeurtenisId}`;
    eventBron = 'google';
  }

  const actor = kort(invoer.actor || email || 'gebruiker', 80) || 'gebruiker';
  const koppeling = await inLade(lade, async (q) => {
    const { rows } = await q(
      `INSERT INTO app.notities_agenda_koppelingen
         (user_id, ruimte, notitie_id, event_id, agenda_id, event_bron, event_titel, event_begin, bevestigd_door, idempotentie_sleutel)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, ruimte, notitie_id, event_id) DO UPDATE SET
         event_titel = EXCLUDED.event_titel,
         event_begin = EXCLUDED.event_begin,
         bijgewerkt_op = now()
       RETURNING *`,
      [lade.userId, lade.ruimte, invoer.notitieId, eventId, agendaId, eventBron, eventTitel, eventBegin, actor, sleutel],
    );
    return koppelingUit(rows[0]);
  });

  await auditToevoegen({
    ownerId: lade.userId,
    actorId: lade.userId,
    action: 'notitie.agenda.afspraak_gemaakt',
    type: 'bord',
    result: 'ok',
    details: { notitieId: invoer.notitieId, eventBron, ruimte: lade.ruimte },
  }).catch(() => undefined);

  return { ok: true, koppeling, eventId };
}

/** Від'єднання події календаря від нотатки у межах активного простору. */
export async function ontkoppelNotitieEvent(
  lade: Lade,
  invoer: { notitieId: unknown; eventId: unknown; actor?: string },
): Promise<boolean> {
  if (!isUuid(invoer.notitieId)) return false;
  const eventId = kort(invoer.eventId, 1200);
  if (!eventId) return false;
  const verwijderd = await inLade(lade, async (q) => {
    const res = await q(
      `DELETE FROM app.notities_agenda_koppelingen
        WHERE user_id = $1 AND ruimte = $2 AND notitie_id = $3::uuid AND event_id = $4`,
      [lade.userId, lade.ruimte, invoer.notitieId, eventId],
    );
    return Number(res.rowCount || 0) > 0;
  });
  if (verwijderd) {
    await auditToevoegen({
      ownerId: lade.userId,
      actorId: lade.userId,
      action: 'notitie.agenda.ontkoppeld',
      type: 'bord',
      result: 'ok',
      details: { notitieId: invoer.notitieId, ruimte: lade.ruimte },
    }).catch(() => undefined);
  }
  return verwijderd;
}

async function spiegelNotitieBijwerken(q: Q, lade: Lade, r: Record<string, unknown>): Promise<void> {
  const n: Pick<Notitie, 'soort' | 'kleur' | 'etiketten' | 'vast' | 'gearchiveerdOp'> = {
    soort: (r.soort as Notitie['soort']) || 'tekst',
    kleur: (r.kleur as Notitie['kleur']) || 'geen',
    etiketten: Array.isArray(r.etiketten) ? r.etiketten.map(String) : [],
    vast: Boolean(r.vast_sinds),
    gearchiveerdOp: r.gearchiveerd_op ? iso(r.gearchiveerd_op) : null,
  };
  const tags = spiegelEtiketten(n);
  await q(
    `INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, author, tags, ruimte, created_at, updated_at)
     VALUES ($1, $2, 'note', $3, $4, NULL, $5, $6, $7, $8::timestamptz, $9::timestamptz)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at`,
    [
      String(r.id),
      lade.userId,
      spiegelTitel(String(r.titel || '')),
      spiegelTekst(String(r.inhoud_md || '')),
      String(r.auteur || 'operator').slice(0, 80),
      tags,
      lade.ruimte,
      iso(r.created_at) || new Date().toISOString(),
      iso(r.updated_at) || new Date().toISOString(),
    ],
  );
}

/** Перетворення нотатки або невиконаних пунктів списку на завдання простору в app.mcp_console_items зі зворотним посиланням bronNotitie. */
export async function maakTaakUitNotitie(
  lade: Lade,
  invoer: { notitieId: unknown; titel?: unknown; uitChecklist?: boolean; actor?: string },
): Promise<{ ok: true; aangemaakt: NotitieTaakVerwijzing[]; takenIds: string[] } | { ok: false; fout: string }> {
  if (!isUuid(invoer.notitieId)) return { ok: false, fout: 'ID_ONGELDIG' };
  const actor = kort(invoer.actor || 'operator', 80) || 'operator';

  const uitslag = await inLade(lade, async (q) => {
    const cur = (
      await q(
        `SELECT * FROM app.notities WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)} AND verwijderd_op IS NULL LIMIT 1`,
        [lade.userId, invoer.notitieId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!cur) return { ok: false as const, fout: 'NIET_GEVONDEN' };

    const bestaandeIds = Array.isArray(cur.taken_ids) ? cur.taken_ids.map(String) : [];
    const ruimteOver = 50 - bestaandeIds.length;
    if (ruimteOver <= 0) return { ok: false as const, fout: 'TAKEN_LIMIET_BEREIKT' };

    let titels: string[] = [];
    if (invoer.uitChecklist === true) {
      titels = openTakenUitChecklist(String(cur.inhoud_md || '')).slice(0, Math.min(20, ruimteOver));
      if (!titels.length) return { ok: false as const, fout: 'GEEN_OPEN_PUNTEN' };
    } else {
      const enkeleTitel = kort(invoer.titel || cur.titel, SPIEGEL_MAX_TITEL);
      if (!enkeleTitel) return { ok: false as const, fout: 'TITEL_ONGELDIG' };
      titels = [enkeleTitel];
    }

    const terugVerwijzing = `bronNotitie: /notities?open_item_id=${cur.id}`;
    const samenvatting = kort(cur.inhoud_plat || '', 1200);
    const aangemaakt: NotitieTaakVerwijzing[] = [];
    const nieuweIds: string[] = [];

    for (const taakTitel of titels) {
      const taakId = randomUUID();
      const lichaam = (invoer.uitChecklist ? terugVerwijzing : `${terugVerwijzing}${samenvatting ? `\n\n${samenvatting}` : ''}`).slice(0, SPIEGEL_MAX_TEKST);
      const { rows } = await q(
        `INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, author, tags, ruimte)
         VALUES ($1::uuid, $2, 'task', $3, $4, 'backlog', $5, $6::text[], $7)
         RETURNING id, title, status`,
        [taakId, lade.userId, taakTitel, lichaam, actor, ['uit-notitie'], lade.ruimte],
      );
      const rij = rows[0] as { id: string; title: string; status: string };
      nieuweIds.push(String(rij.id));
      aangemaakt.push({
        id: String(rij.id),
        titel: String(rij.title),
        status: String(rij.status || 'backlog'),
        doelPad: `/bord?doel=bord:${rij.id}`,
      });
    }

    const samengevoegd = [...new Set([...bestaandeIds, ...nieuweIds])].slice(0, 50);
    const bijgewerkt = await q(
      `UPDATE app.notities SET taken_ids = $3::uuid[], updated_at = now()
        WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)}
        RETURNING *`,
      [lade.userId, invoer.notitieId, samengevoegd],
    );
    if (bijgewerkt.rows[0]) await spiegelNotitieBijwerken(q, lade, bijgewerkt.rows[0]);
    return { ok: true as const, aangemaakt, takenIds: samengevoegd };
  });

  if (uitslag.ok) {
    await auditToevoegen({
      ownerId: lade.userId,
      actorId: lade.userId,
      action: 'notitie.taak.aangemaakt',
      type: 'bord',
      result: 'ok',
      details: { notitieId: invoer.notitieId, aantal: uitslag.aangemaakt.length, ruimte: lade.ruimte },
    }).catch(() => undefined);
  }
  return uitslag;
}

/** Читає живий стан створених завдань простору для нотатки. */
export async function takenVanNotitie(lade: Lade, takenIds: readonly string[]): Promise<NotitieTaakVerwijzing[]> {
  const geldige = takenIds.filter(isUuid).slice(0, 50);
  if (!geldige.length) return [];
  return inLade(lade, async (q) => {
    const { rows } = await q(
      `SELECT id, title, status FROM app.mcp_console_items
        WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND kind = 'task' AND id = ANY($2::uuid[])`,
      [lade.userId, geldige],
    );
    const kaart = new Map(rows.map((r) => [String(r.id), r]));
    const uit: NotitieTaakVerwijzing[] = [];
    for (const id of geldige) {
      const r = kaart.get(id);
      if (!r) continue;
      uit.push({
        id,
        titel: String(r.title || ''),
        status: String(r.status || 'backlog'),
        doelPad: `/bord?doel=bord:${id}`,
      });
    }
    return uit;
  });
}

async function veiligeCloudLade(lade: Lade): Promise<{ ok: true; lade: Lade } | { ok: false; reden: string }> {
  const besluit = await ruimtePoort({ userId: lade.userId, aiRuimte: lade.ruimte }, 'cloud');
  if (!besluit.ok) return { ok: false, reden: besluit.code };
  if (lade.ruimte === 'technisch' && besluit.lade.ruimte !== 'technisch') {
    return { ok: false, reden: 'CLOUD_GEDEELD_NIET_VOOR_TECHNISCHE_NOTITIE' };
  }
  return { ok: true, lade: besluit.lade };
}

/** Перелік власних файлів активного простору зі Сховища cloud-vnext без читання вмісту з диска. */
export async function cloudBestandenKiezerLijst(
  lade: Lade,
  zoek?: unknown,
): Promise<{ bestanden: NotitieBestandVerwijzing[]; reden?: string }> {
  const poort = await veiligeCloudLade(lade);
  if (!poort.ok) return { bestanden: [], reden: poort.reden };
  const vraag = kort(zoek, 120).toLowerCase();
  const inv = await metLade(poort.lade, 'cloud', () => leesLadeInventarisVoorDelen(poort.lade));
  const gefilterd = inv.bestanden
    .filter((b) => !vraag || b.naam.toLowerCase().includes(vraag))
    .slice(0, 50)
    .map((b) => ({
      id: b.id,
      naam: b.naam,
      mime: b.mime,
      bytes: b.bytes,
      soort: b.soort,
      doelPad: `/bestanden?open_item_id=${encodeURIComponent(b.id)}`,
    }));
  return { bestanden: gefilterd };
}

/** Читає метадані прикріплених до нотатки файлів зі Сховища cloud-vnext без читання байтів. */
export async function bestandenVanNotitie(lade: Lade, bestandIds: readonly string[]): Promise<NotitieBestandVerwijzing[]> {
  const schoon = bestandIds.map((x) => kort(x, 120)).filter(Boolean).slice(0, 50);
  if (!schoon.length) return [];
  const poort = await veiligeCloudLade(lade);
  if (!poort.ok) return [];
  const uit: NotitieBestandVerwijzing[] = [];
  await metLade(poort.lade, 'cloud', async () => {
    for (const id of schoon) {
      const gelezen = await leesLadeBestandVoorDelen(poort.lade, id, { enkelMeta: true }).catch(() => null);
      if (!gelezen) continue;
      const b = gelezen.bestand;
      uit.push({
        id: b.id,
        naam: b.naam,
        mime: b.mime,
        bytes: b.bytes,
        soort: b.soort,
        doelPad: `/bestanden?open_item_id=${encodeURIComponent(b.id)}`,
      });
    }
  });
  return uit;
}

/** Прикріплення або від'єднання посилання на власний файл Сховища без дублювання байтів зі збереженням синхронізації дзеркала дошки. */
export async function koppelBestandAanNotitie(
  lade: Lade,
  invoer: { notitieId: unknown; bestandId: unknown; actie: unknown; actor?: string },
): Promise<{ ok: true; cloudBestandIds: string[]; bestanden: NotitieBestandVerwijzing[] } | { ok: false; fout: string }> {
  if (!isUuid(invoer.notitieId)) return { ok: false, fout: 'ID_ONGELDIG' };
  const bestandId = kort(invoer.bestandId, 120);
  if (!bestandId) return { ok: false, fout: 'BESTAND_NIET_GEVONDEN' };
  const actie = invoer.actie === 'ontkoppel' ? 'ontkoppel' : invoer.actie === 'koppel' ? 'koppel' : '';
  if (!actie) return { ok: false, fout: 'ACTIE_ONGELDIG' };

  if (actie === 'koppel') {
    const poort = await veiligeCloudLade(lade);
    if (!poort.ok) return { ok: false, fout: poort.reden };
    const meta = await metLade(poort.lade, 'cloud', () => leesLadeBestandVoorDelen(poort.lade, bestandId, { enkelMeta: true }));
    if (!meta) return { ok: false, fout: 'BESTAND_NIET_GEVONDEN' };
  }

  const uitslag = await inLade(lade, async (q) => {
    const cur = (
      await q(
        `SELECT * FROM app.notities WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)} AND verwijderd_op IS NULL LIMIT 1`,
        [lade.userId, invoer.notitieId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!cur) return { ok: false as const, fout: 'NIET_GEVONDEN' };

    const huidig = Array.isArray(cur.cloud_bestand_ids) ? cur.cloud_bestand_ids.map(String) : [];
    let volgende: string[];
    if (actie === 'koppel') {
      if (!huidig.includes(bestandId) && huidig.length >= 50) return { ok: false as const, fout: 'BESTANDEN_LIMIET_BEREIKT' };
      volgende = huidig.includes(bestandId) ? huidig : [...huidig, bestandId];
    } else {
      volgende = huidig.filter((x) => x !== bestandId);
    }

    const bijgewerkt = await q(
      `UPDATE app.notities SET cloud_bestand_ids = $3::text[], updated_at = now()
        WHERE id = $2::uuid AND ${sqlLadeWaar('ruimte', lade, 1)}
        RETURNING *`,
      [lade.userId, invoer.notitieId, volgende],
    );
    if (bijgewerkt.rows[0]) await spiegelNotitieBijwerken(q, lade, bijgewerkt.rows[0]);
    return { ok: true as const, cloudBestandIds: volgende };
  });

  if (!uitslag.ok) return uitslag;

  await auditToevoegen({
    ownerId: lade.userId,
    actorId: lade.userId,
    action: actie === 'koppel' ? 'notitie.bestand.gekoppeld' : 'notitie.bestand.ontkoppeld',
    type: 'bord',
    result: 'ok',
    details: { notitieId: invoer.notitieId, ruimte: lade.ruimte },
  }).catch(() => undefined);

  return {
    ok: true,
    cloudBestandIds: uitslag.cloudBestandIds,
    bestanden: await bestandenVanNotitie(lade, uitslag.cloudBestandIds),
  };
}

// ------------------------------------------------------------------------------- безвмістові переходи учасника події
export type DeelnemerSprongUitslag =
  | { ok: true; doel: 'mail'; pad: string }
  | { ok: true; doel: 'contact'; sprongId: string; pad: string }
  | { ok: false; fout: string };

/** Безпечний перехід із картки події до листів або контакту учасника без передавання електронної пошти в URL. */
export async function maakDeelnemerSprong(
  lade: Lade,
  emailRuw: unknown,
  doelRuw: unknown,
): Promise<DeelnemerSprongUitslag> {
  const email = kort(emailRuw, 320).toLowerCase();
  if (!EPOST.test(email)) return { ok: false, fout: 'DEELNEMER_EMAIL_ONGELDIG' };
  const doel = doelRuw === 'contact' ? 'contact' : doelRuw === 'mail' ? 'mail' : '';
  if (!doel) return { ok: false, fout: 'SPRONG_DOEL_ONGELDIG' };

  const nu = Date.now();
  if (doel === 'mail') {
    const [principals, mailAccounts] = await Promise.all([
      db.list<Record<string, unknown>>('provider_principals_v1', { filter: { ownerUserId: lade.userId }, limit: 25 }).catch(() => ({ items: [] })),
      db.list<Record<string, unknown>>('mail_accounts_v2', { filter: { ownerUserId: lade.userId }, limit: 25 }).catch(() => ({ items: [] })),
    ]);
    const accountIds = new Set<string>(['local']);
    for (const p of principals.items as Array<Record<string, unknown> & { id: string }>) {
      if (hoortBij(p as { ownerUserId?: unknown; ruimte?: unknown }, lade) && p.id) accountIds.add(String(p.id));
    }
    for (const m of mailAccounts.items as Array<Record<string, unknown> & { id: string }>) {
      if (hoortBij(m as { ownerUserId?: unknown; ruimte?: unknown }, lade) && m.id) accountIds.add(String(m.id));
    }

    const query = `from:${email}`;
    for (const accountId of [...accountIds].slice(0, 10)) {
      const bestaand = await db.list<Record<string, unknown>>(COGNITIVE_RESUME_TABEL, {
        filter: { ownerUserId: lade.userId, service: 'mail', accountId },
        limit: 5,
      });
      const eerste = (bestaand.items as Array<Record<string, unknown> & { id: string }>).sort(
        (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
      )[0];
      const record = {
        ownerUserId: lade.userId,
        service: 'mail',
        accountId,
        tab: 'all',
        containerId: '',
        resourceId: '',
        query,
        scrollTop: 0,
        viewMode: 'mail-search-all',
        path: [],
        draftId: '',
        viewerPosition: '',
        density: 'normal',
        createdAt: Number(eerste?.createdAt || nu),
        updatedAt: nu,
      };
      if (eerste?.id) await db.update(COGNITIVE_RESUME_TABEL, [{ id: eerste.id, record }]);
      else await db.add(COGNITIVE_RESUME_TABEL, [record]);
    }
    return { ok: true, doel: 'mail', pad: '/all?resume_context=1' };
  }

  // Одноразовий короткочасний квиток переходу до картки контакту без електронної адреси в URL.
  const oude = await db.list<Record<string, unknown>>(CONTACT_SPRONG_TABEL, { filter: { ownerUserId: lade.userId }, limit: 50 }).catch(() => ({ items: [] }));
  const verlopenIds = (oude.items as Array<Record<string, unknown> & { id: string }>)
    .filter((r) => Number(r.verlooptOp || 0) < nu)
    .map((r) => r.id);
  if (verlopenIds.length > 0) await db.delete(CONTACT_SPRONG_TABEL, verlopenIds).catch(() => undefined);

  const [sprongId] = await db.add(CONTACT_SPRONG_TABEL, [
    {
      ownerUserId: lade.userId,
      ruimte: lade.ruimte,
      adres: email,
      aangemaaktOp: nu,
      verlooptOp: nu + CONTACT_SPRONG_TTL_MS,
    },
  ]);
  if (!sprongId) return { ok: false, fout: 'SPRONG_OPSLAAN_MISLUKT' };
  return {
    ok: true,
    doel: 'contact',
    sprongId,
    pad: `/contacts?contact_sprong=${encodeURIComponent(sprongId)}`,
  };
}

/** Одноразовий обмін квитка ?contact_sprong=<uuid> на електронну адресу учасника в межах того самого користувача й простору. */
export async function leesEnWisContactSprong(
  userId: string,
  ruimte: 'prive' | 'technisch',
  sprongIdRuw: unknown,
): Promise<{ ok: true; adres: string } | { ok: false; fout: string }> {
  const sprongId = kort(sprongIdRuw, 80);
  if (!isUuid(sprongId)) return { ok: false, fout: 'SPRONG_ONGELDIG' };
  const [rij] = await db.get<Record<string, unknown>>(CONTACT_SPRONG_TABEL, [sprongId]);
  if (!rij || String(rij.ownerUserId || '') !== userId || (String(rij.ruimte || 'prive') !== ruimte)) {
    return { ok: false, fout: 'SPRONG_ONBEKEND' };
  }
  await db.delete(CONTACT_SPRONG_TABEL, [sprongId]);
  if (Number(rij.verlooptOp || 0) < Date.now()) {
    return { ok: false, fout: 'SPRONG_VERLOPEN' };
  }
  const adres = kort(rij.adres, 320).toLowerCase();
  if (!EPOST.test(adres)) return { ok: false, fout: 'SPRONG_ONGELDIG' };
  return { ok: true, adres };
}
