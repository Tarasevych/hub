import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock, DoorOpen, Eye, KeyRound, Pencil, ShieldCheck, Terminal, TriangleAlert, Upload, Wrench } from 'lucide-react';
import { api } from './platform/client';
import { clearPendingConsent, getPendingConsent } from './mcp-consent-store';
import { ecosystemTabContext } from './tab-context';
import { Venster, vensterBeheer } from './platform/vensters';
import './mcp-consent-modal.css';
import { DUREN, duur as duurVan, isDuurId, type DuurId } from '../shared/ai-verbinding';
import { RUIMTE_NAAM, RUIMTE_UITLEG, type AiRuimte } from '../shared/ai-ruimte';

type Tr = (uk: string, nl: string) => string;
// soort 'deur': verzoek van de MCP-deur (/Grok, /claude, …; rid mrd_…), anders de connector /mcp.
type Info = { clientName: string; redirectHost: string; loopback: boolean; scope: string; expiresAt: number; soort?: 'deur' | 'connector'; deur?: string; duur?: string; redirectSoort?: 'web' | 'loopback' | 'app' | null; handmatigUrl?: string };
type Phase = 'loading' | 'ready' | 'deciding' | 'redirecting' | 'gone' | 'forbidden' | 'limit' | 'error';

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const statusOf = (e: unknown): number => Number((e as { status?: number })?.status ?? 0);
const codeOf = (e: unknown): string => String((e as Error)?.message ?? '');
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Toestemmingsscherm voor Claude (OAuth). Verschijnt als venster boven elk scherm van mcp.* zodra er een openstaand verzoek
 * is (uit ?consent=<id>, ook bewaard over het aanmelden heen, zie mcp-consent-store.ts). Wordt alleen gemount voor een
 * aangemelde gebruiker (McpServiceView), dus na het inloggen verschijnt het meteen.
 *
 * `ruimte` = de webruimte van de pagina waarop het venster staat (shared/ai-ruimte.ts): 'prive' op Agenten (accountruimte),
 * 'technisch' op «Технічні підключення» (technisch profiel). De verbinding krijgt de ruimte van de pagina waar de mens toestaat;
 * de server controleert dat (technisch = eigenaar + actief technisch profiel). Een verzoek van de serverdeur kan alleen in de
 * technische ruimte worden toegestaan; vanuit de andere ruimte is er altijd een link naar de juiste, met hetzelfde verzoek.
 */
export default function McpConsentModal({ tr, ruimte = 'prive' }: { tr: Tr; ruimte?: AiRuimte }) {
  const uk = tr('uk', 'nl') === 'uk';
  const [rid, setRid] = useState<string | null>(() => getPendingConsent());
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [left, setLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [melding, setMelding] = useState('');
  const [duur, setDuur] = useState<DuurId>('1u');

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
        if (status === 404) { clearPendingConsent(); setPhase('gone'); } else if (status === 403) setPhase('forbidden'); else setPhase('error');
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
      if (status === 409 || code.includes('GRANT_LIMIT')) setPhase('limit');
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

  const close = () => { setDismissed(true); };
  const done = () => { clearPendingConsent(); setRid(null); };

  if (!open) return null;

  const busy = phase === 'deciding' || phase === 'redirecting';
  const name = info?.clientName || 'Claude';
  const isDeur = info?.soort === 'deur' || (rid ?? '').startsWith('mrd_');
  const technisch = ruimte === 'technisch';
  // De serverdeur is per definitie technisch: in de accountruimte is er geen «Дозволити», alleen de weg naar de juiste ruimte.
  const verkeerdeRuimte = isDeur && !technisch;
  const andereRuimteUrl = `${location.origin}/${technisch ? 'agents' : 'verbindingen'}?consent=${encodeURIComponent(rid ?? '')}`;
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
      tr('Читати файли й папки в дозволених агентом місцях', 'Bestanden en mappen lezen op de plekken die de agent toestaat'),
      tr('Список контейнерів Docker та метрики системи (ЦП, пам’ять, диск)', 'Docker-containers en systeemmetrics (cpu, geheugen, schijf)'),
    ] },
    { id: 'write', Icon: Pencil, title: tr('Запис', 'Schrijven'), note: tr('кожен запис — лише після вашого «Дозволити»', 'elke schrijfactie pas na uw "Toestaan"'), items: [
      tr('Створювати й змінювати файли в дозволених папках', 'Bestanden maken en wijzigen in de toegestane mappen'),
    ] },
    { id: 'run', Icon: Terminal, title: tr('Виконання', 'Uitvoeren'), note: tr('кожна дія — лише після вашого «Дозволити»', 'elke actie pas na uw "Toestaan"'), items: [
      tr('Запускати команди зі списку, дозволеного агентом (без shell)', 'Commando\'s uit de lijst van de agent starten (zonder shell)'),
      tr('Запускати, зупиняти й перезапускати контейнери Docker', 'Docker-containers starten, stoppen en herstarten'),
    ] },
  ];

  return (
    <Venster id='mcp-toestemming' titel={tr(`Доступ для ${name}`, `Toegang voor ${name}`)} breedte={560} labelledBy='mcp-consent-title' describedBy='mcp-consent-desc' className='mcp-consent-venster'>
      <div className='mcp-consent-dialog' data-mcp-consent-modal='true'>
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
                ? tr('Після вашого рішення ви повернетеся на', 'Na uw keuze keert u terug naar') + ` ${info?.redirectHost ?? ''}`
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

        {phase === 'limit' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Досягнуто ліміт активних доступів (10). Відкличте непотрібні у списку «Надані доступи» нижче й підключіть Claude знову.', 'Limiet van actieve toegangen bereikt (10). Trek oude toegang in onder "Verleende toegang" en koppel Claude opnieuw.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Показати мої доступи', 'Mijn toegang tonen')}</button></div>
          </>
        ) : null}

        {(phase === 'ready' || busy) && info && verkeerdeRuimte ? (
          <>
            <p className='mcp-consent-warn' role='alert' data-consent-ruimte='verkeerd'>
              <DoorOpen size={16} aria-hidden='true' /> {tr('Двері сервера — це технічний простір. У приватному просторі цей запит дозволити не можна: тут ШІ ніколи не отримує доступу до сайту чи сервера.', 'De serverdeur is de technische ruimte. In de privéruimte kan dit verzoek niet worden toegestaan: hier krijgt een AI nooit toegang tot de site of de server.')}
            </p>
            <p className='mcp-consent-meta'>{tr('Відкрийте запит у технічному просторі (потрібен активний технічний профіль власника) — сам запит збережеться.', 'Open het verzoek in de technische ruimte (actief technisch profiel van de eigenaar nodig) — het verzoek zelf blijft bewaard.')}</p>
            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' disabled={busy} onClick={() => void decide(false)}>{tr('Заборонити', 'Weigeren')}</button>
              <a className='mcp-consent-primary' href={andereRuimteUrl} data-consent-andere-ruimte='technisch'>{tr('Відкрити в технічному просторі', 'Openen in de technische ruimte')} <ArrowRight size={14} aria-hidden='true' /></a>
            </div>
          </>
        ) : null}

        {(phase === 'ready' || busy) && info && !verkeerdeRuimte ? (
          <>
            <p className={`mcp-consent-ruimte${technisch ? ' is-technisch' : ''}`} data-consent-ruimte={ruimte}>
              <b>{uk ? RUIMTE_NAAM[ruimte].uk : RUIMTE_NAAM[ruimte].nl}.</b> {uk ? RUIMTE_UITLEG[ruimte].uk : RUIMTE_UITLEG[ruimte].nl}
              {!isDeur ? <> <a href={andereRuimteUrl} data-consent-andere-ruimte={technisch ? 'prive' : 'technisch'}>{technisch ? tr('Це для мого приватного простору →', 'Dit is voor mijn privéruimte →') : tr('Потрібен технічний доступ? Відкрити в технічному просторі →', 'Technische toegang nodig? Openen in de technische ruimte →')}</a></> : null}
            </p>
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
            {duurVan(duur).lang ? <p className='mcp-consent-meta'><TriangleAlert size={14} aria-hidden='true' /> {technisch ? tr('Довгий доступ: відкликати можна будь-коли в «Технічні підключення».', 'Lange toegang: intrekken kan altijd onder «Technische verbindingen».') : tr('Довгий доступ: відкликати можна будь-коли в «Агенти → Підключені ШІ».', 'Lange toegang: intrekken kan altijd onder «Agenten → Verbonden AI».')}</p> : null}

            <p className='mcp-consent-meta'>
              <Clock size={14} aria-hidden='true' /> {tr('Запит діє ще', 'Verzoek nog geldig')}: <b>{mmss(left)}</b>
              {' · '}{technisch ? tr('Доступ можна відкликати будь-коли в «Технічні підключення».', 'U kunt de toegang altijd intrekken onder «Technische verbindingen».') : tr('Доступ можна відкликати будь-коли в розділі «Агенти».', 'U kunt de toegang altijd intrekken onder "Agenten".')}
            </p>

            {melding ? <p className='mcp-consent-warn' role='alert'><TriangleAlert size={16} aria-hidden='true' /> {melding}</p> : null}
            {phase === 'deciding' ? <p className='mcp-consent-meta' role='status'>{tr('Якщо з’явилося вікно «Підтвердіть доступ» — підтвердіть там; воно завжди поверх цього вікна.', 'Verschijnt het venster «Toegang bevestigen», bevestig daar; het staat altijd boven dit venster.')}</p> : null}
            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' disabled={busy} onClick={() => void decide(false)}>{tr('Заборонити', 'Weigeren')}</button>
              <button type='button' className='mcp-consent-primary' disabled={busy} onClick={() => void decide(true)}>
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
