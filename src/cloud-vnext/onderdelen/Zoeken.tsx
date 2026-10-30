// Cloud vNext — ZOEKEN (uitvoerder D, 29.10.2026): zoeken over de BESTAANDE globale zoekindex (backend/globaal-zoek.ts,
// POST /api/owner/zoek via src/zoek/zoek-api.ts), beperkt tot de twee cloudbronnen: 'cloud' (eigen bestanden: naam, tekst,
// OCR) en 'drive' (de Google Drive-projectie). GEEN eigen zoekmachine en GEEN verzonnen resultaten: alles komt uit de index,
// en de markering gebruikt de posities van de SERVER via stukkenUitPosities (tekstknopen + <mark>, nooit innerHTML).
// De stijl leunt op de gedeelde bouwstenen uit cloud-vnext.css (blok, knop, leeg, melding); de eigen regels hieronder zijn
// alleen lay-out met ontwerp-tokens. Overgangen: eigen bestand → sessionStorage 'cvn-open' + tabblad files;
// Drive-bestand → sessionStorage 'cvn-drive-open' + tabblad google (de projectie-id uit route.params.drive).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ExternalLink, File, FileArchive, FileCode, FileImage, FileMusic, FileSpreadsheet, FileText, FileVideo, Folder, Link2, Presentation, Search, StickyNote, X } from 'lucide-react';
import { bronStand, isAfgebroken, zoeken, type Gesloten, type ZoekBron, type ZoekBronStand, type ZoekTreffer, type ZoekUitkomst } from '../../zoek/zoek-api';
import { highlightParts, stukkenUitPosities } from '../../zoek/zoek-kern';
import { canonicalNavigationUrl } from '../../canoniek-navigatie';
import { BRON_STAND_NAAM } from '../../../shared/zoek-model';
import { CLOUD_VNEXT_LIMIETEN, cloudSoort, type CloudSoort } from '../../../shared/cloud-vnext-model';
import { foutTekst, locale, tr, type Lang } from '../tekst';
import type { OnderdeelProps } from '../CloudPagina';

const PER_PAGINA = 20;
const CLOUD_BRONNEN = ['cloud', 'drive'] as const;
type CloudBron = (typeof CLOUD_BRONNEN)[number];
const SOORT_ICOON: Record<CloudSoort, typeof File> = {
  afbeelding: FileImage, video: FileVideo, audio: FileMusic, document: FileText, werkblad: FileSpreadsheet,
  presentatie: Presentation, pdf: FileText, archief: FileArchive, code: FileCode, tekst: FileText, notitie: StickyNote, link: Link2, overig: File,
};
// Lay-out met tokens (geen kleuren buiten de tokens; de mobiele verfijning staat in cloud-vnext-mobiel.css).
const S: Record<string, CSSProperties> = {
  balk: { display: 'flex', gap: 'var(--ruimte-2)', alignItems: 'center', flexWrap: 'wrap' },
  veldWrap: { position: 'relative', flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 },
  lijst: { listStyle: 'none', margin: 0, padding: 0, display: 'grid' },
  rij: { display: 'flex', gap: 'var(--ruimte-3)', alignItems: 'flex-start', width: '100%', textAlign: 'left', background: 'transparent', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, padding: '10px 2px', minHeight: 'var(--tik-hoogte)' },
  rijTekst: { display: 'grid', gap: 2, minWidth: 0, flex: 1 },
  meta: { color: 'var(--muted)', fontSize: 'var(--tekst-mini)', overflowWrap: 'anywhere' },
  fragment: { color: 'var(--muted)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  pct: { flex: 'none', color: 'var(--muted)', fontSize: 'var(--tekst-mini)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px', alignSelf: 'center' },
  ikoon: { flex: 'none', width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 'var(--straal-m)', background: 'var(--surface)', border: '1px solid var(--line)' },
  markering: { background: 'var(--accent-soft)', color: 'inherit', borderRadius: 3 },
  standen: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, justifyItems: 'center' },
};

/** Posities van de server (of de zoektermen als terugval) → tekstknopen met <mark>: geen innerHTML, geen HTML-opbouw. */
function Stuk({ tekst, posities, terms }: { tekst: string; posities: ReadonlyArray<[number, number]>; terms: readonly string[] }): ReactNode {
  const stukken = posities.length ? stukkenUitPosities(tekst, posities) : highlightParts(tekst, terms);
  return <>{stukken.map((p, i) => (p.hit ? <mark key={i} style={S.markering}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}</>;
}

const bronLabel = (lang: Lang, bron: ZoekBron) => (bron === 'drive' ? 'Google Drive' : tr(lang, 'Мої файли', 'Mijn bestanden'));
const datumTekstMs = (lang: Lang, ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** De URL van de volledige zoekpagina (hub › /zoek), met de huidige vraag als ?q=. */
function hubZoekUrl(lang: Lang, q: string): string {
  try { const u = new URL(canonicalNavigationUrl('hub', 'zoek', lang)); if (q) u.searchParams.set('q', q); return u.toString(); } catch { return ''; }
}

export default function Zoeken({ lang, naarTab }: OnderdeelProps) {
  const [q, setQ] = useState('');
  const [aan, setAan] = useState<Record<CloudBron, boolean>>({ cloud: true, drive: true });
  const [uit, setUit] = useState<ZoekUitkomst | null>(null);
  const [items, setItems] = useState<ZoekTreffer[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [standen, setStanden] = useState<ZoekBronStand[]>([]);
  const [gesloten, setGesloten] = useState<Gesloten[]>([]);
  const veldRef = useRef<HTMLInputElement>(null);
  const afbrekerRef = useRef<AbortController | null>(null);
  const klaarVoorRef = useRef('');

  const actief = useMemo(() => CLOUD_BRONNEN.filter((b) => aan[b]), [aan]);
  const terms = useMemo(() => q.trim().split(/\s+/).filter((w) => w.length >= 2), [q]);
  const schoon = q.trim().slice(0, CLOUD_VNEXT_LIMIETEN.zoekMax);

  useEffect(() => { veldRef.current?.focus(); }, []);
  // Stand van de index per bron (eerlijk geteld door de server) — één keer bij openen.
  useEffect(() => {
    let leeft = true;
    bronStand().then(({ standen: st, gesloten: g }) => { if (!leeft) return; setStanden(st.filter((s) => s.bron === 'cloud' || s.bron === 'drive')); setGesloten(g.filter((x) => x.dienst === 'cloud')); }).catch(() => undefined);
    return () => { leeft = false; };
  }, []);

  const voer = useCallback(async (vraag: string, pagina: number, bijvoegen: boolean) => {
    if (vraag.length < 2 || !actief.length) return;     // de server eist ≥ 2 tekens; zonder bron is er niets te vragen
    klaarVoorRef.current = `${vraag}|${actief.join()}|${pagina}`;
    afbrekerRef.current?.abort();
    const afbreker = new AbortController(); afbrekerRef.current = afbreker;
    setBezig(true); setFout('');
    try {
      const antwoord = await zoeken({ q: vraag, bronnen: actief, pagina, perPagina: PER_PAGINA, facets: false }, { signal: afbreker.signal });
      // Gordel: ook al filtert de server op `bronnen`, hier nooit iets tonen dat geen cloudbron is.
      const eigen = antwoord.items.filter((r) => (actief as readonly string[]).includes(r.bron));
      setUit(antwoord);
      setGesloten(antwoord.gesloten.filter((x) => x.dienst === 'cloud'));
      setItems((oud) => {
        const basis = bijvoegen ? oud : [];
        const gezien = new Set(basis.map((r) => `${r.bron}:${r.id}`));
        return [...basis, ...eigen.filter((r) => !gezien.has(`${r.bron}:${r.id}`))];
      });
      setBezig(false);
    } catch (e) {
      if (isAfgebroken(e)) return;                      // vervangen door een nieuwer verzoek: geen fout tonen
      setBezig(false); setItems([]); setUit(null);
      setFout(String((e as { message?: string })?.message || 'FOUT').slice(0, 80));
    }
  }, [actief]);

  // 300 ms na de laatste toetsaanslag (Enter zoekt meteen, Escape wist).
  useEffect(() => {
    if (schoon.length < 2 || !actief.length) { afbrekerRef.current?.abort(); setUit(null); setItems([]); setFout(''); setBezig(false); klaarVoorRef.current = ''; return; }
    const sleutel = `${schoon}|${actief.join()}|1`;
    if (klaarVoorRef.current === sleutel) return;       // Enter was sneller dan de timer: niet dubbel vragen
    const t = window.setTimeout(() => { void voer(schoon, 1, false); }, 300);
    return () => window.clearTimeout(t);
  }, [schoon, actief, voer]);

  const openTreffer = useCallback((r: ZoekTreffer) => {
    const params = (r.route?.params || {}) as Record<string, string>;
    if (r.bron === 'drive') {
      const driveId = typeof params.drive === 'string' && params.drive ? params.drive : '';
      if (driveId) { try { sessionStorage.setItem('cvn-drive-open', driveId); } catch { /* opslag dicht (privévenster): gewoon navigeren */ } }
      naarTab('google');
      return;
    }
    const itemId = typeof params.item === 'string' && params.item ? params.item : r.id.split(':')[0];
    try { sessionStorage.setItem('cvn-open', itemId); } catch { /* opslag dicht: gewoon navigeren */ }
    naarTab('files');
  }, [naarTab]);

  const driveStand = standen.find((s) => s.bron === 'drive');
  const totaal = uit?.totaal ?? 0;
  const meerMogelijk = uit !== null && items.length < totaal && items.length > 0;
  const zoektNu = schoon.length >= 2 && actief.length > 0;

  return (
    <>
      <section className='cvn-blok' aria-label={tr(lang, 'Пошук у хмарі', 'Zoeken in de cloud')}>
        <form role='search' style={S.balk} data-cvn-zoek-balk='' onSubmit={(e) => { e.preventDefault(); if (schoon.length >= 2) void voer(schoon, 1, false); }}>
          <div style={S.veldWrap}>
            <input
              ref={veldRef} type='search' enterKeyHint='search' autoComplete='off' value={q} maxLength={CLOUD_VNEXT_LIMIETEN.zoekMax}
              style={{ flex: 1, minWidth: 0 }} data-cvn-zoek-veld=''
              aria-label={tr(lang, 'Пошук у файлах', 'Zoeken in bestanden')}
              placeholder={tr(lang, 'Знайти файл, текст, фото…', 'Zoek een bestand, tekst, foto…')}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (schoon.length >= 2) void voer(schoon, 1, false); }
                if (e.key === 'Escape') { setQ(''); afbrekerRef.current?.abort(); setUit(null); setItems([]); setFout(''); veldRef.current?.focus(); }
              }}
            />
            {q ? <button type='button' className='cvn-icoonknop' aria-label={tr(lang, 'Очистити', 'Wissen')} onClick={() => { setQ(''); veldRef.current?.focus(); }}><X aria-hidden='true' /></button> : null}
          </div>
          {CLOUD_BRONNEN.map((b) => {
            const st = standen.find((s) => s.bron === b);
            return (
              <button key={b} type='button' className={`cvn-knop is-klein${aan[b] ? ' is-actief' : ''}`}
                aria-pressed={aan[b]} data-cvn-zoek-bron={b}
                onClick={() => setAan((v) => ({ ...v, [b]: !v[b] }))}>
                {bronLabel(lang, b)}{st && st.aantal > 0 ? ` · ${st.aantal}` : ''}
              </button>
            );
          })}
        </form>
        {!actief.length ? <p className='cvn-hint'>{tr(lang, 'Оберіть принаймні одне джерело, щоб шукати.', 'Kies minstens één bron om te zoeken.')}</p> : null}
        {q.length > 0 && schoon.length < 2 ? <p className='cvn-hint'>{tr(lang, 'Введіть щонайменше 2 символи.', 'Typ minstens 2 tekens.')}</p> : null}
        {bezig ? <p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Шукаємо…', 'Zoeken…')}</p> : null}
        {!bezig && uit && zoektNu ? (
          <p className='cvn-hint' role='status'>
            {totaal} {tr(lang, 'результатів', 'resultaten')} · {Math.round(uit.duurMs)} {tr(lang, 'мс', 'ms')}
            {uit.bron === 'live' ? tr(lang, ' · поки без індексу (прямий перегляд)', ' · nog zonder index (directe blik)') : ''}
          </p>
        ) : null}
      </section>

      {gesloten.length > 0 ? (
        <p className='cvn-melding is-info' role='status'>
          {gesloten.map((g) => (lang === 'uk' ? g.uitleg.uk : g.uitleg.nl) || g.code).join(' ')}
        </p>
      ) : null}

      {fout ? (
        <div className='cvn-melding is-fout' role='alert' data-cvn-zoek-fout={fout}>
          <span>{foutTekst(lang, fout)}</span>
          <button type='button' className='cvn-knop is-klein' onClick={() => { if (schoon.length >= 2) void voer(schoon, 1, false); }}>{tr(lang, 'Спробувати ще раз', 'Opnieuw proberen')}</button>
          <a className='cvn-knop is-klein' href={hubZoekUrl(lang, schoon)}>{tr(lang, 'Відкрити повний пошук', 'Volledig zoeken openen')}</a>
        </div>
      ) : null}

      {uit?.verzwakt && items.length > 0 ? <p className='cvn-melding is-info' role='status'>{tr(lang, 'Точних збігів мало — показано часткові збіги.', 'Weinig exacte treffers — gedeeltelijke treffers worden getoond.')}</p> : null}

      {!zoektNu && !fout ? (
        <section className='cvn-leeg' data-cvn-zoek-leeg='start'>
          <Search aria-hidden='true' />
          <p className='cvn-hint'>{tr(lang,
            'Шукає у назвах, тексті та розпізнаному вмісті (OCR) ваших файлів і у файлах Google Drive. Індекс оновлюється приблизно кожні 5 хвилин, тому щойно додані файли з’являються з невеликою затримкою.',
            'Zoekt in namen, tekst en herkende inhoud (OCR) van uw bestanden en in Google Drive. De index wordt ongeveer elke 5 minuten ververst; net toegevoegde bestanden verschijnen dus met een kleine vertraging.')}</p>
          {standen.length > 0 ? (
            <ul style={S.standen}>
              {standen.map((s) => (
                <li key={s.bron} className='cvn-hint'>
                  {bronLabel(lang, s.bron)}: {tr(lang, BRON_STAND_NAAM[s.stand].uk, BRON_STAND_NAAM[s.stand].nl)}
                  {s.aantal > 0 ? ` · ${s.aantal} ${tr(lang, 'об’єктів', 'objecten')}` : ''}
                  {s.stand === 'indexeert' ? ` (${s.voortgang}%)` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {driveStand?.stand === 'niet_gekoppeld' ? (
            <button type='button' className='cvn-knop' onClick={() => naarTab('accounts')}>{tr(lang, 'Google Drive не підключено — відкрити інтеграції', 'Google Drive is niet gekoppeld — integraties openen')}</button>
          ) : null}
          <a className='cvn-knop is-stil' href={hubZoekUrl(lang, '')}>{tr(lang, 'Шукати всюди (пошта, сторінки, GitHub…)', 'Overal zoeken (mail, pagina’s, GitHub…)')}<ExternalLink aria-hidden='true' /></a>
        </section>
      ) : null}

      {zoektNu && !bezig && !fout && uit && items.length === 0 ? (
        <section className='cvn-leeg' data-cvn-zoek-leeg='geen'>
          <Search aria-hidden='true' />
          <p>{tr(lang, `Нічого не знайдено для «${schoon}».`, `Niets gevonden voor “${schoon}”.`)}</p>
          <p className='cvn-hint'>{tr(lang, 'Щойно завантажені файли індексуються до 5 хвилин. Спробуйте інше слово або повний пошук.', 'Net geüploade bestanden worden binnen zo’n 5 minuten geïndexeerd. Probeer een ander woord of het volledige zoeken.')}</p>
          <a className='cvn-knop' href={hubZoekUrl(lang, schoon)}>{tr(lang, 'Шукати всюди', 'Overal zoeken')}</a>
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className='cvn-blok' aria-label={tr(lang, 'Результати пошуку', 'Zoekresultaten')}>
          <ul style={S.lijst}>
            {items.map((r) => {
              const mime = typeof r.extra.mime === 'string' ? r.extra.mime : '';
              const naam = typeof r.extra.bestandsnaam === 'string' && r.extra.bestandsnaam ? r.extra.bestandsnaam : r.titel;
              const Ikoon = r.soort === 'map' ? Folder : SOORT_ICOON[cloudSoort(mime, naam)];
              const titel = r.titels[lang] || r.titel || naam || '—';
              const snippet = r.fragment.tekst && r.fragment.bron !== 'titel' ? r.fragment : null;
              const datum = datumTekstMs(lang, r.bijgewerktOp);
              return (
                <li key={`${r.bron}:${r.id}`}>
                  <button type='button' style={S.rij} data-cvn-zoek-resultaat={`${r.bron}:${r.id}`} onClick={() => openTreffer(r)}>
                    <span style={S.ikoon} aria-hidden='true'><Ikoon /></span>
                    <span style={S.rijTekst}>
                      <strong style={{ overflowWrap: 'anywhere' }}><Stuk tekst={titel} posities={r.fragment.bron === 'titel' ? r.fragment.posities : []} terms={terms} /></strong>
                      {snippet ? <span style={S.fragment}><Stuk tekst={snippet.tekst} posities={snippet.posities} terms={terms} /></span>
                        : r.omschrijving ? <span style={S.fragment}><Stuk tekst={r.omschrijving} posities={[]} terms={terms} /></span> : null}
                      <span style={S.meta}>
                        {bronLabel(lang, r.bron)}{r.pad ? ` · ${r.pad}` : ''}{datum ? ` · ${datum}` : ''}
                      </span>
                    </span>
                    <span style={S.pct} title={tr(lang, 'Відповідність запиту (0–100) відносно найкращого результату цього пошуку', 'Overeenkomst met de vraag (0–100) t.o.v. het beste resultaat van deze zoekopdracht')}>{r.percent}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {meerMogelijk ? (
            <button type='button' className='cvn-knop' disabled={bezig} onClick={() => { void voer(schoon, (uit?.pagina || 1) + 1, true); }}>
              {tr(lang, 'Показати ще', 'Meer tonen')} ({items.length}/{totaal})
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
