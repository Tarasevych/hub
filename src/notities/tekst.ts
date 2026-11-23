// Teksten en kleine hulpjes van de notitiepagina (uk/nl), op één plek.
import { useEffect, useState } from 'react';
import type { NotitieKleur, NotitieSoort } from '../../shared/notities-vnext-model';
import { weigeringZin } from '../../shared/weigering-tekst';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const locale = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');

export const SOORT_LABEL: Record<NotitieSoort, [string, string]> = { tekst: ['Нотатка', 'Notitie'], lijst: ['Чекліст', 'Checklist'], code: ['Код', 'Code'], koppeling: ['Посилання', 'Koppeling'] };
export const KLEUR_LABEL_VN: Record<NotitieKleur, [string, string]> = { geen: ['без кольору', 'geen kleur'], geel: ['жовтий', 'geel'], groen: ['зелений', 'groen'], blauw: ['синій', 'blauw'], roze: ['рожевий', 'roze'], grijs: ['сірий', 'grijs'] };

/** Foutcodes van de server in gewone woorden. Onbekende code: de code zelf, zodat niets stil verdwijnt. */
export function foutTekst(lang: Lang, code: string): string {
  const t: Record<string, [string, string]> = {
    VERSIE_VEROUDERD: ['Нотатку тим часом змінено в іншому місці.', 'De notitie is intussen elders gewijzigd.'],
    NIET_GEVONDEN: ['Нотатку не знайдено (можливо, її вже видалено).', 'Notitie niet gevonden (misschien al verwijderd).'],
    TITEL_ONGELDIG: ['Потрібна назва (до 300 символів).', 'Een titel is nodig (hoogstens 300 tekens).'],
    INHOUD_TE_LANG: ['Текст задовгий (понад 200 000 символів).', 'De tekst is te lang (meer dan 200 000 tekens).'],
    MAP_ONBEKEND: ['Такої теки немає.', 'Die map bestaat niet.'],
    BESTAAT_AL: ['Тека з такою назвою вже є.', 'Er is al een map met die naam.'],
    NAAM_ONGELDIG: ['Назва теки: 1–80 символів.', 'Mapnaam: 1 tot 80 tekens.'],
    TE_VEEL: ['Забагато тек (максимум 60).', 'Te veel mappen (hoogstens 60).'],
    IMPORT_ONGELDIG: ['Файли не прийнято: до 200 файлів, разом до 4 МБ.', 'Bestanden niet aanvaard: hoogstens 200 bestanden, samen 4 MB.'],
    NOTITIES_MIGRATIE_ONTBREEKT: ['На сервері ще не застосовано міграцію 0127 для нотаток.', 'Op de server is migratie 0127 voor notities nog niet uitgevoerd.'],
    MCP_SERVICE_REQUIRED: ['Нотатки доступні лише після входу.', 'Notities zijn alleen beschikbaar na aanmelden.'],
    ACCOUNT_NOT_APPROVED: ['Обліковий запис ще не підтверджено.', 'Het account is nog niet goedgekeurd.'],
    LEEG: ['порожній файл', 'leeg bestand'], TE_GROOT: ['файл завеликий', 'bestand te groot'], ONBEKEND_FORMAAT: ['невідомий формат (лише .md, .txt, .json)', 'onbekend formaat (alleen .md, .txt, .json)'],
    JSON_ONGELDIG: ['JSON не читається', 'JSON onleesbaar'],
    // SEC-002 (g04): de zoekvraag liep tegen de tijdgrens van 5 s aan; de lijst zelf werkt gewoon.
    ZOEKEN_TE_ZWAAR: ['Пошук зайняв забагато часу й був зупинений. Уточніть запит: коротші слова або менше слів.', 'Het zoeken duurde te lang en is gestopt. Maak de vraag preciezer: kortere of minder woorden.'],
    BEVESTIGING_VEREIST: ['Підтвердьте дію запису до календаря перед збереженням прив’язки.', 'Bevestig eerst de schrijfactie met de agenda voordat u de koppeling bewaart.'],
    EVENT_NIET_GEVONDEN: ['Подію календаря в поточному просторі не знайдено.', 'De agenda-afspraak is in de huidige ruimte niet gevonden.'],
    BESTAND_NIET_GEVONDEN: ['Файл Сховища в поточному просторі не знайдено.', 'Het Opslag-bestand is in de huidige ruimte niet gevonden.'],
    AGENDA_SCHRIJFRECHT_ONTBREEKT: ['Немає дозволу на запис у календар. Розширте доступ у розділі «Календар».', 'Geen schrijfrecht in de agenda. Breid de toegang uit op de agendapagina.'],
    CALDAV_GEEN_SCHRIJFRECHT: ['Цей зовнішній календар доступний лише для читання.', 'Deze externe agenda is uitsluitend leesbaar.'],
    GEEN_OPEN_PUNTEN: ['У цій нотатці немає невиконаних пунктів списку.', 'Deze notitie bevat geen openstaande lijstpunten.'],
    IDEMPOTENTIE_SLEUTEL_ONGELDIG: ['Недійсний ключ запиту. Спробуйте ще раз.', 'Ongeldige verzoeksleutel. Probeer het opnieuw.'],
    TAKEN_LIMIET_BEREIKT: ['Досягнуто межі 50 прив’язаних завдань для однієї нотатки.', 'De grens van 50 gekoppelde taken voor één notitie is bereikt.'],
    BESTANDEN_LIMIET_BEREIKT: ['Досягнуто межі 50 прикріплених файлів для однієї нотатки.', 'De grens van 50 gekoppelde bestanden voor één notitie is bereikt.'],
    CLOUD_GEDEELD_NIET_VOOR_TECHNISCHE_NOTITIE: ['Особисті файли Сховища не прикріплюються до нотаток технічного простору.', 'Persoonlijke Opslag-bestanden worden niet aan notities in de technische ruimte gekoppeld.'],
    RUIMTE_VERSCHILT: ['Нотатка та календар перебувають у різних просторах.', 'De notitie en de agenda bevinden zich in verschillende ruimtes.'],
  };
  const p = t[code];
  if (p) return tr(lang, p[0], p[1]);
  // SEC-002 (slot «u»): bekende weigeringen (rol «лише перегляд», server bezet …) — één tekst voor de hele site, shared/weigering-tekst.ts.
  const w = weigeringZin(lang, code); if (w) return w;
  if (/SESSION|401|403/.test(code)) return tr(lang, 'Нотатки доступні лише після входу.', 'Notities zijn alleen beschikbaar na aanmelden.');
  return tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`);
}

export function datumTekst(lang: Lang, iso: string, kort = true): string {
  const ms = Date.parse(iso); if (Number.isNaN(ms)) return '';
  const d = new Date(ms); const nu = new Date();
  const zelfdeDag = d.toDateString() === nu.toDateString();
  if (kort && zelfdeDag) return `${tr(lang, 'сьогодні', 'vandaag')} ${d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' })}`;
  const gisteren = new Date(nu); gisteren.setDate(nu.getDate() - 1);
  if (kort && d.toDateString() === gisteren.toDateString()) return tr(lang, 'учора', 'gisteren');
  return d.toLocaleDateString(locale(lang), { day: '2-digit', month: kort ? 'short' : '2-digit', year: d.getFullYear() === nu.getFullYear() && kort ? undefined : 'numeric' });
}

/** Smal (telefoon) of breed: één mediaquery, als haak. */
export function useSmal(px = 760): boolean {
  const [smal, setSmal] = useState(() => (typeof matchMedia === 'function' ? matchMedia(`(max-width:${px}px)`).matches : false));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(`(max-width:${px}px)`); const f = () => setSmal(mq.matches);
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, [px]);
  return smal;
}
export const inVeld = (el: Element | null) => Boolean(el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable));
