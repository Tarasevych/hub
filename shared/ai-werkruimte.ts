// Werkgebied «ШІ для вас» op ai.tarasevych.com (punt 13 van de eigenaarslijst, 19.10.2026).
//
// Dit bestand bevat ALLEEN de rekenkundige waarheid van dat scherm, zonder React en zonder database, zodat de
// eenheidstest precies kan nagaan wat de gebruiker te zien krijgt:
//   - `startStaat(feiten)` : wat kan dit account NU, en wat ontbreekt er nog (recht → sleutel → model → hulpmiddelen);
//   - `middelen(feiten)`   : één lijst van alle gemakken (model, server, bestanden, browser, post, agenda, schijf,
//                            GitHub, AI-koppelingen) met hun échte stand en het adres waar je ze aanzet;
//   - `STARTVRAGEN`        : kant-en-klare eerste vragen; `vragen(feiten)` zegt per vraag of ze NU werkt.
//
// Regel voor dit scherm: niets nabootsen. Een vraag die een hulpmiddel nodig heeft dat de chat niet heeft, wordt
// NIET als werkende knop aangeboden maar als «потрібно підключити» met de weg erheen. De stand 'niet-in-chat' is
// bewust zichtbaar: de koppeling bestaat wel (bv. post), maar het chatvenster op ai.* heeft dat hulpmiddel nog niet;
// een AI via de connector (hub «Підключення ШІ») heeft het wel.

/** Tekst in beide talen: [українською, Nederlands]. De UI kiest met tr(). */
export type Tweetalig = readonly [string, string];

/** Model dat de server ECHT heeft ingesteld (env CHAT_MODELLEN / CHAT_MODEL, anders het standaardmodel van de code). */
export type ModelKeuze = { id: string; standaard: boolean };

/** Alles wat het scherm over dit account weet. Komt van POST /api/owner/ai/werkruimte/overzicht; nooit uit de browser. */
export type Feiten = {
  /** Heeft dit account het recht 'api-platform' (backend/api-recht.ts)? Zonder dit recht werkt er niets op ai.*. */
  recht: boolean;
  /** Staat er een eigen Anthropic-sleutel in de kluis (BYOK)? */
  sleutel: boolean;
  /** Modellen die de eigenaar van de server heeft ingesteld. Leeg = de server heeft er geen. */
  modellen: readonly ModelKeuze[];
  /** Namen van de hulpmiddelen die de chat op ai.* op dit moment ECHT heeft (na hulpmiddelmodi en AI-beleid). */
  chatTools: readonly string[];
  /** Eigen pc's/VM's met de agent (Local Machine Connector). */
  apparaten: { totaal: number; online: number };
  /** Browsers met de extensie: gekoppeld en op dit moment aangezet. */
  browsers: { totaal: number; actief: number };
  /** GitHub-token in de kluis (doel github/github-app). */
  github: boolean;
  /** Google Suite per dienst. `bekend: false` = de stand kon niet gelezen worden; dan nooit «aan» beweren. */
  google: { bekend: boolean; post: boolean; agenda: boolean; schijf: boolean };
  /** Actieve AI-koppelingen via de connector (Claude, Grok…). */
  koppelingen: number;
};

export const LEGE_FEITEN: Feiten = {
  recht: false, sleutel: false, modellen: [], chatTools: [],
  apparaten: { totaal: 0, online: 0 }, browsers: { totaal: 0, actief: 0 },
  github: false, google: { bekend: false, post: false, agenda: false, schijf: false }, koppelingen: 0,
};

// ---------------------------------------------------------------------------------------------- gemakken (middelen)

export type MiddelGroep = 'model' | 'server' | 'bestanden' | 'browser' | 'post' | 'agenda' | 'schijf' | 'github' | 'koppelingen';
/**
 * 'aan'          — werkt nu, in dit chatvenster;
 * 'koppelen'     — bestaat nog niet voor dit account; de gebruiker zet het zelf aan (adres staat erbij);
 * 'niet-in-chat' — de koppeling bestaat, maar het chatvenster op ai.* heeft dat hulpmiddel niet (een AI via de connector wel);
 * 'geen-recht'   — het account mist het recht 'api-platform'; alleen de eigenaar/beheerder kan dat geven.
 */
export type MiddelStaat = 'aan' | 'koppelen' | 'niet-in-chat' | 'geen-recht';

export type MiddelPlaats = { dienst: 'api' | 'mcp' | 'mail' | 'cloud' | 'github'; tab: string; hash?: string; label: Tweetalig };

export type Middel = {
  id: string;
  groep: MiddelGroep;
  naam: Tweetalig;
  /** Wat dit gemak de gebruiker geeft, in één zin. */
  wat: Tweetalig;
  staat: MiddelStaat;
  /** Harde feiten erbij (aantallen, modelnaam). Nooit een belofte. */
  detail?: Tweetalig;
  /** Waar je dit aanzet. */
  waar: MiddelPlaats;
};

const KLUIS: MiddelPlaats = { dienst: 'api', tab: 'vault', label: ['Сховище секретів', 'Geheimenkluis'] };
const HUB_CONNECTORS: MiddelPlaats = { dienst: 'mcp', tab: 'agents', hash: 'connectors', label: ['Підключення ШІ → Способи', 'AI-koppelingen → Manieren'] };
const HUB_APPARATEN: MiddelPlaats = { dienst: 'mcp', tab: 'agents', hash: 'apparaten', label: ['Підключення ШІ → Пристрої', 'AI-koppelingen → Apparaten'] };
const HUB_EXTENSIE: MiddelPlaats = { dienst: 'mcp', tab: 'agents', hash: 'extensie', label: ['Підключення ШІ → Розширення браузера', 'AI-koppelingen → Browserextensie'] };
const HUB_HULPMIDDELEN: MiddelPlaats = { dienst: 'mcp', tab: 'tools', label: ['Інструменти ШІ', 'AI-hulpmiddelen'] };
const POST: MiddelPlaats = { dienst: 'mail', tab: 'accounts', label: ['Пошта → Акаунти', 'E-mail → Accounts'] };
const AGENDA: MiddelPlaats = { dienst: 'cloud', tab: 'accounts', label: ['Хмара → Акаунти', 'Cloud → Accounts'] };
const GITHUB: MiddelPlaats = { dienst: 'github', tab: 'accounts', label: ['GitHub → Акаунти', 'GitHub → Accounts'] };

const telDetail = (a: number, b: number, uk: string, nl: string): Tweetalig => [`${uk}: ${a} / ${b}`, `${nl}: ${a} / ${b}`];
/** Heeft de chat ten minste één van deze hulpmiddelen? */
export const heeftTool = (f: Feiten, namen: readonly string[]): boolean => namen.some((n) => f.chatTools.includes(n));

/**
 * Eén lijst van alle gemakken met hun échte stand. Zonder het recht 'api-platform' krijgt alles 'geen-recht':
 * dan is er niets aan te zetten en zou «підключити» de gebruiker alleen naar een geweigerd scherm sturen.
 */
export function middelen(f: Feiten): Middel[] {
  const geenRecht = !f.recht;
  const staat = (aan: boolean, bestaat = aan): MiddelStaat => (geenRecht ? 'geen-recht' : aan ? 'aan' : bestaat ? 'niet-in-chat' : 'koppelen');
  const model = f.modellen.find((m) => m.standaard) ?? f.modellen[0];
  return [
    {
      id: 'model', groep: 'model', naam: ['Ключ моделі (Anthropic)', 'Modelsleutel (Anthropic)'],
      wat: ['Без нього чат на цій сторінці не відповідає: запити йдуть вашим власним ключем.', 'Zonder deze sleutel antwoordt de chat op deze pagina niet: verzoeken lopen op uw eigen sleutel.'],
      staat: geenRecht ? 'geen-recht' : f.sleutel && model ? 'aan' : 'koppelen',
      detail: !f.sleutel ? ['Ключа немає у сховищі', 'Geen sleutel in de kluis']
        : model ? ([`Модель: ${model.id}`, `Model: ${model.id}`] as Tweetalig)
          : ['Сервер не має налаштованої моделі', 'De server heeft geen ingesteld model'],
      waar: KLUIS,
    },
    {
      id: 'server', groep: 'server', naam: ['Ваші пристрої (ПК, віртуальна машина)', 'Uw apparaten (pc, virtuele machine)'],
      wat: ['Подивитися систему, список контейнерів, запустити дозволену команду.', 'Het systeem bekijken, containers opsommen, een toegestane opdracht uitvoeren.'],
      staat: staat(heeftTool(f, ['machine_list', 'machine_info', 'sys_metrics']), f.apparaten.totaal > 0),
      detail: telDetail(f.apparaten.online, f.apparaten.totaal, 'Онлайн', 'Online'),
      waar: HUB_APPARATEN,
    },
    {
      id: 'bestanden', groep: 'bestanden', naam: ['Файли на ваших пристроях', 'Bestanden op uw apparaten'],
      wat: ['Читати й шукати у дозволених папках; запис — лише з вашим підтвердженням.', 'Lezen en zoeken in toegestane mappen; schrijven alleen met uw goedkeuring.'],
      staat: staat(heeftTool(f, ['machine_list_dir', 'machine_read_file', 'machine_search_files']), f.apparaten.totaal > 0),
      detail: ['Межі (папки, команди) задає сам агент на пристрої', 'De agent op het apparaat stelt de grenzen (mappen, opdrachten) zelf'],
      waar: HUB_APPARATEN,
    },
    {
      id: 'browser', groep: 'browser', naam: ['Браузер із розширенням', 'Browser met de extensie'],
      wat: ['Подивитися відкриті сторінки й діагностику; дії — лише коли ви ввімкнули розширення.', 'Open pagina\'s en diagnostiek bekijken; acties alleen als u de extensie aanzette.'],
      staat: staat(heeftTool(f, ['browser_pages', 'browser_open', 'browser_history']), f.browsers.totaal > 0),
      detail: telDetail(f.browsers.actief, f.browsers.totaal, 'Увімкнено', 'Aangezet'),
      waar: HUB_EXTENSIE,
    },
    {
      id: 'github', groep: 'github', naam: ['GitHub', 'GitHub'],
      wat: ['Читати репозиторії, задачі й стан перевірок вашим токеном зі сховища.', 'Repositories, issues en de stand van controles lezen met uw token uit de kluis.'],
      staat: staat(heeftTool(f, ['github_get']), f.github),
      detail: f.github ? ['Токен у сховищі є', 'Token staat in de kluis'] : ['Токена у сховищі немає', 'Geen token in de kluis'],
      waar: f.github ? HUB_HULPMIDDELEN : GITHUB,
    },
    {
      id: 'post', groep: 'post', naam: ['Пошта', 'E-mail'],
      wat: ['Шукати й читати листи, готувати відповідь (надсилання — завжди ваш клік).', 'Mail zoeken en lezen, een antwoord voorbereiden (versturen is altijd uw klik).'],
      staat: staat(heeftTool(f, ['mail_search_messages', 'mail_read_message', 'mail_list_accounts']), f.google.bekend && f.google.post),
      detail: !f.google.bekend ? ['Стан підключення не вдалося прочитати', 'De stand van de koppeling kon niet gelezen worden']
        : f.google.post ? ['Акаунт пошти підключено', 'Mailaccount is gekoppeld'] : ['Акаунт пошти не підключено', 'Geen mailaccount gekoppeld'],
      waar: POST,
    },
    {
      id: 'agenda', groep: 'agenda', naam: ['Календар', 'Agenda'],
      wat: ['Побачити, що у вас на день чи тиждень, і підготувати подію.', 'Zien wat er op de dag of week staat en een afspraak voorbereiden.'],
      staat: staat(heeftTool(f, ['calendar_list_events', 'calendar_list_calendars']), f.google.bekend && f.google.agenda),
      detail: !f.google.bekend ? ['Стан підключення не вдалося прочитати', 'De stand van de koppeling kon niet gelezen worden']
        : f.google.agenda ? ['Календар підключено', 'Agenda is gekoppeld'] : ['Календар не підключено', 'Geen agenda gekoppeld'],
      waar: AGENDA,
    },
    {
      id: 'schijf', groep: 'schijf', naam: ['Файли у хмарі (Drive)', 'Bestanden in de cloud (Drive)'],
      wat: ['Знайти документ у хмарі й прочитати його текст.', 'Een document in de cloud vinden en de tekst ervan lezen.'],
      staat: staat(heeftTool(f, ['drive_browse', 'drive_read_file']), f.google.bekend && f.google.schijf),
      detail: !f.google.bekend ? ['Стан підключення не вдалося прочитати', 'De stand van de koppeling kon niet gelezen worden']
        : f.google.schijf ? ['Диск підключено', 'Drive is gekoppeld'] : ['Диск не підключено', 'Geen Drive gekoppeld'],
      waar: AGENDA,
    },
    {
      id: 'koppelingen', groep: 'koppelingen', naam: ['Зовнішні ШІ (Claude, Grok…)', 'Externe AI (Claude, Grok…)'],
      wat: ['Той самий набір інструментів, але з боку вашого ШІ — через конектор.', 'Dezelfde hulpmiddelen, maar vanuit uw eigen AI — via de connector.'],
      staat: geenRecht ? 'geen-recht' : f.koppelingen > 0 ? 'aan' : 'koppelen',
      detail: [`Активних підключень: ${f.koppelingen}`, `Actieve koppelingen: ${f.koppelingen}`],
      waar: HUB_CONNECTORS,
    },
  ];
}

// ---------------------------------------------------------------------------------------------- startstaat

/** Waarom de chat (nog) niet werkt, in de volgorde waarin de gebruiker het oplost. */
export type Blokkade = 'geen-recht' | 'geen-sleutel' | 'geen-model' | null;

export type Startstaat = {
  recht: boolean;
  /** Mag deze mens hier nu echt een vraag stellen? */
  kanChatten: boolean;
  blokkade: Blokkade;
  /** Het model dat de server gebruikt, of '' als er geen is. */
  model: string;
  /** Gemakken die NU werken, en wat nog ontbreekt — voor de twee lijsten op de startpagina. */
  klaar: Middel[];
  ontbreekt: Middel[];
  /** Hoeveel hulpmiddelen de chat op dit moment echt heeft. */
  aantalTools: number;
  /** Niets aangesloten: geen sleutel, geen hulpmiddel, geen integratie, geen AI-koppeling. */
  leeg: boolean;
};

/** De hele startstaat uit de feiten. Eén bron voor de kop, de twee lijsten en of het invoerveld aan mag. */
export function startStaat(f: Feiten): Startstaat {
  const model = f.modellen.find((m) => m.standaard) ?? f.modellen[0];
  const blokkade: Blokkade = !f.recht ? 'geen-recht' : !f.sleutel ? 'geen-sleutel' : !model ? 'geen-model' : null;
  const alle = middelen(f);
  const integraties = f.google.bekend && (f.google.post || f.google.agenda || f.google.schijf);
  return {
    recht: f.recht,
    kanChatten: blokkade === null,
    blokkade,
    model: model?.id ?? '',
    klaar: alle.filter((m) => m.staat === 'aan'),
    ontbreekt: alle.filter((m) => m.staat !== 'aan'),
    aantalTools: f.chatTools.length,
    leeg: !f.sleutel && f.chatTools.length === 0 && f.apparaten.totaal === 0 && f.browsers.totaal === 0 && !f.github && !integraties && f.koppelingen === 0,
  };
}

// ---------------------------------------------------------------------------------------------- startvragen

export type VraagGroep = 'algemeen' | 'server' | 'bestanden' | 'browser' | 'post' | 'agenda' | 'schijf' | 'github';

export type Startvraag = {
  id: string;
  groep: VraagGroep;
  tekst: Tweetalig;
  /** Hulpmiddelen waarvan er MINSTENS ÉÉN in de chat moet zitten. Leeg = werkt altijd (alleen de modelsleutel). */
  tools: readonly string[];
};

/**
 * Kant-en-klare eerste vragen. Elke vraag noemt bij zichzelf welk hulpmiddel ze nodig heeft, zodat de UI nooit een
 * knop aanbiedt die daarna «цього я не вмію» antwoordt. De twee algemene vragen hebben geen hulpmiddel nodig.
 */
export const STARTVRAGEN: readonly Startvraag[] = [
  { id: 'uitleg', groep: 'algemeen', tools: [], tekst: ['Що ти вмієш у моєму просторі саме зараз? Перелічи інструменти, які в тебе є.', 'Wat kun je nu precies in mijn ruimte? Noem de hulpmiddelen die je hebt.'] },
  { id: 'samenvatten', groep: 'algemeen', tools: [], tekst: ['Поясни простими словами текст, який я зараз вставлю, і виділи головне.', 'Leg de tekst die ik hierna plak in gewone woorden uit en haal het belangrijkste eruit.'] },
  { id: 'server-stand', groep: 'server', tools: ['machine_list', 'machine_info'], tekst: ['Покажи мої пристрої та стан системи на тому, що онлайн.', 'Toon mijn apparaten en de systeemstand van degene die online is.'] },
  { id: 'server-docker', groep: 'server', tools: ['docker_list_containers'], tekst: ['Які контейнери Docker запущені на моєму пристрої і який у них стан?', 'Welke Docker-containers draaien op mijn apparaat en wat is hun stand?'] },
  { id: 'bestanden-map', groep: 'bestanden', tools: ['machine_list_dir'], tekst: ['Покажи вміст дозволеної папки проєкту на моєму ПК.', 'Toon de inhoud van de toegestane projectmap op mijn pc.'] },
  { id: 'bestanden-zoek', groep: 'bestanden', tools: ['machine_search_files'], tekst: ['Знайди у дозволеній папці файли, де згадується «TODO», і покажи де саме.', 'Zoek in de toegestane map bestanden waarin «TODO» staat en toon waar precies.'] },
  { id: 'apps', groep: 'server', tools: ['app_list', 'app_logs'], tekst: ['Які мої додатки розгорнуті й чи немає помилок у їхніх журналах?', 'Welke van mijn apps staan uitgerold en staan er fouten in hun logboeken?'] },
  { id: 'browser-pagina', groep: 'browser', tools: ['browser_pages', 'browser_history'], tekst: ['Які сторінки відкриті в моєму браузері зараз?', 'Welke pagina\'s staan nu open in mijn browser?'] },
  { id: 'github-werk', groep: 'github', tools: ['github_get'], tekst: ['Що зі моїми задачами на GitHub: які відкриті й що змінилося за тиждень?', 'Hoe staan mijn GitHub-issues: welke zijn open en wat veranderde er deze week?'] },
  { id: 'post-ongelezen', groep: 'post', tools: ['mail_search_messages'], tekst: ['Знайди непрочитані листи за три дні й стисло скажи, що важливе.', 'Zoek de ongelezen mail van drie dagen en zeg kort wat belangrijk is.'] },
  { id: 'post-antwoord', groep: 'post', tools: ['draft_email_reply', 'mail_read_message'], tekst: ['Підготуй чернетку відповіді на останній лист — надсилати не треба.', 'Maak een conceptantwoord op de laatste mail — versturen hoeft niet.'] },
  { id: 'agenda-dag', groep: 'agenda', tools: ['calendar_list_events'], tekst: ['Що в мене в календарі на сьогодні й завтра?', 'Wat staat er vandaag en morgen in mijn agenda?'] },
  { id: 'schijf-zoek', groep: 'schijf', tools: ['drive_browse', 'drive_read_file'], tekst: ['Знайди в моєму диску документ про цей проєкт і перекажи його зміст.', 'Zoek in mijn Drive het document over dit project en vat het samen.'] },
  { id: 'zoeken', groep: 'algemeen', tools: ['site_search'], tekst: ['Пошукай у моєму просторі все, що стосується цього тижня.', 'Zoek in mijn ruimte alles wat met deze week te maken heeft.'] },
];

export type VraagStand = { vraag: Startvraag; beschikbaar: boolean };

/** Elke startvraag met het oordeel of ze NU werkt: de chat moet kunnen antwoorden én het hulpmiddel echt hebben. */
export function vragenMetStand(f: Feiten): VraagStand[] {
  const kan = startStaat(f).kanChatten;
  return STARTVRAGEN.map((vraag) => ({ vraag, beschikbaar: kan && (vraag.tools.length === 0 || heeftTool(f, vraag.tools)) }));
}

/** Alleen de vragen die echt werken (de knoppen die iets in het veld zetten). */
export const vragen = (f: Feiten): Startvraag[] => vragenMetStand(f).filter((v) => v.beschikbaar).map((v) => v.vraag);

/** Groepen in de volgorde van het scherm, met hun kop. */
export const VRAAG_GROEPEN: readonly { id: VraagGroep; naam: Tweetalig }[] = [
  { id: 'algemeen', naam: ['Для початку', 'Om te beginnen'] },
  { id: 'post', naam: ['Пошта', 'E-mail'] },
  { id: 'bestanden', naam: ['Файли', 'Bestanden'] },
  { id: 'agenda', naam: ['Календар', 'Agenda'] },
  { id: 'github', naam: ['GitHub', 'GitHub'] },
  { id: 'server', naam: ['Сервер і пристрої', 'Server en apparaten'] },
  { id: 'browser', naam: ['Браузер', 'Browser'] },
  { id: 'schijf', naam: ['Хмарні файли', 'Cloudbestanden'] },
];

// ---------------------------------------------------------------------------------------------- foutcodes

/**
 * Foutcodes van het werkgebied. De belangrijkste regel (audit 19.10, U-03): een GELDIGE sessie zonder het recht
 * 'api-platform' geeft API_RECHT_VEREIST (backend/api-recht.ts) en NOOIT OWNER_API_SESSION_REQUIRED — anders leest
 * de gebruiker «Сесія закінчилася» terwijl zijn sessie prima is en alleen het recht ontbreekt.
 */
export const WERKRUIMTE_FOUTEN = {
  geenSleutel: 'AI_WERKRUIMTE_GEEN_SLEUTEL',
  geenModel: 'AI_WERKRUIMTE_GEEN_MODEL',
  modelOnbekend: 'AI_WERKRUIMTE_MODEL_ONBEKEND',
  teVeel: 'AI_WERKRUIMTE_TE_VEEL_VERZOEKEN',
  laatsteMoetVraagZijn: 'AI_WERKRUIMTE_LAATSTE_MOET_VRAAG_ZIJN',
  aanbieder: 'AI_WERKRUIMTE_AANBIEDER_FOUT',
} as const;

/** Foutcode van de aanbieder met de HTTP-status erbij (401 = sleutel geweigerd, 429 = limiet van Anthropic). */
export const aanbiederFout = (status: number): string => `${WERKRUIMTE_FOUTEN.aanbieder}_${Number.isFinite(status) ? status : 0}`;
