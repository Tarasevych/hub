// Tweede echte weg naar GitHub: een GitHub App van de EIGENAAR, geïnstalleerd op de repositories die hij kiest.
//
// Verschil met OAuth: er is geen token van een persoon maar een token van een INSTALLATIE. De server ondertekent zelf een
// JWT met de persoonlijke sleutel van de app (RS256, hoogstens 10 minuten geldig), wisselt die in voor een installatietoken
// (≈1 uur) en haalt vóór het verlopen een nieuw token. De persoonlijke sleutel staat alleen versleuteld in de kluis
// (doel «github-app») en komt nooit in een antwoord of een journaalregel.
//
// Bronnen (nagekeken 20.10.2026):
//   docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
//     — RS256; `iat` 60 s in het verleden tegen klokverschil; `exp` ten hoogste 10 minuten vooruit; `iss` = App ID of client id.
//   .../generating-an-installation-access-token-for-a-github-app
//     — GET /app/installations, POST /app/installations/{id}/access_tokens, token verloopt na 1 uur.
import { createSign } from 'node:crypto';
import { appSleutel, bijnaVerlopen, isGeslotenFout, isKoppelingKluisGesloten, koppelingBewaren, koppelingLezen, koppelingToken, koppelingWissen, verzegelVoor, zegelPad, type KoppelingRecord } from './github-koppeling-opslag';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

const API = 'https://api.github.com';
const netwerk = ((input: any, init?: any) => globalThis.fetch(input, init)) as typeof fetch;

export type AppUitkomst<T> = { ok: true; data: T } | { ok: false; fout: string; status: number };
const mis = (fout: string, status = 400): AppUitkomst<never> => ({ ok: false, fout, status });

const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64url');

/**
 * Een ondertekende app-JWT. `iat` ligt 60 seconden terug (klokverschil) en `exp` 9 minuten vooruit — binnen de grens van 10
 * minuten die GitHub stelt. `iss` is het App ID, of de client id als de eigenaar alleen die heeft opgeslagen.
 */
export function appJwt(iss: string, privateKey: string, nu = Date.now()): string {
  const seconden = Math.floor(nu / 1000);
  const kop = b64({ alg: 'RS256', typ: 'JWT' });
  const inhoud = b64({ iat: seconden - 60, exp: seconden + 9 * 60, iss });
  const handtekening = createSign('RSA-SHA256').update(`${kop}.${inhoud}`).sign(privateKey).toString('base64url');
  return `${kop}.${inhoud}.${handtekening}`;
}

type Kop = Record<string, string>;
const jwtKoppen = (jwt: string): Kop => ({ Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' });

async function vraag(pad: string, koppen: Kop, methode = 'GET'): Promise<{ status: number; data: any } | null> {
  try {
    const res = await netwerk(`${API}${pad}`, { method: methode, headers: koppen, signal: AbortSignal.timeout(20_000), redirect: 'error' });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch { return null; }
}

/** De app-JWT van deze eigenaar, of de reden waarom er geen is. */
async function jwtVan(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<AppUitkomst<{ jwt: string; iss: string }>> {
  const ruimte = ruimteOf(ruimteIn);
  const sleutel = await appSleutel(userId, ruimte);
  if (sleutel === null) {
    if (await isKoppelingKluisGesloten(userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);
    return mis('GITHUB_APP_SLEUTEL_ONTBREEKT', 409);
  }
  if (sleutel === 'onleesbaar') return mis('GITHUB_APP_SLEUTEL_ONLEESBAAR', 409);
  const iss = sleutel.appId || sleutel.clientId;
  if (!iss) return mis('GITHUB_APP_SLEUTEL_ONLEESBAAR', 409);
  try { return { ok: true, data: { jwt: appJwt(iss, sleutel.privateKey), iss } }; }
  catch { return mis('GITHUB_APP_SLEUTEL_ONLEESBAAR', 409); }
}

export type Installatie = { id: number; account: string; soort: string; repoKeuze: string };

/** Waar de app van de eigenaar is geïnstalleerd. Dit is wat de kaart toont zodra hij een sleutel heeft opgeslagen. */
export async function appInstallaties(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<AppUitkomst<{ installaties: Installatie[]; appId: string }>> {
  const jwt = await jwtVan(userId, ruimteIn);
  if (!jwt.ok) return jwt;
  const uit = await vraag('/app/installations?per_page=30', jwtKoppen(jwt.data.jwt));
  if (!uit) return mis('GITHUB_UNREACHABLE', 502);
  if (uit.status === 401) return mis('GITHUB_APP_SLEUTEL_ONGELDIG', 401);
  if (uit.status !== 200 || !Array.isArray(uit.data)) return mis(`GITHUB_ERROR_${uit.status}`, 502);
  const installaties = (uit.data as any[]).slice(0, 30).map((rij) => ({
    id: Number(rij?.id) || 0,
    account: String(rij?.account?.login || '').slice(0, 60),
    soort: String(rij?.account?.type || '').slice(0, 20),
    repoKeuze: String(rij?.repository_selection || '').slice(0, 20),
  })).filter((rij) => rij.id > 0);
  return { ok: true, data: { installaties, appId: jwt.data.iss } };
}

/** De repositories waar een installatietoken bij mag. Alleen namen — dit is wat de kaart laat zien. */
export async function appRepos(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<AppUitkomst<{ repos: string[] }>> {
  const token = await appToken(userId, ruimteIn);
  if (!token) return mis('GITHUB_TOKEN_MISSING', 409);
  const uit = await vraag('/installation/repositories?per_page=100', { Authorization: `Bearer ${token.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' });
  if (!uit) return mis('GITHUB_UNREACHABLE', 502);
  if (uit.status !== 200) return mis(uit.status === 401 ? 'GITHUB_TOKEN_INVALID' : `GITHUB_ERROR_${uit.status}`, uit.status === 401 ? 401 : 502);
  const repos = ((uit.data?.repositories ?? []) as any[]).map((r) => String(r?.full_name || '').slice(0, 140)).filter(Boolean).slice(0, 100);
  return { ok: true, data: { repos } };
}

/**
 * Een nieuw installatietoken halen en bewaren. `installatie` 0 betekent: pak de enige (of eerste) installatie van de app —
 * de gewone situatie bij een privé-installatie op het eigen account.
 */
export async function appTokenVernieuwen(userId: string, installatie = 0, ruimteIn: AiRuimte = 'prive'): Promise<AppUitkomst<{ token: string; verlooptOp: number; installatie: number }>> {
  // De LADE waar dit installatietoken in komt (migratie 0086). De route heeft haar al door de poort gehaald
  // (gegevensLade, dienst 'github'); hier wordt alleen in de juiste lade gelezen en bewaard.
  const ruimte = ruimteOf(ruimteIn);
  if (await isKoppelingKluisGesloten(userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);
  const jwt = await jwtVan(userId, ruimte);
  if (!jwt.ok) return jwt;
  let id = Number(installatie) || 0;
  let account = '';
  if (!id) {
    const bestaand = await koppelingLezen(userId, 'app', ruimte);
    id = bestaand?.installatie || 0;
  }
  if (!id) {
    const lijst = await appInstallaties(userId, ruimte);
    if (!lijst.ok) return lijst;
    if (!lijst.data.installaties.length) return mis('GITHUB_APP_GEEN_INSTALLATIE', 409);
    id = lijst.data.installaties[0].id;
    account = lijst.data.installaties[0].account;
  }
  const uit = await vraag(`/app/installations/${id}/access_tokens`, jwtKoppen(jwt.data.jwt), 'POST');
  if (!uit) return mis('GITHUB_UNREACHABLE', 502);
  if (uit.status === 401) return mis('GITHUB_APP_SLEUTEL_ONGELDIG', 401);
  if (uit.status === 404) return mis('GITHUB_APP_GEEN_INSTALLATIE', 409);
  if (uit.status !== 201 || !uit.data?.token) return mis(`GITHUB_ERROR_${uit.status}`, 502);

  const verlooptOp = Date.parse(String(uit.data.expires_at || '')) || Date.now() + 55 * 60 * 1000;
  const repos = Array.isArray(uit.data.repositories) ? (uit.data.repositories as any[]).map((r) => String(r?.full_name || '').slice(0, 140)).filter(Boolean).slice(0, 100) : undefined;
  try {
    await koppelingBewaren(userId, 'app', {
      installatie: id, verlooptOp, tokenZegel: await verzegelVoor(String(uit.data.token), userId, zegelPad('app', ruimte), ruimte),
      ...(account ? { login: account } : {}), ...(repos ? { repos } : {}),
      scopes: Object.keys(uit.data.permissions || {}).slice(0, 30),
    }, ruimte);
  } catch (err) {
    return isGeslotenFout(err) ? mis('SLEUTELKLUIS_GESLOTEN', 423) : mis('GITHUB_KOPPELING_BEWAREN_MISLUKT', 500);
  }
  return { ok: true, data: { token: String(uit.data.token), verlooptOp, installatie: id } };
}

/**
 * Het bruikbare installatietoken, zo nodig eerst vernieuwd. Een installatietoken leeft maar een uur, dus dit is het enige
 * punt waar de rest van de server het mag halen.
 */
export async function appToken(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<{ token: string; record: KoppelingRecord } | null> {
  const ruimte = ruimteOf(ruimteIn);
  const record = await koppelingLezen(userId, 'app', ruimte);
  const bewaarde = record ? await koppelingToken(record, userId).catch(() => null) : null;
  if (record && bewaarde && !bijnaVerlopen(record)) return { token: bewaarde, record };
  // Geen bewaarde weg én geen sleutel in de kluis: deze weg bestaat niet voor deze eigenaar.
  const sleutel = await appSleutel(userId, ruimte);
  if (!sleutel || sleutel === 'onleesbaar') return null;
  const nieuw = await appTokenVernieuwen(userId, record?.installatie || 0, ruimte);
  if (!nieuw.ok) return null;
  const vers = await koppelingLezen(userId, 'app', ruimte);
  return vers ? { token: nieuw.data.token, record: vers } : null;
}

/**
 * Ontkoppelen van deze weg. Een installatietoken kan niet worden ingetrokken (het verloopt binnen een uur); de installatie
 * zelf verwijdert de eigenaar op GitHub. Hier verdwijnt dus het bewaarde token, en de kaart zegt eerlijk wat er nog te doen is.
 */
export async function appOntkoppelen(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<AppUitkomst<{ verwijderd: boolean }>> {
  const verwijderd = await koppelingWissen(userId, 'app', ruimteOf(ruimteIn));
  return { ok: true, data: { verwijderd } };
}
