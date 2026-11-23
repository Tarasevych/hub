// Спільний перегляд вкладень, етап 1 (Grok: hub.tarasevych.com). Technische gegevens voor «Подробиці»: alleen Oekraïens of
// Nederlands, nooit midden op het scherm.
import { formaatVan, grootteTekst, kies, type Taal, type Tweetalig } from './soort';
import type { Vertrouwen } from './vertrouwen';

export type Rij = { label: string; waarde: string };

const WERKELIJK: Record<string, Tweetalig> = {
  pdf: ['документ для друку', 'afdrukdocument'], png: ['зображення', 'afbeelding'], jpeg: ['фото', 'foto'], gif: ['анімація', 'animatie'], webp: ['зображення', 'afbeelding'],
  heic: ['фото з телефона', 'telefoonfoto'], avif: ['зображення', 'afbeelding'], mp4: ['відео або звук', 'video of geluid'], zip: ['стиснений архів', 'gecomprimeerd archief'],
  ole: ['старий офісний файл', 'oud kantoorbestand'], rar: ['архів', 'archief'], '7z': ['архів', 'archief'], gzip: ['стиснений файл', 'gecomprimeerd bestand'],
  programma: ['програма', 'programma'], tekst: ['текст', 'tekst'], binair: ['двійкові дані', 'binaire gegevens'],
};

export function technischeRijen(p: { taal: Taal; naam: string; contentType: string; grootte: number; vertrouwen?: Vertrouwen | null; breedte?: number; hoogte?: number }): Rij[] {
  const t = (uk: string, nl: string) => kies(p.taal, [uk, nl]);
  const rijen: Rij[] = [
    { label: t('Назва', 'Naam'), waarde: p.naam || '—' },
    { label: t('Формат за назвою', 'Formaat volgens de naam'), waarde: formaatVan(p.naam) || '—' },
    { label: t('Розмір', 'Grootte'), waarde: grootteTekst(p.grootte, p.taal) },
    { label: t('Заявлений тип', 'Opgegeven soort'), waarde: (p.contentType || '—').split(';')[0] },
  ];
  if (p.vertrouwen) rijen.push({ label: t('Справжній тип за вмістом', 'Echte soort volgens de inhoud'), waarde: kies(p.taal, WERKELIJK[p.vertrouwen.werkelijk] || ['невідомо', 'onbekend']) });
  if (p.breedte && p.hoogte) rijen.push({ label: t('Розміри зображення', 'Afmetingen'), waarde: `${p.breedte} × ${p.hoogte} ${t('пікс.', 'px')}` });
  return rijen;
}
