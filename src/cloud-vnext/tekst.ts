// Teksten en hulpjes van de cloud-vNext-pagina (uk/nl). Zelfde vorm als src/huis/tekst.ts.
import { useEffect, useState } from 'react';
import { CLOUD_SOORT_LABEL, type CloudSoort } from '../../shared/cloud-vnext-model';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const locale = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');

export function foutTekst(lang: Lang, code: string): string {
  const t: Record<string, [string, string]> = {
    CLOUD_VNEXT_MIGRATIE_ONTBREEKT: ['На сервері ще не застосовано міграцію 0130.', 'Op de server is migratie 0130 nog niet uitgevoerd.'],
    NAAM_ONGELDIG: ['Назва порожня або задовга (до 200 символів, без / і \\).', 'De naam is leeg of te lang (tot 200 tekens, zonder / en \\).'],
    MAP_ONBEKEND: ['Такої теки немає.', 'Die map bestaat niet.'], BESTAND_ONBEKEND: ['Такого файлу немає.', 'Dat bestand bestaat niet.'],
    MAP_DIEPTE: ['Занадто глибока вкладеність тек (до 12).', 'De mappen zijn te diep genest (tot 12).'], MAP_VOL: ['Забагато тек (до 2000).', 'Te veel mappen (tot 2000).'],
    MAP_IN_ZICHZELF: ['Теку не можна перемістити в саму себе.', 'Een map kan niet in zichzelf.'],
    TAG_ONGELDIG: ['Теґ порожній або задовгий (до 40 символів).', 'Het label is leeg of te lang (tot 40 tekens).'],
    TE_GROOT: ['Файл завеликий для цієї дії (ліміт показано поруч).', 'Het bestand is te groot voor deze actie (de grens staat ernaast).'],
    MIME_NIET_TOEGESTAAN: ['Цей тип файлу не дозволено.', 'Dit bestandstype is niet toegestaan.'],
    STUK_BUITEN_ORDE: ['Частини завантаження прийшли не по порядку — спробуйте ще раз.', 'De stukken kwamen niet op volgorde — probeer opnieuw.'],
    SHA_MISMATCH: ['Контрольна сума не збігається — файл пошкоджено при передачі.', 'De controlesom klopt niet — het bestand raakte onderweg beschadigd.'],
    UPLOAD_ONBEKEND: ['Сесію завантаження не знайдено (можливо, сплила).', 'De uploadsessie is onbekend (mogelijk verlopen).'],
    NIET_IN_PRULLENBAK: ['Дія можлива лише з кошика.', 'Dit kan alleen vanuit de prullenbak.'],
    LIMIET_BEREIKT: ['Досягнуто ліміт.', 'De grens is bereikt.'],
    VERSIE_ONBEKEND: ['Такої версії немає.', 'Die versie bestaat niet.'],
    OWNER_CLOUD_SESSION_REQUIRED: ['Доступно лише після входу.', 'Alleen na aanmelden.'],
  };
  const p = t[code]; if (p) return tr(lang, p[0], p[1]);
  if (/SESSION|401|403/.test(code)) return tr(lang, 'Доступно лише після входу.', 'Alleen na aanmelden.');
  return tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`);
}

export function datumTekst(lang: Lang, iso: string | null, metTijd = true): string {
  if (!iso) return tr(lang, 'невідомо', 'onbekend');
  const ms = Date.parse(iso); if (Number.isNaN(ms)) return tr(lang, 'невідомо', 'onbekend');
  const d = new Date(ms); const nu = new Date();
  const zelfde = d.toDateString() === nu.toDateString();
  return (zelfde ? '' : d.toLocaleDateString(locale(lang), { day: '2-digit', month: 'short' }) + ' ') + (metTijd ? d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' }) : '');
}
export function geledenTekst(lang: Lang, iso: string | null): string {
  if (!iso) return tr(lang, 'ще ніколи', 'nog nooit');
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return tr(lang, `${s} с тому`, `${s} s geleden`);
  if (s < 3600) return tr(lang, `${Math.round(s / 60)} хв тому`, `${Math.round(s / 60)} min geleden`);
  if (s < 86400) return tr(lang, `${Math.round(s / 3600)} год тому`, `${Math.round(s / 3600)} u geleden`);
  return datumTekst(lang, iso, false);
}
export function bytesTekst(lang: Lang, n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const eenheden = ['KB', 'MB', 'GB', 'TB'];
  let v = n; let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < eenheden.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${tr(lang, eenheden[i].replace('B', 'Б'), eenheden[i])}`;
}
export const soortTekst = (lang: Lang, soort: CloudSoort) => tr(lang, CLOUD_SOORT_LABEL[soort][0], CLOUD_SOORT_LABEL[soort][1]);

export function useSmal(px = 760): boolean {
  const [smal, setSmal] = useState(() => (typeof matchMedia === 'function' ? matchMedia(`(max-width:${px}px)`).matches : false));
  useEffect(() => { if (typeof matchMedia !== 'function') return; const mq = matchMedia(`(max-width:${px}px)`); const f = () => setSmal(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [px]);
  return smal;
}
