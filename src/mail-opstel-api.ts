import { api, ApiError } from './platform/client';

export type Lang = 'uk' | 'nl';
export type Context = { service: string; tabContext: string; sourceOrigin: string };
export type DraftSync = 'idle' | 'saving' | 'synced' | 'local' | 'error';
export type ScheduledItem = {
  id: string; accountId: string; sendAt: number; status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'; attempts: number; lastError: string;
  sentAt: number | null; to: string; subject: string; preview: string;
};
export type DraftSummary = { localId: string; to: string; subject: string; plainText?: string; syncStatus: 'local' | 'synced' | 'error'; updatedAt: number };
export type Compose = {
  attachments?: Array<{ filename: string; contentType: string; data: string }>; to: string; cc: string; bcc: string; subject: string; html: string; plainText: string; accountId: string; localId: string };

/** Foutcodes van de server -> uitleg in de taal van de site (nooit de ruwe code of Engelse tekst). */
export function composeErrorText(error: unknown, t: (uk: string, nl: string) => string): string {
  const code = error instanceof ApiError ? String(error.response?.data?.error || error.message) : String((error as Error)?.message || '');
  const map: Record<string, [string, string]> = {
    MAIL_RECIPIENT_INVALID: ['Одна з адрес одержувачів недійсна.', 'Een van de ontvangeradressen is ongeldig.'],
    MAIL_RECIPIENT_REQUIRED: ['Вкажіть хоча б одного одержувача.', 'Geef minstens één ontvanger op.'],
    MAIL_BODY_REQUIRED: ['Лист порожній.', 'Het bericht is leeg.'],
    MAIL_TOO_MANY_RECIPIENTS: ['Забагато одержувачів (максимум 50).', 'Te veel ontvangers (maximaal 50).'],
    MAIL_SCHEDULE_TIME_INVALID: ['Час має бути щонайменше за 10 секунд у майбутньому.', 'De tijd moet minstens 10 seconden in de toekomst liggen.'],
    MAIL_SCHEDULE_TOO_FAR: ['Заплановувати можна не далі ніж на рік уперед.', 'Plannen kan maximaal een jaar vooruit.'],
    MAIL_ACCOUNT_NOT_CONNECTED: ['Поштовий акаунт Google не підключений або потребує нового входу.', 'Het Google-mailaccount is niet gekoppeld of moet opnieuw worden aangemeld.'],
    RATE_LIMITED: ['Забагато запитів. Зачекайте кілька хвилин.', 'Te veel verzoeken. Wacht enkele minuten.'],
    AI_KEY_MISSING: ['Додайте власний ключ Anthropic: Кабінет → API-платформа → Сховище ключів (призначення «anthropic»).', 'Voeg uw eigen Anthropic-sleutel toe: Kabinet → API-platform → Sleutelkluis (doel "anthropic").'],
    AI_PROVIDER_ERROR: ['Постачальник ШІ не відповів або відхилив запит (перевірте ключ і ліміт).', 'De AI-aanbieder antwoordde niet of weigerde het verzoek (controleer sleutel en limiet).'],
    AI_INVALID: ['Немає що обробляти: перевірте текст.', 'Er is niets te verwerken: controleer de tekst.'],
    AI_TOO_LONG: ['Текст задовгий для ШІ (максимум 20 000 символів).', 'De tekst is te lang voor de AI (maximaal 20 000 tekens).'],
    MAIL_SCHEDULED_NOT_CANCELLABLE: ['Цей лист уже не можна скасувати.', 'Dit bericht kan niet meer worden geannuleerd.'],
  };
  const hit = map[code];
  return hit ? t(hit[0], hit[1]) : t('Не вдалося виконати дію. Спробуйте ще раз.', 'De actie is niet gelukt. Probeer het opnieuw.');
}

const post = async (path: string, context: Context, body: Record<string, unknown>) => (await api.post(path, { ...context, ...body })).data;
const base = '/api/owner/mail/compose';

export const saveDraftRemote = (ctx: Context, c: Compose) => post(`${base}/draft/save`, ctx, { ...c });
export const listDraftsRemote = (ctx: Context): Promise<{ drafts: DraftSummary[] }> => post(`${base}/draft/list`, ctx, {});
export const getDraftRemote = (ctx: Context, localId: string): Promise<{ draft: Compose & { syncStatus: string } }> => post(`${base}/draft/get`, ctx, { localId });
export const deleteDraftRemote = (ctx: Context, localId: string) => post(`${base}/draft/delete`, ctx, { localId });
export const sendRemote = (ctx: Context, c: Compose, requestId: string) => post(`${base}/send`, ctx, { ...c, requestId });
export const scheduleRemote = (ctx: Context, c: Compose, sendAt: number, requestId: string): Promise<{ item: ScheduledItem }> => post(`${base}/schedule`, ctx, { ...c, sendAt, requestId });
export const listScheduledRemote = (ctx: Context): Promise<{ items: ScheduledItem[] }> => post(`${base}/scheduled/list`, ctx, {});
export const cancelScheduledRemote = (ctx: Context, id: string) => post(`${base}/scheduled/cancel`, ctx, { id });

export type AiAction = 'fix' | 'shorten' | 'expand' | 'rephrase' | 'formal' | 'friendly' | 'translate' | 'emoji' | 'structure' | 'smart_format' | 'template' | 'custom';
export const aiTransform = (ctx: Context, body: { action: AiAction; text: string; language?: string; template?: string; instruction?: string }): Promise<{ text: string; html: string }> => post(`${base}/ai/transform`, ctx, body);
export const aiTone = (ctx: Context, text: string, language: Lang): Promise<{ tone: string; formality: number; warmth: number; issues: string[]; suggestion: string }> => post(`${base}/ai/tone`, ctx, { text, language });
export const aiReply = (ctx: Context, body: { messages: Array<{ from?: string; date?: string; html?: string; text?: string }>; instruction?: string; language?: string; tone?: string }): Promise<{ text: string; html: string }> => post(`${base}/ai/reply`, ctx, body);
export const aiSummarize = (ctx: Context, body: { messages: Array<{ from?: string; date?: string; html?: string; text?: string }>; language?: string }): Promise<{ text: string; html: string }> => post(`${base}/ai/summarize`, ctx, body);

/** Voorgestelde tijden voor "later versturen", in de tijdzone van het apparaat. */
export function schedulePresets(now = new Date(), t: (uk: string, nl: string) => string): Array<{ id: string; label: string; at: number }> {
  const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.getTime(); };
  const plusDays = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  const out: Array<{ id: string; label: string; at: number }> = [{ id: '1h', label: t('Через годину', 'Over een uur'), at: now.getTime() + 3600_000 }];
  const evening = at(now, 18);
  if (evening > now.getTime() + 15 * 60_000) out.push({ id: 'evening', label: t('Сьогодні ввечері (18:00)', 'Vanavond (18:00)'), at: evening });
  out.push({ id: 'tomorrow', label: t('Завтра вранці (08:00)', 'Morgen ochtend (08:00)'), at: at(plusDays(1), 8) });
  const monday = plusDays(((8 - now.getDay()) % 7) || 7);
  out.push({ id: 'monday', label: t('У понеділок (08:00)', 'Maandag (08:00)'), at: at(monday, 8) });
  return out;
}
