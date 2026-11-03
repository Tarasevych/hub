// «Пристрої» (hub): pc-agents en browserextensies als GitHub-rijen. Installeren/koppelen van de extensie staat sinds 0.6 op het eigen
// tabblad «Розширення браузера» (#extensie); de knop hier en het oude adres #apparaten/extensie leiden daarheen. Dicht: naam, status, één regel; open: alle technische
// gegevens, wat zonder klik mag, de toestemmingen (presets, tabel, losse toestemming) en voor een browser de extensiestatus.
import { useEffect, useState } from 'react';
import { ArrowUpCircle, Download, Globe, Monitor, Plus, Settings2, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody, type Agent, type LastCommand, type Pending } from '../agenten-gegevens';
import { agentLogo, Logo, StatusDot, type Tr } from '../mcp-ui';
import { DeviceDetail, PairCard, PendingList } from '../ApparatenWeergave';
import BrowserExtensionPanel from '../BrowserExtensiePaneel';
import AiToestemmingen from '../AiToestemmingen';
import type { Losgekoppeld, Overzicht } from './gegevens';
import { Badge, datum, exact, GevaarKnop, Groep, Knop, Melding, Rij, Tech, Tijd, relatief, useActies } from './ui';
import './agenten-tabs-2.css';

/** 0.4.10 < 0.5.1: numeriek per deel. Onbekend → geen melding. */
export function ouder(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = a.split('.').map((n) => parseInt(n, 10) || 0), y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); }
  return false;
}
type Nieuwste = { version?: string; file?: string; crx?: { file?: string } | null; storeUrl?: string; agent?: { file: string; version?: string | null; sha256: string } | null };
/** Een agent die op de server zelf draait (beheer-koppelen / apps-koppelen) wordt met elke release automatisch bijgewerkt. */
const opServer = (a: Agent) => /^linux/.test(a.platform ?? '') && ((a.capabilities as { apps?: unknown } | null)?.apps === true || /\(.+\)$/.test(a.name));

const REDEN: Record<string, [string, string]> = { user: ['Відключено', 'Losgekoppeld'], repaired: ['Перевстановлено', 'Opnieuw geïnstalleerd'], blocked: ['Заблоковано', 'Geblokkeerd'] };

export default function TabApparaten({ tr, agents, pending, last, overzicht, naActie, reload, item, kies, versie, naarExtensie }: {
  tr: Tr; agents: Agent[]; pending: Pending[]; last: Record<string, LastCommand>; overzicht: Overzicht | null; naActie: () => Promise<void>; reload: () => Promise<void>;
  item: string; kies: (id: string) => void; versie: number; naarExtensie?: () => void;
}) {
  // Oud item #apparaten/extensie (0.4/0.5) → tabblad «Розширення браузера».
  useEffect(() => { if (item === 'extensie' && naarExtensie) naarExtensie(); }, [item, naarExtensie]);
  const acties = useActies(tr);
  const [sorteer, setSorteer] = useState<'stand' | 'naam' | 'datum'>('stand');
  const online = agents.filter((a) => a.status === 'connected').length;
  const lijst = [...agents].sort((a, b) => sorteer === 'naam' ? a.name.localeCompare(b.name) : sorteer === 'datum' ? b.createdAt - a.createdAt : (a.status === b.status ? (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) : a.status === 'connected' ? -1 : 1));
  const weg = overzicht?.losgekoppeld ?? [];
  const [nieuwste, setNieuwste] = useState<Nieuwste | null>(null);
  useEffect(() => { fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => setNieuwste(j as Nieuwste | null)).catch(() => setNieuwste(null)); }, []);
  const doelVersie = (a: Agent) => (a.platform === 'browser' ? nieuwste?.version : nieuwste?.agent?.version) ?? null;
  const updateKaart = (a: Agent) => {
    const doel = doelVersie(a);
    if (!ouder(a.version, doel)) return null;
    const browser = a.platform === 'browser';
    return (
      <div className='ag-kaart ag-waarschuwing' data-update={a.id}>
        <h4><ArrowUpCircle aria-hidden='true' /> {tr(`Доступне оновлення: ${a.version} → ${doel}`, `Update beschikbaar: ${a.version} → ${doel}`)}</h4>
        {browser ? (
          <p>{tr('Встановлене з магазину або CRX розширення Chrome оновлює сам (до кількох годин; швидше: chrome://extensions → «Оновити»). Встановлене через «Завантажити розпаковане» — завантажте новий архів, розпакуйте в ту саму теку й натисніть ↻ на картці розширення.', 'Een extensie uit de winkel of als CRX werkt Chrome zelf bij (tot enkele uren; sneller: chrome://extensions → «Bijwerken»). Via «Uitgepakte extensie laden»: download het nieuwe archief, pak uit in dezelfde map en klik ↻ op de kaart van de extensie.')}{' '}
            {nieuwste?.file ? <a href={`/downloads/${nieuwste.file}`} download><Download aria-hidden='true' /> {nieuwste.file}</a> : null}</p>
        ) : opServer(a) ? (
          <p>{tr('Агент на цьому сервері оновлюється автоматично з кожним випуском сайту — нічого робити не треба.', 'De agent op deze server wordt met elke release van de site automatisch bijgewerkt — u hoeft niets te doen.')}</p>
        ) : (
          <>
            <p>{tr('Завантажте новий agent.mjs, замініть ним старий файл (та сама тека, де Mijn-Ruimte-agent.cmd) і перезапустіть агента: закрийте його вікно й запустіть знову. Підключення, теки й дозволи зберігаються.', 'Download de nieuwe agent.mjs, vervang het oude bestand (dezelfde map als Mijn-Ruimte-agent.cmd) en herstart de agent: sluit het venster en start hem opnieuw. Koppeling, mappen en toestemmingen blijven.')}</p>
            <p><a href='/downloads/agent.mjs' download data-agent-download=''><Download aria-hidden='true' /> agent.mjs {doel}</a>{nieuwste?.agent?.sha256 ? <> · SHA-256 <code>{nieuwste.agent.sha256}</code></> : null}</p>
          </>
        )}
      </div>
    );
  };

  const loskoppelen = (a: Agent) => acties.voerUit(`dev:${a.id}`, async () => {
    const r = await api.post(`/api/owner/agents/${a.id}/revoke`, sessionBody());
    if (!r.data?.ok) throw Object.assign(new Error('AGENT_NOT_FOUND'), { status: 404 });
    if (item === `dev:${a.id}`) kies('');
    await naActie();
    return a.platform === 'browser'
      ? tr(`Браузер «${a.name}» відключено о ${exact(Date.now())}. Токен розширення більше не діє, розширення покаже «Не підключено»; рядок перенесено до «Відключені».`, `Browser «${a.name}» losgekoppeld om ${exact(Date.now())}. Het token van de extensie werkt niet meer en de extensie toont "Niet verbonden"; de rij staat nu bij "Losgekoppeld".`)
      : tr(`Пристрій «${a.name}» відключено о ${exact(Date.now())}. Його токен більше не діє, ШІ не бачить цей пристрій; рядок перенесено до «Відключені».`, `Apparaat «${a.name}» losgekoppeld om ${exact(Date.now())}. Het token werkt niet meer en de AI ziet dit apparaat niet; de rij staat nu bij "Losgekoppeld".`);
  }, ['Не вдалося відключити', 'Loskoppelen mislukt']);

  // Audit fase 2: de groep «Відключені й перевстановлені» liep vol met restanten (37 testkoppelingen) — één knop ruimt ze op
  // (POST /api/owner/agents/opruimen: losgekoppelde/vervangen rijen + apparaten > 7 dagen niet verbonden; één journaalregel).
  const opruimen = () => acties.voerUit('opruimen', async () => {
    const r = await api.post('/api/owner/agents/opruimen', sessionBody());
    const n = Number(r.data?.aantal ?? 0), v = Number(r.data?.verouderd ?? 0);
    await naActie();
    return tr(`Прибрано: ${n}${v ? ` (з них давно не підключених пристроїв: ${v})` : ''}. Запис про це є в журналі.`, `Opgeruimd: ${n}${v ? ` (waarvan lang niet verbonden apparaten: ${v})` : ''}. Het journaal heeft er een regel van.`);
  }, ['Не вдалося прибрати', 'Opruimen mislukt']);

  const rij = (a: Agent) => {
    const browser = a.platform === 'browser';
    const t = overzicht?.toestemmingen[a.id];
    const aan = a.status === 'connected';
    const armed = !!a.enabled && !!a.armedUntil && a.armedUntil > Date.now();
    const sleutel = `dev:${a.id}`;
    return (
      <Rij key={a.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} data={{ device: a.id, soort: browser ? 'browser' : 'pc', online: aan ? '1' : '0' }}
        logo={<Logo kind={agentLogo(a)} size={30} label={a.name} />}
        titel={a.name}
        badges={<>
          <Badge toon={aan ? 'ok' : 'off'}><StatusDot state={aan ? 'on' : 'off'} label='' />{aan ? tr('в мережі', 'online') : tr('не в мережі', 'offline')}</Badge>
          {a.ruimte === 'technisch' ? <Badge toon='warn' data='ruimte-technisch'>{tr('технічний простір', 'technische ruimte')}</Badge> : null}
          {browser ? <Badge toon={!a.enabled ? 'off' : armed ? 'ok' : 'warn'} data='browser-ai'>{!a.enabled ? tr('ШІ вимкнено', 'AI uit') : armed ? (a.armedUntil && new Date(a.armedUntil).getUTCFullYear() >= 2999 ? tr('ШІ активний · без строку', 'AI actief · zonder termijn') : tr(`ШІ активний до ${exact(a.armedUntil)}`, `AI actief tot ${exact(a.armedUntil)}`)) : tr('ШІ: термін минув', 'AI: termijn verlopen')}</Badge> : null}
          {pending.some((p) => p.agentId === a.id) ? <Badge toon='warn'>{tr('чекає рішення', 'wacht op beslissing')}</Badge> : null}
          {ouder(a.version, doelVersie(a)) ? <Badge toon='warn' data='update'>{tr(`оновлення ${doelVersie(a)}`, `update ${doelVersie(a)}`)}</Badge> : null}
        </>}
        status={<>
          {browser ? tr('Розширення браузера', 'Browserextensie') : tr('Агент на ПК', 'Agent op pc')}{a.version ? ` ${a.version}` : ''}
          {' · '}{aan ? tr('зараз у мережі', 'nu online') : <>{tr('востаннє', 'laatst')} <Tijd ms={a.lastSeenAt} tr={tr} /></>}
          {' · '}{t?.actief ? tr(`дозволів: ${t.actief}, до ${datum(t.eersteEinde)}`, `toestemmingen: ${t.actief}, tot ${datum(t.eersteEinde)}`) : tr('без дозволів', 'zonder toestemmingen')}
        </>}
        acties={<>
          <Knop icoon={<Settings2 />} onClick={() => kies(item === sleutel ? '' : sleutel)} data={`instellen:${a.id}`}>{tr('Налаштувати', 'Instellen')}</Knop>
          <GevaarKnop tr={tr} sleutel={sleutel} label={tr('Відключити', 'Loskoppelen')} ja={tr('Так, відключити', 'Ja, loskoppelen')} acties={acties} icoon={<Trash2 />} klein
            vraag={browser ? tr('Токен розширення стане недійсним, ШІ більше не бачитиме ваші сторінки.', 'Het token van de extensie wordt ongeldig; de AI ziet uw pagina\'s niet meer.') : tr('Токен агента стане недійсним, ШІ більше не бачитиме цей пристрій.', 'Het agenttoken wordt ongeldig; de AI ziet dit apparaat niet meer.')}
            onJa={() => void loskoppelen(a)} />
        </>}>
        <Tech rijen={[
          ['ID', <code>{a.id}</code>],
          [tr('Тип', 'Soort'), browser ? tr('розширення браузера', 'browserextensie') : `${tr('агент на ПК', 'agent op pc')} · ${a.platform ?? '—'}`],
          [tr('Версія', 'Versie'), a.version ?? '—'],
          [tr('Установка (pairing)', 'Installatie (pairing)'), a.pairingId ? <code>{a.pairingId}</code> : '—'],
          [tr('Підключено', 'Gekoppeld'), exact(a.createdAt)],
          [tr('Востаннє в мережі', 'Laatst online'), a.lastSeenAt ? <>{exact(a.lastSeenAt)} ({relatief(a.lastSeenAt, tr)})</> : '—'],
          [tr('Токен діє до', 'Token geldig tot'), a.tokenExpiresAt ? <>{exact(a.tokenExpiresAt)} ({relatief(a.tokenExpiresAt, tr)})</> : '—'],
          browser ? [tr('ШІ увімкнено', 'AI aan'), a.enabled ? (a.armedUntil && new Date(a.armedUntil).getUTCFullYear() >= 2999 ? tr('так, доки ви не вимкнете', 'ja, tot u het uitzet') : tr(`так, до ${exact(a.armedUntil)}`, `ja, tot ${exact(a.armedUntil)}`)) : tr('ні', 'nee')] : null,
          browser ? [tr('Можливості (увімкнено)', 'Mogelijkheden (aan)'), <code>{(a.enabledCapabilities ?? []).join(' ') || '—'}</code>] : null,
          [tr('Без кліку', 'Zonder klik'), <code>{(a.policy?.autoApprove ?? []).join(' ') || '—'}</code>],
          a.capabilities && Object.keys(a.capabilities).length ? [tr('Повідомляє агент', 'Meldt de agent'), <details><summary>{tr('показати', 'tonen')}</summary><pre className='ag-ruw'>{JSON.stringify(a.capabilities, null, 2)}</pre></details>] : null,
        ]} />
        {updateKaart(a)}
        {pending.some((p) => p.agentId === a.id) ? <div className='ag-kaart ag-waarschuwing'><h4>{tr('Чекають вашого рішення', 'Wachten op uw beslissing')}</h4><PendingList tr={tr} pending={pending.filter((p) => p.agentId === a.id)} reload={reload} /></div> : null}
        {browser ? (
          <BrowserExtensionPanel tr={tr} part='agent' agentId={a.id} compact versie={versie}
            agentsExtern={agents as unknown as Parameters<typeof BrowserExtensionPanel>[0]['agentsExtern']} reloadExtern={naActie} />
        ) : (
          <>
            <DeviceDetail tr={tr} agent={a} last={last[a.id]} reload={naActie} compact />
            <div className='ag-kaart'><h4>{tr('Що ШІ дозволено на цьому пристрої', 'Wat de AI op dit apparaat mag')}</h4><AiToestemmingen tr={tr} agentId={a.id} platform='machine' versie={versie} /></div>
          </>
        )}
      </Rij>
    );
  };

  const rijWeg = (a: Losgekoppeld) => {
    const sleutel = `weg:${a.id}`;
    const r = REDEN[a.reason] ?? REDEN.user;
    return (
      <Rij key={a.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} gedimd data={{ device: a.id, status: 'losgekoppeld', reden: a.reason }}
        logo={<Logo kind={agentLogo(a)} size={30} label={a.name} />} titel={a.name}
        badges={<Badge toon={a.reason === 'repaired' ? 'info' : 'bad'} data='historie'>{tr(r[0], r[1])}</Badge>}
        status={<>{tr(`${r[0]} ${datum(a.revokedAt)}`, `${r[1]} op ${datum(a.revokedAt)}`)}{a.version ? ` · ${a.version}` : ''} · {tr(`підключено ${datum(a.createdAt)}`, `gekoppeld ${datum(a.createdAt)}`)}</>}>
        <Tech rijen={[
          ['ID', <code>{a.id}</code>], [tr('Тип', 'Soort'), a.platform ?? '—'], [tr('Версія', 'Versie'), a.version ?? '—'],
          [tr('Установка (pairing)', 'Installatie (pairing)'), a.pairingId ? <code>{a.pairingId}</code> : '—'],
          [tr('Підключено', 'Gekoppeld'), exact(a.createdAt)], [tr('Відключено', 'Losgekoppeld'), exact(a.revokedAt)], [tr('Востаннє в мережі', 'Laatst online'), exact(a.lastSeenAt)],
          [tr('Причина', 'Reden'), a.reason === 'repaired' ? tr('перевстановлено: нове підключення замінило це (старий токен відкликано)', 'opnieuw geïnstalleerd: een nieuwe koppeling verving deze (oud token ingetrokken)') : a.reason === 'blocked' ? tr('доступ ШІ заблоковано', 'AI-toegang geblokkeerd') : tr('відключено вами', 'door u losgekoppeld')],
        ]} />
      </Rij>
    );
  };

  // INTEG-001 (agpag2, 03.11.2026): één blok «Підключені пристрої» (.ag-blok) — naam, één zin, de knoppen in de kop, daaronder de
  // teller met sorteren, de lijst (of een lege staat met wat u kunt doen) en, ingeklapt, de geschiedenis.
  return (
    <div className='ag-tab ag2-blokken' data-tab-inhoud='apparaten'>
      <section className='ag-blok' data-ag-blok='apparaten' aria-labelledby='ag2-apparaten-kop'>
        <header className='ag-blok-kop'>
          <div className='ag2-kop-tekst'>
            <h3 className='ag-blok-titel' id='ag2-apparaten-kop'><span className='ag2-icoon' aria-hidden='true'><Monitor /></span>{tr('Підключені пристрої', 'Gekoppelde apparaten')}</h3>
            <p className='ag-blok-uitleg'>{tr('Комп’ютери з агентом і браузери з розширенням: натисніть рядок, щоб змінити дозволи або відключити пристрій.', 'Computers met de agent en browsers met de extensie: klik op een rij om de toestemmingen te wijzigen of het apparaat los te koppelen.')}</p>
          </div>
          <div className='ag-knoppen ag2-acties'>
            <Knop icoon={<Plus />} toon={item === 'koppelen' || !agents.length ? 'primary' : 'default'} onClick={() => kies(item === 'koppelen' ? '' : 'koppelen')} data='koppelen'>{tr('Підключити ПК', 'Pc koppelen')}</Knop>
            <Knop icoon={<Globe />} onClick={() => (naarExtensie ? naarExtensie() : kies('extensie'))} data='extensie'>{tr('Розширення браузера', 'Browserextensie')}</Knop>
          </div>
        </header>
        {item === 'koppelen' ? <div className='ag2-paneel is-open' data-paneel='koppelen'><PairCard tr={tr} reload={naActie} agents={agents} /></div> : null}
        {item === 'extensie' && !naarExtensie ? <div className='ag2-paneel is-open' data-paneel='extensie'><BrowserExtensionPanel tr={tr} part='install' ruimte='prive' agentsExtern={agents as unknown as Parameters<typeof BrowserExtensionPanel>[0]['agentsExtern']} reloadExtern={naActie} /></div> : null}
        <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
        {lijst.length ? (
          <>
            <div className='ag2-werkbalk'>
              <p className='ag2-samenvatting' data-apparaten-telling={agents.length}>{tr(`Підключено ${agents.length} · у мережі ${online}`, `${agents.length} gekoppeld · ${online} online`)}</p>
              {lijst.length > 1 ? (
                <label className='ag-veld ag-veld-inline'><span>{tr('Сортувати', 'Sorteren')}</span>
                  <select value={sorteer} onChange={(e) => setSorteer(e.target.value as typeof sorteer)} data-sorteer='apparaten'>
                    <option value='stand'>{tr('Спершу в мережі', 'Eerst online')}</option><option value='naam'>{tr('Назва', 'Naam')}</option><option value='datum'>{tr('Дата підключення', 'Datum van koppelen')}</option>
                  </select>
                </label>
              ) : null}
            </div>
            <ul className='ag-lijst' data-lijst='apparaten'>{lijst.map(rij)}</ul>
          </>
        ) : (
          <p className='ag-leeg' data-apparaten-leeg='1'>{tr('Ще жоден пристрій не підключено. Натисніть «Підключити ПК» або встановіть розширення браузера.', 'Nog geen apparaat gekoppeld. Klik «Pc koppelen» of installeer de browserextensie.')}</p>
        )}
        <Groep titel={tr('Відключені й перевстановлені (90 днів)', 'Losgekoppeld en opnieuw geïnstalleerd (90 dagen)')} aantal={weg.length} data='apparaten-historie'
          acties={<GevaarKnop tr={tr} sleutel='opruimen' icoon={<Trash2 />} acties={acties} onJa={() => void opruimen()} klein
            label={tr(`Прибрати відключені (${weg.length})`, `Losgekoppelde opruimen (${weg.length})`)}
            vraag={tr('Видалити всі відключені й перевстановлені записи, а також пристрої, не підключені понад 7 днів? Їхні дозволи й історія команд зникнуть; журнал залишиться.', 'Alle losgekoppelde en vervangen rijen verwijderen, plus apparaten die langer dan 7 dagen niet verbonden waren? Hun toestemmingen en opdrachtgeschiedenis verdwijnen; het journaal blijft.')}
            ja={tr('Так, прибрати', 'Ja, opruimen')} />}>
          {weg.map(rijWeg)}
        </Groep>
      </section>
    </div>
  );
}
