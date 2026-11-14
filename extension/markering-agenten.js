// Letterlijke kopie van shared/markering-agenten.ts voor de extensie (daar is geen bundler en geen TypeScript).
// tests/eenheid/markering-agenten-20261020.test.ts houdt beide gelijk: dezelfde getallen, dezelfde kleuren (uit ACCENT_KLEUREN
// van shared/menu-model.ts), dezelfde actieteksten en hetzelfde gedrag van markeringLezers().
// Lees de uitleg in shared/markering-agenten.ts; wijzig NOOIT één van de twee alleen.

/** Hoe lang een lezer na zijn laatste actie zichtbaar blijft (ms). HET getal van de staart — alleen hier. */
export const MARKERING_STAART_MS = 4000;
/** Hoeveel lezers hun eigen rand en eigen regel in de strook krijgen; de rest wordt geteld als «та ще N». */
export const MARKERING_MAX_AGENTEN = 3;

/** Standaardaccent per agent (namen uit ACCENTEN van shared/menu-model.ts). */
export const AGENT_ACCENT = Object.freeze({
  claude: 'oranje', gpt: 'teal', codex: 'limoen', grok: 'grafiet', gemini: 'blauw', copilot: 'violet', cursor: 'indigo', antigravity: 'hemel', autoclaw: 'groen',
});
export const ONBEKEND_ACCENT = 'grijs';

/** De 14 accentkleuren van de site (hoofdkleur licht/donker). Zelfde waarden als ACCENT_KLEUREN in shared/menu-model.ts. */
export const ACCENT_HOOFD = Object.freeze({
  teal: { licht: '#0f766e', donker: '#5eead4' },
  violet: { licht: '#9333ea', donker: '#d8b4fe' },
  blauw: { licht: '#1a5fd6', donker: '#7aa7ff' },
  hemel: { licht: '#027fbd', donker: '#67e8f9' },
  grafiet: { licht: '#24292f', donker: '#e6edf3' },
  oranje: { licht: '#c2570c', donker: '#fdba74' },
  groen: { licht: '#15803d', donker: '#4ade80' },
  limoen: { licht: '#4d7c0f', donker: '#bef264' },
  indigo: { licht: '#4f46e5', donker: '#a5b4fc' },
  oker: { licht: '#a16207', donker: '#fde047' },
  grijs: { licht: '#6b7280', donker: '#a1a1aa' },
  roze: { licht: '#be185d', donker: '#f9a8d4' },
  rood: { licht: '#dc2626', donker: '#fca5a5' },
  bruin: { licht: '#8b5a2b', donker: '#d6b48f' },
});

const kleurVanAccent = (a) => ({ licht: ACCENT_HOOFD[a].licht, donker: ACCENT_HOOFD[a].donker });

export const AGENT_KLEUR_STANDAARD = Object.freeze(
  Object.fromEntries(Object.entries(AGENT_ACCENT).map(([slug, acc]) => [slug, Object.freeze(kleurVanAccent(acc))])),
);
export const ONBEKENDE_KLEUR = Object.freeze(kleurVanAccent(ONBEKEND_ACCENT));

/** Alles wat een agent kan heten → slug, of null als het niet zeker is. */
export function agentSlugUitNaam(v) {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'claude' || t === 'gpt' || t === 'codex' || t === 'grok' || t === 'gemini' || t === 'copilot' || t === 'cursor' || t === 'antigravity' || t === 'autoclaw') return t;
  if (/\bcodex\b/.test(t)) return 'codex';
  if (/chatgpt|openai|\bgpt/.test(t)) return 'gpt';
  if (/claude|anthropic/.test(t)) return 'claude';
  if (/grok|\bxai\b|x\.ai/.test(t)) return 'grok';
  if (/antigravity|jetski/.test(t)) return 'antigravity';
  if (/autoclaw|openclaw|zhipu|chatglm|\bglm\b|z\.ai|\bzai\b/.test(t)) return 'autoclaw';
  if (/gemini|google ai|bard/.test(t)) return 'gemini';
  if (/copilot|vscode|visual studio code/.test(t)) return 'copilot';
  if (/cursor/.test(t)) return 'cursor';
  return null;
}

/** Kleur van een lezer: gekozen accent → standaardaccent van die agent → kleur voor «onbekende AI». */
export function kleurVoorAgent(slug, accent) {
  const a = String(accent ?? '');
  if (a && Object.prototype.hasOwnProperty.call(ACCENT_HOOFD, a)) return kleurVanAccent(a);
  if (slug && AGENT_KLEUR_STANDAARD[slug]) return AGENT_KLEUR_STANDAARD[slug];
  return ONBEKENDE_KLEUR;
}

export const AGENT_NAAM = Object.freeze({
  claude: 'Claude', gpt: 'ChatGPT', codex: 'Codex', grok: 'Grok', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor', antigravity: 'Antigravity', autoclaw: 'AutoClaw',
});

/** Welke actie hoort bij welke browseropdracht ([uk, nl]). */
export const MARKERING_ACTIES = Object.freeze({
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
export const ACTIE_ALGEMEEN = Object.freeze(['працює з вікном', 'werkt in het venster']);
export const actieTekst = (type) => MARKERING_ACTIES[String(type ?? '')] ?? ACTIE_ALGEMEEN;

const sleutelVan = (slug, naam) => slug || naam.toLowerCase() || '?';

/**
 * Welke lezers zijn NU zichtbaar? null = niets te zien (dus GEEN rand).
 * Zie shared/markering-agenten.ts voor de volledige uitleg.
 */
export function markeringLezers(lezers, nu, opties = {}) {
  const staart = Number.isFinite(opties.staart) ? Number(opties.staart) : MARKERING_STAART_MS;
  const max = Number.isFinite(opties.max) ? Math.max(1, Number(opties.max)) : MARKERING_MAX_AGENTEN;
  if (!Array.isArray(lezers) || lezers.length === 0) return null;
  const per = new Map();
  for (const rauw of lezers) {
    const at = Number(rauw && rauw.at);
    if (!Number.isFinite(at) || nu - at > staart || at - nu > staart) continue;
    const slug = agentSlugUitNaam(rauw.slug) ?? agentSlugUitNaam(rauw.naam);
    const naam = slug ? AGENT_NAAM[slug] : String(rauw.naam ?? '').trim().slice(0, 40);
    const lezer = { slug, naam, kleur: kleurVoorAgent(slug, rauw.accent), actie: actieTekst(rauw.type), at };
    const s = sleutelVan(slug, naam);
    const vorig = per.get(s);
    if (!vorig || vorig.at < at) per.set(s, lezer);
  }
  const alle = [...per.values()].sort((a, b) => b.at - a.at);
  if (!alle.length) return null;
  return { lezers: alle.slice(0, max), extra: Math.max(0, alle.length - max) };
}

/** «Claude · читає сторінку», of «ШІ · працює з вікном» als de agent onbekend is. */
export function lezerOpschrift(lezer, nederlands) {
  const i = nederlands ? 1 : 0;
  const wie = lezer.naam || (nederlands ? 'AI' : 'ШІ');
  return `${wie} · ${lezer.actie[i]}`;
}

export const TECHNISCH_ACHTERVOEGSEL = Object.freeze(['технічний профіль', 'technisch profiel']);
export const EXTRA_OPSCHRIFT = (n, nederlands) => (nederlands ? `en nog ${n}` : `та ще ${n}`);

export function markeringOpschrift(model, ruimte, nederlands) {
  const delen = model.lezers.map((l) => lezerOpschrift(l, nederlands));
  if (model.extra > 0) delen.push(EXTRA_OPSCHRIFT(model.extra, nederlands));
  if (ruimte === 'technisch') delen.push(TECHNISCH_ACHTERVOEGSEL[nederlands ? 1 : 0]);
  return delen.join(' · ');
}
