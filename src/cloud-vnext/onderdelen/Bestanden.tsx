// «Мої файли» — het hart van cloud vNext: kruimelpad met sleepdoelen, zoeken, soort-/label-/favorietenfilters,
// raster én lijst, meerkeuze (Shift = reeks) met bulkacties, eigen contextmenu (absoluut BINNEN .cvn, nooit fixed),
// nieuwe map, uploaden (knop + sleepvlak → wachtrij in stukken), prullenbakmodus (30 dagen, herstel/definitief met
// bevestiging in een Laag — nooit een browser-popup), versies en detailpaneel. Zolang de serverkant in aanbouw is
// (NOG_NIET_GEBOUWD), blijft de hele interface staan met een eerlijke bouwmelding erboven.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowUpDown, Folder, FolderPlus, LayoutGrid, List, LoaderCircle, Search, Star, Trash2, Upload, X } from 'lucide-react';
import { CLOUD_SORTERING, CLOUD_SOORT_LABEL, CLOUD_VNEXT_LIMIETEN, schoneNaam, schoneTag, type CloudBestand, type CloudMap, type CloudSoort, type CloudSortering } from '../../../shared/cloud-vnext-model';
import BestandKaart, { BestandRij, type BestandActies } from '../BestandKaart';
import { cloudClient, type Lijst } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import DetailPaneel from '../DetailPaneel';
import { bewaarBlob, cloudFoutTekst, isBouwFout, sessieLees, sessieNeem, sessieZet, vanB64 } from '../hulp';
import Laag from '../Laag';
import MapKiezer from '../MapKiezer';
import UploadBeheer from '../UploadBeheer';
import { bronVanFile, overdrachten, preflightNaarDienst } from '../overdracht-beheer';
import type { CloudTaakSoort } from '../../../shared/cloud-overdracht-model';
import { cloudTekst } from '../../../shared/cloud-vnext-model';
import { bytesTekst, tr, type Lang } from '../tekst';

type Vraag = { mapId?: string; zoek: string; soort: CloudSoort | ''; tag: string; favoriet: boolean; prullenbak: boolean; workspaceId: string; sorteer: CloudSortering; oplopend: boolean };
type LaagStaat =
  | { t: 'nieuwe-map' } | { t: 'map-hernoem'; m: CloudMap } | { t: 'map-weg'; m: CloudMap }
  | { t: 'hernoem'; b: CloudBestand } | { t: 'tags'; b: CloudBestand } | { t: 'versies'; b: CloudBestand }
  | { t: 'verplaats'; ids: string[] } | { t: 'definitief'; ids: string[] } | { t: 'naar-drive'; b: CloudBestand };
const SORTEER_LABEL: Record<CloudSortering, [string, string]> = { naam: ['Назва', 'Naam'], datum: ['Дата', 'Datum'], grootte: ['Розмір', 'Grootte'], soort: ['Тип', 'Soort'] };
const SOORTEN = Object.keys(CLOUD_SOORT_LABEL) as CloudSoort[];

export default function Bestanden({ lang, smal, ov, vernieuw, toon }: OnderdeelProps) {
  const [vraag, setVraag] = useState<Vraag>(() => ({
    mapId: undefined, zoek: '', soort: '', tag: '', favoriet: sessieNeem('cvn-favoriet') === '1',
    prullenbak: sessieNeem('cvn-prullenbak') === '1', workspaceId: sessieLees('cvn-ws-filter'),
    sorteer: 'naam', oplopend: true,
  }));
  const [zoekVeld, setZoekVeld] = useState('');
  const [tagVeld, setTagVeld] = useState('');
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [bestanden, setBestanden] = useState<CloudBestand[]>([]);
  const [laden, setLaden] = useState(true);
  const [meerLaden, setMeerLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [bouw, setBouw] = useState(false);
  const [weergave, setWeergave] = useState<'raster' | 'lijst'>(() => (sessieLees('cvn-weergave') === 'lijst' ? 'lijst' : 'raster'));
  const [selectie, setSelectie] = useState<string[]>([]);
  const [ctx, setCtx] = useState<{ x: number; y: number; b?: CloudBestand; m?: CloudMap } | null>(null);
  const [laag, setLaag] = useState<LaagStaat | null>(null);
  const [detail, setDetail] = useState<CloudBestand | null>(null);
  const [besig, setBesig] = useState(false);
  const [sleepTel, setSleepTel] = useState(0);
  const [sleepDoel, setSleepDoel] = useState('');
  const anker = useRef<string | null>(null);
  const wortel = useRef<HTMLElement | null>(null);
  const bestandInput = useRef<HTMLInputElement | null>(null);
  const generatie = useRef(0);

  const laad = useCallback(async (vervolg?: string) => {
    const g = ++generatie.current;
    if (vervolg) setMeerLaden(true); else setLaden(true);
    try {
      const r = await cloudClient.bestanden({
        mapId: vraag.mapId, zoek: vraag.zoek || undefined, soort: vraag.soort || undefined, tag: vraag.tag || undefined,
        favoriet: vraag.favoriet || undefined, prullenbak: vraag.prullenbak || undefined, workspaceId: vraag.workspaceId || undefined,
        sorteer: vraag.sorteer, oplopend: vraag.oplopend, token: vervolg || undefined,
      });
      if (g !== generatie.current) return;
      setBouw(false); setFout(''); setLijst(r);
      setBestanden((oud) => (vervolg ? [...oud, ...r.bestanden] : r.bestanden));
      if (!vervolg) { setSelectie([]); anker.current = null; }
    } catch (e) {
      if (g !== generatie.current) return;
      if (isBouwFout(e)) { setBouw(true); setFout(''); setLijst(null); setBestanden([]); }
      else setFout(cloudFoutTekst(lang, e));
    } finally { if (g === generatie.current) { setLaden(false); setMeerLaden(false); } }
  }, [vraag, lang]);
  useEffect(() => { void laad(); }, [laad]);
  const laadRef = useRef(laad); useEffect(() => { laadRef.current = laad; });
  const herlaad = useCallback(() => { void laadRef.current(); void vernieuw(); }, [vernieuw]);

  // Overdracht uit Overzicht/Werkruimtes: open een bestand of de nieuwe-mapdialoog direct bij binnenkomst.
  useEffect(() => {
    const open = sessieNeem('cvn-open');
    if (open) { try { const b = JSON.parse(open) as CloudBestand; if (b && typeof b === 'object' && b.id) setDetail(b); } catch { /* geen geldige overdracht — stil overslaan */ } }
    if (sessieNeem('cvn-nieuwe-map') === '1') setLaag({ t: 'nieuwe-map' });
  }, []);

  // Uploads lopen via het overdrachtbeheer (module-singleton): navigeren binnen de dienst breekt niets af.
  const voegToe = useCallback((files: ArrayLike<File>, mapId: string | null) => {
    for (const f of Array.from(files)) overdrachten().voegUploadToe(bronVanFile(f), mapId);
  }, []);
  useEffect(() => overdrachten().opKlaar((b) => { toon(tr(lang, `Завантажено: ${b.naam}`, `Geüpload: ${b.naam}`)); herlaad(); }), [lang, toon, herlaad]);

  const kies = (b: CloudBestand, metShift: boolean) => {
    setSelectie((sel) => {
      if (metShift && anker.current) {
        const ids = bestanden.map((x) => x.id); const a = ids.indexOf(anker.current); const z = ids.indexOf(b.id);
        if (a >= 0 && z >= 0) { const [van, tot] = a < z ? [a, z] : [z, a]; return Array.from(new Set([...sel, ...ids.slice(van, tot + 1)])); }
      }
      anker.current = b.id;
      return sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id];
    });
  };
  useEffect(() => {
    if (!selectie.length) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ctx && !laag && !detail) setSelectie([]); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [selectie.length, ctx, laag, detail]);

  const doe = async (werk: () => Promise<void>, melding?: string) => {
    setBesig(true); setFout('');
    try { await werk(); if (melding) toon(melding); setLaag(null); setCtx(null); herlaad(); }
    catch (e) { setFout(cloudFoutTekst(lang, e)); }
    finally { setBesig(false); }
  };
  const verplaatsIds = (ids: string[], mapId: string | null) => doe(async () => { await cloudClient.bestandVerplaats(ids, mapId); setSelectie([]); }, tr(lang, `Переміщено: ${ids.length}`, `Verplaatst: ${ids.length}`));
  const favorietZet = (ids: string[], aan: boolean) => doe(async () => { await cloudClient.bestandFavoriet(ids, aan); }, aan ? tr(lang, 'Додано до обраного.', 'Aan favorieten toegevoegd.') : tr(lang, 'Прибрано з обраного.', 'Uit favorieten gehaald.'));
  const naarKosh = (ids: string[]) => doe(async () => { await cloudClient.naarPrullenbak(ids); setSelectie([]); }, tr(lang, `У кошику (30 днів): ${ids.length}`, `In de prullenbak (30 dagen): ${ids.length}`));
  const herstelIds = (ids: string[]) => doe(async () => { await cloudClient.herstel(ids); setSelectie([]); }, tr(lang, `Відновлено: ${ids.length}`, `Hersteld: ${ids.length}`));
  const downloadBestand = async (b: CloudBestand) => {
    setFout('');
    if (b.bytes > CLOUD_VNEXT_LIMIETEN.downloadMaxBytes) {
      // Groot bestand: in delen met herhaling via het overdrachtbeheer; de voortgang staat in het paneel «Передачі».
      overdrachten().voegDownloadToe({ id: b.id, naam: b.naam, bytes: b.bytes }, (blob) => bewaarBlob(blob.naam || b.naam, new Blob([blob.bytes as unknown as BlobPart], { type: blob.mime })));
      toon(tr(lang, 'Скачування йде частинами у фоні — слідкуйте в «Передачах».', 'Het downloaden loopt in delen op de achtergrond — volg het bij «Overdrachten».'));
      return;
    }
    try { const d = await cloudClient.download(b.id); bewaarBlob(d.naam || b.naam, new Blob([vanB64(d.data) as unknown as BlobPart], { type: d.mime || 'application/octet-stream' })); }
    catch (e) { setFout(cloudFoutTekst(lang, e)); }
  };

  // ---- slepen: pc-bestanden → uploadwachtrij; kaarten → map of kruimel (text/plain-JSON {ids})
  const metPcBestanden = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const metKaarten = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('text/plain');
  const leesIds = (e: React.DragEvent): string[] => {
    try { const d = JSON.parse(e.dataTransfer.getData('text/plain') || '{}') as { ids?: unknown }; return Array.isArray(d.ids) ? d.ids.map(String) : []; } catch { return []; }
  };
  const doelDrop = (mapId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (metKaarten(e) && !metPcBestanden(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setSleepDoel(mapId ?? 'wortel'); } },
    onDragLeave: () => setSleepDoel(''),
    onDrop: (e: React.DragEvent) => { if (!metKaarten(e)) return; e.preventDefault(); e.stopPropagation(); setSleepDoel(''); const ids = leesIds(e); if (ids.length) void verplaatsIds(ids, mapId); },
  });

  const openCtx = (e: React.MouseEvent, b?: CloudBestand, m?: CloudMap) => {
    const host = wortel.current?.getBoundingClientRect(); if (!host) return;
    setCtx({ x: Math.max(4, Math.min(e.clientX - host.left, host.width - 234)), y: Math.max(4, e.clientY - host.top), b, m });
  };
  useEffect(() => {
    if (!ctx) return;
    const sluit = () => setCtx(null);
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('mousedown', sluit); window.addEventListener('keydown', toets);
    return () => { window.removeEventListener('mousedown', sluit); window.removeEventListener('keydown', toets); };
  }, [ctx]);

  const acties = (b: CloudBestand): BestandActies => ({
    lang, b, gekozen: selectie.includes(b.id), keuzestand: selectie.length > 0, prullenbak: vraag.prullenbak,
    onOpen: setDetail, onKies: kies, onFavoriet: (x) => void favorietZet([x.id], !x.favoriet), onMeer: (x, e) => openCtx(e, x),
    sleepIds: (x) => (selectie.includes(x.id) ? selectie : [x.id]),
  });
  const wsTitel = (id: string | null) => (id ? ov?.workspaces.find((w) => w.id === id)?.titel || tr(lang, 'простір', 'werkruimte') : '');
  const filtersAan = Boolean(vraag.zoek || vraag.soort || vraag.tag || vraag.favoriet || vraag.workspaceId);
  const mappen = !vraag.prullenbak ? lijst?.mappen || [] : [];
  const alleGekozenFavoriet = selectie.length > 0 && selectie.every((id) => bestanden.find((b) => b.id === id)?.favoriet);

  return (
    <section ref={wortel} className='cvn-bestanden' aria-label={tr(lang, 'Мої файли', 'Mijn bestanden')}
      onDragEnter={(e) => { if (metPcBestanden(e) && !vraag.prullenbak) { e.preventDefault(); setSleepTel((t) => t + 1); } }}
      onDragOver={(e) => { if (metPcBestanden(e) && !vraag.prullenbak) e.preventDefault(); }}
      onDragLeave={(e) => { if (metPcBestanden(e)) setSleepTel((t) => Math.max(0, t - 1)); }}
      onDrop={(e) => { if (!metPcBestanden(e)) return; e.preventDefault(); setSleepTel(0); if (!vraag.prullenbak && e.dataTransfer.files.length) voegToe(e.dataTransfer.files, vraag.mapId ?? null); }}>
      {bouw ? <p className='cvn-melding is-info' role='status' data-cvn-bouw=''>{tr(lang, 'Серверна частина цього розділу ще збирається — інтерфейс уже можна роздивитись, дані з’являться щойно сервер буде готовий.', 'De serverkant van dit onderdeel is nog in aanbouw — de interface is al te bekijken; de gegevens volgen zodra de server klaar is.')}</p> : null}
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      <UploadBeheer lang={lang} />

      <div className='cvn-werkbalk'>
        <nav className='cvn-kruimels' aria-label={tr(lang, 'Шлях', 'Pad')}>
          <button type='button' className={`cvn-kruimel${!vraag.mapId ? ' is-hier' : ''}${sleepDoel === 'wortel' ? ' is-doel' : ''}`} data-cvn-crumb='wortel'
            onClick={() => setVraag((v) => ({ ...v, mapId: undefined }))} {...doelDrop(null)}>{tr(lang, 'Мої файли', 'Mijn bestanden')}</button>
          {(lijst?.pad || []).map((m) => (
            <span key={m.id} className='cvn-kruimel-paar'>
              <span aria-hidden='true'>/</span>
              <button type='button' className={`cvn-kruimel${vraag.mapId === m.id ? ' is-hier' : ''}${sleepDoel === m.id ? ' is-doel' : ''}`} data-cvn-crumb={m.id}
                onClick={() => setVraag((v) => ({ ...v, mapId: m.id }))} {...doelDrop(m.id)}>{m.naam}</button>
            </span>
          ))}
          {vraag.prullenbak ? <span className='cvn-kruimel is-hier'>· {tr(lang, 'Кошик', 'Prullenbak')}</span> : null}
        </nav>
        <div className='cvn-werkbalk-acties'>
          {!vraag.prullenbak ? (
            <>
              <button type='button' className='cvn-knop' data-cvn-nieuwe-map='' onClick={() => setLaag({ t: 'nieuwe-map' })}><FolderPlus aria-hidden='true' />{tr(lang, 'Нова тека', 'Nieuwe map')}</button>
              <button type='button' className='cvn-knop is-hoofd' data-cvn-upload='knop' onClick={() => bestandInput.current?.click()}><Upload aria-hidden='true' />{tr(lang, 'Завантажити', 'Uploaden')}</button>
              <input ref={bestandInput} type='file' multiple className='cvn-verborgen' tabIndex={-1} aria-hidden='true'
                onChange={(e) => { if (e.target.files?.length) voegToe(e.target.files, vraag.mapId ?? null); e.target.value = ''; }} />
            </>
          ) : null}
          <button type='button' className={`cvn-knop${vraag.prullenbak ? ' is-actief' : ''}`} data-cvn-prullenbak='schakel' aria-pressed={vraag.prullenbak}
            onClick={() => setVraag((v) => ({ ...v, prullenbak: !v.prullenbak, mapId: undefined }))}>
            <Trash2 aria-hidden='true' />{tr(lang, 'Кошик', 'Prullenbak')}{ov ? ` (${ov.prullenbak})` : ''}
          </button>
          <button type='button' className='cvn-icoonknop' data-cvn-weergave={weergave} aria-label={weergave === 'raster' ? tr(lang, 'Показати списком', 'Als lijst tonen') : tr(lang, 'Показати плиткою', 'Als raster tonen')}
            onClick={() => { const w = weergave === 'raster' ? 'lijst' : 'raster'; setWeergave(w); sessieZet('cvn-weergave', w); }}>
            {weergave === 'raster' ? <List aria-hidden='true' /> : <LayoutGrid aria-hidden='true' />}
          </button>
          <label className='cvn-sorteer'>
            <span className='cvn-verborgen-tekst'>{tr(lang, 'Сортування', 'Sortering')}</span>
            <select value={vraag.sorteer} data-cvn-sorteer='' onChange={(e) => setVraag((v) => ({ ...v, sorteer: e.target.value as CloudSortering }))}>
              {CLOUD_SORTERING.map((s) => <option key={s} value={s}>{tr(lang, SORTEER_LABEL[s][0], SORTEER_LABEL[s][1])}</option>)}
            </select>
          </label>
          <button type='button' className='cvn-icoonknop' aria-label={vraag.oplopend ? tr(lang, 'За спаданням', 'Aflopend sorteren') : tr(lang, 'За зростанням', 'Oplopend sorteren')}
            onClick={() => setVraag((v) => ({ ...v, oplopend: !v.oplopend }))}>
            {vraag.oplopend ? <ArrowUpDown aria-hidden='true' /> : <ArrowDownUp aria-hidden='true' />}
          </button>
        </div>
      </div>

      <div className='cvn-filters'>
        <form className='cvn-zoekveld' role='search' onSubmit={(e) => { e.preventDefault(); setVraag((v) => ({ ...v, zoek: zoekVeld.trim().slice(0, CLOUD_VNEXT_LIMIETEN.zoekMax) })); }}>
          <Search aria-hidden='true' />
          <input value={zoekVeld} data-cvn-zoek='' maxLength={CLOUD_VNEXT_LIMIETEN.zoekMax} placeholder={tr(lang, 'Пошук у цих файлах…', 'Zoeken in deze bestanden…')} aria-label={tr(lang, 'Пошук у файлах', 'Zoeken in bestanden')}
            onChange={(e) => { setZoekVeld(e.target.value); if (!e.target.value.trim() && vraag.zoek) setVraag((v) => ({ ...v, zoek: '' })); }} />
        </form>
        <div className='cvn-chips' role='group' aria-label={tr(lang, 'Типи файлів', 'Bestandssoorten')}>
          {SOORTEN.map((s) => (
            <button key={s} type='button' className={`cvn-knop is-klein${vraag.soort === s ? ' is-actief' : ''}`} data-cvn-soort={s} aria-pressed={vraag.soort === s}
              onClick={() => setVraag((v) => ({ ...v, soort: v.soort === s ? '' : s }))}>{tr(lang, CLOUD_SOORT_LABEL[s][0], CLOUD_SOORT_LABEL[s][1])}</button>
          ))}
        </div>
        <button type='button' className={`cvn-knop is-klein${vraag.favoriet ? ' is-actief' : ''}`} data-cvn-favoriet='filter' aria-pressed={vraag.favoriet}
          onClick={() => setVraag((v) => ({ ...v, favoriet: !v.favoriet }))}><Star aria-hidden='true' />{tr(lang, 'Обрані', 'Favorieten')}</button>
        {vraag.tag
          ? <button type='button' className='cvn-knop is-klein is-actief' data-cvn-tag={vraag.tag} onClick={() => setVraag((v) => ({ ...v, tag: '' }))} aria-label={tr(lang, `Прибрати фільтр за теґом ${vraag.tag}`, `Labelfilter ${vraag.tag} weghalen`)}>#{vraag.tag}<X aria-hidden='true' /></button>
          : <input className='cvn-tagfilter' value={tagVeld} data-cvn-tag='filter' maxLength={CLOUD_VNEXT_LIMIETEN.tagMax} placeholder={tr(lang, 'теґ + Enter', 'label + Enter')} aria-label={tr(lang, 'Фільтр за теґом', 'Filteren op label')}
            onChange={(e) => setTagVeld(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = schoneTag(tagVeld); if (t) { setVraag((v) => ({ ...v, tag: t })); setTagVeld(''); } } }} />}
        {vraag.workspaceId ? (
          <button type='button' className='cvn-knop is-klein is-actief' data-cvn-ws-filter={vraag.workspaceId}
            onClick={() => { sessieZet('cvn-ws-filter', ''); setVraag((v) => ({ ...v, workspaceId: '' })); }}
            aria-label={tr(lang, 'Прибрати фільтр за простором', 'Werkruimtefilter weghalen')}>
            {tr(lang, 'Простір', 'Werkruimte')}: {wsTitel(vraag.workspaceId)}<X aria-hidden='true' />
          </button>
        ) : null}
      </div>

      {vraag.prullenbak ? <p className='cvn-melding is-info' role='status'>{tr(lang, `Кошик: файли зберігаються ${CLOUD_VNEXT_LIMIETEN.prullenbakDagen} днів, далі зникають назавжди. Відновлення повертає їх на місце.`, `Prullenbak: bestanden blijven ${CLOUD_VNEXT_LIMIETEN.prullenbakDagen} dagen bewaard en verdwijnen daarna definitief. Herstellen zet ze terug.`)}</p> : null}

      {selectie.length ? (
        <div className='cvn-selectie-balk' data-cvn-selectie='balk' role='toolbar' aria-label={tr(lang, 'Дії з вибраними', 'Acties met de keuze')}>
          <strong>{tr(lang, `Вибрано: ${selectie.length}`, `Gekozen: ${selectie.length}`)}</strong>
          {!vraag.prullenbak ? (
            <>
              <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => setLaag({ t: 'verplaats', ids: selectie })}><Folder aria-hidden='true' />{tr(lang, 'Перемістити', 'Verplaatsen')}</button>
              <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => void favorietZet(selectie, !alleGekozenFavoriet)}><Star aria-hidden='true' />{alleGekozenFavoriet ? tr(lang, 'Прибрати з обраного', 'Uit favorieten') : tr(lang, 'До обраного', 'Favoriet')}</button>
              <button type='button' className='cvn-knop is-klein' data-cvn-prullenbak='keuze' disabled={besig} onClick={() => void naarKosh(selectie)}><Trash2 aria-hidden='true' />{tr(lang, 'У кошик', 'Prullenbak')}</button>
            </>
          ) : (
            <>
              <button type='button' className='cvn-knop is-klein' data-cvn-herstel='keuze' disabled={besig} onClick={() => void herstelIds(selectie)}>{tr(lang, 'Відновити', 'Herstellen')}</button>
              <button type='button' className='cvn-knop is-klein' data-cvn-definitief='keuze' disabled={besig} onClick={() => setLaag({ t: 'definitief', ids: selectie })}>{tr(lang, 'Видалити назавжди', 'Definitief wissen')}</button>
            </>
          )}
          <button type='button' className='cvn-icoonknop' onClick={() => setSelectie([])} aria-label={tr(lang, 'Зняти вибір', 'Keuze opheffen')}><X aria-hidden='true' /></button>
        </div>
      ) : null}

      <div className={`cvn-dropvlak${sleepTel > 0 ? ' is-sleep' : ''}`} data-cvn-drop=''>
        {laden ? <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Завантаження списку…', 'Lijst laden…')}</p> : null}

        {mappen.length ? (
          <ul className='cvn-mappen' role='list' aria-label={tr(lang, 'Теки', 'Mappen')}>
            {mappen.map((m) => (
              <li key={m.id}>
                <button type='button' className={`cvn-map${sleepDoel === m.id ? ' is-doel' : ''}`} data-cvn-map={m.id}
                  onClick={() => setVraag((v) => ({ ...v, mapId: m.id }))} onContextMenu={(e) => { e.preventDefault(); openCtx(e, undefined, m); }} {...doelDrop(m.id)}>
                  <Folder aria-hidden='true' /><span className='cvn-map-naam'>{m.naam}</span>
                  {typeof m.aantal === 'number' ? <span className='cvn-map-aantal'>{m.aantal}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {!laden && !bestanden.length && !mappen.length ? (
          <div className='cvn-leeg' data-cvn-leeg=''>
            {filtersAan
              ? <>
                <p>{tr(lang, 'За цими фільтрами нічого не знайдено.', 'Met deze filters is er niets gevonden.')}</p>
                <button type='button' className='cvn-knop is-klein' onClick={() => { sessieZet('cvn-ws-filter', ''); setZoekVeld(''); setVraag((v) => ({ ...v, zoek: '', soort: '', tag: '', favoriet: false, workspaceId: '' })); }}>{tr(lang, 'Скинути фільтри', 'Filters wissen')}</button>
              </>
              : vraag.prullenbak
                ? <p>{tr(lang, 'Кошик порожній.', 'De prullenbak is leeg.')}</p>
                : bouw
                  ? <p>{tr(lang, 'Щойно сервер буде готовий, тут з’являться ваші теки й файли.', 'Zodra de server klaar is, staan hier uw mappen en bestanden.')}</p>
                  : <>
                    <Upload aria-hidden='true' />
                    <p>{tr(lang, 'Ця тека порожня. Перетягніть файли сюди або натисніть «Завантажити».', 'Deze map is leeg. Sleep bestanden hierheen of kies «Uploaden».')}</p>
                  </>}
          </div>
        ) : null}

        {bestanden.length ? (
          weergave === 'raster' ? (
            <div className='cvn-raster' role='list' aria-label={tr(lang, 'Файли', 'Bestanden')}>
              {bestanden.map((b) => <BestandKaart key={b.id} {...acties(b)} />)}
            </div>
          ) : (
            <table className='cvn-tabel'>
              <caption className='cvn-verborgen-tekst'>{tr(lang, 'Файли', 'Bestanden')}</caption>
              <thead><tr>
                <th scope='col'><span className='cvn-verborgen-tekst'>{tr(lang, 'Вибір', 'Keuze')}</span></th>
                <th scope='col'>{tr(lang, 'Назва', 'Naam')}</th>
                <th scope='col' className='cvn-verberg-smal'>{tr(lang, 'Тип', 'Soort')}</th>
                <th scope='col'>{tr(lang, 'Розмір', 'Grootte')}</th>
                <th scope='col' className='cvn-verberg-smal'>{tr(lang, 'Змінено', 'Gewijzigd')}</th>
                <th scope='col'><span className='cvn-verborgen-tekst'>{tr(lang, 'Дії', 'Acties')}</span></th>
              </tr></thead>
              <tbody>{bestanden.map((b) => <BestandRij key={b.id} {...acties(b)} />)}</tbody>
            </table>
          )
        ) : null}

        {lijst?.volgende ? (
          <button type='button' className='cvn-knop cvn-volgende' data-cvn-volgende='' disabled={meerLaden} onClick={() => void laad(lijst.volgende || undefined)}>
            {meerLaden ? tr(lang, 'Завантаження…', 'Laden…') : tr(lang, 'Показати ще', 'Meer tonen')}
            {lijst.totaal != null ? ` (${bestanden.length}/${lijst.totaal})` : ''}
          </button>
        ) : null}
      </div>

      {ctx ? (
        <div className='cvn-ctx' role='menu' data-cvn-ctx='' style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          {ctx.b ? (
            vraag.prullenbak ? (
              <>
                <button type='button' role='menuitem' onClick={() => { setDetail(ctx.b!); setCtx(null); }}>{tr(lang, 'Відкрити', 'Openen')}</button>
                <button type='button' role='menuitem' data-cvn-herstel={ctx.b.id} onClick={() => { void herstelIds([ctx.b!.id]); }}>{tr(lang, 'Відновити', 'Herstellen')}</button>
                <button type='button' role='menuitem' className='is-gevaar' data-cvn-definitief={ctx.b.id} onClick={() => { setLaag({ t: 'definitief', ids: [ctx.b!.id] }); setCtx(null); }}>{tr(lang, 'Видалити назавжди', 'Definitief wissen')}</button>
              </>
            ) : (
              <>
                <button type='button' role='menuitem' onClick={() => { setDetail(ctx.b!); setCtx(null); }}>{tr(lang, 'Відкрити', 'Openen')}</button>
                {ctx.b.kind !== 'link' ? <button type='button' role='menuitem' onClick={() => { void downloadBestand(ctx.b!); setCtx(null); }}>{tr(lang, 'Завантажити на ПК', 'Downloaden')}</button> : null}
                <button type='button' role='menuitem' onClick={() => { setLaag({ t: 'hernoem', b: ctx.b! }); setCtx(null); }}>{tr(lang, 'Перейменувати', 'Hernoemen')}</button>
                <button type='button' role='menuitem' onClick={() => { setLaag({ t: 'tags', b: ctx.b! }); setCtx(null); }}>{tr(lang, 'Теґи…', 'Labels…')}</button>
                {ctx.b.kind === 'file' ? <button type='button' role='menuitem' data-cvn-versies={ctx.b.id} onClick={() => { setLaag({ t: 'versies', b: ctx.b! }); setCtx(null); }}>{tr(lang, 'Версії…', 'Versies…')}</button> : null}
                <button type='button' role='menuitem' onClick={() => { void favorietZet([ctx.b!.id], !ctx.b!.favoriet); }}>{ctx.b.favoriet ? tr(lang, 'Прибрати з обраного', 'Uit favorieten') : tr(lang, 'До обраного', 'Favoriet maken')}</button>
                <button type='button' role='menuitem' onClick={() => { setLaag({ t: 'verplaats', ids: [ctx.b!.id] }); setCtx(null); }}>{tr(lang, 'Перемістити…', 'Verplaatsen…')}</button>
                {ctx.b.kind === 'file' ? <button type='button' role='menuitem' data-cvn-ov-drive={ctx.b.id} onClick={() => { setLaag({ t: 'naar-drive', b: ctx.b! }); setCtx(null); }}>{tr(lang, 'Надіслати в Google Drive…', 'Naar Google Drive sturen…')}</button> : null}
                <button type='button' role='menuitem' className='is-gevaar' onClick={() => { void naarKosh([ctx.b!.id]); }}>{tr(lang, 'У кошик', 'Naar de prullenbak')}</button>
              </>
            )
          ) : ctx.m ? (
            <>
              <button type='button' role='menuitem' onClick={() => { setVraag((v) => ({ ...v, mapId: ctx.m!.id })); setCtx(null); }}>{tr(lang, 'Відкрити', 'Openen')}</button>
              <button type='button' role='menuitem' onClick={() => { setLaag({ t: 'map-hernoem', m: ctx.m! }); setCtx(null); }}>{tr(lang, 'Перейменувати', 'Hernoemen')}</button>
              <button type='button' role='menuitem' className='is-gevaar' onClick={() => { setLaag({ t: 'map-weg', m: ctx.m! }); setCtx(null); }}>{tr(lang, 'Видалити теку', 'Map verwijderen')}</button>
            </>
          ) : null}
        </div>
      ) : null}

      {laag?.t === 'nieuwe-map' || laag?.t === 'map-hernoem' || laag?.t === 'hernoem' ? (
        <NaamLaag lang={lang} besig={besig} serverMis={fout}
          titel={laag.t === 'nieuwe-map' ? tr(lang, 'Нова тека', 'Nieuwe map') : laag.t === 'map-hernoem' ? tr(lang, 'Перейменувати теку', 'Map hernoemen') : tr(lang, 'Перейменувати файл', 'Bestand hernoemen')}
          begin={laag.t === 'map-hernoem' ? laag.m.naam : laag.t === 'hernoem' ? laag.b.naam : ''}
          data={laag.t === 'nieuwe-map' ? 'nieuwe-map' : 'hernoem'}
          onSluit={() => setLaag(null)}
          onBewaar={(naam) => {
            if (laag.t === 'nieuwe-map') void doe(async () => { await cloudClient.mapNieuw(naam, vraag.mapId ?? null); }, tr(lang, `Теку «${naam}» створено.`, `Map «${naam}» aangemaakt.`));
            else if (laag.t === 'map-hernoem') void doe(async () => { await cloudClient.mapHernoem(laag.m.id, naam); }, tr(lang, 'Перейменовано.', 'Hernoemd.'));
            else void doe(async () => { const n = await cloudClient.bestandHernoem(laag.b.id, naam); if (detail?.id === n.id) setDetail(n); }, tr(lang, 'Перейменовано.', 'Hernoemd.'));
          }} />
      ) : null}

      {laag?.t === 'map-weg' ? (
        <Laag lang={lang} soort='venster' titel={tr(lang, 'Видалити теку', 'Map verwijderen')} onSluit={() => setLaag(null)}>
          {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
          <p>{tr(lang, `Видалити теку «${laag.m.naam}»? Дію перевіряє сервер — вміст не зникає мовчки.`, `Map «${laag.m.naam}» verwijderen? De server bewaakt de inhoud — niets verdwijnt stil.`)}</p>
          <div className='cvn-laag-knoppen'>
            <button type='button' className='cvn-knop is-hoofd' disabled={besig} data-cvn-eerste='' onClick={() => void doe(async () => { await cloudClient.mapVerwijder(laag.m.id); }, tr(lang, 'Теку видалено.', 'Map verwijderd.'))}>{tr(lang, 'Так, видалити', 'Ja, verwijderen')}</button>
            <button type='button' className='cvn-knop' onClick={() => setLaag(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          </div>
        </Laag>
      ) : null}

      {laag?.t === 'definitief' ? (
        <Laag lang={lang} soort='venster' titel={tr(lang, 'Видалити назавжди', 'Definitief wissen')} onSluit={() => setLaag(null)} data={{ 'cvn-definitief': 'laag' }}>
          {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
          <p>{tr(lang, `Видалити назавжди ${laag.ids.length} файл(ів)? Це незворотно — відновлення не буде.`, `${laag.ids.length} bestand(en) definitief wissen? Dit kan niet terug.`)}</p>
          <div className='cvn-laag-knoppen'>
            <button type='button' className='cvn-knop is-hoofd' disabled={besig} data-cvn-eerste='' onClick={() => void doe(async () => { await cloudClient.definitiefWeg(laag.ids); setSelectie([]); }, tr(lang, 'Видалено назавжди.', 'Definitief gewist.'))}>{tr(lang, 'Так, видалити назавжди', 'Ja, definitief wissen')}</button>
            <button type='button' className='cvn-knop' onClick={() => setLaag(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          </div>
        </Laag>
      ) : null}

      {laag?.t === 'verplaats' ? (
        <Laag lang={lang} soort='venster' titel={tr(lang, `Перемістити (${laag.ids.length})`, `Verplaatsen (${laag.ids.length})`)} onSluit={() => setLaag(null)}>
          {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
          <MapKiezer lang={lang} bezig={besig} onKies={(mapId) => void verplaatsIds(laag.ids, mapId)} />
        </Laag>
      ) : null}

      {laag?.t === 'naar-drive' ? <NaarDriveLaag lang={lang} b={laag.b} onSluit={() => setLaag(null)} toon={toon} /> : null}
      {laag?.t === 'tags' ? <TagsLaag lang={lang} b={laag.b} besig={besig} serverMis={fout} onSluit={() => setLaag(null)} onBewaar={(tags) => void doe(async () => { const n = await cloudClient.bestandTags(laag.b.id, tags); if (detail?.id === n.id) setDetail(n); }, tr(lang, 'Теґи збережено.', 'Labels bewaard.'))} /> : null}
      {laag?.t === 'versies' ? <VersiesLaag lang={lang} b={laag.b} onSluit={() => setLaag(null)} onHersteld={(n) => { setLaag(null); if (detail?.id === n.id) setDetail(n); toon(tr(lang, 'Версію відновлено.', 'Versie teruggezet.')); herlaad(); }} /> : null}

      {detail ? (
        <DetailPaneel lang={lang} smal={smal} bestand={detail} pad={lijst?.pad || []} wsTitel={wsTitel(detail.workspaceId)} prullenbak={Boolean(detail.verwijderdOp)}
          onSluit={() => setDetail(null)}
          onBijgewerkt={(n) => { if (n) { setDetail(n); setBestanden((bs) => bs.map((x) => (x.id === n.id ? n : x))); void vernieuw(); } else { setDetail(null); herlaad(); } }}
          toon={toon} />
      ) : null}
    </section>
  );
}

/** Eén naamveld in een Laag (nieuwe map / hernoemen) — nooit window.prompt. */
function NaamLaag({ lang, titel, begin, data, besig, serverMis, onSluit, onBewaar }: { lang: Lang; titel: string; begin: string; data: string; besig: boolean; serverMis: string; onSluit: () => void; onBewaar: (naam: string) => void }) {
  const [naam, setNaam] = useState(begin);
  const [mis, setMis] = useState('');
  return (
    <Laag lang={lang} soort='venster' titel={titel} onSluit={onSluit} data={{ [`cvn-${data}`]: 'laag' }}>
      <form className='cvn-laag-vorm' onSubmit={(e) => { e.preventDefault(); const n = schoneNaam(naam); if (!n) { setMis(tr(lang, 'Назва порожня або задовга (до 200 символів, без / і \\).', 'De naam is leeg of te lang (tot 200 tekens, zonder / en \\).')); return; } onBewaar(n); }}>
        {mis || serverMis ? <p className='cvn-melding is-fout' role='alert'>{mis || serverMis}</p> : null}
        <input value={naam} maxLength={CLOUD_VNEXT_LIMIETEN.naamMax} data-cvn-eerste='' aria-label={tr(lang, 'Назва', 'Naam')} placeholder={tr(lang, 'Назва…', 'Naam…')} onChange={(e) => { setNaam(e.target.value); setMis(''); }} />
        <div className='cvn-laag-knoppen'>
          <button type='submit' className='cvn-knop is-hoofd' disabled={besig}>{tr(lang, 'Зберегти', 'Bewaren')}</button>
          <button type='button' className='cvn-knop' onClick={onSluit}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      </form>
    </Laag>
  );
}

/** Labels bewerken in een Laag: chips + toevoegen, bewaren in één keer. */
function TagsLaag({ lang, b, besig, serverMis, onSluit, onBewaar }: { lang: Lang; b: CloudBestand; besig: boolean; serverMis: string; onSluit: () => void; onBewaar: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(b.tags);
  const [veld, setVeld] = useState('');
  const [mis, setMis] = useState('');
  const toe = () => {
    const t = schoneTag(veld);
    if (!t) { setMis(tr(lang, 'Теґ порожній або задовгий (до 40 символів).', 'Het label is leeg of te lang (tot 40 tekens).')); return; }
    if (tags.length >= CLOUD_VNEXT_LIMIETEN.tagsMax) { setMis(tr(lang, `До ${CLOUD_VNEXT_LIMIETEN.tagsMax} теґів.`, `Tot ${CLOUD_VNEXT_LIMIETEN.tagsMax} labels.`)); return; }
    if (!tags.includes(t)) setTags([...tags, t]);
    setVeld(''); setMis('');
  };
  return (
    <Laag lang={lang} soort='venster' titel={tr(lang, `Теґи — ${b.naam}`, `Labels — ${b.naam}`)} onSluit={onSluit} data={{ 'cvn-tag': 'laag' }}>
      {mis || serverMis ? <p className='cvn-melding is-fout' role='alert'>{mis || serverMis}</p> : null}
      <div className='cvn-tags'>
        {tags.map((t) => <span key={t} className='cvn-tag' data-cvn-tag={t}>#{t}<button type='button' aria-label={tr(lang, `Прибрати ${t}`, `${t} weghalen`)} onClick={() => setTags(tags.filter((x) => x !== t))}><X aria-hidden='true' /></button></span>)}
        {!tags.length ? <span className='cvn-hint'>{tr(lang, 'Поки без теґів.', 'Nog zonder labels.')}</span> : null}
      </div>
      <form className='cvn-tag-vorm' onSubmit={(e) => { e.preventDefault(); toe(); }}>
        <input value={veld} maxLength={CLOUD_VNEXT_LIMIETEN.tagMax} data-cvn-eerste='' aria-label={tr(lang, 'Новий теґ', 'Nieuw label')} placeholder={tr(lang, 'новий теґ + Enter', 'nieuw label + Enter')} onChange={(e) => { setVeld(e.target.value); setMis(''); }} />
        <button type='submit' className='cvn-knop is-klein'>{tr(lang, 'Додати', 'Toevoegen')}</button>
      </form>
      <div className='cvn-laag-knoppen'>
        <button type='button' className='cvn-knop is-hoofd' disabled={besig} onClick={() => onBewaar(tags)}>{tr(lang, 'Зберегти', 'Bewaren')}</button>
        <button type='button' className='cvn-knop' onClick={onSluit}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
      </div>
    </Laag>
  );
}

/** Versies in een Laag: lijst laden, terugzetten, één versie downloaden. */
function VersiesLaag({ lang, b, onSluit, onHersteld }: { lang: Lang; b: CloudBestand; onSluit: () => void; onHersteld: (n: CloudBestand) => void }) {
  const [rijen, setRijen] = useState<Array<{ pad: string; bytes: number; op: string }> | null>(null);
  const [mis, setMis] = useState('');
  const [besig, setBesig] = useState(false);
  const haalVersie = (versie: string) => {
    setMis('');
    cloudClient.download(b.id, versie)
      .then((d) => bewaarBlob(d.naam || b.naam, new Blob([vanB64(d.data) as unknown as BlobPart], { type: d.mime || 'application/octet-stream' })))
      .catch((e) => setMis(cloudFoutTekst(lang, e)));
  };
  useEffect(() => {
    let weg = false;
    cloudClient.versies(b.id).then((v) => { if (!weg) setRijen(v); }).catch((e) => { if (!weg) setMis(cloudFoutTekst(lang, e)); });
    return () => { weg = true; };
  }, [b.id, lang]);
  return (
    <Laag lang={lang} soort='venster' titel={tr(lang, `Версії — ${b.naam}`, `Versies — ${b.naam}`)} onSluit={onSluit} data={{ 'cvn-versies': b.id }}>
      {mis ? <p className='cvn-melding is-fout' role='alert'>{mis}</p> : null}
      {!rijen && !mis ? <p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p> : null}
      {rijen && !rijen.length ? <p className='cvn-hint'>{tr(lang, 'Попередніх версій ще немає — вони з’являться після заміни файлу (до 20).', 'Nog geen eerdere versies — die ontstaan bij vervanging van het bestand (tot 20).')}</p> : null}
      {rijen?.length ? (
        <ul className='cvn-versie-rijen'>
          {rijen.map((v) => (
            <li key={v.pad}>
              <span>{new Date(v.op).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL')}</span>
              <span>{bytesTekst(lang, v.bytes)}</span>
              <span className='cvn-versie-acties'>
                <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => { setBesig(true); setMis(''); cloudClient.versieHerstel(b.id, v.pad).then(onHersteld).catch((e) => setMis(cloudFoutTekst(lang, e))).finally(() => setBesig(false)); }}>{tr(lang, 'Відновити', 'Terugzetten')}</button>
                <button type='button' className='cvn-knop is-klein is-stil' onClick={() => haalVersie(v.pad)}>{tr(lang, 'Завантажити', 'Downloaden')}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Laag>
  );
}

/** Naar Google Drive sturen: eerst de EERLIJKE preflight tegen de grens van de dienst (met de bron van die grens en een
 *  suggestie), pas daarna een achtergrondtaak op de server (kopie of verplaatsen). account '' = het actieve Google-account. */
function NaarDriveLaag({ lang, b, onSluit, toon }: { lang: Lang; b: CloudBestand; onSluit: () => void; toon: (t: string) => void }) {
  const [soort, setSoort] = useState<CloudTaakSoort>('kopie');
  const [besig, setBesig] = useState(false);
  const [mis, setMis] = useState('');
  const vlucht = preflightNaarDienst('google-drive', b.bytes);
  const stuur = async () => {
    setBesig(true); setMis('');
    try {
      await cloudClient.taken({ actie: 'nieuw', soort, bron: { dienst: 'eigen', id: b.id, naam: b.naam }, doel: { dienst: 'google-drive', account: '' } });
      toon(tr(lang, 'Задачу створено — виконується у фоні, можна працювати далі.', 'Taak aangemaakt — loopt op de achtergrond, u kunt gewoon verder werken.'));
      onSluit();
    } catch (e) { setMis(cloudFoutTekst(lang, e)); }
    finally { setBesig(false); }
  };
  return (
    <Laag lang={lang} soort='venster' titel={tr(lang, `До Google Drive — ${b.naam}`, `Naar Google Drive — ${b.naam}`)} onSluit={onSluit} data={{ 'cvn-ov-preflight': vlucht.ok ? 'ok' : 'geblokkeerd' }}>
      {mis ? <p className='cvn-melding is-fout' role='alert'>{mis}</p> : null}
      <p className='cvn-hint'>{b.naam} · {bytesTekst(lang, b.bytes)}</p>
      {!vlucht.ok && vlucht.grens ? (
        <>
          <p className='cvn-melding is-fout' role='alert' data-cvn-ov-fout='DOEL_LIMIET'>
            {tr(lang, 'Цей файл завеликий для цього шляху.', 'Dit bestand is te groot voor deze route.')} {cloudTekst(vlucht.grens.bron, lang)}
          </p>
          {vlucht.grens.suggestie ? <p className='cvn-melding is-info'>{cloudTekst(vlucht.grens.suggestie, lang)}</p> : null}
          <div className='cvn-laag-knoppen'>
            <button type='button' className='cvn-knop' data-cvn-eerste='' onClick={onSluit}>{tr(lang, 'Зрозуміло', 'Begrepen')}</button>
          </div>
        </>
      ) : (
        <>
          {vlucht.grens ? <p className='cvn-hint'>{cloudTekst(vlucht.grens.bron, lang)}</p> : null}
          <div className='cvn-chips' role='radiogroup' aria-label={tr(lang, 'Що зробити', 'Wat doen')}>
            <button type='button' role='radio' aria-checked={soort === 'kopie'} className={`cvn-knop is-klein${soort === 'kopie' ? ' is-actief' : ''}`} data-cvn-eerste='' onClick={() => setSoort('kopie')}>{tr(lang, 'Копіювати (лишити тут)', 'Kopiëren (hier laten)')}</button>
            <button type='button' role='radio' aria-checked={soort === 'verplaats'} className={`cvn-knop is-klein${soort === 'verplaats' ? ' is-actief' : ''}`} onClick={() => setSoort('verplaats')}>{tr(lang, 'Перемістити (тут — у кошик)', 'Verplaatsen (hier naar de prullenbak)')}</button>
          </div>
          <p className='cvn-hint'>{tr(lang, 'Задача виконується на сервері у фоні: вкладку можна закривати, прогрес видно в «Передачах».', 'De taak loopt op de server, op de achtergrond: het tabblad mag dicht; de voortgang staat bij «Overdrachten».')}</p>
          <div className='cvn-laag-knoppen'>
            <button type='button' className='cvn-knop is-hoofd' disabled={besig} onClick={() => void stuur()}>{tr(lang, 'Створити задачу', 'Taak aanmaken')}</button>
            <button type='button' className='cvn-knop' onClick={onSluit}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          </div>
        </>
      )}
    </Laag>
  );
}
