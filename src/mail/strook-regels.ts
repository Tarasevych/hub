// STROOK-002 (16.11.2026). Павло: «варто перебрати принципи роботи і також додати інші варіанти … не показувати смугу для певної мови
// листів чи наприклад для певного відправника; це дуже розумна система, коли вона має пропозиції».
//
// Regels voor de twee stroken boven een brief (STROOK-001: ✕ verbergt een strook voor één brief, src/mail/stroken-sluiten.ts):
//   - taalstrook («Мова листа: … Оригінал / Переклад / Порівняти»): niet meer tonen voor een TAAL, een AFZENDER of OVERAL;
//   - beeldenstrook («N зовнішні зображення приховано»): niet meer tonen voor een AFZENDER of OVERAL.
// Een regel verbergt ALLEEN de strook. Het gedrag blijft: externe beelden blijven verborgen, de brief blijft in de gekozen taalweergave.
// Voorstellen: elke ✕ telt mee (per taal, per afzender). Wie dezelfde strook voor dezelfde taal of afzender al vaker sloot, krijgt
// die keuze als voorstel aangeboden — nooit automatisch toegepast.
// Opslag: alleen op dit apparaat (localStorage, zoals «Вигляд» en «Завжди від цього відправника»), per BEREIK = site-account + mailbox
// (cacheAccountId, zoals src/mail/beelden-toestemming.ts). Het voorvoegsel staat in src/lokale-sporen.ts: afmelden wist de regels.
import { useSyncExternalStore } from 'react';
import { normalizeMailAddress } from '../mail-email';
import { naWissen, STROOK_REGELS_VOORVOEGSEL } from '../lokale-sporen';

export type StrookSoort = 'taal' | 'beelden';
/** Waarvoor een regel geldt. 'taal' alleen voor de taalstrook. */
export type RegelSoort = 'taal' | 'afzender' | 'overal';
export type StrookRegel = { strook: StrookSoort; soort: RegelSoort; waarde: string };
export type Regels = {
  taal: { talen: string[]; afzenders: string[]; overal: boolean };
  beelden: { afzenders: string[]; overal: boolean };
  /** Hoe vaak ✕ al gekozen is: «taal|t:nl», «taal|a:x@y», «beelden|a:x@y». */
  tel: Record<string, number>;
};
/** Over een brief: zijn brontaal (taalstrook) en afzender. */
export type BriefKenmerken = { taal?: string; afzender?: string };

export { STROOK_REGELS_VOORVOEGSEL };
export const REGELS_MAX = 200;
/** Na hoeveel keer ✕ voor dezelfde taal of afzender de keuze als voorstel verschijnt (de tweede keer). */
export const VOORSTEL_DREMPEL = 2;

export const regelsSleutel = (bereik = ''): string => `${STROOK_REGELS_VOORVOEGSEL}${bereik ? encodeURIComponent(bereik) : 'anon'}`;
const leeg = (): Regels => ({ taal: { talen: [], afzenders: [], overal: false }, beelden: { afzenders: [], overal: false }, tel: {} });
const lijstVan = (v: unknown, test: (s: string) => boolean): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && test(x)))].slice(-REGELS_MAX) : [];
const isTaal = (s: string) => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(s);
const isAdres = (s: string) => s.includes('@') && s.length <= 320;
export const normTaal = (code = ''): string => String(code || '').trim().toLowerCase().slice(0, 12);
export const normAfzender = (from = ''): string => normalizeMailAddress(String(from || '')) || '';

/** Leest en controleert opgeslagen regels (onbekende of kapotte velden vallen weg). */
export function normaliseerRegels(v: unknown): Regels {
  const r = leeg();
  if (!v || typeof v !== 'object') return r;
  const o = v as Record<string, Record<string, unknown> | undefined>;
  r.taal.talen = lijstVan(o.taal?.talen, isTaal).map(normTaal);
  r.taal.afzenders = lijstVan(o.taal?.afzenders, isAdres);
  r.taal.overal = o.taal?.overal === true;
  r.beelden.afzenders = lijstVan(o.beelden?.afzenders, isAdres);
  r.beelden.overal = o.beelden?.overal === true;
  const tel = (v as { tel?: unknown }).tel;
  if (tel && typeof tel === 'object') {
    const paren = Object.entries(tel as Record<string, unknown>)
      .filter(([k, n]) => /^(taal|beelden)\|[ta]:/.test(k) && k.length <= 340 && Number.isFinite(n) && Number(n) > 0)
      .slice(-REGELS_MAX);
    for (const [k, n] of paren) r.tel[k] = Math.min(999, Math.floor(Number(n)));
  }
  return r;
}

const cache = new Map<string, Regels>();
const luisteraars = new Set<() => void>();
const melden = () => { for (const l of luisteraars) l(); };

export function leesRegels(bereik = ''): Regels {
  const sleutel = regelsSleutel(bereik);
  const bekend = cache.get(sleutel);
  if (bekend) return bekend;
  let uit = leeg();
  try { uit = normaliseerRegels(JSON.parse(localStorage.getItem(sleutel) || 'null')); } catch { uit = leeg(); }
  cache.set(sleutel, uit);
  return uit;
}
function schrijf(bereik: string, r: Regels): void {
  cache.set(regelsSleutel(bereik), r);
  try { localStorage.setItem(regelsSleutel(bereik), JSON.stringify(r)); } catch { /* privévenster: alleen deze sessie */ }
  melden();
}

/** Welke regel deze strook voor deze brief verbergt (of null). Volgorde: overal, taal, afzender. */
export function regelVoor(r: Regels, strook: StrookSoort, k: BriefKenmerken): StrookRegel | null {
  const afz = normAfzender(k.afzender);
  if (strook === 'taal') {
    const taal = normTaal(k.taal);
    if (r.taal.overal) return { strook, soort: 'overal', waarde: '' };
    if (taal && r.taal.talen.includes(taal)) return { strook, soort: 'taal', waarde: taal };
    if (afz && r.taal.afzenders.includes(afz)) return { strook, soort: 'afzender', waarde: afz };
    return null;
  }
  if (r.beelden.overal) return { strook, soort: 'overal', waarde: '' };
  if (afz && r.beelden.afzenders.includes(afz)) return { strook, soort: 'afzender', waarde: afz };
  return null;
}

/** Zet een regel aan of uit. Geeft false als er niets te doen was (lege waarde, 'taal' op de beeldenstrook). */
export function zetRegel(bereik: string, regel: StrookRegel, aan: boolean): boolean {
  const oud = leesRegels(bereik);
  const r: Regels = { taal: { ...oud.taal, talen: [...oud.taal.talen], afzenders: [...oud.taal.afzenders] }, beelden: { ...oud.beelden, afzenders: [...oud.beelden.afzenders] }, tel: { ...oud.tel } };
  const doel = regel.strook === 'taal' ? r.taal : r.beelden;
  if (regel.soort === 'overal') {
    if (doel.overal === aan) return false;
    doel.overal = aan;
  } else {
    if (regel.soort === 'taal' && regel.strook !== 'taal') return false;
    const waarde = regel.soort === 'taal' ? normTaal(regel.waarde) : normAfzender(regel.waarde);
    if (!waarde) return false;
    const lijst = regel.soort === 'taal' ? r.taal.talen : doel.afzenders;
    const zonder = lijst.filter((x) => x !== waarde);
    if (aan ? lijst.includes(waarde) : zonder.length === lijst.length) return false;
    const nieuw = (aan ? [...zonder, waarde] : zonder).slice(-REGELS_MAX);
    if (regel.soort === 'taal') r.taal.talen = nieuw; else doel.afzenders = nieuw;
  }
  // Een regel uitzetten begint het tellen voor die waarde opnieuw: het voorstel komt niet meteen terug.
  if (!aan && regel.soort !== 'overal') delete r.tel[telSleutel(regel.strook, regel.soort === 'taal' ? 't' : 'a', regel.waarde)];
  schrijf(bereik, r);
  return true;
}

const telSleutel = (strook: StrookSoort, wat: 't' | 'a', waarde: string) =>
  `${strook}|${wat}:${wat === 't' ? normTaal(waarde) : normAfzender(waarde)}`;

/** ✕ gekozen: tel mee voor de taal (alleen taalstrook) en de afzender van deze brief. */
export function telSluiten(bereik: string, strook: StrookSoort, k: BriefKenmerken): void {
  const oud = leesRegels(bereik);
  const tel = { ...oud.tel };
  const taal = strook === 'taal' ? normTaal(k.taal) : '';
  const afz = normAfzender(k.afzender);
  if (taal) tel[telSleutel(strook, 't', taal)] = Math.min(999, (tel[telSleutel(strook, 't', taal)] || 0) + 1);
  if (afz) tel[telSleutel(strook, 'a', afz)] = Math.min(999, (tel[telSleutel(strook, 'a', afz)] || 0) + 1);
  if (!taal && !afz) return;
  const paren = Object.entries(tel);
  schrijf(bereik, { ...oud, tel: Object.fromEntries(paren.slice(-REGELS_MAX)) });
}

export type Voorstel = { soort: RegelSoort; keer: number } | null;
/**
 * Het voorstel na een ✕: de keuze die het vaakst al gemaakt is (taal vóór afzender bij gelijkstand, want een taal dekt meer brieven),
 * vanaf VOORSTEL_DREMPEL keer. Zonder genoeg herhaling: geen voorstel (de keuzes staan er gewoon, zonder nadruk).
 */
export function voorstelVoor(r: Regels, strook: StrookSoort, k: BriefKenmerken): Voorstel {
  const taal = strook === 'taal' ? normTaal(k.taal) : '';
  const afz = normAfzender(k.afzender);
  const nT = taal ? r.tel[telSleutel(strook, 't', taal)] || 0 : 0;
  const nA = afz ? r.tel[telSleutel(strook, 'a', afz)] || 0 : 0;
  if (nT >= VOORSTEL_DREMPEL && nT >= nA) return { soort: 'taal', keer: nT };
  if (nA >= VOORSTEL_DREMPEL) return { soort: 'afzender', keer: nA };
  return null;
}

/** Alle actieve regels, voor de lijst in «Вигляд». */
export function alleRegels(r: Regels): StrookRegel[] {
  const uit: StrookRegel[] = [];
  if (r.taal.overal) uit.push({ strook: 'taal', soort: 'overal', waarde: '' });
  for (const w of r.taal.talen) uit.push({ strook: 'taal', soort: 'taal', waarde: w });
  for (const w of r.taal.afzenders) uit.push({ strook: 'taal', soort: 'afzender', waarde: w });
  if (r.beelden.overal) uit.push({ strook: 'beelden', soort: 'overal', waarde: '' });
  for (const w of r.beelden.afzenders) uit.push({ strook: 'beelden', soort: 'afzender', waarde: w });
  return uit;
}

/* ---- het bereik van de open brief: «Вигляд» kent het account niet zelf, de brief zet het ---- */
let actiefBereik = '';
export function zetActiefBereik(bereik: string): void { if (bereik !== actiefBereik) { actiefBereik = bereik; melden(); } }

const abonneer = (l: () => void) => {
  luisteraars.add(l);
  const opslag = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(STROOK_REGELS_VOORVOEGSEL)) { cache.clear(); l(); } }; // ander tabblad
  if (typeof window !== 'undefined') window.addEventListener('storage', opslag);
  return () => { luisteraars.delete(l); if (typeof window !== 'undefined') window.removeEventListener('storage', opslag); };
};
/** React: de regels van dit bereik (volgt wijzigingen hier en in andere tabbladen). */
export function useStrookRegels(bereik = ''): Regels {
  const lees = () => leesRegels(bereik);
  return useSyncExternalStore(abonneer, lees, lees);
}
/** React: het bereik van de laatst geopende brief. */
export function useActiefBereik(): string {
  const lees = () => actiefBereik;
  return useSyncExternalStore(abonneer, lees, lees);
}

/** Alleen voor tests. */
export function vergeetRegelsCache(): void { cache.clear(); actiefBereik = ''; }
/** Na afmelden (src/lokale-sporen.ts): het geheugen volgt. */
export function regelsGewist(): void { cache.clear(); melden(); }
naWissen.add(regelsGewist);
