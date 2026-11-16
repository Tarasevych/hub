// MAILAI-002 (16.11.2026): вибір рушія ШІ для пошти — для людини без технічних знань: одна картка = один спосіб, на ній видно
// куди йде текст, чий ключ, скільки коштує, і одна кнопка «Обрати» або «Що зробити». «Авто» — спершу безкоштовний.
// Motorkeuze: per kaart waar de tekst heen gaat, wiens sleutel, wat het kost; «Авто» kiest eerst gratis.
// MAILAI-004 (16.11.2026, Павло: «виглядає як вікіпедія, а не зручний сервіс»): картка — це один рядок: назва, куди йде текст
// (кількома словами), вартість і одна головна кнопка. Усі подробиці (ключ, ліміти, ціна, що вміє, посилання) — під «Докладніше».
// Compacte kaart: naam, één korte regel, kosten en één hoofdknop; alle details onder «Meer».
import { AlertTriangle, Check, Cpu, Download, ExternalLink, KeyRound, Server, Settings, ShieldCheck, Sparkles, Undo2, Users } from 'lucide-react';
import { useState } from 'react';
import { kiesMotor, MOTOR_AUTO, type LokaalStand, type MotorKaart } from '../../shared/mail-ai-motor';
import { AI_AANBIEDER_BIJ_ID } from '../../shared/ai-aanbieders';
import { aiHrefOplossen } from './ai-staat';
import { openExtensieOpties } from './lokale-motor';
import './motor-kiezer.css';

const KOSTEN: Record<MotorKaart['kosten'], [string, string]> = {
  gratis: ['Безкоштовно', 'Gratis'],
  'gratis-niveau': ['Безкоштовно з лімітом', 'Gratis met limiet'],
  betaald: ['Платно', 'Betaald'],
  eigenaar: ['Для вас безкоштовно', 'Voor u gratis'],
};
const STAAT: Record<MotorKaart['staat'], [string, string]> = {
  klaar: ['Готовий', 'Klaar'],
  instellen: ['Потрібен крок', 'Eén stap nodig'],
  'niet-hier': ['Не на цьому пристрої', 'Niet op dit apparaat'],
  'nog-niet': ['Ще не налаштовано', 'Nog niet ingesteld'],
  akkoord: ['Потрібна ваша згода', 'Uw akkoord nodig'],
  op: ['На сьогодні вичерпано', 'Op voor vandaag'],
};

function Icoon({ k }: { k: MotorKaart }) {
  if (k.soort === 'lokaal') return <Cpu size={15} aria-hidden='true' />;
  if (k.soort === 'eigen-server') return <Server size={15} aria-hidden='true' />;
  if (k.soort === 'dienst-eigenaar') return <Users size={15} aria-hidden='true' />;
  return <KeyRound size={15} aria-hidden='true' />;
}

/** Куди йде текст — кількома словами (повний шлях лишається під «Докладніше»). */
function kort(k: MotorKaart, nl: boolean): string {
  const wie = k.aanbieder ? (nl ? AI_AANBIEDER_BIJ_ID[k.aanbieder].naamNl : AI_AANBIEDER_BIJ_ID[k.aanbieder].naamUk) : '';
  if (k.soort === 'lokaal') return nl ? 'Op deze computer — de tekst gaat nergens heen' : 'На цьому комп’ютері — текст нікуди не йде';
  if (k.soort === 'sleutel') return nl ? 'Met uw eigen sleutel bij de aanbieder' : 'Вашим власним ключем у постачальника';
  if (k.soort === 'dienst-eigenaar') return nl ? `Gedeelde motor: naar ${wie || 'de aanbieder'}, met de sleutel van de site` : `Спільний рушій: до ${wie || 'постачальника'}, ключем сайту`;
  if (k.soort === 'eigen-server') return nl ? `${k.dienst ? 'Gedeelde motor: op' : 'Op'} de server van de site, geen AI-bedrijf` : `${k.dienst ? 'Спільний рушій: на' : 'На'} сервері сайту, без ШІ-компаній`;
  return nl ? 'Vertaaldienst zonder AI' : 'Служба перекладу без ШІ';
}

export default function MotorKiezer({ nl, kaarten, voorkeur, onKies, lokaal, onAkkoord }: {
  nl: boolean; kaarten: readonly MotorKaart[]; voorkeur: string; onKies: (id: string) => void; lokaal: LokaalStand;
  /** MAILAI-003: згода на спільний рушій сайту (або її відкликання). Кидає помилку, якщо зберегти не вдалося. */
  onAkkoord?: (dienstId: string, aan: boolean) => Promise<void>;
}) {
  const t = (uk: string, nlTekst: string) => (nl ? nlTekst : uk);
  const [akkoordBezig, setAkkoordBezig] = useState('');
  const [akkoordFout, setAkkoordFout] = useState('');
  const akkoord = async (id: string, aan: boolean) => {
    if (!onAkkoord || akkoordBezig) return;
    setAkkoordBezig(id); setAkkoordFout('');
    try { await onAkkoord(id, aan); }
    catch { setAkkoordFout(t('Не вдалося зберегти. Нічого не змінено; спробуйте ще раз.', 'Opslaan is niet gelukt. Er is niets gewijzigd; probeer het opnieuw.')); }
    finally { setAkkoordBezig(''); }
  };
  const auto = kiesMotor(kaarten, MOTOR_AUTO, 'translate');
  const echt = kaarten.filter((k) => k.staat !== 'nog-niet');
  const later = kaarten.filter((k) => k.staat === 'nog-niet');
  const kaart = (k: MotorKaart) => {
    const gekozen = voorkeur === k.id;
    return (
      <li key={k.id} className={`mk-kaart${gekozen ? ' is-gekozen' : ''}`} data-motor={k.id} data-motor-soort={k.soort} data-motor-staat={k.staat}>
        <div className='mk-kop'>
          <span className='mk-icoon'><Icoon k={k} /></span>
          <span className='mk-naam'>
            <strong>{k.dienst ? k.dienst.naam : t(k.naamUk, k.naamNl)}</strong>
            <small className='mk-kort' data-motor-kort>{kort(k, nl)}</small>
          </span>
          <span className='mk-labels'>
            <span className='mk-label' data-kosten={k.kosten}>{t(...KOSTEN[k.kosten])}</span>
            {k.staat !== 'klaar' && <span className='mk-label' data-staat={k.staat}>{t(...STAAT[k.staat])}</span>}
            {k.gebruikUk && k.dienst && <span className='mk-label' data-motor-teller title={t(k.gebruikUk, k.gebruikNl || k.gebruikUk)}>{k.dienst.vandaag}/{k.dienst.limietPerDag}</span>}
          </span>
          <span className='mk-hoofd'>
          {k.dienst && k.staat === 'akkoord' && onAkkoord && (
            <button type='button' className='mk-knop is-hoofd' disabled={akkoordBezig === k.dienst.id} onClick={() => void akkoord(k.dienst!.id, true)} data-motor-akkoord={k.dienst.id}
              title={t('Ви дозволяєте цьому рушієві отримувати текст листа, коли самі натискаєте переклад чи аналіз. Згода діє лише для цього рушія й лише доки адміністратор не змінить, куди йде текст; відкликати можна будь-коли тут само. Запис про згоду з’явиться в центрі сповіщень.', 'U staat deze motor toe de tekst van een bericht te krijgen wanneer u zelf op vertalen of analyseren klikt. Het akkoord geldt alleen voor deze motor en alleen zolang de beheerder niet wijzigt waar de tekst heen gaat; intrekken kan altijd hier. Het akkoord komt in het meldingencentrum.')}>
              <ShieldCheck size={13} aria-hidden='true' />{t('Погоджуюся', 'Ik ga akkoord')}
            </button>
          )}
          {k.staat === 'klaar' && (
            <button type='button' className='mk-knop is-hoofd' aria-pressed={gekozen} onClick={() => onKies(k.id)} data-motor-kies={k.id}
              title={t('Завжди використовувати цей рушій на цьому пристрої. Якщо він чогось не вміє, кнопка цієї функції стане неактивною — текст не піде іншому рушію без вашого вибору.', 'Deze motor altijd gebruiken op dit apparaat. Kan hij iets niet, dan wordt die knop inactief — de tekst gaat niet zonder uw keuze naar een andere motor.')}>
              {gekozen ? <Check size={13} aria-hidden='true' /> : null}{gekozen ? t('Обрано', 'Gekozen') : t('Обрати', 'Kiezen')}
            </button>
          )}
          {k.soort === 'lokaal' && (lokaal === 'site-uit' || lokaal === 'uit' || lokaal === 'model-ontbreekt') && (
            <button type='button' className='mk-knop' onClick={openExtensieOpties} data-motor-actie='opties'
              title={t('Відкриває налаштування розширення на цьому комп’ютері. Перемикач вмикаєте лише ви; повернувшись сюди, стан оновиться сам.', 'Opent de instellingen van de extensie op deze computer. De schakelaar zet alleen u aan; terug hier wordt de stand vanzelf bijgewerkt.')}>
              {lokaal === 'model-ontbreekt' ? <Download size={13} aria-hidden='true' /> : <Settings size={13} aria-hidden='true' />}
              {lokaal === 'model-ontbreekt' ? t('Завантажити модель у розширенні', 'Model downloaden in de extensie') : t('Увімкнути в розширенні', 'Aanzetten in de extensie')}
            </button>
          )}
          {k.soort === 'lokaal' && (lokaal === 'geen-extensie' || lokaal === 'oud') && (
            <a className='mk-knop' href={aiHrefOplossen('/ai', 'extensie')} target='_blank' rel='noreferrer' data-motor-actie='installeren'
              title={t('Сторінка розширення Mijn Ruimte: встановлення й оновлення. Після встановлення поверніться сюди.', 'Pagina van de Mijn Ruimte-extensie: installeren en bijwerken. Kom daarna hier terug.')}>
              <Download size={13} aria-hidden='true' />{lokaal === 'oud' ? t('Оновити розширення', 'Extensie bijwerken') : t('Встановити розширення', 'Extensie installeren')}<ExternalLink size={11} aria-hidden='true' />
            </a>
          )}
          {k.soort === 'sleutel' && k.staat !== 'klaar' && (
            <a className='mk-knop' href={aiHrefOplossen('/ai', 'sleutels')} data-motor-actie='sleutel'><KeyRound size={13} aria-hidden='true' />{t('Додати ключ', 'Sleutel toevoegen')}</a>
          )}
          </span>
        </div>
        <details className='mk-meer' data-motor-meer>
          <summary>{t('Докладніше', 'Meer')}</summary>
        {k.staat !== 'klaar' && <p className='mk-stap'>{k.staat === 'niet-hier' || k.staat === 'nog-niet' ? null : <AlertTriangle size={13} aria-hidden='true' />}{t(k.stapUk, k.stapNl)}</p>}
        <dl className='mk-feiten'>
          <dt>{t('Куди йде текст', 'Waar de tekst heen gaat')}</dt><dd>{t(k.wegUk, k.wegNl)}</dd>
          <dt>{t('Ключ', 'Sleutel')}</dt><dd>{t(k.sleutelUk, k.sleutelNl)}</dd>
          <dt>{t('Вартість і ліміти', 'Kosten en limieten')}</dt><dd>{t(k.kostenUk, k.kostenNl)}</dd>
          {k.prijsUk && <><dt>{t('Орієнтовна ціна', 'Richtprijs')}</dt><dd data-motor-prijs>{t(k.prijsUk, k.prijsNl || k.prijsUk)}</dd></>}
          {k.gebruikUk && <><dt>{t('Використано', 'Gebruikt')}</dt><dd data-motor-gebruik>{t(k.gebruikUk, k.gebruikNl || k.gebruikUk)}</dd></>}
          <dt>{t('Уміє', 'Kan')}</dt><dd>{k.functies.map((f) => t(...FUNCTIE[f])).join(' · ')}</dd>
        </dl>
          <div className='mk-knoppen'>
          {k.dienst && k.dienst.akkoord && onAkkoord && (
            <button type='button' className='mk-knop' disabled={akkoordBezig === k.dienst.id} onClick={() => void akkoord(k.dienst!.id, false)} data-motor-akkoord-weg={k.dienst.id}
              title={t('Цей рушій більше не отримає тексту ваших листів, доки ви не погодитеся знову. Якщо він був обраний, вибір повернеться до «Авто».', 'Deze motor krijgt de tekst van uw berichten niet meer tot u opnieuw akkoord gaat. Was hij gekozen, dan gaat de keuze terug naar «Auto».')}>
              <Undo2 size={13} aria-hidden='true' />{t('Відкликати згоду', 'Akkoord intrekken')}
            </button>
          )}
          {k.bronnen.map((b) => (
            <a key={b.href} className='mk-bron' href={b.href} target='_blank' rel='noreferrer'
              title={t('Офіційна сторінка постачальника: ціни й умови змінюються, тут завжди актуальні.', 'Officiële pagina van de aanbieder: prijzen en voorwaarden veranderen, daar staan ze altijd actueel.')}>
              {t(b.uk, b.nl)}<ExternalLink size={11} aria-hidden='true' />
            </a>
          ))}
          </div>
        </details>
      </li>
    );
  };
  return (
    <div className='mk' data-testid='motor-kiezer'>
      <div className={`mk-auto${voorkeur === MOTOR_AUTO ? ' is-gekozen' : ''}`} data-motor='auto'>
        <Sparkles size={15} aria-hidden='true' />
        <span>
          <strong>{t('Авто: спершу безкоштовний', 'Auto: eerst gratis')}</strong>
          <small>{auto ? t(`Зараз: ${auto.naamUk}`, `Nu: ${auto.naamNl}`) : t('Зараз жоден рушій не готовий — нижче, що зробити.', 'Nu is geen motor klaar — hieronder wat u kunt doen.')}</small>
        </span>
        <button type='button' className='mk-knop' aria-pressed={voorkeur === MOTOR_AUTO} onClick={() => onKies(MOTOR_AUTO)} data-motor-kies='auto'
          title={t('Сайт сам бере найдешевший готовий рушій: локальний ШІ Chrome, потім безкоштовний рівень, потім платний. Що саме використано — завжди видно над результатом.', 'De site neemt zelf de goedkoopste motor die klaar is: lokale AI van Chrome, dan een gratis niveau, dan betaald. Welke het was, staat altijd boven het resultaat.')}>
          {voorkeur === MOTOR_AUTO ? <Check size={13} aria-hidden='true' /> : null}{voorkeur === MOTOR_AUTO ? t('Обрано', 'Gekozen') : t('Обрати', 'Kiezen')}
        </button>
      </div>
      {akkoordFout && <p className='mk-stap' role='alert' data-motor-akkoord-fout><AlertTriangle size={13} aria-hidden='true' />{akkoordFout}</p>}
      <ul className='mk-lijst'>{echt.map(kaart)}</ul>
      {later.length > 0 && (
        <details className='mk-later'>
          <summary>{t('Інші способи (ще не налаштовані)', 'Andere manieren (nog niet ingesteld)')}</summary>
          <ul className='mk-lijst'>{later.map(kaart)}</ul>
        </details>
      )}
    </div>
  );
}

const FUNCTIE: Record<string, [string, string]> = {
  translate: ['переклад', 'vertaling'],
  summary: ['підсумок', 'samenvatting'],
  purpose: ['що це за документ', 'wat voor document'],
  context: ['контекст і зв’язки', 'context en verbanden'],
  acties: ['«Що від вас потрібно?»', '«Wat wordt er van u verwacht?»'],
};
