// MAILAI-002 (16.11.2026): «Рушій ШІ» в пошті — хто обробляє текст листа, де, чиїм ключем, безкоштовно чи платно.
// Павло: «користувач завжди може обрати принцип роботи і бачити, який ключ, сервер, сервіс задіяно … щоб обрати безкоштовний замість
// платного»; «зрозуміло, що працює локально, а що через постачальника, а що через наш сервер».
//
// Motorkeuze voor de post (zuiver, zonder browser): per motor WAAR de tekst verwerkt wordt, WIE hem ziet, WELKE sleutel, wat het KOST
// en welke functies hij kan. Drie echte soorten vandaag:
//   - lokaal: de ingebouwde AI van Chrome via de extensie (Gemini Nano op dit apparaat) — gratis, tekst verlaat het apparaat niet;
//   - eigen sleutel: de server van de gebruiker roept een aanbieder aan met de EIGEN sleutel uit de Sleutelkluis (nooit die van de
//     eigenaar of van een andere gebruiker);
//   - MAILAI-003: gedeelde motoren van de site — de sleutel van de eigenaar bij een aanbieder («voor iedereen», los van zijn eigen
//     sleutels) en de eigen server van de site (LibreTranslate/Ollama). Alleen wat de eigenaar aanzette, en pas na EIGEN akkoord.
// Prijzen staan NIET hard in de code: ze veranderen; we linken naar de officiële pagina van elke aanbieder en tonen er een
// automatisch opgehaalde richtprijs bij (bron erbij vermeld).

import { AI_AANBIEDER_BIJ_ID, aanbiederUitAgent, type AiAanbiederId } from './ai-aanbieders';
import { agentKanPost, type AiVertalingAgentInfo, type AiVertalingMode, type AiVertalingRunResponse, type AiVertalingSegment } from './ai-vertaling';
import { dienstAgentId, dienstWaarheen, gebruikSleutelDienst, gebruikSleutelEigen, type DienstGebruik, type DienstMotorPubliek } from './ai-dienst-motor';

export type MotorSoort = 'lokaal' | 'sleutel' | 'eigen-server' | 'dienst-eigenaar';
export type MotorKosten = 'gratis' | 'gratis-niveau' | 'betaald' | 'eigenaar';
/** 'akkoord' = спільний рушій готовий, але людина ще не погодилася; 'op' = денну межу на сьогодні вичерпано. */
export type MotorStaat = 'klaar' | 'instellen' | 'niet-hier' | 'nog-niet' | 'akkoord' | 'op';

/** Wat de site over de extensie weet op DIT apparaat (uit PING). */
export type LokaalStand = 'onbekend' | 'telefoon' | 'beleid-uit' | 'geen-extensie' | 'oud' | 'uit' | 'site-uit' | 'niet-hier' | 'model-ontbreekt' | 'klaar';

export const LOKAAL_MIN_EXTENSIE = '0.9.2';
/** Grenzen van de extensie voor pagina's (extension/background.js lokaleAiVoorSite). */
export const LOKAAL_LIMIET = Object.freeze({ perMinuut: 20, tekens: 20000, tegelijk: 2 });
/** Keuze per apparaat: de lokale AI bestaat alleen op een computer met de extensie, dus de voorkeur hoort bij het apparaat. */
export const MOTOR_VOORKEUR_SLEUTEL = 'mr-mail-ai-motor-v1';
export const MOTOR_AUTO = 'auto';
export const LOKAAL_MOTOR_ID = 'lokaal:chrome';

export type AanbiederBron = { prijzen: string; gegevens: string; waarUk: string; waarNl: string; kostenUk: string; kostenNl: string; kosten: MotorKosten };
/**
 * Офіційні сторінки постачальників (перевірено 16.11.2026). Ціни не копіюються в код — вони змінюються; кнопка веде на джерело.
 * Officiële pagina's; prijzen niet overgenomen in de code.
 */
export const AANBIEDER_BRONNEN: Readonly<Record<AiAanbiederId, AanbiederBron>> = Object.freeze({
  anthropic: {
    prijzen: 'https://claude.com/pricing', gegevens: 'https://www.anthropic.com/legal/commercial-terms', kosten: 'betaald',
    waarUk: 'Anthropic (США)', waarNl: 'Anthropic (VS)',
    kostenUk: 'платно, оплата за використання; за комерційними умовами Anthropic не навчає моделі на ваших даних',
    kostenNl: 'betaald, per gebruik; volgens de commerciële voorwaarden traint Anthropic geen modellen op uw gegevens',
  },
  gemini: {
    prijzen: 'https://ai.google.dev/gemini-api/docs/pricing', gegevens: 'https://ai.google.dev/gemini-api/terms', kosten: 'gratis-niveau',
    waarUk: 'Google (Gemini API)', waarNl: 'Google (Gemini API)',
    kostenUk: 'безкоштовний рівень з лімітами або платно — залежить від вашого проєкту Google. На безкоштовному рівні Google використовує запити для покращення продуктів, їх можуть читати люди; у ЄЕЗ, Швейцарії й Великій Британії умови Google для застосунків передбачають лише платний рівень',
    kostenNl: 'gratis niveau met limieten of betaald — hangt af van uw Google-project. Op het gratis niveau gebruikt Google de verzoeken om zijn producten te verbeteren en kunnen mensen ze lezen; in de EER, Zwitserland en het VK voorzien de voorwaarden van Google voor apps alleen het betaalde niveau',
  },
  openai: {
    prijzen: 'https://openai.com/api/pricing/', gegevens: 'https://openai.com/enterprise-privacy/', kosten: 'betaald',
    waarUk: 'OpenAI (США)', waarNl: 'OpenAI (VS)',
    kostenUk: 'платно, оплата за використання; дані API за умовами OpenAI не використовуються для навчання',
    kostenNl: 'betaald, per gebruik; API-gegevens worden volgens OpenAI niet gebruikt voor training',
  },
  grok: {
    prijzen: 'https://docs.x.ai/docs/models', gegevens: 'https://x.ai/legal/terms-of-service-enterprise', kosten: 'betaald',
    waarUk: 'xAI (США)', waarNl: 'xAI (VS)', kostenUk: 'платно, оплата за використання', kostenNl: 'betaald, per gebruik',
  },
  autoclaw: {
    prijzen: 'https://open.bigmodel.cn/pricing', gegevens: 'https://open.bigmodel.cn/', kosten: 'betaald',
    waarUk: 'Zhipu / Z.ai (сервер open.bigmodel.cn, Китай)', waarNl: 'Zhipu / Z.ai (server open.bigmodel.cn, China)',
    kostenUk: 'платно, оплата за використання; текст іде на сервер у Китаї', kostenNl: 'betaald, per gebruik; de tekst gaat naar een server in China',
  },
});
export const CHROME_AI_BRON = 'https://developer.chrome.com/docs/ai/get-started';

export type MotorKaart = {
  id: string;
  soort: MotorSoort;
  staat: MotorStaat;
  kosten: MotorKosten;
  naamUk: string; naamNl: string;
  /** Шлях тексту: звідки → куди. */
  wegUk: string; wegNl: string;
  /** Чий ключ або обліковий запис. */
  sleutelUk: string; sleutelNl: string;
  kostenUk: string; kostenNl: string;
  /** Що зробити, якщо не готово (або чому недоступно тут). */
  stapUk: string; stapNl: string;
  functies: readonly AiVertalingMode[];
  aanbieder?: AiAanbiederId;
  agentId?: string;
  bronnen: { uk: string; nl: string; href: string }[];
  /** MAILAI-003: спільний рушій сайту за цією карткою (для згоди й підпису «хто обробив»). */
  dienst?: DienstMotorPubliek;
  /** Використання сьогодні й залишок за даними постачальника — «сьогодні 4 із 30». Порожньо, якщо ще не користувалися. */
  gebruikUk?: string; gebruikNl?: string;
  /** Орієнтовна ціна, отримана автоматично (з назвою джерела й датою). */
  prijsUk?: string; prijsNl?: string;
};

/** Орієнтовні ціни з сервера (backend/ai-prijzen.ts): долари США за 1 млн токенів. */
export type MotorPrijzen = { opgehaaldOp: number; bron: string; perAanbieder: Partial<Record<AiAanbiederId, { model: string; invoerPerMln: number; uitvoerPerMln: number }>> };
/** Типовий лист для оцінки: близько 1500 токенів на вхід і 1200 на вихід (переклад сторінки тексту). */
export const TYPISCHE_BRIEF = Object.freeze({ invoer: 1500, uitvoer: 1200 });

const geld = (x: number) => (x < 0.01 ? x.toFixed(4) : x < 1 ? x.toFixed(3) : x.toFixed(2)).replace(/0+$/, '').replace(/\.$/, '');
/** «Орієнтовно $1 / $5 за 1 млн токенів … ≈ $0.0075 за типовий лист; за даними OpenRouter на 16.11.2026». */
export function prijsTekst(prijzen: MotorPrijzen | null | undefined, aanbieder: AiAanbiederId | undefined): [string, string] | null {
  const w = aanbieder && prijzen?.perAanbieder?.[aanbieder];
  if (!w || !prijzen) return null;
  const brief = (TYPISCHE_BRIEF.invoer * w.invoerPerMln + TYPISCHE_BRIEF.uitvoer * w.uitvoerPerMln) / 1_000_000;
  const d = new Date(prijzen.opgehaaldOp);
  const dag = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  return [
    `Орієнтовно $${geld(w.invoerPerMln)} за 1 млн токенів на вхід і $${geld(w.uitvoerPerMln)} на вихід — близько $${geld(brief)} за типовий лист (модель ${w.model}). Отримано автоматично з переліку OpenRouter ${dag}; точна ціна — на офіційній сторінці постачальника.`,
    `Richtprijs $${geld(w.invoerPerMln)} per 1 mln tokens invoer en $${geld(w.uitvoerPerMln)} uitvoer — ongeveer $${geld(brief)} per gewone brief (model ${w.model}). Automatisch opgehaald uit de lijst van OpenRouter op ${dag}; de exacte prijs staat op de officiële pagina van de aanbieder.`,
  ];
}

/** «Сьогодні: 4 із 30 запитів» + залишок за заголовками постачальника (Anthropic, OpenAI; Gemini такого не повідомляє). */
export function gebruikTekst(g: DienstGebruik | null | undefined): [string, string] | null {
  if (!g || (!g.vandaag && g.resterend === undefined && !g.limietPerDag)) return null;
  const uk: string[] = []; const nl: string[] = [];
  if (g.limietPerDag) { uk.push(`сьогодні ${g.vandaag} із ${g.limietPerDag} запитів`); nl.push(`vandaag ${g.vandaag} van ${g.limietPerDag} verzoeken`); }
  else { uk.push(`сьогодні запитів: ${g.vandaag}`); nl.push(`vandaag ${g.vandaag} verzoeken`); }
  if (g.resterend !== undefined) {
    uk.push(g.limiet ? `у постачальника лишилося ${g.resterend} із ${g.limiet} у поточному вікні` : `у постачальника лишилося ${g.resterend} у поточному вікні`);
    nl.push(g.limiet ? `bij de aanbieder nog ${g.resterend} van ${g.limiet} in het huidige venster` : `bij de aanbieder nog ${g.resterend} in het huidige venster`);
  }
  return [uk.join('; '), nl.join('; ')];
}

/** Що ще знає пошта, крім агентів і стану розширення. Усе необов'язкове: старий сервер = як раніше. */
export type MotorExtra = {
  dienst?: readonly DienstMotorPubliek[];
  gebruik?: Readonly<Record<string, DienstGebruik>>;
  prijzen?: MotorPrijzen | null;
  /** Розширення вміє «сирий» запит зі схемою (PING lokaleAi.promptRauw) — тоді локально працює й «Що від вас потрібно?». */
  lokaalPrompt?: boolean;
  /** Хто й чому вимкнув локальний ШІ політикою (PING lokaleAi.beleid, розширення 0.9.6+). */
  beleid?: { reden?: string; door?: string; op?: string | number } | null;
};

const ALLE_FUNCTIES: readonly AiVertalingMode[] = Object.freeze(['translate', 'summary', 'purpose', 'context', 'acties']);
export const LOKAAL_FUNCTIES: readonly AiVertalingMode[] = Object.freeze(['translate', 'summary']);
/** З розширенням, що вміє «сирий» запит зі схемою (0.9.6+), локально працює й «Що від вас потрібно?». */
export const LOKAAL_FUNCTIES_PROMPT: readonly AiVertalingMode[] = Object.freeze(['translate', 'summary', 'acties']);

/** Відповідь PING → чи вміє розширення «сирий» запит зі схемою. */
export function lokaalPromptVan(ping: unknown): boolean {
  const lai = ping && typeof ping === 'object' ? (ping as { lokaleAi?: unknown }).lokaleAi : null;
  if (!lai || typeof lai !== 'object') return false;
  const l = lai as { promptRauw?: unknown; apis?: unknown; stand?: unknown };
  if (l.promptRauw !== true) return false;
  const apis = Array.isArray(l.apis) ? l.apis.map(String) : [];
  const stand = l.stand && typeof l.stand === 'object' ? String((l.stand as Record<string, unknown>).prompt || '') : '';
  return apis.includes('prompt') && (stand === '' || stand === 'available');
}
/** Відповідь PING → хто й чому вимкнув локальний ШІ політикою (лише короткі рядки; це текст адміністратора, не інструкція). */
export function lokaalBeleidVan(ping: unknown): MotorExtra['beleid'] {
  const lai = ping && typeof ping === 'object' ? (ping as { lokaleAi?: unknown }).lokaleAi : null;
  const b = lai && typeof lai === 'object' ? (lai as { beleid?: unknown }).beleid : null;
  if (!b || typeof b !== 'object') return null;
  const kort = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const r = b as { reden?: unknown; door?: unknown; op?: unknown };
  const uit = { reden: kort(r.reden, 300), door: kort(r.door, 80), op: typeof r.op === 'number' || typeof r.op === 'string' ? r.op : undefined };
  return uit.reden || uit.door ? uit : null;
}

const versieOuder = (a: string, b: string): boolean => {
  const pa = String(a || '0').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0; }
  return false;
};

/**
 * Стан локального ШІ за відповіддю розширення на PING. `ping` = null — розширення не відповіло (немає або вимкнене).
 * Stand van de lokale AI uit het PING-antwoord van de extensie; zonder extensie of op een telefoon: eerlijk waarom niet.
 */
export function lokaalStandVan(ping: unknown, o: { mobiel?: boolean } = {}): LokaalStand {
  if (o.mobiel) return 'telefoon';
  if (!ping || typeof ping !== 'object') return 'geen-extensie';
  const p = ping as Record<string, unknown>;
  if (p.ok !== true) return 'geen-extensie';
  const versie = typeof p.version === 'string' ? p.version : '';
  const lai = p.lokaleAi && typeof p.lokaleAi === 'object' ? p.lokaleAi as Record<string, unknown> : null;
  if (!versie || versieOuder(versie, LOKAAL_MIN_EXTENSIE) || !lai || lai.ondersteund !== true) return 'oud';
  // Extensie 0.9.5+/0.9.6+ (afspraak met de extensie-thread): PING lokaleAi.reden met dezelfde codes + 'beleid-uit' (beheerder zette het uit).
  const REDENEN: readonly LokaalStand[] = ['beleid-uit', 'uit', 'site-uit', 'niet-hier', 'model-ontbreekt', 'klaar'];
  if (typeof lai.reden === 'string' && (REDENEN as readonly string[]).includes(lai.reden)) return lai.reden as LokaalStand;
  if (lai.aan === false) return 'uit';
  if (lai.siteToegang !== true) return 'site-uit';
  const apis = Array.isArray(lai.apis) ? lai.apis.map(String) : [];
  if (!apis.includes('translator') && !apis.includes('summarizer')) return 'uit';
  const stand = lai.stand && typeof lai.stand === 'object' ? lai.stand as Record<string, unknown> : {};
  const st = ['translator', 'summarizer'].filter((a) => apis.includes(a)).map((a) => String(stand[a] || ''));
  if (st.includes('available')) return 'klaar';
  if (st.some((x) => x === 'downloadable' || x === 'downloading')) return 'model-ontbreekt';
  if (st.length && st.every((x) => x === 'unavailable' || x === 'ontbreekt' || x === 'fout')) return 'niet-hier';
  // Geen meting (oudere extensie of offscreen stil): proberen mag — de extensie zegt eerlijk waarom niet.
  return 'klaar';
}

const LOKAAL_STAP: Readonly<Record<LokaalStand, [string, string]>> = Object.freeze({
  onbekend: ['Перевіряємо розширення на цьому пристрої…', 'De extensie op dit apparaat wordt gecontroleerd…'],
  'beleid-uit': ['Адміністратор цього комп’ютера або браузера вимкнув вбудований ШІ Chrome. Оберіть постачальника з вашим ключем.', 'De beheerder van deze computer of browser heeft de ingebouwde AI van Chrome uitgezet. Kies een aanbieder met uw sleutel.'],
  telefoon: ['На телефоні вбудованого ШІ Chrome немає (Google підтримує його лише на комп’ютерах). Відкрийте пошту на комп’ютері з Chrome або оберіть постачальника з вашим ключем.', 'Op een telefoon bestaat de ingebouwde AI van Chrome niet (Google ondersteunt hem alleen op computers). Open de post op een computer met Chrome of kies een aanbieder met uw sleutel.'],
  'geen-extensie': ['Потрібне розширення Mijn Ruimte для Chrome (безкоштовно). Після встановлення ввімкніть у ньому «Локальний ШІ» і перемикач «!» для сторінок сайту.', 'De extensie Mijn Ruimte voor Chrome is nodig (gratis). Zet daarna «Lokale AI» en de «!»-schakelaar voor pagina’s van de site aan.'],
  oud: [`Оновіть розширення до ${LOKAAL_MIN_EXTENSIE} або новішого — старіше не вміє працювати для сторінок сайту.`, `Werk de extensie bij naar ${LOKAAL_MIN_EXTENSIE} of nieuwer — oudere versies werken niet voor pagina’s van de site.`],
  uit: ['У розширенні вимкнено «Локальний ШІ» або переклад і стислий виклад. Увімкніть їх у налаштуваннях розширення.', 'In de extensie staat «Lokale AI» of vertalen en samenvatten uit. Zet ze aan in de instellingen van de extensie.'],
  'site-uit': ['Один крок: у налаштуваннях розширення → «Локальний ШІ» ввімкніть «!» «Використання сторінками сайту». Сайт сам цього зробити не може — лише ви.', 'Eén stap: in de instellingen van de extensie → «Lokale AI» zet u «!» «Gebruik door pagina’s van de site» aan. De site kan dat niet zelf — alleen u.'],
  'niet-hier': ['Цей комп’ютер або ця версія Chrome не підтримує вбудований ШІ (потрібно ≥ 22 ГБ вільного місця, GPU > 4 ГБ або 16 ГБ RAM).', 'Deze computer of deze Chrome-versie ondersteunt de ingebouwde AI niet (≥ 22 GB vrij, GPU > 4 GB of 16 GB RAM nodig).'],
  'model-ontbreekt': ['Модель ще не завантажена: натисніть «Завантажити модель» у налаштуваннях розширення (кілька ГБ, один раз).', 'Het model is nog niet gedownload: klik «Model downloaden» in de instellingen van de extensie (enkele GB, één keer).'],
  klaar: ['Готово: текст обробляє модель на цьому комп’ютері.', 'Klaar: het model op deze computer verwerkt de tekst.'],
});
export const lokaalStap = (s: LokaalStand): [string, string] => LOKAAL_STAP[s];

/** Усі рушії для пошти: локальний, кожен приватний агент з вашим ключем, і чесні «ще не налаштовано» варіанти. */
export function motorenVoorPost(agents: readonly AiVertalingAgentInfo[], lokaal: LokaalStand, extra: MotorExtra = {}): MotorKaart[] {
  let [lStapUk, lStapNl] = lokaalStap(lokaal);
  // Розширення 0.9.6+: адміністратор вимикає локальний ШІ лише з причиною, яку людина бачить — показуємо, хто й чому.
  if (lokaal === 'beleid-uit' && extra.beleid) {
    const { door, reden } = extra.beleid;
    lStapUk = `Локальний ШІ вимкнув адміністратор${door ? ` (${door})` : ''}.${reden ? ` Причина: «${reden}».` : ''} Оберіть інший рушій або зверніться до адміністратора.`;
    lStapNl = `De lokale AI is uitgezet door de beheerder${door ? ` (${door})` : ''}.${reden ? ` Reden: «${reden}».` : ''} Kies een andere motor of neem contact op met de beheerder.`;
  }
  const met = (k: MotorKaart, teller: string, aanbieder?: AiAanbiederId, limietPerDag?: number): MotorKaart => {
    const g = extra.gebruik?.[teller];
    const gt = gebruikTekst(g || limietPerDag ? { vandaag: 0, ...g, ...(limietPerDag ? { limietPerDag } : {}) } : null);
    const pt = prijsTekst(extra.prijzen, aanbieder);
    return { ...k, ...(gt ? { gebruikUk: gt[0], gebruikNl: gt[1] } : {}), ...(pt ? { prijsUk: pt[0], prijsNl: pt[1] } : {}) };
  };
  const kaarten: MotorKaart[] = [{
    id: LOKAAL_MOTOR_ID, soort: 'lokaal', staat: lokaal === 'klaar' ? 'klaar' : lokaal === 'telefoon' || lokaal === 'niet-hier' || lokaal === 'beleid-uit' ? 'niet-hier' : 'instellen', kosten: 'gratis',
    naamUk: 'Локальний ШІ Chrome', naamNl: 'Lokale AI van Chrome',
    wegUk: 'лист → модель Gemini Nano на цьому комп’ютері. Нікуди не надсилається — навіть ваш сервер тексту не бачить.',
    wegNl: 'bericht → model Gemini Nano op deze computer. Gaat nergens heen — ook uw server ziet de tekst niet.',
    sleutelUk: 'без ключа й облікового запису', sleutelNl: 'zonder sleutel of account',
    kostenUk: `безкоштовно; до ${LOKAAL_LIMIET.perMinuut} запитів за хвилину, до ${LOKAAL_LIMIET.tekens.toLocaleString('uk-UA')} символів за раз; працює GPU/RAM вашого комп’ютера`,
    kostenNl: `gratis; tot ${LOKAAL_LIMIET.perMinuut} verzoeken per minuut, tot ${LOKAAL_LIMIET.tekens.toLocaleString('nl-BE')} tekens per keer; uw GPU/RAM doet het werk`,
    stapUk: lStapUk, stapNl: lStapNl, functies: extra.lokaalPrompt ? LOKAAL_FUNCTIES_PROMPT : LOKAAL_FUNCTIES,
    bronnen: [{ uk: 'Вимоги Google', nl: 'Vereisten van Google', href: CHROME_AI_BRON }],
  }];
  for (const a of agents) {
    if (a.ruimte !== 'prive' || !a.allowedMailRead) continue;
    const aanbieder = aanbiederUitAgent(a);
    const meta = AI_AANBIEDER_BIJ_ID[aanbieder];
    const b = AANBIEDER_BRONNEN[aanbieder];
    const assistent = a.id === 'prive:mijn-ruimte-assistent';
    const klaar = agentKanPost(a);
    kaarten.push(met({
      id: a.id, agentId: a.id, aanbieder, soort: 'sleutel', staat: klaar ? 'klaar' : 'instellen', kosten: b.kosten,
      naamUk: assistent ? 'Асистент Мого Простору (ваш перший ключ)' : a.source === 'vault' ? `${meta.naamUk} · ваш ключ` : `${meta.naamUk} · ${a.name}`,
      naamNl: assistent ? 'Assistent van Mijn Ruimte (uw eerste sleutel)' : a.source === 'vault' ? `${meta.naamNl} · uw sleutel` : `${meta.naamNl} · ${a.name}`,
      wegUk: `лист → ваш сервер Mijn Ruimte (прибирає трекери й приховує секрети) → ${assistent ? 'постачальник вашого першого ключа' : b.waarUk} → відповідь назад. Лише після вашого натискання.`,
      wegNl: `bericht → uw server van Mijn Ruimte (haalt trackers weg en verbergt geheimen) → ${assistent ? 'de aanbieder van uw eerste sleutel' : b.waarNl} → antwoord terug. Alleen na uw klik.`,
      sleutelUk: 'ваш власний ключ API зі «Сховища ключів» — ніколи ключ власника сервера чи іншого користувача',
      sleutelNl: 'uw eigen API-sleutel uit de «Sleutelkluis» — nooit de sleutel van de eigenaar van de server of van een andere gebruiker',
      kostenUk: assistent ? 'залежить від постачальника вашого ключа' : b.kostenUk, kostenNl: assistent ? 'hangt af van de aanbieder van uw sleutel' : b.kostenNl,
      stapUk: klaar ? 'Готово.' : 'Додайте ключ цього постачальника в «Сховище ключів».', stapNl: klaar ? 'Klaar.' : 'Voeg een sleutel van deze aanbieder toe in de «Sleutelkluis».',
      functies: ALLE_FUNCTIES,
      bronnen: assistent ? [] : [{ uk: 'Ціни (офіційно)', nl: 'Prijzen (officieel)', href: b.prijzen }, { uk: 'Що робить з даними', nl: 'Wat er met de gegevens gebeurt', href: b.gegevens }],
    }, gebruikSleutelEigen(aanbieder), assistent ? undefined : aanbieder));
  }
  // MAILAI-003: спільні рушії сайту — лише ті, що власник увімкнув. Готовим рушій стає після ВАШОЇ згоди; денна межа — на людину.
  for (const d of extra.dienst || []) {
    const eigenServer = d.soort !== 'aanbieder';
    const b = d.aanbieder ? AANBIEDER_BRONNEN[d.aanbieder] : null;
    const op = d.vandaag >= d.limietPerDag;
    kaarten.push(met({
      id: dienstAgentId(d.id), agentId: dienstAgentId(d.id), aanbieder: d.aanbieder, dienst: d,
      soort: eigenServer ? 'eigen-server' : 'dienst-eigenaar', staat: !d.akkoord ? 'akkoord' : op ? 'op' : 'klaar', kosten: eigenServer ? 'gratis' : 'eigenaar',
      naamUk: `${d.naam} · спільний рушій сайту`, naamNl: `${d.naam} · gedeelde motor van de site`,
      wegUk: `лист → сервер Mijn Ruimte (прибирає трекери й приховує секрети) → ${eigenServer ? `власний сервер сайту${d.host ? ` (${d.host})` : ''}` : b?.waarUk || 'постачальник'} → відповідь назад. ${dienstWaarheen(d)}`,
      wegNl: `bericht → server van Mijn Ruimte (haalt trackers weg en verbergt geheimen) → ${eigenServer ? `de eigen server van de site${d.host ? ` (${d.host})` : ''}` : b?.waarNl || 'de aanbieder'} → antwoord terug. ${dienstWaarheen(d, true)}`,
      sleutelUk: eigenServer ? 'без ключа постачальника: це програма на сервері сайту' : `ключ сайту, який адміністратор (${d.beheerder || 'власник'}) надав «для всіх» окремо від особистих ключів. Ваші ключі не використовуються`,
      sleutelNl: eigenServer ? 'zonder sleutel van een aanbieder: het is een programma op de server van de site' : `sleutel van de site, door de beheerder (${d.beheerder || 'eigenaar'}) «voor iedereen» gedeeld, los van persoonlijke sleutels. Uw sleutels worden niet gebruikt`,
      kostenUk: `для вас безкоштовно; не більше ${d.limietPerDag} запитів на день на людину${eigenServer ? '' : ' (платить власник сайту)'}`,
      kostenNl: `voor u gratis; hoogstens ${d.limietPerDag} verzoeken per dag per persoon${eigenServer ? '' : ' (de eigenaar van de site betaalt)'}`,
      stapUk: !d.akkoord ? 'Потрібна ваша згода: прочитайте, куди піде текст, і натисніть «Погоджуюся». Без згоди цей рушій не отримає жодного листа.'
        : op ? 'Денну межу на сьогодні вичерпано. Завтра лічильник почнеться знову; поки оберіть інший рушій.' : 'Готово.',
      stapNl: !d.akkoord ? 'Uw akkoord is nodig: lees waar de tekst heen gaat en klik «Ik ga akkoord». Zonder akkoord krijgt deze motor geen enkele brief.'
        : op ? 'De daglimiet voor vandaag is bereikt. Morgen begint de teller opnieuw; kies voorlopig een andere motor.' : 'Klaar.',
      functies: d.functies,
      bronnen: b ? [{ uk: 'Що постачальник робить з даними', nl: 'Wat de aanbieder met de gegevens doet', href: b.gegevens }] : [],
    }, gebruikSleutelDienst(d.id), undefined, d.limietPerDag));
  }
  if ((extra.dienst || []).length) return kaarten;
  kaarten.push({
    id: 'eigen-server', soort: 'eigen-server', staat: 'nog-niet', kosten: 'gratis',
    naamUk: 'Ваш сервер (LibreTranslate / Ollama)', naamNl: 'Uw server (LibreTranslate / Ollama)',
    wegUk: 'лист → програма на вашому власному сервері. Нікуди далі не йде.', wegNl: 'bericht → programma op uw eigen server. Gaat nergens verder.',
    sleutelUk: 'без ключа', sleutelNl: 'zonder sleutel', kostenUk: 'безкоштовно, але навантажує сервер', kostenNl: 'gratis, maar belast de server',
    stapUk: 'Адміністратор сайту ще не підключив власний сервер перекладу. Коли підключить, рушій з’явиться тут і спитає вашої згоди.', stapNl: 'De beheerder van de site heeft nog geen eigen vertaalserver gekoppeld. Zodra dat gebeurt, verschijnt de motor hier en vraagt hij uw akkoord.',
    functies: ['translate'], bronnen: [],
  }, {
    id: 'dienst-eigenaar', soort: 'dienst-eigenaar', staat: 'nog-niet', kosten: 'eigenaar',
    naamUk: 'Спільний ШІ від власника сервера', naamNl: 'Gedeelde AI van de eigenaar van de server',
    wegUk: 'лист → сервер → постачальник, якого обрав власник, його ключем. Власник платить і бачить статистику використання.',
    wegNl: 'bericht → server → de aanbieder die de eigenaar koos, met zijn sleutel. De eigenaar betaalt en ziet gebruikscijfers.',
    sleutelUk: 'ключ власника, наданий «для всіх» окремо від його особистих ключів', sleutelNl: 'sleutel van de eigenaar, «voor iedereen» gedeeld, los van zijn eigen sleutels',
    kostenUk: 'для вас безкоштовно в межах, які задав власник', kostenNl: 'voor u gratis binnen de grenzen van de eigenaar',
    stapUk: 'Адміністратор сайту ще не ввімкнув спільний ШІ для всіх. Коли ввімкне, рушій з’явиться тут і спитає вашої згоди.', stapNl: 'De beheerder van de site heeft nog geen gedeelde AI voor iedereen aangezet. Zodra dat gebeurt, verschijnt de motor hier en vraagt hij uw akkoord.',
    functies: ALLE_FUNCTIES, bronnen: [],
  });
  return kaarten;
}

const KOSTEN_RANG: Readonly<Record<MotorKosten, number>> = Object.freeze({ gratis: 0, eigenaar: 1, 'gratis-niveau': 2, betaald: 3 });
/**
 * Обраний рушій для функції: ваш вибір, якщо він готовий і вміє цю функцію; «авто» — спершу безкоштовний (локальний), потім
 * безкоштовний рівень, потім платний. null = немає жодного готового.
 */
export function kiesMotor(kaarten: readonly MotorKaart[], voorkeur: string, functie: AiVertalingMode = 'translate'): MotorKaart | null {
  const klaar = kaarten.filter((k) => k.staat === 'klaar' && k.functies.includes(functie));
  // Uw expliciete keuze wordt nooit stil vervangen: kan hij deze functie niet (lokaal: geen context), dan null — anders zou de tekst
  // ongevraagd naar een aanbieder gaan. Alleen een keuze die er niet meer is (agent weg) valt terug op «авто».
  if (voorkeur && voorkeur !== MOTOR_AUTO) {
    const v = kaarten.find((k) => k.id === voorkeur);
    if (v) return v.staat === 'klaar' && v.functies.includes(functie) ? v : null;
  }
  return [...klaar].sort((a, b) => KOSTEN_RANG[a.kosten] - KOSTEN_RANG[b.kosten])[0] || null;
}
/** Інший готовий рушій для тієї ж функції (коли ліміт вичерпано). */
export function andereMotor(kaarten: readonly MotorKaart[], huidig: string, functie: AiVertalingMode): MotorKaart | null {
  return kiesMotor(kaarten.filter((k) => k.id !== huidig), MOTOR_AUTO, functie);
}

// ---------------------------------------------------------------- lokale vertaling: fragmenten in blokken (≤ 20 verzoeken per minuut)
/**
 * Фрагменти листа → кілька блоків тексту, по одному фрагменту в рядку (переноси всередині — пробіли). Так замість сотні запитів —
 * один-два, і не перевищується ліміт розширення. Fragmenten → blokken met één fragment per regel.
 */
export function vertaalBlokken(segmenten: readonly AiVertalingSegment[], max = LOKAAL_LIMIET.tekens - 500): { ids: string[]; tekst: string }[] {
  const blokken: { ids: string[]; tekst: string }[] = [];
  let ids: string[] = []; let regels: string[] = []; let lengte = 0;
  for (const s of segmenten) {
    const regel = String(s.text || '').replace(/\s+/g, ' ').trim().slice(0, max);
    if (!regel) continue;
    if (lengte + regel.length + 1 > max && ids.length) { blokken.push({ ids, tekst: regels.join('\n') }); ids = []; regels = []; lengte = 0; }
    ids.push(s.id); regels.push(regel); lengte += regel.length + 1;
  }
  if (ids.length) blokken.push({ ids, tekst: regels.join('\n') });
  return blokken;
}
/** Переклад блоку назад у фрагменти; null, якщо модель змінила кількість рядків (тоді — по фрагменту окремо). */
export function blokTerug(ids: readonly string[], vertaald: string): Record<string, string> | null {
  const vol = String(vertaald || '').split('\n').map((r) => r.trim()).filter(Boolean);
  if (vol.length !== ids.length) return null;
  const uit: Record<string, string> = {};
  ids.forEach((id, i) => { uit[id] = vol[i]; });
  return uit;
}

/** Відповідь Summarizer (зазвичай пункти «* …») → підсумок у форматі панелі. */
export function samenvattingVanTekst(tekst: string): NonNullable<AiVertalingRunResponse['summary']> {
  const regels = String(tekst || '').split('\n').map((r) => r.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  return { depth: 'brief', headline: regels[0] || '', keyFacts: regels.slice(1, 12), dates: [], sums: [], actionItems: [], timeline: [] };
}

/** Короткий підпис «хто обробив» для результату. */
export function verwerktDoor(o: { lokaal?: boolean; aanbiederId?: string; agentName?: string; dienst?: Pick<DienstMotorPubliek, 'soort' | 'naam' | 'host' | 'aanbieder'> | null }, nl: boolean): string {
  if (o.lokaal) return nl ? 'op deze computer (lokale AI van Chrome), niets verzonden' : 'на цьому комп’ютері (локальний ШІ Chrome), нічого не надіслано';
  if (o.dienst) {
    if (o.dienst.soort !== 'aanbieder') return nl ? `server van Mijn Ruimte → eigen server van de site (${o.dienst.host || o.dienst.naam}), geen AI-bedrijf` : `сервер Mijn Ruimte → власний сервер сайту (${o.dienst.host || o.dienst.naam}), без ШІ-компаній`;
    const m = o.dienst.aanbieder ? AI_AANBIEDER_BIJ_ID[o.dienst.aanbieder] : null;
    return nl ? `server van Mijn Ruimte → ${m?.naamNl || o.dienst.naam}, met de sleutel van de site (niet de uwe)` : `сервер Mijn Ruimte → ${m?.naamUk || o.dienst.naam}, ключем сайту (не вашим)`;
  }
  const a = o.aanbiederId && o.aanbiederId in AI_AANBIEDER_BIJ_ID ? AI_AANBIEDER_BIJ_ID[o.aanbiederId as AiAanbiederId] : null;
  const naam = a ? (nl ? a.naamNl : a.naamUk) : (o.agentName || (nl ? 'AI-aanbieder' : 'постачальник ШІ'));
  return nl ? `uw server → ${naam}, met uw eigen sleutel` : `ваш сервер → ${naam}, вашим власним ключем`;
}
