// Afstemming vNext — teksthulpjes (uk/nl), zelfde stijl als src/cloud-vnext/tekst.ts. Eén plek voor foutteksten zodat elke
// servercode een MENSELIJKE uitleg krijgt; onbekende codes tonen de code zelf (eerlijk, nooit een verzonnen succes).
import { useEffect, useState } from 'react';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string): string => (lang === 'uk' ? uk : nl);

const FOUT: Record<string, [string, string]> = {
  KAART_ONBEKEND: ['Картку не знайдено.', 'Kaart niet gevonden.'],
  VERSIE_CONFLICT: ['Хтось щойно змінив цю картку. Нижче — свіжа версія; ваші правки не втрачено.', 'Iemand wijzigde deze kaart zojuist. Hieronder de verse versie; uw wijzigingen zijn niet verloren.'],
  FASE_ONGELDIG: ['Такий перехід етапу неможливий.', 'Deze fase-overgang bestaat niet.'],
  FASE_BEWIJS_ONTBREEKT: ['Без доказів з production цей етап не ставиться — спершу додайте перевірку.', 'Zonder productiebewijs kan deze fase niet — voeg eerst een controle toe.'],
  FASE_EIGENAAR_VEREIST: ['Цей крок може зробити лише власник.', 'Alleen de eigenaar kan deze stap zetten.'],
  CRITERIUM_ONBEKEND: ['Критерій не знайдено.', 'Criterium niet gevonden.'],
  BEWIJS_VEREIST: ['«Пройдено» ставиться лише з доказом.', '«Geslaagd» kan alleen mét bewijsstuk.'],
  KOPPEL_ONBEKEND: ['Зв’язок не знайдено.', 'Koppeling niet gevonden.'],
  KOPPEL_ZELF: ['Картку не можна пов’язати саму з собою.', 'Een kaart kan niet aan zichzelf gekoppeld worden.'],
  KOPPEL_BESTAAT: ['Такий зв’язок уже є.', 'Deze koppeling bestaat al.'],
  CONFLICT_OPEN: ['Є відкритий конфлікт — спершу рішення власника.', 'Er staat een conflict open — eerst het eigenaarsbesluit.'],
  IMPORT_ONGELDIG: ['Файл не вдалося розібрати. Сирий текст збережено в попередньому перегляді.', 'Het bestand kon niet worden gelezen. De ruwe tekst blijft in het voorbeeld staan.'],
  IMPORT_TE_GROOT: ['Файл завеликий для імпорту (до 512 КіБ у цій версії).', 'Het bestand is te groot voor import (tot 512 KiB in deze versie).'],
  FORMAAT_ONBEKEND: ['Підтримуються .json, .md і .txt; PDF/зображення — заплановано.', 'Ondersteund: .json, .md en .txt; PDF/beeld is gepland.'],
  TEKST_TE_LANG: ['Текст задовгий.', 'De tekst is te lang.'],
  RELEASE_ONBEKEND: ['Випуск не знайдено.', 'Release niet gevonden.'],
  IDEMPOTENTIE_BOTSING: ['Той самий ключ уже використано для іншої картки.', 'Deze idempotentiesleutel hoort al bij een andere kaart.'],
  AGENT_MAG_NIET: ['Агент не може сам схвалювати чи приймати — це рішення людини.', 'Een agent mag niet zelf goedkeuren of aanvaarden — dat is een menselijk besluit.'],
  OWNER_CLOUD_SESSION_REQUIRED: ['Потрібна сесія власника.', 'Een eigenaarsessie is vereist.'],
  ACCOUNT_NOT_APPROVED: ['Обліковий запис ще не схвалено.', 'Dit account is nog niet goedgekeurd.'],
  NOG_NIET_GEBOUWD: ['Цей розділ ще будується.', 'Dit onderdeel is nog in aanbouw.'],
};
export const foutTekst = (lang: Lang, code: string): string => { const f = FOUT[code]; return f ? tr(lang, f[0], f[1]) : tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`); };

export const datumTekst = (lang: Lang, iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export function geledenTekst(lang: Lang, iso: string): string {
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return '—';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return tr(lang, 'щойно', 'zojuist');
  if (m < 60) return tr(lang, `${m} хв тому`, `${m} min geleden`);
  const u = Math.round(m / 60); if (u < 48) return tr(lang, `${u} год тому`, `${u} uur geleden`);
  return tr(lang, `${Math.round(u / 24)} дн тому`, `${Math.round(u / 24)} dagen geleden`);
}
/** Smal scherm (telefoon): zelfde grens als de rest van de vNext-pagina's. */
export function useSmal(): boolean {
  const [smal, setSmal] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth <= 760));
  useEffect(() => { const f = () => setSmal(window.innerWidth <= 760); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return smal;
}
