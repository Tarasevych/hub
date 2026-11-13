// Vriendelijke foutteksten voor /agents (en de MCP-pagina): nooit een kale code als «RATE_LIMITED» op het scherm.
//
// Punt 3 van de audit 19.10.2026: en nooit meer een melding ZONDER feiten. Achter elke zin staat nu één feitenregel met de dienst,
// de code (en de HTTP-status), de route-loze operatie, het tijdstip van de laatste poging en het nummer van die poging — precies
// wat de eigenaar naar ondersteuning kan sturen. De uitleg van codes staat in shared/foutuitleg.ts (één bron voor de hele site);
// hier staat alleen wat eigen is aan de agenten-pagina's. Een code die de site NIET kent, krijgt «причина невідома» met de rauwe
// code, nooit een verzonnen oorzaak en nooit alleen «Спробуйте ще раз».
import { dienstVanHostnaam, feitRegel, onbekendeOorzaak, regelTekst, telPoging, wisPoging, type Lang } from '../../shared/foutuitleg';

type Tr = (uk: string, nl: string) => string;

export function foutCode(e: unknown): { code: string; status: number; retryAfter: number } {
  const x = e as { response?: { data?: { error?: string; reasonCode?: string; retryAfter?: number }; status?: number }; status?: number; message?: string };
  const data = x?.response?.data;
  const code = String(data?.error || data?.reasonCode || x?.message || '').slice(0, 80);
  return { code, status: Number(x?.status || x?.response?.status || 0), retryAfter: Number(data?.retryAfter || 0) };
}

/** Audit 19.10 (U-03): de server zegt dat het account het recht «API-платформа» mist (geldige sessie, geen sessiefout). */
export const RECHT_CODE = 'API_RECHT_VEREIST';
export const isRechtFout = (e: unknown): boolean => !!e && foutCode(e).code === RECHT_CODE;
/** Eén muur voor de hele hub en #extensie: wat er aan de hand is en wie het oplost. */
export const RECHT_UITLEG: [string, string] = [
  'Доступ ШІ для вашого акаунта ще не увімкнено. Попросіть власника дозволити «API-платформу» для вашого облікового запису (Адміністрування → Користувачі та запити доступу). Після цього тут з’являться конектори, розширення браузера, пристрої й токени.',
  'AI-toegang is voor uw account nog niet ingeschakeld. Vraag de eigenaar om «API-platform» voor uw account toe te staan (Beheer → Gebruikers en toegangsverzoeken). Daarna verschijnen hier connectors, de browserextensie, apparaten en tokens.',
];

/** Taal uit de tr-functie van de pagina halen (de pagina's geven alleen tr door). */
const taalVan = (tr: Tr): Lang => (tr('uk', 'nl') === 'nl' ? 'nl' : 'uk');
const dienstNu = () => (typeof location === 'undefined' ? 'hub' : dienstVanHostnaam(location.hostname));
/** Sleutel van de pogingteller: dezelfde operatie op dezelfde dienst telt door (binnen POGING_VENSTER_MS). */
const sleutelVan = (wat?: [string, string]) => `${dienstNu()}|${wat ? wat[0] : 'actie'}`;
/** Na een geslaagde actie: de teller van die operatie begint weer bij 1. */
export const foutGelukt = (wat?: [string, string]) => wisPoging(sleutelVan(wat));

/**
 * Eén zin in gewone taal met de feiten erachter; `wat` beschrijft de mislukte handeling («Не вдалося відкликати»).
 * De zin staat altijd vooraan (die leest de gebruiker), de feiten erachter (die stuurt hij door).
 */
export function foutTekst(e: unknown, tr: Tr, wat?: [string, string]): string {
  const { code, status, retryAfter } = foutCode(e);
  const lang = taalVan(tr);
  const { poging, tijd } = telPoging(sleutelVan(wat));
  // De route van de mislukte aanroep kent deze laag niet (de pagina's geven alleen de fout door); feitRegel zegt dat dan ook.
  const staart = ` ${feitRegel(lang, { dienst: dienstNu(), code: code || (status ? `HTTP_${status}` : ''), status, tijd, poging })}`;
  const begin = wat ? `${tr(wat[0], wat[1])}. ` : '';
  const met = (uk: string, nl: string) => `${begin}${tr(uk, nl)}${staart}`;
  if (code === 'RATE_LIMITED' || status === 429 || /_RATE_LIMITED$/.test(code)) {
    const s = retryAfter > 0 ? retryAfter : 60;
    return `${begin}${tr(`Забагато запитів за короткий час. Зачекайте ${s} с і спробуйте ще раз; списки оновляться самі.`, `Te veel verzoeken in korte tijd. Wacht ${s} s en probeer opnieuw; de lijsten verversen vanzelf.`)}${staart}`;
  }
  if (code === RECHT_CODE) return `${begin}${tr(RECHT_UITLEG[0], RECHT_UITLEG[1])}${staart}`;
  // SEC-002 (toets-g10d №5): een interne fout van een hulpmiddel komt zonder ruwe tekst, met een incidentnummer voor het serverlogboek.
  if (code === 'TOOL_FAILED') {
    const nr = String((e as { response?: { data?: { incident?: unknown } } })?.response?.data?.incident ?? '');
    const veilig = /^[A-Za-z0-9-]{1,40}$/.test(nr) ? nr : '';
    return met(`Інструмент не виконано через внутрішню помилку сервера${veilig ? ` (номер для власника: #${veilig})` : ''}. Спробуйте ще раз; якщо повториться — передайте номер власникові сайту.`, `Het hulpmiddel is niet uitgevoerd door een interne serverfout${veilig ? ` (nummer voor de eigenaar: #${veilig})` : ''}. Probeer het opnieuw; gebeurt het weer, geef het nummer dan door aan de eigenaar van de site.`);
  }
  if (/STEP_UP/.test(code)) return met('Потрібно підтвердити доступ ще раз.', 'U moet de toegang opnieuw bevestigen.');
  if (/SESSION_REQUIRED|SESSION_EXPIRED/.test(code) || status === 401) return met('Сесія закінчилася. Оновіть сторінку й увійдіть знову.', 'De sessie is verlopen. Ververs de pagina en meld u opnieuw aan.');
  if (/NOT_FOUND$/.test(code) || status === 404) return met('Цього вже немає — можливо, його відкликано в іншій вкладці.', 'Dit bestaat niet meer — misschien al ingetrokken in een ander tabblad.');
  if (/^PERMISSION_OFF/.test(code)) return met('Вимкнено у файлі дозволів на сервері.', 'Uitgeschakeld in het rechtenbestand op de server.');
  if (code === 'TOKEN_LIMIT_REACHED') return met('Досягнуто ліміт токенів. Відкличте непотрібні.', 'Limiet van tokens bereikt. Trek overbodige in.');
  if (code === 'AGENT_LIMIT_REACHED') return met('Досягнуто ліміт пристроїв (10). Відключіть непотрібні.', 'Limiet van 10 apparaten bereikt. Koppel overbodige los.');
  if (code === 'USER_BLOCKED') return met('Доступ ШІ для облікового запису заблоковано.', 'AI-toegang voor het account is geblokkeerd.');
  if (code === 'CAPABILITY_OFF' || code === 'CAP_UIT') return met('Цю можливість вимкнено для всіх на сайті.', 'Deze mogelijkheid staat uit voor iedereen op de site.');
  if (code === 'AGENT_UIT') return met('Цей ШІ вимкнено для всіх на сайті.', 'Deze AI staat uit voor iedereen op de site.');
  if (code === 'METHODE_UIT') return met('Цей спосіб підключення вимкнено для всіх на сайті.', 'Deze manier van koppelen staat uit voor iedereen op de site.');
  if (code === 'METHODE_NIET') return met('Цей ШІ так не підключається.', 'Deze AI koppelt niet op deze manier.');
  if (code === 'DEUR_VERBODEN') return met('Двері сервера з приватного підключення недоступні.', 'De serverdeur is niet beschikbaar vanuit een privéverbinding.');
  if (code === 'BELEID_PLAFOND') return met('Підписана політика ШІ зараз стеля. Змінити це тут не можна.', 'Het ondertekende AI-beleid is nu het plafond. Dat wijzigt u hier niet.');
  if (code === 'CAP_TECHNISCH') return met('Це керування сайтом. У вашому підключенні його немає.', 'Dit is sitebeheer. Uw verbinding heeft dat niet.');
  if ((status === 0 && !code) || /Failed to fetch|NetworkError|Network Error|ERR_NETWORK|HTTP_0/.test(code)) return met('Немає зв’язку із сервером. Перевірте мережу.', 'Geen verbinding met de server. Controleer het netwerk.');
  // Rest: de enige bron (shared/foutuitleg.ts) kent de code of de status wél → feitelijke uitleg + «wat nu»; anders eerlijk
  // «причина невідома» met de rauwe code. Nooit meer een losse «Спробуйте ще раз.».
  const uit = regelTekst(lang, code, status);
  if (uit) return `${begin}${uit.waarom} ${uit.doen}${staart}`;
  return `${begin}${onbekendeOorzaak(lang, code, status)}${staart}`;
}
