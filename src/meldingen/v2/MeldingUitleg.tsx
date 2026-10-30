// UI-014 (vlag meldingen-uitleg-v3): de uitleg ín de geopende kaart — wie, wat, wanneer, waarom, gevolg, wat te doen, rechten — en
// de snelle acties van de soort (shared/meldingen-v2/uitleg-register.ts). Gevaarlijke acties openen alleen de pagina waar de
// bestaande bevestiging/step-up geldt, en vragen hier eerst «Точно?». Niets gebeurt automatisch.
import { useState } from 'react';
import { AlarmClock, BellOff, Check, ExternalLink, ShieldAlert, UserCheck } from 'lucide-react';
import { ALGEMENE_ACTIES, absoluteTijd, objectVan, redenVan, uitlegVoor, wieVan, type UitlegActie } from '../../../shared/meldingen-v2/uitleg-register';
import type { V2Groep } from '../../../shared/meldingen-v2/groepering';

type Lang = 'uk' | 'nl';
export type UitlegProps = {
  lang: Lang; groep: V2Groep; nu: number; beschermd: boolean;
  onGelezen: () => void; onLater: () => void; onTypeStil: () => void;
};
/** UI-014 fase 2A: «Це був я» bij «новий пристрій» markeert het apparaat ook op de server als bekend (stil bij fout). */
export function apparaatBekend(link?: string): void {
  const id = /[?&]apparaat=([0-9a-f-]{36})/i.exec(String(link || ''))?.[1];
  if (!id || typeof fetch !== 'function') return;
  void fetch('/api/meldingen/apparaat-bekend', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => undefined);
}
const RISICO: Record<string, [string, string]> = { laag: ['Низький ризик', 'Laag risico'], midden: ['Середній ризик', 'Middel risico'], hoog: ['Важливо для безпеки', 'Belangrijk voor de beveiliging'] };

export default function MeldingUitleg(p: UitlegProps) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const tw = (x: readonly [string, string]) => (p.lang === 'uk' ? x[0] : x[1]);
  const m = p.groep.hoofd, u = uitlegVoor(m);
  const [bevestig, setBevestig] = useState<string | null>(null);
  const onbekend = t('джерело не передало', 'niet door de bron opgegeven');
  const wie = wieVan(m), wat = objectVan(m), reden = redenVan(m);
  const rijen: Array<[string, string, string?]> = [
    [t('Хто', 'Wie'), wie || onbekend, wie ? undefined : 'is-leeg'],
    [t('Що', 'Wat'), wat ? `${tw(u.wat)} — «${wat}»` : tw(u.wat)],
    [t('Коли', 'Wanneer'), `${absoluteTijd(m.tijd, p.lang)} (${t('Брюссель', 'Brussel')})${m.eind ? ` · ${t('діє до', 'geldig tot')} ${absoluteTijd(Date.parse(m.eind), p.lang)}` : ''}`],
    [t('Чому', 'Waarom'), reden ? `«${reden}»` : tw(u.waarom)],
    [t('Що це означає', 'Gevolg'), tw(u.gevolg)],
    ...(u.rechten ? [[t('Права й спосіб', 'Rechten en methode'), tw(u.rechten)] as [string, string]] : []),
    [t('Що зробити', 'Wat te doen'), tw(u.doen)],
  ];
  const actie = (a: UitlegActie) => {
    const key = `${a.soort}-${a.label[0]}`;
    if (a.href) {
      const href = a.href(m) || u.deeplink(m);
      if (a.gevaarlijk && bevestig !== key) return <button key={key} type='button' className='mv2u-actie is-gevaar' onClick={() => setBevestig(key)}><ShieldAlert aria-hidden='true' />{tw(a.label)}</button>;
      return <a key={key} className={`mv2u-actie${a.gevaarlijk ? ' is-gevaar is-bevestigd' : ''}`} href={href} onClick={p.onGelezen}>{a.gevaarlijk ? <ShieldAlert aria-hidden='true' /> : <ExternalLink aria-hidden='true' />}{a.gevaarlijk ? t('Так, відкрити сторінку підтвердження', 'Ja, bevestigingspagina openen') : tw(a.label)}</a>;
    }
    if (a.soort === 'type-stil') return p.beschermd ? null : <button key={key} type='button' className='mv2u-actie' onClick={p.onTypeStil}><BellOff aria-hidden='true' />{tw(a.label)}</button>;
    if (a.soort === 'later') return <button key={key} type='button' className='mv2u-actie' onClick={p.onLater}><AlarmClock aria-hidden='true' />{tw(a.label)}</button>;
    if (a.soort === 'dit-was-ik') return <button key={key} type='button' className='mv2u-actie' onClick={() => { apparaatBekend(m.link); p.onGelezen(); }}><UserCheck aria-hidden='true' />{tw(a.label)}</button>;
    return <button key={key} type='button' className='mv2u-actie' onClick={p.onGelezen}><Check aria-hidden='true' />{tw(a.label)}</button>;
  };
  return (
    <div className='mv2u' data-soort={u.id} data-risico={u.risico}>
      <p className={`mv2u-risico r-${u.risico}`}>{tw(RISICO[u.risico])}</p>
      <dl className='mv2u-velden'>{rijen.map(([k, v, c]) => <div key={k} className={c}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {bevestig ? <p className='mv2u-let' role='status'>{t('Дію буде виконано лише на сторінці з підтвердженням (passkey). Тут нічого не змінюється.', 'De actie gebeurt alleen op de pagina met bevestiging (passkey). Hier verandert niets.')}</p> : null}
      <div className='mv2u-acties' role='group' aria-label={t('Швидкі дії', 'Snelle acties')}>{[...u.acties, ...ALGEMENE_ACTIES.filter((a) => a.soort !== 'gelezen' || p.groep.ongelezen)].map(actie)}</div>
    </div>
  );
}
