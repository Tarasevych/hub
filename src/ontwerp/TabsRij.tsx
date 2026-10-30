// Rij tabbladen die op smalle schermen horizontaal scrolt, met vervaagde randen en pijltjes als hint dat er meer is
// (audit 18.10.2026, punt 8c). Meet zelf; geen afhankelijkheid van de inhoud.
// 21.10.2026: verhuisd van src/uitrol/ (technische map → alleen met technisch profiel geserveerd) naar het ontwerpfundament,
// omdat ook de openbare pagina mcp-agenten (`nav.ag-tabs`) deze rij nodig heeft. src/uitrol/TabsRij.tsx exporteert dit door.
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './tabs-rij.css';
import { minderBeweging } from '../platform/toegankelijk';

/**
 * Nieuwe horizontale scrollpositie van de rij zodat het actieve tabblad helemaal zichtbaar is (of null: niets doen).
 * Zuiver; alleen de RIJ scrolt, nooit de pagina. Vroeger stond hier `scrollIntoView({block:'nearest'})` in een effect zonder
 * afhankelijkheden: bij elke herrendering (de pagina vernieuwt elke paar seconden) trok de browser de hele pagina terug naar de
 * tabbladen — de gemelde «сайт стрибає і повертає сторінку до верху» (18.10.2026).
 */
export function tabInBeeld(rij: { scrollLeft: number; clientWidth: number }, tab: { offsetLeft: number; offsetWidth: number }, marge = 8): number | null {
  const links = tab.offsetLeft - marge, rechts = tab.offsetLeft + tab.offsetWidth + marge;
  if (links < rij.scrollLeft) return Math.max(0, links);
  if (rechts > rij.scrollLeft + rij.clientWidth) return Math.max(0, rechts - rij.clientWidth);
  return null;
}

/**
 * Mobiel 21.10.2026: herbruikbaar buiten de updatepagina (o.a. mcp-agenten, `nav.ag-tabs` was 1073 px in 307 px).
 * `navKlasse`/`wrapKlasse` laten de pagina haar eigen tabstijl houden; de rij is altijd een BEDOELDE scrollrij
 * (data-scroll-ok, standaard aan: pijlen + vervaagde rand geven aan dat er meer is — de pagina zelf schuift nooit zijwaarts).
 * De stijl van wrap/pijlen staat in ./tabs-rij.css (.ut-tabs-wrap, .ut-tabs-pijl) en wordt hier mee geladen.
 */
export default function TabsRij({ children, label, lang, navKlasse = 'ut-tabs', wrapKlasse = '', scrollOk = true, rol = 'tablist', volgActief = true }: { children: ReactNode; label: string; lang: 'uk' | 'nl'; navKlasse?: string; wrapKlasse?: string; scrollOk?: boolean; rol?: 'tablist' | 'group'; /** 21.10: false voor een knoppenbalk (aria-pressed = «vet aan», geen tabblad) — dan schuift de rij niet vanzelf. */ volgActief?: boolean }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const nav = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const w = wrap.current, n = nav.current;
    if (!w || !n) return;
    const meet = () => {
      const links = n.scrollLeft > 2, rechts = n.scrollLeft + n.clientWidth < n.scrollWidth - 2;
      if (links) w.dataset.meerLinks = '1'; else delete w.dataset.meerLinks;
      if (rechts) w.dataset.meerRechts = '1'; else delete w.dataset.meerRechts;
    };
    meet();
    n.addEventListener('scroll', meet, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(meet) : null;
    ro?.observe(n);
    window.addEventListener('resize', meet);
    return () => { n.removeEventListener('scroll', meet); ro?.disconnect(); window.removeEventListener('resize', meet); };
  }, []);
  // Actief tabblad in beeld houden: alleen als het actieve tabblad verandert, en alleen de rij horizontaal (nooit de pagina).
  const actiefId = useRef('');
  useEffect(() => {
    const n = nav.current; if (!n || !volgActief) return;
    const tab = n.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]'); if (!tab) return;
    const id = tab.id || tab.textContent || '';
    if (id === actiefId.current) return;
    actiefId.current = id;
    const doel = tabInBeeld(n, tab);
    if (doel !== null) n.scrollLeft = doel;
  });
  const schuif = (r: number) => nav.current?.scrollBy({ left: r * Math.max(120, (nav.current?.clientWidth || 300) * 0.6), behavior: minderBeweging() ? 'auto' : 'smooth' }); // prefers-reduced-motion: geen glijdende rij (WCAG 2.3.3)
  return <div className={wrapKlasse ? `ut-tabs-wrap ${wrapKlasse}` : 'ut-tabs-wrap'} ref={wrap}>
    <button type='button' className='ut-tabs-pijl is-links' tabIndex={-1} aria-label={lang === 'uk' ? 'Попередні розділи' : 'Vorige onderdelen'} onClick={() => schuif(-1)}><ChevronLeft aria-hidden='true' /></button>
    <nav className={navKlasse} role={rol} aria-label={label} ref={nav} data-scroll-ok={scrollOk ? '1' : undefined}>{children}</nav>
    <button type='button' className='ut-tabs-pijl is-rechts' tabIndex={-1} aria-label={lang === 'uk' ? 'Наступні розділи' : 'Volgende onderdelen'} onClick={() => schuif(1)}><ChevronRight aria-hidden='true' /></button>
  </div>;
}
