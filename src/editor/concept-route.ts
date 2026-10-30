/** Куди відкривати чернетку: новий лист, чи відповідь у тому самому ланцюжку. */

export type ConceptBericht = { id: string; labelIds?: string[] };

export type ConceptInvoer = {
  id: string;
  threadId?: string;
  subject?: string;
  to?: string;
  cc?: string;
  html?: string;
  plain?: string;
  berichten?: ConceptBericht[];
  /** Якщо тред не повернув батька, але клієнт уже знає id листа, на який це відповідь. */
  ouderId?: string;
};

export type ConceptGmail = { to: string; cc: string; subject: string; html: string; plain: string };

export type ConceptDoel =
  | { soort: 'nieuw'; gmail: ConceptGmail }
  | { soort: 'antwoord'; threadId: string; ouderId: string; html: string; plain: string; subject: string };

function htmlVan(html?: string, plain?: string): string {
  const kant = String(html || '').trim();
  if (kant) return kant;
  const tekst = String(plain || '');
  if (!tekst.trim()) return '';
  return `<p>${tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`;
}

export function losConceptOp(invoer: ConceptInvoer): ConceptDoel {
  const html = htmlVan(invoer.html, invoer.plain);
  const plain = String(invoer.plain || '');
  const ouders = (invoer.berichten || []).filter((item) => item.id !== invoer.id && !(item.labelIds || []).includes('DRAFT'));
  const ouder = ouders[ouders.length - 1];
  const ouderId = ouder?.id || (invoer.ouderId && invoer.ouderId !== invoer.id ? invoer.ouderId : '');
  if (ouderId && invoer.threadId) {
    return { soort: 'antwoord', threadId: invoer.threadId, ouderId, html, plain, subject: invoer.subject || '' };
  }
  return {
    soort: 'nieuw',
    gmail: { to: invoer.to || '', cc: invoer.cc || '', subject: invoer.subject || '', html, plain },
  };
}
