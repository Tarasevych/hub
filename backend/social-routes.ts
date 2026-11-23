// Прикладна служба «Соціальні мережі» (CONSOL-001 / M4, міграція 0320_social_overzicht_vlag.sql).
// Поєднує в межах одного простору (prive / technisch):
//   1. живе зведення наявних підключень користувача (Telegram, Discord, GitHub) без жодних маркерів доступу чи шифротекстів;
//   2. безпечні метадані імпортованих архівів і світлин зі служби «Фото» цього ж простору;
//   3. збережені канали/профілі та чернетки публікацій у таблиці app.sociale_netwerken під суворим двомірним FORCE RLS.
// Не імпортує backend/vlaggen чи shared/vlaggen напряму (правило vlaggen.test.ts) і не зберігає таємниць (geheimenIn).
import { randomUUID } from 'node:crypto';
import { db, error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { huidigeContext } from '../server/platform/context';
import type { RouterMiddleware, RouterRoutes } from '../server/platform/router';
import { FOTO_BRONNEN } from '../shared/foto-model';
import { geheimenIn } from '../shared/geheim-patronen';
import { hoortBij, ladeFilter, type Lade } from '../shared/ruimte-scheiding';
import { alsGebruiker } from './ai-toestemmingen';
import { isKoppelingKluisGesloten, koppelingenVanLade } from './github-koppeling-opslag';
import { can, denyMutation, rejectForeignOwnerUserId } from './rbac';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { koppelingenVanGebruiker } from './telegram-aanmelden/opslag';

export const SOCIAL_OVERZICHT_VLAG = 'social-overzicht-v1';

export const SOCIAL_NETWERKEN = [
  'telegram',
  'discord',
  'github',
  'mastodon',
  'bluesky',
  'linkedin',
  'youtube',
  'rss',
  'eigen',
] as const;
export type SocialNetwerkId = (typeof SOCIAL_NETWERKEN)[number];

export const SOCIAL_PROFIEL_STATUSSEN = ['actief', 'gepauzeerd'] as const;
export type SocialProfielStatus = (typeof SOCIAL_PROFIEL_STATUSSEN)[number];

export const SOCIAL_BERICHT_STATUSSEN = ['concept', 'gepland', 'gepubliceerd', 'gearchiveerd'] as const;
export type SocialBerichtStatus = (typeof SOCIAL_BERICHT_STATUSSEN)[number];

export const SOCIAL_ACTIE_CODES = Object.freeze({
  profielOpslaan: 'owner.social.profiel.opslaan',
  profielVerwijderen: 'owner.social.profiel.verwijderen',
  berichtOpslaan: 'owner.social.bericht.opslaan',
  berichtVerwijderen: 'owner.social.bericht.verwijderen',
});

export type SocialGebruiker = {
  id: string;
  status: string;
  email?: string;
  role?: string;
  accessLevel?: string;
};

export type SocialRequireSession = (
  event: Record<string, unknown>,
  body: unknown,
) => Promise<{ service: string; user: SocialGebruiker; tab?: string } | { errorCode: string }>;

export type SocialRouteDeps = {
  requireSession: SocialRequireSession;
  vlagAan?: (user: SocialGebruiker) => Promise<boolean>;
};

export type SocialProfiel = {
  id: string;
  netwerk: SocialNetwerkId;
  handvat: string;
  url: string;
  titel: string;
  inhoud: string;
  status: SocialProfielStatus;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type SocialBericht = {
  id: string;
  netwerk: SocialNetwerkId;
  handvat: string;
  url: string;
  titel: string;
  inhoud: string;
  status: SocialBerichtStatus;
  geplandOp: string | null;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

const TOEGESTANE_DIENSTEN = new Set(['identity', 'hub', 'id', 'social']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROFIELEN = 100;
const MAX_BERICHTEN = 200;

/** Ізольована шухляда даних запиту: лише з перевіреної сесії та живого стану простору в БД, ніколи з тіла запиту. */
export async function gegevensRuimte(
  userId: string,
  body: unknown,
  _opties?: { rol?: string },
): Promise<Lade> {
  const tab = body && typeof body === 'object' ? String((body as Record<string, unknown>).tabContext || '') : '';
  try {
    return { userId, ruimte: await gegevensRuimteVeilig(userId, { tabContext: tab }) };
  } catch {
    return { userId, ruimte: 'prive' };
  }
}

const schoonTekst = (waarde: unknown, max: number, zonderHoeken = false): string => {
  let tekst = typeof waarde === 'string' ? waarde : '';
  tekst = tekst.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (zonderHoeken) tekst = tekst.replace(/[<>]/g, '');
  return tekst.slice(0, max);
};

/** Сувора перевірка зовнішнього https://-посилання без облікових даних і без локальних/внутрішніх мережевих адрес. */
export function isVeiligeSocialUrl(ruw: string): boolean {
  if (!ruw) return true;
  if (ruw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(ruw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1);
    if (v6 === '::1' || v6 === '::' || /^(fc|fd|fe80)/i.test(v6) || /^::ffff:/i.test(v6)) return false;
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const delen = host.split('.').map(Number);
    if (delen.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = delen;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return false;
    }
  }
  return host.includes('.');
}

const isNetwerk = (v: unknown): v is SocialNetwerkId =>
  typeof v === 'string' && (SOCIAL_NETWERKEN as readonly string[]).includes(v);

const isProfielStatus = (v: unknown): v is SocialProfielStatus =>
  typeof v === 'string' && (SOCIAL_PROFIEL_STATUSSEN as readonly string[]).includes(v);

const isBerichtStatus = (v: unknown): v is SocialBerichtStatus =>
  typeof v === 'string' && (SOCIAL_BERICHT_STATUSSEN as readonly string[]).includes(v);

const isoDatumOfNull = (v: unknown): string | null | 'ongeldig' => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return 'ongeldig';
  const ms = Date.parse(v);
  if (Number.isNaN(ms) || ms < 0) return 'ongeldig';
  return new Date(ms).toISOString();
};

const maskeerGebruikersnaam = (ruw: string): string => {
  const s = String(ruw || '').trim().replace(/^@+/, '');
  if (!s) return '';
  if (s.length <= 3) return `@${s[0]}…`;
  return `@${s.slice(0, 2)}…${s.slice(-1)}`;
};

type FotoMediaRij = {
  ownerUserId?: string;
  ruimte?: string;
  naam?: string;
  titel?: string;
  mime?: string;
  herkomst?: Array<{ bron?: string; archief?: string }>;
  genomenOp?: string | null;
  createdAt?: number;
  verborgen?: boolean;
};

type FotoImportRij = {
  ownerUserId?: string;
  ruimte?: string;
  bron?: string;
  archief?: string;
  soort?: string;
  nieuw?: number;
  bekend?: number;
  klaar?: boolean;
  createdAt?: number;
};

type DiscordKoppelRij = {
  ownerUserId?: string;
  aanbieder?: string;
  label?: string;
  op?: string;
};

async function verzamelKoppelingen(lade: Lade) {
  const githubGesloten = await isKoppelingKluisGesloten(lade.userId, lade.ruimte);
  const githubWegen = githubGesloten ? [] : await koppelingenVanLade(lade.userId, lade.ruimte).catch(() => []);
  const github = {
    gekoppeld: githubWegen.length > 0,
    kluisGesloten: githubGesloten,
    accounts: githubWegen.map((r) => ({
      pad: r.pad,
      login: String(r.login || '').slice(0, 80),
      repoAantal: Array.isArray(r.repos) ? r.repos.length : 0,
      bijgewerktOp: Number(r.bijgewerktOp || 0),
    })),
  };

  // Прив'язки входу Telegram та Discord належать особистому обліковому запису й не перетікають у технічний простір.
  if (lade.ruimte !== 'prive') {
    return {
      telegram: { gekoppeld: false, aantal: 0, kanalen: [] as Array<{ id: string; naam: string; gebruikersnaam: string; stand: string; laatstGebruiktOp: string | null }> },
      discord: { gekoppeld: false, aantal: 0, accounts: [] as Array<{ id: string; label: string; gekoppeldOp: string }> },
      github,
    };
  }

  const [tgRijen, discordUit] = await Promise.all([
    koppelingenVanGebruiker(lade.userId).catch(() => []),
    db.list<DiscordKoppelRij>('aanmeld_koppelingen_v1', { filter: { ownerUserId: lade.userId, aanbieder: 'discord' }, limit: 20 }).catch(() => ({ items: [] })),
  ]);

  const tgKanalen = tgRijen.slice(0, 10).map((r) => ({
    id: String(r.id),
    naam: schoonTekst(r.naam || r.voornaam || 'Telegram', 80, true),
    gebruikersnaam: maskeerGebruikersnaam(r.gebruikersnaam),
    stand: String(r.stand || 'actief'),
    laatstGebruiktOp: r.laatst_gebruikt_op ? new Date(r.laatst_gebruikt_op).toISOString() : null,
  }));

  const discordAccounts = (discordUit.items as Array<DiscordKoppelRij & { id: string }>)
    .filter((r) => String(r.ownerUserId || '') === lade.userId && String(r.aanbieder || '') === 'discord')
    .slice(0, 10)
    .map((r) => ({
      id: String(r.id),
      label: schoonTekst(r.label || 'Discord', 80, true),
      gekoppeldOp: typeof r.op === 'string' ? r.op : '',
    }));

  return {
    telegram: { gekoppeld: tgKanalen.length > 0, aantal: tgRijen.length, kanalen: tgKanalen },
    discord: { gekoppeld: discordAccounts.length > 0, aantal: discordAccounts.length, accounts: discordAccounts },
    github,
  };
}

async function verzamelFotoArchieven(lade: Lade) {
  const [mediaUit, importUit] = await Promise.all([
    db.list<FotoMediaRij>('foto_media_v1', { filter: ladeFilter(lade), limit: 300 }).catch(() => ({ items: [] })),
    db.list<FotoImportRij>('foto_import_v1', { filter: ladeFilter(lade), limit: 60 }).catch(() => ({ items: [] })),
  ]);

  const media = (mediaUit.items as Array<FotoMediaRij & { id: string }>).filter((m) => hoortBij(m as never, lade) && !m.verborgen);
  const imports = (importUit.items as Array<FotoImportRij & { id: string }>).filter((i) => hoortBij(i as never, lade));

  const perBronTelling: Record<string, number> = {};
  for (const m of media) {
    const bronnen = Array.isArray(m.herkomst) && m.herkomst.length > 0 ? m.herkomst.map((h) => String(h?.bron || 'eigen')) : ['eigen'];
    for (const bron of new Set(bronnen)) perBronTelling[bron] = (perBronTelling[bron] || 0) + 1;
  }

  const perBron = FOTO_BRONNEN.map((b) => ({
    id: b.id,
    naam: b.naam,
    soort: b.soort,
    aantal: perBronTelling[b.id] || 0,
  })).filter((b) => b.aantal > 0);

  const recenteImports = [...imports]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 8)
    .map((i) => ({
      id: String(i.id),
      bron: schoonTekst(i.bron || 'map', 40, true),
      archief: schoonTekst(i.archief || '', 160, true),
      soort: schoonTekst(i.soort || 'archief', 32, true),
      nieuw: Number(i.nieuw || 0),
      bekend: Number(i.bekend || 0),
      klaar: i.klaar === true,
      aangemaaktOp: Number(i.createdAt || 0) ? new Date(Number(i.createdAt)).toISOString() : '',
    }));

  const recenteMedia = [...media]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 8)
    .map((m) => ({
      id: String(m.id),
      titel: schoonTekst(m.titel || m.naam || 'foto', 120, true),
      bron: schoonTekst(m.herkomst?.[0]?.bron || 'eigen', 40, true),
      genomenOp: typeof m.genomenOp === 'string' ? m.genomenOp : null,
      toegevoegdOp: Number(m.createdAt || 0) ? new Date(Number(m.createdAt)).toISOString() : '',
    }));

  return {
    totaalMedia: media.length,
    totaalImports: imports.length,
    perBron,
    recenteImports,
    recenteMedia,
  };
}

function mapProfielRij(r: Record<string, unknown>): SocialProfiel {
  return {
    id: String(r.id),
    netwerk: (isNetwerk(r.netwerk) ? r.netwerk : 'eigen'),
    handvat: String(r.handvat || ''),
    url: String(r.url || ''),
    titel: String(r.titel || ''),
    inhoud: String(r.inhoud || ''),
    status: (isProfielStatus(r.status) ? r.status : 'actief'),
    aangemaaktOp: r.aangemaakt_op ? new Date(String(r.aangemaakt_op)).toISOString() : new Date(0).toISOString(),
    bijgewerktOp: r.bijgewerkt_op ? new Date(String(r.bijgewerkt_op)).toISOString() : new Date(0).toISOString(),
  };
}

function mapBerichtRij(r: Record<string, unknown>): SocialBericht {
  return {
    id: String(r.id),
    netwerk: (isNetwerk(r.netwerk) ? r.netwerk : 'eigen'),
    handvat: String(r.handvat || ''),
    url: String(r.url || ''),
    titel: String(r.titel || ''),
    inhoud: String(r.inhoud || ''),
    status: (isBerichtStatus(r.status) ? r.status : 'concept'),
    geplandOp: r.gepland_op ? new Date(String(r.gepland_op)).toISOString() : null,
    aangemaaktOp: r.aangemaakt_op ? new Date(String(r.aangemaakt_op)).toISOString() : new Date(0).toISOString(),
    bijgewerktOp: r.bijgewerkt_op ? new Date(String(r.bijgewerkt_op)).toISOString() : new Date(0).toISOString(),
  };
}

async function leesSocialOpslag(lade: Lade): Promise<{ profielen: SocialProfiel[]; berichten: SocialBericht[] }> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    const rijen = (await q(
      `SELECT id, soort, netwerk, handvat, url, titel, inhoud, status, gepland_op, aangemaakt_op, bijgewerkt_op
         FROM app.sociale_netwerken
        WHERE user_id = $1 AND ruimte = $2
        ORDER BY bijgewerkt_op DESC
        LIMIT $3`,
      [lade.userId, lade.ruimte, MAX_PROFIELEN + MAX_BERICHTEN],
    )).rows;
    const profielen: SocialProfiel[] = [];
    const berichten: SocialBericht[] = [];
    for (const r of rijen) {
      if (r.soort === 'profiel') profielen.push(mapProfielRij(r));
      else if (r.soort === 'bericht') berichten.push(mapBerichtRij(r));
    }
    return { profielen, berichten };
  });
}

function normaliseerDeps(
  eerste: SocialRouteDeps | SocialRequireSession,
  tweede?: { vlagAan?: (user: SocialGebruiker) => Promise<boolean> },
): SocialRouteDeps {
  if (typeof eerste === 'function') {
    return { requireSession: eerste, vlagAan: tweede?.vlagAan };
  }
  return eerste;
}

export function createSocialRoutes(
  eerste: SocialRouteDeps | SocialRequireSession,
  tweede?: { vlagAan?: (user: SocialGebruiker) => Promise<boolean> },
): RouterRoutes {
  const deps = normaliseerDeps(eerste, tweede);

  const metToegang = (
    schrijven: boolean,
    fn: (lade: Lade, user: SocialGebruiker, body: Record<string, unknown>, service: string) => Promise<ReturnType<typeof json>>,
  ): RouterMiddleware => async (ctx) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    const { user } = auth;
    if (!user.id || user.status !== 'approved' || !TOEGESTANE_DIENSTEN.has(auth.service)) {
      return error('SOCIAL_TOEGANG_GEWEIGERD', 403);
    }
    if (!can(user, 'workspace.read')) return error('SOCIAL_TOEGANG_GEWEIGERD', 403);
    const vreemd = rejectForeignOwnerUserId(user, ctx.body);
    if (vreemd) return vreemd;
    if (deps.vlagAan) {
      let aan = false;
      try {
        aan = (await deps.vlagAan(user)) === true;
      } catch {
        aan = false;
      }
      if (!aan) return error('SOCIAL_DIENST_UIT', 404);
    }
    if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) {
      return error('SOCIAL_INVOER_ONGELDIG', 400);
    }
    if (schrijven) {
      const verboden = denyMutation(user, 'workspace.write');
      if (verboden || huidigeContext()?.alleenLezen === true) {
        return verboden || error('SOCIAL_ALLEEN_LEZEN', 403);
      }
    }
    const lade = await gegevensRuimte(user.id, ctx.body, { rol: user.role });
    try {
      return await fn(lade, user, ctx.body as Record<string, unknown>, auth.service);
    } catch (err) {
      console.error('[social]', String((err as Error)?.message || err).slice(0, 200));
      return error('SOCIAL_MISLUKT', 500);
    }
  };

  return {
    'POST /api/owner/social/overzicht': [
      metToegang(false, async (lade, user) => {
        const [koppelingen, fotoArchieven, opslag] = await Promise.all([
          verzamelKoppelingen(lade),
          verzamelFotoArchieven(lade),
          leesSocialOpslag(lade),
        ]);
        const magSchrijven = can(user, 'workspace.write') && huidigeContext()?.alleenLezen !== true;
        return json({
          ruimte: lade.ruimte,
          magSchrijven,
          koppelingen,
          fotoArchieven,
          profielen: opslag.profielen,
          berichten: opslag.berichten,
          samenvatting: {
            actieveProfielen: opslag.profielen.filter((p) => p.status === 'actief').length,
            concepten: opslag.berichten.filter((b) => b.status === 'concept').length,
            gepland: opslag.berichten.filter((b) => b.status === 'gepland').length,
            gepubliceerd: opslag.berichten.filter((b) => b.status === 'gepubliceerd').length,
          },
        });
      }),
    ],

    'POST /api/owner/social/profiel/opslaan': [
      metToegang(true, async (lade, user, body, service) => {
        const idRuw = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
        if (idRuw && !UUID_RE.test(idRuw)) return error('SOCIAL_ID_ONGELDIG', 400);
        const netwerk: SocialNetwerkId = isNetwerk(body.netwerk) ? body.netwerk : 'eigen';
        const status: SocialProfielStatus = isProfielStatus(body.status) ? body.status : 'actief';
        const handvat = schoonTekst(body.handvat, 160, true);
        const url = schoonTekst(body.url, 500, true);
        const titel = schoonTekst(body.titel, 200, true);
        const inhoud = schoonTekst(body.inhoud, 4000, false);

        if (geheimenIn(`${handvat}\n${url}\n${titel}\n${inhoud}`).length > 0) {
          return error('SOCIAL_GEHEIM_GEWEIGERD', 400);
        }
        if (!isVeiligeSocialUrl(url)) return error('SOCIAL_URL_ONGELDIG', 400);
        if (!titel && !handvat) return error('SOCIAL_VELDEN_VERPLICHT', 400);

        const opgeslagen = await alsGebruiker(lade.userId, async (q) => {
          await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
          if (!idRuw) {
            const aantal = Number(
              (await q(`SELECT count(*)::int AS n FROM app.sociale_netwerken WHERE user_id = $1 AND ruimte = $2 AND soort = 'profiel'`, [lade.userId, lade.ruimte])).rows[0]?.n || 0,
            );
            if (aantal >= MAX_PROFIELEN) return 'limiet' as const;
          }
          const doelId = idRuw || randomUUID();
          const r = (
            await q(
              `INSERT INTO app.sociale_netwerken (user_id, ruimte, id, soort, netwerk, handvat, url, titel, inhoud, status, gepland_op, aangemaakt_op, bijgewerkt_op)
               VALUES ($1, $2, $3::uuid, 'profiel', $4, $5, $6, $7, $8, $9, NULL, now(), now())
               ON CONFLICT (user_id, ruimte, id) DO UPDATE SET
                 netwerk = EXCLUDED.netwerk,
                 handvat = EXCLUDED.handvat,
                 url = EXCLUDED.url,
                 titel = EXCLUDED.titel,
                 inhoud = EXCLUDED.inhoud,
                 status = EXCLUDED.status,
                 bijgewerkt_op = now()
               WHERE app.sociale_netwerken.user_id = $1
                 AND app.sociale_netwerken.ruimte = $2
                 AND app.sociale_netwerken.soort = 'profiel'
               RETURNING id, soort, netwerk, handvat, url, titel, inhoud, status, gepland_op, aangemaakt_op, bijgewerkt_op`,
              [lade.userId, lade.ruimte, doelId, netwerk, handvat, url, titel, inhoud, status],
            )
          ).rows[0];
          return r ? mapProfielRij(r) : null;
        });

        if (opgeslagen === 'limiet') return error('SOCIAL_TE_VEEL_ITEMS', 413);
        if (!opgeslagen) return error('SOCIAL_NIET_GEVONDEN', 404);

        await auditToevoegen({
          ownerId: lade.userId,
          actorId: user.id,
          action: SOCIAL_ACTIE_CODES.profielOpslaan,
          type: 'integraties',
          result: 'success',
          service,
          details: {
            ruimte: lade.ruimte,
            netwerk: opgeslagen.netwerk,
            status: opgeslagen.status,
            doel: { soort: 'social-profiel', id: opgeslagen.id },
          },
        });
        return json({ ok: true, ruimte: lade.ruimte, profiel: opgeslagen });
      }),
    ],

    'POST /api/owner/social/profiel/verwijderen': [
      metToegang(true, async (lade, user, body, service) => {
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!UUID_RE.test(id)) return error('SOCIAL_ID_ONGELDIG', 400);
        const verwijderd = await alsGebruiker(lade.userId, async (q) => {
          await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
          const r = await q(
            `DELETE FROM app.sociale_netwerken
              WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid AND soort = 'profiel'
              RETURNING netwerk`,
            [lade.userId, lade.ruimte, id],
          );
          return r.rows[0] ? String(r.rows[0].netwerk) : null;
        });
        if (!verwijderd) return error('SOCIAL_NIET_GEVONDEN', 404);

        await auditToevoegen({
          ownerId: lade.userId,
          actorId: user.id,
          action: SOCIAL_ACTIE_CODES.profielVerwijderen,
          type: 'integraties',
          result: 'success',
          service,
          details: {
            ruimte: lade.ruimte,
            netwerk: verwijderd,
            doel: { soort: 'social-profiel', id },
          },
        });
        return json({ ok: true, ruimte: lade.ruimte, id });
      }),
    ],

    'POST /api/owner/social/bericht/opslaan': [
      metToegang(true, async (lade, user, body, service) => {
        const idRuw = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
        if (idRuw && !UUID_RE.test(idRuw)) return error('SOCIAL_ID_ONGELDIG', 400);
        const netwerk: SocialNetwerkId = isNetwerk(body.netwerk) ? body.netwerk : 'eigen';
        const status: SocialBerichtStatus = isBerichtStatus(body.status) ? body.status : 'concept';
        const handvat = schoonTekst(body.handvat, 160, true);
        const url = schoonTekst(body.url, 500, true);
        const titel = schoonTekst(body.titel, 200, true);
        const inhoud = schoonTekst(body.inhoud, 4000, false);
        const geplandOp = isoDatumOfNull(body.geplandOp);

        if (geplandOp === 'ongeldig') return error('SOCIAL_DATUM_ONGELDIG', 400);
        if (geheimenIn(`${handvat}\n${url}\n${titel}\n${inhoud}`).length > 0) {
          return error('SOCIAL_GEHEIM_GEWEIGERD', 400);
        }
        if (!isVeiligeSocialUrl(url)) return error('SOCIAL_URL_ONGELDIG', 400);
        if (!titel && !inhoud) return error('SOCIAL_VELDEN_VERPLICHT', 400);

        const opgeslagen = await alsGebruiker(lade.userId, async (q) => {
          await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
          if (!idRuw) {
            const aantal = Number(
              (await q(`SELECT count(*)::int AS n FROM app.sociale_netwerken WHERE user_id = $1 AND ruimte = $2 AND soort = 'bericht'`, [lade.userId, lade.ruimte])).rows[0]?.n || 0,
            );
            if (aantal >= MAX_BERICHTEN) return 'limiet' as const;
          }
          const doelId = idRuw || randomUUID();
          const r = (
            await q(
              `INSERT INTO app.sociale_netwerken (user_id, ruimte, id, soort, netwerk, handvat, url, titel, inhoud, status, gepland_op, aangemaakt_op, bijgewerkt_op)
               VALUES ($1, $2, $3::uuid, 'bericht', $4, $5, $6, $7, $8, $9, $10::timestamptz, now(), now())
               ON CONFLICT (user_id, ruimte, id) DO UPDATE SET
                 netwerk = EXCLUDED.netwerk,
                 handvat = EXCLUDED.handvat,
                 url = EXCLUDED.url,
                 titel = EXCLUDED.titel,
                 inhoud = EXCLUDED.inhoud,
                 status = EXCLUDED.status,
                 gepland_op = EXCLUDED.gepland_op,
                 bijgewerkt_op = now()
               WHERE app.sociale_netwerken.user_id = $1
                 AND app.sociale_netwerken.ruimte = $2
                 AND app.sociale_netwerken.soort = 'bericht'
               RETURNING id, soort, netwerk, handvat, url, titel, inhoud, status, gepland_op, aangemaakt_op, bijgewerkt_op`,
              [lade.userId, lade.ruimte, doelId, netwerk, handvat, url, titel, inhoud, status, geplandOp],
            )
          ).rows[0];
          return r ? mapBerichtRij(r) : null;
        });

        if (opgeslagen === 'limiet') return error('SOCIAL_TE_VEEL_ITEMS', 413);
        if (!opgeslagen) return error('SOCIAL_NIET_GEVONDEN', 404);

        await auditToevoegen({
          ownerId: lade.userId,
          actorId: user.id,
          action: SOCIAL_ACTIE_CODES.berichtOpslaan,
          type: 'integraties',
          result: 'success',
          service,
          details: {
            ruimte: lade.ruimte,
            netwerk: opgeslagen.netwerk,
            status: opgeslagen.status,
            doel: { soort: 'social-bericht', id: opgeslagen.id },
          },
        });
        return json({ ok: true, ruimte: lade.ruimte, bericht: opgeslagen });
      }),
    ],

    'POST /api/owner/social/bericht/verwijderen': [
      metToegang(true, async (lade, user, body, service) => {
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!UUID_RE.test(id)) return error('SOCIAL_ID_ONGELDIG', 400);
        const verwijderd = await alsGebruiker(lade.userId, async (q) => {
          await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
          const r = await q(
            `DELETE FROM app.sociale_netwerken
              WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid AND soort = 'bericht'
              RETURNING netwerk`,
            [lade.userId, lade.ruimte, id],
          );
          return r.rows[0] ? String(r.rows[0].netwerk) : null;
        });
        if (!verwijderd) return error('SOCIAL_NIET_GEVONDEN', 404);

        await auditToevoegen({
          ownerId: lade.userId,
          actorId: user.id,
          action: SOCIAL_ACTIE_CODES.berichtVerwijderen,
          type: 'integraties',
          result: 'success',
          service,
          details: {
            ruimte: lade.ruimte,
            netwerk: verwijderd,
            doel: { soort: 'social-bericht', id },
          },
        });
        return json({ ok: true, ruimte: lade.ruimte, id });
      }),
    ],
  };
}
