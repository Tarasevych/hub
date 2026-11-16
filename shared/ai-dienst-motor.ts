// MAILAI-003 (16.11.2026): спільні рушії ШІ «для всіх» — те, що власник сайту вмикає для користувачів ОКРЕМО від особистих ключів.
// Три види: ключ постачальника (платить власник), LibreTranslate і Ollama на власному сервері власника. Типово все вимкнено.
// Людина бачить, куди піде текст, чий це ключ або сервер, і сама погоджується на кожен рушій; без згоди текст нікуди не йде.
// Gedeelde AI-motoren «voor iedereen»: door de eigenaar aangezet, los van persoonlijke sleutels; standaard uit; per motor eigen akkoord.
import { AI_AANBIEDER_BIJ_ID, type AiAanbiederId } from './ai-aanbieders';

export type DienstSoort = 'aanbieder' | 'libretranslate' | 'ollama';
export type DienstFunctie = 'translate' | 'summary' | 'purpose' | 'context' | 'acties';
export const DIENST_SOORTEN: readonly DienstSoort[] = ['aanbieder', 'libretranslate', 'ollama'];
export const DIENST_ALLE_FUNCTIES: readonly DienstFunctie[] = ['translate', 'summary', 'purpose', 'context', 'acties'];
export const DIENST_ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
export const DIENST_VOORVOEGSEL = 'dienst:';
/** Назва ключа у «Сховищі ключів» власника. Призначення такого ключа — «other», а не постачальник: особистий пошук його не знаходить. */
export const GEDEELD_SLEUTEL_VOORVOEGSEL = 'gedeeld-';
export const DIENST_LIMIET = { standaard: 30, min: 1, max: 5000 } as const;
export const DIENST_MAX_MOTOREN = 12;

/** Рядок, як його зберігає сервер (без значення ключа — воно лише у сховищі). */
export type DienstMotor = {
  id: string;
  soort: DienstSoort;
  naam: string;
  aanbieder?: AiAanbiederId;
  url?: string;
  model?: string;
  aan: boolean;
  limietPerDag: number;
  heeftSleutel: boolean;
  /** Ім'я адміністратора, який останнім змінив рушій: його бачать користувачі («хто це ввімкнув»). */
  beheerder: string;
  bijgewerktOp: number;
};

/** Те, що бачить звичайний користувач у пошті: жодного ключа, жодної внутрішньої адреси понад назву вузла. */
export type DienstMotorPubliek = {
  id: string;
  soort: DienstSoort;
  naam: string;
  aanbieder?: AiAanbiederId;
  model?: string;
  /** Назва вузла сервера (без шляху й порту) — щоб людина бачила, куди піде текст. */
  host?: string;
  functies: DienstFunctie[];
  limietPerDag: number;
  vandaag: number;
  beheerder: string;
  /** Чи погодилася людина саме на цю конфігурацію рушія (зміна постачальника, сервера чи моделі скидає згоду). */
  akkoord: boolean;
  akkoordSleutel: string;
};

export type DienstGebruik = {
  /** Скільки запитів цим рушієм людина зробила сьогодні (за часом сервера, UTC). */
  vandaag: number;
  /** Денна межа спільного рушія на людину; для особистого ключа її немає. */
  limietPerDag?: number;
  /** Залишок і межа запитів за заголовками постачальника (Anthropic, OpenAI) — на момент останньої відповіді. */
  resterend?: number;
  limiet?: number;
  /** Коли постачальник востаннє повідомив залишок (мс). */
  gemetenOp?: number;
};

export function dienstFuncties(soort: DienstSoort): DienstFunctie[] {
  return soort === 'libretranslate' ? ['translate'] : [...DIENST_ALLE_FUNCTIES];
}

export function isDienstAgentId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(DIENST_VOORVOEGSEL) && DIENST_ID_RE.test(id.slice(DIENST_VOORVOEGSEL.length));
}
export const dienstAgentId = (id: string) => `${DIENST_VOORVOEGSEL}${id}`;
export const dienstIdVan = (agentId: string) => (isDienstAgentId(agentId) ? agentId.slice(DIENST_VOORVOEGSEL.length) : '');
export const gedeeldeSleutelNaam = (id: string) => `${GEDEELD_SLEUTEL_VOORVOEGSEL}${id}`;
export const isGedeeldeSleutel = (keyName: unknown) => typeof keyName === 'string' && keyName.startsWith(GEDEELD_SLEUTEL_VOORVOEGSEL);
/** Ключ лічильника використання: спільний рушій або особистий ключ постачальника. */
export const gebruikSleutelDienst = (id: string) => `dienst:${id}`;
export const gebruikSleutelEigen = (aanbieder: AiAanbiederId) => `sleutel:${aanbieder}`;

/** Вузол сервера з адреси; порожньо, якщо адреса непридатна. */
export function hostVan(url: string | undefined): string {
  try { return url ? new URL(url).hostname : ''; } catch { return ''; }
}

function fnv(tekst: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i += 1) { h ^= tekst.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/**
 * Згода прив'язана до того, КУДИ йде текст: вид, постачальник, адреса сервера, модель. Власник змінив будь-що з цього —
 * стара згода більше не діє, людину питають знову. Akkoord hangt aan waar de tekst heen gaat; wijzigt dat, dan opnieuw vragen.
 */
export function akkoordSleutel(m: Pick<DienstMotor, 'id' | 'soort' | 'aanbieder' | 'url' | 'model'>): string {
  return `${m.id}@${fnv([m.soort, m.aanbieder || '', (m.url || '').toLowerCase(), m.model || ''].join('|'))}`;
}

export type DienstInvoer = { id?: unknown; soort?: unknown; naam?: unknown; aanbieder?: unknown; url?: unknown; model?: unknown; limietPerDag?: unknown };
export type DienstInvoerUitkomst =
  | { ok: true; waarde: { id: string; soort: DienstSoort; naam: string; aanbieder?: AiAanbiederId; url?: string; model?: string; limietPerDag: number } }
  | { ok: false; code: string; uk: string; nl: string };

const fout = (code: string, uk: string, nl: string): DienstInvoerUitkomst => ({ ok: false, code, uk, nl });

/** Адреси, куди сервер не звертається ніколи, навіть на прохання власника: службові метадані хмар. */
const VERBODEN_HOSTS = /^(169\.254\.\d+\.\d+|metadata\.google\.internal|metadata|fd00:ec2::254|\[fd00:ec2::254\])$/i;

/** Адреса власного сервера: лише http(s), без логіна в адресі, без запиту й фрагмента. Повертає адресу без кінцевої скісної риски. */
export function normaliseerDienstUrl(raw: unknown): string | null {
  const tekst = String(raw ?? '').trim();
  if (!tekst || tekst.length > 300) return null;
  let u: URL;
  try { u = new URL(tekst); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || u.search || u.hash) return null;
  if (!u.hostname || VERBODEN_HOSTS.test(u.hostname)) return null;
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

export function normaliseerDienstInvoer(raw: DienstInvoer): DienstInvoerUitkomst {
  const id = String(raw.id ?? '').trim().toLowerCase();
  if (!DIENST_ID_RE.test(id)) return fout('DIENST_ID_ONGELDIG', 'Коротка назва: латинські літери, цифри й дефіс, 2–31 знак, починається з літери.', 'Korte naam: Latijnse letters, cijfers en koppelteken, 2–31 tekens, begint met een letter.');
  const soort = String(raw.soort ?? '') as DienstSoort;
  if (!DIENST_SOORTEN.includes(soort)) return fout('DIENST_SOORT_ONGELDIG', 'Оберіть вид рушія.', 'Kies het soort motor.');
  const naam = String(raw.naam ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!naam) return fout('DIENST_NAAM_LEEG', 'Дайте рушієві назву, яку побачать користувачі.', 'Geef de motor een naam die gebruikers zien.');
  const limiet = Math.round(Number(raw.limietPerDag ?? DIENST_LIMIET.standaard));
  if (!Number.isFinite(limiet) || limiet < DIENST_LIMIET.min || limiet > DIENST_LIMIET.max) {
    return fout('DIENST_LIMIET_ONGELDIG', `Денна межа на людину: від ${DIENST_LIMIET.min} до ${DIENST_LIMIET.max} запитів.`, `Daglimiet per persoon: ${DIENST_LIMIET.min} tot ${DIENST_LIMIET.max} verzoeken.`);
  }
  const model = String(raw.model ?? '').trim().slice(0, 120);
  if (model && !/^[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(model)) return fout('DIENST_MODEL_ONGELDIG', 'Назва моделі містить недозволені знаки.', 'De modelnaam bevat niet-toegestane tekens.');
  if (soort === 'aanbieder') {
    const aanbieder = String(raw.aanbieder ?? '') as AiAanbiederId;
    if (!AI_AANBIEDER_BIJ_ID[aanbieder]) return fout('DIENST_AANBIEDER_ONGELDIG', 'Оберіть постачальника ШІ.', 'Kies de AI-aanbieder.');
    return { ok: true, waarde: { id, soort, naam, aanbieder, model: model || undefined, limietPerDag: limiet } };
  }
  const url = normaliseerDienstUrl(raw.url);
  if (!url) return fout('DIENST_URL_ONGELDIG', 'Адреса сервера: повна, з http:// або https://, без логіна й параметрів.', 'Serveradres: volledig, met http:// of https://, zonder login en parameters.');
  if (soort === 'ollama' && !model) return fout('DIENST_MODEL_NODIG', 'Для Ollama вкажіть модель, яку вже завантажено на сервері (наприклад, gemma3:4b).', 'Geef voor Ollama het model op dat al op de server staat (bijvoorbeeld gemma3:4b).');
  return { ok: true, waarde: { id, soort, naam, url, model: model || undefined, limietPerDag: limiet } };
}

/** Чи готовий рушій обслуговувати людей: увімкнено й має все потрібне. */
export function dienstKlaar(m: DienstMotor): boolean {
  if (!m.aan) return false;
  return m.soort === 'aanbieder' ? m.heeftSleutel && Boolean(m.aanbieder) : Boolean(m.url);
}

export function dienstPubliek(m: DienstMotor, vandaag: number, akkoorden: readonly string[]): DienstMotorPubliek {
  const sleutel = akkoordSleutel(m);
  return {
    id: m.id, soort: m.soort, naam: m.naam, aanbieder: m.aanbieder, model: m.model, host: m.soort === 'aanbieder' ? undefined : hostVan(m.url),
    functies: dienstFuncties(m.soort), limietPerDag: m.limietPerDag, vandaag, beheerder: m.beheerder, akkoord: akkoorden.includes(sleutel), akkoordSleutel: sleutel,
  };
}

/** Куди піде текст — одним чесним реченням (картка рушія, вікно згоди, рядок «Обробляє: …»). */
export function dienstWaarheen(m: Pick<DienstMotorPubliek, 'soort' | 'aanbieder' | 'host' | 'beheerder'>, nl = false): string {
  const wie = m.beheerder || (nl ? 'de beheerder' : 'адміністратор');
  if (m.soort === 'aanbieder') {
    const naam = m.aanbieder ? (nl ? AI_AANBIEDER_BIJ_ID[m.aanbieder].naamNl : AI_AANBIEDER_BIJ_ID[m.aanbieder].naamUk) : (nl ? 'de aanbieder' : 'постачальник');
    return nl
      ? `Naar ${naam}, met de sleutel van de site (${wie} betaalt). De aanbieder ziet de tekst; de site bewaart hem niet.`
      : `До ${naam}, ключем сайту (платить ${wie}). Постачальник бачить текст; сайт його не зберігає.`;
  }
  const waar = m.host || (nl ? 'de eigen server' : 'власний сервер');
  return nl
    ? `Naar de eigen server van de site (${waar}), niet naar een AI-bedrijf. Wie die server beheert (${wie}), kan technisch de tekst zien.`
    : `На власний сервер сайту (${waar}), а не до ШІ-компанії. Той, хто керує цим сервером (${wie}), технічно може бачити текст.`;
}

export function dienstSoortNaam(soort: DienstSoort, nl = false): string {
  if (soort === 'aanbieder') return nl ? 'Sleutel van de site bij een aanbieder' : 'Ключ сайту в постачальника';
  if (soort === 'libretranslate') return nl ? 'LibreTranslate op eigen server' : 'LibreTranslate на власному сервері';
  return nl ? 'Ollama op eigen server' : 'Ollama на власному сервері';
}

/** Ризики для власника — показуються зі знаком «!» перед увімкненням (типово вимкнено). */
export function dienstRisicos(m: Pick<DienstMotor, 'soort' | 'aanbieder'>, nl = false): string[] {
  const uit: string[] = [];
  if (m.soort === 'aanbieder') {
    uit.push(nl
      ? 'Elk verzoek van elke gebruiker gaat op kosten van deze sleutel. De daglimiet per persoon begrenst dat; stel ook een uitgavenlimiet in bij de aanbieder zelf.'
      : 'Кожен запит кожного користувача йде коштом цього ключа. Денна межа на людину це обмежує; встановіть також ліміт витрат у самого постачальника.');
    uit.push(nl
      ? 'De tekst van brieven van gebruikers gaat naar de aanbieder onder úw account. U ziet de tekst niet, de aanbieder wel.'
      : 'Текст листів користувачів піде постачальнику під ВАШИМ обліковим записом. Ви тексту не бачите, постачальник бачить.');
    if (m.aanbieder === 'gemini') uit.push(nl
      ? 'Gemini: voor gebruikers in de EER, Zwitserland en het VK eisen de voorwaarden van Google het betaalde niveau. Op het gratis niveau gebruikt Google de inhoud om producten te verbeteren en kunnen beoordelaars hem lezen — gebruik dus geen gratis sleutel voor anderen.'
      : 'Gemini: для користувачів у ЄЕЗ, Швейцарії та Великій Британії умови Google вимагають платний рівень. На безкоштовному рівні Google використовує вміст для покращення продуктів і його можуть читати рецензенти — тож не давайте іншим безкоштовний ключ.');
    if (m.aanbieder === 'autoclaw') uit.push(nl ? 'Z.ai verwerkt gegevens op servers in China.' : 'Z.ai обробляє дані на серверах у Китаї.');
  } else {
    uit.push(nl
      ? 'De tekst van brieven gaat naar uw server. Zorg dat die niets logt wat u niet wilt bewaren, en dat alleen u erbij kunt.'
      : 'Текст листів піде на ваш сервер. Подбайте, щоб він не журналював того, чого ви не хочете зберігати, і щоб доступ до нього мали лише ви.');
    uit.push(nl
      ? 'Staat het adres op http:// buiten de eigen machine, dan reist de tekst onversleuteld over het netwerk.'
      : 'Якщо адреса http:// і сервер не на цій самій машині, текст іде мережею незашифрованим.');
  }
  return uit;
}
