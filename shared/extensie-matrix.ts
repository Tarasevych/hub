// «Браузер і агенти» — één scherm voor alles wat een AI via de browserextensie mag (zone E, 22.10.2026; migratie 0110).
//
// Klacht van de eigenaar: «Що може ШІ» stond verstopt onder elke gekoppelde browser, los van het ontgrendelen, en een AI kreeg
// «EXTENSIE_CAP: … allowed: browser.read» zonder dat te vinden was waar «навігація» aan te zetten was. Dit bestand is de ENE bron
// voor dat scherm (src/extensie/BrowserEnAgenten.tsx), de server (backend/extensie-matrix.ts), de connector (backend/connector-v2-browser.ts)
// en de tests. Puur: geen React, geen Node.
//
// Model:
//   slot (ruimte: prive | technisch) × mogelijkheid (BrowserCap, zeven stuks) × agent (claude, gpt, grok, gemini, copilot, cursor of
//   '*' = alle agenten). Een rij per (gebruiker, ruimte, agent) met de caps die DIE agent in DAT slot mag; de rij '*' geldt voor elke
//   agent zonder eigen rij. Geen enkele rij voor een ruimte = «erfenis»: de oude weg (toestemmingen per browser, app.ai_grants) blijft
//   dan gelden, zodat niets stil wegvalt bij het installeren van 0110. Zodra de eigenaar het scherm één keer opslaat, beslist de matrix.
//   De werkelijke toestemming voor één opdracht = ontgrendeling.caps ∩ beleid (0073) ∩ matrix[ruimte][agent].
//   Per slot nog twee schakelaars: `zonderBevestiging` (handelen/schermafdruk/diagnose zonder klik per actie — alleen met step-up) en
//   `devtoolsNamen` (de connector toont ook de namen van chrome-devtools-mcp in tools/list; aanroepen kan altijd).
import type { AiRuimte } from './ai-ruimte';
import type { AgentSlug } from './connector-v2/agenten';
import { BROWSER_CAPS, type BrowserCap, type EindeSoort } from './extensie-ontgrendeling';

/** Waar het scherm leeft. Elke weigering van de connector (EXTENSIE_*) noemt precies dit adres. */
export const BROWSER_BEHEER_URL = 'https://mcp.tarasevych.com/agents#browser';
/** Zelfde pad in woorden, voor de Engelse tekst die een AI leest. */
export const BROWSER_BEHEER_PAD_EN = `mcp.tarasevych.com → AI connections → «Browser and agents» (${BROWSER_BEHEER_URL})`;

export const MATRIX_AGENT_ALLE = '*' as const;
export type MatrixAgent = AgentSlug | typeof MATRIX_AGENT_ALLE;
export const MATRIX_AGENTEN: readonly MatrixAgent[] = Object.freeze(['*', 'claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw']);
export const isMatrixAgent = (v: unknown): v is MatrixAgent => typeof v === 'string' && (MATRIX_AGENTEN as readonly string[]).includes(v);

/** Teksten per mogelijkheid: naam, wat het toelaat, risico (uk, nl). Volgorde = BROWSER_CAPS. */
export const CAP_INFO: Readonly<Record<BrowserCap, { uk: [naam: string, wat: string, risico: string]; nl: [naam: string, wat: string, risico: string]; gevaarlijk: boolean }>> = Object.freeze({
  'browser.read': {
    uk: ['Читати', 'Текст і елементи відкритої сторінки, список вкладок, очікування тексту, прокрутка, аудит сторінки.', 'ШІ бачить усе, що видно вам на цих сторінках (пошту, файли). Паролі й платіжні поля не читаються ніколи.'],
    nl: ['Lezen', 'Tekst en elementen van de open pagina, tabbladen, wachten op tekst, scrollen, pagina-audit.', 'De AI ziet alles wat u op die pagina’s ziet (mail, bestanden). Wachtwoord- en betaalvelden nooit.'],
    gevaarlijk: false,
  },
  'browser.navigate': {
    uk: ['Навігація', 'Відкривати адреси сайту, назад/вперед/оновити, нові вкладки, перемикання вкладок.', 'ШІ може відкрити будь-яку сторінку вашого сайту в цьому слоті — лише https на tarasevych.com, нічого стороннього.'],
    nl: ['Navigatie', 'Adressen van de site openen, terug/vooruit/vernieuwen, nieuwe tabbladen, tabblad kiezen.', 'De AI kan elke pagina van uw site in dit slot openen — alleen https op tarasevych.com, nooit iets anders.'],
    gevaarlijk: false,
  },
  'browser.interact': {
    uk: ['Клік і введення', 'Натискати кнопки, заповнювати поля й форми, обирати опції, натискати клавіші навігації, дії сайту.', 'ШІ може змінити ваші дані (надіслати лист, видалити файл). Без «без підтвердження» кожна дія чекає на ваш клік.'],
    nl: ['Klikken en typen', 'Knoppen, velden, formulieren, opties, navigatietoetsen, site-acties.', 'De AI kan uw gegevens wijzigen (mail versturen, bestand wissen). Zonder «zonder bevestiging» wacht elke actie op uw klik.'],
    gevaarlijk: true,
  },
  'browser.screenshot': {
    uk: ['Скріншот', 'Знімок видимої частини активної вкладки.', 'На знімку є все, що на екрані, зокрема особисте. Знімок надсилається моделі ШІ.'],
    nl: ['Schermafdruk', 'Afbeelding van het zichtbare deel van het actieve tabblad.', 'Alles op het scherm staat erop, ook privé. De afbeelding gaat naar het AI-model.'],
    gevaarlijk: true,
  },
  'browser.console': {
    uk: ['Консоль і мережа', 'Повідомлення консолі та список мережевих запитів вкладки (метод, адреса без параметрів, статус, час). Разом із «Читати».', 'Без заголовків, тіл і параметрів адрес — але адреси та помилки можуть виказати, що ви робите на сайті.'],
    nl: ['Console en netwerk', 'Consoleberichten en de lijst netwerkverzoeken van het tabblad (methode, adres zonder query, status, tijd). Samen met «Lezen».', 'Zonder headers, bodies en query’s — maar adressen en fouten verraden wat u op de site doet.'],
    gevaarlijk: false,
  },
  'browser.debug': {
    uk: ['Глибока діагностика', 'Налагоджувач Chrome на кілька секунд: винятки, мережа, повільні запити. Лише технічний слот і пакет «діагностика».', 'Налагоджувач бачить усе всередині сторінки. Лише для розробників, лише на адмін-сторінках.'],
    nl: ['Diepe diagnose', 'De Chrome-debugger een paar seconden: uitzonderingen, netwerk, trage verzoeken. Alleen technisch slot en pakket «diagnose».', 'De debugger ziet alles binnen de pagina. Alleen voor ontwikkelaars, alleen op beheerpagina’s.'],
    gevaarlijk: true,
  },
  'browser.script': {
    uk: ['Скрипти', 'Виконати JavaScript у вкладці (evaluate_script, як у chrome-devtools-mcp). Лише технічний слот, пакет «діагностика» і окремий дозвіл тут.', 'Довільний код у вашій сесії: може прочитати й змінити все на сторінці. Вмикайте лише на час розробки.'],
    nl: ['Scripts', 'JavaScript in het tabblad uitvoeren (evaluate_script, zoals chrome-devtools-mcp). Alleen technisch slot, pakket «diagnose» en een apart vinkje hier.', 'Willekeurige code in uw sessie: kan alles op de pagina lezen en wijzigen. Alleen aan tijdens ontwikkeling.'],
    gevaarlijk: true,
  },
});
/**
 * Welke RIJ van de matrix een opdracht nodig heeft. Meestal de mogelijkheid van ai-grants (TYPE_CAPABILITY); console en netwerk
 * vallen daar onder «Читати» (bestaande toestemmingen en ontgrendelingen blijven geldig) en hebben in de matrix een eigen rij.
 * Wie «Консоль і мережа» aanvinkt, krijgt «Читати» erbij (valideerInvoer): zonder lezen geen console.
 */
export const MATRIX_CAP_VOOR_TYPE: Readonly<Record<string, BrowserCap>> = Object.freeze({ 'browser.console': 'browser.console', 'browser.network': 'browser.console' });
export const matrixCap = (type: string, cap: string | null): BrowserCap | null => MATRIX_CAP_VOOR_TYPE[type] ?? ((BROWSER_CAPS as readonly string[]).includes(String(cap)) ? cap as BrowserCap : null);

/** Mogelijkheden die in het slot 'prive' nooit bestaan (debugger en scripts zijn technisch). */
export const CAPS_ALLEEN_TECHNISCH: readonly BrowserCap[] = Object.freeze(['browser.debug', 'browser.script']);
export const capsVoorRuimte = (ruimte: AiRuimte): BrowserCap[] => BROWSER_CAPS.filter((c) => ruimte === 'technisch' || !CAPS_ALLEEN_TECHNISCH.includes(c));

/** Snelle sets. */
export const SNEL_SETS: Readonly<Record<'alles' | 'lezen' | 'niets', { uk: string; nl: string; caps: (ruimte: AiRuimte) => BrowserCap[] }>> = Object.freeze({
  alles: { uk: 'Дозволити все для розробки', nl: 'Alles toestaan voor ontwikkeling', caps: (r: AiRuimte): BrowserCap[] => capsVoorRuimte(r) },
  lezen: { uk: 'Лише читання', nl: 'Alleen lezen', caps: (): BrowserCap[] => ['browser.read', 'browser.console'] },
  niets: { uk: 'Заблокувати', nl: 'Blokkeren', caps: (): BrowserCap[] => [] },
});

// ---------------------------------------------------------------- termijnen (klacht 2: «не кожні чотири години»)
export type TermijnId = '15m' | '1u' | '4u' | 'tech-einde' | 'browser' | 'uitloggen' | 'handmatig' | '1d' | '7d' | '30d' | '182d' | '365d';
export type Termijn = { id: TermijnId; uk: string; nl: string; ms: number | null; soort: EindeSoort; alleenTechnisch?: boolean; risico: { uk: string; nl: string } };
const D = 86_400_000, U = 3_600_000;
/** Achtervang voor termijnen zonder vaste duur ('uitloggen', 'browser'): een jaar. 'handmatig' («Без обмеження») gebruikt dezelfde rijgrens, maar de server opent een nieuwe rij vóór het einde (vernieuwEinde) — nooit eindeZetten op dezelfde gid. */
export const TERMIJN_ACHTERVANG_MS = 366 * D;
/** «Без обмеження»: nieuwe rij zodra er minder dan dit over is én het beleid de rij écht langer laat worden. */
export const VERNIEUW_VOOR_MS = 30 * D;
/** Een verlenging korter dan een dag is geen verlenging (anders vernieuwt een krap beleid elke hartslag). */
export const VERNIEUW_MIN_WINST_MS = D;
/**
 * Opdracht van de eigenaar (E2): «перезапуск браузера не скидає, якщо обрано ≥ «до виходу з акаунта»». Dus de KORTE termijnen
 * (15 хв, 1 год, 4 год, «до кінця технічної активації») en «до закриття браузера» horen bij deze browsersessie: na een herstart van de
 * browser trekt de server ze in (0111, kolom browser_sessie). «До виходу з акаунта», «Без обмеження» en 1 тиждень … 1 рік
 * overleven een herstart (de server duwt de ontgrendeling opnieuw). Alleen met extensie ≥ 0.7.0 (die meldt de browsersessie).
 */
export const BROWSER_GEBONDEN_TOT_MS = 4 * U;
export const aanBrowserGebonden = (soort: EindeSoort, duurMs: number): boolean =>
  soort === 'browser' || soort === 'tech-einde' || (soort === 'duur' && duurMs <= BROWSER_GEBONDEN_TOT_MS + 60_000);
export const ONTGRENDEL_TERMIJNEN: readonly Termijn[] = Object.freeze([
  { id: '15m', uk: '15 хвилин', nl: '15 minuten', ms: 15 * 60_000, soort: 'duur', risico: { uk: 'Найбезпечніше: доступ сам закривається (закриття браузера теж закриває).', nl: 'Het veiligst: de toegang sluit vanzelf (de browser sluiten sluit ook).' } },
  { id: '1u', uk: '1 година', nl: '1 uur', ms: U, soort: 'duur', risico: { uk: 'Короткий робочий сеанс; закриття браузера теж закриває.', nl: 'Een korte werksessie; de browser sluiten sluit ook.' } },
  { id: '4u', uk: '4 години', nl: '4 uur', ms: 4 * U, soort: 'duur', risico: { uk: 'Пів робочого дня; закриття браузера теж закриває.', nl: 'Een halve werkdag; de browser sluiten sluit ook.' } },
  { id: 'tech-einde', uk: 'До кінця технічної активації', nl: 'Tot het einde van de technische activering', ms: null, soort: 'tech-einde', alleenTechnisch: true, risico: { uk: 'Як у 0.6: закінчується разом із технічним профілем у вкладці (і з закриттям браузера).', nl: 'Zoals 0.6: eindigt samen met het technische profiel in het tabblad (en als de browser sluit).' } },
  { id: 'browser', uk: 'До закриття браузера', nl: 'Tot de browser sluit', ms: null, soort: 'browser', risico: { uk: 'Закінчується, щойно ви закриєте браузер (а також при оновленні розширення). Якщо Chrome працює у фоні після закриття вікон, браузер ще не закрито. Потрібне розширення 0.7.0.', nl: 'Eindigt zodra u de browser sluit (en bij een update van de extensie). Draait Chrome na het sluiten van de vensters op de achtergrond door, dan is de browser nog niet gesloten. Vereist extensie 0.7.0.' } },
  { id: 'uitloggen', uk: 'До виходу з акаунта', nl: 'Tot uitloggen', ms: null, soort: 'uitloggen', risico: { uk: 'Переживає перезапуск браузера; будь-який вихід з акаунта на сайті скидає.', nl: 'Overleeft een herstart van de browser; elk uitloggen op de site maakt een einde.' } },
  { id: 'handmatig', uk: 'Без обмеження', nl: 'Onbeperkt', ms: null, soort: 'handmatig', risico: { uk: 'Доступ не гасне сам: сервер поновлює його, доки ви не натиснете «Заблокувати». Вихід з акаунта все одно скидає. Найзручніше й найризикованіше.', nl: 'De toegang dooft niet vanzelf: de server verlengt hem tot u «Blokkeren» klikt. Uitloggen maakt toch een einde. Het handigst en het riskantst.' } },
  { id: '1d', uk: '1 день', nl: '1 dag', ms: D, soort: 'duur', risico: { uk: 'Забутий доступ живе одну добу і переживає перезапуск браузера.', nl: 'Vergeten toegang leeft een dag en overleeft een herstart van de browser.' } },
  { id: '7d', uk: '1 тиждень', nl: '1 week', ms: 7 * D, soort: 'duur', risico: { uk: 'Забутий доступ живе тиждень.', nl: 'Vergeten toegang leeft een week.' } },
  { id: '30d', uk: '1 місяць', nl: '1 maand', ms: 30 * D, soort: 'duur', risico: { uk: 'Забутий доступ живе місяць.', nl: 'Vergeten toegang leeft een maand.' } },
  { id: '182d', uk: 'Пів року', nl: 'Een half jaar', ms: 182 * D, soort: 'duur', risico: { uk: 'Дуже довго для доступу до особистого.', nl: 'Heel lang voor toegang tot het persoonlijke.' } },
  { id: '365d', uk: '1 рік', nl: '1 jaar', ms: 365 * D, soort: 'duur', risico: { uk: 'Рік — максимум; перевірте, що ви цього справді хочете.', nl: 'Een jaar is het maximum; weet zeker dat u dit wilt.' } },
]);
export const termijnVan = (id: unknown): Termijn | null => ONTGRENDEL_TERMIJNEN.find((t) => t.id === id) ?? null;
export const isTermijnId = (v: unknown): v is TermijnId => termijnVan(v) !== null;
export const termijnenVoorRuimte = (ruimte: AiRuimte): Termijn[] => ONTGRENDEL_TERMIJNEN.filter((t) => ruimte === 'technisch' || !t.alleenTechnisch);
/** Oude vorm (minuten / dagen) → termijn-id; onbekend → null. */
export function termijnUitMinuten(minuten: number): TermijnId | null {
  const t = ONTGRENDEL_TERMIJNEN.find((x) => x.ms !== null && Math.round(x.ms / 60_000) === Math.round(minuten));
  return t ? t.id : null;
}

/**
 * Einde en soort van een nieuwe ontgrendeling. `activatieEind` = einde van de lopende technische activering (null = geen
 * tijdsgrens of privé); `plafondMs` = wat het beleid toelaat. Een termijn langer dan de activering mag (keuze van de eigenaar):
 * dan `overleeftActivatie` = true — de ontgrendeling blijft, maar elk technisch hulpmiddel eist bij gebruik toch een lopende
 * activering (connector v2: TECH_PROFILE_OFF; backend/browser-technisch.ts). Dat is de grens, en ze staat ook in de UI.
 */
export function termijnEinde(t: Termijn, nu: number, o: { ruimte: AiRuimte; activatieEind: number | null; plafondMs: number }): { eind: number; soort: EindeSoort; overleeftActivatie: boolean } {
  const plafond = Math.max(60_000, Math.min(o.plafondMs, TERMIJN_ACHTERVANG_MS));
  if (t.soort === 'tech-einde') {
    const e = o.activatieEind ?? nu + plafond;
    return { eind: Math.min(e, nu + plafond), soort: 'tech-einde', overleeftActivatie: false };
  }
  const gewenst = t.ms === null ? TERMIJN_ACHTERVANG_MS : t.ms;
  const eind = nu + Math.min(gewenst, plafond);
  const overleeft = o.ruimte === 'technisch' && (o.activatieEind === null || eind > o.activatieEind);
  return { eind, soort: t.soort, overleeftActivatie: overleeft };
}

/**
 * Einde van een NIEUWE rij voor «Без обмеження»: nu + min(beleid, 366 dagen). Nooit de oude gid oprekken
 * (CHECK eind_op <= begin_op + 366 dagen, en de extensie 0.7.0 weigert exp voorbij die grens).
 */
export function vernieuwEinde(nu: number, plafondMs: number): number {
  const plafond = Math.max(60_000, Math.min(plafondMs, TERMIJN_ACHTERVANG_MS));
  return nu + plafond;
}
/**
 * Moet de server een lopende «handmatig»-rij vervangen door een nieuwe? Alleen als ze nog loopt, binnen 30 dagen
 * afloopt, en de nieuwe rij minstens een dag later eindigt dan de oude (beleid laat het toe). Uitloggen blijft einde.
 */
export function moetVernieuwen(soort: string, eindMs: number, nu: number, plafondMs: number): boolean {
  if (soort !== 'handmatig') return false;
  if (!(eindMs > nu) || eindMs - nu >= VERNIEUW_VOOR_MS) return false;
  return vernieuwEinde(nu, plafondMs) > eindMs + VERNIEUW_MIN_WINST_MS;
}
/** Tekst van een lopend einde. «handmatig» noemt geen datum: die is alleen de rijgrens, de server verlengt. */
export function eindeWeergave(soort: string | null | undefined, rest: { uk: string; nl: string }, datum: string): { uk: string; nl: string } {
  if (soort === 'handmatig') return { uk: 'без обмеження — доки ви не відкличете', nl: 'onbeperkt — tot u intrekt' };
  if (soort === 'uitloggen') return { uk: `до виходу з акаунта · найпізніше ${datum}`, nl: `tot uitloggen · uiterlijk ${datum}` };
  if (soort === 'browser') return { uk: `до закриття браузера · найпізніше ${datum}`, nl: `tot de browser sluit · uiterlijk ${datum}` };
  return rest;
}

// ---------------------------------------------------------------- matrix
export type MatrixRij = { ruimte: AiRuimte; agent: MatrixAgent; caps: BrowserCap[]; gewijzigdOp: number | null; gewijzigdDoor: string | null };
export type SlotInstellingen = { zonderBevestiging: boolean; devtoolsNamen: boolean };
export type Matrix = { rijen: MatrixRij[]; instellingen: Record<AiRuimte, SlotInstellingen> };
export const STANDAARD_INSTELLINGEN: Readonly<SlotInstellingen> = Object.freeze({ zonderBevestiging: false, devtoolsNamen: false });
export const legeMatrix = (): Matrix => ({ rijen: [], instellingen: { prive: { ...STANDAARD_INSTELLINGEN }, technisch: { ...STANDAARD_INSTELLINGEN } } });

/** Is de matrix voor deze ruimte ooit opgeslagen? Zo niet, dan geldt de erfenis (toestemmingen per browser). */
export const matrixIngesteld = (m: Matrix, ruimte: AiRuimte): boolean => m.rijen.some((r) => r.ruimte === ruimte);
/** Caps voor (ruimte, agent): eigen rij, anders '*', anders null (= erfenis / niet ingesteld). Nooit buiten capsVoorRuimte. */
export function capsVoorAgent(m: Matrix, ruimte: AiRuimte, agent: string | null | undefined): BrowserCap[] | null {
  if (!matrixIngesteld(m, ruimte)) return null;
  const eigen = agent ? m.rijen.find((r) => r.ruimte === ruimte && r.agent === agent) : undefined;
  const rij = eigen ?? m.rijen.find((r) => r.ruimte === ruimte && r.agent === MATRIX_AGENT_ALLE);
  const toegestaan = capsVoorRuimte(ruimte);
  return rij ? BROWSER_CAPS.filter((c) => rij.caps.includes(c) && toegestaan.includes(c)) : [];
}
/** Unie over alle agenten (wat een ontgrendeling van dit slot hoogstens moet dragen). null = niet ingesteld. */
export function capsUnie(m: Matrix, ruimte: AiRuimte): BrowserCap[] | null {
  if (!matrixIngesteld(m, ruimte)) return null;
  const s = new Set<BrowserCap>();
  for (const r of m.rijen) if (r.ruimte === ruimte) for (const c of r.caps) s.add(c);
  const toegestaan = capsVoorRuimte(ruimte);
  return BROWSER_CAPS.filter((c) => s.has(c) && toegestaan.includes(c));
}
/** Wordt er iets ruimer (nieuwe caps die er eerder niet waren)? Dan vraagt opslaan een step-up. */
export function wordtRuimer(oud: Matrix, nieuw: Matrix, ruimte: AiRuimte): boolean {
  const o = capsUnie(oud, ruimte) ?? [];
  const n = capsUnie(nieuw, ruimte) ?? [];
  if (n.some((c) => !o.includes(c))) return true;
  if (!oud.instellingen[ruimte].zonderBevestiging && nieuw.instellingen[ruimte].zonderBevestiging) return true;
  // per agent ruimer dan voorheen (ook als de unie gelijk blijft)
  for (const a of MATRIX_AGENTEN) {
    const vo = capsVoorAgent(oud, ruimte, a === '*' ? null : a) ?? [];
    const vn = capsVoorAgent(nieuw, ruimte, a === '*' ? null : a) ?? [];
    if (vn.some((c) => !vo.includes(c))) return true;
  }
  return false;
}

/** Invoer van het scherm (één ruimte per keer). */
export type MatrixInvoer = { ruimte: AiRuimte; rijen: Array<{ agent: MatrixAgent; caps: BrowserCap[] }>; instellingen?: Partial<SlotInstellingen> };

/**
 * Ketting «що ще має бути дозволено» per agent en kant (zone E): naast de matrix en de ontgrendeling beslissen nog twee lagen of een
 * browserhulpmiddel bestaat: (1) de rechten van de connectorkoppeling van die agent (venster «Дозволити» / tab «Підключені ШІ»),
 * (2) de modus per hulpmiddel — het ondertekende AI-beleid van de eigenaar (admin.* → «Доступ ШІ») als dat geldt, anders de
 * schakelaars van de site (riskante browserhulpmiddelen staan standaard UIT). Het scherm toont ze, zodat niets verborgen blijft.
 */
export type KetenKant = {
  kant: 'gebruiker' | 'beheer';
  /** null = geen koppeling via connector v2 (oud /mcp of nog niet verbonden). */
  rechten: number | null; totaal: number;
  /** Hulpmiddelen die door de modus (beleid of site) UIT staan, en die op een klik wachten. Interne namen. */
  uit: string[]; vragen: string[];
};
export type KetenAgent = { slug: AgentSlug; naam: string; bron: 'ondertekend' | 'site' | 'ongeldig'; kanten: KetenKant[] };

/** Eén agent in de stand: bestaat er een connectorkoppeling, en welke kant leeft nu? */
export type MatrixAgentStand = { slug: AgentSlug; naam: string; verbonden: boolean; kanten: string[]; levend: string[]; laatst: number | null };
/** Laatste weigeringen EXTENSIE_* van de connector (uit app.audit), met uitleg uk/nl en het adres van dit scherm. */
export type MatrixWeigering = { at: number; agent: string; tool: string; code: ExtensieFoutCode; uk: string; nl: string; url: string };
/** GET/POST /api/owner/agents/extensie-matrix → alles wat het scherm «Браузер і агенти» nodig heeft, in één antwoord. */
export type MatrixStand = {
  matrix: Matrix;
  /** Per ruimte: is de matrix ingesteld? Zo niet, dan gelden de toestemmingen per browser (erfenis) — `erfenis` toont die. */
  ingesteld: Record<AiRuimte, boolean>;
  erfenis: Record<AiRuimte, BrowserCap[]>;
  termijnen: Termijn[];
  agenten: MatrixAgentStand[];
  weigeringen: MatrixWeigering[];
  /** Ketting per agent (zie KetenAgent); leeg als hij niet gelezen kon worden. */
  keten: KetenAgent[];
  nu: number;
};

// ---------------------------------------------------------------- weigeringen van de connector → uitleg voor de mens
export type ExtensieFoutCode = 'EXTENSIE_CAP' | 'EXTENSIE_VERGRENDELD' | 'EXTENSIE_PROFIEL' | 'EXTENSIE_RUIMTE' | 'EXTENSIE_SLOT' | 'EXTENSIE_HOST' | 'EXTENSIE_DEBUGGER' | 'EXTENSIE_AGENT' | 'EXTENSIE_TYPE' | 'EXTENSIE_SCRIPT';
const FOUT_UITLEG: Readonly<Record<ExtensieFoutCode, { uk: string; nl: string }>> = Object.freeze({
  EXTENSIE_CAP: { uk: 'Цей ШІ не має такої можливості в цьому слоті. Увімкніть її в матриці «Браузер і агенти» (рядок = можливість, стовпчик = агент).', nl: 'Deze AI heeft die mogelijkheid niet in dit slot. Zet ze aan in de matrix «Browser en agenten» (rij = mogelijkheid, kolom = agent).' },
  EXTENSIE_AGENT: { uk: 'Для цього агента в матриці нічого не дозволено. Позначте можливості у стовпчику агента (або «усі»).', nl: 'Voor deze agent staat in de matrix niets aan. Vink mogelijkheden aan in de kolom van de agent (of «alle»).' },
  EXTENSIE_VERGRENDELD: { uk: 'Слот розширення заблоковано або строк минув. Відкрийте доступ на потрібний строк у «Браузер і агенти».', nl: 'Het slot van de extensie is vergrendeld of de termijn is voorbij. Open de toegang voor de gewenste termijn in «Browser en agenten».' },
  EXTENSIE_PROFIEL: { uk: 'Активна вкладка не в технічному режимі. Активуйте технічний профіль у тій вкладці або працюйте в приватному слоті.', nl: 'Het actieve tabblad staat niet in de technische modus. Activeer het technische profiel in dat tabblad of werk in het privéslot.' },
  EXTENSIE_RUIMTE: { uk: 'Інструмент належить іншому слоту (приватний ↔ технічний). Перевірте, чи активний технічний профіль і чи ввімкнена служба «Підключення ШІ».', nl: 'Het hulpmiddel hoort bij het andere slot (privé ↔ technisch). Controleer of het technische profiel actief is en de dienst «AI-verbindingen» aanstaat.' },
  EXTENSIE_SLOT: { uk: 'У цьому слоті не підключено жодного розширення. Підключіть його на цьому ж екрані.', nl: 'In dit slot is geen extensie gekoppeld. Koppel ze op ditzelfde scherm.' },
  EXTENSIE_HOST: { uk: 'Адреса поза дозволеними сторінками цього слота. Додайте сторінку при відкритті доступу.', nl: 'Het adres valt buiten de toegestane pagina’s van dit slot. Voeg de pagina toe bij het openen van de toegang.' },
  EXTENSIE_DEBUGGER: { uk: 'Глибока діагностика потребує пакета «діагностика» й увімкненого перемикача в налаштуваннях розширення.', nl: 'Diepe diagnose vereist het pakket «diagnose» en de schakelaar in de opties van de extensie.' },
  EXTENSIE_TYPE: { uk: 'Невідома команда браузера. Агент має взяти назви з tools/list.', nl: 'Onbekende browseropdracht. De agent moet de namen uit tools/list nemen.' },
  EXTENSIE_SCRIPT: { uk: 'Виконання скриптів вимкнене. Увімкніть «Скрипти» для технічного слота в матриці (лише з пакетом «діагностика»).', nl: 'Scripts uitvoeren staat uit. Zet «Scripts» aan voor het technische slot in de matrix (alleen met het pakket «diagnose»).' },
});
/** Herken een EXTENSIE_*-weigering in een (Engelse) fouttekst en geef de uitleg uk/nl + het adres van het scherm. */
export function extensieFoutUitleg(tekst: unknown): { code: ExtensieFoutCode; uk: string; nl: string; url: string } | null {
  const m = /\b(EXTENSIE_(?:CAP|VERGRENDELD|PROFIEL|RUIMTE|SLOT|HOST|DEBUGGER|AGENT|TYPE|SCRIPT))\b/.exec(String(tekst ?? ''));
  if (!m) return null;
  const code = m[1] as ExtensieFoutCode;
  return { code, ...FOUT_UITLEG[code], url: BROWSER_BEHEER_URL };
}

// ---------------------------------------------------------------- hulp («?») — shared/hulp-register.ts registreert dit blok
const BRON = 'src/extensie/BrowserEnAgenten.tsx';
const T = (uk: string, nl: string): [string, string] => [uk, nl];
type HulpItem = { wat: [string, string]; gevolg: [string, string]; risico: [string, string]; dev: [string, string]; bron: string };
const capHulp = (c: BrowserCap): HulpItem => ({
  wat: T(`Можливість «${CAP_INFO[c].uk[0]}»: ${CAP_INFO[c].uk[1]}`, `Mogelijkheid «${CAP_INFO[c].nl[0]}»: ${CAP_INFO[c].nl[1]}`),
  gevolg: T('Позначка в клітинці дозволяє це цьому агентові в цьому слоті; стовпчик «усі» — типово для агентів без власного стовпчика. Чинне розблокування переподписується одразу.', 'Een vinkje staat dit toe voor die agent in dat slot; de kolom «alle» geldt voor agenten zonder eigen kolom. Een lopende ontgrendeling wordt meteen opnieuw ondertekend.'),
  risico: T(CAP_INFO[c].uk[2], CAP_INFO[c].nl[2]),
  dev: T(`app.extensie_matrix (0110): caps text[] за (user_id, ruimte, agent); перевірка в backend/extensie-matrix.ts → controleerBrowserOpdracht і ai-grants.checkCommand; cap «${c}» у TYPE_CAPABILITY.`, `app.extensie_matrix (0110): caps text[] per (user_id, ruimte, agent); controle in backend/extensie-matrix.ts → controleerBrowserOpdracht en ai-grants.checkCommand; cap «${c}» in TYPE_CAPABILITY.`),
  bron: BRON,
});
export const HELP_MATRIX: Readonly<Record<string, HulpItem>> = Object.freeze({
  ...Object.fromEntries(BROWSER_CAPS.map((c) => [`browser.matrix.${c.replace('browser.', '')}`, capHulp(c)])),
  'browser.matrix.agent': {
    wat: T('Увесь стовпчик одного агента: що цей ШІ (Claude, ChatGPT, …) може через розширення в цьому слоті.', 'De hele kolom van één agent: wat die AI (Claude, ChatGPT, …) via de extensie in dit slot mag.'),
    gevolg: T('Агент без власного стовпчика отримує стовпчик «усі». Порожній стовпчик = агент не може нічого (EXTENSIE_AGENT).', 'Een agent zonder eigen kolom krijgt de kolom «alle». Een lege kolom = de agent mag niets (EXTENSIE_AGENT).'),
    risico: T('Усі агенти проходять через той самий конектор; відмінність — лише в цій матриці. Не давайте більше, ніж потрібно для задачі.', 'Alle agenten gaan door dezelfde connector; het verschil zit alleen in deze matrix. Geef niet meer dan de taak vraagt.'),
    dev: T('Рядок app.extensie_matrix з agent = slug (shared/connector-v2/agenten.ts) або «*»; агент визначається з токена конектора (mcp-namens.agent), ніколи з повідомлення клієнта.', 'Rij app.extensie_matrix met agent = slug (shared/connector-v2/agenten.ts) of «*»; de agent komt uit het connectortoken (mcp-namens.agent), nooit uit het bericht van de client.'),
    bron: BRON,
  },
  'browser.matrix.kolom': {
    wat: T('На вузькому екрані (телефон) матриця показує один стовпчик за раз: оберіть агента або «Усі агенти».', 'Op een smal scherm (telefoon) toont de matrix één kolom tegelijk: kies een agent of «Alle agenten».'),
    gevolg: T('Нічого не змінює — лише показ. Позначки інших стовпчиків залишаються, «Зберегти» зберігає всі стовпчики разом. На комп’ютері видно всі стовпчики одразу.', 'Verandert niets — alleen weergave. De vinkjes van de andere kolommen blijven staan; «Opslaan» bewaart alle kolommen samen. Op een computer ziet u alle kolommen tegelijk.'),
    risico: T('Немає: це вибір показу.', 'Geen: dit is een weergavekeuze.'),
    dev: T('Стан kolom у src/extensie/BrowserEnAgenten.tsx; CSS ховає [data-bea-agent]/[data-bea-cel] без .is-gekozen при ширині ≤ 560 px.', 'State kolom in src/extensie/BrowserEnAgenten.tsx; CSS verbergt [data-bea-agent]/[data-bea-cel] zonder .is-gekozen bij ≤ 560 px.'),
    bron: BRON,
  },
  'browser.matrix.termijn': {
    wat: T('Строк, на який відкривається слот: від 15 хвилин до року, до закриття браузера, до виходу з акаунта або без обмеження.', 'De termijn waarvoor het slot opengaat: van 15 minuten tot een jaar, tot de browser sluit, tot uitloggen of onbeperkt.'),
    gevolg: T('Перезапуск браузера не скидає строки «до виходу з акаунта», «без обмеження» і від тижня до року: сервер зберігає розблокування й надсилає його знову. «Без обмеження» — це нові рядки по 366 днів, доки ви не натиснете «Заблокувати»; вихід з акаунта скидає завжди. Короткі строки (15 хв, 1 год, 4 год, до кінця технічної активації) і «до закриття браузера» закінчуються, коли браузер закрито (розширення 0.7.0). Технічний слот: довший за активацію строк переживає її, але кожне технічне звернення все одно вимагає активного технічного профілю у вкладці.', 'Een herstart van de browser maakt geen einde aan «tot uitloggen», «onbeperkt» en een week tot een jaar: de server bewaart de ontgrendeling en stuurt ze opnieuw. «Onbeperkt» zijn nieuwe rijen van 366 dagen, tot u «Blokkeren» klikt; uitloggen maakt altijd een einde. Korte termijnen (15 min, 1 uur, 4 uur, tot het einde van de activering) en «tot de browser sluit» eindigen als de browser sluit (extensie 0.7.0). Technisch slot: een termijn langer dan de activering overleeft haar, maar elk technisch hulpmiddel eist bij gebruik toch een actief technisch profiel in het tabblad.'),
    risico: T('Чим довше, тим довше живе забутий доступ. «Без обмеження» — найзручніше й найризикованіше; для особистого слота радимо не більше місяця.', 'Hoe langer, hoe langer vergeten toegang leeft. «Onbeperkt» is het handigst en het riskantst; voor het privéslot liever niet langer dan een maand.'),
    dev: T('ONTGRENDEL_TERMIJNEN у shared/extensie-matrix.ts; app.extensie_ontgrendelingen.einde_soort + overleeft_activatie (0110); ACTIEF у backend/extensie-ontgrendeling.ts; browser_sessie (0111) + aanBrowserGebonden: при з’єднанні з іншою браузерною сесією сервер відкликає (reden browser-gesloten); naUitloggen відкликає все; розширення < 0.7.0 приймає ≤ 8 год / 30 днів, довший строк або «до закриття браузера» → TERMIJN_VEREIST_UPDATE.', 'ONTGRENDEL_TERMIJNEN in shared/extensie-matrix.ts; app.extensie_ontgrendelingen.einde_soort + overleeft_activatie (0110); ACTIEF in backend/extensie-ontgrendeling.ts; browser_sessie (0111) + aanBrowserGebonden: verbindt de extensie met een andere browsersessie, dan trekt de server in (reden browser-gesloten); naUitloggen trekt alles in; een extensie < 0.7.0 aanvaardt ≤ 8 u / 30 d, langer of «tot de browser sluit» → TERMIJN_VEREIST_UPDATE.'),
    bron: BRON,
  },
  'browser.matrix.zonder-bevestiging': {
    wat: T('Дії, що змінюють дані (клік/введення, скріншот, діагностика, скрипти), виконуються без кліку підтвердження на сайті.', 'Acties die gegevens wijzigen (klikken/typen, schermafdruk, diagnose, scripts) lopen zonder bevestigingsklik op de site.'),
    gevolg: T('Увімкнено — агент діє сам у межах матриці; вимкнено — кожна така дія чекає на ваше «Дозволити» до 5 хвилин. Увімкнення вимагає підтвердження входу (step-up).', 'Aan — de agent handelt zelf binnen de matrix; uit — elke zo’n actie wacht tot 5 minuten op uw «Toestaan». Aanzetten vraagt een bevestiging van de aanmelding (step-up).'),
    risico: T('Без підтвердження помилка моделі одразу стає дією на вашому сайті (надісланий лист, видалений файл).', 'Zonder bevestiging wordt een fout van het model meteen een actie op uw site (verstuurde mail, gewist bestand).'),
    dev: T('app.extensie_matrix.zonder_bevestiging на рядку «*» (0110); ai-grants.checkCommand → needsFreshApproval = DESTRUCTIVE && !zonderBevestiging; step-up у POST /api/owner/agents/extensie-matrix.', 'app.extensie_matrix.zonder_bevestiging op de rij «*» (0110); ai-grants.checkCommand → needsFreshApproval = DESTRUCTIVE && !zonderBevestiging; step-up in POST /api/owner/agents/extensie-matrix.'),
    bron: BRON,
  },
  'browser.matrix.devtools-namen': {
    wat: T('Конектор показує в tools/list також назви з chrome-devtools-mcp (navigate_page, take_snapshot, click, fill, evaluate_script…).', 'De connector toont in tools/list ook de namen van chrome-devtools-mcp (navigate_page, take_snapshot, click, fill, evaluate_script…).'),
    gevolg: T('Агент, навчений на chrome-devtools-mcp, бачить знайомі назви; вони ведуть до тих самих наших інструментів із тими самими межами. Виклик за цими назвами працює й без перемикача — перемикач лише показує їх у списку.', 'Een agent die chrome-devtools-mcp kent, ziet vertrouwde namen; ze leiden naar dezelfde hulpmiddelen met dezelfde grenzen. Aanroepen onder die namen werkt ook zonder de schakelaar — die toont ze alleen in de lijst.'),
    risico: T('Список інструментів подвоюється; деякі агенти плутаються, коли бачать два імені для одного. Низький ризик для безпеки: межі ті самі.', 'De lijst verdubbelt; sommige agenten raken in de war door twee namen voor hetzelfde. Laag veiligheidsrisico: de grenzen zijn dezelfde.'),
    dev: T('app.extensie_matrix.devtools_namen на рядку «*»; псевдоніми в backend/connector-v2-browser.ts (DEVTOOLS_V2); evaluate_script → browser.script лише з cap у матриці.', 'app.extensie_matrix.devtools_namen op de rij «*»; aliassen in backend/connector-v2-browser.ts (DEVTOOLS_V2); evaluate_script → browser.script alleen met de cap in de matrix.'),
    bron: BRON,
  },
  'browser.matrix.domeinen': {
    wat: T('Сторінки (хости) власного сайту, на яких діє розблокування цього слота.', 'Pagina’s (hosts) van de eigen site waarop de ontgrendeling van dit slot geldt.'),
    gevolg: T('Адреса поза списком → EXTENSIE_HOST. Приватний слот ніколи не містить admin.* і api.*.', 'Een adres buiten de lijst → EXTENSIE_HOST. Het privéslot bevat nooit admin.* en api.*.'),
    risico: T('Менше хостів — менша площа помилки. Для розробки зазвичай потрібні admin і mcp.', 'Minder hosts — kleiner foutoppervlak. Voor ontwikkeling zijn meestal admin en mcp nodig.'),
    dev: T('PRIVE_HOSTS / ADMIN_HOSTS_TOEGESTAAN у shared/extensie-ontgrendeling.ts; точний збіг host на сервері (controleerBrowserOpdracht) і в розширенні (hostToegestaan).', 'PRIVE_HOSTS / ADMIN_HOSTS_TOEGESTAAN in shared/extensie-ontgrendeling.ts; exacte host op de server (controleerBrowserOpdracht) en in de extensie (hostToegestaan).'),
    bron: BRON,
  },
});
