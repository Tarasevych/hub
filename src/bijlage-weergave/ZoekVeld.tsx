// Спільний перегляд вкладень, етап 3, розділ 15.6 (CONSOL-001 / SPIL-WEERGAVE):
// пошук в усіх вкладеннях відкритого листа одразу, включно зі сканами та зображеннями без текстового шару.
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений.
//
// Правила (розділ 15.6, «Приватність і безпека»):
//   • шукаємо лише вкладення відкритого листа, не всю скриньку;
//   • файли читаємо лише після того, як людина ввела запит (>= 2 знаки), послідовно по одному;
//   • спершу береться власний текстовий шар у браузері (PDF, текст, Word/ODT/RTF);
//   • якщо текстового шару немає, а файл придатний як скан (PDF або растрове фото <= 20 МБ) і передано herkenScan,
//     викликається вузький серверний шлях розпізнавання тексту зі скану під захистом простору користувача.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, LoaderCircle, Search, X } from 'lucide-react';
import { kanScanHerkennen, MAX_SCAN_OCR_BYTES, ocrFoutUitleg } from './ocr-client';
import { kies, soortVan, type Taal } from './soort';
import { leesTekst, tekstMogelijk, TEKST_MAX_BLOB } from './tekst';
import { zoekInBijlagen, type ZoekItem, type ZoekTreffer } from './zoek';

export type ZoekBronItem = { naam: string; contentType: string; grootte: number; bijlageId: string };
export type ZoekBron = {
  items: ZoekBronItem[];
  /** Повний файл вкладення за номером (або null, якщо не вдалося). */
  laad: (i: number) => Promise<Blob | null>;
  /** Відкрити вкладення з цим номером у переглядачі. */
  onOpen: (i: number) => void;
  huidig: number;
  /** Необов’язкове розпізнавання тексту зі скану чи зображення (до 20 МБ, лише після запиту людини). */
  herkenScan?: (i: number) => Promise<{ status: string; tekst: string }>;
};

type TekstStaat =
  | { fase: 'bezig' }
  | { fase: 'klaar'; tekst: string; uitScan?: boolean }
  | { fase: 'geen-laag'; reden?: string }
  | { fase: 'fout' };

const MIN_VRAAG = 2;
const PER_BESTAND = 3;

function knip(s: string): string { return s.replace(/\s+/g, ' '); }

/** 1 файл, 2 файли, 5 файлів, 21 файл. */
function failiv(n: number): string {
  const d = n % 100, o = n % 10;
  if (d >= 11 && d <= 14) return `${n} файлів`;
  if (o === 1) return `${n} файл`;
  if (o >= 2 && o <= 4) return `${n} файли`;
  return `${n} файлів`;
}
/** у 1 файлі, у 3 файлах, у 21 файлі. */
function uFailakh(n: number): string { return n % 10 === 1 && n % 100 !== 11 ? `у ${n} файлі` : `у ${n} файлах`; }

/** Уривок із підсвіченим збігом: до 40 знаків по обидва боки, зі знаком «…», якщо обрізано. */
function Fragment(p: { tekst: string; t: ZoekTreffer }) {
  const a = Math.max(0, p.t.start - 40), b = Math.min(p.tekst.length, p.t.einde + 40);
  return (
    <span className='weergave-zoek-fragment'>
      {a > 0 ? '…' : ''}{knip(p.tekst.slice(a, p.t.start))}<mark>{knip(p.tekst.slice(p.t.start, p.t.einde))}</mark>{knip(p.tekst.slice(p.t.einde, b))}{b < p.tekst.length ? '…' : ''}
    </span>
  );
}

export function ZoekVeld(p: { taal: Taal; bron: ZoekBron; onSluit: () => void }) {
  const t = (uk: string, nl: string) => kies(p.taal, [uk, nl]);
  const veldId = useId();
  const invoer = useRef<HTMLInputElement | null>(null);
  const [vraag, setVraag] = useState('');
  const [rustig, setRustig] = useState('');
  const [teksten, setTeksten] = useState<Record<string, TekstStaat>>({});
  const sluitRef = useRef(p.onSluit);
  sluitRef.current = p.onSluit;
  // Джерело від батька створюється наново на кожне відмальовування; беремо найсвіжіше з посилання,
  // а перезапуск читання прив’язуємо лише до складу вкладень.
  const bronRef = useRef(p.bron);
  bronRef.current = p.bron;
  const tekstenRef = useRef(teksten);
  tekstenRef.current = teksten;
  const samenstelling = p.bron.items.map((it) => it.bijlageId).join('|');
  const actief = rustig.length >= MIN_VRAAG;

  useEffect(() => { invoer.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { const h = window.setTimeout(() => setRustig(vraag.trim()), 220); return () => window.clearTimeout(h); }, [vraag]);

  // Читаємо файли лише після першого справжнього запиту людини, по одному, щоб не забити мережу й пам’ять.
  // Якщо текстового шару немає, але передано herkenScan і розмір <= 20 МБ — запускаємо розпізнавання скану.
  useEffect(() => {
    if (!actief) return;
    let weg = false;
    void (async () => {
      const items = bronRef.current.items;
      for (let i = 0; i < items.length && !weg; i += 1) {
        const it = items[i];
        const al = tekstenRef.current[it.bijlageId];
        if (al && al.fase !== 'bezig') continue;

        const heeftKlientsLaag = tekstMogelijk(it.naam, it.contentType) && it.grootte > 0 && it.grootte <= TEKST_MAX_BLOB;
        const herkenScanFn = bronRef.current.herkenScan;
        const geschiktVoorScan = Boolean(herkenScanFn) && kanScanHerkennen(it.naam, it.contentType, it.grootte);

        if (!heeftKlientsLaag && !geschiktVoorScan) {
          const isGroteScan = Boolean(herkenScanFn) && it.grootte > MAX_SCAN_OCR_BYTES && kanScanHerkennen(it.naam, it.contentType, MAX_SCAN_OCR_BYTES);
          setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'geen-laag', reden: isGroteScan ? 'te_groot' : 'niet_ondersteund' } }));
          continue;
        }

        setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'bezig' } }));
        try {
          if (heeftKlientsLaag) {
            const blob = await bronRef.current.laad(i);
            if (weg) return;
            if (!blob && !geschiktVoorScan) {
              setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'fout' } }));
              continue;
            }
            if (blob) {
              const r = await leesTekst(blob, it.contentType, it.naam);
              if (weg) return;
              if (r.tekst.trim()) {
                setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'klaar', tekst: r.tekst } }));
                continue;
              }
            }
          }

          if (geschiktVoorScan && bronRef.current.herkenScan) {
            const scan = await bronRef.current.herkenScan(i);
            if (weg) return;
            if (scan.tekst.trim()) {
              setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'klaar', tekst: scan.tekst, uitScan: true } }));
            } else if (scan.status === 'fout') {
              setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'fout' } }));
            } else {
              setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'geen-laag', reden: scan.status || 'leeg' } }));
            }
            continue;
          }

          const teGrootVoorScan = Boolean(bronRef.current.herkenScan) && it.grootte > MAX_SCAN_OCR_BYTES && kanScanHerkennen(it.naam, it.contentType, MAX_SCAN_OCR_BYTES);
          if (!weg) {
            setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'geen-laag', reden: teGrootVoorScan ? 'te_groot' : 'leeg' } }));
          }
        } catch {
          if (!weg) setTeksten((x) => ({ ...x, [it.bijlageId]: { fase: 'fout' } }));
        }
      }
    })();
    return () => { weg = true; };
  }, [actief, samenstelling]);

  const zoekItems = useMemo<ZoekItem[]>(() => p.bron.items.map((it) => {
    const s = teksten[it.bijlageId];
    return { bijlageId: it.bijlageId, naam: it.naam, tekst: s?.fase === 'klaar' ? s.tekst : '' };
  }), [p.bron.items, teksten]);

  const groepen = useMemo(() => {
    if (rustig.length < MIN_VRAAG) return [];
    const per = new Map<string, ZoekTreffer[]>();
    for (const tr of zoekInBijlagen(zoekItems, rustig)) { const l = per.get(tr.bijlageId) || []; l.push(tr); per.set(tr.bijlageId, l); }
    return p.bron.items.map((it, i) => ({ it, i, treffers: per.get(it.bijlageId) || [] })).filter((g) => g.treffers.length > 0);
  }, [zoekItems, rustig, p.bron.items]);

  const bezig = Object.values(teksten).some((s) => s.fase === 'bezig');
  const zonderLaagStaten = p.bron.items
    .map((it) => teksten[it.bijlageId])
    .filter((s): s is Extract<TekstStaat, { fase: 'geen-laag' }> => s?.fase === 'geen-laag');
  const zonderLaag = zonderLaagStaten.length;
  const ocrNietBeschikbaar = zonderLaagStaten.filter((s) => s.reden === 'ocr_niet_beschikbaar').length;
  const teGrootScans = zonderLaagStaten.filter((s) => s.reden === 'te_groot').length;
  const overigeZonderLaag = zonderLaag - ocrNietBeschikbaar - teGrootScans;
  const mislukt = p.bron.items.filter((it) => teksten[it.bijlageId]?.fase === 'fout').length;
  const totaal = groepen.reduce((n, g) => n + g.treffers.length, 0);

  const open = (i: number) => { p.bron.onOpen(i); };

  return (
    <section className='weergave-zoek' role='search' aria-label={t('Пошук у всіх вкладеннях листа', 'Zoeken in alle bijlagen van het bericht')}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); sluitRef.current(); } }}>
      <div className='weergave-zoek-balk'>
        <Search aria-hidden='true' />
        <label htmlFor={veldId} className='weergave-verborgen'>{t('Що шукати', 'Wat zoeken')}</label>
        <input id={veldId} ref={invoer} type='search' value={vraag} placeholder={t(`Шукати в ${p.bron.items.length} вкладеннях…`, `Zoeken in ${p.bron.items.length} bijlagen…`)}
          onChange={(e) => setVraag(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && groepen[0]) { e.preventDefault(); open(groepen[0].i); } }} />
        {bezig && <LoaderCircle className='spin' aria-label={t('Читаємо файли…', 'Bestanden lezen…')} />}
        <button type='button' className='weergave-knop rond' aria-label={t('Закрити пошук', 'Zoeken sluiten')} onClick={p.onSluit}><X aria-hidden='true' /></button>
      </div>
      {rustig.length >= MIN_VRAAG && (
        <div className='weergave-zoek-uitslag' aria-live='polite'>
          <p className='weergave-zoek-telling'>
            {totaal > 0
              ? t(`Збігів: ${totaal} ${uFailakh(groepen.length)}`, `${totaal} treffer${totaal === 1 ? '' : 's'} in ${groepen.length} bestand${groepen.length === 1 ? '' : 'en'}`)
              : bezig ? t('Шукаємо…', 'Zoeken…') : t('Нічого не знайдено.', 'Niets gevonden.')}
          </p>
          <ol>
            {groepen.map((g) => {
              const s = teksten[g.it.bijlageId];
              const tekst = s?.fase === 'klaar' ? s.tekst : '';
              const uitScan = s?.fase === 'klaar' && Boolean(s.uitScan);
              return (
                <li key={g.it.bijlageId} data-actueel={g.i === p.bron.huidig ? 'ja' : undefined}>
                  <button type='button' onClick={() => open(g.i)}>
                    <span className='weergave-zoek-bestand'>
                      <FileText aria-hidden='true' />
                      <b>{g.it.naam}</b>
                      <small>{kies(p.taal, soortVan(g.it.naam, g.it.contentType).kort)}{uitScan ? ` · ${t('зі скану', 'uit scan')}` : ''} · {g.treffers.length}</small>
                    </span>
                    {g.treffers.filter((tr) => tr.veld === 'tekst').slice(0, PER_BESTAND).map((tr) => <Fragment key={`${tr.start}:${tr.einde}`} tekst={tekst} t={tr} />)}
                    {g.treffers.every((tr) => tr.veld === 'naam') && <span className='weergave-zoek-fragment'>{t('збіг у назві файла', 'treffer in de bestandsnaam')}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {(zonderLaag > 0 || mislukt > 0) && (
            <p className='weergave-zoek-noot' role='note'>
              {ocrNietBeschikbaar > 0 && `${ocrFoutUitleg('ocr_niet_beschikbaar', p.taal)} `}
              {teGrootScans > 0 && `${t(`${failiv(teGrootScans)} перевищує межу 20 МБ для розпізнавання сканів — у них шукаємо за назвою.`, `${teGrootScans} scan${teGrootScans === 1 ? '' : 's'} groter dan 20 MB — daarin zoeken we alleen op naam.`)} `}
              {overigeZonderLaag > 0 && `${t(`${failiv(overigeZonderLaag)} без розпізнаного тексту (архіви або зображення без напису) — у них шукаємо за назвою.`, `${overigeZonderLaag} bestand${overigeZonderLaag === 1 ? '' : 'en'} zonder herkende tekst (archieven of beelden zonder tekst) — daarin zoeken we op naam.`)} `}
              {mislukt > 0 && t(`${failiv(mislukt)} не вдалося прочитати (пошкоджений чи захищений паролем).`, `${mislukt} bestand${mislukt === 1 ? '' : 'en'} kon${mislukt === 1 ? '' : 'den'} niet worden gelezen (beschadigd of met wachtwoord).`)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
