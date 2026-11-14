// Hub → «Календар» (hub.tarasevych.com/agenda): een ECHTE agenda — maand, week, dag en porządek denny; afspraken
// maken, wijzigen, verplaatsen en verwijderen; gasten, herhaling, herinneringen, tijdzones en RSVP. Daarnaast de
// «agendawinkel»: welke agenda's u kunt koppelen en wat er dan werkelijk werkt.
//
// Eerlijk over wat er werkt (shared/agenda-catalogus.ts legt het per aanbieder uit, de server bevestigt de stand):
//   Google Calendar  LEZEN ÉN SCHRIJVEN. Wie eerder alleen-lezen koppelde, ziet hier één keer «Розширити доступ»:
//                    dat voegt alleen de scope calendar.events toe (incrementele autorisatie), het is GEEN nieuwe
//                    koppeling. De kaart zegt ook wat Google-schrijven nog niet doet (Meet, bijlagen, free/busy,
//                    losse uitzonderingen in een reeks).
//   ICS              LEZEN. Een echte ophaler: alleen https, grens op grootte, time-out, schema met ondergrens.
//   CalDAV/Fastmail  LEZEN met een app-wachtwoord. Schrijven is NIET gebouwd en de kaart zegt wat ervoor mist.
//   Microsoft/Proton geen directe koppeling — maar hun .ics-link werkt vandaag al als abonnement. Dat staat erbij.
// Niets doet alsof: een kaart zonder koppeling heeft GEEN koppelknop.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useAgendaV3 } from './v3/agenda-vlag';
// Agenda v3 (vlag agenda-v3, standaard UIT): lui geladen, zodat de oude agenda zonder vlag precies dezelfde bundel en weergave houdt.
const AgendaPagina = lazy(() => import('./v3/AgendaPagina'));
import {
  AlertCircle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, Link2,
  Lock, Plus, RefreshCw, ShieldCheck, Store, Trash2,
} from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import GeheimInvoer from '../geheim/GeheimInvoer';
import {
  AGENDA_AANBIEDERS, AGENDA_RICHTING_LABEL, agendaKaartStand, agendaKanVerbinden, agendaTekst,
  type AgendaAanbieder, type AgendaKaartStand,
} from '../../shared/agenda-catalogus';
import {
  WEERGAVEN, WEERGAVE_LABEL, agendaTekst as modelTekst, huidigeTijdzone, isoDag, maandRaster, maandVerschuiven,
  opDag, sorteerItems, uitGoogleGebeurtenis, weekDagen, type AgendaItem, type AgendaVorm, type AgendaWeergave, type Antwoord,
} from '../../shared/agenda-model';
import { ICS_INTERVAL_KEUZES, veiligIcsAdres } from '../../shared/agenda-ics-model';
import { CALDAV_AANBIEDERS } from '../../shared/agenda-caldav-model';
import AgendaVenster, { foutTekst, nieuweVorm, type VensterBedoeling } from './AgendaVenster';
import ICloudVenster from './ICloudVenster';
import * as client from './agenda-client';
import { agendaFoutCode, foutCodeTekst } from './abonnement-fouten';
import { weigeringZinUitFout } from '../../shared/weigering-tekst';
import './agenda.css';
import './agenda-maquette.css';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../../shared/zoek-diepe-link';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const STAND_TEKST: Record<AgendaKaartStand, [string, string]> = {
  verbonden: ['підключено', 'gekoppeld'],
  beschikbaar: ['доступно', 'beschikbaar'],
  binnenkort: ['скоро', 'binnenkort'],
};
const MAAND_LANG = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');
const dagNaam = (lang: Lang, dag: string) => new Intl.DateTimeFormat(MAAND_LANG(lang), { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${dag}T12:00:00Z`));
const uurTekst = (lang: Lang, item: AgendaItem) => {
  if (item.heleDag) return tr(lang, 'цілий день', 'hele dag');
  const d = new Date(item.begin);
  return Number.isNaN(d.getTime()) ? item.begin : new Intl.DateTimeFormat(MAAND_LANG(lang), { hour: '2-digit', minute: '2-digit' }).format(d);
};

function Kaart({ lang, aanbieder, stand, onVerbinden }: { lang: Lang; aanbieder: AgendaAanbieder; stand: AgendaKaartStand; onVerbinden: (a: AgendaAanbieder) => void }) {
  const kan = agendaKanVerbinden(aanbieder);
  return (
    <li className='agenda-kaart' data-agenda-aanbieder={aanbieder.id} data-agenda-stand={stand}>
      <div className='agenda-kaart-kop'>
        {/* Geen merkenlogo's hier: die tabel (src/merk/merk-logos.ts) hoort bij de beheerpagina en mag niet in de
            hub-bundel terechtkomen. Een monogram zegt genoeg, de naam staat ernaast. */}
        <span className='agenda-monogram' aria-hidden='true'>{aanbieder.naam.slice(0, 1)}</span>
        <div>
          <strong>{aanbieder.naam}</strong>
          <small>{agendaTekst(aanbieder.uitleg, lang)}</small>
        </div>
        <span className={`agenda-stand agenda-stand-${stand}`}>
          {stand === 'verbonden' ? <CheckCircle2 aria-hidden='true' /> : stand === 'binnenkort' ? <Clock3 aria-hidden='true' /> : null}
          {tr(lang, STAND_TEKST[stand][0], STAND_TEKST[stand][1])}
        </span>
      </div>
      <p className='agenda-richting'>
        {tr(lang, 'Що працює після підключення: ', 'Wat werkt na het koppelen: ')}
        <strong>{agendaTekst(AGENDA_RICHTING_LABEL[aanbieder.richting], lang)}</strong>
      </p>
      {aanbieder.beperking ? (
        <p className='agenda-beperking' data-agenda-beperking={aanbieder.id}>
          <AlertCircle aria-hidden='true' />{tr(lang, 'Чого ще немає: ', 'Wat er nog niet is: ')}{agendaTekst(aanbieder.beperking, lang)}
        </p>
      ) : null}
      {aanbieder.ontbreekt ? (
        <p className='agenda-ontbreekt' data-agenda-ontbreekt={aanbieder.id}>
          <AlertCircle aria-hidden='true' />{tr(lang, 'Чого бракує на сервері: ', 'Wat er op de server ontbreekt: ')}{agendaTekst(aanbieder.ontbreekt, lang)}
        </p>
      ) : null}
      {aanbieder.viaIcs ? (
        <p className='agenda-via-ics' data-agenda-via-ics={aanbieder.id}>
          <Link2 aria-hidden='true' />{tr(lang, 'Що працює вже сьогодні: ', 'Wat vandaag al werkt: ')}{agendaTekst(aanbieder.viaIcs, lang)}
        </p>
      ) : null}
      <div className='agenda-kaart-voet'>
        {kan ? (
          <button type='button' className='primary' data-agenda-verbinden={aanbieder.id} onClick={() => onVerbinden(aanbieder)}>
            {stand === 'verbonden' ? <RefreshCw aria-hidden='true' /> : <ArrowRight aria-hidden='true' />}
            {stand === 'verbonden' ? tr(lang, 'Керувати підключенням', 'Koppeling beheren') : tr(lang, 'Підключити', 'Koppelen')}
          </button>
        ) : (
          <span className='agenda-geen-knop'>{tr(lang, 'Підключити ще неможливо', 'Koppelen is nog niet mogelijk')}</span>
        )}
        <a href={aanbieder.site} target='_blank' rel='noreferrer'>{tr(lang, 'Про сервіс', 'Over de dienst')}<ExternalLink aria-hidden='true' /></a>
      </div>
    </li>
  );
}

export default function Agenda({ lang, ownerUserId }: { lang: Lang; ownerUserId: string }) {
  const v3 = useAgendaV3();
  if (v3) return <Suspense fallback={<div className='agv-laden' role='status' aria-busy='true' />}><AgendaPagina lang={lang} ownerUserId={ownerUserId} /></Suspense>;
  return <AgendaOud lang={lang} ownerUserId={ownerUserId} />;
}

function AgendaOud({ lang, ownerUserId }: { lang: Lang; ownerUserId: string }) {
  const [data, setData] = useState<client.AgendaOverzicht | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(true);
  const [schrijfBezig, setSchrijfBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [winkel, setWinkel] = useState(false);
  const [weergave, setWeergave] = useState<AgendaWeergave>('maand');
  const [anker, setAnker] = useState(() => isoDag(new Date()));
  const [venster, setVenster] = useState<VensterBedoeling | null>(null);
  // 21.10.2026: «Підключити iCloud» (Apple ID + пароль застосунку). Ook direct te openen met #icloud (link uit de fout van een AI-hulpmiddel).
  const [icloud, setIcloud] = useState(() => typeof location !== 'undefined' && location.hash === '#icloud');
  const [vensterFout, setVensterFout] = useState('');
  const [conflict, setConflict] = useState<AgendaVorm | null>(null);
  const [icsAdres, setIcsAdres] = useState('');
  const [icsNaam, setIcsNaam] = useState('');
  const [icsInterval, setIcsInterval] = useState(60);
  const [icsFout, setIcsFout] = useState('');
  const [dav, setDav] = useState({ adres: '', gebruikersnaam: '', wachtwoord: '', naam: '' });
  const [davFout, setDavFout] = useState('');

  const laad = () => {
    setBezig(true);
    client.laadOverzicht().then((v) => { setData(v); setFout(''); })
      .catch((e: unknown) => setFout(String((e as Error)?.message || 'FOUT')))
      .finally(() => setBezig(false));
  };
  useEffect(() => { laad(); }, [ownerUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ZOEKDIEP-001 (05.11.2026): diepe link uit de zoekpagina (?open_event_id=google:<agenda>:<gebeurtenis>, shared/zoek-diepe-link.ts).
  // Zodra het overzicht er is: de week van de afspraak tonen en haar venster openen. Niet gevonden → eerlijke melding.
  const zoekAfspraak = useRef(typeof location !== 'undefined' ? diepeWaarde(location.search, DIEPE_PARAMS.afspraak) : '');
  useEffect(() => {
    const doel = zoekAfspraak.current; if (!doel || !data) return;
    zoekAfspraak.current = ''; wisDiepeParams(DIEPE_PARAMS.afspraak);
    const item = (data.items || []).find((x) => x.id === doel);
    if (!item) { setMelding(tr(lang, 'Подію з пошуку в календарі не знайдено: можливо, її вже видалено або календар ще синхронізується.', 'De afspraak uit de zoekresultaten staat niet in de agenda: misschien is zij verwijderd of wordt de agenda nog gesynchroniseerd.')); return; }
    const dag = new Date(item.begin); if (!Number.isNaN(dag.getTime())) setAnker(isoDag(dag));
    void openItem(item);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const toegang = data?.toegang;
  // In welke lade kijkt deze mens? Staat de dienst in de technische ruimte uit of is zij bevroren, dan komt het
  // overzicht met status 200 terug mét de uitleg erin (ZACHTE_ROUTES in backend/ruimte-cloud-agenda.ts) — zodat hier
  // een eerlijke reden staat in plaats van een lege maand.
  const ruimte = data?.ruimte;
  const items = data?.items || [];
  const agendas = data?.agendas || [];
  const tijdzone = data?.standaardTijdzone || huidigeTijdzone();
  const magSchrijven = Boolean(toegang?.schrijven);
  const gekoppeld = {
    calendar: toegang ? toegang.lezen : null,
    ics: data ? (data.abonnementen.ics.some((r) => r.actief) || null) : null,
    caldav: data ? (data.abonnementen.caldav.some((r) => r.actief) || null) : null,
  };
  const standen = AGENDA_AANBIEDERS.map((a) => ({ a, stand: agendaKaartStand(a, gekoppeld) }));
  const verbonden = standen.filter((x) => x.stand === 'verbonden');
  const beschikbaar = standen.filter((x) => x.stand === 'beschikbaar');
  const binnenkort = standen.filter((x) => x.stand === 'binnenkort');
  const open = winkel || (!bezig && verbonden.length === 0);

  const verbinden = (a: AgendaAanbieder) => {
    if (a.doel?.dienst === 'hub') { setWinkel(true); document.querySelector('[data-agenda-abonnementen="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a.doel) location.assign(canonicalNavigationUrl(a.doel.dienst, a.doel.tab, lang));
  };

  // ---------------------------------------------------------------- schrijven
  const naSchrijven = async (uitslag: client.SchrijfUitslag, sluiten: boolean) => {
    if (uitslag.ok) {
      setVensterFout(''); setConflict(null);
      if (sluiten) setVenster(null);
      setMelding(tr(lang, 'Готово. Зміну записано в Google.', 'Klaar. De wijziging staat in Google.'));
      laad();
      return;
    }
    setVensterFout(uitslag.fout || 'AGENDA_SCHRIJVEN_MISLUKT');
    setConflict(uitslag.google || null);
    if (uitslag.uitbreiding?.nodig) setMelding(tr(lang, 'Для запису потрібно розширити доступ до календаря.', 'Voor schrijven moet de agenda-toegang worden uitgebreid.'));
  };
  const schrijf = async (actie: () => Promise<client.SchrijfUitslag>, sluiten = true) => {
    setSchrijfBezig(true); setMelding('');
    try { await naSchrijven(await actie(), sluiten); }
    catch (gevangen) { setVensterFout(String((gevangen as Error)?.message || 'AGENDA_SCHRIJVEN_MISLUKT')); }
    finally { setSchrijfBezig(false); }
  };

  const bewaren = (vorm: AgendaVorm, meld: string, negeerVersie: boolean) => schrijf(() => {
    const sleutel = client.nieuweSleutel();
    return vorm.gebeurtenisId ? client.wijzigGebeurtenis(sleutel, vorm, meld, negeerVersie) : client.maakGebeurtenis(sleutel, vorm, meld);
  });
  const verwijderen = (vorm: AgendaVorm, meld: string) => schrijf(() => client.wisGebeurtenis(client.nieuweSleutel(), vorm.agendaId, vorm.gebeurtenisId, vorm.etag, meld));
  const verplaatsen = (vorm: AgendaVorm, naar: string) => schrijf(() => client.verplaatsGebeurtenis(client.nieuweSleutel(), vorm.agendaId, vorm.gebeurtenisId, naar, vorm.etag));
  const antwoorden = (vorm: AgendaVorm, antwoord: Antwoord) => schrijf(() => client.antwoordGebeurtenis(client.nieuweSleutel(), vorm.agendaId, vorm.gebeurtenisId, vorm.etag, antwoord), false);

  const openNieuw = (dag = anker) => { setVensterFout(''); setConflict(null); setVenster({ vorm: nieuweVorm(dag, agendas, tijdzone), nieuw: true }); };
  const openItem = async (item: AgendaItem) => {
    if (item.bron !== 'google') { setMelding(tr(lang, 'Ця подія з зовнішнього календаря: її можна лише читати.', 'Deze afspraak komt uit een externe agenda: die is alleen te lezen.')); return; }
    setVensterFout(''); setConflict(null);
    const id = item.id.split(':').slice(2).join(':');
    try {
      const vers = await client.leesGebeurtenis(item.agendaId, id);
      if (vers.ok && vers.vorm) { setVenster({ vorm: vers.vorm, nieuw: false }); return; }
      setMelding(foutTekst(vers.fout || 'AGENDA_SCHRIJVEN_MISLUKT', lang));
    } catch {
      // De verse versie niet kunnen lezen mag het venster niet blokkeren: dan werken we met wat de spiegel weet.
      setVenster({ vorm: uitGoogleGebeurtenis({ id, etag: item.etag, summary: item.titel, location: item.locatie, description: item.beschrijving, start: item.heleDag ? { date: item.begin } : { dateTime: item.begin, timeZone: tijdzone }, end: item.heleDag ? { date: item.einde } : { dateTime: item.einde, timeZone: tijdzone } }, item.agendaId), nieuw: false });
    }
  };

  const nuSynchroniseren = async () => {
    setBezig(true); setMelding('');
    try { await client.synchroniseer(true); setMelding(tr(lang, 'Синхронізовано.', 'Gesynchroniseerd.')); }
    catch (gevangen) { const code = agendaFoutCode(gevangen, 'SYNC_MISLUKT'); setMelding(code === 'AGENDA_TE_VAAK' ? foutCodeTekst(code, lang) : tr(lang, `Синхронізація не вдалася (${code}).`, `Synchroniseren lukte niet (${code}).`)); }
    finally { laad(); }
  };
  const uitbreiden = async () => {
    setSchrijfBezig(true);
    try {
      const uitslag = await client.startUitbreiding();
      if (uitslag.authUrl) { location.assign(uitslag.authUrl); return; }
      setMelding(uitslag.alGegeven ? tr(lang, 'Доступ уже є.', 'De toegang is er al.') : tr(lang, 'Не вдалося розпочати розширення доступу.', 'Het uitbreiden van de toegang kon niet worden gestart.'));
      laad();
    } catch (gevangen) { setMelding(weigeringZinUitFout(lang, gevangen) ?? tr(lang, `Не вдалося (${(gevangen as Error)?.message}).`, `Het lukte niet (${(gevangen as Error)?.message}).`)); }
    finally { setSchrijfBezig(false); }
  };

  // ---------------------------------------------------------------- abonnementen
  const icsToevoegen = async () => {
    const { adres, fout: adresFout } = veiligIcsAdres(icsAdres);
    if (adresFout) { setIcsFout(adresFout); return; }
    setIcsFout(''); setSchrijfBezig(true);
    try {
      const uitslag = await client.icsToevoegen(adres, icsNaam, icsInterval);
      if (!uitslag.ok) { setIcsFout(uitslag.fout || 'ICS_OPSLAAN_MISLUKT'); return; }
      if (uitslag.haal && uitslag.haal.staat === 'fout') setIcsFout(uitslag.haal.fout);
      else { setIcsAdres(''); setIcsNaam(''); }
      laad();
    } catch (gevangen) { setIcsFout(agendaFoutCode(gevangen, 'ICS_OPSLAAN_MISLUKT')); }
    finally { setSchrijfBezig(false); }
  };
  // SEC-002 (g08): «Оновити» liet een weigering (429 AGENDA_TE_VAAK) of «al bezig» (CALDAV_AL_BEZIG, staat niet in de rij) stil vallen.
  const vernieuw = (soort: 'ics' | 'caldav', id: string) => {
    const zet = soort === 'ics' ? setIcsFout : setDavFout;
    zet('');
    void (soort === 'ics' ? client.icsVernieuwen(id) : client.caldavVernieuwen(id))
      .then((r) => {
        const haal = (r as { haal?: { staat?: string; fout?: string } } | null)?.haal;
        if (haal && haal.staat === 'fout' && haal.fout === 'CALDAV_AL_BEZIG') zet(haal.fout);
        laad();
      })
      .catch((e: unknown) => zet(agendaFoutCode(e, soort === 'ics' ? 'ICS_OPSLAAN_MISLUKT' : 'CALDAV_OPSLAAN_MISLUKT')));
  };
  const davKoppelen = async () => {
    setDavFout(''); setSchrijfBezig(true);
    try {
      const uitslag = await client.caldavKoppelen(dav.adres, dav.gebruikersnaam, dav.wachtwoord, dav.naam);
      if (!uitslag.ok) { setDavFout(uitslag.fout || 'CALDAV_OPSLAAN_MISLUKT'); return; }
      setDav({ adres: '', gebruikersnaam: '', wachtwoord: '', naam: '' });
      laad();
    } catch (gevangen) { setDavFout(agendaFoutCode(gevangen, 'CALDAV_OPSLAAN_MISLUKT')); }
    finally { setSchrijfBezig(false); }
  };

  // ---------------------------------------------------------------- raster
  const [jaar, maand] = anker.split('-').map(Number);
  const raster = useMemo(() => maandRaster(jaar, maand), [jaar, maand]);
  const week = useMemo(() => weekDagen(anker), [anker]);
  const vandaag = isoDag(new Date());
  const itemsOpDag = (dag: string) => sorteerItems(items.filter((item) => opDag(item, dag)));
  const komend = useMemo(() => sorteerItems(items.filter((item) => String(item.einde || item.begin).slice(0, 10) >= vandaag)).slice(0, 60), [items, vandaag]);
  const stap = (richting: number) => {
    if (weergave === 'maand') { const v = maandVerschuiven(jaar, maand, richting); setAnker(`${String(v.jaar).padStart(4, '0')}-${String(v.maand).padStart(2, '0')}-01`); return; }
    const d = new Date(`${anker}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + richting * (weergave === 'week' ? 7 : 1));
    setAnker(isoDag(d));
  };

  const periodeTekst = weergave === 'maand'
    ? new Intl.DateTimeFormat(MAAND_LANG(lang), { month: 'long', year: 'numeric' }).format(new Date(`${jaar}-${String(maand).padStart(2, '0')}-15T12:00:00Z`))
    : weergave === 'week' ? `${dagNaam(lang, week[0])} – ${dagNaam(lang, week[6])}`
      : weergave === 'dag' ? dagNaam(lang, anker)
        : tr(lang, 'Найближчі події', 'Aankomende afspraken');

  const ItemRegel = ({ item }: { item: AgendaItem }) => (
    <li data-agenda-item={item.id} data-agenda-item-bron={item.bron} data-agenda-item-schrijfbaar={String(item.schrijfbaar)}>
      <button type='button' className='agenda-item-knop' onClick={() => void openItem(item)}>
        <time dateTime={item.begin}>{uurTekst(lang, item)}</time>
        <span>{item.titel || tr(lang, 'Без назви', 'Zonder titel')}</span>
        {item.bron === 'google' ? null : <small className='agenda-item-extern'><Lock aria-hidden='true' />{item.agendaNaam || item.bron}</small>}
        {item.locatie ? <small>{item.locatie}</small> : null}
      </button>
    </li>
  );

  return (
    <section className='agenda' data-agenda-verbonden={String(verbonden.length)} data-agenda-schrijven={String(magSchrijven)} aria-labelledby='agenda-kop'>
      <header className='agenda-kop'>
        <h2 id='agenda-kop'><CalendarDays aria-hidden='true' />{tr(lang, 'Календар', 'Agenda')}</h2>
        <p>{tr(lang,
          'Ваші події — читання і запис. Створюйте, змінюйте, переносьте й видаляйте події, запрошуйте людей і відповідайте на запрошення.',
          'Uw afspraken — lezen en schrijven. Maak, wijzig, verplaats en verwijder afspraken, nodig mensen uit en antwoord op uitnodigingen.')}</p>
        <div className='agenda-kop-acties'>
          <button type='button' className='primary' data-agenda-nieuw='1' disabled={!magSchrijven} onClick={() => openNieuw()}>
            <Plus aria-hidden='true' />{tr(lang, 'Нова подія', 'Nieuwe afspraak')}
          </button>
          <button type='button' className='ghost' data-agenda-sync='1' onClick={() => void nuSynchroniseren()} disabled={bezig}>
            <RefreshCw aria-hidden='true' className={bezig ? 'spin' : ''} />{tr(lang, 'Синхронізувати', 'Synchroniseren')}
          </button>
          <button type='button' className='ghost' data-agenda-winkel={open ? 'open' : 'dicht'} onClick={() => setWinkel((v) => !v)}>
            <Store aria-hidden='true' />{open ? tr(lang, 'Приховати магазин', 'Winkel verbergen') : tr(lang, 'Магазин календарів', 'Agendawinkel')}
          </button>
        </div>
      </header>

      {fout ? (
        <p className='agenda-fout' role='alert'>
          {/^OWNER_AGENDA_SESSIE_VEREIST$/.test(fout) || /401|403/.test(fout)
            ? tr(lang, 'Календар доступний лише після входу у ваш акаунт.', 'De agenda is alleen beschikbaar na aanmelden in uw account.')
            : tr(lang, `Не вдалося завантажити календар (${fout}).`, `De agenda laden is mislukt (${fout}).`)}
        </p>
      ) : null}
      {melding ? <p className='agenda-melding' role='status' data-agenda-melding='1'>{melding}</p> : null}

      {/* ---- GESCHEIDEN GEGEVENSRUIMTES: in welke lade kijkt u, en waarom is het hier eventueel leeg? ---- */}
      {ruimte && ruimte.ok === false ? (
        <p className='agenda-fout' role='alert' data-agenda-ruimte='gesloten' data-agenda-ruimte-code={ruimte.code}>
          {tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}
        </p>
      ) : null}
      {ruimte && ruimte.ok === true && ruimte.ruimte === 'technisch' ? (
        <p className='agenda-melding' role='status' data-agenda-ruimte='technisch'>
          {tr(lang, 'Технічний простір: ', 'Technische ruimte: ')}{tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}
        </p>
      ) : null}
      {ruimte && ruimte.ok === true && ruimte.gedeeld ? (
        <p className='agenda-melding' role='status' data-agenda-ruimte='gedeeld'>
          {tr(lang, ruimte.uitleg.uk, ruimte.uitleg.nl)}
        </p>
      ) : null}

      {/* ---- recht: niet gekoppeld, of alleen-lezen met de uitbreidingsstap ---- */}
      {toegang && !toegang.lezen ? (
        <p className='agenda-leeg' data-agenda-niet-gekoppeld='1'>
          {tr(lang, 'Жоден календар ще не підключено. Виберіть постачальника в магазині нижче.', 'Er is nog geen agenda gekoppeld. Kies hieronder een aanbieder in de winkel.')}
        </p>
      ) : null}
      {toegang?.uitbreidingNodig ? (
        <section className='agenda-uitbreiding' data-agenda-uitbreiding='1' aria-label={tr(lang, 'Розширити доступ', 'Toegang uitbreiden')}>
          <h3><ShieldCheck aria-hidden='true' />{tr(lang, 'Розширити доступ до календаря', 'De agenda-toegang uitbreiden')}</h3>
          <p>{tr(lang,
            'Ваше підключення Google дає лише читання. Щоб створювати й змінювати події, потрібна одна додаткова область доступу. Це НЕ нове підключення: Google залишить усі наявні дозволи й додасть лише цю.',
            'Uw Google-koppeling geeft alleen lezen. Om afspraken te maken en te wijzigen is één extra toegangsgebied nodig. Dit is GEEN nieuwe koppeling: Google houdt al uw bestaande toestemmingen en voegt alleen deze toe.')}</p>
          <ul className='agenda-uitbreiding-lijst'>
            {toegang.toevoegen.map((scope) => (
              <li key={scope} data-agenda-uitbreiding-scope={scope}>
                <code>{scope}</code>
                <small>{tr(lang,
                  'Створювати, змінювати, переносити й видаляти події, керувати учасниками та відповідати на запрошення. Доступ до списку календарів уже є.',
                  'Afspraken maken, wijzigen, verplaatsen en verwijderen, gasten beheren en op uitnodigingen antwoorden. De lijst met agenda’s hebben we al.')}</small>
              </li>
            ))}
          </ul>
          <button type='button' className='primary' data-agenda-uitbreiden='1' disabled={schrijfBezig} onClick={() => void uitbreiden()}>
            <ShieldCheck aria-hidden='true' />{tr(lang, 'Розширити доступ', 'Toegang uitbreiden')}
          </button>
        </section>
      ) : null}

      {/* ---- de agenda zelf ---- */}
      {toegang?.lezen || items.length ? (
        <section className='agenda-raster-blok' aria-label={tr(lang, 'Календар', 'Agenda')}>
          <div className='agenda-balk'>
            <div className='agenda-weergaven' role='group' aria-label={tr(lang, 'Вигляд', 'Weergave')}>
              {WEERGAVEN.map((w) => (
                <button key={w} type='button' data-agenda-weergave={w} aria-pressed={weergave === w}
                  className={weergave === w ? 'primary' : 'ghost'} onClick={() => setWeergave(w)}>
                  {modelTekst(WEERGAVE_LABEL[w], lang)}
                </button>
              ))}
            </div>
            <div className='agenda-navigatie'>
              <button type='button' className='ghost' aria-label={tr(lang, 'Назад', 'Vorige')} onClick={() => stap(-1)}><ChevronLeft aria-hidden='true' /></button>
              <strong data-agenda-periode='1'>{periodeTekst}</strong>
              <button type='button' className='ghost' aria-label={tr(lang, 'Далі', 'Volgende')} onClick={() => stap(1)}><ChevronRight aria-hidden='true' /></button>
              <button type='button' className='ghost' data-agenda-vandaag='1' onClick={() => setAnker(vandaag)}>{tr(lang, 'Сьогодні', 'Vandaag')}</button>
            </div>
          </div>

          {weergave === 'maand' ? (
            <div className='agenda-maand' data-agenda-maand={`${jaar}-${String(maand).padStart(2, '0')}`}>
              {weekDagen(raster[0][0]).map((d) => (
                <div key={`kop-${d}`} className='agenda-maand-kop'>{new Intl.DateTimeFormat(MAAND_LANG(lang), { weekday: 'short' }).format(new Date(`${d}T12:00:00Z`))}</div>
              ))}
              {raster.flat().map((dag) => {
                const dagItems = itemsOpDag(dag);
                return (
                  <div key={dag} className='agenda-maand-cel' data-agenda-dag={dag}
                    data-agenda-dag-vandaag={dag === vandaag ? '1' : undefined}
                    data-agenda-dag-buiten={dag.slice(5, 7) === String(maand).padStart(2, '0') ? undefined : '1'}>
                    <button type='button' className='agenda-dag-knop' onClick={() => { setAnker(dag); if (magSchrijven) openNieuw(dag); }}>
                      {Number(dag.slice(8, 10))}
                    </button>
                    <ul>{dagItems.slice(0, 4).map((item) => <ItemRegel key={item.id} item={item} />)}</ul>
                    {dagItems.length > 4 ? <small className='agenda-meer'>+{dagItems.length - 4}</small> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {weergave === 'week' ? (
            <div className='agenda-week' data-agenda-week={week[0]}>
              {week.map((dag) => (
                <div key={dag} className='agenda-week-kolom' data-agenda-dag={dag} data-agenda-dag-vandaag={dag === vandaag ? '1' : undefined}>
                  <h4>{dagNaam(lang, dag)}</h4>
                  <ul>{itemsOpDag(dag).map((item) => <ItemRegel key={item.id} item={item} />)}</ul>
                  {magSchrijven ? <button type='button' className='ghost agenda-week-plus' aria-label={tr(lang, 'Нова подія', 'Nieuwe afspraak')} onClick={() => openNieuw(dag)}><Plus aria-hidden='true' /></button> : null}
                </div>
              ))}
            </div>
          ) : null}

          {weergave === 'dag' ? (
            <div className='agenda-dag' data-agenda-dag={anker}>
              <h4>{dagNaam(lang, anker)}</h4>
              {itemsOpDag(anker).length
                ? <ul className='agenda-lijst'>{itemsOpDag(anker).map((item) => <ItemRegel key={item.id} item={item} />)}</ul>
                : <p className='agenda-leeg'>{tr(lang, 'На цей день подій немає.', 'Op deze dag staat niets.')}</p>}
            </div>
          ) : null}

          {weergave === 'lijst' ? (
            <div className='agenda-porzadek' data-agenda-lijst='1'>
              {komend.length ? (
                <ul className='agenda-lijst'>
                  {komend.map((item) => (
                    <li key={item.id} data-agenda-item={item.id} data-agenda-item-bron={item.bron}>
                      <button type='button' className='agenda-item-knop' onClick={() => void openItem(item)}>
                        <time dateTime={item.begin}>{dagNaam(lang, String(item.begin).slice(0, 10))} · {uurTekst(lang, item)}</time>
                        <span>{item.titel || tr(lang, 'Без назви', 'Zonder titel')}</span>
                        {item.agendaNaam ? <small>{item.agendaNaam}</small> : null}
                        {item.deelnemers.length ? <small>{tr(lang, 'учасників: ', 'gasten: ')}{item.deelnemers.length}</small> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className='agenda-leeg'>{bezig ? tr(lang, 'Завантаження…', 'Laden…') : tr(lang, 'Майбутніх подій немає.', 'Er zijn geen aankomende afspraken.')}</p>}
            </div>
          ) : null}
          {data?.begrensd ? <p className='agenda-begrensd'>{tr(lang, 'Показано обмежену кількість подій.', 'Er wordt een begrensd aantal afspraken getoond.')}</p> : null}
        </section>
      ) : null}

      {/* ---- de winkel ---- */}
      {open ? (
        <section className='agenda-winkel' data-agenda-winkel-paneel='1' aria-label={tr(lang, 'Магазин календарів', 'Agendawinkel')}>
          <p className='agenda-winkel-uitleg'>{tr(lang,
            'Google Calendar працює в обидва боки: читання і запис (створення, зміна, перенесення, видалення, учасники, відповіді на запрошення). ICS і CalDAV — лише читання, і на кожній картці написано, чого саме бракує для запису. Microsoft і Proton напряму не підключаються, але їхнє посилання .ics можна додати як підписку.',
            'Google Calendar werkt in beide richtingen: lezen en schrijven (aanmaken, wijzigen, verplaatsen, verwijderen, gasten, antwoorden op uitnodigingen). ICS en CalDAV zijn alleen lezen, en op elke kaart staat precies wat er voor schrijven ontbreekt. Microsoft en Proton koppelen niet rechtstreeks, maar hun .ics-link kunt u als abonnement toevoegen.')}</p>
          {verbonden.length ? (
            <>
              <h3>{tr(lang, 'Підключено', 'Gekoppeld')}</h3>
              <ul className='agenda-kaarten'>{verbonden.map(({ a, stand }) => <Kaart key={a.id} lang={lang} aanbieder={a} stand={stand} onVerbinden={verbinden} />)}</ul>
            </>
          ) : null}
          {beschikbaar.length ? (
            <>
              <h3>{tr(lang, 'Доступно', 'Beschikbaar')}</h3>
              <ul className='agenda-kaarten'>{beschikbaar.map(({ a, stand }) => <Kaart key={a.id} lang={lang} aanbieder={a} stand={stand} onVerbinden={verbinden} />)}</ul>
            </>
          ) : null}
          {binnenkort.length ? (
            <>
              <h3>{tr(lang, 'Ще не реалізовано', 'Nog niet gebouwd')}</h3>
              <ul className='agenda-kaarten'>{binnenkort.map(({ a, stand }) => <Kaart key={a.id} lang={lang} aanbieder={a} stand={stand} onVerbinden={verbinden} />)}</ul>
            </>
          ) : null}

          {/* ---- ICS en CalDAV: hier gebeurt het koppelen echt ---- */}
          <div className='agenda-abonnementen' data-agenda-abonnementen='1'>
            <section aria-label={tr(lang, 'Підписка .ics', 'ICS-abonnement')}>
              <h3><Link2 aria-hidden='true' />{tr(lang, 'Підписка на .ics', 'Abonnement op een .ics')}</h3>
              <p className='agenda-klein'>{tr(lang,
                'Лише https. Сервер оновлює підписку за розкладом (не частіше ніж кожні 15 хвилин), з обмеженням розміру й тайм-аутом. Запис через посилання неможливий.',
                'Alleen https. De server verlaagt het abonnement volgens een schema (niet vaker dan elke 15 minuten), met een grens op de grootte en een time-out. Schrijven via een link kan niet.')}</p>
              <div className='agenda-ics-vorm'>
                <input type='url' value={icsAdres} placeholder='https://…/basic.ics' data-agenda-ics-adres='1' onChange={(e) => setIcsAdres(e.target.value)} />
                <input type='text' value={icsNaam} placeholder={tr(lang, 'Назва (необов’язково)', 'Naam (optioneel)')} data-agenda-ics-naam='1' onChange={(e) => setIcsNaam(e.target.value)} />
                <select value={icsInterval} data-agenda-ics-interval='1' onChange={(e) => setIcsInterval(Number(e.target.value))}>
                  {ICS_INTERVAL_KEUZES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} ${tr(lang, 'хв', 'min')}` : `${m / 60} ${tr(lang, 'год', 'uur')}`}</option>)}
                </select>
                <button type='button' className='primary' data-agenda-ics-toevoegen='1' disabled={schrijfBezig || !icsAdres.trim()} onClick={() => void icsToevoegen()}>
                  <Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}
                </button>
              </div>
              {icsFout ? <p className='agenda-fout' role='alert' data-agenda-ics-fout={icsFout}>{foutCodeTekst(icsFout, lang)}</p> : null}
              <ul className='agenda-abonnement-lijst'>
                {(data?.abonnementen.ics || []).map((rij) => (
                  <li key={rij.id} data-agenda-ics={rij.id} data-agenda-ics-staat={rij.laatsteStaat}>
                    <div>
                      <strong>{rij.naam || rij.adres}</strong>
                      <small>{rij.adres}</small>
                      <small>{tr(lang, 'подій: ', 'afspraken: ')}{rij.aantal} · {rij.intervalMinuten} {tr(lang, 'хв', 'min')} · {rij.laatsteStaat}</small>
                      {rij.fout ? <small className='agenda-fout-klein'>{foutCodeTekst(rij.fout, lang)}</small> : null}
                    </div>
                    <div className='agenda-abonnement-acties'>
                      <button type='button' className='ghost' onClick={() => vernieuw('ics', rij.id)}><RefreshCw aria-hidden='true' />{tr(lang, 'Оновити', 'Verversen')}</button>
                      <button type='button' className='ghost' onClick={() => void client.icsSchakelen(rij.id, !rij.actief).then(laad)}>{rij.actief ? tr(lang, 'Вимкнути', 'Uitzetten') : tr(lang, 'Увімкнути', 'Aanzetten')}</button>
                      <button type='button' className='ghost agenda-gevaar' data-agenda-ics-verwijderen={rij.id} onClick={() => void client.icsVerwijderen(rij.id).then(laad)}><Trash2 aria-hidden='true' /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label='CalDAV'>
              <h3><Link2 aria-hidden='true' />CalDAV</h3>
              <p className='agenda-klein' data-agenda-icloud-ingang='1'>
                <button type='button' className='primary' data-agenda-icloud-open='1' onClick={() => setIcloud(true)}>{tr(lang, 'Підключити iCloud', 'iCloud koppelen')}</button>
                {' '}{tr(lang, 'Apple ID і пароль застосунку — у окремому вікні з покроковими підказками.', 'Apple ID en app-wachtwoord — in een eigen venster met de stappen erbij.')}
              </p>
              <p className='agenda-klein' data-agenda-caldav-eerlijk='1'>{tr(lang,
                'Читання працює: сервер знаходить ваші календарі (PROPFIND) і читає події (REPORT) за паролем застосунку. ЗАПИС не реалізовано — нижче точно написано, чого бракує.',
                'Lezen werkt: de server vindt uw agenda’s (PROPFIND) en leest de afspraken (REPORT) met een app-wachtwoord. SCHRIJVEN is niet gebouwd — hieronder staat precies wat ervoor ontbreekt.')}</p>
              <ul className='agenda-ontbreekt-lijst'>
                {(data?.caldavSchrijvenOntbreekt || []).map((regel, i) => <li key={`dav-mis-${i}`} data-agenda-caldav-ontbreekt={String(i)}>{lang === 'uk' ? regel[0] : regel[1]}</li>)}
              </ul>
              <div className='agenda-dav-vorm'>
                <select value={dav.adres} data-agenda-caldav-aanbieder='1' onChange={(e) => setDav({ ...dav, adres: e.target.value })}>
                  <option value=''>{tr(lang, 'Виберіть сервіс або введіть адресу', 'Kies een dienst of vul een adres in')}</option>
                  {CALDAV_AANBIEDERS.filter((a) => a.basis).map((a) => <option key={a.id} value={a.basis}>{a.naam}</option>)}
                </select>
                <input type='url' value={dav.adres} placeholder='https://caldav.example.org/dav/' data-agenda-caldav-adres='1' onChange={(e) => setDav({ ...dav, adres: e.target.value })} />
                <input type='text' value={dav.gebruikersnaam} placeholder={tr(lang, 'Користувач (адреса пошти)', 'Gebruiker (e-mailadres)')} data-agenda-caldav-gebruiker='1' onChange={(e) => setDav({ ...dav, gebruikersnaam: e.target.value })} />
                <GeheimInvoer lang={lang} value={dav.wachtwoord} onChange={(wachtwoord) => setDav({ ...dav, wachtwoord })} placeholder={tr(lang, 'Пароль застосунку', 'App-wachtwoord')} autoComplete='off' max={1024} soort='caldav' data={{ 'agenda-caldav-wachtwoord': '1' }} />
                <button type='button' className='primary' data-agenda-caldav-koppelen='1' disabled={schrijfBezig || !dav.adres.trim() || !dav.gebruikersnaam.trim() || !dav.wachtwoord} onClick={() => void davKoppelen()}>
                  {tr(lang, 'Підключити', 'Koppelen')}
                </button>
              </div>
              <p className='agenda-klein'>{CALDAV_AANBIEDERS.map((a) => (lang === 'uk' ? a.hint[0] : a.hint[1])).join(' ')}</p>
              {davFout ? <p className='agenda-fout' role='alert' data-agenda-caldav-fout={davFout}>{foutCodeTekst(davFout, lang)}</p> : null}
              <ul className='agenda-abonnement-lijst'>
                {(data?.abonnementen.caldav || []).map((rij) => (
                  <li key={rij.id} data-agenda-caldav={rij.id} data-agenda-caldav-staat={rij.laatsteStaat}>
                    <div>
                      <strong>{rij.naam || rij.adres}</strong>
                      <small>{rij.gebruikersnaam} · {rij.adres}</small>
                      <small>{tr(lang, 'календарів: ', 'agenda’s: ')}{rij.agendas.length} · {tr(lang, 'подій: ', 'afspraken: ')}{rij.aantal} · {rij.laatsteStaat}</small>
                      <small data-agenda-caldav-schrijven={String(rij.schrijven)}>{tr(lang, 'запис: не реалізовано', 'schrijven: niet gebouwd')}</small>
                      {rij.fout ? <small className='agenda-fout-klein'>{foutCodeTekst(rij.fout, lang)}</small> : null}
                    </div>
                    <div className='agenda-abonnement-acties'>
                      <button type='button' className='ghost' onClick={() => vernieuw('caldav', rij.id)}><RefreshCw aria-hidden='true' />{tr(lang, 'Оновити', 'Verversen')}</button>
                      <button type='button' className='ghost agenda-gevaar' data-agenda-caldav-verwijderen={rij.id} onClick={() => void client.caldavVerwijderen(rij.id).then(laad)}><Trash2 aria-hidden='true' /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      ) : null}

      {venster ? (
        <AgendaVenster lang={lang} bedoeling={venster} agendas={agendas} standaardTijdzone={tijdzone}
          magSchrijven={magSchrijven} bezig={schrijfBezig} fout={vensterFout} conflict={conflict}
          onSluiten={() => { setVenster(null); setVensterFout(''); setConflict(null); }}
          onBewaren={bewaren} onVerwijderen={verwijderen} onVerplaatsen={verplaatsen} onAntwoord={antwoorden} />
      ) : null}
      {icloud ? <ICloudVenster lang={lang} onSluit={() => setIcloud(false)} onKlaar={laad} foutTekst={foutCodeTekst} /> : null}
    </section>
  );
}
