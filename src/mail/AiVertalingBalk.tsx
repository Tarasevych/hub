import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  Columns2,
  Plug,
  Check,
  ChevronDown,
  ExternalLink,
  FileQuestion,
  GitBranch,
  Globe,
  Languages,
  LoaderCircle,
  Lock,
  Paperclip,
  Settings,
  ShieldCheck,
  Sparkles,
  TextQuote,
  X,
} from 'lucide-react';
import { api } from '../platform/client';
import {
  AI_TOEGANG_HREF,
  AI_VERTALING_SUMMARY_DEPTHS,
  AI_VERTALING_TALEN,
  motorenMetStand,
  normaliseerVertaalWeergave,
  STANDAARD_AI_VERTALING_INSTELLINGEN,
  taalLabel,
  taalLabelUk,
  VERTAAL_MOTOR_STAAT_TEKST,
  type AiVertalingAgentInfo,
  type AiVertalingInstellingen,
  type AiVertalingMode,
  type AiVertalingRunResponse,
  type AiVertalingSegment,
  type AiVertalingSummaryDepth,
  type RelatedMailCitation,
  type VertaalMotor,
  type VertaalWeergave,
} from '../../shared/ai-vertaling';
import { InfoTip } from '../InfoTip';
import './ai-vertaling-balk.css';

/* 21.10.2026 (рецензія UX): на телефоні й в альбомній орієнтації панель ШІ займала 200+ px над листом (на 390×844 текст листа
   починався з y≈555, на 844×390 його не було видно взагалі). На малому екрані вона тепер згорнута в один рядок «ШІ-аналіз і
   переклад ⌄»; вибір людини (розгорнути) пам'ятається в цьому браузері. На комп'ютері — як і раніше, завжди розгорнута. */
export const AI_BALK_KLEIN_SCHERM = '(max-width: 700px), (max-height: 500px)';
const AI_BALK_OPEN_SLEUTEL = 'mr-ai-balk-open-v1';
/* 24.10.2026 (pakket 3 «Adaptive Mail Canvas», макет: «Головне — лист. Інструменти з'являються, коли потрібні»): boven de brief staan
   nu «Що від вас потрібно?» en de vertaalstrook «Оригінал / Переклад / Порівняти». Deze panel begint daarom op ELK scherm als één regel
   (ook op de computer, met dezelfde knop); wie hem uitklapt, krijgt hem uitgeklapt bij de volgende brieven (zelfde sleutel als sinds
   21.10). Ingeklapt blijven de resultaten zichtbaar en werkt «Переклад» gewoon (het verzoek hangt niet aan het uitklappen). */
export function aiBalkStartIngeklapt(): boolean {
  if (typeof window === 'undefined') return true;
  try { if (window.localStorage.getItem(AI_BALK_OPEN_SLEUTEL) === '1') return false; } catch { /* privévenster: standaard */ }
  return true;
}
/** Мова інтерфейсу (uk | nl) з <html lang>: панель не отримує lang у пропсах. */
const isNl = () => typeof document !== 'undefined' && /^nl/i.test(document.documentElement.lang || '');

export type AiVertalingBalkAttachment = {
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  textExcerpt?: string;
};

export type AiVertalingBalkThreadMessage = {
  id: string;
  from: string;
  subject?: string;
  receivedAt: number;
  plainText: string;
};

export type AiVertalingBalkProps = {
  context: Record<string, string>;
  accountId: string;
  messageId: string;
  threadId?: string;
  subject: string;
  from?: string;
  to?: string[];
  cc?: string[];
  receivedAt?: number;
  bodyText: string;
  segments: AiVertalingSegment[];
  attachments?: AiVertalingBalkAttachment[];
  threadMessages?: AiVertalingBalkThreadMessage[];
  isDocumentView?: boolean;
  translationActive: boolean;
  onToggleTranslationActive: (active: boolean) => void;
  /** Punt 16: `meta` vertelt de brief WIE vertaalde en wat onvertaald bleef — voor de plaat boven de tekst. */
  onTranslationsReady: (
    translations: Record<string, string>,
    detectedSource: string,
    meta?: { motorNaam: string; doelTaal: string; onvertaald: number },
  ) => void;
  onOpenRelatedMessage?: (citation: RelatedMailCitation) => void;
  /** Punt 16: «поруч» — оригінал ліворуч, переклад праворуч (op een telefoon onder elkaar). */
  weergave?: VertaalWeergave;
  onWeergave?: (weergave: VertaalWeergave) => void;
};

type RefusalBanner = {
  code: string;
  messageUk: string;
  actionLabelUk: string;
  actionHref: string;
};

export default function AiVertalingBalk({
  context,
  accountId,
  messageId,
  threadId,
  subject,
  from,
  to,
  cc,
  receivedAt,
  bodyText,
  segments,
  attachments = [],
  threadMessages = [],
  isDocumentView = false,
  translationActive,
  onToggleTranslationActive,
  onTranslationsReady,
  onOpenRelatedMessage,
  weergave = 'inline',
  onWeergave,
}: AiVertalingBalkProps) {
  const [agents, setAgents] = useState<AiVertalingAgentInfo[]>([]);
  // Punt 16: de catalogus van vertaalmotoren met hun echte stand. De server stuurt hem mee; tot dat antwoord komt rekenen we
  // hem uit de (nog lege) agentenlijst, zodat er nooit «працює» staat voor iets wat niet gekoppeld is.
  const [motoren, setMotoren] = useState<VertaalMotor[]>(() => motorenMetStand([], isDocumentView));
  const [motorenOpen, setMotorenOpen] = useState(false);
  const [settings, setSettings] = useState<AiVertalingInstellingen>(STANDAARD_AI_VERTALING_INSTELLINGEN);
  const [selectedLang, setSelectedLang] = useState<string>(STANDAARD_AI_VERTALING_INSTELLINGEN.defaultLang);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [activeMode, setActiveMode] = useState<AiVertalingMode | null>(null);
  const [summaryDepth, setSummaryDepth] = useState<AiVertalingSummaryDepth>(STANDAARD_AI_VERTALING_INSTELLINGEN.summaryDepth);
  const [crossMailboxContext, setCrossMailboxContext] = useState<boolean>(STANDAARD_AI_VERTALING_INSTELLINGEN.crossMailboxContext);
  const [includeAttachments, setIncludeAttachments] = useState<boolean>(STANDAARD_AI_VERTALING_INSTELLINGEN.includeAttachments);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyMode, setBusyMode] = useState<AiVertalingMode | null>(null);
  const [refusal, setRefusal] = useState<RefusalBanner | null>(null);
  const [errorText, setErrorText] = useState('');
  const [lastResult, setLastResult] = useState<AiVertalingRunResponse | null>(null);
  const [hasTranslation, setHasTranslation] = useState(false);
  const [ingeklapt, setIngeklapt] = useState<boolean>(aiBalkStartIngeklapt);
  const balkId = useId();
  const nl = isNl();
  const t = (uk: string, nlTekst: string) => (nl ? nlTekst : uk);
  const wisselIngeklapt = () => setIngeklapt((was) => {
    try { if (was) window.localStorage.setItem(AI_BALK_OPEN_SLEUTEL, '1'); else window.localStorage.removeItem(AI_BALK_OPEN_SLEUTEL); } catch { /* optioneel */ }
    return !was;
  });

  // Client-side session cache per (messageId, targetLang, mode, summaryDepth, crossMailboxContext, includeAttachments, agentId)
  const localCacheRef = useRef(new Map<string, AiVertalingRunResponse>());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Load connected private AI agents & user preferences on mount
  useEffect(() => {
    let active = true;
    void api
      .post('/api/owner/mail/ai-vertaling/state', { ...context })
      .then(res => {
        if (!active) return;
        const data = res.data as {
          agents?: AiVertalingAgentInfo[];
          settings?: AiVertalingInstellingen;
          motoren?: VertaalMotor[];
        };
        const loadedAgents = Array.isArray(data?.agents) ? data.agents : [];
        setAgents(loadedAgents);
        setMotoren(Array.isArray(data?.motoren) && data.motoren.length ? data.motoren : motorenMetStand(loadedAgents, isDocumentView));
        if (data?.settings) {
          setSettings(data.settings);
          setSelectedLang(data.settings.defaultLang || 'uk');
          setSummaryDepth(data.settings.summaryDepth || 'brief');
          setCrossMailboxContext(data.settings.crossMailboxContext !== false);
          setIncludeAttachments(data.settings.includeAttachments !== false);
          const preferred =
            loadedAgents.find(a => a.id === data.settings?.defaultAgentId)?.id ||
            loadedAgents[0]?.id ||
            'prive:mijn-ruimte-assistent';
          setSelectedAgentId(preferred);
        } else if (loadedAgents[0]) {
          setSelectedAgentId(loadedAgents[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setAgents([
          {
            id: 'prive:mijn-ruimte-assistent',
            name: 'Приватний асистент Мого Простору',
            platform: 'anthropic-prive',
            source: 'vault',
            ruimte: 'prive',
            scopes: ['mail.read', 'files.read'],
            allowedMailRead: true,
            allowedFilesRead: true,
            statusUk: 'Активний (приватний простір)',
          },
        ]);
        setMotoren(motorenMetStand([], isDocumentView));
        setSelectedAgentId('prive:mijn-ruimte-assistent');
      });
    return () => {
      active = false;
    };
  }, [context.service, context.tabContext, context.sourceOrigin]);

  // Reset displayed panel when switching to a different message/document
  useEffect(() => {
    setRefusal(null);
    setErrorText('');
    setLastResult(null);
    setHasTranslation(false);
    setActiveMode(null);
  }, [messageId, accountId]);

  const orderedLanguages = useMemo(() => {
    const recents = settings.recentLangs || ['uk', 'en', 'nl'];
    const recentItems = recents
      .map(code => AI_VERTALING_TALEN.find(t => t.code === code))
      .filter((t): t is (typeof AI_VERTALING_TALEN)[number] => Boolean(t));
    const restItems = AI_VERTALING_TALEN.filter(t => !recents.includes(t.code));
    return { recentItems, restItems };
  }, [settings.recentLangs]);

  const persistSettings = useCallback(
    async (patch: Partial<AiVertalingInstellingen>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        const res = await api.post('/api/owner/mail/ai-vertaling/settings', { ...context, ...patch });
        if (res.data?.settings && aliveRef.current) {
          setSettings(res.data.settings);
        }
      } catch {
        // Ignore network failure for preference save
      }
    },
    [context, settings],
  );

  const runAction = useCallback(
    async (
      mode: AiVertalingMode,
      overrides?: {
        lang?: string;
        depth?: AiVertalingSummaryDepth;
        crossMailbox?: boolean;
        withAttachments?: boolean;
        agent?: string;
      },
    ) => {
      const targetLang = overrides?.lang || selectedLang || 'uk';
      const depth = overrides?.depth || summaryDepth;
      const crossMailbox = overrides?.crossMailbox !== undefined ? overrides.crossMailbox : crossMailboxContext;
      const withAttachments = overrides?.withAttachments !== undefined ? overrides.withAttachments : includeAttachments;
      const agentId = overrides?.agent || selectedAgentId || 'prive:mijn-ruimte-assistent';

      setActiveMode(mode);
      setRefusal(null);
      setErrorText('');

      const payloadSegments: AiVertalingSegment[] = [
        ...(subject.trim() ? [{ id: 'subject', text: subject.trim() }] : []),
        ...segments,
      ];

      const cacheKey = [
        messageId,
        targetLang,
        mode,
        depth,
        crossMailbox ? '1' : '0',
        withAttachments ? '1' : '0',
        agentId,
        payloadSegments.length,
      ].join('|');

      const cached = localCacheRef.current.get(cacheKey);
      if (cached) {
        setLastResult({ ...cached, cached: true });
        if (mode === 'translate' && cached.translations) {
          setHasTranslation(true);
          onTranslationsReady(cached.translations, cached.detectedSourceLang, { motorNaam: cached.motorNaam || '', doelTaal: cached.targetLang, onvertaald: cached.onvertaald || 0 });
          onToggleTranslationActive(true);
        }
        return;
      }

      setBusyMode(mode);
      try {
        const res = await api.post('/api/owner/mail/ai-vertaling/run', {
          ...context,
          mode,
          targetLang,
          agentId,
          accountId,
          messageId,
          threadId,
          subject,
          from,
          to,
          cc,
          receivedAt,
          bodyText,
          segments: payloadSegments,
          attachments: withAttachments ? attachments : [],
          threadMessages,
          summaryDepth: depth,
          crossMailboxContext: crossMailbox,
          includeAttachments: withAttachments,
          isDocumentView,
        });

        if (!aliveRef.current) return;
        const data = res.data as AiVertalingRunResponse;
        localCacheRef.current.set(cacheKey, data);
        setLastResult(data);

        if (!settings.recentLangs.includes(targetLang) || settings.recentLangs[0] !== targetLang) {
          setSettings(curr => ({
            ...curr,
            recentLangs: [targetLang, ...curr.recentLangs.filter(l => l !== targetLang)].slice(0, 6),
          }));
        }

        if (mode === 'translate' && data.translations) {
          setHasTranslation(true);
          onTranslationsReady(data.translations, data.detectedSourceLang, { motorNaam: data.motorNaam || '', doelTaal: data.targetLang, onvertaald: data.onvertaald || 0 });
          onToggleTranslationActive(true);
        }
      } catch (err: any) {
        if (!aliveRef.current) return;
        const errBody = err?.response?.data || err?.data || {};
        if (errBody?.messageUk || err?.response?.status === 403 || err?.status === 403) {
          setRefusal({
            code: String(errBody.error || 'ACCESS_DENIED'),
            messageUk:
              String(errBody.messageUk || '') ||
              'Обраний ШІ-агент не має дозволу на читання пошти або документів (mail.read / files.read).',
            actionLabelUk: String(errBody.actionLabelUk || 'Відкрити «Доступ ШІ»'),
            actionHref: String(errBody.actionHref || AI_TOEGANG_HREF),
          });
        } else {
          setErrorText('Не вдалося виконати запит до ШІ-агента. Оригінал листа чи документа не змінено.');
        }
      } finally {
        if (aliveRef.current) setBusyMode(null);
      }
    },
    [
      selectedLang,
      summaryDepth,
      crossMailboxContext,
      includeAttachments,
      selectedAgentId,
      subject,
      segments,
      messageId,
      context,
      accountId,
      threadId,
      from,
      to,
      cc,
      receivedAt,
      bodyText,
      attachments,
      threadMessages,
      isDocumentView,
      settings.recentLangs,
      onTranslationsReady,
      onToggleTranslationActive,
    ],
  );

  // When user clicks toolbar "Перекласти" button externally (`translationActive` flips true without `hasTranslation`), trigger translate
  useEffect(() => {
    if (translationActive && !hasTranslation && !busyMode && segments.length > 0) {
      void runAction('translate');
    }
  }, [translationActive, hasTranslation, busyMode, segments.length, runAction]);

  return (
    <section
      className={`ai-vertaling-balk${translationActive ? ' is-translated' : ''}${isDocumentView ? ' is-document' : ''}`}
      data-ai-vertaling-balk
      data-translation-state={translationActive ? 'translated' : 'original'}
      data-ingeklapt={ingeklapt ? 'ja' : 'nee'}
      aria-label={t('Інтелектуальна панель перекладу, підсумку та контексту ШІ', 'AI-paneel voor vertaling, samenvatting en context')}
    >
      <div className="ai-vb-main-row">
        <div className="ai-vb-brand">
          <Sparkles className="ai-vb-sparkle" size={15} aria-hidden="true" />
          <span className="ai-vb-title">{t('ШІ-аналіз і переклад', 'AI-analyse en vertaling')}</span>
          {/* Punt 16: «незрозуміла кнопка ШІ» — dit is geen tweede motor en geen knop die iets start. Het is het label van de
              balk, met uitleg erbij; de motor kiest u in «Рушії перекладу», de taal ernaast. */}
          <InfoTip className="ai-vb-uitleg" label={t('Що таке «ШІ» в цій панелі', 'Wat «AI» in dit paneel betekent')}>
            {nl ? (
              <><strong>Dit is geen aparte motor en geen knop.</strong> Het is de naam van het paneel: vertaling, samenvatting en context
              doet de motor die u kiest in «Vertaalmotoren» (nu uw privé-AI-agent met eigen sleutel). Er wordt niets verstuurd zonder dat u
              klikt, en de tekst van de brief verandert pas als u op «Vertalen» klikt.</>
            ) : (
              <><strong>Це не окремий рушій і не кнопка.</strong> Це назва панелі: переклад, підсумок і контекст робить той рушій,
            який ви обрали в «Рушії перекладу» (зараз це ваш приватний ШІ-агент із власним ключем). Нічого не надсилається без
            вашого натискання, і текст листа не змінюється, доки ви не натиснете «Перекласти».</>
            )}
          </InfoTip>
          <span className="ai-vb-space-badge" title="Працює виключно через ваш приватний простір (AiRuimte = prive) лише за вашим запитом">
            <Lock size={11} aria-hidden="true" />
            {t('Приватний простір', 'Privéruimte')}
          </span>
          <button
            type="button"
            className="ai-vb-inklap"
            aria-expanded={!ingeklapt}
            aria-controls={`${balkId}-kiezers ${balkId}-modi`}
            aria-label={ingeklapt ? t('Показати інструменти ШІ: мова, переклад, підсумок', 'AI-hulpmiddelen tonen: taal, vertaling, samenvatting') : t('Сховати інструменти ШІ', 'AI-hulpmiddelen verbergen')}
            title={ingeklapt ? t('Показати інструменти ШІ', 'AI-hulpmiddelen tonen') : t('Сховати інструменти ШІ', 'AI-hulpmiddelen verbergen')}
            onClick={wisselIngeklapt}
            data-testid="ai-vb-inklap"
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="ai-vb-selectors" id={`${balkId}-kiezers`}>
          <label className="ai-vb-select-group" title="Оберіть підключеного приватного ШІ-агента">
            <Bot size={13} aria-hidden="true" />
            <span className="ai-vb-sr">ШІ-агент</span>
            <select
              value={selectedAgentId}
              onChange={e => {
                setSelectedAgentId(e.target.value);
                setRefusal(null);
              }}
              aria-label={t('Підключений ШІ-агент', 'Gekoppelde AI-agent')}
              data-testid="ai-vb-agent-select"
            >
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                  {!agent.allowedMailRead && !isDocumentView ? ' (немає mail.read)' : ''}
                  {!agent.allowedFilesRead && isDocumentView ? ' (немає files.read)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="ai-vb-select-group" title="Цільова мова перекладу та відповідей ШІ">
            <Globe size={13} aria-hidden="true" />
            <span className="ai-vb-sr">Цільова мова</span>
            <select
              value={selectedLang}
              onChange={e => {
                const nextLang = e.target.value;
                setSelectedLang(nextLang);
                if (translationActive || activeMode === 'translate') {
                  void runAction('translate', { lang: nextLang });
                } else if (activeMode) {
                  void runAction(activeMode, { lang: nextLang });
                }
              }}
              aria-label={t('Цільова мова', 'Doeltaal')}
              data-testid="ai-vb-lang-select"
            >
              {orderedLanguages.recentItems.length > 0 && (
                <optgroup label="Нещодавно обрані">
                  {orderedLanguages.recentItems.map(langItem => (
                    <option key={`rec-${langItem.code}`} value={langItem.code}>
                      {langItem.labelUk} ({langItem.nativeLabel})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Усі мови">
                {orderedLanguages.restItems.map(langItem => (
                  <option key={langItem.code} value={langItem.code}>
                    {langItem.labelUk} ({langItem.nativeLabel})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>

        <div className="ai-vb-modes" id={`${balkId}-modi`} role="toolbar" aria-label={t('Режими роботи ШІ', 'AI-functies')}>
          <button
            type="button"
            className={`ai-vb-mode-btn${activeMode === 'translate' || translationActive ? ' active' : ''}`}
            disabled={busyMode !== null}
            onClick={() => void runAction('translate')}
            data-testid="ai-vb-btn-translate"
          >
            {busyMode === 'translate' ? <LoaderCircle size={14} className="spin" /> : <Languages size={14} />}
            <span>{t('Перекласти', 'Vertalen')}</span>
          </button>

          {(hasTranslation || translationActive) && (
            <button
              type="button"
              className={`ai-vb-toggle-orig-btn${translationActive ? ' showing-translation' : ' showing-original'}`}
              onClick={() => onToggleTranslationActive(!translationActive)}
              data-testid="ai-vb-btn-toggle-original"
              title="Миттєве перемикання між оригіналом і перекладом без втрати форматування"
            >
              <ArrowLeftRight size={13} />
              <span>{translationActive ? 'Показати оригінал ↔ Переклад' : 'Переклад ↔ Показати оригінал'}</span>
            </button>
          )}

          <button
            type="button"
            className={`ai-vb-mode-btn${activeMode === 'summary' ? ' active' : ''}`}
            disabled={busyMode !== null}
            onClick={() => void runAction('summary')}
            data-testid="ai-vb-btn-summary"
          >
            {busyMode === 'summary' ? <LoaderCircle size={14} className="spin" /> : <TextQuote size={14} />}
            <span>{t('Короткий підсумок', 'Korte samenvatting')}</span>
          </button>

          <button
            type="button"
            className={`ai-vb-mode-btn${activeMode === 'purpose' ? ' active' : ''}`}
            disabled={busyMode !== null}
            onClick={() => void runAction('purpose')}
            data-testid="ai-vb-btn-purpose"
          >
            {busyMode === 'purpose' ? <LoaderCircle size={14} className="spin" /> : <FileQuestion size={14} />}
            <span>{t('Що це за документ, про що, для чого і чому', 'Wat voor document is dit, waarover, waarvoor en waarom')}</span>
          </button>

          {!isDocumentView && (
            <button
              type="button"
              className={`ai-vb-mode-btn${activeMode === 'context' ? ' active' : ''}`}
              disabled={busyMode !== null}
              onClick={() => void runAction('context')}
              data-testid="ai-vb-btn-context"
            >
              {busyMode === 'context' ? <LoaderCircle size={14} className="spin" /> : <GitBranch size={14} />}
              <span>{t('Контекст і зв’язки', 'Context en verbanden')}</span>
            </button>
          )}

          {/* Punt 16: оригінал ліворуч, переклад праворуч (на телефоні — одне під одним). */}
          {onWeergave && (
            <button
              type="button"
              className={`ai-vb-mode-btn${weergave === 'naast' ? ' active' : ''}`}
              aria-pressed={weergave === 'naast'}
              title="Оригінал і переклад поруч: оригінал ліворуч, переклад праворуч. На телефоні — одне під одним."
              onClick={() => onWeergave(normaliseerVertaalWeergave(weergave === 'naast' ? 'inline' : 'naast'))}
              data-testid="ai-vb-btn-naast"
            >
              <Columns2 size={14} />
              <span>{weergave === 'naast' ? t('Поруч: увімкнено', 'Naast elkaar: aan') : t('Оригінал і переклад поруч', 'Origineel en vertaling naast elkaar')}</span>
            </button>
          )}

          <button
            type="button"
            className={`ai-vb-motoren-trigger${motorenOpen ? ' active' : ''}`}
            aria-expanded={motorenOpen}
            title="Які рушії перекладу є, що працює зараз, що треба підключити і чого ще немає"
            onClick={() => setMotorenOpen(v => !v)}
            data-testid="ai-vb-btn-motoren"
          >
            <Plug size={14} />
            <span>{t('Рушії перекладу', 'Vertaalmotoren')}</span>
          </button>

          <button
            type="button"
            className={`ai-vb-settings-trigger${settingsOpen ? ' active' : ''}`}
            aria-expanded={settingsOpen}
            aria-label={t('Налаштування панелі ШІ', 'Instellingen van het AI-paneel')}
            title="Гнучкі налаштування підсумку, міжскринькового контексту та вкладень"
            onClick={() => setSettingsOpen(v => !v)}
            data-testid="ai-vb-btn-settings"
          >
            <Settings size={14} />
            <span>{t('Налаштування', 'Instellingen')}</span>
          </button>
        </div>
      </div>

      {/* Punt 16: каталог рушіїв з чесним станом — «що працює зараз, що треба підключити, чого ще немає», з кнопкою підключення
          такою ж, як на інших картках інтеграцій. Нічого не імітуємо: у рушія зі станом «ще немає» кнопки немає взагалі. */}
      {motorenOpen && (
        <div className="ai-vb-motoren" role="region" aria-label="Рушії перекладу" data-testid="ai-vb-motoren">
          <div className="ai-vb-settings-header">
            <strong>Рушії перекладу</strong>
            <button type="button" className="ai-vb-close-btn" onClick={() => setMotorenOpen(false)} aria-label="Закрити перелік рушіїв">
              <X size={14} />
            </button>
          </div>
          <p className="ai-vb-motoren-note">
            Платформа працює на вашому власному сервері (BYOS). Жоден сторонній сервіс не отримує ваших листів, поки ви самі його
            не підключите своїм ключем. Якщо рушій не підключено — переклад не виконується і нічого не вигадується.
          </p>
          <ul className="ai-vb-motoren-lijst">
            {motoren.map(motor => (
              <li key={motor.id} className="ai-vb-motor-kaart" data-motor={motor.id} data-motor-staat={motor.staat}>
                <div className="ai-vb-motor-kop">
                  <strong>{motor.naam}</strong>
                  <span className="ai-vb-motor-staat" data-staat={motor.staat}>{VERTAAL_MOTOR_STAAT_TEKST[motor.staat][0]}</span>
                </div>
                <small className="ai-vb-motor-leverancier">
                  {motor.leverancier}
                  {motor.plek === 'eigen-server' ? ' · на вашому сервері' : motor.plek === 'eigen-sleutel' ? ' · ваш власний ключ' : ' · сторонній сервіс'}
                </small>
                <p>{motor.uitlegUk}</p>
                {motor.staat === 'aansluiten' && motor.aansluitenHref ? (
                  <a className="ai-vb-motor-knop" href={motor.aansluitenHref} data-motor-aansluiten={motor.id}>
                    <Plug size={13} aria-hidden="true" />
                    Підключити
                  </a>
                ) : motor.staat === 'werkt' ? (
                  <span className="ai-vb-motor-klaar"><Check size={13} aria-hidden="true" />Підключено й готовий до роботи</span>
                ) : (
                  <span className="ai-vb-motor-leeg"><AlertTriangle size={13} aria-hidden="true" />Підключення ще не написано — цей рушій зараз недоступний</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {settingsOpen && (
        <div className="ai-vb-settings-drawer" role="region" aria-label="Налаштування панелі ШІ" data-testid="ai-vb-settings-drawer">
          <div className="ai-vb-settings-header">
            <strong>Налаштування перекладу, підсумку та пошуку контексту</strong>
            <button type="button" className="ai-vb-close-btn" onClick={() => setSettingsOpen(false)} aria-label="Закрити налаштування">
              <X size={14} />
            </button>
          </div>

          <div className="ai-vb-settings-grid">
            <div className="ai-vb-setting-field">
              <span className="ai-vb-setting-label">Глибина та тип підсумку («Витяг головного»):</span>
              <div className="ai-vb-depth-pills" role="group" aria-label="Глибина підсумку">
                {AI_VERTALING_SUMMARY_DEPTHS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className={`ai-vb-pill${summaryDepth === d.id ? ' active' : ''}`}
                    onClick={() => {
                      setSummaryDepth(d.id);
                      void persistSettings({ summaryDepth: d.id });
                      if (activeMode === 'summary') {
                        void runAction('summary', { depth: d.id });
                      }
                    }}
                    data-testid={`ai-vb-depth-${d.id}`}
                  >
                    {d.labelUk}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-vb-setting-field">
              <label className="ai-vb-checkbox-label">
                <input
                  type="checkbox"
                  checked={crossMailboxContext}
                  onChange={e => {
                    const checked = e.target.checked;
                    setCrossMailboxContext(checked);
                    void persistSettings({ crossMailboxContext: checked });
                    if (activeMode === 'context') {
                      void runAction('context', { crossMailbox: checked });
                    }
                  }}
                  data-testid="ai-vb-toggle-cross-mailbox"
                />
                <span>Шукати контекст і зв’язки в усіх моїх підключених скриньках (лише мій простір)</span>
              </label>
            </div>

            <div className="ai-vb-setting-field">
              <label className="ai-vb-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeAttachments}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIncludeAttachments(checked);
                    void persistSettings({ includeAttachments: checked });
                  }}
                  data-testid="ai-vb-toggle-attachments"
                />
                <span>Враховувати вкладення під час пояснення призначення та підсумку (потрібен дозвіл files.read)</span>
              </label>
            </div>

            <div className="ai-vb-setting-field ai-vb-setting-defaults">
              <button
                type="button"
                className="ai-vb-save-default-btn"
                onClick={() =>
                  void persistSettings({
                    defaultLang: selectedLang,
                    defaultAgentId: selectedAgentId,
                    summaryDepth,
                    crossMailboxContext,
                    includeAttachments,
                  })
                }
                data-testid="ai-vb-save-defaults"
              >
                <Check size={13} />
                <span>Зберегти поточного агента й мову ({taalLabelUk(selectedLang)}) за замовчуванням</span>
              </button>
              <a href={AI_TOEGANG_HREF} className="ai-vb-toegang-link">
                Керувати дозволами агентів у «Доступ ШІ» →
              </a>
            </div>
          </div>
        </div>
      )}

      {refusal && (
        <div className="ai-vb-refusal-banner" role="alert" data-testid="ai-vb-refusal-banner">
          <AlertTriangle size={16} className="ai-vb-refusal-icon" />
          <div className="ai-vb-refusal-content">
            <strong>Дію заблоковано політикою або налаштуваннями доступу ШІ</strong>
            <p>{refusal.messageUk}</p>
          </div>
          <a href={refusal.actionHref} className="ai-vb-refusal-link" data-testid="ai-vb-refusal-link">
            <span>{refusal.actionLabelUk}</span>
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {errorText && (
        <div className="ai-vb-error-banner" role="alert">
          <AlertTriangle size={15} />
          <span>{errorText}</span>
        </div>
      )}

      {lastResult && activeMode === 'translate' && (
        <div className="ai-vb-translate-status" role="status" data-testid="ai-vb-translate-status">
          <ShieldCheck size={14} />
          <span>
            {/* pakket 3: ook in het Nederlands; in de brief verwijst het naar de vertaalstrook boven het bericht (src/mail/VertaalStrook.tsx) */}
            {translationActive ? (
              nl ? (
                <>
                  Vertaling op de plaats zelf naar het <strong>{taalLabel('nl', lastResult.targetLang)}</strong> (taal van het origineel:{' '}
                  <strong>{taalLabel('nl', lastResult.detectedSourceLang) || lastResult.detectedSourceLang.toUpperCase()}</strong>, agent: <strong>{lastResult.agentName}</strong>). De opmaak blijft behouden.
                </>
              ) : (
                <>
                  Показано переклад на місці мовою: <strong>{lastResult.targetLangLabelUk}</strong> (визначена мова оригіналу:{' '}
                  <strong>{taalLabelUk(lastResult.detectedSourceLang)}</strong>, агент: <strong>{lastResult.agentName}</strong>). Форматування та розмітку збережено.
                </>
              )
            ) : nl ? (
              <>
                Het ongewijzigde origineel staat er. De vertaling naar het <strong>{taalLabel('nl', lastResult.targetLang)}</strong> blijft in de cache van deze sessie —{' '}
                {isDocumentView ? '«Vertalen ↔ Origineel tonen»' : '«Vertaling» in de strook boven het bericht'} zet ze meteen terug.
              </>
            ) : (
              <>
                Показано незмінений оригінал. Переклад мовою <strong>{lastResult.targetLangLabelUk}</strong> збережено в кеші сесії —{' '}
                {isDocumentView ? 'натисніть «Переклад ↔ Показати оригінал» для миттєвого повернення.' : '«Переклад» у смузі над листом поверне його миттєво.'}
              </>
            )}
          </span>
        </div>
      )}

      {lastResult && activeMode === 'summary' && lastResult.summary && (
        <article className="ai-vb-panel" aria-live="polite" data-testid="ai-vb-summary-panel">
          <header className="ai-vb-panel-header">
            <div>
              <strong>Витяг головного · {lastResult.summary.headline}</strong>
              <small>
                Мова: {lastResult.targetLangLabelUk} · Режим:{' '}
                {AI_VERTALING_SUMMARY_DEPTHS.find(d => d.id === lastResult.summary?.depth)?.labelUk || 'Стисло'} · Агент:{' '}
                {lastResult.agentName}
                {lastResult.cached ? ' · миттєво з кешу' : ''}
              </small>
            </div>
            <button type="button" className="ai-vb-close-btn" onClick={() => setActiveMode(null)} aria-label="Закрити підсумок">
              <X size={14} />
            </button>
          </header>

          <div className="ai-vb-panel-body">
            {(lastResult.summary.dates.length > 0 || lastResult.summary.sums.length > 0) && (
              <div className="ai-vb-chips-row">
                {lastResult.summary.dates.map(d => (
                  <span key={`date-${d}`} className="ai-vb-chip ai-vb-chip-date">
                    Дата / термін: <strong>{d}</strong>
                  </span>
                ))}
                {lastResult.summary.sums.map(s => (
                  <span key={`sum-${s}`} className="ai-vb-chip ai-vb-chip-sum">
                    Сума / показник: <strong>{s}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="ai-vb-columns">
              <div className="ai-vb-col">
                <h4>Ключові факти</h4>
                <ul>
                  {lastResult.summary.keyFacts.map((fact, idx) => (
                    <li key={idx}>{fact}</li>
                  ))}
                </ul>
              </div>

              <div className="ai-vb-col">
                <h4>Пункти дій та наступні кроки</h4>
                <ul>
                  {lastResult.summary.actionItems.map((act, idx) => (
                    <li key={idx}>{act}</li>
                  ))}
                </ul>
              </div>
            </div>

            {(summaryDepth === 'timeline' || summaryDepth === 'detailed') && lastResult.summary.timeline.length > 0 && (
              <div className="ai-vb-timeline-box">
                <h4>Хронологія подій</h4>
                <ol>
                  {lastResult.summary.timeline.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </article>
      )}

      {lastResult && activeMode === 'purpose' && lastResult.purpose && (
        <article className="ai-vb-panel" aria-live="polite" data-testid="ai-vb-purpose-panel">
          <header className="ai-vb-panel-header">
            <div>
              <strong>Що це за документ, про що, для чого і чому</strong>
              <small>
                Мова: {lastResult.targetLangLabelUk} · Агент: {lastResult.agentName}
                {lastResult.cached ? ' · миттєво з кешу' : ''}
              </small>
            </div>
            <button type="button" className="ai-vb-close-btn" onClick={() => setActiveMode(null)} aria-label="Закрити пояснення">
              <X size={14} />
            </button>
          </header>

          <div className="ai-vb-panel-body">
            <dl className="ai-vb-purpose-grid">
              <div>
                <dt>Що це за документ / лист</dt>
                <dd>{lastResult.purpose.documentType}</dd>
              </div>
              <div>
                <dt>Про що йдеться</dt>
                <dd>{lastResult.purpose.whatAbout}</dd>
              </div>
              <div>
                <dt>Для чого надіслано</dt>
                <dd>{lastResult.purpose.whatFor}</dd>
              </div>
              <div>
                <dt>Чому це важливо</dt>
                <dd>{lastResult.purpose.whyImportant}</dd>
              </div>
            </dl>

            {lastResult.purpose.attachmentsOverview.length > 0 && (
              <div className="ai-vb-attachments-purpose">
                <h4>
                  <Paperclip size={13} /> Роль вкладень у цьому повідомленні
                </h4>
                <ul>
                  {lastResult.purpose.attachmentsOverview.map((att, idx) => (
                    <li key={idx}>
                      <strong>{att.filename}:</strong> {att.roleExplanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>
      )}

      {lastResult && activeMode === 'context' && lastResult.contextAnalysis && (
        <article className="ai-vb-panel" aria-live="polite" data-testid="ai-vb-context-panel">
          <header className="ai-vb-panel-header">
            <div>
              <strong>Контекст і зв’язки в потоці та підключених скриньках</strong>
              <small>
                Ізольовано у вашому просторі · Міжскриньковий пошук: {crossMailboxContext ? 'увімкнено' : 'лише поточна скринька'} · Агент:{' '}
                {lastResult.agentName}
              </small>
            </div>
            <button type="button" className="ai-vb-close-btn" onClick={() => setActiveMode(null)} aria-label="Закрити контекст">
              <X size={14} />
            </button>
          </header>

          <div className="ai-vb-panel-body">
            <p className="ai-vb-context-overview">{lastResult.contextAnalysis.overview}</p>

            {lastResult.contextAnalysis.extractedTopics.length > 0 && (
              <div className="ai-vb-chips-row">
                {lastResult.contextAnalysis.extractedTopics.map(topic => (
                  <span key={topic} className="ai-vb-chip">
                    Тема: <strong>{topic}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="ai-vb-columns">
              <div className="ai-vb-col">
                <h4>Причинно-наслідкові зв’язки</h4>
                <ul>
                  {lastResult.contextAnalysis.causeAndEffectLinks.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {lastResult.contextAnalysis.nonObviousConnections.length > 0 && (
                <div className="ai-vb-col">
                  <h4>Неочевидні попередні взаємодії</h4>
                  <ul>
                    {lastResult.contextAnalysis.nonObviousConnections.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {lastResult.contextAnalysis.citations.length > 0 && (
              <div className="ai-vb-citations" data-testid="ai-vb-citations-list">
                <h4>Джерела та пов’язані листи (натисніть, щоб відкрити оригінал)</h4>
                <div className="ai-vb-citation-cards">
                  {lastResult.contextAnalysis.citations.map(cit => (
                    <div key={`${cit.accountId}:${cit.messageId}`} className="ai-vb-citation-card">
                      <div className="ai-vb-citation-top">
                        <span className="ai-vb-citation-badge">{cit.relationBadgeUk}</span>
                        <small>
                          {new Date(cit.receivedAt || Date.now()).toLocaleDateString('uk-UA', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </small>
                      </div>
                      <strong className="ai-vb-citation-subject">{cit.subject}</strong>
                      <span className="ai-vb-citation-from">{cit.from}</span>
                      <p className="ai-vb-citation-reason">{cit.causalLinkUk}</p>
                      {cit.snippet && <blockquote className="ai-vb-citation-snippet">«{cit.snippet}»</blockquote>}
                      <div className="ai-vb-citation-footer">
                        <button
                          type="button"
                          className="ai-vb-open-source-btn"
                          onClick={() => onOpenRelatedMessage?.(cit)}
                          data-testid={`ai-vb-open-citation-${cit.messageId}`}
                        >
                          <ExternalLink size={12} />
                          <span>Відкрити лист-джерело</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
