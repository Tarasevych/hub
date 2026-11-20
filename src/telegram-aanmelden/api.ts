// Client voor de Telegram-routes. Twee vervolgstappen die de server kan vragen:
//   403 STEP_UP_PASSKEY_REQUIRED   → venster «Підтвердіть доступ» met ALLEEN toegangssleutel (Google/TOTP tellen hier niet), daarna één keer opnieuw;
//   403 TELEGRAM_BEVESTIGING_NODIG → de aanroeper toont <Bevestigen> (Telegram-knop of geheime code) en probeert dan opnieuw.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';
import { ecosystemTabContext } from '../tab-context';

export type Ctx = { service: string; tabContext: string; sourceOrigin: string };
export const identiteitCtx = (): Ctx => ({ service: 'identity', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

export type Nodig = { actie: string; ontbreekt: string[]; onbeschikbaar: string[]; /** APPARAAT-001: de hele eis (alternatieven), zodat het venster ook «ander apparaat» kan aanbieden */ eis?: string[][] };
export class BevestigingNodig extends Error { constructor(public nodig: Nodig) { super('TELEGRAM_BEVESTIGING_NODIG'); } }

export const foutCode = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'NETWORK_ERROR');
const data = (e: unknown): Record<string, unknown> => (e instanceof ApiError && e.response?.data && typeof e.response.data === 'object' ? e.response.data as Record<string, unknown> : {});

const PAUZE_CODES = new Set([
  'RATE_LIMITED',
  'LOGIN_RATE_LIMITED',
  'METHODE_PAUZE',
  'ACCESS_LOCKED_TEMPORARILY',
  'TE_VEEL_POGINGEN',
  'TE_VEEL_STROMEN',
  'ECOSYSTEEM_TE_VEEL_VERZOEKEN',
]);

const begrensSeconden = (waarde: number, standaard = 60): number => {
  if (!Number.isFinite(waarde) || waarde <= 0) return standaard;
  return Math.min(86_400, Math.max(1, Math.ceil(waarde)));
};

/** Leest de wachttijd in seconden uit een 429-antwoord (veld retryAfter, kop Retry-After of pauzeTot). */
export function leesRetryAfter(e: unknown): number {
  if (!e || typeof e !== 'object') return 0;
  const item = e as {
    retryAfter?: unknown;
    headers?: { get?: (naam: string) => string | null } | Record<string, unknown>;
    response?: {
      data?: Record<string, unknown> | null;
      headers?: { get?: (naam: string) => string | null } | Record<string, unknown>;
    };
    data?: Record<string, unknown> | null;
  };
  const d = (item.response?.data && typeof item.response.data === 'object'
    ? item.response.data
    : item.data && typeof item.data === 'object'
      ? item.data
      : null) || {};
  const direct = Number(item.retryAfter || d.retryAfter || 0);
  if (Number.isFinite(direct) && direct > 0) return begrensSeconden(direct);
  const hdrs = item.response?.headers || item.headers;
  let ruwKop = '';
  if (hdrs && typeof (hdrs as { get?: unknown }).get === 'function') {
    const g = (hdrs as { get: (naam: string) => string | null }).get;
    ruwKop = String(g.call(hdrs, 'Retry-After') || g.call(hdrs, 'retry-after') || '').trim();
  } else if (hdrs && typeof hdrs === 'object') {
    const rec = hdrs as Record<string, unknown>;
    ruwKop = String(rec['Retry-After'] || rec['retry-after'] || '').trim();
  }
  if (ruwKop) {
    const sec = Number(ruwKop);
    if (Number.isFinite(sec) && sec > 0) return begrensSeconden(sec);
    const datum = Date.parse(ruwKop);
    if (Number.isFinite(datum) && datum > Date.now()) return begrensSeconden((datum - Date.now()) / 1000);
  }
  if (typeof d.pauzeTot === 'string') {
    const totMs = Date.parse(d.pauzeTot);
    if (Number.isFinite(totMs) && totMs > Date.now()) return begrensSeconden((totMs - Date.now()) / 1000);
  }
  return 0;
}

export type GelezenTelegramPauze = { isPauze: boolean; seconden: number; code: string };

export function leesTelegramPauze(e: unknown): GelezenTelegramPauze {
  if (!e || typeof e !== 'object') return { isPauze: false, seconden: 0, code: '' };
  const status = e instanceof ApiError
    ? e.status
    : Number((e as { status?: unknown; response?: { status?: unknown } }).status || (e as { response?: { status?: unknown } }).response?.status || 0) || 0;
  const d = data(e);
  const c = String(d.error || d.reasonCode || foutCode(e) || '').trim();
  const isPauze = status === 429 || PAUZE_CODES.has(c) || /_RATE_LIMITED$/.test(c);
  if (!isPauze) return { isPauze: false, seconden: 0, code: c };
  const uit = leesRetryAfter(e);
  return { isPauze: true, seconden: begrensSeconden(uit, c === 'ACCESS_LOCKED_TEMPORARILY' ? 900 : 60), code: c || 'RATE_LIMITED' };
}

export function pauzeDuurTekst(seconden: number, lang: 'uk' | 'nl'): string {
  const s = Math.max(1, Math.ceil(seconden));
  if (s < 60) return lang === 'nl' ? `${s} s` : `${s} с`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rest = s % 60;
    if (rest === 0) return lang === 'nl' ? `${m} min` : `${m} хв`;
    return lang === 'nl' ? `${m} min ${rest} s` : `${m} хв ${rest} с`;
  }
  const u = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (m === 0 || m === 60) return lang === 'nl' ? `${m === 60 ? u + 1 : u} u` : `${m === 60 ? u + 1 : u} год`;
  return lang === 'nl' ? `${u} u ${m} min` : `${u} год ${m} хв`;
}

export function pauzeBericht(seconden: number, lang: 'uk' | 'nl', soort: 'aanmelden' | 'koppelen' = 'aanmelden'): {
  knop: string;
  kop: string;
  uitleg: string;
  melding: string;
  vrij: string;
} {
  const d = pauzeDuurTekst(seconden, lang);
  const knop = lang === 'nl' ? `Wacht nog ${d}` : `Зачекайте ${d}`;
  if (soort === 'koppelen') {
    return lang === 'nl'
      ? {
          knop,
          kop: `Korte pauze voor het koppelen — nog ${d}`,
          uitleg: 'Er zijn in korte tijd te veel koppelverzoeken gestart. Zodra het aftellen klaar is, wordt de knop vanzelf weer actief.',
          melding: `Te veel koppelpogingen in korte tijd. Wacht ${d} en probeer daarna opnieuw.`,
          vrij: 'De korte pauze is voorbij — u kunt het koppelen weer starten.',
        }
      : {
          knop,
          kop: `Тимчасова пауза перед підключенням — залишилося ${d}`,
          uitleg: 'За короткий час запущено забагато запитів на підключення. Щойно відлік завершиться, кнопка увімкнеться сама.',
          melding: `Забагато спроб підключення за короткий час. Зачекайте ${d} і спробуйте знову.`,
          vrij: 'Тимчасова пауза минула — можна спокійно продовжити підключення.',
        };
  }
  return lang === 'nl'
    ? {
        knop,
        kop: `Korte pauze voor de volgende poging — nog ${d}`,
        uitleg: 'Vanaf dit netwerk kwamen net te veel aanmeldverzoeken kort na elkaar binnen. Uw account is veilig; zodra het aftellen klaar is, wordt de knop vanzelf weer actief.',
        melding: `Te veel pogingen kort na elkaar vanaf dit netwerk. Wacht ${d} en probeer daarna opnieuw — uw account is veilig.`,
        vrij: 'De korte pauze is voorbij — de knop is weer actief, u kunt zich rustig aanmelden.',
      }
    : {
        knop,
        kop: `Тимчасова пауза перед наступною спробою — залишилося ${d}`,
        uitleg: 'Із цієї мережі щойно надійшло забагато запитів на вхід поспіль. Ваш обліковий запис у безпеці; щойно відлік завершиться, кнопка увімкнеться сама.',
        melding: `Забагато спроб за короткий час із цієї мережі. Зачекайте ${d} і спробуйте знову — ваш обліковий запис у безпеці.`,
        vrij: 'Тимчасова пауза минула — кнопка знову активна, можна спокійно увійти.',
      };
}

/** Levende afteller voor HTTP 429: zet de knop op pauze met resterende seconden en maakt haar op 0 s vanzelf weer vrij. */
export function useTelegramPauze() {
  const [tot, setTot] = useState(0);
  const [vrijTot, setVrijTot] = useState(0);
  const [nu, setNu] = useState(() => Date.now());

  const startPauze = useCallback((seconden: number) => {
    const t = Date.now();
    setNu(t);
    setVrijTot(0);
    setTot(t + begrensSeconden(seconden, 60) * 1000);
  }, []);

  const vangPauze = useCallback((caught: unknown): GelezenTelegramPauze => {
    const p = leesTelegramPauze(caught);
    if (p.isPauze) startPauze(p.seconden);
    return p;
  }, [startPauze]);

  const wis = useCallback(() => { setTot(0); setVrijTot(0); }, []);

  useEffect(() => {
    if (tot <= nu && vrijTot <= nu) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNu(t);
      if (tot > 0 && tot <= t) { setTot(0); setVrijTot(t + 8_000); }
      else if (vrijTot > 0 && vrijTot <= t) setVrijTot(0);
    }, 500);
    return () => window.clearInterval(id);
  }, [tot, vrijTot, nu]);

  const resterend = tot > nu ? Math.max(1, Math.ceil((tot - nu) / 1000)) : 0;
  return { actief: resterend > 0, resterend, zojuistVrij: resterend === 0 && vrijTot > nu, startPauze, vangPauze, wis };
}

export async function tgPost<T = unknown>(ctx: Ctx, pad: string, body: Record<string, unknown> = {}, opnieuw = false): Promise<T> {
  try {
    return (await api.post(pad, { ...ctx, ...body })).data as T;
  } catch (e) {
    const code = foutCode(e);
    if (code === 'STEP_UP_PASSKEY_REQUIRED' && !opnieuw) {
      const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], sterk: true });
      if (uit.ok) return tgPost<T>(ctx, pad, body, true);
      throw new Error('PASSKEY_GEANNULEERD');
    }
    if (code === 'TELEGRAM_BEVESTIGING_NODIG') {
      const d = data(e);
      throw new BevestigingNodig({ actie: String(d.actie || ''), ontbreekt: (d.ontbreekt as string[]) || [], onbeschikbaar: (d.onbeschikbaar as string[]) || [], eis: Array.isArray(d.eis) ? (d.eis as string[][]) : [] });
    }
    throw e;
  }
}

/** Openbaar (aanmeldscherm), zonder sessie. */
export async function openbaarPost<T = unknown>(pad: string, body: Record<string, unknown>): Promise<T> { return (await api.post(pad, body)).data as T; }
export async function openbaarGet<T = unknown>(pad: string): Promise<T> { return (await api.get(pad)).data as T; }

/** Leesbare tekst voor elke foutcode van de server; één taal tegelijk (de taal van de pagina). */
const FOUTEN: Record<string, [string, string]> = {
  VLAG_UIT: ['Вхід через Telegram ще не ввімкнено для вашого облікового запису.', 'Aanmelden met Telegram staat nog niet aan voor uw account.'],
  NIET_GEVONDEN: ['Вхід через Telegram ще не ввімкнено для вашого облікового запису.', 'Aanmelden met Telegram staat nog niet aan voor uw account.'],
  UITGESCHAKELD: ['Адміністратор тимчасово вимкнув вхід через Telegram для всіх.', 'De beheerder heeft aanmelden met Telegram tijdelijk voor iedereen uitgezet.'],
  TELEGRAM_UIT: ['Вхід через Telegram зараз вимкнено.', 'Aanmelden met Telegram staat nu uit.'],
  TELEGRAM_NIET_BESCHIKBAAR: ['Вхід через Telegram зараз недоступний. Скористайтеся входом через Google або ключем доступу.', 'Aanmelden met Telegram is nu niet beschikbaar. Gebruik Google of uw toegangssleutel.'],
  NIET_TOEGESTAAN: ['Для вашого облікового запису вхід через Telegram не дозволено.', 'Voor uw account is aanmelden met Telegram niet toegestaan.'],
  LIMIET_BEREIKT: ['Досягнуто ліміту прив’язок Telegram. Спершу відв’яжіть одну з наявних.', 'Het maximum aantal Telegram-koppelingen is bereikt. Ontkoppel eerst een bestaande.'],
  RATE_LIMITED: ['Забагато спроб. Зачекайте хвилину — ваш обліковий запис не заблоковано назавжди.', 'Te veel pogingen. Wacht een minuut — uw account is niet blijvend geblokkeerd.'],
  METHODE_PAUZE: ['Тимчасова пауза після кількох спроб. Дочекайтеся завершення відліку й спробуйте знову.', 'Tijdelijke pauze na meerdere pogingen. Wacht tot het aftellen klaar is en probeer opnieuw.'],
  VERLOPEN: ['Час вийшов. Почніть знову — це безпечно.', 'De tijd is om. Begin opnieuw — dat is veilig.'],
  VERZOEK_ONBEKEND: ['Запит не знайдено або він уже завершився. Почніть знову.', 'Verzoek niet gevonden of al afgerond. Begin opnieuw.'],
  AL_GEKOPPELD: ['Цей Telegram уже прив’язано до вашого облікового запису.', 'Deze Telegram is al aan uw account gekoppeld.'],
  AL_GEBRUIKT: ['Цей запит уже використано. Почніть знову.', 'Dit verzoek is al gebruikt. Begin opnieuw.'],
  NOG_NIET_KLAAR: ['Спершу завершіть кроки в Telegram.', 'Rond eerst de stappen in Telegram af.'],
  KOPPELING_ONBEKEND: ['Прив’язку не знайдено.', 'Koppeling niet gevonden.'],
  LAATSTE_METHODE: ['Це ваш останній спосіб входу — спершу додайте інший.', 'Dit is uw laatste aanmeldmethode — voeg eerst een andere toe.'],
  PASSKEY_GEANNULEERD: ['Підтвердження ключем доступу скасовано — нічого не змінено.', 'Bevestiging met toegangssleutel geannuleerd — er is niets gewijzigd.'],
  TE_SNEL: ['Зачекайте, доки закінчиться відлік, і прочитайте пояснення.', 'Wacht tot het aftellen klaar is en lees de uitleg.'],
  NIET_BEGREPEN: ['Позначте, що ви розумієте наслідки.', 'Vink aan dat u de gevolgen begrijpt.'],
  CODE_ZWAK: ['Код надто простий.', 'De code is te eenvoudig.'],
  KEUZE_TE_ZWAK: ['Цей вибір слабший за мінімум, який задав адміністратор.', 'Deze keuze is zwakker dan het minimum van de beheerder.'],
  METHODE_NIET_INGESTELD: ['Спершу налаштуйте потрібний спосіб — інакше ви не зможете виконати цю дію.', 'Stel eerst de nodige methode in — anders kunt u deze handeling niet uitvoeren.'],
  METHODE_ONBESCHIKBAAR: ['Потрібний спосіб підтвердження зараз не працює. Скористайтеся іншим дозволеним способом.', 'De nodige bevestigingsmethode werkt nu niet. Gebruik een andere toegestane manier.'],
  TELEGRAM_NIET_BEREIKBAAR: ['Не вдалося надіслати запит у Telegram. Перевірте, що бот не заблоковано, або підтвердьте іншим способом.', 'Het verzoek kon niet naar Telegram. Controleer dat de bot niet geblokkeerd is, of bevestig op een andere manier.'],
  METHODE_STORING_LANG: ['Telegram не відповідає вже понад 10 хвилин. Увійдіть іншим способом — ми повідомимо, щойно запрацює.', 'Telegram antwoordt al meer dan 10 minuten niet. Meld u op een andere manier aan — we laten het weten zodra het werkt.'],
  METHODE_STORING_VAST: ['Вхід через Telegram зараз не працює, і повторна спроба не допоможе. Скористайтеся Google або ключем доступу.', 'Aanmelden met Telegram werkt nu niet en opnieuw proberen helpt niet. Gebruik Google of uw toegangssleutel.'],
  AANMELDEN_MISLUKT: ['Не вдалося завершити вхід. Спробуйте інший спосіб.', 'De aanmelding kon niet worden afgerond. Probeer een andere manier.'],
  OWNER_REDIRECT_COMPLETE_FAILED: ['Не вдалося завершити вхід. Оновіть сторінку та спробуйте ще раз.', 'De aanmelding kon niet worden afgerond. Vernieuw de pagina en probeer opnieuw.'],
  LOGIN_BINDING_MISMATCH: ['Вхід почато в іншому оглядачі чи вкладці. Почніть знову тут.', 'De aanmelding begon in een andere browser of een ander tabblad. Begin hier opnieuw.'],
  OWNER_ORIGIN_MISMATCH: ['Вхід розпочато на іншому піддомені. Завершіть його на тій самій сторінці або почніть знову.', 'De aanmelding begon op een ander subdomein. Rond haar op dezelfde pagina af of begin opnieuw.'],
  OWNER_TRANSACTION_SERVICE_INVALID: ['Не вдалося визначити службу цієї сторінки. Оновіть сторінку та спробуйте знову.', 'De dienst van deze pagina kon niet worden bepaald. Vernieuw de pagina en probeer opnieuw.'],
  OWNER_TRANSACTION_TAB_INVALID: ['Дані вкладки застаріли. Оновіть сторінку та почніть вхід знову.', 'De tabbladgegevens zijn verouderd. Vernieuw de pagina en start het aanmelden opnieuw.'],
  OWNER_TRANSACTION_ORIGIN_INVALID: ['Адреса сторінки не збігається з очікуваним доменом. Оновіть сторінку та спробуйте знову.', 'Het pagina-adres komt niet overeen met het verwachte domein. Vernieuw de pagina en probeer opnieuw.'],
  OWNER_TRANSACTION_RETURN_TO_INVALID: ['Адреса повернення після входу недійсна. Оновіть сторінку та спробуйте знову.', 'Het terugkeeradres na het aanmelden is ongeldig. Vernieuw de pagina en probeer opnieuw.'],
  OWNER_TRANSACTION_CREATE_FAILED: ['Сервер тимчасово не зміг створити запит входу. Спробуйте ще раз за кілька секунд.', 'De server kon tijdelijk geen aanmeldverzoek aanmaken. Probeer het over enkele seconden opnieuw.'],
  OWNER_TRANSACTION_INVALID: ['Запит входу недійсний або вже застарів. Почніть знову.', 'Het aanmeldverzoek is ongeldig of verlopen. Begin opnieuw.'],
  TRANSACTION_NOT_ATTACHED: ['Запит входу вже завершено або скасовано. Почніть знову.', 'Het aanmeldverzoek is al afgerond of geannuleerd. Begin opnieuw.'],
  OWNER_USER_NOT_FOUND: ['Обліковий запис не знайдено. Увійдіть через Google.', 'Het account is niet gevonden. Meld u aan met Google.'],
  ACCOUNT_NOT_APPROVED: ['Цей обліковий запис іще не схвалено або доступ обмежено. Увійдіть через Google, щоб перевірити стан доступу.', 'Dit account is nog niet goedgekeurd of de toegang is beperkt. Meld u aan met Google om de toegangsstatus te bekijken.'],
  GEEN_EIGEN_KOPPELING: ['Спершу прив’яжіть власний Telegram у «Способах входу».', 'Koppel eerst uw eigen Telegram bij «Aanmeldmethoden».'],
  BEHEERDER_NODIG: ['Потрібні права адміністратора.', 'Beheerdersrechten vereist.'],
  NETWORK_ERROR: ['Немає з’єднання із сервером. Перевірте інтернет — спроба повториться сама.', 'Geen verbinding met de server. Controleer uw internet — er wordt vanzelf opnieuw geprobeerd.'],
};
export const foutTekst = (lang: 'uk' | 'nl', e: unknown): string => {
  const p = leesTelegramPauze(e);
  if (p.isPauze) return pauzeBericht(p.seconden, lang, 'aanmelden').melding;
  const c = foutCode(e);
  const f = FOUTEN[c];
  return f ? f[lang === 'nl' ? 1 : 0] : lang === 'nl' ? `Er ging iets mis (${c}). Er is niets half gewijzigd.` : `Щось пішло не так (${c}). Нічого не змінено наполовину.`;
};
