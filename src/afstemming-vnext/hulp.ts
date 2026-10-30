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

/** Bestandsformaat voor de import — alléén de drie veilige tekstformaten van deze golf. */
export function bronFormaat(naam: string): 'json' | 'md' | 'txt' | null {
  const m = /\.([a-z0-9]+)$/i.exec(String(naam || '').toLowerCase());
  return m && (m[1] === 'json' || m[1] === 'md' || m[1] === 'txt') ? (m[1] as 'json' | 'md' | 'txt') : null;
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
