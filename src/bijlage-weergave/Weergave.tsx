// Спільний перегляд вкладень, етапи 1–2 (Grok: hub.tarasevych.com); етапи 3–4 — Claude Opus 5.5 (High) через Google Antigravity,
// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом): тести, перевірку типів і складання не проганяли за вказівкою власника.
// Vlag `bijlage-weergave-gedeeld-v1`, standaard UIT.
// Omlijsting rond de bestaande formaatweergaven: kop in één regel (naam, vertrouwenslabel, hoofdactie, «Подробиці», «⋯», sluiten),
// snelle kaart, strook met alle bijlagen en een eerlijke laad- en foutstaat. Weet niets van de mail: de bron geeft gegevens en
// acties door. Concept: docs/concept/bijlage-weergave/CONCEPT.md.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, ImageOff, Info, LoaderCircle, MoreHorizontal, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { formaatVan, grootteTekst, kies, soortVan, type Taal, type Tweetalig } from './soort';
import { bewijsUitBlob, metAfzender, type AfzenderBewijs, type Vertrouwen } from './vertrouwen';
import { technischeRijen } from './details';
import { toonWaarde } from './labels';
import { actiesVoor, type Beschikbaar } from './acties';
import { WeergaveEtappe3, type WeergaveExtra } from './Etappe3'; /* етап 3, НЕ ПЕРЕВІРЕНО: Claude Opus 5.5 (High) через Antigravity */
import './weergave.css';

export type WeergaveItem = { naam: string; contentType: string; grootte: number };

/**
 * Етап 4 (НЕ ПЕРЕВІРЕНО, Claude Opus 5.5 (High) через Antigravity): звідки файл.
 * Лише для чесних текстів (помилка, підпис стрічки); логіка шапки від джерела не залежить. Типово — Пошта.
 */
export type WeergaveBron = 'post' | 'schijf' | 'melding' | 'bestand';

/**
 * Етап 4: дія, яку знає лише джерело (Диск — «Відкрити теку», сповіщення — «Прочитано», швидка дія).
 * `zichtbaar` — показати кнопкою зі значком у шапці (не більше двох, щоб не захаращувати); решта йде в «⋯».
 * `toon` — колір значка: звичайний (акцент), «goed» (зелений) або «let» (жовтий).
 */
export type ContextActie = {
  sleutel: string;
  label: Tweetalig;
  uitvoeren: () => void;
  icoon?: LucideIcon;
  zichtbaar?: boolean;
  toon?: 'goed' | 'let';
};

export type KopProps = {
  taal: Taal;
  naam: string;
  contentType: string;
  grootte: number;
  blob?: Blob | null;
  archiefNamen?: string[];
  nav: { index: number; totaal: number } | null;
  beschikbaar: Beschikbaar;
  /** zoom alleen voor afbeeldingen (canvas) */
  zoom?: { waarde: number; zet: (v: number) => void } | null;
  /** volgende bijlage wordt geladen of mislukte */
  staat?: { fase: 'laden' | 'fout'; naam: string; code: string; onOpnieuw: () => void } | null;
  /** etap 2: wat de afzendercontrole al weet (null = nog geen antwoord) */
  afzender?: AfzenderBewijs | null;
  /** етап 3 (НЕ ПЕРЕВІРЕНО): що джерело знає про вкладення — для швидкої картки й дій; без поля все як на етапі 2 */
  extra?: WeergaveExtra | null;
  /** етап 4 (НЕ ПЕРЕВІРЕНО): джерело файла; без поля — Пошта, як раніше */
  bron?: WeergaveBron;
  /** етап 4 (НЕ ПЕРЕВІРЕНО): дії джерела; без поля — як раніше */
  contextActies?: ContextActie[] | null;
  /**
   * етап 4 (НЕ ПЕРЕВІРЕНО): тег кореня шапки. Диск і інші вікна мають широкі правила на кшталт `.drive-viewer header button`,
   * які переписали б кнопки шапки; з 'div' ці правила її не зачіпають. Без поля — 'header', як у Пошті.
   */
  kopElement?: 'header' | 'div';
  /** етап 4 (НЕ ПЕРЕВІРЕНО): не показувати власну кнопку «Закрити», коли її вже має рамка вікна (спільне вікно файла) */
  zonderSluiten?: boolean;
  onSluit: () => void;
};

const t2 = (taal: Taal) => (uk: string, nl: string) => kies(taal, [uk, nl]);

/** Eén menu tegelijk; sluit bij een klik buiten of Escape (Escape van de viewer zelf gaat pas daarna). */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', klik, true); document.addEventListener('keydown', toets, true);
    return () => { document.removeEventListener('mousedown', klik, true); document.removeEventListener('keydown', toets, true); };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Етап 4 (НЕ ПЕРЕВІРЕНО): хто «не віддав файл» — за джерелом; без джерела — сервер пошти, як раніше.
 * Українське дієслово узгоджуємо з родом: «сервер не віддав», «сховище не віддало», «служба не віддала».
 */
const BRON_SERVER: Record<WeergaveBron, { uk: string; nl: string; uitgang: '' | 'о' | 'а' }> = {
  post: { uk: 'Сервер пошти', nl: 'De mailserver', uitgang: '' },
  schijf: { uk: 'Сховище файлів', nl: 'De bestandsopslag', uitgang: 'о' },
  melding: { uk: 'Служба сповіщень', nl: 'De meldingsdienst', uitgang: 'а' },
  bestand: { uk: 'Джерело файла', nl: 'De bron van het bestand', uitgang: 'о' },
};

export function foutTekst(code: string, bron: WeergaveBron = 'post'): [string, string] {
  const w = BRON_SERVER[bron] || BRON_SERVER.post;
  const vidpoviv = w.uitgang ? `відповіл${w.uitgang}` : 'відповів';
  const viddav = w.uitgang ? `віддал${w.uitgang}` : 'віддав';
  if (/TOO_LARGE/.test(code)) return ['Вкладення завелике для безпечного перегляду. Оригінал не змінено, його можна завантажити.', 'De bijlage is te groot voor een veilige weergave. Het origineel is ongewijzigd en kan worden gedownload.'];
  if (/NETWORK|Network|Failed to fetch|ERR_|offline/i.test(code)) return ['Немає зв’язку із сервером. Перевірте мережу й спробуйте ще раз.', 'Geen verbinding met de server. Controleer het netwerk en probeer opnieuw.'];
  if (/TIJD|TIMEOUT|timeout/i.test(code)) return [`${w.uk} не ${vidpoviv} вчасно. Нічого не втрачено.`, `${w.nl} antwoordde niet op tijd. Er is niets verloren.`];
  return [`${w.uk} не ${viddav} файл. Нічого не втрачено — спробуйте ще раз.`, `${w.nl} gaf het bestand niet terug. Er is niets verloren — probeer opnieuw.`];
}

const DONKER_SLEUTEL = 'tsv:bijlage-donkere-paginas';
// Відповідь Павла на питання 1 (22.11.2026): у темній темі темні сторінки вмикаються самі, але людина може повернути оригінал.
// НЕ ПЕРЕВІРЕНО (Claude Opus 5.5 (High) через Google Antigravity). Збережено: 'aan' | 'uit' — явний вибір людини; нічого — за темою.
type DonkerKeuze = 'aan' | 'uit' | null;
function leesDonkerKeuze(): DonkerKeuze { try { const v = window.localStorage.getItem(DONKER_SLEUTEL); return v === 'aan' || v === 'uit' ? v : null; } catch { return null; } }
function bewaarDonker(aan: boolean) { try { window.localStorage.setItem(DONKER_SLEUTEL, aan ? 'aan' : 'uit'); } catch { /* geblokkeerd: alleen deze sessie */ } }
function isDonkerThema(): boolean {
  if (typeof document === 'undefined') return false;
  const c = document.documentElement.classList;
  return !(c.contains('theme-light') || c.contains('theme-plum-light'));
}
/** Темна тема сайту зараз; стежить за зміною класів на <html>, щоб перемикання теми діяло одразу. */
function useDonkerThema(): boolean {
  const [donkerThema, setDonkerThema] = useState(isDonkerThema);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => setDonkerThema(isDonkerThema()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return donkerThema;
}

export function WeergaveKop(p: KopProps) {
  const t = t2(p.taal);
  const soort = soortVan(p.naam, p.contentType);
  const formaat = formaatVan(p.naam);
  const [bestandVertrouwen, setVertrouwen] = useState<Vertrouwen | null>(null);
  const vertrouwen = useMemo(() => bestandVertrouwen ? metAfzender(bestandVertrouwen, p.afzender) : null, [bestandVertrouwen, p.afzender]);
  const [maat, setMaat] = useState<{ b: number; h: number } | null>(null);
  const meer = useMenu(), info = useMenu();
  const infoId = useId();
  // Donkere documentpagina’s: in een donker thema standaard aan (antwoord op open vraag 1); de eigen keuze wordt op dit apparaat onthouden
  const kopRef = useRef<HTMLElement | null>(null);
  const papier = ['rekening', 'contract', 'document', 'tekst', 'presentatie', 'tabel'].includes(soort.sleutel);
  const donkerThema = useDonkerThema();
  const [keuze, setKeuze] = useState<DonkerKeuze>(() => leesDonkerKeuze());
  const donker = keuze === null ? donkerThema : keuze === 'aan';
  const setDonker = (aan: boolean) => setKeuze(aan ? 'aan' : 'uit');
  useEffect(() => {
    const el = kopRef.current?.closest('.google-mail-attachment-preview, [data-weergave-drager]'); /* етап 4: і нейтральний носій */
    if (!el) return;
    if (donker && papier) el.setAttribute('data-donkere-paginas', 'ja'); else el.removeAttribute('data-donkere-paginas');
    return () => el.removeAttribute('data-donkere-paginas');
  }, [donker, papier]);
  useEffect(() => {
    let weg = false; setVertrouwen(null); setMaat(null);
    if (p.blob) {
      void bewijsUitBlob(p.blob, p.naam, p.archiefNamen).then((v) => { if (!weg) setVertrouwen(v); }).catch(() => undefined);
      if (soort.sleutel === 'foto' && typeof createImageBitmap === 'function') void createImageBitmap(p.blob).then((bm) => { if (!weg) setMaat({ b: bm.width, h: bm.height }); bm.close(); }).catch(() => undefined);
    }
    return () => { weg = true; };
  }, [p.blob, p.naam]);
  const { hoofd, overig } = actiesVoor(soort.sleutel, formaat, p.beschikbaar);
  // етап 4 (НЕ ПЕРЕВІРЕНО): не більше двох видимих дій джерела; решта — у «⋯» після звичайних дій
  const ctx = p.contextActies || [];
  const ctxZichtbaar = ctx.filter((a) => a.zichtbaar).slice(0, 2);
  const ctxMenu = ctx.filter((a) => !ctxZichtbaar.includes(a));
  const plaats = p.nav && p.nav.totaal > 1 ? t(`вкладення ${p.nav.index + 1} з ${p.nav.totaal}`, `bijlage ${p.nav.index + 1} van ${p.nav.totaal}`) : '';
  const feiten = [formaat, grootteTekst(p.grootte, p.taal), plaats].filter(Boolean).join(' · ');
  const niveau = vertrouwen?.niveau || 'bezig';
  // етап 4: той самий вміст, лише інший тег кореня (див. kopElement); приведення типу лише для JSX
  const Kop = (p.kopElement === 'div' ? 'div' : 'header') as 'header';
  return (
    <Kop className='weergave-kop' data-weergave-kop='' ref={kopRef} role={p.kopElement === 'div' ? 'group' : undefined} aria-label={p.kopElement === 'div' ? p.naam : undefined}>
      <div className='weergave-rij'>
        <div className='weergave-titel'>
          <strong title={p.naam}>{p.naam}</strong>
          <span>{kies(p.taal, soort.naam)}{feiten ? ` · ${feiten}` : ''}{p.grootte === 0 && <b className='weergave-leeg'>{t(' · файл порожній, вмісту немає', ' · bestand is leeg, geen inhoud')}</b>}</span>
        </div>
        <span className='weergave-vertrouwen' data-niveau={niveau} title={vertrouwen ? kies(p.taal, vertrouwen.zin) : ''} role='status'>
          <i aria-hidden='true' />
          <span className='weergave-vertrouwen-zin'>{vertrouwen ? kies(p.taal, vertrouwen.zin) : t('Перевіряємо файл…', 'Bestand nagaan…')}</span>
          <span className='weergave-vertrouwen-kort'>{vertrouwen ? kies(p.taal, vertrouwen.kort) : t('Перевірка', 'Nagaan')}</span>
        </span>
        <div className='weergave-knoppen' role='toolbar' aria-label={t('Дії вкладення', 'Bijlageacties')}>
          {ctxZichtbaar.length > 0 && <span className='weergave-context'>{ctxZichtbaar.map((a) => { const Icoon = a.icoon; return <button key={a.sleutel} type='button' className='weergave-context-knop' data-toon={a.toon} title={kies(p.taal, a.label)} onClick={a.uitvoeren}>{Icoon ? <Icoon aria-hidden='true' /> : null}<span>{kies(p.taal, a.label)}</span></button>; })}</span>}
          {hoofd && <button type='button' className='weergave-hoofd' onClick={hoofd.uitvoeren}>{kies(p.taal, hoofd.label)}</button>}
          <div className='weergave-menu-anker' ref={info.ref}>
            <button type='button' className='weergave-knop' aria-expanded={info.open} aria-controls={infoId} onClick={() => { meer.setOpen(false); info.setOpen(!info.open); }}>
              <Info aria-hidden='true' /><span>{t('Подробиці', 'Details')}</span>
            </button>
            {info.open && (
              <div className='weergave-paneel' id={infoId} role='dialog' aria-label={t('Подробиці про файл', 'Details over het bestand')}>
                <dl>{technischeRijen({ taal: p.taal, naam: p.naam, contentType: p.contentType, grootte: p.grootte, vertrouwen, breedte: maat?.b, hoogte: maat?.h }).map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{toonWaarde(r.waarde, p.taal)}</dd></div>)}</dl>
                {vertrouwen && <ul className='weergave-bevindingen'>{vertrouwen.bevindingen.map((b) => <li key={b.sleutel} data-ernst={b.ernst}>{kies(p.taal, b.tekst)}</li>)}</ul>}
              </div>
            )}
          </div>
          {(overig.length > 0 || ctxMenu.length > 0 || p.zoom || papier) && (
            <div className='weergave-menu-anker' ref={meer.ref}>
              <button type='button' className='weergave-knop rond' aria-label={t('Ще дії', 'Meer acties')} title={t('Ще дії', 'Meer acties')} aria-expanded={meer.open} onClick={() => { info.setOpen(false); meer.setOpen(!meer.open); }}><MoreHorizontal aria-hidden='true' /></button>
              {meer.open && (
                <div className='weergave-paneel menu' role='menu'>
                  {p.zoom && <div className='weergave-zoom' role='group' aria-label={t('Масштаб', 'Zoom')}>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(Math.max(0.5, Math.round((p.zoom!.waarde - 0.1) * 10) / 10))}>−</button>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(1)}>{Math.round(p.zoom.waarde * 100)} %</button>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(Math.min(2.5, Math.round((p.zoom!.waarde + 0.1) * 10) / 10))}>+</button>
                  </div>}
                  {overig.map((a) => <button key={a.sleutel} type='button' role='menuitem' onClick={() => { meer.setOpen(false); a.uitvoeren(); }}>{kies(p.taal, a.label)}</button>)}
                  {ctxMenu.map((a) => <button key={`ctx:${a.sleutel}`} type='button' role='menuitem' onClick={() => { meer.setOpen(false); a.uitvoeren(); }}>{kies(p.taal, a.label)}</button>)}
                  {papier && <button type='button' role='menuitemcheckbox' aria-checked={donker} className='weergave-keuze' onClick={() => { const n = !donker; setDonker(n); bewaarDonker(n); }}>{donker ? '✓ ' : ''}{donker ? t('Темні сторінки документа · повернути оригінал', 'Donkere documentpagina’s · origineel tonen') : t('Темні сторінки документа', 'Donkere documentpagina’s')}</button>}
                </div>
              )}
            </div>
          )}
          {!p.zonderSluiten && <button type='button' className='weergave-knop rond' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={p.onSluit}><X aria-hidden='true' /></button>}
        </div>
      </div>
      {p.grootte > 0 && <WeergaveEtappe3 taal={p.taal} naam={p.naam} contentType={p.contentType} blob={p.blob} extra={p.extra} />}
      {p.staat && (
        <div className='weergave-melding' data-fase={p.staat.fase} role={p.staat.fase === 'fout' ? 'alert' : 'status'}>
          {p.staat.fase === 'laden'
            ? <><LoaderCircle className='spin' aria-hidden='true' /><span>{t(`Завантажуємо «${p.staat.naam}»…`, `«${p.staat.naam}» laden…`)}</span></>
            : <><span>{t(`«${p.staat.naam}»: `, `«${p.staat.naam}»: `)}{kies(p.taal, foutTekst(p.staat.code, p.bron))}</span><button type='button' onClick={p.staat.onOpnieuw}><RotateCcw aria-hidden='true' />{t('Спробувати ще раз', 'Opnieuw proberen')}</button></>}
        </div>
      )}
    </Kop>
  );
}

/** Een miniatuur: pas laden als hij zichtbaar is in de strook; verkleind tot 160 px zodat een groot foto weinig geheugen kost. */
function Mini(p: { taal: Taal; it: WeergaveItem; i: number; actueel: boolean; laad?: (i: number) => Promise<Blob | null>; onKies: (i: number) => void }) {
  const s = soortVan(p.it.naam, p.it.contentType);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [beeld, setBeeld] = useState('');
  const [geenBeeld, setGeenBeeld] = useState(false);
  const [zichtbaar, setZichtbaar] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !p.laad || s.sleutel !== 'foto' || zichtbaar) return;
    if (typeof IntersectionObserver === 'undefined') { setZichtbaar(true); return; }
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) { setZichtbaar(true); io.disconnect(); } }, { rootMargin: '0px 120px' });
    io.observe(el); return () => io.disconnect();
  }, [p.laad, s.sleutel, zichtbaar]);
  useEffect(() => {
    if (!zichtbaar || !p.laad) return;
    let weg = false, url = '';
    void p.laad(p.i).then(async (blob) => {
      if (!blob || weg) return;
      let klein: Blob = blob;
      try {
        if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
          const bm = await createImageBitmap(blob, { resizeWidth: 160, resizeQuality: 'medium' });
          const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
          c.getContext('2d')?.drawImage(bm, 0, 0); bm.close();
          klein = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b || blob), 'image/webp', 0.8));
        }
      } catch { if (!weg) setGeenBeeld(true); return; /* de browser kan dit beeld niet lezen (bv. HEIC): een duidelijke plaatshouder met formaat en naam, nooit een leeg vak */ }
      if (weg) return;
      url = URL.createObjectURL(klein); setBeeld(url);
    }).catch(() => undefined);
    return () => { weg = true; if (url) URL.revokeObjectURL(url); };
  }, [zichtbaar, p.laad, p.i]);
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(p.it.naam)?.[1] || '').toUpperCase();
  return (
    <button ref={ref} type='button' className='weergave-mini' data-geen-beeld={geenBeeld ? 'ja' : undefined} data-soort={s.sleutel} data-beeld={beeld ? 'ja' : undefined} aria-current={p.actueel ? 'true' : undefined} title={p.it.naam} onClick={() => p.onKies(p.i)}>
      {beeld ? <img src={beeld} alt='' aria-hidden='true' draggable={false} onError={() => { setBeeld(''); setGeenBeeld(true); }} /> : null}
      <b>{kies(p.taal, s.kort)}{geenBeeld && ext ? ` · ${ext}` : ''}</b>
      {geenBeeld ? <i className='weergave-mini-geen' title={p.taal === 'nl' ? 'Geen voorbeeld in deze browser' : 'Цей браузер не показує мініатюру'}><ImageOff aria-hidden='true' /></i> : null}
      <span>{p.it.naam}</span>
    </button>
  );
}

/** Етап 4 (НЕ ПЕРЕВІРЕНО): підпис стрічки за джерелом; без джерела — «Усі вкладення листа», як раніше. */
const STROOK_LABEL: Record<WeergaveBron, [string, string]> = {
  post: ['Усі вкладення листа', 'Alle bijlagen van het bericht'],
  schijf: ['Файли теки', 'Bestanden in de map'],
  melding: ['Усі вкладення сповіщення', 'Alle bijlagen van de melding'],
  bestand: ['Усі файли', 'Alle bestanden'],
};

export function WeergaveStrook(p: { taal: Taal; items: WeergaveItem[]; index: number; onKies: (i: number) => void; laadMini?: (i: number) => Promise<Blob | null>; bron?: WeergaveBron }) {
  const t = t2(p.taal);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [p.index]);
  if (p.items.length < 2) return null;
  return (
    <nav className='weergave-strook' aria-label={kies(p.taal, STROOK_LABEL[p.bron || 'post'])}>
      <button type='button' className='weergave-knop rond' aria-label={t('Попереднє вкладення', 'Vorige bijlage')} disabled={p.index <= 0} onClick={() => p.onKies(p.index - 1)}><ChevronLeft aria-hidden='true' /></button>
      <div className='weergave-strook-lijst' ref={ref}>
        {p.items.map((it, i) => <Mini key={`${i}:${it.naam}`} taal={p.taal} it={it} i={i} actueel={i === p.index} laad={p.laadMini} onKies={p.onKies} />)}
      </div>
      <span className='weergave-strook-teller'>{t(`${p.index + 1} з ${p.items.length}`, `${p.index + 1} van ${p.items.length}`)}</span>
      <button type='button' className='weergave-knop rond' aria-label={t('Наступне вкладення', 'Volgende bijlage')} disabled={p.index >= p.items.length - 1} onClick={() => p.onKies(p.index + 1)}><ChevronRight aria-hidden='true' /></button>
    </nav>
  );
}

/** Eerste opening: het venster verschijnt meteen, ook tijdens het laden en bij een fout (niet stil dichtgaan). */
export function WeergaveStaatVenster(p: { taal: Taal; naam: string; contentType: string; grootte: number; fase: 'laden' | 'fout'; code: string; stijl?: CSSProperties; onOpnieuw: () => void; onSluit: () => void; onDownload?: () => void; binnen?: boolean }) {
  const t = t2(p.taal);
  const soort = soortVan(p.naam, p.contentType);
  const knop = useRef<HTMLButtonElement | null>(null);
  // Afwerking etappe 2: bij sluiten gaat de focus terug naar wat het venster opende (de kaart van de bijlage), ook na een fout. Opent
  // daarna de viewer zelf (laden geslaagd), dan krijgt die de focus en doet dit niets.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    return () => { window.setTimeout(() => { const a = document.activeElement; if (opener && opener.isConnected && (!a || a === document.body) && !document.querySelector('.google-mail-attachment-preview')) opener.focus({ preventScroll: true }); }, 0); };
  }, []);
  useEffect(() => { knop.current?.focus({ preventScroll: true }); }, [p.fase]);
  // Te groot om veilig te tonen: opnieuw proberen helpt niet, downloaden wel.
  const teGroot = p.fase === 'fout' && /TOO_LARGE/.test(p.code) && Boolean(p.onDownload);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); p.onSluit(); } };
    document.addEventListener('keydown', toets); return () => document.removeEventListener('keydown', toets);
  }, [p.onSluit]);
  return (
    <div className='google-mail-attachment-backdrop weergave-staat-achtergrond' style={p.stijl} data-binnen-venster={p.binnen ? 'ja' : undefined} role='presentation'>
      <article className='google-mail-attachment-preview weergave-staat' data-gedeelde-weergave='aan' role='dialog' aria-modal='true' aria-label={p.naam}>
        <header className='weergave-kop'><div className='weergave-rij'>
          <div className='weergave-titel'><strong title={p.naam}>{p.naam}</strong><span>{kies(p.taal, soort.naam)} · {grootteTekst(p.grootte, p.taal)}</span></div>
          <div className='weergave-knoppen'><button type='button' className='weergave-knop rond' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={p.onSluit} ref={p.fase === 'laden' ? knop : undefined}><X aria-hidden='true' /></button></div>
        </div></header>
        <section className='weergave-staat-inhoud' data-fase={p.fase} role={p.fase === 'fout' ? 'alert' : 'status'} aria-live='polite'>
          {p.fase === 'laden'
            ? <><LoaderCircle className='spin' aria-hidden='true' /><strong>{t('Завантажуємо вкладення…', 'Bijlage laden…')}</strong><span>{t('Файл береться просто з пошти й ніде не зберігається.', 'Het bestand komt rechtstreeks uit de mail en wordt nergens bewaard.')}</span></>
            : <><strong>{t('Не вдалося відкрити вкладення', 'Bijlage kon niet worden geopend')}</strong><span>{kies(p.taal, foutTekst(p.code))}</span>
                <div className='weergave-staat-knoppen'>{teGroot
                  ? <button type='button' className='weergave-hoofd' ref={knop} onClick={p.onDownload}><Download aria-hidden='true' />{t('Завантажити', 'Downloaden')}</button>
                  : <button type='button' className='weergave-hoofd' ref={knop} onClick={p.onOpnieuw}><RotateCcw aria-hidden='true' />{t('Спробувати ще раз', 'Opnieuw proberen')}</button>}<button type='button' className='weergave-knop' onClick={p.onSluit}>{t('Закрити', 'Sluiten')}</button></div></>}
        </section>
      </article>
    </div>
  );
}
