import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignLeft, Briefcase, Gauge, LoaderCircle, Languages, ListTree, Maximize2, Minimize2, RefreshCw, Smile, SpellCheck, Sparkles, Undo2, WandSparkles, X } from 'lucide-react';
import { aiTone, aiTransform, composeErrorText, type AiAction, type Context, type Lang } from './mail-compose-api';
import './mail-ai-toolbar.css';

type Props = { lang: Lang; context: Context; getPlain: () => string; getHtml: () => string; onApply: (html: string) => void; disabled?: boolean };

const TEMPLATES: Array<[string, string, string]> = [
  ['business', 'Діловий лист', 'Zakelijke e-mail'], ['thanks', 'Подяка', 'Bedankt'], ['reminder', 'Нагадування', 'Herinnering'], ['decline', 'Ввічлива відмова', 'Beleefde weigering'],
  ['request', 'Прохання', 'Verzoek'], ['meeting', 'Пропозиція зустрічі', 'Voorstel voor een afspraak'], ['apology', 'Вибачення', 'Excuses'], ['follow_up', 'Нагадати про попереднє', 'Opvolging'],
  ['introduction', 'Знайомство', 'Kennismaking'], ['complaint', 'Скарга', 'Klacht'],
];
const LANGUAGES: Array<[string, string, string]> = [['uk', 'Українська', 'Oekraïens'], ['nl', 'Нідерландська', 'Nederlands'], ['en', 'Англійська', 'Engels'], ['de', 'Німецька', 'Duits'], ['fr', 'Французька', 'Frans'], ['pl', 'Польська', 'Pools'], ['es', 'Іспанська', 'Spaans'], ['it', 'Італійська', 'Italiaans'], ['pt', 'Португальська', 'Portugees']];

/**
 * Інструмент ШІ для тексту листа (як у Telegram): виправити, скоротити, розширити, переформулювати, офіційно, дружньо, перекласти, емодзі за контекстом,
 * структура й розумне оформлення, готові шаблони, власний запит і оцінка тону перед відправкою. Результат підставляється в редактор і його можна скасувати.
 * Працює з власним ключем Anthropic користувача (див. backend/ai-mail-assistant.ts).
 */
export default function MailAiToolbar({ lang, context, getPlain, getHtml, onApply, disabled }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(lang === 'uk' ? 'nl' : 'uk');
  const [custom, setCustom] = useState('');
  const [undo, setUndo] = useState<string | null>(null);
  const [tone, setTone] = useState<{ tone: string; formality: number; warmth: number; issues: string[]; suggestion: string } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const run = async (id: string, action: AiAction, extra: { language?: string; template?: string; instruction?: string } = {}) => {
    const text = getPlain().trim();
    if (!text && action !== 'template') { setError(t('Спершу напишіть хоча б кілька слів.', 'Schrijf eerst een paar woorden.')); return; }
    setBusy(id); setError(''); setTone(null);
    try {
      const before = getHtml();
      const out = await aiTransform(context, { action, text, ...extra });
      setUndo(before);
      onApply(out.html);
      setOpen(false);
    } catch (e) { setError(composeErrorText(e, t)); }
    setBusy('');
  };
  const checkTone = async () => {
    const text = getPlain().trim();
    if (!text) { setError(t('Спершу напишіть хоча б кілька слів.', 'Schrijf eerst een paar woorden.')); return; }
    setBusy('tone'); setError('');
    try { setTone(await aiTone(context, text, lang)); } catch (e) { setError(composeErrorText(e, t)); }
    setBusy('');
  };

  const item = (id: string, icon: ReactNode, uk: string, nl: string, hint: [string, string], action: AiAction) => (
    <button key={id} type='button' className='mail-ai-item' disabled={!!busy} onClick={() => void run(id, action)} data-ai-action={id}>
      <span className='mail-ai-icon' aria-hidden='true'>{busy === id ? <LoaderCircle className='mail-ai-spin' /> : icon}</span>
      <span><b>{t(uk, nl)}</b><small>{t(hint[0], hint[1])}</small></span>
    </button>
  );

  return (
    <div className='mail-ai' ref={rootRef}>
      <button type='button' className={`mail-ai-trigger${open ? ' is-open' : ''}`} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)} data-ai-open='true'>
        <Sparkles aria-hidden='true' />{t('ШІ', 'AI')}
      </button>
      {undo !== null ? (
        <button type='button' className='mail-ai-undo' title={t('Повернути текст до ШІ-правки', 'Tekst terugzetten vóór de AI-bewerking')} onClick={() => { onApply(undo); setUndo(null); }}>
          <Undo2 aria-hidden='true' />{t('Скасувати правку ШІ', 'AI-bewerking ongedaan maken')}
        </button>
      ) : null}
      {open ? (
        <div className='mail-ai-pop' role='menu' aria-label={t('Інструменти ШІ для тексту', 'AI-hulpmiddelen voor tekst')}>
          <div className='mail-ai-head'><b>{t('ШІ-помічник', 'AI-assistent')}</b><button type='button' aria-label={t('Закрити', 'Sluiten')} onClick={() => setOpen(false)}><X /></button></div>
          <div className='mail-ai-group'>{t('Покращити', 'Verbeteren')}</div>
          {item('fix', <SpellCheck />, 'Виправити помилки', 'Fouten verbeteren', ['Правопис і пунктуація, зміст не змінюється', 'Spelling en leestekens, inhoud blijft'], 'fix')}
          {item('shorten', <Minimize2 />, 'Скоротити', 'Inkorten', ['Удвічі коротше, усі факти лишаються', 'Ongeveer de helft korter, alle feiten blijven'], 'shorten')}
          {item('expand', <Maximize2 />, 'Розширити', 'Uitbreiden', ['Додати природні подробиці без вигадок', 'Natuurlijke details toevoegen zonder verzinsels'], 'expand')}
          {item('rephrase', <RefreshCw />, 'Переформулювати', 'Herformuleren', ['Інші слова, той самий зміст', 'Andere woorden, dezelfde inhoud'], 'rephrase')}
          <div className='mail-ai-group'>{t('Стиль', 'Stijl')}</div>
          {item('formal', <Briefcase />, 'Офіційний стиль', 'Formele stijl', ['Ділова, ввічлива форма', 'Zakelijk en beleefd'], 'formal')}
          {item('friendly', <Smile />, 'Дружній стиль', 'Vriendelijke stijl', ['Тепліше й невимушено, але з повагою', 'Warmer en ontspannen, maar respectvol'], 'friendly')}
          {item('emoji', <Smile />, 'Емодзі за змістом', 'Emoji passend bij de tekst', ['Лише там, де вони доречні', 'Alleen waar ze passen'], 'emoji')}
          <div className='mail-ai-group'>{t('Оформлення', 'Opmaak')}</div>
          {item('structure', <ListTree />, 'Розділити за змістом', 'Indelen naar inhoud', ['Абзаци, списки, короткі заголовки', 'Alinea\'s, lijsten, korte kopjes'], 'structure')}
          {item('smart_format', <AlignLeft />, 'Розумне оформлення листа', 'Slim opmaken als e-mail', ['Привітання, абзаци, завершення', 'Aanhef, alinea\'s, afsluiting'], 'smart_format')}
          <div className='mail-ai-group'>{t('Мова', 'Taal')}</div>
          <div className='mail-ai-row'>
            <Languages aria-hidden='true' />
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t('Мова перекладу', 'Doeltaal')}>
              {LANGUAGES.map(([code, uk, nl]) => <option key={code} value={code}>{t(uk, nl)}</option>)}
            </select>
            <button type='button' disabled={!!busy} onClick={() => void run('translate', 'translate', { language })} data-ai-action='translate'>{busy === 'translate' ? <LoaderCircle className='mail-ai-spin' /> : t('Перекласти', 'Vertalen')}</button>
          </div>
          <div className='mail-ai-group'>{t('Шаблони', 'Sjablonen')}</div>
          <div className='mail-ai-chips'>
            {TEMPLATES.map(([id, uk, nl]) => (
              <button key={id} type='button' disabled={!!busy} onClick={() => void run(`tpl-${id}`, 'template', { template: id, language: lang })} data-ai-template={id}>
                {busy === `tpl-${id}` ? <LoaderCircle className='mail-ai-spin' /> : t(uk, nl)}
              </button>
            ))}
          </div>
          <p className='mail-ai-note'>{t('Шаблон використовує ваш текст як нотатки; порожній текст дає короткий загальний варіант.', 'Een sjabloon gebruikt uw tekst als aantekeningen; zonder tekst volgt een korte algemene versie.')}</p>
          <div className='mail-ai-group'>{t('Свій запит', 'Eigen opdracht')}</div>
          <form className='mail-ai-row' onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void run('custom', 'custom', { instruction: custom }); }}>
            <WandSparkles aria-hidden='true' />
            <input value={custom} maxLength={600} onChange={(e) => setCustom(e.target.value)} placeholder={t('Напр.: зроби тон м’якшим', 'Bijv.: maak de toon vriendelijker')} aria-label={t('Власна інструкція для ШІ', 'Eigen opdracht voor de AI')} />
            <button type='submit' disabled={!!busy || !custom.trim()}>{busy === 'custom' ? <LoaderCircle className='mail-ai-spin' /> : t('Виконати', 'Uitvoeren')}</button>
          </form>
          <div className='mail-ai-group'>{t('Перевірка перед відправкою', 'Controle vóór het versturen')}</div>
          <button type='button' className='mail-ai-item' disabled={!!busy} onClick={() => void checkTone()} data-ai-action='tone'>
            <span className='mail-ai-icon' aria-hidden='true'>{busy === 'tone' ? <LoaderCircle className='mail-ai-spin' /> : <Gauge />}</span>
            <span><b>{t('Оцінити тон листа', 'Toon van het bericht beoordelen')}</b><small>{t('Офіційність, теплота й можливі проблеми', 'Formaliteit, warmte en mogelijke problemen')}</small></span>
          </button>
          {tone ? (
            <div className='mail-ai-tone' role='status' data-ai-tone='true'>
              <b>{tone.tone || t('нейтральний', 'neutraal')}</b>
              <div className='mail-ai-bars'>
                <label>{t('Офіційність', 'Formaliteit')}<progress max={100} value={tone.formality} /></label>
                <label>{t('Теплота', 'Warmte')}<progress max={100} value={tone.warmth} /></label>
              </div>
              {tone.issues.length ? <ul>{tone.issues.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{t('Явних проблем не знайдено.', 'Geen duidelijke problemen gevonden.')}</p>}
              {tone.suggestion ? <p><b>{t('Порада', 'Tip')}:</b> {tone.suggestion}</p> : null}
            </div>
          ) : null}
          {error ? <p className='mail-ai-error' role='alert'>{error}</p> : null}
          <p className='mail-ai-note'>{t('Текст листа надсилається вашому постачальнику ШІ (власний ключ Anthropic). Ми нічого не зберігаємо.', 'De tekst gaat naar uw eigen AI-aanbieder (eigen Anthropic-sleutel). Wij bewaren niets.')}</p>
        </div>
      ) : null}
    </div>
  );
}
