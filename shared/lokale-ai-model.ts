// EXT090-001 (06.11.2026): ingebouwde AI van Chrome (Gemini Nano op het apparaat van de gebruiker) — gedeeld model voor de site.
// Вбудований ШІ Chrome — спільна модель для сайту (розширення 0.9.0 має власну копію в extension/lokale-ai.js).
//
// Waarom op de site: de extensie 0.9.0 gebruikt Prompt, Summarizer, Writer, Rewriter, Translator, LanguageDetector en Proofreader
// in haar opties en zijpaneel. De site toont in «Розширення браузера» per API: (1) wat Chrome op DEZE pagina aanbiedt (zelf gemeten
// met availability(), nooit create() — dus nooit een download van gigabytes zonder klik) en (2) wat de gebruiker in de extensie
// heeft aangezet (alleen de keuzes, via de publieke status; nooit tekst of uitvoer). Past bij BYOS: alles blijft op het apparaat,
// ook de server van Mijn Ruimte ziet de tekst niet.

export type LokaleAiApi = 'prompt' | 'summarizer' | 'writer' | 'rewriter' | 'translator' | 'detector' | 'proofreader';
export const LOKALE_AI_APIS: readonly LokaleAiApi[] = Object.freeze(['prompt', 'summarizer', 'writer', 'rewriter', 'translator', 'detector', 'proofreader']);
export const isLokaleAiApi = (v: unknown): v is LokaleAiApi => typeof v === 'string' && (LOKALE_AI_APIS as readonly string[]).includes(v);

/** Eerste extensieversie met de ingebouwde AI van Chrome. */
export const LOKALE_AI_MIN_EXTENSIE = '0.9.0';

export type LokaleAiInfo = { glob: string; uk: string; nl: string; vlag: string; proef: boolean; opties?: Record<string, unknown> };
/** Zelfde namen en vlaggen als extension/lokale-ai.js (API-object); de test bewaakt dat ze gelijk blijven. */
export const LOKALE_AI_INFO: Readonly<Record<LokaleAiApi, LokaleAiInfo>> = Object.freeze({
  prompt: { glob: 'LanguageModel', uk: 'Діалог (Prompt API)', nl: 'Gesprek (Prompt API)', vlag: 'prompt-api-for-gemini-nano', proef: false },
  summarizer: { glob: 'Summarizer', uk: 'Стислий виклад (Summarizer)', nl: 'Samenvatten (Summarizer)', vlag: 'summarization-api-for-gemini-nano', proef: false },
  writer: { glob: 'Writer', uk: 'Написання тексту (Writer)', nl: 'Tekst schrijven (Writer)', vlag: 'writer-api-for-gemini-nano', proef: true },
  rewriter: { glob: 'Rewriter', uk: 'Переписування (Rewriter)', nl: 'Herschrijven (Rewriter)', vlag: 'rewriter-api-for-gemini-nano', proef: true },
  // Translator.availability() eist een talenpaar: we meten Engels → Oekraïens (de interface kent uk/nl; nl volgt hetzelfde pad).
  translator: { glob: 'Translator', uk: 'Переклад (Translator)', nl: 'Vertalen (Translator)', vlag: 'translation-api', proef: false, opties: { sourceLanguage: 'en', targetLanguage: 'uk' } },
  detector: { glob: 'LanguageDetector', uk: 'Визначення мови (Language Detector)', nl: 'Taal herkennen (Language Detector)', vlag: 'language-detection-api', proef: false },
  proofreader: { glob: 'Proofreader', uk: 'Коректура (Proofreader)', nl: 'Proeflezen (Proofreader)', vlag: 'proofreader-api-for-gemini-nano', proef: true },
});

/** Wat Chrome op de pagina zegt (availability()) of 'ontbreekt' (geen globale API) / 'fout' (availability() gooide). */
export type PaginaStand = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'ontbreekt' | 'fout';
const PAGINA_STANDEN: readonly PaginaStand[] = ['available', 'downloadable', 'downloading', 'unavailable', 'ontbreekt', 'fout'];
export const paginaStandVan = (v: unknown): PaginaStand => (typeof v === 'string' && (PAGINA_STANDEN as readonly string[]).includes(v) ? v as PaginaStand : 'fout');

/** Keuzes uit de extensie (publieke status 0.9.0): hoofdschakelaar + ingeschakelde API's. null = extensie meldt niets. */
export type LokaleAiKeuze = { aan: boolean; apis: LokaleAiApi[] };
export function filterLokaleAiKeuze(v: unknown): LokaleAiKeuze | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  return { aan: d.aan === true, apis: Array.isArray(d.apis) ? [...new Set(d.apis.filter(isLokaleAiApi))] : [] };
}

export type LaiRegel = { stand: 'ja' | 'let-op' | 'nee'; uk: string; nl: string };
/**
 * Eén regel per API, zuiver: combineert wat Chrome meldt met wat de extensie mag. Nooit groen als één van beide ontbreekt.
 * `extVersie` leeg = geen extensie op deze pagina; onder 0.9.0 kent de extensie de lokale AI niet.
 */
export function laiRegel(api: LokaleAiApi, pagina: PaginaStand, keuze: LokaleAiKeuze | null, extVersie: string, versieOuder: (a: string, b: string) => boolean): LaiRegel {
  const i = LOKALE_AI_INFO[api];
  const chrome: Record<PaginaStand, [LaiRegel['stand'], string, string]> = {
    available: ['ja', 'Chrome: модель готова на цьому пристрої', 'Chrome: model staat klaar op dit apparaat'],
    downloadable: ['let-op', 'Chrome: модель можна завантажити (кілька ГБ, лише після вашого натискання в розширенні)', 'Chrome: model kan gedownload worden (enkele GB, alleen na uw klik in de extensie)'],
    downloading: ['let-op', 'Chrome: модель зараз завантажується', 'Chrome: model wordt nu gedownload'],
    unavailable: ['nee', 'Chrome: цей пристрій не підтримує (вимоги до пам’яті, GPU або диска)', 'Chrome: dit apparaat ondersteunt het niet (eisen aan geheugen, GPU of schijf)'],
    ontbreekt: ['nee', `Chrome: API немає в цій версії — оновіть Chrome або ввімкніть chrome://flags/#${i.vlag}${i.proef ? ' (експериментальна функція)' : ''}`, `Chrome: API ontbreekt in deze versie — werk Chrome bij of zet chrome://flags/#${i.vlag} aan${i.proef ? ' (experimentele functie)' : ''}`],
    fout: ['nee', 'Chrome: не відповів на перевірку доступності', 'Chrome: antwoordde niet op de beschikbaarheidscontrole'],
  };
  const [cStand, cUk, cNl] = chrome[pagina];
  let ext: [LaiRegel['stand'], string, string];
  if (!extVersie) ext = ['let-op', 'розширення на цій сторінці не видно', 'extensie niet zichtbaar op deze pagina'];
  else if (versieOuder(extVersie, LOKALE_AI_MIN_EXTENSIE)) ext = ['let-op', `розширення ${extVersie} ще не знає вбудованого ШІ — оновіть до ${LOKALE_AI_MIN_EXTENSIE}`, `extensie ${extVersie} kent de ingebouwde AI nog niet — werk bij naar ${LOKALE_AI_MIN_EXTENSIE}`];
  else if (!keuze) ext = ['let-op', 'розширення не повідомило налаштувань', 'extensie meldde geen instellingen'];
  else if (!keuze.aan) ext = ['nee', 'у розширенні вимкнено головний перемикач', 'in de extensie staat de hoofdschakelaar uit'];
  else if (!keuze.apis.includes(api)) ext = ['nee', 'у розширенні цю функцію вимкнено', 'in de extensie staat deze functie uit'];
  else ext = ['ja', 'у розширенні ввімкнено', 'in de extensie aan'];
  const rang = { ja: 0, 'let-op': 1, nee: 2 } as const;
  const stand = rang[cStand] >= rang[ext[0]] ? cStand : ext[0];
  return { stand, uk: `${cUk} · ${ext[1]}`, nl: `${cNl} · ${ext[2]}` };
}

/** Meet in de pagina, zonder iets te downloaden (alleen availability()). Elke API apart begrensd in tijd. */
export async function meetPagina(g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>, ms = 3000): Promise<Record<LokaleAiApi, PaginaStand>> {
  const uit = {} as Record<LokaleAiApi, PaginaStand>;
  await Promise.all(LOKALE_AI_APIS.map(async (api) => {
    const info = LOKALE_AI_INFO[api];
    const obj = g[info.glob] as { availability?: (o?: unknown) => Promise<unknown> } | undefined;
    if (!obj || typeof obj.availability !== 'function') { uit[api] = 'ontbreekt'; return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const v = await Promise.race([obj.availability(info.opties), new Promise((_, nee) => { timer = setTimeout(() => nee(new Error('TIJD')), ms); })]);
      uit[api] = paginaStandVan(v);
    } catch { uit[api] = 'fout'; } finally { if (timer !== undefined) clearTimeout(timer); }
  }));
  return uit;
}
