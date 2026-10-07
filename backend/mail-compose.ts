// Opstellen van mail op de server: concepten (eerst lokaal in PostgreSQL, daarna naar Gmail gesynchroniseerd), direct verzenden en uitgestelde
// verzending via de wachtrij app.mail_queue (0016). Gmail wordt benaderd via de bestaande Google-suite-token (principal) en de REST-API:
// users.drafts.create/update/delete en users.messages.send. Geen IMAP/SMTP.
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import { googleSuiteMailProviderSnapshot, googleSuitePrincipalAccessToken } from './google-suite-onboarding';
import { mailHtmlToPlainText, normalizeOutboundMailHtml } from './mail-compose-html';
import { buildMime, encodeWord, headerSafe, parseAddressList, toGmailRaw } from './mail-mime';

const systeem = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);

// ---------------------------------------------------------------- types
export type ComposeInput = {
  to?: string; cc?: string; bcc?: string; subject?: string; html?: string; plainText?: string; accountId?: string; threadId?: string; localId?: string;
};
export type DraftRow = {
  id: string; localId: string; accountId: string; threadId: string; to: string; cc: string; bcc: string; subject: string; html: string; plainText: string;
  gmailDraftId: string; syncStatus: 'local' | 'synced' | 'error'; syncError: string; version: number; updatedAt: number;
};
export type QueueRow = {
  id: string; accountId: string; sendAt: number; status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'; attempts: number; lastError: string;
  sentAt: number | null; to: string; subject: string; preview: string;
};
type Payload = { to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; plainText: string; draftLocalId?: string; threadId?: string };

/** Verbinding met de provider; vervangbaar in tests. */
export interface MailTransport {
  resolve(userId: string, accountId: string): Promise<{ accountId: string; email: string; displayName: string } | null>;
  send(userId: string, accountId: string, rawMime: string, threadId?: string): Promise<{ id: string; threadId: string }>;
  draftUpsert(userId: string, accountId: string, gmailDraftId: string, rawMime: string): Promise<{ id: string }>;
  draftDelete(userId: string, accountId: string, gmailDraftId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status = 0, readonly permanent = false) { super(message); }
}

const gmail = async (token: string, path: string, init: RequestInit = {}) =>
  fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(30_000),
  });

export const gmailTransport: MailTransport = {
  async resolve(userId, accountId) {
    const snapshot = await googleSuiteMailProviderSnapshot(userId);
    const account = (accountId ? snapshot.accounts.find((a) => a.id === accountId) : snapshot.account) as { id: string; email: string; displayName: string; status: string } | null | undefined;
    if (!account || account.status !== 'connected') return null;
    return { accountId: account.id, email: account.email, displayName: account.displayName || '' };
  },
  async send(userId, accountId, rawMime, threadId) {
    const token = await tokenFor(userId, accountId);
    const res = await gmail(token, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: toGmailRaw(rawMime), ...(threadId ? { threadId } : {}) }) });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProviderError(`GMAIL_SEND_${res.status}`, res.status, res.status >= 400 && res.status < 500 && res.status !== 429);
    return { id: String(body.id || ''), threadId: String(body.threadId || '') };
  },
  async draftUpsert(userId, accountId, gmailDraftId, rawMime) {
    const token = await tokenFor(userId, accountId);
    const message = { raw: toGmailRaw(rawMime) };
    if (gmailDraftId) {
      const res = await gmail(token, `/drafts/${encodeURIComponent(gmailDraftId)}`, { method: 'PUT', body: JSON.stringify({ message }) });
      if (res.ok) return { id: gmailDraftId };
      if (res.status !== 404) throw new ProviderError(`GMAIL_DRAFT_UPDATE_${res.status}`, res.status);
      // het concept bestaat in Gmail niet meer (bv. daar verwijderd): opnieuw aanmaken
    }
    const res = await gmail(token, '/drafts', { method: 'POST', body: JSON.stringify({ message }) });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body.id) throw new ProviderError(`GMAIL_DRAFT_CREATE_${res.status}`, res.status);
    return { id: String(body.id) };
  },
  async draftDelete(userId, accountId, gmailDraftId) {
    if (!gmailDraftId) return;
    const token = await tokenFor(userId, accountId);
    const res = await gmail(token, `/drafts/${encodeURIComponent(gmailDraftId)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new ProviderError(`GMAIL_DRAFT_DELETE_${res.status}`, res.status);
  },
};

async function tokenFor(userId: string, accountId: string): Promise<string> {
  const snapshot = await googleSuiteMailProviderSnapshot(userId);
  const account = snapshot.accounts.find((a) => a.id === accountId);
  if (!account) throw new ProviderError('MAIL_ACCOUNT_NOT_CONNECTED', 409, true);
  return googleSuitePrincipalAccessToken(userId, (account as { principalId: string }).principalId, 'mail');
}

let transport: MailTransport = gmailTransport;
/** Alleen voor tests: de provider vervangen. */
export const setMailTransport = (impl: MailTransport | null) => { transport = impl ?? gmailTransport; };

// ---------------------------------------------------------------- validatie
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT = 998;

function normalizePayload(input: ComposeInput, requireRecipient: boolean): { ok: true; payload: Payload } | { ok: false; code: string } {
  const to = parseAddressList(String(input.to ?? ''));
  const cc = parseAddressList(String(input.cc ?? ''));
  const bcc = parseAddressList(String(input.bcc ?? ''));
  if (to.invalid.length || cc.invalid.length || bcc.invalid.length) return { ok: false, code: 'MAIL_RECIPIENT_INVALID' };
  if (to.valid.length + cc.valid.length + bcc.valid.length > MAX_RECIPIENTS) return { ok: false, code: 'MAIL_TOO_MANY_RECIPIENTS' };
  if (requireRecipient && !to.valid.length) return { ok: false, code: 'MAIL_RECIPIENT_REQUIRED' };
  const html = normalizeOutboundMailHtml(input.html ?? '');
  const plainInput = String(input.plainText ?? '').replace(/\u0000/g, '').slice(0, 100_000);
  const plainText = plainInput.trim() ? plainInput : mailHtmlToPlainText(html);
  if (requireRecipient && !plainText.trim()) return { ok: false, code: 'MAIL_BODY_REQUIRED' };
  return { ok: true, payload: { to: to.valid, cc: cc.valid, bcc: bcc.valid, subject: headerSafe(String(input.subject ?? ''), MAX_SUBJECT), html, plainText, ...(input.threadId ? { threadId: String(input.threadId).slice(0, 300) } : {}) } };
}

const mimeOf = (payload: Payload, from?: string) => buildMime({ ...(from ? { from } : {}), to: payload.to, cc: payload.cc, bcc: payload.bcc, subject: payload.subject, html: payload.html, plainText: payload.plainText });
const fromHeader = (a: { email: string; displayName: string }) => (a.displayName ? `${encodeWord(a.displayName)} <${a.email}>` : a.email);
const errorCode = (e: unknown) => (e instanceof ProviderError || e instanceof Error ? String(e.message).slice(0, 120) : 'UNKNOWN');

// ---------------------------------------------------------------- concepten
const draftOf = (r: any): DraftRow => ({
  id: r.id, localId: r.local_id, accountId: r.account_id, threadId: r.thread_id, to: r.to_addrs, cc: r.cc_addrs, bcc: r.bcc_addrs, subject: r.subject, html: r.html, plainText: r.plain_text,
  gmailDraftId: r.gmail_draft_id, syncStatus: r.sync_status, syncError: r.sync_error, version: r.version, updatedAt: new Date(r.updated_at).getTime(),
});

/**
 * Concept bewaren: EERST in PostgreSQL (nooit verloren), daarna naar Gmail. Een fout bij Gmail laat het lokale concept intact en zet
 * sync_status op "error"; de volgende keer bewaren (of een nieuwe poging) probeert het opnieuw.
 */
export async function saveDraft(userId: string, input: ComposeInput): Promise<{ draft: DraftRow } | { error: string }> {
  const localId = String(input.localId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(localId)) return { error: 'MAIL_DRAFT_ID_INVALID' };
  const normalized = normalizePayload(input, false);
  if (!normalized.ok) return { error: normalized.code };
  const p = normalized.payload;
  const accountId = String(input.accountId ?? '').slice(0, 300);
  const saved = await systeem(
    `INSERT INTO app.mail_drafts (user_id, local_id, account_id, thread_id, to_addrs, cc_addrs, bcc_addrs, subject, html, plain_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id, local_id) DO UPDATE SET account_id = EXCLUDED.account_id, thread_id = EXCLUDED.thread_id, to_addrs = EXCLUDED.to_addrs, cc_addrs = EXCLUDED.cc_addrs,
       bcc_addrs = EXCLUDED.bcc_addrs, subject = EXCLUDED.subject, html = EXCLUDED.html, plain_text = EXCLUDED.plain_text, version = app.mail_drafts.version + 1, updated_at = now()
     RETURNING *`,
    [userId, localId, accountId, p.threadId ?? '', String(input.to ?? '').slice(0, 4000), String(input.cc ?? '').slice(0, 4000), String(input.bcc ?? '').slice(0, 4000), p.subject, p.html, p.plainText]);
  let row = saved.rows[0];
  const empty = !p.subject.trim() && !p.plainText.trim() && !String(input.to ?? '').trim();
  if (!empty) {
    try {
      const account = await transport.resolve(userId, accountId);
      if (!account) throw new ProviderError('MAIL_ACCOUNT_NOT_CONNECTED', 409);
      const version = row.version;
      const to = parseAddressList(String(input.to ?? '')).valid; // een concept mag zonder (geldige) ontvanger
      const raw = buildMime({ from: fromHeader(account), to, cc: p.cc, bcc: p.bcc, subject: p.subject, html: p.html, plainText: p.plainText });
      const synced = await transport.draftUpsert(userId, account.accountId, row.gmail_draft_id, raw);
      // alleen bijwerken als er intussen geen nieuwere versie is opgeslagen (twee snelle opslagen mogen elkaar niet overschrijven)
      const upd = await systeem(`UPDATE app.mail_drafts SET gmail_draft_id=$3, sync_status='synced', sync_error='' WHERE user_id=$1 AND local_id=$2 AND version=$4 RETURNING *`, [userId, localId, synced.id, version]);
      row = upd.rows[0] ?? (await systeem('SELECT * FROM app.mail_drafts WHERE user_id=$1 AND local_id=$2', [userId, localId])).rows[0];
    } catch (e) {
      const upd = await systeem(`UPDATE app.mail_drafts SET sync_status='error', sync_error=$3 WHERE user_id=$1 AND local_id=$2 RETURNING *`, [userId, localId, errorCode(e)]);
      row = upd.rows[0] ?? row;
    }
  }
  return { draft: draftOf(row) };
}

export async function listDrafts(userId: string, limit = 50): Promise<DraftRow[]> {
  const r = await systeem('SELECT * FROM app.mail_drafts WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2', [userId, Math.min(100, Math.max(1, limit))]);
  return r.rows.map(draftOf);
}
export async function getDraft(userId: string, localId: string): Promise<DraftRow | null> {
  const r = await systeem('SELECT * FROM app.mail_drafts WHERE user_id=$1 AND local_id=$2', [userId, localId]);
  return r.rows[0] ? draftOf(r.rows[0]) : null;
}
export async function deleteDraft(userId: string, localId: string): Promise<boolean> {
  const r = await systeem('DELETE FROM app.mail_drafts WHERE user_id=$1 AND local_id=$2 RETURNING account_id, gmail_draft_id', [userId, localId]);
  const row = r.rows[0];
  if (!row) return false;
  if (row.gmail_draft_id) { try { const a = await transport.resolve(userId, row.account_id); if (a) await transport.draftDelete(userId, a.accountId, row.gmail_draft_id); } catch { /* Gmail-kant opruimen is best effort */ } }
  return true;
}

// ---------------------------------------------------------------- wachtrij
const queueOf = (r: any): QueueRow => {
  const payload = (r.message_payload ?? {}) as Payload;
  return {
    id: r.id, accountId: r.account_id, sendAt: new Date(r.send_at).getTime(), status: r.status, attempts: r.attempts, lastError: r.last_error,
    sentAt: r.sent_at ? new Date(r.sent_at).getTime() : null, to: (payload.to ?? []).join(', '), subject: payload.subject ?? '', preview: String(payload.plainText ?? '').slice(0, 160),
  };
};

const MIN_DELAY_MS = 10_000;
const MAX_DELAY_MS = 366 * 24 * 3600 * 1000;

/** Zet een bericht in de wachtrij (idempotent op requestId). `sendAt` in het verleden of nu = meteen verzenden. */
export async function enqueue(userId: string, input: ComposeInput, sendAt: number, requestId: string): Promise<{ item: QueueRow } | { error: string }> {
  const normalized = normalizePayload(input, true);
  if (!normalized.ok) return { error: normalized.code };
  const when = Number.isFinite(sendAt) ? sendAt : Date.now();
  if (when > Date.now() + MAX_DELAY_MS) return { error: 'MAIL_SCHEDULE_TOO_FAR' };
  const payload: Payload = { ...normalized.payload, ...(input.localId ? { draftLocalId: String(input.localId).slice(0, 80) } : {}) };
  const rid = String(requestId ?? '').trim().slice(0, 120);
  const ins = await systeem(
    `INSERT INTO app.mail_queue (user_id, account_id, message_payload, send_at, request_id) VALUES ($1,$2,$3::jsonb,to_timestamp($4/1000.0),$5)
     ON CONFLICT (user_id, request_id) WHERE request_id <> '' DO NOTHING RETURNING *`,
    [userId, String(input.accountId ?? '').slice(0, 300), JSON.stringify(payload), Math.max(when, Date.now()), rid]);
  if (ins.rows[0]) return { item: queueOf(ins.rows[0]) };
  const existing = await systeem('SELECT * FROM app.mail_queue WHERE user_id=$1 AND request_id=$2', [userId, rid]);
  return existing.rows[0] ? { item: queueOf(existing.rows[0]) } : { error: 'MAIL_QUEUE_FAILED' };
}

export const validScheduleTime = (sendAt: number, now = Date.now()) => Number.isFinite(sendAt) && sendAt >= now + MIN_DELAY_MS;

export async function listScheduled(userId: string, includeFinished = true, limit = 50): Promise<QueueRow[]> {
  const r = await systeem(
    `SELECT * FROM app.mail_queue WHERE user_id=$1 ${includeFinished ? '' : "AND status IN ('scheduled','sending')"} ORDER BY (status='scheduled') DESC, send_at DESC LIMIT $2`, [userId, Math.min(100, limit)]);
  return r.rows.map(queueOf);
}
export async function cancelScheduled(userId: string, id: string): Promise<boolean> {
  const r = await systeem(`UPDATE app.mail_queue SET status='cancelled', updated_at=now() WHERE id=$1 AND user_id=$2 AND status='scheduled' RETURNING id`, [id, userId]);
  return (r.rowCount ?? 0) > 0;
}

/** Eén wachtrij-item versturen (de aanroeper heeft het al geclaimd: status "sending"). */
async function deliver(row: any): Promise<void> {
  const userId = row.user_id as string;
  const payload = row.message_payload as Payload;
  try {
    const account = await transport.resolve(userId, row.account_id);
    if (!account) throw new ProviderError('MAIL_ACCOUNT_NOT_CONNECTED', 409, true);
    const sent = await transport.send(userId, account.accountId, mimeOf(payload, fromHeader(account)), payload.threadId);
    await systeem(`UPDATE app.mail_queue SET status='sent', provider_message_id=$2, last_error='', sent_at=now(), updated_at=now() WHERE id=$1`, [row.id, sent.id]);
    if (payload.draftLocalId) await deleteDraft(userId, payload.draftLocalId).catch(() => undefined);
  } catch (e) {
    const permanent = e instanceof ProviderError && e.permanent;
    const attempts = Number(row.attempts);
    const dead = permanent || attempts >= 5;
    const delaySec = Math.min(3600, 60 * 2 ** (attempts - 1));
    await systeem(
      dead ? `UPDATE app.mail_queue SET status='failed', last_error=$2, updated_at=now() WHERE id=$1`
        : `UPDATE app.mail_queue SET status='scheduled', last_error=$2, send_at=now() + make_interval(secs => $3), updated_at=now() WHERE id=$1`,
      dead ? [row.id, errorCode(e)] : [row.id, errorCode(e), delaySec]);
  }
}

/** Direct verzenden = in de wachtrij met tijd "nu" en meteen uitvoeren: zo is er één pad, één logboek en echte idempotentie. */
export async function sendNow(userId: string, input: ComposeInput, requestId: string): Promise<{ item: QueueRow } | { error: string }> {
  const queued = await enqueue(userId, input, Date.now(), requestId);
  if ('error' in queued) return queued;
  const claimed = await systeem(`UPDATE app.mail_queue SET status='sending', attempts=attempts+1, updated_at=now() WHERE id=$1 AND user_id=$2 AND status='scheduled' RETURNING *`, [queued.item.id, userId]);
  if (claimed.rows[0]) await deliver(claimed.rows[0]);
  const after = await systeem('SELECT * FROM app.mail_queue WHERE id=$1', [queued.item.id]);
  return { item: queueOf(after.rows[0]) };
}

/** Voor de cron-taak (elke minuut): claimt vervallen items met SKIP LOCKED (twee processen versturen nooit hetzelfde bericht) en verstuurt ze. */
export async function runMailQueue(limit = 10): Promise<{ claimed: number; sent: number; failed: number; retried: number; abandoned: number }> {
  // Een item dat > 10 min op "sending" staat: het proces stierf midden in het versturen. Niet opnieuw proberen (kans op dubbele mail), maar zichtbaar als mislukt markeren.
  const abandoned = await systeem(`UPDATE app.mail_queue SET status='failed', last_error='MAIL_QUEUE_UNCERTAIN', updated_at=now() WHERE status='sending' AND updated_at < now() - interval '10 minutes' RETURNING id`);
  const claimed = await systeem(
    `UPDATE app.mail_queue SET status='sending', attempts=attempts+1, updated_at=now()
      WHERE id IN (SELECT id FROM app.mail_queue WHERE status='scheduled' AND send_at <= now() ORDER BY send_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [Math.min(50, Math.max(1, limit))]);
  for (const row of claimed.rows) await deliver(row);
  const ids = claimed.rows.map((r: any) => r.id);
  const after = ids.length ? (await systeem('SELECT status FROM app.mail_queue WHERE id = ANY($1::uuid[])', [ids])).rows : [];
  return {
    claimed: ids.length, sent: after.filter((r: any) => r.status === 'sent').length, failed: after.filter((r: any) => r.status === 'failed').length,
    retried: after.filter((r: any) => r.status === 'scheduled').length, abandoned: abandoned.rowCount ?? 0,
  };
}

// ---------------------------------------------------------------- routes
type SessionAuth = { errorCode: string } | { service: string; user: { id: string; email: string; status: string } };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
};
const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

const MESSAGE_FOR: Record<string, number> = {
  MAIL_RECIPIENT_INVALID: 400, MAIL_RECIPIENT_REQUIRED: 400, MAIL_BODY_REQUIRED: 400, MAIL_TOO_MANY_RECIPIENTS: 400, MAIL_DRAFT_ID_INVALID: 400,
  MAIL_SCHEDULE_TOO_FAR: 400, MAIL_SCHEDULE_TIME_INVALID: 400, MAIL_ACCOUNT_NOT_CONNECTED: 409, MAIL_REQUEST_ID_REQUIRED: 400,
};

export function createMailComposeRoutes(deps: Deps) {
  const gate = async (ctx: { event: Record<string, unknown>; body: unknown }) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'mail' || auth.user.status !== 'approved') return null;
    return auth;
  };
  const denied = () => error('OWNER_MAIL_SESSION_REQUIRED', 403);
  const limited = async (userId: string, kind: string, max: number) => (await rateLimit(`mail-compose:${kind}:${userId}`, max, 600, { failClosed: true })).ok;

  return {
    'POST /api/owner/mail/compose/draft/save': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      if (!(await limited(auth.user.id, 'draft', 600))) return error('RATE_LIMITED', 429);
      const out = await saveDraft(auth.user.id, bodyOf(ctx.body) as ComposeInput);
      if ('error' in out) return error(out.error, MESSAGE_FOR[out.error] ?? 400);
      return json({ ok: true, draft: { ...out.draft, html: undefined, plainText: undefined } });
    }],
    'POST /api/owner/mail/compose/draft/list': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      return json({ ok: true, drafts: (await listDrafts(auth.user.id)).map((d) => ({ ...d, html: undefined })) });
    }],
    'POST /api/owner/mail/compose/draft/get': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      const draft = await getDraft(auth.user.id, String(bodyOf(ctx.body).localId ?? ''));
      return draft ? json({ ok: true, draft }) : error('MAIL_DRAFT_NOT_FOUND', 404);
    }],
    'POST /api/owner/mail/compose/draft/delete': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      return (await deleteDraft(auth.user.id, String(bodyOf(ctx.body).localId ?? ''))) ? json({ ok: true }) : error('MAIL_DRAFT_NOT_FOUND', 404);
    }],
    'POST /api/owner/mail/compose/send': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      if (!(await limited(auth.user.id, 'send', 60))) return error('RATE_LIMITED', 429);
      const body = bodyOf(ctx.body);
      const requestId = String(body.requestId ?? '').trim();
      if (!requestId) return error('MAIL_REQUEST_ID_REQUIRED', 400);
      const out = await sendNow(auth.user.id, body as ComposeInput, requestId);
      if ('error' in out) return error(out.error, MESSAGE_FOR[out.error] ?? 400);
      await deps.audit(auth.user.id, 'owner.mail.compose.send', out.item.status === 'sent' ? 'success' : 'failure', { queueId: out.item.id, status: out.item.status });
      return json({ ok: out.item.status === 'sent', item: out.item });
    }],
    'POST /api/owner/mail/compose/schedule': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      if (!(await limited(auth.user.id, 'schedule', 60))) return error('RATE_LIMITED', 429);
      const body = bodyOf(ctx.body);
      const requestId = String(body.requestId ?? '').trim();
      if (!requestId) return error('MAIL_REQUEST_ID_REQUIRED', 400);
      const sendAt = Number(body.sendAt);
      if (!validScheduleTime(sendAt)) return error('MAIL_SCHEDULE_TIME_INVALID', 400);
      const out = await enqueue(auth.user.id, body as ComposeInput, sendAt, requestId);
      if ('error' in out) return error(out.error, MESSAGE_FOR[out.error] ?? 400);
      await deps.audit(auth.user.id, 'owner.mail.compose.scheduled', 'success', { queueId: out.item.id, sendAt: out.item.sendAt });
      return json({ ok: true, item: out.item });
    }],
    'POST /api/owner/mail/compose/scheduled/list': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      return json({ ok: true, items: await listScheduled(auth.user.id, bodyOf(ctx.body).includeFinished !== false) });
    }],
    'POST /api/owner/mail/compose/scheduled/cancel': [async (ctx: any) => {
      const auth = await gate(ctx); if (!auth) return denied();
      const ok = await cancelScheduled(auth.user.id, String(bodyOf(ctx.body).id ?? ''));
      if (ok) await deps.audit(auth.user.id, 'owner.mail.compose.cancelled', 'success', { queueId: String(bodyOf(ctx.body).id ?? '') });
      return ok ? json({ ok: true }) : error('MAIL_SCHEDULED_NOT_CANCELLABLE', 409);
    }],
  };
}
