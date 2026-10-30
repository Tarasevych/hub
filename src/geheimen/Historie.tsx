// Lijst met gebeurtenissen rond geheimen (wie · wat · wanneer · hoe bevestigd). Gebruikt op de detailpagina van een geheim en in het
// tabblad «Журнал дій». De gegevens komen uit het auditlogboek; er staat nooit een waarde in.
import { Eye, FilePlus2, KeyRound, Pencil, RefreshCcw, Trash2, CalendarClock, CircleHelp, ShieldX, LayoutList } from 'lucide-react';
import type { ComponentType } from 'react';
import { ACTIE_NAAM, type GeheimActie, type GeheimGebeurtenis } from '../../shared/geheimen';
import { datumTijd, geleden, initialen, kies, tr, type Lang } from './hulp';

const ICOON: Record<GeheimActie, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  aangemaakt: FilePlus2, vervangen: RefreshCcw, hernoemd: Pencil, termijn: CalendarClock, getoond: Eye, verwijderd: Trash2, geweigerd: ShieldX, bekeken: LayoutList, overig: CircleHelp,
};
const METHODE: Record<string, readonly [string, string]> = {
  passkey: ['passkey', 'passkey'], totp: ['код із застосунку', 'app-code'], herstelcode: ['код відновлення', 'herstelcode'], google: ['Google', 'Google'],
};

export function Avatar({ wie, grootte = 34 }: { wie: GeheimGebeurtenis['wie']; grootte?: number }) {
  return (
    <span className='gm-avatar' style={{ width: grootte, height: grootte, fontSize: grootte * 0.38 }} title={wie.email || wie.naam}>
      {wie.foto ? <img src={wie.foto} alt='' referrerPolicy='no-referrer' loading='lazy' width={grootte} height={grootte} /> : <b aria-hidden='true'>{initialen(wie.naam, wie.email)}</b>}
    </span>
  );
}

export function Historie({ lang, items, metNaam = true, leeg }: { lang: Lang; items: readonly GeheimGebeurtenis[]; metNaam?: boolean; leeg?: string }) {
  if (!items.length) return <p className='gm-leeg'>{leeg ?? tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</p>;
  return (
    <ol className='gm-historie' data-gm-historie>
      {items.map((e) => {
        const Icoon = ICOON[e.actie] ?? KeyRound;
        const mislukt = e.resultaat && e.resultaat !== 'success';
        return (
          <li key={e.id} data-actie={e.actie} data-mislukt={mislukt ? '' : undefined}>
            <span className='gm-historie-icoon' aria-hidden='true'><Icoon aria-hidden /></span>
            <Avatar wie={e.wie} grootte={30} />
            <div className='gm-historie-tekst'>
              <p>
                <b>{e.wie.naam || e.wie.email || tr(lang, 'Невідомий', 'Onbekend')}</b> · {kies(lang, ACTIE_NAAM[e.actie])}
                {metNaam && e.naam ? <> · <code>{e.naam}</code></> : null}
                {mislukt ? <em> · {tr(lang, 'відхилено', 'geweigerd')}</em> : null}
              </p>
              <small>
                <time dateTime={new Date(e.at).toISOString()} title={datumTijd(e.at, lang)}>{geleden(e.at, lang)} · {datumTijd(e.at, lang)}</time>
                {e.methode ? <> · {tr(lang, 'підтверджено: ', 'bevestigd met ')}{METHODE[e.methode] ? kies(lang, METHODE[e.methode]) : e.methode}</> : null}
                {e.apparaat ? <> · {e.apparaat}</> : null}
                {e.info ? <> · {e.info}</> : null}
              </small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
