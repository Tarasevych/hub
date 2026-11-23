import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Files, Folder, Mail } from 'lucide-react';
import { afspraakroute, type Klantbronnen, type Koppelstanden, type Koppeltoestand } from '../../shared/klantrelatie-koppelingen';
import { api, ApiError } from '../platform/client';
import { routeUrl } from '../zoek/zoek-kern';
import { tekst, type Taal } from './relatietaal';

type Basis = { lang: Taal; tabContext: string; magSchrijven: boolean };
const wortel = '/api/owner/klantrelatiebeheer/';
const sessie = (tabContext: string) => ({ service: 'crm', sourceOrigin: location.origin, tabContext });
const namen: Record<Koppeltoestand, [string, string]> = {
  beschikbaar: ['Доступне', 'Beschikbaar'], 'alleen-lezen': ['Лише перегляд', 'Alleen lezen'],
  ontbreekt: ['Підключення відсутнє', 'Geen verbinding'], afgeschermd: ['Доступ обмежено', 'Afgeschermd'],
  onbekend: ['Стан невідомий', 'Onbekend'],
};
export default function Koppelingen({ lang, tabContext }: Basis) {
  const [standen, zet] = useState<Koppelstanden | null>(null);
  const [fout, meld] = useState(false);
  const [poging, herhaal] = useState(0);
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  useEffect(() => {
    const verzoek = new AbortController();
    zet(null); meld(false);
    api.post(wortel + 'koppelstand', sessie(tabContext), { signal: verzoek.signal })
      .then(r => { if (!verzoek.signal.aborted) zet(r.data); })
      .catch(() => { if (!verzoek.signal.aborted) meld(true); });
    return () => verzoek.abort();
  }, [tabContext, poging]);
  return <section className="kr-kader"><h3>{t('Служби цього простору', 'Diensten in deze ruimte')}</h3>
    {fout ? <p role="alert">{t('Не вдалося перевірити підключення.', 'De verbindingen konden niet worden gecontroleerd.')} <button onClick={() => herhaal(v => v + 1)}>{t('Повторити', 'Opnieuw proberen')}</button></p> :
      !standen ? <p role="status">{t('Перевіряємо доступ…', 'Toegang wordt gecontroleerd…')}</p> :
      <dl className="kr-uitkomst">{([
        ['post', t('Пошта', 'Post'), Mail], ['bestanden', t('Файли простору', 'Bestanden in de ruimte'), Folder],
        ['schijf', 'Google Drive', Files], ['agenda', t('Календар', 'Agenda'), CalendarDays],
      ] as const).map(([id, naam, Teken]) => <div key={id}><dt><Teken size={16}/> {naam}</dt><dd>{t(...namen[standen[id] ?? 'onbekend'])}</dd></div>)}</dl>}
  </section>;
}

export function Klantafspraak({ klantId, klantNaam, lang, tabContext, magSchrijven, naWijziging }: Basis & {
  klantId: string; klantNaam: string; naWijziging: () => Promise<void>;
}) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const [bronnen, bronnenIn] = useState<Klantbronnen | null>(null);
  const [bericht, meld] = useState('');
  const [bezig, bezigIn] = useState(false);
  const [pad, padIn] = useState('');
  const [geopend, kies] = useState(false);
  const [bronfout, bronfoutIn] = useState(false);
  const [poging, herhaal] = useState(0);
  const herhaling = useRef({ invoer: '', sleutel: '' });
  useEffect(() => {
    if (!geopend) return;
    const verzoek = new AbortController();
    bronnenIn(null); bronfoutIn(false);
    api.post(wortel + 'bronnen', { ...sessie(tabContext), klantId }, { signal: verzoek.signal })
      .then(r => { if (!verzoek.signal.aborted) bronnenIn(r.data); })
      .catch(() => { if (!verzoek.signal.aborted) bronfoutIn(true); });
    return () => verzoek.abort();
  }, [geopend, klantId, tabContext, poging]);
  async function boeken(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    const formulier = new FormData(e.currentTarget);
    const waarden = { titel: String(formulier.get('titel')), begin: String(formulier.get('begin')), einde: String(formulier.get('einde')), tijdzone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (waarden.begin >= waarden.einde) { meld(t('Завершення має бути після початку зустрічі.', 'Het einde moet na het begin liggen.')); return; }
    const invoer = JSON.stringify(waarden);
    if (invoer !== herhaling.current.invoer) herhaling.current = { invoer, sleutel: crypto.randomUUID() };
    bezigIn(true); meld(''); padIn('');
    try {
      const r = await api.post(wortel + 'afspraak', { ...sessie(tabContext), ...waarden, klantId, sleutel: herhaling.current.sleutel });
      padIn(routeUrl(afspraakroute(r.data.afspraakId), lang));
      meld(t('Зустріч збережено в календарі.', 'De afspraak staat in de agenda.'));
      await naWijziging();
    } catch (fout) {
      meld(fout instanceof ApiError && fout.status === 403 ? t('Для цієї зустрічі потрібен дозвіл на запис до календаря.', 'Voor deze afspraak is schrijftoegang tot de agenda nodig.') :
        t('Не вдалося підтвердити запис зустрічі. Повторіть спробу.', 'De afspraak kon niet worden bevestigd. Probeer het opnieuw.'));
    } finally { bezigIn(false); }
  }
  return <section className="kr-kader"><details onToggle={e => kies(e.currentTarget.open)}>
    <summary>{t('Листи, файли та зустрічі', 'Brieven, bestanden en afspraken')}</summary>
    {geopend && <>
      {bronfout ? <p role="alert">{t('Джерела недоступні.', 'Bronnen zijn niet beschikbaar.')} <button onClick={() => herhaal(v => v + 1)}>{t('Повторити', 'Opnieuw proberen')}</button></p> :
        !bronnen ? <p role="status">{t('Шукаємо пов’язані записи…', 'Bijbehorende stukken worden gezocht…')}</p> :
        [['post', t('Листи від клієнта', 'Brieven van de klant')], ['bestanden', t('Файли за назвою', 'Bestanden op naam')]].map(([id, kop]) => {
          const rijen = bronnen[id as keyof Klantbronnen];
          return <div key={id}><h4>{kop}</h4>{rijen.length ? <ul>{rijen.map(b => <li key={b.id}><a href={routeUrl(b.route, lang)}>{b.titel}</a></li>)}</ul> :
            <p>{t('Доступних збігів немає.', 'Geen toegankelijke resultaten.')}</p>}</div>;
        })}
      {magSchrijven && <form onSubmit={boeken}><fieldset disabled={bezig} className="kr-velden">
        <legend>{t('Особиста зустріч у календарі', 'Persoonlijke agenda-afspraak')}</legend>
        <label>{t('Назва', 'Titel')}<input name="titel" defaultValue={klantNaam} maxLength={180} required /></label>
        <label>{t('Початок', 'Begin')}<input name="begin" type="datetime-local" required /></label>
        <label>{t('Завершення', 'Einde')}<input name="einde" type="datetime-local" required /></label>
        <button className="kr-knop" type="submit">{t('Записати в календар', 'In agenda zetten')}</button>
      </fieldset></form>}
      {bericht && <p role="status">{bericht} {pad && <a href={pad}>{t('Відкрити зустріч', 'Afspraak openen')}</a>}</p>}
    </>}</details></section>;
}
