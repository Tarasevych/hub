// Фонова служба вихідної пошти між розділами та піддоменами (*.tarasevych.com).
// Забезпечує:
// 1) безперервне фонове надсилання листів і відповідей (keepalive + серверна чернетка/черга) під час переходів між розділами й піддоменами;
// 2) спільний міждоменний стан у реп’яшку mr_uitgaande_post_v1 (Domain=.tarasevych.com), localStorage та BroadcastChannel;
// 3) гарантований спливний бокс сповіщення (emitCanonicalNotice + publiceerPaginaSignaal) на будь-якому піддомені у разі помилки або завершення,
//    із можливістю повторити надсилання в один клік прямо зі спливного боксу сповіщення.

import { api, ApiError } from '../platform/client';
import { sessieDienst } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import {
  emitCanonicalNotice,
  publiceerPaginaSignaal,
  verwijderPaginaSignaal,
} from '../canoniek-meldingen';
import {
  composeErrorText,
  deleteDraftRemote,
  getDraftRemote,
  saveDraftRemote,
  sendRemote,
  type Context,
  type Lang,
} from '../mail-opstel-api';
import { antwoordId } from '../mail-antwoord-concepten';

export const UITGAANDE_POST_COOKIE = 'mr_uitgaande_post_v1';
export const UITGAANDE_POST_STORAGE_KEY = 'tsv:uitgaande-post-wachtrij-v1';
export const UITGAANDE_POST_EVENT = 'tsv:uitgaande-post-gewijzigd';
const UITGAANDE_POST_COOKIE_MAX_AGE = 24 * 3600;
const OVERNAME_NA_MS = 4500;
const VERLOOPT_NA_MS = 6 * 3600_000;

export type UitgaandePostSoort = 'antwoord' | 'nieuw';
export type UitgaandePostStatus = 'verzenden' | 'verzonden' | 'mislukt';

export type UitgaandePostBijlage = {
  filename: string;
  contentType: string;
  data: string;
};

export type UitgaandePostTaak = {
  id: string;
  requestId: string;
  soort: UitgaandePostSoort;
  status: UitgaandePostStatus;
  accountId: string;
  threadId?: string;
  replyToMessageId?: string;
  replyMode?: 'sender' | 'all';
  draftLocalId: string;
  aan: string;
  cc?: string;
  bcc?: string;
  onderwerp: string;
  plainText?: string;
  html?: string;
  attachments?: UitgaandePostBijlage[];
  foutCode?: string;
  tijd: number;
  bronHost: string;
  gemeldStatus?: UitgaandePostStatus | '';
  gemeldHost?: string;
};

const lopendeVerzoeken = new Map<string, Promise<boolean>>();

const huidigeHost = (): string =>
  typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname.toLowerCase() : 'mail.tarasevych.com';

const isTabZichtbaar = (): boolean =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden';

const huidigeContext = (fallback?: Partial<Context>): Context => ({
  service: zijbalkServerDienst() || sessieDienst() || fallback?.service || 'mail',
  tabContext: fallback?.tabContext || ecosystemTabContext(),
  sourceOrigin: typeof window !== 'undefined' && window.location?.origin ? window.location.origin : (fallback?.sourceOrigin || 'https://mail.tarasevych.com'),
});

const gedeeldCookieDomein = (hostname: string): string => {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return '';
  if (h === 'tarasevych.com' || h.endsWith('.tarasevych.com')) return '.tarasevych.com';
  const delen = h.split('.').filter(Boolean);
  return delen.length >= 2 ? `.${delen.slice(-2).join('.')}` : '';
};

const leesCookieTaken = (): UitgaandePostTaak[] => {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') return [];
  try {
    const paren = document.cookie.split(';');
    for (const paar of paren) {
      const idx = paar.indexOf('=');
      if (idx < 0) continue;
      const naam = paar.slice(0, idx).trim();
      if (naam !== UITGAANDE_POST_COOKIE) continue;
      const waarde = decodeURIComponent(paar.slice(idx + 1).trim());
      const parsed = JSON.parse(waarde) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === 'object' && typeof (x as UitgaandePostTaak).id === 'string') as UitgaandePostTaak[];
    }
  } catch { /* пошкоджений реп'яшок ігноруємо */ }
  return [];
};

const schrijfCookieTaken = (taken: UitgaandePostTaak[]) => {
  if (typeof document === 'undefined') return;
  try {
    const nu = Date.now();
    // У міждоменний реп'яшок кладемо компактний зріз останніх 4 завдань (без важких вкладень і довгого HTML),
    // щоб реп'яшок ніколи не перевищував ліміт 4 кБ і миттєво синхронізувався між усіма піддоменами *.tarasevych.com.
    const compact = taken
      .filter((t) => nu - t.tijd < VERLOOPT_NA_MS)
      .slice(0, 4)
      .map((t) => ({
        id: t.id,
        requestId: t.requestId,
        soort: t.soort,
        status: t.status,
        accountId: t.accountId,
        threadId: t.threadId || '',
        replyToMessageId: t.replyToMessageId || '',
        replyMode: t.replyMode || 'sender',
        draftLocalId: t.draftLocalId,
        aan: String(t.aan || '').slice(0, 140),
        onderwerp: String(t.onderwerp || '').slice(0, 140),
        foutCode: t.foutCode || '',
        tijd: t.tijd,
        bronHost: t.bronHost,
        gemeldStatus: t.gemeldStatus || '',
        gemeldHost: t.gemeldHost || '',
      }));
    const gecodeerd = encodeURIComponent(JSON.stringify(compact));
    const host = huidigeHost();
    const domein = gedeeldCookieDomein(host);
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
    const basis = `${UITGAANDE_POST_COOKIE}=${gecodeerd}; Path=/; Max-Age=${UITGAANDE_POST_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    if (domein) document.cookie = `${basis}; Domain=${domein}`;
    document.cookie = basis;
  } catch { /* середовище без cookie */ }
};

export const leesUitgaandePostTaken = (): UitgaandePostTaak[] => {
  const nu = Date.now();
  let lokaal: UitgaandePostTaak[] = [];
  if (typeof window !== 'undefined') {
    try {
      const ruw = window.localStorage.getItem(UITGAANDE_POST_STORAGE_KEY);
      if (ruw) {
        const parsed = JSON.parse(ruw) as unknown;
        if (Array.isArray(parsed)) lokaal = parsed as UitgaandePostTaak[];
      }
    } catch { /* немає localStorage */ }
  }
  const cookieLijst = leesCookieTaken();
  const kaart = new Map<string, UitgaandePostTaak>();
  for (const item of lokaal) {
    if (item?.id && nu - item.tijd < VERLOOPT_NA_MS) kaart.set(item.id, item);
  }
  for (const c of cookieLijst) {
    if (!c?.id || nu - c.tijd >= VERLOOPT_NA_MS) continue;
    const bestaand = kaart.get(c.id);
    if (!bestaand) {
      kaart.set(c.id, c);
    } else if (c.tijd >= bestaand.tijd) {
      kaart.set(c.id, {
        ...bestaand,
        ...c,
        plainText: bestaand.plainText || c.plainText,
        html: bestaand.html || c.html,
        cc: bestaand.cc || c.cc,
        bcc: bestaand.bcc || c.bcc,
        attachments: bestaand.attachments || c.attachments,
      });
    }
  }
  return Array.from(kaart.values()).sort((a, b) => b.tijd - a.tijd);
};

const zendSignaal = (taken: UitgaandePostTaak[]) => {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(UITGAANDE_POST_EVENT, { detail: taken })); } catch { /* без DOM */ }
  try {
    if (typeof BroadcastChannel === 'function') {
      const bc = new BroadcastChannel(UITGAANDE_POST_COOKIE);
      bc.postMessage({ type: 'sync', op: Date.now() });
      bc.close();
    }
  } catch { /* без BroadcastChannel */ }
};

const bewaarUitgaandePostTaak = (taak: UitgaandePostTaak): UitgaandePostTaak[] => {
  const huidige = leesUitgaandePostTaken();
  const volgende = [taak, ...huidige.filter((x) => x.id !== taak.id)].slice(0, 12);
  if (typeof window !== 'undefined') {
    try {
      // У localStorage зберігаємо текст і метадані (вкладення > 256 кБ не дублюємо в localStorage, щоб не переповнити квоту)
      const voorOpslag = volgende.map((item) => {
        const heeftGroteBijlagen = (item.attachments || []).reduce((s, a) => s + (a.data?.length || 0), 0) > 256_000;
        return heeftGroteBijlagen ? { ...item, attachments: undefined } : item;
      });
      window.localStorage.setItem(UITGAANDE_POST_STORAGE_KEY, JSON.stringify(voorOpslag));
    } catch { /* переповнення localStorage */ }
  }
  schrijfCookieTaken(volgende);
  zendSignaal(volgende);
  return volgende;
};

export const verwijderUitgaandePostTaak = (id: string) => {
  const volgende = leesUitgaandePostTaken().filter((x) => x.id !== id);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(UITGAANDE_POST_STORAGE_KEY, JSON.stringify(volgende)); } catch { /* ігноруємо */ }
  }
  schrijfCookieTaken(volgende);
  verwijderPaginaSignaal(`uitgaande-post:${id}`);
  zendSignaal(volgende);
};

const foutCodeUit = (caught: unknown): string => {
  if (caught instanceof ApiError) return String(caught.response?.data?.error || caught.message || 'MAIL_SEND_FAILED');
  if (caught instanceof Error) return String(caught.message || 'MAIL_SEND_FAILED');
  return String(caught || 'MAIL_SEND_FAILED');
};

const contextRegel = (taak: Pick<UitgaandePostTaak, 'aan' | 'onderwerp'>): string =>
  [taak.aan ? `→ ${taak.aan}` : '', taak.onderwerp || ''].filter(Boolean).join(' · ').slice(0, 180);

const toonVerzendenSignaal = (taak: UitgaandePostTaak) => {
  const ctxLabel = contextRegel(taak);
  publiceerPaginaSignaal({
    id: `uitgaande-post:${taak.id}`,
    bron: 'mail',
    kanaal: 'mail',
    soort: 'uitgaande-post-bezig',
    ernst: 'info',
    titelUk: taak.soort === 'antwoord' ? 'Надсилаємо відповідь у фоні…' : 'Надсилаємо лист у фоні…',
    titelNl: taak.soort === 'antwoord' ? 'Antwoord wordt op de achtergrond verzonden…' : 'Bericht wordt op de achtergrond verzonden…',
    berichtUk: 'Ви можете вільно переходити в інші розділи та на інші піддомени сайту — відправлення триває у фоновому режимі.',
    berichtNl: 'U kunt vrij naar andere onderdelen en subdomeinen gaan — de verzending loopt op de achtergrond door.',
    contextLabel: ctxLabel,
    link: 'https://mail.tarasevych.com/',
  });
};

export const toonMisluktMeldingBox = (taak: UitgaandePostTaak, lang: Lang) => {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const redenUk = composeErrorText(taak.foutCode || 'MAIL_SEND_FAILED', (uk) => uk);
  const redenNl = composeErrorText(taak.foutCode || 'MAIL_SEND_FAILED', (_uk, nl) => nl);
  const reden = lang === 'uk' ? redenUk : redenNl;
  const ctxLabel = contextRegel(taak);
  const titel = taak.soort === 'antwoord'
    ? t('Відповідь не вдалося надіслати', 'Het antwoord kon niet worden verzonden')
    : t('Лист не вдалося надіслати', 'Het bericht kon niet worden verzonden');
  const uitleg = taak.soort === 'antwoord'
    ? `${reden} ${t('Текст залишився у редакторі та надійно збережений у чернетці.', 'De tekst is in de editor gebleven en veilig als concept bewaard.')}`
    : `${reden} ${t('Текст листа залишився у редакторі та надійно збережений у чернетці.', 'De berichttekst is in de editor gebleven en veilig als concept bewaard.')}`;

  publiceerPaginaSignaal({
    id: `uitgaande-post:${taak.id}`,
    bron: 'mail',
    kanaal: 'mail',
    soort: 'uitgaande-post-mislukt',
    ernst: 'kritiek',
    titelUk: taak.soort === 'antwoord' ? 'Відповідь не вдалося надіслати' : 'Лист не вдалося надіслати',
    titelNl: taak.soort === 'antwoord' ? 'Het antwoord kon niet worden verzonden' : 'Het bericht kon niet worden verzonden',
    berichtUk: `${redenUk} Текст збережено у чернетці.`,
    berichtNl: `${redenNl} De tekst is als concept bewaard.`,
    uitlegUk: 'Натисніть «Повторити надсилання» або відкрийте чернетку в пошті.',
    uitlegNl: 'Klik op «Opnieuw verzenden» of open het concept in Post.',
    contextLabel: ctxLabel,
    link: 'https://mail.tarasevych.com/',
    acties: [
      {
        id: 'herhaal',
        labelUk: 'Повторити надсилання',
        labelNl: 'Opnieuw verzenden',
        primair: true,
        uitvoer: () => { void herhaalUitgaandePost(taak.id, lang); },
      },
      {
        id: 'open-mail',
        labelUk: 'Відкрити в пошті',
        labelNl: 'Openen in Post',
        href: 'https://mail.tarasevych.com/',
      },
    ],
  });

  emitCanonicalNotice({
    text: titel,
    kind: 'error',
    source: 'mail',
    type: 'post',
    retain: true,
    losseRegel: true,
    topic: `mail|uitgaand|${taak.id}`,
    context: ctxLabel || undefined,
    explain: uitleg,
    action: {
      label: t('Повторити надсилання', 'Opnieuw verzenden'),
      onAction: () => { void herhaalUitgaandePost(taak.id, lang); },
    },
    actionExpiresAt: Date.now() + 30 * 60_000,
    link: {
      href: 'https://mail.tarasevych.com/',
      label: t('Відкрити в пошті', 'Openen in Post'),
    },
  });
};

export const toonVerzondenMeldingBox = (taak: UitgaandePostTaak, lang: Lang) => {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  verwijderPaginaSignaal(`uitgaande-post:${taak.id}`);
  const ctxLabel = contextRegel(taak);
  const titel = taak.soort === 'antwoord'
    ? (taak.replyMode === 'all'
      ? t('Відповідь усім надіслано', 'Antwoord aan allen verzonden')
      : t('Відповідь надіслано', 'Antwoord verzonden'))
    : t('Лист надіслано', 'Bericht verzonden');
  emitCanonicalNotice({
    text: titel,
    kind: 'success',
    source: 'mail',
    type: 'post',
    topic: `mail|uitgaand|${taak.id}`,
    context: ctxLabel || undefined,
  });
};

/** Виконує фактичне мережеве відправлення завдання (або повтор з будь-якого піддомену). */
async function voerVerzendingUit(
  taak: UitgaandePostTaak,
  lang: Lang,
  contextOverride?: Partial<Context>,
): Promise<{ ok: true } | { ok: false; foutCode: string; foutTekst: string }> {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const ctx = huidigeContext(contextOverride);
  let volledig = { ...taak };

  // Якщо завдання підхоплено на іншому піддомені і текст відсутній у localStorage цього піддомену — завантажуємо чернетку з сервера
  if (!volledig.plainText && !volledig.html && volledig.draftLocalId) {
    try {
      const r = await getDraftRemote(ctx, volledig.draftLocalId);
      if (r?.draft) {
        volledig = {
          ...volledig,
          aan: volledig.aan || r.draft.to || '',
          cc: volledig.cc || r.draft.cc || '',
          bcc: volledig.bcc || r.draft.bcc || '',
          onderwerp: volledig.onderwerp || r.draft.subject || '',
          html: r.draft.html || '',
          plainText: r.draft.plainText || '',
          accountId: volledig.accountId || r.draft.accountId || '',
          threadId: volledig.threadId || r.draft.threadId || '',
        };
      }
    } catch { /* чернетка недоступна */ }
  }

  try {
    if (volledig.soort === 'antwoord') {
      if (!volledig.threadId || (!volledig.plainText?.trim() && !volledig.html?.trim() && !(volledig.attachments || []).length)) {
        throw new Error('GOOGLE_MAIL_REPLY_INVALID');
      }
      await api.post(
        '/api/owner/mail/google-suite/reply',
        {
          ...ctx,
          accountId: volledig.accountId,
          threadId: volledig.threadId,
          plainText: volledig.plainText || '',
          html: volledig.html || '',
          attachments: volledig.attachments || [],
          replyMode: volledig.replyMode || 'sender',
          requestId: volledig.requestId,
        },
        { keepalive: true, achtergrond: true },
      );
      if (volledig.draftLocalId) {
        void deleteDraftRemote(ctx, volledig.draftLocalId).catch(() => undefined);
      }
    } else {
      const out = await sendRemote(
        ctx,
        {
          to: volledig.aan,
          cc: volledig.cc || '',
          bcc: volledig.bcc || '',
          subject: volledig.onderwerp,
          html: volledig.html || '',
          plainText: volledig.plainText || '',
          accountId: volledig.accountId,
          localId: volledig.draftLocalId,
          ...(volledig.attachments?.length ? { attachments: volledig.attachments } : {}),
        },
        volledig.requestId,
      );
      if (out?.item?.status !== 'sent') {
        throw new Error(String((out as { error?: string })?.error || out?.item?.lastError || 'MAIL_SEND_FAILED'));
      }
    }

    const zichtbaar = isTabZichtbaar();
    const host = huidigeHost();
    const geslaagd: UitgaandePostTaak = {
      ...volledig,
      status: 'verzonden',
      foutCode: '',
      tijd: Date.now(),
      gemeldStatus: zichtbaar ? 'verzonden' : '',
      gemeldHost: zichtbaar ? host : '',
    };
    bewaarUitgaandePostTaak(geslaagd);
    if (zichtbaar) toonVerzondenMeldingBox(geslaagd, lang);
    return { ok: true };
  } catch (caught) {
    const foutCode = foutCodeUit(caught);
    const foutTekst = composeErrorText(foutCode, t);
    // Надійно зберігаємо чернетку на сервері, щоб текст був доступний на всіх піддоменах
    if (volledig.draftLocalId && (volledig.html || volledig.plainText)) {
      void saveDraftRemote(ctx, {
        to: volledig.soort === 'nieuw' ? volledig.aan : '',
        cc: volledig.cc || '',
        bcc: volledig.bcc || '',
        subject: volledig.onderwerp || '',
        html: volledig.html || '',
        plainText: volledig.plainText || '',
        accountId: volledig.accountId,
        localId: volledig.draftLocalId,
        ...(volledig.threadId ? { threadId: volledig.threadId, replyToMessageId: volledig.replyToMessageId || volledig.threadId, replyAll: volledig.replyMode === 'all' } : {}),
      } as never).catch(() => undefined);
    }
    const zichtbaar = isTabZichtbaar();
    const host = huidigeHost();
    const mislukt: UitgaandePostTaak = {
      ...volledig,
      status: 'mislukt',
      foutCode,
      tijd: Date.now(),
      gemeldStatus: zichtbaar ? 'mislukt' : '',
      gemeldHost: zichtbaar ? host : '',
    };
    bewaarUitgaandePostTaak(mislukt);
    if (zichtbaar) toonMisluktMeldingBox(mislukt, lang);
    return { ok: false, foutCode, foutTekst };
  }
}

/** Фонове надсилання відповіді у гілці листування (MailGesprekInhoud.tsx). */
export async function verzendAntwoordOpAchtergrond(invoer: {
  lang: Lang;
  context: Partial<Context>;
  accountId: string;
  threadId: string;
  replyToMessageId?: string;
  aan: string;
  onderwerp: string;
  plainText: string;
  html: string;
  attachments: UitgaandePostBijlage[];
  replyMode: 'sender' | 'all';
  requestId?: string;
}): Promise<{ ok: true } | { ok: false; foutCode: string; foutTekst: string }> {
  const requestId = invoer.requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rep-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const draftLocalId = antwoordId(invoer.accountId || 'primary', invoer.threadId);
  const taak: UitgaandePostTaak = {
    id: requestId,
    requestId,
    soort: 'antwoord',
    status: 'verzenden',
    accountId: invoer.accountId,
    threadId: invoer.threadId,
    replyToMessageId: invoer.replyToMessageId || invoer.threadId,
    replyMode: invoer.replyMode,
    draftLocalId,
    aan: invoer.aan,
    onderwerp: invoer.onderwerp,
    plainText: invoer.plainText,
    html: invoer.html,
    attachments: invoer.attachments,
    tijd: Date.now(),
    bronHost: huidigeHost(),
    gemeldStatus: '',
    gemeldHost: '',
  };

  bewaarUitgaandePostTaak(taak);
  toonVerzendenSignaal(taak);

  // Зберігаємо чернетку на сервері з keepalive, щоб у разі миттєвого переходу на інший піддомен текст уже був у PostgreSQL
  const ctx = huidigeContext(invoer.context);
  void saveDraftRemote(ctx, {
    to: '',
    cc: '',
    bcc: '',
    subject: invoer.onderwerp || '',
    html: invoer.html,
    plainText: invoer.plainText,
    accountId: invoer.accountId,
    localId: draftLocalId,
    ...({ threadId: invoer.threadId, replyToMessageId: invoer.replyToMessageId || invoer.threadId, replyAll: invoer.replyMode === 'all' } as Record<string, unknown>),
  } as never).catch(() => undefined);

  const belofte = voerVerzendingUit(taak, invoer.lang, invoer.context);
  lopendeVerzoeken.set(taak.id, belofte.then((r) => r.ok));
  try {
    return await belofte;
  } finally {
    lopendeVerzoeken.delete(taak.id);
  }
}

/** Фонове надсилання нового листа (MailNieuwBerichtDialoog.tsx). */
export async function verzendNieuwBerichtOpAchtergrond(invoer: {
  lang: Lang;
  context: Partial<Context>;
  accountId: string;
  localId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  plainText: string;
  attachments?: UitgaandePostBijlage[];
  requestId: string;
}): Promise<{ ok: true } | { ok: false; foutCode: string; foutTekst: string }> {
  const taak: UitgaandePostTaak = {
    id: invoer.requestId,
    requestId: invoer.requestId,
    soort: 'nieuw',
    status: 'verzenden',
    accountId: invoer.accountId,
    draftLocalId: invoer.localId,
    aan: invoer.to,
    cc: invoer.cc,
    bcc: invoer.bcc,
    onderwerp: invoer.subject,
    plainText: invoer.plainText,
    html: invoer.html,
    attachments: invoer.attachments,
    tijd: Date.now(),
    bronHost: huidigeHost(),
    gemeldStatus: '',
    gemeldHost: '',
  };

  bewaarUitgaandePostTaak(taak);
  toonVerzendenSignaal(taak);

  const ctx = huidigeContext(invoer.context);
  if (invoer.localId && /^[A-Za-z0-9_-]{8,80}$/.test(invoer.localId)) {
    void saveDraftRemote(ctx, {
      to: invoer.to,
      cc: invoer.cc,
      bcc: invoer.bcc,
      subject: invoer.subject,
      html: invoer.html,
      plainText: invoer.plainText,
      accountId: invoer.accountId,
      localId: invoer.localId,
    }).catch(() => undefined);
  }

  const belofte = voerVerzendingUit(taak, invoer.lang, invoer.context);
  lopendeVerzoeken.set(taak.id, belofte.then((r) => r.ok));
  try {
    return await belofte;
  } finally {
    lopendeVerzoeken.delete(taak.id);
  }
}

/** Повторне надсилання завдання за натисканням кнопки «Повторити надсилання» у спливному боксі сповіщення на будь-якому піддомені. */
export async function herhaalUitgaandePost(taakId: string, lang: Lang): Promise<boolean> {
  if (lopendeVerzoeken.has(taakId)) return lopendeVerzoeken.get(taakId)!;
  const taak = leesUitgaandePostTaken().find((x) => x.id === taakId);
  if (!taak) return false;
  const opnieuw: UitgaandePostTaak = {
    ...taak,
    status: 'verzenden',
    foutCode: '',
    tijd: Date.now(),
    gemeldStatus: '',
    gemeldHost: '',
  };
  bewaarUitgaandePostTaak(opnieuw);
  toonVerzendenSignaal(opnieuw);
  const belofte = voerVerzendingUit(opnieuw, lang).then((r) => r.ok);
  lopendeVerzoeken.set(taakId, belofte);
  try {
    return await belofte;
  } finally {
    lopendeVerzoeken.delete(taakId);
  }
}

/**
 * Перевіряє стан міждоменної черги вихідної пошти на поточному піддомені:
 * - якщо завдання з іншого піддомену залишилося у стані 'verzenden' (> 4,5 с після переходу між піддоменами) — автоматично досилає його у фоні;
 * - якщо завдання має стан 'mislukt' або 'verzonden' і ще не було показано на цьому піддомені — показує спливний бокс сповіщення.
 */
export async function controleerUitgaandePostOpSubdomein(lang: Lang, aangemeld: boolean): Promise<void> {
  if (!aangemeld || typeof window === 'undefined') return;
  const taken = leesUitgaandePostTaken();
  if (!taken.length) return;
  const nu = Date.now();
  const host = huidigeHost();

  for (const taak of taken) {
    if (lopendeVerzoeken.has(taak.id)) continue;
    const ouderdom = nu - taak.tijd;
    if (taak.status === 'verzenden') {
      toonVerzendenSignaal(taak);
      if ((taak.bronHost !== host && ouderdom >= OVERNAME_NA_MS) || ouderdom >= 15_000) {
        void herhaalUitgaandePost(taak.id, lang);
      }
    } else if (taak.status === 'mislukt' && (taak.gemeldStatus !== 'mislukt' || (taak.gemeldHost !== host && ouderdom <= 15 * 60_000))) {
      const bijgewerkt: UitgaandePostTaak = { ...taak, gemeldStatus: 'mislukt', gemeldHost: host };
      bewaarUitgaandePostTaak(bijgewerkt);
      toonMisluktMeldingBox(bijgewerkt, lang);
    } else if (taak.status === 'verzonden' && taak.gemeldStatus !== 'verzonden' && ouderdom <= 5 * 60_000) {
      const bijgewerkt: UitgaandePostTaak = { ...taak, gemeldStatus: 'verzonden', gemeldHost: host };
      bewaarUitgaandePostTaak(bijgewerkt);
      toonVerzondenMeldingBox(bijgewerkt, lang);
    }
  }
}

