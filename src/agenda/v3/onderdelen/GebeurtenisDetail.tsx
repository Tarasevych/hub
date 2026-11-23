// Швидкий перегляд події (панель на комп'ютері, нижній аркуш на телефоні): переходи до листів учасника (mail),
// контактів (contact / afzenders), прив'язаних нотаток зустрічі (notities), вивантаження .ics та CalDAV-редагування за прапорцем.
import { useCallback, useEffect, useState } from 'react';
import {
  BookUser,
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  Link2Off,
  Lock,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Users,
} from 'lucide-react';
import { ANTWOORD_LABEL, herhalingUitRrule, herhalingUitleg, type AgendaItem, type Antwoord } from '../../../../shared/agenda-model';
import { canonicalNavigationUrl } from '../../../canoniek-navigatie';
import { useVlag } from '../../../functievlag-lezen';
import {
  afspraakNotitieKoppelen,
  afspraakNotitieOntkoppelen,
  afspraakNotitiesLijst,
  deelnemerSprong,
  downloadIcsBestand,
  exporteerAfspraakIcs,
  nieuweSleutel,
  type BeschikbareNotitieKeuze,
  type GekoppeldeAfspraakNotitie,
} from '../../agenda-client';
import { fmt, tijdTekst, titelVan, tr, type Lang } from '../tekst';
import Laag from './Laag';

const DETAIL_TEKSTEN = {
  brievenKnop: { uk: 'Листи учасника', nl: 'Berichten van deelnemer' },
  contactKnop: { uk: 'Контакт учасника', nl: 'Contact van deelnemer' },
  notitiesKop: { uk: 'Нотатка до події', nl: 'Notitie bij afspraak' },
  openNotitie: { uk: 'До нотатки', nl: 'Naar notitie' },
  ontkoppelNotitie: { uk: 'Від’єднати', nl: 'Loskoppelen' },
  maakNieuweNotitie: { uk: 'Створити нотатку зустрічі', nl: 'Gespreksnotitie maken' },
  koppelBestaandeNotitie: { uk: 'Прив’язати нотатку', nl: 'Notitie koppelen' },
  exportIcs: { uk: 'Вивантажити .ics', nl: 'Exporteer .ics' },
} as const;

export function alleenLezenReden(lang: Lang, item: AgendaItem, schrijfrecht: boolean, caldavSchrijvenAan = false): string {
  if (item.bron === 'ics') return tr(lang, 'Ця подія з підписки .ics. Підписку можна лише читати: змінити подію можна там, звідки вона прийшла, або зберегти копію у файл .ics.', 'Deze afspraak komt uit een .ics-abonnement. Een abonnement is alleen te lezen: wijzig de afspraak bij de aanbieder of sla een kopie op als .ics-bestand.');
  if (item.bron === 'caldav' && !caldavSchrijvenAan) return tr(lang, 'Ця подія з CalDAV/iCloud. Підключення CalDAV тут лише читає; запис ще не реалізовано.', 'Deze afspraak komt uit CalDAV/iCloud. De CalDAV-koppeling leest hier alleen; schrijven is nog niet gebouwd.');
  if (item.bron === 'caldav') return tr(lang, 'Цей зовнішній календар доступний лише для читання. Ви можете завантажити подію у стандартний файл .ics.', 'Deze externe agenda is alleen leesbaar. U kunt de afspraak als standaard .ics-bestand ophalen.');
  if (!schrijfrecht) return tr(lang, 'Google підключено лише для читання. Щоб змінювати події, дозвольте запис у «Календарі та сервіси».', 'Google is alleen voor lezen gekoppeld. Om te wijzigen: sta schrijven toe in «Agenda’s en diensten».');
  return tr(lang, 'У цьому календарі Google у вас немає права змінювати події.', 'In deze Google-agenda mag u geen afspraken wijzigen.');
}

type Props = {
  lang: Lang;
  item: AgendaItem;
  smal: boolean;
  schrijfrecht: boolean;
  caldavSchrijvenAan?: boolean;
  bezig: boolean;
  onSluit: () => void;
  onWijzig: () => void;
  onVerwijder: () => Promise<boolean>;
  onAntwoord: (a: Antwoord) => void;
  onToestaan: () => void;
};

export default function GebeurtenisDetail({
  lang,
  item,
  smal,
  schrijfrecht,
  caldavSchrijvenAan,
  bezig,
  onSluit,
  onWijzig,
  onVerwijder,
  onAntwoord,
  onToestaan,
}: Props) {
  const vlagCaldav = useVlag('agenda-koppelingen-v1', false);
  const caldavActief = caldavSchrijvenAan ?? vlagCaldav;
  const [wissen, setWissen] = useState(false);
  const [actieBezig, setActieBezig] = useState(false);
  const [actieFout, setActieFout] = useState('');
  const [gekoppeldeNotities, setGekoppeldeNotities] = useState<GekoppeldeAfspraakNotitie[]>([]);
  const [beschikbareNotities, setBeschikbareNotities] = useState<BeschikbareNotitieKeuze[]>([]);
  const [gekozenNotitieId, setGekozenNotitieId] = useState('');
  const [bevestigNotitie, setBevestigNotitie] = useState(false);
  const [toonNotitieKiezer, setToonNotitieKiezer] = useState(false);

  const kanGoogle = item.bron === 'google' && item.schrijfbaar && schrijfrecht;
  const kanCaldav = item.bron === 'caldav' && caldavActief && Boolean(item.caldavAbonnementId);
  const kan = kanGoogle || kanCaldav;
  const zelf = item.deelnemers.find((d) => d.zelf);
  const dag = String(item.begin).slice(0, 10);

  const laadNotities = useCallback(async () => {
    try {
      const r = await afspraakNotitiesLijst(item.id);
      if (r.ok) {
        setGekoppeldeNotities(r.gekoppelde);
        setBeschikbareNotities(r.beschikbareNotities);
      }
    } catch {
      /* тихо при відсутності мережі */
    }
  }, [item.id]);

  useEffect(() => {
    void laadNotities();
  }, [laadNotities]);

  const springNaarDeelnemer = async (email: string, doel: 'mail' | 'contact') => {
    if (actieBezig) return;
    setActieBezig(true);
    setActieFout('');
    try {
      const r = await deelnemerSprong(email, doel);
      if (!r.ok) {
        setActieFout(tr(lang, 'Не вдалося підготувати перехід для учасника.', 'De sprong voor deze deelnemer kon niet worden voorbereid.'));
        return;
      }
      if (doel === 'mail') {
        location.assign(`${canonicalNavigationUrl('mail', 'all', lang)}?resume_context=1`);
      } else if (r.sprongId) {
        // Безпечний перехід до Контактів (afzenders / contact) без електронної адреси в URL.
        location.assign(`${canonicalNavigationUrl('mail', 'contacts', lang)}?contact_sprong=${encodeURIComponent(r.sprongId)}`);
      }
    } catch {
      setActieFout(tr(lang, 'Немає зв’язку із сервером.', 'Geen verbinding met de server.'));
    } finally {
      setActieBezig(false);
    }
  };

  const haalIcsOp = async () => {
    if (actieBezig) return;
    setActieBezig(true);
    setActieFout('');
    try {
      const r = await exporteerAfspraakIcs({ itemId: item.id, kalenderNaam: item.agendaNaam });
      if (r.ok && r.ics) {
        downloadIcsBestand(r.bestandsnaam, r.ics);
      } else {
        setActieFout(tr(lang, 'Не вдалося сформувати файл .ics.', 'Het .ics-bestand kon niet worden opgebouwd.'));
      }
    } catch {
      setActieFout(tr(lang, 'Не вдалося сформувати файл .ics.', 'Het .ics-bestand kon niet worden opgebouwd.'));
    } finally {
      setActieBezig(false);
    }
  };

  const koppelOfMaakNotitie = async (maakNieuw: boolean) => {
    if (actieBezig) return;
    if (!bevestigNotitie) {
      setActieFout(tr(lang, 'Поставте позначку підтвердження перед збереженням зв’язку з нотаткою.', 'Vink eerst de bevestiging aan voordat de notitiekoppeling wordt bewaard.'));
      return;
    }
    if (!maakNieuw && !gekozenNotitieId) return;
    setActieBezig(true);
    setActieFout('');
    try {
      const r = await afspraakNotitieKoppelen({
        idempotentieSleutel: nieuweSleutel(),
        eventId: item.id,
        agendaId: item.agendaId,
        notitieId: maakNieuw ? undefined : gekozenNotitieId,
        maakNieuw,
        titel: maakNieuw ? `${titelVan(lang, item)} (${dag})` : undefined,
        inhoud: maakNieuw ? (item.beschrijving || '') : undefined,
        bevestigd: true,
      });
      if (r.ok) {
        setGekozenNotitieId('');
        setBevestigNotitie(false);
        setToonNotitieKiezer(false);
        await laadNotities();
      }
    } catch {
      setActieFout(tr(lang, 'Не вдалося зберегти прив’язку нотатки.', 'De notitiekoppeling kon niet worden opgeslagen.'));
    } finally {
      setActieBezig(false);
    }
  };

  const ontkoppelNotitie = async (notitieId: string) => {
    if (actieBezig) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await afspraakNotitieOntkoppelen(notitieId, item.id);
      await laadNotities();
    } catch {
      setActieFout(tr(lang, 'Не вдалося скасувати прив’язку нотатки.', 'Loskoppelen van de notitie is mislukt.'));
    } finally {
      setActieBezig(false);
    }
  };

  const notitiesBasisUrl = canonicalNavigationUrl('hub', 'notes', lang);

  return (
    <Laag lang={lang} soort={smal ? 'blad' : 'paneel'} titel={titelVan(lang, item)} onSluit={onSluit} data={{ 'agenda-v3-detail': item.id }}>
      <dl className='agv-detail'>
        <div><dt><Clock3 aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Час', 'Tijd')}</span></dt><dd>{fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })} · {tijdTekst(lang, item)}</dd></div>
        <div><dt><CalendarDays aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Календар', 'Agenda')}</span></dt><dd>{item.agendaNaam || item.bron}</dd></div>
        {item.locatie ? <div><dt><MapPin aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Місце', 'Plaats')}</span></dt><dd>{item.locatie}</dd></div> : null}
        {item.herhaling ? <div><dt><Repeat aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Повторення', 'Herhaling')}</span></dt><dd>{herhalingUitleg(herhalingUitRrule(item.herhaling), lang)}</dd></div> : null}
        {item.deelnemers.length ? (
          <div>
            <dt><Users aria-hidden='true' /><span className='agv-verborgen'>{tr(lang, 'Учасники', 'Gasten')}</span></dt>
            <dd>
              <ul className='agv-gasten-lijst'>
                {item.deelnemers.map((d) => (
                  <li key={d.email} className='agv-gast-rij' data-agenda-v3-gast={d.email}>
                    <span>{d.naam || d.email}</span>
                    <span className='agv-sprongen'>
                      <button type='button' className='agv-knop is-kompakt' disabled={actieBezig} onClick={() => void springNaarDeelnemer(d.email, 'mail')} data-agenda-sprong-mail={d.email}>
                        <Mail aria-hidden='true' />{DETAIL_TEKSTEN.brievenKnop[lang]}
                      </button>
                      <button type='button' className='agv-knop is-kompakt' disabled={actieBezig} onClick={() => void springNaarDeelnemer(d.email, 'contact')} data-agenda-sprong-contact={d.email}>
                        <BookUser aria-hidden='true' />{DETAIL_TEKSTEN.contactKnop[lang]}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      {item.beschrijving ? <p className='agv-detail-tekst'>{item.beschrijving}</p> : null}

      {actieFout ? <p className='agv-balk is-fout' role='alert'><span>{actieFout}</span></p> : null}

      {/* Нотатки до зустрічі (notities) */}
      <div className='agv-notities-blok' data-agenda-v3-notities='1'>
        <div className='agv-notities-kop'>
          <strong><NotebookPen aria-hidden='true' />{DETAIL_TEKSTEN.notitiesKop[lang]}</strong>
          <button type='button' className='agv-knop is-kompakt' onClick={() => setToonNotitieKiezer((x) => !x)} data-agenda-notitie-kiezer='1'>
            <Plus aria-hidden='true' />{DETAIL_TEKSTEN.koppelBestaandeNotitie[lang]}
          </button>
        </div>
        {gekoppeldeNotities.length > 0 ? (
          <ul className='agv-notities-lijst'>
            {gekoppeldeNotities.map((k) => (
              <li key={k.id} className='agv-notitie-rij' data-agenda-gekoppelde-notitie={k.notitieId}>
                <span>{k.notitieTitel || k.notitieId}</span>
                <span className='agv-sprongen'>
                  <a className='agv-knop is-kompakt' href={`${notitiesBasisUrl}?open_item_id=${encodeURIComponent(k.notitieId)}`}>
                    <ExternalLink aria-hidden='true' />{DETAIL_TEKSTEN.openNotitie[lang]}
                  </a>
                  <button type='button' className='agv-knop is-kompakt' disabled={actieBezig} onClick={() => void ontkoppelNotitie(k.notitieId)}>
                    <Link2Off aria-hidden='true' />{DETAIL_TEKSTEN.ontkoppelNotitie[lang]}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <small className='agv-klein'>{tr(lang, 'До цієї події ще не прив’язано нотаток.', 'Aan deze afspraak zijn nog geen notities gekoppeld.')}</small>
        )}
        {toonNotitieKiezer ? (
          <div className='agv-notitie-koppelvorm'>
            <label className='agv-veld'>
              <span>{tr(lang, 'Наявна нотатка цього простору', 'Bestaande notitie in deze ruimte')}</span>
              <select value={gekozenNotitieId} onChange={(e) => setGekozenNotitieId(e.target.value)}>
                <option value=''>{tr(lang, '— виберіть нотатку —', '— kies een notitie —')}</option>
                {beschikbareNotities.map((n) => (
                  <option key={n.id} value={n.id}>{n.titel}</option>
                ))}
              </select>
            </label>
            <label className='agv-vink'>
              <input type='checkbox' checked={bevestigNotitie} onChange={(e) => setBevestigNotitie(e.target.checked)} data-agenda-notitie-bevestig='1' />
              {tr(lang, 'Підтверджую збереження двостороннього зв’язку', 'Ik bevestig het opslaan van deze tweerichtingskoppeling')}
            </label>
            <div className='agv-sprongen'>
              {gekozenNotitieId ? (
                <button type='button' className='agv-knop is-kompakt is-hoofd' disabled={actieBezig || !bevestigNotitie} onClick={() => void koppelOfMaakNotitie(false)}>
                  {DETAIL_TEKSTEN.koppelBestaandeNotitie[lang]}
                </button>
              ) : null}
              <button type='button' className='agv-knop is-kompakt' disabled={actieBezig || !bevestigNotitie} onClick={() => void koppelOfMaakNotitie(true)} data-agenda-maak-notitie='1'>
                {DETAIL_TEKSTEN.maakNieuweNotitie[lang]}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Вивантаження .ics в один натиск (RFC 5545) */}
      <div className='agv-ics-balk'>
        <button type='button' className='agv-knop is-kompakt' disabled={actieBezig} onClick={() => void haalIcsOp()} data-agenda-v3-export-ics='1'>
          <Download aria-hidden='true' />{DETAIL_TEKSTEN.exportIcs[lang]}
        </button>
      </div>

      {kanGoogle && zelf && !zelf.organisator ? (
        <div className='agv-rsvp' role='group' aria-label={tr(lang, 'Ваша відповідь', 'Uw antwoord')}>
          {(['accepted', 'tentative', 'declined'] as Antwoord[]).map((a) => (
            <button key={a} type='button' className='agv-knop' aria-pressed={zelf.antwoord === a} disabled={bezig} onClick={() => onAntwoord(a)} data-agenda-v3-antwoord={a}>{lang === 'uk' ? ANTWOORD_LABEL[a][0] : ANTWOORD_LABEL[a][1]}</button>
          ))}
        </div>
      ) : null}
      {!kan ? (
        <div className='agv-balk' data-agenda-v3-alleen-lezen={item.bron}>
          <Lock aria-hidden='true' /><span>{alleenLezenReden(lang, item, schrijfrecht, caldavActief)}</span>
          {item.bron === 'google' && !schrijfrecht ? <button type='button' className='agv-tekstknop' onClick={onToestaan}>{tr(lang, 'Дозволити створення подій', 'Aanmaken toestaan')}</button> : null}
        </div>
      ) : (
        <div className='agv-laag-voet'>
          {wissen ? (
            <div className='agv-bevestig' role='alertdialog' aria-label={tr(lang, 'Видалити подію?', 'Afspraak verwijderen?')}>
              <span>{kanCaldav ? tr(lang, 'Видалити цю подію із зовнішнього календаря CalDAV?', 'Deze afspraak uit de externe CalDAV-agenda verwijderen?') : tr(lang, 'Видалити цю подію з Google?', 'Deze afspraak uit Google verwijderen?')}{item.herhaling ? tr(lang, ' Буде видалено всю серію.', ' De hele reeks wordt verwijderd.') : ''}</span>
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
