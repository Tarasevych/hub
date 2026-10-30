// Tijdzone voor de pagina /updates (audit 18.10.2026, punt 8d).
// Waarom: de terminal toonde de UTC-tijd uit het ISO-tekstveld (slice), de stappen de lokale tijd — dezelfde gebeurtenis
// kreeg twee verschillende uren. Nu gebruiken terminal, stappen en historie één keuze (standaard: tijdzone van de browser),
// met een zichtbare zone-afkorting. De keuze staat in localStorage (try/catch: privévensters) en geldt meteen in alle delen.

export type ZoneKeuze = 'lokaal' | 'UTC' | 'Europe/Brussels' | 'Europe/Kyiv';
export const ZONES: Array<{ id: ZoneKeuze; uk: string; nl: string }> = [
  { id: 'lokaal', uk: 'Як у браузері', nl: 'Zoals de browser' },
  { id: 'UTC', uk: 'UTC (сервер)', nl: 'UTC (server)' },
  { id: 'Europe/Brussels', uk: 'Брюссель', nl: 'Brussel' },
  { id: 'Europe/Kyiv', uk: 'Київ', nl: 'Kyiv' },
];
const SLEUTEL = 'mr-uitrol-tijdzone-v1';
const EVENT = 'mr-uitrol-tijdzone';
const isZone = (v: unknown): v is ZoneKeuze => ZONES.some((z) => z.id === v);

let huidig: ZoneKeuze = (() => {
  try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SLEUTEL) : null; return isZone(v) ? v : 'lokaal'; } catch { return 'lokaal'; }
})();

export const zoneKeuze = () => huidig;
export function zetZone(z: ZoneKeuze) {
  if (!isZone(z)) return;
  huidig = z;
  try { localStorage.setItem(SLEUTEL, z); } catch { /* privévenster: alleen voor deze pagina */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: z })); } catch { /* geen venster (test) */ }
}
export function opZone(cb: (z: ZoneKeuze) => void) {
  const h = (e: Event) => cb((e as CustomEvent<ZoneKeuze>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** IANA-zone voor Intl, of undefined voor «zoals de browser». */
export const ianaVan = (z: ZoneKeuze = huidig): string | undefined => (z === 'lokaal' ? undefined : z);

const loc = (lang: 'uk' | 'nl') => (lang === 'uk' ? 'uk-UA' : 'nl-BE');

/** Korte zone-naam (CEST, UTC, GMT+3 …) voor een tijdstip in de gekozen zone. */
export function zoneAfkorting(d: Date, z: ZoneKeuze = huidig, lang: 'uk' | 'nl' = 'nl'): string {
  if (z === 'UTC') return 'UTC';
  try {
    // Engelse namen geven de bekende afkortingen (CEST/CET); voor Kyiv geeft Intl «GMT+3», ook duidelijk.
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: ianaVan(z), timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName');
    return p?.value || '';
  } catch { return lang === 'uk' ? 'місц.' : 'lok.'; }
}

/** HH:MM:SS in de gekozen zone; leeg bij ongeldige invoer. */
export function tijdInZone(v: string | number | Date | undefined | null, z: ZoneKeuze = huidig, lang: 'uk' | 'nl' = 'nl'): string {
  if (v === undefined || v === null || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(loc(lang), { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: ianaVan(z) });
}

/** Tijd met zone, bv. «05:41:47 CEST». */
export const tijdMetZone = (v: string | number | Date | undefined | null, z: ZoneKeuze = huidig, lang: 'uk' | 'nl' = 'nl') => {
  const t = tijdInZone(v, z, lang);
  return t ? `${t} ${zoneAfkorting(new Date(v as string), z, lang)}`.trim() : '';
};

/** «Tot intrekking» (backend ONBEPAALD_EINDE = 9999-12-31): nooit als datum tonen (audit 19.10.2026, A7: «до 31.12.99»). */
export const isOnbepaaldEinde = (d: Date) => d.getUTCFullYear() >= 9999;
export const datumInZone = (v: string | undefined, lang: 'uk' | 'nl', stijl: 'short' | 'medium', z: ZoneKeuze = huidig) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  if (isOnbepaaldEinde(d)) return lang === 'uk' ? 'відкликання' : 'intrekking'; // leest als «до відкликання» / «tot intrekking»
  return d.toLocaleString(loc(lang), { dateStyle: stijl, timeStyle: stijl, timeZone: ianaVan(z) });
};
