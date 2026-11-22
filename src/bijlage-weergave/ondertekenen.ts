// Спільний перегляд вкладень, етап 3, розділ 15.4 (Grok: hub.tarasevych.com):
// чисті функції описують розміщення позначки підпису на сторінці (сторінка, x, y, розмір, вид: tekening, initialen, datum),
// звіряють його з межами сторінки й складають план для MailDocumentBewerker (поля page, x, y, tool, text, image).
// Мережі та криптографії немає, оригінал файла не змінюється: це лише план візуальної позначки на копії,
// а не кваліфікований електронний підпис. Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM.

import type { SoortSleutel, Tweetalig } from './soort';

/** Вид позначки. Не кваліфікований підпис. */
export type OndertekenSoort = 'tekening' | 'initialen' | 'datum';

/**
 * Відповідник поля tool у MailDocumentBewerker
 * (signature | text | date; check і stamp тут не використовуємо).
 */
export type BewerkerGereedschap = 'signature' | 'text' | 'date';

export type PlaatsingFout =
  | 'onbekende-pagina'
  | 'ongeldige-positie'
  | 'ongeldig-formaat'
  | 'buiten-grenzen'
  | 'lege-tekst';

/** Сторінка документа: індекс як у Mark.page (від нуля), розмір у тих самих одиницях. */
export type Pagina = {
  index: number;
  breedte: number;
  hoogte: number;
};

/**
 * Розміщення позначки.
 * x і y — відсотки сторінки (0…100), як Mark.x і Mark.y: початок зверху ліворуч.
 * breedte і hoogte — відсотки ширини й висоти сторінки; якщо не подано, беремо типові.
 */
export type Plaatsing = {
  pagina: number;
  x: number;
  y: number;
  soort: OndertekenSoort;
  breedte?: number;
  hoogte?: number;
  tekst?: string;
};

/** План для пізнішого накладання в MailDocumentBewerker. Поля mark вже в його формі. */
export type OndertekenPlan = {
  pagina: number;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  soort: OndertekenSoort;
  gereedschap: BewerkerGereedschap;
  tekst: string;
  mark: {
    page: number;
    x: number;
    y: number;
    tool: BewerkerGereedschap;
    text: string;
    image: string;
  };
};

export type PlanUitkomst =
  | { ok: true; plan: OndertekenPlan }
  | { ok: false; fout: PlaatsingFout };

/** Типовий розмір у відсотках сторінки (редактор зараз має свої піксельні типові для tool). */
export const STANDAARD_BREEDTE: Record<OndertekenSoort, number> = {
  tekening: 25,
  initialen: 10,
  datum: 18,
};

export const STANDAARD_HOOGTE: Record<OndertekenSoort, number> = {
  tekening: 10,
  initialen: 5,
  datum: 5,
};

export const ONDERTEKEN_LABEL: Tweetalig = ['Підписати', 'Ondertekenen'];

/** Чесно кажемо, що це позначка на копії, без обіцянки юридичної сили. */
export const ONDERTEKEN_TOELICHTING: Tweetalig = [
  'Позначка на копії файла. Це не кваліфікований електронний підпис. Оригінал у листі не змінюється.',
  'Aantekening op een kopie van het bestand. Dit is geen gekwalificeerde elektronische handtekening. Het origineel in het bericht blijft ongewijzigd.',
];

const SOORTEN: readonly OndertekenSoort[] = ['tekening', 'initialen', 'datum'];

export function gereedschapVoor(soort: OndertekenSoort): BewerkerGereedschap {
  if (soort === 'tekening') return 'signature';
  if (soort === 'initialen') return 'text';
  return 'date';
}

function isPdf(formaat: string): boolean {
  const s = String(formaat ?? '').trim().toUpperCase();
  return s === 'PDF' || s.endsWith('/PDF') || s.endsWith('.PDF');
}

/**
 * Дія видима для рахунку, договору й PDF і не видима для фото чи архіву.
 * Інші види — лише якщо формат PDF.
 */
export function toontOndertekenen(soort: SoortSleutel, formaat: string): boolean {
  if (soort === 'foto' || soort === 'archief') return false;
  if (soort === 'rekening' || soort === 'contract') return true;
  return isPdf(formaat);
}

/** Назва нової копії: до розширення додаємо «-kopie». Оригінальне ім’я не змінюємо. */
export function naamKopije(bestandsnaam: string): string {
  const naam = String(bestandsnaam ?? '').trim() || 'document';
  const punt = naam.lastIndexOf('.');
  if (punt <= 0) return `${naam}-kopie`;
  return `${naam.slice(0, punt)}-kopie${naam.slice(punt)}`;
}

function eindigMaat(ruw: Plaatsing): { breedte: number; hoogte: number } {
  const breedte = ruw.breedte == null ? STANDAARD_BREEDTE[ruw.soort] : ruw.breedte;
  const hoogte = ruw.hoogte == null ? STANDAARD_HOOGTE[ruw.soort] : ruw.hoogte;
  return { breedte, hoogte };
}

function paginaVan(paginas: readonly Pagina[], index: number): Pagina | null {
  if (!Number.isInteger(index) || index < 0) return null;
  for (const p of paginas ?? []) {
    if (p && p.index === index) return p;
  }
  return null;
}

function inBereik(n: number, a: number, b: number): boolean {
  return Number.isFinite(n) && n >= a && n <= b;
}

/**
 * Звірка розміщення з межами сторінки.
 * x і y — центр позначки; рамка (центр ± половина розміру) має цілком лежати в 0…100.
 */
export function controleerPlaatsing(ruw: Plaatsing, paginas: readonly Pagina[]): PlaatsingFout | null {
  if (!ruw || !SOORTEN.includes(ruw.soort)) return 'ongeldig-formaat';
  const pagina = paginaVan(paginas, ruw.pagina);
  if (!pagina) return 'onbekende-pagina';
  if (!Number.isFinite(pagina.breedte) || pagina.breedte <= 0 || !Number.isFinite(pagina.hoogte) || pagina.hoogte <= 0) {
    return 'ongeldig-formaat';
  }
  if (!Number.isFinite(ruw.x) || !Number.isFinite(ruw.y)) return 'ongeldige-positie';
  if (!inBereik(ruw.x, 0, 100) || !inBereik(ruw.y, 0, 100)) return 'buiten-grenzen';
  const { breedte, hoogte } = eindigMaat(ruw);
  if (!Number.isFinite(breedte) || !Number.isFinite(hoogte) || breedte <= 0 || hoogte <= 0 || breedte > 100 || hoogte > 100) {
    return 'ongeldig-formaat';
  }
  const links = ruw.x - breedte / 2;
  const rechts = ruw.x + breedte / 2;
  const boven = ruw.y - hoogte / 2;
  const onder = ruw.y + hoogte / 2;
  if (links < 0 || boven < 0 || rechts > 100 || onder > 100) return 'buiten-grenzen';
  if (ruw.soort === 'initialen' && !String(ruw.tekst ?? '').trim()) return 'lege-tekst';
  return null;
}

/**
 * Складає план позначки. Якщо звірка не пройшла — { ok: false, fout }.
 * Поле image в mark лишаємо порожнім: малюнок подасть редактор пізніше.
 * Порожній текст для datum теж лишаємо порожнім: дату підставить редактор.
 * Розмір у mark редактор поки ігнорує й бере типовий для tool.
 */
export function maakPlan(ruw: Plaatsing, paginas: readonly Pagina[]): PlanUitkomst {
  const fout = controleerPlaatsing(ruw, paginas);
  if (fout) return { ok: false, fout };
  const { breedte, hoogte } = eindigMaat(ruw);
  const gereedschap = gereedschapVoor(ruw.soort);
  const tekst = String(ruw.tekst ?? '').trim();
  return {
    ok: true,
    plan: {
      pagina: ruw.pagina,
      x: ruw.x,
      y: ruw.y,
      breedte,
      hoogte,
      soort: ruw.soort,
      gereedschap,
      tekst,
      mark: {
        page: ruw.pagina,
        x: ruw.x,
        y: ruw.y,
        tool: gereedschap,
        text: tekst,
        image: '',
      },
    },
  };
}
