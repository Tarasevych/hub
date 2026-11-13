// Центр облікового запису «Студія» (завдання IDENTITEIT-006): новий вигляд дванадцяти розділів за прапорцем identiteit-account-atelier.
// Принцип: одна сцена — один розділ. Ліворуч (або в іншому вибраному місці) — навігатор, у центрі — справжні налаштування
// розділу без змін (ті самі обробники, форми й серверні перевірки прав). На телефоні навігатор стає компактною смугою з аркушем.
// Зміст, підписи та ілюстрації беруться без змін з atelier-v49-gegevens.json (12 розділів, 43 групи, 153 позиції).
// Accountcentrum «Studio»: één onderdeel tegelijk, met dezelfde echte handelingen. Inhoud en illustraties ongewijzigd uit versie 49.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, CircleHelp, ContactRound, CornerDownLeft, Globe, KeyRound, LayoutGrid, Menu, MonitorSmartphone, Palette, PanelBottom, PanelLeft, PanelRight, PanelTop, PencilRuler, Search, Settings2, ShieldCheck, Sparkles, UsersRound, X, type LucideIcon } from 'lucide-react';
import type { IdentiteitSectie } from './IdentiteitAccountPagina';
import { useZijbalkVoorkeuren } from '../zijbalk-voorkeuren';
import { AtelierInhoud } from './atelier-inhoud';
import bron from './atelier-v49-gegevens.json';
import './atelier-illustraties.css';
import { VormgevingKiezer } from './VormgevingKiezer';
import './identiteit-atelier.css';

type Taal = 'uk' | 'nl';
type Plaats = 'left' | 'right' | 'top' | 'bottom';
type Stijl = 'classic' | 'pills';
type Props = { lang: Taal; actief: string; inBeeld: string; secties: readonly IdentiteitSectie[]; onKies: (id: string) => void };
type BronSectie = (typeof bron.secties)[number];
type BronGroep = { id: string; uk: string; nl: string; поясненняUk: string; поясненняNl: string; стан: string; рядки: Array<{ uk: string; nl: string; тип?: string }> };

const vertaal = (taal: Taal, uk: string, nl: string) => taal === 'uk' ? uk : nl;
// У даних прототипу розділ «Ідентичності» має id identities, у застосунку — identity.
const werkelijk = (id: string) => id === 'identities' ? 'identity' : id;
const ontwerp = (id: string) => id === 'identity' ? 'identities' : id;

export const ATELIER_SYMBOLEN: Record<string, LucideIcon> = {
  personalization: Sparkles, menu: Menu, themes: Palette, languages: Globe,
  widgets: LayoutGrid, sharing: UsersRound, identities: ContactRound,
  account: Settings2, sessions: MonitorSmartphone, methods: KeyRound,
  security: ShieldCheck, recovery: CircleHelp,
};

/** Чотири змістові групи з погодженого опису (§3). */
export const ATELIER_GROEPEN = [
  { id: 'personal', ids: ['personalization', 'menu', 'themes', 'languages', 'widgets'], uk: 'Обличчя вашого простору', nl: 'De sfeer van jouw ruimte', ukKort: 'Вигляд і меню', nlKort: 'Uiterlijk en menu', bereik: '01 — 05' },
  { id: 'social', ids: ['sharing', 'identities'], uk: 'Люди та ідентичність', nl: 'Mensen en identiteit', ukKort: 'Доступ і ролі', nlKort: 'Toegang en rollen', bereik: '06 — 07' },
  { id: 'account', ids: ['account', 'sessions', 'methods'], uk: 'Ваш обліковий запис', nl: 'Jouw account', ukKort: 'Обліковий запис', nlKort: 'Account', bereik: '08 — 10' },
  { id: 'security', ids: ['security', 'recovery'], uk: 'Безпека та відновлення', nl: 'Beveiliging en herstel', ukKort: 'Захист', nlKort: 'Bescherming', bereik: '11 — 12' },
] as const;

const opslag = 'identiteit-atelier-v49-navigatie';
const groepenVan = (id: string) => (bron.groepen as Record<string, BronGroep[]>)[id] || [];
const STAN: Record<string, { uk: string; nl: string; toon: string }> = {
  'наявне': { uk: 'Працює', nl: 'Werkt', toon: 'goed' },
  'частково': { uk: 'Частково', nl: 'Gedeeltelijk', toon: 'deels' },
  'макет': { uk: 'Макет', nl: 'Ontwerp', toon: 'ontwerp' },
  'заплановане': { uk: 'Заплановано', nl: 'Gepland', toon: 'gepland' },
};
const stanTekst = (lang: Taal, stan: string) => STAN[stan]?.[lang] || stan;
const helder = () => typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('theme-light') || document.documentElement.classList.contains('theme-plum-light'));
const zonderBeweging = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const normaal = (t: string) => t.toLowerCase().replace(/[’'ʼ`«»"„“]/g, '').replace(/\u0451/g, 'е').replace(/\s+/g, ' ').trim();

/** Найближчий предок, що прокручується (на сайті це робоча область, а не вікно). */
function schuifouder(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll|overlay)/.test(s.overflowY)) return e;
  }
  return null;
}

/** Ілюстрація з даних: полотно 440×337 масштабується цілим під рамку («cover»), без обрізаних підписів і роздутих блоків. */
export function Kunst({ html, accent, className = '', zoom = 1 }: { html: string; accent: string; className?: string; zoom?: number }) {
  const raam = useRef<HTMLDivElement>(null);
  const [maat, setMaat] = useState({ s: 1, x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = raam.current; if (!el) return;
    const meet = () => {
      const b = el.clientWidth, h = el.clientHeight; if (!b || !h) return;
      // Вписуємо полотно повністю (підписи й мітки ілюстрації не обрізаються); лише малі плитки огляду
      // можуть трохи збільшити його (zoom), бо там важливий образ, а не дрібні підписи.
      const s = Math.min(Math.max(b / 440, h / 337), Math.min(b / 440, h / 337) * zoom);
      setMaat({ s, x: (b - 440 * s) / 2, y: (h - 337 * s) / 2 });
    };
    meet();
    if (typeof ResizeObserver !== 'function') return;
    const w = new ResizeObserver(meet); w.observe(el);
    return () => w.disconnect();
  }, [zoom]);
  return <div ref={raam} className={`mr-kunst-raam accent-${accent} ${className}`} aria-hidden='true'>
    <div className={`mr-kunst accent-${accent}`} style={{ transform: `translate(${maat.x}px, ${maat.y}px) scale(${maat.s})` }} dangerouslySetInnerHTML={{ __html: html }}/>
  </div>;
}

type Treffer = { sleutel: string; soort: 'sectie' | 'groep' | 'rij'; sectie: string; titel: string; pad: string; stan?: string; hooi: string; label: string };

function bouwIndex(lang: Taal): Treffer[] {
  const lijst: Treffer[] = [];
  for (const s of bron.secties) {
    const n = s[lang];
    lijst.push({ sleutel: s.id, soort: 'sectie', sectie: s.id, titel: n.name, pad: n.title, hooi: normaal(`${s.uk.name} ${s.nl.name} ${s.uk.title} ${s.nl.title} ${n.kicker} ${n.description}`), label: n.name });
    for (const g of groepenVan(s.id)) {
      const gt = lang === 'uk' ? g.uk : g.nl;
      lijst.push({ sleutel: `${s.id}/${g.id}`, soort: 'groep', sectie: s.id, titel: gt, pad: n.name, stan: g.стан, hooi: normaal(`${g.uk} ${g.nl} ${g.поясненняUk} ${g.поясненняNl}`), label: gt });
      g.рядки.forEach((r, i) => lijst.push({ sleutel: `${s.id}/${g.id}/${i}`, soort: 'rij', sectie: s.id, titel: lang === 'uk' ? r.uk : r.nl, pad: `${n.name} › ${gt}`, stan: g.стан, hooi: normaal(`${r.uk} ${r.nl}`), label: lang === 'uk' ? r.uk : r.nl }));
    }
  }
  return lijst;
}

const zoekTreffers = (index: Treffer[], vraag: string) => {
  const woorden = normaal(vraag).split(' ').filter(Boolean);
  if (!woorden.length) return [];
  const rang = { sectie: 0, groep: 1, rij: 2 } as const;
  return index.filter(t => woorden.every(w => t.hooi.includes(w)))
    .sort((a, b) => rang[a.soort] - rang[b.soort])
    .slice(0, 40);
};

/** Шукає в справжніх налаштуваннях розділу елемент із потрібним підписом і м'яко підсвічує його. */
function toonInPaneel(label: string, glad: boolean): boolean {
  const paneel = document.querySelector('.mr-at-paneel');
  if (!paneel) return false;
  const doel = normaal(label);
  const kort = doel.split(' ').filter(w => w.length > 3).slice(0, 2).join(' ');
  let beste: Element | null = null, lengte = Infinity;
  for (const zoek of [doel, kort]) {
    if (!zoek) continue;
    for (const el of paneel.querySelectorAll('h2,h3,h4,legend,summary,label,strong,b,span,p,small,button,dt')) {
      const t = normaal(el.textContent || '');
      if (t.includes(zoek) && t.length < lengte) { beste = el; lengte = t.length; }
    }
    if (beste) break;
  }
  if (!beste) return false;
  const det = beste.closest('details'); if (det && !det.open) det.open = true;
  const blok = (beste.closest('article,section,fieldset,details,li,label,.access-plane-row,.access-plane-group') || beste) as HTMLElement;
  blok.scrollIntoView({ block: 'center', behavior: glad ? 'smooth' : 'auto' });
  blok.classList.remove('mr-at-flits'); void blok.offsetWidth; blok.classList.add('mr-at-flits');
  window.setTimeout(() => blok.classList.remove('mr-at-flits'), 2600);
  return true;
}

function Vooruitzicht({ id, lang, open, onOpen, licht }: { id: string; lang: Taal; open: boolean; onOpen: (v: boolean) => void; licht: string }) {
  const lijst = groepenVan(id).filter(g => g.стан !== 'наявне');
  if (!lijst.length) return null;
  const rijen = lijst.reduce((a, g) => a + g.рядки.length, 0);
  return <details className='mr-at-toekomst' open={open} onToggle={e => onOpen((e.currentTarget as HTMLDetailsElement).open)}>
    <summary>
      <span className='mr-at-toekomst-teken'><PencilRuler size={18}/></span>
      <span className='mr-at-toekomst-tekst'><strong>{vertaal(lang, 'Можливості для доопрацювання', 'Mogelijkheden voor verdere ontwikkeling')}</strong>
        <small>{vertaal(lang, `${lijst.length} ${lijst.length === 1 ? 'група' : 'групи'} · ${rijen} позицій · ще не змінюють дані й права`, `${lijst.length} ${lijst.length === 1 ? 'groep' : 'groepen'} · ${rijen} punten · wijzigen nog geen gegevens of rechten`)}</small></span>
      <ChevronDown className='mr-at-pijl' size={18}/>
    </summary>
    <div className='mr-at-toekomst-inhoud'>
      {lijst.map(g => <div key={g.id} className={`mr-at-plan${licht === g.id ? ' mr-at-flits' : ''}`} data-plan={g.id}>
        <header><strong>{lang === 'uk' ? g.uk : g.nl}</strong><span className={`mr-at-stan stan-${STAN[g.стан]?.toon || 'gepland'}`}>{stanTekst(lang, g.стан)}</span></header>
        <p>{lang === 'uk' ? g.поясненняUk : g.поясненняNl}</p>
        <ul>{g.рядки.map((r, i) => <li key={i}>{lang === 'uk' ? r.uk : r.nl}</li>)}</ul>
      </div>)}
    </div>
  </details>;
}

export function IdentiteitAtelier({ lang, actief, secties, onKies }: Props) {
  const wortel = useRef<HTMLDivElement>(null);
  const huidig = useMemo(() => bron.secties.find(s => s.id === ontwerp(actief)) || bron.secties[0], [actief]);
  const index = bron.secties.indexOf(huidig);
  const [plaats, setPlaats] = useState<Plaats>(() => {
    try { const v = JSON.parse(localStorage.getItem(opslag) || '{}').plaats; if (['left', 'right', 'top', 'bottom'].includes(v)) return v; }
    catch { /* Без локального сховища — типове місце. */ }
    return 'left';
  });
  const [stijl, setStijl] = useState<Stijl>(() => {
    try { return JSON.parse(localStorage.getItem(opslag) || '{}').stijl === 'pills' ? 'pills' : 'classic'; }
    catch { return 'classic'; }
  });
  const zijbalk = useZijbalkVoorkeuren();
  const [licht, setLicht] = useState(helder);
  const [kiezer, setKiezer] = useState<null | 'nav' | 'zoek'>(null);
  const [vraag, setVraag] = useState('');
  const [keuze, setKeuze] = useState(0);
  const [instellingen, setInstellingen] = useState(false);
  const [toekomstOpen, setToekomstOpen] = useState(false);
  const [plan, setPlan] = useState('');
  const [boven, setBoven] = useState(0);
  const zoekveld = useRef<HTMLInputElement>(null);
  const zoekIndex = useMemo(() => bouwIndex(lang), [lang]);
  const treffers = useMemo(() => zoekTreffers(zoekIndex, vraag), [zoekIndex, vraag]);

  useEffect(() => { const w = new MutationObserver(() => setLicht(helder()));
    w.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => w.disconnect(); }, []);
  useEffect(() => { try { localStorage.setItem(opslag, JSON.stringify({ plaats, stijl })); } catch { /* Zonder opslag verder. */ } }, [plaats, stijl]);
  // Липкі елементи мають стояти під шапкою сайту: беремо верхній відступ робочої області, у якій прокручується сторінка.
  useLayoutEffect(() => {
    const meet = () => {
      const ouder = schuifouder(wortel.current);
      setBoven(ouder ? parseFloat(getComputedStyle(ouder).paddingTop) || 0 : 0);
    };
    meet(); window.addEventListener('resize', meet);
    return () => window.removeEventListener('resize', meet);
  }, []);
  useEffect(() => { setToekomstOpen(false); setPlan(''); }, [huidig.id]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setVraag(''); setKiezer('zoek'); }
      if (e.key === 'Escape') { setKiezer(null); setInstellingen(false); }
    };
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
  }, []);
  useEffect(() => { setKeuze(0); }, [vraag, kiezer]);
  useEffect(() => { if (kiezer) window.setTimeout(() => zoekveld.current?.focus({ preventScroll: true }), 30); }, [kiezer]);

  const naarBoven = useCallback(() => {
    const ouder = schuifouder(wortel.current), el = wortel.current;
    if (!el) return;
    const doel = ouder ? el.getBoundingClientRect().top - ouder.getBoundingClientRect().top + ouder.scrollTop - (parseFloat(getComputedStyle(ouder).paddingTop) || 0) : 0;
    (ouder || window).scrollTo({ top: Math.max(0, doel), behavior: zonderBeweging() ? 'auto' : 'smooth' });
  }, []);

  const ga = useCallback((id: string, na?: () => void) => {
    setKiezer(null); setInstellingen(false);
    if (ontwerp(id) !== huidig.id) onKies(werkelijk(id));
    window.setTimeout(() => { if (!na) naarBoven(); else na(); }, 60);
  }, [huidig.id, onKies, naarBoven]);

  const kiesTreffer = (t: Treffer) => {
    const groep = t.soort === 'sectie' ? null : groepenVan(t.sectie).find(g => g.id === t.sleutel.split('/')[1]);
    if (!groep) { ga(t.sectie); return; }
    if (groep.стан !== 'наявне') {
      ga(t.sectie, () => window.setTimeout(() => {
        setToekomstOpen(true); setPlan(groep.id);
        window.setTimeout(() => document.querySelector(`[data-plan="${CSS.escape(groep.id)}"]`)?.scrollIntoView({ block: 'center', behavior: zonderBeweging() ? 'auto' : 'smooth' }), 80);
      }, 120));
      return;
    }
    // Справжні налаштування можуть довантажуватися: кілька спроб упродовж ~2 с, інакше — початок розділу.
    ga(t.sectie, () => {
      let spoed = 0;
      const probeer = () => { if (toonInPaneel(t.label, !zonderBeweging()) || toonInPaneel(lang === 'uk' ? groep.uk : groep.nl, !zonderBeweging())) return; if (++spoed < 10) window.setTimeout(probeer, 200); else naarBoven(); };
      window.setTimeout(probeer, 150);
    });
  };

  const opKiezerToets = (e: ReactKeyboardEvent) => {
    const lijst = vraag ? treffers : [];
    if (!lijst.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setKeuze(k => Math.min(lijst.length - 1, k + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setKeuze(k => Math.max(0, k - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); kiesTreffer(lijst[keuze]); }
  };
  useEffect(() => { document.querySelector('.mr-at-treffer.is-gekozen')?.scrollIntoView({ block: 'nearest' }); }, [keuze]);

  const kleurIconen = zijbalk.icoonStijl === 'kleur';
  const inhoud = secties.find(item => ontwerp(item.id) === huidig.id)?.inhoud;
  const vorige = index > 0 ? bron.secties[index - 1] : null;
  const volgende = index < bron.secties.length - 1 ? bron.secties[index + 1] : null;
  const naam = huidig[lang];
  const Teken = ATELIER_SYMBOLEN[huidig.id];
  const groepenHier = groepenVan(huidig.id);
  const werkend = groepenHier.filter(g => g.стан === 'наявне');
  const overzicht = huidig.id === 'personalization';
  const plaatsNamen: Record<Plaats, string> = { left: vertaal(lang, 'Ліворуч', 'Links'), right: vertaal(lang, 'Праворуч', 'Rechts'), top: vertaal(lang, 'Угорі', 'Boven'), bottom: vertaal(lang, 'Унизу', 'Onder') };
  const plaatsTekens: Record<Plaats, LucideIcon> = { left: PanelLeft, right: PanelRight, top: PanelTop, bottom: PanelBottom };
  const totaalRijen = Object.values(bron.groepen as Record<string, BronGroep[]>).flat().reduce((a, g) => a + g.рядки.length, 0);
  const totaalGroepen = Object.values(bron.groepen as Record<string, BronGroep[]>).flat().length;

  const navItem = (s: BronSectie, compact = false) => {
    const Pictogram = ATELIER_SYMBOLEN[s.id], dit = s.id === huidig.id;
    return <button type='button' key={s.id} data-jump={s.id} className={`mr-at-item accent-${s.accent}${dit ? ' is-actief' : ''}`}
      aria-current={dit ? 'page' : undefined} title={compact ? s[lang].name : undefined} onClick={() => ga(s.id)}>
      <span className='mr-at-glief'><Pictogram size={17}/></span>
      <span className='mr-at-item-naam'>{s[lang].name}</span>
      <span className='mr-at-item-nr'>{s.number}</span>
    </button>;
  };

  const voortgang = <div className='mr-at-voortgang' aria-hidden='true'>{bron.secties.map((s, i) => <i key={s.id} className={i <= index ? 'is-gedaan' : ''}/>)}</div>;

  return <AtelierInhoud.Provider value={true}>
    <div ref={wortel} className={`mr-at plaats-${plaats} stijl-${stijl}${licht ? ' is-licht' : ''}${kleurIconen ? ' iconen-kleur' : ''}`}
      style={{ '--mr-boven': `${boven}px` } as CSSProperties} data-actief={werkelijk(huidig.id)}>
      <div className='mr-at-raster'>
        <aside className='mr-at-gids' aria-label={vertaal(lang, 'Навігація за розділами', 'Navigatie per onderdeel')}>
          <div className='mr-at-gids-kop'>
            <div><small>{vertaal(lang, 'Мій простір', 'Mijn Ruimte')}</small><strong>{vertaal(lang, 'Центр керування', 'Beheercentrum')}</strong></div>
            <button type='button' className='mr-at-rond' aria-haspopup='dialog' aria-expanded={instellingen} onClick={() => setInstellingen(v => !v)}
              title={vertaal(lang, 'Де показувати навігацію та як вона виглядає. Зберігається лише на цьому пристрої.', 'Waar de navigatie staat en hoe ze eruitziet. Alleen op dit apparaat bewaard.')}
              aria-label={vertaal(lang, 'Розташування навігації', 'Positie van navigatie')}><Settings2 size={17}/></button>
          </div>
          <button type='button' className='mr-at-zoekknop' onClick={() => { setVraag(''); setKiezer('zoek'); }}
            title={vertaal(lang, 'Пошук серед 12 розділів, 43 груп і 153 налаштувань. Вибір відкриває потрібне місце.', 'Zoeken in 12 onderdelen, 43 groepen en 153 instellingen. Een keuze opent de juiste plek.')}>
            <Search size={16}/><span>{vertaal(lang, 'Знайти налаштування', 'Instelling zoeken')}</span><kbd>Ctrl K</kbd>
          </button>
          <nav className='mr-at-gids-lijst'>
            {ATELIER_GROEPEN.map(g => <div className='mr-at-gids-groep' key={g.id} role='group' aria-label={lang === 'uk' ? g.uk : g.nl}>
              <div className='mr-at-gids-label'><span>{g.bereik}</span>{lang === 'uk' ? g.ukKort : g.nlKort}</div>
              {bron.secties.filter(s => (g.ids as readonly string[]).includes(s.id)).map(s => navItem(s))}
            </div>)}
          </nav>
          <div className='mr-at-gids-voet'>
            <span>{vertaal(lang, `Розділ ${index + 1} з 12`, `Onderdeel ${index + 1} van 12`)}</span>{voortgang}
          </div>
        </aside>

        <div className='mr-at-podium'>
          <div className='mr-at-balk'>
            <button type='button' className={`mr-at-balk-kies accent-${huidig.accent}`} aria-haspopup='dialog' aria-expanded={kiezer === 'nav'}
              onClick={() => { setVraag(''); setKiezer('nav'); }} aria-label={vertaal(lang, `Розділ: ${naam.name}. Відкрити всі розділи`, `Onderdeel: ${naam.name}. Alle onderdelen openen`)}>
              <span className='mr-at-glief'><Teken size={18}/></span>
              <span className='mr-at-balk-tekst'><small>{huidig.number} / 12 · {lang === 'uk' ? ATELIER_GROEPEN.find(g => (g.ids as readonly string[]).includes(huidig.id))?.ukKort : ATELIER_GROEPEN.find(g => (g.ids as readonly string[]).includes(huidig.id))?.nlKort}</small><strong>{naam.name}</strong></span>
              <ChevronDown size={18} className='mr-at-pijl'/>
            </button>
            <button type='button' className='mr-at-rond' onClick={() => { setVraag(''); setKiezer('zoek'); }} aria-label={vertaal(lang, 'Знайти налаштування', 'Instelling zoeken')}><Search size={18}/></button>
            <button type='button' className='mr-at-rond' aria-haspopup='dialog' aria-expanded={instellingen} onClick={() => setInstellingen(v => !v)} aria-label={vertaal(lang, 'Вигляд і навігація', 'Weergave en navigatie')}><Settings2 size={18}/></button>
            {voortgang}
          </div>

          {/* div role=region i.p.v. <section>: de omlijsting (flat-content) maakt elke <section> in de inhoud vlak en zonder straal. */}
          {overzicht ? <div role='region' id='identity-sectie-personalization' data-sectie='personalization' className='mr-at-held accent-violet' aria-labelledby='mr-at-held-kop'>
            <div className='mr-at-held-tekst'>
              <span className='mr-at-wenkbrauw'><i/>{vertaal(lang, 'Ваш цифровий простір', 'Jouw digitale ruimte')}</span>
              <h1 id='mr-at-held-kop'>{vertaal(lang, 'Ваш простір.', 'Jouw ruimte.')} <em>{vertaal(lang, 'Ваші правила.', 'Jouw regels.')}</em></h1>
              <p>{vertaal(lang, 'Один витончений центр керування всім, що робить «Мій простір» по-справжньому вашим.', 'Eén stijlvolle plek om alles te beheren wat Mijn Ruimte echt van jou maakt.')}</p>
              <div className='mr-at-held-acties'>
                <button type='button' className='mr-at-knop-hoofd' onClick={() => ga('menu')}>{vertaal(lang, 'Налаштувати простір', 'Ruimte instellen')}<ArrowUpRight size={18}/></button>
                <button type='button' className='mr-at-knop-glas' onClick={() => { setVraag(''); setKiezer('zoek'); }}><Search size={16}/>{vertaal(lang, 'Знайти налаштування', 'Instelling zoeken')}</button>
              </div>
              <div className='mr-at-held-cijfers'>
                <span><b>12</b>{vertaal(lang, 'розділів', 'onderdelen')}</span>
                <span><b>{totaalGroepen}</b>{vertaal(lang, 'груп', 'groepen')}</span>
                <span><b>{totaalRijen}</b>{vertaal(lang, 'налаштувань', 'instellingen')}</span>
              </div>
            </div>
            <Kunst html={huidig.art[lang]} accent={huidig.accent} className='mr-at-held-kunst'/>
            <p className='mr-at-held-noot'>{vertaal(lang, 'Вигляд не змінює права доступу: кожну дію, як і раніше, перевіряє сервер.', 'Het uiterlijk wijzigt geen rechten: de server controleert elke handeling zoals voorheen.')}</p>
          </div> : <div role='region' key={huidig.id} id={`identity-sectie-${werkelijk(huidig.id)}`} data-sectie={werkelijk(huidig.id)}
            className={`mr-at-kop accent-${huidig.accent}`} aria-labelledby='mr-at-kop-titel'>
            <div className='mr-at-kop-tekst'>
              <div className='mr-at-kop-lijn'><span className='mr-at-glief'><Teken size={19}/></span><span><b>{huidig.number}</b> / 12</span><i/><span>{naam.kicker}</span></div>
              <h1 id='mr-at-kop-titel'>{naam.title}</h1>
              <p>{naam.description}</p>
              <ul className='mr-at-facetten'>{huidig.uk.details.map((d, i) => {
                const nl = huidig.nl.details[i] as unknown as [string, string] | undefined;
                const label = lang === 'uk' ? (d as { label: string }).label : nl?.[0] || '';
                const noot = lang === 'uk' ? (d as { note: string }).note : nl?.[1] || '';
                return <li key={i}><span aria-hidden='true'>{(d as { icon: string }).icon}</span><div><strong>{label}</strong><small>{noot}</small></div></li>;
              })}</ul>
            </div>
            <Kunst html={huidig.art[lang]} accent={huidig.accent} className='mr-at-kop-kunst'/>
          </div>}

          {overzicht ? <div className='mr-at-kaart'>
            {ATELIER_GROEPEN.map((g, gi) => <div key={g.id} className='mr-at-kaart-blok'>
              <div className='mr-at-boventitel'><span>{g.bereik}</span><strong>{lang === 'uk' ? g.uk : g.nl}</strong><i/></div>
              <div className='mr-at-tegels'>{bron.secties.filter(s => (g.ids as readonly string[]).includes(s.id) && s.id !== 'personalization').map(s => {
                const P = ATELIER_SYMBOLEN[s.id];
                return <button type='button' key={s.id} data-jump={s.id} className={`mr-at-tegel accent-${s.accent}`} onClick={() => ga(s.id)}>
                  <Kunst html={s.art[lang]} accent={s.accent} className='mr-at-tegel-kunst' zoom={1.12}/>
                  <span className='mr-at-tegel-tekst'>
                    <span className='mr-at-tegel-lijn'><span className='mr-at-glief'><P size={15}/></span><small>{s.number} · {s[lang].kicker}</small></span>
                    <strong>{s[lang].name}</strong>
                    <span className='mr-at-tegel-zin'>{s[lang].title}</span>
                  </span>
                  <ArrowUpRight className='mr-at-tegel-pijl' size={18}/>
                </button>;
              })}</div>
              {(gi === 0 || gi === 2) && <figure className='mr-at-tussen'><span aria-hidden='true'>✳</span><blockquote>
                {gi === 0 ? vertaal(lang, 'Дизайн стає по-справжньому вашим, коли кожен елемент', 'Een ontwerp voelt echt van jou wanneer elk onderdeel') : vertaal(lang, 'Справжній контроль — це коли складне', 'Echte controle betekent dat ingewikkelde zaken')}{' '}
                <em>{gi === 0 ? vertaal(lang, 'має своє місце.', 'zijn eigen plaats heeft.') : vertaal(lang, 'відчувається простим.', 'eenvoudig aanvoelen.')}</em></blockquote><small>{gi === 0 ? '01 / 02' : '02 / 02'}</small></figure>}
            </div>)}
          </div> : <div role='region' className={`mr-at-paneel accent-${huidig.accent}`} aria-label={vertaal(lang, `Налаштування: ${naam.name}`, `Instellingen: ${naam.name}`)}>
            <header className='mr-at-paneel-kop'>
              <small>{vertaal(lang, 'Налаштування', 'Instellingen')}</small>
              {!!groepenHier.length && <span className='mr-at-chip' title={`${vertaal(lang, 'Працюють тут', 'Werken hier')}: ${werkend.map(g => lang === 'uk' ? g.uk : g.nl).join(' · ')}${groepenHier.length > werkend.length ? vertaal(lang, '. Решта — у «Можливостях для доопрацювання» нижче.', '. De rest staat onder «Mogelijkheden» hieronder.') : ''}`}>
                {vertaal(lang, `${werkend.length} з ${groepenHier.length} груп працюють`, `${werkend.length} van ${groepenHier.length} groepen werken`)}</span>}
            </header>
            <div className='mr-at-paneel-inhoud ia-at-werkelijk'>{inhoud}</div>
          </div>}

          <Vooruitzicht id={huidig.id} lang={lang} open={toekomstOpen} onOpen={setToekomstOpen} licht={plan}/>

          <nav className='mr-at-buren' aria-label={vertaal(lang, 'Сусідні розділи', 'Naastliggende onderdelen')}>
            {vorige ? <button type='button' className={`accent-${vorige.accent}`} onClick={() => ga(vorige.id)}><ArrowLeft size={18}/><span><small>{vertaal(lang, 'Попередній', 'Vorige')} · {vorige.number}</small><strong>{vorige[lang].name}</strong></span></button> : <span/>}
            {volgende ? <button type='button' className={`is-volgende accent-${volgende.accent}`} onClick={() => ga(volgende.id)}><span><small>{vertaal(lang, 'Далі', 'Volgende')} · {volgende.number}</small><strong>{volgende[lang].name}</strong></span><ArrowRight size={18}/></button> : <span/>}
          </nav>

          {/* Вибір вигляду доступний на будь-якій ширині, також на телефоні, де бічної панелі немає. */}
          <div className='mr-at-weergave'><VormgevingKiezer lang={lang}/></div>

          <footer className='mr-at-voet'>
            <span className='mr-at-monogram'>M<span>·</span>R</span>
            <div><strong>{vertaal(lang, 'Мій простір', 'Mijn Ruimte')}</strong><small>{vertaal(lang, 'Центр налаштувань', 'Instellingencentrum')}</small></div>
            <button type='button' onClick={naarBoven}>{vertaal(lang, 'Повернутися вгору', 'Terug naar boven')} ↑</button>
          </footer>
        </div>
      </div>

      {instellingen && <>
        <button type='button' className='mr-at-sluier is-zacht' aria-label={vertaal(lang, 'Закрити', 'Sluiten')} onClick={() => setInstellingen(false)}/>
        <div className='mr-at-popover' role='dialog' aria-label={vertaal(lang, 'Розташування навігації', 'Positie van navigatie')}>
          <header><div><small>{vertaal(lang, 'Навігація сторінки', 'Paginanavigatie')}</small><strong>{vertaal(lang, 'Де й як показувати', 'Waar en hoe tonen')}</strong></div>
            <button type='button' className='mr-at-rond' onClick={() => setInstellingen(false)} aria-label={vertaal(lang, 'Закрити', 'Sluiten')}><X size={16}/></button></header>
          <div className='mr-at-plaatsen'>{(['left', 'right', 'top', 'bottom'] as const).map(p => { const T = plaatsTekens[p]; return <button key={p} type='button' aria-pressed={plaats === p} onClick={() => setPlaats(p)}><T size={20}/>{plaatsNamen[p]}</button>; })}</div>
          <div className='mr-at-stijlen' role='group' aria-label={vertaal(lang, 'Стиль навігації', 'Navigatiestijl')}>
            <button type='button' aria-pressed={stijl === 'classic'} onClick={() => setStijl('classic')}>{vertaal(lang, 'Звичайна панель', 'Gewone balk')}</button>
            <button type='button' aria-pressed={stijl === 'pills'} onClick={() => setStijl('pills')}>{vertaal(lang, 'Окремі кнопки', 'Losse knoppen')}</button>
          </div>
          <VormgevingKiezer lang={lang} className='mr-at-vormgeving'/>
          <p>{vertaal(lang, 'На телефоні навігація завжди відкривається аркушем знизу, щоб не забирати ширину в налаштувань.', 'Op een telefoon opent de navigatie altijd als blad van onderen, zodat de instellingen hun breedte houden.')}</p>
        </div>
      </>}

      {kiezer && <>
        <button type='button' className='mr-at-sluier' aria-label={vertaal(lang, 'Закрити', 'Sluiten')} onClick={() => setKiezer(null)}/>
        <div className={`mr-at-kiezer soort-${kiezer}`} role='dialog' aria-modal='true' aria-label={kiezer === 'nav' ? vertaal(lang, 'Усі розділи', 'Alle onderdelen') : vertaal(lang, 'Пошук налаштувань', 'Instellingen zoeken')} onKeyDown={opKiezerToets}>
          <span className='mr-at-greep' aria-hidden='true'/>
          <div className='mr-at-kiezer-veld'><Search size={19}/>
            <input ref={zoekveld} type='search' value={vraag} onChange={e => setVraag(e.target.value)} enterKeyHint='go'
              placeholder={vertaal(lang, 'Розділ або налаштування, напр. «тихі години»', 'Onderdeel of instelling, bv. «stille uren»')}
              aria-label={vertaal(lang, 'Пошук налаштувань', 'Instellingen zoeken')}/>
            <button type='button' className='mr-at-rond' onClick={() => setKiezer(null)} aria-label={vertaal(lang, 'Закрити', 'Sluiten')}><X size={17}/></button>
          </div>
          <div className='mr-at-kiezer-lijst'>
            {vraag ? (treffers.length ? treffers.map((t, i) => {
              const s = bron.secties.find(x => x.id === t.sectie)!, P = ATELIER_SYMBOLEN[s.id];
              return <button type='button' key={t.sleutel} className={`mr-at-treffer accent-${s.accent}${i === keuze ? ' is-gekozen' : ''}`} onMouseMove={() => setKeuze(i)} onClick={() => kiesTreffer(t)}>
                <span className='mr-at-glief'><P size={16}/></span>
                <span className='mr-at-treffer-tekst'><strong>{t.titel}</strong><small>{t.soort === 'sectie' ? `${s.number} · ${t.pad}` : t.pad}</small></span>
                {t.stan && t.stan !== 'наявне' ? <span className={`mr-at-stan stan-${STAN[t.stan]?.toon}`}>{stanTekst(lang, t.stan)}</span> : <CornerDownLeft size={15} className='mr-at-treffer-enter'/>}
              </button>;
            }) : <p className='mr-at-leeg'>{vertaal(lang, 'Нічого не знайдено. Спробуйте інше слово — пошук охоплює всі 153 налаштування обома мовами.', 'Niets gevonden. Probeer een ander woord — er wordt in alle 153 instellingen in beide talen gezocht.')}</p>)
              : ATELIER_GROEPEN.map(g => <div key={g.id} className='mr-at-kiezer-groep'>
                <div className='mr-at-gids-label'><span>{g.bereik}</span>{lang === 'uk' ? g.uk : g.nl}</div>
                <div className='mr-at-kiezer-raster'>{bron.secties.filter(s => (g.ids as readonly string[]).includes(s.id)).map(s => navItem(s))}</div>
              </div>)}
          </div>
          <div className='mr-at-kiezer-voet'><span><kbd>↑</kbd><kbd>↓</kbd>{vertaal(lang, 'вибір', 'kiezen')}</span><span><kbd>Enter</kbd>{vertaal(lang, 'відкрити', 'openen')}</span><span><kbd>Esc</kbd>{vertaal(lang, 'закрити', 'sluiten')}</span></div>
        </div>
      </>}
    </div>
  </AtelierInhoud.Provider>;
}
