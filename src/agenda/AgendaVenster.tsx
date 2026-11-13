// Het venster van één afspraak: maken, wijzigen, verwijderen, gasten, herhaling, herinneringen, tijdzone — en RSVP.
//
// Alle regels komen uit shared/agenda-model.ts (dezelfde die de server gebruikt): zo kan dit venster nooit iets
// voorstellen wat de server weigert. Bij het bewaren gaat de versie (etag) mee; is de afspraak intussen in Google
// gewijzigd, dan laat de server dat weten (AGENDA_CONFLICT) en toont dit venster de ECHTE Google-versie naast de
// eigen wijziging. Pas dan kan de gebruiker kiezen: overnemen of bewust overschrijven.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Repeat, Trash2, UserPlus, X } from 'lucide-react';
import {
  ANTWOORDEN, ANTWOORD_LABEL, EPOST, FREQUENTIES, FREQUENTIE_LABEL, HERINNERING_KEUZES, HERINNERING_METHODE_LABEL,
  MAX_DEELNEMERS, MAX_HERINNERINGEN, TIJDZONES, VORM_FOUTEN, WEEKDAGEN, WEEKDAG_LABEL,
  agendaTekst, geldigeTijdzone, herhalingUitleg, herinneringUitleg, legeVorm, normaliseerVorm, vormFouten,
  type AgendaVorm, type Antwoord, type Frequentie, type Herinnering, type Weekdag,
} from '../../shared/agenda-model';
import type { AgendaKop, SchrijfUitslag } from './agenda-client';
import { weigeringZin } from '../../shared/weigering-tekst';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export const FOUT_TEKST: Record<string, [string, string]> = {
  [VORM_FOUTEN.titel]: ['Вкажіть назву події.', 'Geef de afspraak een titel.'],
  [VORM_FOUTEN.begin]: ['Початок указано неправильно.', 'Het begin is niet goed ingevuld.'],
  [VORM_FOUTEN.einde]: ['Кінець указано неправильно.', 'Het einde is niet goed ingevuld.'],
  [VORM_FOUTEN.orde]: ['Кінець не може бути раніше початку.', 'Het einde kan niet vóór het begin liggen.'],
  [VORM_FOUTEN.tijdzone]: ['Часовий пояс не розпізнано.', 'De tijdzone is niet herkend.'],
  AGENDA_CONFLICT: ['Подію змінили в Google після того, як ми її прочитали. Нічого не перезаписано.', 'De afspraak is in Google gewijzigd nadat wij haar lazen. Er is niets overschreven.'],
  AGENDA_GEBEURTENIS_WEG: ['Події вже немає в Google.', 'De afspraak bestaat niet meer in Google.'],
  AGENDA_SCHRIJFRECHT_ONTBREEKT: ['Немає права на запис: розширте доступ до календаря.', 'Er is geen schrijfrecht: breid de agenda-toegang uit.'],
  AGENDA_IDEMPOTENTIE_SLEUTEL_ONGELDIG: ['Внутрішня помилка: ключ запиту відсутній.', 'Interne fout: de sleutel van het verzoek ontbreekt.'],
  AGENDA_GEEN_DEELNEMER: ['Ви не учасник цієї події, тому відповісти не можна.', 'U bent geen gast van deze afspraak, dus antwoorden kan niet.'],
  AGENDA_BEZIG: ['Такий самий запит ще виконується. Нічого не подвоїлося — спробуйте за мить ще раз.', 'Hetzelfde verzoek loopt nog. Er is niets dubbel gedaan — probeer het over een moment opnieuw.'],
  AGENDA_SCHRIJVEN_MISLUKT: ['Google не прийняв зміну.', 'Google heeft de wijziging niet aangenomen.'],
};
export const foutTekst = (code: string, lang: Lang) => {
  const paar = FOUT_TEKST[code];
  /* SEC-002 (slot «u»): bekende weigeringen (rol «лише перегляд», server bezet …) — één tekst voor de hele site, shared/weigering-tekst.ts. */
  return paar ? tr(lang, paar[0], paar[1]) : weigeringZin(lang, code) ?? tr(lang, `Не вдалося (${code}).`, `Het lukte niet (${code}).`);
};

const tweeCijfers = (n: number) => String(n).padStart(2, '0');
/** Een Date → 'YYYY-MM-DDTHH:MM' in de BROWSERTIJD (dat is wat een datetime-local-veld verwacht). */
export const plaatselijk = (d: Date) => `${d.getFullYear()}-${tweeCijfers(d.getMonth() + 1)}-${tweeCijfers(d.getDate())}T${tweeCijfers(d.getHours())}:${tweeCijfers(d.getMinutes())}`;
const plusUur = (waarde: string, uren: number) => {
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) return waarde;
  d.setHours(d.getHours() + uren);
  return plaatselijk(d);
};

export type VensterBedoeling = { vorm: AgendaVorm; nieuw: boolean };
type Props = {
  lang: Lang;
  bedoeling: VensterBedoeling;
  agendas: AgendaKop[];
  standaardTijdzone: string;
  magSchrijven: boolean;
  bezig: boolean;
  fout: string;
  conflict: AgendaVorm | null;
  onSluiten: () => void;
  onBewaren: (vorm: AgendaVorm, meldDeelnemers: string, negeerVersie: boolean) => Promise<SchrijfUitslag | void>;
  onVerwijderen: (vorm: AgendaVorm, meldDeelnemers: string) => Promise<SchrijfUitslag | void>;
  onVerplaatsen: (vorm: AgendaVorm, naarAgendaId: string) => Promise<SchrijfUitslag | void>;
  onAntwoord: (vorm: AgendaVorm, antwoord: Antwoord) => Promise<SchrijfUitslag | void>;
};

export default function AgendaVenster(props: Props) {
  const { lang, bedoeling, agendas, standaardTijdzone, magSchrijven, bezig, fout, conflict } = props;
  const [vorm, setVorm] = useState<AgendaVorm>(() => bedoeling.vorm);
  const [gast, setGast] = useState('');
  const [meld, setMeld] = useState('none');
  const [naarAgenda, setNaarAgenda] = useState('');
  useEffect(() => { setVorm(bedoeling.vorm); setGast(''); setNaarAgenda(''); }, [bedoeling]);

  const zet = (patch: Partial<AgendaVorm>) => setVorm((oud) => normaliseerVorm({ ...oud, ...patch }));
  const fouten = useMemo(() => vormFouten(vorm), [vorm]);
  const eigen = vorm.deelnemers.find((d) => d.zelf);
  const schrijfbaar = magSchrijven && (agendas.find((a) => a.id === vorm.agendaId)?.schrijfbaar ?? agendas.length === 0);
  const tijdzones = useMemo(() => [...new Set([standaardTijdzone, geldigeTijdzone(vorm.tijdzone), ...TIJDZONES])].filter(Boolean), [standaardTijdzone, vorm.tijdzone]);

  const gastToevoegen = () => {
    const email = gast.trim().toLowerCase();
    if (!EPOST.test(email) || vorm.deelnemers.length >= MAX_DEELNEMERS) return;
    zet({ deelnemers: [...vorm.deelnemers, { email, naam: '', antwoord: 'needsAction', optioneel: false, zelf: false, organisator: false }] });
    setGast('');
  };
  const herinneringToevoegen = () => {
    if (vorm.herinneringen.length >= MAX_HERINNERINGEN) return;
    const nieuw: Herinnering = { methode: 'popup', minuten: 10 };
    zet({ standaardHerinneringen: false, herinneringen: [...vorm.herinneringen, nieuw] });
  };

  return (
    <div className='agenda-venster-laag' role='dialog' aria-modal='true' aria-label={bedoeling.nieuw ? tr(lang, 'Нова подія', 'Nieuwe afspraak') : tr(lang, 'Подія', 'Afspraak')} data-agenda-venster='1' data-mq-laag-open='1'>
      <div className='agenda-venster'>
        <header className='agenda-venster-kop'>
          <h3><CalendarClock aria-hidden='true' />{bedoeling.nieuw ? tr(lang, 'Нова подія', 'Nieuwe afspraak') : tr(lang, 'Редагувати подію', 'Afspraak wijzigen')}</h3>
          <button type='button' className='ghost' onClick={props.onSluiten} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
        </header>

        {fout ? (
          <p className='agenda-venster-fout' role='alert' data-agenda-venster-fout={fout}>
            <AlertTriangle aria-hidden='true' />{foutTekst(fout, lang)}
          </p>
        ) : null}

        {conflict ? (
          <section className='agenda-conflict' data-agenda-conflict='1' aria-label={tr(lang, 'Конфлікт версій', 'Versieconflict')}>
            <p>{tr(lang,
              'У Google зараз інша версія. Ми нічого не перезаписали — виберіть, що робити.',
              'In Google staat nu een andere versie. Wij hebben niets overschreven — kies wat er moet gebeuren.')}</p>
            <dl>
              <dt>{tr(lang, 'У Google', 'In Google')}</dt>
              <dd data-agenda-conflict-google='1'>{conflict.titel} · {conflict.begin} – {conflict.einde}</dd>
              <dt>{tr(lang, 'Ваша зміна', 'Uw wijziging')}</dt>
              <dd>{vorm.titel} · {vorm.begin} – {vorm.einde}</dd>
            </dl>
            <div className='agenda-conflict-acties'>
              <button type='button' className='primary' data-agenda-conflict-overnemen='1' onClick={() => setVorm(conflict)}>
                {tr(lang, 'Взяти версію Google', 'De versie van Google overnemen')}
              </button>
              <button type='button' className='ghost' data-agenda-conflict-overschrijven='1' disabled={bezig} onClick={() => void props.onBewaren({ ...vorm, etag: conflict.etag }, meld, true)}>
                {tr(lang, 'Усе одно записати мою зміну', 'Mijn wijziging toch doorvoeren')}
              </button>
            </div>
          </section>
        ) : null}

        <div className='agenda-venster-velden'>
          <label className='agenda-veld-breed'>
            <span>{tr(lang, 'Назва', 'Titel')}</span>
            <input type='text' value={vorm.titel} maxLength={300} data-agenda-veld='titel'
              onChange={(e) => zet({ titel: e.target.value })} placeholder={tr(lang, 'Про що ця подія', 'Waar gaat de afspraak over')} />
          </label>

          <label className='agenda-veld-select'>
            <span>{tr(lang, 'Календар', 'Agenda')}</span>
            <select value={vorm.agendaId} data-agenda-veld='agenda' onChange={(e) => zet({ agendaId: e.target.value })}>
              {(agendas.length ? agendas : [{ id: 'primary', naam: tr(lang, 'Основний', 'Hoofdagenda'), primair: true, rol: 'owner', schrijfbaar: true, tijdzone: standaardTijdzone, kleur: '' }]).map((a) => (
                <option key={a.id} value={a.id} disabled={bedoeling.nieuw && !a.schrijfbaar}>
                  {a.naam || a.id}{a.schrijfbaar ? '' : tr(lang, ' (лише читання)', ' (alleen lezen)')}
                </option>
              ))}
            </select>
          </label>

          <label className='agenda-veld-schakel'>
            <input type='checkbox' checked={vorm.heleDag} data-agenda-veld='hele-dag'
              onChange={(e) => {
                const heleDag = e.target.checked;
                zet({ heleDag, begin: (vorm.begin || plaatselijk(new Date())).slice(0, heleDag ? 10 : 16), einde: (vorm.einde || vorm.begin || plaatselijk(new Date())).slice(0, heleDag ? 10 : 16) });
              }} />
            <span>{tr(lang, 'Цілий день', 'Hele dag')}</span>
          </label>

          <label>
            <span>{tr(lang, 'Початок', 'Begin')}</span>
            <input type={vorm.heleDag ? 'date' : 'datetime-local'} value={vorm.begin} data-agenda-veld='begin'
              onChange={(e) => {
                const begin = e.target.value;
                const einde = vorm.einde && vorm.einde > begin ? vorm.einde : (vorm.heleDag ? begin : plusUur(begin, 1));
                zet({ begin, einde });
              }} />
          </label>
          <label>
            <span>{tr(lang, 'Кінець', 'Einde')}</span>
            <input type={vorm.heleDag ? 'date' : 'datetime-local'} value={vorm.einde} data-agenda-veld='einde' onChange={(e) => zet({ einde: e.target.value })} />
          </label>

          {vorm.heleDag ? null : (
            <label className='agenda-veld-select'>
              <span>{tr(lang, 'Часовий пояс', 'Tijdzone')}</span>
              <select value={vorm.tijdzone} data-agenda-veld='tijdzone' onChange={(e) => zet({ tijdzone: e.target.value })}>
                {tijdzones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
          )}

          <label className='agenda-veld-breed'>
            <span>{tr(lang, 'Місце', 'Plaats')}</span>
            <input type='text' value={vorm.locatie} maxLength={500} data-agenda-veld='locatie' onChange={(e) => zet({ locatie: e.target.value })} />
          </label>
          <label className='agenda-veld-breed'>
            <span>{tr(lang, 'Опис', 'Beschrijving')}</span>
            <textarea value={vorm.beschrijving} maxLength={8000} rows={3} data-agenda-veld='beschrijving' onChange={(e) => zet({ beschrijving: e.target.value })} />
          </label>
        </div>

        {/* ---- gasten ---- */}
        <section className='agenda-venster-blok' aria-label={tr(lang, 'Учасники', 'Gasten')}>
          <h4><UserPlus aria-hidden='true' />{tr(lang, 'Учасники', 'Gasten')}</h4>
          <ul className='agenda-gasten' data-agenda-gasten={String(vorm.deelnemers.length)}>
            {vorm.deelnemers.map((d) => (
              <li key={d.email} data-agenda-gast={d.email} data-agenda-gast-antwoord={d.antwoord}>
                <span>{d.naam || d.email}</span>
                <small>{agendaTekst(ANTWOORD_LABEL[d.antwoord], lang)}{d.optioneel ? tr(lang, ' · не обов’язково', ' · optioneel') : ''}{d.zelf ? tr(lang, ' · це ви', ' · dat bent u') : ''}</small>
                <button type='button' className='ghost' aria-label={tr(lang, 'Прибрати', 'Verwijderen')}
                  onClick={() => zet({ deelnemers: vorm.deelnemers.filter((x) => x.email !== d.email) })}><X aria-hidden='true' /></button>
              </li>
            ))}
          </ul>
          <div className='agenda-gast-toevoegen'>
            <input type='email' value={gast} placeholder='naam@example.org' data-agenda-veld='gast'
              onChange={(e) => setGast(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gastToevoegen(); } }} />
            <button type='button' className='ghost' disabled={!EPOST.test(gast.trim().toLowerCase())} onClick={gastToevoegen}>{tr(lang, 'Додати', 'Toevoegen')}</button>
          </div>
          {vorm.deelnemers.length ? (
            <label className='agenda-veld-select'>
              <span>{tr(lang, 'Повідомити учасників', 'Gasten een e-mail sturen')}</span>
              <select value={meld} data-agenda-veld='melden' onChange={(e) => setMeld(e.target.value)}>
                <option value='none'>{tr(lang, 'Не надсилати', 'Niet sturen')}</option>
                <option value='all'>{tr(lang, 'Усім', 'Aan iedereen')}</option>
                <option value='externalOnly'>{tr(lang, 'Лише поза Google', 'Alleen buiten Google')}</option>
              </select>
            </label>
          ) : null}
        </section>

        {/* ---- herhaling ---- */}
        <section className='agenda-venster-blok' aria-label={tr(lang, 'Повторення', 'Herhaling')}>
          <h4><Repeat aria-hidden='true' />{tr(lang, 'Повторення', 'Herhaling')}</h4>
          <div className='agenda-herhaling'>
            <select value={vorm.herhaling.frequentie} data-agenda-veld='herhaling'
              onChange={(e) => zet({ herhaling: { ...vorm.herhaling, frequentie: e.target.value as Frequentie } })}>
              {FREQUENTIES.map((f) => <option key={f} value={f}>{agendaTekst(FREQUENTIE_LABEL[f], lang)}</option>)}
            </select>
            {vorm.herhaling.frequentie === 'geen' ? null : (
              <>
                <label className='agenda-veld-klein'>
                  <span>{tr(lang, 'Кожні', 'Elke')}</span>
                  <input type='number' min={1} max={999} value={vorm.herhaling.interval} data-agenda-veld='interval'
                    onChange={(e) => zet({ herhaling: { ...vorm.herhaling, interval: Number(e.target.value) } })} />
                </label>
                <label className='agenda-veld-klein'>
                  <span>{tr(lang, 'Разів', 'Keer')}</span>
                  <input type='number' min={0} max={730} value={vorm.herhaling.aantal} data-agenda-veld='aantal'
                    onChange={(e) => zet({ herhaling: { ...vorm.herhaling, aantal: Number(e.target.value), tot: '' } })} />
                </label>
                <label className='agenda-veld-klein'>
                  <span>{tr(lang, 'До дати', 'Tot datum')}</span>
                  <input type='date' value={vorm.herhaling.tot} data-agenda-veld='tot' disabled={vorm.herhaling.aantal > 0}
                    onChange={(e) => zet({ herhaling: { ...vorm.herhaling, tot: e.target.value, aantal: 0 } })} />
                </label>
                {vorm.herhaling.frequentie === 'wekelijks' ? (
                  <div className='agenda-weekdagen' role='group' aria-label={tr(lang, 'Дні тижня', 'Weekdagen')}>
                    {WEEKDAGEN.map((d: Weekdag) => (
                      <button key={d} type='button' data-agenda-weekdag={d} aria-pressed={vorm.herhaling.dagen.includes(d)}
                        className={vorm.herhaling.dagen.includes(d) ? 'primary' : 'ghost'}
                        onClick={() => zet({ herhaling: { ...vorm.herhaling, dagen: vorm.herhaling.dagen.includes(d) ? vorm.herhaling.dagen.filter((x) => x !== d) : [...vorm.herhaling.dagen, d] } })}>
                        {agendaTekst(WEEKDAG_LABEL[d], lang)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <p className='agenda-herhaling-uitleg' data-agenda-herhaling-uitleg='1'>{herhalingUitleg(vorm.herhaling, lang)}</p>
        </section>

        {/* ---- herinneringen ---- */}
        <section className='agenda-venster-blok' aria-label={tr(lang, 'Нагадування', 'Herinneringen')}>
          <h4>{tr(lang, 'Нагадування', 'Herinneringen')}</h4>
          <label className='agenda-veld-schakel'>
            <input type='checkbox' checked={vorm.standaardHerinneringen} data-agenda-veld='standaard-herinnering'
              onChange={(e) => zet({ standaardHerinneringen: e.target.checked, herinneringen: e.target.checked ? [] : vorm.herinneringen })} />
            <span>{tr(lang, 'Як у налаштуваннях календаря', 'Zoals in de instellingen van de agenda')}</span>
          </label>
          {vorm.standaardHerinneringen ? null : (
            <ul className='agenda-herinneringen' data-agenda-herinneringen={String(vorm.herinneringen.length)}>
              {vorm.herinneringen.map((h, i) => (
                <li key={`${h.methode}-${h.minuten}`}>
                  <select value={h.methode} onChange={(e) => zet({ herinneringen: vorm.herinneringen.map((x, j) => (j === i ? { ...x, methode: e.target.value as Herinnering['methode'] } : x)) })}>
                    <option value='popup'>{agendaTekst(HERINNERING_METHODE_LABEL.popup, lang)}</option>
                    <option value='email'>{agendaTekst(HERINNERING_METHODE_LABEL.email, lang)}</option>
                  </select>
                  <select value={h.minuten} onChange={(e) => zet({ herinneringen: vorm.herinneringen.map((x, j) => (j === i ? { ...x, minuten: Number(e.target.value) } : x)) })}>
                    {HERINNERING_KEUZES.map((m) => <option key={m} value={m}>{herinneringUitleg(m, lang)}</option>)}
                  </select>
                  <button type='button' className='ghost' aria-label={tr(lang, 'Прибрати', 'Verwijderen')}
                    onClick={() => zet({ herinneringen: vorm.herinneringen.filter((_, j) => j !== i) })}><X aria-hidden='true' /></button>
                </li>
              ))}
              {vorm.herinneringen.length < MAX_HERINNERINGEN ? (
                <li><button type='button' className='ghost' data-agenda-herinnering-toevoegen='1' onClick={herinneringToevoegen}>{tr(lang, 'Додати нагадування', 'Herinnering toevoegen')}</button></li>
              ) : null}
            </ul>
          )}
        </section>

        {/* ---- RSVP ---- */}
        {!bedoeling.nieuw && eigen ? (
          <section className='agenda-venster-blok' data-agenda-rsvp='1' aria-label={tr(lang, 'Ваша відповідь', 'Uw antwoord')}>
            <h4>{tr(lang, 'Ваша відповідь на запрошення', 'Uw antwoord op de uitnodiging')}</h4>
            <div className='agenda-rsvp-knoppen'>
              {ANTWOORDEN.map((a: Antwoord) => (
                <button key={a} type='button' data-agenda-rsvp-keuze={a} disabled={bezig || !magSchrijven}
                  className={eigen.antwoord === a ? 'primary' : 'ghost'} onClick={() => void props.onAntwoord(vorm, a)}>
                  {eigen.antwoord === a ? <Check aria-hidden='true' /> : null}{agendaTekst(ANTWOORD_LABEL[a], lang)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- naar een andere agenda ---- */}
        {!bedoeling.nieuw && agendas.filter((a) => a.schrijfbaar && a.id !== vorm.agendaId).length ? (
          <section className='agenda-venster-blok' data-agenda-verplaatsen='1' aria-label={tr(lang, 'Перенести в інший календар', 'Naar een andere agenda')}>
            <h4>{tr(lang, 'Перенести в інший календар', 'Naar een andere agenda verplaatsen')}</h4>
            <div className='agenda-verplaats'>
              <select value={naarAgenda} data-agenda-veld='naar-agenda' onChange={(e) => setNaarAgenda(e.target.value)}>
                <option value=''>{tr(lang, 'Виберіть календар…', 'Kies een agenda…')}</option>
                {agendas.filter((a) => a.schrijfbaar && a.id !== vorm.agendaId).map((a) => <option key={a.id} value={a.id}>{a.naam || a.id}</option>)}
              </select>
              <button type='button' className='ghost' disabled={!naarAgenda || bezig} onClick={() => void props.onVerplaatsen(vorm, naarAgenda)}>
                {tr(lang, 'Перенести', 'Verplaatsen')}
              </button>
            </div>
          </section>
        ) : null}

        <footer className='agenda-venster-voet'>
          {fouten.length ? <p className='agenda-venster-waarschuwing' data-agenda-venster-ongeldig={fouten[0]}>{foutTekst(fouten[0], lang)}</p> : null}
          {!schrijfbaar ? (
            <p className='agenda-venster-waarschuwing' data-agenda-venster-geen-recht='1'>
              {tr(lang, 'Цей календар доступний лише для читання, тому зберегти не можна.', 'Deze agenda is alleen-lezen, dus bewaren kan niet.')}
            </p>
          ) : null}
          <div className='agenda-venster-knoppen'>
            {!bedoeling.nieuw ? (
              <button type='button' className='ghost agenda-gevaar' data-agenda-verwijderen='1' disabled={bezig || !schrijfbaar}
                onClick={() => void props.onVerwijderen(vorm, meld)}><Trash2 aria-hidden='true' />{tr(lang, 'Видалити', 'Verwijderen')}</button>
            ) : null}
            <button type='button' className='ghost' onClick={props.onSluiten}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            <button type='button' className='primary' data-agenda-bewaren='1' disabled={bezig || Boolean(fouten.length) || !schrijfbaar}
              onClick={() => void props.onBewaren(vorm, meld, false)}>
              {bedoeling.nieuw ? tr(lang, 'Створити', 'Aanmaken') : tr(lang, 'Зберегти', 'Bewaren')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Een lege vorm voor een nieuwe afspraak op een gekozen dag (of nu), in de agenda die beschrijfbaar is. */
export function nieuweVorm(dag: string, agendas: AgendaKop[], tijdzone: string): AgendaVorm {
  const schrijfbaar = agendas.find((a) => a.primair && a.schrijfbaar) || agendas.find((a) => a.schrijfbaar);
  const basis = legeVorm(tijdzone);
  const nu = new Date();
  const begin = /^\d{4}-\d{2}-\d{2}$/.test(dag)
    ? `${dag}T${tweeCijfers(Math.min(23, nu.getHours() + 1))}:00`
    : plusUur(plaatselijk(nu), 1).slice(0, 14) + '00';
  return normaliseerVorm({ ...basis, agendaId: schrijfbaar?.id || 'primary', begin, einde: plusUur(begin, 1) });
}
