// IDENTITY-002 · оболонка одного екрана: меню-зміст, 12 секцій, scroll-spy.
// Секції наповнює наявний код сторінок identity — тут лише розкладка й перехід до розділу.
import { useEffect, useState, type ReactNode } from 'react';
import './identiteit-account.css';
import { IDENTITY_TABS } from './identiteit-tabs';

export type IdentitySectie = { id: string; titel: string; inhoud: ReactNode };

type Props = {
  lang: 'uk' | 'nl';
  /** Поточна сторінка з адреси (`p.tab`); після завантаження прокручуємо до неї. */
  actief: string;
  /** Заголовок сторінки, який уже є в застосунку (не дублюємо тексти). */
  kop?: ReactNode;
  secties: readonly IdentitySectie[];
  /** Перехід до розділу: застосунок сам вирішує, чи це зміна адреси, чи лише прокрутка. */
  onKies: (id: string) => void;
};

const sectieId = (id: string) => `identity-sectie-${id}`;

export function IdentityAccountPagina({ lang, actief, kop, secties, onKies }: Props) {
  const [inBeeld, setInBeeld] = useState(actief);

  // Адреса змінилася (наприклад, клік у бічному меню або пряме посилання) — показуємо цей розділ.
  useEffect(() => {
    setInBeeld(actief);
    const doel = document.getElementById(sectieId(actief));
    if (doel && typeof doel.scrollIntoView === 'function') {
      doel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [actief]);

  // Scroll-spy: підсвічуємо розділ, який зараз найбільше видно. Без IntersectionObserver — тихо лишаємо як є.
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const waarnemer = new IntersectionObserver(
      (entries) => {
        const beste = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = beste?.target.getAttribute('data-sectie');
        if (id) setInBeeld(id);
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.2, 0.5, 0.8] },
    );
    for (const sectie of secties) {
      const el = document.getElementById(sectieId(sectie.id));
      if (el) waarnemer.observe(el);
    }
    return () => waarnemer.disconnect();
  }, [secties]);

  const kies = (id: string) => {
    setInBeeld(id);
    onKies(id);
    const doel = document.getElementById(sectieId(id));
    if (doel && typeof doel.scrollIntoView === 'function') {
      doel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  return (
    <div className='ia-account'>
      {kop}
      <nav className='ia-toc' aria-label={lang === 'uk' ? 'Розділи облікового запису' : 'Accountonderdelen'}>
        {IDENTITY_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type='button'
            className={inBeeld === tab.id ? 'ia-toc-knop actief' : 'ia-toc-knop'}
            aria-current={inBeeld === tab.id ? 'true' : undefined}
            onClick={() => kies(tab.id)}
          >
            <span className='ia-toc-nummer' aria-hidden='true'>{index + 1}</span>
            <span className='ia-toc-tekst'>{tab[lang]}</span>
          </button>
        ))}
      </nav>
      <div className='ia-secties'>
        {secties.map((sectie) => (
          <section
            key={sectie.id}
            id={sectieId(sectie.id)}
            data-sectie={sectie.id}
            className='ia-sectie'
            aria-labelledby={`${sectieId(sectie.id)}-kop`}
          >
            <h2 id={`${sectieId(sectie.id)}-kop`}>{sectie.titel}</h2>
            <div className='ia-inhoud'>{sectie.inhoud}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
