// Тимчасова пауза під час входу, перемикання облікового запису та підтвердження доступу (HTTP 429 / RATE_LIMITED / ACCESS_LOCKED_TEMPORARILY).
// Єдине джерело правди для всієї клієнтської частини: точний зворотний відлік у секундах/хвилинах, чесне пояснення встановленого ліміту
// двома мовами (uk/nl), без сирих машинних кодів і без суперечливих порад.
import { useCallback, useEffect, useState } from 'react';

export type AanmeldTaal = 'uk' | 'nl';
export type PauzeSoort = 'google' | 'wissel' | 'telegram' | 'bevestig' | 'gast' | 'koppel';
export type PauzeLimiet = { maxAttempts?: number; windowSec?: number };

const PAUZE_OPSLAG = 'mr-aanmeld-pauze-v1';
const PAUZE_EVENT = 'tsv:aanmeld-pauze';
const VRIJ_ZICHTBAAR_MS = 8_000;

const PAUZE_CODES = new Set([
  'RATE_LIMITED',
  'LOGIN_RATE_LIMITED',
  'ACCESS_LOCKED_TEMPORARILY',
  'GAST_GEBLOKKEERD',
  'METHODE_PAUZE',
  'CODEWOORD_GEBLOKKEERD',
  'SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD',
  'TE_VEEL_POGINGEN',
  'TE_VEEL_STROMEN',
  'ECOSYSTEEM_TE_VEEL_VERZOEKEN',
]);

export type GelezenPauze = {
  isPauze: boolean;
  code: string;
  status: number;
  seconden: number;
  maxAttempts: number;
  windowSec: number;
};

const begrensSeconden = (n: number, standaard = 60): number => {
  if (!Number.isFinite(n) || n <= 0) return standaard;
  return Math.min(86_400, Math.max(1, Math.ceil(n)));
};

const positiefGeheel = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
};

function leesRetryAfterUitHeaders(headers: unknown): number {
  if (!headers || typeof headers !== 'object') return 0;
  let ruw = '';
  const metGet = headers as { get?: (naam: string) => string | null };
  if (typeof metGet.get === 'function') {
    ruw = String(metGet.get('retry-after') || metGet.get('Retry-After') || '').trim();
  } else {
    const map = headers as Record<string, unknown>;
    for (const [sleutel, waarde] of Object.entries(map)) {
      if (sleutel.toLowerCase() === 'retry-after' && waarde !== undefined && waarde !== null) {
        ruw = String(Array.isArray(waarde) ? waarde[0] : waarde).trim();
        break;
      }
    }
  }
  if (!ruw) return 0;
  const sec = Number(ruw);
  if (Number.isFinite(sec) && sec > 0) return begrensSeconden(sec, 0);
  const datum = Date.parse(ruw);
  return Number.isFinite(datum) && datum > Date.now() ? begrensSeconden((datum - Date.now()) / 1000, 0) : 0;
}

/** Розпізнає відповідь HTTP 429 або код тимчасової паузи й повертає точний час очікування та параметри ліміту. */
export function leesAanmeldPauze(caught: unknown): GelezenPauze {
  if (!caught || typeof caught !== 'object') {
    return { isPauze: false, code: '', status: 0, seconden: 0, maxAttempts: 0, windowSec: 0 };
  }
  const item = caught as {
    status?: unknown;
    retryAfter?: unknown;
    maxAttempts?: unknown;
    windowSec?: unknown;
    reasonCode?: unknown;
    message?: unknown;
    headers?: unknown;
    response?: { status?: unknown; data?: unknown; headers?: unknown };
    data?: unknown;
  };
  const respData = item.response?.data && typeof item.response.data === 'object' ? (item.response.data as Record<string, unknown>) : null;
  const eigenData = item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : null;
  const data = respData || eigenData || {};
  const status = positiefGeheel(item.status) || positiefGeheel(item.response?.status);
  const ruwCode = String(data.error || data.reasonCode || item.reasonCode || item.message || '').trim();
  const code = /^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(ruwCode) ? ruwCode : '';
  const isPauze = status === 429 || PAUZE_CODES.has(code) || /_RATE_LIMITED$/.test(code);
  if (!isPauze) {
    return { isPauze: false, code, status, seconden: 0, maxAttempts: 0, windowSec: 0 };
  }

  let uitVeld = positiefGeheel(item.retryAfter) || positiefGeheel(data.retryAfter);
  if (!uitVeld) {
    uitVeld = leesRetryAfterUitHeaders(item.response?.headers) || leesRetryAfterUitHeaders(item.headers);
  }
  if (!uitVeld && typeof data.pauzeTot === 'string') {
    const totMs = Date.parse(data.pauzeTot);
    if (Number.isFinite(totMs) && totMs > Date.now()) uitVeld = Math.ceil((totMs - Date.now()) / 1000);
  }
  const maxAttempts = positiefGeheel(item.maxAttempts) || positiefGeheel(data.maxAttempts);
  const windowSec = positiefGeheel(item.windowSec) || positiefGeheel(data.windowSec);
  const standaard = code === 'ACCESS_LOCKED_TEMPORARILY' ? 900 : 60;
  return {
    isPauze: true,
    code: code || 'RATE_LIMITED',
    status: status || 429,
    seconden: begrensSeconden(uitVeld, standaard),
    maxAttempts,
    windowSec,
  };
}

/** Людський запис тривалості без іншомовних скорочень: «42 с» / «42 s», «1 хв 15 с» / «1 min 15 s», «1 год 5 хв» / «1 u 5 min». */
export function duurTekst(seconden: number, lang: AanmeldTaal): string {
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

function vensterWoord(windowSec: number, lang: AanmeldTaal): string {
  const w = Math.max(1, Math.ceil(windowSec));
  if (w === 60) return lang === 'nl' ? 'minuut' : 'хвилину';
  if (w === 300) return lang === 'nl' ? '5 minuten' : '5 хвилин';
  if (w === 600) return lang === 'nl' ? '10 minuten' : '10 хвилин';
  if (w === 3600) return lang === 'nl' ? 'uur' : 'годину';
  return duurTekst(w, lang);
}

function pogingenWoordUk(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'спроб';
  if (mod10 === 1) return 'спроби';
  if (mod10 >= 2 && mod10 <= 4) return 'спроби';
  return 'спроб';
}

function limietZin(limiet: PauzeLimiet | undefined, lang: AanmeldTaal): string {
  const max = positiefGeheel(limiet?.maxAttempts);
  const venster = positiefGeheel(limiet?.windowSec);
  if (!max || !venster) return '';
  const vw = vensterWoord(venster, lang);
  return lang === 'nl'
    ? `Ter bescherming zijn hoogstens ${max} pogingen per ${vw} vanaf hetzelfde netwerk toegestaan.`
    : `Для захисту дозволено не більше ${max} ${pogingenWoordUk(max)} за ${vw} з однієї мережі.`;
}

/** Узгоджені двомовні тексти тимчасової паузи для кнопок, карток і діалогових вікон. */
export function aanmeldPauzeBericht(
  seconden: number,
  lang: AanmeldTaal,
  soort: PauzeSoort = 'google',
  limiet?: PauzeLimiet,
): {
  knop: string;
  kop: string;
  uitleg: string;
  melding: string;
  vrij: string;
} {
  const d = duurTekst(seconden, lang);
  const knop = lang === 'nl' ? `Wacht nog ${d}` : `Зачекайте ${d}`;
  const extraLimiet = limietZin(limiet, lang);
  const vrij = lang === 'nl'
    ? 'De korte pauze is voorbij — de knop is weer actief, u kunt rustig doorgaan.'
    : 'Тимчасова пауза минула — кнопка знову активна, можна спокійно продовжити.';

  if (soort === 'wissel') {
    return lang === 'nl'
      ? {
          knop,
          kop: `Korte pauze bij het wisselen — nog ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Er werd net te vaak achter elkaar van account gewisseld vanaf dit netwerk. '}Uw sessie en gegevens zijn veilig; zodra het aftellen klaar is, werkt de keuze vanzelf weer.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Te veel accountwissels kort na elkaar vanaf dit netwerk. '}Wacht ${d} en kies het account daarna opnieuw — uw gegevens zijn veilig.`,
          vrij,
        }
      : {
          knop,
          kop: `Коротка пауза перед перемиканням — залишилося ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Із цієї мережі щойно занадто часто поспіль перемикали облікові записи. '}Ваша сесія й дані в безпеці; щойно відлік завершиться, вибір увімкнеться сам.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Забагато перемикань облікового запису поспіль із цієї мережі. '}Зачекайте ${d} і повторіть вибір — ваші дані в безпеці.`,
          vrij,
        };
  }

  if (soort === 'bevestig') {
    return lang === 'nl'
      ? {
          knop,
          kop: `Korte pauze voor de volgende bevestiging — nog ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Er zijn net te veel bevestigingspogingen kort na elkaar gedaan. '}Uw account blijft beschermd; zodra het aftellen klaar is, kunt u de handeling opnieuw bevestigen.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Te veel bevestigingspogingen in korte tijd. '}Wacht ${d} voordat u opnieuw bevestigt.`,
          vrij,
        }
      : {
          knop,
          kop: `Тимчасова пауза перед підтвердженням — залишилося ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Щойно виконано забагато спроб підтвердження поспіль. '}Ваш обліковий запис захищено; щойно відлік завершиться, ви зможете підтвердити дію.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Забагато спроб підтвердження за короткий час. '}Зачекайте ${d} перед наступною спробою.`,
          vrij,
        };
  }

  if (soort === 'gast') {
    return lang === 'nl'
      ? {
          knop,
          kop: `Korte pauze op dit netwerk — nog ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Er zijn vanaf dit netwerk te veel pogingen achter elkaar gedaan. '}Zodra het aftellen klaar is, wordt de knop vanzelf weer actief en kunt u de toegangscode invoeren.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Te veel pogingen vanaf dit netwerk. '}Wacht ${d} en probeer het daarna opnieuw.`,
          vrij,
        }
      : {
          knop,
          kop: `Тимчасова пауза для цієї мережі — залишилося ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Із цієї мережі щойно зроблено забагато спроб поспіль. '}Щойно відлік завершиться, кнопка ввімкнеться сама й ви зможете ввести код доступу.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Забагато спроб із цієї мережі. '}Зачекайте ${d} і спробуйте знову.`,
          vrij,
        };
  }

  if (soort === 'koppel') {
    return lang === 'nl'
      ? {
          knop,
          kop: `Korte pauze voor het koppelen — nog ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Er zijn in korte tijd te veel koppelverzoeken gestart. '}Wacht tot het aftellen klaar is en start het koppelen daarna opnieuw.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Te veel koppelpogingen in korte tijd. '}Wacht ${d} en probeer daarna opnieuw.`,
          vrij,
        }
      : {
          knop,
          kop: `Тимчасова пауза перед прив’язкою — залишилося ${d}`,
          uitleg: `${extraLimiet ? `${extraLimiet} ` : 'За короткий час запущено забагато запитів на прив’язку. '}Дочекайтеся завершення відліку й почніть прив’язку знову.`,
          melding: `${extraLimiet ? `${extraLimiet} ` : 'Забагато спроб прив’язки за короткий час. '}Зачекайте ${d} і спробуйте знову.`,
          vrij,
        };
  }

  return lang === 'nl'
    ? {
        knop,
        kop: `Korte pauze voor de volgende aanmeldpoging — nog ${d}`,
        uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Vanaf dit netwerk kwamen net te veel aanmeldverzoeken kort na elkaar binnen. '}Uw account is niet geblokkeerd en zodra het aftellen klaar is, wordt de knop vanzelf weer actief.`,
        melding: `${extraLimiet ? `${extraLimiet} ` : 'Te veel aanmeldpogingen kort na elkaar vanaf dit netwerk. '}Wacht ${d} en probeer het daarna opnieuw — uw account is veilig.`,
        vrij: 'De korte pauze is voorbij — de knop is weer actief, u kunt zich rustig aanmelden.',
      }
    : {
        knop,
        kop: `Тимчасова пауза перед наступною спробою — залишилося ${d}`,
        uitleg: `${extraLimiet ? `${extraLimiet} ` : 'Із цієї мережі щойно надійшло забагато запитів на вхід поспіль. '}Ваш обліковий запис не заблоковано, і щойно відлік завершиться, кнопка ввімкнеться сама.`,
        melding: `${extraLimiet ? `${extraLimiet} ` : 'Забагато спроб входу за короткий час із цієї мережі. '}Зачекайте ${d} і спробуйте знову — ваш обліковий запис у безпеці.`,
        vrij: 'Тимчасова пауза минула — кнопка знову активна, можна спокійно увійти.',
      };
}

/** Людське повідомлення для помилок старту входу (включно з 429, мережею та перевантаженням сервера). */
export function aanmeldStartFoutTekst(caught: unknown, lang: AanmeldTaal): string {
  const pauze = leesAanmeldPauze(caught);
  if (pauze.isPauze) {
    return aanmeldPauzeBericht(pauze.seconden, lang, 'google', {
      maxAttempts: pauze.maxAttempts,
      windowSec: pauze.windowSec,
    }).melding;
  }
  const item = (caught && typeof caught === 'object' ? caught : {}) as {
    status?: unknown;
    reasonCode?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: Record<string, unknown> };
  };
  const status = positiefGeheel(item.status) || positiefGeheel(item.response?.status);
  const code = String(item.response?.data?.error || item.response?.data?.reasonCode || item.reasonCode || item.message || '');
  if (code === 'NETWORK_ERROR' || (status === 0 && /network|fetch/i.test(code))) {
    return lang === 'nl'
      ? 'Geen verbinding met de server. Controleer uw internetverbinding en probeer opnieuw.'
      : 'Немає зв’язку із сервером. Перевірте з’єднання з інтернетом і спробуйте ще раз.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return lang === 'nl'
      ? 'De server is heel even niet bereikbaar (mogelijk een korte bijwerking). Wacht enkele seconden en probeer opnieuw.'
      : 'Сервер тимчасово недоступний (імовірно, триває коротке оновлення). Зачекайте кілька секунд і спробуйте ще раз.';
  }
  if (code === 'OWNER_STEP_UP_SESSION_REQUIRED') {
    return lang === 'nl'
      ? 'Uw sessie is intussen verlopen. Vernieuw de pagina en meld u opnieuw aan.'
      : 'Ваша сесія вже завершилася. Оновіть сторінку й увійдіть знову.';
  }
  return lang === 'nl'
    ? 'Het starten van de aanmelding is niet gelukt. Vernieuw zo nodig de pagina en probeer het rustig opnieuw.'
    : 'Не вдалося розпочати вхід. За потреби оновіть сторінку й спокійно спробуйте ще раз.';
}

/* ---------- Спільний стан паузи вкладки (для SignedOutCenter і контролерів входу) ---------- */

type OpgeslagenPauze = {
  tot: number;
  soort: PauzeSoort;
  code: string;
  maxAttempts?: number;
  windowSec?: number;
};

const leesOpgeslagen = (): OpgeslagenPauze | null => {
  try {
    const ruw = sessionStorage.getItem(PAUZE_OPSLAG);
    if (!ruw) return null;
    const parsed = JSON.parse(ruw) as Partial<OpgeslagenPauze>;
    const tot = Number(parsed?.tot || 0);
    if (!Number.isFinite(tot) || tot <= Date.now()) {
      sessionStorage.removeItem(PAUZE_OPSLAG);
      return null;
    }
    const soort = (['google', 'wissel', 'telegram', 'bevestig', 'gast', 'koppel'] as const).includes(parsed.soort as PauzeSoort)
      ? (parsed.soort as PauzeSoort)
      : 'google';
    return {
      tot,
      soort,
      code: String(parsed.code || 'RATE_LIMITED'),
      maxAttempts: positiefGeheel(parsed.maxAttempts) || undefined,
      windowSec: positiefGeheel(parsed.windowSec) || undefined,
    };
  } catch {
    return null;
  }
};

export function leesActieveAanmeldPauze(): { actief: boolean; resterend: number; soort: PauzeSoort; limiet: PauzeLimiet } {
  const p = leesOpgeslagen();
  if (!p) return { actief: false, resterend: 0, soort: 'google', limiet: {} };
  const resterend = Math.max(0, Math.ceil((p.tot - Date.now()) / 1000));
  return {
    actief: resterend > 0,
    resterend,
    soort: p.soort,
    limiet: { maxAttempts: p.maxAttempts, windowSec: p.windowSec },
  };
}

export function zetAanmeldPauze(
  seconden: number,
  soort: PauzeSoort = 'google',
  code = 'RATE_LIMITED',
  limiet?: PauzeLimiet,
): void {
  const sec = begrensSeconden(seconden, 60);
  const tot = Date.now() + sec * 1000;
  const detail: OpgeslagenPauze = {
    tot,
    soort,
    code,
    ...(positiefGeheel(limiet?.maxAttempts) ? { maxAttempts: positiefGeheel(limiet?.maxAttempts) } : {}),
    ...(positiefGeheel(limiet?.windowSec) ? { windowSec: positiefGeheel(limiet?.windowSec) } : {}),
  };
  try {
    sessionStorage.setItem(PAUZE_OPSLAG, JSON.stringify(detail));
  } catch { /* анонімне вікно без сховища */ }
  try {
    window.dispatchEvent(new CustomEvent(PAUZE_EVENT, { detail }));
  } catch { /* середовище без window */ }
}

export function wisAanmeldPauze(): void {
  try { sessionStorage.removeItem(PAUZE_OPSLAG); } catch { /* negeren */ }
  try { window.dispatchEvent(new CustomEvent(PAUZE_EVENT, { detail: null })); } catch { /* negeren */ }
}

export function useAanmeldPauze(): {
  actief: boolean;
  resterend: number;
  zojuistVrij: boolean;
  soort: PauzeSoort;
  limiet: PauzeLimiet;
} {
  const [staat, setStaat] = useState<{ tot: number; soort: PauzeSoort; vrijTot: number; limiet: PauzeLimiet }>(() => {
    const p = leesOpgeslagen();
    return {
      tot: p ? p.tot : 0,
      soort: p ? p.soort : 'google',
      vrijTot: 0,
      limiet: p ? { maxAttempts: p.maxAttempts, windowSec: p.windowSec } : {},
    };
  });
  const [nu, setNu] = useState(() => Date.now());

  useEffect(() => {
    const bijEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<OpgeslagenPauze | null>).detail;
      const p = detail && Number.isFinite(detail.tot) && detail.tot > Date.now() ? detail : leesOpgeslagen();
      setNu(Date.now());
      setStaat((oud) => ({
        tot: p ? p.tot : 0,
        soort: p ? p.soort : oud.soort,
        vrijTot: 0,
        limiet: p ? { maxAttempts: p.maxAttempts, windowSec: p.windowSec } : {},
      }));
    };
    window.addEventListener(PAUZE_EVENT, bijEvent);
    return () => window.removeEventListener(PAUZE_EVENT, bijEvent);
  }, []);

  useEffect(() => {
    if (staat.tot <= nu && staat.vrijTot <= nu) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNu(t);
      setStaat((oud) => {
        if (oud.tot > 0 && oud.tot <= t) {
          try { sessionStorage.removeItem(PAUZE_OPSLAG); } catch { /* negeren */ }
          return { tot: 0, soort: oud.soort, vrijTot: t + VRIJ_ZICHTBAAR_MS, limiet: {} };
        }
        if (oud.vrijTot > 0 && oud.vrijTot <= t) return { ...oud, vrijTot: 0 };
        return oud;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [staat.tot, staat.vrijTot, nu]);

  const resterend = staat.tot > nu ? Math.max(1, Math.ceil((staat.tot - nu) / 1000)) : 0;
  return {
    actief: resterend > 0,
    resterend,
    zojuistVrij: resterend === 0 && staat.vrijTot > nu,
    soort: staat.soort,
    limiet: staat.limiet,
  };
}

/** Локальний хук зворотного відліку паузи для окремого вікна чи вбудованої форми. */
export function useAftelPauze(): {
  actief: boolean;
  resterend: number;
  zojuistVrij: boolean;
  limiet: PauzeLimiet;
  startPauze: (seconden: number, limiet?: PauzeLimiet) => void;
  vangPauze: (caught: unknown) => GelezenPauze;
  wis: () => void;
} {
  const [tot, setTot] = useState(0);
  const [vrijTot, setVrijTot] = useState(0);
  const [limiet, setLimiet] = useState<PauzeLimiet>({});
  const [nu, setNu] = useState(() => Date.now());

  const startPauze = useCallback((seconden: number, nieuwLimiet?: PauzeLimiet) => {
    const t = Date.now();
    setNu(t);
    setVrijTot(0);
    setLimiet(nieuwLimiet || {});
    setTot(t + begrensSeconden(seconden, 60) * 1000);
  }, []);

  const vangPauze = useCallback((caught: unknown): GelezenPauze => {
    const p = leesAanmeldPauze(caught);
    if (p.isPauze) startPauze(p.seconden, { maxAttempts: p.maxAttempts, windowSec: p.windowSec });
    return p;
  }, [startPauze]);

  const wis = useCallback(() => {
    setTot(0);
    setVrijTot(0);
    setLimiet({});
  }, []);

  useEffect(() => {
    if (tot <= nu && vrijTot <= nu) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNu(t);
      if (tot > 0 && tot <= t) {
        setTot(0);
        setLimiet({});
        setVrijTot(t + VRIJ_ZICHTBAAR_MS);
      } else if (vrijTot > 0 && vrijTot <= t) {
        setVrijTot(0);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [tot, vrijTot, nu]);

  const resterend = tot > nu ? Math.max(1, Math.ceil((tot - nu) / 1000)) : 0;
  return {
    actief: resterend > 0,
    resterend,
    zojuistVrij: resterend === 0 && vrijTot > nu,
    limiet,
    startPauze,
    vangPauze,
    wis,
  };
}
