// Admin → «Оновлення»: «Розгортання з телефона — усе на одній сторінці». Покроковий майстер над рештою сторінки:
//  1. Passkey, що може схвалювати (додати тут же, без переходу на id.*).
//  2. Підтвердження на сервері — один раз через SSH (сайт навмисно не може сам собі дозволити встановлювати код).
//  3. Доступ ШІ (необов'язково): та сама підписана політика, що й на сторінці «Доступ ШІ», відкривається тут.
//  4. Хто готує оновлення: швидкий дозвіл підключенню на 1 день.
// (Завантаження архіву — окремий майстер «Нове оновлення» у src/uitrol/Upload.tsx на вкладці «Огляд».)
// Кожен крок має стан (готово / треба зробити / необов'язково); відкритий перший незавершений.
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Bot, Check, CheckCircle2, ChevronDown, ClipboardCopy, Fingerprint, KeyRound, Server, Smartphone, Upload as UploadIcon } from 'lucide-react';
import { kanPasskey as passkeyMogelijk } from './platform/webauthn';
import { PasskeysSection } from './ToegangssleutelsSectie';
import './uitrol/meester.css';

const AiBeleid = lazy(() => import('./BeheerAiBeleidWeergave'));

type Lang = 'uk' | 'nl';
export type MeesterData = { schakelaar: boolean; passkeys: Array<{ kort: string; label: string }>; wachtend: Array<{ kort: string; label: string; sshOpdracht: string }> };
type Props = {
  lang: Lang; context: Record<string, unknown>; sourceOrigin: string; tabContext: string; data: MeesterData; laden: () => Promise<void>;
  /** Naar het tabblad «Огляд» (de wizard «Нове оновлення»). */ naarOverzicht?: () => void;
  /** Aantal pakketten dat nu op uw goedkeuring wacht. */ teGoedkeuren?: number;
};
type Stap = 'passkey' | 'server' | 'ai';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

function Kopieer({ lang, tekst }: { lang: Lang; tekst: string }) {
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const kopieer = async () => {
    try { await navigator.clipboard.writeText(tekst); setOk(true); window.setTimeout(() => setOk(false), 2000); }
    catch { const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); } }
  };
  return <div className='uitrol-meester-opdracht'>
    <code ref={ref}>{tekst}</code>
    <button type='button' onClick={() => void kopieer()} aria-label={tr(lang, 'Копіювати команду', 'Opdracht kopiëren')}>{ok ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}{ok ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}</button>
  </div>;
}

export default function UitrolMeester({ lang, context, sourceOrigin, tabContext, data, laden, naarOverzicht, teGoedkeuren = 0 }: Props) {
  const kanPasskey = passkeyMogelijk();
  const stand: Record<Stap, 'ok' | 'todo' | 'optie'> = {
    passkey: data.passkeys.length > 0 ? 'ok' : 'todo',
    server: data.schakelaar && data.passkeys.length > 0 ? 'ok' : 'todo',
    ai: 'optie',
  };
  const eersteOpen: Stap | null = stand.passkey === 'todo' && !data.wachtend.length ? 'passkey' : stand.server === 'todo' ? 'server' : null;
  const [open, setOpen] = useState<Stap | null>(eersteOpen);
  const klaar = stand.passkey === 'ok' && stand.server === 'ok';

  const verplicht: Stap[] = ['passkey', 'server'];
  const klaarAantal = verplicht.filter((id) => stand[id] === 'ok').length;
  const eerstTodo = verplicht.find((id) => stand[id] !== 'ok');
  const stap = (id: Stap, nr: number, Icoon: typeof Server, titel: string, samenvatting: string, inhoud: ReactNode) => {
    const s = stand[id];
    const isOpen = open === id;
    return <section className='uitrol-meester-stap' data-meester-stap={id} data-stand={s} data-open={isOpen || undefined}>
      <button type='button' className='uitrol-meester-kop' aria-expanded={isOpen} aria-controls={`meester-${id}`} onClick={() => setOpen(isOpen ? null : id)}>
        <span className='uitrol-meester-nr' aria-hidden='true'>{s === 'ok' ? <Check /> : nr}</span>
        <span className='uitrol-meester-tegel' aria-hidden='true'><Icoon /></span>
        <span className='uitrol-meester-titel'><b>{titel}</b><small>{samenvatting}</small></span>
        <span className='uitrol-meester-stand'>{s === 'ok' ? tr(lang, 'Готово', 'Klaar') : s === 'todo' ? tr(lang, 'Треба зробити', 'Te doen') : tr(lang, 'Необов’язково', 'Optioneel')}</span>
        <ChevronDown className='uitrol-meester-pijl' aria-hidden='true' />
      </button>
      {isOpen && <div className='uitrol-meester-inhoud' id={`meester-${id}`}>{inhoud}</div>}
    </section>;
  };

  return <section className='uitrol-meester' data-uitrol-meester='instellen' data-klaar={klaar || undefined} aria-labelledby='uitrol-meester-titel'>
    <header className='uitrol-meester-hoofd'>
      <span className='uitrol-meester-logo' aria-hidden='true'><Smartphone /></span>
      <div className='uitrol-meester-hoofd-tekst'><h2 id='uitrol-meester-titel'>{tr(lang, 'Розгортання з телефона', 'Uitrollen vanaf de telefoon')}</h2>
        <p>{tr(lang, 'Один раз налаштуйте два кроки — далі оновлення встановлюються лише після вашого відбитка, обличчя чи PIN на телефоні.', 'Stel twee stappen eenmalig in — daarna wordt een update pas geïnstalleerd na uw vingerafdruk, gezicht of pincode op de telefoon.')}</p></div>
      <div className='uitrol-meester-teller' role='img' aria-label={tr(lang, `Готово ${klaarAantal} з ${verplicht.length} обов’язкових кроків`, `${klaarAantal} van ${verplicht.length} verplichte stappen klaar`)} data-klaar={klaar}>
        <b>{klaarAantal}<i>/{verplicht.length}</i></b><small>{tr(lang, 'кроків', 'stappen')}</small></div>
    </header>

    {/* Voortgangsrail: drie stappen in één oogopslag; een tik opent de stap eronder. */}
    <ol className='uitrol-meester-rail' aria-label={tr(lang, 'Кроки налаштування', 'Instelstappen')}>
      {([['passkey', KeyRound, tr(lang, 'Passkey', 'Passkey')], ['server', Server, tr(lang, 'Сервер (SSH)', 'Server (SSH)')], ['ai', Bot, tr(lang, 'Агент ШІ', 'AI-agent')]] as Array<[Stap, typeof Server, string]>).map(([id, Icoon, naam], i) =>
        <li key={id} data-stand={stand[id]}>
          <button type='button' onClick={() => { setOpen(id); window.setTimeout(() => document.querySelector(`[data-meester-stap="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40); }}>
            <span className='uitrol-meester-rail-bol'>{stand[id] === 'ok' ? <Check aria-hidden='true' /> : <Icoon aria-hidden='true' />}</span>
            <span className='uitrol-meester-rail-tekst'><b>{i + 1}. {naam}</b><small>{stand[id] === 'ok' ? tr(lang, 'Готово', 'Klaar') : stand[id] === 'todo' ? tr(lang, 'Треба зробити', 'Te doen') : tr(lang, 'Необов’язково', 'Optioneel')}</small></span>
          </button>
        </li>)}
    </ol>

    <div className='uitrol-meester-status' data-meester-klaar={klaar} role='status'>
      {klaar ? <>
        <CheckCircle2 aria-hidden='true' />
        <p><b>{tr(lang, 'Усе готово.', 'Alles klaar.')}</b> {teGoedkeuren > 0
          ? tr(lang, `Пакетів, що чекають вашого схвалення: ${teGoedkeuren}. Підтвердіть passkey на телефоні.`, `Pakketten die op uw goedkeuring wachten: ${teGoedkeuren}. Bevestig met de passkey op uw telefoon.`)
          : tr(lang, 'Перетягніть пакет у майстрі «Нове оновлення» на вкладці «Огляд» — установка почнеться лише після вашого passkey.', 'Sleep een pakket in de wizard «Nieuwe update» op het tabblad Overzicht — installeren start pas na uw passkey.')}</p>
        {naarOverzicht && <button type='button' className='uitrol-meester-cta' onClick={naarOverzicht}>{teGoedkeuren > 0 ? <Fingerprint aria-hidden='true' /> : <UploadIcon aria-hidden='true' />}{teGoedkeuren > 0 ? tr(lang, 'Схвалити оновлення', 'Update goedkeuren') : tr(lang, 'Завантажити архів', 'Archief uploaden')}<ArrowRight aria-hidden='true' /></button>}
      </> : <>
        <KeyRound aria-hidden='true' />
        <p><b>{tr(lang, 'Ще не все налаштовано.', 'Nog niet alles ingesteld.')}</b> {tr(lang, `Пройдіть ${verplicht.length - klaarAantal} з ${verplicht.length} обов’язкових кроків нижче; решту налаштувань робити не треба.`, `Doorloop nog ${verplicht.length - klaarAantal} van de ${verplicht.length} verplichte stappen hieronder; verder hoeft u niets in te stellen.`)}</p>
        {eerstTodo && <button type='button' className='uitrol-meester-cta' onClick={() => { setOpen(eerstTodo); window.setTimeout(() => document.querySelector(`[data-meester-stap="${eerstTodo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40); }}>{tr(lang, 'До наступного кроку', 'Naar de volgende stap')}<ArrowRight aria-hidden='true' /></button>}
      </>}
    </div>

    <div className='uitrol-meester-stappen'>
    {stap('passkey', 1, KeyRound, tr(lang, 'Passkey, що може схвалювати', 'Passkey die mag goedkeuren'),
      data.passkeys.length ? tr(lang, `Готово: ${data.passkeys.map((p) => `${p.label} (${p.kort})`).join(', ')}`, `Klaar: ${data.passkeys.map((p) => `${p.label} (${p.kort})`).join(', ')}`)
        : data.wachtend.length ? tr(lang, 'Passkey додано — чекає підтвердження на сервері (крок 2)', 'Passkey toegevoegd — wacht op bevestiging door de server (stap 2)')
        : tr(lang, 'Додайте passkey на цьому телефоні й позначте «Може схвалювати оновлення сервера»', 'Voeg een passkey toe op deze telefoon en vink «Mag serverupdates goedkeuren» aan'),
      <>
        {!kanPasskey && <p className='admin-uitrol-hint'>{tr(lang, 'Цей браузер не підтримує passkey. Відкрийте сторінку в Chrome на телефоні.', 'Deze browser ondersteunt geen passkeys. Open de pagina in Chrome op uw telefoon.')}</p>}
        <ol className='uitrol-meester-uitleg'>
          <li>{tr(lang, 'Натисніть «Додати passkey», дайте назву (наприклад «Телефон») і підтвердьте відбитком або обличчям.', 'Druk op «Passkey toevoegen», geef een naam (bijv. «Telefoon») en bevestig met vingerafdruk of gezicht.')}</li>
          <li>{tr(lang, 'У рядку цього passkey увімкніть «Може схвалювати оновлення сервера».', 'Zet in de rij van deze passkey «Mag serverupdates goedkeuren» aan.')}</li>
          <li>{tr(lang, 'Перший такий passkey сервер приймає лише після SSH-команди (крок 2); наступні — підтвердженням уже доданим passkey, без SSH.', 'De eerste zo’n passkey aanvaardt de server pas na de SSH-opdracht (stap 2); volgende met een al toegevoegde passkey, zonder SSH.')}</li>
        </ol>
        <PasskeysSection lang={lang} context={context} onChange={() => void laden()} beheer />
      </>)}

    {stap('server', 2, Server, tr(lang, 'Підтвердити на сервері (один раз, SSH)', 'Bevestigen op de server (één keer, SSH)'),
      stand.server === 'ok' ? tr(lang, 'Схвалення через passkey увімкнено на сервері', 'Goedkeuren met passkey staat aan op de server')
        : tr(lang, 'Сайт навмисно не може сам собі дозволити встановлювати код — це робить root один раз', 'De site kan zichzelf bewust geen recht geven om code te installeren — root doet dat één keer'),
      <>
        <p>{tr(lang, 'Чому через SSH: якщо хтось захопить сайт, він не зможе додати свій ключ чи ввімкнути встановлення. Це робиться один раз; далі все — з телефона.', 'Waarom via SSH: wie de site overneemt, kan geen eigen sleutel toevoegen of installeren aanzetten. Dit gebeurt één keer; daarna alles vanaf de telefoon.')}</p>
        {data.wachtend.length > 0 && <>
          <h3>{tr(lang, 'а) Підтвердити passkey', 'a) Passkey bevestigen')}</h3>
          {data.wachtend.map((w) => <div key={w.kort}>
            <p>{tr(lang, `Passkey «${w.label}», відбиток `, `Passkey «${w.label}», vingerafdruk `)}<b>{w.kort}</b>{tr(lang, ' — порівняйте з тим, що покаже сервер (sudo mijn-ruimte-passkey wachtend).', ' — vergelijk met wat de server toont (sudo mijn-ruimte-passkey wachtend).')}</p>
            <Kopieer lang={lang} tekst={w.sshOpdracht} />
          </div>)}
        </>}
        {!data.wachtend.length && !data.passkeys.length && <p className='admin-uitrol-hint'>{tr(lang, 'Спершу крок 1: тут з’явиться команда з відбитком саме вашого passkey.', 'Eerst stap 1: hier verschijnt de opdracht met de vingerafdruk van uw passkey.')}</p>}
        {!data.schakelaar && <>
          <h3>{tr(lang, 'б) Увімкнути схвалення через passkey', 'b) Goedkeuren met passkey aanzetten')}</h3>
          <Kopieer lang={lang} tekst='sudo nano /etc/mijn-ruimte/mcp-rechten.json' />
          <p>{tr(lang, 'Змініть "passkey-goedkeuring": false на true (якщо рядка немає — додайте "passkey-goedkeuring": true), збережіть: Ctrl+O, Enter, Ctrl+X.', 'Wijzig "passkey-goedkeuring": false in true (staat de regel er niet, voeg "passkey-goedkeuring": true toe), bewaar: Ctrl+O, Enter, Ctrl+X.')}</p>
        </>}
        <h3>{tr(lang, 'Перевірка', 'Controle')}</h3>
        <Kopieer lang={lang} tekst='sudo mijn-ruimte-passkey lijst' />
        <p className='admin-uitrol-hint'>{tr(lang, 'Має показати «schakelaar aan» і ваш passkey. Потім натисніть «Оновити» вгорі сторінки.', 'Moet «schakelaar aan» en uw passkey tonen. Druk daarna op «Vernieuwen» bovenaan.')}</p>
      </>)}

    {stap('ai', 3, Bot, tr(lang, 'Доступ ШІ (якщо оновлення готує агент)', 'AI-toegang (als een agent de update voorbereidt)'),
      tr(lang, 'Яке підключення ШІ і що саме може робити — підписується вашим passkey', 'Welke AI-koppeling wat mag doen — ondertekend met uw passkey'),
      <>
        <p>{tr(lang, 'Додайте підключення (наприклад Claude) і групу «Розгортання». Агент зможе лише завантажити пакет; схвалити не може ніхто, крім вас.', 'Voeg de koppeling toe (bijv. Claude) en de groep «Uitrollen». De agent kan alleen een pakket uploaden; goedkeuren kan niemand behalve u.')}</p>
        <Suspense fallback={<p>{tr(lang, 'Завантаження…', 'Laden…')}</p>}><AiBeleid lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} /></Suspense>
      </>)}
    </div>
  </section>;
}
