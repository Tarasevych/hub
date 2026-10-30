// «Календарі та сервіси»: alle koppelingen op één plek (paneel rechts, onderblad op de telefoon). Per dienst een korte stand;
// technische details (toegangsgebieden, wat er voor schrijven ontbreekt) alleen ingeklapt. Niets heet «підключено» zonder dat de
// server het zegt. ICS en CalDAV zijn alleen lezen, en dat staat erbij.
import { useState } from 'react';
import { CalendarPlus, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { canonicalNavigationUrl } from '../../../canoniek-navigatie';
import { AGENDA_AANBIEDERS, AGENDA_RICHTING_LABEL, agendaKaartStand, agendaTekst } from '../../../../shared/agenda-catalogus';
import * as client from '../../agenda-client';
import { foutCodeTekst } from '../../abonnement-fouten';
import ICloudVenster from '../../ICloudVenster';
import type { GoogleKoppelStand } from '../haken/gebruikGoogleKoppeling';
import { taalcode, tr, type Lang } from '../tekst';
import Laag from './Laag';
import { DavVorm, IcsVorm } from './KoppelVormen';

export type LadeDeel = 'google' | 'ics' | 'caldav' | 'alle';
type Stand = 'aan' | 'lezen' | 'uit' | 'fout' | 'bezig';
const STAND: Record<Stand, [string, string]> = { aan: ['читання і запис', 'lezen en schrijven'], lezen: ['лише читання', 'alleen lezen'], uit: ['не підключено', 'niet gekoppeld'], fout: ['помилка', 'fout'], bezig: ['оновлюється…', 'wordt ververst…'] };
const Pil = ({ lang, stand }: { lang: Lang; stand: Stand }) => <span className={`agv-pil is-${stand}`} data-agenda-v3-stand={stand}>{lang === 'uk' ? STAND[stand][0] : STAND[stand][1]}</span>;
const wanneer = (lang: Lang, ms: number) => (ms ? new Intl.DateTimeFormat(taalcode(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '—');

type Props = {
  lang: Lang; data: client.AgendaOverzicht | null; smal: boolean; deel: LadeDeel; laatstGelukt: number | null;
  synchroniseren: boolean; google: { stand: GoogleKoppelStand; foutCode: string; start: (doel?: 'lezen' | 'schrijven') => void };
  onSynchroniseer: () => void; onToestaan: () => void; onVerversen: () => void; onSluit: () => void; onKoppelen: () => void;
};
export default function VerbindingenLade({ lang, data, smal, deel, laatstGelukt, synchroniseren, google: gk, onSynchroniseer, onToestaan, onVerversen, onSluit, onKoppelen }: Props) {
  const t = data?.toegang;
  const [icloud, setIcloud] = useState(false);
  const [bezig, setBezig] = useState('');
  const [wis, setWis] = useState('');
  const google: Stand = !data ? 'uit' : data.agendasFout ? 'fout' : t?.schrijven ? 'aan' : t?.lezen ? 'lezen' : 'uit';
  const doe = async (naam: string, f: () => Promise<unknown>) => { setBezig(naam); try { await f(); } finally { setBezig(''); onVerversen(); } };
  const googleDoel = AGENDA_AANBIEDERS.find((a) => a.id === 'google-calendar')?.doel;
  const gekoppeld = { calendar: t ? t.lezen : null, ics: data ? (data.abonnementen.ics.some((r) => r.actief) || null) : null, caldav: data ? (data.abonnementen.caldav.some((r) => r.actief) || null) : null };

  return (
    <Laag lang={lang} soort={smal ? 'blad' : 'paneel'} titel={tr(lang, 'Календарі та сервіси', 'Agenda’s en diensten')} onSluit={onSluit} data={{ 'agenda-v3-lade': deel }} breed>
      <div className='agv-knoppenrij'>
        <button type='button' className='agv-knop is-hoofd' onClick={onKoppelen} data-agenda-v3-koppelen='1'><CalendarPlus aria-hidden='true' />{tr(lang, 'Підключити календар…', 'Agenda koppelen…')}</button>
      </div>
      <section className='agv-dienst' data-agenda-v3-dienst='google'>
        <div className='agv-dienst-kop'><strong>Google Calendar</strong><Pil lang={lang} stand={synchroniseren ? 'bezig' : google} /></div>
        {google !== 'uit' && laatstGelukt ? <p className='agv-klein'>{tr(lang, `Останнє оновлення: ${wanneer(lang, laatstGelukt)}`, `Laatst ververst: ${wanneer(lang, laatstGelukt)}`)}</p> : null}
        {data?.agendasFout ? <p className='agv-balk is-fout' role='alert'><span>{foutCodeTekst(data.agendasFout, lang)}</span></p> : null}
        <div className='agv-knoppenrij'>
          {google === 'uit' ? <button type='button' className='agv-knop is-hoofd' onClick={() => gk.start('lezen')} disabled={gk.stand === 'wacht'} data-agenda-verbinden='google-calendar'>{gk.stand === 'wacht' ? tr(lang, 'Чекаю на Google…', 'Wachten op Google…') : tr(lang, 'Підключити Google', 'Google koppelen')}</button> : null}
          {t?.uitbreidingNodig ? <button type='button' className='agv-knop is-hoofd' onClick={onToestaan} disabled={gk.stand === 'wacht'} data-agenda-uitbreiden='1'>{gk.stand === 'wacht' ? tr(lang, 'Чекаю на Google…', 'Wachten op Google…') : tr(lang, 'Дозволити створення подій', 'Aanmaken toestaan')}</button> : null}
          {google !== 'uit' ? <button type='button' className='agv-knop' onClick={onSynchroniseer} disabled={synchroniseren} data-agenda-sync='1'><RefreshCw aria-hidden='true' className={synchroniseren ? 'agv-draai' : ''} />{tr(lang, 'Синхронізувати зараз', 'Nu synchroniseren')}</button> : null}
        </div>
        {gk.stand === 'reeks' && googleDoel ? <p className='agv-balk is-info' data-agenda-kv-reeks='1'><span>{tr(lang, 'Google підключається по черзі (пошта → диск → календар). ', 'Google koppelt in een vaste volgorde (post → schijf → agenda). ')}<a href={canonicalNavigationUrl(googleDoel.dienst, googleDoel.tab, lang)} target='_blank' rel='noreferrer'>{tr(lang, 'Відкрити майстер Google', 'De Google-wizard openen')}</a>{tr(lang, ' — ця сторінка оновиться сама.', ' — deze pagina ververst zichzelf.')}</span></p> : null}
        {gk.stand === 'fout' && gk.foutCode ? <p className='agv-balk is-fout' role='alert'><span>{foutCodeTekst(gk.foutCode, lang)}</span></p> : null}
        {t?.uitbreidingNodig ? <p className='agv-klein'>{tr(lang, 'Це не нове підключення: Google залишить наявні дозволи й додасть лише дозвіл на запис подій — у сусідньому вікні, не покидаючи календаря.', 'Dit is geen nieuwe koppeling: Google houdt uw toestemmingen en voegt alleen schrijven van afspraken toe — in een apart venstertje, zonder de agenda te verlaten.')}</p> : null}
        {t?.scopes?.length || t?.toevoegen?.length ? (
          <details className='agv-uitleg'><summary>{tr(lang, 'Технічні подробиці', 'Technische details')}</summary>
            <ul className='agv-code-lijst'>{(t.scopes || []).map((s) => <li key={s}><code>{s}</code></li>)}{(t.toevoegen || []).map((s) => <li key={`+${s}`} data-agenda-uitbreiding-scope={s}><code>+ {s}</code></li>)}</ul>
          </details>
        ) : null}
      </section>

      <section className='agv-dienst' data-agenda-v3-dienst='ics' data-agenda-abonnementen='1'>
        <div className='agv-dienst-kop'><strong>{tr(lang, 'Підписка .ics', 'ICS-abonnement')}</strong><Pil lang={lang} stand={data?.abonnementen.ics.some((r) => r.laatsteStaat === 'fout') ? 'fout' : data?.abonnementen.ics.some((r) => r.actief) ? 'lezen' : 'uit'} /></div>
        <p className='agv-klein'>{tr(lang, 'Посилання на календар (.ics) з Outlook, Proton чи іншого сервісу. Лише читання: змінювати події там не можна.', 'Een link naar een agenda (.ics) uit Outlook, Proton of een andere dienst. Alleen lezen: afspraken wijzigen kan daar niet.')}</p>
        <ul className='agv-abonnementen'>
          {(data?.abonnementen.ics || []).map((r) => (
            <li key={r.id} data-agenda-ics={r.id} data-agenda-ics-staat={r.laatsteStaat}>
              <div><strong>{r.naam || r.adres}</strong><small>{tr(lang, `подій: ${r.aantal} · оновлено ${wanneer(lang, r.laatstKlaarOp)}`, `afspraken: ${r.aantal} · ververst ${wanneer(lang, r.laatstKlaarOp)}`)}{r.actief ? '' : tr(lang, ' · вимкнено', ' · uit')}</small>{r.fout ? <small className='agv-fouttekst'>{foutCodeTekst(r.fout, lang)}</small> : null}</div>
              <span className='agv-rij-acties'>
                <button type='button' className='agv-icoonknop' disabled={bezig === r.id} onClick={() => void doe(r.id, () => client.icsVernieuwen(r.id))} aria-label={tr(lang, 'Оновити', 'Verversen')}><RefreshCw aria-hidden='true' className={bezig === r.id ? 'agv-draai' : ''} /></button>
                <button type='button' className='agv-tekstknop' onClick={() => void doe(r.id, () => client.icsSchakelen(r.id, !r.actief))}>{r.actief ? tr(lang, 'Вимкнути', 'Uitzetten') : tr(lang, 'Увімкнути', 'Aanzetten')}</button>
                {wis === r.id
                  ? <><button type='button' className='agv-knop is-gevaar' onClick={() => { setWis(''); void doe(r.id, () => client.icsVerwijderen(r.id)); }} data-agenda-ics-verwijderen={r.id}>{tr(lang, 'Так, видалити', 'Ja, verwijderen')}</button><button type='button' className='agv-tekstknop' onClick={() => setWis('')}>{tr(lang, 'Ні', 'Nee')}</button></>
                  : <button type='button' className='agv-icoonknop' onClick={() => setWis(r.id)} aria-label={tr(lang, 'Видалити підписку', 'Abonnement verwijderen')}><Trash2 aria-hidden='true' /></button>}
              </span>
            </li>
          ))}
        </ul>
        <IcsVorm lang={lang} autofocus={deel === 'ics'} onKlaar={onVerversen} />
      </section>

      <section className='agv-dienst' data-agenda-v3-dienst='caldav'>
        <div className='agv-dienst-kop'><strong>iCloud / CalDAV</strong><Pil lang={lang} stand={data?.abonnementen.caldav.some((r) => r.laatsteStaat === 'fout') ? 'fout' : data?.abonnementen.caldav.some((r) => r.actief) ? 'lezen' : 'uit'} /></div>
        <p className='agv-klein'>{tr(lang, 'Лише читання: сервер читає ваші календарі за паролем застосунку. Запис ще не реалізовано.', 'Alleen lezen: de server leest uw agenda’s met een app-wachtwoord. Schrijven is nog niet gebouwd.')}</p>
        <ul className='agv-abonnementen'>
          {(data?.abonnementen.caldav || []).map((r) => (
            <li key={r.id} data-agenda-caldav={r.id} data-agenda-caldav-staat={r.laatsteStaat}>
              <div><strong>{r.naam || r.adres}</strong><small>{r.gebruikersnaam} · {tr(lang, `календарів: ${r.agendas.length} · подій: ${r.aantal}`, `agenda’s: ${r.agendas.length} · afspraken: ${r.aantal}`)}</small><small data-agenda-caldav-schrijven={String(r.schrijven)}>{tr(lang, 'запис: не реалізовано', 'schrijven: niet gebouwd')}</small>{r.fout ? <small className='agv-fouttekst'>{foutCodeTekst(r.fout, lang)}</small> : null}</div>
              <span className='agv-rij-acties'>
                <button type='button' className='agv-icoonknop' onClick={() => void doe(r.id, () => client.caldavVernieuwen(r.id))} aria-label={tr(lang, 'Оновити', 'Verversen')}><RefreshCw aria-hidden='true' className={bezig === r.id ? 'agv-draai' : ''} /></button>
                {wis === r.id
                  ? <><button type='button' className='agv-knop is-gevaar' onClick={() => { setWis(''); void doe(r.id, () => client.caldavVerwijderen(r.id)); }} data-agenda-caldav-verwijderen={r.id}>{tr(lang, 'Так, видалити', 'Ja, verwijderen')}</button><button type='button' className='agv-tekstknop' onClick={() => setWis('')}>{tr(lang, 'Ні', 'Nee')}</button></>
                  : <button type='button' className='agv-icoonknop' onClick={() => setWis(r.id)} aria-label={tr(lang, 'Видалити підключення', 'Koppeling verwijderen')}><Trash2 aria-hidden='true' /></button>}
              </span>
            </li>
          ))}
        </ul>
        <div className='agv-knoppenrij'><button type='button' className='agv-knop' onClick={() => setIcloud(true)} data-agenda-icloud-open='1'>{tr(lang, 'Підключити iCloud', 'iCloud koppelen')}</button></div>
        <details className='agv-uitleg' open={deel === 'caldav' || undefined}><summary>{tr(lang, 'Інший сервіс CalDAV (Fastmail, Nextcloud…)', 'Andere CalDAV-dienst (Fastmail, Nextcloud…)')}</summary>
          <DavVorm lang={lang} onKlaar={onVerversen} />
        </details>
        {data?.caldavSchrijvenOntbreekt?.length ? (
          <details className='agv-uitleg'><summary>{tr(lang, 'Чого бракує для запису', 'Wat er voor schrijven ontbreekt')}</summary>
            <ul>{data.caldavSchrijvenOntbreekt.map((r, i) => <li key={i} data-agenda-caldav-ontbreekt={String(i)}>{lang === 'uk' ? r[0] : r[1]}</li>)}</ul>
          </details>
        ) : null}
      </section>

      <details className='agv-uitleg agv-alle' open={deel === 'alle' || undefined} data-agenda-v3-alle='1'><summary>{tr(lang, 'Усі сервіси', 'Alle diensten')}</summary>
        <ul className='agv-catalogus'>
          {AGENDA_AANBIEDERS.map((a) => {
            const st = agendaKaartStand(a, gekoppeld);
            return (
              <li key={a.id} data-agenda-aanbieder={a.id} data-agenda-stand={st}>
                <div><strong>{a.naam}</strong><small>{agendaTekst(AGENDA_RICHTING_LABEL[a.richting], lang)}{st === 'binnenkort' ? tr(lang, ' · ще не реалізовано', ' · nog niet gebouwd') : st === 'verbonden' ? tr(lang, ' · підключено', ' · gekoppeld') : ''}</small>
                  {a.viaIcs ? <small>{agendaTekst(a.viaIcs, lang)}</small> : null}</div>
                <a className='agv-icoonknop' href={a.site} target='_blank' rel='noreferrer' aria-label={`${a.naam}: ${tr(lang, 'про сервіс', 'over de dienst')}`}><ExternalLink aria-hidden='true' /></a>
              </li>
            );
          })}
        </ul>
      </details>
      {icloud ? <ICloudVenster lang={lang} onSluit={() => setIcloud(false)} onKlaar={onVerversen} foutTekst={foutCodeTekst} /> : null}
    </Laag>
  );
}
