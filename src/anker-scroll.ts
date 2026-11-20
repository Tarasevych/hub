// MELDLINK-001: прокрутка до якоря з адреси для блоків, що з'являються пізніше за завантаження сторінки (ліниві частини адмінки).
// Браузер шукає #якір лише один раз — до того, як React намалював блок; тому посилання зі сповіщення (наприклад, admin.*/sso#telegram-beheer)
// раніше відкривало сторінку, але не показувало потрібний блок. Scrollt naar het anker uit de adresbalk zodra het blok er is.
import { useEffect } from 'react';

export function useAnkerScroll(id: string, gereed = true): void {
  useEffect(() => {
    if (!gereed || typeof window === 'undefined') return;
    let timer = 0;
    const ga = () => {
      if (window.location.hash !== `#${id}`) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
    };
    ga();
    window.addEventListener('hashchange', ga);
    return () => { window.clearTimeout(timer); window.removeEventListener('hashchange', ga); };
  }, [id, gereed]);
}
