// Kleine hulpjes van de Afstemming-vNext-UI (uitvoerder C3): sessiesleutel-overdrachten (zoals cloud-vnext),
// de toegestane volgende levensfasen, de regelparser voor acceptatiecriteria («ID | tekst | verificatie»),
// menselijke teksten voor gebeurtenissen/actoren en de eerlijke fouttekst die NOG_NIET_GEBOUWD apart benoemt.
import { AFSTEMMING_LIMIETEN, FASE_MENS_VERPLICHT, LEVENSFASEN, afstemmingTekst, type Criterium, type GebeurtenisSoort, type Levensfase } from '../../shared/afstemming-model';
import { AfstemmingFout } from './afstemming-client';
import { foutTekst, tr, type Lang } from './tekst';

/** Lees-en-wis van een sessiesleutel (overdracht tussen onderdelen, zoals 'afv-filter'). */
export function sessieNeem(sleutel: string): string {
  try { const w = sessionStorage.getItem(sleutel) || ''; sessionStorage.removeItem(sleutel); return w; } catch { return ''; }
}
export function sessieLees(sleutel: string): string { try { return sessionStorage.getItem(sleutel) || ''; } catch { return ''; } }
export function sessieZet(sleutel: string, waarde: string): void { try { if (waarde) sessionStorage.setItem(sleutel, waarde); else sessionStorage.removeItem(sleutel); } catch { /* privémodus: geen overdracht, geen crash */ } }

/** Is dit de eerlijke «de serverkant is nog in aanbouw»-fout van het vNext-geraamte? */
export const isBouwFout = (e: unknown): boolean => e instanceof AfstemmingFout && e.code === 'NOG_NIET_GEBOUWD';
export function afstemmingFoutTekst(lang: Lang, e: unknown): string {
  if (isBouwFout(e)) return tr(lang, 'Серверна частина цього розділу ще збирається.', 'De serverkant van dit onderdeel is nog in aanbouw.');
  const code = e instanceof AfstemmingFout ? e.code : String((e as Error)?.message || 'FOUT');
  return foutTekst(lang, code);
}

/**
 * Toegestane VOLGENDE fasen vanuit de huidige: alles wat in LEVENSFASEN verder ligt, plus altijd «cancelled» en
 * «superseded» (een besluit kan elk moment vallen). De server controleert daarbovenop het bewijs (production_verified)
 * en wie beslist (FASE_MENS_VERPLICHT) — deze lijst is alleen wat de UI aanbiedt, geen tweede waarheid.
 */
export function faseVolgende(huidige: Levensfase): Levensfase[] {
  const i = LEVENSFASEN.indexOf(huidige);
  const vooruit = LEVENSFASEN.filter((f, n) => n > i && f !== 'cancelled' && f !== 'superseded');
  const altijd = (['superseded', 'cancelled'] as Levensfase[]).filter((f) => f !== huidige);
  return [...vooruit, ...altijd];
}
export const faseVraagtMens = (f: Levensfase): boolean => (FASE_MENS_VERPLICHT as readonly Levensfase[]).includes(f);

const VERIFICATIES: ReadonlyArray<Criterium['verificatie']> = ['unit', 'integration', 'e2e', 'production', 'owner'];
/**
 * Regels «ID | tekst | verificatie» → criteria. Zonder ID wordt AC-n toegekend; een onbekende verificatie wordt
 * EERLIJK 'owner' (een mens moet dan kijken — nooit stilletjes 'e2e' doen alsof er een test is). Lege regels vervallen.
 */
export function criteriaUitTekst(ruw: string): Array<{ id: string; tekst: string; verificatie: Criterium['verificatie'] }> {
  const uit: Array<{ id: string; tekst: string; verificatie: Criterium['verificatie'] }> = [];
  for (const regel of String(ruw || '').split('\n')) {
    const delen = regel.split('|').map((d) => d.trim());
    if (!delen[0] && !delen[1]) continue;
    let id = '', tekst = '', verif = '';
    if (delen.length >= 2 && /^[A-Za-z][A-Za-z0-9-]{0,23}$/.test(delen[0])) { [id, tekst, verif] = [delen[0].toUpperCase(), delen[1], delen[2] || '']; }
    else { tekst = delen.filter(Boolean).join(' — '); verif = ''; }
    if (!tekst) continue;
    const verificatie = (VERIFICATIES as readonly string[]).includes(verif.toLowerCase()) ? (verif.toLowerCase() as Criterium['verificatie']) : 'owner';
    uit.push({ id: id || `AC-${String(uit.length + 1).padStart(2, '0')}`, tekst: tekst.slice(0, AFSTEMMING_LIMIETEN.criteriumMax), verificatie });
    if (uit.length >= AFSTEMMING_LIMIETEN.criteriaMax) break;
  }
  return uit;
}
/** Criteria terug naar de bewerkbare regels «ID | tekst | verificatie». */
export function criteriaNaarTekst(criteria: Criterium[], lang: Lang): string {
  return criteria.map((c) => `${c.id} | ${afstemmingTekst(c.tekst, lang)} | ${c.verificatie}`).join('\n');
}

/** Дозволені формати імпорту чернеток і вкладень: текстові файли (.json/.md/.txt), документи PDF та зображення. */
export function bronFormaat(naam: string): 'json' | 'md' | 'txt' | 'pdf' | 'afbeelding' | null {
  const m = /\.([a-z0-9]+)$/i.exec(String(naam || '').toLowerCase());
  if (!m) return null;
  const ext = m[1];
  if (ext === 'json' || ext === 'md' || ext === 'txt') return ext;
  if (ext === 'pdf') return 'pdf';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'afbeelding';
  return null;
}

const DIENST_HOST_MAP: Record<string, { dienst: string; tab?: string; host: string }> = {
  hub: { dienst: 'hub', host: 'hub.tarasevych.com' },
  mail: { dienst: 'mail', host: 'mail.tarasevych.com' },
  cloud: { dienst: 'cloud', host: 'cloud.tarasevych.com' },
  agenda: { dienst: 'cloud', tab: 'calendar', host: 'cloud.tarasevych.com' },
  calendar: { dienst: 'cloud', tab: 'calendar', host: 'cloud.tarasevych.com' },
  huis: { dienst: 'huis', host: 'huis.tarasevych.com' },
  github: { dienst: 'github', host: 'github.tarasevych.com' },
  crm: { dienst: 'crm', host: 'crm.tarasevych.com' },
  ai: { dienst: 'ai', host: 'ai.tarasevych.com' },
  mcp: { dienst: 'mcp', host: 'mcp.tarasevych.com' },
  admin: { dienst: 'admin', host: 'admin.tarasevych.com' },
  identity: { dienst: 'identity', host: 'id.tarasevych.com' },
  api: { dienst: 'api', host: 'api.tarasevych.com' },
  site: { dienst: 'hub', host: 'hub.tarasevych.com' },
};

type CanoniekRuntime = {
  canonicalUrl?: (service: string, tab: string | null, lang: Lang, opts?: { explicitTab?: boolean }) => string;
};

const leesCanoniekRuntime = (): CanoniekRuntime | null => {
  const g = globalThis as { window?: { __TSV_CANONICAL_SERVICE__?: CanoniekRuntime } };
  return g.window?.__TSV_CANONICAL_SERVICE__ ?? null;
};

/** Канонічна адреса переходу з картки узгодження до її цільової служби (працює і в оглядачі, і в Node-випробуваннях). */
export function dienstUrlVoorKaart(dienst: string, lang: Lang, route = ''): string {
  const sleutel = String(dienst || 'hub').trim().toLowerCase();
  const doel = DIENST_HOST_MAP[sleutel] || DIENST_HOST_MAP.hub;
  const rt = leesCanoniekRuntime();
  if (rt?.canonicalUrl && !route) {
    try {
      const gebouwd = rt.canonicalUrl(doel.dienst, doel.tab || null, lang, doel.tab ? { explicitTab: true } : undefined);
      if (gebouwd) return gebouwd;
    } catch {
      /* перехід до прямого формування адреси */
    }
  }
  const pad = route && route.startsWith('/') ? route : doel.tab === 'calendar' ? '/agenda' : '/';
  return `https://${doel.host}${pad}`;
}

/** Канонічне посилання переходу з картки узгодження до Календаря (agenda / calendar) з підготовленою темою події. */
export function agendaUrlVoorKaart(
  kaart: { externId: string; titel: readonly [string, string] | { uk: string; nl?: string } },
  lang: Lang,
): string {
  const rt = leesCanoniekRuntime();
  let basis = 'https://cloud.tarasevych.com/agenda';
  if (rt?.canonicalUrl) {
    try {
      basis = rt.canonicalUrl('cloud', 'calendar', lang, { explicitTab: true }) || basis;
    } catch {
      basis = 'https://cloud.tarasevych.com/agenda';
    }
  }
  const onderwerp = `${kaart.externId}: ${afstemmingTekst(kaart.titel, lang)}`.trim().slice(0, 140);
  const scheiding = basis.includes('?') ? '&' : '?';
  return `${basis}${scheiding}actie=nieuw&onderwerp=${encodeURIComponent(onderwerp)}`;
}

export const GEBEURTENIS_TEKST: Record<GebeurtenisSoort, [string, string]> = {
  voorgesteld: ['Запропоновано картку', 'Kaart voorgesteld'], bijgewerkt: ['Оновлено', 'Bijgewerkt'], revisie: ['Нова ревізія', 'Nieuwe revisie'],
  besluit: ['Рішення власника', 'Eigenaarsbesluit'], koppeling: ['Зв’язок', 'Koppeling'], bewijs: ['Додано доказ', 'Bewijs toegevoegd'],
  release: ['Випуск', 'Release'], fase: ['Зміна етапу', 'Fasewissel'], gezondheid: ['Зміна стану', 'Gezondheidswissel'],
  import: ['Імпортовано', 'Geïmporteerd'], scan: ['Сканування', 'Scan'], notitie: ['Нотатка', 'Notitie'],
  geweigerd: ['Відхилено', 'Geweigerd'], gearchiveerd: ['Архівовано', 'Gearchiveerd'],
};
export const gebeurtenisTekst = (lang: Lang, soort: string): string => {
  const p = GEBEURTENIS_TEKST[soort as GebeurtenisSoort];
  return p ? tr(lang, p[0], p[1]) : soort;
};
export const actorTekst = (lang: Lang, actor: { soort: string; naam?: string; id?: string }): string =>
  actor.soort === 'eigenaar' ? tr(lang, 'власник', 'eigenaar') : actor.soort === 'agent' ? (actor.naam || tr(lang, 'агент', 'agent')) : tr(lang, 'система', 'systeem');

export const kleineDatum = (lang: Lang, iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const PRIORITEITEN = ['P0', 'P1', 'P2', 'P3'] as const;
export { AFSTEMMING_VOLLEDIG_VLAG } from '../../shared/afstemming-model';
