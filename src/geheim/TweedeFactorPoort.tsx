// IDENTITEIT-015 (етап 1.4): вікно воріт «другий чинник обов'язковий». Власник сайту ввімкнув правило (Способи входу →
// «Двофакторна автентифікація» → «Обов'язковий другий крок під час входу»), а в цієї людини є код із застосунку або ключ доступу.
// Google уже пустив, але сеанс не стає повним, доки на цьому вході не підтверджено другий чинник. Підтвердження — звичне вікно
// «Підтвердіть доступ» лише зі способами, що рахуються (ключ доступу, код із застосунку, код відновлення як запасний шлях);
// Google і кодове слово тут не рахуються. «Вийти» завершує вхід цього облікового запису в усьому браузері (як вікно кодового слова).
// Venster van de poort «tweede factor verplicht»: na Google eerst passkey, app-code of (reserve) herstelcode.
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';
import { ecosystemTabContext } from '../tab-context';
import { useTweedeFactorPoort, zetTweedeFactorPoort } from './tweede-factor-poort-brug';
import { poortAfmelden } from './poort-afmelden';
import './codewoord-poort.css';

/** Псевдоадреса для опису у вікні «Підтвердіть доступ» (shared/stap-op-beschrijving.ts): «Що ви підтверджуєте: вхід…». */
export const TWEEDE_FACTOR_PAD = '/api/owner/access/tweede-factor';

const dienstVanPagina = (): string => {
  try { return window.__TSV_CANONICAL_SERVICE__?.serviceForHostname(location.hostname) || 'hub'; } catch { return 'hub'; }
};

export default function TweedeFactorPoort() {
  const open = useTweedeFactorPoort();
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
  const lichaam = () => ({ service: dienstVanPagina(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
  const bevestig = async () => {
    setBezig(true); setFout('');
    // Модальне вікно лежить у верхньому шарі й перекрило б «Підтвердіть доступ»: на час підтвердження ховаємо його.
    const el = dialoog.current;
    if (el?.open) el.close();
    const terug = () => { if (el && !el.open) el.showModal(); };
    try {
      const b = lichaam();
      const uit = await bevestigToegang({ service: b.service, tabContext: b.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey', 'totp', 'herstelcode'], sterk: true, pad: TWEEDE_FACTOR_PAD, actie: 'tweede-factor', onthoudAanbieden: false });
      if (uit.ok) { zetTweedeFactorPoort(false); location.reload(); return; }
      terug();
      setFout(t('Вхід ще не підтверджено. Скористайтеся кодом із застосунку, ключем доступу або кодом відновлення.', 'De aanmelding is nog niet bevestigd. Gebruik een app-code, een passkey of een herstelcode.'));
    } catch {
      terug();
      setFout(t('Вікно підтвердження не відкрилося. Оновіть сторінку й спробуйте ще раз.', 'Het bevestigingsvenster opende niet. Vernieuw de pagina en probeer het opnieuw.'));
    }
    setBezig(false);
  };
  const uit = async () => {
    setBezig(true); setFout('');
    const uitkomst = await poortAfmelden((url, data) => api.post(url, data), lichaam());
    if (uitkomst === 'mislukt') {
      setFout(t('Вийти не вдалося: сесія в цьому браузері ще чинна. Спробуйте ще раз.', 'Afmelden is niet gelukt: de sessie in deze browser is nog geldig. Probeer het opnieuw.'));
      setBezig(false);
      return;
    }
    zetTweedeFactorPoort(false);
    location.reload();
  };
  return (
    <dialog ref={dialoog} className='codewoord-poort' data-tweede-factor-poort aria-labelledby={titel} onCancel={(e) => e.preventDefault()}>
      <form onSubmit={(e) => { e.preventDefault(); if (!bezig) void bevestig(); }}>
        <h2 id={titel}>{t('Другий крок входу', 'Tweede aanmeldstap')}</h2>
        {/* IDENTITEIT-015 (herstel): ворота закриваються після будь-якого входу без другого чинника (Google, Microsoft, Discord, Apple, пароль без коду) — текст не називає Google */}
        <p>{t('Перший крок входу виконано. Правило цього сайту вимагає ще другий чинник: код із застосунку-автентифікатора або ключ доступу. Якщо їх немає під рукою — підійде невикористаний код відновлення (після цього він перестане діяти).', 'De eerste aanmeldstap is gelukt. De regel van deze site vraagt nog een tweede factor: een code uit de authenticator-app of een passkey. Hebt u die niet bij de hand, dan werkt een ongebruikte herstelcode (die vervalt daarna).')}</p>
        <p>{t('До підтвердження сайт не показує ваших даних.', 'Tot de bevestiging toont de site geen gegevens van u.')}</p>
        {fout ? <p role='alert'>{fout}</p> : null}
        <div className='codewoord-poort-knoppen'>
          <button type='submit' disabled={bezig} autoFocus>{t('Підтвердити вхід', 'Aanmelding bevestigen')}</button>
          <button type='button' disabled={bezig} onClick={() => void uit()}>{t('Вийти', 'Afmelden')}</button>
        </div>
      </form>
    </dialog>
  );
}
