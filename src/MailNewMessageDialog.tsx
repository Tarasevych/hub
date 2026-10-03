import { useEffect, useRef, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { api } from './platform/client';
import MailComposeEditor, { type MailComposeEditorHandle } from './MailComposeEditor';
import MailInputTools from './MailInputTools';
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
      <section className="mail-new-message" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
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
