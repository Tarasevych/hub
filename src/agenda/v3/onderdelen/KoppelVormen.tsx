// De twee koppelformulieren (ICS-abonnement en CalDAV met app-wachtwoord) als losse onderdelen: dezelfde formulieren staan in
// de lade «Календарі та сервіси» (VerbindingenLade) én in het koppelvenster (KoppelVenster). Eén bron, dus geen drift tussen
// de twee plekken; de data-attributen blijven die van de lade (de e2e-tests zoeken erop).
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import GeheimInvoer from '../../../geheim/GeheimInvoer';
import { ICS_INTERVAL_KEUZES, veiligIcsAdres } from '../../../../shared/agenda-ics-model';
import { CALDAV_AANBIEDERS } from '../../../../shared/agenda-caldav-model';
import * as client from '../../agenda-client';
import { foutCodeTekst } from '../../abonnement-fouten';
import { tr, type Lang } from '../tekst';

/** ICS-abonnement toevoegen. `onKlaar` wordt na een geslaagde toevoeging aangeroepen (de aanroeper ververst het overzicht). */
export function IcsVorm({ lang, autofocus, vooraf, onKlaar }: { lang: Lang; autofocus?: boolean; vooraf?: string; onKlaar: () => void }) {
  const [ics, setIcs] = useState({ adres: vooraf ?? '', naam: '', interval: 60 });
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const veld = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (autofocus) setTimeout(() => veld.current?.focus(), 50); }, [autofocus]);
  const toevoegen = async () => {
    const { adres, fout: adresFout } = veiligIcsAdres(ics.adres);
    if (adresFout) { setFout(adresFout); return; }
    setFout(''); setBezig(true);
    try {
      const u = await client.icsToevoegen(adres, ics.naam, ics.interval);
      if (!u.ok) setFout(u.fout || 'ICS_OPSLAAN_MISLUKT');
      else if (u.haal?.staat === 'fout') setFout(u.haal.fout);
      else { setIcs({ adres: '', naam: '', interval: 60 }); onKlaar(); }
    } catch (e) { setFout(String((e as Error)?.message || 'ICS_OPSLAAN_MISLUKT')); }
    finally { setBezig(false); }
  };
  return (
    <form className='agv-vorm is-compact' onSubmit={(e) => { e.preventDefault(); void toevoegen(); }}>
      <label className='agv-veld'><span>{tr(lang, 'Адреса .ics', 'Adres van de .ics')}</span><input ref={veld} type='url' inputMode='url' value={ics.adres} onChange={(e) => setIcs({ ...ics, adres: e.target.value })} placeholder='https://…/basic.ics' data-agenda-ics-adres='1' /></label>
      <div className='agv-veldrij'>
        <label className='agv-veld'><span>{tr(lang, 'Назва (необов’язково)', 'Naam (optioneel)')}</span><input value={ics.naam} onChange={(e) => setIcs({ ...ics, naam: e.target.value })} data-agenda-ics-naam='1' /></label>
        <label className='agv-veld'><span>{tr(lang, 'Оновлювати', 'Verversen')}</span><select value={ics.interval} onChange={(e) => setIcs({ ...ics, interval: Number(e.target.value) })} data-agenda-ics-interval='1'>{ICS_INTERVAL_KEUZES.map((m) => <option key={m} value={m}>{m < 60 ? tr(lang, `кожні ${m} хв`, `elke ${m} min`) : tr(lang, `кожні ${m / 60} год`, `elke ${m / 60} uur`)}</option>)}</select></label>
      </div>
      <button type='submit' className='agv-knop' disabled={bezig || !ics.adres.trim()} data-agenda-ics-toevoegen='1'><Plus aria-hidden='true' />{bezig ? tr(lang, 'Додаю…', 'Toevoegen…') : tr(lang, 'Додати ICS', 'ICS toevoegen')}</button>
      {fout ? <p className='agv-balk is-fout' role='alert' data-agenda-ics-fout={fout}><span>{foutCodeTekst(fout, lang)}</span></p> : null}
    </form>
  );
}

/** CalDAV koppelen (Fastmail, Nextcloud, een eigen server) met een app-wachtwoord. Voor iCloud is er het aparte ICloudVenster. */
export function DavVorm({ lang, onKlaar }: { lang: Lang; onKlaar: () => void }) {
  const [dav, setDav] = useState({ adres: '', gebruikersnaam: '', wachtwoord: '', naam: '' });
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const koppelen = async () => {
    setFout(''); setBezig(true);
    try {
      const u = await client.caldavKoppelen(dav.adres, dav.gebruikersnaam, dav.wachtwoord, dav.naam);
      if (!u.ok) setFout(u.fout || 'CALDAV_OPSLAAN_MISLUKT');
      else { setDav({ adres: '', gebruikersnaam: '', wachtwoord: '', naam: '' }); onKlaar(); }
    } catch (e) { setFout(String((e as Error)?.message || 'CALDAV_OPSLAAN_MISLUKT')); }
    finally { setDav((d) => ({ ...d, wachtwoord: '' })); setBezig(false); }
  };
  return (
    <form className='agv-vorm is-compact' onSubmit={(e) => { e.preventDefault(); void koppelen(); }}>
      <label className='agv-veld'><span>{tr(lang, 'Сервіс або адреса', 'Dienst of adres')}</span>
        <select value={CALDAV_AANBIEDERS.some((a) => a.basis === dav.adres) ? dav.adres : ''} onChange={(e) => setDav({ ...dav, adres: e.target.value })} data-agenda-caldav-aanbieder='1'>
          <option value=''>{tr(lang, 'Інша адреса', 'Ander adres')}</option>{CALDAV_AANBIEDERS.filter((a) => a.basis).map((a) => <option key={a.id} value={a.basis}>{a.naam}</option>)}
        </select>
      </label>
      <label className='agv-veld'><span>{tr(lang, 'Адреса', 'Adres')}</span><input type='url' value={dav.adres} onChange={(e) => setDav({ ...dav, adres: e.target.value })} placeholder='https://caldav.example.org/dav/' data-agenda-caldav-adres='1' /></label>
      <label className='agv-veld'><span>{tr(lang, 'Користувач (адреса пошти)', 'Gebruiker (e-mailadres)')}</span><input value={dav.gebruikersnaam} onChange={(e) => setDav({ ...dav, gebruikersnaam: e.target.value })} data-agenda-caldav-gebruiker='1' autoComplete='off' /></label>
      <div className='agv-veld'><span>{tr(lang, 'Пароль застосунку', 'App-wachtwoord')}</span><GeheimInvoer lang={lang} value={dav.wachtwoord} onChange={(w) => setDav({ ...dav, wachtwoord: w })} placeholder={tr(lang, 'Пароль застосунку', 'App-wachtwoord')} autoComplete='off' max={1024} soort='caldav' data={{ 'agenda-caldav-wachtwoord': '1' }} /></div>
      <button type='submit' className='agv-knop' disabled={bezig || !dav.adres.trim() || !dav.gebruikersnaam.trim() || !dav.wachtwoord} data-agenda-caldav-koppelen='1'>{bezig ? tr(lang, 'Перевіряю…', 'Controleren…') : tr(lang, 'Підключити', 'Koppelen')}</button>
      {fout ? <p className='agv-balk is-fout' role='alert' data-agenda-caldav-fout={fout}><span>{foutCodeTekst(fout, lang)}</span></p> : null}
    </form>
  );
}
