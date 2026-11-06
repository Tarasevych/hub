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

/**
 * Wat Chrome zegt (availability()) of 'ontbreekt' (geen globale API) / 'fout' (availability() gooide) / 'stil' (availability()
 * antwoordde niet binnen de tijd: modelcomponent nog niet geregistreerd — alleen gemeten door de extensie, 0.9.1 offscreen.html).
 */
export type PaginaStand = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'ontbreekt' | 'stil' | 'fout';
const PAGINA_STANDEN: readonly PaginaStand[] = ['available', 'downloadable', 'downloading', 'unavailable', 'ontbreekt', 'stil', 'fout'];
export const paginaStandVan = (v: unknown): PaginaStand => (typeof v === 'string' && (PAGINA_STANDEN as readonly string[]).includes(v) ? v as PaginaStand : 'fout');

/**
 * Keuzes uit de extensie (publieke status 0.9.0): hoofdschakelaar + ingeschakelde API's. null = extensie meldt niets.
 * 0.9.1: `stand` = wat Chrome IN DE EXTENSIE meldt (offscreen.html meet availability(), nooit create()); ontbreekt bij 0.9.0.
 */
export type LokaleAiKeuze = { aan: boolean; apis: LokaleAiApi[]; siteToegang?: boolean; stand?: Partial<Record<LokaleAiApi, PaginaStand>> };
export function filterLokaleAiKeuze(v: unknown): LokaleAiKeuze | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const uit: LokaleAiKeuze = { aan: d.aan === true, apis: Array.isArray(d.apis) ? [...new Set(d.apis.filter(isLokaleAiApi))] : [] };
  if (typeof d.siteToegang === 'boolean') uit.siteToegang = d.siteToegang;
  const st = d.stand && typeof d.stand === 'object' && !Array.isArray(d.stand) ? d.stand as Record<string, unknown> : null;
  if (st) {
    const s: Partial<Record<LokaleAiApi, PaginaStand>> = {};
    for (const api of LOKALE_AI_APIS) if (typeof st[api] === 'string' && (PAGINA_STANDEN as readonly string[]).includes(st[api] as string)) s[api] = st[api] as PaginaStand;
    if (Object.keys(s).length) uit.stand = s;
  }
  return uit;
}

/**
 * Welke meting telt voor een API: de meting van de extensie (offscreen.html) gaat vóór die van de pagina, want de extensie is
 * waar de functies echt draaien (zijpaneel/opties) en sommige API's bestaan in Chrome alleen voor extensies. null = nog niets.
 */
export function kiesStand(api: LokaleAiApi, pagina: Record<LokaleAiApi, PaginaStand> | null, keuze: LokaleAiKeuze | null): { stand: PaginaStand; bron: 'extensie' | 'pagina' } | null {
  const ext = keuze?.stand?.[api];
  if (ext) return { stand: ext, bron: 'extensie' };
  return pagina ? { stand: pagina[api], bron: 'pagina' } : null;
}

export type LaiRegel = { stand: 'ja' | 'let-op' | 'nee'; uk: string; nl: string };
/**
 * Eén regel per API, zuiver: combineert wat Chrome meldt met wat de extensie mag. Nooit groen als één van beide ontbreekt.
 * `extVersie` leeg = geen extensie op deze pagina; onder 0.9.0 kent de extensie de lokale AI niet.
 */
export function laiRegel(api: LokaleAiApi, pagina: PaginaStand, keuze: LokaleAiKeuze | null, extVersie: string, versieOuder: (a: string, b: string) => boolean, bron: 'pagina' | 'extensie' = 'pagina'): LaiRegel {
  const i = LOKALE_AI_INFO[api];
  // 0.9.1: «Chrome (у розширенні)» = gemeten door de extensie in offscreen.html; «Chrome» = gemeten op deze pagina.
  const [cu, cn] = bron === 'extensie' ? ['Chrome (у розширенні)', 'Chrome (in de extensie)'] : ['Chrome', 'Chrome'];
  const chrome: Record<PaginaStand, [LaiRegel['stand'], string, string]> = {
    available: ['ja', `${cu}: модель готова на цьому пристрої`, `${cn}: model staat klaar op dit apparaat`],
    downloadable: ['let-op', `${cu}: модель можна завантажити (кілька ГБ, лише після вашого натискання в розширенні)`, `${cn}: model kan gedownload worden (enkele GB, alleen na uw klik in de extensie)`],
    downloading: ['let-op', `${cu}: модель зараз завантажується`, `${cn}: model wordt nu gedownload`],
    unavailable: ['nee', `${cu}: цей пристрій не підтримує (вимоги до пам’яті, GPU або диска)`, `${cn}: dit apparaat ondersteunt het niet (eisen aan geheugen, GPU of schijf)`],
    ontbreekt: ['nee', `${cu}: API немає в цій версії — оновіть Chrome або ввімкніть chrome://flags/#${i.vlag}${i.proef ? ' (експериментальна функція)' : ''}`, `${cn}: API ontbreekt in deze versie — werk Chrome bij of zet chrome://flags/#${i.vlag} aan${i.proef ? ' (experimentele functie)' : ''}`],
    stil: ['let-op', `${cu}: не відповідає — компонент моделі ще не зареєстровано, перевірте chrome://on-device-internals`, `${cn}: antwoordt niet — modelcomponent nog niet geregistreerd, controleer chrome://on-device-internals`],
    fout: ['nee', `${cu}: не відповів на перевірку доступності`, `${cn}: antwoordde niet op de beschikbaarheidscontrole`],
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

// ---------------------------------------------------------------- 0.9.2: de site zelf laat de extensie lokaal werken
// Contract (extensie 0.9.1+, externally_connectable, alleen *.tarasevych.com):
//   {type:'LOKALE_AI_STAND'} → {ok, aan, apis:{id: stand|'uit'}}
//   {type:'LOKALE_AI', modus, tekst ≤ 20000, bron?, doel?} → {ok:true, tekst, notities, correcties?} | {ok:false, reason, detail?}
// Alleen als de gebruiker in de extensie «!» siteToegang aanzette (standaard uit). Tekst blijft op het apparaat.
export const LOKALE_AI_SITE_MIN_EXTENSIE = '0.9.1';
export const LOKALE_AI_MAX_TEKST = 20000;
export type LokaleAiAntwoord = { ok: true; tekst: string; notities: string[]; correcties: unknown[] } | { ok: false; reden: string };
/** Zuiver: antwoord van de extensie → veilig object (alleen tekst en korte notities; reden uit een vaste lijst of 'FOUT'). */
export function filterLokaleAiAntwoord(v: unknown): LokaleAiAntwoord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reden: 'GEEN_ANTWOORD' };
  const d = v as Record<string, unknown>;
  if (d.ok === true && typeof d.tekst === 'string') {
    return { ok: true, tekst: d.tekst.slice(0, 200_000), notities: Array.isArray(d.notities) ? d.notities.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 500)).slice(0, 20) : [], correcties: Array.isArray(d.correcties) ? d.correcties.slice(0, 500) : [] };
  }
  const r = typeof d.reason === 'string' ? d.reason : '';
  return { ok: false, reden: r in LOKALE_AI_REDENEN ? r : 'FOUT' };
}
/** Uitleg per reden (uk, nl): wat er gebeurde en wat de gebruiker kan doen. */
export const LOKALE_AI_REDENEN: Readonly<Record<string, [string, string]>> = Object.freeze({
  UIT: ['У розширенні вимкнено вбудований ШІ (головний перемикач).', 'In de extensie staat de ingebouwde AI uit (hoofdschakelaar).'],
  SITE_TOEGANG_UIT: ['Сторінкам сайту не дозволено користуватися локальним ШІ. Увімкніть «!» перемикач у налаштуваннях розширення → «Локальний ШІ».', 'Pagina’s van de site mogen de lokale AI niet gebruiken. Zet de «!»-schakelaar aan in de instellingen van de extensie → «Lokale AI».'],
  MODUS: ['Невідома функція.', 'Onbekende functie.'],
  LEEG: ['Введіть текст.', 'Voer tekst in.'],
  TE_LANG: ['Текст задовгий (понад 20 000 символів).', 'Tekst te lang (meer dan 20 000 tekens).'],
  TE_VEEL: ['Забагато запитів: не більше 20 за хвилину. Зачекайте хвилину.', 'Te veel verzoeken: hoogstens 20 per minuut. Wacht een minuut.'],
  BEZIG: ['Вже виконуються два запити. Дочекайтеся їх завершення.', 'Er lopen al twee verzoeken. Wacht tot ze klaar zijn.'],
  MODEL_NIET_GELADEN: ['Модель ще не завантажена. Завантаження (кілька ГБ) запускається лише вашим натисканням у налаштуваннях розширення.', 'Het model is nog niet gedownload. De download (enkele GB) start alleen met uw klik in de instellingen van de extensie.'],
  NIET_BESCHIKBAAR: ['Ця функція недоступна в цьому Chrome або на цьому пристрої.', 'Deze functie is niet beschikbaar in deze Chrome of op dit apparaat.'],
  AbortError: ['Перервано: перевищено ліміт 120 секунд.', 'Afgebroken: limiet van 120 seconden overschreden.'],
  OFFSCREEN_ONTBREEKT: ['Цей Chrome не підтримує прихований документ offscreen.html — оновіть Chrome.', 'Deze Chrome ondersteunt het verborgen document offscreen.html niet — werk Chrome bij.'],
  GEEN_ANTWOORD: ['Розширення не відповіло. Перевірте, що воно ввімкнене, і спробуйте ще раз.', 'De extensie antwoordde niet. Controleer of ze aan staat en probeer opnieuw.'],
  FOUT: ['Не вдалося виконати на цьому пристрої.', 'Uitvoeren op dit apparaat mislukt.'],
});
