// Налаштування пошти → Безпека → «Відправники»: korte samenvatting + voortgang van de volledige controle van alle adressen, en
// de weg naar «Контакти й відправники» (Пошта → zijmenu), waar de hele lijst met zoeken, filters, bewijs en acties staat.
// (Tot 19.10.2026 stond hier de enige, diep verstopte lijst; die is opgegaan in ContactenWeergave.)
import { BookUser } from 'lucide-react';
import { useEffect } from 'react';
import { contactenApi, openContacten, useScanStand, zetScanStand } from './api';
import ScanPaneel, { bevestigdZin, getal } from './ScanPaneel';
import AfzenderBeeldInstellingen from './AfzenderBeeldInstellingen';
import './afzenders.css';
import './contacten.css';

type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export default function AfzendersBeheer({ lang }: { lang: Lang }) {
  const s = useScanStand();
  useEffect(() => { void contactenApi.scanStatus().then(zetScanStand).catch(() => undefined); }, []);
  return <section id='mail-settings-senders' className='afz-beheer' aria-labelledby='afz-beheer-titel'>
    <header className='afz-beheer-kop'>
      <h2 id='afz-beheer-titel'>{t(lang, 'Перевірка відправників', 'Afzenderverificatie')}</h2>
      <p>{t(lang, 'Ваша власна база адрес (лише для цього акаунта). Перевіреними позначаються лише ті, кого ви підтвердили самі, або офіційні адреси відомих організацій, для яких Gmail підтвердив доставку (DMARC). Повний список із пошуком, фільтрами й доказами — у розділі «Контакти й відправники».', 'Uw eigen database van adressen (alleen voor dit account). Als bevestigd gelden alleen afzenders die u zelf bevestigde, of officiële adressen van bekende organisaties waarvoor Gmail de bezorging bevestigde (DMARC). De volledige lijst met zoeken, filters en bewijs staat in «Contacten en afzenders».')}</p>
    </header>
    <div className='afz-beheer-samenvatting'>
      {s && s.tellers.contacten > 0 && <p className='afz-stil' data-bevestigd>{bevestigdZin(lang, s.tellers.geverifieerd, s.tellers.contacten)} {t(lang, `Підозрілих ${getal(lang, s.tellers.verdacht)} · ви писали ${getal(lang, s.tellers.geschreven)} · офіційних організацій ${getal(lang, s.tellers.officieel)}`, `${getal(lang, s.tellers.verdacht)} verdacht · u schreef ${getal(lang, s.tellers.geschreven)} · ${getal(lang, s.tellers.officieel)} officiële organisaties`)}</p>}
      <button type='button' className='afz-knop afz-knop-hoofd' style={{ justifySelf: 'start' }} onClick={() => void openContacten('', lang)}><BookUser aria-hidden='true' style={{ width: 16, height: 16 }} />{t(lang, 'Відкрити «Контакти й відправники»', '«Contacten en afzenders» openen')}</button>
      {(!s || !s.eersteKlaarOp) && <p className='afz-stil' data-afz-markeringen='wacht'>{t(lang, 'Помаранчеві позначки «не підтверджено» з’являться в списку листів після завершення першої перевірки всіх адрес. Перевірені (✓) і підозрілі (червоні) позначки видно вже зараз.', 'Oranje «niet bevestigd»-markeringen verschijnen in de berichtenlijst pas na de eerste volledige controle van alle adressen. Geverifieerde (✓) en verdachte (rode) markeringen zijn nu al zichtbaar.')}</p>}
    </div>
    <ScanPaneel lang={lang} s={s} />
    <AfzenderBeeldInstellingen lang={lang} />
  </section>;
}
