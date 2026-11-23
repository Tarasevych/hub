// Geschiedenis — хто, коли й чому: загальна посторінкова стрічка подій усіх карток одразу з фільтрами за видом події та учасником,
// а також повна історія однієї вибраної картки. Порівняння двох ревізій живе у вкладці «Історія» самої картки.
import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw, Search } from 'lucide-react';
import { AFSTEMMING_LIMIETEN, afstemmingTekst, type Gebeurtenis, type GebeurtenisSoort, type Kaart } from '../../../shared/afstemming-model';
import { afstemmingClient } from '../afstemming-client';
import type { OnderdeelProps } from '../AfstemmingPagina';
import { AFSTEMMING_VOLLEDIG_VLAG, GEBEURTENIS_TEKST, actorTekst, afstemmingFoutTekst, gebeurtenisTekst, kleineDatum } from '../hulp';
import { tr } from '../tekst';

const ALLE_SOORTEN = Object.keys(GEBEURTENIS_TEKST) as GebeurtenisSoort[];

export default function Geschiedenis({ lang, ov, openKaart }: OnderdeelProps) {
  // ---- загальна стрічка всіх карток одразу
  const [stroom, setStroom] = useState<Gebeurtenis[]>(() => ov?.recent || []);
  const [kaartMap, setKaartMap] = useState<Record<string, { externId: string; titel: readonly [string, string] }>>({});
  const [stroomToken, setStroomToken] = useState<string | null>(null);
  const [soortFilter, setSoortFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [stroomLaden, setStroomLaden] = useState(false);

  // ---- історія однієї картки
  const [zoek, setZoek] = useState('');
  const [kaart, setKaart] = useState<Kaart | null>(null);
  const [events, setEvents] = useState<Gebeurtenis[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [fout, setFout] = useState('');
  const [besig, setBesig] = useState(false);

  const laadStroom = useCallback(async (verder?: string, soort = soortFilter, actor = actorFilter) => {
    setStroomLaden(true);
    try {
      const uit = await afstemmingClient.geschiedenisAlle({
        ...(verder ? { token: verder } : {}),
        ...(soort ? { soort } : {}),
        ...(actor ? { actor } : {}),
      });
      setStroom((was) => (verder ? [...was, ...uit.gebeurtenissen] : uit.gebeurtenissen));
      setKaartMap((was) => ({ ...was, ...(uit.kaarten || {}) }));
      setStroomToken(uit.volgende);
      setFout('');
    } catch (e) {
      setFout(afstemmingFoutTekst(lang, e));
    } finally {
      setStroomLaden(false);
    }
  }, [actorFilter, lang, soortFilter]);

  useEffect(() => {
    void laadStroom(undefined, soortFilter, actorFilter);
  }, [actorFilter, laadStroom, soortFilter]);

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
    <div className='afv-geschiedenis' data-afv-geschiedenis='' data-vlag={AFSTEMMING_VOLLEDIG_VLAG}>
      <section className='afv-blok' data-afv-volledige-stroom=''>
        <h3><History aria-hidden='true' />{tr(lang, 'Повна стрічка подій усіх карток', 'Volledige gebeurtenissenstroom van alle kaarten')}</h3>
        <div className='afv-rij'>
          <select value={soortFilter} data-afv-geschiedenis-soort='' aria-label={tr(lang, 'Вид події', 'Soort gebeurtenis')} onChange={(e) => setSoortFilter(e.target.value)}>
            <option value=''>{tr(lang, 'Усі види подій', 'Alle soorten gebeurtenissen')}</option>
            {ALLE_SOORTEN.map((s) => <option key={s} value={s}>{gebeurtenisTekst(lang, s)}</option>)}
          </select>
          <select value={actorFilter} data-afv-geschiedenis-actor='' aria-label={tr(lang, 'Учасник', 'Actor')} onChange={(e) => setActorFilter(e.target.value)}>
            <option value=''>{tr(lang, 'Усі учасники', 'Alle actoren')}</option>
            <option value='eigenaar'>{tr(lang, 'Власник', 'Eigenaar')}</option>
            <option value='agent'>{tr(lang, 'Агент ШІ', 'AI-agent')}</option>
            <option value='systeem'>{tr(lang, 'Система', 'Systeem')}</option>
          </select>
          <button type='button' className='afv-knop is-klein' disabled={stroomLaden} onClick={() => void laadStroom(undefined, soortFilter, actorFilter)}>
            <RefreshCw aria-hidden='true' />{tr(lang, 'Оновити стрічку', 'Stroom verversen')}
          </button>
        </div>
        {!stroom.length ? (
          <p className='afv-hint'>{stroomLaden ? tr(lang, 'Завантаження стрічки…', 'Stroom laden…') : tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</p>
        ) : (
          <ul className='afv-tijdlijn' data-afv-stroom-lijst=''>
            {stroom.map((g) => {
              const info = kaartMap[g.kaartId];
              return (
                <li key={g.id}>
                  <button type='button' className='afv-knop is-stil is-klein' onClick={() => openKaart(g.kaartId)}>
                    {info ? `${info.externId} · ` : ''}{gebeurtenisTekst(lang, g.soort)}
                  </button>
                  {info ? <small className='afv-hint'> {afstemmingTekst(info.titel, lang)} · </small> : null}
                  <small className='afv-hint'>{actorTekst(lang, g.actor)} · {kleineDatum(lang, g.op)}</small>
                </li>
              );
            })}
          </ul>
        )}
        {stroomToken ? (
          <button type='button' className='afv-knop is-klein' data-afv-geschiedenis-alle-meer='' disabled={stroomLaden} onClick={() => void laadStroom(stroomToken, soortFilter, actorFilter)}>
            {tr(lang, 'Показати ще', 'Meer tonen')}
          </button>
        ) : null}
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
            <p className='afv-hint'>{tr(lang, 'Порівняння двох ревізій — у самій картці, вкладка «Історія».', 'Het vergelijken van twee revisies staat in de kaart zelf, blad «Geschiedenis».')}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}
