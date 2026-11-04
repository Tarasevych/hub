// Admin → «Оновлення»: «Розгортання з телефона — усе на одній сторінці». Покроковий майстер над рештою сторінки:
//  1. Passkey, що може схвалювати (додати тут же, без переходу на id.*).
//  2. Підтвердження на сервері — один раз через SSH (сайт навмисно не може сам собі дозволити встановлювати код).
//  3. Доступ ШІ (необов'язково): та сама підписана політика, що й на сторінці «Доступ ШІ», відкривається тут.
//  4. Хто готує оновлення: швидкий дозвіл підключенню на 1 день.
//  5. Розгорнути архів з цього пристрою: вибрати .tar.gz, браузер сам читає версію/коміт і рахує sha256, завантажує на сервер,
//     далі «Схвалити й встановити» (passkey). Root перевіряє все ще раз; без passkey власника нічого не встановлюється.
// Кожен крок має стан (готово / треба зробити / необов'язково); відкритий перший незавершений.
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Check, Circle, ClipboardCopy, Fingerprint, KeyRound, PackageOpen, Server, Upload, UserCheck } from 'lucide-react';
import { api } from './platform/client';
import { kanPasskey as passkeyMogelijk } from './platform/webauthn';
import { leesPakket, naarBase64, type PakketInfo } from './platform/tar-lezen';
import { PasskeysSection } from './PasskeysSection';

const AiBeleid = lazy(() => import('./AdminAiBeleidView'));

type Lang = 'uk' | 'nl';
type Grant = { id: string; soort: 'account' | 'agenttoken' | 'mcp-koppeling'; onderwerp: string; label: string; status: 'actief' | 'verlopen' | 'ingetrokken' };
type Keuze = { id: string; label: string };
export type MeesterData = {
  schakelaar: boolean; passkeys: Array<{ kort: string; label: string }>; wachtend: Array<{ kort: string; label: string; sshOpdracht: string }>;
  voorbereiders: Grant[]; kandidaten: { koppelingen: Keuze[] }; voorstellen: Array<{ id: string; versie: string; status: string }>;
  limieten: { maxBytes?: number; maxStuk?: number }; ik?: { id: string; email: string };
};
type Props = {
  lang: Lang; context: Record<string, unknown>; sourceOrigin: string; tabContext: string; data: MeesterData; busy: string;
  doe: (sleutel: string, run: () => Promise<string | void>) => Promise<void>; laden: () => Promise<void>; goedkeurenId: (id: string) => void;
};
type Stap = 'passkey' | 'server' | 'ai' | 'voorbereider' | 'pakket';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const PROBLEEM: Record<string, [string, string]> = {
  GEEN_GZIP: ['Це не архів .tar.gz.', 'Dit is geen .tar.gz-archief.'],
  TAR_ONGELDIG: ['Архів пошкоджений або не є tar.', 'Het archief is beschadigd of geen tar.'],
  GEEN_VERSIE: ['В архіві немає файлу UITROL-VERSIE — такий архів можна встановити лише через SSH. Попросіть архів «для схвалення з телефона».', 'Het archief bevat geen UITROL-VERSIE — zo’n archief kan alleen via SSH. Vraag een archief «voor goedkeuring via de telefoon».'],
  VERSIE_ONGELDIG: ['UITROL-VERSIE має бути у вигляді РРРРММДД-ГГХХСС.', 'UITROL-VERSIE moet de vorm JJJJMMDD-UUMMSS hebben.'],
  MEER_MAPPEN: ['В архіві має бути рівно одна верхня тека.', 'Het archief moet precies één bovenmap hebben.'],
  ONVEILIG_PAD: ['Архів містить шляхи поза текою.', 'Het archief bevat paden buiten de map.'],
  GEEN_GEWOON_BESTAND: ['Архів містить посилання чи інші недозволені елементи.', 'Het archief bevat links of andere niet-toegestane onderdelen.'],
  GEEN_INSTALLER: ['В архіві немає deploy/installeer-app.sh.', 'deploy/installeer-app.sh ontbreekt in het archief.'],
  TE_GROOT: ['Архів завеликий для завантаження з пристрою.', 'Het archief is te groot om vanaf het apparaat te uploaden.'],
};

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

export default function UitrolMeester({ lang, context, sourceOrigin, tabContext, data, busy, doe, laden, goedkeurenId }: Props) {
  const kanPasskey = passkeyMogelijk();
  const mijnGrant = data.voorbereiders.find((g) => g.status === 'actief' && g.soort === 'account' && !!data.ik && g.onderwerp === data.ik.id);
  const actieveGrants = data.voorbereiders.filter((g) => g.status === 'actief');
  const stand: Record<Stap, 'ok' | 'todo' | 'optie'> = {
    passkey: data.passkeys.length > 0 ? 'ok' : 'todo',
    server: data.schakelaar && data.passkeys.length > 0 ? 'ok' : 'todo',
    ai: 'optie',
    voorbereider: actieveGrants.length > 0 ? 'ok' : 'optie',
    pakket: 'optie',
  };
  const eersteOpen: Stap = stand.passkey === 'todo' && !data.wachtend.length ? 'passkey' : stand.server === 'todo' ? 'server' : 'pakket';
  const [open, setOpen] = useState<Stap | null>(eersteOpen);
  const klaar = stand.passkey === 'ok' && stand.server === 'ok';

  // ---- 5. archief van dit apparaat
  const [bestand, setBestand] = useState<File | null>(null);
  const [analyse, setAnalyse] = useState<{ info: PakketInfo; sha256: string } | null>(null);
  const [bezigLezen, setBezigLezen] = useState(false);
  const [wijzigingen, setWijzigingen] = useState('');
  const [voortgang, setVoortgang] = useState<number | null>(null);
  const [nieuwId, setNieuwId] = useState('');
  const maxBytes = data.limieten.maxBytes || 300 * 1024 * 1024;
  const kies = async (f: File | null) => {
    setBestand(f); setAnalyse(null); setNieuwId(''); setVoortgang(null);
    if (!f) return;
    if (f.size > maxBytes) { setAnalyse({ info: { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, problemen: ['TE_GROOT'] }, sha256: '' }); return; }
    setBezigLezen(true);
    try { setAnalyse(await leesPakket(f)); } finally { setBezigLezen(false); }
  };
  const nieuw = useMemo(() => data.voorstellen.find((v) => v.id === nieuwId), [data.voorstellen, nieuwId]);
  const uploaden = () => { if (!bestand || !analyse || analyse.info.problemen.length || !data.ik) return; void doe('pakket', async () => {
    const f = bestand, a = analyse;
    if (!mijnGrant) await api.post('/api/owner/uitrol/voorbereiders/toevoegen', { ...context, soort: 'account', onderwerp: data.ik!.id, dagen: 1, label: tr(lang, 'Власник — з пристрою', 'Eigenaar — vanaf apparaat') });
    const begin = (await api.post('/api/uitrol/voorstel/begin', { ...context, version: a.info.versie, bytes: f.size, sha256: a.sha256, commit: a.info.commit || undefined,
      changelog: (wijzigingen.trim() || tr(lang, `Завантажено власником з пристрою: ${f.name}`, `Door de eigenaar geüpload vanaf een apparaat: ${f.name}`)).slice(0, 8000), tests: {} })).data as { id: string; maxStuk: number };
    const stuk = Math.min(begin.maxStuk || 512 * 1024, data.limieten.maxStuk || 512 * 1024);
    setVoortgang(0);
    for (let offset = 0; offset < f.size; offset += stuk) {
      const deel = new Uint8Array(await f.slice(offset, Math.min(f.size, offset + stuk)).arrayBuffer());
      await api.post('/api/uitrol/voorstel/stuk', { ...context, id: begin.id, offset, data: naarBase64(deel) });
      setVoortgang(Math.round(((offset + deel.length) / f.size) * 100));
    }
    await api.post('/api/uitrol/voorstel/klaar', { ...context, id: begin.id });
    setNieuwId(begin.id);
    await laden();
    return tr(lang, `Архів ${a.info.versie} завантажено. Він нічого не встановлює, доки ви не схвалите його passkey.`, `Archief ${a.info.versie} geüpload. Het installeert niets tot u het met uw passkey goedkeurt.`);
  }).finally(() => setVoortgang(null)); };

  const stap = (id: Stap, nr: number, Icoon: typeof Server, titel: string, samenvatting: string, inhoud: ReactNode) => {
    const s = stand[id];
    return <section className='uitrol-meester-stap' data-meester-stap={id} data-stand={s}>
      <button type='button' className='uitrol-meester-kop' aria-expanded={open === id} aria-controls={`meester-${id}`} onClick={() => setOpen(open === id ? null : id)}>
        <span className='uitrol-meester-nr' aria-hidden='true'>{s === 'ok' ? <Check /> : nr}</span>
        <Icoon aria-hidden='true' />
        <span className='uitrol-meester-titel'><b>{titel}</b><small>{samenvatting}</small></span>
        <span className='uitrol-meester-stand'>{s === 'ok' ? tr(lang, 'Готово', 'Klaar') : s === 'todo' ? tr(lang, 'Треба зробити', 'Te doen') : tr(lang, 'Необов’язково', 'Optioneel')}</span>
      </button>
      {open === id && <div className='uitrol-meester-inhoud' id={`meester-${id}`}>{inhoud}</div>}
    </section>;
  };

  return <section className='admin-section uitrol-meester' data-uitrol-meester aria-labelledby='uitrol-meester-titel'>
    <header><PackageOpen /><div><h2 id='uitrol-meester-titel'>{tr(lang, 'Розгортання з телефона — налаштування на одній сторінці', 'Uitrollen vanaf de telefoon — alles op één pagina')}</h2>
      <p data-meester-klaar={klaar}>{klaar
        ? tr(lang, 'Усе готово: завантажте архів (крок 5) або схваліть підготовлене оновлення нижче — passkey на телефоні.', 'Alles klaar: upload een archief (stap 5) of keur een voorbereide update hieronder goed — met de passkey op uw telefoon.')
        : tr(lang, 'Пройдіть кроки 1–2 один раз. Далі оновлення встановлюються лише після вашого відбитка / обличчя / PIN на телефоні.', 'Doorloop stap 1–2 één keer. Daarna wordt een update pas geïnstalleerd na uw vingerafdruk / gezicht / pincode op de telefoon.')}</p></div></header>

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

    {stap('voorbereider', 4, UserCheck, tr(lang, 'Хто може готувати оновлення', 'Wie mag updates voorbereiden'),
      actieveGrants.length ? tr(lang, `Дозволено: ${actieveGrants.map((g) => g.label).join(', ')}`, `Toegestaan: ${actieveGrants.map((g) => g.label).join(', ')}`) : tr(lang, 'Для власного архіву (крок 5) не потрібно — дозвіл собі дається автоматично на 1 день', 'Niet nodig voor uw eigen archief (stap 5) — dat recht krijgt u automatisch voor 1 dag'),
      <>
        <p>{tr(lang, 'Швидкий дозвіл підключенню ШІ — лише на підготовку пакета, на 1 день. Відкликати можна будь-коли в розділі нижче.', 'Snelle toestemming voor een AI-koppeling — alleen om een pakket voor te bereiden, voor 1 dag. Intrekken kan altijd in het onderdeel hieronder.')}</p>
        {data.kandidaten.koppelingen.length === 0 && <p className='admin-uitrol-leeg'>{tr(lang, 'Немає активних MCP-підключень.', 'Geen actieve MCP-koppelingen.')}</p>}
        <ul className='admin-uitrol-lijst'>{data.kandidaten.koppelingen.map((k) => {
          const heeft = actieveGrants.some((g) => g.soort === 'mcp-koppeling' && g.onderwerp === k.id);
          return <li key={k.id}><span>{k.label}</span>{heeft ? <b><Check aria-hidden='true' />{tr(lang, 'дозволено', 'toegestaan')}</b>
            : <button type='button' disabled={!!busy} data-snel-grant={k.id} onClick={() => void doe(`snel-${k.id}`, async () => { await api.post('/api/owner/uitrol/voorbereiders/toevoegen', { ...context, soort: 'mcp-koppeling', onderwerp: k.id, dagen: 1, label: '' }); return tr(lang, 'Дозволено на 1 день.', 'Toegestaan voor 1 dag.'); })}><Check aria-hidden='true' />{tr(lang, 'Дозволити на 1 день', '1 dag toestaan')}</button>}</li>;
        })}</ul>
      </>)}

    {stap('pakket', 5, Upload, tr(lang, 'Розгорнути архів з цього пристрою', 'Archief van dit apparaat uitrollen'),
      nieuw ? tr(lang, `Завантажено версію ${nieuw.versie}`, `Versie ${nieuw.versie} geüpload`) : tr(lang, 'Виберіть mijn-ruimte-….tar.gz (наприклад, із «Завантажень» телефона)', 'Kies mijn-ruimte-….tar.gz (bijv. uit «Downloads» op de telefoon)'),
      <>
        <label className='uitrol-meester-bestand'>
          <span>{tr(lang, 'Архів випуску (.tar.gz)', 'Release-archief (.tar.gz)')}</span>
          <input type='file' accept='.tar.gz,.tgz,application/gzip,application/x-gzip' data-meester-bestand onChange={(e) => void kies(e.target.files?.[0] || null)} disabled={!!busy} />
        </label>
        {bezigLezen && <p role='status'>{tr(lang, 'Перевіряю архів…', 'Archief wordt gecontroleerd…')}</p>}
        {analyse && bestand && <div className='admin-uitrol-voorstel' data-meester-analyse>
          <dl>
            <dt>{tr(lang, 'Файл', 'Bestand')}</dt><dd>{bestand.name} · {mb(bestand.size)}</dd>
            {analyse.info.versie && <><dt>{tr(lang, 'Версія', 'Versie')}</dt><dd data-meester-versie>{analyse.info.versie}</dd></>}
            {analyse.info.commit && <><dt>{tr(lang, 'Коміт', 'Commit')}</dt><dd><code>{analyse.info.commit.slice(0, 12)}</code></dd></>}
            {analyse.info.bestanden > 0 && <><dt>{tr(lang, 'Файлів', 'Bestanden')}</dt><dd>{analyse.info.bestanden}</dd></>}
            {analyse.sha256 && <><dt>sha256</dt><dd><code className='admin-uitrol-sha'>{analyse.sha256}</code></dd></>}
          </dl>
          {analyse.info.problemen.length > 0 && <ul className='uitrol-meester-problemen' role='alert'>{analyse.info.problemen.map((p) => <li key={p}>{PROBLEEM[p] ? tr(lang, PROBLEEM[p][0], PROBLEEM[p][1]) : p}</li>)}</ul>}
          {!analyse.info.problemen.length && !nieuw && <>
            <label className='uitrol-meester-wijzigingen'><span>{tr(lang, 'Що змінено (необов’язково)', 'Wat er verandert (optioneel)')}</span>
              <textarea rows={2} maxLength={8000} value={wijzigingen} onChange={(e) => setWijzigingen(e.target.value)} disabled={!!busy} /></label>
            <p className='admin-uitrol-hint'>{tr(lang, 'Порівняйте sha256 із тим, що вам надіслали разом з архівом.', 'Vergelijk de sha256 met die u samen met het archief kreeg.')}</p>
            <div className='admin-uitrol-knoppen'>
              <button type='button' className='admin-uitrol-ja' disabled={!!busy || !data.ik} data-meester-uploaden onClick={uploaden}><Upload aria-hidden='true' />{tr(lang, 'Завантажити на сервер', 'Uploaden naar de server')}</button>
            </div>
          </>}
          {voortgang !== null && <p role='status'><progress max={100} value={voortgang} aria-label={tr(lang, 'Завантаження архіву', 'Archief uploaden')} /> {voortgang}%</p>}
          {nieuw && <div data-meester-nieuw={nieuw.status}>
            <p>{nieuw.status === 'wacht-op-goedkeuring' ? tr(lang, 'Чекає вашого схвалення.', 'Wacht op uw goedkeuring.') : tr(lang, 'Стан: ', 'Status: ') + nieuw.status}</p>
            {nieuw.status === 'wacht-op-goedkeuring' && <div className='admin-uitrol-knoppen'>
              <button type='button' className='admin-uitrol-ja' disabled={!klaar || !kanPasskey || !!busy} onClick={() => goedkeurenId(nieuw.id)}><Fingerprint aria-hidden='true' />{tr(lang, 'Схвалити й встановити', 'Goedkeuren en installeren')}</button>
            </div>}
            {!klaar && <p className='admin-uitrol-hint'>{tr(lang, 'Щоб схвалити, завершіть кроки 1–2. Архів почекає до 7 днів.', 'Rond stap 1–2 af om goed te keuren. Het archief wacht tot 7 dagen.')}</p>}
          </div>}
        </div>}
        {!analyse && <p className='admin-uitrol-hint'><Circle aria-hidden='true' className='uitrol-meester-punt' />{tr(lang, 'Архів має містити файл UITROL-VERSIE. Той самий файл годиться й для встановлення через SSH.', 'Het archief moet het bestand UITROL-VERSIE bevatten. Hetzelfde bestand werkt ook voor installeren via SSH.')}</p>}
      </>)}
  </section>;
}
