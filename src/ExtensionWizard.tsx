import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Copy, Download, FileArchive, Link2, LoaderCircle, Package, Power, Puzzle, ShieldCheck } from 'lucide-react';
import { emitCanonicalNotice } from './canonical-notifications';
import { Logo, type LogoKind, type Tr } from './mcp-ui';
import { extensionInstallCommands } from './install-commands';
import './extension-wizard.css';

type BrowserKey = 'chrome' | 'edge' | 'opera' | 'brave' | 'vivaldi' | 'firefox' | 'safari';
type OsKey = 'windows' | 'macos' | 'linux';
type Method = 'terminal' | 'helper' | 'zip' | 'crx';
type Release = { version?: string; sha256?: string; storeUrl?: string; installers?: string[]; crx?: { file: string; extensionId: string; version: string } | null };
type Presence = 'checking' | 'present' | 'absent';

export type WizardProps = {
  tr: Tr; presence: Presence; paired: boolean; agentEnabled: boolean; agentArmed: boolean; hasAgent: boolean; release: Release; busy: boolean; notice: string;
  onConnect: () => void; onEnable: () => void; onDownloaded: () => void; onClose?: () => void; welcome: boolean;
};

const BROWSERS: Array<{ key: BrowserKey; name: string; logo: LogoKind; url: string; supported: boolean; devMode: [string, string]; load: [string, string] }> = [
  { key: 'chrome', name: 'Google Chrome', logo: 'chrome', url: 'chrome://extensions', supported: true, devMode: ['угорі праворуч перемикач «Режим розробника»', 'rechtsboven de schakelaar "Ontwikkelaarsmodus"'], load: ['«Завантажити розпаковане»', '"Uitgepakte extensie laden"'] },
  { key: 'edge', name: 'Microsoft Edge', logo: 'edge', url: 'edge://extensions', supported: true, devMode: ['ліворуч внизу перемикач «Режим розробника»', 'linksonder de schakelaar "Ontwikkelaarsmodus"'], load: ['«Завантажити розпаковане»', '"Uitgepakt laden"'] },
  { key: 'opera', name: 'Opera', logo: 'opera', url: 'opera://extensions', supported: true, devMode: ['угорі праворуч перемикач «Режим розробника»', 'rechtsboven de schakelaar "Ontwikkelaarsmodus"'], load: ['«Завантажити розпаковане»', '"Uitgepakt laden"'] },
  { key: 'brave', name: 'Brave', logo: 'brave', url: 'brave://extensions', supported: true, devMode: ['угорі праворуч перемикач «Режим розробника»', 'rechtsboven de schakelaar "Ontwikkelaarsmodus"'], load: ['«Завантажити розпаковане»', '"Uitgepakte extensie laden"'] },
  { key: 'vivaldi', name: 'Vivaldi', logo: 'vivaldi', url: 'vivaldi://extensions', supported: true, devMode: ['угорі праворуч перемикач «Режим розробника»', 'rechtsboven de schakelaar "Ontwikkelaarsmodus"'], load: ['«Завантажити розпаковане»', '"Uitgepakte extensie laden"'] },
  { key: 'firefox', name: 'Mozilla Firefox', logo: 'firefox', url: 'about:debugging', supported: false, devMode: ['', ''], load: ['', ''] },
  { key: 'safari', name: 'Safari', logo: 'safari', url: '', supported: false, devMode: ['', ''], load: ['', ''] },
];

function detectBrowser(): BrowserKey {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Vivaldi/.test(ua) || (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands?.some((b) => /vivaldi/i.test(b.brand))) return 'vivaldi';
  if ((navigator as unknown as { brave?: unknown }).brave) return 'brave';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'chrome';
}
function detectOs(): OsKey {
  const p = `${(navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent}`;
  if (/Win/i.test(p)) return 'windows';
  if (/Mac|iPhone|iPad/i.test(p)) return 'macos';
  return 'linux';
}

/** Схематична ілюстрація вікна браузера з підсвіченим місцем, куди треба натиснути. Це не знімок екрана: розташування в різних браузерах трохи відрізняється, підпис пояснює точно. */
function Mock({ kind, tr, browser }: { kind: 'devmode' | 'load' | 'folder'; tr: Tr; browser: string }) {
  return (
    <svg className='wiz-mock' viewBox='0 0 420 200' role='img' aria-label={kind === 'devmode' ? tr('Де ввімкнути режим розробника', 'Waar u de ontwikkelaarsmodus aanzet') : kind === 'load' ? tr('Де натиснути «Завантажити розпаковане»', 'Waar u "Uitgepakt laden" kiest') : tr('Вибір папки розширення', 'De map van de extensie kiezen')}>
      <rect x='4' y='4' width='412' height='192' rx='12' className='m-win' />
      <rect x='4' y='4' width='412' height='30' rx='12' className='m-bar' />
      <circle cx='20' cy='19' r='4' className='m-dot r' /><circle cx='34' cy='19' r='4' className='m-dot y' /><circle cx='48' cy='19' r='4' className='m-dot g' />
      <rect x='70' y='10' width='250' height='18' rx='9' className='m-url' />
      <text x='80' y='23' className='m-small'>{browser}://extensions</text>
      {kind === 'folder' ? (
        <>
          <rect x='40' y='54' width='340' height='120' rx='8' className='m-card' />
          <text x='54' y='78' className='m-text'>{tr('Виберіть папку', 'Kies de map')}</text>
          <rect x='54' y='92' width='312' height='24' rx='6' className='m-field' /><text x='62' y='108' className='m-small'>…\MijnRuimte-extension</text>
          <rect x='54' y='128' width='120' height='30' rx='8' className='m-hl' /><text x='64' y='148' className='m-btn'>{tr('Вибір папки', 'Map selecteren')}</text>
        </>
      ) : (
        <>
          <text x='24' y='58' className='m-title'>{tr('Розширення', 'Extensies')}</text>
          <g className={kind === 'devmode' ? 'm-focus' : ''}>
            <text x='286' y='58' className='m-small'>{tr('Режим розробника', 'Ontwikkelaarsmodus')}</text>
            <rect x='376' y='46' width='30' height='16' rx='8' className={kind === 'devmode' ? 'm-toggle' : 'm-toggle on'} />
            <circle cx={kind === 'devmode' ? 384 : 398} cy='54' r='6' className='m-knob' />
            {kind === 'devmode' ? <rect x='280' y='40' width='132' height='28' rx='8' className='m-ring' /> : null}
          </g>
          {kind === 'load' ? (
            <>
              <rect x='24' y='84' width='150' height='28' rx='8' className='m-hl' /><text x='34' y='103' className='m-btn'>{tr('Завантажити розпаковане', 'Uitgepakt laden')}</text>
              <rect x='184' y='84' width='90' height='28' rx='8' className='m-ghost' /><text x='194' y='103' className='m-small'>{tr('Пакувати', 'Inpakken')}</text>
            </>
          ) : null}
          <rect x='24' y='130' width='372' height='50' rx='8' className='m-card' />
          <text x='38' y='152' className='m-text'>Mijn Ruimte</text>
          <text x='38' y='168' className='m-small'>{tr('з’явиться тут після додавання', 'verschijnt hier na het toevoegen')}</text>
        </>
      )}
    </svg>
  );
}

type Step = { id: string; title: string; done: boolean; body: ReactNode; manual?: boolean };

/**
 * Покроковий майстер встановлення розширення: вибір браузера й системи, потім кроки зі справжнім станом (знайдено розширення, підключено, увімкнено, ШІ активний).
 * Кроки, які браузер не дозволяє виконати за вас, пояснені схематичною ілюстрацією; щойно розширення «озветься», вони позначаються виконаними самі.
 */
export default function ExtensionWizard(p: WizardProps) {
  const { tr } = p;
  const [browser, setBrowser] = useState<BrowserKey>(detectBrowser);
  const [os, setOs] = useState<OsKey>(detectOs);
  const [method, setMethod] = useState<Method>('terminal');
  const [folder, setFolder] = useState(() => (detectOs() === 'windows' ? '%USERPROFILE%\\MijnRuimte-extension' : '~/MijnRuimte-extension'));
  const [open, setOpen] = useState<string>('');
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const info = BROWSERS.find((b) => b.key === browser)!;
  const helperFile = os === 'windows' ? 'Install-MijnRuimte.cmd' : 'install-mijn-ruimte.sh';
  const hasHelper = (p.release.installers ?? []).includes(helperFile);
  const present = p.presence === 'present';

  // Повідомлення про кожен виконаний етап: вони лишаються в панелі сповіщень із посиланням сюди.
  const prev = useRef({ present: false, paired: false, enabled: false, armed: false });
  useEffect(() => {
    const last = prev.current;
    const link = { href: 'https://mcp.tarasevych.com/agents#extension', label: tr('До майстра встановлення', 'Naar de installatiehulp') };
    if (!last.present && present) emitCanonicalNotice({ text: tr('Розширення знайдено в цьому браузері. Далі: підключіть його до облікового запису.', 'De extensie is gevonden in deze browser. Volgende stap: koppel hem aan uw account.'), kind: 'success', source: 'mcp', link });
    if (!last.paired && p.paired && p.hasAgent) emitCanonicalNotice({ text: tr('Розширення підключено до вашого облікового запису. Далі: увімкніть його для ШІ.', 'De extensie is gekoppeld aan uw account. Volgende stap: zet hem aan voor de AI.'), kind: 'success', source: 'mcp', link });
    if (!last.enabled && p.agentEnabled) emitCanonicalNotice({ text: tr('ШІ дозволено користуватися цим браузером (лише читання, дії зі змінами чекають вашого «Дозволити»).', 'De AI mag deze browser gebruiken (alleen lezen, acties met wijzigingen wachten op uw "Toestaan").'), kind: 'success', source: 'mcp', link });
    if (!last.armed && p.agentArmed) emitCanonicalNotice({ text: tr('Готово: ШІ активний, поки ви ввійшли на сайті.', 'Klaar: de AI is actief zolang u op de site bent aangemeld.'), kind: 'success', source: 'mcp', link });
    prev.current = { present, paired: p.paired && p.hasAgent, enabled: p.agentEnabled, armed: p.agentArmed };
  }, [present, p.paired, p.hasAgent, p.agentEnabled, p.agentArmed]);

  const copy = async (text: string) => { try { await navigator.clipboard?.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* geen klembord */ } };
  const href = method === 'helper' ? `/downloads/${helperFile}` : method === 'crx' && p.release.crx ? `/downloads/${p.release.crx.file}` : '/downloads/mijn-ruimte-extension.zip';
  const fileName = method === 'helper' ? helperFile : method === 'crx' && p.release.crx ? p.release.crx.file : 'mijn-ruimte-extension.zip';
  const browserScheme = info.url.split(':')[0];

  const steps: Step[] = useMemo(() => {
    const list: Step[] = [];
    list.push({
      id: 'download', title: tr('Завантажте файл', 'Download het bestand'), done: downloaded || present, manual: true,
      body: (
        <>
          <div className='wiz-tabs' role='tablist' aria-label={tr('Спосіб встановлення', 'Installatiemethode')}>
            {p.release.sha256 ? <button type='button' role='tab' aria-selected={method === 'terminal'} onClick={() => setMethod('terminal')}><Download aria-hidden='true' />{tr('Команда в терміналі (рекомендовано)', 'Commando in de terminal (aanbevolen)')}</button> : null}
            {hasHelper ? <button type='button' role='tab' aria-selected={method === 'helper'} onClick={() => setMethod('helper')}><Download aria-hidden='true' />{tr('Помічник (найпростіше)', 'Installatiehulp (eenvoudigst)')}</button> : null}
            <button type='button' role='tab' aria-selected={method === 'zip'} onClick={() => setMethod('zip')}><FileArchive aria-hidden='true' />{tr('ZIP (вручну)', 'ZIP (handmatig)')}</button>
            {p.release.crx ? <button type='button' role='tab' aria-selected={method === 'crx'} onClick={() => setMethod('crx')}><Package aria-hidden='true' />CRX</button> : null}
          </div>
          <div className='wiz-os' role='group' aria-label={tr('Операційна система', 'Besturingssysteem')}>
            {([['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']] as Array<[OsKey, string]>).map(([k, label]) => (
              <button key={k} type='button' aria-pressed={os === k} onClick={() => setOs(k)}><Logo kind={k === 'windows' ? 'windows' : k === 'macos' ? 'macos' : 'linux'} size={18} label={label} />{label}</button>
            ))}
          </div>
          {method === 'terminal' && p.release.sha256 ? (
            <>
              <p>{tr('Без завантаження виконуваних файлів: команда сама завантажує розширення, перевіряє SHA-256 і розпаковує у вказану папку. Це обходить блокування Windows («Захист смарт-програм» блокує .cmd, .ps1, .js).', 'Zonder uitvoerbare bestanden te downloaden: het commando haalt de extensie op, controleert de SHA-256 en pakt hem uit in de opgegeven map. Zo omzeilt u de blokkade van Windows ("Smart App Control" blokkeert .cmd, .ps1, .js).')}</p>
              <label className='wiz-field'>{tr('Папка для розширення (не видаляйте її)', 'Map voor de extensie (niet verwijderen)')}<input value={folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} /></label>
              {extensionInstallCommands({ os, shell: os === 'windows' ? 'powershell' : 'bash', folder, sha256: p.release.sha256, origin: location.origin }).map((c, i) => <div key={i} className='wiz-copy'><code>{c}</code><button type='button' onClick={() => { void copy(c); setDownloaded(true); p.onDownloaded(); }}>{copied ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{tr('Копіювати', 'Kopiëren')}</button></div>)}
              <p className='wiz-note'>{os === 'windows' ? tr('Відкрийте PowerShell (Пуск → введіть PowerShell), вставте команду й натисніть Enter.', 'Open PowerShell (Start → typ PowerShell), plak het commando en druk op Enter.') : tr('Відкрийте термінал, вставте команду й натисніть Enter.', 'Open een terminal, plak het commando en druk op Enter.')}</p>
            </>
          ) : null}
          {method === 'helper' && os === 'windows' ? <p className='wiz-note' role='status'>{tr('Увага: Windows 11 із «Захистом смарт-програм» блокує завантажені .cmd без можливості дозволити їх. Тоді користуйтеся командою в терміналі.', 'Let op: Windows 11 met "Smart App Control" blokkeert gedownloade .cmd-bestanden zonder optie om ze toe te staan. Gebruik dan het commando in de terminal.')}</p> : null}
          <p>{method === 'terminal' ? '' : method === 'helper' ? tr(`Помічник «${helperFile}» сам завантажить розширення, перевірить контрольну суму SHA-256, розпакує у вашу папку й підкаже останні два кліки в браузері.`, `De hulp "${helperFile}" haalt de extensie zelf op, controleert de SHA-256-som, pakt hem uit in uw map en toont de laatste twee klikken in de browser.`)
            : method === 'zip' ? tr('ZIP-архів містить розширення. Його треба розпакувати у власну папку й підключити вручну (кроки нижче).', 'Het ZIP-bestand bevat de extensie. Pak hem uit in een eigen map en laad hem handmatig (stappen hieronder).')
            : tr('CRX підписаний нашим ключем. Chrome на Windows і macOS зазвичай відхиляє пакети поза магазином: тоді використайте помічник або ZIP.', 'Het CRX-bestand is ondertekend met onze sleutel. Chrome op Windows en macOS weigert pakketten buiten de winkel meestal: gebruik dan de hulp of de ZIP.')}</p>
          {method !== 'terminal' ? <a className='wiz-primary' href={href} download onClick={() => { setDownloaded(true); p.onDownloaded(); setOpen('open'); }}><Download aria-hidden='true' />{tr(`Завантажити ${fileName}`, `Download ${fileName}`)}</a> : null}
          {downloaded && !present ? <p className='wiz-ok'>{tr('Файл завантажується. Знайдіть його в списку завантажень браузера (Ctrl+J) або в папці «Завантаження».', 'Het bestand wordt gedownload. Zoek het in de downloadlijst van de browser (Ctrl+J) of in de map "Downloads".')}</p> : null}
        </>
      ),
    });
    if (method === 'terminal') {
      list.push({ id: 'open', title: tr('Виконайте команду', 'Voer het commando uit'), done: present, manual: true, body: <p>{tr('Команда з попереднього кроку створила папку з розширенням. Далі: сторінка розширень браузера.', 'Het commando uit de vorige stap heeft de map met de extensie gemaakt. Daarna: de extensiepagina van de browser.')}</p> });
    } else if (method === 'helper') {
      list.push({
        id: 'open', title: tr('Запустіть помічник', 'Start de installatiehulp'), done: present, manual: true,
        body: <p>{os === 'windows' ? tr('Двічі клацніть завантажений файл Install-MijnRuimte.cmd. Якщо Windows питає «Захист SmartScreen», натисніть «Докладніше → Все одно виконати»: файл відкритий, його вміст можна переглянути в «Блокноті».', 'Dubbelklik op het gedownloade bestand Install-MijnRuimte.cmd. Vraagt Windows om "SmartScreen", kies dan "Meer informatie → Toch uitvoeren": het bestand is leesbaar en te bekijken in Kladblok.')
          : tr('Відкрийте термінал у папці завантажень і виконайте: bash install-mijn-ruimte.sh', 'Open een terminal in de map Downloads en voer uit: bash install-mijn-ruimte.sh')}</p>,
      });
    } else {
      list.push({
        id: 'open', title: tr('Розпакуйте у власну папку', 'Pak uit in een eigen map'), done: present, manual: true,
        body: <p>{tr('Правою кнопкою на ZIP → «Видобути все» (або двічі клацніть). Оберіть постійну папку, наприклад Документи\\MijnRuimte-extension, і не видаляйте її: браузер читає розширення саме з цієї папки.', 'Rechtsklik op de ZIP → "Alles uitpakken". Kies een vaste map, bijvoorbeeld Documenten\\MijnRuimte-extension, en verwijder die niet: de browser leest de extensie uit die map.')}</p>,
      });
    }
    list.push({
      id: 'page', title: tr('Відкрийте сторінку розширень', 'Open de extensiepagina'), done: present, manual: true,
      body: (
        <>
          <p>{tr(`Скопіюйте адресу, вставте її в адресний рядок ${info.name} і натисніть Enter. (Браузер не дозволяє відкрити цю сторінку з сайту посиланням.)`, `Kopieer het adres, plak het in de adresbalk van ${info.name} en druk op Enter. (De browser staat niet toe dat een site die pagina met een link opent.)`)}</p>
          <div className='wiz-copy'><code>{info.url}</code><button type='button' onClick={() => void copy(info.url)}>{copied ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{copied ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати', 'Kopiëren')}</button></div>
        </>
      ),
    });
    list.push({
      id: 'dev', title: tr('Увімкніть режим розробника', 'Zet de ontwikkelaarsmodus aan'), done: present, manual: true,
      body: <><p>{tr(`На сторінці розширень знайдіть ${info.devMode[0]} і увімкніть його.`, `Zoek op de extensiepagina ${info.devMode[1]} en zet hem aan.`)}</p><Mock kind='devmode' tr={tr} browser={browserScheme} /></>,
    });
    list.push({
      id: 'load', title: tr('Додайте розширення', 'Voeg de extensie toe'), done: present, manual: true,
      body: method === 'helper' || method === 'terminal'
        ? <><p>{tr(`Натисніть ${info.load[0]} і виберіть папку, яку показав помічник (за замовчуванням ${os === 'windows' ? '%USERPROFILE%\\MijnRuimte-extension' : '~/MijnRuimte-extension'}).`, `Kies ${info.load[1]} en selecteer de map die de hulp toonde (standaard ${os === 'windows' ? '%USERPROFILE%\\MijnRuimte-extension' : '~/MijnRuimte-extension'}).`)}</p><Mock kind='load' tr={tr} browser={browserScheme} /></>
        : <><p>{tr(`Натисніть ${info.load[0]} і виберіть розпаковану папку з файлом manifest.json.`, `Kies ${info.load[1]} en selecteer de uitgepakte map met het bestand manifest.json.`)}</p><Mock kind='load' tr={tr} browser={browserScheme} /></>,
    });
    list.push({
      id: 'found', title: tr('Розширення знайдено', 'Extensie gevonden'), done: present,
      body: present ? <p className='wiz-ok'>{tr('Готово: цей браузер бачить розширення.', 'Klaar: deze browser ziet de extensie.')}</p>
        : <p className='wiz-wait'><LoaderCircle className='wiz-spin' aria-hidden='true' />{p.presence === 'checking' ? tr('Перевіряємо…', 'Controleren…') : tr('Ще не бачимо розширення. Щойно ви його додасте, цей крок позначиться сам; сторінку оновлювати не треба. Якщо не з’являється, перезавантажте цю сторінку (F5).', 'We zien de extensie nog niet. Zodra u hem toevoegt, wordt deze stap vanzelf afgevinkt; vernieuwen is niet nodig. Verschijnt hij niet, vernieuw dan deze pagina (F5).')}</p>,
    });
    list.push({
      id: 'pair', title: tr('Підключіть до облікового запису', 'Koppel aan uw account'), done: p.paired && p.hasAgent,
      body: (
        <>
          <p>{tr('Ви вже ввійшли на сайті. Натисніть кнопку: розширення отримає одноразовий код і зв’яжеться з вашим акаунтом.', 'U bent al aangemeld op de site. Klik op de knop: de extensie krijgt een eenmalige code en koppelt met uw account.')}</p>
          <button type='button' className='wiz-primary' disabled={!present || p.busy || (p.paired && p.hasAgent)} onClick={p.onConnect}><Link2 aria-hidden='true' />{p.paired && p.hasAgent ? tr('Підключено', 'Gekoppeld') : tr('Підключити до мого облікового запису', 'Koppelen aan mijn account')}</button>
          {!present ? <p className='wiz-note'>{tr('Кнопка стане активною, щойно розширення буде знайдено.', 'De knop wordt actief zodra de extensie is gevonden.')}</p> : null}
        </>
      ),
    });
    list.push({
      id: 'enable', title: tr('Увімкніть для ШІ', 'Zet aan voor de AI'), done: p.agentEnabled,
      body: (
        <>
          <p>{tr('За замовчуванням ШІ зможе лише читати сторінки сайту. Усі дії зі змінами (кліки, введення, знімок екрана) чекатимуть вашого «Дозволити». Детальні перемикачі з’являться нижче, у картці браузера.', 'Standaard kan de AI alleen pagina\'s van de site lezen. Alle acties met wijzigingen (klikken, typen, schermopname) wachten op uw "Toestaan". Gedetailleerde schakelaars staan hieronder op de kaart van de browser.')}</p>
          <button type='button' className='wiz-primary' disabled={!p.hasAgent || p.busy || p.agentEnabled} onClick={p.onEnable}><Power aria-hidden='true' />{p.agentEnabled ? tr('Увімкнено', 'Aangezet') : tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')}</button>
        </>
      ),
    });
    list.push({
      id: 'ready', title: tr('Готово: ШІ активний', 'Klaar: de AI is actief'), done: p.agentArmed,
      body: <p className={p.agentArmed ? 'wiz-ok' : 'wiz-note'}>{p.agentArmed ? tr('Усе працює. ШІ активний, поки ви ввійшли на сайті.', 'Alles werkt. De AI is actief zolang u op de site bent aangemeld.') : tr('ШІ стає активним за хвилину після того, як ви ввійшли на сайті й увімкнули його. Залишайтеся на цій сторінці.', 'De AI wordt actief binnen een minuut nadat u bent aangemeld en hem hebt aangezet. Blijf op deze pagina.')}</p>,
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr, browser, os, method, folder, downloaded, present, p.presence, p.paired, p.hasAgent, p.agentEnabled, p.agentArmed, p.busy, copied, p.release, hasHelper, href, fileName, info]);

  const current = steps.find((s) => !s.done)?.id ?? 'ready';
  const done = steps.filter((s) => s.done).length;

  if (!info.supported) {
    return (
      <section className='wiz' data-browser-extension='true' data-welcome={p.welcome ? 'true' : 'false'}>
        <BrowserPicker tr={tr} value={browser} onChange={setBrowser} />
        <div className='wiz-unsupported' role='status'>
          <b>{tr(`${info.name} поки не підтримується`, `${info.name} wordt nog niet ondersteund`)}</b>
          <p>{browser === 'firefox'
            ? tr('Наше розширення побудоване для Chromium (Chrome, Edge, Opera, Brave, Vivaldi). Firefox потребує окремої збірки (інша модель фонових сторінок, немає chrome.debugger) і підпису Mozilla; це заплановано окремим етапом. Скористайтеся будь-яким із браузерів на Chromium: на цьому ж комп’ютері вони можуть працювати паралельно з Firefox.', 'Onze extensie is gebouwd voor Chromium (Chrome, Edge, Opera, Brave, Vivaldi). Firefox vraagt een aparte build (ander achtergrondmodel, geen chrome.debugger) en een Mozilla-handtekening; dat staat als aparte stap gepland. Gebruik een Chromium-browser: die draaien op dezelfde computer naast Firefox.')
            : tr('Safari вимагає розширення в окремому форматі через Xcode й Apple Developer-акаунт; це не заплановано найближчим часом. Скористайтеся браузером на Chromium (Chrome, Edge, Opera, Brave, Vivaldi).', 'Safari vraagt een extensie in een apart formaat via Xcode en een Apple Developer-account; dat staat niet op korte termijn gepland. Gebruik een Chromium-browser (Chrome, Edge, Opera, Brave, Vivaldi).')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className='wiz' data-browser-extension='true' data-welcome={p.welcome ? 'true' : 'false'}>
      <div className='wiz-head'>
        <span className='wiz-badge'><Puzzle aria-hidden='true' />{tr('Розширення браузера', 'Browserextensie')}</span>
        <h3>{p.welcome ? tr('Вітаємо! Завершіть налаштування розширення', 'Welkom! Rond de installatie van de extensie af') : tr('Встановлення розширення крок за кроком', 'De extensie stap voor stap installeren')}</h3>
        <p>{tr('Розширення дозволяє вашому ШІ-помічнику (Claude через наш конектор) читати сторінки цього сайту й виконувати в них дії. Воно працює лише на *.tarasevych.com, лише поки ви ввійшли на сайті й лише з тим, що ви дозволили.', 'Met de extensie kan uw AI-assistent (Claude via onze connector) pagina\'s van deze site lezen en er acties in uitvoeren. Hij werkt alleen op *.tarasevych.com, alleen zolang u bent aangemeld en alleen met wat u hebt toegestaan.')}</p>
        <div className='wiz-progress' role='progressbar' aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label={tr('Прогрес налаштування', 'Voortgang van de installatie')}>
          <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} /><b>{done}/{steps.length}</b>
        </div>
      </div>
      {p.hasAgent && p.presence === 'absent' ? <p className='wiz-note' role='status' data-ext-other='true'>{tr('У вашому акаунті вже є підключений браузер (див. список зліва). Цей майстер — для встановлення розширення в ЦЬОМУ браузері; кроки «Увімкнути для ШІ» і «Готово» нижче відображають стан уже підключеного браузера.', 'Er is al een browser aan uw account gekoppeld (zie de lijst links). Deze hulp is voor het installeren in DEZE browser; de stappen "Zet aan voor de AI" en "Klaar" tonen de toestand van de al gekoppelde browser.')}</p> : null}
      <BrowserPicker tr={tr} value={browser} onChange={setBrowser} />
      <ol className='wiz-steps' aria-label={tr('Кроки', 'Stappen')}>
        {steps.map((s, i) => {
          const state = s.done ? 'done' : s.id === current ? 'now' : 'later';
          const isOpen = open === s.id || (state === 'now' && open !== `closed-${s.id}`);
          return (
            <li key={s.id} className={`wiz-step ${state}`} data-step={s.id} data-state={state}>
              <button type='button' className='wiz-step-head' aria-expanded={isOpen} onClick={() => setOpen(isOpen ? `closed-${s.id}` : s.id)}>
                <span className='wiz-num' aria-hidden='true'>{s.done ? <Check /> : i + 1}</span>
                <span className='wiz-title'>{s.title}</span>
                <span className='wiz-chip'>{s.done ? tr('виконано', 'klaar') : state === 'now' ? tr('зараз', 'nu') : tr('далі', 'straks')}</span>
                <ChevronDown className='wiz-chev' aria-hidden='true' />
              </button>
              {isOpen ? <div className='wiz-step-body'>{s.body}</div> : null}
            </li>
          );
        })}
      </ol>
      {p.notice ? <p className='wiz-note' role='status'>{p.notice}</p> : null}
      <p className='wiz-foot'><ShieldCheck aria-hidden='true' />{tr('Під час встановлення ми нічого не просимо ввести: ні пароль, ні ключ. Хвилювання викликає лише режим розробника: так браузер вимагає для розширень поза магазином. Chrome Web Store: поки що ні (потрібен акаунт розробника).', 'Tijdens de installatie vragen we nergens om een wachtwoord of sleutel. De ontwikkelaarsmodus is nodig omdat browsers dat eisen voor extensies buiten de winkel. Chrome Web Store: nog niet (ontwikkelaarsaccount nodig).')}</p>
      {p.welcome && p.onClose && !p.agentArmed ? <button type='button' className='wiz-link' onClick={p.onClose}>{tr('Закрити підказку', 'Hulp sluiten')}</button> : null}
    </section>
  );
}

function BrowserPicker({ tr, value, onChange }: { tr: Tr; value: BrowserKey; onChange: (k: BrowserKey) => void }) {
  return (
    <div className='wiz-browsers' role='group' aria-label={tr('Ваш браузер', 'Uw browser')}>
      {BROWSERS.map((b) => (
        <button key={b.key} type='button' aria-pressed={value === b.key} onClick={() => onChange(b.key)} data-browser={b.key} title={b.supported ? b.name : tr(`${b.name}: поки не підтримується`, `${b.name}: nog niet ondersteund`)}>
          <Logo kind={b.logo} size={26} label={b.name} />
          <span>{b.name}</span>
          {!b.supported ? <small>{tr('скоро', 'later')}</small> : null}
        </button>
      ))}
    </div>
  );
}
