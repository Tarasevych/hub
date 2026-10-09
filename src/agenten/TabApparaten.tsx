// «Пристрої й браузери»: pc-agents en browserextensies als GitHub-rijen. Dicht: naam, status, één regel; open: alle technische
// gegevens, wat zonder klik mag, de toestemmingen (presets, tabel, losse toestemming) en voor een browser de extensiestatus.
import { useState } from 'react';
import { Globe, Plus, Settings2, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody, type Agent, type LastCommand, type Pending } from '../agents-data';
import { agentLogo, Logo, StatusDot, type Tr } from '../mcp-ui';
import { DeviceDetail, PairCard, PendingList } from '../DevicesView';
import BrowserExtensionPanel from '../BrowserExtensionPanel';
import AiToestemmingen from '../AiToestemmingen';
import type { Losgekoppeld, Overzicht } from './data';
import { Badge, datum, exact, GevaarKnop, Groep, Knop, Melding, Rij, Tech, Tijd, relatief, useActies } from './ui';

const REDEN: Record<string, [string, string]> = { user: ['Відключено', 'Losgekoppeld'], repaired: ['Перевстановлено', 'Opnieuw geïnstalleerd'], blocked: ['Заблоковано', 'Geblokkeerd'] };

export default function TabApparaten({ tr, agents, pending, last, overzicht, naActie, reload, item, kies, versie }: {
  tr: Tr; agents: Agent[]; pending: Pending[]; last: Record<string, LastCommand>; overzicht: Overzicht | null; naActie: () => Promise<void>; reload: () => Promise<void>;
  item: string; kies: (id: string) => void; versie: number;
}) {
  const acties = useActies(tr);
  const [sorteer, setSorteer] = useState<'stand' | 'naam' | 'datum'>('stand');
  const online = agents.filter((a) => a.status === 'connected').length;
  const lijst = [...agents].sort((a, b) => sorteer === 'naam' ? a.name.localeCompare(b.name) : sorteer === 'datum' ? b.createdAt - a.createdAt : (a.status === b.status ? (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) : a.status === 'connected' ? -1 : 1));
  const weg = overzicht?.losgekoppeld ?? [];

  const loskoppelen = (a: Agent) => acties.voerUit(`dev:${a.id}`, async () => {
    const r = await api.post(`/api/owner/agents/${a.id}/revoke`, sessionBody());
    if (!r.data?.ok) throw Object.assign(new Error('AGENT_NOT_FOUND'), { status: 404 });
    if (item === `dev:${a.id}`) kies('');
    await naActie();
    return a.platform === 'browser'
      ? tr(`Браузер «${a.name}» відключено о ${exact(Date.now())}. Токен розширення більше не діє, розширення покаже «Не підключено»; рядок перенесено до «Відключені».`, `Browser «${a.name}» losgekoppeld om ${exact(Date.now())}. Het token van de extensie werkt niet meer en de extensie toont "Niet verbonden"; de rij staat nu bij "Losgekoppeld".`)
      : tr(`Пристрій «${a.name}» відключено о ${exact(Date.now())}. Його токен більше не діє, ШІ не бачить цей пристрій; рядок перенесено до «Відключені».`, `Apparaat «${a.name}» losgekoppeld om ${exact(Date.now())}. Het token werkt niet meer en de AI ziet dit apparaat niet; de rij staat nu bij "Losgekoppeld".`);
  }, ['Не вдалося відключити', 'Loskoppelen mislukt']);

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
          {browser ? <Badge toon={!a.enabled ? 'off' : armed ? 'ok' : 'warn'} data='browser-ai'>{!a.enabled ? tr('ШІ вимкнено', 'AI uit') : armed ? tr('ШІ активний', 'AI actief') : tr('ШІ чекає входу', 'AI wacht op aanmelding')}</Badge> : null}
          {pending.some((p) => p.agentId === a.id) ? <Badge toon='warn'>{tr('чекає рішення', 'wacht op beslissing')}</Badge> : null}
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
          browser ? [tr('ШІ увімкнено', 'AI aan'), a.enabled ? tr(`так, активний до ${exact(a.armedUntil)}`, `ja, actief tot ${exact(a.armedUntil)}`) : tr('ні', 'nee')] : null,
          browser ? [tr('Можливості (увімкнено)', 'Mogelijkheden (aan)'), <code>{(a.enabledCapabilities ?? []).join(' ') || '—'}</code>] : null,
          [tr('Без кліку', 'Zonder klik'), <code>{(a.policy?.autoApprove ?? []).join(' ') || '—'}</code>],
          a.capabilities && Object.keys(a.capabilities).length ? [tr('Повідомляє агент', 'Meldt de agent'), <details><summary>{tr('показати', 'tonen')}</summary><pre className='ag-ruw'>{JSON.stringify(a.capabilities, null, 2)}</pre></details>] : null,
        ]} />
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

  return (
    <div className='ag-tab' data-tab-inhoud='apparaten'>
      <div className='ag-lijstkop'>
        <p className='ag-lijstkop-tekst'>{agents.length ? tr(`Підключено ${agents.length} · у мережі ${online}`, `${agents.length} gekoppeld · ${online} online`) : tr('Ще жоден пристрій не підключено.', 'Nog geen apparaat gekoppeld.')}</p>
        <label className='ag-veld ag-veld-inline'><span>{tr('Сортувати', 'Sorteren')}</span>
          <select value={sorteer} onChange={(e) => setSorteer(e.target.value as typeof sorteer)} data-sorteer='apparaten'>
            <option value='stand'>{tr('Спершу в мережі', 'Eerst online')}</option><option value='naam'>{tr('Назва', 'Naam')}</option><option value='datum'>{tr('Дата підключення', 'Datum van koppelen')}</option>
          </select>
        </label>
        <Knop icoon={<Plus />} toon={item === 'koppelen' ? 'primary' : 'default'} onClick={() => kies(item === 'koppelen' ? '' : 'koppelen')} data='koppelen'>{tr('Підключити ПК', 'Pc koppelen')}</Knop>
        <Knop icoon={<Globe />} toon={item === 'extensie' ? 'primary' : 'default'} onClick={() => kies(item === 'extensie' ? '' : 'extensie')} data='extensie'>{tr('Розширення браузера', 'Browserextensie')}</Knop>
      </div>
      {item === 'koppelen' ? <div className='ag-kaart' data-paneel='koppelen'><PairCard tr={tr} reload={naActie} agents={agents} /></div> : null}
      {item === 'extensie' ? <div className='ag-kaart' data-paneel='extensie'><BrowserExtensionPanel tr={tr} part='install' agentsExtern={agents as unknown as Parameters<typeof BrowserExtensionPanel>[0]['agentsExtern']} reloadExtern={naActie} /></div> : null}
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      {lijst.length ? <ul className='ag-lijst' data-lijst='apparaten'>{lijst.map(rij)}</ul> : null}
      <Groep titel={tr('Відключені й перевстановлені (90 днів)', 'Losgekoppeld en opnieuw geïnstalleerd (90 dagen)')} aantal={weg.length} data='apparaten-historie'>{weg.map(rijWeg)}</Groep>
    </div>
  );
}
