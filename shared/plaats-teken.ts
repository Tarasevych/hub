// ЗНАК МІСЦЯ (PLAATS-TEKENS-001, 17.11.2026). Підбирає знак для місця входу: герб міста → герб/прапор провінції чи області →
// прапор країни. Працює однаково в браузері й на сервері; самих даних не тягне — індекс країни (public/merk/plaats/<land>.json)
// передає той, хто викликає (браузер: laadPlaatsIndex у src/merk/merk-plaats.ts; сервер: backend/geo/plaats.ts).
// PLAATSTEKEN: kiest het teken voor een plaats — wapen van de stad → wapen/vlag van de provincie → vlag van het land.
//
// Sleutels (ook de bestandsnaam in public/merk/plaats/):
//   land-<iso2>              vlag van het land (country-flag-icons, 1x1, MIT)
//   regio-<iso 3166-2>       wapen (of vlag) van provincie/oblast/regio, bv. regio-be-vov, regio-ua-46
//   stad-<iso2>-<naam>       wapen van de stad/gemeente, bv. stad-be-gent, stad-ua-lviv
//   <sleutel>.vlag           de vlag van die regio/stad in eigen verhouding (bv. 96×64), naast het wapen (weergave «Ланцюжок»)
//   land-<iso2>.wapen        het wapen van het land (de vlag blijft uit country-flag-icons)

export type PlaatsSoort = 'stad' | 'regio' | 'land';

export type PlaatsIndex = {
  land: string;
  regios: Record<string, { sleutel?: string; wapen?: 1; vlag?: 1; namen: string[]; naam: { uk: string; nl: string }; gn?: string }>;
  steden: Array<{ sleutel?: string; wapen?: 1; vlag?: 1; qid: string; gn?: string; regio: string[]; namen: string[]; naam: { uk: string; nl: string } }>;
  /** Er is een wapen van het land zelf: land-<iso2>.wapen.webp. */
  landWapen?: 1;
};

/**
 * Eén niveau van de plaats voor de weergave «Ланцюжок» (Павло, 18.11.2026): land › regio › stad, elk met vlag én wapen
 * naast elkaar (nooit op elkaar). null = dat teken bestaat niet (de weergave toont dan een lege, gestippelde plek).
 */
export type PlaatsNiveau = {
  soort: PlaatsSoort;
  code?: string;
  naam: { uk: string; nl: string } | null;
  /** Sleutel van de vlag: 'land-ua' (country-flag-icons) of '<sleutel>.vlag' (public/merk/plaats). */
  vlag: string | null;
  /** Sleutel van het wapen: '<sleutel>' of 'land-ua.wapen' (public/merk/plaats). */
  wapen: string | null;
};

export type PlaatsVraag = {
  /** ISO 3166-1 alpha-2 (cf-ipcountry), bv. 'BE'. */
  land?: string | null;
  /** ISO 3166-2 (volledig 'BE-VOV' of alleen het deel na het streepje, zoals cf-region-code 'VOV'). */
  regioCode?: string | null;
  /** Naam van de regio (cf-region), als er geen code is. */
  regio?: string | null;
  /** Naam van de stad (cf-ipcity, in welke taal dan ook). */
  stad?: string | null;
  /** GeoNames-id van de stad, als die bekend is (gaat vóór de naam). */
  geonamesId?: string | number | null;
};

export type PlaatsTeken = { sleutel: string; soort: PlaatsSoort; naam?: { uk: string; nl: string }; code?: string };

export type PlaatsAntwoord = {
  /** Het beste teken (eerste van de keten). */
  teken: PlaatsTeken | null;
  /** De hele keten, van fijn naar grof: stad → regio('s) → land. Elk element heeft een eigen bestand. */
  keten: PlaatsTeken[];
  /** Wat er herkend is (ook zonder teken): handig voor de tekst naast het teken. */
  stad?: { naam: { uk: string; nl: string }; qid: string } | null;
  regios: Array<{ code: string; naam: { uk: string; nl: string } }>;
  /** Van grof naar fijn: land › regio('s) › stad — ook niveaus zonder teken (naam is dan genoeg). */
  niveaus: PlaatsNiveau[];
};

/** Zelfde normalisatie als scripts/plaats-tekens-maken.mjs (normNaam): zonder accenten, kleine letters, alleen letters/cijfers. */
export function normPlaatsNaam(s: unknown): string {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’ʼ`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const LAND = /^[A-Z]{2}$/;
export function landCode(v: unknown): string {
  const c = String(v ?? '').trim().toUpperCase();
  // XX/T1 = onbekend/Tor bij Cloudflare; EU/AP = geen land.
  return LAND.test(c) && !['XX', 'T1', 'EU', 'AP', 'ZZ'].includes(c) ? c : '';
}
export const landTekenSleutel = (land: unknown): string => { const c = landCode(land); return c ? `land-${c.toLowerCase()}` : ''; };

/** Volledige ISO 3166-2-code uit 'VOV', 'be-vov' of 'BE-VOV'. */
export function regioIso(land: string, code: unknown): string {
  const c = String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!c || !land) return '';
  if (c.startsWith(`${land}-`)) return c;
  return /^[A-Z0-9]{1,3}$/.test(c) ? `${land}-${c}` : '';
}

/**
 * Kiest de keten van tekens voor een plaats. Zonder index (land zonder basis) blijft alleen de vlag van het land over.
 * Volgorde (afgesproken met het meldingsontwerp): wapen stad → wapen/vlag provincie (de fijnste eerst) → vlag land.
 */
export function plaatsTekens(vraag: PlaatsVraag, index?: PlaatsIndex | null): PlaatsAntwoord {
  const land = landCode(vraag.land);
  const keten: PlaatsTeken[] = [];
  const regios: PlaatsAntwoord['regios'] = [];
  let stad: PlaatsAntwoord['stad'] = null;
  const fijn: PlaatsNiveau[] = [];
  if (land && index && index.land === land) {
    const gn = String(vraag.geonamesId ?? '').trim();
    const iso = regioIso(land, vraag.regioCode);
    const regioNaam = normPlaatsNaam(vraag.regio);
    let regioCodes = iso && index.regios[iso] ? [iso] : [];
    if (!regioCodes.length && regioNaam) regioCodes = Object.entries(index.regios).filter(([, r]) => r.namen.includes(regioNaam)).map(([c]) => c);

    const naam = normPlaatsNaam(vraag.stad);
    let kandidaten = gn ? index.steden.filter((s) => s.gn === gn) : [];
    if (!kandidaten.length && naam) kandidaten = index.steden.filter((s) => s.namen.includes(naam));
    // Dezelfde naam in meerdere regio's (in Oekraïne vaak): de stad in de bekende regio wint; anders alleen als er één is.
    if (kandidaten.length > 1 && regioCodes.length) {
      const inRegio = kandidaten.filter((s) => s.regio.some((r) => regioCodes.includes(r)));
      if (inRegio.length) kandidaten = inRegio;
    }
    const s = kandidaten.length === 1 ? kandidaten[0] : kandidaten.length > 1 && kandidaten.every((k) => k.sleutel === kandidaten[0].sleutel) ? kandidaten[0] : null;
    if (s) {
      stad = { naam: s.naam, qid: s.qid };
      if (s.sleutel) keten.push({ sleutel: s.sleutel, soort: 'stad', naam: s.naam });
      fijn.push(niveau('stad', s, s.naam));
      // De regio's van de stad zelf (bv. Gent → BE-VOV én BE-VLG): de fijnste (langste code, provincie) eerst.
      for (const r of s.regio) if (!regioCodes.includes(r)) regioCodes.push(r);
    }
    const geordend = [...new Set(regioCodes)].filter((c) => index.regios[c]).sort((a, b) => fijnheid(b, s?.regio) - fijnheid(a, s?.regio));
    for (const c of geordend) {
      const r = index.regios[c];
      regios.push({ code: c, naam: r.naam });
      if (r.sleutel) keten.push({ sleutel: r.sleutel, soort: 'regio', naam: r.naam, code: c });
      fijn.push({ ...niveau('regio', r, r.naam), code: c });
    }
  }
  if (land) {
    keten.push({ sleutel: landTekenSleutel(land), soort: 'land', code: land });
    fijn.push({ soort: 'land', code: land, naam: null, vlag: landTekenSleutel(land), wapen: index?.land === land && index.landWapen ? `${landTekenSleutel(land)}.wapen` : null });
  }
  return { teken: keten[0] ?? null, keten, stad, regios, niveaus: fijn.reverse() };
}

/** Vlag en wapen van een regio/stad uit de index. Oudere indexen zonder «wapen»/«vlag»: het hoofdteken telt als wapen. */
function niveau(soort: PlaatsSoort, x: { sleutel?: string; wapen?: 1; vlag?: 1 }, naam: { uk: string; nl: string }): PlaatsNiveau {
  const oud = x.wapen === undefined && x.vlag === undefined;
  return { soort, naam, vlag: x.sleutel && x.vlag ? `${x.sleutel}.vlag` : null, wapen: x.sleutel && (x.wapen || oud) ? x.sleutel : null };
}

/** Provincie vóór gewest: een code die bij de stad hoort en geen «gewest» (BE-VLG/WAL/BRU) of FR-regio met letters is. */
function fijnheid(code: string, vanStad?: string[]): number {
  let p = 0;
  if (vanStad?.includes(code)) p += 2;
  if (/^BE-(VLG|WAL|BRU)$/.test(code)) p -= 1;
  if (/^FR-[A-Z]{3}$/.test(code)) p -= 1;
  return p;
}

export const isPlaatsSleutel = (s: unknown): boolean => /^(land-[a-z]{2}(\.wapen)?|(regio-[a-z]{2}-[a-z0-9]{1,3}|stad-[a-z]{2}-[a-z0-9-]{1,60})(\.vlag)?)$/.test(String(s ?? ''));
