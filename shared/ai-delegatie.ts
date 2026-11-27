// AI-TERMIJN-001 (15.11.2026): termijnen en regels voor de AI-sessiedelegatie (welke AI-verbinding mag de technische ruimte van de
// eigenaar gebruiken, hoe lang, en wanneer vervalt dat). Puur: geen database, geen DOM — backend/ai-delegatie-kern.ts verzamelt de
// feiten, de site (src/tech/ruimtes/AiToegangKaart.tsx) gebruikt dezelfde keuzes en teksten. Eenheidstests: tests/eenheid/ai-delegatie-20261115.test.ts.
//
// Терміни й правила делегування технічного простору підключенню ШІ. Чиста логіка без бази даних: серверна частина збирає факти, сайт показує
// ті самі варіанти. Раніше дозвіл висів на ОДНОМУ технічному сеансі (одному піддомені), тож пауза на mcp.* вимикала Claude, хоча на
// admin.* власник лишався технічним. Тепер прив'язка — «увесь вхід власника», а правило паузи окреме й явне.
//
// Veiligheid: de standaardwaarden zijn de veiligste (pauze, 60 min inactief, vervalt bij afmelden). Gevaarlijke keuzes (onbepaald,
// doorwerken in de gewone ruimte, nooit inactief, blijven na afmelden) zijn NIET verboden, maar dragen `gevaar: true` en een
// uitleg van het risico — de eigenaar kiest bewust, met passkey (stap-op) in de route.

export type Tweetalig = { uk: string; nl: string };
const t2 = (uk: string, nl: string): Tweetalig => ({ uk, nl });

/** Hoe lang de delegatie hoogstens geldt. */
export type AiTermijn = 'tijd' | 'tot-technisch-einde' | 'tot-site-uitloggen' | 'tot-account-uitloggen' | 'onbepaald';
export const AI_TERMIJNEN_ALLE: readonly AiTermijn[] = Object.freeze(['tijd', 'tot-technisch-einde', 'tot-site-uitloggen', 'tot-account-uitloggen', 'onbepaald']);
export const isAiTermijn = (v: unknown): v is AiTermijn => typeof v === 'string' && (AI_TERMIJNEN_ALLE as readonly string[]).includes(v);

/** Wat er gebeurt als de eigenaar de technische sessie bewust op «Пауза» zet (RUIMTE-WEERGAVE-001: wisselen van ruimte pauzeert niet meer). */
export type BijPauze = 'pauzeren' | 'intrekken' | 'doorwerken';
export const isBijPauze = (v: unknown): v is BijPauze => v === 'pauzeren' || v === 'intrekken' || v === 'doorwerken';
/** Wat er gebeurt als de eigenaar zich overal afmeldt (geen levende aanmelding meer). Alleen zinvol bij 'tijd' en 'onbepaald'.
 *  'blijven' = de toestemming wacht op de volgende aanmelding (geen nieuwe toestemming nodig). Technische toegang zonder levende
 *  aanmelding van de eigenaar bestaat NOOIT: elke technische handeling van een AI hangt aan een levende technische sessie. */
export type BijAfmelden = 'intrekken' | 'blijven';
export const isBijAfmelden = (v: unknown): v is BijAfmelden => v === 'intrekken' || v === 'blijven';

export const AI_MIN_MINUTEN = 15;
/** Langste termijn op tijd of datum: 5 jaar (een datum verder weg is vrijwel zeker een tikfout). */
export const AI_MAX_MINUTEN = 5 * 366 * 24 * 60;
export const INACTIEF_KEUZES = [15, 30, 60, 120, 240, 480, 1440] as const;
export const INACTIEF_STANDAARD = 60;

export type AiRegels = { bijPauze: BijPauze; inactiefMinuten: number | null; bijAfmelden: BijAfmelden };
export const STANDAARD_REGELS: Readonly<AiRegels> = Object.freeze({ bijPauze: 'pauzeren', inactiefMinuten: INACTIEF_STANDAARD, bijAfmelden: 'intrekken' });

/** Snelknoppen (minuten). «Місяць» = 30 d, «пів року» = 182 d, «рік» = 365 d. */
export const SNELKNOPPEN: ReadonlyArray<{ id: string; minuten: number; label: Tweetalig; gevaar?: boolean }> = Object.freeze([
  { id: '1u', minuten: 60, label: t2('1 год', '1 u') },
  { id: '2u', minuten: 120, label: t2('2 год', '2 u') },
  { id: '8u', minuten: 480, label: t2('8 год', '8 u') },
  { id: '1d', minuten: 1440, label: t2('Доба', '1 dag') },
  { id: '1w', minuten: 7 * 1440, label: t2('Тиждень', 'Week') },
  { id: '1m', minuten: 30 * 1440, label: t2('Місяць', 'Maand'), gevaar: true },
  { id: '6m', minuten: 182 * 1440, label: t2('Пів року', 'Half jaar'), gevaar: true },
  { id: '1j', minuten: 365 * 1440, label: t2('Рік', 'Jaar'), gevaar: true },
]);
/** Vanaf deze lengte telt een termijn op tijd als «lang» (waarschuwing «!»). */
export const LANG_MINUTEN = 7 * 1440;

export type AiInvoer = {
  termijn: AiTermijn;
  /** bij 'tijd': minuten vanaf nu (snelknop) óf een absolute eindtijd (ms) */
  minuten?: number | null;
  eindOp?: number | null;
  regels?: Partial<AiRegels>;
};
export type AiInstelling = { termijn: AiTermijn; eindOp: number | null; regels: AiRegels };

export class AiInvoerFout extends Error { constructor(public code: string) { super(code); } }

/** Invoer → genormaliseerde instelling. Gooit AiInvoerFout met een code (TERMIJN_ONGELDIG, DUUR_ONGELDIG, REGEL_ONGELDIG). */
export function normaliseerInvoer(inv: AiInvoer, nu: number): AiInstelling {
  if (!isAiTermijn(inv.termijn)) throw new AiInvoerFout('TERMIJN_ONGELDIG');
  let eindOp: number | null = null;
  if (inv.termijn === 'tijd') {
    if (inv.eindOp !== undefined && inv.eindOp !== null) {
      const e = Number(inv.eindOp);
      if (!Number.isFinite(e)) throw new AiInvoerFout('DUUR_ONGELDIG');
      eindOp = Math.round(e);
    } else {
      const m = Math.round(Number(inv.minuten));
      if (!Number.isFinite(m)) throw new AiInvoerFout('DUUR_ONGELDIG');
      eindOp = nu + m * 60_000;
    }
    const min = (eindOp - nu) / 60_000;
    if (min < AI_MIN_MINUTEN - 0.5 || min > AI_MAX_MINUTEN) throw new AiInvoerFout('DUUR_ONGELDIG');
  }
  const r = inv.regels ?? {};
  const bijPauze = r.bijPauze ?? STANDAARD_REGELS.bijPauze;
  const bijAfmelden = r.bijAfmelden ?? STANDAARD_REGELS.bijAfmelden;
  if (!isBijPauze(bijPauze) || !isBijAfmelden(bijAfmelden)) throw new AiInvoerFout('REGEL_ONGELDIG');
  let inactiefMinuten: number | null = r.inactiefMinuten === undefined ? STANDAARD_REGELS.inactiefMinuten : r.inactiefMinuten;
  if (inactiefMinuten !== null) {
    inactiefMinuten = Math.round(Number(inactiefMinuten));
    if (!Number.isFinite(inactiefMinuten) || inactiefMinuten < 5 || inactiefMinuten > 10080) throw new AiInvoerFout('REGEL_ONGELDIG');
  }
  return { termijn: inv.termijn, eindOp, regels: { bijPauze, inactiefMinuten, bijAfmelden: inv.termijn === 'tijd' || inv.termijn === 'onbepaald' ? bijAfmelden : 'intrekken' } };
}

/** Welke keuzes van deze instelling bewust gevaarlijk zijn (voor «!», meldingen en het journaal). */
export function gevaren(i: AiInstelling, nu: number): Array<'onbepaald' | 'lang' | 'doorwerken' | 'nooit-inactief' | 'na-afmelden'> {
  const uit: Array<'onbepaald' | 'lang' | 'doorwerken' | 'nooit-inactief' | 'na-afmelden'> = [];
  if (i.termijn === 'onbepaald') uit.push('onbepaald');
  if (i.termijn === 'tijd' && i.eindOp !== null && i.eindOp - nu >= LANG_MINUTEN * 60_000) uit.push('lang');
  if (i.regels.bijPauze === 'doorwerken') uit.push('doorwerken');
  if (i.regels.inactiefMinuten === null) uit.push('nooit-inactief');
  if (i.regels.bijAfmelden === 'blijven' && (i.termijn === 'tijd' || i.termijn === 'onbepaald')) uit.push('na-afmelden');
  return uit;
}

// ------------------------------------------------------------------------------------------------ de beslissing
/** Eén technische sessie van de eigenaar zoals de kern haar ziet (alleen levende: niet beëindigd, binnen grens, aanmelding leeft). */
export type SessieFeit = { id: string; siteSessieId: string; actief: 'prive' | 'technisch' };
export type DelegatieFeit = {
  verbindingId: string;
  technisch: boolean;
  termijn: AiTermijn;
  eindOp: number | null;
  /** de technische sessie waarin de eigenaar de toestemming gaf (anker voor 'tot-technisch-einde') */
  ruimteSessieId: string | null;
  /** de aanmelding (site-sessie) waarin de toestemming gegeven werd (anker voor 'tot-site-uitloggen') */
  siteSessieId: string | null;
  regels: AiRegels;
  gezetOp: number;
  laatstGebruiktOp: number | null;
  ingetrokkenOp: number | null;
};
export type IntrekReden = 'verlopen' | 'inactief' | 'technisch-einde' | 'site-afgemeld' | 'account-afgemeld' | 'profiel-gewisseld';
export type DelegatieUitkomst =
  | { soort: 'toegestaan'; sessieId: string; negeerPauze: boolean }
  /** tijdelijk niet (pauze of nog geen technische sessie), de delegatie blijft staan */
  | { soort: 'wacht'; code: 'AI_PAUZE' | 'AI_WACHT_OP_SESSIE' | 'AI_WACHT_OP_AANMELDING' }
  | { soort: 'intrekken'; reden: IntrekReden }
  | { soort: 'geen'; code: 'AI_NIET_TOEGESTAAN' };

/**
 * Mag deze delegatie NU de technische ruimte openen? `sessies` = alle levende technische sessies van de eigenaar,
 * `aanmeldingen` = id's van alle levende aanmeldingen (site-sessies) van de eigenaar, ook zonder technische sessie.
 * Volgorde: ingetrokken → termijn → inactief → anker → pauze. Elke twijfel = niet toegestaan (veilige richting).
 */
export function beoordeel(d: DelegatieFeit | null, sessies: readonly SessieFeit[], aanmeldingen: readonly string[], nu: number): DelegatieUitkomst {
  const aanmeldingLeeft = aanmeldingen.length > 0;
  if (!d || !d.technisch || d.ingetrokkenOp !== null) return { soort: 'geen', code: 'AI_NIET_TOEGESTAAN' };
  if (d.termijn === 'tijd' && (d.eindOp === null || d.eindOp <= nu)) return { soort: 'intrekken', reden: 'verlopen' };
  if (d.termijn !== 'tijd' && d.eindOp !== null && d.eindOp <= nu) return { soort: 'intrekken', reden: 'verlopen' };
  if (d.regels.inactiefMinuten !== null) {
    const laatst = Math.max(d.gezetOp, d.laatstGebruiktOp ?? 0);
    if (nu - laatst > d.regels.inactiefMinuten * 60_000) return { soort: 'intrekken', reden: 'inactief' };
  }
  let kandidaten: SessieFeit[];
  if (d.termijn === 'tot-technisch-einde') {
    kandidaten = sessies.filter((s) => s.id === d.ruimteSessieId);
    if (!kandidaten.length) return { soort: 'intrekken', reden: 'technisch-einde' };
  } else if (d.termijn === 'tot-site-uitloggen') {
    kandidaten = sessies.filter((s) => d.siteSessieId !== null && s.siteSessieId === d.siteSessieId);
    if (!kandidaten.length) return d.siteSessieId !== null && aanmeldingen.includes(d.siteSessieId)
      ? { soort: 'wacht', code: 'AI_WACHT_OP_SESSIE' }
      : { soort: 'intrekken', reden: 'site-afgemeld' };
  } else {
    kandidaten = [...sessies];
    if (!kandidaten.length) {
      if (aanmeldingLeeft) return { soort: 'wacht', code: 'AI_WACHT_OP_SESSIE' };
      if (d.termijn === 'tot-account-uitloggen' || d.regels.bijAfmelden === 'intrekken') return { soort: 'intrekken', reden: 'account-afgemeld' };
      return { soort: 'wacht', code: 'AI_WACHT_OP_AANMELDING' };
    }
  }
  const actief = kandidaten.find((s) => s.actief === 'technisch');
  if (actief) return { soort: 'toegestaan', sessieId: actief.id, negeerPauze: false };
  if (d.regels.bijPauze === 'doorwerken') return { soort: 'toegestaan', sessieId: kandidaten[0].id, negeerPauze: true };
  if (d.regels.bijPauze === 'intrekken') return { soort: 'intrekken', reden: 'profiel-gewisseld' };
  return { soort: 'wacht', code: 'AI_PAUZE' };
}

/** Eindtijd die de UI toont (ms) of null als er geen klok is. */
export const eindVan = (d: Pick<DelegatieFeit, 'termijn' | 'eindOp'>): number | null => d.eindOp;

// ------------------------------------------------------------------------------------------------ teksten (UA + NL)
export const TERMIJN_NAAM: Record<AiTermijn, Tweetalig> = {
  tijd: t2('На час або до дати', 'Voor een tijd of tot een datum'),
  'tot-technisch-einde': t2('До завершення технічного сеансу', 'Tot einde technische sessie'),
  'tot-site-uitloggen': t2('До виходу з цього входу на сайт', 'Tot afmelden van deze aanmelding'),
  'tot-account-uitloggen': t2('До виходу з облікового запису (усі входи)', 'Tot afmelden van het account (overal)'),
  onbepaald: t2('Безстроково', 'Onbepaald'),
};
export const TERMIJN_UITLEG: Record<AiTermijn, Tweetalig> = {
  tijd: t2('Доступ сам закінчиться у вибраний момент. Правила нижче можуть зняти його раніше.', 'De toegang stopt vanzelf op het gekozen moment. De regels hieronder kunnen hem eerder intrekken.'),
  'tot-technisch-einde': t2('Діє, доки живе технічний сеанс, у якому ви дали дозвіл (цей піддомен у цьому браузері).', 'Geldt zolang de technische sessie leeft waarin u toestemming gaf (dit subdomein in deze browser).'),
  'tot-site-uitloggen': t2('Діє, доки ви не вийдете з цього входу на сайт. Повторний запуск технічного сеансу в ньому дозвіл не скидає.', 'Geldt tot u zich afmeldt van deze aanmelding. Een nieuwe technische sessie daarin trekt hem niet in.'),
  'tot-account-uitloggen': t2('Діє, поки ви увійшли на сайт хоч де-небудь: будь-який піддомен, будь-який пристрій. Вихід усюди знімає дозвіл.', 'Geldt zolang u ergens aangemeld bent: elk subdomein, elk apparaat. Overal afmelden trekt hem in.'),
  onbepaald: t2('Без кінцевої дати. Знімається лише вами або правилами нижче.', 'Zonder einddatum. Alleen u of de regels hieronder trekken hem in.'),
};
export const PAUZE_NAAM: Record<BijPauze, Tweetalig> = {
  pauzeren: t2('Пауза', 'Pauze'),
  intrekken: t2('Скинути дозвіл', 'Toestemming intrekken'),
  doorwerken: t2('Працювати далі', 'Doorwerken'),
};
export const PAUZE_UITLEG: Record<BijPauze, Tweetalig> = {
  pauzeren: t2('Коли ви натискаєте «Пауза» технічного доступу, ШІ теж чекає. Натиснули «Продовжити» — ШІ працює далі сам, без нового дозволу. Просте перемикання простору у вкладці ШІ не зупиняє.', 'Zet u de technische toegang op «Pauze», dan wacht de AI ook. Na «Doorgaan» werkt de AI vanzelf verder, zonder nieuwe toestemming. Alleen van ruimte wisselen in een tabblad stopt de AI niet.'),
  intrekken: t2('«Пауза» технічного доступу знімає дозвіл. Щоб ШІ знову працював у технічному, дайте дозвіл заново. Просте перемикання простору у вкладці дозвіл не знімає.', '«Pauze» van de technische toegang trekt de toestemming in. Daarna moet u ze opnieuw geven. Alleen van ruimte wisselen in een tabblad trekt niets in.'),
  doorwerken: t2('Навіть на «Паузі» технічного доступу ШІ працює далі в технічному просторі. Ви не бачите технічних дій ШІ на екрані в момент, коли вони відбуваються.', 'Ook als de technische toegang op «Pauze» staat, werkt de AI door in de technische ruimte. U ziet technische acties van de AI niet op het scherm terwijl ze gebeuren.'),
};
export const AFMELDEN_NAAM: Record<BijAfmelden, Tweetalig> = {
  intrekken: t2('Скинути дозвіл', 'Toestemming intrekken'),
  blijven: t2('Не скидати, чекати наступного входу', 'Niet intrekken, wachten op de volgende aanmelding'),
};
export const GEVAAR_UITLEG: Record<ReturnType<typeof gevaren>[number], Tweetalig> = {
  onbepaald: t2('Безстроковий доступ не закінчиться сам. Якщо токен підключення ШІ викрадуть, ним можна керувати сервером, доки ви не помітите й не знімете дозвіл.', 'Onbepaalde toegang stopt niet vanzelf. Wordt het token van de AI-verbinding gestolen, dan kan men de server beheren tot u het merkt en intrekt.'),
  lang: t2('Довгий термін (тиждень і більше) збільшує вікно, у якому викрадений токен підключення дає технічний доступ.', 'Een lange termijn (een week of meer) vergroot het venster waarin een gestolen verbindingstoken technische toegang geeft.'),
  doorwerken: t2('ШІ діє в технічному просторі, коли ви самі у звичайному: зміни сервера відбуваються без вашого погляду. Усе записується в журнал і центр сповіщень.', 'De AI handelt in de technische ruimte terwijl u in de gewone zit: serverwijzigingen gebeuren buiten uw zicht. Alles komt in het journaal en het meldingencentrum.'),
  'nooit-inactief': t2('Без скидання за неактивністю забутий дозвіл може лишатися відкритим тижнями.', 'Zonder intrekken bij inactiviteit kan een vergeten toestemming wekenlang openstaan.'),
  'na-afmelden': t2('ШІ лишиться в технічному просторі навіть після вашого виходу з усіх пристроїв. Це найширший режим: доступ тримається лише на токені підключення.', 'De AI blijft in de technische ruimte, ook nadat u zich overal afmeldde. De breedste stand: de toegang hangt alleen nog aan het verbindingstoken.'),
};
export const INTREK_REDEN: Record<IntrekReden | 'eigenaar', Tweetalig> = {
  verlopen: t2('термін закінчився', 'termijn verlopen'),
  inactief: t2('ШІ довго не користувався технічним простором', 'de AI gebruikte de technische ruimte lang niet'),
  'technisch-einde': t2('технічний сеанс, до якого був прив’язаний дозвіл, завершено', 'de technische sessie waaraan de toestemming hing is beëindigd'),
  'site-afgemeld': t2('ви вийшли з того входу на сайт', 'u meldde u af van die aanmelding'),
  'account-afgemeld': t2('ви вийшли з облікового запису на всіх пристроях', 'u meldde u overal af'),
  'profiel-gewisseld': t2('ви перемкнулися у звичайний профіль (так налаштовано правило)', 'u schakelde naar de gewone ruimte (zo staat de regel)'),
  eigenaar: t2('ви зняли дозвіл', 'u trok de toestemming in'),
};
export const inactiefNaam = (m: number | null): Tweetalig => m === null ? t2('Ніколи', 'Nooit')
  : m >= 1440 ? t2(`${m / 1440} доб${m / 1440 === 1 ? 'а' : 'и'}`, `${m / 1440} dag`) : m >= 60 ? t2(`${m / 60} год`, `${m / 60} u`) : t2(`${m} хв`, `${m} min`);
