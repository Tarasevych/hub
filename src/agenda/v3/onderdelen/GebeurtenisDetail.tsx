// Snel bekijken van één afspraak (paneel op de computer, onderblad op de telefoon). Alleen Google-afspraken in een agenda met
// schrijfrecht zijn te wijzigen; bij ICS/CalDAV staat waarom niet, en er opent GEEN schijnbaar bewerkbaar formulier.
import { useState } from 'react';
import { CalendarDays, Clock3, Lock, MapPin, Pencil, Repeat, Trash2, Users } from 'lucide-react';
import { ANTWOORD_LABEL, herhalingUitRrule, herhalingUitleg, type AgendaItem, type Antwoord } from '../../../../shared/agenda-model';
import { fmt, tijdTekst, titelVan, tr, type Lang } from '../tekst';
import Laag from './Laag';

export function alleenLezenReden(lang: Lang, item: AgendaItem, schrijfrecht: boolean): string {
  if (item.bron === 'ics') return tr(lang, 'Ця подія з підписки .ics. Підписку можна лише читати: змінити подію можна там, звідки вона прийшла.', 'Deze afspraak komt uit een .ics-abonnement. Een abonnement is alleen te lezen: wijzig de afspraak waar ze vandaan komt.');
  if (item.bron === 'caldav') return tr(lang, 'Ця подія з CalDAV/iCloud. Підключення CalDAV тут лише читає; запис ще не реалізовано.', 'Deze afspraak komt uit CalDAV/iCloud. De CalDAV-koppeling leest hier alleen; schrijven is nog niet gebouwd.');
  if (!schrijfrecht) return tr(lang, 'Google підключено лише для читання. Щоб змінювати події, дозвольте запис у «Календарі та сервіси».', 'Google is alleen voor lezen gekoppeld. Om te wijzigen: sta schrijven toe in «Agenda’s en diensten».');
  return tr(lang, 'У цьому календарі Google у вас немає права змінювати події.', 'In deze Google-agenda mag u geen afspraken wijzigen.');
}

type Props = {
  lang: Lang; item: AgendaItem; smal: boolean; schrijfrecht: boolean; bezig: boolean;
  onSluit: () => void; onWijzig: () => void; onVerwijder: () => Promise<boolean>; onAntwoord: (a: Antwoord) => void; onToestaan: () => void;
};
export default function GebeurtenisDetail({ lang, item, smal, schrijfrecht, bezig, onSluit, onWijzig, onVerwijder, onAntwoord, onToestaan }: Props) {
  const [wissen, setWissen] = useState(false);
  const kan = item.bron === 'google' && item.schrijfbaar && schrijfrecht;
  const zelf = item.deelnemers.find((d) => d.zelf);
  const dag = String(item.begin).slice(0, 10);
  return (
    <Laag lang={lang} soort={smal ? 'blad' : 'paneel'} titel={titelVan(lang, item)} onSluit={onSluit} data={{ 'agenda-v3-detail': item.id }}>
      <dl className='agv-detail'>
        <div><dt><Clock3 aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Час', 'Tijd')}</span></dt><dd>{fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })} · {tijdTekst(lang, item)}</dd></div>
        <div><dt><CalendarDays aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Календар', 'Agenda')}</span></dt><dd>{item.agendaNaam || item.bron}</dd></div>
        {item.locatie ? <div><dt><MapPin aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Місце', 'Plaats')}</span></dt><dd>{item.locatie}</dd></div> : null}
        {item.herhaling ? <div><dt><Repeat aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Повторення', 'Herhaling')}</span></dt><dd>{herhalingUitleg(herhalingUitRrule(item.herhaling), lang)}</dd></div> : null}
        {item.deelnemers.length ? <div><dt><Users aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Учасники', 'Gasten')}</span></dt><dd>{item.deelnemers.map((d) => d.naam || d.email).join(', ')}</dd></div> : null}
      </dl>
      {item.beschrijving ? <p className='agv-detail-tekst'>{item.beschrijving}</p> : null}
      {kan && zelf && !zelf.organisator ? (
        <div className='agv-rsvp' role='group' aria-label={tr(lang, 'Ваша відповідь', 'Uw antwoord')}>
          {(['accepted', 'tentative', 'declined'] as Antwoord[]).map((a) => (
            <button key={a} type='button' className='agv-knop' aria-pressed={zelf.antwoord === a} disabled={bezig} onClick={() => onAntwoord(a)} data-agenda-v3-antwoord={a}>{lang === 'uk' ? ANTWOORD_LABEL[a][0] : ANTWOORD_LABEL[a][1]}</button>
          ))}
        </div>
      ) : null}
      {!kan ? (
        <div className='agv-balk' data-agenda-v3-alleen-lezen={item.bron}>
          <Lock aria-hidden='true' /><span>{alleenLezenReden(lang, item, schrijfrecht)}</span>
          {item.bron === 'google' && !schrijfrecht ? <button type='button' className='agv-tekstknop' onClick={onToestaan}>{tr(lang, 'Дозволити створення подій', 'Aanmaken toestaan')}</button> : null}
        </div>
      ) : (
        <div className='agv-laag-voet'>
          {wissen ? (
            <div className='agv-bevestig' role='alertdialog' aria-label={tr(lang, 'Видалити подію?', 'Afspraak verwijderen?')}>
              <span>{tr(lang, 'Видалити цю подію з Google?', 'Deze afspraak uit Google verwijderen?')}{item.herhaling ? tr(lang, ' Буде видалено всю серію.', ' De hele reeks wordt verwijderd.') : ''}</span>
              <button type='button' className='agv-knop is-gevaar' disabled={bezig} data-agv-eerste onClick={() => void onVerwijder().then((ok) => { if (ok) onSluit(); })} data-agenda-v3-wis-ja='1'>{bezig ? tr(lang, 'Видаляю…', 'Verwijderen…') : tr(lang, 'Так, видалити', 'Ja, verwijderen')}</button>
              <button type='button' className='agv-knop' onClick={() => setWissen(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </div>
          ) : (
            <>
              <button type='button' className='agv-knop is-hoofd' onClick={onWijzig} data-agenda-v3-wijzig='1'><Pencil aria-hidden='true' />{tr(lang, 'Змінити', 'Wijzigen')}</button>
              <button type='button' className='agv-knop is-stil-gevaar' onClick={() => setWissen(true)} data-agenda-v3-wis='1'><Trash2 aria-hidden='true' />{tr(lang, 'Видалити', 'Verwijderen')}</button>
            </>
          )}
        </div>
      )}
    </Laag>
  );
}
