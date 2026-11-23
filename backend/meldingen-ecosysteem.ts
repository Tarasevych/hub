// Серверне ядро, сховище PostgreSQL (під RLS) і API-маршрути єдиної екосистеми сповіщень (GEMINI-002).
// Усі операції читання й запису виконуються через `alsGebruiker(lade.userId, ...)` із `WHERE user_id = $1 AND ruimte = $2`.
// Сигнали від ПК-агента, розширення оглядача, ШІ, пошти, сховища та вебсайту проходять через `interpreteerGebeurtenis`.

import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { db } from '../server/platform/db';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { stuurBijlageMeldingNaarTelegram } from './bijlage-telegram-melding';
import { defaultChatDeps } from './connectors-chat';
import { gegevensRuimteVeilig, RuimteFout, technischeRechten } from './ruimte-scheiding';
import { AI_AANBIEDER_BIJ_ID, type AiAanbiederId } from '../shared/ai-aanbieders';
import type { Lade } from '../shared/ruimte-scheiding';
import { jsonbTekst } from '../shared/tekst-veilig';
import { zichtbaarVoor, type Ontvanger as MeldingOntvanger } from '../shared/melding-soorten';
import { sfeerVanRij } from '../shared/meldingen-soorten';
import {
  bouwAiPromptVoorGebeurtenis,
  GEBEURTENIS_STATUSSEN,
  herkenKanaal,
  interneAiAnalyse,
  interpreteerGebeurtenis,
  normaliseerGebeurtenis,
  normaliseerProfiel,
  standaardProfiel,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type MeldingKanaal,
  type MeldingPrioriteit,
  type MeldingSubdomein,
  type RuimteType,
} from '../shared/meldingen-ecosysteem';

type Auth = { errorCode: string } | { user: { id: string; status?: string; role?: string; email?: string }; tab?: string };
type RequireSession = (event: unknown, body: unknown) => Promise<Auth>;

class LimietFout extends Error {
  readonly retryAfter: number;
  constructor(retryAfter?: number) {
    super('RATE_LIMITED');
    this.retryAfter = typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function meldingLade(
  userId: string,
  body: unknown,
  fallbackTab?: string,
  opties: { isProfielBeheer?: boolean } = {},
): Promise<Lade> {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const tab = String(b.tabContext ?? fallbackTab ?? '');
  let actieveRuimte: RuimteType = 'prive';
  try {
    actieveRuimte = await gegevensRuimteVeilig(userId, { tabContext: tab });
  } catch {
    actieveRuimte = 'prive';
  }
  const gevraagd = b.ruimte === 'technisch' ? 'technisch' : b.ruimte === 'prive' ? 'prive' : null;
  if (gevraagd === 'prive') return { userId, ruimte: 'prive' };
  if (gevraagd === 'technisch' && actieveRuimte !== 'technisch') {
    if (opties.isProfielBeheer) {
      const r = await technischeRechten(userId).catch(() => ({ ok: false as const }));
      if (r.ok) return { userId, ruimte: 'technisch' };
    }
    throw new RuimteFout('TECHNISCHE_RUIMTE_VEREIST', 403);
  }
  return { userId, ruimte: actieveRuimte };
}

export async function leesProfiel(lade: Lade): Promise<MeldingEcosysteemProfiel> {
  return alsGebruiker(lade.userId, async (q) => {
    const res = await q(
      `SELECT instellingen, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt
         FROM app.melding_ecosysteem_profiel
        WHERE user_id = $1 AND ruimte = $2`,
      [lade.userId, lade.ruimte],
    );
    if (!res.rows[0]) return standaardProfiel(lade.ruimte);
    const r = res.rows[0] as Record<string, unknown>;
    const raw = (r.instellingen && typeof r.instellingen === 'object' ? r.instellingen : {}) as Record<string, unknown>;
    return normaliseerProfiel({ ...raw, bijgewerktOp: Number(r.bijgewerkt || raw.bijgewerktOp || 0) }, lade.ruimte);
  });
}

export async function schrijfProfiel(lade: Lade, invoer: unknown): Promise<MeldingEcosysteemProfiel> {
  const profiel = normaliseerProfiel(invoer, lade.ruimte);
  const opslag = { ...profiel, bijgewerktOp: Date.now() };
  await alsGebruiker(lade.userId, async (q) => {
    await q(
      `INSERT INTO app.melding_ecosysteem_profiel (user_id, ruimte, instellingen, bijgewerkt_op)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, ruimte)
       DO UPDATE SET instellingen = EXCLUDED.instellingen, bijgewerkt_op = now()`,
      [lade.userId, lade.ruimte, jsonbTekst(opslag)],
    );
  });
  return opslag;
}

const KOLOMMEN = `
  id, ruimte, externe_sleutel, kanaal, subdomein, bron, prioriteit, status,
  titel, bericht, uitleg, context_label, herhalingen,
  uitgesteld_tot, bijlagen, acties, meta, ai_samenvatting,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op,
  (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt_op
`;

export async function slaGebeurtenisOp(
  lade: Lade,
  invoer: Record<string, unknown>,
): Promise<MeldingEcosysteemGebeurtenis> {
  const ruweSoort = typeof invoer.soort === 'string' ? invoer.soort : undefined;
  const geb = interpreteerGebeurtenis(
    {
      ruimte: lade.ruimte,
      externeSleutel: typeof invoer.externeSleutel === 'string' ? invoer.externeSleutel : undefined,
      bron: typeof invoer.bron === 'string' ? invoer.bron : undefined,
      kanaal: typeof invoer.kanaal === 'string' ? (invoer.kanaal as MeldingKanaal) : undefined,
      subdomein: typeof invoer.subdomein === 'string' ? (invoer.subdomein as MeldingSubdomein) : undefined,
      soort: ruweSoort,
      ernst: typeof invoer.ernst === 'string' ? invoer.ernst : undefined,
      status: typeof invoer.status === 'string' ? (invoer.status as MeldingGebeurtenisStatus) : undefined,
      herhalingen: typeof invoer.herhalingen === 'number' ? invoer.herhalingen : undefined,
      aangemaaktOp: typeof invoer.aangemaaktOp === 'number' ? invoer.aangemaaktOp : undefined,
      bijgewerktOp: typeof invoer.bijgewerktOp === 'number' ? invoer.bijgewerktOp : undefined,
      titel: typeof invoer.titel === 'string' ? invoer.titel : undefined,
      bericht: typeof invoer.bericht === 'string' ? invoer.bericht : undefined,
      uitleg: typeof invoer.uitleg === 'string' ? invoer.uitleg : undefined,
      contextLabel: typeof invoer.contextLabel === 'string' ? invoer.contextLabel : undefined,
      link: typeof invoer.link === 'string' ? invoer.link : undefined,
      bijlagen: Array.isArray(invoer.bijlagen) ? invoer.bijlagen : undefined,
      acties: Array.isArray(invoer.acties) ? invoer.acties : undefined,
      meta: invoer.meta && typeof invoer.meta === 'object' ? (invoer.meta as Record<string, unknown>) : undefined,
    },
    lade.ruimte,
  );

  const aantalHerhalingen = Math.max(1, geb.herhalingen);

  const opgeslagen = await alsGebruiker(lade.userId, async (q) => {
    if (geb.externeSleutel) {
      const r = await q(
        `INSERT INTO app.melding_ecosysteem_gebeurtenissen
          (user_id, ruimte, externe_sleutel, kanaal, subdomein, bron, prioriteit, status, titel, bericht, uitleg, context_label, herhalingen, bijlagen, acties, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb)
           ON CONFLICT (user_id, ruimte, externe_sleutel) WHERE externe_sleutel <> ''
           DO UPDATE SET
             herhalingen = GREATEST(app.melding_ecosysteem_gebeurtenissen.herhalingen + 1, EXCLUDED.herhalingen),
             prioriteit = CASE
               WHEN EXCLUDED.prioriteit = 'kritiek' THEN 'kritiek'
               ELSE app.melding_ecosysteem_gebeurtenissen.prioriteit
             END,
             status = CASE
               WHEN EXCLUDED.status = 'opgelost' THEN 'opgelost'
               WHEN app.melding_ecosysteem_gebeurtenissen.status = 'opgelost' THEN EXCLUDED.status
               ELSE app.melding_ecosysteem_gebeurtenissen.status
             END,
             titel = CASE WHEN EXCLUDED.titel <> '' THEN EXCLUDED.titel ELSE app.melding_ecosysteem_gebeurtenissen.titel END,
             bericht = CASE WHEN EXCLUDED.bericht <> '' THEN EXCLUDED.bericht ELSE app.melding_ecosysteem_gebeurtenissen.bericht END,
             uitleg = CASE WHEN EXCLUDED.uitleg <> '' THEN EXCLUDED.uitleg ELSE app.melding_ecosysteem_gebeurtenissen.uitleg END,
             context_label = CASE WHEN EXCLUDED.context_label <> '' THEN EXCLUDED.context_label ELSE app.melding_ecosysteem_gebeurtenissen.context_label END,
             bijlagen = CASE WHEN jsonb_array_length(EXCLUDED.bijlagen) > 0 THEN EXCLUDED.bijlagen ELSE app.melding_ecosysteem_gebeurtenissen.bijlagen END,
             acties = CASE WHEN jsonb_array_length(EXCLUDED.acties) > 0 THEN EXCLUDED.acties ELSE app.melding_ecosysteem_gebeurtenissen.acties END,
             meta = app.melding_ecosysteem_gebeurtenissen.meta || EXCLUDED.meta,
             bijgewerkt_op = now()
           RETURNING ${KOLOMMEN}`,
        [
          lade.userId,
          lade.ruimte,
          geb.externeSleutel,
          geb.kanaal,
          geb.subdomein,
          geb.bron,
          geb.prioriteit,
          geb.status,
          geb.titel,
          geb.bericht,
          geb.uitleg,
          geb.contextLabel,
          aantalHerhalingen,
          jsonbTekst(geb.bijlagen),
          jsonbTekst(geb.acties),
          jsonbTekst(geb.meta),
        ],
      );
      return normaliseerGebeurtenis(r.rows[0] as Record<string, unknown>);
    }

    const r = await q(
      `INSERT INTO app.melding_ecosysteem_gebeurtenissen
        (user_id, ruimte, externe_sleutel, kanaal, subdomein, bron, prioriteit, status, titel, bericht, uitleg, context_label, herhalingen, bijlagen, acties, meta)
       VALUES ($1, $2, '', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb)
       RETURNING ${KOLOMMEN}`,
      [
        lade.userId,
        lade.ruimte,
        geb.kanaal,
        geb.subdomein,
        geb.bron,
        geb.prioriteit,
        geb.status,
        geb.titel,
        geb.bericht,
        geb.uitleg,
        geb.contextLabel,
        aantalHerhalingen,
        jsonbTekst(geb.bijlagen),
        jsonbTekst(geb.acties),
        jsonbTekst(geb.meta),
      ],
    );
    return normaliseerGebeurtenis(r.rows[0] as Record<string, unknown>);
  });

  if (geb.bron === 'verbinding-bewijs') {
    const m = (geb.meta || {}) as Record<string, unknown>;
    const soortCode = ruweSoort || String(m.soort || 'server_storing');
    const bewijsDetails = {
      ruimte: lade.ruimte,
      externeSleutel: opgeslagen.externeSleutel,
      dienst: String(m.dienst || opgeslagen.subdomein || '').slice(0, 64),
      foutCode: String(m.foutCode || '').slice(0, 80),
      statusCode: Number.isFinite(Number(m.statusCode)) ? Math.trunc(Number(m.statusCode)) : 0,
      duurMs: Number.isFinite(Number(m.duurMs)) ? Math.max(0, Math.trunc(Number(m.duurMs))) : null,
      pogingenAantal: Math.max(1, Number.isFinite(Number(m.pogingenAantal)) ? Math.trunc(Number(m.pogingenAantal)) : opgeslagen.herhalingen),
      route: String(m.route || '').slice(0, 200),
    };
    if (soortCode === 'netwerk_offline') {
      await auditToevoegen({
        ownerId: lade.userId,
        actorId: lade.userId,
        action: 'owner.systeem.verbinding.offline',
        type: 'diagnose',
        result: 'failure',
        details: bewijsDetails,
      }).catch(() => undefined);
    } else {
      await auditToevoegen({
        ownerId: lade.userId,
        actorId: lade.userId,
        action: 'owner.systeem.verbinding.storing',
        type: 'diagnose',
        result: 'failure',
        details: bewijsDetails,
      }).catch(() => undefined);
    }
    if (opgeslagen.status === 'opgelost') {
      await auditToevoegen({
        ownerId: lade.userId,
        actorId: lade.userId,
        action: 'owner.systeem.verbinding.hersteld',
        type: 'diagnose',
        result: 'success',
        details: bewijsDetails,
      }).catch(() => undefined);
    }
  }

  return opgeslagen;
}

export async function lijstStroom(
  lade: Lade,
  opties: { kanaal?: string; subdomein?: string; status?: string; zoek?: string; limiet?: number; ontvanger?: MeldingOntvanger } = {},
): Promise<{ gebeurtenissen: MeldingEcosysteemGebeurtenis[]; ongelezen: number }> {
  const limiet = Math.max(1, Math.min(120, Math.trunc(Number(opties.limiet) || 60)));
  return alsGebruiker(lade.userId, async (q) => {
    // Автоматично пробуджуємо події, чий термін відкладення вже настав.
    await q(
      `UPDATE app.melding_ecosysteem_gebeurtenissen
          SET status = 'nieuw', uitgesteld_tot = NULL, bijgewerkt_op = now()
        WHERE user_id = $1 AND ruimte = $2 AND status = 'uitgesteld' AND uitgesteld_tot IS NOT NULL AND uitgesteld_tot <= now()`,
      [lade.userId, lade.ruimte],
    ).catch(() => undefined);

    const conds = ['user_id = $1', 'ruimte = $2'];
    const params: unknown[] = [lade.userId, lade.ruimte];
    if (opties.kanaal && opties.kanaal !== 'alle') {
      params.push(String(opties.kanaal));
      conds.push(`kanaal = $${params.length}`);
    }
    if (opties.subdomein && opties.subdomein !== 'alle') {
      params.push(String(opties.subdomein));
      conds.push(`subdomein = $${params.length}`);
    }
    if (opties.status && (GEBEURTENIS_STATUSSEN as readonly string[]).includes(opties.status)) {
      params.push(opties.status);
      conds.push(`status = $${params.length}`);
    }
    const zoekNorm = opties.zoek ? opties.zoek.trim().slice(0, 80) : '';
    if (zoekNorm) {
      const escaped = zoekNorm.replace(/[%_\\]/g, '\\$&');
      params.push(`%${escaped}%`);
      const idx = params.length;
      conds.push(`(titel ILIKE $${idx} ESCAPE '\\' OR bericht ILIKE $${idx} ESCAPE '\\' OR bron ILIKE $${idx} ESCAPE '\\' OR context_label ILIKE $${idx} ESCAPE '\\')`);
    }
    params.push(limiet);
    const res = await q(
      `SELECT ${KOLOMMEN}
         FROM app.melding_ecosysteem_gebeurtenissen
        WHERE ${conds.join(' AND ')}
        ORDER BY
          CASE status WHEN 'nieuw' THEN 0 WHEN 'uitgesteld' THEN 1 WHEN 'gelezen' THEN 2 WHEN 'opgelost' THEN 3 ELSE 4 END,
          CASE prioriteit WHEN 'kritiek' THEN 0 WHEN 'hoog' THEN 1 WHEN 'normaal' THEN 2 ELSE 3 END,
          bijgewerkt_op DESC
        LIMIT $${params.length}`,
      params,
    );
    const gebeurtenissen = res.rows.map((r) => normaliseerGebeurtenis(r as Record<string, unknown>));

    // Також підтягуємо останні непрочитані серверні сповіщення з `site_notifications` цієї ж просторової полички,
    // якщо вони ще не записані як події потоку, щоб панель бачила 100% подій сайту без розривів.
    const bekendeSleutels = new Set(gebeurtenissen.map((g) => g.externeSleutel).filter(Boolean));
    try {
      const serverMeld = await db.list<Record<string, unknown>>('site_notifications', {
        filter: { recipientUserId: lade.userId },
        limit: 25,
        nieuwsteEerst: true,
      });
      const zoekLaag = zoekNorm.toLowerCase();
      for (const s of serverMeld.items) {
        const sRuimte: RuimteType = sfeerVanRij(s);
        if (sRuimte !== lade.ruimte) continue;
        if (opties.ontvanger && !zichtbaarVoor(s.kind, opties.ontvanger)) continue;
        const sleutel = `site_notif:${s.id}`;
        if (bekendeSleutels.has(sleutel)) continue;
        const geb = interpreteerGebeurtenis(
          {
            id: sleutel,
            externeSleutel: sleutel,
            ruimte: sRuimte,
            bron: String(s.kind || 'systeem'),
            soort: String(s.kind || ''),
            titel: String(s.title || ''),
            bericht: String(s.message || ''),
            link: typeof s.link === 'string' ? s.link : undefined,
            aangemaaktOp: Number(s.createdAt) || Date.now(),
            gelezen: s.read === true,
          },
          lade.ruimte,
        );
        if (opties.kanaal && opties.kanaal !== 'alle' && geb.kanaal !== opties.kanaal) continue;
        if (opties.subdomein && opties.subdomein !== 'alle' && geb.subdomein !== opties.subdomein) continue;
        if (opties.status && (GEBEURTENIS_STATUSSEN as readonly string[]).includes(opties.status) && geb.status !== opties.status) continue;
        if (zoekLaag) {
          const hay = `${geb.titel} ${geb.bericht} ${geb.bron} ${geb.contextLabel}`.toLowerCase();
          if (!hay.includes(zoekLaag)) continue;
        }
        gebeurtenissen.push(geb);
      }
    } catch {
      /* якщо site_notifications недоступна в ізольованому тесті — працюємо чисто на новій таблиці */
    }

    const ongelezen = gebeurtenissen.filter((g) => g.status === 'nieuw').length;
    return { gebeurtenissen: gebeurtenissen.slice(0, limiet), ongelezen };
  });
}

export async function voerActieUit(
  lade: Lade,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; gebeurtenis?: MeldingEcosysteemGebeurtenis }> {
  const rawId = String(body.id || '').trim();
  const actie = String(body.actie || 'statusBijwerken').trim().slice(0, 80);
  const statusDoel = typeof body.status === 'string' && (GEBEURTENIS_STATUSSEN as readonly string[]).includes(body.status)
    ? (body.status as MeldingGebeurtenisStatus)
    : undefined;
  const uitstelMinuten = Math.max(1, Math.min(43_200, Math.trunc(Number(body.uitstelMinuten) || 30)));
  const uitgesteldTot = statusDoel === 'uitgesteld' ? new Date(Date.now() + uitstelMinuten * 60_000).toISOString() : null;

  let bijgewerkt: MeldingEcosysteemGebeurtenis | undefined;
  let uuidLogId: string | null = UUID_RE.test(rawId) ? rawId : null;

  await alsGebruiker(lade.userId, async (q) => {
    if (actie === 'allesGelezen') {
      await q(
        `UPDATE app.melding_ecosysteem_gebeurtenissen
            SET status = 'gelezen', bijgewerkt_op = now()
          WHERE user_id = $1 AND ruimte = $2 AND status = 'nieuw'`,
        [lade.userId, lade.ruimte],
      );
    } else if (UUID_RE.test(rawId) && statusDoel) {
      const r = await q(
        `UPDATE app.melding_ecosysteem_gebeurtenissen
            SET status = $3, uitgesteld_tot = $4::timestamptz, bijgewerkt_op = now()
          WHERE id = $1::uuid AND user_id = $2 AND ruimte = $5
          RETURNING ${KOLOMMEN}`,
        [rawId, lade.userId, statusDoel, uitgesteldTot, lade.ruimte],
      );
      if (r.rows[0]) bijgewerkt = normaliseerGebeurtenis(r.rows[0] as Record<string, unknown>);
    } else if (rawId && statusDoel) {
      // Подія з іншого джерела або синтетична картка без UUID — оновлюємо за externe_sleutel або створюємо зафіксований стан.
      const r = await q(
        `UPDATE app.melding_ecosysteem_gebeurtenissen
            SET status = $3, uitgesteld_tot = $4::timestamptz, bijgewerkt_op = now()
          WHERE externe_sleutel = $1 AND user_id = $2 AND ruimte = $5
          RETURNING ${KOLOMMEN}`,
        [rawId.slice(0, 180), lade.userId, statusDoel, uitgesteldTot, lade.ruimte],
      );
      if (r.rows[0]) {
        bijgewerkt = normaliseerGebeurtenis(r.rows[0] as Record<string, unknown>);
        uuidLogId = bijgewerkt.id;
      }
    }

    await q(
      `INSERT INTO app.melding_ecosysteem_actie_log (user_id, ruimte, gebeurtenis_id, actie, kanaal, details)
       VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb)`,
      [
        lade.userId,
        lade.ruimte,
        uuidLogId,
        actie,
        String(body.kanaal || '').slice(0, 64),
        jsonbTekst({ status: statusDoel || null, bronId: rawId.slice(0, 120) }),
      ],
    );
  });

  await auditToevoegen({
    ownerId: lade.userId,
    actorId: lade.userId,
    action: 'owner.meldingen.ecosysteem.actie',
    type: 'instelling',
    result: 'success',
    details: { ruimte: lade.ruimte, actie, status: statusDoel || null },
  }).catch(() => undefined);

  return { ok: true, ...(bijgewerkt ? { gebeurtenis: bijgewerkt } : {}) };
}

function naarAanbiederId(keuze?: string): AiAanbiederId {
  if (keuze === 'claude') return 'anthropic';
  if (keuze === 'gemini' || keuze === 'openai' || keuze === 'grok' || keuze === 'autoclaw') return keuze;
  return 'gemini';
}

async function externAiVerzoek(
  aanbiederId: AiAanbiederId,
  apiKey: string,
  systeem: string,
  vraag: string,
): Promise<Partial<MeldingAiSamenvatting> | null> {
  const meta = AI_AANBIEDER_BIJ_ID[aanbiederId];
  const model = meta.standaardVertaalModel || meta.standaardModel;
  let tekst = '';

  if (aanbiederId === 'gemini') {
    const res = await fetch(`${meta.eindpunt}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systeem }] },
        contents: [{ role: 'user', parts: [{ text: vraag }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as any;
    tekst = j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '';
  } else if (aanbiederId === 'anthropic') {
    const res = await fetch(meta.eindpunt, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 700, system: systeem, messages: [{ role: 'user', content: vraag }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as any;
    tekst = Array.isArray(j?.content) ? j.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '';
  } else {
    const res = await fetch(meta.eindpunt, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        messages: [
          { role: 'system', content: systeem },
          { role: 'user', content: vraag },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as any;
    tekst = String(j?.choices?.[0]?.message?.content || '');
  }

  const jsonMatch = /\{[\s\S]*\}/.exec(tekst);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      bron: 'extern',
      aanbieder: meta.naamNl,
      samenvatting: String(parsed.samenvatting || '').slice(0, 1400),
      oorzaak: String(parsed.oorzaak || '').slice(0, 900),
      advies: String(parsed.advies || '').slice(0, 1400),
      aanbevolenActies: Array.isArray(parsed.aanbevolenActies) ? parsed.aanbevolenActies.map((x) => String(x).slice(0, 180)).slice(0, 6) : [],
      risico: ['kritiek', 'hoog', 'normaal', 'laag'].includes(String(parsed.risico)) ? (parsed.risico as MeldingPrioriteit) : 'normaal',
      opgesteldOp: Date.now(),
      geschoond: true,
    };
  } catch {
    return null;
  }
}

export async function analyseerMetAi(
  lade: Lade,
  body: Record<string, unknown>,
): Promise<MeldingAiSamenvatting> {
  const lang = body.lang === 'nl' ? 'nl' : 'uk';
  const profiel = await leesProfiel(lade);
  let geb: MeldingEcosysteemGebeurtenis | null = null;
  const id = String(body.id || '').trim();

  if (UUID_RE.test(id)) {
    const r = await alsGebruiker(lade.userId, (q) =>
      q(`SELECT ${KOLOMMEN} FROM app.melding_ecosysteem_gebeurtenissen WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`, [id, lade.userId, lade.ruimte]),
    );
    if (r.rows[0]) geb = normaliseerGebeurtenis(r.rows[0] as Record<string, unknown>);
  }
  if (!geb) {
    geb = interpreteerGebeurtenis(
      {
        ruimte: lade.ruimte,
        titel: typeof body.titel === 'string' ? body.titel : '',
        bericht: typeof body.bericht === 'string' ? body.bericht : '',
        uitleg: typeof body.uitleg === 'string' ? body.uitleg : '',
        bron: typeof body.bron === 'string' ? body.bron : 'systeem',
        kanaal: typeof body.kanaal === 'string' ? (body.kanaal as MeldingKanaal) : undefined,
        subdomein: typeof body.subdomein === 'string' ? (body.subdomein as MeldingSubdomein) : undefined,
        bijlagen: Array.isArray(body.bijlagen) ? body.bijlagen : [],
      },
      lade.ruimte,
    );
  }

  let uitslag = interneAiAnalyse(geb, lang);
  const modus =
    profiel.ai.modus === 'uit'
      ? 'uit'
      : profiel.ai.modus === 'intern'
        ? 'intern'
        : typeof body.modus === 'string'
          ? body.modus
          : profiel.ai.modus;
  const vermoedtBeveiliging =
    geb.kanaal === 'beveiliging' ||
    herkenKanaal(geb.bron, `${String(body.soort || '')} ${geb.titel}`, geb.subdomein) === 'beveiliging';
  const beveiligingsBlok = profiel.ai.alleenLokaalVoorBeveiliging && vermoedtBeveiliging;

  if (!beveiligingsBlok && (modus === 'extern' || modus === 'beide') && defaultChatDeps.getApiKeyForPurpose) {
    const aanbiederId = naarAanbiederId(typeof body.aanbieder === 'string' ? body.aanbieder : profiel.ai.aanbieder);
    try {
      const apiKey = await defaultChatDeps.getApiKeyForPurpose(lade.userId, aanbiederId);
      if (apiKey) {
        const { systeem, vraag } = bouwAiPromptVoorGebeurtenis(geb, lang);
        const ext = await externAiVerzoek(aanbiederId, apiKey, systeem, vraag);
        if (ext?.samenvatting) {
          uitslag = { ...uitslag, ...ext, bron: 'extern', geschoond: true };
        }
      }
    } catch {
      /* залишаємо миттєвий безпечний локальний розбір */
    }
  }

  if (UUID_RE.test(id)) {
    await alsGebruiker(lade.userId, async (q) => {
      await q(
        `UPDATE app.melding_ecosysteem_gebeurtenissen
            SET ai_samenvatting = $3::jsonb, bijgewerkt_op = now()
          WHERE id = $1::uuid AND user_id = $2 AND ruimte = $4`,
        [id, lade.userId, jsonbTekst(uitslag), lade.ruimte],
      );
      await q(
        `INSERT INTO app.melding_ecosysteem_actie_log (user_id, ruimte, gebeurtenis_id, actie, kanaal, details)
         VALUES ($1, $2, $3::uuid, 'ai-ontleden', $4, $5::jsonb)`,
        [lade.userId, lade.ruimte, id, geb!.kanaal, jsonbTekst({ bron: uitslag.bron, aanbieder: uitslag.aanbieder || '' })],
      );
    }).catch(() => undefined);
  }

  return uitslag;
}

/** Приймає повідомлення про подію від ПК-агента або розширення оглядача через захищений WebSocket-шлюз. */
export async function verwerkAgentMelding(invoer: {
  userId: string;
  agentId: string;
  platform: string | null;
  agentRuimte?: RuimteType;
  msg: Record<string, unknown>;
}): Promise<void> {
  const m = invoer.msg;
  const ruimte: RuimteType = invoer.agentRuimte
    ? invoer.agentRuimte
    : m.ruimte === 'technisch'
      ? 'technisch'
      : 'prive';
  if (ruimte === 'technisch') {
    const rechten = await technischeRechten(invoer.userId).catch(() => ({ ok: false as const }));
    if (!rechten.ok) return;
  }
  const isBrowser = invoer.platform === 'browser';
  const opgeslagen = await slaGebeurtenisOp(
    { userId: invoer.userId, ruimte },
    {
      externeSleutel: typeof m.sleutel === 'string' && m.sleutel ? m.sleutel : `ws:${invoer.agentId}:${String(m.id || Date.now())}`,
      bron: isBrowser ? 'extensie' : 'pc_agent',
      kanaal: isBrowser ? 'extensie' : 'pc_agent',
      subdomein: 'mcp',
      soort: typeof m.soort === 'string' ? m.soort : 'systeem',
      ernst: typeof m.ernst === 'string' ? m.ernst : 'info',
      titel: typeof m.titel === 'string' && m.titel ? m.titel : isBrowser ? 'Сигнал розширення оглядача / Signaal van browserextensie' : 'Сигнал ПК-агента / Signaal van pc-agent',
      bericht: typeof m.bericht === 'string' ? m.bericht : '',
      uitleg: typeof m.uitleg === 'string' ? m.uitleg : '',
      contextLabel: typeof m.context === 'string' ? m.context : `${invoer.platform || 'apparaat'} (${invoer.agentId.slice(0, 8)})`,
      link: typeof m.link === 'string' ? m.link : 'https://mcp.tarasevych.com/',
      bijlagen: Array.isArray(m.bijlagen) ? m.bijlagen : [],
      meta: { agentId: invoer.agentId, platform: invoer.platform || 'onbekend' },
    },
  );
  if (geregistreerdeBijlageVlag && opgeslagen.bijlagen.length > 0 && opgeslagen.herhalingen <= 1) {
    void stuurBijlageMeldingNaarTelegram({ userId: invoer.userId, ruimte }, opgeslagen, {
      vlagAan: geregistreerdeBijlageVlag,
      leesProfielFn: leesProfiel,
    }).catch(() => undefined);
  }
}

let geregistreerdeBijlageVlag: ((u: { id: string }) => Promise<boolean>) | undefined;

export function meldingEcosysteemRoutes(deps: {
  requireSession: RequireSession;
  ontvanger?: (user: { id: string; email?: string; role?: string }) => Promise<MeldingOntvanger>;
  rateLimit?: typeof rateLimit;
  bijlageWeergaveVlag?: (u: { id: string }) => Promise<boolean>;
}): Record<string, RouterMiddleware[]> {
  if (deps.bijlageWeergaveVlag) geregistreerdeBijlageVlag = deps.bijlageWeergaveVlag;
  const limietControle = deps.rateLimit ?? rateLimit;
  const metSessie = (
    fn: (lade: Lade, body: Record<string, unknown>, user: { id: string; role?: string; email?: string }) => Promise<unknown>,
    opties: { isProfielBeheer?: boolean } = {},
  ) =>
    (async (raw: unknown) => {
      const ctx = raw as { event: unknown; body: unknown };
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, 401);
      if (auth.user.status !== 'approved') return error('OWNER_SESSION_REQUIRED', 401);
      const body = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
      try {
        const lade = await meldingLade(auth.user.id, body, auth.tab, opties);
        return json(await fn(lade, body, auth.user));
      } catch (e) {
        if (e instanceof RuimteFout) return error(e.code, e.status);
        if (e instanceof LimietFout) return error('RATE_LIMITED', 429, { retryAfter: e.retryAfter });
        console.error('[meldingen-ecosysteem] помилка маршруту:', (e as Error).message);
        return error('MELDING_ECOSYSTEEM_MISLUKT', 500);
      }
    }) as unknown as RouterMiddleware;

  return {
    'POST /api/owner/meldingen/ecosysteem/profiel': [
      metSessie(async (lade) => ({ ok: true, ruimte: lade.ruimte, profiel: await leesProfiel(lade) }), { isProfielBeheer: true }),
    ],
    'POST /api/owner/meldingen/ecosysteem/profiel/opslaan': [
      metSessie(
        async (lade, body) => {
          const profiel = await schrijfProfiel(lade, body.profiel ?? body);
          return { ok: true, ruimte: lade.ruimte, profiel };
        },
        { isProfielBeheer: true },
      ),
    ],
    'POST /api/owner/meldingen/ecosysteem/stroom': [
      metSessie(async (lade, body, user) => ({
        ok: true,
        ruimte: lade.ruimte,
        ...(await lijstStroom(lade, {
          kanaal: typeof body.kanaal === 'string' ? body.kanaal : undefined,
          subdomein: typeof body.subdomein === 'string' ? body.subdomein : undefined,
          status: typeof body.status === 'string' ? body.status : undefined,
          zoek: typeof body.zoek === 'string' ? body.zoek : undefined,
          limiet: Number(body.limiet) || 60,
          ontvanger: deps.ontvanger ? await deps.ontvanger(user).catch(() => undefined) : undefined,
        })),
      })),
    ],
    'POST /api/owner/meldingen/ecosysteem/gebeurtenis': [
      metSessie(async (lade, body) => {
        const limiet = await limietControle(`melding-event:${lade.userId}`, 60, 60);
        if (!limiet.ok) throw new LimietFout(limiet.retryAfter);
        const gebeurtenis = await slaGebeurtenisOp(lade, body);
        if (
          deps.bijlageWeergaveVlag &&
          gebeurtenis.bijlagen.length > 0 &&
          gebeurtenis.herhalingen <= 1 &&
          gebeurtenis.status !== 'opgelost'
        ) {
          void stuurBijlageMeldingNaarTelegram(lade, gebeurtenis, {
            vlagAan: deps.bijlageWeergaveVlag,
            leesProfielFn: leesProfiel,
          }).catch(() => undefined);
        }
        return { ok: true, ruimte: lade.ruimte, gebeurtenis };
      }),
    ],
    'POST /api/owner/meldingen/ecosysteem/actie': [
      metSessie(async (lade, body) => ({ ruimte: lade.ruimte, ...(await voerActieUit(lade, body)) })),
    ],
    'POST /api/owner/meldingen/ecosysteem/ai-ontleden': [
      metSessie(async (lade, body) => {
        const limiet = await limietControle(`melding-ai:${lade.userId}`, 40, 3600);
        if (!limiet.ok) throw new LimietFout(limiet.retryAfter);
        const samenvatting = await analyseerMetAi(lade, body);
        return { ok: true, ruimte: lade.ruimte, samenvatting };
      }),
    ],
  };
}
