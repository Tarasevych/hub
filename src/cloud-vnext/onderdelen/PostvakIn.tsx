// Snelle invoer (PostvakIn, «Швидкий вхід»): de onverdeelde vangst — bestanden zonder werkruimte én zonder map
// (client-side gefilterd uit de vNext-lijst, prullenbak uitgesloten). Per rij: openen in «Мої файли», naar een map
// (MapKiezer in een Laag) of favoriet maken. Eerlijk erbij: het verdelen over wérkruimtes (met secties en statussen)
// blijft bij «Робочі простори» en de bestaande hulpstroom — hier verdelen we alleen over mappen.
import { useCallback, useEffect, useState } from 'react';
import { Folder, Inbox, LoaderCircle, Star } from 'lucide-react';
import type { CloudBestand } from '../../../shared/cloud-vnext-model';
import { cloudClient, type Lijst } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import { SOORT_ICOON, cloudFoutTekst, isBouwFout, sessieZet } from '../hulp';
import Laag from '../Laag';
import MapKiezer from '../MapKiezer';
import { bytesTekst, geledenTekst, tr } from '../tekst';

export default function PostvakIn({ lang, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [rijen, setRijen] = useState<CloudBestand[]>([]);
  const [volgende, setVolgende] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [bouw, setBouw] = useState(false);
  const [fout, setFout] = useState('');
  const [besig, setBesig] = useState(false);
  const [kiesVoor, setKiesVoor] = useState<CloudBestand | null>(null);

  const laad = useCallback(async (token?: string) => {
    setLaden(true);
    try {
      const r: Lijst = await cloudClient.bestanden({ prullenbak: false, sorteer: 'datum', oplopend: false, token: token || undefined });
      const vangst = r.bestanden.filter((b) => !b.workspaceId && !b.mapId);
      setBouw(false); setFout('');
      setRijen((oud) => (token ? [...oud, ...vangst] : vangst));
      setVolgende(r.volgende);
    } catch (e) {
      if (isBouwFout(e)) { setBouw(true); setFout(''); setRijen([]); setVolgende(null); }
      else setFout(cloudFoutTekst(lang, e));
    } finally { setLaden(false); }
  }, [lang]);
  useEffect(() => { void laad(); }, [laad]);

  const open = (b: CloudBestand) => { sessieZet('cvn-open', JSON.stringify(b)); naarTab('files'); };
  const ster = (b: CloudBestand) => {
    setBesig(true); setFout('');
    cloudClient.bestandFavoriet([b.id], !b.favoriet)
      .then(() => { setRijen((rs) => rs.map((x) => (x.id === b.id ? { ...x, favoriet: !b.favoriet } : x))); void vernieuw(); })
      .catch((e) => setFout(cloudFoutTekst(lang, e)))
      .finally(() => setBesig(false));
  };
  const naarMap = (b: CloudBestand, mapId: string | null) => {
    setBesig(true); setFout('');
    cloudClient.bestandVerplaats([b.id], mapId)
      .then(() => { setKiesVoor(null); setRijen((rs) => rs.filter((x) => x.id !== b.id)); toon(tr(lang, `«${b.naam}» розкладено.`, `«${b.naam}» opgeborgen.`)); void vernieuw(); })
      .catch((e) => setFout(cloudFoutTekst(lang, e)))
      .finally(() => setBesig(false));
  };

  return (
    <section className='cvn-blok cvn-postvak' data-cvn-postvak='' aria-label={tr(lang, 'Швидкий вхід', 'Snelle invoer')}>
      <h3><Inbox aria-hidden='true' />{tr(lang, 'Нерозкладене', 'Onverdeeld')}</h3>
      {bouw ? <p className='cvn-melding is-info' role='status' data-cvn-bouw=''>{tr(lang, 'Серверна частина цього розділу ще збирається — список з’явиться, щойно сервер буде готовий.', 'De serverkant van dit onderdeel is nog in aanbouw — de lijst volgt zodra de server klaar is.')}</p> : null}
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      {laden && !rijen.length ? <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Завантаження…', 'Laden…')}</p> : null}
      {!laden && !bouw && !rijen.length ? <div className='cvn-leeg' data-cvn-leeg='postvak'><p>{tr(lang, 'Усе розкладено — нерозкладених файлів немає.', 'Alles is opgeborgen — er ligt niets onverdeeld.')}</p></div> : null}
      {rijen.length ? (
        <ul className='cvn-postvak-rijen' role='list'>
          {rijen.map((b) => {
            const Icoon = SOORT_ICOON[b.soort];
            return (
              <li key={b.id} data-cvn-kaart={b.id}>
                <button type='button' className='cvn-postvak-open' onClick={() => open(b)} aria-label={tr(lang, `Відкрити ${b.naam}`, `${b.naam} openen`)}>
                  <Icoon aria-hidden='true' /><span className='cvn-mini-naam'>{b.naam}</span>
                  <span className='cvn-mini-meta'>{bytesTekst(lang, b.bytes)} · {geledenTekst(lang, b.aangemaaktOp)}</span>
                </button>
                <span className='cvn-postvak-acties' data-cvn-acties={b.id}>
                  <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => setKiesVoor(b)}><Folder aria-hidden='true' />{tr(lang, 'До теки', 'Naar een map')}</button>
                  <button type='button' className={`cvn-icoonknop cvn-ster${b.favoriet ? ' is-aan' : ''}`} data-cvn-favoriet={b.id} aria-pressed={b.favoriet} disabled={besig}
                    aria-label={b.favoriet ? tr(lang, `Прибрати ${b.naam} з обраного`, `${b.naam} uit favorieten`) : tr(lang, `Додати ${b.naam} до обраного`, `${b.naam} favoriet maken`)}
                    onClick={() => ster(b)}><Star aria-hidden='true' /></button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {volgende ? <button type='button' className='cvn-knop cvn-volgende' data-cvn-volgende='' disabled={laden} onClick={() => void laad(volgende)}>{laden ? tr(lang, 'Завантаження…', 'Laden…') : tr(lang, 'Показати ще', 'Meer tonen')}</button> : null}
      <p className='cvn-hint'>{tr(lang, 'Розкладання за просторами (з секціями й статусами) — у «Робочі простори» та майстрі швидкого входу; тут — лише теки й обране.', 'Verdelen over werkruimtes (met secties en statussen) gebeurt bij «Werkruimtes» en de bestaande invoerhulp; hier alleen mappen en favorieten.')}</p>

      {kiesVoor ? (
        <Laag lang={lang} soort='venster' titel={tr(lang, `До теки — ${kiesVoor.naam}`, `Naar een map — ${kiesVoor.naam}`)} onSluit={() => setKiesVoor(null)}>
          {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
          <MapKiezer lang={lang} bezig={besig} onKies={(mapId) => naarMap(kiesVoor, mapId)} />
        </Laag>
      ) : null}
    </section>
  );
}
