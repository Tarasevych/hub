// EXT090-001 (06.11.2026), LOKAI-001 (17.11.2026): ingebouwde AI van Chrome (Gemini Nano / Gemma 4 op het apparaat van de gebruiker).
// Вбудований ШІ Chrome — спільна модель для сайту та розширення (extension/lokale-ai.js має власну копію).
//
// 0.9.7 / Chrome 157+:
//  - API-лінійка: Prompt API, Summarizer, Writer, Rewriter, Translator, LanguageDetector, Proofreader,
//    SemanticEmbedder (embedder) і DecisionModel (decisions).
//  - Оновлені прапорці Chrome 157 (prompt-api, summarizer-api, writer-api, rewriter-api, proofreader-api, semantic-embedder-api,
//    decisions-api, gemma4-for-built-in-ai, prompt-api-multimodal-input, prompt-api-sampling-mode, prompt-api-tool-use,
//    summarizer-api-performance-preference, web-speech-on-device-small-expert-model, enable-webmcp-testing, web-app-installation-api).
//  - Протокол LOKALE_AI_STEL_IN: сайт може безпечно вмикати й налаштовувати під задачу користувача; чутливі «!»-параметри
//    (siteToegang, tabTekst, multimodaal, autoDownload) змінюються ТІЛЬКИ за явним підтвердженням користувача (bevestigGevaar: true).

export type LokaleAiApi =
  | 'prompt'
  | 'summarizer'
  | 'writer'
  | 'rewriter'
  | 'translator'
  | 'detector'
  | 'proofreader'
  | 'embedder'
  | 'decisions';

export const LOKALE_AI_APIS: readonly LokaleAiApi[] = Object.freeze([
  'prompt',
  'summarizer',
  'writer',
  'rewriter',
  'translator',
  'detector',
  'proofreader',
  'embedder',
  'decisions',
]);

export const isLokaleAiApi = (v: unknown): v is LokaleAiApi =>
  typeof v === 'string' && (LOKALE_AI_APIS as readonly string[]).includes(v);

/** Перша версія розширення з убудованим ШІ Chrome. */
export const LOKALE_AI_MIN_EXTENSIE = '0.9.0';
/** Версія розширення з прямим викликом локального ШІ зі сторінок сайту. */
export const LOKALE_AI_SITE_MIN_EXTENSIE = '0.9.1';
/** Версія розширення з керованим налаштуванням із сайту (LOKALE_AI_STEL_IN) та API Chrome 157. */
export const LOKALE_AI_STEL_MIN_EXTENSIE = '0.9.7';
export const LOKALE_AI_MAX_TEKST = 20000;

export type LokaleAiInfo = {
  glob: string;
  uk: string;
  nl: string;
  vlag: string;
  oudVlag?: string;
  proef: boolean;
  cpuLetOp?: boolean;
  opties?: Record<string, unknown>;
};

/** Та сама структура й назви прапорців, що й у extension/lokale-ai.js (перевіряється тестом). */
export const LOKALE_AI_INFO: Readonly<Record<LokaleAiApi, LokaleAiInfo>> = Object.freeze({
  prompt: {
    glob: 'LanguageModel',
    uk: 'Діалог (Prompt API)',
    nl: 'Gesprek (Prompt API)',
    vlag: 'prompt-api',
    oudVlag: 'prompt-api-for-gemini-nano',
    proef: false,
  },
  summarizer: {
    glob: 'Summarizer',
    uk: 'Стислий виклад (Summarizer)',
    nl: 'Samenvatten (Summarizer)',
    vlag: 'summarizer-api',
    oudVlag: 'summarization-api-for-gemini-nano',
    proef: false,
  },
  writer: {
    glob: 'Writer',
    uk: 'Написання тексту (Writer)',
    nl: 'Tekst schrijven (Writer)',
    vlag: 'writer-api',
    oudVlag: 'writer-api-for-gemini-nano',
    proef: true,
  },
  rewriter: {
    glob: 'Rewriter',
    uk: 'Переписування (Rewriter)',
    nl: 'Herschrijven (Rewriter)',
    vlag: 'rewriter-api',
    oudVlag: 'rewriter-api-for-gemini-nano',
    proef: true,
  },
  // Translator.availability() вимагає мовну пару; вимірюємо напрямок en → uk як показовий.
  translator: {
    glob: 'Translator',
    uk: 'Переклад (Translator)',
    nl: 'Vertalen (Translator)',
    vlag: 'translation-api',
    proef: false,
    opties: { sourceLanguage: 'en', targetLanguage: 'uk' },
  },
  detector: {
    glob: 'LanguageDetector',
    uk: 'Визначення мови (Language Detector)',
    nl: 'Taal herkennen (Language Detector)',
    vlag: 'language-detection-api',
    proef: false,
  },
  proofreader: {
    glob: 'Proofreader',
    uk: 'Коректура (Proofreader)',
    nl: 'Proeflezen (Proofreader)',
    vlag: 'proofreader-api',
    oudVlag: 'proofreader-api-for-gemini-nano',
    proef: true,
  },
  embedder: {
    glob: 'SemanticEmbedder',
    uk: 'Значеннєві вектори (Embedder)',
    nl: 'Betekenisvectoren (Embedder)',
    vlag: 'semantic-embedder-api',
    proef: true,
  },
  decisions: {
    glob: 'DecisionModel',
    uk: 'Модель рішень і класифікація (Decisions)',
    nl: 'Beslismodel en indeling (Decisions)',
    vlag: 'decisions-api',
    proef: true,
    cpuLetOp: true,
  },
});

export type ChromeVlagInfo = {
  id: string;
  token: string;
  uk: string;
  nl: string;
  aanbevolen: boolean;
  gevaarlijk?: boolean;
  letOpUk?: string;
  letOpNl?: string;
};

/** Повний перелік прапорців Chrome 157 для вбудованого ШІ, голосу, WebMCP та встановлення застосунку. */
export const CHROME_157_VLAGGEN: readonly ChromeVlagInfo[] = Object.freeze([
  { id: 'prompt-api', token: 'prompt-api@2', uk: 'Prompt API (мультимовний режим або ввімкнено)', nl: 'Prompt API (meertalig of ingeschakeld)', aanbevolen: true },
  { id: 'prompt-api-multimodal-input', token: 'prompt-api-multimodal-input@1', uk: 'Мультимодальний вхід (зображення й аудіо)', nl: 'Multimodale invoer (beeld en audio)', aanbevolen: true },
  { id: 'prompt-api-sampling-mode', token: 'prompt-api-sampling-mode@1', uk: 'Режим вибірки (передбачуваність / творчість)', nl: 'Samplingmodus (voorspelbaarheid / creativiteit)', aanbevolen: true },
  { id: 'prompt-api-tool-use', token: 'prompt-api-tool-use@1', uk: 'Виклик інструментів моделлю (Tool Use)', nl: 'Hulpmiddelaanroep door het model (Tool Use)', aanbevolen: true },
  { id: 'summarizer-api', token: 'summarizer-api@2', uk: 'Summarizer API (мультимовний режим)', nl: 'Summarizer API (meertalig)', aanbevolen: true },
  { id: 'summarizer-api-performance-preference', token: 'summarizer-api-performance-preference@1', uk: 'Пріоритет швидкодії чи якості для Summarizer', nl: 'Prestatievoorkeur voor Summarizer', aanbevolen: true },
  { id: 'writer-api', token: 'writer-api@2', uk: 'Writer API (написання тексту)', nl: 'Writer API (tekst schrijven)', aanbevolen: true },
  { id: 'rewriter-api', token: 'rewriter-api@2', uk: 'Rewriter API (переписування тексту)', nl: 'Rewriter API (tekst herschrijven)', aanbevolen: true },
  { id: 'proofreader-api', token: 'proofreader-api@1', uk: 'Proofreader API (коректура)', nl: 'Proofreader API (proeflezen)', aanbevolen: true },
  { id: 'semantic-embedder-api', token: 'semantic-embedder-api@1', uk: 'Semantic Embedder API (значеннєві вектори)', nl: 'Semantic Embedder API (betekenisvectoren)', aanbevolen: true },
  { id: 'gemma4-for-built-in-ai', token: 'gemma4-for-built-in-ai@1', uk: 'Модель Gemma 4 для вбудованого ШІ', nl: 'Model Gemma 4 voor ingebouwde AI', aanbevolen: true },
  { id: 'on-device-category-classifier', token: 'on-device-category-classifier@1', uk: 'Локальний класифікатор категорій', nl: 'Lokale categorie-indeler', aanbevolen: true },
  { id: 'on-device-model-speculative-decoding', token: 'on-device-model-speculative-decoding@1', uk: 'Прискорення виведення (Speculative Decoding)', nl: 'Versnelde verwerking (Speculative Decoding)', aanbevolen: true },
  { id: 'web-speech-on-device-small-expert-model', token: 'web-speech-on-device-small-expert-model@1', uk: 'Локальне розпізнавання мовлення (Web Speech)', nl: 'Lokale spraakherkenning (Web Speech)', aanbevolen: true },
  { id: 'enable-webmcp-testing', token: 'enable-webmcp-testing@1', uk: 'WebMCP (navigator.modelContext)', nl: 'WebMCP (navigator.modelContext)', aanbevolen: true },
  { id: 'web-app-installation-api', token: 'web-app-installation-api@1', uk: 'Програмне встановлення вебзастосунку (navigator.install)', nl: 'Webapp installeren via navigator.install()', aanbevolen: true },
  { id: 'optimization-guide-on-device-model', token: 'optimization-guide-on-device-model', uk: 'Системна реєстрація локальної моделі Chrome', nl: 'Systeemregistratie van het lokale Chrome-model', aanbevolen: true },
  {
    id: 'decisions-api',
    token: 'decisions-api@1',
    uk: 'Decisions API (класифікація за схемою)',
    nl: 'Decisions API (indeling op schema)',
    aanbevolen: false,
    letOpUk: 'У Chrome 157 перемикає всі локальні моделі на CPU замість GPU, що помітно сповільнює відповіді. Вмикайте лише коли справді потрібна DecisionModel.',
    letOpNl: 'Zet in Chrome 157 alle lokale modellen op de CPU in plaats van de GPU, wat reacties merkbaar vertraagt. Alleen aanzetten als DecisionModel echt nodig is.',
  },
  {
    id: 'data-sharing',
    token: 'data-sharing@4',
    uk: 'Діагностичний обмін даними Chrome (не для приватності)',
    nl: 'Diagnostisch gegevens delen van Chrome (niet voor privacy)',
    aanbevolen: false,
    gevaarlijk: true,
    letOpUk: 'Не вмикайте для приватної роботи: без потреби розширює телеметрію/діагностику.',
    letOpNl: 'Niet aanzetten voor privégebruik: vergroot diagnostische gegevensdeling zonder noodzaak.',
  },
]);

export const SUMMARIZER_PREFERENCES = Object.freeze(['auto', 'speed', 'capability'] as const);
export type SummarizerPreference = typeof SUMMARIZER_PREFERENCES[number];

export const PROMPT_SAMPLING_MODES = Object.freeze(['default', 'most-predictable', 'balanced', 'most-creative'] as const);
export type PromptSamplingMode = typeof PROMPT_SAMPLING_MODES[number];

export const MODEL_TALEN = Object.freeze(['en', 'es', 'ja', 'de', 'fr', 'uk', 'nl'] as const);
export const VERTAAL_TALEN = Object.freeze(['uk', 'nl', 'en', 'de', 'fr', 'es', 'it', 'pl', 'pt', 'ja', 'zh', 'ko', 'tr', 'ar', 'hi'] as const);

export const GEVAAR_VELDEN = Object.freeze(['siteToegang', 'tabTekst', 'multimodaal', 'autoDownload'] as const);
export type GevaarVeld = typeof GEVAAR_VELDEN[number];

export type PaginaStand = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'ontbreekt' | 'stil' | 'fout';
const PAGINA_STANDEN: readonly PaginaStand[] = ['available', 'downloadable', 'downloading', 'unavailable', 'ontbreekt', 'stil', 'fout'];
export const paginaStandVan = (v: unknown): PaginaStand =>
  typeof v === 'string' && (PAGINA_STANDEN as readonly string[]).includes(v) ? (v as PaginaStand) : 'fout';

export type LokaleAiInstellingen = {
  summarizerPreference?: SummarizerPreference;
  promptSamplingMode?: PromptSamplingMode;
  promptTaal?: string;
  promptToolUse?: boolean;
  chatHulp?: boolean;
  vertaalInvoer?: boolean;
  vertaalUitvoer?: boolean;
  doelTaal?: string;
};

export type LokaleAiGevaar = {
  siteToegang?: boolean;
  tabTekst?: boolean;
  multimodaal?: boolean;
  autoDownload?: boolean;
};

/**
 * 0.9.6 (LAI-CON-001, migratie 0287): beleid van de beheerder zoals de extensie het meldt — alleen als het UIT staat.
 * Рішення власника 16.11.2026: користувач бачить причину, хто вимкнув (з посиланням) і що зробити.
 */
export type LokaleAiBeleidWeergave = { reden: string; door: string | null; op: number | null };
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$/;
export function filterBeleid(v: unknown): LokaleAiBeleidWeergave | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (d.aan === true) return null;
  const reden = typeof d.reden === 'string' ? d.reden.slice(0, 300) : '';
  if (!reden) return null;
  return { reden, door: typeof d.door === 'string' && d.door ? d.door.slice(0, 200) : null, op: typeof d.op === 'number' && Number.isFinite(d.op) ? d.op : null };
}
/** Link naar de beheerder: mailto alleen voor een geldig e-mailadres (nooit een vrije URL uit de extensie). */
export const beheerderLink = (door: string | null): string | null => (door && EMAIL.test(door) ? `mailto:${door}` : null);
/** Eén zin voor de gebruiker: wie, waarom, wat te doen. */
export function beleidTekst(b: LokaleAiBeleidWeergave): [string, string] {
  const wie = b.door || 'адміністратор', wieNl = b.door || 'de beheerder';
  return [
    `Вимкнув ${wie}: «${b.reden}». Щоб знову ввімкнути, зверніться до цього адміністратора. У власній бічній панелі розширення локальний ШІ працює й далі.`,
    `Uitgezet door ${wieNl}: «${b.reden}». Om het weer aan te zetten, neem contact op met deze beheerder. In het eigen zijpaneel van de extensie werkt de lokale AI gewoon verder.`,
  ];
}

/**
 * Статус локального ШІ з розширення: головний перемикач, увімкнені API, доступ сайту, виміряний стан та безпечні налаштування.
 * Важливо: якщо `instellingen` чи `gevaar` не передані (старі версії 0.9.0–0.9.6), повертаються лише наявні поля.
 */
export type LokaleAiKeuze = {
  aan: boolean;
  apis: LokaleAiApi[];
  siteToegang?: boolean;
  stand?: Partial<Record<LokaleAiApi, PaginaStand>>;
  instellingen?: LokaleAiInstellingen;
  gevaar?: LokaleAiGevaar;
  ukDirect?: boolean;
  nlDirect?: boolean;
  /** 0.9.6: alleen aanwezig als de beheerder het uitzette (reden, wie, wanneer). */
  beleid?: LokaleAiBeleidWeergave;
};

export function filterLokaleAiKeuze(v: unknown): LokaleAiKeuze | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const uit: LokaleAiKeuze = {
    aan: d.aan === true,
    apis: Array.isArray(d.apis) ? [...new Set(d.apis.filter(isLokaleAiApi))] : [],
  };
  if (typeof d.siteToegang === 'boolean') uit.siteToegang = d.siteToegang;
  const st = d.stand && typeof d.stand === 'object' && !Array.isArray(d.stand) ? (d.stand as Record<string, unknown>) : null;
  if (st) {
    const s: Partial<Record<LokaleAiApi, PaginaStand>> = {};
    for (const api of LOKALE_AI_APIS) {
      if (typeof st[api] === 'string' && (PAGINA_STANDEN as readonly string[]).includes(st[api] as string)) {
        s[api] = st[api] as PaginaStand;
      }
    }
    if (Object.keys(s).length) uit.stand = s;
  }
  const inst = d.instellingen && typeof d.instellingen === 'object' && !Array.isArray(d.instellingen)
    ? (d.instellingen as Record<string, unknown>)
    : null;
  if (inst) {
    const cleanInst: LokaleAiInstellingen = {};
    if (typeof inst.summarizerPreference === 'string' && (SUMMARIZER_PREFERENCES as readonly string[]).includes(inst.summarizerPreference)) {
      cleanInst.summarizerPreference = inst.summarizerPreference as SummarizerPreference;
    }
    if (typeof inst.promptSamplingMode === 'string' && (PROMPT_SAMPLING_MODES as readonly string[]).includes(inst.promptSamplingMode)) {
      cleanInst.promptSamplingMode = inst.promptSamplingMode as PromptSamplingMode;
    }
    if (typeof inst.promptTaal === 'string' && (MODEL_TALEN as readonly string[]).includes(inst.promptTaal)) {
      cleanInst.promptTaal = inst.promptTaal;
    }
    if (typeof inst.promptToolUse === 'boolean') cleanInst.promptToolUse = inst.promptToolUse;
    if (typeof inst.chatHulp === 'boolean') cleanInst.chatHulp = inst.chatHulp;
    if (typeof inst.vertaalInvoer === 'boolean') cleanInst.vertaalInvoer = inst.vertaalInvoer;
    if (typeof inst.vertaalUitvoer === 'boolean') cleanInst.vertaalUitvoer = inst.vertaalUitvoer;
    if (inst.doelTaal === 'auto' || (typeof inst.doelTaal === 'string' && (VERTAAL_TALEN as readonly string[]).includes(inst.doelTaal))) {
      cleanInst.doelTaal = inst.doelTaal as string;
    }
    if (Object.keys(cleanInst).length) uit.instellingen = cleanInst;
  }
  const gev = d.gevaar && typeof d.gevaar === 'object' && !Array.isArray(d.gevaar)
    ? (d.gevaar as Record<string, unknown>)
    : null;
  if (gev) {
    const cleanGev: LokaleAiGevaar = {};
    for (const k of GEVAAR_VELDEN) if (typeof gev[k] === 'boolean') cleanGev[k] = gev[k] as boolean;
    if (Object.keys(cleanGev).length) uit.gevaar = cleanGev;
  }
  if (typeof d.ukDirect === 'boolean') uit.ukDirect = d.ukDirect;
  if (typeof d.nlDirect === 'boolean') uit.nlDirect = d.nlDirect;
  const b = filterBeleid(d.beleid);
  if (b) uit.beleid = b;
  return uit;
}

/** Вибір виміру: вимір із розширення (offscreen.html) має перевагу над виміром зі сторінки. */
export function kiesStand(
  api: LokaleAiApi,
  pagina: Record<LokaleAiApi, PaginaStand> | null,
  keuze: LokaleAiKeuze | null,
): { stand: PaginaStand; bron: 'extensie' | 'pagina' } | null {
  const ext = keuze?.stand?.[api];
  if (ext) return { stand: ext, bron: 'extensie' };
  return pagina ? { stand: pagina[api], bron: 'pagina' } : null;
}

export type LaiRegel = { stand: 'ja' | 'let-op' | 'nee'; uk: string; nl: string };

/** Поєднання доступності моделі в Chrome з налаштуванням у розширенні. */
export function laiRegel(
  api: LokaleAiApi,
  pagina: PaginaStand,
  keuze: LokaleAiKeuze | null,
  extVersie: string,
  versieOuder: (a: string, b: string) => boolean,
  bron: 'pagina' | 'extensie' = 'pagina',
): LaiRegel {
  const i = LOKALE_AI_INFO[api];
  const [cu, cn] = bron === 'extensie' ? ['Chrome (у розширенні)', 'Chrome (in de extensie)'] : ['Chrome', 'Chrome'];
  const vlagHintUk = i.oudVlag ? ` або #${i.oudVlag}` : '';
  const vlagHintNl = i.oudVlag ? ` of #${i.oudVlag}` : '';
  const chrome: Record<PaginaStand, [LaiRegel['stand'], string, string]> = {
    available: ['ja', `${cu}: модель готова на цьому пристрої`, `${cn}: model staat klaar op dit apparaat`],
    downloadable: ['let-op', `${cu}: модель можна завантажити (кілька ГБ, лише після вашого натискання в розширенні)`, `${cn}: model kan gedownload worden (enkele GB, alleen na uw klik in de extensie)`],
    downloading: ['let-op', `${cu}: модель зараз завантажується`, `${cn}: model wordt nu gedownload`],
    unavailable: ['nee', `${cu}: цей пристрій не підтримує (вимоги до пам’яті, GPU або диска)`, `${cn}: dit apparaat ondersteunt het niet (eisen aan geheugen, GPU of schijf)`],
    ontbreekt: ['nee', `${cu}: API немає в цій версії — оновіть Chrome або ввімкніть chrome://flags/#${i.vlag}${vlagHintUk}${i.proef ? ' (експериментальна функція)' : ''}`, `${cn}: API ontbreekt in deze versie — werk Chrome bij of zet chrome://flags/#${i.vlag}${vlagHintNl} aan${i.proef ? ' (experimentele functie)' : ''}`],
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

/** Вимірює стан усіх API на сторінці виключно через availability() без завантаження моделей. */
export async function meetPagina(
  g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
  ms = 3000,
): Promise<Record<LokaleAiApi, PaginaStand>> {
  const uit = {} as Record<LokaleAiApi, PaginaStand>;
  await Promise.all(LOKALE_AI_APIS.map(async (api) => {
    const info = LOKALE_AI_INFO[api];
    const obj = g[info.glob] as { availability?: (o?: unknown) => Promise<unknown> } | undefined;
    if (!obj || typeof obj.availability !== 'function') { uit[api] = 'ontbreekt'; return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const v = await Promise.race([
        obj.availability(info.opties),
        new Promise((_, nee) => { timer = setTimeout(() => nee(new Error('TIJD')), ms); }),
      ]);
      uit[api] = paginaStandVan(v);
    } catch { uit[api] = 'fout'; } finally { if (timer !== undefined) clearTimeout(timer); }
  }));
  return uit;
}

export type BrowserCapaciteiten = {
  webMcp: boolean;
  pwaInstall: boolean;
  speechRecognition: boolean;
  ukDirect: boolean;
  nlDirect: boolean;
};

/** Перевіряє додаткові можливості браузера (WebMCP, PWA install, Web Speech, пряма підтримка uk/nl у Gemma 4). */
export async function meetBrowserCapaciteiten(
  g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
  nav: Record<string, unknown> = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as Record<string, unknown>,
  ms = 2000,
): Promise<BrowserCapaciteiten> {
  const modelCtx = nav.modelContext as { registerTool?: unknown } | undefined;
  const webMcp = !!(modelCtx && typeof modelCtx.registerTool === 'function');
  const pwaInstall = typeof nav.install === 'function';
  const speechRecognition = typeof g.SpeechRecognition === 'function' || typeof g.webkitSpeechRecognition === 'function';
  const testTaal = async (taal: string) => {
    const lm = g.LanguageModel as { availability?: (o?: unknown) => Promise<unknown> } | undefined;
    if (!lm || typeof lm.availability !== 'function') return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const v = await Promise.race([
        lm.availability({ expectedInputs: [{ type: 'text', languages: [taal] }], expectedOutputs: [{ type: 'text', languages: [taal] }] }),
        new Promise((_, nee) => { timer = setTimeout(() => nee(new Error('TIJD')), ms); }),
      ]);
      const stand = paginaStandVan(v);
      return stand === 'available' || stand === 'downloadable' || stand === 'downloading';
    } catch {
      return false;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const [ukDirect, nlDirect] = await Promise.all([testTaal('uk'), testTaal('nl')]);
  return { webMcp, pwaInstall, speechRecognition, ukDirect, nlDirect };
}

// ---------------------------------------------------------------- 0.9.2–0.9.7: обмін із розширенням через externally_connectable
export type LokaleAiAntwoord =
  | { ok: true; tekst: string; notities: string[]; correcties: unknown[] }
  | { ok: false; reden: string; beleid?: LokaleAiBeleidWeergave };

export function filterLokaleAiAntwoord(v: unknown): LokaleAiAntwoord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reden: 'GEEN_ANTWOORD' };
  const d = v as Record<string, unknown>;
  if (d.ok === true && typeof d.tekst === 'string') {
    return {
      ok: true,
      tekst: d.tekst.slice(0, 200_000),
      notities: Array.isArray(d.notities) ? d.notities.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 500)).slice(0, 20) : [],
      correcties: Array.isArray(d.correcties) ? d.correcties.slice(0, 500) : [],
    };
  }
  const r = typeof d.reason === 'string' ? d.reason : '';
  if (r === 'BELEID_UIT') {
    const b = filterBeleid({ aan: false, reden: d.detail, door: d.door, op: d.op });
    return { ok: false, reden: r, ...(b ? { beleid: b } : {}) };
  }
  return { ok: false, reden: r in LOKALE_AI_REDENEN ? r : 'FOUT' };
}

/** Двомовні пояснення кодів причин (uk, nl). */
export const LOKALE_AI_REDENEN: Readonly<Record<string, [string, string]>> = Object.freeze({
  UIT: ['У розширенні вимкнено вбудований ШІ (головний перемикач).', 'In de extensie staat de ingebouwde AI uit (hoofdschakelaar).'],
  SITE_TOEGANG_UIT: ['Сторінкам сайту не дозволено користуватися локальним ШІ. Увімкніть «!» перемикач у налаштуваннях розширення → «Локальний ШІ» або підтвердьте доступ нижче.', 'Pagina’s van de site mogen de lokale AI niet gebruiken. Zet de «!»-schakelaar aan in de extensie of bevestig toegang hieronder.'],
  MODUS: ['Невідома функція.', 'Onbekende functie.'],
  // 0.9.6 (PR #117): ongeldige extra velden van modus 'prompt' (rauw, schema, systeem).
  PARAMS: ['Запит до локального ШІ складено неправильно.', 'Het verzoek aan de lokale AI is onjuist opgebouwd.'],
  LEEG: ['Введіть текст.', 'Voer tekst in.'],
  TE_LANG: ['Текст задовгий (понад 20 000 символів).', 'Tekst te lang (meer dan 20 000 tekens).'],
  TE_VEEL: ['Забагато запитів: не більше 20 за хвилину. Зачекайте хвилину.', 'Te veel verzoeken: hoogstens 20 per minuut. Wacht een minuut.'],
  BEZIG: ['Вже виконуються два запити. Дочекайтеся їх завершення.', 'Er lopen al twee verzoeken. Wacht tot ze klaar zijn.'],
  MODEL_NIET_GELADEN: ['Модель ще не завантажена. Завантаження (кілька ГБ) запускається лише вашим натисканням у налаштуваннях розширення.', 'Het model is nog niet gedownload. De download (enkele GB) start alleen met uw klik in de instellingen van de extensie.'],
  NIET_BESCHIKBAAR: ['Ця функція недоступна в цьому Chrome або на цьому пристрої.', 'Deze functie is niet beschikbaar in deze Chrome of op dit apparaat.'],
  // 0.9.6 (LAI-CON-001, migratie 0287): de beheerder zette het uit — de reden en wie het deed staan in `beleid` (zie beleidTekst).
  BELEID_UIT: ['Адміністратор сервера вимкнув це для вашого облікового запису.', 'De beheerder van de server zette dit uit voor uw account.'],
  AbortError: ['Перервано: перевищено ліміт 120 секунд.', 'Afgebroken: limiet van 120 seconden overschreden.'],
  OFFSCREEN_ONTBREEKT: ['Цей Chrome не підтримує прихований документ offscreen.html — оновіть Chrome.', 'Deze Chrome ondersteunt het verborgen document offscreen.html niet — werk Chrome bij.'],
  BEVESTIGING_NODIG: ['Чутливі «!»-параметри не можуть змінюватися без вашого явного підтвердження кнопкою.', 'Gevoelige «!»-instellingen mogen niet zonder uw uitdrukkelijke bevestiging per knop gewijzigd worden.'],
  ONGELDIGE_INSTELLING: ['Передано недійсне налаштування.', 'Ongeldige instelling doorgegeven.'],
  GEEN_ANTWOORD: ['Розширення не відповіло. Перевірте, що воно ввімкнене, і спробуйте ще раз.', 'De extensie antwoordde niet. Controleer of ze aan staat en probeer opnieuw.'],
  FOUT: ['Не вдалося виконати на цьому пристрої.', 'Uitvoeren op dit apparaat mislukt.'],
});

// ---------------------------------------------------------------- 0.9.7: фільтр змін LOKALE_AI_STEL_IN та помічник за задачею
export type LokaleAiPatch = {
  aan?: boolean;
  apis?: Partial<Record<LokaleAiApi, boolean>> | LokaleAiApi[];
  chatHulp?: boolean;
  vertaalInvoer?: boolean;
  vertaalUitvoer?: boolean;
  doelTaal?: string;
  prompt?: {
    systeem?: string;
    temperatuur?: string;
    topK?: string;
    taal?: string;
    schema?: string;
    samplingMode?: PromptSamplingMode;
    toolUse?: boolean;
  };
  summarizer?: {
    type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
    format?: 'plain-text' | 'markdown';
    length?: 'short' | 'medium' | 'long';
    preference?: SummarizerPreference;
    context?: string;
    taal?: string;
  };
  writer?: {
    tone?: 'formal' | 'neutral' | 'casual';
    format?: 'plain-text' | 'markdown';
    length?: 'short' | 'medium' | 'long';
    context?: string;
    taal?: string;
  };
  rewriter?: {
    tone?: 'as-is' | 'more-formal' | 'more-casual';
    format?: 'as-is' | 'plain-text' | 'markdown';
    length?: 'as-is' | 'shorter' | 'longer';
    context?: string;
    taal?: string;
  };
  translator?: { bron?: string; doel?: string };
  proofreader?: { taal?: string };
  decisions?: { schema?: string };
  siteToegang?: boolean;
  tabTekst?: boolean;
  multimodaal?: boolean;
  autoDownload?: boolean;
};

export type PatchFilterUitkomst = {
  patch: LokaleAiPatch;
  veiligeVelden: string[];
  gevaarVelden: GevaarVeld[];
  geweigerdeGevaarVelden: GevaarVeld[];
};

/**
 * Очищає набір змін налаштувань для LOKALE_AI_STEL_IN.
 * Безпечні налаштування пропускаються одразу; «!»-перемикачі проходять ТІЛЬКИ за `bevestigGevaar: true`.
 */
export function filterLokaleAiPatch(
  ruw: unknown,
  opties: { bevestigGevaar?: boolean } = {},
): PatchFilterUitkomst {
  const d = ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? (ruw as Record<string, unknown>) : {};
  const patch: LokaleAiPatch = {};
  const veiligeVelden: string[] = [];
  const gevaarVelden: GevaarVeld[] = [];
  const geweigerdeGevaarVelden: GevaarVeld[] = [];

  if (typeof d.aan === 'boolean') { patch.aan = d.aan; veiligeVelden.push('aan'); }
  if (Array.isArray(d.apis)) {
    patch.apis = [...new Set(d.apis.filter(isLokaleAiApi))];
    veiligeVelden.push('apis');
  } else if (d.apis && typeof d.apis === 'object' && !Array.isArray(d.apis)) {
    const m: Partial<Record<LokaleAiApi, boolean>> = {};
    for (const [k, v] of Object.entries(d.apis as Record<string, unknown>)) {
      if (isLokaleAiApi(k) && typeof v === 'boolean') m[k] = v;
    }
    if (Object.keys(m).length) { patch.apis = m; veiligeVelden.push('apis'); }
  }
  for (const k of ['chatHulp', 'vertaalInvoer', 'vertaalUitvoer'] as const) {
    if (typeof d[k] === 'boolean') { patch[k] = d[k] as boolean; veiligeVelden.push(k); }
  }
  if (d.doelTaal === 'auto' || (typeof d.doelTaal === 'string' && (VERTAAL_TALEN as readonly string[]).includes(d.doelTaal))) {
    patch.doelTaal = d.doelTaal as string; veiligeVelden.push('doelTaal');
  }
  if (d.prompt && typeof d.prompt === 'object' && !Array.isArray(d.prompt)) {
    const src = d.prompt as Record<string, unknown>;
    const p: NonNullable<LokaleAiPatch['prompt']> = {};
    if (typeof src.systeem === 'string') p.systeem = src.systeem.slice(0, 4000);
    if (typeof src.schema === 'string') p.schema = src.schema.slice(0, 8000);
    if (typeof src.taal === 'string' && (MODEL_TALEN as readonly string[]).includes(src.taal)) p.taal = src.taal;
    if (typeof src.samplingMode === 'string' && (PROMPT_SAMPLING_MODES as readonly string[]).includes(src.samplingMode)) {
      p.samplingMode = src.samplingMode as PromptSamplingMode;
    }
    if (typeof src.toolUse === 'boolean') p.toolUse = src.toolUse;
    if (src.temperatuur === '' || (typeof src.temperatuur === 'string' && Number.isFinite(Number(src.temperatuur)) && Number(src.temperatuur) >= 0)) {
      p.temperatuur = src.temperatuur;
    }
    if (src.topK === '' || (typeof src.topK === 'string' && Number.isFinite(Number(src.topK)) && Number(src.topK) >= 0)) {
      p.topK = src.topK;
    }
    if (Object.keys(p).length) { patch.prompt = p; veiligeVelden.push('prompt'); }
  }
  if (d.summarizer && typeof d.summarizer === 'object' && !Array.isArray(d.summarizer)) {
    const src = d.summarizer as Record<string, unknown>;
    const s: NonNullable<LokaleAiPatch['summarizer']> = {};
    if (typeof src.type === 'string' && ['key-points', 'tldr', 'teaser', 'headline'].includes(src.type)) s.type = src.type as NonNullable<LokaleAiPatch['summarizer']>['type'];
    if (typeof src.format === 'string' && ['plain-text', 'markdown'].includes(src.format)) s.format = src.format as NonNullable<LokaleAiPatch['summarizer']>['format'];
    if (typeof src.length === 'string' && ['short', 'medium', 'long'].includes(src.length)) s.length = src.length as NonNullable<LokaleAiPatch['summarizer']>['length'];
    if (typeof src.preference === 'string' && (SUMMARIZER_PREFERENCES as readonly string[]).includes(src.preference)) s.preference = src.preference as SummarizerPreference;
    if (typeof src.context === 'string') s.context = src.context.slice(0, 1000);
    if (typeof src.taal === 'string' && (MODEL_TALEN as readonly string[]).includes(src.taal)) s.taal = src.taal;
    if (Object.keys(s).length) { patch.summarizer = s; veiligeVelden.push('summarizer'); }
  }
  if (d.writer && typeof d.writer === 'object' && !Array.isArray(d.writer)) {
    const src = d.writer as Record<string, unknown>;
    const w: NonNullable<LokaleAiPatch['writer']> = {};
    if (typeof src.tone === 'string' && ['formal', 'neutral', 'casual'].includes(src.tone)) w.tone = src.tone as NonNullable<LokaleAiPatch['writer']>['tone'];
    if (typeof src.format === 'string' && ['plain-text', 'markdown'].includes(src.format)) w.format = src.format as NonNullable<LokaleAiPatch['writer']>['format'];
    if (typeof src.length === 'string' && ['short', 'medium', 'long'].includes(src.length)) w.length = src.length as NonNullable<LokaleAiPatch['writer']>['length'];
    if (typeof src.context === 'string') w.context = src.context.slice(0, 1000);
    if (typeof src.taal === 'string' && (MODEL_TALEN as readonly string[]).includes(src.taal)) w.taal = src.taal;
    if (Object.keys(w).length) { patch.writer = w; veiligeVelden.push('writer'); }
  }
  if (d.rewriter && typeof d.rewriter === 'object' && !Array.isArray(d.rewriter)) {
    const src = d.rewriter as Record<string, unknown>;
    const rw: NonNullable<LokaleAiPatch['rewriter']> = {};
    if (typeof src.tone === 'string' && ['as-is', 'more-formal', 'more-casual'].includes(src.tone)) rw.tone = src.tone as NonNullable<LokaleAiPatch['rewriter']>['tone'];
    if (typeof src.format === 'string' && ['as-is', 'plain-text', 'markdown'].includes(src.format)) rw.format = src.format as NonNullable<LokaleAiPatch['rewriter']>['format'];
    if (typeof src.length === 'string' && ['as-is', 'shorter', 'longer'].includes(src.length)) rw.length = src.length as NonNullable<LokaleAiPatch['rewriter']>['length'];
    if (typeof src.context === 'string') rw.context = src.context.slice(0, 1000);
    if (typeof src.taal === 'string' && (MODEL_TALEN as readonly string[]).includes(src.taal)) rw.taal = src.taal;
    if (Object.keys(rw).length) { patch.rewriter = rw; veiligeVelden.push('rewriter'); }
  }
  if (d.translator && typeof d.translator === 'object' && !Array.isArray(d.translator)) {
    const src = d.translator as Record<string, unknown>;
    const tr: NonNullable<LokaleAiPatch['translator']> = {};
    if (src.bron === 'auto' || (typeof src.bron === 'string' && (VERTAAL_TALEN as readonly string[]).includes(src.bron))) tr.bron = src.bron as string;
    if (src.doel === 'auto' || (typeof src.doel === 'string' && (VERTAAL_TALEN as readonly string[]).includes(src.doel))) tr.doel = src.doel as string;
    if (Object.keys(tr).length) { patch.translator = tr; veiligeVelden.push('translator'); }
  }
  if (d.proofreader && typeof d.proofreader === 'object' && !Array.isArray(d.proofreader)) {
    const src = d.proofreader as Record<string, unknown>;
    if (typeof src.taal === 'string' && (MODEL_TALEN as readonly string[]).includes(src.taal)) {
      patch.proofreader = { taal: src.taal }; veiligeVelden.push('proofreader');
    }
  }
  if (d.decisions && typeof d.decisions === 'object' && !Array.isArray(d.decisions)) {
    const src = d.decisions as Record<string, unknown>;
    if (typeof src.schema === 'string') {
      patch.decisions = { schema: src.schema.slice(0, 8000) }; veiligeVelden.push('decisions');
    }
  }

  for (const k of GEVAAR_VELDEN) {
    if (typeof d[k] !== 'boolean') continue;
    if (opties.bevestigGevaar === true) {
      patch[k] = d[k] as boolean;
      gevaarVelden.push(k);
    } else {
      geweigerdeGevaarVelden.push(k);
    }
  }
  return { patch, veiligeVelden, gevaarVelden, geweigerdeGevaarVelden };
}

export type TaakPreset = {
  id: string;
  uk: string;
  nl: string;
  beschrijvingUk: string;
  beschrijvingNl: string;
  veilig: LokaleAiPatch;
  gevaar: Partial<Record<GevaarVeld, boolean>>;
  vlaggen: string[];
  cpuWaarschuwing?: boolean;
};

export const LOKALE_AI_PRESETS: readonly TaakPreset[] = Object.freeze([
  {
    id: 'samenvatten_snel',
    uk: 'Швидкий стислий виклад',
    nl: 'Snel samenvatten',
    beschrijvingUk: 'Вмикає головний перемикач і Summarizer із пріоритетом швидкості (speed), а також пропонує доступ зі сторінки сайту.',
    beschrijvingNl: 'Zet de hoofdschakelaar en Summarizer met snelheidsvoorkeur (speed) aan, en stelt paginatoegang voor.',
    veilig: { aan: true, apis: { summarizer: true, detector: true, translator: true }, summarizer: { preference: 'speed', type: 'key-points', length: 'medium' } },
    gevaar: { siteToegang: true },
    vlaggen: ['summarizer-api', 'summarizer-api-performance-preference', 'gemma4-for-built-in-ai'],
  },
  {
    id: 'gesprek_gemma4',
    uk: 'Діалог рідною мовою (Gemma 4)',
    nl: 'Gesprek in eigen taal (Gemma 4)',
    beschrijvingUk: 'Налаштовує Prompt API напряму на українську/нідерландську з Gemma 4 і збалансованою вибіркою.',
    beschrijvingNl: 'Stelt Prompt API direct in op Oekraïens/Nederlands met Gemma 4 en gebalanceerde sampling.',
    veilig: { aan: true, apis: { prompt: true, detector: true, translator: true }, prompt: { taal: 'uk', samplingMode: 'balanced' }, vertaalInvoer: true, vertaalUitvoer: true },
    gevaar: { siteToegang: true },
    vlaggen: ['prompt-api', 'prompt-api-sampling-mode', 'gemma4-for-built-in-ai'],
  },
  {
    id: 'tekst_kwaliteit',
    uk: 'Написання, переписування й коректура',
    nl: 'Schrijven, herschrijven en proeflezen',
    beschrijvingUk: 'Вмикає Writer, Rewriter, Proofreader і допоміжні кнопки в чаті бічної панелі.',
    beschrijvingNl: 'Zet Writer, Rewriter, Proofreader en de hulpknoppen in het zijpaneel aan.',
    veilig: { aan: true, apis: { writer: true, rewriter: true, proofreader: true, translator: true }, chatHulp: true },
    gevaar: { siteToegang: true },
    vlaggen: ['writer-api', 'rewriter-api', 'proofreader-api', 'gemma4-for-built-in-ai'],
  },
  {
    id: 'semantisch',
    uk: 'Значеннєвий пошук і класифікація',
    nl: 'Betekeniszoeken en indeling',
    beschrijvingUk: 'Вмикає SemanticEmbedder для пошуку за змістом (і за потреби DecisionModel з попередженням про режим CPU).',
    beschrijvingNl: 'Zet SemanticEmbedder voor zoeken op betekenis aan (en desgewenst DecisionModel met CPU-waarschuwing).',
    veilig: { aan: true, apis: { embedder: true, decisions: true, prompt: true } },
    gevaar: { siteToegang: true },
    vlaggen: ['semantic-embedder-api', 'on-device-category-classifier', 'decisions-api'],
    cpuWaarschuwing: true,
  },
  {
    id: 'stem_en_media',
    uk: 'Голос, аудіо й зображення',
    nl: 'Spraak, audio en beeld',
    beschrijvingUk: 'Вмикає Prompt API й просить підтвердити «!»-перемикач мультимодальності для зображень та аудіо.',
    beschrijvingNl: 'Zet Prompt API aan en vraagt bevestiging voor de «!»-schakelaar voor beeld en audio.',
    veilig: { aan: true, apis: { prompt: true, detector: true } },
    gevaar: { multimodaal: true, siteToegang: true },
    vlaggen: ['prompt-api', 'prompt-api-multimodal-input', 'web-speech-on-device-small-expert-model', 'gemma4-for-built-in-ai'],
  },
  {
    id: 'tools_webmcp',
    uk: 'Інструменти моделі та WebMCP',
    nl: 'Modelhulpmiddelen en WebMCP',
    beschrijvingUk: 'Вмикає підтримку інструментів (Tool Use) у Prompt API та сумісність із WebMCP на сайті.',
    beschrijvingNl: 'Zet Tool Use in de Prompt API en WebMCP-ondersteuning op de site aan.',
    veilig: { aan: true, apis: { prompt: true }, prompt: { toolUse: true, samplingMode: 'most-predictable' } },
    gevaar: { siteToegang: true },
    vlaggen: ['prompt-api', 'prompt-api-tool-use', 'prompt-api-sampling-mode', 'enable-webmcp-testing'],
  },
]);

export type TaakAdvies = {
  matchedIds: string[];
  veilig: LokaleAiPatch;
  gevaar: Partial<Record<GevaarVeld, boolean>>;
  vlaggen: string[];
  waarschuwingen: Array<{ uk: string; nl: string }>;
};

/**
 * Розбирає вільний текстовий запит користувача (uk/nl) й підбирає безпечний набір налаштувань,
 * перелік потрібних «!»-підтверджень та список потрібних прапорців Chrome 157.
 */
export function stelVoorNaarTaak(tekst: string, taal: 'uk' | 'nl' = 'uk'): TaakAdvies {
  const q = String(tekst || '').toLowerCase();
  const matchedIds: string[] = [];
  const apis: Partial<Record<LokaleAiApi, boolean>> = {};
  const veilig: LokaleAiPatch = { aan: true, apis };
  const gevaar: Partial<Record<GevaarVeld, boolean>> = {};
  const vlaggen = new Set<string>(['gemma4-for-built-in-ai']);
  const waarschuwingen: Array<{ uk: string; nl: string }> = [];

  const heeft = (re: RegExp) => re.test(q);

  if (heeft(/стисл|підсум|резюм|корот|samenvat|tldr|summary|summarizer/)) {
    matchedIds.push('samenvatten_snel');
    apis.summarizer = true;
    const snel = heeft(/швидк|snel|speed/);
    const goed = heeft(/якість|детальн|kwaliteit|capability|найкращ/);
    veilig.summarizer = { preference: snel ? 'speed' : goed ? 'capability' : 'auto' };
    vlaggen.add('summarizer-api');
    vlaggen.add('summarizer-api-performance-preference');
  }
  if (heeft(/діалог|чат|спілкув|пита|відпов|gemma|gesprek|chat|prompt|модел/)) {
    matchedIds.push('gesprek_gemma4');
    apis.prompt = true;
    veilig.prompt = {
      ...(veilig.prompt || {}),
      taal: heeft(/нідерланд|nederlands|\bnl\b/) ? 'nl' : heeft(/англ|engels|\ben\b/) ? 'en' : taal,
      samplingMode: heeft(/точн|передбач|строг|voorspel|strict/) ? 'most-predictable' : heeft(/творч|креатив|creat/) ? 'most-creative' : 'balanced',
    };
    vlaggen.add('prompt-api');
    vlaggen.add('prompt-api-sampling-mode');
  }
  if (heeft(/писат|написа|перепис|корект|правопис|грамати|schrij|herschrij|proefle|writer|rewriter|proofread/)) {
    matchedIds.push('tekst_kwaliteit');
    apis.writer = true;
    apis.rewriter = true;
    apis.proofreader = true;
    veilig.chatHulp = true;
    vlaggen.add('writer-api');
    vlaggen.add('rewriter-api');
    vlaggen.add('proofreader-api');
  }
  if (heeft(/переклад|мов|vertal|taal|translator|detector/)) {
    apis.translator = true;
    apis.detector = true;
    veilig.vertaalInvoer = true;
    veilig.vertaalUitvoer = true;
    vlaggen.add('translation-api');
    vlaggen.add('language-detection-api');
  }
  if (heeft(/пошук|вектор|семант|значен|схож|класиф|рішен|embed|semantic|decision|classif|zoek/)) {
    matchedIds.push('semantisch');
    apis.embedder = true;
    vlaggen.add('semantic-embedder-api');
    vlaggen.add('on-device-category-classifier');
    if (heeft(/рішен|класиф|схем|decision|classif/)) {
      apis.decisions = true;
      vlaggen.add('decisions-api');
      waarschuwingen.push({
        uk: 'Прапорець #decisions-api у Chrome 157 тимчасово переводить локальні моделі на CPU (повільніша робота).',
        nl: 'De vlag #decisions-api zet in Chrome 157 lokale modellen tijdelijk op de CPU (tragere verwerking).',
      });
    }
  }
  if (heeft(/голос|мікрофон|звук|аудіо|зображ|картин|фото|мультимод|spraak|stem|audio|beeld|afbeeld|foto|multimod/)) {
    matchedIds.push('stem_en_media');
    apis.prompt = true;
    gevaar.multimodaal = true;
    vlaggen.add('prompt-api');
    vlaggen.add('prompt-api-multimodal-input');
    vlaggen.add('web-speech-on-device-small-expert-model');
  }
  if (heeft(/інструмент|функці|webmcp|tool|дія|actie|кноп/)) {
    matchedIds.push('tools_webmcp');
    apis.prompt = true;
    veilig.prompt = { ...(veilig.prompt || {}), toolUse: true };
    vlaggen.add('prompt-api');
    vlaggen.add('prompt-api-tool-use');
    vlaggen.add('enable-webmcp-testing');
  }
  if (heeft(/вкладк|сторінк|сайт|чита|tabblad|pagina|site/)) {
    gevaar.siteToegang = true;
    if (heeft(/вкладк|активн|tabblad/)) gevaar.tabTekst = true;
  }
  if (heeft(/встанов|pwa|застосун|installeer|app/)) {
    vlaggen.add('web-app-installation-api');
  }
  // За замовчуванням для взаємодії зі сторінкою сайту пропонуємо siteToegang (але ніколи не вмикаємо без кліку).
  if (Object.keys(apis).length === 0) {
    apis.prompt = true;
    apis.summarizer = true;
    vlaggen.add('prompt-api');
    vlaggen.add('summarizer-api');
  }
  if (gevaar.siteToegang === undefined) gevaar.siteToegang = true;

  return { matchedIds, veilig, gevaar, vlaggen: [...vlaggen], waarschuwingen };
}

/** Генерує чистий конфігураційний JSON для chrome://flags (#import-export-flags) без data-sharing і небезпечних прапорців. */
export function bouwAanbevolenFlagsJson(opties: { metDecisions?: boolean } = {}): string {
  const lijst = CHROME_157_VLAGGEN
    .filter((v) => v.aanbevolen || (opties.metDecisions && v.id === 'decisions-api'))
    .map((v) => v.token)
    .concat(['ignore-gpu-blocklist', 'import-export-flags@1'])
    .sort();
  return JSON.stringify({
    customized_flags: {},
    enabled_flags: [...new Set(lijst)],
  }, null, 2);
}
