import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Columns2,
  Plug,
  Check,
  ChevronDown,
  ExternalLink,
  FileQuestion,
  GitBranch,
  Languages,
  LoaderCircle,
  Lock,
  Paperclip,
  Settings,
  ShieldCheck,
  TextQuote,
  X,
} from 'lucide-react';
import { api } from '../platform/client';
import {
  AI_TOEGANG_HREF,
  AI_VERTALING_SUMMARY_DEPTHS,
  aiBalkZichtbaar,
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
import { aiHrefOplossen, herlaadAiStaat, zetDienstAkkoord, zetMotorGebruik, useBalkSessieVerborgen, useLaatsteAiStaat, useMotorVoorkeur, zetAiBalkTonen, zetBalkSessieVerborgen, zetMotorVoorkeur } from './ai-staat';
import AiUitleg from './AiUitleg';
import MotorKiezer, { MotorLogo } from './MotorKiezer';
import { lokaalExtra, lokaalGebruik, LokaleFout, useLokaleStand, vatSamenLokaal, vertaalLokaal } from './lokale-motor';
import { andereMotor, kiesMotor, LOKAAL_MOTOR_ID, MOTOR_AUTO, motorenVoorPost, verwerktDoor, type MotorKaart, type MotorPrijzen } from '../../shared/mail-ai-motor';
import { gebruikSleutelDienst, gebruikSleutelEigen, type DienstGebruik, type DienstMotorPubliek } from '../../shared/ai-dienst-motor';
import type { AiAanbiederId } from '../../shared/ai-aanbieders';
import './motor-kiezer.css';
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
/* MAILAI-005 (16.11.2026, Павло затвердив макет «Рядок дій»): панель тепер сама є одним рядком — головна кнопка «Перекласти» з мовою,
   поруч інструменти, праворуч хто обробляє. Тому інструменти типово ВИДНО на кожному екрані; стрілка лише ховає їх для того, хто так
   хоче (значення '0' у тому самому ключі; старе '1' = «розгорнуто» читається як і раніше).
   Het paneel is nu zelf één regel; de hulpmiddelen staan standaard open, het pijltje verbergt ze voor wie dat wil. */
export function aiBalkStartIngeklapt(): boolean {
  if (typeof window === 'undefined') return false;
  try { if (window.localStorage.getItem(AI_BALK_OPEN_SLEUTEL) === '0') return true; } catch { /* privévenster: standaard */ }
  return false;
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
  /** MAILAI-001: alleen voor tests en de stand — het paneel tonen zonder serverstaat (SSR kent geen /state-antwoord). */
  voorbeeldZichtbaar?: boolean;
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
  voorbeeldZichtbaar = false,
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
  // MAILAI-001: панель видно лише після відповіді сервера, якщо людина її ввімкнула і є робочий рушій (aiBalkZichtbaar).
  const [staatGeladen, setStaatGeladen] = useState(false);
  const gedeeldeStaat = useLaatsteAiStaat();
  // MAILAI-002: рушії (локальний ШІ Chrome + ваші ключі), ваш вибір на цьому пристрої, «сховати зараз» і запропонований інший рушій.
  const lokaal = useLokaleStand();
  const voorkeur = useMotorVoorkeur();
  // MAILAI-003: спільні рушії сайту (лише ввімкнені власником), лічильник на сьогодні, орієнтовні ціни; стан перечитується після згоди.
  const [dienst, setDienst] = useState<DienstMotorPubliek[]>([]);
  const [motorGebruik, setMotorGebruik] = useState<Record<string, DienstGebruik>>({});
  const [prijzen, setPrijzen] = useState<MotorPrijzen | null>(null);
  const [staatVersie, setStaatVersie] = useState(0);
  const lExtra = lokaalExtra();
  const kaarten = useMemo(
    () => motorenVoorPost(agents, lokaal, { dienst, gebruik: motorGebruik, prijzen, lokaalPrompt: lExtra.lokaalPrompt, beleid: lExtra.beleid }),
    [agents, lokaal, dienst, motorGebruik, prijzen, lExtra.lokaalPrompt, lExtra.beleid?.reden, lExtra.beleid?.door],
  );
  const telGebruik = (teller: string, g?: DienstGebruik | null) => {
    if (!g || !teller) return;
    setMotorGebruik(curr => ({ ...curr, [teller]: g }));
    setDienst(curr => curr.map(d => (gebruikSleutelDienst(d.id) === teller ? { ...d, vandaag: g.vandaag } : d)));
    zetMotorGebruik(teller, g);
  };
  const sessieVerborgen = useBalkSessieVerborgen();
  const [sluitKeuzeOpen, setSluitKeuzeOpen] = useState(false);
  const [voorstel, setVoorstel] = useState<{ mode: AiVertalingMode; motor: MotorKaart } | null>(null);
  const balkId = useId();
  const nl = isNl();
  const t = (uk: string, nlTekst: string) => (nl ? nlTekst : uk);
  const wisselIngeklapt = () => setIngeklapt((was) => {
    try { window.localStorage.setItem(AI_BALK_OPEN_SLEUTEL, was ? '1' : '0'); } catch { /* optioneel */ }
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
          dienstMotoren?: DienstMotorPubliek[];
          gebruik?: Record<string, DienstGebruik>;
          prijzen?: MotorPrijzen | null;
        };
        const loadedAgents = Array.isArray(data?.agents) ? data.agents : [];
        setAgents(loadedAgents);
        setDienst(Array.isArray(data?.dienstMotoren) ? data.dienstMotoren : []);
        setMotorGebruik(data?.gebruik && typeof data.gebruik === 'object' ? data.gebruik : {});
        setPrijzen(data?.prijzen || null);
        setStaatGeladen(true);
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
        // MAILAI-001: раніше тут вигадувався «Приватний асистент» зі станом «Активний» — кнопки виглядали робочими, але не працювали.
        // Тепер чесно: стан невідомий → агентів немає → панель не показується (переклад нічого не надсилає).
        setAgents([]);
        setMotoren(motorenMetStand([], isDocumentView));
        setSelectedAgentId('');
        setStaatGeladen(true);
      });
    return () => {
      active = false;
    };
  }, [context.service, context.tabContext, context.sourceOrigin, staatVersie]);

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
      // MAILAI-002: welke motor? Uw keuze (of «авто» = eerst gratis); een expliciete keuze die deze functie niet kan → niets versturen.
      const motor = overrides?.agent ? kaarten.find(k => k.id === overrides.agent) || null : kiesMotor(kaarten, voorkeur, mode);
      const agentId = motor?.agentId || overrides?.agent || selectedAgentId || 'prive:mijn-ruimte-assistent';

      setActiveMode(mode);
      setRefusal(null);
      setErrorText('');
      setVoorstel(null);
      if (!motor || motor.staat !== 'klaar' || !motor.functies.includes(mode)) {
        setErrorText(t(
          'Обраний рушій цього не вміє або ще не готовий. Оберіть інший у «Рушії ШІ» — текст без вашого вибору нікуди не надсилається.',
          'De gekozen motor kan dit niet of is nog niet klaar. Kies een andere in «AI-motoren» — zonder uw keuze gaat de tekst nergens heen.',
        ));
        return;
      }

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

      if (motor.soort === 'lokaal') {
        setBusyMode(mode);
        try {
          const basis: AiVertalingRunResponse = {
            ok: true, mode, targetLang, targetLangLabelUk: taalLabelUk(targetLang), detectedSourceLang: '', agentId: LOKAAL_MOTOR_ID,
            agentName: t('Локальний ШІ Chrome', 'Lokale AI van Chrome'), cached: false, motorId: LOKAAL_MOTOR_ID, motorNaam: t('Локальний ШІ Chrome', 'Lokale AI van Chrome'),
            privacy: { strippedTrackingPixels: 0, strippedTrackingParams: 0, redactedSecrets: 0, scopeVerified: [], ruimte: 'prive' },
          };
          let data: AiVertalingRunResponse;
          if (mode === 'translate') {
            const r = await vertaalLokaal(payloadSegments, targetLang);
            data = { ...basis, translations: r.translations, onvertaald: r.onvertaald };
          } else {
            data = { ...basis, summary: await vatSamenLokaal([subject, bodyText].filter(Boolean).join('\n\n')) };
          }
          if (!aliveRef.current) return;
          localCacheRef.current.set(cacheKey, data);
          setLastResult(data);
          if (mode === 'translate' && data.translations) {
            setHasTranslation(true);
            onTranslationsReady(data.translations, '', { motorNaam: data.motorNaam || '', doelTaal: targetLang, onvertaald: data.onvertaald || 0 });
            onToggleTranslationActive(true);
          }
        } catch (err) {
          if (!aliveRef.current) return;
          const reden = err instanceof LokaleFout ? err.tekst(nl) : t('Не вдалося виконати на цьому пристрої.', 'Uitvoeren op dit apparaat mislukt.');
          setErrorText(`${reden} ${t('Оригінал листа не змінено.', 'Het origineel is niet veranderd.')}`);
          const ander = andereMotor(kaarten, motor.id, mode);
          if (ander) setVoorstel({ mode, motor: ander });
        } finally {
          if (aliveRef.current) setBusyMode(null);
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
        // MAILAI-003: лічильник цього рушія одразу після відповіді — «сьогодні 5 із 30», залишок у постачальника.
        telGebruik(data.dienstId ? gebruikSleutelDienst(data.dienstId) : data.aanbiederId ? gebruikSleutelEigen(data.aanbiederId as AiAanbiederId) : '', data.gebruik);

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
        // MAILAI-002: ліміт постачальника або недійсний ключ — сказати саме це і запропонувати інший готовий рушій.
        const code = String(errBody?.error || '');
        // MAILAI-003: спільний рушій сайту — межа на людину, вимкнено власником, немає згоди, сервер не відповів. Кажемо саме це,
        // пропонуємо інший готовий рушій і перечитуємо стан (картки мають показати правду).
        const dienstFout = ['DIENST_LIMIET', 'DIENST_AANBIEDER_LIMIET', 'DIENST_ONBEREIKBAAR', 'DIENST_UIT', 'DIENST_AKKOORD_NODIG', 'DIENST_FUNCTIE', 'MOTOR_NIET_BESCHIKBAAR'].includes(code);
        if (errBody?.gebruik) telGebruik(errBody.dienstId ? gebruikSleutelDienst(String(errBody.dienstId)) : errBody.aanbiederId ? gebruikSleutelEigen(errBody.aanbiederId as AiAanbiederId) : '', errBody.gebruik as DienstGebruik);
        if (dienstFout) {
          setErrorText(String((nl ? errBody.messageNl : errBody.messageUk) || errBody.messageUk || ''));
          const ander = andereMotor(kaarten, motor.id, mode);
          if (ander) setVoorstel({ mode, motor: ander });
          if (code === 'DIENST_UIT' || code === 'DIENST_AKKOORD_NODIG' || code === 'MOTOR_NIET_BESCHIKBAAR') { setStaatVersie(v => v + 1); void herlaadAiStaat(context); }
          if (code === 'DIENST_AKKOORD_NODIG') setMotorenOpen(true);
        } else if (errBody?.error === 'AANBIEDER_LIMIET' || errBody?.error === 'AANBIEDER_SLEUTEL_ONGELDIG' || errBody?.error === 'VERTAALMOTOR_GEEN_ANTWOORD') {
          setErrorText(String((nl ? errBody.messageNl : errBody.messageUk) || errBody.messageUk || ''));
          const ander = andereMotor(kaarten, motor.id, mode);
          if (ander) setVoorstel({ mode, motor: ander });
        } else if (errBody?.messageUk || err?.response?.status === 403 || err?.status === 403) {
          setRefusal({
            code: String(errBody.error || 'ACCESS_DENIED'),
            messageUk:
              String(errBody.messageUk || '') ||
              'Обраний ШІ-агент не має дозволу на читання пошти або документів (mail.read / files.read).',
            actionLabelUk: String(errBody.actionLabelUk || 'Відкрити «Доступ ШІ»'),
            actionHref: aiHrefOplossen(String(errBody.actionHref || AI_TOEGANG_HREF)),
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
      kaarten,
      voorkeur,
      nl,
    ],
  );

  // When user clicks toolbar "Перекласти" button externally (`translationActive` flips true without `hasTranslation`), trigger translate
  useEffect(() => {
    if (translationActive && !hasTranslation && !busyMode && segments.length > 0) {
      void runAction('translate');
    }
  }, [translationActive, hasTranslation, busyMode, segments.length, runAction]);

  const balkTonen = gedeeldeStaat?.geladen ? gedeeldeStaat.instellingen.balkTonen === true : settings.balkTonen === true;
  const sluitBalk = () => {
    setSettings(curr => ({ ...curr, balkTonen: false }));
    void zetAiBalkTonen(false, context).catch(() => {
      setSettings(curr => ({ ...curr, balkTonen: true }));
      setErrorText(t('Не вдалося зберегти: панель лишається. Спробуйте ще раз.', 'Opslaan is niet gelukt: het paneel blijft staan. Probeer het opnieuw.'));
    });
  };
  // Вимкнено або немає жодного робочого рушія: панелі немає зовсім (без порожнього місця). Хуки вище працюють далі, тож переклад,
  // який людина обрала в смузі над листом чи в «Вигляд → Мова листа», і далі виконується (якщо є робочий агент).
  if (!voorbeeldZichtbaar && (sessieVerborgen || !aiBalkZichtbaar({ geladen: staatGeladen, balkTonen, motoren, lokaalKlaar: lokaal === 'klaar' }))) return null;
  // Wie krijgt de tekst nu (voor vertalen)? Altijd zichtbaar, ook ingeklapt.
  const actief = kiesMotor(kaarten, voorkeur, 'translate');
  const kiesVoorkeur = (id: string) => {
    zetMotorVoorkeur(id);
    const k = kaarten.find(x => x.id === id);
    if (k?.agentId) { setSelectedAgentId(k.agentId); void persistSettings({ defaultAgentId: k.agentId }); }
    setErrorText(''); setVoorstel(null); setRefusal(null);
    if (translationActive || activeMode === 'translate') void runAction('translate', { agent: id === MOTOR_AUTO ? undefined : id });
  };
  // Куди йде текст і хто платить — повним реченням у підказці чипа (у самому чипі лише логотип, назва й лічильник).
  const wieTitel = !actief ? t('Обраний рушій зараз не готовий. Натисніть, щоб обрати інший.', 'De gekozen motor is nu niet klaar. Klik om een andere te kiezen.')
    : `${actief.soort === 'lokaal' ? t('Текст не покидає цей комп’ютер', 'De tekst verlaat deze computer niet')
      : actief.soort === 'eigen-server' ? t('Сервер Mijn Ruimte → власний сервер сайту, без ШІ-компаній', 'Server van Mijn Ruimte → eigen server van de site, geen AI-bedrijf')
      : actief.soort === 'dienst-eigenaar' ? t('Сервер Mijn Ruimte → постачальник, ключем сайту (не вашим); платить власник сайту', 'Server van Mijn Ruimte → aanbieder, met de sleutel van de site (niet de uwe); de eigenaar van de site betaalt')
      : t('Ваш сервер → постачальник, вашим ключем', 'Uw server → aanbieder, met uw sleutel')}. ${actief.gebruikUk ? `${t(actief.gebruikUk, actief.gebruikNl || actief.gebruikUk)}. ` : ''}${t('Натисніть, щоб обрати, хто обробляє текст.', 'Klik om te kiezen wie de tekst verwerkt.')}`;
  const kanFunctie = (mode: AiVertalingMode) => Boolean(kiesMotor(kaarten, voorkeur, mode));
  // MAILAI-003: згода на спільний рушій (або відкликання). Після відкликання обраний рушій повертається до «Авто»: він більше не готовий.
  const dienstAkkoord = async (id: string, aan: boolean) => {
    await zetDienstAkkoord(id, aan, context);
    if (!aan && voorkeur === `dienst:${id}`) zetMotorVoorkeur(MOTOR_AUTO);
    setStaatVersie(v => v + 1);
  };
  const nietKanTitel = t('Обраний рушій цього не вміє (локальний ШІ: лише переклад і підсумок). Оберіть інший у «Рушії ШІ».', 'De gekozen motor kan dit niet (lokale AI: alleen vertaling en samenvatting). Kies een andere in «AI-motoren».');
  const gebruik = actief?.soort === 'lokaal' ? lokaalGebruik() : null;

  return (
    <section
      className={`ai-vertaling-balk is-rij${translationActive ? ' is-translated' : ''}${isDocumentView ? ' is-document' : ''}`}
      data-ai-vertaling-balk
      data-translation-state={translationActive ? 'translated' : 'original'}
      data-ingeklapt={ingeklapt ? 'ja' : 'nee'}
      aria-label={t('Інтелектуальна панель перекладу, підсумку та контексту ШІ', 'AI-paneel voor vertaling, samenvatting en context')}
    >
      {/* MAILAI-005: один рядок. Ліворуч головна дія (переклад + мова), далі інструменти, праворуч — хто обробляє текст. */}
      <div className="ai-vb-main-row">
        <div className="ai-vb-hoofd" id={`${balkId}-kiezers`}>
          <button
            type="button"
            className={`ai-vb-mode-btn ai-vb-hoofd-knop${activeMode === 'translate' || translationActive ? ' active' : ''}`}
            disabled={busyMode !== null}
            onClick={() => void runAction('translate')}
            title={t('Перекладає текст листа обраною мовою тим рушієм, що показаний праворуч. Оригінал не змінюється: повернутися можна одним натисканням.', 'Vertaalt de tekst van het bericht naar de gekozen taal met de motor die rechts staat. Het origineel verandert niet: terug kan met één klik.')}
            data-testid="ai-vb-btn-translate"
          >
            {busyMode === 'translate' ? <LoaderCircle size={16} className="spin" /> : <Languages size={16} />}
            <span>{t('Перекласти', 'Vertalen')}</span>
          </button>
          <label className="ai-vb-select-group ai-vb-taal" title={t('Мова, якою перекладати й відповідати. Якщо переклад уже показано, зміна мови одразу перекладає заново.', 'De taal waarin vertaald en geantwoord wordt. Staat de vertaling al open, dan wordt meteen opnieuw vertaald.')}>
            <span className="ai-vb-sr">{t('Цільова мова', 'Doeltaal')}</span>
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
                    <option key={`rec-${langItem.code}`} value={langItem.code} title={langItem.nativeLabel}>
                      {nl ? langItem.nativeLabel : langItem.labelUk}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Усі мови">
                {orderedLanguages.restItems.map(langItem => (
                  <option key={langItem.code} value={langItem.code} title={langItem.nativeLabel}>
                    {nl ? langItem.nativeLabel : langItem.labelUk}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>

        <div className="ai-vb-modes" id={`${balkId}-modi`} role="toolbar" aria-label={t('Режими роботи ШІ', 'AI-functies')}>
          {(hasTranslation || translationActive) && (
            <button
              type="button"
              className={`ai-vb-toggle-orig-btn${translationActive ? ' showing-translation' : ' showing-original'}`}
              onClick={() => onToggleTranslationActive(!translationActive)}
              data-testid="ai-vb-btn-toggle-original"
              title={t('Миттєве перемикання між оригіналом і перекладом без втрати форматування. Переклад лишається в пам’яті вкладки, новий запит не надсилається.', 'Meteen wisselen tussen origineel en vertaling, zonder verlies van opmaak. De vertaling blijft in het geheugen van het tabblad; er gaat geen nieuw verzoek weg.')}
            >
              <ArrowLeftRight size={13} />
              <span>{translationActive ? t('Показати оригінал', 'Origineel tonen') : t('Показати переклад', 'Vertaling tonen')}</span>
            </button>
          )}

          <button
            type="button"
            className={`ai-vb-mode-btn${activeMode === 'summary' ? ' active' : ''}`}
            disabled={busyMode !== null || !kanFunctie('summary')}
            title={kanFunctie('summary') ? t('Короткий підсумок листа: головне, дати й суми.', 'Korte samenvatting van het bericht: de kern, datums en bedragen.') : nietKanTitel}
            onClick={() => void runAction('summary')}
            data-testid="ai-vb-btn-summary"
          >
            {busyMode === 'summary' ? <LoaderCircle size={15} className="spin" /> : <TextQuote size={15} />}
            <span>{t('Підсумок', 'Samenvatting')}</span>
          </button>

          <button
            type="button"
            className={`ai-vb-mode-btn${activeMode === 'purpose' ? ' active' : ''}`}
            disabled={busyMode !== null || !kanFunctie('purpose')}
            title={kanFunctie('purpose') ? t('Що це за документ, про що, для чого і чому його надіслали.', 'Wat voor document dit is, waarover, waarvoor en waarom het is gestuurd.') : nietKanTitel}
            onClick={() => void runAction('purpose')}
            data-testid="ai-vb-btn-purpose"
          >
            {busyMode === 'purpose' ? <LoaderCircle size={15} className="spin" /> : <FileQuestion size={15} />}
            <span>{t('Про що лист', 'Waar het over gaat')}</span>
          </button>

          {!isDocumentView && (
            <button
              type="button"
              className={`ai-vb-mode-btn${activeMode === 'context' ? ' active' : ''}`}
              disabled={busyMode !== null || !kanFunctie('context')}
              title={kanFunctie('context') ? t('Контекст і зв’язки: шукає пов’язані листи у ваших скриньках і показує, як вони стосуються цього.', 'Context en verbanden: zoekt verwante berichten in uw postvakken en toont hoe ze hierbij horen.') : nietKanTitel}
              onClick={() => void runAction('context')}
              data-testid="ai-vb-btn-context"
            >
              {busyMode === 'context' ? <LoaderCircle size={15} className="spin" /> : <GitBranch size={15} />}
              <span>{t('Зв’язки', 'Verbanden')}</span>
            </button>
          )}

          {/* Punt 16: оригінал ліворуч, переклад праворуч (на телефоні — одне під одним). */}
          {onWeergave && (
            <button
              type="button"
              className={`ai-vb-mode-btn is-icoon${weergave === 'naast' ? ' active' : ''}`}
              aria-pressed={weergave === 'naast'}
              aria-label={weergave === 'naast' ? t('Поруч: увімкнено', 'Naast elkaar: aan') : t('Оригінал і переклад поруч', 'Origineel en vertaling naast elkaar')}
              title={t('Оригінал і переклад поруч: оригінал ліворуч, переклад праворуч. На телефоні — одне під одним.', 'Origineel en vertaling naast elkaar: origineel links, vertaling rechts. Op de telefoon onder elkaar.')}
              onClick={() => onWeergave(normaliseerVertaalWeergave(weergave === 'naast' ? 'inline' : 'naast'))}
              data-testid="ai-vb-btn-naast"
            >
              <Columns2 size={15} />
            </button>
          )}
        </div>

        <div className="ai-vb-brand">
          <button
            type="button"
            className={`ai-vb-motor-chip${motorenOpen ? ' active' : ''}`}
            aria-expanded={motorenOpen}
            aria-haspopup="dialog"
            aria-label={`${t('Рушії ШІ', 'AI-motoren')}: ${actief ? (actief.dienst ? actief.dienst.naam : t(actief.naamUk, actief.naamNl)) : t('не обрано', 'niet gekozen')}`}
            title={wieTitel}
            onClick={() => setMotorenOpen(v => !v)}
            data-testid="ai-vb-btn-motoren"
          >
            {actief ? <MotorLogo k={actief} maat={24} /> : <AlertTriangle size={16} aria-hidden="true" />}
            <span className="ai-vb-wie" data-testid="ai-vb-wie" data-motor-actief={actief?.id || ''}>
              {actief ? (actief.dienst ? actief.dienst.naam : t(actief.naamUk, actief.naamNl)) : t('Оберіть рушій', 'Kies een motor')}
            </span>
            {actief?.dienst && <span className="mk-teller" data-testid="ai-vb-wie-gebruik">{t(`${actief.dienst.vandaag} з ${actief.dienst.limietPerDag}`, `${actief.dienst.vandaag} van ${actief.dienst.limietPerDag}`)}</span>}
            {gebruik && <span className="mk-teller" title={t('Розширення пропускає до 20 запитів за хвилину з цієї сторінки.', 'De extensie laat tot 20 verzoeken per minuut van deze pagina door.')}>{gebruik.minuut}/{gebruik.max}</span>}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`ai-vb-settings-trigger${settingsOpen ? ' active' : ''}`}
            aria-expanded={settingsOpen}
            aria-label={t('Налаштування панелі ШІ', 'Instellingen van het AI-paneel')}
            title={t('Налаштування: глибина підсумку, пошук зв’язків у всіх скриньках, читання вкладень, типова мова.', 'Instellingen: diepte van de samenvatting, verbanden in alle postvakken, bijlagen lezen, standaardtaal.')}
            onClick={() => setSettingsOpen(v => !v)}
            data-testid="ai-vb-btn-settings"
          >
            <Settings size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ai-vb-inklap"
            aria-expanded={!ingeklapt}
            aria-controls={`${balkId}-modi`}
            aria-label={ingeklapt ? t('Показати інструменти ШІ: мова, переклад, підсумок', 'AI-hulpmiddelen tonen: taal, vertaling, samenvatting') : t('Сховати інструменти ШІ', 'AI-hulpmiddelen verbergen')}
            title={ingeklapt ? t('Показати інструменти ШІ', 'AI-hulpmiddelen tonen') : t('Сховати інструменти ШІ', 'AI-hulpmiddelen verbergen')}
            onClick={wisselIngeklapt}
            data-testid="ai-vb-inklap"
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ai-vb-sluit"
            aria-label={t('Сховати панель ШІ над усіма листами', 'AI-paneel boven alle berichten verbergen')}
            title={t(
              'Сховати цю панель над усіма листами (налаштування вашого облікового запису). Повернути: «Вигляд» у шапці листа → «ШІ-аналіз над листом». Переклад у смузі над листом працює й без панелі.',
              'Dit paneel boven alle berichten verbergen (instelling van uw account). Terugzetten: «Weergave» in de kop van het bericht → «AI-analyse boven het bericht». Vertalen in de strook boven het bericht werkt ook zonder paneel.',
            )}
            onClick={() => setSluitKeuzeOpen(o => !o)}
            aria-expanded={sluitKeuzeOpen}
            aria-haspopup="true"
            data-testid="ai-vb-sluit"
          >
            <X size={16} aria-hidden="true" />
          </button>
          {sluitKeuzeOpen && (
            <div className="ai-vb-sluit-keuze" role="group" aria-label={t('Як сховати панель ШІ', 'Hoe het AI-paneel verbergen')} data-testid="ai-vb-sluit-keuze"
              onKeyDown={e => { if (e.key === 'Escape') setSluitKeuzeOpen(false); }}>
              <button type="button" className="mk-knop" autoFocus data-sluit="sessie"
                onClick={() => { setSluitKeuzeOpen(false); zetBalkSessieVerborgen(true); }}>
                <strong>{t('Сховати зараз', 'Nu verbergen')}</strong>
                <small>{t('Лише до закриття цієї вкладки, щоб не відволікало. Налаштування не змінюються.', 'Alleen tot u dit tabblad sluit, zodat het niet afleidt. De instellingen blijven zoals ze zijn.')}</small>
              </button>
              <button type="button" className="mk-knop" data-sluit="uit" onClick={() => { setSluitKeuzeOpen(false); sluitBalk(); }}>
                <strong>{t('Вимкнути зовсім', 'Helemaal uitzetten')}</strong>
                <small>{t('На всіх ваших пристроях, доки не ввімкнете знову: «Вигляд» у шапці листа → «ШІ-аналіз над листом».', 'Op al uw apparaten, tot u het weer aanzet: «Weergave» in de kop van het bericht → «AI-analyse boven het bericht».')}</small>
              </button>
              <button type="button" className="ai-vb-wie-knop" data-sluit="annuleer" onClick={() => setSluitKeuzeOpen(false)}>{t('Скасувати', 'Annuleren')}</button>
            </div>
          )}
        </div>
      </div>

      {/* Punt 16: каталог рушіїв з чесним станом — «що працює зараз, що треба підключити, чого ще немає», з кнопкою підключення
          такою ж, як на інших картках інтеграцій. Нічого не імітуємо: у рушія зі станом «ще немає» кнопки немає взагалі. */}
      {motorenOpen && <div className="ai-vb-scherm" onClick={() => setMotorenOpen(false)} aria-hidden="true" />}
      {motorenOpen && (
        <div className="ai-vb-motoren" role="dialog" aria-label={t('Рушії перекладу', 'Vertaalmotoren')} data-testid="ai-vb-motoren"
          onKeyDown={e => { if (e.key === 'Escape') setMotorenOpen(false); }}>
          <i className="ai-vb-greep" aria-hidden="true" />
          <div className="ai-vb-settings-header">
            <strong>{t('Хто обробляє текст', 'Wie de tekst verwerkt')}</strong>
            <InfoTip className="ai-vb-uitleg" label={t('Що таке «ШІ» в цій панелі', 'Wat «AI» in dit paneel betekent')}>
              {nl ? (
                <><strong>Dit is geen aparte motor en geen knop.</strong> Vertaling, samenvatting en context doet de motor die u hier kiest. Er wordt niets verstuurd zonder dat u klikt, en de
                tekst van de brief verandert pas als u op «Vertalen» klikt.</>
              ) : (
                <><strong>Це не окремий рушій і не кнопка.</strong> Переклад, підсумок і зв’язки робить той рушій, який ви обрали тут. Нічого не надсилається без вашого натискання, і
                текст листа не змінюється, доки ви не натиснете «Перекласти».</>
              )}
            </InfoTip>
            <span className="ai-vb-space-badge" title={t('Працює виключно через ваш приватний простір і лише за вашим запитом.', 'Werkt alleen via uw privéruimte en alleen op uw verzoek.')}>
              <Lock size={11} aria-hidden="true" />
              {t('Приватний простір', 'Privéruimte')}
            </span>
            <button type="button" className="ai-vb-close-btn" autoFocus onClick={() => setMotorenOpen(false)} aria-label={t('Закрити перелік рушіїв', 'Lijst met motoren sluiten')}>
              <X size={16} />
            </button>
          </div>
          <MotorKiezer nl={nl} kaarten={kaarten} voorkeur={voorkeur} onKies={kiesVoorkeur} lokaal={lokaal} onAkkoord={dienstAkkoord} />
          <details className="mk-later">
            <summary>{t('Як працює ШІ в пошті й конфіденційність', 'Hoe de AI in de post werkt en privacy')}</summary>
            <AiUitleg nl={nl} />
          </details>
          <details className="mk-later">
            <summary>{t('Служби перекладу без ШІ (каталог)', 'Vertaaldiensten zonder AI (catalogus)')}</summary>
          <ul className="ai-vb-motoren-lijst">
            {motoren.map(motor => (
              <li key={motor.id} className="ai-vb-motor-kaart" data-motor={motor.id} data-motor-staat={motor.staat}>
                <div className="ai-vb-motor-kop">
                  <strong>{motor.naam}</strong>
                  <span className="ai-vb-motor-staat" data-staat={motor.staat}>{VERTAAL_MOTOR_STAAT_TEKST[motor.staat][nl ? 1 : 0]}</span>
                </div>
                <small className="ai-vb-motor-leverancier">
                  {motor.leverancier}
                  {motor.plek === 'eigen-server' ? t(' · на вашому сервері', ' · op uw server') : motor.plek === 'eigen-sleutel' ? t(' · ваш власний ключ', ' · uw eigen sleutel') : t(' · сторонній сервіс', ' · externe dienst')}
                </small>
                <p>{nl && motor.uitlegNl ? motor.uitlegNl : motor.uitlegUk}</p>
                {motor.staat === 'aansluiten' && motor.aansluitenHref ? (
                  <a className="ai-vb-motor-knop" href={aiHrefOplossen(motor.aansluitenHref, 'sleutels')} data-motor-aansluiten={motor.id}>
                    <Plug size={13} aria-hidden="true" />
                    {t('Підключити', 'Koppelen')}
                  </a>
                ) : motor.staat === 'werkt' ? (
                  <span className="ai-vb-motor-klaar"><Check size={13} aria-hidden="true" />{t('Підключено й готовий до роботи', 'Gekoppeld en klaar')}</span>
                ) : (
                  <span className="ai-vb-motor-leeg"><AlertTriangle size={13} aria-hidden="true" />{t('Підключення ще не написано — цей рушій зараз недоступний', 'De koppeling is nog niet geschreven — deze motor is nu niet beschikbaar')}</span>
                )}
              </li>
            ))}
          </ul>
          </details>
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
                <span>Зберегти поточного агента й мову ({taalLabelUk(selectedLang)}) типово</span>
              </button>
              <a href={aiHrefOplossen(AI_TOEGANG_HREF)} className="ai-vb-toegang-link">
                {t('Дозволи агентів: «Підключення ШІ» → «Доступи» →', 'Rechten van agenten: «AI-verbindingen» → «Toegang» →')}
              </a>
              <a href={aiHrefOplossen(AI_TOEGANG_HREF, 'sleutels')} className="ai-vb-toegang-link" data-testid="ai-vb-sleutels-link">
                {t('Ключі постачальників ШІ: «Сховище ключів» →', 'Sleutels van AI-aanbieders: «Sleutelkluis» →')}
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
          {voorstel && (
            <button type="button" className="mk-knop" data-testid="ai-vb-ander-motor"
              title={t('Виконати цей запит іншим готовим рушієм. Ваш основний вибір не змінюється.', 'Dit verzoek uitvoeren met een andere motor die klaar is. Uw vaste keuze blijft.')}
              onClick={() => { const x = voorstel; setVoorstel(null); void runAction(x.mode, { agent: x.motor.id }); }}>
              {t(`Спробувати: ${voorstel.motor.naamUk}`, `Proberen met: ${voorstel.motor.naamNl}`)}
            </button>
          )}
        </div>
      )}
      {lastResult && !errorText && (
        <p className="ai-vb-verwerkt" data-testid="ai-vb-verwerkt">
          <ShieldCheck size={13} aria-hidden="true" />
          {t('Оброблено: ', 'Verwerkt: ')}{verwerktDoor({ lokaal: lastResult.motorId === LOKAAL_MOTOR_ID, aanbiederId: lastResult.aanbiederId, agentName: lastResult.agentName, dienst: lastResult.dienstId ? dienst.find(d => d.id === lastResult.dienstId) || null : null }, nl)}
        </p>
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
