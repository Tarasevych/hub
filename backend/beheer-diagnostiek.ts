// Admin → «Діагностика» (/diagnostiek): alleen-lezen controles van diensten, pagina's, koppelingen, data, server, netwerk en taken.
//
// Veiligheid (alles hier afgedwongen):
//  - de browser stuurt alleen controle-id's (of een categorie); de lijst staat in shared/beheer-diagnostiek.ts. Een id buiten die
//    lijst wordt geweigerd vóór er iets draait. Er is geen argument, URL of opdracht van de client;
//  - uitgaande verzoeken gaan ALLEEN naar vaste hosts: <vast subdomein>.<PUBLIC_DOMAIN>, 127.0.0.1 en drie vaste externe adressen
//    (accounts.google.com, www.googleapis.com, api.github.com); redirects worden niet gevolgd;
//  - geen shell, geen child_process: alleen fetch, dns.lookup, een TLS-handshake (alleen de einddatum van het certificaat wordt gelezen),
//    SELECT's, /proc/meminfo en os.loadavg();
//  - geheimen: van omgevingsvariabelen wordt alleen gekeken OF ze gevuld zijn (de naam wordt genoemd, de waarde nooit gelezen naar de
//    uitvoer); de korte `detail`-zin gaat door maskeer() en wordt op 400 tekens afgekapt;
//  - één batch tegelijk (429 DIAGNOSE_BEZIG), 20 batches per 10 minuten per gebruiker, elke batch in het auditlogboek met de id's die faalden;
//  - toegang: eigenaar, of een gebruiker met 'diagnose.lezen' in een ACTIEF technisch profiel (zoals /api/diagnose/meldingen).
import { statfs, readFile, access } from 'node:fs/promises';
import { constants as fsConst } from 'node:fs';
import dns from 'node:dns/promises';
import os from 'node:os';
import tls from 'node:tls';
import nodeHttp from 'node:http';
import { randomBytes } from 'node:crypto';
import { error, json } from '../server/platform';
import { auditControle } from '../server/platform/audit';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { gebruikerControle, zoekGebruikers } from './beheer-diagnostiek-gebruiker';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import {
  CATEGORIEEN, CONTROLES, CONTROLE_IDS, DIENST_HOSTS, MAX_BATCH, MS_LET_OP, PAGINA_SLUGS, controleVan, isControleId, schoonUitslag,
  type CategorieId, type Historie, type Stand, type Toestand, type Uitslag,
} from '../shared/beheer-diagnostiek';
import { beoordeelRook, browserAanwezig, huidigeVersie, leesRook, paginaUitRook, rookAanvragen, rookWachtend, type RookUitslag } from './rook-controle'; // zone A 22.10: rendercontrole
import { PUBLIC_DOMAIN } from './deployment-identiteit';
import { huidigeBundel, serverControles } from './diagnose';
import { heeftTechMogelijkheid, isEigenaar, TAB_RE } from './tech-profiel';
import { maskeer } from './uitrol-diagnose-run';
import { accountKort, accountOverzicht, accountRonde, isAccountId, laatsteServerStanden } from './diagnostiek-account';
import { tabel as accountTabel } from '../shared/diagnostiek-account';
import { meldBeveiligingsWijziging } from './beveiliging-meldingen';

/**
 * SEC-002 (privacy-logboek-03): wie met diagnose.lezen het account van een ANDER bekijkt of doorlicht, laat dat de bekeken
 * gebruiker weten in zijn eigen meldingencentrum (wie, wat). Het journaal had het al, maar alleen in de technische sfeer.
 * Hooguit één melding per beheerder × gebruiker × soort per uur, zodat «vernieuwen» geen stortvloed geeft.
 */
const inzageGemeld = new Map<string, number>();
const INZAGE_VENSTER_MS = 60 * 60_000;
export async function meldInzage(actor: { id: string; email?: string }, doelId: string, wat: 'gebruiker' | 'account' | 'account-uitgevoerd', nu = Date.now()): Promise<boolean> {
  if (!doelId || !actor?.id || actor.id === doelId) return false;
  const sleutel = `${actor.id}|${doelId}|${wat}`;
  if (nu - (inzageGemeld.get(sleutel) ?? 0) < INZAGE_VENSTER_MS) return false;
  inzageGemeld.set(sleutel, nu);
  if (inzageGemeld.size > 5000) for (const [k, t] of inzageGemeld) if (nu - t >= INZAGE_VENSTER_MS) inzageGemeld.delete(k);
  const [uk, nl] = wat === 'gebruiker' ? ['стан вашого облікового запису (скарга користувача)', 'de toestand van uw account (melding van een gebruiker)']
    : wat === 'account-uitgevoerd' ? ['перевірку служб вашого облікового запису (запущено)', 'een controle van de diensten van uw account (uitgevoerd)']
      : ['стан служб вашого облікового запису', 'de toestand van de diensten van uw account'];
  await meldBeveiligingsWijziging(doelId, 'account-bekeken', { wie: actor.email || 'beheerder', wat: uk, watNl: nl });
  return true;
}

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Res = { stand: Stand; code?: string; detail?: string };
type Batch = { server?: Promise<Array<{ id: string; stand: Stand; ms?: number; code?: string }>>; rook?: Promise<RookUitslag | null> };

const sys = () => getPool('systeem');
export const DOMEIN = /^[a-z0-9.-]{3,60}$/.test(process.env.DIAG_DOMEIN || '') ? String(process.env.DIAG_DOMEIN) : PUBLIC_DOMAIN;
export const hostVan = (sub: string) => `${sub}.${DOMEIN}`;
const UA = { 'user-agent': 'mijn-ruimte-diagnostiek/1' };
const lokaalPoort = () => Number(process.env.PORT || 8080);

// ------------------------------------------------------------------------------------------------ zuivere beoordelingen (getest)
/** HTTP-statuscode → stand. 2xx/3xx en 401/403 betekenen «de dienst antwoordt»; 404 en 5xx zijn een fout. */
export function httpStand(status: number, ms: number): Res {
  if (status === 401 || status === 403) return { stand: 'ok', detail: `HTTP ${status} · ${ms} мс · відповідає, потрібна автентифікація` };
  if (status >= 200 && status < 400) return ms > MS_LET_OP ? { stand: 'let-op', code: 'TRAAG', detail: `HTTP ${status} · ${ms} мс · повільно` } : { stand: 'ok', detail: `HTTP ${status} · ${ms} мс` };
  return { stand: 'fout', code: `HTTP_${status}`, detail: `HTTP ${status} · ${ms} мс` };
}
export const tlsStand = (dagen: number): Res => dagen < 0 ? { stand: 'fout', code: 'TLS_VERLOPEN' } : dagen < 7 ? { stand: 'fout', code: 'TLS_BINNENKORT' } : dagen < 21 ? { stand: 'let-op', code: 'TLS_KORT' } : { stand: 'ok' };
export const geheugenStand = (vrijPct: number): Res => vrijPct < 4 ? { stand: 'fout', code: 'GEHEUGEN_BIJNA_OP' } : vrijPct < 10 ? { stand: 'let-op', code: 'GEHEUGEN_KRAP' } : { stand: 'ok' };
export const belastingStand = (load: number, kernen: number): Res => { const r = load / Math.max(1, kernen); return r > 3 ? { stand: 'fout', code: 'LOAD_ZEER_HOOG' } : r > 1.5 ? { stand: 'let-op', code: 'LOAD_HOOG' } : { stand: 'ok' }; };
export const lagStand = (lag: number): Res => lag > 200 ? { stand: 'let-op', code: 'LAG_HOOG' } : { stand: 'ok' };
export const schijfStand = (vrijPct: number): Res => vrijPct < 3 ? { stand: 'fout', code: 'BIJNA_VOL' } : vrijPct < 10 ? { stand: 'let-op', code: 'WEINIG_VRIJ' } : { stand: 'ok' };
export const dbStand = (medianeMs: number): Res => medianeMs > 200 ? { stand: 'let-op', code: 'DB_TRAAG' } : { stand: 'ok' };
/** Waarde uit /proc/meminfo-tekst in kB. */
export const meminfoWaarde = (tekst: string, sleutel: string): number => { const m = new RegExp(`^${sleutel}:\\s+(\\d+)\\s*kB`, 'm').exec(tekst); return m ? Number(m[1]) : NaN; };
export const mediaan = (n: number[]): number => { const s = [...n].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const mb = (kb: number) => (kb / 1024 / 1024).toFixed(1);

// ------------------------------------------------------------------------------------------------ uitvoerders
async function haal(url: string, ms = 6000): Promise<{ status: number; ms: number; tekst: () => Promise<string>; headers: Headers }> {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(ms), headers: UA });
  return { status: r.status, ms: Date.now() - t0, tekst: () => r.text(), headers: r.headers };
}
/** Audit 19.10.2026 (A2): de app zelf op 127.0.0.1 bevragen MET de Host-kop van de admin-site. Zonder die kop weigert server/start.ts
 *  het verzoek (404 «Onbekende host», LOCAL_HOSTS) en stond elke diagnoseronde als fout in het logboek. Node's fetch laat geen Host-kop
 *  toe, daarom node:http; de host-allow-list van de server blijft ongewijzigd (veiliger dan een uitzondering op de server). */
export function haalLokaal(pad: string, ms = 3000, host = hostVan('admin')): Promise<{ status: number; ms: number; tekst: string }> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const req = nodeHttp.request({ host: '127.0.0.1', port: lokaalPoort(), path: pad, method: 'GET', headers: { ...UA, host, accept: 'application/json' }, timeout: ms }, (res) => {
      let tekst = ''; res.setEncoding('utf8');
      res.on('data', (d: string) => { if (tekst.length < 4096) tekst += d; });
      res.on('end', () => resolve({ status: res.statusCode || 0, ms: Date.now() - t0, tekst }));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })); });
    req.on('error', reject);
    req.end();
  });
}
const netFout = (e: unknown): Res => {
  const naam = (e as { name?: string })?.name;
  return naam === 'TimeoutError' || naam === 'AbortError' ? { stand: 'fout', code: 'TIJD_OM', detail: 'Тайм-аут запиту' } : { stand: 'fout', code: 'NIET_BEREIKBAAR', detail: 'З’єднання не вдалося' };
};
async function http(host: string, pad = '/', html = false): Promise<Res> {
  try {
    const r = await haal(`https://${host}${pad}`);
    const s = httpStand(r.status, r.ms);
    if (html && s.stand === 'ok' && r.status === 200) {
      const kop = (await r.tekst()).slice(0, 4096).toLowerCase();
      if (!kop.includes('<html') && !kop.includes('<!doctype')) return { stand: 'fout', code: 'GEEN_HTML', detail: `${s.detail} · не HTML` };
    }
    return s;
  } catch (e) { return netFout(e); }
}
const serverUitslag = (b: Batch) => (b.server ??= serverControles());
const rookUitslag = (b: Batch) => (b.rook ??= leesRook());
/** Pagina-controle (22.10.2026): HTTP-schil + wat de laatste browsercontrole over DEZE pagina zei. Zonder browser eerlijk «alleen HTTP». */
async function paginaMetRendering(slug: string, b: Batch): Promise<Res> {
  const h = await http(hostVan('admin'), `/${slug}`, true);
  const r = paginaUitRook(await rookUitslag(b), slug, Date.now(), huidigeVersie());
  if (r.kapot) return { stand: 'fout', code: 'ROOK_KAPOT', detail: `${h.detail || ''} · ${r.tekst}`.replace(/^ · /, '') };
  return { ...h, detail: `${h.detail || ''} · ${r.tekst}`.replace(/^ · /, '') };
}
const uitServer = (id: string) => async (b: Batch): Promise<Res> => {
  const u = (await serverUitslag(b)).find((x) => x.id === id);
  if (!u) return { stand: 'onbekend', code: 'FOUT' };
  return { stand: u.stand, ...(u.code ? { code: u.code } : {}), detail: u.ms != null ? `${u.ms} мс` : '' };
};

const UITVOERDERS: Record<string, (b: Batch) => Promise<Res>> = {
  ...Object.fromEntries(DIENST_HOSTS.map((h) => [`dienst-${h}`, () => http(hostVan(h))])),
  ...Object.fromEntries(PAGINA_SLUGS.map((slug) => [`pagina-${slug}`, (b: Batch) => paginaMetRendering(slug, b)])),
  'pagina-rendering': async (b) => {
    const u = await rookUitslag(b);
    const r = beoordeelRook(u, Date.now(), huidigeVersie(), await browserAanwezig());
    return { stand: r.stand, ...(r.code ? { code: r.code } : {}), detail: r.detail };
  },
  'pagina-bundel': async () => {
    const naam = await huidigeBundel();
    if (!naam) return { stand: 'onbekend', code: 'GEEN_BUNDEL', detail: 'dist/index.html недоступний' };
    try { const r = await haal(`https://${hostVan('admin')}/assets/${naam}`); const s = httpStand(r.status, r.ms); return { ...s, detail: `${naam} · ${s.detail}` }; } catch (e) { return netFout(e); }
  },
  'pagina-api': async () => {
    try { const r = await haalLokaal('/api/_healthcheck'); return httpStand(r.status, r.ms); } catch (e) { return netFout(e); }
  },

  'verb-google': async () => {
    const id = process.env.GOOGLE_SUITE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_SUITE_CLIENT_SECRET;
    const sleutel = process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1;
    // «…_SECRET» wordt door maskeer() als geheim-woord weggehaald; daarom noemen we dat ene geval met woorden (de exacte naam staat bij de oplossing).
    const mis = [!id && 'GOOGLE_OAUTH_CLIENT_ID', !secret && 'клієнтський секрет Google (змінна CLIENT-секрету, див. кроки нижче)', !sleutel && 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1'].filter(Boolean);
    if (mis.length) return { stand: 'let-op', code: 'NIET_INGESTELD', detail: `Не задано: ${mis.join(', ')}` };
    try { const r = await haal('https://accounts.google.com/.well-known/openid-configuration', 5000); const s = httpStand(r.status, r.ms); return { ...s, detail: `Ключі задані · ${s.detail}` }; } catch (e) { return netFout(e); }
  },
  'verb-github': async () => {
    try { const r = await haal('https://api.github.com/', 5000); return r.status === 403 ? { stand: 'let-op', code: 'HTTP_403', detail: `HTTP 403 · ${r.ms} мс · ліміт GitHub` } : httpStand(r.status, r.ms); } catch (e) { return netFout(e); }
  },
  'verb-oauth': async () => {
    let s: Res;
    try {
      const r = await haal(`https://${hostVan('mcp')}/.well-known/oauth-authorization-server/oauth2`, 5000);
      s = httpStand(r.status, r.ms);
      if (s.stand === 'ok' && r.status === 200) { const t = (await r.tekst()).slice(0, 8000); if (!/"issuer"/.test(t)) s = { stand: 'fout', code: 'GEEN_HTML', detail: 'Опис сервера авторизації без "issuer"' }; }
    } catch (e) { s = netFout(e); }
    let n = -1;
    try { n = Number((await sys().query(`SELECT count(*) AS n FROM app.mcp_oauth_tokens WHERE revoked_at IS NULL AND refresh_expires_at > now()`)).rows[0]?.n); } catch { /* geen toegang → zonder aantal */ }
    return { ...s, detail: `${s.detail || ''}${n >= 0 ? ` · активних токенів: ${n}` : ''}`.replace(/^ · /, '') };
  },
  'verb-mcp': uitServer('mcp-deur'),

  // ---- mail
  'mail-gmail-api': async () => {
    try { const r = await haal('https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest', 5000); return httpStand(r.status, r.ms); } catch (e) { return netFout(e); }
  },
  'mail-wachtrij': async () => {
    let r;
    try {
      r = (await sys().query(
        `SELECT count(*) FILTER (WHERE status = 'sending' AND updated_at < now() - interval '15 minutes')::int AS vast,
                count(*) FILTER (WHERE status = 'scheduled' AND send_at < now() - interval '15 minutes')::int AS laat,
                count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS mislukt,
                count(*) FILTER (WHERE status = 'scheduled')::int AS gepland
           FROM app.mail_queue`)).rows[0];
    } catch { return { stand: 'onbekend', code: 'GEEN_TOEGANG', detail: 'Таблиця черги недоступна' }; }
    const vast = Number(r.vast) + Number(r.laat), mislukt = Number(r.mislukt), gepland = Number(r.gepland);
    if (vast > 0) return { stand: 'fout', code: 'MAIL_VAST', detail: `Застрягло або прострочено: ${vast}; невдалих за добу: ${mislukt}; у черзі: ${gepland}` };
    if (mislukt > 0) return { stand: 'let-op', code: 'MAIL_MISLUKT', detail: `Невдалих відправлень за добу: ${mislukt}; у черзі: ${gepland}` };
    return { stand: 'ok', detail: `Черга чиста; у черзі: ${gepland}` };
  },

  // ---- cloud
  'cloud-opslag': async () => {
    const r = (await sys().query(`SELECT count(*)::int AS n, COALESCE(sum(size_bytes), 0)::bigint AS b FROM app.storage_objects`)).rows[0];
    const map = process.env.UPLOADS_DIR;
    let schrijfbaar = true;
    if (map) { try { await access(map, fsConst.W_OK); } catch { schrijfbaar = false; } }
    const detail = `Файлів: ${Number(r.n)}, разом ${(Number(r.b) / 1048576).toFixed(1)} МБ${map ? (schrijfbaar ? ' · каталог доступний для запису' : ' · каталог недоступний для запису') : ''}`;
    return schrijfbaar ? { stand: 'ok', detail } : { stand: 'fout', code: 'OPSLAG_SCHRIJVEN', detail };
  },
  'cloud-drive-api': async () => {
    try { const r = await haal('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', 5000); return httpStand(r.status, r.ms); } catch (e) { return netFout(e); }
  },

  // ---- ШІ-агенти
  'ai-verbindingen': async () => {
    const rows = (await sys().query(
      `SELECT client_name, count(*)::int AS n, max(last_used_at) AS laatst
         FROM app.mcp_oauth_tokens WHERE revoked_at IS NULL AND refresh_expires_at > now() GROUP BY client_name ORDER BY n DESC LIMIT 5`)).rows;
    if (!rows.length) return { stand: 'ok', code: 'TOKENS_GEEN', detail: 'Активних підключень немає' };
    const delen = rows.map((r) => `${String(r.client_name).replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 30)} ×${r.n}`);
    const laatst = Math.max(...rows.map((r) => (r.laatst ? new Date(r.laatst).getTime() : 0)));
    return { stand: 'ok', detail: `${delen.join(', ')}${laatst ? ` · останнє використання ${new Date(laatst).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}` };
  },
  'ai-voorbereiders': async () => {
    let r;
    try {
      r = (await sys().query(
        `SELECT count(*) FILTER (WHERE v.verloopt_op > now())::int AS geldig,
                count(*) FILTER (WHERE v.verloopt_op > now() AND v.verloopt_op < now() + interval '24 hours')::int AS bijna,
                count(*) FILTER (WHERE v.verloopt_op > now() AND v.soort = 'mcp-koppeling'
                                   AND NOT EXISTS (SELECT 1 FROM app.mcp_oauth_tokens t WHERE t.id::text = v.onderwerp AND t.revoked_at IS NULL AND t.refresh_expires_at > now()))::int AS wees
           FROM app.uitrol_voorbereiders v WHERE v.ingetrokken_op IS NULL`)).rows[0];
    } catch { return { stand: 'onbekend', code: 'GEEN_TOEGANG', detail: 'Таблиця дозволів недоступна' }; }
    const geldig = Number(r.geldig), bijna = Number(r.bijna), wees = Number(r.wees);
    if (wees > 0) return { stand: 'let-op', code: 'VERWEESD_GRANT', detail: `Осиротілих дозволів: ${wees}; чинних: ${geldig}` };
    if (bijna > 0) return { stand: 'let-op', code: 'GRANT_VERLOOPT', detail: `Спливає за 24 год: ${bijna}; чинних: ${geldig}` };
    return { stand: 'ok', detail: `Чинних дозволів: ${geldig}` };
  },

  // ---- пристрої
  'apparaten-agents': async () => {
    const r = (await sys().query(
      `SELECT count(*) FILTER (WHERE status = 'connected')::int AS verbonden,
              count(*) FILTER (WHERE status = 'connected' AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes'))::int AS stil,
              count(*)::int AS totaal
         FROM app.agents WHERE revoked_at IS NULL`)).rows[0];
    const v = Number(r.verbonden), stil = Number(r.stil), t = Number(r.totaal);
    if (!t) return { stand: 'ok', code: 'GEEN_AGENTEN', detail: 'Локальних агентів немає' };
    if (stil > 0) return { stand: 'let-op', code: 'AGENT_STIL', detail: `Підключено ${v}, з них без сигналу понад 10 хв: ${stil}; усього ${t}` };
    return { stand: 'ok', detail: `Підключено ${v} з ${t}` };
  },
  'apparaten-commando': async () => {
    const r = (await sys().query(
      `SELECT count(*) FILTER (WHERE status = 'succeeded')::int AS ok,
              count(*) FILTER (WHERE status IN ('failed', 'timeout'))::int AS slecht,
              count(*) FILTER (WHERE status = 'sent' AND created_at < now() - interval '10 minutes')::int AS vast
         FROM app.agent_commands WHERE created_at > now() - interval '24 hours'`)).rows[0];
    const ok = Number(r.ok), slecht = Number(r.slecht), vast = Number(r.vast), n = ok + slecht;
    if (vast > 0) return { stand: 'let-op', code: 'OPDRACHTEN_VAST', detail: `Застрягло: ${vast}; успішних ${ok}, невдалих ${slecht} за добу` };
    if (n >= 5 && slecht / n > 0.5) return { stand: 'let-op', code: 'OPDRACHTEN_MISLUKT', detail: `Невдалих ${slecht} з ${n} за добу` };
    return { stand: 'ok', detail: `За добу: успішних ${ok}, невдалих ${slecht}` };
  },

  'data-database': async () => {
    const t: number[] = [];
    for (let i = 0; i < 3; i++) { const t0 = Date.now(); await sys().query('SELECT 1'); t.push(Date.now() - t0); }
    const m = mediaan(t);
    return { ...dbStand(m), detail: `Медіана ${m} мс (3 запити)` };
  },
  'data-schema': uitServer('schema'),
  'data-audit': async () => {
    const r = await auditControle(null);
    return r.geldig ? { stand: 'ok', detail: `${r.totaal} записів, ланцюжок цілий` } : { stand: 'fout', code: 'KETEN_GEBROKEN', detail: `Хеш-помилок: ${r.hashFout}, розривів: ${r.schakelFout}, прогалин: ${r.onverklaardeGaten}` };
  },

  'server-schijf': async () => {
    const s = await statfs(process.env.UPLOADS_DIR || process.env.DIST_DIR || process.cwd());
    const vrij = (Number(s.bavail) / Math.max(1, Number(s.blocks))) * 100;
    return { ...schijfStand(vrij), detail: `Вільно ${vrij.toFixed(1)}% (${(Number(s.bavail) * Number(s.bsize) / 1e9).toFixed(1)} ГБ)` };
  },
  'server-geheugen': async () => {
    let totaal = os.totalmem() / 1024, vrij = os.freemem() / 1024;
    try { const t = await readFile('/proc/meminfo', 'utf8'); const a = meminfoWaarde(t, 'MemAvailable'), z = meminfoWaarde(t, 'MemTotal'); if (Number.isFinite(a) && Number.isFinite(z)) { vrij = a; totaal = z; } } catch { /* niet-Linux */ }
    const pct = (vrij / Math.max(1, totaal)) * 100;
    return { ...geheugenStand(pct), detail: `Доступно ${mb(vrij)} з ${mb(totaal)} ГБ (${pct.toFixed(0)}%)` };
  },
  'server-cpu': async () => {
    const kernen = os.cpus().length || 1, l = os.loadavg()[0];
    return { ...belastingStand(l, kernen), detail: `Навантаження ${l.toFixed(2)} на ${kernen} ядер` };
  },
  'server-tijd': uitServer('servertijd'),
  'server-proces': async () => {
    const t0 = Date.now(); await new Promise((r) => setTimeout(r, 50)); const lag = Math.max(0, Date.now() - t0 - 50);
    const m = process.memoryUsage();
    return { ...lagStand(lag), detail: `Лаг ${lag} мс · RSS ${(m.rss / 1048576).toFixed(0)} МБ · аптайм ${(process.uptime() / 3600).toFixed(1)} год` };
  },

  'net-dns': async () => {
    const mis: string[] = [];
    await Promise.all(DIENST_HOSTS.map(async (h) => { try { await dns.lookup(hostVan(h), { family: 4 }); } catch { mis.push(h); } }));
    return mis.length ? { stand: 'fout', code: 'DNS_GEEN', detail: `Немає запису: ${mis.sort().join(', ')}` } : { stand: 'ok', detail: `${DIENST_HOSTS.length} з ${DIENST_HOSTS.length} піддоменів мають запис` };
  },
  'net-tls': async () => {
    const eind = (host: string) => new Promise<{ host: string; dagen: number; fout?: string }>((res) => {
      const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 5000 }, () => {
        const c = s.getPeerCertificate();
        const dagen = c?.valid_to ? (Date.parse(c.valid_to) - Date.now()) / 86_400_000 : NaN;
        const fout = s.authorized ? undefined : String(s.authorizationError || 'ONBEKEND').replace(/[^A-Za-z_]/g, '').slice(0, 40);
        s.end(); res(Number.isFinite(dagen) ? { host, dagen, fout } : { host, dagen: NaN, fout: 'GEEN_CERTIFICAAT' });
      });
      s.on('error', () => { res({ host, dagen: NaN, fout: 'VERBINDING' }); });
      s.on('timeout', () => { s.destroy(); res({ host, dagen: NaN, fout: 'TIJD_OM' }); });
    });
    const r = await Promise.all(DIENST_HOSTS.map((h) => eind(hostVan(h))));
    const stuk = r.filter((x) => !Number.isFinite(x.dagen));
    if (stuk.length) return { stand: 'fout', code: 'TLS_FOUT', detail: `Не вдалося: ${stuk.map((x) => `${x.host.split('.')[0]} (${x.fout})`).join(', ')}` };
    const slecht = r.filter((x) => x.fout);
    const min = r.reduce((a, b) => (b.dagen < a.dagen ? b : a));
    if (slecht.length) return { stand: 'fout', code: 'TLS_FOUT', detail: `Сертифікат не довірений: ${slecht.map((x) => `${x.host.split('.')[0]} (${x.fout})`).join(', ')}` };
    return { ...tlsStand(min.dagen), detail: `Найближче спливає ${min.host.split('.')[0]}: через ${Math.floor(min.dagen)} дн.` };
  },

  'taak-mail': uitServer('mail-onderhoud'),
  'taak-cron': async () => {
    const rows = (await sys().query(
      `SELECT DISTINCT ON (tbl) tbl, data FROM app.records WHERE tbl LIKE 'cron\\_status\\_%' ESCAPE '\\' ORDER BY tbl, COALESCE((data->>'updatedAt')::numeric, (data->>'lastRunAt')::numeric, 0) DESC`)).rows;
    if (!rows.length) return { stand: 'onbekend', code: 'GEEN_CRON', detail: 'Записів cron_status_* немає' };
    const naam = (t: string) => t.replace(/^cron_status_/, '').replace(/_v\d+$/, '');
    const fout = rows.filter((r) => r.data?.ok === false).map((r) => naam(r.tbl));
    const oud = rows.filter((r) => r.data?.ok !== false && (Date.now() - Number(r.data?.lastRunAt || 0)) > 26 * 3_600_000).map((r) => naam(r.tbl));
    if (fout.length) return { stand: 'fout', code: 'CRON_FOUT', detail: `З помилкою: ${fout.join(', ')} (усього ${rows.length})` };
    if (oud.length) return { stand: 'let-op', code: 'CRON_OUD', detail: `Давно не запускались: ${oud.join(', ')} (усього ${rows.length})` };
    return { stand: 'ok', detail: `${rows.length} завдань, усі успішні` };
  },
  // Zoekindex (22.10.2026): cron «zoek-index» schrijft in app.cron_runs (server/cron.ts), niet in cron_status_*; bronnen in app.zoek_bron_stand.
  'taak-zoek-index': async () => {
    let run: { status: string; gestart: string; klaar: string | null; detail: string } | undefined;
    try { run = (await sys().query(`SELECT status, started_at AS gestart, finished_at AS klaar, COALESCE(detail, '') AS detail FROM app.cron_runs WHERE name = 'zoek-index' ORDER BY started_at DESC LIMIT 1`)).rows[0]; }
    catch { return { stand: 'onbekend', code: 'GEEN_TOEGANG', detail: 'Таблиця cron_runs недоступна' }; }
    let wachtrij = -1, bronFout = 0, bronnen = 0;
    try { wachtrij = Number((await sys().query(`SELECT count(*)::int AS n FROM app.zoek_wachtrij`)).rows[0]?.n); } catch { /* geen tabel (oudere migratiestand) */ }
    try {
      const r = (await sys().query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE laatste_fout <> '' AND laatste_fout_op IS NOT NULL AND (laatste_succes_op IS NULL OR laatste_fout_op > laatste_succes_op))::int AS fout FROM app.zoek_bron_stand`)).rows[0];
      bronnen = Number(r?.n || 0); bronFout = Number(r?.fout || 0);
    } catch { /* geen tabel */ }
    const extra = `${wachtrij >= 0 ? ` · у черзі: ${wachtrij}` : ''} · джерел: ${bronnen}${bronFout ? `, з помилкою: ${bronFout}` : ''}`;
    if (!run) return { stand: 'let-op', code: 'ZOEK_INDEX_NOOIT', detail: `Запусків zoek-index ще не було${extra}` };
    const leeftijdMin = (Date.now() - new Date(run.gestart).getTime()) / 60_000;
    const wanneer = `${Math.round(leeftijdMin)} хв тому`;
    if (run.status === 'error') return { stand: 'fout', code: 'ZOEK_INDEX_FOUT', detail: `Останній запуск ${wanneer}: помилка — ${run.detail.slice(0, 120)}${extra}` };
    if (leeftijdMin > 30) return { stand: 'let-op', code: 'ZOEK_INDEX_OUD', detail: `Останній запуск ${wanneer} (${run.status})${extra}` };
    if (bronFout > 0) return { stand: 'let-op', code: 'ZOEK_BRON_FOUT', detail: `Останній запуск ${wanneer} (${run.status})${extra}` };
    if (wachtrij > 500 && run.status === 'skipped') return { stand: 'let-op', code: 'ZOEK_WACHTRIJ_VAST', detail: `Останній запуск ${wanneer} пропущено, черга ${wachtrij}${extra}` };
    return { stand: 'ok', detail: `Останній запуск ${wanneer} (${run.status})${extra}` };
  },
  'taak-uitrol': async () => {
    let r;
    try { r = (await sys().query(`SELECT staat, versie, extract(epoch FROM gestart_op) * 1000 AS gestart FROM app.uitrol_runs ORDER BY gestart_op DESC LIMIT 1`)).rows[0]; }
    catch { return { stand: 'onbekend', code: 'GEEN_TOEGANG', detail: 'Таблиця розгортань недоступна' }; }
    if (!r) return { stand: 'onbekend', detail: 'Розгортань ще не було' };
    const leeftijdUur = (Date.now() - Number(r.gestart)) / 3_600_000;
    const versie = String(r.versie || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20);
    if (['mislukt', 'geweigerd', 'afgebroken'].includes(r.staat) && leeftijdUur < 24) return { stand: 'let-op', code: 'UITROL_MISLUKT', detail: `Версія ${versie}: ${r.staat}` };
    if (r.staat === 'bezig' && leeftijdUur > 1) return { stand: 'let-op', code: 'UITROL_MISLUKT', detail: `Версія ${versie}: «bezig» понад годину` };
    return { stand: 'ok', detail: `Версія ${versie}: ${r.staat}` };
  },
};
export const UITVOERBARE_IDS: readonly string[] = Object.keys(UITVOERDERS);
if (UITVOERBARE_IDS.slice().sort().join() !== CONTROLE_IDS.slice().sort().join()) console.error('[admin-diagnostiek] register en uitvoerders lopen uiteen');

/** Eén controle uitvoeren met tijdslimiet; elke fout wordt een uitslag, nooit een gooi. */
export async function voerUit(id: string, batch: Batch = {}): Promise<Uitslag> {
  const t0 = Date.now();
  let r: Res;
  try {
    r = await Promise.race([
      UITVOERDERS[id](batch),
      new Promise<Res>((res) => setTimeout(() => res({ stand: 'fout', code: 'TIJD_OM', detail: 'Перевірка не завершилась вчасно' }), id === 'data-audit' || id === 'net-tls' ? 15_000 : 10_000).unref()),
    ]);
  } catch { r = { stand: 'fout', code: 'FOUT', detail: 'Несподівана помилка перевірки' }; }
  const code = r.code && /^[A-Z0-9_]{1,40}$/.test(r.code) ? r.code : '';
  return { id, stand: r.stand, ms: Math.min(600_000, Date.now() - t0), code, detail: maskeer(String(r.detail || '')).replace(/\s+/g, ' ').slice(0, 400), op: Date.now() };
}

/** Een paar tegelijk (niet alle 30 op één moment: dat vervuilt de meting en belast de server). */
export async function voerLijstUit(ids: string[], parallel = 5): Promise<Uitslag[]> {
  const batch: Batch = {}; const uit: Uitslag[] = new Array(ids.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, ids.length) }, async () => { while (i < ids.length) { const n = i++; uit[n] = await voerUit(ids[n], batch); } }));
  return uit;
}

// ------------------------------------------------------------------------------------------------ opslag en overzicht
export async function bewaar(uitslagen: Uitslag[], door: { id: string; email: string }, batch: string): Promise<void> {
  for (const u of uitslagen) {
    await sys().query(
      `INSERT INTO app.diagnostiek_uitslagen (controle, categorie, stand, ms, code, detail, op, door, door_email, batch) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::double precision / 1000), $8, $9, $10)`,
      [u.id, controleVan(u.id)?.cat ?? 'onbekend', u.stand, u.ms, u.code, u.detail, u.op, door.id.slice(0, 80), door.email.slice(0, 160), batch.slice(0, 40)]);
  }
  await sys().query(`DELETE FROM app.diagnostiek_uitslagen WHERE op < now() - interval '30 days'`).catch(() => undefined);
}

export type Trend = { dagen: Array<{ dag: number; ok: number; slecht: number }>; top: Array<{ id: string; n: number; sinds: number }>; week: { uitvoeringen: number; slecht: number } };
export async function trendOverzicht(): Promise<Trend> {
  const dagen = (await sys().query(`SELECT floor(extract(epoch FROM op) / 86400)::bigint AS d, count(*) FILTER (WHERE stand = 'ok')::int AS ok, count(*) FILTER (WHERE stand <> 'ok')::int AS slecht
      FROM app.diagnostiek_uitslagen WHERE op > now() - interval '14 days' GROUP BY 1 ORDER BY 1`).catch(() => ({ rows: [] as Array<{ d: string; ok: number; slecht: number }> }))).rows;
  const top = (await sys().query(`SELECT controle, count(*)::int AS n, (extract(epoch FROM max(op)) * 1000)::bigint AS laatst FROM app.diagnostiek_uitslagen
      WHERE stand IN ('fout', 'let-op') AND op > now() - interval '7 days' GROUP BY controle ORDER BY n DESC, controle LIMIT 5`).catch(() => ({ rows: [] as Array<{ controle: string; n: number; laatst: string }> }))).rows;
  const week = (await sys().query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE stand IN ('fout', 'let-op'))::int AS f FROM app.diagnostiek_uitslagen WHERE op > now() - interval '7 days'`).catch(() => ({ rows: [{ n: 0, f: 0 }] }))).rows[0];
  return {
    dagen: dagen.map((r) => ({ dag: Number(r.d) * 86_400_000, ok: Number(r.ok), slecht: Number(r.slecht) })),
    top: top.filter((r) => isControleId(r.controle)).map((r) => ({ id: r.controle, n: Number(r.n), sinds: Number(r.laatst) })),
    week: { uitvoeringen: Number(week?.n || 0), slecht: Number(week?.f || 0) },
  };
}

export async function overzicht(): Promise<{ toestanden: Record<string, Toestand>; historie: Historie[]; trend: Trend; nu: number }> {
  const rows = (await sys().query(`
    WITH laatste AS (SELECT DISTINCT ON (controle) controle, stand, ms, code, detail, op, door_email FROM app.diagnostiek_uitslagen ORDER BY controle, op DESC, nr DESC),
         succes AS (SELECT controle, max(op) AS op FROM app.diagnostiek_uitslagen WHERE stand = 'ok' GROUP BY controle),
         dag AS (SELECT controle, count(*) FILTER (WHERE stand IN ('fout', 'let-op')) AS fouten, count(*) AS totaal FROM app.diagnostiek_uitslagen WHERE op > now() - interval '24 hours' GROUP BY controle),
         sinds AS (SELECT u.controle, min(u.op) AS op FROM app.diagnostiek_uitslagen u LEFT JOIN succes s ON s.controle = u.controle WHERE u.stand <> 'ok' AND (s.op IS NULL OR u.op > s.op) GROUP BY u.controle)
    SELECT l.controle, l.stand, l.ms, l.code, l.detail, l.op, l.door_email, su.op AS succes, COALESCE(d.fouten, 0) AS fouten, COALESCE(d.totaal, 0) AS totaal, si.op AS sinds
      FROM laatste l LEFT JOIN succes su ON su.controle = l.controle LEFT JOIN dag d ON d.controle = l.controle LEFT JOIN sinds si ON si.controle = l.controle`)).rows;
  const toestanden: Record<string, Toestand> = {};
  for (const r of rows) {
    if (!isControleId(r.controle)) continue;
    toestanden[r.controle] = {
      laatste: { id: r.controle, stand: r.stand, ms: r.ms, code: r.code, detail: r.detail, op: new Date(r.op).getTime() },
      laatsteSucces: r.succes ? new Date(r.succes).getTime() : 0, eersteFoutSindsSucces: r.sinds ? new Date(r.sinds).getTime() : 0,
      fouten24: Number(r.fouten), uitvoeringen24: Number(r.totaal), door: r.door_email || undefined,
    };
  }
  return { toestanden, historie: await historie({ limit: 60 }), trend: await trendOverzicht(), nu: Date.now() };
}

export async function historie(f: { controle?: string; stand?: string; categorie?: string; voor?: number; limit?: number }): Promise<Historie[]> {
  const w: string[] = ['1=1']; const p: unknown[] = [];
  if (f.controle && isControleId(f.controle)) { p.push(f.controle); w.push(`controle = $${p.length}`); }
  if (f.categorie && CATEGORIEEN.some((c) => c.id === f.categorie)) { p.push(f.categorie); w.push(`categorie = $${p.length}`); }
  // «alles» = ook geslaagde uitvoeringen; «problemen» (standaard) = alleen fout/let-op/onbekend; of één exacte stand.
  if (f.stand === 'alles') { /* geen filter */ } else if (f.stand && ['ok', 'let-op', 'fout', 'onbekend'].includes(f.stand)) { p.push(f.stand); w.push(`stand = $${p.length}`); } else w.push(`stand <> 'ok'`);
  if (f.voor && Number.isFinite(f.voor)) { p.push(Math.floor(f.voor)); w.push(`nr < $${p.length}`); }
  p.push(Math.max(1, Math.min(200, Math.floor(f.limit ?? 50))));
  const rows = (await sys().query(`SELECT nr, controle, categorie, stand, ms, code, detail, op, door_email FROM app.diagnostiek_uitslagen WHERE ${w.join(' AND ')} ORDER BY nr DESC LIMIT $${p.length}`, p)).rows;
  return rows.map((r) => ({ id: r.controle, nr: Number(r.nr), categorie: r.categorie, stand: r.stand, ms: r.ms, code: r.code, detail: r.detail, op: new Date(r.op).getTime(), door: r.door_email || '' }));
}


/** Laatste bekende stand per controle, vóór een nieuwe uitvoering (voor het herkennen van «begin storing» en «hersteld»). */
export async function vorigeStanden(ids: string[]): Promise<Map<string, Stand>> {
  const rows = (await sys().query(`SELECT DISTINCT ON (controle) controle, stand FROM app.diagnostiek_uitslagen WHERE controle = ANY($1::text[]) ORDER BY controle, op DESC, nr DESC`, [ids]).catch(() => ({ rows: [] as Array<{ controle: string; stand: Stand }> }))).rows;
  return new Map(rows.map((r) => [r.controle, r.stand]));
}

// ------------------------------------------------------------------------------------------------ routes
let bezig = false;

/**
 * Eén serverronde: uitvoeren, bewaren, auditregels (één per ronde + één per overgang storing/herstel). Gebruikt door de knop
 * «Перевірити» en door de geplande ronde elke 15 minuten (diagnostiekServerCron → kolom «Сервер (для всіх)»).
 * Gooit 'DIAGNOSE_BEZIG' als er in dit proces al een ronde loopt.
 */
export async function serverRonde(ids: string[], wie: { id: string; email: string }, bereik: string): Promise<{ batch: string; uitslagen: Uitslag[] }> {
  if (bezig) throw new Error('DIAGNOSE_BEZIG');
  bezig = true;
  try {
    const batch = randomBytes(6).toString('hex');
    const uitslagen = await voerLijstUit(ids);
    const vorige = await vorigeStanden(ids);
    await bewaar(uitslagen, wie, batch);
    const slecht = uitslagen.filter((u) => u.stand === 'fout' || u.stand === 'let-op');
    const schrijf = (i: Parameters<typeof schrijfBeheerAudit>[0]) => schrijfBeheerAudit(i).catch((e) => { console.error('[admin-diagnostiek] AUDIT MISLUKT:', (e as Error).message); });
    // Eén regel per ronde (wie, wat, uitslag) …
    await schrijf({ actor: wie, doel: { soort: 'diagnose', id: batch, naam: bereik }, actie: 'diag.uitgevoerd', categorie: 'diagnose', resultaat: 'success', service: 'admin',
      details: { batch, aantal: ids.length, bereik, mislukt: slecht.map((u) => `${u.id}:${u.stand}${u.code ? `:${u.code}` : ''}`).slice(0, 40) } });
    // … en een regel per overgang (begin van een storing / herstel), zodat het logboek laat zien sinds wanneer iets faalt.
    for (const u of uitslagen) {
      const was = vorige.get(u.id), nu = u.stand;
      const slechtNu = nu === 'fout' || nu === 'let-op', slechtWas = was === 'fout' || was === 'let-op';
      if (slechtNu && !slechtWas) await schrijf({ actor: wie, doel: { soort: 'diagnose', id: u.id, naam: controleVan(u.id)?.naam[0] }, actie: 'diag.storing', categorie: 'diagnose', resultaat: 'failure', voor: was ?? 'nooit', na: nu, service: 'admin', details: { code: u.code, ms: u.ms } });
      else if (nu === 'ok' && slechtWas) await schrijf({ actor: wie, doel: { soort: 'diagnose', id: u.id, naam: controleVan(u.id)?.naam[0] }, actie: 'diag.hersteld', categorie: 'diagnose', resultaat: 'success', voor: was, na: 'ok', service: 'admin', details: { ms: u.ms } });
    }
    return { batch, uitslagen };
  } finally { bezig = false; }
}

/** Geplande serverronde (cron.json «diagnostiek-server», elke 15 min; systemd mijn-ruimte-diagnostiek-server.timer). */
export async function diagnostiekServerCron(): Promise<{ statusCode: number; body: string }> {
  try {
    const { uitslagen } = await serverRonde([...CONTROLE_IDS], { id: 'systeem', email: '' }, 'gepland');
    const slecht = uitslagen.filter((u) => u.stand === 'fout' || u.stand === 'let-op').map((u) => u.id);
    return { statusCode: 200, body: JSON.stringify({ ok: true, aantal: uitslagen.length, slecht }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: String((e as Error).message || 'DIAGNOSE_FOUT').slice(0, 60) }) };
  }
}
/** Welke id's bedoelt het verzoek? `ids` (lijst), `categorie`, of `alles`. Altijd gefilterd op het register. */
export function kiesIds(b: Record<string, unknown>): string[] {
  if (Array.isArray(b.ids)) return [...new Set(b.ids.filter(isControleId))].slice(0, MAX_BATCH);
  if (typeof b.categorie === 'string' && CATEGORIEEN.some((c) => c.id === b.categorie)) return CONTROLES.filter((c) => c.cat === (b.categorie as CategorieId)).map((c) => c.id);
  if (b.alles === true) return [...CONTROLE_IDS];
  return [];
}

export function adminDiagnostiekRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const gate = (run: (auth: SessionOk, b: Record<string, unknown>) => Promise<ReturnType<typeof json>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    if (!isEigenaar(auth.user)) {
      const tab = String(b.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'diagnose.lezen'))) return error('TECH_DIAGNOSE_VEREIST', 403);
    }
    return run(auth, b);
  }) as RouterMiddleware;

  return {
    'POST /api/owner/admin/diagnostiek/overzicht': [gate(async () => json(await overzicht()))],
    'POST /api/owner/admin/diagnostiek/historie': [gate(async (_a, b) => json({ historie: await historie({
      controle: typeof b.controle === 'string' ? b.controle : undefined, stand: typeof b.stand === 'string' ? b.stand : undefined,
      categorie: typeof b.categorie === 'string' ? b.categorie : undefined, voor: Number(b.voor) || undefined, limit: Number(b.limit) || 50 }) }))],
    // «Скарга користувача»: zoeken (naam/e-mail) en één gebruiker doorlichten. Alleen metadata; elke inzage komt in het logboek.
    'POST /api/owner/admin/diagnostiek/gebruiker': [gate(async (auth, b) => {
      const limiet = await rateLimit(`admin-diagnostiek-gebruiker:${auth.user.id}`, 60, 600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      if (typeof b.zoek === 'string') return json({ gebruikers: await zoekGebruikers(b.zoek) });
      const id = typeof b.gebruikerId === 'string' ? b.gebruikerId : '';
      const o = await overzicht().catch(() => null);
      const res = await gebruikerControle(id, Object.fromEntries(Object.entries(o?.toestanden ?? {}).map(([k, v]) => [k, v.laatste ? { stand: v.laatste.stand } : undefined])));
      if (!res) return error('GEBRUIKER_ONBEKEND', 404);
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: String(auth.user.email || '') }, doel: { soort: 'account', id }, actie: 'diag.gebruiker.bekeken', categorie: 'diagnose', resultaat: 'success', service: 'admin', eigenaar: id,
        details: { bevindingen: res.bevindingen.filter((x) => x.ernst !== 'info').map((x) => x.code).slice(0, 12) } }).catch((e) => console.error('[admin-diagnostiek] AUDIT MISLUKT:', (e as Error).message));
      await meldInzage({ id: auth.user.id, email: String(auth.user.email || '') }, id, 'gebruiker');
      return json(res);
    })],
    // «Перевірити рендеринг» (22.10.2026): de site start geen browser; ze zet een leeg verzoekbestand in de goedkeur-inbox en root (nazorg-timer,
    // elke minuut) voert `mijn-ruimte-installeer rook-controle` uit. Zonder browser op de server: eerlijk «niet beschikbaar». In het logboek.
    'POST /api/owner/admin/diagnostiek/rendering': [gate(async (auth, b) => {
      const browser = await browserAanwezig();
      const laatste = await leesRook();
      const wachtend = await rookWachtend();
      if (b.aanvragen !== true) return json({ browser: !!browser, wachtend, laatste: laatste ? { tijd: laatste.tijd, modus: laatste.modus, kapot: laatste.kapot, uitgevoerd: laatste.uitgevoerd, samenvatting: laatste.samenvatting, paginas: laatste.paginas, bundels: { aantal: laatste.bundels.aantal, ok: laatste.bundels.ok, kapot: laatste.bundels.kapot.slice(0, 5), waarschuwingen: (laatste.bundels.waarschuwingen || []).slice(0, 5) } } : null });
      if (!browser) return error('ROOK_GEEN_BROWSER', 409);
      const limiet = await rateLimit(`admin-diagnostiek-rendering:${auth.user.id}`, 3, 600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const r = await rookAanvragen();
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: String(auth.user.email || '') }, doel: { soort: 'diagnose', id: 'pagina-rendering', naam: 'rendercontrole' }, actie: 'diag.rendering.aangevraagd', categorie: 'diagnose', resultaat: r.ok ? 'success' : 'failure', service: 'admin', details: { reden: r.reden || '' } })
        .catch((e) => console.error('[admin-diagnostiek] AUDIT MISLUKT:', (e as Error).message));
      if (!r.ok) return error('ROOK_VERZOEK_MISLUKT', 500);
      return json({ ok: true, wachtend: true, browser: true });
    })],
    'POST /api/owner/admin/diagnostiek/uitvoeren': [gate(async (auth, b) => {
      const ids = kiesIds(b);
      if (!ids.length) return error('CHECK_ONBEKEND', 400);
      const limiet = await rateLimit(`admin-diagnostiek:${auth.user.id}`, 20, 600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      if (bezig) return error('DIAGNOSE_BEZIG', 429);
      try {
        const bereik = typeof b.categorie === 'string' ? `categorie:${b.categorie}` : b.alles === true ? 'alles' : 'selectie';
        const { batch, uitslagen } = await serverRonde(ids, { id: auth.user.id, email: String(auth.user.email || '') }, bereik);
        const o = await overzicht();
        return json({ ...o, batch, uitslagen: uitslagen.map((u) => schoonUitslag(u)).filter(Boolean) });
      } catch (e) {
        if ((e as Error).message === 'DIAGNOSE_BEZIG') return error('DIAGNOSE_BEZIG', 429);
        console.error('[admin-diagnostiek]', (e as Error).message);
        return error('DIAGNOSE_FOUT', 500);
      }
    })],
    // «Сервер (для всіх) / Цей акаунт» (backend/diagnostiek-account.ts): het eigen account of een gekozen gebruiker; alleen metadata.
    'POST /api/owner/admin/diagnostiek/account': [gate(async (auth, b) => {
      const id = b.gebruikerId === undefined || b.gebruikerId === '' ? auth.user.id : b.gebruikerId;
      if (!isAccountId(id)) return error('GEBRUIKER_ONBEKEND', 400);
      const kort = await accountKort(id);
      if (!kort) return error('GEBRUIKER_ONBEKEND', 404);
      const uitvoeren = b.uitvoeren === true;
      if (uitvoeren) {
        const limiet = await rateLimit(`admin-diagnostiek-account:${auth.user.id}`, 30, 600);
        if (!limiet.ok) return error('RATE_LIMITED', 429);
        await accountRonde(id, auth.user.id);
      }
      const [o, server] = await Promise.all([accountOverzicht(id), laatsteServerStanden()]);
      const wie = { id: auth.user.id, email: String(auth.user.email || '') };
      await schrijfBeheerAudit({ actor: wie, doel: { soort: 'account', id }, actie: uitvoeren ? 'diag.account.uitgevoerd' : 'diag.account.bekeken', categorie: 'diagnose', resultaat: 'success', service: 'admin', eigenaar: id,
        details: { slecht: o.laatste.filter((u) => u.stand === 'fout' || u.stand === 'let-op').map((u) => `${u.dienst}:${u.code}`).slice(0, 10) } }).catch((e) => console.error('[admin-diagnostiek] AUDIT MISLUKT:', (e as Error).message));
      await meldInzage(wie, id, uitvoeren ? 'account-uitgevoerd' : 'account');
      return json({ gebruiker: kort, zelf: id === auth.user.id, rijen: accountTabel(server, o.laatste), historie: o.historie, nu: Date.now() });
    })],
    // «Стан моїх служб» (Налаштування): ALLEEN het eigen account, geen serverkolom, geen andere gebruiker (gebruikerId wordt genegeerd).
    'POST /api/owner/diagnostiek/mijn-diensten': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, 401);
      if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
      const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
      if (b.uitvoeren === true) {
        const limiet = await rateLimit(`mijn-diensten:${auth.user.id}`, 10, 600);
        if (!limiet.ok) return error('RATE_LIMITED', 429);
        await accountRonde(auth.user.id, auth.user.id);
        await schrijfBeheerAudit({ actor: { id: auth.user.id }, doel: { soort: 'account', id: auth.user.id }, actie: 'diag.account.zelf', categorie: 'diagnose', resultaat: 'success', service: auth.service, eigenaar: auth.user.id, details: {} })
          .catch((e) => console.error('[admin-diagnostiek] AUDIT MISLUKT:', (e as Error).message));
      }
      const o = await accountOverzicht(auth.user.id);
      return json({ rijen: accountTabel(null, o.laatste), historie: o.historie, nu: Date.now() });
    }) as RouterMiddleware],
  };
}
