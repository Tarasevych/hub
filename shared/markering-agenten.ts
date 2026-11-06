// WIE leest dit tabblad NU, en in welke kleur? (opdracht eigenaar 20.10.2026)
//
// Tot 0.6.1 stond de rand om de pagina ZOLANG het slot open was en de verbinding leefde, met één opschrift («Mijn Ruimte · ШІ
// користувача»). De eigenaar wil het omgekeerde: de rand hoort bij het MOMENT waarop een AI dit venster leest, bekijkt of
// bedient — en ze moet zeggen WELKE AI dat is en WAT die doet. Daarom:
//
//  1. ZICHTBAAR = ER IS WERK. Elke browseropdracht die dit tabblad raakt meldt een «lezer» aan. Een lezer leeft
//     MARKERING_STAART_MS na zijn laatste actie (de staart: lang genoeg om hem te zien, kort genoeg om niet te liegen).
//     Geen levende lezer → geen rand. Dat ene getal staat HIER en nergens anders.
//  2. WIE. De naam komt uit de opdracht zelf (de server zet de AI-verbinding erin) of uit de lijst van AI's die net
//     browseropdrachten naar deze koppeling stuurden ({t:'agent-status'}). Weet de extensie het niet, dan zegt het opschrift
//     eerlijk «ШІ» / «AI» ZONDER naam — nooit de eerste de beste agent.
//  3. KLEUR PER AGENT. De standaardkleur komt uit de accentpalet van de site (shared/menu-model.ts → ACCENT_KLEUREN, al op
//     contrast gecontroleerd in licht en donker); de eigenaar kan hem per agent wijzigen (app.agent_kleuren, migratie 0088).
//     Dezelfde kleur geldt in de rand, in de badge op het pictogram en in de agentenlijst op de site.
//  4. MEER AGENTEN TEGELIJK. Elke levende lezer krijgt zijn EIGEN rand, naast (binnen) die van de vorige, en een eigen plek in
//     de strook onderaan (logo + naam + actie). Boven MARKERING_MAX_AGENTEN komt er «та ще N» / «en nog N» bij.
//
// Puur: geen DOM, geen chrome.*, geen netwerk. extension/markering-agenten.js is de letterlijke kopie voor de extensie (geen
// bundler daar); tests/eenheid/markering-agenten-20261020.test.ts houdt beide gelijk.
import { ACCENT_KLEUREN, type Accent } from './menu-model';
import type { AgentSlug } from './connector-v2/agenten';
import type { AiRuimte } from './ai-ruimte';

/** Hoe lang een lezer na zijn laatste actie zichtbaar blijft (ms). HET getal van de staart — alleen hier. */
export const MARKERING_STAART_MS = 4000;
/** Hoeveel lezers hun eigen rand en eigen regel in de strook krijgen; de rest wordt geteld als «та ще N». */
export const MARKERING_MAX_AGENTEN = 3;

/** Twee waarden per agentkleur: `licht` voor een lichte pagina, `donker` voor een donkere (zelfde paar als ACCENT_KLEUREN). */
export type AgentKleur = { licht: string; donker: string };

/**
 * Standaardaccent per agent: uit ACCENTEN van de site, bewust ver uiteen op de kleurcirkel zodat twee randen naast elkaar te
 * onderscheiden blijven. Nooit een eigen hexwaarde: de kleuren zelf komen uit ACCENT_KLEUREN.
 */
export const AGENT_ACCENT: Readonly<Record<AgentSlug, Accent>> = Object.freeze({
  claude: 'oranje', gpt: 'teal', grok: 'grafiet', gemini: 'blauw', copilot: 'violet', cursor: 'indigo', antigravity: 'hemel',
});
/** Accent voor een lezer waarvan de extensie de agent NIET kent (en voor een onbekend accent in de opslag). */
export const ONBEKEND_ACCENT: Accent = 'grijs';

const kleurVanAccent = (a: Accent): AgentKleur => ({ licht: ACCENT_KLEUREN[a].licht.hoofd, donker: ACCENT_KLEUREN[a].donker.hoofd });

/** Standaardkleur per agent, afgeleid van het palet van de site. */
export const AGENT_KLEUR_STANDAARD: Readonly<Record<AgentSlug, AgentKleur>> = Object.freeze(
  Object.fromEntries(Object.entries(AGENT_ACCENT).map(([slug, acc]) => [slug, Object.freeze(kleurVanAccent(acc))])) as Record<AgentSlug, AgentKleur>,
);
export const ONBEKENDE_KLEUR: AgentKleur = Object.freeze(kleurVanAccent(ONBEKEND_ACCENT));

/** Alles wat een agent kan heten (slug, klant-id, clientnaam van een OAuth-registratie) → slug, of null als het niet zeker is. */
export function agentSlugUitNaam(v: unknown): AgentSlug | null {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'claude' || t === 'gpt' || t === 'grok' || t === 'gemini' || t === 'copilot' || t === 'cursor' || t === 'antigravity') return t;
  if (/chatgpt|openai|\bgpt/.test(t)) return 'gpt';
  if (/claude|anthropic/.test(t)) return 'claude';
  if (/grok|\bxai\b|x\.ai/.test(t)) return 'grok';
  if (/antigravity|jetski/.test(t)) return 'antigravity';
  if (/gemini|google ai|bard/.test(t)) return 'gemini';
  if (/copilot|vscode|visual studio code/.test(t)) return 'copilot';
  if (/cursor/.test(t)) return 'cursor';
  return null;
}

/**
 * Kleur van een lezer: het door de eigenaar gekozen accent, anders het standaardaccent van die agent, anders de kleur voor
 * «onbekende AI». Een accent dat niet (meer) in het palet staat wordt genegeerd (nooit een verzonnen waarde tekenen).
 */
export function kleurVoorAgent(slug: AgentSlug | null, accent?: unknown): AgentKleur {
  const a = String(accent ?? '');
  if (a && Object.prototype.hasOwnProperty.call(ACCENT_KLEUREN, a)) return kleurVanAccent(a as Accent);
  if (slug && AGENT_KLEUR_STANDAARD[slug]) return AGENT_KLEUR_STANDAARD[slug];
  return ONBEKENDE_KLEUR;
}

/** Naam van de agent zoals een mens die leest; leeg = de extensie weet het niet (het opschrift zegt dan alleen «ШІ»/«AI»). */
export const AGENT_NAAM: Readonly<Record<AgentSlug, string>> = Object.freeze({
  claude: 'Claude', gpt: 'ChatGPT', grok: 'Grok', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor', antigravity: 'Antigravity',
});

// ---------------------------------------------------------------- wat doet die AI nu? (tweetalig, [uk, nl])
export type Tweetalig = readonly [string, string];
/** Welke actie hoort bij welke browseropdracht. Alleen werkwoorden die een mens herkent; nooit de technische naam. */
export const MARKERING_ACTIES: Readonly<Record<string, Tweetalig>> = Object.freeze({
  'browser.snapshot': ['читає сторінку', 'leest de pagina'],
  'browser.audit': ['читає сторінку', 'leest de pagina'],
  'browser.diagnostics': ['читає діагностику', 'leest de diagnose'],
  'browser.console': ['читає діагностику', 'leest de diagnose'],
  'browser.network': ['читає запити', 'leest de verzoeken'],
  'browser.pages': ['дивиться вкладки', 'bekijkt de tabbladen'],
  'browser.tabs': ['дивиться вкладки', 'bekijkt de tabbladen'],
  'browser.screenshot': ['робить знімок', 'maakt een momentopname'],
  'browser.click': ['натискає', 'klikt'],
  'browser.invoke': ['натискає', 'klikt'],
  'browser.hover': ['наводить курсор', 'wijst aan'],
  'browser.type': ['вводить текст', 'typt'],
  'browser.fill_form': ['заповнює форму', 'vult het formulier'],
  'browser.select': ['вибирає', 'kiest'],
  'browser.key': ['натискає клавішу', 'drukt een toets'],
  'browser.navigate': ['переходить', 'navigeert'],
  'browser.history': ['переходить', 'navigeert'],
  'browser.scroll': ['прокручує', 'scrolt'],
  'browser.wait': ['чекає', 'wacht'],
  'browser.self_test': ['перевіряє себе', 'controleert zichzelf'],
  'browser.deep_diagnostics': ['спостерігає за екраном', 'observeert het venster'],
});
/** Onbekende of ontbrekende opdracht: eerlijk en algemeen, nooit een verzonnen actie. */
export const ACTIE_ALGEMEEN: Tweetalig = Object.freeze(['працює з вікном', 'werkt in het venster']) as Tweetalig;
export const actieTekst = (type: unknown): Tweetalig => MARKERING_ACTIES[String(type ?? '')] ?? ACTIE_ALGEMEEN;

// ---------------------------------------------------------------- het model dat getekend wordt
/** Eén melding «deze AI deed net iets in dit tabblad». `naam`/`slug` mogen leeg zijn: dan is de agent onbekend. */
export type LezerInvoer = { slug?: unknown; naam?: unknown; type?: unknown; at?: unknown; accent?: unknown };
export type Lezer = {
  slug: AgentSlug | null;
  /** Leeg = onbekende AI; het opschrift zegt dan alleen «ШІ»/«AI». */
  naam: string;
  kleur: AgentKleur;
  actie: Tweetalig;
  at: number;
};
export type MarkeringModel = { lezers: Lezer[]; extra: number };

const sleutelVan = (slug: AgentSlug | null, naam: string) => slug || naam.toLowerCase() || '?';

/**
 * Welke lezers zijn NU zichtbaar? Zuiver, zodat de test de hele regel kan nalopen zonder browser.
 *  - alles ouder dan `staart` valt af (de staart na de laatste actie);
 *  - één regel per agent (de jongste actie van die agent wint), jongste eerst;
 *  - hoogstens `max` regels; de rest wordt geteld in `extra`.
 * null = niets te zien (dus GEEN rand): precies het verschil met 0.6.1, waar de rand bleef staan zolang het slot open was.
 */
export function markeringLezers(
  lezers: readonly LezerInvoer[] | null | undefined,
  nu: number,
  opties: { staart?: number; max?: number } = {},
): MarkeringModel | null {
  const staart = Number.isFinite(opties.staart) ? Number(opties.staart) : MARKERING_STAART_MS;
  const max = Number.isFinite(opties.max) ? Math.max(1, Number(opties.max)) : MARKERING_MAX_AGENTEN;
  if (!Array.isArray(lezers) || lezers.length === 0) return null;
  const per = new Map<string, Lezer>();
  for (const rauw of lezers) {
    const at = Number(rauw && rauw.at);
    if (!Number.isFinite(at) || nu - at > staart || at - nu > staart) continue; // ook een klok uit de toekomst telt niet
    const slug = agentSlugUitNaam(rauw.slug) ?? agentSlugUitNaam(rauw.naam);
    const naam = slug ? AGENT_NAAM[slug] : String(rauw.naam ?? '').trim().slice(0, 40);
    const lezer: Lezer = { slug, naam, kleur: kleurVoorAgent(slug, rauw.accent), actie: actieTekst(rauw.type), at };
    const s = sleutelVan(slug, naam);
    const vorig = per.get(s);
    if (!vorig || vorig.at < at) per.set(s, lezer);
  }
  const alle = [...per.values()].sort((a, b) => b.at - a.at);
  if (!alle.length) return null;
  return { lezers: alle.slice(0, max), extra: Math.max(0, alle.length - max) };
}

/** Opschrift van één lezer: «Claude · читає сторінку», of «ШІ · працює з вікном» als de agent onbekend is. */
export function lezerOpschrift(lezer: Lezer, nederlands: boolean): string {
  const i = nederlands ? 1 : 0;
  const wie = lezer.naam || (nederlands ? 'AI' : 'ШІ');
  return `${wie} · ${lezer.actie[i]}`;
}

/** Toevoeging bij het opschrift van het TECHNISCHE slot, zodat het ook met dezelfde agentkleur van het gebruikersslot verschilt. */
export const TECHNISCH_ACHTERVOEGSEL: Tweetalig = Object.freeze(['технічний профіль', 'technisch profiel']) as Tweetalig;
export const EXTRA_OPSCHRIFT = (n: number, nederlands: boolean): string => (nederlands ? `en nog ${n}` : `та ще ${n}`);

/** Hele opschrift van de strook voor één ruimte (de rand van het technische slot krijgt daarnaast een eigen streepjespatroon). */
export function markeringOpschrift(model: MarkeringModel, ruimte: AiRuimte, nederlands: boolean): string {
  const delen = model.lezers.map((l) => lezerOpschrift(l, nederlands));
  if (model.extra > 0) delen.push(EXTRA_OPSCHRIFT(model.extra, nederlands));
  if (ruimte === 'technisch') delen.push(TECHNISCH_ACHTERVOEGSEL[nederlands ? 1 : 0]);
  return delen.join(' · ');
}
