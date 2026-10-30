// Nep-Gmail voor e2e-tests van mail.*: een postvak MET TOESTAND in het geheugen van de test, achter page.route().
// Ondersteunt lijst per map/label/zoekopdracht, één lijst/draad openen, toestandsacties (enkel en in bulk: gelezen, ster,
// archiveren, prullenbak, terugzetten, spam, labels), versturen (naar uzelf → ook in Inbox), concepten en labels met tellers.
// Onbekende /api/owner/mail/*-aanroepen worden vastgelegd (onbekend[]) en met {ok:true} beantwoord, zodat een test ziet welke
// functies nog niet gedekt zijn zonder dat de pagina breekt.
import type { Page, Route } from 'playwright-core';

export type NepBericht = {
  id: string; threadId: string; from: string; to: string; subject: string; snippet: string; html: string; text: string;
  receivedAt: number; labelIds: string[]; unread: boolean; starred: boolean; sizeBytes: number;
  attachments?: Array<{ providerAttachmentId: string; filename: string; mimeType: string; sizeBytes: number }>;
};

export function nepGmail(eigenAdres = 'ik@example.test') {
  const berichten = new Map<string, NepBericht>();
  const concepten = new Map<string, Record<string, unknown>>();
  const verzonden: Array<Record<string, unknown>> = [];
  const onbekend: string[] = [];
  const acties: string[] = [];
  let teller = 0;
  const nu = Date.now();
  const nieuw = (b: Partial<NepBericht> & { subject: string }) => {
    const id = b.id ?? `m${++teller}`;
    const m: NepBericht = {
      id, threadId: b.threadId ?? `t-${id}`, from: b.from ?? `Відправник <afz${teller}@example.test>`, to: b.to ?? eigenAdres, subject: b.subject,
      snippet: b.snippet ?? `${b.subject} — короткий зміст.`, html: b.html ?? `<p>${b.subject}</p><p>Текст листа для перевірки.</p>`, text: b.text ?? `${b.subject}\nТекст листа для перевірки.`,
      receivedAt: b.receivedAt ?? nu - teller * 3_600_000, labelIds: b.labelIds ?? ['INBOX', 'UNREAD'], unread: b.unread ?? true, starred: b.starred ?? false,
      sizeBytes: b.sizeBytes ?? 2400, attachments: b.attachments ?? [],
    };
    m.unread = m.labelIds.includes('UNREAD'); m.starred = m.labelIds.includes('STARRED');
    berichten.set(id, m);
    return m;
  };
  const zet = (m: NepBericht, actie: string, label = '') => {
    const l = new Set(m.labelIds);
    switch (actie) {
      case 'read': l.delete('UNREAD'); break;
      case 'unread': l.add('UNREAD'); break;
      case 'star': l.add('STARRED'); break;
      case 'unstar': l.delete('STARRED'); break;
      case 'archive': l.delete('INBOX'); break;
      case 'inbox': l.add('INBOX'); l.delete('TRASH'); l.delete('SPAM'); break;
      case 'trash': l.add('TRASH'); l.delete('INBOX'); break;
      case 'untrash': l.delete('TRASH'); l.add('INBOX'); break;
      case 'spam': l.add('SPAM'); l.delete('INBOX'); break;
      case 'unspam': l.delete('SPAM'); l.add('INBOX'); break;
      case 'label': if (label) l.add(label); break;
      case 'unlabel': if (label) l.delete(label); break;
      case 'move': if (label) { l.add(label); if (label === 'INBOX') { l.delete('TRASH'); l.delete('SPAM'); } else l.delete('INBOX'); } break;
    }
    m.labelIds = [...l]; m.unread = l.has('UNREAD'); m.starred = l.has('STARRED');
    acties.push(`${actie}:${m.id}${label ? `:${label}` : ''}`);
  };
  const filter = (labelId: string, q: string, metSpam: boolean) => [...berichten.values()].filter((m) => {
    const l = m.labelIds;
    if (labelId && labelId !== 'SCHEDULED' && !l.includes(labelId)) return false;
    if (labelId === 'SCHEDULED') return false;
    if (!metSpam && labelId !== 'TRASH' && labelId !== 'SPAM' && (l.includes('TRASH') || l.includes('SPAM'))) return false;
    if (/is:unread/.test(q) && !l.includes('UNREAD')) return false;
    if (/is:read/.test(q) && l.includes('UNREAD')) return false;
    if (/is:starred/.test(q) && !l.includes('STARRED')) return false;
    if (/-(?:in|label):inbox/.test(q) && l.includes('INBOX')) return false;
    // Gmail-groep {-label:sent to:me cc:me}: niet verzonden, óf aan mezelf gericht (zoals in het echte «Архів»).
    if (/\{-label:sent to:me cc:me\}/.test(q)) { if (l.includes('SENT') && !String(m.to || '').toLowerCase().includes(eigenAdres.toLowerCase())) return false; }
    else if (/-label:sent/.test(q) && l.includes('SENT')) return false;
    if (/-label:trash/.test(q) && l.includes('TRASH')) return false;
    if (/-label:spam/.test(q) && l.includes('SPAM')) return false;
    if (/-label:drafts/.test(q) && l.includes('DRAFT')) return false;
    if (/in:snoozed/.test(q)) return false;
    const vrij = q.replace(/\{[^}]*\}/g, '').replace(/-?(?:is|in|label|from|to|cc|subject|category|has):\S+/g, '').trim().toLowerCase();
    if (vrij && !`${m.subject} ${m.snippet} ${m.from}`.toLowerCase().includes(vrij)) return false;
    return true;
  }).sort((a, b) => b.receivedAt - a.receivedAt);
  const publiek = (m: NepBericht) => ({ id: m.id, threadId: m.threadId, from: m.from, to: m.to, subject: m.subject, snippet: m.snippet, receivedAt: m.receivedAt, labelIds: m.labelIds, unread: m.unread, starred: m.starred, sizeBytes: m.sizeBytes, unsubscribe: null, classificationSignals: {}, hasAttachments: !!m.attachments?.length });
  const LABELS = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT', 'UNREAD'];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const lichaam = (route: Route): Record<string, any> => { try { return JSON.parse(route.request().postData() || '{}'); } catch { return {}; } };
  const account = { id: 'acc-1', email: eigenAdres, displayName: 'Тестовий власник', status: 'connected', accountRole: 'primary' };

  async function koppel(page: Page) {
    await page.route('**/api/owner/mail/**', async (route) => {
      const pad = new URL(route.request().url()).pathname.replace('/api/owner/mail/', '');
      const b = lichaam(route);
      if (pad === 'google-suite/accounts') return json(route, { provider: 'google_gmail', connectEnabled: true, activeAccountId: account.id, account, accounts: [account] });
      if (pad === 'google-suite/messages') {
        const lijst = filter(String(b.labelId || ''), String(b.query || b.exactQuery || ''), b.includeSpamTrash === true);
        const max = Math.min(100, Number(b.maxResults) || 25);
        const start = Number(b.pageToken || 0) || 0;
        const deel = lijst.slice(start, start + max);
        return json(route, { source: 'live_on_demand', persisted: false, account, labelId: b.labelId || '', query: b.query || '', maxResults: max, messages: deel.map(publiek), nextPageToken: start + max < lijst.length ? String(start + max) : '', resultSizeEstimate: lijst.length, observedAt: Date.now() });
      }
      if (pad === 'google-suite/message' || pad === 'google-suite/preview') {
        const m = berichten.get(String(b.messageId || b.id || ''));
        return m ? json(route, { ok: true, message: { ...publiek(m), html: m.html, text: m.text, attachments: m.attachments ?? [] } }) : json(route, { error: 'MESSAGE_NOT_FOUND' }, 404);
      }
      if (pad === 'google-suite/thread') {
        const id = String(b.threadId || '');
        const msgs = [...berichten.values()].filter((m) => m.threadId === id || m.id === b.messageId);
        return json(route, { ok: true, thread: { id, messages: msgs.map((m) => ({ ...publiek(m), html: m.html, text: m.text, attachments: m.attachments ?? [] })) } });
      }
      if (pad === 'google-suite/labels') {
        const labels = LABELS.map((id) => { const l = [...berichten.values()].filter((m) => m.labelIds.includes(id)); return { id, name: id, type: 'system', messagesTotal: l.length, messagesUnread: l.filter((m) => m.unread).length, threadsTotal: l.length, threadsUnread: l.filter((m) => m.unread).length }; });
        return json(route, { ok: true, labels, activity: {} });
      }
      if (pad === 'google-suite/state-intents/submit') {
        const m = berichten.get(String(b.messageId));
        if (m) zet(m, String(b.action));
        const intent = { outboxId: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, intentId: b.intentId, accountId: account.id, messageId: b.messageId, stateKey: 'inInbox', action: b.action, desired: true, status: 'succeeded', capability: 'supported', providerWrite: 'done', attemptCount: 1, maxAttempts: 5, retryAt: 0, acceptedAt: Date.now(), providerObservedAt: Date.now(), completedAt: Date.now(), errorCode: '', rollbackRequired: false, converged: true };
        return json(route, { ok: true, intent });
      }
      if (pad === 'google-suite/state-intents/status') return json(route, { ok: true, intents: (b.outboxIds || []).map((outboxId: string) => ({ outboxId, status: 'succeeded', converged: true })) });
      if (pad === 'google-suite/state-bulk/submit') {
        const ids: string[] = Array.isArray(b.messageIds) ? b.messageIds : b.selection ? filter(b.selection.labelId || (b.selection.category === 'inbox' ? 'INBOX' : b.selection.category === 'trash' ? 'TRASH' : b.selection.category === 'sent' ? 'SENT' : ''), b.selection.category === 'unread' ? 'is:unread' : '', true).map((m) => m.id) : [];
        for (const id of ids) { const m = berichten.get(id); if (m) zet(m, String(b.action), String(b.targetLabelId || '')); }
        const operation = { operationId: `op-${Date.now()}`, accountId: account.id, action: b.action, targetLabelId: b.targetLabelId || '', source: b.source || '', sourceOperationId: '', phase: 'done', resolvedPages: 1, matchedCount: ids.length, resultSizeEstimate: ids.length, processed: ids.length, status: 'succeeded', retryAt: 0, errorCode: '', completedAt: Date.now() };
        laatsteBulk = operation;
        return json(route, { ok: true, operation });
      }
      if (pad === 'google-suite/state-bulk/status') return json(route, { ok: true, operation: laatsteBulk });
      if (pad === 'compose/send') {
        verzonden.push(b);
        const naarMij = String(b.to || '').toLowerCase().includes(eigenAdres);
        nieuw({ subject: String(b.subject || '(без теми)'), from: `Тестовий власник <${eigenAdres}>`, to: String(b.to || ''), html: String(b.html || ''), text: String(b.plainText || ''), labelIds: ['SENT'], receivedAt: Date.now() });
        if (naarMij) nieuw({ subject: String(b.subject || '(без теми)'), from: `Тестовий власник <${eigenAdres}>`, to: String(b.to || ''), html: String(b.html || ''), text: String(b.plainText || ''), labelIds: ['INBOX', 'UNREAD'], receivedAt: Date.now() + 1 });
        if (b.localId) concepten.delete(String(b.localId));
        return json(route, { ok: true, item: { id: `s-${verzonden.length}`, status: 'sent', sentAt: Date.now() } });
      }
      if (pad === 'compose/draft/save') { concepten.set(String(b.localId), { ...b, updatedAt: Date.now() }); return json(route, { ok: true, draft: { localId: b.localId, syncStatus: 'synced' } }); }
      if (pad === 'compose/draft/list') return json(route, { ok: true, drafts: [...concepten.values()].map((d) => ({ localId: d.localId, to: d.to, subject: d.subject, plainText: d.plainText, syncStatus: 'synced', updatedAt: d.updatedAt })) });
      if (pad === 'compose/draft/get') { const d = concepten.get(String(b.localId)); return json(route, { ok: true, draft: d ? { ...d, syncStatus: 'synced' } : null }); }
      if (pad === 'compose/draft/delete') { concepten.delete(String(b.localId)); return json(route, { ok: true }); }
      if (pad === 'compose/scheduled/list') return json(route, { ok: true, items: [] });
      // Alleen de Google-/verzendkant faken; de rest (bootstrap, voorkeuren, uitstellen…) gaat naar de echte testserver.
      if (!/^(google-suite|compose)\//.test(pad)) return route.continue();
      onbekend.push(pad);
      return json(route, { ok: true });
    });
  }
  let laatsteBulk: Record<string, unknown> = {};
  return { berichten, concepten, verzonden, onbekend, acties, nieuw, koppel, filter };
}
