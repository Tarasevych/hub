// Hoofd3: bij «niet nieuwer» de concrete oorzaak noemen (geen raadspel): versie van het pakket, de actieve versie en waar die vandaan komt.
import { tr, type Lang, type StandKort } from './types';

const BRON: Record<string, [string, string]> = {
  runs: ['журнал встановлень на сервері', 'installatielogboek op de server'],
  status: ['файл стану встановлення на сервері', 'statusbestand van de installatie op de server'],
  releasemap: ['тека current на сервері', 'map current op de server'],
  versie: ['файл UITROL-VERSIE програми, що зараз працює', 'bestand UITROL-VERSIE van de draaiende app'],
  events: ['події встановлення', 'installatiegebeurtenissen'], voorstellen: ['список завантажених пакетів', 'lijst geüploade pakketten'],
  vorige: ['попередня версія (для повернення)', 'vorige versie (voor terugdraaien)'], nazorg: ['перевірка після встановлення', 'nazorg na installatie'],
  github: ['GitHub', 'GitHub'], backups: ['резервні копії', 'back-ups'],
};

export function nietNieuwerUitleg(lang: Lang, pakket: string, actief: string, stand?: Pick<StandKort, 'gebruikteBron' | 'hoofdbron' | 'tijd'> | null): string {
  const b = stand?.gebruikteBron || stand?.hoofdbron || 'versie';
  const bron = BRON[b] || [b, b];
  const gelijk = pakket === actief;
  const d = stand?.tijd ? new Date(stand.tijd) : null;
  const tijd = d && !Number.isNaN(d.getTime()) ? d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return tr(lang,
    `Версія пакета: ${pakket || '—'}. Зараз працює: ${actief || '—'} (джерело: ${bron[0]}${tijd ? `, ${tijd}` : ''}). ${gelijk ? 'Цей самий пакет уже встановлено.' : 'Пакет старіший за встановлений.'} Сервер також не встановлює версію, не новішу за найвищу будь-коли встановлену (файл laatste-versie), навіть після повернення назад.`,
    `Versie van het pakket: ${pakket || '—'}. Nu actief: ${actief || '—'} (bron: ${bron[1]}${tijd ? `, ${tijd}` : ''}). ${gelijk ? 'Dit pakket is al geïnstalleerd.' : 'Het pakket is ouder dan de geïnstalleerde versie.'} De server installeert ook geen versie die niet nieuwer is dan de hoogste ooit geïnstalleerde (bestand laatste-versie), ook niet na terugdraaien.`);
}
