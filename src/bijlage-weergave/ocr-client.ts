// Спільний перегляд вкладень, етап 3, розділ 15.6 (CONSOL-001 / SPIL-WEERGAVE):
// клієнтський помічник для розпізнавання тексту зі сканів та зображень через вузький маршрут
// POST /api/owner/bijlage-weergave/ocr-tekst із пам’яттю результатів у межах сеансу.

import { api, ApiError } from '../platform/client';
import { kies, type Taal, type Tweetalig } from './soort';

export const MAX_SCAN_OCR_BYTES = 20 * 1024 * 1024;
const SESSIE_MAX_ITEMS = 200;

const SCAN_AFBEELDING_MIME = /^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const SCAN_EXTENSIES = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff']);

/** Чи придатний файл для серверного розпізнавання тексту зі скану (PDF або растрове зображення до 20 МБ). */
export function kanScanHerkennen(naam: string, contentType: string, grootte: number): boolean {
  const bytes = Number(grootte || 0);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_SCAN_OCR_BYTES) return false;
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (mime.includes('svg')) return false;
  const basis = String(naam || '').split(/[\\/]/).pop() || '';
  const punt = basis.lastIndexOf('.');
  const ext = punt > 0 ? basis.slice(punt + 1).toLowerCase() : '';
  if (ext === 'svg') return false;
  return mime === 'application/pdf' || SCAN_AFBEELDING_MIME.test(mime) || SCAN_EXTENSIES.has(ext);
}

export type BijlageOcrInvoer =
  | {
      bron: 'mail';
      context?: Record<string, string>;
      accountId: string;
      messageId: string;
      attachmentId: string;
      filename: string;
      contentType: string;
    }
  | {
      bron: 'cloud';
      context?: Record<string, string>;
      bestandId: string;
      filename: string;
      contentType: string;
    };

export type BijlageOcrAntwoord = {
  ok: boolean;
  status: string;
  herkomst: string;
  tekst: string;
  paginas: number;
};

const sessieGeheugen = new Map<string, Promise<BijlageOcrAntwoord>>();

export function wisBijlageOcrGeheugen(): void {
  sessieGeheugen.clear();
}

function sleutelVoor(invoer: BijlageOcrInvoer): string {
  const tab = String(invoer.context?.tabContext || invoer.context?.ecosystemTabContext || '');
  if (invoer.bron === 'mail') {
    return `mail|${tab}|${invoer.accountId}|${invoer.messageId}|${invoer.attachmentId}`;
  }
  return `cloud|${tab}|${invoer.bestandId}`;
}

const TYDELIJKE_FOUTEN = new Set(['fout', 'te_veel_verzoeken', 'geen_toegang']);

export function vraagBijlageOcrTekst(invoer: BijlageOcrInvoer): Promise<BijlageOcrAntwoord> {
  const sleutel = sleutelVoor(invoer);
  const bestaand = sessieGeheugen.get(sleutel);
  if (bestaand) return bestaand;

  const taak = (async (): Promise<BijlageOcrAntwoord> => {
    try {
      const payload = invoer.bron === 'mail'
        ? {
            ...(invoer.context || {}),
            bron: 'mail',
            accountId: invoer.accountId,
            messageId: invoer.messageId,
            attachmentId: invoer.attachmentId,
            filename: invoer.filename,
            contentType: invoer.contentType,
          }
        : {
            ...(invoer.context || {}),
            bron: 'cloud',
            bestandId: invoer.bestandId,
            filename: invoer.filename,
            contentType: invoer.contentType,
          };
      const r = await api.post('/api/owner/bijlage-weergave/ocr-tekst', payload);
      const d = (r.data || {}) as Partial<BijlageOcrAntwoord>;
      const status = typeof d.status === 'string' && d.status ? d.status : 'fout';
      return {
        ok: Boolean(d.ok) && status === 'ok',
        status,
        herkomst: typeof d.herkomst === 'string' ? d.herkomst : 'geen',
        tekst: typeof d.tekst === 'string' ? d.tekst : '',
        paginas: Number(d.paginas || 0),
      };
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 429) return { ok: false, status: 'te_veel_verzoeken', herkomst: 'geen', tekst: '', paginas: 0 };
        if (e.status === 401 || e.status === 403) return { ok: false, status: 'geen_toegang', herkomst: 'geen', tekst: '', paginas: 0 };
        if (e.status === 404 && e.message === 'BIJLAGE_WEERGAVE_UIT') {
          return { ok: false, status: 'ocr_niet_beschikbaar', herkomst: 'geen', tekst: '', paginas: 0 };
        }
      }
      return { ok: false, status: 'fout', herkomst: 'geen', tekst: '', paginas: 0 };
    }
  })();

  if (sessieGeheugen.size >= SESSIE_MAX_ITEMS) {
    const oudste = sessieGeheugen.keys().next().value;
    if (oudste) sessieGeheugen.delete(oudste);
  }
  sessieGeheugen.set(sleutel, taak);
  void taak.then((uit) => {
    if (TYDELIJKE_FOUTEN.has(uit.status)) sessieGeheugen.delete(sleutel);
  });
  return taak;
}

const UITLEG_PER_STATUS: Record<string, Tweetalig> = {
  leeg: [
    'На цьому скані чи зображенні не виявлено розбірливого тексту.',
    'Op deze scan of afbeelding is geen leesbare tekst gevonden.',
  ],
  te_groot: [
    'Файл перевищує межу 20 МБ для розпізнавання тексту зі скану.',
    'Het bestand overschrijdt de grens van 20 MB voor tekstherkenning uit een scan.',
  ],
  niet_ondersteund: [
    'Цей формат файла не підтримує розпізнавання тексту зі скану.',
    'Dit bestandsformaat ondersteunt geen tekstherkenning uit een scan.',
  ],
  ocr_niet_beschikbaar: [
    'Засіб розпізнавання сканів наразі не увімкнено на сервері.',
    'De tekstherkenning voor scans is momenteel niet ingeschakeld op de server.',
  ],
  geen_toegang: [
    'Немає доступу до цього файла у поточному просторі.',
    'Geen toegang tot dit bestand in de huidige ruimte.',
  ],
  te_veel_verzoeken: [
    'Забагато запитів на розпізнавання поспіль — зачекайте хвилину й спробуйте знову.',
    'Te veel herkenningsverzoeken achter elkaar — wacht een minuut en probeer opnieuw.',
  ],
  fout: [
    'Не вдалося розпізнати текст скану. Оригінал файла не змінено — спробуйте ще раз.',
    'De tekst uit de scan kon niet worden herkend. Het originele bestand is ongewijzigd — probeer opnieuw.',
  ],
};

/** Чесне двомовне пояснення стану розпізнавання тексту зі скану. */
export function ocrFoutUitleg(status: string, taal: Taal): string {
  const paar = UITLEG_PER_STATUS[status] || UITLEG_PER_STATUS.fout;
  return kies(taal, paar);
}
