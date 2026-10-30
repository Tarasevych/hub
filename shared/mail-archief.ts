// «Архів» у пошті: лист поза Вхідними, не чернетка, не в кошику й не в спамі.
// Надісланий лист (мітка SENT) належить до архіву лише тоді, коли він адресований самому відправнику:
// лист собі після «Архівувати» інакше зникав би з «Архіву». Звичайні надіслані іншим людям лишаються в «Надісланих».
// Той самий зміст має запит до Gmail: `{-label:sent to:me cc:me}`.

export const ARCHIEF_NIET = ['INBOX', 'DRAFT', 'TRASH', 'SPAM'] as const;
export const ARCHIEF_GMAIL_DELEN = ['-label:inbox', '-label:drafts', '-label:trash', '-label:spam', '{-label:sent to:me cc:me}'] as const;
export const ARCHIEF_GMAIL_QUERY = ARCHIEF_GMAIL_DELEN.join(' ');

const adressen = (waarde: unknown): string[] => String(waarde || '').toLocaleLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}/g) || [];

export type ArchiefInvoer = { labelIds?: readonly string[] | null; from?: string | null; to?: string | null; cc?: string | null; eigenAdres?: string | null };

export function isGearchiveerd(item: ArchiefInvoer): boolean {
  const labels = item.labelIds || [];
  if (ARCHIEF_NIET.some((label) => labels.includes(label))) return false;
  if (!labels.includes('SENT')) return true;
  const ontvangers = new Set([...adressen(item.to), ...adressen(item.cc)]);
  const eigen = [...adressen(item.eigenAdres), ...adressen(item.from)];
  return eigen.some((adres) => ontvangers.has(adres));
}
