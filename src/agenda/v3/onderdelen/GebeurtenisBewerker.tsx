// Afspraak maken of wijzigen. Eerst een EENVOUDIG formulier (titel, dag, tijd, agenda, plaats); «Більше параметрів» opent het
// volledige bestaande venster (AgendaVenster: beschrijving, tijdzone, herhaling, herinneringen, gasten, verplaatsen) met wat u al
// typte — zo gaat geen bestaande mogelijkheid verloren. Versieconflict (ETag): een paneel met beide versies en drie keuzes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, Lock } from 'lucide-react';
import { normaliseerVorm, vormFouten, type AgendaVorm } from '../../../../shared/agenda-model';
import AgendaVenster, { foutTekst } from '../../AgendaVenster';
import type { AgendaKop } from '../../agenda-client';
import { tr, type Lang } from '../tekst';
import Laag from './Laag';
import '../../agenda.css';

type Wijz = {
  bezig: boolean; fout: string; conflict: AgendaVorm | null;
  bewaren: (v: AgendaVorm, meld: string, negeer: boolean) => Promise<boolean>;
  verwijderen: (v: AgendaVorm, meld: string) => Promise<boolean>;
  verplaatsen: (v: AgendaVorm, naar: string) => Promise<boolean>;
  antwoorden: (v: AgendaVorm, a: import('../../../../shared/agenda-model').Antwoord) => Promise<boolean>;
  wisFout: () => void;
};
type Props = { lang: Lang; begin: AgendaVorm; nieuw: boolean; agendas: AgendaKop[]; tijdzone: string; schrijfrecht: boolean; smal: boolean; w: Wijz; onSluit: () => void; onToestaan: () => void };

const dagDeel = (v: string) => v.slice(0, 10);
const tijdDeel = (v: string) => (v.length >= 16 ? v.slice(11, 16) : '');
export default function GebeurtenisBewerker({ lang, begin, nieuw, agendas, tijdzone, schrijfrecht, smal, w, onSluit, onToestaan }: Props) {
  const [vorm, setVorm] = useState<AgendaVorm>(begin);
  const [volledig, setVolledig] = useState(false);
  const [getoond, setGetoond] = useState(false);
  const zet = (p: Partial<AgendaVorm>) => setVorm((o) => normaliseerVorm({ ...o, ...p }));
  const fouten = useMemo(() => vormFouten(vorm), [vorm]);
  const conflictVak = useRef<HTMLElement | null>(null);
  // Een conflict verschijnt onderaan het formulier: meteen in beeld brengen, anders ziet men het niet.
  useEffect(() => { if (w.conflict) conflictVak.current?.scrollIntoView({ block: 'nearest' }); }, [w.conflict]);
  const schrijfbaar = agendas.filter((a) => a.schrijfbaar);
  const titel = nieuw ? tr(lang, 'Нова подія', 'Nieuwe afspraak') : tr(lang, 'Змінити подію', 'Afspraak wijzigen');

  if (!schrijfrecht) {
    return (
      <Laag lang={lang} soort={smal ? 'blad' : 'venster'} titel={titel} onSluit={onSluit} data={{ 'agenda-v3-bewerker': 'alleen-lezen' }}>
        <p className='agv-balk'><Lock aria-hidden='true' /><span>{tr(lang,
          'Ваш Google-календар підключено лише для читання. Щоб створювати й змінювати події, дозвольте запис. Це не нове підключення: Google додасть лише один дозвіл.',
          'Uw Google-agenda is alleen voor lezen gekoppeld. Sta schrijven toe om afspraken te maken en te wijzigen. Dit is geen nieuwe koppeling: Google voegt alleen één toestemming toe.')}</span></p>
        <div className='agv-laag-voet'>
          <button type='button' className='agv-knop is-hoofd' onClick={onToestaan} data-agenda-uitbreiden='1'>{tr(lang, 'Дозволити створення подій', 'Aanmaken toestaan')}</button>
          <button type='button' className='agv-knop' onClick={onSluit}>{tr(lang, 'Не зараз', 'Niet nu')}</button>
        </div>
      </Laag>
    );
  }
  if (volledig) {
    return (
      <AgendaVenster lang={lang} bedoeling={{ vorm, nieuw }} agendas={agendas} standaardTijdzone={tijdzone} magSchrijven={schrijfrecht} bezig={w.bezig} fout={w.fout} conflict={w.conflict}
        onSluiten={() => { w.wisFout(); onSluit(); }}
        onBewaren={async (v, meld, negeer) => { if (await w.bewaren(v, meld, negeer)) onSluit(); }}
        onVerwijderen={async (v, meld) => { if (await w.verwijderen(v, meld)) onSluit(); }}
        onVerplaatsen={async (v, naar) => { if (await w.verplaatsen(v, naar)) onSluit(); }}
        onAntwoord={async (v, a) => { await w.antwoorden(v, a); }} />
    );
  }
  const bewaar = async (negeer = false) => { setGetoond(true); if (fouten.length) return; if (await w.bewaren(vorm, 'none', negeer)) onSluit(); };
  const datum = dagDeel(vorm.begin);
  return (
    <Laag lang={lang} soort={smal ? 'blad' : 'venster'} titel={titel} onSluit={() => { w.wisFout(); onSluit(); }} data={{ 'agenda-v3-bewerker': nieuw ? 'nieuw' : 'wijzigen' }}>
      <form className='agv-vorm' onSubmit={(e) => { e.preventDefault(); void bewaar(); }} noValidate>
        <label className='agv-veld'><span>{tr(lang, 'Назва', 'Titel')}</span>
          <input data-agv-eerste value={vorm.titel} onChange={(e) => zet({ titel: e.target.value })} maxLength={300} required aria-invalid={getoond && !vorm.titel.trim()} data-agenda-v3-titel='1' placeholder={tr(lang, 'Наприклад: зустріч з Олею', 'Bijvoorbeeld: afspraak met Anna')} />
        </label>
        <label className='agv-vink'><input type='checkbox' checked={vorm.heleDag} onChange={(e) => zet(e.target.checked ? { heleDag: true, begin: datum, einde: datum } : { heleDag: false, begin: `${datum}T09:00`, einde: `${datum}T10:00` })} />{tr(lang, 'Увесь день', 'Hele dag')}</label>
        <div className='agv-veldrij'>
          <label className='agv-veld'><span>{tr(lang, 'Дата', 'Datum')}</span>
            <input type='date' value={datum} onChange={(e) => { const d = e.target.value; if (!d) return; zet(vorm.heleDag ? { begin: d, einde: d } : { begin: `${d}T${tijdDeel(vorm.begin) || '09:00'}`, einde: `${d}T${tijdDeel(vorm.einde) || '10:00'}` }); }} data-agenda-v3-datum='1' />
          </label>
          {!vorm.heleDag ? (
            <>
              <label className='agv-veld'><span>{tr(lang, 'Початок', 'Begin')}</span><input type='time' value={tijdDeel(vorm.begin)} onChange={(e) => zet({ begin: `${datum}T${e.target.value}` })} data-agenda-v3-begin='1' /></label>
              <label className='agv-veld'><span>{tr(lang, 'Кінець', 'Einde')}</span><input type='time' value={tijdDeel(vorm.einde)} onChange={(e) => zet({ einde: `${dagDeel(vorm.einde) || datum}T${e.target.value}` })} data-agenda-v3-einde='1' /></label>
            </>
          ) : null}
        </div>
        {schrijfbaar.length > 1 ? (
          <label className='agv-veld'><span>{tr(lang, 'Календар', 'Agenda')}</span>
            <select value={vorm.agendaId} onChange={(e) => zet({ agendaId: e.target.value })} disabled={!nieuw}>{schrijfbaar.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}</select>
          </label>
        ) : null}
        <label className='agv-veld'><span>{tr(lang, 'Місце (необов’язково)', 'Plaats (optioneel)')}</span><input value={vorm.locatie} onChange={(e) => zet({ locatie: e.target.value })} maxLength={500} /></label>
        <p className='agv-klein'>{tr(lang, `Часовий пояс: ${vorm.tijdzone}`, `Tijdzone: ${vorm.tijdzone}`)}{vorm.herhaling.frequentie !== 'geen' ? tr(lang, ' · подія повторюється', ' · afspraak herhaalt zich') : ''}{vorm.deelnemers.length ? tr(lang, ` · учасників: ${vorm.deelnemers.length}`, ` · gasten: ${vorm.deelnemers.length}`) : ''}</p>
        <button type='button' className='agv-tekstknop' onClick={() => setVolledig(true)} data-agenda-v3-meer='1'>{tr(lang, 'Більше параметрів: опис, повторення, нагадування, учасники', 'Meer opties: beschrijving, herhaling, herinneringen, gasten')}<ChevronRight aria-hidden='true' /></button>

        {getoond && fouten.length ? <p className='agv-balk is-fout' role='alert'><AlertTriangle aria-hidden='true' /><span>{fouten.map((f) => foutTekst(f, lang)).join(' ')}</span></p> : null}
        {w.conflict ? (
          <section ref={conflictVak} className='agv-conflict' role='alert' data-agenda-conflict='1' aria-label={tr(lang, 'Конфлікт версій', 'Versieconflict')}>
            <strong>{tr(lang, 'Цю подію щойно змінили в іншому місці. Ваші зміни ще не збережено.', 'Deze afspraak is net elders gewijzigd. Uw wijzigingen zijn nog niet bewaard.')}</strong>
            <dl>
              <div><dt>{tr(lang, 'Ваша версія', 'Uw versie')}</dt><dd data-agenda-conflict-eigen='1'>{vorm.titel} · {vorm.begin} – {vorm.einde}</dd></div>
              <div><dt>{tr(lang, 'Версія в Google', 'Versie in Google')}</dt><dd data-agenda-conflict-google='1'>{w.conflict.titel} · {w.conflict.begin} – {w.conflict.einde}</dd></div>
            </dl>
            <div className='agv-laag-voet'>
              <button type='button' className='agv-knop' onClick={() => { setVorm(w.conflict!); w.wisFout(); }} data-agenda-conflict-overnemen='1'>{tr(lang, 'Взяти версію з Google', 'Versie uit Google nemen')}</button>
              <button type='button' className='agv-knop is-stil-gevaar' disabled={w.bezig} onClick={() => { setVorm({ ...vorm, etag: w.conflict!.etag }); void w.bewaren({ ...vorm, etag: w.conflict!.etag }, 'none', true).then((ok) => { if (ok) onSluit(); }); }} data-agenda-conflict-overschrijven='1'>{tr(lang, 'Перезаписати моєю версією', 'Overschrijven met mijn versie')}</button>
              <button type='button' className='agv-knop' onClick={() => { w.wisFout(); onSluit(); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </div>
          </section>
        ) : w.fout ? <p className='agv-balk is-fout' role='alert' data-agenda-venster-fout={w.fout}><AlertTriangle aria-hidden='true' /><span>{foutTekst(w.fout, lang)}</span></p> : null}

        <div className='agv-laag-voet'>
          <button type='submit' className='agv-knop is-hoofd' disabled={w.bezig} aria-busy={w.bezig || undefined} data-agenda-v3-bewaar='1'>{w.bezig ? tr(lang, 'Збереження…', 'Bewaren…') : w.fout && !w.conflict ? tr(lang, 'Повторити', 'Opnieuw') : tr(lang, 'Зберегти', 'Bewaren')}</button>
          <button type='button' className='agv-knop' onClick={() => { w.wisFout(); onSluit(); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      </form>
    </Laag>
  );
}
