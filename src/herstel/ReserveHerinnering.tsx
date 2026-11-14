// IDENTITEIT-015 (sleutels-gasten): «Нагадувати про резервний доступ» прямо в «Відновленні». Та сама настройка облікового запису
// (sidebar.meldingen.reserveHerinnering), яку читає сервер (backend/reserve-herinnering.ts) і показує Меню → «Сповіщення в меню».
// Попередження безпеки — типово увімкнене; вимкнення лише через BevestigDialoog із наслідками, увімкнення — одразу.
// Вигляд без сховища (його рендерять модульні тести); прив'язку до сховища дає ReserveHerinneringKoppeling (лінивий імпорт).
// Weergave zonder opslag; de koppeling aan de voorkeurenwinkel staat apart (lazy), zodat node-tests zonder venster werken.
import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { BevestigDialoog } from '../platform/BevestigDialoog';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export function ReserveHerinneringWeergave({ lang, aan, onZet }: { lang: Lang; aan: boolean; onZet: (aan: boolean) => void }) {
  const [vraag, setVraag] = useState(false);
  return <div className='access-plane-box herstel-herinnering' data-herstel-herinnering={aan ? 'aan' : 'uit'}>
    <label className='zijbalk-schakel' data-meld-schakel='reserve'>
      <input type='checkbox' role='switch' checked={aan} onChange={(e) => { if (e.target.checked) onZet(true); else setVraag(true); }} />
      <span className='zijbalk-schakel-spoor' aria-hidden='true'><i /></span>
      <span><strong><BellRing aria-hidden='true' /> {tr(lang, 'Нагадувати про резервний доступ', 'Herinneren aan reservetoegang')}</strong>
        <small>{aan
          ? tr(lang, 'Увімкнено (типово). Коли після використання залишиться 2 коди відновлення або менше, у центрі сповіщень з’явиться одне нагадування створити нові. Той самий перемикач — у Меню → «Сповіщення в меню».', 'Aan (standaard). Als er na gebruik nog 2 of minder herstelcodes over zijn, verschijnt één herinnering in het meldingencentrum om nieuwe te maken. Dezelfde schakelaar staat in Menu → «Meldingen in het menu».')
          : tr(lang, '! Вимкнено: про останні коди відновлення ви не дізнаєтеся, доки не спробуєте ними скористатися.', '! Uit: u merkt pas dat de laatste herstelcodes op zijn wanneer u er een probeert te gebruiken.')}</small></span>
    </label>
    <BevestigDialoog open={vraag} id='reserve-herinnering-uit' lang={lang} gevaarlijk
      titel={tr(lang, 'Вимкнути нагадування про резервний доступ?', 'Herinnering aan reservetoegang uitzetten?')}
      uitleg={tr(lang, 'Це попередження безпеки: воно підказує створити нові коди, поки ще є чим увійти.', 'Dit is een beveiligingswaarschuwing: ze zegt u nieuwe codes te maken zolang u nog kunt aanmelden.')}
      gevolgen={[
        tr(lang, 'Коли лишиться 2 коди або менше, сповіщення не прийде — на жодному пристрої.', 'Bij 2 of minder codes komt er geen melding — op geen enkel apparaat.'),
        tr(lang, 'Якщо коди закінчаться, а телефон чи ключ загубиться, увійти без них не вийде.', 'Zijn de codes op en raakt de telefoon of sleutel kwijt, dan kunt u zonder codes niet aanmelden.'),
        tr(lang, 'Увімкнути знову можна тут або в Меню → «Сповіщення в меню».', 'Weer aanzetten kan hier of in Menu → «Meldingen in het menu».'),
      ]}
      bevestigTekst={tr(lang, 'Так, вимкнути', 'Ja, uitzetten')}
      onAnnuleer={() => setVraag(false)} onBevestig={() => { setVraag(false); onZet(false); }} />
  </div>;
}
