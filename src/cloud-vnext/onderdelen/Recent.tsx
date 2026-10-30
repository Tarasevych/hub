// Останні (Recent): de recentste bestanden uit het overzicht (datum aflopend, zonder mappen), met soort-chips om
// te verfijnen. Openen gaat via «Мої файли» (sessionStorage 'cvn-open'), de ster werkt hier direct. Eerlijk: de lijst
// is zo lang als de server haar in het overzicht geeft — geen verzonnen geschiedenis.
import { useState } from 'react';
import { Star } from 'lucide-react';
import { CLOUD_SOORT_LABEL, type CloudBestand, type CloudSoort } from '../../../shared/cloud-vnext-model';
import { cloudClient } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import { SOORT_ICOON, cloudFoutTekst, sessieZet } from '../hulp';
import { bytesTekst, datumTekst, tr } from '../tekst';

const SOORTEN = Object.keys(CLOUD_SOORT_LABEL) as CloudSoort[];

export default function Recent({ lang, ov, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [soort, setSoort] = useState<CloudSoort | ''>('');
  const [fout, setFout] = useState('');
  const [besig, setBesig] = useState(false);
  if (!ov) {
    return <section className='cvn-blok'><p className='cvn-melding is-info' role='status' data-cvn-bouw=''>{tr(lang, 'Серверна частина цього розділу ще збирається — список останніх з’явиться, щойно сервер буде готовий.', 'De serverkant van dit onderdeel is nog in aanbouw — de recente lijst volgt zodra de server klaar is.')}</p></section>;
  }
  const rijen = ov.recent
    .filter((b) => !soort || b.soort === soort)
    .slice()
    .sort((a, b) => Date.parse(b.bijgewerktOp || '') - Date.parse(a.bijgewerktOp || ''));
  const open = (b: CloudBestand) => { sessieZet('cvn-open', JSON.stringify(b)); naarTab('files'); };
  const ster = async (b: CloudBestand) => {
    setBesig(true); setFout('');
    try { await cloudClient.bestandFavoriet([b.id], !b.favoriet); toon(b.favoriet ? tr(lang, 'Прибрано з обраного.', 'Uit favorieten gehaald.') : tr(lang, 'Додано до обраного.', 'Aan favorieten toegevoegd.')); await vernieuw(); }
    catch (e) { setFout(cloudFoutTekst(lang, e)); }
    finally { setBesig(false); }
  };

  return (
    <div className='cvn-recent' data-cvn-recent='pagina'>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      <div className='cvn-chips' role='group' aria-label={tr(lang, 'Типи файлів', 'Bestandssoorten')}>
        {SOORTEN.map((s) => (
          <button key={s} type='button' className={`cvn-knop is-klein${soort === s ? ' is-actief' : ''}`} data-cvn-soort={s} aria-pressed={soort === s}
            onClick={() => setSoort(soort === s ? '' : s)}>{tr(lang, CLOUD_SOORT_LABEL[s][0], CLOUD_SOORT_LABEL[s][1])}</button>
        ))}
      </div>
      {rijen.length ? (
        <div className='cvn-raster' role='list' aria-label={tr(lang, 'Останні файли', 'Recente bestanden')}>
          {rijen.map((b) => {
            const Icoon = SOORT_ICOON[b.soort];
            return (
              <article key={b.id} className='cvn-kaart' data-cvn-kaart={b.id} role='listitem' tabIndex={0}
                aria-label={b.naam} onClick={() => open(b)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); open(b); } }}>
                <span className='cvn-kaart-acties'>
                  <button type='button' className={`cvn-icoonknop cvn-ster${b.favoriet ? ' is-aan' : ''}`} data-cvn-favoriet={b.id} aria-pressed={b.favoriet} disabled={besig}
                    aria-label={b.favoriet ? tr(lang, `Прибрати ${b.naam} з обраного`, `${b.naam} uit favorieten`) : tr(lang, `Додати ${b.naam} до обраного`, `${b.naam} favoriet maken`)}
                    onClick={(e) => { e.stopPropagation(); void ster(b); }}><Star aria-hidden='true' /></button>
                </span>
                <span className='cvn-kaart-icoon' aria-hidden='true'><Icoon /></span>
                <span className='cvn-kaart-naam'>{b.naam}</span>
                <span className='cvn-kaart-meta'><span>{bytesTekst(lang, b.bytes)}</span><span>{datumTekst(lang, b.bijgewerktOp)}</span></span>
              </article>
            );
          })}
        </div>
      ) : (
        <div className='cvn-leeg' data-cvn-leeg='recent'><p>{soort ? tr(lang, 'Серед останніх немає файлів цього типу.', 'Geen recente bestanden van deze soort.') : tr(lang, 'Ще нічого не відкривали й не змінювали.', 'Nog niets geopend of gewijzigd.')}</p></div>
      )}
      <p className='cvn-hint'>{tr(lang, 'Тут — останні з огляду сервера. Повний список із сортуванням за датою — у «Мої файли».', 'Dit zijn de recentste uit het serveroverzicht. De volledige lijst, op datum gesorteerd, staat in «Mijn bestanden».')}</p>
    </div>
  );
}
