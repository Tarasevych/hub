// «Підключити ШІ» op mcp.*/agents#tokens: kies de AI, het doel (deur van de server of de connector /mcp), hoe lang de toegang geldt,
// en daarna één van twee wegen:
//   • «Підключити автоматично (в один клік)» — adres plakken in de AI-klant (die doet OAuth/PKCE en opent het venster «Дозволити»),
//     of hier meteen een Bearer-token halen met PKCE in de browser (src/agenten/een-klik.ts);
//   • «Підключити вручну (прямий токен)» — agenttoken tvh_… (30 dagen) voor de Authorization-kop van de klant (zoals vroeger).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Link2, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { Logo, type Tr } from '../mcp-ui';
import { DUREN, KLANTEN, duur as duurVan, type DuurId, type KlantId } from '../../shared/ai-verbinding';
import { aiLogo } from './data';
import { adressen, EenKlikFout, verbindInEenKlik, type Doel } from './een-klik';
import { Knop, Melding, Segment, useActies } from './ui';

type Resultaat = { soort: 'oauth' | 'token'; token: string; refresh?: string; verloopt: number | null; endpoint: string; naam: string };

const WAAR: Partial<Record<KlantId, [string, string]>> = {
  claude: ['Claude → Customize → Connectors → Add custom connector → вставте адресу, «Register automatically».', 'Claude → Customize → Connectors → Add custom connector → adres plakken, «Register automatically».'],
  cursor: ['Cursor → Settings → MCP → Add new MCP server (тип HTTP) → вставте адресу. Cursor сам відкриє сайт.', 'Cursor → Settings → MCP → Add new MCP server (type HTTP) → adres plakken. Cursor opent zelf de site.'],
  copilot: ['VS Code → команда «MCP: Add Server» → HTTP → вставте адресу.', 'VS Code → opdracht «MCP: Add Server» → HTTP → adres plakken.'],
};

function Kopieer({ tekst, tr, data }: { tekst: string; tr: Tr; data?: string }) {
  const [ok, setOk] = useState(false);
  return <Knop data={data} icoon={ok ? <Check /> : <Copy />} onClick={() => { void navigator.clipboard?.writeText(tekst).then(() => { setOk(true); window.setTimeout(() => setOk(false), 2000); }).catch(() => undefined); }}>{ok ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати', 'Kopiëren')}</Knop>;
}

export default function AiVerbinden({ tr, magTokens, naActie }: { tr: Tr; magTokens: boolean; naActie: () => Promise<void> }) {
  const acties = useActies(tr);
  const [klant, setKlant] = useState<KlantId>('grok');
  const [duren, setDuren] = useState<Record<string, DuurId> | null>(null);
  const [eigenaar, setEigenaar] = useState(false);
  const [doelSoort, setDoelSoort] = useState<'deur' | 'connector'>('deur');
  const [methode, setMethode] = useState<'auto' | 'handmatig' | ''>('');
  const [res, setRes] = useState<Resultaat | null>(null);

  const k = KLANTEN.find((x) => x.id === klant)!;
  const deurMogelijk = eigenaar && !!k.deur;
  const doel: Doel = deurMogelijk && doelSoort === 'deur' ? { soort: 'deur', deur: k.deur! } : { soort: 'connector' };
  const adres = useMemo(() => adressen(doel).endpoint, [doel.soort, doel.soort === 'deur' ? doel.deur : '']); // eslint-disable-line react-hooks/exhaustive-deps
  const gekozenDuur = duren?.[klant] ?? '1u';

  const laad = useCallback(async () => {
    try { const r = await api.post('/api/owner/mcp-connector/duren', sessionBody()); setDuren(r.data?.duren ?? {}); setEigenaar(r.data?.deuren === true); }
    catch { setDuren({}); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  // Grok standaard naar zijn deur, de rest naar de connector (alles van de gebruiker: apparaten, mail, Drive).
  useEffect(() => { setDoelSoort(klant === 'grok' ? 'deur' : 'connector'); setRes(null); }, [klant]);

  const zetDuur = (d: DuurId) => acties.voerUit('duur', async () => {
    const r = await api.post('/api/owner/mcp-connector/duren/zet', { ...sessionBody(), klant, duur: d });
    setDuren(r.data?.duren ?? { ...(duren ?? {}), [klant]: d });
    return tr(`Термін доступу для ${k.naam}: ${duurVan(d).uk}. Діє для нових підключень.`, `Toegangsduur voor ${k.naam}: ${duurVan(d).nl}. Geldt voor nieuwe koppelingen.`);
  }, ['Не вдалося зберегти термін', 'Duur opslaan mislukt']);

  const eenKlik = () => {
    // Popup synchroon in de klik openen (anders blokkeert de browser hem); daarna pas registreren en doorsturen.
    const venster = window.open('about:blank', 'mr-oauth', 'popup,width=620,height=760');
    void acties.voerUit('auto', async () => {
      try {
        const t = await verbindInEenKlik(doel, k.naam, venster);
        setRes({ soort: 'oauth', token: t.access_token, refresh: t.refresh_token, verloopt: t.expires_in ? Date.now() + t.expires_in * 1000 : null, endpoint: t.endpoint, naam: k.naam });
        await naActie();
        return tr(`${k.naam} підключено: токен отримано через підтвердження на сайті. Скопіюйте його зараз — потім він не показується.`, `${k.naam} gekoppeld: token ontvangen na bevestiging op de site. Kopieer het nu — daarna wordt het niet meer getoond.`);
      } catch (e) {
        const code = e instanceof EenKlikFout ? e.code : String((e as Error)?.message || '');
        if (code === 'GESLOTEN') throw new Error(tr('Вікно підтвердження закрито — доступ не надано.', 'Bevestigingsvenster gesloten — geen toegang gegeven.'));
        if (code === 'GEWEIGERD') throw new Error(tr('Ви відхилили доступ — токен не випущено.', 'U hebt de toegang geweigerd — geen token uitgegeven.'));
        if (code === 'POPUP_GEBLOKKEERD') throw new Error(tr('Браузер заблокував вікно підтвердження. Дозвольте спливні вікна для цього сайту й натисніть ще раз.', 'De browser blokkeerde het bevestigingsvenster. Sta pop-ups toe voor deze site en klik opnieuw.'));
        throw e;
      }
    }, ['Не вдалося підключити', 'Koppelen mislukt']);
  };

  const handmatig = () => acties.voerUit('handmatig', async () => {
    const r = await api.post('/api/mcp/tokens', { ...sessionBody(), name: k.id === 'overig' ? 'agent' : k.id });
    const tok = String(r.data?.token?.token || '');
    setRes({ soort: 'token', token: tok, verloopt: Date.now() + 30 * 86_400_000, endpoint: adres, naam: k.naam });
    await naActie();
    return tr(`Токен для ${k.naam} випущено: діє 30 днів. Скопіюйте його зараз — потім буде видно лише префікс.`, `Token voor ${k.naam} uitgegeven: 30 dagen geldig. Kopieer het nu — daarna is alleen het voorvoegsel zichtbaar.`);
  }, ['Не вдалося випустити токен', 'Token uitgeven mislukt']);

  const config = res ? JSON.stringify({ mcpServers: { 'mijn-ruimte': { url: res.endpoint, headers: { Authorization: `Bearer ${res.token}` } } } }, null, 2) : '';
  const curl = res ? `curl -s -X POST ${res.endpoint} -H "Authorization: Bearer ${res.token}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` : '';
  const kort = res?.soort === 'oauth' && res.verloopt !== null && res.verloopt - Date.now() < 2 * 86_400_000;

  return (
    <section className='ag-kaart ag-verbind' data-ai-verbinden='1' aria-labelledby='ag-verbind-titel'>
      <div className='ag-kaart-kop'><h3 id='ag-verbind-titel'>{tr('Підключити ШІ', 'AI koppelen')}</h3></div>
      <div className='ag-verbind-klanten' role='radiogroup' aria-label={tr('Який ШІ', 'Welke AI')}>
        {KLANTEN.map((x) => (
          <button key={x.id} type='button' role='radio' aria-checked={klant === x.id} className='ag-verbind-klant' data-klant={x.id} onClick={() => setKlant(x.id)}>
            <Logo kind={aiLogo(x.id === 'overig' ? 'x' : x.naam)} size={22} label='' /><span>{x.id === 'overig' ? tr('Інший', 'Andere') : x.naam}</span>
          </button>
        ))}
      </div>

      <div className='ag-verbind-rij'>
        {deurMogelijk ? (
          <Segment label={tr('Куди підключити', 'Waarheen koppelen')} waarde={doelSoort} onKies={(d) => { setDoelSoort(d); setRes(null); }} opties={[
            { id: 'deur', label: tr(`Двері сервера /${k.deur}`, `Serverdeur /${k.deur}`) },
            { id: 'connector', label: tr('Конектор /mcp (пристрої, пошта, Drive)', 'Connector /mcp (apparaten, mail, Drive)') },
          ]} />
        ) : null}
        <label className='ag-veld'>
          <span>{tr(`Термін доступу для ${k.naam}`, `Toegangsduur voor ${k.naam}`)}</span>
          <select value={gekozenDuur} disabled={!duren || acties.bezig === 'duur'} onChange={(e) => void zetDuur(e.target.value as DuurId)} data-duur-keuze={klant}>
            {DUREN.map((d) => <option key={d.id} value={d.id}>{tr(d.uk, d.nl)}</option>)}
          </select>
        </label>
      </div>
      {duurVan(gekozenDuur).lang ? <p className='ag-verbind-let' role='note'><ShieldCheck size={14} aria-hidden='true' /> {tr('Довгий доступ: якщо токен потрапить до чужих рук, він діятиме довго. Відкликати можна будь-коли нижче.', 'Lange toegang: komt het token in verkeerde handen, dan werkt het lang. Intrekken kan altijd hieronder.')}</p> : null}

      <div className='ag-verbind-wegen' role='group' aria-label={tr('Спосіб підключення', 'Manier van koppelen')}>
        <button type='button' className={`ag-verbind-weg${methode === 'auto' ? ' is-aan' : ''}`} aria-pressed={methode === 'auto'} onClick={() => { setMethode('auto'); setRes(null); }} data-methode='auto'>
          <Zap aria-hidden='true' /><b>{tr('Підключити автоматично (в один клік)', 'Automatisch koppelen (één klik)')}</b>
          <small>{tr('Клієнт відкриває сайт, ви натискаєте «Дозволити» — токен він отримує сам.', 'De client opent de site, u klikt «Toestaan» — het token krijgt hij zelf.')}</small>
        </button>
        <button type='button' className={`ag-verbind-weg${methode === 'handmatig' ? ' is-aan' : ''}`} aria-pressed={methode === 'handmatig'} onClick={() => { setMethode('handmatig'); setRes(null); }} data-methode='handmatig'>
          <KeyRound aria-hidden='true' /><b>{tr('Підключити вручну (прямий токен)', 'Handmatig koppelen (direct token)')}</b>
          <small>{tr('Для клієнтів без входу через браузер: Authorization: Bearer … у конфігурації.', 'Voor clients zonder aanmelden via de browser: Authorization: Bearer … in de configuratie.')}</small>
        </button>
      </div>

      {methode === 'auto' ? (
        <div className='ag-verbind-paneel' data-paneel='auto'>
          <ol className='ag-verbind-stappen'>
            <li>
              <span>{tr(`Адреса для ${k.naam}:`, `Adres voor ${k.naam}:`)}</span>
              <span className='ag-verbind-adres'><code data-adres='1'>{adres}</code><Kopieer tekst={adres} tr={tr} data='adres-kopieer' /></span>
              <small className='hub-meta'>{WAAR[klant] ? tr(...WAAR[klant]!) : tr(`У ${k.naam}: додайте MCP-сервер (віддалений / custom connector) з цією адресою й увімкніть вхід OAuth.`, `In ${k.naam}: voeg een MCP-server toe (remote / custom connector) met dit adres en zet aanmelden met OAuth aan.`)}</small>
            </li>
            <li>{tr('Клієнт відкриє цей сайт у вікні «Дозволити». Ви вже ввійшли — натисніть «Дозволити» й підтвердьте вхід.', 'De client opent deze site in het venster «Toestaan». U bent al aangemeld — klik «Toestaan» en bevestig de aanmelding.')}</li>
            <li>{tr(`Готово: доступ діє ${duurVan(gekozenDuur).uk.toLowerCase()} і з'явиться нижче в списку.`, `Klaar: de toegang geldt ${duurVan(gekozenDuur).nl.toLowerCase()} en verschijnt hieronder in de lijst.`)}</li>
          </ol>
          <div className='ag-knoppen'>
            <Knop toon='primary' icoon={<Link2 />} bezig={acties.bezig === 'auto'} onClick={eenKlik} data='een-klik'>{tr('Отримати токен зараз (вікно підтвердження)', 'Nu een token ophalen (bevestigingsvenster)')}</Knop>
            <small className='hub-meta'>{tr('Для клієнтів, що не вміють самі відкривати вхід: сайт сам пройде OAuth із PKCE і покаже токен.', 'Voor clients die zelf geen aanmelding openen: de site doet OAuth met PKCE en toont het token.')}</small>
          </div>
        </div>
      ) : null}

      {methode === 'handmatig' ? (
        <div className='ag-verbind-paneel' data-paneel='handmatig'>
          <p>{tr(`Сайт випустить токен для ${k.naam} (діє 30 днів). Вставте його в конфігурацію клієнта як заголовок Authorization: Bearer …, адреса: `, `De site geeft een token voor ${k.naam} uit (30 dagen geldig). Zet het in de configuratie van de client als kop Authorization: Bearer …, adres: `)}<code>{adres}</code></p>
          {doel.soort === 'deur' ? <small className='hub-meta'>{tr('Двері сервера приймають лише токени власника сервера.', 'De serverdeur accepteert alleen tokens van de eigenaar van de server.')}</small> : null}
          <div className='ag-knoppen'>
            <Knop toon='primary' icoon={<KeyRound />} bezig={acties.bezig === 'handmatig'} disabled={!magTokens} onClick={() => void handmatig()} data='token-nieuw'>{tr('Випустити токен', 'Token uitgeven')}</Knop>
            {!magTokens ? <small className='hub-meta'>{tr('Випуск токенів вимкнено у файлі дозволів сервера.', 'Tokens uitgeven staat uit in het rechtenbestand van de server.')}</small> : null}
          </div>
        </div>
      ) : null}

      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />

      {res ? (
        <div className='ag-kaart ag-vers' data-vers-token='1'>
          <b>{tr(`Токен для ${res.naam} — видно лише зараз`, `Token voor ${res.naam} — alleen nu zichtbaar`)}</b>
          <span className='ag-verbind-adres'><code className='hub-code' data-token='1'>{res.token}</code><Kopieer tekst={res.token} tr={tr} data='token-kopieer' /></span>
          <small className='hub-meta'>{res.verloopt && res.verloopt - Date.now() < 50 * 365 * 86_400_000 ? tr(`Діє до ${new Date(res.verloopt).toLocaleString()}`, `Geldig tot ${new Date(res.verloopt).toLocaleString()}`) : tr('Діє до відкликання', 'Geldig tot intrekken')}{res.refresh ? tr(' · клієнт із OAuth поновлює його сам (refresh-токен не показуємо)', ' · een client met OAuth vernieuwt het zelf (het refresh-token tonen we niet)') : ''}</small>
          {kort ? <p className='ag-verbind-let' role='note'>{tr('Цей токен короткий. Для статичної конфігурації оберіть довший термін вище або вставте адресу в клієнт — він сам поновлюватиме доступ.', 'Dit token is kort geldig. Kies voor een vaste configuratie hierboven een langere duur, of plak het adres in de client — die vernieuwt zelf.')}</p> : null}
          <details className='ag-verbind-snippet'><summary>{tr('Конфігурація (Cursor / mcp.json та інші)', 'Configuratie (Cursor / mcp.json en andere)')}</summary><pre><code>{config}</code></pre><Kopieer tekst={config} tr={tr} data='config-kopieer' /></details>
          <details className='ag-verbind-snippet'><summary>{tr('Перевірити з терміналу (curl)', 'Testen vanuit de terminal (curl)')}</summary><pre><code>{curl}</code></pre><Kopieer tekst={curl} tr={tr} /></details>
          <div className='ag-knoppen'><Knop onClick={() => setRes(null)}>{tr('Я зберіг токен', 'Ik heb het token bewaard')}</Knop></div>
        </div>
      ) : null}
    </section>
  );
}
