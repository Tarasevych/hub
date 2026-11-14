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
//
// INTEG-001 (03.11.2026, «сторінка виглядає як сира таблиця»): спільна рамка сторінки. Кожен розділ — одна картка .ag-blok
// (.ag-blok-hoofd) з ОДНИМ заголовком: іконка, назва, лічильник, одне речення «що це і для чого» і кнопка «Згорнути». Вміст розділу
// цей заголовок не повторює. Стан «згорнуто» пам’ятає лише цей браузер (localStorage). Ледачий розділ монтується вже за 480 px до
// того, як з’явиться на екрані, тож порожніх смуг між розділами не видно. Контракт класів для всіх розділів —
// src/agenten/agenten-pagina.css (.ag-pagina .ag-blok .ag-blok-kop .ag-blok-titel .ag-blok-uitleg .ag-rij .ag-leeg .ag-knoppen).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { bijAfdrukVoorbereiding } from '../platform/afdruk';
import { Activity, AlertTriangle, ArrowRight, ChevronDown, GitMerge, Globe, KeyRound, LayoutDashboard, ListChecks, Monitor, Network, Plug, Puzzle, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useAgentsData, useToolApprovals } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import { PairCard, PendingList } from '../ApparatenWeergave';
import { ToolApprovals } from '../McpHulpmiddelenPaneel';
import { AiStopKnop } from '../AiToestemmingen';
import { welcomePending } from '../extensie-welkom-opslag';
import { aiTeller, inRuimte, isoMs, useDeurTokens, useJournaal, useOverzicht, useV2Overzicht } from './gegevens';
import Journaal, { JournaalLijst } from './Journaal';
import TabAi from './TabAi';
import TabApparaten from './TabApparaten';
import TabTokens from './TabTokens';
import ConnectorsTab from '../connector-v2/ConnectorsTab';
import TabExtensie from './TabExtensie';
// Zone E (22.10.2026): «Браузер і агенти» — matrix slot × mogelijkheid × agent + termijnen, op één scherm (src/extensie/BrowserEnAgenten.tsx).
import BrowserEnAgenten from '../extensie/BrowserEnAgenten';
import TabExternMcp from './TabExternMcp';
// ORCH-001 етап 3 (31.10.2026): «Координація» — правила, задачі, черга й передачі всіх ШІ-агентів; той самий конвеєр, що й scripts/orch.mjs.
import TabOrch from './TabOrch';
import TabTechnisch from './TabTechnisch';
import TabToegang from './TabToegang';
import HubMatrix from './HubMatrix';
import type { MatrixInvoer } from './matrix';
import { techActief, useTech } from '../tech/tech-opslag';
import { combineer, useExtensieLiveToestand, type ExtensieLive } from '../extensie/extensie-live';
import { ADMIN_HOSTS_TOEGESTAAN, PRIVE_HOSTS } from '../../shared/extensie-ontgrendeling';
import { RECHT_UITLEG, foutTekst, isRechtFout } from './fouten';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { isAgentSlug, v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { WEIGER_UITLEG } from '../../shared/ai-toegang-diagnose';
import AgentPagina from './AgentPagina';
import BevestigingenPaneel from '../ai-bevestiging/BevestigingenPaneel';
import '../mcp-hub.css';
import './agenten.css';
// INTEG-001: рамка сторінки й контракт класів — ПІСЛЯ agenten.css, щоб її правила (у межах .ag-pagina) мали останнє слово.
import './agenten-pagina.css';
import './agenten-kern-maquette.css';
import TabsRij from '../ontwerp/TabsRij';
import { TABS, isBeleidHash, koppelVraag, leesHash, ontgrendelDoel, zichtbareTabs, type TabId } from './agenten-hash';
export { ALLEEN_TECHNISCH, OUDE_HASH, PLEKKEN, TABS, isBeleidHash, koppelVraag, leesHash, ontgrendelDoel, zichtbareTabs } from './agenten-hash';
export type { HashPlek, TabId } from './agenten-hash';

// «extern» (20.10.2026): de ANDERE richting — vreemde MCP-servers waar DEZE site zelf naartoe gaat
// (backend/mcp-klant/*). Hoort hier, want dit tabblad gaat over wat de AI via ons kan; er komt geen pagina bij.
// 'agent' (20.10.2026) = de plek van ÉÉN AI: #agent/<slug>. Hij staat NIET in de tabrij (er zijn zes agenten; een rij van
// zestien tabbladen is juist de rommel waarover de eigenaar klaagde). Je komt er vanaf «Конектори» (de lijst met alle AI).
/** '#agent/grok' → 'grok'; onbekende agent → null (dan blijft de hub op «Конектори»). */
export const agentUitPlek = (tab: TabId, item: string): AgentSlug | null => (tab === 'agent' && isAgentSlug(item) ? item : null);
const schrijf = (tab: TabId, item: string, push: boolean, vraag?: URLSearchParams) => {
  const q = vraag && [...vraag.keys()].length ? `?${vraag.toString()}` : '';
  const url = `${location.pathname}${location.search}#${tab}${item ? `/${encodeURIComponent(item).replace(/%3A/gi, ':')}` : ''}${q}`;
  try { if (push) history.pushState(null, '', url); else history.replaceState(null, '', url); } catch { /* geen history */ }
};

/** #extension-lokaal en #ruimte zijn ankers ín een sectie, geen tabbladnaam. Andere oude hashes (#claude) wel herschrijven. */
const ANKER_ID = new Set(['extension-lokaal', 'ruimte']);

/** Eén zin per sectie: wat dit is en waarvoor het dient (uk, nl). Staat in de kop van elk blok (zie blokKop). */
const SECTIE_HINT: Partial<Record<TabId, [string, string]>> = {
  overzicht: ['Коротко про стан: скільки ШІ й пристроїв підключено, що чекає вашого рішення і що сталося останнім.', 'Kort de stand: hoeveel AI en apparaten gekoppeld zijn, wat op uw beslissing wacht en wat er laatst gebeurde.'],
  connectors: ['Кожен ШІ має власну адресу-конектор: тут видно, хто підключений, і звідси ви керуєте доступом одного ШІ або всіх одразу.', 'Elke AI heeft een eigen connectoradres: hier ziet u wie gekoppeld is en beheert u de toegang van één AI of van alle tegelijk.'],
  ai: ['Програми ШІ, яким ви вже дали доступ, і що кожна з них може; нижче — як підключити нову.', 'De AI-toepassingen die al toegang hebben en wat elk ervan mag; daaronder hoe u een nieuwe koppelt.'],
  extern: ['Чужі MCP-сервери, до яких підключається сам сайт, щоб передати їхні інструменти вашому ШІ.', 'Vreemde MCP-servers waarmee de site zelf verbindt, om hun hulpmiddelen aan uw AI door te geven.'],
  orch: ['Спільні правила, задачі й черга інтеграції для всіх ШІ-агентів, що працюють над сайтом.', 'Gezamenlijke regels, taken en integratiewachtrij voor alle AI-agenten die aan de site werken.'],
  extensie: ['Браузерне розширення: підключення, дозволи та технічний профіль.', 'De browserextensie: koppeling, rechten en het technische profiel.'],
  browser: ['Хто через який браузер і з яким доступом працює, і до коли.', 'Wie via welke browser werkt, met welke toegang en tot wanneer.'],
  apparaten: ['Комп’ютери та браузери, підключені до вашого простору.', 'Computers en browsers die aan uw ruimte gekoppeld zijn.'],
  tokens: ['Ключі, за якими ШІ або пристрій увійде. Відкликати можна будь-коли.', 'Sleutels waarmee een AI of apparaat inlogt. Intrekken kan altijd.'],
  toegang: ['Хто має який доступ до цієї сторінки та до ваших даних.', 'Wie welke toegang heeft tot deze pagina en tot uw gegevens.'],
  technisch: ['Технічні підключення сервера. Видно лише за наявності технічного профілю.', 'Technische verbindingen van de server. Alleen zichtbaar met een technisch profiel.'],
  journaal: ['Усе, що тут відбувається, по порядку. Нічого не видаляється.', 'Alles wat hier gebeurt, in volgorde. Niets wordt gewist.'],
};

/** Welke blokken de lezer heeft ingeklapt: alleen een gemak per browser (localStorage), nooit nodig om de pagina te tonen. */
const DICHT_SLEUTEL = 'mr.agenten.blokken-dicht';
function leesDicht(): Set<TabId> {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(DICHT_SLEUTEL) || '[]');
    return new Set(Array.isArray(r) ? r.filter((x): x is TabId => typeof x === 'string' && TABS.includes(x as TabId)) : []);
  } catch { return new Set(); }
}
function bewaarDicht(s: Set<TabId>) { try { localStorage.setItem(DICHT_SLEUTEL, JSON.stringify([...s])); } catch { /* geen opslag */ } }

/** De echte scrollcontainer van de pagina (de werkruimte van de omlijsting), anders het venster (null). <html>/<body> tellen
 *  als venster: met hen als expliciete root meldt de IntersectionObserver niets (gemeten in Chrome, harnas 03.11.2026). */
function scrollOuder(el: HTMLElement): Element | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    let y = '';
    try { y = getComputedStyle(p).overflowY; } catch { return null; }
    if ((y === 'auto' || y === 'scroll' || y === 'overlay') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Skelet zolang een blok nog niet gemount is: zichtbaar «bezig», nooit een lege vlakte. */
function BlokSkelet({ tr }: { tr: Tr }) {
  return (
    <div className='ag-lui-plaats ag-blok-skelet'>
      <span className='ag-skelet-regel' aria-hidden='true' /><span className='ag-skelet-regel is-kort' aria-hidden='true' /><span className='ag-skelet-regel' aria-hidden='true' />
      <small>{tr('Розділ завантажиться, щойно ви до нього дійдете…', 'Dit onderdeel laadt zodra u er bent…')}</small>
    </div>
  );
}

/** Eén lange pagina: de zware inhoud van een sectie mount pas als die gekozen is of (bijna) in beeld komt. De kop (icoon, titel,
 *  één zin, «Згорнути») staat altijd. INTEG-001: een eigen IntersectionObserver op de echte scrollcontainer mount het blok al
 *  480 px vóór het in beeld schuift; ingeklapt blijft het dicht (niets laden wat de lezer niet wil zien). */
function LuieSectie({ tab, actief, zien, kop, dicht, tr, children }: { tab: TabId; actief: boolean; zien: boolean; kop: ReactNode; dicht: boolean; tr: Tr; children: ReactNode }) {
  const [open, setOpen] = useState(actief);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => { if (actief || zien) setOpen(true); }, [actief, zien]);
  // INTEG-001 (print): Ctrl+P en Bestand → Afdrukken moeten ook de nog dichte secties openen, anders komen ze leeg op papier.
  useEffect(() => bijAfdrukVoorbereiding(() => flushSync(() => setOpen(true))), []);
  useEffect(() => {
    if (open || dicht) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setOpen(true); }, { root: scrollOuder(el), rootMargin: '0px 0px 480px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [open, dicht]);
  return (
    <section ref={ref} id={`ag-sectie-${tab}`} data-ag-sectie={tab} data-ag-lui={open ? 'open' : 'dicht'} data-ag-dicht={dicht ? '1' : undefined}
      className='ag-sectie ag-blok ag-blok-hoofd' aria-labelledby={`ag-blok-titel-${tab}`}>
      {kop}
      <div id={`ag-blok-inhoud-${tab}`} className='ag-blok-inhoud' hidden={dicht}>
        {open ? children : dicht ? null : <BlokSkelet tr={tr} />}
      </div>
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
  const [dicht, setDicht] = useState<Set<TabId>>(leesDicht);
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
  /** Blok in- of uitklappen (kop blijft altijd staan). */
  const klap = useCallback((t: TabId) => { setDicht((d) => { const n = new Set(d); if (n.has(t)) n.delete(t); else n.add(t); bewaarDicht(n); return n; }); }, []);
  // Wie naar een blok gaat (tabrij, hash, link), wil de inhoud zien: een ingeklapt doel gaat open.
  useEffect(() => {
    const doel: TabId | null = plek.anker === 'ruimte' ? 'technisch' : plek.anker === 'extension-lokaal' ? 'extensie' : plek.tab === 'agent' ? null : plek.tab;
    if (!doel) return;
    setDicht((d) => { if (!d.has(doel)) return d; const n = new Set(d); n.delete(doel); bewaarDicht(n); return n; });
  }, [plek.tab, plek.anker]);
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

  // MCP-ACCESS-001: AI's die nu niet alle toegekende hulpmiddelen zien (ware stand uit v2; shared/connector-v2/stand.ts).
  const geblokkeerdeAgenten = useMemo(() => (v2.data?.agenten ?? []).filter((a) => {
    const d = a.diagnose;
    if (!d || !d.connectionGranted.verbonden || !d.denialCode) return false;
    return (
      (d.connectionGranted.kanten.includes('beheer') && !d.effectiveTechnicalAccess)
      || d.pendingExpansion.wacht
      || (d.aiPolicyBlockedCount > 0 && d.effectiveGebruikerVisibleCount <= 1)
    );
  }), [v2.data]);
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
    orch: { uk: 'Координація', nl: 'Coördinatie', icoon: <GitMerge /> },
    extensie: { uk: 'Розширення браузера', nl: 'Browserextensie', icoon: <Puzzle /> },
    browser: { uk: 'Браузер і агенти', nl: 'Browser en agenten', icoon: <Globe /> },
    apparaten: { uk: 'Пристрої', nl: 'Apparaten', icoon: <Monitor />, teller: apparaten.length },
    tokens: { uk: 'Токени', nl: 'Tokens', icoon: <KeyRound />, teller: tokensActief },
    toegang: { uk: 'Доступи', nl: 'Toegang', icoon: <ListChecks /> },
    agent: { uk: 'Один ШІ', nl: 'Eén AI', icoon: <Sparkles /> },
    technisch: { uk: 'Технічне', nl: 'Technisch', icoon: <Wrench /> },
    journaal: { uk: 'Журнал', nl: 'Logboek', icoon: <Activity /> },
  };
  /** Vaste kop van elk blok: icoon, titel (+ teller), één zin en «Згорнути» — zodat elk blok zichtbaar begint en eindigt. */
  const blokKop = (t: TabId) => {
    const hint = SECTIE_HINT[t];
    const isDicht = dicht.has(t);
    const teller = tabInfo[t].teller;
    return (
      <header className='ag-blok-kop'>
        <span className='ag-blok-icoon' aria-hidden='true'>{tabInfo[t].icoon}</span>
        <div className='ag-blok-tekst'>
          <h2 className='ag-blok-titel' id={`ag-blok-titel-${t}`}>{tr(tabInfo[t].uk, tabInfo[t].nl)}{teller ? <span className={`ag-teller${t === 'overzicht' ? ' is-warn' : ''}`}>{teller}</span> : null}</h2>
          {hint ? <p className='ag-blok-uitleg'>{tr(hint[0], hint[1])}</p> : null}
        </div>
        <div className='ag-knoppen'>
          <button type='button' className='ag-knop ag-blok-klap' aria-expanded={!isDicht} aria-controls={`ag-blok-inhoud-${t}`} onClick={() => klap(t)} data-ag-klap={t}
            title={isDicht ? tr('Показати вміст цього розділу', 'De inhoud van dit onderdeel tonen') : tr('Сховати вміст цього розділу; заголовок лишається на місці', 'De inhoud van dit onderdeel verbergen; de kop blijft staan')}>
            <ChevronDown className='ag-chevron' aria-hidden='true' /><span>{isDicht ? tr('Розгорнути', 'Uitklappen') : tr('Згорнути', 'Inklappen')}</span>
          </button>
        </div>
      </header>
    );
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
        <div className='ag-pagina'>
          <header className='ag-kop ag-pagina-kop'>
            <span className='ag-pagina-icoon' aria-hidden='true'><Plug /></span>
            <div className='ag-pagina-tekst'><h1>{tr('Підключення ШІ', 'AI-koppelingen')}</h1></div>
          </header>
          <section className='ag-blok ag-muur' role='status' data-ag-melding='recht'>
            <header className='ag-blok-kop'><h2 className='ag-blok-titel'>{tr('Доступ ШІ ще не увімкнено', 'AI-toegang nog niet ingeschakeld')}</h2></header>
            <p>{tr(RECHT_UITLEG[0], RECHT_UITLEG[1])}</p>
            {plek.tab === 'extensie' ? <p>{tr('Розширення браузера також потребує цього права: код підключення видається лише після того, як власник увімкне «API-платформу».', 'Ook de browserextensie heeft dit recht nodig: een koppelcode komt er pas als de eigenaar «API-platform» aanzet.')}</p> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className='ag ag-pagina' data-ag-tab={plek.tab}>
      <header className='ag-kop ag-pagina-kop'>
        <span className='ag-pagina-icoon' aria-hidden='true'><Plug /></span>
        <div className='ag-pagina-tekst'>
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
        {plek.tab !== 'agent' && geblokkeerdeAgenten.length > 0 ? (
          <section className='ag-blok is-waarschuwing ag-blokkade-banner' role='status' data-ag-blokkade-banner={geblokkeerdeAgenten.length}>
            <header className='ag-blok-kop'>
              <h2 className='ag-blok-titel'><AlertTriangle aria-hidden='true' /> {tr('Підключені ШІ зараз бачать не всі надані інструменти', 'Gekoppelde AI-agents zien nu niet alle toegekende hulpmiddelen')}</h2>
              <p className='ag-blok-uitleg'>{tr('Нижче — що саме обмежує кожен ШІ; кнопка відкриває його сторінку, де це виправляється.', 'Hieronder wat elke AI precies beperkt; de knop opent zijn plek, waar u het oplost.')}</p>
            </header>
            <ul className='ag-blokkade-lijst'>
              {geblokkeerdeAgenten.map((a) => {
                const d = a.diagnose!;
                const code = d.denialCode!;
                const ukTaal = tr('uk', 'nl') === 'uk';
                return (
                  <li key={a.slug} data-ag-blokkade-agent={a.slug} data-ag-blokkade-code={code}>
                    <div className='ag-blokkade-tekst'>
                      <b>{v2Agent(a.slug).naam}</b>{' '}
                      <small className='hub-meta'>({tr(`доступно зараз: ${d.effectiveVisibleToolsCount} із ${d.connectionGranted.totaal}`, `nu beschikbaar: ${d.effectiveVisibleToolsCount} van ${d.connectionGranted.totaal}`)})</small>
                      <span> — {WEIGER_UITLEG[code][ukTaal ? 'uk' : 'nl']}</span>
                    </div>
                    <button type='button' className='ag-knop ag-knop-primary' data-ag-blokkade-open={a.slug} onClick={() => ga('agent', a.slug)}>
                      {tr(`Керувати ${v2Agent(a.slug).naam}`, `${v2Agent(a.slug).naam} openen`)} <ArrowRight size={14} aria-hidden='true' />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {plek.tab === 'agent' ? (agentUitPlek(plek.tab, plek.item)
          ? <AgentPagina tr={tr} slug={agentUitPlek(plek.tab, plek.item)!} terug={() => ga('connectors')} />
          : <ConnectorsTab tr={tr} />) : (
          <div className='ag-secties' data-ag-lang='1'>
            {toon.map((t) => (
              <LuieSectie key={t} tab={t} tr={tr} dicht={dicht.has(t)} actief={plek.tab === t || plek.anker !== '' && ((plek.anker === 'ruimte' && t === 'technisch') || (plek.anker === 'extension-lokaal' && t === 'extensie'))} zien={inBeeld === t || toon[Math.max(0, toon.indexOf(huidig) + 1)] === t} kop={blokKop(t)}>
                {t === 'overzicht' ? (
                  <Overzicht tr={tr} ga={ga} versie={versie} cijfers={{ ai: aiVerbonden, online, totaal: apparaten.length, tokens: tokensActief, wachten }}
                    wacht={wachten ? <>
                      {pending.length ? <PendingList tr={tr} pending={pending} reload={naActie} compact /> : null}
                      {toolPending.length ? <ToolApprovals tr={tr} calls={calls} reload={reloadCalls} /> : null}
                    </> : null}
                    leeg={loaded && !agents.length && !oauthActief ? <PairCard tr={tr} reload={naActie} agents={agents} /> : null}
                    matrix={<HubMatrix tr={tr} invoer={matrix} ga={(x) => ga(x as TabId)} />} />
                ) : null}
                {t === 'connectors' ? <ConnectorsTab tr={tr} ingebed /> : null}
                {t === 'ai' ? <TabAi tr={tr} overzicht={overzicht} tokens={tokens} naActie={naActie} item={plek.item} kies={kies} calls={calls} /> : null}
                {t === 'extern' ? <TabExternMcp tr={tr} /> : null}
                {t === 'orch' ? <TabOrch tr={tr} /> : null}
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

/** «Огляд» = het dashboard: vier cijfers, wat op u wacht, de AI-verzoeken, de laatste gebeurtenissen en de matrix.
 *  INTEG-001: de rij «Керування окремим ШІ» (zes AI-tegels) is weg — exact dezelfde zes AI met dezelfde ware stand en dezelfde
 *  weg naar #agent/<slug> staan één blok lager in «Конектори». Eén plek per ding, geen herhaling. */
function Overzicht({ tr, ga, versie, cijfers, wacht, leeg, matrix }: { tr: Tr; ga: (t: TabId, item?: string) => void; versie: number; cijfers: { ai: number; online: number; totaal: number; tokens: number; wachten: number }; wacht: ReactElement | null; leeg: ReactElement | null; matrix: ReactElement }) {
  const filter = useMemo(() => ({ soort: '', onderwerp: '', limit: 10 }), []);
  const j = useJournaal(filter, true, versie);
  /** «чекають рішення»: naar het blok met wat wacht, anders naar de AI-verzoeken (hetzelfde overzicht, geen ander tabblad). */
  const naarWacht = () => {
    const el = document.getElementById('ag-overzicht-wacht') ?? document.getElementById('ag-overzicht-bevestigen');
    if (el) { try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { /* geen DOM */ } } else ga('overzicht');
  };
  const kaart = (data: string, icoon: ReactElement, getal: string, uk: string, nl: string, onClick: () => void, toon?: 'warn') => (
    <button type='button' className={`ag-stat${toon ? ` is-${toon}` : ''}`} onClick={onClick} data-stat={data}>
      <span className='ag-stat-icoon' aria-hidden='true'>{icoon}</span><strong>{getal}</strong><span>{tr(uk, nl)}</span>
    </button>
  );
  return (
    <div className='ag-tab ag-overzicht' data-tab-inhoud='overzicht'>
      <div className='ag-stats'>
        {kaart('ai', <Sparkles />, String(cijfers.ai), 'ШІ підключено', 'AI verbonden', () => ga('ai'))}
        {kaart('online', <Globe />, `${cijfers.online}/${cijfers.totaal}`, 'пристроїв у мережі', 'apparaten online', () => ga('apparaten'))}
        {kaart('tokens', <KeyRound />, String(cijfers.tokens), 'активних токенів', 'actieve tokens', () => ga('tokens'))}
        {kaart('wachten', <ShieldCheck />, String(cijfers.wachten), 'чекають рішення', 'wachten op beslissing', naarWacht, cijfers.wachten ? 'warn' : undefined)}
      </div>
      {wacht ? (
        <section id='ag-overzicht-wacht' className='ag-blok is-waarschuwing' data-wacht={cijfers.wachten}>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'><AlertTriangle aria-hidden='true' /> {tr('Потрібне ваше рішення', 'Uw beslissing is nodig')} <span className='ag-teller is-warn'>{cijfers.wachten}</span></h3>
            <p className='ag-blok-uitleg'>{tr('Пристрій або ШІ чекає вашої відповіді: дозвольте або відхиліть кожен запит.', 'Een apparaat of AI wacht op uw antwoord: sta elk verzoek toe of weiger het.')}</p>
          </header>
          {wacht}
        </section>
      ) : null}
      {leeg ? (
        <section className='ag-blok' data-ag-start='1'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'>{tr('Почніть із підключення', 'Begin met koppelen')}</h3>
            <p className='ag-blok-uitleg'>{tr('Ще не підключено жодного пристрою чи ШІ. Підключіть перший — і тут з’явиться його стан.', 'Er is nog geen apparaat of AI gekoppeld. Koppel de eerste — dan verschijnt hier de stand.')}</p>
          </header>
          {leeg}
        </section>
      ) : null}
      <div className='ag-overzicht-raster'>
        {/* 21.10.2026: het gezamenlijke centrum van «Запити ШІ на підтвердження» (alle AI, ruimte van dit tabblad). */}
        <div id='ag-overzicht-bevestigen' className='ag-overzicht-cel'><BevestigingenPaneel tr={tr} /></div>
        <section className='ag-blok' data-recent='1'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'>{tr('Останні події', 'Recente gebeurtenissen')}</h3>
            <div className='ag-knoppen'><a href='#journaal' className='ag-link' onClick={(e) => { e.preventDefault(); ga('journaal'); }}>{tr('Увесь журнал', 'Hele logboek')} <ArrowRight size={14} aria-hidden='true' /></a></div>
            <p className='ag-blok-uitleg'>{tr('Десять останніх дій ШІ, пристроїв і ваших — нові зверху.', 'De tien laatste acties van AI, apparaten en uzelf — nieuwste bovenaan.')}</p>
          </header>
          {j.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(j.fout, tr, ['Не вдалося завантажити події', 'Gebeurtenissen laden mislukt'])}</p> : null}
          {j.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : <JournaalLijst tr={tr} items={j.items.slice(0, 10)} compact />}
        </section>
      </div>
      {matrix}
    </div>
  );
}
