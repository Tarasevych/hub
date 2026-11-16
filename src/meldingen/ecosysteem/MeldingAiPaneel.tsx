// Панель інтелектуального розбору подій усередині екосистеми сповіщень (GEMINI-002).
// Підтримує два режими:
//   - Внутрішній ШІ (локальний, без жодного передавання даних назовні — дозволений завжди, включно з критичною безпекою)
//   - Зовнішній ШІ (Gemini, Claude, ChatGPT, Grok, AutoClaw) з обов’язковим очищенням секретів і забороною для конфіденційної безпеки.

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, Cpu, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import {
  prioriteitLabel,
  type AiAanbiederKeuze,
  type AiInstelling,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
} from '../../../shared/meldingen-ecosysteem';

type Props = {
  lang: 'uk' | 'nl';
  gebeurtenis: MeldingEcosysteemGebeurtenis;
  aiInstelling: AiInstelling;
  onOntleden: (modus: 'intern' | 'extern', aanbieder?: AiAanbiederKeuze) => Promise<MeldingAiSamenvatting>;
};

const AANBIEDER_NAAM: Record<AiAanbiederKeuze, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'ChatGPT',
  grok: 'Grok',
  autoclaw: 'AutoClaw',
};

export default function MeldingAiPaneel({ lang, gebeurtenis, aiInstelling, onOntleden }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [bezig, setBezig] = useState<'intern' | 'extern' | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
  }, []);

  const uit = aiInstelling.modus === 'uit';
  const externGeblokkeerdDoorVeiligheid =
    aiInstelling.alleenLokaalVoorBeveiliging && gebeurtenis.kanaal === 'beveiliging';
  const magIntern = !uit && (aiInstelling.modus === 'beide' || aiInstelling.modus === 'intern' || externGeblokkeerdDoorVeiligheid);
  const magExtern =
    !uit &&
    !externGeblokkeerdDoorVeiligheid &&
    (aiInstelling.modus === 'beide' || aiInstelling.modus === 'extern');

  const samenvatting = gebeurtenis.aiSamenvatting;

  const draai = async (modus: 'intern' | 'extern') => {
    setBezig(modus);
    try {
      await onOntleden(modus, aiInstelling.aanbieder);
    } finally {
      setBezig(null);
    }
  };

  const kopieerResultaat = async () => {
    if (!samenvatting) return;
    const tekst = [
      `${samenvatting.samenvatting}`,
      `${t('Причина', 'Oorzaak')}: ${samenvatting.oorzaak}`,
      `${t('Порада', 'Advies')}: ${samenvatting.advies}`,
      samenvatting.aanbevolenActies.length ? `${t('Кроки', 'Stappen')}:\n- ${samenvatting.aanbevolenActies.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(true);
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      /* без доступу до буфера обміну */
    }
  };

  return (
    <div className='mel-ai-paneel' data-testid='mel-ai-paneel'>
      <div className='mel-ai-kop'>
        <span className='mel-ai-titel'>
          <Bot aria-hidden='true' />
          <strong>{t('ШІ-інспектор події', 'AI-duiding van gebeurtenis')}</strong>
        </span>
        <div className='mel-ai-knoppen'>
          {magIntern && (
            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              disabled={bezig !== null}
              onClick={() => void draai('intern')}
              data-ai-modus='intern'
            >
              <Cpu aria-hidden='true' />
              {bezig === 'intern' ? t('Аналізуємо…', 'Bezig…') : t('Внутрішній ШІ', 'Interne AI')}
            </button>
          )}
          {magExtern && (
            <button
              type='button'
              className='mel-knop mel-knop-primair'
              disabled={bezig !== null}
              onClick={() => void draai('extern')}
              data-ai-modus='extern'
            >
              <Sparkles aria-hidden='true' />
              {bezig === 'extern'
                ? t('Запит до ШІ…', 'AI vraagt…')
                : `${t('Зовнішній ШІ', 'Externe AI')} · ${AANBIEDER_NAAM[aiInstelling.aanbieder]}`}
            </button>
          )}
        </div>
      </div>

      {uit && (
        <p className='mel-ai-melding'>
          {t(
            'ШІ-підказки вимкнено в налаштуваннях сповіщень (id.tarasevych.com/melding).',
            'AI-duiding is uitgeschakeld in de meldingsinstellingen (id.tarasevych.com/melding).',
          )}
        </p>
      )}

      {externGeblokkeerdDoorVeiligheid && !uit && (
        <div className='mel-ai-veiligheid'>
          <ShieldAlert aria-hidden='true' />
          <span>
            {t(
              'Події безпеки аналізуються лише локально внутрішнім ШІ — конфіденційні дані не передаються назовні.',
              'Beveiligingsmeldingen worden uitsluitend lokaal door de interne AI geduid — geen gegevens verlaten uw ruimte.',
            )}
          </span>
        </div>
      )}

      {samenvatting ? (
        <div className='mel-ai-uitslag'>
          <div className='mel-ai-badges'>
            <span className={`mel-chip is-${samenvatting.bron}`}>
              {samenvatting.bron === 'intern' ? <Cpu aria-hidden='true' /> : <Sparkles aria-hidden='true' />}
              {samenvatting.bron === 'intern'
                ? t('Внутрішній ШІ (конфіденційно)', 'Interne AI (lokaal)')
                : `${samenvatting.aanbieder || AANBIEDER_NAAM[aiInstelling.aanbieder]} · ${t('Зовнішній ШІ', 'Externe AI')}`}
            </span>
            {samenvatting.geschoond && (
              <span className='mel-chip is-schoon'>
                <Lock aria-hidden='true' />
                {t('Секрети приховано', 'Geheimen geschoond')}
              </span>
            )}
            <span className={`mel-prio is-${samenvatting.risico}`}>
              {t('Ризик:', 'Risico:')} {prioriteitLabel(samenvatting.risico, lang)}
            </span>
            <button
              type='button'
              className='mel-ikoon-knop'
              onClick={() => void kopieerResultaat()}
              aria-label={t('Копіювати розбір ШІ', 'AI-duiding kopiëren')}
              title={t('Копіювати розбір ШІ', 'AI-duiding kopiëren')}
            >
              {gekopieerd ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
            </button>
          </div>
          <p className='mel-ai-samenvatting'>{samenvatting.samenvatting}</p>
          <dl className='mel-ai-lijst'>
            <div>
              <dt>{t('Першопричина', 'Oorzaak')}</dt>
              <dd>{samenvatting.oorzaak}</dd>
            </div>
            <div>
              <dt>{t('Порада', 'Advies')}</dt>
              <dd>{samenvatting.advies}</dd>
            </div>
          </dl>
          {samenvatting.aanbevolenActies.length > 0 && (
            <ul className='mel-ai-stappen'>
              {samenvatting.aanbevolenActies.map((stap, i) => (
                <li key={i}>{stap}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
