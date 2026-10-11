import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, CircleAlert, Cloud, CloudOff, Keyboard, LoaderCircle, Mail, Maximize2, Minimize2, Minus, Send, Trash2, X } from 'lucide-react';
import { registreerZwevend, useZwevendHouder, verwijderZwevend } from './mail-zwevend';
import { emitCanonicalNotice } from './canonical-notifications';
import MailAiToolbar from './MailAiToolbar';
import MailScheduleMenu from './MailScheduleMenu';
import { composeErrorText, deleteDraftRemote, getDraftRemote, saveDraftRemote, scheduleRemote, sendRemote, type DraftSync } from './mail-compose-api';
import './mail-concepten.css';
import MailComposeEditor, { type MailComposeEditorHandle } from './MailComposeEditor';
import MailInputTools from './MailInputTools';
import { registerZone, queueRecompute } from './floating-avoidance';
import './mail-new-message.css';

type Props = {
  lang: 'uk' | 'nl';
  open: boolean;
  accountId: string;
  context: { service: string; tabContext: string; sourceOrigin: string };
  onClose: () => void;
  onSent: () => void;
  /** Opent het venster opnieuw (vanuit de plashka «Чернетка» rechtsonder). */
  onOpen?: () => void;
};

export default function MailNewMessageDialog({ lang, open, accountId, context, onClose, onSent, onOpen }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [draftSync, setDraftSync] = useState<DraftSync>('idle');
  const [weggooiVraag, setWeggooiVraag] = useState(false);
  // Vensterstanden (zoals in Windows/Gmail): gemaximaliseerd, «hele tekst» (de editor groeit met de tekst, het venster scrolt)
  // en de invoerhulpen (UA/NL, translit, klavier, handschrift) in- of uitgeklapt. Onthouden in deze browser.
  const leesVlag = (k: string, std: boolean) => { try { const v = localStorage.getItem(k); return v === null ? std : v === '1'; } catch { return std; } };
  const zetVlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* geen opslag */ } };
  const [groot, setGroot] = useState(() => leesVlag('mail-nm-groot', false));
  const [heelTekst, setHeelTekst] = useState(() => leesVlag('mail-nm-heel-tekst', false));
  const [hulpen, setHulpen] = useState(() => leesVlag('mail-nm-hulpen', false));
  const [verborgen, setVerborgen] = useState(false);
  // Eén aanvraag-id per verzendpoging: een dubbele klik of een herhaling na een time-out maakt nooit twee berichten (idempotent op de server).
  const requestIdRef = useRef<string>('');
  const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const editorRef = useRef<MailComposeEditorHandle | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ dir: string; startX: number; startY: number; startW: number; startH: number; startTop: number; startLeft: number } | null>(null);
  const [rect, setRect] = useState<{ width: number; height: number; top: number; left: number } | null>(() => {
    try {
      const raw = localStorage.getItem('mail-new-message-rect');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });
  // A stable, account-independent draft id: accountId loads asynchronously,
  // so keying the draft by it caused early keystrokes (typed before the
  // account resolved) to be saved under a different key than later ones,
  // silently splitting/losing the start of the draft.
  const localDraftIdRef = useRef<string>('');
  if (!localDraftIdRef.current) {
    try {
      let id = localStorage.getItem('mail-draft-active-id');
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('mail-draft-active-id', id);
      }
      localDraftIdRef.current = id;
    } catch {
      localDraftIdRef.current = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }
  const draftKey = `mail-draft-${localDraftIdRef.current}`;
  const draftFieldsRef = useRef({ to, cc, bcc, subject, body });
  useEffect(() => {
    draftFieldsRef.current = { to, cc, bcc, subject, body };
  });

  useEffect(() => {
    const flushOnExit = () => {
      const f = draftFieldsRef.current;
      const hasContent = Boolean(f.to.trim() || f.cc.trim() || f.bcc.trim() || f.subject.trim() || f.body.trim());
      try {
        if (hasContent) {
          localStorage.setItem(draftKey, JSON.stringify({ ...f, savedAt: Date.now() }));
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch {}
    };
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', flushOnExit);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('beforeunload', flushOnExit);
    };
  }, [draftKey]);

  useEffect(() => {
    // While the compose window is open (and while it is being dragged/resized),
    // register it as a fixed obstacle so the floating compose-launch button can
    // step out of the way of its Close/Send controls instead of covering them.
    if (!open) return;
    const unregister = registerZone({
      id: 'mail-new-message-dialog',
      priority: 100,
      kind: 'float',
      getRect: () => dialogRef.current?.getBoundingClientRect() || null,
      fallbacks: [],
    });
    queueRecompute();
    return unregister;
  }, [open]);

  useEffect(() => {
    if (!open || !rect) return;
    const margin = 8;
    const maxW = window.innerWidth - margin * 2;
    const maxH = window.innerHeight - margin * 2;
    let { width, height, top, left } = rect;
    let changed = false;
    if (width > maxW) { width = maxW; changed = true; }
    if (height > maxH) { height = maxH; changed = true; }
    if (left + width > window.innerWidth - margin) { left = Math.max(margin, window.innerWidth - width - margin); changed = true; }
    if (top + height > window.innerHeight - margin) { top = Math.max(margin, window.innerHeight - height - margin); changed = true; }
    if (left < margin) { left = margin; changed = true; }
    if (top < margin) { top = margin; changed = true; }
    if (changed) setRect({ width, height, top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Anything that opened on top of the compose window owns Escape first.
      if (document.querySelector('.canonical-notification-panel, .mail-compose-floating-formatting, .mail-reader-organize-backdrop, .mail-reader-n09-backdrop, .mail-reader-n10-backdrop')) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const startResize = (dir: string) => (event: { preventDefault: () => void; clientX: number; clientY: number }) => {
    event.preventDefault();
    const node = dialogRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    resizeStateRef.current = { dir, startX: event.clientX, startY: event.clientY, startW: box.width, startH: box.height, startTop: box.top, startLeft: box.left };
    const move = (moveEvent: globalThis.MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      const margin = 8;
      let width = state.startW;
      let left = state.startLeft;
      let height = state.startH;
      let top = state.startTop;
      // Each handle drags its own edge; the opposite edge stays put, the way a real window resizes.
      // Growth simply stops at the screen edge instead of dragging the opposite corner along with it.
      if (state.dir.includes('e')) {
        width = Math.min(1200, Math.max(380, state.startW + dx));
        const maxW = window.innerWidth - left - margin;
        if (width > maxW) width = Math.max(380, maxW);
      }
      if (state.dir.includes('w')) {
        let rawWidth = Math.min(1200, Math.max(380, state.startW - dx));
        let newLeft = state.startLeft + (state.startW - rawWidth);
        if (newLeft < margin) {
          newLeft = margin;
          rawWidth = Math.max(380, state.startLeft + state.startW - margin);
        }
        width = rawWidth;
        left = newLeft;
      }
      if (state.dir.includes('s')) {
        height = Math.min(980, Math.max(320, state.startH + dy));
        const maxH = window.innerHeight - top - margin;
        if (height > maxH) height = Math.max(320, maxH);
      }
      if (state.dir.includes('n')) {
        let rawHeight = Math.min(980, Math.max(320, state.startH - dy));
        let newTop = state.startTop + (state.startH - rawHeight);
        if (newTop < margin) {
          newTop = margin;
          rawHeight = Math.max(320, state.startTop + state.startH - margin);
        }
        height = rawHeight;
        top = newTop;
      }
      setRect({ width, height, top, left });
      queueRecompute();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('pointermove', move as unknown as EventListener);
      window.removeEventListener('pointerup', up);
      resizeStateRef.current = null;
      setRect(current => {
        if (current) {
          try {
            localStorage.setItem('mail-new-message-rect', JSON.stringify(current));
          } catch {}
        }
        return current;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('pointermove', move as unknown as EventListener);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.to) setTo(saved.to);
          if (saved.cc) { setCc(saved.cc); setShowCc(true); }
          if (saved.bcc) { setBcc(saved.bcc); setShowCc(true); }
          if (saved.subject) setSubject(saved.subject);
          if (saved.body) setBody(saved.body);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.trim());
    const flush = () => {
      try {
        if (hasContent) {
          localStorage.setItem(draftKey, JSON.stringify({ to, cc, bcc, subject, body, savedAt: Date.now() }));
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch {}
    };
    const timer = window.setTimeout(flush, 400);
    return () => {
      window.clearTimeout(timer);
      // Flush instead of discard: this closure still holds the latest
      // to/cc/bcc/subject/body, so an edit made right before the next
      // keystroke's effect replaces this one is written, not lost.
      flush();
    };
  }, [to, cc, bcc, subject, body, draftKey]);

  // Concept eerst lokaal in PostgreSQL (de server bewaart het meteen), daarna door de server naar Gmail gesynchroniseerd. 700 ms na de laatste toets.
  const serverSaveSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const hasContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.trim());
    if (!hasContent) return;
    const seq = ++serverSaveSeq.current;
    setDraftSync('saving');
    const timer = window.setTimeout(async () => {
      const plainText = editorRef.current?.getPlainText() ?? '';
      try {
        const out = await saveDraftRemote(context, { to, cc, bcc, subject, html: body, plainText, accountId, localId: localDraftIdRef.current });
        if (seq === serverSaveSeq.current) setDraftSync(out?.draft?.syncStatus === 'synced' ? 'synced' : out?.draft?.syncStatus === 'error' ? 'error' : 'local');
      } catch {
        // De lokale kopie in de browser blijft bestaan (localStorage hierboven); de volgende wijziging probeert het opnieuw.
        if (seq === serverSaveSeq.current) setDraftSync('error');
      }
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, accountId, open]);

  // Чернетку відкривають явно (з «Чернеток» чи іншого місця): window 'mail:open-concept' {localId}. «Написати лист» сам чернеток не підтягує (1.6).
  useEffect(() => {
    const opener = (e: Event) => {
      const id = String((e as CustomEvent<{ localId?: string }>).detail?.localId || '');
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return;
      void getDraftRemote(context, id).then((out) => {
        const d = out?.draft; if (!d) return;
        localDraftIdRef.current = id;
        try { localStorage.setItem('mail-draft-active-id', id); } catch { /* geen opslag */ }
        setTo(d.to || ''); setCc(d.cc || ''); setBcc(d.bcc || ''); setShowCc(Boolean(d.cc || d.bcc)); setSubject(d.subject || ''); setBody(d.html || '');
        herstelRef.current = true; setVerborgen(false); onOpen?.();
      }).catch(() => undefined);
    };
    window.addEventListener('mail:open-concept', opener);
    return () => window.removeEventListener('mail:open-concept', opener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heeftInhoud = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.replace(/<[^>]*>/g, '').trim());
  const zwevendHeeftHouder = useZwevendHouder();
  // «Написати лист» = завжди чистий лист (1.6). Відкрили не зі стопки «Згорнуті», а в редакторі лишився попередній текст? Тоді
  // попередній лист уже збережено як чернетку (сервер + Gmail) — відокремлюємо його й починаємо новий з новим id.
  // 2.7: перехід в інший розділ (посилання поза вікном, «назад») — порожнє вікно закривається, з текстом іде в «Згорнуті» й «Чернетки».
  useEffect(() => {
    if (!open) return;
    const weg = () => onClose();
    const klik = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || dialogRef.current?.contains(el)) return;
      if (el.closest('a[href], [data-nav-item], nav button, .mail-sidebar-navigation button')) weg();
    };
    document.addEventListener('click', klik, true);
    window.addEventListener('popstate', weg);
    return () => { document.removeEventListener('click', klik, true); window.removeEventListener('popstate', weg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // 4.1: відкрита екранна клавіатура телефона — вікно займає лише видиму частину, шапка й нижній рядок компактні
  const [klavier, setKlavier] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!open || !vv) return;
    const meet = () => { const verschil = window.innerHeight - vv.height; setKlavier(verschil > 140 ? Math.round(vv.height) : 0); };
    meet(); vv.addEventListener('resize', meet);
    return () => vv.removeEventListener('resize', meet);
  }, [open]);
  const herstelRef = useRef(false);
  const [wisVraag, setWisVraag] = useState(false);
  const [kopOpen, setKopOpen] = useState(true);
  const vorigOpen = useRef(open);
  useEffect(() => {
    const was = vorigOpen.current; vorigOpen.current = open;
    if (!open || was) return;
    const herstel = herstelRef.current; herstelRef.current = false;
    if (herstel || !heeftInhoud) return;
    const oudId = localDraftIdRef.current;
    void saveDraftRemote(context, { to, cc, bcc, subject, html: body, plainText: editorRef.current?.getPlainText() ?? '', accountId, localId: oudId }).catch(() => undefined);
    try { localStorage.removeItem(`mail-draft-${oudId}`); localStorage.removeItem('mail-draft-active-id'); } catch { /* geen opslag */ }
    localDraftIdRef.current = '';
    serverSaveSeq.current++;
    setTo(''); setCc(''); setBcc(''); setShowCc(false); setSubject(''); setBody(''); setFailure(''); setDraftSync('idle'); setVerborgen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const id = 'concept-nieuw';
    if (open || !heeftInhoud || !onOpen || verborgen) { verwijderZwevend(id); return; }
    registreerZwevend({ id, titel: subject.trim() || t('Новий лист (без теми)', 'Nieuw bericht (zonder onderwerp)'), sub: to.trim() ? `${t('Кому', 'Aan')}: ${to}` : t('Чернетка збережена', 'Concept bewaard'), open: () => { herstelRef.current = true; setVerborgen(false); onOpen(); }, sluit: () => setVerborgen(true) });
    return () => verwijderZwevend(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, heeftInhoud, subject, to, verborgen]);
  // Concept weggooien vanaf de plashka: lokaal, op de server en in Gmail; volgende brief krijgt een nieuw concept-id.
  const gooiWeg = () => {
    const id = localDraftIdRef.current;
    try { localStorage.removeItem(`mail-draft-${id}`); localStorage.removeItem('mail-draft-active-id'); } catch { /* geen opslag */ }
    localDraftIdRef.current = '';
    serverSaveSeq.current++;
    void deleteDraftRemote(context, id).catch(() => undefined);
    setTo(''); setCc(''); setBcc(''); setShowCc(false); setSubject(''); setBody(''); setFailure(''); setDraftSync('idle'); setWeggooiVraag(false);
  };
  if (!open) {
    // Ingeklapt: de brief verdwijnt niet. Hij staat (via mail-zwevend) in de gezamenlijke stapel «Згорнуті» van Пошта — samen met
    // de geminimaliseerde brieven en bijlagen, zodat u elk geminimaliseerd venster kunt terughalen. Is die stapel er niet
    // (een ander scherm van Пошта), dan een eigen plashka rechtsonder. En hij staat in «Чернетки».
    if (!heeftInhoud || !onOpen || verborgen) return null;
    if (zwevendHeeftHouder) return null;
    return createPortal(
      <div className="mail-concept-dok" role="region" aria-label={t('Чернетка листа', 'Concept-bericht')} data-concept-dok>
        <button type="button" onClick={() => { setWeggooiVraag(false); onOpen(); }}>
          <Mail aria-hidden="true" />
          <span><strong>{subject.trim() || t('Новий лист (без теми)', 'Nieuw bericht (zonder onderwerp)')}</strong><small>{to.trim() ? `${t('Кому', 'Aan')}: ${to}` : t('Чернетка збережена', 'Concept bewaard')}</small></span>
        </button>
        {!weggooiVraag
          ? <button type="button" className="mail-concept-weg" aria-label={t('Видалити чернетку', 'Concept verwijderen')} title={t('Видалити чернетку', 'Concept verwijderen')} onClick={() => setWeggooiVraag(true)}><Trash2 aria-hidden="true" /></button>
          : <button type="button" className="mail-concept-weg" onClick={gooiWeg} data-concept-weg-bevestig><Trash2 aria-hidden="true" />{t('Так, видалити', 'Ja, verwijderen')}</button>}
      </div>,
      document.body,
    );
  }

  const reset = () => {
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setSubject('');
    setBody('');
    setFailure('');
  };

  // _ = згорнути (лишається у стопці «Згорнуті» та в «Чернетках»); × = закрити (чернетка лишається в «Чернетках», без плашки).
  // Нічого з написаного не зникає: лише успішне надсилання очищає чернетку.
  const close = () => { setVerborgen(false); onClose(); };
  const sluitHelemaal = () => {
    if (heeftInhoud) emitCanonicalNotice({ text: t('Чернетку збережено в «Чернетках»', 'Concept bewaard in «Concepten»'), kind: 'success', source: 'mail',
      action: { label: t('Відкрити знову', 'Opnieuw openen'), onAction: () => { herstelRef.current = true; setVerborgen(false); onOpen?.(); } }, actionExpiresAt: Date.now() + 30000 });
    setVerborgen(true); onClose();
  };
  const verwijderConcept = () => { gooiWeg(); setWisVraag(false); emitCanonicalNotice({ text: t('Чернетку видалено', 'Concept verwijderd'), kind: 'info', source: 'mail' }); onClose();
  };

  // Na een geslaagde verzending of planning: lokaal alles opruimen en een NIEUW concept-id kiezen voor het volgende bericht.
  const finishCompose = () => {
    const finishedId = localDraftIdRef.current;
    try { localStorage.removeItem(draftKey); localStorage.removeItem('mail-draft-active-id'); } catch {}
    localDraftIdRef.current = '';
    void deleteDraftRemote(context, finishedId).catch(() => undefined);
    requestIdRef.current = '';
    serverSaveSeq.current++;
    setDraftSync('idle');
    reset();
    onSent();
    onClose();
  };
  const payload = () => ({ to, cc, bcc, subject, html: body, plainText: editorRef.current?.getPlainText().trim() || '', accountId, localId: localDraftIdRef.current });

  const send = async () => {
    const plainText = editorRef.current?.getPlainText().trim() || '';
    if (!accountId || sending || !to.trim() || !plainText) return;
    setSending(true);
    setFailure('');
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    try {
      // De server verstuurt de HTML-versie én een platte-tekstversie via de Gmail API (users.messages.send).
      const out = await sendRemote(context, payload(), requestIdRef.current);
      if (out?.item?.status === 'sent') {
        emitCanonicalNotice({ text: t('Лист надіслано', 'Bericht verzonden'), kind: 'success', source: 'mail' });
        finishCompose();
      } else {
        setFailure(t('Лист зараз не вдалося надіслати. Текст залишився у редакторі, спробуйте ще раз.', 'Het bericht kon nu niet worden verzonden. De tekst blijft in de editor staan, probeer het opnieuw.'));
      }
    } catch (error) {
      setFailure(composeErrorText(error, t));
    }
    setSending(false);
  };

  const scheduleSend = async (at: number) => {
    const plainText = editorRef.current?.getPlainText().trim() || '';
    if (!accountId || sending || !to.trim() || !plainText) throw new Error('MAIL_RECIPIENT_REQUIRED');
    setSending(true);
    setFailure('');
    try {
      if (!requestIdRef.current) requestIdRef.current = newRequestId();
      await scheduleRemote(context, payload(), at, requestIdRef.current);
      emitCanonicalNotice({ text: t(`Лист заплановано на ${new Date(at).toLocaleString('uk-UA')}`, `Bericht gepland op ${new Date(at).toLocaleString('nl-BE')}`), kind: 'success', source: 'mail' });
      finishCompose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mail-new-message-backdrop" onClick={close}>
      <section
        className={`mail-new-message${groot ? ' groot' : ''}${heelTekst ? ' heel-tekst' : ''}${klavier ? ' klavier-open' : ''}`}
        data-klavier={klavier ? 'open' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('Новий лист', 'Nieuw bericht')}
        ref={dialogRef}
        style={
          klavier ? { position: 'fixed', top: (window.visualViewport?.offsetTop || 0), left: 0, right: 0, width: '100vw', height: klavier, maxHeight: klavier, margin: 0, borderRadius: 0 }
          : !groot && rect && typeof window !== 'undefined' && window.innerWidth > 560
            ? { position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, maxHeight: rect.height, margin: 0 }
            : undefined
        }
        onClick={event => event.stopPropagation()}
      >
        <span className="mail-new-message-resize mail-new-message-resize-n" onMouseDown={startResize('n')} onPointerDown={startResize('n')} />
        <span className="mail-new-message-resize mail-new-message-resize-s" onMouseDown={startResize('s')} onPointerDown={startResize('s')} />
        <span className="mail-new-message-resize mail-new-message-resize-e" onMouseDown={startResize('e')} onPointerDown={startResize('e')} />
        <span className="mail-new-message-resize mail-new-message-resize-w" onMouseDown={startResize('w')} onPointerDown={startResize('w')} />
        <span className="mail-new-message-resize mail-new-message-resize-ne" onMouseDown={startResize('ne')} onPointerDown={startResize('ne')} />
        <span className="mail-new-message-resize mail-new-message-resize-nw" onMouseDown={startResize('nw')} onPointerDown={startResize('nw')} />
        <span className="mail-new-message-resize mail-new-message-resize-se" onMouseDown={startResize('se')} onPointerDown={startResize('se')} />
        <span className="mail-new-message-resize mail-new-message-resize-sw" onMouseDown={startResize('sw')} onPointerDown={startResize('sw')} />
        <header>
          <Mail aria-hidden="true" />
          <strong>{t('Новий лист', 'Nieuw bericht')}</strong>
          <span className="mail-nm-venster-knoppen">
            <button type="button" aria-label={t('Згорнути (лишиться внизу й у «Чернетках»)', 'Minimaliseren (blijft onderaan en in «Concepten»)')} title={t('Згорнути', 'Minimaliseren')} onClick={close} data-nm-minimaliseer><Minus /></button>
            <button type="button" aria-pressed={groot} aria-label={groot ? t('Відновити розмір', 'Vorige grootte') : t('На весь екран', 'Volledig scherm')} title={groot ? t('Відновити розмір', 'Vorige grootte') : t('На весь екран', 'Volledig scherm')} onClick={() => { setGroot(v => { zetVlag('mail-nm-groot', !v); return !v; }); }} data-nm-maximaliseer>{groot ? <Minimize2 /> : <Maximize2 />}</button>
            <button type="button" aria-label={t('Закрити (чернетка лишиться в «Чернетках»)', 'Sluiten (concept blijft in «Concepten»)')} title={t('Закрити', 'Sluiten')} onClick={sluitHelemaal} data-nm-sluit><X /></button>
          </span>
        </header>
        {/* 1.2: після введення шапка згортається в один рядок; клік або Tab — знову всі поля */}
        {(!kopOpen || (klavier && !document.activeElement?.closest('[data-nm-kop]'))) && to.trim() ? <button type="button" className="mail-nm-kop-kort" onClick={() => setKopOpen(true)} onFocus={() => setKopOpen(true)} data-nm-kop-kort aria-label={t('Змінити отримувачів і тему', 'Ontvangers en onderwerp wijzigen')}>
          <span><b>{t('Кому', 'Aan')}:</b> {to}{cc.trim() ? ` · Cc: ${cc}` : ''}{bcc.trim() ? ` · Bcc: ${bcc}` : ''}</span>
          <span><b>{t('Тема', 'Onderwerp')}:</b> {subject.trim() || t('(без теми)', '(geen onderwerp)')}</span>
        </button>
        : <div className="mail-nm-kop" data-nm-kop onBlur={(e) => { if (to.trim() && !e.currentTarget.contains(e.relatedTarget as Node | null)) setKopOpen(false); }}>
        <div className="mail-new-message-field mail-nm-aan">
          <label htmlFor="mail-nm-aan">{t('Кому', 'Aan')}</label>
          <input id="mail-nm-aan" value={to} onChange={event => setTo(event.target.value)} placeholder="name@example.com" autoFocus={kopOpen && !to} />
          {!(showCc || cc.trim() || bcc.trim()) && <button type="button" className="mail-new-message-cc-toggle" onClick={() => setShowCc(true)} data-nm-kopie>{t('Копія / прихована', 'Cc / Bcc')}</button>}
        </div>
        {(showCc || cc.trim() || bcc.trim()) && (
          <>
            <label className="mail-new-message-field">
              <span>Cc</span>
              <input value={cc} onChange={event => setCc(event.target.value)} />
            </label>
            <label className="mail-new-message-field">
              <span>Bcc</span>
              <input value={bcc} onChange={event => setBcc(event.target.value)} />
            </label>
          </>
        )}
        <label className="mail-new-message-field">
          <span>{t('Тема', 'Onderwerp')}</span>
          <input value={subject} onChange={event => setSubject(event.target.value)} />
        </label>
        </div>}
        <div className="mail-nm-editor">
        <MailComposeEditor
          ref={editorRef}
          lang={lang}
          value={body}
          onChange={setBody}
          placeholder={t('Напишіть лист…', 'Schrijf een bericht…')}
          onRequestImage={() => imageInputRef.current?.click()}
        />
        {/* кнопка в куті редактора: увесь текст одразу (вікно росте й прокручується) ↔ прокрутка всередині редактора */}
        <button type="button" className="mail-nm-hoek" aria-pressed={heelTekst} title={heelTekst ? t('Прокрутка всередині редактора', 'Scrollen in de editor') : t('Показати весь текст', 'Hele tekst tonen')} aria-label={heelTekst ? t('Прокрутка всередині редактора', 'Scrollen in de editor') : t('Показати весь текст', 'Hele tekst tonen')} onClick={() => setHeelTekst(v => { zetVlag('mail-nm-heel-tekst', !v); return !v; })} data-nm-heel-tekst><ChevronsUpDown /></button>
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" hidden />
        {hulpen && <MailInputTools
          lang={lang}
          context={context}
          onInsert={value => editorRef.current?.insertText(value)}
          onBackspace={() => editorRef.current?.backspace()}
        />}
        <footer>
          <MailAiToolbar
            lang={lang}
            context={context}
            getPlain={() => editorRef.current?.getPlainText() ?? ''}
            getHtml={() => body}
            onApply={html => setBody(html)}
            disabled={sending}
          />
          <button type="button" className="mail-nm-hulpen" aria-expanded={hulpen} title={t('Інструменти введення: UA/NL, трансліт, клавіатура, рукопис', 'Invoerhulpen: UA/NL, translit, toetsenbord, handschrift')} onClick={() => setHulpen(v => { zetVlag('mail-nm-hulpen', !v); return !v; })} data-nm-hulpen><Keyboard aria-hidden="true" /><span>{t('Введення', 'Invoer')}</span></button>
          <span className={`mail-new-message-sync sync-${draftSync}`} role="status" data-draft-sync={draftSync}
            title={t('Чернетка зберігається автоматично: спершу на нашому сервері, потім у Gmail.', 'Het concept wordt automatisch bewaard: eerst op onze server, daarna in Gmail.')}>
            {draftSync === 'saving' ? <LoaderCircle aria-hidden="true" /> : draftSync === 'synced' ? <Cloud aria-hidden="true" /> : draftSync === 'error' ? <CircleAlert aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
            {draftSync === 'saving' ? t('Зберігаємо…', 'Bewaren…')
              : draftSync === 'synced' ? t('Чернетку збережено (Gmail)', 'Concept bewaard (Gmail)')
              : draftSync === 'local' ? t('Збережено на сервері, у Gmail ще ні', 'Op de server bewaard, nog niet in Gmail')
              : draftSync === 'error' ? t('Лише в цьому браузері', 'Alleen in deze browser')
              : t('Чернетка', 'Concept')}
          </span>
          {heeftInhoud && !wisVraag && <button type="button" className="mail-nm-wis" onClick={() => setWisVraag(true)} data-nm-wis title={t('Очистити або видалити чернетку', 'Wissen of concept verwijderen')}><Trash2 aria-hidden="true" /><span>{t('Видалити', 'Verwijderen')}</span></button>}
          {wisVraag && <span className="mail-nm-wis-vraag" role="group" aria-label={t('Видалити чернетку?', 'Concept verwijderen?')}>
            <button type="button" className="gevaar" onClick={verwijderConcept} data-nm-wis-bevestig><Trash2 aria-hidden="true" />{t('Видалити чернетку', 'Concept verwijderen')}</button>
            <button type="button" onClick={() => { gooiWeg(); setWisVraag(false); }} data-nm-leeg>{t('Лише очистити', 'Alleen wissen')}</button>
            <button type="button" onClick={() => setWisVraag(false)}>{t('Скасувати', 'Annuleren')}</button>
          </span>}
          <MailScheduleMenu lang={lang} context={context} canSchedule={Boolean(accountId && to.trim() && body.trim())} onSchedule={scheduleSend} busy={sending} />
          <button type="button" className="primary" disabled={sending || !to.trim() || !body.trim()} onClick={() => void send()}>
            <Send />
            {sending ? t('Надсилаємо…', 'Verzenden…') : t('Надіслати', 'Verzenden')}
          </button>
        </footer>
        {failure && <p className="mail-new-message-error">{failure}</p>}
      </section>
    </div>
  );
}
