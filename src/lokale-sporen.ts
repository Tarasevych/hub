// SEC-002 (interface-06, 12.11.2026): lokale sporen van een account in deze browser, en het wissen ervan bij afmelden.
//
// Wat hier fout was: na afmelden (ook zonder «Запам'ятати цей акаунт») bleven in localStorage staan
//   - de laatste 50 meldingen van het account, met tekst, details en koppelingen (meldingencentrum);
//   - de recente, de bewaarde en de laatste zoekopdracht in de post;
//   - de lijst «altijd externe beelden van deze afzender».
// De volgende mens achter dezelfde browser (gezin, gedeelde computer — de site kent meerdere accounts per browser) las ze in de
// ontwikkelhulpmiddelen. De privécache van de post en de concepten werden al gewist (src/mail-bijlage-cache.ts); deze niet.
//
// Dit bestand heeft GEEN afhankelijkheden (behalve het even afhankelijkheidsloze ./account-sleutel): het wordt ook geladen door de startpagina (src/App.tsx) en door de privécache van de
// post, die niet aan de canonieke runtime mogen hangen. De modules die de sleutels SCHRIJVEN nemen hun voorvoegsel hiervandaan
// (src/meldingen/lokale-rijen.ts, src/mail-zoek-cache.ts, src/mail/beelden-toestemming.ts): één bron, dus geen sleutel die het
// wissen mist.

import { cacheAccountKey } from './account-sleutel'; // zonder afhankelijkheden (FNV-1a), net als dit bestand

/** Meldingencentrum: `<voorvoegsel><account>` en `<voorvoegsel><account>:technisch`. */
export const MELDINGEN_VOORVOEGSEL = 'tsv:canonical-notification-history-v2:';
/** Voorganger van de meldingenlijst (wordt bij het lezen omgezet); hetzelfde account erachter. */
export const MELDINGEN_OUD_VOORVOEGSEL = 'tsv:canonical-notification-retained-v1:';
/** Post: bewaarde, recente en laatste zoekopdracht — `<voorvoegsel><account>`. */
export const ZOEK_BEWAARD_VOORVOEGSEL = 'tsv:mail-saved-searches-v1:';
export const ZOEK_RECENT_VOORVOEGSEL = 'tsv:mail-recent-searches-v1:';
export const ZOEK_LAATST_VOORVOEGSEL = 'tsv:mail-last-search-v1:';
/** Post: «altijd externe beelden van deze afzender» — `<voorvoegsel><encodeURIComponent(account␟mailbox)>`. */
export const BEELDEN_VOORVOEGSEL = 'mail-beelden-afzenders-v2:';
/** Post: regels «смугу не показувати» voor een taal of afzender (STROOK-002, src/mail/strook-regels.ts) — `<voorvoegsel><encodeURIComponent(account␟mailbox)>`. */
export const STROOK_REGELS_VOORVOEGSEL = 'mail-strook-regels-v1:';
/** Post: de echte maat van al getoonde externe beelden (MAILBEELD-003, src/mail/beeld-maten.ts): alleen een hash en breedte × hoogte, geen URL — `<voorvoegsel><encodeURIComponent(account␟mailbox)>`. */
export const MATEN_VOORVOEGSEL = 'mail-beeld-maten-v1:';

/**
 * Notities: lokale concepten — `<voorvoegsel><u-xxxxxxxx>:<prive|technisch>:<id>` (src/notities/notities-client.ts, SEC-002 aanv-ronde1-07).
 * Hier staat NIET het ruwe account-id maar de korte accountsleutel (cacheAccountKey); wisLokaleSporen rekent die zelf uit.
 */
export const NOTITIE_KLAD_VOORVOEGSEL = 'mr-notitie-klad:';

/**
 * Post: de laatst geopende zone van het paneel «Вигляд» in het leesvenster (MAILBEELD-002, src/mail/WeergaveKeuze.tsx). Eén sleutel
 * per apparaat met alleen de naam van een zone ('beelden' | 'lezen' | 'taal' | 'stroken') — geen account erin, dus het afmelden van
 * één account laat hem staan; «overal afmelden» wist hem mee.
 */
export const WEERGAVE_ZONE_SLEUTEL = 'mail-lezer-weergave-zone-v1';

const VOORVOEGSELS = [MELDINGEN_VOORVOEGSEL, MELDINGEN_OUD_VOORVOEGSEL, ZOEK_BEWAARD_VOORVOEGSEL, ZOEK_RECENT_VOORVOEGSEL, ZOEK_LAATST_VOORVOEGSEL, BEELDEN_VOORVOEGSEL, WEERGAVE_ZONE_SLEUTEL, STROOK_REGELS_VOORVOEGSEL, MATEN_VOORVOEGSEL, NOTITIE_KLAD_VOORVOEGSEL] as const;
const SCHEIDING = '\u001f';

/** Modules met een kopie in het geheugen (de lijst met afzenders) melden zich hier aan: na het wissen vergeten zij hun kopie. */
export const naWissen = new Set<() => void>();

type Opslag = { length: number; key: (i: number) => string | null; removeItem: (k: string) => void; getItem?: (k: string) => string | null };
const opslagNu = (): Opslag | null => { try { return typeof localStorage === 'undefined' ? null : (localStorage as unknown as Opslag); } catch { return null; } };
const sleutels = (o: Opslag): string[] => {
  const uit: string[] = [];
  try { for (let i = 0; i < Number(o.length || 0); i += 1) { const k = o.key(i); if (typeof k === 'string') uit.push(k); } } catch { /* opslag niet opsombaar */ }
  return uit;
};
const ontcijfer = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };

/** Hoort de rest van een sleutel (na het voorvoegsel) bij dit account? Het account-id staat er heel in, begrensd door ':' of ␟. */
export function sleutelRestVanAccount(rest: string, ownerUserId: string): boolean {
  const id = String(ownerUserId || '');
  if (!id || id === 'anon') return false;
  const r = ontcijfer(String(rest || ''));
  if (r === id) return true;
  for (const voor of ['', ':']) for (const na of [':', SCHEIDING]) {
    const stuk = `${voor}${id}${na}`;
    if (voor ? r.includes(stuk) : r.startsWith(stuk)) return true;
  }
  return r.endsWith(`:${id}`);
}

function wis(kies: (rest: string) => boolean, opslag: Opslag | null): number {
  if (!opslag) return 0;
  let n = 0;
  for (const k of sleutels(opslag)) {
    const voorvoegsel = VOORVOEGSELS.find((v) => k.startsWith(v));
    if (!voorvoegsel || !kies(k.slice(voorvoegsel.length))) continue;
    try { opslag.removeItem(k); n += 1; } catch { /* privévenster */ }
  }
  // ook bij n = 0: een module kan iets in het geheugen hebben dat nog niet weggeschreven is (MAILBEELD-003: maten wachten 800 ms) —
  // anders schreef die het na het afmelden alsnog weg. De luisteraars vergeten alleen hun kopie; dat is altijd veilig.
  for (const f of naWissen) { try { f(); } catch { /* een luisteraar mag het wissen niet breken */ } }
  return n;
}

/**
 * Wis de lokale sporen van ÉÉN account (afmelden zonder «Запам'ятати цей акаунт», account vergeten of verwijderd): zijn meldingen,
 * zijn zoekopdrachten in de post en zijn lijst «altijd beelden van deze afzender». Andere accounts in deze browser blijven staan.
 * Geeft het aantal gewiste sleutels.
 */
export function wisLokaleSporen(ownerUserId: string, opslag: Opslag | null = opslagNu()): number {
  const id = String(ownerUserId || '');
  if (!id || id === 'anon') return 0;
  // De conceptsleutels van de notities dragen de korte accountsleutel (u-xxxxxxxx), niet het id zelf.
  const kort = cacheAccountKey(id);
  return wis((rest) => sleutelRestVanAccount(rest, id) || (kort !== 'anon' && rest.startsWith(`${kort}:`)), opslag);
}
/**
 * Beleid «Запам'ятати цей акаунт» van dit account in deze browser — dezelfde sleutel als POLICY in src/mail-bijlage-cache.ts
 * ('remembered' | 'session'; gezet door setMailPrivateCacheRemembered bij elke aanmelding in de diensten).
 */
export const ONTHOUD_BELEID_VOORVOEGSEL = 'tsv-mail-cache-policy-v1:';
/**
 * Afmelden van één account op een pagina die zelf niet weet of het account onthouden is (de startpagina, src/App.tsx): wis de
 * sporen, tenzij het account uitdrukkelijk onthouden is — dan gedraagt het zich als in src/VerenigdDienstApp.tsx (daar wist
 * endMailPrivateCacheSession alleen zonder «onthouden»). Geen beleid bekend = niet onthouden = wissen (privacy eerst).
 */
export function wisLokaleSporenBijAfmelden(ownerUserId: string, opslag: Opslag | null = opslagNu()): number {
  const id = String(ownerUserId || '');
  if (!id || id === 'anon') return 0;
  try { if (opslag?.getItem?.(`${ONTHOUD_BELEID_VOORVOEGSEL}${id}`) === 'remembered') return 0; } catch { /* opslag onleesbaar: wissen */ }
  return wisLokaleSporen(id, opslag);
}
/** «Alle accounts afmelden» / «overal uitloggen»: de lokale sporen van ALLE accounts in deze browser. */
export function wisAlleLokaleSporen(opslag: Opslag | null = opslagNu()): number {
  return wis(() => true, opslag);
}
