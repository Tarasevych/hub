// LOGO'S EN FOTO'S VAN AFZENDERS — DE SERVERDIENST (migratie 0093; regels in shared/merk-bron.ts).
//
// Besluit van de eigenaar (21.10.2026): «знайди … публічні фото їх логотипів і збережи в базу … До офіційних адрес / від кого
// щось прийшло — також мають бути заповнені … Якщо акаунти Google або інші видають фото відправника — вони також мають
// відображатися в нас на сервісі.»
//
// WAT DE SERVER OPHAALT, EN IN WELKE VOLGORDE
//   Logo van een domein (app.merk_beeld, publiek, één keer voor de hele site):
//     1. BIMI        DNS TXT `default._bimi.<domein>` → `l=` (https, SVG Tiny PS) — wat Gmail/Yahoo zelf als merklogo tonen;
//     2. de website  https://<domein>/ → <link rel=icon|apple-touch-icon> (≥ 128 px of SVG) → manifest-iconen (≥ 128 px) → kleinere
//                    <link>-iconen;
//     3. favicon     https://<domein>/favicon.ico, als laatste.
//     Elk stap eerst voor het domein zelf, dan voor zijn organisatiedomein (mail.ukr.net → ukr.net).
//   Foto van een mens (app.afzender_beeld, per gebruiker en ruimte):
//     • Google-contacten (People API: connections + otherContacts, alleen lezen; `default: true` = letterplaatje → overgeslagen) —
//       alleen als de mens dat in de instellingen van de post aanzet ÉN Google de extra toestemming gaf;
//     • Gravatar — alleen als de mens het aanzet (standaard UIT: de SHA-256 van het adres gaat dan naar een derde);
//     • vCard (PHOTO in een meegestuurde .vcf) — via afzenderBeeldUitVcard().
//
// VEILIGHEID VAN ELKE UITGAANDE VERBINDING (veiligOphalen)
//   alleen https · elk adres wordt EERST geresolveerd en gecontroleerd (geen loopback/privé/link-local/CGNAT/ULA/multicast, ook niet
//   als één van de antwoorden zo is) en de verbinding gaat naar EXACT dat gecontroleerde adres (DNS-pinning, geen rebinding) ·
//   omleidingen met de hand, hoogstens 3, en elk doel opnieuw gecontroleerd · 5 s · hoogstens 256 KB (HTML ook) · formaat volgens de
//   HANDTEKENING, SVG door de strenge ontsmetting van shared/merk-eigen.ts · geen cookies, geen Authorization, eigen User-Agent.
//   De browser laadt niets van buiten: hij krijgt een data-URI van deze server.
//
// NIET BLOKKEREND: de routes geven wat er al in de database staat en zetten de rest in een wachtrij (2 tegelijk, hetzelfde domein
// hoogstens eens per 10 minuten). Een mislukte ophaling is een negatieve rij voor 1 dag; een geslaagde is 30 dagen geldig.
import https from 'node:https';
import { createHmac } from 'node:crypto';
import { lookup as dnsLookup, resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import { error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { privateAddress } from './veilige-fetch';
import { parseBimi } from '../shared/mail-afzenders';
import {
  AFZENDER_BEELDEN_MAX, MERK_BEELD_MAX_BYTES, MERK_BEELD_MAX_OMLEIDINGEN, MERK_BEELD_NEGATIEF_MS, MERK_BEELD_TIMEOUT_MS, MERK_BEELD_TTL_MS,
  MERK_DOMEIN_INTERVAL_MS, MERK_HTML_MAX_BYTES, beeldDataUri, controleerBeeld, domeinKandidaten, domeinVanAdres, fotosUitPeople,
  geldigAfzenderAdres, gravatarUrl, iconenUitHtml, iconenUitManifest, isGoogleFotoHost, isGratisDomein, kandidatenVolgorde, merkDomeinVan,
  probeToegestaan, sha256Hex, vcardFoto, type BeeldUitslag, type IcoonKandidaat, type MerkBron, type MerkMime,
} from '../shared/merk-bron';
import type { Lade } from '../shared/ruimte-scheiding';
import { MERK_DOMEINEN } from '../shared/merk-domeinen';
import { ladeVereist, mailboxenInLade, MailRuimteFout, metLade } from './mail-ruimte';
import { isIngeschakeld, journaalTellen, ontzegelMetDek, registreerHerversleutelaar, sleutelOpen, verzegelMetDek } from './sleutelkluis';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { isEigenaar } from './tech-profiel';

const sys = () => getPool('systeem');
export const MERK_UA = 'MijnRuimte-merkbron/1 (self-hosted; logo van uw domein voor de mailweergave)';
export class MerkBronFout extends Error { constructor(public code: string) { super(code); } }
const codeVan = (e: unknown): string => {
  if (e instanceof MerkBronFout) return e.code;
  const c = String((e as { code?: string } | null)?.code || '');
  if (/ENOTFOUND|EAI_AGAIN|ENODATA|ESERVFAIL/.test(c)) return 'DNS_FOUT';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/.test(c)) return 'TLS_FOUT';
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE/.test(c)) return 'VERBINDING_FOUT';
  if (/ETIMEDOUT|TIMEOUT/.test(c)) return 'TIJD_OM';
  return 'OPHALEN_FOUT';
};
const metTijd = <T>(p: Promise<T>, ms: number, code = 'TIJD_OM'): Promise<T> => new Promise((ok, nee) => {
  const t = setTimeout(() => nee(new MerkBronFout(code)), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); nee(e); });
});

// ------------------------------------------------------------------------------------------------ het netwerk (vervangbaar in tests)
export type MerkNet = {
  /** TXT-records (node:dns/promises → resolveTxt). */
  txt(naam: string): Promise<string[][]>;
  /** ALLE adressen van een host (A en AAAA); de verbinding gaat naar het eerste, maar ALLE moeten publiek zijn. */
  adressen(host: string): Promise<Array<{ address: string; family: number }>>;
  /** ALLEEN VOOR TESTS: het gecontroleerde (publieke) adres en de poort → die van de nabootser (127.0.0.1:…). In productie leeg. */
  verbindMet?: (adres: string, poort: number) => { adres: string; poort: number };
  /** ALLEEN VOOR TESTS: de CA van de nabootser. In productie: de gewone vertrouwde CA's van Node. */
  ca?: string;
};
const standaardNet: MerkNet = {
  txt: (naam) => metTijd(resolveTxt(naam), MERK_BEELD_TIMEOUT_MS),
  adressen: (host) => metTijd(dnsLookup(host, { all: true, verbatim: true }), MERK_BEELD_TIMEOUT_MS),
};
let net: MerkNet = standaardNet;
/** Alleen voor tests: een DNS/HTTPS-nabootser. `null` = terug naar het echte netwerk. */
export function _zetMerkNet(n: Partial<MerkNet> | null): void { net = n ? { ...standaardNet, ...n } : standaardNet; }

type Antwoord = { url: string; status: number; type: string; inhoud: Buffer; locatie: string };
function eenVerzoek(u: URL, adres: string, accept: string, max: number): Promise<Antwoord> {
  return new Promise((resolve, reject) => {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const poort = u.port ? Number(u.port) : 443;
    const naar = net.verbindMet ? net.verbindMet(adres, poort) : { adres, poort };
    const doel = naar.adres;
    const familie = isIP(doel) || 4;
    let klaar = false;
    const af = (e: Error | null, v?: Antwoord) => { if (klaar) return; klaar = true; clearTimeout(klok); if (e) reject(e); else resolve(v!); };
    const req = https.request({
      protocol: 'https:', host, port: naar.poort, path: `${u.pathname}${u.search}`, method: 'GET',
      servername: isIP(host) ? undefined : host,
      // Geen cookies, geen Authorization: alleen wat een anonieme bezoeker ook stuurt.
      headers: { 'User-Agent': MERK_UA, Accept: accept, 'Accept-Encoding': 'identity', 'Accept-Language': 'uk,nl;q=0.8,en;q=0.5' },
      // DNS-PINNING: de socket verbindt met het adres dat hierboven gecontroleerd is, niet met een nieuw DNS-antwoord.
      lookup: ((_h: string, o: unknown, cb: (e: Error | null, a: unknown, f?: number) => void) => {
        if (o && typeof o === 'object' && (o as { all?: boolean }).all) cb(null, [{ address: doel, family: familie }]); else cb(null, doel, familie);
      }) as never,
      agent: false, ca: net.ca, timeout: MERK_BEELD_TIMEOUT_MS,
    }, (res) => {
      const status = res.statusCode || 0;
      const locatie = String(res.headers.location || '');
      if (status >= 300 && status < 400) { res.resume(); return af(null, { url: u.toString(), status, type: '', inhoud: Buffer.alloc(0), locatie }); }
      if (Number(res.headers['content-length'] || 0) > max) { res.destroy(); return af(new MerkBronFout('TE_GROOT')); }
      const delen: Buffer[] = []; let n = 0;
      res.on('data', (c: Buffer) => { n += c.length; if (n > max) { res.destroy(); af(new MerkBronFout('TE_GROOT')); return; } delen.push(c); });
      res.on('end', () => af(null, { url: u.toString(), status, type: String(res.headers['content-type'] || '').toLowerCase(), inhoud: Buffer.concat(delen), locatie }));
      res.on('error', (e) => af(new MerkBronFout(codeVan(e))));
    });
    const klok = setTimeout(() => req.destroy(new MerkBronFout('TIJD_OM')), MERK_BEELD_TIMEOUT_MS);
    req.on('timeout', () => req.destroy(new MerkBronFout('TIJD_OM')));
    req.on('error', (e) => af(e instanceof MerkBronFout ? e : new MerkBronFout(codeVan(e))));
    req.end();
  });
}

/**
 * Eén bestand ophalen met alle grenzen van de kop van dit bestand. Gooit MerkBronFout met een code (ALLEEN_HTTPS, PRIVE_ADRES,
 * DNS_FOUT, TE_GROOT, TIJD_OM, TE_VEEL_OMLEIDINGEN …). Een 4xx/5xx is GEEN fout maar een antwoord: de aanroeper beslist.
 */
export async function veiligOphalen(start: string, accept: string, max = MERK_BEELD_MAX_BYTES, eigen?: readonly string[]): Promise<Antwoord> {
  let url = start;
  for (let sprong = 0; ; sprong++) {
    if (eigen && eigen.length) {
      const poort = probeToegestaan(url, eigen);
      if (!poort.ok) throw new MerkBronFout(poort.reden === 'NIET_TOEGESTAAN' ? 'NIET_TOEGESTAAN' : poort.reden === 'PRIVE_ADRES' ? 'PRIVE_ADRES' : 'URL_ONGELDIG');
    }
    let u: URL;
    try { u = new URL(url); } catch { throw new MerkBronFout('URL_ONGELDIG'); }
    if (u.protocol !== 'https:') throw new MerkBronFout('ALLEEN_HTTPS');
    if (u.username || u.password) throw new MerkBronFout('URL_ONGELDIG');
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    let adressen: Array<{ address: string; family: number }>;
    if (isIP(host)) adressen = [{ address: host, family: isIP(host) }];
    else {
      if (!merkDomeinVan(host)) throw new MerkBronFout('URL_ONGELDIG');
      try { adressen = await net.adressen(host); } catch (e) { throw new MerkBronFout(e instanceof MerkBronFout ? e.code : 'DNS_FOUT'); }
    }
    if (!adressen.length) throw new MerkBronFout('DNS_FOUT');
    // ÉÉN niet-publiek antwoord is genoeg om te weigeren (anders kiest een volgende poging misschien dat adres).
    if (adressen.some((a) => privateAddress(a.address))) throw new MerkBronFout('PRIVE_ADRES');
    const r = await eenVerzoek(u, adressen[0].address, accept, max);
    if (r.status >= 300 && r.status < 400) {
      if (!r.locatie) throw new MerkBronFout('OMLEIDING_ZONDER_DOEL');
      if (sprong >= MERK_BEELD_MAX_OMLEIDINGEN) throw new MerkBronFout('TE_VEEL_OMLEIDINGEN');
      try { url = new URL(r.locatie, u).toString(); } catch { throw new MerkBronFout('URL_ONGELDIG'); }
      continue;
    }
    return r;
  }
}

// ------------------------------------------------------------------------------------------------ het logo van een domein zoeken
export type GevondenLogo = { bron: MerkBron; mime: MerkMime; inhoud: Buffer; url: string; domein: string };
const beeld = async (url: string, alleen?: readonly MerkMime[], eigen: readonly string[] = []): Promise<{ ok: true; mime: MerkMime; inhoud: Buffer; url: string } | { ok: false; reden: string }> => {
  try {
    if (eigen.length) {
      const poort = probeToegestaan(url, eigen);
      if (!poort.ok) return { ok: false, reden: poort.reden };
    }
    const r = await veiligOphalen(url, alleen?.length === 1 && alleen[0] === 'image/svg+xml' ? 'image/svg+xml' : 'image/avif;q=0,image/webp,image/png,image/svg+xml,image/*;q=0.8', MERK_BEELD_MAX_BYTES, eigen.length ? eigen : undefined);
    if (r.status !== 200) return { ok: false, reden: r.status === 404 ? 'NIET_GEVONDEN' : `HTTP_${Math.min(599, Math.max(100, r.status))}` };
    const c: BeeldUitslag = controleerBeeld(r.inhoud, alleen);
    return c.ok ? { ok: true, mime: c.mime, inhoud: c.inhoud, url: r.url } : c;
  } catch (e) { return { ok: false, reden: codeVan(e) }; }
};

/** Zoekt het logo van een domein (BIMI → website → favicon; telkens domein, dan organisatiedomein). Geen database. */
export async function zoekLogo(domein: string): Promise<GevondenLogo | { fout: string }> {
  const kandidaten = domeinKandidaten(domein);
  if (!kandidaten.length) return { fout: 'DOMEIN_ONGELDIG' };
  let fout = 'GEEN_LOGO';
  const noteer = (r: string) => { if (fout === 'GEEN_LOGO' || r === 'PRIVE_ADRES' || /^SVG_/.test(r)) fout = r; };
  // 1. BIMI
  for (const d of kandidaten) {
    let records: string[][] = [];
    try { records = await net.txt(`default._bimi.${d}`); } catch { continue; }
    const b = parseBimi(records);
    if (!b.logo) continue;
    const u = await beeld(b.logo, ['image/svg+xml'], [d]);
    if (u.ok) return { bron: 'bimi', mime: u.mime, inhoud: u.inhoud, url: u.url, domein: d };
    noteer(u.reden);
  }
  // 2. de eigen website: <link>-iconen en het manifest
  for (const d of kandidaten) {
    let pagina: Antwoord | null = null;
    try { pagina = await veiligOphalen(`https://${d}/`, 'text/html,application/xhtml+xml;q=0.9', MERK_HTML_MAX_BYTES, [d]); } catch (e) { noteer(codeVan(e)); }
    if (!pagina || pagina.status !== 200) continue;
    const { iconen, manifest } = iconenUitHtml(pagina.inhoud.toString('utf8'), pagina.url);
    let uitManifest: IcoonKandidaat[] = [];
    if (manifest) {
      try {
        const m = await veiligOphalen(manifest, 'application/manifest+json,application/json;q=0.9', 64 * 1024, [d]);
        if (m.status === 200) uitManifest = iconenUitManifest(JSON.parse(m.inhoud.toString('utf8')), m.url);
      } catch (e) { noteer(codeVan(e)); }
    }
    for (const k of kandidatenVolgorde(iconen, uitManifest).slice(0, 5)) {
      const u = await beeld(k.url, undefined, [d]);
      if (u.ok) return { bron: k.soort === 'manifest' ? 'manifest' : 'favicon', mime: u.mime, inhoud: u.inhoud, url: u.url, domein: d };
      noteer(u.reden);
    }
  }
  // 3. /favicon.ico, als laatste
  for (const d of kandidaten) {
    const u = await beeld(`https://${d}/favicon.ico`, undefined, [d]);
    if (u.ok) return { bron: 'favicon', mime: u.mime, inhoud: u.inhoud, url: u.url, domein: d };
    noteer(u.reden);
  }
  return { fout };
}

// ------------------------------------------------------------------------------------------------ app.merk_beeld
export type MerkRij = { sleutel: string; bron: MerkBron | null; mime: MerkMime | null; data: Buffer | null; sha256: string | null; bronUrl: string | null; opgehaald: number; geldigTot: number; fout: string | null };
const rijUit = (r: Record<string, unknown>): MerkRij => ({
  sleutel: String(r.sleutel), bron: (r.bron as MerkBron) || null, mime: (r.mime as MerkMime) || null, data: r.data ? Buffer.from(r.data as Buffer) : null,
  sha256: (r.sha256 as string) || null, bronUrl: (r.bron_url as string) || null, opgehaald: new Date(String(r.opgehaald)).getTime(),
  geldigTot: new Date(String(r.geldig_tot)).getTime(), fout: (r.fout as string) || null,
});
export async function merkRijen(sleutels: readonly string[]): Promise<Map<string, MerkRij>> {
  const lijst = [...new Set(sleutels.filter(Boolean))];
  if (!lijst.length) return new Map();
  const r = await sys().query('SELECT * FROM app.merk_beeld WHERE sleutel = ANY($1::text[])', [lijst]);
  return new Map(r.rows.map((x: Record<string, unknown>) => [String(x.sleutel), rijUit(x)]));
}
/** Een geslaagde ophaling (30 dagen) of een mislukte (1 dag). Mislukt het VERNIEUWEN van een bestaand logo, dan blijft dat oude
 *  logo nog een dag staan (liever een logo van gisteren dan de beginletters). */
export async function merkOpslaan(sleutel: string, g: GevondenLogo | { fout: string }): Promise<void> {
  if ('fout' in g) {
    await sys().query(
      `INSERT INTO app.merk_beeld (sleutel, bron, mime, data, sha256, bron_url, opgehaald, geldig_tot, fout)
       VALUES ($1, NULL, NULL, NULL, NULL, NULL, now(), now() + make_interval(secs => $2), $3)
       ON CONFLICT (sleutel) DO UPDATE SET geldig_tot = now() + make_interval(secs => $2), pogingen = app.merk_beeld.pogingen + 1,
         fout = CASE WHEN app.merk_beeld.data IS NULL THEN EXCLUDED.fout ELSE NULL END,
         opgehaald = CASE WHEN app.merk_beeld.data IS NULL THEN now() ELSE app.merk_beeld.opgehaald END`,
      [sleutel, MERK_BEELD_NEGATIEF_MS / 1000, String(g.fout || 'GEEN_LOGO').replace(/[^A-Z0-9_]/g, '_').slice(0, 60) || 'GEEN_LOGO']);
    return;
  }
  await sys().query(
    `INSERT INTO app.merk_beeld (sleutel, bron, mime, data, sha256, bron_url, opgehaald, geldig_tot, fout, pogingen)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now() + make_interval(secs => $7), NULL, 1)
     ON CONFLICT (sleutel) DO UPDATE SET bron = EXCLUDED.bron, mime = EXCLUDED.mime, data = EXCLUDED.data, sha256 = EXCLUDED.sha256,
       bron_url = EXCLUDED.bron_url, opgehaald = now(), geldig_tot = EXCLUDED.geldig_tot, fout = NULL, pogingen = app.merk_beeld.pogingen + 1`,
    [sleutel, g.bron, g.mime, g.inhoud, sha256Hex(g.inhoud), g.url.length <= 2048 ? g.url : null, MERK_BEELD_TTL_MS / 1000]);
}

// ------------------------------------------------------------------------------------------------ schakelaar van de eigenaar
let schakelaarCache: { aan: boolean; tot: number } | null = null;
/** Mag de server logo's van domeinen ophalen? Geen rij = AAN (standaard). Een databasefout = UIT (dan doen we niets naar buiten). */
export async function domeinOphalenAan(): Promise<boolean> {
  if (schakelaarCache && schakelaarCache.tot > Date.now()) return schakelaarCache.aan;
  let aan = false;
  try { const r = await sys().query(`SELECT aan FROM app.merk_bron_instelling WHERE sleutel = 'afzender-domeinen'`); aan = r.rows.length ? r.rows[0].aan === true : true; }
  catch { aan = false; }
  schakelaarCache = { aan, tot: Date.now() + 10_000 };
  return aan;
}
export async function domeinOphalenZetten(aan: boolean, door: string): Promise<boolean> {
  await sys().query(`INSERT INTO app.merk_bron_instelling (sleutel, aan, gewijzigd_door, gewijzigd_op) VALUES ('afzender-domeinen', $1, $2, now())
    ON CONFLICT (sleutel) DO UPDATE SET aan = EXCLUDED.aan, gewijzigd_door = EXCLUDED.gewijzigd_door, gewijzigd_op = now()`, [aan === true, String(door || '').slice(0, 120)]);
  schakelaarCache = null;
  if (!aan) domeinWachtrij.clear();
  return domeinOphalenAan();
}

// ------------------------------------------------------------------------------------------------ wachtrij (domeinen)
const domeinWachtrij = new Set<string>();
const laatstePoging = new Map<string, number>();
let domeinActief = 0;
const GELIJKTIJDIG = 2;
const WACHTRIJ_MAX = 500;
const wachters = new Set<() => void>();
const meldLeeg = () => { if (!domeinActief && !domeinWachtrij.size && !persoonActief && !persoonWachtrij.size) for (const w of [...wachters]) { wachters.delete(w); w(); } };
/** Hoeveel NIEUWE domeinen één mens per uur in de wachtrij mag zetten (een sessie kan anders de server willekeurige publieke
 *  websites laten opvragen; de mail van een mens heeft er in een uur nooit zoveel nieuwe). */
export const DOMEINEN_PER_UUR = 300;
const emmers = new Map<string, { start: number; n: number }>();
const binnenEmmer = (door: string): boolean => {
  if (!door) return true;
  const nu = Date.now(), e = emmers.get(door);
  if (!e || nu - e.start > 3600_000) { emmers.set(door, { start: nu, n: 1 }); return true; }
  if (e.n >= DOMEINEN_PER_UUR) return false;
  e.n++; return true;
};
/** Zet een domein in de wachtrij (als de eigenaar het toestaat, het domein niet net geprobeerd werd en de mens binnen zijn
 *  uurgrens blijft). true = staat erin. */
export async function domeinInWachtrij(domein: string, door = ''): Promise<boolean> {
  const d = merkDomeinVan(domein);
  if (!d || !(await domeinOphalenAan())) return false;
  if (domeinWachtrij.has(d)) return true;
  const laatst = laatstePoging.get(d) || 0;
  if (Date.now() - laatst < MERK_DOMEIN_INTERVAL_MS || domeinWachtrij.size >= WACHTRIJ_MAX) return false;
  if (!binnenEmmer(door)) return false;
  domeinWachtrij.add(d);
  void domeinWerker();
  return true;
}
async function domeinWerker(): Promise<void> {
  while (domeinActief < GELIJKTIJDIG && domeinWachtrij.size) {
    const d = domeinWachtrij.values().next().value as string;
    domeinWachtrij.delete(d);
    laatstePoging.set(d, Date.now());
    domeinActief++;
    void (async () => {
      try {
        const g = await zoekLogo(d);
        await merkOpslaan(d, g);
        // Gevonden op het organisatiedomein (mail.ukr.net → ukr.net): dat domein heeft dan meteen ook zijn logo.
        if (!('fout' in g) && g.domein !== d) await merkOpslaan(g.domein, g);
      } catch (e) { console.error('[merk-bron] domein', codeVan(e)); }
      finally { domeinActief--; if (domeinWachtrij.size) void domeinWerker(); else meldLeeg(); }
    })();
  }
}
/** Alleen voor tests en de diagnose: wacht tot alle wachtrijen leeg zijn. */
export function wachtrijLeeg(): Promise<void> {
  if (!domeinActief && !domeinWachtrij.size && !persoonActief && !persoonWachtrij.size) return Promise.resolve();
  return new Promise((ok) => wachters.add(ok));
}
/** Alleen voor tests: alle geheugens leeg (frequentiegrens, Google-index, schakelaar). */
export function _merkBronVergeten(): void { laatstePoging.clear(); schakelaarCache = null; googleIndex.clear(); persoonLaatst.clear(); emmers.clear(); }

/** Logo's van deze domeinen uit de database (en wat ontbreekt of verlopen is in de wachtrij). */
/** Logo's van deze domeinen uit de database; wat ontbreekt of verlopen is gaat in de wachtrij. `ophalen` beperkt WELKE domeinen
 *  de server zelf mag gaan halen (de merken-route: alleen de merken van shared/merk-domeinen.ts). */
export async function merkBeelden(domeinen: readonly string[], opties: { door?: string; ophalen?: (d: string) => boolean } = {}): Promise<{ beelden: Map<string, MerkRij>; wachtrij: string[] }> {
  const lijst = [...new Set(domeinen.map(merkDomeinVan).filter(Boolean))].slice(0, AFZENDER_BEELDEN_MAX);
  const rijen = await merkRijen(lijst);
  const beelden = new Map<string, MerkRij>(), wachtrij: string[] = [];
  for (const d of lijst) {
    const r = rijen.get(d);
    if (r?.data) beelden.set(d, r);
    if ((!r || r.geldigTot <= Date.now()) && (!opties.ophalen || opties.ophalen(d))) { if (await domeinInWachtrij(d, opties.door)) wachtrij.push(d); }
  }
  return { beelden, wachtrij };
}

// ------------------------------------------------------------------------------------------------ app.afzender_beeld (persoonlijk)
/** HMAC van het adres met een serverpepper — het adres zelf komt nooit in de tabel. Eigen pepper (AFZENDER_BEELD_PEPPER) of, met
 *  een eigen voorvoegsel, die van het journaal (AUDIT_IP_PEPPER, zonder welke de server niet start). */
export function adresHash(adres: string): string {
  for (const naam of ['AFZENDER_BEELD_PEPPER', 'AUDIT_IP_PEPPER']) {
    const p = String(process.env[naam] || '').trim();
    if (p.length >= 32) return createHmac('sha256', p).update(`afzender-beeld-v1|${String(adres || '').trim().toLowerCase()}`).digest('hex');
  }
  throw new MerkBronFout('PEPPER_ONTBREEKT');
}
const ruimteVan = (l: Lade) => (l.ruimte === 'technisch' ? 'technisch' : 'prive');
const beeldAad = (l: Lade, hash: string, bron: string) => `afzender-beeld|${l.userId}|${ruimteVan(l)}|${hash}|${bron}`;
/** Voorrang als een adres er meer heeft: eigen upload wint, dan Google-contacten, vCard, Gravatar. */
const PERSOON_VOORRANG: readonly MerkBron[] = ['eigen', 'google-contact', 'vcard', 'gravatar'];

export type PersoonBeeld = { bron: MerkBron; mime: MerkMime; inhoud: Buffer } | { gesloten: true };
/** Uitslag van één opslag: 'ok', 'gesloten' (sleutelkluis aan maar dicht: NIETS bewaard, ook niet onversleuteld) of 'fout'. */
export async function persoonOpslaan(lade: Lade, adres: string, bron: MerkBron, u: { mime: MerkMime; inhoud: Buffer; host: string } | { fout: string }): Promise<'ok' | 'gesloten'> {
  const hash = adresHash(adres), ruimte = ruimteVan(lade);
  if ('fout' in u) {
    await sys().query(
      `INSERT INTO app.afzender_beeld (user_id, ruimte, adres_hash, bron, opgehaald, geldig_tot, fout) VALUES ($1, $2, $3, $4, now(), now() + make_interval(secs => $5), $6)
       ON CONFLICT (user_id, ruimte, adres_hash, bron) DO UPDATE SET geldig_tot = EXCLUDED.geldig_tot,
         fout = CASE WHEN app.afzender_beeld.data IS NULL AND app.afzender_beeld.data_versleuteld IS NULL THEN EXCLUDED.fout ELSE NULL END`,
      [lade.userId, ruimte, hash, bron, MERK_BEELD_NEGATIEF_MS / 1000, String(u.fout || 'GEEN_FOTO').replace(/[^A-Z0-9_]/g, '_').slice(0, 60) || 'GEEN_FOTO']);
    return 'ok';
  }
  let data: Buffer | null = u.inhoud, versleuteld: string | null = null;
  if (await isIngeschakeld(lade)) {
    const dek = sleutelOpen(lade);
    if (!dek) { journaalTellen(lade, 'app.afzender_beeld', 'gesloten-overgeslagen'); return 'gesloten'; }
    versleuteld = verzegelMetDek(dek, u.inhoud.toString('base64'), beeldAad(lade, hash, bron));
    data = null;
  }
  await sys().query(
    `INSERT INTO app.afzender_beeld (user_id, ruimte, adres_hash, bron, mime, data, data_versleuteld, sha256, bron_host, opgehaald, geldig_tot, fout)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now() + make_interval(secs => $10), NULL)
     ON CONFLICT (user_id, ruimte, adres_hash, bron) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, data_versleuteld = EXCLUDED.data_versleuteld,
       sha256 = EXCLUDED.sha256, bron_host = EXCLUDED.bron_host, opgehaald = now(), geldig_tot = EXCLUDED.geldig_tot, fout = NULL`,
    [lade.userId, ruimte, hash, bron, u.mime, data, versleuteld, sha256Hex(u.inhoud), /^[a-z0-9.-]{1,253}$/.test(u.host) ? u.host : null, MERK_BEELD_TTL_MS / 1000]);
  return 'ok';
}
type PersoonRij = { adres_hash: string; bron: MerkBron; mime: MerkMime | null; data: Buffer | null; data_versleuteld: string | null; geldig_tot: Date; fout: string | null };
async function persoonRijen(lade: Lade, hashes: string[]): Promise<PersoonRij[]> {
  if (!hashes.length) return [];
  return (await sys().query(`SELECT adres_hash, bron, mime, data, data_versleuteld, geldig_tot, fout FROM app.afzender_beeld
    WHERE user_id = $1 AND ruimte = $2 AND adres_hash = ANY($3::text[])`, [lade.userId, ruimteVan(lade), hashes])).rows as PersoonRij[];
}
/** De foto's van deze adressen in DEZE lade (een rij van de andere ruimte bestaat hier niet). Versleuteld en de sleutel dicht → gesloten. */
export async function persoonBeelden(lade: Lade, adressen: readonly string[]): Promise<Map<string, PersoonBeeld>> {
  const perHash = new Map(adressen.map((a) => [adresHash(a), a] as const));
  const rijen = await persoonRijen(lade, [...perHash.keys()]);
  const uit = new Map<string, PersoonBeeld>();
  const dek = rijen.some((r) => r.data_versleuteld) ? sleutelOpen(lade) : null;
  for (const bron of PERSOON_VOORRANG) {
    for (const r of rijen.filter((x) => x.bron === bron && (x.data || x.data_versleuteld) && x.mime)) {
      const adres = perHash.get(r.adres_hash)!;
      if (uit.has(adres) && !('gesloten' in uit.get(adres)!)) continue;
      if (r.data) { uit.set(adres, { bron, mime: r.mime!, inhoud: Buffer.from(r.data) }); continue; }
      if (!dek) { if (!uit.has(adres)) uit.set(adres, { gesloten: true }); continue; }
      try { uit.set(adres, { bron, mime: r.mime!, inhoud: Buffer.from(ontzegelMetDek(dek, r.data_versleuteld!, beeldAad(lade, r.adres_hash, bron)), 'base64') }); }
      catch { if (!uit.has(adres)) uit.set(adres, { gesloten: true }); }
    }
  }
  return uit;
}
// «Перешифрувати мої дані зараз» (0092): foto's die nog onversleuteld in deze lade staan onder de DEK zetten.
registreerHerversleutelaar('app.afzender_beeld', async (lade, dek) => {
  const l: Lade = { userId: lade.userId, ruimte: lade.ruimte === 'technisch' ? 'technisch' : 'prive' };
  const rijen = (await sys().query(`SELECT adres_hash, bron, data FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = $2 AND data IS NOT NULL`, [l.userId, ruimteVan(l)])).rows as Array<{ adres_hash: string; bron: string; data: Buffer }>;
  let n = 0;
  for (const r of rijen) {
    const env = verzegelMetDek(dek, Buffer.from(r.data).toString('base64'), beeldAad(l, r.adres_hash, r.bron));
    n += (await sys().query(`UPDATE app.afzender_beeld SET data = NULL, data_versleuteld = $5 WHERE user_id = $1 AND ruimte = $2 AND adres_hash = $3 AND bron = $4 AND data IS NOT NULL`,
      [l.userId, ruimteVan(l), r.adres_hash, r.bron, env])).rowCount ?? 0;
  }
  return { gevonden: rijen.length, herversleuteld: n };
});

/** vCard die met een bericht meekwam: de PHOTO daaruit als foto van deze afzender (bron 'vcard'). Nooit een URL ophalen. */
export async function afzenderBeeldUitVcard(lade: Lade, adres: string, vcf: string): Promise<'ok' | 'gesloten' | 'geen'> {
  const a = geldigAfzenderAdres(adres);
  const f = a ? vcardFoto(vcf) : null;
  if (!a || !f || !f.ok) return 'geen';
  return persoonOpslaan(lade, a, 'vcard', { mime: f.mime, inhoud: f.inhoud, host: '' });
}

// ------------------------------------------------------------------------------------------------ voorkeuren van de mens (per lade)
export type Voorkeur = { gravatar: boolean; googleContacten: boolean; googleStand: string; googleOp: number };
export async function voorkeurLezen(lade: Lade): Promise<Voorkeur> {
  try {
    const r = (await sys().query('SELECT gravatar, google_contacten, google_stand, google_op FROM app.afzender_beeld_voorkeur WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)])).rows[0];
    return { gravatar: r?.gravatar === true, googleContacten: r?.google_contacten === true, googleStand: String(r?.google_stand || ''), googleOp: r?.google_op ? new Date(r.google_op).getTime() : 0 };
  } catch { return { gravatar: false, googleContacten: false, googleStand: '', googleOp: 0 }; }
}
/** Aan/uit. UITzetten wist meteen de foto's van die bron in deze lade (gegevensminimalisatie: wat niet meer mag, blijft niet liggen). */
export async function voorkeurZetten(lade: Lade, patch: { gravatar?: unknown; googleContacten?: unknown }): Promise<Voorkeur> {
  const oud = await voorkeurLezen(lade);
  const nieuw = { gravatar: typeof patch.gravatar === 'boolean' ? patch.gravatar : oud.gravatar, googleContacten: typeof patch.googleContacten === 'boolean' ? patch.googleContacten : oud.googleContacten };
  await sys().query(`INSERT INTO app.afzender_beeld_voorkeur (user_id, ruimte, gravatar, google_contacten, gewijzigd_op) VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (user_id, ruimte) DO UPDATE SET gravatar = EXCLUDED.gravatar, google_contacten = EXCLUDED.google_contacten, gewijzigd_op = now()`,
  [lade.userId, ruimteVan(lade), nieuw.gravatar, nieuw.googleContacten]);
  if (oud.gravatar && !nieuw.gravatar) await sys().query(`DELETE FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = $2 AND bron = 'gravatar'`, [lade.userId, ruimteVan(lade)]);
  if (oud.googleContacten && !nieuw.googleContacten) {
    await sys().query(`DELETE FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = $2 AND bron = 'google-contact'`, [lade.userId, ruimteVan(lade)]);
    googleIndex.delete(`${lade.userId}|${ruimteVan(lade)}`);
  }
  return voorkeurLezen(lade);
}
const googleStandZetten = (lade: Lade, stand: string) => sys().query(`UPDATE app.afzender_beeld_voorkeur SET google_stand = $3, google_op = now() WHERE user_id = $1 AND ruimte = $2`, [lade.userId, ruimteVan(lade), stand]).catch(() => undefined);

// ------------------------------------------------------------------------------------------------ Google People API (vervangbaar)
export type GoogleFotoBron = {
  /** De gekoppelde Gmail-accounts van DEZE lade. */
  accounts(lade: Lade): Promise<Array<{ id: string; email: string }>>;
  /** Eén pagina van people.connections.list (personFields) of otherContacts.list (readMask), alleen emailAddresses,photos. */
  pagina(lade: Lade, accountId: string, soort: 'connections' | 'otherContacts', pageToken: string): Promise<{ antwoord: unknown; volgende: string }>;
};
const standaardGoogle: GoogleFotoBron = {
  async accounts(lade) {
    const { verbondenAccounts } = await import('./mail-afzender-bronnen');
    return mailboxenInLade(lade, await verbondenAccounts(lade.userId));
  },
  async pagina(lade, accountId, soort, pageToken) {
    const { fetchMetTijd, tokenVoor } = await import('./mail-afzender-bronnen');
    const token = await tokenVoor(lade.userId, accountId);
    const p = new URLSearchParams(soort === 'connections' ? { personFields: 'emailAddresses,photos', pageSize: '1000' } : { readMask: 'emailAddresses,photos', pageSize: '1000' });
    if (pageToken) p.set('pageToken', pageToken);
    const url = soort === 'connections' ? `https://people.googleapis.com/v1/people/me/connections?${p}` : `https://people.googleapis.com/v1/otherContacts?${p}`;
    const r = await fetchMetTijd(url, { headers: { Authorization: `Bearer ${token}` } }, 10_000);
    if (r.status === 401 || r.status === 403) {
      const t = (await r.text().catch(() => '')).toLowerCase();
      throw new MerkBronFout(/service_disabled|accessnotconfigured|has not been used/.test(t) ? 'GOOGLE_PEOPLE_API_UIT' : 'GOOGLE_FOTO_SCOPE_ONTBREEKT');
    }
    if (!r.ok) throw new MerkBronFout('GOOGLE_FOTO_FOUT');
    const j = await r.json() as { nextPageToken?: string };
    return { antwoord: j, volgende: String(j.nextPageToken || '') };
  },
};
let google: GoogleFotoBron = standaardGoogle;
let googleHostOk: (host: string) => boolean = isGoogleFotoHost;
/** Alleen voor tests: een nagebootste People API. */
export function _zetGoogleFotoBron(b: GoogleFotoBron | null, hostOk?: (host: string) => boolean): void { google = b || standaardGoogle; googleHostOk = hostOk || isGoogleFotoHost; googleIndex.clear(); }

/** Per lade: adres → foto-URL, 6 uur in het GEHEUGEN (nooit in de database: we bewaren alleen foto's van afzenders die de mens ziet). */
const googleIndex = new Map<string, { tot: number; fotos: Map<string, string>; stand: string }>();
const GOOGLE_INDEX_MS = 6 * 60 * 60 * 1000;
async function googleIndexVan(lade: Lade): Promise<{ fotos: Map<string, string>; stand: string }> {
  const k = `${lade.userId}|${ruimteVan(lade)}`, c = googleIndex.get(k);
  if (c && c.tot > Date.now()) return c;
  const fotos = new Map<string, string>();
  let stand = 'ok';
  try {
    const accounts = await google.accounts(lade);
    if (!accounts.length) stand = 'geen-account';
    for (const acc of accounts.slice(0, 5)) {
      for (const soort of ['connections', 'otherContacts'] as const) {
        let token = '';
        for (let n = 0; n < 10; n++) {
          const p = await google.pagina(lade, acc.id, soort, token);
          for (const [a, u] of fotosUitPeople(p.antwoord, googleHostOk)) if (!fotos.has(a)) fotos.set(a, u);
          token = p.volgende;
          if (!token) break;
        }
      }
    }
  } catch (e) {
    const c2 = codeVan(e);
    stand = c2 === 'GOOGLE_FOTO_SCOPE_ONTBREEKT' || c2 === 'GOOGLE_PEOPLE_API_UIT' ? 'scope-ontbreekt' : c2 === 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED' ? 'geen-account' : 'fout';
    if (c2 === 'GOOGLE_PEOPLE_API_UIT') console.error('[merk-bron] People API staat uit in het Google Cloud-project van deze server');
  }
  const uit = { tot: Date.now() + (stand === 'ok' ? GOOGLE_INDEX_MS : 10 * 60_000), fotos, stand };
  googleIndex.set(k, uit);
  void googleStandZetten(lade, stand);
  return uit;
}

/** Na een nieuwe toestemming van Google (of na «зберегти»): de index van deze lade vergeten, zodat de volgende vraag het meteen
 *  opnieuw probeert in plaats van 10 minuten op de vorige weigering te blijven staan. */
export async function googleOpnieuwProberen(lade: Lade): Promise<void> {
  const k = `${lade.userId}|${ruimteVan(lade)}`;
  googleIndex.delete(k);
  for (const pk of [...persoonLaatst.keys()]) if (pk.startsWith(`${k}|`)) persoonLaatst.delete(pk);
  // Het toegangstoken in het geheugen (5 min) draagt nog de OUDE scopes: weg ermee, het volgende verzoek vernieuwt het.
  try { (await import('./mail-afzender-bronnen')).wisTokens(); } catch { /* niets */ }
}

// ------------------------------------------------------------------------------------------------ wachtrij (personen)
type PersoonTaak = { lade: Lade; adressen: Set<string>; gravatar: boolean; google: boolean };
const persoonWachtrij = new Map<string, PersoonTaak>();
const persoonLaatst = new Map<string, number>();
let persoonActief = 0;
function persoonInWachtrij(lade: Lade, adressen: string[], v: Voorkeur): number {
  if (!v.gravatar && !v.googleContacten) return 0;
  const k = `${lade.userId}|${ruimteVan(lade)}`;
  const t = persoonWachtrij.get(k) || { lade, adressen: new Set<string>(), gravatar: v.gravatar, google: v.googleContacten };
  let n = 0;
  for (const a of adressen) {
    const pk = `${k}|${a}`;
    if (Date.now() - (persoonLaatst.get(pk) || 0) < MERK_DOMEIN_INTERVAL_MS || t.adressen.size >= 200) continue;
    persoonLaatst.set(pk, Date.now());
    t.adressen.add(a); n++;
  }
  if (t.adressen.size) persoonWachtrij.set(k, t);
  void persoonWerker();
  return n;
}
async function persoonWerker(): Promise<void> {
  if (persoonActief) return;
  persoonActief = 1;
  try {
    while (persoonWachtrij.size) {
      const [k, t] = persoonWachtrij.entries().next().value as [string, PersoonTaak];
      persoonWachtrij.delete(k);
      await metLade(t.lade, 'mail', () => persoonTaak(t)).catch((e) => console.error('[merk-bron] persoon', codeVan(e)));
    }
  } finally { persoonActief = 0; meldLeeg(); }
}
async function persoonTaak(t: PersoonTaak): Promise<void> {
  const lade = t.lade;
  if (await isIngeschakeld(lade) && !sleutelOpen(lade)) {
    // Sleutelkluis aan maar dicht: niets ophalen (we zouden het toch niet mogen bewaren) — eerlijk melden.
    journaalTellen(lade, 'app.afzender_beeld', 'gesloten-overgeslagen', t.adressen.size);
    if (t.google) void googleStandZetten(lade, 'sleutel-gesloten');
    return;
  }
  const adressen = [...t.adressen];
  const bestaand = await persoonRijen(lade, adressen.map(adresHash));
  const geldig = (a: string, bron: MerkBron) => bestaand.some((r) => r.adres_hash === adresHash(a) && r.bron === bron && new Date(r.geldig_tot).getTime() > Date.now());
  if (t.google) {
    const idx = await googleIndexVan(lade);
    if (idx.stand === 'ok') for (const a of adressen) {
      if (geldig(a, 'google-contact')) continue;
      const url = idx.fotos.get(a);
      if (!url) continue; // geen foto in de contacten: geen rij (de index zelf leeft 6 uur in het geheugen)
      const poort = probeToegestaan(url);
      if (!poort.ok) { await persoonOpslaan(lade, a, 'google-contact', { fout: poort.reden }); continue; }
      const u = await beeld(url, ['image/jpeg', 'image/png', 'image/webp']);
      await persoonOpslaan(lade, a, 'google-contact', u.ok ? { mime: u.mime, inhoud: u.inhoud, host: new URL(u.url).hostname } : { fout: u.reden });
    }
  }
  if (t.gravatar) for (const a of adressen) {
    if (geldig(a, 'gravatar') || geldig(a, 'google-contact')) continue;
    const gurl = gravatarUrl(a);
    const poort = probeToegestaan(gurl);
    if (!poort.ok) { await persoonOpslaan(lade, a, 'gravatar', { fout: poort.reden }); continue; }
    const u = await beeld(gurl, ['image/jpeg', 'image/png', 'image/webp']);
    await persoonOpslaan(lade, a, 'gravatar', u.ok ? { mime: u.mime, inhoud: u.inhoud, host: new URL(u.url).hostname } : { fout: u.reden === 'NIET_GEVONDEN' ? 'GEEN_FOTO' : u.reden });
  }
}

// ------------------------------------------------------------------------------------------------ wat de routes teruggeven
const MAX_ANTWOORD_BYTES = 3 * 1024 * 1024;
export type AfzenderBeeldUit = { adres: string; soort: 'persoon' | 'merk' | 'geen'; data?: string; bron?: MerkBron; domein?: string; sleutel?: 'gesloten' };
/** Voor één lade: per adres de foto van de mens, anders het logo van zijn (niet-gratis) domein, anders niets. Zet wat ontbreekt
 *  in de wachtrijen. Zonder pepper: alleen logo's van domeinen (geen persoonlijke laag). */
export async function afzenderBeelden(lade: Lade, ruw: readonly unknown[]): Promise<{ beelden: AfzenderBeeldUit[]; wachtrij: number; voorkeur: Voorkeur }> {
  const adressen = [...new Set(ruw.map(geldigAfzenderAdres).filter(Boolean))].slice(0, AFZENDER_BEELDEN_MAX);
  const voorkeur = await voorkeurLezen(lade);
  let personen = new Map<string, PersoonBeeld>();
  let pepper = true;
  try { personen = await persoonBeelden(lade, adressen); } catch (e) { if (codeVan(e) === 'PEPPER_ONTBREEKT') pepper = false; else throw e; }
  const domeinen = adressen.map(domeinVanAdres).filter((d) => d && !isGratisDomein(d));
  const kandidaten = [...new Set(domeinen.flatMap((d) => domeinKandidaten(d)))];
  const rijen = await merkRijen(kandidaten);
  let wachtrij = 0, bytes = 0;
  const gevraagd = new Set<string>();
  const beelden: AfzenderBeeldUit[] = [];
  for (const a of adressen) {
    const p = personen.get(a);
    const d = domeinVanAdres(a);
    if (p && !('gesloten' in p) && bytes + p.inhoud.length < MAX_ANTWOORD_BYTES) {
      bytes += p.inhoud.length;
      beelden.push({ adres: a, soort: 'persoon', data: beeldDataUri(p.mime, p.inhoud), bron: p.bron });
      continue;
    }
    const slot: Partial<AfzenderBeeldUit> = p && 'gesloten' in p ? { sleutel: 'gesloten' } : {};
    if (d && !isGratisDomein(d)) {
      const kand = domeinKandidaten(d);
      const r = kand.map((k) => rijen.get(k)).find((x) => x?.data);
      if (r && r.data && r.mime && bytes + r.data.length < MAX_ANTWOORD_BYTES) {
        bytes += r.data.length;
        beelden.push({ adres: a, soort: 'merk', data: beeldDataUri(r.mime, r.data), bron: r.bron || undefined, domein: r.sleutel, ...slot });
      } else beelden.push({ adres: a, soort: 'geen', ...slot });
      if (!gevraagd.has(d)) {
        gevraagd.add(d);
        const eigen = rijen.get(d);
        if ((!eigen || eigen.geldigTot <= Date.now()) && !(r && r.geldigTot > Date.now()) && await domeinInWachtrij(d, lade.userId)) wachtrij++;
      }
    } else beelden.push({ adres: a, soort: 'geen', ...slot });
  }
  if (pepper) {
    const zonder = adressen.filter((a) => !personen.has(a));
    wachtrij += persoonInWachtrij(lade, zonder, voorkeur);
  }
  return { beelden, wachtrij, voorkeur };
}

// ------------------------------------------------------------------------------------------------ routes
type Gebruiker = { id: string; email: string; role?: string; status: string; name?: string; sub?: string };
type SessieOk = { service: string; user: Gebruiker };
type Ctx = { event: Record<string, unknown>; body: unknown };
type Deps = { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieOk | { errorCode: string }> };
const lijf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
/** Kop voor de antwoorden met beelden: privé (per sessie), kort te cachen, en nooit als iets anders dan JSON te lezen. */
const metKoppen = (r: ReturnType<typeof json>) => ({ ...r, headers: { ...(r.headers || {}), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });

export function merkBronRoutes(deps: Deps): Record<string, RouterMiddleware[]> {
  const sessie = async (ctx: Ctx): Promise<SessieOk | null> => {
    const a = await deps.requireSession(ctx.event, ctx.body);
    return 'errorCode' in a || a.user.status !== 'approved' ? null : a;
  };
  const mail = (run: (a: SessieOk, b: Record<string, unknown>, lade: Lade) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const a = await sessie(ctx);
    if (!a || a.service !== 'mail') return error('OWNER_MAIL_SESSION_REQUIRED', 403);
    try { return metKoppen(json({ ok: true, ...(await run(a, lijf(ctx.body), ladeVereist(a.user.id)) as object) })); }
    catch (e) {
      if (e instanceof MailRuimteFout) return error(e.code, e.status);
      const code = codeVan(e);
      if (code === 'SLEUTELKLUIS_GESLOTEN') return error(code, 423);
      console.error('[merk-bron]', code); return error('AFZENDER_BEELD_FOUT', 500);
    }
  }) as RouterMiddleware;
  const beheer = (run: (a: SessieOk, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const a = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in a) return error(a.errorCode, 401);
    if (a.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!isEigenaar(a.user as never)) return error('OWNER_REQUIRED', 403);
    try { return json({ ok: true, ...(await run(a, lijf(ctx.body)) as object) }); }
    catch (e) { console.error('[merk-bron] beheer', codeVan(e)); return error('MERK_BRON_FOUT', 500); }
  }) as RouterMiddleware;

  return {
    // Logo's van merken/domeinen (publiek, geen lade): elke goedgekeurde sessie. Wat ontbreekt gaat in de wachtrij.
    'POST /api/owner/merk-beeld': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const a = await sessie(ctx);
      if (!a) return error('OWNER_APPROVED_SESSION_REQUIRED', 403);
      const ruw = Array.isArray(lijf(ctx.body).domeinen) ? (lijf(ctx.body).domeinen as unknown[]) : [];
      try {
        // Lezen mag voor elk domein dat al in de database staat; zelf gaan HALEN alleen voor de merken van de site.
        const { beelden, wachtrij } = await merkBeelden(ruw.map(String), { door: a.user.id, ophalen: (d) => MERK_DOMEINEN.has(d) });
        let bytes = 0;
        const uit = [...beelden.values()].filter((r) => (bytes += r.data!.length) < MAX_ANTWOORD_BYTES)
          .map((r) => ({ domein: r.sleutel, data: beeldDataUri(r.mime!, r.data!), bron: r.bron, mime: r.mime }));
        return metKoppen(json({ ok: true, beelden: uit, wachtrij, aan: await domeinOphalenAan() }));
      } catch (e) { console.error('[merk-bron] merk-beeld', codeVan(e)); return error('MERK_BEELD_FOUT', 500); }
    }) as RouterMiddleware],
    // Foto's/logo's van afzenders — onder /api/owner/mail/ en dus door de ruimtepoort (backend/mail-ruimte.ts → lade).
    'POST /api/owner/mail/afzender-beelden': [mail(async (_a, b, lade) => afzenderBeelden(lade, Array.isArray(b.adressen) ? b.adressen : []))],
    'POST /api/owner/mail/afzender-beelden/voorkeur': [mail(async (a, b, lade) => {
      const patch = { gravatar: b.gravatar, googleContacten: b.googleContacten };
      const voorkeur = typeof patch.gravatar === 'boolean' || typeof patch.googleContacten === 'boolean' ? await voorkeurZetten(lade, patch) : await voorkeurLezen(lade);
      let googleScope: { gekoppeld: boolean; lezen: boolean; ontbreekt: string[] } = { gekoppeld: false, lezen: false, ontbreekt: [] };
      try { const { googleSuiteFotoScopeStatus } = await import('./google-suite-inrichting'); googleScope = await metLade(lade, 'cloud', () => googleSuiteFotoScopeStatus(a.user.id, a.user.email)); } catch { /* geen Google */ }
      // Toestemming intussen gegeven (terug van het venster van Google)? Dan niet wachten op de vorige weigering.
      if (googleScope.lezen && voorkeur.googleContacten && voorkeur.googleStand !== 'ok') await googleOpnieuwProberen(lade);
      return { voorkeur, google: googleScope, domeinen: await domeinOphalenAan() };
    })],
    // Eigen foto van de mens (3.5): data-URI van deze browser, geen netwerk naar buiten. Opslaan onder bron 'eigen'.
    'POST /api/owner/mail/afzender-beeld/eigen': [mail(async (_a, b, lade) => {
      const adres = geldigAfzenderAdres(b.adres);
      if (!adres) return { fout: 'ADRES_ONGELDIG' };
      if (b.wissen === true) {
        await sys().query(`DELETE FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = $2 AND adres_hash = $3 AND bron = 'eigen'`, [lade.userId, ruimteVan(lade), adresHash(adres)]);
        return { gewist: true, adres };
      }
      const ruw = String(b.data || '');
      const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]{20,})$/i.exec(ruw);
      if (!m) return { fout: 'GEEN_BEELD' };
      const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
      const c = controleerBeeld(buf, ['image/jpeg', 'image/png', 'image/webp']);
      if (!c.ok) return { fout: c.reden };
      const uit = await persoonOpslaan(lade, adres, 'eigen', { mime: c.mime, inhoud: c.inhoud, host: 'eigen' });
      if (uit === 'gesloten') return { fout: 'SLEUTELKLUIS_GESLOTEN' };
      return { opgeslagen: true, adres, data: beeldDataUri(c.mime, c.inhoud), bron: 'eigen' };
    })],
    // vCard die de mens zelf kiest (.vcf). PHOTO-URL wordt nooit opgehaald — alleen ingesloten base64 (vcardFoto).
    'POST /api/owner/mail/afzender-beeld/vcard': [mail(async (_a, b, lade) => {
      const adres = geldigAfzenderAdres(b.adres);
      if (!adres) return { fout: 'ADRES_ONGELDIG' };
      const f = vcardFoto(String(b.vcf || '').slice(0, 512 * 1024));
      if (!f || !f.ok) return { fout: 'GEEN_FOTO' };
      const uit = await persoonOpslaan(lade, adres, 'vcard', { mime: f.mime, inhoud: f.inhoud, host: '' });
      if (uit === 'gesloten') return { fout: 'SLEUTELKLUIS_GESLOTEN' };
      return { opgeslagen: true, adres, data: beeldDataUri(f.mime, f.inhoud), bron: 'vcard' };
    })],
    // Incrementele toestemming van Google (contacts.readonly + contacts.other.readonly) op de bestaande Gmail-koppeling.
    'POST /api/owner/mail/afzender-beelden/google-toestemming': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const a = await sessie(ctx);
      if (!a || a.service !== 'mail') return error('OWNER_MAIL_SESSION_REQUIRED', 403);
      const { googleSuiteStartFotoUitbreiding } = await import('./google-suite-inrichting');
      // Zelfde regel als de gewone Gmail-koppeling: zegt het lichaam niets over de oorsprong, dan die van DIT verzoek (startConsent
      // controleert haar met safeOrigin — een vreemde oorsprong wordt daar alsnog geweigerd).
      const body = { ...lijf(ctx.body) };
      const kop = (ctx.event?.headers && typeof ctx.event.headers === 'object' ? ctx.event.headers : {}) as Record<string, unknown>;
      if (!body.sourceOrigin && typeof kop.origin === 'string') body.sourceOrigin = kop.origin;
      return googleSuiteStartFotoUitbreiding({ service: 'cloud', user: { id: a.user.id, email: String(a.user.email || ''), name: String(a.user.name || ''), status: a.user.status, sub: a.user.sub } } as never, body);
    }) as RouterMiddleware],
    // Beheer (eigenaar, op admin): de schakelaar «логотипи з доменів» en een overzicht van de database.
    'POST /api/owner/admin/merk-bron/stand': [beheer(async () => {
      const t = (await sys().query(`SELECT count(*)::int AS totaal, count(data)::int AS met FROM app.merk_beeld`).catch(() => ({ rows: [{ totaal: 0, met: 0 }] }))).rows[0] || {};
      const per = (await sys().query(`SELECT bron, count(*)::int AS n FROM app.merk_beeld WHERE bron IS NOT NULL GROUP BY bron`).catch(() => ({ rows: [] }))).rows as Array<{ bron: string; n: number }>;
      return { aan: await domeinOphalenAan(), totaal: Number(t.totaal || 0), met: Number(t.met || 0), zonder: Number(t.totaal || 0) - Number(t.met || 0), perBron: Object.fromEntries(per.map((x) => [x.bron, Number(x.n)])), wachtrij: domeinWachtrij.size + domeinActief };
    })],
    'POST /api/owner/admin/merk-bron/zetten': [beheer(async (a, b) => {
      const voor = await domeinOphalenAan();
      const aan = await domeinOphalenZetten(b.aan === true, a.user.id);
      await schrijfBeheerAudit({ actor: { id: a.user.id, email: a.user.email }, doel: { soort: 'instelling', naam: 'merk-bron.afzender-domeinen' }, actie: 'integration.merk-bron.gezet', resultaat: 'success', voor, na: aan });
      return { aan };
    })],
    'POST /api/owner/admin/merk-bron/vernieuwen': [beheer(async (a, b) => {
      const d = merkDomeinVan(b.domein);
      if (!d) return { vernieuwd: false };
      await sys().query('DELETE FROM app.merk_beeld WHERE sleutel = $1', [d]);
      laatstePoging.delete(d);
      await schrijfBeheerAudit({ actor: { id: a.user.id, email: a.user.email }, doel: { soort: 'merk', naam: d }, actie: 'integration.merk-bron.vernieuwd', resultaat: 'success' });
      return { vernieuwd: await domeinInWachtrij(d) };
    })],
  };
}
