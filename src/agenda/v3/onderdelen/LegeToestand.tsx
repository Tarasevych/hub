// Eerste gebruik: nog geen enkele agenda gekoppeld. Eén duidelijke hoofdknop «Підключити календар» die het KOPPELVENSTER op
// deze pagina opent (tot 29.10.2026 was dit een link naar cloud.…/google en verloor de mens de agenda), daarnaast «Додати ICS»
// en «Усі сервіси». Geen catalogus vol technische tekst op het hoofdscherm.
import { CalendarPlus } from 'lucide-react';
import { tr, type Lang } from '../tekst';

type Props = { lang: Lang; onKoppel: () => void; onIcs: () => void; onAlle: () => void };
export default function LegeToestand({ lang, onKoppel, onIcs, onAlle }: Props) {
  return (
    <section className='agv-leeg' data-agenda-niet-gekoppeld='1' aria-labelledby='agv-leeg-titel'>
      <span className='agv-leeg-icoon' aria-hidden='true'><CalendarPlus /></span>
      <h2 id='agv-leeg-titel'>{tr(lang, 'Підключіть свій календар', 'Koppel uw agenda')}</h2>
      <p>{tr(lang, 'Google, iPhone (iCloud), Samsung, HONOR, посилання .ics — підключення відкривається тут-таки, нікуди переходити не треба. Нічого не показується, доки сервер не підтвердить підключення.', 'Google, iPhone (iCloud), Samsung, HONOR, een .ics-link — het koppelen opent hier op de pagina, u hoeft nergens heen. Er staat niets, zolang de server de koppeling niet bevestigt.')}</p>
      <div className='agv-knoppenrij'>
        <button type='button' className='agv-knop is-hoofd' onClick={onKoppel} data-agenda-v3-leeg-google='1' data-agenda-v3-koppelen='1'>{tr(lang, 'Підключити календар', 'Agenda koppelen')}</button>
        <button type='button' className='agv-knop' onClick={onIcs} data-agenda-v3-leeg-ics='1'>{tr(lang, 'Додати ICS', 'ICS toevoegen')}</button>
      </div>
      <button type='button' className='agv-tekstknop' onClick={onAlle}>{tr(lang, 'Усі сервіси', 'Alle diensten')}</button>
    </section>
  );
}
