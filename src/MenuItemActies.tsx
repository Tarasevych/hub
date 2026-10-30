// Menu v2 fase 2: actiemenu van één item in de bewerkmodus — het toetsenbordalternatief voor slepen (en handig op aanraken).
// Openen: klik/Enter/spatie op het item in de bewerkmodus. Pijltjes ↑/↓ (en Home/End) bewegen, Enter kiest, Esc/← terug of dicht;
// de focus gaat daarna terug naar het item. Twee niveaus: acties → doelen («Перемістити до…» / «Дублювати до…»).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, FolderInput, LayoutList, RotateCcw, Trash2 } from 'lucide-react';
import type { MenuPlaats } from '../shared/menu-model';

export type ActieDoel = { plaats: MenuPlaats; ouder: string | null; label: string };
type Props = {
  lang: 'uk' | 'nl';
  titel: string;
  anker: HTMLElement;
  kanOmhoog: boolean;
  kanOmlaag: boolean;
  horizontaal: boolean;
  isKopie: boolean;
  aangepast: boolean;
  verplaatsDoelen: ActieDoel[];
  kopieDoelen: ActieDoel[];
  sectieTonen?: () => void;
  onStap: (d: -1 | 1) => void;
  onVerplaats: (d: ActieDoel) => void;
  onKopie: (d: ActieDoel) => void;
  onKopieWeg: () => void;
  onTerugzetten: () => void;
  onSluit: () => void;
};
export default function MenuItemActies(p: Props) {
  const [niveau, setNiveau] = useState<'acties' | 'verplaats' | 'kopie'>('acties');
  const paneel = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const tr = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const sluit = (terugFocus = true) => { p.onSluit(); if (terugFocus) window.setTimeout(() => p.anker.focus(), 0); };
  useLayoutEffect(() => {
    const el = paneel.current; if (!el) return;
    const r = p.anker.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = r.right + 8, top = r.top;
    if (left + w > vw - 8) left = Math.max(8, r.left - w - 8);
    if (p.horizontaal) { left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8); top = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10; }
    top = Math.min(Math.max(8, top), vh - h - 8);
    setPos({ left, top });
  }, [niveau, p.anker, p.horizontaal]);
  useEffect(() => { paneel.current?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus(); }, [niveau]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (paneel.current && !paneel.current.contains(e.target as Node) && !p.anker.contains(e.target as Node)) sluit(false); };
    document.addEventListener('pointerdown', weg, true);
    return () => document.removeEventListener('pointerdown', weg, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toets = (e: RKeyboardEvent) => {
    const knoppen = Array.from(paneel.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') || []);
    const i = knoppen.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); knoppen[(i + (e.key === 'ArrowDown' ? 1 : -1) + knoppen.length) % knoppen.length]?.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); knoppen[e.key === 'Home' ? 0 : knoppen.length - 1]?.focus(); }
    else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && niveau !== 'acties')) { e.preventDefault(); e.stopPropagation(); if (niveau !== 'acties') setNiveau('acties'); else sluit(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  };
  const knop = (sleutel: string, label: string, icoon: ReactNode, doe: () => void, uit = false, sub = false) => (
    <button key={sleutel} type='button' role='menuitem' data-menu-actie={sleutel} disabled={uit} aria-haspopup={sub || undefined} onClick={doe}>
      {icoon}<span>{label}</span>{sub && <ChevronRight className='menu-acties-pijl' aria-hidden='true' />}
    </button>
  );
  const doelen = niveau === 'verplaats' ? p.verplaatsDoelen : p.kopieDoelen;
  return (
    <div ref={paneel} className='menu-acties' role='menu' aria-label={p.titel} style={{ left: pos.left, top: pos.top }} onKeyDown={toets} data-menu-acties={niveau}>
      <div className='menu-acties-kop' aria-hidden='true'>{p.titel}</div>
      {niveau === 'acties' ? <>
        {knop('omhoog', p.horizontaal ? tr('Лівіше', 'Naar links') : tr('Вище', 'Omhoog'), <ArrowUp aria-hidden='true' />, () => { p.onStap(-1); sluit(false); }, !p.kanOmhoog)}
        {knop('omlaag', p.horizontaal ? tr('Правіше', 'Naar rechts') : tr('Нижче', 'Omlaag'), <ArrowDown aria-hidden='true' />, () => { p.onStap(1); sluit(false); }, !p.kanOmlaag)}
        {knop('verplaats', tr('Перемістити до…', 'Verplaatsen naar…'), <FolderInput aria-hidden='true' />, () => setNiveau('verplaats'), p.verplaatsDoelen.length === 0, true)}
        {knop('kopie', tr('Дублювати до…', 'Dupliceren naar…'), <Copy aria-hidden='true' />, () => setNiveau('kopie'), p.kopieDoelen.length === 0, true)}
        {p.sectieTonen && knop('sectie', tr('Показати сторінки розділу', 'Pagina\'s van de sectie tonen'), <LayoutList aria-hidden='true' />, () => { p.sectieTonen?.(); sluit(false); })}
        {p.isKopie && knop('kopie-weg', tr('Видалити цю копію', 'Deze kopie verwijderen'), <Trash2 aria-hidden='true' />, () => { p.onKopieWeg(); sluit(false); })}
        {knop('terug', p.isKopie ? tr('Скинути оригінал (і всі копії)', 'Origineel terugzetten (en alle kopieën)') : tr('Скинути цей пункт', 'Dit item terugzetten'), <RotateCcw aria-hidden='true' />, () => { p.onTerugzetten(); sluit(false); }, !p.aangepast)}
      </> : <>
        {knop('terug-niveau', tr('Назад', 'Terug'), <ChevronLeft aria-hidden='true' />, () => setNiveau('acties'))}
        {doelen.map((d) => knop(`${d.plaats}|${d.ouder || ''}`, d.label, niveau === 'verplaats' ? <FolderInput aria-hidden='true' /> : <Copy aria-hidden='true' />, () => { (niveau === 'verplaats' ? p.onVerplaats : p.onKopie)(d); sluit(false); }))}
      </>}
    </div>
  );
}
