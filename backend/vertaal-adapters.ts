// UPD-012 (20.11.2026): чисті серверні адаптери зовнішніх та власних служб перекладу
// (Google Cloud Translation v2, DeepL Free/Pro, власний захищений вузол) із примусовим дотриманням VertaalPrivacyModus.
// Жодних журналів ключів або тексту листів; перенаправлення (redirect) заборонені; обмежений час очікування.
// Zuivere serveradapters voor vertaaldiensten met afgedwongen privacymodus, zonder loggen van sleutels of inhoud.
import { stripTrackingAndSecrets } from '../shared/ai-vertaling';
import { normaliseerDienstUrl, type VertaalPrivacyModus } from '../shared/ai-dienst-motor';

export const GOOGLE_TRANSLATE_V2_URL = 'https://translation.googleapis.com/language/translate/v2';
export const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
export const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';

const STANDAARD_TIMEOUT_MS = 30_000;
const EIGEN_KNOOP_TIMEOUT_MS = 45_000;
const MAX_TEKST_LENGTE = 200_000;

export class VertaalAdapterFout extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message || code);
    this.name = 'VertaalAdapterFout';
    this.code = code;
    this.status = status;
  }
}

/**
 * Посилене очищення чутливих даних перед відправленням тексту до зовнішнього сервісу в режимі `extern-gezuiverd`.
 * Вирізає токени `tvh_`, `mr3f_`, `Bearer`, `DeepL-Auth-Key`, довгі секретні ключі, IBAN, а також параметри стеження
 * й чутливі параметри у посиланнях (`utm_*`, `token=`, `code=`, `key=`, `sig=` тощо), замінюючи їх безпечними маркерами.
 * Versterkte zuivering vóór verzending naar een externe vertaaldienst in de modus `extern-gezuiverd`.
 */
export function zuiverTekstVoorExtern(tekst: string): string {
  const begrensd = String(tekst ?? '').slice(0, MAX_TEKST_LENGTE);
  if (!begrensd) return '';

  // 1. Базове лінійне очищення трекінгових пікселів, маркетингових параметрів і таємниць
  let uit = stripTrackingAndSecrets(begrensd).text;

  // 2. Додаткові чутливі параметри у посиланнях (лише в межах URL із http:// або https://, не зачіпаючи звичайну прозу)
  uit = uit.replace(/https?:\/\/[^\s"'<>]+/gi, (link) => {
    const qIndex = link.indexOf('?');
    if (qIndex < 0) return link;
    const basis = link.slice(0, qIndex);
    const rest = link.slice(qIndex + 1);
    const hashIndex = rest.indexOf('#');
    const query = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
    const fragment = hashIndex >= 0 ? rest.slice(hashIndex) : '';
    const delen = query.split('&');
    const schoon: string[] = [];
    for (const deel of delen) {
      if (!deel) continue;
      const eq = deel.indexOf('=');
      const sleutel = (eq >= 0 ? deel.slice(0, eq) : deel).toLowerCase();
      if (/^(?:utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid|mkt_tok|vero_id|_hsenc|_hsmi|rb_clickid)$/.test(sleutel)) {
        continue;
      }
      if (/^(?:token|code|access_token|refresh_token|id_token|api_key|apikey|key|auth|secret|sig|signature|password|passwd|session|session_id|state)$/.test(sleutel)) {
        schoon.push(`${eq >= 0 ? deel.slice(0, eq) : deel}=[ПРИХОВАНО_ПАРАМЕТР]`);
        continue;
      }
      schoon.push(deel);
    }
    return `${basis}${schoon.length ? `?${schoon.join('&')}` : ''}${fragment}`;
  });

  // 3. Окремі токени платформи й заголовки авторизації
  uit = uit
    .replace(/\b(?:tvh|mr3f)_[A-Za-z0-9_-]{8,}\b/g, '[ПРИХОВАНО_ТОКЕН]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, 'Bearer [ПРИХОВАНО_ТОКЕН]')
    .replace(/\bDeepL-Auth-Key\s+[A-Za-z0-9:_-]{8,}\b/gi, 'DeepL-Auth-Key [ПРИХОВАНО_ТОКЕН]');

  // 4. Міжнародні банківські рахунки IBAN (15–34 символи без пробілів/дефісів; 2 літери країни + 2 контрольні цифри)
  uit = uit.replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{2,4}){3,8}\b/g, (kandidaat) => {
    const compact = kandidaat.replace(/[\s-]+/g, '');
    if (compact.length < 15 || compact.length > 34) return kandidaat;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return kandidaat;
    return '[ПРИХОВАНО_IBAN]';
  });

  // 5. Довгі шістнадцяткові та високоентропійні секретні ключі (32+ символи без пробілів)
  uit = uit.replace(/\b[0-9a-fA-F]{32,128}\b/g, '[ПРИХОВАНО_КЛЮЧ]');
  uit = uit.replace(/\b(?=[A-Za-z0-9_-]{36,128}\b)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z0-9_-]{36,128}\b/g, '[ПРИХОВАНО_КЛЮЧ]');

  return uit;
}

function controleerPrivacy(privacyModus: VertaalPrivacyModus, extern: boolean): void {
  if (privacyModus === 'lokaal-alleen') {
    throw new VertaalAdapterFout('PRIVACY_LOKAAL_ALLEEN', 403, 'PRIVACY_LOKAAL_ALLEEN');
  }
  if (extern && privacyModus === 'eigen-server') {
    throw new VertaalAdapterFout('PRIVACY_EIGEN_SERVER_ALLEEN', 403, 'PRIVACY_EIGEN_SERVER_ALLEEN');
  }
}

function bereidTekstenVoor(teksten: readonly string[], privacyModus: VertaalPrivacyModus): string[] {
  return teksten.map((t) => {
    const ruw = String(t ?? '').slice(0, MAX_TEKST_LENGTE);
    return privacyModus === 'extern-gezuiverd' ? zuiverTekstVoorExtern(ruw) : ruw;
  });
}

function normaliseerTaalCode(code: string | undefined): string {
  return String(code ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12);
}

function deeplDoelTaal(code: string): string {
  const c = normaliseerTaalCode(code);
  if (!c) return 'UK';
  if (c === 'en') return 'EN-US';
  if (c === 'pt') return 'PT-PT';
  if (c === 'zh') return 'ZH';
  return c.toUpperCase();
}

function deeplBronTaal(code: string | undefined): string | undefined {
  const c = normaliseerTaalCode(code);
  if (!c || c === 'auto') return undefined;
  return c.split('-')[0].toUpperCase();
}

export type VertaalAdapterUitkomst = {
  vertaald: string;
  bronTaal?: string;
  status: number;
};

export type VertaalReeksUitkomst = {
  vertaald: string[];
  bronTaal?: string;
  status: number;
};

export type GoogleTranslateInvoer = {
  tekst: string;
  bronTaal: string;
  doelTaal: string;
  apiSleutel: string;
  url?: string;
  privacyModus: VertaalPrivacyModus;
  fetchFn?: typeof fetch;
};

export async function vertaalGoogleTranslateReeks(invoer: Omit<GoogleTranslateInvoer, 'tekst'> & { teksten: readonly string[] }): Promise<VertaalReeksUitkomst> {
  controleerPrivacy(invoer.privacyModus, true);
  const sleutel = String(invoer.apiSleutel ?? '').trim();
  if (!sleutel) throw new VertaalAdapterFout('VERTAAL_SLEUTEL_ONTBREEKT', 400);

  const eindpunt = invoer.url ? normaliseerDienstUrl(invoer.url) : GOOGLE_TRANSLATE_V2_URL;
  if (!eindpunt || !eindpunt.startsWith('https://')) {
    throw new VertaalAdapterFout('VERTAAL_URL_ONGELDIG', 400);
  }

  const teksten = bereidTekstenVoor(invoer.teksten, invoer.privacyModus);
  if (teksten.length === 0) return { vertaald: [], status: 200 };

  const bron = normaliseerTaalCode(invoer.bronTaal);
  const doel = normaliseerTaalCode(invoer.doelTaal) || 'uk';
  const fetchFn = invoer.fetchFn ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(eindpunt, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': sleutel,
      },
      body: JSON.stringify({
        q: teksten,
        target: doel,
        format: 'text',
        ...(bron && bron !== 'auto' ? { source: bron } : {}),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(STANDAARD_TIMEOUT_MS),
    });
  } catch {
    throw new VertaalAdapterFout('VERTAAL_NETWERK_FOUT', 0);
  }

  if (!res.ok) {
    throw new VertaalAdapterFout('GOOGLE_TRANSLATE_HTTP_FOUT', res.status);
  }

  const data = await res.json().catch(() => null) as {
    data?: { translations?: Array<{ translatedText?: unknown; detectedSourceLanguage?: unknown }> };
  } | null;
  const lijst = data?.data?.translations;
  if (!Array.isArray(lijst) || lijst.length !== teksten.length) {
    throw new VertaalAdapterFout('GOOGLE_TRANSLATE_ANTWOORD_ONGELDIG', 502);
  }

  const vertaald = lijst.map((item) => String(item?.translatedText ?? ''));
  const eersteBron = lijst.find((item) => typeof item?.detectedSourceLanguage === 'string')?.detectedSourceLanguage;
  return {
    vertaald,
    bronTaal: typeof eersteBron === 'string' && eersteBron ? eersteBron.toLowerCase() : (bron && bron !== 'auto' ? bron : undefined),
    status: res.status,
  };
}

export async function vertaalGoogleTranslate(invoer: GoogleTranslateInvoer): Promise<VertaalAdapterUitkomst> {
  const r = await vertaalGoogleTranslateReeks({ ...invoer, teksten: [invoer.tekst] });
  return { vertaald: r.vertaald[0] ?? '', bronTaal: r.bronTaal, status: r.status };
}

export type DeepLInvoer = {
  tekst: string;
  bronTaal: string;
  doelTaal: string;
  apiSleutel: string;
  url?: string;
  privacyModus: VertaalPrivacyModus;
  fetchFn?: typeof fetch;
};

export function deeplStandaardUrl(apiSleutel: string): string {
  return String(apiSleutel ?? '').trim().endsWith(':fx') ? DEEPL_FREE_URL : DEEPL_PRO_URL;
}

export async function vertaalDeepLReeks(invoer: Omit<DeepLInvoer, 'tekst'> & { teksten: readonly string[] }): Promise<VertaalReeksUitkomst> {
  controleerPrivacy(invoer.privacyModus, true);
  const sleutel = String(invoer.apiSleutel ?? '').trim();
  if (!sleutel) throw new VertaalAdapterFout('VERTAAL_SLEUTEL_ONTBREEKT', 400);

  const eindpunt = invoer.url ? normaliseerDienstUrl(invoer.url) : deeplStandaardUrl(sleutel);
  if (!eindpunt || !eindpunt.startsWith('https://')) {
    throw new VertaalAdapterFout('VERTAAL_URL_ONGELDIG', 400);
  }

  const teksten = bereidTekstenVoor(invoer.teksten, invoer.privacyModus);
  if (teksten.length === 0) return { vertaald: [], status: 200 };

  const bron = deeplBronTaal(invoer.bronTaal);
  const doel = deeplDoelTaal(invoer.doelTaal);
  const fetchFn = invoer.fetchFn ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(eindpunt, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `DeepL-Auth-Key ${sleutel}`,
      },
      body: JSON.stringify({
        text: teksten,
        target_lang: doel,
        ...(bron ? { source_lang: bron } : {}),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(STANDAARD_TIMEOUT_MS),
    });
  } catch {
    throw new VertaalAdapterFout('VERTAAL_NETWERK_FOUT', 0);
  }

  if (!res.ok) {
    throw new VertaalAdapterFout('DEEPL_HTTP_FOUT', res.status);
  }

  const data = await res.json().catch(() => null) as {
    translations?: Array<{ text?: unknown; detected_source_language?: unknown }>;
  } | null;
  const lijst = data?.translations;
  if (!Array.isArray(lijst) || lijst.length !== teksten.length) {
    throw new VertaalAdapterFout('DEEPL_ANTWOORD_ONGELDIG', 502);
  }

  const vertaald = lijst.map((item) => String(item?.text ?? ''));
  const eersteBron = lijst.find((item) => typeof item?.detected_source_language === 'string')?.detected_source_language;
  return {
    vertaald,
    bronTaal: typeof eersteBron === 'string' && eersteBron ? eersteBron.toLowerCase() : (bron ? bron.toLowerCase() : undefined),
    status: res.status,
  };
}

export async function vertaalDeepL(invoer: DeepLInvoer): Promise<VertaalAdapterUitkomst> {
  const r = await vertaalDeepLReeks({ ...invoer, teksten: [invoer.tekst] });
  return { vertaald: r.vertaald[0] ?? '', bronTaal: r.bronTaal, status: r.status };
}

export type EigenKnoopInvoer = {
  tekst: string;
  bronTaal: string;
  doelTaal: string;
  url: string;
  apiSleutel?: string;
  privacyModus: VertaalPrivacyModus;
  fetchFn?: typeof fetch;
};

export async function vertaalEigenKnoopReeks(invoer: Omit<EigenKnoopInvoer, 'tekst'> & { teksten: readonly string[] }): Promise<VertaalReeksUitkomst> {
  controleerPrivacy(invoer.privacyModus, false);
  const basisUrl = normaliseerDienstUrl(invoer.url);
  if (!basisUrl) throw new VertaalAdapterFout('VERTAAL_URL_ONGELDIG', 400);

  const teksten = bereidTekstenVoor(invoer.teksten, invoer.privacyModus);
  if (teksten.length === 0) return { vertaald: [], status: 200 };

  const sleutel = String(invoer.apiSleutel ?? '').trim();
  const bron = normaliseerTaalCode(invoer.bronTaal) || 'auto';
  const doel = normaliseerTaalCode(invoer.doelTaal) || 'uk';
  const fetchFn = invoer.fetchFn ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(`${basisUrl}/translate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(sleutel ? { authorization: `Bearer ${sleutel}` } : {}),
      },
      body: JSON.stringify({
        q: teksten.length === 1 ? teksten[0] : teksten,
        source: bron,
        target: doel,
        format: 'text',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(EIGEN_KNOOP_TIMEOUT_MS),
    });
  } catch {
    throw new VertaalAdapterFout('VERTAAL_NETWERK_FOUT', 0);
  }

  if (!res.ok) {
    throw new VertaalAdapterFout('EIGEN_KNOOP_HTTP_FOUT', res.status);
  }

  const data = await res.json().catch(() => null) as {
    translatedText?: unknown;
    translations?: Array<{ text?: unknown } | string>;
    text?: unknown;
    detectedLanguage?: unknown;
  } | null;

  let vertaald: string[] = [];
  if (Array.isArray(data?.translatedText)) {
    vertaald = data.translatedText.map((x) => String(x ?? ''));
  } else if (typeof data?.translatedText === 'string') {
    vertaald = [data.translatedText];
  } else if (Array.isArray(data?.translations)) {
    vertaald = data.translations.map((x) => (typeof x === 'string' ? x : String(x?.text ?? '')));
  } else if (typeof data?.text === 'string') {
    vertaald = [data.text];
  }

  if (vertaald.length !== teksten.length) {
    throw new VertaalAdapterFout('EIGEN_KNOOP_ANTWOORD_ONGELDIG', 502);
  }

  const det = Array.isArray(data?.detectedLanguage) ? data.detectedLanguage[0] : data?.detectedLanguage;
  const bronTaal = det && typeof (det as { language?: unknown }).language === 'string'
    ? String((det as { language: string }).language).toLowerCase()
    : (bron !== 'auto' ? bron : undefined);

  return { vertaald, bronTaal, status: res.status };
}

export async function vertaalEigenKnoop(invoer: EigenKnoopInvoer): Promise<VertaalAdapterUitkomst> {
  const r = await vertaalEigenKnoopReeks({ ...invoer, teksten: [invoer.tekst] });
  return { vertaald: r.vertaald[0] ?? '', bronTaal: r.bronTaal, status: r.status };
}
