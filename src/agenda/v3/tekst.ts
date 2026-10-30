// Agenda v3 — taalhulp (Oekraïens en Nederlands) en datum-/tijdopmaak in de taal van de pagina.
import type { AgendaItem } from '../../../shared/agenda-model';
export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const taalcode = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');
const middag = (dag: string) => new Date(`${dag}T12:00:00Z`);
// Zonder het Oekraïense achtervoegsel «р.» achter het jaar (rustiger koppen: «Жовтень 2026», zoals in het ontwerp).
export const fmt = (lang: Lang, dag: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(taalcode(lang), { timeZone: 'UTC', ...o }).format(middag(dag)).replace(/(\d{4})\s?р\.?/u, '$1');
export const uur = (lang: Lang, iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(taalcode(lang), { hour: '2-digit', minute: '2-digit' }).format(d); };
export function tijdTekst(lang: Lang, item: AgendaItem): string {
  if (item.heleDag || /^\d{4}-\d{2}-\d{2}$/.test(item.begin)) return tr(lang, 'увесь день', 'hele dag');
  const b = uur(lang, item.begin), e = uur(lang, item.einde);
  return e && e !== b ? `${b}–${e}` : b;
}
export const titelVan = (lang: Lang, item: AgendaItem) => item.titel || tr(lang, 'Без назви', 'Zonder titel');
export const WEERGAVE_NAAM = { maand: ['Місяць', 'Maand'], week: ['Тиждень', 'Week'], dag: ['День', 'Dag'], lijst: ['Список', 'Lijst'] } as const;
export const BRON_NAAM = { google: 'Google', ics: 'ICS', caldav: 'CalDAV' } as const;
