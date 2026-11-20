// EXT090-001 (06.11.2026), LOKAI-001 (17.11.2026): блок «Вбудований ШІ Chrome» у «Розширення браузера» — сторона сайту для розширення 0.9.0–0.9.7.
// Показує стан кожного API (offscreen.html має перевагу над виміром сторінки, ніколи create() без кліку), діагностику Chrome 157
// (Gemma 4 для uk/nl, WebMCP, SpeechRecognition, navigator.install), а для розширення 0.9.7+ надає помічник налаштування під задачу
// та генератор чистого flags.json. Чутливі «!»-перемикачі змінюються ЛИШЕ за окремим натисканням кнопки підтвердження користувачем.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Cpu, Download, Mic, Play, Settings, ShieldAlert, Sparkles, Wand2, XCircle } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { vergelijkVersie } from '../../shared/extensie-bijwerken';
import { sendToExtension } from '../extensie-toestand';
import { vernieuwExtensieStatus } from './extensie-live';
import {
  CHROME_157_VLAGGEN,
  LOKALE_AI_APIS,
  LOKALE_AI_INFO,
  LOKALE_AI_MAX_TEKST,
  LOKALE_AI_MIN_EXTENSIE,
  LOKALE_AI_PRESETS,
  LOKALE_AI_REDENEN,
  LOKALE_AI_STEL_MIN_EXTENSIE,
  PROMPT_SAMPLING_MODES,
  SUMMARIZER_PREFERENCES,
  beheerderLink,
  beleidTekst,
  bouwAanbevolenFlagsJson,
  filterLokaleAiAntwoord,
  filterLokaleAiPatch,
  kiesStand,
  laiRegel,
  meetBrowserCapaciteiten,
  meetPagina,
  stelVoorNaarTaak,
  type BrowserCapaciteiten,
  type GevaarVeld,
  type LokaleAiAntwoord,
  type LokaleAiApi,
  type LokaleAiBeleidWeergave,
  type LokaleAiKeuze,
  type LokaleAiPatch,
  type PaginaStand,
  type PromptSamplingMode,
  type SummarizerPreference,
  type TaakAdvies,
} from '../../shared/lokale-ai-model';
import '../agenten/agenten-toegang-maquette.css';

const ouder = (a: string, b: string) => vergelijkVersie(a, b) < 0;

const GEVAAR_UITLEG: Readonly<Record<GevaarVeld, [string, string]>> = Object.freeze({
  siteToegang: [
    'siteToegang — дозволяє сторінкам *.tarasevych.com запускати локальну модель (до 20 запитів/хв, навантаження на GPU/RAM пристрою; текст не виходить із пристрою).',
    'siteToegang — laat pagina’s van *.tarasevych.com het lokale model gebruiken (max. 20 verzoeken/min, belast GPU/RAM van dit apparaat; tekst blijft lokaal).',
  ],
  tabTekst: [
    'tabTekst — дозволяє читати виділений або видимий текст активної вкладки tarasevych.com (інші сайти ніколи не читаються).',
    'tabTekst — laat geselecteerde of zichtbare tekst van het actieve tarasevych.com-tabblad lezen (andere sites nooit).',
  ],
  multimodaal: [
    'multimodaal — дозволяє прикріплювати зображення та аудіофайли в діалозі (Prompt API, потребує відповідного прапорця Chrome).',
    'multimodaal — maakt beeld- en audio-invoer mogelijk in het gesprek (Prompt API, vraagt de bijbehorende Chrome-vlag).',
  ],
  autoDownload: [
    'autoDownload — дозволяє автоматично завантажувати файли моделі (кілька ГБ, потрібно ≥ 22 ГБ на диску).',
    'autoDownload — staat toe dat modelbestanden automatisch gedownload worden (enkele GB, ≥ 22 GB vrije schijfruimte nodig).',
  ],
});

const SAMPLING_NAAM: Readonly<Record<PromptSamplingMode, [string, string]>> = Object.freeze({
  default: ['типовий', 'standaard'],
  'most-predictable': ['найпередбачуваніший', 'meest voorspelbaar'],
  balanced: ['збалансований', 'gebalanceerd'],
  'most-creative': ['найтворчіший', 'meest creatief'],
});

const PREF_NAAM: Readonly<Record<SummarizerPreference, [string, string]>> = Object.freeze({
  auto: ['автоматично', 'automatisch'],
  speed: ['швидкість', 'snelheid'],
  capability: ['найвища якість', 'beste kwaliteit'],
});

export default function LokaleAiPaneel({ tr, keuze, extVersie, extId = '' }: { tr: Tr; keuze: LokaleAiKeuze | null; extVersie: string; extId?: string }) {
  const [pagina, setPagina] = useState<Record<LokaleAiApi, PaginaStand> | null>(null);
  const [cap, setCap] = useState<BrowserCapaciteiten | null>(null);
  const [pwaMelding, setPwaMelding] = useState<string>('');

  useEffect(() => {
    let weg = false;
    void meetPagina().then((r) => { if (!weg) setPagina(r); }).catch(() => undefined);
    void meetBrowserCapaciteiten().then((c) => { if (!weg) setCap(c); }).catch(() => undefined);
    return () => { weg = true; };
  }, []);

  const kanStellen = !!extId && !!extVersie && !ouder(extVersie, LOKALE_AI_STEL_MIN_EXTENSIE);

  // Реєструємо безпечні дії для ШІ-помічника на сторінці: він бачить стан і може застосовувати ТІЛЬКИ безпечні поля,
  // а чутливі «!»-дозволи (siteToegang, tabTekst, multimodaal, autoDownload) завжди лишає для натискання людиною.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let weg = false;
    let afmelden: (() => void) | null = null;
    void import('../ai-site-acties').then(({ registerSiteActions }) => {
      if (weg) return;
      afmelden = registerSiteActions('lokale_ai', [
        {
          id: 'get_status',
          description: 'Читає стан локального ШІ в браузері та розширенні (без змін).',
          run: () => ({ extVersie, kanStellen, keuze, pagina, capaciteiten: cap }),
        },
        {
          id: 'suggest_for_task',
          description: 'Підбирає рекомендовані налаштування локального ШІ та прапорці Chrome 157 під опис задачі (без змін).',
          params: { task: 'Опис того, що потрібно ввімкнути або налаштувати.' },
          run: (args) => stelVoorNaarTaak(String(args.task ?? ''), typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' : 'uk'),
        },
        {
          id: 'apply_safe_settings',
          description: 'Застосовує лише безпечні налаштування локального ШІ через розширення (ніколи не вмикає «!»-дозволи).',
          params: { task: 'Опис задачі для автоматичного підбору (необов’язково, якщо передано patch).', patch: 'JSON-об’єкт безпечних налаштувань.' },
          run: async (args) => {
            if (!kanStellen) throw new Error(`Для керування потрібне розширення версії ${LOKALE_AI_STEL_MIN_EXTENSIE} або новішої.`);
            const ruw = args.patch && typeof args.patch === 'object'
              ? args.patch
              : stelVoorNaarTaak(String(args.task ?? '')).veilig;
            // Залізне правило: агент ніколи не може передати bevestigGevaar: true.
            const { patch, geweigerdeGevaarVelden } = filterLokaleAiPatch(ruw, { bevestigGevaar: false });
            const r = await sendToExtension(extId, { type: 'LOKALE_AI_STEL_IN', patch, bevestigGevaar: false }, 10_000);
            window.postMessage({ mrExtStatus: true }, location.origin);
            void vernieuwExtensieStatus();
            return { result: r, pendingDangerousFields: geweigerdeGevaarVelden };
          },
        },
      ]);
    }).catch(() => undefined);
    return () => { weg = true; if (afmelden) afmelden(); };
  }, [extId, extVersie, kanStellen, keuze, pagina, cap]);

  // 0.9.1: вимір із розширення (offscreen.html) має перевагу; без нього рахується те, що повідомляє Chrome на цій сторінці.
  const regels = LOKALE_AI_APIS.map((api) => { const k = kiesStand(api, pagina, keuze); return { api, bron: k?.bron ?? null, r: k ? laiRegel(api, k.stand, keuze, extVersie, ouder, k.bron) : null }; });
  const klaar = regels.filter((x) => x.r?.stand === 'ja').length;
  const gemeten = regels.every((x) => x.r);
  const samenvatting = !gemeten ? tr('Перевіряємо, що підтримує цей Chrome…', 'Controleren wat deze Chrome ondersteunt…')
    : klaar ? tr(`Готово до роботи: ${klaar} з ${LOKALE_AI_APIS.length} функцій`, `Klaar voor gebruik: ${klaar} van ${LOKALE_AI_APIS.length} functies`)
      : tr('Зараз жодна функція не готова — нижче причина для кожної', 'Nu is geen functie klaar — hieronder per functie de reden');

  const ukDirect = keuze?.ukDirect ?? cap?.ukDirect ?? false;
  const nlDirect = keuze?.nlDirect ?? cap?.nlDirect ?? false;

  const installeerPwa = async () => {
    const nav = navigator as unknown as { install?: () => Promise<unknown> };
    if (typeof nav.install !== 'function') return;
    setPwaMelding(tr('Надсилаємо запит на встановлення…', 'Installatieverzoek verzenden…'));
    try {
      await nav.install();
      setPwaMelding(tr('Запит на встановлення виконано.', 'Installatieverzoek verwerkt.'));
    } catch {
      setPwaMelding(tr('Встановлення скасовано або недоступне.', 'Installatie geannuleerd of niet beschikbaar.'));
    }
  };

  return (
    <section className='ag-blok' data-ag-blok='extensie-lokale-ai' aria-labelledby='ag-ext-lokale-ai'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='ag-ext-lokale-ai'><Cpu aria-hidden='true' /> {tr('Вбудований ШІ Chrome', 'Ingebouwde AI van Chrome')}</h3>
        <p className='ag-blok-uitleg'>{tr(
          `Розширення ${LOKALE_AI_MIN_EXTENSIE}+ використовує модель Gemini Nano / Gemma 4, що працює прямо на цьому комп’ютері: стислий виклад, написання, переписування, переклад, визначення мови, коректура, значеннєві вектори, класифікація рішень і діалог. Текст не залишає пристрій — навіть сервер Mijn Ruimte його не бачить. Користуватися: бічна панель розширення → «Локальний ШІ».`,
          `Extensie ${LOKALE_AI_MIN_EXTENSIE}+ gebruikt het model Gemini Nano / Gemma 4 dat op deze computer zelf draait: samenvatten, schrijven, herschrijven, vertalen, taal herkennen, proeflezen, betekenisvectoren, beslissingen en een gesprek. Tekst verlaat het apparaat niet — ook de server van Mijn Ruimte ziet hem niet. Gebruik: zijpaneel van de extensie → «Lokale AI».`)}</p>
      </header>
      <p className={`ag-rij ag2-rij ${klaar ? 'is-let' : 'is-warn'}`} role='status' aria-live='polite' data-lai-samenvatting={gemeten ? klaar : 'bezig'}>
        {klaar ? <CheckCircle2 aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}<span>{samenvatting}</span>
      </p>
      <details className='ag-ext-lai' data-lai-details='1'>
        <summary title={tr('Для кожної функції: чи є вона в цьому Chrome і чи ввімкнено її в розширенні. «У розширенні» — перевірку зробило саме розширення (прихований offscreen-документ), бо там функції й працюють. Нічого не завантажує й не запускає.', 'Per functie: zit ze in deze Chrome en staat ze aan in de extensie. «In de extensie» — de extensie controleerde het zelf (verborgen offscreen-document), want daar draaien de functies. Downloadt of start niets.')}>
          {tr('Деталі по кожній функції', 'Details per functie')}
        </summary>
        <ul className='ag-ext-lijst' data-lijst='lokale-ai'>
          {regels.map(({ api, bron, r }) => (
            <li key={api} className='ag-rij ag2-rij' data-lai-api={api} data-lai-stand={r ? r.stand : 'bezig'} data-lai-bron={bron ?? 'bezig'}>
              {!r ? <Cpu aria-hidden='true' /> : r.stand === 'ja' ? <CheckCircle2 aria-hidden='true' /> : r.stand === 'nee' ? <XCircle aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}
              <span>
                <b>{tr(LOKALE_AI_INFO[api].uk, LOKALE_AI_INFO[api].nl)}</b>
                {LOKALE_AI_INFO[api].cpuLetOp ? ` (${tr('працює на CPU', 'draait op CPU')})` : ''}
                {r ? ` — ${tr(r.uk, r.nl)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className='ag-blok-uitleg' data-lai-capaciteiten='1'>
          {tr('Можливості Chrome 157 тут: ', 'Chrome 157-mogelijkheden hier: ')}
          {tr('пряма українська (Gemma 4): ', 'direct Oekraïens (Gemma 4): ')}<b>{ukDirect ? tr('так', 'ja') : tr('через перекладач', 'via vertaler')}</b>{' · '}
          {tr('пряма нідерландська: ', 'direct Nederlands: ')}<b>{nlDirect ? tr('так', 'ja') : tr('через перекладач', 'via vertaler')}</b>{' · '}
          {'WebMCP: '}<b>{cap?.webMcp ? tr('так', 'ja') : tr('ні', 'nee')}</b>{' · '}
          {tr('голосове диктування: ', 'spraakdicteren: ')}<b>{cap?.speechRecognition ? tr('так', 'ja') : tr('ні', 'nee')}</b>{' · '}
          {'navigator.install(): '}<b>{cap?.pwaInstall ? tr('так', 'ja') : tr('ні', 'nee')}</b>
        </p>
        {kanStellen && cap?.pwaInstall ? (
          <p className='ag-rij ag2-rij'>
            <button type='button' className='ag-knop' onClick={() => { void installeerPwa(); }} data-lai-actie='pwa-install'>
              <Download aria-hidden='true' /> {tr('Встановити застосунок (PWA)', 'Webapp installeren (PWA)')}
            </button>
            {pwaMelding ? <span role='status'>{pwaMelding}</span> : null}
          </p>
        ) : null}
        <p className='ag-blok-uitleg'>{tr(
          'Вимоги Chrome: Windows 10/11, macOS 13+, Linux або ChromeOS (Chromebook Plus); ≥ 22 ГБ вільного місця; GPU понад 4 ГБ або 16 ГБ RAM і 4 ядра; безлімітне з’єднання для першого завантаження моделі. З Gemma 4 українська та нідерландська можуть працювати напряму.',
          'Vereisten van Chrome: Windows 10/11, macOS 13+, Linux of ChromeOS (Chromebook Plus); ≥ 22 GB vrij; GPU met meer dan 4 GB of 16 GB RAM en 4 kernen; een onbeperkte verbinding voor de eerste download van het model. Met Gemma 4 werken Oekraïens en Nederlands vaak direct.')}</p>
      </details>

      {kanStellen && keuze ? <SlimmeAssistent tr={tr} keuze={keuze} extId={extId} /> : null}
      {keuze?.beleid ? <BeleidUit tr={tr} beleid={keuze.beleid} /> : <SiteToegang tr={tr} keuze={keuze} extId={extId} cap={cap} />}
    </section>
  );
}

/**
 * 0.9.6 (LAI-CON-001, рішення власника 16.11.2026): адміністратор вимкнув — не ховаємо, а пояснюємо: хто (з посиланням), чому, що
 * зробити. Beheerder zette het uit: niet verbergen maar uitleggen — wie (met link), waarom, wat te doen.
 */
function BeleidUit({ tr, beleid }: { tr: Tr; beleid: LokaleAiBeleidWeergave }) {
  const link = beheerderLink(beleid.door);
  const [uk, nl] = beleidTekst(beleid);
  return (
    <div className='ag-ext-lai-site' data-lai-site='beleid-uit'>
      <p className='ag-rij ag2-rij is-warn' role='status'><AlertTriangle aria-hidden='true' /><span>
        <b>{tr('Використання сайтом і ШІ-агентами вимкнув адміністратор', 'Gebruik door de site en AI-agenten uitgezet door de beheerder')}</b>{' — '}{tr(uk, nl)}
        {beleid.op ? ` (${new Date(beleid.op).toLocaleDateString(tr('uk-UA', 'nl-NL'))})` : ''}
      </span></p>
      {link ? <a className='ag-knop' href={link} data-lai-actie='beheerder'>{tr(`Написати адміністратору (${beleid.door})`, `De beheerder schrijven (${beleid.door})`)}</a> : null}
    </div>
  );
}

/**
 * 0.9.7 (LOKAI-001): помічник налаштування розширення під задачу користувача + генератор чистого flags.json.
 * Безпечні налаштування застосовуються одразу; будь-які «!»-перемикачі вимагають окремого натискання кнопки підтвердження.
 */
function SlimmeAssistent({ tr, keuze, extId }: { tr: Tr; keuze: LokaleAiKeuze; extId: string }) {
  const [taakTekst, setTaakTekst] = useState('');
  const [gekozenPreset, setGekozenPreset] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [statusMelding, setStatusMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [metDecisionsVlag, setMetDecisionsVlag] = useState(false);
  const [flagsGekopieerd, setFlagsGekopieerd] = useState(false);

  const taal = typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' : 'uk';
  const preset = useMemo(() => LOKALE_AI_PRESETS.find((p) => p.id === gekozenPreset) ?? null, [gekozenPreset]);
  const advies: TaakAdvies = useMemo(() => {
    if (preset) {
      return {
        matchedIds: [preset.id],
        veilig: preset.veilig,
        gevaar: preset.gevaar,
        vlaggen: preset.vlaggen,
        waarschuwingen: preset.cpuWaarschuwing ? [{
          uk: 'Увага: прапорець #decisions-api у Chrome 157 переводить локальні моделі на CPU замість GPU.',
          nl: 'Let op: #decisions-api zet in Chrome 157 lokale modellen op CPU in plaats van GPU.',
        }] : [],
      };
    }
    return stelVoorNaarTaak(taakTekst, taal);
  }, [preset, taakTekst, taal]);

  const teBevestigenGevaar = (Object.entries(advies.gevaar) as Array<[GevaarVeld, boolean]>)
    .filter(([k, v]) => v === true && keuze.gevaar?.[k] !== true);

  const stuurPatch = async (patch: LokaleAiPatch, bevestigGevaar: boolean) => {
    if (!extId || bezig) return;
    setBezig(true); setStatusMelding(null);
    const res = await sendToExtension(extId, { type: 'LOKALE_AI_STEL_IN', patch, bevestigGevaar }, 12_000) as {
      ok?: boolean;
      reason?: string;
      toegepast?: string[];
      geweigerdeGevaarVelden?: string[];
    } | null;
    setBezig(false);
    if (res && res.ok) {
      window.postMessage({ mrExtStatus: true }, location.origin);
      void vernieuwExtensieStatus();
      const lijst = Array.isArray(res.toegepast) && res.toegepast.length ? res.toegepast.join(', ') : tr('без змін', 'ongewijzigd');
      setStatusMelding({
        ok: true,
        tekst: tr(`Застосовано в розширенні: ${lijst}.`, `Toegepast in extensie: ${lijst}.`),
      });
    } else {
      const reden = res && typeof res.reason === 'string' && res.reason in LOKALE_AI_REDENEN
        ? tr(...LOKALE_AI_REDENEN[res.reason])
        : tr(...LOKALE_AI_REDENEN.GEEN_ANTWOORD);
      setStatusMelding({ ok: false, tekst: reden });
    }
  };

  const flagsJson = useMemo(() => bouwAanbevolenFlagsJson({ metDecisions: metDecisionsVlag }), [metDecisionsVlag]);

  const kopieerFlags = async () => {
    try {
      await navigator.clipboard.writeText(flagsJson);
      setFlagsGekopieerd(true);
      window.setTimeout(() => setFlagsGekopieerd(false), 2500);
    } catch { /* ігнор */ }
  };
  const downloadFlags = () => {
    try {
      const blob = new Blob([flagsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chrome-flags-mijn-ruimte.json';
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* ігнор */ }
  };

  return (
    <div className='ag-ext-lai-assistent' data-lai-assistent='1'>
      <h4 className='ag-ext-lai-kop'><Wand2 aria-hidden='true' /> {tr('Швидке налаштування під вашу задачу', 'Snel instellen voor uw taak')}</h4>
      <p className='ag-blok-uitleg'>{tr(
        'Опишіть, що хочете робити, або оберіть готовий профіль нижче — сайт сам налаштує потрібні безпечні опції в розширенні. Чутливі «!»-дозволи ніколи не вмикаються потайки: для них нижче буде окрема кнопка підтвердження.',
        'Beschrijf wat u wilt doen of kies een profiel — de site stelt de veilige opties in de extensie voor u in. Gevoelige «!»-rechten worden nooit stilzwijgend aangezet: daarvoor verschijnt een aparte bevestigingsknop.')}</p>

      <div className='ag-ext-lai-presets' role='group' aria-label={tr('Готові сценарії', 'Kant-en-klare scenario’s')}>
        {LOKALE_AI_PRESETS.map((p) => (
          <button
            key={p.id}
            type='button'
            className={`ag-knop ag-ext-lai-preset${gekozenPreset === p.id ? ' is-actief' : ''}`}
            aria-pressed={gekozenPreset === p.id}
            data-lai-preset={p.id}
            onClick={() => { setGekozenPreset(gekozenPreset === p.id ? null : p.id); }}
          >
            <Sparkles aria-hidden='true' /> {tr(p.uk, p.nl)}
          </button>
        ))}
      </div>

      <label className='ag-veld'>{tr('Або опишіть задачу своїми словами', 'Of beschrijf de taak in uw eigen woorden')}
        <input
          type='text'
          value={taakTekst}
          maxLength={400}
          placeholder={tr('Напр.: швидке стисле читання сторінок або пошук за змістом і голос…', 'Bijv.: pagina’s snel samenvatten of zoeken op betekenis met spraak…')}
          onChange={(e) => { setGekozenPreset(null); setTaakTekst(e.target.value); }}
          data-lai-veld='taak'
        />
      </label>

      {preset ? <p className='ag-blok-uitleg'>{tr(preset.beschrijvingUk, preset.beschrijvingNl)}</p> : null}

      {advies.waarschuwingen.map((w, idx) => (
        <p key={idx} className='ag-rij ag2-rij is-warn'><AlertTriangle aria-hidden='true' /><span>{tr(w.uk, w.nl)}</span></p>
      ))}

      <div className='ag-ext-lai-acties'>
        <button
          type='button'
          className='ag-knop ag-knop-primary'
          disabled={bezig}
          onClick={() => { void stuurPatch(advies.veilig, false); }}
          data-lai-actie='stel-veilig'
        >
          <Wand2 aria-hidden='true' /> {bezig ? tr('Застосовуємо…', 'Bezig…') : tr('Застосувати безпечні налаштування', 'Veilige instellingen toepassen')}
        </button>
      </div>

      {teBevestigenGevaar.length > 0 ? (
        <div className='ag-ext-lai-gevaar-blok' data-lai-gevaar-bevestig='1'>
          <p className='ag-rij ag2-rij is-warn'>
            <ShieldAlert aria-hidden='true' />
            <span><b>{tr('Потрібне ваше явне підтвердження «!»-дозволів:', 'Uw uitdrukkelijke bevestiging voor «!»-rechten is nodig:')}</b></span>
          </p>
          <ul className='ag-ext-lijst'>
            {teBevestigenGevaar.map(([k]) => (
              <li key={k} className='ag-rij ag2-rij'><AlertTriangle aria-hidden='true' /><span>{tr(...GEVAAR_UITLEG[k])}</span></li>
            ))}
          </ul>
          <button
            type='button'
            className='ag-knop'
            disabled={bezig}
            onClick={() => { void stuurPatch({ ...advies.veilig, ...advies.gevaar }, true); }}
            data-lai-actie='bevestig-gevaar'
          >
            <ShieldAlert aria-hidden='true' /> {tr('Підтвердити «!»-дозволи та ввімкнути все для цієї задачі', '«!»-rechten bevestigen en alles voor deze taak aanzetten')}
          </button>
        </div>
      ) : null}

      {statusMelding ? (
        <p className={`ag-rij ag2-rij ${statusMelding.ok ? 'is-let' : 'is-warn'}`} role='status' aria-live='polite' data-lai-stel-status={statusMelding.ok ? 'ok' : 'fout'}>
          {statusMelding.ok ? <CheckCircle2 aria-hidden='true' /> : <XCircle aria-hidden='true' />}
          <span>{statusMelding.tekst}</span>
        </p>
      ) : null}

      <details className='ag-ext-lai-vlaggen' data-lai-vlaggen='1'>
        <summary>{tr('Прапорці Chrome 157 та готовий файл flags.json', 'Vlaggen voor Chrome 157 en kant-en-klaar flags.json')}</summary>
        <p className='ag-blok-uitleg'>{tr(
          'Системні прапорці chrome://flags браузер Chrome не дозволяє змінювати сайтам чи розширенням автоматично з міркувань безпеки — проте ви можете скопіювати чи завантажити очищений набір нижче та імпортувати його в chrome://flags/#import-export-flags.',
          'Systeemvlaggen in chrome://flags mag geen enkele site of extensie automatisch wijzigen vanwege browserbeveiliging — wel kunt u hieronder de geschoonde set kopiëren of downloaden en importeren via chrome://flags/#import-export-flags.')}</p>
        <ul className='ag-ext-lijst'>
          {CHROME_157_VLAGGEN.map((v) => (
            <li key={v.id} className='ag-rij ag2-rij' data-lai-vlag={v.id}>
              {v.gevaarlijk ? <XCircle aria-hidden='true' /> : v.aanbevolen ? <CheckCircle2 aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}
              <span>
                <code>chrome://flags/#{v.id}</code> — {tr(v.uk, v.nl)}
                {v.letOpUk ? <span className='ag-ext-lai-letop'> ({tr(v.letOpUk, v.letOpNl || v.letOpUk)})</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <label className='ag-ext-lai-vinkje'>
          <input type='checkbox' checked={metDecisionsVlag} onChange={(e) => setMetDecisionsVlag(e.target.checked)} data-lai-veld='met-decisions' data-hulp-vrij='keuze' />
          <span>{tr('Додати у файл #decisions-api (переводить моделі на CPU)', 'Ook #decisions-api opnemen (zet modellen op CPU)')}</span>
        </label>
        <div className='ag-ext-lai-acties'>
          <button type='button' className='ag-knop' onClick={() => { void kopieerFlags(); }} data-lai-actie='kopieer-flags'>
            <Copy aria-hidden='true' /> {flagsGekopieerd ? tr('Скопійовано flags.json', 'flags.json gekopieerd') : tr('Скопіювати безпечний flags.json', 'Veilige flags.json kopiëren')}
          </button>
          <button type='button' className='ag-knop' onClick={downloadFlags} data-lai-actie='download-flags'>
            <Download aria-hidden='true' /> {tr('Завантажити chrome-flags-mijn-ruimte.json', 'chrome-flags-mijn-ruimte.json downloaden')}
          </button>
        </div>
      </details>
    </div>
  );
}

/**
 * 0.9.2–0.9.7: «Використання сторінками сайту». Показує, чи ввімкнув користувач «!»-перемикач siteToegang,
 * і лише тоді дає змогу локально обробляти текст (включно з embedder, decisions, preference, samplingMode і диктуванням).
 */
function SiteToegang({ tr, keuze, extId, cap }: { tr: Tr; keuze: LokaleAiKeuze | null; extId: string; cap: BrowserCapaciteiten | null }) {
  const [modus, setModus] = useState<LokaleAiApi>('summarizer');
  const [tekst, setTekst] = useState('');
  const [doelTaal, setDoelTaal] = useState('uk');
  const [preference, setPreference] = useState<SummarizerPreference>('auto');
  const [samplingMode, setSamplingMode] = useState<PromptSamplingMode>('default');
  const [decisionsSchema, setDecisionsSchema] = useState('');
  const [spreekBezig, setSpreekBezig] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<LokaleAiAntwoord | null>(null);

  if (!keuze || typeof keuze.siteToegang !== 'boolean') return null; // розширення старіше за 0.9.2 не повідомляє цього
  const openOpties = () => { if (extId) void sendToExtension(extId, { type: 'OPEN_OPTIONS' }); };
  if (!keuze.siteToegang) {
    return (
      <div className='ag-ext-lai-site' data-lai-site='uit'>
        <p className='ag-rij ag2-rij is-warn'><AlertTriangle aria-hidden='true' /><span>
          <b>{tr('! Використання сторінками сайту: вимкнено', '! Gebruik door pagina’s van de site: uit')}</b>{' — '}
          {tr('Якщо ввімкнути, сторінки *.tarasevych.com зможуть надсилати текст локальній моделі й отримувати результат. Текст лишається на цьому пристрої, але сторінка навантажує GPU/RAM вашого комп’ютера (не більше 20 запитів за хвилину, модель ніколи не завантажується без вашого натискання).',
            'Aangezet kunnen pagina’s van *.tarasevych.com tekst naar het lokale model sturen en het resultaat terugkrijgen. De tekst blijft op dit apparaat, maar de pagina belast de GPU/RAM van uw computer (hoogstens 20 verzoeken per minuut; het model wordt nooit zonder uw klik gedownload).')}
        </span></p>
        {extId ? (
          <button type='button' className='ag-knop' onClick={openOpties} data-lai-actie='opties'
            title={tr('Відкриває налаштування розширення. Перемикач «!» вмикаєте лише ви; сайт сам його змінити не може.', 'Opent de instellingen van de extensie. De «!»-schakelaar zet alleen u aan; de site kan hem niet zelf wijzigen.')}>
            <Settings aria-hidden='true' /> {tr('Відкрити налаштування розширення', 'Instellingen van de extensie openen')}
          </button>
        ) : null}
      </div>
    );
  }
  const startDicteren = () => {
    const g = globalThis as unknown as {
      SpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: (ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void };
      webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: (ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void };
    };
    const Rec = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (!Rec || spreekBezig) return;
    const rec = new Rec();
    rec.lang = typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl-NL' : 'uk-UA';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const r = ev.results?.[0]?.[0]?.transcript?.trim();
      if (r) setTekst((v) => (v ? `${v} ${r}` : r).slice(0, LOKALE_AI_MAX_TEKST));
    };
    rec.onerror = () => setSpreekBezig(false);
    rec.onend = () => setSpreekBezig(false);
    setSpreekBezig(true);
    try { rec.start(); } catch { setSpreekBezig(false); }
  };
  const voerUit = async () => {
    if (!extId || bezig) return;
    setBezig(true); setUitkomst(null);
    const payload: Record<string, unknown> = {
      type: 'LOKALE_AI',
      modus,
      tekst: tekst.slice(0, LOKALE_AI_MAX_TEKST),
    };
    if (modus === 'translator') payload.doel = doelTaal;
    if (modus === 'summarizer' && preference !== 'auto') payload.preference = preference;
    if (modus === 'prompt' && samplingMode !== 'default') payload.samplingMode = samplingMode;
    if (modus === 'decisions' && decisionsSchema.trim()) payload.schema = decisionsSchema.trim();
    const r = await sendToExtension(extId, payload, 125_000);
    setUitkomst(filterLokaleAiAntwoord(r)); setBezig(false);
  };
  const beschikbaar = LOKALE_AI_APIS.filter((a) => keuze.apis.includes(a));
  return (
    <div className='ag-ext-lai-site' data-lai-site='aan'>
      <p className='ag-rij ag2-rij is-let'><CheckCircle2 aria-hidden='true' /><span>
        <b>{tr('! Використання сторінками сайту: увімкнено', '! Gebruik door pagina’s van de site: aan')}</b>{' — '}
        {tr('спробуйте тут: текст обробляє модель на цьому комп’ютері, сервер його не отримує.', 'probeer het hier: het model op deze computer verwerkt de tekst, de server krijgt hem niet.')}
      </span></p>
      <label className='ag-veld'>{tr('Функція', 'Functie')}
        <select value={modus} onChange={(e) => setModus(e.target.value as LokaleAiApi)} data-lai-veld='modus' data-hulp-vrij='keuze'>
          {beschikbaar.map((a) => <option key={a} value={a}>{tr(LOKALE_AI_INFO[a].uk, LOKALE_AI_INFO[a].nl)}</option>)}
        </select>
      </label>
      {modus === 'translator' ? (
        <label className='ag-veld'>{tr('Мова перекладу', 'Doeltaal')}
          <select value={doelTaal} onChange={(e) => setDoelTaal(e.target.value)} data-lai-veld='doel' data-hulp-vrij='keuze'>
            <option value='uk'>{tr('українська', 'Oekraïens')}</option><option value='nl'>{tr('нідерландська', 'Nederlands')}</option><option value='en'>{tr('англійська', 'Engels')}</option>
          </select>
        </label>
      ) : null}
      {modus === 'summarizer' ? (
        <label className='ag-veld'>{tr('Пріоритет', 'Voorkeur')}
          <select value={preference} onChange={(e) => setPreference(e.target.value as SummarizerPreference)} data-lai-veld='preference' data-hulp-vrij='keuze'>
            {SUMMARIZER_PREFERENCES.map((p) => <option key={p} value={p}>{tr(...PREF_NAAM[p])}</option>)}
          </select>
        </label>
      ) : null}
      {modus === 'prompt' ? (
        <label className='ag-veld'>{tr('Режим вибірки', 'Samplingmodus')}
          <select value={samplingMode} onChange={(e) => setSamplingMode(e.target.value as PromptSamplingMode)} data-lai-veld='samplingMode' data-hulp-vrij='keuze'>
            {PROMPT_SAMPLING_MODES.map((m) => <option key={m} value={m}>{tr(...SAMPLING_NAAM[m])}</option>)}
          </select>
        </label>
      ) : null}
      {modus === 'embedder' ? (
        <p className='ag-blok-uitleg'>{tr('Підказка: щоб виміряти змістову схожість двох фрагментів, розділіть їх рядком ---', 'Tip: om de betekenisovereenkomst van twee fragmenten te meten, scheidt u ze met ---')}</p>
      ) : null}
      {modus === 'decisions' ? (
        <label className='ag-veld'>{tr('JSON-схема рішень (необов’язково; працює на CPU)', 'JSON-schema voor beslissingen (optioneel; draait op CPU)')}
          <textarea value={decisionsSchema} rows={2} maxLength={8000} onChange={(e) => setDecisionsSchema(e.target.value)} data-lai-veld='decisions-schema' />
        </label>
      ) : null}
      <label className='ag-veld'>{tr('Текст', 'Tekst')}
        <textarea value={tekst} maxLength={LOKALE_AI_MAX_TEKST} rows={4} onChange={(e) => setTekst(e.target.value)} data-lai-veld='tekst' />
      </label>
      <div className='ag-ext-lai-acties'>
        <button type='button' className='ag-knop' onClick={() => { void voerUit(); }} disabled={bezig || !tekst.trim() || !beschikbaar.includes(modus)} data-lai-actie='uitvoeren'
          title={tr('Виконує вибрану функцію моделлю на цьому пристрої (до 120 с). Якщо модель ще не завантажена, нічого не завантажується — з’явиться пояснення.', 'Voert de gekozen functie uit met het model op dit apparaat (tot 120 s). Is het model nog niet gedownload, dan wordt niets gedownload — u krijgt uitleg.')}>
          <Play aria-hidden='true' /> {bezig ? tr('Виконується…', 'Bezig…') : tr('Виконати на цьому пристрої', 'Uitvoeren op dit apparaat')}
        </button>
        {cap?.speechRecognition ? (
          <button type='button' className='ag-knop' disabled={spreekBezig} onClick={startDicteren} data-lai-actie='dicteren'>
            <Mic aria-hidden='true' /> {spreekBezig ? tr('Слухаю…', 'Luisteren…') : tr('Надиктувати', 'Dicteren')}
          </button>
        ) : null}
      </div>
      <div role='status' aria-live='polite' data-lai-uitkomst={uitkomst ? (uitkomst.ok ? 'ok' : uitkomst.reden) : ''}>
        {uitkomst?.ok ? <pre className='ag-ext-lai-uit'>{uitkomst.tekst}</pre> : null}
        {uitkomst && !uitkomst.ok && uitkomst.beleid ? <BeleidUit tr={tr} beleid={uitkomst.beleid} /> : null}
        {uitkomst && !uitkomst.ok && !uitkomst.beleid ? <p className='ag-rij ag2-rij is-warn'><XCircle aria-hidden='true' /><span>{tr(...(LOKALE_AI_REDENEN[uitkomst.reden] ?? LOKALE_AI_REDENEN.FOUT))}</span></p> : null}
      </div>
    </div>
  );
}
