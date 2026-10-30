// Strook «Сайт оновлено до <версія> — Оновити сторінку» (src/platform/nieuwe-versie.ts). Eigen React-root (main.tsx).
// Nooit blokkerend; «Пізніше» verbergt tot de volgende versie; vanzelf herladen alleen als het tabblad verborgen is en er niets
// onopgeslagen is. Bij een nieuwe versie vraagt de site de service worker ook om bij te werken (die is network-first voor HTML).
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { routeLang } from '../canoniek-navigatie';
import { INTERVAL_MS, LATER_SLEUTEL, MIN_TUSSEN_MS, STORING_POLL_MS, beslis, heeftOnopgeslagen, isServerStoring, meldServerAntwoord } from './nieuwe-versie';
import './nieuwe-versie.css';

declare const __MR_BOUW_VERSIE__: string;
const ingebouwd = typeof __MR_BOUW_VERSIE__ === 'string' ? __MR_BOUW_VERSIE__ : '';
const leesLater = () => { try { return sessionStorage.getItem(LATER_SLEUTEL) || ''; } catch { return ''; } };
const zetLater = (v: string) => { try { sessionStorage.setItem(LATER_SLEUTEL, v); } catch { /* privévenster */ } };

export default function NieuweVersieBand() {
  const uk = routeLang() !== 'nl';
  const t = (a: string, b: string) => (uk ? a : b);
  const [server, setServer] = useState('');
  const [later, setLater] = useState(leesLater);
  const laatste = useRef(0), swGevraagd = useRef('');

  useEffect(() => {
    if (!ingebouwd) return;
    let stop = false;
    const controleer = async (forceer = false) => {
      const nu = Date.now();
      if (!forceer && nu - laatste.current < MIN_TUSSEN_MS) return;
      laatste.current = nu;
      try {
        const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
        meldServerAntwoord(r.status, { route: 'GET /api/version' }); // punt 3: de plakkaat moet de route kunnen noemen
        if (!r.ok) { if (isServerStoring(r.status) && !stop) window.setTimeout(() => { void controleer(true); }, STORING_POLL_MS); return; } // G4: snel opnieuw tot de server terug is
        const v = String(((await r.json()) as { versie?: unknown }).versie || '');
        if (stop || !v) return;
        setServer(v);
        const besluit = beslis({ ingebouwd, server: v, zichtbaar: document.visibilityState === 'visible', onopgeslagen: heeftOnopgeslagen(document), uitgesteld: leesLater() });
        if (besluit !== 'niets' && swGevraagd.current !== v) {
          swGevraagd.current = v;
          void navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.update()).catch(() => undefined);
        }
        if (besluit === 'herlaad') location.reload();
      } catch { /* offline of server herstart: volgende keer */ }
    };
    const zicht = () => { void controleer(document.visibilityState === 'hidden'); };
    document.addEventListener('visibilitychange', zicht);
    const i = window.setInterval(() => { if (document.visibilityState === 'visible') void controleer(); }, INTERVAL_MS);
    void controleer(true);
    return () => { stop = true; document.removeEventListener('visibilitychange', zicht); window.clearInterval(i); };
  }, []);

  if (beslis({ ingebouwd, server, zichtbaar: true, onopgeslagen: true, uitgesteld: later }) !== 'toon') return null;
  return <div className='nv-band' role='status' data-nieuwe-versie={server}>
    <RefreshCw aria-hidden='true' className='nv-icoon' />
    <div className='nv-tekst'>
      <strong>{t(`Сайт оновлено до ${server}`, `De site is bijgewerkt naar ${server}`)}</strong>
      <span>{t(`Ця вкладка ще працює на ${ingebouwd}. Оновіть сторінку, щоб отримати виправлення.`, `Dit tabblad draait nog ${ingebouwd}. Vernieuw de pagina voor de verbeteringen.`)}</span>
    </div>
    <button type='button' className='nv-hoofd' onClick={() => location.reload()}>{t('Оновити сторінку', 'Pagina vernieuwen')}</button>
    <button type='button' className='nv-later' aria-label={t('Пізніше', 'Later')} title={t('Пізніше (до наступної версії)', 'Later (tot de volgende versie)')} onClick={() => { zetLater(server); setLater(server); }}><X aria-hidden='true' /></button>
  </div>;
}
