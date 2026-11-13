// UI-002 — «Фото» (vlag foto-dienst): één persoonlijk fotoarchief. Onderdelen: Стрічка (tijdlijn per maand), Альбоми,
// Джерела (bronnen + import), Упорядкувати (duplicaten, gelijkende foto's). Viewer op volledig scherm voor foto en video.
// Niets wordt hier ooit uit een externe dienst verwijderd: «Прибрати з бібліотеки» ontkoppelt alleen; «Видалити копію»
// wist alleen de eigen kopie op deze server, na het intypen van een bevestigingswoord.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { zipSync } from 'fflate';
import { Archive, Check, ChevronLeft, ChevronRight, CloudOff, Copy, Download, FolderOpen, Heart, Images, Info, Layers, ListFilter, MapPin, Plus, RefreshCw, Search, Share2, ShieldCheck, Tag, Trash2, Unlink, Upload, Video, X } from 'lucide-react';
import { bronDef, type FotoAlbum, type FotoItem, type Toegang } from '../../shared/foto-model';
import { fotoClient, origineelBlob, FotoFout, type Bibliotheek, type BronStand, type ImportRegel, type Vraag } from './foto-client';
import { importeer, lijstInvoer, miniatuurEnHash, zipInvoer, type Voortgang } from './foto-import';
import { kiezerUrl } from './OudeFotos';
import type { Lang } from '../cloud-vnext/tekst';
import './foto.css';

type Deel = 'stream' | 'albums' | 'bronnen' | 'orde';
const MAANDEN_UK = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const MAANDEN_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const grootte = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} ГБ` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1e3))} КБ`);
const TOEGANG: Record<Toegang, [string, string]> = { live: ['Пряме', 'Live'], kiezer: ['Вибір вручну', 'Handmatig kiezen'], archief: ['Імпорт архіву', 'Archiefimport'], gepland: ['Заплановано', 'Gepland'] };

function foutTekst(lang: Lang, e: unknown) {
  const c = e instanceof FotoFout ? e.code : '';
  const m: Record<string, [string, string]> = {
    FOTO_DIENST_UIT: ['Розділ «Фото» вимкнено.', 'Het onderdeel «Foto’s» staat uit.'], BRON_NIET_BESCHIKBAAR: ['Оригінал зараз недоступний у джерелі.', 'Het origineel is nu niet beschikbaar in de bron.'],
    TE_GROOT_VOOR_WEERGAVE: ['Файл завеликий для перегляду тут.', 'Bestand te groot om hier te tonen.'], EIGEN_KOPIE_GEBRUIK_WISSEN: ['Це єдина копія. Щоб прибрати, видаліть копію.', 'Dit is de enige kopie. Gebruik «Kopie verwijderen».'],
    // SEC-002 (g10d, g03): grenzen en weigeringen van de fotodienst — «Спробуйте ще раз» zou hier niets oplossen.
    UPLOAD_TE_VEEL: ['Забагато одночасних завантажень. Дочекайтеся завершення інших (або скасуйте їх) і спробуйте знову.', 'Te veel gelijktijdige uploads. Wacht tot andere klaar zijn (of annuleer ze) en probeer het opnieuw.'],
    SCHIJF_VOL: ['На сервері закінчується місце — фото не збережено. Спробуйте пізніше або повідомте власника сайту.', 'De server heeft bijna geen ruimte meer — de foto is niet bewaard. Probeer het later of meld het aan de eigenaar van de site.'],
    BEZIG: ['Упорядкування вже триває. Зачекайте, доки воно завершиться.', 'Ordenen loopt al. Wacht tot het klaar is.'],
    RBAC_FORBIDDEN: ['Ваша роль — лише перегляд: змінювати фото тут не можна. Нічого не змінено.', 'Uw rol is alleen-lezen: hier kunt u geen foto’s wijzigen. Er is niets gewijzigd.'],
    RBAC_PENDING_CANNOT_MUTATE: ['Ваш обліковий запис ще чекає на схвалення: до того змінювати нічого не можна.', 'Uw account wacht nog op goedkeuring: tot dan kunt u niets wijzigen.'],
  };
  return (m[c] || ['Не вдалося. Спробуйте ще раз.', 'Mislukt. Probeer het opnieuw.'])[lang === 'uk' ? 0 : 1];
}

export default function FotoPagina({ lang }: { lang: Lang }) {
  const t = useCallback((uk: string, nl: string) => (lang === 'uk' ? uk : nl), [lang]);
  const [deel, setDeel] = useState<Deel>('stream');
  const [vraag, setVraag] = useState<Vraag>({});
  const [zoekVeld, setZoekVeld] = useState('');
  const [bib, setBib] = useState<Bibliotheek | null>(null);
  const [extra, setExtra] = useState<FotoItem[]>([]);
  const [stand, setStand] = useState<'laden' | 'klaar' | 'fout'>('laden');
  const [melding, setMelding] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [kies, setKies] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState(false);
  const toon = useCallback((m: string) => { setMelding(m); window.setTimeout(() => setMelding(''), 4000); }, []);

  const laad = useCallback(async (v: Vraag) => {
    setStand((s) => (s === 'klaar' ? s : 'laden'));
    try { const r = await fotoClient.bibliotheek(v); setBib(r); setExtra([]); setStand('klaar'); } catch { setStand('fout'); }
  }, []);
  useEffect(() => { void laad(vraag); }, [vraag, laad]);
  // Eerste bezoek: foto's uit «Хмарне сховище» opnemen (virtueel, zonder kopie). Eén keer per tabblad.
  useEffect(() => { if (sessionStorage.getItem('mr-foto-index') === '1') return; sessionStorage.setItem('mr-foto-index', '1'); void fotoClient.indexeer().then((r) => { if (r.nieuw) void laad(vraag); }).catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = window.setTimeout(() => setVraag((v) => (v.zoek ?? '') === zoekVeld.trim() ? v : { ...v, zoek: zoekVeld.trim() || undefined }), 300); return () => window.clearTimeout(h); }, [zoekVeld]);

  const items = useMemo(() => [...(bib?.items || []), ...extra], [bib, extra]);
  const meer = async () => { if (!bib?.volgende) return; const r = await fotoClient.bibliotheek({ ...vraag, token: bib.volgende }); setExtra((x) => [...x, ...r.items]); setBib((b) => (b ? { ...b, volgende: r.volgende } : b)); };
  const vervang = (n: FotoItem[]) => { const m = new Map(n.map((i) => [i.id, i])); setBib((b) => (b ? { ...b, items: b.items.map((i) => m.get(i.id) || i) } : b)); setExtra((x) => x.map((i) => m.get(i.id) || i)); };
  const actie = async (a: string, ids: string[], extraVelden: Record<string, unknown> = {}, herladen = false) => {
    try { const r = await fotoClient.item(a, ids, extraVelden); if (r.items) vervang(r.items); if (herladen || r.ok) await laad(vraag); return true; } catch (e) { toon(foutTekst(lang, e)); return false; }
  };
  const albums = bib?.albums || [];
  const actieveFilters = Object.entries(vraag).filter(([k, v]) => v !== undefined && v !== '' && v !== false && !['zoek', 'sorteer', 'oplopend', 'token'].includes(k));
  const zetFilter = (k: keyof Vraag, v: unknown) => setVraag((q) => ({ ...q, [k]: v === '' || v === false ? undefined : v }));
  const filterLabel = (k: string, v: unknown): string => {
    if (k === 'bron') return bronDef(String(v))?.naam || String(v);
    if (k === 'album') return albums.find((a) => a.id === v)?.naam || t('Альбом', 'Album');
    if (k === 'favoriet') return t('Обране', 'Favorieten'); if (k === 'verborgen') return t('Приховані', 'Verborgen'); if (k === 'metPlaats') return t('З місцем', 'Met plaats'); if (k === 'zonderDatum') return t('Без дати', 'Zonder datum');
    if (k === 'soort') return v === 'video' ? t('Відео', 'Video’s') : t('Фото', 'Foto’s');
    if (k === 'maand') return (lang === 'uk' ? MAANDEN_UK : MAANDEN_NL)[Number(v) - 1] || String(v);
    return String(v);
  };

  // ---------------------------------------------------------------- kop
  const kop = (
    <header className='foto-kop'>
      <h2><Images aria-hidden='true' />{t('Фото', 'Foto’s')}</h2>
      <nav className='foto-segment' aria-label={t('Розділи фото', 'Onderdelen foto’s')}>
        {([['stream', t('Стрічка', 'Tijdlijn')], ['albums', t('Альбоми', 'Albums')], ['bronnen', t('Джерела', 'Bronnen')], ['orde', t('Упорядкувати', 'Ordenen')]] as Array<[Deel, string]>).map(([d, l]) =>
          <button key={d} type='button' aria-pressed={deel === d} className={deel === d ? 'is-actief' : ''} onClick={() => { setDeel(d); setKies(new Set()); }} data-foto-deel={d}>{l}</button>)}
      </nav>
    </header>
  );
  const statsRegel = bib ? <p className='foto-hint' data-foto-stats='true'>{t(`${bib.stats.totaal} файлів · ${grootte(bib.stats.bytes)}`, `${bib.stats.totaal} bestanden · ${grootte(bib.stats.bytes)}`)}{bib.stats.zonderKopie ? t(` · ${bib.stats.zonderKopie} без власної копії`, ` · ${bib.stats.zonderKopie} zonder eigen kopie`) : ''}{bib.stats.onbeschikbaar ? t(` · ${bib.stats.onbeschikbaar} недоступні в джерелі`, ` · ${bib.stats.onbeschikbaar} niet beschikbaar in de bron`) : ''}</p> : null;

  return (
    <section className='foto' data-foto-pagina={deel}>
      {kop}
      {melding ? <p className='foto-toost' role='status' aria-live='polite'>{melding}</p> : null}
      {deel === 'stream' || deel === 'albums' ? (
        <div className='foto-zoekbalk'>
          <label className='foto-zoek'><Search aria-hidden='true' /><input type='search' value={zoekVeld} onChange={(e) => setZoekVeld(e.target.value)} placeholder={t('Пошук: назва, опис, тег, альбом, камера…', 'Zoeken: naam, beschrijving, tag, album, camera…')} aria-label={t('Пошук фото', 'Foto’s zoeken')} /></label>
          <button type='button' className={`foto-knop${filters || actieveFilters.length ? ' is-aan' : ''}`} aria-expanded={filters} onClick={() => setFilters((x) => !x)} data-foto-filters-knop='true'><ListFilter aria-hidden='true' /><span>{t('Фільтри', 'Filters')}{actieveFilters.length ? ` · ${actieveFilters.length}` : ''}</span></button>
        </div>
      ) : null}
      {(deel === 'stream' || deel === 'albums') && actieveFilters.length ? (
        <div className='foto-chips' aria-label={t('Активні фільтри', 'Actieve filters')}>
          {actieveFilters.map(([k, v]) => <button key={k} type='button' className='foto-chip' onClick={() => zetFilter(k as keyof Vraag, undefined)} aria-label={t(`Прибрати фільтр ${filterLabel(k, v)}`, `Filter ${filterLabel(k, v)} wissen`)}>{filterLabel(k, v)}<X aria-hidden='true' /></button>)}
          <button type='button' className='foto-chip is-leeg' onClick={() => setVraag(({ zoek, sorteer, oplopend }) => ({ zoek, sorteer, oplopend }))}>{t('Скинути все', 'Alles wissen')}</button>
        </div>
      ) : null}
      {filters && bib && (deel === 'stream' || deel === 'albums') ? <FilterPaneel lang={lang} bib={bib} vraag={vraag} zet={zetFilter} sluit={() => setFilters(false)} /> : null}

      {deel === 'stream' ? (
        <>
          {statsRegel}
          {stand === 'laden' && !bib ? <div className='foto-raster is-laden' aria-busy='true'>{Array.from({ length: 12 }, (_, k) => <i key={k} />)}</div> : null}
          {stand === 'fout' ? <p className='foto-melding is-fout' role='alert'>{t('Не вдалося завантажити бібліотеку.', 'De bibliotheek kon niet worden geladen.')} <button type='button' className='foto-knop' onClick={() => void laad(vraag)}><RefreshCw aria-hidden='true' />{t('Ще раз', 'Opnieuw')}</button></p> : null}
          {bib && !items.length ? <Leeg lang={lang} gefilterd={actieveFilters.length > 0 || !!vraag.zoek} naarBronnen={() => setDeel('bronnen')} /> : null}
          {items.length ? <Tijdlijn lang={lang} items={items} kies={kies} setKies={setKies} openen={(i) => setOpen(i)} /> : null}
          {bib?.volgende ? <button type='button' className='foto-knop foto-meer' onClick={() => void meer()}>{t('Показати ще', 'Meer tonen')}</button> : null}
        </>
      ) : null}
      {deel === 'albums' ? <Albums lang={lang} albums={albums} kiesAlbum={(id) => { setVraag((q) => ({ ...q, album: id })); setDeel('stream'); }} nieuw={async (naam) => { await fotoClient.album('nieuw', { naam }); await laad(vraag); }} hernoem={async (id, naam) => { await fotoClient.album('hernoem', { id, naam }); await laad(vraag); }} verwijder={async (id) => { await fotoClient.album('verwijder', { id }); await laad(vraag); }} /> : null}
      {deel === 'bronnen' ? <Bronnen lang={lang} naImport={() => void laad(vraag)} toon={toon} /> : null}
      {deel === 'orde' ? <Ordenen lang={lang} verberg={(ids) => actie('verberg', ids, { waarde: true }, true)} openen={(item) => { setExtra([]); setBib((b) => (b ? { ...b, items: [item] } : b)); setOpen(0); }} /> : null}

      {kies.size ? <Selectiebalk lang={lang} ids={[...kies]} albums={albums} klaar={() => setKies(new Set())} actie={actie} toon={toon} /> : null}
      {open !== null && items[open] ? <Viewer lang={lang} items={items} index={open} zet={setOpen} albums={albums} actie={actie} toon={toon} /> : null}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ tijdlijn
function Tijdlijn({ lang, items, kies, setKies, openen }: { lang: Lang; items: FotoItem[]; kies: Set<string>; setKies: (s: Set<string>) => void; openen: (i: number) => void }) {
  const groepen = useMemo(() => {
    const g: Array<{ sleutel: string; titel: string; idx: number[] }> = [];
    items.forEach((i, k) => {
      const s = i.genomenOp ? i.genomenOp.slice(0, 7) : 'zonder';
      const titel = i.genomenOp ? `${(lang === 'uk' ? MAANDEN_UK : MAANDEN_NL)[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : (lang === 'uk' ? 'Без дати' : 'Zonder datum');
      const laatste = g[g.length - 1]; if (laatste && laatste.sleutel === s) laatste.idx.push(k); else g.push({ sleutel: s, titel, idx: [k] });
    });
    return g;
  }, [items, lang]);
  const kiesModus = kies.size > 0;
  const wissel = (id: string) => { const n = new Set(kies); if (n.has(id)) n.delete(id); else n.add(id); setKies(n); };
  return (
    <div className='foto-tijdlijn'>
      {groepen.map((g) => (
        <section key={g.sleutel} className='foto-maand' aria-label={g.titel}>
          <h3>{g.titel}</h3>
          <div className='foto-raster'>
            {g.idx.map((k) => { const i = items[k]; const gekozen = kies.has(i.id); return (
              <div key={i.id} className={`foto-tegel${gekozen ? ' is-gekozen' : ''}`} data-foto-id={i.id}>
                <button type='button' className='foto-tegel-open' onClick={() => (kiesModus ? wissel(i.id) : openen(k))} aria-label={`${i.titel}${i.genomenOp ? `, ${i.genomenOp.slice(0, 10)}` : ''}`}
                  onContextMenu={(e) => { e.preventDefault(); wissel(i.id); }}>
                  <Miniatuur item={i} />
                  {i.soort === 'video' ? <span className='foto-tegel-video'><Video aria-hidden='true' /></span> : null}
                  {i.favoriet ? <span className='foto-tegel-hart'><Heart aria-hidden='true' /></span> : null}
                  {!i.beschikbaar ? <span className='foto-tegel-weg' title={lang === 'uk' ? 'Недоступно в джерелі' : 'Niet beschikbaar in de bron'}><CloudOff aria-hidden='true' /></span> : null}
                </button>
                <button type='button' className='foto-tegel-kies' aria-pressed={gekozen} aria-label={lang === 'uk' ? 'Вибрати' : 'Selecteren'} onClick={() => wissel(i.id)}><Check aria-hidden='true' /></button>
              </div>); })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Miniatuur: uit de bibliotheek, of (voor foto's uit «Хмарне сховище» zonder miniatuur) één keer maken en bewaren.
const wachtrij: Array<() => Promise<void>> = []; let bezig = 0;
const draai = () => { while (bezig < 2 && wachtrij.length) { const f = wachtrij.shift()!; bezig++; void f().finally(() => { bezig--; draai(); }); } };
function Miniatuur({ item }: { item: FotoItem }) {
  const [src, setSrc] = useState(item.miniatuur);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { setSrc(item.miniatuur); }, [item.miniatuur]);
  useEffect(() => {
    if (src || item.soort !== 'foto' || !item.beschikbaar || item.bytes > 40 * 1024 * 1024 || !ref.current || typeof IntersectionObserver === 'undefined') return;
    let weg = false;
    const io = new IntersectionObserver((e) => { if (!e[0]?.isIntersecting) return; io.disconnect(); wachtrij.push(async () => {
      if (weg) return;
      try { const b = await origineelBlob(item.id); const m = await miniatuurEnHash(new Uint8Array(await b.arrayBuffer()), b.type); if (m && !weg) { setSrc(m.miniatuur); await fotoClient.item('miniatuur', [item.id], m); } } catch { /* blijft een vlak */ }
    }); draai(); }, { rootMargin: '200px' });
    io.observe(ref.current); return () => { weg = true; io.disconnect(); };
  }, [src, item]);
  return <span ref={ref} className='foto-mini'>{src ? <img src={src} alt='' loading='lazy' decoding='async' /> : item.soort === 'video' ? <Video aria-hidden='true' /> : <Images aria-hidden='true' />}</span>;
}

function Leeg({ lang, gefilterd, naarBronnen }: { lang: Lang; gefilterd: boolean; naarBronnen: () => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (gefilterd) return <p className='foto-hint'>{t('Нічого не знайдено з цими умовами.', 'Niets gevonden met deze voorwaarden.')}</p>;
  return <div className='foto-leeg' data-foto-leeg='true'><Images aria-hidden='true' /><h3>{t('Зберіть усю свою фотоісторію тут', 'Breng uw hele fotogeschiedenis hier samen')}</h3><p>{t('Фото з «Хмарного сховища» з’являються самі. Інші — імпортуйте з Google, Instagram, Facebook, VK, Telegram, ZIP чи теки.', 'Foto’s uit «Cloudopslag» verschijnen vanzelf. Andere importeert u uit Google, Instagram, Facebook, VK, Telegram, ZIP of een map.')}</p><button type='button' className='foto-knop is-hoofd' onClick={naarBronnen}><Plus aria-hidden='true' />{t('Додати фото', 'Foto’s toevoegen')}</button></div>;
}

// ------------------------------------------------------------------------------------------------ filters
function FilterPaneel({ lang, bib, vraag, zet, sluit }: { lang: Lang; bib: Bibliotheek; vraag: Vraag; zet: (k: keyof Vraag, v: unknown) => void; sluit: () => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const jaren = Object.entries(bib.facetten.jaren).filter(([j]) => j !== 'onbekend').sort((a, b) => b[0].localeCompare(a[0]));
  const bronnen = Object.entries(bib.facetten.bronnen).sort((a, b) => b[1] - a[1]);
  const formaten = Object.entries(bib.facetten.formaten).sort((a, b) => b[1] - a[1]);
  const cameras = Object.entries(bib.facetten.cameras).filter(([c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const keuze = (label: string, k: keyof Vraag, opties: Array<[string, string]>, getal = false) => (
    <label className='foto-veld'><span>{label}</span><select value={String(vraag[k] ?? '')} onChange={(e) => zet(k, e.target.value ? (getal ? Number(e.target.value) : e.target.value) : undefined)}><option value=''>{t('Усі', 'Alle')}</option>{opties.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select></label>);
  const vink = (label: string, k: keyof Vraag) => <label className='foto-vink'><input type='checkbox' checked={vraag[k] === true} onChange={(e) => zet(k, e.target.checked)} />{label}</label>;
  return (
    <div className='foto-filters' role='region' aria-label={t('Фільтри', 'Filters')} onKeyDown={(e) => { if (e.key === 'Escape') sluit(); }}>
      <div className='foto-filters-rij'>
        {keuze(t('Рік', 'Jaar'), 'jaar', jaren.map(([j, n]) => [j, `${j} · ${n}`]), true)}
        {vraag.jaar ? keuze(t('Місяць', 'Maand'), 'maand', (lang === 'uk' ? MAANDEN_UK : MAANDEN_NL).map((m, k) => [String(k + 1), m]), true) : null}
        {keuze(t('Джерело', 'Bron'), 'bron', bronnen.map(([b, n]) => [b, `${bronDef(b)?.naam || b} · ${n}`]))}
        {keuze(t('Тип', 'Soort'), 'soort', [['foto', t('Фото', 'Foto’s')], ['video', t('Відео', 'Video’s')]])}
        {keuze(t('Формат', 'Formaat'), 'formaat', formaten.map(([f, n]) => [f, `${f.toUpperCase()} · ${n}`]))}
        {cameras.length ? keuze(t('Камера', 'Camera'), 'camera', cameras.map(([c, n]) => [c, `${c} · ${n}`])) : null}
      </div>
      <div className='foto-filters-rij'>
        <label className='foto-veld'><span>{t('Від', 'Van')}</span><input type='date' value={vraag.van?.slice(0, 10) || ''} onChange={(e) => zet('van', e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined)} /></label>
        <label className='foto-veld'><span>{t('До', 'Tot')}</span><input type='date' value={vraag.tot?.slice(0, 10) || ''} onChange={(e) => zet('tot', e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)} /></label>
        <label className='foto-veld'><span>{t('Порядок', 'Volgorde')}</span><select value={`${vraag.sorteer || 'genomen'}:${vraag.oplopend ? 'op' : 'af'}`} onChange={(e) => { const [s, r] = e.target.value.split(':'); zet('sorteer', s === 'genomen' ? undefined : s); zet('oplopend', r === 'op'); }}>
          <option value='genomen:af'>{t('Спершу нові', 'Nieuwste eerst')}</option><option value='genomen:op'>{t('Спершу старі', 'Oudste eerst')}</option><option value='toegevoegd:af'>{t('Нещодавно додані', 'Recent toegevoegd')}</option><option value='grootte:af'>{t('Найбільші', 'Grootste')}</option><option value='naam:op'>{t('За назвою', 'Op naam')}</option></select></label>
      </div>
      <div className='foto-filters-rij is-vinkjes'>{vink(t('Обране', 'Favorieten'), 'favoriet')}{vink(t('З місцем', 'Met plaats'), 'metPlaats')}{vink(t('Без дати', 'Zonder datum'), 'zonderDatum')}{vink(t('Приховані', 'Verborgen'), 'verborgen')}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ selectie
function Selectiebalk({ lang, ids, albums, klaar, actie, toon }: { lang: Lang; ids: string[]; albums: FotoAlbum[]; klaar: () => void; actie: (a: string, ids: string[], e?: Record<string, unknown>, h?: boolean) => Promise<boolean>; toon: (m: string) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [bezig, setBezig] = useState(false);
  const exporteer = async () => {
    setBezig(true);
    try {
      const meta = await fotoClient.exporteer(ids); const bestanden: Record<string, Uint8Array> = {}; const namen = new Set<string>();
      for (const i of meta.items) { try { const b = new Uint8Array(await (await origineelBlob(i.id)).arrayBuffer()); let n = i.naam; let k = 1; while (namen.has(n)) n = i.naam.replace(/(\.[^.]+)?$/, `-${k++}$1`); namen.add(n); bestanden[n] = b; } catch { /* niet beschikbaar: alleen metadata */ } }
      bestanden['metadata.json'] = new TextEncoder().encode(JSON.stringify(meta, null, 2));
      const zip = zipSync(bestanden, { level: 0 }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' })); a.download = `foto-export-${new Date().toISOString().slice(0, 10)}.zip`; a.click(); window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } catch { toon(t('Експорт не вдався.', 'Export mislukt.')); }
    setBezig(false);
  };
  return (
    <div className='foto-selectie' role='toolbar' aria-label={t('Дії з вибраними', 'Acties voor selectie')}>
      <button type='button' className='foto-knop is-ikoon' onClick={klaar} aria-label={t('Скасувати вибір', 'Selectie opheffen')}><X aria-hidden='true' /></button>
      <strong>{ids.length}</strong>
      <button type='button' className='foto-knop is-ikoon' disabled={bezig} onClick={() => void actie('favoriet', ids, { waarde: true })} aria-label={t('В обране', 'Favoriet')} title={t('В обране', 'Favoriet')}><Heart aria-hidden='true' /></button>
      {albums.length ? <select className='foto-select' aria-label={t('Додати до альбому', 'Aan album toevoegen')} value='' onChange={(e) => { if (e.target.value) void actie('album-erbij', ids, { album: e.target.value }, true).then((ok) => ok && toon(t('Додано до альбому.', 'Aan album toegevoegd.'))); }}><option value=''>{t('До альбому…', 'Naar album…')}</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}</select> : null}
      <button type='button' className='foto-knop is-ikoon' disabled={bezig} onClick={() => void exporteer()} aria-label={t('Експорт ZIP', 'Export ZIP')} title={t('Експорт ZIP з оригіналами й метаданими', 'Export ZIP met originelen en metadata')}><Archive aria-hidden='true' /></button>
      <button type='button' className='foto-knop is-ikoon' disabled={bezig} onClick={() => void actie('kopieer', ids, {}, true).then((ok) => ok && toon(t('Власні копії збережено.', 'Eigen kopieën bewaard.')))} aria-label={t('Зберегти власні копії', 'Eigen kopieën bewaren')} title={t('Зберегти власні копії', 'Eigen kopieën bewaren')}><ShieldCheck aria-hidden='true' /></button>
      <button type='button' className='foto-knop is-ikoon' disabled={bezig} onClick={() => void actie('verberg', ids, { waarde: true }, true).then(klaar)} aria-label={t('Приховати', 'Verbergen')} title={t('Приховати з бібліотеки (файли лишаються)', 'Verbergen (bestanden blijven)')}><Layers aria-hidden='true' /></button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ viewer
function Viewer({ lang, items, index, zet, albums, actie, toon }: { lang: Lang; items: FotoItem[]; index: number; zet: (i: number | null) => void; albums: FotoAlbum[]; actie: (a: string, ids: string[], e?: Record<string, unknown>, h?: boolean) => Promise<boolean>; toon: (m: string) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const item = items[index];
  const [url, setUrl] = useState(''); const [fout, setFout] = useState(''); const [info, setInfo] = useState(() => window.innerWidth >= 1100);
  const [tagNieuw, setTagNieuw] = useState(''); const [bevestig, setBevestig] = useState<'' | 'ontkoppel' | 'wis'>(''); const [woord, setWoord] = useState('');
  const sluitRef = useRef<HTMLButtonElement>(null); const veeg = useRef<number | null>(null);
  useEffect(() => { let weg = false, u = ''; setUrl(''); setFout(''); setBevestig('');
    if (!item.beschikbaar) { setFout(t('Оригінал зараз недоступний у джерелі.', 'Het origineel is nu niet beschikbaar in de bron.')); return; }
    origineelBlob(item.id).then((b) => { if (weg) return; u = URL.createObjectURL(b); setUrl(u); }).catch((e) => !weg && setFout(foutTekst(lang, e)));
    return () => { weg = true; if (u) URL.revokeObjectURL(u); }; }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sluitRef.current?.focus(); const vorige = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = vorige; }; }, []);
  const naar = (d: number) => { const n = index + d; if (n >= 0 && n < items.length) zet(n); };
  const toets = (e: React.KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'Escape') zet(null); if (e.key === 'ArrowRight') naar(1); if (e.key === 'ArrowLeft') naar(-1); };
  const download = () => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = item.naam; a.click(); };
  const deel = async () => { try { const b = await (await fetch(url)).blob(); const f = new File([b], item.naam, { type: b.type }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: item.titel }); else toon(t('Цей пристрій не вміє ділитися файлами. Завантажте оригінал.', 'Dit apparaat kan geen bestanden delen. Download het origineel.')); } catch { /* geannuleerd */ } };
  const herkomstNaam = (b: string) => bronDef(b)?.naam || b;
  const albumNaam = (id: string) => albums.find((a) => a.id === id)?.naam || id;
  return createPortal(
    <div className='foto-viewer' role='dialog' aria-modal='true' aria-label={item.titel} onKeyDown={toets} data-foto-viewer='true'>
      <div className='foto-viewer-balk'>
        <button ref={sluitRef} type='button' className='foto-knop is-ikoon' onClick={() => zet(null)} aria-label={t('Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
        <span className='foto-viewer-titel'>{item.titel}</span>
        <button type='button' className={`foto-knop is-ikoon${item.favoriet ? ' is-aan' : ''}`} aria-pressed={item.favoriet} onClick={() => void actie('favoriet', [item.id], { waarde: !item.favoriet })} aria-label={t('Обране', 'Favoriet')} title={t('Обране', 'Favoriet')}><Heart aria-hidden='true' /></button>
        <button type='button' className='foto-knop is-ikoon' disabled={!url} onClick={download} aria-label={t('Завантажити оригінал', 'Origineel downloaden')} title={t('Завантажити оригінал', 'Origineel downloaden')}><Download aria-hidden='true' /></button>
        <button type='button' className='foto-knop is-ikoon' disabled={!url} onClick={() => void deel()} aria-label={t('Поділитися', 'Delen')} title={t('Поділитися', 'Delen')}><Share2 aria-hidden='true' /></button>
        <button type='button' className={`foto-knop is-ikoon${info ? ' is-aan' : ''}`} aria-pressed={info} onClick={() => setInfo((x) => !x)} aria-label={t('Про файл', 'Over dit bestand')} title={t('Про файл', 'Over dit bestand')}><Info aria-hidden='true' /></button>
      </div>
      <div className={`foto-viewer-lijf${info ? ' met-info' : ''}`}>
        <div className='foto-viewer-beeld' onPointerDown={(e) => { veeg.current = e.clientX; }} onPointerUp={(e) => { if (veeg.current !== null && Math.abs(e.clientX - veeg.current) > 60) naar(e.clientX < veeg.current ? 1 : -1); veeg.current = null; }}>
          {fout ? <p className='foto-melding is-fout'>{fout}</p> : !url ? <span className='foto-spinner' aria-busy='true' /> : item.soort === 'video' ? <video src={url} controls playsInline /> : <img src={url} alt={item.beschrijving || item.titel} />}
          {index > 0 ? <button type='button' className='foto-pijl is-links' onClick={() => naar(-1)} aria-label={t('Попереднє', 'Vorige')}><ChevronLeft aria-hidden='true' /></button> : null}
          {index < items.length - 1 ? <button type='button' className='foto-pijl is-rechts' onClick={() => naar(1)} aria-label={t('Наступне', 'Volgende')}><ChevronRight aria-hidden='true' /></button> : null}
        </div>
        {info ? (
          <aside className='foto-info' aria-label={t('Про файл', 'Over dit bestand')}>
            <dl>
              <dt>{t('Дата', 'Datum')}</dt><dd>{item.genomenOp ? new Date(item.genomenOp).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL') : t('невідома', 'onbekend')}{item.genomenOp ? <small> · {({ exif: t('з камери', 'uit camera'), sidecar: t('з архіву', 'uit archief'), bestand: t('з файлу', 'uit bestand'), onbekend: '' } as Record<string, string>)[item.datumBron]}</small> : null}</dd>
              {item.camera ? <><dt>{t('Камера', 'Camera')}</dt><dd>{item.camera}</dd></> : null}
              <dt>{t('Файл', 'Bestand')}</dt><dd>{item.naam} · {grootte(item.bytes)}{item.breedte ? ` · ${item.breedte}×${item.hoogte}` : ''}</dd>
              {item.plaats ? <><dt>{t('Місце', 'Plaats')}</dt><dd><a href={`https://www.openstreetmap.org/?mlat=${item.plaats.lat}&mlon=${item.plaats.lon}#map=14/${item.plaats.lat}/${item.plaats.lon}`} target='_blank' rel='noopener noreferrer'><MapPin aria-hidden='true' />{item.plaats.lat.toFixed(4)}, {item.plaats.lon.toFixed(4)}</a></dd></> : null}
              {item.beschrijving ? <><dt>{t('Опис', 'Beschrijving')}</dt><dd>{item.beschrijving}</dd></> : null}
              <dt>{t('Походження', 'Herkomst')}</dt><dd><ul className='foto-herkomst'>{item.herkomst.map((h, k) => <li key={k}><strong>{herkomstNaam(h.bron)}</strong>{h.archief ? ` · ${h.archief}` : ''}{h.pad ? <small> {h.pad}</small> : null}</li>)}</ul></dd>
              <dt>{t('Збереження', 'Bewaring')}</dt><dd>{item.opslag === 'eigen' ? t('Власна копія на вашому сервері', 'Eigen kopie op uw server') : t('Лише у «Хмарному сховищі» (без окремої копії)', 'Alleen in «Cloudopslag» (geen aparte kopie)')}{item.backup.gecontroleerdOp ? <small> · {item.backup.ok ? t('перевірено ✓', 'gecontroleerd ✓') : t('перевірка не пройшла', 'controle mislukt')}</small> : null}</dd>
              {item.albums.length ? <><dt>{t('Альбоми', 'Albums')}</dt><dd>{item.albums.map(albumNaam).join(', ')}</dd></> : null}
              <dt>{t('Теги', 'Tags')}</dt><dd><div className='foto-chips'>{item.tags.map((g) => <button key={g} type='button' className='foto-chip' onClick={() => void actie('tags', [item.id], { tags: item.tags.filter((x) => x !== g) })} aria-label={t(`Прибрати тег ${g}`, `Tag ${g} wissen`)}><Tag aria-hidden='true' />{g}<X aria-hidden='true' /></button>)}
                <form onSubmit={(e) => { e.preventDefault(); if (tagNieuw.trim()) void actie('tag-erbij', [item.id], { tag: tagNieuw }).then(() => setTagNieuw('')); }}><input value={tagNieuw} onChange={(e) => setTagNieuw(e.target.value)} placeholder={t('+ тег', '+ tag')} aria-label={t('Новий тег', 'Nieuwe tag')} /></form></div></dd>
            </dl>
            <div className='foto-info-acties'>
              {item.opslag === 'cloud' ? <button type='button' className='foto-knop' onClick={() => void actie('kopieer', [item.id]).then((ok) => ok && toon(t('Копію збережено.', 'Kopie bewaard.')))}><Copy aria-hidden='true' />{t('Зберегти власну копію', 'Eigen kopie bewaren')}</button>
                : <button type='button' className='foto-knop' onClick={() => void actie('controleer', [item.id])}><ShieldCheck aria-hidden='true' />{t('Перевірити копію', 'Kopie controleren')}</button>}
              {item.opslag === 'cloud' ? <button type='button' className='foto-knop' onClick={() => setBevestig('ontkoppel')}><Unlink aria-hidden='true' />{t('Прибрати з бібліотеки', 'Uit bibliotheek halen')}</button>
                : <button type='button' className='foto-knop is-gevaar' onClick={() => setBevestig('wis')}><Trash2 aria-hidden='true' />{t('Видалити копію', 'Kopie verwijderen')}</button>}
            </div>
            {bevestig === 'ontkoppel' ? <div className='foto-bevestig' role='alertdialog' aria-label={t('Підтвердження', 'Bevestiging')}><p>{t('Фото зникне з бібліотеки. Файл у «Хмарному сховищі» лишиться.', 'De foto verdwijnt uit de bibliotheek. Het bestand in «Cloudopslag» blijft.')}</p><button type='button' className='foto-knop' onClick={() => setBevestig('')}>{t('Скасувати', 'Annuleren')}</button><button type='button' className='foto-knop is-hoofd' onClick={() => void actie('ontkoppel', [item.id]).then((ok) => ok && zet(null))}>{t('Прибрати', 'Weghalen')}</button></div> : null}
            {bevestig === 'wis' ? <div className='foto-bevestig' role='alertdialog' aria-label={t('Підтвердження', 'Bevestiging')}><p>{t('Буде видалено власну копію на цьому сервері. Оригінали в інших сервісах ми не чіпаємо. Введіть WISSEN.', 'De eigen kopie op deze server wordt gewist. Originelen in andere diensten raken we niet aan. Typ WISSEN.')}</p><input value={woord} onChange={(e) => setWoord(e.target.value)} aria-label='WISSEN' autoComplete='off' /><button type='button' className='foto-knop' onClick={() => setBevestig('')}>{t('Скасувати', 'Annuleren')}</button><button type='button' className='foto-knop is-gevaar' disabled={woord !== 'WISSEN'} onClick={() => void actie('wis', [item.id], { bevestiging: woord }).then((ok) => ok && zet(null))}>{t('Видалити', 'Verwijderen')}</button></div> : null}
          </aside>
        ) : null}
      </div>
    </div>, document.body);
}

// ------------------------------------------------------------------------------------------------ albums
function Albums({ lang, albums, kiesAlbum, nieuw, hernoem, verwijder }: { lang: Lang; albums: FotoAlbum[]; kiesAlbum: (id: string) => void; nieuw: (n: string) => Promise<void>; hernoem: (id: string, n: string) => Promise<void>; verwijder: (id: string) => Promise<void> }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [naam, setNaam] = useState('');
  return (
    <div className='foto-albums'>
      <form className='foto-zoekbalk' onSubmit={(e) => { e.preventDefault(); if (naam.trim()) void nieuw(naam.trim()).then(() => setNaam('')); }}>
        <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={t('Назва нового альбому', 'Naam nieuw album')} aria-label={t('Назва нового альбому', 'Naam nieuw album')} />
        <button type='submit' className='foto-knop is-hoofd' disabled={!naam.trim()}><Plus aria-hidden='true' />{t('Створити', 'Maken')}</button>
      </form>
      {!albums.length ? <p className='foto-hint'>{t('Альбомів ще немає. Під час імпорту альбоми з архівів відновлюються самі.', 'Nog geen albums. Bij import worden albums uit archieven vanzelf hersteld.')}</p> : null}
      <div className='foto-album-raster'>
        {albums.map((a) => (
          <article key={a.id} className='foto-album'>
            <button type='button' className='foto-album-open' onClick={() => kiesAlbum(a.id)}>
              <span className='foto-mini'>{a.omslag ? <img src={a.omslag} alt='' /> : <FolderOpen aria-hidden='true' />}</span>
              <strong>{a.naam}</strong><small>{a.aantal} · {bronDef(a.bron)?.naam || a.bron}</small>
            </button>
            <details className='foto-album-meer'><summary aria-label={t('Дії з альбомом', 'Albumacties')}>⋯</summary>
              <div><button type='button' onClick={() => { const n = prompt(t('Нова назва', 'Nieuwe naam'), a.naam); if (n?.trim()) void hernoem(a.id, n.trim()); }}>{t('Перейменувати', 'Hernoemen')}</button>
                <button type='button' onClick={() => { if (confirm(t('Видалити альбом? Фото лишаться в бібліотеці.', 'Album verwijderen? De foto’s blijven in de bibliotheek.'))) void verwijder(a.id); }}>{t('Видалити альбом', 'Album verwijderen')}</button></div></details>
          </article>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ bronnen en import
function Bronnen({ lang, naImport, toon }: { lang: Lang; naImport: () => void; toon: (m: string) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [lijst, setLijst] = useState<BronStand[] | null>(null); const [imports, setImports] = useState<ImportRegel[]>([]);
  const [voortgang, setVoortgang] = useState<Voortgang | null>(null); const stop = useRef(false);
  const zipRef = useRef<HTMLInputElement>(null); const mapRef = useRef<HTMLInputElement>(null); const losRef = useRef<HTMLInputElement>(null); const doelBron = useRef('map');
  const laad = useCallback(() => fotoClient.bronnen().then((r) => { setLijst(r.bronnen); setImports(r.imports); }).catch(() => setLijst([])), []);
  useEffect(() => { void laad(); }, [laad]);
  const start = async (invoer: Promise<Parameters<typeof importeer>[0]>, archief: string) => {
    stop.current = false; setVoortgang({ fase: 'lezen', gedaan: 0, totaal: 0, nieuw: 0, bekend: 0, overgeslagen: 0, mislukt: 0 });
    try {
      const r = await importeer(await invoer, { archief, bronId: doelBron.current, opVoortgang: setVoortgang, afgebroken: () => stop.current });
      toon(t(`Готово: нових ${r.nieuw}, уже були ${r.bekend}${r.mislukt ? `, не вдалося ${r.mislukt}` : ''}.`, `Klaar: nieuw ${r.nieuw}, al aanwezig ${r.bekend}${r.mislukt ? `, mislukt ${r.mislukt}` : ''}.`));
      naImport(); void laad();
    } catch { toon(t('Не вдалося прочитати архів.', 'Het archief kon niet worden gelezen.')); setVoortgang(null); }
  };
  const kiesBestand = (bron: string, soort: 'zip' | 'map' | 'los') => { doelBron.current = bron; (soort === 'zip' ? zipRef : soort === 'map' ? mapRef : losRef).current?.click(); };
  const groepen: Array<[BronStand['groep'], string]> = [['eigen', t('Ваше сховище', 'Uw opslag')], ['cloud', t('Хмарні сервіси', 'Clouddiensten')], ['sociaal', t('Соцмережі й месенджери', 'Sociale netwerken en chat')], ['apparaat', t('Пристрої й архіви', 'Apparaten en archieven')]];
  return (
    <div className='foto-bronnen'>
      <input ref={zipRef} type='file' accept='.zip,application/zip' hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void start(zipInvoer(f), f.name); }} />
      <input ref={mapRef} type='file' hidden multiple {...({ webkitdirectory: '' } as Record<string, string>)} onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) void start(lijstInvoer(l), (l[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || t('тека', 'map')); }} />
      <input ref={losRef} type='file' hidden multiple accept='image/*,video/*' onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) void start(lijstInvoer(l), t('завантаження', 'upload')); }} />
      {voortgang ? (
        <div className='foto-voortgang' role='status' aria-live='polite' data-foto-voortgang={voortgang.fase}>
          <div><strong>{voortgang.fase === 'klaar' ? t('Імпорт завершено', 'Import klaar') : voortgang.fase === 'lezen' ? t('Читаємо архів…', 'Archief lezen…') : t('Імпорт…', 'Importeren…')}</strong>
            <small>{voortgang.gedaan}/{voortgang.totaal} · {t('нових', 'nieuw')} {voortgang.nieuw} · {t('вже були', 'al aanwezig')} {voortgang.bekend}{voortgang.mislukt ? ` · ${t('помилок', 'fouten')} ${voortgang.mislukt}` : ''}</small></div>
          <progress max={Math.max(1, voortgang.totaal)} value={voortgang.gedaan} />
          {voortgang.fase === 'klaar' ? <button type='button' className='foto-knop' onClick={() => setVoortgang(null)}>{t('Закрити', 'Sluiten')}</button> : <button type='button' className='foto-knop' onClick={() => { stop.current = true; }}>{t('Зупинити', 'Stoppen')}</button>}
        </div>
      ) : null}
      {!lijst ? <p className='foto-hint' aria-busy='true'>{t('Завантаження…', 'Laden…')}</p> : groepen.map(([g, titel]) => (
        <section key={g} className='foto-bron-groep'><h3>{titel}</h3>
          <ul>{lijst.filter((b) => b.groep === g).map((b) => (
            <li key={b.id} className='foto-bron' data-foto-bron={b.id}>
              <div className='foto-bron-kop'><strong>{b.naam}</strong><span className='foto-bron-teller'>{b.aantal}</span></div>
              <div className='foto-bron-standen'>{b.toegang.map((s) => <span key={s} className={`foto-stand is-${s}`}>{TOEGANG[s][lang === 'uk' ? 0 : 1]}</span>)}</div>
              <p>{b.uitleg[lang]}</p>
              {b.archief || b.gepland ? <details className='foto-bron-uitleg'><summary>{t('Як отримати файли', 'Hoe krijgt u de bestanden')}</summary>{b.archief ? <p>{b.archief[lang]}</p> : null}{b.gepland ? <p className='foto-hint'>{b.gepland[lang]}</p> : null}</details> : null}
              <div className='foto-bron-acties'>
                {b.id === 'eigen' ? <button type='button' className='foto-knop is-hoofd' disabled={!!voortgang && voortgang.fase !== 'klaar'} onClick={() => kiesBestand('eigen', 'los')}><Upload aria-hidden='true' />{t('Завантажити фото', 'Foto’s uploaden')}</button> : null}
                {b.id === 'cloud' ? <button type='button' className='foto-knop' onClick={() => void fotoClient.indexeer().then((r) => { toon(t(`Додано ${r.nieuw}.`, `${r.nieuw} toegevoegd.`)); naImport(); void laad(); }).catch(() => toon(t('Не вдалося.', 'Mislukt.')))}><RefreshCw aria-hidden='true' />{t('Оновити', 'Bijwerken')}</button> : null}
                {b.toegang.includes('kiezer') ? <a className='foto-knop' href={kiezerUrl(lang)}>{t('Вибрати в Google Фото', 'Kiezen in Google Foto’s')}</a> : null}
                {b.toegang.includes('archief') ? <><button type='button' className='foto-knop' disabled={!!voortgang && voortgang.fase !== 'klaar'} onClick={() => kiesBestand(b.id, 'zip')}><Archive aria-hidden='true' />ZIP</button><button type='button' className='foto-knop' disabled={!!voortgang && voortgang.fase !== 'klaar'} onClick={() => kiesBestand(b.id, 'map')}><FolderOpen aria-hidden='true' />{t('Тека', 'Map')}</button></> : null}
              </div>
            </li>))}</ul>
        </section>
      ))}
      <p className='foto-hint'>{t('Великі архіви (понад 2 ГБ) краще спершу розпакувати й імпортувати як теку: так браузер читає файли по одному.', 'Grote archieven (boven 2 GB) beter eerst uitpakken en als map importeren: dan leest de browser de bestanden één voor één.')}</p>
      {imports.length ? <section className='foto-bron-groep'><h3>{t('Історія імпорту', 'Importgeschiedenis')}</h3><ul className='foto-imports'>{imports.map((i) => <li key={i.id}><strong>{bronDef(i.bron)?.naam || i.bron}</strong> · {i.archief} <small>{new Date(i.createdAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL')} · +{i.nieuw} · ={i.bekend}{i.mislukt ? ` · ✕${i.mislukt}` : ''}{i.klaar ? '' : ` · ${t('не завершено', 'onderbroken')}`}</small></li>)}</ul></section> : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ ordenen
function Ordenen({ lang, verberg, openen }: { lang: Lang; verberg: (ids: string[]) => Promise<boolean>; openen: (i: FotoItem) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [r, setR] = useState<Awaited<ReturnType<typeof fotoClient.organiseer>> | null>(null);
  const laad = useCallback(() => fotoClient.organiseer().then(setR).catch(() => setR({ duplicaten: [], gelijkend: [] })), []);
  useEffect(() => { void laad(); }, [laad]);
  if (!r) return <p className='foto-hint' aria-busy='true'>{t('Аналізуємо бібліотеку…', 'Bibliotheek analyseren…')}</p>;
  const rij = (items: FotoItem[], knop: ReactNode) => <div className='foto-orde-rij'><div className='foto-orde-beelden'>{items.slice(0, 8).map((i) => <button key={i.id} type='button' className='foto-tegel-open' onClick={() => openen(i)} aria-label={i.titel}><Miniatuur item={i} /><small>{i.bron === 'cloud' ? 'Cloud' : bronDef(i.bron)?.naam}</small></button>)}</div>{knop}</div>;
  return (
    <div className='foto-orde'>
      <section className='foto-bron-groep'><h3>{t('Дублікати', 'Duplicaten')} · {r.duplicaten.length}</h3>
        {!r.duplicaten.length ? <p className='foto-hint'>{t('Дублікатів не знайдено. Однакові файли під час імпорту й так зберігаються один раз.', 'Geen duplicaten. Identieke bestanden worden bij import sowieso één keer bewaard.')}</p> : null}
        {r.duplicaten.map((g, k) => <div key={k}>{rij(g.items, <button type='button' className='foto-knop' onClick={() => void verberg(g.items.slice(1).map((i) => i.id)).then(laad)}>{t('Лишити одне, інші приховати', 'Eén houden, andere verbergen')}</button>)}<small className='foto-hint'>{g.soort === 'exact' ? t('однакові файли', 'identieke bestanden') : t('ймовірно ті самі: розмір і час збігаються', 'waarschijnlijk dezelfde: grootte en tijd gelijk')}</small></div>)}
      </section>
      <section className='foto-bron-groep'><h3>{t('Схожі фото', 'Gelijkende foto’s')} · {r.gelijkend.length}</h3>
        {!r.gelijkend.length ? <p className='foto-hint'>{t('Схожих серій не знайдено.', 'Geen gelijkende reeksen gevonden.')}</p> : null}
        {r.gelijkend.map((g, k) => <div key={k}>{rij(g.items, null)}</div>)}
      </section>
    </div>
  );
}
