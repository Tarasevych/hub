// LOGO'S EN FOTO'S VAN AFZENDERS — de zuivere regels (geen netwerk, geen database; de server en de tests lezen dit bestand).
//
// Besluit van de eigenaar (21.10.2026): «До офіційних адрес / від кого щось прийшло — також мають бути заповнені, якщо не з бази
// пошти, то з публічних логотипів цих компаній. Без імітації, а справжні. Якщо акаунти Google або інші видають фото відправника —
// вони також мають відображатися в нас на сервісі.»
//
// Twee soorten beelden, twee tabellen (migratie 0097):
//   • app.merk_beeld    — het LOGO van een domein/merk. Geen persoonsgegeven: publiek, voor de hele site één keer bewaard.
//                         Bron in deze volgorde: BIMI (DNS `default._bimi.<domein>` → `l=` SVG) → de eigen website van het domein
//                         (<link rel=icon|apple-touch-icon>, manifest-iconen ≥ 128 px) → `/favicon.ico` als laatste. Ook het
//                         organisatiedomein (mail.ukr.net → ukr.net).
//   • app.afzender_beeld — de FOTO van één mens/adres (Google-contacten, vCard, Gravatar). Wel een persoonsgegeven: per
//                         (gebruiker, ruimte), het adres alleen als HMAC met een serverpepper, en onder de eigen gegevenssleutel
//                         (DEK) als de sleutelkluis aanstaat.
// De browser haalt NOOIT zelf iets van buiten: alles komt als data-URI van de eigen server (CSP img-src 'self' data:).

import { createHash } from 'node:crypto';
import { ontsmetSvg } from './merk-eigen';
import { organisatieDomein } from './mail-afzenders';
import { GRATIS_MAILBOXEN } from './mail-bekende-afzenders';

export const MERK_BEELD_MAX_BYTES = 256 * 1024;
export const MERK_BEELD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MERK_BEELD_NEGATIEF_MS = 24 * 60 * 60 * 1000;
export const MERK_BEELD_TIMEOUT_MS = 5000;
export const MERK_BEELD_MAX_OMLEIDINGEN = 3;
export const MERK_BEELD_MIN_PX = 128;
export const MERK_HTML_MAX_BYTES = 256 * 1024;
/** SEC-002 (12.11.2026): een SVG van een VREEMDE (BIMI, pictogram van de site van een afzender) mag veel kleiner zijn dan een
 *  logo dat de beheerder zelf oplaadt (200 KB): BIMI raadt ≤ 32 KB aan, en hoe kleiner het vreemde bestand, hoe minder werk
 *  een onbekende de server kan laten doen. */
export const MERK_EXTERN_SVG_MAX_BYTES = 64 * 1024;
/** Eén <link …>-tag in de <head> is nooit langer dan dit; een langere «tag» is geen tag maar rommel (of een aanval). */
export const MERK_LINK_TAG_MAX = 4000;
/** Zoveel <link>-iconen van één pagina bekijken we hooguit (de server haalt er daarna toch maar 5 op). */
export const MERK_LINK_ICONEN_MAX = 100;
export const AFZENDER_BEELDEN_MAX = 50;
/** Zelfde domein niet vaker dan dit opnieuw proberen (ook als de cache leeg is: na een fout, na een herstart). */
export const MERK_DOMEIN_INTERVAL_MS = 10 * 60 * 1000;

export const MERK_BRONNEN = ['bimi', 'vcard', 'gravatar', 'favicon', 'manifest', 'officieel', 'eigen', 'google-contact'] as const;
export type MerkBron = typeof MERK_BRONNEN[number];
export const MERK_MIMES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon'] as const;
export type MerkMime = typeof MERK_MIMES[number];

// ------------------------------------------------------------------------------------------------ domeinen
/** Een hostnaam zoals wij hem willen zien: kleine letters, geen punt aan het eind, ≥ 2 labels, geen IP, geen poort. */
export function merkDomeinVan(v: unknown): string {
  const d = String(v ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (d.length > 253 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) return '';
  if (/^\d+(\.\d+){3}$/.test(d) || /\.(localhost|local|internal|lan|home|arpa)$/.test(d)) return '';
  return d;
}
/** Eerst het domein zelf, dan zijn organisatiedomein (mail.ukr.net → ukr.net; news.bank.com.ua → bank.com.ua). */
export function domeinKandidaten(domein: string): string[] {
  const d = merkDomeinVan(domein);
  if (!d) return [];
  const org = merkDomeinVan(organisatieDomein(d));
  return org && org !== d ? [d, org] : [d];
}
/**
 * SEC-002 / post-06 (12.11.2026): het domein dat de server ZELF mag benaderen voor het logo van een AFZENDER. Het adres in
 * «From» kiest de afzender: met `x@u-<kenmerk van de ontvanger>.volger.example` liet hij de server naar precies DAT subdomein
 * gaan (DNS + HTTPS) zodra de lijst van de post het bericht toonde — een leesbevestiging per ontvanger, nog vóór het bericht
 * geopend is en langs «зовнішні зображення: питати» heen. Daarom: alleen een domein uit de eigen lijsten (`bekend`) wordt
 * letterlijk benaderd; van elk ander adres uitsluitend het organisatiedomein (dat voor alle ontvangers hetzelfde is en maar
 * één keer voor de hele site wordt opgehaald).
 */
export function ophaalDomein(domein: string, bekend: (d: string) => boolean = () => false): string {
  const d = merkDomeinVan(domein);
  if (!d) return '';
  if (bekend(d)) return d;
  return merkDomeinVan(organisatieDomein(d));
}
/** Een adres van een gratis mailbox (gmail.com, ukr.net …) krijgt NOOIT het logo van die dienst als «foto»: dat zou de afzender
 *  voor de dienst zelf laten doorgaan. Daar alleen een echte foto (Google-contact, Gravatar) of de beginletters. */
export const isGratisDomein = (domein: string): boolean => {
  const d = merkDomeinVan(domein);
  return !!d && (GRATIS_MAILBOXEN.includes(d) || GRATIS_MAILBOXEN.includes(organisatieDomein(d)));
};
/** Het domein van een adres, of ''. */
export const domeinVanAdres = (adres: string): string => merkDomeinVan(String(adres || '').split('@')[1] || '');
/** Een geldig adres uit «adres», «<adres>» of «Naam <adres>» (kleine letters), of ''. */
export const geldigAfzenderAdres = (v: unknown): string => {
  const ruw = String(v ?? '').trim().slice(0, 600);
  const m = /<([^<>]+)>\s*$/.exec(ruw);
  const a = (m ? m[1] : ruw).trim().toLowerCase();
  return a.length <= 254 && /^[^\s@<>"]{1,64}@[a-z0-9.-]{3,253}$/.test(a) && domeinVanAdres(a) ? a : '';
};

// ------------------------------------------------------------------------------------------------ URL's
/** Alleen https, geen inloggegevens in de URL, geen fragment. Relatief wordt opgelost tegen `basis`. */
export function veiligeBeeldUrl(v: unknown, basis?: string): string {
  try {
    const u = basis ? new URL(String(v ?? '').trim(), basis) : new URL(String(v ?? '').trim());
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    u.hash = '';
    const s = u.toString();
    return s.length <= 2048 ? s : '';
  } catch { return ''; }
}

/** Bekende fotodiensten. Een willekeurige host (ook een intern adres) hoort hier NIET bij. */
const FOTO_PROVIDERS = new Set([
  'gravatar.com', 'www.gravatar.com', 'secure.gravatar.com',
  '0.gravatar.com', '1.gravatar.com', '2.gravatar.com', '3.gravatar.com',
]);
const isGoogleHost = (h: string) => h === 'googleusercontent.com' || h.endsWith('.googleusercontent.com');
const ipLetterlijk = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
const privéNaam = (h: string) => h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.arpa') || ipLetterlijk(h);

/**
 * Mag deze URL worden opgehaald? Alleen https, geen inloggegevens, geen IP/localhost, en alleen
 * een bekende fotodienst of het eigen domein van de afzender (BIMI / pictogram van die site).
 * Een door de afzender gekozen vreemde host wordt geweigerd — ook als het een publiek adres is.
 */
export function probeToegestaan(url: string, eigenDomeinen: readonly string[] = []): { ok: true; host: string } | { ok: false; reden: 'URL_ONGELDIG' | 'NIET_TOEGESTAAN' | 'PRIVE_ADRES' } {
  let u: URL;
  try { u = new URL(String(url || '')); } catch { return { ok: false, reden: 'URL_ONGELDIG' }; }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, reden: 'URL_ONGELDIG' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host || privéNaam(host)) return { ok: false, reden: 'PRIVE_ADRES' };
  if (FOTO_PROVIDERS.has(host) || isGoogleHost(host)) return { ok: true, host };
  const eigen = eigenDomeinen.map((d) => String(d || '').trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  if (eigen.some((d) => host === d || host.endsWith(`.${d}`))) return { ok: true, host };
  return { ok: false, reden: 'NIET_TOEGESTAAN' };
}

export type IcoonKandidaat = { url: string; px: number; soort: 'icon' | 'apple-touch-icon' | 'manifest'; type: string };
const attrs = (tag: string): Record<string, string> => {
  const uit: Record<string, string> = {};
  // SEC-002 (12.11.2026): de waarde is optioneel in de uitdrukking, zodat een lange naam zonder «=» in ÉÉN keer gelezen wordt
  // (vroeger begon de zoektocht bij elke letter van die naam opnieuw: kwadratisch). Alleen een naam MET waarde telt, als voorheen.
  for (const m of tag.matchAll(/([a-zA-Z:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const waarde = m[2] ?? m[3] ?? m[4];
    if (waarde !== undefined) uit[m[1].toLowerCase()] = waarde.trim();
  }
  return uit;
};
const grootte = (sizes: string, type: string, url: string): number => {
  if (/svg/i.test(type) || /\.svg(\?|$)/i.test(url) || /\bany\b/i.test(sizes)) return 1024;
  let max = 0;
  for (const m of sizes.matchAll(/(\d{1,4})\s*[xX]\s*(\d{1,4})/g)) max = Math.max(max, Math.min(Number(m[1]), Number(m[2])));
  return max;
};
const ontsnap = (v: string) => v.replace(/&amp;/g, '&').replace(/&#x2f;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"');

/**
 * Iconen uit de <head> van een HTML-pagina: <link rel="icon|shortcut icon|apple-touch-icon(-precomposed)">, en het manifest.
 * Alleen https (relatief opgelost tegen de URL van de pagina; een <base href> wordt NIET gevolgd). mask-icon (monochroom
 * Safari-masker) telt niet: dat is geen logo in kleur.
 */
export function iconenUitHtml(html: string, paginaUrl: string): { iconen: IcoonKandidaat[]; manifest: string } {
  const kop = String(html || '').slice(0, MERK_HTML_MAX_BYTES).split(/<\/head\s*>/i)[0];
  const iconen: IcoonKandidaat[] = [];
  let manifest = '';
  // SEC-002 / integraties-01 (12.11.2026): `<link\b[^>]*>` las bij «<link <link <link …» (geen «>») vanaf ELKE «<link» tot het
  // einde van de pagina — 256 KB hield de server bijna 5 seconden vast. Een tag bevat geen «<» en is begrensd in lengte.
  for (const m of kop.matchAll(new RegExp(`<link\\b[^<>]{0,${MERK_LINK_TAG_MAX}}>`, 'gi'))) {
    if (iconen.length >= MERK_LINK_ICONEN_MAX) break;
    const a = attrs(m[0]);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    const href = ontsnap(a.href || '');
    if (!href) continue;
    if (rel.includes('manifest')) { manifest ||= veiligeBeeldUrl(href, paginaUrl); continue; }
    const soort = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed') ? 'apple-touch-icon' : rel.includes('icon') ? 'icon' : '';
    if (!soort) continue;
    const url = veiligeBeeldUrl(href, paginaUrl);
    if (!url) continue;
    const type = (a.type || '').toLowerCase();
    const px = grootte(a.sizes || '', type, url) || (soort === 'apple-touch-icon' ? 180 : 32);
    iconen.push({ url, px, soort, type });
  }
  return { iconen, manifest };
}

/** Iconen uit een web-app-manifest (≥ 128 px; 'monochrome' telt niet; 'any' gaat voor 'maskable'). */
export function iconenUitManifest(json: unknown, manifestUrl: string): IcoonKandidaat[] {
  const lijst = json && typeof json === 'object' && Array.isArray((json as { icons?: unknown }).icons) ? (json as { icons: unknown[] }).icons : [];
  const uit: Array<IcoonKandidaat & { doel: number }> = [];
  for (const i of lijst.slice(0, 40)) {
    if (!i || typeof i !== 'object') continue;
    const r = i as Record<string, unknown>;
    const url = veiligeBeeldUrl(String(r.src || ''), manifestUrl);
    if (!url) continue;
    const doel = String(r.purpose || 'any').toLowerCase();
    if (/monochrome/.test(doel) && !/\bany\b/.test(doel)) continue;
    const type = String(r.type || '').toLowerCase();
    const px = grootte(String(r.sizes || ''), type, url);
    if (px < MERK_BEELD_MIN_PX) continue;
    uit.push({ url, px, soort: 'manifest', type, doel: /\bany\b/.test(doel) ? 0 : 1 });
  }
  return uit.sort((a, b) => a.doel - b.doel || b.px - a.px).map(({ doel: _d, ...k }) => k);
}

/**
 * DE VOLGORDE van de kandidaten op de eigen website: eerst <link>-iconen van ≥ 128 px (of SVG), daarna de manifest-iconen
 * (≥ 128 px), daarna kleinere <link>-iconen. `/favicon.ico` voegt de server pas daarna toe (laatste keus).
 */
export function kandidatenVolgorde(html: IcoonKandidaat[], manifest: IcoonKandidaat[]): IcoonKandidaat[] {
  const groot = html.filter((k) => k.px >= MERK_BEELD_MIN_PX).sort((a, b) => b.px - a.px || (a.soort === 'apple-touch-icon' ? -1 : 1));
  const klein = html.filter((k) => k.px < MERK_BEELD_MIN_PX).sort((a, b) => b.px - a.px);
  const gezien = new Set<string>();
  return [...groot, ...manifest, ...klein].filter((k) => (gezien.has(k.url) ? false : (gezien.add(k.url), true)));
}

// ------------------------------------------------------------------------------------------------ het bestand zelf
/** Het echte formaat uit de eerste bytes (nooit uit Content-Type of de bestandsnaam). */
export function formaatVan(b: Buffer): MerkMime | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && (b[4] | (b[5] << 8)) >= 1) return 'image/x-icon';
  const kop = b.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').replace(/<\?xml[^?]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').trimStart();
  if (/^<svg[\s>]/i.test(kop)) return 'image/svg+xml';
  return null;
}
export type BeeldUitslag = { ok: true; mime: MerkMime; inhoud: Buffer } | { ok: false; reden: string };
/**
 * Mag dit bestand een logo/foto zijn? ≤ 256 KB, een bekend beeldformaat volgens de HANDTEKENING, en een SVG alleen na de
 * strenge ontsmetting van shared/merk-eigen.ts (script, verwijzingen naar buiten, foreignObject … → geweigerd met reden).
 */
export function controleerBeeld(b: Buffer, alleen?: readonly MerkMime[]): BeeldUitslag {
  if (!Buffer.isBuffer(b) || !b.length) return { ok: false, reden: 'LEEG' };
  if (b.length > MERK_BEELD_MAX_BYTES) return { ok: false, reden: 'TE_GROOT' };
  const mime = formaatVan(b);
  if (!mime) return { ok: false, reden: 'GEEN_BEELD' };
  if (alleen && !alleen.includes(mime)) return { ok: false, reden: 'VERKEERD_FORMAAT' };
  if (mime === 'image/svg+xml') {
    if (b.length > MERK_EXTERN_SVG_MAX_BYTES) return { ok: false, reden: 'SVG_TE_GROOT' };
    const u = ontsmetSvg(b);
    if (!u.ok) return { ok: false, reden: `SVG_${u.reden}` };
    return { ok: true, mime, inhoud: u.inhoud };
  }
  if (mime === 'image/png' && b.subarray(12, 16).toString('latin1') !== 'IHDR') return { ok: false, reden: 'GEEN_BEELD' };
  return { ok: true, mime, inhoud: b };
}
export const beeldDataUri = (mime: string, inhoud: Buffer): string => `data:${mime};base64,${inhoud.toString('base64')}`;
export const sha256Hex = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------------------------------------------ vCard
/** PHOTO uit een vCard (2.1/3.0: `PHOTO;ENCODING=b;TYPE=JPEG:<base64>`, 4.0: `PHOTO:data:image/jpeg;base64,…`). Een PHOTO met een
 *  URL wordt NOOIT opgehaald (dat zou de afzender laten weten dat de mail geopend is). */
export function vcardFoto(vcf: string): BeeldUitslag | null {
  const tekst = String(vcf || '').slice(0, 512 * 1024).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const m = /^PHOTO((?:;[^:\r\n]*)?):([^\r\n]*)$/im.exec(tekst);
  if (!m) return null;
  const params = m[1].toLowerCase(), waarde = m[2].trim();
  let b64 = '';
  const data = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(waarde);
  if (data) b64 = data[1];
  else if (/encoding=(b|base64)/.test(params) && /^[A-Za-z0-9+/=\s]+$/.test(waarde)) b64 = waarde;
  if (!b64) return null;
  return controleerBeeld(Buffer.from(b64.replace(/\s+/g, ''), 'base64'), ['image/jpeg', 'image/png', 'image/webp']);
}

// ------------------------------------------------------------------------------------------------ Google People API
/** Een foto-URL van Google mag alleen van Google's eigen beeldserver komen. */
export const isGoogleFotoHost = (host: string): boolean => /(^|\.)googleusercontent\.com$/i.test(String(host || ''));
/**
 * Foto's uit een antwoord van people.connections.list of otherContacts.list: per e-mailadres de URL van de eerste foto die
 * NIET de standaardfoto is (People API: `default: true` = het gegenereerde letterplaatje van Google — dat slaan we over, want
 * dat zou een «foto» zijn die geen foto is). Alleen https op googleusercontent.com.
 */
export function fotosUitPeople(antwoord: unknown, hostOk: (host: string) => boolean = isGoogleFotoHost): Map<string, string> {
  const uit = new Map<string, string>();
  const r = antwoord && typeof antwoord === 'object' ? antwoord as Record<string, unknown> : {};
  const mensen = [r.connections, r.otherContacts].flatMap((x) => (Array.isArray(x) ? x : []));
  for (const p of mensen.slice(0, 2000)) {
    if (!p || typeof p !== 'object') continue;
    const persoon = p as { emailAddresses?: Array<{ value?: string }>; photos?: Array<{ url?: string; default?: boolean; metadata?: { primary?: boolean } }> };
    const fotos = (persoon.photos || []).filter((f) => f && f.default !== true && typeof f.url === 'string');
    const foto = fotos.find((f) => f.metadata?.primary) || fotos[0];
    if (!foto) continue;
    const url = veiligeBeeldUrl(foto.url);
    if (!url || !hostOk(new URL(url).hostname)) continue;
    for (const e of persoon.emailAddresses || []) {
      const a = geldigAfzenderAdres(e?.value);
      if (a && !uit.has(a)) uit.set(a, url);
    }
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ Gravatar
/** Gravatar met de SHA-256 van het (getrimde, kleine-letter) adres; `d=404` = geen plaatje als de mens er geen heeft. */
export const gravatarUrl = (adres: string): string => `https://gravatar.com/avatar/${sha256Hex(String(adres || '').trim().toLowerCase())}?s=128&d=404`;

// Teksten (uk + nl) staan in shared/merk-bron-tekst.ts: die moet ook in de browser kunnen (dit bestand gebruikt node:crypto).
export { MERK_BRON_TEKST } from './merk-bron-tekst';
