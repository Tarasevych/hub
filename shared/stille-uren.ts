// IDENTITEIT-015 (kaart-stille-uren): stille uren voor het HELE meldingencentrum, niet alleen voor de puls van de menubadges.
// Тихі години для всього центру сповіщень: подія під час тиші не спливає й не звучить (лишається в панелі), а після кінця тиші
// з'являється ОДИН підсумок «Поки була тиша: N». Чиста логіка з параметром `nu` (тести керують часом); без залежностей від браузера,
// тож будь-який майбутній канал доставки (наприклад, push) відкладає надсилання тією самою функцією `stilTot`.
// Zuivere logica met `nu` als parameter (tests sturen de klok); geen browserafhankelijkheden.
import { isStil, type MeldingVoorkeuren } from './menu-meldingen-voorkeuren';

export type StilVoorkeur = MeldingVoorkeuren['stil'];
/** Openstaande telling: `n` gebeurtenissen zonder pop-up/geluid in het stille venster dat eindigt op `tot` (ms sinds epoch, lokale tijd). */
export type StilTeller = { n: number; tot: number };

const minutenVan = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Валідний час «ГГ:ХХ» → хвилини після півночі; інакше null. */
const minuten = (t: unknown): number | null => {
  const r = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t ?? ''));
  return r ? Number(r[1]) * 60 + Number(r[2]) : null;
};

/** Is het nu stil? Zelfde regel als de menubadges (isStil), op de lokale klok van `nu`. Чи зараз тиша (та сама isStil, що для міток меню). */
export function stilNu(stil: StilVoorkeur | null | undefined, nu: Date): boolean {
  if (!stil || !stil.aan || minuten(stil.van) === null || minuten(stil.tot) === null) return false;
  return isStil({ stil }, minutenVan(nu));
}

/**
 * Einde van het stille venster waarin `nu` valt (ms), of null als het nu niet stil is. Over middernacht heen: 23:30 bij 22:00–07:00 →
 * morgen 07:00. Кінець поточної тиші (мс) або null, якщо зараз не тиша. Цим часом відкладається доставка (push тощо).
 */
export function stilTot(stil: StilVoorkeur | null | undefined, nu: Date): number | null {
  if (!stilNu(stil, nu)) return null;
  const tot = minuten(stil!.tot)!;
  const e = new Date(nu.getTime());
  e.setHours(Math.floor(tot / 60), tot % 60, 0, 0);
  if (e.getTime() <= nu.getTime()) e.setDate(e.getDate() + 1);
  return e.getTime();
}

/** Rommel uit de opslag (oude versie, handmatig gewijzigd) → null. Пошкоджений запис у сховищі → null (без підсумку з вигаданим числом). */
export function leesTeller(raw: unknown): StilTeller | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const n = Number(r.n), tot = Number(r.tot);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000 || !Number.isFinite(tot) || tot <= 0) return null;
  return { n, tot };
}

export type StilStap = {
  /** Новий лічильник для збереження (null = нічого не чекає). */
  teller: StilTeller | null;
  /** Скільки подій показати в підсумку ЗАРАЗ (один раз); null — підсумку немає. */
  samenvatting: number | null;
  /** Чи зараз тиша. */
  stil: boolean;
};

/**
 * Eén stap van de stille uren. Eerst een openstaande telling afronden: is het venster voorbij (of zijn de stille uren uitgezet), dan
 * komt er precies één samenvatting en is de telling weg — een tweede aanroep geeft dus niets meer. Daarna, bij een `gebeurtenis`
 * tijdens de stilte: tellen. Verschuift de eigenaar het einde terwijl het stil is, dan telt het lopende getal mee naar het nieuwe einde.
 * Один крок: спершу завершити наявний лічильник (тиша скінчилася або її вимкнули) → рівно один підсумок; потім порахувати подію в тиші.
 */
export function stilStap(teller: StilTeller | null | undefined, stil: StilVoorkeur | null | undefined, nu: Date, gebeurtenissen = 0): StilStap {
  const tot = stilTot(stil, nu);
  let t = leesTeller(teller);
  let samenvatting: number | null = null;
  if (t && (tot === null || nu.getTime() >= t.tot)) { samenvatting = t.n; t = null; }
  else if (t && tot !== null && tot !== t.tot) t = { n: t.n, tot };
  const extra = Math.max(0, Math.floor(gebeurtenissen));
  if (extra && tot !== null) t = { n: Math.min(1_000_000, (t?.n ?? 0) + extra), tot };
  return { teller: t, samenvatting, stil: tot !== null };
}

/** Tekst van de samenvatting (uk/nl). Текст підсумку. */
export function samenvattingTekst(n: number, lang: 'uk' | 'nl'): { text: string; explain: string } {
  return lang === 'uk'
    ? { text: `Поки була тиша: ${n}`, explain: `Під час тихих годин надійшло сповіщень: ${n}. Вони не спливали й не звучали; усі вони — у панелі сповіщень (дзвіночок). Тихі години змінюються в налаштуваннях меню → «Сповіщення в меню».` }
    : { text: `Tijdens de stille uren: ${n}`, explain: `Tijdens de stille uren kwamen ${n} meldingen binnen. Ze verschenen niet en maakten geen geluid; ze staan allemaal in het meldingenpaneel (bel). De stille uren wijzigt u in de menu-instellingen → «Meldingen in het menu».` };
}
