import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { weergaveScopeNu } from '../gedeelde-voorkeuren';
import {
  Bot, BarChart3, CalendarDays, CheckCircle2, Clock3, Cloud, Code2, Database, ExternalLink, FileText, Home, LayoutGrid, LifeBuoy, ListChecks, Mail,
  MessageSquare, PlayCircle, RefreshCw, Search, Server, Settings2, Share2, ShieldCheck, Sparkles, Star, Store, TrendingUp, Users, Wallet, Workflow, X, Zap, Info, type LucideIcon,
} from 'lucide-react';
import { api } from '../platform/client';
import { canonicalServiceUrl } from '../canoniek-dienst';
import {
  CATEGORIEEN, INTEGRATIES, METHODE_LABEL, STATUS_LABEL,
  type Integratie, type IntegratieCategorie, type IntegratieMethode, type IntegratieStatus,
} from '../../shared/integraties-catalogus';
import { NIEUW, POPULAIR } from '../../shared/integraties-detail';
import Logo from '../merk/MerkLogo';
import Detail, { type ServerStand } from './Detail';
import Wizard from './Wizard';
import MerkEigenBeheer from './MerkEigenBeheer';
// 21.10.2026: instelling van de lokale beeldgenerator (BYOS) voor het AI-recht «Створювати зображення».
import LokaleGenerator from './LokaleGenerator';
import MerkBronBeheer from './MerkBronBeheer';
import './integraties.css';
import TabsRij from '../ontwerp/TabsRij';
// UI-013: vernieuwde catalogus achter vlag `integraties-catalogus-v2` (standaard UIT).
import CatalogusV2 from './CatalogusV2';
import { useCatalogusV2 } from './catalogus-vlag';

type Lang = 'uk' | 'nl';
type Weergave = 'catalogus' | 'mijn' | 'mappen' | 'wizard';
type Sortering = 'aanbevolen' | 'naam' | 'categorie';
/** Levende toestand van een koppeling, alleen waar de site die zelf kan lezen. */
export type Levend = 'verbonden' | 'niet' | 'ingesteld' | 'fout';

export interface IntegratiesProps {
  lang: Lang;
  /** Context voor admin-aanroepen (service, tabContext, sourceOrigin). */
  context: Record<string, unknown>;
  ssoActief: boolean;
  directories: ReadonlyArray<{ type: string; status: string; credentialConfigured: boolean; tenantId?: string; baseUrl?: string }>;
  /** Het bestaande blok «Externe directory's» (configuratie van Microsoft Graph en SCIM). */
  mappen: ReactNode;
}

const ICONEN: Record<string, LucideIcon> = {
  mail: Mail, calendar: CalendarDays, cloud: Cloud, message: MessageSquare, bot: Bot, code: Code2, workflow: Workflow, server: Server, database: Database,
  chart: BarChart3, users: Users, wallet: Wallet, share: Share2, house: Home, shield: ShieldCheck, file: FileText, list: ListChecks, zap: Zap, life: LifeBuoy, play: PlayCircle, store: Store,
};
const STATUS_RANG: Record<IntegratieStatus, number> = { klaar: 0, instellen: 1, binnenkort: 2 };
// Audit 20.10.2026 (punt 2): wenslijst en weergave hingen onder ÉÉN sleutel voor de hele browser, dus zag een tweede account de
// keuzes van het eerste. Nu per account en per webruimte, met dezelfde scope als het menu en het thema (weergaveScopeNu()).
const BASIS = 'tsv-integraties-v1';
const OPSLAG = () => `${BASIS}:${weergaveScopeNu()}`;
try { if (localStorage.getItem(BASIS) !== null) localStorage.removeItem(BASIS); } catch { /* opslag geblokkeerd */ }
const normaal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const leesOpslag = (): { wens: string[]; weergave: Weergave } => {
  try {
    const r = JSON.parse(localStorage.getItem(OPSLAG()) || '{}');
    return { wens: Array.isArray(r.wens) ? r.wens.filter((x: unknown) => typeof x === 'string').slice(0, 300) : [], weergave: ['catalogus', 'mijn', 'mappen', 'wizard'].includes(r.weergave) ? r.weergave : 'catalogus' };
  } catch { return { wens: [], weergave: 'catalogus' }; }
};
const schrijfOpslag = (wens: string[], weergave: Weergave) => { try { localStorage.setItem(OPSLAG(), JSON.stringify({ wens, weergave })); } catch { /* opslag geblokkeerd: de pagina werkt zonder */ } };

type SuiteDienst = { id: string; granted?: boolean; status?: string };
const suiteSleutel = (id: string): string => {
  const s = id.toLowerCase();
  if (s.includes('gmail') || s === 'mail') return 'gmail';
  if (s.includes('drive')) return 'drive';
  if (s.includes('calendar') || s.includes('agenda')) return 'calendar';
  if (s.includes('photo') || s.includes('foto')) return 'photos';
  return '';
};

export default function Integraties({ lang, context, ssoActief, directories, mappen }: IntegratiesProps) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const begin = useMemo(leesOpslag, []);
  const [weergave, setWeergave] = useState<Weergave>(begin.weergave);
  const [zoek, setZoek] = useState('');
  const [cat, setCat] = useState<IntegratieCategorie | ''>('');
  const [methodes, setMethodes] = useState<IntegratieMethode[]>([]);
  const [status, setStatus] = useState<IntegratieStatus | ''>('');
  const [sorteer, setSorteer] = useState<Sortering>('aanbevolen');
  const [alleenWens, setAlleenWens] = useState(false);
  const [alleenPop, setAlleenPop] = useState(false);
  const [alleenNieuw, setAlleenNieuw] = useState(false);
  const [serverStand, setServerStand] = useState<ServerStand | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [wens, setWens] = useState<string[]>(begin.wens);
  const [suite, setSuite] = useState<SuiteDienst[] | null>(null);
  const [laden, setLaden] = useState(false);
  const [suiteFout, setSuiteFout] = useState(false);
  const zoekRef = useRef<HTMLInputElement>(null);
  const v2 = useCatalogusV2() === true;
  const [gelezenOp, setGelezenOp] = useState(0);
  const [suiteCode, setSuiteCode] = useState('');

  useEffect(() => { schrijfOpslag(wens, weergave); }, [wens, weergave]);

  // UI-013: de Google-stand komt uit de lichte route /integraties/google-stand (alleen lezen, geen externe probes). Pas als die
  // niet bestaat (oudere server) of faalt, valt de pagina terug op de diagnostiek zoals vroeger. De melding noemt nu de code.
  const leesStatus = useCallback(async (vanAnderTabblad = false) => {
    setLaden(true);
    let code = '';
    try {
      const g = (await api.post('/api/owner/admin/integraties/google-stand', context)).data as { ok?: boolean; services?: SuiteDienst[]; code?: string };
      if (g?.ok && Array.isArray(g.services)) { setSuite(g.services); setSuiteFout(false); }
      else throw Object.assign(new Error('x'), { code: g?.code || 'GOOGLE_STAND_ONLEESBAAR' });
    } catch (e1) {
      code = String((e1 as { code?: string }).code || 'GOOGLE_STAND_ROUTE_FOUT');
      try {
        const r = await api.post('/api/owner/admin/diagnostics', context);
        const lijst = (((r.data as Record<string, unknown>)?.googleSuite as Record<string, unknown>)?.services ?? []) as SuiteDienst[];
        setSuite(Array.isArray(lijst) ? lijst : []);
        setSuiteFout(false); code = '';
      } catch { setSuite(null); setSuiteFout(true); }
    }
    setSuiteCode(code);
    try { setServerStand((await api.post('/api/owner/admin/integraties/stand', context)).data as ServerStand); } catch { setServerStand(null); }
    setGelezenOp(Date.now());
    setLaden(false);
    // Andere open tabbladen van deze catalogus lezen de stand ook opnieuw (geen gegevens in het bericht, alleen «vernieuw»).
    if (!vanAnderTabblad) { try { const k = new BroadcastChannel('mr-integraties-stand'); k.postMessage({ soort: 'vernieuwd', op: Date.now() }); k.close(); } catch { /* geen BroadcastChannel */ } }
  }, [context]);
  // UI-013 fase 2: periodieke gezondheidscontrole (configuratiecontrole, geen externe aanroep) — hoogstens 1×/uur vanuit deze browser,
  // de server begrenst daarnaast op 1×/30 min per account. Alleen met de nieuwe catalogus (vlag).
  useEffect(() => {
    if (!v2) return;
    const sleutel = `tsv-integraties-periodiek:${weergaveScopeNu()}`;
    let vorige = 0; try { vorige = Number(localStorage.getItem(sleutel) || 0); } catch { /* geen opslag */ }
    if (Date.now() - vorige < 60 * 60 * 1000) return;
    try { localStorage.setItem(sleutel, String(Date.now())); } catch { /* geen opslag */ }
    void api.post('/api/owner/admin/integraties/controleer-alle', context).then((r) => { if ((r.data as { uitgevoerd?: boolean })?.uitgevoerd) void leesStatus(); }).catch(() => undefined);
  }, [v2]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let k: BroadcastChannel | null = null;
    try { k = new BroadcastChannel('mr-integraties-stand'); k.onmessage = (e) => { if ((e.data as { soort?: string })?.soort === 'vernieuwd') void leesStatus(true); }; } catch { k = null; }
    return () => { try { k?.close(); } catch { /* al dicht */ } };
  }, [leesStatus]);
  useEffect(() => { void leesStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Levende toestand per integratie: alleen wat de site werkelijk kan lezen; onbekend blijft onbekend (geen chip). */
  const levend = useCallback((i: Integratie): Levend | null => {
    const sv = serverStand?.levend?.[i.id];
    if (sv) return sv.toestand === 'verbonden' ? 'verbonden' : sv.toestand === 'ingesteld' ? 'ingesteld' : sv.toestand === 'fout' ? 'fout' : 'niet';
    const k = i.levend || '';
    if (['gmail', 'drive', 'calendar', 'photos'].includes(k)) {
      if (!suite) return null;
      const d = suite.find((x) => suiteSleutel(String(x.id)) === k);
      return d ? (d.granted ? 'verbonden' : 'niet') : null;
    }
    if (k === 'sso') return ssoActief ? 'verbonden' : 'niet';
    if (k.startsWith('dir:')) {
      const d = directories.find((x) => x.type === k.slice(4));
      if (!d) return 'niet';
      if (d.status === 'connected') return 'verbonden';
      return d.tenantId || d.baseUrl || d.credentialConfigured ? 'ingesteld' : 'niet';
    }
    return null;
  }, [suite, ssoActief, directories, serverStand]);

  const tellers = useMemo(() => {
    const per: Record<string, number> = {};
    for (const i of INTEGRATIES) per[i.cat] = (per[i.cat] || 0) + 1;
    return { per, klaar: INTEGRATIES.filter((i) => i.status === 'klaar').length, instellen: INTEGRATIES.filter((i) => i.status === 'instellen').length };
  }, []);

  const filtersActief = Boolean(zoek.trim() || cat || methodes.length || status || alleenWens || alleenPop || alleenNieuw);
  const resultaat = useMemo(() => {
    const q = normaal(zoek.trim());
    let lijst = INTEGRATIES.filter((i) => {
      if (cat && i.cat !== cat) return false;
      if (status && i.status !== status) return false;
      if (methodes.length && !methodes.every((m) => i.methoden.includes(m))) return false;
      if (alleenWens && !wens.includes(i.id)) return false;
      if (alleenPop && !POPULAIR.has(i.id)) return false;
      if (alleenNieuw && !NIEUW.has(i.id)) return false;
      if (!q) return true;
      const c = CATEGORIEEN.find((x) => x.id === i.cat)!;
      const hooi = normaal([i.naam, i.id, i.uk, i.nl, c.uk, c.nl, ...i.methoden.map((m) => METHODE_LABEL[m].join(' '))].join(' '));
      return q.split(/\s+/).every((w) => hooi.includes(w));
    });
    const volgorde = (a: Integratie, b: Integratie) => a.naam.localeCompare(b.naam, lang === 'uk' ? 'uk' : 'nl');
    const catIdx = (c: IntegratieCategorie) => CATEGORIEEN.findIndex((x) => x.id === c);
    lijst = [...lijst].sort(sorteer === 'naam' ? volgorde : sorteer === 'categorie' ? (a, b) => catIdx(a.cat) - catIdx(b.cat) || STATUS_RANG[a.status] - STATUS_RANG[b.status] || volgorde(a, b) : (a, b) => STATUS_RANG[a.status] - STATUS_RANG[b.status] || volgorde(a, b));
    return lijst;
  }, [zoek, cat, status, methodes, alleenWens, alleenPop, alleenNieuw, wens, sorteer, lang]);

  const wissen = () => { setZoek(''); setCat(''); setMethodes([]); setStatus(''); setAlleenWens(false); setAlleenPop(false); setAlleenNieuw(false); zoekRef.current?.focus(); };
  const wisselWens = (id: string) => setWens((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  const wisselMethode = (m: IntegratieMethode) => setMethodes((l) => (l.includes(m) ? l.filter((x) => x !== m) : [...l, m]));

  const href = (i: Integratie) => {
    const d = i.doel;
    if (!d || d.soort !== 'pagina') return '';
    try { return canonicalServiceUrl(d.dienst, d.tab, lang, true); } catch { return ''; }
  };
  const naarMappen = () => { setWeergave('mappen'); window.setTimeout(() => document.getElementById('il-mappen')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40); };

  const mijn = useMemo(() => INTEGRATIES.filter((i) => { const l = levend(i); return l === 'verbonden' || l === 'ingesteld'; }), [levend]);
  const wensLijst = useMemo(() => INTEGRATIES.filter((i) => wens.includes(i.id)), [wens]);

  const statusChip = (s: IntegratieStatus) => <span className='il-status' data-status={s}>{s === 'klaar' ? <CheckCircle2 aria-hidden /> : s === 'instellen' ? <Settings2 aria-hidden /> : <Clock3 aria-hidden />}{STATUS_LABEL[s][lang === 'uk' ? 0 : 1]}</span>;
  const levendChip = (i: Integratie) => {
    const l = levend(i);
    if (!l) return null;
    const tekst = l === 'verbonden' ? tr('Підключено', 'Gekoppeld') : l === 'fout' ? tr('Помилка підключення', 'Fout in koppeling') : l === 'ingesteld' ? tr('Налаштовано, не перевірено', 'Ingesteld, niet geverifieerd') : tr('Не підключено', 'Niet gekoppeld');
    return <span className='il-levend' data-levend={l}><i aria-hidden />{tekst}</span>;
  };

  const kaart = (i: Integratie) => {
    const link = href(i);
    const c = CATEGORIEEN.find((x) => x.id === i.cat)!;
    const op = wens.includes(i.id);
    return (
      <li key={i.id} className='il-kaart' data-integratie={i.id} data-status={i.status}>
        <div className='il-kop'>
          <Logo id={i.id} naam={i.naam} logo={i.logo} />
          <div className='il-titel'>
            <h3>{i.naam}</h3>
            <span className='il-cat'>{c[lang]}</span>
          </div>
          <button type='button' className='il-ster' aria-pressed={op} title={op ? tr('Прибрати з мого списку', 'Van mijn lijst halen') : tr('Додати до мого списку', 'Aan mijn lijst toevoegen')} aria-label={`${op ? tr('Прибрати з мого списку', 'Van mijn lijst halen') : tr('Додати до мого списку', 'Aan mijn lijst toevoegen')}: ${i.naam}`} onClick={() => wisselWens(i.id)}><Star aria-hidden /></button>
        </div>
        <p className='il-uitleg'>{i[lang]}</p>
        <div className='il-chips'>
          {statusChip(i.status)}
          {levendChip(i)}
          {i.methoden.map((m) => <span key={m} className='il-methode'>{METHODE_LABEL[m][lang === 'uk' ? 0 : 1]}</span>)}
          {serverStand?.beleid?.[i.id]?.voorGebruikers ? <span className='il-beschikbaar'><Users aria-hidden />{tr('Відкрито користувачам', 'Open voor gebruikers')}</span> : null}
        </div>
        <div className='il-acties'>
          {/* Audit 19.10.2026: een al gekoppelde dienst krijgt «Налаштувати» (zelfde pagina, waar ook loskoppelen staat), niet nog eens «Підключити». */}
          {i.status === 'klaar' && link ? <a className={`il-knop ${levend(i) === 'verbonden' ? '' : 'is-primair'}`} href={link} data-il-actie={levend(i) === 'verbonden' ? 'instellen' : 'koppelen'}>{levend(i) === 'verbonden' ? tr('Налаштувати', 'Instellen') : tr('Підключити', 'Koppelen')}<span className='il-sr'> — {i.naam}</span></a> : null}
          {i.status === 'instellen' && i.doel?.soort === 'directory' ? <button type='button' className='il-knop is-primair' onClick={naarMappen}>{tr('Налаштувати', 'Instellen')}<span className='il-sr'> — {i.naam}</span></button> : null}
          {i.status === 'binnenkort' ? <button type='button' className='il-knop' disabled aria-disabled='true' title={tr('Підключення ще не реалізоване — кнопка не працює свідомо', 'Deze koppeling bestaat nog niet — de knop is bewust uitgeschakeld')}>{tr('Скоро', 'Binnenkort')}</button> : null}
          <button type='button' className='il-knop is-tekst' onClick={() => setOpen(i.id)} aria-haspopup='dialog' title={tr('Докладніше: права, кроки, перевірка', 'Details: rechten, stappen, controle')}><Info aria-hidden /><span className='il-sr'>{tr('Докладніше', 'Details')} — {i.naam}</span></button>
          <a className='il-knop is-tekst' href={i.site} target='_blank' rel='noopener noreferrer' title={tr('Сайт сервісу (відкриється в новій вкладці)', 'Website van de dienst (opent in een nieuw tabblad)')}><ExternalLink aria-hidden /><span className='il-sr'>{tr('Сайт', 'Website')}: {i.naam}</span></a>
        </div>
      </li>
    );
  };

  const groepen = useMemo(() => {
    if (sorteer !== 'categorie') return [{ id: '', lijst: resultaat }];
    const kaartMap = new Map<string, Integratie[]>();
    for (const i of resultaat) kaartMap.set(i.cat, [...(kaartMap.get(i.cat) || []), i]);
    return [...kaartMap.entries()].map(([id, lijst]) => ({ id, lijst }));
  }, [resultaat, sorteer]);

  const tabs: Array<{ id: Weergave; uk: string; nl: string; n?: number }> = [
    { id: 'catalogus', uk: 'Каталог', nl: 'Catalogus', n: INTEGRATIES.length },
    { id: 'mijn', uk: 'Мої підключення', nl: 'Mijn koppelingen', n: mijn.length },
    { id: 'mappen', uk: 'Зовнішні каталоги', nl: 'Externe directory’s', n: directories.length },
    // 20.10.2026: «Майстер підключень» — OAuth-clients van Google, Microsoft en GitHub voor DEZE installatie (src/integraties/Wizard.tsx).
    { id: 'wizard', uk: 'Майстер підключень', nl: 'Koppelwizard' },
  ];

  return (
    <section className='il' data-integraties='v1'>
      <header className='il-hero'>
        <div>
          <span className='il-over'>{tr('Інтеграції', 'Integraties')}</span>
          <h2>{tr('Підключайте сервіси в один клік', 'Koppel diensten met één klik')}</h2>
          {v2 ? <p>{tr('Підключайте, перевіряйте й обслуговуйте сервіси. Стан кожного підключення береться із сервера; для ще не створених — чесний план.', 'Koppel, controleer en onderhoud diensten. De stand van elke koppeling komt van de server; voor wat nog niet gebouwd is staat een eerlijk plan.')}</p> : <p>{tr('Каталог сервісів, які можна підключити до вашого простору. Активна кнопка означає, що підключення справді працює на сайті; решта позначена чесно — «Скоро».', 'Catalogus van diensten die u aan uw ruimte kunt koppelen. Een actieve knop betekent dat de koppeling echt werkt op de site; de rest is eerlijk gemarkeerd — «Binnenkort».')}</p>}
        </div>
        <dl className='il-cijfers'>
          <div><dt>{tr('У каталозі', 'In de catalogus')}</dt><dd>{INTEGRATIES.length}</dd></div>
          <div><dt>{tr('Працюють', 'Werkend')}</dt><dd>{tellers.klaar + tellers.instellen}</dd></div>
          <div><dt>{tr('Підключено', 'Gekoppeld')}</dt><dd>{mijn.length}</dd></div>
        </dl>
      </header>

      <div className='il-tabs' role='tablist' aria-label={tr('Розділи інтеграцій', 'Onderdelen van integraties')}>
        {tabs.map((t) => (
          <button key={t.id} type='button' role='tab' id={`il-tab-${t.id}`} aria-selected={weergave === t.id} aria-controls={`il-paneel-${t.id}`} tabIndex={weergave === t.id ? 0 : -1} className={weergave === t.id ? 'is-actief' : ''}
            onClick={() => setWeergave(t.id)}
            onKeyDown={(e) => { const idx = tabs.findIndex((x) => x.id === t.id); const nxt = e.key === 'ArrowRight' ? tabs[(idx + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(idx + tabs.length - 1) % tabs.length] : null; if (nxt) { e.preventDefault(); setWeergave(nxt.id); document.getElementById(`il-tab-${nxt.id}`)?.focus(); } }}>
            {t[lang]}{typeof t.n === 'number' ? <b>{t.n}</b> : null}
          </button>
        ))}
        <button type='button' className='il-ververs' onClick={() => void leesStatus()} disabled={laden} title={tr('Оновити стан підключень', 'Status van koppelingen vernieuwen')}><RefreshCw className={laden ? 'spin' : ''} aria-hidden />{tr('Оновити стан', 'Status vernieuwen')}</button>
      </div>

      {suiteFout ? <p className='il-melding' role='status'>{tr('Стан Google-підключень зараз не вдалося прочитати — картки показують лише каталог.', 'De status van de Google-koppelingen kon nu niet worden gelezen — de kaarten tonen alleen de catalogus.')}{suiteCode ? <code> {suiteCode}</code> : null}</p> : null}

      {weergave === 'catalogus' && v2 ? (
        <div id='il-paneel-catalogus' role='tabpanel' aria-labelledby='il-tab-catalogus'>
          <CatalogusV2 lang={lang} levend={levend} stand={serverStand} href={href} wens={wens} onWens={wisselWens} onDetail={setOpen} onMappen={naarMappen} gelezenOp={gelezenOp} context={context} onVernieuw={() => void leesStatus()} />
        </div>
      ) : null}
      {weergave === 'catalogus' && !v2 ? (
        <div id='il-paneel-catalogus' role='tabpanel' aria-labelledby='il-tab-catalogus'>
          <div className='il-werkbalk'>
            <label className='il-zoek'>
              <Search aria-hidden />
              <span className='il-sr'>{tr('Пошук інтеграцій', 'Integraties zoeken')}</span>
              <input ref={zoekRef} type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Пошук: назва, категорія, спосіб…', 'Zoeken: naam, categorie, methode…')} autoComplete='off' />
              {zoek ? <button type='button' className='il-wis' onClick={() => { setZoek(''); zoekRef.current?.focus(); }} aria-label={tr('Очистити пошук', 'Zoekopdracht wissen')}><X aria-hidden /></button> : null}
            </label>
            <label className='il-sorteer'>
              <span>{tr('Сортування', 'Sorteren')}</span>
              <select data-hulp-vrij='sortering' value={sorteer} onChange={(e) => setSorteer(e.target.value as Sortering)}>
                <option value='aanbevolen'>{tr('Спершу доступні', 'Eerst beschikbaar')}</option>
                <option value='naam'>{tr('За назвою А–Я', 'Op naam A–Z')}</option>
                <option value='categorie'>{tr('За категоріями', 'Per categorie')}</option>
              </select>
            </label>
          </div>

          <div className='il-filters'>
            {/* 21.10.2026: 25 categorieën = 4170 px in 351 px; scrolde zonder hint → TabsRij als filtergroep (pijlen + vervaagde rand) */}
            <TabsRij navKlasse='il-groep' rol='group' lang={lang} label={tr('Категорія', 'Categorie')}>
              <button type='button' className={!cat ? 'is-actief' : ''} aria-pressed={!cat} onClick={() => setCat('')}><LayoutGrid aria-hidden />{tr('Усі', 'Alle')}<b>{INTEGRATIES.length}</b></button>
              {CATEGORIEEN.map((c) => { const Ico = ICONEN[c.icoon] || LayoutGrid; return (
                <button key={c.id} type='button' className={cat === c.id ? 'is-actief' : ''} aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}><Ico aria-hidden />{c[lang]}<b>{tellers.per[c.id] || 0}</b></button>
              ); })}
            </TabsRij>
            <div className='il-rij'>
              <div className='il-groep is-klein' role='group' aria-label={tr('Доступність', 'Beschikbaarheid')}>
                {(['', 'klaar', 'instellen', 'binnenkort'] as const).map((s) => (
                  <button key={s || 'alle'} type='button' className={status === s ? 'is-actief' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>{s ? STATUS_LABEL[s][lang === 'uk' ? 0 : 1] : tr('Будь-яка', 'Alle')}</button>
                ))}
              </div>
              <div className='il-groep is-klein' role='group' aria-label={tr('Спосіб підключення', 'Koppelmethode')}>
                {(Object.keys(METHODE_LABEL) as IntegratieMethode[]).map((m) => (
                  <button key={m} type='button' className={methodes.includes(m) ? 'is-actief' : ''} aria-pressed={methodes.includes(m)} onClick={() => wisselMethode(m)}>{METHODE_LABEL[m][lang === 'uk' ? 0 : 1]}</button>
                ))}
              </div>
              <button type='button' className={`il-wens${alleenPop ? ' is-actief' : ''}`} aria-pressed={alleenPop} onClick={() => setAlleenPop((v) => !v)}><TrendingUp aria-hidden />{tr('Популярні', 'Populair')}</button>
              <button type='button' className={`il-wens${alleenNieuw ? ' is-actief' : ''}`} aria-pressed={alleenNieuw} onClick={() => setAlleenNieuw((v) => !v)}><Sparkles aria-hidden />{tr('Нові', 'Nieuw')}</button>
              <button type='button' className={`il-wens${alleenWens ? ' is-actief' : ''}`} aria-pressed={alleenWens} onClick={() => setAlleenWens((v) => !v)}><Star aria-hidden />{tr('Мій список', 'Mijn lijst')}<b>{wens.length}</b></button>
              {filtersActief ? <button type='button' className='il-reset' onClick={wissen}><X aria-hidden />{tr('Скинути фільтри', 'Filters wissen')}</button> : null}
            </div>
          </div>

          <p className='il-teller' role='status' aria-live='polite'>{tr(`Знайдено: ${resultaat.length} із ${INTEGRATIES.length}`, `Gevonden: ${resultaat.length} van ${INTEGRATIES.length}`)}</p>

          {resultaat.length === 0 ? (
            <div className='il-leeg'>
              <Search aria-hidden />
              <strong>{tr('Нічого не знайдено', 'Niets gevonden')}</strong>
              <p>{alleenWens && !wens.length ? tr('Ваш список порожній: позначте зірочкою сервіси, які хочете бачити першими.', 'Uw lijst is leeg: markeer met de ster de diensten die u het eerst wilt zien.') : tr('Змініть запит або скиньте фільтри.', 'Pas de zoekopdracht aan of wis de filters.')}</p>
              <button type='button' className='il-knop' onClick={wissen}>{tr('Скинути фільтри', 'Filters wissen')}</button>
            </div>
          ) : groepen.map((g) => (
            <section key={g.id || 'alle'} className='il-sectie'>
              {g.id ? <h3 className='il-sectiekop'>{(() => { const c = CATEGORIEEN.find((x) => x.id === g.id)!; const Ico = ICONEN[c.icoon] || LayoutGrid; return <><Ico aria-hidden />{c[lang]}<small>{c.beschrijving[lang === 'uk' ? 0 : 1]}</small></>; })()}</h3> : null}
              <ul className='il-raster'>{g.lijst.map(kaart)}</ul>
            </section>
          ))}
          <p className='il-noot'>{tr('«Мій список» зберігається лише в цьому браузері й нічого не підключає — це закладки для вашого вибору. Логотипи належать їхнім власникам і використані лише для впізнавання (набір simple-icons, CC0).', '«Mijn lijst» wordt alleen in deze browser bewaard en koppelt niets — het zijn bladwijzers voor uw keuze. Logo’s zijn van hun eigenaars en dienen alleen voor herkenning (simple-icons, CC0).')}</p>
        </div>
      ) : null}

      {weergave === 'mijn' ? (
        <div id='il-paneel-mijn' role='tabpanel' aria-labelledby='il-tab-mijn' className='il-mijn'>
          <h3>{tr('Підключено зараз', 'Nu gekoppeld')}</h3>
          {mijn.length ? <ul className='il-raster'>{mijn.map(kaart)}</ul> : (
            <div className='il-leeg'>
              <Zap aria-hidden />
              <strong>{tr('Поки що нічого не підключено', 'Er is nog niets gekoppeld')}</strong>
              <p>{tr('Тут показується стан Google (Пошта, Диск, Календар, Фото), єдиного входу та зовнішніх каталогів. Стан решти підключень видно на їхніх сторінках.', 'Hier staat de status van Google (E-mail, Drive, Agenda, Foto’s), eenmalige aanmelding en externe directory’s. De status van de overige koppelingen ziet u op hun eigen pagina.')}</p>
              <button type='button' className='il-knop is-primair' onClick={() => setWeergave('catalogus')}>{tr('Відкрити каталог', 'Catalogus openen')}</button>
            </div>
          )}
          <h3>{tr('Мій список бажань', 'Mijn verlanglijst')}</h3>
          {wensLijst.length ? <ul className='il-raster'>{wensLijst.map(kaart)}</ul> : <p className='il-noot'>{tr('Список порожній. Позначте зірочкою сервіси в каталозі.', 'De lijst is leeg. Markeer diensten in de catalogus met de ster.')}</p>}
        </div>
      ) : null}

      {weergave === 'mappen' ? (
        <div id='il-mappen' role='tabpanel' aria-labelledby='il-tab-mappen' className='il-mappen'>{mappen}</div>
      ) : null}

      {weergave === 'wizard' ? (
        <div id='il-paneel-wizard' role='tabpanel' aria-labelledby='il-tab-wizard'><Wizard lang={lang} context={context} onGewijzigd={() => void leesStatus()} />{/* 21.10.2026: officiële logo's van de beheerder i.p.v. nagetekende */}<MerkEigenBeheer lang={lang} context={context} /><LokaleGenerator lang={lang} context={context} /><MerkBronBeheer lang={lang} context={context} /></div>
      ) : null}

      {open ? (() => {
        const i = INTEGRATIES.find((x) => x.id === open);
        if (!i) return null;
        return <Detail i={i} lang={lang} context={context} stand={serverStand} levend={levend(i)} href={href(i)} onClose={() => setOpen(null)} onVernieuw={() => void leesStatus()} onMappen={() => { setOpen(null); naarMappen(); }} />;
      })() : null}
    </section>
  );
}
