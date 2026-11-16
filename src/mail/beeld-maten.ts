// MAILBEELD-003 (16.11.2026). Павло: «треба ще зберегти структуру листа, бо часто коли в листі були певних розмірів фото, які не
// показувалися, вони рушили всю структуру … це ж можна зробити без запиту на сервер відправника, щоб розміри попереднього зберігалися?»
//
// Wat de brief zelf opgeeft (width/height, stijl) gebruikt de tegel al (src/mail/beeld-tegel.ts). Zonder die opgave is de echte maat van
// een beeld alleen te kennen door het beeld op te halen — en precies dat willen we bij «Питати» niet. Maar een beeld dat op DIT
// apparaat al eens getoond werd («Показати один раз», «Завжди», uit de voorraad van de server, een bijlage) heeft zijn maat toen laten
// zien. Die maat bewaren we hier, zodat de tegel de volgende keer exact zo groot is als het beeld en de brief niet verspringt.
//
// Privacy en grenzen:
//  - GEEN verzoek, nergens heen: alleen naturalWidth/naturalHeight van een beeld dat de browser al tekende.
//  - Geen URL in de opslag: alleen een korte hash (cyrb53) van bereik + URL. Een URL van een nieuwsbrief bevat vaak een persoonlijke code.
//  - Per bereik (site-account + mailbox, cacheAccountId), zoals «Завжди від цього відправника». Het voorvoegsel staat in
//    src/lokale-sporen.ts: afmelden wist de maten mee.
//  - Hoogstens MATEN_MAX beelden per bereik; het langst niet gebruikte gaat eerst weg. Wegschrijven gebundeld (niet per beeld).
//
// Uk: розміри вже показаних зображень зберігаються лише на цьому пристрої (без адрес), щоб прихована плитка мала точний розмір.
import { MATEN_VOORVOEGSEL, naWissen } from '../lokale-sporen';

export { MATEN_VOORVOEGSEL };
export const MATEN_MAX = 3000;
/** Grootste maat die we serieus nemen (een beeld van 20 000 px is een fout of een aanval op de opmaak). */
export const MAAT_GRENS = 20000;

export type Maat = { b: number; h: number };
/** In de opslag: hash → [breedte, hoogte, laatst gebruikt (dag sinds 1970)]. */
type Rij = [number, number, number];

export const matenSleutel = (bereik = ''): string => `${MATEN_VOORVOEGSEL}${bereik ? encodeURIComponent(bereik) : 'anon'}`;

/** cyrb53: snelle, synchrone 53-bits hash (geen crypto nodig — het gaat om vindbaarheid, niet om geheimhouding). Puur (testbaar). */
export function maatHash(bereik: string, url: string): string {
  const s = `${bereik}\u001f${String(url || '').trim()}`;
  let h1 = 0xdeadbeef ^ 0x4d52, h2 = 0x41c6ce57 ^ 0x4d52;
  for (let i = 0; i < s.length; i += 1) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Is dit een bruikbare maat? Hele getallen, 1…MAAT_GRENS. Puur (testbaar). */
export const geldigeMaat = (b: unknown, h: unknown): boolean =>
  Number.isInteger(b) && Number.isInteger(h) && (b as number) >= 1 && (h as number) >= 1 && (b as number) <= MAAT_GRENS && (h as number) <= MAAT_GRENS;

/** «640x427» ↔ Maat: zo staat de maat als data-attribuut op het <img> in de brief (data-mail-beeld-maat). Puur (testbaar). */
export const maatTekst = (m: Maat): string => `${m.b}x${m.h}`;
export function leesMaatTekst(ruw: string | null | undefined): Maat | null {
  const m = /^(\d{1,5})x(\d{1,5})$/.exec(String(ruw ?? ''));
  if (!m) return null;
  const b = Number(m[1]), h = Number(m[2]);
  return geldigeMaat(b, h) ? { b, h } : null;
}

const dagNu = () => Math.floor(Date.now() / 86_400_000);
const opslag = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const geheugen = new Map<string, Map<string, Rij>>();
const vuil = new Set<string>();
let wachtend: ReturnType<typeof setTimeout> | null = null;

function lees(bereik: string): Map<string, Rij> {
  const sleutel = matenSleutel(bereik);
  const bekend = geheugen.get(sleutel);
  if (bekend) return bekend;
  const kaart = new Map<string, Rij>();
  try {
    const ruw = opslag()?.getItem(sleutel);
    const data = ruw ? JSON.parse(ruw) : null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (!/^[0-9a-z]{1,12}$/.test(k) || !Array.isArray(v) || !geldigeMaat(v[0], v[1])) continue;
        kaart.set(k, [v[0] as number, v[1] as number, Number.isInteger(v[2]) ? (v[2] as number) : 0]);
      }
    }
  } catch { /* kapotte of geblokkeerde opslag: begin leeg */ }
  geheugen.set(sleutel, kaart);
  return kaart;
}

/** Houdt hoogstens `max` rijen: het langst niet gebruikte eerst weg. Puur op de kaart (testbaar via onthoudMaat). */
function snoei(kaart: Map<string, Rij>, max = MATEN_MAX) {
  if (kaart.size <= max) return;
  const oud = [...kaart.entries()].sort((a, b) => a[1][2] - b[1][2]).slice(0, kaart.size - max);
  for (const [k] of oud) kaart.delete(k);
}

function schrijfNu() {
  wachtend = null;
  const o = opslag();
  for (const sleutel of vuil) {
    const kaart = geheugen.get(sleutel);
    if (!kaart || !o) continue;
    try { o.setItem(sleutel, JSON.stringify(Object.fromEntries(kaart))); }
    catch {
      // opslag vol: de helft van de oudste weg en nog één keer; lukt dat niet, dan blijft het bij het geheugen van deze sessie
      snoei(kaart, Math.floor(kaart.size / 2));
      try { o.setItem(sleutel, JSON.stringify(Object.fromEntries(kaart))); } catch { /* laat staan */ }
    }
  }
  vuil.clear();
}
const planSchrijven = () => { if (!wachtend) wachtend = setTimeout(schrijfNu, 800); };

/** De bewaarde maat van dit beeld in dit bereik, of null. Gebruik telt als «gebruikt» (blijft langer bewaard). */
export function bewaardeMaat(bereik: string, url: string): Maat | null {
  if (!url) return null;
  const kaart = lees(bereik), k = maatHash(bereik, url), rij = kaart.get(k);
  if (!rij) return null;
  const dag = dagNu();
  if (rij[2] !== dag) { rij[2] = dag; vuil.add(matenSleutel(bereik)); planSchrijven(); }
  return { b: rij[0], h: rij[1] };
}

/** Onthoudt de echte maat van een getoond beeld (naturalWidth × naturalHeight). Onzin of 0 × 0 (nog niet geladen) telt niet. */
export function onthoudMaat(bereik: string, url: string, b: number, h: number): boolean {
  if (!url || !geldigeMaat(b, h)) return false;
  const kaart = lees(bereik), k = maatHash(bereik, url), oud = kaart.get(k), dag = dagNu();
  if (oud && oud[0] === b && oud[1] === h && oud[2] === dag) return false;
  kaart.delete(k); // opnieuw achteraan
  kaart.set(k, [b, h, dag]);
  snoei(kaart);
  vuil.add(matenSleutel(bereik));
  planSchrijven();
  return true;
}

/** Voor tests en het afmelden: schrijft wat wacht meteen weg. */
export function matenNuBewaren(): void { if (wachtend) { clearTimeout(wachtend); } schrijfNu(); }

/** Na het wissen van de lokale sporen (afmelden): ook de kopie in het geheugen vergeten, en niets meer terugschrijven. */
export function vergeetMaten(): void {
  if (wachtend) { clearTimeout(wachtend); wachtend = null; }
  vuil.clear();
  geheugen.clear();
}
naWissen.add(vergeetMaten);
// Een ander tabblad wiste of schreef de maten (afmelden daar, of hetzelfde account in twee tabbladen): de kopie hier vergeten, zodat
// een wachtende schrijfbeurt niets terugzet wat daar gewist is. Bij de volgende lezing komt de stand uit de opslag.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== null && !e.key.startsWith(MATEN_VOORVOEGSEL)) return;
    if (e.key === null) { vergeetMaten(); return; }
    geheugen.delete(e.key);
    vuil.delete(e.key);
  });
}
