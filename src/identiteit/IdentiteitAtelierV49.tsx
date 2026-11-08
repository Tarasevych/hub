import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, ContactRound, Globe, KeyRound, LayoutGrid, Menu, MonitorSmartphone, Palette, PencilRuler, Search, Settings2, ShieldCheck, Sparkles, UsersRound, type LucideIcon } from 'lucide-react';
import type { IdentiteitSectie } from './IdentiteitAccountPagina';
import { useZijbalkVoorkeuren } from '../zijbalk-voorkeuren';
import { AtelierInhoud } from './atelier-inhoud';
import bron from './atelier-v49-gegevens.json';
import './atelier-v49-bron.css';

type Taal = 'uk' | 'nl';
type Plaats = 'left' | 'right' | 'top' | 'bottom';
type Props = { lang: Taal; actief: string; inBeeld: string; secties: readonly IdentiteitSectie[]; onKies: (id: string) => void };
const vertaal = (taal: Taal, uk: string, nl: string) => taal === 'uk' ? uk : nl;
const werkelijk = (id: string) => id === 'identities' ? 'identity' : id;
const ontwerp = (id: string) => id === 'identity' ? 'identities' : id;
const symbolen: Record<string, LucideIcon> = {
  personalization: Sparkles, menu: Menu, themes: Palette, languages: Globe,
  widgets: LayoutGrid, sharing: UsersRound, identities: ContactRound,
  account: Settings2, sessions: MonitorSmartphone, methods: KeyRound,
  security: ShieldCheck, recovery: CircleHelp,
};
const groepen = [
  { id: 'personal', ids: ['personalization', 'menu', 'themes', 'languages', 'widgets'], uk: 'ОБЛИЧЧЯ ВАШОГО ПРОСТОРУ', nl: 'DE SFEER VAN JOUW RUIMTE', ukNav: 'Вигляд і меню', nlNav: 'Uiterlijk en menu', bereik: '01 — 05' },
  { id: 'social', ids: ['sharing', 'identities'], uk: 'ЛЮДИ ТА ІДЕНТИЧНІСТЬ', nl: 'MENSEN EN IDENTITEIT', ukNav: 'Доступ і ролі', nlNav: 'Toegang en rollen', bereik: '06 — 07' },
  { id: 'account', ids: ['account', 'sessions', 'methods'], uk: 'ВАШ ОБЛІКОВИЙ ЗАПИС', nl: 'JOUW ACCOUNT', ukNav: 'Обліковий запис', nlNav: 'Account', bereik: '08 — 10' },
  { id: 'security', ids: ['security', 'recovery'], uk: 'БЕЗПЕКА ТА ВІДНОВЛЕННЯ', nl: 'BEVEILIGING EN HERSTEL', ukNav: 'Захист', nlNav: 'Bescherming', bereik: '11 — 12' },
];
const onmiddellijk = new Set(['personalization', 'menu', 'themes', 'languages', 'widgets', 'identities']);
const opslag = 'identiteit-atelier-v49-navigatie';
const helder = () => typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('theme-light') || document.documentElement.classList.contains('theme-plum-light'));

function Vooruitzicht({ id, lang }: { id: string; lang: Taal }) {
  const lijst = bron.groepen[id as keyof typeof bron.groepen].filter(groep => groep.стан !== 'наявне');
  if (!lijst.length) return null;
  return <details className='ia-at-vooruitzicht'>
    <summary><PencilRuler size={20}/><span>{vertaal(lang, 'Можливості для доопрацювання', 'Mogelijkheden voor verdere ontwikkeling')}</span><ChevronDown/></summary>
    <div className='ia-at-vooruitzicht-inhoud'>
      <p>{vertaal(lang, 'Це завдання для наступних випусків, а не кнопки, які змінюють дані чи права.', 'Dit zijn plannen voor volgende uitgaven, geen knoppen die gegevens of rechten wijzigen.')}</p>
      {lijst.map(groep => <details key={groep.id}>
        <summary>{lang === 'uk' ? groep.uk : groep.nl} · {groep.стан === 'частково' ? vertaal(lang, 'Частково', 'Gedeeltelijk') : vertaal(lang, 'Планується', 'Gepland')}</summary>
        <p>{lang === 'uk' ? groep.поясненняUk : groep.поясненняNl}</p>
        <ul>{groep.рядки.map((rij, index) => <li key={index}>{lang === 'uk' ? rij.uk : rij.nl}</li>)}</ul>
      </details>)}
    </div>
  </details>;
}

export function IdentiteitAtelierV49({ lang, actief, inBeeld, secties, onKies }: Props) {
  const [open, setOpen] = useState(() => new Set([ontwerp(actief)]));
  const [navGroepen, setNavGroepen] = useState(() => new Set(['personal']));
  const [plaats, setPlaats] = useState<Plaats>(() => {
    try { const v = JSON.parse(localStorage.getItem(opslag) || '{}').plaats; if (['left', 'right', 'top', 'bottom'].includes(v)) return v; }
    catch { /* Geen plaatselijke opslag vereist. */ }
    return 'right';
  });
  const [compact, setCompact] = useState(false);
  const [navStijl, setNavStijl] = useState<'classic' | 'pills'>(() => {
    try { return JSON.parse(localStorage.getItem(opslag) || '{}').stijl === 'pills' ? 'pills' : 'classic'; }
    catch { return 'classic'; }
  });
  const zijbalk = useZijbalkVoorkeuren();
  const [instellingen, setInstellingen] = useState(false);
  const [zoekOpen, setZoekOpen] = useState(false);
  const [zoektekst, setZoektekst] = useState('');
  const [licht, setLicht] = useState(helder);
  const [voortgang, setVoortgang] = useState(0);
  useEffect(() => { setOpen(vorig => new Set([...vorig, ontwerp(actief)])); }, [actief]);
  useEffect(() => { const w = new MutationObserver(() => setLicht(helder()));
    w.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => w.disconnect(); }, []);
  useEffect(() => { try { localStorage.setItem(opslag, JSON.stringify({ plaats, stijl: navStijl })); } catch { /* Zonder opslag verder. */ } }, [plaats, navStijl]);
  useEffect(() => { const meet = () => { const h = document.documentElement.scrollHeight - window.innerHeight;
    setVoortgang(h > 0 ? Math.round(Math.max(0, Math.min(100, 100 * window.scrollY / h))) : 100); };
    meet(); window.addEventListener('scroll', meet, { passive: true }); window.addEventListener('resize', meet);
    return () => { window.removeEventListener('scroll', meet); window.removeEventListener('resize', meet); }; }, []);
  useEffect(() => { const toets = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setZoekOpen(true); }
    if (e.key === 'Escape') { setZoekOpen(false); setInstellingen(false); }
  }; window.addEventListener('keydown', toets); return () => window.removeEventListener('keydown', toets); }, []);
  const resultaten = useMemo(() => bron.secties.filter(s =>
    `${s.uk.name} ${s.nl.name} ${s.uk.title} ${s.nl.title}`.toLowerCase().includes(zoektekst.toLowerCase())), [zoektekst]);
  const ga = (id: string) => {
    setOpen(vorig => new Set([...vorig, id])); onKies(werkelijk(id)); setZoekOpen(false);
    window.setTimeout(() => document.getElementById(`identity-sectie-${werkelijk(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const wissel = (id: string) => setOpen(vorig => { const nieuw = new Set(vorig); if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id); return nieuw; });
  const wisselGroep = (id: string) => setNavGroepen(vorig => { const nieuw = new Set(vorig); if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id); return nieuw; });
  return <AtelierInhoud.Provider value={true}><div className={`ia-at-v49 rail-${plaats}${licht ? ' light' : ''}${compact ? ' rail-compact' : ''}${navStijl === 'pills' ? ' rail-pills' : ''}${zijbalk.icoonStijl === 'kleur' ? ' demo-colorful-icons' : ''}`}>
    <main className='main-content'>
      <header className='topbar'><div className='breadcrumbs'><span className='breadcrumb-dot'/>
        <span>{vertaal(lang, 'Мій простір', 'Mijn Ruimte')}</span><span className='slash'>/</span>
        <strong>{vertaal(lang, 'Налаштування', 'Instellingen')}</strong></div>
        <div className='top-actions'><span className='concept-pill'><span/>{vertaal(lang, 'Чинні налаштування', 'Bestaande instellingen')}</span>
          <button type='button' className='search-action' onClick={() => setZoekOpen(true)}><Search size={15}/>
            <span>{vertaal(lang, 'Швидкий перехід', 'Snel navigeren')}</span><kbd>Ctrl K</kbd></button></div>
      </header>
      <div className='page-wrap'>
        <section className='hero' aria-labelledby='ia-at-v49-kop'>
          <div className='hero-orb' aria-hidden='true'><div className='orb-core'/><span className='orbit orbit-one'/><span className='orbit orbit-two'/><span className='orb-star star-one'>✦</span><span className='orb-star star-two'>✦</span></div>
          <div className='hero-copy'><div className='eyebrow hero-eyebrow'><span className='line'/>{vertaal(lang, 'ВАШ ЦИФРОВИЙ ПРОСТІР', 'JOUW DIGITALE RUIMTE')}<span className='line'/></div>
            <h1 id='ia-at-v49-kop'>{vertaal(lang, 'Ваш простір.', 'Jouw ruimte.')}<br/><em>{vertaal(lang, 'Ваші правила.', 'Jouw regels.')}</em></h1>
            <p>{vertaal(lang, 'Один витончений центр керування всім, що робить «Мій простір» по-справжньому вашим.', 'Eén stijlvolle plek om alles te beheren wat Mijn Ruimte echt van jou maakt.')}</p>
            <div className='hero-actions'><button type='button' className='primary-button' onClick={() => ga('personalization')}>{vertaal(lang, 'Налаштувати простір', 'Ruimte instellen')}<ArrowUpRight size={18}/></button>
              <button type='button' className='ghost-button' onClick={() => setInstellingen(v => !v)}>{vertaal(lang, 'Розташування навігації', 'Positie van navigatie')} <span>⌘</span></button></div>
          </div>
          <div className='hero-foot'><span><b>12</b> {vertaal(lang, 'розділів', 'onderdelen')}</span><i/><span>{vertaal(lang, 'Єдиний центр керування', 'Eén beheercentrum')}</span><i/><span className='hero-foot-last'>{vertaal(lang, 'Без зміни прав доступу', 'Zonder rechten te wijzigen')}</span></div>
        </section>
        {groepen.map((groep, index) => <div key={groep.id}>
          <div className='section-overline revealed'><span className='section-overline-index'>{groep.bereik}</span>
            <span className='section-overline-text'>{lang === 'uk' ? groep.uk : groep.nl}</span><span className='section-overline-line'/></div>
          <div className='section-list'>{bron.secties.filter(s => groep.ids.includes(s.id)).map(s => {
            const naam = s[lang], Pictogram = symbolen[s.id];
            const inhoud = secties.find(item => ontwerp(item.id) === s.id)?.inhoud;
            const actiefOpen = onmiddellijk.has(s.id) || open.has(s.id);
            const sectieId = `identity-sectie-${werkelijk(s.id)}`;
            return <section className={`setting-section revealed accent-${s.accent}`} key={s.id} id={sectieId}
              data-sectie={werkelijk(s.id)} aria-labelledby={`${sectieId}-kop`}>
              <div className='section-card'><div className='setting-main'>
                <div className='setting-topline'><span className='setting-index'>{s.number} / 12</span><span className='setting-divider'/><span>{naam.kicker}</span></div>
                <div className='setting-symbol'><Pictogram size={23}/></div>
                <h2 id={`${sectieId}-kop`}>{naam.title}</h2><p>{naam.description}</p>
                {!onmiddellijk.has(s.id) && <button type='button' className='text-link open-detail'
                  aria-expanded={actiefOpen} aria-controls={`${sectieId}-inhoud`} onClick={() => wissel(s.id)}>
                  {actiefOpen ? vertaal(lang, 'Згорнути налаштування', 'Instellingen inklappen') : vertaal(lang, 'Відкрити налаштування', 'Instellingen openen')}
                  <ChevronDown size={19} className={actiefOpen ? 'ia-at-gedraaid' : ''}/>
                </button>}
              </div><div className='ia-at-afbeelding' style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: s.art[lang] }}/></div>
              <div id={`${sectieId}-inhoud`} className='section-inline-settings ia-at-werkelijk' hidden={!actiefOpen}>
                {s.id === 'personalization' ? <div className='detail-grid'>{bron.secties.slice(1, 7).map(doel => {
                  const Tekentje = symbolen[doel.id]; return <button type='button' className='detail-item' key={doel.id} onClick={() => ga(doel.id)}>
                    <span className='detail-icon'><Tekentje size={20}/></span><span className='detail-text'><strong>{doel[lang].name}</strong><small>{doel[lang].kicker}</small></span><ChevronRight className='detail-arrow' size={16}/>
                  </button>; })}</div> : inhoud}
              </div><Vooruitzicht id={s.id} lang={lang}/>
            </section>;
          })}</div>
          {(index === 0 || index === 2) && <div className='interlude revealed'><div><span className='interlude-star'>✳</span>
            <p>{index === 0 ? vertaal(lang, 'Дизайн стає по-справжньому вашим, коли кожен елемент', 'Een ontwerp voelt echt van jou wanneer elk onderdeel') : vertaal(lang, 'Справжній контроль — це коли складне', 'Echte controle betekent dat ingewikkelde zaken')}{' '}
              <em>{index === 0 ? vertaal(lang, 'має своє місце.', 'zijn eigen plaats heeft.') : vertaal(lang, 'відчувається простим.', 'eenvoudig aanvoelen.')}</em></p></div><span className='interlude-number'>{index === 0 ? '01 / 02' : '02 / 02'}</span></div>}
        </div>)}
        <footer className='site-footer'><span className='footer-monogram'>M<span>·</span>R</span>
          <div><strong>{vertaal(lang, 'Мій простір', 'Mijn Ruimte')}</strong><span>{vertaal(lang, 'Центр налаштувань', 'Instellingencentrum')}</span></div>
          <button type='button' className='to-top' onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{vertaal(lang, 'Повернутися вгору', 'Terug naar boven')} ↑</button></footer>
      </div>
    </main>
    <nav className='anchor-rail ia-at-nav' aria-label={vertaal(lang, 'Навігація за розділами', 'Navigatie per onderdeel')}>
      <div className='rail-title'><div className='rail-title-left'><button id='railExpand' type='button' className='rail-mark rail-expand' aria-pressed={compact} onClick={() => setCompact(v => !v)} aria-label={vertaal(lang, 'Згорнути меню', 'Navigatie inklappen')}><Menu size={20}/></button>
        {!compact && <div><strong>{vertaal(lang, 'НАВІГАЦІЯ', 'NAVIGATIE')}</strong><small>{vertaal(lang, 'Розділи сторінки', 'Paginaonderdelen')}</small></div>}</div>
        <button id='railConfig' type='button' className='rail-config' onClick={() => setInstellingen(v => !v)} aria-label={vertaal(lang, 'Розташування меню', 'Navigatiepositie')}><Settings2 size={18}/></button></div>
      <div className='rail-items'>{groepen.map(groep => <div className={`nav-group${navGroepen.has(groep.id) ? ' nav-group-open' : ''}`} key={groep.id}>
        <button type='button' className='nav-group-toggle' data-nav-group-toggle={groep.id} aria-expanded={navGroepen.has(groep.id)} onClick={() => wisselGroep(groep.id)}>
          <span className='anchor-icon'><LayoutGrid size={18}/></span><span className='nav-group-name'>{lang === 'uk' ? groep.ukNav : groep.nlNav}</span><ChevronRight className='nav-chevron' size={14}/></button>
        <div className='nav-subitems'>{bron.secties.filter(s => groep.ids.includes(s.id)).map(s => {
          const Pictogram = symbolen[s.id], huidig = ontwerp(inBeeld) === s.id;
          return <button type='button' key={s.id} data-jump={s.id} className={`anchor-link${huidig ? ' active' : ''}`} aria-current={huidig ? 'true' : undefined}
            title={s[lang].name} onClick={() => ga(s.id)}><span className='anchor-icon'><Pictogram size={18}/></span><span className='anchor-name'>{s[lang].name}</span><span className='anchor-active-marker'/></button>;
        })}</div></div>)}</div>
      <div className='rail-bottom'><div className='rail-progress-gauge' role='progressbar' aria-label={vertaal(lang, 'Частина переглянутої сторінки', 'Leesvoortgang')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={voortgang}>
        <svg viewBox='0 0 44 44'><circle className='rail-progress-base' cx='22' cy='22' r='18'/><circle className='rail-progress-ring' cx='22' cy='22' r='18' style={{ strokeDasharray: `${voortgang * 1.13} 113` }}/></svg><strong>{voortgang}%</strong></div></div>
    </nav>
    {instellingen && <div className='popover-panel ia-at-nav-instellingen' role='dialog' aria-label={vertaal(lang, 'Розташування навігації', 'Navigatiepositie')}>
      <div className='popover-head'><div><small>{vertaal(lang, 'РОЗТАШУВАННЯ', 'POSITIE')}</small><strong>{vertaal(lang, 'Оберіть край екрана', 'Kies een schermrand')}</strong></div><button type='button' onClick={() => setInstellingen(false)}>×</button></div>
      <div className='dock-picker'>{(['left', 'right', 'top', 'bottom'] as const).map(p => <button key={p} type='button' aria-pressed={plaats === p} className={plaats === p ? 'selected' : ''} onClick={() => setPlaats(p)}>
        <span className={`dock-diagram dock-${p}`}/>{({left:vertaal(lang,'Ліворуч','Links'),right:vertaal(lang,'Праворуч','Rechts'),top:vertaal(lang,'Зверху','Boven'),bottom:vertaal(lang,'Знизу','Onder')})[p]}</button>)}</div>
      <div className='nav-style-control'><strong>{vertaal(lang, 'Стиль навігації', 'Navigatiestijl')}</strong>
        <div className='nav-style-picker'><button type='button' aria-pressed={navStijl === 'classic'} onClick={() => setNavStijl('classic')}>{vertaal(lang, 'Звичайна панель', 'Gewone balk')}</button>
          <button type='button' aria-pressed={navStijl === 'pills'} onClick={() => setNavStijl('pills')}>{vertaal(lang, 'Окремі кнопки', 'Losse knoppen')}</button></div>
      </div></div>}
    {zoekOpen && <div className='search-overlay' onClick={() => setZoekOpen(false)}><div className='ia-at-zoekpaneel' role='dialog' aria-modal='true' aria-label={vertaal(lang,'Пошук розділу','Onderdeel zoeken')} onClick={e => e.stopPropagation()}>
      <div className='ia-at-zoekinvoer'><Search size={20}/><input type='search' autoFocus value={zoektekst} onChange={e => setZoektekst(e.target.value)} placeholder={vertaal(lang,'Назва розділу…','Naam van onderdeel…')}/><button type='button' onClick={() => setZoekOpen(false)}>×</button></div>
      <div className='ia-at-zoekresultaten'>{resultaten.map(s => { const Icoon = symbolen[s.id]; return <button type='button' key={s.id} onClick={() => ga(s.id)}><Icoon size={19}/>{s[lang].name}<ChevronRight size={16}/></button>; })}</div>
    </div></div>}
  </div></AtelierInhoud.Provider>;
}
