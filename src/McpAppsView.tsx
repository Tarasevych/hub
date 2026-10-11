// mcp.*/apps — «Додатки на вашому залізі» (BYOS-PaaS). Eén plek voor de eigenaar:
//  1. geheimen invullen die een AI vroeg (app_secret_request → ?geheim=<id>): de waarde gaat via een eenmalig ticket rechtstreeks
//     naar het apparaat; de AI ziet haar nooit, ze komt niet in de database, het journaal of de chat;
//  2. overzicht van de apps per apparaat (stand, versie, adres, geheugen) met журнал, перезапуск, зупинка, запуск, відкат;
//  3. hoe je het aanzet — op deze server (vaste installer, geen sudo bash met scripts) en op elk ander apparaat met de agent.
// Alles draait op de eigen hardware van de gebruiker; er is geen externe hosting.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, KeyRound, RefreshCw, RotateCcw, Play, Square, ScrollText, ShieldCheck, Server, Laptop, ExternalLink } from 'lucide-react';
import { api } from './platform/client';
import { sessionBody } from './agents-data';
import { foutTekst } from './agenten/fouten';
import './mcp-apps.css';

type Lang = 'uk' | 'nl';
type Verzoek = { id: string; app: string; sleutel: string; uitleg: string; apparaat: string; status: 'open' | 'ingevuld' | 'verlopen'; verloopt: number };
type Agent = { id: string; name: string; platform: string | null; status: string; capabilities?: { apps?: boolean } | null };
type App = { name: string; status: string; version?: string; url?: string; domain?: string; memory?: string; versions?: number; deploy?: string };
type Opdracht = { id: string; status: string; result?: { data?: any; error?: string } | null };
const KLAAR = new Set(['succeeded', 'failed', 'rejected', 'timeout']);
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function McpAppsView({ lang }: { lang: Lang }) {
  const tr = useCallback((uk: string, nl: string) => (lang === 'uk' ? uk : nl), [lang]);
  const geheimId = useMemo(() => new URLSearchParams(location.search).get('geheim') || '', []);
  const domein = useMemo(() => location.hostname.replace(/^mcp\./, ''), []);
  const [verzoeken, setVerzoeken] = useState<Verzoek[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [apps, setApps] = useState<Record<string, App[] | { fout: string }>>({});
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout' | 'info'; tekst: string } | null>(null);
  const [bezig, setBezig] = useState('');
  const [waarde, setWaarde] = useState('');
  const [log, setLog] = useState<{ app: string; tekst: string } | null>(null);

  // Owner-opdracht: aanmaken; als hij op goedkeuring wacht, keurt de eigenaar hem met deze klik goed (zoals op «Агенти»); dan wachten.
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
    try { setVerzoeken((await api.post('/api/owner/apps/geheimen', sessionBody())).data.verzoeken as Verzoek[]); } catch { /* geen rechten of geen sessie: lijst blijft leeg */ }
  }, []);

  const laadApps = useCallback(async () => {
    setBezig('lijst');
    try {
      const lijst = ((await api.post('/api/owner/agents/list', sessionBody())).data.agents as Agent[]).filter((a) => a.platform !== 'browser');
      setAgents(lijst);
      const uit: Record<string, App[] | { fout: string }> = {};
      for (const a of lijst.filter((x) => x.capabilities?.apps === true && x.status === 'connected')) {
        try {
          const c = await opdracht(a.id, 'apps.list', {});
          uit[a.id] = c.status === 'succeeded' ? ((c.result?.data?.apps ?? []) as App[]) : { fout: c.result?.error || c.status };
        } catch (e) { uit[a.id] = { fout: foutTekst(e, tr) }; }
      }
      setApps(uit);
    } catch (e) { setMelding({ soort: 'fout', tekst: foutTekst(e, tr, ['Не вдалося завантажити пристрої', 'Apparaten laden mislukt']) }); }
    finally { setBezig(''); }
  }, [opdracht, tr]);

  useEffect(() => { void laadVerzoeken(); void laadApps(); }, [laadVerzoeken, laadApps]);

  const huidig = verzoeken.find((v) => v.id === geheimId) ?? null;
  const open = verzoeken.filter((v) => v.status === 'open' && v.id !== geheimId);

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
      setMelding({ soort: 'fout', tekst: foutTekst(e, tr, ['Не вдалося зберегти секрет', 'Geheim opslaan mislukt']) });
    } finally { setBezig(''); }
  }

  async function actie(a: Agent, app: App, type: string, params: object, wat: [string, string]) {
    setBezig(`${app.name}:${type}`);
    setMelding({ soort: 'info', tekst: tr(`${wat[0]}…`, `${wat[1]}…`) });
    try {
      const c = await opdracht(a.id, type, { name: app.name, ...params });
      if (type === 'apps.logs' && c.status === 'succeeded') { setLog({ app: app.name, tekst: String(c.result?.data?.log ?? '') }); setMelding(null); }
      else if (c.status === 'succeeded') { setMelding({ soort: 'ok', tekst: tr(`${wat[0]}: готово.`, `${wat[1]}: klaar.`) }); await laadApps(); }
      else setMelding({ soort: 'fout', tekst: tr(`${wat[0]}: не вдалося (${c.result?.error || c.status}).`, `${wat[1]}: mislukt (${c.result?.error || c.status}).`) });
    } catch (e) { setMelding({ soort: 'fout', tekst: foutTekst(e, tr, wat) }); }
    finally { setBezig(''); }
  }

  const metApps = agents.filter((a) => a.capabilities?.apps === true);
  const geheimKaart = (v: Verzoek) => (
    <section className='mapps-kaart mapps-geheim' data-geheim={v.id} aria-labelledby={`g-${v.id}`}>
      <h2 id={`g-${v.id}`}><KeyRound aria-hidden='true' />{tr('Введіть секрет для додатка', 'Voer een geheim in voor de app')}</h2>
      <dl className='mapps-feiten'>
        <div><dt>{tr('Додаток', 'App')}</dt><dd>{v.app}</dd></div>
        <div><dt>{tr('Назва змінної', 'Naam van de variabele')}</dt><dd><code>{v.sleutel}</code></dd></div>
        <div><dt>{tr('Пристрій', 'Apparaat')}</dt><dd>{v.apparaat}</dd></div>
        <div><dt>{tr('Діє до', 'Geldig tot')}</dt><dd>{new Date(v.verloopt).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit' })}</dd></div>
      </dl>
      {v.uitleg ? <p className='mapps-uitleg'><b>{tr('ШІ пояснює:', 'De AI legt uit:')}</b> {v.uitleg}</p> : null}
      {v.status === 'open' ? (
        <form onSubmit={(e) => { e.preventDefault(); void invullen(v); }}>
          <label htmlFor={`w-${v.id}`}>{tr('Значення (ключ, пароль або токен)', 'Waarde (sleutel, wachtwoord of token)')}</label>
          <input id={`w-${v.id}`} type='password' autoComplete='off' spellCheck={false} value={waarde} onChange={(e) => setWaarde(e.target.value)} maxLength={8192} required data-geheim-waarde='' />
          <p className='mapps-hint'>{tr('Значення йде прямо на ваш пристрій (файл, який бачить лише користувач додатків). Його не побачить ні ШІ, ні чат, ні журнал сайту.', 'De waarde gaat direct naar uw apparaat (een bestand dat alleen de app-gebruiker kan lezen). De AI, de chat en het logboek van de site zien haar niet.')}</p>
          <button type='submit' disabled={!waarde || bezig === 'geheim'} data-geheim-opslaan=''>{bezig === 'geheim' ? tr('Зберігаю…', 'Opslaan…') : tr('Зберегти на пристрої', 'Opslaan op het apparaat')}</button>
        </form>
      ) : <p className='mapps-status' data-status={v.status}>{v.status === 'ingevuld' ? tr('Вже збережено.', 'Al opgeslagen.') : tr('Посилання прострочене. Попросіть ШІ створити нове.', 'De link is verlopen. Vraag de AI een nieuwe te maken.')}</p>}
    </section>
  );

  return (
    <div className='mapps' data-apps-pagina=''>
      <header className='mapps-kop'>
        <p className='mcp-kicker'>{tr('Ваше залізо · без хмари', 'Uw eigen hardware · geen cloud')}</p>
        <h1><Boxes aria-hidden='true' />{tr('Додатки на вашому залізі', 'Apps op uw eigen hardware')}</h1>
        <p className='mcp-lead'>{tr('ШІ може (лише з вашого дозволу) зібрати й запустити вебдодаток на вашому ПК чи сервері: в ізольованому контейнері без прав root, зі знімком кожної версії й відкатом. Секрети вводите тільки ви.', 'Een AI kan (alleen met uw toestemming) een webapp bouwen en starten op uw pc of server: in een geïsoleerde container zonder root-rechten, met een snapshot van elke versie en terugdraaien. Geheimen voert alleen u in.')}</p>
      </header>

      <div aria-live='polite' className='mapps-live'>{melding ? <p className={`mapps-melding mapps-${melding.soort}`} role={melding.soort === 'fout' ? 'alert' : undefined} data-melding={melding.soort}>{melding.tekst}</p> : null}</div>

      {geheimId && !huidig ? <p className='mapps-melding mapps-fout' role='alert'>{tr('Цей запит на секрет не знайдено або він уже недійсний (після перезапуску сервера запит треба повторити).', 'Dit verzoek om een geheim bestaat niet of is niet meer geldig (na een herstart van de server moet het opnieuw).')}</p> : null}
      {huidig ? geheimKaart(huidig) : null}
      {open.length ? (
        <section className='mapps-kaart' aria-labelledby='mapps-open'>
          <h2 id='mapps-open'><KeyRound aria-hidden='true' />{tr('Інші запити на секрети', 'Andere verzoeken om geheimen')}</h2>
          <ul className='mapps-lijst'>{open.map((v) => <li key={v.id}><span>{v.app} · <code>{v.sleutel}</code> · {v.apparaat}</span><a href={`?geheim=${v.id}`}>{tr('Ввести', 'Invoeren')}</a></li>)}</ul>
        </section>
      ) : null}

      <section className='mapps-kaart' aria-labelledby='mapps-apps'>
        <div className='mapps-rij'>
          <h2 id='mapps-apps'><Server aria-hidden='true' />{tr('Розгорнуті додатки', 'Uitgerolde apps')}</h2>
          <button type='button' className='secondary' onClick={() => void laadApps()} disabled={bezig === 'lijst'} data-apps-verversen=''><RefreshCw aria-hidden='true' />{bezig === 'lijst' ? tr('Оновлюю…', 'Vernieuwen…') : tr('Оновити', 'Vernieuwen')}</button>
        </div>
        {!metApps.length ? <p data-apps-leeg=''>{tr('Ще немає пристрою з увімкненими додатками. Як увімкнути — нижче.', 'Nog geen apparaat met apps aan. Hoe u dat aanzet staat hieronder.')}</p> : null}
        {metApps.map((a) => {
          const lijst = apps[a.id];
          return (
            <div key={a.id} className='mapps-apparaat' data-apparaat={a.name}>
              <h3>{a.name} <span className={`mapps-badge ${a.status === 'connected' ? 'aan' : 'uit'}`}>{a.status === 'connected' ? tr('онлайн', 'online') : tr('офлайн', 'offline')}</span></h3>
              {lijst && 'fout' in lijst ? <p className='mapps-melding mapps-fout'>{lijst.fout === 'NO_GRANT' || /NO_GRANT/.test(lijst.fout) ? tr('Цей пристрій ще не має дозволу «Читати». Дайте його на сторінці «Агенти» → пристрій.', 'Dit apparaat heeft nog geen toestemming «Lezen». Geef die op «Agenten» → apparaat.') : lijst.fout}</p> : null}
              {Array.isArray(lijst) && !lijst.length ? <p>{tr('Додатків ще немає. Попросіть ШІ: «Розгорни мені …».', 'Nog geen apps. Vraag de AI: «Rol voor mij … uit».')}</p> : null}
              {Array.isArray(lijst) && lijst.length ? (
                <ul className='mapps-apps'>
                  {lijst.map((app) => (
                    <li key={app.name} data-app={app.name}>
                      <div className='mapps-app-kop'>
                        <b>{app.name}</b>
                        <span className={`mapps-badge ${app.status === 'running' ? 'aan' : 'uit'}`} data-app-status={app.status}>{app.status === 'running' ? tr('працює', 'draait') : app.status === 'stopped' ? tr('зупинено', 'gestopt') : app.status === 'missing' ? tr('контейнера немає', 'geen container') : app.status}</span>
                        {app.version ? <span className='mapps-dim'>{tr('версія', 'versie')} {app.version}</span> : null}
                        {app.memory ? <span className='mapps-dim'>{app.memory}</span> : null}
                      </div>
                      {app.url ? (/^https:/.test(app.url)
                        ? <a href={app.url} target='_blank' rel='noreferrer'>{app.url}<ExternalLink aria-hidden='true' /></a>
                        : <span className='mapps-dim'>{tr('Лише на пристрої:', 'Alleen op het apparaat:')} <code>{app.url}</code></span>) : null}
                      <div className='mapps-knoppen'>
                        <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.logs', { lines: 100 }, ['Журнал', 'Logboek'])}><ScrollText aria-hidden='true' />{tr('Журнал', 'Logboek')}</button>
                        <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'restart' }, ['Перезапуск', 'Herstarten'])}><RefreshCw aria-hidden='true' />{tr('Перезапустити', 'Herstarten')}</button>
                        {app.status === 'running'
                          ? <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'stop' }, ['Зупинка', 'Stoppen'])}><Square aria-hidden='true' />{tr('Зупинити', 'Stoppen')}</button>
                          : <button type='button' className='secondary' disabled={!!bezig} onClick={() => void actie(a, app, 'apps.control', { action: 'start' }, ['Запуск', 'Starten'])}><Play aria-hidden='true' />{tr('Запустити', 'Starten')}</button>}
                        <button type='button' className='secondary' disabled={!!bezig || (app.versions ?? 0) < 2} onClick={() => void actie(a, app, 'apps.rollback', {}, ['Відкат до попередньої версії', 'Terug naar de vorige versie'])}><RotateCcw aria-hidden='true' />{tr('Відкотити', 'Terugdraaien')}</button>
                      </div>
                      {log?.app === app.name ? <pre className='mapps-log' tabIndex={0} aria-label={tr(`Журнал ${app.name}`, `Logboek ${app.name}`)} data-app-log=''>{log.tekst || tr('(порожньо)', '(leeg)')}</pre> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className='mapps-kaart' aria-labelledby='mapps-aanzetten'>
        <h2 id='mapps-aanzetten'><ShieldCheck aria-hidden='true' />{tr('Як увімкнути', 'Hoe zet u het aan')}</h2>
        <details open={!metApps.length}>
          <summary><Server aria-hidden='true' />{tr('На сервері «Мого простору» (Linux)', 'Op de server van «Mijn Ruimte» (Linux)')}</summary>
          <ol className='mapps-stappen'>
            <li>{tr('Як робочий користувач (наприклад beheer) один раз підготуйте додатки вбудованим інсталятором — він ставить Podman (без root для контейнерів), окремого користувача mr-apps без sudo і, за бажанням, Caddy:', 'Bereid als werkgebruiker (bijv. beheer) de apps één keer voor met de ingebouwde installer — die zet Podman (containers zonder root), een eigen gebruiker mr-apps zonder sudo en, als u wilt, Caddy:')}
              <pre><code>sudo /usr/local/sbin/mijn-ruimte-installeer apps-inrichten /srv/mijn-ruimte/current --caddy tunnel</code></pre>
              <span className='mapps-hint'>{tr('«tunnel» — HTTP лише на 127.0.0.1:8090 за вашим тунелем; «publiek» — Caddy сам на 80/443 з HTTPS; «geen» — без доменів, лише локально.', '"tunnel" — HTTP alleen op 127.0.0.1:8090 achter uw tunnel; "publiek" — Caddy zelf op 80/443 met HTTPS; "geen" — geen domeinen, alleen lokaal.')}</span></li>
            <li>{tr('На сторінці «Агенти» → «Пристрої» отримайте код підключення.', 'Haal op «Agenten» → «Apparaten» een koppelcode.')}</li>
            <li>{tr('Підключіть агента додатків:', 'Koppel de apps-agent:')}
              <pre><code>{`sudo /usr/local/sbin/mijn-ruimte-installeer apps-koppelen <КОД> --domein '{app}-app.${domein}'`}</code></pre>
              <span className='mapps-hint'>{tr(`З тунелем: у конфігурації тунелю перед останнім правилом додайте «*.${domein}» → http://127.0.0.1:8090 (відомі адреси сайту мають пріоритет). Тоді додаток «notes» відкривається на notes-app.${domein}.`, `Met een tunnel: zet in de tunnelconfiguratie vóór de laatste regel «*.${domein}» → http://127.0.0.1:8090 (de bekende adressen van de site gaan voor). Dan opent app «notes» op notes-app.${domein}.`)}</span></li>
            <li>{tr('На «Агенти» дайте новому пристрою дозволи («Читати», «Керувати контейнерами») і, якщо хочете, увімкніть інструменти app_* для ШІ. Вимкнути можна будь-коли.', 'Geef op «Agenten» het nieuwe apparaat toestemmingen («Lezen», «Containers beheren») en zet, als u wilt, de hulpmiddelen app_* aan voor de AI. Uitzetten kan altijd.')}</li>
          </ol>
        </details>
        <details>
          <summary><Laptop aria-hidden='true' />{tr('На будь-якому іншому ПК чи сервері з агентом', 'Op elke andere pc of server met de agent')}</summary>
          <ol className='mapps-stappen'>
            <li>{tr('Встановіть Podman (рекомендовано, працює без root) або Docker Desktop.', 'Installeer Podman (aanbevolen, werkt zonder root) of Docker Desktop.')}</li>
            <li>{tr('Поруч із agent.mjs (версія 0.5+) виконайте від свого звичайного користувача:', 'Voer naast agent.mjs (versie 0.5+) uit als uw gewone gebruiker:')}
              <pre><code>node agent.mjs apps-config --apps-root ./apps --runtime podman</code></pre>
              <span className='mapps-hint'>{tr('Домен і Caddy — необовʼязково: --domain "{app}.apps.example.com" --caddy-admin unix:/run/caddy/admin.sock. Без них додатки доступні лише на цьому ПК (127.0.0.1).', 'Domein en Caddy zijn optioneel: --domain "{app}.apps.example.com" --caddy-admin unix:/run/caddy/admin.sock. Zonder zijn apps alleen op deze pc bereikbaar (127.0.0.1).')}</span></li>
            <li>{tr('Перезапустіть агента (node agent.mjs run). Вимкнути: node agent.mjs apps-config --disable.', 'Herstart de agent (node agent.mjs run). Uitzetten: node agent.mjs apps-config --disable.')}</li>
          </ol>
          <p className='mapps-hint'>{tr('Група docker дорівнює правам root на хості — тому за замовчуванням Podman без root.', 'De docker-groep staat gelijk aan root op de host — daarom standaard Podman zonder root.')}</p>
        </details>
        <ul className='mapps-regels'>
          <li>{tr('Код ШІ працює лише в контейнері: без root, без додаткових прав (cap-drop ALL), з лімітом памʼяті, порт лише на 127.0.0.1.', 'AI-code draait alleen in een container: zonder root, zonder extra rechten (cap-drop ALL), met geheugenlimiet, poort alleen op 127.0.0.1.')}</li>
          <li>{tr('Перед кожним розгортанням — знімок; 5 останніх версій зберігаються. Якщо нова версія не стартує, повертається попередня.', 'Vóór elke uitrol een snapshot; de laatste 5 versies blijven bewaard. Start een nieuwe versie niet, dan komt de vorige terug.')}</li>
          <li>{tr('Що дозволено ШІ, вирішуєте ви: «Агенти» (дозволи пристрою, інструменти) і «Доступ ШІ» (підписана політика). Кожна дія — у журналі.', 'Wat de AI mag, beslist u: «Agenten» (toestemmingen per apparaat, hulpmiddelen) en «AI-toegang» (ondertekend beleid). Elke actie staat in het journaal.')}</li>
        </ul>
      </section>
    </div>
  );
}
