// UI-003 — pure logica van het verbindingencentrum (geen DOM, geen CSS): standen, soorten, tijden en foutuitleg. Getest in
// tests/eenheid/verbindingen-centrum-20261029.test.ts.
import type { CloudVnextAanbieder } from '../../shared/cloud-vnext-model';
import type { IntegratiesUit } from '../cloud-vnext/cloud-client';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export type Soort = 'verbonden' | 'beschikbaar' | 'beperkt' | 'gepland' | 'onmogelijk';
export type AccountStand = 'ok' | 'aandacht' | 'uit' | 'bezig';
type GAccount = IntegratiesUit['google']['accounts'][number];

/** Stand van één Google-account, uit levende feiten. */
export function accountStand(a: GAccount): AccountStand {
  if (a.status === 'reauth_required' || a.status === 'revoked') return 'aandacht';
  if (a.status === 'pending' || a.status === 'disconnect_pending') return 'bezig';
  if (a.status !== 'connected') return 'uit';
  if (a.sync && (a.sync.herstelNodig || a.sync.foutCode)) return 'aandacht';
  return 'ok';
}
/** Is een catalogusitem nu levend gekoppeld? */
export function isLevend(a: CloudVnextAanbieder, d: IntegratiesUit | null): boolean {
  if (!d) return false;
  if (a.levend === 'google') return d.google.gekoppeld;
  if (a.levend === 'photos') return d.photos.gekoppeld;
  if (a.levend === 'm4') return Boolean(d.m4.aanbieders.find((x) => x.id === a.id)?.accounts.some((acc) => acc.status === 'connected'));
  return false;
}
export function soortVan(a: CloudVnextAanbieder, d: IntegratiesUit | null): Soort {
  if (isLevend(a, d)) return 'verbonden';
  if (a.stand === 'werkt') return 'beschikbaar';
  if (a.stand === 'sleutels-nodig') return 'beperkt';
  if (a.stand === 'gepland') return 'gepland';
  return 'onmogelijk';
}
/** Relatieve tijd («5 хв тому»); 0 = nooit. */
export function wanneer(lang: Lang, ms: number, nu = Date.now()): string {
  if (!ms) return tr(lang, 'ще не було', 'nog nooit');
  const s = Math.round((ms - nu) / 1000), rtf = new Intl.RelativeTimeFormat(lang === 'uk' ? 'uk' : 'nl', { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(s, 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
/** Begrijpelijke uitleg van een probleem + de passende actie. Interne code blijft in de technische details. */
export function probleemUitleg(lang: Lang, a: GAccount): { tekst: string; actie: 'opnieuw' | 'wachten' } | null {
  if (a.status === 'reauth_required') return { tekst: tr(lang, 'Google просить увійти ще раз (доступ закінчився або пароль змінено).', 'Google vraagt opnieuw aan te melden (toegang verlopen of wachtwoord gewijzigd).'), actie: 'opnieuw' };
  if (a.status === 'revoked') return { tekst: tr(lang, 'Доступ відкликано в налаштуваннях Google. Підключіть акаунт ще раз.', 'De toegang is ingetrokken in de Google-instellingen. Koppel het account opnieuw.'), actie: 'opnieuw' };
  if (a.status === 'connected' && a.sync?.herstelNodig) return { tekst: tr(lang, 'Синхронізація зупинилась і почнеться з початку автоматично. Якщо це триває довго — підключіть акаунт повторно.', 'De synchronisatie is gestopt en begint vanzelf opnieuw. Duurt dat lang, koppel het account dan opnieuw.'), actie: 'opnieuw' };
  if (a.status === 'connected' && a.sync?.foutCode) return /TOKEN|AUTH|401|403|GRANT/i.test(a.sync.foutCode)
    ? { tekst: tr(lang, 'Остання синхронізація не вдалася через доступ. Підключіть акаунт повторно.', 'De laatste synchronisatie mislukte door de toegang. Koppel het account opnieuw.'), actie: 'opnieuw' }
    : { tekst: tr(lang, 'Остання синхронізація не вдалася. Наступна спроба буде автоматично протягом 5 хвилин.', 'De laatste synchronisatie mislukte. Binnen 5 minuten volgt vanzelf een nieuwe poging.'), actie: 'wachten' };
  return null;
}

