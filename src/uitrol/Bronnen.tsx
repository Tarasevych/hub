// «Джерела статусу»: de kaart van alle plekken waar de uitrolstand vandaan komt (status.json, gebeurtenissen, runs, voorstellen,
// releasemap, VORIGE, siteproces, nazorg, GitHub, back-ups), wie wie voedt, welke bron de hoofdbron is en waar de bronnen uiteenlopen.
// Gegevens: POST /api/owner/uitrol/bron (backend/uitrol-bron.ts). Instellen: POST /api/owner/uitrol/bron/instellen.
// Kleur is nooit het enige signaal: elke toestand heeft een pictogram én een woord. Op smalle schermen een lijst in plaats van de kaart.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { weergaveScopeNu } from '../gedeelde-voorkeuren';
// Audit 20.10.2026 (punt 2): de gekozen weergave (kaart/lijst/tabel) hing onder één sleutel voor de hele browser; nu per account
// en per webruimte, met dezelfde scope als het menu en het thema.
const BRON_BASIS = 'ut-bron-weergave';
const BRON_WEERGAVE = () => `${BRON_BASIS}:${weergaveScopeNu()}`;
try { if (localStorage.getItem(BRON_BASIS) !== null) localStorage.removeItem(BRON_BASIS); } catch { /* opslag geblokkeerd */ }
import { AlertTriangle, Archive, Bot, CheckCircle2, Clock, Cpu, Database, FileJson, Folder, Github, HelpCircle, History, Inbox, List, Map as MapIcon, Monitor, RefreshCw, ScrollText, Server, Settings2, ShieldCheck, Table, Undo2 } from 'lucide-react';
import { api } from '../platform/client';
import { datum, duur, tr, type Afwijking, type BronId, type BronStand, type BronToestand, type Hoofdbron, type KaartKnoop, type Lang, type Stand } from './types';
import './bronnen.css';
import HulpVraag from '../hulp/HulpVraag';

type Ctx = Record<string, unknown>;
type KnoopId = KaartKnoop['id'];

const ICOON: Record<KnoopId, typeof Database> = {
  root: ShieldCheck, installer: Cpu, nazorg: Undo2, status: FileJson, events: ScrollText, releasemap: Folder, vorige: History, voorstellen: Inbox, runs: Database, versie: Server,
  github: Github, backups: Archive, app: Server, ui: Monitor, mcp: Bot,
};
// Vaste plaatsen op de kaart (viewBox 1080×560): links de processen, midden de bronnen, rechts de samenvoeging en de uitgangen.
const POS: Record<KnoopId, { x: number; y: number; w: number }> = {
  root: { x: 20, y: 70, w: 190 }, installer: { x: 20, y: 250, w: 190 }, nazorg: { x: 20, y: 430, w: 190 },
  status: { x: 330, y: 20, w: 260 }, events: { x: 330, y: 80, w: 260 }, runs: { x: 330, y: 140, w: 260 }, voorstellen: { x: 330, y: 200, w: 260 }, releasemap: { x: 330, y: 260, w: 260 },
  vorige: { x: 330, y: 320, w: 260 }, versie: { x: 330, y: 380, w: 260 }, github: { x: 330, y: 440, w: 260 }, backups: { x: 330, y: 500, w: 260 },
  app: { x: 700, y: 240, w: 160 }, ui: { x: 890, y: 160, w: 170 }, mcp: { x: 890, y: 320, w: 170 },
};
const H = 42;

const TOESTAND: Record<BronToestand, { Icoon: typeof Database; uk: string; nl: string; cls: string }> = {
  ok: { Icoon: CheckCircle2, uk: 'узгоджено', nl: 'in lijn', cls: 'ok' },
  bezig: { Icoon: RefreshCw, uk: 'виконується', nl: 'bezig', cls: 'info' },
  afwijking: { Icoon: AlertTriangle, uk: 'розбіжність', nl: 'afwijking', cls: 'warn' },
  oud: { Icoon: Clock, uk: 'застаріле', nl: 'verouderd', cls: 'warn' },
  onbekend: { Icoon: HelpCircle, uk: 'немає даних', nl: 'geen gegevens', cls: 'muted' },
};
const HOOFD_UITLEG: Record<Hoofdbron, [string, string]> = {
  runs: ['Історія в базі: кроки, журнал, sha256, хто готував і схвалив. Переживає перезапуск сайту і SSH-встановлення. Рекомендовано.', 'Geschiedenis in de database: stappen, logboek, sha256, wie voorbereidde en goedkeurde. Overleeft een herstart en SSH-installaties. Aanbevolen.'],
  status: ['Лише останній запис root. Без історії; при SSH старого формату «версія» могла бути назвою теки. Тільки для діагностики.', 'Alleen de laatste regel van root. Geen geschiedenis; bij SSH in het oude formaat kon «versie» een mapnaam zijn. Alleen voor diagnose.'],
  releasemap: ['Що фізично активовано на диску (current). Не знає про результат чи метод встановлення. Тільки для діагностики.', 'Wat fysiek op schijf actief is (current). Weet niets van uitkomst of methode. Alleen voor diagnose.'],
  versie: ['Що думає сам процес сайту. Відстає, поки сайт не перезапущено. Тільки для діагностики.', 'Wat het siteproces zelf denkt. Loopt achter tot de site herstart is. Alleen voor diagnose.'],
};

const randPad = (a: { x: number; y: number; w: number }, b: { x: number; y: number; w: number }) => {
  const ay = a.y + H / 2, by = b.y + H / 2;
  if (b.x > a.x + a.w) { const x1 = a.x + a.w, x2 = b.x, dx = (x2 - x1) * 0.45; return `M${x1},${ay} C${x1 + dx},${ay} ${x2 - dx},${by} ${x2},${by}`; }
  if (a.x > b.x + b.w) { const x1 = a.x, x2 = b.x + b.w, dx = (x1 - x2) * 0.45; return `M${x1},${ay} C${x1 - dx},${ay} ${x2 + dx},${by} ${x2},${by}`; }
  // Zelfde kolom: een boog langs de linkerkant.
  const x = Math.min(a.x, b.x) - 14; return `M${a.x},${ay} C${x},${ay} ${x},${by} ${b.x},${by}`;
};

export default function Bronnen({ lang, context, kort = false }: { lang: Lang; context: Ctx; kort?: boolean }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fout, setFout] = useState('');
  const [laden, setLaden] = useState(false);
  const [gekozen, setGekozen] = useState<KnoopId | null>(null);
  const [weergave, setWeergave] = useState<'kaart' | 'lijst' | 'tabel'>(() => { try { return (localStorage.getItem(BRON_WEERGAVE()) as 'kaart' | 'lijst' | 'tabel') || (window.innerWidth < 700 ? 'lijst' : 'kaart'); } catch { return 'kaart'; } });
  const [instellen, setInstellen] = useState(false);
  const [hoofdbron, setHoofdbron] = useState<Hoofdbron>('runs');
  const [interval, setIntervalSec] = useState(20);
  const bezig = useRef(false);

  const haal = useCallback(async () => {
    if (bezig.current || document.hidden) return;
    bezig.current = true; setLaden(true);
    try { const r = await api.post('/api/owner/uitrol/bron', context); const s = r.data as Stand; setStand(s); setFout(''); setHoofdbron(s.hoofdbron); setIntervalSec(s.intervalSec); }
    catch { setFout(tr(lang, 'Не вдалося прочитати джерела статусу.', 'De statusbronnen konden niet worden gelezen.')); }
    finally { bezig.current = false; setLaden(false); }
  }, [context, lang]);
  useEffect(() => { void haal(); }, [haal]);
  useEffect(() => {
    const ms = Math.max(5, stand?.intervalSec || 20) * 1000;
    const t = window.setInterval(() => { void haal(); }, ms);
    const zicht = () => { if (!document.hidden) void haal(); };
    document.addEventListener('visibilitychange', zicht);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', zicht); };
  }, [haal, stand?.intervalSec]);
  useEffect(() => { try { localStorage.setItem(BRON_WEERGAVE(), weergave); } catch { /* geen opslag */ } }, [weergave]);

  const bewaar = async () => {
    try { const r = await api.post('/api/owner/uitrol/bron/instellen', { ...context, hoofdbron, intervalSec: interval }); setStand(r.data as Stand); setInstellen(false); }
    catch { setFout(tr(lang, 'Налаштування не збережено.', 'Instelling niet opgeslagen.')); }
  };

  const perBron = useMemo(() => Object.fromEntries((stand?.bronnen || []).map((b) => [b.id, b])) as Partial<Record<BronId, BronStand>>, [stand]);
  const afwPer = useMemo(() => { const m = new Map<BronId, Afwijking[]>(); for (const a of stand?.afwijkingen || []) m.set(a.bron, [...(m.get(a.bron) || []), a]); return m; }, [stand]);
  const knopen = stand?.kaart.knopen || [];
  const randen = stand?.kaart.randen || [];
  const naam = (k: KaartKnoop) => (lang === 'uk' ? k.uk : k.nl);
  const toestandVan = (id: KnoopId): BronToestand => (perBron[id as BronId]?.toestand) || (id === 'app' || id === 'ui' || id === 'mcp' || id === 'root' || id === 'installer' ? 'ok' : 'onbekend');
  const isHoofd = (id: KnoopId) => stand?.gebruikteBron === id;
  const gekozenKnoop = knopen.find((k) => k.id === gekozen) || null;
  const fouten = (stand?.afwijkingen || []).filter((a) => a.ernst === 'error').length;

  const Kop = () => <header className='ut-kaart-kop'>
    <div><h2 id='ut-bron-titel'><MapIcon aria-hidden='true' />{tr(lang, 'Джерела статусу', 'Statusbronnen')}</h2>
      <p className='ut-sub'>{tr(lang, 'Звідки сайт знає, яка версія працює і чим закінчилось останнє встановлення. Одне основне джерело; решта лише порівнюється, і будь-яка розбіжність показана явно.', 'Waar de site vandaan haalt welke versie draait en hoe de laatste installatie eindigde. Eén hoofdbron; de rest wordt alleen vergeleken, en elke afwijking staat er expliciet.')}</p></div>
    <div className='ut-bron-knoppen'>
      <div className='ut-bron-schakel' role='group' aria-label={tr(lang, 'Вигляд', 'Weergave')}>
        {(['kaart', 'lijst', 'tabel'] as const).map((w) => { const I = w === 'kaart' ? MapIcon : w === 'lijst' ? List : Table; return <button key={w} type='button' className='ut-knop' aria-pressed={weergave === w} onClick={() => setWeergave(w)}><I aria-hidden='true' />{tr(lang, w === 'kaart' ? 'Карта' : w === 'lijst' ? 'Список' : 'Таблиця', w === 'kaart' ? 'Kaart' : w === 'lijst' ? 'Lijst' : 'Tabel')}</button>; })}
      </div>
      <button type='button' className='ut-knop' onClick={() => setInstellen((v) => !v)} aria-expanded={instellen}><Settings2 aria-hidden='true' />{tr(lang, 'Налаштувати', 'Instellen')}</button>
      <button type='button' className='ut-knop' onClick={() => void haal()} disabled={laden}><RefreshCw aria-hidden='true' className={laden ? 'spin' : ''} />{tr(lang, 'Оновити', 'Vernieuwen')}</button>
    </div>
  </header>;

  if (!stand) return <section className='ut-kaart ut-bronnen' aria-labelledby='ut-bron-titel'><Kop />{fout ? <p className='ut-bron-fout' role='alert'>{fout}</p> : <p className='ut-hint'>{tr(lang, 'Збираємо джерела…', 'Bronnen worden verzameld…')}</p>}</section>;

  return <section className='ut-kaart ut-bronnen' aria-labelledby='ut-bron-titel' data-ut-bronnen>
    <Kop />
    {fout && <p className='ut-bron-fout' role='alert'>{fout}</p>}

    <div className='ut-bron-samenvatting' data-afw={stand.afwijkingen.length ? (fouten ? 'error' : 'warn') : 'ok'}>
      <div><span className='ut-hint'>{tr(lang, 'Основне джерело', 'Hoofdbron')}</span><b>{naam(knopen.find((k) => k.id === stand.gebruikteBron) || { id: 'runs', uk: stand.gebruikteBron, nl: stand.gebruikteBron, soort: 'bron' })}</b>{stand.gebruikteBron !== stand.hoofdbron && <small className='ut-hint'> {tr(lang, `(налаштовано ${stand.hoofdbron}, але воно порожнє — взято наступне)`, `(ingesteld ${stand.hoofdbron}, maar leeg — de volgende gebruikt)`)}</small>}</div>
      <div><span className='ut-hint'>{tr(lang, 'Версія', 'Versie')}</span><b className='ut-mono'>{stand.versie || '—'}</b></div>
      <div><span className='ut-hint'>{tr(lang, 'Тека релізу', 'Releasemap')}</span><b className='ut-mono'>{stand.release || '—'}</b></div>
      <div><span className='ut-hint'>{tr(lang, 'Коміт', 'Commit')}</span><b className='ut-mono'>{stand.commit ? stand.commit.slice(0, 12) : tr(lang, 'невідомий', 'onbekend')}</b></div>
      <div><span className='ut-hint'>{tr(lang, 'Стан', 'Stand')}</span><b>{stand.staat || '—'}{stand.tijd ? <small className='ut-hint'> · {datum(lang, stand.tijd)}</small> : null}</b></div>
      <div className='ut-bron-afw-tel'>{stand.afwijkingen.length ? <><AlertTriangle aria-hidden='true' /><b>{tr(lang, `Розбіжностей: ${stand.afwijkingen.length}`, `Afwijkingen: ${stand.afwijkingen.length}`)}</b></> : <><CheckCircle2 aria-hidden='true' /><b>{tr(lang, 'Усі джерела узгоджені', 'Alle bronnen in lijn')}</b></>}</div>
    </div>

    {instellen && <form className='ut-bron-instellen' onSubmit={(e) => { e.preventDefault(); void bewaar(); }}>
      <label>{tr(lang, 'Основне джерело для сторінки та MCP', 'Hoofdbron voor de pagina en MCP')} <HulpVraag k='uitrol.hoofdbron' lang={lang} />
        <select data-hulp='uitrol.hoofdbron' value={hoofdbron} onChange={(e) => setHoofdbron(e.target.value as Hoofdbron)}>
          {(['runs', 'status', 'releasemap', 'versie'] as Hoofdbron[]).map((h) => <option key={h} value={h}>{naam(knopen.find((k) => k.id === h) || { id: h, uk: h, nl: h, soort: 'bron' })}</option>)}
        </select>
        <small className='ut-hint'>{tr(lang, HOOFD_UITLEG[hoofdbron][0], HOOFD_UITLEG[hoofdbron][1])}</small>
        {hoofdbron !== 'runs' && <small className='ut-bron-waarschuwing'><AlertTriangle aria-hidden='true' />{tr(lang, 'Це джерело не має історії або відстає. Перемикайте лише для діагностики і повертайте «Історія запусків».', 'Deze bron heeft geen geschiedenis of loopt achter. Alleen voor diagnose omschakelen en daarna terug naar «Runs».')}</small>}
      </label>
      <label>{tr(lang, 'Оновлювати кожні', 'Vernieuwen elke')} <HulpVraag k='uitrol.interval' lang={lang} />
        <select data-hulp='uitrol.interval' value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))}>{[10, 20, 30, 60, 120].map((s) => <option key={s} value={s}>{s} s</option>)}</select>
      </label>
      <div className='ut-bron-knoppen'><button type='submit' className='ut-knop ut-knop-primair'>{tr(lang, 'Зберегти', 'Opslaan')}</button><button type='button' className='ut-knop' onClick={() => setInstellen(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button></div>
    </form>}

    {stand.afwijkingen.length > 0 && <ul className='ut-bron-afwijkingen' aria-label={tr(lang, 'Розбіжності', 'Afwijkingen')}>
      {stand.afwijkingen.map((a, i) => <li key={i} data-ernst={a.ernst}><AlertTriangle aria-hidden='true' /><div>
        <b>{naam(knopen.find((k) => k.id === a.bron) || { id: a.bron, uk: a.bron, nl: a.bron, soort: 'bron' })} · {a.veld}: <code>{a.waarde}</code> ≠ <code>{a.verwacht}</code></b>
        <p>{lang === 'uk' ? a.uk : a.nl}</p></div></li>)}
    </ul>}

    {weergave === 'kaart' && <div className='ut-bron-kaartvak'>
      <svg viewBox='0 0 1080 560' role='img' aria-labelledby='ut-bron-svg-titel' className='ut-bron-svg' onClick={(e) => { if (e.target === e.currentTarget) setGekozen(null); }}>
        <title id='ut-bron-svg-titel'>{tr(lang, 'Карта джерел статусу: хто кого живить', 'Kaart van de statusbronnen: wie voedt wie')}</title>
        <defs>
          <marker id='ut-bron-pijl' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='8' markerHeight='8' orient='auto-start-reverse'><path d='M0,0 L10,5 L0,10 z' className='ut-bron-pijlkop' /></marker>
          <marker id='ut-bron-pijl-actief' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='8' markerHeight='8' orient='auto-start-reverse'><path d='M0,0 L10,5 L0,10 z' className='ut-bron-pijlkop actief' /></marker>
        </defs>
        <text x='115' y='46' className='ut-bron-kolom' textAnchor='middle'>{tr(lang, 'Процеси (root)', 'Processen (root)')}</text>
        <text x='460' y='12' className='ut-bron-kolom' textAnchor='middle'>{tr(lang, 'Джерела', 'Bronnen')}</text>
        <text x='780' y='226' className='ut-bron-kolom' textAnchor='middle'>{tr(lang, 'Збір', 'Samenvoeging')}</text>
        <text x='975' y='140' className='ut-bron-kolom' textAnchor='middle'>{tr(lang, 'Показ', 'Weergave')}</text>
        {randen.map((r, i) => { const a = POS[r.van], b = POS[r.naar]; if (!a || !b) return null; const actief = gekozen === r.van || gekozen === r.naar; const dim = gekozen && !actief;
          return <g key={i} className={`ut-bron-rand${actief ? ' actief' : ''}${dim ? ' dim' : ''}`}><path d={randPad(a, b)} markerEnd={`url(#ut-bron-pijl${actief ? '-actief' : ''})`} /><title>{naam(knopen.find((k) => k.id === r.van)!)} → {naam(knopen.find((k) => k.id === r.naar)!)}: {lang === 'uk' ? r.uk : r.nl}</title></g>; })}
        {knopen.map((k) => { const p = POS[k.id]; if (!p) return null; const t = TOESTAND[toestandVan(k.id)]; const I = ICOON[k.id]; const hoofd = isHoofd(k.id); const b = perBron[k.id as BronId];
          return <g key={k.id} className={`ut-bron-knoop ${t.cls}${gekozen === k.id ? ' gekozen' : ''}${hoofd ? ' hoofd' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role='button' aria-pressed={gekozen === k.id}
            aria-label={`${naam(k)}: ${tr(lang, t.uk, t.nl)}${b?.versie ? `, ${b.versie}` : ''}${hoofd ? tr(lang, ' (основне)', ' (hoofdbron)') : ''}`}
            onClick={() => setGekozen(gekozen === k.id ? null : k.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGekozen(gekozen === k.id ? null : k.id); } }}>
            <rect width={p.w} height={H} rx='9' />
            <foreignObject x='8' y='7' width='22' height='22'><span className='ut-bron-ico'><I aria-hidden='true' /></span></foreignObject>
            <text x='36' y='18' className='ut-bron-naam'>{(() => { const n = naam(k), max = hoofd ? Math.round(p.w / 8.6) - 9 : Math.round(p.w / 8.6) - 2; return n.length > max ? `${n.slice(0, max - 1)}…` : n; })()}</text>
            <text x='36' y='33' className='ut-bron-waarde'>{k.soort === 'bron' ? (b?.beschikbaar ? (b.versie || b.release || b.staat || '—') : tr(lang, 'немає даних', 'geen gegevens')) : (k.soort === 'proces' ? tr(lang, 'пише', 'schrijft') : tr(lang, 'читає стан', 'leest de stand'))}</text>
            {hoofd && <text x={p.w - 8} y='18' textAnchor='end' className='ut-bron-tag'>★ {tr(lang, 'основне', 'hoofd')}</text>}
            <foreignObject x={p.w - 26} y={H - 24} width='20' height='20'><span className={`ut-bron-toestand ${t.cls}`} title={tr(lang, t.uk, t.nl)}><t.Icoon aria-hidden='true' /></span></foreignObject>
          </g>; })}
      </svg>
      <p className='ut-hint'>{tr(lang, 'Клацніть вузол — побачите значення, час, шлях і звʼязки. Стрілка = хто кого живить. ★ — основне джерело.', 'Klik op een knoop voor waarde, tijd, pad en verbindingen. Pijl = wie voedt wie. ★ = hoofdbron.')}</p>
    </div>}

    {weergave === 'lijst' && <ul className='ut-bron-lijst'>
      {knopen.map((k) => { const t = TOESTAND[toestandVan(k.id)]; const I = ICOON[k.id]; const b = perBron[k.id as BronId]; const uit = randen.filter((r) => r.van === k.id); const inn = randen.filter((r) => r.naar === k.id);
        return <li key={k.id} className={`ut-bron-rij ${t.cls}${isHoofd(k.id) ? ' hoofd' : ''}`}><button type='button' onClick={() => setGekozen(gekozen === k.id ? null : k.id)} aria-expanded={gekozen === k.id}>
          <span className='ut-bron-ico'><I aria-hidden='true' /></span>
          <span className='ut-bron-rij-tekst'><b>{naam(k)}{isHoofd(k.id) ? ` ★ ${tr(lang, 'основне', 'hoofdbron')}` : ''}</b><small>{b?.beschikbaar ? [b.versie, b.release && b.release !== b.versie ? b.release : '', b.staat].filter(Boolean).join(' · ') || '—' : (k.soort === 'bron' ? tr(lang, 'немає даних', 'geen gegevens') : (lang === 'uk' ? k.uk : k.nl))}{b?.tijd ? ` · ${datum(lang, b.tijd)}` : ''}</small></span>
          <span className={`ut-bron-toestand ${t.cls}`}><t.Icoon aria-hidden='true' />{tr(lang, t.uk, t.nl)}</span></button>
          {gekozen === k.id && <div className='ut-bron-rij-detail'>
            {inn.length > 0 && <p><b>{tr(lang, 'Отримує від:', 'Krijgt van:')}</b> {inn.map((r) => `${naam(knopen.find((x) => x.id === r.van)!)} (${lang === 'uk' ? r.uk : r.nl})`).join(', ')}</p>}
            {uit.length > 0 && <p><b>{tr(lang, 'Живить:', 'Voedt:')}</b> {uit.map((r) => `${naam(knopen.find((x) => x.id === r.naar)!)} (${lang === 'uk' ? r.uk : r.nl})`).join(', ')}</p>}
          </div>}
        </li>; })}
    </ul>}

    {weergave === 'tabel' && <div className='ut-bron-tabelvak'><table className='ut-bron-tabel'>
      <thead><tr><th>{tr(lang, 'Джерело', 'Bron')}</th><th>{tr(lang, 'Версія', 'Versie')}</th><th>{tr(lang, 'Тека', 'Map')}</th><th>{tr(lang, 'Стан', 'Stand')}</th><th>{tr(lang, 'Час', 'Tijd')}</th><th>{tr(lang, 'Оцінка', 'Oordeel')}</th></tr></thead>
      <tbody>{stand.bronnen.map((b) => { const t = TOESTAND[b.toestand]; const k = knopen.find((x) => x.id === b.id)!;
        return <tr key={b.id} className={isHoofd(b.id) ? 'hoofd' : ''}><td>{naam(k)}{isHoofd(b.id) ? ' ★' : ''}</td><td className='ut-mono'>{b.versie || '—'}</td><td className='ut-mono'>{b.release || '—'}</td><td>{b.staat || '—'}</td><td>{b.tijd ? datum(lang, b.tijd) : '—'}</td><td><span className={`ut-bron-toestand ${t.cls}`}><t.Icoon aria-hidden='true' />{tr(lang, t.uk, t.nl)}</span></td></tr>; })}</tbody>
    </table></div>}

    {gekozenKnoop && weergave !== 'lijst' && (() => { const b = perBron[gekozenKnoop.id as BronId]; const t = TOESTAND[toestandVan(gekozenKnoop.id)]; const I = ICOON[gekozenKnoop.id];
      const uit = randen.filter((r) => r.van === gekozenKnoop.id), inn = randen.filter((r) => r.naar === gekozenKnoop.id); const afw = afwPer.get(gekozenKnoop.id as BronId) || [];
      return <div className='ut-bron-detail' role='region' aria-live='polite'>
        <header><span className='ut-bron-ico'><I aria-hidden='true' /></span><div><h3>{naam(gekozenKnoop)}{isHoofd(gekozenKnoop.id) ? ` ★ ${tr(lang, 'основне джерело', 'hoofdbron')}` : ''}</h3>{gekozenKnoop.pad && <code>{gekozenKnoop.pad}</code>}</div><span className={`ut-bron-toestand ${t.cls}`}><t.Icoon aria-hidden='true' />{tr(lang, t.uk, t.nl)}</span></header>
        {b && <p className='ut-hint'>{lang === 'uk' ? b.uk : b.nl}</p>}
        {b && b.beschikbaar && <dl className='ut-dl'>
          {b.versie && <><dt>{tr(lang, 'Версія', 'Versie')}</dt><dd className='ut-mono'>{b.versie}</dd></>}
          {b.release && <><dt>{tr(lang, 'Тека релізу', 'Releasemap')}</dt><dd className='ut-mono'>{b.release}</dd></>}
          {b.commit && <><dt>{tr(lang, 'Коміт', 'Commit')}</dt><dd className='ut-mono'>{b.commit.slice(0, 12)}</dd></>}
          {b.staat && <><dt>{tr(lang, 'Стан', 'Stand')}</dt><dd>{b.staat}{b.methode ? ` · ${b.methode}` : ''}</dd></>}
          {b.tijd && <><dt>{tr(lang, 'Час', 'Tijd')}</dt><dd>{datum(lang, b.tijd)}{b.leeftijdSec !== null ? ` (${duur(b.leeftijdSec * 1000)} ${tr(lang, 'тому', 'geleden')})` : ''}</dd></>}
          {Object.entries(b.detail).filter(([, v]) => v !== '' && v !== null && v !== undefined && typeof v !== 'object').slice(0, 8).map(([k, v]) => <span key={k} className='ut-bron-dl-paar'><dt>{k}</dt><dd>{String(v)}</dd></span>)}
        </dl>}
        {b && !b.beschikbaar && <p className='ut-hint'>{tr(lang, 'Це джерело зараз недоступне або порожнє.', 'Deze bron is nu niet beschikbaar of leeg.')}{b.detail.reden ? ` ${String(b.detail.reden)}` : ''}{b.detail.fout ? ` ${String(b.detail.fout)}` : ''}</p>}
        {afw.length > 0 && <ul className='ut-bron-afwijkingen'>{afw.map((a, i) => <li key={i} data-ernst={a.ernst}><AlertTriangle aria-hidden='true' /><div><b>{a.veld}: <code>{a.waarde}</code> ≠ <code>{a.verwacht}</code></b><p>{lang === 'uk' ? a.uk : a.nl}</p></div></li>)}</ul>}
        {inn.length > 0 && <p><b>{tr(lang, 'Отримує від:', 'Krijgt van:')}</b> {inn.map((r) => `${naam(knopen.find((x) => x.id === r.van)!)} (${lang === 'uk' ? r.uk : r.nl})`).join(', ')}</p>}
        {uit.length > 0 && <p><b>{tr(lang, 'Живить:', 'Voedt:')}</b> {uit.map((r) => `${naam(knopen.find((x) => x.id === r.naar)!)} (${lang === 'uk' ? r.uk : r.nl})`).join(', ')}</p>}
      </div>; })()}

    {!kort && <p className='ut-hint'>{tr(lang, `Оновлено ${datum(lang, stand.bijgewerkt)} · кожні ${stand.intervalSec} с, лише коли вкладка видима.`, `Bijgewerkt ${datum(lang, stand.bijgewerkt)} · elke ${stand.intervalSec} s, alleen als het tabblad zichtbaar is.`)}</p>}
  </section>;
}
