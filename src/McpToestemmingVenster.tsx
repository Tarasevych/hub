import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock, DoorOpen, Eye, KeyRound, Pencil, ShieldCheck, Terminal, TriangleAlert, Upload, Wrench } from 'lucide-react';
import { api } from './platform/client';
import { clearPendingConsent, getPendingConsent } from './mcp-toestemming-opslag';
import { ecosystemTabContext } from './tab-context';
import { Venster, vensterBeheer } from './platform/vensters';
import { openTechVenster, techActief, useTech } from './tech/tech-opslag';
import './mcp-toestemming-venster.css';
import './mcp-kern-maquette.css';
import { DUREN, duur as duurVan, isDuurId, type DuurId } from '../shared/ai-verbinding';
import { RUIMTE_NAAM, RUIMTE_UITLEG, type AiRuimte } from '../shared/ai-ruimte';
import KoppelWizard, { type V2ConsentInfo } from './connector-v2/KoppelWizard';
import { alleenMens, geenAi } from './menselijke-actie';

type Tr = (uk: string, nl: string) => string;
// soort 'deur': verzoek van de MCP-deur (/Grok, /claude, …; rid mrd_…), anders de connector /mcp.
type Info = { agent?: string | null; v2?: unknown; clientName: string; redirectHost: string; redirectAdres?: string; loopback: boolean; scope: string; expiresAt: number; soort?: 'deur' | 'connector'; deur?: string; duur?: string; redirectSoort?: 'web' | 'loopback' | 'app' | null; handmatigUrl?: string };
type Phase = 'loading' | 'ready' | 'deciding' | 'redirecting' | 'gone' | 'forbidden' | 'limit' | 'elders' | 'error';

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const statusOf = (e: unknown): number => Number((e as { status?: number })?.status ?? 0);
const codeOf = (e: unknown): string => String((e as Error)?.message ?? '');
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * ВІКНО ЗГОДИ: ЯКИЙ ПРОСТІР І ЩО ПОКАЗАТИ — чиста функція (без React, без DOM, без адреси сторінки).
 *
 * `stap`:
 *  • 'toestaan'       — усе ясно, показуємо дозволи й кнопку «Дозволити»;
 *  • 'tech-aanzetten' — запит дверей сервера, але технічний профіль у цій вкладці не активний: потрібна ДІЯ «увімкнути профіль»
 *                       (не перехід на іншу сторінку: тієї сторінки більше немає);
 *  • 'tech-laden'     — стан профілю ще невідомий: нічого не стверджуємо, просто чекаємо.
 *
 * Простір ніколи не залежить від сторінки: двері сервера — завжди технічні, усе інше — вибір людини, і «технічний» можливий лише
 * доки профіль справді активний (сервер перевіряє це ще раз: backend/ai-ruimte-poort.ts).
 */
export type ConsentStap = 'toestaan' | 'tech-aanzetten' | 'tech-laden';
export function consentPlek(o: { isDeur: boolean; techGeladen: boolean; techAan: boolean; keuze?: AiRuimte }): { ruimte: AiRuimte; stap: ConsentStap } {
  const ruimte: AiRuimte = o.isDeur ? 'technisch' : o.techAan && o.keuze === 'technisch' ? 'technisch' : 'prive';
  if (!o.isDeur || o.techAan) return { ruimte, stap: 'toestaan' };
  return { ruimte, stap: o.techGeladen ? 'tech-aanzetten' : 'tech-laden' };
}

/**
 * Poort voor een deurverzoek zonder actief technisch profiel: GEEN link naar een andere pagina (het oude /verbindingen bestaat
 * niet meer), maar de actie «Увімкнути технічний профіль» — hetzelfde venster als de technische band. Het verzoek blijft staan.
 */
export function ConsentTechPoort({ tr, heeftProfiel, netwerkfout, busy, onWeiger, onAanzetten }: {
  tr: Tr; heeftProfiel: boolean; netwerkfout: boolean; busy: boolean; onWeiger: () => void; onAanzetten: () => void;
}) {
  return (
    <>
      <p className='mcp-consent-warn' role='alert' data-consent-ruimte='tech-uit'>
        <DoorOpen size={16} aria-hidden='true' /> {tr('Це запит до дверей сервера — технічний простір. Зараз ваш технічний профіль у цій вкладці не активний, тому дозволити це не можна.', 'Dit is een verzoek aan de serverdeur — de technische ruimte. Uw technische profiel loopt nu niet in dit tabblad, daarom kan dit niet worden toegestaan.')}
      </p>
      <p className='mcp-consent-meta'>{tr('Увімкніть технічний профіль просто тут — цей самий запит залишиться відкритим, і з’явиться «Дозволити». Переходити куди-небудь не потрібно.', 'Zet het technische profiel hier aan — dit verzoek blijft open staan en «Toestaan» verschijnt. U hoeft niet naar een andere pagina.')}</p>
      <div className='mcp-consent-actions'>
        <button type='button' className='mcp-consent-secondary' disabled={busy} onClick={onWeiger}>{tr('Заборонити', 'Weigeren')}</button>
        {heeftProfiel ? (
          <button type='button' className='mcp-consent-primary' data-consent-tech-aan='1' onClick={onAanzetten}>
            <ShieldCheck size={14} aria-hidden='true' /> {tr('Увімкнути технічний профіль', 'Technisch profiel aanzetten')}
          </button>
        ) : null}
      </div>
      {!heeftProfiel ? <p className='mcp-consent-meta' data-consent-tech={netwerkfout ? 'netwerkfout' : 'geen-profiel'}>{netwerkfout
        ? tr('Не вдалося отримати стан технічного профілю (сервер недоступний). Запит зберігається; спробуйте за хвилину.', 'De stand van het technische profiel kon niet worden opgehaald (server onbereikbaar). Het verzoek blijft bewaard; probeer het over een minuut.')
        : tr('У цього облікового запису немає технічного профілю. Двері сервера може відкрити лише власник сервера.', 'Dit account heeft geen technisch profiel. Alleen de eigenaar van de server kan de serverdeur openen.')}</p> : null}
    </>
  );
}

/** Regel «in welke ruimte komt deze verbinding» + de keuze. De keuze is een ACTIE in dit venster, nooit een link naar een pagina. */
export function ConsentRuimteRegel({ tr, uk, ruimte, isDeur, techAan, heeftProfiel, busy, onKies, onAanzetten }: {
  tr: Tr; uk: boolean; ruimte: AiRuimte; isDeur: boolean; techAan: boolean; heeftProfiel: boolean; busy: boolean;
  onKies: (r: AiRuimte) => void; onAanzetten: () => void;
}) {
  const technisch = ruimte === 'technisch';
  return (
    <p className={`mcp-consent-ruimte${technisch ? ' is-technisch' : ''}`} data-consent-ruimte={ruimte}>
      <b>{uk ? RUIMTE_NAAM[ruimte].uk : RUIMTE_NAAM[ruimte].nl}.</b> {uk ? RUIMTE_UITLEG[ruimte].uk : RUIMTE_UITLEG[ruimte].nl}
      {!isDeur && techAan ? <> <button type='button' className='mcp-consent-ruimte-knop' disabled={busy} data-consent-kies-ruimte={technisch ? 'prive' : 'technisch'}
        onClick={() => onKies(technisch ? 'prive' : 'technisch')}>{technisch ? tr('Це для мого приватного простору', 'Dit is voor mijn privéruimte') : tr('Потрібен технічний доступ до сайту й сервера', 'Technische toegang tot de site en de server nodig')} <ArrowRight size={13} aria-hidden='true' /></button></> : null}
      {!isDeur && !techAan && heeftProfiel ? <> <button type='button' className='mcp-consent-ruimte-knop' disabled={busy} data-consent-tech-aan='kies'
        onClick={onAanzetten}>{tr('Потрібен технічний доступ? Увімкніть технічний профіль', 'Technische toegang nodig? Zet het technische profiel aan')} <ShieldCheck size={13} aria-hidden='true' /></button></> : null}
    </p>
  );
}

/**
 * Toestemmingsscherm voor Claude (OAuth). Verschijnt als venster boven elk scherm van mcp.* zodra er een openstaand verzoek
 * is (uit ?consent=<id>, ook bewaard over het aanmelden heen, zie mcp-toestemming-opslag.ts). Wordt alleen gemount voor een
 * aangemelde gebruiker (McpServiceView), dus na het inloggen verschijnt het meteen.
 *
 * RUIMTE = LEVENDE STAAT (20.10.2026). Tot nu toe kwam de ruimte van de PAGINA waarop dit venster stond ('prive' op Agenten,
 * 'technisch' op het aparte adres «Технічні підключення»). Dat adres bestaat niet meer als pagina — het is de tab «Технічне» van de
 * hub op mcp.* (/agents) — en daardoor liep het venster rond: een verzoek van de serverdeur wees naar /verbindingen, /verbindingen wees
 * terug naar /agents, en daar stond het venster weer in de privéruimte. Nu beslist alleen de levende staat van het technische
 * profiel in DIT tabblad (src/tech/tech-opslag.ts → techActief), dezelfde bron als de technische band en de server
 * (backend/ai-ruimte-poort.ts → effectieveRuimte). Een pagina bepaalt niets meer, en er is geen link naar een andere pagina:
 *  • serverdeur (rid mrd_…, soort 'deur'): altijd de technische ruimte. Profiel actief → meteen «Дозволити»; profiel uit → de ACTIE
 *    «Увімкнути технічний профіль» (hetzelfde venster als de band), waarna hetzelfde verzoek blijft staan en «Дозволити» verschijnt.
 *  • oude connector /mcp: de mens kiest zelf. 'technisch' kan alleen met een actief profiel; gaat het profiel uit, dan valt de keuze
 *    terug naar 'prive' (de veilige richting). De server controleert dat nog eens (ruimteUitVerzoek).
 *  • connector v2 (/<agent>): KoppelWizard, rechten per hulpmiddel — die kent geen ruimte van een pagina.
 */
export default function McpConsentModal({ tr }: { tr: Tr }) {
  const uk = tr('uk', 'nl') === 'uk';
  const [rid, setRid] = useState<string | null>(() => getPendingConsent());
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [left, setLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [melding, setMelding] = useState('');
  const [duur, setDuur] = useState<DuurId>('1u');
  const tech = useTech();
  const techAan = techActief(tech);
  // Keuze van de mens voor de oude connector /mcp (de serverdeur is altijd technisch, zie onder). Geen pagina, geen query: deze keuze.
  const [keuze, setKeuze] = useState<AiRuimte>('prive');
  // Profiel uit (of verlopen) → terug naar de privéruimte: nooit stil een technische toestemming op een dood profiel.
  useEffect(() => { if (!techAan) setKeuze('prive'); }, [techAan]);

  // Een nieuw ?consent= (bijv. een tweede verzoek in dezelfde sessie) oppikken bij terug/vooruit-navigatie.
  useEffect(() => {
    const onPop = () => { setRid(getPendingConsent()); setDismissed(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!rid) return;
    let active = true;
    setPhase('loading'); setInfo(null);
    api.post('/api/owner/mcp-connector/consent/info', { ...sessionBody(), rid })
      .then((res) => { if (!active) return; const i = res.data as Info; setInfo(i); setDuur(isDuurId(i.duur) ? i.duur : '1u'); setPhase('ready'); })
      .catch((e) => {
        if (!active) return;
        const status = statusOf(e);
        // SEC-002 ai-mcp-14: 409 CONSENT_ANDERE_BROWSER = dit verzoek is in een ANDERE browser begonnen (cookie-binding ontbreekt).
        if (codeOf(e) === 'CONSENT_ANDERE_BROWSER') setPhase('elders');
        else if (status === 404) { clearPendingConsent(); setPhase('gone'); } else if (status === 403) setPhase('forbidden'); else setPhase('error');
      });
    return () => { active = false; };
  }, [rid]);

  // Aftellen tot het verzoek op de server verloopt.
  useEffect(() => {
    if (!info || phase !== 'ready') return;
    const tick = () => { const ms = info.expiresAt - Date.now(); setLeft(ms); if (ms <= 0) { clearPendingConsent(); setPhase('gone'); } };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [info, phase]);

  const open = !!rid && !dismissed;

  // Serverdeur (rid mrd_…, soort 'deur'): per definitie de technische ruimte — de server zegt dat ook zo in consent/info.
  const isDeur = info?.soort === 'deur' || (rid ?? '').startsWith('mrd_');
  // Ruimte en stap: één pure functie (consentPlek), met de LEVENDE staat van het technisch profiel als enige bron.
  const { ruimte, stap } = consentPlek({ isDeur, techGeladen: tech.geladen, techAan, keuze });
  const technisch = ruimte === 'technisch';
  const techNodig = stap !== 'toestaan';

  const decide = useCallback(async (approve: boolean) => {
    if (!rid || phase !== 'ready') return;
    setPhase('deciding'); setMelding('');
    // Kan een venster «Підтвердіть доступ» openen (vers aanmelden is nodig om toegang te geven): dat staat dan BOVEN dit venster
    // (vensterbeheer, prioriteit kritiek) en het dok toont dat dit venster erop wacht.
    vensterBeheer.wacht('mcp-toestemming', true);
    try {
      const res = await api.post('/api/owner/mcp-connector/consent', { ...sessionBody(), rid, approve, ...(approve ? { duur, ruimte } : {}) });
      setPhase('redirecting');
      clearPendingConsent();
      location.assign(String(res.data.redirect)); // terug naar de AI-klant (web, loopback of app-schema) met de code
    } catch (e) {
      const status = statusOf(e);
      const code = codeOf(e);
      // Eerst de browserbinding (ook 409): anders zou de mens «limiet bereikt» lezen terwijl het verzoek elders begon.
      if (code === 'CONSENT_ANDERE_BROWSER') setPhase('elders');
      else if (status === 409 || code.includes('GRANT_LIMIT')) setPhase('limit');
      else if (status === 404) { clearPendingConsent(); setPhase('gone'); }
      else {
        // Nooit stil terug naar «klaar»: zeggen wat er gebeurde.
        setMelding(code.startsWith('STEP_UP') || code === 'STAP_OP_VENSTER_FOUT'
          ? tr('Доступ не видано: вхід не підтверджено (вікно «Підтвердіть доступ» закрито або не вдалося). Натисніть «Дозволити» ще раз.', 'Geen toegang gegeven: de aanmelding is niet bevestigd (venster «Toegang bevestigen» gesloten of mislukt). Klik nogmaals op «Toestaan».')
          : code === 'TECH_PROFIEL_VEREIST' || code === 'OWNER_REQUIRED'
            ? tr('Технічне підключення може дозволити лише власник з активним технічним профілем. Увімкніть технічний профіль і натисніть «Дозволити» ще раз.', 'Een technische verbinding kan alleen de eigenaar met een actief technisch profiel toestaan. Zet het technisch profiel aan en klik nogmaals op «Toestaan».')
            : tr(`Не вдалося зберегти рішення (${code || status || 'немає зв’язку'}). Спробуйте ще раз.`, `De beslissing kon niet worden opgeslagen (${code || status || 'geen verbinding'}). Probeer het opnieuw.`));
        setPhase('ready');
      }
    } finally { vensterBeheer.wacht('mcp-toestemming', false); }
  }, [rid, phase, tr, duur, ruimte]);

  /**
   * «Увімкнути технічний профіль» — dezelfde stroom als de technische band en het accountmenu (één gebeurtenis, TechLaag luistert en
   * opent zijn eigen venster BOVEN dit venster). Geen navigatie, dus het verzoek (rid in de staat én in mcp-consent-store)
   * blijft gewoon staan; zodra de activering er is, ziet `useTech` dat en verschijnt hier «Дозволити».
   */
  const zetTechAan = useCallback(() => { vensterBeheer.wacht('mcp-toestemming', true); openTechVenster('activeren'); }, []);
  // Het wachten stopt zodra het profiel loopt (of het venster van de band is gesloten en de status opnieuw werd gelezen).
  useEffect(() => { if (techAan) vensterBeheer.wacht('mcp-toestemming', false); }, [techAan]);

  const close = () => { setDismissed(true); };
  const done = () => { clearPendingConsent(); setRid(null); };

  if (!open) return null;
  // Connector v2 (/<agent>): venster in stappen met rechten per hulpmiddel.
  if (rid && info?.agent && info.v2 && (phase === 'ready' || phase === 'deciding' || phase === 'redirecting')) {
    return <KoppelWizard tr={tr} rid={rid} info={info as unknown as V2ConsentInfo} onKlaar={close} />;
  }

  const busy = phase === 'deciding' || phase === 'redirecting';
  const name = info?.clientName || 'Claude';
  const technischGroups: Array<{ id: string; Icon: typeof Eye; title: string; note?: string; items: string[] }> = [
    { id: 'read', Icon: Eye, title: tr('Читання', 'Lezen'), items: [
      tr('Поточний випуск сайту, список випусків і файли випуску (без секретів, ключів і бази даних)', 'De actieve release, de lijst van releases en bestanden van de release (zonder geheimen, sleutels en database)'),
      tr('Стан сервера й служб; агенти, що працюють на самому сервері', 'Stand van de server en de diensten; agenten die op de server zelf draaien'),
    ] },
    { id: 'write', Icon: Upload, title: tr('Підготовка оновлень', 'Updates voorbereiden'), note: tr('лише якщо ви дасте це право в Адміністрування → Оновлення', 'alleen als u dat recht geeft onder Beheer → Updates'), items: [
      tr('Завантажити пакет оновлення для вашого схвалення паролем-ключем; схвалює завжди лише власник на сайті', 'Een updatepakket klaarzetten voor uw passkey-goedkeuring; goedkeuren doet altijd alleen de eigenaar op de site'),
    ] },
  ];

  const deurGroups: Array<{ id: string; Icon: typeof Eye; title: string; note?: string; items: string[] }> = [
    { id: 'read', Icon: Eye, title: tr('Читання', 'Lezen'), items: [
      tr('Файли поточного випуску сайту (без секретів, ключів і бази даних)', 'Bestanden van de actieve release (zonder geheimen, sleutels en database)'),
      tr('Стан сайту й цих дверей, список випусків, стан останнього розгортання', 'Stand van de site en van deze deur, lijst van releases, stand van de laatste uitrol'),
    ] },
    { id: 'write', Icon: Upload, title: tr('Підписаний випуск', 'Ondertekende release'), note: tr('лише якщо ви ввімкнули це на сервері', 'alleen als u dat op de server aanzette'), items: [
      tr('Завантажити пакет, підписаний вашим ключем; встановлює root-служба після перевірки підпису', 'Een pakket uploaden dat met uw sleutel is ondertekend; een root-dienst installeert het na controle van de handtekening'),
    ] },
  ];
  const groups: Array<{ id: string; Icon: typeof Eye; title: string; note?: string; items: string[] }> = isDeur ? deurGroups : technisch ? technischGroups : [
    { id: 'read', Icon: Eye, title: tr('Читання', 'Lezen'), items: [
      tr('Бачити ваші пристрої та їхній стан', 'Uw apparaten en hun status zien'),
      tr('Читати файли й теки в дозволених агентом місцях', 'Bestanden en mappen lezen op de plekken die de agent toestaat'),
      tr('Список контейнерів Docker та метрики системи (ЦП, пам’ять, диск)', 'Docker-containers en systeemmetrics (cpu, geheugen, schijf)'),
    ] },
    { id: 'write', Icon: Pencil, title: tr('Запис', 'Schrijven'), note: tr('кожен запис — лише після вашого «Дозволити»', 'elke schrijfactie pas na uw "Toestaan"'), items: [
      tr('Створювати й змінювати файли в дозволених теках', 'Bestanden maken en wijzigen in de toegestane mappen'),
    ] },
    { id: 'run', Icon: Terminal, title: tr('Виконання', 'Uitvoeren'), note: tr('кожна дія — лише після вашого «Дозволити»', 'elke actie pas na uw "Toestaan"'), items: [
      tr('Запускати команди зі списку, дозволеного агентом (без shell)', 'Commando\'s uit de lijst van de agent starten (zonder shell)'),
      tr('Запускати, зупиняти й перезапускати контейнери Docker', 'Docker-containers starten, stoppen en herstarten'),
    ] },
  ];

  return (
    <Venster id='mcp-toestemming' titel={tr(`Доступ для ${name}`, `Toegang voor ${name}`)} breedte={560} labelledBy='mcp-consent-title' describedBy='mcp-consent-desc' className='mcp-consent-venster'>
      {/* SEC-002 extensie-02: alleen de mens beslist hier (de browserextensie bedient deze zone niet; «Дозволити» telt alleen een echte klik). */}
      <div className='mcp-consent-dialog' data-mcp-consent-modal='true' data-mq-laag-open='1' {...geenAi}>
        <div className='mcp-consent-head'>
          <span className='mcp-consent-icon' aria-hidden='true'>{isDeur ? <DoorOpen size={26} /> : technisch ? <Wrench size={26} /> : <ShieldCheck size={26} />}</span>
          <div>
            <h2 id='mcp-consent-title'>
              {isDeur
                ? tr(`${name} просить доступ до дверей сервера${info?.deur ? ` /${info.deur}` : ''}`, `${name} vraagt toegang tot de serverdeur${info?.deur ? ` /${info.deur}` : ''}`)
                : technisch
                  ? tr(`${name} просить технічний доступ до сайту й сервера`, `${name} vraagt technische toegang tot de site en de server`)
                  : tr(`${name} просить доступ до вашого простору`, `${name} vraagt toegang tot uw ruimte`)}
            </h2>
            <p id='mcp-consent-desc' className='mcp-consent-sub'>
              {phase === 'ready' || busy
                ? <>{tr('Після вашого рішення ви повернетеся на', 'Na uw keuze keert u terug naar') + ` ${info?.redirectHost ?? ''}`}{info?.redirectAdres ? <><br /><small className='mcp-consent-adres' data-consent-redirect-adres='1'>{tr('Повна адреса повернення: ', 'Volledig terugkeeradres: ')}<code>{info.redirectAdres}</code></small></> : null}</>
                : tr('Запит на підключення конектора Mijn Ruimte', 'Verzoek om de Mijn Ruimte-connector te koppelen')}
            </p>
          </div>
        </div>

        {phase === 'loading' ? <p className='mcp-consent-msg'>{tr('Завантаження запиту…', 'Verzoek laden…')}</p> : null}

        {phase === 'gone' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Запит застарів або вже оброблений. Почніть підключення в клієнті ШІ знову.', 'Dit verzoek is verlopen of al afgehandeld. Begin de koppeling opnieuw in de AI-client.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={done}>{tr('Закрити', 'Sluiten')}</button></div>
          </>
        ) : null}

        {phase === 'forbidden' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{isDeur ? tr('Двері сервера може відкрити лише власник сервера. Увійдіть акаунтом власника.', 'Alleen de eigenaar van de server kan de serverdeur openen. Meld u aan met het eigenaarsaccount.') : tr('Цей акаунт не має права керувати конекторами (потрібне право «api-platform»). Увійдіть акаунтом власника.', 'Dit account mag geen connectors beheren (recht "api-platform" nodig). Meld u aan met het eigenaarsaccount.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Закрити', 'Sluiten')}</button></div>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Не вдалося завантажити запит. Перевірте з’єднання й спробуйте ще раз.', 'Het verzoek kon niet worden geladen. Controleer de verbinding en probeer opnieuw.')}</p>
            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Закрити', 'Sluiten')}</button>
              <button type='button' className='mcp-consent-primary' onClick={() => { setRid(null); window.setTimeout(() => setRid(getPendingConsent()), 0); }}>{tr('Спробувати ще раз', 'Opnieuw proberen')}</button>
            </div>
          </>
        ) : null}

        {phase === 'elders' ? (
          <>
            <p className='mcp-consent-msg' role='alert' data-consent-elders='1'>{tr('Цей запит на підключення почато в іншому браузері. Відкрийте посилання в тому браузері, де ви почали підключення ШІ. Якщо ви нічого не починали — просто закрийте це вікно: доступ не буде видано.', 'Dit koppelverzoek is in een andere browser gestart. Open de link in de browser waarin u de AI-koppeling begon. Begon u niets, sluit dit venster dan gewoon: er wordt geen toegang gegeven.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={done}>{tr('Закрити', 'Sluiten')}</button></div>
          </>
        ) : null}

        {phase === 'limit' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Досягнуто ліміт активних доступів (10). Відкличте непотрібні у списку «Надані доступи» нижче й підключіть Claude знову.', 'Limiet van actieve toegangen bereikt (10). Trek oude toegang in onder "Verleende toegang" en koppel Claude opnieuw.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Показати мої доступи', 'Mijn toegang tonen')}</button></div>
          </>
        ) : null}

        {(phase === 'ready' || busy) && info && stap === 'tech-laden' ? (
          <p className='mcp-consent-msg' data-consent-tech='laden'>{tr('Перевіряємо технічний профіль…', 'Technisch profiel controleren…')}</p>
        ) : null}

        {(phase === 'ready' || busy) && info && stap === 'tech-aanzetten' ? (
          <ConsentTechPoort tr={tr} heeftProfiel={!!tech.profiel} netwerkfout={tech.fout === 'netwerk'} busy={busy} onWeiger={() => void decide(false)} onAanzetten={zetTechAan} />
        ) : null}

        {(phase === 'ready' || busy) && info && !techNodig ? (
          <>
            <ConsentRuimteRegel tr={tr} uk={uk} ruimte={ruimte} isDeur={isDeur} techAan={techAan} heeftProfiel={!!tech.profiel} busy={busy}
              onKies={setKeuze} onAanzetten={zetTechAan} />
            {isDeur ? (
              // 20.10.2026: de serverdeur is NIET het connectoradres van een agent. Komt dit venster voor /claude, /grok … dan is het
              // verzoek bij de deur (poort 8091) beland in plaats van bij de app — de tunnelregel op de server is nog de oude
              // (deploy/CONNECTOR-EEN-PAD.md §1). Eerlijk zeggen: via de deur komen nooit privéhulpmiddelen, alleen deze elf technische.
              <p className='mcp-consent-meta' data-consent-deur-uitleg='1'>
                <TriangleAlert size={14} aria-hidden='true' /> {tr('Це двері сервера — стара технічна дорога з одинадцятьма інструментами, а не конектор агента. Через двері ніколи не приходять пошта, Drive, календар чи ваші пристрої. Якщо ви вставили в застосунок ШІ адресу mcp.tarasevych.com/claude (або /grok, /gemini, /copilot) і бачите це вікно — запит потрапив до дверей замість конектора: на сервері ще діє старе правило тунелю. Заборонте тут, оновіть правило (deploy/CONNECTOR-EEN-PAD.md, крок 1) і підключіться знову — тоді з’явиться вікно з обома просторами.', 'Dit is de serverdeur — de oude technische weg met elf hulpmiddelen, niet de connector van een agent. Via de deur komen nooit mail, Drive, agenda of uw apparaten. Plakte u in de AI-app het adres mcp.tarasevych.com/claude (of /grok, /gemini, /copilot) en ziet u dit venster, dan kwam het verzoek bij de deur in plaats van bij de connector: op de server geldt nog de oude tunnelregel. Weiger hier, werk de regel bij (deploy/CONNECTOR-EEN-PAD.md, stap 1) en verbind opnieuw — dan verschijnt het venster met beide ruimtes.')}
              </p>
            ) : null}
            <ul className='mcp-consent-groups' aria-label={tr('Які дозволи запитуються', 'Welke rechten worden gevraagd')}>
              {groups.map(({ id, Icon, title, note, items }) => (
                <li key={id} className={`mcp-consent-group mcp-consent-${id}`}>
                  <span className='mcp-consent-group-icon' aria-hidden='true'><Icon size={18} /></span>
                  <div>
                    <b>{title}{note ? <span className='mcp-consent-note'>{note}</span> : null}</b>
                    <ul>{items.map((text) => <li key={text}>{text}</li>)}</ul>
                  </div>
                </li>
              ))}
            </ul>

            {info.loopback || info.redirectSoort === 'app' ? (
              <p className='mcp-consent-warn' role='alert'>
                <TriangleAlert size={16} aria-hidden='true' /> {info.redirectSoort === 'app'
                  ? tr(`Це застосунок на вашому комп’ютері (${info.redirectHost}). Дозволяйте, лише якщо ви самі щойно почали підключення в ньому.`, `Dit is een app op uw computer (${info.redirectHost}). Sta alleen toe als u net zelf de koppeling erin begon.`)
                  : tr('Це локальний клієнт на вашому комп’ютері (localhost). Дозволяйте, лише якщо ви самі його запустили.', 'Dit is een lokale client op uw computer (localhost). Sta alleen toe als u hem zelf hebt gestart.')}
              </p>
            ) : null}

            <label className='mcp-consent-duur'>
              <span>{tr('Термін доступу', 'Duur van de toegang')}</span>
              <select value={duur} disabled={busy} onChange={(e) => setDuur(e.target.value as DuurId)} data-consent-duur='1'>
                {DUREN.map((d) => <option key={d.id} value={d.id}>{tr(d.uk, d.nl)}</option>)}
              </select>
            </label>
            {duurVan(duur).lang ? <p className='mcp-consent-meta'><TriangleAlert size={14} aria-hidden='true' /> {technisch ? tr('Довгий доступ: відкликати можна будь-коли в «Підключення ШІ» → «Технічне».', 'Lange toegang: intrekken kan altijd onder «AI-koppelingen» → «Technisch».') : tr('Довгий доступ: відкликати можна будь-коли в «Агенти → Підключені ШІ».', 'Lange toegang: intrekken kan altijd onder «Agenten → Verbonden AI».')}</p> : null}

            <p className='mcp-consent-meta'>
              <Clock size={14} aria-hidden='true' /> {tr('Запит діє ще', 'Verzoek nog geldig')}: <b>{mmss(left)}</b>
              {' · '}{technisch ? tr('Доступ можна відкликати будь-коли в «Підключення ШІ» → «Технічне».', 'U kunt de toegang altijd intrekken onder «AI-koppelingen» → «Technisch».') : tr('Доступ можна відкликати будь-коли в розділі «Агенти».', 'U kunt de toegang altijd intrekken onder "Agenten".')}
            </p>

            {melding ? <p className='mcp-consent-warn' role='alert'><TriangleAlert size={16} aria-hidden='true' /> {melding}</p> : null}
            {phase === 'deciding' ? <p className='mcp-consent-meta' role='status'>{tr('Якщо з’явилося вікно «Підтвердіть доступ» — підтвердіть там; воно завжди поверх цього вікна.', 'Verschijnt het venster «Toegang bevestigen», bevestig daar; het staat altijd boven dit venster.')}</p> : null}
            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' disabled={busy} onClick={() => void decide(false)}>{tr('Заборонити', 'Weigeren')}</button>
              <button type='button' className='mcp-consent-primary' disabled={busy} onClick={alleenMens(() => void decide(true))}>
                {phase === 'redirecting' ? tr(`Повертаємо в ${name}…`, `Terug naar ${name}…`) : phase === 'deciding' ? tr('Зачекайте…', 'Even geduld…') : tr('Дозволити', 'Toestaan')}
              </button>
            </div>
            {isDeur && info.handmatigUrl ? (
              <p className='mcp-consent-meta'><KeyRound size={14} aria-hidden='true' /> <a href={info.handmatigUrl} onClick={() => clearPendingConsent()} data-consent-handmatig='1'>{tr('Ввести токен дверей вручну замість цього', 'In plaats daarvan het deurtoken handmatig invoeren')}</a></p>
            ) : null}
          </>
        ) : null}
      </div>
    </Venster>
  );
}
