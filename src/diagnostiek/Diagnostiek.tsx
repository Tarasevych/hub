// Admin → «Діагностика» (/diagnostiek). Boven: wat aandacht nodig heeft; daaronder tabbladen per categorie met controles die de beheerder
// zelf kan starten (alleen lezen), uitleg bij elke controle en een bewaarde geschiedenis van storingen.
// Eerlijkheid: een controle die nooit is uitgevoerd toont «Не перевірено», nooit een groen vinkje.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, BookOpen, Check, ChevronDown, CircleHelp, Clock, Cloud, Code2, Cpu, Database, FileText, GitBranch, Globe, HardDrive, History, Home,
  ExternalLink, KeyRound, Layers, Loader2, Lock, Mail, MemoryStick, Monitor, Package, Play, Plug, RefreshCw, Rocket, ScrollText, Search, Server, Settings, ShieldCheck, Sparkles, Timer, UserRound, Users, Wrench, X, XCircle,
} from 'lucide-react';
import RenderingKnop from './RenderingKnop'; // zone A 22.10: «Перевірити рендеринг» bij pagina-rendering
import { api } from '../platform/client';
import {
  CATEGORIEEN, CONTROLES, STAND_TEKST, aandacht, aandachtTellers, codeUitleg, controlesVan, leeftijd, totaal,
  type CategorieId, type ControleDef, type Historie, type Stand, type Toestand,
} from '../../shared/beheer-diagnostiek';
import { STAND_KLEUR, filterControles, foutTekst, normaliseer, tekstUit, type Lang, type Overzicht, type StandFilter } from './hulp';
import GebruikerTab from './GebruikerTab';
import AccountTabel from './AccountTabel';
import Beveiliging from '../beveiliging/Beveiliging';
import TrendBlok from './Trend';
import './diagnostiek.css';
import TabsRij from '../ontwerp/TabsRij';
import './diagnostiek-maquette.css';

const ICONEN: Record<string, typeof Server> = {
  layers: Layers, globe: Globe, plug: Plug, database: Database, server: Server, shield: ShieldCheck, clock: Clock, home: Home, mail: Mail, sparkles: Sparkles,
  key: KeyRound, code: Code2, settings: Settings, cloud: Cloud, git: GitBranch, file: FileText, package: Package, activity: Activity, disk: HardDrive, memory: MemoryStick,
  cpu: Cpu, lock: Lock, scroll: ScrollText, timer: Timer, rocket: Rocket, monitor: Monitor, search: Search,
};
// Merkkleur per dienst: herkenbaar op een blik (geen externe afbeeldingen = niets extra te laden).
const MERK: Record<string, string> = {
  hub: '#6366f1', mail: '#ea4335', ai: '#a855f7', id: '#0ea5e9', api: '#14b8a6', admin: '#f97316', mcp: '#d97706', cloud: '#38bdf8', github: '#8b949e', google: '#4285f4',
};
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const loc = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-BE');
const tijd = (lang: Lang, ms: number) => (ms ? new Date(ms).toLocaleString(loc(lang), { dateStyle: 'short', timeStyle: 'medium' }) : '—');

function Logo({ def, groot }: { def: ControleDef; groot?: boolean }) {
  const kleur = (def.host && MERK[def.host]) || (def.icoon === 'google' ? MERK.google : '');
  const I = ICONEN[def.icoon] || Activity;
  return (
    <span className={`adg-logo${groot ? ' adg-logo-groot' : ''}`} style={kleur ? ({ '--adg-merk': kleur } as React.CSSProperties) : undefined} data-merk={kleur ? '1' : '0'} aria-hidden='true'>
      {def.icoon === 'google' ? <b>G</b> : <I />}
    </span>
  );
}

function StandIcoon({ stand }: { stand: Stand | 'nooit' }) {
  return stand === 'ok' ? <Check /> : stand === 'fout' ? <XCircle /> : stand === 'let-op' ? <AlertTriangle /> : <CircleHelp />;
}
function Pil({ stand, lang }: { stand: Stand | 'nooit' | 'hersteld'; lang: Lang }) {
  if (stand === 'hersteld') return <span className='adg-pil' data-stand='ok'><Check />{tr(lang, 'Відновлено', 'Hersteld')}</span>; // A9: geen «Увага» op een kaart die nu werkt
  return <span className='adg-pil' data-stand={stand}><StandIcoon stand={stand} />{tekstUit(lang, STAND_TEKST[stand])}</span>;
}

type TabId = 'alle' | CategorieId | 'historie' | 'gebruiker' | 'account' | 'tech' | 'zekering';

export default function Diagnostiek({ lang, sourceOrigin, tabContext, techniek }: { lang: Lang; sourceOrigin: string; tabContext: string; techniek?: ReactNode }) {
  const [data, setData] = useState<Overzicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState<{ soort: 'ok' | 'let-op' | 'fout'; tekst: string } | null>(null);
  const [bezig, setBezig] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<TabId>('alle');
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState<StandFilter>('alles');
  const [open, setOpen] = useState<string | null>(null);
  const [nu, setNu] = useState(Date.now());
  const ctx = useMemo(() => ({ service: 'admin', sourceOrigin, tabContext }), [sourceOrigin, tabContext]);
  const bezigRef = useRef(false);

  useEffect(() => { const t = window.setInterval(() => setNu(Date.now()), 20_000); return () => window.clearInterval(t); }, []);

  const laad = useCallback(async () => {
    setLaden(true);
    try { const r = await api.post('/api/owner/admin/diagnostiek/overzicht', ctx); setData(normaliseer(r.data)); setFout(''); }
    catch (e) { setFout(foutTekst(lang, e)); }
    setLaden(false);
  }, [ctx, lang]);
  useEffect(() => { void laad(); }, [laad]);

  const toestanden = data?.toestanden ?? {};

  const voerUit = useCallback(async (ids: string[], body: Record<string, unknown>, label: string) => {
    if (bezigRef.current || !ids.length) return;
    bezigRef.current = true; setBezig(new Set(ids)); setMelding(null);
    try {
      const r = await api.post('/api/owner/admin/diagnostiek/uitvoeren', { ...ctx, ...body });
      const nieuw = normaliseer(r.data); setData(nieuw);
      const slecht = ids.filter((id) => { const s = nieuw.toestanden[id]?.laatste?.stand; return s === 'fout' || s === 'let-op'; }).length;
      setMelding(slecht
        ? { soort: 'let-op', tekst: tr(lang, `${label}: перевірено ${ids.length}, потребують уваги — ${slecht}.`, `${label}: ${ids.length} gecontroleerd, aandacht nodig — ${slecht}.`) }
        : { soort: 'ok', tekst: tr(lang, `${label}: перевірено ${ids.length}, усе в порядку.`, `${label}: ${ids.length} gecontroleerd, alles in orde.`) });
    } catch (e) { setMelding({ soort: 'fout', tekst: foutTekst(lang, e) }); }
    bezigRef.current = false; setBezig(new Set());
  }, [ctx, lang]);

  const een = (d: ControleDef) => voerUit([d.id], { ids: [d.id] }, tekstUit(lang, d.naam));
  const cat = (c: CategorieId) => voerUit(controlesVan(c).map((d) => d.id), { categorie: c }, tekstUit(lang, CATEGORIEEN.find((x) => x.id === c)!.naam));
  const alles = () => voerUit(CONTROLES.map((d) => d.id), { alles: true }, tr(lang, 'Усі перевірки', 'Alle controles'));

  const lijst = useMemo(() => aandacht(toestanden), [toestanden]);
  const som = useMemo(() => totaal(toestanden), [toestanden]);
  const aTel = useMemo(() => aandachtTellers(lijst), [lijst]); // A9: aTel.nu === som.fout + som['let-op'] + som.onbekend
  const totaalN = CONTROLES.length;

  const naarHistorie = (id: string) => { setHistFilter((f) => ({ ...f, controle: id, stand: 'alles' })); setTab('historie'); };
  const [histFilter, setHistFilter] = useState<{ stand: 'problemen' | 'alles'; categorie: string; controle: string }>({ stand: 'problemen', categorie: '', controle: '' });

  if (laden && !data) return <section className='admin-section adg-root mq-accent-emerald' aria-busy='true'><p className='adg-laden'><Loader2 className='adg-spin' />{tr(lang, 'Завантажуємо діагностику…', 'Diagnostiek wordt geladen…')}</p></section>;

  const aandachtBlok = (
    <section className='adg-aandacht' data-adg-aandacht data-leeg={lijst.length === 0 ? '1' : '0'} aria-labelledby='adg-aandacht-kop'>
      <header>
        <h3 id='adg-aandacht-kop'><AlertTriangle />{tr(lang, 'Потребує уваги', 'Heeft aandacht nodig')}{aTel.nu > 0 && <b>{aTel.nu}</b>}{aTel.hersteld > 0 && <em className='adg-aandacht-hersteld'>{tr(lang, `+ ${aTel.hersteld} нещодавно відновлено`, `+ ${aTel.hersteld} recent hersteld`)}</em>}</h3>
        {lijst.length > 0 && <small>{tr(lang, 'Спочатку збої, потім попередження; нижче — що нещодавно падало, але вже працює.', 'Eerst storingen, dan waarschuwingen; daaronder wat recent faalde maar nu werkt.')}</small>}
      </header>
      {lijst.length === 0
        ? <p className='adg-aandacht-leeg'>
            {som.nooit === totaalN
              ? tr(lang, 'Ще нічого не перевірено. Натисніть «Перевірити все» — і тут з’являться лише ті сервіси, яким потрібна увага.', 'Er is nog niets gecontroleerd. Druk op «Alles controleren» — hier verschijnt alleen wat aandacht nodig heeft.')
              : tr(lang, `Усе, що перевірялось, працює${som.nooit ? ` (ще не перевірено: ${som.nooit})` : ''}.`, `Alles wat is gecontroleerd werkt${som.nooit ? ` (nog niet gecontroleerd: ${som.nooit})` : ''}.`)}
          </p>
        : <ul>{lijst.map((a) => {
            const def = CONTROLES.find((c) => c.id === a.id)!;
            const u = a.uitslag, uit = codeUitleg(u.code);
            return (
              <li key={a.id} data-stand={a.reden === 'hersteld' ? 'hersteld' : a.stand} data-adg-aandacht-item={a.id}>
                <Logo def={def} />
                <div className='adg-a-tekst'>
                  <strong>{tekstUit(lang, def.naam)}</strong>
                  <span>
                    {a.reden === 'hersteld'
                      ? tr(lang, `Нещодавно падало (${toestanden[a.id]?.fouten24} з ${toestanden[a.id]?.uitvoeringen24} перевірок за добу), зараз працює.`, `Faalde recent (${toestanden[a.id]?.fouten24} van ${toestanden[a.id]?.uitvoeringen24} controles in 24 u), werkt nu.`)
                      : uit ? tekstUit(lang, uit.reden) : u.detail || tekstUit(lang, STAND_TEKST[a.stand])}
                  </span>
                  <small>
                    {a.reden === 'nu' && <>{tr(lang, 'Не працює з', 'Fout sinds')} {tijd(lang, a.sinds)} · </>}
                    {tr(lang, 'остання успішна', 'laatste succes')}: {toestanden[a.id]?.laatsteSucces ? leeftijd(toestanden[a.id]!.laatsteSucces, nu, lang) : tr(lang, 'ніколи', 'nooit')}
                  </small>
                </div>
                <Pil stand={a.reden === 'hersteld' ? 'hersteld' : a.stand} lang={lang} />
                <div className='adg-a-knoppen'>
                  <button type='button' className='adg-knop' disabled={bezig.size > 0} onClick={() => void een(def)}>{bezig.has(a.id) ? <Loader2 className='adg-spin' /> : <RefreshCw />}{tr(lang, 'Перевірити знову', 'Opnieuw controleren')}</button>
                  <button type='button' className='adg-knop adg-knop-stil' onClick={() => { setTab(def.cat); setOpen(a.id); window.setTimeout(() => document.querySelector(`[data-adg-check="${a.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }}><Wrench />{tr(lang, 'Як виправити', 'Hoe oplossen')}</button>
                </div>
              </li>
            );
          })}</ul>}
    </section>
  );

  const tabs: Array<{ id: TabId; naam: string; icoon: typeof Server; stand?: Stand | 'nooit'; teller?: string }> = [
    { id: 'alle', naam: tr(lang, 'Усе', 'Alles'), icoon: Layers, stand: som.stand, teller: `${totaalN - som.nooit}/${totaalN}` },
    ...CATEGORIEEN.map((c) => { const t = totaal(toestanden, controlesVan(c.id).map((d) => d.id)); return { id: c.id as TabId, naam: tekstUit(lang, c.naam), icoon: ICONEN[c.icoon] || Activity, stand: t.stand, teller: `${t.totaal - t.nooit}/${t.totaal}` }; }),
    { id: 'historie', naam: tr(lang, 'Історія збоїв', 'Storingsgeschiedenis'), icoon: History },
    { id: 'account', naam: tr(lang, 'Для всіх / цей акаунт', 'Iedereen / dit account'), icoon: Users },
    { id: 'gebruiker', naam: tr(lang, 'Скарга користувача', 'Klacht van gebruiker'), icoon: UserRound },
    { id: 'zekering', naam: tr(lang, 'Захист', 'Bescherming'), icoon: Lock },
    ...(techniek ? [{ id: 'tech' as TabId, naam: tr(lang, 'Технічні дані', 'Technische gegevens'), icoon: Wrench }] : []),
  ];

  const toonCats = tab === 'alle' ? CATEGORIEEN : CATEGORIEEN.filter((c) => c.id === tab);

  return (
    <section className='admin-section adg-root mq-accent-emerald' data-adg-root data-admin-diagnostics>
      <header className='adg-kop'>
        <span className='adg-kop-ico'><Activity /></span>
        <div>
          <h2>{tr(lang, 'Діагностика', 'Diagnostiek')}</h2>
          <p>{tr(lang, 'Швидко перевірте, що працює, а що ні: сервіси, сторінки, підключення, база, сервер, мережа й фонові завдання. Усі перевірки лише читають і нічого не змінюють.', 'Controleer snel wat werkt en wat niet: diensten, pagina’s, koppelingen, database, server, netwerk en achtergrondtaken. Alle controles lezen alleen en wijzigen niets.')}</p>
        </div>
        <div className='adg-kop-knoppen'>
          <button type='button' className='adg-knop adg-knop-hoofd' data-adg-run-all disabled={bezig.size > 0} onClick={() => void alles()}>
            {bezig.size > 0 ? <Loader2 className='adg-spin' /> : <Play />}{bezig.size > 1 ? tr(lang, `Перевіряємо… (${bezig.size})`, `Bezig… (${bezig.size})`) : tr(lang, 'Перевірити все', 'Alles controleren')}
          </button>
          <button type='button' className='adg-knop' disabled={laden || bezig.size > 0} onClick={() => void laad()} title={tr(lang, 'Лише перечитати збережені результати', 'Alleen de bewaarde resultaten opnieuw lezen')}>{laden ? <Loader2 className='adg-spin' /> : <RefreshCw />}{tr(lang, 'Оновити', 'Vernieuwen')}</button>
        </div>
      </header>

      {fout && <p className='adg-melding' data-soort='fout' role='alert'>{fout}</p>}
      {melding && <p className='adg-melding' data-soort={melding.soort} role='status'>{melding.tekst}<button type='button' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={() => setMelding(null)}><X /></button></p>}

      <div className='adg-samenvatting' role='group' aria-label={tr(lang, 'Загальний стан', 'Algemene toestand')}>
        {([['fout', som.fout], ['let-op', som['let-op']], ['ok', som.ok], ['onbekend', som.onbekend], ['nooit', som.nooit]] as Array<[Stand | 'nooit', number]>).map(([s, n]) => (
          <div key={s} data-stand={s} data-adg-teller={s}><b>{n}</b><span>{tekstUit(lang, STAND_TEKST[s])}</span></div>
        ))}
        <i className='adg-balk' aria-hidden='true'>{(['ok', 'let-op', 'fout', 'onbekend', 'nooit'] as const).map((s) => (som[s] ? <u key={s} style={{ flex: som[s], background: STAND_KLEUR[s], opacity: s === 'nooit' ? 0.35 : 1 }} /> : null))}</i>
      </div>

      {aandachtBlok}

      {/* 21.10.2026: 3029 px tabbladen in 633 px (768) scrolden zonder hint → TabsRij (vervaagde rand + pijlen) */}
      <TabsRij navKlasse='adg-tabs' lang={lang} label={tr(lang, 'Категорії діагностики', 'Diagnostiekcategorieën')}>
        {tabs.map((t) => {
          const I = t.icoon;
          return (
            <button key={t.id} type='button' role='tab' aria-selected={tab === t.id} data-adg-tab={t.id} className={tab === t.id ? 'actief' : ''} onClick={() => setTab(t.id)}>
              <I />{t.naam}
              {t.stand && <i className='adg-punt' data-stand={t.stand} aria-hidden='true' />}
              {t.teller && <small>{t.teller}</small>}
            </button>
          );
        })}
      </TabsRij>

      {tab === 'tech' && techniek}
      {tab === 'zekering' && <Beveiliging lang={lang} ctx={ctx} />}
      {tab === 'account' && <AccountTabel lang={lang} ctx={ctx} />}
      {tab === 'historie' && data && <TrendBlok lang={lang} trend={data.trend} />}
      {tab === 'historie' && <HistorieTab lang={lang} ctx={ctx} filter={histFilter} setFilter={setHistFilter} startRijen={data?.historie ?? []} nu={nu} />}
      {tab === 'gebruiker' && <GebruikerTab lang={lang} ctx={ctx} openCategorie={(dienst) => { setTab('diensten'); setOpen(`dienst-${dienst}`); window.setTimeout(() => document.querySelector(`[data-adg-check="dienst-${dienst}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }} />}

      {tab !== 'tech' && tab !== 'historie' && tab !== 'gebruiker' && tab !== 'account' && tab !== 'zekering' && (
        <>
          <div className='adg-gereedschap'>
            <label className='adg-zoek'>
              <Search aria-hidden='true' />
              <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук: сервіс, сторінка, код помилки…', 'Zoeken: dienst, pagina, foutcode…')} aria-label={tr(lang, 'Пошук серед перевірок', 'Zoeken in controles')} />
              {zoek && <button type='button' aria-label={tr(lang, 'Очистити пошук', 'Zoekopdracht wissen')} onClick={() => setZoek('')}><X /></button>}
            </label>
            <div className='adg-chips' role='group' aria-label={tr(lang, 'Фільтр за станом', 'Filter op toestand')}>
              {([['alles', tr(lang, 'Усі', 'Alle')], ['problemen', tr(lang, 'Проблеми', 'Problemen')], ['ok', tr(lang, 'Справні', 'In orde')], ['nooit', tr(lang, 'Не перевірені', 'Niet gecontroleerd')]] as Array<[StandFilter, string]>).map(([f, naam]) => (
                <button key={f} type='button' className={filter === f ? 'actief' : ''} aria-pressed={filter === f} data-adg-filter={f} onClick={() => setFilter(f)}>{naam}</button>
              ))}
            </div>
          </div>

          {toonCats.map((c) => {
            const defs = filterControles(controlesVan(c.id), { cat: c.id, zoek, filter, toestanden, lang });
            if (!defs.length && (zoek || filter !== 'alles')) return null;
            const t = totaal(toestanden, controlesVan(c.id).map((d) => d.id));
            const I = ICONEN[c.icoon] || Activity;
            return (
              <section key={c.id} className='adg-cat' data-adg-cat={c.id} aria-labelledby={`adg-cat-${c.id}`}>
                <header>
                  <span className='adg-cat-ico' data-stand={t.stand}><I /></span>
                  <div>
                    <h3 id={`adg-cat-${c.id}`}>{tekstUit(lang, c.naam)}</h3>
                    <p>{tekstUit(lang, c.wat)}</p>
                    {tab === c.id && <p className='adg-cat-waarom'><BookOpen />{tekstUit(lang, c.waarom)}</p>}
                  </div>
                  <button type='button' className='adg-knop' disabled={bezig.size > 0} onClick={() => void cat(c.id)}>
                    {controlesVan(c.id).some((d) => bezig.has(d.id)) ? <Loader2 className='adg-spin' /> : <Play />}{tr(lang, 'Перевірити категорію', 'Categorie controleren')}
                  </button>
                </header>
                <div className='adg-rooster'>
                  {defs.map((d) => <ControleKaart key={d.id} def={d} lang={lang} toestand={toestanden[d.id]} nu={nu} open={open === d.id} bezig={bezig.has(d.id)} blokkeer={bezig.size > 0}
                    onOpen={() => setOpen((o) => (o === d.id ? null : d.id))} onRun={() => void een(d)} onHistorie={() => naarHistorie(d.id)}
                    extra={d.id === 'pagina-rendering' ? <RenderingKnop lang={lang} ctx={ctx} /> : undefined} />)}
                </div>
              </section>
            );
          })}
          {toonCats.every((c) => !filterControles(controlesVan(c.id), { cat: c.id, zoek, filter, toestanden, lang }).length) && (
            <p className='adg-leeg' data-adg-leeg>{tr(lang, 'Нічого не знайдено за цим фільтром.', 'Niets gevonden met dit filter.')}<button type='button' className='adg-knop adg-knop-stil' onClick={() => { setZoek(''); setFilter('alles'); }}>{tr(lang, 'Скинути фільтр', 'Filter wissen')}</button></p>
          )}
        </>
      )}
    </section>
  );
}

function ControleKaart({ def, lang, toestand, nu, open, bezig, blokkeer, onOpen, onRun, onHistorie, extra }: {
  def: ControleDef; lang: Lang; toestand?: Toestand; nu: number; open: boolean; bezig: boolean; blokkeer: boolean; onOpen: () => void; onRun: () => void; onHistorie: () => void; extra?: ReactNode;
}) {
  const u = toestand?.laatste ?? null;
  const stand: Stand | 'nooit' = u ? u.stand : 'nooit';
  const uit = u ? codeUitleg(u.code) : null;
  const slecht = u && u.stand !== 'ok';
  return (
    <article className='adg-kaart' data-stand={stand} data-adg-check={def.id} data-open={open ? '1' : '0'}>
      <button type='button' className='adg-kaart-kop' aria-expanded={open} aria-controls={`adg-d-${def.id}`} onClick={onOpen}>
        <Logo def={def} />
        <span className='adg-kaart-tekst'>
          <strong>{tekstUit(lang, def.naam)}</strong>
          <small>
            {u ? <>{leeftijd(u.op, nu, lang)}{u.ms ? ` · ${u.ms} ${tr(lang, 'мс', 'ms')}` : ''}</> : tr(lang, 'Ще не перевірялось', 'Nog niet gecontroleerd')}
          </small>
        </span>
        <Pil stand={stand} lang={lang} />
        <ChevronDown className='adg-pijl' aria-hidden='true' />
      </button>
      {u && (u.detail || uit) && !open && <p className='adg-kaart-samenvatting'>{slecht && uit ? tekstUit(lang, uit.reden) : u.detail}</p>}
      <div className='adg-kaart-voet'>
        <button type='button' className='adg-knop adg-knop-klein' disabled={blokkeer} onClick={onRun}>{bezig ? <Loader2 className='adg-spin' /> : <RefreshCw />}{u ? tr(lang, 'Перевірити', 'Controleren') : tr(lang, 'Перевірити вперше', 'Eerste controle')}</button>
      </div>
      {open && (
        <div className='adg-details' id={`adg-d-${def.id}`}>
          <dl>
            <div><dt>{tr(lang, 'Що це', 'Wat is dit')}</dt><dd>{tekstUit(lang, def.wat)}</dd></div>
            <div><dt>{tr(lang, 'Навіщо це тут', 'Waarom staat dit hier')}</dt><dd>{tekstUit(lang, def.waarom)}</dd></div>
            <div>
              <dt>{tr(lang, 'Результат', 'Resultaat')}</dt>
              <dd>
                {u ? <>
                  <Pil stand={stand} lang={lang} /> <span className='adg-meta'>{tijd(lang, u.op)}{u.ms ? ` · ${u.ms} ${tr(lang, 'мс', 'ms')}` : ''}</span>
                  {u.detail && <span className='adg-detail'>{u.detail}</span>}
                  {uit && slecht && <span className='adg-reden'><b>{tr(lang, 'Причина:', 'Oorzaak:')}</b> {tekstUit(lang, uit.reden)}{uit.extra ? ` ${tekstUit(lang, uit.extra)}` : ''}</span>}
                  {u.code && <code className='adg-code'>{u.code}</code>}
                </> : <span className='adg-niet'>{tr(lang, 'Цю перевірку ще не запускали — тому стану немає. Натисніть «Перевірити вперше».', 'Deze controle is nog niet gestart — dus er is geen toestand. Druk op «Eerste controle».')}</span>}
              </dd>
            </div>
            <div><dt>{tr(lang, 'Остання успішна', 'Laatste succes')}</dt><dd>{toestand?.laatsteSucces ? `${tijd(lang, toestand.laatsteSucces)} (${leeftijd(toestand.laatsteSucces, nu, lang)})` : tr(lang, 'ще ніколи', 'nog nooit')}</dd></div>
            {toestand && toestand.uitvoeringen24 > 0 && <div><dt>{tr(lang, 'За останні 24 год', 'Laatste 24 uur')}</dt><dd>{tr(lang, `${toestand.fouten24} збоїв із ${toestand.uitvoeringen24} перевірок`, `${toestand.fouten24} storingen in ${toestand.uitvoeringen24} controles`)}</dd></div>}
            {toestand?.door && <div><dt>{tr(lang, 'Запустив', 'Gestart door')}</dt><dd>{toestand.door}</dd></div>}
          </dl>
          <div className='adg-fix' data-prominent={slecht ? '1' : '0'}>
            <h4><Wrench />{slecht ? tr(lang, 'Як виправити', 'Hoe op te lossen') : tr(lang, 'Якщо це зламається', 'Als dit kapotgaat')}</h4>
            <ol>{def.oplossing.map((s, i) => <li key={i}>{tekstUit(lang, s)}</li>)}</ol>
          </div>
          <p className='adg-hoe'><CircleHelp />{tr(lang, 'Як перевіряється: ', 'Zo wordt het gecontroleerd: ')}{tekstUit(lang, def.hoe)}</p>
          <div className='adg-details-knoppen'>
            <button type='button' className='adg-knop' disabled={blokkeer} onClick={onRun}>{bezig ? <Loader2 className='adg-spin' /> : <RefreshCw />}{tr(lang, 'Перевірити зараз', 'Nu controleren')}</button>
            <button type='button' className='adg-knop adg-knop-stil' onClick={onHistorie}><History />{tr(lang, 'Історія цієї перевірки', 'Geschiedenis van deze controle')}</button>
            {def.naar && <a className='adg-knop adg-knop-stil' href={def.naar.href} data-adg-naar={def.id}><ExternalLink />{tekstUit(lang, def.naar.label)}</a>}
          </div>
          {extra}
        </div>
      )}
    </article>
  );
}

function HistorieTab({ lang, ctx, filter, setFilter, startRijen, nu }: {
  lang: Lang; ctx: Record<string, unknown>; filter: { stand: 'problemen' | 'alles'; categorie: string; controle: string };
  setFilter: (f: (o: { stand: 'problemen' | 'alles'; categorie: string; controle: string }) => { stand: 'problemen' | 'alles'; categorie: string; controle: string }) => void;
  startRijen: Historie[]; nu: number;
}) {
  const [rijen, setRijen] = useState<Historie[]>(startRijen);
  const [meer, setMeer] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const eerste = useRef(true);

  const haal = useCallback(async (voor?: number) => {
    setBezig(true);
    try {
      const r = await api.post('/api/owner/admin/diagnostiek/historie', { ...ctx, stand: filter.stand, categorie: filter.categorie || undefined, controle: filter.controle || undefined, voor, limit: 50 });
      const lijst = normaliseer({ historie: (r.data as { historie?: unknown }).historie }).historie;
      setRijen((o) => (voor ? [...o, ...lijst] : lijst)); setMeer(lijst.length >= 50); setFout('');
    } catch (e) { setFout(foutTekst(lang, e)); }
    setBezig(false);
  }, [ctx, filter, lang]);
  useEffect(() => { if (eerste.current && !filter.controle && !filter.categorie && filter.stand === 'problemen') { eerste.current = false; setMeer(startRijen.length >= 60); return; } eerste.current = false; void haal(); }, [filter.stand, filter.categorie, filter.controle, haal, startRijen.length]);

  return (
    <section className='adg-historie' data-adg-historie>
      <div className='adg-gereedschap'>
        <div className='adg-chips' role='group' aria-label={tr(lang, 'Фільтр історії', 'Filter geschiedenis')}>
          <button type='button' className={filter.stand === 'problemen' ? 'actief' : ''} aria-pressed={filter.stand === 'problemen'} onClick={() => setFilter((f) => ({ ...f, stand: 'problemen' }))}>{tr(lang, 'Лише збої й попередження', 'Alleen storingen en waarschuwingen')}</button>
          <button type='button' className={filter.stand === 'alles' ? 'actief' : ''} aria-pressed={filter.stand === 'alles'} onClick={() => setFilter((f) => ({ ...f, stand: 'alles' }))}>{tr(lang, 'Усі запуски', 'Alle uitvoeringen')}</button>
        </div>
        <select data-hulp-vrij='filter' aria-label={tr(lang, 'Категорія', 'Categorie')} value={filter.categorie} onChange={(e) => setFilter((f) => ({ ...f, categorie: e.target.value, controle: '' }))}>
          <option value=''>{tr(lang, 'Усі категорії', 'Alle categorieën')}</option>
          {CATEGORIEEN.map((c) => <option key={c.id} value={c.id}>{tekstUit(lang, c.naam)}</option>)}
        </select>
        <select data-hulp-vrij='filter' aria-label={tr(lang, 'Перевірка', 'Controle')} value={filter.controle} onChange={(e) => setFilter((f) => ({ ...f, controle: e.target.value }))}>
          <option value=''>{tr(lang, 'Усі перевірки', 'Alle controles')}</option>
          {CONTROLES.filter((c) => !filter.categorie || c.cat === filter.categorie).map((c) => <option key={c.id} value={c.id}>{tekstUit(lang, c.naam)}</option>)}
        </select>
      </div>
      {fout && <p className='adg-melding' data-soort='fout' role='alert'>{fout}</p>}
      {!rijen.length && !bezig
        ? <p className='adg-leeg'>{filter.stand === 'problemen' ? tr(lang, 'Збоїв не зафіксовано — або перевірок ще не запускали.', 'Geen storingen vastgelegd — of er zijn nog geen controles gestart.') : tr(lang, 'Записів немає.', 'Geen records.')}</p>
        : <ol className='adg-hist-lijst'>{rijen.map((h) => {
            const def = CONTROLES.find((c) => c.id === h.id); const uit = codeUitleg(h.code);
            return (
              <li key={h.nr} data-stand={h.stand} data-adg-hist={h.nr}>
                {def && <Logo def={def} />}
                <div>
                  <strong>{def ? tekstUit(lang, def.naam) : h.id}</strong>
                  <span>{h.stand !== 'ok' && uit ? tekstUit(lang, uit.reden) : h.detail}</span>
                  {h.detail && h.stand !== 'ok' && <small>{h.detail}</small>}
                  <small>{tijd(lang, h.op)} ({leeftijd(h.op, nu, lang)}){h.door ? ` · ${h.door}` : ''}{h.code ? ` · ${h.code}` : ''}</small>
                </div>
                <Pil stand={h.stand} lang={lang} />
              </li>
            );
          })}</ol>}
      {meer && <button type='button' className='adg-knop' disabled={bezig} onClick={() => void haal(rijen[rijen.length - 1]?.nr)}>{bezig ? <Loader2 className='adg-spin' /> : <ChevronDown />}{tr(lang, 'Показати старіші', 'Oudere tonen')}</button>}
    </section>
  );
}
