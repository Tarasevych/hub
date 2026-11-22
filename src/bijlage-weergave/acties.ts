// Спільний перегляд вкладень, етап 1 (Grok: hub.tarasevych.com). Plaatsen voor acties: één hoofdactie zichtbaar, de rest
// onder «⋯». Alleen acties die de bron ECHT aanbiedt (geen nepknoppen); de volgorde hangt af van de soort bestand.
import type { SoortSleutel, Tweetalig } from './soort';

export type ActieSleutel = 'bewerk' | 'download' | 'opslaan' | 'druk' | 'delen' | 'minimaliseer';
export type Actie = { sleutel: ActieSleutel; label: Tweetalig; uitvoeren: () => void };
export type Beschikbaar = Partial<Record<ActieSleutel, () => void>>;

/** Label voor «bewerken» per soort, zonder Engelse woorden. */
export function bewerkLabel(soort: SoortSleutel, formaat: string): Tweetalig {
  if (soort === 'rekening' || soort === 'contract' || formaat === 'PDF') return ['Підписати або позначити', 'Ondertekenen of aantekenen'];
  if (soort === 'tabel') return ['Редагувати таблицю', 'Tabel bewerken'];
  if (soort === 'foto') return ['Редагувати зображення', 'Afbeelding bewerken'];
  if (soort === 'presentatie') return ['Редагувати слайди', 'Dia’s bewerken'];
  if (soort === 'tekst') return ['Редагувати текст', 'Tekst bewerken'];
  if (soort === 'archief') return ['Змінити копію архіву', 'Kopie van het archief wijzigen'];
  return ['Редагувати', 'Bewerken'];
}

const LABELS: Record<Exclude<ActieSleutel, 'bewerk'>, Tweetalig> = {
  download: ['Завантажити', 'Downloaden'],
  opslaan: ['Зберегти у сховище', 'Opslaan in de opslag'],
  druk: ['Друк', 'Afdrukken'],
  delen: ['Поділитися', 'Delen'],
  minimaliseer: ['Згорнути', 'Minimaliseren'],
};

/** Volgorde per soort: wat bovenaan staat wordt de hoofdactie. */
const VOLGORDE: Record<SoortSleutel, ActieSleutel[]> = {
  rekening: ['bewerk', 'download', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  contract: ['bewerk', 'download', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  foto: ['delen', 'download', 'bewerk', 'opslaan', 'druk', 'minimaliseer'],
  tabel: ['bewerk', 'download', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  document: ['download', 'bewerk', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  tekst: ['download', 'bewerk', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  archief: ['download', 'opslaan', 'bewerk', 'druk', 'delen', 'minimaliseer'],
  bericht: ['download', 'opslaan', 'druk', 'delen', 'bewerk', 'minimaliseer'],
  presentatie: ['download', 'bewerk', 'opslaan', 'druk', 'delen', 'minimaliseer'],
  geluid: ['download', 'opslaan', 'delen', 'bewerk', 'druk', 'minimaliseer'],
  video: ['download', 'opslaan', 'delen', 'bewerk', 'druk', 'minimaliseer'],
  onbekend: ['download', 'opslaan', 'bewerk', 'druk', 'delen', 'minimaliseer'],
};

export function actiesVoor(soort: SoortSleutel, formaat: string, beschikbaar: Beschikbaar): { hoofd: Actie | null; overig: Actie[] } {
  const lijst: Actie[] = [];
  for (const s of VOLGORDE[soort]) {
    const f = beschikbaar[s];
    if (!f) continue;
    lijst.push({ sleutel: s, label: s === 'bewerk' ? bewerkLabel(soort, formaat) : LABELS[s], uitvoeren: f });
  }
  // «Згорнути» is nooit de hoofdactie
  const i = lijst.findIndex((a) => a.sleutel !== 'minimaliseer');
  if (i < 0) return { hoofd: null, overig: lijst };
  const hoofd = lijst[i];
  return { hoofd, overig: lijst.filter((_, k) => k !== i) };
}
