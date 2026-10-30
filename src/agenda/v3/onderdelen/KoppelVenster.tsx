// «Підключити календар» — één venster op de agenda zelf (geen sprong naar een ander subdomein): alle aanbieders en toestellen
// als kaarten, met de EERLIJKE stand uit shared/agenda-catalogus.ts en de LEVENDE stand van de server. Een klik op een kaart
// opent meteen de echte weg: Google in een apart venstertje (gebruikGoogleKoppeling, de pagina ververst zichzelf), iCloud met
// een app-wachtwoord (ICloudVenster), CalDAV en ICS met hun formulier (KoppelVormen). Een kaart «binnenkort» legt uit wat er
// op de server ontbreekt en doet nooit alsof. De brug tussen toestellen loopt via het account dat het toestel zelf
// synchroniseert (Samsung/HONOR → Google, iPhone → iCloud) — dat staat op de kaart, met de beperking erbij.
import { useState } from 'react';
import { ArrowRight, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { canonicalNavigationUrl } from '../../../canoniek-navigatie';
import { AGENDA_AANBIEDERS, AGENDA_RICHTING_LABEL, agendaKaartStand, agendaTekst, type AgendaAanbieder } from '../../../../shared/agenda-catalogus';
import * as client from '../../agenda-client';
import { foutCodeTekst } from '../../abonnement-fouten';
import ICloudVenster from '../../ICloudVenster';
import type { GoogleKoppelStand } from '../haken/gebruikGoogleKoppeling';
import { tr, type Lang } from '../tekst';
import Laag from './Laag';
import { DavVorm, IcsVorm } from './KoppelVormen';

type Google = { stand: GoogleKoppelStand; foutCode: string; start: (doel?: 'lezen' | 'schrijven') => void };
type Props = { lang: Lang; smal: boolean; data: client.AgendaOverzicht | null; google: Google; onVerversen: () => void; onSluit: () => void };

// Monogrammen, geen merklogo's: de hub tekent geen logotypes, en de grote merkentabel hoort niet in deze bundel.
const MONOGRAM: Record<string, string> = { 'google-calendar': 'G', 'apple-icloud': 'iC', 'samsung-calendar': 'S', 'honor-calendar': 'Ho', 'huawei-calendar': 'Hu', caldav: 'C', fastmail: 'F', 'ics-abonnement': '.ics', 'proton-calendar': 'P', 'microsoft-outlook': 'O' };
const VOLGORDE = ['google-calendar', 'apple-icloud', 'samsung-calendar', 'honor-calendar', 'microsoft-outlook', 'ics-abonnement', 'caldav', 'fastmail', 'huawei-calendar', 'proton-calendar'];

export default function KoppelVenster({ lang, smal, data, google, onVerversen, onSluit }: Props) {
  const [gekozen, setGekozen] = useState('google-calendar');
  const [icloud, setIcloud] = useState(false);
  const t = data?.toegang;
  const gekoppeld = { calendar: t ? t.lezen : null, ics: data ? (data.abonnementen.ics.some((r) => r.actief) || null) : null, caldav: data ? (data.abonnementen.caldav.some((r) => r.actief) || null) : null };
  const kaarten = [...AGENDA_AANBIEDERS].sort((a, b) => VOLGORDE.indexOf(a.id) - VOLGORDE.indexOf(b.id));
  const kaart = kaarten.find((a) => a.id === gekozen) ?? kaarten[0];
  const stand = (a: AgendaAanbieder) => agendaKaartStand(a, gekoppeld);
  const googleUrl = canonicalNavigationUrl('cloud', 'google', lang);

  const googleActie = (a: AgendaAanbieder) => (
    <div className='agv-kv-actie' data-agenda-kv-google={google.stand}>
      {stand(a) === 'verbonden'
        ? <p className='agv-kv-klaar'><Check aria-hidden='true' />{tr(lang, a.id === 'google-calendar' ? 'Google підключено — події синхронізуються.' : 'Google підключено — міст для цього пристрою працює через нього.', a.id === 'google-calendar' ? 'Google is gekoppeld — de afspraken synchroniseren.' : 'Google is gekoppeld — de brug voor dit toestel loopt erlangs.')}</p>
        : google.stand === 'wacht'
          ? <p className='agv-kv-wacht' role='status'><RefreshCw aria-hidden='true' className='agv-draai' />{tr(lang, 'Чекаю на підтвердження Google у сусідньому вікні… Щойно ви дозволите, сторінка оновиться сама.', 'Wachten op de bevestiging van Google in het andere venster… Zodra u toestaat, ververst de pagina zichzelf.')}</p>
          : google.stand === 'reeks'
            ? <div className='agv-kv-reeks' data-agenda-kv-reeks='1'>
              <p>{tr(lang, 'Google на цьому сайті підключається по черзі: спершу пошта й диск, потім календар. Відкрийте сторінку Google-підключення — майстер проведе по кроках; ця сторінка оновиться сама, щойно календар буде дозволено.', 'Google koppelt op deze site in een vaste volgorde: eerst post en schijf, dan de agenda. Open de Google-koppelpagina — de wizard leidt u erdoorheen; deze pagina ververst zichzelf zodra de agenda is toegestaan.')}</p>
              <a className='agv-knop is-hoofd' href={googleUrl} target='_blank' rel='noreferrer' data-agenda-kv-reeks-link='1'>{tr(lang, 'Відкрити підключення Google', 'Google-koppeling openen')}<ExternalLink aria-hidden='true' /></a>
            </div>
            : <>
              <button type='button' className='agv-knop is-hoofd' onClick={() => google.start('lezen')} data-agenda-kv-google-start='1'>{tr(lang, a.id === 'google-calendar' ? 'Підключити Google' : 'Підключити Google цього телефона', a.id === 'google-calendar' ? 'Google koppelen' : 'De Google van deze telefoon koppelen')}<ArrowRight aria-hidden='true' /></button>
              {google.stand === 'fout' && google.foutCode ? <p className='agv-balk is-fout' role='alert'><span>{foutCodeTekst(google.foutCode, lang)}</span></p> : null}
            </>}
      {a.id !== 'google-calendar' ? <p className='agv-klein'>{tr(lang, 'Важливо: той самий Google-акаунт, з яким синхронізується календар телефона.', 'Belangrijk: hetzelfde Google-account waarmee de agenda van de telefoon synchroniseert.')}</p> : null}
    </div>
  );

  return (
    <Laag lang={lang} soort={smal ? 'blad' : 'venster'} titel={tr(lang, 'Підключити календар', 'Agenda koppelen')} onSluit={onSluit} data={{ 'agenda-koppelvenster': gekozen }} breed>
      <p className='agv-klein agv-kv-intro'>{tr(lang,
        'Хаб — міст між календарями. Кожен пристрій синхронізує свій календар з обліковим записом (Google, iCloud…) — підключіть той самий запис тут, і події тектимуть в обидва боки настільки, наскільки це чесно працює: напрям написано на кожній картці.',
        'De hub is een brug tussen agenda’s. Elk toestel synchroniseert zijn agenda met een account (Google, iCloud…) — koppel datzelfde account hier, en afspraken stromen beide kanten op voor zover dat eerlijk werkt: de richting staat op elke kaart.')}</p>
      <div className='agv-kv-rooster' role='listbox' aria-label={tr(lang, 'Сервіси та пристрої', 'Diensten en toestellen')}>
        {kaarten.map((a) => { const st = stand(a); return (
          <button key={a.id} type='button' role='option' aria-selected={gekozen === a.id} className={`agv-kv-kaart${gekozen === a.id ? ' is-gekozen' : ''} is-${st}`} onClick={() => setGekozen(a.id)} data-agenda-kv-kaart={a.id} data-agenda-kv-stand={st}>
            <span className='agv-kv-monogram' aria-hidden='true'>{MONOGRAM[a.id] ?? a.naam[0]}</span>
            <strong>{a.naam}</strong>
            <small className={`agv-pil is-${st === 'verbonden' ? 'aan' : st}`}>{st === 'verbonden' ? tr(lang, 'підключено', 'gekoppeld') : st === 'binnenkort' ? tr(lang, 'ще ні — чому?', 'nog niet — waarom?') : agendaTekst(AGENDA_RICHTING_LABEL[a.richting], lang)}</small>
          </button>
        ); })}
      </div>
      <section className='agv-kv-detail' data-agenda-kv-detail={kaart.id} aria-live='polite'>
        <h3>{kaart.naam}</h3>
        <p>{agendaTekst(kaart.uitleg, lang)}</p>
        {kaart.stand === 'binnenkort' && kaart.ontbreekt ? <p className='agv-balk is-info' data-agenda-kv-ontbreekt='1'><span>{agendaTekst(kaart.ontbreekt, lang)}</span></p> : null}
        {kaart.id === 'google-calendar' || (kaart.methode === 'bridge' && kaart.stand === 'beschikbaar') ? googleActie(kaart) : null}
        {kaart.id === 'apple-icloud' ? (
          stand(kaart) === 'verbonden'
            ? <p className='agv-kv-klaar'><Check aria-hidden='true' />{tr(lang, 'iCloud підключено — календарі телефона читаються.', 'iCloud is gekoppeld — de agenda’s van de telefoon worden gelezen.')}</p>
            : <button type='button' className='agv-knop is-hoofd' onClick={() => setIcloud(true)} data-agenda-icloud-open='1'>{tr(lang, 'Підключити iCloud', 'iCloud koppelen')}<ArrowRight aria-hidden='true' /></button>
        ) : null}
        {kaart.id === 'caldav' || kaart.id === 'fastmail' ? <DavVorm lang={lang} onKlaar={onVerversen} /> : null}
        {kaart.id === 'ics-abonnement' || (kaart.viaIcs && kaart.id !== 'fastmail') ? (
          <>
            {kaart.viaIcs ? <p className='agv-klein' data-agenda-kv-via-ics='1'>{agendaTekst(kaart.viaIcs, lang)}</p> : null}
            <IcsVorm lang={lang} onKlaar={onVerversen} />
          </>
        ) : null}
        {kaart.beperking ? <details className='agv-uitleg'><summary>{tr(lang, 'Що (ще) не працює — чесно', 'Wat (nog) niet werkt — eerlijk')}</summary><p data-agenda-kv-beperking='1'>{agendaTekst(kaart.beperking, lang)}</p></details> : null}
        <p className='agv-klein'><a href={kaart.site} target='_blank' rel='noreferrer'>{tr(lang, 'Про сервіс', 'Over de dienst')} <ExternalLink aria-hidden='true' /></a></p>
      </section>
      {icloud ? <ICloudVenster lang={lang} onSluit={() => setIcloud(false)} onKlaar={() => { setIcloud(false); onVerversen(); }} foutTekst={foutCodeTekst} /> : null}
    </Laag>
  );
}
