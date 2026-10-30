// Plakkaat «verbinding» — punt 3 van de audit 19.10.2026.
//
// Wat er stond: «Сервер тимчасово недоступний — Імовірно, встановлюється оновлення (зазвичай до пів хвилини). Сторінка спробує
// з'єднатися ще раз сама.» Twee van de drie zinnen waren een GOK: de site wist niet dat er een update liep, en zei het toch.
// Wat er nu staat: de operatie, de dienst, de code (HTTP 502 …), het tijdstip van de laatste poging en het nummer van die poging —
// plus «Деталі» met het rauwe antwoord en één knop die alles naar het klembord zet voor ondersteuning.
// Over een installatie praat de plakkaat alleen met een gemeten feit (src/platform/uitrol-feit.ts); anders staat er dat de site
// het niet weet. Alle teksten komen uit shared/foutuitleg.ts; hier staat geen tweede set formuleringen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, ClipboardCopy, ChevronDown, ExternalLink, RefreshCw, ServerCrash, Wifi, WifiOff } from 'lucide-react';
import { detailsTekst, dienstVanHostnaam, kiesTaal, legUit, type Feiten, type Lang, type UitrolFeit } from '../shared/foutuitleg';
import { meldServerAntwoord, opServerStoring, opStoringFeiten, serverStoring, serverStoringFeiten, type StoringFeiten } from './platform/nieuwe-versie';
import { uitrolFeit } from './platform/uitrol-feit';
import './platform/verbinding-plakkaat.css';

type Phase = 'online' | 'offline' | 'restored' | 'server';

const RESTORED_MS = 8000;
/** De operatie in mensentaal; hetzelfde voor elke mislukte API-aanroep van de pagina. */
const OPERATIE: readonly [string, string] = ['Звʼязок сторінки з сервером', 'Verbinding van de pagina met de server'];
const OPERATIE_OFFLINE: readonly [string, string] = ['Зʼєднання з мережею', 'Verbinding met het netwerk'];

const readOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const hostDienst = () => (typeof location === 'undefined' ? 'hub' : dienstVanHostnaam(location.hostname));
/** Journaal van de uitrol staat op admin.<eigen domein> (BYOS: elk eigen domein), tabblad «/updates». */
const journaalUrl = () => {
  if (typeof location === 'undefined') return '/updates';
  const delen = location.hostname.split('.');
  return delen.length >= 3 ? `${location.protocol}//admin.${delen.slice(1).join('.')}/updates` : '/updates';
};

export default function CanonicalConnectionBanner({ lang }: { lang: 'uk' | 'nl' }) {
  const taal: Lang = lang === 'nl' ? 'nl' : 'uk';
  const t = (uk: string, nl: string) => kiesTaal(taal, uk, nl);
  const [phase, setPhase] = useState<Phase>(() => (readOffline() ? 'offline' : 'online'));
  const [storingFeiten, setStoringFeiten] = useState<StoringFeiten | null>(() => serverStoringFeiten());
  const [offlineSinds, setOfflineSinds] = useState(0);
  const [offlinePoging, setOfflinePoging] = useState(0);
  const [uitrol, setUitrol] = useState<UitrolFeit | null>(null);
  const [open, setOpen] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const wasOffline = useRef(phase === 'offline');
  const restoreTimer = useRef<number | undefined>(undefined);

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
    setPhase('restored');
    restoreTimer.current = window.setTimeout(() => setPhase('online'), RESTORED_MS);
  }, [clearRestoreTimer]);

  // G4 + punt 3: 502/503/504/520–530 van de API of de versie-poll → plakkaat MET de feiten; weg bij de volgende geslaagde respons.
  useEffect(() => {
    const zet = (storing: boolean, feiten: StoringFeiten | null) => {
      if (readOffline()) return;
      clearRestoreTimer();
      if (storing) { wasOffline.current = true; setStoringFeiten(feiten); setPhase('server'); return; }
      setStoringFeiten(null);
      setUitrol(null);
      if (!wasOffline.current) return;
      wasOffline.current = false;
      setPhase('restored');
      restoreTimer.current = window.setTimeout(() => setPhase('online'), RESTORED_MS);
    };
    if (serverStoring()) zet(true, serverStoringFeiten());
    const losFeiten = opStoringFeiten((f) => { if (f) setStoringFeiten(f); }); // nieuw tijdstip en pogingnummer bij elke poging
    const los = opServerStoring(zet);
    return () => { losFeiten(); los(); };
  }, [clearRestoreTimer]);

  // Punt 4: pas als er een storing IS, één keer de echte uitrolstand ophalen. Lukt dat niet, dan blijft `uitrol` null en zegt de
  // plakkaat eerlijk dat de site niet weet of er een installatie loopt.
  useEffect(() => {
    if (phase !== 'server') return;
    let stop = false;
    void uitrolFeit().then((f) => { if (!stop) setUitrol(f); }).catch(() => undefined);
    return () => { stop = true; };
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
    if (phase === 'server') return {
      operatie: OPERATIE, dienst: storingFeiten?.dienst || hostDienst(), route: storingFeiten?.route || '',
      code: storingFeiten?.code || '', status: storingFeiten?.status || 0, tijd: storingFeiten?.tijd || 0,
      poging: storingFeiten?.poging || 0, lichaam: storingFeiten?.lichaam || '', uitrol,
    };
    if (phase === 'offline') return {
      operatie: OPERATIE_OFFLINE, dienst: hostDienst(), route: '', code: 'BROWSER_OFFLINE', status: 0,
      tijd: offlineSinds, poging: offlinePoging, lichaam: '', uitrol: null,
    };
    return null;
  }, [phase, storingFeiten, uitrol, offlineSinds, offlinePoging]);

  const uitleg = useMemo(() => (feiten ? legUit(taal, feiten) : null), [feiten, taal]);

  // «Повторити»: één echte poging naar /api/version. Slaagt die, dan haalt meldServerAntwoord de plakkaat weg; mislukt die,
  // dan staat er een nieuw tijdstip en een nieuw pogingnummer — nooit een stille knop.
  const nuProberen = useCallback(async () => {
    setBezig(true);
    try {
      const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
      let lichaam = '';
      try { lichaam = r.ok ? '' : (await r.text()).slice(0, 2000); } catch { /* geen lichaam */ }
      meldServerAntwoord(r.status, { route: 'GET /api/version', code: `HTTP_${r.status}`, lichaam });
      if (r.ok && readOffline() === false) goOnline();
    } catch {
      meldServerAntwoord(0, { route: 'GET /api/version', code: 'NETWORK_ERROR' });
    } finally { setBezig(false); }
  }, [goOnline]);

  const kopieer = useCallback(async () => {
    if (!feiten || !uitleg) return;
    const tekst = detailsTekst(taal, feiten, uitleg);
    try { await navigator.clipboard.writeText(tekst); setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 2500); }
    catch { setGekopieerd(false); } // geen klembordrecht: de regels staan al open op het scherm
  }, [feiten, uitleg, taal]);

  if (phase === 'online') return null;

  if (phase === 'restored') return (
    <div className='canonical-connection-banner' data-connection='restored' role='status' aria-live='polite' aria-atomic='true' aria-label={t('Стан мережі', 'Netwerkstatus')}>
      <Wifi aria-hidden='true' />
      <span>
        <strong>{t('Сервер знову відповідає', 'De server antwoordt weer')}</strong>
        <small>{t('Дані оновлюються. Якщо щось не збереглося під час перерви — повторіть ту дію.', 'Gegevens worden bijgewerkt. Is er tijdens de onderbreking iets niet bewaard, herhaal dan die actie.')}</small>
      </span>
    </div>
  );

  if (!uitleg || !feiten) return null;
  const offline = phase === 'offline';

  return (
    <div
      className='canonical-connection-banner'
      data-connection={phase}
      data-fout-code={uitleg.codeLabel}
      data-fout-zeker={uitleg.zeker ? '1' : '0'}
      role='status'
      aria-live='polite'
      aria-atomic='true'
      aria-label={t('Стан мережі', 'Netwerkstatus')}
    >
      {offline ? <WifiOff aria-hidden='true' /> : <ServerCrash aria-hidden='true' />}
      <span>
        <strong>{uitleg.titel}</strong>
        <small>{uitleg.waarom}</small>
        <small className='vp-doen'>{uitleg.doen}</small>
        <span className='vp-meta'>
          <code>{uitleg.codeLabel}</code>
          <code>{uitleg.dienstLabel}</code>
          <code>{uitleg.tijdLabel}</code>
          <code>{uitleg.pogingLabel}</code>
        </span>
        <span className='vp-acties'>
          <button type='button' className='vp-knop vp-hoofd' onClick={() => { void nuProberen(); }} disabled={bezig}>
            <RefreshCw aria-hidden='true' />{bezig ? t('Пробуємо…', 'Bezig…') : t('Повторити', 'Opnieuw')}
          </button>
          <a className='vp-knop' href={journaalUrl()} target='_blank' rel='noreferrer'>
            <ExternalLink aria-hidden='true' />{t('Відкрити журнал', 'Logboek openen')}
          </a>
          <button type='button' className='vp-knop' aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <ChevronDown aria-hidden='true' data-open={open ? '1' : '0'} />{t('Деталі', 'Details')}
          </button>
        </span>
        {open ? <span className='vp-details'>
          <button type='button' className='vp-knop vp-kopieer' onClick={() => { void kopieer(); }}>
            {gekopieerd ? <ClipboardCheck aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}
            {gekopieerd ? t('Скопійовано', 'Gekopieerd') : t('Копіювати всі подробиці', 'Alle details kopiëren')}
          </button>
          <pre>{uitleg.details.join('\n')}</pre>
        </span> : null}
      </span>
    </div>
  );
}
