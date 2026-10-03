import { useEffect, useRef, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { api } from './platform/client';
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
};

export default function MailNewMessageDialog({ lang, open, accountId, context, onClose, onSent }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
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

  if (!open) return null;

  const reset = () => {
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setSubject('');
    setBody('');
    setFailure('');
  };

  const close = () => {
    // Closing must not destroy what was typed. The draft stays in state, so
    // reopening the window brings the text back; only a successful send clears it.
    onClose();
  };

  const send = async () => {
    const plainText = editorRef.current?.getPlainText().trim() || '';
    if (!accountId || sending || !to.trim() || !plainText) return;
    setSending(true);
    setFailure('');
    try {
      const prepared = await api.post(`/api/owner/mail/accounts/${accountId}/send/prepare`, {
        ...context,
        to,
        cc,
        bcc,
        subject,
        plainText,
      });
      await api.post(`/api/owner/mail/accounts/${accountId}/send/confirm`, {
        ...context,
        commandId: prepared.data.commandId,
        confirmationToken: prepared.data.confirmationToken,
      });
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      reset();
      onSent();
      onClose();
    } catch {
      setFailure(
        t(
          'Лист зараз не вдалося надіслати. Текст залишився у редакторі.',
          'Het bericht kon nu niet worden verzonden. De tekst blijft in de editor staan.',
        ),
      );
    }
    setSending(false);
  };

  return (
    <div className="mail-new-message-backdrop" onClick={close}>
      <section
        className="mail-new-message"
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        style={
          rect && typeof window !== 'undefined' && window.innerWidth > 560
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
          <button type="button" aria-label={t('Закрити', 'Sluiten')} onClick={close}>
            <X />
          </button>
        </header>
        <label className="mail-new-message-field">
          <span>{t('Кому', 'Aan')}</span>
          <input value={to} onChange={event => setTo(event.target.value)} placeholder="name@example.com" autoFocus />
        </label>
        {!showCc && (
          <button type="button" className="mail-new-message-cc-toggle" onClick={() => setShowCc(true)}>
            {t('Копія, прихована копія', 'Cc, Bcc')}
          </button>
        )}
        {showCc && (
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
        <MailComposeEditor
          ref={editorRef}
          lang={lang}
          value={body}
          onChange={setBody}
          placeholder={t('Напишіть лист…', 'Schrijf een bericht…')}
          onRequestImage={() => imageInputRef.current?.click()}
        />
        <input ref={imageInputRef} type="file" accept="image/*" hidden />
        <MailInputTools
          lang={lang}
          context={context}
          onInsert={value => editorRef.current?.insertText(value)}
          onBackspace={() => editorRef.current?.backspace()}
        />
        <footer>
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
