import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Globe, Trash2, X, FlaskConical, Settings2, RefreshCw, Power, KeyRound, Lock } from 'lucide-react';
import './ext-rechten.css';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import AiToestemmingen, { AiStopKnop } from './AiToestemmingen';
import { deriveExtState, extTekst, EXTENSION_ID_RE, sendToExtension, type ExtAction } from './extensie-toestand';
import { clearWelcome, doorgaanGevraagd, doorgaanKlaar, welcomePending } from './extensie-welkom-opslag';
import { agentLogo, Help, IconButton, Logo, StatusDot } from './mcp-ui';
import { foutTekst, isRechtFout } from './agenten/fouten';
import { HEARTBEAT_EVENT, heartbeatToestand } from './browser-agent-hartslag';
import ExtensionWizard from './ExtensieWizard';
import { EXT_MIN_VERSIE } from '../shared/extensie-update';
// HUB-07: oordeel en teksten van de zelftest komen van de site (verplichte controles, uk/nl, huidig tabblad).
import { zelftestWeergave, type Zelftest } from './extensie/zelftest';
// 0.5: standaard vergrendeld; ontgrendelen met passkey en de live status van de extensie (zonder herladen).
import ExtensieOntgrendeling, { intrekken as ontgrendelingIntrekken } from './extensie/ExtensieOntgrendeling';
import { combineer, slotVan, useExtensieLiveToestand, type Slot } from './extensie/extensie-live';
// 0.6: slot «як користувач» (step-up, geen technisch profiel nodig).
import ExtensiePrive, { toestemmingId } from './extensie/ExtensiePrive';
import './agenten-paneel.css';

type Tr = (uk: string, nl: string) => string;
type BrowserAgent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected'; lastSeenAt: number | null;
  policy: { autoApprove: string[]; enabled?: string[] }; enabled: boolean; armedUntil: number | null; enabledCapabilities?: string[];
  /** 0.6: slot van deze koppeling ('prive' | 'technisch'); oud/onbekend → prive. */
  ruimte?: unknown;
};
type Presence = 'checking' | 'present' | 'absent';
type Release = { version?: string; storeUrl?: string; installers?: string[]; crx?: { file: string; extensionId: string; version: string } | null };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const MIN_VERSION = EXT_MIN_VERSIE; // één bron: shared/extensie-update.ts
/** Keuzes voor «Як довго»: waarde (minuten, 'tot' of 'sessie'), uk, nl. Standaard: tot de eigenaar het zelf uitzet. */
const DUREN: Array<[string, string, string]> = [
  ['tot', 'доки я не вимкну', 'tot ik het uitzet'], ['60', '1 годину', '1 uur'], ['480', '8 годин', '8 uur'], ['1440', '1 день', '1 dag'],
  ['10080', '7 днів', '7 dagen'], ['43200', '30 днів', '30 dagen'], ['sessie', 'лише поки відкрита сторінка сайту', 'alleen zolang een pagina van de site open is'],
];
const FALLBACK_EXTENSION_ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
type Ping = { ok: boolean; version?: string; paired?: boolean; connected?: boolean; account?: 'ok' | 'mismatch' | 'unknown'; agentId?: string; caps?: number; blocked?: boolean };
type SelfTest = Zelftest;

const browserName = () => {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${name} (${navigator.platform || 'pc'})`;
};

/**
 * Browserextensie van Mijn Ruimte. `part` bepaalt wat er getoond wordt:
 *  - 'install': installeren, koppelen en de stappenlijst (voor de hele site);
 *  - 'koppel': alleen de koppelstap van één slot (HUB-05: de installatiehulp staat één keer op de pagina, bij «Як користувач»);
 *  - 'agent': de instellingen van één gekoppelde browser (`agentId`): activering en wat de AI daar mag doen;
 *  - 'all': beide (oude gedrag).
 * Na het installeren opent de extensie de pagina zelf (?extension=welcome) en loopt de gebruiker stap voor stap door de activering heen.
 */
export default function BrowserExtensionPanel({ tr, part = 'all', agentId, agentsExtern, reloadExtern, compact = false, versie = 0, ruimte, autoKoppel = false }: {
  tr: Tr; part?: 'install' | 'koppel' | 'agent' | 'all'; agentId?: string;
  /** Op /agents levert de pagina de agents (één poller voor de hele pagina) en herlaadt zelf; dan geen eigen polling hier. */
  agentsExtern?: BrowserAgent[]; reloadExtern?: () => Promise<void>; compact?: boolean; versie?: number;
  /** 0.6 (hub «Розширення браузера»): alleen dit slot — koppelen met deze ruimte, alleen koppelingen van dit slot. */
  ruimte?: Slot;
  /** `?koppel=prive|technisch`: meteen de koppelstap starten zodra de extensie er is (één keer). */
  autoKoppel?: boolean;
}) {
  const [eigenAgents, setAgents] = useState<BrowserAgent[]>([]);
  const vanSlot = (a: BrowserAgent) => !ruimte || slotVan(a.ruimte) === ruimte;
  const agents = (agentsExtern ? agentsExtern.filter((a) => a.platform === 'browser') : eigenAgents).filter(vanSlot);
  const [presence, setPresence] = useState<Presence>('checking');
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [, setDownloaded] = useState(false);
  const [release, setRelease] = useState<Release>({});
  const [welcome, setWelcome] = useState(() => welcomePending());
  const [extensionId, setExtensionId] = useState('');
  const [ping, setPing] = useState<Ping | null>(null);
  // U-04 (audit 19.10): geweigerde bevestiging (403) van de extensie in deze browser → kaart «ander account», bevestigingen gestopt.
  const [hb, setHb] = useState(() => heartbeatToestand());
  useEffect(() => { const f = () => setHb(heartbeatToestand()); window.addEventListener(HEARTBEAT_EVENT, f); return () => window.removeEventListener(HEARTBEAT_EVENT, f); }, []);
  const [grantInfo, setGrantInfo] = useState<{ active: number; blocked: boolean }>({ active: -1, blocked: false });
  const [test, setTest] = useState<SelfTest | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const liveT = useExtensieLiveToestand();

  const extern = !!agentsExtern;
  const reloadRef = useRef(reloadExtern); reloadRef.current = reloadExtern;
  const load = useCallback(async () => {
    if (extern) { await reloadRef.current?.(); return; }
    const res = await api.post('/api/owner/agents/list', sessionBody());
    setAgents(((res.data?.agents ?? []) as BrowserAgent[]).filter((a) => a.platform === 'browser'));
  }, [extern]);

  useEffect(() => { if (!extern) void load().catch(() => undefined); }, [load, extern]);
  useEffect(() => {
    if (extern) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [load, extern]);
  const onGrants = useCallback((active: number, blocked: boolean) => setGrantInfo((g) => (g.active === active && g.blocked === blocked ? g : { active, blocked })), []);
  useEffect(() => {
    if (part === 'agent') return;
    fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => setRelease(j as Release)).catch(() => undefined);
  }, [part]);

  // Is de extensie in deze browser aanwezig? De content script antwoordt op een ping met een "hello".
  useEffect(() => {
    if (part === 'agent') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || !event.data || event.data.mrExt !== true) return;
      if (event.data.type === 'hello') {
        setPresence('present'); setPaired(!!event.data.paired);
        if (typeof event.data.extensionId === 'string' && EXTENSION_ID_RE.test(event.data.extensionId)) setExtensionId(event.data.extensionId);
      }
    };
    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({ mrExtPing: true }, location.origin);
    ping();
    const retry = window.setInterval(ping, 3000);
    const giveUp = window.setTimeout(() => setPresence((p) => (p === 'checking' ? 'absent' : p)), 2500);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(retry); window.clearTimeout(giveUp); };
  }, [part]);

  // Versie, account en verbinding rechtstreeks bij de extensie (externally_connectable); id uit de "hello", anders uit de release.
  const extId = extensionId || (release.crx?.extensionId && EXTENSION_ID_RE.test(release.crx.extensionId) ? release.crx.extensionId : FALLBACK_EXTENSION_ID);
  const refreshPing = useCallback(async () => {
    const res = await sendToExtension<Ping>(extId, { type: 'PING' }, 4000);
    setPing(res && res.ok ? res : null);
    if (res && res.ok) { setPresence('present'); setPaired(!!res.paired); }
    return res;
  }, [extId]);
  useEffect(() => {
    void refreshPing();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshPing(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshPing]);

  // Bij de installatiehulp (na installeren of na inloggen): naar dit blok scrollen.
  useEffect(() => { if (welcome && part !== 'agent') rootRef.current?.scrollIntoView({ block: 'start' }); }, [welcome, part]);

  const agent = agents[agents.length - 1]; // de nieuwste koppeling: dat is de agent van de extensie in deze browser
  // 0.6: is DIT slot in deze browser gekoppeld? De extensie meldt het per slot; oudere extensies alleen «paired» (één koppeling).
  const slotLokaal = ruimte ? liveT.lokaal?.[ruimte] : undefined;
  const slotGekoppeld = ruimte ? (slotLokaal ? slotLokaal.gekoppeld === true : liveT.lokaal?.prive !== undefined ? false : paired && !!agent) : paired;
  const armed = (a: BrowserAgent) => a.enabled && !!a.armedUntil && a.armedUntil > Date.now();
  const allDone = !!agent && armed(agent);
  useEffect(() => { if (allDone && welcome) { clearWelcome(); } }, [allDone, welcome]);

  const connect = async () => {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      // 0.6: de ruimte bepaalt het slot (server: ai-ruimte-poort; technisch alleen met actief technisch profiel).
      const res = await api.post('/api/owner/agents/pairing-code', { ...sessionBody(), ...(ruimte ? { ruimte } : {}) });
      const code = String(res.data?.code || '');
      // Koppelen gebeurt in de service worker van de extensie (externally_connectable, alleen vanaf mcp.tarasevych.com):
      // het token komt nooit in deze pagina. De code is eenmalig en 5 minuten geldig.
      const answer = await sendToExtension<{ ok: boolean; reason?: string; error?: string }>(extId, { type: 'PAIR', code, name: browserName() }, 15000);
      const result = { ok: !!answer?.ok, reason: answer ? String(answer.reason || answer.error || '') : 'NO_EXTENSION' };
      void refreshPing();
      if (result.ok) { setPaired(true); setNotice(tr('Розширення підключено до вашого облікового запису. Оберіть, що йому дозволено, і ввімкніть його для ШІ у картці браузера.', 'De extensie is gekoppeld aan uw account. Kies op de kaart van de browser wat hij mag en zet hem aan voor de AI.')); await load(); }
      else setNotice(tr(`Не вдалося підключити (${result.reason}). Перевірте, що розширення встановлене й увімкнене, і спробуйте ще раз.`, `Koppelen mislukt (${result.reason}). Controleer of de extensie is geïnstalleerd en aan staat en probeer opnieuw.`));
    } catch (e) {
      const code = String((e as Error)?.message || '');
      setNotice(code.includes('AGENT_LIMIT') ? tr('Досягнуто ліміт пристроїв (10). Відкличте зайві.', 'Limiet van 10 apparaten bereikt. Trek oude apparaten in.') : isRechtFout(e) ? foutTekst(e, tr) : tr('Не вдалося отримати код підключення.', 'Koppelcode ophalen mislukt.'));
    }
    setBusy(false);
  };

  // Hoe lang «AI mag deze browser gebruiken» geldt, kiest de eigenaar: standaard tot hij het zelf uitzet.
  const [duur, setDuur] = useState<string>('tot');
  const duurWaarde = (d: string): number | 'sessie' | null => (d === 'tot' ? null : d === 'sessie' ? 'sessie' : Number(d));
  const setEnabled = async (a: BrowserAgent, on: boolean, keuze = duur) => {
    setBusy(true); setNotice('');
    try {
      await api.post(`/api/owner/agents/${a.id}/browser-enabled`, { ...sessionBody(), enabled: on, ...(on ? { duur: duurWaarde(keuze) } : {}) }); await load();
      const hoeLang = keuze === 'tot' ? tr('доки ви самі не вимкнете', 'tot u het zelf uitzet') : keuze === 'sessie' ? tr('поки в цьому браузері відкрита сторінка сайту', 'zolang er in deze browser een pagina van de site open is') : tr(`на ${DUREN.find((x) => x[0] === keuze)?.[1] ?? keuze}`, `voor ${DUREN.find((x) => x[0] === keuze)?.[2] ?? keuze}`);
      setNotice(on ? tr(`ШІ може користуватися браузером «${a.name}» ${hoeLang}.`, `De AI mag browser «${a.name}» gebruiken ${hoeLang}.`) : tr(`ШІ більше не користується браузером «${a.name}».`, `De AI gebruikt browser «${a.name}» niet meer.`));
    }
    catch (e) { setNotice(foutTekst(e, tr, ['Не вдалося змінити активацію', 'Activering wijzigen mislukt'])); }
    setBusy(false);
  };

  // «Увімкнути технічний профіль і підключити» (ExtensieTechAanbod, installatiehulp): na de activering met stap-op gaat de hulp zelf
  // verder — koppelen (stap 2) en aanzetten voor de AI (stap 3); stap 4 volgt vanzelf zodra de extensie verbindt. Elke stap één keer.
  const doorgaan = useRef({ koppel: false, aan: false });
  useEffect(() => {
    if (part === 'agent' || busy || !doorgaanGevraagd()) return;
    if (presence === 'present' && !paired && !doorgaan.current.koppel) { doorgaan.current.koppel = true; void connect(); return; }
    if (paired && agent && !agent.enabled && !doorgaan.current.aan) { doorgaan.current.aan = true; void setEnabled(agent, true); return; }
    if (agent && agent.enabled) doorgaanKlaar();
  }, [part, busy, presence, paired, agent]); // eslint-disable-line react-hooks/exhaustive-deps
  // ?koppel=prive (pop-up/zijpaneel van de extensie: «Додати доступ як користувач»): meteen koppelen zodra de extensie er is.
  const autoGedaan = useRef(false);
  useEffect(() => {
    if (!autoKoppel || autoGedaan.current || part === 'agent' || busy || presence !== 'present') return;
    autoGedaan.current = true;
    if (!slotGekoppeld) void connect();
  }, [autoKoppel, part, busy, presence, slotGekoppeld]); // eslint-disable-line react-hooks/exhaustive-deps

  // Knop 'Тест': zelftest in de extensie + wat de server ziet. Resultaat per controle, in gewone taal.
  const runTest = async () => {
    setBusy(true); setNotice(''); setTest(null);
    const res = await sendToExtension<SelfTest>(extId, { type: 'SELF_TEST' }, 10000);
    await load().catch(() => undefined);
    await refreshPing();
    setTest(res && res.checks ? res : { ok: false, checks: [{ id: 'extension', ok: false, detail: tr('розширення не відповідає', 'de extensie antwoordt niet') }] });
    setBusy(false);
  };
  const openOptions = () => { void sendToExtension(extId, { type: 'OPEN_OPTIONS' }); };

  const revoke = async (a: BrowserAgent) => {
    setConfirm(null); setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${a.id}/revoke`, sessionBody()); await load(); setNotice(tr('Браузер відключено. Розширення покаже «Не підключено».', 'Browser losgekoppeld. De extensie toont "Niet verbonden".')); }
    catch (e) { setNotice(foutTekst(e, tr, ['Не вдалося відкликати', 'Intrekken mislukt'])); }
    setBusy(false);
  };

  const lastSeen = (ms: number | null) => (ms ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZoneName: 'short' }).format(new Date(ms)) : '—');
  // HUB-05: tweede slot (technisch) → alleen de koppelstap, geen tweede installatiehulp.
  // U-04: de extensie in deze browser hoort bij een ANDER account (PING account=mismatch, of de server weigerde de bevestiging van een
  // agent die niet in uw lijst staat). Eén duidelijke kaart met de knop die de koppelcode-flow voor DIT account start.
  const anderAccount = !!ping?.ok && !!ping.paired && (ping.account === 'mismatch' || (!!hb.geweigerd && !!ping.agentId && hb.agentId === ping.agentId && !agents.some((a) => a.id === ping.agentId)));
  const mismatchKaart = anderAccount ? (
    <section className='hub-note is-warn ext-mismatch' role='status' data-ext-mismatch='1'>
      <p><b>{tr('Розширення прив’язане до іншого облікового запису', 'De extensie is aan een ander account gekoppeld')}</b>{ping?.agentId ? ` (${ping.agentId.slice(0, 8)}…)` : ''}. {tr('У цьому браузері воно працює від імені іншого акаунта, тому ваші сторінки воно не бачить, а підтвердження з цієї сторінки зупинено. Підключіть його до цього акаунта — попередня прив’язка буде замінена.', 'In deze browser werkt ze namens een ander account; uw pagina’s ziet ze dus niet, en de bevestigingen vanaf deze pagina zijn gestopt. Koppel ze aan dit account — de vorige koppeling wordt vervangen.')}</p>
      <div className='hub-actions'><IconButton tone='primary' icon={<RefreshCw />} disabled={busy || presence !== 'present'} onClick={() => void connect()}>{tr('Підключити до цього акаунта', 'Aan dit account koppelen')}</IconButton></div>
    </section>
  ) : null;
  const koppelBlock = (
    <section ref={rootRef} className='ext-koppel' data-ext-koppel={ruimte ?? 'prive'} data-ext-gekoppeld={slotGekoppeld ? '1' : '0'}>
      {mismatchKaart}
      {presence === 'absent' ? <p className='hub-note is-warn' role='status'>{tr('Розширення в цьому браузері не знайдено — встановіть його в розділі «Як користувач» вище.', 'De extensie is in deze browser niet gevonden — installeer ze in het blok «Als gebruiker» hierboven.')}</p>
        : slotGekoppeld ? <p className='hub-note' role='status'>{tr('Цей слот підключено в цьому браузері.', 'Dit slot is in deze browser gekoppeld.')}</p>
        : <div className='hub-actions'><IconButton icon={<RefreshCw />} disabled={busy || presence !== 'present'} onClick={() => void connect()}>{ruimte === 'technisch' ? tr('Підключити технічний слот', 'Technisch slot koppelen') : tr('Підключити', 'Koppelen')}</IconButton></div>}
      {notice ? <p className='hub-note' role='status' data-ext-notice='1'>{notice}</p> : null}
    </section>
  );
  const installBlock = (
    <section ref={rootRef}>
      {mismatchKaart}
      <ExtensionWizard
        tr={tr} presence={presence} paired={slotGekoppeld} hasAgent={!!agent} agentEnabled={!!agent && agent.enabled} agentArmed={allDone} release={release}
        busy={busy} notice={notice} welcome={welcome} onConnect={() => void connect()} onEnable={() => { if (agent) void setEnabled(agent, true); }}
        onDownloaded={() => setDownloaded(true)} onClose={() => { clearWelcome(); setWelcome(false); }}
      />
      {ruimte ? null : <ExtensieOntgrendeling tr={tr} />}
    </section>
  );

  // 0.6-server (ruimte per koppeling) → privé-koppelingen krijgen het slot «як користувач»; een oude server (0.5) kent alleen
  // de technische passkey-ontgrendeling.
  const ruimteBekend = !!liveT.antwoord?.agenten?.some((x) => x.ruimte !== undefined) || agents.some((x) => x.ruimte !== undefined);
  const agentBlock = (a: BrowserAgent) => {
    const state: 'on' | 'wait' | 'off' = !a.enabled ? 'off' : armed(a) ? 'on' : 'wait';
    const tot = a.armedUntil ? new Date(a.armedUntil).toLocaleTimeString(tr('uk-UA', 'nl-NL'), { hour: '2-digit', minute: '2-digit' }) : '';
    const totUit = !!a.armedUntil && new Date(a.armedUntil).getUTCFullYear() >= 2999;
    const stateText = state === 'on' ? (totUit ? tr('ШІ активний — доки ви не вимкнете', 'AI actief — tot u het uitzet') : tr(`ШІ активний до ${tot}`, `AI actief tot ${tot}`))
      : state === 'wait' ? tr('не активний: термін минув або (у режимі «лише поки відкрита сторінка») немає відкритої сторінки сайту в цьому браузері', 'niet actief: termijn verlopen of (in de stand «alleen zolang een pagina open is») geen open pagina van de site in deze browser') : tr('ШІ вимкнено', 'AI uit');
    return (
      <article key={a.id} className={`hub-agent mcp-browser${compact ? ' is-compact' : ''}`} data-browser-agents='1' data-device={a.id}>
        {compact ? null : <div className='hub-agent-head'>
          <Logo kind={agentLogo(a)} size={40} label={a.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{a.name}</h2>
            <span className='hub-meta'>{tr('востаннє', 'laatst gezien')}: {lastSeen(a.lastSeenAt)}</span>
          </div>
          <span className={`hub-pill ${a.status === 'connected' ? 'ok' : 'off'}`}><StatusDot state={a.status === 'connected' ? 'on' : 'off'} label={a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')} />{a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')}</span>
          <span className={`hub-pill ${state === 'on' ? 'ok' : state === 'wait' ? 'warn' : 'off'}`} data-browser-state={state}>{stateText}</span>
        </div>}

        {ruimteBekend ? null : <div className='hub-switch'>
          <span className='hub-switch-text'>
            <b>{tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')}
              <Help tr={tr} content={{ title: tr('Головний вимикач браузера', 'Hoofdschakelaar van de browser'), what: tr('Вмикає або вимикає весь доступ ШІ до цього браузера.', 'Zet alle toegang van de AI tot deze browser aan of uit.'), touches: tr(`Лише браузер «${a.name}», не інші браузери й не пристрої.`, `Alleen de browser «${a.name}», niet andere browsers of apparaten.`), on: tr('ШІ може лише те, що ви дозволили нижче, і стільки часу, скільки ви обрали в «Як довго».', 'De AI kan alleen wat u hieronder toestaat, en zo lang als u bij «Hoe lang» kiest.'), off: tr('Розширення нічого не виконує, навіть якщо окремі можливості нижче ввімкнені.', 'De extensie voert niets uit, ook niet als losse mogelijkheden hieronder aan staan.') }} /></b>
            <small>{tr('Діє стільки, скільки ви оберете нижче (типово — доки ви самі не вимкнете). Вимкнути можна будь-коли тут або кнопкою «Стоп».', 'Geldt zo lang als u hieronder kiest (standaard tot u het zelf uitzet). Uitzetten kan altijd hier of met de knop «Stop».')}</small>
          </span>
          <button type='button' className='hub-toggle' role='switch' aria-checked={a.enabled} aria-label={tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')} disabled={busy} onClick={() => void setEnabled(a, !a.enabled)} />
        </div>}
        {ruimteBekend ? null : <label className='hub-row start' style={{ gap: 8, flexWrap: 'wrap' }} data-browser-duur=''>
          <span>{tr('Як довго:', 'Hoe lang:')}</span>
          <select value={duur} disabled={busy} onChange={(e) => { setDuur(e.target.value); if (a.enabled) void setEnabled(a, true, e.target.value); }}>
            {DUREN.map(([v, uk, nl]) => <option key={v} value={v}>{tr(uk, nl)}</option>)}
          </select>
          {a.enabled && a.armedUntil ? <small>{a.armedUntil > Date.now() ? (new Date(a.armedUntil).getUTCFullYear() >= 2999 ? tr('діє, доки ви не вимкнете', 'geldt tot u het uitzet') : tr(`діє до ${new Date(a.armedUntil).toLocaleString('uk-UA')}`, `geldt tot ${new Date(a.armedUntil).toLocaleString('nl-NL')}`)) : tr('термін минув — увімкніть знову', 'termijn verlopen — zet opnieuw aan')}</small> : null}
        </label>}

        {(() => {
          // Toestand alleen met extensiegegevens als de extensie in DEZE browser bij deze agent hoort.
          const local = !!ping && ping.agentId === a.id;
          const live = combineer(liveT, a.id, Date.now(), slotVan(a.ruimte));
          const view = deriveExtState({
            presence: 'present', version: local ? ping?.version : MIN_VERSION, minVersion: MIN_VERSION,
            paired: true, online: a.status === 'connected', account: local ? (ping?.account ?? 'unknown') : 'ok', blocked: grantInfo.blocked,
            activeGrants: grantInfo.active < 0 ? 1 : grantInfo.active, browserEnabled: a.enabled, armed: armed(a),
            // 0.5: live staat (extensie + server). Nog niets geladen → 0.4-weergave tot het eerste antwoord er is.
            ontgrendeling: liveT.geladen ? live.staat : undefined,
          });
          const naarOntgrendelen = () => { const el = document.getElementById(`extensie-ontgrendeling-${a.id}`); el?.scrollIntoView({ block: 'start', behavior: 'smooth' }); el?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true }); };
          const btn: Partial<Record<ExtAction, ReactNode>> = {
            test: <IconButton key='test' icon={<FlaskConical />} disabled={busy || !local} title={local ? '' : tr('Тест працює в тому браузері, де встановлено це розширення', 'De test werkt in de browser waarin deze extensie zit')} onClick={() => void runTest()}>{tr('Тест', 'Test')}</IconButton>,
            stop: <AiStopKnop key='stop' tr={tr} onDone={() => void load()} />,
            enable: <IconButton key='enable' icon={<Power />} disabled={busy} onClick={() => void setEnabled(a, true)}>{tr('Увімкнути браузер', 'Browser aanzetten')}</IconButton>,
            repair: <IconButton key='repair' icon={<RefreshCw />} disabled={busy} onClick={() => void connect()}>{tr('Підключити знову', 'Opnieuw koppelen')}</IconButton>,
            relogin: <IconButton key='relogin' icon={<RefreshCw />} onClick={() => location.reload()}>{tr('Оновити сторінку після входу', 'Pagina verversen na aanmelden')}</IconButton>,
            unlock: <IconButton key='unlock' icon={<KeyRound />} disabled={busy} onClick={naarOntgrendelen}>{slotVan(a.ruimte) === 'technisch' || !ruimteBekend ? tr('Розблокувати з Passkey', 'Ontgrendelen met passkey') : tr('Відкрити доступ', 'Toegang openen')}</IconButton>,
            revoke: <IconButton key='revoke' tone='danger' icon={<Lock />} disabled={busy} onClick={() => { setBusy(true); void ontgrendelingIntrekken(a.id, live.ontgrendeling?.gid || undefined).then((r) => setNotice(r.ok ? tr('Доступ відкликано. Розширення заблоковане.', 'Toegang ingetrokken. De extensie is vergrendeld.') : tr(r.weigering.uk, r.weigering.nl))).finally(() => setBusy(false)); }}>{tr('Відкликати зараз', 'Nu intrekken')}</IconButton>,
            options: local ? <IconButton key='options' icon={<Settings2 />} onClick={openOptions}>{tr('Налаштування розширення', 'Instellingen van de extensie')}</IconButton> : undefined,
          };
          return (
            <div className='ext-state' data-ext-state={view.state} data-ext-reason={view.reason || ''}>
              <p className={`hub-note${view.state === 'enabled' || view.state === 'unlocked' || view.state === 'agent' ? '' : ' is-warn'}`} role='status'>{tr(...extTekst(view, slotVan(a.ruimte) === 'technisch' || !ruimteBekend ? 'technisch' : 'prive'))}</p>
              <div className='hub-actions'>{view.actions.map((x) => btn[x]).filter(Boolean)}</div>
              {test ? (() => { const z = zelftestWeergave(test, tr); return (
                <ul className='ext-test' aria-label={tr('Результат тесту', 'Testresultaat')} data-ext-test={z.ok ? 'ok' : 'fout'}>
                  <li><b>{z.ok ? tr('Тест пройдено', 'Test geslaagd') : tr('Тест не пройдено', 'Test niet geslaagd')}</b>{z.versie ? ` · ${z.versie}` : ''}{z.verplicht ? ` · ${tr(`обов’язкових: ${z.verplicht - z.mislukt}/${z.verplicht}`, `verplicht: ${z.verplicht - z.mislukt}/${z.verplicht}`)}` : ''}</li>
                  {z.regels.map((r) => <li key={r.id} className={r.ok ? 'ok' : r.soort === 'info' ? 'info' : 'bad'} data-ext-check={r.id} data-ext-check-soort={r.soort}>{r.ok ? '✓' : r.soort === 'info' ? '○' : '✗'} {r.tekst}{r.detail ? ` — ${r.detail}` : ''}{!r.ok && r.soort === 'info' ? ` (${tr('довідково', 'ter info')})` : ''}</li>)}
                </ul>
              ); })() : null}
            </div>
          );
        })()}
        {slotVan(a.ruimte) === 'technisch' || !ruimteBekend ? <ExtensieOntgrendeling tr={tr} agentId={a.id} /> : <ExtensiePrive tr={tr} agentId={a.id} />}
        {/* Zone E (22.10.2026): «Що може ШІ» staat nu op het ene scherm «Браузер і агенти» (matrix per agent + termijnen). De oude
            toestemmingen per browser blijven als erfenis werken en staan hier ingeklapt, tot de matrix één keer is opgeslagen. */}
        <div id={toestemmingId(a.id)} className='ext-toestemmingen' data-ext-toestemmingen={a.id}>
          <h4 tabIndex={-1}>{tr('Що може ШІ', 'Wat mag de AI')}</h4>
          <p className='hub-note'>{tr('Тепер це налаштовується на одному екрані: ', 'Dit stelt u nu op één scherm in: ')}<a href='#browser' data-ext-naar-browser={a.id}>{tr('Браузер і агенти', 'Browser en agenten')}</a>{tr(' — матриця «можливість × агент» для обох слотів і строк розблокування.', ' — de matrix «mogelijkheid × agent» voor beide sloten en de termijn van de ontgrendeling.')}</p>
          <details className='ext-toestemmingen-oud' data-ext-toestemmingen-oud={a.id}>
            <summary>{tr('Старі дозволи цього браузера (діють, доки матрицю не збережено)', 'Oude toestemmingen van deze browser (gelden tot de matrix is opgeslagen)')}</summary>
            <AiToestemmingen tr={tr} agentId={a.id} platform='browser' onChange={onGrants} versie={versie} />
          </details>
        </div>

        {compact ? null : confirm === a.id ? (
          <div className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження відключення', 'Bevestig loskoppelen')}>
            <span>{tr('Відключити цей браузер? ШІ більше не бачитиме ваші сторінки.', 'Deze browser loskoppelen? De AI ziet uw pagina\'s dan niet meer.')}</span>
            <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => void revoke(a)}>{tr('Так, відключити', 'Ja, loskoppelen')}</IconButton>
            <IconButton icon={<X />} onClick={() => setConfirm(null)}>{tr('Скасувати', 'Annuleren')}</IconButton>
          </div>
        ) : (
          <div className='hub-actions'><IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => setConfirm(a.id)}>{tr('Відключити браузер', 'Browser loskoppelen')}</IconButton></div>
        )}
        {notice ? <p className='hub-note' role='status' data-ext-notice='1'>{notice}</p> : null}
      </article>
    );
  };

  if (part === 'install') return installBlock;
  if (part === 'koppel') return koppelBlock;
  if (part === 'agent') {
    const a = agents.find((x) => x.id === agentId) ?? agents[0];
    return a ? agentBlock(a) : <div className='hub-empty'><Globe aria-hidden='true' /><span>{tr('Цей браузер не знайдено.', 'Deze browser is niet gevonden.')}</span></div>;
  }
  return (
    <div className='hub-main'>
      {installBlock}
      <div data-browser-agents={String(agents.length)}>{agents.length ? agents.map(agentBlock) : <div className='hub-empty'><Globe aria-hidden='true' /><span>{tr('Ще жоден браузер не підключений.', 'Er is nog geen browser gekoppeld.')}</span></div>}</div>
    </div>
  );
}
