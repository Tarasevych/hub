// Bijlageviewer v2 — єдина об'єднана компактна панель переглядача вкладень (Компактна панель v2).
// Об'єднує весь функціонал трьох попередніх переглядачів (Компактна панель v2, Спільний переглядач, Класична шапка)
// в один компактний однорядковий переглядач без зайвого перемикача трьох режимів:
//   [назва ⓘ] [‹ 1/3 ›] [масштаб] | [ШІ] [редагувати] | [Завантажити ▾] [Друк] [•••] | [згорнути] [закрити]
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, GitCompare, Info, Minimize2, Moon, MoreHorizontal, PenLine, Printer, Save, Search, Share2, Sparkles, X } from 'lucide-react';
import { formaatVan, kies, soortVan } from '../bijlage-weergave/soort';
import { bewijsUitBlob, metAfzender, type AfzenderBewijs, type Vertrouwen } from '../bijlage-weergave/vertrouwen';
import { technischeRijen } from '../bijlage-weergave/details';
import { toonWaarde } from '../bijlage-weergave/labels';
import { useRekeningVelden, WeergaveSnelkaart, type WeergaveExtra } from '../bijlage-weergave/Etappe3';
import { toontKalenderBetaling, type BetalingBron } from '../bijlage-weergave/kalender-betaling';
import { KalenderBetalingVenster } from '../bijlage-weergave/KalenderBetalingVenster';
import { groepVoor, vorigeVersie } from '../bijlage-weergave/versies';
import { ZoekVeld } from '../bijlage-weergave/ZoekVeld';
import { ONDERTEKEN_LABEL, toontOndertekenen } from '../bijlage-weergave/ondertekenen';
import type { ContextActie, WeergaveBron } from '../bijlage-weergave/Weergave';
import type { BijlageWeergaveWissel } from '../bijlage-weergave/weergave-modus';
import { useDonkerThema } from '../mail-donker/weergave';
import { IconKnop, ZoomGroep, type KnopStaat } from './Knoppen';
import './bijlage-v2.css';

const VersieVergelijk = lazy(() => import('../mail/VersieVergelijk'));
const DONKER_SLEUTEL = 'tsv:bijlage-donkere-paginas';

export type Paneel = 'ai' | 'details' | null;
export type WerkbalkProps = {
  lang: 'uk' | 'nl';
  bestandsnaam: string; contentType: string; grootte: string; bewerkBadge: string; weergaveLabel: string;
  grootteBytes?: number;
  blob?: Blob | null;
  archiefNamen?: string[];
  afzender?: AfzenderBewijs | null;
  extra?: WeergaveExtra | null;
  staat?: { fase: 'laden' | 'fout'; naam: string; code: string; onOpnieuw: () => void } | null;
  bron?: WeergaveBron;
  contextActies?: ContextActie[] | null;
  nav: { index: number; totaal: number } | null; onVorige: () => void; onVolgende: () => void;
  canvasZoom: boolean; zoom: number; onZoom: (z: number) => void;
  downloadUrl: string; onPrint: () => void; onOpslaan: () => void; onDelen?: () => void;
  bewerkLabel?: string; onBewerk?: () => void;
  onNotitieUitBijlage?: () => void;
  weergaveWissel?: BijlageWeergaveWissel | null;
  onMinimaliseer: () => void; onSluit: () => void;
};
type Niveau = 'ruim' | 'midden' | 'smal';
const niveauVoor = (b: number): Niveau => (b >= 900 ? 'ruim' : b >= 620 ? 'midden' : 'smal');

export default function BijlageWerkbalk(p: WerkbalkProps) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const kop = useRef<HTMLElement | null>(null);
  const [niveau, setNiveau] = useState<Niveau>('ruim');
  const [paneel, setPaneelRaw] = useState<Paneel>(null);
  const [menu, setMenu] = useState<null | 'download' | 'meer'>(null);
  const [actieVenster, setActieVenster] = useState<null | 'kalender' | 'versies' | 'zoek'>(null);
  const [aiBeschikbaar, setAiBeschikbaar] = useState(false);
  const [downloadStaat, setDownloadStaat] = useState<KnopStaat>('normaal');
  const [printStaat, setPrintStaat] = useState<KnopStaat>('normaal');

  const soort = soortVan(p.bestandsnaam, p.contentType);
  const formaat = formaatVan(p.bestandsnaam);
  const [bestandVertrouwen, setVertrouwen] = useState<Vertrouwen | null>(null);
  const vertrouwen = useMemo(() => (bestandVertrouwen ? metAfzender(bestandVertrouwen, p.afzender) : null), [bestandVertrouwen, p.afzender]);
  const [maat, setMaat] = useState<{ b: number; h: number } | null>(null);
  const papier = ['rekening', 'contract', 'document', 'tekst', 'presentatie', 'tabel'].includes(soort.sleutel) || /pdf/i.test(p.contentType || '');
  const donkerThema = useDonkerThema();
  const [donkerKeuze, setDonkerKeuze] = useState<'aan' | 'uit' | null>(() => {
    try { const v = window.localStorage.getItem(DONKER_SLEUTEL); return v === 'aan' || v === 'uit' ? v : null; } catch { return null; }
  });
  const donker = donkerKeuze === null ? donkerThema : donkerKeuze === 'aan';
  const wisselDonker = () => {
    const volgende = !donker;
    setDonkerKeuze(volgende ? 'aan' : 'uit');
    try { window.localStorage.setItem(DONKER_SLEUTEL, volgende ? 'aan' : 'uit'); } catch { /* сеанс без запису */ }
  };

  const { velden: rekeningData } = useRekeningVelden({ naam: p.bestandsnaam, contentType: p.contentType, blob: p.blob });
  const x: WeergaveExtra = p.extra || {};
  const kalenderBron = useMemo<BetalingBron | null>(() => {
    if (!rekeningData || !toontKalenderBetaling(soort.sleutel, rekeningData)) return null;
    return { velden: rekeningData, soort: soort.sleutel, taal: p.lang, bestandsnaam: p.bestandsnaam, afzender: x.afzender, profielId: x.profielId, rekeningId: x.rekeningId, briefId: x.briefId, bijlageId: x.bijlageId, tijdzone: x.tijdzone };
  }, [rekeningData, soort.sleutel, p.lang, p.bestandsnaam, x.afzender, x.profielId, x.rekeningId, x.briefId, x.bijlageId, x.tijdzone]);
  const versie = useMemo(() => {
    const vb = x.versieBron, briefId = x.briefId || '', bijlageId = x.bijlageId || '';
    if (!vb || !briefId || !bijlageId || vb.berichten.length === 0) return null;
    const groep = groepVoor(vb.berichten, briefId, bijlageId);
    if (!groep) return null;
    const vorige = vorigeVersie(groep, briefId, bijlageId);
    const huidig = groep.items.find((it) => it.berichtId === briefId && it.bijlage.providerAttachmentId === bijlageId);
    if (!vorige || !huidig) return null;
    return { groep, vorige, huidig, bron: vb.bron };
  }, [x.versieBron, x.briefId, x.bijlageId]);
  const heeftZoek = Boolean(x.zoekBron && x.zoekBron.items.length > 1);
  const heeftOndertekenen = Boolean(x.onOndertekenen && (toontOndertekenen(soort.sleutel, p.contentType) || toontOndertekenen(soort.sleutel, p.bestandsnaam)));
  const ctxActies = p.contextActies || [];

  // Breedte meten (venster kan smaller zijn dan het scherm): bepaalt het niveau.
  useLayoutEffect(() => {
    const el = kop.current; if (!el) return;
    const meet = () => setNiveau(niveauVoor(el.getBoundingClientRect().width));
    meet();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(meet); ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  // Paneel: als attribuut op het venster (CSS plaatst de vertaalbalk / het PDF-profiel in het gedeelde zijpaneel).
  const artikel = () => kop.current?.closest('article') as HTMLElement | null;
  const setPaneel = (v: Paneel) => { setPaneelRaw(v); const a = artikel(); if (a) { if (v) a.dataset.bv2Paneel = v; else delete a.dataset.bv2Paneel; } };
  // Het venster markeren (CSS van v2 hangt aan [data-bijlage-v2]); bij afsluiten van v2 weer weg.
  useLayoutEffect(() => { const a = artikel(); if (a) a.dataset.bijlageV2 = '1'; return () => { if (a) { delete a.dataset.bijlageV2; delete a.dataset.bv2Paneel; } }; }, []);
  useEffect(() => {
    const a = artikel() || kop.current?.closest('.google-mail-attachment-preview, [data-weergave-drager]') as HTMLElement | null;
    if (!a) return;
    if (donker && papier) a.setAttribute('data-donkere-paginas', 'ja'); else a.removeAttribute('data-donkere-paginas');
    return () => a.removeAttribute('data-donkere-paginas');
  }, [donker, papier]);
  useEffect(() => {
    let weg = false; setVertrouwen(null); setMaat(null);
    if (p.blob) {
      void bewijsUitBlob(p.blob, p.bestandsnaam, p.archiefNamen).then((v) => { if (!weg) setVertrouwen(v); }).catch(() => undefined);
      if (soort.sleutel === 'foto' && typeof createImageBitmap === 'function') {
        void createImageBitmap(p.blob).then((bm) => { if (!weg) setMaat({ b: bm.width, h: bm.height }); bm.close(); }).catch(() => undefined);
      }
    }
    return () => { weg = true; };
  }, [p.blob, p.bestandsnaam]);
  useEffect(() => { setPaneel(null); setMenu(null); setActieVenster(null); }, [p.bestandsnaam]); // andere bijlage: panelen dicht
  // Is er een ШІ-/vertaalbalk in de inhoud? (alleen dan de knop tonen; geen knop zonder functie)
  useEffect(() => {
    const a = artikel(); if (!a) return;
    const kijk = () => setAiBeschikbaar(!!a.querySelector('.mail-viewer-cache-panel:not([hidden]) .ai-vertaling-balk'));
    kijk();
    const mo = new MutationObserver(kijk); mo.observe(a, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    return () => mo.disconnect();
  }, []);
  // Plaats van het paneel: rechts in het werkgebied (computer) of onderaan (telefoon); CSS-variabelen op het venster.
  useLayoutEffect(() => {
    const a = artikel(), stage = a?.querySelector('.mail-viewer-stage') as HTMLElement | null;
    if (!a || !stage) return;
    const zet = () => { const r = stage.getBoundingClientRect(); a.style.setProperty('--bv2-stage-top', `${Math.round(r.top)}px`); a.style.setProperty('--bv2-stage-right', `${Math.round(window.innerWidth - r.right)}px`); a.style.setProperty('--bv2-stage-bottom', `${Math.round(window.innerHeight - r.bottom)}px`); a.style.setProperty('--bv2-stage-left', `${Math.round(r.left)}px`); };
    zet();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(zet); ro?.observe(stage);
    window.addEventListener('resize', zet);
    return () => { ro?.disconnect(); window.removeEventListener('resize', zet); };
  }, [paneel]);
  // Esc: eerst menu, dan paneel; pas daarna gaat Esc naar het venster (bestaand gedrag).
  useEffect(() => {
    if (!menu && !paneel) return;
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.stopPropagation(); e.preventDefault(); if (menu) setMenu(null); else setPaneel(null); };
    const buiten = (e: PointerEvent) => { if (menu && !(e.target as Element).closest?.('.bv2-menu-anker')) setMenu(null); };
    window.addEventListener('keydown', esc, true); document.addEventListener('pointerdown', buiten, true);
    return () => { window.removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', buiten, true); };
  }, [menu, paneel]);

  const gelukt = (zet: (s: KnopStaat) => void) => { zet('gelukt'); window.setTimeout(() => zet('normaal'), 1600); };
  const doePrint = () => { setPrintStaat('bezig'); window.setTimeout(() => { try { p.onPrint(); gelukt(setPrintStaat); } catch { setPrintStaat('fout'); window.setTimeout(() => setPrintStaat('normaal'), 2400); } }, 30); };
  const smal = niveau === 'smal', ruim = niveau === 'ruim';
  const zoomProcent = Math.round(p.zoom * 100);
  const extraRijen = useMemo(() => (
    p.grootteBytes !== undefined || vertrouwen || maat
      ? technischeRijen({
          taal: p.lang,
          naam: p.bestandsnaam,
          contentType: p.contentType,
          grootte: Number(p.grootteBytes || p.blob?.size || 0),
          vertrouwen,
          breedte: maat?.b,
          hoogte: maat?.h,
        })
      : []
  ), [p.lang, p.bestandsnaam, p.contentType, p.grootteBytes, p.blob, vertrouwen, maat]);

  const menuItem = (label: string, pict: React.ReactNode, doe: () => void, data: string, href?: string) => href
    ? <a role='menuitem' className='bv2-menu-item' href={href} download={p.bestandsnaam} data-bv2={data} onClick={() => { setMenu(null); doe(); }}>{pict}<span>{label}</span></a>
    : <button role='menuitem' type='button' className='bv2-menu-item' data-bv2={data} onClick={() => { setMenu(null); doe(); }}>{pict}<span>{label}</span></button>;

  return <header ref={kop} className='bv2-kop' data-bv2-niveau={niveau}>
    <div className='bv2-titel'>
      <strong title={p.bestandsnaam}>{p.bestandsnaam}</strong>
      {smal && p.nav && p.nav.totaal > 1 && <small aria-hidden='true'>{p.nav.index + 1}/{p.nav.totaal}</small>}
      {!smal && <IconKnop label={t('Про файл', 'Over het bestand')} actief={paneel === 'details'} onClick={() => setPaneel(paneel === 'details' ? null : 'details')} data='details'><Info size={17} /></IconKnop>}
    </div>
    <div className='bv2-werkbalk' role='toolbar' aria-label={t('Дії вкладення', 'Bijlageacties')} data-mail-viewer-toolbar='content'>
      {p.nav && p.nav.totaal > 1 && <div className='bv2-groep' role='group' aria-label={t('Вкладення', 'Bijlagen')}>
        <IconKnop label={t('Попереднє вкладення', 'Vorige bijlage')} uit={p.nav.index <= 0} onClick={p.onVorige} data='vorige'><ChevronLeft size={18} /></IconKnop>
        {!smal && <span className='bv2-teller' aria-live='polite'>{p.nav.index + 1}/{p.nav.totaal}</span>}
        <IconKnop label={t('Наступне вкладення', 'Volgende bijlage')} uit={p.nav.index >= p.nav.totaal - 1} onClick={p.onVolgende} data='volgende'><ChevronRight size={18} /></IconKnop>
      </div>}
      {p.canvasZoom && <ZoomGroep lang={p.lang} procent={zoomProcent} min={50} max={250} onZet={(v) => p.onZoom(v / 100)}
        onMin={() => p.onZoom(Math.max(0.5, Math.round((p.zoom - 0.1) * 10) / 10))} onPlus={() => p.onZoom(Math.min(2.5, Math.round((p.zoom + 0.1) * 10) / 10))} onPassend={() => p.onZoom(1)} data='beeld-zoom' compact={smal} />}
      {!smal && (aiBeschikbaar || p.onBewerk || heeftZoek) && <div className='bv2-groep' role='group' aria-label={t('Інструменти', 'Gereedschap')}>
        {aiBeschikbaar && <IconKnop toon='ai' label={t('ШІ і переклад', 'AI en vertaling')} actief={paneel === 'ai'} onClick={() => setPaneel(paneel === 'ai' ? null : 'ai')} data='ai'><Sparkles size={17} /></IconKnop>}
        {p.onBewerk && <IconKnop label={p.bewerkLabel || t('Редагувати', 'Bewerken')} onClick={p.onBewerk} data='bewerk'><PenLine size={17} /></IconKnop>}
        {heeftZoek && <IconKnop label={t('Пошук у вкладеннях', 'Zoeken in bijlagen')} actief={actieVenster === 'zoek'} onClick={() => setActieVenster(actieVenster === 'zoek' ? null : 'zoek')} data='zoek-bijlagen'><Search size={17} /></IconKnop>}
      </div>}
      <div className='bv2-groep bv2-split bv2-menu-anker' role='group' aria-label={t('Завантаження', 'Downloaden')}>
        <IconKnop toon='hoofd' label={t('Завантажити', 'Downloaden')} toonLabel={ruim} href={p.downloadUrl} download={p.bestandsnaam} staat={downloadStaat} onClick={() => gelukt(setDownloadStaat)} data='download'><Download size={17} /></IconKnop>
        {!smal && <IconKnop toon='hoofd' label={t('Інші способи зберегти', 'Andere manieren om op te slaan')} ariaExpanded={menu === 'download'} onClick={() => setMenu(menu === 'download' ? null : 'download')} data='download-meer'><ChevronDown size={16} /></IconKnop>}
        {menu === 'download' && <div className='bv2-zwevend bv2-menu' role='menu' aria-label={t('Зберегти', 'Opslaan')}>
          {menuItem(t('Завантажити оригінал', 'Origineel downloaden'), <Download size={17} />, () => gelukt(setDownloadStaat), 'm-download', p.downloadUrl)}
          {menuItem(t('Зберегти в сховище…', 'Opslaan in opslag…'), <Save size={17} />, p.onOpslaan, 'm-opslaan')}
          {p.onDelen && menuItem(t('Поділитися', 'Delen'), <Share2 size={17} />, p.onDelen, 'm-delen')}
        </div>}
      </div>
      {!smal && <div className='bv2-groep' role='group' aria-label={t('Файл', 'Bestand')}>
        <IconKnop label={t('Друк', 'Afdrukken')} onClick={doePrint} staat={printStaat} data='print'><Printer size={17} /></IconKnop>
      </div>}
      <div className='bv2-groep bv2-menu-anker'>
        <IconKnop label={t('Більше дій', 'Meer acties')} ariaExpanded={menu === 'meer'} onClick={() => setMenu(menu === 'meer' ? null : 'meer')} data='meer'><MoreHorizontal size={18} /></IconKnop>
        {menu === 'meer' && <div className='bv2-zwevend bv2-menu' role='menu' aria-label={t('Більше дій', 'Meer acties')}>
          {menuItem(t('Про файл', 'Over het bestand'), <Info size={17} />, () => setPaneel('details'), 'm-details')}
          {aiBeschikbaar && menuItem(t('ШІ і переклад', 'AI en vertaling'), <Sparkles size={17} />, () => setPaneel('ai'), 'm-ai')}
          {p.onBewerk && menuItem(p.bewerkLabel || t('Редагувати', 'Bewerken'), <PenLine size={17} />, p.onBewerk, 'm-bewerk')}
          {heeftOndertekenen && menuItem(kies(p.lang, ONDERTEKEN_LABEL), <PenLine size={17} />, () => x.onOndertekenen?.(), 'm-ondertekenen')}
          {kalenderBron && menuItem(t('Оплату в Календар', 'Betaling in Agenda'), <CalendarPlus size={17} />, () => setActieVenster('kalender'), 'm-kalender')}
          {versie && menuItem(t('Що змінилося', 'Wat is er veranderd'), <GitCompare size={17} />, () => setActieVenster('versies'), 'm-versies')}
          {heeftZoek && menuItem(t('Пошук у вкладеннях', 'Zoeken in bijlagen'), <Search size={17} />, () => setActieVenster('zoek'), 'm-zoek')}
          {ctxActies.map((a) => {
            const Icoon = a.icoon;
            return <button key={`ctx:${a.sleutel}`} role='menuitem' type='button' className='bv2-menu-item' data-bv2={`m-ctx-${a.sleutel}`} onClick={() => { setMenu(null); a.uitvoeren(); }}>{Icoon ? <Icoon size={17} /> : <FileText size={17} />}<span>{kies(p.lang, a.label)}</span></button>;
          })}
          {menuItem(t('Друк', 'Afdrukken'), <Printer size={17} />, doePrint, 'm-print2')}
          {menuItem(t('Зберегти в сховище…', 'Opslaan in opslag…'), <Save size={17} />, p.onOpslaan, 'm-opslaan2')}
          {p.onDelen && menuItem(t('Поділитися', 'Delen'), <Share2 size={17} />, p.onDelen, 'm-delen2')}
          {p.onNotitieUitBijlage && menuItem(t('Створити нотатку з вкладення', 'Notitie uit bijlage maken'), <FileText size={17} />, p.onNotitieUitBijlage, 'm-notitie')}
          {papier && menuItem(donker ? t('✓ Темні сторінки документа · повернути оригінал', '✓ Donkere documentpagina’s · origineel tonen') : t('Темні сторінки документа', 'Donkere documentpagina’s'), <Moon size={17} />, wisselDonker, 'm-donkere-paginas')}
          {smal && p.canvasZoom && menuItem(t('Згорнути перегляд', 'Weergave minimaliseren'), <Minimize2 size={17} />, p.onMinimaliseer, 'm-minimaliseer')}
        </div>}
      </div>
      <div className='bv2-groep bv2-venster' role='group' aria-label={t('Вікно', 'Venster')}>
        {!(smal && p.canvasZoom) && <IconKnop label={t('Згорнути перегляд', 'Weergave minimaliseren')} onClick={p.onMinimaliseer} data='minimaliseer'><Minimize2 size={16} /></IconKnop>}
        <IconKnop label={t('Закрити', 'Sluiten')} sneltoets='Esc' onClick={p.onSluit} data='sluit'><X size={18} /></IconKnop>
      </div>
    </div>
    {paneel && <aside className='bv2-paneel' data-bv2-paneel-soort={paneel} aria-label={paneel === 'ai' ? t('ШІ і переклад', 'AI en vertaling') : t('Про файл', 'Over het bestand')}>
      <div className='bv2-paneel-kop'>
        <strong>{paneel === 'ai' ? t('ШІ і переклад', 'AI en vertaling') : t('Про файл', 'Over het bestand')}</strong>
        <IconKnop label={t('Закрити панель', 'Paneel sluiten')} onClick={() => setPaneel(null)} data='paneel-sluit'><X size={16} /></IconKnop>
      </div>
      {paneel === 'details' && <div className='bv2-details-omhulsel'>
        <WeergaveSnelkaart taal={p.lang} velden={rekeningData} />
        <dl className='bv2-details'>
          <div><dt>{t('Назва', 'Naam')}</dt><dd>{p.bestandsnaam}</dd></div>
          <div><dt>{t('Вид документа', 'Soort document')}</dt><dd>{kies(p.lang, soort.naam)}{formaat ? ` (${formaat})` : ''}</dd></div>
          <div><dt>{t('Тип', 'Type')}</dt><dd>{p.contentType || '—'}</dd></div>
          <div><dt>{t('Розмір', 'Grootte')}</dt><dd>{p.grootte}</dd></div>
          <div><dt>{t('Перегляд', 'Weergave')}</dt><dd>{p.weergaveLabel}</dd></div>
          <div><dt>{t('Редагування', 'Bewerken')}</dt><dd>{p.bewerkBadge}</dd></div>
          {extraRijen.filter((r) => !['Назва', 'Naam', 'Розмір', 'Grootte', 'Заявлений тип', 'Opgegeven soort'].includes(r.label)).map((r) => (
            <div key={r.label}><dt>{r.label}</dt><dd>{toonWaarde(r.waarde, p.lang)}</dd></div>
          ))}
        </dl>
        {vertrouwen && (
          <div className='bv2-vertrouwen-blok' data-niveau={vertrouwen.niveau}>
            <strong>{kies(p.lang, vertrouwen.zin)}</strong>
            <ul className='weergave-bevindingen'>
              {vertrouwen.bevindingen.map((b) => <li key={b.sleutel} data-ernst={b.ernst}>{kies(p.lang, b.tekst)}</li>)}
            </ul>
          </div>
        )}
      </div>}
      {paneel === 'ai' && <p className='bv2-paneel-hulp'>{t('Переклад і ШІ працюють із цим файлом. Документ лишається відкритим ліворуч.', 'Vertaling en AI werken met dit bestand. Het document blijft links open.')}</p>}
    </aside>}
    {actieVenster === 'kalender' && kalenderBron && <KalenderBetalingVenster taal={p.lang} bron={kalenderBron} onSluit={() => setActieVenster(null)} />}
    {actieVenster === 'zoek' && x.zoekBron && (
      <div className='weergave-dialoog-laag' role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget) setActieVenster(null); }}>
        <div className='weergave-dialoog' role='dialog' aria-modal='true' aria-label={t('Пошук у вкладеннях', 'Zoeken in bijlagen')}>
          <ZoekVeld taal={p.lang} bron={x.zoekBron} onSluit={() => setActieVenster(null)} />
        </div>
      </div>
    )}
    {actieVenster === 'versies' && versie && (
      <Suspense fallback={null}>
        <VersieVergelijk lang={p.lang} bron={versie.bron} groep={versie.groep} beginKeuze={{ oud: versie.vorige.nummer, nieuw: versie.huidig.nummer }} onSluit={() => setActieVenster(null)} />
      </Suspense>
    )}
  </header>;
}

