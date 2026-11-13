// Showroom: ZUIVER demonstratief. Vaste, duidelijk gelabelde demogegevens (geen woning, geen API, geen opdrachten, geen tokens),
// een demoplattegrond en drie scenario's («Avond», «Ochtend», «Water») als stapsgewijze tekst-playback: welke sensor, welke
// actie, welk resultaat. Eerlijk gelabeld als voorbeeld — nooit als «uw huis».
import { useEffect, useState } from 'react';
import { Calculator, ExternalLink, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import type { HuisTab } from '../../../shared/huis-model';
import { tr, type Lang } from '../tekst';

type Stap = { t: [string, string]; bron: [string, string]; kamer: string; uitkomst: [string, string] };
const SCENARIOS: Array<{ id: string; naam: [string, string]; uitleg: [string, string]; stappen: Stap[] }> = [
  { id: 'avond', naam: ['Вечір', 'Avond'], uitleg: ['Сцена запускається людиною одним дотиком; кожна команда чекає підтвердження пристрою.', 'Een mens start de scène met één tik; elke opdracht wacht op bevestiging van het apparaat.'], stappen: [
    { t: ['Мешканець натискає «Вечір»', 'Bewoner tikt op «Avond»'], bron: ['сайт', 'site'], kamer: 'woonkamer', uitkomst: ['сцена прийнята, 3 команди створено', 'scène aanvaard, 3 opdrachten gemaakt'] },
    { t: ['Світло у вітальні → 35 %', 'Licht woonkamer → 35 %'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'woonkamer', uitkomst: ['підтверджено лампою через 0,8 с', 'bevestigd door de lamp na 0,8 s'] },
    { t: ['Ролети у вітальні → закрити', 'Rolluiken woonkamer → dicht'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'woonkamer', uitkomst: ['положення 0 % спостережено через 14 с', 'positie 0 % waargenomen na 14 s'] },
    { t: ['Термостат → 20,5 °C', 'Thermostaat → 20,5 °C'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'gang', uitkomst: ['цільову температуру підтверджено', 'doeltemperatuur bevestigd'] },
    { t: ['Результат: виконано та підтверджено', 'Uitkomst: voltooid en bevestigd'], bron: ['журнал', 'journaal'], kamer: '', uitkomst: ['3/3 кроків із ACK; подія записана з кореляцією', '3/3 stappen met ACK; gebeurtenis gelogd met correlatie'] },
  ] },
  { id: 'ochtend', naam: ['Ранок', 'Ochtend'], uitleg: ['Правило з часовим тригером та умовою присутності (у цьому випуску — симуляція).', 'Een regel met tijdtrigger en aanwezigheidsvoorwaarde (in deze release: simulatie).'], stappen: [
    { t: ['07:00, будній день', '07:00, werkdag'], bron: ['тригер часу', 'tijdtrigger'], kamer: '', uitkomst: ['умова «Коли» істинна', '«Wanneer» is waar'] },
    { t: ['Хтось удома?', 'Iemand thuis?'], bron: ['присутність', 'aanwezigheid'], kamer: 'gang', uitkomst: ['так — умова «Якщо» істинна', 'ja — «Als» is waar'] },
    { t: ['Ролети спальні → відкрити', 'Rolluiken slaapkamer → open'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'slaapkamer', uitkomst: ['у симуляції: було б надіслано (без I/O)', 'in simulatie: zou verzonden worden (geen I/O)'] },
    { t: ['Світло у кухні → 60 %', 'Licht keuken → 60 %'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'keuken', uitkomst: ['у симуляції: було б надіслано', 'in simulatie: zou verzonden worden'] },
    { t: ['Запобіжники', 'Veiligheidsmarges'], bron: ['двигун правил', 'regelengine'], kamer: '', uitkomst: ['охолодження 5 хв, макс. 1/день — петлі немає', 'afkoeltijd 5 min, max. 1/dag — geen lus'] },
  ] },
  { id: 'water', naam: ['Вода', 'Water'], uitleg: ['Датчик протікання: сповіщення і НЕкритична дія. Перекриття клапана — лише людиною з підтвердженням.', 'Lekdetectie: melding en een NIET-kritieke actie. De kraan dichtdraaien doet alleen een mens met bevestiging.'], stappen: [
    { t: ['Датчик протікання під пральною машиною: ВОДА', 'Lekdetector onder de wasmachine: WATER'], bron: ['binary_sensor', 'binary_sensor'], kamer: 'badkamer', uitkomst: ['подія «критично» у журналі, час джерела збережено', 'gebeurtenis «kritiek» in het journaal, brontijd bewaard'] },
    { t: ['Сповіщення мешканцям', 'Melding aan de bewoners'], bron: ['правило', 'regel'], kamer: '', uitkomst: ['надіслано (дія «сповіщення» не є критичною)', 'verzonden (actie «melding» is niet kritiek)'] },
    { t: ['Розетка пральної машини → вимкнути', 'Stekker wasmachine → uit'], bron: ['Home Assistant', 'Home Assistant'], kamer: 'badkamer', uitkomst: ['підтверджено: 0 W виміряно', 'bevestigd: 0 W gemeten'] },
    { t: ['Перекрити клапан?', 'Hoofdkraan dicht?'], bron: ['людина', 'mens'], kamer: 'gang', uitkomst: ['чекає рішення — ШІ й правила не роблять цього самі', 'wacht op een besluit — AI en regels doen dit nooit zelf'] },
    { t: ['Мешканець підтверджує (step-up)', 'Bewoner bevestigt (step-up)'], bron: ['сайт', 'site'], kamer: 'gang', uitkomst: ['клапан закрито, стан спостережено', 'kraan dicht, toestand waargenomen'] },
  ] },
];
const KAMERS: Array<{ id: string; naam: [string, string]; x: number; y: number; w: number; h: number }> = [
  { id: 'woonkamer', naam: ['Вітальня', 'Woonkamer'], x: 0, y: 0, w: 6, h: 4 }, { id: 'keuken', naam: ['Кухня', 'Keuken'], x: 6, y: 0, w: 4, h: 4 }, { id: 'gang', naam: ['Коридор', 'Gang'], x: 0, y: 4, w: 4, h: 2 },
  { id: 'badkamer', naam: ['Ванна', 'Badkamer'], x: 4, y: 4, w: 3, h: 2 }, { id: 'slaapkamer', naam: ['Спальня', 'Slaapkamer'], x: 7, y: 4, w: 3, h: 2 },
];

export default function Showroom({ lang, naarTab }: { lang: Lang; smal: boolean; naarTab: (t: HuisTab) => void }) {
  const [sc, setSc] = useState(SCENARIOS[0]);
  const [stap, setStap] = useState(-1);
  const [speelt, setSpeelt] = useState(false);
  useEffect(() => { if (!speelt) return; if (stap >= sc.stappen.length - 1) { setSpeelt(false); return; } const t = window.setTimeout(() => setStap((s) => s + 1), 1800); return () => window.clearTimeout(t); }, [speelt, stap, sc]);
  const actief = stap >= 0 ? sc.stappen[stap] : null; const S = 26;
  return (
    <div className='hv-showroom' data-hv-showroom={sc.id}>
      <p className='hv-melding is-info' data-hv-demo='1'><Sparkles aria-hidden='true' />{tr(lang, 'Демонстрація на вигаданих даних. Це не ваша оселя, тут немає реальних пристроїв, команд чи токенів. Показуємо, як виглядає чесний ланцюжок: датчик → правило/людина → команда → підтвердження.', 'Demonstratie met verzonnen gegevens. Dit is niet uw woning; er zijn geen echte apparaten, opdrachten of tokens. We tonen hoe de eerlijke keten eruitziet: sensor → regel/mens → opdracht → bevestiging.')}</p>
      {/* HUIS-001 (етап 0): клікабельний макет майбутнього хабу «Живий дім» — окрема статична сторінка сайту (dist/huis-maquette/,
          складає scripts/huis-maquette.mjs --site). Вигадані дані вбудованого симулятора, жодного зв’язку з пристроями. */}
      <section className='hv-blok hv-maquette-kaart' data-hv-maquette='1'>
        <h3>{tr(lang, 'Макет «Живий дім» — яким стане розумний будинок', 'Maquette «Levend huis» — zo wordt het slimme huis')}</h3>
        <p className='hv-hint'>{tr(lang, 'Повний клікабельний макет нового хабу: дім із небом за часом доби, кімнати й план, аркуші керування для кожного типу пристрою, енергія, безпека, гараж із транспортом і безпілотниками, автоматика, ШІ-агенти з дозволами та 13 видів екранів — від годинника до телевізора. Усе працює на вбудованому симуляторі з вигаданими даними.', 'De volledige klikbare maquette van de nieuwe hub: het huis met een hemel naar het tijdstip, kamers en plattegrond, bedieningsbladen voor elk soort apparaat, energie, beveiliging, de garage met voertuigen en drones, automatisering, AI-agenten met toestemmingen en 13 soorten schermen — van horloge tot televisie. Alles draait op de ingebouwde simulator met verzonnen gegevens.')}</p>
        <div className='hv-knoppen'>
          <a className='hv-knop is-hoofd' href='/huis-maquette/' target='_blank' rel='noopener' data-hv-maquette-open='1' title={tr(lang, 'Відкриється в новій вкладці. Макет нічим не керує: жодна дія в ньому не доходить до ваших пристроїв і не змінює вашу оселю.', 'Opent in een nieuw tabblad. De maquette bedient niets: geen enkele actie daarin bereikt uw apparaten of verandert uw woning.')}><ExternalLink aria-hidden='true' />{tr(lang, 'Відкрити макет', 'Maquette openen')}</a>
        </div>
      </section>
      <div className='hv-kolommen'>
        <section className='hv-blok'>
          <h3>{tr(lang, 'Демо-план', 'Demoplattegrond')}</h3>
          <svg className='hv-plan' viewBox={`0 0 ${10 * S + 8} ${6 * S + 8}`} role='img' aria-label={tr(lang, 'Демонстраційний план з п’ятьма кімнатами', 'Demoplattegrond met vijf kamers')}>
            {KAMERS.map((k) => <g key={k.id} className={`hv-plan-kamer${actief?.kamer === k.id ? ' is-gekozen heeft-licht' : ''}`}><rect x={k.x * S + 4} y={k.y * S + 4} width={k.w * S} height={k.h * S} rx={6} /><text x={k.x * S + 12} y={k.y * S + 22} className='hv-plan-naam'>{tr(lang, k.naam[0], k.naam[1])}</text></g>)}
          </svg>
          <p className='hv-hint'>{tr(lang, 'Підсвічена кімната — та, де відбувається поточний крок.', 'De oplichtende kamer is waar de huidige stap plaatsvindt.')}</p>
        </section>
        <section className='hv-blok'>
          <h3>{tr(lang, 'Сценарії', 'Scenario’s')}</h3>
          <div className='hv-chips' role='tablist'>{SCENARIOS.map((s) => <button key={s.id} type='button' role='tab' aria-selected={sc.id === s.id} className={`hv-chip${sc.id === s.id ? ' is-actief' : ''}`} onClick={() => { setSc(s); setStap(-1); setSpeelt(false); }} data-hv-scenario={s.id}>{tr(lang, s.naam[0], s.naam[1])}</button>)}</div>
          <p className='hv-hint'>{tr(lang, sc.uitleg[0], sc.uitleg[1])}</p>
          <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-hoofd' onClick={() => { if (stap >= sc.stappen.length - 1) setStap(0); else if (stap < 0) setStap(0); setSpeelt(!speelt); }} data-hv-afspelen='1'>{speelt ? <Pause aria-hidden='true' /> : <Play aria-hidden='true' />}{speelt ? tr(lang, 'Пауза', 'Pauze') : tr(lang, 'Відтворити', 'Afspelen')}</button>
            <button type='button' className='hv-knop is-klein' disabled={stap >= sc.stappen.length - 1} onClick={() => { setSpeelt(false); setStap((s) => Math.min(sc.stappen.length - 1, s + 1)); }} data-hv-volgende='1'>{tr(lang, 'Крок далі', 'Volgende stap')}</button>
            <button type='button' className='hv-knop is-klein is-stil' onClick={() => { setSpeelt(false); setStap(-1); }}><RotateCcw aria-hidden='true' />{tr(lang, 'Спочатку', 'Opnieuw')}</button>
          </div>
          <ol className='hv-afspeel' aria-live='polite' data-hv-stap={stap}>
            {sc.stappen.map((s, i) => <li key={i} className={i === stap ? 'is-actief' : i < stap ? 'is-klaar' : ''}><strong>{tr(lang, s.t[0], s.t[1])}</strong><small>{tr(lang, 'джерело', 'bron')}: {tr(lang, s.bron[0], s.bron[1])}</small>{i <= stap ? <span>→ {tr(lang, s.uitkomst[0], s.uitkomst[1])}</span> : null}</li>)}
          </ol>
        </section>
      </div>
      <section className='hv-blok'>
        <h3>{tr(lang, 'Що відрізняє цей підхід', 'Wat deze aanpak anders maakt')}</h3>
        <ul className='hv-lijst is-dicht'>
          <li><span>{tr(lang, 'Жодного вигаданого стану: немає виміру — немає значення, лише «невідомо» з часом останнього контакту.', 'Geen verzonnen toestand: geen meting, geen waarde — alleen «onbekend» met de tijd van het laatste contact.')}</span></li>
          <li><span>{tr(lang, 'Команда «виконана» лише після того, як пристрій повернув бажаний стан.', 'Een opdracht is pas «voltooid» als het apparaat de gewenste toestand teruggeeft.')}</span></li>
          <li><span>{tr(lang, 'Замки, охорона, сирени, дим/газ — тільки людина, з підтвердженням входу; ШІ лише пропонує.', 'Sloten, alarm, sirenes, rook/gas: alleen een mens, met bevestiging van de aanmelding; de AI stelt alleen voor.')}</span></li>
          <li><span>{tr(lang, 'Локально: шлюз у вашій мережі, вихідне з’єднання з вашого сервера, без відкритих портів.', 'Lokaal: de gateway in uw netwerk, een uitgaande verbinding vanaf uw server, geen open poorten.')}</span></li>
        </ul>
        <button type='button' className='hv-knop' onClick={() => naarTab('planner')}><Calculator aria-hidden='true' />{tr(lang, 'Відкрити калькулятор структури', 'Structuurplanner openen')}</button>
      </section>
    </div>
  );
}
