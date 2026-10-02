import { useCallback, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

type Phase = 'online' | 'offline' | 'restored';

const RESTORED_MS = 4000;

const COPY = {
  uk: {
    offlineTitle: "Немає з'єднання",
    offlineHint: 'Показані дані можуть бути застарілими. Нові дії збережуться лише після відновлення мережі.',
    restoredTitle: "З'єднання відновлено",
    restoredHint: 'Дані оновлюються.',
    region: 'Стан мережі'
  },
  nl: {
    offlineTitle: 'Geen verbinding',
    offlineHint: 'Weergegeven gegevens kunnen verouderd zijn. Nieuwe acties worden pas bewaard als het netwerk terug is.',
    restoredTitle: 'Verbinding hersteld',
    restoredHint: 'Gegevens worden bijgewerkt.',
    region: 'Netwerkstatus'
  }
} as const;

const readOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export default function CanonicalConnectionBanner({ lang }: { lang: 'uk' | 'nl' }) {
  const [phase, setPhase] = useState<Phase>(() => (readOffline() ? 'offline' : 'online'));
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

  if (phase === 'online') return null;

  const copy = COPY[lang === 'nl' ? 'nl' : 'uk'];
  const offline = phase === 'offline';

  return (
    <div
      className='canonical-connection-banner'
      data-connection={phase}
      role='status'
      aria-live='polite'
      aria-atomic='true'
      aria-label={copy.region}
    >
      {offline ? <WifiOff aria-hidden='true' /> : <Wifi aria-hidden='true' />}
      <span>
        <strong>{offline ? copy.offlineTitle : copy.restoredTitle}</strong>
        <small>{offline ? copy.offlineHint : copy.restoredHint}</small>
      </span>
    </div>
  );
}
