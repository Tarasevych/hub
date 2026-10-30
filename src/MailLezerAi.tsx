import { useEffect, useRef, useState } from 'react';
import { Copy, CornerUpLeft, Gauge, LoaderCircle, PenLine, Sparkles, TextQuote, WandSparkles, X } from 'lucide-react';
import { aiReply, aiSummarize, composeErrorText, type Context, type Lang } from './mail-opstel-api';
import './mail-lezer-ai.css';

type ThreadItem = { from: string; receivedAt: number; plainText: string };
type Props = {
  lang: Lang; context: Context; messages: ThreadItem[]; onUseReply: (html: string) => void;
  /** Pakket 3: in de antwoordregel van het gesprek (niet meer als losse balk bovenaan — die liep links buiten het kader). */
  vorm?: 'balk' | 'antwoord';
  /** Pakket 3: «Чернетка відповіді» uit «Що від вас потрібно?» (met ШІ): open en maak meteen een concept met deze wens. */
  startSignaal?: { n: number; instructie: string };
};

const TONES: Array<[string, string, string]> = [['', 'Як зазвичай', 'Zoals gewoonlijk'], ['formal', 'Офіційно', 'Formeel'], ['friendly', 'Дружньо', 'Vriendelijk'], ['short', 'Коротко', 'Kort']];

/**
 * ШІ у вікні читання листа: підсумок розмови та чернетка відповіді. Лист — недовірені дані (сервер огортає його як такий), відповідь
 * нічого не надсилає: її можна лише вставити в поле відповіді, яке ви перевіряєте й надсилаєте самі. Працює з вашим ключем Anthropic.
 *
 * Punt 14 (19.10.2026, melding van de eigenaar: «ШІ-кнопки в листі стирчать окремо … вилазять і перекривають, і не мають іконки»):
 *   - De balk is GEEN losse laag meer: elke knop draagt dezelfde klasse als de rest van de actierij van de lezer
 *     (`mail-reader-action-button` uit mail-lezer-werkbalk.css) → exact dezelfde hoogte (44 px), vorm (999 px), rand, lettergrootte
 *     en icoongrootte. mail-lezer-ai.css herhaalt die geometrie nooit; het zet alleen de eigen kleur.
 *   - Elke knop heeft een eigen, begrijpelijk icoon (Sparkles, TextQuote, CornerUpLeft) plus een tekstlabel en een tooltip.
 *   - De oorzaak van het overlappen zat in de lay-out: `.google-mail-reader` is een raster met twee rijen (kop + inhoud) en deze
 *     `<section class="mra">` was een DERDE kind, dus hij pakte de flexibele rij en de brief viel buiten het kader. Opgelost in
 *     mail-lezer-ai.css met `:has(> .mra)` (drie rijen zodra de balk er is) — zie daar.
 */
export default function MailReaderAi({ lang, context, messages, onUseReply, vorm = 'balk', startSignaal }: Props) {
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
  const run = async (kind: 'summary' | 'reply', wens?: string) => {
    setBusy(kind); setError(''); setResult(null); setCopied(false);
    try {
      const out = kind === 'summary'
        ? await aiSummarize(context, { messages: payload(), language: lang })
        : await aiReply(context, { messages: payload(), language: lang, instruction: (wens ?? instruction).trim() || undefined, tone: tone || undefined });
      if (alive.current) setResult({ kind, text: out.text, html: out.html });
    } catch (e) { if (alive.current) setError(composeErrorText(e, t)); } finally { if (alive.current) setBusy(''); }
  };
  useEffect(() => {
    if (!startSignaal?.n) return;
    setOpen(true);
    setInstruction(startSignaal.instructie.slice(0, 500));
    void run('reply', startSignaal.instructie.slice(0, 500));
  }, [startSignaal?.n]);
  const copy = async () => { try { await navigator.clipboard.writeText(result?.text || ''); setCopied(true); } catch { setError(t('Не вдалося скопіювати.', 'Kopiëren is niet gelukt.')); } };
  const empty = !messages.some((m) => m.plainText.trim());
  const uitleg = t('Помічник ШІ для цього листа: підсумок розмови і чернетка відповіді. Нічого не надсилається.', 'AI-hulp bij dit bericht: samenvatting van het gesprek en een antwoordconcept. Er wordt niets verzonden.');

  return <section className={vorm === 'antwoord' ? 'mra mra-antwoord' : 'mra'} aria-label={t('ШІ-помічник для листа', 'AI-hulp bij het bericht')}>
    <div className="mra-bar" role="toolbar" aria-label={t('Дії ШІ для листа', 'AI-acties voor het bericht')}>
      <button type="button" className="mail-reader-action-button mra-toggle" aria-expanded={open} aria-pressed={open} title={uitleg} data-tooltip={uitleg} onClick={() => setOpen((v) => !v)}>
        <Sparkles aria-hidden="true" /><span>{t('ШІ', 'AI')}</span>
      </button>
      {open && <>
        <button type="button" className="mail-reader-action-button" disabled={!!busy || empty} title={t('Короткий підсумок цієї розмови', 'Korte samenvatting van dit gesprek')} onClick={() => void run('summary')}>
          {busy === 'summary' ? <LoaderCircle className="mra-spin" aria-hidden="true" /> : <TextQuote aria-hidden="true" />}<span>{t('Підсумок', 'Samenvatting')}</span>
        </button>
        <button type="button" className="mail-reader-action-button" disabled={!!busy || empty} title={t('Чернетка відповіді — її можна лише вставити в поле відповіді', 'Antwoordconcept — het kan alleen in het antwoordveld worden geplaatst')} onClick={() => void run('reply')}>
          {busy === 'reply' ? <LoaderCircle className="mra-spin" aria-hidden="true" /> : <CornerUpLeft aria-hidden="true" />}<span>{t('Чернетка відповіді', 'Antwoordconcept')}</span>
        </button>
        <label className="mra-veld"><Gauge aria-hidden="true" /><span className="mra-sr">{t('Тон відповіді', 'Toon van het antwoord')}</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label={t('Тон відповіді', 'Toon van het antwoord')}>{TONES.map(([id, uk, nl]) => <option key={id} value={id}>{t(uk, nl)}</option>)}</select>
        </label>
        <label className="mra-veld mra-veld-breed"><PenLine aria-hidden="true" /><span className="mra-sr">{t('Побажання до відповіді', 'Wens voor het antwoord')}</span>
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} placeholder={t('Що має бути у відповіді? (необов’язково)', 'Wat moet in het antwoord staan? (optioneel)')} aria-label={t('Побажання до відповіді', 'Wens voor het antwoord')} />
        </label>
      </>}
    </div>
    {open && empty && <p className="mra-note">{t('У цьому листі немає тексту для аналізу.', 'Dit bericht bevat geen tekst om te analyseren.')}</p>}
    {error && <p className="mra-error" role="alert">{error}</p>}
    {result && <article className="mra-result" aria-live="polite">
      <header><strong>{result.kind === 'summary' ? t('Підсумок розмови', 'Samenvatting van het gesprek') : t('Чернетка відповіді', 'Antwoordconcept')}</strong>
        <button type="button" className="mra-icon" onClick={() => setResult(null)} aria-label={t('Закрити', 'Sluiten')}><X aria-hidden="true" /></button></header>
      <div className="mra-text">{result.text}</div>
      <footer>
        {result.kind === 'reply' && <button type="button" className="mra-primary" onClick={() => { onUseReply(result.html); setResult(null); }}><CornerUpLeft aria-hidden="true" />{t('Вставити у відповідь', 'In antwoord plaatsen')}</button>}
        <button type="button" onClick={() => void copy()}><Copy aria-hidden="true" />{copied ? t('Скопійовано', 'Gekopieerd') : t('Копіювати', 'Kopiëren')}</button>
        <small><WandSparkles aria-hidden="true" />{t('Створено ШІ — перевірте перед надсиланням. Нічого не надіслано.', 'Door AI gemaakt — controleer vóór het verzenden. Er is niets verzonden.')}</small>
      </footer>
    </article>}
  </section>;
}
