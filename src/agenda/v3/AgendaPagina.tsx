// Agenda v3 (vlag `agenda-v3`, standaard UIT) — hub.tarasevych.com/agenda. Hoofdtaak: afspraken zien en plannen.
// Computer: zijbalk (nieuw, minikalender, mijn agenda's) · midden de agenda (maand/week/dag/lijst, echt uurraster) · rechts «Мій день».
// Telefoon: standaard «День» met een balk van 7 dagen, maand met stippen + dagenlijst, onderbalk met een zwevende «+».
// Gegevens en schrijven via de bestaande client en server (agenda-client.ts, shared/agenda-model.ts): RRULE, herinneringen, gasten,
// RSVP, tijdzones, ETag en idempotentie blijven precies zoals ze waren. Koppelingen staan in «Календарі та сервіси».
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, List, Plus, Settings2, Sun } from 'lucide-react';
import { huidigeTijdzone, weekDagen, type AgendaItem, type AgendaVorm } from '../../../shared/agenda-model';
import { foutTekst, nieuweVorm, plaatselijk } from '../AgendaVenster';
import * as client from '../agenda-client';
import { agendaSleutel, dagVanItem, filterItems, itemsOpDag, kleurVoor, vandaagPlaatselijk } from './agenda-tijd';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../../../shared/zoek-diepe-link';
import { gebruikAgendaGegevens } from './haken/gebruikAgendaGegevens';
import { gebruikAgendaWeergave, gebruikSmal } from './haken/gebruikAgendaWeergave';
import { gebruikAgendaWijzigingen } from './haken/gebruikAgendaWijzigingen';
import KalenderKop from './onderdelen/KalenderKop';
import KalenderWerkbalk from './onderdelen/KalenderWerkbalk';
import KalenderZijbalk, { type KalenderRegel } from './onderdelen/KalenderZijbalk';
import MaandRooster from './onderdelen/MaandRooster';
import WeekTijdraster from './onderdelen/WeekTijdraster';
import DagTijdlijn from './onderdelen/DagTijdlijn';
import GebeurtenisLijst, { GebeurtenisKnop } from './onderdelen/GebeurtenisLijst';
import GebeurtenisDetail from './onderdelen/GebeurtenisDetail';
import GebeurtenisBewerker from './onderdelen/GebeurtenisBewerker';
import VerbindingenLade, { type LadeDeel } from './onderdelen/VerbindingenLade';
import KoppelVenster from './onderdelen/KoppelVenster';
import LegeToestand from './onderdelen/LegeToestand';
import { gebruikGoogleKoppeling } from './haken/gebruikGoogleKoppeling';
import Terugkoppeling from './onderdelen/Terugkoppeling';
import { fmt, tr, type Lang } from './tekst';
import './agenda-v3.css';

const VERBORGEN = 'mr-agenda-v3-verborgen';
const leesVerborgen = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(VERBORGEN) || '[]')); } catch { return new Set<string>(); } };

export default function AgendaPagina({ lang, ownerUserId }: { lang: Lang; ownerUserId: string }) {
  const g = gebruikAgendaGegevens(ownerUserId);
  const v = gebruikAgendaWeergave();
  const smal = gebruikSmal();
  const [zoek, setZoek] = useState('');
  const [verborgen, setVerborgen] = useState(leesVerborgen);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [detail, setDetail] = useState<AgendaItem | null>(null);
  const [bewerk, setBewerk] = useState<{ vorm: AgendaVorm; nieuw: boolean } | null>(null);
  const [lade, setLade] = useState<LadeDeel | null>(() => (typeof location !== 'undefined' && location.hash === '#icloud' ? 'caldav' : null));
  const [koppelVenster, setKoppelVenster] = useState(() => typeof location !== 'undefined' && location.hash === '#koppelen');
  // Google koppelt in een apart venstertje; zodra de server «lezen» bevestigt, ververst de agenda zichzelf (geen navigatie weg).
  const google = gebruikGoogleKoppeling({ onKlaar: () => { setMelding({ ok: true, tekst: tr(lang, 'Google підключено — календар синхронізується.', 'Google is gekoppeld — de agenda synchroniseert.') }); void g.verversen(); } });
  // Dit tabblad IS het Google-venstertje (na de toestemming stuurt Google terug naar returnTo = deze pagina): meteen sluiten.
  useEffect(() => { if (typeof window !== 'undefined' && window.opener && window.name === 'agenda-google-koppeling') window.close(); }, []);
  const w = gebruikAgendaWijzigingen(() => { setMelding({ ok: true, tekst: tr(lang, 'Збережено в Google.', 'Bewaard in Google.') }); void g.verversen(); });
  const vandaag = vandaagPlaatselijk();
  const data = g.data;
  const t = data?.toegang;
  const schrijfrecht = Boolean(t?.schrijven);
  const tijdzone = data?.standaardTijdzone || huidigeTijdzone();
  const alle = data?.items || [];
  const items = useMemo(() => filterItems(alle, zoek, verborgen), [alle, zoek, verborgen]);
  useEffect(() => { try { localStorage.setItem(VERBORGEN, JSON.stringify([...verborgen])); } catch { /* geen opslag */ } }, [verborgen]);
  useEffect(() => { if (!melding) return; const i = window.setTimeout(() => setMelding(null), 5000); return () => window.clearTimeout(i); }, [melding]);

  // Een mislukte actie uit het voorbeeld (wissen, antwoorden) zonder open formulier: als melding tonen.
  useEffect(() => { if (w.fout && !bewerk) setMelding({ ok: false, tekst: foutTekst(w.fout, lang) }); }, [w.fout]); // eslint-disable-line react-hooks/exhaustive-deps
  // ZOEKDIEP-001 (05.11.2026): diepe link uit de zoekpagina (?open_event_id=google:<agenda>:<gebeurtenis>, shared/zoek-diepe-link.ts).
  // Zodra het overzicht er is: naar de dag van de afspraak en haar detail openen; niet gevonden → eerlijke melding. Eén keer.
  const zoekAfspraak = useRef(typeof location !== 'undefined' ? diepeWaarde(location.search, DIEPE_PARAMS.afspraak) : '');
  useEffect(() => {
    const doel = zoekAfspraak.current; if (!doel || !data) return;
    zoekAfspraak.current = ''; wisDiepeParams(DIEPE_PARAMS.afspraak);
    const item = alle.find((i) => i.id === doel);
    if (!item) { setMelding({ ok: false, tekst: tr(lang, 'Подію з пошуку в календарі не знайдено: можливо, її вже видалено або календар ще синхронізується.', 'De afspraak uit de zoekresultaten staat niet in de agenda: misschien is zij verwijderd of wordt de agenda nog gesynchroniseerd.') }); return; }
    const dag = dagVanItem(item); if (dag) v.zetDatum(dag);
    setDetail(item);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const kalenders: KalenderRegel[] = useMemo(() => {
    const lijst: KalenderRegel[] = (data?.agendas || []).map((a) => ({ sleutel: `google:${a.id}`, naam: a.naam, kleur: kleurVoor(`google:${a.id}`, a.kleur), alleenLezen: !a.schrijfbaar || !schrijfrecht, bron: 'google' }));
    const gezien = new Set(lijst.map((k) => k.sleutel));
    for (const i of alle) { const s = agendaSleutel(i); if (gezien.has(s)) continue; gezien.add(s); lijst.push({ sleutel: s, naam: i.agendaNaam || i.bron.toUpperCase(), kleur: kleurVoor(s), alleenLezen: !i.schrijfbaar || i.bron !== 'google', bron: i.bron }); }
    return lijst;
  }, [data?.agendas, alle, schrijfrecht]);
  const kleur = (s: string) => kalenders.find((k) => k.sleutel === s)?.kleur || kleurVoor(s);
  const metPunt = (dag: string) => itemsOpDag(items, dag).length > 0;

  const geenKoppeling = Boolean(data) && !t?.lezen && !data?.abonnementen.ics.length && !data?.abonnementen.caldav.length && !alle.length;

  // Toestemming uitbreiden (schrijven) gaat sinds 29.10.2026 óók via het venstertje van gebruikGoogleKoppeling: de mens
  // verlaat de agenda niet meer, en de pagina ververst zichzelf zodra Google het schrijven bevestigt.
  const toestaan = () => google.start('schrijven');
  const nieuw = (dag = v.datum, uur?: number) => {
    w.wisFout();
    const vorm = nieuweVorm(dag, data?.agendas || [], tijdzone);
    if (uur !== undefined) { const b = `${dag}T${String(uur).padStart(2, '0')}:00`; const e = new Date(b); e.setHours(e.getHours() + 1); vorm.begin = b; vorm.einde = plaatselijk(e); }
    setDetail(null); setBewerk({ vorm, nieuw: true });
  };
  const wijzig = async (item: AgendaItem) => {
    w.wisFout();
    const id = item.id.split(':').slice(2).join(':');
    try {
      const vers = await client.leesGebeurtenis(item.agendaId, id);
      if (vers.ok && vers.vorm) { setDetail(null); setBewerk({ vorm: vers.vorm, nieuw: false }); return; }
      setMelding({ ok: false, tekst: tr(lang, 'Не вдалося прочитати актуальну версію події.', 'De actuele versie van de afspraak kon niet worden gelezen.') });
    } catch { setMelding({ ok: false, tekst: tr(lang, 'Немає зв’язку з сервером. Спробуйте ще раз.', 'Geen verbinding met de server. Probeer het opnieuw.') }); }
  };
  const vormVan = (item: AgendaItem): AgendaVorm => ({ agendaId: item.agendaId, gebeurtenisId: item.id.split(':').slice(2).join(':'), etag: item.etag } as AgendaVorm);

  // Toetsenbord (buiten invoervelden): T = vandaag, N = nieuw, M/W/D/L = weergave, ←/→ = vorige/volgende.
  useEffect(() => {
    const op = (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || detail || bewerk || lade) return;
      if (doel && (doel.closest('input,textarea,select,[contenteditable="true"]') || doel.closest('[role="dialog"]'))) return;
      const k = e.key.toLowerCase();
      const kaart: Record<string, () => void> = { t: v.naarVandaag, n: () => nieuw(), m: () => v.zetWeergave('maand'), w: () => v.zetWeergave('week'), d: () => v.zetWeergave('dag'), l: () => v.zetWeergave('lijst'), arrowleft: () => v.stap(-1), arrowright: () => v.stap(1) };
      if (k.startsWith('arrow') && doel?.closest('.agv-maand-rooster,.agv-segment,.agv-dagenbalk')) return;
      const f = kaart[k]; if (f) { e.preventDefault(); f(); }
    };
    window.addEventListener('keydown', op); return () => window.removeEventListener('keydown', op);
  });

  const open = (i: AgendaItem) => setDetail(i);
  const lijstItems = useMemo(() => items.filter((i) => String(i.einde || i.begin).slice(0, 10) >= (zoek ? '0000' : vandaag)).slice(0, 200), [items, vandaag, zoek]);
  const vandaagLijst = itemsOpDag(items, vandaag);

  const inhoud = () => {
    if (!data && g.laden) return <div className='agv-laden' aria-busy='true' role='status'>{tr(lang, 'Завантаження календаря…', 'Agenda laden…')}</div>;
    if (data && data.ruimte && data.ruimte.ok === false) return null;
    if (geenKoppeling) return <LegeToestand lang={lang} onKoppel={() => setKoppelVenster(true)} onIcs={() => setLade('ics')} onAlle={() => setLade('alle')} />;
    if (zoek && v.weergave !== 'lijst') return <GebeurtenisLijst lang={lang} items={lijstItems} kleur={kleur} onOpen={open} leeg={tr(lang, 'Нічого не знайдено.', 'Niets gevonden.')} />;
    if (v.weergave === 'maand') return <MaandRooster lang={lang} datum={v.datum} vandaag={vandaag} items={items} smal={smal} kleur={kleur} onKiesDag={v.zetDatum} onOpenDag={(d) => { v.zetDatum(d); v.zetWeergave('dag'); }} onOpen={open} />;
    if (v.weergave === 'week') {
      if (smal) return <GebeurtenisLijst lang={lang} items={items.filter((i) => weekDagen(v.datum).some((d) => itemsOpDag([i], d).length))} kleur={kleur} onOpen={open} leeg={tr(lang, 'Цього тижня подій немає.', 'Deze week staat er niets.')} />;
      return <WeekTijdraster lang={lang} dagen={weekDagen(v.datum)} vandaag={vandaag} items={items} kleur={kleur} onOpen={open} onNieuw={nieuw} onKiesDag={(d) => { v.zetDatum(d); v.zetWeergave('dag'); }} />;
    }
    if (v.weergave === 'dag') {
      if (smal) return <DagTijdlijn lang={lang} datum={v.datum} vandaag={vandaag} items={items} kleur={kleur} onKiesDag={v.zetDatum} onOpen={open} />;
      return <WeekTijdraster lang={lang} dagen={[v.datum]} vandaag={vandaag} items={items} kleur={kleur} onOpen={open} onNieuw={nieuw} onKiesDag={v.zetDatum} />;
    }
    return <GebeurtenisLijst lang={lang} items={lijstItems} kleur={kleur} onOpen={open} leeg={tr(lang, 'Майбутніх подій немає.', 'Er zijn geen aankomende afspraken.')} />;
  };

  return (
    <section className={`agv${smal ? ' is-smal' : ''}`} data-agenda-v3='1' data-agenda-schrijven={String(schrijfrecht)} data-agenda-weergave-actief={v.weergave} aria-labelledby='agv-titel'>
      {!smal && !geenKoppeling ? (
        <KalenderZijbalk lang={lang} datum={v.datum} vandaag={vandaag} kalenders={kalenders} verborgen={verborgen} magNieuw={schrijfrecht} metPunt={metPunt}
          onNieuw={() => nieuw()} onKies={v.zetDatum} onWissel={(s) => setVerborgen((o) => { const n = new Set(o); if (n.has(s)) n.delete(s); else n.add(s); return n; })} onVerbindingen={() => setLade('google')} />
      ) : null}
      <div className='agv-midden'>
        <KalenderKop lang={lang} zoek={zoek} onZoek={setZoek} onVerbindingen={() => setLade('google')} smal={smal} aantalGevonden={zoek ? items.length : null} />
        <Terugkoppeling lang={lang} fout={g.fout} syncFout={g.syncFout} laatstGelukt={g.laatstGelukt} ruimte={data?.ruimte} bezig={g.laden || g.synchroniseren}
          melding={melding} onOpnieuw={() => void (g.syncFout && !g.fout ? g.synchroniseer() : g.verversen())} onMeldingWeg={() => setMelding(null)} begrensd={Boolean(data?.begrensd)} />
        {!geenKoppeling && data && !(data.ruimte && data.ruimte.ok === false) ? (
          <KalenderWerkbalk lang={lang} weergave={v.weergave} datum={v.datum} onWeergave={v.zetWeergave} onStap={v.stap} onVandaag={v.naarVandaag} />
        ) : null}
        <div className='agv-inhoud'>{inhoud()}</div>
      </div>
      {!smal && !geenKoppeling && data ? (
        <aside className='agv-mijndag' aria-label={tr(lang, 'Мій день', 'Mijn dag')}>
          <div className='agv-kaart'>
            <div className='agv-kaart-kop'><h2>{tr(lang, 'Мій день', 'Mijn dag')}</h2><span className='agv-pil is-aan'>{vandaagLijst.length}</span></div>
            <small className='agv-klein'>{fmt(lang, vandaag, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
            {vandaagLijst.length ? <ul className='agv-mijndag-lijst'>{vandaagLijst.map((i) => <li key={i.id}><GebeurtenisKnop lang={lang} item={i} kleur={kleur(agendaSleutel(i))} soort='regel' onOpen={open} /></li>)}</ul>
              : <p className='agv-leeg-regel'>{tr(lang, 'Сьогодні вільно.', 'Vandaag is vrij.')}</p>}
          </div>
        </aside>
      ) : null}
      {smal ? (
        <nav className='agv-onderbalk' aria-label={tr(lang, 'Календар: швидкі дії', 'Agenda: snelle acties')}>
          <button type='button' aria-current={v.weergave !== 'lijst' ? 'page' : undefined} onClick={() => v.zetWeergave(v.weergave === 'lijst' ? 'dag' : v.weergave)}><CalendarDays aria-hidden='true' /><span>{tr(lang, 'Календар', 'Agenda')}</span></button>
          <button type='button' aria-current={v.weergave === 'lijst' ? 'page' : undefined} onClick={() => v.zetWeergave('lijst')}><List aria-hidden='true' /><span>{tr(lang, 'Події', 'Afspraken')}</span></button>
          <button type='button' className='agv-plus' onClick={() => nieuw()} aria-label={tr(lang, 'Нова подія', 'Nieuwe afspraak')} data-agenda-nieuw='1'><Plus aria-hidden='true' /></button>
          <button type='button' onClick={v.naarVandaag}><Sun aria-hidden='true' /><span>{tr(lang, 'Сьогодні', 'Vandaag')}</span></button>
          <button type='button' onClick={() => setLade('google')}><Settings2 aria-hidden='true' /><span>{tr(lang, 'Сервіси', 'Diensten')}</span></button>
        </nav>
      ) : null}

      {detail ? (
        <GebeurtenisDetail lang={lang} item={detail} smal={smal} schrijfrecht={schrijfrecht} bezig={w.bezig} onSluit={() => setDetail(null)}
          onWijzig={() => void wijzig(detail)} onToestaan={() => void toestaan()}
          onVerwijder={() => w.verwijderen(vormVan(detail), 'none')} onAntwoord={(a) => void w.antwoorden(vormVan(detail), a).then((ok) => { if (ok) setDetail(null); })} />
      ) : null}
      {bewerk ? (
        <GebeurtenisBewerker key={`${bewerk.vorm.gebeurtenisId}-${bewerk.vorm.begin}`} lang={lang} begin={bewerk.vorm} nieuw={bewerk.nieuw} agendas={data?.agendas || []} tijdzone={tijdzone}
          schrijfrecht={schrijfrecht} smal={smal} w={w} onSluit={() => setBewerk(null)} onToestaan={() => void toestaan()} />
      ) : null}
      {lade ? (
        <VerbindingenLade lang={lang} data={data} smal={smal} deel={lade} laatstGelukt={g.laatstGelukt} synchroniseren={g.synchroniseren} google={google}
          onSynchroniseer={() => void g.synchroniseer()} onToestaan={toestaan} onVerversen={() => void g.verversen()} onSluit={() => setLade(null)} onKoppelen={() => { setLade(null); setKoppelVenster(true); }} />
      ) : null}
      {koppelVenster ? (
        <KoppelVenster lang={lang} smal={smal} data={data} google={google} onVerversen={() => void g.verversen()} onSluit={() => setKoppelVenster(false)} />
      ) : null}
    </section>
  );
}
