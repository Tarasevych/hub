// mcp.*/agents in de stijl van GitHub Settings → Applications: tabbladen Огляд | Підключені ШІ | Пристрої й браузери |
// Токени | Журнал. Accountruimte = PRIVÉRUIMTE (shared/ai-ruimte.ts): alleen verbindingen, tokens en apparaten met ruimte 'prive'.
// Alles van de technische ruimte (serverdeur, technische connector, agenten op de server) staat op mcp.*/verbindingen (technisch
// profiel). Het ondertekende AI-beleid (sitebeheer) staat op admin → Доступ ШІ; het oude adres #beleid stuurt daarheen. Adresseerbaar via de hash (#ai, #apparaten/dev:<id>, …); oude adressen (#claude, #doors, #dev:<id>,
// #extension, …) worden omgezet. Eén poller voor apparaten/wachtende acties; de rest bij openen, na een actie en rustig.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Activity, ArrowRight, Globe, KeyRound, LayoutDashboard, Monitor, ShieldCheck, Sparkles } from 'lucide-react';
import { useAgentsData, useToolApprovals } from '../agents-data';
import type { Tr } from '../mcp-ui';
import { PairCard, PendingList } from '../DevicesView';
import { ToolApprovals } from '../McpToolsPanel';
import { AiStopKnop } from '../AiToestemmingen';
import { welcomePending } from '../extension-welcome-store';
import { inRuimte, isoMs, useDeurTokens, useJournaal, useOverzicht } from './data';
import Journaal, { JournaalLijst } from './Journaal';
import TabAi from './TabAi';
import TabApparaten from './TabApparaten';
import TabTokens from './TabTokens';
import { foutTekst } from './fouten';
import { canonicalNavigationUrl } from '../canonical-navigation';
import '../mcp-hub.css';
import './agenten.css';

export type TabId = 'overzicht' | 'ai' | 'apparaten' | 'tokens' | 'journaal';
const TABS: TabId[] = ['overzicht', 'ai', 'apparaten', 'tokens', 'journaal'];
/** Oud adres van het ondertekende AI-beleid (nu admin → Доступ ШІ, technisch profiel). */
export const isBeleidHash = (hash: string) => /^#beleid(\/|$)/.test(hash);
/** Oude hashes (zijbalk van vóór 2026-10) → nieuw tabblad[/item]. */
export const OUDE_HASH: Record<string, string> = { overview: 'overzicht', claude: 'ai', tools: 'ai/hulpmiddelen', pending: 'overzicht', extension: 'apparaten/extensie', doors: 'tokens', pair: 'apparaten/koppelen' };
export function leesHash(hash: string): { tab: TabId; item: string; oud: boolean } {
  let h = ''; try { h = decodeURIComponent(hash.replace(/^#/, '')); } catch { h = ''; }
  if (h.startsWith('dev:')) return { tab: 'apparaten', item: h, oud: true };
  if (OUDE_HASH[h]) { const [t, i = ''] = OUDE_HASH[h].split('/'); return { tab: t as TabId, item: i, oud: true }; }
  const [t, ...rest] = h.split('/');
  return TABS.includes(t as TabId) ? { tab: t as TabId, item: rest.join('/'), oud: false } : { tab: 'overzicht', item: '', oud: !!h };
}
const schrijf = (tab: TabId, item: string, push: boolean) => {
  const url = `${location.pathname}${location.search}#${tab}${item ? `/${encodeURIComponent(item).replace(/%3A/gi, ':')}` : ''}`;
  try { if (push) history.pushState(null, '', url); else history.replaceState(null, '', url); } catch { /* geen history */ }
};

export default function AgentenPagina({ tr }: { tr: Tr }) {
  const { agents: alleAgents, pending: allePending, last, loaded, reload } = useAgentsData(tr);
  const { calls, reload: reloadCalls } = useToolApprovals();
  const ov = useOverzicht();
  const tok = useDeurTokens();
  // Privéruimte: technische apparaten (server), verbindingen en tokens horen hier niet; ze staan op «Технічні підключення».
  const agents = useMemo(() => inRuimte(alleAgents, 'prive'), [alleAgents]);
  const pending = useMemo(() => allePending.filter((p) => agents.some((a) => a.id === p.agentId)), [allePending, agents]);
  const overzicht = useMemo(() => (ov.data ? { ...ov.data, oauth: inRuimte(ov.data.oauth, 'prive') } : null), [ov.data]);
  const tokens = useMemo(() => (tok.data ? inRuimte(tok.data.tokens, 'prive') : null), [tok.data]);
  const [versie, setVersie] = useState(0);
  const [plek, setPlek] = useState(() => {
    if (welcomePending()) return { tab: 'apparaten' as TabId, item: 'extensie' };
    const p = leesHash(location.hash);
    return { tab: p.tab, item: p.item };
  });
  // Oude adressen meteen omzetten (deep links blijven werken), en de hash volgen bij terug/vooruit. #beleid → admin.*/ai.
  useEffect(() => { if (isBeleidHash(location.hash)) { location.replace(canonicalNavigationUrl('admin', 'ai', tr('uk', 'nl') === 'uk' ? 'uk' : 'nl')); return; } schrijf(plek.tab, plek.item, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const volg = () => { const p = leesHash(location.hash); setPlek({ tab: p.tab, item: p.item }); if (p.oud) schrijf(p.tab, p.item, false); };
    window.addEventListener('hashchange', volg); window.addEventListener('popstate', volg);
    return () => { window.removeEventListener('hashchange', volg); window.removeEventListener('popstate', volg); };
  }, []);
  const ga = useCallback((tab: TabId, item = '') => { setPlek({ tab, item }); schrijf(tab, item, true); }, []);
  const kies = useCallback((item: string) => { setPlek((p) => { schrijf(p.tab, item, false); return { ...p, item }; }); }, []);

  /** Na elke actie: lijsten bijwerken zonder de pagina te herladen, en het journaal laten verversen. */
  const naActie = useCallback(async () => {
    await Promise.all([reload().catch(() => undefined), ov.laad(), tok.laad(), reloadCalls().catch(() => undefined)]);
    setVersie((v) => v + 1);
  }, [reload, ov.laad, tok.laad, reloadCalls]); // eslint-disable-line react-hooks/exhaustive-deps

  const nu = Date.now();
  const oauthActief = (overzicht?.oauth ?? []).filter((g) => g.status === 'active').length;
  const tokensActief = (tokens ?? []).filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu).length;
  const online = agents.filter((a) => a.status === 'connected').length;
  const toolPending = calls.filter((c) => c.status === 'pending_approval');
  const wachten = pending.length + toolPending.length;

  const onderwerpen = useMemo(() => [
    ...agents.map((a) => ({ id: a.id, naam: a.name, groep: tr('Пристрої й браузери', 'Apparaten en browsers') })),
    ...(overzicht?.losgekoppeld ?? []).map((a) => ({ id: a.id, naam: `${a.name} (${tr('відключено', 'losgekoppeld')} ${a.revokedAt ? new Date(a.revokedAt).toLocaleDateString() : ''})`, groep: tr('Пристрої й браузери', 'Apparaten en browsers') })),
    ...(overzicht?.oauth ?? []).map((g) => ({ id: g.id, naam: `${g.clientName} · ${new Date(g.createdAt).toLocaleDateString()}`, groep: tr('Підключені ШІ', 'Verbonden AI') })),
    ...(tokens ?? []).map((t) => ({ id: t.id, naam: `${t.name} (${t.prefix}…)`, groep: tr('Токени', 'Tokens') })),
  ], [agents, overzicht, tokens, tr]);

  const tabInfo: Record<TabId, { uk: string; nl: string; icoon: ReactElement; teller?: number }> = {
    overzicht: { uk: 'Огляд', nl: 'Overzicht', icoon: <LayoutDashboard />, teller: wachten || undefined },
    ai: { uk: 'Підключені ШІ', nl: 'Verbonden AI', icoon: <Sparkles />, teller: oauthActief + tokensActief },
    apparaten: { uk: 'Пристрої й браузери', nl: 'Apparaten en browsers', icoon: <Monitor />, teller: agents.length },
    tokens: { uk: 'Токени', nl: 'Tokens', icoon: <KeyRound />, teller: tokensActief },
    journaal: { uk: 'Журнал', nl: 'Logboek', icoon: <Activity /> },
  };
  const laadFout = ov.fout || tok.fout;

  return (
    <div className='ag' data-ag-tab={plek.tab}>
      <header className='ag-kop'>
        <div>
          <h1>{tr('Агенти', 'Agenten')}</h1>
          <p>{tr('Хто має доступ до вашого простору: ШІ, пристрої, браузери й токени. Жоден із них не керує сайтом — лише вашим. Усе можна відкликати; історія лишається в журналі.', 'Wie toegang heeft tot uw ruimte: AI, apparaten, browsers en tokens. Geen van hen beheert de site — alleen het uwe. Alles is in te trekken; de geschiedenis blijft in het logboek.')}</p>
        </div>
        <AiStopKnop tr={tr} onDone={() => void naActie()} />
      </header>

      <nav className='ag-tabs' role='tablist' aria-label={tr('Розділи', 'Onderdelen')}>
        {TABS.map((t) => (
          <a key={t} role='tab' href={`#${t}`} id={`ag-tab-${t}`} aria-selected={plek.tab === t} aria-controls='ag-paneel' data-tab={t} className='ag-tab-knop'
            onClick={(e) => { e.preventDefault(); ga(t); }}>
            {tabInfo[t].icoon}<span>{tr(tabInfo[t].uk, tabInfo[t].nl)}</span>{tabInfo[t].teller ? <span className={`ag-teller${t === 'overzicht' ? ' is-warn' : ''}`}>{tabInfo[t].teller}</span> : null}
          </a>
        ))}
      </nav>

      <section id='ag-paneel' role='tabpanel' aria-labelledby={`ag-tab-${plek.tab}`} className='ag-paneel'>
        {laadFout ? <p className='ag-melding ag-melding-fout' role='alert' data-ag-melding='laden'>{foutTekst(laadFout, tr, ['Не всі дані вдалося завантажити', 'Niet alle gegevens konden worden geladen'])}</p> : null}
        {plek.tab === 'overzicht' ? (
          <Overzicht tr={tr} ga={ga} versie={versie} cijfers={{ ai: oauthActief + tokensActief, online, totaal: agents.length, tokens: tokensActief, wachten }}
            wacht={wachten ? <>
              {pending.length ? <PendingList tr={tr} pending={pending} reload={naActie} compact /> : null}
              {toolPending.length ? <ToolApprovals tr={tr} calls={calls} reload={reloadCalls} /> : null}
            </> : null}
            leeg={loaded && !agents.length && !oauthActief ? <PairCard tr={tr} reload={naActie} agents={agents} /> : null} />
        ) : null}
        {plek.tab === 'ai' ? <TabAi tr={tr} overzicht={overzicht} tokens={tokens} naActie={naActie} item={plek.item} kies={kies} calls={calls} reloadCalls={reloadCalls} /> : null}
        {plek.tab === 'apparaten' ? <TabApparaten tr={tr} agents={agents} pending={pending} last={last} overzicht={overzicht} naActie={naActie} reload={reload} item={plek.item} kies={kies} versie={versie} /> : null}
        {plek.tab === 'tokens' ? <TabTokens tr={tr} data={tok.data ? { ...tok.data, tokens: tokens ?? [] } : null} naActie={naActie} item={plek.item} kies={kies} /> : null}
        {plek.tab === 'journaal' ? <Journaal tr={tr} onderwerpen={onderwerpen} versie={versie} actief /> : null}
      </section>
    </div>
  );
}

function Overzicht({ tr, ga, versie, cijfers, wacht, leeg }: { tr: Tr; ga: (t: TabId, item?: string) => void; versie: number; cijfers: { ai: number; online: number; totaal: number; tokens: number; wachten: number }; wacht: ReactElement | null; leeg: ReactElement | null }) {
  const filter = useMemo(() => ({ soort: '', onderwerp: '', limit: 10 }), []);
  const j = useJournaal(filter, true, versie);
  const kaart = (tab: TabId, icoon: ReactElement, getal: string, uk: string, nl: string, data: string) => (
    <button type='button' className='ag-stat' onClick={() => ga(tab)} data-stat={data}>
      <span className='ag-stat-icoon' aria-hidden='true'>{icoon}</span><strong>{getal}</strong><span>{tr(uk, nl)}</span>
    </button>
  );
  return (
    <div className='ag-tab' data-tab-inhoud='overzicht'>
      <div className='ag-stats'>
        {kaart('ai', <Sparkles />, String(cijfers.ai), 'ШІ підключено', 'AI verbonden', 'ai')}
        {kaart('apparaten', <Globe />, `${cijfers.online}/${cijfers.totaal}`, 'пристроїв у мережі', 'apparaten online', 'online')}
        {kaart('tokens', <KeyRound />, String(cijfers.tokens), 'активних токенів', 'actieve tokens', 'tokens')}
        {kaart('overzicht', <ShieldCheck />, String(cijfers.wachten), 'чекають рішення', 'wachten op beslissing', 'wachten')}
      </div>
      {wacht ? <section className='ag-kaart ag-waarschuwing' data-wacht={cijfers.wachten}><h3>{tr('Потрібне ваше рішення', 'Uw beslissing is nodig')}</h3>{wacht}</section> : null}
      {leeg ? <section className='ag-kaart'><h3>{tr('Почніть із підключення', 'Begin met koppelen')}</h3>{leeg}</section> : null}
      <section className='ag-kaart' data-recent='1'>
        <div className='ag-kaart-kop'><h3>{tr('Останні події', 'Recente gebeurtenissen')}</h3><a href='#journaal' className='ag-link' onClick={(e) => { e.preventDefault(); ga('journaal'); }}>{tr('Увесь журнал', 'Hele logboek')} <ArrowRight size={14} aria-hidden='true' /></a></div>
        {j.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(j.fout, tr, ['Не вдалося завантажити події', 'Gebeurtenissen laden mislukt'])}</p> : null}
        {j.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : <JournaalLijst tr={tr} items={j.items.slice(0, 10)} compact />}
      </section>
    </div>
  );
}
