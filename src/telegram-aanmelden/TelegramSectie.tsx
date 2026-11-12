// «Способи входу» → Telegram (користувач). Усе про прив’язані облікові записи Telegram в одній спокійній картці:
//   · чітке двоколонкове порівняння даних профілю на сайті та даних безпосередньо з Telegram (повний номер, @ім’я, світлина, числовий ID — без жодного маскування);
//   · прив’язування у 3 кроки з поясненням кожного кроку (підтвердження власного номера та ключа доступу обов’язкове);
//   · картка виявлених змін даних («Було → Стало», «Ні, це не я» діє одразу, «Так, це я» — після відліку та ключа доступу);
//   · згрупована таблиця підтверджень за 3 категоріями, таємний і тривожний код та журнал останніх входів через Telegram.
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { leesBewaard } from '../lees-cache';
import { foutTekst, identiteitCtx, tgPost, type Ctx } from './api';
import { AftelKnop, useBevestiging, useEenmalig } from './Bevestigen';
import TelegramLogo from './TelegramLogo';
import { inlogStandNaam, koppelStandNaam, redenNaam, statusNaam } from './namen';
import { KEUZE_IDS, KEUZE_NAMEN, eisVan, keuzeToegestaan, type ActieSoort, type KeuzeId } from '../../shared/telegram-aanmelden/beleid';
import { KOPPEL_RECHTEN, tekstIn, type KoppelRecht } from '../../shared/telegram-aanmelden/model';
import { VELD_NAMEN } from '../../shared/telegram-aanmelden/teksten';
import { codeRedenTekst, codeZwakte } from '../../shared/telegram-aanmelden/code-sterkte';
import './telegram.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

type Vinger = { telegramId: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; fotoId: string };
type SiteProfiel = { naam: string; email: string; telefoon: string; heeftEigenFoto?: boolean };
type Koppeling = {
  id: string;
  naam: string;
  rechten: KoppelRecht[];
  stand: string;
  reden: string;
  kleur: string;
  vingerafdruk?: Partial<Vinger>;
  telegramId?: string;
  chatId?: string;
  telefoon?: string;
  gebruikersnaam?: string;
  voornaam?: string;
  achternaam?: string;
  fotoId?: string;
  heeftFoto?: boolean;
  aangemaaktOp: string;
  laatstGebruiktOp: string | null;
  gekoppeldIp?: string;
  gekoppeldLocatie?: string;
  gekoppeldApparaat?: string;
  laatstIp?: string;
  laatstLocatie?: string;
  laatstApparaat?: string;
};
type Wijziging = { id: string; koppelingId: string; ernst: 'vervalsing' | 'ernstig' | 'gewoon'; verschillen: Array<{ veld: string; oud: string; nieuw: string }>; status: string; aangemaaktOp: string };
type MatrixRij = { sleutel: string; naam: readonly [string, string]; minimum: KeuzeId; standaard: KeuzeId; gevoelig: boolean; keuze: KeuzeId; eis: string[][] };
type AanmeldingRij = {
  id: string;
  aangemaaktOp?: string;
  op?: string;
  dienst?: string;
  apparaat?: string;
  browser?: string;
  os?: string;
  ip?: string;
  locatie?: string;
  methode?: string;
  stand: string;
  reden?: string;
};
type Mijn = {
  mag: string;
  bot: string;
  limiet: number;
  aftel: { gewoon: number; ernstig: number };
  onbeantwoordUren: number;
  siteProfiel?: Partial<SiteProfiel>;
  code: { ingesteld: boolean; alarm: boolean; uitgeschakeld: boolean; reden: string; pauzeTot: string | null; mislukt: number; minLengte: number; maxLengte: number };
  koppelingen: Koppeling[];
  wijzigingen: Wijziging[];
  matrix: MatrixRij[];
  beschikbaar: string[];
  geblokkeerd: Array<{ apparaat: string; op: string; reden?: string }>;
  aanmeldingen: AanmeldingRij[];
  status: { stand: string; soort: string };
};

const RECHT_NAMEN: Record<KoppelRecht, [string, string, string, string]> = {
  aanmelden: ['Вхід', 'Aanmelden', 'Входити в Мій простір через цей Telegram.', 'Aanmelden bij Mijn Ruimte met deze Telegram.'],
  bevestigen: ['Підтвердження', 'Bevestigen', 'Підтверджувати дії кнопкою в Telegram за таблицею нижче.', 'Handelingen bevestigen met een knop in Telegram volgens de tabel hieronder.'],
  meldingen: ['Сповіщення', 'Meldingen', 'Отримувати миттєві сповіщення про входи та зміни безпеки.', 'Directe meldingen ontvangen over aanmeldingen en beveiligingswijzigingen.'],
};
const STAND_TOELICHTING: Record<string, [string, string]> = {
  gepauzeerd: ['Дані цього Telegram змінилися — підтвердьте зміну вище ключем доступу, щоб знову користуватися.', 'De gegevens van deze Telegram zijn gewijzigd — bevestig de wijziging hierboven met uw toegangssleutel om hem weer te gebruiken.'],
  geblokkeerd: ['Змінився номер телефону в Telegram. Із міркувань безпеки потрібне повторне прив’язування з новим номером і ключем доступу.', 'Het telefoonnummer in Telegram is gewijzigd. Uit veiligheid is opnieuw koppelen met een verse telefoonbevestiging en uw toegangssleutel vereist.'],
  uitgeschakeld: ['Цю прив’язку вимкнено. Щоб користуватися знову — прив’яжіть заново.', 'Deze koppeling is uitgeschakeld. Koppel opnieuw om haar weer te gebruiken.'],
};

const tijd = (iso: string | null | undefined, lang: Lang) =>
  iso ? new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { timeZone: 'Europe/Brussels', dateStyle: 'medium', timeStyle: 'short' }) : '—';

const tijdVolledig = (iso: string | null | undefined, lang: Lang) =>
  iso
    ? `${new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', {
        timeZone: 'Europe/Brussels',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })} (${lang === 'nl' ? 'Brussel' : 'Брюссель'})`
    : '—';

const leesSiteReserve = (): SiteProfiel => {
  const snap = leesBewaard<{ bindings?: Array<{ email?: string }>; phone?: { value?: string } }>('/api/owner/access/snapshot', { service: 'identity' });
  const email = snap?.bindings?.find((b) => typeof b.email === 'string' && b.email)?.email || '';
  const tel = typeof snap?.phone?.value === 'string' ? snap.phone.value : '';
  return { naam: '', email, telefoon: tel };
};

export default function TelegramSectie({ lang }: { lang: Lang }) {
  const ctx = useMemo<Ctx>(() => identiteitCtx(), []);
  const [mijn, setMijn] = useState<Mijn | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [wizard, setWizard] = useState(false);
  const { uitvoeren, venster } = useBevestiging(ctx, lang);
  const laden = useCallback(async () => {
    try {
      const r = await tgPost<Partial<Mijn>>(ctx, '/api/owner/telegram/mijn');
      if (!r || typeof r !== 'object' || !Array.isArray(r.koppelingen) || !r.code || !r.status) return;
      setMijn({
        ...(r as Mijn),
        wijzigingen: Array.isArray(r.wijzigingen) ? r.wijzigingen : [],
        koppelingen: r.koppelingen,
        matrix: Array.isArray(r.matrix) ? r.matrix : [],
        beschikbaar: Array.isArray(r.beschikbaar) ? r.beschikbaar : [],
        geblokkeerd: Array.isArray(r.geblokkeerd) ? r.geblokkeerd : [],
        aanmeldingen: Array.isArray(r.aanmeldingen) ? r.aanmeldingen : [],
      });
      setFout('');
    } catch (e) { setFout(foutTekst(lang, e)); }
  }, [ctx, lang]);
  useEffect(() => { void laden(); }, [laden]);
  const doeMet = async (fn: () => Promise<unknown>, ok: string) => {
    setMelding(''); setFout('');
    try { await uitvoeren(fn); setMelding(ok); await laden(); } catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  };

  if (!mijn) {
    return fout
      ? null
      : <section className='access-plane-section tga-sectie tga-gebruiker' id='aanmeldmethoden-telegram' data-telegram-sectie data-telegram-aanmelden aria-busy='true'>
          <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Завантажуємо розділ Telegram…', 'Telegram-sectie laden…')}</p>
        </section>;
  }

  const storing = mijn.status?.stand === 'storing';
  const reserve = leesSiteReserve();
  const site: SiteProfiel = {
    naam: mijn.siteProfiel?.naam || reserve.naam || '',
    email: mijn.siteProfiel?.email || reserve.email || '',
    telefoon: mijn.siteProfiel?.telefoon || reserve.telefoon || '',
    heeftEigenFoto: mijn.siteProfiel?.heeftEigenFoto,
  };
  const actieveAantal = mijn.koppelingen.filter((k) => k.stand !== 'uitgeschakeld').length;
  const kanKoppelen = !mijn.mag && actieveAantal < mijn.limiet;
  const standSleutel = storing ? 'storing' : mijn.status.stand;

  return <section className='access-plane-section tga-sectie tga-gebruiker' id='aanmeldmethoden-telegram' data-telegram-sectie data-telegram-aanmelden>
    {venster}
    <header className='tga-sectie-kop'>
      <span className='tga-sectie-icoon' aria-hidden='true'><TelegramLogo maat={24} /></span>
      <div className='tga-sectie-titel'>
        <h2>Telegram</h2>
        <p>{tr(lang, `Вхід, підтвердження дій і сповіщення безпеки через офіційного бота @${mijn.bot}.`, `Aanmelden, handelingen bevestigen en beveiligingsmeldingen via de officiële bot @${mijn.bot}.`)}</p>
      </div>
      <span className={`tga-stand tga-stand-${standSleutel}`} data-stand={standSleutel}>
        {storing ? tr(lang, 'Тимчасово не працює', 'Tijdelijk buiten werking') : statusNaam(lang, mijn.status.stand)}
      </span>
    </header>

    {storing && <p className='tga-storing' role='status'>{mijn.status.soort === 'lang'
      ? tr(lang, 'Telegram не відповідає вже понад 10 хвилин. Ваші дії підтверджуються іншими способами (ключем доступу) — нічого не заблоковано.',
        'Telegram antwoordt al meer dan 10 minuten niet. Uw handelingen worden met andere methoden (toegangssleutel) bevestigd — niets is geblokkeerd.')
      : tr(lang, 'Тимчасова затримка зв’язку з Telegram. Зазвичай це минає за кілька хвилин.',
        'Tijdelijke vertraging bij Telegram. Meestal is dat binnen enkele minuten voorbij.')}</p>}
    {melding && <p className='tga-ok' role='status'>{melding}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}

    {mijn.wijzigingen.map((w) => <WijzigingKaart key={w.id} ctx={ctx} lang={lang} w={w} k={mijn.koppelingen.find((x) => x.id === w.koppelingId)} klaar={laden} />)}

    {mijn.koppelingen.length > 0 && <div className='tga-lijst'>
      {mijn.koppelingen.map((k) => <KoppelingKaart key={k.id} ctx={ctx} lang={lang} k={k} site={site}
        opslaan={(naam, rechten) => doeMet(() => tgPost(ctx, '/api/owner/telegram/koppeling', { koppelingId: k.id, naam, rechten }), tr(lang, 'Збережено.', 'Opgeslagen.'))}
        ontkoppelen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/ontkoppelen', { koppelingId: k.id }), tr(lang, 'Telegram відв’язано. Бот більше не має доступу до вашого облікового запису.', 'Telegram ontkoppeld. De bot heeft geen toegang meer tot uw account.'))}
        opnieuw={() => setWizard(true)} />)}
    </div>}

    {!wizard && <div className='tga-koppel-balk'>
      <div className='tga-koppel-info'>
        <strong>{actieveAantal > 0
          ? tr(lang, `Прив’язано облікових записів Telegram: ${actieveAantal} із ${mijn.limiet}`, `Gekoppelde Telegram-accounts: ${actieveAantal} van ${mijn.limiet}`)
          : tr(lang, 'Telegram ще не прив’язано', 'Telegram is nog niet gekoppeld')}</strong>
        <small>{kanKoppelen
          ? tr(lang, 'Підтвердження прив’язки виконується вашим власним номером телефону в боті та ключем доступу на сайті.', 'Koppelen bevestigt u met uw eigen telefoonnummer in de bot en uw toegangssleutel op de site.')
          : mijn.mag === 'UITGESCHAKELD'
            ? tr(lang, 'Адміністратор тимчасово вимкнув Telegram для всіх. Наявні прив’язки збережено.', 'De beheerder heeft Telegram tijdelijk voor iedereen uitgezet. Bestaande koppelingen blijven bewaard.')
            : actieveAantal >= mijn.limiet || mijn.mag === 'LIMIET_BEREIKT'
              ? tr(lang, `Досягнуто ліміту прив’язаних облікових записів (${mijn.limiet}).`, `Het maximum aantal gekoppelde accounts (${mijn.limiet}) is bereikt.`)
              : tr(lang, 'Прив’язування нових облікових записів Telegram зараз недоступне для цього профілю.', 'Het koppelen van nieuwe Telegram-accounts is nu niet beschikbaar voor dit profiel.')}</small>
      </div>
      {kanKoppelen && <button type='button' className='tga-knop tga-knop-telegram' disabled={storing} onClick={() => setWizard(true)}>
        <TelegramLogo maat={18} />
        <span>{actieveAantal > 0 ? tr(lang, 'Додати ще один', 'Nog een toevoegen') : tr(lang, 'Прив’язати Telegram', 'Telegram koppelen')}</span>
      </button>}
    </div>}

    {wizard && <KoppelWizard ctx={ctx} lang={lang} bot={mijn.bot} site={site} aftel={mijn.aftel?.gewoon ?? 10} uitvoeren={uitvoeren} klaar={(ok) => { setWizard(false); if (ok) { setMelding(tr(lang, 'Telegram прив’язано. Ми надіслали підтвердження у чат.', 'Telegram gekoppeld. We stuurden een bevestiging in de chat.')); } void laden(); }} />}

    <GeheimeCode lang={lang} code={mijn.code} telefoons={mijn.koppelingen.map((k) => k.vingerafdruk?.telefoon || k.telefoon || '').join(' ')}
      instellen={(code, alarmCode) => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/instellen', { code, alarmCode }), tr(lang, 'Таємний код збережено.', 'Geheime code opgeslagen.'))}
      verwijderen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/verwijderen'), tr(lang, 'Таємний код видалено.', 'Geheime code verwijderd.'))}
      herstellen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/herstellen'), tr(lang, 'Таємний код знову працює.', 'De geheime code werkt weer.'))} />

    <Matrix ctx={ctx} lang={lang} rijen={mijn.matrix} beschikbaar={mijn.beschikbaar} opslaan={(body) => doeMet(() => tgPost(ctx, '/api/owner/telegram/matrix', body), tr(lang, 'Таблицю підтверджень збережено.', 'Bevestigingstabel opgeslagen.'))} />

    {mijn.aanmeldingen.length > 0 && <LaatsteAanmeldingen lang={lang} items={mijn.aanmeldingen} />}

    {mijn.geblokkeerd.length > 0 && <div className='tga-blok' data-geblokkeerd>
      <h3>{tr(lang, 'Заблоковані пристрої', 'Geblokkeerde apparaten')}</h3>
      <p className='tga-waarom'>{tr(lang, 'Із цих пристроїв вхід через Telegram неможливий, бо на них відхилили вхід («Ні, це не я») або зміну. Розблокуйте, лише якщо це справді ваш пристрій.', 'Vanaf deze apparaten kan niemand met Telegram aanmelden, omdat daar een aanmelding («Nee, dit ben ik niet») of wijziging werd geweigerd. Hef de blokkade alleen op als het echt uw apparaat is.')}</p>
      <ul className='tga-geblokkeerd'>{mijn.geblokkeerd.map((g) => <li key={g.apparaat}><span>{g.apparaat} · {tijd(g.op, lang)}</span>
        <button type='button' className='tga-knop tga-knop-klein' onClick={() => void doeMet(() => tgPost(ctx, '/api/owner/telegram/deblokkeren', { apparaat: g.apparaat }), tr(lang, 'Пристрій розблоковано.', 'Apparaat gedeblokkeerd.'))}>{tr(lang, 'Розблокувати (ключ доступу)', 'Deblokkeren (toegangssleutel)')}</button></li>)}</ul>
    </div>}
  </section>;
}

// ------------------------------------------------------------------------------------------------ двоколонкове порівняння без маскування
type TgIdentiteitGegevens = {
  telegramId?: string;
  chatId?: string;
  telefoon?: string;
  gebruikersnaam?: string;
  voornaam?: string;
  achternaam?: string;
  aangemaaktOp?: string;
  laatstGebruiktOp?: string | null;
  laatstApparaat?: string;
  laatstIp?: string;
  laatstLocatie?: string;
};

function IdentiteitVergelijking({ lang, site, tg, fotoUrl }: { lang: Lang; site: SiteProfiel; tg: TgIdentiteitGegevens; fotoUrl?: string }) {
  const [fotoFout, setFotoFout] = useState(false);
  useEffect(() => { setFotoFout(false); }, [fotoUrl]);
  const volledigeNaam = [tg.voornaam, tg.achternaam].filter(Boolean).join(' ') || '—';
  const tel = tg.telefoon ? `+${String(tg.telefoon).replace(/^\+/, '')}` : '—';
  const siteTel = site.telefoon ? `+${String(site.telefoon).replace(/^\+/, '')}` : '';
  const toonFoto = Boolean(fotoUrl && !fotoFout);
  const initiaal = (tg.voornaam || tg.gebruikersnaam || 'T').slice(0, 1).toUpperCase();
  const heeftSiteGegevens = Boolean(site.naam || site.email || siteTel);
  return <div className='tga-vergelijk'>
    <div className='tga-bron-kaart tga-bron-site'>
      <span className='tga-bron-label'>{tr(lang, 'Профіль на сайті · Мій простір', 'Profiel op de site · Mijn Ruimte')}</span>
      {heeftSiteGegevens ? <dl className='tga-dl'>
        {site.naam && <><dt>{tr(lang, 'Ім’я на сайті', 'Naam op de site')}</dt><dd>{site.naam}</dd></>}
        <dt>{tr(lang, 'Електронна пошта', 'E-mailadres')}</dt><dd className='tga-mono'>{site.email || '—'}</dd>
        <dt>{tr(lang, 'Телефон профілю на сайті', 'Telefoon van siteprofiel')}</dt>
        <dd className='tga-mono'>{siteTel || tr(lang, 'не вказано в профілі сайту', 'niet opgegeven in siteprofiel')}</dd>
      </dl> : <p className='tga-klein'>{tr(lang, 'Поточний обліковий запис «Мій простір», до якого прив’язано цей профіль Telegram.', 'Het huidige account in «Mijn Ruimte» waaraan dit Telegram-profiel is gekoppeld.')}</p>}
    </div>
    <div className='tga-bron-kaart tga-bron-tg'>
      <span className='tga-bron-label'><TelegramLogo maat={16} /> {tr(lang, 'Дані безпосередньо з Telegram', 'Gegevens rechtstreeks uit Telegram')}</span>
      <div className='tga-identiteit'>
        {toonFoto
          ? <img className='tga-foto-rond' src={fotoUrl} alt={tr(lang, 'Світлина профілю з Telegram', 'Profielfoto uit Telegram')} width={56} height={56} onError={() => setFotoFout(true)} />
          : <span className='tga-geen-foto' aria-hidden='true'>{initiaal}</span>}
        <dl className='tga-dl'>
          <dt>{tr(lang, 'Повний номер телефону', 'Volledig telefoonnummer')}</dt><dd className='tga-mono'>{tel}</dd>
          <dt>{tr(lang, 'Ім’я та прізвище в Telegram', 'Voor- en achternaam in Telegram')}</dt><dd>{volledigeNaam}</dd>
          <dt>{tr(lang, 'Псевдонім', 'Gebruikersnaam')}</dt><dd className='tga-mono'>{tg.gebruikersnaam ? `@${tg.gebruikersnaam}` : tr(lang, 'немає псевдоніма', 'geen @gebruikersnaam')}</dd>
          <dt>{tr(lang, 'Числовий ID користувача Telegram', 'Numerieke Telegram-gebruikers-ID')}</dt><dd className='tga-mono'>{tg.telegramId || '—'}</dd>
          {tg.chatId && <><dt>{tr(lang, 'ID приватної бесіди', 'Privéchat-ID')}</dt><dd className='tga-mono'>{tg.chatId}</dd></>}
          {tg.aangemaaktOp && <><dt>{tr(lang, 'Прив’язано', 'Gekoppeld')}</dt><dd>{tijdVolledig(tg.aangemaaktOp, lang)}</dd></>}
          {tg.laatstGebruiktOp !== undefined && <><dt>{tr(lang, 'Останній вхід або дія', 'Laatste aanmelding of actie')}</dt><dd>{tijdVolledig(tg.laatstGebruiktOp, lang)}</dd></>}
          {(tg.laatstApparaat || tg.laatstIp || tg.laatstLocatie) && <>
            <dt>{tr(lang, 'Останній пристрій, IP та місце', 'Laatste apparaat, IP en plaats')}</dt>
            <dd className='tga-mono'>{[tg.laatstApparaat, tg.laatstIp, tg.laatstLocatie].filter(Boolean).join(' · ')}</dd>
          </>}
        </dl>
      </div>
    </div>
  </div>;
}

function KoppelingKaart({ ctx, lang, k, site, opslaan, ontkoppelen, opnieuw }: { ctx: Ctx; lang: Lang; k: Koppeling; site: SiteProfiel; opslaan: (naam: string, rechten: KoppelRecht[]) => Promise<void>; ontkoppelen: () => Promise<void>; opnieuw: () => void }) {
  const [foto, setFoto] = useState('');
  const [naam, setNaam] = useState(k.naam);
  const [naamOpen, setNaamOpen] = useState(false);
  const [rechten, setRechten] = useState<KoppelRecht[]>(k.rechten);
  const [zeker, setZeker] = useState(false);
  const { bezig, doe } = useEenmalig();
  useEffect(() => { setNaam(k.naam); setRechten(k.rechten); }, [k.naam, k.rechten]);
  const heeftFoto = Boolean(k.vingerafdruk?.fotoId || k.fotoId || k.heeftFoto);
  useEffect(() => {
    if (heeftFoto) void tgPost<{ foto: string }>(ctx, '/api/owner/telegram/foto', { koppelingId: k.id }).then((r) => setFoto(r.foto)).catch(() => undefined);
  }, [ctx, k.id, heeftFoto]);

  const tgGegevens: TgIdentiteitGegevens = {
    telegramId: k.vingerafdruk?.telegramId || k.telegramId || '',
    chatId: k.chatId,
    telefoon: k.vingerafdruk?.telefoon || k.telefoon || '',
    gebruikersnaam: k.vingerafdruk?.gebruikersnaam ?? k.gebruikersnaam ?? '',
    voornaam: k.vingerafdruk?.voornaam ?? k.voornaam ?? '',
    achternaam: k.vingerafdruk?.achternaam ?? k.achternaam ?? '',
    aangemaaktOp: k.aangemaaktOp,
    laatstGebruiktOp: k.laatstGebruiktOp,
    laatstApparaat: k.laatstApparaat,
    laatstIp: k.laatstIp,
    laatstLocatie: k.laatstLocatie,
  };
  const toelichting = STAND_TOELICHTING[k.stand];
  const gewijzigd = naam.trim() !== k.naam || rechten.join() !== k.rechten.join();

  return <article className={`tga-kaart tga-kaart-${k.stand}`} data-koppeling={k.id} data-stand={k.stand}>
    <div className='tga-kaart-kop'>
      <div className='tga-kaart-titel'>
        <span aria-hidden='true'>{k.kleur}</span>
        {!naamOpen ? <>
          <strong>{k.naam}</strong>
          <span className={`tga-pil tga-pil-${k.stand}`}>{koppelStandNaam(lang, k.stand)}</span>
        </> : <form className='tga-naam' onSubmit={(e) => {
          e.preventDefault();
          const schoon = naam.trim();
          setNaamOpen(false);
          if (schoon && schoon !== k.naam) void doe(() => opslaan(schoon, rechten));
        }}>
          <input type='text' value={naam} maxLength={40} autoFocus onChange={(e) => setNaam(e.target.value)} aria-label={tr(lang, 'Назва прив’язки', 'Naam van de koppeling')} />
          <button type='submit' className='tga-knop tga-knop-hoofd tga-knop-klein' disabled={bezig || !naam.trim()}>{tr(lang, 'Зберегти', 'Opslaan')}</button>
          <button type='button' className='tga-knop tga-knop-klein' onClick={() => { setNaam(k.naam); setNaamOpen(false); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </form>}
      </div>
      {k.stand !== 'uitgeschakeld' && !naamOpen && <button type='button' className='tga-knop tga-knop-klein' onClick={() => setNaamOpen(true)}>{tr(lang, 'Змінити назву', 'Naam wijzigen')}</button>}
    </div>

    {toelichting && <p className={k.stand === 'geblokkeerd' ? 'tga-fout' : 'tga-let'}>{lang === 'nl' ? toelichting[1] : toelichting[0]}</p>}

    <IdentiteitVergelijking lang={lang} site={site} tg={tgGegevens} fotoUrl={foto} />

    {k.stand !== 'uitgeschakeld' && <>
      <fieldset className='tga-rechten'><legend>{tr(lang, 'Дозволи цієї прив’язки', 'Rechten van deze koppeling')}</legend>
        {KOPPEL_RECHTEN.map((r) => <label key={r} className='tga-schakel-rij'>
          <span className='tga-schakel-tekst'>
            <strong>{lang === 'nl' ? RECHT_NAMEN[r][1] : RECHT_NAMEN[r][0]}</strong>
            <small>{lang === 'nl' ? RECHT_NAMEN[r][3] : RECHT_NAMEN[r][2]}</small>
          </span>
          <input type='checkbox' className='tga-schakel-invoer' checked={rechten.includes(r)} onChange={(e) => setRechten(e.target.checked ? [...rechten, r] : rechten.filter((x) => x !== r))} />
        </label>)}
      </fieldset>
      {gewijzigd && <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig || rechten.length === 0 || !naam.trim()} onClick={() => void doe(() => opslaan(naam.trim(), rechten))}>{tr(lang, 'Зберегти дозволи', 'Rechten opslaan')}</button>
        <button type='button' className='tga-knop' disabled={bezig} onClick={() => { setNaam(k.naam); setRechten(k.rechten); }}>{tr(lang, 'Скасувати зміни', 'Wijzigingen terugdraaien')}</button>
      </div>}
    </>}

    <div className='tga-rij tga-kaart-voet'>
      {k.stand === 'geblokkeerd' && <button type='button' className='tga-knop tga-knop-hoofd' onClick={opnieuw}>{tr(lang, 'Прив’язати заново', 'Opnieuw koppelen')}</button>}
      {!zeker
        ? <button type='button' className='tga-knop tga-knop-gevaar' onClick={() => setZeker(true)}>{tr(lang, 'Відв’язати', 'Ontkoppelen')}</button>
        : <div className='tga-bevestig-inline'>
            <span>{tr(lang, 'Бот одразу втратить доступ; вхід і підтвердження через цей Telegram перестануть працювати.', 'De bot verliest meteen toegang; aanmelden en bevestigen met deze Telegram stoppen.')}</span>
            <div className='tga-rij'>
              <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void doe(ontkoppelen)}>{tr(lang, 'Так, відв’язати', 'Ja, ontkoppelen')}</button>
              <button type='button' className='tga-knop' onClick={() => setZeker(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </div>
          </div>}
    </div>
  </article>;
}

// ------------------------------------------------------------------------------------------------ прив’язування у 3 кроки
function KoppelWizard({ ctx, lang, bot, site, aftel, uitvoeren, klaar }: { ctx: Ctx; lang: Lang; bot: string; site: SiteProfiel; aftel: number; uitvoeren: <T>(fn: () => Promise<T>) => Promise<T>; klaar: (ok: boolean) => void }) {
  const [stap, setStap] = useState<1 | 2 | 3>(1);
  const [naam, setNaam] = useState(tr(lang, 'Особистий', 'Persoonlijk'));
  const [verzoek, setVerzoek] = useState<{ id: string; deeplink: string; verlooptOp: string } | null>(null);
  const [stand, setStand] = useState('');
  const [id, setId] = useState<{ telegramId: string; chatId?: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; foto: string } | null>(null);
  const [rechten, setRechten] = useState<KoppelRecht[]>(['aanmelden', 'bevestigen', 'meldingen']);
  const [mijn, setMijnTg] = useState(false);
  const [fout, setFout] = useState('');
  const { bezig, doe } = useEenmalig();

  const starten = () => doe(async () => {
    setFout('');
    try { const r = await tgPost<{ id: string; deeplink: string; verlooptOp: string }>(ctx, '/api/owner/telegram/koppelen/start', { naam, locale: lang }); setVerzoek(r); setStap(2); }
    catch (e) { setFout(foutTekst(lang, e)); }
  });
  useEffect(() => {
    if (stap !== 2 || !verzoek) return;
    let actief = true; let t = 0;
    const kijk = async () => {
      if (!actief) return;
      try {
        const s = await tgPost<{ stand: string; identiteit?: typeof id & { heeftFoto: boolean } }>(ctx, '/api/owner/telegram/koppelen/status', { id: verzoek.id });
        setStand(s.stand);
        if (s.stand === 'wacht-passkey' && s.identiteit) { setId(s.identiteit); setStap(3); return; }
        if (['verlopen', 'geweigerd', 'geannuleerd'].includes(s.stand)) return;
      } catch (e) { setFout(foutTekst(lang, e)); }
      t = window.setTimeout(kijk, 2000);
    };
    t = window.setTimeout(kijk, 1500);
    return () => { actief = false; window.clearTimeout(t); };
  }, [stap, verzoek]); // eslint-disable-line react-hooks/exhaustive-deps

  const annuleren = () => { if (verzoek) void tgPost(ctx, '/api/owner/telegram/koppelen/annuleren', { id: verzoek.id }).catch(() => undefined); klaar(false); };
  const bevestigen = () => doe(async () => {
    if (!verzoek) return;
    setFout('');
    try { await uitvoeren(() => tgPost(ctx, '/api/owner/telegram/koppelen/bevestigen', { id: verzoek.id, rechten })); klaar(true); }
    catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  });

  return <div className='tga-blok tga-wizard' data-koppel-wizard aria-live='polite'>
    <ol className='tga-wizard-stappen' aria-label={tr(lang, 'Кроки', 'Stappen')}>
      {[tr(lang, 'Назва', 'Naam'), tr(lang, 'Telegram і номер', 'Telegram en nummer'), tr(lang, 'Перевірка й ключ доступу', 'Controle en toegangssleutel')].map((s, i) => <li key={s} aria-current={stap === i + 1 ? 'step' : undefined} className={stap > i ? 'klaar' : ''}>{i + 1}. {s}</li>)}
    </ol>
    {stap === 1 && <div className='tga-kaart'>
      <label className='tga-veld'>{tr(lang, 'Як назвати цей Telegram (бачите лише ви)', 'Hoe heet deze Telegram (alleen voor u)')}<input type='text' value={naam} maxLength={40} onChange={(e) => setNaam(e.target.value)} /></label>
      <p className='tga-waarom'>{tr(lang, 'Навіщо: якщо прив’яжете кілька профілів Telegram (особистий, робочий), у кожному повідомленні буде видно, для якого саме це запит.', 'Waarom: koppelt u meerdere Telegram-profielen (persoonlijk, werk), dan ziet u in elk bericht voor welke het verzoek is.')}</p>
      <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig || naam.trim().length < 1} onClick={() => void starten()}>{tr(lang, 'Далі', 'Verder')}</button>
        <button type='button' className='tga-knop' onClick={annuleren}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
      </div>
    </div>}
    {stap === 2 && verzoek && <div className='tga-kaart'>
      <div className='tga-rij'>
        <a className='tga-knop tga-knop-telegram' href={verzoek.deeplink} target='_blank' rel='noopener noreferrer'><TelegramLogo maat={18} /><span>{tr(lang, `Відкрити @${bot} у Telegram`, `@${bot} openen in Telegram`)}</span></a>
      </div>
      <ol className='tga-stappen'>
        <li>{tr(lang, 'Натисніть «Почати» у чаті з ботом.', 'Tik in de chat met de bot op de knop onderaan om te beginnen.')}</li>
        <li>{tr(lang, 'Натисніть кнопку «📱 Поділитися моїм номером». Ввести номер вручну не можна.', 'Tik op de knop «📱 Mijn nummer delen». Een nummer typen kan niet.')}</li>
        <li>{tr(lang, 'Поверніться сюди — ми покажемо всі отримані дані без приховування.', 'Kom hier terug — we tonen alle ontvangen gegevens zonder iets te verbergen.')}</li>
      </ol>
      <p className='tga-waarom'>{tr(lang, 'Навіщо номер: Telegram надсилає лише ваш власний номер, підтверджений ним самим. Якщо колись хтось захопить ваш Telegram і змінить номер, прив’язку буде одразу заблоковано.',
        'Waarom het nummer: Telegram stuurt alleen uw eigen nummer, door Telegram zelf bevestigd. Neemt iemand ooit uw Telegram over en wijzigt het nummer, dan wordt de koppeling meteen geblokkeerd.')}</p>
      <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {stand === 'wacht-telefoon' ? tr(lang, 'Бот отримав команду запуску. Чекаємо на ваш номер…', 'De bot is gestart. Wachten op uw nummer…') : tr(lang, 'Чекаємо на відкриття Telegram…', 'Wachten op Telegram…')}</p>
      {stand === 'verlopen' && <p className='tga-fout'>{tr(lang, 'Час (10 хв) вийшов. Почніть знову.', 'De tijd (10 min) is om. Begin opnieuw.')}</p>}
      <div className='tga-rij'><button type='button' className='tga-knop' onClick={annuleren}>{tr(lang, 'Скасувати', 'Annuleren')}</button></div>
    </div>}
    {stap === 3 && id && <div className='tga-kaart'>
      <p><strong>{tr(lang, 'Перевірте: це справді ваш Telegram? Показано всі дані повністю, без скорочень.', 'Controleer: is dit echt uw Telegram? Alle gegevens staan er volledig, niets ingekort.')}</strong></p>
      <IdentiteitVergelijking lang={lang} site={site} tg={id} fotoUrl={id.foto} />
      <fieldset className='tga-rechten'><legend>{tr(lang, 'Що дозволити цій прив’язці', 'Wat deze koppeling mag')}</legend>
        {KOPPEL_RECHTEN.map((r) => <label key={r} className='tga-schakel-rij'>
          <span className='tga-schakel-tekst'>
            <strong>{lang === 'nl' ? RECHT_NAMEN[r][1] : RECHT_NAMEN[r][0]}</strong>
            <small>{lang === 'nl' ? RECHT_NAMEN[r][3] : RECHT_NAMEN[r][2]}</small>
          </span>
          <input type='checkbox' className='tga-schakel-invoer' checked={rechten.includes(r)} onChange={(e) => setRechten(e.target.checked ? [...rechten, r] : rechten.filter((x) => x !== r))} />
        </label>)}
      </fieldset>
      <label className='tga-schakel-rij'>
        <span className='tga-schakel-tekst'>
          <span>{tr(lang, 'Це мій власний номер і мій обліковий запис Telegram, і лише я маю до нього доступ.', 'Dit is mijn eigen nummer en mijn Telegram-account, en alleen ik heb er toegang toe.')}</span>
        </span>
        <input type='checkbox' className='tga-schakel-invoer' checked={mijn} onChange={(e) => setMijnTg(e.target.checked)} />
      </label>
      <p className='tga-waarom'>{tr(lang, 'Наступний крок попросить ваш ключ доступу — так ніхто з доступом лише до цього оглядача не зможе прив’язати свій Telegram.', 'De volgende stap vraagt uw toegangssleutel — zo kan niemand met alleen toegang tot deze browser zijn eigen Telegram koppelen.')}</p>
      <div className='tga-rij'>
        <AftelKnop lang={lang} seconden={aftel} bezig={bezig} uit={!mijn || rechten.length === 0} onClick={() => void bevestigen()}>{tr(lang, 'Так, це мій Telegram — прив’язати', 'Ja, dit is mijn Telegram — koppelen')}</AftelKnop>
        <button type='button' className='tga-knop tga-knop-gevaar' onClick={annuleren}>{tr(lang, 'Ні, це не мій', 'Nee, dit is niet de mijne')}</button>
      </div>
    </div>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ виявлені зміни даних
function WijzigingKaart({ ctx, lang, w, k, klaar }: { ctx: Ctx; lang: Lang; w: Wijziging; k?: Koppeling; klaar: () => void }) {
  const [aftel, setAftel] = useState<number | null>(null);
  const [begrepen, setBegrepen] = useState(false);
  const [uitkomst, setUitkomst] = useState('');
  const [fout, setFout] = useState('');
  const { bezig, doe } = useEenmalig();
  useEffect(() => { void tgPost<{ aftelSeconden: number }>(ctx, '/api/owner/telegram/wijziging/getoond', { id: w.id }).then((r) => setAftel(r.aftelSeconden)).catch(() => setAftel(10)); }, [ctx, w.id]);
  const ernstig = w.ernst !== 'gewoon';
  const antwoord = (a: 'ja' | 'nee') => doe(async () => {
    setFout('');
    try {
      const r = await tgPost<{ status: string; conflict: boolean; opnieuwKoppelen: boolean }>(ctx, '/api/owner/telegram/wijziging/antwoord', { id: w.id, antwoord: a, begrepen });
      setUitkomst(r.conflict ? tr(lang, 'Конфлікт відповідей: в одному місці підтвердили, в іншому — відхилили. Діє «Ні»: прив’язку вимкнено. Якщо це були ви — прив’яжіть знову.', 'Conflict: op de ene plek bevestigd, op de andere geweigerd. «Nee» wint: de koppeling is uitgeschakeld. Was u het wel — koppel opnieuw.')
        : r.opnieuwKoppelen ? tr(lang, 'Потрібне повторне прив’язування (новий номер + ключ доступу).', 'Opnieuw koppelen is nodig (nieuw nummer + toegangssleutel).')
          : a === 'ja' ? tr(lang, 'Зміну підтверджено — Telegram знову працює.', 'Wijziging bevestigd — Telegram werkt weer.') : tr(lang, 'Прив’язку вимкнено, сесії через цей Telegram завершено.', 'Koppeling uitgeschakeld, sessies via deze Telegram beëindigd.'));
      window.setTimeout(klaar, 2500);
    } catch (e) { setFout(foutTekst(lang, e)); }
  });
  return <article className={`tga-kaart tga-wijziging tga-ernst-${w.ernst}`} role='alert' data-wijziging={w.id}>
    <div className='tga-kaart-kop'>
      <strong>{w.ernst === 'vervalsing' ? tr(lang, 'Підозріла зміна даних Telegram', 'Verdachte wijziging van Telegram-gegevens') : ernstig ? tr(lang, 'Важлива зміна даних Telegram', 'Belangrijke wijziging van Telegram-gegevens') : tr(lang, 'Змінилися дані Telegram', 'Telegram-gegevens gewijzigd')}</strong>
      {k && <span className='tga-pil'>{k.kleur} {k.naam}</span>}
    </div>
    <p className='tga-waarom'>{tr(lang, 'Навіщо питаємо: якщо хтось захопив ваш Telegram, він спершу змінює псевдонім, ім’я, світлину чи номер. Доки ви не підтвердите це ключем доступу на сайті, прив’язку призупинено.',
      'Waarom we dit vragen: wie uw Telegram overneemt, wijzigt eerst de gebruikersnaam, naam, foto of het nummer. Tot u dit met uw toegangssleutel op de site bevestigt, staat de koppeling op pauze.')}</p>
    <table className='tga-verschil'><thead><tr><th>{tr(lang, 'Поле', 'Veld')}</th><th>{tr(lang, 'Було', 'Was')}</th><th>{tr(lang, 'Стало', 'Nu')}</th></tr></thead>
      <tbody>{w.verschillen.map((v) => <tr key={v.veld}><td>{VELD_NAMEN[v.veld]?.[lang] ?? v.veld}</td><td className='tga-mono'>{v.oud || '—'}</td><td className='tga-mono tga-nieuw'>{v.nieuw || '—'}</td></tr>)}</tbody></table>
    {uitkomst ? <p className='tga-ok'>{uitkomst}</p> : <>
      {ernstig && <label className='tga-schakel-rij'>
        <span className='tga-schakel-tekst'><span>{tr(lang, 'Я власноруч виконав(ла) цю зміну і розумію: якщо це не так, підтвердження надасть доступ сторонній особі.', 'Ik heb deze wijziging zelf gedaan en begrijp: is dat niet zo, dan geeft bevestigen een vreemde toegang.')}</span></span>
        <input type='checkbox' className='tga-schakel-invoer' checked={begrepen} onChange={(e) => setBegrepen(e.target.checked)} />
      </label>}
      <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void antwoord('nee')}>{tr(lang, 'Ні, це не я', 'Nee, dit ben ik niet')}</button>
        {w.ernst !== 'vervalsing' && aftel !== null && <AftelKnop lang={lang} seconden={aftel} bezig={bezig} uit={ernstig && !begrepen} onClick={() => void antwoord('ja')}>{tr(lang, 'Так, це я (ключ доступу)', 'Ja, dit ben ik (toegangssleutel)')}</AftelKnop>}
      </div>
      <p className='tga-klein'>{tr(lang, '«Ні» діє одразу й завжди переважає — навіть якщо в Telegram натиснули «Так».', '«Nee» werkt meteen en wint altijd — ook als in Telegram «Ja» werd getikt.')}</p>
    </>}
    {fout && <p className='tga-fout'>{fout}</p>}
  </article>;
}

// ------------------------------------------------------------------------------------------------ згрупована таблиця підтверджень за 3 категоріями
const MATRIX_GROEPEN: ReadonlyArray<{ id: string; titel: [string, string]; sleutels: readonly string[]; standaardOpen?: boolean }> = [
  { id: 'dagelijks', titel: ['Вхід і щоденні дії', 'Aanmelden en dagelijks gebruik'], sleutels: ['aanmelden', 'stap-op', 'nieuw-apparaat', 'bestanden-bekijken'], standaardOpen: true },
  { id: 'toegang', titel: ['Прив’язка Telegram і способи входу', 'Telegram-koppeling en aanmeldmethoden'], sleutels: ['wijziging-bevestigen', 'koppelen', 'ontkoppelen', 'koppeling-wijzigen', 'aanmeldmethoden', 'telefoon', 'e-mail-wachtwoord', 'geheime-code', 'matrix-wijzigen'] },
  { id: 'beheer', titel: ['Платежі та адміністрування', 'Betalingen en beheer'], sleutels: ['betalingen', 'beheer-instellingen', 'beheer-bot-sleutel'] },
];

function Matrix({ lang, rijen, beschikbaar, opslaan }: { ctx: Ctx; lang: Lang; rijen: MatrixRij[]; beschikbaar: string[]; opslaan: (body: Record<string, unknown>) => Promise<void> }) {
  const [keuzes, setKeuzes] = useState<Record<string, KeuzeId>>(() => Object.fromEntries(rijen.map((r) => [r.sleutel, r.keuze])));
  const [open, setOpen] = useState(false);
  useEffect(() => setKeuzes(Object.fromEntries(rijen.map((r) => [r.sleutel, r.keuze]))), [rijen]);
  const { bezig, doe } = useEenmalig();
  const gewijzigd = rijen.some((r) => keuzes[r.sleutel] !== r.keuze);
  const afwijkend = useMemo(() => rijen.filter((r) => (keuzes[r.sleutel] ?? r.standaard) !== r.standaard).length, [rijen, keuzes]);
  const haalbaar = (k: KeuzeId) => eisVan(k).some((alt) => alt.every((m) => beschikbaar.includes(m)));
  const bekendeSleutels = useMemo(() => new Set(MATRIX_GROEPEN.slice(0, 2).flatMap((g) => g.sleutels)), []);
  const groepen = useMemo(() => MATRIX_GROEPEN.map((g, idx) => ({
    ...g,
    items: idx < 2
      ? rijen.filter((r) => g.sleutels.includes(r.sleutel))
      : rijen.filter((r) => !bekendeSleutels.has(r.sleutel)),
  })).filter((g) => g.items.length > 0), [rijen, bekendeSleutels]);

  return <div className='tga-blok tga-matrix' data-bevestigingsmatrix>
    <div className='tga-blok-kop'>
      <div className='tga-blok-titel'>
        <h3>{tr(lang, 'Чим підтверджувати дії', 'Waarmee handelingen bevestigen')}</h3>
        <span className='tga-pil'>
          {afwijkend === 0
            ? tr(lang, `Типові правила (${rijen.length})`, `Standaardregels (${rijen.length})`)
            : tr(lang, `Власних правил: ${afwijkend} із ${rijen.length}`, `Eigen regels: ${afwijkend} van ${rijen.length}`)}
        </span>
      </div>
      <button type='button' className='tga-knop tga-knop-klein' aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? tr(lang, 'Згорнути правила', 'Regels inklappen') : tr(lang, `Налаштувати по діях (${rijen.length})`, `Per handeling instellen (${rijen.length})`)}</span>
        <ChevronDown className={`tga-matrix-groep-pijl${open ? ' is-open' : ''}`} aria-hidden='true' />
      </button>
    </div>
    <p className='tga-klein'>{tr(lang, 'Ви обираєте спосіб підтвердження для кожної дії. Мінімум задає адміністратор; чутливі дії завжди потребують ключа доступу.',
      'U kiest per handeling de bevestigingsmethode. Het minimum zet de beheerder; gevoelige handelingen vragen altijd een toegangssleutel.')}</p>
    <div className='tga-rij'>
      {(['standaard', 'telegram-overal', 'veiligst'] as const).map((v) => <button key={v} type='button' className='tga-knop tga-knop-klein' disabled={bezig} onClick={() => void doe(() => opslaan({ voorinstelling: v }))}>
        {v === 'standaard' ? tr(lang, 'Як радить адміністратор', 'Zoals de beheerder aanraadt') : v === 'veiligst' ? tr(lang, 'Найбезпечніше', 'Veiligst') : tr(lang, 'Telegram скрізь, де можна', 'Telegram waar het mag')}
      </button>)}
    </div>
    {open && <div className='tga-matrix-groepen'>
      {groepen.map((g) => <details key={g.id} className='tga-matrix-groep' open={g.standaardOpen}>
        <summary className='tga-matrix-groep-kop'>
          <span className='tga-matrix-groep-titel'>
            <span>{tr(lang, g.titel[0], g.titel[1])}</span>
            <span className='tga-pil'>{g.items.length}</span>
          </span>
          <ChevronDown className='tga-matrix-groep-pijl' aria-hidden='true' />
        </summary>
        <div className='tga-matrix-lijst'>
          {g.items.map((r) => {
            const soort = { sleutel: r.sleutel, naam: r.naam, minimum: r.minimum, standaard: r.standaard, gevoelig: r.gevoelig, ingebouwd: true } as ActieSoort;
            const gekozen = keuzeToegestaan(soort, keuzes[r.sleutel]) ? keuzes[r.sleutel] : soort.minimum;
            return <div key={r.sleutel} className='tga-matrix-rij' data-matrix-actie={r.sleutel}>
              <div className='tga-matrix-info'>
                <span className='tga-matrix-naam'>
                  <strong>{tekstIn(r.naam, lang)}</strong>
                  {r.gevoelig && <span className='tga-pil tga-pil-sleutel'>{tr(lang, 'Ключ обов’язковий', 'Sleutel verplicht')}</span>}
                </span>
              </div>
              <select value={gekozen} onChange={(e) => setKeuzes({ ...keuzes, [r.sleutel]: e.target.value as KeuzeId })} aria-label={tekstIn(r.naam, lang)}>
                {KEUZE_IDS.filter((k) => keuzeToegestaan(soort, k)).map((k) => <option key={k} value={k} disabled={!haalbaar(k)}>{tekstIn(KEUZE_NAMEN[k], lang)}{!haalbaar(k) ? tr(lang, ' (спершу налаштуйте)', ' (eerst instellen)') : ''}</option>)}
              </select>
            </div>;
          })}
        </div>
      </details>)}
      {gewijzigd && <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig} onClick={() => void doe(() => opslaan({ keuzes }))}>{tr(lang, 'Зберегти таблицю', 'Tabel opslaan')}</button>
        <button type='button' className='tga-knop' disabled={bezig} onClick={() => setKeuzes(Object.fromEntries(rijen.map((r) => [r.sleutel, r.keuze])))}>{tr(lang, 'Скасувати зміни', 'Wijzigingen terugdraaien')}</button>
      </div>}
    </div>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ таємний код (згорнутий за замовчуванням)
function GeheimeCode({ lang, code, telefoons, instellen, verwijderen, herstellen }: { lang: Lang; code: Mijn['code']; telefoons: string; instellen: (c: string, a: string) => Promise<void>; verwijderen: () => Promise<void>; herstellen: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [c1, setC1] = useState(''); const [c2, setC2] = useState(''); const [alarm, setAlarm] = useState('');
  const { bezig, doe } = useEenmalig();
  const zwak = c1 ? codeZwakte(c1, { min: code.minLengte, max: code.maxLengte, telefoon: telefoons }) : null;
  const alarmZwak = alarm ? codeZwakte(alarm, { min: code.minLengte, max: code.maxLengte, telefoon: telefoons }) : null;
  const sterkte = !c1 ? 0 : zwak ? 1 : c1.length >= code.minLengte + 4 && /\D/.test(c1) ? 3 : 2;
  const klaar = c1 && !zwak && c1 === c2 && (!alarm || (!alarmZwak && alarm !== c1));
  const opPauze = Boolean(code.pauzeTot && new Date(code.pauzeTot).getTime() > Date.now());
  const pilKlas = !code.ingesteld ? '' : code.uitgeschakeld ? 'tga-pil-geblokkeerd' : opPauze ? 'tga-pil-gepauzeerd' : 'tga-pil-actief';
  const pilTekst = !code.ingesteld
    ? tr(lang, 'Не налаштовано', 'Niet ingesteld')
    : code.uitgeschakeld
      ? tr(lang, `Вимкнено (${redenNaam(lang, code.reden) || tr(lang, 'безпека', 'beveiliging')})`, `Uitgeschakeld (${redenNaam(lang, code.reden) || 'beveiliging'})`)
      : opPauze
        ? tr(lang, `Призупинено до ${tijd(code.pauzeTot, lang)}`, `Gepauzeerd tot ${tijd(code.pauzeTot, lang)}`)
        : tr(lang, `Налаштовано${code.alarm ? ' · є тривожний код' : ''}`, `Ingesteld${code.alarm ? ' · alarmcode aanwezig' : ''}`);

  return <div className='tga-blok tga-code' data-geheime-code>
    <div className='tga-blok-kop'>
      <div className='tga-blok-titel'>
        <h3>{tr(lang, 'Таємний код', 'Geheime code')}</h3>
        <span className={`tga-pil ${pilKlas}`}>{pilTekst}</span>
      </div>
      {!open && <div className='tga-rij'>
        {code.ingesteld && code.uitgeschakeld && <button type='button' className='tga-knop tga-knop-klein' disabled={bezig} onClick={() => void doe(herstellen)}>{tr(lang, 'Відновити код (ключ доступу)', 'Code herstellen (toegangssleutel)')}</button>}
        <button type='button' className='tga-knop tga-knop-klein' onClick={() => setOpen(true)}>{code.ingesteld ? tr(lang, 'Змінити код', 'Code wijzigen') : tr(lang, 'Налаштувати код', 'Code instellen')}</button>
        {code.ingesteld && <button type='button' className='tga-knop tga-knop-gevaar tga-knop-klein' disabled={bezig} onClick={() => void doe(verwijderen)}>{tr(lang, 'Видалити код', 'Code verwijderen')}</button>}
      </div>}
    </div>
    <p className='tga-klein'>{tr(lang, 'Додатковий рубіж захисту: навіть маючи доступ до вашого Telegram, ніхто не увійде без коду, який знаєте лише ви. Код вводиться лише на сайті — ніколи в чаті.',
      'Extra bescherming: ook met toegang tot uw Telegram komt niemand binnen zonder de code die alleen u kent. U vult deze code alleen op de site in — nooit in de chat.')}</p>
    {open && <form className='tga-code-form' onSubmit={(e) => { e.preventDefault(); if (klaar) void doe(async () => { await instellen(c1, alarm); setOpen(false); setC1(''); setC2(''); setAlarm(''); }); }}>
      <label className='tga-veld'>{tr(lang, `Код (${code.minLengte}–${code.maxLengte} символів)`, `Code (${code.minLengte}–${code.maxLengte} tekens)`)}<input type='password' autoComplete='new-password' autoFocus value={c1} maxLength={code.maxLengte} onChange={(e) => setC1(e.target.value)} /></label>
      <meter min={0} max={3} low={1.5} high={2.5} optimum={3} value={sterkte} aria-label={tr(lang, 'Надійність коду', 'Sterkte van de code')} />
      {zwak && <p className='tga-fout'>{codeRedenTekst(zwak, lang, code.minLengte, code.maxLengte)}</p>}
      <label className='tga-veld'>{tr(lang, 'Повторіть код', 'Herhaal de code')}<input type='password' autoComplete='new-password' value={c2} maxLength={code.maxLengte} onChange={(e) => setC2(e.target.value)} /></label>
      {c2 && c1 !== c2 && <p className='tga-fout'>{tr(lang, 'Коди не збігаються.', 'De codes zijn niet gelijk.')}</p>}
      <label className='tga-veld'>{tr(lang, 'Тривожний код (необов’язково)', 'Alarmcode (optioneel)')}<input type='password' autoComplete='off' value={alarm} maxLength={code.maxLengte} onChange={(e) => setAlarm(e.target.value)} /></label>
      <p className='tga-klein'>{tr(lang, 'Якщо вас примушують увійти — введіть тривожний код. Зовні це виглядатиме як звичайна невдача, але всі прив’язки Telegram буде одразу вимкнено, а адміністратор отримає тривогу.',
        'Wordt u gedwongen aan te melden — typ de alarmcode. Van buiten lijkt het een gewone mislukking, maar alle Telegram-koppelingen worden meteen uitgezet en de beheerder krijgt een alarm.')}</p>
      {alarmZwak && <p className='tga-fout'>{codeRedenTekst(alarmZwak, lang, code.minLengte, code.maxLengte)}</p>}
      {alarm && alarm === c1 && <p className='tga-fout'>{tr(lang, 'Тривожний код має відрізнятися від основного.', 'De alarmcode moet anders zijn dan de gewone code.')}</p>}
      <div className='tga-rij'>
        <button type='submit' className='tga-knop tga-knop-hoofd' disabled={!klaar || bezig}>{tr(lang, 'Зберегти (ключ доступу)', 'Opslaan (toegangssleutel)')}</button>
        <button type='button' className='tga-knop' onClick={() => { setOpen(false); setC1(''); setC2(''); setAlarm(''); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
      </div>
    </form>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ журнал останніх входів через Telegram
function LaatsteAanmeldingen({ lang, items }: { lang: Lang; items: AanmeldingRij[] }) {
  const [open, setOpen] = useState(false);
  const zichtbaar = open ? items : items.slice(0, 3);
  return <div className='tga-blok' data-telegram-aanmeldingen>
    <div className='tga-blok-kop'>
      <div className='tga-blok-titel'>
        <h3>{tr(lang, 'Останні входи та спроби через Telegram', 'Laatste aanmeldingen en pogingen via Telegram')}</h3>
        <span className='tga-pil'>{items.length}</span>
      </div>
      {items.length > 3 && <button type='button' className='tga-knop tga-knop-klein' aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? tr(lang, 'Показати менше', 'Minder tonen') : tr(lang, `Усі записи (${items.length})`, `Alle regels (${items.length})`)}</span>
        <ChevronDown className={`tga-matrix-groep-pijl${open ? ' is-open' : ''}`} aria-hidden='true' />
      </button>}
    </div>
    <div className='tga-inlog-lijst'>
      {zichtbaar.map((a) => {
        const gelukt = a.stand === 'ingewisseld';
        const geweigerd = a.stand === 'geweigerd';
        const pilKlas = gelukt ? 'tga-pil-actief' : geweigerd ? 'tga-pil-geblokkeerd' : 'tga-pil-gepauzeerd';
        const apparaatRegel = [a.dienst, a.apparaat, a.browser, a.os].filter(Boolean).join(' · ');
        const netwerkRegel = [a.ip, a.locatie, a.methode === 'widget' ? tr(lang, 'вікно входу', 'aanmeldvenster') : a.methode === 'bot' ? tr(lang, 'бот', 'bot') : ''].filter(Boolean).join(' · ');
        return <div key={a.id} className='tga-inlog-rij'>
          <div className='tga-kaart-kop'>
            <span className='tga-klein'>{tijdVolledig(a.aangemaaktOp || a.op, lang)}</span>
            <span className={`tga-pil ${pilKlas}`}>{inlogStandNaam(lang, a.stand)}{a.reden ? ` · ${redenNaam(lang, a.reden) || a.reden}` : ''}</span>
          </div>
          {apparaatRegel && <span>{apparaatRegel}</span>}
          {netwerkRegel && <span className='tga-mono tga-klein'>{netwerkRegel}</span>}
        </div>;
      })}
    </div>
  </div>;
}
