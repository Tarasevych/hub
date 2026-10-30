// Venster «Перемикачі функцій» / «Functieschakelaars» — rustige vorm (28.10.2026, derde ronde op verzoek van Pavlo:
// «нагромаджено, як Windows XP»). Lijst van lichte rijen: naam + één regel uitleg, een kleine statuspil en één tuimelschakelaar
// «voor iedereen aan/uit» (bevestiging in het venster). Al het andere in één lade (op de telefoon van onderen): segmentbalk
// met vijf standen, alleen het veld van de gekozen stand, «Зберегти», archief, persoonlijke proef en gevarenzone ingeklapt.
// Ouder commentaar (tweede ronde):
// Eén kaart per functie: statusregel in gewone woorden, stappenbalk «Тільки я → Вибрані люди → Частина людей → Усі», één groep knoppen
// voor de stand (server: POST /api/beheer/flags/stand), apart de «Моя особиста перевірка» (alleen voor mij, tijdelijk).
// Tabbladen «Активні» / «Для всіх» / «Архів». Archief = alleen weergave (migratie 0124); de berekening verandert niet.
// Geen grijze knoppen zonder uitleg: wie niet mag beheren ziet bovenaan één balk met wat te doen. Uitleg staat ter plekke
// (<details> onder het item), niet in een zwevend venster. Geen native prompts: bevestigen gebeurt in de kaart zelf.
// Een schakelaar geeft nooit rechten.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Info, Plus, RotateCcw, Search, X } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import { SLEUTEL_RE, VLAG_UITLEG, type Uitkomst } from '../../shared/vlaggen';
import { vlaggenVernieuwen } from './vlaggen-api';
import './vlaggen.css';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Rij = {
  sleutel: string; omschrijving: string; aan: boolean; standaard: boolean; percentage: number; gebruikers: string[]; aantalGebruikers: number;
  voorMij: Uitkomst; mijnTest: boolean | null; mijnTestTot?: number | null; ikInLijst?: boolean; alleenIk?: boolean; voorIedereen?: boolean; gearchiveerd?: boolean;
};
type Lijst = { magBeheren: boolean; magTesten: boolean; testTot: number; rollen?: string[]; eigenaar?: boolean; vlaggen: Rij[] };
type Stand = 'uit' | 'mij' | 'lijst' | 'deel' | 'alle';
type Tabblad = 'actief' | 'alle' | 'archief';

const T = (uk: boolean, a: string, b: string) => (uk ? a : b);

const FOUTEN: Record<string, [string, string]> = {
  TECH_FLAGS_VEREIST: ['Щоб бачити й керувати перемикачами, потрібен активний технічний профіль.', 'Om schakelaars te zien en te beheren is een actief technisch profiel nodig.'],
  TECH_FLAGS_BEHEER_VEREIST: ['Змінювати перемикачі для інших можуть лише ролі «Адміністратор» і «Власник сервера».', 'Schakelaars voor anderen wijzigen kunnen alleen «Beheerder» en «Eigenaar van de server».'],
  TECH_FLAGS_TEST_VEREIST: ['Ваша поточна роль не може робити особисту перевірку.', 'Uw huidige rol kan geen persoonlijke proef doen.'],
  TECH_PROFIEL_NIET_ACTIEF: ['Технічний сеанс у цій вкладці вже не діє (закінчився час, пауза або ви з нього вийшли).', 'De technische sessie in dit tabblad loopt niet meer (tijd om, pauze of verlaten).'],
  VLAG_SERVERFOUT: ['Сервер не зміг зберегти зміну. Нічого не змінено. Спробуйте ще раз за хвилину.', 'De server kon de wijziging niet bewaren. Er is niets veranderd. Probeer het over een minuut opnieuw.'],
  'Internal server error': ['Сервер не зміг виконати дію. Нічого не змінено. Спробуйте ще раз за хвилину.', 'De server kon de actie niet uitvoeren. Er is niets veranderd. Probeer het over een minuut opnieuw.'],
  SLEUTEL_ONGELDIG: ['Код: маленькі латинські літери, цифри й «-», від 3 до 41 знака, починається з літери.', 'Code: kleine letters, cijfers en «-», 3 tot 41 tekens, begint met een letter.'],
  PERCENTAGE_ONGELDIG: ['Частина людей — ціле число від 1 до 99 %.', 'Deel van de mensen: een heel getal van 1 tot 99 %.'],
  LIJST_LEEG: ['Додайте хоча б одну адресу пошти.', 'Voeg minstens één e-mailadres toe.'],
  EMAIL_ONGELDIG: ['Перевірте адреси пошти.', 'Controleer de e-mailadressen.'],
  GEBRUIKERS_ONGELDIG: ['Не більше 200 адрес.', 'Hoogstens 200 adressen.'],
  ARCHIEF_ALLEEN_VOOR_IEDEREEN: ['В архів можна лише функцію, яка ввімкнена для всіх.', 'Naar het archief kan alleen een functie die voor iedereen aan staat.'],
  VLAG_NIET_GEVONDEN: ['Такого перемикача вже немає. Закрийте й відкрийте вікно знову.', 'Deze schakelaar bestaat niet meer. Sluit en open het venster opnieuw.'],
};
function foutTekst(e: unknown, uk: boolean) {
  const c = String((e as Error)?.message || 'FOUT');
  if (c.startsWith('GEBRUIKER_NIET_GEVONDEN')) { const m = c.split(':')[1] || ''; return T(uk, `Користувача ${m} не знайдено. Він має спершу хоч раз увійти на сайт.`, `Gebruiker ${m} niet gevonden. Die moet eerst één keer op de site inloggen.`); }
  const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : T(uk, 'Не вдалося виконати дію. Нічого не змінено. Спробуйте ще раз.', 'De actie is niet gelukt. Er is niets veranderd. Probeer opnieuw.');
}

/** Huidige stand van een functie, afgeleid van dezelfde velden als de berekening. */
export function standVan(v: Pick<Rij, 'aan' | 'standaard' | 'percentage' | 'aantalGebruikers' | 'alleenIk' | 'voorIedereen'>): Stand {
  if (!v.aan) return 'uit';
  if (v.voorIedereen || v.percentage >= 100 || (v.percentage === 0 && v.standaard)) return 'alle';
  if (v.percentage > 0) return 'deel';
  if (v.alleenIk) return 'mij';
  if (v.aantalGebruikers > 0) return 'lijst';
  return 'uit';
}
const STANDEN: Stand[] = ['uit', 'mij', 'lijst', 'deel', 'alle'];
const kortNaam = (s: Stand, uk: boolean) => ({
  uit: T(uk, 'Вимкнено', 'Uit'), mij: T(uk, 'Тільки я', 'Alleen ik'), lijst: T(uk, 'Вибрані', 'Gekozen'), deel: T(uk, 'Частина', 'Deel'), alle: T(uk, 'Усі', 'Iedereen'),
}[s]);
function pil(v: Rij, uk: boolean): string {
  const s = standVan(v);
  if (s === 'lijst') return T(uk, `${v.aantalGebruikers} ${v.aantalGebruikers === 1 ? 'людина' : 'людей'}`, `${v.aantalGebruikers} ${v.aantalGebruikers === 1 ? 'persoon' : 'mensen'}`);
  if (s === 'deel') return `${v.percentage} %`;
  if (s === 'alle') return T(uk, 'Для всіх', 'Iedereen');
  return kortNaam(s, uk);
}
function statusRegel(v: Rij, uk: boolean): string {
  const s = standVan(v);
  if (s === 'uit') return T(uk, 'Зараз: вимкнено для всіх. Ніхто цього не бачить.', 'Nu: uit voor iedereen. Niemand ziet het.');
  if (s === 'mij') return T(uk, 'Зараз: увімкнено тільки для вас. Інші не бачать.', 'Nu: alleen voor u aan. Anderen zien het niet.');
  if (s === 'lijst') return T(uk, `Зараз: увімкнено для ${v.aantalGebruikers} ${v.aantalGebruikers === 1 ? 'людини' : 'людей'} зі списку. Інші не бачать.`, `Nu: aan voor ${v.aantalGebruikers} ${v.aantalGebruikers === 1 ? 'persoon' : 'mensen'} uit de lijst. Anderen zien het niet.`);
  if (s === 'deel') return T(uk, `Зараз: увімкнено для ${v.percentage} % людей${v.aantalGebruikers ? ` і для ${v.aantalGebruikers} зі списку` : ''}.`, `Nu: aan voor ${v.percentage} % van de mensen${v.aantalGebruikers ? ` en voor ${v.aantalGebruikers} uit de lijst` : ''}.`);
  return T(uk, 'Зараз: увімкнено для всіх. Усі користувачі це бачать.', 'Nu: aan voor iedereen. Alle gebruikers zien het.');
}
const STAND_UITLEG: Record<Stand, [string, string]> = {
  uit: ['Функцію не бачить ніхто. Список людей і відсоток зберігаються — їх можна ввімкнути знову одним натиском.', 'Niemand ziet de functie. De lijst en het percentage blijven bewaard: met één klik weer aan.'],
  mij: ['Бачите тільки ви (постійно, доки не зміните). Добрий перший крок, щоб спробувати. Попередній список людей замінюється вами.', 'Alleen u ziet het (blijvend, tot u het verandert). Een goede eerste stap om te proberen. Een eerdere lijst met mensen wordt vervangen door u.'],
  lijst: ['Бачать лише люди, чиї адреси пошти ви вкажете. Решта — ні.', 'Alleen de mensen van wie u het e-mailadres invult zien het. De rest niet.'],
  deel: ['Бачить вибрана частка людей. Та сама людина завжди або бачить, або ні; збільшення відсотка ні в кого нічого не забирає.', 'Een gekozen deel van de mensen ziet het. Dezelfde persoon ziet het altijd of nooit; het percentage verhogen neemt niemand iets af.'],
  alle: ['Бачать усі користувачі. Коли все добре — перенесіть у «Архів», щоб не заважало.', 'Alle gebruikers zien het. Als alles goed is: naar «Archief», zodat het niet in de weg staat.'],
};

function naamVan(v: Rij, uk: boolean) { const x = VLAG_UITLEG[v.sleutel]; return x ? x.naam[uk ? 0 : 1] : (v.omschrijving.split(/[.:]/)[0]?.trim() || v.sleutel); }
function uitlegVan(v: Rij, uk: boolean) {
  const x = VLAG_UITLEG[v.sleutel]; const i = uk ? 0 : 1;
  if (x) return `${x.wat[i]} ${x.wanneer[i]} ${x.gevolg[i]}`;
  return v.omschrijving || T(uk, 'Нова функція сайту, яку ще перевіряють. Прав вона не дає й не забирає.', 'Een nieuwe functie van de site die nog getest wordt. Geeft of neemt geen rechten.');
}

export default function VlaggenVenster({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [laadFout, setLaadFout] = useState('');
  const [tab, setTab] = useState<Tabblad>('actief');
  const [zoek, setZoek] = useState('');
  const [hoe, setHoe] = useState(false);
  const [nieuw, setNieuw] = useState<{ sleutel: string; omschrijving: string } | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ sleutel: string; tekst: string; goed: boolean } | null>(null);
  const [open, setOpen] = useState('');
  const [vraag, setVraag] = useState<{ sleutel: string; stand: 'uit' | 'alle' } | null>(null);
  const laad = () => { setLaadFout(''); return api.post('/api/beheer/flags', body()).then((r) => setLijst(r.data as Lijst), (e) => { setLijst(null); setLaadFout(String((e as Error)?.message || '')); }); };
  useEffect(() => { void laad(); }, []);
  useEffect(() => { if (!melding?.goed) return; const t = setTimeout(() => setMelding(null), 2600); return () => clearTimeout(t); }, [melding]);

  const doe = async (sleutel: string, pad: string, extra: Record<string, unknown>) => {
    setBezig(sleutel); setMelding(null);
    try { const r = await api.post(pad, { ...body(), ...extra }); setLijst(r.data as Lijst); void vlaggenVernieuwen(); setMelding({ sleutel, tekst: T(uk, 'Збережено', 'Bewaard'), goed: true }); return true; }
    catch (e) {
      setMelding({ sleutel, tekst: foutTekst(e, uk), goed: false });
      if (/^TECH_/.test(String((e as Error)?.message || ''))) void laad();
      return false;
    } finally { setBezig(''); }
  };
  const plekVan = (v: Rij): Tabblad => (v.gearchiveerd ? 'archief' : standVan(v) === 'alle' ? 'alle' : 'actief');
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (lijst?.vlaggen ?? []).filter((v) => plekVan(v) === tab && (!q || `${v.sleutel} ${naamVan(v, uk)} ${uitlegVan(v, uk)}`.toLowerCase().includes(q)));
  }, [lijst, tab, zoek, uk]);
  const aantal = (t: Tabblad) => (lijst?.vlaggen ?? []).filter((v) => plekVan(v) === t).length;
  const tot = lijst ? new Date(lijst.testTot).toLocaleTimeString(uk ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
  const openRij = lijst?.vlaggen.find((v) => v.sleutel === open) ?? null;
  const vraagRij = lijst?.vlaggen.find((v) => v.sleutel === vraag?.sleutel) ?? null;

  return (
    <Venster id='tech-vlaggen' titel={T(uk, 'Перемикачі функцій', 'Functieschakelaars')} breedte={720} onSluit={sluit}>
      <div className='vlag-venster' data-vlaggen-venster='1'>
        <p className='vlag-lead'>
          {T(uk, 'Нові можливості сайту: виберіть, хто їх бачить.', 'Nieuwe mogelijkheden van de site: kies wie ze ziet.')}{' '}
          <button type='button' className='vlag-link' aria-expanded={hoe} onClick={() => setHoe(!hoe)} data-vlag-hoe='1'>{T(uk, 'Як це працює?', 'Hoe werkt het?')}</button>
        </p>
        {hoe ? (
          <div className='vlag-hoe-tekst' data-vlag-hoe-tekst='1'>
            <p>{T(uk, 'Перемикач праворуч вмикає або вимикає функцію для всіх.', 'De schakelaar rechts zet een functie voor iedereen aan of uit.')}</p>
            <p>{T(uk, 'Натисніть на рядок, щоб показати функцію лише собі, вибраним людям або частині людей.', 'Klik op een rij om een functie alleen aan uzelf, aan gekozen mensen of aan een deel te tonen.')}</p>
            <p>{T(uk, 'Готове для всіх можна перенести в «Архів»: воно лишається ввімкненим.', 'Wat klaar is voor iedereen kan naar «Archief»: het blijft aan.')}</p>
            <p>{T(uk, 'Перемикачі не дають і не забирають прав.', 'Schakelaars geven of nemen geen rechten.')}</p>
          </div>
        ) : null}

        {laadFout ? <ToegangBalk code={laadFout} uk={uk} opnieuw={laad} /> : null}
        {lijst && !lijst.magBeheren ? <ToegangBalk code='TECH_FLAGS_BEHEER_VEREIST' uk={uk} opnieuw={laad} /> : null}
        {lijst === null && !laadFout ? <p className='vlag-klein' role='status'>{T(uk, 'Завантаження…', 'Laden…')}</p> : null}

        {lijst ? (
          <>
            <div className='vlag-balk-boven'>
              <div className='vlag-segment' role='tablist' aria-label={T(uk, 'Розділи', 'Onderdelen')}>
                {(['actief', 'alle', 'archief'] as Tabblad[]).map((t) => (
                  <button key={t} type='button' role='tab' aria-selected={tab === t} onClick={() => setTab(t)} data-vlag-tab={t}>
                    {t === 'actief' ? T(uk, 'Активні', 'Actief') : t === 'alle' ? T(uk, 'Для всіх', 'Voor iedereen') : T(uk, 'Архів', 'Archief')}<span className='vlag-teller'>{aantal(t)}</span>
                  </button>
                ))}
              </div>
              <label className='vlag-zoek'><Search aria-hidden='true' /><input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={T(uk, 'Пошук', 'Zoeken')} aria-label={T(uk, 'Пошук функції', 'Functie zoeken')} data-vlag-zoek='1' /></label>
            </div>
            {zichtbaar.length === 0 ? <p className='vlag-leeg'>{zoek ? T(uk, 'Нічого не знайдено.', 'Niets gevonden.') : tab === 'archief' ? T(uk, 'В архіві поки нічого.', 'Nog niets in het archief.') : tab === 'alle' ? T(uk, 'Поки жодна функція не ввімкнена для всіх.', 'Nog geen functie voor iedereen aan.') : T(uk, 'Тут поки порожньо.', 'Hier is nog niets.')}</p> : (
              <ul className='vlag-rijen' data-vlaggen-lijst='1'>
                {zichtbaar.map((v) => {
                  const s = standVan(v); const ik = bezig === v.sleutel;
                  return (
                    <li key={v.sleutel} className='vlag-rij' data-vlag={v.sleutel} data-vlag-stand={s}>
                      <button type='button' className='vlag-rij-hoofd' onClick={() => setOpen(v.sleutel)} data-vlag-knop='openen' aria-label={`${naamVan(v, uk)}: ${T(uk, 'налаштувати', 'instellen')}`}>
                        <span className='vlag-naam'>{naamVan(v, uk)}</span>
                        <span className='vlag-omschrijving'>{uitlegVan(v, uk)}</span>
                      </button>
                      <span className={`vlag-pil is-${s}`} data-vlag-status='1'>{ik ? T(uk, 'Зберігаю…', 'Bezig…') : pil(v, uk)}</span>
                      <button type='button' className='vlag-tuimel' aria-pressed={s === 'alle'} disabled={ik || !lijst.magBeheren}
                        aria-label={s === 'alle' ? T(uk, `Вимкнути «${naamVan(v, uk)}» для всіх`, `«${naamVan(v, uk)}» voor iedereen uitzetten`) : T(uk, `Увімкнути «${naamVan(v, uk)}» для всіх`, `«${naamVan(v, uk)}» voor iedereen aanzetten`)}
                        onClick={() => setVraag({ sleutel: v.sleutel, stand: s === 'alle' ? 'uit' : 'alle' })} data-vlag-tuimel={s === 'alle' ? 'aan' : 'uit'}><span /></button>
                      <ChevronRight className='vlag-pijl' aria-hidden='true' />
                      {melding?.sleutel === v.sleutel && !open ? <span className={melding.goed ? 'vlag-toast' : 'vlag-fout'} role={melding.goed ? 'status' : 'alert'} data-vlag-melding={melding.goed ? 'gelukt' : 'fout'}>{melding.tekst}</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {lijst.magBeheren ? (nieuw ? (
              <form className='vlag-nieuw' data-vlag-form='1' onSubmit={(e) => { e.preventDefault(); if (!bezig && SLEUTEL_RE.test(nieuw.sleutel)) void doe(nieuw.sleutel, '/api/beheer/flags/zetten', { vlag: { sleutel: nieuw.sleutel, omschrijving: nieuw.omschrijving, aan: false, standaard: false, percentage: 0, gebruikers: [] } }).then((ok) => { if (ok) { setNieuw(null); setTab('actief'); } }); }}>
                <p className='vlag-klein'>{T(uk, 'Новий перемикач спершу вимкнений для всіх.', 'Een nieuwe schakelaar begint uit voor iedereen.')}</p>
                <label className='vlag-veld'><span>{T(uk, 'Код у програмі (дає розробник)', 'Code in het programma (van de ontwikkelaar)')}</span><input value={nieuw.sleutel} onChange={(e) => setNieuw({ ...nieuw, sleutel: e.target.value.toLowerCase() })} required maxLength={41} data-vlag-veld='sleutel' /></label>
                <label className='vlag-veld'><span>{T(uk, 'Що це (коротко)', 'Wat is het (kort)')}</span><input value={nieuw.omschrijving} onChange={(e) => setNieuw({ ...nieuw, omschrijving: e.target.value })} maxLength={300} data-vlag-veld='omschrijving' /></label>
                <div className='vlag-acties'>
                  <button type='button' className='vlag-knop' onClick={() => setNieuw(null)}>{T(uk, 'Скасувати', 'Annuleren')}</button>
                  <button type='submit' className='vlag-knop is-hoofd' disabled={!!bezig || !SLEUTEL_RE.test(nieuw.sleutel)} data-vlag-knop='opslaan'>{bezig === nieuw.sleutel ? T(uk, 'Зберігаю…', 'Bezig…') : T(uk, 'Створити', 'Aanmaken')}</button>
                </div>
                {melding && melding.sleutel === nieuw.sleutel && !melding.goed ? <p className='vlag-fout' role='alert'>{melding.tekst}</p> : null}
              </form>
            ) : <button type='button' className='vlag-link vlag-nieuw-knop' onClick={() => setNieuw({ sleutel: '', omschrijving: '' })} data-vlag-knop='nieuw'><Plus aria-hidden='true' />{T(uk, 'Новий перемикач', 'Nieuwe schakelaar')}</button>) : null}
          </>
        ) : null}
      </div>
      {vraag && vraagRij ? (
        <Laag onSluit={() => setVraag(null)} soort='vraag' label={vraag.stand === 'alle' ? T(uk, 'Увімкнути для всіх?', 'Voor iedereen aanzetten?') : T(uk, 'Вимкнути для всіх?', 'Voor iedereen uitzetten?')}>
          <div className='vlag-vraag' data-vlag-bevestig={vraag.stand}>
            <h3>{vraag.stand === 'alle' ? T(uk, 'Увімкнути для всіх?', 'Voor iedereen aanzetten?') : T(uk, 'Вимкнути для всіх?', 'Voor iedereen uitzetten?')}</h3>
            <p><b>{naamVan(vraagRij, uk)}</b></p>
            <p className='vlag-klein'>{T(uk, STAND_UITLEG[vraag.stand][0], STAND_UITLEG[vraag.stand][1])}</p>
            <div className='vlag-acties'>
              <button type='button' className='vlag-knop' onClick={() => setVraag(null)}>{T(uk, 'Скасувати', 'Annuleren')}</button>
              <button type='button' className='vlag-knop is-hoofd' disabled={!!bezig} data-vlag-knop='bevestigen'
                onClick={() => void doe(vraag.sleutel, '/api/beheer/flags/stand', { sleutel: vraag.sleutel, stand: vraag.stand }).then(() => setVraag(null))}>
                {bezig ? T(uk, 'Зберігаю…', 'Bezig…') : vraag.stand === 'alle' ? T(uk, 'Увімкнути', 'Aanzetten') : T(uk, 'Вимкнути', 'Uitzetten')}</button>
            </div>
          </div>
        </Laag>
      ) : null}
      {openRij && lijst ? (
        <Laag onSluit={() => setOpen('')} soort='lade' label={naamVan(openRij, uk)}>
          <Lade v={openRij} uk={uk} lijst={lijst} tot={tot} bezig={bezig} melding={melding?.sleutel === openRij.sleutel ? melding : null} doe={doe} sluit={() => setOpen('')} />
        </Laag>
      ) : null}
    </Venster>
  );
}

/** Lade of vraag boven de inhoud van het venster. Esc sluit eerst deze laag. */
function Laag({ children, onSluit, soort, label }: { children: React.ReactNode; onSluit: () => void; soort: 'lade' | 'vraag'; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const vorig = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSluit(); } };
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('keydown', esc, true); vorig?.focus?.(); };
  }, []);
  // Binnen het venster (geen portal): het venster heeft een eigen stapelvolgorde met een achtergrondlaag erboven.
  return (
    <div className={`vlag-laag is-${soort}`} onPointerDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={ref} className={`vlag-${soort}-vak`} role='dialog' aria-modal='true' aria-label={label} tabIndex={-1} data-vlag-laag={soort}>{children}</div>
    </div>);
}

function ToegangBalk({ code, uk, opnieuw }: { code: string; uk: boolean; opnieuw: () => void }) {
  const [bezig, setBezig] = useState(false);
  return (
    <div className='vlag-melding-balk' role='alert' data-vlag-balk={code}>
      <Info aria-hidden='true' />
      <div>
        <p><b>{foutTekst(new Error(code), uk)}</b></p>
        <ol>
          <li>{T(uk, 'Натисніть свій аватар угорі праворуч.', 'Klik op uw avatar rechtsboven.')}</li>
          <li>{T(uk, '«Технічний профіль» → «Увімкнути» (або «Продовжити» після паузи). Для керування потрібна роль «Власник сервера» або «Адміністратор».', '«Technisch profiel» → «Aanzetten» (of «Hervatten» na een pauze). Voor beheer is «Eigenaar van de server» of «Beheerder» nodig.')}</li>
          <li>{T(uk, 'Поверніться й натисніть «Перевірити ще раз».', 'Kom terug en klik «Opnieuw controleren».')}</li>
        </ol>
        <button type='button' className='vlag-link' disabled={bezig} onClick={() => { setBezig(true); void Promise.resolve(opnieuw()).finally(() => setBezig(false)); }} data-vlag-knop='opnieuw'><RotateCcw aria-hidden='true' />{bezig ? T(uk, 'Перевіряю…', 'Bezig…') : T(uk, 'Перевірити ще раз', 'Opnieuw controleren')}</button>
      </div>
    </div>
  );
}

function Lade({ v, uk, lijst, tot, bezig, melding, doe, sluit }: {
  v: Rij; uk: boolean; lijst: Lijst; tot: string; bezig: string; melding: { tekst: string; goed: boolean } | null;
  doe: (sleutel: string, pad: string, extra: Record<string, unknown>) => Promise<boolean>; sluit: () => void;
}) {
  const huidig = standVan(v);
  const [keuze, setKeuze] = useState<Stand>(huidig);
  const [mails, setMails] = useState<string[]>(v.gebruikers);
  const [nieuweMail, setNieuweMail] = useState('');
  const [pct, setPct] = useState(v.percentage > 0 && v.percentage < 100 ? v.percentage : 10);
  const [omschrijving, setOmschrijving] = useState(v.omschrijving);
  const [weg, setWeg] = useState(false);
  useEffect(() => { setKeuze(standVan(v)); }, [v.aan, v.standaard, v.percentage, v.aantalGebruikers]);
  const ik = bezig === v.sleutel; const mag = lijst.magBeheren;
  const voegToe = () => { const m = nieuweMail.trim(); if (m && !mails.includes(m)) setMails([...mails, m]); setNieuweMail(''); };
  const veranderd = keuze !== huidig || (keuze === 'lijst' && mails.join(',') !== v.gebruikers.join(',')) || (keuze === 'deel' && pct !== v.percentage);
  const bewaar = () => void doe(v.sleutel, '/api/beheer/flags/stand', { sleutel: v.sleutel, stand: keuze, ...(keuze === 'lijst' ? { gebruikers: mails } : {}), ...(keuze === 'deel' ? { percentage: pct } : {}) });
  return (
    <div className='vlag-lade' data-vlag-lade={v.sleutel}>
      <header className='vlag-lade-kop'>
        <div><h3>{naamVan(v, uk)}</h3><p className='vlag-klein' data-vlag-status-lade='1'>{statusRegel(v, uk)}</p></div>
        <button type='button' className='vlag-sluit' onClick={sluit} aria-label={T(uk, 'Закрити', 'Sluiten')} data-vlag-knop='sluiten'><X aria-hidden='true' /></button>
      </header>

      <section className='vlag-blok'>
        <h4>{T(uk, 'Хто бачить', 'Wie ziet het')}</h4>
        <div className='vlag-segment is-vijf' role='group' aria-label={T(uk, 'Хто бачить', 'Wie ziet het')}>
          {STANDEN.map((s) => <button key={s} type='button' aria-pressed={keuze === s} disabled={!mag || ik} onClick={() => setKeuze(s)} data-vlag-stand-knop={s}>{kortNaam(s, uk)}</button>)}
        </div>
        <p className='vlag-klein'>{T(uk, STAND_UITLEG[keuze][0], STAND_UITLEG[keuze][1])}</p>
        {keuze === 'lijst' ? (
          <div className='vlag-invoer' data-vlag-lijst-invoer='1'>
            {mails.length ? <ul className='vlag-mails'>{mails.map((m) => <li key={m}><span>{m}</span><button type='button' onClick={() => setMails(mails.filter((x) => x !== m))} aria-label={T(uk, `Прибрати ${m}`, `${m} weghalen`)}><X aria-hidden='true' /></button></li>)}</ul> : null}
            <div className='vlag-mail-toevoegen'>
              <input type='email' value={nieuweMail} onChange={(e) => setNieuweMail(e.target.value)} placeholder={T(uk, 'адреса пошти', 'e-mailadres')} aria-label={T(uk, 'Адреса пошти', 'E-mailadres')} data-vlag-veld='mail' onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegToe(); } }} />
              <button type='button' className='vlag-knop' onClick={voegToe} data-vlag-knop='mail-toevoegen'>{T(uk, 'Додати', 'Toevoegen')}</button>
            </div>
          </div>
        ) : null}
        {keuze === 'deel' ? (
          <label className='vlag-schuif' data-vlag-deel-invoer='1'><span>{T(uk, `${pct} % людей`, `${pct} % van de mensen`)}</span>
            <input type='range' min={1} max={99} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} data-vlag-veld='percentage' /></label>
        ) : null}
        {mag ? (
          <div className='vlag-acties'>
            {melding ? <span className={melding.goed ? 'vlag-toast' : 'vlag-fout'} role={melding.goed ? 'status' : 'alert'} data-vlag-melding={melding.goed ? 'gelukt' : 'fout'}>{melding.tekst}</span> : null}
            <button type='button' className='vlag-knop is-hoofd' disabled={ik || !veranderd || (keuze === 'lijst' && !mails.length)} onClick={bewaar} data-vlag-knop='stand-opslaan'>{ik ? T(uk, 'Зберігаю…', 'Bezig…') : T(uk, 'Зберегти', 'Opslaan')}</button>
          </div>
        ) : null}
      </section>

      {mag && (huidig === 'alle' || v.gearchiveerd) ? (
        <section className='vlag-blok is-rij'>
          <p className='vlag-klein'>{v.gearchiveerd ? T(uk, 'Ця функція в архіві й увімкнена для всіх.', 'Deze functie staat in het archief en is voor iedereen aan.') : T(uk, 'Готово для всіх? Приберіть з очей — функція лишиться ввімкненою.', 'Klaar voor iedereen? Haal het uit beeld — de functie blijft aan.')}</p>
          <button type='button' className='vlag-knop' disabled={ik} onClick={() => void doe(v.sleutel, '/api/beheer/flags/archief', { sleutel: v.sleutel, inArchief: !v.gearchiveerd })} data-vlag-knop={v.gearchiveerd ? 'uit-archief' : 'archief'}>{v.gearchiveerd ? T(uk, 'Повернути з архіву', 'Terug uit archief') : T(uk, 'У архів', 'Naar archief')}</button>
        </section>
      ) : null}

      <details className='vlag-meer'>
        <summary>{T(uk, 'Пояснення', 'Uitleg')}</summary>
        <p>{uitlegVan(v, uk)}</p>
        <p className='vlag-klein'>{T(uk, 'Код', 'Code')}: <code>{v.sleutel}</code></p>
      </details>
      <details className='vlag-meer vlag-eigen' data-vlag-voor-mij={v.voorMij.value ? 'aan' : 'uit'} open={v.mijnTest !== null ? true : undefined}>
        <summary>{T(uk, 'Моя особиста перевірка', 'Mijn persoonlijke proef')}{v.mijnTest !== null ? <span className='vlag-klein'> · {T(uk, `діє до ${tot}`, `loopt tot ${tot}`)}</span> : null}</summary>
        <p className='vlag-klein'>{T(uk, `Тимчасово лише на вашому екрані (до ${tot}). Для інших нічого не змінюється.`, `Tijdelijk alleen op uw scherm (tot ${tot}). Voor anderen verandert niets.`)}</p>
        {lijst.magTesten ? (
          <div className='vlag-segment' role='group' aria-label={T(uk, 'Моя особиста перевірка', 'Mijn persoonlijke proef')}>
            <button type='button' aria-pressed={v.mijnTest === null} disabled={ik} onClick={() => void doe(v.sleutel, '/api/beheer/flags/test', { sleutel: v.sleutel, waarde: null })} data-vlag-test='weg'>{T(uk, 'Без перевірки', 'Geen proef')}</button>
            <button type='button' aria-pressed={v.mijnTest === true} disabled={ik} onClick={() => void doe(v.sleutel, '/api/beheer/flags/test', { sleutel: v.sleutel, waarde: true })} data-vlag-test='aan'>{T(uk, 'Мені ввімк.', 'Aan voor mij')}</button>
            <button type='button' aria-pressed={v.mijnTest === false} disabled={ik} onClick={() => void doe(v.sleutel, '/api/beheer/flags/test', { sleutel: v.sleutel, waarde: false })} data-vlag-test='uit'>{T(uk, 'Мені вимк.', 'Uit voor mij')}</button>
          </div>
        ) : <p className='vlag-klein'>{T(uk, 'Доступно ролям «Тестувальник», «Розробник», «Власник сервера».', 'Voor «Tester», «Ontwikkelaar», «Eigenaar van de server».')}</p>}
      </details>
      {mag ? (
        <details className='vlag-meer'>
          <summary>{T(uk, 'Опис', 'Omschrijving')}</summary>
          <div className='vlag-mail-toevoegen'>
            <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={300} aria-label={T(uk, 'Опис', 'Omschrijving')} data-vlag-veld='omschrijving' />
            <button type='button' className='vlag-knop' disabled={ik || omschrijving === v.omschrijving} onClick={() => void doe(v.sleutel, '/api/beheer/flags/zetten', { vlag: { sleutel: v.sleutel, omschrijving, aan: v.aan, standaard: v.standaard, percentage: v.percentage, gebruikers: v.gebruikers } })} data-vlag-knop='omschrijving-opslaan'>{T(uk, 'Зберегти опис', 'Omschrijving opslaan')}</button>
          </div>
        </details>
      ) : null}
      {mag ? (
        <details className='vlag-meer is-gevaar' data-vlag-gevaar='1'>
          <summary>{T(uk, 'Видалити перемикач', 'Schakelaar verwijderen')}</summary>
          <p className='vlag-klein'>{T(uk, 'Видалення = функція вважається ВИМКНЕНОЮ для всіх. Повернути можна лише створивши перемикач заново.', 'Verwijderen = de functie geldt als UIT voor iedereen. Terughalen kan alleen door hem opnieuw aan te maken.')}</p>
          {weg
            ? <div className='vlag-acties'><button type='button' className='vlag-knop' onClick={() => setWeg(false)}>{T(uk, 'Скасувати', 'Annuleren')}</button><button type='button' className='vlag-knop is-gevaar' disabled={ik} onClick={() => void doe(v.sleutel, '/api/beheer/flags/verwijderen', { sleutel: v.sleutel }).then((ok) => { if (ok) sluit(); })} data-vlag-knop='zeker'>{T(uk, 'Так, видалити', 'Ja, verwijderen')}</button></div>
            : <button type='button' className='vlag-knop is-gevaar' onClick={() => setWeg(true)} data-vlag-knop='verwijderen'>{T(uk, 'Видалити…', 'Verwijderen…')}</button>}
        </details>
      ) : null}
    </div>
  );
}
