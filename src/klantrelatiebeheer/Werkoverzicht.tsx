import type { ReactNode } from 'react';
import { BriefcaseBusiness, CalendarDays, Check, Circle, Euro, Flag, ListChecks, MessageSquare, NotebookPen, UsersRound } from 'lucide-react';
import { FASEN, type Contactmoment, type Klantoverzicht, type Vervolgtaak } from '../../shared/klantrelatiebeheer';
import { dag, faseNamen, geld, kanaalNaam, plaatselijkeDag, tekst, type Taal } from './relatietaal';

type Gemeen = { lang: Taal };
type Werk = Gemeen & {
  overzicht: Klantoverzicht;
  naarTab: (naam: string) => void;
  naarKlant: (id: string) => void;
  afronden: (taak: Vervolgtaak) => void;
  bezig: boolean;
};
export function Kader({ titel, extra, children }: { titel: string; extra?: ReactNode; children: ReactNode }) {
  return <section className="kr-kader"><header className="kr-kaderkop"><h3>{titel}</h3>{extra}</header>{children}</section>;
}
export function Leeg({ children }: { children: ReactNode }) {
  return <p className="kr-leeg">{children}</p>;
}
export function eerstvolgende(a: Vervolgtaak, b: Vervolgtaak) {
  return Number(a.klaar) - Number(b.klaar) || (a.datum || '9999').localeCompare(b.datum || '9999') || b.aangemaakt - a.aangemaakt;
}
export function Takenlijst({ lang, taken, overzicht, naarKlant, afronden, bezig }: Omit<Werk, 'naarTab'> & { taken: Vervolgtaak[] }) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const vandaag = plaatselijkeDag();
  if (!taken.length) return <Leeg>{t('Завдань поки немає.', 'Er zijn nog geen taken.')}</Leeg>;
  return <ul className="kr-rijen">{taken.map(taak => {
    const naam = overzicht.klanten.find(k => k.id === taak.klantId)?.naam;
    const klaarTekst = t('Позначити виконаним', 'Afronden') + ' · ' + taak.titel;
    return <li className="kr-taak" key={taak.id}>
      {taak.klaar ? <span className="kr-voltooid" aria-label={t('Виконано', 'Afgerond')}><Check size={18}/></span> :
        overzicht.magSchrijven ? <button type="button" className="kr-afronden" title={klaarTekst} aria-label={klaarTekst} disabled={bezig} onClick={() => afronden(taak)}><Circle size={20}/></button> : <Circle size={18} aria-hidden="true"/>}
      <div className="kr-rijtekst"><strong>{taak.titel}</strong>{naam && <button type="button" className="kr-tekstknop" onClick={() => naarKlant(taak.klantId)}>{naam}</button>}</div>
      {taak.datum && <span className={'kr-datum' + (!taak.klaar && taak.datum < vandaag ? ' kr-vervallen' : '')}>
        {!taak.klaar && taak.datum < vandaag && <span>{t('Прострочено', 'Verlopen')} · </span>}{dag(lang, taak.datum)}</span>}
    </li>;
  })}</ul>;
}
export function Tijdlijn({ lang, momenten, overzicht, naarKlant }: Gemeen & { momenten: Contactmoment[]; overzicht: Klantoverzicht; naarKlant?: (id: string) => void }) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  if (!momenten.length) return <Leeg>{t('Тут з’являться листи, розмови й домовленості, записані для клієнта.', 'Hier verschijnen vastgelegde berichten, gesprekken en afspraken.')}</Leeg>;
  return <ol className="kr-tijdlijn">{momenten.map(m => {
    const naam = overzicht.klanten.find(k => k.id === m.klantId)?.naam;
    return <li key={m.id}><span className="kr-tijdpunt" aria-hidden="true">{m.kanaal === 'notitie' ? <NotebookPen size={16}/> : <MessageSquare size={16}/>}</span>
      <div><div className="kr-momentkop"><strong>{kanaalNaam(lang, m.kanaal)}</strong>{naarKlant && naam && <button type="button" className="kr-tekstknop" onClick={() => naarKlant(m.klantId)}>{naam}</button>}</div>
        <p>{m.tekst}</p><small>{dag(lang, m.aangemaakt)}{m.minuten > 0 ? ' · ' + m.minuten + ' ' + t('хв', 'min') : ''}</small>
      </div></li>;
  })}</ol>;
}
export function Faseoverzicht({ lang, overzicht }: Gemeen & { overzicht: Klantoverzicht }) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const aantallen = FASEN.map(fase => overzicht.kansen.filter(k => k.fase === fase).length);
  const maximum = Math.max(1, ...aantallen);
  return <ol className="kr-fasen">{FASEN.map((fase, i) => {
    const som = overzicht.kansen.filter(k => k.fase === fase).reduce((bedrag, k) => bedrag + k.centen, 0);
    return <li key={fase}><div><span className={'kr-fasestip kr-' + fase} aria-hidden="true"/><strong>{t(...faseNamen[fase])}</strong></div>
      <div className="kr-baan" aria-hidden="true"><i className={'kr-' + fase} style={{ width: (aantallen[i] / maximum * 100) + '%' }}/></div>
      <span>{aantallen[i]}</span><small>{geld(lang, som)}</small></li>;
  })}</ol>;
}
export function Kerncijfers({ lang, overzicht }: Gemeen & { overzicht: Klantoverzicht }) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const open = overzicht.kansen.filter(k => k.fase !== 'gewonnen' && k.fase !== 'verloren');
  const blokken = [
    { naam: t('Клієнти', 'Klanten'), getal: overzicht.klanten.length, Teken: UsersRound },
    { naam: t('Угоди в роботі', 'Open verkoopkansen'), getal: open.length, Teken: BriefcaseBusiness },
    { naam: t('Вартість відкритих угод', 'Waarde open kansen'), getal: geld(lang, open.reduce((s, k) => s + k.centen, 0)), Teken: Euro },
    { naam: t('Відкриті завдання', 'Open taken'), getal: overzicht.taken.filter(k => !k.klaar).length, Teken: ListChecks },
  ];
  return <dl className="kr-cijfers">{blokken.map(({ naam, getal, Teken }) => <div key={naam}><dt><Teken size={19} aria-hidden="true"/>{naam}</dt><dd>{getal}</dd></div>)}</dl>;
}
export default function Werkoverzicht(e: Werk) {
  const { lang, overzicht, naarTab } = e;
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const taken = overzicht.taken.filter(k => !k.klaar).sort(eerstvolgende).slice(0, 5);
  const momenten = [...overzicht.momenten].sort((a, b) => b.aangemaakt - a.aangemaakt).slice(0, 4);
  return <>
    <Kerncijfers lang={lang} overzicht={overzicht}/>
    <div className="kr-tweekolom"><Kader titel={t('Рух угод', 'Verloop van verkoopkansen')} extra={<Flag size={19} aria-hidden="true"/>}>
      <Faseoverzicht lang={lang} overzicht={overzicht}/>
      <button type="button" className="kr-meer" onClick={() => naarTab('overeenkomsten')}>{t('Переглянути угоди', 'Verkoopkansen bekijken')}</button>
    </Kader>
    <Kader titel={t('Найближчі завдання', 'Eerstvolgende taken')} extra={<CalendarDays size={19} aria-hidden="true"/>}>
      <Takenlijst {...e} taken={taken}/><button type="button" className="kr-meer" onClick={() => naarTab('taken')}>{t('Переглянути завдання', 'Taken bekijken')}</button>
    </Kader></div>
    <Kader titel={t('Останні взаємодії', 'Recente contacten')}><Tijdlijn lang={lang} overzicht={overzicht} momenten={momenten} naarKlant={e.naarKlant}/></Kader>
  </>;
}
