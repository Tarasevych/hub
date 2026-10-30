// Пошта → «Контакти й відправники» (19.10.2026): alle adressen uit alle gekoppelde mailboxen, met zoeken, filters, sortering en
// per contact een paneel met het bewijs uit officiële bronnen («чому»), het vertrouwensniveau en de acties.
// Bereikbaar via het zijmenu van de mail, de globale zoekfunctie (paginalijst), «Усі контакти» in de pastille/het venster en
// Налаштування → Безпека → Відправники. Mobiel: lijst óf paneel (met «До списку»), nooit horizontaal scrollen.
import { ArrowLeft, BadgeCheck, BookUser, Building2, Check, ChevronLeft, ChevronRight, History, Info, Mail, PenLine, Repeat, Search, Send, ShieldAlert, ShieldOff, ShieldQuestion, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { api } from '../platform/client';
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { BRON_TEKST, NIVEAU_TEKST, redenTekst, regelTekst, type AfzenderStatus, type BewijsBron, type BewijsRegel, type VertrouwensNiveau } from '../../shared/mail-afzenders';
import { BEKENDE_DIENSTEN } from '../../shared/mail-bekende-afzenders';
import { afzenderApi, afzenderGewijzigd, contactenApi, foutCode, neemContactOpen, openLijstVan, ruimteWeigeringVan, useScanStand, zetScanStand, type AfzenderInfo, type AuthUit, type ContactDetail, type ContactFilter, type ContactLijst, type ContactSortering, type ScanStand, mailContext } from './api';
import ScanPaneel, { datumTijd, getal } from './ScanPaneel';
import RuimteBand from './RuimteBand';
import AfzenderFoto from './AfzenderFoto';
import { gebruikBeeldStappen, gebruikGekozenBeeld, kiesBeeldBron, noteerBeeld } from './beeld-geschiedenis';
import './afzenders.css';
import './contacten.css';

const AfzenderDialoog = lazy(() => import('./AfzenderDialoog'));
type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const I = { width: 16, height: 16 } as const;
const STATUS: Record<AfzenderStatus, [string, string]> = { geverifieerd: ['Перевірений', 'Bevestigd'], onbekend: ['Не підтверджено', 'Niet bevestigd'], verdacht: ['Підозрілий', 'Verdacht'] };
const statusTekst = (lang: Lang, s: string) => (STATUS[s as AfzenderStatus] || [s, s])[lang === 'uk' ? 0 : 1];
export const FILTERS: Array<{ id: ContactFilter; uk: string; nl: string }> = [
  { id: '', uk: 'Усі', nl: 'Alle' }, { id: 'geverifieerd', uk: 'Перевірені', nl: 'Bevestigd' }, { id: 'onbekend', uk: 'Не підтверджені', nl: 'Niet bevestigd' },
  { id: 'verdacht', uk: 'Підозрілі', nl: 'Verdacht' }, { id: 'geschreven', uk: 'Ви писали', nl: 'U schreef' }, { id: 'officieel', uk: 'Офіційні організації', nl: 'Officiële organisaties' },
  { id: 'contacten', uk: 'Мої контакти', nl: 'Mijn contacten' },
];
export const SORTERINGEN: Array<{ id: ContactSortering; uk: string; nl: string }> = [
  { id: 'recent', uk: 'Остання активність', nl: 'Laatste activiteit' }, { id: 'naam', uk: 'Ім’я (А–Я)', nl: 'Naam (A–Z)' }, { id: 'aantal', uk: 'Кількість листів', nl: 'Aantal berichten' },
  { id: 'vertrouwen', uk: 'Найвища довіра', nl: 'Hoogste vertrouwen' }, { id: 'risico', uk: 'Спершу ризиковані', nl: 'Eerst risico' },
];
const SOORT: Record<string, [string, string]> = { bank: ['банк', 'bank'], overheid: ['державний орган', 'overheid'], betaling: ['платіжний сервіс', 'betaaldienst'], tech: ['технічний сервіс', 'techdienst'], winkel: ['магазин / сервіс', 'winkel / dienst'], post: ['пошта / доставка', 'post / bezorging'] };
const soortVan = (domein: string) => { const d = domein.toLowerCase(); return BEKENDE_DIENSTEN.find((x) => x.domeinen.some((y) => d === y.domein || (y.subdomeinen && d.endsWith(`.${y.domein}`)))) || null; };
/** Laatste Gmail-bewijs van het contact → de vorm die het dialoogvenster toont (F5: niet «Немає даних перевірки» terwijl de scan ze heeft). */
const bekendeAuth = (l?: { spf: string; dmarc: string; dkim: string; tijd: number; authserv?: string; dkimDomein?: string; dmarcDomein?: string }): AuthUit => {
  if (!l || !(l.spf || l.dkim || l.dmarc)) return null;
  const dkim = String(l.dkim || '').split(',').filter(Boolean).map((k) => { const [uitslag, domein = ''] = k.split(':'); return { uitslag, domein }; });
  return { betrouwbaar: true, authserv: l.authserv || '', spf: l.spf || '', dkim: dkim.length ? dkim : l.dkimDomein ? [{ uitslag: 'pass', domein: l.dkimDomein }] : [], dmarc: l.dmarc || '', dmarcDomein: l.dmarcDomein || '' };
};
const laatste = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const BRON_VOLGORDE: BewijsBron[] = ['gebruiker', 'lijst', 'gmail', 'dns', 'heuristiek', 'mail'];
const OP: Record<string, [string, string]> = {
  gezien: ['Уперше побачено', 'Voor het eerst gezien'], automatisch: ['Змінено автоматично', 'Automatisch gewijzigd'], 'handmatig-bevestigd': ['Підтверджено вручну', 'Handmatig bevestigd'],
  ingetrokken: ['Підтвердження відкликано', 'Bevestiging ingetrokken'], bijgewerkt: ['Дані змінено', 'Gegevens gewijzigd'], 'vervangen-van': ['Перенесено з адреси', 'Overgezet van adres'],
  'vervangen-door': ['Замінено новою адресою', 'Vervangen door nieuw adres'], 'verdachte-poging': ['Підозрілий лист із цієї адреси', 'Verdacht bericht van dit adres'],
  'handmatig-verdacht': ['Позначено підозрілим', 'Als verdacht gemarkeerd'], 'markering-opgeheven': ['Позначку «підозрілий» знято', 'Markering «verdacht» opgeheven'], 'in-contacten': ['Додано в контакти', 'Toegevoegd aan contacten'], 'uit-contacten': ['Прибрано з контактів', 'Uit contacten verwijderd'],
};
const FOUT: Record<string, [string, string]> = {
  AFZENDER_VERDACHT_CONTACT: ['Підозрілу адресу не можна додати в контакти. Спершу підтвердьте її вручну.', 'Een verdacht adres kan niet in uw contacten. Bevestig het eerst zelf.'],
  AFZENDER_VERDACHT_BEVESTIG: ['Нова адреса виглядає підозріло. Підтвердіть ризик.', 'Het nieuwe adres lijkt verdacht. Bevestig het risico.'],
  AFZENDER_ADRES_ONGELDIG: ['Адреса недійсна.', 'Het adres is ongeldig.'], AFZENDER_NIET_GEVONDEN: ['Адресу не знайдено.', 'Adres niet gevonden.'],
};
const foutTekst = (lang: Lang, code: string) => (FOUT[code] || [`Не вдалося (${code}).`, `Mislukt (${code}).`])[lang === 'uk' ? 0 : 1];
export const StatusIcoon = ({ s }: { s: AfzenderStatus }) => s === 'geverifieerd' ? <BadgeCheck aria-hidden='true' style={I} /> : s === 'verdacht' ? <ShieldAlert aria-hidden='true' style={I} /> : <ShieldQuestion aria-hidden='true' style={I} />;
const Niveau = ({ lang, n, score }: { lang: Lang; n: VertrouwensNiveau; score?: number }) => <span className={`ctv-niveau ctv-niveau-${n}`} data-niveau={n}>{NIVEAU_TEKST[n][lang === 'uk' ? 0 : 1]}{score !== undefined ? ` · ${score}/100` : ''}</span>;
const BRON_FOTO: Record<string, [string, string]> = {
  'google-contact': ['Google-контакти', 'Google-contacten'], vcard: ['vCard', 'vCard'], gravatar: ['Gravatar', 'Gravatar'],
  bimi: ['BIMI', 'BIMI'], favicon: ['Значок сайту', 'Websitepictogram'], manifest: ['Маніфест сайту', 'Websitemanifest'],
  officieel: ['Офіційний знак', 'Officieel teken'], eigen: ['Своє фото', 'Eigen foto'],
};
const bronFoto = (lang: Lang, bron: string) => (BRON_FOTO[bron] || [bron, bron])[lang === 'uk' ? 0 : 1];
function BeeldKeuze({ lang, adres }: { lang: Lang; adres: string }) {
  const stappen = gebruikBeeldStappen(adres);
  const gekozen = gebruikGekozenBeeld(adres);
  if (!stappen.length) return null;
  return <div className='ctv-beeld-keuze' role='group' aria-label={t(lang, 'Історія фото', 'Fotogeschiedenis')}>
    {stappen.map((s) => <button type='button' key={s.bron} aria-pressed={gekozen?.bron === s.bron} onClick={() => kiesBeeldBron(adres, s.bron)}>{bronFoto(lang, s.bron)}</button>)}
  </div>;
}

function EigenFoto({ lang, adres }: { lang: Lang; adres: string }) {
  const invoer = useRef<HTMLInputElement>(null);
  const vcfIn = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const verkleinen = (bestand: File): Promise<string> => new Promise((ok, nee) => {
    const img = new Image();
    img.onload = () => {
      const max = 320, schaal = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * schaal), h = Math.round(img.height * schaal);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')?.drawImage(img, 0, 0, w, h);
      ok(c.toDataURL('image/webp', 0.82) || c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => nee(new Error('GEEN_BEELD'));
    img.src = URL.createObjectURL(bestand);
  });
  const stuur = async (bestand: File | null) => {
    if (!bestand || bezig) return;
    setBezig(true); setFout('');
    try {
      const data = await verkleinen(bestand);
      const r = await api.post('/api/owner/mail/afzender-beeld/eigen', { ...mailContext(), adres, data });
      if (r.data?.fout) { setFout(String(r.data.fout)); return; }
      if (r.data?.data) { noteerBeeld(adres, 'eigen', String(r.data.data)); kiesBeeldBron(adres, 'eigen'); }
    } catch { setFout(t(lang, 'Не вдалося зберегти фото.', 'Foto opslaan mislukt.')); }
    finally { setBezig(false); if (invoer.current) invoer.current.value = ''; }
  };
  const stuurVcf = async (bestand: File | null) => {
    if (!bestand || bezig) return;
    setBezig(true); setFout('');
    try {
      const vcf = await bestand.text();
      const r = await api.post('/api/owner/mail/afzender-beeld/vcard', { ...mailContext(), adres, vcf });
      if (r.data?.fout) {
        setFout(r.data.fout === 'GEEN_FOTO'
          ? t(lang, 'У цьому vCard немає вбудованого фото. Посилання з картки не завантажуємо.', 'Deze vCard heeft geen ingesloten foto. Een link uit de kaart halen we niet op.')
          : t(lang, 'Не вдалося зберегти фото.', 'Foto opslaan mislukt.'));
        return;
      }
      if (r.data?.data) { noteerBeeld(adres, 'vcard', String(r.data.data)); kiesBeeldBron(adres, 'vcard'); }
    } catch { setFout(t(lang, 'Не вдалося прочитати vCard.', 'vCard lezen mislukt.')); }
    finally { setBezig(false); if (vcfIn.current) vcfIn.current.value = ''; }
  };
  const wissen = async () => {
    if (bezig) return;
    setBezig(true);
    try {
      await api.post('/api/owner/mail/afzender-beeld/eigen', { ...mailContext(), adres, wissen: true });
    } catch { /* stil */ }
    finally { setBezig(false); }
  };
  return <div className='ctv-eigen-foto'>
    <input ref={invoer} type='file' accept='image/jpeg,image/png,image/webp' hidden onChange={(e) => void stuur(e.target.files?.[0] || null)} />
    <input ref={vcfIn} type='file' accept='.vcf,text/vcard,text/x-vcard' hidden onChange={(e) => void stuurVcf(e.target.files?.[0] || null)} />
    <button type='button' className='afz-knop' disabled={bezig} onClick={() => invoer.current?.click()}>{t(lang, 'Своє фото', 'Eigen foto')}</button>
    <button type='button' className='afz-knop' disabled={bezig} onClick={() => vcfIn.current?.click()}>{t(lang, 'Фото з vCard', 'Foto uit vCard')}</button>
    <button type='button' className='afz-knop' disabled={bezig} onClick={() => void wissen()}>{t(lang, 'Прибрати своє', 'Eigen weg')}</button>
    {fout && <span className='afz-stil'>{fout}</span>}
  </div>;
}

export type Begin = { lijst?: ContactLijst; detail?: ContactDetail | null; scan?: ScanStand | null; zoek?: string; filter?: ContactFilter; sorteer?: ContactSortering; open?: string };

export default function ContactenWeergave({ lang, begin }: { lang: Lang; begin?: Begin }) {
  const [zoek, setZoek] = useState(begin?.zoek || ''), [filter, setFilter] = useState<ContactFilter>(begin?.filter || ''), [sorteer, setSorteer] = useState<ContactSortering>(begin?.sorteer || 'recent');
  const [pagina, setPagina] = useState(1), [data, setData] = useState<ContactLijst | null>(begin?.lijst || null), [melding, setMelding] = useState('');
  const [open, setOpen] = useState<string>(begin?.open || begin?.detail?.contact.adres || ''), [detail, setDetail] = useState<ContactDetail | null>(begin?.detail || null);
  const [weergave, setWeergave] = useState<'lijst' | 'kaarten'>('lijst');
  const gedeeld = useScanStand(), scan = gedeeld || begin?.scan || null;
  const zoekTimer = useRef(0), lijstKop = useRef<HTMLHeadingElement | null>(null), detailKop = useRef<HTMLHeadingElement | null>(null);
  const laden = useCallback(async (p = pagina) => {
    // Weigert de ruimtepoort (dienst uit, bevroren, nog niets gekozen), dan NIET «нічого не знайдено» tonen: de band boven
    // deze lijst legt het uit met de tekst van de server, en de lijst blijft leeg zonder een eigen foutmelding.
    try { setData(await contactenApi.lijst({ zoek, filter, sorteer, pagina: p, perPagina: 30 })); setMelding(''); }
    catch (e) { const w = ruimteWeigeringVan(e); setData(null); setMelding(w ? w.uitleg[lang] : foutTekst(lang, foutCode(e))); }
  }, [zoek, filter, sorteer, pagina, lang]);
  const ladenDetail = useCallback(async (adres: string) => {
    if (!adres) { setDetail(null); return; }
    try { setDetail(await contactenApi.detail(adres)); } catch (e) { const w = ruimteWeigeringVan(e); setMelding(w ? w.uitleg[lang] : foutTekst(lang, foutCode(e))); setDetail(null); }
  }, [lang]);
  useEffect(() => { window.clearTimeout(zoekTimer.current); zoekTimer.current = window.setTimeout(() => void laden(), 250); return () => window.clearTimeout(zoekTimer.current); }, [laden]);
  useEffect(() => {
    void contactenApi.scanStatus().then(zetScanStand).catch(() => undefined);
    const a = neemContactOpen(); if (a) setOpen(a);
    const opener = (e: Event) => { const x = String((e as CustomEvent).detail?.adres || neemContactOpen() || ''); if (x) setOpen(x); };
    window.addEventListener('tsv:mail-contact-open', opener);
    return () => window.removeEventListener('tsv:mail-contact-open', opener);
  }, []);
  useEffect(() => { void ladenDetail(open); }, [open, ladenDetail]);
  useEffect(() => { try { if (localStorage.getItem('mijn-ruimte:contacten-weergave') === 'kaarten') setWeergave('kaarten'); } catch { /* geen opslag */ } }, []);
  const zetWeergave = (w: 'lijst' | 'kaarten') => { setWeergave(w); try { localStorage.setItem('mijn-ruimte:contacten-weergave', w); } catch { /* geen opslag */ } };
  // Tijdens de controle: de lijst om de paar seconden bijwerken; aan het einde nog één keer.
  const vorigeLoopt = useRef(false);
  useEffect(() => {
    if (!scan) return;
    if (scan.loopt) { const id = window.setTimeout(() => void laden(), 4000); vorigeLoopt.current = true; return () => window.clearTimeout(id); }
    if (vorigeLoopt.current) { vorigeLoopt.current = false; void laden(); }
  }, [scan?.verwerkt, scan?.loopt]);
  const kies = (adres: string) => { setOpen(adres); window.setTimeout(() => detailKop.current?.focus(), 60); };
  const sluit = () => { const a = open; setOpen(''); setDetail(null); window.setTimeout(() => (document.querySelector(`[data-contact-adres="${CSS.escape(a)}"]`) as HTMLElement | null)?.focus(), 60); };
  // Live-audit 19.10 (F6): Esc sluit het detailpaneel (niet als een dialoog/formulier erbovenop open is: die vangt Esc zelf en stopt de bubbeling).
  useEffect(() => {
    if (!open) return;
    const op = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.defaultPrevented) return; const doel = e.target as HTMLElement | null; if (doel && /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName) && doel.closest('.ctv-detail')) return; e.preventDefault(); sluit(); };
    document.addEventListener('keydown', op);
    return () => document.removeEventListener('keydown', op);
  }, [open]);
  const na = async (f: () => Promise<unknown>, ok: string, adres: string) => {
    setMelding('');
    try { await f(); afzenderGewijzigd(adres); setMelding(ok); await Promise.all([laden(), ladenDetail(adres)]); } catch (e) { setMelding(foutTekst(lang, foutCode(e))); }
  };
  const paginas = data ? Math.max(1, Math.ceil(data.totaal / data.perPagina)) : 1;
  const tel = (id: ContactFilter) => (data ? Number(data.tellers[id || 'alle'] ?? 0) : null);

  return <section className='ctv' data-contacten-weergave data-detail-open={open ? 'ja' : 'nee'} aria-labelledby='ctv-titel'>
    <header className='ctv-kop'>
      <BookUser aria-hidden='true' style={{ width: 22, height: 22 }} />
      <div>
        <h1 id='ctv-titel' ref={lijstKop} tabIndex={-1}>{t(lang, 'Контакти й відправники', 'Contacten en afzenders')}</h1>
        <p>{t(lang, 'Усі адреси з усіх ваших скриньок: від кого ви отримували листи і кому писали самі. Для кожної адреси видно, наскільки їй можна довіряти і чому — з посиланням на джерело.', 'Alle adressen uit al uw mailboxen: van wie u mail kreeg en naar wie u zelf schreef. Per adres ziet u hoeveel vertrouwen het verdient en waarom — met de bron erbij.')}</p>
      </div>
    </header>
    <RuimteBand lang={lang} dienst='contacten' />
    <ScanPaneel lang={lang} s={scan} />

    <div className='ctv-gereedschap'>
      <label className='afz-zoek ctv-zoek'><Search aria-hidden='true' style={I} /><input type='search' value={zoek} placeholder={t(lang, 'Пошук: ім’я, адреса, домен', 'Zoeken: naam, adres, domein')} aria-label={t(lang, 'Пошук контактів', 'Contacten zoeken')} onChange={(e) => { setZoek(e.target.value); setPagina(1); }} /></label>
      <label className='ctv-sorteer'><span>{t(lang, 'Сортування', 'Sorteren')}</span>
        <select value={sorteer} onChange={(e) => { setSorteer(e.target.value as ContactSortering); setPagina(1); }}>{SORTERINGEN.map((s) => <option key={s.id} value={s.id}>{lang === 'uk' ? s.uk : s.nl}</option>)}</select>
      </label>
      <div className='ctv-weergave' role='group' data-weergave={weergave} aria-label={t(lang, 'Вигляд списку', 'Weergave van de lijst')}>
        <button type='button' aria-pressed={weergave === 'lijst'} onClick={() => zetWeergave('lijst')}>{t(lang, 'Список', 'Lijst')}</button>
        <button type='button' aria-pressed={weergave === 'kaarten'} onClick={() => zetWeergave('kaarten')}>{t(lang, 'Картки', 'Kaarten')}</button>
      </div>
    </div>
    <div className='afz-chips ctv-chips' role='group' aria-label={t(lang, 'Фільтр', 'Filter')}>
      {FILTERS.map((f) => <button key={f.id || 'alle'} type='button' data-filter={f.id || 'alle'} data-status={f.id === 'geverifieerd' || f.id === 'onbekend' || f.id === 'verdacht' ? f.id : undefined} aria-pressed={filter === f.id}
        onClick={() => { setFilter(f.id); setPagina(1); }}>{f.id === 'geverifieerd' || f.id === 'onbekend' || f.id === 'verdacht' ? <StatusIcoon s={f.id} /> : f.id === 'geschreven' ? <Send aria-hidden='true' style={I} /> : f.id === 'officieel' ? <Building2 aria-hidden='true' style={I} /> : f.id === 'contacten' ? <BookUser aria-hidden='true' style={I} /> : null}
        {lang === 'uk' ? f.uk : f.nl} <b>{tel(f.id) ?? '…'}</b></button>)}
    </div>
    <p className='afz-melding-regel' role='status' aria-live='polite'>{melding}</p>

    <div className='ctv-romp'>
      <div className='ctv-lijst-vak'>
        <ul className={weergave === 'kaarten' ? 'ctv-lijst ctv-kaarten' : 'ctv-lijst'} aria-label={t(lang, 'Контакти', 'Contacten')}>
          {data?.contacten.map((r) => <li key={r.adres}>
            <button type='button' className={weergave === 'kaarten' ? 'ctv-kaart' : 'ctv-rij'} data-contact-adres={r.adres} data-status={r.status} aria-current={open === r.adres ? 'true' : undefined} onClick={() => kies(r.adres)}>
              {weergave === 'kaarten'
                ? <><AfzenderFoto adres={r.adres} naam={r.naam} maat={48} /><span className={`afz-status afz-status-${r.status}`} data-kaart-status={r.status}><StatusIcoon s={r.status} /><span>{statusTekst(lang, r.status)}</span></span></>
                : <span className={`afz-status afz-status-${r.status}`}><StatusIcoon s={r.status} /><span className='afz-sr'>{STATUS[r.status][lang === 'uk' ? 0 : 1]}</span></span>}
              <span className='ctv-rij-tekst'>
                <strong>{r.naam || r.adres}</strong>
                <span className='afz-mono'>{r.adres}</span>
                <small className='ctv-rij-meta'>
                  <Niveau lang={lang} n={r.niveau} />
                  {r.officieel && <span className='ctv-label'><Building2 aria-hidden='true' style={{ width: 12, height: 12 }} />{t(lang, 'офіційна', 'officieel')}</span>}
                  {r.verzonden > 0 && <span className='ctv-label'><Send aria-hidden='true' style={{ width: 12, height: 12 }} />{t(lang, `ви писали ${r.verzonden}`, `u schreef ${r.verzonden}`)}</span>}
                  {r.inContacten && <span className='ctv-label'><BookUser aria-hidden='true' style={{ width: 12, height: 12 }} />{t(lang, 'контакт', 'contact')}</span>}
                  <span>{t(lang, `листів: ${r.aantal}`, `berichten: ${r.aantal}`)}</span>
                  <span>{datumTijd(lang, laatste(r.laatsteOp, r.laatstVerzondenOp))}</span>
                </small>
              </span>
            </button>
          </li>)}
          {data && !data.contacten.length && <li className='afz-leeg'>{zoek || filter ? t(lang, 'Нічого не знайдено.', 'Niets gevonden.') : t(lang, 'Поки що порожньо. Перевірка всіх адрес заповнить список автоматично.', 'Nog leeg. De controle van alle adressen vult de lijst vanzelf.')}</li>}
          {!data && <li className='afz-leeg'>{t(lang, 'Завантаження…', 'Laden…')}</li>}
        </ul>
        {paginas > 1 && <nav className='afz-paginas' aria-label={t(lang, 'Сторінки', 'Pagina’s')}>
          <button type='button' className='afz-knop' disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}><ChevronLeft aria-hidden='true' style={I} />{t(lang, 'Назад', 'Vorige')}</button>
          <span>{t(lang, `${pagina} з ${paginas}`, `${pagina} van ${paginas}`)}</span>
          <button type='button' className='afz-knop' disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>{t(lang, 'Далі', 'Volgende')}<ChevronRight aria-hidden='true' style={I} /></button>
        </nav>}
      </div>
      {open && <ContactPaneel lang={lang} d={detail} adres={open} kopRef={detailKop} onSluit={sluit} onKies={kies} na={na} />}
    </div>
  </section>;
}

function ContactPaneel({ lang, d, adres, kopRef, onSluit, onKies, na }: { lang: Lang; d: ContactDetail | null; adres: string; kopRef: RefObject<HTMLHeadingElement | null>; onSluit: () => void; onKies: (a: string) => void; na: (f: () => Promise<unknown>, ok: string, adres: string) => Promise<void> }) {
  const [dialoog, setDialoog] = useState(false), [bewerk, setBewerk] = useState<{ naam: string; notitie: string } | null>(null), [vervang, setVervang] = useState<{ nieuw: string; risico: boolean } | null>(null);
  const titelId = useId();
  if (!d || d.contact.adres !== adres) return <aside className='ctv-detail' aria-busy='true' aria-label={t(lang, 'Контакт', 'Contact')}><button type='button' className='afz-knop ctv-terug' onClick={onSluit}><ArrowLeft aria-hidden='true' style={I} />{t(lang, 'До списку', 'Naar de lijst')}</button><p className='afz-stil'>{t(lang, 'Завантаження…', 'Laden…')}</p></aside>;
  const c = d.contact, dienst = soortVan(c.domein);
  const info: AfzenderInfo = { adres: c.adres, naam: c.naam, domein: c.domein, status: c.status, bron: c.bron, reden: c.reden, merk: c.merk, opgeslagen: true, notitie: c.notitie };
  const groepen = BRON_VOLGORDE.map((b) => [b, d.regels.filter((r) => r.bron === b)] as const).filter(([, l]) => l.length);
  return <aside className='ctv-detail' aria-labelledby={titelId} data-contact-detail={c.adres}>
    <button type='button' className='afz-knop ctv-terug' onClick={onSluit}><ArrowLeft aria-hidden='true' style={I} />{t(lang, 'До списку', 'Naar de lijst')}</button>
    <header className='ctv-detail-kop met-foto'>
      <AfzenderFoto adres={c.adres} naam={c.naam} maat={40} />
      <span className={`afz-status afz-status-${c.status}`}><StatusIcoon s={c.status} /></span>
      <div>
        <h2 id={titelId} ref={kopRef} tabIndex={-1}>{c.naam || c.adres}</h2>
        <p className='afz-mono'>{c.adres}</p>
        <p className='ctv-detail-status'><strong data-status={c.status}>{STATUS[c.status][lang === 'uk' ? 0 : 1]}</strong> · <Niveau lang={lang} n={c.niveau} score={c.vertrouwen} /></p>
        <BeeldKeuze lang={lang} adres={c.adres} />
        <EigenFoto lang={lang} adres={c.adres} />
        {dienst && <p className='ctv-detail-org'><Building2 aria-hidden='true' style={{ width: 14, height: 14 }} />{t(lang, 'Офіційна організація', 'Officiële organisatie')}: {dienst.merk}{dienst.soort ? ` (${SOORT[dienst.soort][lang === 'uk' ? 0 : 1]})` : ''}</p>}
      </div>
      <button type='button' className='afz-sluit ctv-sluit' aria-label={t(lang, 'Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' style={{ width: 18, height: 18 }} /></button>
    </header>
    <div className={`afz-melding afz-melding-${c.status}`}><p>{c.status === 'geverifieerd' && c.bron === 'handmatig' ? redenTekst('HANDMATIG', lang) : redenTekst(c.reden || 'NIET_BEVESTIGD', lang)}</p></div>

    <div className='ctv-acties'>
      {c.status !== 'geverifieerd' && <button type='button' className='afz-knop afz-knop-hoofd' onClick={() => setDialoog(true)}><BadgeCheck aria-hidden='true' style={I} />{t(lang, 'Підтвердити вручну', 'Zelf bevestigen')}</button>}
      {c.status === 'geverifieerd' && c.bron === 'handmatig' && <button type='button' className='afz-knop' onClick={() => void na(() => afzenderApi.intrekken(c.adres), t(lang, 'Підтвердження відкликано.', 'Bevestiging ingetrokken.'), c.adres)}><X aria-hidden='true' style={I} />{t(lang, 'Відкликати підтвердження', 'Bevestiging intrekken')}</button>}
      {c.status === 'verdacht' && c.reden === 'HANDMATIG_VERDACHT' && <button type='button' className='afz-knop' onClick={() => void na(() => afzenderApi.intrekken(c.adres), t(lang, 'Позначку знято.', 'Markering opgeheven.'), c.adres)}><ShieldOff aria-hidden='true' style={I} />{t(lang, 'Зняти позначку', 'Markering opheffen')}</button>}
      {c.status !== 'verdacht' && <button type='button' className='afz-knop afz-gevaar' onClick={() => { if (window.confirm(t(lang, `Позначити ${c.adres} як підозрілу адресу? Листи з неї матимуть червону позначку.`, `${c.adres} als verdacht markeren? Berichten ervan krijgen een rode markering.`))) void na(() => contactenApi.verdacht(c.adres), t(lang, 'Позначено як підозрілу.', 'Als verdacht gemarkeerd.'), c.adres); }}><ShieldAlert aria-hidden='true' style={I} />{t(lang, 'Позначити підозрілим', 'Als verdacht markeren')}</button>}
      {!c.inContacten ? <button type='button' className='afz-knop' disabled={c.status === 'verdacht'} title={c.status === 'verdacht' ? foutTekst(lang, 'AFZENDER_VERDACHT_CONTACT') : undefined} onClick={() => void na(() => contactenApi.contact(c.adres, true), t(lang, 'Додано в контакти.', 'Toegevoegd aan contacten.'), c.adres)}><UserPlus aria-hidden='true' style={I} />{t(lang, 'Додати в контакти', 'Toevoegen aan contacten')}</button>
        : <button type='button' className='afz-knop' onClick={() => void na(() => contactenApi.contact(c.adres, false), t(lang, 'Прибрано з контактів.', 'Uit contacten verwijderd.'), c.adres)}><UserMinus aria-hidden='true' style={I} />{t(lang, 'Прибрати з контактів', 'Uit contacten')}</button>}
      {c.aantal > 0 && <button type='button' className='afz-knop' onClick={() => openLijstVan(c.adres, d.huidigAccount, 'van')}><Mail aria-hidden='true' style={I} />{t(lang, 'Відкрити листи від нього', 'Berichten van deze afzender')}</button>}
      {c.verzonden > 0 && <button type='button' className='afz-knop' onClick={() => openLijstVan(c.adres, d.huidigAccount, 'naar')}><Send aria-hidden='true' style={I} />{t(lang, 'Ваші листи до нього', 'Uw berichten aan dit adres')}</button>}
    </div>

    <section className='ctv-blok' aria-labelledby={`${titelId}-waarom`}>
      <h3 id={`${titelId}-waarom`}>{t(lang, 'Чому так', 'Waarom')}</h3>
      {groepen.map(([bron, regels]) => <div key={bron} className='ctv-bron'>
        <h4>{BRON_TEKST[bron][lang === 'uk' ? 0 : 1]}</h4>
        <ul className='ctv-regels'>{regels.map((r: BewijsRegel, i) => <li key={`${r.code}-${i}`} data-toon={r.toon} data-code={r.code}>
          <span className='ctv-regel-icoon' aria-hidden='true'>{r.toon === 'goed' ? <Check style={{ width: 14, height: 14 }} /> : r.toon === 'slecht' ? <X style={{ width: 14, height: 14 }} /> : <Info style={{ width: 14, height: 14 }} />}</span>
          <span><span className='afz-sr'>{r.toon === 'goed' ? t(lang, 'На користь: ', 'Pleit voor: ') : r.toon === 'slecht' ? t(lang, 'Проти: ', 'Pleit tegen: ') : t(lang, 'Довідка: ', 'Info: ')}</span>{regelTekst(r, lang)}{r.tijd ? <small> · {datumTijd(lang, r.tijd)}</small> : null}</span>
        </li>)}</ul>
      </div>)}
    </section>

    <section className='ctv-blok'>
      <h3>{t(lang, 'Листування', 'Correspondentie')}</h3>
      <dl className='ctv-feiten'>
        <div><dt>{t(lang, 'Отримано', 'Ontvangen')}</dt><dd>{getal(lang, c.aantal)} · {datumTijd(lang, c.laatsteOp)}</dd></div>
        <div><dt>{t(lang, 'Ви писали', 'U schreef')}</dt><dd>{getal(lang, c.verzonden)}{c.laatstVerzondenOp ? ` · ${datumTijd(lang, c.laatstVerzondenOp)}` : ''}</dd></div>
        <div><dt>{t(lang, 'Уперше', 'Eerst gezien')}</dt><dd>{datumTijd(lang, c.eersteOp)}</dd></div>
        {c.accountsInfo.length > 0 && <div><dt>{t(lang, 'У скриньках', 'In mailboxen')}</dt><dd className='afz-mono'>{c.accountsInfo.map((a) => a.email || a.id).join(', ')}</dd></div>}
        {c.notitie && <div><dt>{t(lang, 'Нотатка', 'Notitie')}</dt><dd>{c.notitie}</dd></div>}
      </dl>
    </section>

    {d.verwant.length > 0 && <section className='ctv-blok'>
      <h3>{t(lang, 'Інші адреси цієї особи чи організації', 'Andere adressen van deze persoon of organisatie')}</h3>
      <ul className='ctv-verwant'>{d.verwant.map((v) => <li key={v.adres}><button type='button' className='ctv-verwant-knop' onClick={() => onKies(v.adres)}>
        <span className={`afz-status afz-status-${v.status}`}><StatusIcoon s={v.status} /><span className='afz-sr'>{STATUS[v.status][lang === 'uk' ? 0 : 1]}</span></span>
        <span><strong>{v.naam || v.adres}</strong><span className='afz-mono'>{v.adres}</span><small>{t(lang, `листів: ${v.aantal}`, `berichten: ${v.aantal}`)}{v.verzonden ? t(lang, ` · ви писали ${v.verzonden}`, ` · u schreef ${v.verzonden}`) : ''}</small></span>
      </button></li>)}</ul>
    </section>}

    <section className='ctv-blok ctv-beheer'>
      <h3>{t(lang, 'Керування', 'Beheer')}</h3>
      <div className='ctv-acties'>
        <button type='button' className='afz-knop' onClick={() => setBewerk({ naam: c.naam, notitie: c.notitie })}><PenLine aria-hidden='true' style={I} />{t(lang, 'Ім’я й нотатка', 'Naam en notitie')}</button>
        <button type='button' className='afz-knop' onClick={() => setVervang({ nieuw: '', risico: false })}><Repeat aria-hidden='true' style={I} />{t(lang, 'Замінити адресу', 'Adres vervangen')}</button>
        <button type='button' className='afz-knop afz-gevaar' onClick={() => { if (window.confirm(t(lang, `Видалити ${c.adres} з бази? Під час наступної перевірки адресу буде знайдено знову.`, `${c.adres} uit de database verwijderen? Bij de volgende controle wordt het adres opnieuw gevonden.`))) void na(async () => { await afzenderApi.verwijderen(c.adres); onSluit(); }, t(lang, 'Видалено.', 'Verwijderd.'), c.adres); }}><Trash2 aria-hidden='true' style={I} />{t(lang, 'Видалити', 'Verwijderen')}</button>
      </div>
      {bewerk && <form className='afz-inline' onSubmit={(e) => { e.preventDefault(); void na(async () => { await afzenderApi.bijwerken(c.adres, bewerk); setBewerk(null); }, t(lang, 'Збережено.', 'Opgeslagen.'), c.adres); }}>
        <label className='afz-veld'><span>{t(lang, 'Ім’я', 'Naam')}</span><input value={bewerk.naam} maxLength={200} onChange={(e) => setBewerk({ ...bewerk, naam: e.target.value })} /></label>
        <label className='afz-veld'><span>{t(lang, 'Нотатка', 'Notitie')}</span><input value={bewerk.notitie} maxLength={500} onChange={(e) => setBewerk({ ...bewerk, notitie: e.target.value })} /></label>
        <div className='afz-inline-knoppen'><button type='button' className='afz-knop' onClick={() => setBewerk(null)}>{t(lang, 'Скасувати', 'Annuleren')}</button><button type='submit' className='afz-knop afz-knop-hoofd'>{t(lang, 'Зберегти', 'Opslaan')}</button></div>
      </form>}
      {vervang && <form className='afz-inline' onSubmit={(e) => { e.preventDefault(); void na(async () => { const r = await afzenderApi.vervangen(c.adres, vervang.nieuw, vervang.risico); setVervang(null); if (r?.adres) onKies(r.adres); }, t(lang, 'Адресу замінено.', 'Adres vervangen.'), c.adres); }}>
        <label className='afz-veld'><span>{t(lang, 'Нова адреса відправника', 'Nieuw adres van de afzender')}</span><input type='email' required value={vervang.nieuw} onChange={(e) => setVervang({ ...vervang, nieuw: e.target.value })} /></label>
        <label className='afz-vink'><input type='checkbox' checked={vervang.risico} onChange={(e) => setVervang({ ...vervang, risico: e.target.checked })} /><span>{t(lang, 'Якщо нова адреса виглядатиме підозріло — я все одно підтверджую', 'Als het nieuwe adres verdacht lijkt — ik bevestig het toch')}</span></label>
        <div className='afz-inline-knoppen'><button type='button' className='afz-knop' onClick={() => setVervang(null)}>{t(lang, 'Скасувати', 'Annuleren')}</button><button type='submit' className='afz-knop afz-knop-hoofd'>{t(lang, 'Замінити', 'Vervangen')}</button></div>
      </form>}
      {(c.historie || []).length > 0 && <details className='ctv-historie'><summary><History aria-hidden='true' style={{ width: 14, height: 14 }} />{t(lang, 'Історія змін', 'Geschiedenis')}</summary>
        <ol>{[...(c.historie || [])].reverse().map((h, i) => <li key={i}><time>{datumTijd(lang, h.tijd)}</time> {(OP[h.op] || [h.op, h.op])[lang === 'uk' ? 0 : 1]}{h.van && h.naar ? ` (${statusTekst(lang, h.van)} → ${statusTekst(lang, h.naar)})` : ''}{h.door === 'systeem' ? ` · ${t(lang, 'система', 'systeem')}` : ''}</li>)}</ol>
      </details>}
    </section>
    {dialoog && <Suspense fallback={null}><AfzenderDialoog lang={lang} from={c.naam ? `${c.naam} <${c.adres}>` : c.adres} info={info} messageId='' accountId='' bekendeAuth={bekendeAuth(c.bewijs?.laatste)} zonderContactenLink onSluit={() => { setDialoog(false); void na(async () => undefined, '', c.adres); }} /></Suspense>}
  </aside>;
}
