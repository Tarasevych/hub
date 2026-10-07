import { useEffect, useRef, useState } from 'react';
import { Copy, CornerUpLeft, LoaderCircle, Sparkles, TextQuote, X } from 'lucide-react';
import { aiReply, aiSummarize, composeErrorText, type Context, type Lang } from './mail-compose-api';
import './mail-reader-ai.css';

type ThreadItem = { from: string; receivedAt: number; plainText: string };
type Props = { lang: Lang; context: Context; messages: ThreadItem[]; onUseReply: (html: string) => void };

const TONES: Array<[string, string, string]> = [['', 'Як зазвичай', 'Zoals gewoonlijk'], ['formal', 'Офіційно', 'Formeel'], ['friendly', 'Дружньо', 'Vriendelijk'], ['short', 'Коротко', 'Kort']];

/**
 * ШІ у вікні читання листа: підсумок розмови та чернетка відповіді. Лист — недовірені дані (сервер огортає його як такий), відповідь
 * нічого не надсилає: її можна лише вставити в поле відповіді, яке ви перевіряєте й надсилаєте самі. Працює з вашим ключем Anthropic.
 */
export default function MailReaderAi({ lang, context, messages, onUseReply }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'summary' | 'reply'>('');
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState('');
  const [result, setResult] = useState<{ kind: 'summary' | 'reply'; text: string; html: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Інший лист у вікні = старий результат більше не стосується.
  const key = messages.map((m) => `${m.from}|${m.receivedAt}`).join(';');
  useEffect(() => { setResult(null); setError(''); }, [key]);

  const payload = () => messages.slice(-8).map((m) => ({ from: m.from, date: m.receivedAt ? new Date(m.receivedAt).toISOString() : '', text: m.plainText.slice(0, 12_000) }));
  const run = async (kind: 'summary' | 'reply') => {
    setBusy(kind); setError(''); setResult(null); setCopied(false);
    try {
      const out = kind === 'summary'
        ? await aiSummarize(context, { messages: payload(), language: lang })
        : await aiReply(context, { messages: payload(), language: lang, instruction: instruction.trim() || undefined, tone: tone || undefined });
      if (alive.current) setResult({ kind, text: out.text, html: out.html });
    } catch (e) { if (alive.current) setError(composeErrorText(e, t)); } finally { if (alive.current) setBusy(''); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(result?.text || ''); setCopied(true); } catch { setError(t('Не вдалося скопіювати.', 'Kopiëren is niet gelukt.')); } };
  const empty = !messages.some((m) => m.plainText.trim());

  return <section className="mra" aria-label={t('ШІ-помічник для листа', 'AI-hulp bij het bericht')}>
    <div className="mra-bar">
      <button type="button" className="mra-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Sparkles size={15} />{t('ШІ', 'AI')}</button>
      {open && <>
        <button type="button" disabled={!!busy || empty} onClick={() => void run('summary')}>{busy === 'summary' ? <LoaderCircle size={14} className="mra-spin" /> : <TextQuote size={14} />}{t('Підсумок', 'Samenvatting')}</button>
        <button type="button" disabled={!!busy || empty} onClick={() => void run('reply')}>{busy === 'reply' ? <LoaderCircle size={14} className="mra-spin" /> : <CornerUpLeft size={14} />}{t('Чернетка відповіді', 'Antwoordconcept')}</button>
        <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label={t('Тон відповіді', 'Toon van het antwoord')}>{TONES.map(([id, uk, nl]) => <option key={id} value={id}>{t(uk, nl)}</option>)}</select>
        <input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} placeholder={t('Що має бути у відповіді? (необов’язково)', 'Wat moet in het antwoord staan? (optioneel)')} aria-label={t('Побажання до відповіді', 'Wens voor het antwoord')} />
      </>}
    </div>
    {open && empty && <p className="mra-note">{t('У цьому листі немає тексту для аналізу.', 'Dit bericht bevat geen tekst om te analyseren.')}</p>}
    {error && <p className="mra-error" role="alert">{error}</p>}
    {result && <article className="mra-result" aria-live="polite">
      <header><strong>{result.kind === 'summary' ? t('Підсумок розмови', 'Samenvatting van het gesprek') : t('Чернетка відповіді', 'Antwoordconcept')}</strong>
        <button type="button" className="mra-icon" onClick={() => setResult(null)} aria-label={t('Закрити', 'Sluiten')}><X size={14} /></button></header>
      <div className="mra-text">{result.text}</div>
      <footer>
        {result.kind === 'reply' && <button type="button" className="mra-primary" onClick={() => { onUseReply(result.html); setResult(null); }}><CornerUpLeft size={14} />{t('Вставити у відповідь', 'In antwoord plaatsen')}</button>}
        <button type="button" onClick={() => void copy()}><Copy size={14} />{copied ? t('Скопійовано', 'Gekopieerd') : t('Копіювати', 'Kopiëren')}</button>
        <small>{t('Створено ШІ — перевірте перед надсиланням. Нічого не надіслано.', 'Door AI gemaakt — controleer vóór het verzenden. Er is niets verzonden.')}</small>
      </footer>
    </article>}
  </section>;
}
