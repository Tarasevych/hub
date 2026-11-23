// Картка стану зв’язку сторінки з сервером — частина єдиної екосистеми сповіщень і доказової бази (HERSTEL-001).
//
// Усі формулювання походять із shared/foutuitleg.ts: операція, служба, точний код відповіді, час останньої спроби та номер спроби.
// Про встановлення оновлення картка повідомляє лише за виміряним фактом із src/platform/uitrol-feit.ts; інакше чесно зазначає,
// що стан розгортання не підтверджено. Кожна спроба під час перерви записується в тривалий реєстр доказів і хронології
// (src/platform/verbinding-bewijs-opslag.ts), зберігається в історії центру сповіщень після відновлення та синхронізується з сервером.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  History,
  Maximize2,
  Minimize2,
  RefreshCw,
  ServerCrash,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  codeLabel,
  detailsTekst,
  dienstVanHostnaam,
  kiesTaal,
  legUit,
  type Feiten,
  type Lang,
  type UitrolFeit,
} from '../shared/foutuitleg';
import {
  meldServerAntwoord,
  opServerStoring,
  opStoringFeiten,
  serverStoring,
  serverStoringFeiten,
  type StoringFeiten,
} from './platform/nieuwe-versie';
import { uitrolFeit } from './platform/uitrol-feit';
import { MELDINGEN_OPENEN_EVENT, publiceerPaginaSignaal, verwijderPaginaSignaal } from './canoniek-meldingen';
import { useVlag } from './functievlag-lezen';
import {
  abonneerVerbindingIncidenten,
  duurTekst,
  klokTijd,
  leesVerbindingIncidenten,
  markeerVerbindingHersteld,
  registreerVerbindingPoging,
  type VerbindingIncidentBewijs,
} from './platform/verbinding-bewijs-opslag';
import './platform/verbinding-plakkaat.css';

type Phase = 'online' | 'offline' | 'restored' | 'server';

const RESTORED_MS = 8000;
/** Назва операції людською мовою для кожного невдалого звернення сторінки до сервера. */
const OPERATIE: readonly [string, string] = ['Звʼязок сторінки з сервером', 'Verbinding van de pagina met de server'];
const OPERATIE_OFFLINE: readonly [string, string] = ['Зʼєднання з мережею', 'Verbinding met het netwerk'];

const readOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const hostDienst = () => (typeof location === 'undefined' ? 'hub' : dienstVanHostnaam(location.hostname));
/** Журнал розгортання розміщено на admin.<власний домен>, вкладка «/updates». */
const journaalUrl = () => {
  if (typeof location === 'undefined') return '/updates';
  const delen = location.hostname.split('.');
  return delen.length >= 3 ? `${location.protocol}//admin.${delen.slice(1).join('.')}/updates` : '/updates';
};

export default function CanonicalConnectionBanner({ lang }: { lang: 'uk' | 'nl' }) {
  const taal: Lang = lang === 'nl' ? 'nl' : 'uk';
  const t = (uk: string, nl: string) => kiesTaal(taal, uk, nl);
  const bewijsVlagAan = useVlag('melding-verbinding-bewijs-v1', true);

  const [phase, setPhase] = useState<Phase>(() => (readOffline() ? 'offline' : serverStoring() ? 'server' : 'online'));
  const [storingFeiten, setStoringFeiten] = useState<StoringFeiten | null>(() => serverStoringFeiten());
  const [offlineSinds, setOfflineSinds] = useState(() => (readOffline() ? Date.now() : 0));
  const [offlinePoging, setOfflinePoging] = useState(() => (readOffline() ? 1 : 0));
  const [uitrol, setUitrol] = useState<UitrolFeit | null>(null);
  const [open, setOpen] = useState(false);
  const [ingeklapt, setIngeklapt] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [incidenten, setIncidenten] = useState<VerbindingIncidentBewijs[]>(() => leesVerbindingIncidenten());

  const wasOffline = useRef(phase === 'offline' || phase === 'server');
  const restoreTimer = useRef<number | undefined>(undefined);
  const laatsteIncidentIdRef = useRef<string>('');
  const bewijsVlagRef = useRef(bewijsVlagAan);
  bewijsVlagRef.current = bewijsVlagAan;

  useEffect(() => abonneerVerbindingIncidenten((lijst) => setIncidenten(lijst)), []);

  const clearRestoreTimer = useCallback(() => {
    if (restoreTimer.current !== undefined) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = undefined;
    }
  }, []);

  const goOffline = useCallback(() => {
    clearRestoreTimer();
    wasOffline.current = true;
    setOfflineSinds(Date.now());
    setOfflinePoging((n) => n + 1);
    setPhase('offline');
  }, [clearRestoreTimer]);

  const goOnline = useCallback(() => {
    clearRestoreTimer();
    if (!wasOffline.current) {
      setPhase('online');
      return;
    }
    wasOffline.current = false;
    if (bewijsVlagRef.current) {
      markeerVerbindingHersteld(Date.now());
    }
    setIngeklapt(false);
    setOpen(false);
    setPhase('restored');
    restoreTimer.current = window.setTimeout(() => setPhase('online'), RESTORED_MS);
  }, [clearRestoreTimer]);

  // Відповіді 502/503/504/520–530 відкривають картку з точними фактами; перша успішна відповідь переводить у стан відновлення.
  useEffect(() => {
    const zet = (storing: boolean, feitenInvoer: StoringFeiten | null) => {
      if (readOffline()) return;
      clearRestoreTimer();
      if (storing) {
        wasOffline.current = true;
        setStoringFeiten(feitenInvoer);
        setPhase('server');
        return;
      }
      setStoringFeiten(null);
      setUitrol(null);
      if (!wasOffline.current) return;
      wasOffline.current = false;
      if (bewijsVlagRef.current) {
        markeerVerbindingHersteld(Date.now());
      }
      setIngeklapt(false);
      setOpen(false);
      setPhase('restored');
      restoreTimer.current = window.setTimeout(() => setPhase('online'), RESTORED_MS);
    };
    if (serverStoring()) zet(true, serverStoringFeiten());
    const losFeiten = opStoringFeiten((f) => {
      if (f) setStoringFeiten(f);
    });
    const los = opServerStoring(zet);
    return () => {
      losFeiten();
      los();
    };
  }, [clearRestoreTimer]);

  // Лише під час наявної перерви одноразово перевіряємо справжній стан розгортання без здогадів.
  useEffect(() => {
    if (phase !== 'server') return;
    let stop = false;
    void uitrolFeit()
      .then((f) => {
        if (!stop) setUitrol(f);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [phase]);

  useEffect(() => {
    const sync = () => {
      if (readOffline()) goOffline();
      else if (wasOffline.current) goOnline();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    sync();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearRestoreTimer();
    };
  }, [goOnline, goOffline, clearRestoreTimer]);

  const feiten: Feiten | null = useMemo(() => {
    if (phase === 'server') {
      return {
        operatie: OPERATIE,
        dienst: storingFeiten?.dienst || hostDienst(),
        route: storingFeiten?.route || '',
        code: storingFeiten?.code || '',
        status: storingFeiten?.status || 0,
        tijd: storingFeiten?.tijd || 0,
        poging: storingFeiten?.poging || 0,
        lichaam: storingFeiten?.lichaam || '',
        uitrol,
      };
    }
    if (phase === 'offline') {
      return {
        operatie: OPERATIE_OFFLINE,
        dienst: hostDienst(),
        route: '',
        code: 'BROWSER_OFFLINE',
        status: 0,
        tijd: offlineSinds,
        poging: offlinePoging,
        lichaam: '',
        uitrol: null,
      };
    }
    return null;
  }, [phase, storingFeiten, uitrol, offlineSinds, offlinePoging]);

  const uitleg = useMemo(() => (feiten ? legUit(taal, feiten) : null), [feiten, taal]);

  // Записуємо кожну спробу в тривалий реєстр доказів і хронології, щоб жодна подія не зникла після відновлення.
  useEffect(() => {
    if (!bewijsVlagAan || !feiten || (phase !== 'server' && phase !== 'offline')) return;
    const geregistreerd = registreerVerbindingPoging({
      soort: phase === 'offline' ? 'netwerk_offline' : 'server_storing',
      dienst: feiten.dienst,
      status: feiten.status,
      code: feiten.code,
      route: feiten.route,
      tijd: feiten.tijd,
      poging: feiten.poging,
      lichaam: feiten.lichaam,
      uitrolStand: feiten.uitrol ? (feiten.uitrol.actief ? 'bezig' : 'nee') : 'onbekend',
    });
    if (geregistreerd.id !== laatsteIncidentIdRef.current) {
      laatsteIncidentIdRef.current = geregistreerd.id;
      setIngeklapt(false);
    }
  }, [bewijsVlagAan, feiten, phase]);

  const huidigeDienst = feiten?.dienst || hostDienst();
  const actiefIncident = useMemo(
    () => incidenten.find((x) => x.hersteldOp === null && x.dienst === huidigeDienst) || incidenten.find((x) => x.hersteldOp === null) || null,
    [incidenten, huidigeDienst],
  );
  const laatstHersteld = useMemo(() => {
    const gesloten = incidenten
      .filter((x) => x.hersteldOp !== null)
      .sort((a, b) => (b.hersteldOp || 0) - (a.hersteldOp || 0));
    return gesloten.find((x) => x.dienst === huidigeDienst) || gesloten[0] || null;
  }, [incidenten, huidigeDienst]);

  const openMeldingenHistorie = useCallback(() => {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(MELDINGEN_OPENEN_EVENT));
    }
  }, []);

  // «Повторити»: справжня перевірка /api/version без проміжного збереження.
  const nuProberen = useCallback(async () => {
    setBezig(true);
    try {
      const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
      let lichaam = '';
      try {
        lichaam = r.ok ? '' : (await r.text()).slice(0, 2000);
      } catch {
        /* відповідь без тіла */
      }
      meldServerAntwoord(r.status, { route: 'GET /api/version', code: `HTTP_${r.status}`, lichaam });
      if (r.ok && readOffline() === false) goOnline();
    } catch {
      meldServerAntwoord(0, { route: 'GET /api/version', code: 'NETWORK_ERROR' });
    } finally {
      setBezig(false);
    }
  }, [goOnline]);

  const kopieer = useCallback(async () => {
    if (!feiten || !uitleg) return;
    const basisTekst = detailsTekst(taal, feiten, uitleg);
    const chronologieRegels =
      bewijsVlagAan && actiefIncident?.pogingen.length
        ? [
            '',
            `${t('інцидент', 'incident')}: ${actiefIncident.id}`,
            `${t('початок інциденту', 'begin van incident')}: ${klokTijd(taal, actiefIncident.eersteTijd, feiten.zone)}`,
            `${t('хронологія спроб', 'tijdlijn van pogingen')} (${actiefIncident.pogingen.length}):`,
            ...actiefIncident.pogingen.map(
              (p) => `  #${p.nr} · ${klokTijd(taal, p.tijd, feiten.zone)}${p.route ? ` — ${p.route}` : ''} → ${codeLabel({ code: p.code, status: p.status })}`,
            ),
          ]
        : [];
    const tekst = chronologieRegels.length ? `${basisTekst}\n${chronologieRegels.join('\n')}` : basisTekst;
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 2500);
    } catch {
      setGekopieerd(false);
    }
  }, [feiten, uitleg, taal, bewijsVlagAan, actiefIncident, t]);

  useEffect(() => {
    if (phase === 'online') {
      verwijderPaginaSignaal('band:verbinding');
      return;
    }
    if (phase === 'restored') {
      publiceerPaginaSignaal({
        id: 'band:verbinding',
        bron: 'verbinding-band',
        kanaal: 'pagina',
        subdomein: 'systeem',
        soort: 'verbinding_hersteld',
        ernst: 'succes',
        titelUk: 'Сервер знову відповідає',
        titelNl: 'De server antwoordt weer',
        berichtUk: 'Дані оновлюються. Якщо щось не збереглося під час перерви — повторіть ту дію.',
        berichtNl: 'Gegevens worden bijgewerkt. Is er tijdens de onderbreking iets niet bewaard, herhaal dan die actie.',
        contextLabel: hostDienst(),
      });
      return () => verwijderPaginaSignaal('band:verbinding');
    }
    if (!feiten) return;
    const ukUitleg = legUit('uk', feiten);
    const nlUitleg = legUit('nl', feiten);
    const diagnoseTekst = detailsTekst(taal, feiten, ukUitleg);
    const dienst = hostDienst();
    const geldigSubdomein = (['hub', 'id', 'ai', 'mail', 'cloud', 'github', 'huis', 'mcp', 'api', 'admin', 'systeem'] as const)
      .includes(dienst as 'hub')
      ? (dienst as 'hub' | 'id' | 'ai' | 'mail' | 'cloud' | 'github' | 'huis' | 'mcp' | 'api' | 'admin' | 'systeem')
      : 'systeem';

    publiceerPaginaSignaal({
      id: 'band:verbinding',
      bron: 'verbinding-band',
      kanaal: 'pagina',
      subdomein: geldigSubdomein,
      soort: phase === 'offline' ? 'netwerk_offline' : 'server_storing',
      ernst: 'kritiek',
      titelUk: ukUitleg.titel,
      titelNl: nlUitleg.titel,
      berichtUk: `${ukUitleg.waarom} ${ukUitleg.doen}`.trim(),
      berichtNl: `${nlUitleg.waarom} ${nlUitleg.doen}`.trim(),
      uitlegUk: ukUitleg.details.join('\n'),
      uitlegNl: nlUitleg.details.join('\n'),
      contextLabel: `${ukUitleg.codeLabel} · ${ukUitleg.dienstLabel}`,
      link: journaalUrl(),
      bijlagen: [
        {
          id: 'verbinding-diagnose',
          naam: 'verbinding-diagnose.txt',
          mime: 'text/plain',
          grootteBytes: diagnoseTekst.length,
          tekstVoorbeeld: diagnoseTekst,
        },
      ],
      acties: [
        {
          id: 'herprobeer',
          labelUk: 'Повторити перевірку',
          labelNl: 'Opnieuw proberen',
          primair: true,
          uitvoer: nuProberen,
        },
        {
          id: 'kopieer-diagnose',
          labelUk: 'Копіювати подробиці',
          labelNl: 'Details kopiëren',
          uitvoer: kopieer,
        },
        {
          id: 'open-journaal',
          labelUk: 'Відкрити журнал',
          labelNl: 'Logboek openen',
          href: journaalUrl(),
        },
      ],
    });
    return () => verwijderPaginaSignaal('band:verbinding');
  }, [phase, feiten, taal, nuProberen, kopieer]);

  if (phase === 'online') return null;

  if (phase === 'restored') {
    const hersteldDuur = laatstHersteld ? duurTekst(lang, laatstHersteld.duurMs) : null;
    const hersteldPogingen = laatstHersteld ? Math.max(1, laatstHersteld.pogingen.length) : 0;
    return (
      <div
        className='canonical-connection-banner vp-kaart'
        data-connection='restored'
        role='status'
        aria-live='polite'
        aria-atomic='true'
        aria-label={t('Стан мережі', 'Netwerkstatus')}
      >
        <div className='vp-kop'>
          <span className='vp-medaillon' aria-hidden='true'>
            <Wifi aria-hidden='true' />
          </span>
          <div className='vp-kop-inhoud'>
            <div className='vp-herkomst'>
              <span className='vp-staat-pil'>{t('ВІДНОВЛЕНО', 'HERSTELD')}</span>
              {bewijsVlagAan ? (
                <span className='vp-bewijs-pil'>
                  <History aria-hidden='true' />
                  {t('Збережено в історії', 'Bewaard in historie')}
                </span>
              ) : null}
            </div>
            <strong>{t('Сервер знову відповідає', 'De server antwoordt weer')}</strong>
            <small className='vp-waarom'>
              {bewijsVlagAan && hersteldDuur
                ? t(
                    `Перерва тривала ${hersteldDuur} (зафіксовано спроб: ${hersteldPogingen}). Доказ збережено в історії сповіщень; якщо дія не збереглася — повторіть її.`,
                    `De onderbreking duurde ${hersteldDuur} (vastgelegde pogingen: ${hersteldPogingen}). Het bewijs staat in de meldingsgeschiedenis; herhaal zo nodig uw laatste actie.`,
                  )
                : t(
                    'Дані оновлюються. Якщо щось не збереглося під час перерви — повторіть ту дію.',
                    'Gegevens worden bijgewerkt. Is er tijdens de onderbreking iets niet bewaard, herhaal dan die actie.',
                  )}
            </small>
          </div>
        </div>
        {bewijsVlagAan ? (
          <div className='vp-acties vp-acties-hersteld'>
            <button type='button' className='vp-knop vp-hoofd' onClick={openMeldingenHistorie}>
              <Bell aria-hidden='true' />
              {t('Переглянути в історії', 'In meldingen bekijken')}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!uitleg || !feiten) return null;
  const offline = phase === 'offline';
  const pogingAantal = Math.max(feiten.poging || 1, actiefIncident?.pogingen.length || 1);
  const lopendeDuur = actiefIncident ? duurTekst(lang, Math.max(0, (feiten.tijd || Date.now()) - actiefIncident.eersteTijd)) : null;

  if (ingeklapt && bewijsVlagAan) {
    return (
      <div
        className='canonical-connection-banner vp-kaart is-ingeklapt'
        data-connection={phase}
        data-fout-code={uitleg.codeLabel}
        data-fout-zeker={uitleg.zeker ? '1' : '0'}
        role='status'
        aria-live='polite'
        aria-atomic='true'
        aria-label={t('Стан мережі', 'Netwerkstatus')}
      >
        <span className='vp-medaillon vp-medaillon-klein' aria-hidden='true'>
          {offline ? <WifiOff aria-hidden='true' /> : <ServerCrash aria-hidden='true' />}
        </span>
        <div className='vp-pil-inhoud'>
          <code className='vp-code-pil'>{uitleg.codeLabel}</code>
          <span className='vp-pil-dienst'>{uitleg.dienstLabel}</span>
          <span className='vp-pil-poging'>{uitleg.pogingLabel}</span>
        </div>
        <div className='vp-pil-knoppen'>
          <button type='button' className='vp-knop vp-hoofd vp-pil-herhaal' onClick={() => { void nuProberen(); }} disabled={bezig}>
            <RefreshCw aria-hidden='true' className={bezig ? 'vp-draai' : undefined} />
            {bezig ? t('Пробуємо…', 'Bezig…') : t('Повторити', 'Opnieuw')}
          </button>
          <button
            type='button'
            className='vp-klap-knop'
            onClick={() => setIngeklapt(false)}
            aria-label={t('Розгорнути вікно стану зв’язку', 'Verbindingsvenster uitklappen')}
            title={t('Розгорнути вікно стану зв’язку', 'Verbindingsvenster uitklappen')}
          >
            <Maximize2 aria-hidden='true' />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className='canonical-connection-banner vp-kaart'
      data-connection={phase}
      data-fout-code={uitleg.codeLabel}
      data-fout-zeker={uitleg.zeker ? '1' : '0'}
      role='status'
      aria-live='polite'
      aria-atomic='true'
      aria-label={t('Стан мережі', 'Netwerkstatus')}
    >
      <div className='vp-kop'>
        <span className='vp-medaillon' aria-hidden='true'>
          {offline ? <WifiOff aria-hidden='true' /> : <ServerCrash aria-hidden='true' />}
        </span>
        <div className='vp-kop-inhoud'>
          <div className='vp-herkomst'>
            <span className='vp-staat-pil'>
              {offline ? t('БЕЗ МЕРЕЖІ', 'GEEN NETWERK') : t('ПЕРЕРВА ЗВ’ЯЗКУ', 'VERBINDINGSONDERBREKING')}
            </span>
            <span className='vp-dienst-pil'>{huidigeDienst}</span>
            {bewijsVlagAan ? (
              <span className='vp-bewijs-pil'>
                <History aria-hidden='true' />
                {t(`Записано в історію · спроба\u00A0${pogingAantal}`, `Vastgelegd in historie · poging\u00A0${pogingAantal}`)}
              </span>
            ) : null}
          </div>
          <strong>{uitleg.titel}</strong>
        </div>
        {bewijsVlagAan ? (
          <button
            type='button'
            className='vp-klap-knop'
            onClick={() => setIngeklapt(true)}
            aria-label={t('Згорнути в компактну смугу', 'Inklappen tot compacte balk')}
            title={t('Згорнути в компактну смугу', 'Inklappen tot compacte balk')}
          >
            <Minimize2 aria-hidden='true' />
          </button>
        ) : null}
      </div>

      <div className='vp-tekst-blok'>
        <small className='vp-waarom'>{uitleg.waarom}</small>
        <small className='vp-doen'>{uitleg.doen}</small>
      </div>

      <span className='vp-meta'>
        <code className='vp-code-kern'>{uitleg.codeLabel}</code>
        <code>{uitleg.dienstLabel}</code>
        <code>{uitleg.tijdLabel}</code>
        <code>{uitleg.pogingLabel}</code>
      </span>

      <span className='vp-acties'>
        <button type='button' className='vp-knop vp-hoofd' onClick={() => { void nuProberen(); }} disabled={bezig}>
          <RefreshCw aria-hidden='true' className={bezig ? 'vp-draai' : undefined} />
          {bezig ? t('Пробуємо…', 'Bezig…') : t('Повторити', 'Opnieuw')}
        </button>
        {bewijsVlagAan ? (
          <button type='button' className='vp-knop vp-historie' onClick={openMeldingenHistorie}>
            <Bell aria-hidden='true' />
            {t('В історії', 'In meldingen')}
          </button>
        ) : null}
        <a className='vp-knop' href={journaalUrl()} target='_blank' rel='noreferrer'>
          <ExternalLink aria-hidden='true' />
          {t('Відкрити журнал', 'Logboek openen')}
        </a>
        <button type='button' className='vp-knop' aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronDown aria-hidden='true' data-open={open ? '1' : '0'} />
          {t('Деталі', 'Details')}
        </button>
      </span>

      {open ? (
        <span className='vp-details'>
          {bewijsVlagAan && actiefIncident ? (
            <div className='vp-chronologie'>
              <div className='vp-chronologie-kop'>
                <span>
                  {t('Початок', 'Begin')}: <b>{klokTijd(taal, actiefIncident.eersteTijd, feiten.zone)}</b>
                  {lopendeDuur ? <> · {t('триває', 'duur')}: <b>{lopendeDuur}</b></> : null}
                </span>
                <span className='vp-chronologie-teller'>
                  {t(`Спроб: ${actiefIncident.pogingen.length}`, `Pogingen: ${actiefIncident.pogingen.length}`)}
                </span>
              </div>
              <ol className='vp-pogingen-lijst'>
                {actiefIncident.pogingen.map((p) => (
                  <li key={`${p.nr}-${p.tijd}`}>
                    <span className='vp-poging-nr'>#{p.nr}</span>
                    <span className='vp-poging-tijd'>{klokTijd(taal, p.tijd, feiten.zone)}</span>
                    {p.route ? <span className='vp-poging-route'>{p.route}</span> : null}
                    <code className='vp-poging-code'>{codeLabel({ code: p.code, status: p.status })}</code>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <button type='button' className='vp-knop vp-kopieer' onClick={() => { void kopieer(); }}>
            {gekopieerd ? <ClipboardCheck aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}
            {gekopieerd ? t('Скопійовано пакет доказів', 'Bewijspakket gekopieerd') : t('Копіювати всі подробиці та хронологію', 'Alle details en tijdlijn kopiëren')}
          </button>
          <pre>{uitleg.details.join('\n')}</pre>
        </span>
      ) : null}
    </div>
  );
}
