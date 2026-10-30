// mcp.*/apps — «Додатки на вашому залізі» (BYOS-PaaS). Eén plek voor de eigenaar:
//  1. panel per apparaat: draaiende containers (Podman/Docker) met poort, bewaking (luistert de app?), uptime, CPU, geheugen,
//     versie, domein; журнал, перезапуск, зупинка/запуск, відкат, видалення — met één klik; ververst zichzelf;
//  2. ontbreekt een toestemming (NO_GRANT), dan staat de knop om die te geven er direct bij (geen console, geen config);
//  3. geheimen die een AI vroeg (app_secret_request → ?geheim=<id>) vult de eigenaar in een eigen venster in: de waarde gaat
//     via een eenmalig ticket rechtstreeks naar het apparaat; de AI ziet haar nooit, niet in de database, het journaal of de chat;
//  4. «Підключити цей сервер» (ServerKoppelen) en uitleg voor elk ander apparaat.
// Alles draait op de eigen hardware van de gebruiker; er is geen externe hosting.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Boxes, CircleAlert, CircleCheck, ExternalLink, KeyRound, Laptop, Play, RefreshCw, RotateCcw, ScrollText, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { api } from './platform/client';
import { Venster } from './platform/vensters';
import { sessionBody } from './agenten-gegevens';
import { foutCode, foutTekst } from './agenten/fouten';
import ServerKoppelen from './ServerKoppelen';
import './mcp-apps.css';
import GeheimInvoer from './geheim/GeheimInvoer';

type Lang = 'uk' | 'nl';
type Verzoek = { id: string; app: string; sleutel: string; uitleg: string; apparaat: string; status: 'open' | 'ingevuld' | 'verlopen'; verloopt: number };
type App = {
  name: string; status: string; version?: string; versions?: number; url?: string; localUrl?: string; domain?: string; hostPort?: number; port?: number;
  listening?: boolean; uptime?: string; memory?: string; cpu?: string; deploy?: string;
};
type Apparaat = { id: string; name: string; platform: string | null; online: boolean; apps: boolean; version: string | null; lijst?: App[]; fout?: string };
type Opdracht = { id: string; status: string; result?: { data?: any; error?: string } | null };
const KLAAR = new Set(['succeeded', 'failed', 'rejected', 'timeout']);
const VERVERS_MS = 20_000;
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function McpAppsView({ lang }: { lang: Lang }) {
  const tr = useCallback((uk: string, nl: string) => (lang === 'uk' ? uk : nl), [lang]);
  const domein = useMemo(() => location.hostname.replace(/^mcp\./, ''), []);
  const [geheimId, setGeheimId] = useState(() => new URLSearchParams(location.search).get('geheim') || '');
  const [verzoeken, setVerzoeken] = useState<Verzoek[]>([]);
  const [apparaten, setApparaten] = useState<Apparaat[] | null>(null);
  const [bijgewerkt, setBijgewerkt] = useState(0);
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout' | 'info'; tekst: string; toestemming?: { agentId: string; cap: 'machine.read' | 'machine.docker' } } | null>(null);
  const [bezig, setBezig] = useState('');
  const [waarde, setWaarde] = useState('');
  const [log, setLog] = useState<{ app: string; tekst: string } | null>(null);
  const [verwijder, setVerwijder] = useState('');
  const bezigRef = useRef('');
  bezigRef.current = bezig;

  // Owner-opdracht: aanmaken; wacht hij op goedkeuring, dan keurt deze klik hem goed (met bevestiging van toegang); dan wachten.
  const opdracht = useCallback(async (agentId: string, type: string, params: object): Promise<Opdracht> => {
    const r = await api.post(`/api/owner/agents/${agentId}/command`, { ...sessionBody(), type, params });
    let cmd = r.data.command as Opdracht;
    if (cmd.status === 'pending_approval') cmd = ((await api.post(`/api/owner/agents/commands/${cmd.id}/approve`, sessionBody())).data.command as Opdracht) ?? cmd;
    for (let i = 0; i < 90 && !KLAAR.has(cmd.status); i++) {
      await wacht(1000);
      const l = await api.post(`/api/owner/agents/${agentId}/commands`, sessionBody());
      cmd = (l.data.commands as Opdracht[]).find((c) => c.id === cmd.id) ?? cmd;
    }
    return cmd;
  }, []);

  const laadVerzoeken = useCallback(async () => {
    try { setVerzoeken((await api.post('/api/owner/apps/geheimen', sessionBody())).data.verzoeken as Verzoek[]); } catch { /* geen sessie: lijst blijft leeg */ }
  }, []);

  const laadApps = useCallback(async (stil = false) => {
    if (!stil) setBezig('lijst');
    try {
      const r = await api.post('/api/owner/apps/overzicht', sessionBody());
      setApparaten(r.data.apparaten as Apparaat[]);
      setBijgewerkt(Number(r.data.at) || Date.now());
    } catch (e) { if (!stil) setMelding({ soort: 'fout', tekst: foutTekst(e, tr, ['Не вдалося завантажити пристрої', 'Apparaten laden mislukt']) }); }
    finally { if (!stil) setBezig(''); }
  }, [tr]);

  useEffect(() => { void laadVerzoeken(); void laadApps(); }, [laadVerzoeken, laadApps]);
  // Bewaking: elke 20 s stil verversen zolang de pagina zichtbaar is en er geen actie loopt.
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible' && !bezigRef.current) { void laadApps(true); void laadVerzoeken(); } }, VERVERS_MS);
    return () => window.clearInterval(t);
  }, [laadApps, laadVerzoeken]);

  const huidig = verzoeken.find((v) => v.id === geheimId) ?? null;
  const open = verzoeken.filter((v) => v.status === 'open');
  const sluitGeheim = () => { setGeheimId(''); setWaarde(''); const u = new URL(location.href); u.searchParams.delete('geheim'); history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`); };

  async function invullen(v: Verzoek) {
    if (!waarde) return;
    setBezig('geheim');
    setMelding({ soort: 'info', tekst: tr('Надсилаю на пристрій…', 'Versturen naar het apparaat…') });
    try {
      const r = await api.post(`/api/owner/apps/geheimen/${v.id}/invullen`, { ...sessionBody(), waarde });
      if (r.data.status === 'succeeded') {
        setWaarde('');
        setMelding({ soort: 'ok', tekst: tr(`Збережено на пристрої «${v.apparaat}» як ${v.sleutel} для «${v.app}». Додаток перезапущено. ШІ значення не бачить.`, `Opgeslagen op «${v.apparaat}» als ${v.sleutel} voor «${v.app}». De app is herstart. De AI ziet de waarde niet.`) });
      } else {
        setMelding({ soort: 'fout', tekst: tr(`Не вдалося зберегти: ${r.data.fout || r.data.status}`, `Opslaan mislukt: ${r.data.fout || r.data.status}`) });
      }
      await laadVerzoeken();
    } catch (e) {
      const { code } = foutCode(e);
      const agentId = verzoeken.find((x) => x.id === v.id) ? (apparaten ?? []).find((a) => a.name === v.apparaat)?.id : undefined;
      setMelding({ soort: 'fout', tekst: foutTekst(e, tr, ['Не вдалося зберегти секрет', 'Geheim opslaan mislukt']), ...(code === 'NO_GRANT' && agentId ? { toestemming: { agentId, cap: 'machine.docker' as const } } : {}) });
    } finally { setBezig(''); }
  }

  async function actie(a: Apparaat, app: App, type: string, params: object, wat: [string, string]) {
    setBezig(`${app.name}:${type}`); setVerwijder('');
    setMelding({ soort: 'info', tekst: tr(`${wat[0]}…`, `${wat[1]}…`) });
    try {
      const c = await opdracht(a.id, type, { name: app.name, ...params });
      if (type === 'apps.logs' && c.status === 'succeeded') { setLog({ app: app.name, tekst: String(c.result?.data?.log ?? '') }); setMelding(null); }
      else if (c.status === 'succeeded') { setMelding({ soort: 'ok', tekst: tr(`${wat[0]}: готово.`, `${wat[1]}: klaar.`) }); await laadApps(true); }
      else setMelding({ soort: 'fout', tekst: tr(`${wat[0]}: не вдалося (${c.result?.error || c.status}).`, `${wat[1]}: mislukt (${c.result?.error || c.status}).`) });
    } catch (e) {
      const { code } = foutCode(e);
      setMelding({ soort: 'fout', tekst: code === 'NO_GRANT' ? tr(`${wat[0]}: цьому пристрою ще не дозволено керувати контейнерами.`, `${wat[1]}: dit apparaat mag nog geen containers beheren.`) : foutTekst(e, tr, wat),
        ...(code === 'NO_GRANT' ? { toestemming: { agentId: a.id, cap: (type === 'apps.logs' ? 'machine.read' : 'machine.docker') as 'machine.read' | 'machine.docker' } } : {}) });
    } finally { setBezig(''); }
  }

  // Toestemming geven zonder de pagina te verlaten (zelfde route als «Агенти» → Пристрої; bevestiging van toegang vraagt de site zelf).
  async function geefToestemming(agentId: string, cap: 'machine.read' | 'machine.docker') {
    setBezig('toestemming');
    try {
      await api.post('/api/owner/ai/grants/add', { ...sessionBody(), grants: [{ agentId, capability: cap, minutes: 30 * 24 * 60 }] });
      setMelding({ soort: 'ok', tekst: cap === 'machine.read'
        ? tr('Дозволено бачити додатки на цьому пристрої (30 днів). Змінити чи відкликати — «Агенти» → «Пристрої».', 'Apps op dit apparaat bekijken is toegestaan (30 dagen). Wijzigen of intrekken: «Agenten» → «Apparaten».')
        : tr('Дозволено керувати контейнерами на цьому пристрої (30 днів). Кожна дія все одно потребує вашого підтвердження. Відкликати — «Агенти» → «Пристрої».', 'Containers beheren op dit apparaat is toegestaan (30 dagen). Elke actie vraagt nog steeds uw bevestiging. Intrekken: «Agenten» → «Apparaten».') });
      await laadApps(true);
    } catch (e) { setMelding({ soort: 'fout', tekst: foutTekst(e, tr, ['Не вдалося дати дозвіл', 'Toestemming geven mislukt']) }); }
    finally { setBezig(''); }
  }
  const toestemmingKnop = (agentId: string, cap: 'machine.read' | 'machine.docker') => (
    <button type='button' disabled={bezig === 'toestemming'} onClick={() => void geefToestemming(agentId, cap)} data-toestemming={cap}>
      <ShieldCheck aria-hidden='true' />{cap === 'machine.read' ? tr('Дозволити бачити додатки (30 днів)', 'Apps laten zien toestaan (30 dagen)') : tr('Дозволити керувати контейнерами (30 днів)', 'Containers beheren toestaan (30 dagen)')}
    </button>
  );

  const metApps = (apparaten ?? []).filter((a) => a.apps);
  const zonderApps = (apparaten ?? []).filter((a) => !a.apps);
  const tijd = (ms: number) => new Date(ms).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className='mapps' data-apps-pagina=''>
      <header className='mapps-kop'>
        <p className='mcp-kicker'>{tr('Ваше залізо · без хмари', 'Uw eigen hardware · geen cloud')}</p>
        <h1><Boxes aria-hidden='true' />{tr('Додатки на вашому залізі', 'Apps op uw eigen hardware')}</h1>
        <p className='mcp-lead'>{tr('ШІ може (лише з вашого дозволу) зібрати й запустити вебдодаток на вашому ПК чи сервері: в ізольованому контейнері без прав root, зі знімком кожної версії й відкатом. Секрети вводите тільки ви.', 'Een AI kan (alleen met uw toestemming) een webapp bouwen en starten op uw pc of server: in een geïsoleerde container zonder root-rechten, met een snapshot van elke versie en terugdraaien. Geheimen voert alleen u in.')}</p>
      </header>

      <div aria-live='polite' className='mapps-live'>{melding ? (
        <div className={`mapps-melding mapps-${melding.soort}`} role={melding.soort === 'fout' ? 'alert' : undefined} data-melding={melding.soort}>
          <span>{melding.tekst}</span>
          {melding.toestemming ? <div className='mapps-knoppen'>{toestemmingKnop(melding.toestemming.agentId, melding.toestemming.cap)}</div> : null}
        </div>) : null}</div>

      {geheimId && verzoeken.length && !huidig ? <p className='mapps-melding mapps-fout' role='alert'>{tr('Цей запит на секрет не знайдено або він уже недійсний (після перезапуску сервера запит треба повторити).', 'Dit verzoek om een geheim bestaat niet of is niet meer geldig (na een herstart van de server moet het opnieuw).')}</p> : null}
      {huidig ? (
        <Venster id='apps-geheim' titel={tr('Секрет для додатка', 'Geheim voor de app')} breedte={560} onSluit={sluitGeheim} sluitenUit={bezig === 'geheim'} lang={lang}>
          <div className='mapps-geheim' data-geheim={huidig.id}>
            <p className='mapps-geheim-kop'><KeyRound aria-hidden='true' />{tr('Введіть секрет для додатка', 'Voer een geheim in voor de app')}</p>
            <dl className='mapps-feiten'>
              <div><dt>{tr('Додаток', 'App')}</dt><dd>{huidig.app}</dd></div>
              <div><dt>{tr('Назва змінної', 'Naam van de variabele')}</dt><dd><code>{huidig.sleutel}</code></dd></div>
              <div><dt>{tr('Пристрій', 'Apparaat')}</dt><dd>{huidig.apparaat}</dd></div>
              <div><dt>{tr('Діє до', 'Geldig tot')}</dt><dd>{new Date(huidig.verloopt).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit' })}</dd></div>
            </dl>
            {huidig.uitleg ? <p className='mapps-uitleg'><b>{tr('ШІ пояснює:', 'De AI legt uit:')}</b> {huidig.uitleg}</p> : null}
            {huidig.status === 'open' ? (
              <form onSubmit={(e) => { e.preventDefault(); void invullen(huidig); }}>
                <label htmlFor={`w-${huidig.id}`}>{tr('Значення (ключ, пароль або токен)', 'Waarde (sleutel, wachtwoord of token)')}</label>
                <GeheimInvoer lang={lang} id={`w-${huidig.id}`} value={waarde} onChange={setWaarde} max={8192} required autoFocus spellCheck={false} soort='app' data={{ 'geheim-waarde': '' }} />
                <p className='mapps-hint'>{tr('Значення йде прямо на ваш пристрій (файл, який бачить лише користувач додатків). Його не побачить ні ШІ, ні чат, ні журнал сайту.', 'De waarde gaat direct naar uw apparaat (een bestand dat alleen de app-gebruiker kan lezen). De AI, de chat en het logboek van de site zien haar niet.')}</p>
                <button type='submit' disabled={!waarde || bezig === 'geheim'} data-geheim-opslaan=''>{bezig === 'geheim' ? tr('Зберігаю…', 'Opslaan…') : tr('Зберегти на пристрої', 'Opslaan op het apparaat')}</button>
              </form>
            ) : <p className='mapps-status' data-status={huidig.status}>{huidig.status === 'ingevuld' ? tr('Вже збережено.', 'Al opgeslagen.') : tr('Посилання прострочене. Попросіть ШІ створити нове.', 'De link is verlopen. Vraag de AI een nieuwe te maken.')}</p>}
          </div>
        </Venster>
      ) : null}

      {open.length ? (
        <section className='mapps-kaart' aria-labelledby='mapps-open' data-open-geheimen={open.length}>
          <h2 id='mapps-open'><KeyRound aria-hidden='true' />{tr(`Запити на секрети (${open.length})`, `Verzoeken om geheimen (${open.length})`)}</h2>
          <ul className='mapps-lijst'>{open.map((v) => <li key={v.id}><span>{v.app} · <code>{v.sleutel}</code> · {v.apparaat}</span><button type='button' onClick={() => { setGeheimId(v.id); setWaarde(''); }}>{tr('Ввести', 'Invoeren')}</button></li>)}</ul>
        </section>
      ) : null}

      <section className='mapps-kaart' aria-labelledby='mapps-apps'>
        <div className='mapps-rij'>
          <h2 id='mapps-apps'><Activity aria-hidden='true' />{tr('Розгорнуті додатки', 'Uitgerolde apps')}</h2>
          <span className='mapps-dim' data-bijgewerkt=''>{bijgewerkt ? tr(`Оновлено о ${tijd(bijgewerkt)} · автоматично кожні 20 с`, `Bijgewerkt om ${tijd(bijgewerkt)} · automatisch elke 20 s`) : ''}</span>
          <button type='button' className='secondary' onClick={() => void laadApps()} disabled={bezig === 'lijst'} data-apps-verversen=''><RefreshCw aria-hidden='true' />{bezig === 'lijst' ? tr('Оновлюю…', 'Vernieuwen…') : tr('Оновити', 'Vernieuwen')}</button>
        </div>
        {apparaten && !metApps.length ? <p data-apps-leeg=''>{tr('Ще немає пристрою з увімкненими додатками. Як увімкнути — нижче.', 'Nog geen apparaat met apps aan. Hoe u dat aanzet staat hieronder.')}</p> : null}
        {metApps.map((a) => (
          <div key={a.id} className='mapps-apparaat' data-apparaat={a.name}>
            <h3>{a.name} <span className={`mapps-badge ${a.online ? 'aan' : 'uit'}`}>{a.online ? tr('онлайн', 'online') : tr('офлайн', 'offline')}</span>{a.version ? <span className='mapps-dim'>{tr('агент', 'agent')} {a.version}</span> : null}</h3>
            {!a.online ? <p className='mapps-dim'>{tr('Пристрій зараз не підключений: додатки на ньому працюють далі, але звідси їх не видно.', 'Het apparaat is nu niet verbonden: de apps erop draaien door, maar zijn van hieruit niet zichtbaar.')}</p> : null}
            {a.fout ? (
              <div className='mapps-melding mapps-fout'>
                <span>{a.fout === 'NO_GRANT' ? tr('Цьому пристрою ще не дозволено показувати свої додатки.', 'Dit apparaat mag zijn apps nog niet tonen.') : a.fout === 'WACHT_OP_GOEDKEURING' ? tr('Запит чекає вашого підтвердження на «Агенти».', 'Het verzoek wacht op uw bevestiging bij «Agenten».') : a.fout}</span>
                {a.fout === 'NO_GRANT' ? <div className='mapps-knoppen'>{toestemmingKnop(a.id, 'machine.read')}</div> : null}
              </div>
            ) : null}
            {a.lijst && !a.lijst.length ? <p>{tr('Додатків ще немає. Попросіть ШІ: «Розгорни мені …».', 'Nog geen apps. Vraag de AI: «Rol voor mij … uit».')}</p> : null}
            {a.lijst?.length ? (
              <ul className='mapps-apps'>
                {a.lijst.map((app) => {
                  const loopt = app.status === 'running';
                  const gezond = loopt && app.listening;
                  return (
                    <li key={app.name} data-app={app.name}>
                      <div className='mapps-app-kop'>
                        <b>{app.name}</b>
                        <span className={`mapps-badge ${loopt ? 'aan' : 'uit'}`} data-app-status={app.status}>{loopt ? tr('працює', 'draait') : app.status === 'stopped' ? tr('зупинено', 'gestopt') : app.status === 'missing' ? tr('контейнера немає', 'geen container') : app.status}</span>
                        {loopt ? <span className={`mapps-gezond ${gezond ? 'ok' : 'nee'}`} data-gezond={String(!!gezond)}>{gezond ? <><CircleCheck aria-hidden='true' />{tr('відповідає', 'antwoordt')}</> : <><CircleAlert aria-hidden='true' />{tr('не відповідає на порту', 'antwoordt niet op de poort')}</>}</span> : null}
                        {app.deploy && !['done', 'failed', ''].includes(app.deploy) ? <span className='mapps-badge uit'>{tr('розгортається…', 'wordt uitgerold…')}</span> : null}
                      </div>
                      <dl className='mapps-meta'>
                        <div><dt>{tr('Порт', 'Poort')}</dt><dd data-app-poort=''><code>127.0.0.1:{app.hostPort ?? '?'}</code> → {app.port ?? '?'}</dd></div>
                        <div><dt>{tr('Версія', 'Versie')}</dt><dd>{app.version || '—'} <span className='mapps-dim'>({app.versions ?? 0} {tr('збережено', 'bewaard')})</span></dd></div>
                        <div><dt>{tr('Стан', 'Status')}</dt><dd>{app.uptime || '—'}</dd></div>
                        <div><dt>CPU · {tr('памʼять', 'geheugen')}</dt><dd>{app.cpu || '—'} · {app.memory || '—'}</dd></div>
                        <div><dt>{tr('Адреса', 'Adres')}</dt><dd>{app.domain && app.url ? <a href={app.url} target='_blank' rel='noreferrer'>{app.domain}<ExternalLink aria-hidden='true' /></a> : <span className='mapps-dim'>{tr('лише на пристрої', 'alleen op het apparaat')}</span>}</dd></div>
                      </dl>
                      <div className='mapps-knoppen'>
                        <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.logs', { lines: 100 }, ['Журнал', 'Logboek'])}><ScrollText aria-hidden='true' />{tr('Журнал', 'Logboek')}</button>
                        {loopt
                          ? <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'stop' }, ['Зупинка', 'Stoppen'])}><Square aria-hidden='true' />{tr('Зупинити', 'Stoppen')}</button>
                          : <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'start' }, ['Запуск', 'Starten'])}><Play aria-hidden='true' />{tr('Запустити', 'Starten')}</button>}
                        <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'restart' }, ['Перезапуск', 'Herstarten'])}><RefreshCw aria-hidden='true' />{tr('Перезапустити', 'Herstarten')}</button>
                        <button type='button' className='secondary' disabled={!!bezig || (app.versions ?? 0) < 2} onClick={() => void actie(a, app, 'apps.rollback', {}, ['Відкат до попередньої версії', 'Terug naar de vorige versie'])}><RotateCcw aria-hidden='true' />{tr('Відкотити', 'Terugdraaien')}</button>
                        {verwijder === `${a.id}:${app.name}`
                          ? <span className='mapps-bevestig' role='group' aria-label={tr('Підтвердження', 'Bevestiging')}>{tr('Видалити контейнер і секрети? Знімки лишаться.', 'Container en geheimen verwijderen? Snapshots blijven.')}
                              <button type='button' className='mapps-gevaar' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'remove' }, ['Видалення', 'Verwijderen'])}>{tr('Так, видалити', 'Ja, verwijderen')}</button>
                              <button type='button' className='secondary' onClick={() => setVerwijder('')}>{tr('Скасувати', 'Annuleren')}</button></span>
                          : <button type='button' className='secondary' disabled={!!bezig} onClick={() => setVerwijder(`${a.id}:${app.name}`)}><Trash2 aria-hidden='true' />{tr('Видалити', 'Verwijderen')}</button>}
                      </div>
                      {log?.app === app.name ? <pre className='mapps-log' tabIndex={0} aria-label={tr(`Журнал ${app.name}`, `Logboek ${app.name}`)} data-app-log=''>{log.tekst || tr('(порожньо)', '(leeg)')}</pre> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ))}
        {zonderApps.length ? <p className='mapps-dim' data-zonder-apps=''>{tr('Пристрої без додатків: ', 'Apparaten zonder apps: ')}{zonderApps.map((a) => `${a.name}${a.version ? ` (${tr('агент', 'agent')} ${a.version})` : ''}`).join(', ')}</p> : null}
      </section>

      <ServerKoppelen lang={lang} apparaten={apparaten ?? []} onGekoppeld={() => void laadApps(true)} />

      <section className='mapps-kaart' aria-labelledby='mapps-aanzetten'>
        <h2 id='mapps-aanzetten'><ShieldCheck aria-hidden='true' />{tr('Інші пристрої', 'Andere apparaten')}</h2>
        <details open={!metApps.length}>
          <summary><Laptop aria-hidden='true' />{tr('Будь-який інший ПК чи сервер з агентом', 'Elke andere pc of server met de agent')}</summary>
          <ol className='mapps-stappen'>
            <li>{tr('Встановіть Podman (рекомендовано, працює без root) або Docker Desktop.', 'Installeer Podman (aanbevolen, werkt zonder root) of Docker Desktop.')}</li>
            <li>{tr('Поруч із agent.mjs (версія 0.5+) виконайте від свого звичайного користувача:', 'Voer naast agent.mjs (versie 0.5+) uit als uw gewone gebruiker:')}
              <pre><code>node agent.mjs apps-config --apps-root ./apps --runtime podman</code></pre>
              <span className='mapps-hint'>{tr(`Домен і Caddy — необовʼязково: --domain "{app}-app.${domein}" --caddy-admin unix:/run/caddy/admin.sock. Без них додатки доступні лише на цьому ПК (127.0.0.1).`, `Domein en Caddy zijn optioneel: --domain "{app}-app.${domein}" --caddy-admin unix:/run/caddy/admin.sock. Zonder zijn apps alleen op deze pc bereikbaar (127.0.0.1).`)}</span></li>
            <li>{tr('Перезапустіть агента (node agent.mjs run). Вимкнути: node agent.mjs apps-config --disable.', 'Herstart de agent (node agent.mjs run). Uitzetten: node agent.mjs apps-config --disable.')}</li>
          </ol>
          <p className='mapps-hint'>{tr('Група docker дорівнює правам root на хості — тому за замовчуванням Podman без root.', 'De docker-groep staat gelijk aan root op de host — daarom standaard Podman zonder root.')}</p>
        </details>
        <ul className='mapps-regels'>
          <li>{tr('Код ШІ працює лише в контейнері: без root, без додаткових прав (cap-drop ALL), з лімітом памʼяті, порт лише на 127.0.0.1.', 'AI-code draait alleen in een container: zonder root, zonder extra rechten (cap-drop ALL), met geheugenlimiet, poort alleen op 127.0.0.1.')}</li>
          <li>{tr('Перед кожним розгортанням — знімок; 5 останніх версій зберігаються. Якщо нова версія не стартує, повертається попередня.', 'Vóór elke uitrol een snapshot; de laatste 5 versies blijven bewaard. Start een nieuwe versie niet, dan komt de vorige terug.')}</li>
          <li>{tr('Що дозволено ШІ, вирішуєте ви: «Агенти» (дозволи пристрою, інструменти «Додатки») і «Доступ ШІ» (підписана політика, група «Додатки»). Кожна дія — у журналі.', 'Wat de AI mag, beslist u: «Agenten» (toestemmingen per apparaat, hulpmiddelen «Apps») en «AI-toegang» (ondertekend beleid, groep «Apps»). Elke actie staat in het journaal.')}</li>
        </ul>
      </section>
    </div>
  );
}
