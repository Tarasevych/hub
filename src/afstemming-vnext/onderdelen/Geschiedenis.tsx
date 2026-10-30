// Geschiedenis — wie, wanneer, waarom: de jongste gebeurtenissen uit het overzicht plus de volledige, bladerbare
// geschiedenis van ÉÉN gekozen kaart (zoeken op ID of titel). De volledige stroom over alle kaarten tegelijk is in deze
// golf eerlijk «gepland» en heet ook zo; het revisie-diff leeft in het kaartdetail (blad «Історія»).
import { useState } from 'react';
import { History, Search } from 'lucide-react';
import { AFSTEMMING_LIMIETEN, afstemmingTekst, type Gebeurtenis, type Kaart } from '../../../shared/afstemming-model';
import { afstemmingClient } from '../afstemming-client';
import type { OnderdeelProps } from '../AfstemmingPagina';
import { actorTekst, afstemmingFoutTekst, gebeurtenisTekst, kleineDatum } from '../hulp';
import { tr } from '../tekst';

export default function Geschiedenis({ lang, ov, openKaart }: OnderdeelProps) {
  const [zoek, setZoek] = useState('');
  const [kaart, setKaart] = useState<Kaart | null>(null);
  const [events, setEvents] = useState<Gebeurtenis[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [fout, setFout] = useState('');
  const [besig, setBesig] = useState(false);

  const vind = () => void (async () => {
    setBesig(true); setFout(''); setKaart(null); setEvents(null); setToken(null);
    try {
      const uit = await afstemmingClient.kaarten({ zoek: zoek.trim() });
      const k = uit.kaarten[0];
      if (!k) { setFout(tr(lang, 'Картку не знайдено.', 'Geen kaart gevonden.')); return; }
      setKaart(k);
      const g = await afstemmingClient.geschiedenis(k.id);
      setEvents(g.gebeurtenissen); setToken(g.volgende);
    } catch (e) { setFout(afstemmingFoutTekst(lang, e)); }
    finally { setBesig(false); }
  })();
  const meer = () => void (async () => {
    if (!kaart || !token) return;
    try { const g = await afstemmingClient.geschiedenis(kaart.id, token); setEvents((was) => [...(was || []), ...g.gebeurtenissen]); setToken(g.volgende); }
    catch (e) { setFout(afstemmingFoutTekst(lang, e)); }
  })();

  return (
    <div className='afv-geschiedenis' data-afv-geschiedenis=''>
      <section className='afv-blok'>
        <h3><History aria-hidden='true' />{tr(lang, 'Останні події в усій картотеці', 'Jongste gebeurtenissen in de hele kartotheek')}</h3>
        {!ov || !ov.recent.length ? <p className='afv-hint'>{tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</p> : (
          <ul className='afv-tijdlijn'>
            {ov.recent.map((g) => (
              <li key={g.id}>
                <button type='button' className='afv-knop is-stil is-klein' onClick={() => openKaart(g.kaartId)}>{gebeurtenisTekst(lang, g.soort)}</button>
                <small className='afv-hint'>{actorTekst(lang, g.actor)} · {kleineDatum(lang, g.op)}</small>
              </li>
            ))}
          </ul>
        )}
        <p className='afv-hint'>{tr(lang, 'Повна стрічка всіх карток одразу — заплановано; нижче — повна історія однієї картки.', 'De volledige stroom over alle kaarten tegelijk is gepland; hieronder de volledige geschiedenis van één kaart.')}</p>
      </section>
      <section className='afv-blok'>
        <h3><Search aria-hidden='true' />{tr(lang, 'Історія однієї картки', 'Geschiedenis van één kaart')}</h3>
        <div className='afv-rij'>
          <input value={zoek} data-afv-geschiedenis-zoek='' placeholder={tr(lang, 'ID (UI-014) або слова з назви…', 'ID (UI-014) of woorden uit de titel…')} aria-label={tr(lang, 'Пошук картки', 'Kaart zoeken')}
            onChange={(e) => setZoek(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && zoek.trim().length >= AFSTEMMING_LIMIETEN.zoekMin) vind(); }} />
          <button type='button' className='afv-knop' disabled={besig || zoek.trim().length < AFSTEMMING_LIMIETEN.zoekMin} onClick={vind}>{tr(lang, 'Знайти', 'Zoeken')}</button>
        </div>
        {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
        {kaart ? (
          <>
            <p><code>{kaart.externId}</code> · {afstemmingTekst(kaart.titel, lang)}
              <button type='button' className='afv-knop is-klein is-stil' onClick={() => openKaart(kaart.id)}>{tr(lang, 'Відкрити картку', 'Kaart openen')}</button>
            </p>
            <ul className='afv-tijdlijn' data-afv-geschiedenis-lijst=''>
              {(events || []).map((g) => <li key={g.id}><strong>{gebeurtenisTekst(lang, g.soort)}</strong><small className='afv-hint'> · {actorTekst(lang, g.actor)} · {g.bron} · {kleineDatum(lang, g.op)}</small></li>)}
              {events && !events.length ? <li className='afv-hint'>{tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</li> : null}
            </ul>
            {token ? <button type='button' className='afv-knop is-klein' onClick={meer}>{tr(lang, 'Показати ще', 'Meer tonen')}</button> : null}
            <p className='afv-hint'>{tr(lang, 'Порівняння двох ревізій (diff) — у самій картці, вкладка «Історія».', 'Het vergelijken van twee revisies (diff) staat in de kaart zelf, blad «Geschiedenis».')}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}
