// Gegevensbronnen voor «Контакти й відправники» (19.10.2026): Gmail-metadata en DNS. Beide vervangbaar in tests (geen netwerk).
//
//  - Gmail: alleen format=metadata met de koppen From, To, Cc, Bcc, Date en Authentication-Results, plus labelIds (SENT) en
//    internalDate. Nooit de inhoud, nooit het onderwerp. Lijst over ALLE mappen (ook archief en verzonden; spam/prullenbak niet).
//  - DNS: via node:dns (de resolver van de eigen server — self-hosted, geen externe dienst). MX, TXT (SPF), _dmarc (met
//    terugval op het organisatiedomein) en default._bimi. Elke vraag met een time-out; gelijktijdigheid begrensd; resultaat 24 u
//    in het geheugen (gedeeld, alleen publieke DNS-gegevens) en per gebruiker in app.mail_domein_dns (backend/mail-afzenders.ts).
import { Resolver } from 'node:dns/promises';
import { organisatieDomein, parseBimi, parseDmarc, parseSpf, type DnsBewijs } from '../shared/mail-afzenders';

// ------------------------------------------------------------------------------------------------ Gmail (token + verzoeken)
export const fetchMetTijd = async (url: string, init: RequestInit, ms = 15000) => {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
};
/**
 * Foutcode uit een Gmail-antwoord. 403 is bij Gmail dubbelzinnig: «insufficientPermissions» (scope) maar ook
 * «userRateLimitExceeded»/«rateLimitExceeded»/«dailyLimitExceeded» (quota) — en een 403 zonder Gmail-JSON (proxy/herstart) is
 * geen scope-fout. Live-audit 19.10 (F2): elke 403 werd «Бракує дозволу Gmail» en de scan hervatte niet.
 */
export const gmailFout = (status: number, reden = '') => {
  const r = reden.toLowerCase();
  if (status === 401) return 'GOOGLE_MAIL_REAUTH_REQUIRED';
  if (status === 429 || /ratelimit|userratelimit|dailylimit|quota|resource_exhausted/.test(r)) return 'GOOGLE_MAIL_RATE_LIMITED';
  if (status === 403) return /insufficientpermission|access_token_scope_insufficient|permission_denied|accessnotconfigured|insufficient/.test(r) ? 'GOOGLE_MAIL_SCOPE_REQUIRED' : 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE';
  if (status >= 500) return 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE';
  return 'GOOGLE_MAIL_REQUEST_FAILED';
};
/** Zelfde, maar leest de reden uit de JSON-body van het antwoord (error.errors[].reason, error.status, error.message). */
export const gmailFoutVan = async (r: Response) => {
  let reden = '';
  try {
    const tekst = (await r.text()).slice(0, 4000);
    const j = JSON.parse(tekst) as { error?: { status?: string; message?: string; errors?: Array<{ reason?: string }> } };
    reden = [...(j.error?.errors || []).map((e) => e.reason || ''), j.error?.status || '', j.error?.message || ''].join(' ');
  } catch {}
  return gmailFout(r.status, reden);
};
type Account = { id: string; email: string; principalId: string; status: string };
const tokens = new Map<string, { token: string; tot: number }>();
export const wisTokens = () => tokens.clear();
export async function verbondenAccounts(userId: string): Promise<Array<{ id: string; email: string }>> {
  const { googleSuiteMailProviderSnapshot } = await import('./google-suite-inrichting');
  const s = await googleSuiteMailProviderSnapshot(userId) as unknown as { accounts?: Account[] };
  return (s.accounts || []).filter((a) => a.status === 'connected').map((a) => ({ id: String(a.id), email: String(a.email || '').toLowerCase() }));
}
export async function tokenVoor(userId: string, accountId: string) {
  const sleutel = `${userId}|${accountId}`, oud = tokens.get(sleutel);
  if (oud && oud.tot > Date.now()) return oud.token;
  const { googleSuiteMailProviderSnapshot, googleSuitePrincipalAccessToken } = await import('./google-suite-inrichting');
  const s = await googleSuiteMailProviderSnapshot(userId) as unknown as { accounts?: Account[]; account?: Account | null };
  const acc = (accountId ? (s.accounts || []).find((a) => a.id === accountId) : s.account) || null;
  if (!acc || acc.status !== 'connected') throw new Error('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED');
  const token = await googleSuitePrincipalAccessToken(userId, acc.principalId, 'mail');
  tokens.set(sleutel, { token, tot: Date.now() + 5 * 60_000 });
  return token;
}
const GELDIG_ID = /^[A-Za-z0-9_-]{1,200}$/;

export type ScanKop = { from: string; to: string; cc: string; bcc: string; auth: string[]; tijd: number; labels: string[] };
export type ScanBron = {
  accounts(userId: string): Promise<Array<{ id: string; email: string }>>;
  /** Mailboxadres + geschat totaal (Gmail getProfile.messagesTotal) voor de voortgangsbalk. */
  profiel(userId: string, accountId: string): Promise<{ email: string; totaal: number }>;
  /** Bericht-id's over alle mappen (behalve spam/prullenbak), nieuwste eerst. `q` alleen voor de incrementele controle. */
  lijst(userId: string, accountId: string, pageToken: string, max: number, q?: string): Promise<{ ids: string[]; next: string }>;
  kop(userId: string, accountId: string, messageId: string): Promise<ScanKop | null>;
  /** De mailbox die nu in de mail gekozen is («Відкрити листи від нього» zoekt daar). */
  huidig?(userId: string): Promise<string>;
};
export const gmailScanBron: ScanBron = {
  accounts: verbondenAccounts,
  async huidig(userId) {
    const { googleSuiteMailProviderSnapshot } = await import('./google-suite-inrichting');
    const s = await googleSuiteMailProviderSnapshot(userId) as unknown as { account?: Account | null };
    return String(s.account?.id || '');
  },
  async profiel(userId, accountId) {
    const token = await tokenVoor(userId, accountId);
    const r = await fetchMetTijd('https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress,messagesTotal', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(await gmailFoutVan(r));
    const d = await r.json() as { emailAddress?: string; messagesTotal?: number };
    return { email: String(d.emailAddress || '').toLowerCase(), totaal: Math.max(0, Number(d.messagesTotal || 0)) };
  },
  async lijst(userId, accountId, pageToken, max, q) {
    const token = await tokenVoor(userId, accountId);
    const p = new URLSearchParams({ maxResults: String(max), includeSpamTrash: 'false', fields: 'messages/id,nextPageToken' });
    if (pageToken) p.set('pageToken', pageToken);
    if (q) p.set('q', q);
    const r = await fetchMetTijd(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(await gmailFoutVan(r));
    const d = await r.json() as { messages?: Array<{ id?: string }>; nextPageToken?: string };
    return { ids: (d.messages || []).map((m) => String(m.id || '')).filter((id) => GELDIG_ID.test(id)), next: String(d.nextPageToken || '') };
  },
  async kop(userId, accountId, messageId) {
    if (!GELDIG_ID.test(messageId)) return null;
    const token = await tokenVoor(userId, accountId);
    const p = new URLSearchParams({ format: 'metadata', fields: 'id,internalDate,labelIds,payload/headers' });
    for (const naam of ['From', 'To', 'Cc', 'Bcc', 'Date', 'Authentication-Results']) p.append('metadataHeaders', naam);
    const r = await fetchMetTijd(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(await gmailFoutVan(r));
    const d = await r.json() as { internalDate?: string; labelIds?: string[]; payload?: { headers?: Array<{ name?: string; value?: string }> } };
    const h = d.payload?.headers || [];
    const van = (naam: string) => h.filter((x) => String(x.name || '').toLowerCase() === naam.toLowerCase()).map((x) => String(x.value || ''));
    return { from: van('From')[0] || '', to: van('To').join(', '), cc: van('Cc').join(', '), bcc: van('Bcc').join(', '), auth: van('Authentication-Results'),
      tijd: Number(d.internalDate || 0) || Date.parse(van('Date')[0] || '') || 0, labels: (d.labelIds || []).map(String).slice(0, 50) };
  },
};

// ------------------------------------------------------------------------------------------------ DNS
export type DnsBron = {
  mx(naam: string): Promise<Array<{ exchange: string; priority: number }>>;
  txt(naam: string): Promise<string[][]>;
};
export const DNS_TIMEOUT_MS = 2500, DNS_GELIJKTIJDIG = 4, DNS_CACHE_MS = 24 * 3600_000;
const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
const standaardDns: DnsBron = { mx: (n) => resolver.resolveMx(n), txt: (n) => resolver.resolveTxt(n) };
let dns: DnsBron = standaardDns;
const cache = new Map<string, { v: DnsBewijs; tot: number }>();
/** Alleen voor tests: een nep-DNS (en de cache leeg). `null` = terug naar node:dns. */
export function zetDnsBron(b: DnsBron | null) { dns = b || standaardDns; cache.clear(); }
export const dnsCacheGrootte = () => cache.size;

type Antwoord<T> = { ok: true; v: T } | { ok: false; code: 'GEEN' | 'NXDOMAIN' | 'TIMEOUT' | 'FOUT' };
async function vraag<T>(f: () => Promise<T>): Promise<Antwoord<T>> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    // Eigen bovengrens bovenop die van de resolver: één trage naamserver houdt de controle nooit op.
    const v = await Promise.race([f(), new Promise<never>((_, nee) => { t = setTimeout(() => nee(Object.assign(new Error('t'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS * 2 + 200); })]);
    return { ok: true, v };
  } catch (e) {
    const code = String((e as { code?: string }).code || '');
    if (code === 'ENODATA') return { ok: false, code: 'GEEN' };
    if (code === 'ENOTFOUND') return { ok: false, code: 'NXDOMAIN' };
    if (code === 'ETIMEOUT' || code === 'ECONNREFUSED') return { ok: false, code: 'TIMEOUT' };
    return { ok: false, code: 'FOUT' };
  } finally { if (t) clearTimeout(t); }
}
const GELDIG_DOMEIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

/** DNS-bewijs voor één domein (uit de cache als die jonger is dan 24 u). Nooit een uitzondering: fouten staan in `fout`. */
export async function domeinDns(domeinRuw: string, nu = Date.now()): Promise<DnsBewijs> {
  const domein = domeinRuw.toLowerCase().replace(/\.$/, '');
  const c = cache.get(domein);
  if (c && c.tot > nu) return c.v;
  const leeg: DnsBewijs = { domein, tijd: nu, fout: '', bestaat: true, mx: 0, spf: '', spfRecord: false, dmarc: '', dmarcRecord: false, dmarcVan: '', dmarcPct: 0, bimi: false, bimiLogo: '', bimiVmc: '' };
  if (!GELDIG_DOMEIN.test(domein)) return { ...leeg, fout: 'DNS_ONGELDIG', bestaat: false };
  const org = organisatieDomein(domein);
  const [mx, txt, dmarc, bimi] = await Promise.all([vraag(() => dns.mx(domein)), vraag(() => dns.txt(domein)), vraag(() => dns.txt(`_dmarc.${domein}`)), vraag(() => dns.txt(`default._bimi.${domein}`))]);
  const uit = { ...leeg };
  const fouten = [mx, txt, dmarc, bimi].filter((a) => !a.ok && (a.code === 'TIMEOUT' || a.code === 'FOUT'));
  if (!mx.ok && mx.code === 'NXDOMAIN' && !txt.ok && txt.code === 'NXDOMAIN') uit.bestaat = false;
  if (mx.ok) uit.mx = mx.v.filter((r) => r.exchange && r.exchange !== '.').length; // «null MX» (RFC 7505) = geen mail
  if (txt.ok) { const s = parseSpf(txt.v); uit.spfRecord = s.record; uit.spf = s.beleid; }
  let d = dmarc.ok ? parseDmarc(dmarc.v) : { record: false, beleid: '' as const, pct: 0 };
  uit.dmarcVan = d.record ? domein : '';
  if (!d.record && org !== domein && uit.bestaat) {
    const o = await vraag(() => dns.txt(`_dmarc.${org}`));
    if (o.ok) { const p = parseDmarc(o.v, true); if (p.record) { d = p; uit.dmarcVan = org; } }
    else if (o.code === 'TIMEOUT' || o.code === 'FOUT') fouten.push(o);
  }
  uit.dmarcRecord = d.record; uit.dmarc = d.beleid; uit.dmarcPct = d.pct;
  if (bimi.ok) { const b = parseBimi(bimi.v); uit.bimi = b.record; uit.bimiLogo = b.logo; uit.bimiVmc = b.vmc; }
  if (fouten.length) uit.fout = fouten.some((f) => !f.ok && f.code === 'TIMEOUT') ? 'DNS_TIMEOUT' : 'DNS_FOUT';
  // Een (deels) mislukte opvraging niet 24 u bewaren: na 10 min opnieuw proberen.
  cache.set(domein, { v: uit, tot: nu + (uit.fout ? 10 * 60_000 : DNS_CACHE_MS) });
  if (cache.size > 20_000) cache.delete(cache.keys().next().value as string);
  return uit;
}

/** Begrensde gelijktijdigheid: `f` over alle items, hoogstens `n` tegelijk. */
export async function beperkt<T, U>(items: readonly T[], n: number, f: (x: T) => Promise<U>): Promise<U[]> {
  const uit: U[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; uit[k] = await f(items[k]); } }));
  return uit;
}
