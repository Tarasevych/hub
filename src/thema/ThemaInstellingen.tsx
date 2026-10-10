// Налаштування → Теми: режим (світлий / темний / як на пристрої / авто) + кольори (палет) + розклад автоперемикання.
// Режим — це шар поверх кольорів: кожен палет має світлий і темний тон.
import { Clock, LocateFixed, Monitor, Moon, Pause, Play, Sun, SunMoon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ThemePreference } from '../shared-preferences';
import { leesKeuze, PLAATSEN, STANDAARD_PLAATS, zonTijden, type AutoInstelling, type Palet } from './kern';
import { hervatAuto, pauzeerAuto, useAutoStatus, zetAuto, zetPalet } from './useThema';
import { kleurWaarden, PUUR, SECTIES, type Sectie } from './paletten';
import './thema-instellingen.css';

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

export default function ThemaInstellingen({ tr, lang, theme, onTheme, violetToegestaan }: Props) {
  const status = useAutoStatus(theme);
  const keuze = leesKeuze(theme, status.palet);
  const modus = keuze.modus, palet = keuze.palet;
  const a = status.auto;
  const sectie = (document.documentElement.dataset.presentationService || 'identity') as Sectie;
  const [geoMelding, setGeoMelding] = useState('');
  const kies = (p: Palet) => { zetPalet(p); if (theme === 'plum-light' || theme === 'plum-dark') onTheme(theme === 'plum-dark' ? 'dark' : 'light'); };
  const auto = (patch: Partial<AutoInstelling>) => zetAuto({ ...a, ...patch, pauzeTot: undefined, pauzeModus: undefined });
  const plaatsId = PLAATSEN.find((p) => p.lat === a.lat && p.lon === a.lon)?.id || (a.lat !== undefined ? 'eigen' : 'brussel');
  const zon = zonTijden(new Date(), a.lat ?? STANDAARD_PLAATS.lat, a.lon ?? STANDAARD_PLAATS.lon);
  const zoek = () => {
    if (!('geolocation' in navigator)) { setGeoMelding(tr('Браузер не підтримує визначення місця. Оберіть місто зі списку.', 'De browser kan de locatie niet bepalen. Kies een stad uit de lijst.')); return; }
    setGeoMelding(tr('Запитую місце в браузера…', 'Locatie opvragen bij de browser…'));
    navigator.geolocation.getCurrentPosition(
      (p) => { auto({ soort: 'zon', lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10, plaats: tr('Моє місце (приблизно)', 'Mijn plaats (ongeveer)') }); setGeoMelding(tr('Збережено приблизно (до ~10 км). Точне місце не зберігається.', 'Bewaard bij benadering (tot ~10 km). De exacte plaats wordt niet bewaard.')); },
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
  const kleuren: Array<[Palet, string, string, Mini, Mini]> = [
    ['kleur', tr('Кольоровий', 'Kleurrijk'), tr('Кожен розділ у своєму кольорі, як у меню', 'Elk onderdeel in zijn eigen kleur, zoals in het menu'), { ...kleurWaarden(sectie).licht }, { ...kleurWaarden(sectie).donker }],
    ['grifel', tr('Грифельний', 'Grafiet'), tr('Спокійний темно-грифельний (#2f4f4f)', 'Rustig donker leisteen (#2f4f4f)'), GRIFEL.licht, GRIFEL.donker],
    ['puur', tr('Чистий', 'Puur'), tr('Чистий білий удень, чистий чорний (QLED) уночі', 'Zuiver wit overdag, zuiver zwart (QLED) ’s nachts'), PUUR.licht, PUUR.donker],
    ...(violetToegestaan ? [['violet', tr('Фіолетовий', 'Violet'), tr('Один фіолетовий; тон — за режимом', 'Eén violet; de toon volgt de modus'), VIOLET.licht, VIOLET.donker] as [Palet, string, string, Mini, Mini]] : []),
  ];
  return <div className='thema-instellingen' data-thema-instellingen>
    <section aria-labelledby='thema-modus-kop'>
      <h3 id='thema-modus-kop'>{tr('Режим', 'Modus')}</h3>
      <p className='thema-uitleg'>{tr('Світлий чи темний — поверх вибраних кольорів.', 'Licht of donker — bovenop de gekozen kleuren.')}</p>
      <div className='thema-modi' role='radiogroup' aria-labelledby='thema-modus-kop'>
        {modi.map(([id, naam, hint, ic]) => <button key={id} type='button' role='radio' aria-checked={modus === id} className={modus === id ? 'active' : ''} onClick={() => onTheme(id)} data-thema-modus={id}>{ic}<strong>{naam}</strong><small>{hint}</small></button>)}
      </div>
    </section>

    {modus === 'auto' && <section className='thema-auto' aria-labelledby='thema-auto-kop' data-thema-auto-instellingen>
      <h3 id='thema-auto-kop'>{tr('Автоперемикання', 'Automatisch wisselen')}</h3>
      <p className='thema-status' role='status' data-thema-status>
        {status.donker ? <Moon aria-hidden /> : <Sun aria-hidden />}
        <span>{status.donker ? tr('Зараз темна', 'Nu donker') : tr('Зараз світла', 'Nu licht')}{status.volgende ? ` · ${tr('наступне перемикання о', 'volgende wissel om')} ${tijd(status.volgende, lang)}` : ''}{status.gepauzeerd ? ` · ${tr('автоперемикання призупинено', 'automatisch wisselen gepauzeerd')}` : ''}</span>
        <button type='button' className='thema-pauze' onClick={() => (status.gepauzeerd ? hervatAuto() : pauzeerAuto())} data-thema-pauze>{status.gepauzeerd ? <><Play aria-hidden />{tr('Повернути автоперемикання', 'Automatisch wisselen hervatten')}</> : <><Pause aria-hidden />{tr('Скасувати автоперемикання на сьогодні', 'Automatisch wisselen vandaag annuleren')}</>}</button>
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
        {geoMelding && <p className='thema-uitleg' role='status'>{geoMelding}</p>}
        <p className='thema-uitleg' data-thema-zon>{typeof zon === 'object' ? tr(`Сьогодні світла з ${tijd(zon.op, lang)} до ${tijd(zon.onder, lang)}, решту часу — темна.`, `Vandaag licht van ${tijd(zon.op, lang)} tot ${tijd(zon.onder, lang)}, de rest van de tijd donker.`) : zon === 'nacht' ? tr('Сьогодні полярна ніч — темна весь день.', 'Vandaag poolnacht — de hele dag donker.') : tr('Сьогодні біла ніч — світла весь день.', 'Vandaag witte nacht — de hele dag licht.')}</p>
      </div> : <div className='thema-interval'>
        <label className='thema-veld'><Clock aria-hidden />{tr('Темна з', 'Donker vanaf')}<input type='time' value={a.van} onChange={(e) => e.target.value && auto({ soort: 'interval', van: e.target.value })} data-thema-van /></label>
        <label className='thema-veld'>{tr('до', 'tot')}<input type='time' value={a.tot} onChange={(e) => e.target.value && auto({ soort: 'interval', tot: e.target.value })} data-thema-tot /></label>
      </div>}
    </section>}

    <section aria-labelledby='thema-kleur-kop'>
      <h3 id='thema-kleur-kop'>{tr('Кольори', 'Kleuren')}</h3>
      <p className='thema-uitleg'>{tr('Кожен варіант має світлий і темний тон — його обирає режим вище.', 'Elke variant heeft een lichte en een donkere toon — die kiest de modus hierboven.')}</p>
      <div className='thema-paletten' role='radiogroup' aria-labelledby='thema-kleur-kop'>
        {kleuren.map(([id, naam, hint, l, d]) => <button key={id} type='button' role='radio' aria-checked={palet === id} className={palet === id ? 'active' : ''} onClick={() => kies(id)} data-thema-palet={id}>
          <span className='thema-voorbeelden'><Voorbeeld w={l} label='licht' /><Voorbeeld w={d} label='donker' /></span>
          {id === 'kleur' && <span className='thema-sectiekleuren' aria-hidden>{SECTIES.map((s) => <i key={s} style={{ background: kleurWaarden(s).licht.accent }} />)}</span>}
          <strong>{naam}</strong><small>{hint}</small>
        </button>)}
      </div>
      {!violetToegestaan && <p className='settings-honest-note'>{tr('Фіолетова тема не дозволена для цього акаунта.', 'Het violette thema is niet toegestaan voor dit account.')}</p>}
    </section>
  </div>;
}
