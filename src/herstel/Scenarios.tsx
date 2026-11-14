// IDENTITEIT-014 (фаза 3): «Що робити, якщо…» (id herstel-scenarios) і «Наслідки втрати ключа» (id herstel-sleutelverlies).
// Розгортні покрокові картки: утрачено пристрій, утрачено ключ доступу, недоступний автентифікатор (кнопка «Немає доступу» →
// наявний totpUitschakelen: сервер приймає код відновлення облікового запису, пише аудит і сповіщення «TOTP вимкнено»),
// закінчилися коди (банер, коли набір був, а чинних кодів 0). Тексти розводять код облікового запису й код сховища ключів
// (KLUIS_TEKST.tweeCodes). Нових маршрутів немає — лише наявні дії контролера AccessPlaneView.
// Stapsgewijze kaarten voor herstel; «Geen toegang» gebruikt de bestaande totpUitschakelen (herstelcode van het account).
// IDENTITEIT-015 (sleutels-gasten): кожен крок, що веде до дії в іншому місці, має кнопку переходу ТОЧНО туди (#aanmeldmethoden-passkeys,
// -2fa, -sleutelkluis; «Додати новий passkey» одразу відкриває форму). Перемикач «Нагадувати про резервний доступ» — тут же (та сама
// настройка облікового запису, що й у Меню → «Сповіщення в меню»; типово увімкнено, вимкнення — лише через вікно з наслідками;
// вигляд — ReserveHerinnering.tsx, прив'язка до сховища — лінива ReserveHerinneringKoppeling.tsx).
import { Suspense, lazy, useState, type ReactNode } from 'react';
import { ArrowRight, KeyRound, LifeBuoy, Plus, RefreshCw, Smartphone, SmartphoneNfc, Unlock } from 'lucide-react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { gaNaarAnker, vraagPasskeyFormulier } from './naar-anker';
import { InfoTip } from '../InfoTip';
import { KLUIS_FOUT, KLUIS_TEKST } from '../../shared/sleutelkluis';
import type { SnapshotLike } from '../aanmeld-vnext/snapshotNaarKaarten';
import { codesOp, type HerstelSectie, type KluisKern, type Paar } from './reserve';
import { useKluisKern } from './useKluisKern';
import './herstel.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
const t2 = (lang: Lang, t: { uk: string; nl: string }) => (lang === 'nl' ? t.nl : t.uk);

type WeergaveProps = {
  lang: Lang;
  data: SnapshotLike;
  kluis: KluisKern | null | undefined;
  busy: boolean;
  onKies: (sectie: HerstelSectie) => void;
  totpUitschakelen: () => Promise<void>;
  nieuweHerstelcodes: () => Promise<void>;
  /** IDENTITEIT-015: перемикач «Нагадувати про резервний доступ» (ReserveHerinneringWeergave) — обгортка Scenarios дає прив'язаний. */
  herinnering?: ReactNode;
};

function Kaart({ id, icoon, titel, open, children }: { id: string; icoon: ReactNode; titel: string; open?: boolean; children: ReactNode }) {
  return <details className='herstel-kaart' data-scenario={id} open={open}>
    <summary>{icoon}<span>{titel}</span></summary>
    <div className='herstel-kaart-inhoud'>{children}</div>
  </details>;
}
/** Перехід до розділу; з `anker` — ще й до точного блоку в ньому (після появи розділу). `voor` — що зробити перед переходом. */
const Ga = ({ lang, sectie, tekst, onKies, anker, voor, icoon }: { lang: Lang; sectie: HerstelSectie; tekst: Paar; onKies: (s: HerstelSectie) => void; anker?: string; voor?: () => void; icoon?: ReactNode }) =>
  <button type='button' className='secondary herstel-ga' data-ga={sectie} data-ga-anker={anker} onClick={() => { voor?.(); onKies(sectie); if (anker) gaNaarAnker(anker); }}>{icoon}{lang === 'nl' ? tekst[1] : tekst[0]}{!icoon && <ArrowRight />}</button>;

// Прив'язка перемикача до сховища вподобань — лінива (сховище торкається window під час імпорту).
const ReserveHerinneringKoppeling = lazy(() => import('./ReserveHerinneringKoppeling'));

/** Вигляд без запитів (його рендерять модульні тести). */
export function ScenariosWeergave({ lang, data, kluis, busy, onKies, totpUitschakelen, nieuweHerstelcodes, herinnering }: WeergaveProps) {
  const [geenToegang, setGeenToegang] = useState(false);
  const totpAan = Boolean(data.totp.enrolled || data.factors.find((f) => f.id === 'totp')?.enrolled);
  const rest = Number(data.factors.find((f) => f.id === 'recovery')?.remaining) || 0;
  const op = codesOp(data);
  const kluisAan = !!kluis && kluis.stand !== 'uit';
  const kluisRegel = kluisAan
    ? tr(lang, 'Ключ зашифрованих даних на новому пристрої відкрийте іншим passkey з PRF або кодом відновлення сховища ключів (не кодом облікового запису).', 'Open de sleutel van de versleutelde gegevens op het nieuwe apparaat met een andere passkey met PRF of met de herstelcode van de sleutelkluis (niet met een herstelcode van het account).')
    : tr(lang, 'Шифрування ваших даних не ввімкнено, тож окремо відкривати ключ не потрібно.', 'Versleuteling van uw gegevens staat niet aan, dus een sleutel apart openen is niet nodig.');

  return <>
    <BevestigDialoog open={geenToegang} id='totp-geen-toegang' lang={lang} gevaarlijk bezig={busy}
      titel={tr(lang, 'Вимкнути автентифікатор кодом відновлення?', 'Authenticator uitzetten met een herstelcode?')}
      uitleg={tr(lang, 'У наступному вікні оберіть «Використати код відновлення» і введіть один із кодів відновлення облікового запису (вигляд XXXX-XXXX-XXXX). Код сховища ключів тут не підходить.', 'Kies in het volgende venster «Herstelcode gebruiken» en voer een herstelcode van het account in (vorm XXXX-XXXX-XXXX). De code van de sleutelkluis werkt hier niet.')}
      gevolgen={[
        tr(lang, 'Автентифікатор перестане діяти; коди зі старого застосунку більше не прийматимуться.', 'De authenticator werkt niet meer; codes uit de oude app worden niet meer aanvaard.'),
        tr(lang, `Використаний код відновлення згорить: лишиться ${Math.max(rest - 1, 0)}.`, `De gebruikte herstelcode vervalt: er blijven er ${Math.max(rest - 1, 0)} over.`),
        tr(lang, 'Вам прийде сповіщення безпеки. Потім налаштуйте автентифікатор на новому телефоні в розділі «Безпека».', 'U krijgt een beveiligingsmelding. Stel daarna de authenticator op de nieuwe telefoon in bij «Beveiliging».'),
      ]}
      bevestigTekst={tr(lang, 'Так, вимкнути', 'Ja, uitzetten')}
      onAnnuleer={() => setGeenToegang(false)}
      onBevestig={async () => { setGeenToegang(false); await totpUitschakelen(); }} />

    <section className='access-plane-section herstel-scenarios' id='herstel-scenarios' data-herstel-scenarios tabIndex={-1}>
      <header className='access-plane-section-head'><h2>{tr(lang, 'Що робити, якщо…', 'Wat te doen als…')}</h2>
        <InfoTip label={tr(lang, 'Про два різні коди відновлення', 'Over de twee verschillende herstelcodes')}><p>{t2(lang, KLUIS_TEKST.tweeCodes)}</p></InfoTip></header>

      {/* Банер лише тут (а не в огляді й не в розділі кодів): набір був, а чинних кодів не лишилось. Назва кнопки інша, ніж «Створити коди» розділу кодів. */}
      {op && <div className='herstel-banier' role='alert' data-herstel-codes-op>
        <strong>{tr(lang, 'Коди відновлення закінчилися', 'De herstelcodes zijn op')}</strong>
        <span>{tr(lang, 'Жоден код облікового запису більше не діє. Якщо телефон з автентифікатором загубиться, вимкнути його буде нічим. Нові коди замінять використаний набір.', 'Geen enkele herstelcode van het account werkt nog. Raakt de telefoon met de authenticator zoek, dan is er niets om hem uit te zetten. Nieuwe codes vervangen de opgebruikte set.')}</span>
        <button type='button' disabled={busy} onClick={() => void nieuweHerstelcodes()}><RefreshCw />{tr(lang, 'Створити нові коди', 'Nieuwe codes maken')}</button>
      </div>}

      <div className='herstel-kaarten'>
        <Kaart id='apparaat' icoon={<Smartphone aria-hidden='true' />} titel={tr(lang, 'Втрачено пристрій', 'Apparaat kwijt')}>
          <ol>
            <li>{tr(lang, 'Завершіть сеанси цього пристрою — той, хто його знайде, не опиниться у вашому обліковому записі.', 'Beëindig de sessies van dit apparaat — wie het vindt, komt dan niet in uw account.')} <Ga lang={lang} sectie='sessions' onKies={onKies} tekst={['До сесій і пристроїв', 'Naar sessies en apparaten']} /></li>
            <li>{tr(lang, 'Видаліть passkey цього пристрою — ним більше не можна буде підтвердити дії.', 'Verwijder de passkey van dit apparaat — daarmee kan niemand meer iets bevestigen.')} <Ga lang={lang} sectie='security' anker='aanmeldmethoden-passkeys' onKies={onKies} tekst={['До ключів доступу', 'Naar de toegangssleutels']} /></li>
            <li>{tr(lang, 'Якщо на ньому був застосунок-автентифікатор — див. «Недоступний автентифікатор» нижче.', 'Stond de authenticator-app erop — zie «Authenticator niet bereikbaar» hieronder.')}</li>
            <li>{kluisRegel}{kluisAan && <> <Ga lang={lang} sectie='security' anker='aanmeldmethoden-sleutelkluis' onKies={onKies} tekst={['До сховища ключів', 'Naar de sleutelkluis']} /></>}</li>
          </ol>
        </Kaart>

        <Kaart id='passkey' icoon={<KeyRound aria-hidden='true' />} titel={tr(lang, 'Втрачено ключ доступу (passkey)', 'Toegangssleutel (passkey) kwijt')}>
          <ol>
            <li>{tr(lang, 'Видаліть цей passkey: тоді ним не підтвердить дії ніхто інший.', 'Verwijder deze passkey: dan bevestigt niemand anders er nog iets mee.')} <Ga lang={lang} sectie='security' anker='aanmeldmethoden-passkeys' onKies={onKies} tekst={['До ключів доступу', 'Naar de toegangssleutels']} /></li>
            <li>{tr(lang, 'Важливі дії підтверджуйте іншим способом: кодом із застосунку, кодом відновлення облікового запису або повторним входом через Google.', 'Bevestig belangrijke handelingen op een andere manier: met de app-code, een herstelcode van het account of opnieuw aanmelden via Google.')} <Ga lang={lang} sectie='security' anker='aanmeldmethoden-2fa' onKies={onKies} tekst={['До застосунку-автентифікатора', 'Naar de authenticator-app']} /></li>
            {kluisAan && <li>{tr(lang, 'Якщо цей passkey відкривав ключ даних — відкрийте ключ іншим passkey або кодом відновлення сховища ключів.', 'Opende deze passkey de gegevenssleutel — open de sleutel met een andere passkey of met de herstelcode van de sleutelkluis.')} <small>{t2(lang, KLUIS_TEKST.geenPrf)}</small> <Ga lang={lang} sectie='security' anker='aanmeldmethoden-sleutelkluis' onKies={onKies} tekst={['До сховища ключів', 'Naar de sleutelkluis']} /></li>}
            <li>{tr(lang, 'Додайте новий passkey на пристрої, яким користуєтеся.', 'Voeg een nieuwe passkey toe op het apparaat dat u gebruikt.')} <Ga lang={lang} sectie='security' anker='aanmeldmethoden-passkeys' voor={vraagPasskeyFormulier} icoon={<Plus aria-hidden='true' />} onKies={onKies} tekst={['Додати новий passkey', 'Nieuwe passkey toevoegen']} /></li>
          </ol>
        </Kaart>

        <Kaart id='authenticator' icoon={<SmartphoneNfc aria-hidden='true' />} titel={tr(lang, 'Недоступний автентифікатор', 'Authenticator niet bereikbaar')}>
          {totpAan ? <>
            <ol>
              <li>{tr(lang, 'Натисніть «Немає доступу» й введіть один із кодів відновлення облікового запису (XXXX-XXXX-XXXX), не код сховища ключів.', 'Kies «Geen toegang» en voer een herstelcode van het account in (XXXX-XXXX-XXXX), niet de code van de sleutelkluis.')}</li>
              <li>{tr(lang, 'Автентифікатор вимкнеться, а код згорить. Вам прийде сповіщення безпеки.', 'De authenticator gaat uit en de code vervalt. U krijgt een beveiligingsmelding.')}</li>
              <li>{tr(lang, 'Налаштуйте автентифікатор на новому телефоні в розділі «Безпека».', 'Stel de authenticator op de nieuwe telefoon in bij «Beveiliging».')} <Ga lang={lang} sectie='security' anker='aanmeldmethoden-2fa' onKies={onKies} tekst={['Налаштувати автентифікатор', 'Authenticator instellen']} /></li>
            </ol>
            {rest > 0
              ? <button type='button' className='danger' disabled={busy} data-geen-toegang onClick={() => setGeenToegang(true)}><Unlock />{tr(lang, 'Немає доступу', 'Geen toegang')}</button>
              : <p className='access-plane-warn' data-geen-codes>{tr(lang, 'Кодів відновлення не лишилось, тож вимкнути автентифікатор без нього не вийде. Поки телефон у вас, створіть нові коди.', 'Er zijn geen herstelcodes meer, dus zonder de app gaat de authenticator niet uit. Maak nieuwe codes zolang u de telefoon nog hebt.')}</p>}
          </> : <p className='access-plane-hint-line'>{tr(lang, 'Застосунок-автентифікатор не налаштовано — цей випадок вас не стосується.', 'De authenticator-app is niet ingesteld — dit geval geldt niet voor u.')}</p>}
        </Kaart>

        <Kaart id='codes-op' icoon={<LifeBuoy aria-hidden='true' />} titel={tr(lang, 'Закінчилися коди відновлення', 'Herstelcodes op')} open={op}>
          <ol>
            <li>{tr(lang, 'Створіть новий набір у розділі «Коди відновлення» вище — старі коди перестануть діяти.', 'Maak een nieuwe set bij «Herstelcodes» hierboven — de oude codes werken dan niet meer.')}</li>
            <li>{tr(lang, 'Збережіть коди (файл, друк або менеджер паролів) і позначте «Я зберіг коди».', 'Bewaar de codes (bestand, afdruk of wachtwoordmanager) en vink «Ik heb de codes bewaard» aan.')}</li>
            <li>{tr(lang, 'Код сховища ключів від цього не змінюється — він окремий.', 'De code van de sleutelkluis verandert hierdoor niet — die staat apart.')}</li>
          </ol>
        </Kaart>
      </div>
      {herinnering}
    </section>

    <SleutelverliesBlok lang={lang} kluis={kluis} />
  </>;
}

/** «Наслідки втрати ключа» (id herstel-sleutelverlies): статичні тексти зі shared/sleutelkluis.ts, чесно залежно від стану. */
export function SleutelverliesBlok({ lang, kluis }: { lang: Lang; kluis: KluisKern | null | undefined }) {
  const aan = !!kluis && kluis.stand !== 'uit';
  return <section className='access-plane-section herstel-sleutelverlies' id='herstel-sleutelverlies' data-herstel-sleutelverlies data-kluis={kluis ? kluis.stand : 'onbekend'} tabIndex={-1}>
    <header className='access-plane-section-head'><h2>{tr(lang, 'Наслідки втрати ключа', 'Gevolgen van sleutelverlies')}</h2></header>
    <div className='access-plane-box herstel-tekst'>
      {kluis && kluis.stand === 'uit' && <p data-kluis-uit>{t2(lang, KLUIS_TEKST.stand.uit)}. {tr(lang, 'Поки шифрування вимкнене, втрата passkey чи кодів не забирає дані — лише ускладнює вхід.', 'Zolang versleuteling uit staat, kost het verlies van passkeys of codes geen gegevens — het maakt alleen aanmelden lastiger.')}</p>}
      {(aan || kluis === null || kluis === undefined) && <p className='access-plane-warn' data-kluis-verlies>{t2(lang, KLUIS_TEKST.verlies)}</p>}
      {kluis?.stand === 'gesloten' && <p>{t2(lang, KLUIS_FOUT.SLEUTELKLUIS_GESLOTEN)}</p>}
      <p>{t2(lang, KLUIS_TEKST.tweeCodes)}</p>
      {aan && <p>{t2(lang, KLUIS_TEKST.geenPrf)}</p>}
    </div>
  </section>;
}

type Props = Omit<WeergaveProps, 'kluis'> & { context: Record<string, unknown> };

export function Scenarios({ context, ...rest }: Props) {
  const kluis = useKluisKern(context);
  return <ScenariosWeergave {...rest} kluis={kluis} herinnering={<div className='herstel-herinnering-plek' data-herstel-reserve='schakel' tabIndex={-1}><Suspense fallback={null}><ReserveHerinneringKoppeling lang={rest.lang} /></Suspense></div>} />;
}
