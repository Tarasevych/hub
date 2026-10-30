// Teksten (UA + NL) en pure hulpfuncties voor de twee ruimtes. Geen React, geen DOM: eenheidstests in tests/eenheid/tech-ruimtes-ui.test.ts.
// Woordkeuze (audit 27.10.2026): nooit «до виходу» zonder ЗВІДКИ; nooit «профіль» voor de technische ruimte; «Подовжити» alleen als er
// echt bijgeteld wordt; de vervanging heet «Змінити термін».
import type { RuimtesStatus, Termijn, TermijnModus, Tweetalig } from '../ruimtes-contract';

export type Taal = 'uk' | 'nl';
const t2 = (uk: string, nl: string): Tweetalig => ({ uk, nl });

export const RUIMTE_NAAM = { prive: t2('Звичайний простір', 'Gewone ruimte'), technisch: t2('Технічний простір', 'Technische ruimte') } as const;

export const uurMinuut = (ms: number, taal: Taal) => new Date(ms).toLocaleTimeString(taal === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Exacte namen van de drie termijnen. «tijd» met eindtijd → «На час (до HH:MM)». */
export function termijnNaam(modus: TermijnModus, taal: Taal, eindTijd?: number | null): string {
  if (modus === 'tijd') return eindTijd ? (taal === 'uk' ? `На час (до ${uurMinuut(eindTijd, taal)})` : `Voor een tijd (tot ${uurMinuut(eindTijd, taal)})`) : (taal === 'uk' ? 'На час' : 'Voor een tijd');
  if (modus === 'tot-technisch-einde') return taal === 'uk' ? 'До завершення технічного сеансу' : 'Tot het einde van de technische sessie';
  return taal === 'uk' ? 'До виходу з акаунта на сайті' : 'Tot afmelden van het account op de site';
}
/** Eén regel uitleg per termijn (onder de keuze). */
export function termijnUitleg(modus: TermijnModus, taal: Taal, eindTijd?: number | null): string {
  if (modus === 'tijd') return taal === 'uk'
    ? `Технічний сеанс завершиться сам${eindTijd ? ` о ${uurMinuut(eindTijd, taal)}` : ''}. Ваш вхід на сайт лишається.`
    : `De technische sessie stopt vanzelf${eindTijd ? ` om ${uurMinuut(eindTijd, taal)}` : ''}. U blijft aangemeld op de site.`;
  if (modus === 'tot-technisch-einde') return taal === 'uk'
    ? 'Діє, доки ви не натиснете «Завершити технічний сеанс». Вихід з акаунта на сайті теж його завершує.'
    : 'Geldt tot u op «Technische sessie beëindigen» klikt. Afmelden op de site beëindigt hem ook.';
  return taal === 'uk'
    ? 'Перехід у звичайний простір лише ставить його на паузу. Завершується, коли ви вийдете з акаунта на сайті.'
    : 'Overschakelen naar de gewone ruimte pauzeert hem alleen. Hij stopt wanneer u zich afmeldt op de site.';
}
export const duurKort = (min: number, taal: Taal) => (min >= 60 ? `${+(min / 60).toFixed(1)} ${taal === 'uk' ? 'год' : 'u'}` : `${min} ${taal === 'uk' ? 'хв' : 'min'}`);
/** Resterende tijd «ще 1 год 5 хв» / «nog 1 u 5 min»; null als er geen eindtijd is. */
export function restTekst(eind: number | null | undefined, nu: number, taal: Taal): string | null {
  if (!eind) return null;
  const m = Math.max(0, Math.ceil((eind - nu) / 60000));
  const u = Math.floor(m / 60), r = m % 60;
  const deel = u ? `${u} ${taal === 'uk' ? 'год' : 'u'}${r ? ` ${r} ${taal === 'uk' ? 'хв' : 'min'}` : ''}` : `${r} ${taal === 'uk' ? 'хв' : 'min'}`;
  return taal === 'uk' ? `ще ${deel}` : `nog ${deel}`;
}
/** Wat de wisselknop onder «Технічний» toont. */
export function standTekst(s: Pick<RuimtesStatus, 'actief' | 'pauze' | 'sessie' | 'technischToegestaan'>, nu: number, taal: Taal): string {
  if (!s.technischToegestaan) return taal === 'uk' ? 'немає доступу' : 'geen toegang';
  if (!s.sessie) return taal === 'uk' ? 'не розпочато' : 'niet gestart';
  const termijn = s.sessie.modus === 'tijd' ? restTekst(s.sessie.eindTijd, nu, taal) ?? '' : s.sessie.modus === 'tot-technisch-einde' ? (taal === 'uk' ? 'до завершення сеансу' : 'tot einde sessie') : (taal === 'uk' ? 'до виходу з сайту' : 'tot afmelden');
  return s.pauze || s.actief === 'prive' ? `${taal === 'uk' ? 'пауза' : 'pauze'} · ${termijn}` : termijn;
}
/** Lijst voor de startdialoog: de server levert ze; ontbreekt er een, dan toch tonen (uitgegrijsd) — nooit verbergen. */
export function termijnenVolledig(lijst: Termijn[], taal: Taal): Termijn[] {
  const uit: Termijn[] = [...lijst];
  for (const m of ['tijd', 'tot-technisch-einde', 'tot-site-uitloggen'] as TermijnModus[]) {
    if (!uit.some((x) => x.modus === m)) uit.push({ modus: m, label: { uk: termijnNaam(m, 'uk'), nl: termijnNaam(m, 'nl') }, beschikbaar: false, reden: { uk: 'Сервер не запропонував цей варіант.', nl: 'De server bood deze keuze niet aan.' } });
  }
  void taal;
  return uit;
}
export const eersteBeschikbare = (lijst: Termijn[]) => lijst.find((x) => x.beschikbaar) ?? null;

export type UitlogKeuze = { id: 'technisch' | 'site' | 'overal'; naam: Tweetalig; gevolg: Tweetalig; gevaar?: boolean };
/** Drie duidelijke uitlogkeuzes met hun gevolg (incl. ontgrendelingen van de browserextensie, besluit Pavlo t330u). */
export const UITLOG_KEUZES: UitlogKeuze[] = [
  { id: 'technisch', naam: t2('Вийти з технічного сеансу', 'Technische sessie verlaten'),
    gevolg: t2('Ви лишаєтеся на сайті у звичайному просторі. Довгі дозволи розширення не змінюються.', 'U blijft aangemeld in de gewone ruimte. Lange ontgrendelingen van de extensie blijven.') },
  { id: 'site', naam: t2('Вийти з акаунта на сайті', 'Afmelden van het account op de site'),
    gevolg: t2('Завершує і технічний сеанс. Довгі дозволи розширення в цьому браузері знімаються.', 'Beëindigt ook de technische sessie. Lange ontgrendelingen van de extensie in deze browser vervallen.') },
  { id: 'overal', naam: t2('Вийти всюди', 'Overal afmelden'), gevaar: true,
    gevolg: t2('Вихід на всіх пристроях і в усіх браузерах; знімає всі технічні сеанси й усі дозволи розширення.', 'Afmelden op alle apparaten en browsers; alle technische sessies en extensie-ontgrendelingen vervallen.') },
];
/** Закриття однієї вкладки нічого не знімає — це теж кажемо прямо. */
export const VKLADKA_REGEL = t2('Закриття однієї вкладки не знімає довгі дозволи розширення.', 'Eén tabblad sluiten haalt lange ontgrendelingen van de extensie niet weg.');

/** Hernoemingen uit de audit (oud → nieuw), gebruikt in TechLaag, Sessies en het bevestigvenster zodra de vlag aan staat. */
export const WOORDEN = {
  bandTotUitloggen: t2('до виходу з акаунта на сайті', 'tot afmelden op de site'),
  bandTotVerlaten: t2('до завершення технічного сеансу', 'tot einde technische sessie'),
  sessieTijd: t2('на час', 'voor een tijd'),
  onthoud: t2('Не питати знову, доки я не вийду з акаунта на сайті (не довше {u} год)', 'Niet opnieuw vragen tot ik me afmeld op de site (hoogstens {u} u)'),
  wijzigTermijn: t2('Змінити термін', 'Termijn wijzigen'),
  wijzigUitleg: t2('Новий термін рахується від зараз.', 'De nieuwe termijn telt vanaf nu.'),
  bijtellen: t2('Додати час', 'Tijd bijtellen'),
  totIntrekken: t2('До відкликання вручну', 'Tot handmatig intrekken'),
  beeindigen: t2('Завершити технічний сеанс', 'Technische sessie beëindigen'),
  toegangPagina: t2('Доступ і терміни', 'Toegang en termijnen'),
} as const;

export const TABBLADEN = [
  { id: 'eigen', naam: t2('Мій технічний доступ', 'Mijn technische toegang') },
  { id: 'invoer', naam: t2('Вхід і підтвердження', 'Aanmelden en bevestigen') },
  { id: 'ai', naam: t2('Доступ ШІ', 'AI-toegang') },
  { id: 'mensen', naam: t2('Люди з технічним доступом', 'Mensen met technische toegang') },
  { id: 'codes', naam: t2('Коди доступу і гості', 'Toegangscodes en gasten') },
  { id: 'vlaggen', naam: t2('Перемикачі функцій', 'Functieschakelaars') },
] as const;
export type TabId = (typeof TABBLADEN)[number]['id'];
const SOORT_TAB: Record<string, TabId> = { sessie: 'eigen', persoon: 'mensen', ai: 'ai', extensie: 'invoer', code: 'codes', gast: 'codes', vlagtest: 'vlaggen' };
export const tabVanRegel = (r: { soort: string; tabblad?: string }): TabId => (r.tabblad as TabId) || SOORT_TAB[r.soort] || 'eigen';

/** Eén termijnenset voor AI = dezelfde drie termijnen als de technische ruimte (contract ai-zetten). «prive» = alleen gewone ruimte. */
export const AI_TERMIJNEN = [
  { id: 'prive', termijn: 'tot-site-uitloggen', ruimtes: ['prive'], label: t2('Лише звичайний простір', 'Alleen gewone ruimte') },
  { id: 'tijd-60', termijn: 'tijd', minuten: 60, ruimtes: ['prive', 'technisch'], label: t2('+ технічний: на 1 год', '+ technisch: 1 uur') },
  { id: 'tijd-240', termijn: 'tijd', minuten: 240, ruimtes: ['prive', 'technisch'], label: t2('+ технічний: на 4 год', '+ technisch: 4 uur') },
  { id: 'tot-technisch-einde', termijn: 'tot-technisch-einde', ruimtes: ['prive', 'technisch'], label: t2('+ технічний: до завершення технічного сеансу', '+ technisch: tot einde technische sessie') },
  { id: 'tot-site-uitloggen', termijn: 'tot-site-uitloggen', ruimtes: ['prive', 'technisch'], label: t2('+ технічний: до виходу з акаунта на сайті', '+ technisch: tot afmelden op de site') },
] as const;

/** Volgende ruimte bij de toets ←/→ in de tweedelige knop. */
export const andere = (r: 'prive' | 'technisch') => (r === 'prive' ? 'technisch' : 'prive');

/** Tekst voor een mislukte wissel: de uitleg van de server (403 {uitleg:{uk,nl}}, codes SITE_SESSIE_WEG, BINDING_ONGELDIG, GEEN_TECH_SESSIE,
 *  PAUZE…) gaat voor; anders een algemene zin met de code. Altijd: «ви лишилися там, де були». */
export function wisselFoutTekst(e: unknown, taal: Taal): string {
  const d = (e as { response?: { data?: { uitleg?: Partial<Tweetalig> } } })?.response?.data;
  const uitleg = d?.uitleg?.[taal];
  const rest = taal === 'uk' ? 'Ви лишилися там, де були.' : 'U bleef waar u was.';
  if (uitleg) return `${uitleg} ${rest}`;
  return `${taal === 'uk' ? 'Не вдалося перемкнути' : 'Wisselen mislukt'} (${String((e as Error)?.message || 'FOUT')}). ${rest}`;
}
