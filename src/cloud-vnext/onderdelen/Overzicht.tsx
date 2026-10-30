// Огляд (Overzicht) van cloud vNext: ECHTE cijfers uit /vnext/overzicht — aantal, omvang, prullenbak, favorieten —
// met een eerlijke noot dat de server geen schijfgrens meldt (dus geen verzonnen «x % van y GB»). Verdeling per soort
// als balkjes op het accentkleur-token met aflopende dekking (geen merk- of hexkleuren), snelkoppelingen naar de
// andere onderdelen en de lijstjes «Останні»/«Обрані» die een bestand meteen in «Мої файли» openen (sessionStorage
// 'cvn-open'). Zolang de serverkant in aanbouw is, staat hier de eerlijke bouwmelding.
import { Clock3, FolderOpen, FolderPlus, Search, Star, Trash2, Upload } from 'lucide-react';
import { CLOUD_SOORT_LABEL, type CloudSoort } from '../../../shared/cloud-vnext-model';
import type { CloudBestand } from '../../../shared/cloud-vnext-model';
import type { OnderdeelProps } from '../CloudPagina';
import { SOORT_ICOON, sessieZet } from '../hulp';
import { bytesTekst, geledenTekst, tr } from '../tekst';

export default function Overzicht({ lang, ov, naarTab }: OnderdeelProps) {
  const openBestand = (b: CloudBestand) => { sessieZet('cvn-open', JSON.stringify(b)); naarTab('files'); };
  const openKosh = () => { sessieZet('cvn-prullenbak', '1'); naarTab('files'); };
  const nieuweMap = () => { sessieZet('cvn-nieuwe-map', '1'); naarTab('files'); };

  if (!ov) {
    return (
      <section className='cvn-blok' aria-label={tr(lang, 'Огляд', 'Overzicht')}>
        <p className='cvn-melding is-info' role='status' data-cvn-bouw=''>{tr(lang, 'Серверна частина цього розділу ще збирається — щойно вона буде готова, тут з’являться ваші реальні цифри.', 'De serverkant van dit onderdeel is nog in aanbouw — zodra die klaar is, staan hier uw echte cijfers.')}</p>
        <div className='cvn-snel' data-cvn-snel=''>
          <button type='button' className='cvn-knop' onClick={() => naarTab('files')}><FolderOpen aria-hidden='true' />{tr(lang, 'Мої файли', 'Mijn bestanden')}</button>
          <button type='button' className='cvn-knop' onClick={() => naarTab('capture')}><Upload aria-hidden='true' />{tr(lang, 'Швидко зберегти', 'Snel opslaan')}</button>
          <button type='button' className='cvn-knop' onClick={() => naarTab('search')}><Search aria-hidden='true' />{tr(lang, 'Пошук', 'Zoeken')}</button>
        </div>
      </section>
    );
  }

  const soorten = (Object.keys(ov.stats.perSoort) as CloudSoort[])
    .map((s) => ({ s, ...(ov.stats.perSoort[s] || { aantal: 0, bytes: 0 }) }))
    .filter((x) => x.aantal > 0)
    .sort((a, b) => b.bytes - a.bytes);
  const totaalBytes = Math.max(1, ov.stats.bytes);

  return (
    <div className='cvn-overzicht' data-cvn-overzicht=''>
      {ov.stats.aantal === 0 ? (
        <section className='cvn-leeg' data-cvn-leeg='overzicht'>
          <FolderOpen aria-hidden='true' />
          <p>{tr(lang, 'Тут ще порожньо — і це нормальний початок. Завантажте перший файл або збережіть нотатку чи посилання.', 'Hier is het nog leeg — een prima begin. Upload een eerste bestand of bewaar een notitie of link.')}</p>
          <div className='cvn-snel'>
            <button type='button' className='cvn-knop is-hoofd' onClick={() => naarTab('files')}><Upload aria-hidden='true' />{tr(lang, 'Завантажити файл', 'Bestand uploaden')}</button>
            <button type='button' className='cvn-knop' onClick={() => naarTab('capture')}>{tr(lang, 'Швидко зберегти', 'Snel opslaan')}</button>
          </div>
        </section>
      ) : (
        <>
          <section className='cvn-blok' aria-label={tr(lang, 'Сховище', 'Opslag')}>
            <h3>{tr(lang, 'Сховище', 'Opslag')}</h3>
            <div className='cvn-tegels' data-cvn-tegels=''>
              <button type='button' className='cvn-tegel' onClick={() => naarTab('files')} data-cvn-tegel='bestanden'>
                <strong>{ov.stats.aantal}</strong><span>{tr(lang, 'файлів у сховищі', 'bestanden in de opslag')}</span>
              </button>
              <button type='button' className='cvn-tegel' onClick={() => naarTab('files')} data-cvn-tegel='bytes'>
                <strong>{bytesTekst(lang, ov.stats.bytes)}</strong><span>{tr(lang, 'займають на сервері', 'op de server in gebruik')}</span>
              </button>
              <button type='button' className='cvn-tegel' onClick={() => { sessieZet('cvn-favoriet', '1'); naarTab('files'); }} data-cvn-tegel='favorieten'>
                <strong>{ov.favorieten.length}</strong><span>{tr(lang, 'в обраному', 'favorieten')}</span>
              </button>
              <button type='button' className='cvn-tegel' onClick={openKosh} data-cvn-tegel='prullenbak' data-cvn-prullenbak='tegel'>
                <strong>{ov.prullenbak}</strong><span>{tr(lang, 'у кошику (30 днів)', 'in de prullenbak (30 dagen)')}</span>
              </button>
            </div>
            <p className='cvn-hint'>{tr(lang, 'Чесно: сервер не повідомляє ліміт диска, тому показуємо лише факт — скільки зайнято.', 'Eerlijk: de server meldt geen schijfgrens, dus tonen we alleen het feit — wat er in gebruik is.')}</p>
            {soorten.length ? (
              <div className='cvn-soort-balken' data-cvn-soort='balken' role='list' aria-label={tr(lang, 'Розподіл за типами', 'Verdeling per soort')}>
                {soorten.map((x, i) => {
                  const Icoon = SOORT_ICOON[x.s];
                  return (
                    <div key={x.s} className='cvn-balk-rij' role='listitem'>
                      <span className='cvn-balk-naam'><Icoon aria-hidden='true' />{tr(lang, CLOUD_SOORT_LABEL[x.s][0], CLOUD_SOORT_LABEL[x.s][1])}</span>
                      <span className='cvn-balk' aria-hidden='true'><i style={{ width: `${Math.max(2, Math.round((x.bytes / totaalBytes) * 100))}%`, opacity: Math.max(0.35, 1 - i * 0.12) }} /></span>
                      <span className='cvn-balk-cijfer'>{x.aantal} · {bytesTekst(lang, x.bytes)}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className='cvn-blok' aria-label={tr(lang, 'Швидкі дії', 'Snelle acties')}>
            <h3>{tr(lang, 'Швидкі дії', 'Snelle acties')}</h3>
            <div className='cvn-snel' data-cvn-snel=''>
              <button type='button' className='cvn-knop is-hoofd' onClick={() => naarTab('files')}><Upload aria-hidden='true' />{tr(lang, 'Завантажити', 'Uploaden')}</button>
              <button type='button' className='cvn-knop' data-cvn-nieuwe-map='overzicht' onClick={nieuweMap}><FolderPlus aria-hidden='true' />{tr(lang, 'Нова тека', 'Nieuwe map')}</button>
              <button type='button' className='cvn-knop' onClick={() => naarTab('capture')}>{tr(lang, 'Швидко зберегти', 'Snel opslaan')}</button>
              <button type='button' className='cvn-knop' onClick={() => naarTab('search')}><Search aria-hidden='true' />{tr(lang, 'Пошук', 'Zoeken')}</button>
              <button type='button' className='cvn-knop is-stil' onClick={openKosh}><Trash2 aria-hidden='true' />{tr(lang, 'Кошик', 'Prullenbak')}</button>
            </div>
          </section>

          <div className='cvn-overzicht-lijsten'>
            <section className='cvn-blok' aria-label={tr(lang, 'Останні', 'Recent')}>
              <h3><Clock3 aria-hidden='true' />{tr(lang, 'Останні', 'Recent')}
                <button type='button' className='cvn-knop is-klein is-stil' onClick={() => naarTab('recent')}>{tr(lang, 'Усі', 'Alle')}</button>
              </h3>
              {ov.recent.length ? (
                <ul className='cvn-mini-lijst' data-cvn-recent=''>
                  {ov.recent.slice(0, 8).map((b) => {
                    const Icoon = SOORT_ICOON[b.soort];
                    return (
                      <li key={b.id}>
                        <button type='button' onClick={() => openBestand(b)} aria-label={tr(lang, `Відкрити ${b.naam}`, `${b.naam} openen`)}>
                          <Icoon aria-hidden='true' /><span className='cvn-mini-naam'>{b.naam}</span>
                          <span className='cvn-mini-meta'>{geledenTekst(lang, b.bijgewerktOp)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className='cvn-hint'>{tr(lang, 'Ще нічого не відкривали й не змінювали.', 'Nog niets geopend of gewijzigd.')}</p>}
            </section>

            <section className='cvn-blok' aria-label={tr(lang, 'Обрані', 'Favorieten')}>
              <h3><Star aria-hidden='true' />{tr(lang, 'Обрані', 'Favorieten')}</h3>
              {ov.favorieten.length ? (
                <ul className='cvn-mini-lijst' data-cvn-favoriet='overzicht'>
                  {ov.favorieten.slice(0, 8).map((b) => {
                    const Icoon = SOORT_ICOON[b.soort];
                    return (
                      <li key={b.id}>
                        <button type='button' onClick={() => openBestand(b)} aria-label={tr(lang, `Відкрити ${b.naam}`, `${b.naam} openen`)}>
                          <Icoon aria-hidden='true' /><span className='cvn-mini-naam'>{b.naam}</span>
                          <span className='cvn-mini-meta'>{bytesTekst(lang, b.bytes)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className='cvn-hint'>{tr(lang, 'Позначайте важливе зірочкою — воно з’явиться тут.', 'Markeer het belangrijke met een ster — het verschijnt hier.')}</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
