// Блок двосторонніх зв'язків нотатки: прив'язка до події Календаря (з підтвердженням), створення завдань простору
// та прикріплення власних файлів зі Сховища без дублювання байтів.
// Koppelingenblok van een notitie: agenda-afspraken (met bevestiging), ruimtetaken en Opslag-bestanden.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, ExternalLink, FolderOpen, Link2Off, Plus, Search } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import {
  openTakenUitChecklist,
  type Notitie,
  type NotitieAgendaKoppeling,
  type NotitieBestandVerwijzing,
  type NotitieSoort,
  type NotitieTaakVerwijzing,
} from '../../shared/notities-vnext-model';
import {
  NotitiesFout,
  nieuweKoppelSleutel,
  notitiesClient,
  type KiesbareAfspraakUit,
} from './notities-client';
import { foutTekst, tr, type Lang } from './tekst';

type Props = {
  lang: Lang;
  notitie: Notitie | null;
  inhoud: string;
  soort: NotitieSoort;
  onVervers?: () => void;
};

const formaatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const standaardBegin = (): { begin: string; einde: string } => {
  const nu = new Date();
  nu.setMinutes(0, 0, 0);
  nu.setHours(nu.getHours() + 1);
  const eind = new Date(nu.getTime() + 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { begin: fmt(nu), einde: fmt(eind) };
};

export default function NotitieKoppelingenBlok({ lang, notitie, inhoud, soort, onVervers }: Props) {
  const [laden, setLaden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [agendaKoppelingen, setAgendaKoppelingen] = useState<NotitieAgendaKoppeling[]>([]);
  const [taken, setTaken] = useState<NotitieTaakVerwijzing[]>([]);
  const [bestanden, setBestanden] = useState<NotitieBestandVerwijzing[]>([]);
  const [kiesbareAfspraken, setKiesbareAfspraken] = useState<KiesbareAfspraakUit[]>([]);

  const [gekozenEventId, setGekozenEventId] = useState('');
  const [bevestigd, setBevestigd] = useState(false);
  const [toonNieuweAfspraak, setToonNieuweAfspraak] = useState(false);
  const [afspraakTitel, setAfspraakTitel] = useState('');
  const [afspraakBegin, setAfspraakBegin] = useState(() => standaardBegin().begin);
  const [afspraakEinde, setAfspraakEinde] = useState(() => standaardBegin().einde);
  const [afspraakHeleDag, setAfspraakHeleDag] = useState(false);

  const [toonBestandKiezer, setToonBestandKiezer] = useState(false);
  const [bestandZoek, setBestandZoek] = useState('');
  const [cloudBestandResultaten, setCloudBestandResultaten] = useState<NotitieBestandVerwijzing[]>([]);

  const openPunten = useMemo(() => (soort === 'lijst' ? openTakenUitChecklist(inhoud) : []), [soort, inhoud]);

  const laad = useCallback(async () => {
    if (!notitie) return;
    setLaden(true);
    try {
      const r = await notitiesClient.koppelingen(notitie.id);
      setAgendaKoppelingen(r.agendaKoppelingen);
      setTaken(r.taken);
      setBestanden(r.bestanden);
      setKiesbareAfspraken(r.kiesbareAfspraken);
      setFout('');
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setLaden(false);
    }
  }, [notitie, lang]);

  useEffect(() => {
    if (!notitie) return;
    setAfspraakTitel(notitie.titel);
    void laad();
  }, [notitie?.id, laad]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoekCloudBestanden = useCallback(async (vraag: string) => {
    try {
      const r = await notitiesClient.cloudBestandenZoek(vraag);
      setCloudBestandResultaten(r.bestanden);
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    }
  }, [lang]);

  useEffect(() => {
    if (!toonBestandKiezer || !notitie) return;
    const t = window.setTimeout(() => void zoekCloudBestanden(bestandZoek), bestandZoek ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [toonBestandKiezer, bestandZoek, notitie, zoekCloudBestanden]);

  if (!notitie) {
    return (
      <section className='vn-koppelingen-blok' data-vn-koppelingen='nieuw'>
        <p className='vn-hint'>
          {tr(
            lang,
            'Спершу збережіть нотатку, щоб прив’язати подію календаря, створити завдання простору або прикріпити файл зі Сховища.',
            'Sla de notitie eerst op om een agenda-afspraak te koppelen, een ruimtetaak aan te maken of een bestand uit Opslag te koppelen.',
          )}
        </p>
      </section>
    );
  }

  const toonBericht = (tekst: string) => {
    setMelding(tekst);
    window.setTimeout(() => setMelding(''), 4000);
  };

  const koppelBestaandeAfspraak = async () => {
    if (!gekozenEventId || bezig) return;
    if (!bevestigd) {
      setFout(foutTekst(lang, 'BEVESTIGING_VEREIST'));
      return;
    }
    setBezig(true);
    setFout('');
    try {
      const gekozen = kiesbareAfspraken.find((a) => a.id === gekozenEventId);
      await notitiesClient.agendaKoppelen({
        notitieId: notitie.id,
        eventId: gekozenEventId,
        agendaId: gekozen?.agendaId,
        idempotentieSleutel: nieuweKoppelSleutel(),
        bevestigd: true,
      });
      setGekozenEventId('');
      setBevestigd(false);
      toonBericht(tr(lang, 'Подію календаря прив’язано до нотатки.', 'Agenda-afspraak gekoppeld aan de notitie.'));
      await laad();
      onVervers?.();
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setBezig(false);
    }
  };

  const maakNieuweAfspraak = async () => {
    if (bezig) return;
    if (!bevestigd) {
      setFout(foutTekst(lang, 'BEVESTIGING_VEREIST'));
      return;
    }
    setBezig(true);
    setFout('');
    try {
      const tijdzone = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
      })();
      await notitiesClient.agendaAfspraakMaken({
        notitieId: notitie.id,
        idempotentieSleutel: nieuweKoppelSleutel(),
        bevestigd: true,
        vorm: {
          agendaId: 'primary',
          titel: afspraakTitel.trim() || notitie.titel,
          beschrijving: inhoud.slice(0, 2000),
          heleDag: afspraakHeleDag,
          begin: afspraakHeleDag ? afspraakBegin.slice(0, 10) : afspraakBegin.slice(0, 16),
          einde: afspraakHeleDag ? afspraakEinde.slice(0, 10) : afspraakEinde.slice(0, 16),
          tijdzone,
        },
      });
      setToonNieuweAfspraak(false);
      setBevestigd(false);
      toonBericht(tr(lang, 'Зустріч створено в календарі й прив’язано до нотатки.', 'Afspraak aangemaakt in de agenda en gekoppeld aan de notitie.'));
      await laad();
      onVervers?.();
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setBezig(false);
    }
  };

  const ontkoppelAfspraak = async (eventId: string) => {
    if (bezig) return;
    setBezig(true);
    setFout('');
    try {
      await notitiesClient.agendaOntkoppelen(notitie.id, eventId);
      toonBericht(tr(lang, 'Зв’язок із подією скасовано.', 'Koppeling met de afspraak verwijderd.'));
      await laad();
      onVervers?.();
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setBezig(false);
    }
  };

  const maakTaak = async (uitChecklist: boolean) => {
    if (bezig) return;
    setBezig(true);
    setFout('');
    try {
      const uit = await notitiesClient.taakMaken({ notitieId: notitie.id, uitChecklist });
      toonBericht(
        tr(
          lang,
          `Створено завдань простору: ${uit.aangemaakt.length} (зі зворотним посиланням bronNotitie).`,
          `Ruimtetaken aangemaakt: ${uit.aangemaakt.length} (met terugverwijzing bronNotitie).`,
        ),
      );
      await laad();
      onVervers?.();
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setBezig(false);
    }
  };

  const wisselCloudBestand = async (cloudBestandId: string, actie: 'koppel' | 'ontkoppel') => {
    if (bezig) return;
    setBezig(true);
    setFout('');
    try {
      const r = await notitiesClient.bestandKoppelen(notitie.id, cloudBestandId, actie);
      setBestanden(r.bestanden);
      toonBericht(
        actie === 'koppel'
          ? tr(lang, 'Посилання на файл Сховища прикріплено.', 'Verwijzing naar Opslag-bestand gekoppeld.')
          : tr(lang, 'Файл Сховища від’єднано від нотатки.', 'Opslag-bestand losgekoppeld van de notitie.'),
      );
      onVervers?.();
    } catch (e) {
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT'));
    } finally {
      setBezig(false);
    }
  };

  const kalenderBasisUrl = canonicalNavigationUrl('hub', 'calendar', lang);
  const bordBasisUrl = canonicalNavigationUrl('mcp', 'board', lang);
  const opslagBasisUrl = canonicalNavigationUrl('cloud', 'files', lang);

  return (
    <section className='vn-koppelingen-blok' aria-label={tr(lang, 'Зв’язки нотатки', 'Koppelingen van de notitie')} data-vn-koppelingen={notitie.id}>
      {fout ? <p className='vn-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='vn-toost' role='status' aria-live='polite'>{melding}</p> : null}
      {laden ? <p className='vn-hint'>{tr(lang, 'Оновлення зв’язків…', 'Koppelingen bijwerken…')}</p> : null}

      {/* 1. Події календаря */}
      <div className='vn-koppel-sectie' data-vn-koppel-agenda='1'>
        <div className='vn-koppel-kop'>
          <strong><CalendarDays aria-hidden='true' />{tr(lang, 'Події календаря', 'Agenda-afspraken')}</strong>
          <button type='button' className='vn-knop is-klein' onClick={() => setToonNieuweAfspraak((x) => !x)} data-vn-afspraak-nieuw-knop='1'>
            <Plus aria-hidden='true' />{tr(lang, 'Нова зустріч із нотатки', 'Nieuwe afspraak uit notitie')}
          </button>
        </div>

        {agendaKoppelingen.length > 0 ? (
          <ul className='vn-koppel-lijst'>
            {agendaKoppelingen.map((k) => (
              <li key={k.id} className='vn-koppeling-rij' data-vn-gekoppelde-afspraak={k.eventId}>
                <span>
                  <strong>{k.eventTitel || k.eventId}</strong>
                  {k.eventBegin ? <small> · {k.eventBegin.slice(0, 16).replace('T', ' ')}</small> : null}
                </span>
                <span className='vn-knoppen'>
                  <a className='vn-knop is-klein' href={`${kalenderBasisUrl}?open_event_id=${encodeURIComponent(k.eventId)}`}>
                    <ExternalLink aria-hidden='true' />{tr(lang, 'У Календар', 'Naar Agenda')}
                  </a>
                  <button type='button' className='vn-knop is-klein is-stil' disabled={bezig} onClick={() => void ontkoppelAfspraak(k.eventId)}>
                    <Link2Off aria-hidden='true' />{tr(lang, 'Від’єднати', 'Loskoppelen')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <small className='vn-hint'>{tr(lang, 'Прив’язаних подій календаря ще немає.', 'Nog geen gekoppelde agenda-afspraken.')}</small>
        )}

        <div className='vn-koppel-actie'>
          <label className='vn-veld'>
            <span>{tr(lang, 'Прив’язати наявну подію цього простору', 'Bestaande afspraak in deze ruimte koppelen')}</span>
            <select value={gekozenEventId} onChange={(e) => setGekozenEventId(e.target.value)} data-vn-kies-afspraak='1'>
              <option value=''>{tr(lang, '— виберіть подію —', '— kies een afspraak —')}</option>
              {kiesbareAfspraken.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.titel || a.id).slice(0, 80)} ({a.begin.slice(0, 16).replace('T', ' ')})
                </option>
              ))}
            </select>
          </label>

          {toonNieuweAfspraak ? (
            <div className='vn-koppel-subvorm' data-vn-afspraak-vorm='1'>
              <label className='vn-veld'>
                <span>{tr(lang, 'Назва зустрічі', 'Titel van de afspraak')}</span>
                <input value={afspraakTitel} maxLength={300} onChange={(e) => setAfspraakTitel(e.target.value)} />
              </label>
              <label className='vn-schakel'>
                <input type='checkbox' checked={afspraakHeleDag} onChange={(e) => setAfspraakHeleDag(e.target.checked)} />
                {tr(lang, 'Увесь день', 'Hele dag')}
              </label>
              <div className='vn-vorm-rij'>
                <label className='vn-veld'>
                  <span>{tr(lang, 'Початок', 'Begin')}</span>
                  <input
                    type={afspraakHeleDag ? 'date' : 'datetime-local'}
                    value={afspraakHeleDag ? afspraakBegin.slice(0, 10) : afspraakBegin.slice(0, 16)}
                    onChange={(e) => setAfspraakBegin(e.target.value)}
                  />
                </label>
                <label className='vn-veld'>
                  <span>{tr(lang, 'Кінець', 'Einde')}</span>
                  <input
                    type={afspraakHeleDag ? 'date' : 'datetime-local'}
                    value={afspraakHeleDag ? afspraakEinde.slice(0, 10) : afspraakEinde.slice(0, 16)}
                    onChange={(e) => setAfspraakEinde(e.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {(gekozenEventId || toonNieuweAfspraak) ? (
            <div className='vn-koppel-bevestig'>
              <label className='vn-schakel'>
                <input type='checkbox' checked={bevestigd} onChange={(e) => setBevestigd(e.target.checked)} data-vn-agenda-bevestig='1' />
                {tr(lang, 'Підтверджую дію запису до календаря', 'Ik bevestig deze schrijfactie in de agenda')}
              </label>
              <div className='vn-knoppen'>
                {gekozenEventId ? (
                  <button type='button' className='vn-knop is-klein is-hoofd' disabled={bezig || !bevestigd} onClick={() => void koppelBestaandeAfspraak()} data-vn-agenda-koppel-knop='1'>
                    {tr(lang, 'Прив’язати вибрану подію', 'Gekozen afspraak koppelen')}
                  </button>
                ) : null}
                {toonNieuweAfspraak ? (
                  <button type='button' className='vn-knop is-klein is-hoofd' disabled={bezig || !bevestigd} onClick={() => void maakNieuweAfspraak()} data-vn-agenda-maak-knop='1'>
                    {tr(lang, 'Створити й прив’язати зустріч', 'Afspraak maken en koppelen')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 2. Завдання простору */}
      <div className='vn-koppel-sectie' data-vn-koppel-taken='1'>
        <div className='vn-koppel-kop'>
          <strong><CheckSquare aria-hidden='true' />{tr(lang, 'Завдання простору', 'Taken in de ruimte')}</strong>
          <div className='vn-knoppen'>
            <button type='button' className='vn-knop is-klein' disabled={bezig} onClick={() => void maakTaak(false)} data-vn-maak-taak='1'>
              <Plus aria-hidden='true' />{tr(lang, 'Створити завдання з нотатки', 'Taak uit notitie maken')}
            </button>
            {openPunten.length > 0 ? (
              <button type='button' className='vn-knop is-klein' disabled={bezig} onClick={() => void maakTaak(true)} data-vn-maak-taken-lijst='1'>
                <Plus aria-hidden='true' />{tr(lang, `Завдання з пунктів (${openPunten.length})`, `Taken uit punten (${openPunten.length})`)}
              </button>
            ) : null}
          </div>
        </div>

        {taken.length > 0 ? (
          <ul className='vn-koppel-lijst'>
            {taken.map((t) => (
              <li key={t.id} className='vn-koppeling-rij' data-vn-gekoppelde-taak={t.id}>
                <span>
                  <strong>{t.titel}</strong>
                  <small> · {t.status}</small>
                </span>
                <a className='vn-knop is-klein' href={`${bordBasisUrl}?doel=${encodeURIComponent(`bord:${t.id}`)}`}>
                  <ExternalLink aria-hidden='true' />{tr(lang, 'На дошку', 'Naar bord')}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <small className='vn-hint'>{tr(lang, 'Створених завдань для цієї нотатки ще немає.', 'Nog geen aangemaakte taken vanuit deze notitie.')}</small>
        )}
      </div>

      {/* 3. Файли зі Сховища */}
      <div className='vn-koppel-sectie' data-vn-koppel-bestanden='1'>
        <div className='vn-koppel-kop'>
          <strong><FolderOpen aria-hidden='true' />{tr(lang, 'Файли зі Сховища', 'Bestanden uit Opslag')}</strong>
          <button type='button' className='vn-knop is-klein' onClick={() => setToonBestandKiezer((x) => !x)} data-vn-bestand-kiezer-knop='1'>
            <Plus aria-hidden='true' />{tr(lang, 'Прикріпити файл зі Сховища', 'Bestand uit Opslag koppelen')}
          </button>
        </div>

        {bestanden.length > 0 ? (
          <ul className='vn-koppel-lijst'>
            {bestanden.map((b) => (
              <li key={b.id} className='vn-koppeling-rij' data-vn-gekoppeld-bestand={b.id}>
                <span>
                  <strong>{b.naam}</strong>
                  <small> · {formaatBytes(b.bytes)}</small>
                </span>
                <span className='vn-knoppen'>
                  <a className='vn-knop is-klein' href={`${opslagBasisUrl}?open_item_id=${encodeURIComponent(b.id)}`}>
                    <ExternalLink aria-hidden='true' />{tr(lang, 'Відкрити файл', 'Bestand openen')}
                  </a>
                  <button type='button' className='vn-knop is-klein is-stil' disabled={bezig} onClick={() => void wisselCloudBestand(b.id, 'ontkoppel')}>
                    <Link2Off aria-hidden='true' />{tr(lang, 'Від’єднати', 'Loskoppelen')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <small className='vn-hint'>{tr(lang, 'Прикріплених файлів Сховища ще немає (байти не дублюються).', 'Nog geen gekoppelde bestanden uit Opslag (zonder kopie van bytes).')}</small>
        )}

        {toonBestandKiezer ? (
          <div className='vn-koppel-subvorm' data-vn-bestand-kiezer='1'>
            <label className='vn-zoekveld'>
              <Search aria-hidden='true' />
              <input
                type='search'
                value={bestandZoek}
                placeholder={tr(lang, 'Знайти власний файл у Сховищі…', 'Eigen bestand in Opslag zoeken…')}
                aria-label={tr(lang, 'Пошук файла у Сховищі', 'Bestand in Opslag zoeken')}
                onChange={(e) => setBestandZoek(e.target.value)}
              />
            </label>
            {cloudBestandResultaten.length > 0 ? (
              <ul className='vn-koppel-lijst'>
                {cloudBestandResultaten.map((cb) => {
                  const al = bestanden.some((x) => x.id === cb.id);
                  return (
                    <li key={cb.id} className='vn-koppeling-rij'>
                      <span>
                        <strong>{cb.naam}</strong>
                        <small> · {formaatBytes(cb.bytes)}</small>
                      </span>
                      <button
                        type='button'
                        className='vn-knop is-klein'
                        disabled={bezig || al}
                        onClick={() => void wisselCloudBestand(cb.id, 'koppel')}
                      >
                        {al ? tr(lang, 'Уже прикріплено', 'Al gekoppeld') : tr(lang, 'Прикріпити', 'Koppelen')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <small className='vn-hint'>{tr(lang, 'У цьому просторі не знайдено файлів за запитом.', 'Geen bestanden gevonden in deze ruimte.')}</small>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
