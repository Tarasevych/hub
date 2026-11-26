// SITE-001 (пункт 5): смуга згоди на реп'яшки (cookie) та необов'язкову аналітику.
// Показується, доки немає вибору; дві рівноцінні кнопки (без попередньо вибраної згоди), посилання на політику.
// nl: toestemmingsbalk voor cookies en optionele analyse; twee gelijkwaardige knoppen, geen vooraf aangevinkte toestemming.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { bandNodig, bewaarKeuze, HEROPEN_GEBEURTENIS, leesKeuze, meldKeuzeAanServer, sessieBekend, telBezoek, type Context } from './toestemming';
import './toestemming.css';

const TEKST = {
  uk: {
    titel: 'Реп’яшки (cookie) та аналітика',
    tekst: 'Ми використовуємо лише необхідні реп’яшки, без яких не працює вхід. Знеособлену аналітику відвідувань (без IP-адреси, пристрою й облікового запису) вмикаємо лише з вашої згоди.',
    meer: 'Політика конфіденційності',
    nodig: 'Лише необхідні',
    toestaan: 'Дозволити аналітику',
    regio: 'Згода на реп’яшки',
  },
  nl: {
    titel: 'Cookies en analyse',
    tekst: 'We gebruiken alleen noodzakelijke cookies waarzonder aanmelden niet werkt. Anonieme bezoekanalyse (zonder IP-adres, apparaat of account) zetten we alleen met uw toestemming aan.',
    meer: 'Privacybeleid',
    nodig: 'Alleen noodzakelijke',
    toestaan: 'Analyse toestaan',
    regio: 'Toestemming voor cookies',
  },
} as const;

const taal = (): 'uk' | 'nl' => (document.documentElement.lang === 'nl' ? 'nl' : 'uk');
const context = (): Context => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const post = (u: string, b: unknown) => api.post(u, b);

export default function ToestemmingBand() {
  const [open, setOpen] = useState(() => bandNodig(leesKeuze()));
  const [lang, setLang] = useState(taal);

  useEffect(() => {
    // Вибір, зроблений ще до входу (без сеансу), передаємо серверу один раз за сеанс вкладки; далі —
    // одна знеособлена подія відвідування (сервер рахує тільки схвалені облікові записи зі згодою).
    const keuze = leesKeuze();
    if (sessieBekend() && keuze) {
      let gemeld = false;
      try { gemeld = sessionStorage.getItem('mr-toestemming-gemeld') === String(keuze.tijd); } catch { /* немає сховища сеансу */ }
      const melden = gemeld ? Promise.resolve(true) : meldKeuzeAanServer(keuze, post, context()).then((ok) => {
        try { if (ok) sessionStorage.setItem('mr-toestemming-gemeld', String(keuze.tijd)); } catch { /* немає сховища сеансу */ }
        return ok;
      });
      void melden.then(() => telBezoek(sessieDienst(), post, context()));
    }
    const heropen = () => { setLang(taal()); setOpen(true); };
    window.addEventListener(HEROPEN_GEBEURTENIS, heropen);
    const waarnemer = new MutationObserver(() => setLang(taal()));
    waarnemer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => { window.removeEventListener(HEROPEN_GEBEURTENIS, heropen); waarnemer.disconnect(); };
  }, []);

  if (!open) return null;
  const t = TEKST[lang];
  const kies = (analyse: boolean) => {
    const keuze = bewaarKeuze(analyse);
    setOpen(false);
    if (sessieBekend()) {
      void meldKeuzeAanServer(keuze, post, context()).then(() => { if (analyse) void telBezoek(sessieDienst(), post, context()); });
    }
  };
  return (
    <section className="mr-toestemming" role="region" aria-label={t.regio} aria-live="polite" data-toestemming-band>
      <div className="mr-toestemming-tekst">
        <h2>{t.titel}</h2>
        <p>{t.tekst} <a href={lang === 'nl' ? '/privacy#nl' : '/privacy'}>{t.meer}</a></p>
      </div>
      <div className="mr-toestemming-knoppen">
        <button type="button" onClick={() => kies(false)} data-toestemming="nodig">{t.nodig}</button>
        <button type="button" onClick={() => kies(true)} data-toestemming="analyse">{t.toestaan}</button>
      </div>
    </section>
  );
}
