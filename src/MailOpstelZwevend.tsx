import { MailPlus } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerZone, queueRecompute, bindAvoidanceListeners } from './zwevend-ontwijking';
// PERF-001 (09.11.2026): het opstelvenster (ProseMirror, ~600 KB) lui geladen. Het blijft direct na de start gemonteerd (het herstelt
// zelf concepten en opent zichzelf via onOpen), maar zit niet meer in de startbundel van elk subdomein.
const MailNewMessageDialog = lazy(() => import('./MailNieuwBerichtDialoog'));
import { Plek } from './plaatsing/Plek';
import './toegankelijk.css'; // focusrand in twee tinten boven willekeurige inhoud
import './mail/mail-lezer-opstel-maquette.css';
import { useIsMaquette } from './thema/useThema';

type Props = {
  lang: 'uk' | 'nl';
  sourceOrigin: string;
  tabContext: string;
  ownerUserId: string;
  sessionReady: boolean;
};

export default function MailComposeFloat(p: Props) {
  const isMaquette = useIsMaquette();
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [accountId, setAccountId] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  // 25.10.2026: «Написати» staat in zijn GNIEZDO (standaard onderaan in de actiestapel rechtsonder, boven de lijst — shared/plaatsing.ts).
  // Geen positie meer vanaf de bel (fabPlaats), geen overgang op left/top, geen luisteren naar resize/visualViewport: de browser legt de
  // stapel uit, dus de knop staat stil bij scrollen, adresbalk en zoom, en ligt nooit over de bel. Het gniezdo bestaat al vóór de knop.
  const composeRef = useRef<HTMLButtonElement | null>(null);
  const composeRectGetter = useCallback(() => composeRef.current?.getBoundingClientRect() || null, []);

  const context = { service: 'mail', sourceOrigin: p.sourceOrigin, tabContext: p.tabContext };

  // Oude, gesleepte pixelpositie (vóór 21.10.2026) opruimen: die won vroeger van alles en hoorde bij een ander scherm.
  useEffect(() => { try { localStorage.removeItem('tsv:mail-compose-float-pos-v2'); } catch { /* geen opslag */ } }, []);

  // Load active account
  useEffect(() => {
    if (!p.sessionReady) return;
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import('./platform/client');
        const response = await api.post('/api/owner/mail/google-suite/accounts', context);
        if (!cancelled) {
          const id = String(response.data.activeAccountId || response.data.account?.id || response.data.accounts?.[0]?.id || '');
          setAccountId(id);
        }
      } catch {}
    })();
    const onAccount = () => {
      // re-fetch on account change
      (async () => {
        try {
          const { api } = await import('./platform/client');
          const response = await api.post('/api/owner/mail/google-suite/accounts', context);
          if (!cancelled) setAccountId(String(response.data.activeAccountId || response.data.account?.id || response.data.accounts?.[0]?.id || ''));
        } catch {}
      })();
    };
    window.addEventListener('tsv:mail-account-changed', onAccount);
    return () => { cancelled = true; window.removeEventListener('tsv:mail-account-changed', onAccount); };
  }, [p.sessionReady, p.sourceOrigin, p.tabContext]);

  // Listen for open-compose from sidebar pill
  useEffect(() => {
    const open = () => setComposeOpen(true);
    window.addEventListener('mail:open-compose', open);
    return () => window.removeEventListener('mail:open-compose', open);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    const unbindListeners = bindAvoidanceListeners();
    // De knop staat vast (priority ≥ 100 = nooit verplaatst door het register); de zone blijft zodat «flow»-zones (bv. de
    // onderbalk van een venster) er ruimte voor vrijhouden. De stapel zelf meldt zich ook (src/plaatsing/Plek.tsx).
    const unregisterButton = registerZone({ id: 'mail-compose-float', priority: 100, kind: 'float', getRect: composeRectGetter, fallbacks: [] });
    queueRecompute();
    return () => { unbindListeners(); unregisterButton(); };
  }, [accountId, composeRectGetter]);

  if (!p.sessionReady || !accountId) return null;

  return (
    <>
      <Plek knop='opstellen'>
        {(vorm) => (
          <button
            type="button"
            ref={composeRef}
            className='mail-compose-float'
            data-maquette={isMaquette ? 'ja' : undefined}
            data-mail-compose-float='1'
            data-vorm={vorm}
            disabled={!accountId}
            aria-label={t('Написати новий лист', 'Nieuw bericht schrijven')}
            title={t('Написати новий лист', 'Nieuw bericht schrijven')}
            onClick={() => setComposeOpen(true)}
          >
            <MailPlus aria-hidden='true' />
            {vorm === 'rij' && <span className='plaats-rij-label'>{t('Написати', 'Nieuw bericht')}</span>}
          </button>
        )}
      </Plek>
      {createPortal(
        <Suspense fallback={null}><MailNewMessageDialog
          lang={p.lang}
          open={composeOpen}
          accountId={accountId}
          context={context}
          onClose={() => setComposeOpen(false)}
          onOpen={() => setComposeOpen(true)}
          onSent={() => {}}
        /></Suspense>,
        // 21.10.2026: in <body>, naast de andere vensters — in .canonical-chrome (eigen stapelcontext) bleef de laag uit de
        // vensterstapel (zIndexVan) ingesloten en lag elk venster van de gezamenlijke laag erboven. Kleuren: tokens staan ook op <html>.
        document.body
      )}
    </>
  );
}
