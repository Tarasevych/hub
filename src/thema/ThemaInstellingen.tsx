// Налаштування → «Вигляд і кольори» (KLEUREN-001, 16.11.2026): ОДНА зона для всього, що фарбує сайт. Угорі живий приклад, нижче три
// згортні блоки в порядку шарів: «Основа» (палітра + режим + автоперемикання), «Акцент», «Тло і глибина» (живий фон, прозорість, сяйво).
// Меню облікового запису й картки «Макета» — лише швидкі перемикачі тих самих полів облікового запису.
// Eén zone voor alles wat de site kleurt: een levend voorbeeld en drie inklapbare blokken in de volgorde van de lagen.
// Режим — це шар поверх кольорів: кожен палет має світлий і темний тон.
import { Clock, LocateFixed, Monitor, Moon, Pause, Play, Sun, SunMoon, X } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { ThemePreference } from '../gedeelde-voorkeuren';
import { isKlassiekPalet, leesKeuze, PLAATSEN, STANDAARD_PLAATS, zonTijden, type AutoInstelling, type Palet } from './kern';
import { hervatAuto, pauzeerAuto, useAutoStatus, zetAuto, zetPalet } from './useThema';
import { KLASSIEK_WIT, KLASSIEK_ZWART, kleurWaarden, MAQUETTE, PUUR, SECTIES, type Sectie } from './paletten';
import './thema-instellingen.css';
import { AccentKeuze, TransparantieEnEffecten } from './WeergaveVoorkeuren';
import { useThemaStand } from './useThema';
import { ACCENT_NAMEN } from './weergave-stijl';
import { LAAG_UITLEG, VoorbeeldVenster, ZoneBlok, ZoneVoet, type ZoneLaag } from './VormgevingZone';
import { achtergrondNiveau, achtergrondVolledig, UITERLIJK_EFFECTEN_STANDAARD } from '../../shared/uiterlijk';
import AchtergrondInstellingen from '../achtergrond/AchtergrondInstellingen';
// REESTR-LOGO-001: власні логотипи сервісів — окремий лінивий шматок (каталог марок потрібен лише тут).
const MijnLogos = lazy(() => import('../merk/MijnLogos'));

type Tr = (uk: string, nl: string) => string;
type Props = { tr: Tr; lang: 'uk' | 'nl'; theme: ThemePreference; onTheme: (t: ThemePreference) => void; violetToegestaan: boolean };

const GRIFEL = { licht: { bg: '#f7f8fa', panel: '#ffffff', accent: '#2f6f73', text: '#17212b' }, donker: { bg: '#14181d', panel: '#20262d', accent: '#8dbab7', text: '#f3f6f8' } };
const VIOLET = { licht: { bg: '#f8f3f8', panel: '#fffafd', accent: '#6f355f', text: '#35243a' }, donker: { bg: '#21161f', panel: '#2d1e2a', accent: '#d8a4c7', text: '#faedf6' } };
type Mini = { bg: string; panel: string; accent: string; text: string };

function Voorbeeld({ w, label }: { w: Mini; label: string }) {
  return <span className='thema-voorbeeld' style={{ background: w.bg, color: w.text }} aria-hidden data-label={label}>
    <span className='thema-voorbeeld-balk' style={{ background: w.panel }}><i style={{ background: w.accent }} /><i style={{ background: w.text, opacity: .55 }} /></span>
    <span className='thema-voorbeeld-kaart' style={{ background: w.panel }}><i style={{ background: w.accent }} /></span>
  </span>;
}
const tijd = (t: number, lang: 'uk' | 'nl') => new Date(t).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit' });
const datum = (t: number, lang: 'uk' | 'nl') => new Date(t).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: '2-digit', month: '2-digit' });
/** IDENTITEIT-015 (приймання thema): статус називає СПРАВЖНЄ перемикання. У полярний день/ніч раніше стояло «наступне перемикання о 00:00»,
 *  хоча о північ нічого не змінюється. Далі ніж за добу — з датою; не знайдено — чесно «найближчим часом немає».
 *  De status noemt de echte wissel: bij poolnacht/-dag stond er «om 00:00» terwijl er dan niets wisselt. */
function wisselTekst(wissel: number | null, nu: number, tr: Tr, lang: 'uk' | 'nl'): string {
  if (wissel === null) return ` · ${tr('перемикань найближчим часом немає', 'voorlopig geen wissel')}`;
  if (wissel - nu <= 24 * 3600 * 1000) return ` · ${tr('наступне перемикання о', 'volgende wissel om')} ${tijd(wissel, lang)}`;
  return ` · ${tr('наступне перемикання', 'volgende wissel')} ${datum(wissel, lang)} ${tr('о', 'om')} ${tijd(wissel, lang)}`;
}

export default function ThemaInstellingen({ tr, lang, theme, onTheme, violetToegestaan }: Props) {
  const status = useAutoStatus(theme);
  const keuze = leesKeuze(theme, status.palet);
  const modus = keuze.modus, palet = keuze.palet;
  const a = status.auto;
  const sectie = (document.documentElement.dataset.presentationService || 'identity') as Sectie;
  const [geoMelding, setGeoMelding] = useState('');
  // KLEUREN-001: шар, який зараз підсвічено в живому прикладі (наведення/фокус на блоці чи рядку легенди).
  const [wijs, setWijs] = useState<ZoneLaag | null>(null);
  const { stijl, achtergrond } = useThemaStand();
  const kies = (p: Palet) => { zetPalet(p); if (theme === 'plum-light' || theme === 'plum-dark') onTheme(theme === 'plum-dark' ? 'dark' : 'light'); };
  const auto = (patch: Partial<AutoInstelling>) => zetAuto({ ...a, ...patch, pauzeTot: undefined, pauzeModus: undefined });
  const plaatsId = PLAATSEN.find((p) => p.lat === a.lat && p.lon === a.lon)?.id || (a.lat !== undefined ? 'eigen' : 'brussel');
  const zon = zonTijden(new Date(), a.lat ?? STANDAARD_PLAATS.lat, a.lon ?? STANDAARD_PLAATS.lon);
  const zoek = () => {
    if (!('geolocation' in navigator)) { setGeoMelding(tr('Браузер не підтримує визначення місця. Оберіть місто зі списку.', 'De browser kan de locatie niet bepalen. Kies een stad uit de lijst.')); return; }
    setGeoMelding(tr('Запитую місце в браузера…', 'Locatie opvragen bij de browser…'));
    navigator.geolocation.getCurrentPosition(
      (p) => { auto({ soort: 'zon', lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10, plaats: tr('Моє місце (приблизно)', 'Mijn plaats (ongeveer)') }); setGeoMelding(tr('Збережено приблизно (до ~10 км) у налаштуваннях облікового запису — так тема перемикається однаково на всіх ваших пристроях і піддоменах. Точне місце не зберігається.', 'Bij benadering bewaard (tot ~10 km) in de accountinstellingen — zo wisselt het thema gelijk op al uw apparaten en subdomeinen. De exacte plaats wordt niet bewaard.')); },
      () => setGeoMelding(tr('Місце не надано. Оберіть місто зі списку — так теж працює.', 'Geen locatie gekregen. Kies een stad uit de lijst — dat werkt ook.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 24 * 3600 * 1000 },
    );
  };
  const modi: Array<[ThemePreference, string, string, ReactNode]> = [
    ['light', tr('Світлий', 'Licht'), tr('Завжди світлий', 'Altijd licht'), <Sun key='i' aria-hidden />],
    ['dark', tr('Темний', 'Donker'), tr('Завжди темний', 'Altijd donker'), <Moon key='i' aria-hidden />],
    ['device', tr('Як на пристрої', 'Zoals apparaat'), tr('Повторює налаштування Windows / телефону', 'Volgt de instelling van Windows / telefoon'), <Monitor key='i' aria-hidden />],
    ['auto', tr('Автоматично', 'Automatisch'), tr('Темний, коли надворі темно, або за розкладом', 'Donker wanneer het buiten donker is, of volgens schema'), <SunMoon key='i' aria-hidden />],
  ];
  const kleuren: Array<[Palet, string, string, Mini, Mini | null]> = [
    ['kleur', tr('Кольоровий', 'Kleurrijk'), tr('Кожен розділ у своєму кольорі, як у меню', 'Elk onderdeel in zijn eigen kleur, zoals in het menu'), { ...kleurWaarden(sectie).licht }, { ...kleurWaarden(sectie).donker }],
    ['maquette', tr('Макет', 'Ontwerp'), tr('Студійний вигляд: нічні вітрини, скло та якірна навігація', 'Studio-uiterlijk: nachtvitrines, glas en ankernavigatie'), MAQUETTE.licht, MAQUETTE.donker],
    ['klassiek-wit', tr('Біла класика', 'Witte klassiek'), tr('Сучасна світла класика по суті: без розфарбовок і вітрин, завжди світла', 'Moderne lichte klassiek zonder opsmuk: geen bonte kleuren of etalages, altijd licht'), KLASSIEK_WIT, null],
    ['klassiek-zwart', tr('Чорна класика', 'Zwarte klassiek'), tr('Сучасна темна класика по суті: оксамитовий онікс без кольорів і вітрин, завжди темна', 'Moderne donkere klassiek zonder opsmuk: fluweelzwart zonder bonte kleuren of etalages, altijd donker'), KLASSIEK_ZWART, null],
    ['grifel', tr('Грифельний', 'Grafiet'), tr('Спокійний темно-грифельний (#2f4f4f)', 'Rustig donker leisteen (#2f4f4f)'), GRIFEL.licht, GRIFEL.donker],
    ['puur', tr('Чистий', 'Puur'), tr('Чистий білий удень, чистий чорний (QLED) уночі', 'Zuiver wit overdag, zuiver zwart (QLED) ’s nachts'), PUUR.licht, PUUR.donker],
    ...(violetToegestaan ? [['violet', tr('Фіолетовий', 'Violet'), tr('Один фіолетовий; тон — за режимом', 'Eén violet; de toon volgt de modus'), VIOLET.licht, VIOLET.donker] as [Palet, string, string, Mini, Mini | null]] : []),
  ];
  const paletNaam = kleuren.find(([id]) => id === palet)?.[1] || palet;
  const modusNaam = modi.find(([id]) => id === modus)?.[1] || modus;
  const accentNaam = stijl.accent ? tr(ACCENT_NAMEN[stijl.accent].uk, ACCENT_NAMEN[stijl.accent].nl) : tr('Як у палітрі', 'Zoals het palet');
  const tlo = achtergrondVolledig(achtergrond), niveau = achtergrondNiveau(tlo);
  const NIVEAU: Record<string, [string, string]> = { subtiel: ['ледь помітний', 'subtiel'], rustig: ['спокійний', 'rustig'], levendig: ['жвавий', 'levendig'], opvallend: ['виразний', 'opvallend'] };
  const tloNaam = tlo.stand === 'uit' ? tr('фон вимкнено', 'achtergrond uit') : niveau ? tr(`фон ${NIVEAU[niveau][0]}`, `achtergrond ${NIVEAU[niveau][1]}`) : tr('фон власний', 'eigen achtergrond');
  const transparantie = typeof stijl.transparantie === 'number' ? stijl.transparantie : 0;
  const effecten = typeof stijl.effecten === 'number' ? stijl.effecten : UITERLIJK_EFFECTEN_STANDAARD;
  const laagTekst = (laag: ZoneLaag) => tr(`Фарбує: ${LAAG_UITLEG[laag].uk[1]}.`, `Kleurt: ${LAAG_UITLEG[laag].nl[1]}.`);
  return <div className='thema-instellingen vz-zone' data-thema-instellingen data-vz-zone>
    <p className='thema-uitleg' data-vz-inleiding>{tr('Тут зібрано все, що фарбує сайт. Шари лягають один на одного: палітра й режим задають основу, акцент перефарбовує лише активні елементи, а живий фон, прозорість і сяйво — прикраси поверх. Наведіть на блок, щоб побачити на прикладі, що саме він змінює.', 'Hier staat alles wat de site kleurt. De lagen liggen op elkaar: palet en modus vormen de basis, het accent kleurt alleen de actieve elementen, en de levende achtergrond, doorschijnendheid en gloed zijn versiering erbovenop. Wijs een blok aan om in het voorbeeld te zien wat het verandert.')}</p>
    <VoorbeeldVenster tr={tr} wijs={wijs} onWijs={setWijs} />
    <ZoneBlok laag='basis' standaardOpen onWijs={setWijs} titel={tr('Основа: палітра й режим', 'Basis: palet en modus')} waarde={`${paletNaam} · ${modusNaam}`} uitleg={laagTekst('basis')}>
    <section aria-labelledby='thema-modus-kop'>
      <h3 id='thema-modus-kop'>{tr('Режим', 'Modus')}</h3>
      <p className='thema-uitleg'>{tr('Світлий чи темний — поверх вибраних кольорів.', 'Licht of donker — bovenop de gekozen kleuren.')}</p>
      <div className='thema-modi' role='radiogroup' aria-labelledby='thema-modus-kop'>
        {modi.map(([id, naam, hint, ic]) => <button key={id} type='button' role='radio' aria-checked={modus === id} className={modus === id ? 'active' : ''} onClick={() => onTheme(id)} data-thema-modus={id}>{ic}<strong>{naam}</strong><small>{hint}</small></button>)}
      </div>
      {isKlassiekPalet(palet) && <p className='thema-vaste-toon-noot' role='status' data-thema-vaste-toon={palet}>
        {palet === 'klassiek-wit'
          ? tr('Обрано тему «Біла класика» — вона завжди утримує сталий світлий тон. Збережений вибір режиму одразу запрацює при переході на інші палітри.', 'U gebruikt «Witte klassiek» — dit thema behoudt altijd een vaste lichte toon. Uw bewaarde moduskeuze werkt meteen zodra u naar een ander palet overschakelt.')
          : tr('Обрано тему «Чорна класика» — вона завжди утримує сталий темний тон. Збережений вибір режиму одразу запрацює при переході на інші палітри.', 'U gebruikt «Zwarte klassiek» — dit thema behoudt altijd een vaste donkere toon. Uw bewaarde moduskeuze werkt meteen zodra u naar een ander palet overschakelt.')}
      </p>}
    </section>

    {modus === 'auto' && <section className='thema-auto' aria-labelledby='thema-auto-kop' data-thema-auto-instellingen>
      <h3 id='thema-auto-kop'>{tr('Автоперемикання', 'Automatisch wisselen')}</h3>
      <p className='thema-status' role='status' data-thema-status>
        {status.donker ? <Moon aria-hidden /> : <Sun aria-hidden />}
        <span>{status.donker ? tr('Зараз темна', 'Nu donker') : tr('Зараз світла', 'Nu licht')}{wisselTekst(status.wissel, status.nu, tr, lang)}{status.gepauzeerd ? ` · ${tr('автоперемикання призупинено', 'automatisch wisselen gepauzeerd')}` : ''}</span>
        <button type='button' className='thema-pauze' onClick={() => (status.gepauzeerd ? hervatAuto() : pauzeerAuto())} data-thema-pauze>{status.gepauzeerd ? <><Play aria-hidden />{tr('Повернути автоперемикання', 'Automatisch wisselen hervatten')}</> : <><Pause aria-hidden />{tr('Призупинити до наступного перемикання', 'Pauzeren tot de volgende wissel')}</>}</button>
      </p>
      <div className='thema-soort' role='radiogroup' aria-label={tr('Як перемикати', 'Hoe wisselen')}>
        <label><input type='radio' name='thema-soort' checked={a.soort === 'zon'} onChange={() => auto({ soort: 'zon' })} /> <span><strong>{tr('Коли надворі темно', 'Wanneer het buiten donker is')}</strong><small>{tr('За сходом і заходом сонця (сутінки) у вашому місті', 'Volgens zonsopgang en -ondergang (schemering) in uw stad')}</small></span></label>
        <label><input type='radio' name='thema-soort' checked={a.soort === 'interval'} onChange={() => auto({ soort: 'interval' })} /> <span><strong>{tr('За розкладом', 'Volgens schema')}</strong><small>{tr('Фіксовані години', 'Vaste uren')}</small></span></label>
      </div>
      {a.soort === 'zon' ? <div className='thema-zon'>
        <label className='thema-veld'>{tr('Місто', 'Stad')}
          <select value={plaatsId} onChange={(e) => { const p = PLAATSEN.find((x) => x.id === e.target.value); if (p) auto({ soort: 'zon', lat: p.lat, lon: p.lon, plaats: lang === 'uk' ? p.uk : p.nl }); }} data-thema-plaats>
            {plaatsId === 'eigen' && <option value='eigen'>{a.plaats || tr('Моє місце (приблизно)', 'Mijn plaats (ongeveer)')}</option>}
            {PLAATSEN.map((p) => <option key={p.id} value={p.id}>{lang === 'uk' ? p.uk : p.nl}</option>)}
          </select>
        </label>
        <button type='button' className='thema-knop' onClick={zoek} data-thema-locatie><LocateFixed aria-hidden />{tr('Визначити за моїм місцем', 'Bepalen via mijn locatie')}</button>
        {/* IDENTITEIT-013: приблизне місце зберігається в обліковому записі; його можна забути (сутінки рахуються для Брюсселя). */}
        {a.lat !== undefined && <button type='button' className='thema-knop' onClick={() => { zetAuto({ ...a, lat: undefined, lon: undefined, plaats: undefined }); setGeoMelding(tr('Місце забуто. Сутінки рахуються для Брюсселя, доки ви не оберете місто.', 'Plaats vergeten. De schemering wordt voor Brussel berekend tot u een stad kiest.')); }} data-thema-vergeet title={tr('Прибирає збережені приблизні координати з облікового запису на всіх пристроях', 'Verwijdert de bewaarde benaderde coördinaten uit het account op alle apparaten')}><X aria-hidden />{tr('Забути місце', 'Plaats vergeten')}</button>}
        {geoMelding && <p className='thema-uitleg' role='status'>{geoMelding}</p>}
        <p className='thema-uitleg' data-thema-zon>{typeof zon === 'object' ? tr(`Сьогодні світла з ${tijd(zon.op, lang)} до ${tijd(zon.onder, lang)}, решту часу — темна.`, `Vandaag licht van ${tijd(zon.op, lang)} tot ${tijd(zon.onder, lang)}, de rest van de tijd donker.`) : zon === 'nacht' ? tr('Сьогодні полярна ніч — темна весь день.', 'Vandaag poolnacht — de hele dag donker.') : tr('Сьогодні біла ніч — світла весь день.', 'Vandaag witte nacht — de hele dag licht.')}</p>
      </div> : <div className='thema-interval'>
        <label className='thema-veld'><Clock aria-hidden />{tr('Темна тема з', 'Donker thema vanaf')}<input type='time' value={a.van} onChange={(e) => e.target.value && auto({ soort: 'interval', van: e.target.value })} data-thema-van /></label>
        <label className='thema-veld'>{tr('до (світла з)', 'tot (licht vanaf)')}<input type='time' value={a.tot} onChange={(e) => e.target.value && auto({ soort: 'interval', tot: e.target.value })} data-thema-tot /></label>
      </div>}
    </section>}

    <section aria-labelledby='thema-kleur-kop'>
      <h3 id='thema-kleur-kop'>{tr('Палітра сайту', 'Palet van de site')}</h3>
      <p className='thema-uitleg'>{tr('Кожен варіант має світлий і темний тон — його обирає режим вище.', 'Elke variant heeft een lichte en een donkere toon — die kiest de modus hierboven.')}</p>
      <div className='thema-paletten' role='radiogroup' aria-labelledby='thema-kleur-kop'>
        {kleuren.map(([id, naam, hint, l, d]) => <button key={id} type='button' role='radio' aria-checked={palet === id} className={palet === id ? 'active' : ''} onClick={() => kies(id)} data-thema-palet={id}>
          <span className={`thema-voorbeelden${d ? '' : ' is-enkel'}`}><Voorbeeld w={l} label={id === 'klassiek-zwart' ? 'donker' : 'licht'} />{d && <Voorbeeld w={d} label='donker' />}</span>
          {id === 'kleur' && <span className='thema-sectiekleuren' aria-hidden>{SECTIES.map((s) => <i key={s} style={{ background: kleurWaarden(s).licht.accent }} />)}</span>}
          <strong>{naam}</strong><small>{hint}</small>
        </button>)}
      </div>
      {!violetToegestaan && <p className='settings-honest-note'>{tr('Фіолетова тема не дозволена для цього облікового запису.', 'Het violette thema is niet toegestaan voor dit account.')}</p>}
    </section>
    </ZoneBlok>
    <ZoneBlok laag='accent' standaardOpen onWijs={setWijs} titel={tr('Акцент', 'Accent')} waarde={accentNaam} uitleg={laagTekst('accent')}>
      <AccentKeuze tr={tr} />
    </ZoneBlok>
    <ZoneBlok laag='tlo' standaardOpen={false} onWijs={setWijs} titel={tr('Тло і глибина', 'Achtergrond en diepte')}
      waarde={`${tloNaam} · ${transparantie > 0 ? tr(`прозорість ${transparantie}%`, `doorschijnend ${transparantie}%`) : tr('блоки суцільні', 'blokken dicht')} · ${tr('сяйво', 'gloed')} ${effecten}%`}
      uitleg={laagTekst('tlo')}>
      {/* ACHTERGROND-001: «Живий фон» сторінок · levende achtergrond */}
      <AchtergrondInstellingen tr={tr} />
      <TransparantieEnEffecten tr={tr} />
    </ZoneBlok>
    <ZoneVoet tr={tr} />
    {/* REESTR-LOGO-001: «Логотипи сервісів» — свій логотип поверх системного, лише для цієї людини · eigen logo's van diensten */}
    <Suspense fallback={null}><MijnLogos tr={tr} lang={lang} /></Suspense>
  </div>;
}
