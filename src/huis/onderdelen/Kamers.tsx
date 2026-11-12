// Kamers: verdiepingen, schematische plattegrond (SVG) + lijst, kamer toevoegen/hernoemen/verplaatsen (geometrie met knoppen,
// toegankelijk), kamerpaneel met apparaten en bediening, apparaat naar een kamer verplaatsen. Alleen leden met schrijfrecht bewerken.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minimize2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Ruimte } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import ApparaatBediening from '../ApparaatBediening';
import HuisLaag from '../HuisLaag';
import { HuisFout, huisClient } from '../huis-client';
import { foutTekst, hoofdTekst, soortTekst, tr } from '../tekst';
import Plattegrond from './Plattegrond';

export default function Kamers({ lang, smal, woningId, ov, vernieuw, toon }: OnderdeelProps) {
  const [verdieping, setVerdieping] = useState(ov.woning.verdiepingen[0]?.id ?? '0');
  const [open, setOpen] = useState<Ruimte | null>(null);
  const [bewerk, setBewerk] = useState(false);
  const [nieuw, setNieuw] = useState('');
  const [naam, setNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const mag = ov.lid.magSchrijven;
  const magCmd = mag && ov.integraties.some((i) => i.schrijven);
  const kamer = open ? ov.ruimtes.find((r) => r.id === open.id) ?? null : null;
  const inKamer = useMemo(() => (kamer ? ov.apparaten.filter((a) => a.ruimteId === kamer.id) : []), [kamer, ov.apparaten]);
  const los = useMemo(() => ov.apparaten.filter((a) => !a.ruimteId), [ov.apparaten]);
  const doe = async (f: () => Promise<unknown>, ok?: string) => { setBezig(true); try { await f(); await vernieuw(); if (ok) toon(ok); } catch (e) { toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout'); } finally { setBezig(false); } };
  const maak = () => { const n = nieuw.trim(); if (!n) return; void doe(() => huisClient.ruimteNieuw(woningId, { naam: n, verdieping }), tr(lang, 'Кімнату додано.', 'Kamer toegevoegd.')); setNieuw(''); };
  const schuif = (r: Ruimte, dx: number, dy: number, dw = 0, dh = 0) => doe(() => huisClient.ruimteWijzig(woningId, r.id, { geometrie: { x: Math.max(0, r.geometrie.x + dx), y: Math.max(0, r.geometrie.y + dy), w: Math.max(1, r.geometrie.w + dw), h: Math.max(1, r.geometrie.h + dh) } }));
  return (
    <div className='hv-kamers'>
      <div className='hv-werkbalk'>
        <div className='hv-chips' role='tablist' aria-label={tr(lang, 'Поверхи', 'Verdiepingen')}>
          {ov.woning.verdiepingen.map((v) => <button key={v.id} type='button' role='tab' aria-selected={verdieping === v.id} className={`hv-chip${verdieping === v.id ? ' is-actief' : ''}`} onClick={() => setVerdieping(v.id)} data-hv-verdieping={v.id}>{v.naam}</button>)}
        </div>
        {mag ? <button type='button' className={`hv-knop is-klein${bewerk ? ' is-actief' : ''}`} aria-pressed={bewerk} onClick={() => setBewerk((b) => !b)} data-hv-plan-bewerk='1'><Pencil aria-hidden='true' />{bewerk ? tr(lang, 'Готово', 'Klaar') : tr(lang, 'Редагувати план', 'Plattegrond bewerken')}</button> : null}
      </div>
      <section className='hv-blok'>
        <Plattegrond lang={lang} ruimtes={ov.ruimtes} apparaten={ov.apparaten} verdieping={verdieping} gekozen={kamer?.id} onKies={(r) => setOpen(r)} />
      </section>
      {mag ? (
        <form className='hv-rij' onSubmit={(e) => { e.preventDefault(); maak(); }}>
          <input value={nieuw} maxLength={60} placeholder={tr(lang, 'Нова кімната…', 'Nieuwe kamer…')} aria-label={tr(lang, 'Назва нової кімнати', 'Naam van de nieuwe kamer')} onChange={(e) => setNieuw(e.target.value)} data-hv-kamer-naam='1' />
          <button type='submit' className='hv-knop' disabled={!nieuw.trim() || bezig} data-hv-kamer-maak='1'><Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}</button>
        </form>
      ) : null}
      <ul className='hv-lijst' aria-label={tr(lang, 'Кімнати (список)', 'Kamers (lijst)')}>
        {ov.ruimtes.filter((r) => r.verdieping === verdieping).map((r) => {
          const n = ov.apparaten.filter((a) => a.ruimteId === r.id).length;
          return (
            <li key={r.id} data-hv-kamer={r.id}>
              <button type='button' className='hv-lijst-knop' onClick={() => setOpen(r)}><strong>{r.naam}</strong><small>{n} {tr(lang, 'пристроїв', 'apparaten')} · {r.geometrie.w}×{r.geometrie.h}</small></button>
              {bewerk ? (
                <span className='hv-plan-knoppen' role='group' aria-label={tr(lang, `Положення «${r.naam}»`, `Positie «${r.naam}»`)}>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, -1, 0)} aria-label={tr(lang, 'Ліворуч', 'Naar links')}><ArrowLeft /></button>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, 1, 0)} aria-label={tr(lang, 'Праворуч', 'Naar rechts')}><ArrowRight /></button>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, 0, -1)} aria-label={tr(lang, 'Вгору', 'Omhoog')}><ArrowUp /></button>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, 0, 1)} aria-label={tr(lang, 'Вниз', 'Omlaag')}><ArrowDown /></button>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, 0, 0, 1, 1)} aria-label={tr(lang, 'Більше', 'Groter')}><Maximize2 /></button>
                  <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => void schuif(r, 0, 0, -1, -1)} aria-label={tr(lang, 'Менше', 'Kleiner')}><Minimize2 /></button>
                  <button type='button' className='hv-icoonknop is-gevaar' disabled={bezig} onClick={() => void doe(() => huisClient.ruimteVerwijder(woningId, r.id), tr(lang, 'Кімнату прибрано; пристрої лишилися.', 'Kamer weggehaald; apparaten blijven.'))} aria-label={tr(lang, `Прибрати «${r.naam}»`, `«${r.naam}» weghalen`)}><Trash2 /></button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {los.length ? <p className='hv-hint'>{tr(lang, `${los.length} пристроїв ще без кімнати — відкрийте кімнату, щоб перенести.`, `${los.length} apparaten nog zonder kamer — open een kamer om ze te verplaatsen.`)}</p> : null}
      {kamer ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={kamer.naam} onSluit={() => { setOpen(null); setNaam(''); }} data={{ 'hv-kamer-paneel': kamer.id }}>
          {mag ? (
            <form className='hv-rij' onSubmit={(e) => { e.preventDefault(); if (naam.trim()) void doe(() => huisClient.ruimteWijzig(woningId, kamer.id, { naam: naam.trim() })); }}>
              <input value={naam || kamer.naam} maxLength={60} aria-label={tr(lang, 'Назва кімнати', 'Kamernaam')} onChange={(e) => setNaam(e.target.value)} />
              <button type='submit' className='hv-knop is-klein' disabled={bezig || !naam.trim() || naam.trim() === kamer.naam}>{tr(lang, 'Перейменувати', 'Hernoemen')}</button>
            </form>
          ) : null}
          <h3 className='hv-sub'>{tr(lang, 'Пристрої', 'Apparaten')} <small>{inKamer.length}</small></h3>
          {!inKamer.length ? <p className='hv-hint'>{tr(lang, 'У цій кімнаті ще немає пристроїв.', 'Nog geen apparaten in deze kamer.')}</p> : null}
          {inKamer.map((a) => { const h = hoofdTekst(lang, a); return (
            <article key={a.id} className={`hv-apparaat is-${h.vers}`} data-hv-apparaat={a.id}>
              <header><strong>{a.naam}</strong><small>{soortTekst(lang, a.soort)} · {h.tekst}</small></header>
              <ApparaatBediening lang={lang} woningId={woningId} apparaat={a} magSchrijven={magCmd} compact onVernieuw={() => void vernieuw()} />
              {mag ? <button type='button' className='hv-knop is-klein is-stil' disabled={bezig} onClick={() => void doe(() => huisClient.apparaatWijzig(woningId, a.id, { ruimteId: null }))}>{tr(lang, 'Прибрати з кімнати', 'Uit de kamer halen')}</button> : null}
            </article>
          ); })}
          {mag && los.length ? (
            <>
              <h3 className='hv-sub'>{tr(lang, 'Перенести сюди', 'Hierheen verplaatsen')}</h3>
              <ul className='hv-lijst is-dicht'>{los.slice(0, 50).map((a) => <li key={a.id}><span>{a.naam} <small>{soortTekst(lang, a.soort)}</small></span><button type='button' className='hv-knop is-klein' disabled={bezig} onClick={() => void doe(() => huisClient.apparaatWijzig(woningId, a.id, { ruimteId: kamer.id }))} data-hv-verplaats={a.id}>{tr(lang, 'Сюди', 'Hierheen')}</button></li>)}</ul>
            </>
          ) : null}
        </HuisLaag>
      ) : null}
    </div>
  );
}
