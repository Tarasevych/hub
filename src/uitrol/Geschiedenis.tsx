// «Історія розгортань» (22.10.2026, zone B): ÉÉN tijdlijn op datum — installaties (passkey, SSH, handtekening, GitOps), terugdraaiingen
// (op verzoek en automatisch: ROOK_*/NAZORG_*), afgebroken en mislukte pogingen (0081) en pakketten die niet tot een installatie kwamen
// (afgewezen, verlopen). Een klik op een regel klapt de details open (stappen, oorzaak, volledig logboek; etappe en percentage van een
// afgebroken poging; de reden van een afwijzing). «Спробувати знову» staat UIT met uitleg als na die poging een nieuwere release is
// geïnstalleerd of als de poging ouder is dan de actieve versie (src/uitrol/geschiedenis-tijdlijn.ts). Mobiel: kaarten, tap ≥ 44 px.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, Archive, Bot, ChevronDown, ChevronLeft, ChevronRight, Globe, PlayCircle, RotateCcw, Search, Server, UserCheck } from 'lucide-react';
import { api } from '../platform/client';
import RunDetail from './RunDetail';
import CommitTekst from './CommitTekst';
import Voorcontrole from './Voorcontrole';
import { etappeTekst, pogingOorzaak, type PogingUit, type PogingenAntwoord } from '../../shared/uitrol-pogingen';
import { datum, datumLang, mb, methodeTekst, runDuur, tr, VOORSTEL_STATUS, type Lang, type Methode, type Overzicht, type RunsAntwoord } from './types';
import { bouwTijdlijn, MISLUKT_STATEN, opnieuwRedenTekst, TIJDLIJN_STATEN, tijdlijnStaatTekst, tijdlijnTellers, type TijdlijnItem, type TijdlijnStaat } from './geschiedenis-tijdlijn';
import './geschiedenis.css';
import { Deelnemers } from './UitgaveBeschrijving';
import { groepeer, herstelActies, HERSTEL_TEKST, voortgang, type HerstelActie } from './weergave-v2';
import type { Manifest } from '../../shared/uitrol-manifest';
import type { Voorstel } from './types';

const METHODEN: Methode[] = ['passkey', 'ssh', 'handtekening', 'gitops', 'opdracht'];
const PER_PAGINA = 30;
type Filter = { q: string; staat: TijdlijnStaat[]; methode: Methode[]; van: string; tot: string; pagina: number };
const LEEG: Filter = { q: '', staat: [], methode: [], van: '', tot: '', pagina: 1 };
const ms = (v: string) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

type Props = { lang: Lang; context: Record<string, unknown>; openId: string; onOpenId: (id: string) => void; naarUpload?: (hervat: boolean) => void;
  /** Het overzicht van de pagina (voorstellen zonder run, actieve versie): zonder dit staan alleen runs en pogingen in de tijdlijn. */
  data?: Overzicht | null;
  /** UI-010 fase 2 (vlag uitrol-weergave-v2): groepen, deelnemers, herstelacties, filters op agent/model. */
  v2?: boolean; naarLog?: (runId: string) => void; naarDiagnose?: () => void };

/** Manifest + uploader/goedkeurder van het voorstel achter een tijdlijnregel (run via voorstelId). */
const voorstelVan = (it: TijdlijnItem, vs: readonly Voorstel[]): Voorstel | undefined => it.voorstel || (it.run?.voorstelId ? vs.find((v) => v.id === it.run!.voorstelId) : it.poging?.voorstelId ? vs.find((v) => v.id === it.poging!.voorstelId) : undefined);
const manifestVan = (v?: Voorstel): Manifest | null => ((v?.pakketMeta as { manifest?: Manifest | null } | null | undefined)?.manifest) || null;
const hoofdDeelnemer = (v?: Voorstel): string => { const m = manifestVan(v); const ai = m?.deelnemers.find((d) => d.soort === 'ai'); return ai ? `${ai.naam}${ai.model?.id ? ` · ${ai.model.id}` : ''}` : m?.auteur || v?.pakketMeta?.agent || v?.pakketMeta?.auteur || ''; };

export default function Geschiedenis({ lang, context, openId, onOpenId, naarUpload, data, v2 = false, naarLog, naarDiagnose }: Props) {
  const [agent, setAgent] = useState(''); const [model, setModel] = useState('');
  const [groepOpen, setGroepOpen] = useState('');
  const [f, setF] = useState<Filter>(LEEG);
  const [zoek, setZoek] = useState('');
  const [d, setD] = useState<RunsAntwoord | null>(null);
  const [pogingen, setPogingen] = useState<PogingUit[]>([]);
  const [fout, setFout] = useState('');
  const [laadt, setLaadt] = useState(false);
  const teller = useRef(0);
  // De gekozen regel komt van buiten (openId = run-id uit «Останні розгортання») of van een klik hier (tijdlijn-id).
  const [open, setOpen] = useState('');
  useEffect(() => { if (openId) { const id = openId.includes(':') ? openId : `run:${openId}`; setOpen(id); window.setTimeout(() => document.querySelector(`[data-tl-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); } }, [openId]);
  const kies = (id: string) => { const nieuw = open === id ? '' : id; setOpen(nieuw); if (!nieuw && openId) onOpenId(''); };

  useEffect(() => { const t = window.setTimeout(() => setF((x) => (x.q === zoek.trim() ? x : { ...x, q: zoek.trim(), pagina: 1 })), 350); return () => window.clearTimeout(t); }, [zoek]);

  const laden = useCallback(async () => {
    const nr = ++teller.current;
    setLaadt(true);
    try {
      // De statusfilter geldt client-side op de hele tijdlijn (ook pogingen en voorstellen); de server krijgt alleen tekst, methode en datums.
      const r = (await api.post('/api/owner/uitrol/runs', { ...context, q: f.q, methode: f.methode, van: f.van, tot: f.tot, pagina: f.pagina, perPagina: PER_PAGINA })).data as RunsAntwoord;
      if (nr === teller.current) { setD(r); setFout(''); }
    } catch { if (nr === teller.current) setFout(tr(lang, 'Не вдалося завантажити історію.', 'De geschiedenis kon niet worden geladen.')); }
    finally { if (nr === teller.current) setLaadt(false); }
    try {
      const pg = (await api.post('/api/owner/uitrol/pogingen', { ...context, q: f.q, van: f.van, tot: f.tot, limiet: 50 })).data as PogingenAntwoord;
      if (nr === teller.current) setPogingen(pg.pogingen);
    } catch { /* de runs blijven zichtbaar; dit is een aanvulling */ }
  }, [context, f, lang]);
  useEffect(() => { void laden(); }, [laden]);
  const bezig = d?.runs.some((r) => r.staat === 'bezig');
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) void laden(); }, bezig ? 3000 : 15000); return () => window.clearInterval(t); }, [laden, bezig]);

  // Voorstellen zonder run uit het overzicht, met dezelfde tekst- en datumfilters als de server toepast op runs/pogingen.
  const voorstellen = useMemo(() => {
    const q = f.q.toLowerCase(); const van = f.van ? ms(`${f.van}T00:00:00`) : 0; const tot = f.tot ? ms(`${f.tot}T23:59:59`) : 0;
    return (data?.voorstellen || []).filter((v) => {
      const t = ms(v.beslistOp || v.bijgewerktOp || v.aangemaaktOp);
      if (van && t < van) return false; if (tot && t > tot) return false;
      if (q && !`${v.versie} ${v.commit} ${v.voorbereider} ${v.uitkomstCode} ${v.uitkomst?.reden || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data?.voorstellen, f.q, f.van, f.tot]);
  // Tijdvenster van deze pagina runs: pogingen/voorstellen alleen binnen dat venster, zodat de tijdlijn over pagina's heen op datum klopt.
  const tijdlijn = useMemo(() => {
    const runs = d?.runs || [];
    const tijden = runs.map((r) => ms(r.gestart)).filter(Boolean);
    const venster = d && d.paginas > 1 ? { van: f.pagina < d.paginas && tijden.length ? Math.min(...tijden) : undefined, tot: f.pagina > 1 && tijden.length ? Math.max(...tijden) : undefined } : undefined;
    const alles = bouwTijdlijn({ runs, pogingen, voorstellen, actieveVersie: data?.actieveVersie || '', venster });
    const vs = data?.voorstellen || [];
    return alles.filter((it) => (!f.staat.length || f.staat.includes(it.staat))
      && (!agent || (manifestVan(voorstelVan(it, vs))?.deelnemers.some((x) => x.naam === agent) || voorstelVan(it, vs)?.pakketMeta?.agent === agent))
      && (!model || !!manifestVan(voorstelVan(it, vs))?.deelnemers.some((x) => x.model?.id === model)));
  }, [d, pogingen, voorstellen, data?.actieveVersie, data?.voorstellen, f.pagina, f.staat, agent, model]);
  // Filterkeuzes alleen uit echte gegevens (manifest of AGENT van het pakket); geen verzonnen waarden.
  const keuzes = useMemo(() => { const a = new Set<string>(); const m = new Set<string>();
    for (const v of data?.voorstellen || []) { if (v.pakketMeta?.agent) a.add(v.pakketMeta.agent); for (const x of manifestVan(v)?.deelnemers || []) { if (x.soort === 'ai') a.add(x.naam); if (x.model?.id) m.add(x.model.id); } }
    return { agents: [...a].sort(), modellen: [...m].sort() }; }, [data?.voorstellen]);
  const tellers = useMemo(() => tijdlijnTellers(bouwTijdlijn({ runs: d?.runs || [], pogingen, voorstellen, actieveVersie: data?.actieveVersie || '' })), [d, pogingen, voorstellen, data?.actieveVersie]);
  const alle = Object.values(tellers).reduce((a, b) => a + b, 0);

  const wissel = <T extends string>(lijst: T[], v: T) => (lijst.includes(v) ? lijst.filter((x) => x !== v) : [...lijst, v]);
  const actief = f.q || f.staat.length || f.methode.length || f.van || f.tot;

  return <section className='ut-kaart' data-ut-geschiedenis aria-labelledby='ut-hist-titel'>
    <header className='ut-kaart-kop'>
      <div><h2 id='ut-hist-titel'>{tr(lang, 'Історія розгортань', 'Geschiedenis van uitrollen')}</h2>
        <p className='ut-sub'>{tr(lang, 'Одна стрічка за датою: встановлені, відкочені (вручну й автоматично), обірвані, невдалі й відхилені спроби. Натисніть рядок — відкриються кроки, причина і журнал.', 'Eén tijdlijn op datum: geïnstalleerd, teruggedraaid (handmatig en automatisch), afgebroken, mislukt en afgewezen. Klik op een regel voor stappen, oorzaak en logboek.')}</p></div>
    </header>

    <div className='ut-filters'>
      <label className='ut-zoek'><Search aria-hidden='true' /><input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} maxLength={80}
        placeholder={tr(lang, 'Пошук: версія, коміт, причина, хто…', 'Zoek: versie, commit, reden, wie…')} aria-label={tr(lang, 'Пошук в історії', 'Zoeken in de geschiedenis')} /></label>
      <div className='ut-chips' role='group' aria-label={tr(lang, 'Фільтр за статусом', 'Filter op status')}>
        <button type='button' className='ut-chip' aria-pressed={f.staat.length === 0} onClick={() => setF((x) => ({ ...x, staat: [], pagina: 1 }))}>{tr(lang, 'Усі', 'Alle')} <b>{alle}</b></button>
        {TIJDLIJN_STATEN.filter((s) => tellers[s] > 0 || f.staat.includes(s)).map((s) => <button key={s} type='button' className='ut-chip' data-staat={s} aria-pressed={f.staat.includes(s)} onClick={() => setF((x) => ({ ...x, staat: wissel(x.staat, s), pagina: 1 }))}>{tijdlijnStaatTekst(lang, s)} <b>{tellers[s] || 0}</b></button>)}
      </div>
      <div className='ut-filter-rij'>
        <label>{tr(lang, 'Метод', 'Methode')}
          <select data-hulp-vrij='filter' value={f.methode[0] || ''} onChange={(e) => setF((x) => ({ ...x, methode: e.target.value ? [e.target.value as Methode] : [], pagina: 1 }))}>
            <option value=''>{tr(lang, 'Усі методи', 'Alle methoden')}</option>
            {METHODEN.map((m) => <option key={m} value={m}>{methodeTekst(lang, m)}</option>)}
          </select></label>
        <label>{tr(lang, 'Від', 'Van')}<input type='date' value={f.van} max={f.tot || undefined} onChange={(e) => setF((x) => ({ ...x, van: e.target.value, pagina: 1 }))} /></label>
        <label>{tr(lang, 'До', 'Tot')}<input type='date' value={f.tot} min={f.van || undefined} onChange={(e) => setF((x) => ({ ...x, tot: e.target.value, pagina: 1 }))} /></label>
        {v2 && keuzes.agents.length > 0 && <label>{tr(lang, 'Агент', 'Agent')}<select data-hulp-vrij='filter' value={agent} onChange={(e) => setAgent(e.target.value)}><option value=''>{tr(lang, 'Усі', 'Alle')}</option>{keuzes.agents.map((x) => <option key={x}>{x}</option>)}</select></label>}
        {v2 && keuzes.modellen.length > 0 && <label>{tr(lang, 'Модель', 'Model')}<select data-hulp-vrij='filter' value={model} onChange={(e) => setModel(e.target.value)}><option value=''>{tr(lang, 'Усі', 'Alle')}</option>{keuzes.modellen.map((x) => <option key={x}>{x}</option>)}</select></label>}
        {actief || agent || model ? <button type='button' className='ut-knop' onClick={() => { setZoek(''); setF(LEEG); setAgent(''); setModel(''); }}><RotateCcw aria-hidden='true' />{tr(lang, 'Скинути', 'Wissen')}</button> : null}
      </div>
    </div>

    {fout && <p className='ut-fout' role='alert'>{fout}</p>}
    <ol className='ut-tl' aria-label={tr(lang, 'Історія розгортань', 'Geschiedenis van uitrollen')} aria-busy={laadt} data-ut-tijdlijn={tijdlijn.length}>
      {!v2 && tijdlijn.map((it) => <TijdlijnRegel key={it.id} lang={lang} context={context} item={it} open={open === it.id} onToggle={() => kies(it.id)} naarUpload={naarUpload} account={data?.ik} accounts={data?.kandidaten?.accounts} />)}
      {v2 && groepeer(tijdlijn).map((g) => {
        const regel = (it: TijdlijnItem) => { const v = voorstelVan(it, data?.voorstellen || []); return <TijdlijnRegel key={it.id} lang={lang} context={context} item={it} open={open === it.id} onToggle={() => kies(it.id)} naarUpload={naarUpload} v2 voorstel={v} hoofd={hoofdDeelnemer(v)} naarLog={naarLog} naarDiagnose={naarDiagnose} account={data?.ik} accounts={data?.kandidaten?.accounts} />; };
        if (g.items.length === 1) return regel(g.items[0]);
        const isOpen = groepOpen === g.sleutel || g.items.some((x) => x.id === open);
        return <li key={g.sleutel} className='ut-tl-groep' data-tl-groep={g.items.length} data-open={isOpen || undefined}>
          <button type='button' className='ut-tl-groep-kop' aria-expanded={isOpen} onClick={() => setGroepOpen(isOpen ? '' : g.sleutel)}>
            <b className='ut-mono'>{g.versie}</b><i className='ut-badge' data-staat='afgebroken'>{tr(lang, `${g.items.length} невдалі спроби`, `${g.items.length} mislukte pogingen`)}</i>
            <span className='ut-sub'>{datum(lang, g.items[g.items.length - 1].tijd)} – {datum(lang, g.items[0].tijd)}</span><ChevronDown className='ut-tl-pijl' aria-hidden='true' /></button>
          {isOpen && <ol className='ut-tl ut-tl-binnen'>{g.items.map(regel)}</ol>}
        </li>; })}
      {d && !tijdlijn.length && <li className='ut-leeg'>{actief ? tr(lang, 'За цими фільтрами нічого не знайдено.', 'Niets gevonden met deze filters.') : tr(lang, 'Історія ще порожня — перше розгортання з’явиться тут.', 'De geschiedenis is nog leeg — de eerste uitrol verschijnt hier.')}</li>}
      {!d && !fout && <li className='ut-leeg' role='status'>{tr(lang, 'Завантаження…', 'Laden…')}</li>}
    </ol>

    {d && d.paginas > 1 && <nav className='ut-pagina' aria-label={tr(lang, 'Сторінки', 'Pagina’s')}>
      <button type='button' className='ut-knop' disabled={f.pagina <= 1} onClick={() => setF((x) => ({ ...x, pagina: x.pagina - 1 }))}><ChevronLeft aria-hidden='true' />{tr(lang, 'Назад', 'Vorige')}</button>
      <span>{tr(lang, `Сторінка ${d.pagina} з ${d.paginas} · встановлень ${d.totaal}`, `Pagina ${d.pagina} van ${d.paginas} · installaties ${d.totaal}`)}</span>
      <button type='button' className='ut-knop' disabled={f.pagina >= d.paginas} onClick={() => setF((x) => ({ ...x, pagina: x.pagina + 1 }))}>{tr(lang, 'Далі', 'Volgende')}<ChevronRight aria-hidden='true' /></button>
    </nav>}
  </section>;
}

/** Eén regel van de tijdlijn + (opengeklapt) de details en de knop «Спробувати знову». */
function TijdlijnRegel({ lang, context, item, open, onToggle, naarUpload, v2 = false, voorstel, hoofd, naarLog, naarDiagnose, account, accounts }: { lang: Lang; context: Record<string, unknown>; item: TijdlijnItem; open: boolean; onToggle: () => void; naarUpload?: (hervat: boolean) => void; v2?: boolean; voorstel?: Voorstel; hoofd?: string; naarLog?: (runId: string) => void; naarDiagnose?: () => void; account?: Overzicht['ik']; accounts?: Overzicht['kandidaten']['accounts'] }) {
  const it = item;
  const samenvatting = it.soort === 'poging' && it.poging ? pogingOorzaak(lang, it.poging.code, it.poging.redenBekend).waarom : (lang === 'uk' ? it.uk : it.nl);
  const vg = it.poging ? voortgang(it.poging) : null;
  const duur = it.run ? runDuur(it.run) : it.poging && it.poging.bytes > 0 ? (v2 && vg ? `${tr(lang, 'етап', 'etappe')} ${vg.stap}/${vg.totaal} · ${vg.soort === 'gelezen' ? tr(lang, 'прочитано', 'gelezen') : vg.soort === 'verstuurd' ? tr(lang, 'передано', 'verstuurd') : ''} ${vg.procent}%` : `${it.poging.procent}%`) : v2 && vg ? `${tr(lang, 'етап', 'etappe')} ${vg.stap}/${vg.totaal}` : '';
  const wie = v2 && hoofd ? `${it.wie ? `${it.wie} · ` : ''}${hoofd}` : it.wie;
  const detailId = `ut-tl-d-${it.id.replace(/[^a-z0-9]/gi, '')}`;
  // Audit A5 (19.10) in de tijdlijn (23.10): Esc in de opengeklapte details klapt de regel dicht en zet de focus terug op de regelknop,
  // zodat het toetsenbord niet «verdwijnt» (vroeger: Esc sloot de la «Деталі розгортання» en focuste de sluitknop).
  const rij = useRef<HTMLButtonElement | null>(null);
  const opEsc = (e: ReactKeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onToggle(); window.setTimeout(() => rij.current?.focus(), 0); } };
  return <li className='ut-tl-item' data-tl-id={it.id} data-staat={it.staat} data-soort={it.soort} data-open={open || undefined}>
    <button ref={rij} type='button' className='ut-tl-rij' aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
      <span className='ut-tl-versie'><b className='ut-mono'>{it.versie || tr(lang, 'версія невідома', 'versie onbekend')}</b>
        {it.run?.commit && <small><CommitTekst lang={lang} commit={it.run.commit} kort /></small>}
        {it.run?.pakket?.bewaard && <small className='ut-archief-merk' data-ut-archief-merk><Archive aria-hidden='true' />{tr(lang, 'архів', 'archief')}</small>}</span>
      <span className='ut-tl-staat'><i className='ut-badge' data-staat={it.staat === 'teruggedraaid' || it.staat === 'autoterug' ? 'afgebroken' : it.staat === 'afgewezen' || it.staat === 'verlopen' ? 'geweigerd' : it.staat} data-tl-staat={it.staat}>{tijdlijnStaatTekst(lang, it.staat)}</i></span>
      <span className='ut-tl-methode'>{it.soort === 'poging' ? (it.methode === 'browser' ? <><Globe aria-hidden='true' />{tr(lang, 'повідомлено браузером', 'door de browser gemeld')}</> : <><Server aria-hidden='true' />{tr(lang, 'виявлено сервером', 'door de server vastgesteld')}</>) : methodeTekst(lang, it.methode)}{wie && <small>{wie}</small>}</span>
      <span className='ut-tl-tijd'>{datum(lang, it.tijd)}{duur && <small>{duur}</small>}</span>
      <span className='ut-tl-reden ut-reden'>{it.code && it.staat !== 'klaar' ? <b>{it.code}</b> : null} {samenvatting}</span>
      <ChevronDown className='ut-tl-pijl' aria-hidden='true' />
    </button>
    {open && <div className='ut-tl-detail' id={detailId} onKeyDown={opEsc}>
      {it.soort === 'run' && it.run && <RunDetail lang={lang} context={context} runId={it.run.id} hoogte={360} />}
      {it.soort === 'poging' && it.poging && <PogingDetail lang={lang} p={it.poging} />}
      {v2 && <Betrokkenen lang={lang} it={it} v={voorstel} account={account} accounts={accounts} />}
      {v2 && it.soort === 'poging' && it.poging && <Herstel lang={lang} acties={herstelActies(it.poging)} naarUpload={naarUpload} naarDiagnose={naarDiagnose} naarLog={naarLog && it.run ? () => naarLog(it.run!.id) : undefined} />}
      {it.soort === 'voorstel' && it.voorstel && <dl className='ut-dl'>
        <dt>{tr(lang, 'Стан', 'Stand')}</dt><dd>{VOORSTEL_STATUS[it.voorstel.status] ? tr(lang, VOORSTEL_STATUS[it.voorstel.status][0], VOORSTEL_STATUS[it.voorstel.status][1]) : it.voorstel.status}{it.code ? ` · ${it.code}` : ''}</dd>
        <dt>{tr(lang, 'Підготував', 'Voorbereid door')}</dt><dd>{it.voorstel.voorbereider} · {datumLang(lang, it.voorstel.aangemaaktOp)}</dd>
        {it.voorstel.beslistDoor && <><dt>{tr(lang, 'Вирішив', 'Besloten door')}</dt><dd>{it.voorstel.beslistDoor} · {datumLang(lang, it.voorstel.beslistOp)}</dd></>}
        {(it.voorstel.uitkomst?.reden || samenvatting) && <><dt>{tr(lang, 'Причина', 'Reden')}</dt><dd>{it.voorstel.uitkomst?.reden || samenvatting}</dd></>}
        <dt>{tr(lang, 'Коміт', 'Commit')}</dt><dd><CommitTekst lang={lang} commit={it.voorstel.pakketMeta?.commit || it.voorstel.commit} /></dd>
        <dt>{tr(lang, 'Розмір', 'Grootte')}</dt><dd>{mb(it.voorstel.bytes)}</dd>
        {it.voorstel.voorcontrole && <><dt>{tr(lang, 'Перевірка сайту', 'Voorcontrole')}</dt><dd><Voorcontrole lang={lang} v={it.voorstel.voorcontrole} /></dd></>}
      </dl>}
      {MISLUKT_STATEN.has(it.staat) && naarUpload && !(v2 && it.soort === 'poging') && <div className='ut-tl-acties' data-tl-opnieuw={it.opnieuw.kan ? 'ja' : it.opnieuw.reden}>
        <button type='button' className={`ut-knop${it.opnieuw.kan ? ' ut-knop-primair' : ''}`} disabled={!it.opnieuw.kan} aria-describedby={it.opnieuw.kan ? undefined : `${detailId}-waarom`} onClick={() => naarUpload(it.opnieuw.hervat)}>
          {it.opnieuw.hervat ? <><PlayCircle aria-hidden='true' />{tr(lang, 'Продовжити з місця зупинки', 'Hervatten waar het stopte')}</> : <><RotateCcw aria-hidden='true' />{tr(lang, 'Спробувати знову', 'Opnieuw proberen')}</>}
        </button>
        {!it.opnieuw.kan && it.opnieuw.reden && <p id={`${detailId}-waarom`} className='ut-tl-waarom'><AlertTriangle aria-hidden='true' /><span>{opnieuwRedenTekst(lang, it.opnieuw.reden)}</span></p>}
      </div>}
    </div>}
  </li>;
}

function PogingDetail({ lang, p }: { lang: Lang; p: PogingUit }) {
  const oorzaak = pogingOorzaak(lang, p.code, p.redenBekend);
  return <dl className='ut-dl' data-ut-poging-detail={p.id}>
    <dt>{tr(lang, 'Етап', 'Etappe')}</dt><dd>{etappeTekst(lang, p.etappe)}{p.bytes > 0 ? ` · ${p.procent}% · ${mb(p.verstuurd)} / ${mb(p.bytes)}` : ''}</dd>
    <dt>{tr(lang, 'Причина', 'Oorzaak')}</dt><dd><b>{oorzaak.waarom}</b>{oorzaak.doen ? <> {oorzaak.doen}</> : null}{!oorzaak.zeker && <small className='ut-sub'> · {tr(lang, 'причина невідома', 'oorzaak onbekend')}</small>}</dd>
    <dt>{tr(lang, 'Код', 'Code')}</dt><dd><code>{p.code}</code></dd>
    <dt>{tr(lang, 'Хто повідомив', 'Gemeld door')}</dt><dd>{p.gemeldDoor === 'browser' ? tr(lang, 'браузер — сервер цього обриву сам не бачив', 'de browser — de server zag deze afbreking zelf niet') : tr(lang, 'сервер', 'de server')} · {datumLang(lang, p.tijd)}</dd>
    {p.voorbereider && <><dt>{tr(lang, 'Підготував', 'Voorbereid door')}</dt><dd><UserCheck aria-hidden='true' className='ut-inline-icoon' />{p.voorbereider}</dd></>}
    {p.bestand && <><dt>{tr(lang, 'Файл', 'Bestand')}</dt><dd>{p.bestand}</dd></>}
    {p.poging > 1 && <><dt>{tr(lang, 'Спроба', 'Poging')}</dt><dd>{p.poging}</dd></>}
    {p.hervatbaar && p.ontvangen > 0 && <><dt>{tr(lang, 'На сервері', 'Op de server')}</dt><dd><Bot aria-hidden='true' className='ut-inline-icoon' />{tr(lang, `отримано ${mb(p.ontvangen)} — можна продовжити`, `${mb(p.ontvangen)} ontvangen — hervatten kan`)}</dd></>}
  </dl>;
}

/** UI-010 fase 2: wie maakte, uploadde en keurde goed, met welke methode — bewaard bij het voorstel, dus ook na het intrekken van rechten. */
function Betrokkenen({ lang, it, v, account, accounts }: { lang: Lang; it: TijdlijnItem; v?: Voorstel; account?: Overzicht['ik']; accounts?: Overzicht['kandidaten']['accounts'] }) {
  const m = manifestVan(v);
  return <dl className='ut-dl ut-betrokkenen' data-ut-betrokkenen>
    <dt>{tr(lang, 'Метод', 'Methode')}</dt><dd>{it.soort === 'poging' ? tr(lang, 'не дійшло до встановлення', 'kwam niet tot installatie') : methodeTekst(lang, it.methode)}</dd>
    {(v?.voorbereider || it.run?.voorbereider) && <><dt>{tr(lang, 'Завантажив', 'Geüpload door')}</dt><dd>{v?.voorbereider || it.run?.voorbereider}</dd></>}
    {(v?.beslistDoor || it.run?.goedgekeurdDoor) && <><dt>{tr(lang, 'Схвалив', 'Goedgekeurd door')}</dt><dd>{v?.beslistDoor || it.run?.goedgekeurdDoor}</dd></>}
    {it.run?.sha256 && <><dt>SHA-256</dt><dd><code className='ut-mono ut-breek'>{it.run.sha256}</code></dd></>}
    <dt>{tr(lang, 'Учасники', 'Deelnemers')}</dt><dd>{m ? <Deelnemers lang={lang} m={m} account={account} accounts={accounts} /> : <span className='ut-hint'>{v?.pakketMeta?.auteur || v?.pakketMeta?.agent ? `${tr(lang, 'Старий формат: ', 'Oud formaat: ')}${[v.pakketMeta.auteur, v.pakketMeta.agent].filter(Boolean).join(' · ')}` : tr(lang, 'Дані про учасників недоступні для цього запису.', 'Geen deelnemersgegevens voor deze regel.')}</span>}</dd>
  </dl>;
}

/** UI-010 fase 2: alleen acties die bij deze fout technisch echt bestaan. */
function Herstel({ lang, acties, naarUpload, naarDiagnose, naarLog }: { lang: Lang; acties: HerstelActie[]; naarUpload?: (hervat: boolean) => void; naarDiagnose?: () => void; naarLog?: () => void }) {
  const [vereisten, setVereisten] = useState(false);
  const doe = (a: HerstelActie) => { if (a === 'hervatten') naarUpload?.(true); else if (a === 'archief-kiezen' || a === 'controle-herhalen') naarUpload?.(false); else if (a === 'diagnose') naarDiagnose?.(); else if (a === 'logboek') naarLog?.(); else setVereisten((x) => !x); };
  const kan = (a: HerstelActie) => (a === 'diagnose' ? !!naarDiagnose : a === 'logboek' ? !!naarLog : a === 'vereisten' ? true : !!naarUpload);
  return <div className='ut-tl-acties' data-ut-herstel={acties.join(',')}>
    {acties.filter(kan).map((a, i) => <button key={a} type='button' className={`ut-knop${i === 0 ? ' ut-knop-primair' : ''}`} title={tr(lang, HERSTEL_TEKST[a][2], HERSTEL_TEKST[a][3])} aria-expanded={a === 'vereisten' ? vereisten : undefined} onClick={() => doe(a)}>{tr(lang, HERSTEL_TEKST[a][0], HERSTEL_TEKST[a][1])}</button>)}
    {acties.includes('archief-kiezen') && <p className='ut-hint'>{tr(lang, HERSTEL_TEKST['archief-kiezen'][2], HERSTEL_TEKST['archief-kiezen'][3])}</p>}
    {vereisten && <ul className='ut-vereisten' data-ut-vereisten>
      <li>{tr(lang, 'Одна верхня тека mijn-ruimte-<версія>/ з UITROL-VERSIE, AUTEUR, AGENT, SAMENVATTING, BRON-COMMIT і deploy/installeer-app.sh.', 'Eén bovenmap mijn-ruimte-<versie>/ met UITROL-VERSIE, AUTEUR, AGENT, SAMENVATTING, BRON-COMMIT en deploy/installeer-app.sh.')}</li>
      <li>{tr(lang, 'З 01.11.2026: UITROL-MANIFEST.json з описом українською й нідерландською та учасниками.', 'Vanaf 01.11.2026: UITROL-MANIFEST.json met beschrijving in het Oekraïens en Nederlands en de deelnemers.')}</li>
      <li>{tr(lang, 'Без посилань, абсолютних шляхів і «..»; до 300 МБ.', 'Geen links, absolute paden of «..»; maximaal 300 MB.')}</li>
      <li><small className='ut-hint'>deploy/REGELS-UITROLPAKKET.md</small></li>
    </ul>}
  </div>;
}
