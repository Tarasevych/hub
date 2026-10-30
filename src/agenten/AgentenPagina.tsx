// mcp.*/agents = de hub «Підключення ШІ» (19.10.2026, contract EXT-06 §4): ÉÉN plek voor alles over AI-toegang, in de stijl van
// GitHub Settings → Applications. Tabbladen (hash-id):
//   overzicht (Огляд, met de matrix «Що через який спосіб») | connectors (Конектори) | ai (Підключені ШІ, met de dosh «Підключення ШІ»
//   van ai.*/verbindingen) | extensie (Розширення браузера: «як користувач» + «технічний профіль») | apparaten (Пристрої) |
//   tokens (Токени) | toegang (Доступи) | technisch (Технічне = het vroegere mcp.*/verbindingen; alleen met actief technisch profiel) |
//   journaal (Журнал).
// Niets is verwijderd, alleen samengebracht: ai.*/verbindingen (#bord/#connectors/#tech) en mcp.*/verbindingen leiden hierheen.
// Accountruimte = PRIVÉRUIMTE (shared/ai-ruimte.ts) behalve in «Технічне» en de technische sectie van «Розширення браузера».
// Het ondertekende AI-beleid staat op admin → Доступ ШІ; het oude adres #beleid stuurt daarheen. Oude adressen (#claude, #doors,
// #dev:<id>, #extension, #apparaten/extensie, #extensie/…, #verbindingen, #dostupy) worden omgezet; een querydeel in de hash
// (#extensie?koppel=prive) blijft gelden. Eén poller voor apparaten/wachtende acties; de rest bij openen, na een actie en rustig.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Activity, ArrowRight, Globe, KeyRound, LayoutDashboard, ListChecks, Monitor, Network, Plug, Puzzle, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useAgentsData, useToolApprovals } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import { PairCard, PendingList } from '../ApparatenWeergave';
import { ToolApprovals } from '../McpHulpmiddelenPaneel';
import { AiStopKnop } from '../AiToestemmingen';
import { welcomePending } from '../extensie-welkom-opslag';
import { aiTeller, inRuimte, isoMs, useDeurTokens, useJournaal, useOverzicht, useV2Overzicht } from './gegevens';
import { standVan, type Stand } from '../../shared/connector-v2/stand';
import Journaal, { JournaalLijst } from './Journaal';
import TabAi from './TabAi';
import TabApparaten from './TabApparaten';
import TabTokens from './TabTokens';
import ConnectorsTab from '../connector-v2/ConnectorsTab';
import TabExtensie from './TabExtensie';
// Zone E (22.10.2026): «Браузер і агенти» — matrix slot × mogelijkheid × agent + termijnen, op één scherm (src/extensie/BrowserEnAgenten.tsx).
import BrowserEnAgenten from '../extensie/BrowserEnAgenten';
import TabExternMcp from './TabExternMcp';
import TabTechnisch from './TabTechnisch';
import TabToegang from './TabToegang';
import AgentBord from './AgentBord';
import HubMatrix from './HubMatrix';
import type { MatrixInvoer } from './matrix';
import { techActief, useTech } from '../tech/tech-opslag';
import { combineer, useExtensieLiveToestand, type ExtensieLive } from '../extensie/extensie-live';
import { ADMIN_HOSTS_TOEGESTAAN, PRIVE_HOSTS } from '../../shared/extensie-ontgrendeling';
import { RECHT_UITLEG, foutTekst, isRechtFout } from './fouten';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { isAgentSlug, V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import AgentPagina from './AgentPagina';
import BevestigingenPaneel from '../ai-bevestiging/BevestigingenPaneel';
import AgentLogo from './AgentLogo';
import '../mcp-hub.css';
import './agenten.css';
import TabsRij from '../ontwerp/TabsRij';
import { isBeleidHash, koppelVraag, leesHash, ontgrendelDoel, zichtbareTabs, type TabId } from './agenten-hash';
export { ALLEEN_TECHNISCH, OUDE_HASH, PLEKKEN, TABS, isBeleidHash, koppelVraag, leesHash, ontgrendelDoel, zichtbareTabs } from './agenten-hash';
export type { HashPlek, TabId } from './agenten-hash';

// «extern» (20.10.2026): de ANDERE richting — vreemde MCP-servers waar DEZE site zelf naartoe gaat
// (backend/mcp-klant/*). Hoort hier, want dit tabblad gaat over wat de AI via ons kan; er komt geen pagina bij.
// 'agent' (20.10.2026) = de plek van ÉÉN AI: #agent/<slug>. Hij staat NIET in de tabrij (er zijn zes agenten; een rij van
// zestien tabbladen is juist de rommel waarover de eigenaar klaagde). Je komt er vanaf «Конектори» en vanuit het overzicht.
/** '#agent/grok' → 'grok'; onbekende agent → null (dan blijft de hub op «Конектори»). */
export const agentUitPlek = (tab: TabId, item: string): AgentSlug | null => (tab === 'agent' && isAgentSlug(item) ? item : null);
const schrijf = (tab: TabId, item: string, push: boolean, vraag?: URLSearchParams) => {
  const q = vraag && [...vraag.keys()].length ? `?${vraag.toString()}` : '';
  const url = `${location.pathname}${location.search}#${tab}${item ? `/${encodeURIComponent(item).replace(/%3A/gi, ':')}` : ''}${q}`;
  try { if (push) history.pushState(null, '', url); else history.replaceState(null, '', url); } catch { /* geen history */ }
};

/** #extension-lokaal en #ruimte zijn ankers ín een sectie, geen tabbladnaam. Andere oude hashes (#claude) wel herschrijven. */
const ANKER_ID = new Set(['extension-lokaal', 'ruimte']);

/** Eén lange pagina: de zware inhoud van een sectie mount pas als die gekozen is of in beeld komt. */
function LuieSectie({ tab, actief, zien, children }: { tab: TabId; actief: boolean; zien: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(actief);
  useEffect(() => { if (actief || zien) setOpen(true); }, [actief, zien]);
  return (
    <section id={`ag-sectie-${tab}`} data-ag-sectie={tab} data-ag-lui={open ? 'open' : 'dicht'} className='ag-sectie' aria-labelledby={`ag-tab-${tab}`}>
      {open ? children : <div className='ag-lui-plaats' aria-hidden='true' />}
    </section>
  );
}

/** Gegevens voor de matrix «Що через який спосіб» uit wat de hub al heeft (+ de live status van de extensie). */
export function matrixInvoer(d: {
  techProfiel: boolean; oauthPrive: number; oauthTech: number; tokensPrive: number; tokensTech: number;
  pcTotaal: number; pcMetToestemming: number; prive: ExtensieLive; technisch: ExtensieLive; beleid: { priveAan?: boolean; technischAan?: boolean; lokaalAan?: boolean } | null;
}): MatrixInvoer {
  const open = (l: ExtensieLive) => (l.ontgrendeling && (l.staat === 'ontgrendeld' || l.staat === 'agent') ? l.ontgrendeling.domeinen : null);
  const lokaalOpen = [d.prive, d.technisch].filter((l) => l.ontgrendeling?.lokaal && open(l)).flatMap((l) => open(l) ?? []);
  return {
    techProfiel: d.techProfiel,
    connector: { prive: d.oauthPrive, technisch: d.oauthTech },
    tokens: { prive: d.tokensPrive, technisch: d.tokensTech },
    pc: { totaal: d.pcTotaal, metToestemming: d.pcMetToestemming },
    extPrive: { gekoppeld: d.prive.heeftBrowser, open: open(d.prive), toegestaan: d.prive.rechtPrive?.domeinen?.length ? d.prive.rechtPrive.domeinen : PRIVE_HOSTS, uit: d.beleid?.priveAan === false },
    extTech: d.techProfiel ? { gekoppeld: d.technisch.heeftBrowser, open: open(d.technisch), toegestaan: ADMIN_HOSTS_TOEGESTAAN, uit: d.beleid?.technischAan === false } : null,
    lokaal: { open: lokaalOpen.length ? lokaalOpen : null, mag: d.beleid?.lokaalAan !== false },
  };
}

export default function AgentenPagina({ tr }: { tr: Tr }) {
  const { agents: alleAgents, pending: allePending, last, loaded, reload, fout: agentsFout } = useAgentsData(tr);
  const { calls, reload: reloadCalls } = useToolApprovals();
  const ov = useOverzicht();
  const v2 = useV2Overzicht();
  const tok = useDeurTokens();
  const tech = useTech();
  const techAan = techActief(tech);
  const liveT = useExtensieLiveToestand();
  // Privéruimte: technische apparaten (server), verbindingen en tokens horen hier niet; ze staan op «Технічні підключення».
  const agents = useMemo(() => inRuimte(alleAgents, 'prive'), [alleAgents]);
  const pending = useMemo(() => allePending.filter((p) => agents.some((a) => a.id === p.agentId)), [allePending, agents]);
  const overzicht = useMemo(() => (ov.data ? { ...ov.data, oauth: inRuimte(ov.data.oauth, 'prive') } : null), [ov.data]);
  const tokens = useMemo(() => (tok.data ? inRuimte(tok.data.tokens, 'prive') : null), [tok.data]);
  const [versie, setVersie] = useState(0);
  const [inBeeld, setInBeeld] = useState<TabId | null>(null);
  const vastTot = useRef(0);
  const [plek, setPlek] = useState(() => {
    const p = leesHash(location.hash);
    const doel = ontgrendelDoel(typeof location !== 'undefined' ? location.search : '', p.vraag);
    // Розширення 0.7 відкриває /agents?ontgrendelen=prive|technisch#extensie — слот живе на «Браузер і агенти».
    if (doel === 'prive' || doel === 'technisch') return { tab: 'browser' as TabId, item: '', vraag: p.vraag, anker: '' };
    // Installatiehulp van de extensie (?extension=welcome) → tab «Розширення браузера».
    if (welcomePending()) return { tab: 'extensie' as TabId, item: '', vraag: p.vraag, anker: '' };
    return { tab: p.tab, item: p.item, vraag: p.vraag, anker: p.anker };
  });
  const koppel = koppelVraag(typeof location !== 'undefined' ? location.search : '', plek.vraag);
  const ontgrendel = ontgrendelDoel(typeof location !== 'undefined' ? location.search : '', plek.vraag);
  const openSlot: '' | 'prive' | 'technisch' = plek.tab === 'browser' && (ontgrendel === 'prive' || ontgrendel === 'technisch') ? ontgrendel : '';
  // Oude adressen meteen omzetten (deep links blijven werken), en de hash volgen bij terug/vooruit. #beleid → admin.*/ai.
  useEffect(() => { if (isBeleidHash(location.hash)) { location.replace(canonicalNavigationUrl('admin', 'ai', tr('uk', 'nl') === 'uk' ? 'uk' : 'nl')); return; } if (!ANKER_ID.has(plek.anker)) schrijf(plek.tab, plek.item, false, plek.vraag); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const volg = () => {
      const p = leesHash(location.hash);
      const doel = ontgrendelDoel(location.search, p.vraag);
      setInBeeld(null);
      vastTot.current = Date.now() + 800;
      // ?ontgrendelen=prive|technisch blijft de browsersectie, ook als de hash nog #extensie zegt.
      if (doel === 'prive' || doel === 'technisch') { setPlek({ tab: 'browser', item: '', vraag: p.vraag, anker: '' }); schrijf('browser', '', false, p.vraag); return; }
      setPlek({ tab: p.tab, item: p.item, vraag: p.vraag, anker: p.anker });
      if (p.oud && !ANKER_ID.has(p.anker)) schrijf(p.tab, p.item, false, p.vraag);
    };
    window.addEventListener('hashchange', volg); window.addEventListener('popstate', volg);
    return () => { window.removeEventListener('hashchange', volg); window.removeEventListener('popstate', volg); };
  }, []);
  const ga = useCallback((tab: TabId, item = '') => { setInBeeld(null); vastTot.current = Date.now() + 800; setPlek({ tab, item, vraag: new URLSearchParams(), anker: '' }); schrijf(tab, item, true); }, []);
  // Старий якір (#extension-lokaal, #ruimte) або обрана секція — гортаємо туди, щойно ледачий вміст змонтовано.
  useEffect(() => {
    if (plek.tab === 'agent') return;
    vastTot.current = Math.max(vastTot.current, Date.now() + 800);
    const id = ANKER_ID.has(plek.anker) ? plek.anker : `ag-sectie-${plek.tab}`;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      const el = document.getElementById(id);
      if (el) { try { el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch { /* geen DOM */ } window.clearInterval(t); }
      else if (n > 20) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [plek.tab, plek.anker]);
  const kies = useCallback((item: string) => { setPlek((p) => { schrijf(p.tab, item, false); return { ...p, item }; }); }, []);

  /** Na elke actie: lijsten bijwerken zonder de pagina te herladen, en het journaal laten verversen. */
  const naActie = useCallback(async () => {
    await Promise.all([reload().catch(() => undefined), ov.laad(), tok.laad(), v2.laad(), reloadCalls().catch(() => undefined)]);
    setVersie((v) => v + 1);
  }, [reload, ov.laad, tok.laad, v2.laad, reloadCalls]); // eslint-disable-line react-hooks/exhaustive-deps

  // De WARE stand per agent (v2 + oud /mcp + serverdeur; shared/connector-v2/stand.ts) voor de ingangen op het overzicht.
  const standen = useMemo(() => {
    const m = new Map<AgentSlug, Stand>();
    for (const a of v2.data?.agenten ?? []) m.set(a.slug, standVan({ v2: a.koppelingen.length, erfenis: a.erfenis?.length ?? 0, deur: a.deur === null ? null : (a.deur?.length ?? 0), wacht: !!a.voorkeur?.herverbinden }));
    return m;
  }, [v2.data]);
  const nu = Date.now();
  const oauthActief = (overzicht?.oauth ?? []).filter((g) => g.status === 'active').length;
  const tokensActief = (tokens ?? []).filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu).length;
  // HUB-02: één teller voor «ШІ підключено» (verschillende AI-clients), overal dezelfde.
  const aiVerbonden = aiTeller(overzicht?.oauth, tokens, nu);
  const toolPending = calls.filter((c) => c.status === 'pending_approval');
  const wachten = pending.length + toolPending.length;

  const onderwerpen = useMemo(() => [
    ...agents.map((a) => ({ id: a.id, naam: a.name, groep: tr('Пристрої й браузери', 'Apparaten en browsers') })),
    ...(overzicht?.losgekoppeld ?? []).map((a) => ({ id: a.id, naam: `${a.name} (${tr('відключено', 'losgekoppeld')} ${a.revokedAt ? new Date(a.revokedAt).toLocaleDateString() : ''})`, groep: tr('Пристрої й браузери', 'Apparaten en browsers') })),
    ...(overzicht?.oauth ?? []).map((g) => ({ id: g.id, naam: `${g.clientName} · ${new Date(g.createdAt).toLocaleDateString()}`, groep: tr('Підключені ШІ', 'Verbonden AI') })),
    ...(tokens ?? []).map((t) => ({ id: t.id, naam: `${t.name} (${t.prefix}…)`, groep: tr('Токени', 'Tokens') })),
  ], [agents, overzicht, tokens, tr]);

  // Technische ruimte (alleen voor de technische sectie van «Розширення браузера» en de matrix; lijsten blijven privé).
  const techBrowsers = useMemo(() => inRuimte(alleAgents, 'technisch').filter((a) => a.platform === 'browser'), [alleAgents]);
  // HUB-02: met een actief technisch profiel staan de technische pc-agenten (bv. de webserver) óók bij «Пристрої», met een badge;
  // zonder activering blijft de lijst privé (de server weigert hun gegevens dan toch).
  const apparaten = useMemo(() => (techAan ? [...agents, ...inRuimte(alleAgents, 'technisch').filter((a) => a.platform !== 'browser')] : agents), [agents, alleAgents, techAan]);
  const apparatenPending = useMemo(() => allePending.filter((p) => apparaten.some((a) => a.id === p.agentId)), [allePending, apparaten]);
  const online = apparaten.filter((a) => a.status === 'connected').length;
  const livePrive = useMemo(() => combineer(liveT, undefined, Date.now(), 'prive'), [liveT]);
  const liveTech = useMemo(() => combineer(liveT, undefined, Date.now(), 'technisch'), [liveT]);
  const techProfiel = livePrive.techProfiel ?? (tech.geladen ? !!tech.profiel : false);
  const matrix = useMemo(() => {
    const isActief = (x: { status?: string }) => x.status === 'active';
    const tokOk = (x: { revokedAt?: string; expiresAt?: string }) => !x.revokedAt && (isoMs(x.expiresAt) ?? 0) > Date.now();
    // Matrix uit echte gegevens: alle pc-agenten die dit account nu kan zien (privé, plus technisch met een technisch profiel).
    const pcs = (techProfiel ? alleAgents : agents).filter((a) => a.platform !== 'browser');
    return matrixInvoer({
      techProfiel,
      oauthPrive: oauthActief, oauthTech: inRuimte(ov.data?.oauth, 'technisch').filter(isActief).length,
      tokensPrive: tokensActief, tokensTech: inRuimte(tok.data?.tokens, 'technisch').filter(tokOk).length,
      pcTotaal: pcs.length, pcMetToestemming: pcs.filter((a) => (ov.data?.toestemmingen[a.id]?.actief ?? 0) > 0).length,
      prive: livePrive, technisch: liveTech, beleid: (liveT.antwoord as { beleid?: { priveAan?: boolean; technischAan?: boolean; lokaalAan?: boolean } } | null)?.beleid ?? null,
    });
  }, [techProfiel, oauthActief, tokensActief, ov.data, tok.data, agents, alleAgents, livePrive, liveTech, liveT.antwoord]);

  const tabInfo: Record<TabId, { uk: string; nl: string; icoon: ReactElement; teller?: number }> = {
    overzicht: { uk: 'Огляд', nl: 'Overzicht', icoon: <LayoutDashboard />, teller: wachten || undefined },
    connectors: { uk: 'Конектори', nl: 'Connectors', icoon: <Plug /> },
    ai: { uk: 'Підключені ШІ', nl: 'Verbonden AI', icoon: <Sparkles />, teller: aiVerbonden },
    extern: { uk: 'Зовнішні MCP', nl: 'Externe MCP', icoon: <Network /> },
    extensie: { uk: 'Розширення браузера', nl: 'Browserextensie', icoon: <Puzzle /> },
    browser: { uk: 'Браузер і агенти', nl: 'Browser en agenten', icoon: <Globe /> },
    apparaten: { uk: 'Пристрої', nl: 'Apparaten', icoon: <Monitor />, teller: apparaten.length },
    tokens: { uk: 'Токени', nl: 'Tokens', icoon: <KeyRound />, teller: tokensActief },
    toegang: { uk: 'Доступи', nl: 'Toegang', icoon: <ListChecks /> },
    agent: { uk: 'Один ШІ', nl: 'Eén AI', icoon: <Sparkles /> },
    technisch: { uk: 'Технічне', nl: 'Technisch', icoon: <Wrench /> },
    journaal: { uk: 'Журнал', nl: 'Logboek', icoon: <Activity /> },
  };
  const rij = zichtbareTabs(techAan);
  // #ruimte hoort bij «Технічне», ook als dat anker niet in de rij staat (profiel nog niet actief).
  const toon = useMemo(() => {
    const lijst = zichtbareTabs(techAan);
    if ((plek.tab === 'technisch' || plek.anker === 'ruimte') && !lijst.includes('technisch')) lijst.push('technisch');
    return lijst;
  }, [techAan, plek.tab, plek.anker]);
  const huidig: TabId = inBeeld ?? plek.tab;
  // Липка смуга підсвічує секцію в полі зору. Під час переходу за хешем лишається обрана секція (e2e: aria-selected).
  useEffect(() => {
    if (plek.tab === 'agent') return;
    const paneel = document.getElementById('ag-paneel');
    if (!paneel || typeof IntersectionObserver === 'undefined') return;
    const kies = () => {
      if (Date.now() < vastTot.current) return;
      const balk = document.querySelector('.ag-tabs-wrap')?.getBoundingClientRect().bottom ?? 0;
      const lijn = balk + 24;
      let gezien = '';
      for (const n of paneel.querySelectorAll<HTMLElement>('[data-ag-sectie]')) {
        const r = n.getBoundingClientRect();
        if (r.top <= lijn && r.bottom > lijn) { gezien = n.dataset.agSectie || ''; break; }
      }
      if (!gezien) return;
      const hashEl = document.getElementById(`ag-sectie-${plek.tab}`);
      if (hashEl && gezien !== plek.tab) {
        const r = hashEl.getBoundingClientRect();
        const zicht = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, balk);
        if (zicht > 80) return;
      }
      setInBeeld(gezien as TabId);
      if (gezien !== plek.tab && !plek.anker && plek.tab !== 'agent') schrijf(gezien as TabId, '', false);
    };
    const io = new IntersectionObserver(() => kies(), { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.25, 1] });
    paneel.querySelectorAll('[data-ag-sectie]').forEach((n) => io.observe(n));
    window.addEventListener('scroll', kies, { capture: true, passive: true });
    const later = window.setTimeout(kies, Math.max(0, vastTot.current - Date.now() + 40));
    return () => { io.disconnect(); window.removeEventListener('scroll', kies, true); window.clearTimeout(later); };
  }, [plek.tab, plek.anker, techAan]);
  const laadFout = ov.fout || tok.fout;
  // Audit 19.10 (U-03/MCP-01): geldige sessie zonder het recht «API-платформа» → één vriendelijke muur, geen tabbladen, geen «Стоп»,
  // geen pollers (gegevens.ts / agenten-gegevens.ts stoppen zelf bij API_RECHT_VEREIST). #extensie krijgt dezelfde uitleg i.p.v. «код підключення».
  const geenRecht = isRechtFout(ov.fout) || isRechtFout(tok.fout) || isRechtFout(agentsFout);
  if (geenRecht) {
    return (
      <div className='ag' data-ag-tab={plek.tab} data-ag-recht='ontbreekt'>
        <header className='ag-kop'><div><h1>{tr('Підключення ШІ', 'AI-koppelingen')}</h1></div></header>
        <section className='ag-kaart ag-muur' role='status' data-ag-melding='recht'>
          <h2>{tr('Доступ ШІ ще не увімкнено', 'AI-toegang nog niet ingeschakeld')}</h2>
          <p>{tr(RECHT_UITLEG[0], RECHT_UITLEG[1])}</p>
          {plek.tab === 'extensie' ? <p>{tr('Розширення браузера також потребує цього права: код підключення видається лише після того, як власник увімкне «API-платформу».', 'Ook de browserextensie heeft dit recht nodig: een koppelcode komt er pas als de eigenaar «API-platform» aanzet.')}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className='ag' data-ag-tab={plek.tab}>
      <header className='ag-kop'>
        <div>
          <h1>{tr('Підключення ШІ', 'AI-koppelingen')}</h1>
          <p>{tr('Усе про доступ ШІ в одному місці: способи підключення, конектори, розширення браузера, пристрої й токени. Ви бачите лише своє; усе можна відкликати, історія лишається в журналі.', 'Alles over AI-toegang op één plek: manieren van koppelen, connectors, de browserextensie, apparaten en tokens. U ziet alleen het uwe; alles is in te trekken, de geschiedenis blijft in het logboek.')}</p>
        </div>
        <AiStopKnop tr={tr} onDone={() => void naActie()} />
      </header>

      <div className='ag-ankers' data-ag-ankers='1'>
      <TabsRij navKlasse='ag-tabs' wrapKlasse='ag-tabs-wrap' label={tr('Розділи', 'Onderdelen')} lang={tr('uk', 'nl') as 'uk' | 'nl'}>
        {rij.map((t) => (
          <a key={t} role='tab' href={`#${t}`} id={`ag-tab-${t}`} aria-selected={huidig === t} aria-controls={`ag-sectie-${t}`} data-tab={t} className='ag-tab-knop'
            onClick={(e) => { e.preventDefault(); ga(t); }}>
            {tabInfo[t].icoon}<span>{tr(tabInfo[t].uk, tabInfo[t].nl)}</span>{tabInfo[t].teller ? <span className={`ag-teller${t === 'overzicht' ? ' is-warn' : ''}`}>{tabInfo[t].teller}</span> : null}
          </a>
        ))}
      </TabsRij>
      </div>

      <section id='ag-paneel' className='ag-paneel' aria-label={tr('Розділи підключення ШІ', 'Onderdelen van AI-koppelingen')}>
        {laadFout ? <p className='ag-melding ag-melding-fout' role='alert' data-ag-melding='laden'>{foutTekst(laadFout, tr, ['Не всі дані вдалося завантажити', 'Niet alle gegevens konden worden geladen'])}</p> : null}
        {plek.tab === 'agent' ? (agentUitPlek(plek.tab, plek.item)
          ? <AgentPagina tr={tr} slug={agentUitPlek(plek.tab, plek.item)!} terug={() => ga('connectors')} />
          : <ConnectorsTab tr={tr} />) : (
          <div className='ag-secties' data-ag-lang='1'>
            {toon.map((t) => (
              <LuieSectie key={t} tab={t} actief={plek.tab === t || plek.anker !== '' && ((plek.anker === 'ruimte' && t === 'technisch') || (plek.anker === 'extension-lokaal' && t === 'extensie'))} zien={inBeeld === t || toon[Math.max(0, toon.indexOf(huidig) + 1)] === t}>
                {t === 'overzicht' ? (
                  <Overzicht tr={tr} ga={ga} versie={versie} standen={standen} cijfers={{ ai: aiVerbonden, online, totaal: apparaten.length, tokens: tokensActief, wachten }}
                    wacht={wachten ? <>
                      {pending.length ? <PendingList tr={tr} pending={pending} reload={naActie} compact /> : null}
                      {toolPending.length ? <ToolApprovals tr={tr} calls={calls} reload={reloadCalls} /> : null}
                    </> : null}
                    leeg={loaded && !agents.length && !oauthActief ? <PairCard tr={tr} reload={naActie} agents={agents} /> : null}
                    matrix={<HubMatrix tr={tr} invoer={matrix} ga={(x) => ga(x as TabId)} />} />
                ) : null}
                {t === 'connectors' ? <ConnectorsTab tr={tr} /> : null}
                {t === 'ai' ? <>
                  <details className='ag-kaart ag-bord-uitklap' data-bord='1' open={!oauthActief && !tokensActief}>
                    <summary><Sparkles size={16} aria-hidden='true' /> {tr('Способи підключення ШІ (Claude, ChatGPT, Grok…)', 'Manieren om een AI te koppelen (Claude, ChatGPT, Grok…)')}</summary>
                    <AgentBord tr={tr} />
                  </details>
                  <TabAi tr={tr} overzicht={overzicht} tokens={tokens} naActie={naActie} item={plek.item} kies={kies} calls={calls} reloadCalls={reloadCalls} />
                </> : null}
                {t === 'extern' ? <TabExternMcp tr={tr} /> : null}
                {t === 'extensie' ? <TabExtensie tr={tr} agents={agents} techAgents={techAan ? techBrowsers : []} naActie={naActie} versie={versie} koppel={koppel} naarBrowser={() => ga('browser')} /> : null}
                {t === 'browser' ? <BrowserEnAgenten tr={tr} naarExtensie={() => ga('extensie')} openSlot={openSlot} /> : null}
                {t === 'apparaten' ? <TabApparaten tr={tr} agents={apparaten} pending={apparatenPending} last={last} overzicht={overzicht} naActie={naActie} reload={reload} item={plek.item} kies={kies} versie={versie} naarExtensie={() => ga('extensie')} /> : null}
                {t === 'tokens' ? <TabTokens tr={tr} data={tok.data ? { ...tok.data, tokens: tokens ?? [] } : null} naActie={naActie} item={plek.item} kies={kies} /> : null}
                {t === 'toegang' ? <TabToegang tr={tr} /> : null}
                {t === 'technisch' ? <TabTechnisch tr={tr} /> : null}
                {t === 'journaal' ? <Journaal tr={tr} onderwerpen={onderwerpen} versie={versie} actief={plek.tab === 'journaal' || inBeeld === 'journaal'} /> : null}
              </LuieSectie>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Overzicht({ tr, ga, versie, cijfers, wacht, leeg, matrix, standen }: { tr: Tr; ga: (t: TabId, item?: string) => void; versie: number; cijfers: { ai: number; online: number; totaal: number; tokens: number; wachten: number }; wacht: ReactElement | null; leeg: ReactElement | null; matrix: ReactElement; standen: Map<AgentSlug, Stand> }) {
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
      {/* 21.10.2026: het gezamenlijke centrum van «Запити ШІ на підтвердження» (alle AI, ruimte van dit tabblad). */}
      <BevestigingenPaneel tr={tr} />
      {/* «Один ШІ — одна вкладка»: vanaf hier ga je rechtstreeks naar de plek van één AI, met alles van die AI bij elkaar. */}
      <section className='ag-kaart' data-agent-ingangen='1'>
        <div className='ag-kaart-kop'><h3>{tr('Керування окремим ШІ', 'Eén AI beheren')}</h3><a href='#connectors' className='ag-link' onClick={(e) => { e.preventDefault(); ga('connectors'); }}>{tr('Усі конектори', 'Alle connectors')} <ArrowRight size={14} aria-hidden='true' /></a></div>
        <p className='hub-meta'>{tr('На сторінці одного ШІ разом: велика кнопка «Підключити» з кроками саме для цього клієнта, справжній стан, дозволи, простір, токени, колір і журнал саме цього ШІ.', 'Op de plek van één AI staat alles bij elkaar: de grote knop «Koppelen» met de stappen voor juist die client, de ware stand, de rechten, de ruimte, de tokens, de kleur en het logboek van juist die AI.')}</p>
        <ul className='ag-agent-ingangen'>
          {V2_AGENTEN.map((a) => {
            const st = standen.get(a.slug) ?? null;
            return (
              <li key={a.slug}><a className='ag-kaart ag-agent-ingang' href={`#agent/${a.slug}`} data-agent-ingang={a.slug} data-agent-ingang-stand={st?.code ?? 'onbekend'} onClick={(e) => { e.preventDefault(); ga('agent', a.slug); }}>
                <AgentLogo agent={a.slug} naam={a.naam} size={26} /><span className='ag-agent-ingang-tekst'><b>{a.naam}</b><small className={`v2b-stand ${!st ? 'is-onbekend' : st.code === 'wacht' ? 'is-wacht' : st.alleenOud ? 'is-oud' : st.verbonden ? 'is-aan' : 'is-uit'}`}><i aria-hidden='true' />{st ? tr(st.uk, st.nl) : tr('стан…', 'stand…')}</small></span>
              </a></li>
            );
          })}
        </ul>
      </section>
      {wacht ? <section className='ag-kaart ag-waarschuwing' data-wacht={cijfers.wachten}><h3>{tr('Потрібне ваше рішення', 'Uw beslissing is nodig')}</h3>{wacht}</section> : null}
      {leeg ? <section className='ag-kaart'><h3>{tr('Почніть із підключення', 'Begin met koppelen')}</h3>{leeg}</section> : null}
      {matrix}
      <section className='ag-kaart' data-recent='1'>
        <div className='ag-kaart-kop'><h3>{tr('Останні події', 'Recente gebeurtenissen')}</h3><a href='#journaal' className='ag-link' onClick={(e) => { e.preventDefault(); ga('journaal'); }}>{tr('Увесь журнал', 'Hele logboek')} <ArrowRight size={14} aria-hidden='true' /></a></div>
        {j.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(j.fout, tr, ['Не вдалося завантажити події', 'Gebeurtenissen laden mislukt'])}</p> : null}
        {j.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : <JournaalLijst tr={tr} items={j.items.slice(0, 10)} compact />}
      </section>
    </div>
  );
}
