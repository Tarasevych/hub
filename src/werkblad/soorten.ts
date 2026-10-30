// Gedeelde typen en hulpjes van de werkblad-widgets (geen React-componenten hier).
import type { HubTabId } from '../canoniek-navigatie';
import type { WerkbladContext, WerkbladItem } from '../../shared/werkblad-indeling';

export type Lang = 'uk' | 'nl';
export type Dienst = 'ai' | 'mail' | 'cloud' | 'github' | 'huis' | 'identity' | 'api' | 'admin' | 'mcp';
/** Wat een widget mag doen buiten zichzelf: een hub-tab openen, een andere dienst openen, zoeken. Nooit zelf location.* . */
export type Acties = {
  hubTab: (tab: HubTabId) => void;
  dienst: (dienst: Dienst, tab?: string) => void;
  zoek: (vraag?: string) => void;
  /** Instelmodus aanzetten (knop «Налаштувати» in de tip-strook). */
  instellen: () => void;
  /** Instelmodus aan en meteen de catalogus open («Мої віджети»). */
  catalogus: () => void;
};
export type WidgetProps = { lang: Lang; item: WerkbladItem; ctx: WerkbladContext; acties: Acties; naam: string; ownerUserId: string; techProfiel: boolean; apiPlatform: boolean; eigenaar: boolean; zichtbaar: boolean;
  /** Rasterbreedte nu (12 / 6 / 1). Op de telefoon groeit een tegel met haar inhoud mee, dus daar geen grens op het aantal regels. */
  kolommen: number;
  /** Deze widget van het werkblad halen (alleen als de mens het werkblad mag bewerken). */
  weg?: () => void;
  /** Teller in de kop van de tegel (ongelezen post, open taken); null = geen teller. */
  zetTeller?: (n: number | null, label?: string) => void };

export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const locale = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-BE');
export const tijd = (lang: Lang, ms: number) => (ms ? new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '');
export const datumKort = (lang: Lang, ms: number) => (ms ? new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: 'short' }).format(new Date(ms)) : '');
/** «10:24» vandaag, «вчора», anders «21 жовт.» — zoals in het voorbeeld van de eigenaar. */
export function wanneer(lang: Lang, ms: number, nu = Date.now()): string {
  if (!ms) return '';
  const d = new Date(ms), n = new Date(nu);
  const zelfdeDag = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (zelfdeDag) return tijd(lang, ms);
  const gisteren = new Date(n); gisteren.setDate(n.getDate() - 1);
  if (d.getFullYear() === gisteren.getFullYear() && d.getMonth() === gisteren.getMonth() && d.getDate() === gisteren.getDate()) return tr(lang, 'вчора', 'gisteren');
  return datumKort(lang, ms);
}
/** «2 хв тому», «1 год тому», «3 дн. тому» */
export function geleden(lang: Lang, ms: number, nu = Date.now()): string {
  if (!ms) return '';
  const s = Math.max(0, Math.round((nu - ms) / 1000));
  if (s < 60) return tr(lang, 'щойно', 'zojuist');
  const m = Math.round(s / 60); if (m < 60) return tr(lang, `${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60); if (h < 24) return tr(lang, `${h} год тому`, `${h} u geleden`);
  const d = Math.round(h / 24); return tr(lang, `${d} дн. тому`, `${d} d geleden`);
}
export const bytesTekst = (lang: Lang, b: number) => {
  if (!b || b < 0) return '';
  const eenheden = lang === 'uk' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'kB', 'MB', 'GB', 'TB'];
  let i = 0, v = b; while (v >= 1000 && i < eenheden.length - 1) { v /= 1000; i += 1; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${eenheden[i]}`;
};
/** Beginletters voor een afzender zonder foto (zelfde als de post-lijst: nooit een verzonnen logo). */
export const initialen = (naam: string) => naam.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '·';

/**
 * Hoeveel regels passen in een tegel van r rijen (96 px per rij + 12 px tussenruimte, min. kop en voet). `vast` = regels
 * die de widget altijd al gebruikt (filters, tellers, «Переглянути всі»). Op de telefoon groeit de tegel mee: daar vijf regels.
 */
export const regelsVoor = (r: number, kolommen: number, perRij = 2, vast = 2, max = 12): number => (kolommen === 1 ? Math.min(max, 5) : Math.max(1, Math.min(max, r * perRij - vast)));
