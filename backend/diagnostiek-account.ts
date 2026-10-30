// Diagnose per ACCOUNT («Цей акаунт») naast de serverdiagnose («Сервер (для всіх)»), zie shared/diagnostiek-account.ts.
//
// Wat een controle leest (alleen metadata): de Google-koppeling (status per dienst, of de toestemming gebonden is, en bij een
// handmatige controle of Google een toegangstoken uitgeeft — het token zelf wordt nooit bewaard, gelogd of teruggegeven), het
// aantal postvakken per status, het aantal vastgelopen/mislukte wachtrijmails, of er een GitHub-sleutel gekoppeld is (niet welke),
// het aantal actieve AI-koppelingen, het aantal apparaten (verbonden/stil) en of het account actief is.
// Wat NOOIT: mailinhoud, onderwerpen, adressen, bestandsnamen, tokens, sleutelnamen, IP-adressen.
//
// Opslag: app.diagnostiek_account_uitslagen (migratie 0070): dienst, stand, korte code, wie startte. 30 dagen.
// Rechten: een gewone gebruiker ziet en start ALLEEN het eigen account (route /api/owner/diagnostiek/mijn-diensten, zonder
// serverkolom); de beheerder (eigenaar of 'diagnose.lezen' in een actief technisch profiel) kiest een account via
// /api/owner/admin/diagnostiek/account (zie backend/beheer-diagnostiek.ts) en ziet beide kolommen. Elke inzage/uitvoering komt in het
// beheerlogboek (diag.account.*), met alleen codes.
import { randomBytes } from 'node:crypto';
import { db } from '../server/platform/db';
import { getPool } from '../server/platform/pg';
import {
  ACCOUNT_DIENSTEN, beoordeelAccount, schoonAccountUitslag, SERVER_CONTROLES,
  type AccountDienst, type AccountFeiten, type AccountUitslag, type GoogleDienstFeit,
} from '../shared/diagnostiek-account';
import type { Stand } from '../shared/beheer-diagnostiek';

const sys = () => getPool('systeem');
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const isAccountId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

type Gebruiker = { id: string; email?: string; name?: string; status?: string; role?: string };
/** Bronnen zijn injecteerbaar (tests bootsen Google, GitHub en de database na). Elke bron geeft alleen tellingen/ja-nee. */
export type AccountBronnen = {
  gebruiker: (id: string) => Promise<Gebruiker | null>;
  google: (id: string, email: string) => Promise<Record<'mail' | 'drive' | 'calendar', { status: GoogleDienstFeit['status']; gebonden: boolean }> | null>;
  /** Geeft Google voor deze dienst een toegangstoken uit? `true` of een foutcode. Het token blijft in de bron. */
  googleToken: (id: string, email: string, dienst: 'mail' | 'drive' | 'calendar') => Promise<true | string>;
  mailAccounts: (id: string) => Promise<AccountFeiten['mailAccounts']>;
  mailWachtrij: (id: string) => Promise<AccountFeiten['mailWachtrij']>;
  github: (id: string) => Promise<boolean>;
  ai: (id: string) => Promise<AccountFeiten['ai']>;
  apparaten: (id: string) => Promise<AccountFeiten['apparaten']>;
};

// Alleen een bericht dat zelf al een foutcode is (GOOGLE_SUITE_…) gaat door; elke andere tekst (kan van Google komen en een token of
// adres bevatten) wordt een vaste code. Nooit de tekst omvormen tot een «code»: dat zou de inhoud alsnog bewaren.
export const codeUit = (e: unknown) => { const c = String((e as Error)?.message ?? e ?? ''); return /^[A-Z][A-Z0-9_]{2,39}$/.test(c) ? c : 'GOOGLE_TOKEN_FOUT'; };
const metLimiet = <T,>(p: Promise<T>, ms: number, terug: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(terug), ms).unref?.())]);

export const standaardBronnen: AccountBronnen = {
  gebruiker: async (id) => ((await db.get<Gebruiker>('users', [id]))[0] as Gebruiker | null) ?? null,
  google: async (id, email) => {
    const { googleSuiteOnboardingSnapshot } = await import('./google-suite-inrichting');
    const s = await googleSuiteOnboardingSnapshot(id, email);
    const van = (d: string) => { const x = (s.services as Array<{ id: string; status: string; grantBound?: boolean }>).find((v) => v.id === d); return { status: (x?.status ?? 'onbekend') as GoogleDienstFeit['status'], gebonden: !!x?.grantBound }; };
    return { mail: van('mail'), drive: van('drive'), calendar: van('calendar') };
  },
  googleToken: async (id, email, dienst) => {
    const { googleSuiteAccessToken } = await import('./google-suite-inrichting');
    try { const t = await googleSuiteAccessToken(id, email, dienst as never); return t ? true : 'GOOGLE_GEEN_TOKEN'; }
    catch (e) { return codeUit(e); }
  },
  mailAccounts: async (id) => {
    const rijen = (await db.list<{ status?: string; ownerUserId?: string }>('mail_accounts_v1', { filter: { ownerUserId: id }, limit: 50 })).items as Array<{ status?: string; ownerUserId?: string }>;
    const eigen = rijen.filter((r) => r && r.ownerUserId === id && r.status !== 'disconnected' && r.status !== 'revoked');
    return {
      totaal: eigen.length,
      verbonden: eigen.filter((r) => r.status === 'connected' || r.status === 'initial_sync').length,
      herstelNodig: eigen.filter((r) => r.status === 'reauth_required' || r.status === 'authorization_required').length,
      gestoord: eigen.filter((r) => r.status === 'degraded').length,
    };
  },
  mailWachtrij: async (id) => {
    const r = (await sys().query(
      `SELECT count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS mislukt,
              count(*) FILTER (WHERE (status = 'sending' AND updated_at < now() - interval '15 minutes') OR (status = 'scheduled' AND send_at < now() - interval '15 minutes'))::int AS vast
         FROM app.mail_queue WHERE user_id = $1`, [id])).rows[0];
    return { vast: Number(r?.vast || 0), mislukt24: Number(r?.mislukt || 0) };
  },
  github: async (id) => { const { githubKoppeling } = await import('./github-platform'); return !!(await githubKoppeling(id)); },
  ai: async (id) => {
    const r = (await sys().query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE refresh_expires_at < now() + interval '3 days')::int AS bijna
         FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now()`, [id])).rows[0];
    return { actief: Number(r?.n || 0), bijnaVerlopen: Number(r?.bijna || 0) };
  },
  apparaten: async (id) => {
    const r = (await sys().query(
      `SELECT count(*)::int AS t, count(*) FILTER (WHERE status = 'connected')::int AS v,
              count(*) FILTER (WHERE status = 'connected' AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes'))::int AS stil
         FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL`, [id])).rows[0];
    return { totaal: Number(r?.t || 0), verbonden: Number(r?.v || 0), stil: Number(r?.stil || 0) };
  },
};

async function veilig<T>(f: () => Promise<T>, terug: T): Promise<{ v: T; fout: boolean }> {
  try { return { v: await metLimiet(f(), 8000, terug), fout: false }; } catch (e) { console.error('[diagnostiek-account]', codeUit(e)); return { v: terug, fout: true }; }
}

/** Feiten verzamelen. `diep`: ook vragen of Google een token uitgeeft (alleen bij een handmatige controle, niet bij elke paginaweergave). */
export async function accountFeiten(id: string, bronnen: AccountBronnen = standaardBronnen, diep = true): Promise<AccountFeiten | null> {
  const g = await veilig(() => bronnen.gebruiker(id), null);
  if (!g.v) return null;
  const email = String(g.v.email || '');
  const [google, mailAccounts, mailWachtrij, github, ai, apparaten] = await Promise.all([
    veilig(() => bronnen.google(id, email), null),
    veilig(() => bronnen.mailAccounts(id), { totaal: 0, verbonden: 0, herstelNodig: 0, gestoord: 0 }),
    veilig(() => bronnen.mailWachtrij(id), { vast: 0, mislukt24: 0 }),
    veilig(() => bronnen.github(id), false),
    veilig(() => bronnen.ai(id), { actief: 0, bijnaVerlopen: 0 }),
    veilig(() => bronnen.apparaten(id), { totaal: 0, verbonden: 0, stil: 0 }),
  ]);
  let googleFeiten: AccountFeiten['google'] = null;
  if (google.v) {
    const diensten = ['mail', 'drive', 'calendar'] as const;
    const tokens = await Promise.all(diensten.map(async (d) => {
      const x = google.v![d];
      if (!diep || x.status !== 'granted' || !x.gebonden) return { token: 'niet-getest' as const };
      let v: true | string;
      try { v = await metLimiet(bronnen.googleToken(id, email, d), 8000, 'TIJD_OM' as true | string); } catch (e) { v = codeUit(e); }
      return v === true ? { token: 'ok' as const } : { token: 'fout' as const, tokenCode: String(v) };
    }));
    googleFeiten = { mail: { ...google.v.mail, ...tokens[0] }, drive: { ...google.v.drive, ...tokens[1] }, calendar: { ...google.v.calendar, ...tokens[2] } };
  }
  return {
    accountStatus: String(g.v.status || ''),
    google: googleFeiten,
    mailAccounts: mailAccounts.v, mailWachtrij: mailWachtrij.v,
    github: { gekoppeld: github.v, fout: github.fout },
    ai: ai.v, apparaten: apparaten.v,
    instellingen: { leesbaar: true },
  };
}

/** Eén accountcontrole: uitvoeren, bewaren, uitslagen teruggeven. `door` = wie startte (gebruiker zelf, beheerder of 'systeem'). */
export async function accountRonde(id: string, door: string, bronnen: AccountBronnen = standaardBronnen, nu = Date.now()): Promise<{ batch: string; uitslagen: AccountUitslag[] } | null> {
  if (!isAccountId(id)) return null;
  const f = await accountFeiten(id, bronnen, true);
  if (!f) return null;
  const st = beoordeelAccount(f);
  const batch = randomBytes(6).toString('hex');
  const uitslagen: AccountUitslag[] = ACCOUNT_DIENSTEN.map((d) => ({ dienst: d, stand: st[d].stand, code: st[d].code, op: nu }));
  for (const u of uitslagen) {
    await sys().query(`INSERT INTO app.diagnostiek_account_uitslagen (user_id, dienst, stand, code, op, door, batch) VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), $6, $7)`,
      [id, u.dienst, u.stand, u.code, u.op, door.slice(0, 80), batch]);
  }
  await sys().query(`DELETE FROM app.diagnostiek_account_uitslagen WHERE op < now() - interval '30 days'`).catch(() => undefined);
  return { batch, uitslagen };
}

export type AccountHistorie = { nr: number; dienst: AccountDienst; stand: Stand; code: string; op: number; door: 'zelf' | 'beheer' | 'systeem' };
/** Laatste uitslag per dienst + geschiedenis (alleen dit account). `door` wordt teruggebracht tot zelf/beheer/systeem (geen id's). */
export async function accountOverzicht(id: string): Promise<{ laatste: AccountUitslag[]; historie: AccountHistorie[] }> {
  if (!isAccountId(id)) return { laatste: [], historie: [] };
  const laatste = (await sys().query(`SELECT DISTINCT ON (dienst) dienst, stand, code, op FROM app.diagnostiek_account_uitslagen WHERE user_id = $1 ORDER BY dienst, op DESC, nr DESC`, [id])).rows
    .map((r) => schoonAccountUitslag({ dienst: r.dienst, stand: r.stand, code: r.code, op: new Date(r.op).getTime() })).filter(Boolean) as AccountUitslag[];
  const historie = (await sys().query(`SELECT nr, dienst, stand, code, op, door FROM app.diagnostiek_account_uitslagen WHERE user_id = $1 ORDER BY nr DESC LIMIT 70`, [id])).rows
    .map((r) => { const u = schoonAccountUitslag({ dienst: r.dienst, stand: r.stand, code: r.code, op: new Date(r.op).getTime() }); return u ? { ...u, nr: Number(r.nr), door: r.door === id ? 'zelf' as const : r.door === 'systeem' ? 'systeem' as const : 'beheer' as const } : null; })
    .filter(Boolean) as AccountHistorie[];
  return { laatste, historie };
}

/** Laatste serveruitslag van elke controle die bij een accountdienst hoort (kolom «Сервер (для всіх)»). */
export async function laatsteServerStanden(): Promise<Record<string, { stand: Stand; op: number }>> {
  const ids = [...new Set(Object.values(SERVER_CONTROLES).flat())];
  const rows = (await sys().query(`SELECT DISTINCT ON (controle) controle, stand, op FROM app.diagnostiek_uitslagen WHERE controle = ANY($1::text[]) ORDER BY controle, op DESC, nr DESC`, [ids]).catch(() => ({ rows: [] as Array<{ controle: string; stand: Stand; op: string }> }))).rows;
  return Object.fromEntries(rows.map((r) => [r.controle, { stand: r.stand, op: new Date(r.op).getTime() }]));
}

/** Kort, veilig profiel van het gekozen account voor de beheerder (zoals «Скарга користувача»): geen foto-URL's van derden, geen IP. */
export async function accountKort(id: string): Promise<{ id: string; naam: string; email: string; status: string } | null> {
  if (!isAccountId(id)) return null;
  const g = ((await db.get<Gebruiker>('users', [id]))[0] as Gebruiker | null) ?? null;
  return g ? { id, naam: String(g.name || g.email || id).slice(0, 80), email: String(g.email || '').slice(0, 160), status: String(g.status || '') } : null;
}
