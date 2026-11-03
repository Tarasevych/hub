import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Bell, Bot, Globe, KeyRound, LayoutDashboard, Plug, PlugZap, Plus, ShieldCheck, SlidersHorizontal, Wrench } from 'lucide-react';
import { api } from './platform/client';
import { agentLogo, Logo, Section, type Tr } from './mcp-ui';
import { ago, commandLabel, sessionBody, statusLabel, useAgentsData, useToolApprovals } from './agents-data';
import { DeviceDetail, PairCard, PendingList } from './DevicesView';
import McpConnectorPanel from './McpConnectorPanel';
import McpToolsPanel, { ToolApprovals } from './McpToolsPanel';
import BrowserExtensionPanel from './BrowserExtensionPanel';
import { welcomePending } from './extension-welcome-store';

type View = string; // 'overview' | 'claude' | 'tools' | 'pending' | 'extension' | 'doors' | 'pair' | `dev:${id}`

const readHash = (): View => { try { return decodeURIComponent(location.hash.replace(/^#/, '')) || ''; } catch { return ''; } };
const IDLE_MS = 24 * 60 * 60 * 1000;

/**
 * Beheerpagina mcp.*\/agents: links een zijbalk (de hele site en elk apparaat of elke browser met logo en status), rechts de bijbehorende blokken.
 * Een klik op een apparaat toont alleen dat apparaat; blokken zijn inklapbaar. De oude "deuren"-onderdelen (tokens) staan in een eigen weergave.
 */
export default function McpAgentsHub({ tr, doors }: { tr: Tr; doors: ReactNode }) {
  const { agents, pending, last, loaded, reload } = useAgentsData(tr);
  const { calls, reload: reloadCalls } = useToolApprovals();
  const toolPending = calls.filter((c) => c.status === 'pending_approval');
  const waiting = pending.length + toolPending.length;

  const [view, setView] = useState<View>(() => (welcomePending() ? 'extension' : readHash() || 'overview'));
  const go = useCallback((next: View) => {
    setView(next);
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(next)}`); } catch { /* geen history */ }
  }, []);
  useEffect(() => {
    const onHash = () => { const h = readHash(); if (h) setView(h); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Cijfers voor het overzicht: Claude-status en actieve hulpmiddelen.
  const [stats, setStats] = useState<{ grants: Array<{ lastUsedAt: number | null }>; active: number; total: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const [g, t] = await Promise.all([api.post('/api/owner/mcp-connector/grants', sessionBody()), api.post('/api/owner/mcp-connector/tools', sessionBody())]);
        const list = (t.data?.tools ?? []) as Array<{ mode: string }>;
        if (alive) setStats({ grants: g.data?.grants ?? [], active: list.filter((x) => x.mode !== 'off').length, total: list.length });
      } catch { /* later opnieuw */ }
    };
    void run();
    const timer = window.setInterval(() => { if (!document.hidden) void run(); }, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [view]);

  const pcs = agents.filter((a) => a.platform !== 'browser');
  const browsers = agents.filter((a) => a.platform === 'browser');
  const online = agents.filter((a) => a.status === 'connected').length;
  const claudeActive = !!stats?.grants.some((g) => g.lastUsedAt && Date.now() - g.lastUsedAt <= IDLE_MS);
  const claudeState: 'on' | 'wait' | 'off' = !stats?.grants.length ? 'off' : claudeActive ? 'on' : 'wait';

  const selectedAgent = view.startsWith('dev:') ? agents.find((a) => a.id === view.slice(4)) : undefined;
  const current: View = view.startsWith('dev:') && !selectedAgent && loaded ? 'overview' : view;

  const rail = useMemo(() => ([
    { id: 'overview', icon: <LayoutDashboard />, uk: 'Огляд', nl: 'Overzicht' },
    { id: 'claude', icon: <Logo kind='claude' size={22} label='Claude' />, uk: 'Claude', nl: 'Claude', sub: [claudeState === 'on' ? 'підключено' : claudeState === 'wait' ? 'простоює' : 'не підключено', claudeState === 'on' ? 'verbonden' : claudeState === 'wait' ? 'inactief' : 'niet verbonden'] },
    { id: 'tools', icon: <SlidersHorizontal />, uk: 'Інструменти й дозволи', nl: 'Hulpmiddelen en rechten' },
    { id: 'pending', icon: <ShieldCheck />, uk: 'Очікують рішення', nl: 'Wachten op beslissing', count: waiting },
    { id: 'extension', icon: <Globe />, uk: 'Розширення браузера', nl: 'Browserextensie' },
    { id: 'doors', icon: <KeyRound />, uk: 'Токени й двері', nl: 'Tokens en deuren' },
  ] as Array<{ id: string; icon: ReactNode; uk: string; nl: string; sub?: [string, string]; count?: number }>), [claudeState, waiting]);

  const railButton = (id: string, icon: ReactNode, title: string, sub?: string, count?: number) => (
    <button key={id} type='button' className='hub-rail-btn' aria-current={current === id} data-hub-view={id} onClick={() => go(id)}>
      {icon}
      <span className='hub-rail-text'><span>{title}</span>{sub ? <small>{sub}</small> : null}</span>
      {count ? <span className='hub-count' aria-label={tr(`${count} очікують`, `${count} wachten`)}>{count}</span> : null}
    </button>
  );

  const recent = Object.values(last).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  return (
    <div className='hub' data-hub-view-current={current}>
      <header className='hub-top'>
        <span className='mcp-page-icon' aria-hidden='true'><Bot /></span>
        <div className='mcp-page-text'>
          <h1>{tr('Агенти', 'Agenten')}</h1>
          <p className='mcp-lead'>{tr('Усе, що підключено до вашого сайту: Claude, ваші пристрої та браузери. Оберіть зліва, що налаштувати.', 'Alles wat met uw site verbonden is: Claude, uw apparaten en browsers. Kies links wat u wilt instellen.')}</p>
        </div>
      </header>

      <div className='hub-layout'>
        <nav className='hub-rail' aria-label={tr('Розділи сторінки', 'Onderdelen van de pagina')}>
          <div className='hub-rail-group'>
            <span className='hub-rail-title'>{tr('Сайт', 'Site')}</span>
            {rail.map((r) => railButton(r.id, r.icon, tr(r.uk, r.nl), r.sub ? tr(r.sub[0], r.sub[1]) : undefined, r.count))}
          </div>
          <div className='hub-rail-group'>
            <span className='hub-rail-title'>{tr('Пристрої й браузери', 'Apparaten en browsers')}</span>
            {[...pcs, ...browsers].map((a) => railButton(`dev:${a.id}`, <span style={{ position: 'relative', display: 'inline-flex' }}><Logo kind={agentLogo(a)} size={24} label={a.name} /></span>, a.name, a.status === 'connected' ? tr('в мережі', 'online') : tr('не в мережі', 'offline')))}
            <button type='button' className='hub-rail-btn hub-rail-add' aria-current={current === 'pair'} data-hub-view='pair' onClick={() => go('pair')}><Plus /><span className='hub-rail-text'><span>{tr('Підключити пристрій', 'Apparaat koppelen')}</span></span></button>
          </div>
        </nav>

        <main className='hub-main' aria-live='polite' data-hub-main={current}>
          {current === 'overview' ? (
            <>
              <div className='hub-grid'>
                <button type='button' className='hub-stat' onClick={() => go('claude')}>
                  <span className='hub-stat-icon' aria-hidden='true'><Logo kind='claude' size={26} label='Claude' /></span>
                  <div><strong>{claudeState === 'on' ? tr('Активний', 'Actief') : claudeState === 'wait' ? tr('Простоює', 'Inactief') : tr('Не підключено', 'Niet verbonden')}</strong><span>{tr('Claude', 'Claude')} · {stats ? `${stats.grants.length} ${tr('доступ(ів)', 'toegang(en)')}` : '…'}</span></div>
                </button>
                <button type='button' className='hub-stat' onClick={() => go(agents[0] ? `dev:${agents[0].id}` : 'pair')}>
                  <span className='hub-stat-icon' aria-hidden='true'><Plug /></span>
                  <div><strong>{online}/{agents.length}</strong><span>{tr('пристроїв і браузерів у мережі', 'apparaten en browsers online')}</span></div>
                </button>
                <button type='button' className='hub-stat' onClick={() => go('pending')}>
                  <span className='hub-stat-icon' aria-hidden='true'><ShieldCheck /></span>
                  <div><strong>{waiting}</strong><span>{tr('очікують вашого рішення', 'wachten op uw beslissing')}</span></div>
                </button>
                <button type='button' className='hub-stat' onClick={() => go('tools')}>
                  <span className='hub-stat-icon' aria-hidden='true'><Wrench /></span>
                  <div><strong>{stats ? `${stats.active}/${stats.total}` : '…'}</strong><span>{tr('інструментів увімкнено', 'hulpmiddelen aan')}</span></div>
                </button>
              </div>

              {waiting ? (
                <Section id='ov-pending' icon={<ShieldCheck />} title={tr('Потрібне ваше рішення', 'Uw beslissing is nodig')} tone='warn' badge={<span className='hub-pill warn'>{waiting}</span>}>
                  <PendingList tr={tr} pending={pending} reload={reload} compact />
                  <ToolApprovals tr={tr} calls={calls} reload={reloadCalls} />
                </Section>
              ) : null}

              <Section id='ov-recent' icon={<Activity />} title={tr('Остання активність', 'Recente activiteit')} subtitle={tr('Що ваші агенти робили останнім часом.', 'Wat uw agenten het laatst deden.')} defaultOpen>
                {recent.length ? (
                  <div className='hub-feed'>
                    {recent.map((c) => {
                      const a = agents.find((x) => x.id === c.agentId);
                      return (
                        <div key={c.id} className='hub-feed-item'>
                          {a ? <Logo kind={agentLogo(a)} size={24} label={a.name} /> : <Bell aria-hidden='true' />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className='hub-row start'><b>{commandLabel(c.type, tr)}</b><span className={`hub-pill ${c.status === 'succeeded' ? 'ok' : c.status === 'failed' || c.status === 'rejected' ? 'bad' : 'warn'}`}>{statusLabel(c.status, tr)}</span></div>
                            <small>{a?.name ?? ''} · {ago(c.createdAt, tr)}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className='hub-empty'><Activity aria-hidden='true' /><span>{tr('Поки що жодної дії. Коли Claude або агент щось зробить, це з’явиться тут і в сповіщеннях.', 'Nog geen acties. Doet Claude of een agent iets, dan verschijnt het hier en bij de meldingen.')}</span></div>}
              </Section>

              {loaded && !agents.length ? (
                <Section id='ov-first' icon={<PlugZap />} title={tr('Почніть із підключення', 'Begin met koppelen')} tone='ok'>
                  <PairCard tr={tr} reload={reload} agents={agents} />
                </Section>
              ) : null}
            </>
          ) : null}

          {current === 'claude' ? (
            <Section id='claude' icon={<Logo kind='claude' size={24} label='Claude' />} title={tr('Claude: підключення й доступи', 'Claude: verbinding en toegang')} subtitle={tr('Адреса конектора, стан і відкликання доступу.', 'Adres van de connector, status en toegang intrekken.')}>
              <McpConnectorPanel tr={tr} />
            </Section>
          ) : null}

          {current === 'tools' ? (
            <Section id='tools' icon={<SlidersHorizontal />} title={tr('Що Claude може робити', 'Wat Claude mag doen')} subtitle={tr('Перемикайте кожен інструмент: завжди, питати або вимкнено.', 'Zet elk hulpmiddel op altijd, vragen of uit.')}>
              <McpToolsPanel tr={tr} />
            </Section>
          ) : null}

          {current === 'pending' ? (
            <>
              <Section id='pending-devices' icon={<ShieldCheck />} title={tr('Дії на пристроях і в браузері', 'Acties op apparaten en in de browser')} badge={pending.length ? <span className='hub-pill warn'>{pending.length}</span> : undefined} tone={pending.length ? 'warn' : 'default'}>
                <PendingList tr={tr} pending={pending} reload={reload} />
              </Section>
              <Section id='pending-tools' icon={<Wrench />} title={tr('Запити Claude до сайту (пошта, календар, диск)', 'Verzoeken van Claude aan de site (mail, agenda, schijf)')} badge={toolPending.length ? <span className='hub-pill warn'>{toolPending.length}</span> : undefined} tone={toolPending.length ? 'warn' : 'default'}>
                <ToolApprovals tr={tr} calls={calls} reload={reloadCalls} />
              </Section>
            </>
          ) : null}

          {current === 'extension' ? (
            <Section id='extension' icon={<Globe />} title={tr('Розширення браузера', 'Browserextensie')} subtitle={tr('Встановлення, підключення й кроки активації.', 'Installeren, koppelen en de stappen voor activering.')}>
              <BrowserExtensionPanel tr={tr} part='install' />
            </Section>
          ) : null}

          {current === 'doors' ? (
            <Section id='doors' icon={<KeyRound />} title={tr('Токени й двері для агентів', 'Tokens en deuren voor agenten')} subtitle={tr('Окремі ключі для зовнішніх агентів і що їм дозволено робити із сайтом.', 'Aparte sleutels voor externe agenten en wat zij met de site mogen doen.')} defaultOpen>
              <div className='mcp-doors'>{doors}</div>
            </Section>
          ) : null}

          {current === 'pair' ? (
            <Section id='pair' icon={<Plus />} title={tr('Підключити пристрій', 'Apparaat koppelen')} subtitle={tr('ПК чи віртуальна машина через агента; браузер через розширення.', 'Pc of virtuele machine via de agent; browser via de extensie.')}>
              <PairCard tr={tr} reload={reload} agents={agents} />
              <div className='hub-card'><h3><Globe size={18} aria-hidden='true' />{tr('Браузер?', 'Een browser?')}</h3><p>{tr('Для браузера не потрібен код: встановіть розширення.', 'Voor een browser is geen code nodig: installeer de extensie.')}</p><div className='hub-actions'><button type='button' className='hub-btn' onClick={() => go('extension')}>{tr('До встановлення розширення', 'Naar de installatie van de extensie')}</button></div></div>
            </Section>
          ) : null}

          {selectedAgent ? (
            selectedAgent.platform === 'browser'
              ? <BrowserExtensionPanel tr={tr} part='agent' agentId={selectedAgent.id} />
              : (
                <>
                  <div className='hub-section'><div className='hub-section-body' style={{ paddingTop: 16 }}>
                    <DeviceDetail tr={tr} agent={selectedAgent} last={last[selectedAgent.id]} reload={reload} />
                  </div></div>
                  {pending.some((p) => p.agentId === selectedAgent.id) ? (
                    <Section id={`dev-${selectedAgent.id}-pending`} icon={<ShieldCheck />} title={tr('Очікують рішення на цьому пристрої', 'Wachten op beslissing op dit apparaat')} tone='warn'>
                      <PendingList tr={tr} pending={pending.filter((p) => p.agentId === selectedAgent.id)} reload={reload} />
                    </Section>
                  ) : null}
                </>
              )
          ) : null}
        </main>
      </div>
    </div>
  );
}
