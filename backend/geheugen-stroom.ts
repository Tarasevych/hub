// Серверне ядро «Стріму пам’яті» (Stroom van geheugen, migratie 0279):
//   - Ізоляція за користувачем (RLS + app.huidige_gebruiker()) та за простором (ruimte: 'prive' | 'technisch');
//   - Підтримка шифрування власним ключем (dek1 через backend/sleutelkluis.ts + перешифрування);
//   - Повний граф зв’язків (замінює, підтверджує, суперечить, залежить, посилається);
//   - Детерміновані маршрути HTTP + API для вбудованого чату й MCP-інструментів.
import { createHash, randomUUID } from 'node:crypto';
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { huidigeContext } from '../server/platform/context';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { ecosysteemLade } from './ai-ecosysteem';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { huidigeNamens } from './mcp-namens';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import {
  isIngeschakeld,
  ontzegelMetDek,
  registreerHerversleutelaar,
  sleutelOpen,
  verzegelMetDek,
} from './sleutelkluis';
import type { Lade } from '../shared/ruimte-scheiding';
import { SLEUTEL_GESLOTEN_CODE, type KluisStand } from '../shared/sleutelkluis';
import { jsonbTekst } from '../shared/tekst-veilig';
import {
  bevatGevoeligGeheim,
  bouwGeheugenPakket,
  bouwGeheugenSysteemPrompt,
  GEHEUGEN_FOUTEN,
  haalGeheugenKandidatenUitTekst,
  isGeldigeGeheugenSleutel,
  isGeldigUuid,
  maakKnoopSleutelVanTitel,
  maakMarkdownExport,
  maakSamenvatting,
  normaliseerGeheugenGewicht,
  normaliseerGeheugenLabels,
  normaliseerGeheugenSleutel,
  rangschikGeheugen,
  schoonGeheugenAgent,
  schoonGeheugenDienst,
  schoonGeheugenSoort,
  schoonGeheugenStatus,
  schoonRelatieSoort,
  spoorTegenspraken,
  type GeheugenActie,
  type GeheugenGebeurtenis,
  type GeheugenKnoop,
  type GeheugenPakket,
  type GeheugenRelatie,
  type GeheugenRelatieSoort,
  type GeheugenSoort,
  type GeheugenStatus,
} from '../shared/geheugen-stroom';

const DIENSTEN = ['ai', 'mcp', 'hub', 'api', 'mail', 'cloud', 'github', 'huis'] as const;
const sys = () => getPool('systeem');

const geheugenAad = (userId: string, ruimte: string, sleutel: string) =>
  `geheugen-stroom|${userId}|${ruimte}|${sleutel}`;

const berekenInhoudHash = (titel: string, inhoud: string) =>
  createHash('sha256')
    .update(`${titel.trim().toLowerCase()}\n${inhoud.trim().toLowerCase()}`)
    .digest('hex');

const KNOOP_KOLOMMEN = `
  id, ruimte, werkruimte_id, sleutel, soort, titel, inhoud, samenvatting,
  inhoud_versleuteld, inhoud_hash, bron_dienst, bron_agent, labels, status,
  vastgepind, gewicht,
  (extract(epoch FROM geldig_vanaf) * 1000)::bigint AS geldig_vanaf,
  CASE WHEN geldig_tot IS NULL THEN NULL ELSE (extract(epoch FROM geldig_tot) * 1000)::bigint END AS geldig_tot,
  aanroepen,
  CASE WHEN laatst_geraadpleegd_op IS NULL THEN NULL ELSE (extract(epoch FROM laatst_geraadpleegd_op) * 1000)::bigint END AS laatst_geraadpleegd_op,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op,
  (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt_op
`;

const RELATIE_KOLOMMEN = `
  id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort, toelichting, sterkte,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op
`;

const GEBEURTENIS_KOLOMMEN = `
  id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op
`;

function decodeerKnoopRij(userId: string, r: Record<string, unknown>, dek: Buffer | null): GeheugenKnoop {
  const ruimte = r.ruimte === 'technisch' ? 'technisch' : 'prive';
  const sleutel = String(r.sleutel ?? '');
  const versleuteld = typeof r.inhoud_versleuteld === 'string' && r.inhoud_versleuteld.length > 0;
  let titel = String(r.titel ?? '');
  let inhoud = String(r.inhoud ?? '');
  let samenvatting = String(r.samenvatting ?? '');
  let vergrendeld = false;

  if (versleuteld) {
    if (!dek) {
      vergrendeld = true;
      titel = 'Зашифрований вузол / Versleutelde knoop';
      inhoud = '';
      samenvatting = '';
    } else {
      try {
        const ontzegeld = JSON.parse(
          ontzegelMetDek(dek, String(r.inhoud_versleuteld), geheugenAad(userId, ruimte, sleutel)),
        ) as { titel?: string; inhoud?: string; samenvatting?: string };
        titel = String(ontzegeld.titel ?? '');
        inhoud = String(ontzegeld.inhoud ?? '');
        samenvatting = String(ontzegeld.samenvatting ?? maakSamenvatting(titel, inhoud));
      } catch {
        vergrendeld = true;
        titel = 'Зашифрований вузол / Versleutelde knoop';
        inhoud = '';
        samenvatting = '';
      }
    }
  }

  return {
    id: String(r.id),
    ruimte,
    ...(r.werkruimte_id ? { werkruimteId: String(r.werkruimte_id) } : {}),
    sleutel,
    soort: schoonGeheugenSoort(r.soort),
    titel,
    inhoud,
    samenvatting: samenvatting || maakSamenvatting(titel, inhoud),
    inhoudHash: String(r.inhoud_hash ?? ''),
    bronDienst: String(r.bron_dienst ?? 'ai'),
    bronAgent: String(r.bron_agent ?? ''),
    labels: Array.isArray(r.labels) ? r.labels.map(String) : [],
    status: schoonGeheugenStatus(r.status),
    vastgepind: r.vastgepind === true,
    gewicht: Number(r.gewicht ?? 1),
    geldigVanaf: Number(r.geldig_vanaf ?? 0),
    ...(r.geldig_tot != null ? { geldigTot: Number(r.geldig_tot) } : {}),
    aanroepen: Number(r.aanroepen ?? 0),
    ...(r.laatst_geraadpleegd_op != null ? { laatstGeraadpleegdOp: Number(r.laatst_geraadpleegd_op) } : {}),
    aangemaaktOp: Number(r.aangemaakt_op ?? 0),
    bijgewerktOp: Number(r.bijgewerkt_op ?? 0),
    versleuteld,
    vergrendeld,
  };
}

function rijNaarRelatie(r: Record<string, unknown>): GeheugenRelatie {
  return {
    id: String(r.id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    bronKnoopId: String(r.bron_knoop_id),
    doelKnoopId: String(r.doel_knoop_id),
    relatieSoort: schoonRelatieSoort(r.relatie_soort),
    toelichting: String(r.toelichting ?? ''),
    sterkte: Number(r.sterkte ?? 1),
    aangemaaktOp: Number(r.aangemaakt_op ?? 0),
  };
}

function rijNaarGebeurtenis(r: Record<string, unknown>): GeheugenGebeurtenis {
  return {
    id: String(r.id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    ...(r.knoop_id ? { knoopId: String(r.knoop_id) } : {}),
    actie: String(r.actie ?? 'bijgewerkt') as GeheugenActie,
    bronAgent: String(r.bron_agent ?? ''),
    bronDienst: String(r.bron_dienst ?? 'ai'),
    details: r.details && typeof r.details === 'object' ? (r.details as Record<string, unknown>) : {},
    aangemaaktOp: Number(r.aangemaakt_op ?? 0),
  };
}

// Автоматичне перешифрування відкритих вузлів пам’яті під час увімкнення чи перешифрування Сховища ключів (0092).
registreerHerversleutelaar('app.geheugen_stroom_knopen', async (lade, dek) => {
  const rijen = await sys().query(
    `SELECT id, sleutel, titel, inhoud, samenvatting
       FROM app.geheugen_stroom_knopen
      WHERE user_id = $1 AND ruimte = $2 AND inhoud_versleuteld IS NULL`,
    [lade.userId, lade.ruimte],
  );
  let herversleuteld = 0;
  for (const raw of rijen.rows) {
    const r = raw as Record<string, unknown>;
    const sleutel = String(r.sleutel ?? '');
    const titel = String(r.titel ?? '');
    const inhoud = String(r.inhoud ?? '');
    const samenvatting = String(r.samenvatting ?? maakSamenvatting(titel, inhoud));
    const envelop = verzegelMetDek(
      dek,
      JSON.stringify({ titel, inhoud, samenvatting }),
      geheugenAad(lade.userId, lade.ruimte, sleutel),
    );
    await sys().query(
      `UPDATE app.geheugen_stroom_knopen
          SET titel = '', inhoud = '', samenvatting = '', inhoud_versleuteld = $3, bijgewerkt_op = now()
        WHERE id = $1 AND user_id = $2`,
      [String(r.id), lade.userId, envelop],
    );
    herversleuteld++;
  }
  return { gevonden: rijen.rows.length, herversleuteld };
});

export interface BewaarKnoopInvoer {
  id?: string;
  sleutel?: string;
  soort?: GeheugenSoort;
  titel: string;
  inhoud: string;
  samenvatting?: string;
  werkruimteId?: string;
  bronDienst?: string;
  bronAgent?: string;
  labels?: string[] | string;
  vastgepind?: boolean;
  gewicht?: number;
  geldigTot?: number | string | null;
  vervangtId?: string;
  vervangtSleutel?: string;
}

export interface StroomOverzicht {
  sleutelStand: KluisStand;
  knopen: GeheugenKnoop[];
  relaties: GeheugenRelatie[];
  gebeurtenissen: GeheugenGebeurtenis[];
}

export interface StroomOpslag {
  leesAlles: (lade: Lade) => Promise<StroomOverzicht>;
  bewaarKnoop: (
    lade: Lade,
    invoer: BewaarKnoopInvoer,
    agentHint?: string,
  ) => Promise<{ ok: true; knoop: GeheugenKnoop; nieuw: boolean } | { ok: false; code: string }>;
  zetRelatie: (
    lade: Lade,
    invoer: {
      actie: 'aanmaken' | 'verwijderen';
      relatieId?: string;
      bronKnoopId: string;
      doelKnoopId: string;
      relatieSoort?: GeheugenRelatieSoort;
      toelichting?: string;
      sterkte?: number;
      agentHint?: string;
    },
  ) => Promise<{ ok: true; relatie?: GeheugenRelatie } | { ok: false; code: string }>;
  zetStatus: (
    lade: Lade,
    invoer: {
      id: string;
      status?: GeheugenStatus;
      vastgepind?: boolean;
      verwijder?: boolean;
      agentHint?: string;
    },
  ) => Promise<{ ok: true; knoop?: GeheugenKnoop; verwijderd?: boolean } | { ok: false; code: string }>;
  registreerRaadpleging: (
    lade: Lade,
    knoopIds: readonly string[],
    vraag: string,
    agentHint?: string,
    bronDienst?: string,
  ) => Promise<void>;
}

async function bepaalKluisStandEnDek(lade: Lade): Promise<{ stand: KluisStand; dek: Buffer | null }> {
  try {
    const aan = await isIngeschakeld({ userId: lade.userId, ruimte: lade.ruimte });
    if (!aan) return { stand: 'uit', dek: null };
    const dek = sleutelOpen({ userId: lade.userId, ruimte: lade.ruimte });
    return dek ? { stand: 'open', dek } : { stand: 'gesloten', dek: null };
  } catch {
    return { stand: 'uit', dek: null };
  }
}

export const pgStroomOpslag: StroomOpslag = {
  async leesAlles(lade) {
    const { stand, dek } = await bepaalKluisStandEnDek(lade);
    return alsGebruiker(lade.userId, async (q) => {
      const [knRes, relRes, gebRes] = await Promise.all([
        q(
          `SELECT ${KNOOP_KOLOMMEN}
             FROM app.geheugen_stroom_knopen
            WHERE user_id = $1 AND ruimte = $2
            ORDER BY vastgepind DESC, bijgewerkt_op DESC
            LIMIT 400`,
          [lade.userId, lade.ruimte],
        ),
        q(
          `SELECT ${RELATIE_KOLOMMEN}
             FROM app.geheugen_stroom_relaties
            WHERE user_id = $1 AND ruimte = $2
            ORDER BY aangemaakt_op DESC
            LIMIT 600`,
          [lade.userId, lade.ruimte],
        ),
        q(
          `SELECT ${GEBEURTENIS_KOLOMMEN}
             FROM app.geheugen_stroom_gebeurtenissen
            WHERE user_id = $1 AND ruimte = $2
            ORDER BY aangemaakt_op DESC
            LIMIT 80`,
          [lade.userId, lade.ruimte],
        ),
      ]);

      return {
        sleutelStand: stand,
        knopen: knRes.rows.map((r) => decodeerKnoopRij(lade.userId, r as Record<string, unknown>, dek)),
        relaties: relRes.rows.map((r) => rijNaarRelatie(r as Record<string, unknown>)),
        gebeurtenissen: gebRes.rows.map((r) => rijNaarGebeurtenis(r as Record<string, unknown>)),
      };
    });
  },

  async bewaarKnoop(lade, invoer, agentHint = '') {
    const titel = String(invoer.titel ?? '').trim().slice(0, 200);
    const inhoud = String(invoer.inhoud ?? '').trim().slice(0, 8000);
    if (!titel || !inhoud) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
    if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(inhoud) || bevatGevoeligGeheim(invoer.samenvatting)) {
      return { ok: false, code: GEHEUGEN_FOUTEN.geheimGeweigerd };
    }

    const { stand, dek } = await bepaalKluisStandEnDek(lade);
    if (stand === 'gesloten') {
      throw new Error(SLEUTEL_GESLOTEN_CODE);
    }

    const soort = schoonGeheugenSoort(invoer.soort);
    const bronDienst = schoonGeheugenDienst(invoer.bronDienst);
    const bronAgent = schoonGeheugenAgent(invoer.bronAgent || agentHint);
    const labels = normaliseerGeheugenLabels(invoer.labels);
    const vastgepind = invoer.vastgepind === true;
    const gewicht = normaliseerGeheugenGewicht(invoer.gewicht);
    const werkruimteId = invoer.werkruimteId && isGeldigUuid(invoer.werkruimteId) ? invoer.werkruimteId.trim() : null;
    const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 600) || maakSamenvatting(titel, inhoud);
    const inhoudHash = berekenInhoudHash(titel, inhoud);

    let geldigTotIso: string | null = null;
    if (invoer.geldigTot !== undefined && invoer.geldigTot !== null && invoer.geldigTot !== '') {
      const ms = typeof invoer.geldigTot === 'number' ? invoer.geldigTot : Date.parse(String(invoer.geldigTot));
      if (Number.isFinite(ms) && ms > 0) geldigTotIso = new Date(ms).toISOString();
    }

    const sleutel = invoer.sleutel && isGeldigeGeheugenSleutel(invoer.sleutel)
      ? invoer.sleutel.trim().toLowerCase()
      : invoer.sleutel
        ? normaliseerGeheugenSleutel(invoer.sleutel, soort)
        : maakKnoopSleutelVanTitel(titel);

    const kluisEnvelop =
      stand === 'open' && dek
        ? verzegelMetDek(dek, JSON.stringify({ titel, inhoud, samenvatting }), geheugenAad(lade.userId, lade.ruimte, sleutel))
        : null;

    const dbTitel = kluisEnvelop ? '' : titel;
    const dbInhoud = kluisEnvelop ? '' : inhoud;
    const dbSamenvatting = kluisEnvelop ? '' : samenvatting;

    return alsGebruiker(lade.userId, async (q) => {
      if (werkruimteId) {
        const wrCheck = await q(
          `SELECT 1 FROM app.ai_agent_werkruimtes WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [werkruimteId, lade.userId, lade.ruimte],
        );
        if (!wrCheck.rows[0]) {
          return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
        }
      }

      const bestaand = await q(
        `SELECT id FROM app.geheugen_stroom_knopen WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`,
        [lade.userId, lade.ruimte, sleutel],
      );
      const nieuw = bestaand.rows.length === 0;

      const res = await q(
        `INSERT INTO app.geheugen_stroom_knopen
          (user_id, ruimte, werkruimte_id, sleutel, soort, titel, inhoud, samenvatting, inhoud_versleuteld, inhoud_hash,
           bron_dienst, bron_agent, labels, status, vastgepind, gewicht, geldig_tot)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], 'actief', $14, $15, $16::timestamptz)
         ON CONFLICT (user_id, ruimte, sleutel)
         DO UPDATE SET
           werkruimte_id = COALESCE(EXCLUDED.werkruimte_id, app.geheugen_stroom_knopen.werkruimte_id),
           soort = EXCLUDED.soort,
           titel = EXCLUDED.titel,
           inhoud = EXCLUDED.inhoud,
           samenvatting = EXCLUDED.samenvatting,
           inhoud_versleuteld = EXCLUDED.inhoud_versleuteld,
           inhoud_hash = EXCLUDED.inhoud_hash,
           bron_dienst = EXCLUDED.bron_dienst,
           bron_agent = CASE WHEN EXCLUDED.bron_agent = '' THEN app.geheugen_stroom_knopen.bron_agent ELSE EXCLUDED.bron_agent END,
           labels = EXCLUDED.labels,
           status = 'actief',
           vastgepind = EXCLUDED.vastgepind,
           gewicht = EXCLUDED.gewicht,
           geldig_tot = EXCLUDED.geldig_tot,
           bijgewerkt_op = now()
         RETURNING ${KNOOP_KOLOMMEN}`,
        [
          lade.userId,
          lade.ruimte,
          werkruimteId,
          sleutel,
          soort,
          dbTitel,
          dbInhoud,
          dbSamenvatting,
          kluisEnvelop,
          inhoudHash,
          bronDienst,
          bronAgent,
          labels,
          vastgepind,
          gewicht,
          geldigTotIso,
        ],
      );

      const knoop = decodeerKnoopRij(lade.userId, res.rows[0] as Record<string, unknown>, dek);

      await q(
        `INSERT INTO app.geheugen_stroom_gebeurtenissen (user_id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7::jsonb)`,
        [
          lade.userId,
          lade.ruimte,
          knoop.id,
          nieuw ? 'aangemaakt' : 'bijgewerkt',
          bronAgent,
          bronDienst,
          jsonbTekst({ sleutel: knoop.sleutel, soort: knoop.soort, versleuteld: Boolean(kluisEnvelop) }),
        ],
      );

      // Якщо цей вузол замінює попередній — автоматично будуємо ребро «vervangt» і позначаємо старий застарілим.
      let vervangDoelId = invoer.vervangtId && isGeldigUuid(invoer.vervangtId) ? invoer.vervangtId.trim() : '';
      if (!vervangDoelId && invoer.vervangtSleutel) {
        const doelRes = await q(
          `SELECT id FROM app.geheugen_stroom_knopen WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`,
          [lade.userId, lade.ruimte, normaliseerGeheugenSleutel(invoer.vervangtSleutel)],
        );
        vervangDoelId = doelRes.rows[0]?.id ? String(doelRes.rows[0].id) : '';
      }
      if (vervangDoelId && vervangDoelId !== knoop.id) {
        await q(
          `INSERT INTO app.geheugen_stroom_relaties (user_id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort, toelichting)
           VALUES ($1, $2, $3::uuid, $4::uuid, 'vervangt', $5)
           ON CONFLICT (user_id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort) DO NOTHING`,
          [lade.userId, lade.ruimte, knoop.id, vervangDoelId, 'Автоматичне оновлення знання / Automatische opvolging'],
        );
        await q(
          `UPDATE app.geheugen_stroom_knopen
              SET status = 'verouderd', bijgewerkt_op = now()
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [vervangDoelId, lade.userId, lade.ruimte],
        );
        await q(
          `INSERT INTO app.geheugen_stroom_gebeurtenissen (user_id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details)
           VALUES ($1, $2, $3::uuid, 'vervangen', $4, $5, $6::jsonb)`,
          [lade.userId, lade.ruimte, vervangDoelId, bronAgent, bronDienst, jsonbTekst({ vervangenDoorId: knoop.id })],
        );
      }

      return { ok: true, knoop, nieuw };
    });
  },

  async zetRelatie(lade, invoer) {
    if (invoer.actie === 'verwijderen') {
      if (!invoer.relatieId || !isGeldigUuid(invoer.relatieId)) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
      return alsGebruiker(lade.userId, async (q) => {
        const res = await q(
          `DELETE FROM app.geheugen_stroom_relaties WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [invoer.relatieId, lade.userId, lade.ruimte],
        );
        return (res.rowCount || 0) > 0 ? { ok: true } : { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
      });
    }

    if (!isGeldigUuid(invoer.bronKnoopId) || !isGeldigUuid(invoer.doelKnoopId)) {
      return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
    }
    if (invoer.bronKnoopId === invoer.doelKnoopId) {
      return { ok: false, code: GEHEUGEN_FOUTEN.zelfRelatie };
    }
    const relatieSoort = schoonRelatieSoort(invoer.relatieSoort);
    const toelichting = String(invoer.toelichting ?? '').trim().slice(0, 600);
    if (bevatGevoeligGeheim(toelichting)) return { ok: false, code: GEHEUGEN_FOUTEN.geheimGeweigerd };
    const sterkte = Math.max(0.1, Math.min(3.0, Number(invoer.sterkte) || 1.0));
    const bronAgent = schoonGeheugenAgent(invoer.agentHint);

    return alsGebruiker(lade.userId, async (q) => {
      const check = await q(
        `SELECT id FROM app.geheugen_stroom_knopen WHERE user_id = $1 AND ruimte = $2 AND id IN ($3::uuid, $4::uuid)`,
        [lade.userId, lade.ruimte, invoer.bronKnoopId, invoer.doelKnoopId],
      );
      if (check.rows.length < 2) return { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };

      const res = await q(
        `INSERT INTO app.geheugen_stroom_relaties (user_id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort, toelichting, sterkte)
         VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7)
         ON CONFLICT (user_id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort)
         DO UPDATE SET toelichting = EXCLUDED.toelichting, sterkte = EXCLUDED.sterkte
         RETURNING ${RELATIE_KOLOMMEN}`,
        [lade.userId, lade.ruimte, invoer.bronKnoopId, invoer.doelKnoopId, relatieSoort, toelichting, sterkte],
      );
      const relatie = rijNaarRelatie(res.rows[0] as Record<string, unknown>);

      if (relatieSoort === 'vervangt') {
        await q(
          `UPDATE app.geheugen_stroom_knopen
              SET status = 'verouderd', bijgewerkt_op = now()
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3 AND status = 'actief'`,
          [invoer.doelKnoopId, lade.userId, lade.ruimte],
        );
      }

      const actie: GeheugenActie = relatieSoort === 'vervangt'
        ? 'vervangen'
        : relatieSoort === 'spreekt_tegen'
          ? 'tegenspraak_gemarkeerd'
          : 'bijgewerkt';

      await q(
        `INSERT INTO app.geheugen_stroom_gebeurtenissen (user_id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details)
         VALUES ($1, $2, $3::uuid, $4, $5, 'ai', $6::jsonb)`,
        [lade.userId, lade.ruimte, invoer.bronKnoopId, actie, bronAgent, jsonbTekst({ relatieSoort, doelKnoopId: invoer.doelKnoopId })],
      );

      return { ok: true, relatie };
    });
  },

  async zetStatus(lade, invoer) {
    if (!isGeldigUuid(invoer.id)) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
    const { stand, dek } = await bepaalKluisStandEnDek(lade);
    const bronAgent = schoonGeheugenAgent(invoer.agentHint);

    return alsGebruiker(lade.userId, async (q) => {
      const bestaandRes = await q(
        `SELECT ${KNOOP_KOLOMMEN} FROM app.geheugen_stroom_knopen WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
        [invoer.id, lade.userId, lade.ruimte],
      );
      if (!bestaandRes.rows[0]) return { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
      if (stand === 'gesloten' && Boolean((bestaandRes.rows[0] as Record<string, unknown>).inhoud_versleuteld)) {
        throw new Error(SLEUTEL_GESLOTEN_CODE);
      }

      if (invoer.verwijder) {
        const res = await q(
          `DELETE FROM app.geheugen_stroom_knopen WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [invoer.id, lade.userId, lade.ruimte],
        );
        return (res.rowCount || 0) > 0 ? { ok: true, verwijderd: true } : { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
      }

      const oud = decodeerKnoopRij(lade.userId, bestaandRes.rows[0] as Record<string, unknown>, dek);

      const nieuweStatus = invoer.status ? schoonGeheugenStatus(invoer.status) : oud.status;
      const nieuwVastgepind = typeof invoer.vastgepind === 'boolean' ? invoer.vastgepind : oud.vastgepind;

      const updRes = await q(
        `UPDATE app.geheugen_stroom_knopen
            SET status = $4, vastgepind = $5, bijgewerkt_op = now()
          WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
          RETURNING ${KNOOP_KOLOMMEN}`,
        [invoer.id, lade.userId, lade.ruimte, nieuweStatus, nieuwVastgepind],
      );
      const knoop = decodeerKnoopRij(lade.userId, updRes.rows[0] as Record<string, unknown>, dek);

      let actie: GeheugenActie = 'bijgewerkt';
      if (typeof invoer.vastgepind === 'boolean' && invoer.vastgepind !== oud.vastgepind) {
        actie = nieuwVastgepind ? 'vastgepind' : 'ontpind';
      } else if (nieuweStatus === 'gearchiveerd' || nieuweStatus === 'herroepen') {
        actie = 'gearchiveerd';
      } else if (nieuweStatus === 'actief' && oud.status !== 'actief') {
        actie = 'hersteld';
      }

      await q(
        `INSERT INTO app.geheugen_stroom_gebeurtenissen (user_id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details)
         VALUES ($1, $2, $3::uuid, $4, $5, 'ai', $6::jsonb)`,
        [lade.userId, lade.ruimte, knoop.id, actie, bronAgent, jsonbTekst({ status: knoop.status, vastgepind: knoop.vastgepind })],
      );

      return { ok: true, knoop };
    });
  },

  async registreerRaadpleging(lade, knoopIds, vraag, agentHint = '', bronDienst = 'ai') {
    if (huidigeContext()?.alleenLezen) return;
    const geldigeIds = knoopIds.filter((id) => isGeldigUuid(id)).slice(0, 30);
    if (!geldigeIds.length) return;
    const bronAgent = schoonGeheugenAgent(agentHint);
    const dienst = schoonGeheugenDienst(bronDienst);

    await alsGebruiker(lade.userId, async (q) => {
      await q(
        `UPDATE app.geheugen_stroom_knopen
            SET aanroepen = aanroepen + 1,
                laatst_geraadpleegd_op = now()
          WHERE user_id = $1 AND ruimte = $2 AND id = ANY($3::uuid[])`,
        [lade.userId, lade.ruimte, geldigeIds],
      );
      await q(
        `INSERT INTO app.geheugen_stroom_gebeurtenissen (user_id, ruimte, knoop_id, actie, bron_agent, bron_dienst, details)
         VALUES ($1, $2, $3::uuid, 'pakket_opgebouwd', $4, $5, $6::jsonb)`,
        [
          lade.userId,
          lade.ruimte,
          geldigeIds[0],
          bronAgent,
          dienst,
          jsonbTekst({ aantalKnopen: geldigeIds.length, vraag: String(vraag || '').slice(0, 140) }),
        ],
      );
    }).catch(() => undefined);
  },
};

/** Сховище в оперативній пам’яті для детермінованих одиничних тестів (з повною ізоляцією userId + ruimte). */
export function maakGeheugenInGeheugenOpslag(): StroomOpslag {
  const knopen = new Map<string, GeheugenKnoop & { userId: string }>();
  const relaties = new Map<string, GeheugenRelatie & { userId: string }>();
  const gebeurtenissen: Array<GeheugenGebeurtenis & { userId: string }> = [];

  const logEvent = (
    lade: Lade,
    knoopId: string | undefined,
    actie: GeheugenActie,
    bronAgent: string,
    bronDienst: string,
    details: Record<string, unknown>,
  ) => {
    gebeurtenissen.unshift({
      id: String(gebeurtenissen.length + 1),
      userId: lade.userId,
      ruimte: lade.ruimte,
      knoopId,
      actie,
      bronAgent,
      bronDienst,
      details,
      aangemaaktOp: Date.now(),
    });
  };

  return {
    async leesAlles(lade) {
      return {
        sleutelStand: 'uit',
        knopen: [...knopen.values()]
          .filter((k) => k.userId === lade.userId && k.ruimte === lade.ruimte)
          .sort((a, b) => Number(b.vastgepind) - Number(a.vastgepind) || b.bijgewerktOp - a.bijgewerktOp),
        relaties: [...relaties.values()].filter((r) => r.userId === lade.userId && r.ruimte === lade.ruimte),
        gebeurtenissen: gebeurtenissen.filter((g) => g.userId === lade.userId && g.ruimte === lade.ruimte).slice(0, 80),
      };
    },

    async bewaarKnoop(lade, invoer, agentHint = '') {
      const titel = String(invoer.titel ?? '').trim().slice(0, 200);
      const inhoud = String(invoer.inhoud ?? '').trim().slice(0, 8000);
      if (!titel || !inhoud) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
      if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(inhoud) || bevatGevoeligGeheim(invoer.samenvatting)) {
        return { ok: false, code: GEHEUGEN_FOUTEN.geheimGeweigerd };
      }

      const soort = schoonGeheugenSoort(invoer.soort);
      const sleutel = invoer.sleutel && isGeldigeGeheugenSleutel(invoer.sleutel)
        ? invoer.sleutel.trim().toLowerCase()
        : invoer.sleutel
          ? normaliseerGeheugenSleutel(invoer.sleutel, soort)
          : maakKnoopSleutelVanTitel(titel);

      const bestaand = [...knopen.values()].find(
        (k) => k.userId === lade.userId && k.ruimte === lade.ruimte && k.sleutel === sleutel,
      );
      const nu = Date.now();
      const id = bestaand?.id ?? randomUUID();
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 600) || maakSamenvatting(titel, inhoud);
      const bronDienst = schoonGeheugenDienst(invoer.bronDienst);
      const bronAgent = schoonGeheugenAgent(invoer.bronAgent || agentHint);

      let geldigTot: number | undefined;
      if (invoer.geldigTot !== undefined && invoer.geldigTot !== null && invoer.geldigTot !== '') {
        const ms = typeof invoer.geldigTot === 'number' ? invoer.geldigTot : Date.parse(String(invoer.geldigTot));
        if (Number.isFinite(ms) && ms > 0) geldigTot = ms;
      }

      const knoop: GeheugenKnoop & { userId: string } = {
        id,
        userId: lade.userId,
        ruimte: lade.ruimte,
        ...(invoer.werkruimteId && isGeldigUuid(invoer.werkruimteId)
          ? { werkruimteId: invoer.werkruimteId.trim() }
          : bestaand?.werkruimteId
            ? { werkruimteId: bestaand.werkruimteId }
            : {}),
        sleutel,
        soort,
        titel,
        inhoud,
        samenvatting,
        inhoudHash: berekenInhoudHash(titel, inhoud),
        bronDienst,
        bronAgent: bronAgent || bestaand?.bronAgent || '',
        labels: normaliseerGeheugenLabels(invoer.labels),
        status: 'actief',
        vastgepind: invoer.vastgepind === true,
        gewicht: normaliseerGeheugenGewicht(invoer.gewicht),
        geldigVanaf: bestaand?.geldigVanaf ?? nu,
        ...(geldigTot ? { geldigTot } : {}),
        aanroepen: bestaand?.aanroepen ?? 0,
        ...(bestaand?.laatstGeraadpleegdOp ? { laatstGeraadpleegdOp: bestaand.laatstGeraadpleegdOp } : {}),
        aangemaaktOp: bestaand?.aangemaaktOp ?? nu,
        bijgewerktOp: nu,
      };
      knopen.set(id, knoop);
      logEvent(lade, id, bestaand ? 'bijgewerkt' : 'aangemaakt', bronAgent, bronDienst, { sleutel, soort });

      let vervangDoelId = invoer.vervangtId && isGeldigUuid(invoer.vervangtId) ? invoer.vervangtId.trim() : '';
      if (!vervangDoelId && invoer.vervangtSleutel) {
        const norm = normaliseerGeheugenSleutel(invoer.vervangtSleutel);
        const gevonden = [...knopen.values()].find((k) => k.userId === lade.userId && k.ruimte === lade.ruimte && k.sleutel === norm);
        vervangDoelId = gevonden?.id ?? '';
      }
      if (vervangDoelId && vervangDoelId !== id) {
        const doel = knopen.get(vervangDoelId);
        if (doel && doel.userId === lade.userId && doel.ruimte === lade.ruimte) {
          doel.status = 'verouderd';
          doel.bijgewerktOp = nu;
          const rid = randomUUID();
          relaties.set(rid, {
            id: rid,
            userId: lade.userId,
            ruimte: lade.ruimte,
            bronKnoopId: id,
            doelKnoopId: vervangDoelId,
            relatieSoort: 'vervangt',
            toelichting: 'Автоматичне оновлення знання / Automatische opvolging',
            sterkte: 1.0,
            aangemaaktOp: nu,
          });
          logEvent(lade, vervangDoelId, 'vervangen', bronAgent, bronDienst, { vervangenDoorId: id });
        }
      }

      return { ok: true, knoop, nieuw: !bestaand };
    },

    async zetRelatie(lade, invoer) {
      if (invoer.actie === 'verwijderen') {
        if (!invoer.relatieId || !isGeldigUuid(invoer.relatieId)) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
        const r = relaties.get(invoer.relatieId);
        if (!r || r.userId !== lade.userId || r.ruimte !== lade.ruimte) return { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
        relaties.delete(invoer.relatieId);
        return { ok: true };
      }

      if (!isGeldigUuid(invoer.bronKnoopId) || !isGeldigUuid(invoer.doelKnoopId)) {
        return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
      }
      if (invoer.bronKnoopId === invoer.doelKnoopId) return { ok: false, code: GEHEUGEN_FOUTEN.zelfRelatie };
      const toelichting = String(invoer.toelichting ?? '').trim().slice(0, 600);
      if (bevatGevoeligGeheim(toelichting)) return { ok: false, code: GEHEUGEN_FOUTEN.geheimGeweigerd };

      const bron = knopen.get(invoer.bronKnoopId);
      const doel = knopen.get(invoer.doelKnoopId);
      if (!bron || !doel || bron.userId !== lade.userId || doel.userId !== lade.userId || bron.ruimte !== lade.ruimte || doel.ruimte !== lade.ruimte) {
        return { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
      }

      const relatieSoort = schoonRelatieSoort(invoer.relatieSoort);
      const bestaand = [...relaties.values()].find(
        (r) =>
          r.userId === lade.userId &&
          r.ruimte === lade.ruimte &&
          r.bronKnoopId === bron.id &&
          r.doelKnoopId === doel.id &&
          r.relatieSoort === relatieSoort,
      );
      const id = bestaand?.id ?? randomUUID();
      const rel: GeheugenRelatie & { userId: string } = {
        id,
        userId: lade.userId,
        ruimte: lade.ruimte,
        bronKnoopId: bron.id,
        doelKnoopId: doel.id,
        relatieSoort,
        toelichting,
        sterkte: Math.max(0.1, Math.min(3.0, Number(invoer.sterkte) || 1.0)),
        aangemaaktOp: bestaand?.aangemaaktOp ?? Date.now(),
      };
      relaties.set(id, rel);
      if (relatieSoort === 'vervangt' && doel.status === 'actief') {
        doel.status = 'verouderd';
        doel.bijgewerktOp = Date.now();
      }
      logEvent(lade, bron.id, relatieSoort === 'vervangt' ? 'vervangen' : relatieSoort === 'spreekt_tegen' ? 'tegenspraak_gemarkeerd' : 'bijgewerkt', schoonGeheugenAgent(invoer.agentHint), 'ai', {
        relatieSoort,
        doelKnoopId: doel.id,
      });
      return { ok: true, relatie: rel };
    },

    async zetStatus(lade, invoer) {
      if (!isGeldigUuid(invoer.id)) return { ok: false, code: GEHEUGEN_FOUTEN.ongeldigeInvoer };
      const k = knopen.get(invoer.id);
      if (!k || k.userId !== lade.userId || k.ruimte !== lade.ruimte) return { ok: false, code: GEHEUGEN_FOUTEN.nietGevonden };
      if (invoer.verwijder) {
        knopen.delete(invoer.id);
        for (const [rid, r] of [...relaties]) {
          if (r.bronKnoopId === invoer.id || r.doelKnoopId === invoer.id) relaties.delete(rid);
        }
        return { ok: true, verwijderd: true };
      }
      const oudPin = k.vastgepind;
      const oudStatus = k.status;
      if (invoer.status) k.status = schoonGeheugenStatus(invoer.status);
      if (typeof invoer.vastgepind === 'boolean') k.vastgepind = invoer.vastgepind;
      k.bijgewerktOp = Date.now();
      const actie: GeheugenActie =
        k.vastgepind !== oudPin
          ? k.vastgepind
            ? 'vastgepind'
            : 'ontpind'
          : k.status !== oudStatus && (k.status === 'gearchiveerd' || k.status === 'herroepen')
            ? 'gearchiveerd'
            : k.status === 'actief' && oudStatus !== 'actief'
              ? 'hersteld'
              : 'bijgewerkt';
      logEvent(lade, k.id, actie, schoonGeheugenAgent(invoer.agentHint), 'ai', { status: k.status, vastgepind: k.vastgepind });
      return { ok: true, knoop: k };
    },

    async registreerRaadpleging(lade, knoopIds, vraag, agentHint = '', bronDienst = 'ai') {
      const nu = Date.now();
      for (const id of knoopIds) {
        const k = knopen.get(id);
        if (k && k.userId === lade.userId && k.ruimte === lade.ruimte) {
          k.aanroepen += 1;
          k.laatstGeraadpleegdOp = nu;
        }
      }
      if (knoopIds.length) {
        logEvent(lade, knoopIds[0], 'pakket_opgebouwd', schoonGeheugenAgent(agentHint), schoonGeheugenDienst(bronDienst), {
          aantalKnopen: knoopIds.length,
          vraag: vraag.slice(0, 140),
        });
      }
    },
  };
}

export async function leesGeheugenPakketVoorChat(
  lade: Lade,
  vraag: string,
  werkruimteId?: string,
  opslag: StroomOpslag = pgStroomOpslag,
): Promise<{ pakket: GeheugenPakket; systeemPrompt: string }> {
  const data = await opslag.leesAlles(lade);
  const pakket = bouwGeheugenPakket(data.knopen, data.relaties, {
    ruimte: lade.ruimte,
    vraag,
    werkruimteId,
    maxTekens: 2600,
    maxItems: 8,
  });
  if (pakket.items.length > 0) {
    await opslag.registreerRaadpleging(
      lade,
      pakket.items.map((i) => i.knoop.id),
      vraag,
      'chat',
      'ai',
    );
  }
  return { pakket, systeemPrompt: bouwGeheugenSysteemPrompt(pakket) };
}

type SessieUitkomst =
  | { errorCode: string }
  | { user: { id: string; email: string; role: string; status: string; entitlements?: unknown }; service: string };

export interface GeheugenStroomDeps {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieUitkomst>;
  opslag?: StroomOpslag;
  ladeVan?: (userId: string, body: unknown) => Promise<Lade>;
  limiet?: (userId: string) => Promise<boolean>;
}

const lichaam = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

export function geheugenStroomRoutes(deps: GeheugenStroomDeps): Record<string, RouterMiddleware[]> {
  const opslag = deps.opslag ?? pgStroomOpslag;
  const ladeVan = deps.ladeVan ?? ecosysteemLade;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`geheugen-stroom:${userId}`, 90, 60)).ok);

  const poort = async (ctx: { event: Record<string, unknown>; body: unknown }, schrijven = false) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || !(DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
      return { fout: error(weigerCode(undefined), 403) };
    }
    if (!heeftApiRecht(auth.user as never)) return { fout: error(weigerCode(GEEN_RECHT), 403) };
    if (schrijven) {
      const geweigerd = rejectForeignOwnerUserId(auth.user, ctx.body) || denyMutation(auth.user as never, 'workspace.write');
      if (geweigerd) return { fout: geweigerd };
    }
    if (!(await limiet(auth.user.id))) return { fout: error('GEHEUGEN_TE_VEEL_VERZOEKEN', 429) };
    const lade = await ladeVan(auth.user.id, ctx.body);
    return { user: auth.user, lade };
  };

  return {
    'POST /api/owner/ai/geheugen/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const data = await opslag.leesAlles(p.lade);
      const vraag = typeof b.vraag === 'string' ? b.vraag.trim().slice(0, 300) : '';
      const filterSoort = typeof b.soort === 'string' && b.soort !== 'alle' ? [schoonGeheugenSoort(b.soort)] : undefined;
      const filterStatus =
        b.status === 'alle'
          ? (['actief', 'verouderd', 'gearchiveerd', 'herroepen'] as const)
          : typeof b.status === 'string' && b.status
            ? [schoonGeheugenStatus(b.status)]
            : (['actief', 'verouderd'] as const);

      const gerangschikt = rangschikGeheugen(data.knopen, data.relaties, {
        vraag,
        doelDienst: typeof b.bronDienst === 'string' && b.bronDienst !== 'alle' ? schoonGeheugenDienst(b.bronDienst) : undefined,
        werkruimteId: typeof b.werkruimteId === 'string' && isGeldigUuid(b.werkruimteId) ? b.werkruimteId : undefined,
        soorten: filterSoort,
        statussen: filterStatus,
        bevatVervangen: true,
      });

      const tegenspraken = spoorTegenspraken(data.knopen, data.relaties);
      const limietAantal = Math.max(1, Math.min(200, Number(b.limiet) || 120));

      return json({
        ok: true,
        ruimte: p.lade.ruimte,
        sleutelStand: data.sleutelStand,
        knopen: data.knopen,
        relaties: data.relaties,
        gebeurtenissen: data.gebeurtenissen,
        tegenspraken,
        gerangschikt: gerangschikt.slice(0, limietAantal),
        statistiek: {
          totaal: data.knopen.length,
          actief: data.knopen.filter((k) => k.status === 'actief').length,
          vastgepind: data.knopen.filter((k) => k.vastgepind && k.status === 'actief').length,
          verouderd: data.knopen.filter((k) => k.status === 'verouderd').length,
          gearchiveerd: data.knopen.filter((k) => k.status === 'gearchiveerd' || k.status === 'herroepen').length,
          versleuteld: data.knopen.filter((k) => k.versleuteld).length,
          relaties: data.relaties.length,
          tegenspraken: tegenspraken.length,
        },
      });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      try {
        const res = await opslag.bewaarKnoop(
          p.lade,
          {
            id: typeof b.id === 'string' ? b.id : undefined,
            sleutel: typeof b.sleutel === 'string' ? b.sleutel : undefined,
            soort: typeof b.soort === 'string' ? schoonGeheugenSoort(b.soort) : undefined,
            titel: String(b.titel ?? ''),
            inhoud: String(b.inhoud ?? ''),
            samenvatting: typeof b.samenvatting === 'string' ? b.samenvatting : undefined,
            werkruimteId: typeof b.werkruimteId === 'string' ? b.werkruimteId : undefined,
            bronDienst: typeof b.bronDienst === 'string' ? b.bronDienst : undefined,
            bronAgent: typeof b.bronAgent === 'string' ? b.bronAgent : undefined,
            labels: Array.isArray(b.labels) || typeof b.labels === 'string' ? (b.labels as string[] | string) : undefined,
            vastgepind: b.vastgepind === true,
            gewicht: typeof b.gewicht === 'number' ? b.gewicht : undefined,
            geldigTot: typeof b.geldigTot === 'number' || typeof b.geldigTot === 'string' ? b.geldigTot : null,
            vervangtId: typeof b.vervangtId === 'string' ? b.vervangtId : undefined,
            vervangtSleutel: typeof b.vervangtSleutel === 'string' ? b.vervangtSleutel : undefined,
          },
          wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
        );
        if (!res.ok) return error(res.code, 400);
        const na = await opslag.leesAlles(p.lade);
        const tegenspraken = spoorTegenspraken(na.knopen, na.relaties).filter(
          (t) => t.knoopAId === res.knoop.id || t.knoopBId === res.knoop.id,
        );
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.opslaan',
          result: 'success',
          details: { ruimte: p.lade.ruimte, sleutel: res.knoop.sleutel, soort: res.knoop.soort, nieuw: res.nieuw },
        }).catch(() => undefined);
        return json({ ok: true, ruimte: p.lade.ruimte, knoop: res.knoop, nieuw: res.nieuw, tegenspraken });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/relatie': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      const actie = b.actie === 'verwijderen' ? 'verwijderen' : 'aanmaken';
      const res = await opslag.zetRelatie(p.lade, {
        actie,
        relatieId: typeof b.relatieId === 'string' ? b.relatieId : undefined,
        bronKnoopId: String(b.bronKnoopId ?? ''),
        doelKnoopId: String(b.doelKnoopId ?? ''),
        relatieSoort: typeof b.relatieSoort === 'string' ? schoonRelatieSoort(b.relatieSoort) : undefined,
        toelichting: typeof b.toelichting === 'string' ? b.toelichting : undefined,
        sterkte: typeof b.sterkte === 'number' ? b.sterkte : undefined,
        agentHint: wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
      });
      if (!res.ok) return error(res.code, res.code === GEHEUGEN_FOUTEN.nietGevonden ? 404 : 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.relatie',
        result: 'success',
        details: { ruimte: p.lade.ruimte, actie, relatieSoort: res.relatie?.relatieSoort },
      }).catch(() => undefined);
      return json({ ok: true, ruimte: p.lade.ruimte, ...(res.relatie ? { relatie: res.relatie } : {}) });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/status': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      try {
        const res = await opslag.zetStatus(p.lade, {
          id: String(b.id ?? ''),
          status: typeof b.status === 'string' ? schoonGeheugenStatus(b.status) : undefined,
          vastgepind: typeof b.vastgepind === 'boolean' ? b.vastgepind : undefined,
          verwijder: b.verwijder === true,
          agentHint: wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
        });
        if (!res.ok) return error(res.code, res.code === GEHEUGEN_FOUTEN.nietGevonden ? 404 : 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.status',
          result: 'success',
          details: {
            ruimte: p.lade.ruimte,
            verwijderd: Boolean(res.verwijderd),
            status: res.knoop?.status,
            vastgepind: res.knoop?.vastgepind,
          },
        }).catch(() => undefined);
        return json({ ...res, ruimte: p.lade.ruimte });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/pakket': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const data = await opslag.leesAlles(p.lade);
      const vraag = String(b.vraag ?? '').trim().slice(0, 400);
      const pakket = bouwGeheugenPakket(data.knopen, data.relaties, {
        ruimte: p.lade.ruimte,
        vraag,
        doelDienst: typeof b.doelDienst === 'string' && b.doelDienst !== 'alle' ? schoonGeheugenDienst(b.doelDienst) : undefined,
        werkruimteId: typeof b.werkruimteId === 'string' && isGeldigUuid(b.werkruimteId) ? b.werkruimteId : undefined,
        maxTekens: typeof b.maxTekens === 'number' ? b.maxTekens : undefined,
        maxItems: typeof b.maxItems === 'number' ? b.maxItems : undefined,
      });
      const wie = huidigeNamens();
      if (b.registreerGebruik !== false && pakket.items.length > 0) {
        await opslag.registreerRaadpleging(
          p.lade,
          pakket.items.map((i) => i.knoop.id),
          vraag,
          wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
          typeof b.doelDienst === 'string' ? b.doelDienst : 'ai',
        );
      }
      return json({
        ok: true,
        ruimte: p.lade.ruimte,
        sleutelStand: data.sleutelStand,
        pakket,
        systeemPrompt: bouwGeheugenSysteemPrompt(pakket),
      });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/uittreksel': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const tekst = String(b.tekst ?? '').trim().slice(0, 24_000);
      if (!tekst) return error(GEHEUGEN_FOUTEN.ongeldigeInvoer, 400);
      const kandidaten = haalGeheugenKandidatenUitTekst(tekst, {
        maxKandidaten: typeof b.maxKandidaten === 'number' ? b.maxKandidaten : 6,
        extraLabels: normaliseerGeheugenLabels(b.labels),
      });
      return json({ ok: true, ruimte: p.lade.ruimte, kandidaten });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/exporteren': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const taal = b.taal === 'nl' ? 'nl' : 'uk';
      const data = await opslag.leesAlles(p.lade);
      const markdown = maakMarkdownExport(data.knopen, data.relaties, data.gebeurtenissen, p.lade.ruimte, taal);
      return json({
        ok: true,
        ruimte: p.lade.ruimte,
        formaat: 'mijn-ruimte-geheugen-v1',
        geexporteerdOp: new Date().toISOString(),
        knopen: data.knopen,
        relaties: data.relaties,
        gebeurtenissen: data.gebeurtenissen,
        markdown,
      });
    }) as RouterMiddleware],
  };
}
