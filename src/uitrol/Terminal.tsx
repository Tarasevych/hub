// «Термінал»: de regels van het installatielogboek zoals root/installeer-app.sh ze schreef (database app.uitrol_run_regels), live bijgewerkt.
// Scrolt mee zolang de lezer onderaan staat; kopiëren/downloaden gebruikt de volledige tekst van wat geladen is.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download } from 'lucide-react';
import { kleurRegel, zonderAnsi } from './terminal-kleur';
import { vertaalRegel } from '../../shared/terminal-taal';
import { useUitrolV2 } from './uitrol-vlag';
import { opZone, tijdInZone, zoneAfkorting, zoneKeuze, type ZoneKeuze } from './tijdzone';
import { bestandOpslaan, regelsNaarTekst, tr, type Lang, type Regel } from './types';

const MAX_ZICHTBAAR = 1200;

export default function Terminal({ lang, regels, live, bestandsnaam, leeg, hoogte }: { lang: Lang; regels: Regel[]; live?: boolean; bestandsnaam: string; leeg?: string; hoogte?: number }) {
  const [alleen, setAlleen] = useState(false);
  const [alles, setAlles] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  // UI-010 fase 2: eigen scriptmeldingen in de paginataal (alleen weergave; kopiëren/downloaden blijven het origineel).
  const v2 = useUitrolV2() === true; const [origineel, setOrigineel] = useState(false);
  const toon = (t: string) => (v2 && !origineel ? vertaalRegel(t, lang) : { tekst: t, vertaald: false });
  // Lokale tijd (of de gekozen zone) met zichtbare zone-afkorting in de balk; vroeger UTC zonder uitleg (audit 18.10.2026, 8d).
  const [zone, setZone] = useState<ZoneKeuze>(zoneKeuze());
  useEffect(() => opZone(setZone), []);
  const bak = useRef<HTMLDivElement>(null);
  const onderaan = useRef(true);

  const gefilterd = useMemo(() => (alleen ? regels.filter((r) => r.niveau === 'warn' || r.niveau === 'error') : regels), [regels, alleen]);
  const getoond = alles ? gefilterd : gefilterd.slice(-MAX_ZICHTBAAR);
  const verborgen = gefilterd.length - getoond.length;

  useEffect(() => { const el = bak.current; if (el && onderaan.current) el.scrollTop = el.scrollHeight; }, [getoond.length, live]);
  const opScroll = () => { const el = bak.current; if (el) onderaan.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
  const kopieer = async () => { try { await navigator.clipboard.writeText(zonderAnsi(regelsNaarTekst(regels))); setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1800); } catch { /* klembord niet beschikbaar */ } };

  return <div className='ut-terminal' data-live={live ? 'true' : 'false'}>
    <div className='ut-terminal-balk'>
      <span className='ut-terminal-titel'><i aria-hidden='true' />{tr(lang, 'Термінал встановлення', 'Installatieterminal')}{live && <b>{tr(lang, 'наживо', 'live')}</b>}<small className='ut-terminal-zone' title={tr(lang, 'Часова зона рядків — змінюється в «Налаштування»', 'Tijdzone van de regels — te wijzigen bij «Instellingen»')}>{tr(lang, 'час', 'tijd')}: {zoneAfkorting(new Date(), zone, lang)}</small></span>
      <span className='ut-terminal-knoppen'>
        {v2 && lang === 'uk' && <label className='ut-terminal-schakel' title='Показати рядки точно так, як їх записав сервер'><input data-hulp-vrij='filter' type='checkbox' checked={origineel} onChange={(e) => setOrigineel(e.target.checked)} data-ut-origineel />оригінал</label>}
        <label className='ut-terminal-schakel'><input data-hulp-vrij='filter' type='checkbox' checked={alleen} onChange={(e) => setAlleen(e.target.checked)} />{tr(lang, 'лише попередження й помилки', 'alleen waarschuwingen en fouten')}</label>
        <button type='button' onClick={() => void kopieer()} disabled={!regels.length} aria-label={tr(lang, 'Копіювати журнал', 'Logboek kopiëren')}>{gekopieerd ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}<span>{gekopieerd ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}</span></button>
        <button type='button' onClick={() => bestandOpslaan(bestandsnaam, zonderAnsi(regelsNaarTekst(regels)))} disabled={!regels.length} aria-label={tr(lang, 'Завантажити журнал', 'Logboek downloaden')}><Download aria-hidden='true' /><span>{tr(lang, 'Завантажити', 'Downloaden')}</span></button>
      </span>
    </div>
    <div className='ut-terminal-bak' ref={bak} onScroll={opScroll} style={hoogte ? { maxHeight: hoogte } : undefined} role='log' aria-live={live ? 'polite' : 'off'} tabIndex={0}>
      {verborgen > 0 && <button type='button' className='ut-terminal-meer' onClick={() => setAlles(true)}>{tr(lang, `Показати ще ${verborgen} ранніх рядків`, `Toon nog ${verborgen} eerdere regels`)}</button>}
      {getoond.map((r) => <div key={r.nr} className='ut-regel' data-niveau={r.niveau}>
        <span className='ut-regel-nr'>{r.nr}</span>
        <span className='ut-regel-tijd' title={r.tijd || undefined}>{tijdInZone(r.tijd, zone, lang)}</span>
        <span className='ut-regel-tekst' title={toon(r.tekst).vertaald ? zonderAnsi(r.tekst) : undefined} data-vertaald={toon(r.tekst).vertaald || undefined}>{kleurRegel(toon(r.tekst).tekst).map((d, i) => (d.k ? <span key={i} className={`ut-k ut-k-${d.k}`}>{d.t}</span> : d.t))}</span>
      </div>)}
      {!getoond.length && <p className='ut-terminal-leeg'>{leeg || tr(lang, 'Журнал порожній — рядки з’являться, щойно сервер почне обробку.', 'Het logboek is leeg — regels verschijnen zodra de server begint.')}</p>}
      {live && <div className='ut-regel ut-cursor' aria-hidden='true'><span className='ut-regel-nr' /><span className='ut-regel-tijd' /><span className='ut-regel-tekst'>▍</span></div>}
    </div>
  </div>;
}
