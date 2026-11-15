// Серверне ядро «Окремий Telegram-бот для кожного ШІ-агента» (migratie 0280):
//   - Ізоляція за користувачем (RLS + app.huidige_gebruiker()) та простором ('prive' | 'technisch');
//   - Окремі токени ботів шифруються через backend/sleutelkluis.ts (dek1 або серверний ключ) + реєстрація перешифрування;
//   - Офіційна перевірка Telegram API (getMe, getChat, getChatMember) через ін’єктовний telegramFetch;
//   - Ідемпотентна черга доставлення та передавання завдань (taak_id, vorige_bezorging_id) із збереженням першоджерела при збоях;
//   - Ручне внесення розмов і посилань для непідтримуваних служб у Стрім пам’яті без секретів.
import { randomUUID } from 'node:crypto';
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { envSleutelBeschikbaar } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { ecosysteemLade } from './ai-ecosysteem';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { huidigeNamens } from './mcp-namens';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import {
  herversleutelEnvelop,
  ontzegel,
  registreerHerversleutelaar,
  verzegel,
} from './sleutelkluis';
import { pgStroomOpslag, type StroomOpslag } from './geheugen-stroom';
import type { AiRuimte } from '../shared/ai-ruimte';
import type { Lade } from '../shared/ruimte-scheiding';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { jsonbTekst } from '../shared/tekst-veilig';
import {
  AGENT_PROFIEL_CATALOGUS,
  BERICHT_SOORTEN,
  BOT_FOUTEN,
  bevatGevoeligGeheim,
  filterGeheimePatronen,
  isGeldigeAgentSlug,
  isGeldigBotSleutelFormaat,
  isGeldigUuid,
  maakTelegramBerichtTekst,
  maskeerBotSleutel,
  normaliseerGeheugenSleutel,
  schoonAgentSlug,
  schoonBerichtSoort,
  schoonBerichtSoortLijst,
  schoonBotStatus,
  schoonChatId,
  schoonThreadId,
  schoonToegestaneActies,
  valideerBestandsVerwijzingen,
  vindStandaardAgentProfiel,
  type BerichtSoort,
  type BestandsVerwijzing,
  type BezorgingStatus,
  type BotStatus,
  type GeheugenAgentBot,
  type GeheugenKnoop,
  type GeheugenTelegramBezorging,
} from '../shared/geheugen-stroom';

export const TABEL_BOTS = 'app.geheugen_agent_bots';
export const TABEL_BEZORGING = 'app.geheugen_telegram_bezorging';
const DIENSTEN = ['ai', 'mcp', 'hub', 'api', 'mail', 'cloud', 'github', 'huis'] as const;
const sys = () => getPool('systeem');

const serverSleutelNaam = (): string =>
  envSleutelBeschikbaar('TELEGRAM_AGENT_BOTS_SLEUTEL_V1') ? 'TELEGRAM_AGENT_BOTS_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1';

const botSleutelAad = (userId: string, ruimte: AiRuimte, agentSlug: string): string =>
  `geheugen-agent-bot|${userId}|${ruimte}|${agentSlug}`;

const telegramBasis = (): string =>
  String(process.env.TELEGRAM_API_BASIS || 'https://api.telegram.org').replace(/\/+$/, '');

export type TelegramFetchFn = (url: string, init: RequestInit) => Promise<Response>;

const standaardTelegramFetch: TelegramFetchFn = (url, init) =>
  fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10_000),
    redirect: 'error',
  });

const BOT_KOLOMMEN = `
  id, ruimte, agent_slug, dienst_naam, weergave_naam, beschrijving, avatar_kleur,
  sleutel_versleuteld, sleutel_naam, sleutel_aanwezig,
  bot_id, bot_username, bot_naam, chat_id, thread_id,
  toegestane_acties, toegestane_bericht_soorten, status, kan_publiceren, laatste_fout,
  CASE WHEN laatst_gecontroleerd_op IS NULL THEN NULL ELSE (extract(epoch FROM laatst_gecontroleerd_op) * 1000)::bigint END AS laatst_gecontroleerd_op,
  laatste_bericht_id,
  CASE WHEN laatste_bericht_op IS NULL THEN NULL ELSE (extract(epoch FROM laatste_bericht_op) * 1000)::bigint END AS laatste_bericht_op,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op,
  (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt_op
`;

const BEZORGING_KOLOMMEN = `
  id, ruimte, bot_id, agent_slug, taak_id, sessie_id, knoop_id, vorige_bezorging_id,
  soort_bericht, idempotentie_sleutel, titel, samenvatting, bestands_verwijzingen,
  telegram_chat_id, telegram_thread_id, telegram_bericht_id,
  status, pogingen, laatste_fout,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op,
  (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt_op,
  CASE WHEN verzonden_op IS NULL THEN NULL ELSE (extract(epoch FROM verzonden_op) * 1000)::bigint END AS verzonden_op
`;

function schoonFoutTekst(raw: unknown, token?: string): string {
  let tekst = String(raw ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (token) tekst = tekst.split(token).join('[ПРИХОВАНО]');
  tekst = filterGeheimePatronen(tekst);
  return tekst.slice(0, 580);
}

function rijNaarBot(r: Record<string, unknown>, maskerHint?: string): GeheugenAgentBot {
  const aanwezig = r.sleutel_aanwezig === true;
  return {
    id: String(r.id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    agentSlug: String(r.agent_slug ?? ''),
    dienstNaam: String(r.dienst_naam ?? ''),
    weergaveNaam: String(r.weergave_naam ?? ''),
    beschrijving: String(r.beschrijving ?? ''),
    avatarKleur: String(r.avatar_kleur ?? ''),
    sleutelAanwezig: aanwezig,
    sleutelMasker: aanwezig ? (maskerHint || '••••') : '',
    botId: String(r.bot_id ?? ''),
    botUsername: String(r.bot_username ?? ''),
    botNaam: String(r.bot_naam ?? ''),
    chatId: String(r.chat_id ?? ''),
    threadId: r.thread_id != null ? Number(r.thread_id) : null,
    toegestaneActies: Array.isArray(r.toegestane_acties) ? r.toegestane_acties.map(String) : [],
    toegestaneBerichtSoorten: schoongemaakteSoorten(r.toegestane_bericht_soorten),
    status: schoonBotStatus(r.status),
    kanPubliceren: r.kan_publiceren === true,
    laatsteFout: String(r.laatste_fout ?? ''),
    ...(r.laatst_gecontroleerd_op != null ? { laatstGecontroleerdOp: Number(r.laatst_gecontroleerd_op) } : {}),
    ...(r.laatste_bericht_id != null ? { laatsteBerichtId: Number(r.laatste_bericht_id) } : {}),
    ...(r.laatste_bericht_op != null ? { laatsteBerichtOp: Number(r.laatste_bericht_op) } : {}),
    aangemaaktOp: Number(r.aangemaakt_op ?? 0),
    bijgewerktOp: Number(r.bijgewerkt_op ?? 0),
  };
}

function schoongemaakteSoorten(v: unknown): BerichtSoort[] {
  if (!Array.isArray(v) || v.length === 0) return [...BERICHT_SOORTEN];
  const uit = v.map(String).filter((x): x is BerichtSoort => (BERICHT_SOORTEN as readonly string[]).includes(x));
  return uit.length > 0 ? uit : [...BERICHT_SOORTEN];
}

function parseVerwijzingenUitRij(v: unknown): BestandsVerwijzing[] {
  if (!Array.isArray(v)) return [];
  const uit: BestandsVerwijzing[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const naam = String(rec.naam ?? '').trim();
    const verwijzing = String(rec.verwijzing ?? '').trim();
    if (!naam || !verwijzing) continue;
    uit.push({
      naam,
      verwijzing,
      ...(typeof rec.sha256 === 'string' && rec.sha256 ? { sha256: rec.sha256 } : {}),
      ...(typeof rec.grootte === 'number' && Number.isFinite(rec.grootte) ? { grootte: rec.grootte } : {}),
    });
  }
  return uit;
}

function rijNaarBezorging(r: Record<string, unknown>): GeheugenTelegramBezorging {
  return {
    id: String(r.id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    ...(r.bot_id ? { botId: String(r.bot_id) } : {}),
    agentSlug: String(r.agent_slug ?? ''),
    taakId: String(r.taak_id ?? ''),
    sessieId: String(r.sessie_id ?? ''),
    ...(r.knoop_id ? { knoopId: String(r.knoop_id) } : {}),
    ...(r.vorige_bezorging_id ? { vorigeBezorgingId: String(r.vorige_bezorging_id) } : {}),
    soortBericht: schoonBerichtSoort(r.soort_bericht),
    idempotentieSleutel: String(r.idempotentie_sleutel ?? ''),
    titel: String(r.titel ?? ''),
    samenvatting: String(r.samenvatting ?? ''),
    bestandsVerwijzingen: parseVerwijzingenUitRij(r.bestands_verwijzingen),
    telegramChatId: String(r.telegram_chat_id ?? ''),
    telegramThreadId: r.telegram_thread_id != null ? Number(r.telegram_thread_id) : null,
    telegramBerichtId: r.telegram_bericht_id != null ? Number(r.telegram_bericht_id) : null,
    status: String(r.status ?? 'wachtrij') as BezorgingStatus,
    pogingen: Number(r.pogingen ?? 0),
    laatsteFout: String(r.laatste_fout ?? ''),
    aangemaaktOp: Number(r.aangemaakt_op ?? 0),
    bijgewerktOp: Number(r.bijgewerkt_op ?? 0),
    ...(r.verzonden_op != null ? { verzondenOp: Number(r.verzonden_op) } : {}),
  };
}

// Автоматичне перешифрування токенів Telegram-ботів під DEK користувача у Сховищі ключів (0092).
registreerHerversleutelaar(TABEL_BOTS, async (lade, dek) => {
  const rijen = await sys().query(
    `SELECT id, agent_slug, sleutel_versleuteld, sleutel_naam
       FROM ${TABEL_BOTS}
      WHERE user_id = $1 AND ruimte = $2 AND sleutel_aanwezig = true AND sleutel_versleuteld <> ''`,
    [lade.userId, lade.ruimte],
  );
  let gevonden = 0;
  let herversleuteld = 0;
  for (const raw of rijen.rows as Array<Record<string, unknown>>) {
    const envelop = String(raw.sleutel_versleuteld ?? '');
    if (!isServerEnvelop(envelop)) continue;
    gevonden++;
    try {
      const slug = String(raw.agent_slug ?? '');
      const sleutelNaam = String(raw.sleutel_naam ?? '') || serverSleutelNaam();
      const nieuw = herversleutelEnvelop(dek, envelop, botSleutelAad(lade.userId, lade.ruimte, slug), sleutelNaam);
      await sys().query(
        `UPDATE ${TABEL_BOTS}
            SET sleutel_versleuteld = $3, bijgewerkt_op = now()
          WHERE id = $1::uuid AND user_id = $2 AND ruimte = $4`,
        [String(raw.id), lade.userId, nieuw, lade.ruimte],
      );
      herversleuteld++;
    } catch {
      /* Пропускаємо рядок, якщо був запечатаний іншим ключем */
    }
  }
  return { gevonden, herversleuteld };
});

type TelegramApiUitkomst<T> =
  | { ok: true; result: T }
  | { ok: false; code: string; status: number; beschrijving: string };

async function telegramAanroep<T>(
  telegramFetch: TelegramFetchFn,
  token: string,
  methode: string,
  payload: Record<string, unknown>,
): Promise<TelegramApiUitkomst<T>> {
  if (!isGeldigBotSleutelFormaat(token)) {
    return { ok: false, code: BOT_FOUTEN.sleutelOngeldig, status: 400, beschrijving: BOT_FOUTEN.sleutelOngeldig };
  }
  const url = `${telegramBasis()}/bot${token}/${methode}`;
  let resp: Response;
  try {
    resp = await telegramFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      code: BOT_FOUTEN.telegramFout,
      status: 502,
      beschrijving: schoonFoutTekst((err as Error)?.message || 'Telegram netwerkfout', token),
    };
  }
  const parsed = (await resp.json().catch(() => null)) as
    | { ok?: boolean; result?: T; error_code?: number; description?: string }
    | null;
  if (resp.ok && parsed?.ok && parsed.result !== undefined) {
    return { ok: true, result: parsed.result };
  }
  const status = Number(parsed?.error_code || resp.status || 502);
  const beschrijving = schoonFoutTekst(parsed?.description || `HTTP ${status}`, token);
  if (status === 401 || status === 404) {
    return { ok: false, code: BOT_FOUTEN.sleutelOngeldig, status, beschrijving };
  }
  return { ok: false, code: BOT_FOUTEN.telegramFout, status, beschrijving };
}

type TelegramMe = { id: number; is_bot?: boolean; username?: string; first_name?: string };
type TelegramChat = { id: number | string; type?: string; is_forum?: boolean; permissions?: { can_send_messages?: boolean } };
type TelegramMember = {
  status?: string;
  is_member?: boolean;
  can_send_messages?: boolean;
  can_post_messages?: boolean;
};

async function controleerBotInTelegram(
  telegramFetch: TelegramFetchFn,
  token: string,
  chatId: string,
  threadId: number | null,
): Promise<{
  botId: string;
  botUsername: string;
  botNaam: string;
  kanPubliceren: boolean;
  laatsteFout: string;
  foutCode?: string;
}> {
  const meRes = await telegramAanroep<TelegramMe>(telegramFetch, token, 'getMe', {});
  if (!meRes.ok) {
    return {
      botId: '',
      botUsername: '',
      botNaam: '',
      kanPubliceren: false,
      laatsteFout: meRes.beschrijving || meRes.code,
      foutCode: meRes.code,
    };
  }
  const botId = String(meRes.result.id ?? '');
  const botUsername = String(meRes.result.username ?? '');
  const botNaam = String(meRes.result.first_name ?? '');

  if (!chatId) {
    return {
      botId,
      botUsername,
      botNaam,
      kanPubliceren: false,
      laatsteFout: BOT_FOUTEN.chatOngeldig,
      foutCode: BOT_FOUTEN.chatOngeldig,
    };
  }

  const chatRes = await telegramAanroep<TelegramChat>(telegramFetch, token, 'getChat', { chat_id: chatId });
  if (!chatRes.ok) {
    return {
      botId,
      botUsername,
      botNaam,
      kanPubliceren: false,
      laatsteFout: chatRes.beschrijving || BOT_FOUTEN.chatOngeldig,
      foutCode: BOT_FOUTEN.chatOngeldig,
    };
  }

  if (threadId !== null && chatRes.result.is_forum !== true) {
    return {
      botId,
      botUsername,
      botNaam,
      kanPubliceren: false,
      laatsteFout: BOT_FOUTEN.forumVereist,
      foutCode: BOT_FOUTEN.forumVereist,
    };
  }

  const lidRes = await telegramAanroep<TelegramMember>(telegramFetch, token, 'getChatMember', {
    chat_id: chatId,
    user_id: meRes.result.id,
  });
  if (!lidRes.ok) {
    return {
      botId,
      botUsername,
      botNaam,
      kanPubliceren: false,
      laatsteFout: lidRes.beschrijving || BOT_FOUTEN.geenPublicatierecht,
      foutCode: BOT_FOUTEN.geenPublicatierecht,
    };
  }

  const lid = lidRes.result;
  const chatType = String(chatRes.result.type ?? '');
  let kanPubliceren = false;
  if (lid.status === 'creator') {
    kanPubliceren = true;
  } else if (lid.status === 'administrator') {
    if (chatType === 'channel') {
      kanPubliceren = lid.can_post_messages === true;
    } else {
      kanPubliceren = lid.can_send_messages !== false;
    }
  } else if (lid.status === 'member') {
    kanPubliceren = chatType !== 'channel' && chatRes.result.permissions?.can_send_messages !== false;
  } else if (lid.status === 'restricted') {
    kanPubliceren = lid.is_member !== false && lid.can_send_messages === true;
  }

  return {
    botId,
    botUsername,
    botNaam,
    kanPubliceren,
    laatsteFout: kanPubliceren ? '' : BOT_FOUTEN.geenPublicatierecht,
    ...(kanPubliceren ? {} : { foutCode: BOT_FOUTEN.geenPublicatierecht }),
  };
}

export interface BewaarBotInvoer {
  agentSlug: string;
  dienstNaam?: string;
  weergaveNaam?: string;
  beschrijving?: string;
  avatarKleur?: string;
  botSleutel?: string;
  chatId?: string;
  threadId?: number | string | null;
  toegestaneActies?: string[] | string;
  toegestaneBerichtSoorten?: string[];
  status?: BotStatus;
}

export interface BezorgBerichtInvoer {
  agentSlug: string;
  taakId: string;
  sessieId?: string;
  knoopId?: string;
  vorigeBezorgingId?: string;
  soortBericht?: BerichtSoort | string;
  idempotentieSleutel?: string;
  titel: string;
  samenvatting?: string;
  bestandsVerwijzingen?: unknown;
  directVerzenden?: boolean;
}

export interface GesprekInvoer {
  agentSlug: string;
  taakId?: string;
  titel: string;
  samenvatting: string;
  bestandsVerwijzingen?: unknown;
  ookBezorgen?: boolean;
  idempotentieSleutel?: string;
  vorigeBezorgingId?: string;
}

export interface BotsOverzicht {
  ruimte: AiRuimte;
  bots: GeheugenAgentBot[];
  bezorgingen: GeheugenTelegramBezorging[];
  catalogus: typeof AGENT_PROFIEL_CATALOGUS;
}

export interface BotsOpslag {
  overzicht: (
    lade: Lade,
    filters?: { zoek?: string; taakId?: string; agentSlug?: string; limiet?: number },
  ) => Promise<BotsOverzicht>;
  bewaarBot: (
    lade: Lade,
    invoer: BewaarBotInvoer,
  ) => Promise<{ ok: true; bot: GeheugenAgentBot } | { ok: false; code: string; httpStatus?: number }>;
  testenBot: (
    lade: Lade,
    agentSlug: string,
  ) => Promise<{ ok: true; bot: GeheugenAgentBot; foutCode?: string } | { ok: false; code: string; httpStatus?: number }>;
  zetBotStatus: (
    lade: Lade,
    agentSlug: string,
    status: BotStatus,
  ) => Promise<{ ok: true; bot: GeheugenAgentBot } | { ok: false; code: string; httpStatus?: number }>;
  verwijderBot: (
    lade: Lade,
    agentSlug: string,
  ) => Promise<{ ok: true } | { ok: false; code: string; httpStatus?: number }>;
  bezorgBericht: (
    lade: Lade,
    invoer: BezorgBerichtInvoer,
  ) => Promise<
    | { ok: true; bezorging: GeheugenTelegramBezorging; duplicaat: boolean; verzonden: boolean; fout?: string }
    | { ok: false; code: string; httpStatus?: number }
  >;
  opnieuwBezorgen: (
    lade: Lade,
    bezorgingId: string,
  ) => Promise<
    | { ok: true; bezorging: GeheugenTelegramBezorging; duplicaat: boolean; verzonden: boolean; fout?: string }
    | { ok: false; code: string; httpStatus?: number }
  >;
  gesprekInvoeren: (
    lade: Lade,
    invoer: GesprekInvoer,
    agentHint?: string,
  ) => Promise<
    | {
        ok: true;
        knoop: GeheugenKnoop;
        bezorging?: GeheugenTelegramBezorging;
        opmerkingUk: string;
        opmerkingNl: string;
      }
    | { ok: false; code: string; httpStatus?: number }
  >;
}

const EERLIJKE_GESPREK_OPMERKING_UK =
  'Підсумок розмови та посилання на файли збережено у Стрімі пам’яті як ручний запис. Автоматичний збір історії зовнішньої служби можливий лише через її дозволене підключення або вивантаження.';
const EERLIJKE_GESPREK_OPMERKING_NL =
  'De gesprekssamenvatting en bestandsverwijzingen zijn handmatig in de geheugenstroom vastgelegd. Automatisch ophalen van externe diensten kan alleen via een toegestane koppeling of export.';

export function maakPgBotsOpslag(opties: {
  telegramFetch?: TelegramFetchFn;
  stroomOpslag?: StroomOpslag;
} = {}): BotsOpslag {
  const tgFetch = opties.telegramFetch ?? standaardTelegramFetch;
  const stroom = opties.stroomOpslag ?? pgStroomOpslag;

  async function verzendViaTelegram(
    lade: Lade,
    token: string,
    bezorging: GeheugenTelegramBezorging,
  ): Promise<{ ok: true; messageId: number } | { ok: false; foutTekst: string }> {
    const tekst = maakTelegramBerichtTekst({
      ruimte: lade.ruimte,
      agentSlug: bezorging.agentSlug,
      taakId: bezorging.taakId,
      soortBericht: bezorging.soortBericht,
      titel: bezorging.titel,
      samenvatting: bezorging.samenvatting,
      bestandsVerwijzingen: bezorging.bestandsVerwijzingen,
      vorigeBezorgingId: bezorging.vorigeBezorgingId,
    });
    const res = await telegramAanroep<{ message_id: number }>(tgFetch, token, 'sendMessage', {
      chat_id: bezorging.telegramChatId,
      ...(bezorging.telegramThreadId !== null ? { message_thread_id: bezorging.telegramThreadId } : {}),
      text: tekst,
      disable_web_page_preview: true,
    });
    if (!res.ok) {
      return { ok: false, foutTekst: res.beschrijving || res.code };
    }
    return { ok: true, messageId: Number(res.result.message_id ?? 0) };
  }

  return {
    async overzicht(lade, filters = {}) {
      const zoek = String(filters.zoek ?? '').trim().toLowerCase();
      const taakId = String(filters.taakId ?? '').trim();
      const agentSlug = filters.agentSlug ? schoonAgentSlug(filters.agentSlug) : '';
      const limiet = Math.max(1, Math.min(200, Number(filters.limiet) || 80));

      return alsGebruiker(lade.userId, async (q) => {
        const botsRes = await q(
          `SELECT ${BOT_KOLOMMEN}
             FROM ${TABEL_BOTS}
            WHERE user_id = $1 AND ruimte = $2
            ORDER BY aangemaakt_op ASC`,
          [lade.userId, lade.ruimte],
        );
        let bots = botsRes.rows.map((r) => rijNaarBot(r as Record<string, unknown>));

        const bezRes = await q(
          `SELECT ${BEZORGING_KOLOMMEN}
             FROM ${TABEL_BEZORGING}
            WHERE user_id = $1 AND ruimte = $2
              AND ($3 = '' OR taak_id = $3)
              AND ($4 = '' OR agent_slug = $4)
            ORDER BY aangemaakt_op DESC
            LIMIT $5`,
          [lade.userId, lade.ruimte, taakId, agentSlug, limiet],
        );
        let bezorgingen = bezRes.rows.map((r) => rijNaarBezorging(r as Record<string, unknown>));

        if (agentSlug) {
          bots = bots.filter((b) => b.agentSlug === agentSlug);
        }
        if (zoek) {
          bots = bots.filter((b) =>
            [b.agentSlug, b.weergaveNaam, b.dienstNaam, b.beschrijving, b.botUsername, b.chatId]
              .join(' ')
              .toLowerCase()
              .includes(zoek),
          );
          bezorgingen = bezorgingen.filter((z) =>
            [z.agentSlug, z.taakId, z.titel, z.samenvatting, z.idempotentieSleutel]
              .join(' ')
              .toLowerCase()
              .includes(zoek),
          );
        }

        return {
          ruimte: lade.ruimte,
          bots,
          bezorgingen,
          catalogus: AGENT_PROFIEL_CATALOGUS,
        };
      });
    },

    async bewaarBot(lade, invoer) {
      const agentSlug = schoonAgentSlug(invoer.agentSlug);
      if (!isGeldigeAgentSlug(agentSlug)) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }

      const sjabloon = vindStandaardAgentProfiel(agentSlug);
      const dienstNaam = String(invoer.dienstNaam ?? sjabloon?.dienstNaam ?? agentSlug).trim().slice(0, 80);
      const weergaveNaam = String(invoer.weergaveNaam ?? sjabloon?.weergaveNaam ?? agentSlug).trim().slice(0, 120);
      const beschrijving = String(invoer.beschrijving ?? sjabloon?.beschrijvingUk ?? '').trim().slice(0, 500);
      const avatarKleur = String(invoer.avatarKleur ?? sjabloon?.avatarKleur ?? '#2f6f73').trim().slice(0, 32);

      if (bevatGevoeligGeheim(dienstNaam) || bevatGevoeligGeheim(weergaveNaam) || bevatGevoeligGeheim(beschrijving)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }

      const rawToken = typeof invoer.botSleutel === 'string' ? invoer.botSleutel.trim() : '';
      if (rawToken && !isGeldigBotSleutelFormaat(rawToken)) {
        return { ok: false, code: BOT_FOUTEN.sleutelOngeldig, httpStatus: 400 };
      }

      const chatIdInvoer = invoer.chatId !== undefined ? String(invoer.chatId).trim() : undefined;
      let chatId = '';
      if (chatIdInvoer !== undefined) {
        if (chatIdInvoer !== '') {
          const schoon = schoonChatId(chatIdInvoer);
          if (!schoon) return { ok: false, code: BOT_FOUTEN.chatOngeldig, httpStatus: 400 };
          chatId = schoon;
        }
      }

      let threadId: number | null | undefined = undefined;
      if (invoer.threadId !== undefined) {
        if (invoer.threadId === null || invoer.threadId === '') {
          threadId = null;
        } else {
          const parsed = schoonThreadId(invoer.threadId);
          if (parsed === null) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
          threadId = parsed;
        }
      }

      const bestaandRij = await alsGebruiker(lade.userId, async (q) => {
        const res = await q(
          `SELECT ${BOT_KOLOMMEN} FROM ${TABEL_BOTS} WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`,
          [lade.userId, lade.ruimte, agentSlug],
        );
        return (res.rows[0] as Record<string, unknown> | undefined) ?? null;
      });

      let sleutelVersleuteld = String(bestaandRij?.sleutel_versleuteld ?? '');
      let sleutelNaam = String(bestaandRij?.sleutel_naam ?? '');
      let sleutelAanwezig = bestaandRij?.sleutel_aanwezig === true;
      let maskerHint: string | undefined;

      if (rawToken) {
        const sleutelVanServer = serverSleutelNaam();
        sleutelVersleuteld = await verzegel(
          { userId: lade.userId, ruimte: lade.ruimte },
          TABEL_BOTS,
          rawToken,
          botSleutelAad(lade.userId, lade.ruimte, agentSlug),
          sleutelVanServer,
        );
        sleutelNaam = sleutelVanServer;
        sleutelAanwezig = true;
        maskerHint = maskeerBotSleutel(true, rawToken);
      }

      const doelChatId = chatIdInvoer !== undefined ? chatId : String(bestaandRij?.chat_id ?? '');
      const doelThreadId = threadId !== undefined ? threadId : (bestaandRij?.thread_id != null ? Number(bestaandRij.thread_id) : null);
      const doelActies =
        invoer.toegestaneActies !== undefined
          ? schoonToegestaneActies(invoer.toegestaneActies)
          : Array.isArray(bestaandRij?.toegestane_acties)
            ? bestaandRij.toegestane_acties.map(String)
            : [...(sjabloon?.standaardActies ?? [])];
      const doelSoorten =
        invoer.toegestaneBerichtSoorten !== undefined
          ? schoonBerichtSoortLijst(invoer.toegestaneBerichtSoorten)
          : schoongemaakteSoorten(bestaandRij?.toegestane_bericht_soorten);

      const kanaalGewijzigd =
        Boolean(rawToken) ||
        (chatIdInvoer !== undefined && doelChatId !== String(bestaandRij?.chat_id ?? '')) ||
        (threadId !== undefined && doelThreadId !== (bestaandRij?.thread_id != null ? Number(bestaandRij.thread_id) : null));

      const doelStatus: BotStatus = kanaalGewijzigd
        ? 'in_afwachting'
        : invoer.status
          ? schoonBotStatus(invoer.status)
          : bestaandRij
            ? schoonBotStatus(bestaandRij.status)
            : 'in_afwachting';

      const kanPubliceren = kanaalGewijzigd ? false : bestaandRij?.kan_publiceren === true;

      const opgeslagen = await alsGebruiker(lade.userId, async (q) => {
        const res = await q(
          `INSERT INTO ${TABEL_BOTS} (
             user_id, ruimte, agent_slug, dienst_naam, weergave_naam, beschrijving, avatar_kleur,
             sleutel_versleuteld, sleutel_naam, sleutel_aanwezig,
             chat_id, thread_id, toegestane_acties, toegestane_bericht_soorten,
             status, kan_publiceren, laatste_fout
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], $14::text[], $15, $16, '')
           ON CONFLICT (user_id, ruimte, agent_slug) DO UPDATE SET
             dienst_naam = EXCLUDED.dienst_naam,
             weergave_naam = EXCLUDED.weergave_naam,
             beschrijving = EXCLUDED.beschrijving,
             avatar_kleur = EXCLUDED.avatar_kleur,
             sleutel_versleuteld = EXCLUDED.sleutel_versleuteld,
             sleutel_naam = EXCLUDED.sleutel_naam,
             sleutel_aanwezig = EXCLUDED.sleutel_aanwezig,
             chat_id = EXCLUDED.chat_id,
             thread_id = EXCLUDED.thread_id,
             toegestane_acties = EXCLUDED.toegestane_acties,
             toegestane_bericht_soorten = EXCLUDED.toegestane_bericht_soorten,
             status = EXCLUDED.status,
             kan_publiceren = EXCLUDED.kan_publiceren,
             laatste_fout = CASE WHEN $17 THEN '' ELSE ${TABEL_BOTS}.laatste_fout END,
             bijgewerkt_op = now()
           RETURNING ${BOT_KOLOMMEN}`,
          [
            lade.userId,
            lade.ruimte,
            agentSlug,
            dienstNaam,
            weergaveNaam,
            beschrijving,
            avatarKleur,
            sleutelVersleuteld,
            sleutelNaam,
            sleutelAanwezig,
            doelChatId,
            doelThreadId,
            doelActies,
            doelSoorten,
            doelStatus,
            kanPubliceren,
            kanaalGewijzigd,
          ],
        );
        return res.rows[0] as Record<string, unknown>;
      });

      return { ok: true, bot: rijNaarBot(opgeslagen, maskerHint) };
    },

    async testenBot(lade, agentSlugRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      if (!agentSlug) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };

      const rij = await alsGebruiker(lade.userId, async (q) => {
        const res = await q(
          `SELECT ${BOT_KOLOMMEN} FROM ${TABEL_BOTS} WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`,
          [lade.userId, lade.ruimte, agentSlug],
        );
        return (res.rows[0] as Record<string, unknown> | undefined) ?? null;
      });
      if (!rij) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (rij.sleutel_aanwezig !== true || !String(rij.sleutel_versleuteld ?? '')) {
        return { ok: false, code: BOT_FOUTEN.sleutelOntbreekt, httpStatus: 400 };
      }

      const token = await ontzegel(
        { userId: lade.userId, ruimte: lade.ruimte },
        TABEL_BOTS,
        String(rij.sleutel_versleuteld),
        botSleutelAad(lade.userId, lade.ruimte, agentSlug),
        String(rij.sleutel_naam ?? '') || serverSleutelNaam(),
      );
      const maskerHint = maskeerBotSleutel(true, token);

      const controle = await controleerBotInTelegram(
        tgFetch,
        token,
        String(rij.chat_id ?? ''),
        rij.thread_id != null ? Number(rij.thread_id) : null,
      );

      const huidigeStatus = schoonBotStatus(rij.status);
      const nieuweStatus: BotStatus =
        controle.kanPubliceren && huidigeStatus === 'in_afwachting' ? 'actief' : huidigeStatus;

      const bijgewerkt = await alsGebruiker(lade.userId, async (q) => {
        const res = await q(
          `UPDATE ${TABEL_BOTS}
              SET bot_id = $4,
                  bot_username = $5,
                  bot_naam = $6,
                  kan_publiceren = $7,
                  laatste_fout = $8,
                  status = $9,
                  laatst_gecontroleerd_op = now(),
                  bijgewerkt_op = now()
            WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3
            RETURNING ${BOT_KOLOMMEN}`,
          [
            lade.userId,
            lade.ruimte,
            agentSlug,
            controle.botId,
            controle.botUsername,
            controle.botNaam,
            controle.kanPubliceren,
            controle.laatsteFout,
            nieuweStatus,
          ],
        );
        return res.rows[0] as Record<string, unknown>;
      });

      return {
        ok: true,
        bot: rijNaarBot(bijgewerkt, maskerHint),
        ...(controle.foutCode ? { foutCode: controle.foutCode } : {}),
      };
    },

    async zetBotStatus(lade, agentSlugRaw, statusRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      const status = schoonBotStatus(statusRaw);
      if (!agentSlug) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };

      const rij = await alsGebruiker<
        | { status: 'niet_gevonden' }
        | { status: 'fout'; fout: string }
        | { status: 'ok'; row: Record<string, unknown> }
      >(lade.userId, async (q) => {
        const cur = await q(
          `SELECT ${BOT_KOLOMMEN} FROM ${TABEL_BOTS} WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`,
          [lade.userId, lade.ruimte, agentSlug],
        );
        const bestaand = cur.rows[0] as Record<string, unknown> | undefined;
        if (!bestaand) return { status: 'niet_gevonden' };

        if (status === 'actief' && bestaand.kan_publiceren !== true) {
          return { status: 'fout', fout: BOT_FOUTEN.geenPublicatierecht };
        }
        const intrekken = status === 'ingetrokken';
        const upd = await q(
          `UPDATE ${TABEL_BOTS}
              SET status = $4,
                  kan_publiceren = CASE WHEN $5 THEN false ELSE kan_publiceren END,
                  sleutel_versleuteld = CASE WHEN $5 THEN '' ELSE sleutel_versleuteld END,
                  sleutel_aanwezig = CASE WHEN $5 THEN false ELSE sleutel_aanwezig END,
                  bijgewerkt_op = now()
            WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3
            RETURNING ${BOT_KOLOMMEN}`,
          [lade.userId, lade.ruimte, agentSlug, status, intrekken],
        );
        return { status: 'ok', row: upd.rows[0] as Record<string, unknown> };
      });

      if (rij.status === 'niet_gevonden') return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (rij.status === 'fout') return { ok: false, code: rij.fout, httpStatus: 409 };
      return { ok: true, bot: rijNaarBot(rij.row) };
    },

    async verwijderBot(lade, agentSlugRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      if (!agentSlug) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };

      const res = await alsGebruiker(lade.userId, (q) =>
        q(`DELETE FROM ${TABEL_BOTS} WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`, [
          lade.userId,
          lade.ruimte,
          agentSlug,
        ]),
      );
      if (!res.rowCount) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      return { ok: true };
    },

    async bezorgBericht(lade, invoer) {
      const agentSlug = schoonAgentSlug(invoer.agentSlug);
      const taakId = String(invoer.taakId ?? '').trim().slice(0, 120);
      const sessieId = String(invoer.sessieId ?? '').trim().slice(0, 120);
      const titel = String(invoer.titel ?? '').trim().slice(0, 240);
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      const soortBericht = schoonBerichtSoort(invoer.soortBericht);
      const idempotentieSleutel =
        String(invoer.idempotentieSleutel ?? '').trim().slice(0, 160) ||
        `${agentSlug}:${taakId || 'algemeen'}:${randomUUID()}`;

      if (!agentSlug || !titel) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }
      if (invoer.knoopId && !isGeldigUuid(invoer.knoopId)) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }
      if (invoer.vorigeBezorgingId && !isGeldigUuid(invoer.vorigeBezorgingId)) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }

      const verw = valideerBestandsVerwijzingen(invoer.bestandsVerwijzingen);
      if (!verw.ok) return { ok: false, code: verw.code, httpStatus: 400 };

      if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(taakId)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }

      // 1. Ідемпотентність: якщо такий ключ доставлення вже є в цьому просторі — повертаємо без дублювання.
      const bestaand = await alsGebruiker(lade.userId, async (q) => {
        const r = await q(
          `SELECT ${BEZORGING_KOLOMMEN}
             FROM ${TABEL_BEZORGING}
            WHERE user_id = $1 AND ruimte = $2 AND idempotentie_sleutel = $3`,
          [lade.userId, lade.ruimte, idempotentieSleutel],
        );
        return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
      });
      if (bestaand) {
        const b = rijNaarBezorging(bestaand);
        return { ok: true, bezorging: b, duplicaat: true, verzonden: b.status === 'verzonden' };
      }

      // 2. Перевірка бота, статусу та права публікації перед постановкою в чергу.
      const voorbereiding = await alsGebruiker<
        | { status: 'fout'; fout: string; httpStatus: number }
        | { status: 'ok'; bot: Record<string, unknown> }
      >(lade.userId, async (q) => {
        const botRes = await q(
          `SELECT ${BOT_KOLOMMEN} FROM ${TABEL_BOTS} WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`,
          [lade.userId, lade.ruimte, agentSlug],
        );
        const bot = botRes.rows[0] as Record<string, unknown> | undefined;
        if (!bot) return { status: 'fout', fout: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
        if (bot.status === 'gepauzeerd') return { status: 'fout', fout: BOT_FOUTEN.gepauzeerd, httpStatus: 409 };
        if (bot.status === 'ingetrokken') return { status: 'fout', fout: BOT_FOUTEN.ingetrokken, httpStatus: 409 };
        if (bot.status !== 'actief' || bot.kan_publiceren !== true) {
          return { status: 'fout', fout: BOT_FOUTEN.geenPublicatierecht, httpStatus: 409 };
        }
        if (bot.sleutel_aanwezig !== true || !String(bot.sleutel_versleuteld ?? '')) {
          return { status: 'fout', fout: BOT_FOUTEN.sleutelOntbreekt, httpStatus: 400 };
        }
        if (!String(bot.chat_id ?? '')) {
          return { status: 'fout', fout: BOT_FOUTEN.chatOngeldig, httpStatus: 400 };
        }
        const soorten = schoongemaakteSoorten(bot.toegestane_bericht_soorten);
        if (!soorten.includes(soortBericht)) {
          return { status: 'fout', fout: BOT_FOUTEN.soortNietToegestaan, httpStatus: 403 };
        }
        if (invoer.knoopId) {
          const kn = await q(
            `SELECT 1 FROM app.geheugen_stroom_knopen WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
            [invoer.knoopId.trim(), lade.userId, lade.ruimte],
          );
          if (!kn.rows[0]) return { status: 'fout', fout: BOT_FOUTEN.nietGevonden, httpStatus: 404 };
        }
        if (invoer.vorigeBezorgingId) {
          const vb = await q(
            `SELECT 1 FROM ${TABEL_BEZORGING} WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
            [invoer.vorigeBezorgingId.trim(), lade.userId, lade.ruimte],
          );
          if (!vb.rows[0]) return { status: 'fout', fout: BOT_FOUTEN.bezorgingNietGevonden, httpStatus: 404 };
        }
        return { status: 'ok', bot };
      });

      if (voorbereiding.status === 'fout') {
        return { ok: false, code: voorbereiding.fout, httpStatus: voorbereiding.httpStatus };
      }

      const botRij = voorbereiding.bot;
      const directVerzenden = invoer.directVerzenden !== false;
      let ontzegeldToken = '';
      if (directVerzenden) {
        ontzegeldToken = await ontzegel(
          { userId: lade.userId, ruimte: lade.ruimte },
          TABEL_BOTS,
          String(botRij.sleutel_versleuteld),
          botSleutelAad(lade.userId, lade.ruimte, agentSlug),
          String(botRij.sleutel_naam ?? '') || serverSleutelNaam(),
        );
      }

      // 3. Збереження першоджерела в чергу (wachtrij) із захистом від перегонів на UNIQUE(idempotentie_sleutel).
      const ingevoegd = await alsGebruiker(lade.userId, async (q) => {
        const ins = await q(
          `INSERT INTO ${TABEL_BEZORGING} (
             user_id, ruimte, bot_id, agent_slug, taak_id, sessie_id,
             knoop_id, vorige_bezorging_id, soort_bericht, idempotentie_sleutel,
             titel, samenvatting, bestands_verwijzingen,
             telegram_chat_id, telegram_thread_id, status, pogingen
           ) VALUES (
             $1, $2, $3::uuid, $4, $5, $6,
             $7::uuid, $8::uuid, $9, $10,
             $11, $12, $13::jsonb,
             $14, $15, 'wachtrij', 0
           )
           ON CONFLICT (user_id, ruimte, idempotentie_sleutel) DO NOTHING
           RETURNING ${BEZORGING_KOLOMMEN}`,
          [
            lade.userId,
            lade.ruimte,
            String(botRij.id),
            agentSlug,
            taakId,
            sessieId,
            invoer.knoopId ? invoer.knoopId.trim() : null,
            invoer.vorigeBezorgingId ? invoer.vorigeBezorgingId.trim() : null,
            soortBericht,
            idempotentieSleutel,
            titel,
            samenvatting,
            jsonbTekst(verw.items),
            String(botRij.chat_id),
            botRij.thread_id != null ? Number(botRij.thread_id) : null,
          ],
        );
        if (ins.rows[0]) return { row: ins.rows[0] as Record<string, unknown>, duplicaat: false };
        const sel = await q(
          `SELECT ${BEZORGING_KOLOMMEN}
             FROM ${TABEL_BEZORGING}
            WHERE user_id = $1 AND ruimte = $2 AND idempotentie_sleutel = $3`,
          [lade.userId, lade.ruimte, idempotentieSleutel],
        );
        return { row: sel.rows[0] as Record<string, unknown>, duplicaat: true };
      });

      const bezorging = rijNaarBezorging(ingevoegd.row);
      if (ingevoegd.duplicaat) {
        return { ok: true, bezorging, duplicaat: true, verzonden: bezorging.status === 'verzonden' };
      }

      if (!directVerzenden) {
        return { ok: true, bezorging, duplicaat: false, verzonden: false };
      }

      // 4. Негайне надсилання до Telegram без втрати запису в БД у разі збою.
      const uitslag = await verzendViaTelegram(lade, ontzegeldToken, bezorging);
      const bijgewerkt = await alsGebruiker(lade.userId, async (q) => {
        if (uitslag.ok) {
          const r = await q(
            `UPDATE ${TABEL_BEZORGING}
                SET status = 'verzonden',
                    telegram_bericht_id = $4,
                    pogingen = pogingen + 1,
                    laatste_fout = '',
                    verzonden_op = now(),
                    bijgewerkt_op = now()
              WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
              RETURNING ${BEZORGING_KOLOMMEN}`,
            [bezorging.id, lade.userId, lade.ruimte, uitslag.messageId],
          );
          await q(
            `UPDATE ${TABEL_BOTS}
                SET laatste_bericht_id = $4,
                    laatste_bericht_op = now(),
                    laatste_fout = '',
                    bijgewerkt_op = now()
              WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
            [String(botRij.id), lade.userId, lade.ruimte, uitslag.messageId],
          );
          return r.rows[0] as Record<string, unknown>;
        }
        const r = await q(
          `UPDATE ${TABEL_BEZORGING}
              SET status = 'mislukt',
                  pogingen = pogingen + 1,
                  laatste_fout = $4,
                  bijgewerkt_op = now()
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
            RETURNING ${BEZORGING_KOLOMMEN}`,
          [bezorging.id, lade.userId, lade.ruimte, uitslag.foutTekst],
        );
        await q(
          `UPDATE ${TABEL_BOTS}
              SET laatste_fout = $4, bijgewerkt_op = now()
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [String(botRij.id), lade.userId, lade.ruimte, uitslag.foutTekst],
        );
        return r.rows[0] as Record<string, unknown>;
      });

      const resultaat = rijNaarBezorging(bijgewerkt);
      return {
        ok: true,
        bezorging: resultaat,
        duplicaat: false,
        verzonden: uitslag.ok,
        ...(uitslag.ok ? {} : { fout: uitslag.foutTekst }),
      };
    },

    async opnieuwBezorgen(lade, bezorgingId) {
      if (!isGeldigUuid(bezorgingId)) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }

      const data = await alsGebruiker<
        | { status: 'fout'; fout: string; httpStatus: number }
        | { status: 'reeds'; reedsVerzonden: Record<string, unknown> }
        | { status: 'ok'; bezRow: Record<string, unknown>; bot: Record<string, unknown> }
      >(lade.userId, async (q) => {
        const bezRes = await q(
          `SELECT ${BEZORGING_KOLOMMEN}
             FROM ${TABEL_BEZORGING}
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
          [bezorgingId.trim(), lade.userId, lade.ruimte],
        );
        const bezRow = bezRes.rows[0] as Record<string, unknown> | undefined;
        if (!bezRow) return { status: 'fout', fout: BOT_FOUTEN.bezorgingNietGevonden, httpStatus: 404 };
        if (bezRow.status === 'verzonden') return { status: 'reeds', reedsVerzonden: bezRow };

        const botRes = await q(
          `SELECT ${BOT_KOLOMMEN}
             FROM ${TABEL_BOTS}
            WHERE user_id = $1 AND ruimte = $2 AND agent_slug = $3`,
          [lade.userId, lade.ruimte, String(bezRow.agent_slug)],
        );
        const bot = botRes.rows[0] as Record<string, unknown> | undefined;
        if (!bot) return { status: 'fout', fout: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
        if (bot.status === 'gepauzeerd') return { status: 'fout', fout: BOT_FOUTEN.gepauzeerd, httpStatus: 409 };
        if (bot.status === 'ingetrokken') return { status: 'fout', fout: BOT_FOUTEN.ingetrokken, httpStatus: 409 };
        if (bot.status !== 'actief' || bot.kan_publiceren !== true) {
          return { status: 'fout', fout: BOT_FOUTEN.geenPublicatierecht, httpStatus: 409 };
        }
        if (bot.sleutel_aanwezig !== true || !String(bot.sleutel_versleuteld ?? '')) {
          return { status: 'fout', fout: BOT_FOUTEN.sleutelOntbreekt, httpStatus: 400 };
        }
        const soorten = schoongemaakteSoorten(bot.toegestane_bericht_soorten);
        if (!soorten.includes(schoonBerichtSoort(bezRow.soort_bericht))) {
          return { status: 'fout', fout: BOT_FOUTEN.soortNietToegestaan, httpStatus: 403 };
        }
        return { status: 'ok', bezRow, bot };
      });

      if (data.status === 'fout') {
        return { ok: false, code: data.fout, httpStatus: data.httpStatus };
      }
      if (data.status === 'reeds') {
        return {
          ok: true,
          bezorging: rijNaarBezorging(data.reedsVerzonden),
          duplicaat: true,
          verzonden: true,
        };
      }

      const bezorging = rijNaarBezorging(data.bezRow);
      const token = await ontzegel(
        { userId: lade.userId, ruimte: lade.ruimte },
        TABEL_BOTS,
        String(data.bot.sleutel_versleuteld),
        botSleutelAad(lade.userId, lade.ruimte, bezorging.agentSlug),
        String(data.bot.sleutel_naam ?? '') || serverSleutelNaam(),
      );

      const uitslag = await verzendViaTelegram(lade, token, bezorging);
      const bijgewerkt = await alsGebruiker(lade.userId, async (q) => {
        if (uitslag.ok) {
          const r = await q(
            `UPDATE ${TABEL_BEZORGING}
                SET status = 'verzonden',
                    telegram_bericht_id = $4,
                    pogingen = pogingen + 1,
                    laatste_fout = '',
                    verzonden_op = now(),
                    bijgewerkt_op = now()
              WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
              RETURNING ${BEZORGING_KOLOMMEN}`,
            [bezorging.id, lade.userId, lade.ruimte, uitslag.messageId],
          );
          await q(
            `UPDATE ${TABEL_BOTS}
                SET laatste_bericht_id = $4,
                    laatste_bericht_op = now(),
                    laatste_fout = '',
                    bijgewerkt_op = now()
              WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
            [String(data.bot.id), lade.userId, lade.ruimte, uitslag.messageId],
          );
          return r.rows[0] as Record<string, unknown>;
        }
        const r = await q(
          `UPDATE ${TABEL_BEZORGING}
              SET status = 'mislukt',
                  pogingen = pogingen + 1,
                  laatste_fout = $4,
                  bijgewerkt_op = now()
            WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
            RETURNING ${BEZORGING_KOLOMMEN}`,
          [bezorging.id, lade.userId, lade.ruimte, uitslag.foutTekst],
        );
        return r.rows[0] as Record<string, unknown>;
      });

      return {
        ok: true,
        bezorging: rijNaarBezorging(bijgewerkt),
        duplicaat: false,
        verzonden: uitslag.ok,
        ...(uitslag.ok ? {} : { fout: uitslag.foutTekst }),
      };
    },

    async gesprekInvoeren(lade, invoer, agentHint = '') {
      const agentSlug = schoonAgentSlug(invoer.agentSlug || agentHint || 'handmatig');
      const taakId = String(invoer.taakId ?? '').trim().slice(0, 120);
      const titel = String(invoer.titel ?? '').trim().slice(0, 200);
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);

      if (!agentSlug || !titel || !samenvatting) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }
      if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(taakId)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }
      const verw = valideerBestandsVerwijzingen(invoer.bestandsVerwijzingen);
      if (!verw.ok) return { ok: false, code: verw.code, httpStatus: 400 };

      const regels = [samenvatting];
      if (taakId) regels.push(`Завдання / Taak: ${taakId}`);
      if (verw.items.length > 0) {
        regels.push(
          'Файли / Bestanden:',
          ...verw.items.map((f) => `- ${f.naam}: ${f.verwijzing}${f.sha256 ? ` (sha256:${f.sha256})` : ''}`),
        );
      }

      const labels = [
        'handmatig-gesprek',
        agentSlug,
        ...(taakId ? [`taak-${normaliseerGeheugenSleutel(taakId, 'taak').slice(0, 32)}`] : []),
      ];

      const opgeslagen = await stroom.bewaarKnoop(
        lade,
        {
          soort: 'context',
          titel,
          inhoud: regels.join('\n').slice(0, 7800),
          samenvatting: samenvatting.slice(0, 240),
          bronDienst: 'ai',
          bronAgent: agentSlug,
          labels,
        },
        agentSlug,
      );
      if (!opgeslagen.ok) {
        return { ok: false, code: opgeslagen.code, httpStatus: 400 };
      }

      let bezorging: GeheugenTelegramBezorging | undefined;
      if (invoer.ookBezorgen) {
        const bez = await this.bezorgBericht(lade, {
          agentSlug,
          taakId: taakId || `gesprek-${opgeslagen.knoop.sleutel}`,
          knoopId: opgeslagen.knoop.id,
          vorigeBezorgingId: invoer.vorigeBezorgingId,
          soortBericht: 'gesprek',
          idempotentieSleutel: invoer.idempotentieSleutel,
          titel,
          samenvatting,
          bestandsVerwijzingen: verw.items,
          directVerzenden: true,
        });
        if (!bez.ok) {
          return { ok: false, code: bez.code, httpStatus: bez.httpStatus };
        }
        bezorging = bez.bezorging;
      }

      return {
        ok: true,
        knoop: opgeslagen.knoop,
        ...(bezorging ? { bezorging } : {}),
        opmerkingUk: EERLIJKE_GESPREK_OPMERKING_UK,
        opmerkingNl: EERLIJKE_GESPREK_OPMERKING_NL,
      };
    },
  };
}

export const pgBotsOpslag: BotsOpslag = maakPgBotsOpslag();

/** Чиста in-memory реалізація для швидкого тестування без бази даних. */
export function maakBotsInGeheugenOpslag(opties: {
  telegramFetch?: TelegramFetchFn;
  stroomOpslag: StroomOpslag;
}): BotsOpslag {
  const tgFetch = opties.telegramFetch ?? standaardTelegramFetch;
  const stroom = opties.stroomOpslag;
  const bots = new Map<string, GeheugenAgentBot & { userId: string; ruweSleutel: string }>();
  const bezorgingen = new Map<string, GeheugenTelegramBezorging & { userId: string }>();

  const publiekBot = (b: GeheugenAgentBot & { userId: string; ruweSleutel: string }): GeheugenAgentBot => {
    const { userId: _u, ruweSleutel: _r, ...rest } = b;
    return rest;
  };
  const publiekBez = (z: GeheugenTelegramBezorging & { userId: string }): GeheugenTelegramBezorging => {
    const { userId: _u, ...rest } = z;
    return rest;
  };

  return {
    async overzicht(lade, filters = {}) {
      const zoek = String(filters.zoek ?? '').trim().toLowerCase();
      const taakId = String(filters.taakId ?? '').trim();
      const agentSlug = filters.agentSlug ? schoonAgentSlug(filters.agentSlug) : '';
      const limiet = Math.max(1, Math.min(200, Number(filters.limiet) || 80));

      let lijstBots = [...bots.values()]
        .filter((b) => b.userId === lade.userId && b.ruimte === lade.ruimte)
        .sort((a, b) => a.aangemaaktOp - b.aangemaaktOp)
        .map(publiekBot);
      let lijstBez = [...bezorgingen.values()]
        .filter((z) => z.userId === lade.userId && z.ruimte === lade.ruimte)
        .filter((z) => !taakId || z.taakId === taakId)
        .filter((z) => !agentSlug || z.agentSlug === agentSlug)
        .sort((a, b) => b.aangemaaktOp - a.aangemaaktOp)
        .slice(0, limiet)
        .map(publiekBez);

      if (agentSlug) lijstBots = lijstBots.filter((b) => b.agentSlug === agentSlug);
      if (zoek) {
        lijstBots = lijstBots.filter((b) =>
          [b.agentSlug, b.weergaveNaam, b.dienstNaam, b.beschrijving, b.botUsername, b.chatId]
            .join(' ')
            .toLowerCase()
            .includes(zoek),
        );
        lijstBez = lijstBez.filter((z) =>
          [z.agentSlug, z.taakId, z.titel, z.samenvatting, z.idempotentieSleutel]
            .join(' ')
            .toLowerCase()
            .includes(zoek),
        );
      }

      return { ruimte: lade.ruimte, bots: lijstBots, bezorgingen: lijstBez, catalogus: AGENT_PROFIEL_CATALOGUS };
    },

    async bewaarBot(lade, invoer) {
      const agentSlug = schoonAgentSlug(invoer.agentSlug);
      if (!isGeldigeAgentSlug(agentSlug)) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      const sjabloon = vindStandaardAgentProfiel(agentSlug);
      const dienstNaam = String(invoer.dienstNaam ?? sjabloon?.dienstNaam ?? agentSlug).trim().slice(0, 80);
      const weergaveNaam = String(invoer.weergaveNaam ?? sjabloon?.weergaveNaam ?? agentSlug).trim().slice(0, 120);
      const beschrijving = String(invoer.beschrijving ?? sjabloon?.beschrijvingUk ?? '').trim().slice(0, 500);
      const avatarKleur = String(invoer.avatarKleur ?? sjabloon?.avatarKleur ?? '#2f6f73').trim().slice(0, 32);

      if (bevatGevoeligGeheim(dienstNaam) || bevatGevoeligGeheim(weergaveNaam) || bevatGevoeligGeheim(beschrijving)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }
      const rawToken = typeof invoer.botSleutel === 'string' ? invoer.botSleutel.trim() : '';
      if (rawToken && !isGeldigBotSleutelFormaat(rawToken)) {
        return { ok: false, code: BOT_FOUTEN.sleutelOngeldig, httpStatus: 400 };
      }

      const chatIdInvoer = invoer.chatId !== undefined ? String(invoer.chatId).trim() : undefined;
      let chatId = '';
      if (chatIdInvoer !== undefined && chatIdInvoer !== '') {
        chatId = schoonChatId(chatIdInvoer);
        if (!chatId) return { ok: false, code: BOT_FOUTEN.chatOngeldig, httpStatus: 400 };
      }

      let threadId: number | null | undefined = undefined;
      if (invoer.threadId !== undefined) {
        if (invoer.threadId === null || invoer.threadId === '') threadId = null;
        else {
          const parsed = schoonThreadId(invoer.threadId);
          if (parsed === null) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
          threadId = parsed;
        }
      }

      const bestaand = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === agentSlug,
      );
      const sleutel = rawToken || bestaand?.ruweSleutel || '';
      const sleutelAanwezig = Boolean(sleutel);
      const doelChatId = chatIdInvoer !== undefined ? chatId : bestaand?.chatId ?? '';
      const doelThreadId = threadId !== undefined ? threadId : bestaand?.threadId ?? null;
      const gewijzigd = Boolean(rawToken) || (chatIdInvoer !== undefined && doelChatId !== (bestaand?.chatId ?? '')) || (threadId !== undefined && doelThreadId !== (bestaand?.threadId ?? null));
      const nu = Date.now();
      const id = bestaand?.id ?? randomUUID();

      const opgeslagen: GeheugenAgentBot & { userId: string; ruweSleutel: string } = {
        id,
        userId: lade.userId,
        ruimte: lade.ruimte,
        agentSlug,
        dienstNaam,
        weergaveNaam,
        beschrijving,
        avatarKleur,
        ruweSleutel: sleutel,
        sleutelAanwezig,
        sleutelMasker: maskeerBotSleutel(sleutelAanwezig, sleutel),
        botId: bestaand?.botId ?? '',
        botUsername: bestaand?.botUsername ?? '',
        botNaam: bestaand?.botNaam ?? '',
        chatId: doelChatId,
        threadId: doelThreadId,
        toegestaneActies:
          invoer.toegestaneActies !== undefined
            ? schoonToegestaneActies(invoer.toegestaneActies)
            : bestaand?.toegestaneActies ?? [...(sjabloon?.standaardActies ?? [])],
        toegestaneBerichtSoorten:
          invoer.toegestaneBerichtSoorten !== undefined
            ? schoonBerichtSoortLijst(invoer.toegestaneBerichtSoorten)
            : bestaand?.toegestaneBerichtSoorten ?? [...BERICHT_SOORTEN],
        status: gewijzigd ? 'in_afwachting' : invoer.status ? schoonBotStatus(invoer.status) : bestaand?.status ?? 'in_afwachting',
        kanPubliceren: gewijzigd ? false : bestaand?.kanPubliceren ?? false,
        laatsteFout: gewijzigd ? '' : bestaand?.laatsteFout ?? '',
        ...(bestaand?.laatstGecontroleerdOp ? { laatstGecontroleerdOp: bestaand.laatstGecontroleerdOp } : {}),
        ...(bestaand?.laatsteBerichtId ? { laatsteBerichtId: bestaand.laatsteBerichtId } : {}),
        ...(bestaand?.laatsteBerichtOp ? { laatsteBerichtOp: bestaand.laatsteBerichtOp } : {}),
        aangemaaktOp: bestaand?.aangemaaktOp ?? nu,
        bijgewerktOp: nu,
      };
      bots.set(id, opgeslagen);
      return { ok: true, bot: publiekBot(opgeslagen) };
    },

    async testenBot(lade, agentSlugRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      const bot = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === agentSlug,
      );
      if (!bot) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (!bot.sleutelAanwezig || !bot.ruweSleutel) return { ok: false, code: BOT_FOUTEN.sleutelOntbreekt, httpStatus: 400 };

      const c = await controleerBotInTelegram(tgFetch, bot.ruweSleutel, bot.chatId, bot.threadId);
      bot.botId = c.botId;
      bot.botUsername = c.botUsername;
      bot.botNaam = c.botNaam;
      bot.kanPubliceren = c.kanPubliceren;
      bot.laatsteFout = c.laatsteFout;
      bot.laatstGecontroleerdOp = Date.now();
      bot.bijgewerktOp = Date.now();
      if (c.kanPubliceren && bot.status === 'in_afwachting') bot.status = 'actief';
      return { ok: true, bot: publiekBot(bot), ...(c.foutCode ? { foutCode: c.foutCode } : {}) };
    },

    async zetBotStatus(lade, agentSlugRaw, statusRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      const status = schoonBotStatus(statusRaw);
      const bot = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === agentSlug,
      );
      if (!bot) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (status === 'actief' && !bot.kanPubliceren) {
        return { ok: false, code: BOT_FOUTEN.geenPublicatierecht, httpStatus: 409 };
      }
      bot.status = status;
      if (status === 'ingetrokken') {
        bot.kanPubliceren = false;
        bot.ruweSleutel = '';
        bot.sleutelAanwezig = false;
        bot.sleutelMasker = '';
      }
      bot.bijgewerktOp = Date.now();
      return { ok: true, bot: publiekBot(bot) };
    },

    async verwijderBot(lade, agentSlugRaw) {
      const agentSlug = schoonAgentSlug(agentSlugRaw);
      const bot = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === agentSlug,
      );
      if (!bot) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      bots.delete(bot.id);
      return { ok: true };
    },

    async bezorgBericht(lade, invoer) {
      const agentSlug = schoonAgentSlug(invoer.agentSlug);
      const taakId = String(invoer.taakId ?? '').trim().slice(0, 120);
      const sessieId = String(invoer.sessieId ?? '').trim().slice(0, 120);
      const titel = String(invoer.titel ?? '').trim().slice(0, 240);
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      const soortBericht = schoonBerichtSoort(invoer.soortBericht);
      const idempotentieSleutel =
        String(invoer.idempotentieSleutel ?? '').trim().slice(0, 160) ||
        `${agentSlug}:${taakId || 'algemeen'}:${randomUUID()}`;

      if (!agentSlug || !titel) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      const verw = valideerBestandsVerwijzingen(invoer.bestandsVerwijzingen);
      if (!verw.ok) return { ok: false, code: verw.code, httpStatus: 400 };
      if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(taakId)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }

      const dup = [...bezorgingen.values()].find(
        (z) => z.userId === lade.userId && z.ruimte === lade.ruimte && z.idempotentieSleutel === idempotentieSleutel,
      );
      if (dup) return { ok: true, bezorging: publiekBez(dup), duplicaat: true, verzonden: dup.status === 'verzonden' };

      const bot = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === agentSlug,
      );
      if (!bot) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (bot.status === 'gepauzeerd') return { ok: false, code: BOT_FOUTEN.gepauzeerd, httpStatus: 409 };
      if (bot.status === 'ingetrokken') return { ok: false, code: BOT_FOUTEN.ingetrokken, httpStatus: 409 };
      if (bot.status !== 'actief' || !bot.kanPubliceren) {
        return { ok: false, code: BOT_FOUTEN.geenPublicatierecht, httpStatus: 409 };
      }
      if (!bot.sleutelAanwezig || !bot.ruweSleutel) return { ok: false, code: BOT_FOUTEN.sleutelOntbreekt, httpStatus: 400 };
      if (!bot.chatId) return { ok: false, code: BOT_FOUTEN.chatOngeldig, httpStatus: 400 };
      if (!bot.toegestaneBerichtSoorten.includes(soortBericht)) {
        return { ok: false, code: BOT_FOUTEN.soortNietToegestaan, httpStatus: 403 };
      }

      if (invoer.vorigeBezorgingId) {
        const vb = bezorgingen.get(invoer.vorigeBezorgingId.trim());
        if (!vb || vb.userId !== lade.userId || vb.ruimte !== lade.ruimte) {
          return { ok: false, code: BOT_FOUTEN.bezorgingNietGevonden, httpStatus: 404 };
        }
      }

      const nu = Date.now();
      const id = randomUUID();
      const record: GeheugenTelegramBezorging & { userId: string } = {
        id,
        userId: lade.userId,
        ruimte: lade.ruimte,
        botId: bot.id,
        agentSlug,
        taakId,
        sessieId,
        ...(invoer.knoopId ? { knoopId: invoer.knoopId } : {}),
        ...(invoer.vorigeBezorgingId ? { vorigeBezorgingId: invoer.vorigeBezorgingId } : {}),
        soortBericht,
        idempotentieSleutel,
        titel,
        samenvatting,
        bestandsVerwijzingen: verw.items,
        telegramChatId: bot.chatId,
        telegramThreadId: bot.threadId,
        telegramBerichtId: null,
        status: 'wachtrij',
        pogingen: 0,
        laatsteFout: '',
        aangemaaktOp: nu,
        bijgewerktOp: nu,
      };
      bezorgingen.set(id, record);

      if (invoer.directVerzenden === false) {
        return { ok: true, bezorging: publiekBez(record), duplicaat: false, verzonden: false };
      }

      const tekst = maakTelegramBerichtTekst({
        ruimte: lade.ruimte,
        agentSlug,
        taakId,
        soortBericht,
        titel,
        samenvatting,
        bestandsVerwijzingen: verw.items,
        vorigeBezorgingId: record.vorigeBezorgingId,
      });
      const res = await telegramAanroep<{ message_id: number }>(tgFetch, bot.ruweSleutel, 'sendMessage', {
        chat_id: bot.chatId,
        ...(bot.threadId !== null ? { message_thread_id: bot.threadId } : {}),
        text: tekst,
        disable_web_page_preview: true,
      });
      record.pogingen += 1;
      record.bijgewerktOp = Date.now();
      if (res.ok) {
        record.status = 'verzonden';
        record.telegramBerichtId = Number(res.result.message_id ?? 0);
        record.verzondenOp = record.bijgewerktOp;
        record.laatsteFout = '';
        bot.laatsteBerichtId = record.telegramBerichtId;
        bot.laatsteBerichtOp = record.verzondenOp;
        bot.laatsteFout = '';
        return { ok: true, bezorging: publiekBez(record), duplicaat: false, verzonden: true };
      }
      record.status = 'mislukt';
      record.laatsteFout = res.beschrijving || res.code;
      bot.laatsteFout = record.laatsteFout;
      return { ok: true, bezorging: publiekBez(record), duplicaat: false, verzonden: false, fout: record.laatsteFout };
    },

    async opnieuwBezorgen(lade, bezorgingId) {
      const record = bezorgingen.get(bezorgingId.trim());
      if (!record || record.userId !== lade.userId || record.ruimte !== lade.ruimte) {
        return { ok: false, code: BOT_FOUTEN.bezorgingNietGevonden, httpStatus: 404 };
      }
      if (record.status === 'verzonden') {
        return { ok: true, bezorging: publiekBez(record), duplicaat: true, verzonden: true };
      }
      const bot = [...bots.values()].find(
        (b) => b.userId === lade.userId && b.ruimte === lade.ruimte && b.agentSlug === record.agentSlug,
      );
      if (!bot) return { ok: false, code: BOT_FOUTEN.botNietGevonden, httpStatus: 404 };
      if (bot.status === 'gepauzeerd') return { ok: false, code: BOT_FOUTEN.gepauzeerd, httpStatus: 409 };
      if (bot.status === 'ingetrokken') return { ok: false, code: BOT_FOUTEN.ingetrokken, httpStatus: 409 };
      if (bot.status !== 'actief' || !bot.kanPubliceren) {
        return { ok: false, code: BOT_FOUTEN.geenPublicatierecht, httpStatus: 409 };
      }
      if (!bot.toegestaneBerichtSoorten.includes(record.soortBericht)) {
        return { ok: false, code: BOT_FOUTEN.soortNietToegestaan, httpStatus: 403 };
      }

      const tekst = maakTelegramBerichtTekst({
        ruimte: lade.ruimte,
        agentSlug: record.agentSlug,
        taakId: record.taakId,
        soortBericht: record.soortBericht,
        titel: record.titel,
        samenvatting: record.samenvatting,
        bestandsVerwijzingen: record.bestandsVerwijzingen,
        vorigeBezorgingId: record.vorigeBezorgingId,
      });
      const res = await telegramAanroep<{ message_id: number }>(tgFetch, bot.ruweSleutel, 'sendMessage', {
        chat_id: bot.chatId,
        ...(bot.threadId !== null ? { message_thread_id: bot.threadId } : {}),
        text: tekst,
        disable_web_page_preview: true,
      });
      record.pogingen += 1;
      record.bijgewerktOp = Date.now();
      if (res.ok) {
        record.status = 'verzonden';
        record.telegramBerichtId = Number(res.result.message_id ?? 0);
        record.verzondenOp = record.bijgewerktOp;
        record.laatsteFout = '';
        bot.laatsteBerichtId = record.telegramBerichtId;
        bot.laatsteBerichtOp = record.verzondenOp;
        return { ok: true, bezorging: publiekBez(record), duplicaat: false, verzonden: true };
      }
      record.status = 'mislukt';
      record.laatsteFout = res.beschrijving || res.code;
      return { ok: true, bezorging: publiekBez(record), duplicaat: false, verzonden: false, fout: record.laatsteFout };
    },

    async gesprekInvoeren(lade, invoer, agentHint = '') {
      const agentSlug = schoonAgentSlug(invoer.agentSlug || agentHint || 'handmatig');
      const taakId = String(invoer.taakId ?? '').trim().slice(0, 120);
      const titel = String(invoer.titel ?? '').trim().slice(0, 200);
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      if (!agentSlug || !titel || !samenvatting) {
        return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer, httpStatus: 400 };
      }
      if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(taakId)) {
        return { ok: false, code: BOT_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }
      const verw = valideerBestandsVerwijzingen(invoer.bestandsVerwijzingen);
      if (!verw.ok) return { ok: false, code: verw.code, httpStatus: 400 };

      const regels = [samenvatting];
      if (taakId) regels.push(`Завдання / Taak: ${taakId}`);
      if (verw.items.length > 0) {
        regels.push(
          'Файли / Bestanden:',
          ...verw.items.map((f) => `- ${f.naam}: ${f.verwijzing}${f.sha256 ? ` (sha256:${f.sha256})` : ''}`),
        );
      }

      const op = await stroom.bewaarKnoop(
        lade,
        {
          soort: 'context',
          titel,
          inhoud: regels.join('\n').slice(0, 7800),
          samenvatting: samenvatting.slice(0, 240),
          bronDienst: 'ai',
          bronAgent: agentSlug,
          labels: ['handmatig-gesprek', agentSlug, ...(taakId ? [`taak-${normaliseerGeheugenSleutel(taakId, 'taak').slice(0, 32)}`] : [])],
        },
        agentSlug,
      );
      if (!op.ok) return { ok: false, code: op.code, httpStatus: 400 };

      let bezorging: GeheugenTelegramBezorging | undefined;
      if (invoer.ookBezorgen) {
        const bez = await this.bezorgBericht(lade, {
          agentSlug,
          taakId: taakId || `gesprek-${op.knoop.sleutel}`,
          knoopId: op.knoop.id,
          vorigeBezorgingId: invoer.vorigeBezorgingId,
          soortBericht: 'gesprek',
          idempotentieSleutel: invoer.idempotentieSleutel,
          titel,
          samenvatting,
          bestandsVerwijzingen: verw.items,
          directVerzenden: true,
        });
        if (!bez.ok) return { ok: false, code: bez.code, httpStatus: bez.httpStatus };
        bezorging = bez.bezorging;
      }

      return {
        ok: true,
        knoop: op.knoop,
        ...(bezorging ? { bezorging } : {}),
        opmerkingUk: EERLIJKE_GESPREK_OPMERKING_UK,
        opmerkingNl: EERLIJKE_GESPREK_OPMERKING_NL,
      };
    },
  };
}

type SessieUitkomst =
  | { errorCode: string }
  | { user: { id: string; email: string; role: string; status: string; entitlements?: unknown }; service: string };

export interface GeheugenAgentBotsDeps {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieUitkomst>;
  opslag?: BotsOpslag;
  ladeVan?: (userId: string, body: unknown) => Promise<Lade>;
  limiet?: (userId: string) => Promise<boolean>;
}

const lichaam = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

export function geheugenAgentBotsRoutes(deps: GeheugenAgentBotsDeps): Record<string, RouterMiddleware[]> {
  const opslag = deps.opslag ?? pgBotsOpslag;
  const ladeVan = deps.ladeVan ?? ecosysteemLade;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`geheugen-bots:${userId}`, 90, 60)).ok);

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
    'POST /api/owner/ai/geheugen/bots/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const uit = await opslag.overzicht(p.lade, {
        zoek: typeof b.zoek === 'string' ? b.zoek : '',
        taakId: typeof b.taakId === 'string' ? b.taakId : '',
        agentSlug: typeof b.agentSlug === 'string' ? b.agentSlug : '',
        limiet: typeof b.limiet === 'number' ? b.limiet : 80,
      });
      return json({ ok: true, ...uit });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      try {
        const res = await opslag.bewaarBot(p.lade, {
          agentSlug: String(b.agentSlug ?? ''),
          dienstNaam: typeof b.dienstNaam === 'string' ? b.dienstNaam : undefined,
          weergaveNaam: typeof b.weergaveNaam === 'string' ? b.weergaveNaam : undefined,
          beschrijving: typeof b.beschrijving === 'string' ? b.beschrijving : undefined,
          avatarKleur: typeof b.avatarKleur === 'string' ? b.avatarKleur : undefined,
          botSleutel: typeof b.botSleutel === 'string' ? b.botSleutel : undefined,
          chatId: typeof b.chatId === 'string' ? b.chatId : undefined,
          threadId: b.threadId !== undefined ? (b.threadId as number | string | null) : undefined,
          toegestaneActies: Array.isArray(b.toegestaneActies) || typeof b.toegestaneActies === 'string'
            ? (b.toegestaneActies as string[] | string)
            : undefined,
          toegestaneBerichtSoorten: Array.isArray(b.toegestaneBerichtSoorten)
            ? (b.toegestaneBerichtSoorten as string[])
            : undefined,
          status: typeof b.status === 'string' ? schoonBotStatus(b.status) : undefined,
        });
        if (!res.ok) return error(res.code, res.httpStatus ?? 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.bots.opslaan',
          result: 'success',
          details: { ruimte: p.lade.ruimte, agentSlug: res.bot.agentSlug, sleutelAanwezig: res.bot.sleutelAanwezig },
        }).catch(() => undefined);
        return json({ ok: true, ruimte: p.lade.ruimte, bot: res.bot });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/testen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      try {
        const res = await opslag.testenBot(p.lade, String(b.agentSlug ?? ''));
        if (!res.ok) return error(res.code, res.httpStatus ?? 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.bots.testen',
          result: res.bot.kanPubliceren ? 'success' : 'failure',
          details: { ruimte: p.lade.ruimte, agentSlug: res.bot.agentSlug, kanPubliceren: res.bot.kanPubliceren },
        }).catch(() => undefined);
        return json({ ok: true, ruimte: p.lade.ruimte, bot: res.bot, ...(res.foutCode ? { foutCode: res.foutCode } : {}) });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/status': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const status = schoonBotStatus(b.status);
      const res = await opslag.zetBotStatus(p.lade, String(b.agentSlug ?? ''), status);
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.bots.status',
        result: 'success',
        details: { ruimte: p.lade.ruimte, agentSlug: res.bot.agentSlug, status: res.bot.status },
      }).catch(() => undefined);
      return json({ ok: true, ruimte: p.lade.ruimte, bot: res.bot });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/verwijderen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const res = await opslag.verwijderBot(p.lade, String(b.agentSlug ?? ''));
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.bots.verwijderen',
        result: 'success',
        details: { ruimte: p.lade.ruimte, agentSlug: schoonAgentSlug(b.agentSlug) },
      }).catch(() => undefined);
      return json({ ok: true, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/bezorgen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      try {
        const res = await opslag.bezorgBericht(p.lade, {
          agentSlug: String(b.agentSlug ?? ''),
          taakId: String(b.taakId ?? ''),
          sessieId: typeof b.sessieId === 'string' ? b.sessieId : undefined,
          knoopId: typeof b.knoopId === 'string' ? b.knoopId : undefined,
          vorigeBezorgingId: typeof b.vorigeBezorgingId === 'string' ? b.vorigeBezorgingId : undefined,
          soortBericht: typeof b.soortBericht === 'string' ? b.soortBericht : undefined,
          idempotentieSleutel: typeof b.idempotentieSleutel === 'string' ? b.idempotentieSleutel : undefined,
          titel: String(b.titel ?? ''),
          samenvatting: typeof b.samenvatting === 'string' ? b.samenvatting : undefined,
          bestandsVerwijzingen: b.bestandsVerwijzingen,
          directVerzenden: b.directVerzenden !== false,
        });
        if (!res.ok) return error(res.code, res.httpStatus ?? 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.bots.bezorgen',
          result: res.verzonden ? 'success' : 'failure',
          details: {
            ruimte: p.lade.ruimte,
            agentSlug: res.bezorging.agentSlug,
            taakId: res.bezorging.taakId,
            soortBericht: res.bezorging.soortBericht,
            duplicaat: res.duplicaat,
            status: res.bezorging.status,
          },
        }).catch(() => undefined);
        return json({ ...res, ruimte: p.lade.ruimte });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/opnieuw': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      try {
        const res = await opslag.opnieuwBezorgen(p.lade, String(b.id ?? ''));
        if (!res.ok) return error(res.code, res.httpStatus ?? 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.bots.opnieuw',
          result: res.verzonden ? 'success' : 'failure',
          details: {
            ruimte: p.lade.ruimte,
            agentSlug: res.bezorging.agentSlug,
            taakId: res.bezorging.taakId,
            status: res.bezorging.status,
          },
        }).catch(() => undefined);
        return json({ ...res, ruimte: p.lade.ruimte });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/bots/gesprek-invoeren': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      try {
        const res = await opslag.gesprekInvoeren(
          p.lade,
          {
            agentSlug: String(b.agentSlug ?? ''),
            taakId: typeof b.taakId === 'string' ? b.taakId : undefined,
            titel: String(b.titel ?? ''),
            samenvatting: String(b.samenvatting ?? ''),
            bestandsVerwijzingen: b.bestandsVerwijzingen,
            ookBezorgen: b.ookBezorgen === true,
            idempotentieSleutel: typeof b.idempotentieSleutel === 'string' ? b.idempotentieSleutel : undefined,
            vorigeBezorgingId: typeof b.vorigeBezorgingId === 'string' ? b.vorigeBezorgingId : undefined,
          },
          wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
        );
        if (!res.ok) return error(res.code, res.httpStatus ?? 400);
        await auditToevoegen({
          ownerId: p.user.id,
          action: 'owner.ai.geheugen.bots.gesprek_invoeren',
          result: 'success',
          details: {
            ruimte: p.lade.ruimte,
            agentSlug: res.knoop.bronAgent,
            ookBezorgen: Boolean(res.bezorging),
          },
        }).catch(() => undefined);
        return json({ ...res, ruimte: p.lade.ruimte });
      } catch (err) {
        if ((err as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw err;
      }
    }) as RouterMiddleware],
  };
}
