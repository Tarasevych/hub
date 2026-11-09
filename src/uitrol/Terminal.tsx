// «Термінал»: de regels van het installatielogboek zoals root/installeer-app.sh ze schreef (database app.uitrol_run_regels), live bijgewerkt.
// Scrolt mee zolang de lezer onderaan staat; kopiëren/downloaden gebruikt de volledige tekst van wat geladen is.
// UITROL-001 (eigenaar 09.11.2026): de terminal is een venster — in hoogte te trekken (greep onderaan of knoppen), in te klappen,
// schermvullend (Esc sluit) en met één tik terug naar de vorige hoogte; gekleurde labels per onderdeel (root, installer, npm,
// migraties…); eigen scriptmeldingen standaard in de paginataal (uk) met «оригінал» als schakelaar; lettertype met emoji-terugval.
// Термінал: розтягується, згортається, на весь екран, повертається у попередній стан; кольорові мітки; мовою сторінки.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, ClipboardCopy, Download, Maximize2, Minimize2, Minus, Plus, Undo2 } from 'lucide-react';
import { kleurRegel, zonderAnsi } from './terminal-kleur';
import { vertaalRegel } from '../../shared/terminal-taal';
import { regelTags, type Tag } from '../../shared/terminal-tags';
import { opZone, tijdInZone, zoneAfkorting, zoneKeuze, type ZoneKeuze } from './tijdzone';
import { bestandOpslaan, regelsNaarTekst, tr, type Lang, type Regel } from './types';

const MAX_ZICHTBAAR = 1200;
const MIN_HOOGTE = 120;
const STAP_HOOGTE = 120;
const maxHoogte = () => (typeof window !== 'undefined' ? Math.max(MIN_HOOGTE, Math.round(window.innerHeight * 0.8)) : 2000);
const klem = (h: number) => Math.max(MIN_HOOGTE, Math.min(maxHoogte(), Math.round(h)));

type Props = { lang: Lang; regels: Regel[]; live?: boolean; bestandsnaam: string; leeg?: string; hoogte?: number; /** gekleurde labels per regel (standaard aan) */ labels?: boolean };

export default function Terminal({ lang, regels, live, bestandsnaam, leeg, hoogte, labels = true }: Props) {
  const [alleen, setAlleen] = useState(false);
  const [alles, setAlles] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  // UI-010 fase 2 → UITROL-001: eigen scriptmeldingen in de paginataal (alleen weergave; kopiëren/downloaden blijven het origineel).
  // Vroeger alleen achter de vlag uitrol-weergave-v2; nu standaard — de eigenaar wil de terminal in de taal van de site.
  const [origineel, setOrigineel] = useState(false);
  const toon = (t: string) => (!origineel ? vertaalRegel(t, lang) : { tekst: t, vertaald: false });
  // Lokale tijd (of de gekozen zone) met zichtbare zone-afkorting in de balk; vroeger UTC zonder uitleg (audit 18.10.2026, 8d).
  const [zone, setZone] = useState<ZoneKeuze>(zoneKeuze());
  useEffect(() => opZone(setZone), []);
  const bak = useRef<HTMLDivElement>(null);
  const onderaan = useRef(true);

  // ---- venster: hoogte, ingeklapt, schermvullend, vorige stand
  const basis = hoogte || 320;
  const [h, setH] = useState(basis);
  const [ingeklapt, setIngeklapt] = useState(false);
  const [volledig, setVolledig] = useState(false);
  const vorige = useRef<number | null>(null); // hoogte vóór de laatste wijziging → «Повернути»
  const zetHoogte = useCallback((nieuw: number) => { setH((oud) => { const k = klem(nieuw); if (k !== oud) vorige.current = oud; return k; }); }, []);
  const terug = () => { const v = vorige.current; if (v === null) return; vorige.current = h; setH(klem(v)); setIngeklapt(false); };
  // Slepen aan de greep (muis, pen, vinger): pointer capture, zodat ook buiten de greep doorgetrokken kan worden.
  const sleep = useRef<{ y: number; h: number } | null>(null);
  const greepDown = (e: RPointerEvent<HTMLDivElement>) => { if (volledig || ingeklapt) return; sleep.current = { y: e.clientY, h }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); };
  const greepMove = (e: RPointerEvent<HTMLDivElement>) => { const s = sleep.current; if (!s) return; setH(klem(s.h + (e.clientY - s.y))); };
  const greepUp = (e: RPointerEvent<HTMLDivElement>) => { const s = sleep.current; if (!s) return; sleep.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* al los */ } if (klem(s.h) !== h) vorige.current = s.h; };
  const greepToets = (e: RKeyboardEvent<HTMLDivElement>) => { if (e.key === 'ArrowUp') { zetHoogte(h - 40); e.preventDefault(); } else if (e.key === 'ArrowDown') { zetHoogte(h + 40); e.preventDefault(); } };
  // Schermvullend: Esc sluit; de pagina eronder scrolt niet mee.
  useEffect(() => {
    if (!volledig) return undefined;
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') setVolledig(false); };
    document.addEventListener('keydown', toets);
    const oud = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', toets); document.body.style.overflow = oud; };
  }, [volledig]);

  const gefilterd = useMemo(() => (alleen ? regels.filter((r) => r.niveau === 'warn' || r.niveau === 'error') : regels), [regels, alleen]);
  const getoond = alles ? gefilterd : gefilterd.slice(-MAX_ZICHTBAAR);
  const verborgen = gefilterd.length - getoond.length;
  // Labels over ALLE regels (het lopende onderdeel loopt door), daarna per getoonde regel opgezocht.
  const tagsPerNr = useMemo(() => { if (!labels) return new Map<number, Tag[]>(); const alleTags = regelTags(regels.map((r) => r.tekst)); return new Map(regels.map((r, i) => [r.nr, alleTags[i]])); }, [regels, labels]);

  useEffect(() => { const el = bak.current; if (el && onderaan.current) el.scrollTop = el.scrollHeight; }, [getoond.length, live, h, volledig, ingeklapt]);
  const opScroll = () => { const el = bak.current; if (el) onderaan.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
  const kopieer = async () => { try { await navigator.clipboard.writeText(zonderAnsi(regelsNaarTekst(regels))); setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1800); } catch { /* klembord niet beschikbaar */ } };
  const tagTekst = (t: Tag) => (lang === 'uk' ? t.uk : t.nl);

  return <div className='ut-terminal' data-live={live ? 'true' : 'false'} data-volledig={volledig || undefined} data-ingeklapt={ingeklapt || undefined} role={volledig ? 'dialog' : undefined} aria-modal={volledig || undefined} aria-label={volledig ? tr(lang, 'Термінал на весь екран', 'Terminal schermvullend') : undefined}>
    <div className='ut-terminal-balk'>
      <span className='ut-terminal-titel'><i aria-hidden='true' />{tr(lang, 'Термінал встановлення', 'Installatieterminal')}{live && <b>{tr(lang, 'наживо', 'live')}</b>}<small className='ut-terminal-zone' title={tr(lang, 'Часова зона рядків — змінюється в «Налаштування»', 'Tijdzone van de regels — te wijzigen bij «Instellingen»')}>{tr(lang, 'час', 'tijd')}: {zoneAfkorting(new Date(), zone, lang)}</small>{ingeklapt && <small className='ut-terminal-tel'>{tr(lang, `${regels.length} рядків`, `${regels.length} regels`)}</small>}</span>
      <span className='ut-terminal-knoppen'>
        {lang === 'uk' && <label className='ut-terminal-schakel' title='Показати рядки точно так, як їх записав сервер (без перекладу)'><input data-hulp-vrij='filter' type='checkbox' checked={origineel} onChange={(e) => setOrigineel(e.target.checked)} data-ut-origineel />оригінал</label>}
        <label className='ut-terminal-schakel'><input data-hulp-vrij='filter' type='checkbox' checked={alleen} onChange={(e) => setAlleen(e.target.checked)} />{tr(lang, 'лише попередження й помилки', 'alleen waarschuwingen en fouten')}</label>
        <button type='button' onClick={() => void kopieer()} disabled={!regels.length} aria-label={tr(lang, 'Копіювати журнал', 'Logboek kopiëren')}>{gekopieerd ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}<span>{gekopieerd ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}</span></button>
        <button type='button' onClick={() => bestandOpslaan(bestandsnaam, zonderAnsi(regelsNaarTekst(regels)))} disabled={!regels.length} aria-label={tr(lang, 'Завантажити журнал', 'Logboek downloaden')}><Download aria-hidden='true' /><span>{tr(lang, 'Завантажити', 'Downloaden')}</span></button>
        <span className='ut-terminal-venster' role='group' aria-label={tr(lang, 'Розмір вікна термінала', 'Grootte van het terminalvenster')}>
          <button type='button' className='ut-terminal-icoon' disabled={volledig || ingeklapt || h <= MIN_HOOGTE} onClick={() => zetHoogte(h - STAP_HOOGTE)} title={tr(lang, 'Зменшити вікно', 'Venster kleiner')} aria-label={tr(lang, 'Зменшити вікно термінала', 'Terminalvenster kleiner')}><Minus aria-hidden='true' /></button>
          <button type='button' className='ut-terminal-icoon' disabled={volledig || ingeklapt || h >= maxHoogte()} onClick={() => zetHoogte(h + STAP_HOOGTE)} title={tr(lang, 'Збільшити вікно', 'Venster groter')} aria-label={tr(lang, 'Збільшити вікно термінала', 'Terminalvenster groter')}><Plus aria-hidden='true' /></button>
          <button type='button' className='ut-terminal-icoon' disabled={volledig} aria-pressed={ingeklapt} onClick={() => setIngeklapt((v) => !v)} title={ingeklapt ? tr(lang, 'Розгорнути термінал', 'Terminal uitklappen') : tr(lang, 'Згорнути термінал (лишиться лише смужка)', 'Terminal inklappen (alleen de balk blijft)')} aria-label={ingeklapt ? tr(lang, 'Розгорнути термінал', 'Terminal uitklappen') : tr(lang, 'Згорнути термінал', 'Terminal inklappen')} data-ut-inklappen>{ingeklapt ? <ChevronsUpDown aria-hidden='true' /> : <ChevronsDownUp aria-hidden='true' />}</button>
          <button type='button' className='ut-terminal-icoon' aria-pressed={volledig} onClick={() => { setVolledig((v) => !v); setIngeklapt(false); }} title={volledig ? tr(lang, 'Повернути у сторінку (Esc)', 'Terug in de pagina (Esc)') : tr(lang, 'На весь екран — стежити за встановленням великим планом; Esc повертає', 'Schermvullend — de installatie groot volgen; Esc keert terug')} aria-label={volledig ? tr(lang, 'Вийти з повноекранного режиму', 'Schermvullend sluiten') : tr(lang, 'Термінал на весь екран', 'Terminal schermvullend')} data-ut-volledig>{volledig ? <Minimize2 aria-hidden='true' /> : <Maximize2 aria-hidden='true' />}</button>
          {vorige.current !== null && !volledig && <button type='button' className='ut-terminal-icoon' onClick={terug} title={tr(lang, `Повернути попередню висоту (${vorige.current} px)`, `Vorige hoogte terug (${vorige.current} px)`)} aria-label={tr(lang, 'Повернути попередню висоту', 'Vorige hoogte terug')} data-ut-terug><Undo2 aria-hidden='true' /></button>}
        </span>
      </span>
    </div>
    {!ingeklapt && <div className='ut-terminal-bak' ref={bak} onScroll={opScroll} style={volledig ? undefined : { height: h, maxHeight: 'none' }} role='log' aria-live={live ? 'polite' : 'off'} tabIndex={0} data-labels={labels || undefined} data-gezet={h !== basis || undefined}>
      {verborgen > 0 && <button type='button' className='ut-terminal-meer' onClick={() => setAlles(true)}>{tr(lang, `Показати ще ${verborgen} ранніх рядків`, `Toon nog ${verborgen} eerdere regels`)}</button>}
      {getoond.map((r) => { const v = toon(r.tekst); const tags = tagsPerNr.get(r.nr) || [];
        return <div key={r.nr} className='ut-regel' data-niveau={r.niveau} data-tag={tags[0]?.id}>
          <span className='ut-regel-nr'>{r.nr}</span>
          <span className='ut-regel-tijd' title={r.tijd || undefined}>{tijdInZone(r.tijd, zone, lang)}</span>
          {labels && <span className='ut-regel-tags' aria-hidden={tags.length ? undefined : true}>{tags.slice(0, 2).map((t) => <i key={t.id} className='ut-tag' data-tag={t.id} title={tagTekst(t)}>{tagTekst(t)}</i>)}</span>}
          <span className='ut-regel-tekst' title={v.vertaald ? zonderAnsi(r.tekst) : undefined} data-vertaald={v.vertaald || undefined}>{kleurRegel(v.tekst).map((d, i) => (d.k ? <span key={i} className={`ut-k ut-k-${d.k}`}>{d.t}</span> : d.t))}</span>
        </div>; })}
      {!getoond.length && <p className='ut-terminal-leeg'>{leeg || tr(lang, 'Журнал порожній — рядки з’являться, щойно сервер почне обробку.', 'Het logboek is leeg — regels verschijnen zodra de server begint.')}</p>}
      {live && <div className='ut-regel ut-cursor' aria-hidden='true'><span className='ut-regel-nr' /><span className='ut-regel-tijd' />{labels && <span className='ut-regel-tags' />}<span className='ut-regel-tekst'>▍</span></div>}
    </div>}
    {!ingeklapt && !volledig && <div className='ut-terminal-greep' role='separator' aria-orientation='horizontal' aria-label={tr(lang, 'Потягніть, щоб змінити висоту термінала (стрілки ↑↓ — з клавіатури)', 'Sleep om de hoogte van de terminal te wijzigen (pijltjes ↑↓ met het toetsenbord)')} aria-valuenow={h} aria-valuemin={MIN_HOOGTE} aria-valuemax={maxHoogte()} tabIndex={0} onPointerDown={greepDown} onPointerMove={greepMove} onPointerUp={greepUp} onPointerCancel={greepUp} onKeyDown={greepToets} data-ut-greep><i aria-hidden='true' /></div>}
  </div>;
}
