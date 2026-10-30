// «Підключити цей сервер»: de server waarop Mijn Ruimte draait als apparaat op de site — een agent als beheer (console:
// bestanden in gekozen mappen, alleen gekozen programma's, nooit sudo) en/of «Додатки» (containers als mr-apps).
// De site maakt de koppelcodes en het ENE commando; de eigenaar plakt het één keer in de console van de server. Dat ene
// moment is bewust: de site mag zichzelf nooit toegang tot haar eigen host geven. Daarna gaat alles via de site:
// toestemmingen (knoppen hieronder of «Агенти»), hulpmiddelen, journaal; de agent wordt bij elke release mee bijgewerkt.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from './platform/client';
import { sessionBody } from './agenten-gegevens';
import { foutTekst } from './agenten/fouten';
import './mcp-apps.css';

type Lang = 'uk' | 'nl';
type Apparaat = { id: string; name: string; online: boolean; apps: boolean };
const PROGRAMMAS = ['git', 'node', 'npm', 'python3', 'podman', 'journalctl'] as const;
const CODEACHTIG = new Set(['node', 'npm', 'python3']);
const PAD = /^\/[A-Za-z0-9._/-]{0,200}$/;
const GEBRUIKER = /^[a-z_][a-z0-9_-]{0,31}$/;
const DOMEIN = /^[a-z0-9-]{0,20}\{app\}[a-z0-9-]{0,20}(\.[a-z0-9-]{1,63})+$/;
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const INSTALLER = 'sudo /usr/local/sbin/mijn-ruimte-installeer';

export default function ServerKoppelen({ lang, apparaten, onGekoppeld }: { lang: Lang; apparaten: Apparaat[]; onGekoppeld: () => void }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const domein = useMemo(() => location.hostname.replace(/^mcp\./, ''), []);
  const [console_, setConsole] = useState(true);
  const [gebruiker, setGebruiker] = useState('beheer');
  const [map, setMap] = useState('/home/beheer');
  const [release, setRelease] = useState(true);
  const [programmas, setProgrammas] = useState<string[]>(['git']);
  const [apps, setApps] = useState(true);
  const [caddy, setCaddy] = useState<'tunnel' | 'publiek' | 'geen'>('tunnel');
  const [sjabloon, setSjabloon] = useState(`{app}-app.${domein}`);
  const [codes, setCodes] = useState<{ console?: string; apps?: string; verloopt: number } | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [nu, setNu] = useState(Date.now());
  const bekend = useRef<Set<string> | null>(null);
  const herlaad = useRef(onGekoppeld);
  herlaad.current = onGekoppeld;
  const [nieuw, setNieuw] = useState<Apparaat[]>([]);
  const [toestemming, setToestemming] = useState('');

  const ongeldig = (console_ && (!GEBRUIKER.test(gebruiker) || gebruiker === 'root' || !PAD.test(map) || map === '/' || map.startsWith('/root') || map.startsWith('/etc')))
    || (apps && caddy !== 'geen' && !DOMEIN.test(sjabloon)) || (!console_ && !apps);

  const commando = useMemo(() => {
    if (!codes) return '';
    const delen: string[] = [];
    if (console_ && codes.console) {
      const args = [`--gebruiker ${gebruiker}`, `--root ${q(map)}`, ...(release ? [`--readonly-root /srv/mijn-ruimte/current`] : []), ...(programmas.length ? [`--allow ${programmas.join(',')}`] : [])];
      delen.push(`${INSTALLER} beheer-koppelen ${codes.console} ${args.join(' ')}`);
    }
    if (apps && codes.apps) {
      delen.push(`${INSTALLER} apps-inrichten /srv/mijn-ruimte/current --caddy ${caddy}`);
      delen.push(`${INSTALLER} apps-koppelen ${codes.apps}${caddy !== 'geen' ? ` --domein ${q(sjabloon)}` : ''}`);
    }
    return delen.join(' && \\\n  ');
  }, [codes, console_, apps, gebruiker, map, release, programmas, caddy, sjabloon]);

  async function maakCodes() {
    setBezig(true); setFout(''); setNieuw([]); setGekopieerd(false);
    try {
      // De server zelf is een apparaat van de TECHNISCHE ruimte (0042): alleen een technische AI-verbinding ziet en bestuurt het.
      const een = async () => (await api.post('/api/owner/agents/pairing-code', { ...sessionBody(), ruimte: 'technisch' })).data as { code: string; expiresAt: number };
      const c1 = console_ ? await een() : null;
      const c2 = apps ? await een() : null;
      bekend.current = new Set(apparaten.map((a) => a.id));
      setCodes({ console: c1?.code, apps: c2?.code, verloopt: Math.min(c1?.expiresAt ?? Infinity, c2?.expiresAt ?? Infinity) });
    } catch (e) { setFout(foutTekst(e, tr, ['Не вдалося створити код', 'Code maken mislukt'])); }
    setBezig(false);
  }

  // Wachten op de koppeling: elke 5 s laat de pagina de apparaten opnieuw ophalen; een nieuw apparaat = gelukt.
  useEffect(() => {
    if (!codes) return;
    const t = window.setInterval(() => herlaad.current(), 5000);
    const k = window.setInterval(() => setNu(Date.now()), 1000);
    return () => { window.clearInterval(t); window.clearInterval(k); };
  }, [codes]);
  useEffect(() => {
    if (!codes || !bekend.current) return;
    const extra = apparaten.filter((a) => !bekend.current!.has(a.id));
    if (extra.length) setNieuw(extra);
  }, [apparaten, codes]);

  async function kopieer() {
    try { await navigator.clipboard.writeText(commando.replace(/ && \\\n {2}/g, ' && ')); setGekopieerd(true); } catch { setGekopieerd(false); }
  }
  async function geef(agentId: string, caps: string[], label: string) {
    setToestemming(label);
    try {
      await api.post('/api/owner/ai/grants/add', { ...sessionBody(), grants: caps.map((capability) => ({ agentId, capability, minutes: 30 * 24 * 60 })) });
      setFout(''); setToestemming(`ok:${label}`);
    } catch (e) { setFout(foutTekst(e, tr, ['Не вдалося дати дозвіл', 'Toestemming geven mislukt'])); setToestemming(''); }
  }

  const resterend = codes ? Math.max(0, Math.round((codes.verloopt - nu) / 1000)) : 0;
  const toggle = (p: string) => setProgrammas((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  return (
    <section className='mapps-kaart mapps-server' aria-labelledby='mapps-server' data-server-koppelen=''>
      <h2 id='mapps-server'><Server aria-hidden='true' />{tr('Підключити цей сервер', 'Deze server koppelen')}</h2>
      <p>{tr('Сервер, на якому працює «Мій простір», стане пристроєм на сайті. Потрібна одна команда в консолі сервера — один раз: сайт сам собі доступу до свого сервера не дає. Далі все — тут і на «Агенти»: дозволи, інструменти, журнал. Агент оновлюється разом із кожним випуском.', 'De server waarop «Mijn Ruimte» draait wordt een apparaat op de site. Er is één commando in de console van de server nodig — één keer: de site geeft zichzelf geen toegang tot haar eigen server. Daarna gaat alles hier en op «Agenten»: toestemmingen, hulpmiddelen, journaal. De agent wordt met elke release bijgewerkt.')}</p>

      <fieldset className='mapps-keuze'>
        <legend>{tr('Що підключити', 'Wat koppelen')}</legend>
        <label className='mapps-vink'><input type='checkbox' checked={console_} onChange={(e) => setConsole(e.target.checked)} data-keuze='console' />
          <span><b>{tr('Консоль сервера', 'Console van de server')}</b> — {tr('файли у вибраних теках і лише вибрані програми, від імені звичайного користувача. Без sudo: агент запущено з NoNewPrivileges.', 'bestanden in gekozen mappen en alleen gekozen programma\'s, als gewone gebruiker. Zonder sudo: de agent draait met NoNewPrivileges.')}</span></label>
        {console_ ? (
          <div className='mapps-sub'>
            <label>{tr('Користувач', 'Gebruiker')} <input value={gebruiker} onChange={(e) => { setGebruiker(e.target.value.trim()); if (map === `/home/${gebruiker}`) setMap(`/home/${e.target.value.trim()}`); }} spellCheck={false} aria-invalid={!GEBRUIKER.test(gebruiker) || gebruiker === 'root'} data-veld='gebruiker' /></label>
            <label>{tr('Тека для читання й запису', 'Map om te lezen en te schrijven')} <input value={map} onChange={(e) => setMap(e.target.value.trim())} spellCheck={false} aria-invalid={!PAD.test(map)} data-veld='map' /></label>
            <label className='mapps-vink'><input type='checkbox' checked={release} onChange={(e) => setRelease(e.target.checked)} /><span>{tr('Код сайту (/srv/mijn-ruimte/current) — лише читання', 'Code van de site (/srv/mijn-ruimte/current) — alleen lezen')}</span></label>
            <div role='group' aria-label={tr('Дозволені програми', 'Toegestane programma\'s')} className='mapps-chips'>
              <span>{tr('Програми:', 'Programma\'s:')}</span>
              {PROGRAMMAS.map((p) => <button key={p} type='button' className={programmas.includes(p) ? 'is-aan' : ''} aria-pressed={programmas.includes(p)} onClick={() => toggle(p)} data-programma={p}>{p}</button>)}
            </div>
            {programmas.some((p) => CODEACHTIG.has(p)) ? <p className='mapps-waarschuwing'><TriangleAlert aria-hidden='true' />{tr('node, npm і python3 можуть виконати будь-який код від імені цього користувача (але без sudo). Вмикайте, лише якщо потрібно; кожен запуск однаково чекає вашого «Дозволити».', 'node, npm en python3 kunnen elke code uitvoeren als deze gebruiker (maar zonder sudo). Zet ze alleen aan als het nodig is; elke uitvoering wacht nog steeds op uw «Toestaan».')}</p> : null}
            <p className='mapps-hint'>{tr('Секретні місця (.ssh, ключі, .env, uitrol-sleutel…) агент не відкриє ніколи, навіть усередині теки.', 'Geheime plekken (.ssh, sleutels, .env, uitrol-sleutel…) opent de agent nooit, ook niet binnen de map.')}</p>
          </div>
        ) : null}
        <label className='mapps-vink'><input type='checkbox' checked={apps} onChange={(e) => setApps(e.target.checked)} data-keuze='apps' />
          <span><b>{tr('Додатки', 'Apps')}</b> — {tr('контейнери Podman без root, окремий користувач mr-apps без sudo; домени через Caddy.', 'Podman-containers zonder root, eigen gebruiker mr-apps zonder sudo; domeinen via Caddy.')}</span></label>
        {apps ? (
          <div className='mapps-sub'>
            <label>{tr('Домени', 'Domeinen')} <select value={caddy} onChange={(e) => setCaddy(e.target.value as typeof caddy)} data-veld='caddy'>
              <option value='tunnel'>{tr('через тунель (HTTP лише на 127.0.0.1:8090)', 'via de tunnel (HTTP alleen op 127.0.0.1:8090)')}</option>
              <option value='publiek'>{tr('Caddy сам на 80/443 з HTTPS', 'Caddy zelf op 80/443 met HTTPS')}</option>
              <option value='geen'>{tr('без доменів, лише локально', 'geen domeinen, alleen lokaal')}</option>
            </select></label>
            {caddy !== 'geen' ? <label>{tr('Шаблон адреси', 'Adressjabloon')} <input value={sjabloon} onChange={(e) => setSjabloon(e.target.value.trim())} spellCheck={false} aria-invalid={!DOMEIN.test(sjabloon)} data-veld='sjabloon' /></label> : null}
          </div>
        ) : null}
      </fieldset>

      <div className='mapps-knoppen'>
        <button type='button' disabled={bezig || ongeldig} onClick={() => void maakCodes()} data-maak-codes=''><ShieldCheck aria-hidden='true' />{codes ? tr('Нові коди', 'Nieuwe codes') : tr('Створити код і команду', 'Code en commando maken')}</button>
      </div>
      {fout ? <p className='mapps-melding mapps-fout' role='alert'>{fout}</p> : null}

      {codes ? (
        <div className='mapps-commando' data-commando=''>
          <p>{tr('Увійдіть на сервер як beheer і вставте одну команду (коди діють ще ', 'Log op de server in als beheer en plak één commando (de codes gelden nog ')}<b data-resterend=''>{Math.floor(resterend / 60)}:{String(resterend % 60).padStart(2, '0')}</b>):</p>
          <pre><code>{commando}</code></pre>
          <div className='mapps-knoppen'>
            <button type='button' className='secondary' onClick={() => void kopieer()} data-kopieer=''>{gekopieerd ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати команду', 'Commando kopiëren')}</button>
          </div>
          {!nieuw.length ? <p className='mapps-dim' role='status'>{resterend > 0 ? tr('Чекаю на підключення…', 'Wachten op de koppeling…') : tr('Коди прострочені — створіть нові.', 'De codes zijn verlopen — maak nieuwe.')}</p> : null}
          {nieuw.map((a) => (
            <div key={a.id} className='mapps-melding mapps-ok' data-gekoppeld={a.name} role='status'>
              <span>{tr(`Підключено: «${a.name}».`, `Gekoppeld: «${a.name}».`)} {tr('Тепер вирішіть, що дозволено (30 днів; змінити чи відкликати — «Агенти»):', 'Beslis nu wat mag (30 dagen; wijzigen of intrekken: «Agenten»):')}</span>
              <div className='mapps-knoppen'>
                <button type='button' disabled={!!toestemming && !toestemming.startsWith('ok:')} onClick={() => void geef(a.id, ['machine.read'], 'lezen')}>{toestemming === 'ok:lezen' ? <Check aria-hidden='true' /> : null}{tr('Читати', 'Lezen')}</button>
                {!a.apps ? <button type='button' disabled={!!toestemming && !toestemming.startsWith('ok:')} onClick={() => void geef(a.id, ['machine.read', 'machine.write'], 'schrijven')}>{toestemming === 'ok:schrijven' ? <Check aria-hidden='true' /> : null}{tr('Читати й записувати', 'Lezen en schrijven')}</button> : null}
                {!a.apps ? <button type='button' disabled={!!toestemming && !toestemming.startsWith('ok:')} onClick={() => void geef(a.id, ['machine.exec'], 'uitvoeren')}>{toestemming === 'ok:uitvoeren' ? <Check aria-hidden='true' /> : null}{tr('Виконувати дозволені програми', 'Toegestane programma\'s uitvoeren')}</button> : null}
                {a.apps ? <button type='button' disabled={!!toestemming && !toestemming.startsWith('ok:')} onClick={() => void geef(a.id, ['machine.read', 'machine.docker'], 'apps')}>{toestemming === 'ok:apps' ? <Check aria-hidden='true' /> : null}{tr('Бачити й керувати додатками', 'Apps zien en beheren')}</button> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
