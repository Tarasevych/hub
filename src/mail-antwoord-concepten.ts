// Antwoordconcepten (punt 3 «Розумні чернетки»): wat u onder een brief typt, gaat stil (900 ms na de laatste toets) naar de
// server en van daar naar Gmail — in DEZELFDE conversatie, dus zichtbaar in «Чернетки» bij de juiste brief en op de telefoon.
// Openen van de brief (ook na F5 of op een ander toestel) haalt het concept terug. Verzonden of leeggemaakt → lokaal én op de
// server (en in Gmail) weg, zodat het nergens meer opduikt.
import { deleteDraftRemote, getDraftRemote, saveDraftRemote, type Context } from './mail-compose-api';

/** Concept-id per (account, bericht): alleen [A-Za-z0-9_-], 8–80 tekens (servereis). */
export function antwoordId(accountId: string, messageId: string): string {
  let h = 0x811c9dc5;
  for (const c of String(accountId)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const bericht = String(messageId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  return `antw-${h.toString(36)}-${bericht}`.slice(0, 80);
}

const wacht = new Map<string, number>();
const laatst = new Map<string, string>();
// DOMParser voert niets uit (geen scripts, geen onerror van afbeeldingen), anders dan innerHTML op een los element.
const tekstVan = (html: string) => (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').trim();

/** Bewaren (gedebounced). Leeg = concept verwijderen. */
export function bewaarAntwoord(ctx: Context, o: { accountId: string; messageId: string; threadId: string; html: string; replyAll?: boolean; antwoordOp?: string }) {
  if (!o.accountId || !o.messageId) return;
  const id = antwoordId(o.accountId, o.messageId);
  window.clearTimeout(wacht.get(id));
  const leeg = !tekstVan(o.html);
  wacht.set(id, window.setTimeout(() => {
    wacht.delete(id);
    if (leeg) { if (laatst.has(id)) { laatst.delete(id); void deleteDraftRemote(ctx, id).catch(() => undefined); } return; }
    if (laatst.get(id) === o.html) return;
    laatst.set(id, o.html);
    void saveDraftRemote(ctx, { to: '', cc: '', bcc: '', subject: '', html: o.html, plainText: tekstVan(o.html), accountId: o.accountId, localId: id, ...{ threadId: o.threadId, replyToMessageId: o.antwoordOp || o.messageId, replyAll: Boolean(o.replyAll) } } as never).catch(() => { laatst.delete(id); });
  }, leeg ? 300 : 900));
}

/** Concept ophalen bij het openen van de brief; '' als er geen is. */
export async function laadAntwoord(ctx: Context, accountId: string, messageId: string): Promise<string> {
  if (!accountId || !messageId) return '';
  const id = antwoordId(accountId, messageId);
  try { const r = await getDraftRemote(ctx, id); const html = String(r?.draft?.html || ''); if (html) laatst.set(id, html); return html; } catch { return ''; }
}

/** Na verzenden: meteen weg (niet wachten op de debounce). */
export function vergeetAntwoord(ctx: Context, accountId: string, messageId: string) {
  const id = antwoordId(accountId, messageId);
  window.clearTimeout(wacht.get(id)); wacht.delete(id); laatst.delete(id);
  void deleteDraftRemote(ctx, id).catch(() => undefined);
}
