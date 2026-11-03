// Het HUIDIGE zoekresultaat van het uitklapvenster (INTEG-001, 03.11.2026): de knop «Перейти до пошуку» opent de zoekpagina met
// precies dat resultaat — het wordt niet gewist en niet eerst «Шукаємо…» getoond, het staat er meteen (daarna ververst de pagina op
// de achtergrond). Dit is alleen een tijdelijk geheugen van DIT tabblad (sessionStorage, altijd met try/catch, per aangemeld account,
// 10 minuten geldig, maximaal ~0,6 MB); het is geen geschiedenis. Over een andere dienst-host heen (mail.* → hub.*) bestaat
// sessionStorage niet gedeeld: dan krijgt de pagina alleen de tekst en categorie in de URL en zoekt zelf meteen (zoals vóór deze wijziging).
// Wat er staat komt van de server via leesAntwoord/leesGesloten en wordt bij het lezen opnieuw gecontroleerd (tolerante lezers).
import { leesAntwoord, leesGesloten, type ZoekUitkomst } from './zoek-api';
import { zoekGebruiker } from './zoek-recent';
import { CATEGORIEEN, type Categorie } from './zoek-logica';

export const LAATSTE_GELDIG_MS = 10 * 60_000;
export const LAATSTE_MAX_TEKENS = 600_000;
type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const standaardOpslag = (): Opslag | null => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
};
export const laatsteSleutel = (id: string): string => (id ? `mr-zoek-laatste:${id}` : '');

/** Zelfde sleutel als de pagina gebruikt voor «dezelfde vraag»: de tekst zonder omliggende spaties, hoofdletters tellen niet mee. */
export const laatsteVraagSleutel = (q: string, cat: Categorie): string => `${cat}|${q.trim().toLocaleLowerCase()}`;

/** Bewaart het resultaat van (q, cat). Zonder account, zonder opslag of te groot: niets (en de oude waarde verdwijnt). */
export function bewaarLaatste(q: string, cat: Categorie, uitkomst: ZoekUitkomst | null, nu: number = Date.now(), id: string = zoekGebruiker(), opslag: Opslag | null = standaardOpslag()): boolean {
  const sleutel = laatsteSleutel(id);
  if (!sleutel || !opslag) return false;
  try {
    if (!uitkomst || !q.trim()) { opslag.removeItem(sleutel); return false; }
    const tekst = JSON.stringify({ k: laatsteVraagSleutel(q, cat), tijd: nu, uitkomst });
    if (tekst.length > LAATSTE_MAX_TEKENS) { opslag.removeItem(sleutel); return false; }
    opslag.setItem(sleutel, tekst);
    return true;
  } catch {
    return false;
  }
}

/** Het bewaarde resultaat voor precies (q, cat), mits jong genoeg; anders null. Wordt NIET gewist (herladen blijft dezelfde pagina tonen). */
export function leesLaatste(q: string, cat: Categorie, nu: number = Date.now(), id: string = zoekGebruiker(), opslag: Pick<Storage, 'getItem'> | null = standaardOpslag()): ZoekUitkomst | null {
  const sleutel = laatsteSleutel(id);
  if (!sleutel || !opslag || !q.trim() || !CATEGORIEEN.includes(cat)) return null;
  try {
    const ruw = opslag.getItem(sleutel);
    if (!ruw) return null;
    const o = JSON.parse(ruw) as { k?: unknown; tijd?: unknown; uitkomst?: unknown } | null;
    if (!o || o.k !== laatsteVraagSleutel(q, cat) || typeof o.tijd !== 'number' || nu - o.tijd > LAATSTE_GELDIG_MS || o.tijd > nu + 60_000) return null;
    const a = leesAntwoord(o.uitkomst);
    return a.items.length || a.totaal ? { ...a, gesloten: leesGesloten(o.uitkomst) } : null;
  } catch {
    return null;
  }
}
