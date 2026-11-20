// «Хто готує оновлення»: wie een pakket mag voorbereiden en uploaden (grants met vervaldatum, RUNBOOK §13.10).
// Kaarten met avatar (monogram — geen merklogo's), resterende tijd, een zachte «Вимкнути доступ» (met reden, want het getroffen account
// krijgt een melding) en «Додати агента» in een venster. Een dozen-grant per TOKEN verliest zijn kracht zodra de AI opnieuw verbindt;
// daarom is «Агент» (claude, gpt, …) de standaardkeuze: die blijft gelden voor elke koppeling van die agent in de technische ruimte.
// TOEGANG-001 (15.11.2026): elke kaart heeft nu «Змінити термін» én «Вимкнути доступ» — ook een recht dat het AI-beleid blokkeert (vroeger
// stond dat alleen als tekst in een ingeklapt blok, zonder knop). Een automatisch recht uit het beleid dat de eigenaar hier uitzet, blijft
// uit (backend/uitrol-beleid-sync.ts); zulke agents staan in «Вимкнено вами» met «Дозволити знову».
import { useRef, useState } from 'react';
import { effectieveToegang } from './weergave-v2';
import { AlertTriangle, Bot, CalendarClock, Check, Clock, ExternalLink, Info, KeyRound, Plus, PowerOff, ShieldAlert, ShieldCheck, SlidersHorizontal, UserCheck, UserRound, X } from 'lucide-react';
import { RedenVeld, redenOk } from '../ToegangContext';
import Persoon from './Persoon';
import AgentLogo from '../agenten/AgentLogo';
import AgentToevoegen, { type GevenInvoer } from './AgentToevoegen';
import { rechtenSamenvatting, type LimietModus, type ToegangNiveau } from '../../shared/uitrol-wachtrij';
import './voorbereiders.css';
import { SOORT, datum, tr, type Grant, type Keuze, type Lang, type Overzicht } from './types';

export type RechtenWijzigInvoer = {
  toegangNiveau: ToegangNiveau;
  limietModus: LimietModus;
  maxAantal: number | null;
  bevestigingPerKeer: boolean;
  resetTeller?: boolean;
};

type Props = {
  lang: Lang;
  data: Overzicht;
  busy: string;
  geven: (g: GevenInvoer) => void;
  intrekken: (g: Grant, reden: string) => void;
  termijn?: (g: Grant, t: { dagen: number; onbepaald: boolean }) => void;
  rechten?: (g: Grant, r: RechtenWijzigInvoer) => void;
  zoekAccounts?: (zoek: string) => Promise<{ accounts?: Keuze[]; accountsTotaal?: number }>;
};

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
/** Monogram-avatar met vaste kleur per naam (bewust geen merklogo's). */
export function Avatar({ naam, id, klein = false }: { naam: string; id?: string; klein?: boolean }) {
  const h = hue(id || naam);
  return <span className={`ut-avatar${klein ? ' is-klein' : ''}`} style={{ background: `linear-gradient(140deg,hsl(${h} 58% 30%),hsl(${(h + 50) % 360} 62% 26%))` }} aria-hidden='true'>{[...naam.trim()][0]?.toUpperCase() || '?'}</span>;
}
const SOORT_PICT = { account: UserRound, agenttoken: KeyRound, 'mcp-koppeling': Bot, agent: Bot } as const;
const resterend = (lang: Lang, tot: string) => {
  const ms = Date.parse(tot) - Date.now(); if (!(ms > 0)) return ''; if (new Date(tot).getUTCFullYear() >= 9999) return tr(lang, 'до відкликання', 'tot intrekking'); // A7
  const u = Math.floor(ms / 3600_000); const d = Math.floor(u / 24);
  return d >= 1 ? tr(lang, `ще ${d} дн.`, `nog ${d} dgn`) : u >= 1 ? tr(lang, `ще ${u} год`, `nog ${u} uur`) : tr(lang, 'менш як година', 'minder dan een uur');
};

export default function Voorbereiders({ lang, data, busy, geven, intrekken, termijn, rechten, zoekAccounts }: Props) {
  const [intrek, setIntrek] = useState<{ id: string; reden: string } | null>(null);
  const [venster, setVenster] = useState(false);
  const [wijzig, setWijzig] = useState<{ id: string; dagen: number; onbepaald: boolean } | null>(null);
  const [rechtenEdit, setRechtenEdit] = useState<{ id: string; toegangNiveau: ToegangNiveau; limietModus: LimietModus; maxAantal: number; resetTeller: boolean } | null>(null);
  const max = data.limieten?.voorbereiderMaxDagen || 30;
  const knop = useRef<HTMLButtonElement>(null);
  const actief = data.voorbereiders.filter((g) => g.status === 'actief');
  // «Лише ті, хто реально має доступ»: een agent-recht dat het ondertekende AI-beleid blokkeert («Розгортати сайт» = Вимкнено) werkt niet
  // en gaat naar een apart, ingeklapt blok, zodat de hoofdlijst alleen toont wie nu echt kan voorbereiden.
  // UI-010: zelfde definitie als het compacte blok op «Огляд» (src/uitrol/weergave-v2.ts effectieveToegang).
  const beleidUit = (g: Grant) => effectieveToegang({ ...g, status: 'actief', onbepaald: true }, data) === 'beleid';
  const werkend = actief.filter((g) => !beleidUit(g));
  const geblokkeerd = actief.filter(beleidUit);
  const oud = data.voorbereiders.filter((g) => g.status !== 'actief').slice(0, 6);
  // Verweesde grants: de koppeling/token waaraan ze gebonden zijn bestaat niet meer → ze gelden niet meer, ook al staan ze nog «actief» in de lijst.
  const verweesd = (g: Grant) => effectieveToegang({ ...g, status: 'actief', onbepaald: true }, { ...data, beleid: null }) === 'verweesd';
  const sluit = () => { setVenster(false); window.setTimeout(() => knop.current?.focus(), 0); };
  // Agents die de eigenaar hier zelf uitzette terwijl het beleid «Розгортати сайт» nog toestaat: het beleid geeft ze NIET vanzelf terug.
  const uitgezet = (data.beleid?.tegels || []).filter((t) => t.uitgezetDoorEigenaar && !t.recht && (t.modus === 'always' || t.modus === 'ask'));

  const kaart = (g: Grant, blok: boolean) => { const Pict = SOORT_PICT[g.soort]; const weg = !blok && verweesd(g); const sam = rechtenSamenvatting(lang, g);
    return <li key={g.id} className='ut-voorb-kaart' data-status={g.status} data-verweesd={weg || undefined} data-beleid-blok={blok || undefined} data-grant={g.id}>
      {g.soort === 'account' && g.eigenaar ? <Persoon naam={g.eigenaar.naam || g.eigenaar.email || g.label} id={g.onderwerp} foto={g.eigenaar.foto} /> : g.soort === 'agent' ? <AgentLogo agent={g.onderwerp} naam={g.label} size={44} /> : <AgentLogo agent={g.label} naam={g.label} size={44} />}
      <div className='ut-voorb-tekst'>
        <b className='ut-voorb-naam'>{g.soort === 'account' && g.eigenaar?.naam ? g.eigenaar.naam : g.label}</b>
        {g.eigenaar && <span className='ut-voorb-persoon'>{g.soort !== 'account' && <Persoon naam={g.eigenaar.naam || g.eigenaar.email || '?'} id={g.eigenaar.email || g.onderwerp} foto={g.eigenaar.foto} klein />}<span>{g.soort === 'account' ? (g.eigenaar.email || g.label) : <>{tr(lang, 'для акаунта ', 'voor account ')}<b>{g.eigenaar.naam || g.eigenaar.email}</b>{g.eigenaar.naam && g.eigenaar.email ? <small> · {g.eigenaar.email}</small> : null}</>}</span></span>}
        <span className='ut-voorb-meta'><span className='ut-chip'><Pict aria-hidden='true' />{tr(lang, SOORT[g.soort][0], SOORT[g.soort][1])}</span>
          <span className='ut-chip' data-toon={g.toegangNiveau === 'installeren' ? 'warn' : undefined} data-rechten-niveau={g.toegangNiveau || 'uploaden'}><ShieldCheck aria-hidden='true' />{sam.niveau}</span>
          <span className='ut-chip' data-rechten-beperking={g.limietModus || 'periode'}>{sam.beperking}</span>
          <span className='ut-chip' data-toon={blok ? undefined : 'ok'}><CalendarClock aria-hidden='true' />{g.onbepaald ? tr(lang, 'до відкликання', 'tot intrekking') : <>{tr(lang, 'до ', 'tot ')}{datum(lang, g.verlooptOp)} · {resterend(lang, g.verlooptOp)}</>}</span>{g.bron === 'ai-beleid' && <span className='ut-chip' data-bron='ai-beleid'>{tr(lang, 'автоматично: «Розгортати сайт» у політиці ШІ', 'automatisch: «Site uitrollen» in het AI-beleid')}</span>}
          {blok && <span className='ut-chip' data-toon='warn'><ShieldAlert aria-hidden='true' />{tr(lang, 'не діє: політика ШІ блокує', 'werkt niet: het AI-beleid blokkeert')}</span>}
          {weg && <span className='ut-chip' data-toon='warn'><AlertTriangle aria-hidden='true' />{tr(lang, 'не діє: підключення більше немає', 'werkt niet meer: koppeling bestaat niet meer')}</span>}</span>
        {blok && <p className='ut-voorb-waarschuwing'>{tr(lang, '«Розгортати сайт» для цього агента вимкнено в «Доступ ШІ». Поки так, він нічого не завантажить, навіть із цим дозволом. Щоб він міг готувати оновлення, увімкніть там «Завжди» або «Питати» (потрібен passkey); якщо не потрібен — вимкніть дозвіл і тут.', '«Site uitrollen» staat voor deze agent uit in «AI-toegang». Zolang dat zo is, uploadt hij niets, ook met deze toestemming. Wilt u dat hij updates voorbereidt: zet het daar op «Altijd» of «Vragen» (passkey nodig); niet nodig — zet de toestemming hier ook uit.')} <a href='/ai'>{tr(lang, 'Відкрити «Доступ ШІ»', '«AI-toegang» openen')}<ExternalLink aria-hidden='true' /></a></p>}
        {weg && <p className='ut-voorb-waarschuwing'>{tr(lang, 'Цей дозвіл прив’язаний до конкретного токена, а ШІ підключився знову й отримав новий. Тому агент у списку, але розгортати не може. Додайте дозвіл для агента (він переживає перепідключення) і вимкніть цей.', 'Deze toestemming is aan één token gebonden; de AI verbond opnieuw en kreeg een nieuw token. Daarom staat de agent in de lijst maar kan hij niet uitrollen. Geef de agent een toestemming (die overleeft opnieuw verbinden) en zet deze uit.')}</p>}
      </div>
      {intrek?.id !== g.id && wijzig?.id !== g.id && rechtenEdit?.id !== g.id && <div className='ut-voorb-knoppen'>
        {rechten && <button type='button' className='ut-knop ut-knop-zacht' disabled={!!busy} data-rechten-wijzig={g.id} title={tr(lang, 'Налаштувати рівень доступу та обмеження (один раз, кількість, підтвердження щоразу). Потребує посиленого підтвердження власника.', 'Toegangsniveau en beperking instellen (eenmalig, aantal keren, bevestiging per keer). Vraagt sterke bevestiging van de eigenaar.')} onClick={() => { setIntrek(null); setWijzig(null); setRechtenEdit({ id: g.id, toegangNiveau: g.toegangNiveau || 'uploaden', limietModus: g.limietModus || 'periode', maxAantal: g.maxAantal && g.maxAantal > 0 ? g.maxAantal : 3, resetTeller: false }); }}><SlidersHorizontal aria-hidden='true' />{tr(lang, 'Налаштувати права', 'Rechten instellen')}</button>}
        {termijn && <button type='button' className='ut-knop ut-knop-zacht' disabled={!!busy} data-termijn-wijzig={g.id} title={tr(lang, 'Новий термін рахується від сьогодні. Попередній запис лишається в журналі.', 'De nieuwe termijn telt vanaf vandaag. De vorige stand blijft in het logboek.')} onClick={() => { setIntrek(null); setRechtenEdit(null); setWijzig({ id: g.id, dagen: 7, onbepaald: !!g.onbepaald }); }}><Clock aria-hidden='true' />{tr(lang, 'Змінити термін', 'Termijn wijzigen')}</button>}
        <button type='button' className='ut-knop ut-knop-zacht' disabled={!!busy} data-intrek-start={g.id} title={tr(lang, 'Агент (або акаунт) більше не зможе завантажувати пакети. Уже завантажені лишаються на ваше рішення.', 'De agent (of het account) kan geen pakketten meer uploaden. Wat al klaarstaat, beslist u zelf.')} onClick={() => { setWijzig(null); setRechtenEdit(null); setIntrek({ id: g.id, reden: '' }); }}><PowerOff aria-hidden='true' />{tr(lang, 'Вимкнути доступ', 'Toegang uitzetten')}</button>
      </div>}
      {rechtenEdit?.id === g.id && <div className='ut-reden-veld' role='group' data-rechten-veld={g.id} aria-label={tr(lang, 'Налаштування прав', 'Rechten instellen')}>
        <span>{tr(lang, `Гнучкі права для «${g.label}» (зміна потребує посиленого підтвердження власника):`, `Flexibele rechten voor «${g.label}» (wijzigen vraagt sterke bevestiging van de eigenaar):`)}</span>
        <div className='ut-chips-keuze' role='group' aria-label={tr(lang, 'Рівень доступу', 'Toegangsniveau')}>
          <button type='button' aria-pressed={rechtenEdit.toegangNiveau === 'uploaden'} onClick={() => setRechtenEdit({ ...rechtenEdit, toegangNiveau: 'uploaden' })}>{tr(lang, 'Лише завантаження в чергу', 'Alleen uploaden naar wachtrij')}</button>
          <button type='button' aria-pressed={rechtenEdit.toegangNiveau === 'installeren'} onClick={() => setRechtenEdit({ ...rechtenEdit, toegangNiveau: 'installeren' })}>{tr(lang, 'Завантаження + встановлення', 'Uploaden + installeren')}</button>
        </div>
        {rechtenEdit.toegangNiveau === 'installeren' && <p className='ut-voorb-waarschuwing' data-toon='warn'><AlertTriangle aria-hidden='true' /> {tr(lang, 'На рівні root встановлення без вашого ручного ключа доступу щоразу можливе лише за підписаною власником політикою automatisch_beperkt.', 'Op root-niveau is installeren zonder handmatige passkey per keer alleen mogelijk onder een door de eigenaar ondertekend automatisch_beperkt-beleid.')}</p>}
        <div className='ut-chips-keuze' role='group' aria-label={tr(lang, 'Обмеження дії', 'Beperking')}>
          <button type='button' aria-pressed={rechtenEdit.limietModus === 'periode'} onClick={() => setRechtenEdit({ ...rechtenEdit, limietModus: 'periode' })}>{tr(lang, 'За періодом', 'Voor periode')}</button>
          <button type='button' aria-pressed={rechtenEdit.limietModus === 'eenmalig'} onClick={() => setRechtenEdit({ ...rechtenEdit, limietModus: 'eenmalig' })}>{tr(lang, 'Один раз', 'Eenmalig')}</button>
          <button type='button' aria-pressed={rechtenEdit.limietModus === 'aantal'} onClick={() => setRechtenEdit({ ...rechtenEdit, limietModus: 'aantal' })}>{tr(lang, 'Визначена кількість', 'Vast aantal keren')}</button>
          <button type='button' aria-pressed={rechtenEdit.limietModus === 'bevestiging_per_keer'} onClick={() => setRechtenEdit({ ...rechtenEdit, limietModus: 'bevestiging_per_keer' })}>{tr(lang, 'Підтвердження щоразу', 'Bevestiging per keer')}</button>
        </div>
        {rechtenEdit.limietModus === 'aantal' && <label className='ut-veld ut-aantal-veld'><span>{tr(lang, 'Максимум разів (1–1000)', 'Maximum aantal keren (1–1000)')}</span><input type='number' min={1} max={1000} value={rechtenEdit.maxAantal} onChange={(e) => setRechtenEdit({ ...rechtenEdit, maxAantal: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} /></label>}
        {(g.gebruiktAantal ?? 0) > 0 && <label className='ut-check-rij'><input data-hulp-vrij='keuze' type='checkbox' checked={rechtenEdit.resetTeller} onChange={(e) => setRechtenEdit({ ...rechtenEdit, resetTeller: e.target.checked })} /><span>{tr(lang, `Скинути лічильник використань (зараз ${g.gebruiktAantal})`, `Gebruiksteller terugzetten (nu ${g.gebruiktAantal})`)}</span></label>}
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-primair' disabled={!!busy} data-rechten-opslaan={g.id} onClick={() => {
            rechten?.(g, {
              toegangNiveau: rechtenEdit.toegangNiveau,
              limietModus: rechtenEdit.limietModus,
              maxAantal: rechtenEdit.limietModus === 'aantal' ? rechtenEdit.maxAantal : rechtenEdit.limietModus === 'eenmalig' ? 1 : null,
              bevestigingPerKeer: rechtenEdit.limietModus === 'bevestiging_per_keer',
              resetTeller: rechtenEdit.resetTeller,
            });
            setRechtenEdit(null);
          }}><Check aria-hidden='true' />{tr(lang, 'Зберегти права', 'Rechten opslaan')}</button>
          <button type='button' className='ut-knop' disabled={!!busy} onClick={() => setRechtenEdit(null)}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      </div>}
      {wijzig?.id === g.id && <div className='ut-reden-veld' role='group' data-termijn-veld={g.id} aria-label={tr(lang, 'Новий термін', 'Nieuwe termijn')}>
        <span>{tr(lang, `Новий термін для «${g.label}» (рахується від сьогодні):`, `Nieuwe termijn voor «${g.label}» (telt vanaf vandaag):`)}</span>
        <div className='ut-chips-keuze' role='group' aria-label={tr(lang, 'На скільки', 'Hoe lang')}>
          {[1, 7, 30].filter((x) => x <= max).map((x) => <button key={x} type='button' aria-pressed={!wijzig.onbepaald && wijzig.dagen === x} onClick={() => setWijzig({ ...wijzig, dagen: x, onbepaald: false })}>{x} {tr(lang, x === 1 ? 'день' : 'днів', x === 1 ? 'dag' : 'dagen')}</button>)}
          <button type='button' aria-pressed={wijzig.onbepaald} data-onbepaald onClick={() => setWijzig({ ...wijzig, onbepaald: true })}><AlertTriangle aria-hidden='true' />{tr(lang, 'До відкликання', 'Tot intrekking')}</button>
        </div>
        {wijzig.onbepaald && <p className='ut-voorb-waarschuwing' data-toon='warn'><AlertTriangle aria-hidden='true' /> {tr(lang, '! Без терміну дозвіл не закінчиться сам: він діятиме, доки ви його не вимкнете. Схвалювати оновлення агент однаково не може — це лише ваш passkey.', '! Zonder termijn loopt de toestemming nooit vanzelf af: ze blijft tot u haar uitzet. Goedkeuren kan de agent nog steeds niet — dat doet alleen uw passkey.')}</p>}
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-primair' disabled={!!busy} data-termijn-opslaan={g.id} onClick={() => { termijn?.(g, { dagen: wijzig.dagen, onbepaald: wijzig.onbepaald }); setWijzig(null); }}><Check aria-hidden='true' />{tr(lang, 'Зберегти термін', 'Termijn opslaan')}</button>
          <button type='button' className='ut-knop' disabled={!!busy} onClick={() => setWijzig(null)}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      </div>}
      {intrek?.id === g.id && <div className='ut-reden-veld' role='group' data-intrek-grant={g.id}>
        <span>{tr(lang, `Вимкнути доступ для «${g.label}»? Нові пакети він завантажити не зможе; уже завантажені лишаються — ви їх відхилите чи схвалите самі. Користувач побачить, хто й чому це зробив.`, `Toegang voor «${g.label}» uitzetten? Nieuwe pakketten uploaden kan dan niet meer; wat al klaarstaat blijft — u keurt het goed of af. De gebruiker ziet wie het deed en waarom.`)}{g.soort === 'agent' ? ' ' + tr(lang, 'Доступ лишиться вимкненим, навіть якщо в «Доступ ШІ» для агента стоїть «Розгортати сайт»: повернути його можете лише ви кнопкою «Дозволити знову».', 'De toegang blijft uit, ook als «Site uitrollen» voor deze agent in «AI-toegang» aanstaat: alleen u geeft haar terug met «Opnieuw toestaan».') : ''}</span>
        <RedenVeld lang={lang} id={`reden-grant-${g.id}`} waarde={intrek.reden} zet={(v) => setIntrek({ id: g.id, reden: v })} disabled={!!busy} />
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!busy || !redenOk(intrek.reden)} data-intrek-bevestig={g.id} onClick={() => { intrekken(g, intrek.reden.trim()); setIntrek(null); }}><PowerOff aria-hidden='true' />{tr(lang, 'Так, вимкнути', 'Ja, uitzetten')}</button>
          <button type='button' className='ut-knop' disabled={!!busy} onClick={() => setIntrek(null)}><X aria-hidden='true' />{tr(lang, 'Залишити', 'Laten staan')}</button>
        </div>
      </div>}
    </li>; };

  return <section className='ut-kaart ut-voorb' data-ut-voorbereiders aria-labelledby='ut-voorb-titel' tabIndex={-1}>
    <header className='ut-kaart-kop'><div><h2 id='ut-voorb-titel'><UserCheck aria-hidden='true' /> {tr(lang, 'Хто готує оновлення', 'Wie bereidt updates voor')}</h2>
      <p className='ut-sub'>{tr(lang, 'Керуйте правами агентів: лише завантаження в чергу або делеговане встановлення, з обмеженням за періодом, одноразово, за кількістю чи з підтвердженням щоразу.', 'Beheer de rechten van agenten: alleen uploaden naar de wachtrij of gedelegeerd installeren, beperkt per periode, eenmalig, op aantal of met bevestiging per keer.')}</p></div>
      <button ref={knop} type='button' className='ut-knop ut-knop-primair' disabled={!!busy} onClick={() => setVenster(true)} data-agent-toevoegen><Plus aria-hidden='true' />{tr(lang, 'Додати агента', 'Agent toevoegen')}</button>
    </header>

    <ul className='ut-voorb-lijst'>
      {werkend.map((g) => kaart(g, false))}
      {werkend.length === 0 && <li className='ut-voorb-leeg'><ShieldCheck aria-hidden='true' /><div><b>{tr(lang, 'Жоден агент не має дозволу', 'Geen enkele agent heeft toestemming')}</b>
        <p>{tr(lang, 'Свій архів ви завантажуєте завжди (майстер «Нове оновлення»). Щоб ШІ-агент міг готувати пакети — додайте його.', 'Uw eigen archief uploadt u altijd (wizard «Nieuwe update»). Wilt u dat een AI-agent pakketten voorbereidt, voeg hem dan toe.')}</p></div></li>}
    </ul>

    {geblokkeerd.length > 0 && <details className='ut-voorb-oud' data-geblokkeerd open><summary>{tr(lang, `Дозвіл є, але політика ШІ блокує (${geblokkeerd.length})`, `Toestemming bestaat, maar het AI-beleid blokkeert (${geblokkeerd.length})`)}</summary>
      <ul className='ut-voorb-lijst'>{geblokkeerd.map((g) => kaart(g, true))}</ul></details>}

    {uitgezet.length > 0 && <details className='ut-voorb-oud' data-uitgezet open><summary>{tr(lang, `Вимкнено вами, хоча політика ШІ дозволяє (${uitgezet.length})`, `Door u uitgezet, hoewel het AI-beleid het toestaat (${uitgezet.length})`)}</summary>
      <ul className='ut-lijst'>{uitgezet.map((t) => <li key={t.slug} data-uitgezet-agent={t.slug}><span><AgentLogo agent={t.slug} size={22} /> <b>{t.naam}</b> · {tr(lang, `вимкнено ${datum(lang, t.uitgezetDoorEigenaar || '')}. Політика ШІ не повертає доступ сама — лише ви.`, `uitgezet op ${datum(lang, t.uitgezetDoorEigenaar || '')}. Het AI-beleid geeft de toegang niet vanzelf terug — alleen u.`)}</span>
        <button type='button' className='ut-knop ut-knop-zacht' disabled={!!busy} data-opnieuw-toestaan={t.slug} title={tr(lang, 'Відкриває вибір терміну для цього агента. Нічого не змінюється, доки ви не підтвердите.', 'Opent de termijnkeuze voor deze agent. Er verandert niets tot u bevestigt.')} onClick={() => setVenster(true)}><Plus aria-hidden='true' />{tr(lang, 'Дозволити знову', 'Opnieuw toestaan')}</button></li>)}</ul></details>}

    {oud.length > 0 && <details className='ut-voorb-oud'><summary>{tr(lang, `Вимкнені, вичерпані та прострочені (${oud.length})`, `Uitgezet, verbruikt en verlopen (${oud.length})`)}</summary>
      <ul className='ut-lijst'>{oud.map((g) => <li key={g.id} data-status={g.status}><span><b>{g.label}</b> · {tr(lang, SOORT[g.soort][0], SOORT[g.soort][1])} · {g.status === 'verlopen' ? tr(lang, 'термін минув ', 'verlopen ') + datum(lang, g.verlooptOp) : g.status === 'uitgeput' ? tr(lang, `ліміт вичерпано (${g.gebruiktAantal ?? 0}/${g.maxAantal ?? 1})`, `limiet verbruikt (${g.gebruiktAantal ?? 0}/${g.maxAantal ?? 1})`) : tr(lang, 'вимкнено ', 'uitgezet ') + datum(lang, g.ingetrokkenOp)}</span></li>)}</ul></details>}

    <details className='ut-voorb-uitleg'><summary><Info aria-hidden='true' />{tr(lang, 'Чому агент у списку, але не може розгортати?', 'Waarom staat een agent in de lijst maar kan hij niet uitrollen?')}</summary>
      <ol>
        <li>{tr(lang, 'Дозвіл діє до 30 днів або до відкликання (за вашим вибором) і лише для підключення в технічному просторі — приватне підключення ніколи не може торкатися сервера.', 'De toestemming duurt max. 30 dagen of tot intrekking (uw keuze) en geldt alleen voor een koppeling in de technische ruimte — een privékoppeling kan de server nooit raken.')}</li>
        <li>{tr(lang, 'Дозвіл «на підключення» прив’язаний до одного токена. Після нового підключення ШІ токен інший — тому використовуйте дозвіл «Агент».', 'Een toestemming «per koppeling» hangt aan één token. Na opnieuw verbinden is het token anders — gebruik daarom de toestemming «Agent».')}</li>
        <li>{tr(lang, 'На сторінці «Доступ ШІ» група «Розгортання» для цього агента має бути «Завжди» або «Питати щоразу».', 'Op de pagina «AI-toegang» moet de groep «Uitrollen» voor deze agent op «Altijd» of «Vragen» staan.')}</li>
        <li>{tr(lang, 'Акаунт власника має бути активним, а пакет — містити AUTEUR, AGENT і SAMENVATTING та проходити перевірку сайту.', 'Het account van de eigenaar moet actief zijn en het pakket moet AUTEUR, AGENT en SAMENVATTING bevatten en de voorcontrole doorstaan.')}</li>
        <li>{tr(lang, 'Схвалення завжди робите ви: passkey (відбиток / обличчя / PIN). Вхід через Google, пароль, SMS чи 2FA оновлення не схвалює — так задумано.', 'Goedkeuren doet altijd u: met een passkey (vingerafdruk / gezicht / pincode). Inloggen met Google, wachtwoord, sms of 2FA keurt geen update goed — dat is bewust zo.')}</li>
      </ol></details>

    {venster && <AgentToevoegen lang={lang} data={data} busy={busy} geven={geven} termijn={termijn} onSluit={sluit} zoekAccounts={zoekAccounts} />}
  </section>;
}
