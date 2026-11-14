// admin.tarasevych.com/audit — «Журнал»: modern beheerlogboek. Wie · wat · voor wie · wanneer · resultaat · voor→na, met filters, zoeken,
// sorteren, statistiek, detailpaneel, export en een eerlijke ketenindicator. Alle gegevens komen van /api/owner/journaal/beheer/*.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, ArrowRight, Ban, Bot, CircleCheck, CircleDot, CircleX, Clock, Copy, Download, EyeOff, Fingerprint, Plug, Radio, RefreshCw, Rocket, Search,
  ShieldAlert, ShieldCheck, Stethoscope, TriangleAlert, UserCog, LogIn, Mail, KeyRound, MonitorSmartphone, Wrench, X, FileJson, FileSpreadsheet, ListFilter,
} from 'lucide-react';
import { api } from '../platform/client';
import { journaalWeigeringTekst } from './journaal-weigering';
import {
  ALLE_CATEGORIEEN, RESULTAAT_NAMEN, actieLabel, categorieNaam, wijzigingTekst, type CategorieId,
} from '../../shared/beheer-journaal';
import { Doelwit, Wie } from './Mensen';
import './audit.css';
import './audit-maquette.css';
import {
  LEEG, bewaarFilters, leesFilters, dagKop, datumLang, filtersActief, korteHash, naarBody, relatief, tijdKort, tr,
  type KetenUitslag, type Lang, type Lijst, type Periode, type Persoon, type Rij, type Staat, type Statistiek,
} from './types';

const ICONEN: Record<CategorieId, typeof Bot> = {
  uitrol: Rocket, tech: Wrench, geheimen: KeyRound, ai: Bot, apparaten: MonitorSmartphone, diagnose: Stethoscope, beheer: ShieldCheck, toegang: Fingerprint,
  sessie: LogIn, mail: Mail, integraties: Plug, privacy: UserCog, overig: CircleDot,
};
const RES_ICOON = { ok: CircleCheck, geweigerd: Ban, fout: CircleX, info: CircleDot } as const;
const PERIODEN: Array<[Periode, string, string]> = [['24u', '24 год', '24 u'], ['7d', '7 днів', '7 dagen'], ['30d', '30 днів', '30 dagen'], ['alles', 'Усе', 'Alles'], ['eigen', 'Свій період', 'Eigen periode']];
const PAGINA = 50;

type Props = { lang: Lang; sourceOrigin: string; tabContext: string };

export default function AuditPagina({ lang, sourceOrigin, tabContext }: Props) {
  const context = useMemo(() => ({ service: 'admin', tabContext, sourceOrigin }), [tabContext, sourceOrigin]);
  const [s, setS] = useState<Staat>(() => leesFilters());
  const [zoek, setZoek] = useState(() => leesFilters().q);
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [personen, setPersonen] = useState<Record<string, Persoon>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [stat, setStat] = useState<Statistiek | null>(null);
  const [laden, setLaden] = useState(true);
  const [meerLaden, setMeerLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [open, setOpen] = useState<Rij | null>(null);
  const [live, setLive] = useState(false);
  const [keten, setKeten] = useState<KetenUitslag | null>(null);
  const [ketenBezig, setKetenBezig] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [bezigExport, setBezigExport] = useState(false);
  const [melding, setMelding] = useState('');
  const teller = useRef(0);

  // zoekveld met korte vertraging
  useEffect(() => { const t = window.setTimeout(() => setS((x) => (x.q === zoek ? x : { ...x, q: zoek })), 300); return () => window.clearTimeout(t); }, [zoek]);

  const laad = useCallback(async (stil = false) => {
    const mijn = ++teller.current;
    if (!stil) { setLaden(true); setFout(''); }
    try {
      const body = { ...context, ...naarBody(s, { limiet: PAGINA }) };
      const [l, st] = await Promise.all([
        api.post('/api/owner/journaal/beheer/zoeken', body).then((r) => r.data as Lijst),
        api.post('/api/owner/journaal/beheer/statistiek', { ...context, ...naarBody(s) }).then((r) => r.data as Statistiek),
      ]);
      if (mijn !== teller.current) return;
      setPersonen({ ...l.personen, ...st.personen }); setStat(st);
      setRijen((oud) => {
        // live: nieuwe regels bovenaan zetten zonder de al geladen pagina's weg te gooien
        if (stil && s.volgorde === 'nieuw' && oud.length > PAGINA) { const top = Number(oud[0]?.id) || 0; const nieuw = l.items.filter((x) => Number(x.id) > top); return nieuw.length ? [...nieuw, ...oud] : oud; }
        return l.items;
      });
      if (!(stil && rijen.length > PAGINA)) setCursor(l.nextCursor);
    } catch (e) {
      if (mijn !== teller.current) return;
      setFout(((e as { response?: { data?: { error?: string } } }).response?.data?.error) || tr(lang, 'Не вдалося завантажити журнал.', 'Het logboek kon niet worden geladen.'));
    } finally { if (mijn === teller.current && !stil) setLaden(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, s, lang]);

  useEffect(() => { bewaarFilters(s); }, [s]);
  useEffect(() => { void laad(); }, [laad]);
  useEffect(() => { if (!live) return; const t = window.setInterval(() => { void laad(true); }, 15000); return () => window.clearInterval(t); }, [live, laad]);
  useEffect(() => { if (!melding) return; const t = window.setTimeout(() => setMelding(''), 6000); return () => window.clearTimeout(t); }, [melding]);

  const meer = async () => {
    if (!cursor || meerLaden) return;
    setMeerLaden(true);
    try {
      const l = (await api.post('/api/owner/journaal/beheer/zoeken', { ...context, ...naarBody(s, { limiet: PAGINA, cursor }) })).data as Lijst;
      setRijen((o) => { const ids = new Set(o.map((x) => x.id)); return [...o, ...l.items.filter((x) => !ids.has(x.id))]; });
      setPersonen((p) => ({ ...p, ...l.personen })); setCursor(l.nextCursor);
    } catch { setFout(tr(lang, 'Не вдалося завантажити ще.', 'Meer laden is mislukt.')); } finally { setMeerLaden(false); }
  };

  const controle = async () => {
    setKetenBezig(true);
    try { setKeten((await api.post('/api/owner/journaal/beheer/ketencontrole', context)).data as KetenUitslag); }
    catch (e) { setMelding(journaalWeigeringTekst(lang, e, 'keten') || tr(lang, 'Перевірку ланцюжка не виконано.', 'De ketencontrole is niet uitgevoerd.')); }
    finally { setKetenBezig(false); }
  };

  const exporteer = async (formaat: 'csv' | 'json') => {
    setExportMenu(false); setBezigExport(true);
    try {
      const d = (await api.post('/api/owner/journaal/beheer/export', { ...context, ...naarBody(s), formaat })).data as { bestandsnaam: string; inhoud: string; aantal: number; afgekapt: boolean };
      const blob = new Blob([d.inhoud], { type: formaat === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = d.bestandsnaam; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMelding(tr(lang, `Експортовано ${d.aantal} подій${d.afgekapt ? ' (обмежено 5000)' : ''}. Експорт записано в журнал.`, `${d.aantal} gebeurtenissen geëxporteerd${d.afgekapt ? ' (begrensd op 5000)' : ''}. De export is gelogd.`));
    } catch (e) { setMelding(journaalWeigeringTekst(lang, e, 'export') || tr(lang, 'Експорт не вдався.', 'Exporteren is mislukt.')); } finally { setBezigExport(false); }
  };

  const zet = (d: Partial<Staat>) => setS((x) => ({ ...x, ...d }));
  const wissel = (lijst: string[], v: string) => (lijst.includes(v) ? lijst.filter((x) => x !== v) : [...lijst, v]);
  const reset = () => { setZoek(''); setS(LEEG); };
  const nFilters = filtersActief(s);

  const telCat = useMemo(() => new Map((stat?.perCategorie || []).map((c) => [c.id, c.n])), [stat]);
  const telRes = useMemo(() => new Map((stat?.perResultaat || []).map((c) => [c.id, c.n])), [stat]);
  const maxDag = Math.max(1, ...(stat?.perDag || []).map((d) => d.n));
  const systeem = tr(lang, 'Система', 'Systeem');

  // groeperen per dag
  const groepen = useMemo(() => {
    const uit: Array<{ dag: string; kop: string; rijen: Rij[] }> = [];
    for (const r of rijen) {
      const sleutel = new Date(r.createdAt).toDateString();
      const laatste = uit[uit.length - 1];
      if (laatste && laatste.dag === sleutel) laatste.rijen.push(r); else uit.push({ dag: sleutel, kop: dagKop(r.createdAt, lang), rijen: [r] });
    }
    return uit;
  }, [rijen, lang]);


  return <section className='aj-root mq-accent-emerald' data-admin-audit data-aj-root>
    <header className='aj-kop'>
      <div className='aj-titel'>
        <span className='aj-titel-ico'><ShieldCheck aria-hidden='true' /></span>
        <div>
          <h2>{tr(lang, 'Адміністративний журнал', 'Beheerlogboek')}</h2>
          <p>{tr(lang, 'Хто, що, кому і коли змінив. Записи тільки додаються — їх не можна змінити. Секрети й токени ніколи не потрапляють у журнал.', 'Wie wat voor wie en wanneer wijzigde. Regels worden alleen toegevoegd, nooit gewijzigd. Geheimen en tokens komen nooit in het logboek.')}</p>
        </div>
      </div>
      <div className='aj-acties'>
        <button type='button' className='aj-knop' data-aan={live ? '' : undefined} aria-pressed={live} onClick={() => setLive((v) => !v)} title={tr(lang, 'Оновлювати кожні 15 с', 'Elke 15 s verversen')}><Radio size={15} aria-hidden='true' />{tr(lang, 'Наживо', 'Live')}</button>
        <button type='button' className='aj-knop' onClick={() => void laad()} disabled={laden}><RefreshCw size={15} aria-hidden='true' className={laden ? 'aj-spin' : ''} />{tr(lang, 'Оновити', 'Verversen')}</button>
        <div className='aj-menu'>
          <button type='button' className='aj-knop aj-knop-hoofd' aria-haspopup='menu' aria-expanded={exportMenu} disabled={bezigExport} onClick={() => setExportMenu((v) => !v)}><Download size={15} aria-hidden='true' />{tr(lang, 'Експорт', 'Exporteren')}</button>
          {exportMenu ? <div className='aj-menu-lijst' role='menu'>
            <button type='button' role='menuitem' onClick={() => void exporteer('csv')}><FileSpreadsheet size={15} aria-hidden='true' />CSV<small>{tr(lang, 'для Excel', 'voor Excel')}</small></button>
            <button type='button' role='menuitem' onClick={() => void exporteer('json')}><FileJson size={15} aria-hidden='true' />JSON<small>{tr(lang, 'усі поля', 'alle velden')}</small></button>
            <p>{tr(lang, 'Експортується поточний вибір (до 5000 подій). Сам експорт теж записується в журнал.', 'De huidige selectie (max. 5000). De export zelf wordt ook gelogd.')}</p>
          </div> : null}
        </div>
      </div>
    </header>

    {melding ? <p className='aj-melding' role='status'>{melding}</p> : null}

    <div className='aj-kaarten'>
      <article className='aj-kaart'><span>{tr(lang, 'Подій у вибірці', 'Gebeurtenissen')}</span><strong>{stat ? stat.totaal.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE') : '…'}</strong><small>{stat?.laatste ? tr(lang, `остання ${relatief(stat.laatste, lang)}`, `laatste ${relatief(stat.laatste, lang)}`) : tr(lang, 'немає записів', 'geen regels')}</small></article>
      <article className='aj-kaart' data-toon='ok'><span>{tr(lang, 'Успішно', 'Gelukt')}</span><strong>{telRes.get('ok') ?? 0}</strong><small>{telRes.get('info') ? tr(lang, `+ ${telRes.get('info')} подій без результату`, `+ ${telRes.get('info')} zonder uitkomst`) : ' '}</small></article>
      <article className='aj-kaart' data-toon={(telRes.get('geweigerd') || 0) + (telRes.get('fout') || 0) ? 'warn' : undefined}><span>{tr(lang, 'Відхилено / помилки', 'Geweigerd / fouten')}</span><strong>{(telRes.get('geweigerd') || 0) + (telRes.get('fout') || 0)}</strong><small>{tr(lang, 'потребують уваги', 'verdienen aandacht')}</small></article>
      <article className='aj-kaart aj-kaart-grafiek' aria-label={tr(lang, 'Події по днях', 'Gebeurtenissen per dag')}>
        <span>{tr(lang, 'По днях', 'Per dag')}</span>
        <div className='aj-balken'>{(stat?.perDag || []).map((d) => <i key={d.dag} title={`${d.dag}: ${d.n}${d.geweigerd ? ` (${d.geweigerd} ⚠)` : ''}`} style={{ height: `${Math.max(6, Math.round((d.n / maxDag) * 100))}%` }} data-warn={d.geweigerd ? '' : undefined} />)}</div>
      </article>
      <article className='aj-kaart aj-ketting' data-toon={keten ? (keten.geldig ? 'ok' : 'err') : undefined}>
        <span>{tr(lang, 'Цілісність ланцюжка', 'Integriteit van de keten')}</span>
        <strong>{keten ? (keten.geldig ? tr(lang, 'Підтверджено', 'Bevestigd') : tr(lang, 'Порушено!', 'Verstoord!')) : tr(lang, 'Не перевірено', 'Niet gecontroleerd')}</strong>
        <small>{keten
          ? tr(lang, `Перевірено ${keten.totaal} записів у ${keten.gecontroleerd} ланцюжках за ${Math.max(1, Math.round(keten.duurMs / 1000))} с${keten.afgekapt ? ' (обмежено)' : ''}.`, `${keten.totaal} regels in ${keten.gecontroleerd} ketens gecontroleerd in ${Math.max(1, Math.round(keten.duurMs / 1000))} s${keten.afgekapt ? ' (begrensd)' : ''}.`)
          : tr(lang, 'Повна перевірка хешів по всій базі, а не лише по показаних рядках.', 'Volledige hashcontrole over de hele database, niet alleen de getoonde regels.')}</small>
        <button type='button' className='aj-knop aj-knop-klein' disabled={ketenBezig} onClick={() => void controle()}>{ketenBezig ? <RefreshCw size={13} className='aj-spin' aria-hidden='true' /> : <ShieldCheck size={13} aria-hidden='true' />}{tr(lang, 'Перевірити весь журнал', 'Controleer hele logboek')}</button>
        {keten && !keten.geldig ? <ul className='aj-keten-fouten'>{keten.ongeldig.map((o) => <li key={o.eigenaar}><TriangleAlert size={13} aria-hidden='true' />{o.eigenaar.slice(0, 12)}: {o.hashFout} hash · {o.schakelFout} {tr(lang, 'розрив', 'schakel')} · {o.gaten} {tr(lang, 'пропуск', 'gat')}</li>)}</ul> : null}
      </article>
    </div>

    <div className='aj-filters'>
      <label className='aj-zoek'><Search size={16} aria-hidden='true' />
        <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук: дія, людина, агент, текст…', 'Zoeken: actie, persoon, agent, tekst…')} aria-label={tr(lang, 'Пошук у журналі', 'Zoeken in het logboek')} />
        {zoek ? <button type='button' className='aj-x' onClick={() => setZoek('')} aria-label={tr(lang, 'Очистити пошук', 'Zoekveld wissen')}><X size={14} /></button> : null}
      </label>
      <div className='aj-groep' role='group' aria-label={tr(lang, 'Період', 'Periode')}>
        {PERIODEN.map(([id, uk, nl]) => <button key={id} type='button' className='aj-chip' aria-pressed={s.periode === id} onClick={() => zet({ periode: id })}>{tr(lang, uk, nl)}</button>)}
      </div>
      {s.periode === 'eigen' ? <div className='aj-datums'>
        <label>{tr(lang, 'Від', 'Van')}<input type='date' value={s.van} onChange={(e) => zet({ van: e.target.value })} /></label>
        <label>{tr(lang, 'До', 'Tot')}<input type='date' value={s.tot} onChange={(e) => zet({ tot: e.target.value })} /></label>
      </div> : null}
      <div className='aj-groep aj-cats' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
        {ALLE_CATEGORIEEN.map((c) => { const I = ICONEN[c.id]; const n = telCat.get(c.id) || 0; return <button key={c.id} type='button' className='aj-chip aj-chip-cat' data-cat={c.id} aria-pressed={s.categorieen.includes(c.id)} onClick={() => zet({ categorieen: wissel(s.categorieen, c.id) })} disabled={!n && !s.categorieen.includes(c.id)}><I size={14} aria-hidden='true' />{c[lang]}<em>{n}</em></button>; })}
      </div>
      <div className='aj-rij-filters'>
        <div className='aj-groep' role='group' aria-label={tr(lang, 'Результат', 'Resultaat')}>
          {(['ok', 'geweigerd', 'fout'] as const).map((r) => { const I = RES_ICOON[r]; return <button key={r} type='button' className='aj-chip' data-res={r} aria-pressed={s.resultaten.includes(r)} onClick={() => zet({ resultaten: wissel(s.resultaten, r) })}><I size={14} aria-hidden='true' />{RESULTAAT_NAMEN[r][lang]}<em>{telRes.get(r) || 0}</em></button>; })}
        </div>
        <label className='aj-select'>
          <span>{tr(lang, 'Хто', 'Wie')}</span>
          <select data-hulp-vrij='filter' value={s.actorId} onChange={(e) => zet({ actorId: e.target.value })}>
            <option value=''>{tr(lang, 'Усі користувачі', 'Alle gebruikers')}</option>
            {(stat?.actoren || []).map((a) => <option key={a.id} value={a.id}>{(personen[a.id]?.naam || personen[a.id]?.email || `${a.id.slice(0, 8)}…`)} ({a.n})</option>)}
          </select>
        </label>
        <label className='aj-select'>
          <span>{tr(lang, 'Сервіс', 'Dienst')}</span>
          <select data-hulp-vrij='filter' value={s.dienst} onChange={(e) => zet({ dienst: e.target.value })}>
            <option value=''>{tr(lang, 'Усі сервіси', 'Alle diensten')}</option>
            {(stat?.perDienst || []).map((d) => <option key={d.id} value={d.id}>{d.id} ({d.n})</option>)}
          </select>
        </label>
        <label className='aj-select'>
          <span>{tr(lang, 'Джерело', 'Bron')}</span>
          <select data-hulp-vrij='filter' value={s.bron} onChange={(e) => zet({ bron: e.target.value as Staat['bron'] })}>
            <option value='nieuw'>{tr(lang, 'Журнал безпеки (ланцюжок)', 'Beveiligingslogboek (keten)')}</option>
            <option value='oud'>{tr(lang, 'Старий архів (до ланцюжка)', 'Oud archief (vóór de keten)')}</option>
          </select>
        </label>
        <label className='aj-schakel'><input data-hulp-vrij='filter' type='checkbox' checked={s.verbergRuis} onChange={(e) => zet({ verbergRuis: e.target.checked })} /><EyeOff size={14} aria-hidden='true' />{tr(lang, 'Сховати службові події', 'Technische ruis verbergen')}</label>
        <button type='button' className='aj-knop' onClick={() => zet({ volgorde: s.volgorde === 'nieuw' ? 'oud' : 'nieuw' })}><ArrowDownUp size={14} aria-hidden='true' />{s.volgorde === 'nieuw' ? tr(lang, 'Спочатку нові', 'Nieuwste eerst') : tr(lang, 'Спочатку старі', 'Oudste eerst')}</button>
        {nFilters ? <button type='button' className='aj-knop aj-knop-zacht' onClick={reset}><X size={14} aria-hidden='true' />{tr(lang, `Скинути (${nFilters})`, `Wissen (${nFilters})`)}</button> : null}
      </div>
    </div>

    {nFilters ? <div className='aj-actief' aria-label={tr(lang, 'Активні фільтри', 'Actieve filters')}>
      {s.q.trim() ? <button type='button' className='aj-tag' onClick={() => setZoek('')}>{tr(lang, 'Текст', 'Tekst')}: «{s.q.trim()}»<X size={12} aria-hidden='true' /></button> : null}
      {s.categorieen.map((c) => <button key={c} type='button' className='aj-tag' onClick={() => zet({ categorieen: wissel(s.categorieen, c) })}>{categorieNaam(c, lang)}<X size={12} aria-hidden='true' /></button>)}
      {s.resultaten.map((c) => <button key={c} type='button' className='aj-tag' onClick={() => zet({ resultaten: wissel(s.resultaten, c) })}>{RESULTAAT_NAMEN[c as 'ok'][lang]}<X size={12} aria-hidden='true' /></button>)}
      {s.actorId ? <button type='button' className='aj-tag' onClick={() => zet({ actorId: '' })}>{tr(lang, 'Хто', 'Wie')}: {personen[s.actorId]?.naam || personen[s.actorId]?.email || `${s.actorId.slice(0, 8)}…`}<X size={12} aria-hidden='true' /></button> : null}
      {s.doelId ? <button type='button' className='aj-tag' onClick={() => zet({ doelId: '', doelNaam: '' })}>{tr(lang, 'Кому / що', 'Voor wie / wat')}: {s.doelNaam || `${s.doelId.slice(0, 8)}…`}<X size={12} aria-hidden='true' /></button> : null}
      {s.actie ? <button type='button' className='aj-tag' onClick={() => zet({ actie: '' })}>{tr(lang, 'Дія', 'Actie')}: {actieLabel(s.actie, lang)}<X size={12} aria-hidden='true' /></button> : null}
      {s.dienst ? <button type='button' className='aj-tag' onClick={() => zet({ dienst: '' })}>{tr(lang, 'Сервіс', 'Dienst')}: {s.dienst}<X size={12} aria-hidden='true' /></button> : null}
    </div> : null}

    {fout ? <p className='aj-fout' role='alert'><TriangleAlert size={16} aria-hidden='true' />{fout}</p> : null}

    <div className='aj-lijst' aria-busy={laden}>
      {laden && !rijen.length ? <div className='aj-skeleton' aria-hidden='true'>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div> : null}
      {!laden && !rijen.length && !fout ? <div className='aj-leeg-blok'>
        <ListFilter size={30} aria-hidden='true' />
        <b>{nFilters ? tr(lang, 'За цими фільтрами нічого немає', 'Niets voor deze filters') : tr(lang, 'Журнал поки порожній', 'Het logboek is nog leeg')}</b>
        <p>{nFilters ? tr(lang, 'Спробуйте ширший період або скиньте фільтри. Службові події приховано типово.', 'Probeer een ruimere periode of wis de filters. Technische ruis is standaard verborgen.') : tr(lang, 'Нові дії (ролі, доступ ШІ, оновлення, секрети) з’являться тут одразу.', 'Nieuwe acties (rollen, AI-toegang, updates, geheimen) verschijnen hier meteen.')}</p>
        {nFilters ? <button type='button' className='aj-knop' onClick={reset}>{tr(lang, 'Скинути фільтри', 'Filters wissen')}</button> : null}
      </div> : null}

      {groepen.map((g) => <div className='aj-dag' key={g.dag + g.rijen[0].id}>
        <h3>{g.kop}<small>{g.rijen.length}</small></h3>
        <ul>
          {g.rijen.map((r) => { const I = ICONEN[r.categorie]; const RI = RES_ICOON[r.resultaatKlasse]; const w = wijzigingTekst(r.wijziging); return <li key={r.id}>
            <button type='button' className='aj-regel' data-res={r.resultaatKlasse} data-ruis={r.ruis ? '' : undefined} aria-label={`${actieLabel(r.action, lang)} — ${tijdKort(r.createdAt, lang)}`} onClick={() => setOpen(r)}>
              <span className='aj-tijd'><time dateTime={new Date(r.createdAt).toISOString()}>{tijdKort(r.createdAt, lang)}</time></span>
              <span className='aj-wie-cel'><Wie id={r.actorId || r.ownerId} personen={personen} agent={r.agent} systeem={systeem} lang={lang} /></span>
              <span className='aj-wat'><span className='aj-cat-ico' data-cat={r.categorie} title={categorieNaam(r.categorie, lang)}><I size={15} aria-hidden='true' /></span><span><b>{actieLabel(r.action, lang)}</b><small>{categorieNaam(r.categorie, lang)}{r.service ? ` · ${r.service}` : ''}</small></span></span>
              <span className='aj-kom'><ArrowRight size={13} aria-hidden='true' className='aj-pijl' /><Doelwit doel={r.doel} personen={personen} agent={r.agent} /></span>
              <span className='aj-wijz'>{w ? <code>{w}</code> : r.reden ? <em>{r.reden}</em> : null}</span>
              <span className='aj-res' data-res={r.resultaatKlasse}><RI size={14} aria-hidden='true' />{r.result ? (RESULTAAT_NAMEN[r.resultaatKlasse][lang] + (r.resultaatKlasse === 'info' ? ` · ${r.result}` : '')) : RESULTAAT_NAMEN.info[lang]}</span>
            </button>
          </li>; })}
        </ul>
      </div>)}

      {cursor ? <div className='aj-meer'><button type='button' className='aj-knop aj-knop-hoofd' onClick={() => void meer()} disabled={meerLaden}>{meerLaden ? <RefreshCw size={15} className='aj-spin' aria-hidden='true' /> : <Clock size={15} aria-hidden='true' />}{tr(lang, 'Показати ще', 'Toon meer')}</button><small>{tr(lang, `Показано ${rijen.length}${stat ? ` із ${stat.totaal}` : ''}`, `${rijen.length}${stat ? ` van ${stat.totaal}` : ''} getoond`)}</small></div>
        : rijen.length ? <p className='aj-einde'>{tr(lang, `Це всі ${rijen.length} подій за вибором.`, `Dit zijn alle ${rijen.length} gebeurtenissen van de selectie.`)}</p> : null}
    </div>

    {open ? <Detail lang={lang} rij={open} personen={personen} systeem={systeem} sluit={() => setOpen(null)}
      filterActor={(id) => { zet({ actorId: id }); setOpen(null); }} filterActie={(a) => { zet({ actie: a }); setOpen(null); }} filterDoel={(id, naam) => { zet({ doelId: id, doelNaam: naam }); setOpen(null); }} /> : null}
  </section>;
}

function Detail({ lang, rij, personen, systeem, sluit, filterActor, filterActie, filterDoel }: { lang: Lang; rij: Rij; personen: Record<string, Persoon>; systeem: string; sluit: () => void; filterActor: (id: string) => void; filterActie: (a: string) => void; filterDoel: (id: string, naam: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [gekopieerd, setGekopieerd] = useState('');
  useEffect(() => {
    const vorig = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') sluit(); };
    document.addEventListener('keydown', toets);
    return () => { document.removeEventListener('keydown', toets); vorig?.focus?.(); };
  }, [sluit]);
  const kopieer = async (naam: string, tekst: string) => { try { await navigator.clipboard.writeText(tekst); setGekopieerd(naam); window.setTimeout(() => setGekopieerd(''), 1500); } catch { /* geen klembord */ } };
  const { _ctx, ...rest } = rij.details as Record<string, unknown> & { _ctx?: Record<string, string> };
  const w = wijzigingTekst(rij.wijziging);
  const I = ICONEN[rij.categorie]; const RI = RES_ICOON[rij.resultaatKlasse];
  const rijTekst = (k: string, v: ReactNodeLike) => <div className='aj-feit'><dt>{k}</dt><dd>{v}</dd></div>;
  return <div className='aj-schaduw' onMouseDown={(e) => { if (e.target === e.currentTarget) sluit(); }}>
    <aside className='aj-paneel' role='dialog' aria-modal='true' aria-label={actieLabel(rij.action, lang)} tabIndex={-1} ref={ref}>
      <header>
        <span className='aj-cat-ico aj-groot' data-cat={rij.categorie}><I size={20} aria-hidden='true' /></span>
        <div><h3>{actieLabel(rij.action, lang)}</h3><p>{categorieNaam(rij.categorie, lang)} · {datumLang(rij.createdAt, lang)} <small>({relatief(rij.createdAt, lang)})</small></p></div>
        <button type='button' className='aj-sluit' onClick={sluit} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X size={18} /></button>
      </header>
      <div className='aj-paneel-body'>
        <span className='aj-res aj-res-groot' data-res={rij.resultaatKlasse}><RI size={16} aria-hidden='true' />{RESULTAAT_NAMEN[rij.resultaatKlasse][lang]}{rij.result ? ` · ${rij.result}` : ''}</span>
        <dl className='aj-feiten'>
          {rijTekst(tr(lang, 'Хто', 'Wie'), <Wie id={rij.actorId || rij.ownerId} personen={personen} agent={rij.agent} systeem={systeem} lang={lang} />)}
          {rij.ownerId && rij.ownerId !== rij.actorId ? rijTekst(tr(lang, 'Чий акаунт', 'Welk account'), <Wie id={rij.ownerId} personen={personen} agent='' systeem={systeem} lang={lang} />) : null}
          {rij.doel ? rijTekst(tr(lang, 'Кому / що', 'Voor wie / wat'), <Doelwit doel={rij.doel} personen={personen} agent={rij.agent} />) : null}
          {w ? rijTekst(tr(lang, 'Було → стало', 'Van → naar'), <code>{w}</code>) : null}
          {rij.reden ? rijTekst(tr(lang, 'Причина', 'Reden'), rij.reden) : null}
          {rij.service ? rijTekst(tr(lang, 'Сервіс', 'Dienst'), rij.service) : null}
          {rij.device ? rijTekst(tr(lang, 'Пристрій', 'Apparaat'), rij.device) : null}
          {_ctx?.profiel ? rijTekst(tr(lang, 'Технічний профіль', 'Technisch profiel'), <code>{_ctx.profiel}</code>) : null}
          {_ctx?.namens ? rijTekst(tr(lang, 'Від імені', 'Namens'), <code>{_ctx.namens}</code>) : null}
          {rijTekst(tr(lang, 'Код дії', 'Actiecode'), <code>{rij.action}</code>)}
        </dl>
        <div className='aj-paneel-knoppen'>
          {(rij.actorId || rij.ownerId) ? <button type='button' className='aj-knop' onClick={() => filterActor((rij.actorId || rij.ownerId) as string)}><Search size={14} aria-hidden='true' />{tr(lang, 'Усі дії цієї особи', 'Alle acties van deze persoon')}</button> : null}
          {rij.doel?.id ? <button type='button' className='aj-knop' onClick={() => filterDoel(rij.doel!.id as string, rij.doel!.naam || rij.doel!.id as string)}><Search size={14} aria-hidden='true' />{tr(lang, 'Усі події щодо цього об’єкта', 'Alle gebeurtenissen voor dit doel')}</button> : null}
          <button type='button' className='aj-knop' onClick={() => filterActie(rij.action)}><ListFilter size={14} aria-hidden='true' />{tr(lang, 'Усі такі події', 'Alle van dit type')}</button>
        </div>
        <details open>
          <summary>{tr(lang, 'Повні дані події', 'Volledige gegevens')}</summary>
          <pre className='aj-json' tabIndex={0}>{JSON.stringify(rest, null, 2)}</pre>
          <button type='button' className='aj-knop aj-knop-klein' onClick={() => void kopieer('json', JSON.stringify(rest, null, 2))}><Copy size={13} aria-hidden='true' />{gekopieerd === 'json' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати JSON', 'Kopieer JSON')}</button>
        </details>
        {rij.bron === 'nieuw' ? <details>
          <summary><ShieldAlert size={14} aria-hidden='true' /> {tr(lang, 'Ланцюжок хешів', 'Hashketen')}</summary>
          <dl className='aj-feiten'>
            {rijTekst('seq', `#${rij.seq}`)}
            {rijTekst('hash', <code title={rij.hash}>{korteHash(rij.hash)}</code>)}
            {rijTekst('prev', <code title={rij.prevHash}>{korteHash(rij.prevHash)}</code>)}
            {rij.ipHash ? rijTekst('IP', <code>{rij.ipHash}</code>) : null}
          </dl>
          <button type='button' className='aj-knop aj-knop-klein' onClick={() => void kopieer('hash', rij.hash)}><Copy size={13} aria-hidden='true' />{gekopieerd === 'hash' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати hash', 'Kopieer hash')}</button>
        </details> : <p className='aj-opm'>{tr(lang, 'Запис зі старого архіву (до введення ланцюжка хешів).', 'Regel uit het oude archief (vóór de hashketen).')}</p>}
      </div>
    </aside>
  </div>;
}
type ReactNodeLike = import('react').ReactNode;
