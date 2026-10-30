// «Обірвані спроби» — elke poging die NIET tot een installatie kwam, met de etappe waar het stokte (eigenaar 20.10.2026).
//
// Waarom deze lijst bestaat: brak het uploaden af in de browser (bv. NotReadableError — het gekozen bestand was verplaatst of lag
// «op aanvraag» in een cloudmap), dan bleef er in de geschiedenis NIETS over; alleen de tweede, geslaagde poging was te zien.
// Nu meldt het tabblad elke afbreking (backend/uitrol-pogingen.ts) en staat ze hier: versie, stand, ETAPPE, percentage, reden in
// mensentaal, tijd en wie het voorbereidde — plus de actie die écht mogelijk is («Продовжити» of «Почати заново»).
//
// Twee dingen worden nooit verward:
//   * «повідомлено браузером» (gemeldDoor = 'browser') tegenover wat de server zelf vaststelde;
//   * een BEKENDE reden tegenover «обірвано без причини» (redenBekend = false) — die laatste krijgt een eigen merkteken.
// De redenteksten komen uit de enige bron (shared/uitrol-pogingen.ts → shared/foutuitleg.ts + shared/uitrol-codes.ts).
import { AlertTriangle, Globe, HelpCircle, PlayCircle, RotateCcw, Server, UserCheck } from 'lucide-react';
import { etappeTekst, pogingActie, pogingOorzaak, type PogingUit } from '../../shared/uitrol-pogingen';
import { datum, mb, tr, type Lang } from './types';

type Props = {
  lang: Lang;
  pogingen: PogingUit[];
  /** Naar de wizard «Нове оновлення»; `hervat` = er staat nog een deel op de server, dus verder gaan waar het stopte. */
  naarUpload?: (hervat: boolean) => void;
  /** Compacte vorm (het blok onder «Останні розгортання»): zonder eigen kaartkop. */
  compact?: boolean;
};

export default function Pogingen({ lang, pogingen, naarUpload, compact = false }: Props) {
  if (!pogingen.length) return null;
  const rijen = <ul className='ut-lijst ut-pogingen' data-ut-pogingen={pogingen.length}>
    {pogingen.map((p) => {
      const oorzaak = pogingOorzaak(lang, p.code, p.redenBekend);
      const actie = pogingActie(p);
      return <li key={p.id} data-staat='afgebroken' data-bron={p.gemeldDoor} data-zeker={oorzaak.zeker ? 'ja' : 'nee'}>
        <span className='ut-poging-kop'>
          <b className='ut-mono'>{p.versie || tr(lang, 'версія невідома', 'versie onbekend')}</b>
          <i className='ut-badge' data-staat='afgebroken'>{tr(lang, 'Обрив', 'Afgebroken')}</i>
          <i className='ut-badge ut-poging-etappe' data-etappe={p.etappe}>{tr(lang, 'Етап: ', 'Etappe: ')}{etappeTekst(lang, p.etappe)}</i>
          {p.bytes > 0 && <i className='ut-badge ut-poging-pct' data-pct={p.procent}>{p.procent}% · {mb(p.verstuurd)} / {mb(p.bytes)}</i>}
          <i className='ut-badge ut-poging-bron' title={p.gemeldDoor === 'browser'
            ? tr(lang, 'Цей запис надіслав браузер — сервер цього обриву сам не бачив.', 'Deze regel kwam van de browser — de server zag deze afbreking zelf niet.')
            : tr(lang, 'Це встановив сам сервер.', 'Dit stelde de server zelf vast.')}>
            {p.gemeldDoor === 'browser' ? <><Globe aria-hidden='true' />{tr(lang, 'повідомлено браузером', 'door de browser gemeld')}</> : <><Server aria-hidden='true' />{tr(lang, 'виявлено сервером', 'door de server vastgesteld')}</>}
          </i>
          {!oorzaak.zeker && <i className='ut-badge ut-poging-onbekend' data-staat='mislukt'><HelpCircle aria-hidden='true' />{tr(lang, 'без причини', 'zonder reden')}</i>}
        </span>
        <span className='ut-poging-reden ut-reden'>
          <AlertTriangle aria-hidden='true' />
          <span><b>{oorzaak.waarom}</b>{oorzaak.doen ? <> {oorzaak.doen}</> : null}
            <small className='ut-sub'>{datum(lang, p.tijd)}
              {p.poging > 1 ? ` · ${tr(lang, `спроба ${p.poging}`, `poging ${p.poging}`)}` : ''}
              {p.voorbereider ? <> · <UserCheck aria-hidden='true' />{tr(lang, 'Підготував: ', 'Voorbereid door: ')}{p.voorbereider}</> : null}
              {p.bestand ? ` · ${p.bestand}` : ''}
              {` · ${tr(lang, 'код', 'code')} ${p.code}`}</small></span>
        </span>
        {naarUpload && <span className='ut-poging-acties'>
          {actie === 'hervatten'
            ? <button type='button' className='ut-knop ut-knop-primair' data-ut-poging-hervat onClick={() => naarUpload(true)}><PlayCircle aria-hidden='true' />{tr(lang, 'Продовжити', 'Hervatten')}</button>
            : <button type='button' className='ut-knop' data-ut-poging-opnieuw onClick={() => naarUpload(false)}><RotateCcw aria-hidden='true' />{tr(lang, 'Почати заново', 'Opnieuw beginnen')}</button>}
        </span>}
      </li>;
    })}
  </ul>;

  if (compact) return <div className='ut-pogingen-blok' data-ut-pogingen-compact>
    <h3 className='ut-wiz-onderkop'>{tr(lang, 'Обірвані спроби', 'Afgebroken pogingen')}</h3>
    <p className='ut-sub'>{tr(lang, 'Спроби, що не дійшли до встановлення: на якому етапі обірвалося, на скількох відсотках і чому.', 'Pogingen die niet tot een installatie kwamen: op welke etappe het stokte, op hoeveel procent en waarom.')}</p>
    {rijen}
  </div>;

  return <section className='ut-kaart' data-ut-pogingen-kaart aria-labelledby='ut-pogingen-titel'>
    <header className='ut-kaart-kop'><div><h2 id='ut-pogingen-titel'>{tr(lang, 'Обірвані спроби', 'Afgebroken pogingen')}</h2>
      <p className='ut-sub'>{tr(lang, 'Кожна спроба лишає слід — навіть та, що обірвалася у браузері до першого байта на сервері. Видно етап, відсоток і причину; де можливо — «Продовжити» з місця зупинки.', 'Elke poging laat een spoor na — ook die in de browser afbrak vóór de eerste byte naar de server. Etappe, percentage en reden zijn te zien; waar het kan: «Hervatten» waar het stopte.')}</p></div></header>
    {rijen}
  </section>;
}
