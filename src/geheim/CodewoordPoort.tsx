import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import GeheimInvoer from './GeheimInvoer';
import { useCodewoordPoort, zetCodewoordPoort } from './codewoord-poort-brug';
import { poortAfmelden } from './poort-afmelden';
import './codewoord-poort.css';

/** Другий крок входу: Google уже пустив, кодове слово цієї сесії ще ні. */
export default function CodewoordPoort() {
  const open = useCodewoordPoort();
  const [woord, setWoord] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const titel = useId();
  const dialoog = useRef<HTMLDialogElement | null>(null);
  const lang = typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' as const : 'uk' as const;
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  useEffect(() => {
    const el = dialoog.current;
    if (!open || !el) return;
    if (!el.open) el.showModal();
    return () => { if (el.open) el.close(); };
  }, [open]);
  if (!open) return null;
  const lichaam = () => ({ service: 'hub', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
  const verstuur = async () => {
    setBezig(true); setFout('');
    try {
      await api.post('/api/owner/session/codewoord', { ...lichaam(), woord });
      zetCodewoordPoort(false);
      location.reload();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setFout(code === 'CODEWOORD_GEBLOKKEERD'
        ? t('Забагато спроб. Зачекайте 15 хвилин.', 'Te veel pogingen. Wacht 15 minuten.')
        : t('Кодове слово не збігається.', 'Het codewoord klopt niet.'));
      setBezig(false);
    }
  };
  const uit = async () => {
    setBezig(true); setFout('');
    // SEC-002 (aanmelden-07): вихід облікового запису з усього браузера, а не лише цієї вкладки — інакше cookie сесії лишається
    // чинною до 30 діб і будь-яка нова вкладка знову стоїть перед цим вікном із тим самим обліковим записом.
    const uitkomst = await poortAfmelden((url, data) => api.post(url, data), lichaam());
    if (uitkomst === 'mislukt') {
      setFout(t('Вийти не вдалося: сесія в цьому браузері ще чинна. Спробуйте ще раз.', 'Afmelden is niet gelukt: de sessie in deze browser is nog geldig. Probeer het opnieuw.'));
      setBezig(false);
      return;
    }
    zetCodewoordPoort(false);
    location.reload();
  };
  return (
    <dialog ref={dialoog} className='codewoord-poort' aria-labelledby={titel} onCancel={(e) => e.preventDefault()}>
      <form onSubmit={(e) => { e.preventDefault(); if (!bezig) void verstuur(); }}>
        <h2 id={titel}>{t('Кодове слово', 'Codewoord')}</h2>
        <p>{t('Google-вхід уже є. Ця сесія відкриється після кодового слова.', 'Google-aanmelding is gelukt. Deze sessie opent na het codewoord.')}</p>
        <GeheimInvoer lang={lang} value={woord} onChange={setWoord} autoFocus autoComplete='off' />
        {fout ? <p role='alert'>{fout}</p> : null}
        <div className='codewoord-poort-knoppen'>
          <button type='submit' disabled={bezig || !woord.trim()}>{t('Продовжити', 'Doorgaan')}</button>
          <button type='button' disabled={bezig} onClick={() => void uit()}>{t('Вийти', 'Afmelden')}</button>
        </div>
      </form>
    </dialog>
  );
}
